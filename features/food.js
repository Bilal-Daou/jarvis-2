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
  const DEFAULTS = {goal:2000, waterGoal:8, days:{}, products:{}, recent:[]};
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
      img:p.image_front_small_url || '', emoji:'🛒', per100, servingText:(p.serving_size||'').trim(), quantity:(p.quantity||'').trim(),
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
  async function getJSON(url, ms=14000){
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
  function errText(e){
    if (e && e.kind==='offline') return {t:"You're offline", d:'Connect to Wi-Fi or mobile data and try again.'};
    if (e && e.kind==='timeout') return {t:'That took too long', d:'The food database is slow right now. Please try again.'};
    if (e && e.kind==='server') return {t:'The food database is busy', d:'Open Food Facts did not answer properly. Try again in a minute.'};
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
  .fd-kv .v{line-height:1.2;min-width:0}
  .fd-kv small{display:block;color:var(--muted);font-size:11.5px;font-weight:600}
  .fd-kv b{font-size:17px;font-weight:800;letter-spacing:-.3px}
  .fd-kv i{font-style:normal;font-size:11.5px;color:var(--muted);font-weight:600;margin-left:3px}
  .fd-goalbtn{border:0;background:none;padding:0;cursor:pointer;text-align:left;color:var(--text)}
  .fd-goalbtn svg{width:13px;height:13px;color:var(--muted);margin-left:2px;vertical-align:-1px}
  .fd-macros{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}
  .fd-macro .l{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;font-weight:600;color:var(--muted);gap:4px}
  .fd-macro .l b{color:var(--text);font-size:13.5px}
  .fd-macro .bar{height:7px;background:var(--line);border-radius:9px;overflow:hidden;margin-top:6px}
  .fd-macro .bar i{display:block;height:100%;border-radius:9px;transition:width .7s var(--ease)}
  .fd-macro .t{font-size:11px;color:var(--faint);margin-top:4px;font-weight:600}
  .fd-actions{display:grid;grid-template-columns:1.25fr 1fr;gap:10px;margin-top:14px}
  .fd-scanbtn{border:0;border-radius:18px;padding:15px 14px;font-weight:800;font-size:15px;cursor:pointer;color:#fff;background:linear-gradient(135deg,var(--accent),#0ea5e9);display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 10px 24px rgba(79,70,229,.32);transition:transform .15s var(--ease)}
  .fd-scanbtn:active,.fd-ghost:active{transform:scale(.97)}
  .fd-scanbtn svg{width:22px;height:22px}
  .fd-ghost{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:18px;padding:14px;font-weight:700;font-size:14.5px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:transform .15s var(--ease)}
  .fd-ghost svg{width:18px;height:18px}
  .fd-search{margin:14px 0 0}
  .fd-search .search{margin-bottom:10px}
  .fd-search .search button{border:0;background:var(--accent);color:#fff;border-radius:10px;padding:7px 11px;font-weight:700;font-size:13px;cursor:pointer;flex:none}
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
  .fd-online{display:flex;align-items:center;gap:10px;width:100%;border:1px dashed var(--line);background:none;color:var(--accent);border-radius:16px;padding:13px 14px;font-weight:700;cursor:pointer;font-size:14px;text-align:left}
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
  .fd-mh .add{width:40px;height:40px;border-radius:11px;border:1px solid var(--line);background:none;display:grid;place-items:center;cursor:pointer;color:var(--accent);flex:none}
  .fd-mh .add svg{width:17px;height:17px}
  .fd-it{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line);cursor:pointer;width:100%;background:none;border-left:0;border-right:0;border-bottom:0;color:var(--text);text-align:left}
  .fd-it .fd-th{width:40px;height:40px;font-size:20px}
  .fd-it .b{flex:1;min-width:0}
  .fd-it .b b{display:block;font-weight:600;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .fd-it .b small{color:var(--muted);font-size:12.5px}
  .fd-it .k{font-weight:700;white-space:nowrap}
  .fd-mempty{color:var(--faint);font-size:13px;padding:2px 0 8px 44px}
  .fd-water{display:flex;align-items:center;gap:12px}
  .fd-glasses{display:flex;gap:4px;flex:1;min-width:0;flex-wrap:wrap}
  .fd-glass{flex:1 1 0;min-width:16px;max-width:26px;aspect-ratio:3/4;border:0;padding:0;background:none;cursor:pointer}
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
  .fd-col span{position:absolute;bottom:-21px;font-size:11px;color:var(--faint);font-weight:700}
  .fd-col.sel span{color:var(--text)}
  .fd-col em{font-style:normal;font-size:11px;font-weight:800;margin-bottom:4px;white-space:nowrap}
  .fd-goal-line{position:absolute;left:0;right:0;border-top:1.5px dashed var(--faint);pointer-events:none;z-index:2}
  .fd-goal-line span{position:absolute;left:0;top:-18px;font-size:10.5px;color:var(--muted);font-weight:700;background:var(--card-solid);padding:0 4px;border-radius:4px}
  .fd-note{font-size:11.5px;color:var(--faint);text-align:center;margin:16px 8px 0}
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
  .fd-sheet{position:fixed;left:50%;bottom:0;transform:translate(-50%,105%);width:100%;max-width:520px;max-height:92vh;max-height:92dvh;z-index:63;background:var(--bg2);border:1px solid var(--line);border-bottom:0;border-radius:28px 28px 0 0;transition:transform .4s var(--ease);box-shadow:0 -20px 60px rgba(0,0,0,.4);display:flex;flex-direction:column}
  .fd-sheet.open{transform:translate(-50%,0)}
  .fd-sheet:not(.open){visibility:hidden;transition:transform .42s var(--ease),visibility 0s linear .42s}
  .fd-sheet .grab{flex:none}
  .fd-sb{overflow-y:auto;padding:4px 18px calc(18px + var(--safe-b));-webkit-overflow-scrolling:touch}
  .fd-sx{position:absolute;right:12px;top:12px;width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:var(--card);display:grid;place-items:center;cursor:pointer;color:var(--text);z-index:2}
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
  .fd-quick button{flex:1;min-width:52px;border:1px solid var(--line);background:var(--card);border-radius:11px;padding:8px 4px;font-weight:700;font-size:13px;cursor:pointer;color:var(--text)}
  .fd-quick button.on{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}
  .fd-seg{margin-bottom:0}
  .fd-seg button{padding:10px 4px}
  .fd-total{display:flex;align-items:center;gap:12px;margin:16px 0 12px;background:var(--accent-soft);border-radius:16px;padding:12px 14px}
  .fd-total b{font-size:24px;font-weight:800;letter-spacing:-.5px}
  .fd-total b span{font-size:13px;font-weight:700;color:var(--muted);margin-left:3px}
  .fd-total small{color:var(--muted);font-size:12.5px;font-weight:600;margin-left:auto;text-align:right;line-height:1.35}
  .fd-cta{width:100%;border:0;border-radius:16px;padding:16px;font-weight:800;font-size:16px;cursor:pointer;color:#fff;background:linear-gradient(135deg,var(--accent),#0ea5e9);box-shadow:0 10px 24px rgba(79,70,229,.3)}
  .fd-cta:disabled{opacity:.45}
  .fd-row2{display:flex;gap:10px;margin-top:10px}
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
  function thumb(o, cls=''){
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
    const [t, c, bg] = v<=L[0] ? ['Low','var(--good)','rgba(34,197,94,.14)'] : v>L[1] ? ['High','var(--bad)','rgba(244,63,94,.14)'] : ['Medium','var(--warn)','rgba(245,158,11,.16)'];
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
    const subtitle = [food.brand, food.quantity].filter(Boolean).join(' · ') || (food.src==='local' ? 'Common food · typical values' : food.src==='manual' ? 'Added by you' : '');
    let warn = '';
    if (food.noKcal) warn = `<div class="fd-warnbox">⚠️ This product has no calorie info yet. Type the calories from the label below.</div>`;
    else if (food.src==='off' && food.missing && food.missing.length) warn = `<div class="fd-warnbox">Some nutrition info is missing for this product, so totals may be a little low.</div>`;
    else if (food.estimatedKcal) warn = `<div class="fd-warnbox">Calories were worked out from protein, carbs and fat.</div>`;
    const dayTxt = key===todayKey() ? 'today' : dateLabel(key);
    const body = openSheet(`
      <div class="fd-ph">${thumb(food)}<div style="min-width:0"><h4>${esc(food.name)}</h4><div class="br">${esc(subtitle)}</div></div></div>
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
      <div class="fd-total"><b id="fdTotK">0<span>kcal</span></b><small id="fdTotM"></small></div>
      <button class="fd-cta" id="fdAdd">${editing ? 'Save changes' : 'Add to '+esc(dayTxt)}</button>
      ${editing ? `<div class="fd-row2"><button class="btn danger" id="fdDel">Delete</button></div>` : ''}
      ${food.src==='off' ? `<p class="fd-note" style="margin-top:12px">Data from Open Food Facts${food.code?` · barcode ${esc(food.code)}`:''}</p>` : food.src==='local' ? `<p class="fd-note" style="margin-top:12px">Typical values. Packaged food? Scan its barcode for exact numbers.</p>` : ''}
    `);
    const $ = s => body.querySelector(s);
    const qIn = $('#fdQty');
    function unit(){ return units[st.ui] || units[0]; }
    function quickVals(){ return unit().u==='g' ? [50,100,150,200,250] : [.5,1,1.5,2,3]; }
    function upd(fromInput){
      const u = unit();
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
      <div id="fdTCw" style="font-size:12.5px;color:var(--warn);min-height:18px;margin:-4px 2px 10px"></div>
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
      <div class="fd-sbot"><div class="fd-hint">Point the camera at the barcode</div><div class="r"><button data-a="photo">${I.photo} Photo</button><button data-a="type">${I.keys} Type number</button></div></div>
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
    });
    scanEl.querySelectorAll('input[type=file]').forEach(inp=>inp.onchange = async ()=>{
      const file = inp.files && inp.files[0]; inp.value = ''; if (!file) return;
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
      tap:`<div class="big">📷</div><h4>Ready to scan</h4><p>Tap below to turn on the camera, then point it at the barcode on the package.</p><button class="fd-start" data-a="start">${I.cam} Start camera</button>`,
      denied:`<div class="big">🔒</div><h4>Camera is blocked</h4><p>${/iphone|ipad/i.test(navigator.userAgent) ? 'On iPhone: open <b>Settings → Safari → Camera</b> and choose <b>Allow</b>, or tap <b>aA</b> in the address bar → Website Settings → Camera.' : 'Tap the lock icon next to the web address → <b>Permissions</b> → allow <b>Camera</b>, then try again.'}</p><button class="fd-start" data-a="start">${I.cam} Try again</button><br>${photoBtn}`,
      nocam:`<div class="big">📵</div><h4>No camera found</h4><p>${window.isSecureContext===false ? 'The camera only works on the secure (https) link of Jarvis.' : "This device doesn't have a camera Jarvis can use."} You can still use a photo or type the number.</p>${photoBtn}`,
      inuse:`<div class="big">📸</div><h4>Camera is busy</h4><p>Another app is using the camera. Close it and try again.</p><button class="fd-start" data-a="start">${I.cam} Try again</button>`,
      libfail:`<div class="big">📡</div><h4>Scanner needs internet once</h4><p>Connect to the internet so Jarvis can load the scanner, or type the number instead.</p><button class="fd-start" data-a="start">${I.cam} Try again</button>`,
      nophoto:`<div class="big">🤔</div><h4>Couldn't read that photo</h4><p>Try a closer, sharper photo with the whole barcode in view and good light — or type the number.</p><button class="fd-start" data-a="photo">${I.photo} Choose another photo</button><br><button class="lnk" data-a="start">Use the live camera</button>`,
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
    else if (srch.state==='error'){ const t = errText(srch.err); online = `<div class="fd-sub">Products</div><div class="fd-err"><div class="e">${srch.err&&srch.err.kind==='offline'?'📡':'⚠️'}</div><div><b>${t.t}</b><small>${t.d}</small></div><button class="btn ghost" id="fdSRetry">Retry</button></div>`; }
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
    inp.scrollIntoView({behavior:'smooth', block:'center'}); setTimeout(()=>{ try { inp.focus({preventScroll:true}); } catch(e){} }, 300);
  }

  /* ---------------- view ---------------- */
  function buildView(el){
    el.innerHTML = `
      <div class="fd-top"><div><h2>Food</h2><p class="lede">Say “I ate 2 eggs and a banana” or scan a barcode.</p></div></div>
      <div class="fd-date"><button id="fdPrev" aria-label="Previous day">${I.left}</button><div><b id="fdDateL"></b><small id="fdDateS"></small></div><button id="fdNext" aria-label="Next day">${I.right}</button></div>
      <div class="card" id="fdSum"></div>
      <div class="fd-actions"><button class="fd-scanbtn" id="fdScanBtn">${I.scan} Scan barcode</button><button class="fd-ghost" id="fdManBtn">${I.pen} Add myself</button></div>
      <div class="fd-search"><div class="search">${I.search}<input id="fdSIn" placeholder="Search food or brand" autocomplete="off" enterkeyhint="search" aria-label="Search food"><button id="fdSBtn" style="display:none">Search</button></div><div id="fdSRes"></div></div>
      <div class="section-h"><h3>Meals</h3><span id="fdMealsTot" style="color:var(--muted);font-size:13px;font-weight:600"></span></div>
      <div id="fdMeals"></div>
      <div class="section-h"><h3>Water</h3><span id="fdWaterTxt" style="color:var(--muted);font-size:13px;font-weight:600"></span></div>
      <div class="card" id="fdWater"></div>
      <div class="section-h"><h3>Last 7 days</h3><span id="fdWeekAvg" style="color:var(--muted);font-size:13px;font-weight:600"></span></div>
      <div class="card" id="fdWeek"></div>
      <p class="fd-note">Product data from Open Food Facts (free and open). Common-food values are typical estimates.</p>`;
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
      if ((b = t.closest('[data-entry]'))){ const d = getDay(viewKey); const en = d.items.find(x=>x.id===b.dataset.entry); if (en) showFood({src:en.src, name:en.name, brand:en.brand, emoji:en.emoji, img:en.img, code:en.code, units:en.units, w:wu(en.units[0]), per100:null}, {entry:en}); return; }
      if ((b = t.closest('[data-addmeal]'))){ srch.meal = b.dataset.addmeal; focusSearch(b.dataset.addmeal); J.toast(`Search or pick a food for ${MEALS.find(m=>m.id===b.dataset.addmeal).label.toLowerCase()}`); return; }
      if ((b = t.closest('#fdGoalBtn'))) return showGoal();
      if ((b = t.closest('[data-water]'))){ addWater(+b.dataset.water, viewKey); return; }
      if ((b = t.closest('[data-glass]'))){ const d = ensureDay(viewKey); const i = +b.dataset.glass; const before = d.water||0; d.water = (i+1===before) ? i : i+1; syncHabitWater(d.water-before, viewKey); J.save(); J.renderAll(); return; }
      if ((b = t.closest('[data-day]'))){ viewKey = b.dataset.day; renderDynamic(el); return; }
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
    const t = dayTotals(viewKey), goal = s.goal, left = goal - t.kcal, over = left < 0;
    q('#fdSum').innerHTML = `<div class="fd-sum">
        <div class="fd-ring" style="width:150px;height:150px">${ringSVG(t.kcal, goal, 150, 14, 'fdgV')}<div class="fd-rc"><div><b style="${over?'color:var(--warn)':''}">${N(Math.abs(left))}</b><span>${over?'kcal over':'kcal left'}</span></div></div></div>
        <div class="fd-kv">
          <div class="r"><div class="ic" style="background:rgba(245,158,11,.15)">🔥</div><div class="v"><small>Eaten</small><b>${N(t.kcal)}</b><i>kcal</i></div></div>
          <button class="r fd-goalbtn" id="fdGoalBtn" aria-label="Edit calorie goal"><div class="ic" style="background:var(--accent-soft)">🎯</div><div class="v"><small>Goal ${I.edit}</small><b>${N(goal)}</b><i>kcal</i></div></button>
          <div class="r"><div class="ic" style="background:${over?'rgba(244,63,94,.14)':'rgba(34,197,94,.14)'}">${over?'⚠️':'✅'}</div><div class="v"><small>${over?'Over by':'Left'}</small><b style="color:${over?'var(--bad)':'var(--good)'}">${N(Math.abs(left))}</b><i>kcal</i></div></div>
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
        <div class="b"><b style="${over?'color:var(--warn)':''}">${N(Math.abs(left))} kcal ${over?'over':'left'}</b><small>${N(t.kcal)} of ${N(s.goal)} eaten <span style="white-space:nowrap;margin-left:6px">💧 ${w}/${s.waterGoal}</span></small>
          <div class="mm">${MACROS.map(m=>`<i title="${m.label}"><u style="width:${Math.min(t[m.k]/macroTarget(m)*100,100)}%;background:${m.color}"></u></i>`).join('')}</div></div>
        <button class="fd-hscan" data-fd-scan aria-label="Scan a barcode">${I.scan}</button>
      </div>`;
    if (!el.dataset.wired){ el.dataset.wired = '1'; el.addEventListener('click', e=>{
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
    addWater(n){ n = +n||0; if (n>0) addWater(n, todayKey(), {noHabit:true}); return getDay(todayKey()).water||0; },
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
  function itemTotals(it){ const f = it.food; if (it.grams) return scaleN(f.n, it.grams/f.g); return scaleN(f.n, it.qty); }
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
  const NOT_FOOD = /\b(remind|reminder|note|notes|paid|pay|spent|spend|bought|buy|cost|costs|dollars?|bucks|usd|lira|lbp|euros?|budget|salary|income|habit|habits|receipt)\b|\$/;

  J.addIntent(function(said, t){
    t = t.replace(/[.]+$/,'').replace(/\s+\./g,' ').trim();
    let m;
    if (/^(?:note|take a note|new note|add a note|write down|remember)\b|\bremind(?:er)?\b/.test(t)) return null;
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
    if (/\b(?:how many|how much) (?:calories|calorie|kcal|cals)\b/.test(t) || /\b(?:calories|calorie count|kcal) (?:today|so far|left|remaining|eaten)\b/.test(t) || /\bwhat (?:did|have) i (?:eat|eaten|had)\b/.test(t) || /\bhow (?:am i|i'm) doing (?:on|with) (?:my )?(?:calories|food|diet)\b/.test(t) || /\bhow much (?:protein|carbs|fat)\b/.test(t) || /^(?:my )?calories$/.test(t)) return summaryReply(t);
    function summaryReply(t){
      const key = /\byesterday\b/.test(t) ? shiftKey(todayKey(), -1) : todayKey();
      viewKey = key; J.go('food');
      const d = getDay(key), tt = dayTotals(key);
      if (!d.items.length) return key===todayKey() ? `You haven't logged any food today. Your goal is ${N(F().goal)} calories. Say something like “I ate 2 eggs and a banana”, or scan a barcode.` : 'Nothing was logged yesterday.';
      if (/\bwhat (?:did|have) i\b/.test(t)){
        const byMeal = MEALS.map(mm=>{ const it = d.items.filter(x=>x.meal===mm.id); if (!it.length) return null; const cnt = {}; it.forEach(x=>{ const n = x.name.toLowerCase().replace(/\s*\(.*?\)/g,''); cnt[n] = (cnt[n]||0) + 1; }); return `${mm.id==='snack'?'Snacks':mm.label}: ${listJoin(Object.entries(cnt).map(([n,c])=>c>1?`${n} ${c===2?"twice":c+" times"}`:n))}`; }).filter(Boolean);
        return `${byMeal.join('. ')}. ${summarySay(key)}`;
      }
      const mq = t.match(/\bhow much (protein|carbs?|fat)\b/);
      if (mq){
        const mm = MACROS.find(x=>x.label.toLowerCase().startsWith(mq[1].slice(0,4))), v = tt[mm.k], tg = macroTarget(mm);
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

  J.addSuggestions(['I ate 2 eggs and a banana', 'How many calories today?', 'Scan a barcode', 'I drank a glass of water', 'How many calories in a shawarma?']);

  // test hooks (harmless in production)
  window.__food = {parseFoods, interpret, checksumOK, fromOFF, openScanner, closeScanner, lookupAndShow, runSearch, handleScanResult, decodeFile, F, dayTotals, todayKey};
})();
