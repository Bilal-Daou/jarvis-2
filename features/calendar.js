/* =========================================================
   Jarvis 2.0 · Calendar & Alarms
   - Makes reminders ring on the iPhone even when Jarvis is closed:
       1) Calendar alert (.ics with an alert, zero setup)
       2) Real Clock alarm through a one-time Shortcut ("Jarvis Alarm")
   - Loud in-app alarm when Jarvis is open (WebAudio), snooze, nightstand mode
   - Reads the iPhone calendar through the Action Button Shortcut (#cal=… link)
   - Agenda screen, Home card, morning-brief line, voice questions
   Everything stays on this device. No server, no keys.
   ========================================================= */
(function(){
try {
const J = window.Jarvis; if (!J) return;
const S = J.settings;
const APP_URL = 'https://bilal-daou.github.io/jarvis-2/';
const st = J.store('calendar', {
  events: [], local: [], syncedAt: 0, syncCount: 0,
  syncName: 'Jarvis', alarmName: 'Jarvis Alarm', alarmReady: false,
  pref: 'calendar', sheetAfter: true, ringInApp: true,
  added: {}, alarmed: {}, snoozes: [], tab: 'agenda', homeTip: true
});
['events','local','snoozes'].forEach(k=>{ if (!Array.isArray(st[k])) st[k] = []; });
['added','alarmed'].forEach(k=>{ if (!st[k] || typeof st[k] !== 'object') st[k] = {}; });
if (!st.syncName) st.syncName = 'Jarvis';
if (!st.alarmName) st.alarmName = 'Jarvis Alarm';

const esc = J.esc, cap = J.cap;
const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
const startOfDay = d => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
const addDays = (ms, n) => { const x = new Date(ms); x.setDate(x.getDate()+n); return x.getTime(); };
const tfmt = ms => new Date(ms).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'});
const tsay = ms => tfmt(ms).replace(/:00(?=\s?[AP]M)/i, '').replace(/:00$/,'');
const dayLabel = ms => { const t0 = startOfDay(Date.now()), d = startOfDay(ms); if (d===t0) return 'Today'; if (d===addDays(t0,1)) return 'Tomorrow'; if (d===addDays(t0,-1)) return 'Yesterday'; return new Date(ms).toLocaleDateString([], {weekday:'long', month:'short', day:'numeric'}); };
const daySay = ms => { const l = dayLabel(ms); return /^(Today|Tomorrow|Yesterday)$/.test(l) ? l.toLowerCase() : 'on ' + new Date(ms).toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'}); };
const lc = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
const plural = (n, w) => `${n} ${w}${n===1?'':'s'}`;
function until(ms){
  const s = Math.round((ms - Date.now())/MIN);
  if (s <= 0) return 'now';
  if (s < 60) return `in ${s} min`;
  const h = Math.floor(s/60), m = s%60;
  if (h < 24) return `in ${h}h${m?` ${m}m`:''}`;
  const d = Math.round(s/1440); return `in ${plural(d,'day')}`;
}
function untilSay(ms){
  const s = Math.round((ms - Date.now())/MIN);
  if (s <= 0) return 'now';
  if (s < 60) return `in ${plural(s,'minute')}`;
  const h = Math.floor(s/60), m = s%60;
  if (h < 24) return `in ${plural(h,'hour')}${m && h < 3 ? ` and ${plural(m,'minute')}` : ''}`;
  return `in ${plural(Math.round(s/1440),'day')}`;
}
function sinceText(ms){
  if (!ms) return 'never';
  const s = (Date.now()-ms)/1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s/60)} min ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  const d = Math.floor(s/86400); return d === 1 ? 'yesterday' : `${d} days ago`;
}
function say(text){ const was = S.speak; S.speak = true; try { J.speak(text); } finally { S.speak = was; } }

/* =========================================================
   1. ICS (RFC 5545) — calendar alerts that ring on the iPhone
   ========================================================= */
const enc = new TextEncoder();
function icsEsc(s){ return String(s == null ? '' : s).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,'); }
/** fold a content line at 75 octets (never inside a UTF-8 character); continuation lines start with one space */
function fold(line){
  const out = []; let cur = '', len = 0;
  for (const ch of line){
    const n = enc.encode(ch).length;
    if (len + n > 75){ out.push(cur); cur = ' ' + ch; len = 1 + n; }
    else { cur += ch; len += n; }
  }
  out.push(cur); return out.join('\r\n');
}
const utc = ms => new Date(ms).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
const RRULE = {daily:'FREQ=DAILY', weekly:'FREQ=WEEKLY', monthly:'FREQ=MONTHLY'};
/** items: [{uid, title, start, end, repeat, alert (minutes before, 0 = at start), desc, loc}] */
function buildICS(items){
  const L = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Jarvis 2.0//Calendar & Alarms//EN','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
  const stamp = utc(Date.now());
  items.forEach(it=>{
    const start = Math.round(it.start/1000)*1000, end = Math.max(start + 5*MIN, it.end || start + 10*MIN);
    L.push('BEGIN:VEVENT', 'UID:'+String(it.uid).replace(/[^A-Za-z0-9._-]/g,'')+'@jarvis', 'DTSTAMP:'+stamp, 'DTSTART:'+utc(start), 'DTEND:'+utc(end),
      'SUMMARY:'+icsEsc(it.title));
    if (it.desc) L.push('DESCRIPTION:'+icsEsc(it.desc));
    if (it.loc) L.push('LOCATION:'+icsEsc(it.loc));
    if (RRULE[it.repeat]) L.push('RRULE:'+RRULE[it.repeat]);
    L.push('STATUS:CONFIRMED', 'SEQUENCE:0', it.busy ? 'TRANSP:OPAQUE' : 'TRANSP:TRANSPARENT');
    const a = Math.max(0, Math.round(it.alert || 0));
    L.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+icsEsc(it.title), 'TRIGGER:'+(a ? `-PT${a}M` : 'PT0S'), 'END:VALARM');
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
function reminderItem(r){
  return {uid:r.id, title:(r.kind==='alarm'?'⏰ ':'🔔 ')+r.text, start:r.at, end:r.at+10*MIN, repeat:r.repeat, alert:0,
    desc:'Reminder from Jarvis'};
}
function eventItem(e){ return {uid:e.id, title:e.title, start:e.start, end:e.end, alert:e.alert==null?15:e.alert, desc:'Added by Jarvis', loc:e.loc, busy:true}; }
const dataURL = ics => 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
let blobURLs = [];
function icsHref(ics){
  // iPhone/iPad: opening a text/calendar link shows Apple's "Add to Calendar" sheet over the page.
  // A download attribute would send it to Files instead, so iOS gets a plain link to a data: URL.
  if (isIOS) return {href:dataURL(ics), dl:''};
  try { const u = URL.createObjectURL(new Blob([ics], {type:'text/calendar;charset=utf-8'})); blobURLs.push(u); return {href:u, dl:'jarvis-reminder.ics'}; }
  catch(e){ return {href:dataURL(ics), dl:'jarvis-reminder.ics'}; }
}
function freeBlobs(){ const old = blobURLs; blobURLs = []; setTimeout(()=>old.forEach(u=>{ try { URL.revokeObjectURL(u); } catch(e){} }), 60000); }
/** fallback: the share sheet (Save to Files / Mail / Calendar when offered) */
async function shareICS(ics, name){
  try {
    const file = new File([ics], name || 'jarvis-reminder.ics', {type:'text/calendar'});
    if (navigator.canShare && navigator.canShare({files:[file]})){ await navigator.share({files:[file], title:'Jarvis reminder'}); return true; }
  } catch(e){ if (e && e.name === 'AbortError') return true; }
  // last resort: open the file directly
  try { const a = document.createElement('a'); const h = icsHref(ics); a.href = h.href; if (h.dl) a.download = h.dl; document.body.appendChild(a); a.click(); a.remove(); return true; } catch(e){}
  return false;
}

/* =========================================================
   2. Shortcuts links (Clock alarm + calendar sync)
   ========================================================= */
function alarmText(ms){ const d = new Date(ms); let h = d.getHours(); const m = d.getMinutes(); const ap = h < 12 ? 'AM' : 'PM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2,'0')} ${ap}`; }
function backURL(extra){ const base = /^https?:/.test(location.protocol) ? location.origin + location.pathname : APP_URL; return base + '#jarvis=' + extra; }
function alarmLink(r){
  const name = encodeURIComponent(st.alarmName || 'Jarvis Alarm'), text = encodeURIComponent(alarmText(r.at));
  // In Safari we can come back to Jarvis when the Shortcut finishes. A home-screen app would be sent to Safari instead, so skip it there.
  if (!standalone) return `shortcuts://x-callback-url/run-shortcut?name=${name}&input=text&text=${text}&x-success=${encodeURIComponent(backURL('alarm-ok&r='+r.id))}`;
  return `shortcuts://run-shortcut?name=${name}&input=text&text=${text}`;
}
const syncLink = () => `shortcuts://run-shortcut?name=${encodeURIComponent(st.syncName || 'Jarvis')}`;
const alarmOK = r => r && r.at > Date.now() - MIN && r.at - Date.now() < 24*HOUR; // Clock alarms are a time of day: only within the next 24 hours

/* =========================================================
   3. Calendar sync payload (#cal=…) from the Action Button Shortcut
      One event per line: Title|Start|End|Location|All-day (last two optional)
      Dates: Shortcuts "ISO 8601" format, e.g. 2026-11-16T09:00:00+02:00 or 2026-11-16
   ========================================================= */
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?)?$/i;
const MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
function parseDate(raw){
  const s = String(raw||'').trim(); if (!s) return null;
  let m = s.match(ISO_RE);
  if (m){
    const [, Y, Mo, D, h, mi, se, tz] = m;
    if (+Mo < 1 || +Mo > 12 || +D < 1 || +D > 31) return null;
    if (h == null) return {ms:new Date(+Y, +Mo-1, +D).getTime(), date:`${Y}-${Mo}-${D}`, dateOnly:true, hm:'00:00'};
    let ms;
    if (tz){ let z = tz.toUpperCase(); if (z !== 'Z'){ z = z.length === 3 ? z + ':00' : z.length === 5 ? z.slice(0,3) + ':' + z.slice(3) : z; } ms = Date.parse(`${Y}-${Mo}-${D}T${h}:${mi}:${se||'00'}${z}`); }
    else ms = new Date(+Y, +Mo-1, +D, +h, +mi, +(se||0)).getTime();
    if (!isFinite(ms)) return null;
    return {ms, date:`${Y}-${Mo}-${D}`, dateOnly:false, hm:`${h}:${mi}`};
  }
  // forgiving: "Nov 16, 2026 at 9:00 AM" / "16 Nov 2026 at 09:00" (if a different date format was picked)
  if (/^[a-z]{3,9}\.? \d{1,2},? \d{4}|^\d{1,2} [a-z]{3,9}\.? \d{4}/i.test(s) && MONTHS.some(x=>s.toLowerCase().includes(x))){
    const ms = Date.parse(s.replace(/\s+at\s+/i, ' ').replace(/\u202f/g,' '));
    if (isFinite(ms)){ const d = new Date(ms); const p = n => String(n).padStart(2,'0'); return {ms, date:`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`, dateOnly:!/\d:\d/.test(s), hm:`${p(d.getHours())}:${p(d.getMinutes())}`}; }
  }
  return null;
}
const FLAG_RE = /^(yes|no|true|false|1|0|y|n)$/i;
function decodePayload(p){
  let s = String(p||'');
  const dec = x => x.replace(/(%[0-9a-f]{2})+/gi, run=>{ try { return decodeURIComponent(run); } catch(e){ return run; } });
  try { s = decodeURIComponent(s); } catch(e){ s = dec(s); }
  if (!/[\n|]/.test(s) && /%0A|%7C/i.test(s)) s = dec(s); // encoded twice
  return s.replace(/\r\n?/g, '\n').replace(/\u2028|\u2029/g, '\n');
}
function hash32(s){ let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h>>>0).toString(36); }
function parseCalPayload(payload){
  const text = decodePayload(payload);
  const lines = text.split('\n').map(l=>l.replace(/\s+$/,'')).filter(l=>l.trim());
  // group lines: a line that holds a date field starts a record; other lines continue the previous record (multi-line locations)
  const recs = []; let bad = 0;
  const hasDate = l => l.split('|').some(f=>parseDate(f));
  lines.forEach(l=>{
    if (l.includes('|') && hasDate(l)) recs.push(l);
    else if (recs.length && !FLAG_RE.test(recs[recs.length-1].split('|').pop().trim()) && (recs[recs.length-1].match(/\n/g)||[]).length < 4
      && (!l.includes('|') || /^[^|]*\|\s*(yes|no|true|false|1|0)\s*$/i.test(l))) recs[recs.length-1] += '\n' + l;
    else bad++;
  });
  const out = [], seen = new Set();
  recs.forEach(rec=>{
    const f = rec.split('|');
    const i = f.findIndex(x=>parseDate(x));
    if (i < 1){ bad++; return; }
    const title = f.slice(0, i).join('|').replace(/\s+/g,' ').trim() || 'Event';
    const s = parseDate(f[i]);
    let e = f[i+1] != null ? parseDate(f[i+1]) : null;
    let rest = f.slice(e ? i+2 : i+1);
    let flag = null;
    if (rest.length && FLAG_RE.test(rest[rest.length-1].trim())){ flag = /^(yes|true|1|y)$/i.test(rest.pop().trim()); }
    const loc = rest.join('|').split('\n').map(x=>x.trim()).filter(Boolean).join(', ').replace(/^,\s*|,\s*$/g,'').slice(0, 200);
    if (!e || e.ms < s.ms) e = null;
    const allDay = flag != null ? flag : (s.dateOnly || (s.hm === '00:00' && (!e || e.hm === '00:00' || /^23:5\d$/.test(e.hm)) && (!e || e.ms - s.ms >= 23*HOUR)));
    let start, end;
    if (allDay){
      const [Y,M,D] = s.date.split('-').map(Number); start = new Date(Y, M-1, D).getTime();
      if (e){ const [y,m,d] = e.date.split('-').map(Number); end = new Date(y, m-1, d).getTime(); if (e.dateOnly ? false : e.hm !== '00:00') end = addDays(end, 1); if (e.dateOnly) end = addDays(end, 1); }
      if (!end || end <= start) end = addDays(start, 1);
    } else { start = s.ms; end = e ? e.ms : s.ms + HOUR; }
    const key = title.toLowerCase() + '|' + start;
    if (seen.has(key)) return; seen.add(key);
    out.push({id:'c'+hash32(key), title:title.slice(0,160), start, end, allDay:!!allDay, loc});
  });
  out.sort((a,b)=>a.start-b.start || (b.allDay - a.allDay));
  return {events: out.slice(0, 600), bad};
}
let syncMsg = '';
function applySync(payload){
  const res = parseCalPayload(payload);
  st.events = res.events; st.syncedAt = Date.now(); st.syncCount = (st.syncCount||0) + 1;
  // events Jarvis added that now show up in the real calendar are no longer needed locally
  st.local = st.local.filter(l => l.end > Date.now() - DAY && !res.events.some(e => Math.abs(e.start - l.start) < MIN && e.title.toLowerCase().includes(l.title.toLowerCase().slice(0,20))));
  J.save();
  const n = upcomingEvents().length;
  syncMsg = res.events.length ? `📅 Calendar synced · ${plural(n,'upcoming event')}` : '📅 Calendar synced · nothing in the next 7 days';
  if (res.bad && !res.events.length) syncMsg = '📅 Synced, but I could not read the events. Check the setup steps.';
  return res;
}
/** read #cal=… or #jarvis=… from the address, then clean the address so it is never bookmarked */
function readHash(fromEvent){
  const h = location.hash || ''; let handled = false;
  if (/^#cal=/i.test(h)){ applySync(h.slice(5)); handled = true; }
  else if (/^#jarvis=alarm-ok/i.test(h)){ const m = h.match(/[&?]r=([^&]+)/); if (m){ st.alarmed[decodeURIComponent(m[1])] = Date.now(); } st.alarmReady = true; J.save(); syncMsg = '⏰ iPhone alarm set'; handled = true; }
  if (handled){
    try { history.replaceState(null, '', location.pathname + location.search); } catch(e){}
    if (fromEvent){ try { J.toast(syncMsg); } catch(e){} J.renderAll(); }
  }
}
readHash(false);
window.addEventListener('hashchange', ()=>readHash(true));

/* =========================================================
   Events helpers (synced + added by Jarvis)
   ========================================================= */
function allEvents(){ return st.events.concat(st.local.map(l=>Object.assign({mine:true}, l))).sort((a,b)=>a.start-b.start || (b.allDay - a.allDay)); }
function eventsBetween(from, to){ return allEvents().filter(e => e.start < to && e.end > from); }
function upcomingEvents(){ const now = Date.now(); return allEvents().filter(e => e.end > now); }
function nextTimed(){ const now = Date.now(); return allEvents().find(e => !e.allDay && e.end > now) || null; }
function remindersBetween(from, to){ return (J.db.reminders||[]).filter(r => !r.done && r.at >= from && r.at < to).sort((a,b)=>a.at-b.at); }
const stale = () => st.syncedAt && Date.now() - st.syncedAt > 26*HOUR;

/* =========================================================
   4. In-app alarm: WebAudio tone, overlay, snooze, nightstand
   ========================================================= */
let actx = null;
function ctx(){
  if (actx) return actx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  try { actx = new AC(); } catch(e){ actx = null; } return actx;
}
/** iPhone only lets a page make sound after a tap: unlock audio on the first tap anywhere */
function unlock(){
  const c = ctx(); if (!c) return done();
  try {
    const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
    if (c.state !== 'running' && c.resume) c.resume().then(()=>{ if (c.state === 'running') done(); }).catch(()=>{});
    if (c.state === 'running') done();
  } catch(e){}
  function done(){ ['pointerdown','touchend','click','keydown'].forEach(t=>document.removeEventListener(t, unlock, true)); }
}
['pointerdown','touchend','click','keydown'].forEach(t=>document.addEventListener(t, unlock, true));

const ring = {active:null, queue:[], timer:null, master:null, vib:null, stopAt:0};
function setSession(type){ try { if (navigator.audioSession) navigator.audioSession.type = type; } catch(e){} }
function tone(c, dest, t, f, dur, type, vol){
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.setValueAtTime(vol, t + Math.max(0.02, dur - 0.04)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.03);
}
function pattern(c, dest, t, kind){
  if (kind === 'alarm'){ // classic alarm: four quick beeps, short pause
    for (let i = 0; i < 4; i++){ tone(c, dest, t + i*0.2, i%2 ? 1318.5 : 1046.5, 0.13, 'square', 0.32); tone(c, dest, t + i*0.2, i%2 ? 659.25 : 523.25, 0.13, 'triangle', 0.25); }
    return t + 1.35;
  }
  // gentle chime for ordinary reminders: C6 E6 G6 C7
  [1046.5, 1318.5, 1568, 2093].forEach((f, i)=>{ tone(c, dest, t + i*0.16, f, 0.7, 'sine', 0.42); tone(c, dest, t + i*0.16, f*2, 0.3, 'sine', 0.08); });
  return t + 2.2;
}
function startSound(kind){
  stopSound();
  const c = ctx(); if (!c) return false;
  setSession('playback'); // iOS 17+: play even when the ring/silent switch is on
  try { if (c.state !== 'running') c.resume(); } catch(e){}
  try {
    const m = c.createGain(); m.connect(c.destination);
    const t0 = c.currentTime; m.gain.setValueAtTime(0.35, t0); m.gain.linearRampToValueAtTime(1, t0 + (kind==='alarm' ? 25 : 12)); // gets louder
    ring.master = m; let next = t0 + 0.06;
    const fill = ()=>{ if (!ring.master) return; while (next < c.currentTime + 1.6) next = pattern(c, m, next, kind); if (Date.now() > ring.stopAt) silence(); };
    ring.stopAt = Date.now() + (kind === 'alarm' ? 10*MIN : 90*1000);
    fill(); ring.timer = setInterval(fill, 350);
  } catch(e){ return false; }
  try { if (navigator.vibrate){ navigator.vibrate([400,200,400,200,400]); ring.vib = setInterval(()=>navigator.vibrate([400,200,400,200,400]), 2400); } } catch(e){}
  return c.state === 'running';
}
function silence(){
  clearInterval(ring.timer); ring.timer = null; clearInterval(ring.vib); ring.vib = null;
  try { navigator.vibrate && navigator.vibrate(0); } catch(e){}
  if (ring.master){ try { const c = ctx(); ring.master.gain.cancelScheduledValues(c.currentTime); ring.master.gain.setTargetAtTime(0.0001, c.currentTime, 0.05); const m = ring.master; setTimeout(()=>{ try { m.disconnect(); } catch(e){} }, 400); } catch(e){} }
  ring.master = null;
}
function stopSound(){ silence(); setSession('auto'); }

let ovEl = null;
function overlay(){
  if (ovEl) return ovEl;
  ovEl = document.createElement('div'); ovEl.className = 'cal-alarm'; ovEl.setAttribute('role','alertdialog'); ovEl.setAttribute('aria-live','assertive');
  document.body.appendChild(ovEl);
  ovEl.addEventListener('click', e=>{
    const b = e.target.closest('[data-cal-ov]');
    if (!b){ if (ring.active && !ring.master) startSound(ring.active.kind); else if (ring.active) { try { ctx().resume(); } catch(_){} } return; }
    const a = b.dataset.calOv;
    if (a === 'stop') stopAlarm(); else if (a === 'snooze') snoozeAlarm(); else if (a === 'sound'){ startSound(ring.active.kind); paintOverlay(); }
  });
  return ovEl;
}
function paintOverlay(){
  const r = ring.active; if (!r) return;
  const el = overlay(); const isAlarm = r.kind === 'alarm';
  const locked = !actx || actx.state !== 'running';
  el.className = 'cal-alarm open' + (isAlarm ? ' is-alarm' : '');
  el.innerHTML = `<div class="cal-al-in">
    <div class="cal-al-ring"><span></span><span></span><b>${isAlarm ? '⏰' : '🔔'}</b></div>
    <div class="cal-al-time">${esc(tfmt(Date.now()))}</div>
    <div class="cal-al-kind">${isAlarm ? 'Alarm' : 'Reminder'}${r.repeat && r.repeat !== 'none' ? ' · repeats ' + esc(r.repeat) : ''}</div>
    <div class="cal-al-text">${esc(r.text)}</div>
    ${locked ? `<button class="cal-al-sound" data-cal-ov="sound">🔊 Tap to turn the sound on</button>` : ''}
    <div class="cal-al-btns">
      <button class="cal-al-snooze" data-cal-ov="snooze">Snooze 10 min</button>
      <button class="cal-al-stop" data-cal-ov="stop">Stop</button>
    </div>
    ${ring.queue.length ? `<div class="cal-al-more">+ ${plural(ring.queue.length,'more reminder')}</div>` : ''}
  </div>`;
  document.documentElement.classList.add('cal-lock');
}
function showAlarm(r){
  if (ring.active){ if (ring.active.id !== r.id && !ring.queue.some(x=>x.id===r.id)) ring.queue.push(r); paintOverlay(); return; }
  ring.active = {id:r.id, text:r.text, kind:r.kind || (/\b(wake|alarm|get up)\b/i.test(r.text) ? 'alarm' : 'chime'), repeat:r.repeat, snoozeOf:r.snoozeOf};
  try { speechSynthesis.cancel(); } catch(e){}
  startSound(ring.active.kind);
  paintOverlay();
  clearInterval(ring.clock); ring.clock = setInterval(()=>{ const t = ovEl && ovEl.querySelector('.cal-al-time'); if (t && ring.active) t.textContent = tfmt(Date.now()); }, 5000);
  // pop-up too, for when the screen is on another app (Android) or the phone is locked with Jarvis open
  try {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted'){
      const body = r.text;
      if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(reg=>reg.showNotification('Jarvis', {body, icon:'icon-192.png', tag:'jarvis-'+r.id, requireInteraction:true})).catch(()=>{});
      else new Notification('Jarvis', {body});
    }
  } catch(e){}
}
function closeOverlay(){
  stopSound();
  const r = ring.active; ring.active = null;
  if (ring.queue.length){ showAlarm(ring.queue.shift()); return r; }
  clearInterval(ring.clock); if (ovEl){ ovEl.classList.remove('open'); }
  document.documentElement.classList.remove('cal-lock');
  return r;
}
function stopAlarm(){
  const a = closeOverlay(); if (!a) return;
  const r = (J.db.reminders||[]).find(x=>x.id===a.id);
  // a one-time reminder that rang is done; repeating ones were already moved to the next time
  if (r && (!r.repeat || r.repeat === 'none') && r.at <= Date.now() + MIN){ r.done = true; }
  J.save(); J.renderAll();
  if (!ring.active) setTimeout(()=>say(a.kind === 'alarm' ? `${J.greeting()}, ${S.name}. ${a.text}.` : `Reminder: ${a.text}.`), 250);
}
function snoozeAlarm(){
  const a = closeOverlay(); if (!a) return;
  const at = Date.now() + 10*MIN;
  const r = (J.db.reminders||[]).find(x=>x.id===a.id);
  if (r && (!r.repeat || r.repeat === 'none')){ r.at = at; r.fired = false; r.done = false; }
  else st.snoozes.push({id:J.uid(), rid:a.id, text:a.text, kind:a.kind, at}); // keep the repeat schedule as it is
  J.save(); J.renderAll(); J.toast('😴 Snoozed until ' + tfmt(at));
}
function checkSnoozes(){
  const now = Date.now(); const due = st.snoozes.filter(s=>s.at <= now); if (!due.length) return;
  st.snoozes = st.snoozes.filter(s=>s.at > now); J.save();
  due.forEach(s=>{ if (now - s.at < 30*MIN) showAlarm({id:s.rid, text:s.text, kind:s.kind, repeat:'none', snoozeOf:s.rid}); });
}
setInterval(checkSnoozes, 5000);
document.addEventListener('visibilitychange', ()=>{ if (!document.hidden){ checkSnoozes(); if (night.on) keepAwake(); } });

window.addEventListener('jarvis:reminder-due', e=>{
  try {
    const r = e.detail; if (!r || !st.ringInApp) return;
    if (Date.now() - r.at > 15*MIN) return; // missed while Jarvis was closed: the normal quiet notice is enough
    e.preventDefault(); // we take over: full-screen alarm with sound
    showAlarm(r);
  } catch(err){ console.error('calendar alarm', err); }
});

/* Nightstand mode: keeps the screen on so Jarvis itself can ring */
const night = {on:false, lock:null, timer:null};
async function keepAwake(){ try { if ('wakeLock' in navigator){ night.lock = await navigator.wakeLock.request('screen'); } } catch(e){ night.lock = null; } }
let nsEl = null;
function nightstand(on){
  night.on = on;
  if (!nsEl){ nsEl = document.createElement('div'); nsEl.className = 'cal-night'; document.body.appendChild(nsEl); nsEl.addEventListener('click', e=>{ if (e.target.closest('[data-cal-night-exit]')) nightstand(false); }); }
  clearInterval(night.timer);
  if (!on){ nsEl.classList.remove('open'); try { night.lock && night.lock.release(); } catch(e){} night.lock = null; document.documentElement.classList.remove('cal-lock'); return; }
  unlock(); keepAwake();
  const paint = ()=>{
    const nx = (J.db.reminders||[]).filter(r=>!r.done && r.at > Date.now()).sort((a,b)=>a.at-b.at)[0];
    const d = new Date();
    nsEl.innerHTML = `<div class="cal-ns-in">
      <div class="cal-ns-time">${esc(d.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'}).replace(/\s?[AP]M/i,''))}<small>${d.getHours()<12?'AM':'PM'}</small></div>
      <div class="cal-ns-date">${esc(d.toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'}))}</div>
      <div class="cal-ns-next">${nx ? `${nx.kind==='alarm'?'⏰':'🔔'} ${esc(nx.text)} · ${esc(J.whenText(nx.at))}` : 'No alarms set'}</div>
      <p>Jarvis will ring here. Keep the phone plugged in, sound up, and this screen open.${'wakeLock' in navigator ? '' : ' Turn off Auto-Lock in Settings so the screen stays on.'}</p>
      <button class="cal-ns-exit" data-cal-night-exit>Exit nightstand</button></div>`;
  };
  paint(); night.timer = setInterval(paint, 15000);
  nsEl.classList.add('open'); document.documentElement.classList.add('cal-lock');
}

function testSound(){
  unlock();
  const ok = startSound('alarm');
  setTimeout(stopSound, 2600);
  J.toast(ok || (actx && actx.state === 'running') ? '🔊 That is the Jarvis alarm' : '🔇 Sound is blocked. Tap once more.');
}

/* =========================================================
   5. "Make it ring on your iPhone" sheet
   ========================================================= */
let sheetEl = null, sheetFor = null;
function ensureSheet(){
  if (sheetEl) return sheetEl;
  sheetEl = document.createElement('div'); sheetEl.className = 'cal-sheet-wrap';
  sheetEl.innerHTML = `<div class="cal-sheet-bg" data-cal-close></div><div class="cal-sheet" role="dialog" aria-modal="true" aria-label="Make it ring on your iPhone"><div class="cal-grab"></div><div class="cal-sheet-body"></div></div>`;
  document.body.appendChild(sheetEl);
  sheetEl.addEventListener('click', onSheetClick);
  return sheetEl;
}
function isWake(r){ return r.kind === 'alarm' || /\b(wake|alarm|get up)\b/i.test(r.text||''); }
function sheetHTML(o){
  // o: {type:'reminder', r} | {type:'event', e} | {type:'all', list}
  let ics, title, sub, icon, alarmBtn = '', primary;
  if (o.type === 'event'){
    ics = buildICS([eventItem(o.e)]); icon = '📅'; title = 'Add it to your iPhone calendar';
    sub = `<b>${esc(o.e.title)}</b><span>${esc(J.whenText(o.e.start))}${o.e.loc ? ' · '+esc(o.e.loc) : ''}</span>`;
  } else if (o.type === 'all'){
    ics = buildICS(o.list.map(reminderItem)); icon = '🔔'; title = 'Make them ring on your iPhone';
    sub = `<b>${plural(o.list.length,'reminder')}</b><span>Each one gets a calendar alert at its time</span>`;
  } else {
    const r = o.r; ics = buildICS([reminderItem(r)]); icon = isWake(r) ? '⏰' : '🔔';
    title = 'Make it ring on your iPhone';
    sub = `<b>${esc(r.text)}</b><span>${esc(J.whenText(r.at))}${r.repeat && r.repeat !== 'none' ? ' · repeats '+esc(r.repeat) : ''}</span>`;
    if (st.alarmReady && alarmOK(r)) alarmBtn = `<a class="cal-big cal-big-alarm" href="${esc(alarmLink(r))}" data-cal-pick="alarm">⏰<span><b>Set iPhone alarm</b><small>Real Clock alarm · rings even on silent</small></span></a>`;
    else if (st.alarmReady && !alarmOK(r)) alarmBtn = `<div class="cal-note">⏰ iPhone alarms can only be set for the next 24 hours. Use the calendar alert for this one.</div>`;
    else if (isWake(r)) alarmBtn = `<button class="cal-big cal-big-ghost" data-cal-go-setup="alarm">⏰<span><b>Set up iPhone alarms</b><small>One time, about 2 minutes · rings even on silent</small></span></button>`;
  }
  const h = icsHref(ics);
  const calBtn = `<a class="cal-big cal-big-cal" href="${esc(h.href)}"${h.dl ? ` download="${esc(h.dl)}"` : ''} data-cal-pick="calendar">📅<span><b>Add to Calendar${o.type === 'event' ? '' : ' (rings)'}</b><small>${o.type === 'event' ? 'With an alert 15 minutes before' : 'Calendar alert at that time · no setup'}</small></span></a>`;
  const alarmFirst = o.type === 'reminder' && /cal-big-alarm/.test(alarmBtn) && (isWake(o.r) || st.pref === 'alarm');
  primary = alarmFirst ? alarmBtn + calBtn : calBtn + alarmBtn;
  sheetFor = Object.assign({}, o, {ics});
  return `<div class="cal-sh-head"><div class="cal-sh-ic">${icon}</div><div class="cal-sh-t"><h4>${title}</h4><div class="cal-sh-sub">${sub}</div></div></div>
    <div class="cal-sh-btns">${primary}</div>
    <button class="cal-link" data-cal-share>Calendar didn't open? Share the file instead</button>
    <p class="cal-sh-honest">iPhone asks for one tap, so Jarvis can't do this silently. Your choice goes first next time.${o.type === 'event' ? '' : ' If Jarvis is open at that time, it will ring here too.'}</p>
    <div class="cal-sh-foot"><button class="btn ghost" data-cal-close>Not now</button><button class="cal-link" data-cal-go-setup="1">How this works</button></div>`;
}
function openSheet(o){
  try {
    const el = ensureSheet(); freeBlobs();
    el.querySelector('.cal-sheet-body').innerHTML = sheetHTML(o);
    el.classList.add('open'); document.documentElement.classList.add('cal-lock');
  } catch(e){ console.error('calendar sheet', e); }
}
function closeSheet(){ if (sheetEl){ sheetEl.classList.remove('open'); } if (!(ring.active || night.on)) document.documentElement.classList.remove('cal-lock'); }
function onSheetClick(e){
  if (e.target.closest('[data-cal-close]')){ closeSheet(); return; }
  const g = e.target.closest('[data-cal-go-setup]'); if (g){ closeSheet(); st.tab = 'connect'; J.save(); J.go('calendar'); try { document.getElementById('sheet').classList.remove('open'); document.getElementById('sheetBg').classList.remove('open'); } catch(_){} setTimeout(()=>{ const x = document.getElementById(g.dataset.calGoSetup === 'alarm' ? 'cal-step-alarm' : 'cal-step-cal'); x && x.scrollIntoView({behavior:'smooth', block:'start'}); }, 120); return; }
  if (e.target.closest('[data-cal-share]')){ const o = sheetFor; if (o) shareICS(o.ics, o.type === 'event' ? 'jarvis-event.ics' : 'jarvis-reminder.ics').then(()=>{ markDone(o, 'calendar'); }); return; }
  const p = e.target.closest('[data-cal-pick]');
  if (p){ const o = sheetFor; st.pref = p.dataset.calPick; markDone(o, p.dataset.calPick); J.save(); setTimeout(closeSheet, 350); /* the link itself opens Calendar / Shortcuts */ }
}
function markDone(o, how){
  if (!o) return; const now = Date.now();
  if (o.type === 'reminder'){ (how === 'alarm' ? st.alarmed : st.added)[o.r.id] = now; }
  else if (o.type === 'all') o.list.forEach(r=>{ st.added[r.id] = now; });
  else if (o.type === 'event'){ const l = st.local.find(x=>x.id===o.e.id); if (l) l.added = now; }
  J.save(); setTimeout(()=>J.renderAll(), 400);
}
let bootAt = Date.now();
window.addEventListener('jarvis:reminder-added', e=>{
  try {
    const r = e.detail; if (!r || !st.sheetAfter) return;
    if (r.habitId || Date.now() - bootAt < 500) return; // habit check-ins re-save their reminders; they can be added from the Calendar screen
    if (r.at < Date.now()) return;
    setTimeout(()=>openSheet({type:'reminder', r}), 60);
  } catch(err){ console.error('calendar sheet', err); }
});

/* =========================================================
   6. Voice
   ========================================================= */
const HW = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12};
const UW = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9};
const TW = {ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19};
const TENW = {twenty:20,thirty:30,forty:40,fifty:50};
/** spoken clock times to digits: "seven thirty" → 7:30, "half past six" → 6:30, "quarter to seven" → 6:45 */
function spokenTimes(s){
  const H = '(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d{1,2})';
  const num = w => /^\d+$/.test(w) ? +w : HW[w.toLowerCase()];
  s = String(s).replace(/\ba\.? ?m\.?(?=\s|$|[,.!?])/gi,'am').replace(/\bp\.? ?m\.?(?=\s|$|[,.!?])/gi,'pm').replace(/\bo'? ?clock\b/gi,'').replace(/(\d)\s*([ap])\.?m\b/gi,'$1 $2m');
  s = s.replace(new RegExp('\\bhalf past '+H+'\\b','gi'), (_,h)=>num(h)+':30');
  s = s.replace(new RegExp('\\b(?:a )?quarter past '+H+'\\b','gi'), (_,h)=>num(h)+':15');
  s = s.replace(new RegExp('\\b(?:a )?quarter (?:to|till|of) '+H+'\\b','gi'), (_,h)=>{ const x = num(h); return (x===1?12:x-1)+':45'; });
  s = s.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:(oh|o)\s+(one|two|three|four|five|six|seven|eight|nine)|(ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)|(twenty|thirty|forty|fifty)(?:[\s-](one|two|three|four|five|six|seven|eight|nine))?)\b/gi,
    (all, h, oh, u1, teen, tens, u2)=>{ const L = x => x && x.toLowerCase(); const m = oh ? UW[L(u1)] : teen ? TW[L(teen)] : TENW[L(tens)] + (u2 ? UW[L(u2)] : 0); return HW[L(h)] + ':' + String(m).padStart(2,'0'); });
  s = s.replace(/\b(\d{1,2})[ .](\d{2})\s*([ap]m)\b/gi,'$1:$2 $3').replace(/\b(\d{1,2})(\d{2})\s*([ap]m)\b/gi,'$1:$2 $3');
  s = J.wordsToNumbers(s).replace(/\s+/g,' ');
  return s;
}
const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
/** when should an alarm ring? returns {at, repeat, rest} or null */
function parseAlarm(text, wake){
  let s = spokenTimes(text).toLowerCase(); const now = new Date(); let m; const cut = [];
  let repeat = 'none';
  if ((m = s.match(/\b(every ?day|daily|every morning|each morning|every night|each day)\b/))){ repeat = 'daily'; cut.push(m[0]); }
  else if ((m = s.match(/\bevery (sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))){ repeat = 'weekly'; cut.push('every'); }
  // relative: "in 20 minutes", "for 10 minutes" (timers), "for an hour"
  if ((m = s.match(/\b(?:in|for|after) (\d+(?:\.\d+)?|an?|half an|a half) (seconds?|secs?|minutes?|mins?|hours?|hrs?)\b(?: from now)?/))){
    const n = /^\d/.test(m[1]) ? parseFloat(m[1]) : /half/.test(m[1]) ? 0.5 : 1;
    const u = /^s/.test(m[2]) ? 1e3 : /^m/.test(m[2]) ? MIN : HOUR;
    cut.push(m[0]); return {at: Date.now() + n*u, repeat:'none', rest: strip(s, cut), relative:true};
  }
  let day = null, period = null;
  if ((m = s.match(/\b(tomorrow(?: morning| night| evening| afternoon)?|tmrw)\b/))){ day = addDays(startOfDay(now), 1); cut.push(m[0]); if (/morning/.test(m[0])) period = 'am'; else if (/night|evening|afternoon/.test(m[0])) period = 'pm'; }
  else if ((m = s.match(/\b(tonight|this evening|this afternoon)\b/))){ day = startOfDay(now); period = 'pm'; cut.push(m[0]); }
  else if ((m = s.match(/\b(today|this morning)\b/))){ day = startOfDay(now); if (/morning/.test(m[0])) period = 'am'; cut.push(m[0]); }
  if ((m = s.match(/\b(?:on |next |this )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)( morning| night| evening| afternoon)?\b/))){
    let diff = (DAYS.indexOf(m[1]) - now.getDay() + 7) % 7; if (diff === 0 && /next/.test(m[0])) diff = 7;
    day = addDays(startOfDay(now), diff); cut.push(m[0]); if (m[2]) period = /morning/.test(m[2]) ? 'am' : 'pm';
  }
  if (!period && (m = s.match(/\b(?:in the )?(morning|evening|night|afternoon)\b/))){ period = /morning/.test(m[1]) ? 'am' : 'pm'; cut.push(m[0]); }
  let h = null, mi = 0, ap = null;
  if ((m = s.match(/\b(?:at |for |to |by |around )?(\d{1,2})(?::(\d{2}))? ?(am|pm)\b/))){ h = +m[1]; mi = +(m[2]||0); ap = m[3]; cut.push(m[0]); }
  else if ((m = s.match(/\b(?:at |for |to |by |around )?(\d{1,2}):(\d{2})\b/))){ h = +m[1]; mi = +m[2]; cut.push(m[0]); }
  else if ((m = s.match(/\b(?:at|for|to|by|around) (\d{1,2})\b(?! ?(?:minutes?|mins?|hours?|hrs?|days?|people|%|dollars?))/))){ h = +m[1]; cut.push(m[0]); }
  else if ((m = s.match(/\b(?:at |for )?(noon|midday|midnight)\b/))){ h = /midnight/.test(m[1]) ? 0 : 12; ap = 'x'; cut.push(m[0]); }
  if (h === null){ if (day !== null && period){ h = period === 'am' ? 7 : 20; } else return null; }
  if (h > 23 || mi > 59) return null;
  let H = h;
  if (ap === 'am'){ H = h === 12 ? 0 : h; }
  else if (ap === 'pm'){ H = h === 12 ? 12 : h + 12; }
  else if (ap === null && h <= 12){
    const pm = period === 'pm' ? true : period === 'am' ? false : null;
    if (pm === true) H = h === 12 ? 12 : h + 12;
    else if (pm === false || wake) H = h === 12 ? 0 : h;
    else if (day !== null) H = (h >= 1 && h <= 6) ? h + 12 : h === 12 ? 12 : h; // "tomorrow at 3" means the afternoon
    else { // the next time the clock shows h:mm
      const a = new Date(now); a.setHours(h === 12 ? 0 : h, mi, 0, 0); const b = new Date(now); b.setHours(h === 12 ? 12 : h + 12, mi, 0, 0);
      const ca = a > now ? a : null, cb = b > now ? b : null;
      H = ca && (!cb || ca < cb) ? a.getHours() : cb ? b.getHours() : a.getHours();
    }
  }
  const d = new Date(day !== null ? day : startOfDay(now)); d.setHours(H, mi, 0, 0);
  if (day === null && d <= now) d.setDate(d.getDate() + 1);
  if (day !== null && d <= now) return {at: d.getTime(), repeat, rest: strip(s, cut), past:true};
  return {at: d.getTime(), repeat, rest: strip(s, cut)};
}
function strip(s, cut){ cut.forEach(c=>{ s = s.replace(c, ' '); }); return s.replace(/\s+/g,' ').trim(); }

const ALARM_CMD = /^(?:(?:please |can you |could you |will you |i need you to |i want you to )?(?:set|create|make|add|put|start|schedule)(?: me| up)?(?: an?| my| the| one)? (?:alarm|wake[- ]?up(?: call| alarm)?|timer)\b|(?:please |can you |could you )?(?:wake me(?: up)?|get me up)\b|alarm (?:at|for|in|tomorrow|tonight)\b|(?:i need|i want) (?:an alarm|to (?:wake|get) up)\b)/;
function alarmIntent(said, t){
  const s0 = t.replace(/^(?:hey |ok |okay )?jarvis /,'');
  if (!ALARM_CMD.test(s0)) return null;
  if (/\bremind me\b/.test(s0)) return null;
  const isTimer = /\btimer\b/.test(s0) && !/\balarm\b/.test(s0);
  const wake = /\b(wake|get me up|get up)\b/.test(s0);
  const p = parseAlarm(said.replace(/^(?:hey |ok |okay )?jarvis[\s,]+/i,''), wake);
  if (!p) return isTimer ? 'How long should the timer be? For example: set a timer for 10 minutes.' : 'What time should I set the alarm for? For example: wake me up at 6:30.';
  if (p.past) return `That time has already passed. Try another time, like ${wake ? 'wake me up at 7 tomorrow' : 'set an alarm for 7 am tomorrow'}.`;
  let label = p.rest
    .replace(ALARM_CMD, ' ').replace(/^(?:hey |ok |okay )?jarvis\b/,'')
    .replace(/\b(?:please|for me|thanks|thank you|from now)\b/g,' ')
    .replace(/\s+/g,' ').trim().replace(/\s+(?:on|at|in|for|to)$/,'').trim();
  const lead = (label.match(/^(for|to)\s+/) || [])[1];
  label = label.replace(/^(?:for|to|so (?:that )?i can|called|named|labell?ed|and|up)\s+/,'').replace(/^(?:for|to|on|at|in|up|alarm|timer|me|a|an)$/,'').trim();
  const text = isTimer ? (label ? cap(label) : 'Timer') : wake ? (label ? `Wake up ${lead || 'for'} ${label}` : 'Wake up') : (label ? cap(label) : 'Alarm');
  const r = J.addReminder({text, at:p.at, repeat:p.repeat, kind:'alarm'});
  try { J.go('reminders'); } catch(e){}
  const when = p.relative ? `${tsay(p.at)}, ${untilSay(p.at)}` : `${tsay(p.at)} ${daySay(p.at)}${p.repeat !== 'none' ? ', every ' + (p.repeat === 'daily' ? 'day' : 'week') : ''}`;
  const ready = st.alarmReady && alarmOK(r);
  return `${isTimer ? 'Timer' : 'Alarm'} set for ${when}. ` + (ready ? 'Tap Set iPhone alarm so it rings even if Jarvis is closed.' : 'Tap Add to Calendar so your iPhone rings even when Jarvis is closed.');
}

function alarmMgmt(t){
  if (/^(?:what|which) alarms? (?:do i have|are set|have i got)|^(?:what time is|when is) my (?:next )?alarm|^(?:do i have|is there|have i set) an? alarm|^(?:show|list|read)(?: me)? my alarms?$|^my alarms$/.test(t)){
    const list = (J.db.reminders||[]).filter(r=>r.kind==='alarm' && !r.done && r.at > Date.now()).sort((a,b)=>a.at-b.at);
    st.tab = 'alarms'; J.save(); J.go('calendar');
    if (!list.length) return 'You have no alarms set. Say: wake me up at 6:30.';
    return list.length === 1 ? `Your alarm is set for ${tsay(list[0].at)} ${daySay(list[0].at)}: ${list[0].text}.` : `You have ${list.length} alarms. Next: ${tsay(list[0].at)} ${daySay(list[0].at)}, ${list[0].text}.`;
  }
  if (/^(?:cancel|delete|remove|turn off|stop|clear|disable)(?: my| the| all| all my)? (?:next |last )?alarms?$/.test(t)){
    const all = /\ball\b/.test(t);
    const list = (J.db.reminders||[]).filter(r=>r.kind==='alarm' && !r.done && r.at > Date.now()).sort((a,b)=>a.at-b.at);
    if (!list.length) return 'You have no alarms set in Jarvis.';
    const gone = all ? list : [list[0]];
    J.db.reminders = J.db.reminders.filter(r=>!gone.includes(r)); st.snoozes = st.snoozes.filter(s=>!gone.some(g=>g.id===s.rid)); J.save(); J.renderAll();
    const onPhone = gone.some(g=>st.alarmed[g.id] || st.added[g.id]);
    return (all ? `Cancelled ${plural(gone.length,'alarm')}.` : `Cancelled your ${tsay(gone[0].at)} alarm.`) + (onPhone ? ' If you also added it to your iPhone, turn it off in the Clock or Calendar app.' : '');
  }
  return null;
}

/* "add lunch with Sara to my calendar tomorrow at 1" */
function addEventIntent(said, t){
  let m, body = null;
  const raw = said.replace(/^(?:hey |ok |okay )?jarvis[\s,]+/i,'').replace(/[.!?]+$/,'');
  if ((m = raw.match(/^(?:please |can you |could you )?(?:add|put|schedule|save|create|make|book)\s+(?:an? )?(?:event |appointment |meeting )?(?:called |for |named )?(.+?)\s+(?:to|on|in|into)\s+(?:my|the)\s+(?:iphone )?calendar\b\s*(.*)$/i))) body = (m[1] + ' ' + m[2]).trim();
  else if ((m = raw.match(/^(?:please )?(?:add|put|create|make)\s+(?:to|on|in|into)\s+(?:my|the)\s+calendar[:,]?\s+(.+)$/i))) body = m[1];
  else if ((m = raw.match(/^(?:please )?(?:add|create|make|schedule|book)\s+(?:a|an)\s+(?:new )?(?:calendar )?(event|appointment|meeting)\b\s*(?:for |called |named |with |about )?(.*)$/i))) body = (m[1].toLowerCase() === 'meeting' && /^with\b/i.test(raw.split(/meeting/i)[1].trim()) ? 'Meeting ' : '') + m[2];
  if (body === null) return null;
  if (/^(the|my)?\s*(economic|market)/i.test(body)) return null;
  const {date, rest} = J.parseTime(J.wordsToNumbers(spokenTimes(body)));
  const title = cap((rest || '').replace(/\b(at|on|for|from|starting)\s*$/i,'').replace(/^(an?|the)\s+/i,'').trim() || 'Event');
  if (!date) return `What day and time? For example: add ${lc(title)} to my calendar tomorrow at 1.`;
  if (date.getTime() < Date.now() - 5*MIN) return 'That time has already passed. Try a time in the future.';
  const durM = (body.match(/\bfor (\d+) (hours?|minutes?|mins?)\b/i)); const dur = durM ? (+durM[1]) * (/^h/i.test(durM[2]) ? HOUR : MIN) : HOUR;
  const e = {id:'j'+J.uid(), title, start:date.getTime(), end:date.getTime()+dur, allDay:false, loc:'', alert:15, created:Date.now()};
  st.local.push(e); J.save();
  st.tab = 'agenda'; J.go('calendar'); J.renderAll();
  setTimeout(()=>openSheet({type:'event', e}), 60);
  return `Okay: ${title}, ${daySay(e.start)} at ${tsay(e.start)}. Tap Add to Calendar to save it on your iPhone.`;
}

/* questions: schedule, next meeting, free time */
function periodOf(t){
  const t0 = startOfDay(Date.now()); let base = null, label = null, from, to, m;
  if (/\btomorrow\b/.test(t)){ base = addDays(t0,1); label = 'tomorrow'; }
  else if (/\b(today|tonight|this (?:morning|afternoon|evening))\b/.test(t)){ base = t0; label = 'today'; }
  else if ((m = t.match(/\b(?:on |this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))){ let diff = (DAYS.indexOf(m[1]) - new Date().getDay() + 7) % 7; if (/next/.test(m[0]) && diff === 0) diff = 7; base = addDays(t0, diff); label = diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : 'on ' + cap(m[1]); }
  if (/\b(this|the|next) week\b|\bthis weekend\b|\bweek\b/.test(t) && base === null){ return {from:Date.now(), to:addDays(t0, 7), label:'this week', week:true}; }
  if (base === null){ base = t0; label = null; }
  from = base; to = addDays(base, 1);
  if (/\bmorning\b/.test(t)){ from = base + 5*HOUR; to = base + 12*HOUR; label = (label === 'today' || !label ? 'this' : label) + ' morning'; }
  else if (/\bafternoon\b/.test(t)){ from = base + 12*HOUR; to = base + 17*HOUR; label = (label === 'today' || !label ? 'this' : label) + ' afternoon'; }
  else if (/\b(evening|tonight|night)\b/.test(t)){ from = base + 17*HOUR; to = addDays(base,1); label = label === 'tomorrow' ? 'tomorrow night' : label && label !== 'today' ? label + ' evening' : 'tonight'; }
  if (label && /^(this |tonight)/.test(label)) label = label.replace(/^this this/, 'this');
  return {from, to, label: label || 'today', bare: !label};
}
function evSay(e){ return e.allDay ? `${e.title}, all day` : `${e.title} at ${tsay(e.start)}`; }
function listSay(arr, max){ max = max || 5; const a = arr.slice(0, max); let s = a.length <= 1 ? a.join('') : a.slice(0,-1).join(', ') + ' and ' + a[a.length-1]; if (arr.length > max) s += `, plus ${arr.length - max} more`; return s; }
function scheduleAnswer(p){
  const now = Date.now(), from = Math.max(p.from, p.week ? now : p.from);
  let evs = eventsBetween(from, p.to).filter(e => e.end > now || p.from < startOfDay(now));
  if (p.label === 'today' || /^this |^tonight/.test(p.label)) evs = evs.filter(e => e.end > now);
  const rems = remindersBetween(Math.max(p.from, now), p.to);
  const parts = [];
  if (!st.syncedAt){
    const r = rems.length ? `Reminders ${p.label}: ${listSay(rems.map(x=>`${x.text} at ${tsay(x.at)}`))}.` : `No reminders ${p.label}.`;
    return `I can't see your iPhone calendar yet. ${r} To connect it, open Calendar, then Connect.`;
  }
  if (p.week){
    if (!evs.length) parts.push('Nothing on your calendar for the rest of the week.');
    else {
      const byDay = {}; evs.forEach(e=>{ const k = dayLabel(Math.max(e.start, startOfDay(now))); (byDay[k] = byDay[k] || []).push(e); });
      parts.push(`You have ${plural(evs.length,'event')} this week. ` + Object.entries(byDay).slice(0,4).map(([d, l])=>`${d}: ${listSay(l.map(evSay), 3)}`).join('. ') + '.');
    }
  } else if (!evs.length) parts.push(`Your calendar is clear ${p.label}.`);
  else parts.push(`${cap(p.label)} you have ${evs.length === 1 ? 'one event' : plural(evs.length,'event')}: ${listSay(evs.map(evSay))}.`);
  if (!p.week && !evs.length && p.bare){ const nx = upcomingEvents()[0]; if (nx) parts.push(`Next up: ${nx.title}, ${daySay(nx.start)}${nx.allDay ? '' : ' at ' + tsay(nx.start)}.`); }
  if (rems.length) parts.push(`${rems.length === 1 ? 'And one reminder' : `And ${rems.length} reminders`}: ${listSay(rems.map(x=>`${x.text} at ${tsay(x.at)}`), 3)}.`);
  if (stale()) parts.push(`This is from your last calendar sync, ${sinceText(st.syncedAt)}.`);
  return parts.join(' ');
}
function calendarQuestions(t){
  let m;
  if (/^(?:open|show|show me|go to|take me to|see)(?: my| the)? (?:iphone )?calendar(?: app| page| screen)?$|^(?:my )?calendar$|^(?:open|show)(?: my)? agenda$/.test(t)){ st.tab = 'agenda'; J.save(); J.go('calendar'); return st.syncedAt ? 'Here is your calendar.' : "Here's your calendar. It's not connected to your iPhone yet. The Connect tab shows how."; }
  if (/^(?:sync|refresh|update|reload)(?: my| the)? (?:iphone )?calendar(?: now)?$/.test(t)){ st.tab = 'agenda'; J.save(); J.go('calendar'); return 'Tap Sync now to bring in your iPhone calendar.'; }
  if (/^(?:connect|link|set up|setup)(?: my| the)? (?:iphone|calendar|alarms?|clock|shortcuts?)\b|^(?:how do i |how can i )?(?:make|get)(?: my)? reminders? (?:to )?(?:ring|make (?:a )?sound|alarm)/.test(t)){ st.tab = 'connect'; J.save(); J.go('calendar'); return 'Here is how to connect Jarvis to your iPhone calendar and alarms. Each step has a copy button.'; }
  // next event
  if (/^(?:when(?:'s| is)|what(?:'s| is)) (?:my )?next (?:meeting|event|appointment|thing on my calendar|calendar event)\b|^(?:what(?:'s| is) next on my calendar|do i have a meeting (?:soon|coming up|next))$/.test(t)){
    if (!st.syncedAt && !st.local.length) { st.tab = 'connect'; J.save(); J.go('calendar'); return "I can't see your iPhone calendar yet. The Connect tab shows how to link it in about two minutes."; }
    const e = nextTimed(); st.tab = 'agenda'; J.save(); J.go('calendar');
    if (!e) return 'Nothing coming up on your calendar in the next 7 days.' + (stale() ? ` That's from your last sync, ${sinceText(st.syncedAt)}.` : '');
    const now = Date.now();
    return (e.start <= now ? `${e.title} is happening now, until ${tsay(e.end)}.` : `Your next event is ${e.title}, ${daySay(e.start)} at ${tsay(e.start)}, ${untilSay(e.start)}.`) + (e.loc ? ` At ${e.loc.split(',')[0]}.` : '');
  }
  // am I free?
  if ((m = t.match(/^am i (?:free|busy|available)\b(.*)$/))){
    const tail = m[1]; const p = periodOf(tail);
    const tm = J.parseTime(spokenTimes(tail)); const timed = /\b\d{1,2}(:\d{2})? ?(am|pm)?\b/.test(spokenTimes(tail)) && tm.date;
    if (!st.syncedAt) return "I can't see your iPhone calendar yet, so I can't tell. Open Calendar, then Connect, to link it.";
    if (timed){ const a = tm.date.getTime(), b = a + 30*MIN; const hit = eventsBetween(a, b).filter(e=>!e.allDay); return hit.length ? `No, you have ${listSay(hit.map(evSay), 2)}.` : `Yes, you're free ${daySay(a)} at ${tsay(a)}.`; }
    const hit = eventsBetween(p.from, p.to).filter(e=>!e.allDay && e.end > Date.now());
    return hit.length ? `${cap(p.label)} you have ${listSay(hit.map(evSay), 3)}.` : `Yes, nothing on your calendar ${p.label}.`;
  }
  // schedule / agenda / calendar questions
  const ask = /^(?:what(?:'s| is| do i have)?|how(?:'s| is| does)|show me|tell me|read(?: me)?|give me|any(?:thing)?|do i have(?: anything| any(?:thing)?| any events| any meetings| meetings| events| plans)?|is there anything|have i got anything|are there any (?:events|meetings))\b/;
  const about = /\b(?:calendar|schedule|agenda|events?|meetings?|appointments?|plans|my day look|my week look|on for (?:today|tomorrow))\b|^what do i have (?:today|tomorrow|tonight|this (?:morning|afternoon|evening|week)|on (?:\w+day))$|^(?:do i have|have i got|is there|anything|is there anything)(?: anything)?(?: on| planned| scheduled| going on)? (?:today|tomorrow|tonight|this (?:morning|afternoon|evening|week|weekend)|(?:on |this |next )?(?:sun|mon|tues|wednes|thurs|fri|satur)day)(?: (?:morning|afternoon|evening|night))?$/;
  if (ask.test(t) && about.test(t) && !/\b(?:economic|market|markets|stocks?|fomc|fed)\b/.test(t) && !/\bremind/.test(t) && !/\b(?:habit|workout|food|meal)\b/.test(t)){
    const p = periodOf(t); st.tab = 'agenda'; J.save(); J.go('calendar');
    return scheduleAnswer(p);
  }
  return null;
}

J.addIntent((said, t)=>{
  try { return alarmMgmt(t) || alarmIntent(said, t) || addEventIntent(said, t) || calendarQuestions(t); }
  catch(e){ console.error('calendar intent', e); return null; }
});
J.addSuggestions(['Wake me up at 6:30', "What's on my calendar today?", 'When is my next meeting?', 'Add lunch with Sara to my calendar tomorrow at 1']);

/* morning brief */
if (typeof J.addBriefLine === 'function') J.addBriefLine(()=>{
  if (!st.syncedAt) return null;
  const t0 = startOfDay(Date.now()), now = Date.now();
  const evs = eventsBetween(t0, addDays(t0,1)).filter(e=>e.end > now);
  if (!evs.length) return stale() ? null : 'Your calendar is clear today.';
  const first = evs.find(e=>!e.allDay) || evs[0];
  return (evs.length === 1 ? `You have one event today: ${evSay(first)}` : `You have ${evs.length} events today. First: ${evSay(first)}`) + (stale() ? ` (calendar last synced ${sinceText(st.syncedAt)})` : '');
});

/* =========================================================
   7. Screens
   ========================================================= */
J.css(`
.cal-lock body{overflow:hidden}
.cal-sync{display:flex;align-items:center;gap:12px;padding:12px 14px;margin-bottom:14px}
.cal-sync .cal-dot{width:10px;height:10px;border-radius:50%;background:var(--good);box-shadow:0 0 0 4px rgba(34,197,94,.16);flex:none}
.cal-sync .cal-dot.warn{background:var(--warn);box-shadow:0 0 0 4px rgba(245,158,11,.16)}
.cal-sync .cal-dot.off{background:var(--faint);box-shadow:0 0 0 4px var(--line)}
.cal-sync .lbl{flex:1;min-width:0}.cal-sync .lbl b{display:block;font-size:14px}.cal-sync .lbl small{color:var(--muted);font-size:12.5px}
.cal-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:14px;padding:11px 14px;font:inherit;font-weight:700;font-size:14px;cursor:pointer;background:var(--accent);color:#fff;text-decoration:none;white-space:nowrap;min-height:44px}
.cal-btn.ghost{background:var(--card);color:var(--text);border:1px solid var(--line)}
.cal-btn.sm{padding:8px 12px;font-size:13px;min-height:38px;border-radius:12px}
.cal-btn:active,.cal-big:active{transform:scale(.97)}
.cal-next{position:relative;overflow:hidden;border-radius:24px;padding:18px;color:#fff;background:linear-gradient(135deg,#f43f5e 0%,#e11d48 40%,#7c3aed 100%);box-shadow:0 18px 40px rgba(225,29,72,.28);margin-bottom:6px}
.cal-next::after{content:"";position:absolute;right:-50px;top:-50px;width:170px;height:170px;border-radius:50%;background:rgba(255,255,255,.12)}
.cal-next .k{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.85}
.cal-next .t{font-size:21px;font-weight:800;letter-spacing:-.4px;margin:4px 0 4px;line-height:1.2;word-wrap:break-word;position:relative;z-index:1}
.cal-next .m{font-size:13.5px;opacity:.9;position:relative;z-index:1}
.cal-next .c{position:absolute;right:16px;bottom:16px;background:rgba(255,255,255,.2);border-radius:999px;padding:6px 11px;font-weight:800;font-size:13px;z-index:1}
.cal-day{margin:20px 2px 8px;display:flex;align-items:baseline;justify-content:space-between}
.cal-day h3{margin:0;font-size:15px;font-weight:800}.cal-day span{color:var(--muted);font-size:12.5px;font-weight:600}
.cal-allday{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.cal-allday span{background:var(--accent-soft);color:var(--text);border-radius:10px;padding:6px 10px;font-size:13px;font-weight:600;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cal-ev{display:flex;gap:12px;align-items:stretch;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:12px 14px;margin-bottom:8px}
.cal-ev .tm{flex:none;width:72px;font-weight:800;font-size:13.5px;line-height:1.25;white-space:nowrap}
.cal-ev .tm small{display:block;color:var(--muted);font-weight:600;font-size:11.5px}
.cal-ev .bar{width:4px;border-radius:4px;flex:none;background:linear-gradient(180deg,#f43f5e,#7c3aed)}
.cal-ev.rem .bar{background:linear-gradient(180deg,var(--warn),#f97316)}
.cal-ev .bd{flex:1;min-width:0}.cal-ev .bd b{display:block;font-weight:650;word-wrap:break-word}
.cal-ev .bd small{display:block;color:var(--muted);font-size:12.5px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cal-ev.past{opacity:.5}
.cal-ev.now{border-color:rgba(244,63,94,.5);box-shadow:0 0 0 3px rgba(244,63,94,.1)}
.cal-pill{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:800;vertical-align:1px;margin-left:4px}
.cal-pill.ok{background:rgba(34,197,94,.14);color:var(--good)}.cal-pill.no{background:rgba(245,158,11,.14);color:var(--warn)}.cal-pill.live{background:rgba(244,63,94,.14);color:var(--bad)}
.cal-acts{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.cal-hero-empty{text-align:center;padding:26px 18px}
.cal-hero-empty .big{font-size:44px;line-height:1;margin-bottom:10px}
.cal-hero-empty h3{margin:0 0 6px;font-size:18px}.cal-hero-empty p{margin:0 0 14px;color:var(--muted)}
.cal-step{display:flex;gap:12px;padding:12px 0;border-top:1px solid var(--line)}
.cal-step:first-of-type{border-top:0}
.cal-step .n{flex:none;width:28px;height:28px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;font-weight:800;font-size:13px}
.cal-step .tx{flex:1;min-width:0;font-size:14.5px;line-height:1.45}
.cal-step .tx b{font-weight:700}
.cal-step .tx code{font:600 13px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--bg2);border:1px solid var(--line);border-radius:7px;padding:1px 6px;word-break:break-all}
.cal-copy{display:flex;align-items:center;gap:8px;margin-top:8px;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:6px 6px 6px 12px}
.cal-copy span{flex:1;min-width:0;font:600 13px ui-monospace,SFMono-Regular,Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cal-part{margin-bottom:14px}
.cal-part-h{display:flex;align-items:center;gap:12px;margin-bottom:6px}
.cal-part-h .ic{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;font-size:22px;flex:none}
.cal-part-h b{display:block;font-size:16px}.cal-part-h small{color:var(--muted);font-size:12.5px}
.cal-part p{color:var(--muted);font-size:13.5px;margin:6px 0 10px}
.cal-truth{display:grid;grid-template-columns:auto 1fr;gap:10px 12px;font-size:13.5px;align-items:start}
.cal-truth i{font-style:normal;font-size:16px;line-height:1.3}
.cal-truth b{font-weight:700}
.cal-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.cal-chips button{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:999px;padding:8px 12px;font:inherit;font-size:13px;font-weight:600;cursor:pointer;min-height:38px}
.cal-chips button.on{background:var(--accent);border-color:var(--accent);color:#fff}
.cal-field{width:100%;background:var(--bg2);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:11px 12px;font:inherit;font-size:16px;margin-top:8px}
.cal-home{display:flex;align-items:center;gap:12px;padding:14px;cursor:pointer}
.cal-home .ic{width:44px;height:44px;border-radius:14px;flex:none;display:grid;place-items:center;font-size:21px;background:linear-gradient(135deg,#f43f5e,#7c3aed);color:#fff;box-shadow:0 8px 18px rgba(225,29,72,.25)}
.cal-home .bd{flex:1;min-width:0}.cal-home .bd small{display:block;color:var(--muted);font-size:12px;font-weight:600}
.cal-home .bd b{display:block;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cal-home .cd{flex:none;font-weight:800;font-size:13px;color:var(--accent);background:var(--accent-soft);border-radius:999px;padding:5px 10px}
.cal-home .x{flex:none;border:0;background:none;color:var(--muted);width:36px;height:36px;border-radius:10px;font-size:16px;cursor:pointer}
.cal-sheet-wrap{position:fixed;inset:0;z-index:45;pointer-events:none}
.cal-sheet-bg{position:absolute;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);opacity:0;transition:opacity .3s}
.cal-sheet{position:absolute;left:50%;bottom:0;transform:translate(-50%,105%);width:100%;max-width:520px;max-height:92vh;overflow-y:auto;background:var(--bg2);border:1px solid var(--line);border-bottom:0;border-radius:28px 28px 0 0;padding:0 18px calc(18px + env(safe-area-inset-bottom,0px));transition:transform .42s var(--ease);box-shadow:0 -20px 60px rgba(0,0,0,.4)}
.cal-sheet-wrap:not(.open){visibility:hidden;transition:visibility 0s linear .42s}.cal-sheet-wrap.open{pointer-events:auto}.cal-sheet-wrap.open .cal-sheet-bg{opacity:1}.cal-sheet-wrap.open .cal-sheet{transform:translate(-50%,0)}
.cal-grab{width:42px;height:5px;border-radius:9px;background:var(--faint);opacity:.5;margin:10px auto 12px}
.cal-sh-head{display:flex;gap:14px;align-items:center;margin-bottom:16px}
.cal-sh-ic{width:56px;height:56px;border-radius:18px;display:grid;place-items:center;font-size:28px;flex:none;background:linear-gradient(135deg,#f43f5e,#7c3aed);box-shadow:0 10px 24px rgba(225,29,72,.3)}
.cal-sh-t{min-width:0}.cal-sh-t h4{margin:0 0 4px;font-size:19px;font-weight:800;letter-spacing:-.3px}
.cal-sh-sub b{display:block;font-weight:650;word-wrap:break-word}.cal-sh-sub span{color:var(--muted);font-size:13px}
.cal-sh-btns{display:flex;flex-direction:column;gap:10px}
.cal-big{display:flex;align-items:center;gap:14px;text-align:left;width:100%;border:0;border-radius:20px;padding:16px;font:inherit;font-size:26px;cursor:pointer;text-decoration:none;color:#fff;background:linear-gradient(135deg,var(--accent),#4f46e5);box-shadow:0 12px 26px rgba(79,70,229,.32);transition:transform .15s var(--ease)}
.cal-big span{display:flex;flex-direction:column;min-width:0}.cal-big b{font-size:16.5px;font-weight:800}.cal-big small{font-size:12.5px;opacity:.88;font-weight:500;margin-top:1px}
.cal-big-alarm{background:linear-gradient(135deg,#f97316,#e11d48);box-shadow:0 12px 26px rgba(225,29,72,.3)}
.cal-big-ghost{background:var(--card);color:var(--text);border:1px solid var(--line);box-shadow:none}
.cal-big-ghost small{color:var(--muted);opacity:1}
.cal-note{font-size:13px;color:var(--muted);background:var(--card);border:1px dashed var(--line);border-radius:14px;padding:10px 12px}
.cal-link{border:0;background:none;color:var(--accent);font:inherit;font-weight:650;font-size:13.5px;cursor:pointer;padding:12px 4px;min-height:44px}
.cal-sh-honest{color:var(--muted);font-size:12.5px;margin:2px 0 12px;line-height:1.45}
.cal-sh-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}
.cal-alarm{position:fixed;inset:0;z-index:70;display:none;align-items:center;justify-content:center;padding:24px 20px calc(24px + env(safe-area-inset-bottom,0px));color:#fff;text-align:center;background:radial-gradient(120% 80% at 50% 0%,#4338ca 0%,#1e1b4b 55%,#0b0a1f 100%)}
.cal-alarm.is-alarm{background:radial-gradient(120% 80% at 50% 0%,#f97316 0%,#be123c 45%,#2a0610 100%)}
.cal-alarm.open{display:flex;animation:fadeUp .3s var(--ease)}
.cal-al-in{width:100%;max-width:420px;display:flex;flex-direction:column;align-items:center}
.cal-al-ring{position:relative;width:120px;height:120px;display:grid;place-items:center;margin-bottom:18px}
.cal-al-ring b{font-size:56px;animation:calShake 1.2s ease-in-out infinite;position:relative;z-index:1}
.cal-al-ring span{position:absolute;inset:0;border-radius:50%;border:3px solid rgba(255,255,255,.5);animation:calPulse 1.8s ease-out infinite}
.cal-al-ring span+span{animation-delay:.9s}
@keyframes calPulse{0%{transform:scale(.6);opacity:1}100%{transform:scale(1.6);opacity:0}}
@keyframes calShake{0%,100%{transform:rotate(0)}10%,30%{transform:rotate(-14deg)}20%,40%{transform:rotate(14deg)}50%{transform:rotate(0)}}
.cal-al-time{font-size:64px;font-weight:800;letter-spacing:-2px;line-height:1}
.cal-al-kind{margin-top:8px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.8}
.cal-al-text{font-size:24px;font-weight:700;margin:14px 0 26px;line-height:1.25;word-wrap:break-word;max-width:100%}
.cal-al-sound{border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.14);color:#fff;border-radius:999px;padding:12px 18px;font:inherit;font-weight:700;margin:-8px 0 20px;cursor:pointer}
.cal-al-btns{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%}
.cal-al-btns button{border:0;border-radius:22px;min-height:72px;font:inherit;font-size:18px;font-weight:800;cursor:pointer}
.cal-al-snooze{background:rgba(255,255,255,.16);color:#fff;border:1px solid rgba(255,255,255,.3)!important}
.cal-al-stop{background:#fff;color:#111}
.cal-al-btns button:active{transform:scale(.97)}
.cal-al-more{margin-top:14px;font-size:13px;opacity:.8}
.cal-night{position:fixed;inset:0;z-index:65;display:none;align-items:center;justify-content:center;background:#000;color:#e5e7eb;text-align:center;padding:24px}
.cal-night.open{display:flex}
.cal-ns-in{max-width:420px}
.cal-ns-time{font-size:96px;font-weight:300;letter-spacing:-4px;line-height:1;color:#fca5a5}
.cal-ns-time small{font-size:22px;letter-spacing:0;margin-left:6px;font-weight:600}
.cal-ns-date{margin-top:10px;color:#9ca3af;font-weight:600}
.cal-ns-next{margin:26px 0 10px;font-size:17px;font-weight:700;color:#f3f4f6}
.cal-night p{color:#6b7280;font-size:13px;margin:0 0 26px}
.cal-ns-exit{border:1px solid #374151;background:#111827;color:#d1d5db;border-radius:14px;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer}
.cal-set-btn{white-space:nowrap}
@media (prefers-reduced-motion: reduce){.cal-al-ring b,.cal-al-ring span{animation:none}}
`);

/* ---------- rendering helpers ---------- */
function syncBar(){
  const has = !!st.syncedAt;
  const dot = !has ? 'off' : stale() ? 'warn' : '';
  const n = upcomingEvents().length;
  return `<div class="card cal-sync"><span class="cal-dot ${dot}"></span><div class="lbl"><b>${has ? `iPhone calendar · ${plural(n,'event')} ahead` : 'iPhone calendar not connected'}</b><small>${has ? `Last synced ${sinceText(st.syncedAt)}` : 'Two minutes to set up, once'}</small></div>
    ${has ? `<a class="cal-btn sm" href="${esc(syncLink())}">↻ Sync now</a>` : `<button class="cal-btn sm" data-cal-tab="connect">Connect</button>`}</div>`;
}
function onPhone(r){ return st.added[r.id] || st.alarmed[r.id]; }
function evRow(e, now){
  const past = e.end <= now, live = e.start <= now && e.end > now;
  const tm = `${esc(tfmt(Math.max(e.start, e.start)))}<small>${esc(tfmt(e.end))}</small>`;
  return `<div class="cal-ev${past?' past':''}${live?' now':''}"><div class="tm">${tm}</div><div class="bar"></div><div class="bd"><b>${esc(e.title)}${live?'<span class="cal-pill live">Now</span>':''}${e.mine ? (e.added ? '<span class="cal-pill ok">Added</span>' : '<span class="cal-pill no">Not on iPhone yet</span>') : ''}</b>${e.loc ? `<small>📍 ${esc(e.loc)}</small>` : ''}${!past && !live ? `<small>${esc(until(e.start))}</small>` : ''}
    ${e.mine && !e.added ? `<div class="cal-acts"><button class="cal-btn sm" data-cal-ev="${esc(e.id)}">📅 Add to Calendar</button><button class="cal-btn sm ghost" data-cal-evdel="${esc(e.id)}">Remove</button></div>` : ''}</div></div>`;
}
function remRow(r){
  const ok = onPhone(r);
  return `<div class="cal-ev rem"><div class="tm">${esc(tfmt(r.at))}<small>${r.kind==='alarm'?'Alarm':'Reminder'}</small></div><div class="bar"></div><div class="bd"><b>${r.kind==='alarm'?'⏰ ':'🔔 '}${esc(r.text)}${ok ? '<span class="cal-pill ok">On iPhone</span>' : ''}</b><small>${esc(until(r.at))}${r.repeat && r.repeat!=='none' ? ' · repeats ' + esc(r.repeat) : ''}</small></div></div>`;
}
function agendaHTML(){
  const now = Date.now(), t0 = startOfDay(now);
  let h = syncBar();
  if (!st.syncedAt && !st.local.length){
    h += `<div class="card cal-hero-empty"><div class="big">📅</div><h3>See your iPhone calendar here</h3><p>Jarvis reads your calendar each time you open it with the Action Button. Then just ask “What's on my schedule?”</p><button class="cal-btn" data-cal-tab="connect">Show me how</button></div>`;
  } else {
    const nx = nextTimed();
    if (nx){
      const live = nx.start <= now;
      h += `<div class="cal-next"><div class="k">${live ? 'Happening now' : 'Up next'}</div><div class="t">${esc(nx.title)}</div><div class="m">${esc(dayLabel(nx.start))} · ${esc(tfmt(nx.start))} – ${esc(tfmt(nx.end))}${nx.loc ? ' · 📍 ' + esc(nx.loc.split(',')[0]) : ''}</div><div style="height:26px"></div><div class="c">${live ? 'until ' + esc(tfmt(nx.end)) : esc(until(nx.start))}</div></div>`;
    }
  }
  for (let i = 0; i < 7; i++){
    const d0 = addDays(t0, i), d1 = addDays(t0, i+1);
    const evs = eventsBetween(d0, d1); const rems = remindersBetween(Math.max(d0, now - HOUR), d1);
    if (!evs.length && !rems.length && i > 1) continue;
    const ad = evs.filter(e=>e.allDay), timed = evs.filter(e=>!e.allDay);
    const rows = timed.map(e=>({at:e.start, html:evRow(e, now)})).concat(rems.map(r=>({at:r.at, html:remRow(r)}))).sort((a,b)=>a.at-b.at);
    const lbl = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(d0).toLocaleDateString([], {weekday:'long'});
    h += `<div class="cal-day"><h3>${esc(lbl)}</h3><span>${esc(new Date(d0).toLocaleDateString([], {month:'short', day:'numeric'}))}${evs.length ? ' · ' + plural(evs.length,'event') : ''}</span></div>`;
    if (ad.length) h += `<div class="cal-allday">${ad.map(e=>`<span title="${esc(e.title)}">🗓️ ${esc(e.title)}</span>`).join('')}</div>`;
    h += rows.length ? rows.map(x=>x.html).join('') : (!ad.length ? `<div class="empty" style="padding:16px">${i === 0 ? (st.syncedAt ? 'Nothing else today. Enjoy it.' : 'No reminders today.') : 'Nothing planned yet.'}</div>` : '');
  }
  return h;
}
function alarmsHTML(){
  const now = Date.now();
  const list = (J.db.reminders||[]).filter(r=>!r.done && r.at > now - MIN).sort((a,b)=>a.at-b.at).slice(0, 40);
  const notOn = list.filter(r=>!onPhone(r));
  let h = `<div class="card cal-part"><div class="cal-part-h"><div class="ic" style="background:rgba(244,63,94,.15)">🔔</div><div><b>Upcoming reminders & alarms</b><small>${list.length ? `${plural(list.length,'reminder')} · ${notOn.length ? notOn.length + ' not on your iPhone yet' : 'all on your iPhone'}` : 'Nothing set'}</small></div></div>`;
  if (!list.length) h += `<p>Say “Wake me up at 6:30” or “Remind me to call mom at 6 pm”.</p>`;
  else if (notOn.length > 1) h += `<button class="cal-btn" style="width:100%;margin:6px 0 4px" data-cal-all>📅 Add all ${notOn.length} to Calendar</button>`;
  h += `</div>`;
  h += list.map(r=>{
    const ok = onPhone(r);
    return `<div class="cal-ev rem"><div class="tm">${esc(tfmt(r.at))}<small>${esc(dayLabel(r.at).split(',')[0].replace(/^(\w{3})\w*day$/,'$1'))}</small></div><div class="bar"></div><div class="bd"><b>${r.kind==='alarm'?'⏰ ':'🔔 '}${esc(r.text)}</b><small>${ok ? (st.alarmed[r.id] ? '✓ iPhone alarm set' : '✓ Added to iPhone calendar') : 'Only rings while Jarvis is open'}${r.repeat && r.repeat!=='none' ? ' · repeats ' + esc(r.repeat) : ''}</small>
      <div class="cal-acts"><button class="cal-btn sm${ok?' ghost':''}" data-cal-ring="${esc(r.id)}">${ok ? 'Add again' : '📲 Make it ring'}</button></div></div></div>`;
  }).join('');
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  h += `<div class="section-h"><h3>While Jarvis is open</h3></div>
  <div class="set-group">
    <div class="set-row"><div class="set-ic" style="background:rgba(244,63,94,.15)">🚨</div><div class="lbl"><b>Ring inside Jarvis</b><small>Full-screen alarm with sound when it's open</small></div><label class="switch"><input type="checkbox" data-cal-set="ringInApp" ${st.ringInApp?'checked':''}><span></span></label></div>
    <div class="set-row"><div class="set-ic" style="background:rgba(109,93,252,.15)">🔊</div><div class="lbl"><b>Test the alarm sound</b><small>Turn your volume up</small></div><button class="cal-btn sm ghost" data-cal-test="sound">Play</button></div>
    <div class="set-row"><div class="set-ic" style="background:rgba(17,24,39,.5)">🌙</div><div class="lbl"><b>Nightstand mode</b><small>Keeps the screen on so Jarvis can wake you</small></div><button class="cal-btn sm ghost" data-cal-night>Start</button></div>
    ${perm === 'default' ? `<div class="set-row"><div class="set-ic" style="background:rgba(245,158,11,.15)">💬</div><div class="lbl"><b>Pop-up alerts</b><small>${isIOS && !standalone ? 'Works after you add Jarvis to your Home Screen' : 'Shows a banner while Jarvis is open'}</small></div><button class="cal-btn sm ghost" data-cal-notif>Allow</button></div>` : ''}
  </div>`;
  return h;
}
function copyRow(text, label){ return `<div class="cal-copy"><span>${esc(label || text)}</span><button class="cal-btn sm" data-cal-copy="${esc(text)}">Copy</button></div>`; }
function stepHTML(n, html){ return `<div class="cal-step"><div class="n">${n}</div><div class="tx">${html}</div></div>`; }
function connectHTML(){
  const syncPrefix = (/^https?:/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.host) ? location.origin + location.pathname : APP_URL) + '#cal=';
  let h = `<div class="card cal-part"><div class="cal-part-h"><div class="ic" style="background:rgba(34,197,94,.15)">✅</div><div><b>What rings when Jarvis is closed</b><small>Honest answers</small></div></div>
    <div class="cal-truth" style="margin-top:10px">
      <i>📅</i><span><b>Calendar alert: yes.</b> Your iPhone shows it and plays the alert sound. It stays quiet if the side switch is on silent or a Focus is on.</span>
      <i>⏰</i><span><b>iPhone alarm: yes, even on silent.</b> A real Clock alarm. Best for waking up. Needs the shortcut below, once.</span>
      <i>🚨</i><span><b>Jarvis's own alarm: only while Jarvis is open</b> on screen. Use Nightstand mode at night.</span>
    </div></div>`;
  // Part 1
  h += `<div class="card cal-part" id="cal-step-ics"><div class="cal-part-h"><div class="ic" style="background:rgba(109,93,252,.15)">📅</div><div><b>1 · Calendar alerts</b><small>No setup needed</small></div></div>
    <p>After every reminder, Jarvis offers <b>Add to Calendar</b>. Tap it, then tap <b>Add</b> (or <b>Add All</b>) on the iPhone screen that appears.</p>
    <div class="cal-acts"><a class="cal-btn" data-cal-test="ics" href="#">Test it: alert in 2 minutes</a></div>
    <p style="margin-top:10px">No alert sound? On your iPhone open <b>Settings → Sounds & Haptics → Calendar Alerts</b> and pick a sound.</p></div>`;
  // Part 2
  h += `<div class="card cal-part" id="cal-step-alarm"><div class="cal-part-h"><div class="ic" style="background:rgba(249,115,22,.15)">⏰</div><div><b>2 · Real iPhone alarms</b><small>Optional · one time · about 2 minutes · iOS 17 or newer</small></div></div>
    <p>This makes a shortcut that Jarvis can ask to set a Clock alarm.</p>
    ${stepHTML(1, 'Open the <b>Shortcuts</b> app and tap <b>+</b> at the top right.')}
    ${stepHTML(2, 'Tap the name at the top, tap <b>Rename</b>, and paste this name:' + copyRow(st.alarmName))}
    ${stepHTML(3, 'Tap <b>Search Actions</b>, paste this, and tap <b>Get Dates from Input</b> in the results:' + copyRow('Get Dates from Input'))}
    ${stepHTML(4, 'In that action, tap the blue word <b>Input</b> and choose <b>Shortcut Input</b>.')}
    ${stepHTML(5, 'Search again, paste this, and tap <b>Create Alarm</b> (the Clock one):' + copyRow('Create Alarm'))}
    ${stepHTML(6, 'In Create Alarm, tap <b>Time</b> and choose <b>Dates</b>. Optional: tap the arrow ▸, then <b>Label</b>, and paste <code>Jarvis</code>.')}
    ${stepHTML(7, 'Tap <b>Done</b>. Come back here and tap <b>Test it</b>. If iPhone asks for permission, tap <b>Always Allow</b>.')}
    <div class="cal-acts"><a class="cal-btn" data-cal-test="alarm" href="${esc(alarmLink({id:'test', at:Math.ceil((Date.now()+2*MIN)/MIN)*MIN}))}">Test it: alarm in 2 minutes</a></div>
    <div class="set-row" style="padding:14px 0 2px;border:0"><div class="lbl"><b>The test alarm worked</b><small>Turn on to show “Set iPhone alarm”. Delete the test alarm in Clock.</small></div><label class="switch"><input type="checkbox" data-cal-set="alarmReady" ${st.alarmReady?'checked':''}><span></span></label></div></div>`;
  // Part 3
  const names = ['Jarvis', 'Open Jarvis', 'Jarvis 2.0'];
  if (!names.includes(st.syncName)) names.push(st.syncName);
  h += `<div class="card cal-part" id="cal-step-cal"><div class="cal-part-h"><div class="ic" style="background:rgba(244,63,94,.15)">🔄</div><div><b>3 · Show your iPhone calendar in Jarvis</b><small>One time · about 3 minutes · then it syncs every time you open Jarvis</small></div></div>
    <p>You will add a few steps to the shortcut your Action Button already runs, so every press brings your next 7 days into Jarvis.</p>
    ${stepHTML(1, 'Open <b>Shortcuts</b>, touch and hold the shortcut your Action Button runs, and tap <b>Edit</b>.')}
    ${stepHTML(2, 'Tap <b>Search Actions</b>, paste this, and tap <b>Find Calendar Events</b>:' + copyRow('Find Calendar Events') + 'Drag it to the very top.')}
    ${stepHTML(3, 'In it, tap <b>Add Filter</b>. Set it to <b>End Date</b> · <b>is in the next</b> · <b>7</b> · <b>days</b>. Set <b>Sort by</b> to <b>Start Date</b>.')}
    ${stepHTML(4, 'Search, paste, and add <b>Repeat with Each</b> right under it:' + copyRow('Repeat with Each'))}
    ${stepHTML(5, 'Search, paste, and add a <b>Text</b> action. Drag it <b>inside</b> the repeat (between Repeat and End Repeat).' + copyRow('Text'))}
    ${stepHTML(6, 'Fill the Text box by tapping, left to right: <b>Repeat Item</b> → <b>Title</b>, paste <code>|</code>, <b>Repeat Item</b> → <b>Start Date</b>, paste <code>|</code>, <b>Repeat Item</b> → <b>End Date</b>, paste <code>|</code>, <b>Repeat Item</b> → <b>Location</b>.' + copyRow('|', '|  (the line character)'))}
    ${stepHTML(7, 'Tap the <b>Start Date</b> you added, set <b>Date Format</b> to <b>ISO 8601</b>, and turn on <b>Include ISO 8601 Time</b>. Do the same for <b>End Date</b>.')}
    ${stepHTML(8, 'Under End Repeat, add <b>Combine Text</b>. It should say <b>Combine Repeat Results with New Lines</b>.' + copyRow('Combine Text'))}
    ${stepHTML(9, 'Then add <b>URL Encode</b> (it should say <b>Encode Combined Text</b>).' + copyRow('URL Encode'))}
    ${stepHTML(10, 'In the action that opens Jarvis (<b>Open URLs</b>), replace the link with this, then tap <b>URL Encoded Text</b> in the bar above the keyboard to add it at the end:' + copyRow(syncPrefix))}
    ${stepHTML(11, 'Tap <b>Done</b> and press your Action Button. The first time, tap <b>Allow</b> for calendar access.')}
    <div class="set-row" style="padding:12px 0 4px;border:0;flex-wrap:wrap"><div class="lbl" style="min-width:100%"><b>Your Action Button shortcut's name</b><small>Used by the “Sync now” button. Tap the one that matches, or paste it.</small>
      <div class="cal-chips">${names.map(n=>`<button class="${n===st.syncName?'on':''}" data-cal-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <input class="cal-field" data-cal-namefield value="${esc(st.syncName)}" placeholder="Shortcut name" autocomplete="off" autocapitalize="words"></div></div>
    <div class="cal-acts"><a class="cal-btn" href="${esc(syncLink())}">Test it: sync now</a><span style="color:var(--muted);font-size:12.5px;align-self:center">${st.syncedAt ? 'Last synced ' + esc(sinceText(st.syncedAt)) : 'Not synced yet'}</span></div>
    <p style="margin-top:12px">Tip: on iPhone, the Jarvis icon on the Home Screen keeps its own separate data. The shortcut opens Jarvis in Safari, so use Jarvis from the Action Button to see the same reminders and calendar.</p></div>`;
  // settings
  h += `<div class="section-h"><h3>Preferences</h3></div><div class="set-group">
    <div class="set-row"><div class="set-ic" style="background:rgba(109,93,252,.15)">📲</div><div class="lbl"><b>After a new reminder</b><small>Show “Make it ring on your iPhone”</small></div><label class="switch"><input type="checkbox" data-cal-set="sheetAfter" ${st.sheetAfter?'checked':''}><span></span></label></div>
    <div class="set-row"><div class="set-ic" style="background:rgba(249,115,22,.15)">⭐</div><div class="lbl"><b>Button shown first</b><small>Wake-up alarms always offer the iPhone alarm first</small></div><select data-cal-pref><option value="calendar" ${st.pref!=='alarm'?'selected':''}>Calendar alert</option><option value="alarm" ${st.pref==='alarm'?'selected':''} ${st.alarmReady?'':'disabled'}>iPhone alarm</option></select></div>
  </div>`;
  return h;
}
function viewHTML(){
  const tab = ['agenda','alarms','connect'].includes(st.tab) ? st.tab : 'agenda';
  return `<h2>Calendar</h2><p class="lede">Your iPhone calendar, reminders and alarms.</p>
  <div class="seg" role="tablist">${[['agenda','Agenda'],['alarms','Alarms'],['connect','Connect']].map(([k,l])=>`<button class="${tab===k?'active':''}" data-cal-tab="${k}" role="tab" aria-selected="${tab===k}">${l}</button>`).join('')}</div>
  ${tab === 'agenda' ? agendaHTML() : tab === 'alarms' ? alarmsHTML() : connectHTML()}`;
}

/* ---------- actions ---------- */
async function copy(text){
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch(e){}
  if (!ok){ try { const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly',''); ta.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length); ok = document.execCommand('copy'); ta.remove(); } catch(e){} }
  J.toast(ok ? '📋 Copied. Now paste it in Shortcuts.' : 'Could not copy. Touch and hold the text to copy it.');
}
function bind(root){
  if (root._calBound) return; root._calBound = true;
  root.addEventListener('click', e=>{
    const tb = e.target.closest('[data-cal-tab]'); if (tb){ st.tab = tb.dataset.calTab; J.save(); paint(root, true); window.scrollTo({top:0, behavior:'smooth'}); return; }
    const cp = e.target.closest('[data-cal-copy]'); if (cp){ copy(cp.dataset.calCopy); return; }
    const nm = e.target.closest('[data-cal-name]'); if (nm){ st.syncName = nm.dataset.calName; J.save(); paint(root, true); J.toast('Saved: ' + st.syncName); return; }
    const rg = e.target.closest('[data-cal-ring]'); if (rg){ const r = (J.db.reminders||[]).find(x=>x.id===rg.dataset.calRing); if (r) openSheet({type:'reminder', r}); return; }
    if (e.target.closest('[data-cal-all]')){ const list = (J.db.reminders||[]).filter(r=>!r.done && r.at > Date.now() && !onPhone(r)); if (list.length) openSheet({type:'all', list}); return; }
    const ev = e.target.closest('[data-cal-ev]'); if (ev){ const x = st.local.find(l=>l.id===ev.dataset.calEv); if (x) openSheet({type:'event', e:x}); return; }
    const evd = e.target.closest('[data-cal-evdel]'); if (evd){ const i = st.local.findIndex(l=>l.id===evd.dataset.calEvdel); if (i>=0){ const [x] = st.local.splice(i,1); J.save(); paint(root, true); J.toast('Removed ' + x.title, ()=>{ st.local.splice(i,0,x); J.save(); paint(root, true); }); } return; }
    const ts = e.target.closest('[data-cal-test]'); if (ts){
      const k = ts.dataset.calTest;
      if (k === 'sound'){ testSound(); return; }
      if (k === 'ics'){ // build a fresh 2-minute test right at tap time
        const at = Math.ceil((Date.now() + 2*MIN)/MIN)*MIN; const ics = buildICS([{uid:'test-'+at, title:'🔔 Jarvis test alert', start:at, end:at+5*MIN, alert:0, desc:'Delete me after the test'}]);
        const h = icsHref(ics); ts.setAttribute('href', h.href); if (h.dl) ts.setAttribute('download', h.dl); else ts.removeAttribute('download'); return; // the link opens it
      }
      if (k === 'alarm'){ ts.setAttribute('href', alarmLink({id:'test', at:Math.ceil((Date.now()+2*MIN)/MIN)*MIN})); return; }
    }
    if (e.target.closest('[data-cal-night]')){ nightstand(true); return; }
    if (e.target.closest('[data-cal-notif]')){ try { Notification.requestPermission().then(()=>paint(root, true)); } catch(_){} return; }
  });
  root.addEventListener('change', e=>{
    const s = e.target.closest('[data-cal-set]'); if (s){ st[s.dataset.calSet] = s.checked; if (s.dataset.calSet === 'alarmReady' && !s.checked && st.pref === 'alarm') st.pref = 'calendar'; J.save(); paint(root, true); return; }
    const p = e.target.closest('[data-cal-pref]'); if (p){ st.pref = p.value; J.save(); return; }
    const f = e.target.closest('[data-cal-namefield]'); if (f){ const v = f.value.trim(); if (v){ st.syncName = v.slice(0, 60); J.save(); J.toast('Saved: ' + st.syncName); paint(root, true); } }
  });
}
function paint(el, force){
  const a = document.activeElement;
  if (!force && a && el.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return; // don't redraw under a finger
  const html = viewHTML();
  if (!force && el._calSig === html) return;
  el._calSig = html; el.innerHTML = html;
}
J.addView({id:'calendar', label:'Calendar', icon:'📅', color:'#f43f5e', order:15, render(el){
  try { bind(el); paint(el); } catch(e){ console.error('calendar view', e); el.innerHTML = '<div class="empty">Calendar could not load. Please reopen the app.</div>'; }
}});

/* Home card: next event, or a one-time setup tip */
J.addHomeCard({id:'calendar', order:38, render(el){
  try {
    if (!el._calBound){ el._calBound = true; el.addEventListener('click', e=>{ if (e.target.closest('[data-cal-x]')){ e.stopPropagation(); st.homeTip = false; J.save(); J.renderAll(); return; } if (e.target.closest('.cal-home')){ st.tab = st.syncedAt || st.local.length ? 'agenda' : 'connect'; J.save(); J.go('calendar'); } }); }
    const now = Date.now(), t0 = startOfDay(now);
    let html = '';
    const nx = nextTimed();
    if (nx && nx.start - now < 3*DAY){
      const today = eventsBetween(t0, addDays(t0,1)).filter(e=>e.end > now).length;
      html = `<div class="section-h"><h3>Calendar</h3><button class="link" data-go="calendar">Agenda</button></div><div class="card cal-home" role="button" tabindex="0"><div class="ic">📅</div><div class="bd"><small>${nx.start <= now ? 'Now' : 'Next'} · ${esc(dayLabel(nx.start))} ${esc(tfmt(nx.start))}${today > 1 ? ` · ${today} today` : ''}</small><b>${esc(nx.title)}</b></div><div class="cd">${nx.start <= now ? 'now' : esc(until(nx.start))}</div></div>`;
    } else if (!st.syncedAt && st.homeTip){
      html = `<div class="card cal-home" role="button" tabindex="0" style="margin-top:16px"><div class="ic">🔔</div><div class="bd"><small>Never miss a reminder</small><b>Make reminders ring on your iPhone</b></div><button class="x" data-cal-x aria-label="Hide this tip">✕</button></div>`;
    }
    if (el._calSig !== html){ el._calSig = html; el.innerHTML = html; }
  } catch(e){ console.error('calendar home', e); }
  try { settingsRow(); } catch(e){}
}});

/* Settings screen: a group that opens this feature */
function settingsRow(){
  let g = document.getElementById('cal-settings');
  const v = document.getElementById('v-settings'); if (!v) return;
  if (!g){
    const heads = [...v.querySelectorAll('.section-h')]; const before = heads.find(h=>/alerts/i.test(h.textContent)) || null;
    const head = document.createElement('div'); head.className = 'section-h'; head.innerHTML = '<h3>iPhone calendar &amp; alarms</h3>';
    g = document.createElement('div'); g.className = 'set-group'; g.id = 'cal-settings';
    if (before){ v.insertBefore(head, before); v.insertBefore(g, before); } else { v.appendChild(head); v.appendChild(g); }
    g.addEventListener('click', e=>{ const b = e.target.closest('[data-cal-open]'); if (b){ st.tab = b.dataset.calOpen; J.save(); J.go('calendar'); } });
  }
  const html = `<div class="set-row"><div class="set-ic" style="background:rgba(244,63,94,.15)">📅</div><div class="lbl"><b>Calendar sync</b><small>${st.syncedAt ? 'Synced ' + esc(sinceText(st.syncedAt)) + ' · shortcut “' + esc(st.syncName) + '”' : 'Not connected yet'}</small></div><button class="btn ghost cal-set-btn" data-cal-open="connect">${st.syncedAt ? 'Manage' : 'Connect'}</button></div>
    <div class="set-row"><div class="set-ic" style="background:rgba(249,115,22,.15)">⏰</div><div class="lbl"><b>Make reminders ring</b><small>${st.alarmReady ? 'Calendar alerts + iPhone alarms (“' + esc(st.alarmName) + '”)' : 'Calendar alerts · iPhone alarms not set up'}</small></div><button class="btn ghost cal-set-btn" data-cal-open="${st.alarmReady ? 'alarms' : 'connect'}">${st.alarmReady ? 'Open' : 'Set up'}</button></div>`;
  if (g._sig !== html){ g._sig = html; g.innerHTML = html; }
}

document.addEventListener('DOMContentLoaded', ()=>{
  bootAt = Date.now();
  try { settingsRow(); } catch(e){}
  if (syncMsg) setTimeout(()=>{ try { J.toast(syncMsg); } catch(e){} }, 400);
});
setInterval(()=>{ try { if (J.current === 'calendar'){ const v = document.getElementById('v-calendar'); v && paint(v); } } catch(e){} }, 30000);

/* for tests and other features */
J.calendar = { buildICS, reminderItem, eventItem, parseCalPayload, applySync, parseAlarm, spokenTimes, alarmText, alarmLink, syncLink, openSheet, closeSheet, showAlarm, stopAlarm, snoozeAlarm, checkSnoozes, nightstand, get ring(){ return ring; }, get audio(){ return actx; }, store: st };

} catch(e){ console.error('calendar feature failed to load', e); }
})();
