/* =========================================================
   CLOUD SYNC + ONLINE BACKUP  (features/sync.js)
   Every copy of the app (Safari from the Action Button, the home-screen icon, other phones or computers)
   signs in with the same email and shares one copy of the data, kept on a free Supabase database.
   - Sign-in: a 6-digit code sent by email (works inside the home-screen app; a magic LINK would open Safari instead).
   - Push: shortly after any change (debounced). Pull: on open, on coming back to the app, when back online, every few minutes.
   - Conflicts: a 3-way merge per namespace (the top-level parts of the jarvis2 object: notes, expenses, food, habits...).
     Lists of items with an id are merged item by item (adds on both sides are kept, deletes are respected);
     when the same thing changed on both sides, the newest change wins.
   - Offline: changes wait on this device and are sent when the connection is back.
   - Only the `jarvis2` object is synced. The Gemini key (`jarvis2-ai`), caches, debug log, etc. never leave the device.
     The chosen voice (settings.voice) stays per device, since each device has different voices.
   - Each person's data is private to their account (row-level security in the database, see docs/SYNC-SETUP.md).
   ========================================================= */
(function(){
'use strict';
const J = window.Jarvis; if (!J) return;

/* ====================== SERVER DETAILS (the one place to fill in) ======================
   These two values are PUBLIC by design (they ship to every browser). They only let a person
   sign in; the database rules make sure each account sees only its own data.
   Leave them empty and the app works exactly as before (data on this device only).
   They can also be pasted from Settings → Sync → "Server details" (saved on that device only). */
const SYNC_CONFIG = {
  url: 'https://azvrduetnqaxiamnlbho.supabase.co',      // e.g. 'https://abcdefghijkl.supabase.co'
  anonKey: 'sb_publishable_Bckb6hUQpm7XcEhZJ53KDg_vLGYh-HG'   // the project's "anon public" or "publishable" key
};
/* ======================================================================================= */

const KEY = 'jarvis2', META = 'jarvis2-sync', BASE = 'jarvis2-sync-base', CFG = 'jarvis2-sync-config';
const LOCAL_ONLY_SETTINGS = ['voice'];          // per-device settings, never sent
const PULL_EVERY = 3 * 60e3, PUSH_DELAY = 1500, BACKUP_DAYS = 30;
const S = JSON.stringify, now = () => Date.now();
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const isIdList = a => Array.isArray(a) && a.every(x => isObj(x) && x.id != null);
const ls = {
  get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { origSet.call(localStorage, k, S(v)); return true; } catch(e){ return false; } },
  del(k){ try { localStorage.removeItem(k); } catch(e){} }
};
const origSet = Storage.prototype.setItem;

function config(){
  const c = ls.get(CFG, null);
  const url = String((c && c.url) || SYNC_CONFIG.url || '').trim().replace(/\/+$/, '');
  const anonKey = String((c && c.anonKey) || SYNC_CONFIG.anonKey || '').trim();
  return url && anonKey ? {url, anonKey} : null;
}

/* meta: {session:{access, refresh, exp, uid, email}, stamps:{ns: last local change ms}, cursor, lastOk, err, backupDay} */
let meta = Object.assign({stamps:{}}, ls.get(META, {}));
let base = ls.get(BASE, {});           // ns -> JSON text both sides last agreed on
let snap = {};                         // ns -> JSON text last seen locally (to notice changes)
let busy = null, again = false, pushT = 0, applying = false;
const saveMeta = () => ls.set(META, meta), saveBase = () => ls.set(BASE, base);

/* ---------- what gets synced ---------- */
function clean(ns, v){
  if (ns !== 'settings' || !isObj(v)) return v;
  const o = Object.assign({}, v); LOCAL_ONLY_SETTINGS.forEach(k => delete o[k]); return o;
}
const local = ns => clean(ns, J.db[ns]);
const nsList = () => Object.keys(J.db).filter(k => J.db[k] !== undefined);
function noteChanges(){
  let changed = false;
  nsList().forEach(ns => { const t = S(local(ns)); if (snap[ns] !== t){ snap[ns] = t; meta.stamps[ns] = now(); changed = true; } });
  if (changed) saveMeta();
  return changed;
}
const dirty = () => nsList().filter(ns => S(local(ns)) !== base[ns]);

/* ---------- 3-way merge: b = last agreed, l = this device, r = cloud, ln = this device changed last ---------- */
function merge(b, l, r, ln){
  if (S(l) === S(r)) return l;
  if (b !== undefined && S(l) === S(b)) return r;
  if (b !== undefined && S(r) === S(b)) return l;
  if (isIdList(l) && isIdList(r)) return mergeList(isIdList(b) ? b : [], l, r, ln);
  if (isObj(l) && isObj(r)){
    const bo = isObj(b) ? b : {}, o = {}, first = ln ? l : r, second = ln ? r : l;
    const keys = [...new Set([...Object.keys(first), ...Object.keys(second)])];
    keys.forEach(k => {
      const inL = k in l, inR = k in r;
      if (inL && inR){ o[k] = merge(bo[k], l[k], r[k], ln); return; }
      const side = inL ? l[k] : r[k];
      if (!(k in bo)) o[k] = side;                          // added on one side: keep
      else if (S(side) !== S(bo[k])) o[k] = side;           // deleted on one side but changed on the other: keep the change
    });
    return o;
  }
  return ln ? l : r;                                        // same thing changed on both sides: newest wins
}
function mergeList(b, l, r, ln){
  const bm = new Map(b.map(x => [String(x.id), x])), lm = new Map(l.map(x => [String(x.id), x])), rm = new Map(r.map(x => [String(x.id), x]));
  const first = ln ? l : r, second = ln ? r : l, secondM = ln ? rm : lm, firstM = ln ? lm : rm;
  const keepLone = (id, item) => !bm.has(id) || S(item) !== S(bm.get(id));   // new, or edited after the other side deleted it
  const out = [];
  first.forEach(x => { const id = String(x.id), y = secondM.get(id);
    if (y) out.push(ln ? merge(bm.get(id), x, y, ln) : merge(bm.get(id), y, x, ln));
    else if (keepLone(id, x)) out.push(x); });
  second.forEach((x, i) => { const id = String(x.id); if (firstM.has(id) || !keepLone(id, x)) return; out.splice(Math.min(i, out.length), 0, x); });
  return out;
}

/* ---------- put cloud data into this device without breaking features that hold references (J.store) ---------- */
function patch(target, src){
  if (Array.isArray(target) && Array.isArray(src)){
    src.forEach((v, i) => { target[i] = fit(target[i], v); }); target.length = src.length; return target;
  }
  Object.keys(target).forEach(k => { if (!(k in src)) delete target[k]; });
  Object.keys(src).forEach(k => { target[k] = fit(target[k], src[k]); });
  return target;
}
const fit = (old, v) => (isObj(old) && isObj(v)) || (Array.isArray(old) && Array.isArray(v)) ? patch(old, v) : v;
function setLocal(ns, v){
  if (ns === 'settings' && isObj(v) && isObj(J.db.settings)) v = Object.assign({}, v, ...LOCAL_ONLY_SETTINGS.map(k => k in J.db.settings ? {[k]: J.db.settings[k]} : {}));
  const db = J.db; db[ns] = fit(db[ns], JSON.parse(S(v)));
}

/* ---------- server calls (plain fetch, no library) ---------- */
async function call(path, opt){
  const c = config(); if (!c) throw new Error('not set up');
  opt = opt || {};
  const h = Object.assign({apikey: c.anonKey, 'Content-Type': 'application/json'}, opt.headers || {});
  if (opt.auth !== false){ await freshToken(); h.Authorization = 'Bearer ' + meta.session.access; }
  let res = await fetch(c.url + path, {method: opt.method || 'GET', headers: h, body: opt.body ? S(opt.body) : undefined});
  if (res.status === 401 && opt.auth !== false && !opt.retried){ meta.session.exp = 0; return call(path, Object.assign({}, opt, {retried: true})); }
  const txt = await res.text(); let data = null; try { data = txt ? JSON.parse(txt) : null; } catch(e){ data = txt; }
  if (!res.ok){ const e = new Error((data && (data.msg || data.message || data.error_description || data.error)) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
  return data;
}
function takeSession(d, email){
  meta.session = {access: d.access_token, refresh: d.refresh_token, exp: now() + (d.expires_in || 3600) * 1000, uid: d.user && d.user.id, email: (d.user && d.user.email) || email};
  saveMeta();
}
async function freshToken(){
  const s = meta.session; if (!s) throw new Error('signed out');
  if (s.exp - 60e3 > now()) return;
  try {
    const d = await call('/auth/v1/token?grant_type=refresh_token', {method: 'POST', auth: false, body: {refresh_token: s.refresh}});
    takeSession(d, s.email);
  } catch(e){ if (e.status === 400 || e.status === 401 || e.status === 403){ signOut(true); } throw e; }
}
/* email + password: sign in, or create the account the first time (needs "Confirm email" off in Supabase) */
async function signInPw(email, password){
  let d;
  try { d = await call('/auth/v1/token?grant_type=password', {method: 'POST', auth: false, body: {email, password}}); }
  catch(e){
    if (e.status !== 400) throw e;
    let su;
    try { su = await call('/auth/v1/signup', {method: 'POST', auth: false, body: {email, password}}); }
    catch(e2){ if (/registered|exists/i.test(e2.message)) throw new Error('wrong password'); throw e2; }
    if (!su || !su.access_token) throw new Error('wrong password');
    d = su;
  }
  base = {}; saveBase(); meta.cursor = null; nsList().forEach(ns => { meta.stamps[ns] = meta.stamps[ns] || 0; });
  takeSession(d, email); return syncNow();
}
function signOut(expired){
  meta = {stamps: meta.stamps, err: expired ? 'Signed out. Please sign in again.' : null}; base = {}; saveMeta(); saveBase(); paint();
}

/* ---------- one sync round: pull what changed, merge, push what's left ---------- */
function syncNow(){
  if (busy){ again = true; return busy; }
  busy = (async () => {
    await null;   // let `busy` be set before an early return reaches `finally` (else it would stay set forever)
    try {
      if (!config() || !meta.session) return;
      if (navigator.onLine === false){ meta.err = 'offline'; saveMeta(); return; }
      noteChanges();
      // pull (5 s overlap so a write that committed late is not missed; re-reading a row is harmless)
      const since = meta.cursor ? new Date(Date.parse(meta.cursor) - 5000).toISOString() : '1970-01-01T00:00:00Z';
      const rows = await call('/rest/v1/jarvis_data?select=ns,data,stamp,server_at&order=server_at.asc&server_at=gt.' + encodeURIComponent(since));
      let applied = false;
      (rows || []).forEach(row => {
        const ns = row.ns, remote = row.data, rt = S(remote);
        if (!meta.cursor || row.server_at > meta.cursor) meta.cursor = row.server_at;
        if (base[ns] === rt) return;                               // nothing new
        const cur = J.db[ns] === undefined ? undefined : local(ns);
        let next;
        if (cur === undefined || S(cur) === base[ns]) next = remote;
        else next = merge(base[ns] === undefined ? undefined : JSON.parse(base[ns]), cur, remote, (meta.stamps[ns] || 0) >= (+row.stamp || 0));
        base[ns] = rt;
        if (S(next) !== S(cur)){ setLocal(ns, next); applied = true; }
      });
      if (applied){
        applying = true; try { origSet.call(localStorage, KEY, S(J.db)); } catch(e){} applying = false;
        nsList().forEach(ns => { snap[ns] = S(local(ns)); });
        try { J.renderAll(true); } catch(e){}
        try { window.dispatchEvent(new CustomEvent('jarvis:synced')); } catch(e){}
      }
      saveBase(); saveMeta();
      // push
      const todo = dirty();
      if (todo.length){
        const sent = todo.map(ns => ({user_id: meta.session.uid, ns, data: local(ns), stamp: meta.stamps[ns] || now()}));
        await call('/rest/v1/jarvis_data?on_conflict=user_id,ns', {method: 'POST', headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}, body: sent});
        sent.forEach(r => { base[r.ns] = S(r.data); }); saveBase();
      }
      await dailyBackup();
      meta.lastOk = now(); meta.err = null; saveMeta();
    } catch(e){ meta.err = navigator.onLine === false ? 'offline' : String(e.message || e); saveMeta(); }
    finally { busy = null; paint(); if (again){ again = false; setTimeout(syncNow, 50); } }
  })();
  return busy;
}
/* one full copy a day in jarvis_backups (the database keeps the last 30 days), so even a mistaken "erase" can be undone */
async function dailyBackup(){
  const day = new Date().toISOString().slice(0, 10); if (meta.backupDay === day) return;
  const all = {}; nsList().forEach(ns => { all[ns] = local(ns); });
  await call('/rest/v1/jarvis_backups?on_conflict=user_id,day', {method: 'POST', headers: {Prefer: 'resolution=merge-duplicates,return=minimal'}, body: [{user_id: meta.session.uid, day, data: all}]});
  meta.backupDay = day;
}
const listBackups = () => call('/rest/v1/jarvis_backups?select=day&order=day.desc&limit=' + BACKUP_DAYS);
async function restoreBackup(day){
  const rows = await call('/rest/v1/jarvis_backups?select=data&day=eq.' + encodeURIComponent(day));
  const data = rows && rows[0] && rows[0].data; if (!isObj(data)) throw new Error('That backup is empty');
  const next = Object.assign({}, data); next.settings = Object.assign({}, J.db.settings, data.settings || {});
  LOCAL_ONLY_SETTINGS.forEach(k => { if (J.db.settings && k in J.db.settings) next.settings[k] = J.db.settings[k]; });
  const t = now(); Object.keys(next).forEach(ns => { meta.stamps[ns] = t; }); saveMeta();
  origSet.call(localStorage, KEY, S(next));                 // the next sync after reload sends it to every device
  try { sessionStorage.setItem('jarvis2-toast', 'Backup from ' + day + ' restored'); } catch(e){}
  location.reload();
}

/* ---------- notice every save (core save(), receipts' own write, Jarvis.save) ---------- */
Storage.prototype.setItem = function(k, v){
  origSet.call(this, k, v);
  if (k === KEY && !applying && this === window.localStorage){ clearTimeout(pushT); pushT = setTimeout(() => { if (noteChanges() || dirty().length) syncNow(); }, PUSH_DELAY); }
};

/* ---------- Settings: "Keep my data safe and synced" ---------- */
J.css(`.sy-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;vertical-align:1px;background:var(--faint)}
.sy-dot.ok{background:#34c759}.sy-dot.wait{background:#ff9f0a}.sy-dot.bad{background:#ff3b30}
.sy-days{display:flex;flex-direction:column;gap:8px;max-height:50vh;overflow:auto;margin-bottom:12px}
#syncBox .set-row.wrap .lbl{flex:1 1 calc(100% - 45px)}
.sy-small{color:var(--muted);font-size:var(--fs-sm);margin:0 0 12px}`);
const ago = t => { const m = Math.round((now() - t) / 60e3); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };
const esc = J.esc;
let box = null;
function mount(){
  const view = document.getElementById('v-settings'); if (!view || box) return;
  const heads = [...view.querySelectorAll('.section-h')], before = heads.find(h => /alerts/i.test(h.textContent));
  const h = document.createElement('div'); h.className = 'section-h'; h.innerHTML = '<h3>Sync &amp; online backup</h3>';
  box = document.createElement('div'); box.className = 'set-group'; box.id = 'syncBox';
  if (before){ view.insertBefore(h, before); view.insertBefore(box, before); } else { view.appendChild(h); view.appendChild(box); }
  const foot = view.querySelector('.jv-foot'); if (foot) foot.dataset.sync = '1';
  paint();
}
const ICON = '<div class="set-ic" style="background:#30b0c7"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6 3.8 3.8 0 0 1-.3 7.4z"/><path d="m9.5 13.5 2 2 3.5-3.8"/></svg></div>';
function paint(){
  if (!box) return;
  const foot = document.querySelector('#v-settings .jv-foot');
  if (!config()){
    box.innerHTML = `<div class="set-row wrap">${ICON}<div class="lbl"><b>Keep my data safe and synced</b><small>Cloud sync isn't switched on for this app yet. Your data stays on this device.</small></div><button class="btn ghost" id="syCfg">Server details</button></div>`;
  } else if (!meta.session){
    box.innerHTML = `<div class="set-row wrap">${ICON}<div class="lbl"><b>Keep my data safe and synced</b><small>${meta.err ? esc(meta.err) + ' ' : ''}Sign in with your email to share your data between the Action Button, the home-screen app and your other devices, with a daily online backup.</small></div><button class="btn" id="syIn">Turn on</button><button class="btn ghost" id="syCfg">Server details</button></div>`;
  } else {
    const off = meta.err === 'offline', bad = meta.err && !off, wait = busy || dirty().length;
    const state = bad ? `<span class="sy-dot bad"></span>Problem: ${esc(meta.err)}` : off ? '<span class="sy-dot wait"></span>Offline. Changes wait here and sync when you’re back online.' : busy ? '<span class="sy-dot wait"></span>Syncing…' : wait ? '<span class="sy-dot wait"></span>Waiting to sync' : `<span class="sy-dot ok"></span>Synced ${meta.lastOk ? ago(meta.lastOk) : ''}`;
    box.innerHTML = `<div class="set-row wrap">${ICON}<div class="lbl"><b>Synced as ${esc(meta.session.email || 'you')}</b><small>${state}</small></div><button class="btn ghost" id="syNow">Sync now</button><button class="btn ghost" id="syBk">Online backups</button><button class="btn ghost" id="syOut">Sign out</button></div>`;
  }
  if (foot) foot.innerHTML = foot.innerHTML.replace(/Your data (stays on this device|is synced and backed up online)\./, meta.session && config() ? 'Your data is synced and backed up online.' : 'Your data stays on this device.');
  const on = (id, fn) => { const el = box.querySelector('#' + id); if (el) el.onclick = fn; };
  on('syIn', signInSheet); on('syCfg', cfgSheet); on('syNow', () => { syncNow().then(() => J.toast(meta.err ? (meta.err === 'offline' ? 'Offline. It will sync later.' : 'Sync problem: ' + meta.err) : 'All synced')); paint(); });
  on('syOut', () => { J.modal(`<h4>Sign out of sync?</h4><p style="color:var(--muted);margin:0 0 12px">Your data stays on this device and in your online copy. This device just stops syncing.</p><div class="row"><button class="btn ghost" id="mCancel">Cancel</button><button class="btn danger" id="mSave">Sign out</button></div>`); document.getElementById('mCancel').onclick = J.closeModal; document.getElementById('mSave').onclick = () => { J.closeModal(); signOut(); J.toast('Signed out of sync'); }; });
  on('syBk', backupsSheet);
}
function signInSheet(){
  const email = (meta.session && meta.session.email) || '';
  J.modal(`<h4>Keep my data safe and synced</h4><p class="sy-small">Use the same email and password on every copy of the app (the Action Button one and the home-screen one). First time? This creates your account.</p>
    <input type="email" id="syEmail" autocomplete="email" inputmode="email" placeholder="you@example.com" value="${esc(email)}" aria-label="Email">
    <input type="password" id="syPw" autocomplete="current-password" placeholder="Password (at least 6 characters)" aria-label="Password">
    <div class="row"><button class="btn ghost" id="mCancel">Cancel</button><button class="btn" id="mSave">Turn on sync</button></div>`);
  document.getElementById('mCancel').onclick = J.closeModal;
  const go = async () => {
    const em = document.getElementById('syEmail').value.trim(), pw = document.getElementById('syPw').value;
    if (!/^\S+@\S+\.\S+$/.test(em)){ J.toast('Please enter your email'); return; }
    if (pw.length < 6){ J.toast('The password needs at least 6 characters'); return; }
    const b = document.getElementById('mSave'); b.disabled = true; b.textContent = 'Checking…';
    try { await signInPw(em, pw); J.closeModal(); J.toast(meta.err ? 'Signed in. Sync will finish when online.' : 'Sync is on. Your data is backed up.'); }
    catch(e){ b.disabled = false; b.textContent = 'Turn on sync'; J.toast(navigator.onLine === false ? 'You’re offline. Try again when connected.' : /wrong password|invalid/i.test(e.message) ? 'Wrong password for that email. Try again.' : 'Could not sign in: ' + e.message); }
  };
  document.getElementById('mSave').onclick = go;
  document.getElementById('syPw').onkeydown = e => { if (e.key === 'Enter') go(); };
}
function cfgSheet(){
  const c = ls.get(CFG, {}) || {};
  J.modal(`<h4>Server details</h4><p class="sy-small">Only needed if you run your own free Supabase project. Paste the Project URL and the public (anon) key. They're saved on this device only.</p>
    <input type="url" id="syUrl" placeholder="https://xxxx.supabase.co" value="${esc(c.url || '')}" aria-label="Project URL" autocapitalize="off" spellcheck="false">
    <input type="text" id="syKey" placeholder="Public (anon) key" value="${esc(c.anonKey || '')}" aria-label="Public key" autocapitalize="off" spellcheck="false">
    <div class="row"><button class="btn ghost" id="mCancel">Cancel</button><button class="btn" id="mSave">Save</button></div>`);
  document.getElementById('mCancel').onclick = J.closeModal;
  document.getElementById('mSave').onclick = () => {
    const url = document.getElementById('syUrl').value.trim(), anonKey = document.getElementById('syKey').value.trim();
    if (url && !/^https?:\/\/\S+$/.test(url)){ J.toast('That URL doesn’t look right'); return; }
    if (url && anonKey) ls.set(CFG, {url, anonKey}); else ls.del(CFG);
    J.closeModal(); paint(); J.toast(url ? 'Saved' : 'Cleared');
  };
}
async function backupsSheet(){
  J.modal(`<h4>Online backups</h4><p class="sy-small">Loading…</p>`);
  let days;
  try { days = (await listBackups()) || []; } catch(e){ J.modal(`<h4>Online backups</h4><p class="sy-small">Could not load them: ${esc(e.message)}</p><div class="row"><button class="btn" id="mCancel">Close</button></div>`); document.getElementById('mCancel').onclick = J.closeModal; return; }
  J.modal(`<h4>Online backups</h4><p class="sy-small">One full copy is saved each day you use the app (last ${BACKUP_DAYS} days). Restoring replaces the data on all your devices with that day's copy.</p>
    <div class="sy-days">${days.length ? days.map(d => `<button class="btn ghost" data-day="${esc(d.day)}">${esc(new Date(d.day + 'T12:00:00').toLocaleDateString(undefined, {weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'}))}</button>`).join('') : '<p class="sy-small">No backups yet. The first one is made at the next sync.</p>'}</div>
    <div class="row"><button class="btn" id="mCancel">Close</button></div>`);
  document.getElementById('mCancel').onclick = J.closeModal;
  document.querySelectorAll('#modalBox [data-day]').forEach(b => b.onclick = () => {
    const day = b.dataset.day;
    J.modal(`<h4>Restore ${esc(day)}?</h4><p style="color:var(--muted);margin:0 0 12px">Everything on all your devices goes back to how it was that day. Changes made since then are lost (today's copy stays in the list).</p><div class="row"><button class="btn ghost" id="mCancel">Cancel</button><button class="btn danger" id="mSave">Restore</button></div>`);
    document.getElementById('mCancel').onclick = J.closeModal;
    document.getElementById('mSave').onclick = () => restoreBackup(day).catch(e => J.toast('Could not restore: ' + e.message));
  });
}

/* ---------- start ---------- */
nsList().forEach(ns => { snap[ns] = S(local(ns)); if (meta.session && base[ns] !== snap[ns] && !meta.stamps[ns]) meta.stamps[ns] = now(); });
saveMeta();
const kick = () => { if (document.visibilityState !== 'hidden') syncNow(); };
document.addEventListener('visibilitychange', kick);
window.addEventListener('focus', kick);
window.addEventListener('online', kick);
window.addEventListener('pageshow', e => { if (e.persisted) kick(); });
setInterval(kick, PULL_EVERY);
setInterval(() => { if (box && meta.session) paint(); }, 60e3);   // keeps "Synced 3 min ago" fresh
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { mount(); setTimeout(kick, 300); }); else { mount(); setTimeout(kick, 300); }

/* for tests and other features */
J.sync = {now: syncNow, get state(){ return {signedIn: !!meta.session, email: meta.session && meta.session.email, lastOk: meta.lastOk, err: meta.err, dirty: dirty(), configured: !!config()}; }, merge, signOut: () => signOut()};
})();
