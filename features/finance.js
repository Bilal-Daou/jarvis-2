/* Markets: a daily finance brief for Jarvis.
   Data comes from data/finance.json, refreshed by a free GitHub Actions job
   (scripts/fetch_finance.py), so the phone never needs API keys. */
(function(){
'use strict';
const J = window.Jarvis; if (!J) return;
try {

/* ------------------------------------------------------------------ data */
const DEFAULT_WATCH = ['AAPL','MSFT','NVDA','AMZN','GOOGL','TSLA','META'];
const st = J.store('finance', {watchlist: DEFAULT_WATCH.slice(), seg:'overview', range:'1d', sort:'mine', cal:'all', news:'top'});
if (!Array.isArray(st.watchlist)) st.watchlist = DEFAULT_WATCH.slice();
const CACHE_KEY = 'jarvis2-finance-cache';
const URL_DATA = 'data/finance.json';
let data = null, loading = false, failed = null, lastFetch = 0, editing = false, newsSym = null;
let viewEl = null, homeEl = null;
try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c && c.quotes) data = c; } catch(e){}

function load(manual){
  if (loading) return;
  loading = true; failed = null; paint();
  const before = data && data.updated;
  const ctl = 'AbortController' in window ? new AbortController() : null;
  const timer = setTimeout(()=>{ try { ctl && ctl.abort(); } catch(e){} }, 15000);
  fetch(URL_DATA + '?t=' + Date.now(), {cache:'no-store', signal: ctl ? ctl.signal : undefined})
    .then(r=>{ if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(j=>{
      if (!j || !j.quotes) throw new Error('bad data');
      data = j; lastFetch = Date.now();
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(j)); } catch(e){}
      if (manual) J.toast(before && before === j.updated ? 'Already up to date. Prices refresh about every 30 minutes.' : 'Markets updated');
    })
    .catch(()=>{ failed = (navigator.onLine === false) ? 'offline' : 'error'; if (manual) J.toast(failed==='offline' ? "You're offline. Showing the last saved prices." : "Couldn't refresh right now."); })
    .finally(()=>{ clearTimeout(timer); loading = false; paint(); tryMissing(); });
}
function paint(){
  try { if (viewEl) renderView(viewEl); } catch(e){ console.error('finance view', e); }
  try { if (homeEl) renderHomeCard(homeEl); } catch(e){ console.error('finance home', e); }
}
function quote(sym){ return (data && data.quotes && data.quotes[sym]) || null; }
// true when the PRICES are not real: the whole file is the sample, or the data job kept the
// sample prices because no live price could be fetched yet (news/calendar are then real).
function samplePx(){ return !!(data && (data.sample || data.sample_prices)); }

/* Symbols Bilal added that the feed doesn't cover show as "waiting for data".
   (Yahoo blocks direct browser requests, so a client-side fetch would only fail.) */
function tryMissing(){}

/* ------------------------------------------------------------- names */
const NAMES = {AAPL:'Apple',MSFT:'Microsoft',NVDA:'Nvidia',AMZN:'Amazon',GOOGL:'Alphabet',META:'Meta',TSLA:'Tesla',AVGO:'Broadcom','BRK-B':'Berkshire Hathaway',JPM:'JPMorgan',LLY:'Eli Lilly',V:'Visa',UNH:'UnitedHealth',XOM:'Exxon Mobil',MA:'Mastercard',JNJ:'Johnson & Johnson',PG:'Procter & Gamble',HD:'Home Depot',COST:'Costco',ORCL:'Oracle',NFLX:'Netflix',AMD:'AMD',CRM:'Salesforce',BAC:'Bank of America',WMT:'Walmart',KO:'Coca-Cola',PEP:'PepsiCo',ADBE:'Adobe',DIS:'Disney',INTC:'Intel',PLTR:'Palantir',UBER:'Uber',COIN:'Coinbase',MSTR:'Strategy',ARM:'Arm',TSM:'TSMC',ASML:'ASML',BABA:'Alibaba',NKE:'Nike',MCD:"McDonald's",SBUX:'Starbucks',BA:'Boeing',GS:'Goldman Sachs',MS:'Morgan Stanley',WFC:'Wells Fargo',C:'Citigroup',CVX:'Chevron',PFE:'Pfizer',MRK:'Merck',ABBV:'AbbVie',T:'AT&T',VZ:'Verizon',CSCO:'Cisco',QCOM:'Qualcomm',IBM:'IBM',SHOP:'Shopify',PYPL:'PayPal',SNOW:'Snowflake',CRWD:'CrowdStrike',PANW:'Palo Alto Networks',SMCI:'Super Micro',MU:'Micron',HOOD:'Robinhood',RIVN:'Rivian',NIO:'NIO',SOFI:'SoFi',SPY:'S&P 500 ETF',QQQ:'Nasdaq 100 ETF',DIA:'Dow ETF',IWM:'Russell 2000 ETF',VOO:'Vanguard S&P 500',VTI:'Vanguard Total Market',GLD:'Gold ETF',SLV:'Silver ETF',TLT:'Long Treasury ETF',ARKK:'ARK Innovation','ETH-USD':'Ethereum','SOL-USD':'Solana','XRP-USD':'XRP','DOGE-USD':'Dogecoin','BTC-USD':'Bitcoin','^GSPC':'S&P 500','^IXIC':'Nasdaq','^DJI':'Dow Jones','^RUT':'Russell 2000','^VIX':'VIX','^TNX':'10-year yield','GC=F':'Gold','CL=F':'Oil','EURUSD=X':'Euro'};
const ALIASES = {
  'apple':'AAPL','microsoft':'MSFT','nvidia':'NVDA','invidia':'NVDA','n video':'NVDA','amazon':'AMZN','google':'GOOGL','alphabet':'GOOGL','meta':'META','facebook':'META','tesla':'TSLA','broadcom':'AVGO',
  'berkshire':'BRK-B','berkshire hathaway':'BRK-B','jp morgan':'JPM','jpmorgan':'JPM','jpmorgan chase':'JPM','j p morgan':'JPM','eli lilly':'LLY','lilly':'LLY','visa':'V','unitedhealth':'UNH','united health':'UNH',
  'exxon':'XOM','exxon mobil':'XOM','exxonmobil':'XOM','mastercard':'MA','master card':'MA','johnson and johnson':'JNJ','johnson & johnson':'JNJ','procter and gamble':'PG','procter & gamble':'PG','p&g':'PG',
  'home depot':'HD','costco':'COST','oracle':'ORCL','netflix':'NFLX','amd':'AMD','advanced micro devices':'AMD','salesforce':'CRM','bank of america':'BAC','walmart':'WMT','coca cola':'KO','coca-cola':'KO','coke':'KO',
  'pepsi':'PEP','pepsico':'PEP','adobe':'ADBE','disney':'DIS','intel':'INTC','palantir':'PLTR','uber':'UBER','coinbase':'COIN','microstrategy':'MSTR','micro strategy':'MSTR','arm holdings':'ARM',
  'tsmc':'TSM','taiwan semiconductor':'TSM','taiwan semi':'TSM','asml':'ASML','alibaba':'BABA','nike':'NKE',"mcdonald's":'MCD','mcdonalds':'MCD','mcdonald':'MCD','starbucks':'SBUX','boeing':'BA','goldman':'GS','goldman sachs':'GS',
  'morgan stanley':'MS','wells fargo':'WFC','citi':'C','citigroup':'C','citibank':'C','chevron':'CVX','pfizer':'PFE','merck':'MRK','abbvie':'ABBV','at&t':'T','at and t':'T','verizon':'VZ','cisco':'CSCO',
  'qualcomm':'QCOM','ibm':'IBM','shopify':'SHOP','paypal':'PYPL','snowflake':'SNOW','crowdstrike':'CRWD','crowd strike':'CRWD','palo alto':'PANW','palo alto networks':'PANW','super micro':'SMCI','supermicro':'SMCI',
  'micron':'MU','robinhood':'HOOD','rivian':'RIVN','sofi':'SOFI','bitcoin':'BTC-USD','btc':'BTC-USD','ethereum':'ETH-USD','ether':'ETH-USD','eth':'ETH-USD','solana':'SOL-USD','xrp':'XRP-USD','ripple':'XRP-USD',
  'dogecoin':'DOGE-USD','doge':'DOGE-USD','s&p':'^GSPC','s&p 500':'^GSPC','s and p':'^GSPC','s and p 500':'^GSPC','sp 500':'^GSPC','snp 500':'^GSPC','s p 500':'^GSPC','the s&p':'^GSPC','nasdaq':'^IXIC',
  'nasdaq composite':'^IXIC','dow':'^DJI','dow jones':'^DJI','the dow':'^DJI','russell':'^RUT','russell 2000':'^RUT','small caps':'^RUT','vix':'^VIX','the vix':'^VIX','volatility':'^VIX','fear index':'^VIX',
  '10 year':'^TNX','10-year':'^TNX','10 year yield':'^TNX','10-year yield':'^TNX','10 year treasury':'^TNX','treasury yield':'^TNX','treasury yields':'^TNX','bond yields':'^TNX','yields':'^TNX','treasuries':'^TNX',
  'gold':'GC=F','gold price':'GC=F','oil':'CL=F','crude':'CL=F','crude oil':'CL=F','wti':'CL=F','euro':'EURUSD=X','eur usd':'EURUSD=X','euro dollar':'EURUSD=X','the euro':'EURUSD=X','silver':'SLV'
};
const INDEX_SYMS = ['^GSPC','^IXIC','^DJI'];
const SPOKEN = {'^GSPC':'The S&P 500','^IXIC':'The Nasdaq','^DJI':'The Dow','^RUT':'The Russell 2000','^VIX':'The VIX','^TNX':'The 10-year Treasury yield','CL=F':'Oil','EURUSD=X':'The euro'};
function nameOf(sym){ const q = quote(sym); return NAMES[sym] || (q && q.name) || sym; }
function short(sym){ return sym.replace(/^\^/,'').replace(/-USD$/,'').replace(/=F$|=X$/,''); }
function tickerLabel(sym){ const m = {'^GSPC':'SPX','^IXIC':'NDX','^DJI':'DJI','^RUT':'RUT','^VIX':'VIX','^TNX':'TNX','GC=F':'GOLD','CL=F':'WTI','EURUSD=X':'EURUSD','BTC-USD':'BTC'}; return m[sym] || short(sym); }

/* text -> symbol */
function resolve(text, loose){
  let x = String(text||'').toLowerCase().trim()
    .replace(/[.?!]+$/,'').replace(/^\$/,'')
    .replace(/^(the|a|an)\s+/,'')
    .replace(/'s\b/g,'')
    .replace(/\s+(stock|stocks|shares|share|share price|stock price|price|inc|corp|corporation|company|holdings?|token|coin)$/,'')
    .replace(/\s+(stock|shares)$/,'').trim();
  if (!x) return null;
  if (ALIASES[x]) return ALIASES[x];
  if (/^([a-z]\s){1,4}[a-z]$/.test(x)) x = x.replace(/\s/g,'');           // "n v d a" -> nvda
  const up = x.toUpperCase().replace(/\./g,'-');
  if (data && data.quotes && data.quotes[up]) return up;
  if (NAMES[up]) return up;
  if (data && data.quotes){ for (const [s,q] of Object.entries(data.quotes)){ const n = (q.name||'').toLowerCase(); if (n && x.length >= 4 && (n === x || n.startsWith(x+' '))) return s; } }
  if (loose && /^[a-z]{1,5}(-[a-z])?$/i.test(up)) return up;               // a ticker Bilal spelled out
  return null;
}

/* ------------------------------------------------------- formatting */
const nf = (v,d)=> Number(v).toLocaleString('en-US',{minimumFractionDigits:d, maximumFractionDigits:d});
function dec(q){ if (!q) return 2; if (q.kind==='fx') return 4; const a = Math.abs(q.price); return a < 1 ? 4 : 2; }
function px(q){ if (!q || q.price==null) return '—'; return q.kind==='rate' ? nf(q.price,2)+'%' : nf(q.price, dec(q)); }
function pctTxt(q){ if (!q || q.pct==null) return '—'; return (q.pct>0?'+':q.pct<0?'−':'')+nf(Math.abs(q.pct),2)+'%'; }
function chgTxt(q){
  if (!q || q.chg==null) return '';
  if (q.kind==='rate') { const b = Math.round(q.chg*100); return (b>0?'+':b<0?'−':'')+Math.abs(b)+' bps'; }
  return (q.chg>0?'+':q.chg<0?'−':'')+nf(Math.abs(q.chg), dec(q));
}
function pillTxt(q){ return q && q.kind==='rate' ? chgTxt(q) : pctTxt(q); }
function dir(q){ return !q || q.pct==null ? 'flat' : q.pct > 0.0001 ? 'up' : q.pct < -0.0001 ? 'dn' : 'flat'; }
let saidData = false; // set when a reply speaks prices or dates, so sample data always gets flagged
function spokenPrice(q){
  if (!q) return ''; saidData = true;
  if (q.kind==='rate') return nf(q.price,2)+' percent';
  if (q.kind==='fx') return nf(q.price,4);
  if (q.kind==='index' || q.kind==='vol') return nf(q.price, q.price >= 1000 ? 0 : 2);
  return '$'+nf(q.price, q.price >= 1000 ? 0 : dec(q));
}
function spokenMove(q){
  if (!q || q.pct==null) return ''; saidData = true;
  if (q.kind==='rate'){ const b = Math.round(q.chg*100); return b===0 ? 'flat' : `${b>0?'up':'down'} ${Math.abs(b)} basis point${Math.abs(b)===1?'':'s'}`; }
  if (Math.abs(q.pct) < 0.005) return 'flat';
  return `${q.pct>0?'up':'down'} ${nf(Math.abs(q.pct), 2)}%`;
}

/* -------------------------------------------------- market clock (New York) */
function nyParts(d){
  const f = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York', hourCycle:'h23', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', weekday:'short'});
  const p = {}; f.formatToParts(d).forEach(x=>p[x.type]=x.value);
  return {y:+p.year, m:+p.month, d:+p.day, h:+p.hour%24, mi:+p.minute, s:+p.second, wd:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday)};
}
function nyToDate(y,m,d,h,mi){ // a New York wall-clock time -> real Date
  const guess = Date.UTC(y,m-1,d,h,mi); const p = nyParts(new Date(guess));
  const off = Date.UTC(p.y,p.m-1,p.d,p.h,p.mi) - guess; return new Date(guess - off);
}
/* NYSE full holidays and 1 PM early closes, by rule, so the clock is right for any year.
   (Forex Factory's US "Bank Holiday" also covers Veterans Day and Columbus Day, when stocks trade.) */
const nyseCache = {};
function nyseYear(y){
  if (nyseCache[y]) return nyseCache[y];
  const k = (m,d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const wd = (m,d)=>new Date(Date.UTC(y,m-1,d)).getUTCDay();
  const nth = (m,dow,n)=>{ let d = 1; while (wd(m,d)!==dow) d++; return d + 7*(n-1); };
  const last = (m,dow)=>{ let d = new Date(Date.UTC(y,m,0)).getUTCDate(); while (wd(m,d)!==dow) d--; return d; };
  const obs = (m,d)=>{ const w = wd(m,d); if (w===6) return m===1&&d===1 ? null : (()=>{ const t = new Date(Date.UTC(y,m-1,d-1)); return k(t.getUTCMonth()+1, t.getUTCDate()); })(); if (w===0){ const t = new Date(Date.UTC(y,m-1,d+1)); return k(t.getUTCMonth()+1, t.getUTCDate()); } return k(m,d); };
  // Easter (Anonymous Gregorian algorithm) -> Good Friday
  const a=y%19,b=Math.floor(y/100),c=y%100,dd=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-dd-g+15)%30,i=Math.floor(c/4),kk=c%4,l=(32+2*e+2*i-h-kk)%7,mm=Math.floor((a+11*h+22*l)/451);
  const em = Math.floor((h+l-7*mm+114)/31), ed = ((h+l-7*mm+114)%31)+1; const gf = new Date(Date.UTC(y,em-1,ed-2));
  const full = new Set([obs(1,1), k(1,nth(1,1,3)), k(2,nth(2,1,3)), k(gf.getUTCMonth()+1, gf.getUTCDate()), k(5,last(5,1)), y>=2022?obs(6,19):null, obs(7,4), k(9,nth(9,1,1)), k(11,nth(11,4,4)), obs(12,25)].filter(Boolean));
  const early = new Set();
  const tg = nth(11,4,4); early.add(k(11,tg+1));
  if (wd(12,24)>=1 && wd(12,24)<=5 && !full.has(k(12,24))) early.add(k(12,24));
  if (wd(7,3)>=1 && wd(7,3)<=5 && !full.has(k(7,3))) early.add(k(7,3));
  return (nyseCache[y] = {full, early});
}
const ymd = (y,m,d)=>`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
function isHoliday(y,m,d){ return nyseYear(y).full.has(ymd(y,m,d)); }
function isEarlyClose(y,m,d){ return nyseYear(y).early.has(ymd(y,m,d)); }
function stockHolidayOn(dateStr){ const [y,m,d] = dateStr.split('-').map(Number); return isHoliday(y,m,d); }
function marketClock(){
  try {
    const now = new Date(); const p = nyParts(now); const mins = p.h*60+p.mi;
    const trading = p.wd>=1 && p.wd<=5 && !isHoliday(p.y,p.m,p.d);
    const closeH = isEarlyClose(p.y,p.m,p.d) ? 13 : 16, closeM = closeH*60;
    const tfmt = d=>d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
    if (trading && mins>=570 && mins<closeM) return {state:'open', label:'Market open', sub:(closeH===13?'closes early ':'closes ')+tfmt(nyToDate(p.y,p.m,p.d,closeH,0))};
    // next open
    let y=p.y, m=p.m, d=p.d, k=0;
    if (!(trading && mins < 570)){
      do { const n = new Date(Date.UTC(y,m-1,d)+864e5); y=n.getUTCFullYear(); m=n.getUTCMonth()+1; d=n.getUTCDate(); k++; }
      while ((new Date(Date.UTC(y,m-1,d)).getUTCDay()%6===0 || isHoliday(y,m,d)) && k<10);
    }
    const open = nyToDate(y,m,d,9,30);
    const sameDay = open.toDateString()===now.toDateString();
    const when = sameDay ? tfmt(open) : open.toLocaleDateString([], {weekday:'short'})+' '+tfmt(open);
    if (trading && mins>=240 && mins<570) return {state:'pre', label:'Pre-market', sub:'opens '+when};
    if (trading && mins>=closeM && mins<1200) return {state:'post', label:'After hours', sub:'opens '+when};
    return {state:'closed', label:'Market closed', sub:'opens '+when};
  } catch(e){ return {state:'closed', label:'US market', sub:''}; }
}
function asOf(q){ // "as of Friday's close" when the market isn't trading
  if (!q || !q.t || q.kind==='crypto') return '';   // crypto trades around the clock
  if (marketClock().state==='open') return '';
  const d = new Date(q.t*1000), now = new Date();
  if (d.toDateString()===now.toDateString()) return " as of today's close";
  if (now - d < 6*864e5) return ` as of ${d.toLocaleDateString('en-US',{weekday:'long'})}'s close`;
  return '';
}

/* -------------------------------------------------- economic calendar */
const FLAGS = {USD:'🇺🇸',EUR:'🇪🇺',GBP:'🇬🇧',JPY:'🇯🇵',CNY:'🇨🇳',CAD:'🇨🇦',AUD:'🇦🇺',NZD:'🇳🇿',CHF:'🇨🇭',ALL:'🌐'};
const PLACE = {USD:'US',EUR:'Euro area',GBP:'UK',JPY:'Japan',CNY:'China',CAD:'Canada',AUD:'Australia',NZD:'New Zealand',CHF:'Switzerland'};
const EXPLAIN = [
  [/core pce|pce price/i, 'PCE inflation', "The Fed's favorite inflation gauge. Hot = rate cuts get pushed back."],
  [/core cpi/i, 'Core inflation (CPI)', 'Inflation without food and energy. Hotter than expected usually lifts yields and hits stocks.'],
  [/\bcpi\b|consumer price/i, 'Inflation (CPI)', 'The main inflation reading. Can move rates, the dollar and stocks.'],
  [/\bppi\b|producer price/i, 'Wholesale inflation (PPI)', 'Prices businesses pay. An early hint for CPI.'],
  [/non-?farm|nfp|employment change/i, 'Jobs report', 'How many jobs were added. Big surprises move stocks, bonds and the dollar.'],
  [/unemployment rate/i, 'Unemployment rate', 'Share of people out of work. Rising = economy cooling.'],
  [/unemployment claims|jobless claims/i, 'Weekly jobless claims', 'A weekly read on layoffs.'],
  [/jolts/i, 'Job openings (JOLTS)', 'How many jobs employers are trying to fill.'],
  [/fomc minutes|meeting minutes/i, 'Fed meeting minutes', 'Details from the last Fed meeting. Hints about future rate moves.'],
  [/fomc press|press conference/i, 'Fed press conference', "The Fed Chair explains the decision. Markets often swing during it."],
  [/federal funds|fomc statement|fomc economic|interest rate decision/i, 'Fed rate decision', 'The biggest scheduled market mover. Sets borrowing costs for everything.'],
  [/fed chair|powell|fomc member|fed .*speaks/i, 'Fed speech', 'Comments can shift what traders expect for rates.'],
  [/main refinancing|ecb/i, 'ECB rate decision', "Europe's central bank sets rates. Moves the euro."],
  [/official bank rate|boe/i, 'Bank of England rate decision', 'UK interest rates. Moves the pound.'],
  [/boj|policy rate/i, 'Bank of Japan rate decision', 'Japan interest rates. Moves the yen and global bonds.'],
  [/gdp/i, 'GDP', "The economy's growth score."],
  [/core retail sales/i, 'Core retail sales', 'Consumer spending without cars and gas.'],
  [/retail sales/i, 'Retail sales', 'How much shoppers spent. Consumers drive about 70% of the US economy.'],
  [/ism manufacturing|manufacturing pmi/i, 'Manufacturing survey (PMI)', 'Factory activity. Above 50 means growth.'],
  [/ism services|services pmi|non-manufacturing/i, 'Services survey (PMI)', 'Service-sector activity. Above 50 means growth.'],
  [/consumer confidence|consumer sentiment|uom/i, 'Consumer confidence', 'How upbeat people feel about spending.'],
  [/durable goods/i, 'Durable goods orders', 'Orders for big-ticket items. A read on business investment.'],
  [/crude oil inventories/i, 'Oil inventories', 'Weekly US oil stockpiles. Moves oil prices.'],
  [/housing starts|building permits|home sales|pending home/i, 'Housing data', 'Health of the housing market.'],
  [/empire state|philly fed/i, 'Regional factory survey', 'An early read on manufacturing.'],
  [/bank holiday/i, 'Bank holiday', ''],
];
function explain(e){ for (const [re, plain, meaning] of EXPLAIN) if (re.test(e.title)) return {plain, meaning}; return {plain:e.title, meaning:''}; }
function sayEvent(e){ const p = explain(e).plain; const m = p.match(/^(.*) \((.*)\)$/); return (PLACE[e.country]||e.country) + ' ' + (m ? `${m[2]} ${m[1].toLowerCase()}` : (/^(Fed|ECB|GDP|Bank|ISM|PCE|JOLTS)\b/.test(p) ? p : p.charAt(0).toLowerCase()+p.slice(1))) + (/report|decision|survey|minutes|speech|sales|claims|data|orders|inventories|confidence|openings|rate/i.test(p) ? '' : ' report'); }
function evTime(e){ return new Date(e.allDay && e.date ? e.date+'T12:00:00' : e.time); }
function evWhen(e, spoken){
  const d = evTime(e), now = new Date();
  const tm = d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
  const tmr = new Date(now); tmr.setDate(now.getDate()+1);
  let day;
  if (d.toDateString()===now.toDateString()) day = spoken ? 'today' : 'Today';
  else if (d.toDateString()===tmr.toDateString()) day = spoken ? 'tomorrow' : 'Tomorrow';
  else if (d - now < 6*864e5) day = d.toLocaleDateString('en-US', {weekday: spoken?'long':'short'});
  else day = d.toLocaleDateString('en-US', {weekday: spoken?'long':'short', month:'short', day:'numeric'});
  if (e.allDay) return day;
  return spoken ? `${day} at ${tm}` : `${day} ${tm}`;
}
function upcomingEvents(onlyHigh){
  const now = Date.now(); saidData = true;
  return ((data && data.calendar) || []).filter(e=>evTime(e).getTime() > now - 6e4 && (!onlyHigh || e.impact==='High'));
}
function nextBig(){ const hi = upcomingEvents(true); return hi.find(e=>e.country==='USD') || hi[0] || null; }
function earningsFor(sym){ return ((data && data.earnings) || []).find(e=>e.s===sym && e.date >= new Date(Date.now()-864e5).toISOString().slice(0,10)); }
function earnWhen(e){ const d = new Date(e.date+'T12:00:00'); const now = new Date(); const tmr = new Date(now); tmr.setDate(now.getDate()+1);
  return d.toDateString()===now.toDateString() ? 'today' : d.toDateString()===tmr.toDateString() ? 'tomorrow' : d.toLocaleDateString('en-US',{weekday:'long'}) + (d-now > 6*864e5 ? ' '+d.toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''); }

/* -------------------------------------------------------- news */
function allSymbolNews(syms){
  const seen = new Set(), out = [];
  const key = n=>(n.title||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,70);
  const push = (s,n)=>{ if (seen.has(n.link) || seen.has(key(n))) return; seen.add(n.link); seen.add(key(n)); out.push(Object.assign({sym:s}, n)); };
  const byS = (data && data.news_by_symbol) || {};
  syms.forEach(s=>(byS[s]||[]).forEach(n=>push(s,n)));
  ((data && data.news) || []).forEach(n=>{ const s = syms.find(x=>mentions(n.title, x)); if (s) push(s,n); });
  return out.sort((a,b)=>(b.time||'').localeCompare(a.time||''));
}
function mentions(title, sym){
  const n = nameOf(sym).toLowerCase().split(/[ ,]/)[0]; const t = title.toLowerCase();
  if (n.length >= 3 && new RegExp('\\b'+n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b').test(t)) return true;
  return sym.length >= 3 && !/[\^=-]/.test(sym) && new RegExp('\\b'+sym+'\\b').test(title);
}
function newsAgo(n){ return n.time ? J.ago(Date.parse(n.time)) : ''; }

/* -------------------------------------------------------- charts */
let gid = 0;
function series(q, range){ if (!q) return []; return (range==='5d' && q.d5 && q.d5.length > 1) ? q.d5 : (q.day && q.day.length > 1 ? q.day : (q.d5 || [])); }
function chartSVG(vals, opt){
  opt = opt || {}; const W = opt.w || 100, H = opt.h || 32, pad = opt.pad == null ? 2 : opt.pad;
  if (!vals || vals.length < 2) return `<svg viewBox="0 0 ${W} ${H}" class="fin-svg" preserveAspectRatio="none"><line x1="0" y1="${H/2}" x2="${W}" y2="${H/2}" style="stroke:var(--line)" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-dasharray="3 3"/></svg>`;
  const base = opt.base;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (base != null && opt.showBase){ lo = Math.min(lo, base); hi = Math.max(hi, base); }
  if (hi - lo < 1e-9){ hi += 1; lo -= 1; }
  const X = i => (i/(vals.length-1))*W, Y = v => pad + (1-(v-lo)/(hi-lo))*(H-2*pad);
  const pts = vals.map((v,i)=>`${X(i).toFixed(2)},${Y(v).toFixed(2)}`);
  const col = opt.dir==='up' ? 'var(--fin-up)' : opt.dir==='dn' ? 'var(--fin-dn)' : 'var(--muted)';
  const id = 'fing'+(++gid);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="fin-svg" preserveAspectRatio="none" aria-hidden="true">`;
  if (opt.area){
    s += `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${col};stop-opacity:.28"/><stop offset="1" style="stop-color:${col};stop-opacity:0"/></linearGradient></defs>`;
    s += `<path d="M${pts.join('L')}L${W},${H}L0,${H}Z" fill="url(#${id})"/>`;
  }
  if (base != null && opt.showBase && base >= lo && base <= hi) s += `<line x1="0" x2="${W}" y1="${Y(base).toFixed(2)}" y2="${Y(base).toFixed(2)}" style="stroke:var(--faint)" stroke-width="1" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>`;
  s += `<polyline points="${pts.join(' ')}" fill="none" style="stroke:${col}" stroke-width="${opt.sw||1.8}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  return s;
}
function spark(q, range){ return chartSVG(series(q, range||'1d'), {dir:dir(q), base:q&&q.prev, showBase: (range||'1d')==='1d'}); }
function bigChart(sym, range, h){
  const q = quote(sym); const vals = series(q, range);
  return `<div class="fin-chart" data-fin-chart="${J.esc(sym)}" data-range="${range}" style="height:${h}px">${chartSVG(vals, {w:300, h, pad:6, area:true, sw:2.2, dir:dir(q), base:q&&q.prev, showBase: range==='1d'})}<div class="fin-cursor"></div><div class="fin-tip"></div></div>`;
}

/* -------------------------------------------------------- styles */
J.css(`
:root{--fin-up:#22c55e;--fin-dn:#fb7185;--fin-pill-up:#15803d;--fin-pill-dn:#e11d48}
:root[data-theme="light"]{--fin-up:#15803d;--fin-dn:#e11d48;--fin-pill-up:#15803d;--fin-pill-dn:#e11d48}
.fin-up{color:var(--fin-up)}.fin-dn{color:var(--fin-dn)}.fin-flat{color:var(--muted)}
.fin-svg{display:block;width:100%;height:100%;overflow:visible}
.fin-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.fin-status{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--muted);font-weight:600;margin:2px 0 0;flex-wrap:wrap}
.fin-status b{color:var(--text);font-weight:700}
.fin-dot{width:8px;height:8px;border-radius:50%;background:var(--faint);flex:none;position:relative}
.fin-dot.open{background:var(--fin-up);box-shadow:0 0 0 0 rgba(34,197,94,.6);animation:finPulse 2s infinite}
.fin-dot.pre,.fin-dot.post{background:var(--warn)}
@keyframes finPulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)}70%{box-shadow:0 0 0 8px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
.fin-upd{font-size:12px;color:var(--faint-ink);margin:6px 0 14px;font-weight:500}
.fin-refresh svg{transition:transform .3s}
.fin-refresh.spin svg{animation:finSpin .9s linear infinite}
@keyframes finSpin{to{transform:rotate(360deg)}}
.fin-note{display:flex;gap:10px;align-items:flex-start;font-size:13px;color:var(--muted);background:var(--accent-soft);border-radius:14px;padding:11px 13px;margin:0 0 14px}
.fin-note b{color:var(--text)}
.fin-note.warn{background:rgba(245,158,11,.13)}
.fin-ni{flex:none;color:var(--warn-ink);display:flex}.fin-ni svg{width:18px;height:18px}.fin-btns .btn svg{width:18px;height:18px;margin-right:6px;vertical-align:-3px}
.fin-seg{position:sticky;top:calc(6px + var(--safe-t));z-index:5;background:var(--glass);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.fin-hero{padding:18px 18px 14px;position:relative;overflow:hidden}
.fin-hero .nm{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:700;color:var(--muted)}
.fin-hero .px{font-size:34px;font-weight:800;letter-spacing:-1.2px;line-height:1.1;margin-top:4px;font-variant-numeric:tabular-nums}
.fin-hero .ch{font-size:14px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums}
.fin-hero .ch span{color:var(--muted);font-weight:600}
.fin-range{display:flex;gap:2px;background:var(--line);border-radius:9px;padding:2px}
.fin-range button{border:0;background:none;color:var(--muted);font-weight:700;font-size:11.5px;padding:4px 9px;border-radius:7px;cursor:pointer}
.fin-range button.on{background:var(--card-solid);color:var(--text);box-shadow:0 1px 4px rgba(0,0,0,.18)}
.fin-chart{position:relative;margin:12px -4px 0;touch-action:pan-y;cursor:crosshair}
.fin-cursor{position:absolute;top:0;bottom:0;width:1px;background:var(--muted);opacity:0;pointer-events:none}
.fin-tip{position:absolute;top:-6px;transform:translateX(-50%);background:var(--card-solid);border:1px solid var(--line);border-radius:8px;padding:3px 7px;font-size:11.5px;font-weight:700;opacity:0;pointer-events:none;white-space:nowrap;box-shadow:var(--shadow);font-variant-numeric:tabular-nums}
.fin-chart.scrub .fin-cursor,.fin-chart.scrub .fin-tip{opacity:1}
.fin-foot{display:flex;justify-content:space-between;font-size:11.5px;color:var(--faint-ink);margin-top:8px;font-weight:600}
.fin-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
.fin-grid > .fin-tile:last-child:nth-child(odd){grid-column:1/-1}
.fin-tile{border:1px solid var(--line);background:var(--card);border-radius:18px;padding:12px 13px 11px;cursor:pointer;text-align:left;min-width:0;transition:transform .15s var(--ease)}
.fin-tile:active,.fin-row:active{transform:scale(.98)}
.fin-tile .t1{display:flex;justify-content:space-between;gap:6px;font-size:12px;font-weight:700;color:var(--muted)}
.fin-tile .t1 span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fin-tile .px{font-size:17px;font-weight:800;letter-spacing:-.3px;margin-top:3px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fin-tile .pc{font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.fin-tile .sp{height:30px;margin-top:8px}
.fin-list{background:var(--card);border:1px solid var(--line);border-radius:20px;overflow:hidden}
.fin-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-bottom:1px solid var(--line);cursor:pointer;width:100%;background:none;border-left:0;border-right:0;border-top:0;text-align:left;transition:transform .15s var(--ease)}
.fin-row:last-child{border-bottom:0}
.fin-row .who{flex:1;min-width:0}
.fin-row .tk{font-weight:800;font-size:15.5px;letter-spacing:-.2px}
.fin-row .nm{color:var(--muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fin-row .sp{width:64px;height:30px;flex:none}
.fin-row .rt{text-align:right;flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.fin-row .rt b{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.fin-pill{display:inline-block;min-width:72px;text-align:center;padding:4px 8px;border-radius:8px;font-weight:700;font-size:12.5px;color:#fff;background:var(--faint);font-variant-numeric:tabular-nums}
.fin-pill.up{background:var(--fin-pill-up)}.fin-pill.dn{background:var(--fin-pill-dn)}
.fin-x{flex:none;width:30px;height:30px;border-radius:50%;border:0;background:rgba(244,63,94,.14);color:var(--bad-ink);display:grid;place-items:center;cursor:pointer;font-size:16px;font-weight:800}
.fin-wait{font-size:12px;color:var(--muted);font-weight:600}
.fin-tools{display:flex;align-items:center;gap:8px;margin-bottom:12px}
.fin-tools .chip{padding:7px 12px;font-size:12.5px}
.fin-tools .chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
.fin-tools .grow{flex:1}
.fin-day{font-size:12.5px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.6px;margin:18px 4px 8px}
.fin-day:first-child{margin-top:4px}
.fin-ev{display:flex;gap:12px;padding:13px 14px;border-bottom:1px solid var(--line)}
.fin-ev:last-child{border-bottom:0}
.fin-ev.past{opacity:.55}
.fin-ev .tm{flex:none;width:62px;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums;padding-top:1px}
.fin-ev .tm .wd{display:block;color:var(--accent-ink);font-size:11.5px;font-weight:800;text-transform:uppercase;letter-spacing:.3px}
.fin-ev .tm small{display:block;color:var(--faint-ink);font-weight:600;font-size:11px;margin-top:2px}
.fin-ev .bd{flex:1;min-width:0}
.fin-ev .ti{font-weight:700;font-size:14.5px;display:flex;gap:6px;align-items:flex-start}
.fin-ev .ti span{flex:1}
.fin-ev .mn{color:var(--muted);font-size:12.5px;margin-top:3px;line-height:1.4}
.fin-ev .raw{color:var(--faint-ink);font-size:11.5px;margin-top:2px}
.fin-nums{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
.fin-nums span{font-size:11.5px;color:var(--muted);background:var(--line);border-radius:7px;padding:3px 7px;font-weight:600}
.fin-nums span b{color:var(--text)}
.fin-imp{flex:none;font-size:10.5px;font-weight:800;padding:3px 7px;border-radius:999px;text-transform:uppercase;letter-spacing:.4px}
.fin-imp.High{background:rgba(244,63,94,.15);color:var(--bad-ink)}:root[data-theme="light"] .fin-imp.High{color:#b4123a}
.fin-imp.Medium{background:rgba(245,158,11,.16);color:var(--warn-ink)}
.fin-imp.Holiday{background:var(--accent-soft);color:var(--accent-ink)}
.fin-news{display:block;padding:13px 14px;border-bottom:1px solid var(--line);color:inherit;text-decoration:none}
.fin-news:last-child{border-bottom:0}
.fin-news .ti{font-weight:600;font-size:14.5px;line-height:1.35}
.fin-news .mt{display:flex;gap:6px;align-items:center;color:var(--muted);font-size:12px;margin-top:5px;font-weight:500}
.fin-news .mt .src{font-weight:700;color:var(--text);opacity:.8}
.fin-sample{background:rgba(245,158,11,.16);color:var(--warn-ink);letter-spacing:.4px}
.fin-tag{font-size:10.5px;font-weight:800;padding:2px 6px;border-radius:6px;background:var(--accent-soft);color:var(--accent-ink)}
.fin-sk{background:linear-gradient(90deg,var(--line) 0%,rgba(255,255,255,.12) 50%,var(--line) 100%);background-size:200% 100%;animation:finSh 1.3s infinite;border-radius:12px}
:root[data-theme="light"] .fin-sk{background:linear-gradient(90deg,var(--line) 0%,rgba(255,255,255,.9) 50%,var(--line) 100%);background-size:200% 100%}
@keyframes finSh{to{background-position:-200% 0}}
.fin-hc{cursor:pointer;padding:14px}
.fin-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.fin-strip > div{min-width:0}
.fin-strip .n{font-size:11.5px;font-weight:700;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fin-strip .v{font-size:16px;font-weight:800;letter-spacing:-.3px;font-variant-numeric:tabular-nums;white-space:nowrap}
.fin-strip .sp{height:24px;margin-top:6px}
.fin-next{display:flex;align-items:center;gap:8px;margin-top:12px;padding-top:11px;border-top:1px solid var(--line);font-size:13px}
.fin-next .lb{color:var(--muted);font-weight:600;flex:none}
.fin-next .ev{flex:1;min-width:0;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fin-dt-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.fin-dt-top h4{margin:0 !important;font-size:20px !important;letter-spacing:-.3px}
.fin-dt-top small{display:block;color:var(--muted);font-size:13px;font-weight:600;margin-top:1px}
.fin-stats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:14px}
.fin-stats div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 10px;min-width:0}
.fin-stats span{display:block;font-size:11px;color:var(--muted);font-weight:600}
.fin-stats b{font-size:13.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
.fin-mbox{max-height:min(82vh,720px);overflow-y:auto;margin:-18px;padding:18px}
.fin-btns{display:flex;gap:8px;margin-top:14px}
.fin-btns .btn{flex:1}
.fin-sugg{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px}
.fin-sugg button{padding:7px 11px;font-size:12.5px}
`);

/* ------------------------------------------------------ view */
const ICON_REFRESH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>';
const SEGS = [['overview','Overview'],['watch','Watchlist'],['cal','Calendar'],['news','News']];
function agoTxt(u){ const a = J.ago(u); return a==='just now' ? 'just now' : /ago$/.test(a) ? a.replace(/m ago$/,' min ago').replace(/h ago$/,' hr ago') : 'on '+a; }
function updatedTxt(){
  if (!data) return '';
  if (data.sample) return 'Sample data · not real prices';
  if (data.sample_prices) return 'Prices are samples · news and calendar are live';
  const u = Date.parse(data.updated);
  if (isNaN(u)) return 'Refreshes every 30 min while the market is open';
  return 'Updated ' + agoTxt(u) + ' · refreshes every 30 min while the market is open';
}
function staleHours(){ if (!data) return 0; const u = Date.parse(data.updated); return isNaN(u) ? 0 : (Date.now()-u)/36e5; }

function renderView(el){
  viewEl = el;
  if (!el.__finBound){ bindView(el); el.__finBound = true; }
  const clk = marketClock();
  let h = `<div class="fin-head"><div><h2>Markets</h2><div class="fin-status"><i class="fin-dot ${clk.state}"></i><b>${clk.label}</b>${clk.sub?' · '+J.esc(clk.sub):''}</div></div>
    <button class="icon-btn fin-refresh ${loading?'spin':''}" data-fin-refresh aria-label="Refresh markets">${ICON_REFRESH}</button></div>
    <div class="fin-upd">${data ? J.esc(updatedTxt()) : '&nbsp;'}</div>`;
  if (!data){
    h += loading || !failed ? skeleton() :
      `<div class="empty"><div class="e-ic">${(J.icons && J.icons.info) || '📡'}</div>${failed==='offline' ? "You're offline, and there's no saved market data yet." : "Couldn't load market data right now."}<div style="margin-top:12px"><button class="btn" data-fin-refresh>Try again</button></div></div>`;
    el.innerHTML = h; return;
  }
  if (data.sample) h += `<div class="fin-note warn"><span class="fin-ni">${(J.icons && J.icons.info) || '🧪'}</span><span><b>Sample data, not real prices.</b> Live prices, news and the calendar appear after the first data update.</span></div>`;
  else if (data.sample_prices) h += `<div class="fin-note warn"><span class="fin-ni">${(J.icons && J.icons.info) || '🧪'}</span><span><b>Prices are sample numbers, not real.</b> Live prices appear after the next successful update. The news and calendar below are live.</span></div>`;
  else if (failed) h += `<div class="fin-note warn"><span class="fin-ni">${(J.icons && J.icons.info) || '📡'}</span><span>${failed==='offline'?"You're offline.":"Couldn't refresh."} Showing prices from ${J.esc(agoTxt(Date.parse(data.updated)).replace(/^on /,''))}.</span></div>`;
  else if (clk.state==='open' && staleHours() > 2) h += `<div class="fin-note warn"><span>⏳</span><span>These prices are about ${Math.round(staleHours())} hours old. The next update is on its way.</span></div>`;
  h += `<div class="seg fin-seg">${SEGS.map(([k,l])=>`<button data-fin-seg="${k}" class="${st.seg===k?'active':''}">${l}</button>`).join('')}</div>`;
  h += st.seg==='watch' ? watchHTML() : st.seg==='cal' ? calHTML() : st.seg==='news' ? newsHTML() : overviewHTML();
  el.innerHTML = h;
}
function skeleton(){
  return `<div class="fin-sk" style="height:42px;margin-bottom:14px"></div><div class="fin-sk" style="height:220px;border-radius:22px"></div>
    <div class="fin-grid">${'<div class="fin-sk" style="height:98px;border-radius:18px"></div>'.repeat(4)}</div>`;
}
function rangeToggle(){ return `<div class="fin-range">${[['1d','1D'],['5d','5D']].map(([k,l])=>`<button data-fin-range="${k}" class="${st.range===k?'on':''}">${l}</button>`).join('')}</div>`; }
function heroHTML(sym){
  const q = quote(sym); if (!q) return '';
  const d = dir(q); const ser = series(q, st.range);
  const fiveChg = st.range==='5d' && ser.length > 1 ? {chg:q.price-ser[0], pct:(q.price-ser[0])/ser[0]*100, kind:q.kind} : null;
  const shown = fiveChg || q; const dd = fiveChg ? dir(fiveChg) : d;
  return `<div class="card fin-hero" data-fin-open-q="${J.esc(sym)}">
    <div class="nm"><span>${J.esc(nameOf(sym))}</span>${rangeToggle()}</div>
    <div class="px">${px(q)}</div>
    <div class="ch fin-${dd}">${chgTxt(shown)} (${pctTxt(shown)}) <span>${fiveChg?'past 5 days':'today'}</span></div>
    ${bigChart(sym, st.range, 128)}
    <div class="fin-foot"><span>${q.lo!=null&&q.hi!=null?`Day range ${px({price:q.lo,kind:q.kind})} – ${px({price:q.hi,kind:q.kind})}`:''}</span><span>${q.prev!=null?'Prev close '+px({price:q.prev,kind:q.kind}):''}</span></div>
  </div>`;
}
function tileHTML(sym){
  const q = quote(sym); if (!q) return '';
  const d = dir(q);
  return `<button class="fin-tile" data-fin-open-q="${J.esc(sym)}"><div class="t1"><span>${J.esc(q.kind==='index'||q.kind==='rate'||q.kind==='vol'||q.kind==='commodity'||q.kind==='fx'||sym==='BTC-USD' ? nameOf(sym) : tickerLabel(sym))}</span></div>
    <div class="px">${px(q)}</div><div class="pc fin-${d}">${q.kind==='rate'?chgTxt(q):pctTxt(q)}${q.kind!=='rate'&&q.chg!=null?` <span style="color:var(--faint-ink);font-weight:600">${chgTxt(q)}</span>`:''}</div>
    <div class="sp">${spark(q, st.range)}</div></button>`;
}
function rowHTML(sym){
  const q = quote(sym);
  const x = editing ? `<button class="fin-x" data-fin-remove="${J.esc(sym)}" aria-label="Remove ${J.esc(sym)}">−</button>` : '';
  if (!q) return `<div class="fin-row" data-fin-open-q="${J.esc(sym)}">${x}<div class="who"><div class="tk">${J.esc(tickerLabel(sym))}</div><div class="nm">${J.esc(NAMES[sym]||'Added by you')}</div></div><div class="rt"><span class="fin-wait">Waiting for data</span></div></div>`;
  return `<div class="fin-row" data-fin-open-q="${J.esc(sym)}">${x}<div class="who"><div class="tk">${J.esc(tickerLabel(sym))}${q.stale?' <span class="fin-tag" title="Not updated in the last run">old</span>':''}</div><div class="nm">${J.esc(nameOf(sym))}</div></div>
    <div class="sp">${spark(q, st.range)}</div><div class="rt"><b>${px(q)}</b><span class="fin-pill ${dir(q)}">${pillTxt(q)}</span></div></div>`;
}
function evHTML(e, withDay){
  const x = explain(e); const past = evTime(e).getTime() < Date.now() - 6e4;
  const tm = (withDay ? `<span class="wd">${J.esc(evWhen(e).split(' ')[0].replace(/,$/,''))}</span>` : '') + (e.allDay ? 'All day' : evTime(e).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}));
  const nums = [['Actual',e.actual],['Forecast',e.forecast],['Previous',e.previous]].filter(n=>n[1]);
  if (e.impact==='Holiday'){
    const shut = e.country==='USD' && e.date && stockHolidayOn(e.date);
    x.plain = shut ? 'US stock market closed' : (PLACE[e.country]||e.country)+' bank holiday';
    x.meaning = shut ? 'Stocks and bonds don’t trade today.' : e.country==='USD' ? 'Banks and the bond market are closed. Stocks trade as normal.' : '';
  }
  return `<div class="fin-ev ${past?'past':''}"><div class="tm">${tm}<small>${FLAGS[e.country]||'🌐'} ${J.esc(e.country)}</small></div>
    <div class="bd"><div class="ti"><span>${J.esc(x.plain)}</span><em class="fin-imp ${J.esc(e.impact)}">${e.impact==='Holiday'?'Holiday':J.esc(e.impact)}</em></div>
    ${x.plain!==e.title?`<div class="raw">${J.esc(e.title)}</div>`:''}
    ${x.meaning && e.impact!=='Medium' ? `<div class="mn">${J.esc(x.meaning)}</div>` : ''}
    ${nums.length?`<div class="fin-nums">${nums.map(n=>`<span>${n[0]} <b>${J.esc(n[1])}</b></span>`).join('')}</div>`:''}</div></div>`;
}
function newsItemHTML(n){
  return `<a class="fin-news" href="${J.esc(n.link)}" target="_blank" rel="noopener noreferrer"><div class="ti">${J.esc(n.title)}</div>
    <div class="mt">${n.sym?`<span class="fin-tag">${J.esc(tickerLabel(n.sym))}</span>`:''}<span class="src">${J.esc(n.source||'')}</span>${n.time?'· '+J.esc(newsAgo(n)):''}</div></a>`;
}
function sectionH(title, seg){ return `<div class="section-h"><h3>${title}</h3>${seg?`<button class="link" data-fin-seg="${seg}">See all</button>`:''}</div>`; }

function overviewHTML(){
  const mk = (data.markets || ['^GSPC','^IXIC','^DJI','^VIX','^TNX','GC=F','CL=F','EURUSD=X','BTC-USD']).filter(s=>quote(s));
  let h = heroHTML(mk[0] || '^GSPC');
  h += `<div class="fin-grid">${mk.slice(1).map(tileHTML).join('')}</div>`;
  const movers = st.watchlist.map(s=>quote(s)).filter(q=>q && q.pct!=null).sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct)).slice(0,3);
  h += sectionH('Biggest movers on your watchlist', 'watch');
  h += movers.length ? `<div class="fin-list">${movers.map(q=>rowHTML(q.s)).join('')}</div>` : `<div class="empty"><div class="e-ic">${(J.icons && J.icons.chart) || '⭐'}</div>Say “Add Apple to my watchlist”.</div>`;
  const evs = upcomingEvents(true).slice(0,3);
  h += sectionH('Coming up', 'cal');
  h += evs.length ? `<div class="fin-list">${evs.map(e=>evHTML(e, true)).join('')}</div>` : `<div class="empty"><div class="e-ic">${(J.icons && J.icons.cal) || '📅'}</div>No big economic events scheduled in the next two weeks.</div>`;
  const news = (data.news||[]).slice(0,4);
  h += sectionH('Top headlines', 'news');
  h += news.length ? `<div class="fin-list">${news.map(newsItemHTML).join('')}</div>` : `<div class="empty"><div class="e-ic">${(J.icons && J.icons.notes) || '📰'}</div>No headlines yet.</div>`;
  return h;
}
function watchHTML(){
  let list = st.watchlist.slice();
  if (st.sort !== 'mine') list.sort((a,b)=>{ const pa = (quote(a)||{}).pct, pb = (quote(b)||{}).pct; const va = pa==null?-1e9:pa, vb = pb==null?-1e9:pb; return st.sort==='gain' ? vb-va : (pa==null?1e9:pa)-(pb==null?1e9:pb); });
  let h = `<div class="fin-tools">${[['mine','My order'],['gain','Gainers'],['lose','Losers']].map(([k,l])=>`<button class="chip ${st.sort===k?'on':''}" data-fin-sort="${k}">${l}</button>`).join('')}<span class="grow"></span>
    <button class="link" data-fin-edit>${editing?'Done':'Edit'}</button><button class="link" data-fin-add>+ Add</button></div>`;
  h += list.length ? `<div class="fin-list">${list.map(rowHTML).join('')}</div>` : `<div class="empty"><div class="e-ic">${(J.icons && J.icons.chart) || '⭐'}</div>Your watchlist is empty.<br>Say “Add Nvidia to my watchlist”.</div>`;
  const pend = list.filter(s=>!quote(s));
  if (pend.length) h += `<p style="color:var(--muted);font-size:12.5px;margin:12px 4px 0">“Waiting for data” means ${J.esc(pend.map(tickerLabel).join(', '))} ${pend.length>1?"aren't":"isn't"} in the market feed yet. Tap ${pend.length>1?'one':'it'} to see how to add it.</p>`;
  const earn = ((data.earnings)||[]).filter(e=>st.watchlist.includes(e.s));
  if (earn.length){ h += sectionH('Earnings coming up'); h += `<div class="fin-list">${earn.map(earnRowHTML).join('')}</div>`; }
  return h;
}
function earnRowHTML(e){
  return `<div class="fin-row" data-fin-open-q="${J.esc(e.s)}"><div class="who"><div class="tk">${J.esc(tickerLabel(e.s))} ${st.watchlist.includes(e.s)?'<span class="fin-tag">★ watchlist</span>':''}</div><div class="nm">${J.esc(e.name||nameOf(e.s))}${e.eps?' · EPS est. '+J.esc(e.eps):''}</div></div>
    <div class="rt"><b style="font-size:13.5px">${J.esc(J.cap(earnWhen(e)))}</b><span class="fin-wait">${J.esc(e.when||'time not set')}</span></div></div>`;
}
function calHTML(){
  let evs = ((data.calendar)||[]).slice();
  const todayStr = new Date().toDateString();
  evs = evs.filter(e=>evTime(e).getTime() >= new Date(new Date().setHours(0,0,0,0)).getTime());
  if (st.cal==='high') evs = evs.filter(e=>e.impact==='High' || e.impact==='Holiday');
  if (st.cal==='us') evs = evs.filter(e=>e.country==='USD');
  let h = `<div class="fin-tools">${[['all','All'],['high','High impact'],['us','US only']].map(([k,l])=>`<button class="chip ${st.cal===k?'on':''}" data-fin-cal="${k}">${l}</button>`).join('')}</div>`;
  if (!evs.length) h += `<div class="empty"><div class="e-ic">${(J.icons && J.icons.cal) || '📅'}</div>Nothing on the calendar for this filter.</div>`;
  const groups = []; evs.forEach(e=>{ const k = evTime(e).toDateString(); let g = groups.find(x=>x.k===k); if (!g){ g = {k, d:evTime(e), list:[]}; groups.push(g); } g.list.push(e); });
  const tmr = new Date(); tmr.setDate(tmr.getDate()+1);
  groups.forEach(g=>{
    const lbl = g.k===todayStr ? 'Today' : g.k===tmr.toDateString() ? 'Tomorrow' : '';
    h += `<div class="fin-day">${lbl?lbl+' · ':''}${g.d.toLocaleDateString([], {weekday:'long', month:'short', day:'numeric'})}</div><div class="fin-list">${g.list.map(e=>evHTML(e)).join('')}</div>`;
  });
  const earn = (data.earnings||[]).slice().sort((a,b)=>(st.watchlist.includes(b.s)-st.watchlist.includes(a.s)) || a.date.localeCompare(b.date)).slice(0,12);
  if (earn.length){ h += sectionH('Earnings'); h += `<div class="fin-list">${earn.map(earnRowHTML).join('')}</div>`; }
  h += `<p style="color:var(--faint-ink);font-size:12px;text-align:center;margin:16px 0 0">Times are in your local time. Calendar: Forex Factory.</p>`;
  return h;
}
function newsHTML(){
  let h = `<div class="fin-tools"><button class="chip ${st.news==='top'&&!newsSym?'on':''}" data-fin-news="top">Top stories</button><button class="chip ${st.news==='mine'&&!newsSym?'on':''}" data-fin-news="mine">My stocks</button>${newsSym?`<button class="chip on" data-fin-news="top">${J.esc(nameOf(newsSym))} ✕</button>`:''}</div>`;
  const list = newsSym ? allSymbolNews([newsSym]) : st.news==='mine' ? allSymbolNews(st.watchlist) : (data.news||[]);
  h += list.length ? `<div class="fin-list">${list.slice(0,30).map(newsItemHTML).join('')}</div>` : `<div class="empty"><div class="e-ic">${(J.icons && J.icons.notes) || '📰'}</div>${newsSym||st.news==='mine'?'No fresh headlines for your stocks right now.':'No headlines yet.'}</div>`;
  h += `<p style="color:var(--faint-ink);font-size:12px;text-align:center;margin:16px 0 0">Tap a headline to read it. Sources: CNBC, MarketWatch, Reuters, AP, Bloomberg, WSJ and more via Google News; Yahoo Finance for your stocks.</p>`;
  return h;
}

/* ------------------------------------------------------ interactions */
function bindView(el){
  el.addEventListener('click', e=>{
    const t = e.target;
    const r = t.closest('[data-fin-refresh]'); if (r){ load(true); return; }
    const sg = t.closest('[data-fin-seg]'); if (sg){ st.seg = sg.dataset.finSeg; editing = false; J.save(); paint(); window.scrollTo({top:0, behavior:'smooth'}); return; }
    const rg = t.closest('[data-fin-range]'); if (rg){ e.stopPropagation(); st.range = rg.dataset.finRange; J.save(); paint(); return; }
    const so = t.closest('[data-fin-sort]'); if (so){ st.sort = so.dataset.finSort; J.save(); paint(); return; }
    const ca = t.closest('[data-fin-cal]'); if (ca){ st.cal = ca.dataset.finCal; J.save(); paint(); return; }
    const nw = t.closest('[data-fin-news]'); if (nw){ st.news = nw.dataset.finNews; newsSym = null; J.save(); paint(); return; }
    const ed = t.closest('[data-fin-edit]'); if (ed){ editing = !editing; paint(); return; }
    const ad = t.closest('[data-fin-add]'); if (ad){ openAdd(); return; }
    const rm = t.closest('[data-fin-remove]'); if (rm){ e.stopPropagation(); removeSym(rm.dataset.finRemove, true); return; }
    if (t.closest('.fin-chart.scrub')) return;
    const oq = t.closest('[data-fin-open-q]'); if (oq && !t.closest('a')){ openDetail(oq.dataset.finOpenQ); return; }
  });
  bindScrub(el);
}
function bindScrub(root){
  let active = null;
  const move = ev=>{
    const c = active; if (!c) return;
    const q = quote(c.dataset.finChart); const vals = series(q, c.dataset.range); if (!vals.length) return;
    const rect = c.getBoundingClientRect(); const x = Math.max(0, Math.min(rect.width, ev.clientX - rect.left));
    const i = Math.round(x / rect.width * (vals.length-1)); const v = vals[i];
    c.classList.add('scrub');
    c.querySelector('.fin-cursor').style.left = (i/(vals.length-1)*rect.width)+'px';
    const tip = c.querySelector('.fin-tip'); tip.style.left = Math.max(34, Math.min(rect.width-34, i/(vals.length-1)*rect.width))+'px';
    const base = q.prev; const pc = base ? (v-base)/base*100 : null;
    tip.innerHTML = `${px({price:v, kind:q.kind})}${pc!=null && c.dataset.range==='1d' ? ` <span class="fin-${pc>=0?'up':'dn'}">${pc>=0?'+':'−'}${nf(Math.abs(pc),2)}%</span>` : ''}`;
  };
  const end = ()=>{ if (active){ const c = active; setTimeout(()=>c.classList.remove('scrub'), 900); } active = null; };
  root.addEventListener('pointerdown', ev=>{ const c = ev.target.closest('.fin-chart'); if (!c) return; active = c; move(ev); });
  root.addEventListener('pointermove', ev=>{ if (active) move(ev); else if (ev.pointerType==='mouse'){ const c = ev.target.closest('.fin-chart'); if (c){ active = c; move(ev); active = null; } } });
  root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
  root.addEventListener('pointerleave', ev=>{ const c = ev.target.closest && ev.target.closest('.fin-chart'); if (c) c.classList.remove('scrub'); }, true);
}

/* detail sheet */
let detailSym = null, detailRange = '1d';
function repoEditLink(){
  let owner = 'bilal-daou', repo = 'jarvis-2';
  try { if (/\.github\.io$/.test(location.hostname)){ owner = location.hostname.split('.')[0]; const seg = location.pathname.split('/').filter(Boolean)[0]; if (seg && !/\./.test(seg)) repo = seg; } } catch(e){}
  return `https://github.com/${owner}/${repo}/edit/main/data/watchlist.json`;
}
function detailHTML(sym){
  const q = quote(sym); const inList = st.watchlist.includes(sym);
  const close = `<button class="icon-btn" data-fin-close aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
  const btns = `<div class="fin-btns">${q?`<button class="btn ghost" data-fin-say>${(J.icons && J.icons.play) || ''}Hear it</button>`:''}<button class="btn ${inList?'danger':''}" data-fin-toggle>${inList?'Remove':'＋ Add to watchlist'}</button></div>`;
  if (!q) return `<div class="fin-mbox"><div class="fin-dt-top"><div><h4>${J.esc(tickerLabel(sym))}</h4><small>${J.esc(NAMES[sym]||'Added by you')}</small></div>${close}</div>
    <div class="fin-note" style="margin-top:14px"><span>⏳</span><span><b>No price yet.</b> ${J.esc(tickerLabel(sym))} isn't in Jarvis's market feed. It covers about 90 of the most-traded US stocks, ETFs and crypto. To add more, put the ticker in the feed list on GitHub and it shows up after the next update.</span></div>
    <a class="btn ghost" style="display:block;text-align:center;text-decoration:none" href="${repoEditLink()}" target="_blank" rel="noopener noreferrer">Open the feed list on GitHub</a>${btns}</div>`;
  const ser = series(q, detailRange);
  const five = detailRange==='5d' && ser.length > 1 ? {chg:q.price-ser[0], pct:(q.price-ser[0])/ser[0]*100, kind:q.kind} : null;
  const shown = five || q;
  const er = earningsFor(sym);
  const news = allSymbolNews([sym]).slice(0,4);
  const stat = (l,v)=> v==null ? '' : `<div><span>${l}</span><b>${px({price:v, kind:q.kind})}</b></div>`;
  return `<div class="fin-mbox"><div class="fin-dt-top"><div><h4>${J.esc(nameOf(sym))}</h4><small>${J.esc(tickerLabel(sym))}${q.t?' · '+J.esc(new Date(q.t*1000).toLocaleString([], {weekday:'short', hour:'numeric', minute:'2-digit'})):''}</small></div>${close}</div>
    <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-top:12px"><div><div style="font-size:32px;font-weight:800;letter-spacing:-1px;font-variant-numeric:tabular-nums;line-height:1.1">${px(q)}</div>
    <div class="fin-${dir(shown)}" style="font-weight:700;font-size:14px">${chgTxt(shown)} (${pctTxt(shown)}) <span style="color:var(--muted);font-weight:600">${five?'5 days':'today'}</span></div></div>
    ${q.d5 && q.d5.length>1 ? `<div class="fin-range">${[['1d','1D'],['5d','5D']].map(([k,l])=>`<button data-fin-drange="${k}" class="${detailRange===k?'on':''}">${l}</button>`).join('')}</div>` : ''}</div>
    ${bigChart(sym, detailRange, 150)}
    <div class="fin-stats">${stat('Prev close', q.prev)}${stat('Day high', q.hi)}${stat('Day low', q.lo)}${stat('52-wk high', q.h52)}${stat('52-wk low', q.l52)}${er?`<div><span>Earnings</span><b>${J.esc(J.cap(earnWhen(er)))}</b></div>`:''}</div>
    ${news.length?`<div class="section-h" style="margin-top:18px"><h3>News</h3></div><div class="fin-list">${news.map(n=>newsItemHTML(Object.assign({}, n, {sym:null}))).join('')}</div>`:''}
    ${btns}</div>`;
}
function openDetail(sym){
  detailSym = sym; detailRange = st.range === '5d' && quote(sym) && quote(sym).d5 ? '5d' : '1d';
  J.modal(detailHTML(sym));
  const box = document.getElementById('modalBox');
  if (box && !box.__finBound){
    box.__finBound = true; bindScrub(box);
    box.addEventListener('click', e=>{
      if (!detailSym || !box.querySelector('.fin-mbox')) return;
      const t = e.target;
      if (t.closest('[data-fin-close]')){ J.closeModal(); return; }
      const dr = t.closest('[data-fin-drange]'); if (dr){ detailRange = dr.dataset.finDrange; box.innerHTML = detailHTML(detailSym); return; }
      if (t.closest('[data-fin-say]')){ const was = J.settings.speak; J.settings.speak = true; J.speak(quoteSentence(detailSym)); J.settings.speak = was; return; }
      if (t.closest('[data-fin-toggle]')){ if (st.watchlist.includes(detailSym)) removeSym(detailSym, true); else addSyms([detailSym], true); box.innerHTML = detailHTML(detailSym); return; }
    });
  }
}
function openAdd(){
  const ideas = ['NVDA','AAPL','TSLA','AMZN','META','MSFT','GOOGL','AMD','PLTR','NFLX','COIN','SPY','QQQ','BTC-USD','ETH-USD','GC=F'].filter(s=>!st.watchlist.includes(s)).slice(0,10);
  J.modal(`<h4>Add to watchlist</h4><input id="finAddIn" placeholder="Company or ticker, e.g. Nvidia or NVDA" autocomplete="off" autocapitalize="characters">
    <div class="fin-sugg">${ideas.map(s=>`<button class="chip" data-fin-pick="${J.esc(s)}">${J.esc(tickerLabel(s))}</button>`).join('')}</div>
    <div class="row"><button class="btn ghost" id="finAddCancel">Cancel</button><button class="btn" id="finAddOk">Add</button></div>`);
  const inp = document.getElementById('finAddIn');
  const go = ()=>{ const raw = inp.value.trim(); if (!raw) return; const syms = raw.split(/\s*(?:,|\band\b|&)\s*/i).map(x=>resolve(x, true)).filter(Boolean);
    if (!syms.length){ J.toast(`Couldn't find “${raw}”. Try the ticker, like NVDA.`); return; } addSyms(syms, true); J.closeModal(); };
  document.getElementById('finAddOk').onclick = go;
  document.getElementById('finAddCancel').onclick = J.closeModal;
  inp.addEventListener('keydown', e=>{ if (e.key==='Enter') go(); });
  document.querySelectorAll('[data-fin-pick]').forEach(b=>b.onclick=()=>{ addSyms([b.dataset.finPick], true); J.closeModal(); });
  setTimeout(()=>{ try { inp.focus(); } catch(e){} }, 60);
}
function addSyms(syms, ui){
  const added = syms.filter(s=>!st.watchlist.includes(s));
  added.forEach(s=>st.watchlist.push(s)); J.save(); tryMissing(); paint();
  if (ui && added.length) J.toast(`Added ${added.map(tickerLabel).join(', ')} to your watchlist`, ()=>{ st.watchlist = st.watchlist.filter(s=>!added.includes(s)); J.save(); paint(); });
  return added;
}
function removeSym(sym, ui){
  const i = st.watchlist.indexOf(sym); if (i < 0) return false;
  st.watchlist.splice(i,1); J.save(); paint();
  if (ui) J.toast(`Removed ${tickerLabel(sym)}`, ()=>{ st.watchlist.splice(i,0,sym); J.save(); paint(); });
  return true;
}

/* ------------------------------------------------------ home card */
function renderHomeCard(el){
  homeEl = el;
  if (!el.__finBound){ el.__finBound = true; el.addEventListener('click', e=>{ if (e.target.closest('[data-go]')) return; if (e.target.closest('.fin-hc')){ st.seg = 'overview'; J.save(); J.go('finance'); paint(); } }); }
  const clk = marketClock();
  let h = `<div class="section-h"><h3>Markets</h3><button class="link" data-go="finance">Open</button></div>`;
  if (!data){ el.innerHTML = h + (loading||!failed ? `<div class="card fin-hc"><div class="fin-sk" style="height:62px"></div></div>` : `<div class="card fin-hc" style="color:var(--muted);font-size:13.5px">📡 Market data will show here once you're online.</div>`); return; }
  const cell = s=>{ const q = quote(s); if (!q) return ''; return `<div><div class="n">${J.esc(s==='BTC-USD'?'Bitcoin':nameOf(s))}</div><div class="v fin-${dir(q)}">${pctTxt(q)}</div><div class="sp">${spark(q,'1d')}</div></div>`; };
  const nb = nextBig();
  h += `<div class="card fin-hc"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:12px;color:var(--muted);font-weight:600"><span style="display:flex;align-items:center;gap:6px"><i class="fin-dot ${clk.state}"></i>${clk.label}</span>${samplePx()?`<span class="fin-tag fin-sample">${data.sample?'SAMPLE DATA':'SAMPLE PRICES'}</span>`:`<span>${J.esc(isNaN(Date.parse(data.updated))?'':agoTxt(Date.parse(data.updated)))}</span>`}</div>
    <div class="fin-strip">${['^GSPC','^IXIC','BTC-USD'].map(cell).join('')}</div>
    ${nb?`<div class="fin-next"><span class="lb">Next</span><span class="ev">${FLAGS[nb.country]||''} ${J.esc(explain(nb).plain)} · ${J.esc(evWhen(nb))}</span><em class="fin-imp High">High</em></div>`:''}</div>`;
  el.innerHTML = h;
}

/* ------------------------------------------------------ speech */
function quoteSentence(sym){
  const q = quote(sym); const nm = nameOf(sym);
  if (!q) return `${tickerLabel(sym)} isn't in my market feed yet, so I don't have a price for it.`;
  const er = earningsFor(sym);
  let s = `${SPOKEN[sym]||nm} is at ${spokenPrice(q)}, ${spokenMove(q)}${q.pct!=null&&q.kind!=='rate'&&Math.abs(q.pct)>=0.005&&!asOf(q)?' today':''}${asOf(q)}.`;
  if (er) s += ` It reports earnings ${earnWhen(er)}${er.when?' '+er.when:''}.`;
  return s;
}
function brief(){
  if (!data) return "I don't have market data yet. Give me a moment and ask again.";
  const parts = [];
  const sp = quote('^GSPC'), nq = quote('^IXIC'), dw = quote('^DJI');
  if (sp){
    const lead = asOf(sp) ? J.cap(asOf(sp).trim())+', the' : 'The';
    let s = `${lead} S&P 500 is ${spokenMove(sp)} at ${spokenPrice(sp)}`;
    const rest = [nq && `the Nasdaq is ${spokenMove(nq)}`, dw && `the Dow is ${spokenMove(dw)}`].filter(Boolean);
    s += rest.length ? ', ' + rest.join(', and ') + '.' : '.';
    parts.push(s);
  }
  const movers = st.watchlist.map(s=>quote(s)).filter(q=>q && q.pct!=null).sort((a,b)=>Math.abs(b.pct)-Math.abs(a.pct));
  if (movers[0]) parts.push(`On your watchlist, ${nameOf(movers[0].s)} is the biggest mover, ${spokenMove(movers[0])} at ${spokenPrice(movers[0])}.`);
  const btc = quote('BTC-USD'), ty = quote('^TNX');
  const extra = [btc && Math.abs(btc.pct||0) >= 2 && `Bitcoin is ${spokenMove(btc)}`, ty && Math.abs(ty.chg||0) >= 0.05 && `the 10-year yield is ${spokenMove(ty)} at ${spokenPrice(ty)}`].filter(Boolean);
  if (extra.length) parts.push(J.cap(extra.join(', and '))+'.');
  const nb = nextBig();
  if (nb) parts.push(`Next big event: the ${sayEvent(nb)}, ${evWhen(nb, true)}.`);
  if (samplePx()) parts.unshift('Heads up, these are sample numbers, not live prices, until the first price update.');
  else if (marketClock().state==='open' && staleHours() > 2) parts.push(`Heads up, this data is about ${Math.round(staleHours())} hours old.`);
  return parts.join(' ') || "I couldn't read the market data right now.";
}
function calendarSpeech(){
  const evs = upcomingEvents(true).filter(e=>e.impact!=='Holiday');
  const hol = upcomingEvents(false).find(e=>e.impact==='Holiday' && e.country==='USD' && e.date && stockHolidayOn(e.date));
  if (!evs.length) return 'No high-impact economic events coming up in the next two weeks.';
  const today = evs.filter(e=>evTime(e).toDateString()===new Date().toDateString());
  const list = (today.length ? today : evs).slice(0,4).map(e=>`${sayEvent(e)}, ${evWhen(e, true)}${e.forecast?`, forecast ${e.forecast}`:''}`);
  let s = (today.length ? 'Today: ' : 'Coming up: ') + list.join('. ') + '.';
  if (hol) s += ` The US stock market is closed ${evWhen(hol, true)} for a holiday.`;
  const er = ((data && data.earnings)||[]).filter(e=>st.watchlist.includes(e.s)).slice(0,2);
  if (er.length) s += ' Earnings: ' + er.map(e=>`${nameOf(e.s)} ${earnWhen(e)}`).join(', ') + '.';
  return s;
}
function findEvent(word){
  const map = {cpi:/cpi/i, ppi:/ppi/i, fomc:/federal funds|fomc statement/i, fed:/federal funds|fomc statement/i, 'fed meeting':/federal funds|fomc statement/i, 'fed decision':/federal funds|fomc statement/i, 'rate decision':/federal funds|fomc statement/i,
    'jobs report':/non-?farm/i, nfp:/non-?farm/i, 'non farm':/non-?farm/i, 'nonfarm':/non-?farm/i, gdp:/gdp/i, pce:/pce/i, 'retail sales':/retail sales/i, 'fed minutes':/minutes/i, 'fomc minutes':/minutes/i, 'jobless claims':/claims/i};
  const re = map[word]; if (!re) return undefined;
  return upcomingEvents(false).find(e=>re.test(e.title) && (e.country==='USD')) || null;
}

/* ------------------------------------------------------ voice intents */
function notReady(){ if (failed && !loading){ load(); return "I couldn't reach the market data just now. Check your connection and I'll try again."; } load(); return "I'm still loading the market data. Ask me again in a second."; }
const WL = '(?:my |the )?(?:watch ?list|stock list|stocks list|portfolio|stocks)';
J.addIntent((said, t0)=>{
  try {
    saidData = false;
    const r = intent(said, t0);
    if (typeof r === 'string' && saidData && samplePx() && !/sample/i.test(r)) return r + ' Note: this is sample data, not live market prices, until the first update.';
    return r;
  } catch(e){ console.error('finance intent', e); return null; }
});
function intent(said, t0){
  const t = t0.replace(/[.]+$/,'').replace(/^(?:hey |ok |okay )?jarvis\s*/,'').replace(/^(?:please |can you |could you )+/,'').replace(/\s+please$/,'').trim();
  let m;
  // market hours: "is the market open?", "when does the market open?"
  if (/^(?:is|are) (?:the )?(?:us |stock |stocks? )?(?:market|markets|stock market|wall street|nyse|nasdaq) (?:open|closed|trading)(?: now| today| right now)?$|^when (?:does|will) (?:the )?(?:us |stock )?(?:market|stock market) (?:open|close)(?: today| tomorrow)?$/.test(t)){
    const c = marketClock(); const sub = c.sub.replace(/^opens /,'it opens ').replace(/^closes /,'it closes ');
    return c.state==='open' ? `Yes, the US stock market is open now${sub ? ', and '+sub : ''}.` : c.state==='pre' ? `Not yet. It's pre-market right now${sub ? ', '+sub : ''}.` : c.state==='post' ? `The regular session is over. It's after hours now${sub ? ', '+sub : ''}.` : `The US stock market is closed right now${sub ? ', '+sub : ''}.`;
  }
  // the dollar: there's no dollar index in the feed, so answer with the euro rate
  if (/^how(?:'s|s| is| are) (?:the )?(?:us )?dollar(?: doing| today| looking)*$|\bdollar index\b|^(?:how(?:'s|s| is) )?(?:the )?dxy\b/.test(t)){
    if (!data){ return notReady(); }
    const q = quote('EURUSD=X'); J.go('finance');
    return q ? `I don't track the dollar index yet. One euro buys ${spokenPrice(q)} dollars, ${spokenMove(q)}.` : "I don't track the dollar yet.";
  }
  // open the screen
  if ((m = t.match(/^(?:open|show|show me|go to|take me to)\s+(?:the |my )?(markets?|stocks|stock market|watch ?list|finance|economic calendar|market news)(?: app| screen| page| tab)?$/))){
    const w = m[1]; st.seg = /watch/.test(w) ? 'watch' : /calendar/.test(w) ? 'cal' : /news/.test(w) ? 'news' : 'overview'; J.save(); J.go('finance');
    if (!data) load();
    return st.seg==='watch' ? 'Here is your watchlist.' : st.seg==='cal' ? 'Here is the economic calendar.' : st.seg==='news' ? 'Here are the latest market headlines.' : 'Here are the markets.';
  }
  // add to watchlist
  if ((m = t.match(new RegExp('^(?:add|put|include|start tracking|track|follow|watch)\\s+(.+?)\\s+(?:to|on|in|into)\\s+'+WL+'$')))){
    const names = m[1].split(/\s*(?:,|\band\b|&|\bplus\b)\s*/).filter(Boolean);
    const syms = names.map(n=>resolve(n, true));
    const bad = names.filter((n,i)=>!syms[i]);
    const good = syms.filter(Boolean);
    if (!good.length) return `I couldn't find a stock called ${m[1]}. Try saying the ticker, like N V D A.`;
    const added = addSyms(good, false); st.seg = 'watch'; J.save(); J.go('finance');
    const nm = good.map(nameOf);
    if (!added.length) return `${nm.join(' and ')} ${good.length>1?'are':'is'} already on your watchlist.`;
    let s = `Added ${added.map(nameOf).join(' and ')} to your watchlist.`;
    const q = added.length===1 ? quote(added[0]) : null;
    if (q) s += ` ${nameOf(added[0])} is at ${spokenPrice(q)}, ${spokenMove(q)}.`;
    else if (added.some(x=>!quote(x))) s += ` I don't have live prices for ${added.filter(x=>!quote(x)).map(tickerLabel).join(', ')} yet. Tap it on the watchlist to see how to add it to the feed.`;
    const had = good.filter(x=>!added.includes(x));
    if (had.length) s += ` ${had.map(nameOf).join(' and ')} ${had.length>1?'were':'was'} already there.`;
    if (bad.length) s += ` I couldn't find ${bad.join(', ')}.`;
    J.toast(`Added ${added.map(tickerLabel).join(', ')}`, ()=>{ st.watchlist = st.watchlist.filter(x=>!added.includes(x)); J.save(); paint(); });
    return s;
  }
  // remove from watchlist
  if ((m = t.match(new RegExp('^(?:remove|delete|drop|take|get rid of)\\s+(.+?)\\s+(?:off|from|out of)\\s+'+WL+'$'))) || (m = t.match(/^(?:stop (?:tracking|watching|following))\s+(.+)$/))){
    const names = m[1].split(/\s*(?:,|\band\b|&)\s*/).filter(Boolean);
    const syms = names.map(n=>resolve(n, !/^stop/.test(t))).filter(Boolean);
    const gone = syms.filter(s=>st.watchlist.includes(s));
    if (!syms.length) return /^stop/.test(t) ? null : `I couldn't find ${m[1]} on your watchlist.`;
    if (!gone.length) return `${syms.map(nameOf).join(' and ')} ${syms.length>1?"aren't":"isn't"} on your watchlist.`;
    const before = st.watchlist.slice();
    st.watchlist = st.watchlist.filter(s=>!gone.includes(s)); J.save(); st.seg = 'watch'; J.go('finance'); paint();
    J.toast(`Removed ${gone.map(tickerLabel).join(', ')}`, ()=>{ st.watchlist = before; J.save(); paint(); });
    return `Removed ${gone.map(nameOf).join(' and ')} from your watchlist.`;
  }
  // read the watchlist
  if (/^(?:what(?:'s|s| is| are) (?:on|in) my watch ?list|(?:read|tell) me my watch ?list|read my watch ?list|how(?:'s|s| is| are) my (?:watch ?list|stocks)(?: doing)?(?: today)?|my watch ?list|watch ?list)$/.test(t)){
    st.seg = 'watch'; J.save(); J.go('finance');
    if (!st.watchlist.length) return 'Your watchlist is empty. Say, add Apple to my watchlist.';
    if (!data){ load(); return `Your watchlist: ${st.watchlist.map(nameOf).join(', ')}. Prices are still loading.`; }
    const qs = st.watchlist.map(s=>quote(s)).filter(Boolean);
    const up = qs.filter(q=>q.pct>0).length, dn = qs.filter(q=>q.pct<0).length;
    const items = st.watchlist.slice(0,8).map(s=>{ const q = quote(s); return q ? `${nameOf(s)} ${spokenMove(q)}` : `${tickerLabel(s)}, no price yet`; });
    return `${up} up, ${dn} down${qs[0]?asOf(qs.find(q=>q.kind==='stock')||qs[0]):''}. ${items.join(', ')}.`;
  }
  // market brief
  if (/\b(?:markets?|stock market|trading|wall street) (?:brief|briefing|summary|update|recap|report|wrap(?: up)?|rundown)\b/.test(t)
    || /^(?:give me|read me|tell me|what(?:'s|s| is)) (?:my |the |a )?(?:daily |morning )?(?:market|markets|stock market) (?:brief|briefing|update|summary|rundown)/.test(t)
    || /^how(?:'s|s| is| are| did| were) (?:the )?(?:stock )?(?:markets?|stocks)(?: doing| looking| today| now| right now| this morning| close| do| end| today so far| holding up| going)*$/.test(t)
    || /^what(?:'s|s| is| are) the (?:stock )?markets? doing(?: today| right now)?$/.test(t)
    || /^how(?:'s|s| is) wall street(?: doing| today)*$/.test(t)
    || /^(?:how did|where did) (?:the )?(?:stock )?markets? (?:close|end|finish)(?: today)?$/.test(t)){
    st.seg = 'overview'; J.save(); J.go('finance');
    if (!data){ return notReady(); }
    return brief();
  }
  // economic calendar
  if ((m = t.match(/^when(?:'s|s| is) (?:the )?(?:next )?(cpi|ppi|fomc|fed meeting|fed decision|fed|rate decision|jobs report|nfp|non ?farm|nonfarm|gdp|pce|retail sales|fed minutes|fomc minutes|jobless claims)(?: report| number| data| release| meeting| decision)?$/))){
    const key = m[1].replace(/^non ?farm$/,'non farm');
    const e = findEvent(key); st.seg = 'cal'; J.save(); J.go('finance');
    if (!data){ return notReady(); }
    if (!e) return `I don't see the ${m[1].toUpperCase().length<=4?m[1].toUpperCase():m[1]} on the calendar for the next two weeks.`;
    return `${explain(e).plain} is ${evWhen(e, true)}, your time${e.forecast?`. Forecast ${e.forecast}`:''}${e.previous?`, previous ${e.previous}`:''}.${explain(e).meaning?' '+explain(e).meaning:''}`;
  }
  if (/\beconomic (?:calendar|events|data|releases|reports|news)\b|\becon calendar\b|^what(?:'s|s| is) on the calendar (?:for|in) the markets?|^(?:any|what are the) (?:big |major |important )?(?:economic|market) (?:events|reports|data)\b|^what(?:'s|s| is) (?:coming up|happening) (?:in|for) the markets?\b|^(?:who reports|any) earnings(?: this week| next week| today| tomorrow)?$|^earnings (?:this|next) week$/.test(t)){
    st.seg = 'cal'; J.save(); J.go('finance');
    if (!data){ return notReady(); }
    return calendarSpeech();
  }
  // market headlines
  if (/^(?:what(?:'s|s| is| are) the |give me the |read me the |any |the |latest |top )?(?:latest |top )?(?:stock market|market|markets|stock|finance|financial|business|wall street) (?:news|headlines)(?: today)?$/.test(t) || /^(?:what(?:'s|s| is) )?(?:the )?news (?:on|about|from|in) (?:the )?(?:stock )?(?:market|markets|wall street|stocks)(?: today)?$/.test(t)){
    st.seg = 'news'; st.news = 'top'; newsSym = null; J.save(); J.go('finance');
    if (!data){ return notReady(); }
    const n = (data.news||[]).slice(0,3);
    if (!n.length || data.sample) return "I don't have fresh market headlines yet. They'll show up after the next update.";
    return 'Top market headlines. ' + n.map(x=>`${x.title}, from ${x.source}`).join('. ') + '.';
  }
  // news on a company
  if ((m = t.match(/^(?:is there |are there |any |what(?:'s|s| is) (?:the )?|give me (?:the )?|show me (?:the )?|tell me (?:the )?|read me (?:the )?)?(?:latest |recent |new |any )?news (?:on|about|for|from) (.+)$/)) || (m = t.match(/^what(?:'s|s| is) (?:new|happening|going on) with (.+)$/))){
    const sym = resolve(m[1]); if (!sym) return null;
    if (!data){ return notReady(); }
    newsSym = sym; st.seg = 'news'; J.save(); J.go('finance');
    const n = allSymbolNews([sym]).slice(0,2); const q = quote(sym);
    const qs = q ? ` ${nameOf(sym)} is ${spokenMove(q)}${q.kind!=='rate'&&!asOf(q)?' today':''}${asOf(q)}.` : '';
    if (!n.length) return `I don't have fresh headlines on ${nameOf(sym)} right now.${qs}`;
    return `Latest on ${nameOf(sym)}: ${n[0].title}, from ${n[0].source}${n[0].time?', '+newsAgo(n[0]).replace(/m ago$/,' minutes ago').replace(/h ago$/,' hours ago'):''}.${n[1]?` Also: ${n[1].title}.`:''}${qs}`;
  }
  // a single quote
  const QP = [
    /^(?:what(?:'s|s| is) )?(?:the )?(?:current )?(?:stock |share )?price (?:of|for|on) (.+?)(?: today| right now| now)?$/,
    /^(.+?) (?:stock|share) price(?: today| right now| now)?$/,
    /^(?:how(?:'s|s| is| are| did)|what(?:'s|s| is| are)|where(?:'s|s| is| are)) (?:the )?(.+?)(?: stock| shares| share price| stock price| price)?(?: doing| trading| looking| at| trading at| performing| today| right now| now| so far| do| close| end| finish| close today)*$/,
    /^(?:check|quote|look up|get me|price check on) (.+?)(?: stock| price| quote)?$/,
    /^how much is (?:a share of |one )?(.+?)(?: stock| shares| worth| trading at| going for)*(?: today| right now| now)?$/
  ];
  for (const re of QP){
    const mm = t.match(re); if (!mm) continue;
    const sym = resolve(mm[1]); if (!sym) continue;
    if (!data){ return notReady(); }
    J.go('finance');
    return quoteSentence(sym);
  }
  return null;
}
J.addSuggestions(['Give me my market brief', "How's Tesla doing?", "What's on the economic calendar?", 'Add Nvidia to my watchlist', 'Any news on Apple?']);

/* ------------------------------------------------------ morning brief line */
function briefLine(){
  if (!data || data.sample) return null;                       // never read sample numbers as real
  const u = Date.parse(data.sample_prices ? (data.checked || data.updated) : data.updated); if (isNaN(u) || Date.now() - u > 4*864e5) return null;   // too old to be news
  const mv = q=>{ if (!q || q.pct==null || q.stale) return null; const a = Math.abs(q.pct); return a < 0.05 ? 'flat' : `${q.pct>0?'up':'down'} ${nf(a, 1)}%`; };
  const sp = quote('^GSPC'), nq = quote('^IXIC');
  const moves = data.sample_prices ? [] : [sp && mv(sp) && `S&P 500 ${mv(sp)}`, nq && mv(nq) && `Nasdaq ${mv(nq)}`].filter(Boolean);
  const todayStr = new Date().toDateString(), tmr = new Date(); tmr.setDate(tmr.getDate()+1);
  const p = nyParts(new Date());
  let ev = '';
  if (p.wd>=1 && p.wd<=5 && isHoliday(p.y,p.m,p.d)) ev = 'the US stock market is closed today for a holiday';
  else {
    const e = upcomingEvents(true).find(x=>x.country==='USD' && x.impact==='High' && !x.allDay && [todayStr, tmr.toDateString()].includes(evTime(x).toDateString()));
    if (e){
      const pl = explain(e).plain, m = pl.match(/\(([^)]+)\)$/); const nm = m ? m[1] : pl;
      const tm = evTime(e).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
      ev = `${nm} ${/decision|minutes|speech|conference/i.test(nm) ? 'is' : 'is out'} ${evTime(e).toDateString()===todayStr ? 'today' : 'tomorrow'} at ${tm}`;
    }
  }
  if (!moves.length && !ev) return null;
  const when = sp && moves.length ? asOf(sp).replace(/^ as of /,'') : '';
  return 'Markets' + (when ? ` at ${when}` : '') + ': ' + (moves.length ? moves.join(', ') + (ev ? '; ' + ev : '') : ev) + '.';
}
if (J.addBriefLine) J.addBriefLine(()=>{ try { return briefLine(); } catch(e){ return null; } });

/* ------------------------------------------------------ register */
J.addView({id:'finance', label:'Markets', icon:'📈', color:'#10b981', order:20, render(el){ renderView(el); }});
J.addHomeCard({id:'finance', order:30, render(el){ renderHomeCard(el); }});
J.finance = { get data(){ return data; }, quote, brief, briefLine, calendar: calendarSpeech, refresh: ()=>load(true) };

/* first load + keep fresh while the app is open */
const kick = ()=>{ try { load(false); } catch(e){} };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kick); else kick();
setInterval(()=>{ if (document.visibilityState === 'visible' && Date.now() - lastFetch > 5*6e4) load(false); }, 6e4);
document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState === 'visible' && Date.now() - lastFetch > 2*6e4) load(false); });
window.addEventListener('online', ()=>{ if (failed) load(false); });

} catch(err){ console.error('finance feature failed to start', err); }
})();
