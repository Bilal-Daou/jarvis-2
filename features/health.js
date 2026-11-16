/* =========================================================
   Jarvis 2.0 · iPhone Health (and Clock alarms) through the Action Button Shortcut
   - A web app can't read Apple Health, Clock alarms or Calendar by itself. The free route:
     the Shortcut that opens Jarvis gathers them first and opens
       https://…/jarvis-2/#sync=<URL-encoded text>
     Text, one block per part (every part optional; "[name]" on its own line, then its lines):
       [calendar]  Title|Start|End|Location        (same lines as the old #cal= link)
       [steps]     8,432 steps                     (Find Health Samples, today, grouped by day)
       [energy]    512 kcal                        (Active Energy, today)
       [heart]     58 count/min                    (Resting Heart Rate, latest)
       [weight]    82.5 kg                         (Weight, latest)
       [sleep]     Asleep Core|<start>|<end>       (Sleep Analysis, last day, one line per sample)
       [workouts]  Running|<start>|<end>|310 kcal  (Workouts, today)
       [alarms]    Wake up|7:00 AM|Yes             (Get All Alarms: label | time | on)
     Also read: base64 / base64url of that text, or JSON ({"steps":8432,"sleep":[…],…}).
   - Health screen, a Today card, a Home tile (Jarvis.health.tile()), morning-brief line, voice answers.
   - Old #cal= links keep working (features/calendar.js).
   Everything stays on this device. No server, no keys.
   ========================================================= */
(function(){
try {
const J = window.Jarvis; if (!J) return;
const S = J.settings, esc = J.esc;
const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
const st = J.store('health', {
  syncedAt: 0, syncCount: 0, steps: null, energy: null, heart: null, weight: null, sleep: null,
  workouts: [], alarms: null, history: {}, last: null, goal: 8000, tile: 'auto', tipHidden: false
});
if (!st.history || typeof st.history !== 'object') st.history = {};
if (!Array.isArray(st.workouts)) st.workouts = [];
if (!(st.goal > 0)) st.goal = 8000;

const p2 = n => String(n).padStart(2, '0');
const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`; };
const todayKey = () => dayKey(Date.now());
const startOfDay = ms => { const d = new Date(ms); d.setHours(0,0,0,0); return d.getTime(); };
const N0 = new Intl.NumberFormat('en-US', {maximumFractionDigits: 0});
const N1 = new Intl.NumberFormat('en-US', {maximumFractionDigits: 1});
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const tfmt = ms => new Date(ms).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
const tsay = ms => tfmt(ms).replace(/:00(?=\s?[AP]M)/i, '');
function hm(min){ min = Math.round(min); const h = Math.floor(min/60), m = min%60; return h ? `${h}h${m ? ` ${p2(m)}m` : ''}` : `${m}m`; }
function hmSay(min){ min = Math.round(min); const h = Math.floor(min/60), m = min%60; return h ? `${plural(h,'hour')}${m ? ` ${m} minute${m===1?'':'s'}` : ''}` : plural(m, 'minute'); }
/** "just now", "12 minutes ago", "at 8:05 this morning", "yesterday at 9 PM", "on Monday" */
function agoSay(ms){
  const s = (Date.now() - ms)/1000;
  if (s < 120) return 'just now';
  if (s < 3600) return `${Math.floor(s/60)} minutes ago`;
  const d0 = startOfDay(Date.now());
  if (ms >= d0){ const h = new Date(ms).getHours(); return `at ${tsay(ms)} ${h < 12 ? 'this morning' : h < 17 ? 'this afternoon' : 'this evening'}`; }
  if (ms >= d0 - DAY) return `yesterday at ${tsay(ms)}`;
  return 'on ' + new Date(ms).toLocaleDateString([], {weekday: 'long'});
}
function agoShort(ms){
  if (!ms) return 'never';
  const s = (Date.now() - ms)/1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s/60)} min ago`;
  if (ms >= startOfDay(Date.now())) return `today ${tfmt(ms)}`;
  if (ms >= startOfDay(Date.now()) - DAY) return `yesterday ${tfmt(ms)}`;
  return new Date(ms).toLocaleDateString([], {month: 'short', day: 'numeric'});
}

/* =========================================================
   1. Reading what the Shortcut sends
   ========================================================= */
function urlDecode(s){
  try { return decodeURIComponent(s); }
  catch(e){ return s.replace(/(%[0-9a-f]{2})+/gi, run => { try { return decodeURIComponent(run); } catch(_){ return run; } }); }
}
function b64ToText(s){
  let b = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  b += '==='.slice((b.length + 3) % 4);
  const bin = atob(b);
  return new TextDecoder('utf-8').decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
/** any date the Shortcut may send: the calendar reader's (ISO 8601 and English formats), else the browser's */
function pd(raw){
  const s = String(raw || '').trim(); if (!s || !/\d/.test(s)) return null;
  try { if (J.calendar && J.calendar.parseDate){ const d = J.calendar.parseDate(s); if (d) return d; } } catch(e){}
  if (!/\d{4}|\d{1,2}:\d{2}/.test(s) || /^\d+([.,]\d+)?$/.test(s)) return null;
  const ms = Date.parse(s); if (!isFinite(ms)) return null;
  return {ms, dateOnly: !/\d{1,2}:\d{2}/.test(s)};
}
const ALIAS = {
  calendar:'calendar', cal:'calendar', events:'calendar', 'calendar events':'calendar', agenda:'calendar',
  steps:'steps', step:'steps', 'step count':'steps',
  energy:'energy', 'active energy':'energy', active:'energy', 'active calories':'energy', calories:'energy', move:'energy', burned:'energy',
  heart:'heart', 'heart rate':'heart', 'resting heart rate':'heart', 'resting heart':'heart', rhr:'heart', hr:'heart', pulse:'heart', resting:'heart',
  weight:'weight', 'body mass':'weight', 'body weight':'weight',
  sleep:'sleep', 'sleep analysis':'sleep',
  workouts:'workouts', workout:'workouts', exercise:'workouts',
  alarms:'alarms', alarm:'alarms', clock:'alarms',
  v:'meta', version:'meta', at:'meta', sent:'meta', jarvis:'meta', j2:'meta'
};
const aliasOf = k => ALIAS[String(k || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()];
const VALUE_PARTS = ['steps', 'energy', 'heart', 'weight', 'meta'];

/** JSON payload → the same sections the text format gives */
function jsonToSections(o){
  const sec = {}, unknown = [];
  const iso = v => typeof v === 'number' && v > 1e11 ? new Date(v).toISOString() : String(v == null ? '' : v);
  Object.keys(o || {}).forEach(k=>{
    const key = aliasOf(k); const v = o[k];
    if (!key){ unknown.push(k); return; }
    const arr = Array.isArray(v) ? v : v == null ? [] : typeof v === 'string' ? v.split(/\r\n?|\n/) : [v];
    sec[key] = arr.map(x=>{
      if (x == null) return '';
      if (typeof x !== 'object') return String(x);
      if (key === 'calendar') return [x.title || x.name || 'Event', iso(x.start), iso(x.end), x.location || x.loc || '', x.allDay ? 'yes' : ''].join('|').replace(/\|+$/, '');
      if (key === 'sleep') return [x.value || x.stage || x.type || 'Asleep', iso(x.start), iso(x.end)].join('|');
      if (key === 'workouts') return [x.type || x.name || 'Workout', iso(x.start), iso(x.end), x.kcal != null ? x.kcal + ' kcal' : (x.energy || '')].join('|');
      if (key === 'alarms') return [x.label || x.name || 'Alarm', x.time || iso(x.at), x.on == null ? (x.enabled == null ? '' : String(x.enabled)) : String(x.on)].join('|').replace(/\|+$/, '');
      return x.value != null ? String(x.value) + (x.unit ? ' ' + x.unit : '') : '';
    }).filter(l => l !== '');
  });
  return {sec, unknown};
}
/** the text format: "[part]" headers (or "part=value" lines); with no headers at all it's an old calendar-only payload */
function textToSections(text){
  const sec = {}, unknown = []; let cur = null, sawHeader = false;
  const lines = text.split(/\r\n?|\n|\u2028|\u2029/);
  lines.forEach(raw=>{
    const l = raw.replace(/^\uFEFF/, '').replace(/\s+$/, '');
    if (!l.trim()){ return; }
    let m = l.match(/^\s*\[\s*([a-z][a-z0-9 _+-]{0,30}?)\s*\]\s*[:=]?\s*(.*)$/i);
    if (m){
      sawHeader = true; const key = aliasOf(m[1]);
      if (!key){ unknown.push(m[1]); cur = '_skip'; return; }
      cur = key; if (!sec[key]) sec[key] = [];
      if (m[2].trim()) sec[key].push(m[2].trim());
      return;
    }
    // "steps=8432" / "weight: 82 kg" (only outside the list parts, and never on a line with "|")
    if ((!cur || VALUE_PARTS.includes(cur)) && !l.includes('|') && (m = l.match(/^\s*([a-z][a-z _-]{0,24}?)\s*[=:]\s*(.*)$/i)) && aliasOf(m[1])){
      sawHeader = true; const key = aliasOf(m[1]); cur = key; if (!sec[key]) sec[key] = [];
      if (m[2].trim()) sec[key].push(m[2].trim());
      return;
    }
    if (cur === '_skip') return;
    if (!cur){ (sec._loose = sec._loose || []).push(l); return; }
    sec[cur].push(l);
  });
  if (sec._loose){
    if (!sawHeader && sec._loose.some(l => l.includes('|'))) sec.calendar = sec._loose; // a plain #cal= style payload sent as #sync=
    delete sec._loose;
  }
  return {sec, unknown};
}
function decodeSync(raw){
  let s = String(raw || '').slice(0, 200000);
  s = urlDecode(s);
  if (!/[\n\[|{]/.test(s) && /%(0A|5B|7C|7B)/i.test(s)) s = urlDecode(s); // URL-encoded twice
  s = s.trim();
  let via = 'text';
  if (s && !/[\n\[|{=:]/.test(s.replace(/=+$/, '')) && /^[A-Za-z0-9+/_\-\s]+=*$/.test(s) && s.length >= 8){
    try { const t = b64ToText(s); if (/[\[|{=]/.test(t) && !/[\u0000-\u0008\uFFFD]/.test(t)){ s = t.trim(); via = 'base64'; } } catch(e){}
  }
  if (/^\{[\s\S]*\}$/.test(s)){
    try { const o = JSON.parse(s); const r = jsonToSections(o); r.via = via === 'base64' ? 'base64 JSON' : 'JSON'; return r; } catch(e){ /* fall through: read as text */ }
  }
  const r = textToSections(s); r.via = via; return r;
}

/* ---------- numbers ---------- */
/** "8,432 steps", "8 432", "8.432" (German), "82,5 kg", "181.9 lb", "58 count/min", "2 145 kJ" → {n, unit} */
function parseQty(line, kind){
  const s = String(line == null ? '' : line).replace(/[\u00a0\u202f\u2009\u2007']/g, ' ');
  const m = s.match(/-?\d[\d.,]*(?: \d{3}(?!\d))*(?:[.,]\d+)?/); if (!m) return null;
  let ns = m[0].replace(/[.,]+$/, '');
  if (/ /.test(ns)) ns = ns.replace(/ /g, '');
  const dot = ns.lastIndexOf('.'), com = ns.lastIndexOf(',');
  const counting = kind === 'steps' || kind === 'energy';
  if (dot >= 0 && com >= 0){ const dec = dot > com ? '.' : ','; ns = ns.split(dec === '.' ? ',' : '.').join('').replace(dec, '.'); }
  else if (dot >= 0 || com >= 0){
    const sep = com >= 0 ? ',' : '.', parts = ns.split(sep);
    const thousands = parts.length > 2 || (parts[1].length === 3 && (counting || (sep === ',' && kind !== 'weight' && kind !== 'heart')));
    ns = thousands ? parts.join('') : parts.join('.');
  }
  const n = parseFloat(ns); if (!isFinite(n)) return null;
  const rest = s.slice(m.index + m[0].length).toLowerCase();
  let unit = '';
  if (/^\s*(kg|kgs|kilo|kilos|kilograms?)\b/.test(rest)) unit = 'kg';
  else if (/^\s*(lb|lbs|pounds?)\b/.test(rest)) unit = 'lb';
  else if (/^\s*(st|stone)\b/.test(rest)) unit = 'st';
  else if (/^\s*(kj|kilojoules?)\b/.test(rest)) unit = 'kJ';
  else if (/^\s*(kcal|cal|calories|kilocalories)\b/.test(rest)) unit = 'kcal';
  else if (/^\s*(km|kilomet(er|re)s?)\b/.test(rest)) unit = 'km';
  else if (/^\s*(mi|miles?)\b/.test(rest)) unit = 'mi';
  else if (/^\s*(m|met(er|re)s?)\b/.test(rest)) unit = 'm';
  else if (/^\s*(min|mins|minutes?)\b/.test(rest)) unit = 'min';
  return {n, unit};
}
const numbersIn = (lines, kind) => (lines || []).map(l => parseQty(l, kind)).filter(Boolean);

/* ---------- sleep ---------- */
function stageOf(w){
  const s = String(w || '').toLowerCase().trim();
  if (/^0$/.test(s) || /in ?bed/.test(s)) return 'inbed';
  if (/^2$/.test(s) || /awake|wake/.test(s)) return 'awake';
  if (/^4$/.test(s) || /deep/.test(s)) return 'deep';
  if (/^5$/.test(s) || /\brem\b/.test(s)) return 'rem';
  if (/^3$/.test(s) || /core|light/.test(s)) return 'core';
  return 'asleep'; // "Asleep", "Asleep (Unspecified)", "1", or no label at all
}
function union(list){ // minutes covered by intervals, overlaps (iPhone + Watch) counted once
  const a = list.slice().sort((x,y)=>x.s-y.s); let tot = 0, cs = -1, ce = -1;
  a.forEach(x=>{ if (x.s > ce){ if (ce > cs) tot += ce - cs; cs = x.s; ce = x.e; } else if (x.e > ce) ce = x.e; });
  if (ce > cs) tot += ce - cs;
  return tot / MIN;
}
const ASLEEP = ['core', 'deep', 'rem', 'asleep'];
function parseSleep(lines, now){
  const iv = []; let bad = 0;
  (lines || []).forEach(l=>{
    const f = l.split('|').map(x=>x.trim()); const dates = [], words = [];
    f.forEach(x=>{ const d = pd(x); if (d && !d.dateOnly) dates.push(d.ms); else if (x) words.push(x); });
    if (dates.length < 2){ bad++; return; }
    let s = dates[0], e = dates[1]; if (e < s){ const t = s; s = e; e = t; }
    if (e - s <= 0 || e - s > 16*HOUR){ bad++; return; }
    iv.push({s, e, k: stageOf(words.join(' '))});
  });
  const win = iv.filter(x => x.e <= now + 15*MIN && x.e >= now - 30*HOUR).sort((a,b)=>a.s-b.s);
  // nights: samples less than 3 hours apart belong together
  const nights = []; let cur = null;
  win.forEach(x=>{ if (!cur || x.s - cur.end > 3*HOUR){ cur = {items:[], start:x.s, end:x.e}; nights.push(cur); } cur.items.push(x); cur.end = Math.max(cur.end, x.e); });
  const scored = nights.map(n=>{
    const sl = n.items.filter(x=>ASLEEP.includes(x.k)), bed = n.items.filter(x=>x.k==='inbed');
    const asleep = union(sl), inBed = union(bed);
    const stages = {}; ['core','deep','rem','awake'].forEach(k=>{ const m = union(n.items.filter(x=>x.k===k)); if (m) stages[k] = Math.round(m); });
    const main = sl.length ? sl : bed;
    const start = main.length ? Math.min(...main.map(x=>x.s)) : n.start, end = main.length ? Math.max(...main.map(x=>x.e)) : n.end;
    return {asleep, inBed, stages, start, end};
  }).filter(n => (n.asleep || n.inBed) >= 30);
  if (!scored.length) return {night: null, bad, samples: iv.length};
  const real = scored.filter(n => (n.asleep || n.inBed) >= 180);
  const pick = real.length ? real[real.length-1] : scored.reduce((a,b)=> (b.asleep||b.inBed) > (a.asleep||a.inBed) ? b : a);
  return {night: {
    day: dayKey(pick.end), start: pick.start, end: pick.end,
    asleep: pick.asleep ? Math.round(pick.asleep) : null, inBed: pick.inBed ? Math.round(pick.inBed) : null,
    stages: Object.keys(pick.stages).length > 1 || pick.stages.deep || pick.stages.rem ? pick.stages : null, at: now
  }, bad, samples: iv.length};
}

/* ---------- workouts ---------- */
function prettyWorkout(n){
  let s = String(n || '').replace(/^HKWorkoutActivityType/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();
  if (!s || /^\d+$/.test(s)) s = 'Workout';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/\bhiit\b/, 'HIIT');
}
function parseWorkouts(lines, now){
  const out = []; let bad = 0;
  (lines || []).forEach(l=>{
    const f = l.split('|').map(x=>x.trim()); let s = null, e = null; const words = [], extra = [];
    f.forEach(x=>{ const d = !/^\d+([.,]\d+)?\s*[a-z/]*$/i.test(x) ? pd(x) : null;
      if (d && !d.dateOnly && s == null) s = d.ms; else if (d && !d.dateOnly && e == null) e = d.ms;
      else if (s == null && x) words.push(x); else if (x) extra.push(x); });
    if (s == null){ bad++; return; }
    if (e == null || e < s) e = s;
    let kcal = null, km = null, min = Math.round((e - s)/MIN) || null;
    extra.forEach(x=>{ const q = parseQty(x, 'energy'); if (!q) return;
      if (q.unit === 'km') km = q.n; else if (q.unit === 'mi') km = q.n * 1.609; else if (q.unit === 'm') km = q.n / 1000;
      else if (q.unit === 'kJ') kcal = q.n / 4.184; else if (q.unit === 'min'){ if (!min) min = q.n; }
      else if (kcal == null) kcal = q.n; });
    out.push({name: prettyWorkout(words.join(' ')), start: s, end: e, min, kcal: kcal != null ? Math.round(kcal) : null, km: km != null ? Math.round(km*100)/100 : null});
  });
  const seen = new Set();
  return {list: out.filter(w => w.start > now - 8*DAY && w.start <= now + HOUR).filter(w=>{ const k = w.name + w.start; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a,b)=>a.start-b.start), bad};
}

/* ---------- Clock alarms ---------- */
const FLAG = /^(yes|no|on|off|true|false|enabled|disabled|1|0)$/i;
function parseAlarms(lines){
  const out = []; let bad = 0;
  (lines || []).forEach(l=>{
    const f = l.split('|').map(x=>x.trim()).filter(Boolean); let h = null, m = null, on = null; const words = [];
    f.forEach(x=>{
      if (FLAG.test(x)){ on = /^(yes|on|true|enabled|1)$/i.test(x); return; }
      if (h == null){
        const d = /\d{4}-\d{2}-\d{2}T/.test(x) ? pd(x) : null;
        if (d && !d.dateOnly){ const t = new Date(d.ms); h = t.getHours(); m = t.getMinutes(); return; }
        const t = x.match(/(\d{1,2})[:.h](\d{2})(?:[:.]\d{2})?\s*(a\.?m\.?|p\.?m\.?)?/i);
        if (t){ let hh = +t[1]; const ap = (t[3] || '').replace(/\./g, '').toLowerCase();
          if (ap === 'pm' && hh < 12) hh += 12; if (ap === 'am' && hh === 12) hh = 0;
          if (hh < 24 && +t[2] < 60){ h = hh; m = +t[2];
            const rest = x.replace(t[0], '').replace(/\b(?:[a-z]{3,9},? )?[a-z]{3,9}\.? \d{1,2},? \d{4}\b|\d{4}-\d{2}-\d{2}|\bat\b/ig, '').replace(/[\s,·-]+/g, ' ').trim();
            if (rest && !/^\d+$/.test(rest)) words.push(rest); return; } }
      }
      words.push(x);
    });
    if (h == null){ bad++; return; }
    const label = words.join(' ').replace(/\s+/g, ' ').trim();
    out.push({label: label && !/^alarm$/i.test(label) ? label.slice(0, 60) : '', h, m, on});
  });
  const seen = new Set();
  return {list: out.filter(a=>{ const k = a.h + ':' + a.m + '|' + a.label.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a,b)=>(a.h*60+a.m)-(b.h*60+b.m)), bad};
}
const alarmTime = a => { const d = new Date(); d.setHours(a.h, a.m, 0, 0); return tfmt(d.getTime()); };
function nextAlarmAt(a, now){ const d = new Date(now); d.setHours(a.h, a.m, 0, 0); if (d.getTime() <= now) d.setDate(d.getDate() + 1); return d.getTime(); }

/* =========================================================
   2. Applying a sync
   ========================================================= */
function hist(day){ return st.history[day] || (st.history[day] = {}); }
function trimHistory(){ const keys = Object.keys(st.history).sort(); while (keys.length > 120) delete st.history[keys.shift()]; }
const kg = (n, unit) => unit === 'lb' ? n * 0.45359237 : unit === 'st' ? n * 6.35029318 : n;
const guessWeightUnit = () => /^en-(US|LR|MM)$/i.test(navigator.language || '') ? 'lb' : 'kg';

function applySections(dec, size){
  const now = Date.now(), day = dayKey(now), sec = dec.sec, got = {};
  // calendar: hand it to the calendar feature (the same reader as #cal=)
  if (sec.calendar){
    try { if (J.calendar && J.calendar.applySync){ const res = J.calendar.applySync(sec.calendar.join('\n')); got.calendar = {ok: true, n: res.events.length, bad: res.bad}; } else got.calendar = {ok: false, why: 'no calendar feature'}; }
    catch(e){ got.calendar = {ok: false, why: 'unreadable'}; }
  }
  if (sec.steps){ const q = numbersIn(sec.steps, 'steps').filter(q => q.n >= 0 && q.n < 200000);
    if (q.length){ const v = Math.round(q.reduce((a,b)=>a+b.n, 0)); if (v < 200000){ st.steps = {v, day, at: now}; Object.assign(hist(day), {steps: v, stepsAt: now}); got.steps = {ok: true, v}; } else got.steps = {ok: false, why: 'too big'}; }
    else got.steps = {ok: false, why: sec.steps.length ? 'unreadable' : 'empty'}; }
  if (sec.energy){ const q = numbersIn(sec.energy, 'energy').filter(q => q.n >= 0);
    if (q.length){ const v = Math.round(q.reduce((a,b)=>a + (b.unit === 'kJ' ? b.n/4.184 : b.n), 0)); if (v < 20000){ st.energy = {v, day, at: now}; Object.assign(hist(day), {energy: v}); got.energy = {ok: true, v}; } else got.energy = {ok: false, why: 'too big'}; }
    else got.energy = {ok: false, why: sec.energy.length ? 'unreadable' : 'empty'}; }
  if (sec.heart){ const q = numbersIn(sec.heart, 'heart').find(q => q.n >= 25 && q.n <= 230);
    if (q){ st.heart = {v: Math.round(q.n), at: now}; Object.assign(hist(day), {heart: Math.round(q.n)}); got.heart = {ok: true, v: Math.round(q.n)}; }
    else got.heart = {ok: false, why: sec.heart.length ? 'unreadable' : 'empty'}; }
  if (sec.weight){ const q = numbersIn(sec.weight, 'weight')[0];
    if (q){ const unit = q.unit === 'lb' || q.unit === 'st' || q.unit === 'kg' ? q.unit : (st.weight && st.weight.unit) || guessWeightUnit();
      const k = kg(q.n, unit);
      if (k >= 20 && k <= 350){ const u = unit === 'st' ? 'kg' : unit; st.weight = {kg: Math.round(k*100)/100, unit: u, at: now}; Object.assign(hist(day), {weight: st.weight.kg}); got.weight = {ok: true, v: st.weight.kg, unit: st.weight.unit}; }
      else got.weight = {ok: false, why: 'out of range'}; }
    else got.weight = {ok: false, why: sec.weight.length ? 'unreadable' : 'empty'}; }
  if (sec.sleep){ const r = parseSleep(sec.sleep, now);
    if (r.night){ st.sleep = r.night; Object.assign(hist(r.night.day), {sleep: r.night.asleep || r.night.inBed}); got.sleep = {ok: true, v: r.night.asleep || r.night.inBed, n: r.samples}; }
    else got.sleep = {ok: !!sec.sleep.length && !r.bad, none: true, why: sec.sleep.length ? (r.bad >= sec.sleep.length ? 'unreadable dates' : 'no sleep last night') : 'empty', n: r.samples}; }
  if (sec.workouts){ const r = parseWorkouts(sec.workouts, now);
    // the Shortcut sends today's workouts: keep earlier days we already had, replace today
    const t0 = startOfDay(now);
    st.workouts = st.workouts.filter(w => w.start < t0 && w.start > now - 8*DAY).concat(r.list.filter(w => w.start >= t0 - 7*DAY)).filter((w,i,a)=>a.findIndex(x=>x.start===w.start && x.name===w.name)===i).sort((a,b)=>a.start-b.start);
    got.workouts = {ok: !r.bad || !!r.list.length, n: r.list.filter(w=>w.start >= t0).length}; }
  if (sec.alarms){ const r = parseAlarms(sec.alarms);
    st.alarms = {list: r.list, at: now}; got.alarms = {ok: !r.bad || !!r.list.length, n: r.list.length}; }
  trimHistory();
  const parts = Object.keys(got);
  st.syncedAt = now; st.syncCount = (st.syncCount || 0) + 1;
  st.last = {at: now, got, size: size || 0, via: dec.via, unknown: dec.unknown.slice(0, 6), empty: !parts.length};
  J.save();
  return st.last;
}
/** "#sync=…" (or the raw text after it) → applied; returns what arrived */
function applyPayload(raw){
  const size = String(raw || '').length;
  let dec;
  try { dec = decodeSync(raw); } catch(e){ dec = {sec: {}, unknown: [], via: 'unreadable'}; }
  return applySections(dec, size);
}
function syncMessage(last){
  if (!last) return '';
  if (last.empty) return "Jarvis opened from your Shortcut, but nothing came with it. Check the setup steps.";
  const g = last.got, bits = [];
  if (g.calendar && g.calendar.ok) bits.push(`${plural(g.calendar.n, 'event')}`);
  if (g.steps && g.steps.ok) bits.push(`${N0.format(g.steps.v)} steps`);
  if (g.sleep && g.sleep.ok && !g.sleep.none) bits.push(`${hm(g.sleep.v)} sleep`);
  if (g.heart && g.heart.ok) bits.push(`${g.heart.v} bpm resting`);
  if (g.alarms && g.alarms.ok) bits.push(`${plural(g.alarms.n, 'alarm')}`);
  const bad = Object.keys(g).filter(k => !g[k].ok).length;
  if (!bits.length) return bad ? 'Synced, but I could not read it. Open Health → Check the last sync.' : 'Synced from your iPhone';
  return 'Synced · ' + bits.slice(0, 3).join(' · ') + (bad ? ' · one part was unreadable' : '');
}
let pendingMsg = '';
function readHash(fromEvent){
  const h = location.hash || '';
  if (!/^#sync=/i.test(h)) return;
  let last = null;
  try { last = applyPayload(h.slice(6)); } catch(e){ console.error('health sync', e); }
  try { history.replaceState(null, '', location.pathname + location.search); } catch(e){}
  pendingMsg = syncMessage(last);
  if (fromEvent){ try { J.toast(pendingMsg); } catch(e){} pendingMsg = ''; J.renderAll(); }
}
readHash(false);
window.addEventListener('hashchange', () => readHash(true));
document.addEventListener('DOMContentLoaded', ()=>{ if (pendingMsg) setTimeout(()=>{ try { J.toast(pendingMsg); } catch(e){} pendingMsg = ''; }, 450); });

/* =========================================================
   3. What we know (freshness rules)
   ========================================================= */
const stepsToday = () => st.steps && st.steps.day === todayKey() ? st.steps : null;
const energyToday = () => st.energy && st.energy.day === todayKey() ? st.energy : null;
/** last night's sleep: the night that ended today (or after 6 PM yesterday) */
function lastNight(){ const s = st.sleep; if (!s || !s.end) return null; return s.end > startOfDay(Date.now()) - 6*HOUR ? s : null; }
const workoutsToday = () => st.workouts.filter(w => w.start >= startOfDay(Date.now()));
function weekSteps(){ // last 7 days, oldest first: {day, v, label}
  const out = [];
  for (let i = 6; i >= 0; i--){ const d = startOfDay(Date.now()) - i*DAY + 12*HOUR; const k = dayKey(d); const h = st.history[k]; out.push({day: k, v: h && h.steps != null ? h.steps : null, label: new Date(d).toLocaleDateString([], {weekday: 'narrow'}), today: i === 0}); }
  return out;
}
function weekSleep(){
  const out = [];
  for (let i = 6; i >= 0; i--){ const d = startOfDay(Date.now()) - i*DAY + 12*HOUR; const k = dayKey(d); const h = st.history[k]; out.push({day: k, v: h && h.sleep != null ? h.sleep : null, label: new Date(d).toLocaleDateString([], {weekday: 'narrow'}), today: i === 0}); }
  return out;
}
function weightTrend(){ // vs the closest reading 5-10 days earlier
  if (!st.weight) return null;
  const now = st.weight.at, keys = Object.keys(st.history).sort().reverse();
  for (const k of keys){ const h = st.history[k]; if (h.weight == null) continue; const t = new Date(k + 'T12:00:00').getTime(); if (now - t >= 5*DAY && now - t <= 14*DAY) return {diff: st.weight.kg - h.weight, days: Math.round((now - t)/DAY)}; }
  return null;
}
function weightText(kgv, unit){ const u = unit || (st.weight && st.weight.unit) || 'kg'; return u === 'lb' ? `${N1.format(kgv / 0.45359237)} lb` : `${N1.format(kgv)} kg`; }
function weightSay(kgv, unit){ const u = unit || (st.weight && st.weight.unit) || 'kg'; return u === 'lb' ? `${N1.format(kgv / 0.45359237)} pounds` : `${N1.format(kgv)} kilos`; }
function iphoneAlarms(){ return st.alarms && Array.isArray(st.alarms.list) ? st.alarms.list : []; }

/* =========================================================
   4. Voice
   ========================================================= */
function notConnected(){
  openConnect();
  return "Your iPhone Health isn't connected yet. I opened the steps: you add a few actions to your Action Button shortcut, once, and then every press brings your steps, sleep and heart rate into Jarvis.";
}
const syncHint = () => ' Press your Action Button to sync again.';
function stepsAnswer(){
  if (!st.syncedAt) return notConnected();
  const s = stepsToday();
  if (!s){
    if (st.steps) return `I don't have today's steps yet. At your last sync, ${agoSay(st.steps.at)}, you had ${N0.format(st.steps.v)} steps.` + syncHint();
    openConnect('steps'); return "Your last sync didn't include steps. I opened the Steps block of the shortcut steps: it takes three actions.";
  }
  const g = st.goal, pct = Math.round(s.v / g * 100);
  const fresh = Date.now() - s.at < 20*MIN ? '' : `, as of ${agoSay(s.at)}`;
  let r = `You've done ${N0.format(s.v)} steps today${fresh}.`;
  r += s.v >= g ? ` That's past your goal of ${N0.format(g)}. Nice work.` : ` That's ${pct}% of your ${N0.format(g)} goal, ${N0.format(g - s.v)} to go.`;
  return r;
}
function distanceAnswer(){
  const s = stepsToday(); if (!st.syncedAt) return notConnected(); if (!s) return stepsAnswer();
  const km = s.v * 0.00075; // about 75 cm a step
  return `Going by your ${N0.format(s.v)} steps, about ${N1.format(km)} kilometers today.`;
}
function sleepAnswer(kind){
  if (!st.syncedAt) return notConnected();
  const s = lastNight();
  if (!s){
    if (st.last && st.last.got && st.last.got.sleep && st.last.got.sleep.none) return "I don't see any sleep for last night in your Health app. If you don't wear your Apple Watch to bed, turn on Sleep Schedule in the Health app so your iPhone tracks it.";
    if (st.sleep) return `I don't have last night yet. The last night I have is ${new Date(st.sleep.end).toLocaleDateString([], {weekday: 'long'})}: ${hmSay(st.sleep.asleep || st.sleep.inBed)}.` + syncHint();
    openConnect('sleep'); return "Your last sync didn't include sleep. I opened the Sleep block of the shortcut steps.";
  }
  const total = s.asleep || s.inBed, word = s.asleep ? 'slept' : 'were in bed for';
  if (kind === 'bed') return `You fell asleep around ${tsay(s.start)} and woke up at ${tsay(s.end)}.`;
  if (kind === 'wake') return `You woke up at ${tsay(s.end)}, after ${hmSay(total)} of sleep.`;
  let r = `You ${word} ${hmSay(total)} last night, from ${tsay(s.start)} to ${tsay(s.end)}.`;
  if (s.stages && s.stages.deep != null) r += ` ${hmSay(s.stages.deep)} deep sleep${s.stages.rem ? ` and ${hmSay(s.stages.rem)} REM` : ''}.`;
  if (total < 360) r += ' That is on the short side. Try to get to bed a bit earlier tonight.';
  else if (total >= 420 && total <= 570) r += ' That is a solid night.';
  return r;
}
function heartAnswer(){
  if (!st.syncedAt) return notConnected();
  if (!st.heart){ openConnect('heart'); return "Your last sync didn't include heart rate. I opened the Resting Heart Rate block of the shortcut steps."; }
  const v = st.heart.v;
  let r = `Your resting heart rate is ${v} beats per minute, as of ${agoSay(st.heart.at)}.`;
  if (v < 50) r += ' That is low. Normal for very fit people, but check with a doctor if you feel dizzy.'; else if (v <= 80) r += ' That is in a healthy range.'; else if (v > 100) r += ' That is high for resting. If it stays there, check with a doctor.';
  return r;
}
function weightAnswer(){
  if (!st.syncedAt) return notConnected();
  if (!st.weight){ openConnect('weight'); return "Your last sync didn't include weight. I opened the Weight block of the shortcut steps. It reads the latest weight in your Health app."; }
  const tr = weightTrend();
  let r = `Your latest weight in Health is ${weightSay(st.weight.kg)}.`;
  if (tr && Math.abs(tr.diff) >= 0.1) r += ` That's ${tr.diff < 0 ? 'down' : 'up'} ${weightSay(Math.abs(tr.diff))} from ${tr.days} days ago.`;
  return r;
}
function energyAnswer(){
  if (!st.syncedAt) return notConnected();
  const e = energyToday();
  if (!e) return st.energy ? `I don't have today's active calories yet. At your last sync you had burned ${N0.format(st.energy.v)}.` + syncHint() : (openConnect('energy'), "Your last sync didn't include active energy. I opened the Active Energy block of the shortcut steps.");
  return `You've burned ${N0.format(e.v)} active calories today, as of ${agoSay(e.at)}.`;
}
function workoutAnswer(){
  if (!st.syncedAt) return notConnected();
  if (!(st.last && st.last.got && st.last.got.workouts) && !st.workouts.length){ openConnect('workouts'); return "Your shortcut doesn't send workouts yet. I opened the optional Workouts block of the shortcut steps."; }
  const w = workoutsToday();
  if (!w.length){ const wk = st.workouts.filter(x => x.start > Date.now() - 7*DAY); return wk.length ? `No workout today yet. Your last one was ${wk[wk.length-1].name.toLowerCase()} ${agoSay(wk[wk.length-1].start)}.` : 'No workouts today yet.'; }
  return `Yes. Today: ` + w.map(x => `${x.name.toLowerCase()}${x.min ? ` for ${hmSay(x.min)}` : ''}${x.kcal ? `, ${N0.format(x.kcal)} calories` : ''}`).join('; ') + '.';
}
function summaryAnswer(){
  if (!st.syncedAt) return notConnected();
  const bits = [], s = stepsToday(), n = lastNight();
  if (s) bits.push(`${N0.format(s.v)} steps today`);
  if (n) bits.push(`${hmSay(n.asleep || n.inBed)} of sleep last night`);
  if (st.heart) bits.push(`a resting heart rate of ${st.heart.v}`);
  if (st.weight) bits.push(`weight ${weightSay(st.weight.kg)}`);
  J.go('health');
  if (!bits.length) return `Your last sync was ${agoSay(st.syncedAt)}, and it had no health numbers for today.` + syncHint();
  return `Here's your health: ${bits.length > 1 ? bits.slice(0, -1).join(', ') + ' and ' + bits[bits.length-1] : bits[0]}. Last synced ${agoSay(st.syncedAt)}.`;
}
function iphoneAlarmAnswer(){
  const list = iphoneAlarms();
  if (!st.alarms) return null;
  if (!list.length) return 'Your iPhone Clock has no alarms, as of your last sync.';
  const flags = list.some(a => a.on != null), on = flags ? list.filter(a => a.on) : list;
  if (flags && !on.length) return `All ${plural(list.length, 'alarm')} in your iPhone Clock are switched off.`;
  const now = Date.now(), next = on.slice().sort((a,b)=>nextAlarmAt(a, now) - nextAlarmAt(b, now))[0];
  const when = nextAlarmAt(next, now), day = startOfDay(when) === startOfDay(now) ? 'today' : 'tomorrow';
  if (flags) return `Your next iPhone alarm is at ${tsay(when)} ${day}${next.label ? `, ${next.label}` : ''}.${on.length > 1 ? ` ${plural(on.length, 'alarm')} are on.` : ''}`;
  return `Your iPhone Clock has ${plural(list.length, 'alarm')}: ${list.slice(0, 4).map(a => alarmTime(a) + (a.label ? ` (${a.label})` : '')).join(', ')}. I can't see which ones are switched on.`;
}
/** the shortcut steps (Calendar → Connect); part: 'steps', 'sleep', … opens that block */
function openConnect(part){
  try { if (J.calendar && J.calendar.store){ J.calendar.store.tab = 'connect'; J.save(); J.go('calendar');
    setTimeout(()=>{ try { const b = part && document.getElementById('cal-blk-' + part); if (b) b.open = true; const x = b || document.getElementById('cal-step-cal'); x && x.scrollIntoView({behavior: 'smooth', block: 'start'}); } catch(e){} }, 160); return; } } catch(e){}
  J.go('health');
}
J.addIntent((said, t)=>{
  try {
    let s = String(t || '').replace(/[.?!]+$/g, '').replace(/[’']/g, "'")
      .replace(/^(?:(?:hey|ok|okay|yo)\s+)?jarvis\b[\s,]*/, '')
      .replace(/^(?:(?:um+|uh+|so|okay|ok|well|hey|please|quick question)\s+)+/, '')
      .replace(/^(?:can you |could you |would you )?(?:please )?(?:tell me|let me know|check|show me|give me|do you know|i want to know|i wanna know|i'd like to know)\s+/, '')
      .replace(/\s+(?:please|jarvis|for me|today please)$/, '').trim();
    if (!s || /^(?:remind|set|add|log|track|create|make|delete|remove|cancel|note|save|i (?:walked|did|took|slept|went|weigh|worked|ran|burned)|wake me)\b/.test(s)) return null;
    // connect / sync
    if (/^(?:connect|link|set ?up|hook up|sync)(?: my| the| to)? (?:apple )?(?:health|iphone health|health app|steps|sleep|apple watch|watch|fitness)\b/.test(s)){ openConnect(); return st.syncedAt ? 'Here are the shortcut steps. To sync now, press your Action Button, or tap Sync now on the Health screen.' : 'Here is how to connect your iPhone Health. It takes about 5 minutes, once. Each step has a copy button.'; }
    if (/^(?:sync|refresh|update)(?: my| the)? (?:iphone|phone|data|everything|health data|stats)$/.test(s)){ J.go('health'); return st.syncedAt ? `Last sync was ${agoSay(st.syncedAt)}. Press your Action Button, or tap Sync now, and I'll update everything.` : notConnected(); }
    // steps
    if (/^(?:my )?(?:steps|step count)(?: today| so far)?$/.test(s)) return stepsAnswer();
    if (/\bsteps?\b/.test(s) && /\b(?:how many|how much|number of|count|my steps|steps (?:today|so far|did i|have i)|did i (?:do|take|get|make|hit|reach)|have i (?:done|taken|hit|reached|got)|step count|steps? goal|today'?s steps|walked)\b/.test(s) && !/\b(?:goal (?:to|is)|change|habit)\b/.test(s)) return stepsAnswer();
    if (/^(?:how (?:much|far) (?:have|did) i (?:walk|walked|gone|go)|how (?:much|far) i (?:walked|have walked))(?: today| so far)?$/.test(s)) return /far/.test(s) ? distanceAnswer() : stepsAnswer();
    // sleep
    if (/^(?:what time|when) did i (?:go to (?:bed|sleep)|fall asleep|sleep)(?: last night)?$/.test(s)) return sleepAnswer('bed');
    if (/^(?:what time|when) did i (?:wake up|get up|wake)(?: today| this morning)?$/.test(s)) return sleepAnswer('wake');
    if (/^(?:how (?:did|have) i (?:sleep|slept|been sleeping)|how (?:long|much|many hours)(?: of sleep)? (?:did|have) i (?:sleep|slept|get|got)|how (?:was|is) my sleep|how well did i sleep|did i (?:sleep|get) (?:well|enough|ok|okay|good)(?: sleep)?|(?:what'?s|what is|show|show me|check)? ?my sleep(?: last night| score| data| stats)?|sleep (?:last night|data|stats|report)|how many hours (?:did i|have i) slept|how much sleep did i get|how am i sleeping|how(?:'s| is| has) my sleep(?: been)?)\b/.test(s) && /\b(?:sleep|slept|sleeping|asleep|bed)\b/.test(s)) return sleepAnswer();
    // heart
    if (/\bmy (?:resting |current |latest )?(?:heart ?rate|pulse|bpm|resting heart)\b|^(?:what'?s |what is |how'?s |how is )?(?:the |my )?resting heart ?rate\b|^(?:heart ?rate|pulse|bpm|resting heart rate)(?: today| now| please)?$/.test(s) && !/\b(?:should|normal|healthy|good|average|ideal|for (?:a|an|men|women))\b/.test(s)) return heartAnswer();
    // weight
    if (/^(?:how much (?:do|did) i weigh|what (?:do|did) i weigh|how heavy am i|(?:what'?s|what is|what was|whats|check|show|show me)? ?my (?:current |latest |last )?weight(?: today| now| in health)?|my weight|what'?s my weight)$/.test(s)) return weightAnswer();
    // active energy (food handles calories eaten)
    if (/\b(?:burn|burned|burnt|burning)\b/.test(s) && /\b(?:calories|energy|kcal|how much|how many)\b/.test(s) || /^(?:what'?s |what is |how much is |how many )?(?:my )?active (?:calories|energy)(?: today)?$/.test(s) || /^(?:what'?s |what is )?my move(?: ring)?(?: today)?$/.test(s)) return energyAnswer();
    // workouts
    if (/^(?:did i (?:work ?out|exercise|train|go to the gym|hit the gym)(?: today)?|have i (?:worked out|exercised|trained)(?: today)?|(?:what (?:are|were) )?my workouts?(?: today| this week)?|how many workouts(?: today| this week)?|what workouts? did i do(?: today)?|any workouts? today)$/.test(s)) return workoutAnswer();
    // iPhone Clock alarms (Jarvis's own alarms are answered by the calendar feature)
    if (/\b(?:iphone|phone|clock app|clock)\b/.test(s) && /\balarms?\b/.test(s) && /^(?:what|which|when|do i|is there|are there|show|list|read|my)/.test(s)){ const a = iphoneAlarmAnswer(); if (a) return a; if (!st.syncedAt) return notConnected(); openConnect('alarms'); return "Your shortcut doesn't send your Clock alarms yet. I opened the optional Alarms block of the shortcut steps."; }
    // summary
    if (/^(?:how'?s|how is|what'?s|what is|show|show me|open|give me|check|go to)?(?: me)? ?(?:my |the )?(?:health|activity|fitness|apple health|health app)(?: summary| stats| data| numbers| today| page| screen| app)?$/.test(s) && /\b(?:health|activity|fitness)\b/.test(s)) return summaryAnswer();
    return null;
  } catch(e){ console.error('health intent', e); return null; }
});
J.addSuggestions(['How did I sleep?', 'How many steps today?', "What's my resting heart rate?"]);

/* morning brief: last night's sleep, and yesterday's steps if we saw them late in the day */
if (typeof J.addBriefLine === 'function') J.addBriefLine(()=>{
  try {
    if (!st.syncedAt) return null;
    const bits = [], n = lastNight();
    if (n) bits.push(`you ${n.asleep ? 'slept' : 'were in bed for'} ${hmSay(n.asleep || n.inBed)} last night`);
    const y = st.history[dayKey(Date.now() - DAY)];
    if (y && y.steps != null && y.stepsAt && new Date(y.stepsAt).getHours() >= 18) bits.push(`yesterday you walked ${N0.format(y.steps)} steps`);
    if (!bits.length) return null;
    const s = bits.join(', and ');
    return s.charAt(0).toUpperCase() + s.slice(1) + '.';
  } catch(e){ return null; }
});

/* =========================================================
   5. Screens
   ========================================================= */
const IC = {
  steps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 3.5c1.7 0 2.6 1.7 2.6 4 0 2-1 3.6-1.2 5.3H6.2C5.9 11 5 9.6 5 7.5c0-2.3 1.6-4 3.5-4z"/><path d="M6.3 15.8h3.5v1.4a1.8 1.8 0 0 1-3.5 0z"/><path d="M15.5 6.5c1.9 0 3.5 1.7 3.5 4 0 2.1-.9 3.5-1.2 5.3h-3.7c-.2-1.7-1.2-3.3-1.2-5.3 0-2.3.9-4 2.6-4z"/><path d="M14.2 18.8h3.5v1.2a1.8 1.8 0 0 1-3.5 0z"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/><path d="M4.8 12h3.4l1.6-2.6 2.4 5 1.6-2.4h5.4"/></svg>',
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M8.5 9a5 5 0 0 1 7 0l-2.2 2.4a1.8 1.8 0 0 0-2.6 0z"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21c-3.9 0-7-2.8-7-6.6 0-3.4 2.4-5.4 3.6-8.4.5 2 1.6 3.2 2.9 3.8C11.4 6.6 13 4.3 15.2 3c-.3 3 1 4.8 2.3 6.6 1 1.4 1.5 2.9 1.5 4.6C19 18.1 15.9 21 12 21z"/></svg>',
  run: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="14.5" cy="4.5" r="1.8"/><path d="m7 21 3.2-5.2 3 2.2V22M6 11.5l3-3.3 4 .3 2.6 3.5 3 .5M10 8.5 8.3 14l4.6 4"/></svg>',
  alarm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.3 1.6M4 4.5 6.5 2.5M20 4.5 17.5 2.5"/></svg>',
  sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 0 0-14.3-4.6L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.3 4.6L20 15.5M20 20v-4.5h-4.5"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>'
};
J.css(`
.hl-sync{display:flex;align-items:center;gap:12px;padding:12px 14px;margin-bottom:14px}
.hl-dot{width:10px;height:10px;border-radius:50%;flex:none;background:var(--good);box-shadow:0 0 0 4px rgba(34,197,94,.16)}
.hl-dot.warn{background:var(--warn);box-shadow:0 0 0 4px rgba(245,158,11,.16)}.hl-dot.off{background:var(--faint);box-shadow:0 0 0 4px var(--line)}
.hl-sync .lbl{flex:1;min-width:0}.hl-sync .lbl b{display:block;font-size:14px}.hl-sync .lbl small{color:var(--muted);font-size:12.5px}
.hl-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:12px;padding:8px 13px;min-height:40px;font:inherit;font-weight:700;font-size:13.5px;cursor:pointer;background:var(--accent);color:#fff;text-decoration:none;white-space:nowrap}
.hl-btn svg{width:16px;height:16px}
.hl-btn.ghost{background:var(--fill,var(--card));color:var(--text);border:0}
.hl-btn:active,.hl-card:active{transform:scale(.98)}
.hl-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.hl-card{position:relative;min-width:0;background:var(--card);border:1px solid var(--card-border,var(--line));box-shadow:var(--card-shadow,none);border-radius:var(--radius,20px);padding:14px;transition:transform .15s var(--ease)}
.hl-card.wide{grid-column:1/-1}
.hl-k{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;letter-spacing:-.005em;color:var(--muted)}
.hl-k i{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;flex:none}
.hl-k i svg{width:15px;height:15px}
.hl-v{font-size:28px;font-weight:750;letter-spacing:-.035em;line-height:1.1;margin-top:10px;font-variant-numeric:tabular-nums}
.hl-v small{font-size:14px;font-weight:700;color:var(--muted);letter-spacing:0;margin-left:3px}
.hl-s{font-size:12.5px;color:var(--muted);margin-top:4px;line-height:1.35}
.hl-s.good{color:var(--good-ink)}.hl-s.warn{color:var(--warn-ink)}
.hl-miss{font-size:13px;color:var(--faint-ink);margin-top:12px;line-height:1.35}
.hl-steps{display:flex;gap:16px;align-items:center}
.hl-ring{position:relative;width:96px;height:96px;flex:none}
.hl-ring svg{width:96px;height:96px;transform:rotate(-90deg)}
.hl-ring b{position:absolute;inset:0;display:grid;place-items:center;font-size:17px;font-weight:800;letter-spacing:-.4px}
.hl-bars{display:flex;align-items:flex-end;gap:6px;height:54px;margin-top:14px}
.hl-bars div{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;min-width:0}
.hl-bars span{display:block;width:100%;max-width:26px;border-radius:6px 6px 3px 3px;background:var(--line);min-height:4px}
.hl-bars span.on{background:linear-gradient(180deg,var(--c1),var(--c2))}
.hl-bars span.goal{box-shadow:0 0 0 2px color-mix(in srgb,var(--good) 45%,transparent)}
.hl-bars em{font-style:normal;font-size:10.5px;font-weight:700;color:var(--faint-ink)}
.hl-bars div.today em{color:var(--text)}
.hl-stage{display:flex;height:10px;border-radius:999px;overflow:hidden;margin-top:12px;background:var(--line)}
.hl-stage i{display:block;height:100%}
.hl-leg{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:9px;font-size:12px;color:var(--muted)}
.hl-leg span{display:inline-flex;align-items:center;gap:6px}.hl-leg span::before{content:"";width:8px;height:8px;border-radius:3px;background:var(--c)}
.hl-leg b{color:var(--text);font-weight:700}
.hl-row{display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--sep,var(--line))}
.hl-row:first-of-type{border-top:0}
.hl-row .bd{flex:1;min-width:0}.hl-row .bd b{display:block;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hl-row .bd small{color:var(--muted);font-size:12.5px}
.hl-row .tm{font-weight:800;font-size:17px;font-variant-numeric:tabular-nums;white-space:nowrap}
.hl-row .tm.off{color:var(--faint-ink);text-decoration:line-through;text-decoration-thickness:1.5px}
.hl-empty{text-align:center;padding:26px 18px}
.hl-empty .big{width:68px;height:68px;margin:0 auto 12px;border-radius:22px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#fb7185,#e11d48);box-shadow:0 14px 30px rgba(225,29,72,.3)}
.hl-empty .big svg{width:34px;height:34px}
.hl-empty h3{margin:0 0 6px;font-size:19px;letter-spacing:-.3px}.hl-empty p{margin:0 0 14px;color:var(--muted);font-size:14px}
.hl-list{margin:12px 0 0;padding:0;list-style:none;display:grid;gap:8px;text-align:left;font-size:13.5px}
.hl-list li{display:flex;gap:10px;align-items:flex-start}.hl-list li i{font-style:normal;flex:none;color:var(--muted);margin-top:1px}.hl-list li i.ok{color:var(--good-ink)}.hl-list li i svg{width:18px;height:18px;display:block}
.hl-note{font-size:12.5px;color:var(--muted);line-height:1.45;margin:14px 4px 0}
.hl-set input{width:110px;font-size:16px!important}
.hl-today{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px;cursor:pointer}
.hl-today>div{min-width:0;padding:4px 6px}
.hl-today small{display:flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;color:var(--muted);white-space:nowrap;overflow:hidden}
.hl-today small svg{width:13px;height:13px;flex:none}
.hl-today b{display:block;font-size:21px;font-weight:750;letter-spacing:-.03em;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.hl-today b.na{color:var(--faint-ink);font-weight:700}
.hl-today b .u{font-style:normal;font-size:12px;font-weight:700;color:var(--muted);margin-left:3px;letter-spacing:0}
.hl-today span{display:block;font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hl-tip{display:flex;align-items:center;gap:12px;padding:12px 14px;cursor:pointer}
.hl-tip .ic{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;flex:none;color:#fff;background:linear-gradient(135deg,#fb7185,#e11d48)}
.hl-tip .ic svg{width:21px;height:21px}
.hl-tip .bd{flex:1;min-width:0}.hl-tip .bd small{display:block;color:var(--muted);font-size:12.5px}.hl-tip .bd b{display:block;font-size:14.5px}
.hl-tip .x{border:0;background:none;color:var(--faint-ink);font-size:16px;padding:0;cursor:pointer;width:44px;height:44px;display:grid;place-items:center;flex:none}.hl-tip .x svg{width:17px;height:17px}
@media (max-width:370px){.hl-v{font-size:25px}.hl-ring,.hl-ring svg{width:84px;height:84px}.hl-today b{font-size:17px}}
`);
const C = {steps: ['#34d399', '#10b981'], sleep: ['#818cf8', '#6366f1'], heart: ['#fb7185', '#e11d48'], weight: ['#38bdf8', '#0ea5e9'], energy: ['#fb923c', '#f43f5e'], run: ['#a3e635', '#22c55e'], alarm: ['#fbbf24', '#f97316']};
const STAGE = {deep: ['Deep', '#4338ca'], core: ['Core', '#6366f1'], rem: ['REM', '#38bdf8'], awake: ['Awake', '#f59e0b']};
const kic = (k, ic) => `<i style="background:linear-gradient(160deg,${C[k][0]},${C[k][1]});color:#fff">${IC[ic]}</i>`;
const shortcutLink = () => { try { return J.calendar && J.calendar.syncLink ? J.calendar.syncLink() : 'shortcuts://'; } catch(e){ return 'shortcuts://'; } };

function ring(pct, c1, c2, id){
  const r = 40, c = 2*Math.PI*r, p = Math.max(0, Math.min(1, pct));
  return `<svg viewBox="0 0 96 96"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><circle cx="48" cy="48" r="${r}" fill="none" stroke="var(--line)" stroke-width="10"/><circle cx="48" cy="48" r="${r}" fill="none" stroke="url(#${id})" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(c*p).toFixed(1)} ${c.toFixed(1)}"/></svg>`;
}
function bars(list, colors, goal){
  const max = Math.max(goal || 0, ...list.map(x => x.v || 0)) || 1;
  return `<div class="hl-bars" style="--c1:${colors[0]};--c2:${colors[1]}">${list.map(x=>`<div class="${x.today ? 'today' : ''}"><span class="${x.v != null ? 'on' : ''}${goal && x.v >= goal ? ' goal' : ''}" style="height:${x.v != null ? Math.max(8, Math.round(x.v/max*100)) : 8}%" title="${x.v != null ? esc(String(x.v)) : ''}"></span><em>${esc(x.label)}</em></div>`).join('')}</div>`;
}
const missing = (what, part) => `<div class="hl-miss">Not in your last sync. <button class="link" data-hl-connect="${part || ''}" style="padding:0">Add ${esc(what)} to the shortcut</button></div>`;

function viewHTML(){
  let h = `<h2>Health</h2><p class="lede">From the Health app on your iPhone</p>`;
  if (!st.syncedAt){
    return h + `<div class="card hl-empty"><div class="big">${IC.heart}</div><h3>Bring your iPhone Health into Jarvis</h3>
      <p>Steps, sleep, resting heart rate, weight and workouts, plus your Clock alarms and calendar, every time you press your Action Button.</p>
      <button class="hl-btn" data-hl-connect>Show me how · 5 minutes</button>
      <ul class="hl-list"><li><i class="ok">${(J.icons && J.icons.done) || ''}</i><span><b>Automatic</b> each time your shortcut runs: the Action Button, or an automation like “when my alarm stops”.</span></li>
      <li><i>${(J.icons && J.icons.info) || ''}</i><span><b>Not in the background.</b> A web app can't read Health by itself, so Jarvis shows what the shortcut last sent, with the time.</span></li>
      <li><i>${(J.icons && J.icons.lock) || ''}</i><span>It stays on this phone. Nothing is uploaded.</span></li></ul></div>`;
  }
  const age = Date.now() - st.syncedAt, dot = age < 6*HOUR ? '' : age < 26*HOUR ? 'warn' : 'off';
  h += `<div class="card hl-sync"><span class="hl-dot ${dot}"></span><div class="lbl"><b>Synced ${esc(agoShort(st.syncedAt))}</b><small>${age < 6*HOUR ? 'From your Action Button shortcut' : 'Press your Action Button to update'}</small></div><a class="hl-btn" href="${esc(shortcutLink())}">${IC.sync}Sync now</a></div>`;
  h += `<div class="hl-grid">`;
  // steps
  const s = stepsToday(), g = st.goal;
  h += `<div class="hl-card wide"><div class="hl-k">${kic('steps','steps')}Steps${s ? ' today' : ''}</div>`;
  if (s) h += `<div class="hl-steps"><div class="hl-ring">${ring(s.v/g, C.steps[0], C.steps[1], 'hlg-steps')}<b>${Math.min(999, Math.round(s.v/g*100))}%</b></div><div><div class="hl-v">${N0.format(s.v)}</div><div class="hl-s ${s.v >= g ? 'good' : ''}">${s.v >= g ? 'Goal reached · ' : `${N0.format(g - s.v)} to go · `}goal ${N0.format(g)}</div><div class="hl-s">About ${N1.format(s.v*0.00075)} km</div></div></div>${bars(weekSteps(), C.steps, g)}`;
  else if (st.steps) h += `<div class="hl-v">—</div><div class="hl-s">No steps for today yet. Last: ${N0.format(st.steps.v)} on ${esc(new Date(st.steps.at).toLocaleDateString([], {weekday:'long'}))}.</div>${bars(weekSteps(), C.steps, g)}`;
  else h += missing('Steps', 'steps');
  h += `</div>`;
  // sleep
  const n = lastNight();
  h += `<div class="hl-card wide"><div class="hl-k">${kic('sleep','moon')}Sleep · last night</div>`;
  if (n){
    const tot = n.asleep || n.inBed;
    h += `<div class="hl-v">${Math.floor(tot/60)}<small>h</small> ${p2(Math.round(tot)%60)}<small>m</small></div><div class="hl-s">${esc(tfmt(n.start))} → ${esc(tfmt(n.end))}${n.asleep ? '' : ' · time in bed'}${n.asleep && n.inBed && n.inBed > n.asleep ? ` · ${esc(hm(n.inBed))} in bed` : ''}</div>`;
    if (n.stages){ const keys = ['deep','core','rem','awake'].filter(k => n.stages[k]); const sum = keys.reduce((a,k)=>a + n.stages[k], 0) || 1;
      h += `<div class="hl-stage">${keys.map(k=>`<i style="width:${(n.stages[k]/sum*100).toFixed(1)}%;background:${STAGE[k][1]}"></i>`).join('')}</div><div class="hl-leg">${keys.map(k=>`<span style="--c:${STAGE[k][1]}">${STAGE[k][0]} <b>${esc(hm(n.stages[k]))}</b></span>`).join('')}</div>`; }
    h += bars(weekSleep().map(x => ({...x, v: x.v != null ? x.v : null})), C.sleep, 0);
  } else if (st.last && st.last.got && st.last.got.sleep) h += `<div class="hl-v">—</div><div class="hl-s">No sleep recorded for last night. Wear your Apple Watch to bed, or turn on Sleep Schedule in the Health app.</div>`;
  else if (st.sleep) h += `<div class="hl-v">—</div><div class="hl-s">Nothing for last night yet. Last: ${esc(hm(st.sleep.asleep || st.sleep.inBed))} on ${esc(new Date(st.sleep.end).toLocaleDateString([], {weekday:'long'}))}.</div>`;
  else h += missing('Sleep', 'sleep');
  h += `</div>`;
  // heart
  h += `<div class="hl-card"><div class="hl-k">${kic('heart','heart')}Resting</div>`;
  h += st.heart ? `<div class="hl-v">${st.heart.v}<small>bpm</small></div><div class="hl-s">Heart rate · ${esc(agoShort(st.heart.at))}</div>` : missing('Heart rate', 'heart');
  h += `</div>`;
  // weight
  h += `<div class="hl-card"><div class="hl-k">${kic('weight','scale')}Weight</div>`;
  if (st.weight){ const tr = weightTrend(), u = st.weight.unit === 'lb' ? 'lb' : 'kg', v = u === 'lb' ? st.weight.kg/0.45359237 : st.weight.kg;
    h += `<div class="hl-v">${N1.format(v)}<small>${u}</small></div><div class="hl-s">${tr && Math.abs(tr.diff) >= 0.1 ? `${tr.diff < 0 ? '▼' : '▲'} ${esc(weightText(Math.abs(tr.diff)))} in ${tr.days} days` : 'Latest in Health'}</div>`; }
  else h += missing('Weight', 'weight');
  h += `</div>`;
  // active energy
  const e = energyToday();
  h += `<div class="hl-card"><div class="hl-k">${kic('energy','flame')}Active</div>`;
  h += e ? `<div class="hl-v">${N0.format(e.v)}<small>kcal</small></div><div class="hl-s">Burned today</div>` : st.energy ? `<div class="hl-v">—</div><div class="hl-s">Nothing for today yet</div>` : missing('Active Energy', 'energy');
  h += `</div>`;
  // workouts
  const w = workoutsToday();
  h += `<div class="hl-card"><div class="hl-k">${kic('run','run')}Workouts</div>`;
  if (w.length) h += `<div class="hl-v">${w.length}</div><div class="hl-s">${esc(w.map(x => x.name + (x.min ? ' · ' + hm(x.min) : '')).slice(0, 2).join(', '))}</div>`;
  else if (st.last && st.last.got && st.last.got.workouts || st.workouts.length) h += `<div class="hl-v">0</div><div class="hl-s">None today yet</div>`;
  else h += `<div class="hl-miss">Optional. <button class="link" data-hl-connect="workouts" style="padding:0">Add workouts</button></div>`;
  h += `</div>`;
  h += `</div>`; // grid
  // Clock alarms
  if (st.alarms){
    const list = iphoneAlarms(), flags = list.some(a => a.on != null);
    h += `<div class="section-h"><h3>Alarms in your iPhone Clock</h3><span style="color:var(--muted);font-size:12.5px">${esc(agoShort(st.alarms.at))}</span></div><div class="card" style="padding:6px 14px">`;
    h += list.length ? list.map(a => `<div class="hl-row"><div class="hl-k" style="text-transform:none">${kic('alarm','alarm')}</div><div class="bd"><b>${esc(a.label || 'Alarm')}</b><small>${a.on == null ? 'On your iPhone' : a.on ? 'On' : 'Off'}</small></div><div class="tm ${a.on === false ? 'off' : ''}">${esc(alarmTime(a))}</div></div>`).join('') : `<div class="hl-row"><div class="bd"><b>No alarms</b><small>Your Clock app had none at the last sync</small></div></div>`;
    h += `</div>`;
    if (list.length && !flags) h += `<p class="hl-note">Your shortcut doesn't say which alarms are switched on. If your iPhone shows <b>Is Enabled</b> for alarms in Shortcuts, add it (see Connect).</p>`;
  }
  // settings
  h += `<div class="section-h"><h3>Settings</h3></div><div class="set-group hl-set">
    <div class="set-row"><div class="lbl"><b>Daily step goal</b><small>Used for the ring and your answers</small></div><input type="number" inputmode="numeric" min="1000" max="50000" step="500" value="${st.goal}" data-hl-goal aria-label="Daily step goal"></div>
    <div class="set-row"><div class="lbl"><b>Health tile on Home</b><small>Auto: last night’s sleep in the morning, steps when there’s room. Steps or Sleep: always.</small></div><select data-hl-tile aria-label="Health tile on Home">${[['auto','Auto'],['steps','Steps'],['sleep','Sleep'],['off','Off']].map(([k,l])=>`<option value="${k}" ${st.tile===k?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="set-row"><div class="lbl"><b>Shortcut steps</b><small>Add or check parts of the iPhone shortcut</small></div><button class="hl-btn ghost" data-hl-connect>Open</button></div>
  </div>`;
  h += `<p class="hl-note">Jarvis can't read Health in the background. These numbers come from your shortcut each time it runs: your Action Button, or an automation. Everything stays on this phone.</p>`;
  return h;
}
function bind(root){
  if (root._hlBound) return; root._hlBound = true;
  root.addEventListener('click', e=>{
    const c = e.target.closest('[data-hl-connect]'); if (c){ e.preventDefault(); openConnect(c.dataset.hlConnect || ''); return; }
  });
  root.addEventListener('change', e=>{
    const g = e.target.closest('[data-hl-goal]'); if (g){ const v = Math.round(+g.value); if (v >= 500 && v <= 100000){ st.goal = v; J.save(); J.toast('Step goal: ' + N0.format(v)); } paint(root, true); J.renderAll(); return; }
    const t = e.target.closest('[data-hl-tile]'); if (t){ st.tile = t.value; J.save(); J.renderAll(); J.toast(t.value === 'off' ? 'Health tile hidden from Home' : 'Health tile on Home'); }
  });
}
function paint(el, force){
  const a = document.activeElement;
  if (!force && a && el.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
  const html = viewHTML();
  if (!force && el._hlSig === html) return;
  el._hlSig = html; el.innerHTML = html;
}
J.addView({id: 'health', label: 'Health', icon: '❤️', color: '#e11d48', order: 16, render(el){
  try { bind(el); paint(el); } catch(e){ console.error('health view', e); el.innerHTML = '<div class="empty">Health could not load. Please reopen the app.</div>'; }
}});

/* Today screen card: three numbers, tap for the full Health screen */
J.addHomeCard({id: 'health', order: 25, render(el){
  try {
    if (!el._hlBound){ el._hlBound = true; el.addEventListener('click', e=>{
      if (e.target.closest('[data-hl-x]')){ e.stopPropagation(); st.tipHidden = true; J.save(); J.renderAll(); return; }
      if (e.target.closest('[data-hl-open]')) J.go('health');
      else if (e.target.closest('[data-hl-tipgo]')) openConnect(); }); }
    let html = '';
    if (st.syncedAt){
      const s = stepsToday(), n = lastNight();
      const cell = (k, ic, lbl, val, sub) => `<div><small style="color:${C[k][1]}">${IC[ic]}<span style="color:var(--muted)">${lbl}</span></small><b class="${val ? '' : 'na'}">${val || '—'}</b><span>${sub}</span></div>`;
      html = `<div class="section-h"><h3>Health</h3><button class="link" data-hl-open>Details</button></div>
        <div class="card hl-today" data-hl-open role="button" tabindex="0" aria-label="Open Health">
        ${cell('steps', 'steps', 'Steps', s ? N0.format(s.v) : '', s ? `${Math.round(s.v/st.goal*100)}% of goal` : 'Not synced today')}
        ${cell('sleep', 'moon', 'Sleep', n ? esc(hm(n.asleep || n.inBed)) : '', n ? `Woke ${esc(tsay(n.end))}` : 'No data')}
        ${cell('heart', 'heart', 'Resting', st.heart ? st.heart.v + '<em class="u">bpm</em>' : '', `Synced ${esc(agoShort(st.syncedAt))}`)}
        </div>`;
    } else if (!st.tipHidden){
      html = `<div class="card hl-tip" data-hl-tipgo role="button" tabindex="0" style="margin-top:16px"><div class="ic">${IC.heart}</div><div class="bd"><small>iPhone Health</small><b>See your steps and sleep here</b></div><button class="x" data-hl-x aria-label="Hide this tip">${(J.icons && J.icons.close) || '×'}</button></div>`;
    }
    if (el._hlSig !== html){ el._hlSig = html; el.innerHTML = html; }
  } catch(e){ console.error('health card', e); }
}});

/* a Home tile (index.html's homeTiles() can show it): same shape as its other tiles */
function tile(){
  if (st.tile === 'off' || !st.syncedAt) return null;
  const s = stepsToday(), n = lastNight(), h = new Date().getHours();
  const pick = st.tile === 'sleep' ? (n ? 'sleep' : null) : st.tile === 'steps' ? (s ? 'steps' : null) : (n && h >= 4 && h < 11) ? 'sleep' : s ? 'steps' : n ? 'sleep' : null;
  if (pick === 'sleep'){ const tot = n.asleep || n.inBed; return {lbl: 'Last night', ic: IC.moon, icSm: true, val: `${Math.floor(tot/60)}<small>h ${p2(Math.round(tot)%60)}m</small>`, sub: `${tsay(n.start)} – ${tsay(n.end)}`, go: 'health'}; }
  if (pick === 'steps') return {lbl: 'Steps today', ic: IC.steps, icSm: true, val: N0.format(s.v), bar: s.v/st.goal*100, barCls: 'good', sub: s.v >= st.goal ? 'Goal reached' : `${N0.format(st.goal - s.v)} to go`, subCls: s.v >= st.goal ? 'good' : '', go: 'health'};
  return null;
}

setInterval(()=>{ try { if (J.current === 'health'){ const v = document.getElementById('v-health'); v && paint(v); } } catch(e){} }, 60000);

/* for tests and other features */
J.health = {
  store: st, icons: IC, applyPayload, decodeSync, parseQty, parseSleep, parseWorkouts, parseAlarms, syncMessage, tile,
  stepsToday, lastNight, iphoneAlarms, alarmAnswer: iphoneAlarmAnswer, openConnect,
  get lastSync(){ return st.last; }, get syncedAt(){ return st.syncedAt; }
};

} catch(e){ console.error('health feature failed to load', e); }
})();
