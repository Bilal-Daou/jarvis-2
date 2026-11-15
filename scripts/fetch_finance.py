#!/usr/bin/env python3
"""
Jarvis Markets data job.

Runs on GitHub Actions (free, scheduled) and writes data/finance.json, which the
app reads from its own site, so the phone never hits CORS walls or needs API keys.

Sources (all free, no keys):
  quotes    Yahoo Finance via the yfinance package, two batched calls (fallbacks: Yahoo chart
            endpoint, Stooq daily CSV, CoinGecko for crypto)
  news      Yahoo Finance, CNBC, MarketWatch RSS + Google News RSS search
  calendar  Forex Factory weekly JSON (this week + next week)
  earnings  Nasdaq earnings calendar API (optional, skipped if blocked)

Every source is isolated: if one fails, the previous values from the old file
are kept, so a bad run never breaks the app. Standard library only, plus the optional
yfinance package (installed by the workflow; the job still runs without it).

Usage:
  python scripts/fetch_finance.py            # fetch live data
  python scripts/fetch_finance.py --sample   # write a clearly marked sample file
"""
import datetime as dt
import gzip
import html
import json
import math
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from email.utils import parsedate_to_datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "finance.json")
WATCH_FILE = os.path.join(ROOT, "data", "watchlist.json")

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

# symbol, display name, kind, stooq symbol
MARKETS = [
    ("^GSPC", "S&P 500", "index", "^spx"),
    ("^IXIC", "Nasdaq", "index", "^ndq"),
    ("^DJI", "Dow Jones", "index", "^dji"),
    ("^RUT", "Russell 2000", "index", None),
    ("^VIX", "VIX", "vol", None),
    ("^TNX", "10Y Yield", "rate", "10usy.b"),
    ("GC=F", "Gold", "commodity", "gc.f"),
    ("CL=F", "Oil (WTI)", "commodity", "cl.f"),
    ("EURUSD=X", "EUR/USD", "fx", "eurusd"),
    ("BTC-USD", "Bitcoin", "crypto", "btcusd"),
]

DEFAULT_WATCHLIST = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "TSLA", "META"]

# Broad list so most tickers Bilal adds by voice are already covered.
NAMES = {
    "AAPL": "Apple", "MSFT": "Microsoft", "NVDA": "Nvidia", "AMZN": "Amazon",
    "GOOGL": "Alphabet", "META": "Meta", "TSLA": "Tesla", "AVGO": "Broadcom",
    "BRK-B": "Berkshire Hathaway", "JPM": "JPMorgan Chase", "LLY": "Eli Lilly",
    "V": "Visa", "UNH": "UnitedHealth", "XOM": "Exxon Mobil", "MA": "Mastercard",
    "JNJ": "Johnson & Johnson", "PG": "Procter & Gamble", "HD": "Home Depot",
    "COST": "Costco", "ORCL": "Oracle", "NFLX": "Netflix", "AMD": "AMD",
    "CRM": "Salesforce", "BAC": "Bank of America", "WMT": "Walmart",
    "KO": "Coca-Cola", "PEP": "PepsiCo", "ADBE": "Adobe", "DIS": "Disney",
    "INTC": "Intel", "PLTR": "Palantir", "UBER": "Uber", "COIN": "Coinbase",
    "MSTR": "Strategy", "ARM": "Arm Holdings", "TSM": "TSMC", "ASML": "ASML",
    "BABA": "Alibaba", "NKE": "Nike", "MCD": "McDonald's", "SBUX": "Starbucks",
    "BA": "Boeing", "GS": "Goldman Sachs", "MS": "Morgan Stanley",
    "WFC": "Wells Fargo", "C": "Citigroup", "CVX": "Chevron", "PFE": "Pfizer",
    "MRK": "Merck", "ABBV": "AbbVie", "T": "AT&T", "VZ": "Verizon",
    "CSCO": "Cisco", "QCOM": "Qualcomm", "IBM": "IBM", "SHOP": "Shopify",
    "PYPL": "PayPal", "SNOW": "Snowflake", "CRWD": "CrowdStrike",
    "PANW": "Palo Alto Networks", "SMCI": "Super Micro", "MU": "Micron",
    "HOOD": "Robinhood", "RIVN": "Rivian", "NIO": "NIO", "SOFI": "SoFi",
    "SPY": "SPDR S&P 500 ETF", "QQQ": "Invesco QQQ", "DIA": "SPDR Dow ETF",
    "IWM": "iShares Russell 2000", "VOO": "Vanguard S&P 500", "VTI": "Vanguard Total Market",
    "GLD": "SPDR Gold", "SLV": "iShares Silver", "TLT": "20+ Yr Treasury ETF",
    "ARKK": "ARK Innovation", "ETH-USD": "Ethereum", "SOL-USD": "Solana",
    "XRP-USD": "XRP", "DOGE-USD": "Dogecoin",
}
UNIVERSE = list(NAMES.keys())

FEEDS = [
    ("CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114"),
    ("MarketWatch", "https://feeds.content.dowjones.io/public/rss/mw_topstories"),
    # Google News search limited to major outlets: an open "stock market" search is full of
    # auto-generated ticker spam. (Yahoo's own feeds 429 once yfinance has used the runner's IP.)
    ("Google News", "https://news.google.com/rss/search?q=" + urllib.parse.quote(
        '(stocks OR "Wall Street" OR "S&P 500" OR Nasdaq OR Fed) (site:reuters.com OR site:apnews.com OR '
        'site:bloomberg.com OR site:wsj.com OR site:ft.com OR site:barrons.com OR site:nytimes.com OR '
        'site:cnbc.com OR site:marketwatch.com OR site:axios.com) when:1d') + "&hl=en-US&gl=US&ceid=US:en"),
]

# Auto-generated or promotional "news" that should never reach the headlines.
JUNK_SOURCES = {"stock traders daily", "marketbeat", "ad hoc news", "defense world", "etf daily news",
                "the markets daily", "watchlist news", "modern readers", "stock titan", "simply wall st"}
JUNK_TITLE = re.compile(r"stock market analysis|^\(\w{1,6}(?::\w+)?\)|\b(?:shares (?:sold|bought|acquired) by|stake (?:raised|lowered|trimmed|boosted) by|position in .* (?:raised|lowered))\b", re.I)


def is_junk(it):
    return (it.get("source") or "").strip().lower() in JUNK_SOURCES or bool(JUNK_TITLE.search(it.get("title") or ""))

UTC = dt.timezone.utc


def now_utc():
    return dt.datetime.now(UTC)


def iso(d):
    return d.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- http
def http_get(url, headers=None, timeout=15, retries=2):
    h = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "en-US,en;q=0.9",
         "Accept-Encoding": "gzip"}
    if headers:
        h.update(headers)
    last = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
                if r.headers.get("Content-Encoding", "").lower() == "gzip" or data[:2] == b"\x1f\x8b":
                    data = gzip.decompress(data)
                return data
        except urllib.error.HTTPError as e:
            last = e
            if e.code in (400, 401, 403, 404):
                break  # will not get better by retrying
            time.sleep(1.5 * (attempt + 1))
        except Exception as e:  # timeouts, DNS, resets
            last = e
            time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"GET failed {url[:90]}: {last}")


# ---------------------------------------------------------------- numbers
def rnd(v, kind=None):
    if v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v))):
        return None
    a = abs(v)
    if kind == "fx":
        return round(v, 4)
    if a >= 1:
        return round(v, 2)
    if a >= 0.01:
        return round(v, 4)
    return round(v, 6)


def downsample(vals, n=60):
    vals = [v for v in vals if v is not None]
    if len(vals) <= n:
        return vals
    step = (len(vals) - 1) / (n - 1)
    return [vals[round(i * step)] for i in range(n)]


def build_quote(sym, name, kind, price, prev, t, day=None, d5=None, extra=None):
    price = float(price)
    prev = float(prev) if prev else None
    if prev is not None and not math.isfinite(prev):
        prev = None
    q = {"s": sym, "name": name, "kind": kind, "price": rnd(price, kind)}
    if prev and math.isfinite(price):
        q["prev"] = rnd(prev, kind)
        q["chg"] = rnd(price - prev, kind if kind == "fx" else None)
        q["pct"] = round((price - prev) / prev * 100, 2)
    if t:
        q["t"] = int(t)
    if day:
        q["day"] = [rnd(v, kind) for v in downsample(day, 64)]
    if d5:
        q["d5"] = [rnd(v, kind) for v in downsample(d5, 64)]
    if extra:
        q.update({k: v for k, v in extra.items() if v is not None})
    return q


# ---------------------------------------------------------------- quotes
def yahoo_chart(sym, rng, interval):
    enc = urllib.parse.quote(sym, safe="")
    err = None
    for host in ("query1", "query2"):
        try:
            raw = http_get(f"https://{host}.finance.yahoo.com/v8/finance/chart/{enc}?range={rng}&interval={interval}&includePrePost=false",
                           headers={"Accept": "application/json"}, retries=1)
            j = json.loads(raw)
            res = (j.get("chart") or {}).get("result")
            if not res:
                raise RuntimeError(f"no result: {(j.get('chart') or {}).get('error')}")
            return res[0]
        except Exception as e:
            err = e
    raise RuntimeError(f"yahoo {sym}: {err}")


def closes_of(res):
    try:
        cl = res["indicators"]["quote"][0].get("close") or []
    except (KeyError, IndexError):
        cl = []
    return [c for c in cl if isinstance(c, (int, float)) and not isinstance(c, bool) and math.isfinite(c)]


def sessions_of(res):
    """[(local_date, last_close)] for each trading day in a chart result, oldest first."""
    if not res:
        return []
    meta = res.get("meta") or {}
    off = meta.get("gmtoffset") or 0
    ts = res.get("timestamp") or []
    try:
        cl = res["indicators"]["quote"][0].get("close") or []
    except (KeyError, IndexError, TypeError):
        cl = []
    out = []
    for t, c in zip(ts, cl):
        if c is None or not isinstance(c, (int, float)) or isinstance(c, bool) or not math.isfinite(c):
            continue
        d = dt.datetime.fromtimestamp(int(t) + int(off), UTC).date()
        if out and out[-1][0] == d:
            out[-1] = (d, c)
        else:
            out.append((d, c))
    return out


def parse_yahoo(sym, name, kind, res_day, res_5d=None):
    meta = res_day.get("meta") or {}
    day = closes_of(res_day)
    price = meta.get("regularMarketPrice")
    if price is None and day:
        price = day[-1]
    if price is None:
        raise RuntimeError(f"yahoo {sym}: no price")
    # % change baseline. chartPreviousClose is the close just before the first bar of THIS chart,
    # so it always matches the session the bars (and regularMarketPrice) belong to. previousClose
    # is relative to Yahoo's *current* trading day, which before the open (or on a new day with no
    # bars yet) is the same session as the price, giving a fake 0.00%. So: with bars, use
    # chartPreviousClose; without bars, rebuild the last session's move from the 5-day chart.
    t = meta.get("regularMarketTime")
    if day:
        prev = meta.get("chartPreviousClose") or meta.get("previousClose")
    else:
        prev = None
        ss = sessions_of(res_5d)
        if len(ss) >= 2:
            price, prev = ss[-1][1], ss[-2][1]
        if prev is None:
            prev = meta.get("chartPreviousClose") or meta.get("previousClose")
    if isinstance(price, bool) or not isinstance(price, (int, float)) or not math.isfinite(price) or (price <= 0 and kind != "rate"):
        raise RuntimeError(f"yahoo {sym}: bad price {price!r}")
    nm = name or meta.get("shortName") or meta.get("longName") or sym
    extra = {
        "hi": rnd(meta.get("regularMarketDayHigh"), kind),
        "lo": rnd(meta.get("regularMarketDayLow"), kind),
        "h52": rnd(meta.get("fiftyTwoWeekHigh"), kind),
        "l52": rnd(meta.get("fiftyTwoWeekLow"), kind),
        "cur": meta.get("currency"),
        "src": "yahoo",
    }
    if day and extra["hi"] is None:
        extra["hi"], extra["lo"] = rnd(max(day), kind), rnd(min(day), kind)
    d5 = closes_of(res_5d) if res_5d else None
    return build_quote(sym, nm, kind, price, prev, t, day, d5, extra)


def to_stooq(sym):
    if sym.endswith("-USD"):
        return sym[:-4].lower() + "usd"
    if sym.startswith("^") or "=" in sym:
        return None
    return sym.lower().replace("-", ".") + ".us"


def stooq_quote(sym, name, kind, stooq_sym):
    s = stooq_sym or to_stooq(sym)
    if not s:
        raise RuntimeError(f"stooq: no mapping for {sym}")
    end = now_utc().date()
    start = end - dt.timedelta(days=14)
    url = f"https://stooq.com/q/d/l/?s={urllib.parse.quote(s)}&d1={start:%Y%m%d}&d2={end:%Y%m%d}&i=d"
    txt = http_get(url, retries=1).decode("utf-8", "replace").strip()
    lines = [ln for ln in txt.splitlines() if ln.strip()]
    if not lines or not lines[0].lower().startswith("date"):
        raise RuntimeError(f"stooq {sym}: unexpected reply")
    hdr = [h.strip().lower() for h in lines[0].split(",")]
    ci = hdr.index("close")
    rows = [ln.split(",") for ln in lines[1:]]
    closes = [float(r[ci]) for r in rows if len(r) > ci and r[ci] not in ("", "N/D")]
    if len(closes) < 2:
        raise RuntimeError(f"stooq {sym}: not enough rows")
    last_date = rows[-1][0]
    t = int(dt.datetime.strptime(last_date, "%Y-%m-%d").replace(hour=21, tzinfo=UTC).timestamp())
    return build_quote(sym, name or sym, kind, closes[-1], closes[-2], t, None, closes, {"src": "stooq"})


# After a few hard refusals (429 / gated replies) stop hammering a source for the rest of the run;
# a blocked source otherwise costs ~10 minutes of retries.
BLOCKED = {"yahoo": 0, "stooq": 0}
BLOCK_AFTER = 4


def _note_block(src, err):
    if src == "yahoo" and "429" in str(err) or src == "stooq" and "unexpected reply" in str(err):
        BLOCKED[src] += 1


def fetch_quote(item):
    sym, name, kind, stooq_sym, want5d = item
    try:
        if BLOCKED["yahoo"] >= BLOCK_AFTER:
            raise RuntimeError("yahoo skipped (rate limited this run)")
        res_day = yahoo_chart(sym, "1d", "5m")
        res_5d = None
        if want5d:
            try:
                res_5d = yahoo_chart(sym, "5d", "1h")
            except Exception as e:
                log("  5d failed", sym, e)
        return sym, parse_yahoo(sym, name, kind, res_day, res_5d), None
    except Exception as e:
        _note_block("yahoo", e)
        try:
            if BLOCKED["stooq"] >= BLOCK_AFTER:
                raise RuntimeError("stooq skipped (gated this run)")
            return sym, stooq_quote(sym, name, kind, stooq_sym), None
        except Exception as e2:
            _note_block("stooq", e2)
            return sym, None, f"{e} | {e2}"


# ---------------------------------------------------------------- quotes via yfinance (batched)
def _ts(x):
    """pandas Timestamp / datetime -> unix seconds (naive = UTC)."""
    d = x.to_pydatetime() if hasattr(x, "to_pydatetime") else x
    if d.tzinfo is None:
        d = d.replace(tzinfo=UTC)
    return int(d.timestamp())


def _num(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _frame(df, sym):
    """One ticker's rows from a yf.download(group_by='ticker') frame, NaN closes dropped."""
    if df is None or getattr(df, "empty", True):
        return None
    try:
        cols = df.columns
        if getattr(cols, "nlevels", 1) > 1:
            if sym not in cols.get_level_values(0):
                return None
            sub = df[sym]
        else:
            sub = df
        sub = sub.dropna(subset=["Close"])
    except Exception:
        return None
    return sub if len(sub) else None


def quote_from_frames(sym, name, kind, daily, intra):
    """Build a quote from a 1y daily frame (price, previous close, ranges) and a 5d/5m frame (charts).
    Daily rows give the official closes, so % change = last close vs the previous session's close,
    which is what Yahoo/Google show (and correct before the open: no partial row yet)."""
    if daily is None:
        return None
    rows = [(_ts(ix), _num(r["Close"]), _num(r.get("High")), _num(r.get("Low"))) for ix, r in daily.iterrows()]
    rows = [r for r in rows if r[1] is not None]
    dedup = []
    for r in rows:  # guard against a duplicated "today" row
        if dedup and dt.datetime.fromtimestamp(dedup[-1][0], UTC).date() == dt.datetime.fromtimestamp(r[0], UTC).date():
            dedup[-1] = r
        else:
            dedup.append(r)
    rows = dedup
    if not rows:
        return None
    price, prev = rows[-1][1], (rows[-2][1] if len(rows) >= 2 else None)
    if price <= 0 and kind != "rate":
        return None
    year = rows[-260:]
    highs = [r[2] for r in year if r[2] is not None]
    lows = [r[3] for r in year if r[3] is not None]
    extra = {"hi": rnd(rows[-1][2], kind), "lo": rnd(rows[-1][3], kind),
             "h52": rnd(max(highs), kind) if highs else None, "l52": rnd(min(lows), kind) if lows else None,
             "src": "yfinance"}
    day = d5 = None
    t = rows[-1][0] + 21 * 3600  # daily stamp is the session date; ~4 PM New York
    if intra is not None:
        bars = [(_ts(ix), _num(c)) for ix, c in intra["Close"].items()]
        bars = [b for b in bars if b[1] is not None]
        if bars:
            last_t = bars[-1][0]
            day = [c for ts_, c in bars if ts_ > last_t - 20 * 3600]   # the latest session only
            d5 = [c for _, c in bars]
            t = last_t + 300
    t = min(t, int(now_utc().timestamp()))
    return build_quote(sym, name or sym, kind, price, prev, t, day, d5, extra)


def yf_download(symbols, **kw):
    import yfinance as yf  # optional dependency
    return yf.download(symbols, group_by="ticker", auto_adjust=False, actions=False, threads=True,
                       progress=False, timeout=30, **kw)


def fetch_quotes_yf(items):
    """{sym: quote} for every symbol yfinance could price. Raises ImportError if not installed."""
    import yfinance  # noqa: F401  (fail fast when missing)
    syms = [it[0] for it in items]
    daily = yf_download(syms, period="1y", interval="1d")
    try:
        intra = yf_download(syms, period="5d", interval="5m", prepost=False)
    except Exception as e:
        log("  yfinance intraday failed:", e)
        intra = None
    out = {}
    for sym, name, kind, _st, want5d in items:
        try:
            q = quote_from_frames(sym, name, kind, _frame(daily, sym), _frame(intra, sym))
            if q:
                if not want5d:
                    q.pop("d5", None)
                if not name:
                    q["name"] = sym
                out[sym] = q
        except Exception as e:
            log("  yfinance parse failed", sym, e)
    return out


# ---------------------------------------------------------------- crypto fallback: CoinGecko (free, no key)
COINGECKO_IDS = {"BTC-USD": "bitcoin", "ETH-USD": "ethereum", "SOL-USD": "solana", "XRP-USD": "ripple", "DOGE-USD": "dogecoin"}


def parse_coingecko(raw, names):
    j = json.loads(raw)
    out = {}
    for sym, cid in COINGECKO_IDS.items():
        r = j.get(cid) if isinstance(j, dict) else None
        if not isinstance(r, dict):
            continue
        price, chg = _num(r.get("usd")), _num(r.get("usd_24h_change"))
        if not price or price <= 0:
            continue
        prev = price / (1 + chg / 100) if chg is not None and chg > -100 else None
        q = build_quote(sym, names.get(sym, sym), "crypto", price, prev, r.get("last_updated_at"), extra={"src": "coingecko"})
        out[sym] = q
    return out


def fetch_coingecko(names):
    url = ("https://api.coingecko.com/api/v3/simple/price?ids=" + ",".join(COINGECKO_IDS.values())
           + "&vs_currencies=usd&include_24hr_change=true&include_last_updated_at=true")
    return parse_coingecko(http_get(url, headers={"Accept": "application/json"}, retries=1), names)


def read_watch_extras():
    try:
        with open(WATCH_FILE, encoding="utf-8") as f:
            j = json.load(f)
        syms = j.get("symbols", []) if isinstance(j, dict) else j
        out = []
        for s in syms:
            s = str(s).strip().upper()
            if re.fullmatch(r"[A-Z0-9^][A-Z0-9.\-=^]{0,14}", s):
                out.append(s)
        return out[:40]
    except FileNotFoundError:
        return []
    except Exception as e:
        log("watchlist.json unreadable:", e)
        return []


def fetch_quotes(old):
    extras = [s for s in read_watch_extras() if s not in NAMES and s not in {m[0] for m in MARKETS}]
    rich = set(DEFAULT_WATCHLIST) | set(extras)
    items = [(s, n, k, st, True) for s, n, k, st in MARKETS]
    items += [(s, NAMES[s], "crypto" if s.endswith("-USD") else ("etf" if s in ("SPY", "QQQ", "DIA", "IWM", "VOO", "VTI", "GLD", "SLV", "TLT", "ARKK") else "stock"), None, s in rich) for s in UNIVERSE]
    items += [(s, None, "crypto" if s.endswith("-USD") else "stock", None, True) for s in extras]
    quotes, failed = {}, []
    old_q = (old or {}).get("quotes") or {}
    try:
        quotes.update(fetch_quotes_yf(items))
        log(f"  yfinance: {len(quotes)} of {len(items)} priced")
    except ImportError:
        log("  yfinance not installed; using direct requests")
    except Exception as e:
        log("  yfinance failed:", e)
    rest = [it for it in items if it[0] not in quotes]
    if rest:
        with ThreadPoolExecutor(max_workers=6) as ex:
            for sym, q, err in ex.map(fetch_quote, rest):
                if q:
                    quotes[sym] = q
                else:
                    failed.append(sym)
                    log("  quote failed", sym, err)
    if any(s in COINGECKO_IDS for s in failed):
        try:
            cg = fetch_coingecko({**NAMES, "BTC-USD": "Bitcoin"})
            for s, q in cg.items():
                if s in failed:
                    quotes[s] = q
                    failed.remove(s)
            log(f"  coingecko: {len(cg)} coins")
        except Exception as e:
            log("  coingecko failed:", e)
    for sym in failed:
        if sym in old_q:
            stale = dict(old_q[sym])
            stale["stale"] = True
            quotes[sym] = stale
    ok = len(items) - len(failed)
    return quotes, ok, failed, extras


# ---------------------------------------------------------------- news
TAG_RE = re.compile(r"<[^>]+>")


def clean(s):
    return re.sub(r"\s+", " ", html.unescape(TAG_RE.sub("", s or ""))).strip()


def parse_time(s):
    if not s:
        return None
    s = s.strip()
    try:
        d = parsedate_to_datetime(s)
    except Exception:
        try:
            d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
        except Exception:
            return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=UTC)
    return d


def parse_feed(raw, default_source):
    root = ET.fromstring(raw)
    out = []
    atom = "{http://www.w3.org/2005/Atom}"
    rss1 = "{http://purl.org/rss/1.0/}"
    dc = "{http://purl.org/dc/elements/1.1/}"
    nodes = list(root.iter("item")) or list(root.iter(atom + "entry")) or list(root.iter(rss1 + "item"))
    for it in nodes:
        def tx(tag):
            for ns in ("", atom, rss1, dc):
                el = it.find(ns + tag)
                if el is not None:
                    return el
            return None
        t_el = tx("title")
        title = clean(t_el.text if t_el is not None else "")
        link = ""
        links = it.findall(atom + "link")
        if links:  # Atom: prefer rel="alternate" (the default when rel is missing)
            alt = [l for l in links if l.get("rel", "alternate") == "alternate"] or links
            link = (alt[0].get("href") or "").strip()
        else:
            link_el = tx("link")
            if link_el is not None:
                link = (link_el.text or link_el.get("href") or "").strip()
            if not link.startswith("http"):
                g = it.find("guid")
                if g is not None and (g.get("isPermaLink", "true") != "false") and (g.text or "").strip().startswith("http"):
                    link = g.text.strip()
        src_el = it.find("source")
        source = clean(src_el.text) if src_el is not None and src_el.text else default_source
        d_el = None
        for tag in ("pubDate", "published", "updated", "date"):
            d_el = tx(tag)
            if d_el is not None and (d_el.text or "").strip():
                break
        when = parse_time(d_el.text if d_el is not None else None)
        if when and when > now_utc() + dt.timedelta(hours=1):
            when = None  # feeds sometimes carry future/garbage dates; don't let them pin to the top
        if source and title.endswith(" - " + source):
            title = title[: -(len(source) + 3)].strip()
        if not title or not link.startswith("http"):
            continue
        out.append({"title": title, "source": source, "link": link,
                    "time": iso(when) if when else None})
    return out


def norm_title(t):
    return re.sub(r"[^a-z0-9 ]", "", t.lower())


def dedupe(items):
    seen, out = [], []
    for it in items:
        words = set(w for w in norm_title(it["title"]).split() if len(w) > 2)
        dup = False
        for w2 in seen:
            if words and w2 and len(words & w2) / len(words | w2) >= 0.6:
                dup = True
                break
        if not dup:
            seen.append(words)
            out.append(it)
    return out


def sort_news(items, max_age_h=72):
    cutoff = now_utc() - dt.timedelta(hours=max_age_h)
    keep = []
    for it in items:
        d = parse_time(it.get("time")) if it.get("time") else None
        if d and d < cutoff:
            continue
        keep.append(it)
    keep.sort(key=lambda x: x.get("time") or "", reverse=True)
    return keep


def fetch_news(old):
    collected, ok, failed = [], 0, []
    for name, url in FEEDS:
        try:
            items = parse_feed(http_get(url, headers={"Accept": "application/rss+xml, application/xml, text/xml"}), name)
            collected.extend(items[:25])
            ok += 1
        except Exception as e:
            failed.append(name)
            log("  feed failed", name, e)
    if not collected:
        return (old or {}).get("news") or [], ok, failed
    items = dedupe(sort_news([it for it in collected if not is_junk(it)]))
    per, out = {}, []
    for it in items:
        if per.get(it["source"], 0) >= 6:
            continue
        per[it["source"]] = per.get(it["source"], 0) + 1
        out.append(it)
        if len(out) >= 20:
            break
    return out, ok, failed


def fetch_symbol_news(symbols, names, old):
    old_map = (old or {}).get("news_by_symbol") or {}
    out, failed = {}, []

    def one(sym):
        try:
            url = f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={urllib.parse.quote(sym)}&region=US&lang=en-US"
            items = parse_feed(http_get(url, retries=1), "Yahoo Finance")
            if not items:
                raise RuntimeError("empty")
        except Exception:
            q = urllib.parse.quote(f'"{names.get(sym, sym)}" stock when:3d')
            items = parse_feed(http_get(f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en", retries=1), "Google News")
        return dedupe(sort_news([it for it in items if not is_junk(it)], 24 * 7))[:5]

    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = {s: ex.submit(one, s) for s in symbols}
        for s, f in futs.items():
            try:
                out[s] = f.result()
            except Exception as e:
                failed.append(s)
                log("  symbol news failed", s, e)
                if s in old_map:
                    out[s] = old_map[s]
    return out, failed


# ---------------------------------------------------------------- calendar
CAL_URLS = [
    "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
    "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
]


def parse_ff(raw):
    out = []
    rows = json.loads(raw)
    if not isinstance(rows, list):
        raise ValueError("calendar: expected a JSON list")
    for e in rows:
        if not isinstance(e, dict):
            continue
        impact = (e.get("impact") or "").strip()
        country = (e.get("country") or "").strip().upper()
        title = clean(e.get("title"))
        if not title:
            continue
        if impact not in ("High", "Medium") and not (impact == "Holiday" and country == "USD"):
            continue
        try:
            d = dt.datetime.fromisoformat(e["date"])
        except Exception:
            continue
        ev = {"title": title, "country": country, "impact": impact, "time": iso(d)}
        if impact == "Holiday" or (d.hour == 0 and d.minute == 0 and "holiday" in title.lower()):
            ev["allDay"] = True
            ev["date"] = d.date().isoformat()
        for k in ("forecast", "previous", "actual"):
            v = clean(str(e.get(k) or ""))
            if v:
                ev[k] = v
        out.append(ev)
    return out


def ev_key(e):
    return f'{e["time"]}|{e["country"]}|{e["title"]}'


def fetch_calendar(old):
    old_meta = (old or {}).get("status", {}).get("calendar", {})
    old_cal = (old or {}).get("calendar") or []
    last = parse_time(old_meta.get("at")) if old_meta.get("at") else None
    # Forex Factory asks clients to be gentle; refresh at most about once an hour.
    if last and now_utc() - last < dt.timedelta(minutes=55) and old_cal and "--force" not in sys.argv:
        return old_cal, None, [], True
    merged = {ev_key(e): e for e in old_cal}
    ok, failed = 0, []
    for url in CAL_URLS:
        try:
            fresh = parse_ff(http_get(url, headers={"Accept": "application/json"}, retries=1))
            if fresh:
                # The fresh file is the truth for the days it covers: drop old copies first, so an
                # event that was moved or renamed doesn't show up twice.
                days = [parse_time(e["time"]).date() for e in fresh]
                lo, hi = min(days), max(days)
                merged = {k: e for k, e in merged.items() if not (lo <= parse_time(e["time"]).date() <= hi)}
                for e in fresh:
                    merged[ev_key(e)] = e
            ok += 1
        except Exception as e:
            if "nextweek" in url and "404" in str(e):
                log("  calendar: next week's file isn't published yet (normal)")
                continue
            failed.append(url.rsplit("_", 1)[-1])
            log("  calendar failed", url, e)
    today = now_utc().date()
    # Keep this week's earlier events (with their actual numbers) and the next ~2 weeks.
    start = today - dt.timedelta(days=today.weekday() if today.weekday() < 5 else 1)
    end = today + dt.timedelta(days=16)
    cal = [e for e in merged.values() if start <= parse_time(e["time"]).date() < end]
    cal.sort(key=lambda e: e["time"])
    return cal, ok, failed, False


def fetch_earnings(old, tracked, names):
    old_meta = (old or {}).get("status", {}).get("earnings", {})
    old_e = (old or {}).get("earnings") or []
    today = now_utc().date()
    keep_old = [e for e in old_e if e.get("date", "") >= (today - dt.timedelta(days=1)).isoformat()]
    last = parse_time(old_meta.get("at")) if old_meta.get("at") else None
    if last and now_utc() - last < dt.timedelta(hours=6) and "--force" not in sys.argv:
        return keep_old, None, True
    hdr = {"Accept": "application/json, text/plain, */*", "Origin": "https://www.nasdaq.com",
           "Referer": "https://www.nasdaq.com/"}
    found, ok, misses = {}, 0, 0
    for i in range(0, 15):
        d = today + dt.timedelta(days=i)
        if d.weekday() >= 5:
            continue
        try:
            j = json.loads(http_get(f"https://api.nasdaq.com/api/calendar/earnings?date={d.isoformat()}", headers=hdr, timeout=10, retries=0))
            rows = ((j.get("data") or {}).get("rows")) or []
            ok += 1
            for r in rows:
                sym = (r.get("symbol") or "").upper().replace(".", "-")
                if sym in tracked and sym not in found:
                    tm = (r.get("time") or "")
                    found[sym] = {"s": sym, "name": names.get(sym) or clean(r.get("name")), "date": d.isoformat(),
                                  "when": "before open" if "pre" in tm else "after close" if "after" in tm else "",
                                  "eps": clean(r.get("epsForecast")) or None}
        except Exception as e:
            misses += 1
            log("  earnings failed", d, e)
            if ok == 0 and misses >= 2:
                break  # blocked; don't waste the run
    if ok == 0:
        return keep_old, 0, False
    out = sorted(found.values(), key=lambda e: e["date"])
    return [{k: v for k, v in e.items() if v} for e in out], ok, False


# ---------------------------------------------------------------- main
def load_old():
    try:
        with open(OUT, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def write(data):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    try:
        # allow_nan=False: NaN/Infinity are not valid JSON and would break JSON.parse in the app.
        text = json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
        check = json.loads(text)
        if not isinstance(check, dict) or not isinstance(check.get("quotes"), dict):
            raise ValueError("output failed validation")
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text + "\n")
        os.replace(tmp, OUT)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def main():
    if "--sample" in sys.argv:
        write(make_sample())
        log("wrote SAMPLE data to", OUT)
        return 0
    old = load_old()
    # Sample prices (from the sample file, or kept from it by an earlier run) must never be
    # presented as real: they are not passed on as "previous" prices, only reused, still
    # flagged, when no live price can be fetched at all.
    sample_quotes = (old.get("quotes") or {}) if (old.get("sample") or old.get("sample_prices")) else {}
    if old.get("sample"):
        old = {}  # the sample's news/calendar are placeholders: carry nothing
    elif sample_quotes:
        old = {k: v for k, v in old.items() if k != "quotes"}
        old["status"] = {k: v for k, v in (old.get("status") or {}).items() if k != "quotes"}
        old.pop("updated", None)
    t0 = time.time()
    status = dict(old.get("status") or {})
    now = iso(now_utc())

    quotes, q_ok, q_failed, extras = {}, 0, [], []
    try:
        quotes, q_ok, q_failed, extras = fetch_quotes(old)
        if not q_ok:
            quotes = {}
        log(f"quotes: {q_ok} ok, {len(q_failed)} failed")
        if q_ok:
            status["quotes"] = {"at": now, "ok": q_ok, "failed": q_failed}
    except Exception as e:
        log("quotes crashed:", e)
        quotes = old.get("quotes") or {}

    news, n_ok = old.get("news") or [], 0
    try:
        news, n_ok, n_failed = fetch_news(old)
        log(f"news: {len(news)} items from {n_ok} feeds")
        if n_ok:
            status["news"] = {"at": now, "ok": n_ok, "failed": n_failed}
    except Exception as e:
        log("news crashed:", e)

    sym_news = old.get("news_by_symbol") or {}
    try:
        targets = (DEFAULT_WATCHLIST + extras)[:20]
        sym_news, sn_failed = fetch_symbol_news(targets, {**NAMES, **{s: (quotes.get(s) or {}).get("name", s) for s in extras}}, old)
        log(f"symbol news: {len(sym_news)} symbols, {len(sn_failed)} failed")
    except Exception as e:
        log("symbol news crashed:", e)

    calendar = old.get("calendar") or []
    try:
        calendar, c_ok, c_failed, skipped = fetch_calendar(old)
        if not skipped and c_ok:
            status["calendar"] = {"at": now, "ok": c_ok, "failed": c_failed}
        log(f"calendar: {len(calendar)} events{' (cached)' if skipped else ''}")
    except Exception as e:
        log("calendar crashed:", e)

    earnings = old.get("earnings") or []
    try:
        tracked = set(UNIVERSE) | set(extras)
        earnings, e_ok, skipped = fetch_earnings(old, tracked, NAMES)
        if not skipped and e_ok:
            status["earnings"] = {"at": now, "ok": e_ok}
        log(f"earnings: {len(earnings)}{' (cached)' if skipped else ''}")
    except Exception as e:
        log("earnings crashed:", e)

    sample_prices = False
    if not q_ok:
        if old.get("quotes"):
            quotes = {s: dict(q, stale=True) for s, q in old["quotes"].items()}
        elif sample_quotes:
            quotes, sample_prices = sample_quotes, True
            log("No live prices: keeping the SAMPLE prices (flagged sample_prices) with the fresh news/calendar.")
    if not quotes:
        log("No prices at all (live or previous); leaving the file untouched.")
        return 0
    cal_fresh = (status.get("calendar") or {}).get("at") == now
    if not q_ok and not n_ok and not cal_fresh:
        log("All live sources failed this run; keeping the previous file so the app shows its real age.")
        return 0

    data = {
        "version": 1,
        "updated": (status.get("quotes") or {}).get("at") or old.get("updated") or now,
        "checked": now,
        "sample": False,
        "sample_prices": sample_prices,
        "markets": [m[0] for m in MARKETS],
        "watchlist": DEFAULT_WATCHLIST,
        "extras": extras,
        "quotes": quotes,
        "news": news,
        "news_by_symbol": sym_news,
        "calendar": calendar,
        "earnings": earnings,
        "status": status,
    }
    write(data)
    log(f"wrote {OUT} in {time.time() - t0:.1f}s")
    return 0


# ---------------------------------------------------------------- sample (offline dev only)
def make_sample():
    """A clearly marked sample so the UI renders before the first live run.
    Prices are synthetic. Headlines are placeholders, not real news."""
    rng = random.Random(20261113)
    base = {
        "^GSPC": 6890.0, "^IXIC": 23410.0, "^DJI": 47120.0, "^RUT": 2440.0, "^VIX": 16.4, "^TNX": 4.12,
        "GC=F": 3985.0, "CL=F": 63.8, "EURUSD=X": 1.1612, "BTC-USD": 98400.0,
        "AAPL": 271.5, "MSFT": 512.3, "NVDA": 191.2, "AMZN": 236.8, "GOOGL": 281.4, "TSLA": 418.6, "META": 702.9,
    }
    rough = {"ETH-USD": 3520.0, "SOL-USD": 182.0, "XRP-USD": 2.41, "DOGE-USD": 0.221, "PLTR": 176.4, "COIN": 318.0, "AMD": 231.5, "NFLX": 112.4,
             "AVGO": 342.0, "JPM": 301.2, "SPY": 686.1, "QQQ": 611.5, "DIA": 471.3, "IWM": 243.9, "BRK-B": 501.0, "LLY": 905.0, "V": 342.5,
             "MA": 561.0, "COST": 921.0, "ORCL": 228.0, "VOO": 631.0, "GLD": 367.0, "WMT": 102.5, "BAC": 52.1, "XOM": 118.0}
    vol = {"^VIX": 0.05, "BTC-USD": 0.022, "TSLA": 0.025, "NVDA": 0.02, "EURUSD=X": 0.003, "^TNX": 0.012}
    last_close = dt.datetime(2026, 11, 13, 21, 0, tzinfo=UTC)
    quotes = {}
    items = [(s, n, k) for s, n, k, _ in MARKETS] + [(s, NAMES[s], "stock") for s in UNIVERSE]
    for sym, name, kind in items:
        if sym.endswith("-USD") and sym != "BTC-USD":
            kind = "crypto"
        p = base.get(sym) or rough.get(sym) or round(rng.uniform(20, 400), 2)
        v = vol.get(sym, 0.012)
        drift = rng.gauss(0, v)
        prev = p / (1 + drift)
        day, x = [], prev
        for i in range(64):
            x *= 1 + rng.gauss(drift / 64, v / 9)
            day.append(x)
        fix = p / day[-1]
        day = [val * fix ** (i / 63) for i, val in enumerate(day)]  # end exactly at the close
        d5, y = [], prev * (1 + rng.gauss(0, v * 2))
        for i in range(56):
            y *= 1 + rng.gauss(0, v / 6)
            d5.append(y)
        fix = day[0] / d5[-1]
        d5 = [val * fix ** (i / 55) for i, val in enumerate(d5)] + day[::8] + [p]
        q = build_quote(sym, name, kind, p, prev, last_close.timestamp(), day,
                        d5 if sym in base else None,
                        {"hi": rnd(max(day), kind), "lo": rnd(min(day), kind), "src": "sample"})
        quotes[sym] = q
    # placeholder headlines: link to the real news sites, clearly not real stories
    news = [
        {"title": "Live market headlines appear here after the first data update", "source": "Jarvis", "link": "https://www.cnbc.com/markets/", "time": "2026-11-15T09:00:00Z"},
        {"title": "Sample: CNBC top market stories", "source": "CNBC", "link": "https://www.cnbc.com/markets/", "time": "2026-11-15T08:30:00Z"},
        {"title": "Sample: Yahoo Finance latest news", "source": "Yahoo Finance", "link": "https://finance.yahoo.com/news/", "time": "2026-11-15T08:00:00Z"},
        {"title": "Sample: MarketWatch top stories", "source": "MarketWatch", "link": "https://www.marketwatch.com/", "time": "2026-11-15T07:30:00Z"},
    ]
    def ev(day, hm, country, title, impact):
        h, m = hm
        return {"title": title, "country": country, "impact": impact,
                "time": iso(dt.datetime(2026, 11, day, h, m, tzinfo=UTC))}
    calendar = [
        ev(16, (13, 30), "USD", "Empire State Manufacturing Index", "Medium"),
        ev(17, (13, 30), "USD", "Retail Sales m/m", "High"),
        ev(17, (13, 30), "USD", "Core Retail Sales m/m", "High"),
        ev(18, (7, 0), "GBP", "CPI y/y", "High"),
        ev(18, (19, 0), "USD", "FOMC Meeting Minutes", "High"),
        ev(19, (13, 30), "USD", "Unemployment Claims", "Medium"),
        ev(19, (13, 30), "USD", "Philly Fed Manufacturing Index", "Medium"),
        ev(20, (9, 0), "EUR", "Flash Manufacturing PMI", "Medium"),
        ev(20, (14, 45), "USD", "Flash Manufacturing PMI", "Medium"),
        ev(24, (15, 0), "USD", "CB Consumer Confidence", "High"),
        ev(25, (13, 30), "USD", "Prelim GDP q/q", "High"),
        ev(25, (13, 30), "USD", "Core PCE Price Index m/m", "High"),
        ev(25, (13, 30), "USD", "Core Durable Goods Orders m/m", "Medium"),
        {"title": "Bank Holiday", "country": "USD", "impact": "Holiday", "time": "2026-11-26T05:00:00Z", "allDay": True, "date": "2026-11-26"},
    ]
    return {
        "version": 1, "updated": "2026-11-15T09:00:00Z", "checked": "2026-11-15T09:00:00Z",
        "sample": True,
        "note": "SAMPLE DATA so the app renders before the first live update. Prices are synthetic and headlines are placeholders. The GitHub workflow replaces this file with live data.",
        "markets": [m[0] for m in MARKETS], "watchlist": DEFAULT_WATCHLIST, "extras": [],
        "quotes": quotes, "news": news, "news_by_symbol": {}, "calendar": calendar,
        "earnings": [{"s": "NVDA", "name": "Nvidia", "date": "2026-11-18", "when": "after close"}],
        "status": {},
    }


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # never fail the workflow over data
        log("fatal:", e)
        sys.exit(0)
