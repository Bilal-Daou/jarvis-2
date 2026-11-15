/* =========================================================
   Jarvis feature: Habits & Goals
   - Habits with schedules, targets, streaks, rings, heatmaps
   - Long-term goals with progress entries and pace tracking
   Owns: features/habits.js
   ========================================================= */
(function(){
'use strict';
const J = window.Jarvis;
if (!J) return;
try {

/* ---------------------------------------------------------
   DATA
   --------------------------------------------------------- */
const DEFAULTS = {habits:[], goals:[], v:1};
function st(){
  const s = J.store('habits', DEFAULTS);
  if (!Array.isArray(s.habits)) s.habits = [];
  if (!Array.isArray(s.goals)) s.goals = [];
  s.habits.forEach(h=>{ if (!h.hist || typeof h.hist!=='object') h.hist = {}; if (!Array.isArray(h.days)) h.days = [0,1,2,3,4,5,6]; });
  s.goals.forEach(g=>{ if (!Array.isArray(g.entries)) g.entries = []; if (!Array.isArray(g.hit)) g.hit = []; });
  return s;
}
const habits = () => st().habits.filter(h=>!h.archived).sort((a,b)=>(a.order||0)-(b.order||0) || (a.createdAt||0)-(b.createdAt||0));
const goals = () => st().goals.slice().sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
const findHabit = id => st().habits.find(h=>h.id===id);
const findGoal = id => st().goals.find(g=>g.id===id);
const commit = () => { J.save(); J.renderAll(); };

/* ---------------------------------------------------------
   DATES (local time, YYYY-MM-DD keys)
   --------------------------------------------------------- */
const p2 = n => String(n).padStart(2,'0');
const dkey = d => { d = new Date(d); return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate()); };
const kdate = k => { const [y,m,d] = k.split('-').map(Number); return new Date(y, m-1, d); };
const day0 = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const today0 = () => day0(new Date());
const addD = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); x.setHours(0,0,0,0); return x; };
const wkStart = d => { const x = day0(d); x.setDate(x.getDate()-((x.getDay()+6)%7)); return x; }; // Monday
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DOW1 = ['S','M','T','W','T','F','S'];
const MON_ORDER = [1,2,3,4,5,6,0];
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

/* ---------------------------------------------------------
   HABIT MATH
   --------------------------------------------------------- */
const isCount = h => h.kind==='count';
const tgt = h => isCount(h) ? Math.max(+h.target||1, 0.0001) : 1;
const val = (h,k) => +(h.hist[k]||0);
const isDone = (h,k) => val(h,k) >= tgt(h) - 1e-9;
const pctOf = (h,k) => Math.max(0, Math.min(1, val(h,k)/tgt(h)));
const isWeekly = h => h.sched==='weekly';
function schedOn(h, d){ return h.sched==='days' ? h.days.includes(d.getDay()) : true; }
function startOf(h){
  let s = h.created ? kdate(h.created) : today0();
  for (const k in h.hist){ if (h.hist[k] > 0 && /^\d{4}-\d\d-\d\d$/.test(k)){ const d = kdate(k); if (d < s) s = d; } }
  return s;
}
function weekCount(h, ws){ let n = 0; for (let i=0;i<7;i++) if (isDone(h, dkey(addD(ws,i)))) n++; return n; }
const times = h => Math.max(1, Math.min(7, +h.times||3));

/** current streak: days (daily / weekday schedules) or weeks (X times a week).
    Today not done yet does NOT break the streak; unscheduled days are skipped. */
function streak(h){
  const start = startOf(h), t0 = today0();
  if (isWeekly(h)){
    let w = wkStart(t0), n = 0; const sw = wkStart(start);
    if (weekCount(h,w) >= times(h)) n++;
    w = addD(w,-7);
    for (let i=0; w >= sw && i<600; i++, w = addD(w,-7)){ if (weekCount(h,w) >= times(h)) n++; else break; }
    return n;
  }
  let n = 0;
  if (isDone(h, dkey(t0))) n++;
  let d = addD(t0,-1);
  for (let i=0; d >= start && i<4000; i++, d = addD(d,-1)){
    if (isDone(h, dkey(d))) n++;
    else if (schedOn(h,d)) break;
  }
  return n;
}
function bestStreak(h){
  const start = startOf(h), t0 = today0(); let run = 0, best = 0;
  if (isWeekly(h)){
    const cw = wkStart(t0);
    for (let w = wkStart(start), i=0; w <= cw && i<600; w = addD(w,7), i++){
      if (weekCount(h,w) >= times(h)) run++; else if (w < cw) run = 0;
      best = Math.max(best, run);
    }
    return best;
  }
  for (let d = new Date(start), i=0; d <= t0 && i<4000; d = addD(d,1), i++){
    if (isDone(h, dkey(d))) run++; else if (schedOn(h,d) && d < t0) run = 0;
    best = Math.max(best, run);
  }
  return best;
}
/** completion rate over the last 30 days (or 8 weeks for weekly habits) */
function rate(h){
  const start = startOf(h), t0 = today0(); let num = 0, den = 0;
  if (isWeekly(h)){
    const cw = wkStart(t0), sw = wkStart(start);
    for (let i=0;i<8;i++){
      const w = addD(cw,-7*i); if (w < sw) break;
      const met = weekCount(h,w) >= times(h);
      if (+w === +cw && !met) continue;                 // this week still open
      if (+w === +sw && !met && +start > +sw) continue; // partial first week
      den++; if (met) num++;
    }
    return den ? num/den : null;
  }
  for (let i=0;i<30;i++){
    const d = addD(t0,-i); if (d < start) break;
    if (!schedOn(h,d)) continue;
    const dn = isDone(h, dkey(d));
    if (i===0 && !dn) continue; // today still open
    den++; if (dn) num++;
  }
  return den ? num/den : null;
}
const totalDone = h => Object.keys(h.hist).filter(k=>isDone(h,k)).length;
/** is the habit "on the list" for today? */
function dueToday(h){
  const k = dkey(today0());
  if (isWeekly(h)) return isDone(h,k) || weekCount(h, wkStart(today0())) < times(h);
  return schedOn(h, today0());
}
function todayStats(){
  const k = dkey(today0()); const list = habits().filter(dueToday);
  return {list, done: list.filter(h=>isDone(h,k)).length, total: list.length};
}
/** share of scheduled (daily/weekday) habits done on a given day, null if none */
function dayShare(d){
  const k = dkey(d); let n = 0, den = 0;
  habits().forEach(h=>{ if (isWeekly(h) || startOf(h) > d || !schedOn(h,d)) return; den++; if (isDone(h,k)) n++; });
  return den ? n/den : null;
}
function perfectDays(){ let n = 0; for (let i=0;i<30;i++){ const s = dayShare(addD(today0(),-i)); if (s===1) n++; } return n; }

/* ---------------------------------------------------------
   FORMATTING
   --------------------------------------------------------- */
const MONEY_RE = /^(dollars?|bucks|usd|\$|euros?|€|eur|pounds? sterling|£|gbp|lira|lbp|l£|aed|dirhams?|sar|riyals?|money)$/i;
const isMoney = u => MONEY_RE.test(String(u||'').trim());
const num = n => (+n).toLocaleString('en-US', {maximumFractionDigits:2});
function qty(n, unit){
  if (isMoney(unit)) return J.fmt(+n);
  if (!unit) return num(n);
  let u = unit;
  if (+n === 1){ if (/sses$/i.test(u)) u = u.slice(0,-2); else if (/[^s]s$/i.test(u) && u.length > 3) u = u.slice(0,-1); }
  return num(n)+' '+u;
}
function schedText(h){
  if (h.sched==='weekly') return `${times(h)}× a week`;
  if (h.sched==='days'){
    const d = h.days.slice().sort((a,b)=>MON_ORDER.indexOf(a)-MON_ORDER.indexOf(b));
    if (d.length===7) return 'Every day';
    if (d.length===5 && [1,2,3,4,5].every(x=>d.includes(x))) return 'Weekdays';
    if (d.length===2 && d.includes(0) && d.includes(6)) return 'Weekends';
    return d.map(x=>DOW[x]).join(' · ');
  }
  return 'Every day';
}
function goalText(h){ return isCount(h) ? `${qty(h.target, h.unit)}` : 'Done / not done'; }
const stripEmoji = s => String(s).replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu,'').replace(/\s{2,}/g,' ').replace(/\s+([.,!?])/g,'$1').trim();
const lc = s => String(s||'').toLowerCase();
const plural = (n, w) => `${num(n)} ${w}${+n===1?'':'s'}`;

/* ---------------------------------------------------------
   PALETTE, TEMPLATES, EMOJI GUESSING
   --------------------------------------------------------- */
const PAL = [['#6d5dfc','#22d3ee'],['#0ea5e9','#22d3ee'],['#22c55e','#a3e635'],['#14b8a6','#4ade80'],['#f59e0b','#facc15'],['#f97316','#f43f5e'],['#f43f5e','#fb7185'],['#ec4899','#a855f7'],['#8b5cf6','#ec4899'],['#6366f1','#a78bfa']];
const c2of = c => (PAL.find(p=>p[0]===c)||[c,c])[1];
const TEMPLATES = [
  {key:'water',    name:'Drink water', emoji:'💧', color:'#0ea5e9', kind:'count', target:8, unit:'glasses', step:1, sched:'daily'},
  {key:'workout',  name:'Workout',     emoji:'💪', color:'#f43f5e', kind:'check', sched:'weekly', times:4},
  {key:'read',     name:'Read',        emoji:'📚', color:'#8b5cf6', kind:'count', target:10, unit:'pages', step:10, sched:'daily'},
  {key:'meditate', name:'Meditate',    emoji:'🧘', color:'#14b8a6', kind:'count', target:10, unit:'minutes', step:10, sched:'daily'},
  {key:'walk',     name:'Walk',        emoji:'🚶', color:'#22c55e', kind:'count', target:8000, unit:'steps', step:8000, sched:'daily'},
  {key:'sugar',    name:'No sugar',    emoji:'🍬', color:'#ec4899', kind:'check', sched:'daily'},
  {key:'sleep',    name:'Sleep by 11', emoji:'😴', color:'#6366f1', kind:'check', sched:'daily'},
  {key:'pray',     name:'Pray',        emoji:'🤲', color:'#f59e0b', kind:'count', target:5, unit:'prayers', step:1, sched:'daily'},
  {key:'journal',  name:'Journal',     emoji:'✍️', color:'#f97316', kind:'check', sched:'daily'}
];
const TPL_SUB = {water:'8 glasses a day', workout:'4 times a week', read:'10 pages a day', meditate:'10 minutes a day', walk:'8,000 steps a day', sugar:'Every day', sleep:'Every night', pray:'5 prayers a day', journal:'Every day'};
/* synonyms: canonical key -> words that mean it */
const SYN = {
  workout:['workout','workouts','work out','worked out','gym','exercise','exercised','exercising','training','train','trained','lift','lifting','lifted','fitness','sport','pushups','push ups'],
  water:['water','drink','drank','hydrate','hydration','glasses','glass'],
  read:['read','reading','book','books','pages','page'],
  meditate:['meditate','meditation','meditated','meditating','mindful','mindfulness','breathe','breathing'],
  walk:['walk','walking','walked','steps','step'],
  run:['run','running','ran','jog','jogging','jogged','cardio'],
  sugar:['sugar','sweets','sweet','candy','dessert'],
  sleep:['sleep','bed','bedtime','slept'],
  pray:['pray','prayer','prayers','prayed','salah','salat','namaz'],
  journal:['journal','journaling','journaled','diary','journalling'],
  study:['study','studied','studying','learn','learning'],
  stretch:['stretch','stretching','stretched','yoga'],
  vitamins:['vitamin','vitamins','pills','supplements','medicine','meds'],
  save:['save','saving','savings','money','fund','dollars','invest','investing'],
  weight:['lose','weight','kg','kilos','kilo','lbs','pounds','fat'],
  code:['code','coding','programming'],
  language:['language','spanish','french','english','arabic','duolingo']
};
const EMOJI_GUESS = [
  [/water|hydrat|drink/, '💧'],[/work ?out|gym|exercis|lift|fitness|push ?ups?|train/, '💪'],[/read|book|page/, '📚'],[/meditat|mindful|breath/, '🧘'],
  [/walk|steps?/, '🚶'],[/run|jog/, '🏃'],[/sugar|sweet|candy/, '🍬'],[/sleep|bed/, '😴'],[/pray|salah|salat|quran/, '🤲'],[/journal|diary|writ/, '✍️'],
  [/study|learn|course/, '🎓'],[/stretch|yoga/, '🤸'],[/vitamin|pill|medic|supplement/, '💊'],[/floss|teeth|brush/, '🦷'],[/clean|tidy/, '🧹'],
  [/code|program/, '💻'],[/guitar|piano|music|practice/, '🎸'],[/language|spanish|french|arabic|duolingo/, '🗣️'],[/phone|screen|social/, '📵'],
  [/smok|cigar/, '🚭'],[/cook|meal/, '🍳'],[/fruit|veg|salad|eat/, '🥗'],[/call|mom|dad|family/, '📞'],[/save|money|budget|invest/, '💰'],[/sun|morning|wake/, '☀️'],[/gratitud|thank/, '🙏']
];
const guessEmoji = name => { const n = lc(name); for (const [re,e] of EMOJI_GUESS) if (re.test(n)) return e; return '✨'; };
const EMOJIS = ['💧','💪','📚','🧘','🚶','🏃','🍬','😴','🤲','✍️','🎓','🤸','💊','🦷','🧹','💻','🎸','🗣️','📵','🚭','🍳','🥗','📞','💰','☀️','🙏','🌱','❤️','🧠','🎯'];
const GOAL_EMOJIS = ['💰','📚','⚖️','🏃','🎓','✈️','🏠','🚗','💍','🎯','💪','🌍'];

function stem(w){ return w.replace(/(ings?|ed|s)$/,''); }
function words(s){ return lc(s).replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w && !/^(my|the|a|an|to|of|for|and|i|today|daily|habit|goal|some|do|did|done|it)$/.test(w)); }
function canon(s){
  const t = ' '+lc(s).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ')+' '; const out = new Set();
  for (const [k, list] of Object.entries(SYN)) if (list.some(w=>t.includes(' '+w+' '))) out.add(k);
  return out;
}
function matchScore(query, name){
  const q = lc(query).trim(), n = lc(name).replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  if (!q || !n) return 0;
  if (q===n) return 100;
  let s = 0;
  if (n.includes(q) || q.includes(n)) s += 30;
  const qw = words(q).map(stem), nw = words(n).map(stem);
  qw.forEach(w=>{ if (w.length>1 && nw.includes(w)) s += 12; });
  const qc = canon(q), nc = canon(n);
  qc.forEach(k=>{ if (nc.has(k)) s += 20; });
  return s;
}
function bestMatch(list, query, nameOf){
  let best = null, bs = 0;
  list.forEach(x=>{ const sc = matchScore(query, nameOf(x)); if (sc > bs){ bs = sc; best = x; } });
  return bs >= 12 ? best : null;
}
const matchHabit = q => bestMatch(habits(), q, h=>h.name+' '+(h.unit||''));
const matchGoal = q => bestMatch(goals(), q, g=>g.title+' '+(g.unit||''));
function templateFor(name){
  const c = canon(name);
  return TEMPLATES.find(t=>c.has(t.key)) || null;
}
function niceStep(target, unit){
  if (/^(glass|glasses|cups?|times?|servings?|prayers?|reps?|pills?|bottles?)$/i.test(unit||'')) return 1;
  return target;
}

/* ---------------------------------------------------------
   HABIT ACTIONS
   --------------------------------------------------------- */
let lastAction = null;
function makeHabit(o){
  const h = Object.assign({
    id: J.uid(), name:'Habit', emoji:'✨', color: PAL[0][0], kind:'check', target:1, unit:'', step:1,
    sched:'daily', days:[0,1,2,3,4,5,6], times:3, reminder:'', reminderId:'', hist:{},
    created: dkey(today0()), createdAt: Date.now(), order: Date.now()
  }, o);
  if (h.kind==='count'){ h.target = Math.max(+h.target||1, 0.01); h.step = +h.step>0 ? +h.step : niceStep(h.target, h.unit); }
  else { h.target = 1; h.step = 1; h.unit = ''; }
  return h;
}
function addHabit(o){
  const h = makeHabit(o); st().habits.push(h); syncReminder(h); return h;
}
function fromTemplate(t, over){
  const o = Object.assign({}, t); delete o.key; return addHabit(Object.assign(o, over||{}));
}
function nextAt(hhmm){
  const [H,M] = hhmm.split(':').map(Number); const d = new Date(); d.setHours(H, M||0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate()+1); return d.getTime();
}
function syncReminder(h){
  try {
    const db = J.db; if (!Array.isArray(db.reminders)) return;
    if (h.reminderId){ db.reminders = db.reminders.filter(r=>r.id!==h.reminderId); h.reminderId = ''; }
    if (h.reminder && /^\d{1,2}:\d{2}$/.test(h.reminder) && !h.archived){
      const r = J.addReminder({text: `${h.name}${isCount(h)?` · ${qty(h.target,h.unit)}`:''}`, at: nextAt(h.reminder), repeat:'daily', habitId: h.id});
      h.reminderId = r.id;
    }
  } catch(e){ console.error('habits reminder', e); }
}
function removeHabit(h){
  const s = st(); const idx = s.habits.indexOf(h); if (idx<0) return;
  s.habits.splice(idx,1);
  const remBackup = h.reminderId ? (J.db.reminders||[]).find(r=>r.id===h.reminderId) : null;
  if (h.reminderId) J.db.reminders = (J.db.reminders||[]).filter(r=>r.id!==h.reminderId);
  if (ui.detail===h.id) ui.detail = null;
  commit();
  J.toast(`Deleted ${h.name}`, ()=>{ s.habits.splice(idx,0,h); if (remBackup) J.db.reminders.push(remBackup); commit(); });
}
const STREAK_LINES = {
  3: n=>`Three days in a row on ${n}. That's how habits start.`,
  7: n=>`A full week of ${n}! You're building something real.`,
  14: n=>`Two weeks straight on ${n}. Seriously impressive.`,
  21: n=>`21 days of ${n}. They say that's when it sticks.`,
  30: n=>`30 days of ${n}! A whole month. You're unstoppable.`,
  50: n=>`50 days of ${n}. That's elite discipline.`,
  100: n=>`100 days of ${n}! Legendary.`,
  365: n=>`A full year of ${n}. Incredible.`
};
const WEEK_LINES = {3:n=>`Three weeks in a row hitting your ${n} goal. Keep it rolling.`, 4:n=>`A full month of hitting your ${n} goal every week!`, 8:n=>`Eight straight weeks of ${n}. Rock solid.`, 12:n=>`Twelve weeks of ${n}. That's a lifestyle now.`};
/** set or change today's value. Returns info about what happened. */
function setValue(h, k, v){
  const wasDone = isDone(h,k), beforeAll = todayStats();
  const prev = val(h,k);
  v = Math.max(0, Math.round(v*100)/100);
  if (v) h.hist[k] = v; else delete h.hist[k];
  if (v !== prev) lastAction = {hid:h.id, k, prev};
  const nowDone = isDone(h,k);
  const info = {h, prev, v, wasDone, nowDone, completed: !wasDone && nowDone, line:'', perfect:false};
  if (info.completed && k===dkey(today0())){
    const s = streak(h); info.streak = s;
    const L = isWeekly(h) ? (weekCount(h, wkStart(today0()))===times(h) ? WEEK_LINES[s] : null) : STREAK_LINES[s];
    if (L) info.line = L(h.name.toLowerCase());
    const after = todayStats();
    if (after.total > 1 && after.done===after.total && beforeAll.done < beforeAll.total) info.perfect = true;
  }
  return info;
}
function tapHabit(h){
  const k = dkey(today0());
  if (isCount(h)){
    const cur = val(h,k), step = +h.step||1;
    if (isDone(h,k) && step >= tgt(h)) return setValue(h, k, 0); // one-tap habits toggle back off
    return setValue(h, k, cur + step);                            // small steps keep counting past the goal
  }
  return setValue(h, k, isDone(h,k) ? 0 : 1);
}

/* ---------------------------------------------------------
   GOAL MATH + ACTIONS
   --------------------------------------------------------- */
const gProg = g => g.entries.reduce((s,e)=>s+(+e.amount||0), 0);
const gPct = g => g.target ? Math.max(0, Math.min(1, gProg(g)/g.target)) : 0;
function gPace(g){
  const pct = gPct(g);
  if (pct >= 1) return {k:'done', label:'Completed', cls:'green'};
  if (!g.deadline) return {k:'none', label:'No deadline', cls:''};
  const start = day0(g.createdAt||Date.now()).getTime(), end = kdate(g.deadline).getTime() + 864e5 - 1, now = Date.now();
  if (now > end) return {k:'over', label:'Past deadline', cls:'red'};
  const exp = Math.max(0, Math.min(1, (now - start)/Math.max(end - start, 864e5)));
  const ex = Math.round(exp*100);
  if (pct >= exp + 0.1) return {k:'ahead', label:'Ahead', cls:'green', exp:ex};
  if (pct >= exp - 0.05) return {k:'track', label:'On track', cls:'green', exp:ex};
  return {k:'behind', label:'Behind', cls:'red', exp:ex};
}
function daysLeft(g){ if (!g.deadline) return null; return Math.round((kdate(g.deadline) - today0())/864e5); }
function gQty(g, n){ return qty(n, g.unit); }
/** "$2,500 of $5,000" or "3 of 12 books" */
function ofText(g){ return isMoney(g.unit) ? `${J.fmt(gProg(g))} of ${J.fmt(g.target)}` : `${num(gProg(g))} of ${qty(g.target, g.unit)}`; }
function roundNice(v){ return v >= 10 ? Math.ceil(v) : v >= 0.1 ? Math.ceil(v*10)/10 : Math.ceil(v*100)/100; }
function needPer(g){
  const d0 = daysLeft(g); const rem = g.target - gProg(g);
  if (d0===null || d0 < 0 || rem <= 0) return '';
  const dl = d0 + 1; // days left including today
  if (dl === 1) return `${gQty(g, roundNice(rem))} today`;
  if (dl <= 14) return `${gQty(g, roundNice(rem/dl))} a day`;
  if (dl <= 120) return `${gQty(g, roundNice(rem/(dl/7)))} a week`;
  return `${gQty(g, roundNice(rem/(dl/30.4)))} a month`;
}
function goalWord(g){ const c = canon(g.title+' '+g.unit); return c.has('save') ? 'savings' : c.has('read') ? 'reading' : c.has('weight') ? 'weight' : c.has('run') ? 'running' : (words(g.title)[0]||'goal'); }
function addGoal(o){
  const g = Object.assign({id:J.uid(), title:'Goal', emoji:'🎯', color:PAL[0][0], target:100, unit:'', deadline:'', entries:[], hit:[], createdAt:Date.now()}, o);
  st().goals.push(g); return g;
}
const MILESTONES = [25,50,75,100];
function addProgress(g, amount, note){
  const before = gPct(g)*100;
  g.entries.push({id:J.uid(), amount:+amount, note:note||'', at:Date.now()});
  const after = gPct(g)*100;
  let hit = null;
  MILESTONES.forEach(m=>{ if (before < m && after >= m && !g.hit.includes(m)){ hit = m; g.hit.push(m); } });
  return {g, before, after, hit};
}
function milestoneLine(g, m){
  if (m===100) return `You did it! ${g.title} is complete. Huge congratulations.`;
  if (m===75) return `75 percent of the way on ${g.title}. The finish line is close.`;
  if (m===50) return `Halfway there on ${g.title}! Keep going.`;
  return `A quarter of the way on ${g.title}. Great start.`;
}

/* ---------------------------------------------------------
   UI STATE + EFFECTS
   --------------------------------------------------------- */
const ui = {tab:'today', detail:null, goalDetail:null};
try { const t = localStorage.getItem('jarvis2-habits-tab'); if (t && /^(today|all|goals)$/.test(t)) ui.tab = t; } catch(e){}
const setTab = t => { ui.tab = t; ui.detail = null; ui.goalDetail = null; try { localStorage.setItem('jarvis2-habits-tab', t); } catch(e){} };
const prevPct = {};   // ctx:id -> last rendered pct (drives ring animation)
const pops = {};      // habit id -> timestamp of completion (check pop animation)
let ANIM = false;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){ return false; } };
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p||15); } catch(e){} };

const CONF_COLORS = ['#6d5dfc','#22d3ee','#22c55e','#f59e0b','#f43f5e','#ec4899','#facc15'];
function burstAt(x, y, colors, n){
  if (reduced()) return;
  const layer = document.createElement('div'); layer.className = 'hb-fx'; document.body.appendChild(layer);
  n = n || 18;
  for (let i=0;i<n;i++){
    const p = document.createElement('i'); const a = (Math.PI*2*i/n) + Math.random()*.4; const dist = 38 + Math.random()*34;
    const c = colors[i % colors.length]; p.style.background = c; p.style.left = x+'px'; p.style.top = y+'px';
    if (i%3===0) p.style.borderRadius = '50%'; else if (i%3===1) { p.style.width='4px'; p.style.height='10px'; }
    layer.appendChild(p);
    try { p.animate([{transform:'translate(-50%,-50%) scale(1) rotate(0)', opacity:1},{transform:`translate(calc(-50% + ${Math.cos(a)*dist}px), calc(-50% + ${Math.sin(a)*dist}px)) scale(.4) rotate(${Math.random()*360}deg)`, opacity:0}], {duration:650+Math.random()*250, easing:'cubic-bezier(.2,.8,.2,1)', fill:'forwards'}); } catch(e){}
  }
  const ring = document.createElement('b'); ring.style.left = x+'px'; ring.style.top = y+'px'; ring.style.borderColor = colors[0]; layer.appendChild(ring);
  try { ring.animate([{transform:'translate(-50%,-50%) scale(.3)', opacity:.9},{transform:'translate(-50%,-50%) scale(1.6)', opacity:0}], {duration:600, easing:'ease-out', fill:'forwards'}); } catch(e){}
  setTimeout(()=>layer.remove(), 1100);
}
function confettiRain(){
  if (reduced()) return;
  const layer = document.createElement('div'); layer.className = 'hb-fx'; document.body.appendChild(layer);
  const W = window.innerWidth, H = window.innerHeight;
  for (let i=0;i<70;i++){
    const p = document.createElement('i'); const x = Math.random()*W; p.style.left = x+'px'; p.style.top = '-12px';
    p.style.background = CONF_COLORS[i%CONF_COLORS.length]; p.style.width = (5+Math.random()*5)+'px'; p.style.height = (8+Math.random()*8)+'px';
    layer.appendChild(p);
    const drift = (Math.random()-.5)*160;
    try { p.animate([{transform:'translate(0,0) rotate(0)', opacity:1},{transform:`translate(${drift}px, ${H*.95}px) rotate(${(Math.random()-.5)*900}deg)`, opacity:.15}], {duration:1600+Math.random()*1400, delay:Math.random()*350, easing:'cubic-bezier(.25,.6,.4,1)', fill:'forwards'}); } catch(e){}
  }
  setTimeout(()=>layer.remove(), 3600);
}
function celebrate(info, el){
  if (!info) return;
  if (info.completed || (info.v > info.prev)) buzz(15);
  if (info.completed){
    pops[info.h.id] = Date.now();
    if (el){ const r = el.getBoundingClientRect(); burstAt(r.left + r.width/2, r.top + r.height/2, [info.h.color, c2of(info.h.color), '#facc15', '#ffffff']); }
  }
}
/** effects after a tap in the UI (voice path speaks via its reply instead) */
function afterUi(info, el){
  celebrate(info, el);
  commit();
  if (info.wasDone && !info.nowDone){ const h = info.h, k = dkey(today0()), pv = info.prev; J.toast(`${h.name} unchecked`, ()=>{ h.hist[k] = pv; commit(); }); return; }
  if (!info.completed) return;
  if (info.perfect){ setTimeout(confettiRain, 250); J.toast('🎉 Perfect day — every habit done!'); J.speak(`That's everything for today, ${J.settings.name}. Perfect day!` + (info.line?' '+info.line:'')); }
  else if (info.line){ J.toast('🔥 '+info.line); J.speak(info.line); }
  else J.toast(`${info.h.emoji} ${info.h.name} done${info.streak>1?` · 🔥 ${info.streak}${isWeekly(info.h)?' wk':''}`:''}`, ()=>{ undoLast(); });
}
function undoLast(){
  if (!lastAction) return false; const h = findHabit(lastAction.hid); if (!h) return false;
  if (lastAction.prev) h.hist[lastAction.k] = lastAction.prev; else delete h.hist[lastAction.k];
  lastAction = null; commit(); return h;
}

/* ---------------------------------------------------------
   RINGS
   --------------------------------------------------------- */
function ringSVG(o){
  // o: {pct, c1, c2, size, sw, gid, key, track}
  const size = o.size, sw = o.sw, r = (size - sw)/2, C = 2*Math.PI*r, cx = size/2;
  const pct = Math.max(0, Math.min(1, o.pct)); const to = C*(1-pct);
  let from = to, anim = '';
  if (ANIM && o.key){
    const p = prevPct[o.key];
    if (p !== undefined && Math.abs(p - pct) > 1e-6){ from = C*(1-p); anim = ` data-hb-to="${to.toFixed(2)}"`; }
    prevPct[o.key] = pct;
  }
  const c1 = o.c1, c2 = o.c2;
  const stops = c1.startsWith('var') ? `<stop offset="0" style="stop-color:${c1}"/><stop offset="1" style="stop-color:${c2}"/>` : `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>`;
  const hide = (pct<=0 && from>=C-0.01) ? ' style="opacity:0"' : '';
  return `<svg class="hb-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="${o.gid}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs>`+
    `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" ${c1.startsWith('var')?`style="stroke:${c1}"`:`stroke="${c1}"`} stroke-opacity="${o.track||.16}" stroke-width="${sw}"/>`+
    `<circle class="hb-arc" cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="url(#${o.gid})" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${from.toFixed(2)}" transform="rotate(-90 ${cx} ${cx})"${anim}${hide}/></svg>`;
}
function runAnims(el){
  const arcs = el.querySelectorAll('.hb-arc[data-hb-to]'); if (!arcs.length) return;
  void el.offsetWidth;
  requestAnimationFrame(()=>requestAnimationFrame(()=>arcs.forEach(a=>{ a.style.opacity = ''; a.style.strokeDashoffset = a.dataset.hbTo; })));
}
const popping = h => ANIM && pops[h.id] && Date.now() - pops[h.id] < 1200;
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const DOTS = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

function habitRing(h, ctx, size){
  const k = dkey(today0()), done = isDone(h,k), p = pctOf(h,k);
  const sw = size >= 80 ? 9 : 6;
  return `<div class="hb-ring ${done?'is-done':''} ${popping(h)?'hb-pop':''}" style="width:${size}px;height:${size}px;--hc:${h.color}">
    ${ringSVG({pct:p, c1:h.color, c2:c2of(h.color), size, sw, gid:`hbg-${ctx}-${h.id}`, key:`${ctx}:${h.id}`})}
    <span class="hb-emo" style="font-size:${Math.round(size*.34)}px">${h.emoji}</span>
    <span class="hb-tick" style="background:${h.color}">${CHECK}</span>
  </div>`;
}
function ringSub(h){
  const k = dkey(today0());
  if (isWeekly(h)){ const wc = weekCount(h, wkStart(today0())); return `${wc}/${times(h)} this week${isDone(h,k)?' ✓':''}`; }
  if (isCount(h)){ const v = val(h,k); return isDone(h,k) ? `${qty(Math.max(v, tgt(h)),h.unit)} ✓` : `${num(v)} / ${qty(h.target,h.unit)}`; }
  return isDone(h,k) ? 'Done ✓' : 'Tap to check';
}

/* ---------------------------------------------------------
   RENDER: VIEW
   --------------------------------------------------------- */
function heroHTML(){
  const s = todayStats(); const pct = s.total ? s.done/s.total : 0;
  const best = habits().reduce((b,h)=>{ const v = isWeekly(h)?0:streak(h); return v > b.v ? {v, h} : b; }, {v:0, h:null});
  const left = s.total - s.done;
  const line = !s.total ? 'Nothing scheduled today. Enjoy the rest day.' : left===0 ? 'Perfect day! Everything is done.' : s.done===0 ? `${left} to go. Let's get the first one.` : left===1 ? 'Just one more to go. Finish strong!' : `${left} to go. You've got this.`;
  const t0 = today0(); const ws = wkStart(t0);
  const week = [0,1,2,3,4,5,6].map(i=>{ const d = addD(ws,i); const fut = d > t0; const sh = fut ? null : dayShare(d); const isT = +d===+t0;
    return `<div class="hb-wd ${isT?'is-today':''} ${fut?'is-fut':''}"><span>${DOW1[d.getDay()]}</span><i style="--p:${sh===null?0:Math.round(sh*100)}%" class="${sh===1?'full':''}">${sh===1?CHECK:''}</i></div>`; }).join('');
  return `<div class="hb-hero card">
    <div class="hb-hero-top">
      <div class="hb-big">
        ${ringSVG({pct, c1:'var(--accent)', c2:'var(--accent2)', size:118, sw:12, gid:'hbg-hero', key:'hero', track:.18})}
        <div class="hb-big-c"><b>${s.done}<small>/${s.total}</small></b><span>today</span></div>
      </div>
      <div class="hb-hero-txt">
        <div class="hb-kicker">${new Date().toLocaleDateString([], {weekday:'long', month:'short', day:'numeric'})}</div>
        <div class="hb-hero-h">${s.total ? `${s.done} of ${s.total} done today` : 'Rest day'}</div>
        <div class="hb-hero-l">${line}</div>
        <div class="hb-hero-chips">
          ${best.h && best.v>0 ? `<span class="hb-pill">🔥 ${best.v} day${best.v===1?'':'s'} · ${J.esc(best.h.name)}</span>` : ''}
          <span class="hb-pill">⭐ ${perfectDays()} perfect day${perfectDays()===1?'':'s'}</span>
        </div>
      </div>
    </div>
    <div class="hb-week">${week}</div>
  </div>`;
}
function tileHTML(h, dim){
  const s = streak(h);
  return `<div class="hb-tile ${dim?'is-dim':''}" data-hb-ring="${h.id}" role="button" tabindex="0" aria-label="${J.esc(h.name)}: ${J.esc(ringSub(h))}">
    <button class="hb-more" data-hb-menu="${h.id}" aria-label="Options for ${J.esc(h.name)}">${DOTS}</button>
    ${habitRing(h, 'v', 92)}
    <div class="hb-tname">${J.esc(h.name)}</div>
    <div class="hb-tsub">${J.esc(ringSub(h))}</div>
    <div class="hb-tstreak ${s?'':'is-zero'}">${s?`🔥 ${s}${isWeekly(h)?' wk':''}`:'Start a streak'}</div>
  </div>`;
}
function templatesHTML(only){
  const have = new Set(habits().map(h=>[...canon(h.name)].join(',')));
  const list = TEMPLATES.filter(t=>!only || !habits().some(h=>canon(h.name).has(t.key)));
  if (!list.length) return '';
  return `<div class="hb-tpls">${list.map(t=>`<button class="hb-tpl" data-hb-tpl="${t.key}" style="--hc:${t.color}"><span class="hb-tpl-ic">${t.emoji}</span><b>${t.name}</b><small>${TPL_SUB[t.key]}</small><span class="hb-tpl-add">${PLUS}</span></button>`).join('')}</div>`;
}
function emptyHTML(){
  const demo = [['💧','#0ea5e9',.75],['💪','#f43f5e',1],['📚','#8b5cf6',.4]];
  return `<div class="hb-intro card">
    <div class="hb-intro-rings">${demo.map(([e,c,p],i)=>`<div class="hb-ring ${p>=1?'is-done':''}" style="width:72px;height:72px;--hc:${c}">${ringSVG({pct:p, c1:c, c2:c2of(c), size:72, sw:7, gid:'hbg-demo'+i})}<span class="hb-emo" style="font-size:24px">${e}</span><span class="hb-tick" style="background:${c}">${CHECK}</span></div>`).join('')}</div>
    <h3>Build habits that stick</h3>
    <p>Pick a few to start. Tap a ring each time you do it, or just tell me — <b>“I drank 2 glasses of water”</b>.</p>
  </div>
  <div class="section-h"><h3>Quick start</h3><span class="hb-hint">One tap to add</span></div>
  ${templatesHTML(false)}
  <button class="btn hb-wide" data-hb-new="1">${PLUS} Create your own habit</button>`;
}
function todayHTML(){
  const hs = habits();
  if (!hs.length) return emptyHTML();
  const due = hs.filter(dueToday), rest = hs.filter(h=>!dueToday(h));
  return `${heroHTML()}
    <div class="section-h"><h3>Today</h3><span class="hb-hint">Tap to check · hold for options</span></div>
    ${due.length ? `<div class="hb-grid">${due.map(h=>tileHTML(h,false)).join('')}</div>` : `<div class="empty"><div class="e-ic">🌤️</div>No habits scheduled today.</div>`}
    ${rest.length ? `<div class="section-h"><h3>Not today</h3><span class="hb-hint">Rest day or weekly goal met</span></div><div class="hb-grid">${rest.map(h=>tileHTML(h,true)).join('')}</div>` : ''}
    <button class="btn ghost hb-wide" data-hb-new="1">${PLUS} New habit</button>
    ${hs.length < 6 && templatesHTML(true) ? `<div class="section-h"><h3>Add more</h3><span class="hb-hint">One tap to add</span></div>${templatesHTML(true)}` : ''}`;
}
function dots7(h){
  const t0 = today0();
  return `<div class="hb-dots">${[6,5,4,3,2,1,0].map(i=>{ const d = addD(t0,-i), k = dkey(d), dn = isDone(h,k), p = pctOf(h,k), sc = schedOn(h,d) && d >= startOf(h);
    return `<span class="${dn?'on':''} ${!sc&&!dn?'off':''} ${i===0?'today':''}" style="--hc:${h.color};--p:${Math.round(p*100)}%"><em>${DOW1[d.getDay()]}</em><i></i></span>`; }).join('')}</div>`;
}
function allHTML(){
  const hs = habits();
  if (!hs.length) return emptyHTML();
  return `<div class="list">${hs.map(h=>{ const s = streak(h), r = rate(h);
    return `<div class="item hb-row" data-hb-open="${h.id}">
      <div class="ic" style="background:${h.color}22">${h.emoji}</div>
      <div class="body"><div class="title">${J.esc(h.name)}</div>
        <div class="meta"><span>${schedText(h)}</span>${isCount(h)?`<span>· ${qty(h.target,h.unit)}</span>`:''}${h.reminder?`<span>· ⏰ ${fmtTime(h.reminder)}</span>`:''}</div>
        ${dots7(h)}
      </div>
      <div class="hb-row-r"><b>${s?'🔥 '+s:'—'}</b><small>${r===null?'new':Math.round(r*100)+'%'}</small></div>
    </div>`; }).join('')}</div>
    <button class="btn ghost hb-wide" data-hb-new="1">${PLUS} New habit</button>
    ${templatesHTML(true) ? `<div class="section-h"><h3>More ideas</h3><span class="hb-hint">One tap to add</span></div>${templatesHTML(true)}` : ''}`;
}
function fmtTime(hhmm){ const [H,M] = hhmm.split(':').map(Number); const d = new Date(); d.setHours(H,M||0,0,0); return d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}); }

function detailHTML(h){
  const k = dkey(today0()), t0 = today0(), s = streak(h), b = bestStreak(h), r = rate(h), unit = isWeekly(h) ? 'wk' : 'days';
  // 5-week calendar
  const cw = wkStart(t0), first = addD(cw, -28), start = startOf(h);
  let cal = MON_ORDER.map(d=>`<div class="hb-cal-h">${DOW1[d]}</div>`).join('');
  for (let i=0;i<35;i++){
    const d = addD(first,i), dk = dkey(d), fut = d > t0, p = pctOf(h,dk), dn = isDone(h,dk), sc = schedOn(h,d), pre = d < start;
    cal += `<button class="hb-cal ${dn?'on':''} ${fut?'fut':''} ${+d===+t0?'today':''} ${(!sc||pre)&&!dn?'off':''}" ${fut?'disabled':''} data-hb-day="${dk}" style="--p:${dn?1:p*.85}" aria-label="${d.toDateString()}${dn?', done':''}">${d.getDate()}</button>`;
  }
  // 18-week heatmap
  const hw = addD(cw, -7*17); let heat = '';
  for (let w=0; w<18; w++) for (let i=0;i<7;i++){ const d = addD(hw, w*7+i), dk = dkey(d), fut = d > t0;
    heat += `<i class="${fut?'fut':''}" style="--p:${fut?0:(isDone(h,dk)?1:pctOf(h,dk)*.7)}" title="${dk}"></i>`; }
  return `<div class="hb-dhead">
      <button class="icon-btn" data-hb-back="1" aria-label="Back">${BACK}</button>
      <div class="hb-dtitle"><b>${J.esc(h.name)}</b><small>${schedText(h)}${isCount(h)?' · '+qty(h.target,h.unit):''}${h.reminder?' · ⏰ '+fmtTime(h.reminder):''}</small></div>
      <button class="icon-btn" data-hb-menu="${h.id}" aria-label="Options">${DOTS}</button>
    </div>
    <div class="card hb-dcard" style="--hc:${h.color}">
      <div class="hb-tile hb-dring" data-hb-ring="${h.id}" role="button" tabindex="0">${habitRing(h,'d',150)}</div>
      <div class="hb-dtoday">${J.esc(ringSub(h))}</div>
      ${isCount(h) ? `<div class="hb-steps"><button class="btn ghost" data-hb-dec="${h.id}" aria-label="Minus">−</button><button class="btn" data-hb-ring-btn="${h.id}" style="background:${h.color}">+ ${qty(h.step,h.unit)}</button><button class="btn ghost" data-hb-log="${h.id}">Log amount</button></div>`
        : `<div class="hb-steps"><button class="btn" data-hb-ring-btn="${h.id}" style="background:${isDone(h,k)?'var(--card)':h.color};${isDone(h,k)?'color:var(--text);border:1px solid var(--line)':''}">${isDone(h,k)?'Undo today':'Mark done'}</button></div>`}
    </div>
    <div class="hb-stats">
      <div class="card stat"><div class="label">Current streak</div><div class="val">🔥 ${s}<small> ${isWeekly(h)?(s===1?'week':'weeks'):(s===1?'day':'days')}</small></div></div>
      <div class="card stat"><div class="label">Best streak</div><div class="val">🏆 ${b}<small> ${isWeekly(h)?(b===1?'week':'weeks'):(b===1?'day':'days')}</small></div></div>
      <div class="card stat"><div class="label">${isWeekly(h)?'Weeks hit (8 wk)':'Success (30 days)'}</div><div class="val">${r===null?'—':Math.round(r*100)+'%'}</div><div class="progress"><i style="width:${r===null?0:Math.round(r*100)}%;background:linear-gradient(90deg,${h.color},${c2of(h.color)})"></i></div></div>
      <div class="card stat"><div class="label">Times done</div><div class="val">✅ ${totalDone(h)}</div></div>
    </div>
    <div class="section-h"><h3>Last 5 weeks</h3><span class="hb-hint">Tap a day to fix it</span></div>
    <div class="card"><div class="hb-calg" style="--hc:${h.color}">${cal}</div></div>
    <div class="section-h"><h3>Last 18 weeks</h3></div>
    <div class="card" style="--hc:${h.color}"><div class="hb-heat">${heat}</div>
      <div class="hb-heat-l"><span>Less</span><i style="--p:0"></i><i style="--p:.3"></i><i style="--p:.6"></i><i style="--p:1"></i><span>More</span></div></div>
    <div class="hb-dactions"><button class="btn ghost" data-hb-edit="${h.id}">Edit habit</button><button class="btn danger" data-hb-del="${h.id}">Delete</button></div>`;
}

/* ---- goals ---- */
const GOAL_TPLS = [
  {title:'Save 5,000 dollars', emoji:'💰', color:'#22c55e', target:5000, unit:'dollars', months:7},
  {title:'Read 12 books', emoji:'📚', color:'#8b5cf6', target:12, unit:'books', endYear:true},
  {title:'Lose 5 kg', emoji:'⚖️', color:'#0ea5e9', target:5, unit:'kg', months:3},
  {title:'Run 100 km', emoji:'🏃', color:'#f97316', target:100, unit:'km', months:3}
];
function goalCard(g){
  const p = gProg(g), pct = gPct(g), pace = gPace(g), dl = daysLeft(g), np = needPer(g);
  const key = 'g:'+g.id; let from = pct, anim = '';
  if (ANIM){ const pv = prevPct[key]; if (pv!==undefined && Math.abs(pv-pct)>1e-6){ from = pv; anim = ` data-hb-w="${(pct*100).toFixed(2)}"`; } prevPct[key] = pct; }
  return `<div class="card hb-goal" data-hb-gopen="${g.id}" style="--hc:${g.color}">
    <div class="hb-goal-top">
      <div class="ic hb-gic" style="background:${g.color}22">${g.emoji}</div>
      <div class="body"><div class="title">${J.esc(g.title)}</div>
        <div class="meta">${g.deadline?`<span>by ${kdate(g.deadline).toLocaleDateString([], {month:'short', day:'numeric', year: kdate(g.deadline).getFullYear()!==new Date().getFullYear()?'numeric':undefined})}</span>`:''}${dl!==null && pct<1 ? `<span>· ${dl>0?plural(dl,'day')+' left':dl===0?'due today':'ended'}</span>`:''}</div></div>
      <span class="tag ${pace.cls}">${pace.k==='done'?'🎉 ':''}${pace.label}</span>
    </div>
    <div class="hb-gbar"><i style="width:${(from*100).toFixed(2)}%"${anim}></i>${pace.exp!==undefined && pct<1 ? `<em style="left:${pace.exp}%" title="Where you should be"></em>`:''}</div>
    <div class="hb-goal-nums"><b>${gQty(g,p)}</b><span>of ${gQty(g,g.target)}</span><strong>${Math.round(pct*100)}%</strong></div>
    ${np && pct<1 ? `<div class="hb-goal-need">${pace.k==='behind'?'To catch up: ':'Keep pace: '}about <b>${np}</b></div>`:''}
    <div class="hb-goal-act"><button class="btn" data-hb-gadd="${g.id}" style="background:${g.color}">${PLUS} Add progress</button><button class="mini" data-hb-gmenu="${g.id}" aria-label="Goal options">${DOTS}</button></div>
  </div>`;
}
function goalsHTML(){
  const gs = goals();
  const head = gs.length ? (()=>{ const done = gs.filter(g=>gPct(g)>=1).length, on = gs.filter(g=>['track','ahead'].includes(gPace(g).k)).length, beh = gs.filter(g=>gPace(g).k==='behind').length;
    return `<div class="hb-gsum"><div class="card stat"><div class="label">Goals</div><div class="val">${gs.length}</div></div><div class="card stat"><div class="label">On track</div><div class="val" style="color:var(--good)">${on}</div></div><div class="card stat"><div class="label">${beh?'Behind':'Done'}</div><div class="val" style="color:${beh?'var(--bad)':'var(--good)'}">${beh||done}</div></div></div>`; })() : '';
  return `${head}
    ${gs.length ? `<div class="list">${gs.map(goalCard).join('')}</div>` : `<div class="hb-intro card"><div style="font-size:42px">🎯</div><h3>Set a big goal</h3><p>Track something bigger, like savings, books or weight. Say <b>“Add a goal to save 5000 dollars by June”</b>.</p></div>`}
    <button class="btn ${gs.length?'ghost':''} hb-wide" data-hb-gnew="1">${PLUS} New goal</button>
    ${gs.length < 3 ? `<div class="section-h"><h3>Ideas</h3><span class="hb-hint">One tap to start</span></div><div class="hb-gtpls">${GOAL_TPLS.filter(t=>!gs.some(g=>g.title===t.title)).map((t,i)=>`<button class="chip" data-hb-gtpl="${GOAL_TPLS.indexOf(t)}">${t.emoji} ${t.title}</button>`).join('')}</div>` : ''}`;
}
function goalDetailHTML(g){
  const p = gProg(g), pct = gPct(g), pace = gPace(g), dl = daysLeft(g), np = needPer(g);
  const ent = g.entries.slice().sort((a,b)=>b.at-a.at);
  return `<div class="hb-dhead">
      <button class="icon-btn" data-hb-back="1" aria-label="Back">${BACK}</button>
      <div class="hb-dtitle"><b>${J.esc(g.title)}</b><small>${g.deadline?'Deadline '+kdate(g.deadline).toLocaleDateString([], {month:'long', day:'numeric', year:'numeric'}):'No deadline'}</small></div>
      <button class="icon-btn" data-hb-gmenu="${g.id}" aria-label="Options">${DOTS}</button>
    </div>
    <div class="card hb-dcard" style="--hc:${g.color}">
      <div class="hb-ring" style="width:150px;height:150px;margin:0 auto">${ringSVG({pct, c1:g.color, c2:c2of(g.color), size:150, sw:13, gid:'hbg-gd-'+g.id, key:'gd:'+g.id})}<span class="hb-emo hb-gpct"><b>${Math.round(pct*100)}%</b><small>${g.emoji}</small></span></div>
      <div class="hb-dtoday">${ofText(g)}</div>
      <div style="text-align:center;margin-top:6px"><span class="tag ${pace.cls}">${pace.label}</span>${pace.exp!==undefined&&pct<1?` <span class="hb-hint">· you'd ideally be at ${pace.exp}%</span>`:''}</div>
      <div class="hb-steps"><button class="btn" data-hb-gadd="${g.id}" style="background:${g.color}">${PLUS} Add progress</button></div>
    </div>
    <div class="hb-stats">
      <div class="card stat"><div class="label">Remaining</div><div class="val">${gQty(g, Math.max(0, g.target-p))}</div></div>
      <div class="card stat"><div class="label">Days left</div><div class="val">${dl===null?'—':Math.max(dl,0)}</div></div>
      ${np&&pct<1?`<div class="card stat" style="grid-column:1/-1"><div class="label">To finish on time</div><div class="val" style="font-size:18px">About ${np}</div></div>`:''}
    </div>
    <div class="section-h"><h3>Milestones</h3></div>
    <div class="hb-miles">${MILESTONES.map(m=>`<div class="${pct*100>=m?'on':''}" style="--hc:${g.color}"><b>${pct*100>=m?CHECK:m+'%'}</b><span>${m===100?'Goal!':gQty(g, Math.round(g.target*m)/100)}</span></div>`).join('')}</div>
    <div class="section-h"><h3>History</h3><span class="hb-hint">${ent.length} entr${ent.length===1?'y':'ies'}</span></div>
    ${ent.length ? `<div class="list">${ent.map(e=>`<div class="item"><div class="ic" style="background:${g.color}22">${+e.amount>=0?'➕':'➖'}</div><div class="body"><div class="title">${+e.amount>=0?'+':''}${gQty(g,e.amount)}</div><div class="meta">${e.note?J.esc(e.note)+' · ':''}${J.whenText(e.at)}</div></div><button class="mini" data-hb-gentry="${g.id}:${e.id}" aria-label="Delete entry">${J.icons.trash}</button></div>`).join('')}</div>` : `<div class="empty"><div class="e-ic">📈</div>No progress yet. Tap <b>Add progress</b> or say “add 500 to my savings goal”.</div>`}
    <div class="hb-dactions"><button class="btn ghost" data-hb-gedit="${g.id}">Edit goal</button><button class="btn danger" data-hb-gdel="${g.id}">Delete</button></div>`;
}

function viewHTML(){
  if (ui.detail){ const h = findHabit(ui.detail); if (h) return detailHTML(h); ui.detail = null; }
  if (ui.goalDetail){ const g = findGoal(ui.goalDetail); if (g) return goalDetailHTML(g); ui.goalDetail = null; }
  const tabs = [['today','Today'],['all','All habits'],['goals','Goals']];
  return `<h2>Habits &amp; Goals</h2><p class="lede">“I worked out” · “I read 15 pages” · “How are my habits?”</p>
    <div class="seg hb-tabs">${tabs.map(([k,l])=>`<button class="${ui.tab===k?'active':''}" data-hb-tab="${k}">${l}</button>`).join('')}</div>
    ${ui.tab==='goals' ? goalsHTML() : ui.tab==='all' ? allHTML() : todayHTML()}`;
}
function paint(el, build){
  ANIM = false; const sig = build();
  if (el._hbSig === sig) return;
  el._hbSig = sig; ANIM = true; el.innerHTML = build(); ANIM = false;
  runAnims(el);
  const bars = el.querySelectorAll('[data-hb-w]');
  if (bars.length){ void el.offsetWidth; requestAnimationFrame(()=>requestAnimationFrame(()=>bars.forEach(b=>b.style.width = b.dataset.hbW+'%'))); }
}

/* ---------------------------------------------------------
   RENDER: HOME CARD
   --------------------------------------------------------- */
function homeHTML(){
  const hs = habits();
  if (!hs.length){
    return `<div class="section-h"><h3>Habits</h3><button class="link" data-go="habits">Open</button></div>
      <div class="card hb-home-empty" data-go="habits"><div class="hb-mini-rings">${['💧','💪','📚'].map((e,i)=>`<span style="--hc:${['#0ea5e9','#f43f5e','#8b5cf6'][i]}">${e}</span>`).join('')}</div><div><b>Start a habit</b><small>Water, workout, reading… one tap to begin.</small></div></div>`;
  }
  const s = todayStats(); const due = s.list;
  const goalsLine = (()=>{ const gs = goals().filter(g=>gPct(g)<1); if (!gs.length) return ''; const g = gs[0], pace = gPace(g);
    return `<div class="hb-home-goal" data-hb-hgoal="${g.id}"><span>${g.emoji}</span><div class="hb-gbar sm" style="--hc:${g.color}"><i style="width:${(gPct(g)*100).toFixed(1)}%"></i></div><b>${Math.round(gPct(g)*100)}%</b>${pace.k==='behind'?'<span class="tag red">Behind</span>':''}</div>`; })();
  return `<div class="section-h"><h3>Habits</h3><button class="link" data-go="habits">${s.total ? `${s.done} of ${s.total} done` : 'Open'}</button></div>
    <div class="card hb-home">
      <div class="hb-home-sum">
        <div class="hb-ring" style="width:52px;height:52px">${ringSVG({pct: s.total? s.done/s.total : 0, c1:'var(--accent)', c2:'var(--accent2)', size:52, sw:6, gid:'hbg-hsum', key:'hsum', track:.18})}<span class="hb-emo" style="font-size:13px;font-weight:800">${s.total?Math.round(s.done/s.total*100)+'%':'—'}</span></div>
        <div><b>${!s.total?'Rest day':s.done===s.total?'All done today 🎉':`${s.done} of ${s.total} done today`}</b><small>${!s.total?'Nothing scheduled today':s.done===s.total?'Perfect day. See you tomorrow.':'Tap a ring to check it off'}</small></div>
      </div>
      ${due.length ? `<div class="hb-home-row">${due.map(h=>`<div class="hb-hitem" data-hb-ring="${h.id}" role="button" tabindex="0" aria-label="${J.esc(h.name)}">${habitRing(h,'h',58)}<span>${J.esc(h.name)}</span></div>`).join('')}</div>` : ''}
      ${goalsLine}
    </div>`;
}

/* ---------------------------------------------------------
   EVENTS
   --------------------------------------------------------- */
function bind(root){
  if (root._hbBound) return; root._hbBound = true;
  let lpTimer = null, lpFired = false, sx = 0, sy = 0;
  root.addEventListener('pointerdown', e=>{
    const r = e.target.closest('[data-hb-ring]'); if (!r || e.target.closest('[data-hb-menu]')) return;
    lpFired = false; sx = e.clientX; sy = e.clientY; clearTimeout(lpTimer);
    r.classList.add('is-press');
    lpTimer = setTimeout(()=>{ lpFired = true; r.classList.remove('is-press'); buzz(10); openMenu(findHabit(r.dataset.hbRing)); }, 520);
  });
  const cancel = ()=>{ clearTimeout(lpTimer); root.querySelectorAll('.is-press').forEach(x=>x.classList.remove('is-press')); };
  root.addEventListener('pointerup', cancel); root.addEventListener('pointercancel', cancel); root.addEventListener('pointerleave', cancel);
  root.addEventListener('pointermove', e=>{ if (Math.abs(e.clientX-sx)>10 || Math.abs(e.clientY-sy)>10) cancel(); });
  root.addEventListener('contextmenu', e=>{ if (e.target.closest('[data-hb-ring]')) e.preventDefault(); });
  root.addEventListener('keydown', e=>{ if ((e.key==='Enter'||e.key===' ') && e.target.matches('[data-hb-ring]')){ e.preventDefault(); e.target.click(); } });
  root.addEventListener('click', e=>{
    const t = e.target; let x;
    if ((x = t.closest('[data-hb-menu]'))){ e.stopPropagation(); return openMenu(findHabit(x.dataset.hbMenu)); }
    if ((x = t.closest('[data-hb-ring]'))){
      if (lpFired){ lpFired = false; return; }
      const h = findHabit(x.dataset.hbRing); if (!h) return;
      return afterUi(tapHabit(h), x.querySelector('.hb-ring') || x);
    }
    if ((x = t.closest('[data-hb-ring-btn]'))){ const h = findHabit(x.dataset.hbRingBtn); const ring = root.querySelector('.hb-dring .hb-ring'); return afterUi(tapHabit(h), ring || x); }
    if ((x = t.closest('[data-hb-dec]'))){ const h = findHabit(x.dataset.hbDec), k = dkey(today0()); setValue(h, k, val(h,k) - (+h.step||1)); return commit(); }
    if ((x = t.closest('[data-hb-log]'))) return openLog(findHabit(x.dataset.hbLog));
    if ((x = t.closest('[data-hb-tab]'))){ setTab(x.dataset.hbTab); return J.renderAll(); }
    if ((x = t.closest('[data-hb-tpl]'))){
      const tp = TEMPLATES.find(z=>z.key===x.dataset.hbTpl); if (!tp) return;
      const r = x.getBoundingClientRect(); burstAt(r.left+r.width/2, r.top+r.height/2, [tp.color, c2of(tp.color), '#facc15'], 12); buzz(12);
      const h = fromTemplate(tp); commit();
      return J.toast(`Added ${h.emoji} ${h.name}`, ()=>{ const s = st(); s.habits = s.habits.filter(z=>z!==h); syncRemoved(h); commit(); });
    }
    if ((x = t.closest('[data-hb-new]'))) return openEditor(null);
    if ((x = t.closest('[data-hb-open]'))){ ui.detail = x.dataset.hbOpen; J.renderAll(); return window.scrollTo({top:0}); }
    if ((x = t.closest('[data-hb-back]'))){ ui.detail = null; ui.goalDetail = null; J.renderAll(); return window.scrollTo({top:0}); }
    if ((x = t.closest('[data-hb-edit]'))) return openEditor(findHabit(x.dataset.hbEdit));
    if ((x = t.closest('[data-hb-del]'))) return removeHabit(findHabit(x.dataset.hbDel));
    if ((x = t.closest('[data-hb-day]'))){
      const h = findHabit(ui.detail); if (!h) return; const k = x.dataset.hbDay; const prev = val(h,k);
      const info = setValue(h, k, isDone(h,k) ? 0 : tgt(h)); if (info.nowDone) buzz(15);
      commit(); return J.toast(`${kdate(k).toLocaleDateString([], {weekday:'short', month:'short', day:'numeric'})}: ${info.nowDone?'marked done':'cleared'}`, ()=>{ if (prev) h.hist[k] = prev; else delete h.hist[k]; commit(); });
    }
    if ((x = t.closest('[data-hb-gadd]'))){ e.stopPropagation(); return openProgress(findGoal(x.dataset.hbGadd)); }
    if ((x = t.closest('[data-hb-gmenu]'))){ e.stopPropagation(); return openGoalMenu(findGoal(x.dataset.hbGmenu)); }
    if ((x = t.closest('[data-hb-gedit]'))) return openGoalEditor(findGoal(x.dataset.hbGedit));
    if ((x = t.closest('[data-hb-gdel]'))) return removeGoal(findGoal(x.dataset.hbGdel));
    if ((x = t.closest('[data-hb-gentry]'))){ const [gid, eid] = x.dataset.hbGentry.split(':'); const g = findGoal(gid); const i = g.entries.findIndex(z=>z.id===eid); const en = g.entries[i]; const hit0 = g.hit.slice(); g.entries.splice(i,1); g.hit = MILESTONES.filter(m=>gPct(g)*100>=m); commit(); return J.toast('Entry removed', ()=>{ g.entries.splice(i,0,en); g.hit = hit0; commit(); }); }
    if ((x = t.closest('[data-hb-gnew]'))) return openGoalEditor(null);
    if ((x = t.closest('[data-hb-gtpl]'))){ const tp = GOAL_TPLS[+x.dataset.hbGtpl]; return openGoalEditor(null, tp); }
    if ((x = t.closest('[data-hb-gopen]'))){ ui.goalDetail = x.dataset.hbGopen; J.renderAll(); return window.scrollTo({top:0}); }
    if ((x = t.closest('[data-hb-hgoal]'))){ setTab('goals'); ui.goalDetail = x.dataset.hbHgoal; J.go('habits'); return J.renderAll(); }
  });
}
function syncRemoved(h){ if (h.reminderId) J.db.reminders = (J.db.reminders||[]).filter(r=>r.id!==h.reminderId); }
function removeGoal(g){
  const s = st(); const i = s.goals.indexOf(g); if (i<0) return; s.goals.splice(i,1); if (ui.goalDetail===g.id) ui.goalDetail = null; commit();
  J.toast(`Deleted ${g.title}`, ()=>{ s.goals.splice(i,0,g); commit(); });
}

/* ---------------------------------------------------------
   MODALS
   --------------------------------------------------------- */
const $m = id => document.getElementById(id);
function sheet(title, items){
  J.modal(`<div class="hb-sheet"><h4>${title}</h4>${items.map((it,i)=>`<button class="hb-sheet-b ${it.danger?'danger':''}" data-i="${i}"><span>${it.ic}</span>${it.label}</button>`).join('')}<button class="btn ghost hb-wide" id="hbSheetX" style="margin-top:8px">Cancel</button></div>`);
  document.querySelectorAll('.hb-sheet-b').forEach(b=>b.onclick = ()=>{ J.closeModal(); setTimeout(()=>items[+b.dataset.i].fn(), 30); });
  $m('hbSheetX').onclick = J.closeModal;
}
function openMenu(h){
  if (!h) return; const k = dkey(today0());
  const items = [{ic:'📊', label:'Details & streaks', fn:()=>{ ui.detail = h.id; J.go('habits'); J.renderAll(); }}];
  if (isCount(h)) items.push({ic:'➕', label:'Log an amount…', fn:()=>openLog(h)});
  if (val(h,k) > 0) items.push({ic:'↩️', label: isCount(h) ? `Remove ${qty(h.step,h.unit)}` : 'Undo today', fn:()=>{ setValue(h, k, isCount(h) ? val(h,k)-(+h.step||1) : 0); commit(); }});
  else if (!isCount(h)) items.push({ic:'✅', label:'Mark done', fn:()=>afterUi(tapHabit(h), null)});
  items.push({ic:'✏️', label:'Edit habit', fn:()=>openEditor(h)});
  items.push({ic:'🗑️', label:'Delete habit', danger:true, fn:()=>removeHabit(h)});
  sheet(`${h.emoji} ${J.esc(h.name)}`, items);
}
function openLog(h){
  if (!h) return; const k = dkey(today0());
  const quick = [1, 2, 5, 10, Math.round(tgt(h)/2), tgt(h)].filter((v,i,a)=>v>0 && a.indexOf(v)===i).sort((a,b)=>a-b).slice(0,5);
  J.modal(`<div class="hb-m"><h4>${h.emoji} Log ${J.esc(h.name.toLowerCase())}</h4>
    <p class="hb-mp">Today so far: <b>${qty(val(h,k), h.unit)}</b> of ${qty(h.target,h.unit)}</p>
    <div class="hb-quick">${quick.map(q=>`<button class="chip" data-q="${q}">+${num(q)}</button>`).join('')}</div>
    <input id="hbAmt" type="number" inputmode="decimal" placeholder="How many ${J.esc(h.unit||'')}?">
    <div class="row"><button class="btn ghost" id="hbX">Cancel</button><button class="btn" id="hbOk">Add</button></div></div>`);
  document.querySelectorAll('.hb-quick [data-q]').forEach(b=>b.onclick=()=>{ $m('hbAmt').value = b.dataset.q; });
  $m('hbX').onclick = J.closeModal;
  const ok = ()=>{ const a = parseFloat($m('hbAmt').value); if (!a) return; J.closeModal(); const ring = document.querySelector(`#v-habits [data-hb-ring="${h.id}"] .hb-ring`); afterUi(setValue(h, k, val(h,k)+a), ring); };
  $m('hbOk').onclick = ok; $m('hbAmt').onkeydown = e=>{ if (e.key==='Enter') ok(); };
  setTimeout(()=>$m('hbAmt').focus(), 60);
}
const UNITS = ['glasses','minutes','pages','steps','times','km','hours','reps','prayers','cups'];
function openEditor(h){
  const isNew = !h;
  const d = h ? JSON.parse(JSON.stringify(h)) : {name:'', emoji:'✨', color:PAL[0][0], kind:'check', target:8, unit:'glasses', step:1, sched:'daily', days:[1,2,3,4,5], times:3, reminder:''};
  if (!d.days || d.days.length===7) d.days = d.sched==='days' ? d.days : [1,2,3,4,5];
  let emojiTouched = !isNew;
  const segBtns = (id, opts, cur) => `<div class="seg hb-mseg" id="${id}">${opts.map(([v,l])=>`<button type="button" data-v="${v}" class="${cur===v?'active':''}">${l}</button>`).join('')}</div>`;
  J.modal(`<div class="hb-m"><h4>${isNew?'New habit':'Edit habit'}</h4><div class="hb-mscroll">
    <div class="hb-name-row"><button type="button" class="hb-emo-btn" id="hbEmoBtn" aria-label="Icon">${d.emoji}</button><input id="hbName" placeholder="e.g. Drink water" value="${J.esc(d.name)}" maxlength="40"></div>
    <div class="hb-lbl">Icon</div><div class="hb-emojis" id="hbEmojis">${EMOJIS.map(e=>`<button type="button" class="${e===d.emoji?'on':''}" data-e="${e}">${e}</button>`).join('')}</div>
    <div class="hb-lbl">Color</div><div class="hb-colors" id="hbColors">${PAL.map(([c,c2])=>`<button type="button" class="${c===d.color?'on':''}" data-c="${c}" style="background:linear-gradient(135deg,${c},${c2})" aria-label="Color"></button>`).join('')}</div>
    <div class="hb-lbl">Daily goal</div>${segBtns('hbKind', [['check','Just do it'],['count','Reach a number']], d.kind)}
    <div id="hbCountRow" class="hb-row2" ${d.kind==='count'?'':'hidden'}>
      <div><small>Target</small><input id="hbTarget" type="number" inputmode="decimal" min="1" value="${d.kind==='count'?d.target:8}"></div>
      <div><small>Unit</small><input id="hbUnit" list="hbUnitList" value="${J.esc(d.kind==='count'?d.unit:'glasses')}" placeholder="glasses"><datalist id="hbUnitList">${UNITS.map(u=>`<option value="${u}">`).join('')}</datalist></div>
      <div><small>Each tap adds</small><input id="hbStep" type="number" inputmode="decimal" min="0" value="${d.kind==='count'?d.step:1}"></div>
    </div>
    <div class="hb-lbl">How often</div>${segBtns('hbSched', [['daily','Every day'],['days','Some days'],['weekly','Times a week']], d.sched)}
    <div id="hbDays" class="hb-days" ${d.sched==='days'?'':'hidden'}>${MON_ORDER.map(x=>`<button type="button" data-d="${x}" class="${d.days.includes(x)?'on':''}">${DOW[x].slice(0,2)}</button>`).join('')}</div>
    <div id="hbTimes" class="hb-stepper" ${d.sched==='weekly'?'':'hidden'}><button type="button" id="hbTm">−</button><b id="hbTv">${times(d)}</b><span>times a week</span><button type="button" id="hbTp">+</button></div>
    <div class="hb-lbl">Reminder</div>
    <div class="hb-rem"><button type="button" class="hb-toggle ${d.reminder?'on':''}" id="hbRemT" aria-label="Reminder on or off"><i></i></button><span id="hbRemTxt">${d.reminder?'Remind me every day at':'No reminder'}</span><input id="hbRem" type="time" value="${d.reminder||'09:00'}" ${d.reminder?'':'hidden'}></div>
    <div class="hb-err" id="hbErr"></div>
  </div>
  <div class="row"><button class="btn ghost" id="hbX">Cancel</button><button class="btn" id="hbOk">${isNew?'Add habit':'Save'}</button></div></div>`);
  const seg = (id, fn) => $m(id).querySelectorAll('button').forEach(b=>b.onclick=()=>{ $m(id).querySelectorAll('button').forEach(x=>x.classList.toggle('active', x===b)); fn(b.dataset.v); });
  seg('hbKind', v=>{ d.kind = v; $m('hbCountRow').hidden = v!=='count'; });
  seg('hbSched', v=>{ d.sched = v; $m('hbDays').hidden = v!=='days'; $m('hbTimes').hidden = v!=='weekly'; });
  $m('hbDays').querySelectorAll('button').forEach(b=>b.onclick=()=>{ const x = +b.dataset.d; d.days = d.days.includes(x) ? d.days.filter(z=>z!==x) : [...d.days, x]; b.classList.toggle('on'); });
  $m('hbTm').onclick = ()=>{ d.times = Math.max(1, times(d)-1); $m('hbTv').textContent = d.times; };
  $m('hbTp').onclick = ()=>{ d.times = Math.min(7, times(d)+1); $m('hbTv').textContent = d.times; };
  const setEmoji = e => { d.emoji = e; $m('hbEmoBtn').textContent = e; $m('hbEmojis').querySelectorAll('button').forEach(b=>b.classList.toggle('on', b.dataset.e===e)); };
  $m('hbEmojis').querySelectorAll('button').forEach(b=>b.onclick=()=>{ emojiTouched = true; setEmoji(b.dataset.e); });
  $m('hbEmoBtn').onclick = ()=>$m('hbEmojis').scrollIntoView({block:'nearest', behavior:'smooth'});
  $m('hbColors').querySelectorAll('button').forEach(b=>b.onclick=()=>{ d.color = b.dataset.c; $m('hbColors').querySelectorAll('button').forEach(x=>x.classList.toggle('on', x===b)); });
  $m('hbName').oninput = ()=>{ if (!emojiTouched){ const g = guessEmoji($m('hbName').value); if (g !== d.emoji) setEmoji(g); } };
  $m('hbRemT').onclick = ()=>{ const on = !$m('hbRemT').classList.contains('on'); $m('hbRemT').classList.toggle('on', on); $m('hbRem').hidden = !on; $m('hbRemTxt').textContent = on ? 'Remind me every day at' : 'No reminder'; };
  $m('hbTarget').oninput = ()=>{ const tv = parseFloat($m('hbTarget').value)||1; if (isNew) $m('hbStep').value = niceStep(tv, $m('hbUnit').value); };
  $m('hbUnit').oninput = ()=>{ const tv = parseFloat($m('hbTarget').value)||1; if (isNew) $m('hbStep').value = niceStep(tv, $m('hbUnit').value); };
  $m('hbX').onclick = J.closeModal;
  $m('hbOk').onclick = ()=>{
    const name = J.cap($m('hbName').value.trim().replace(/\s+/g,' '));
    const err = m => { $m('hbErr').textContent = m; $m('hbErr').classList.add('show'); };
    if (!name) return err('Give your habit a name.');
    if (habits().some(x=>x!==h && lc(x.name)===lc(name))) return err('You already have a habit with that name.');
    if (d.sched==='days' && !d.days.length) return err('Pick at least one day.');
    const o = {name, emoji:d.emoji, color:d.color, kind:d.kind, sched:d.sched, days: d.sched==='days' ? d.days.slice() : [0,1,2,3,4,5,6], times: times(d), reminder: $m('hbRemT').classList.contains('on') ? $m('hbRem').value : ''};
    if (d.kind==='count'){ o.target = parseFloat($m('hbTarget').value); if (!(o.target>0)) return err('Set a target above zero.'); o.unit = $m('hbUnit').value.trim(); o.step = parseFloat($m('hbStep').value) || niceStep(o.target, o.unit); }
    J.closeModal();
    if (isNew){ const nh = addHabit(o); commit(); J.toast(`Added ${nh.emoji} ${nh.name}`); }
    else { Object.assign(h, o); if (h.kind!=='count'){ h.target = 1; h.step = 1; h.unit = ''; } syncReminder(h); commit(); J.toast('Habit saved'); }
  };
  if (isNew) setTimeout(()=>$m('hbName').focus(), 60);
}
function openGoalMenu(g){
  if (!g) return;
  sheet(`${g.emoji} ${J.esc(g.title)}`, [
    {ic:'📊', label:'Details & history', fn:()=>{ ui.goalDetail = g.id; J.go('habits'); J.renderAll(); }},
    {ic:'➕', label:'Add progress', fn:()=>openProgress(g)},
    {ic:'✏️', label:'Edit goal', fn:()=>openGoalEditor(g)},
    {ic:'🗑️', label:'Delete goal', danger:true, fn:()=>removeGoal(g)}
  ]);
}
function openProgress(g){
  if (!g) return; const money = isMoney(g.unit);
  const rem = Math.max(0, g.target - gProg(g));
  const quick = (money ? [50,100,250,500,1000] : g.target <= 20 ? [1,2,3,5] : [Math.round(g.target/20), Math.round(g.target/10), Math.round(g.target/4)]).filter((v,i,a)=>v>0 && a.indexOf(v)===i);
  J.modal(`<div class="hb-m"><h4>${g.emoji} Add progress</h4>
    <p class="hb-mp">${J.esc(g.title)} · <b>${gQty(g,gProg(g))}</b> of ${gQty(g,g.target)}${rem?` · ${gQty(g,rem)} to go`:''}</p>
    <div class="hb-quick">${quick.map(q=>`<button class="chip" data-q="${q}">+${money?J.fmt(q):num(q)}</button>`).join('')}</div>
    <input id="hbAmt" type="number" inputmode="decimal" placeholder="Amount${g.unit&&!money?' ('+J.esc(g.unit)+')':''}">
    <input id="hbNote" placeholder="Note (optional)" maxlength="60">
    <p class="hb-mp" style="font-size:12px">Tip: use a minus number to correct a mistake.</p>
    <div class="row"><button class="btn ghost" id="hbX">Cancel</button><button class="btn" id="hbOk">Add</button></div></div>`);
  document.querySelectorAll('.hb-quick [data-q]').forEach(b=>b.onclick=()=>{ $m('hbAmt').value = b.dataset.q; });
  $m('hbX').onclick = J.closeModal;
  const ok = ()=>{ const a = parseFloat($m('hbAmt').value); if (!a) return; J.closeModal(); goalProgressUi(g, a, $m('hbNote').value.trim()); };
  $m('hbOk').onclick = ok; $m('hbAmt').onkeydown = e=>{ if (e.key==='Enter') ok(); };
  setTimeout(()=>$m('hbAmt').focus(), 60);
}
function goalProgressUi(g, a, note){
  const r = addProgress(g, a, note); buzz(15); commit();
  if (r.hit){ setTimeout(confettiRain, 200); const l = milestoneLine(g, r.hit); J.toast((r.hit===100?'🏆 ':'🎉 ')+l); J.speak(l); }
  else J.toast(`${a>0?'+':''}${gQty(g,a)} · ${Math.round(r.after)}% of ${g.title}`);
}
function openGoalEditor(g, tpl){
  const isNew = !g;
  let dl = '';
  if (g) dl = g.deadline || '';
  else if (tpl){ const d = tpl.endYear ? new Date(new Date().getFullYear(), 11, 31) : new Date(new Date().getFullYear(), new Date().getMonth()+(tpl.months||6)+1, 0); dl = dkey(d); }
  const d = g ? {...g} : Object.assign({title:'', emoji:'🎯', color:'#22c55e', target:'', unit:''}, tpl||{});
  J.modal(`<div class="hb-m"><h4>${isNew?'New goal':'Edit goal'}</h4><div class="hb-mscroll">
    <div class="hb-name-row"><button type="button" class="hb-emo-btn" id="hbEmoBtn">${d.emoji}</button><input id="hbTitle" placeholder="e.g. Save for a car" value="${J.esc(d.title)}" maxlength="50"></div>
    <div class="hb-emojis" id="hbEmojis">${GOAL_EMOJIS.map(e=>`<button type="button" class="${e===d.emoji?'on':''}" data-e="${e}">${e}</button>`).join('')}</div>
    <div class="hb-row2 two"><div><small>Target</small><input id="hbTarget" type="number" inputmode="decimal" value="${d.target}" placeholder="5000"></div><div><small>Unit</small><input id="hbUnit" list="hbGUnits" value="${J.esc(d.unit)}" placeholder="dollars"><datalist id="hbGUnits">${['dollars','books','kg','km','hours','pages','workouts'].map(u=>`<option value="${u}">`).join('')}</datalist></div></div>
    <div class="hb-lbl">Deadline <span style="font-weight:500;color:var(--faint)">(optional)</span></div><input id="hbDl" type="date" value="${dl}" min="${dkey(today0())}">
    <div class="hb-lbl">Color</div><div class="hb-colors" id="hbColors">${PAL.map(([c,c2])=>`<button type="button" class="${c===d.color?'on':''}" data-c="${c}" style="background:linear-gradient(135deg,${c},${c2})" aria-label="Color"></button>`).join('')}</div>
    <div class="hb-err" id="hbErr"></div>
  </div><div class="row"><button class="btn ghost" id="hbX">Cancel</button><button class="btn" id="hbOk">${isNew?'Create goal':'Save'}</button></div></div>`);
  $m('hbEmojis').querySelectorAll('button').forEach(b=>b.onclick=()=>{ d.emoji = b.dataset.e; $m('hbEmoBtn').textContent = d.emoji; $m('hbEmojis').querySelectorAll('button').forEach(x=>x.classList.toggle('on', x===b)); });
  $m('hbColors').querySelectorAll('button').forEach(b=>b.onclick=()=>{ d.color = b.dataset.c; $m('hbColors').querySelectorAll('button').forEach(x=>x.classList.toggle('on', x===b)); });
  $m('hbX').onclick = J.closeModal;
  $m('hbOk').onclick = ()=>{
    const title = J.cap($m('hbTitle').value.trim()), target = parseFloat($m('hbTarget').value);
    const err = m => { $m('hbErr').textContent = m; $m('hbErr').classList.add('show'); };
    if (!title) return err('Give your goal a name.');
    if (!(target>0)) return err('Set a target number, like 5000.');
    const o = {title, emoji:d.emoji, color:d.color, target, unit:$m('hbUnit').value.trim(), deadline:$m('hbDl').value||''};
    J.closeModal();
    if (isNew){ const ng = addGoal(o); setTab('goals'); commit(); J.toast(`Goal set: ${ng.emoji} ${ng.title}`); }
    else { Object.assign(g, o); g.hit = MILESTONES.filter(m=>gPct(g)*100 >= m); commit(); J.toast('Goal saved'); }
  };
}

/* ---------------------------------------------------------
   VOICE
   --------------------------------------------------------- */
const WATER_RE = /^i(?: just)? (?:drank|had|drink|finished)(?: (?:a|an|another|one more|some|\d+(?:\.\d+)?(?: and a half)?|half a))?(?: (?:big |large |small |full )?(?:glass(?:es)?|cups?|bottles?|liters?|litres?|l|ml|mls|sips?))?(?: of)? (?:water|h2o)(?: (?:today|now|just now|so far))?$/;
const isWaterHabit = h => /water|hydrat|h2o/.test(lc(h.name+' '+(h.unit||'')));
const waterHabit = () => habits().find(isWaterHabit) || null;
const HAB_VERBS = [
  [/^i(?: just)? (?:worked out|exercised|trained|lifted|went to the gym|hit the gym|did (?:a |my |the )?(?:workout|work out|exercise|training)|finished (?:my |the )?(?:workout|training))\b/, 'workout'],
  [/^i(?: just)? meditated\b|^i did (?:my )?meditation\b/, 'meditate'],
  [/^i(?: just)? read (?:for )?(?:\d+(?:\.\d+)? (?:pages?|chapters?|minutes?|mins?|hours?)|a chapter|my book|today|a bit)\b|^i(?: just)? read$/, 'read'],
  // water ONLY when the whole sentence is about water ("I had 2 eggs and a glass of water" stays with Food)
  [WATER_RE, 'water'],
  [/^i(?: just)? (?:walked|went for a walk|did my walk|took a walk)\b/, 'walk'],
  [/^i(?: just)? (?:ran(?! out\b| into\b| over\b| late\b| away\b| up\b| a\b| an\b| the\b| my\b| errands?\b)|jogged|went for a run|went running|did my run)\b/, 'run'],
  [/^i(?: just)? (?:prayed|did my prayers?)\b/, 'pray'],
  [/^i(?: just)? (?:journaled|journalled|wrote in my journal|did my journal(?:ing)?)\b/, 'journal'],
  [/^i (?:went to (?:bed|sleep)|slept) (?:by|before|on time|early)\b/, 'sleep'],
  [/^(?:i )?(?:had |ate )?no sugar(?: today)?$|^i (?:skipped|avoided) sugar\b|^i didn'?t (?:eat|have) (?:any )?sugar\b/, 'sugar'],
  [/^i(?: just)? (?:studied|did my studying)\b/, 'study'],
  [/^i(?: just)? (?:stretched|did (?:my )?(?:yoga|stretching|stretches))\b/, 'stretch'],
  [/^i(?: just)? took my (?:vitamins?|pills?|meds|medicine|supplements?)\b/, 'vitamins']
];
const UNIT_FAM = [/^(glass|glasses|cups?)$/, /^(bottles?)$/, /^(ml|mls|milliliters?|millilitres?)$/, /^(l|liters?|litres?)$/, /^(minutes?|mins?)$/, /^(hours?|hrs?)$/, /^(steps?)$/, /^(km|kms|kilometers?|kilometres?)$/, /^(miles?)$/, /^(pages?)$/, /^(chapters?)$/, /^(reps?|push ?ups?|pushups|sit ?ups?|situps)$/, /^(prayers?)$/, /^(times?)$/];
const famOf = u => UNIT_FAM.findIndex(re=>re.test(u));
/** convert a spoken amount to the habit's unit. Returns null when the units can't be compared (e.g. minutes vs pages). */
function unitConvert(amount, saidUnit, habitUnit){
  const s = lc(saidUnit).trim(), u = lc(habitUnit).trim();
  const fs = famOf(s), fu = famOf(u);
  if (!s || !u || fs < 0 || fu < 0 || fs === fu) return amount;           // unknown word ("of") or same unit
  const glasses = {0:1, 1:2, 2:1/250, 3:4};                                // 1 glass = 250 ml, 1 bottle = 2 glasses
  if (fs in glasses && fu in glasses) return Math.round(amount*glasses[fs]/glasses[fu]*100)/100;
  if (fs===5 && fu===4) return amount*60;
  if (fs===4 && fu===5) return Math.round(amount/60*100)/100;
  if (fs===7 && fu===6) return Math.round(amount*1300);                    // ~1,300 steps per km
  if (fs===8 && fu===6) return Math.round(amount*2100);
  if (fs===8 && fu===7) return Math.round(amount*1.609*100)/100;
  if (fs===7 && fu===8) return Math.round(amount/1.609*100)/100;
  return null;
}
function logReply(info, how){
  const h = info.h, nm = h.name.toLowerCase(), k = dkey(today0());
  let s;
  if (!info.completed && info.wasDone && !isCount(h)) s = `${h.name} is already done today. Nice! ${streakBit(h)}`;
  else if (info.completed){
    const sk = streak(h);
    s = how ? `${how} ${h.name} is done for today!` : `Nice work! ${h.name} is done for today.`;
    if (isWeekly(h)){ const wc = weekCount(h, wkStart(today0())); s += wc > times(h) ? ` That's ${wc} this week, above your goal of ${times(h)}.` : ` That's ${wc} of ${times(h)} this week.`; }
    if (sk > 1) s += ` You're on a ${num(sk)} ${isWeekly(h)?'week':'day'} streak.`;
    if (info.line) s += ' ' + info.line;
    if (info.perfect) s += ` And that's every habit for today. Perfect day, ${J.settings.name}!`;
  } else if (isCount(h) && info.wasDone && info.v === info.prev){
    s = `${h.name} is already done today. ${streakBit(h)}`.trim();
  } else if (isCount(h)){
    const left = tgt(h) - val(h,k);
    s = isDone(h,k) ? `${how?how+' ':''}You're at ${qty(val(h,k), h.unit)} today, past your goal.` : `${how?how+' ':''}${h.name}: ${num(val(h,k))} of ${qty(h.target, h.unit)}. ${qty(Math.round(left*100)/100, h.unit)} to go.`;
  } else s = `Updated ${nm}.`;
  return s;
}
function streakBit(h){
  const s = streak(h);
  if (isWeekly(h)){ const wc = weekCount(h, wkStart(today0())); return s ? `Streak: ${plural(s,'week')}.` : wc > times(h) ? `That's ${wc} this week, above your goal of ${times(h)}.` : `That's ${wc} of ${times(h)} this week.`; }
  return s ? `Streak: ${plural(s,'day')}.` : '';
}
function logHabit(h, amount, saidUnit, single){
  const k = dkey(today0()); let info, how = '';
  if (isCount(h)){
    const a = amount != null ? unitConvert(amount, saidUnit, h.unit) : null;
    if (a != null && a > 0){ info = setValue(h, k, val(h,k) + a); how = `Added ${qty(a, h.unit)}.`; }
    else if (single || /^(glass|glasses|cups?|times?|prayers?|servings?|reps?)$/i.test(h.unit||'')) { info = setValue(h, k, val(h,k) + (+h.step||1)); how = `Added ${qty(+h.step||1, h.unit)}.`; }
    else info = setValue(h, k, Math.max(val(h,k), tgt(h)));
  } else {
    if (isDone(h,k)) info = {h, prev:1, v:1, wasDone:true, nowDone:true, completed:false};
    else info = setValue(h, k, 1);
  }
  if (info.completed){ pops[h.id] = Date.now(); buzz(15); if (info.perfect) setTimeout(confettiRain, 300); }
  return logReply(info, how);
}
/** parse "8000 steps", "2 glasses", "15 pages" -> {amount, unit} */
function amountIn(s){
  const m = s.match(/(\d+(?:\.\d+)?)\s*(k\b|thousand\b)?\s*(and a half\s*)?([a-z]+)?/);
  if (!m) return {amount:null, unit:''};
  let a = parseFloat(m[1]); if (m[2]) a *= 1000; if (m[3]) a += .5;
  return {amount:a, unit:m[4]||''};
}
function cleanT(t){ return t.replace(/[\u2018\u2019]/g,"'").replace(/[.]+$/,'').replace(/^(?:(?:hey|ok|okay)\s+)?jarvis[\s,]*/,'').replace(/^(?:yes|so|um|uh|well)\s+/,'').replace(/\s+/g,' ').trim(); }

/* parse a schedule / reminder / target out of a habit description */
function parseHabitSpec(text){
  let s = ' '+lc(text).replace(/[.!]+$/,'')+' '; const o = {}; let m;
  // reminder time
  if ((m = s.match(/\s(?:and )?(?:remind me )?at (\d{1,2})(?::(\d{2}))? ?(a\.?m\.?|p\.?m\.?)?\s/))){
    let H = +m[1], M = +(m[2]||0); const ap = m[3]||''; if (/p/.test(ap) && H<12) H += 12; if (/a/.test(ap) && H===12) H = 0; if (!ap && H<=7) H += 12;
    if (H<24 && M<60){ o.reminder = p2(H)+':'+p2(M); s = s.replace(m[0], ' '); }
  } else if ((m = s.match(/\s(?:every |each )?(morning|evening|night)\s/)) && /remind/.test(s)){ o.reminder = {morning:'08:00', evening:'19:00', night:'21:00'}[m[1]]; s = s.replace(m[0],' '); }
  s = s.replace(/\s(?:and )?remind me\s/,' ');
  // schedule
  if ((m = s.match(/\s(\d|once|twice|three|four|five|six) (?:times? |x )?(?:a|per|each|every) week\s/))){ o.sched = 'weekly'; o.times = {once:1, twice:2}[m[1]] || +m[1] || 3; s = s.replace(m[0], ' '); }
  else if ((m = s.match(/\s(?:on |every )?(weekdays|week days|workdays)\s/))){ o.sched = 'days'; o.days = [1,2,3,4,5]; s = s.replace(m[0],' '); }
  else if ((m = s.match(/\s(?:on |every )?(weekends?)\s/))){ o.sched = 'days'; o.days = [0,6]; s = s.replace(m[0],' '); }
  else {
    const dayRe = /(sundays?|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)/;
    if ((m = s.match(new RegExp('\\s(?:on |every )?'+dayRe.source+'(?:(?:,? and |, | |,)'+dayRe.source+')*\\s')))){
      const names = ['sun','mon','tue','wed','thu','fri','sat'];
      const days = [...new Set((m[0].match(new RegExp(dayRe.source,'g'))||[]).map(x=>names.indexOf(x.slice(0,3))).filter(x=>x>=0))];
      if (days.length){ o.sched = 'days'; o.days = days; s = s.replace(m[0], ' '); }
    }
  }
  if ((m = s.match(/\s(every ?day|daily|each day|every single day|a day|per day|each night|every night|nightly)\s/))){ if (!o.sched) o.sched = 'daily'; s = s.replace(m[0], ' '); }
  // target
  if ((m = s.match(/\s(\d+(?:\.\d+)?)\s*(k\s)?\s*(glasses|glass|cups?|minutes?|mins?|hours?|hrs?|pages?|steps?|km|kilometers?|miles?|reps?|push ?ups?|sit ?ups?|times?|liters?|litres?|bottles?|chapters?|prayers?|servings?|words?|calories)(?: of)?\s/))){
    let unit = m[3].replace(/^mins?$/,'minutes').replace(/^hrs?$/,'hours').replace(/^glass$/,'glasses').replace(/^cup$/,'cups').replace(/^page$/,'pages').replace(/^step$/,'steps').replace(/^minute$/,'minutes').replace(/^hour$/,'hours').replace(/^time$/,'times');
    o.kind = 'count'; o.target = parseFloat(m[1]) * (m[2]?1000:1); o.unit = unit; s = s.replace(m[0], ' ');
  }
  s = s.replace(/\s(for|to|at|on|by|and)\s*$/,' ').replace(/^\s*(to|of)\s/,' ').replace(/\s+/g,' ').trim();
  o.name = s;
  return o;
}
function createHabitFromSpeech(rest){
  const o = parseHabitSpec(rest);
  let name = o.name.replace(/^(?:(?:a|an|my|the) )/,'').trim();
  if (!name && o.unit) name = {steps:'walk', pages:'read', glasses:'drink water', minutes:'meditate', prayers:'pray'}[o.unit] || o.unit;
  if (!name) return 'What habit should I add? Try: add a habit to read 10 pages every day.';
  // "drink water" style name cleanup: "drink of water" -> "drink water"
  name = name.replace(/\b(\w+) of (water|tea)\b/, '$1 $2').replace(/\bwork out\b/, 'workout');
  const tp = templateFor(name);
  const disp = J.cap(tp && canon(name).size===1 && words(name).length<=2 ? tp.name : name);
  if (habits().some(h=>lc(h.name)===lc(disp))) { J.go('habits'); return `You already have a habit called ${disp}.`; }
  const base = tp ? Object.assign({}, tp) : {emoji: guessEmoji(name), color: PAL[habits().length % PAL.length][0], kind:'check', sched:'daily'};
  delete base.key;
  const spec = {name: disp};
  ['sched','days','times','reminder'].forEach(k=>{ if (o[k] !== undefined) spec[k] = o[k]; });
  if (o.kind==='count'){ spec.kind = 'count'; spec.target = o.target; spec.unit = o.unit; spec.step = niceStep(o.target, o.unit); }
  if (spec.sched && spec.sched!=='weekly') { delete base.times; }
  const h = addHabit(Object.assign(base, spec));
  setTab('today'); J.go('habits');
  let r = `Added ${h.name}`;
  r += isCount(h) ? `, ${qty(h.target, h.unit)} ` : ' ';
  r += h.sched==='weekly' ? `${times(h)} times a week.` : h.sched==='days' ? `on ${h.days.length===7?'every day':/^(Weekdays|Weekends)$/.test(schedText(h))?schedText(h).toLowerCase():h.days.slice().sort((a,b)=>MON_ORDER.indexOf(a)-MON_ORDER.indexOf(b)).map(x=>['Sundays','Mondays','Tuesdays','Wednesdays','Thursdays','Fridays','Saturdays'][x]).join(', ').replace(/, ([^,]+)$/,' and $1')}.` : 'every day.';
  if (h.reminder) r += ` I'll remind you at ${fmtTime(h.reminder)}.`;
  r += ` Tap its ring when you do it, or just tell me.`;
  return r;
}

/* deadlines like "by june", "this year", "in 3 months", "by march 15", "by the end of the year" */
function parseDeadline(s){
  const now = today0(), y = now.getFullYear(); let m;
  const endOfMonth = (yy, mm) => new Date(yy, mm+1, 0);
  const monRe = '(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)';
  const monIdx = w => MONTHS.findIndex(x=>x.startsWith(w.slice(0,3)));
  const roll = (d, hasYear) => { if (!hasYear && d < now) d.setFullYear(d.getFullYear()+1); return d; };
  const tries = [
    [/\b(?:by |before |until |till )?(?:the )?end of (?:the |this )?year\b|\bthis year\b|\bby (?:new year'?s?|next year)\b/, ()=>new Date(y,11,31)],
    [/\bnext year\b/, ()=>new Date(y+1,11,31)],
    [/\b(?:by |before )?(?:the )?end of (?:the |this )?month\b|\bthis month\b/, ()=>endOfMonth(y, now.getMonth())],
    [/\bnext month\b/, ()=>endOfMonth(y, now.getMonth()+1)],
    [/\b(?:by |before )?(?:the )?end of (?:the |this )?week\b|\bthis week\b/, ()=>addD(wkStart(now),6)],
    [/\bby christmas\b/, ()=>roll(new Date(y,11,25))],
    [/\bby (?:the )?summer\b/, ()=>roll(new Date(y,5,21))],
    [/\b(?:in|within) (\d+) (days?|weeks?|months?|years?)\b/, mm=>{ const n = +mm[1], u = mm[2][0]; const d = new Date(now); if (u==='d') d.setDate(d.getDate()+n); else if (u==='w') d.setDate(d.getDate()+7*n); else if (u==='m') d.setMonth(d.getMonth()+n); else d.setFullYear(d.getFullYear()+n); return d; }],
    [new RegExp('\\b(?:by|before|until|till|on|in|for) (?:the )?(?:end of )?'+monRe+'(?: (\\d{1,2})(?:st|nd|rd|th)?)?(?:,? (\\d{4}))?\\b'), mm=>{ const mi = monIdx(mm[1]); const yy = mm[3] ? +mm[3] : y; const d = mm[2] ? new Date(yy, mi, +mm[2]) : endOfMonth(yy, mi); return roll(d, !!mm[3]); }],
    [new RegExp('\\b(?:by|before|on) (?:the )?(\\d{1,2})(?:st|nd|rd|th)? (?:of )?'+monRe+'(?:,? (\\d{4}))?\\b'), mm=>{ const mi = monIdx(mm[2]); const yy = mm[3] ? +mm[3] : y; return roll(new Date(yy, mi, +mm[1]), !!mm[3]); }]
  ];
  for (const [re, fn] of tries){ if ((m = s.match(re))){ const d = fn(m); if (d && !isNaN(d)) return {date:d, text:m[0]}; } }
  return null;
}
function createGoalFromSpeech(rest){
  let s = lc(rest).replace(/[.!]+$/,'').trim();
  const dl = parseDeadline(s);
  if (dl) s = s.replace(dl.text, ' ').replace(/\s+/g,' ').trim();
  s = s.replace(/\s(by|before|until|in|for)$/,'').replace(/^(?:to |of |for )/,'').trim();
  if (!s) return 'What is the goal? Try: add a goal to save 5000 dollars by June.';
  let target = 100, unit = '%', title = s; let m;
  if ((m = s.match(/^(.*?)\s*\$\s?(\d+(?:\.\d+)?)\s*(k\b)?\s*(.*)$/))){ target = parseFloat(m[2])*(m[3]?1000:1); unit = 'dollars'; title = (m[1]+' '+J.fmt(target)+' '+m[4]).trim(); }
  else if ((m = s.match(/^(.*?)\s*(\d+(?:\.\d+)?)\s*(k\b)?\s*([a-z€£]+)?\s*(.*)$/))){
    target = parseFloat(m[2])*(m[3]?1000:1);
    let u = m[4] || ''; const verb = m[1].trim(), tail = m[5].trim();
    if (/^(lose|gain|drop)/.test(verb) && /^(pounds?|lbs?)$/.test(u)) u = 'lbs';
    if (/^(kilos?|kilograms?|kgs?)$/.test(u)) u = 'kg';
    if (/^(kilometers?|kilometres?|kms?)$/.test(u)) u = 'km';
    if (/^(bucks|usd)$/.test(u)) u = 'dollars';
    unit = u || '';
    title = isMoney(unit) ? `${verb} ${J.fmt(target)} ${tail}` : `${verb} ${num(target)} ${u} ${tail}`;
  }
  title = J.cap(title.replace(/\s+/g,' ').trim());
  if (goals().some(g=>lc(g.title)===lc(title))) { setTab('goals'); J.go('habits'); return `You already have a goal called ${title}.`; }
  const emoji = /save|money|dollar|\$|fund|invest/.test(s) || isMoney(unit) ? '💰' : /book|read/.test(s) ? '📚' : /lose|weight|kg|lbs/.test(s) ? '⚖️' : /run|km|marathon/.test(s) ? '🏃' : /learn|course|study/.test(s) ? '🎓' : /trip|travel/.test(s) ? '✈️' : '🎯';
  const color = {'💰':'#22c55e','📚':'#8b5cf6','⚖️':'#0ea5e9','🏃':'#f97316','🎓':'#6366f1','✈️':'#14b8a6'}[emoji] || '#6d5dfc';
  const g = addGoal({title, emoji, color, target, unit, deadline: dl ? dkey(dl.date) : ''});
  setTab('goals'); J.go('habits');
  let r = `New goal: ${title}`;
  if (dl) r += `, by ${dl.date.toLocaleDateString([], {month:'long', day:'numeric', year:'numeric'})}`;
  r += '.';
  const np = needPer(g); if (np) r += ` That's about ${np}.`;
  if (unit==='%') r += ' Tell me a number to track, like save 5000 dollars, and I can measure your pace.';
  else r += ` To log progress, say "add ${isMoney(unit)?'500':'1'} to my ${goalWord(g)} goal".`;
  return r;
}
function goalProgressSpeech(g, amount){
  const r = addProgress(g, amount, 'By voice'); buzz(15);
  const p = gProg(g), pace = gPace(g);
  let s = `Added ${gQty(g, amount)} to ${g.title}. You're at ${ofText(g)}, ${Math.round(r.after)} percent.`;
  if (r.hit){ s += ' ' + milestoneLine(g, r.hit); setTimeout(confettiRain, 300); }
  else if (pace.k==='behind'){ const np = needPer(g); s += ` You're a bit behind${np?`, aim for about ${np}`:''}.`; }
  else if (pace.k==='track' || pace.k==='ahead') s += pace.k==='ahead' ? ' You are ahead of schedule.' : ' Right on track.';
  return s;
}
function habitsSummary(){
  const hs = habits(); if (!hs.length) return "You don't have any habits yet. Say: add a habit to drink 8 glasses of water every day.";
  const s = todayStats(), k = dkey(today0());
  const todo = s.list.filter(h=>!isDone(h,k)).map(h=> isCount(h) && val(h,k) ? `${h.name.toLowerCase()}, ${num(val(h,k))} of ${qty(h.target,h.unit)}` : h.name.toLowerCase());
  let r = !s.total ? 'Nothing is scheduled today.' : s.done===s.total ? `All ${s.total} habits are done today. Perfect day!` : `You've done ${s.done} of ${s.total} habits today.`;
  if (todo.length) r += ` Still to go: ${todo.length>1 ? todo.slice(0,-1).join(', ')+' and '+todo[todo.length-1] : todo[0]}.`;
  const top = hs.map(h=>({h, s:streak(h)})).sort((a,b)=>b.s-a.s)[0];
  if (top && top.s > 1) r += ` Your best streak right now is ${top.h.name.toLowerCase()}, ${plural(top.s, isWeekly(top.h)?'week':'day')}.`;
  return r;
}
function streakReply(h){
  const s = streak(h), b = bestStreak(h), u = isWeekly(h)?'week':'day', k = dkey(today0());
  let r = s ? `Your ${h.name.toLowerCase()} streak is ${plural(s,u)}.` : `You don't have a ${h.name.toLowerCase()} streak going yet.`;
  if (b > s) r += ` Your best ever is ${plural(b,u)}.`; else if (s > 1) r += ' That is your best ever!';
  if (!isWeekly(h) && schedOn(h, today0()) && !isDone(h,k)) r += ` Do it today to make it ${plural(s+1,u)}.`;
  if (isWeekly(h)){ const wc = weekCount(h, wkStart(today0())); if (wc < times(h)) r += ` This week: ${wc} of ${times(h)}.`; }
  return r;
}
function goalsSummary(only){
  const gs = only ? [only] : goals(); if (!gs.length) return "You don't have any goals yet. Say: add a goal to save 5000 dollars by June.";
  return (only ? '' : `You have ${plural(gs.length,'goal')}. `) + gs.slice(0,4).map(g=>{ const pace = gPace(g), np = needPer(g);
    let s = `${g.title}: ${ofText(g)}, ${Math.round(gPct(g)*100)} percent`;
    if (pace.k==='done') s += ', complete'; else if (pace.k==='behind') s += `, behind${np?`. Aim for about ${np}`:''}`; else if (pace.k==='track') s += ', on track'; else if (pace.k==='ahead') s += ', ahead of schedule'; else if (pace.k==='over') s += ', past the deadline';
    return s + '.'; }).join(' ');
}

function intent(said, t0){
  const t = cleanT(t0); let m;
  const ret = r => r ? stripEmoji(r) : null;

  // add habit
  if ((m = t.match(/^(?:can you |please |could you )?(?:add|create|start|make|set up|new)(?: me)?(?: a| an| my)?(?: new)? habit(?:\s*(?:to|of|for|:|-|called|named))?\s+(.+)$/)) || (m = t.match(/^new habit\s*[:\-]?\s*(.+)$/)) || (m = t.match(/^i want to (?:start|build) (?:a habit of |the habit of )(.+)$/)))
    return ret(createHabitFromSpeech(m[1].replace(/^(?:to|of)\s+/,'')));
  // add goal
  if ((m = t.match(/^(?:can you |please )?(?:add|create|set|make|start|new)(?: me)?(?: a| an| my)?(?: new)? goal(?:\s*(?:to|of|for|:|-|called))?\s+(.+)$/)) || (m = t.match(/^(?:my )?(?:new )?goal(?: is)?\s*[:\-]\s*(.+)$/)) || (m = t.match(/^my goal is to (.+)$/))
      || ((m = t.match(/^(?:i (?:want|wanna|would like|'d like|need|plan|am going|'m going|am trying|'m trying) to|i will|i'll|help me) ((?:save|lose|gain|read|run|walk|pay off|reach|hit|get to|drop|cut)\b.+)$/)) && /\d/.test(m[1]) && /\b(by|before|until|in|this|next|end of)\b|\b(kg|kilos?|pounds?|lbs?|books?|km|miles?|dollars?|bucks|\$)/.test(m[1]) && !/\b(remind|note|today|tonight|tomorrow)\b/.test(m[1])))
    return ret(createGoalFromSpeech(m[1]));

  // goal progress: "add 500 to my savings goal"
  if ((m = t.match(/^(?:add|put|log|record|deposit|save|i saved|i put|i added)\s+\$?(\d+(?:\.\d+)?)\s*(k\b)?\s*(?:[a-z$€£]+\s+)?(?:more\s+)?(?:to|towards?|into|in|on|for)\s+(?:my |the )?(.+?)$/))){
    const isGoalWord = /\bgoal\b/.test(m[3]); const q = m[3].replace(/\bgoals?\b/,'').trim();
    const g = matchGoal(q) || (isGoalWord && goals().length===1 ? goals()[0] : null);
    const amount = parseFloat(m[1])*(m[2]?1000:1);
    if (g && (isGoalWord || matchScore(q, g.title) >= 20)){ J.go('habits'); setTab('goals'); ui.goalDetail = null; return ret(goalProgressSpeech(g, amount)); }
    if (isGoalWord){ return goals().length ? `I couldn't find a goal called ${q}. Your goals are: ${goals().map(g=>g.title).join(', ')}.` : "You don't have any goals yet. Say: add a goal to save 5000 dollars by June."; }
    // not a goal: maybe a habit ("add 2 glasses to water")
    const h = matchHabit(q.replace(/\bhabits?\b/,'').trim());
    if (h && (/\bhabit\b/.test(m[3]) || matchScore(q, h.name+' '+(h.unit||'')) >= 20)){ J.go('habits'); return ret(logHabit(h, amount, '', false)); }
  }
  if ((m = t.match(/^i (?:lost|dropped) (\d+(?:\.\d+)?) ?(kg|kilos?|kilograms?|pounds?|lbs?)\b/))){
    const g = goals().find(g=>canon(g.title+' '+g.unit).has('weight')); if (g){ J.go('habits'); setTab('goals'); return ret(goalProgressSpeech(g, parseFloat(m[1]))); }
  }
  if ((m = t.match(/^i (?:finished|read|completed) (?:a|1|another|one more|1 more) book\b/))){
    const g = goals().find(g=>/books?/.test(lc(g.unit)) || canon(g.title).has('read') && /book/.test(lc(g.title))); if (g){ J.go('habits'); setTab('goals'); return ret(goalProgressSpeech(g, 1)); }
    const rh = habits().find(x=>canon(x.name+' '+(x.unit||'')).has('read'));
    if (rh){ J.go('habits'); const r = logHabit(rh, null, '', false); return ret(`Congrats on finishing a book! ${r}`); }
    return `Congrats on finishing a book! Want me to count them? Say "add a goal to read 12 books this year".`;
  }

  // status questions
  if (/^(?:how (?:are|is) my habits?(?: going| doing)?|how am i doing (?:on|with) (?:my )?habits|(?:my |show )?habits? (?:status|summary|progress|update|report)|what habits? (?:do i (?:have )?left|are left)(?: today)?|what(?:'s| is) left (?:on my habits|for my habits)|did i (?:do|finish) (?:all )?my habits(?: today)?)$/.test(t)) { J.go('habits'); setTab('today'); return ret(habitsSummary()); }
  // one habit: "how's my water habit?"
  if ((m = t.match(/^(?:how(?:'s| is| am i doing (?:on|with))) (?:my |the )?(.+?) habit(?: going| doing| coming along)?(?: today)?$/))){
    const h = matchHabit(m[1]);
    if (h){ J.go('habits'); setTab('today'); const k = dkey(today0()); const st0 = isCount(h) ? `${Math.round(val(h,k)*100)/100} of ${qty(tgt(h), h.unit)} today` : (isDone(h,k) ? 'done today' : 'not done yet today'); return ret(`${h.name}: ${st0}. ${streakReply(h)}`); }
    return habits().length ? `I couldn't find a ${m[1]} habit. Your habits are: ${habits().map(h=>h.name).join(', ')}.` : "You don't have any habits yet. Say: add a habit to drink water every day.";
  }
  // one goal: "how's my savings goal?", "how is my reading goal going"
  if ((m = t.match(/^(?:how(?:'s| is| am i doing (?:on|with))) (?:my |the )?(.+?) goal(?: going| doing| coming along)?$/)) && !/\b(budget|spending|calorie|calories|kcal|food|diet|protein|carbs?)\b/.test(m[1])){
    const g = matchGoal(m[1]) || (goals().length===1 ? goals()[0] : null);
    if (g){ J.go('habits'); setTab('goals'); ui.goalDetail = null; return ret(goalsSummary(g)); }
    if (!/\b(budget|spending|calorie|calories|kcal|water|food|protein)\b/.test(m[1])){ J.go('habits'); setTab('goals'); return ret(goals().length ? `I couldn't find a ${m[1]} goal. ` + goalsSummary() : goalsSummary()); }
  }
  if (/^(?:how (?:are|is) my goals?(?: going| doing)?|how am i doing (?:on|with) (?:my )?goals|(?:my |show )?goals? (?:status|summary|progress|update|report)|am i on track(?: with| for)? (?:my )?goals?)$/.test(t)) { J.go('habits'); setTab('goals'); ui.goalDetail = null; return ret(goalsSummary()); }
  if (/\bstreaks?\b/.test(t) && (/^(?:what(?:'s| is| are)|how (?:long|big)|tell me|show|check|my)\b/.test(t) || /^[a-z ]{2,24} streaks?$/.test(t))){
    const q = t.replace(/\b(what's|what is|what are|how long is|how big is|tell me|show me|show|check|my|the|for|on|of|is|streaks?|current|longest|best|today|habit|please)\b/g,' ').replace(/\s+/g,' ').trim();
    const h = q ? matchHabit(q) : null;
    if (h) return ret(streakReply(h));
    const hs = habits(); if (!hs.length) return "You don't have any habits yet, so no streaks to report. Say: add a habit to read every day.";
    if (q && !/^(all|habits?)$/.test(q)) return ret(`I couldn't find a habit called ${q}. ` + hs.slice(0,5).map(h=>`${h.name}: ${plural(streak(h), isWeekly(h)?'week':'day')}`).join(', ') + '.');
    return ret('Your streaks: ' + hs.slice(0,6).map(h=>`${h.name}, ${plural(streak(h), isWeekly(h)?'week':'day')}`).join('. ') + '.');
  }
  if (/^(?:open|show|go to|see)(?: me)? (?:my |the )?habits?(?: page| screen| tracker)?$/.test(t)){ J.go('habits'); setTab('today'); return 'Here are your habits.'; }
  if (/^(?:open|show|go to|see)(?: me)? (?:my |the )?goals?(?: page| screen)?$/.test(t)){ J.go('habits'); setTab('goals'); return 'Here are your goals.'; }
  if (/^(?:undo|cancel|scratch|remove) (?:my |the )?last (?:habit|check ?in|check)$/.test(t)){ const h = undoLast(); return h ? `Undone. ${h.name} is back to ${isCount(h)?qty(val(h,dkey(today0())),h.unit):(isDone(h,dkey(today0()))?'done':'not done')} today.` : 'There is nothing to undo.'; }

  // explicit "mark X done" / "check off X"
  if ((m = t.match(/^(?:mark|check|tick|set)\s+(?:off\s+)?(?:my |the )?(.+?)\s+(?:as\s+)?(?:done|complete|completed|finished|off)(?:\s+(?:for\s+)?today)?$/)) || (m = t.match(/^(?:check off|tick off|complete)\s+(?:my |the )?(.+?)(?:\s+(?:for\s+)?today)?$/))){
    const q = m[1]; const h = matchHabit(q);
    if (!h && !/^mark\b/.test(t)) return null;
    if (!h) return habits().length ? `I couldn't find a habit called ${q}. Your habits are: ${habits().map(h=>h.name).join(', ')}.` : `You don't have a habit called ${q} yet. Say: add a habit to ${q} every day.`;
    const k = dkey(today0()); const info = setValue(h, k, Math.max(val(h,k), tgt(h)));
    if (info.completed){ pops[h.id] = Date.now(); buzz(15); if (info.perfect) setTimeout(confettiRain, 300); }
    else if (info.wasDone) return ret(`${h.name} is already done today. ${streakBit(h)}`);
    return ret(logReply(info, ''));
  }
  if (!/^undo (?:the |my )?last\b/.test(t) && (m = t.match(/^(?:un ?mark|uncheck|undo)\s+(?:my |the )?(.+?)(?:\s+for today| today)?$/))){
    const h = matchHabit(m[1]); if (h){ const k = dkey(today0()); setValue(h, k, 0); return ret(`Okay, ${h.name} is cleared for today.`); }
  }

  // natural past-tense logs: "I worked out", "I read 15 pages", "I drank 2 glasses of water"
  let key = null;
  for (const [re, k] of HAB_VERBS) if (re.test(t)) { key = k; break; }
  let h = null, generic = false;
  if (key==='water') h = waterHabit();   // never borrow a "Drink tea" habit for water
  else if (key) h = habits().find(x=>canon(x.name+' '+(x.unit||'')).has(key)) || matchHabit(key);
  else if ((m = t.match(/^i (?:just )?(?:did|finished|completed|have done|got done|am done with|'m done with|done with) (?:my |the |today's |a |an )?(.+?)(?:\s+(?:for\s+)?today)?$/))){
    generic = true; const q = m[1].replace(/^\d+(?:\.\d+)?\s*(?:k\s)?/,'');
    h = matchHabit(q) || matchHabit(m[1]);
  }
  if (h){
    const tt = t.replace(/^i (?:went to (?:bed|sleep)|slept) .*/, '')
      .replace(/\b(?:a|one) half (?:an? )?hours?\b|\bhalf an hour\b/, '30 minutes').replace(/\ban hour\b/, '1 hour')
      .replace(/\bhalf an? (liters?|litres?|bottles?|glass(?:es)?|cups?)\b/, '0.5 $1')
      .replace(/\b(?:a|an|one|another|one more) (?:big |large |small |full )?(liters?|litres?|l|bottles?)\b/, '1 $1');
    const {amount, unit} = amountIn(tt);
    const single = /\b(a|another|one more) (glass|cup|bottle|prayer)\b/.test(t);
    const k = dkey(today0()), before = val(h,k);
    J.go('habits');
    const reply = logHabit(h, isCount(h) ? amount : null, unit, single);
    // keep the Food screen's water glasses in step when Food offers a hook for it
    if (key==='water'){ try { const dv = val(h,k) - before; const g = isCount(h) ? unitConvert(dv, h.unit, 'glasses') : 1; if (g > 0 && J.food && typeof J.food.addWater==='function') J.food.addWater(Math.round(g)); } catch(e){} }
    return ret(reply);
  }
  if (key && key!=='water' && key!=='read' && !generic){
    const tp = TEMPLATES.find(x=>x.key===key);
    const nm = tp ? tp.name : {run:'Run', study:'Study', stretch:'Stretch', vitamins:'Take vitamins'}[key] || J.cap(key);
    return `Nice! You don't have a ${nm.toLowerCase()} habit yet. Say "add a habit called ${nm.toLowerCase()}" and I'll track it for you.`;
  }
  return null;
}

/* ---------------------------------------------------------
   PUBLIC HOOK (other features, e.g. Food logging water)
   --------------------------------------------------------- */
J.habits = {
  /** returns the habit matching a name ("water") or null */
  find: q => matchHabit(q),
  /** log an amount toward a habit by name. Returns a spoken reply or null when no such habit. */
  log(q, amount, unit){ const h = matchHabit(q); if (!h) return null; const r = logHabit(h, amount==null?null:+amount, unit||'', false); J.save(); return stripEmoji(r); },
  /** convenience for the Food feature: log glasses of water if a water habit exists */
  logWater(glasses){ const h = waterHabit(); if (!h) return null; const r = logHabit(h, glasses==null?null:+glasses, 'glasses', glasses==null); J.save(); return stripEmoji(r); },
  /** set today's water habit to n glasses (used when glasses are taken away in Food). Never adds a streak line or double counts. */
  setWater(n){ const h = waterHabit(); if (!h) return null; const k = dkey(today0()); const v = isCount(h) ? Math.max(0, (x=>x==null?Math.max(0,+n||0):x)(unitConvert(Math.max(0, +n||0), 'glasses', h.unit))) : ((+n||0) > 0 ? 1 : 0); setValue(h, k, v); J.save(); return val(h,k); },
  /** take n glasses away from today's water habit (never below zero) */
  unlogWater(n){ const h = waterHabit(); if (!h || !(+n>0)) return null; const k = dkey(today0()); if (!isCount(h)) return null; const v = Math.max(0, val(h,k) - (x=>x==null?+n:x)(unitConvert(+n, 'glasses', h.unit))); setValue(h, k, v); J.save(); return val(h,k); },
  today: () => todayStats()
};
window.addEventListener('jarvis:water', e=>{ try { const n = e.detail && +e.detail.glasses; const r = J.habits.logWater(n||1); if (r) J.renderAll(); } catch(err){} });

/* ---------------------------------------------------------
   MORNING BRIEF (one sentence)
   --------------------------------------------------------- */
function briefLine(){
  const hs = habits(); if (!hs.length) return null;
  const s = todayStats();
  const top = hs.map(h=>({h, s:streak(h)})).filter(x=>x.s > 1).sort((a,b)=>b.s-a.s)[0];
  const sk = top ? `your ${top.h.name.toLowerCase()} streak is ${plural(top.s, isWeekly(top.h)?'week':'day')}` : '';
  let r;
  if (!s.total) r = `No habits are scheduled today${sk?`, and ${sk}`:''}`;
  else if (s.done===s.total) r = `${s.total===1?'Your habit is':`All ${s.total} habits are`} already done today${sk?`, and ${sk}`:''}`;
  else r = `You have ${plural(s.total - s.done, 'habit')} ${s.done?'left ':''}today${sk?`; ${sk}`:''}`;
  return stripEmoji(r) + '.';
}
try { if (J.addBriefLine) J.addBriefLine(()=>briefLine()); } catch(e){}

/* ---------------------------------------------------------
   STYLES
   --------------------------------------------------------- */
J.css(`
#v-habits .hb-tabs{margin-bottom:16px}
.hb-hint{font-size:12px;color:var(--faint);font-weight:600}
.hb-wide{width:100%;margin-top:14px;display:flex;align-items:center;justify-content:center;gap:8px}
.hb-wide svg{width:18px;height:18px}
.hb-svg{display:block;overflow:visible}
.hb-arc{transition:stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1),opacity .2s}
.hb-ring{position:relative;flex:none;display:grid;place-items:center;--hc:var(--accent)}
.hb-ring .hb-svg{position:absolute;inset:0}
.hb-emo{position:relative;line-height:1;transition:transform .35s var(--ease),opacity .25s;display:grid;place-items:center;text-align:center}
.hb-tick{position:absolute;right:2%;bottom:2%;width:28%;height:28%;min-width:18px;min-height:18px;border-radius:50%;display:grid;place-items:center;color:#fff;transform:scale(0);transition:transform .35s cubic-bezier(.3,1.6,.5,1);box-shadow:0 0 0 3px var(--bg),0 4px 10px rgba(0,0,0,.25)}
.hb-tick svg{width:62%;height:62%}
.hb-ring.is-done .hb-tick{transform:scale(1)}
.hb-ring.is-done .hb-svg{filter:drop-shadow(0 0 8px color-mix(in srgb,var(--hc) 45%,transparent))}
.hb-ring.hb-pop{animation:hbPop .6s cubic-bezier(.3,1.5,.5,1)}
.hb-ring.hb-pop .hb-emo{animation:hbWiggle .6s ease}
.hb-ring.hb-pop .hb-tick{animation:hbTick .55s cubic-bezier(.3,1.7,.5,1)}
@keyframes hbPop{0%{transform:scale(1)}35%{transform:scale(.86)}70%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes hbWiggle{0%,100%{transform:none}30%{transform:rotate(-12deg) scale(1.15)}60%{transform:rotate(9deg) scale(1.1)}}
@keyframes hbTick{0%{transform:scale(0) rotate(-40deg)}100%{transform:scale(1) rotate(0)}}
.hb-fx{position:fixed;inset:0;pointer-events:none;z-index:70;overflow:hidden}
.hb-fx i{position:absolute;width:7px;height:7px;border-radius:2px;will-change:transform}
.hb-fx b{position:absolute;width:90px;height:90px;border-radius:50%;border:3px solid;will-change:transform}

/* hero */
.hb-hero{position:relative;overflow:hidden;padding:18px;background:radial-gradient(130% 120% at 0% 0%,var(--accent-soft),transparent 55%),radial-gradient(90% 90% at 100% 100%,rgba(34,211,238,.10),transparent 60%),var(--card)}
.hb-hero-top{display:flex;gap:16px;align-items:center}
.hb-big{position:relative;width:118px;height:118px;flex:none}
.hb-big .hb-svg{position:absolute;inset:0}
.hb-big-c{position:absolute;inset:0;display:grid;place-items:center;align-content:center;text-align:center}
.hb-big-c b{font-size:32px;font-weight:800;letter-spacing:-1px;line-height:1}
.hb-big-c b small{font-size:17px;color:var(--muted);font-weight:700;letter-spacing:0}
.hb-big-c span{font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin-top:4px}
.hb-hero-txt{min-width:0;flex:1}
.hb-kicker{font-size:11.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.7px}
.hb-hero-h{font-size:19px;font-weight:800;letter-spacing:-.4px;margin:2px 0 3px;line-height:1.2}
.hb-hero-l{font-size:13px;color:var(--muted);line-height:1.35}
.hb-hero-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.hb-pill{font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:999px;background:var(--card-solid);border:1px solid var(--line);white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.hb-week{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line)}
.hb-wd{display:flex;flex-direction:column;align-items:center;gap:5px;font-size:11px;font-weight:700;color:var(--faint)}
.hb-wd i{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--accent) var(--p),color-mix(in srgb,var(--text) 9%,transparent) 0);position:relative}
.hb-wd i::after{content:"";position:absolute;inset:4px;border-radius:50%;background:var(--card-solid)}
.hb-wd i.full{background:linear-gradient(135deg,var(--accent),var(--accent2))}
.hb-wd i.full::after{display:none}
.hb-wd i svg{width:14px;height:14px;color:#fff;position:relative;z-index:1}
.hb-wd.is-today{color:var(--text)}
.hb-wd.is-today i{box-shadow:0 0 0 2px var(--bg2),0 0 0 4px var(--accent)}
.hb-wd.is-fut i{opacity:.45}

/* tiles */
.hb-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.hb-tile{position:relative;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:14px 6px 12px;display:flex;flex-direction:column;align-items:center;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;transition:transform .18s var(--ease),background .2s;touch-action:manipulation;outline:none}
.hb-tile:focus-visible{box-shadow:0 0 0 2px var(--accent)}
.hb-tile.is-press{transform:scale(.95)}
.hb-tile.is-dim{opacity:.62}
.hb-tname{font-weight:700;font-size:13.5px;margin-top:9px;max-width:100%;padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}
.hb-tsub{font-size:11.5px;color:var(--muted);margin-top:1px;text-align:center;max-width:100%;padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hb-tstreak{margin-top:7px;font-size:11.5px;font-weight:800;padding:3px 9px;border-radius:999px;background:rgba(245,158,11,.14);color:var(--warn)}
.hb-tstreak.is-zero{background:var(--card-solid);color:var(--faint);font-weight:700;border:1px solid var(--line)}
.hb-more{position:absolute;top:4px;right:4px;width:30px;height:30px;border:0;background:none;color:var(--faint);border-radius:10px;display:grid;place-items:center;cursor:pointer;z-index:2}
.hb-more svg{width:16px;height:16px}
.hb-more:active{background:var(--line)}

/* templates */
.hb-tpls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.hb-tpl{position:relative;border:1px solid var(--line);background:var(--card);border-radius:18px;padding:14px 6px 12px;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;text-align:center;transition:transform .15s var(--ease)}
.hb-tpl:active{transform:scale(.95)}
.hb-tpl-ic{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;font-size:23px;background:color-mix(in srgb,var(--hc) 18%,transparent);margin-bottom:5px}
.hb-tpl b{font-size:13px;font-weight:700}
.hb-tpl small{font-size:11px;color:var(--muted);line-height:1.25}
.hb-tpl-add{position:absolute;top:7px;right:7px;width:20px;height:20px;border-radius:50%;background:var(--hc);color:#fff;display:grid;place-items:center}
.hb-tpl-add svg{width:12px;height:12px}
.hb-intro{text-align:center;padding:22px 18px;background:radial-gradient(120% 100% at 50% 0%,var(--accent-soft),transparent 70%),var(--card)}
.hb-intro h3{margin:12px 0 4px;font-size:20px;font-weight:800;letter-spacing:-.4px}
.hb-intro p{margin:0;color:var(--muted);font-size:14px}
.hb-intro p b{color:var(--text);font-weight:600}
.hb-intro-rings{display:flex;justify-content:center;gap:14px}

/* list rows */
.hb-row{cursor:pointer;align-items:center}
.hb-row .ic{font-size:21px}
.hb-row-r{display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex:none}
.hb-row-r b{font-size:15px;font-weight:800;white-space:nowrap}
.hb-row-r small{font-size:11.5px;color:var(--muted);font-weight:600}
.hb-dots{display:flex;gap:5px;margin-top:8px}
.hb-dots span{display:flex;flex-direction:column;align-items:center;gap:3px}
.hb-dots em{font-style:normal;font-size:9.5px;font-weight:700;color:var(--faint)}
.hb-dots i{width:15px;height:15px;border-radius:50%;background:conic-gradient(var(--hc) var(--p),color-mix(in srgb,var(--text) 10%,transparent) 0)}
.hb-dots .on i{background:var(--hc);box-shadow:0 0 6px color-mix(in srgb,var(--hc) 50%,transparent)}
.hb-dots .off i{background:transparent;border:1.5px dashed color-mix(in srgb,var(--text) 18%,transparent)}
.hb-dots .today em{color:var(--text)}

/* detail */
.hb-dhead{display:flex;align-items:center;gap:12px;margin-bottom:14px}
.hb-dtitle{flex:1;min-width:0}
.hb-dtitle b{display:block;font-size:22px;font-weight:800;letter-spacing:-.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hb-dtitle small{color:var(--muted);font-size:12.5px}
.hb-dhead .icon-btn svg{width:20px;height:20px}
.hb-dcard{display:flex;flex-direction:column;align-items:center;padding:22px 16px 18px;background:radial-gradient(100% 80% at 50% 0%,color-mix(in srgb,var(--hc) 16%,transparent),transparent 70%),var(--card)}
.hb-dring{background:none;border:0;padding:0}
.hb-dtoday{font-size:17px;font-weight:800;margin-top:12px;text-align:center}
.hb-steps{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;justify-content:center}
.hb-steps .btn{min-width:48px;display:inline-flex;align-items:center;justify-content:center;gap:6px}
.hb-steps .btn svg{width:17px;height:17px;flex:none}
.hb-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.hb-stats .val small{font-size:13px;color:var(--muted);font-weight:600}
.hb-stats .progress{height:6px;margin-top:8px}
.hb-calg{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.hb-cal-h{text-align:center;font-size:11px;font-weight:700;color:var(--faint);padding-bottom:2px}
.hb-cal{aspect-ratio:1;border:0;border-radius:11px;font-size:12.5px;font-weight:700;cursor:pointer;color:var(--text);background:color-mix(in srgb,var(--hc) calc(var(--p)*100%),color-mix(in srgb,var(--text) 6%,transparent));transition:transform .15s}
.hb-cal:active{transform:scale(.9)}
.hb-cal.on{background:linear-gradient(135deg,var(--hc),color-mix(in srgb,var(--hc) 70%,#fff));color:#fff;box-shadow:0 4px 12px color-mix(in srgb,var(--hc) 35%,transparent)}
.hb-cal.off{background:transparent;color:var(--faint);border:1.5px dashed color-mix(in srgb,var(--text) 12%,transparent)}
.hb-cal.fut{background:transparent;color:var(--faint);opacity:.4;cursor:default}
.hb-cal.today{outline:2px solid var(--text);outline-offset:2px}
.hb-heat{display:grid;grid-template-rows:repeat(7,1fr);grid-auto-flow:column;grid-auto-columns:1fr;gap:3px}
.hb-heat i,.hb-heat-l i{aspect-ratio:1;border-radius:3px;background:color-mix(in srgb,var(--hc) calc(var(--p)*100%),color-mix(in srgb,var(--text) 7%,transparent))}
.hb-heat i.fut{opacity:.25}
.hb-heat-l{display:flex;align-items:center;justify-content:flex-end;gap:4px;margin-top:10px;font-size:11px;color:var(--faint);font-weight:600}
.hb-heat-l i{width:11px}
.hb-dactions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}

/* goals */
.hb-gsum{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}
.hb-gsum .stat{padding:12px 14px}
.hb-goal{cursor:pointer;padding:16px}
.hb-goal-top{display:flex;gap:12px;align-items:center}
.hb-goal-top .body{flex:1;min-width:0}
.hb-goal-top .title{font-weight:700}
.hb-goal-top .meta{color:var(--muted);font-size:12.5px;margin-top:2px;display:flex;gap:4px;flex-wrap:wrap}
.hb-gic{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;font-size:21px;flex:none}
.hb-gbar{position:relative;height:12px;border-radius:999px;background:color-mix(in srgb,var(--hc) 15%,transparent);margin-top:14px}
.hb-gbar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,var(--hc),color-mix(in srgb,var(--hc) 55%,#fff));transition:width 1s cubic-bezier(.2,.8,.2,1);min-width:0;box-shadow:0 0 12px color-mix(in srgb,var(--hc) 40%,transparent)}
.hb-gbar em{position:absolute;top:-4px;bottom:-4px;width:3px;border-radius:3px;background:var(--text);opacity:.55;transform:translateX(-50%)}
.hb-gbar.sm{height:7px;margin:0;flex:1}
.hb-goal-nums{display:flex;align-items:baseline;gap:6px;margin-top:10px}
.hb-goal-nums b{font-size:18px;font-weight:800;letter-spacing:-.3px}
.hb-goal-nums span{color:var(--muted);font-size:13px;flex:1}
.hb-goal-nums strong{font-size:15px;font-weight:800;color:var(--hc)}
.hb-goal-need{font-size:12.5px;color:var(--muted);margin-top:4px}
.hb-goal-need b{color:var(--text)}
.hb-goal-act{display:flex;gap:8px;align-items:center;margin-top:12px}
.hb-goal-act .btn{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:11px}
.hb-goal-act .btn svg{width:16px;height:16px}
.hb-gtpls{display:flex;flex-wrap:wrap;gap:8px}
.hb-gpct{display:flex;flex-direction:column;gap:2px}
.hb-gpct b{font-size:30px;font-weight:800;letter-spacing:-1px}
.hb-gpct small{font-size:20px}
.hb-miles{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.hb-miles div{display:flex;flex-direction:column;align-items:center;gap:5px;font-size:11.5px;color:var(--muted);font-weight:700}
.hb-miles b{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-size:12px;border:2px dashed color-mix(in srgb,var(--text) 18%,transparent);color:var(--faint)}
.hb-miles .on b{border:0;background:linear-gradient(135deg,var(--hc),color-mix(in srgb,var(--hc) 60%,#fff));color:#fff;box-shadow:0 6px 14px color-mix(in srgb,var(--hc) 35%,transparent)}
.hb-miles b svg{width:20px;height:20px}
.hb-miles .on span{color:var(--text)}

/* home */
.hb-home{padding:14px}
.hb-home-sum{display:flex;align-items:center;gap:12px}
.hb-home-sum b{display:block;font-weight:700}
.hb-home-sum small{color:var(--muted);font-size:12.5px}
.hb-home-row{display:flex;gap:12px;overflow-x:auto;margin:14px -14px 0;padding:2px 14px 2px;scrollbar-width:none}
.hb-home-row::-webkit-scrollbar{display:none}
.hb-hitem{flex:none;width:64px;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;transition:transform .15s var(--ease);touch-action:manipulation}
.hb-hitem.is-press{transform:scale(.92)}
.hb-hitem span{font-size:11px;font-weight:600;color:var(--muted);max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hb-home-goal{display:flex;align-items:center;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line);cursor:pointer;font-size:13px}
.hb-home-goal b{font-size:13px;font-weight:800;min-width:34px;text-align:right}
.hb-home-empty{display:flex;align-items:center;gap:14px;cursor:pointer}
.hb-home-empty b{display:block}
.hb-home-empty small{color:var(--muted);font-size:12.5px}
.hb-mini-rings{display:flex;flex:none}
.hb-mini-rings span{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-size:17px;border:3px solid var(--hc);background:var(--card-solid);margin-left:-10px}
.hb-mini-rings span:first-child{margin-left:0}

/* modals */
.hb-m [hidden]{display:none!important}
.hb-m h4{font-size:19px!important}
.hb-mscroll{max-height:min(64vh,560px);overflow-y:auto;margin:0 -18px;padding:0 18px;overscroll-behavior:contain}
.hb-lbl{font-size:12.5px;font-weight:700;color:var(--muted);margin:12px 0 7px;text-transform:uppercase;letter-spacing:.5px}
.hb-name-row{display:flex;gap:10px;align-items:flex-start}
.hb-name-row input{flex:1;margin-bottom:0!important}
.hb-emo-btn{flex:none;width:50px;height:50px;border-radius:14px;border:1px solid var(--line);background:var(--card);font-size:25px;cursor:pointer;display:grid;place-items:center}
.hb-emojis{display:flex;gap:6px;overflow-x:auto;padding:2px 0 6px;scrollbar-width:none}
.hb-emojis::-webkit-scrollbar{display:none}
.hb-emojis button{flex:none;width:42px;height:42px;border-radius:12px;border:1px solid var(--line);background:var(--card);font-size:21px;cursor:pointer}
.hb-emojis button.on{border-color:var(--accent);background:var(--accent-soft);box-shadow:0 0 0 2px var(--accent) inset}
.hb-colors{display:flex;gap:9px;flex-wrap:wrap}
.hb-colors button{width:30px;height:30px;border-radius:50%;border:0;cursor:pointer;box-shadow:0 0 0 2px var(--bg2)}
.hb-colors button.on{box-shadow:0 0 0 2px var(--bg2),0 0 0 4px var(--text)}
.hb-mseg{margin-bottom:10px}
.hb-mseg button{font-size:12.5px;padding:9px 4px}
.hb-row2{display:grid;grid-template-columns:1fr 1.25fr 1fr;gap:8px}
.hb-row2.two{grid-template-columns:1fr 1fr;margin-top:10px}
.hb-row2 small{display:block;font-size:11.5px;color:var(--muted);font-weight:600;margin:0 0 4px 2px}
.hb-row2 input{margin-bottom:6px!important;padding:11px!important}
.hb-days{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-bottom:6px}
.hb-days button{aspect-ratio:1;border-radius:50%;border:1px solid var(--line);background:var(--card);font-weight:700;font-size:12.5px;cursor:pointer;color:var(--muted)}
.hb-days button.on{background:var(--accent);border-color:var(--accent);color:#fff}
.hb-stepper{display:flex;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:6px;margin-bottom:6px}
.hb-stepper button{width:40px;height:40px;border-radius:11px;border:0;background:var(--accent-soft);color:var(--accent);font-size:22px;font-weight:700;cursor:pointer}
.hb-stepper b{font-size:20px;font-weight:800;min-width:20px;text-align:center}
.hb-stepper span{flex:1;color:var(--muted);font-weight:600}
.hb-rem{display:flex;align-items:center;gap:10px;min-height:48px}
.hb-rem span{flex:1;font-weight:600;font-size:14px}
.hb-rem input{width:auto!important;margin:0!important;padding:9px 10px!important}
.hb-toggle{flex:none;width:50px;height:30px;border-radius:999px;border:0;background:var(--faint);position:relative;cursor:pointer;transition:background .2s}
.hb-toggle i{position:absolute;left:3px;top:3px;width:24px;height:24px;border-radius:50%;background:#fff;transition:transform .2s var(--ease)}
.hb-toggle.on{background:var(--good)}
.hb-toggle.on i{transform:translateX(20px)}
.hb-err{color:var(--bad);font-size:13px;font-weight:600;min-height:0;margin-top:8px}
.hb-err:empty{display:none}
.hb-err.show{animation:hbShake .35s}
@keyframes hbShake{25%{transform:translateX(-5px)}75%{transform:translateX(5px)}}
.hb-mp{color:var(--muted);font-size:13.5px;margin:-4px 0 12px}
.hb-mp b{color:var(--text)}
.hb-quick{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.hb-sheet h4{text-align:center;margin-bottom:10px!important}
.hb-sheet-b{width:100%;display:flex;align-items:center;gap:12px;padding:14px;border:0;border-bottom:1px solid var(--line);background:none;font-weight:600;font-size:15px;cursor:pointer;text-align:left;color:var(--text)}
.hb-sheet-b span{width:34px;height:34px;border-radius:10px;background:var(--card);display:grid;place-items:center;font-size:17px;flex:none}
.hb-sheet-b.danger{color:var(--bad);border-bottom:0}
.hb-sheet-b:active{background:var(--card)}
@media (max-width:360px){.hb-grid,.hb-tpls{grid-template-columns:repeat(2,minmax(0,1fr))}.hb-hero-top{flex-direction:column;text-align:center}.hb-hero-chips{justify-content:center}}
@media (prefers-reduced-motion:reduce){.hb-arc,.hb-gbar i{transition:none}.hb-ring.hb-pop,.hb-ring.hb-pop .hb-emo,.hb-ring.hb-pop .hb-tick{animation:none}}
`);

/* ---------------------------------------------------------
   REGISTER
   --------------------------------------------------------- */
J.addView({id:'habits', label:'Habits', icon:'🔥', color:'#f97316', order:20, render(el){
  try { bind(el); paint(el, viewHTML); } catch(e){ console.error('habits view', e); el.innerHTML = '<div class="empty">Habits could not load. Please reopen the app.</div>'; }
}});
J.addHomeCard({id:'habits', order:30, render(el){
  try { bind(el); paint(el, homeHTML); } catch(e){ console.error('habits home', e); }
}});
J.addIntent((said, t)=>{ try { return intent(said, t); } catch(e){ console.error('habits intent', e); return null; } });
J.addSuggestions(['I worked out', 'How are my habits?', "What's my streak for workout?", 'Add a habit to read every day', 'How are my goals?']);

} catch(e){ console.error('habits feature failed to load', e); }
})();
