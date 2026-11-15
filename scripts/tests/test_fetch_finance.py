"""Unit tests for scripts/fetch_finance.py (standard library only).

Run:  python3 -m unittest discover -s scripts/tests -v
The fixtures in ./fixtures copy the exact shapes the live sources return
(Yahoo v8 chart JSON, Forex Factory weekly JSON, CNBC / Google News RSS, Atom, RSS 1.0).
"""
import datetime as dt
import json
import os
import sys
import tempfile
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.join(HERE, "fixtures")
sys.path.insert(0, os.path.dirname(HERE))
import fetch_finance as ff  # noqa: E402

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 11, 15, 9, 0, tzinfo=UTC)  # a Sunday morning


def fx(name, mode="r"):
    with open(os.path.join(FIX, name), mode) as f:
        return f.read()


def jload(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def readtxt(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def chart(name):
    return json.loads(fx(name))["chart"]["result"][0]


class Base(unittest.TestCase):
    def setUp(self):
        q = mock.patch.object(ff, "log", lambda *a: None)
        q.start()
        self.addCleanup(q.stop)
        p = mock.patch.object(ff, "now_utc", lambda: NOW)
        p.start()
        self.addCleanup(p.stop)
        ff.BLOCKED.update({"yahoo": 0, "stooq": 0})


class YahooTests(Base):
    def test_regular_session(self):
        q = ff.parse_yahoo("^GSPC", "S&P 500", "index", chart("yahoo_gspc_1d.json"), chart("yahoo_gspc_5d.json"))
        self.assertEqual(q["price"], 6760.21)
        self.assertEqual(q["prev"], 6737.49)
        self.assertAlmostEqual(q["pct"], round((6760.21 - 6737.49) / 6737.49 * 100, 2))
        self.assertEqual(q["chg"], 22.72)
        self.assertEqual(q["hi"], 6779.12)
        self.assertEqual(q["lo"], 6702.33)
        self.assertEqual(q["h52"], 6920.34)
        self.assertEqual(q["t"], int(dt.datetime(2026, 11, 13, 21, 0, tzinfo=UTC).timestamp()))
        self.assertTrue(all(isinstance(v, float) for v in q["day"]))   # null 5m bars dropped
        self.assertLessEqual(len(q["day"]), 64)
        self.assertEqual(q["day"][-1], 6760.21)                         # downsample keeps the last point
        self.assertEqual(q["d5"][-1], 6760.21)

    def test_premarket_previousclose_would_be_zero(self):
        # Monday before the open: previousClose == price (same session) -> 0.00% if used.
        q = ff.parse_yahoo("^GSPC", "S&P 500", "index", chart("yahoo_gspc_1d_premarket.json"))
        self.assertEqual(q["prev"], 6737.49)
        self.assertGreater(q["pct"], 0.3)

    def test_no_bars_uses_5d_sessions(self):
        q = ff.parse_yahoo("^GSPC", "S&P 500", "index", chart("yahoo_gspc_1d_nobars.json"), chart("yahoo_gspc_5d.json"))
        self.assertEqual(q["price"], 6760.21)
        self.assertEqual(q["prev"], 6737.49)     # Thursday's last hourly close
        self.assertAlmostEqual(q["pct"], 0.34)
        self.assertNotIn("day", q)

    def test_sessions_group_by_exchange_local_date(self):
        ss = ff.sessions_of(chart("yahoo_gspc_5d.json"))
        self.assertEqual([d.isoformat() for d, _ in ss], ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"])

    def test_chart_error_raises(self):
        with mock.patch.object(ff, "http_get", return_value=fx("yahoo_notfound.json", "rb")):
            with self.assertRaises(RuntimeError):
                ff.yahoo_chart("ZZZZ", "1d", "5m")

    def test_fetch_quote_falls_back_to_stooq(self):
        csv = b"Date,Open,High,Low,Close,Volume\n2026-11-12,270,272,268,269.50,1\n2026-11-13,270,274,269,272.25,1\n"

        def fake(url, **kw):
            if "yahoo" in url:
                raise RuntimeError("blocked")
            return csv
        with mock.patch.object(ff, "http_get", side_effect=fake):
            sym, q, err = ff.fetch_quote(("AAPL", "Apple", "stock", None, True))
        self.assertIsNone(err)
        self.assertEqual(q["src"], "stooq")
        self.assertEqual(q["price"], 272.25)
        self.assertEqual(q["prev"], 269.5)

    def test_nan_and_bad_price(self):
        res = chart("yahoo_gspc_1d.json")
        res["meta"]["regularMarketPrice"] = float("nan")
        with self.assertRaises(RuntimeError):
            ff.parse_yahoo("^GSPC", "S&P 500", "index", res)
        res["meta"]["regularMarketPrice"] = 10.0
        res["meta"]["chartPreviousClose"] = float("nan")
        res["meta"]["previousClose"] = None
        q = ff.parse_yahoo("^GSPC", "S&P 500", "index", res)
        self.assertNotIn("pct", q)
        json.dumps(q, allow_nan=False)

    def test_fx_rounding(self):
        q = ff.build_quote("EURUSD=X", "EUR/USD", "fx", 1.161234, 1.15881, 1)
        self.assertEqual(q["price"], 1.1612)
        self.assertEqual(q["chg"], 0.0024)


try:
    import pandas as pd
except ImportError:  # pragma: no cover
    pd = None


def yf_frames():
    """Frames shaped exactly like yf.download(..., group_by='ticker') returns them:
    columns MultiIndex (Ticker, Price); daily index = session dates, intraday index = UTC times;
    a ticker Yahoo couldn't price is an all-NaN column block."""
    days = pd.to_datetime(["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"])
    fields = ["Open", "High", "Low", "Close", "Adj Close", "Volume"]
    nan = float("nan")
    data = {}
    for f in fields:
        data[("^GSPC", f)] = {"High": [6700, 6720, 6750, 6779.12], "Low": [6600, 6650, 6690, 6702.33],
                              "Close": [6690.0, 6710.5, 6737.49, 6760.21]}.get(f, [1, 1, 1, 1])
        data[("DEAD", f)] = [nan] * 4
        data[("BTC-USD", f)] = {"Close": [101000.0, 99000.0, 98000.0, nan]}.get(f, [1, 1, 1, nan])
    daily = pd.DataFrame(data, index=days)
    daily.columns = pd.MultiIndex.from_tuples(daily.columns, names=["Ticker", "Price"])
    t = pd.date_range("2026-11-12 14:30", periods=78, freq="5min", tz="UTC").append(
        pd.date_range("2026-11-13 14:30", periods=78, freq="5min", tz="UTC"))
    closes = [6737.0 + i * 0.1 for i in range(156)]
    closes[-1] = 6760.21
    idata = {}
    for f in fields:
        idata[("^GSPC", f)] = closes
        idata[("DEAD", f)] = [nan] * 156
        idata[("BTC-USD", f)] = [nan] * 156
    intra = pd.DataFrame(idata, index=t)
    intra.columns = pd.MultiIndex.from_tuples(intra.columns, names=["Ticker", "Price"])
    return daily, intra


@unittest.skipIf(pd is None, "pandas not installed")
class YFinanceTests(Base):
    def test_quote_from_frames(self):
        daily, intra = yf_frames()
        q = ff.quote_from_frames("^GSPC", "S&P 500", "index", ff._frame(daily, "^GSPC"), ff._frame(intra, "^GSPC"))
        self.assertEqual(q["price"], 6760.21)
        self.assertEqual(q["prev"], 6737.49)             # previous session's official close
        self.assertAlmostEqual(q["pct"], 0.34)
        self.assertEqual(q["hi"], 6779.12)
        self.assertEqual(q["h52"], 6779.12)
        self.assertEqual(q["l52"], 6600)
        self.assertEqual(q["src"], "yfinance")
        self.assertEqual(q["day"][-1], 6760.21)
        self.assertLessEqual(len(q["day"]), 64)
        self.assertGreater(q["day"][0], 6737.0 + 77 * 0.1)  # only Friday's bars in the 1D chart
        self.assertEqual(q["t"], int(dt.datetime(2026, 11, 13, 21, 0, tzinfo=UTC).timestamp()))

    def test_missing_and_partial_tickers(self):
        daily, intra = yf_frames()
        self.assertIsNone(ff._frame(daily, "DEAD"))
        self.assertIsNone(ff._frame(daily, "NOPE"))
        q = ff.quote_from_frames("BTC-USD", "Bitcoin", "crypto", ff._frame(daily, "BTC-USD"), ff._frame(intra, "BTC-USD"))
        self.assertEqual(q["price"], 98000.0)            # trailing NaN row ignored
        self.assertEqual(q["prev"], 99000.0)

    def test_fetch_quotes_yf_batches(self):
        daily, intra = yf_frames()
        calls = []

        def fake(symbols, **kw):
            calls.append(kw["interval"])
            return daily if kw["interval"] == "1d" else intra
        items = [("^GSPC", "S&P 500", "index", None, True), ("DEAD", None, "stock", None, True), ("BTC-USD", "Bitcoin", "crypto", None, False)]
        with mock.patch.dict(sys.modules, {"yfinance": mock.MagicMock()}), mock.patch.object(ff, "yf_download", side_effect=fake):
            out = ff.fetch_quotes_yf(items)
        self.assertEqual(calls, ["1d", "5m"])            # two batched calls, not one per ticker
        self.assertEqual(set(out), {"^GSPC", "BTC-USD"})
        self.assertNotIn("d5", out["BTC-USD"])
        json.dumps(out, allow_nan=False)


class FallbackTests(Base):
    def test_coingecko(self):
        raw = b'{"bitcoin":{"usd":98400.12,"usd_24h_change":-0.7712,"last_updated_at":1794729600},"ethereum":{"usd":3520.5,"usd_24h_change":1.5,"last_updated_at":1794729600},"dogecoin":{"usd":null}}'
        out = ff.parse_coingecko(raw, {"BTC-USD": "Bitcoin", "ETH-USD": "Ethereum"})
        self.assertEqual(set(out), {"BTC-USD", "ETH-USD"})
        self.assertEqual(out["BTC-USD"]["price"], 98400.12)
        self.assertEqual(out["BTC-USD"]["pct"], -0.77)
        self.assertEqual(out["BTC-USD"]["src"], "coingecko")

    def test_circuit_breaker_stops_hammering(self):
        n = {"yahoo": 0}

        def fake(url, **kw):
            if "yahoo" in url:
                n["yahoo"] += 1
                raise RuntimeError("GET failed: HTTP Error 429: Too Many Requests")
            raise RuntimeError("stooq down")
        with mock.patch.object(ff, "http_get", side_effect=fake):
            for i in range(20):
                ff.fetch_quote((f"T{i}", None, "stock", None, False))
        self.assertLessEqual(n["yahoo"], ff.BLOCK_AFTER * 2)


class CalendarTests(Base):
    def test_parse_ff(self):
        evs = ff.parse_ff(fx("ff_thisweek.json"))
        titles = [(e["country"], e["title"]) for e in evs]
        self.assertNotIn(("USD", "Crude Oil Inventories"), titles)        # Low impact dropped
        self.assertNotIn(("USD", "FOMC Member Waller Speaks"), titles)    # Non-Economic dropped
        self.assertNotIn(("JPY", "Bank Holiday"), titles)                 # only US holidays kept
        cpi = next(e for e in evs if e["title"] == "CPI m/m")
        self.assertEqual(cpi["time"], "2026-11-18T13:30:00Z")             # 8:30 New York (EST) = 13:30 UTC
        self.assertEqual(cpi["forecast"], "0.3%")
        self.assertEqual(cpi["previous"], "0.4%")
        self.assertNotIn("actual", cpi)
        summer = next(e for e in evs if e["title"] == "Unemployment Claims")
        self.assertEqual(summer["time"], "2026-06-18T12:30:00Z")          # EDT offset honoured
        hol = next((e for e in evs if e.get("date") == "2026-11-26"), None)
        self.assertIsNotNone(hol)
        self.assertEqual(hol["time"], "2026-11-26T05:00:00Z")
        self.assertTrue(hol["allDay"])
        self.assertEqual(hol["impact"], "Holiday")

    def test_parse_ff_rejects_html(self):
        with self.assertRaises(Exception):
            ff.parse_ff(b"<html>Request Denied</html>")
        with self.assertRaises(ValueError):
            ff.parse_ff(b'{"error":"rate limited"}')

    def test_merge_replaces_moved_event(self):
        old = {"calendar": [
            {"title": "CPI m/m", "country": "USD", "impact": "High", "time": "2026-11-17T13:30:00Z"},  # since moved
            {"title": "Retail Sales m/m", "country": "USD", "impact": "High", "time": "2026-11-27T13:30:00Z"},
        ], "status": {}}
        raw = fx("ff_thisweek.json").encode()

        def fake(url, **kw):
            if url.endswith("thisweek.json"):
                return raw
            raise RuntimeError("404")
        with mock.patch.object(ff, "http_get", side_effect=fake):
            cal, ok, failed, skipped = ff.fetch_calendar(old)
        self.assertEqual(ok, 1)
        self.assertFalse(skipped)
        cpis = [e for e in cal if e["title"] == "CPI m/m"]
        self.assertEqual(len(cpis), 1)
        self.assertEqual(cpis[0]["time"], "2026-11-18T13:30:00Z")
        self.assertTrue(any(e["title"] == "Retail Sales m/m" for e in cal))  # outside the fresh range: kept
        self.assertEqual(cal, sorted(cal, key=lambda e: e["time"]))

    def test_nextweek_404_is_quiet(self):
        raw = fx("ff_thisweek.json").encode()

        def fake(url, **kw):
            if url.endswith("thisweek.json"):
                return raw
            raise RuntimeError("GET failed: HTTP Error 404: Not Found")
        with mock.patch.object(ff, "http_get", side_effect=fake):
            cal, ok, failed, skipped = ff.fetch_calendar({})
        self.assertEqual(failed, [])
        self.assertEqual(ok, 1)

    def test_calendar_throttle(self):
        old = {"calendar": [{"title": "x", "country": "USD", "impact": "High", "time": "2026-11-18T13:30:00Z"}],
               "status": {"calendar": {"at": "2026-11-15T08:30:00Z"}}}
        with mock.patch.object(ff, "http_get", side_effect=AssertionError("should not fetch")):
            cal, ok, failed, skipped = ff.fetch_calendar(old)
        self.assertTrue(skipped)
        self.assertEqual(cal, old["calendar"])


class FeedTests(Base):
    def test_cnbc_rss(self):
        items = ff.parse_feed(fx("cnbc.xml", "rb"), "CNBC")
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["title"], "S&P 500 rises as Nvidia leads chip rally; Dow gains 200 points")
        self.assertEqual(items[0]["time"], "2026-11-14T21:05:12Z")
        self.assertEqual(items[0]["source"], "CNBC")
        self.assertEqual(items[1]["title"], "Oil slips as OPEC+ weighs output hike")

    def test_google_news_source_suffix(self):
        items = ff.parse_feed(fx("google_news.xml", "rb"), "Google News")
        self.assertEqual(items[0]["source"], "Reuters")
        self.assertEqual(items[0]["title"], "S&P 500 rises as Nvidia leads chip rally, Dow gains 200 points")
        self.assertEqual(items[1]["source"], "The Wall Street Journal")
        self.assertEqual(items[1]["title"], "Treasury yields climb ahead of CPI report")

    def test_atom(self):
        items = ff.parse_feed(fx("atom.xml", "rb"), "Example")
        self.assertEqual(items[0]["link"], "https://example.com/news/waller-cuts")   # rel=alternate, not self
        self.assertEqual(items[0]["title"], "Fed’s Waller says more cuts possible")
        self.assertEqual(items[0]["time"], "2026-11-15T00:15:00Z")                  # <published>, offset applied
        self.assertEqual(items[1]["link"], "https://example.com/news/btc")
        self.assertEqual(items[1]["time"], "2026-11-14T15:00:00Z")                  # falls back to <updated>

    def test_rss1_rdf(self):
        items = ff.parse_feed(fx("rdf.xml", "rb"), "RDF")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["time"], "2026-11-14T12:00:00Z")

    def test_future_dates_dropped(self):
        xml = b"<rss><channel><item><title>Odd</title><link>https://x.y/z</link><pubDate>Mon, 01 Jan 2035 00:00:00 GMT</pubDate></item></channel></rss>"
        self.assertIsNone(ff.parse_feed(xml, "X")[0]["time"])

    def test_dedupe_and_sort(self):
        a = ff.parse_feed(fx("cnbc.xml", "rb"), "CNBC")
        b = ff.parse_feed(fx("google_news.xml", "rb"), "Google News")
        out = ff.dedupe(ff.sort_news(a + b))
        titles = [x["title"] for x in out]
        self.assertEqual(sum("Nvidia leads chip rally" in t for t in titles), 1)  # cross-source duplicate removed
        self.assertNotIn("Week-old story is dropped by the 72h cutoff", titles)
        self.assertEqual(out[0]["source"], "Reuters")                           # newest first
        self.assertIn("Oil slips as OPEC+ weighs output hike", titles)

    def test_fetch_news_keeps_old_when_all_fail(self):
        old = {"news": [{"title": "kept", "source": "X", "link": "https://x", "time": None}]}
        with mock.patch.object(ff, "http_get", side_effect=RuntimeError("down")):
            news, ok, failed = ff.fetch_news(old)
        self.assertEqual(news, old["news"])
        self.assertEqual(ok, 0)


class WriteTests(Base):
    def setUp(self):
        super().setUp()
        self.tmp = tempfile.mkdtemp()
        p = mock.patch.object(ff, "OUT", os.path.join(self.tmp, "finance.json"))
        p.start()
        self.addCleanup(p.stop)
        # offline tests: behave as if yfinance is unavailable (the batch path has its own tests)
        y = mock.patch.object(ff, "fetch_quotes_yf", side_effect=ImportError("no yfinance"))
        y.start()
        self.addCleanup(y.stop)

    def test_nan_never_written(self):
        with open(ff.OUT, "w") as f:
            f.write('{"quotes":{}}\n')
        with self.assertRaises(ValueError):
            ff.write({"quotes": {"X": {"price": float("nan")}}})
        self.assertEqual(readtxt(ff.OUT), '{"quotes":{}}\n')     # old file untouched
        self.assertFalse(os.path.exists(ff.OUT + ".tmp"))

    def test_sample_is_valid_and_marked(self):
        ff.write(ff.make_sample())
        d = jload(ff.OUT)
        self.assertIs(d["sample"], True)
        self.assertTrue(d["quotes"]["^GSPC"]["price"])

    def _main(self, argv=("fetch_finance.py",)):
        with mock.patch.object(sys, "argv", list(argv)):
            return ff.main()

    def test_all_sources_down_leaves_file_untouched(self):
        ff.write(ff.make_sample())
        before = readtxt(ff.OUT)
        with mock.patch.object(ff, "http_get", side_effect=RuntimeError("down")), \
             mock.patch.object(ff.time, "sleep", lambda s: None):
            self.assertEqual(self._main(), 0)
        self.assertEqual(readtxt(ff.OUT), before)   # still the (clearly marked) sample, not an empty "live" file

    def test_prices_down_news_up_keeps_flagged_sample_prices(self):
        ff.write(ff.make_sample())
        rss = fx("cnbc.xml", "rb")
        cal = fx("ff_thisweek.json", "rb")

        def fake(url, **kw):
            if "cnbc" in url:
                return rss
            if "thisweek" in url:
                return cal
            raise RuntimeError("HTTP Error 429")
        with mock.patch.object(ff, "http_get", side_effect=fake), \
             mock.patch.object(ff.time, "sleep", lambda s: None):
            self._main()
        d = jload(ff.OUT)
        self.assertIs(d["sample"], False)
        self.assertIs(d["sample_prices"], True)
        self.assertEqual(d["news"][0]["source"], "CNBC")
        self.assertTrue(any(e["title"] == "CPI m/m" for e in d["calendar"]))
        self.assertTrue(all(q["src"] == "sample" for q in d["quotes"].values()))
        # next run, still no prices: stays flagged, sample prices are not turned into "stale real" ones
        with mock.patch.object(ff, "http_get", side_effect=fake), \
             mock.patch.object(ff.time, "sleep", lambda s: None), \
             mock.patch.object(ff, "fetch_calendar", lambda old: (old["calendar"], None, [], True)):
            self._main()
        d2 = jload(ff.OUT)
        self.assertIs(d2["sample_prices"], True)
        self.assertFalse(any(q.get("stale") for q in d2["quotes"].values()))

    def test_live_run_end_to_end(self):
        ff.write(ff.make_sample())
        day = fx("yahoo_gspc_1d.json", "rb")
        d5 = fx("yahoo_gspc_5d.json", "rb")
        cal = fx("ff_thisweek.json", "rb")
        rss = fx("cnbc.xml", "rb")

        def fake(url, **kw):
            if "range=1d" in url:
                return day
            if "range=5d" in url:
                return d5
            if "thisweek" in url:
                return cal
            if "cnbc" in url:
                return rss
            raise RuntimeError("blocked")
        with mock.patch.object(ff, "http_get", side_effect=fake), \
             mock.patch.object(ff.time, "sleep", lambda s: None):
            self._main()
        d = jload(ff.OUT)
        self.assertIs(d["sample"], False)
        self.assertIs(d["sample_prices"], False)
        self.assertEqual(d["updated"], "2026-11-15T09:00:00Z")
        self.assertNotIn("note", d)
        self.assertTrue(all(q.get("src") != "sample" for q in d["quotes"].values()))  # no sample values carried over
        self.assertEqual(d["quotes"]["^GSPC"]["price"], 6760.21)
        self.assertTrue(any(e["title"] == "CPI m/m" for e in d["calendar"]))
        self.assertEqual(d["news"][0]["source"], "CNBC")


if __name__ == "__main__":
    unittest.main()
