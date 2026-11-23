/* =========================================================
   FOOD — barcode scanner + daily calories, macros and water
   Data: Open Food Facts (free, no key) + a built-in table of
   common foods so voice logging works offline.
   ========================================================= */
(function(){
  'use strict';
  const J = window.Jarvis; if (!J) return;

  /* ---------------- constants ---------------- */
  const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
  const OFF = 'https://world.openfoodfacts.org';
  const OFF_FIELDS = 'code,product_name,brands,image_front_small_url,nutriments,serving_size,serving_quantity,serving_quantity_unit,nutrition_data_per,nutriscore_grade,nova_group,quantity';
  const DEFAULTS = {goal:2000, waterGoal:8, days:{}, products:{}, recent:[], photos:{}};
  const MEALS = [
    {id:'breakfast', label:'Breakfast', ic:'🍳'},
    {id:'lunch', label:'Lunch', ic:'🥗'},
    {id:'dinner', label:'Dinner', ic:'🍽️'},
    {id:'snack', label:'Snacks', ic:'🍎'}
  ];
  const MEAL_WORD = {breakfast:'breakfast', lunch:'lunch', dinner:'dinner', snack:'a snack'};
  const MACROS = [
    {k:'p', label:'Protein', color:'#22d3ee', share:.25, per:4},
    {k:'c', label:'Carbs', color:'#f59e0b', share:.50, per:4},
    {k:'f', label:'Fat', color:'#ec4899', share:.25, per:9}
  ];
  const NUTRI = {a:'#038141', b:'#85bb2f', c:'#fecb02', d:'#ee8100', e:'#e63e11'};
  const NOVA = {
    1:['Unprocessed', 'Natural or minimally processed food.'],
    2:['Kitchen ingredient', 'A processed cooking ingredient like oil, butter, sugar or salt.'],
    3:['Processed', 'Processed food, made with added salt, sugar or oil.'],
    4:['Ultra-processed', 'Heavily processed, with many additives. Best kept occasional.']
  };

  /* Common foods: [key, name, emoji, unit, grams per unit, kcal, protein, carbs, fat, aliases]
     Values are typical estimates per unit. */
  const FOODS_RAW = [
    ['egg','Egg','🥚','egg',50,78,6.3,.6,5.3,'egg|boiled egg|fried egg|scrambled egg'],
    ['omelette','Omelette (2 eggs)','🍳','omelette',120,190,13,1,15,'omelette|omelet'],
    ['banana','Banana','🍌','banana',118,105,1.3,27,.4,'banana'],
    ['apple','Apple','🍎','apple',182,95,.5,25,.3,'apple'],
    ['orange','Orange','🍊','orange',131,62,1.2,15.4,.2,'orange'],
    ['date','Date','🌴','date',24,66,.4,18,0,'date|medjool date'],
    ['grapes','Grapes','🍇','cup',151,104,1.1,27,.2,'grape|grapes'],
    ['strawberries','Strawberries','🍓','cup',152,49,1,12,.5,'strawberry|strawberries'],
    ['watermelon','Watermelon','🍉','slice',286,86,1.7,22,.4,'watermelon'],
    ['mango','Mango','🥭','mango',200,120,1.6,30,.8,'mango'],
    ['avocado','Avocado','🥑','avocado',150,240,3,13,22,'avocado'],
    ['cucumber','Cucumber','🥒','cucumber',200,30,1.3,7,.2,'cucumber'],
    ['tomato','Tomato','🍅','tomato',123,22,1.1,4.8,.2,'tomato'],
    ['salad','Green salad','🥗','bowl',150,35,2,6,.3,'salad|green salad'],
    ['fattoush','Fattoush','🥗','bowl',250,230,4,22,14,'fattoush|fattouch'],
    ['tabbouleh','Tabbouleh','🌿','cup',160,190,3,15,14,'tabbouleh|tabouleh|tabbouli|tabouli|taboule'],
    ['hummus','Hummus','🫘','serving',60,160,4.7,8.5,12,'hummus|houmous|hommos|humus|hummos'],
    ['labneh','Labneh','🥛','serving',30,55,2.7,1.5,4.2,'labneh|labne|labni|labnah'],
    ['manakish_zaatar','Manakish zaatar','🫓','piece',130,420,9,52,20,'manakish zaatar|manakeesh zaatar|manoushe zaatar|manousheh zaatar|zaatar manakish|manakish|manakeesh|manoushe|manousheh|mankoushe|man2oushe|zaatar'],
    ['manakish_cheese','Cheese manakish','🧀','piece',150,520,20,55,24,'cheese manakish|manakish cheese|manakish jebneh|manousheh jebneh|manoushe jebneh|jebneh manoushe|jebneh'],
    ['lahm_ajeen','Lahm bi ajeen','🫓','piece',100,250,10,30,10,'lahm bi ajeen|lahm bajeen|lahmajoun|lahmacun|sfiha'],
    ['shawarma_chicken','Chicken shawarma sandwich','🌯','sandwich',250,550,30,50,24,'chicken shawarma|shawarma chicken|shawarma sandwich|chicken shawarma sandwich|shawarma|shawerma|chawarma'],
    ['shawarma_beef','Beef shawarma sandwich','🌯','sandwich',250,650,32,48,34,'beef shawarma|meat shawarma|lahme shawarma|shawarma lahme|beef shawarma sandwich'],
    ['falafel','Falafel','🧆','piece',17,57,2.3,5.4,3,'falafel|falafel ball'],
    ['falafel_sandwich','Falafel sandwich','🌯','sandwich',300,600,18,75,25,'falafel sandwich|falafel wrap'],
    ['tawook','Shish tawook sandwich','🌯','sandwich',220,480,32,45,18,'shish tawook|tawook|taouk|shish taouk|tawook sandwich'],
    ['kibbeh','Kibbeh','🧆','piece',60,190,8,14,11,'kibbeh|kebbeh|kibbe|kubbeh'],
    ['mujaddara','Mujaddara','🍛','cup',200,330,12,50,9,'mujaddara|mjadara|mjaddara|mudardara|mjadra'],
    ['foul','Foul (fava beans)','🫘','cup',250,300,15,35,10,'foul|ful|ful medames|foul mudammas'],
    ['fatteh','Fatteh','🥣','bowl',300,450,18,40,24,'fatteh|fatte|fatet hummus'],
    ['lentil_soup','Lentil soup','🍲','bowl',250,230,13,35,4,'lentil soup|adas soup|shorbet adas|soup'],
    ['knafeh','Knafeh','🍮','piece',150,470,10,55,23,'knafeh|kanafeh|knefe|kunafa|knafe'],
    ['baklava','Baklava','🍯','piece',30,130,2,15,7,'baklava|baklawa'],
    ['pita','Arabic bread','🫓','loaf',60,165,5.5,33,.7,'arabic bread|pita|pita bread|khebez|khubz|lebanese bread|markouk'],
    ['bread','Bread','🍞','slice',30,80,3,15,1,'bread|toast|bread slice|slice of bread|toast slice'],
    ['croissant','Croissant','🥐','croissant',57,231,4.7,26,12,'croissant'],
    ['rice','White rice (cooked)','🍚','cup',158,205,4.3,45,.4,'rice|white rice|cooked rice'],
    ['pasta','Pasta (cooked)','🍝','cup',140,220,8,43,1.3,'pasta|spaghetti|penne|macaroni|noodles'],
    ['oatmeal','Oatmeal','🥣','bowl',234,154,5.4,27,2.6,'oatmeal|oats|porridge'],
    ['cereal','Cereal with milk','🥣','bowl',200,220,7,38,4,'cereal|cornflakes|corn flakes'],
    ['potato','Potato (baked)','🥔','potato',173,161,4.3,37,.2,'potato|baked potato|boiled potato'],
    ['fries','French fries','🍟','medium portion',117,365,4,48,17,'fries|french fries|chips'],
    ['chicken','Chicken breast','🍗','breast',172,284,53,0,6.2,'chicken breast|grilled chicken|chicken|chicken breasts'],
    ['steak','Steak','🥩','steak',150,405,38,0,27,'steak|beef steak|beef'],
    ['salmon','Salmon fillet','🐟','fillet',150,312,30,0,20,'salmon|salmon fillet'],
    ['tuna','Tuna (canned)','🐟','can',120,140,32,0,1,'tuna|can of tuna'],
    ['burger','Burger','🍔','burger',250,540,28,40,29,'burger|hamburger|cheeseburger'],
    ['pizza','Pizza','🍕','slice',107,285,12,36,10,'pizza|pizza slice'],
    ['cheese','Cheese','🧀','slice',28,113,7,.4,9.3,'cheese|cheese slice|cheddar'],
    ['halloumi','Halloumi','🧀','slice',30,96,6.6,.6,7.5,'halloumi|hallomi'],
    ['yogurt','Yogurt','🥛','cup',200,122,7,9.4,6.5,'yogurt|yoghurt|laban|plain yogurt'],
    ['greek_yogurt','Greek yogurt','🥛','cup',170,100,17,6,.7,'greek yogurt|greek yoghurt'],
    ['milk','Milk','🥛','glass',244,122,8,12,4.8,'milk|glass of milk'],
    ['coffee','Coffee (black)','☕','cup',240,2,.3,0,0,'coffee|black coffee|americano|espresso|filter coffee'],
    ['coffee_milk','Coffee with milk','☕','cup',240,60,3,5,3,'coffee with milk|white coffee|nescafe|nescafé|milk coffee|coffee and milk'],
    ['cappuccino','Cappuccino','☕','cup',240,120,6,10,6,'cappuccino|flat white'],
    ['latte','Latte','☕','cup',360,190,12,18,7,'latte|cafe latte|caffe latte'],
    ['arabic_coffee','Arabic coffee','☕','cup',60,30,.1,7,0,'arabic coffee|turkish coffee|ahweh|ahwe|ahwa'],
    ['tea','Tea','🍵','cup',240,2,0,.5,0,'tea|black tea|green tea|mint tea|herbal tea'],
    ['sugar','Sugar','🧂','teaspoon',4,16,0,4,0,'sugar|teaspoon of sugar'],
    ['honey','Honey','🍯','tablespoon',21,64,.1,17,0,'honey'],
    ['olive_oil','Olive oil','🫒','tablespoon',14,119,0,0,13.5,'olive oil|oil'],
    ['peanut_butter','Peanut butter','🥜','tablespoon',16,94,4,3,8,'peanut butter'],
    ['nuts','Mixed nuts','🥜','handful',28,164,6,6,14,'nuts|mixed nuts|almond|almonds|cashew|cashews|walnut|walnuts|pistachio|pistachios'],
    ['chocolate','Chocolate bar','🍫','bar',45,235,3,26,13,'chocolate|chocolate bar|kitkat|snickers|twix'],
    ['cookie','Cookie','🍪','cookie',15,75,1,10,3.5,'cookie|biscuit'],
    ['cake','Cake','🍰','slice',80,300,3.5,42,13,'cake|slice of cake'],
    ['ice_cream','Ice cream','🍨','scoop',66,137,2.3,16,7,'ice cream|gelato'],
    ['cola','Cola','🥤','can',330,140,0,39,0,'cola|coke|pepsi|soda|soft drink|soft drinks'],
    ['diet_cola','Diet cola','🥤','can',330,1,0,0,0,'diet coke|coke zero|pepsi max|diet pepsi|diet cola|diet soda|zero coke'],
    ['juice','Orange juice','🧃','glass',248,112,1.7,26,.5,'orange juice|juice|fresh juice'],
    ['beer','Beer','🍺','can',330,153,1.6,13,0,'beer'],
    ['wine','Wine','🍷','glass',150,125,.1,3.8,0,'wine|glass of wine|red wine|white wine'],
    ['protein_shake','Protein shake','🥤','scoop',30,120,24,3,1.5,'protein shake|protein|whey|shake'],
    ['protein_bar','Protein bar','🍫','bar',60,210,20,22,7,'protein bar']
  ];
  const FOODS = FOODS_RAW.map(([key,name,emoji,unit,g,kcal,p,c,f,al])=>({key,name,emoji,unit,g,n:{kcal,p,c,f},aliases:al.split('|')}));
  const FOOD_BY_KEY = Object.fromEntries(FOODS.map(f=>[f.key,f]));
  // drinks: their weight is shown in ml instead of grams (1 ml ≈ 1 g)
  const LIQ = new Set(['coffee','coffee_milk','cappuccino','latte','arabic_coffee','tea','milk','cola','diet_cola','juice','beer','wine']);
  const wu = u => (u && u.w) || 'g';

  /* ---------------- data ---------------- */
  const F = () => { const s = J.store('food', DEFAULTS); for (const k in DEFAULTS) if (s[k]===undefined) s[k] = JSON.parse(JSON.stringify(DEFAULTS[k])); return s; };
  const dayKey = (d=new Date()) => { d = new Date(d); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const keyDate = k => { const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d, 12); };
  const shiftKey = (k, n) => { const d = keyDate(k); d.setDate(d.getDate()+n); return dayKey(d); };
  const todayKey = () => dayKey();
  const EMPTY_DAY = Object.freeze({items:Object.freeze([]), water:0});
  const getDay = k => F().days[k] || EMPTY_DAY;
  const ensureDay = k => { const s = F(); if (!s.days[k]) s.days[k] = {items:[], water:0}; return s.days[k]; };
  const ntot = (e) => { const u = e.units[e.ui] || e.units[0]; const q = +e.qty || 0; return {kcal:(u.n.kcal||0)*q, p:(u.n.p||0)*q, c:(u.n.c||0)*q, f:(u.n.f||0)*q}; };
  const dayTotals = k => getDay(k).items.reduce((a,e)=>{ const t = ntot(e); a.kcal+=t.kcal; a.p+=t.p; a.c+=t.c; a.f+=t.f; return a; }, {kcal:0,p:0,c:0,f:0});
  const macroTarget = m => Math.round(F().goal * m.share / m.per);
  function defaultMeal(d=new Date()){ const h = d.getHours(); return h>=4&&h<11?'breakfast':h>=11&&h<16?'lunch':h>=18&&h<23?'dinner':'snack'; }

  /* ---------------- formatting ---------------- */
  const esc = J.esc;
  const N = n => Math.round(n||0).toLocaleString('en-US');
  const g1 = n => { n = +n||0; return n>=10 ? String(Math.round(n)) : String(Math.round(n*10)/10); };
  const fq = n => { n = +n; if (n===.5) return '½'; if (n%1===.5) return Math.floor(n)+'½'; return String(Math.round(n*100)/100); };
  function plural(w, n){
    if (n===1 || /\(|^g$|^ml$/.test(w)) return w;
    if (/loaf$/.test(w)) return w.slice(0,-1)+'ves';
    if (/(tomato|potato|mango|sandwich)$/.test(w)) return w+'es';
    if (/(s|x|ch|sh)$/.test(w)) return w+'es';
    if (/[^aeiou]y$/.test(w)) return w.slice(0,-1)+'ies';
    return w+'s';
  }
  const art = w => /^[aeiou]/i.test(w) ? 'an' : 'a';
  function sayItem(name, unit, qty){
    const nm = name.toLowerCase().replace(/\s*\(.*?\)\s*/g,' ').trim();
    if (unit==='g') return `${fq(qty)} grams of ${nm}`;
    if (unit==='ml') return `${fq(qty)} ml of ${nm}`;
    const words = nm.split(' '); const last = words[words.length-1];
    if (last===unit){ if (qty===1) return `${art(nm)} ${nm}`; words[words.length-1] = plural(last, qty); return `${fq(qty)} ${words.join(' ')}`; }
    if (unit==='portion') return qty===1 ? nm : `${fq(qty)} portions of ${nm}`;
    return qty===1 ? `${art(unit)} ${unit} of ${nm}` : `${fq(qty)} ${plural(unit, qty)} of ${nm}`;
  }
  function gramsSay(n){ n = Math.round(n); return n===1 ? '1 gram' : N(n)+' grams'; }
  function listJoin(a){ return a.length<2 ? (a[0]||'') : a.slice(0,-1).join(', ')+' and '+a[a.length-1]; }
  function dateLabel(k){ const t = todayKey(); if (k===t) return 'Today'; if (k===shiftKey(t,-1)) return 'Yesterday'; return keyDate(k).toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'}); }
  function qtyText(e){ const u = e.units[e.ui]||e.units[0]; if (u.u==='g') return `${fq(e.qty)} ${wu(u)}`; const g = u.g ? ` · ${N(u.g*e.qty)} ${wu(u)}` : ''; return `${fq(e.qty)} ${plural(u.u, e.qty)}${g}`; }

  /* ---------------- food objects ----------------
     A "food" = {src, key, name, brand, emoji, img, code, units:[{u, g?, n:{kcal,p,c,f}}], per100, servingText, nutri, nova, qty, missing}
  */
  function scaleN(n, k){ const o = {}; for (const x in n) o[x] = n[x]==null ? null : n[x]*k; return o; }
  function localFood(f){
    const per100 = scaleN(f.n, 100/f.g);
    const w = LIQ.has(f.key) ? 'ml' : 'g';
    return {src:'local', key:'l:'+f.key, lkey:f.key, name:f.name, emoji:f.emoji, w, units:[{u:f.unit, g:f.g, w, n:{...f.n}}, {u:'g', g:1, w, n:scaleN(f.n, 1/f.g)}], per100, estimate:true};
  }
  const num = v => { if (v===undefined || v===null || v==='') return null; const x = parseFloat(v); return isFinite(x) ? x : null; };
  function fromOFF(p, code){
    const n = p.nutriments || {};
    let kcal = num(n['energy-kcal_100g']);
    // energy_100g / energy-kj_100g are always kilojoules in Open Food Facts; 1 kcal = 4.184 kJ
    if (kcal==null){ const kj = num(n['energy-kj_100g'])!=null ? num(n['energy-kj_100g']) : num(n['energy_100g']); if (kj!=null) kcal = kj/4.184; }
    const per100 = {kcal, p:num(n.proteins_100g), c:num(n.carbohydrates_100g), f:num(n.fat_100g), sugar:num(n.sugars_100g), satfat:num(n['saturated-fat_100g']), salt:num(n.salt_100g), fiber:num(n.fiber_100g)};
    let estimatedKcal = false;
    if (per100.kcal==null && (per100.p!=null || per100.c!=null || per100.f!=null)){ per100.kcal = (per100.p||0)*4 + (per100.c||0)*4 + (per100.f||0)*9; estimatedKcal = true; }
    let servingG = num(p.serving_quantity);
    { const squ0 = String(p.serving_quantity_unit||'').toLowerCase().trim(); if (servingG!=null) servingG *= ({cl:10, dl:100, l:1000, kg:1000}[squ0] || 1); }
    let servKcal = num(n['energy-kcal_serving']);
    if (servKcal==null){ const kj = num(n['energy-kj_serving'])!=null ? num(n['energy-kj_serving']) : num(n['energy_serving']); if (kj!=null) servKcal = kj/4.184; }
    // drinks are measured per 100 ml; serving_quantity is in g or ml (cl/l converted just in case)
    const squ = String(p.serving_quantity_unit||'').toLowerCase().trim();
    const liquid = /^(ml|cl|l|dl)$/.test(squ) || (!squ && /\d\s*(ml|cl|l)\b/i.test(String(p.quantity||'')) && !/\d\s*(g|kg)\b/i.test(String(p.quantity||'')));
    const w = liquid ? 'ml' : 'g';
    const food = {
      src:'off', key:'c:'+code, code, name:(p.product_name||'').trim() || 'Unnamed product', brand:String(p.brands||'').split(',')[0].trim(),
      img:p.image_front_small_url || '', emoji:'🛒', per100, servingText:(p.serving_size||'').trim(), quantity:(p.quantity||'').trim().replace(/\s*(?:\u212E|\be)$/, ''),
      nutri:/^[a-e]$/.test(p.nutriscore_grade||'') ? p.nutriscore_grade : null, nova:[1,2,3,4].includes(+p.nova_group) ? +p.nova_group : null,
      estimatedKcal, w, units:[]
    };
    const base = {kcal:per100.kcal||0, p:per100.p||0, c:per100.c||0, f:per100.f||0};
    const hasPer100 = per100.kcal!=null;
    if (servingG && servingG>0 && hasPer100) food.units.push({u:'serving', g:servingG, w, n:scaleN(base, servingG/100)});
    else if (servKcal!=null){ food.units.push({u:'serving', n:{kcal:servKcal, p:num(n.proteins_serving)||0, c:num(n.carbohydrates_serving)||0, f:num(n.fat_serving)||0}}); }
    if (hasPer100) food.units.push({u:'g', g:1, w, n:scaleN(base, 1/100)});
    food.missing = ['p','c','f','sugar','salt'].filter(k=>per100[k]==null);
    food.noKcal = !hasPer100 && servKcal==null;
    return food;
  }
  function manualFood(o){
    return {src:'manual', key:o.code?'c:'+o.code:'m:'+o.name.toLowerCase(), code:o.code||'', name:o.name, emoji:'✍️', units:[{u:'serving', n:{kcal:o.kcal, p:o.p||0, c:o.c||0, f:o.f||0}}]};
  }
  function remember(food){
    const s = F(); const slim = JSON.parse(JSON.stringify(food));
    s.recent = [slim, ...s.recent.filter(r=>r.key!==food.key)].slice(0,10);
    if (food.code){ s.products[food.code] = Object.assign(slim, {cachedAt:Date.now()}); const ks = Object.keys(s.products); if (ks.length>40){ ks.sort((a,b)=>(s.products[a].cachedAt||0)-(s.products[b].cachedAt||0)).slice(0, ks.length-40).forEach(k=>delete s.products[k]); } }
  }
  function addEntry(food, ui, qty, meal, key){
    const e = {id:J.uid(), at:Date.now(), meal, name:food.name, brand:food.brand||'', emoji:food.emoji||'🍽️', img:food.img||'', code:food.code||'', src:food.src, fkey:food.key, units:JSON.parse(JSON.stringify(food.units)), ui, qty};
    ensureDay(key||viewKey).items.push(e); remember(food); J.save();
    return e;
  }

  /* ---------------- network ---------------- */
  /** Open Food Facts often refuses the first request (a busy reply without CORS headers, so fetch fails):
      try once more by itself after 1.5 s before showing an error */
  async function getJSON(url, ms){
    try { return await getJSON1(url, ms); }
    catch(e){ if (e.kind!=='network' && e.kind!=='server') throw e; await sleep(1500); return getJSON1(url, ms); }
  }
  async function getJSON1(url, ms=14000){
    if (navigator.onLine === false) { const er = new Error('offline'); er.kind='offline'; throw er; }
    const ac = ('AbortController' in window) ? new AbortController() : null;
    const tm = setTimeout(()=>{ try { ac && ac.abort(); } catch(e){} }, ms);
    try {
      const r = await fetch(url, ac ? {signal:ac.signal} : {});
      let data = null; try { data = await r.json(); } catch(e){}
      if (!r.ok && r.status!==404){ const er = new Error('http '+r.status); er.kind='server'; throw er; }
      return {status:r.status, data};
    } catch(e){
      if (!e.kind) e.kind = navigator.onLine===false ? 'offline' : (e.name==='AbortError' ? 'timeout' : 'network');
      throw e;
    } finally { clearTimeout(tm); }
  }
  function errText(e, btn){
    if (e && e.kind==='offline') return {t:"You're offline", d:'Connect to Wi-Fi or mobile data and try again.'};
    if (e && e.kind==='timeout') return {t:'That took too long', d:'The food database is slow right now. Please try again.'};
    if (e && e.kind==='server') return {t:'The food database is busy', d:'Open Food Facts did not answer properly. Try again in a minute.'};
    // the phone says it is online, so don't blame the user's internet
    if (navigator.onLine !== false) return {t:"The food database didn't answer", d:`It may be busy for a moment. Tap ${btn||'Try again'}.`};
    return {t:"Couldn't reach the food database", d:'Check your internet connection and try again.'};
  }
  async function lookupCode(code){
    const r = await getJSON(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
    const d = r.data || {};
    if (r.status===404 || !d.product || d.status===0) return null;
    return fromOFF(d.product, code);
  }
  async function searchOFF(q){
    const r = await getJSON(`${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&json=1&page_size=10&fields=${OFF_FIELDS}`, 18000);
    const list = (r.data && r.data.products) || [];
    return list.filter(p=>p && (p.product_name||'').trim()).map(p=>fromOFF(p, p.code||''));
  }

  /* ---------------- barcodes ---------------- */
  function checksumOK(code){
    if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
    const d = code.split('').map(Number); const chk = d.pop(); let s = 0;
    d.reverse().forEach((x,i)=>{ s += x * (i%2===0 ? 3 : 1); });
    return (10 - s%10)%10 === chk;
  }
  function normCode(c){ c = String(c).replace(/\D/g,''); if (c.length===14 && c[0]==='0') c = c.slice(1); return c; }
  /** interpret whatever a scanner read: a product code, a link containing one, or something else */
  function interpret(raw){
    const s = String(raw||'').trim();
    if (/^\d{6,14}$/.test(s)) return {code:normCode(s)};
    let m;
    if ((m = s.match(/openfoodfacts\.[a-z.]+\/(?:api\/v\d\/)?product\/(\d{6,14})/i))) return {code:normCode(m[1])};
    if ((m = s.match(/^https?:\/\/[^\s]+\/01\/(\d{8,14})(?:[\/?#]|$)/i))) return {code:normCode(m[1])};
    if ((m = s.match(/^\(01\)(\d{14})/)) || (m = s.match(/^01(\d{14})/))) return {code:normCode(m[1])};
    if (/^https?:\/\//i.test(s)) return {url:s};
    return {text:s};
  }

  let zxPromise = null;
  function loadZX(){
    if (window.ZXing) return Promise.resolve(window.ZXing);
    if (!zxPromise) zxPromise = J.loadScript(ZXING_URL).then(()=>{ if (!window.ZXing) throw new Error('zxing missing'); return window.ZXing; }).catch(e=>{ zxPromise = null; const s = document.querySelector(`script[src="${ZXING_URL}"]`); if (s) s.remove(); throw e; });
    return zxPromise;
  }
  let zxReader = null;
  function zxDecodeCanvas(cv){
    const Z = window.ZXing;
    if (!zxReader){
      zxReader = new Z.MultiFormatReader(); const h = new Map(); const B = Z.BarcodeFormat;
      h.set(Z.DecodeHintType.POSSIBLE_FORMATS, [B.EAN_13, B.EAN_8, B.UPC_A, B.UPC_E, B.CODE_128, B.CODE_39, B.ITF, B.QR_CODE]);
      h.set(Z.DecodeHintType.TRY_HARDER, true); zxReader.setHints(h);
    }
    try {
      const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(cv)));
      const r = zxReader.decodeWithState(bmp); return r ? r.getText() : null;
    } catch(e){ return null; } finally { try { zxReader.reset(); } catch(e){} }
  }
  let nativeDet = null, nativeP = null;
  function getNative(){ if (!nativeP) nativeP = makeNative(); return nativeP; }
  async function makeNative(){
    try {
      if (!('BarcodeDetector' in window)) return null;
      const want = ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf','qr_code'];
      const sup = await window.BarcodeDetector.getSupportedFormats();
      const formats = want.filter(f=>sup.includes(f));
      if (!formats.length) return null;
      nativeDet = new window.BarcodeDetector({formats});
    } catch(e){ nativeDet = null; }
    return nativeDet;
  }
  /** decode a still image file, using the native detector or the zxing library */
  async function decodeFile(file){
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej)=>{ const i = new Image(); i.onload = ()=>res(i); i.onerror = rej; i.src = url; });
      const det = await getNative();
      if (det){ try { const r = await det.detect(img); if (r && r[0]) return r[0].rawValue; } catch(e){} }
      await loadZX();
      const cv = document.createElement('canvas'); const ctx = cv.getContext('2d', {willReadFrequently:true});
      for (const max of [1200, 1800, 700]){
        const k = Math.min(1, max/Math.max(img.naturalWidth, img.naturalHeight));
        cv.width = Math.round(img.naturalWidth*k); cv.height = Math.round(img.naturalHeight*k);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        const t = zxDecodeCanvas(cv); if (t) return t;
      }
      return null;
    } finally { URL.revokeObjectURL(url); }
  }

  /* ---------------- icons ---------------- */
  const I = {
    scan:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 8v8M11 8v8M14 8v8M17 8v8" stroke-width="1.6"/></svg>',
    close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    flash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
    photo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
    keys:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="13" rx="3"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 15h10"/></svg>',
    cam:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
    search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    minus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>',
    left:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>',
    right:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    pen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
  };

  /* ---------------- styles ---------------- */
  J.css(`
  .fd-top{display:flex;align-items:flex-end;justify-content:space-between;gap:12px}
  .fd-date{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:4px 0 14px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:5px}
  .fd-date button{width:40px;height:40px;border:0;border-radius:12px;background:none;display:grid;place-items:center;cursor:pointer;color:var(--text)}
  .fd-date button:disabled{opacity:.25;cursor:default}
  .fd-date button svg{width:20px;height:20px}
  .fd-date b{font-size:15px;font-weight:700}
  .fd-date small{display:block;text-align:center;color:var(--muted);font-size:11.5px;font-weight:600;margin-top:-1px}
  .fd-sum{display:flex;gap:16px;align-items:center}
  .fd-ring{position:relative;flex:none}
  .fd-ring svg{width:100%;height:100%;transform:rotate(-90deg);display:block}
  .fd-ring circle.fd-arc{transition:stroke-dashoffset .9s var(--ease)}
  .fd-ring .fd-rc{position:absolute;inset:0;display:grid;place-items:center;text-align:center;line-height:1.1}
  .fd-ring .fd-rc b{display:block;font-size:30px;font-weight:800;letter-spacing:-1px}
  .fd-ring .fd-rc span{font-size:11.5px;color:var(--muted);font-weight:600}
  .fd-ring.sm .fd-rc b{font-size:15px;letter-spacing:-.3px}
  .fd-ring.sm .fd-rc span{font-size:9px}
  .fd-kv{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px}
  .fd-kv .r{display:flex;align-items:center;gap:10px}
  .fd-kv .ic{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;font-size:16px;flex:none}
  .fd-kv .ic svg{width:19px;height:19px}
  .fd-kv .v{line-height:1.2;min-width:0}
  .fd-kv small{display:block;color:var(--muted);font-size:11.5px;font-weight:600}
  .fd-kv b{font-size:17px;font-weight:800;letter-spacing:-.3px}
  .fd-kv i{font-style:normal;font-size:11.5px;color:var(--muted);font-weight:600;margin-left:3px}
  .fd-goalbtn{position:relative;border:0;background:none;padding:0;cursor:pointer;text-align:left;color:var(--text)}.fd-goalbtn::after{content:"";position:absolute;inset:-5px -4px}
  .fd-goalbtn svg{width:13px;height:13px;color:var(--muted);margin-left:2px;vertical-align:-1px}
  .fd-macros{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}
  .fd-macro .l{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;font-weight:600;color:var(--muted);gap:4px}
  .fd-macro .l b{color:var(--text);font-size:13.5px}
  .fd-macro .bar{height:7px;background:var(--line);border-radius:9px;overflow:hidden;margin-top:6px}
  .fd-macro .bar i{display:block;height:100%;border-radius:9px;transition:width .7s var(--ease)}
  .fd-macro .t{font-size:11px;color:var(--faint-ink);margin-top:4px;font-weight:600}
  .fd-actions{display:grid;grid-template-columns:1.25fr 1fr;gap:10px;margin-top:14px}
  .fd-scanbtn{border:0;border-radius:18px;padding:15px 14px;font-weight:800;font-size:15px;cursor:pointer;color:#fff;background:linear-gradient(135deg,var(--accent),#0ea5e9);display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 10px 24px rgba(79,70,229,.32);transition:transform .15s var(--ease)}
  .fd-scanbtn:active,.fd-ghost:active{transform:scale(.97)}
  .fd-scanbtn svg{width:22px;height:22px}
  .fd-ghost{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:18px;padding:14px;font-weight:700;font-size:14.5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:transform .15s var(--ease)}
  .fd-ghost svg{width:18px;height:18px}
  .fd-search{margin:14px 0 0}
  .fd-search .search{margin-bottom:10px}
  .fd-search .search button{border:0;background:var(--accent);color:var(--on-accent,#fff);border-radius:10px;padding:7px 11px;font-weight:700;font-size:13px;cursor:pointer;flex:none}
  .fd-qp{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:2px 16px 4px}
  .fd-qp::-webkit-scrollbar{display:none}
  .fd-qp .chip{gap:7px}
  .fd-sub{font-size:12px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin:10px 2px 8px}
  .fd-res{display:flex;flex-direction:column;gap:8px}
  .fd-row{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:10px 12px;cursor:pointer;text-align:left;width:100%;color:var(--text);transition:transform .15s var(--ease)}
  .fd-row:active{transform:scale(.985)}
  .fd-th{width:44px;height:44px;border-radius:12px;flex:none;display:grid;place-items:center;font-size:22px;background:var(--line);overflow:hidden;position:relative}
  .fd-th img{width:100%;height:100%;object-fit:contain;background:#fff}
  .fd-row .b{flex:1;min-width:0}
  .fd-row .b b{display:block;font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .fd-row .b small{display:block;color:var(--muted);font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
  .fd-row .k{font-weight:800;font-size:15px;white-space:nowrap;text-align:right}
  .fd-row .k small{display:block;font-size:10.5px;color:var(--muted);font-weight:600}
  .fd-ns{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border-radius:6px;color:#fff;font-weight:800;font-size:11.5px;vertical-align:1px;margin-right:4px}
  .fd-online{display:flex;align-items:center;gap:10px;width:100%;border:1px dashed var(--line);background:none;color:var(--accent-ink);border-radius:16px;padding:13px 14px;font-weight:700;cursor:pointer;font-size:14px;text-align:left}
  .fd-online svg{width:18px;height:18px;flex:none}
  .fd-shim{height:66px;border-radius:16px;background:linear-gradient(90deg,var(--card) 0%,var(--line) 50%,var(--card) 100%);background-size:200% 100%;animation:fdShim 1.2s linear infinite;border:1px solid var(--line)}
  @keyframes fdShim{to{background-position:-200% 0}}
  .fd-err{display:flex;gap:12px;align-items:center;padding:14px;border-radius:16px;border:1px solid var(--line);background:var(--card)}
  .fd-err .e{font-size:24px}
  .fd-err b{display:block}
  .fd-err small{color:var(--muted);font-size:12.5px}
  .fd-err button{margin-left:auto;flex:none}
  .fd-meal{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:6px 14px 8px;margin-bottom:10px}
  .fd-mh{display:flex;align-items:center;gap:10px;padding:8px 0}
  .fd-mh .mi{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;font-size:17px;background:var(--accent-soft);flex:none}
  .fd-mh b{flex:1;font-size:15px}
  .fd-mh b small{display:block;color:var(--muted);font-size:12px;font-weight:600}
  .fd-mh .kc{font-weight:800}
  .fd-mh .add{width:40px;height:40px;border-radius:11px;border:1px solid var(--line);background:none;display:grid;place-items:center;cursor:pointer;color:var(--accent-ink);flex:none}
  .fd-mh .add svg{width:17px;height:17px}
  .fd-it{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line);cursor:pointer;width:100%;background:none;border-left:0;border-right:0;border-bottom:0;color:var(--text);text-align:left}
  .fd-it .fd-th{width:40px;height:40px;font-size:20px}
  .fd-it .b{flex:1;min-width:0}
  .fd-it .b b{display:block;font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .fd-it .b small{color:var(--muted);font-size:12.5px}
  .fd-it .k{font-weight:700;white-space:nowrap}
  .fd-mempty{color:var(--faint-ink);font-size:13px;padding:2px 0 8px 44px}
  .fd-water{display:flex;align-items:center;gap:12px}
  .fd-glasses{display:flex;gap:4px;flex:1;min-width:0;flex-wrap:wrap}
  .fd-glass{flex:1 1 0;min-width:16px;max-width:26px;aspect-ratio:3/4;border:0;padding:0;background:none;cursor:pointer}
  .fd-glass{position:relative}.fd-glass::after{content:"";position:absolute;inset:-4px -10px}
  .fd-glasses.many .fd-glass{flex:0 0 20px}
  .fd-glass svg{width:100%;height:100%}
  .fd-wbtn{width:44px;height:44px;border-radius:14px;border:0;background:#0ea5e9;color:#fff;display:grid;place-items:center;cursor:pointer;flex:none;box-shadow:0 8px 18px rgba(14,165,233,.35)}
  .fd-wbtn.m{background:var(--card);color:var(--text);border:1px solid var(--line);box-shadow:none;width:40px;height:40px;border-radius:12px}
  .fd-wbtn svg{width:20px;height:20px}
  .fd-chart{position:relative;height:150px;display:flex;align-items:flex-end;gap:8px;margin-top:22px;padding-bottom:22px}
  .fd-col{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;cursor:pointer;border:0;background:none;padding:0;position:relative;color:var(--text)}
  .fd-col i{display:block;width:100%;max-width:30px;border-radius:4px 4px 2px 2px;background:linear-gradient(180deg,var(--accent2),var(--accent));min-height:3px;transition:height .6s var(--ease);opacity:.55}
  .fd-col.sel i{opacity:1}
  .fd-col.over i{background:linear-gradient(180deg,#fbbf24,var(--warn));opacity:.7}
  .fd-col.over.sel i{opacity:1}
  .fd-col.zero i{background:var(--line);opacity:1}
  .fd-col span{position:absolute;bottom:-21px;font-size:11px;color:var(--faint-ink);font-weight:700}
  .fd-col.sel span{color:var(--text)}
  .fd-col em{font-style:normal;font-size:11px;font-weight:800;margin-bottom:4px;white-space:nowrap}
  .fd-goal-line{position:absolute;left:0;right:0;border-top:1.5px dashed var(--faint);pointer-events:none;z-index:2}
  .fd-goal-line span{position:absolute;left:0;top:-18px;font-size:10.5px;color:var(--muted);font-weight:700;background:var(--card-solid);padding:0 4px;border-radius:4px}
  .fd-note{font-size:11.5px;color:var(--faint-ink);text-align:center;margin:16px 8px 0}
  /* home card */
  .fd-home{display:flex;align-items:center;gap:14px;cursor:pointer}
  .fd-home .b{flex:1;min-width:0}
  .fd-home .b b{display:block;font-size:17px;font-weight:800;letter-spacing:-.3px}
  .fd-home .b small{display:block;color:var(--muted);font-size:12.5px;margin-top:2px}
  .fd-home .mm{display:flex;gap:4px;margin-top:8px}
  .fd-home .mm i{flex:1;height:5px;border-radius:9px;background:var(--line);overflow:hidden}
  .fd-home .mm i u{display:block;height:100%;border-radius:9px}
  .fd-hscan{flex:none;width:52px;height:52px;border-radius:16px;border:0;cursor:pointer;color:#fff;background:linear-gradient(135deg,var(--accent),#0ea5e9);display:grid;place-items:center;box-shadow:0 8px 18px rgba(79,70,229,.35)}
  .fd-hscan svg{width:24px;height:24px}
  /* sheet */
  .fd-bg{position:fixed;inset:0;z-index:62;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);opacity:0;pointer-events:none;transition:opacity .3s}
  .fd-bg.open{opacity:1;pointer-events:auto}
  .fd-sheet{position:fixed;left:50%;bottom:0;bottom:max(0px,calc(100% - var(--vv-h,100%) - var(--vv-top,0px)));transform:translate(-50%,105%);width:100%;max-width:520px;max-height:92vh;max-height:min(92dvh,calc(var(--vv-h,100%) - 8px));z-index:63;background:var(--bg2);border:1px solid var(--line);border-bottom:0;border-radius:28px 28px 0 0;transition:transform .4s var(--ease);box-shadow:0 -20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column}
  .fd-sheet.open{transform:translate(-50%,0)}
  .fd-sheet:not(.open){visibility:hidden;transition:transform .42s var(--ease),visibility 0s linear .42s}
  .fd-sheet .grab{flex:none}
  .fd-sb{overflow-y:auto;padding:4px 18px calc(18px + var(--safe-b));-webkit-overflow-scrolling:touch}
  .fd-sx{position:absolute;right:10px;top:10px;width:44px;height:44px;border-radius:50%;border:1px solid var(--line);background:var(--card);display:grid;place-items:center;cursor:pointer;color:var(--text);z-index:2}
  .fd-sx svg{width:18px;height:18px}
  .fd-ph{display:flex;gap:14px;align-items:center;margin:6px 40px 14px 0}
  .fd-ph .fd-th{width:76px;height:76px;border-radius:18px;font-size:38px;background:#fff;border:1px solid var(--line)}
  .fd-ph .fd-th.em{background:var(--accent-soft)}
  .fd-ph h4{margin:0;font-size:19px;font-weight:800;letter-spacing:-.3px;line-height:1.2}
  .fd-ph .br{color:var(--muted);font-size:13px;margin-top:3px}
  .fd-badges{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
  .fd-nscore{display:inline-flex;align-items:center;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:6px 8px 6px 10px}
  .fd-nscore small{font-size:10.5px;font-weight:800;color:var(--muted);letter-spacing:.03em}
  .fd-nscore .ls{display:flex;gap:2px;align-items:center}
  .fd-nscore .ls i{font-style:normal;width:17px;height:20px;border-radius:5px;display:grid;place-items:center;font-size:10.5px;font-weight:800;color:#fff;opacity:.35}
  .fd-nscore .ls i.on{opacity:1;width:24px;height:27px;font-size:14px;border-radius:7px;box-shadow:0 3px 8px rgba(0,0,0,.25)}
  .fd-nova{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:7px 12px 7px 7px;flex:1;min-width:190px}
  .fd-nova .nv{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;font-weight:800;color:#fff;flex:none}
  .fd-nova b{display:block;font-size:13px}
  .fd-nova small{display:block;color:var(--muted);font-size:11.5px;line-height:1.3}
  .fd-kcals{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
  .fd-kcals div{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px}
  .fd-kcals small{display:block;color:var(--muted);font-size:12px;font-weight:600}
  .fd-kcals b{font-size:22px;font-weight:800;letter-spacing:-.4px}
  .fd-kcals b span{font-size:12px;color:var(--muted);font-weight:700;margin-left:3px}
  .fd-nt{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:4px 14px;margin-bottom:12px}
  .fd-nt div{display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--line);font-size:14px}
  .fd-nt div:last-child{border-bottom:0}
  .fd-nt span{flex:1}
  .fd-nt em{font-style:normal;font-size:11px;font-weight:700;padding:2px 7px;border-radius:99px}
  .fd-nt b{min-width:58px;text-align:right}
  .fd-warnbox{font-size:12.5px;color:var(--muted);background:rgba(245,158,11,.12);border-radius:12px;padding:10px 12px;margin-bottom:12px}
  .fd-lbl{font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin:16px 2px 8px}
  .fd-step{display:flex;align-items:center;gap:10px}
  .fd-step button.pm{width:48px;height:48px;border-radius:15px;border:1px solid var(--line);background:var(--card);display:grid;place-items:center;cursor:pointer;color:var(--text);flex:none}
  .fd-step button.pm svg{width:20px;height:20px}
  .fd-step input{flex:1;min-width:0;text-align:center;font:inherit;font-size:22px;font-weight:800;background:var(--card);border:1px solid var(--line);color:var(--text);border-radius:15px;height:48px;outline:none}
  .fd-step input:focus{border-color:var(--accent)}
  .fd-unit{font-size:13px;color:var(--muted);text-align:center;margin-top:6px;font-weight:600}
  .fd-quick{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
  .fd-quick button{flex:1;min-width:52px;min-height:44px;border:1px solid var(--line);background:var(--card);border-radius:12px;padding:8px 4px;font-weight:700;font-size:13px;cursor:pointer;color:var(--text)}
  .fd-quick button.on{border-color:var(--accent);color:var(--accent-ink);background:var(--accent-soft)}
  .fd-seg{margin-bottom:0}
  .fd-seg button{padding:10px 4px}
  .fd-total{display:flex;align-items:center;gap:12px;margin:16px 0 12px;background:var(--accent-soft);border-radius:16px;padding:12px 14px}
  .fd-total b{font-size:24px;font-weight:800;letter-spacing:-.5px}
  .fd-total b span{font-size:13px;font-weight:700;color:var(--muted);margin-left:3px}
  .fd-total small{color:var(--muted);font-size:12.5px;font-weight:600;margin-left:auto;text-align:right;line-height:1.35}
  .fd-cta{width:100%;border:0;border-radius:16px;padding:16px;font-weight:800;font-size:16px;cursor:pointer;color:#fff;background:linear-gradient(135deg,var(--accent),#0ea5e9);box-shadow:0 10px 24px rgba(79,70,229,.3)}
  .fd-cta:disabled{opacity:.45}
  .fd-row2{display:flex;gap:10px;margin-top:10px}
  .fd-det{margin-bottom:12px}
  .fd-det .fs-field input{padding-right:2px}
  .fd-du{flex:none;width:30px;color:var(--muted);font-size:14px}
  .fd-row2 > *{flex:1}
  .fd-field{display:block;margin-bottom:10px}
  .fd-field span{display:block;font-size:12.5px;font-weight:600;color:var(--muted);margin:0 2px 5px}
  .fd-field input{width:100%;background:var(--card);color:var(--text);border:1px solid var(--line);border-radius:13px;padding:12px;font:inherit;font-size:16px;outline:none}
  .fd-field input:focus{border-color:var(--accent)}
  .fd-g3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .fd-center{text-align:center;padding:10px 4px 4px}
  .fd-center .big{font-size:44px;margin-bottom:6px}
  .fd-center h4{margin:0 0 6px;font-size:19px;font-weight:800}
  .fd-center p{margin:0 0 16px;color:var(--muted);font-size:14px}
  .fd-stack{display:flex;flex-direction:column;gap:10px}
  .fd-sk{border-radius:12px;background:linear-gradient(90deg,var(--card) 0%,var(--line) 50%,var(--card) 100%);background-size:200% 100%;animation:fdShim 1.2s linear infinite}
  .fd-qrbox{word-break:break-all;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;font-size:13px;color:var(--text);margin-bottom:14px;text-align:left}
  /* scanner */
  .fd-scan{position:fixed;inset:0;z-index:60;background:#000;color:#fff;display:none;overflow:hidden}
  .fd-scan.open{display:block;animation:fadeUp .25s var(--ease)}
  .fd-scan video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .4s}
  .fd-scan.live video{opacity:1}
  .fd-scan .bgg{position:absolute;inset:0;background:radial-gradient(600px 400px at 50% 30%,rgba(109,93,252,.35),transparent 70%),#05060c}
  .fd-scan.live .bgg{display:none}
  .fd-frame{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);width:min(78vw,340px);height:min(48vw,210px);border-radius:22px;box-shadow:0 0 0 200vmax rgba(0,0,0,.52);display:none}
  .fd-scan.live .fd-frame{display:block}
  .fd-frame i{position:absolute;width:34px;height:34px;border:4px solid #fff;border-radius:4px}
  .fd-frame i.a{left:-2px;top:-2px;border-right:0;border-bottom:0;border-top-left-radius:22px}
  .fd-frame i.b{right:-2px;top:-2px;border-left:0;border-bottom:0;border-top-right-radius:22px}
  .fd-frame i.c{left:-2px;bottom:-2px;border-right:0;border-top:0;border-bottom-left-radius:22px}
  .fd-frame i.d{right:-2px;bottom:-2px;border-left:0;border-top:0;border-bottom-right-radius:22px}
  .fd-laser{position:absolute;left:8%;right:8%;height:2px;top:10%;border-radius:2px;background:linear-gradient(90deg,transparent,#ff3b5c,transparent);box-shadow:0 0 14px 3px rgba(255,59,92,.6);animation:fdLaser 1.8s ease-in-out infinite alternate}
  @keyframes fdLaser{to{top:90%}}
  .fd-scan.hit .fd-frame i{border-color:#22c55e}
  .fd-scan.hit .fd-laser{display:none}
  .fd-scan.hit .fd-frame{box-shadow:0 0 0 200vmax rgba(0,0,0,.6),inset 0 0 0 3px #22c55e}
  .fd-stop{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;justify-content:space-between;padding:calc(12px + var(--safe-t)) 14px 12px;background:linear-gradient(180deg,rgba(0,0,0,.55),transparent);z-index:3}
  .fd-stop b{font-size:16px;font-weight:700}
  .fd-cb{width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.16);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#fff;display:grid;place-items:center;cursor:pointer}
  .fd-cb svg{width:21px;height:21px}
  .fd-cb.on{background:#fde047;color:#111}
  .fd-cb[hidden]{visibility:hidden;display:grid}
  .fd-sstate{position:absolute;left:0;right:0;top:44%;transform:translateY(-50%);text-align:center;padding:0 28px;z-index:2}
  .fd-sstate .big{font-size:46px;margin-bottom:8px}
  .fd-sstate h4{margin:0 0 6px;font-size:20px;font-weight:800}
  .fd-sstate p{margin:0 auto 18px;color:rgba(255,255,255,.72);font-size:14.5px;max-width:330px}
  .fd-start{border:0;border-radius:999px;padding:18px 30px;font-size:17px;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--accent),#0ea5e9);display:inline-flex;align-items:center;gap:10px;cursor:pointer;box-shadow:0 14px 34px rgba(79,70,229,.55);animation:fdPulse 2s ease-in-out infinite}
  .fd-start svg{width:24px;height:24px}
  @keyframes fdPulse{50%{box-shadow:0 14px 34px rgba(79,70,229,.55),0 0 0 12px rgba(109,93,252,.15)}}
  .fd-spin{width:42px;height:42px;border-radius:50%;border:3px solid rgba(255,255,255,.2);border-top-color:#fff;animation:fdSpin .8s linear infinite;margin:0 auto 14px}
  @keyframes fdSpin{to{transform:rotate(360deg)}}
  .fd-sbot{position:absolute;left:0;right:0;bottom:0;padding:16px 16px calc(20px + var(--safe-b));background:linear-gradient(0deg,rgba(0,0,0,.7),transparent);z-index:3;text-align:center}
  .fd-hint{font-size:14.5px;font-weight:600;margin-bottom:14px;text-shadow:0 1px 6px rgba(0,0,0,.6)}
  .fd-sbot .r{display:flex;gap:10px;max-width:420px;margin:0 auto}
  .fd-sbot .r button{flex:1;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.14);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#fff;border-radius:16px;padding:13px 8px;font-weight:700;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
  .fd-sbot .r button svg{width:19px;height:19px}
  .fd-sstate .lnk{background:none;border:0;color:rgba(255,255,255,.85);font-weight:700;text-decoration:underline;cursor:pointer;margin-top:14px;font-size:14px;padding:6px}
  `);

  /* ---------------- shared UI pieces ---------------- */
  function thumb(o, cls='', full=false){
    const pic = o.pid ? photoOf(o.pid) : '';
    // logged from a photo: the big header shows the photo; lists show the item's emoji with a tiny photo badge
    if (pic) return full ? `<div class="fd-th ph ${cls}"><img src="${pic}" alt=""></div>` : `<div class="fd-th em ${cls}">${o.emoji||'🍽️'}<img class="fdp-badge" src="${pic}" alt=""></div>`;
    if (o.img) return `<div class="fd-th ${cls}"><img src="${esc(o.img)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('em');this.replaceWith(document.createTextNode('${o.emoji||'🛒'}'))"></div>`;
    return `<div class="fd-th em ${cls}">${o.emoji||'🍽️'}</div>`;
  }
  function ringSVG(eaten, goal, size, stroke, gid){
    const r = (size-stroke)/2, C = 2*Math.PI*r, pct = goal>0 ? Math.min(eaten/goal, 1) : 0, over = eaten>goal && goal>0;
    const col1 = over ? '#f59e0b' : 'var(--accent2)', col2 = over ? '#f43f5e' : 'var(--accent)';
    return `<svg viewBox="0 0 ${size} ${size}"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${col1}"/><stop offset="1" stop-color="${col2}"/></linearGradient></defs>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${stroke}"/>
      <circle class="fd-arc" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="url(#${gid})" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-pct)}" ${pct===0?'opacity="0"':''}/></svg>`;
  }
  function nutriBadge(g){ if (!g) return ''; return `<div class="fd-nscore" aria-label="Nutri-Score ${g.toUpperCase()}"><small>NUTRI-SCORE</small><span class="ls">${'abcde'.split('').map(x=>`<i class="${x===g?'on':''}" style="background:${NUTRI[x]}">${x.toUpperCase()}</i>`).join('')}</span></div>`; }
  function novaBadge(n){ if (!n) return ''; const c = ['','#22c55e','#eab308','#f59e0b','#f43f5e'][n]; return `<div class="fd-nova"><div class="nv" style="background:${c}">${n}</div><div><b>${NOVA[n][0]} <span style="color:var(--muted);font-weight:600">· NOVA ${n}</span></b><small>${NOVA[n][1]}</small></div></div>`; }
  function level(k, v, liquid){
    // UK traffic-light thresholds per 100 g (food) or per 100 ml (drinks)
    const L = (liquid ? {sugar:[2.5,11.25], f:[1.5,8.75], satfat:[.75,2.5], salt:[.3,.75]} : {sugar:[5,22.5], f:[3,17.5], satfat:[1.5,5], salt:[.3,1.5]})[k]; if (!L || v==null) return '';
    const [t, c, bg] = v<=L[0] ? ['Low','var(--good-ink)','rgba(34,197,94,.14)'] : v>L[1] ? ['High','var(--bad-ink)','rgba(244,63,94,.14)'] : ['Medium','var(--warn-ink)','rgba(245,158,11,.16)'];
    return `<em style="color:${c};background:${bg}">${t}</em>`;
  }
  function nsMini(g){ return g ? `<span class="fd-ns" style="background:${NUTRI[g]}">${g.toUpperCase()}</span>` : ''; }
  function kcalPer100(f){ return f.per100 && f.per100.kcal!=null ? f.per100.kcal : null; }

  /* ---------------- bottom sheet ---------------- */
  let sheetEl, sheetBg, sheetOnClose = null;
  function ensureSheet(){
    if (sheetEl) return;
    sheetBg = document.createElement('div'); sheetBg.className = 'fd-bg';
    sheetEl = document.createElement('div'); sheetEl.className = 'fd-sheet'; sheetEl.setAttribute('role','dialog');
    sheetEl.innerHTML = `<div class="grab"></div><button class="fd-sx" aria-label="Close">${I.close}</button><div class="fd-sb"></div>`;
    document.body.append(sheetBg, sheetEl);
    sheetBg.onclick = closeSheet; sheetEl.querySelector('.fd-sx').onclick = closeSheet;
  }
  function openSheet(html, onClose){
    ensureSheet(); sheetOnClose = onClose || null;
    const body = sheetEl.querySelector('.fd-sb'); body.innerHTML = html; body.scrollTop = 0;
    void sheetEl.offsetHeight; // commit the closed position so the slide-up animates
    sheetEl.classList.add('open'); sheetBg.classList.add('open');
    document.body.style.overflow = 'hidden';
    return body;
  }
  function sheetBody(){ ensureSheet(); return sheetEl.querySelector('.fd-sb'); }
  function sheetOpen(){ return sheetEl && sheetEl.classList.contains('open'); }
  function closeSheet(){
    if (!sheetEl) return; sheetEl.classList.remove('open'); sheetBg.classList.remove('open');
    if (!scanOpen()) document.body.style.overflow = '';
    const f = sheetOnClose; sheetOnClose = null; if (f) try { f(); } catch(e){}
  }

  /* ---------------- product / food sheet ---------------- */
  function showLoading(code){
    openSheet(`<div class="fd-ph"><div class="fd-th fd-sk" style="border:0;background-color:transparent"></div><div style="flex:1"><div class="fd-sk" style="height:20px;width:80%"></div><div class="fd-sk" style="height:14px;width:45%;margin-top:9px"></div></div></div>
      <div class="fd-kcals"><div class="fd-sk" style="height:70px;border:0"></div><div class="fd-sk" style="height:70px;border:0"></div></div>
      <div class="fd-sk" style="height:180px"></div>
      <p style="text-align:center;color:var(--muted);font-size:13px;margin:14px 0 0">Looking up ${esc(code)}…</p>`);
  }
  /** opts: {meal, key, entry (for editing)} */
  function showFood(food, opts={}){
    const editing = opts.entry || null;
    const st = {ui: editing ? editing.ui : 0, qty: editing ? editing.qty : 1, meal: editing ? editing.meal : (opts.meal || defaultMeal()), manualKcal:null};
    if (!editing){ const u = food.units[0]; if (u && u.u==='g') st.qty = 100; if (food.defQty) { st.ui = food.defUi||0; st.qty = food.defQty; } }
    const key = opts.key || viewKey;
    if (food.noKcal && !food.units.length) food.units = [{u:'serving', n:{kcal:0, p:0, c:0, f:0}}];
    const p100 = food.per100;
    const units = food.units;
    const hasG = units.some(u=>u.u==='g');
    const serving = units.find(u=>u.u!=='g');
    let hdr = '';
    if (!food.noKcal){
      const k100 = kcalPer100(food);
      const sv = serving ? serving.n.kcal : null;
      const svLabel = food.src==='local' ? `Per ${serving.u}${serving.g?` (${N(serving.g)} ${wu(serving)})`:''}` : `Per serving${serving && serving.g ? ` (${food.servingText || N(serving.g)+' '+wu(serving)})` : ''}`;
      const boxes = [];
      if (k100!=null || food.src==='off') boxes.push(`<div><small>Per 100 ${food.w||'g'}</small><b>${k100!=null?N(k100):'—'}<span>kcal</span></b></div>`);
      if (sv!=null) boxes.push(`<div><small>${esc(svLabel)}</small><b>${N(sv)}<span>kcal</span></b></div>`);
      if (boxes.length) hdr = `<div class="fd-kcals" style="${boxes.length===1?'grid-template-columns:1fr':''}">${boxes.join('')}</div>`;
    }
    const rowsDef = [['p','Protein'],['c','Carbs'],['sugar','  of which sugar'],['f','Fat'],['satfat','  of which saturated'],['salt','Salt'],['fiber','Fiber']];
    const table = p100 && !food.noKcal ? `<div class="fd-nt">${rowsDef.filter(([k])=>food.src==='off' || ['p','c','f'].includes(k)).map(([k,l])=>{ const v = p100[k]; if (v==null && (k==='satfat'||k==='fiber')) return ''; return `<div><span style="${l.startsWith('  ')?'padding-left:12px;color:var(--muted)':''}">${l.trim()}</span>${food.src==='off'?level(k,v,food.w==='ml'):''}<b>${v!=null?g1(v)+' g':'—'}</b></div>`; }).join('')}</div>` : '';
    const subtitle = [food.brand, food.quantity].filter(Boolean).join(' · ') || (food.src==='local' ? 'Common food · typical values' : food.src==='manual' ? 'Added by you' : food.src==='ai-photo' ? 'From your photo · AI estimate' : '');
    let warn = '';
    if (food.noKcal) warn = `<div class="fd-warnbox">⚠️ This product has no calorie info yet. Type the calories from the label below.</div>`;
    else if (food.src==='off' && food.missing && food.missing.length) warn = `<div class="fd-warnbox">Some nutrition info is missing for this product, so totals may be a little low.</div>`;
    else if (food.estimatedKcal) warn = `<div class="fd-warnbox">Calories were worked out from protein, carbs and fat.</div>`;
    const dayTxt = key===todayKey() ? 'today' : dateLabel(key);
    const body = openSheet(`
      <div class="fd-ph">${thumb(food, '', true)}<div style="min-width:0"><h4>${esc(food.name)}</h4><div class="br">${esc(subtitle)}</div></div></div>
      ${(food.nutri||food.nova) ? `<div class="fd-badges">${nutriBadge(food.nutri)}${novaBadge(food.nova)}</div>` : ''}
      ${hdr}${warn}
      ${food.noKcal ? `<label class="fd-field"><span>Calories per serving (from the label)</span><input id="fdManK" type="number" inputmode="decimal" placeholder="e.g. 180"></label>` : ''}
      ${table ? `<div class="fd-lbl">Nutrition per 100 ${food.w||'g'}</div>${table}` : ''}
      <div class="fd-lbl">How much?</div>
      ${units.length>1 ? `<div class="seg fd-seg" id="fdUnitSeg" style="margin-bottom:10px">${units.map((u,i)=>`<button data-u="${i}">${u.u==='g'?(wu(u)==='ml'?'ml':'Grams'):esc(cap(plural(u.u,2)))}</button>`).join('')}</div>` : ''}
      <div class="fd-step"><button class="pm" id="fdMinus" aria-label="Less">${I.minus}</button><input id="fdQty" type="number" inputmode="decimal" step="any" min="0" aria-label="Amount"><button class="pm" id="fdPlus" aria-label="More">${I.plus}</button></div>
      <div class="fd-unit" id="fdUnitTxt"></div>
      <div class="fd-quick" id="fdQuick"></div>
      <div class="fd-lbl">Meal</div>
      <div class="seg fd-seg" id="fdMealSeg">${MEALS.map(m=>`<button data-m="${m.id}">${m.id==='snack'?'Snack':m.label}</button>`).join('')}</div>
      ${editing ? `<div class="fd-lbl">Details</div><div class="fs-group fd-det"><label class="fs-field"><span class="fl">Name</span><input id="fdEN" type="text" autocomplete="off" autocapitalize="sentences" value="${esc(editing.name)}"></label>${[['kcal','Calories','kcal'],['p','Protein','g'],['c','Carbs','g'],['f','Fat','g']].map(([k,l,u])=>`<label class="fs-field"><span class="fl">${l}</span><input data-en="${k}" type="text" inputmode="decimal" autocomplete="off" aria-label="${l} (${u})"><span class="fd-du">${u}</span></label>`).join('')}</div><p class="fd-note" style="margin:-4px 4px 12px">Fix the name, calories or macros if the label says something different. Numbers are for the amount above.</p>` : ''}
      <div class="fd-total"><b id="fdTotK">0<span>kcal</span></b><small id="fdTotM"></small></div>
      <button class="fd-cta" id="fdAdd">${editing ? 'Save changes' : 'Add to '+esc(dayTxt)}</button>
      ${editing ? `<div class="fd-row2"><button class="btn danger" id="fdDel">Delete</button></div>` : ''}
      ${food.src==='off' ? `<p class="fd-note" style="margin-top:12px">Data from Open Food Facts${food.code?` · barcode ${esc(food.code)}`:''}</p>` : food.src==='local' ? `<p class="fd-note" style="margin-top:12px">Typical values. Packaged food? Scan its barcode for exact numbers.</p>` : food.src==='ai-photo' ? `<p class="fd-note" style="margin-top:12px">Estimated by AI from a photo. It can be off by 20–30%.</p>` : ''}
    `);
    const $ = s => body.querySelector(s);
    const qIn = $('#fdQty');
    function unit(){ return units[st.ui] || units[0]; }
    function quickVals(){ return unit().u==='g' ? [50,100,150,200,250] : [.5,1,1.5,2,3]; }
    function upd(fromInput){
      const u = unit();
      if (editing) body.querySelectorAll('[data-en]').forEach(i=>{ if (!i.dataset.t){ const v = ntot({units, ui:st.ui, qty:st.qty})[i.dataset.en]; i.value = String(i.dataset.en==='kcal' ? Math.round(v) : Math.round(v*10)/10); } });
      if (!fromInput) qIn.value = String(Math.round(st.qty*100)/100);
      $('#fdUnitTxt').textContent = u.u==='g' ? (wu(u)==='ml'?'ml':'grams') : `${plural(u.u, st.qty)}${u.g ? ` · ${N(u.g*st.qty)} ${wu(u)}` : ''}`;
      body.querySelectorAll('#fdUnitSeg button').forEach(b=>b.classList.toggle('active', +b.dataset.u===st.ui));
      body.querySelectorAll('#fdMealSeg button').forEach(b=>b.classList.toggle('active', b.dataset.m===st.meal));
      $('#fdQuick').innerHTML = quickVals().map(v=>`<button data-q="${v}" class="${v===st.qty?'on':''}">${u.u==='g'?v+' '+wu(u):fq(v)}</button>`).join('');
      const n = u.n; const k = food.noKcal ? (st.manualKcal||0)*st.qty : (n.kcal||0)*st.qty;
      $('#fdTotK').innerHTML = `${N(k)}<span>kcal</span>`;
      $('#fdTotM').innerHTML = food.noKcal ? 'your portion' : `Protein ${g1(n.p*st.qty)} g · Carbs ${g1(n.c*st.qty)} g<br>Fat ${g1(n.f*st.qty)} g`;
      $('#fdAdd').disabled = !(st.qty>0) || (food.noKcal && !(st.manualKcal>0));
    }
    function step(dir){
      const u = unit();
      if (u.u==='g'){ st.qty = Math.max(5, Math.round((st.qty + dir*(st.qty>=100?25:10))/5)*5); }
      else { st.qty = dir>0 ? (st.qty<1 ? 1 : Math.floor(st.qty)+1) : (st.qty<=1 ? .5 : Math.ceil(st.qty)-1); }
      upd();
    }
    body.querySelectorAll('[data-en]').forEach(i=>i.addEventListener('input', ()=>{ i.dataset.t = '1'; }));
    $('#fdMinus').onclick = ()=>step(-1); $('#fdPlus').onclick = ()=>step(1);
    qIn.oninput = ()=>{ const v = parseFloat(qIn.value); st.qty = v>0 ? v : 0; upd(true); };
    $('#fdQuick').onclick = e=>{ const b = e.target.closest('[data-q]'); if (b){ st.qty = +b.dataset.q; upd(); } };
    body.querySelectorAll('#fdUnitSeg button').forEach(b=>b.onclick = ()=>{
      const ni = +b.dataset.u; if (ni===st.ui) return;
      const from = unit(), to = units[ni];
      if (from.g && to.g){ const grams = from.g*st.qty; st.qty = to.u==='g' ? Math.round(grams) : Math.max(.5, Math.round(grams/to.g*2)/2); }
      else st.qty = to.u==='g' ? 100 : 1;
      st.ui = ni; upd();
    });
    body.querySelectorAll('#fdMealSeg button').forEach(b=>b.onclick = ()=>{ st.meal = b.dataset.m; upd(); });
    const mk = $('#fdManK'); if (mk) mk.oninput = ()=>{ st.manualKcal = parseFloat(mk.value)||0; upd(true); };
    $('#fdAdd').onclick = ()=>{
      if (!(st.qty>0)) return;
      if (food.noKcal){ food.units = [{u:'serving', n:{kcal:st.manualKcal, p:0, c:0, f:0}}]; food.noKcal = false; st.ui = 0; }
      if (editing){
        // typed details: a new name, and calories / macros for this amount (every portion size is scaled to match)
        const nm = ($('#fdEN') && $('#fdEN').value.trim()) || ''; if (nm) editing.name = cap(nm);
        body.querySelectorAll('[data-en]').forEach(i=>{
          if (!i.dataset.t) return; const k = i.dataset.en, v = parseFloat(String(i.value).replace(',', '.'));
          if (!(v >= 0)) return; const now = ntot({units, ui:st.ui, qty:st.qty})[k];
          if (Math.abs(v - now) < (k==='kcal' ? .5 : .05)) return;
          if (now > 0) units.forEach(x=>{ x.n[k] = (x.n[k]||0) * v/now; });
          else { const cu = units[st.ui] || units[0]; units.forEach(x=>{ x.n[k] = x===cu ? v/st.qty : (x.g && cu.g ? v/st.qty * x.g/cu.g : (x.n[k]||0)); }); }
        });
        Object.assign(editing, {ui:st.ui, qty:st.qty, meal:st.meal}); J.save(); closeSheet(); J.renderAll(); J.toast('Saved');
        return;
      }
      const e = addEntry(food, st.ui, st.qty, st.meal, key);
      closeSheet();
      if (J.current!=='food') J.go('food');
      J.renderAll();
      const t = dayTotals(key);
      const lf = F().goal - t.kcal;
      J.toast(`Added ${N(ntot(e).kcal)} kcal · ${lf>=0 ? N(lf)+' left' : N(-lf)+' over'}`, ()=>{ removeEntry(key, e.id); });
    };
    const del = $('#fdDel'); if (del) del.onclick = ()=>{ closeSheet(); deleteWithUndo(key, editing.id); };
    upd();
  }
  function cap(s){ return J.cap(s); }
  function removeEntry(key, id){ const d = F().days[key]; if (!d) return null; const i = d.items.findIndex(x=>x.id===id); if (i<0) return null; const [x] = d.items.splice(i,1); J.save(); J.renderAll(); return {x, i}; }
  function deleteWithUndo(key, id){
    const r = removeEntry(key, id); if (!r) return;
    J.toast(`Removed ${r.x.name}`, ()=>{ ensureDay(key).items.splice(r.i, 0, r.x); J.save(); J.renderAll(); });
  }

  function showNotFound(code){
    openSheet(`<div class="fd-center"><div class="big">🔍</div><h4>Product not found</h4>
      <p>This barcode (${esc(code)}) isn't in the free food database yet. You can search by name or add it yourself — I'll remember it next time you scan it.</p>
      <div class="fd-stack"><button class="fd-cta" id="fdNfMan">Add it myself</button><button class="fd-ghost" id="fdNfSearch">${I.search} Search by name</button><button class="fd-ghost" id="fdNfScan">${I.scan} Scan again</button></div></div>`);
    const b = sheetBody();
    b.querySelector('#fdNfMan').onclick = ()=>showManual({code});
    b.querySelector('#fdNfSearch').onclick = ()=>{ closeSheet(); J.go('food'); setTimeout(()=>focusSearch(), 350); };
    b.querySelector('#fdNfScan').onclick = ()=>{ closeSheet(); openScanner(); };
  }
  function showLookupError(code, err){
    const t = errText(err);
    openSheet(`<div class="fd-center"><div class="big">${err && err.kind==='offline'?'📡':'⚠️'}</div><h4>${t.t}</h4><p>${t.d}</p>
      <div class="fd-stack"><button class="fd-cta" id="fdRetry">Try again</button><button class="fd-ghost" id="fdErrMan">${I.pen} Enter it myself</button></div></div>`);
    const b = sheetBody();
    b.querySelector('#fdRetry').onclick = ()=>lookupAndShow(code);
    b.querySelector('#fdErrMan').onclick = ()=>showManual({code});
  }
  let lookupSeq = 0;
  async function lookupAndShow(code){
    code = normCode(code); const my = ++lookupSeq;
    const cached = F().products[code];
    if (cached){ showFood(cached); return; }
    showLoading(code);
    try {
      const food = await lookupCode(code);
      if (my!==lookupSeq || !sheetOpen()) return;
      if (!food) return showNotFound(code);
      showFood(food);
    } catch(e){ if (my===lookupSeq && sheetOpen()) showLookupError(code, e); }
  }
  function showManual(o={}){
    openSheet(`<div class="fd-ph"><div class="fd-th em">✍️</div><div><h4>Add food yourself</h4><div class="br">${o.code?`Barcode ${esc(o.code)} · saved for next time`:'Type what is on the label, or your best guess'}</div></div></div>
      <label class="fd-field"><span>Name</span><input id="fdMN" placeholder="e.g. Grandma's kibbeh" value="${esc(o.name||'')}" autocomplete="off"></label>
      <label class="fd-field"><span>Calories (kcal) for one serving</span><input id="fdMK" type="number" inputmode="decimal" placeholder="e.g. 250"></label>
      <div class="fd-g3"><label class="fd-field"><span>Protein g</span><input id="fdMP" type="number" inputmode="decimal" placeholder="0"></label><label class="fd-field"><span>Carbs g</span><input id="fdMC" type="number" inputmode="decimal" placeholder="0"></label><label class="fd-field"><span>Fat g</span><input id="fdMF" type="number" inputmode="decimal" placeholder="0"></label></div>
      <div class="fd-lbl" style="margin-top:6px">Meal</div>
      <div class="seg fd-seg" id="fdMM">${MEALS.map(m=>`<button data-m="${m.id}">${m.id==='snack'?'Snack':m.label}</button>`).join('')}</div>
      <button class="fd-cta" id="fdMS" style="margin-top:16px" disabled>Add to ${viewKey===todayKey()?'today':esc(dateLabel(viewKey))}</button>`);
    const b = sheetBody(); const $ = s=>b.querySelector(s);
    let meal = o.meal || defaultMeal();
    const sync = ()=>{ b.querySelectorAll('#fdMM button').forEach(x=>x.classList.toggle('active', x.dataset.m===meal)); $('#fdMS').disabled = !($('#fdMN').value.trim() && parseFloat($('#fdMK').value)>=0 && $('#fdMK').value!==''); };
    b.querySelectorAll('#fdMM button').forEach(x=>x.onclick=()=>{ meal = x.dataset.m; sync(); });
    $('#fdMN').oninput = sync; $('#fdMK').oninput = sync;
    $('#fdMS').onclick = ()=>{
      const food = manualFood({code:o.code, name:cap($('#fdMN').value.trim()), kcal:parseFloat($('#fdMK').value)||0, p:parseFloat($('#fdMP').value)||0, c:parseFloat($('#fdMC').value)||0, f:parseFloat($('#fdMF').value)||0});
      const e = addEntry(food, 0, 1, meal, viewKey); closeSheet(); if (J.current!=='food') J.go('food'); J.renderAll();
      J.toast(`Added ${food.name} · ${N(ntot(e).kcal)} kcal`, ()=>removeEntry(viewKey, e.id));
    };
    sync(); setTimeout(()=>{ try { $(o.name?'#fdMK':'#fdMN').focus(); } catch(e){} }, 380);
  }
  function showTypeCode(){
    openSheet(`<div class="fd-ph"><div class="fd-th em">🔢</div><div><h4>Type the barcode</h4><div class="br">The numbers under the bars, usually 8 or 13 digits</div></div></div>
      <label class="fd-field"><span>Barcode number</span><input id="fdTC" inputmode="numeric" pattern="[0-9]*" placeholder="e.g. 5287000580025" autocomplete="off" style="font-size:20px;letter-spacing:1.5px;font-weight:700"></label>
      <div id="fdTCw" style="font-size:12.5px;color:var(--warn-ink);min-height:18px;margin:-4px 2px 10px"></div>
      <button class="fd-cta" id="fdTCgo" disabled>Look it up</button>`);
    const b = sheetBody(); const inp = b.querySelector('#fdTC'), go = b.querySelector('#fdTCgo'), w = b.querySelector('#fdTCw');
    const sync = ()=>{ const v = inp.value.replace(/\D/g,''); go.disabled = v.length<6; w.textContent = (v.length>=8 && [8,12,13,14].includes(v.length) && !checksumOK(v)) ? 'Double-check the digits — that number looks off. You can still try.' : ''; };
    inp.oninput = sync; inp.onkeydown = e=>{ if (e.key==='Enter' && !go.disabled) go.click(); };
    go.onclick = ()=>lookupAndShow(inp.value.replace(/\D/g,''));
    setTimeout(()=>{ try { inp.focus(); } catch(e){} }, 380);
  }
  function showQR(r){
    const isUrl = !!r.url; let host = '';
    try { if (isUrl) host = new URL(r.url).hostname; } catch(e){}
    openSheet(`<div class="fd-center"><div class="big">🔳</div><h4>That's a QR code</h4><p>${isUrl?`It links to <b>${esc(host)}</b>, not a food product.`:"It doesn't contain a food barcode."}</p>
      <div class="fd-qrbox">${esc((r.url||r.text||'').slice(0,300))}</div>
      <div class="fd-stack">${isUrl && /^https?:/i.test(r.url) ? `<a class="fd-ghost" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">Open link</a>` : ''}<button class="fd-cta" id="fdQrScan">Scan the product barcode</button></div></div>`);
    sheetBody().querySelector('#fdQrScan').onclick = ()=>{ closeSheet(); openScanner(); };
  }
  function handleScanResult(raw){
    const r = interpret(raw);
    if (r.code) lookupAndShow(r.code); else showQR(r);
  }
  function showGoal(){
    const s = F();
    openSheet(`<div class="fd-ph"><div class="fd-th em">🎯</div><div><h4>Daily goals</h4><div class="br">Or say “Set my calorie goal to 1800”</div></div></div>
      <label class="fd-field"><span>Calories per day</span><input id="fdGK" type="number" inputmode="numeric" value="${s.goal}" style="font-size:22px;font-weight:800"></label>
      <div class="fd-quick" id="fdGQ" style="margin:-2px 0 14px">${[1500,1800,2000,2200,2500].map(v=>`<button data-v="${v}" class="${v===s.goal?'on':''}">${N(v)}</button>`).join('')}</div>
      <label class="fd-field"><span>Glasses of water per day</span><input id="fdGW" type="number" inputmode="numeric" value="${s.waterGoal}"></label>
      <p style="color:var(--muted);font-size:12.5px;margin:2px 2px 14px">Protein, carbs and fat targets follow your calorie goal (25% · 50% · 25%).</p>
      <button class="fd-cta" id="fdGS">Save</button>`);
    const b = sheetBody();
    b.querySelector('#fdGQ').onclick = e=>{ const x = e.target.closest('[data-v]'); if (!x) return; b.querySelector('#fdGK').value = x.dataset.v; b.querySelectorAll('#fdGQ button').forEach(y=>y.classList.toggle('on', y===x)); };
    b.querySelector('#fdGS').onclick = ()=>{
      const k = parseInt(b.querySelector('#fdGK').value), w = parseInt(b.querySelector('#fdGW').value);
      if (k>=500 && k<=10000) s.goal = k; if (w>=1 && w<=30) s.waterGoal = w;
      J.save(); closeSheet(); J.renderAll(); J.toast(`Goal set to ${N(s.goal)} kcal a day`);
    };
  }

  /* ---------------- scanner ---------------- */
  let scanEl = null, stream = null, loopT = null, torchOn = false, scanActive = false, detectMode = null, scanCanvas = null, resumeOnShow = false;
  const scanOpen = () => scanEl && scanEl.classList.contains('open');
  function ensureScanner(){
    if (scanEl) return;
    scanEl = document.createElement('div'); scanEl.className = 'fd-scan'; scanEl.setAttribute('role','dialog'); scanEl.setAttribute('aria-label','Barcode scanner');
    scanEl.innerHTML = `<div class="bgg"></div><video playsinline muted autoplay></video>
      <div class="fd-frame"><i class="a"></i><i class="b"></i><i class="c"></i><i class="d"></i><div class="fd-laser"></div></div>
      <div class="fd-stop"><button class="fd-cb" data-a="close" aria-label="Close scanner">${I.close}</button><b>Scan a barcode</b><button class="fd-cb" data-a="torch" aria-label="Flashlight" hidden>${I.flash}</button></div>
      <div class="fd-sstate"></div>
      <div class="fd-sbot"><div class="fd-hint">Point the camera at the barcode</div><div class="r"><label for="fdPhCam" class="ai" data-a="food" role="button" tabindex="0">${I.cam} Food photo</label><button data-a="photo">${I.photo} Photo</button><button data-a="type">${I.keys} Type it</button></div></div>
      <input type="file" accept="image/*" hidden data-f="gal"><input type="file" accept="image/*" capture="environment" hidden data-f="cap">`;
    document.body.appendChild(scanEl);
    const v = scanEl.querySelector('video'); v.muted = true; v.setAttribute('playsinline',''); v.setAttribute('webkit-playsinline','');
    scanEl.addEventListener('click', e=>{
      const b = e.target.closest('[data-a]'); if (!b) return;
      const a = b.dataset.a;
      if (a==='close') closeScanner();
      else if (a==='torch') toggleTorch();
      else if (a==='photo') scanEl.querySelector('[data-f=gal]').click();
      else if (a==='capture') scanEl.querySelector('[data-f=cap]').click();
      else if (a==='type'){ closeScanner(); showTypeCode(); }
      else if (a==='start') startCamera();
      else if (a==='search'){ closeScanner(); J.go('food'); setTimeout(focusSearch, 350); }
      else if (a==='food'){ ensurePhotoInputs(); closeScanner(); } // the label itself opens the camera
      else if (a==='aiphoto'){ const f = lastScanFile; closeScanner(); if (f) onPhotoFile(f, {skipBarcode:true}); else openPhoto(); }
    });
    scanEl.querySelectorAll('input[type=file]').forEach(inp=>inp.onchange = async ()=>{
      const file = inp.files && inp.files[0]; inp.value = ''; if (!file) return;
      lastScanFile = file;
      stopCamera(); setState('busy', 'Reading the photo…');
      try {
        const txt = await decodeFile(file);
        if (txt){ beep(); closeScanner(); handleScanResult(txt); }
        else setState('nophoto');
      } catch(e){ setState(navigator.onLine===false ? 'libfail' : 'nophoto'); }
    });
  }
  function setState(s, msg){
    const box = scanEl.querySelector('.fd-sstate');
    const hint = scanEl.querySelector('.fd-hint');
    scanEl.classList.toggle('live', s==='live');
    hint.style.visibility = s==='live' ? '' : 'hidden';
    const photoBtn = `<button class="lnk" data-a="capture">Take a photo of the barcode instead</button>`;
    const H = {
      live:'',
      busy:`<div class="fd-spin"></div><p>${esc(msg||'Starting the camera…')}</p>`,
      tap:`<div class="big">📷</div><h4>Ready to scan</h4><p>Tap below to turn on the camera, then point it at the barcode on the package.</p><button class="fd-start" data-a="start">${I.cam} Start camera</button><br><label for="fdPhCam" class="lnk" data-a="food" role="button" tabindex="0" style="display:inline-block">No barcode? Snap the food instead</label>`,
      denied:`<div class="big">🔒</div><h4>Camera is blocked</h4><p>${/iphone|ipad/i.test(navigator.userAgent) ? 'On iPhone: open <b>Settings → Safari → Camera</b> and choose <b>Allow</b>, or tap <b>aA</b> in the address bar → Website Settings → Camera.' : 'Tap the lock icon next to the web address → <b>Permissions</b> → allow <b>Camera</b>, then try again.'}</p><button class="fd-start" data-a="start">${I.cam} Try again</button><br>${photoBtn}`,
      nocam:`<div class="big">📵</div><h4>No camera found</h4><p>${window.isSecureContext===false ? 'The camera only works on the secure (https) link of Jarvis.' : "This device doesn't have a camera Jarvis can use."} You can still use a photo or type the number.</p>${photoBtn}`,
      inuse:`<div class="big">📸</div><h4>Camera is busy</h4><p>Another app is using the camera. Close it and try again.</p><button class="fd-start" data-a="start">${I.cam} Try again</button>`,
      libfail:`<div class="big">📡</div><h4>Scanner needs internet once</h4><p>Connect to the internet so Jarvis can load the scanner, or type the number instead.</p><button class="fd-start" data-a="start">${I.cam} Try again</button>`,
      nophoto:`<div class="big">🤔</div><h4>Couldn't read that photo</h4><p>Try a closer, sharper photo with the whole barcode in view and good light — or type the number.</p><button class="fd-start" data-a="photo">${I.photo} Choose another photo</button><br><button class="lnk" data-a="aiphoto">No barcode? Count its calories with AI</button><br><button class="lnk" data-a="start" style="margin-top:2px">Use the live camera</button>`,
      error:`<div class="big">⚠️</div><h4>Camera didn't start</h4><p>${esc(msg||'Something went wrong with the camera.')}</p><button class="fd-start" data-a="start">${I.cam} Try again</button><br>${photoBtn}`
    };
    box.innerHTML = H[s] || '';
    scanEl.dataset.state = s;
  }
  function openScanner(opts={}){
    ensureScanner(); closeSheet();
    const core = document.getElementById('sheet'); if (core && core.classList.contains('open')) { const c = document.getElementById('closeSheet'); if (c) c.click(); }
    scanEl.classList.add('open'); scanEl.classList.remove('hit'); document.body.style.overflow = 'hidden';
    scanEl.querySelector('[data-a=torch]').hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ setState('nocam'); return; }
    getNative(); loadZX().catch(()=>{}); // warm up decoders
    if (opts.fromVoice) setState('tap'); else startCamera();
  }
  function closeScanner(){
    stopCamera(); if (scanEl){ scanEl.classList.remove('open'); }
    if (!sheetOpen()) document.body.style.overflow = '';
  }
  async function startCamera(){
    if (!scanEl) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ setState('nocam'); return; }
    stopCamera(); setState('busy'); scanActive = true; scanEl.classList.remove('hit');
    try {
      const s = await navigator.mediaDevices.getUserMedia({audio:false, video:{facingMode:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720}}});
      if (!scanOpen() || !scanActive){ s.getTracks().forEach(t=>t.stop()); return; }
      stream = s;
      const v = scanEl.querySelector('video'); v.srcObject = s;
      try { await v.play(); } catch(e){}
      // decoder: native first, otherwise the zxing library
      const det = await getNative();
      if (det) detectMode = 'native';
      else {
        try { await loadZX(); detectMode = 'zx'; }
        catch(e){ stopCamera(); setState('libfail'); return; }
      }
      if (!scanOpen() || !scanActive) return stopCamera();
      setState('live');
      try { const tr = s.getVideoTracks()[0]; const cap = tr.getCapabilities ? tr.getCapabilities() : {}; scanEl.querySelector('[data-a=torch]').hidden = !cap.torch; } catch(e){}
      loop();
    } catch(e){
      scanActive = false;
      const n = e && e.name;
      if (n==='NotAllowedError' || n==='SecurityError' || n==='PermissionDeniedError') setState('denied');
      else if (n==='NotFoundError' || n==='OverconstrainedError' || n==='DevicesNotFoundError') setState('nocam');
      else if (n==='NotReadableError' || n==='TrackStartError' || n==='AbortError') setState('inuse');
      else setState('error', e && e.message);
    }
  }
  function stopCamera(){
    scanActive = false; clearTimeout(loopT); loopT = null; torchOn = false;
    if (stream){ try { stream.getTracks().forEach(t=>t.stop()); } catch(e){} stream = null; }
    if (scanEl){ const v = scanEl.querySelector('video'); try { v.pause(); } catch(e){} v.srcObject = null; const tb = scanEl.querySelector('[data-a=torch]'); tb.classList.remove('on'); }
  }
  async function toggleTorch(){
    try { const tr = stream && stream.getVideoTracks()[0]; if (!tr) return; torchOn = !torchOn; await tr.applyConstraints({advanced:[{torch:torchOn}]}); scanEl.querySelector('[data-a=torch]').classList.toggle('on', torchOn); } catch(e){ torchOn = false; }
  }
  async function readFrame(v){
    if (!v.videoWidth) return null;
    if (detectMode==='native'){
      try { const r = await nativeDet.detect(v); return r && r[0] ? r[0].rawValue : null; }
      catch(e){ try { await loadZX(); detectMode = 'zx'; } catch(er){} return null; }
    }
    if (!window.ZXing) return null;
    if (!scanCanvas) scanCanvas = document.createElement('canvas');
    const vw = v.videoWidth, vh = v.videoHeight;
    const cw = vw*.86, ch = vh*.62, sx = (vw-cw)/2, sy = (vh-ch)/2;
    const k = Math.min(1, 720/cw);
    scanCanvas.width = Math.round(cw*k); scanCanvas.height = Math.round(ch*k);
    const ctx = scanCanvas.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(v, sx, sy, cw, ch, 0, 0, scanCanvas.width, scanCanvas.height);
    return zxDecodeCanvas(scanCanvas);
  }
  async function loop(){
    if (!scanActive || !scanOpen()) return;
    const v = scanEl.querySelector('video');
    let txt = null; try { txt = await readFrame(v); } catch(e){}
    if (!scanActive || !scanOpen()) return;
    if (txt){
      scanEl.classList.add('hit'); beep(); try { navigator.vibrate && navigator.vibrate(60); } catch(e){}
      stopCamera(); setTimeout(()=>{ closeScanner(); handleScanResult(txt); }, 280);
      return;
    }
    loopT = setTimeout(loop, detectMode==='native' ? 120 : 160);
  }
  let actx = null;
  function beep(){
    try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = actx || new AC(); const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = 1320; g.gain.setValueAtTime(.0001, actx.currentTime); g.gain.exponentialRampToValueAtTime(.18, actx.currentTime+.01); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime+.14); o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime+.15); } catch(e){}
  }
  document.addEventListener('visibilitychange', ()=>{
    if (!scanOpen()) return;
    if (document.hidden){ if (scanActive){ resumeOnShow = true; stopCamera(); } }
    else if (resumeOnShow){ resumeOnShow = false; startCamera(); }
  });
  document.addEventListener('keydown', e=>{ if (e.key!=='Escape') return; if (sheetOpen()) closeSheet(); else if (scanOpen()) closeScanner(); });

  /* ---------------- search ---------------- */
  let viewKey = todayKey(), lastToday = todayKey();
  const srch = {q:'', state:'idle', results:[], err:null, seq:0, meal:null};
  function localMatches(q){
    q = q.toLowerCase().trim(); if (!q) return [];
    const scored = [];
    FOODS.forEach(f=>{ let best = 0; [f.name.toLowerCase(), ...f.aliases].forEach(a=>{ if (a===q) best = Math.max(best, 100); else if (a.startsWith(q)) best = Math.max(best, 80 - a.length/10); else if (a.includes(q)) best = Math.max(best, 50 - a.length/10); else if (q.split(' ').every(w=>a.includes(w))) best = Math.max(best, 30); }); if (best) scored.push([best, f]); });
    return scored.sort((a,b)=>b[0]-a[0]).slice(0,6).map(x=>x[1]);
  }
  function rowHTML(food, attr){
    const k = kcalPer100(food); const u = food.units[0];
    const right = food.src==='local' ? `${N(u.n.kcal)}<small>per ${esc(u.u)}</small>` : k!=null ? `${N(k)}<small>per 100 ${food.w||'g'}</small>` : `—<small>kcal</small>`;
    const sub = food.src==='local' ? `Common food${u.g?` · ${esc(u.u)} ≈ ${N(u.g)} ${wu(u)}`:''}` : [food.brand, food.quantity].filter(Boolean).map(esc).join(' · ') || 'Packaged food';
    return `<button class="fd-row" ${attr}>${thumb(food)}<div class="b"><b>${esc(food.name)}</b><small>${food.nutri?nsMini(food.nutri):''}${sub}</small></div><div class="k">${right}</div></button>`;
  }
  function renderSearch(){
    const box = document.getElementById('fdSRes'); if (!box) return;
    const q = srch.q.trim();
    if (!q){
      const rec = F().recent.slice(0,8);
      const popular = ['egg','banana','coffee_milk','manakish_zaatar','shawarma_chicken','hummus','falafel','rice','chicken','labneh','apple','pita'];
      box.innerHTML = `${rec.length?`<div class="fd-sub">Recent</div><div class="fd-qp">${rec.map((r,i)=>`<button class="chip" data-rec="${i}">${r.img?'🛒':esc(r.emoji||'🍽️')} ${esc(r.name.length>24?r.name.slice(0,22)+'…':r.name)}</button>`).join('')}</div>`:''}
        <div class="fd-sub">Quick add</div><div class="fd-qp">${popular.map(k=>FOOD_BY_KEY[k]).map(f=>`<button class="chip" data-lf="${f.key}">${f.emoji} ${esc(f.name.replace(/ \(.*\)/,''))}</button>`).join('')}</div>`;
      return;
    }
    const loc = localMatches(q);
    let online = '';
    if (srch.state==='loading') online = `<div class="fd-sub">Products</div><div class="fd-res"><div class="fd-shim"></div><div class="fd-shim" style="animation-delay:.15s"></div><div class="fd-shim" style="animation-delay:.3s"></div></div>`;
    else if (srch.state==='error'){ const t = errText(srch.err, 'Retry'); online = `<div class="fd-sub">Products</div><div class="fd-err"><div class="e">${srch.err&&srch.err.kind==='offline'?'📡':'⚠️'}</div><div><b>${t.t}</b><small>${t.d}</small></div><button class="btn ghost" id="fdSRetry">Retry</button></div>`; }
    else if (srch.state==='done') online = `<div class="fd-sub">Products</div>` + (srch.results.length ? `<div class="fd-res">${srch.results.map((f,i)=>rowHTML(f, `data-sr="${i}"`)).join('')}</div>` : `<div class="empty" style="padding:18px"><div class="e-ic">🥲</div>No products found for “${esc(q)}”. Try a simpler name or the brand.</div>`);
    else online = `<button class="fd-online" id="fdSGo">${I.search} Search all products for “${esc(q)}”</button>`;
    box.innerHTML = `${loc.length?`<div class="fd-sub">Common foods</div><div class="fd-res">${loc.map(f=>rowHTML(localFood(f), `data-lf="${f.key}"`)).join('')}</div>`:''}
      ${online}
      <button class="fd-online" id="fdSMan" style="margin-top:8px;color:var(--muted)">${I.pen} Add “${esc(q.length>28?q.slice(0,26)+'…':q)}” myself</button>`;
  }
  async function runSearch(q){
    q = (q||srch.q).trim(); if (!q) return;
    srch.q = q; const inp = document.getElementById('fdSIn'); if (inp && inp.value!==q) inp.value = q;
    const my = ++srch.seq; srch.state = 'loading'; srch.err = null; renderSearch();
    try { const res = await searchOFF(q); if (my!==srch.seq) return; srch.results = res; srch.state = 'done'; }
    catch(e){ if (my!==srch.seq) return; srch.err = e; srch.state = 'error'; }
    renderSearch();
  }
  function focusSearch(meal){
    srch.meal = meal || null;
    const inp = document.getElementById('fdSIn'); if (!inp) return;
    // start fresh: no old search text, results or error message
    if (srch.q || inp.value){ inp.value = ''; srch.q = ''; srch.seq++; srch.state = 'idle'; srch.results = []; srch.err = null;
      const sb = document.getElementById('fdSBtn'); if (sb) sb.style.display = 'none'; renderSearch(); }
    inp.scrollIntoView({behavior:'smooth', block:'center'}); setTimeout(()=>{ try { inp.focus({preventScroll:true}); } catch(e){} }, 300);
  }

  /* =========================================================
     AI (shared helper) — Google Gemini API, free tier.
     The key lives only on this phone (its own localStorage entry,
     kept out of Jarvis backups). Other features can reuse
     Jarvis.ai.gemini(parts, opts), e.g. for receipts later.
     ========================================================= */
  const AI_LS = 'jarvis2-ai';
  const AI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
  const AI_STUDIO = 'https://aistudio.google.com/apikey';
  // newest alias first; then the free-tier Flash models on ai.google.dev models/pricing/deprecations pages (checked 23 Nov 2026).
  // A model that is gone (404) or out of free quota (429) falls through to the next; a gone model is also forgotten if it was remembered.
  // gemini-3.1-flash-lite shuts down 7 May 2027; gemini-2.5-flash-lite only works for keys that used it before (2.5-flash removed: shut down 1 Dec 2026).
  // Not used on purpose: gemini-4-* (paid, except 4-hydrogen whose free tier lets Google train on your photos) and preview models.
  const AI_MODELS = ['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite'];
  let aiMem = null;
  function aiState(){ if (aiMem) return aiMem; try { aiMem = JSON.parse(localStorage.getItem(AI_LS) || '{}') || {}; } catch(e){ aiMem = {}; } return aiMem; }
  function aiSave(){ try { localStorage.setItem(AI_LS, JSON.stringify(aiMem || {})); } catch(e){} }
  function aiErr(kind, info){ const e = new Error('ai '+kind); e.kind = kind; if (info) Object.assign(e, info); return e; }
  const sleep = ms => new Promise(r=>setTimeout(r, ms));
  /** pull a key out of whatever was copied (a bare key, or text around it) */
  function extractKey(txt){
    const s = String(txt||'').trim().replace(/^["'`]+|["'`]+$/g,'');
    // since May 2026 AI Studio makes "auth keys" that start with "AQ." ; older keys start with "AIza"
    const m = s.match(/AQ\.[0-9A-Za-z_\-\.]{20,}/) || s.match(/AIza[0-9A-Za-z_\-]{30,}/); if (m) return m[0].replace(/\.+$/,'');
    if (/^[0-9A-Za-z_\-\.]{30,120}$/.test(s)) return s; // other key formats Google may use later
    return '';
  }
  function classifyHttp(status, data){
    const er = (data && data.error) || {};
    const msg = String(er.message || ''), st = String(er.status || '');
    const det = JSON.stringify(er.details || '');
    const all = msg+' '+st+' '+det;
    if (/API_KEY_INVALID|API key not valid|API_KEY_EXPIRED|API key expired|invalid api key/i.test(all)) return aiErr('badkey', {status, msg});
    if (/location is not supported|not supported in your (?:country|region)|unsupported (?:location|country|region)|not available in your (?:country|region)/i.test(all) || (st==='FAILED_PRECONDITION' && /location|country|region/i.test(msg))) return aiErr('region', {status, msg});
    // the account/project itself can't use the free plan (restricted project, billing needed, prepaid credit used up)
    if (status===402 || st==='FAILED_PRECONDITION' || /denied access|free tier (?:is )?(?:not available|unavailable)|enable billing|billing (?:account|is disabled)|payment (?:required|needed)/i.test(msg)) return aiErr('project', {status, msg});
    if (status===429 || st==='RESOURCE_EXHAUSTED') return aiErr('quota', {status, msg, daily:/per ?day|PerDay|daily/i.test(all)});
    if (status===404 || /models\/\S+ is not found|is not found for API version|not supported for generateContent|no longer available|unknown model|model .*not (?:found|available)/i.test(msg)) return aiErr('model', {status, msg});
    if (status===403) return aiErr(/SERVICE_DISABLED|has not been used|is disabled|API_KEY_SERVICE_BLOCKED|referer|referrer/i.test(all) ? 'denied' : 'badkey', {status, msg});
    if (status===400 && /response_?schema|responseSchema|schema|Unknown name|Invalid JSON payload/i.test(msg)) return aiErr('schema', {status, msg});
    if (status===401) return aiErr('badkey', {status, msg});
    if (status>=500) return aiErr('server', {status, msg});
    return aiErr('request', {status, msg});
  }
  function parseLoose(text){
    const s = String(text||'').trim(); if (!s) return undefined;
    try { return JSON.parse(s); } catch(e){}
    const a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a>=0 && b>a){ try { return JSON.parse(s.slice(a, b+1)); } catch(e){} }
    return undefined;
  }
  async function aiCall(model, key, parts, opts, noSchema){
    const gc = {};
    if (opts.schema || opts.json){ gc.responseMimeType = 'application/json'; if (opts.schema && !noSchema) gc.responseSchema = opts.schema; }
    // Google advises leaving temperature at its default on Gemini 3 models; older models get the low value asked for
    if (opts.temperature!=null && /^gemini-[12]\./.test(model)) gc.temperature = opts.temperature;
    if (opts.maxTokens) gc.maxOutputTokens = opts.maxTokens;
    const body = {contents:[{role:'user', parts}]};
    if (Object.keys(gc).length) body.generationConfig = gc;
    if (opts.system) body.systemInstruction = {parts:[{text:opts.system}]};
    const ac = new AbortController(); let timedOut = false;
    const tm = setTimeout(()=>{ timedOut = true; ac.abort(); }, opts.timeout || 45000);
    const onAbort = ()=>ac.abort();
    if (opts.signal){ if (opts.signal.aborted) ac.abort(); else opts.signal.addEventListener('abort', onAbort); }
    let r, data = null;
    try {
      r = await fetch(AI_BASE + model + ':generateContent', {method:'POST', headers:{'Content-Type':'application/json', 'x-goog-api-key':key}, body:JSON.stringify(body), signal:ac.signal});
      try { data = await r.json(); } catch(e){}
    } catch(e){
      if (opts.signal && opts.signal.aborted) throw aiErr('abort');
      if (timedOut) throw aiErr('timeout');
      throw aiErr(navigator.onLine===false ? 'offline' : 'network');
    } finally { clearTimeout(tm); if (opts.signal) opts.signal.removeEventListener('abort', onAbort); }
    if (!r.ok) throw classifyHttp(r.status, data);
    data = data || {};
    if (data.promptFeedback && data.promptFeedback.blockReason) throw aiErr('safety', {reason:data.promptFeedback.blockReason});
    const c = (data.candidates || [])[0];
    if (!c) throw aiErr('empty');
    const fr = String(c.finishReason || '');
    const text = ((c.content && c.content.parts) || []).filter(p=>p && !p.thought && typeof p.text==='string').map(p=>p.text).join('');
    if (/SAFETY|PROHIBITED|BLOCKLIST|SPII/.test(fr) && !text) throw aiErr('safety', {reason:fr});
    let json;
    if (opts.schema || opts.json){ json = parseLoose(text); if (json===undefined) throw aiErr(fr==='MAX_TOKENS' ? 'empty' : 'parse'); }
    return {text, json, model, finishReason:fr, usage:data.usageMetadata || null};
  }
  /** gemini(parts, opts) → {text, json, model}. parts use the REST shape: {text} or {inline_data:{mime_type, data}}.
      opts: {schema, json, temperature, system, timeout, signal, maxTokens, model, key}. Errors carry .kind:
      nokey · badkey · denied · project · quota (.daily) · region · offline · network · timeout · server · safety · model · parse · empty · abort */
  async function gemini(parts, opts={}){
    const key = opts.key || aiKey(); if (!key) throw aiErr('nokey');
    if (navigator.onLine===false) throw aiErr('offline');
    if (typeof parts==='string') parts = [{text:parts}];
    const st = aiState();
    const list = opts.model ? [opts.model] : [...new Set([st.model, ...AI_MODELS].filter(Boolean))];
    let last = null, quota = null, noSchema = false;
    for (const model of list){
      for (let attempt=0; attempt<3; attempt++){
        try {
          const res = await aiCall(model, key, parts, opts, noSchema);
          if (!opts.model && !opts.key && st.model!==model){ st.model = model; aiSave(); }
          return res;
        } catch(e){
          last = e;
          if (e.kind==='model' && st.model===model && !opts.key){ delete st.model; aiSave(); } // retired: don't try it first next time
          if (['abort','badkey','denied','project','region','offline','safety','nokey','timeout'].includes(e.kind)) throw e;
          if (e.kind==='schema' && opts.schema && !noSchema){ noSchema = true; continue; }
          if ((e.kind==='server' || e.kind==='parse') && attempt===0){ await sleep(800); continue; }
          break; // try the next model
        }
      }
      if (last && last.kind==='quota') quota = quota || last;
      if (last && last.kind==='network') throw last;
      if (opts.signal && opts.signal.aborted) throw aiErr('abort');
    }
    throw quota || last || aiErr('empty');
  }
  function aiKey(){ return String(aiState().key || ''); }
  function setAiKey(k){ const st = aiState(); st.key = String(k||'').trim(); st.savedAt = Date.now(); if (!st.key) { delete st.key; delete st.model; } aiSave(); }
  /** quick text-only check that a key works. Resolves {ok, err} */
  async function aiTest(k){
    try { await gemini([{text:'Reply with the single word: OK'}], {key:k, timeout:25000}); return {ok:true}; }
    catch(e){ if (e.kind==='empty' || e.kind==='safety' || e.kind==='parse') return {ok:true}; if (e.kind==='quota') return {ok:true, quota:true, err:e}; return {ok:false, err:e}; }
  }
  function aiErrText(e){
    const k = e && e.kind;
    const T = {
      nokey:['AI is not turned on yet', 'Add your free Google key to count calories from a photo.'],
      badkey:["That key didn't work", 'Google says the key is not valid. Copy it again from Google AI Studio (use the copy icon so you get all of it) and paste it here.'],
      denied:["This key can't use the AI", 'Make a new key in Google AI Studio with “Create API key”, then paste it here.'],
      quota: e && e.daily ? ["You've used today's free photos", "Google's free plan has a daily limit. It resets tomorrow. You can still log food by voice or barcode."] : ['Free limit reached for now', "Google's free plan allows a few photos per minute. Wait a minute, then try again."],
      project:["This account can't use free AI", "Google says this Google account can't use the free plan right now. Try making the key with a different Gmail account. Barcode and voice logging still work."],
      region:['Not available where you are', "Google's free AI isn't offered in your country right now. Barcode scanning and voice logging still work."],
      offline:["You're offline", 'Connect to Wi-Fi or mobile data and try again.'],
      network:["Couldn't reach Google", 'Check your internet connection and try again.'],
      timeout:['That took too long', 'Google took too long to answer. Please try again.'],
      server:["Google's AI is busy", 'It did not answer properly. Try again in a moment.'],
      safety:["I can't analyze that photo", "Google's AI declined this photo. Try a photo that shows just the food."],
      model:['The AI model changed', 'Google changed its free models. Try again later, or update Jarvis.'],
      parse:["I couldn't read the answer", 'The AI sent back something unexpected. Please try again.'],
      empty:['No answer from the AI', 'Please try again, maybe with a clearer photo.'],
      request:['Something went wrong', 'Google could not handle that request. Please try again.']
    };
    const v = T[k] || T.request; return {t:v[0], d:v[1]};
  }
  J.ai = Object.assign(J.ai || {}, {
    hasKey(){ return !!aiKey(); },
    key(){ return aiKey(); },
    setKey: setAiKey,
    removeKey(){ setAiKey(''); },
    gemini, test:aiTest, errorText:aiErrText, extractKey,
    setupUrl:AI_STUDIO,
    model(){ return aiState().model || AI_MODELS[0]; },
    /** open the friendly setup sheet (from any feature) */
    setup(opts){ showAiSetup(opts||{}); }
  });

  /* =========================================================
     FOOD PHOTOS — snap a plate or product, the AI counts calories
     ========================================================= */
  const AI_PROMPT = `You are a careful nutrition expert. Look at this photo so the person can log what they are about to eat.
1. If it shows a meal or plate: list each distinct food or drink separately (for example: chicken shawarma wrap, french fries, garlic sauce, side salad). Estimate each portion's weight in grams (ml for drinks) from visual cues: plate size (about 26 cm), cutlery, hands, cups, packaging.
2. If it shows a packaged product: read the brand and product name. If the nutrition facts label is readable, use the label's numbers (prefer them over estimates) and set fromLabel to true. Labels often give values per 100 g: multiply them for the portion's grams. Log one typical serving unless the photo clearly shows a whole small package being eaten; say which in "portion". Only name a brand you can actually read; never guess one.
3. The person lives in Lebanon, so Lebanese and Middle-Eastern food is common: manakish (zaatar or cheese), shawarma, shish tawook, falafel, hummus, baba ghanoush, tabbouleh, fattoush, kibbeh, mjadra, foul, fatteh, labneh, halloumi, ka'ak, lahm bi ajeen, fatayer, warak enab, knafeh, baklava, Arabic bread. Use their usual recipes (olive oil, tahini, toum garlic sauce, pickles) when estimating.
4. Include visible oil, butter, sauces, dressings and sugary drinks. grams is the edible amount (no bones, shells, peels, packaging or the plate). Calories, protein, carbs, fat and sugar are for that portion (not per 100 g), and calories should roughly equal 4×protein + 4×carbs + 9×fat.
5. confidence is 0 to 1: how sure you are about the item AND its amount. Be honest: if something is hidden, blurry or could be several things, pick the most likely one and give a lower confidence rather than leaving it out.
6. If there is no food or drink in the photo, set isFood to false, items to an empty list, and say what you see in note.
Keep names short (at most 4 words) in plain English. portion is a short everyday description like "1 wrap", "1 medium bowl", "2 pieces", "1 cup (240 ml)". title is a short name for the whole meal. note is one short friendly sentence (for example a tip or what you assumed).`;
  const AI_SCHEMA = {
    type:'OBJECT',
    properties:{
      isFood:{type:'BOOLEAN'},
      kind:{type:'STRING', enum:['plate','product','drink','snack','other']},
      title:{type:'STRING'},
      items:{type:'ARRAY', items:{type:'OBJECT', properties:{
        name:{type:'STRING'}, emoji:{type:'STRING'}, portion:{type:'STRING'},
        grams:{type:'NUMBER'}, calories:{type:'NUMBER'}, protein:{type:'NUMBER'}, carbs:{type:'NUMBER'}, fat:{type:'NUMBER'},
        sugar:{type:'NUMBER', nullable:true}, confidence:{type:'NUMBER'}, fromLabel:{type:'BOOLEAN'}, liquid:{type:'BOOLEAN'}
      }, required:['name','portion','grams','calories','protein','carbs','fat','confidence'],
      propertyOrdering:['name','emoji','portion','grams','calories','protein','carbs','fat','sugar','confidence','fromLabel','liquid']}},
      note:{type:'STRING'}
    },
    required:['isFood','title','items','note'],
    propertyOrdering:['isFood','kind','title','items','note']
  };
  const numOr = (v, d=0) => { const x = typeof v==='number' ? v : parseFloat(v); return isFinite(x) && x>=0 ? x : d; };
  const EMOJI_RE = /^(?:[\p{Extended_Pictographic}\p{Emoji_Component}\u200d\ufe0f])+$/u;
  function guessEmoji(name){
    const n = String(name||'').toLowerCase();
    const loc = localMatches(n)[0]; if (loc) return loc.emoji;
    const map = [[/fries|chips/,'🍟'],[/salad|greens|lettuce/,'🥗'],[/rice/,'🍚'],[/bread|pita|toast|bun/,'🫓'],[/chicken|tawook/,'🍗'],[/beef|meat|steak|kafta|kebab/,'🥩'],[/fish|salmon|tuna|shrimp/,'🐟'],[/egg/,'🥚'],[/cheese|halloumi/,'🧀'],[/yog|laban|labneh|milk/,'🥛'],[/sauce|toum|garlic|tahini|dip|mayo|ketchup/,'🥣'],[/soup/,'🍲'],[/pasta|spaghetti|noodle/,'🍝'],[/pizza/,'🍕'],[/burger/,'🍔'],[/wrap|sandwich|shawarma/,'🌯'],[/cake|dessert|knafeh|baklava|sweet/,'🍰'],[/fruit|apple|banana|orange|grape|berry|melon/,'🍎'],[/juice/,'🧃'],[/coffee|latte|espresso/,'☕'],[/tea/,'🍵'],[/soda|cola|drink|pepsi|coke/,'🥤'],[/water/,'💧'],[/chocolate|bar/,'🍫'],[/potato/,'🥔'],[/pickle|olive/,'🫒'],[/vegetable|tomato|cucumber|carrot/,'🥕']];
    for (const [re, e] of map) if (re.test(n)) return e;
    return '🍽️';
  }
  /** turn the model's JSON into review items (numbers checked and rounded) */
  function normalizeAI(j){
    j = j || {};
    const items = (Array.isArray(j.items) ? j.items : []).filter(x=>x && String(x.name||'').trim()).slice(0, 12).map(x=>{
      let kcal = Math.min(numOr(x.calories), 6000), p = numOr(x.protein), c = numOr(x.carbs), f = numOr(x.fat);
      if (!kcal && (p||c||f)) kcal = p*4 + c*4 + f*9;
      const g = Math.max(1, Math.min(numOr(x.grams, 0) || 100, 5000));
      const name = cap(String(x.name).trim().replace(/\s+/g,' ').slice(0, 48));
      const em = String(x.emoji||'').trim();
      const sugar = x.sugar==null ? null : numOr(x.sugar, null);
      return {id:J.uid(), name, emoji: em && em.length<=8 && EMOJI_RE.test(em) ? em : guessEmoji(name), portion:String(x.portion||'').trim().slice(0, 40) || '1 portion',
        g0:g, g, n0:{kcal, p, c, f, ...(sugar!=null ? {sugar} : {})}, conf:Math.max(0, Math.min(1, numOr(x.confidence, .6))), label:!!x.fromLabel, liquid:!!x.liquid, src:'ai'};
    }).filter(x=>x.n0.kcal>0 || x.n0.p || x.n0.c || x.n0.f || /water|tea|coffee|diet|zero/i.test(x.name));
    const isFood = j.isFood!==false && items.length>0;
    return {isFood, kind:String(j.kind||''), title:String(j.title||'').trim().slice(0, 60) || (items[0] ? items[0].name : 'Your meal'), note:String(j.note||'').trim().slice(0, 220), items};
  }
  // whole calories per item, so the rows always add up to the total shown
  const itemN = it => { const n = scaleN(it.n0, it.g/it.g0); n.kcal = Math.round(n.kcal||0); return n; };

  /* image: downscale to ~1024 px JPEG (fast and light), plus a tiny square thumbnail for the food log */
  function loadImg(file){
    return new Promise((res, rej)=>{ const url = URL.createObjectURL(file); const i = new Image(); i.onload = ()=>res({i, url}); i.onerror = ()=>{ URL.revokeObjectURL(url); rej(new Error('decode')); }; i.src = url; });
  }
  async function preparePhoto(file){
    const {i, url} = await loadImg(file);
    try {
      const W = i.naturalWidth, H = i.naturalHeight; if (!W || !H) throw new Error('empty');
      const k = Math.min(1, 1024/Math.max(W, H));
      const cv = document.createElement('canvas'); cv.width = Math.round(W*k); cv.height = Math.round(H*k);
      const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(i, 0, 0, cv.width, cv.height);
      const dataUrl = cv.toDataURL('image/jpeg', .8);
      // thumbnail from the 1024 px copy (a 12 MP photo straight to 96 px looks jagged and is slow on a phone)
      const cw = cv.width, ch = cv.height, s = Math.min(cw, ch), t = document.createElement('canvas'); t.width = t.height = 96;
      const tc = t.getContext('2d'); tc.imageSmoothingEnabled = true; tc.imageSmoothingQuality = 'high';
      tc.drawImage(cv, (cw-s)/2, (ch-s)/2, s, s, 0, 0, 96, 96);
      return {dataUrl, b64:dataUrl.slice(dataUrl.indexOf(',')+1), thumb:t.toDataURL('image/jpeg', .7), w:cv.width, h:cv.height, file};
    } finally { URL.revokeObjectURL(url); }
  }
  function savePhoto(thumb){
    const s = F(); if (!s.photos) s.photos = {};
    const id = 'p'+J.uid(); s.photos[id] = {t:thumb, at:Date.now()};
    const ks = Object.keys(s.photos); if (ks.length>30) ks.sort((a,b)=>(s.photos[a].at||0)-(s.photos[b].at||0)).slice(0, ks.length-30).forEach(k=>delete s.photos[k]);
    return id;
  }
  function photoOf(pid){ const p = pid && F().photos && F().photos[pid]; return p ? p.t : ''; }

  /* hidden file inputs live outside re-rendered areas: a <label for> opens them reliably on iPhone */
  let lastScanFile = null;
  function ensurePhotoInputs(){
    if (document.getElementById('fdPhCam')) return;
    const mk = (id, capture) => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.id = id; if (capture) i.setAttribute('capture','environment'); i.className = 'fdp-file'; i.tabIndex = -1; i.setAttribute('aria-hidden','true');
      i.addEventListener('change', ()=>{ const f = i.files && i.files[0]; i.value = ''; if (f) onPhotoFile(f); }); document.body.appendChild(i); };
    mk('fdPhCam', true); mk('fdPhGal', false);
  }
  const camLbl = (cls, inner, id='fdPhCam', extra='') => `<label for="${id}" class="${cls}" role="button" tabindex="0" ${extra}>${inner}</label>`;

  const ph = {seq:0, ac:null, img:null, res:null, items:[], meal:null, tick:null, pending:null, adding:false};
  function stopPhotoWork(){ if (ph.ac){ try { ph.ac.abort(); } catch(e){} ph.ac = null; } clearInterval(ph.tick); ph.tick = null; ph.seq++; }
  function closeCoreSheet(){ const core = document.getElementById('sheet'); if (core && core.classList.contains('open')){ const c = document.getElementById('closeSheet'); if (c) c.click(); } }

  /** the capture screen: big Take photo (a tap is needed on iPhone), From photos, barcode */
  function openPhoto(opts={}){
    closeScanner(); closeCoreSheet(); stopPhotoWork(); ensurePhotoInputs();
    const has = J.ai.hasKey();
    openSheet(`<div class="fdp-cap">
        <div class="fdp-art" aria-hidden="true"><span class="c a"></span><span class="c b"></span><span class="c c2"></span><span class="c d"></span><span class="pl">🍽️</span><span class="sp s1">✦</span><span class="sp s2">✦</span><i class="ln"></i></div>
        <h4>What are you eating?</h4>
        <p>Take a photo of your plate or a product. ${has ? 'AI will spot each food and count the calories.' : 'Products with a barcode work right away.'}</p>
        ${camLbl('fdp-big', `${I.cam}<span>Take photo</span>`)}
        <div class="fdp-two">${camLbl('fd-ghost', `${I.photo} From photos`, 'fdPhGal')}<button class="fd-ghost" data-pa="barcode">${I.scan} Scan barcode</button></div>
        ${has ? `<p class="fdp-tipline">Tip: shoot from above in good light, with the whole plate in view.</p>`
          : `<p class="fdp-tipline">For a plate, you can also just say or type what you ate.</p>`}
      </div>`, stopPhotoWork);
    wirePhotoSheet();
  }
  function wirePhotoSheet(){
    const b = sheetBody();
    b.onclick = e=>{
      const t = e.target.closest('[data-pa]'); if (!t) return;
      const a = t.dataset.pa;
      if (a==='barcode'){ closeSheet(); openScanner(); }
      else if (a==='setup') showAiSetup({});
      else if (a==='retry'){ if (ph.img) analyzePhoto(ph.img); else openPhoto(); }
      else if (a==='new') openPhoto();
      else if (a==='fixkey') showAiSetup({fix:true});
      else if (a==='cancel'){ stopPhotoWork(); openPhoto(); }
      else if (a==='manual'){ showManual({name:''}); }
    };
  }

  async function onPhotoFile(file, opts={}){
    closeScanner(); closeCoreSheet(); stopPhotoWork();
    if (file.type && !/^image\//.test(file.type)){ J.toast('Please choose a photo'); return; }
    const my = ph.seq;
    openSheet(analyzingHTML(null, 'Getting your photo ready…'), stopPhotoWork); wirePhotoSheet();
    let img;
    try { img = await preparePhoto(file); }
    catch(e){ if (my!==ph.seq) return; return showPhotoError({t:"I couldn't open that photo", d:'Please take a new photo, or pick a JPG or PNG from your photos.'}, {noRetry:true}); }
    if (my!==ph.seq || !sheetOpen()) return;
    ph.img = img;
    if (J.ai.hasKey() && !opts.barcodeOnly) return analyzePhoto(img);
    // no AI key: a product photo may still have a barcode we can read on the phone
    openSheet(analyzingHTML(img, 'Looking for a barcode…', true), stopPhotoWork); wirePhotoSheet();
    let code = null;
    if (!opts.skipBarcode){ try { code = await decodeFile(file); } catch(e){} }
    if (my!==ph.seq || !sheetOpen()) return;
    if (code){ beep(); handleScanResult(code); return; }
    ph.pending = img;
    showNoBarcode(img);
  }

  /* no AI on this phone and no barcode: never send customers to a key screen; offer search, typing or voice */
  function showNoBarcode(img){
    const body = openSheet(`
      <div class="fdp-hd" style="margin-right:44px"><h4>No barcode in that photo</h4></div>
      ${img ? `<div class="fdp-pend"><img src="${img.dataUrl}" alt=""><span>For a plate of food, just tell me what's on it.</span></div>` : ''}
      <p class="fdp-lede">Search it, type it, or tap the mic on Home and say something like “I had fries and a steak”.</p>
      <div class="fdp-addf"><div class="search">${I.search}<input id="fdnbQ" placeholder="Search food, e.g. hummus" autocomplete="off" enterkeyhint="search" aria-label="Search food"></div></div>
      <button class="fd-cta fdp-wide" id="fdnbType" style="margin-top:10px">Type it myself</button>
      <button class="fd-ghost fdp-wide" id="fdnbScan" style="margin-top:10px">Scan a barcode instead</button>`, ()=>{ stopPhotoWork(); });
    const $ = s => body.querySelector(s);
    const goSearch = ()=>{ const v = $('#fdnbQ').value.trim(); ph.pending = null; closeSheet(); if (J.current!=='food') J.go('food');
      setTimeout(()=>{ const i = document.getElementById('fdSIn'); if (!i) return; i.value = v; i.dispatchEvent(new Event('input')); if (v){ const b = document.getElementById('fdSBtn'); b && b.click(); } try { i.focus(); } catch(e){} }, 80); };
    $('#fdnbQ').onkeydown = e=>{ if (e.key==='Enter') goSearch(); };
    $('#fdnbType').onclick = ()=>{ ph.pending = null; closeSheet(); showManual({}); };
    $('#fdnbScan').onclick = ()=>{ ph.pending = null; closeSheet(); openScanner(); };
  }

  const STEPS = ['Looking at your food…', 'Spotting each item…', 'Estimating portions…', 'Counting calories…', 'Checking the numbers…'];
  function analyzingHTML(img, msg, barcode){
    return `<div class="fdp-hd"><h4>${barcode ? 'Reading your photo' : 'Analyzing your food'}</h4><small>${barcode ? 'Checking for a product barcode' : 'Usually takes 3 to 10 seconds'}</small></div>
      <div class="fdp-frame ${img?'':'empty'}">${img ? `<img src="${img.dataUrl}" alt="Your photo">` : ''}<div class="fdp-shine"></div><i class="fdp-scanl"></i>
        <span class="c a"></span><span class="c b"></span><span class="c c2"></span><span class="c d"></span>
        <div class="fdp-pill"><span class="fdp-dot"></span><span id="fdpMsg">${esc(msg||STEPS[0])}</span></div></div>
      <div class="fdp-skel"><div class="fd-sk" style="height:58px"></div><div class="fd-sk" style="height:58px;animation-delay:.15s"></div><div class="fd-sk" style="height:58px;animation-delay:.3s"></div></div>
      <button class="fd-ghost fdp-wide" data-pa="cancel">Cancel</button>`;
  }
  async function analyzePhoto(img){
    stopPhotoWork(); ensurePhotoInputs();
    const my = ph.seq; ph.ac = new AbortController();
    openSheet(analyzingHTML(img), stopPhotoWork); wirePhotoSheet();
    let n = 0; const t0 = Date.now();
    ph.tick = setInterval(()=>{ const el = document.getElementById('fdpMsg'); if (!el) return; n++; el.textContent = Date.now()-t0 > 16000 ? 'Still working… big plates take a little longer' : STEPS[Math.min(n, STEPS.length-1)]; }, 1700);
    try {
      const r = await gemini([{text:AI_PROMPT}, {inline_data:{mime_type:'image/jpeg', data:img.b64}}], {schema:AI_SCHEMA, temperature:.2, timeout:60000, signal:ph.ac.signal});
      if (my!==ph.seq) return;
      clearInterval(ph.tick); ph.tick = null; ph.ac = null;
      const res = normalizeAI(r.json);
      if (!res.isFood) return showNotFood(res);
      ph.res = res; ph.items = res.items; ph.meal = defaultMeal();
      try { navigator.vibrate && navigator.vibrate(30); } catch(e){}
      showReview();
    } catch(e){
      if (my!==ph.seq || e.kind==='abort') return;
      clearInterval(ph.tick); ph.tick = null; ph.ac = null;
      if (e.kind==='nokey'){ ph.pending = img; return showNoBarcode(img); }
      showPhotoError(aiErrText(e), {kind:e.kind});
    }
  }
  function showPhotoError(t, o={}){
    const icon = {offline:'📡', network:'📡', quota:'⏳', badkey:'🔑', denied:'🔑', project:'🔑', region:'🌍', safety:'🙈', timeout:'🐢'}[o.kind] || '⚠️';
    const keyIssue = o.kind==='badkey' || o.kind==='denied' || o.kind==='project';
    openSheet(`<div class="fd-center fdp-err">${ph.img && !o.noRetry ? `<div class="fdp-mini"><img src="${ph.img.dataUrl}" alt=""></div>` : `<div class="big">${icon}</div>`}
      <h4>${esc(t.t)}</h4><p>${esc(t.d)}</p>
      <div class="fd-stack">
        ${keyIssue ? `<button class="fd-cta" data-pa="fixkey">Fix my key</button>` : o.noRetry ? '' : `<button class="fd-cta" data-pa="retry">Try again</button>`}
        ${camLbl('fd-ghost', `${I.cam} Take a new photo`)}
        ${o.kind==='region' || o.kind==='quota' || o.kind==='project' ? `<button class="fd-ghost" data-pa="barcode">${I.scan} Scan a barcode instead</button>` : ''}
        <button class="fd-ghost" data-pa="manual">${I.pen} Type it in</button>
      </div></div>`, stopPhotoWork);
    wirePhotoSheet();
  }
  function showNotFood(res){
    openSheet(`<div class="fd-center fdp-err">${ph.img ? `<div class="fdp-mini"><img src="${ph.img.dataUrl}" alt=""></div>` : ''}
      <h4>I don't see any food here</h4><p>${esc(res.note || 'Try a photo that shows your plate or the product clearly.')}</p>
      <div class="fd-stack">${camLbl('fd-cta', `Take another photo`)}<button class="fd-ghost" data-pa="barcode">${I.scan} Scan a barcode</button></div></div>`, stopPhotoWork);
    wirePhotoSheet();
  }

  /* ---- review: edit portions, remove/add items, pick the meal, log it ---- */
  function gStep(g){ return g<40 ? 5 : g<150 ? 10 : g<400 ? 25 : 50; }
  function photoTotals(){ return ph.items.reduce((a, it)=>{ const n = itemN(it); a.kcal+=n.kcal||0; a.p+=n.p||0; a.c+=n.c||0; a.f+=n.f||0; return a; }, {kcal:0,p:0,c:0,f:0}); }
  function itemRowHTML(it){
    const n = itemN(it), u = it.liquid ? 'ml' : 'g', adj = Math.round(it.g)!==Math.round(it.g0);
    return `<div class="fdp-it" data-id="${it.id}">
      <div class="fdp-r1"><div class="fdp-em">${esc(it.emoji)}</div>
        <div class="b"><b>${esc(it.name)}${it.conf<.5 ? '<em class="fdp-chk">check</em>' : ''}${it.label ? '<em class="fdp-lbl">label</em>' : ''}</b><small>${esc(it.portion)}${adj ? ` · <span class="fdp-adj">adjusted</span>` : ''}</small></div>
        <div class="fdp-k"><b>${N(n.kcal)}</b><small>kcal</small></div></div>
      <div class="fdp-r2"><div class="fdp-st"><button data-st="-1" aria-label="Less ${esc(it.name)}">${I.minus}</button><span>${N(it.g)} ${u}</span><button data-st="1" aria-label="More ${esc(it.name)}">${I.plus}</button></div>
        <span class="fdp-mac">P ${g1(n.p)} · C ${g1(n.c)} · F ${g1(n.f)}</span>
        <button class="fdp-rm" data-rm aria-label="Remove ${esc(it.name)}">${I.close}</button></div></div>`;
  }
  function showReview(){
    const res = ph.res, img = ph.img;
    const fromLabel = ph.items.some(x=>x.label);
    const conf = ph.items.length ? ph.items.reduce((a,x)=>a+x.conf, 0)/ph.items.length : 0;
    const body = openSheet(`
      <div class="fdp-hd"><h4>Here's what I see</h4><small>AI estimate · tap − or + to fix any portion</small></div>
      <div class="fdp-banner">${img ? `<img src="${img.dataUrl}" alt="Your photo">` : ''}<div class="fdp-bov"><span class="fdp-chip">${fromLabel ? '🏷️ Read from the label' : '✨ AI estimate'}</span><b>${esc(res.title)}</b></div></div>
      <div class="fdp-tot" id="fdpTot"></div>
      ${res.note ? `<p class="fdp-note">💬 ${esc(res.note)}</p>` : ''}
      <div class="fd-lbl" style="display:flex;justify-content:space-between"><span>Items</span><span id="fdpCnt" style="text-transform:none;letter-spacing:0"></span></div>
      <div class="fdp-list" id="fdpList"></div>
      <div id="fdpAddBox"></div>
      <button class="fd-online fdp-addbtn" id="fdpAdd">${I.plus} Add something I missed</button>
      <div class="fdp-hint">${fromLabel ? 'Label numbers are exact for the serving shown. ' : ''}Estimates from a photo can be off by 20–30%. ${conf<.55 ? 'Some items are hard to see, so check them. ' : ''}Adjust portions if they look wrong.</div>
      <div class="fd-lbl">Meal</div>
      <div class="seg fd-seg" id="fdpMeal">${MEALS.map(m=>`<button data-m="${m.id}">${m.id==='snack'?'Snack':m.label}</button>`).join('')}</div>
      <button class="fd-cta" id="fdpLog" style="margin-top:14px"></button>
      <div class="fd-row2">${camLbl('fd-ghost', `${I.cam} Retake`)}<button class="fd-ghost" data-pa="cancelreview">Cancel</button></div>
      <p class="fd-note" style="margin-top:12px">Counted by Google Gemini AI from your photo.</p>`, stopPhotoWork);
    const $ = s => body.querySelector(s);
    const list = $('#fdpList');
    function paintList(){ list.innerHTML = ph.items.length ? ph.items.map(itemRowHTML).join('') : `<div class="empty" style="padding:18px"><div class="e-ic">🍽️</div>No items left. Add one below or retake the photo.</div>`; paintTotals(); }
    function paintTotals(){
      const t = photoTotals();
      const pct = t.p*4 + t.c*4 + t.f*9 || 1;
      $('#fdpTot').innerHTML = `<div class="fdp-tk"><small>Total</small><b>${N(t.kcal)}<span>kcal</span></b></div>
        <div class="fdp-tm">${MACROS.map(m=>{ const v = t[m.k]; return `<div><span><i style="background:${m.color}"></i>${m.label}</span><b>${N(v)} g</b><u><s style="width:${Math.round(v*m.per/pct*100)}%;background:${m.color}"></s></u></div>`; }).join('')}</div>`;
      $('#fdpCnt').textContent = `${ph.items.length} item${ph.items.length===1?'':'s'}`;
      const left = F().goal - dayTotals(todayKey()).kcal - t.kcal;
      $('#fdpLog').innerHTML = ph.adding ? 'Adding…' : `Add to today · ${N(t.kcal)} kcal<small>${left>=0 ? `${N(left)} kcal left after this` : `${N(-left)} kcal over your goal after this`}</small>`;
      $('#fdpLog').disabled = !ph.items.length;
    }
    function paintMeal(){ body.querySelectorAll('#fdpMeal button').forEach(b=>b.classList.toggle('active', b.dataset.m===ph.meal)); }
    list.onclick = e=>{
      const row = e.target.closest('.fdp-it'); if (!row) return;
      const it = ph.items.find(x=>x.id===row.dataset.id); if (!it) return;
      const st = e.target.closest('[data-st]');
      if (st){
        const dir = +st.dataset.st, s = gStep(it.g);
        it.g = dir>0 ? Math.min(5000, Math.floor(it.g/s)*s + s) : Math.max(s===5?5:s, Math.ceil(it.g/s)*s - s);
        if (it.g<=0) it.g = 5;
        row.outerHTML = itemRowHTML(it); paintTotals(); return;
      }
      if (e.target.closest('[data-rm]')){
        const i = ph.items.indexOf(it); ph.items.splice(i, 1); paintList();
        J.toast(`Removed ${it.name}`, ()=>{ ph.items.splice(Math.min(i, ph.items.length), 0, it); if (sheetOpen() && document.getElementById('fdpList')) paintList(); });
      }
    };
    body.querySelectorAll('#fdpMeal button').forEach(b=>b.onclick = ()=>{ ph.meal = b.dataset.m; paintMeal(); });
    $('#fdpAdd').onclick = ()=>{
      const box = $('#fdpAddBox');
      if (box.innerHTML){ box.innerHTML = ''; return; }
      box.innerHTML = `<div class="fdp-addf"><div class="search">${I.search}<input id="fdpQ" placeholder="Search common foods, e.g. hummus" autocomplete="off" enterkeyhint="search" aria-label="Search common foods"></div><div class="fd-res" id="fdpQR"></div></div>`;
      const q = box.querySelector('#fdpQ'), rr = box.querySelector('#fdpQR');
      const paint = ()=>{ const v = q.value.trim(); const res = v ? localMatches(v) : ['pita','hummus','fries','salad','rice','cola','labneh','garlic'].map(k=>FOOD_BY_KEY[k]).filter(Boolean);
        rr.innerHTML = res.length ? res.slice(0,6).map(f=>`<button class="fd-row" data-lk="${f.key}">${thumb({emoji:f.emoji})}<div class="b"><b>${esc(f.name)}</b><small>1 ${esc(f.unit)} · ${N(f.g)} ${LIQ.has(f.key)?'ml':'g'}</small></div><div class="k">${N(f.n.kcal)}<small>kcal</small></div></button>`).join('') : `<div style="color:var(--muted);font-size:13px;padding:6px 4px">Not in my list. You can add it after logging with “Add myself”.</div>`; };
      q.oninput = paint; paint();
      rr.onclick = e=>{ const b = e.target.closest('[data-lk]'); if (!b) return; const f = FOOD_BY_KEY[b.dataset.lk]; if (!f) return;
        ph.items.push({id:J.uid(), name:f.name, emoji:f.emoji, portion:`1 ${f.unit}`, g0:f.g, g:f.g, n0:{...f.n}, conf:1, label:false, liquid:LIQ.has(f.key), src:'local', lkey:f.key});
        box.innerHTML = ''; paintList(); J.toast(`Added ${f.name}`); };
      setTimeout(()=>{ try { q.focus(); } catch(e){} }, 60);
    };
    body.onclick = e=>{ const t = e.target.closest('[data-pa]'); if (t && t.dataset.pa==='cancelreview') closeSheet(); };
    $('#fdpLog').onclick = logPhotoItems;
    paintList(); paintMeal();
  }
  function logPhotoItems(){
    if (!ph.items.length || ph.adding) return;
    const key = todayKey(), meal = ph.meal || defaultMeal();
    const pid = ph.img && ph.img.thumb ? savePhoto(ph.img.thumb) : '';
    const added = [];
    ph.items.forEach(it=>{
      const n = itemN(it), w = it.liquid ? 'ml' : 'g', g = Math.round(it.g);
      const food = {src:'ai-photo', key:'a:'+it.name.toLowerCase(), name:it.name, emoji:it.emoji, w,
        units:[{u:'portion', g, w, n}, {u:'g', g:1, w, n:scaleN(n, 1/Math.max(1, g))}], per100:scaleN(n, 100/Math.max(1, g))};
      const e = addEntry(food, 0, 1, meal, key);
      e.source = 'ai-photo'; e.pid = pid; e.portion = it.portion; e.conf = Math.round(it.conf*100)/100;
      added.push(e);
    });
    J.save();
    const tot = added.reduce((a,e)=>a+ntot(e).kcal, 0);
    const res = ph.res; ph.img = null; ph.items = []; ph.res = null; ph.pending = null;
    closeSheet(); viewKey = key; srch.meal = null;
    if (J.current!=='food') J.go('food');
    J.renderAll();
    const lf = F().goal - dayTotals(key).kcal;
    J.toast(`Added ${N(tot)} kcal · ${lf>=0 ? N(lf)+' left' : N(-lf)+' over'}`, ()=>{ added.forEach(e=>removeEntry(key, e.id)); });
  }

  /* ---- setup: get a free Google key, paste it, test it ---- */
  function showAiSetup(o={}){
    stopPhotoWork(); ensurePhotoInputs();
    const has = J.ai.hasKey();
    const intro = o.reason==='plate'
      ? `I didn't find a barcode in that photo. To count calories on a plate, Jarvis uses Google's free AI. Set it up once, about 2 minutes, no credit card.`
      : `Jarvis uses Google's free Gemini AI to count calories from a photo. You just need a free key: about 2 minutes, no credit card.`;
    const body = openSheet(`
      <div class="fdp-hd" style="margin-right:44px"><h4>Turn on AI food photos <span class="tag fdp-free">FREE</span></h4></div>
      ${o.reason==='plate' && ph.pending ? `<div class="fdp-pend"><img src="${ph.pending.dataUrl}" alt=""><span>Your photo is saved. I'll analyze it as soon as AI is on.</span></div>` : ''}
      <p class="fdp-lede">${esc(intro)}</p>
      <ol class="fdp-steps">
        <li><i>1</i><div><b>Open Google AI Studio</b><small>Tap the button below and sign in with your Google (Gmail) account.</small></div></li>
        <li><i>2</i><div><b>Tap “Create API key”</b><small>If it asks for a project, pick any one or create one. Any name is fine.</small></div></li>
        <li><i>3</i><div><b>Copy the key</b><small>Tap the copy icon next to your new key. It looks like a long jumble of letters (often starting with “AQ.”).</small></div></li>
        <li><i>4</i><div><b>Come back and tap “Paste key”</b><small>If your iPhone asks, tap Paste. Jarvis checks the key for you.</small></div></li>
      </ol>
      <a class="fd-ghost fdp-wide" href="${AI_STUDIO}" target="_blank" rel="noopener noreferrer" id="fdpStudio">↗︎ Open Google AI Studio</a>
      <button class="fd-cta fdp-wide" id="fdpPaste" style="margin-top:10px">📋 Paste key</button>
      <div class="fdp-box" id="fdpBox" ${o.fix ? '' : 'hidden'}>
        <label class="fd-field" style="margin:12px 0 8px"><span>Or paste it here (press and hold, then Paste)</span><input id="fdpKeyIn" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="AQ.…" inputmode="text"></label>
        <button class="fd-ghost fdp-wide" id="fdpTest">Test key</button>
      </div>
      <button class="fdp-link" id="fdpShowBox" ${o.fix ? 'hidden' : ''}>Paste didn't work? Type or paste it in a box</button>
      <div id="fdpStat" class="fdp-stat" aria-live="polite"></div>
      ${has ? `<div class="fdp-have">✅ AI is already on with key ••••${esc(aiKey().slice(-4))}. Pasting a new key replaces it.</div>` : ''}
      <p class="fdp-priv">🔒 Your key is saved only on this phone. On Google's free plan, Google may use your photos to improve its AI, so don't snap anything private.</p>`, ()=>{ stopPhotoWork(); });
    const $ = s => body.querySelector(s);
    const stat = $('#fdpStat'), box = $('#fdpBox'), inp = $('#fdpKeyIn');
    const showBox = (msg)=>{ box.hidden = false; $('#fdpShowBox').hidden = true; if (msg) say('info', msg); setTimeout(()=>{ try { inp.focus(); } catch(e){} }, 60); };
    function say(kind, html){ stat.className = 'fdp-stat '+kind; stat.innerHTML = html; }
    let busy = false;
    async function tryKey(k){
      if (busy) return; busy = true;
      say('busy', `<span class="fdp-spin"></span> Checking your key with Google…`);
      $('#fdpPaste').disabled = true;
      const r = await aiTest(k);
      busy = false; $('#fdpPaste').disabled = false;
      if (!body.isConnected || !sheetOpen()) return;
      if (r.ok){
        setAiKey(k); J.renderAll();
        const pend = ph.pending;
        say('ok', `<b>🎉 AI is on!</b> ${r.quota ? 'Your key works. Google says the free limit is used up for a moment, so wait a minute before your first photo.' : pend ? 'Analyzing your photo now…' : 'Now snap your food and I will count the calories.'}`);
        if (pend && !r.quota){ ph.pending = null; setTimeout(()=>{ if (sheetOpen()) analyzePhoto(pend); }, 900); }
        else {
          const done = document.createElement('div'); done.className = 'fd-stack'; done.style.marginTop = '12px';
          done.innerHTML = pend ? `<button class="fd-cta" data-pa="retry2">Analyze my photo</button>` : camLbl('fd-cta', `${I.cam} Snap your food`);
          stat.after(done);
          const r2 = done.querySelector('[data-pa=retry2]'); if (r2) r2.onclick = ()=>{ ph.pending = null; analyzePhoto(pend); };
        }
        return;
      }
      const t = aiErrText(r.err);
      const extra = r.err && (r.err.kind==='badkey' || r.err.kind==='denied') ? ' Make sure you copied the whole key.' : '';
      say('bad', `<b>${esc(t.t)}</b> ${esc(t.d + extra)}`);
      if (r.err && (r.err.kind==='badkey' || r.err.kind==='denied' || r.err.kind==='project')) showBox();
    }
    $('#fdpPaste').onclick = async ()=>{
      let txt = '';
      try {
        if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error('no clipboard');
        txt = await navigator.clipboard.readText();
      } catch(e){ return showBox("Your phone didn't let me read the clipboard. Press and hold in the box below and tap Paste."); }
      const k = extractKey(txt);
      if (!k){ say('bad', `<b>No key found in what you copied.</b> In Google AI Studio, tap the copy icon next to your key, then come back and tap Paste key.`); return; }
      inp.value = k; tryKey(k);
    };
    $('#fdpShowBox').onclick = ()=>showBox();
    $('#fdpTest').onclick = ()=>{ const k = extractKey(inp.value); if (!k){ say('bad', `<b>That doesn't look like a key.</b> It's a long code of letters and numbers (often starting with “AQ.” or “AIza”). Use the copy icon in Google AI Studio.`); return; } tryKey(k); };
    // a paste checks the key right away; typing waits for "Test key"
    let lastLen = 0;
    inp.oninput = e=>{ const v = inp.value, jump = v.length - lastLen; lastLen = v.length;
      if (!(e && /paste/i.test(e.inputType||'')) && jump<20) return;
      const k = extractKey(v); if (k && (/^AQ\./.test(k) ? k.length>=30 : /^AIza/.test(k) && k.length>=39)) tryKey(k); };
    inp.onkeydown = e=>{ if (e.key==='Enter') $('#fdpTest').click(); };
  }

  /* ---- the "AI food photos" card in the Food screen ---- */
  function aiCardHTML(){
    const has = J.ai.hasKey();
    return has
      ? `<div class="fdp-set"><div class="ic on">✨</div><div class="b"><b>AI food photos are on</b><small>Google Gemini, free plan · key ••••${esc(aiKey().slice(-4))} saved on this phone only</small></div></div>
         <div class="fdp-setb"><button class="btn ghost" data-ai="test">Test key</button><button class="btn ghost" data-ai="change">Change key</button><button class="btn ghost" data-ai="remove" style="color:var(--bad-ink)">Remove key</button></div>
         <div class="fdp-setmsg" id="fdpSetMsg"></div>`
      : `<div class="fdp-set"><div class="ic">✨</div><div class="b"><b>AI food photos are off</b><small>Turn on Google's free AI to count calories from a photo of any plate. No credit card.</small></div></div>
         <button class="fd-cta" data-ai="setup" style="margin-top:12px">Turn on (free)</button>`;
  }
  async function aiCardClick(b){
    const a = b.dataset.ai;
    if (a==='setup' || a==='change') return showAiSetup({});
    if (a==='remove'){ const old = aiKey(); setAiKey(''); J.renderAll(); J.toast('AI key removed from this phone', ()=>{ setAiKey(old); J.renderAll(); }); return; }
    if (a==='test'){
      const m = document.getElementById('fdpSetMsg'); if (m){ m.className = 'fdp-setmsg busy'; m.innerHTML = '<span class="fdp-spin"></span> Checking with Google…'; }
      const r = await aiTest(aiKey()); const m2 = document.getElementById('fdpSetMsg'); if (!m2) return;
      if (r.ok){ m2.className = 'fdp-setmsg ok'; m2.textContent = r.quota ? '✅ Key works. The free limit is used up for now, so wait a minute.' : '✅ Your key works.'; }
      else { const t = aiErrText(r.err); m2.className = 'fdp-setmsg bad'; m2.textContent = t.t+'. '+t.d; }
    }
  }

  J.css(`
  .fdp-file{position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0}
  .fd-th.ph img{object-fit:cover;background:none}
  .fd-th:has(.fdp-badge){overflow:visible}
  .fd-th .fdp-badge{position:absolute;right:-4px;bottom:-4px;width:20px;height:20px;border-radius:7px;object-fit:cover;border:2px solid var(--card-solid);box-shadow:0 2px 6px rgba(0,0,0,.25)}
  .fdp-hero{margin-top:14px}
  .fdp-snap{position:relative;overflow:hidden;display:flex;align-items:center;gap:14px;border-radius:22px;padding:16px 16px;cursor:pointer;color:#fff;background:linear-gradient(135deg,var(--accent) 0%,#0ea5e9 100%);box-shadow:0 14px 30px rgba(79,70,229,.32);transition:transform .15s var(--ease);-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
  .fdp-snap:active{transform:scale(.98)}
  .fdp-snap::after{content:"";position:absolute;inset:0;background:radial-gradient(260px 120px at 85% -20%,rgba(255,255,255,.28),transparent 70%);pointer-events:none}
  .fdp-snap .ic{width:52px;height:52px;border-radius:16px;background:rgba(255,255,255,.2);display:grid;place-items:center;flex:none;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
  .fdp-snap .ic svg{width:28px;height:28px}
  .fdp-snap .t{flex:1;min-width:0;line-height:1.25}
  .fdp-snap .t b{display:block;font-size:18px;font-weight:800;letter-spacing:-.3px}
  .fdp-snap .t small{display:block;font-size:13px;opacity:.88;font-weight:600;margin-top:2px}
  .fdp-snap .go{width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.18);display:grid;place-items:center;flex:none}
  .fdp-snap .go svg{width:16px;height:16px}
  .fdp-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
  .fdp-row .fd-ghost{padding:12px 6px;font-size:13.5px;flex-direction:column;gap:5px;border-radius:16px;min-height:66px}
  .fdp-row .fd-ghost svg{width:20px;height:20px;color:var(--accent-ink)}
  label.fd-ghost{user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
  .fdp-wide{width:100%;text-decoration:none;box-sizing:border-box}
  .fdp-hd{margin:4px 44px 12px 0}
  .fdp-hd h4{margin:0;font-size:19px;font-weight:800;letter-spacing:-.3px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .fdp-hd small{display:block;color:var(--muted);font-size:13px;margin-top:3px}
  .fdp-free{background:rgba(34,197,94,.16);color:var(--good-ink);letter-spacing:.06em}
  /* capture */
  .fdp-cap{text-align:center;padding:6px 2px 2px}
  .fdp-cap h4{margin:6px 0 6px;font-size:21px;font-weight:800;letter-spacing:-.4px}
  .fdp-cap>p{margin:0 auto 18px;color:var(--muted);font-size:14.5px;max-width:330px}
  .fdp-art{position:relative;width:150px;height:150px;margin:6px auto 8px;border-radius:36px;background:radial-gradient(circle at 50% 45%,var(--accent-soft),transparent 70%)}
  .fdp-art .pl{position:absolute;inset:0;display:grid;place-items:center;font-size:64px;filter:drop-shadow(0 8px 16px rgba(0,0,0,.25))}
  .fdp-art .c,.fdp-frame .c{position:absolute;width:26px;height:26px;border:3.5px solid var(--accent);border-radius:4px}
  .fdp-art .c.a,.fdp-frame .c.a{left:8px;top:8px;border-right:0;border-bottom:0;border-top-left-radius:14px}
  .fdp-art .c.b,.fdp-frame .c.b{right:8px;top:8px;border-left:0;border-bottom:0;border-top-right-radius:14px}
  .fdp-art .c.c2,.fdp-frame .c.c2{left:8px;bottom:8px;border-right:0;border-top:0;border-bottom-left-radius:14px}
  .fdp-art .c.d,.fdp-frame .c.d{right:8px;bottom:8px;border-left:0;border-top:0;border-bottom-right-radius:14px}
  .fdp-art .ln{position:absolute;left:18px;right:18px;height:2px;top:20%;border-radius:2px;background:linear-gradient(90deg,transparent,var(--accent2),transparent);box-shadow:0 0 12px 2px var(--accent2);animation:fdpLine 2.2s ease-in-out infinite alternate;opacity:.9}
  .fdp-art .sp{position:absolute;color:var(--accent2);font-size:16px;animation:fdpTw 1.8s ease-in-out infinite}
  .fdp-art .s1{right:22px;top:26px}.fdp-art .s2{left:24px;bottom:30px;animation-delay:.9s;font-size:12px}
  @keyframes fdpLine{to{top:78%}}
  @keyframes fdpTw{50%{opacity:.25;transform:scale(.7)}}
  .fdp-big{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;border-radius:20px;padding:18px;font-size:18px;font-weight:800;color:#fff;cursor:pointer;background:linear-gradient(135deg,var(--accent),#0ea5e9);box-shadow:0 14px 34px rgba(79,70,229,.42);animation:fdPulse 2.2s ease-in-out infinite;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
  .fdp-big svg{width:26px;height:26px}
  .fdp-big:active{transform:scale(.98)}
  .fdp-two{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
  .fdp-two .fd-ghost{font-size:14px;padding:13px 8px}
  .fdp-tipline{font-size:12.5px;color:var(--faint-ink);margin:14px 6px 2px}
  .fdp-aioff{display:flex;align-items:center;gap:12px;width:100%;margin-top:14px;padding:13px 14px;border-radius:16px;border:1px dashed var(--accent);border:1px dashed color-mix(in srgb,var(--accent) 55%,transparent);background:var(--accent-soft);color:var(--text);cursor:pointer;text-align:left}
  .fdp-aioff .sp{font-size:22px}
  .fdp-aioff span:nth-child(2){flex:1}
  .fdp-aioff b{display:block;font-size:14.5px}
  .fdp-aioff small{display:block;color:var(--muted);font-size:12.5px;margin-top:1px}
  .fdp-aioff svg{width:18px;height:18px;color:var(--accent-ink)}
  /* analyzing */
  .fdp-frame{position:relative;border-radius:22px;overflow:hidden;aspect-ratio:4/3;max-height:44vh;width:100%;background:#0b0e1a;box-shadow:0 14px 34px rgba(0,0,0,.28)}
  .fdp-frame.empty{background:linear-gradient(135deg,#1b1f3a,#0b0e1a)}
  .fdp-frame img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;animation:fdpZoom 6s ease-in-out infinite alternate}
  @keyframes fdpZoom{to{transform:scale(1.06)}}
  .fdp-frame .c{border-color:#fff;z-index:3;width:30px;height:30px;filter:drop-shadow(0 1px 4px rgba(0,0,0,.5))}
  .fdp-frame .c.a,.fdp-frame .c.b{top:12px}.fdp-frame .c.c2,.fdp-frame .c.d{bottom:12px}
  .fdp-frame .c.a,.fdp-frame .c.c2{left:12px}.fdp-frame .c.b,.fdp-frame .c.d{right:12px}
  .fdp-shine{position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.16) 45%,transparent 60%);background-size:250% 100%;animation:fdpShine 2s linear infinite;z-index:1}
  @keyframes fdpShine{from{background-position:150% 0}to{background-position:-100% 0}}
  .fdp-scanl{position:absolute;left:0;right:0;height:38%;top:-38%;z-index:2;background:linear-gradient(180deg,transparent,rgba(34,211,238,.10) 70%,rgba(34,211,238,.55) 98%,#fff 100%);border-bottom:2px solid #67e8f9;box-shadow:0 8px 22px rgba(34,211,238,.55);animation:fdpScan 2.1s cubic-bezier(.45,.05,.55,.95) infinite}
  @keyframes fdpScan{to{top:100%}}
  .fdp-pill{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:4;display:flex;align-items:center;gap:8px;padding:9px 14px;border-radius:999px;background:rgba(10,12,24,.62);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#fff;font-size:13.5px;font-weight:700;white-space:nowrap;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis;border:1px solid rgba(255,255,255,.14)}
  .fdp-dot{width:8px;height:8px;border-radius:50%;background:#22d3ee;box-shadow:0 0 0 0 rgba(34,211,238,.7);animation:fdpDot 1.2s infinite;flex:none}
  @keyframes fdpDot{70%{box-shadow:0 0 0 8px rgba(34,211,238,0)}100%{box-shadow:0 0 0 0 rgba(34,211,238,0)}}
  .fdp-skel{display:flex;flex-direction:column;gap:8px;margin:14px 0}
  /* review */
  .fdp-banner{position:relative;border-radius:20px;overflow:hidden;height:170px;background:var(--card);border:1px solid var(--line)}
  .fdp-banner img{width:100%;height:100%;object-fit:cover;display:block}
  .fdp-bov{position:absolute;left:0;right:0;bottom:0;padding:34px 14px 12px;background:linear-gradient(180deg,transparent,rgba(0,0,0,.72));color:#fff}
  .fdp-bov b{display:block;font-size:19px;font-weight:800;letter-spacing:-.3px;text-shadow:0 1px 8px rgba(0,0,0,.5);line-height:1.2}
  .fdp-chip{display:inline-block;font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:999px;background:rgba(255,255,255,.2);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);margin-bottom:6px}
  .fdp-tot{display:flex;gap:14px;align-items:center;margin-top:12px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px}
  .fdp-tk small{display:block;color:var(--muted);font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em}
  .fdp-tk b{font-size:32px;font-weight:800;letter-spacing:-1px;line-height:1.05}
  .fdp-tk b span{font-size:13px;color:var(--muted);font-weight:700;margin-left:3px;letter-spacing:0}
  .fdp-tm{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
  .fdp-tm div{display:grid;grid-template-columns:1fr auto;align-items:center;gap:2px 8px;font-size:12.5px}
  .fdp-tm span{color:var(--muted);font-weight:600;display:flex;align-items:center;gap:6px}
  .fdp-tm span i{width:8px;height:8px;border-radius:50%}
  .fdp-tm b{font-size:13px}
  .fdp-tm u{grid-column:1/-1;height:4px;border-radius:9px;background:var(--line);overflow:hidden;display:block}
  .fdp-tm u s{display:block;height:100%;border-radius:9px;transition:width .4s var(--ease)}
  .fdp-note{font-size:13px;color:var(--muted);margin:10px 2px 0;line-height:1.45}
  .fdp-list{display:flex;flex-direction:column;gap:8px}
  .fdp-it{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:10px 12px;animation:fadeUp .25s var(--ease)}
  .fdp-r1{display:flex;align-items:center;gap:12px}
  .fdp-em{width:42px;height:42px;border-radius:12px;background:var(--accent-soft);display:grid;place-items:center;font-size:22px;flex:none}
  .fdp-r1 .b{flex:1;min-width:0}
  .fdp-r1 .b b{display:block;font-weight:700;font-size:14.5px;line-height:1.25;overflow-wrap:anywhere}
  .fdp-r1 .b small{display:block;color:var(--muted);font-size:12.5px;margin-top:1px}
  .fdp-chk,.fdp-lbl{font-style:normal;font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:99px;margin-left:6px;vertical-align:1px;letter-spacing:.02em}
  .fdp-chk{color:var(--warn-ink);background:rgba(245,158,11,.16)}
  .fdp-lbl{color:var(--good-ink);background:rgba(34,197,94,.14)}
  .fdp-adj{color:var(--accent-ink);font-weight:700}
  .fdp-k{text-align:right;flex:none}
  .fdp-k b{display:block;font-size:17px;font-weight:800;letter-spacing:-.3px}
  .fdp-k small{color:var(--muted);font-size:10.5px;font-weight:700}
  .fdp-r2{display:flex;align-items:center;gap:10px;margin-top:9px}
  .fdp-st{display:flex;align-items:center;background:var(--bg2);border:1px solid var(--line);border-radius:12px;overflow:hidden;flex:none}
  .fdp-st button{width:40px;height:38px;border:0;background:none;color:var(--text);display:grid;place-items:center;cursor:pointer}
  .fdp-st button:active{background:var(--accent-soft)}
  .fdp-st button svg{width:16px;height:16px}
  .fdp-st span{min-width:62px;text-align:center;font-weight:800;font-size:14px;font-variant-numeric:tabular-nums}
  .fdp-mac{flex:1;min-width:0;font-size:11.5px;color:var(--muted);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .fdp-rm{width:38px;height:38px;border-radius:11px;border:1px solid var(--line);background:none;color:var(--muted);display:grid;place-items:center;cursor:pointer;flex:none}
  .fdp-rm svg{width:15px;height:15px}
  @media (max-width:370px){.fdp-r2{gap:8px}.fdp-st button{width:36px}.fdp-st span{min-width:52px;font-size:13.5px}.fdp-mac{font-size:11px}}
  .fdp-addbtn{margin-top:8px;color:var(--accent-ink)}
  .fdp-addf{margin-top:8px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:10px}
  .fdp-addf .search{margin-bottom:8px}
  .fdp-addf .fd-row{background:var(--bg2)}
  .fdp-hint{font-size:12.5px;color:var(--muted);background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.22);border-radius:12px;padding:10px 12px;margin-top:12px;line-height:1.45}
  #fdpLog small{display:block;font-size:12px;font-weight:600;opacity:.85;margin-top:2px}
  .fdp-err .fdp-mini{width:110px;height:110px;margin:4px auto 12px;border-radius:24px;overflow:hidden;box-shadow:0 10px 24px rgba(0,0,0,.25)}
  .fdp-err .fdp-mini img{width:100%;height:100%;object-fit:cover;filter:saturate(.7)}
  /* setup */
  .fdp-lede{color:var(--muted);font-size:14px;margin:0 0 14px;line-height:1.5}
  .fdp-adv{margin-top:18px}.fdp-adv>summary{cursor:pointer;color:var(--muted);font-size:13px;font-weight:600;padding:8px 2px}.fdp-adv>.card{margin-top:8px}
  .fdp-pend{display:flex;align-items:center;gap:12px;background:var(--accent-soft);border-radius:14px;padding:8px;margin-bottom:12px;font-size:13px;font-weight:600}
  .fdp-pend img{width:46px;height:46px;border-radius:10px;object-fit:cover;flex:none}
  .fdp-steps{list-style:none;margin:0 0 14px;padding:0;display:flex;flex-direction:column;gap:2px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:6px 14px}
  .fdp-steps li{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--line)}
  .fdp-steps li:last-child{border-bottom:0}
  .fdp-steps i{font-style:normal;width:28px;height:28px;border-radius:50%;flex:none;display:grid;place-items:center;font-weight:800;font-size:13.5px;color:#fff;background:linear-gradient(135deg,var(--accent),#0ea5e9)}
  .fdp-steps b{display:block;font-size:14.5px}
  .fdp-steps small{display:block;color:var(--muted);font-size:12.5px;margin-top:2px;line-height:1.4}
  .fdp-link{display:block;margin:10px auto 0;background:none;border:0;color:var(--accent-ink);font-weight:700;font-size:13.5px;cursor:pointer;padding:8px;text-decoration:underline}
  .fdp-link[hidden],.fdp-box[hidden]{display:none}
  .fdp-box input{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px!important;letter-spacing:.3px}
  .fdp-stat{margin-top:12px;font-size:13.5px;line-height:1.45;border-radius:14px;padding:0 12px;transition:padding .2s}
  .fdp-stat:empty{display:none}
  .fdp-stat.busy{padding:12px;background:var(--card);border:1px solid var(--line);color:var(--muted);display:flex;align-items:center;gap:10px}
  .fdp-stat.ok{padding:12px;background:rgba(34,197,94,.13);border:1px solid rgba(34,197,94,.3)}
  .fdp-stat.bad{padding:12px;background:rgba(244,63,94,.11);border:1px solid rgba(244,63,94,.28)}
  .fdp-stat.info{padding:12px;background:var(--accent-soft)}
  .fdp-spin{width:16px;height:16px;border-radius:50%;border:2.5px solid var(--line);border-top-color:var(--accent);animation:fdSpin .8s linear infinite;display:inline-block;flex:none;vertical-align:-3px}
  .fdp-have{margin-top:12px;font-size:13px;color:var(--muted)}
  .fdp-priv{font-size:12px;color:var(--faint-ink);margin:14px 2px 0;line-height:1.45}
  /* settings card */
  .fdp-set{display:flex;gap:12px;align-items:center}
  .fdp-set .ic{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;font-size:22px;background:var(--line);flex:none}
  .fdp-set .ic.on{background:linear-gradient(135deg,var(--accent),#0ea5e9)}
  .fdp-set .b{flex:1;min-width:0}
  .fdp-set b{display:block;font-size:15px}
  .fdp-set small{display:block;color:var(--muted);font-size:12.5px;margin-top:2px;line-height:1.4}
  .fdp-setb{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
  .fdp-setb .btn{flex:1;padding:10px 8px;font-size:13px;white-space:nowrap}
  .fdp-setmsg{font-size:13px;margin-top:10px}
  .fdp-setmsg:empty{display:none}
  .fdp-setmsg.ok{color:var(--good-ink)}.fdp-setmsg.bad{color:var(--bad-ink)}.fdp-setmsg.busy{color:var(--muted)}
  .fd-sbot .r label{flex:1;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.14);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#fff;border-radius:16px;padding:13px 6px;font-weight:700;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px}
  .fd-sbot .r>*{white-space:nowrap;min-width:0}
  .fd-sbot .r button{gap:6px!important;padding:13px 6px!important}
  .fd-sbot .r label svg{width:19px;height:19px}
  .fd-sbot .r label.ai{background:linear-gradient(135deg,var(--accent),#0ea5e9);border-color:transparent}
  @media (prefers-reduced-motion: reduce){.fdp-scanl,.fdp-shine,.fdp-frame img,.fdp-art .ln,.fdp-big{animation:none!important}}
  `);
  ensurePhotoInputs();

  /* ---------------- view ---------------- */
  function buildView(el){
    el.innerHTML = `
      <div class="fd-top"><div><h2>Food</h2><p class="lede">Snap your plate, scan a barcode, or say “I ate 2 eggs and a banana”.</p></div></div>
      <div class="fd-date"><button id="fdPrev" aria-label="Previous day">${I.left}</button><div><b id="fdDateL"></b><small id="fdDateS"></small></div><button id="fdNext" aria-label="Next day">${I.right}</button></div>
      <div class="card" id="fdSum"></div>
      <div class="fdp-hero">${camLbl('fdp-snap', `<span class="ic">${I.cam}</span><span class="t"><b>Snap your food</b><small id="fdSnapSub"></small></span><span class="go">${I.right}</span>`, 'fdPhCam', 'id="fdSnapBtn" aria-label="Snap your food"')}
        <div class="fdp-row">${camLbl('fd-ghost', `${I.photo}<span>From photos</span>`, 'fdPhGal')}<button class="fd-ghost" id="fdScanBtn">${I.scan}<span>Barcode</span></button><button class="fd-ghost" id="fdManBtn">${I.pen}<span>Type it</span></button></div></div>
      <div class="fd-search"><div class="search">${I.search}<input id="fdSIn" placeholder="Search food or brand" autocomplete="off" enterkeyhint="search" aria-label="Search food"><button id="fdSBtn" style="display:none">Search</button></div><div id="fdSRes"></div></div>
      <div class="section-h"><h3>Meals</h3><span id="fdMealsTot" style="color:var(--muted);font-size:13px;font-weight:600"></span></div>
      <div id="fdMeals"></div>
      <div class="section-h"><h3>Water</h3><span id="fdWaterTxt" style="color:var(--muted);font-size:13px;font-weight:600"></span></div>
      <div class="card" id="fdWater"></div>
      <div class="section-h"><h3>Last 7 days</h3><span id="fdWeekAvg" style="color:var(--muted);font-size:13px;font-weight:600"></span></div>
      <div class="card" id="fdWeek"></div>
      <details class="fdp-adv"><summary>Advanced: use your own Google AI key</summary><div class="card" id="fdAI"></div></details>
      <p class="fd-note">Product data from Open Food Facts (free and open). Common-food values are typical estimates. Photo estimates by Google Gemini.</p>`;
    const q = s => el.querySelector(s);
    q('#fdPrev').onclick = ()=>{ viewKey = shiftKey(viewKey, -1); renderDynamic(el); };
    q('#fdNext').onclick = ()=>{ if (viewKey < todayKey()){ viewKey = shiftKey(viewKey, 1); renderDynamic(el); } };
    q('#fdScanBtn').onclick = ()=>openScanner();
    q('#fdManBtn').onclick = ()=>showManual({name:srch.q.trim()});
    const inp = q('#fdSIn'), sb = q('#fdSBtn');
    inp.oninput = ()=>{ srch.q = inp.value; srch.seq++; srch.state = 'idle'; srch.results = []; sb.style.display = inp.value.trim() ? '' : 'none'; renderSearch(); };
    inp.onkeydown = e=>{ if (e.key==='Enter'){ e.preventDefault(); runSearch(inp.value); inp.blur(); } };
    sb.onclick = ()=>runSearch(inp.value);
    el.addEventListener('click', e=>{
      const t = e.target;
      let b;
      if ((b = t.closest('#fdSGo')) || (b = t.closest('#fdSRetry'))) return runSearch();
      if ((b = t.closest('#fdSMan'))) return showManual({name:cap(srch.q.trim()), meal:srch.meal});
      if ((b = t.closest('[data-lf]'))) return showFood(localFood(FOOD_BY_KEY[b.dataset.lf]), {meal:srch.meal});
      if ((b = t.closest('[data-sr]'))) return showFood(srch.results[+b.dataset.sr], {meal:srch.meal});
      if ((b = t.closest('[data-rec]'))){ const r = F().recent[+b.dataset.rec]; if (r) showFood(JSON.parse(JSON.stringify(r)), {meal:srch.meal}); return; }
      if ((b = t.closest('[data-entry]'))){ const d = getDay(viewKey); const en = d.items.find(x=>x.id===b.dataset.entry); if (en) showFood({src:en.src, name:en.name, brand:en.brand, emoji:en.emoji, img:en.img, pid:en.pid, code:en.code, units:en.units, w:wu(en.units[0]), per100:null}, {entry:en}); return; }
      if ((b = t.closest('[data-addmeal]'))){ srch.meal = b.dataset.addmeal; focusSearch(b.dataset.addmeal); J.toast(`Search or pick a food for ${MEALS.find(m=>m.id===b.dataset.addmeal).label.toLowerCase()}`); return; }
      if ((b = t.closest('#fdGoalBtn'))) return showGoal();
      if ((b = t.closest('[data-ai]'))) return aiCardClick(b);
      if ((b = t.closest('[data-water]'))){ addWater(+b.dataset.water, viewKey); return; }
      if ((b = t.closest('[data-glass]'))){ const d = ensureDay(viewKey);
        // the touch areas overlap a little (44 px wide for a 24 px glass): the glass nearest the finger wins
        if (e.clientX){ let best = null, bd = 1e9; b.parentNode.querySelectorAll('[data-glass]').forEach(g=>{ const r = g.getBoundingClientRect(), dd = Math.abs(r.left + r.width/2 - e.clientX) + (e.clientY < r.top || e.clientY > r.bottom ? Math.min(Math.abs(r.top - e.clientY), Math.abs(r.bottom - e.clientY)) : 0); if (dd < bd){ bd = dd; best = g; } }); if (best) b = best; }
        const i = +b.dataset.glass; const before = d.water||0; d.water = (i+1===before) ? i : i+1; syncHabitWater(d.water-before, viewKey); J.save(); J.renderAll(); return; }
      if ((b = t.closest('[data-day]'))){ const k = b.dataset.day, ch = k!==viewKey; viewKey = k; renderDynamic(el);
        if (ch) J.toast(`Showing ${k===todayKey() ? 'today' : k===shiftKey(todayKey(),-1) ? 'yesterday' : keyDate(k).toLocaleDateString([], {weekday:'long', month:'short', day:'numeric'})}`); return; }
    });
    el.dataset.built = '1';
  }
  /** keep a "Drink water" habit (habits.js) in step with glasses logged here (today only; adds and takes away). */
  function syncHabitWater(delta, key){
    if (!delta || (key && key!==todayKey())) return null;
    try {
      if (delta < 0) return (J.habits && J.habits.unlogWater) ? J.habits.unlogWater(-delta) : null;
      return (J.habits && J.habits.logWater) ? J.habits.logWater(delta) : null;
    } catch(e){ return null; }
  }
  function addWater(n, key, opts={}){
    key = key || todayKey(); const d = ensureDay(key); const before = d.water||0;
    d.water = Math.max(0, before + n);
    if (!opts.noHabit) syncHabitWater(d.water-before, key);
    J.save(); J.renderAll(); return d.water;
  }
  function glassSVG(full){ return `<svg viewBox="0 0 24 32"><path d="M3 3h18l-2.2 25.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8z" fill="${full?'rgba(14,165,233,.18)':'none'}" stroke="${full?'#0ea5e9':'var(--faint)'}" stroke-width="1.8" stroke-linejoin="round"/>${full?'<path d="M4.6 11h14.8l-1.6 17a1.4 1.4 0 0 1-1.4 1.3H7.6a1.4 1.4 0 0 1-1.4-1.3z" fill="#0ea5e9"/>':''}</svg>`; }
  function renderDynamic(el){
    if (!el.dataset.built) buildView(el);
    renderSearch();
    const s = F(), q = x => el.querySelector(x);
    if (lastToday!==todayKey()){ if (viewKey===lastToday) viewKey = todayKey(); lastToday = todayKey(); }
    if (viewKey > todayKey()) viewKey = todayKey();
    q('#fdDateL').textContent = dateLabel(viewKey);
    q('#fdDateS').textContent = keyDate(viewKey).toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'});
    q('#fdNext').disabled = viewKey >= todayKey();
    { const has = J.ai.hasKey(); q('#fdSnapSub').textContent = has ? 'Plate or product · AI counts calories' : 'Scan a product barcode';
      const ai = q('#fdAI'), sig = has ? 'on'+aiKey().slice(-4) : 'off'; if (ai.dataset.sig!==sig){ ai.dataset.sig = sig; ai.innerHTML = aiCardHTML(); } }
    const t = dayTotals(viewKey), goal = s.goal, left = goal - t.kcal, over = left < 0;
    q('#fdSum').innerHTML = `<div class="fd-sum">
        <div class="fd-ring" style="width:150px;height:150px">${ringSVG(t.kcal, goal, 150, 14, 'fdgV')}<div class="fd-rc"><div><b style="${over?'color:var(--warn-ink)':''}">${N(Math.abs(left))}</b><span>${over?'kcal over':'kcal left'}</span></div></div></div>
        <div class="fd-kv">
          <div class="r"><div class="ic" style="background:rgba(245,158,11,.15);color:#f59e0b">${J.icons.flame||'🔥'}</div><div class="v"><small>Eaten</small><b>${N(t.kcal)}</b><i>kcal</i></div></div>
          <button class="r fd-goalbtn" id="fdGoalBtn" aria-label="Edit calorie goal"><div class="ic" style="background:var(--accent-soft);color:var(--accent-ink)">${J.icons.target||'🎯'}</div><div class="v"><small>Goal ${I.edit}</small><b>${N(goal)}</b><i>kcal</i></div></button>
          <div class="r"><div class="ic" style="background:${over?'rgba(244,63,94,.14)':'rgba(34,197,94,.14)'};color:${over?'var(--bad-ink)':'var(--good-ink)'}">${over?(J.icons.info||'⚠️'):(J.icons.done||'✅')}</div><div class="v"><small>${over?'Over by':'Left'}</small><b style="color:${over?'var(--bad-ink)':'var(--good-ink)'}">${N(Math.abs(left))}</b><i>kcal</i></div></div>
        </div></div>
      <div class="fd-macros">${MACROS.map(m=>{ const v = t[m.k], tg = macroTarget(m); return `<div class="fd-macro"><div class="l">${m.label}<b>${N(v)}g</b></div><div class="bar"><i style="width:${Math.min(v/tg*100,100)}%;background:${m.color}"></i></div><div class="t">of ${tg} g</div></div>`; }).join('')}</div>`;
    // meals
    const d = getDay(viewKey);
    q('#fdMealsTot').textContent = d.items.length ? `${d.items.length} item${d.items.length>1?'s':''}` : '';
    q('#fdMeals').innerHTML = MEALS.map(m=>{
      const items = d.items.filter(x=>x.meal===m.id); const k = items.reduce((a,x)=>a+ntot(x).kcal, 0);
      return `<div class="fd-meal"><div class="fd-mh"><div class="mi">${m.ic}</div><b>${m.label}<small>${items.length?`${N(k)} kcal`:'Nothing yet'}</small></b><button class="add" data-addmeal="${m.id}" aria-label="Add to ${m.label}">${I.plus}</button></div>
        ${items.map(x=>`<button class="fd-it" data-entry="${x.id}">${thumb(x)}<div class="b"><b>${esc(x.name)}</b><small>${esc(qtyText(x))}${x.brand?' · '+esc(x.brand):''}</small></div><div class="k">${N(ntot(x).kcal)}</div></button>`).join('')}</div>`;
    }).join('');
    // water
    const w = d.water||0, wg = s.waterGoal;
    q('#fdWaterTxt').textContent = `${w} of ${wg} glasses`;
    q('#fdWater').innerHTML = `<div class="fd-water"><div class="fd-glasses ${Math.max(wg,w)>10?'many':''}">${Array.from({length:Math.max(wg, w)}, (_,i)=>`<button class="fd-glass" data-glass="${i}" aria-label="Glass ${i+1}">${glassSVG(i<w)}</button>`).join('')}</div>
      <button class="fd-wbtn m" data-water="-1" aria-label="Remove a glass" ${w?'':'disabled style="opacity:.4"'}>${I.minus}</button><button class="fd-wbtn" data-water="1" aria-label="Add a glass">${I.plus}</button></div>
      <div style="font-size:12.5px;color:var(--muted);margin-top:10px">${w>=wg?'🎉 Water goal reached. Nice work!':`💧 ${wg-w} more glass${wg-w>1?'es':''} to go · say “I drank a glass of water”`}</div>`;
    // week chart
    const days = Array.from({length:7}, (_,i)=>shiftKey(viewKey, i-6));
    const vals = days.map(k=>dayTotals(k).kcal);
    const mx = Math.max(goal*1.15, ...vals, 1);
    const logged = vals.filter(v=>v>0);
    q('#fdWeekAvg').textContent = logged.length ? `avg ${N(logged.reduce((a,b)=>a+b,0)/logged.length)} kcal` : '';
    q('#fdWeek').innerHTML = `<div class="fd-chart" role="img" aria-label="Calories for the last 7 days">
      <div class="fd-goal-line" style="bottom:${22 + (goal/mx)*(150-22-18)}px"><span>Goal ${N(goal)}</span></div>
      ${days.map((k,i)=>{ const v = vals[i]; const dd = keyDate(k); const sel = k===viewKey; return `<button class="fd-col ${sel?'sel':''} ${v>goal?'over':''} ${v?'':'zero'}" data-day="${k}" aria-label="${dateLabel(k)}: ${N(v)} kcal">${sel&&v?`<em>${N(v)}</em>`:''}<i style="height:${v?Math.max(v/mx*(150-22-18), 4):3}px"></i><span>${dd.toLocaleDateString([], {weekday:'short'})}</span></button>`; }).join('')}
    </div>${vals.every(v=>!v)?`<div style="text-align:center;color:var(--muted);font-size:13px;margin-top:6px">Log food to see your week take shape.</div>`:''}`;
  }

  J.addView({id:'food', label:'Food', icon:'🥗', color:'#22c55e', order:20, render:renderDynamic});

  /* ---------------- home card ---------------- */
  J.addHomeCard({id:'food', order:30, render(el){
    const s = F(), k = todayKey(), t = dayTotals(k), left = s.goal - t.kcal, over = left<0, w = getDay(k).water||0;
    el.innerHTML = `<div class="section-h"><h3>Food today</h3><button class="link" data-fd-open>Open</button></div>
      <div class="card fd-home" data-fd-open>
        <div class="fd-ring sm" style="width:68px;height:68px">${ringSVG(t.kcal, s.goal, 68, 8, 'fdgH')}<div class="fd-rc"><div><b>${Math.round(t.kcal/s.goal*100)||0}%</b></div></div></div>
        <div class="b"><b style="${over?'color:var(--warn-ink)':''}">${N(Math.abs(left))} kcal ${over?'over':'left'}</b><small>${N(t.kcal)} of ${N(s.goal)} eaten <span style="white-space:nowrap;margin-left:6px">💧 ${w}/${s.waterGoal}</span></small>
          <div class="mm">${MACROS.map(m=>`<i title="${m.label}"><u style="width:${Math.min(t[m.k]/macroTarget(m)*100,100)}%;background:${m.color}"></u></i>`).join('')}</div></div>
        ${camLbl('fd-hscan', I.cam, 'fdPhCam', 'data-fd-snap aria-label="Snap your food"')}
      </div>`;
    if (!el.dataset.wired){ el.dataset.wired = '1'; el.addEventListener('click', e=>{
      if (e.target.closest('[data-fd-snap]')){ e.stopPropagation(); return; } // the label opens the camera
      if (e.target.closest('[data-fd-scan]')){ e.stopPropagation(); openScanner(); return; }
      if (e.target.closest('[data-fd-open]')){ viewKey = todayKey(); J.go('food'); J.renderAll(); }
    }); }
  }});

  /* ---------------- morning brief + public hook ---------------- */
  function yesterdayLine(){
    const k = shiftKey(todayKey(), -1), d = getDay(k);
    if (!d.items.length) return null;
    const goal = F().goal, kc = Math.round(dayTotals(k).kcal), diff = goal - kc;
    const vs = Math.abs(diff) < 50 ? `right on your ${N(goal)} goal` : diff>0 ? `under your ${N(goal)} goal` : `${N(-diff)} over your ${N(goal)} goal`;
    const w = d.water||0;
    return `Yesterday you ate ${N(kc)} calories, ${vs}${w?`, and drank ${w} glass${w>1?'es':''} of water`:''}.`;
  }
  try { if (J.addBriefLine) J.addBriefLine(yesterdayLine); } catch(e){}
  /** other features (e.g. a water habit) can add glasses here without being echoed back */
  J.food = {
    addWater(n){ n = +n||0; if (n) addWater(n, todayKey(), {noHabit:true}); return getDay(todayKey()).water||0; },
    snap(){ openPhoto(); },
    today(){ const t = dayTotals(todayKey()); return {kcal:t.kcal, p:t.p, c:t.c, f:t.f, goal:F().goal, water:getDay(todayKey()).water||0, waterGoal:F().waterGoal}; }
  };

  /* =========================================================
     VOICE
     ========================================================= */
  const FILLER = new Set('a an the some of my with and few couple half big small large medium little bit piece pieces slice slices cup cups bowl bowls plate plates glass glasses can cans serving servings scoop scoops spoon spoons tablespoon tablespoons tbsp tsp teaspoon teaspoons handful handfuls bottle bottles bar bars portion portions x times homemade fresh like about around maybe also just today really whole i me had ate eat this that for it was so of really good nice delicious too much lot lots alot loads nothing anything something stuff food out outside in late early already well healthy enough again more less all everything breakfast lunch dinner'.split(' '));
  const UNITWORD = /^(g|gr|grams?|grammes?|ml|kg)$/;
  const LEAD = new Set('a an the some my of few couple half piece pieces slice slices cup cups bowl bowls plate plates glass glasses can cans serving servings scoop scoops spoon spoons tablespoon tablespoons tbsp tsp teaspoon teaspoons handful handfuls bottle bottles bar bars portion portions'.split(' '));
  function vars(w){ const s = new Set([w]); if (w.length>3){ if (w.endsWith('ies')) s.add(w.slice(0,-3)+'y'); if (w.endsWith('es')) s.add(w.slice(0,-2)); if (w.endsWith('s') && !w.endsWith('ss')) s.add(w.slice(0,-1)); } return s; }
  const tokEq = (a,b) => { if (a===b) return true; const A = vars(a), B = vars(b); for (const x of A) if (B.has(x)) return true; return false; };
  const toks = s => s.toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9.\/é ]/g,' ').replace(/(\d)\s*(g|gr|grams?|ml)\b/g,'$1 $2').split(/\s+/).filter(Boolean);
  const ALIASES = []; FOODS.forEach(f=>f.aliases.forEach(a=>ALIASES.push({t:toks(a), f}))); ALIASES.sort((a,b)=>b.t.length-a.t.length || b.t.join(' ').length-a.t.join(' ').length);
  function qtyFrom(tk){
    let qty = null, grams = null;
    for (let i=0;i<tk.length;i++){
      const w = tk[i];
      let m;
      if ((m = w.match(/^(\d+(?:\.\d+)?)(g|ml)$/))){ grams = parseFloat(m[1]); continue; }
      if (/^\d+(?:\.\d+)?$/.test(w)){
        if (tk[i+1] && UNITWORD.test(tk[i+1])){ grams = parseFloat(w) * (tk[i+1]==='kg'?1000:1); i++; continue; }
        qty = (qty||0) + parseFloat(w); continue;
      }
      if ((m = w.match(/^(\d+)\/(\d+)$/))){ qty = (qty||0) + (+m[1])/(+m[2]); continue; }
      if (w==='half') { qty = qty ? qty + .5 : .5; continue; }
      if (w==='couple') qty = 2; if (w==='few') qty = 3; if (w==='dozen') qty = (qty||1)*12;
    }
    return {qty: qty || 1, grams};
  }
  /** parse "2 eggs and a banana" → {items:[{food, qty, grams}], water, unknown:[]} */
  function parseFoods(text){
    let s = ' '+text.toLowerCase()+' ';
    s = s.replace(/(\d+(?:\.\d+)?) and a half/g, (_,n)=>String(+n+.5)).replace(/\ba half\b/g,'half').replace(/\b(1|one) and half\b/g,'1.5');
    const pieces = s.split(/\s*(?:\band\b|&|\bplus\b|\bthen\b|\balong with\b|;|\+)\s*/);
    const out = {items:[], water:0, unknown:[]};
    pieces.forEach(pc=>{
      const tk = toks(pc); if (!tk.length) return;
      if (tk.some(w=>w==='water'||w==='waters')){
        let n = 1; const j = pc.match(/(\d+(?:\.\d+)?)\s*(ml|l|liters?|litres?)\b/);
        if (j) n = Math.max(1, Math.round(parseFloat(j[1]) * (j[2]==='ml'?1/250:4)));
        else { const q = qtyFrom(tk.filter(w=>w!=='water')).qty; n = q * (/bottle/.test(pc) ? 2 : 1); }
        out.water += Math.round(n); return;
      }
      const used = new Array(tk.length).fill(false); const found = [];
      for (const al of ALIASES){
        const L = al.t.length;
        for (let i=0;i+L<=tk.length;i++){
          let ok = true; for (let j=0;j<L;j++){ if (used[i+j] || !tokEq(tk[i+j], al.t[j])){ ok = false; break; } }
          if (ok){ for (let j=0;j<L;j++) used[i+j] = true; found.push({i, L, f:al.f}); }
        }
      }
      // "had a date with…" is not the fruit unless a number is given
      for (let k=found.length-1;k>=0;k--){ const fm = found[k]; if (fm.f.key==='date' && tk[fm.i]==='date' && !tk.slice(0,fm.i).some(w=>/^\d/.test(w))){ found.splice(k,1); used[fm.i] = false; } }
      if (!found.length){
        if (tk.some(w=>!FILLER.has(w) && !/^\d/.test(w) && !UNITWORD.test(w))){
          let k = 0; while (k<tk.length && (LEAD.has(tk[k]) || /^\d/.test(tk[k]) || UNITWORD.test(tk[k]))) k++;
          const phrase = tk.slice(k).join(' '); if (phrase) out.unknown.push(phrase);
        }
        return;
      }
      found.sort((a,b)=>a.i-b.i);
      let prevEnd = 0;
      found.forEach((m, idx)=>{
        const gap = tk.slice(prevEnd, m.i).filter((_,k)=>!used[prevEnd+k]);
        const after = idx===found.length-1 ? tk.slice(m.i+m.L).filter(w=>/^\d|^(g|grams?)$/.test(w)) : [];
        const q = qtyFrom(gap.length ? gap : after);
        // grams written after the food: "chicken 200 grams"
        if (!q.grams && after.length){ const qa = qtyFrom(after); if (qa.grams) q.grams = qa.grams; }
        out.items.push({food:m.f, qty:q.qty, grams:q.grams});
        prevEnd = m.i + m.L;
      });
    });
    return out;
  }
  function itemTotals(it){ const f = it.food; if (!f || !f.n) return {kcal:0,p:0,c:0,f:0}; if (it.grams) return scaleN(f.n, it.grams/f.g); return scaleN(f.n, it.qty); }
  function itemSay(it){ return it.grams ? sayItem(it.food.name, LIQ.has(it.food.key)?'ml':'g', it.grams) : sayItem(it.food.name, it.food.unit, it.qty); }
  function logItems(items, meal, key){
    let kcal = 0;
    items.forEach(it=>{
      const lf = localFood(it.food);
      const e = addEntry(lf, it.grams ? 1 : 0, it.grams ? it.grams : it.qty, meal, key);
      kcal += ntot(e).kcal;
    });
    return kcal;
  }
  function summarySay(key){
    const s = F(), t = dayTotals(key), left = s.goal - t.kcal;
    const when = key===todayKey() ? ' today' : key===shiftKey(todayKey(),-1) ? ' yesterday' : ' on '+dateLabel(key);
    const had = key===todayKey() ? "You've had" : 'You had';
    return left>=0 ? `${had} ${N(t.kcal)} of ${N(s.goal)} calories${when}, ${key===todayKey()?'so':'leaving'} ${N(left)} ${key===todayKey()?'left':'spare'}.` : `${had} ${N(t.kcal)} calories${when}, ${N(-left)} over your ${N(s.goal)} goal.`;
  }
  function pickMeal(t){
    let m;
    if ((m = t.match(/\b(breakfast|brunch|lunch|dinner|supper|snack|snacks|dessert)\b/))) return {meal:{breakfast:'breakfast', brunch:'breakfast', lunch:'lunch', dinner:'dinner', supper:'dinner', snack:'snack', snacks:'snack', dessert:'snack'}[m[1]]};
    if (/\bthis morning\b/.test(t)) return {meal:'breakfast'};
    if (/\b(tonight|this evening)\b/.test(t)) return {meal:'dinner'};
    if (/\bthis afternoon\b/.test(t)) return {meal:'lunch'};
    return {meal:null};
  }
  function stripContext(s){
    return s.replace(/\b(?:for|at|with|during|as|in|to|into|on)?\s*(?:my\s+|a\s+|the\s+|today'?s\s+)?(breakfast|brunch|lunch|dinner|supper|snacks?|dessert)\b/g,' ')
      .replace(/\b(?:to|in|into|on)\s+(?:my\s+)?(?:food\s+diary|food\s+log|food\s+tracker|food|diary|calories|calorie\s+tracker|tracker|log|today)\b/g,' ')
      .replace(/\b(this morning|this afternoon|this evening|tonight|today|yesterday|just now|earlier|so far|please|for me|thanks?|thank you)\b/g,' ')
      .replace(/\s+/g,' ').trim();
  }
  // things people "finish", "have" or "add" that are not food ("I finished the book", "add milk to my shopping list")
  const NOT_EATEN = /\b(?:workout|work ?out|training|gym|run|walk|book|books|chapter|chapters|pages?|novel|reading|meeting|meetings|work|job|shift|homework|project|projects|task|tasks|assignment|report|exam|test|class|course|lesson|lecture|game|match|movie|film|show|series|episode|season|call|calls|appointment|chores?|laundry|cleaning|email|emails|presentation|interview|nap|shower|bath|haircut|day|week|weekend|night|time|fun|fight|argument|chat|talk|date with|list|shopping list|grocery list|cart|basket|calendar|schedule|todo|to do)\b/;
  // "how many carbs did I eat today", "how much fat today", "what's my protein", "carbs today"
  const MACRO_Q = /\b(?:how (?:much|many)(?: grams of)?|what(?:'s| is| are| was| were) my) (protein|carbs?|carbohydrates?|fats?)\b(?! (?:is |are )?(?:in|does|do|for|of) )|^(?:my )?(protein|carbs?|carbohydrates|fats?)(?: intake| count)?(?: today| so far| yesterday)?$|^(?:and |what about |how about )(protein|carbs?|fats?)$/;
  const NOT_FOOD = /\b(remind|reminder|note|notes|paid|pay|spent|spend|bought|buy|cost|costs|dollars?|bucks|usd|lira|lbp|euros?|budget|salary|income|habit|habits|receipt|expense|expenses|payment|purchase)\b|\$/;

  J.addIntent(function(said, t){
    t = t.replace(/[.]+$/,'').replace(/\s+\./g,' ').trim();
    let m;
    if (/^(?:note|take a note|new note|add a note|write down|remember)\b|\bremind(?:er)?\b/.test(t)) return null;
    // ---- AI setup: "turn on AI food photos", "set up the food AI"
    if (/\b(?:turn on|set up|setup|enable|activate|connect)\b.*\b(?:ai|gemini)\b/.test(t) && /\b(?:food|photo|photos|calorie|calories|plate|gemini)\b/.test(t)){
      J.go('food'); setTimeout(()=>showAiSetup({}), 60);
      return J.ai.hasKey() ? 'AI food photos are already on. I opened the setup in case you want to change the key.' : "Let's turn on AI food photos. It's free. Follow the four steps on screen.";
    }
    // ---- food photo: "how many calories is this", "scan my plate", "take a picture of my food"
    const PHOTO_FOOD = /\b(?:food|foods|plate|meal|dish|dinner|lunch|breakfast|snack|eating|calories)\b/;
    if (!/\b(?:receipt|receipts|bill|invoice|barcode|bar code|qr)\b/.test(t) && !NOT_FOOD.test(t) && (
        /\bwhat(?:'s| is| are) (?:in|on) (?:this|the|my|that) (?:photo|picture|pic|image|plate|dish|bowl)\b/.test(t) ||
        /^(?:so |ok |okay |hey jarvis |jarvis )?how many (?:calories|calorie|cals|kcal) (?:is|are|are in|is in|in|does|do|would) (?:this|that|these|those|it|my plate|my food|my meal)(?: have| has| got| plate| meal| food| dish| photo| picture| be)?$/.test(t) ||
        /\b(?:scan|analy[sz]e|check|snap|photograph|count|estimate)\b (?:my |the |this |a |that )?(?:plate|meal|dish|food|lunch|dinner|breakfast|snack|calories (?:in|of|on) (?:this|my|the) (?:photo|picture|plate|food|meal))\b/.test(t) ||
        /\b(?:take|snap|use) (?:a |an )?(?:photo|picture|pic|snap|snapshot)\b/.test(t) && PHOTO_FOOD.test(t) ||
        /\b(?:with|using|from|by) (?:a |the )?(?:photo|picture|pic|camera)\b/.test(t) && PHOTO_FOOD.test(t) ||
        /\b(?:photo|picture) of (?:my |the |this )?(?:food|plate|meal|dish|lunch|dinner|breakfast)\b/.test(t) )){
      J.go('food'); setTimeout(()=>openPhoto({fromVoice:true}), 60);
      return J.ai.hasKey() ? 'Sure. Tap Take photo and point your camera at the food. I will count the calories.' : 'Sure. Tap Take photo. Products with a barcode work right away. For plates, I will show you how to turn on the free AI.';
    }
    // ---- scan
    if (/\b(scan|scanner)\b/.test(t) && /\b(food|foods|barcode|barcodes|bar code|product|item|label|snack|groceries|grocery|nutrition|calories|packet|package|qr|box|can|bottle|this)\b/.test(t) && !/\b(receipt|receipts|bill|invoice|document|page)\b/.test(t)){
      J.go('food'); setTimeout(()=>openScanner({fromVoice:true}), 60);
      return 'Opening the barcode scanner. Tap Start camera and point it at the barcode.';
    }
    // ---- calorie goal
    if ((m = t.match(/\b(?:set|change|make|update|put|raise|lower)\b.*?\bcalor(?:ie|ies)\b.*?(\d{3,5})/)) || (m = t.match(/\bcalor(?:ie|ies) (?:goal|target|limit|budget)\b.*?(\d{3,5})/)) || (m = t.match(/\bmy (?:daily )?calor(?:ie|ies)(?: goal| target| limit)? (?:is|should be|to) (\d{3,5})/)) || (m = t.match(/\b(\d{3,5}) calor(?:ie|ies) (?:a|per) day\b.*\bgoal\b/))){
      const v = parseInt(m[1]); if (v<500 || v>10000) return 'That goal looks unusual. Try a number between 1,000 and 4,000 calories.';
      F().goal = v; J.save(); J.go('food');
      const t2 = dayTotals(todayKey()), lf = v - t2.kcal;
      return `Done. Your daily calorie goal is now ${N(v)}. ${lf>=0 ? `You have ${N(lf)} left today.` : `Today you're ${N(-lf)} over it.`}`;
    }
    // ---- water goal
    if ((m = t.match(/\bwater (?:goal|target)\b.*?(\d{1,2})/)) || (m = t.match(/\b(?:set|change)\b.*\bwater\b.*?(\d{1,2})/))){
      const v = parseInt(m[1]); if (v>=1 && v<=30){ F().waterGoal = v; J.save(); J.go('food'); return `Okay, your water goal is ${v} glasses a day.`; }
    }
    // ---- take water away: "remove a glass of water", "undo last water", "I didn't drink that glass"
    if ((m = t.match(/^(?:please )?(?:remove|delete|take (?:away|off)|undo|minus|subtract|cancel|scratch)(?: the| my)?(?: last)?\s*(\d{1,2}|a|one|that)?\s*(?:glass(?:es)?|cups?|bottles?)?(?: of)? water(?: glass(?:es)?)?$/))){
      const n = /^\d+$/.test(m[1]||'') ? parseInt(m[1]) : 1; const before = getDay(todayKey()).water||0;
      if (!before){ J.go('food'); return 'You have no water logged today.'; }
      const w = addWater(-Math.min(n, before), todayKey()); J.go('food');
      const k = before - w; return `Took away ${k} glass${k>1?'es':''}. You're at ${w} of ${F().waterGoal} glasses today.`;
    }
    // ---- "how's my calorie goal?"
    if (/^how(?:'s| is| am i doing)(?: with| on)? (?:my |the )?(?:calorie|calories|kcal|food|diet) (?:goal|target|budget|count)(?: going| doing)?(?: today)?$/.test(t)){ J.go('food'); return summaryReply('today'); }
    // ---- water question
    if (/\bhow (?:much|many) (?:water|glasses)\b/.test(t) || /^(?:did|have) i (?:drink|drunk|drank|had|have) enough water\b/.test(t) || /\bwater (?:today|so far)\b.*\?*$/.test(t) && /\bhow\b/.test(t)){
      const w = getDay(todayKey()).water||0, g = F().waterGoal; J.go('food');
      return w ? `You've had ${w} of ${g} glasses of water today.${w>=g?' Goal reached!':` ${g-w} to go.`}` : `No water logged yet today. Your goal is ${g} glasses.`;
    }
    // ---- calories in X (lookup, no logging)
    if ((m = t.match(/\b(?:how many|how much|what(?:'s| is| are)(?: the)?) (?:calories|calorie|kcal|cals|protein|carbs|fat)\b(?: are| is)? (?:in|does|do|for|of) (.+?)(?: have| has| contain| got)?$/)) || (m = t.match(/^(?:calories|kcal|nutrition) (?:in|of|for) (.+)$/))){
      const what = m[1].trim();
      if (/\b(i|today|left|so far|remaining|yesterday)\b/.test(what)) return summaryReply(t);
      const p = parseFoods(stripContext(what));
      if (!p.items.length){
        const q = (p.unknown[0] || what.replace(/^(?:a|an|the|one|\d+)\s+/,'')).trim();
        J.go('food'); setTimeout(()=>runSearch(q), 50);
        return `I don't have ${q} in my list, so I'm searching the food database for it. Tap a result to see its calories.`;
      }
      const tot = p.items.reduce((a,it)=>{ const n = itemTotals(it); a.kcal+=n.kcal; a.p+=n.p; a.c+=n.c; a.f+=n.f; return a; }, {kcal:0,p:0,c:0,f:0});
      const names = listJoin(p.items.map(itemSay));
      const one = p.items.length===1;
      return `${cap(names)} ${one && (p.items[0].qty===1 || p.items[0].grams)?'has':'have'} about ${N(tot.kcal)} calories${one?'':' in total'}: ${gramsSay(tot.p)} of protein, ${N(tot.c)} of carbs and ${N(tot.f)} of fat.${p.unknown.length?` I don't know ${p.unknown.join(' or ')} yet.`:''}`;
    }
    // ---- today summary
    if (/\b(?:how many|how much) (?:calories|calorie|kcal|cals)\b/.test(t) || /\b(?:calories|calorie count|kcal) (?:today|so far|left|remaining|eaten)\b/.test(t) || /\bwhat (?:did|have) i (?:eat|eaten|had)\b|^what did i have (?:for|at|today|this|so far)\b/.test(t) || /\bhow (?:am i|i'm) doing (?:on|with) (?:my )?(?:calories|food|diet)\b/.test(t) || MACRO_Q.test(t) || /^(?:my )?calories$/.test(t)) { if (!/\bburn/.test(t)) return summaryReply(t); }
    function summaryReply(t){
      const key = /\byesterday\b/.test(t) ? shiftKey(todayKey(), -1) : todayKey();
      viewKey = key; J.go('food');
      const d = getDay(key), tt = dayTotals(key);
      if (!d.items.length) return key===todayKey() ? `You haven't logged any food today. Your goal is ${N(F().goal)} calories. Say something like “I ate 2 eggs and a banana”, or scan a barcode.` : 'Nothing was logged yesterday.';
      if (/\bwhat (?:did|have) i\b/.test(t)){
        const mw = t.match(/\bfor (breakfast|brunch|lunch|dinner|supper|snacks?)\b/);
        if (mw){ const id = {brunch:'breakfast', supper:'dinner', snacks:'snack'}[mw[1]] || mw[1]; const it = d.items.filter(x=>x.meal===id); if (!it.length) return `Nothing logged for ${MEAL_WORD[id] || id} ${key===todayKey()?'today':'yesterday'}.`; return `For ${MEAL_WORD[id] || id} you had ${listJoin(it.map(x=>String(x.name||'food').toLowerCase().replace(/\s*\(.*?\)/g,'')))}, about ${N(it.reduce((a,x)=>{ try { return a + (x.food ? itemTotals(x).kcal : ntot(x).kcal) || a; } catch(e){ return a; } },0))} calories.`; }
        const byMeal = MEALS.map(mm=>{ const it = d.items.filter(x=>x.meal===mm.id); if (!it.length) return null; const cnt = {}; it.forEach(x=>{ const n = String(x.name||'food').toLowerCase().replace(/\s*\(.*?\)/g,''); cnt[n] = (cnt[n]||0) + 1; }); return `${mm.id==='snack'?'Snacks':mm.label}: ${listJoin(Object.entries(cnt).map(([n,c])=>c>1?`${n} ${c===2?"twice":c+" times"}`:n))}`; }).filter(Boolean);
        return `${byMeal.join('. ')}. ${summarySay(key)}`;
      }
      const mq = t.match(MACRO_Q);
      const mw = mq && (mq[1] || mq[2] || mq[3]);
      const mm = mw && MACROS.find(x=>x.label.toLowerCase().slice(0,3) === mw.slice(0,3));
      if (mm){
        const v = tt[mm.k], tg = macroTarget(mm);
        return `${key===todayKey()?"You've had":'You had'} ${gramsSay(v)} of ${mm.label.toLowerCase()} ${key===todayKey()?'today':'yesterday'}, ${v<tg?`out of about ${tg} grams`:mm.k==='p'?`which meets your ${tg} gram target`:`above the ${tg} grams that fits your goal`}. ${summarySay(key)}`;
      }
      return `${summarySay(key)} Protein ${N(tt.p)} grams, carbs ${N(tt.c)}, fat ${N(tt.f)}.`;
    }
    // ---- what should I eat (ideas that fit the calories left)
    if (/^(?:so |ok |okay )?what (?:should|can|could) i (?:eat|have)\b/.test(t) && !NOT_FOOD.test(t)){
      const left = F().goal - dayTotals(todayKey()).kcal, meal = pickMeal(t).meal || defaultMeal();
      J.go('food');
      if (left < 120) return `You've reached your ${N(F().goal)} calorie goal for today. If you're hungry, try something light like a cucumber, a tomato or a cup of tea.`;
      const ideas = {breakfast:['labneh','egg','oatmeal','greek_yogurt','manakish_zaatar','foul','banana'], lunch:['tawook','fattoush','mujaddara','chicken','lentil_soup','tabbouleh','falafel_sandwich','salmon'], dinner:['chicken','salmon','lentil_soup','fattoush','mujaddara','tabbouleh','tawook'], snack:['apple','banana','greek_yogurt','nuts','hummus','date','orange']}[meal]
        .map(k=>FOOD_BY_KEY[k]).filter(f=>f.n.kcal <= left).slice(0,3);
      if (!ideas.length) return `You have ${N(left)} calories left today. A piece of fruit or a cup of tea would fit.`;
      return `You have ${N(left)} calories left today. For ${MEAL_WORD[meal]}, ${listJoin(ideas.map(f=>`${f.name.toLowerCase().replace(/\s*\(.*?\)/g,'')} (${N(f.n.kcal)} calories)`))} would fit.`;
    }
    // ---- undo last food
    if (/\b(?:undo|delete|remove|cancel|scratch)\b (?:the |my )?last (?:food|meal|food entry|entry i ate|thing i ate|item|snack|drink)\b/.test(t)){
      const d = F().days[todayKey()]; if (!d || !d.items.length) return 'There is no food logged today to remove.';
      const x = d.items.reduce((a,b)=>b.at>a.at?b:a); removeEntry(todayKey(), x.id); J.go('food');
      return `Removed ${x.name.toLowerCase()}. ${summarySay(todayKey())}`;
    }
    // ---- open the view
    if (/\b(?:open|show|go to|see)\b.*\b(?:food|food diary|food log|calorie tracker|calories|nutrition|meals|diet)\b/.test(t) && !NOT_FOOD.test(t)){
      viewKey = /\byesterday\b/.test(t) ? shiftKey(todayKey(), -1) : todayKey(); J.go('food');
      return `Here's your food ${viewKey===todayKey()?'for today':'from yesterday'}. ${summarySay(viewKey)}`;
    }
    // ---- logging food / water
    if (NOT_FOOD.test(t)) return null;
    let body = null, verb = null, mealHint = null;
    if (/^(?:(?:hey )?jarvis\s+)?(?:i\s+)?(?:just\s+)?(?:ate|eaten|had something)$/.test(t)){ J.go('food'); return 'What did you have? Say something like “I ate 2 eggs and a banana”, or scan the barcode.'; }
    if ((m = t.match(/^(?:(?:hey |ok |okay )?jarvis\s+)?(?:please\s+)?(?:so\s+|ok\s+|okay\s+)?(?:(?:yesterday|today|this morning|earlier|tonight|this afternoon|this evening)\s+)?(?:for (breakfast|brunch|lunch|dinner|supper|a snack|snack|dessert)\s+)?(?:(?:i|i've|ive|i have|i just|i've just|i have just|just|i also|also|we)\s+)*(ate|eaten|eat|had|drank|drunk|drink|log|logged|add|track|record|count|munched|grabbed|finished)\s+(.+)$/))){
      mealHint = m[1] || null; verb = m[2]; body = m[3];
    } else if ((m = t.match(/^(?:my |for )?(breakfast|brunch|lunch|dinner|supper|snack|dessert)\s+(?:was|is|today was)\s+(.+)$/))){
      mealHint = m[1]; verb = 'was'; body = m[2];
    } else if ((m = t.match(/^(?:a |one |\d+ )?(?:glass|glasses|cup|cups|bottle|bottles) of water$|^water$|^\+?\s*(\d+)? ?glass(?:es)? of water$/))){
      verb = 'drank'; body = t;
    }
    if (!body) return null;
    // money, not food: "log 30 for gas", "lunch was 18", "add 12 for coffee"
    if (/^\$?\d+(?:\.\d+)?\s*(?:dollars?|bucks|usd|lira|\$)?(?:\s*(?:and\s+)?\d{1,2}\s*cents?)?(?:\s+(?:for|on|at)\s+.+)?$/.test(body) && (/^(?:log|logged|add|track|record|count)$/.test(verb) || /[.$]|dollars?|bucks|usd|lira|cents?/.test(body) || !/^\d+\s+(?:for|on)\s+(?:breakfast|brunch|lunch|dinner|supper|snacks?|dessert)$/.test(body))) return null;
    let dropUnknown = false;
    if (NOT_EATEN.test(body) && !(verb==='drank' || verb==='drink' || verb==='drunk')){
      // still log real food mentioned alongside ("I had pizza after the game") — but never guess from the leftovers
      const pf = parseFoods(stripContext(body));
      if (!pf.items.length || /\b(?:list|cart|basket|calendar|schedule|todo|to do)\b/.test(body)) return null;
      dropUnknown = true;
    }
    const when = /\byesterday\b/.test(t) ? shiftKey(todayKey(), -1) : todayKey();
    const mealP = pickMeal(mealHint ? mealHint : body);
    const meal = mealP.meal || defaultMeal();
    const cleaned = stripContext(body);
    const p = parseFoods(cleaned);
    if (dropUnknown) p.unknown = [];
    // "finished" only counts when a real food is named ("I finished 2 slices of pizza"), never as a search
    if (verb==='finished' && !p.items.length) return null;
    const eatVerb = /^(ate|eaten|eat|munched|was)$/.test(verb);
    if (!p.items.length && !p.water){
      if (eatVerb && p.unknown.length){
        const q = p.unknown[0]; J.go('food'); setTimeout(()=>runSearch(q), 50);
        return `I don't know ${q} yet, so I'm searching the food database. Tap the right one to add it to ${MEAL_WORD[meal]}.`;
      }
      if ((eatVerb || mealP.meal || mealHint) && !p.unknown.length) { J.go('food'); return `What did you have${mealP.meal?` for ${MEAL_WORD[meal]}`:''}? Say something like “I ate 2 eggs and a banana”, or scan the barcode.`; }
      return null; // e.g. "I had a meeting" — not food
    }
    // ignore "add" / "log" unless clearly food (no unknown-only leftovers)
    const parts = [];
    if (p.items.length){
      srch.meal = null;
      const kcal = logItems(p.items, meal, when);
      viewKey = when;
      parts.push(`Logged ${listJoin(p.items.map(itemSay))} for ${MEAL_WORD[meal]}${when!==todayKey()?' yesterday':''}, about ${N(kcal)} calories.`);
    }
    if (p.water){ const w = addWater(p.water, when); viewKey = when; parts.push(`${p.items.length?'Plus ':'Added '}${p.water} glass${p.water>1?'es':''} of water, that's ${w} of ${F().waterGoal}${when===todayKey()?' today':''}.`); }
    if (p.items.length) parts.push(summarySay(when));
    if (p.unknown.length) parts.push(`I couldn't find ${listJoin(p.unknown)}. You can search for ${p.unknown.length>1?'them':'it'} in Food.`);
    J.go('food'); J.save();
    return parts.join(' ');
  });

  J.addSuggestions(['I ate 2 eggs and a banana', 'Scan my plate', 'How many calories today?', 'Scan a barcode', 'I drank a glass of water', 'How many calories in a shawarma?']);

  // test hooks (harmless in production)
  window.__food = {parseFoods, interpret, checksumOK, fromOFF, openScanner, closeScanner, lookupAndShow, runSearch, handleScanResult, decodeFile, F, dayTotals, todayKey, openPhoto, onPhotoFile, analyzePhoto, showAiSetup, normalizeAI, extractKey, classifyHttp, AI_SCHEMA, AI_MODELS};
})();
