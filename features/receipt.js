// Receipts feature: snap a photo of a receipt, read it on the phone (Tesseract.js), review, log as an expense.
(function(){
  'use strict';
  const J = window.Jarvis; if (!J) return;

  /* ---------------------------------------------------------
     CONFIG
     --------------------------------------------------------- */
  const TESS_VER = '5.1.1';
  const TESS_URL = `https://cdn.jsdelivr.net/npm/tesseract.js@${TESS_VER}/dist/tesseract.min.js`;
  const TESS_OPTS = {
    workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@${TESS_VER}/dist/worker.min.js`,
    corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${TESS_VER}`,
    langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int'
  };
  const DEFAULT_LBP_RATE = 89500;
  const CUR_OF_SETTING = {'$':'USD','€':'EUR','£':'GBP','L£':'LBP','LBP':'LBP','AED':'AED','SAR':'SAR'};
  const CUR_LABEL = {USD:'$', EUR:'€', GBP:'£', LBP:'LBP', AED:'AED', SAR:'SAR'};
  const CUR_SPOKEN = {USD:'dollars', EUR:'euros', GBP:'pounds', LBP:'lira', AED:'dirhams', SAR:'riyals'};

  function store(){
    const r = J.store('receipts', {list:[], meta:{}});
    if (!Array.isArray(r.list)) r.list = [];
    if (!r.meta || typeof r.meta !== 'object') r.meta = {};
    return r;
  }
  const userCur = () => CUR_OF_SETTING[J.settings.currency] || 'USD';
  const esc = s => J.esc(s == null ? '' : s);

  /* =========================================================
     PARSER (pure functions, exposed for tests)
     ========================================================= */
  // "1,234.50" "1.234,50" "12,50" "1,500,000" "23.50" -> number (null if not a money amount)
  function parseAmount(tok){
    if (tok == null) return null;
    tok = String(tok).trim().replace(/^[^\d]+/, '').replace(/[^\d]+$/, '');
    if (!tok || !/^\d[\d.,]*$/.test(tok)) return null;
    const dots = (tok.match(/\./g)||[]).length, commas = (tok.match(/,/g)||[]).length;
    let v = null;
    if (dots && commas){
      const last = Math.max(tok.lastIndexOf('.'), tok.lastIndexOf(','));
      const frac = tok.slice(last+1), intp = tok.slice(0, last);
      const groups = intp.split(/[.,]/);
      if (!groups.slice(1).every(g=>g.length===3) || groups[0].length > 3) return null;
      if (frac.length === 3) v = +(intp.replace(/[.,]/g,'') + frac);
      else if (frac.length <= 2 && frac.length) v = +(intp.replace(/[.,]/g,'') + '.' + frac);
      else return null;
    } else if (dots || commas){
      const sep = dots ? '.' : ',';
      const parts = tok.split(sep);
      if (parts.length > 2){
        const mid = parts.slice(1, -1), last = parts[parts.length-1];
        if (parts[0].length > 3 || !mid.every(g=>g.length===3)) return null;
        if (last.length === 3) v = +parts.join('');
        else if (last.length >= 1 && last.length <= 2) v = +(parts.slice(0,-1).join('') + '.' + last);
        else return null;
      } else {
        const [a, b] = parts;
        if (!b.length) v = +a;
        else if (b.length === 3 && a.length <= 3 && a !== '0') v = +(a + b);
        else if (b.length <= 3) v = +(a + '.' + b);
        else return null;
      }
    } else {
      if (tok.length > 9) return null;
      v = +tok;
    }
    return isFinite(v) ? v : null;
  }

  const CUR_RES = [
    ['LBP', /\bLBP\b|\bL\.\s?L\b\.?|\bLL\b|L£|ل\.?\s?ل|ليرة|\blira\b/i],
    ['USD', /\$|\bUSD\b|\bUS\s?D\b|\bdollars?\b/i],
    ['EUR', /€|\bEUR\b|\beuros?\b/i],
    ['GBP', /£|\bGBP\b/i],
    ['AED', /\bAED\b|د\.إ/i],
    ['SAR', /\bSAR\b|ر\.س/i]
  ];
  function lineCur(l){ for (const [c, re] of CUR_RES) if (re.test(l)) return c; return null; }

  const MONTHS = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,sept:8,oct:9,nov:10,dec:11};
  const DATE_RES = [
    /\b(20\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})\b/,                         // 2026-11-15
    /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.]((?:20)?\d{2})\b/,                    // 15/11/2026, 11/15/26
    /\b(\d{1,2})[\s\-.\/]*(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?[\s\-.,\/]*((?:20)?\d{2})\b/i, // 15 Nov 2026
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?[\s\-.]*(\d{1,2})(?:st|nd|rd|th)?[\s,.\-\/]*((?:20)?\d{2})\b/i // Nov 15, 2026
  ];
  function mkDate(y, m, d){
    if (y < 100) y += 2000;
    if (m < 0 || m > 11 || d < 1 || d > 31) return null;
    const dt = new Date(y, m, d, 12, 0, 0, 0);
    return dt.getMonth() === m ? dt : null;
  }
  function plausible(dt, now){ if (!dt) return false; const diff = dt.getTime() - now.getTime(); return diff < 2*864e5 && diff > -6*365*864e5; }
  function dateFromLine(l, now){
    let m;
    if ((m = l.match(DATE_RES[0]))){ const d = mkDate(+m[1], +m[2]-1, +m[3]); if (plausible(d, now)) return d; }
    if ((m = l.match(DATE_RES[1]))){
      const a = +m[1], b = +m[2], y = +m[3];
      const dm = mkDate(y, b-1, a), md = mkDate(y, a-1, b); // DD/MM vs MM/DD
      const ok = [dm, md].filter(d=>plausible(d, now));
      if (ok.length === 2 && dm.getTime() !== md.getTime()){
        // ambiguous: choose the one closest to today (DD/MM wins ties; common in Lebanon)
        return Math.abs(now - dm) <= Math.abs(now - md) ? dm : md;
      }
      if (ok.length) return ok[0];
    }
    if ((m = l.match(DATE_RES[2]))){ const d = mkDate(+m[3], MONTHS[m[2].toLowerCase().slice(0, m[2].length>=4&&/^sept/i.test(m[2])?4:3)], +m[1]); if (plausible(d, now)) return d; }
    if ((m = l.match(DATE_RES[3]))){ const d = mkDate(+m[3], MONTHS[m[1].toLowerCase().slice(0, /^sept/i.test(m[1])?4:3)], +m[2]); if (plausible(d, now)) return d; }
    return null;
  }
  function parseDate(text, now){
    now = now || new Date();
    const lines = String(text).split(/\n/);
    const order = lines.map((l,i)=>({l, i, pri: /date|تاريخ/i.test(l) ? 0 : 1})).sort((a,b)=>a.pri-b.pri || a.i-b.i);
    for (const {l} of order){
      const d = dateFromLine(l, now);
      if (d){
        const t = l.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)(?::[0-5]\d)?\s*(am|pm|ph|ah|an|pn)?\b/i); // OCR reads "PM" as "PH"
        if (t){ let h = +t[1]; if (t[3]){ const pm = /p/i.test(t[3]); if (h === 12) h = pm?12:0; else if (pm) h += 12; } d.setHours(h, +t[2], 0, 0); }
        return d;
      }
    }
    return null;
  }

  const STRONG = /(grand\s*tota[l1]|tota[l1]\s*(due|to\s*pay|amount|payable|ttc|usd|lbp|l\.?\s?l|net|incl)|amount\s*(due|payable|to\s*pay)|balance\s*due|net\s*(to\s*pay|a\s*payer|à\s*payer|payable|amount|tota[l1])|[àa]\s*payer|montant\s*(tota[l1]|ttc|net)|\bttc\b|incl(uding|\.)?\s*(vat|tax|tva)|المجموع|الإجمالي|الاجمالي|المبلغ|الصافي|المطلوب)/i;
  const TOTAL = /\b(tota[l1]|totai|t0tal|totaal)\b/i;
  const WEAK = /\b(net|amount|sum|balance|to\s*pay)\b/i;
  const NEG = /(sub\s*-?\s*tota[l1]|subtota[l1]|sous\s*-?\s*tota[l1]|nb\.?\s*(d.?)?articles?|nombre\s*d.?articles|\brendu\b|\bmonnaie\b|\bcb\b|tota[l1]\s*(items?|qty|quantity|savings?|discounts?|tax|vat|tva|before|excl|ht\b|pieces|count|units)|\btax\b|\bvat\b|\btva\b|\bchange\b|\bcash\b|tender|\bpaid\b|\bcard\b|visa|master|amex|debit|credit|saving|discount|\btip\b|gratuity|rounding|points|loyalty|\bqty\b|items?\s*sold|no\.?\s*of\s*items|\bht\b|hors\s*tax|deposit|refund|\brate\b|exchange|\bauth|approval|you\s*saved|balance\s*(remaining|left))/i;
  const SKIP_NUM = /(\btel\b|phone|\bfax\b|mobile|\bmob\b|whatsapp|invoice\s*(no|#|num)|receipt\s*(no|#|num)|\border\b|\btable\b|\bcover|\bguests?\b|\bterminal|\bstore\s*#|\bcashier|\breg\b|\btrans|\bvat\s*(no|#|reg|id)|\bmof\b|\btva\s*no|\bref\b|\bbarcode|\bacct|\baccount|\bp\.?o\.?\s*box|\bzip\b|\bserver\b|\bwaiter\b|\bchk\b|\bcheck\s*#|\bseq|\bbatch|\bpump\b|\blit(re|er)s?\b|\bnozzle|\bgallons?\b|\bpos\b|\bmid\b|\btid\b|\*{2,}|x{4,}\d)/i;
  const HEADER_SKIP = /(\btel\b|phone|\bfax\b|mobile|www\.|\.com|\.lb\b|@|street|\bst\.|\broad\b|\brd\b|\bave\b|avenue|\bblvd\b|building|\bbldg\b|floor|\bp\.?o\.?\s*box|beirut|lebanon|hamra|achrafieh|ashrafieh|jounieh|verdun|dbayeh|zalka|jdeideh|kaslik|byblos|jbeil|saida|tripoli|\bwelcome\b|thank|receipt|invoice|\bbill\b|\bvat\b|\btva\b|\bmof\b|\bcashier|\btable\b|\border\b|\bdate\b|\btime\b|\bcopy\b|\bsuite\b|\bunit\b|\b[A-Z]{2}\s\d{5}\b|\b\d{5}(-\d{4})?$)/i;

  const BRANDS = [
    ['spinneys','Spinneys'],['carrefour','Carrefour'],['charcutier aoun','Charcutier Aoun'],['le charcutier','Le Charcutier'],['monoprix','Monoprix'],['bou khalil','Bou Khalil'],['fahed','Fahed Supermarket'],['happy discount','Happy Discount'],['tsc','TSC'],['makhazen','Makhazen'],['goodies','Goodies'],
    ['walmart','Walmart'],['target','Target'],['costco','Costco'],['kroger','Kroger'],['whole foods','Whole Foods'],["trader joe",'Trader Joe\'s'],['safeway','Safeway'],['aldi','Aldi'],['lidl','Lidl'],['publix','Publix'],
    ['cvs','CVS Pharmacy'],['walgreens','Walgreens'],['mazen pharmacy','Mazen Pharmacy'],['starbucks','Starbucks'],["mcdonald",'McDonald\'s'],['kfc','KFC'],['burger king','Burger King'],['subway','Subway'],['zaatar w zeit','Zaatar W Zeit'],['roadster','Roadster Diner'],['malak al tawook','Malak al Tawook'],['barbar','Barbar'],['crepaway','Crepaway'],
    ['ikea','IKEA'],['zara','Zara'],['h&m','H&M'],['abc ','ABC'],['virgin megastore','Virgin Megastore'],['medco','Medco'],['ipt','IPT'],['coral','Coral'],['hypco','Hypco'],['total energies','TotalEnergies'],['totalenergies','TotalEnergies'],['shell','Shell'],['chevron','Chevron'],['exxon','Exxon']
  ];
  const CAT_HINTS = {
    Groceries:   ['supermarket','vcoop','coop','super market','hypermarket','grocery','grocer','market','épicerie','epicerie','spinneys','carrefour','charcutier','monoprix','bou khalil','fahed','happy discount','tsc','makhazen','walmart','kroger','whole foods','trader joe','safeway','aldi','lidl','publix','costco','produce','dairy','bakery','milk','bread','eggs','banana','tomato','cucumber','yogurt','labneh','cheese','rice','chicken breast','vegetable','fruit','detergent'],
    'Food & drink':['restaurant','resto','cafe','café','coffee','bistro','grill','diner','kitchen','pizza','burger','shawarma','sushi','snack','bakery & cafe','starbucks','mcdonald','kfc','burger king','subway','zaatar','roadster','tawook','barbar','crepaway','dine in','dine-in','take away','takeaway','delivery','waiter','server','covers','gratuity','service charge','hummus','fattoush','tabbouleh','mezza','mezze','kebab','argileh','nargileh','espresso','latte','cappuccino','fries','beverage','soft drink','pepsi','coca','lemonade','dessert','manakish','manoushe','boulangerie','patisserie','pâtisserie','brasserie','baguette','croissant','pain au chocolat'],
    Health:      ['pharmacy','pharmacie','pharma','drug store','drugstore','cvs','walgreens','clinic','hospital','medical','laboratory','dental','dentist','optic','tablet','tablets','capsule','caps','syrup','mg','panadol','advil','vitamin','prescription','rx','bandage','sunscreen','paracetamol','ibuprofen'],
    Transport:   ['fuel','petrol','gasoline','diesel','unleaded','octane','gas station','station service','medco','ipt','coral','hypco','uniterminals','shell','chevron','exxon','total energies','totalenergies','nozzle','pump','litres','liters','price/l','parking','valet','taxi','car wash','toll'],
    Bills:       ['electricity','edl','generator','alfa','touch','ogero','internet','water bill','subscription','insurance','utility'],
    Shopping:    ['mall','boutique','fashion','apparel','clothing','zara','h&m','ikea','abc','virgin','electronics','shoes','store'],
    Fun:         ['cinema','movie','theatre','theater','ticket','bowling','concert','club','pub','lounge']
  };
  function pickCategory(merchant, items, text){
    const m = (merchant||'').toLowerCase(), it = (items||[]).map(x=>x.n||x).join(' ').toLowerCase(), all = String(text||'').toLowerCase();
    const has = (hay, k) => k.length <= 3 ? new RegExp('\\b'+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\b').test(hay) : hay.includes(k);
    let best = null, bestScore = 0;
    for (const [cat, keys] of Object.entries(CAT_HINTS)){
      let s = 0;
      for (const k of keys){ if (has(m, k)) s += 5; if (has(it, k)) s += 1; else if (has(all, k)) s += 0.5; }
      if (cat === 'Shopping') s *= 0.6; // generic words like "store" are weak signals
      if (s > bestScore){ bestScore = s; best = cat; }
    }
    if (best && bestScore >= 1 && J.CATS[best]) return best;
    try { const c = J.categorize((merchant||'') + ' ' + it); if (c && J.CATS[c]) return c; } catch(e){}
    return 'Other';
  }

  function cleanLine(l){
    return l.replace(/[٠-٩]/g, c=>String(c.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, c=>String(c.charCodeAt(0) - 0x6F0)) // Arabic digits
      .replace(/[|¦]/g, ' ')
      .replace(/[\d.,][oO]+|[oO]+[.,]\d/g, s=>s.replace(/[oO]/g,'0'))
      .replace(/(^|\s)[S§](?=\d+[.,]\d{2}\b)/g, '$1$')
      .replace(/(\d)\s+([.,])\s*(\d{2})\b/g, '$1$2$3')
      .replace(/(\d)\s*([.,])\s+(\d{2})\b/g, '$1$2$3')
      .replace(/\s+/g, ' ').trim();
  }
  function stripNoise(l){
    return l.replace(/\b\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b/g, ' ')
      .replace(/\b\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?\b/gi, ' ')
      .replace(/\d+(?:[.,]\d+)?\s?%/g, ' ')
      .replace(/#\s?\d+/g, ' ');
  }
  function amountsIn(l){
    const out = []; const s = stripNoise(l); const re = /\d[\d.,]*/g; let m;
    while ((m = re.exec(s))){
      const raw = m[0].replace(/[.,]+$/, '');
      const before = s.slice(Math.max(0, m.index - 4), m.index);
      if (/\p{L}$/u.test(before) && !/(usd|lbp|l\.?l|eur|aed|sar|ttc)$/i.test(before)) continue; // "SPF50" style tokens
      const after = s.slice(m.index + m[0].length, m.index + m[0].length + 4);
      if (/^(mg|mcg|g|gr|gm|kg|ml|cl|l|lt|ltr|oz|cm|mm|pcs?|pk)(?![a-z])/i.test(after)) continue; // "500mg", "2kg", "1L": sizes, not prices
      const v = parseAmount(raw);
      if (v == null) continue;
      out.push({v, raw, dec: /[.,]\d{1,2}$/.test(raw), idx: m.index, end: m.index + m[0].length});
    }
    return out;
  }
  function titleCase(s){ return s.toLowerCase().replace(/(^|[\s\-'&])([a-z])/g, (a,b,c)=>b+c.toUpperCase()).replace(/\b(Llc|Inc|Sal|Sarl|Ltd)\b/g, w=>w.toUpperCase()); }
  const near = (a, b) => Math.abs(a - b) <= Math.max(0.02, Math.abs(b) * 0.015);

  /* Lebanese supermarkets (Spinneys, Carrefour, Coop...) print the bill twice on the TOTAL line:
     "Total LB FUSD122.70 10,982,032.00" plus "Rate: 89,500". OCR often garbles the long LBP number,
     so read the short USD amount (fixing look-alike letters: I→1, T→7, Z→2...) and the printed rate,
     and check them against each other. When it adds up, the USD amount is the total. */
  const LOOK = {I:'1', l:'1', '|':'1', i:'1', Z:'2', z:'2', O:'0', o:'0', D:'0', Q:'0', S:'5', s:'5', T:'7', B:'8', g:'9', G:'6'};
  const fixDigits = s => s.replace(/[Il|iZzOoDQSsTBgG]/g, c=>LOOK[c]);
  function lebaneseDual(lines, res){
    let rate = null;
    for (const l of lines){
      const m = l.match(/\brate\b\s*[:=]?\s*(?:\$?1\s*=\s*)?([\dIlOoSZ][\dIlOoSZ.,\s]{4,9})/i);
      if (m){ const v = parseAmount(fixDigits(m[1]).replace(/\s/g,'')); if (v >= 1000 && v <= 300000){ rate = v; break; } }
    }
    let usd = null, lbp = null;
    for (let i = 0; i < lines.length; i++){
      const l = lines[i];
      // the "Total" word and the FUSD amount sometimes land on neighbouring OCR lines
      const isTot = s => s && /tota[l1]/i.test(s) && !/sub\s*-?\s*tota[l1]|subtota[l1]/i.test(s);
      if (!isTot(l) && !(/F?U[S5$]D/i.test(l) && !/cash|@/i.test(l) && (isTot(lines[i-1]) || isTot(lines[i+1])))) continue;
      const u = l.match(/(?:F?U[S5$]D|\$)\s*([\dIlOoSZTB|]{1,5}[.,][\dIlOoSZTB]{2})(?![\d])/i);
      if (u){ const v = parseAmount(fixDigits(u[1])); if (v > 0 && v < 100000){ usd = v;
        const rest = l.slice(u.index + u[0].length); const big = amountsIn(rest).filter(a=>a.v >= 1000).pop(); if (big) lbp = big.v; break; } }
    }
    if (rate) res.rate = rate;
    if (usd == null) return;
    const lbpTotal = rate ? Math.round(usd * rate) : lbp;
    const agrees = rate && lbp && near(lbp, usd * rate);
    // no rate printed and no LBP number to check against: still trust a "Total ... USD x.xx" line over anything else
    res.total = usd; res.currency = 'USD'; res.dual = true;
    if (lbpTotal) res.alt = {total: lbpTotal, currency: 'LBP'};
    res.conf = agrees ? 'high' : (rate || lbp ? 'medium' : res.conf === 'none' ? 'low' : res.conf);
  }

  function parseReceipt(text, opts){
    opts = opts || {};
    const now = opts.now || new Date();
    const prefer = opts.currency || userCur();
    const lines = String(text||'').split(/\r?\n/).map(cleanLine).filter(l=>l && /[\p{L}\d]/u.test(l));
    const res = {merchant:'', date:null, total:null, currency:null, items:[], conf:'none', alt:null, subtotal:null, tax:null, tip:null};

    // ---- currency per line + overall
    const curCount = {};
    const lc = lines.map(l=>{ for (const [c, re] of CUR_RES) if (re.test(l)) curCount[c] = (curCount[c]||0) + 1; return lineCur(l); });
    const mainCur = Object.entries(curCount).sort((a,b)=>b[1]-a[1])[0];
    const hasUSD = !!curCount.USD;

    // ---- merchant
    const lower = lines.slice(0, 12).join('\n').toLowerCase();
    const brand = (/\bv\s*c+\s*o+\s*o*\s*p+\b|\bu\s*c\s*c\s*m\b|central\s*markets/i.test(lower) ? ['coop', 'VCoop'] : null) || BRANDS.find(([k])=> k.trim().length <= 3 ? new RegExp('\\b'+k.trim()+'\\b').test(lower) : lower.includes(k));
    let merchantIdx = -1;
    if (brand) res.merchant = brand[1];
    for (let i = 0; i < Math.min(lines.length, 8) && !res.merchant; i++){
      const l = lines[i];
      const letters = (l.match(/\p{L}/gu)||[]).length, nonSpace = l.replace(/\s/g,'').length;
      if (letters < 3 || letters / nonSpace < 0.6) continue;
      if (HEADER_SKIP.test(l) || SKIP_NUM.test(l) || STRONG.test(l) || TOTAL.test(l)) continue;
      if (amountsIn(l).some(a=>a.dec)) continue;
      let name = l.replace(/[^\p{L}\d&'.\- ]/gu, ' ').replace(/\s+/g, ' ').replace(/^[\s.\-']+|[\s.\-']+$/g, '').trim();
      name = name.replace(/(\s[^\s\d&])+$/u, '').replace(/^([^\s\d&]\s)+/u, '').trim(); // stray OCR letters at the ends
      if (name.length < 3) continue;
      if (name === name.toUpperCase() && /[A-Z]/.test(name)) name = titleCase(name);
      name = name.replace(/(^|\s)(\p{L}{1,3})\.\s+(?=\p{L}{3})/gu, '$1$2 '); // "Al. Forn" -> "Al Forn" (OCR dot)
      res.merchant = name.slice(0, 40); merchantIdx = i;
    }
    if (brand){ const i = lines.findIndex(l=>l.toLowerCase().includes(brand[0].trim())); merchantIdx = i; }

    // ---- date
    const d = parseDate(lines.join('\n'), now);
    res.date = d;

    // ---- total candidates
    const cands = []; let firstTotalIdx = lines.length;
    const curFor = (i, a) => {
      if (lc[i]) {
        // a line can carry two currencies (e.g. "TOTAL $23.50 / LBP 2,103,250"): use the symbol closest to the number
        const l = stripNoise(lines[i]);
        let best = null, bd = 1e9;
        for (const [c, re] of CUR_RES){ const g = new RegExp(re.source, 'gi'); let mm; while ((mm = g.exec(l))){ const dist = Math.min(Math.abs(mm.index - a.end), Math.abs(mm.index + mm[0].length - a.idx)); if (dist < bd){ bd = dist; best = c; } if (!mm[0].length) g.lastIndex++; } }
        return best || lc[i];
      }
      if (!a.dec && a.v >= 5000 && (hasUSD || prefer === 'USD') && !curCount.EUR) return 'LBP';
      if (mainCur && !(mainCur[0] === 'LBP' && a.dec && a.v < 1000)) return mainCur[0];
      return null;
    };
    for (let i = 0; i < lines.length; i++){
      const l = lines[i];
      const strong = STRONG.test(l), total = TOTAL.test(l), weak = WEAK.test(l);
      const neg = NEG.test(l.replace(/incl(uding|\.)?\s*(vat|tax|tva)/ig, ''));
      if (/sub\s*-?\s*tota[l1]|subtota[l1]|sous\s*-?\s*tota[l1]/i.test(l)){ const a = amountsIn(l).filter(x=>x.dec||x.v>=1000).pop(); if (a) res.subtotal = res.subtotal == null ? a.v : res.subtotal; firstTotalIdx = Math.min(firstTotalIdx, i); continue; }
      if (/\b(tip|gratuity|pourboire)\b/i.test(l) && !strong){ const a = amountsIn(l).filter(x=>x.dec).pop(); if (a && res.tip == null) res.tip = a.v; }
      if (/\b(tax|vat|tva)\b/i.test(l) && !strong){ const a = amountsIn(l).filter(x=>x.dec).pop(); if (a && res.tax == null) res.tax = a.v; }
      let score = 0;
      if (strong) score = 100; else if (total && !neg) score = 80; else if (weak && !neg) score = 40;
      if (!score || (neg && !strong)) { if (strong || total) firstTotalIdx = Math.min(firstTotalIdx, i); continue; }
      firstTotalIdx = Math.min(firstTotalIdx, i);
      let amts = amountsIn(l), from = i;
      if (!amts.length && lines[i+1] && !NEG.test(lines[i+1])){ amts = amountsIn(lines[i+1]); from = i+1; score -= 5; }
      for (const a of amts){
        if (a.v <= 0) continue;
        if (!a.dec && a.v < 100 && amts.some(b=>b.dec)) continue; // "Total items 3 ... 23.50"
        const cur = curFor(from, a) || lc[i] || null;
        cands.push({v:a.v, cur, score: score + (i / Math.max(lines.length,1)) * 10 + (a.dec ? 3 : 0), line:i});
      }
    }

    // ---- line items (between header and the first total line)
    let items = [];
    for (let i = Math.max(0, merchantIdx + 1); i < firstTotalIdx; i++){
      const l = lines[i];
      if (SKIP_NUM.test(l) || NEG.test(l) || STRONG.test(l) || TOTAL.test(l) || HEADER_SKIP.test(l) && !/\d[.,]\d{2}/.test(l)) continue;
      if (dateFromLine(l, now) && !/[\p{L}]{3,}.*\d[.,]\d{2}\s*$/u.test(l)) continue;
      const amts = amountsIn(l); if (!amts.length) continue;
      const lastA = amts[amts.length-1];
      const tail = stripNoise(l).slice(lastA.end).replace(/[\s$€£A-Za-z.]/g, '');
      if (tail.length > 2) continue; // amount must sit at the end of the line
      let name = stripNoise(l).slice(0, lastA.idx)
        .replace(/^\s*\d{4,}\s+/, '').replace(/^\s*\d+\s*[xX×]\s+/, '').replace(/^\s*\d{1,2}\s+(?=\p{L})/u, '')
        .replace(/(?:\s+(?:[xX×@]\s*)?(?:[$€£]|usd|lbp|l\.?l\.?)?\s*\d[\d.,]*\s*(?:[xX×@]|usd|lbp|l\.?l\.?|[$€£])?)+\s*$/i, '').replace(/\s*[xX×@]\s*$/, '')
        .replace(/\b(usd|lbp|l\.?l|eur)\b|[$€£]/gi, ' ').replace(/[^\p{L}\d&'%\-\/ .]/gu, ' ').replace(/\s+/g, ' ').trim();
      if ((name.match(/\p{L}/gu)||[]).length < 2) continue;
      let price = lastA.v;
      if (amts.length >= 2 && curCount.USD && curCount.LBP && amts[amts.length-2].dec){
        const a = amts[amts.length-2].v, b = lastA.v;
        const big = Math.max(a,b), small = Math.min(a,b);
        if (small > 0 && big / small >= 500){ price = (prefer === 'LBP') ? big : small; }
      }
      if (!(price > 0)) continue;
      name = name.replace(/\b0(?=[a-z]{2,}\b)/g, 'O');
      if (name.length > 38) name = name.slice(0, 38).trim() + '…';
      if (name === name.toUpperCase() && /[A-Z]{2}/.test(name)) name = titleCase(name);
      items.push({n: name, p: Math.round(price*100)/100, d: lastA.dec});
      if (items.length >= 40) break;
    }
    res.items = items;

    // ---- choose the total
    const byCur = {};
    cands.forEach(c=>{ const k = c.cur || '?'; const b = byCur[k]; if (!b || c.score > b.score + 0.001 || (Math.abs(c.score-b.score) < 6 && c.v > b.v && c.line >= b.line - 1)) byCur[k] = c; });
    const groups = Object.entries(byCur).map(([k,c])=>Object.assign({k}, c));
    let pick = null;
    if (groups.length){
      groups.sort((a,b)=> (b.score - a.score));
      const pref = groups.find(g=>g.k === prefer && g.score >= 70);
      pick = pref || groups[0];
      const other = groups.find(g=>g !== pick && g.k !== '?' && g.k !== pick.k && g.score >= 70);
      if (other) res.alt = {total: other.v, currency: other.k};
      res.total = pick.v; res.currency = pick.k === '?' ? null : pick.k;
      res.conf = 'medium';
    }
    const curGuess = res.currency || (mainCur && mainCur[0]) || null;
    if (curGuess === 'LBP') items = items.filter(x=>x.p >= 1000);               // LBP prices are never tiny
    else if (res.total != null) items = items.filter(x=>x.p <= res.total * 1.01); // nothing costs more than the bill
    if (curGuess !== 'LBP' && items.filter(x=>x.d).length >= 3) items = items.filter(x=>x.d); // "NB ARTICLES 20", "RICE 2KG" misreads
    items = items.map(x=>({n:x.n, p:x.p}));
    res.items = items;
    const itemSum = Math.round(items.reduce((s,x)=>s+x.p,0)*100)/100;
    if (res.total == null){
      // no "total" keyword: fall back to the largest money-looking amount that is not cash/change/tax
      let best = null;
      lines.forEach((l, i)=>{ if (NEG.test(l) || SKIP_NUM.test(l)) return; amountsIn(l).forEach(a=>{ if (a.dec && (!best || a.v > best.v)) best = {v:a.v, cur: curFor(i, a)}; }); });
      if (best){ res.total = best.v; res.currency = best.cur; res.conf = 'low'; }
      else if (itemSum > 0){ res.total = itemSum; res.conf = 'low'; }
    }
    if (res.total != null){
      const sub = res.subtotal, tx = res.tax || 0, tp = res.tip || 0;
      // one item equal to the total proves little (a junk read does that), so the items must be at least two
      const checks = [items.length >= 2 ? itemSum : null, sub, sub != null ? sub + tx : null, sub != null ? sub + tx + tp : null].filter(x=>x != null && x > 0);
      if (checks.some(x=>near(x, res.total))) res.conf = 'high';
      if (res.conf === 'low' && items.length >= 2 && near(itemSum, res.total)) res.conf = 'medium';
    }
    lebaneseDual(lines, res);
    if (!res.currency){
      const amts = res.total;
      res.currency = (amts != null && amts >= 5000 && Number.isInteger(amts) && prefer === 'USD') ? 'LBP' : (mainCur ? mainCur[0] : prefer);
    }
    res.itemSum = itemSum;
    return res;
  }

  /* =========================================================
     IMAGE PREP (canvas): downscale, grayscale, contrast, adaptive threshold
     ========================================================= */
  function loadImg(url){ return new Promise((res, rej)=>{ const im = new Image(); im.onload = ()=>res(im); im.onerror = ()=>rej(new Error('decode')); im.src = url; }); }
  function grayOf(ctx, w, h){
    const px = ctx.getImageData(0, 0, w, h).data, n = w*h, g = new Uint8ClampedArray(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (px[j]*0.299 + px[j+1]*0.587 + px[j+2]*0.114) | 0;
    return g;
  }
  function integral(a, w, h){
    const I = new Float64Array((w+1)*(h+1));
    for (let y = 1; y <= h; y++){ let row = 0; for (let x = 1; x <= w; x++){ row += a[(y-1)*w + x-1]; I[y*(w+1)+x] = I[(y-1)*(w+1)+x] + row; } }
    return I;
  }
  function boxSum(I, w, h, x, y, r){
    const x1 = Math.max(0, x-r), x2 = Math.min(w-1, x+r), y1 = Math.max(0, y-r), y2 = Math.min(h-1, y+r);
    return [I[(y2+1)*(w+1)+(x2+1)] - I[y1*(w+1)+(x2+1)] - I[(y2+1)*(w+1)+x1] + I[y1*(w+1)+x1], (x2-x1+1)*(y2-y1+1)];
  }
  function percentile(a, p){ const hist = new Uint32Array(256); for (let i = 0; i < a.length; i++) hist[a[i]]++; let acc = 0; const want = a.length*p; for (let v = 0; v < 256; v++){ acc += hist[v]; if (acc >= want) return v; } return 255; }
  // Estimate how tilted the text lines are (degrees) with a projection profile on a small copy.
  function estimateSkew(img, W0, H0){
    const s = Math.min(1, 640 / Math.max(W0, H0)); const w = Math.max(1, Math.round(W0*s)), h = Math.max(1, Math.round(H0*s));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(img, 0, 0, w, h);
    const g = grayOf(ctx, w, h), I = integral(g, w, h), r = Math.max(6, Math.round(Math.max(w,h)/50));
    const paper = percentile(g, 0.95);
    const xs = [], ys = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
      const [sm, cnt] = boxSum(I, w, h, x, y, r); const mean = sm/cnt;
      if (mean > paper*0.6 && g[y*w+x] < mean*0.78){ xs.push(x); ys.push(y); }
    }
    if (xs.length < 200) return 0;
    const score = deg => { const t = Math.tan(deg*Math.PI/180), off = w, bins = new Float64Array(h + 2*w + 2); for (let i = 0; i < xs.length; i++){ const yy = Math.round(ys[i] - xs[i]*t) + off; if (yy >= 0 && yy < bins.length) bins[yy]++; } let q = 0; for (let i = 0; i < bins.length; i++) q += bins[i]*bins[i]; return q; };
    let best = 0, bestS = score(0); const s0 = bestS;
    for (let d = -8; d <= 8.001; d += 0.5){ const v = score(d); if (v > bestS){ bestS = v; best = d; } }
    for (let d = best - 0.4; d <= best + 0.401; d += 0.1){ const v = score(d); if (v > bestS){ bestS = v; best = d; } }
    return bestS > s0*1.04 ? Math.round(best*10)/10 : 0;
  }
  function prepImage(img){
    const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height;
    const long = Math.max(W0, H0);
    const s = long > 1600 ? 1600/long : long < 1000 ? Math.min(2, 1300/long) : 1;
    const w = Math.max(1, Math.round(W0*s)), h = Math.max(1, Math.round(H0*s)), n = w*h;
    let angle = 0; try { angle = estimateSkew(img, W0, H0); } catch(e){}
    const gc = document.createElement('canvas'); gc.width = w; gc.height = h;
    const ctx = gc.getContext('2d', {willReadFrequently:true});
    ctx.imageSmoothingQuality = 'high';
    if (Math.abs(angle) >= 0.3){
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.translate(w/2, h/2); ctx.rotate(-angle*Math.PI/180); ctx.drawImage(img, -w/2, -h/2, w, h); ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else ctx.drawImage(img, 0, 0, w, h);
    const raw = grayOf(ctx, w, h);
    // contrast stretch between the 1st and 99th percentile
    const stretch = a => { const lo = percentile(a, 0.01), hi = percentile(a, 0.99), span = Math.max(hi - lo, 1); if (hi - lo > 12) for (let i = 0; i < n; i++) a[i] = (a[i] - lo) * 255 / span; return a; };
    const g0 = stretch(Uint8ClampedArray.from(raw));
    // sharpness estimate (variance of the Laplacian on a sparse grid)
    let lsum = 0, lsq = 0, lc = 0;
    for (let y = 2; y < h-2; y += 2) for (let x = 2; x < w-2; x += 2){ const i = y*w + x; const L = 4*g0[i] - g0[i-1] - g0[i+1] - g0[i-w] - g0[i+w]; lsum += L; lsq += L*L; lc++; }
    const lapVar = lc ? lsq/lc - (lsum/lc)*(lsum/lc) : 0;
    // grayscale canvas (first read; best for clear photos)
    const id = ctx.createImageData(w, h), px = id.data;
    for (let i = 0, j = 0; i < n; i++, j += 4){ px[j] = px[j+1] = px[j+2] = g0[i]; px[j+3] = 255; }
    ctx.putImageData(id, 0, 0);
    // adaptive threshold (Bradley) on a lightly smoothed copy: handles shadows and uneven light
    function threshold(src){
      const sm3 = new Uint8ClampedArray(n);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
        let t = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++){ const yy = y+dy; if (yy < 0 || yy >= h) continue; for (let dx = -1; dx <= 1; dx++){ const xx = x+dx; if (xx < 0 || xx >= w) continue; t += src[yy*w+xx]; c++; } }
        sm3[y*w+x] = t / c;
      }
      const I = integral(sm3, w, h);
      const paper = percentile(sm3, 0.95);
      const r = Math.max(8, Math.round(Math.max(w, h) / 40)), R = r*3, T = 0.15;
      const bc = document.createElement('canvas'); bc.width = w; bc.height = h;
      const bctx = bc.getContext('2d'); const bid = bctx.createImageData(w, h), bp = bid.data;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
        const i = y*w + x, j = i*4;
        const [sm, cnt] = boxSum(I, w, h, x, y, r);
        let v = sm3[i]*cnt < sm*(1-T) ? 0 : 255;
        if (!v){ const [bs, bcnt] = boxSum(I, w, h, x, y, R); if (bs/bcnt < paper*0.3) v = 255; } // dark table around the paper: ignore
        bp[j] = bp[j+1] = bp[j+2] = v; bp[j+3] = 255;
      }
      bctx.putImageData(bid, 0, 0);
      return bc;
    }
    const bc = threshold(g0);
    // grayscale with the light evened out (shadows, a dark corner, a faded side): divide each pixel by the local
    // background brightness. Tesseract's own black-and-white step works well on it. Made only if the first reads fail.
    let flatC = null;
    const flatGray = () => {
      if (flatC) return flatC;
      const Iraw = integral(raw, w, h), rawPaper = percentile(raw, 0.95), g = new Uint8ClampedArray(n), rb = Math.max(16, Math.round(Math.max(w, h) / 25));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++){
        const i = y*w + x, [sm, cnt] = boxSum(Iraw, w, h, x, y, rb), bg = sm/cnt;
        g[i] = bg < rawPaper*0.3 ? raw[i] : 255 * raw[i] / Math.max(1, bg*1.1); // a dark table stays as it is
      }
      stretch(g);
      flatC = document.createElement('canvas'); flatC.width = w; flatC.height = h;
      const fx = flatC.getContext('2d'), fd = fx.createImageData(w, h), fp = fd.data;
      for (let i = 0, j = 0; i < n; i++, j += 4){ fp[j] = fp[j+1] = fp[j+2] = g[i]; fp[j+3] = 255; }
      fx.putImageData(fd, 0, 0);
      return flatC;
    };
    return {bin: bc, gray: gc, flatGray, w, h, angle, blurry: lapVar < 120, lapVar};
  }
  function makeThumb(img){
    try {
      const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height;
      const s = Math.min(300/W0, 640/H0, 1);
      const c = document.createElement('canvas'); c.width = Math.round(W0*s); c.height = Math.round(H0*s);
      const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, c.width, c.height);
      let q = 0.62, url = c.toDataURL('image/jpeg', q);
      while (url.length > 45000 && q > 0.3){ q -= 0.1; url = c.toDataURL('image/jpeg', q); }
      while (url.length > 45000 && c.width > 120){ // very detailed photo: shrink until it fits (keeps phone storage small)
        const c2 = document.createElement('canvas'); c2.width = Math.round(c.width*0.8); c2.height = Math.round(c.height*0.8);
        c2.getContext('2d').drawImage(c, 0, 0, c2.width, c2.height); c.width = c2.width; c.height = c2.height; c.getContext('2d').drawImage(c2, 0, 0);
        url = c.toDataURL('image/jpeg', q);
      }
      return url;
    } catch(e){ return ''; }
  }

  // A copy of the photo turned by 90/180/270 degrees (for receipts photographed sideways or upside down).
  function rotCanvas(img, deg){
    const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height;
    const side = deg % 180 !== 0, c = document.createElement('canvas');
    c.width = side ? H0 : W0; c.height = side ? W0 : H0;
    const ctx = c.getContext('2d'); ctx.translate(c.width/2, c.height/2); ctx.rotate(deg*Math.PI/180); ctx.drawImage(img, -W0/2, -H0/2);
    return c;
  }

  /* =========================================================
     AI READER (optional): if the user saved a free Google Gemini key (food photos), use it for receipts too.
     Any problem falls back to the on-phone reader below.
     ========================================================= */
  const AI_RCPT_PROMPT = `Read this photo of a shop or restaurant receipt so the person can log the expense.
- store: the shop or restaurant name as printed near the top (short, no address, no "SAL"/"LLC" unless part of the name). Empty if you can't read it.
- date: the purchase date as YYYY-MM-DD, empty if not printed. Receipts often write the day first (15/11/2026 means 15 November). time: HH:MM in 24-hour time, empty if not printed.
- total: the final amount the customer paid (grand total / total due / net to pay / المجموع). Never the subtotal, tax, cash given, change, card slip amount, savings or loyalty points.
- currency: the currency of that total (USD, LBP, EUR, GBP, AED or SAR).
- Some bills print the total twice, in US dollars and in Lebanese pounds (with an exchange rate). Then give the dollar amount in total with currency USD, the pounds amount in totalLbp, and the printed rate (pounds per dollar) in lbpRate.
- items: each bought product with its final line price (as printed, same currency as total). Skip discounts, deposits and tax lines.
- isReceipt: false if the photo is not a receipt or bill.
Copy numbers exactly as printed; do not guess digits you cannot see (leave the field empty or 0 instead).`;
  const AI_RCPT_SCHEMA = {
    type:'OBJECT',
    properties:{
      isReceipt:{type:'BOOLEAN'}, store:{type:'STRING'}, date:{type:'STRING'}, time:{type:'STRING'},
      total:{type:'NUMBER'}, currency:{type:'STRING', enum:['USD','LBP','EUR','GBP','AED','SAR']},
      totalLbp:{type:'NUMBER', nullable:true}, lbpRate:{type:'NUMBER', nullable:true},
      subtotal:{type:'NUMBER', nullable:true}, tax:{type:'NUMBER', nullable:true},
      items:{type:'ARRAY', items:{type:'OBJECT', properties:{name:{type:'STRING'}, price:{type:'NUMBER'}}, required:['name','price'], propertyOrdering:['name','price']}}
    },
    required:['isReceipt','store','date','total','currency','items'],
    propertyOrdering:['isReceipt','store','date','time','total','currency','totalLbp','lbpRate','subtotal','tax','items']
  };
  const aiOn = () => !!(J.ai && J.ai.hasKey && J.ai.hasKey() && J.ai.gemini);
  function jpegB64(img, maxSide){
    const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height, s = Math.min(1, maxSide / Math.max(W0, H0));
    const c = document.createElement('canvas'); c.width = Math.round(W0*s); c.height = Math.round(H0*s);
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, c.width, c.height);
    const u = c.toDataURL('image/jpeg', 0.85); return u.slice(u.indexOf(',') + 1);
  }
  // turn the AI's JSON into the same shape parseReceipt() returns (numbers checked)
  function normalizeAIReceipt(j, now){
    j = j || {}; now = now || new Date();
    const num = v => { const x = typeof v === 'number' ? v : parseAmount(v); return isFinite(x) && x > 0 ? Math.round(x*100)/100 : null; };
    const res = {merchant:'', date:null, total:null, currency:null, items:[], conf:'none', alt:null, subtotal:null, tax:null, tip:null, ai:true};
    if (j.isReceipt === false) return res;
    res.merchant = String(j.store || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (res.merchant === res.merchant.toUpperCase() && /[A-Z]{2}/.test(res.merchant)) res.merchant = titleCase(res.merchant);
    const dm = String(j.date || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (dm){ const d = mkDate(+dm[1], +dm[2]-1, +dm[3]); if (plausible(d, now)){ const t = String(j.time || '').match(/^([01]?\d|2[0-3]):([0-5]\d)/); if (t) d.setHours(+t[1], +t[2], 0, 0); res.date = d; } }
    res.total = num(j.total); res.currency = CUR_LABEL[j.currency] ? j.currency : null;
    res.subtotal = num(j.subtotal); res.tax = num(j.tax);
    const rate = num(j.lbpRate); if (rate && rate >= 1000 && rate <= 300000) res.rate = rate;
    const lbp = num(j.totalLbp);
    if (res.currency === 'USD' && lbp && lbp >= 1000){ res.alt = {total: lbp, currency: 'LBP'}; res.dual = true; }
    res.items = (Array.isArray(j.items) ? j.items : []).map(x=>({n: String((x && x.name) || '').replace(/\s+/g, ' ').trim().slice(0, 38), p: num(x && x.price)})).filter(x=>x.n && x.p).slice(0, 40);
    res.itemSum = Math.round(res.items.reduce((s,x)=>s+x.p, 0)*100)/100;
    if (res.total != null){
      const checks = [res.itemSum, res.subtotal, res.subtotal != null ? res.subtotal + (res.tax || 0) : null].filter(x=>x);
      const dualOk = res.dual && res.rate && near(lbp, res.total * res.rate);
      res.conf = (checks.some(x=>near(x, res.total)) || dualOk) ? 'high' : 'medium';
    }
    return res;
  }
  async function aiRead(img){
    const r = await J.ai.gemini([{text: AI_RCPT_PROMPT}, {inline_data:{mime_type:'image/jpeg', data: jpegB64(img, 1600)}}], {schema: AI_RCPT_SCHEMA, temperature: 0.1, timeout: 45000});
    return normalizeAIReceipt(r.json);
  }

  /* =========================================================
     OCR (Tesseract.js, lazy, runs on the phone)
     ========================================================= */
  let workerP = null, onProg = null, idleTimer = null;
  async function getWorker(){
    if (workerP) return workerP;
    workerP = (async ()=>{
      if (!window.Tesseract){
        document.querySelectorAll(`script[src="${TESS_URL}"]`).forEach(s=>s.remove()); // drop a failed earlier attempt
        await J.loadScript(TESS_URL);
      }
      if (!window.Tesseract || !window.Tesseract.createWorker) throw new Error('no-tesseract');
      const w = await window.Tesseract.createWorker('eng', 1, Object.assign({}, TESS_OPTS, {
        logger: m => { try { onProg && onProg(m); } catch(e){} },
        errorHandler: () => {}
      }));
      await w.setParameters({tessedit_pageseg_mode: '6', preserve_interword_spaces: '1', user_defined_dpi: '300'});
      return w;
    })();
    workerP.catch(()=>{ workerP = null; });
    return workerP;
  }
  function scheduleIdle(){ clearTimeout(idleTimer); idleTimer = setTimeout(async ()=>{ const p = workerP; workerP = null; try { (await p).terminate(); } catch(e){} }, 90000); }
  // Tesseract reports ~95% confidence for an empty page, so a read with almost no text counts as 0
  function textConf(r){ return (String(r.text || '').match(/[A-Za-z0-9]/g) || []).length < 25 ? 0 : (r.confidence || 0); }
  function withTimeout(p, ms){ return Promise.race([p, new Promise((_, rej)=>setTimeout(()=>rej(new Error('timeout')), ms))]); }

  /* =========================================================
     UI STATE
     ========================================================= */
  let st = {screen:'list'}, ver = 0, runId = 0, viewEl = null, lastSig = '', homeSig = '';
  function setState(s){ st = s; ver++; paint(); }

  // hidden file inputs live outside re-rendered areas so a re-render never drops a pick
  function ensureInputs(){
    if (document.getElementById('rcptCam')) return;
    const mk = (id, cap) => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.id = id; if (cap) i.setAttribute('capture', 'environment'); i.className = 'rcpt-file'; i.tabIndex = -1; i.setAttribute('aria-hidden', 'true'); i.addEventListener('change', ()=>{ const f = i.files && i.files[0]; i.value = ''; if (f) onFile(f); }); document.body.appendChild(i); };
    mk('rcptCam', true); mk('rcptPick', false);
  }

  const IC = {
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.6l1.4-2h7l1.4 2h1.6A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z"/><circle cx="12" cy="13" r="3.6"/></svg>',
    gal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7 14h10"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
    receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14v18l-2.3-1.5L14.3 21 12 19.5 9.7 21l-2.4-1.5L5 21z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    bulb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>'
  };
  const camLabel = (cls, inner, id) => `<label for="${id||'rcptCam'}" class="${cls}" role="button" tabindex="0">${inner}</label>`;

  function money(amount, cur){
    cur = cur || userCur();
    if (cur === userCur() || cur === (J.settings && J.settings.currency)) return J.fmt(amount);
    const s = Math.abs(amount).toLocaleString('en-US', {minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2});
    return ['USD','EUR','GBP'].includes(cur) ? CUR_LABEL[cur] + s : s + ' ' + (CUR_LABEL[cur] || cur);
  }
  function spokenMoney(amount, cur){
    cur = cur || userCur();
    const s = (Math.round(amount*100)/100).toLocaleString('en-US', {minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2});
    return `${s} ${CUR_SPOKEN[cur] || cur}`;
  }
  const numStr = (v, cur) => v == null || v === '' ? '' : (+v).toLocaleString('en-US', cur === 'LBP' ? {maximumFractionDigits:0} : {minimumFractionDigits:2, maximumFractionDigits:2});
  const dateInput = d => { d = new Date(d); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  const shortDate = ts => new Date(ts).toLocaleDateString([], {month:'short', day:'numeric', year: new Date(ts).getFullYear() === new Date().getFullYear() ? undefined : 'numeric'});
  const catInfo = c => J.CATS[c] || J.CATS.Other;

  /* ---------------- flow ---------------- */
  async function onFile(file){
    if (st.screen === 'scanning') runId++; // replace a scan in progress
    if (file.type && !/^image\//.test(file.type)){ J.toast('Please choose a photo of your receipt'); return; }
    const my = ++runId;
    const url = URL.createObjectURL(file);
    const meta = store().meta;
    J.go('receipts');
    setState({screen:'scanning', url, first: !meta.ocrReady, started: Date.now()});
    let img;
    try { img = await loadImg(url); } catch(e){
      if (my !== runId) return;
      setState({screen:'capture', error:"I couldn't open that photo. Please take a new one, or pick a JPG or PNG from your photos."});
      return;
    }
    if (my !== runId) return;
    const thumb = makeThumb(img);
    st.thumb = thumb;
    await new Promise(r=>setTimeout(r, 30)); // let the scanning UI paint first
    let prep;
    try { prep = prepImage(img); } catch(e){ prep = null; }
    if (my !== runId) return;
    if (!prep){ toManual('failed', thumb); return; }
    // free AI reader first when the user has a Gemini key; anything wrong → the on-phone reader
    if (aiOn() && navigator.onLine !== false){
      progress(20, 'Reading your receipt with AI…');
      try {
        const parsed = await aiRead(img);
        if (my !== runId) return;
        if (parsed.total != null){ progress(100, 'Done!'); await new Promise(r=>setTimeout(r, 200)); if (my !== runId) return; toReview(parsed, {thumb, rawText:'', ocrConf: 90, blurry: false, viaAI: true}); return; }
      } catch(e){ if (my !== runId) return; }
    }
    if (navigator.onLine === false && !meta.ocrReady){ toManual('offline', thumb); return; }
    progress(3, meta.ocrReady ? 'Waking up the reader…' : 'Downloading the receipt reader…');
    st.cap = 36;
    const creep = setInterval(()=>{ if (my !== runId || st.screen !== 'scanning'){ clearInterval(creep); return; } if ((st.pct||0) < st.cap) progress((st.pct||0) + 1); }, meta.ocrReady ? 250 : 600);
    const slowT = setTimeout(()=>{ if (my === runId && st.screen === 'scanning') setSlow(); }, 20000);
    try {
      let phase = 0;
      const PH = [[40, 40, 'Reading your receipt…'], [80, 8, 'Taking a closer look…'], [88, 5, 'Evening out the light…'], [93, 5, 'Double-checking the total…']];
      onProg = m => {
        if (my !== runId) return;
        const p = typeof m.progress === 'number' ? m.progress : 0;
        if (m.status === 'loading tesseract core') progress(3 + p*22, meta.ocrReady ? 'Waking up the reader…' : 'Downloading the receipt reader…');
        else if (m.status === 'initializing tesseract' || m.status === 'initialized tesseract') progress(26, 'Getting ready…');
        else if (m.status === 'loading language traineddata') progress(27 + p*10, meta.ocrReady ? 'Getting ready…' : 'Downloading English reading data…');
        else if (m.status === 'initializing api' || m.status === 'initialized api') progress(38, 'Getting ready…');
        else if (m.status === 'recognizing text'){ const ph = PH[phase]; progress(ph[0] + p*ph[1], ph[2]); }
      };
      const w = await withTimeout(getWorker(), 120000);
      if (my !== runId) return;
      meta.ocrReady = true; J.save();
      clearTimeout(slowT); clearSlow();
      progress(40, 'Reading your receipt…');
      // Up to four reads: cleaned grayscale, black-and-white, grayscale with the light evened out (shadows), then another layout mode.
      // Stop as soon as one checks out or two agree.
      const passes = [[prep.gray, '6'], [prep.bin, '6'], [prep.flatGray, '6'], [prep.bin, '4']], runs = [];
      let timedOut = false, turned = null, triedTurn = false;
      const wide = prep.w > prep.h * 1.1;
      const goodEnough = () => runs.some(x=>(x.parsed.conf === 'high' && x.ocrConf >= 55) || x.parsed.dual);
      // a poor read may mean the photo is sideways or upside down: read it turned, and keep that only if it is clearly a real read
      // (a sideways photo of text reads as junk at low confidence; Tesseract can't tell us the orientation without extra downloads)
      const tryTurn = async () => {
        triedTurn = true;
        const bestConf = Math.max(0, ...runs.map(x=>x.ocrConf));
        if (timedOut || goodEnough() || bestConf >= 62) return;
        for (const deg of (wide ? [90, 270, 180] : [180, 90, 270])){
          progress(Math.min(95, (st.pct||80) + 2), 'Turning the photo…');
          let p2; try { p2 = prepImage(rotCanvas(img, deg)); } catch(e){ continue; }
          await w.setParameters({tessedit_pageseg_mode: '6'});
          let r; try { r = (await withTimeout(w.recognize(p2.gray), 90000)).data; } catch(e){ timedOut = true; try { w.terminate(); } catch(_){} workerP = null; return; }
          if (my !== runId) return;
          const parsed = parseReceipt(r.text), c = textConf(r);
          if (c >= 70 && c > bestConf + 25 && parsed.total != null){ turned = {parsed, ocrConf: c, rawText: r.text}; runs.push(turned); return; }
        }
      };
      for (let k = 0; k < passes.length; k++){
        phase = k;
        if (k) progress(PH[k][0], PH[k][2]);
        st.cap = PH[k][0] + PH[k][1] - 2;
        await w.setParameters({tessedit_pageseg_mode: passes[k][1]});
        let r;
        try { const src = typeof passes[k][0] === 'function' ? passes[k][0]() : passes[k][0]; r = (await withTimeout(w.recognize(src), 90000)).data; }
        catch(e){ if (runs.length && e.message === 'timeout'){ timedOut = true; try { w.terminate(); } catch(_){} workerP = null; break; } throw e; } // slow phone: keep the reads we have
        if (my !== runId) return;
        const parsed = parseReceipt(r.text);
        const oc = textConf(r);
        runs.push({parsed, ocrConf: oc, rawText: r.text});
        if ((parsed.conf === 'high' && oc >= 60) || (parsed.dual && parsed.conf === 'high')) break;
        if (parsed.total != null && runs.slice(0, -1).some(x=>x.parsed.total != null && near(x.parsed.total, parsed.total))) break; // two reads agree
        // junk on the first read of a wide photo: the receipt is probably sideways, so try it turned before reading more
        if (k === 0 && oc < 55 && wide){ await tryTurn(); if (my !== runId) return; if (turned || timedOut) break; }
      }
      if (!triedTurn && !turned) await tryTurn();
      if (my !== runId) return;
      J._receipt.lastRuns = runs.map(x=>({ocr: Math.round(x.ocrConf), conf: x.parsed.conf, total: x.parsed.total})); // for testing
      const best = turned || pickRun(runs); // a clear read of the turned photo beats the junk read the wrong way up
      const parsed = best.parsed, ocrConf = best.ocrConf, rawText = best.rawText;
      clearInterval(creep);
      scheduleIdle();
      progress(100, 'Done!');
      await new Promise(r=>setTimeout(r, 250));
      if (my !== runId) return;
      toReview(parsed, {thumb, rawText, ocrConf, blurry: prep.blurry});
    } catch(e){
      clearTimeout(slowT); clearInterval(creep);
      if (my !== runId) return;
      try { console.warn('receipt read failed', e); } catch(_){}
      toManual(navigator.onLine === false ? 'offline' : 'failed', thumb);
    } finally { if (my === runId) onProg = null; }
  }

  // Choose the best of several OCR reads: a total that adds up wins, then totals that agree, then overall quality.
  function pickRun(runs){
    const best = pickRun0(runs);
    // fill what the winning read missed from the other reads (date, store, the printed LBP rate)
    for (const x of runs){ if (x === best) continue; const p = x.parsed, b = best.parsed;
      if (!b.date && p.date) b.date = p.date; if (!b.rate && p.rate) b.rate = p.rate;
      if (p.merchant && (!b.merchant || (/^(VCoop)$/.test(p.merchant) && b.merchant !== p.merchant))) b.merchant = p.merchant; }
    return best;
  }
  function pickRun0(runs){
    const lvl = {none:0, low:1, medium:2, high:3};
    // a "Total ... USD x.xx" found on a Lebanese dual-currency receipt beats a guessed total
    // a "checks out" from a blurry, low-confidence read is often luck (junk numbers that happen to add up): count it as medium
    const L = x => x.parsed.conf === 'high' && x.ocrConf < 50 && !x.parsed.dual ? lvl.medium : lvl[x.parsed.conf];
    const rank = x => L(x)*100 + (x.parsed.dual ? 150 : 0) + x.ocrConf/5 + Math.min(x.parsed.items.length, 10) + (x.parsed.merchant ? 4 : 0) + (x.parsed.date ? 4 : 0);
    const dual = runs.filter(x=>x.parsed.dual);
    if (dual.length) return dual.sort((a,b)=>rank(b)-rank(a))[0];
    const highs = runs.filter(x=>L(x) === lvl.high);
    if (highs.length) return highs.sort((a,b)=>rank(b)-rank(a))[0];
    for (const x of runs){
      if (x.parsed.total == null) continue;
      const agree = runs.filter(y=>y !== x && y.parsed.total != null && near(y.parsed.total, x.parsed.total));
      if (agree.length){
        const pick = [x, ...agree].sort((a,b)=>rank(b)-rank(a))[0];
        if (pick.parsed.conf === 'low') pick.parsed.conf = 'medium';
        return pick;
      }
    }
    return runs.slice().sort((a,b)=>rank(b)-rank(a))[0];
  }

  function draftFrom(parsed, extra){
    const pcur = parsed.currency || userCur();
    const merchant = parsed.merchant || '';
    const cat = pickCategory(merchant, parsed.items, extra.rawText || '');
    const d = parsed.date || new Date();
    return Object.assign({
      merchant, total: parsed.total != null ? numStr(parsed.total, pcur) : '', currency: pcur, subtotal: parsed.subtotal,
      date: dateInput(d), time: parsed.date ? [parsed.date.getHours(), parsed.date.getMinutes()] : null, dateFound: !!parsed.date,
      cat, items: parsed.items.map(x=>({n:x.n, p:x.p})), conf: parsed.conf, alt: parsed.alt, itemSum: parsed.itemSum,
      rate: parsed.rate || store().meta.lbpRate || DEFAULT_LBP_RATE, convert: true
    }, extra);
  }
  function toReview(parsed, extra){ setState({screen:'review', draft: draftFrom(parsed, extra)}); }
  function toManual(reason, thumb){
    const empty = {merchant:'', total:null, currency:userCur(), date:null, items:[], conf:'none', alt:null, itemSum:0};
    setState({screen:'review', draft: draftFrom(empty, {thumb: thumb || '', reason, rawText:'', ocrConf:0})});
  }

  function progress(pct, status){
    if (st.screen !== 'scanning') return;
    st.pct = Math.max(st.pct || 0, Math.min(100, Math.round(pct))); st.status = status;
    if (!viewEl) return;
    const p = viewEl.querySelector('.rcpt-pct'), s = viewEl.querySelector('.rcpt-status'), b = viewEl.querySelector('.rcpt-bar i');
    if (p) p.textContent = st.pct + '%';
    if (s && status && s.textContent !== status) s.textContent = status;
    if (b) b.style.width = st.pct + '%';
  }
  function setSlow(){ st.slow = true; const n = viewEl && viewEl.querySelector('.rcpt-slow'); if (n) n.hidden = false; }
  function clearSlow(){ st.slow = false; const n = viewEl && viewEl.querySelector('.rcpt-slow'); if (n) n.hidden = true; }

  function draftAmount(d){
    const total = parseAmount(String(d.total).replace(/[^\d.,]/g, '')) ?? parseFloat(d.total);
    if (!(total > 0)) return {total: null, amount: null, conv: false};
    const uc = userCur();
    const conv = d.convert && d.currency !== uc && ((d.currency === 'LBP' && uc === 'USD') || (d.currency === 'USD' && uc === 'LBP')) && d.rate > 0;
    const amount = conv ? (d.currency === 'LBP' ? total / d.rate : total * d.rate) : total;
    return {total, amount: Math.round(amount*100)/100, conv};
  }

  // Write everything now and report whether it really reached storage (the core save() hides quota errors).
  function persist(){
    try { localStorage.setItem('jarvis2', JSON.stringify(J.db)); return true; } catch(e){ return false; }
  }

  function saveDraft(){
    const d = st.draft; if (!d) return;
    const {total, amount} = draftAmount(d);
    if (!(total > 0)){
      const f = viewEl.querySelector('#rcptTotal'); if (f){ f.focus(); f.closest('.rcpt-field').classList.add('rcpt-shake'); setTimeout(()=>f.closest('.rcpt-field') && f.closest('.rcpt-field').classList.remove('rcpt-shake'), 500); }
      J.toast('Please type the total first'); J.speak('Please type the total first.');
      return;
    }
    const merchant = J.cap((d.merchant || '').trim() || 'Receipt');
    const [y, m, dd] = d.date.split('-').map(Number);
    let at = Date.now();
    if (y){ const dt = new Date(y, m-1, dd, 12, 0, 0, 0); if (dt.toDateString() !== new Date().toDateString()){ if (d.time) dt.setHours(d.time[0], d.time[1]); at = dt.getTime(); } }
    const cat = J.CATS[d.cat] ? d.cat : 'Other';
    const id = J.uid();
    const R = store();
    if (d.currency === 'LBP' || d.currency === 'USD') R.meta.lbpRate = d.rate;
    const e = J.addExpense({amount, desc: merchant, cat, at, receiptId: id, src: 'receipt'});
    const rec = {id, merchant, total, currency: d.currency, amount, cat, at, items: d.items.filter(x=>x.n && x.p > 0).slice(0, 40), thumb: d.thumb || '', expenseId: e.id, created: Date.now()};
    R.list.unshift(rec);
    // Phone storage full? Free room by dropping photos of the oldest receipts first (the receipts and amounts stay).
    let noPhoto = false, oldPhotos = 0, notSaved = false;
    if (!persist()){
      const olds = R.list.filter(x=>x !== rec && x.thumb).sort((a,b)=>a.created - b.created), dropped = [];
      let ok = false;
      while (olds.length && !ok){
        olds.splice(0, Math.max(1, Math.ceil(olds.length / 10))).forEach(x=>{ dropped.push([x, x.thumb]); x.thumb = ''; });
        ok = persist();
      }
      if (!ok){ rec.thumb = ''; noPhoto = !!d.thumb; ok = persist(); }
      if (!ok){ dropped.forEach(([x, t])=>x.thumb = t); noPhoto = false; notSaved = true; } // nothing fits: keep the old photos
      else oldPhotos = dropped.length;
    }
    try { if (st.url) URL.revokeObjectURL(st.url); } catch(e){}
    setState({screen:'list', highlight: id});
    J.renderAll();
    const say = `Saved ${spokenMoney(amount, userCur())} at ${merchant} under ${cat}.`;
    if (notSaved){
      J.toast(`Your phone's storage for Jarvis is full. ${merchant} is logged for now, but may be lost when the app closes. Delete some old receipts to make room.`);
      J.speak(`Logged ${spokenMoney(amount, userCur())} at ${merchant}, but your phone's storage is full. Please delete some old receipts.`);
      return;
    }
    J.toast(noPhoto ? `Saved ${J.fmt(amount)} · storage is full, so the photo wasn't kept`
      : oldPhotos ? `Saved ${J.fmt(amount)} at ${merchant} · made room by removing ${oldPhotos} old photo${oldPhotos === 1 ? '' : 's'}`
      : `Saved ${J.fmt(amount)} at ${merchant}`, ()=>removeReceipt(id, true));
    J.speak(say);
  }

  function removeReceipt(id, silent){
    const R = store(); const idx = R.list.findIndex(x=>x.id === id); if (idx < 0) return;
    const rec = R.list[idx]; R.list.splice(idx, 1);
    const db = J.db; const eIdx = db.expenses.findIndex(x=>x.id === rec.expenseId); const exp = eIdx >= 0 ? db.expenses[eIdx] : null;
    if (exp) db.expenses.splice(eIdx, 1);
    J.save(); J.closeModal(); ver++; J.renderAll();
    if (!silent) J.toast(`Deleted ${rec.merchant}`, ()=>{ R.list.splice(Math.min(idx, R.list.length), 0, rec); if (exp) db.expenses.splice(Math.min(eIdx, db.expenses.length), 0, exp); J.save(); ver++; J.renderAll(); });
    else J.toast('Removed');
  }

  function openDetail(id){
    const rec = store().list.find(x=>x.id === id); if (!rec) return;
    const ci = catInfo(rec.cat);
    const inBudget = J.db.expenses.some(x=>x.id === rec.expenseId);
    const itemSum = rec.items.reduce((s,x)=>s + x.p, 0);
    J.modal(`<div class="rcpt-detail">
      <div class="rcpt-d-head"><div class="rcpt-d-ic" style="background:${ci.c}22">${ci.ic}</div><div style="flex:1;min-width:0"><h4 style="margin:0">${esc(rec.merchant)}</h4><div class="rcpt-muted">${new Date(rec.at).toLocaleDateString([], {weekday:'short', month:'long', day:'numeric', year:'numeric'})} · ${esc(rec.cat)}</div></div><button class="mini" data-rc="close" aria-label="Close">${IC.x}</button></div>
      ${rec.thumb ? `<div class="rcpt-d-img"><img src="${rec.thumb}" alt="Receipt photo"></div>` : ''}
      <div class="rcpt-d-total"><span>Total</span><b>${esc(money(rec.total, rec.currency))}</b></div>
      ${rec.currency !== userCur() && rec.amount != null ? `<div class="rcpt-muted" style="text-align:right;margin-top:-6px">Logged as ${esc(J.fmt(rec.amount))}</div>` : ''}
      ${rec.items.length ? `<div class="rcpt-d-items">${rec.items.map(x=>`<div><span>${esc(x.n)}</span><b>${esc(money(x.p, rec.currency))}</b></div>`).join('')}${rec.items.length > 1 ? `<div class="rcpt-d-sum"><span>${rec.items.length} items</span><b>${esc(money(Math.round(itemSum*100)/100, rec.currency))}</b></div>` : ''}</div>` : ''}
      ${inBudget ? '' : '<div class="rcpt-note warn">This expense was removed from your budget.</div>'}
      <div class="row"><button class="btn danger" data-rc="del" data-id="${rec.id}">Delete</button>${inBudget && J.editExpense ? '<button class="btn ghost" data-rc="edit">Edit</button>' : ''}<button class="btn" data-rc="close">Done</button></div></div>`);
    const box = document.getElementById('modalBox');
    // Edit opens the payment's own form (amount, name, date, category); the listener below copies the changes back to the receipt
    box.querySelectorAll('[data-rc]').forEach(b=>b.onclick = ()=>{ if (b.dataset.rc === 'del') removeReceipt(b.dataset.id); else if (b.dataset.rc === 'edit') J.editExpense(rec.expenseId); else J.closeModal(); });
  }

  /* =========================================================
     RENDER
     ========================================================= */
  function sig(){
    if (st.screen === 'review' || st.screen === 'scanning') return st.screen + ':' + ver;
    const R = store(); const mk = J.monthKey(Date.now());
    return [st.screen, ver, R.list.length, R.list[0] && R.list[0].id, mk, J.settings.currency, J.db.expenses.length].join('|');
  }
  function render(el){
    viewEl = el; ensureInputs(); bindView(el);
    const s = sig(); if (s === lastSig && el.firstChild) return; lastSig = s;
    el.innerHTML = html();
    afterPaint(el);
  }
  function paint(){ if (!viewEl) return; lastSig = ''; render(viewEl); }

  function html(){
    const head = `<div class="rcpt-head"><div><h2>Receipts</h2><p class="lede">Snap a receipt. I'll read it and log the expense.</p></div></div>`;
    if (st.screen === 'scanning') return head + scanningHTML();
    if (st.screen === 'review') return head + reviewHTML();
    if (st.screen === 'capture') return head + captureHTML();
    return head + listHTML();
  }

  function scanHero(){
    return `<div class="rcpt-hero">
      <div class="rcpt-hero-art">${IC.receipt}</div>
      <div class="rcpt-hero-t"><b>Scan a receipt</b><span>Point your camera at it. I'll read the store, date and total for you.</span></div>
      ${camLabel('rcpt-big', `${IC.cam}<span>Scan a receipt</span>`)}
      <div class="rcpt-hero-row">${camLabel('rcpt-sub', `${IC.gal}<span>From photos</span>`, 'rcptPick')}<button class="rcpt-sub" data-act="manual">${IC.key}<span>Type it in</span></button></div>
    </div>`;
  }
  function listHTML(){
    const R = store(); const mk = J.monthKey(Date.now());
    const list = R.list.slice().sort((a,b)=>b.at - a.at);
    const month = list.filter(x=>J.monthKey(x.at) === mk);
    const mTot = month.reduce((s,x)=>s + (x.amount || 0), 0);
    const byM = {}; month.forEach(x=>byM[x.merchant] = (byM[x.merchant]||0) + (x.amount||0));
    const top = Object.entries(byM).sort((a,b)=>b[1]-a[1])[0];
    let out = scanHero();
    out += `<div class="grid2 rcpt-stats">
      <div class="card stat"><div class="label">This month</div><div class="val">${esc(J.fmt(Math.round(mTot*100)/100))}</div><div class="delta" style="color:var(--muted)">${month.length} receipt${month.length === 1 ? '' : 's'}</div></div>
      <div class="card stat"><div class="label">Top store</div><div class="val rcpt-ell" style="font-size:18px;margin-top:7px">${top ? esc(top[0]) : '—'}</div><div class="delta" style="color:var(--muted)">${top ? esc(J.fmt(Math.round(top[1]*100)/100)) + ' this month' : 'No receipts yet'}</div></div></div>`;
    if (!list.length){
      out += `<div class="section-h"><h3>Your receipts</h3></div><div class="empty rcpt-empty"><div class="e-ic">${(J.icons && J.icons.receipt) || '🧾'}</div><b style="color:var(--text)">No receipts yet</b><br>Tap <b>Scan a receipt</b> or say “Scan a receipt”.<br><span style="font-size:12.5px">Everything is read on your phone. Nothing is uploaded.</span></div>`;
      return out;
    }
    const groups = []; const idx = {};
    list.forEach(x=>{ const k = J.monthKey(x.at); if (!(k in idx)){ idx[k] = groups.length; groups.push({k, items:[]}); } groups[idx[k]].items.push(x); });
    groups.forEach(g=>{
      const label = new Date(g.items[0].at).toLocaleDateString([], {month:'long', year:'numeric'});
      const tot = g.items.reduce((s,x)=>s + (x.amount||0), 0);
      out += `<div class="section-h"><h3>${esc(label)}</h3><span class="rcpt-muted"><b style="color:var(--text)">${esc(J.fmt(Math.round(tot*100)/100))}</b> · ${g.items.length}</span></div><div class="rcpt-grid">`;
      out += g.items.map(x=>{ const ci = catInfo(x.cat);
        return `<button class="rcpt-tile${st.highlight === x.id ? ' rcpt-new' : ''}" data-open="${x.id}">
          <div class="rcpt-thumb">${x.thumb ? `<img src="${x.thumb}" alt="" loading="lazy">` : `<div class="rcpt-ph">${IC.receipt}</div>`}<span class="rcpt-cat" style="background:${ci.c}">${ci.ic}</span></div>
          <div class="rcpt-tile-b"><div class="rcpt-tile-m rcpt-ell">${esc(x.merchant)}</div><div class="rcpt-tile-r"><b>${esc(money(x.total, x.currency))}</b><span>${esc(shortDate(x.at))}</span></div></div></button>`; }).join('');
      out += `</div>`;
    });
    return out;
  }
  function captureHTML(){
    return `<div class="rcpt-capture">
      ${st.error ? `<div class="rcpt-note bad">${esc(st.error)}</div>` : ''}
      <div class="rcpt-frame"><i></i><i></i><i></i><i></i><div class="rcpt-frame-ic">${IC.receipt}</div></div>
      <b class="rcpt-cap-t">Tap Take photo to snap your receipt</b>
      <p class="rcpt-muted" style="margin:4px 0 18px">Lay it flat in good light and fill the screen.</p>
      ${camLabel('rcpt-big rcpt-pulse', `${IC.cam}<span>Take photo</span>`)}
      <div class="rcpt-hero-row" style="margin-top:10px">${camLabel('rcpt-sub', `${IC.gal}<span>From photos</span>`, 'rcptPick')}<button class="rcpt-sub" data-act="manual">${IC.key}<span>Type it in</span></button></div>
      <button class="link" data-act="list" style="margin-top:14px">Back to my receipts</button>
    </div>`;
  }
  function scanningHTML(){
    return `<div class="card rcpt-scanning">
      <div class="rcpt-scan">${st.url ? `<img src="${st.url}" alt="Your receipt">` : ''}<div class="rcpt-beam"></div><i class="rcpt-c c1"></i><i class="rcpt-c c2"></i><i class="rcpt-c c3"></i><i class="rcpt-c c4"></i></div>
      <div class="rcpt-prog">
        <div class="rcpt-prog-top"><span class="rcpt-status">${esc(st.status || 'Getting your photo ready…')}</span><b class="rcpt-pct">${st.pct || 0}%</b></div>
        <div class="progress rcpt-bar"><i style="width:${st.pct || 0}%"></i></div>
        ${st.first ? `<div class="rcpt-note">First scan only: I download the receipt reader (about 5 MB, one time). After that it's quicker, and it all runs on your phone.</div>` : `<div class="rcpt-muted" style="margin-top:10px;font-size:12.5px">Reading happens on your phone. Nothing is uploaded.</div>`}
        <div class="rcpt-note warn rcpt-slow" ${st.slow ? '' : 'hidden'}>This is taking a while. The connection seems slow. You can keep waiting or type it in.</div>
        <button class="btn ghost rcpt-wide" data-act="manual" style="margin-top:12px">${IC.key} Type it in instead</button>
      </div></div>`;
  }
  function reviewHTML(){
    const d = st.draft; const uc = userCur();
    const hint = d.reason === 'offline' ? ['bad', "You're offline, so I can't load the receipt reader right now. Type the details below. The photo is saved with it."]
      : d.reason === 'failed' ? ['bad', "I couldn't load the receipt reader. It needs internet the first time. Type the details below for now. The photo is saved with it."]
      : d.reason === 'typed' ? null
      : d.conf === 'none' ? ['bad', "I couldn't find the total. Please type it in."]
      : d.conf === 'low' ? ['warn', "I'm not sure about the total. Please check it."]
      : d.conf === 'medium' ? ['warn', 'Please check the total before saving.']
      : ['good', d.viaAI ? 'Read with AI. Give it a quick check, then save.' : 'Looks right. Give it a quick check, then save.'];
    // items that add up to the total mean the read is right, so no "blurry photo" tips then
    const dTotal = draftAmount(d).total, itemSum = Math.round(d.items.reduce((t,x)=>t + (+x.p || 0), 0)*100)/100;
    const itemsMatch = d.items.length > 0 && dTotal != null && near(itemSum, dTotal);
    const lowRead = !d.reason && !itemsMatch && (d.conf === 'none' || d.conf === 'low' || d.ocrConf < 45 || d.blurry);
    const pair = (d.currency === 'LBP' && uc === 'USD') || (d.currency === 'USD' && uc === 'LBP');
    const curOpts = ['USD','LBP','EUR','GBP','AED','SAR'];
    return `<div class="card rcpt-review">
      <div class="rcpt-r-top">${d.thumb ? `<img class="rcpt-r-img" src="${d.thumb}" alt="Receipt">` : `<div class="rcpt-r-img rcpt-ph">${IC.receipt}</div>`}
        <div style="flex:1;min-width:0"><b class="rcpt-r-title">${d.reason === 'typed' ? 'Add a receipt' : 'Check the details'}</b><div class="rcpt-muted">${d.reason === 'typed' ? 'Type what the receipt says.' : 'Fix anything I got wrong, then save.'}</div></div></div>
      ${hint ? `<div class="rcpt-note ${hint[0]}">${hint[0] === 'good' ? IC.check : ''}${esc(hint[1])}</div>` : ''}
      <div class="rcpt-form">
        <label class="rcpt-field"><span>Store</span><input id="rcptMerchant" value="${esc(d.merchant)}" placeholder="e.g. Spinneys" autocomplete="off"></label>
        <div class="rcpt-field rcpt-total-f${d.conf === 'high' || d.reason ? '' : ' rcpt-attn'}"><span>Total</span><div class="rcpt-money"><select id="rcptCur" aria-label="Currency">${curOpts.map(c=>`<option value="${c}" ${c === d.currency ? 'selected' : ''}>${CUR_LABEL[c]}</option>`).join('')}</select><input id="rcptTotal" inputmode="decimal" value="${esc(d.total)}" placeholder="0.00" autocomplete="off"></div></div>
        ${d.alt ? `<div class="rcpt-muted rcpt-alt">The receipt also shows <b>${esc(money(d.alt.total, d.alt.currency))}</b>. <button class="link" data-act="usealt">Use that</button></div>` : ''}
        <div class="rcpt-conv" ${pair ? '' : 'hidden'}><label class="rcpt-chk"><input type="checkbox" id="rcptConv" ${d.convert ? 'checked' : ''}><span>Convert to ${esc(J.settings.currency)} for my budget</span></label><div class="rcpt-rate"><span>Rate: $1 =</span><input id="rcptRate" inputmode="numeric" value="${esc(numStr(d.rate, 'LBP'))}" aria-label="Exchange rate, LBP per dollar"><span>LBP</span></div><div class="rcpt-conv-out"></div></div>
        <div class="rcpt-row2">
          <label class="rcpt-field"><span>Date</span><input id="rcptDate" type="date" value="${esc(d.date)}">${d.dateFound || d.reason ? '' : '<small class="rcpt-hint">Not on the photo, using today</small>'}</label>
          <label class="rcpt-field"><span>Category</span><select id="rcptCat">${Object.keys(J.CATS).map(c=>`<option value="${esc(c)}" ${c === d.cat ? 'selected' : ''}>${J.CATS[c].ic} ${esc(c)}</option>`).join('')}</select></label>
        </div>
      </div>
      <div class="rcpt-items-h"><b>Items${d.items.length ? ` <span class="rcpt-muted">(${d.items.length})</span>` : ''}</b><span class="rcpt-muted rcpt-isum"></span></div>
      <div class="rcpt-items">${d.items.length ? d.items.map((x,i)=>`<div class="rcpt-it" data-i="${i}"><input class="rcpt-it-n" value="${esc(x.n)}" aria-label="Item name"><input class="rcpt-it-p" inputmode="decimal" value="${esc(x.p ? numStr(x.p, d.currency) : '')}" placeholder="0.00" aria-label="Price"><button class="mini" data-act="rmitem" data-i="${i}" aria-label="Remove item">${IC.x}</button></div>`).join('') : `<div class="rcpt-muted" style="font-size:13px;padding:4px 2px 8px">${d.reason ? 'Optional.' : 'No items detected. That is fine, the total is what counts.'}</div>`}
        <button class="link" data-act="additem" style="padding:6px 2px">+ Add item</button></div>
      ${lowRead ? `<div class="rcpt-tips"><div class="rcpt-tips-h">${IC.bulb}<b>${d.blurry ? 'The photo looks a little blurry' : 'Tips for a clearer scan'}</b></div><ul><li>Lay the receipt flat on a dark table</li><li>Use good light and avoid shadows</li><li>Fill the screen and hold steady</li></ul>${camLabel('btn ghost rcpt-wide', `${IC.cam} Retake photo`)}</div>` : ''}
      <button class="btn rcpt-save" data-act="save">${IC.check}<span>Save expense</span></button>
      <div class="rcpt-hero-row">${lowRead ? '' : camLabel('rcpt-sub', `${IC.cam}<span>${d.reason === 'typed' ? 'Scan instead' : 'Retake'}</span>`)}<button class="rcpt-sub" data-act="discard">${IC.x}<span>Discard</span></button></div>
      ${d.rawText ? `<details class="rcpt-raw"><summary>See what I read</summary><pre>${esc(d.rawText.trim())}</pre></details>` : ''}
    </div>`;
  }

  function updateReviewCalc(){
    if (!viewEl || st.screen !== 'review') return;
    const d = st.draft; const uc = userCur();
    const pair = (d.currency === 'LBP' && uc === 'USD') || (d.currency === 'USD' && uc === 'LBP');
    const conv = viewEl.querySelector('.rcpt-conv'); if (conv) conv.hidden = !pair;
    const out = viewEl.querySelector('.rcpt-conv-out');
    const a = draftAmount(d);
    if (out) out.innerHTML = a.amount != null ? (a.conv ? `Saved in your budget as <b>${esc(J.fmt(a.amount))}</b>` : `Saved as <b>${esc(money(a.total, d.currency))}</b> (no conversion)`) : '';
    const isum = viewEl.querySelector('.rcpt-isum');
    if (isum){ const s = Math.round(d.items.reduce((t,x)=>t + (+x.p || 0), 0)*100)/100; isum.innerHTML = d.items.length ? `Add up to ${esc(money(s, d.currency))}${a.total != null && near(s, a.total) ? ' <span style="color:var(--good-ink)">✓ matches total</span>' : d.subtotal != null && near(s, d.subtotal) ? ' <span style="color:var(--good-ink)">✓ matches subtotal</span>' : ''}` : ''; }
  }

  function afterPaint(el){
    if (st.screen === 'review'){
      const d = st.draft;
      const on = (id, ev, fn) => { const x = el.querySelector('#'+id); if (x) x.addEventListener(ev, fn); };
      on('rcptMerchant', 'input', e=>{ d.merchant = e.target.value; });
      on('rcptMerchant', 'change', e=>{ if (!d.catTouched){ d.cat = pickCategory(d.merchant, d.items, d.rawText); const s = el.querySelector('#rcptCat'); if (s) s.value = d.cat; } });
      on('rcptTotal', 'input', e=>{ d.total = e.target.value; e.target.closest('.rcpt-field').classList.remove('rcpt-attn'); updateReviewCalc(); });
      on('rcptCur', 'change', e=>{ d.currency = e.target.value; updateReviewCalc(); });
      on('rcptConv', 'change', e=>{ d.convert = e.target.checked; updateReviewCalc(); });
      on('rcptRate', 'input', e=>{ d.rate = parseAmount(e.target.value) || 0; updateReviewCalc(); });
      on('rcptDate', 'change', e=>{ d.date = e.target.value || dateInput(new Date()); d.time = null; });
      on('rcptCat', 'change', e=>{ d.cat = e.target.value; d.catTouched = true; });
      el.querySelectorAll('.rcpt-it').forEach(row=>{
        const i = +row.dataset.i;
        row.querySelector('.rcpt-it-n').addEventListener('input', e=>{ d.items[i].n = e.target.value; });
        row.querySelector('.rcpt-it-p').addEventListener('input', e=>{ d.items[i].p = parseAmount(e.target.value) || 0; updateReviewCalc(); });
      });
      updateReviewCalc();
      if (d.conf === 'none' && !d.reason && !d.focused){ d.focused = true; }
    }
  }

  function bindView(el){
    if (el.dataset.rcptBound) return; el.dataset.rcptBound = '1';
    el.addEventListener('click', e=>{
      const o = e.target.closest('[data-open]'); if (o){ openDetail(o.dataset.open); return; }
      const a = e.target.closest('[data-act]'); if (!a) return;
      const act = a.dataset.act;
      if (act === 'manual'){ runId++; onProg = null; const thumb = st.thumb || ''; if (st.screen === 'scanning') toManual('typed', thumb); else toManual('typed', ''); }
      else if (act === 'list'){ setState({screen:'list'}); }
      else if (act === 'save') saveDraft();
      else if (act === 'discard'){ try { st.url && URL.revokeObjectURL(st.url); } catch(e){} setState({screen:'list'}); J.toast('Discarded'); }
      else if (act === 'usealt'){ const d = st.draft; const cur = {total:d.total, currency:d.currency}; d.total = numStr(d.alt.total, d.alt.currency); d.currency = d.alt.currency; d.alt = {total: parseAmount(cur.total) ?? cur.total, currency: cur.currency}; paint(); }
      else if (act === 'rmitem'){ st.draft.items.splice(+a.dataset.i, 1); paint(); }
      else if (act === 'additem'){ st.draft.items.push({n:'', p:0}); paint(); const rows = viewEl.querySelectorAll('.rcpt-it-n'); const last = rows[rows.length-1]; if (last) last.focus(); }
    });
    el.addEventListener('keydown', e=>{ const l = e.target.closest('label[for][role=button]'); if (l && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); const i = document.getElementById(l.htmlFor); if (i) i.click(); } });
  }

  // Home dashboard card
  function renderHome(el){
    ensureInputs();
    const R = store(); const last = R.list.slice().sort((a,b)=>b.created - a.created)[0];
    const s = [R.list.length, last && last.id, last && J.ago(last.created), J.settings.currency, new Date().toDateString()].join('|');
    if (s === homeSig && el.firstChild) return; homeSig = s;
    el.innerHTML = `<div class="rcpt-home" data-go="receipts" role="button" tabindex="0" aria-label="Open receipts">
      <div class="rcpt-home-ic">${IC.cam}</div>
      <div class="rcpt-home-b"><b>Scan a receipt</b><span>${last ? `Last: ${esc(last.merchant)} · ${esc(money(last.total != null ? last.total : (last.amount || 0), last.total != null ? last.currency : null))} · ${esc(J.ago(last.created))}` : "Snap it and I'll log the expense"}</span></div>
      ${camLabel('rcpt-home-btn', `${IC.cam}<span>Scan</span>`)}
    </div>`;
    const btn = el.querySelector('.rcpt-home-btn'); if (btn) btn.addEventListener('click', e=>e.stopPropagation());
  }

  /* =========================================================
     VOICE
     ========================================================= */
  function intent(said, t){
    t = String(t || '').replace(/[.!?]+$/, '').trim();
    if (!/\breceipts?\b/.test(t)) return null;
    // leave notes, reminders and spending to the core ("remind me to scan the receipt", "note: keep the receipt", "paid 20 for ...")
    if (/^(note|notes|take a note|add a note|make a note|remember)\b|\bremind|\bnote\b|\b(paid|spent|spend|bought|buy)\b.*\d|\bset (a |my )?budget\b/.test(t)) return null;
    const R = store();
    if (/\b(delete|remove|undo|cancel|erase)\b/.test(t) && /\b(last|latest|previous|recent|that|this|the)\b/.test(t) && !/\ball\b/.test(t)){
      const last = R.list.slice().sort((a,b)=>b.created - a.created)[0];
      if (!last) return "You don't have any saved receipts.";
      removeReceipt(last.id);
      return `Deleted your ${last.merchant === 'Receipt' ? 'last' : last.merchant} receipt and its expense. Tap undo if that was a mistake.`;
    }
    if (/\b(scan|snap|add|log|capture|photograph|photo|picture|take|upload|enter|new|read)\b/.test(t) && !/\b(show|list|view|see|open|how many|how much|delete|remove)\b/.test(t)){
      if (st.screen === 'scanning'){ J.go('receipts'); return "I'm still reading your last receipt. One moment."; }
      J.go('receipts'); setState({screen:'capture'});
      return 'Okay. Tap Take photo to snap your receipt.';
    }
    if (/\b(show|list|view|see|open|go to|my|how many|how much|total)\b/.test(t) || /^(the )?receipts?$/.test(t)){
      const mk = J.monthKey(Date.now());
      const month = R.list.filter(x=>J.monthKey(x.at) === mk); const tot = month.reduce((s,x)=>s + (x.amount||0), 0);
      J.go('receipts'); if (st.screen !== 'review' && st.screen !== 'scanning') setState({screen:'list'});
      if (!R.list.length) return "You haven't scanned any receipts yet. Say scan a receipt to start.";
      if (!month.length) return `No receipts yet this month. You have ${R.list.length} saved from earlier months.`;
      return `You have ${month.length} receipt${month.length === 1 ? '' : 's'} this month, ${spokenMoney(Math.round(tot*100)/100)} in total.`;
    }
    return null;
  }

  /* =========================================================
     STYLES
     ========================================================= */
  J.css(`
  .rcpt-file{position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0}
  .rcpt-muted{color:var(--muted);font-size:13px}
  .rcpt-ell{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
  .rcpt-head{display:flex;align-items:flex-start;justify-content:space-between}
  .rcpt-hero{position:relative;overflow:hidden;border-radius:26px;padding:20px;background:linear-gradient(140deg,#0f766e 0%,#0d9488 38%,#0ea5e9 100%);color:#fff;box-shadow:0 18px 40px rgba(13,148,136,.32)}
  .rcpt-hero::before{content:"";position:absolute;right:-50px;top:-60px;width:190px;height:190px;border-radius:50%;background:rgba(255,255,255,.12)}
  .rcpt-hero::after{content:"";position:absolute;left:-40px;bottom:-70px;width:160px;height:160px;border-radius:50%;background:rgba(255,255,255,.07)}
  .rcpt-hero-art{position:absolute;right:18px;top:18px;width:46px;height:46px;border-radius:14px;background:rgba(255,255,255,.18);display:grid;place-items:center;z-index:1}
  .rcpt-hero-art svg{width:24px;height:24px}
  .rcpt-hero-t{position:relative;z-index:1;padding-right:58px;margin-bottom:16px}
  .rcpt-hero-t b{display:block;font-size:21px;font-weight:800;letter-spacing:-.4px}
  .rcpt-hero-t span{display:block;font-size:13.5px;opacity:.88;margin-top:3px}
  .rcpt-big{position:relative;z-index:1;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:58px;border-radius:18px;background:#fff;color:#0f766e;font-weight:800;font-size:17px;cursor:pointer;box-shadow:0 10px 24px rgba(0,0,0,.18);transition:transform .15s var(--ease);user-select:none;-webkit-user-select:none}
  .rcpt-big:active{transform:scale(.98)}
  .rcpt-big svg{width:24px;height:24px}
  .rcpt-hero-row{position:relative;z-index:1;display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
  .rcpt-sub{display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px;border-radius:14px;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.14);color:#fff;font-weight:700;font-size:14px;cursor:pointer;padding:0 10px;user-select:none;-webkit-user-select:none}
  .rcpt-sub svg{width:19px;height:19px;flex:none}
  .rcpt-sub:active{transform:scale(.98)}
  .rcpt-review .rcpt-sub,.rcpt-capture .rcpt-sub{border-color:var(--line);background:var(--card);color:var(--text)}
  .rcpt-stats{margin-top:12px}
  .rcpt-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .rcpt-tile{display:flex;flex-direction:column;text-align:left;padding:0;border:1px solid var(--line);background:var(--card);border-radius:20px;overflow:hidden;cursor:pointer;transition:transform .15s var(--ease);min-width:0}
  .rcpt-tile:active{transform:scale(.97)}
  .rcpt-tile.rcpt-new{animation:rcptPop .7s var(--ease);border-color:var(--accent)}
  @keyframes rcptPop{0%{transform:scale(.9);opacity:0}60%{transform:scale(1.02);opacity:1}100%{transform:none}}
  .rcpt-thumb{position:relative;aspect-ratio:4/3;background:var(--bg2);overflow:hidden}
  .rcpt-thumb img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
  .rcpt-ph{display:grid;place-items:center;width:100%;height:100%;color:var(--faint-ink);background:linear-gradient(135deg,var(--accent-soft),transparent)}
  .rcpt-ph svg{width:34px;height:34px}
  .rcpt-cat{position:absolute;left:8px;bottom:8px;width:28px;height:28px;border-radius:9px;display:grid;place-items:center;font-size:14px;box-shadow:0 4px 10px rgba(0,0,0,.25)}
  .rcpt-tile-b{padding:10px 12px 12px;min-width:0}
  .rcpt-tile-m{font-weight:700;font-size:14px}
  .rcpt-tile-r{display:flex;align-items:baseline;justify-content:space-between;gap:6px;margin-top:2px}
  .rcpt-tile-r b{font-size:15px;font-weight:800;white-space:nowrap}
  .rcpt-tile-r span{color:var(--muted);font-size:12px;white-space:nowrap}
  .rcpt-empty b{font-size:15px}
  /* capture */
  .rcpt-capture{display:flex;flex-direction:column;align-items:center;text-align:center;padding:8px 0}
  .rcpt-capture .rcpt-big{background:linear-gradient(135deg,#0d9488,#0ea5e9);color:#fff;min-height:64px;font-size:18px;box-shadow:0 14px 30px rgba(14,165,233,.35)}
  .rcpt-capture .rcpt-hero-row{width:100%}
  .rcpt-pulse{animation:rcptPulse 2s ease-in-out infinite}
  @keyframes rcptPulse{0%,100%{box-shadow:0 14px 30px rgba(14,165,233,.35),0 0 0 0 rgba(14,165,233,.45)}50%{box-shadow:0 14px 30px rgba(14,165,233,.35),0 0 0 12px rgba(14,165,233,0)}}
  .rcpt-frame{position:relative;width:170px;height:210px;margin:10px auto 18px;border-radius:20px;background:var(--card);border:1px solid var(--line);display:grid;place-items:center}
  .rcpt-frame>i{position:absolute;width:28px;height:28px;border:3.5px solid var(--accent2);border-radius:4px}
  .rcpt-frame>i:nth-child(1){left:-6px;top:-6px;border-right:0;border-bottom:0;border-top-left-radius:14px}
  .rcpt-frame>i:nth-child(2){right:-6px;top:-6px;border-left:0;border-bottom:0;border-top-right-radius:14px}
  .rcpt-frame>i:nth-child(3){left:-6px;bottom:-6px;border-right:0;border-top:0;border-bottom-left-radius:14px}
  .rcpt-frame>i:nth-child(4){right:-6px;bottom:-6px;border-left:0;border-top:0;border-bottom-right-radius:14px}
  .rcpt-frame-ic{color:var(--muted)} .rcpt-frame-ic svg{width:64px;height:64px;opacity:.7}
  .rcpt-cap-t{font-size:19px;font-weight:800;letter-spacing:-.3px}
  /* scanning */
  .rcpt-scanning{padding:12px}
  .rcpt-scan{position:relative;border-radius:16px;overflow:hidden;background:#05070d;height:min(52vh,420px);display:grid;place-items:center}
  .rcpt-scan img{max-width:100%;max-height:100%;object-fit:contain;display:block;filter:saturate(.85)}
  .rcpt-beam{position:absolute;left:0;right:0;top:0;height:90px;background:linear-gradient(180deg,transparent,rgba(34,211,238,.16) 70%,rgba(34,211,238,.38));border-bottom:2.5px solid #22d3ee;box-shadow:0 8px 24px rgba(34,211,238,.6);animation:rcptBeam 2.2s cubic-bezier(.45,0,.55,1) infinite alternate}
  @keyframes rcptBeam{from{transform:translateY(-90px)}to{transform:translateY(calc(min(52vh,420px) - 2px))}}
  .rcpt-c{position:absolute;width:26px;height:26px;border:3px solid rgba(255,255,255,.9)}
  .rcpt-c.c1{left:12px;top:12px;border-right:0;border-bottom:0;border-top-left-radius:10px}
  .rcpt-c.c2{right:12px;top:12px;border-left:0;border-bottom:0;border-top-right-radius:10px}
  .rcpt-c.c3{left:12px;bottom:12px;border-right:0;border-top:0;border-bottom-left-radius:10px}
  .rcpt-c.c4{right:12px;bottom:12px;border-left:0;border-top:0;border-bottom-right-radius:10px}
  .rcpt-prog{padding:16px 4px 4px}
  .rcpt-prog-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
  .rcpt-status{font-weight:700;font-size:16px}
  .rcpt-pct{font-size:22px;font-weight:800;letter-spacing:-.4px;font-variant-numeric:tabular-nums;color:var(--accent-ink)}
  .rcpt-bar{margin-top:10px} .rcpt-bar i{transition:width .35s var(--ease)}
  .rcpt-wide{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px}
  .rcpt-wide svg{width:19px;height:19px}
  .rcpt-note{display:flex;gap:8px;align-items:flex-start;font-size:13px;line-height:1.4;border-radius:14px;padding:11px 13px;margin-top:12px;background:var(--accent-soft);color:var(--text)}
  .rcpt-note svg{width:17px;height:17px;flex:none;margin-top:1px}
  .rcpt-note.warn{background:rgba(245,158,11,.14);color:var(--text);box-shadow:inset 3px 0 0 var(--warn)}
  .rcpt-note.bad{background:rgba(244,63,94,.12);color:var(--text);box-shadow:inset 3px 0 0 var(--bad)}
  .rcpt-note.good{background:rgba(34,197,94,.13);color:var(--text)} .rcpt-note.good svg{color:var(--good-ink)}
  .rcpt-note[hidden]{display:none}
  /* review */
  .rcpt-review{padding:16px}
  .rcpt-r-top{display:flex;gap:12px;align-items:center}
  .rcpt-r-img{width:58px;height:74px;border-radius:12px;object-fit:cover;object-position:top;flex:none;border:1px solid var(--line);background:var(--bg2)}
  .rcpt-r-img.rcpt-ph svg{width:26px;height:26px}
  .rcpt-r-title{font-size:18px;font-weight:800;letter-spacing:-.3px;display:block}
  .rcpt-form{display:flex;flex-direction:column;gap:12px;margin-top:14px}
  .rcpt-field{display:flex;flex-direction:column;gap:6px;min-width:0;border-radius:14px}
  .rcpt-field>span{font-size:12.5px;font-weight:700;color:var(--muted);letter-spacing:.2px}
  .rcpt-field em{font-style:normal;font-weight:500;color:var(--warn-ink)}
  .rcpt-form input,.rcpt-form select,.rcpt-it input{width:100%;max-width:none;background:var(--bg2);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:12px;font:inherit;font-size:16px;outline:none;min-width:0;-webkit-appearance:none;appearance:none}
  .rcpt-form select{background-image:linear-gradient(45deg,transparent 50%,var(--muted) 50%),linear-gradient(135deg,var(--muted) 50%,transparent 50%);background-position:calc(100% - 17px) 50%,calc(100% - 12px) 50%;background-size:5px 5px;background-repeat:no-repeat;padding-right:28px}
  .rcpt-form input:focus,.rcpt-form select:focus,.rcpt-it input:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
  :root[data-theme="dark"] .rcpt-form input,:root[data-theme="dark"] .rcpt-form select{color-scheme:dark}
  .rcpt-money{display:flex;gap:8px}
  .rcpt-money select{width:86px;flex:none;font-weight:700}
  .rcpt-money input{flex:1;font-size:22px !important;font-weight:800;letter-spacing:-.3px;padding:10px 12px !important}
  .rcpt-attn .rcpt-money input{border-color:var(--warn);box-shadow:0 0 0 3px rgba(245,158,11,.18)}
  .rcpt-shake{animation:rcptShake .45s}
  @keyframes rcptShake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
  .rcpt-alt{margin-top:-4px}
  .rcpt-alt .link{padding:0 2px;font-size:13px}
  .rcpt-conv{display:flex;flex-direction:column;gap:10px;background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px}
  .rcpt-conv[hidden]{display:none}
  .rcpt-rate{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--muted);font-weight:600}
  .rcpt-form .rcpt-rate input{width:120px;flex:none;padding:8px 10px;font-size:15px;font-weight:700;background:var(--card)}
  .rcpt-chk{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600}
  .rcpt-chk input{width:20px !important;height:20px;padding:0 !important;accent-color:var(--accent);-webkit-appearance:auto !important;appearance:auto !important}
  .rcpt-conv-out{font-size:13px;color:var(--muted)}
  .rcpt-conv-out b{color:var(--text)}
  .rcpt-row2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:10px}
  .rcpt-hint{font-size:12px;color:var(--warn-ink);font-weight:600;margin-top:-1px}
  .rcpt-items-h{display:flex;justify-content:space-between;align-items:baseline;margin:18px 2px 8px;gap:8px}
  .rcpt-isum{font-size:12.5px;text-align:right}
  .rcpt-items{display:flex;flex-direction:column;gap:6px}
  .rcpt-it{display:grid;grid-template-columns:1fr 92px 36px;gap:6px;align-items:center}
  .rcpt-it .mini{width:36px;height:40px}
  .rcpt-items>.link{min-height:40px}
  .rcpt-it input{padding:9px 10px;font-size:14.5px;border-radius:10px}
  .rcpt-it .rcpt-it-p{text-align:right;font-weight:700}
  .rcpt-tips{margin-top:14px;border:1px dashed var(--line);border-radius:16px;padding:12px 14px}
  .rcpt-tips-h{display:flex;align-items:center;gap:8px} .rcpt-tips-h svg{width:18px;height:18px;color:var(--warn-ink)}
  .rcpt-tips ul{margin:6px 0 10px;padding-left:20px;color:var(--muted);font-size:13px}
  .rcpt-save{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;min-height:56px;font-size:17px;margin-top:18px;border-radius:16px;box-shadow:0 10px 24px rgba(109,93,252,.32)}
  .rcpt-save svg{width:20px;height:20px}
  .rcpt-raw{margin-top:14px;font-size:13px;color:var(--muted)}
  .rcpt-raw summary{cursor:pointer;font-weight:600;padding:4px 2px}
  .rcpt-raw pre{white-space:pre-wrap;word-break:break-word;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:10px;max-height:220px;overflow:auto;font-size:12px;margin:8px 0 0}
  /* detail modal */
  .rcpt-detail .rcpt-d-head{display:flex;gap:12px;align-items:center;margin-bottom:12px}
  .rcpt-d-ic{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-size:20px;flex:none}
  .rcpt-d-img{border-radius:14px;overflow:hidden;background:var(--card);border:1px solid var(--line);max-height:42vh;overflow-y:auto;text-align:center}
  .rcpt-d-img img{max-width:100%;display:block;margin:0 auto}
  .rcpt-d-total{display:flex;justify-content:space-between;align-items:baseline;margin:14px 2px 8px}
  .rcpt-d-total span{color:var(--muted);font-weight:600}
  .rcpt-d-total b{font-size:26px;font-weight:800;letter-spacing:-.5px}
  .rcpt-d-items{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:4px 12px;max-height:24vh;overflow-y:auto;margin-bottom:6px}
  .rcpt-d-items div{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);font-size:14px}
  .rcpt-d-items div:last-child{border-bottom:0}
  .rcpt-d-items span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .rcpt-d-sum{color:var(--muted)}
  /* home card */
  .rcpt-home{display:flex;align-items:center;gap:12px;margin-top:14px;padding:12px 12px 12px 14px;border-radius:20px;background:var(--card);border:1px solid var(--line);cursor:pointer;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
  .rcpt-home:active{transform:scale(.99)}
  .rcpt-home-ic{width:44px;height:44px;border-radius:14px;flex:none;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#0d9488,#0ea5e9);box-shadow:0 8px 18px rgba(13,148,136,.3)}
  .rcpt-home-ic svg{width:22px;height:22px}
  .rcpt-home-b{flex:1;min-width:0}
  .rcpt-home-b b{display:block;font-size:15px}
  .rcpt-home-b span{color:var(--muted);font-size:12.5px;margin-top:1px;line-height:1.3;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;text-wrap:balance;overflow-wrap:anywhere}
  .rcpt-home-btn{flex:none;display:flex;align-items:center;gap:6px;min-height:42px;padding:0 14px;border-radius:13px;background:var(--accent);color:var(--on-accent,#fff);font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 6px 16px rgba(109,93,252,.32);user-select:none;-webkit-user-select:none}
  .rcpt-home-btn svg{width:18px;height:18px}
  @media (prefers-reduced-motion: reduce){.rcpt-beam,.rcpt-pulse{animation:none}}
  `);

  /* =========================================================
     REGISTER
     ========================================================= */
  try {
    J.addView({id:'receipts', label:'Receipts', icon:'🧾', color:'#0d9488', order:30, render});
    J.addHomeCard({id:'receipts', order:40, render: renderHome});
    J.addIntent(intent);
    J.addSuggestions(['Scan a receipt']);
  } catch(e){ console.error('receipts', e); }

  // keep receipts in step with the budget: an expense deleted in Budget (or "undo last expense") takes its receipt with it,
  // and the Budget's undo brings it back.
  const parked = {};
  window.addEventListener('jarvis:expense-removed', e=>{
    try {
      const id = e.detail && e.detail.id; if (!id) return;
      const R = store(); const idx = R.list.findIndex(x=>x.expenseId === id); if (idx < 0) return;
      parked[id] = [idx, R.list[idx]]; R.list.splice(idx, 1); ver++; J.save();
    } catch(err){ console.error('receipts', err); }
  });
  window.addEventListener('jarvis:expense-restored', e=>{
    try {
      const id = e.detail && e.detail.id; const p = id && parked[id]; if (!p) return;
      delete parked[id]; const R = store(); if (!R.list.some(x=>x.id === p[1].id)) R.list.splice(Math.min(p[0], R.list.length), 0, p[1]); ver++; J.save();
    } catch(err){ console.error('receipts', err); }
  });
  // a payment edited in Money (or from a receipt's Edit button) updates its receipt too; a total in another currency stays as read
  window.addEventListener('jarvis:expense-updated', e=>{
    try {
      const x = e.detail && e.detail.expense; if (!x || !x.id || x.type === 'income') return;
      const rec = store().list.find(r=>r.expenseId === x.id); if (!rec) return;
      if (rec.amount == null || rec.amount === rec.total) rec.total = x.amount;   // not converted, so the total is the payment
      rec.amount = x.amount; rec.merchant = x.desc || rec.merchant; rec.cat = x.cat || rec.cat; rec.at = x.at || rec.at;
      ver++; J.save();
    } catch(err){ console.error('receipts', err); }
  });
  // tidy up receipts left behind by older versions (their expense was deleted before this link existed)
  try {
    const R = store(); const ids = new Set((J.db.expenses || []).map(x=>x.id));
    const keep = R.list.filter(x=>!x.expenseId || ids.has(x.expenseId));
    if (keep.length !== R.list.length){ R.list = keep; J.save(); }
  } catch(e){}

  // for tests
  J._receiptParse = parseReceipt;
  J._receipt = {parse: parseReceipt, parseAmount, parseDate, pickCategory, prepImage, makeThumb, onFile, normalizeAI: normalizeAIReceipt, rotCanvas};
})();
