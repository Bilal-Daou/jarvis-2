/* Jarvis brain: understands more of what Bilal says, so Jarvis almost never answers "I can't do that".
   Loaded last. index.html's think() calls:
     Jarvis.brain.early(said, t)  before the feature intents: fixing entries by voice ("that was actually 40"),
                                  maths, unit and currency conversion, time abroad, days until, coin flips, spelling
     Jarvis.brain.late(said, t)   when nothing understood it: follow-ups ("what about tomorrow?"), rewordings mapped to
                                  commands the app knows, two requests in one breath, Wikipedia and dictionary answers,
                                  and, when a free Google AI key is saved (Food > AI photos), the Gemini AI
     Jarvis.brain.suggest(t)      the closest thing Jarvis can do, for the last-resort reply
   Free, keyless services only: open.er-api.com (exchange rates), en.wikipedia.org (summaries), api.dictionaryapi.dev
   (definitions), geocoding-api.open-meteo.com (time zone of a city). Nothing is sent anywhere else. */
(function(){
try {
const J = window.Jarvis; if (!J) return;
const S = () => J.settings;
const db = () => J.db;
const st = J.store('brain', {birthday:null});
const now = () => Date.now();
const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
const lc = s => String(s||'').toLowerCase();
const cap = s => { s = String(s||'').trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
const pickOne = (list, avoid) => { const opts = list.filter(x=>x!==avoid); return opts[Math.floor(Math.random()*opts.length)] || list[0]; };
const setKind = k => { try { J.setTurnKind && J.setTurnKind(k); } catch(e){} };
const NF = new Intl.NumberFormat('en-US', {maximumFractionDigits:2});
function num(n){
  if (!isFinite(n)) return String(n);
  const a = Math.abs(n);
  if (a !== 0 && a < 0.01) return String(+n.toPrecision(3));
  if (a >= 1e15) return n.toExponential(3).replace('e+', ' times 10 to the ');
  return a >= 100 ? new Intl.NumberFormat('en-US', {maximumFractionDigits: a >= 1e5 ? 0 : 2}).format(n) : NF.format(+n.toFixed(4));
}
const money = n => J.fmt(n);
/** spoken numbers the core leaves alone: "a hundred", "2 point 5", "5 thousand", "1.5 million", "5k" */
function moreNumbers(s){
  return String(s)
    .replace(/\b(?:a|one) (hundred|thousand|million|billion)\b/g, (m, w) => '1 ' + w)
    .replace(/\ba half\b/g, '0.5').replace(/\bhalf an?\b/g, '0.5')
    .replace(/(\d+) point (\d+)/g, '$1.$2')
    .replace(/(\d+(?:\.\d+)?) ?(hundred|thousand|million|billion|k)\b/g, (m, n, w) => String(+n * {hundred:100, thousand:1e3, million:1e6, billion:1e9, k:1e3}[w]))
    ;
}
// how a number may be said: "12", "12.5", "a", "an", "one"
const NUM = '(-?\\d+(?:\\.\\d+)?|an?|one|half an?|half)';
const toN = s => { s = lc(s||'').trim(); if (!s || /^(an?|one)$/.test(s)) return 1; if (/^half/.test(s)) return 0.5; return parseFloat(s); };

/* =========================================================
   1. Memory: the last few turns (for follow-ups and the AI) and the last thing added (for "change it")
   ========================================================= */
const mem = [];               // [{said, reply, at, domain}]
let lastEntity = null;        // {kind:'expense'|'reminder'|'note', id, at}
let lastRemoved = null;       // the entry removed last by voice: {kind, item, at, said, restore}
let lastDomain = null;        // {domain, at, said, place}
let pre = null;
function ids(list){ const s = new Set(); (list||[]).forEach(x=>x && s.add(x.id)); return s; }
let turnStart = 0;
function before(){ turnStart = now(); const d = db(); pre = {e:ids(d.expenses), r:ids(d.reminders), n:ids(d.notes)}; }
function noticeNew(){
  if (!pre) return; const d = db();
  const e = (d.expenses||[]).find(x=>!pre.e.has(x.id)); if (e){ lastEntity = {kind:'expense', id:e.id, at:now()}; }
  const r = (d.reminders||[]).filter(x=>!pre.r.has(x.id)).pop(); if (r){ lastEntity = {kind:'reminder', id:r.id, at:now()}; }
  const n = (d.notes||[]).find(x=>!pre.n.has(x.id)); if (n){ lastEntity = {kind:'note', id:n.id, at:now()}; }
}
function after(turn){
  noticeNew();
  // turns that did not touch the entry make "it"/"that" go stale
  if (lastEntity && lastEntity.at < turnStart) lastEntity.idle = (lastEntity.idle||0) + 1;
  if (!turn) return;
  const dom = turn.kind === 'fallback' || turn.kind === 'chat' ? null : (domainOf(lc(turn.said)) || turn.domain || null);
  mem.push({said:turn.said, reply:turn.reply, at:now(), domain:dom, kind:turn.kind, entity: !!(lastEntity && lastEntity.at >= turnStart)}); while (mem.length > 8) mem.shift();
  if (dom) lastDomain = {domain:dom, at:now(), said:lc(turn.said)};
}
/** which area a request is about (used for follow-ups like "what about tomorrow?") */
function domainOf(t){
  if (/\b(weather|forecast|temperature|rain|raining|umbrella|jacket|hot|cold|warm|sunny|snow|wind|humid)\b/.test(t)) return 'weather';
  if (/\b(spend|spent|spending|expenses?|budget|money|balance|paid|bought)\b/.test(t)) return 'spending';
  if (/\b(calendar|schedule|agenda|meetings?|events?|appointments?)\b/.test(t)) return 'calendar';
  if (/\b(calories|protein|carbs|fat|food|eat|ate|water|meals?)\b/.test(t)) return 'food';
  if (/\b(habits?|streaks?|goals?)\b/.test(t)) return 'habits';
  if (/\b(markets?|stocks?|s&p|nasdaq|dow|watchlist|shares?|crypto|bitcoin|gold|oil)\b/.test(t)) return 'markets';
  if (/\b(reminders?)\b/.test(t)) return 'reminders';
  if (/\b(brief|briefing|my day|today look|rundown)\b/.test(t)) return 'brief';
  return null;
}
const fresh = (x, ms) => x && now() - x.at < ms;

/* =========================================================
   2. Fixing entries by voice: the last expense, reminder or note
   ========================================================= */
const EXP_N = '(?:expenses?|payments?|purchases?|transactions?|spending|entry|entries|charges?|items?|ones?)';
const REM_N = '(?:reminders?|alarms?|timers?)';
const NOTE_N = '(?:notes?)';
function catOf(x){
  x = lc(x).replace(/^(?:the|my|a)\s+/, '').replace(/\s+(?:category|section|bucket|group|list|instead|please)$/g, '').trim();
  if (!x) return null;
  const C = J.CATS || {}; const keys = Object.keys(C);
  const exact = keys.find(k=>lc(k) === x || lc(k).replace(/ & /g,' and ') === x); if (exact) return exact;
  const SYN = [
    [/^(food|food and drinks?|food & drinks?|eating out|restaurants?|dining( out)?|takeaway|takeout|coffee|drinks?|lunch|dinner|breakfast|snacks?)$/, 'Food & drink'],
    [/^(groceries|grocery|supermarket|grocery shopping)$/, 'Groceries'],
    [/^(transport|transportation|travel|taxi|taxis|uber|car|gas|fuel|petrol|commute|commuting|getting around)$/, 'Transport'],
    [/^(bills?|utilities|utility|rent|subscriptions?|housing|home)$/, 'Bills'],
    [/^(shopping|clothes|clothing|stuff)$/, 'Shopping'],
    [/^(health|medical|pharmacy|doctor|medicine|gym|fitness|healthcare)$/, 'Health'],
    [/^(fun|entertainment|leisure|going out|nightlife|hobbies)$/, 'Fun'],
    [/^(other|others|misc|miscellaneous|general|uncategori[sz]ed)$/, 'Other']
  ];
  for (const [re, c] of SYN) if (re.test(x)){ const k = keys.find(k=>k===c) || keys.find(k=>lc(k).startsWith(lc(c).split(' ')[0])); if (k) return k; }
  const part = keys.find(k=>lc(k).split(/ & | /).some(w=>w.length > 3 && (x === w || x === w.replace(/s$/,'') || x + 's' === w))); if (part) return part;
  return null;
}
function lastExpense(type){
  const list = (db().expenses||[]).filter(e=>!type || e.type===type);
  if (!type && !(lastEntity && lastEntity.kind==='expense' && fresh(lastEntity, 30*MIN))) return lastExpense('expense') || list.slice().sort((a,b)=>b.at-a.at)[0] || null;
  if (lastEntity && lastEntity.kind==='expense' && fresh(lastEntity, 30*MIN)){ const e = list.find(x=>x.id===lastEntity.id); if (e) return e; }
  return list.slice().sort((a,b)=>b.at-a.at)[0] || null;
}
function findExpense(word){
  const w = lc(word).replace(/^(?:the|my|a|an)\s+/, '').trim(); if (!w) return null;
  const list = (db().expenses||[]).slice().sort((a,b)=>b.at-a.at);
  return list.find(e=>lc(e.desc).includes(w)) || list.find(e=>lc(e.desc).includes(w.replace(/s$/,''))) || list.find(e=>lc(e.cat)===w) || null;
}
function lastReminder(about){
  const list = (db().reminders||[]).filter(r=>!r.done);
  if (about){
    const w = lc(about).replace(/^(?:the|my|to|about|for)\s+/, '').trim();
    const hit = list.filter(r=>lc(r.text).includes(w) || w.split(' ').filter(x=>x.length>2).every(x=>lc(r.text).includes(x))).sort((a,b)=>a.at-b.at);
    return hit[0] || null;
  }
  if (lastEntity && lastEntity.kind==='reminder' && fresh(lastEntity, 30*MIN)){ const r = list.find(x=>x.id===lastEntity.id); if (r) return r; }
  return list.slice().sort((a,b)=>(b.created||0)-(a.created||0))[0] || null;
}
function lastNote(){
  const list = db().notes||[];
  if (lastEntity && lastEntity.kind==='note' && fresh(lastEntity, 30*MIN)){ const n = list.find(x=>x.id===lastEntity.id); if (n) return n; }
  return list.slice().sort((a,b)=>b.at-a.at)[0] || null;
}
const snapshot = o => JSON.parse(JSON.stringify(o));
function undoable(label, kind, item, restore){
  try { J.toast(label, restore); } catch(e){}
}
function commitExpense(e, old, said){
  J.save(); try { J.renderAll(); } catch(_){}
  try { window.dispatchEvent(new CustomEvent('jarvis:expense-updated', {detail:{id:e.id, expense:e, before:old}})); } catch(_){}
  lastEntity = {kind:'expense', id:e.id, at:now()};
  undoable(said, 'expense', e, ()=>{ Object.assign(e, old); J.save(); J.renderAll(); });
  try { J.go('budget'); } catch(_){}
}
function amountIn(s){
  const m = moreNumbers(s).match(/\$?\s?(\d+(?:\.\d{1,2})?)\s*(?:dollars?|bucks|usd|euros?|pounds?|lira|\$|k)?(?:\s*(?:and\s+)?(\d{1,2})\s*cents?)?/);
  return m ? parseFloat(m[1]) + (m[2] ? parseInt(m[2])/100 : 0) : null;
}
const TIMEWORD = /\b(\d{1,2}(:\d{2})? ?(am|pm|a\.m\.|p\.m\.)|\d{1,2}:\d{2}|noon|midnight|morning|afternoon|evening|tonight|tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|in \d+ (minutes?|hours?|days?)|o'?clock|half past|quarter (past|to))\b/;
function hasClock(s){ return /\b\d{1,2}(:\d{2})? ?(am|pm|a\.m\.|p\.m\.)|\b\d{1,2}:\d{2}\b|\bat \d{1,2}\b|\b(noon|midnight|morning|afternoon|evening|tonight|o'?clock)\b|\bin \d+ (minutes?|hours?)\b/.test(s); }
/** a new time for a reminder; keeps its day when only a time is said, and its time when only a day is said */
function newTime(r, phrase){
  const p = J.parseTime(J.wordsToNumbers(phrase));
  const old = new Date(r.at);
  let rel = phrase.match(/\b(?:by |for )?(\d+(?:\.\d+)?|an?|half an?) (minutes?|mins?|hours?|hrs?|days?)\s*(later|earlier|back|forward|sooner)?\b/);
  if (/\b(later|earlier|back|forward|sooner)\b/.test(phrase) && rel && !/^in /.test(phrase.trim())){
    const n = toN(rel[1]) * (/^m/.test(rel[2]) ? MIN : /^h/.test(rel[2]) ? HOUR : DAY);
    const sign = /\b(earlier|forward|sooner)\b/.test(phrase) ? -1 : 1;
    return new Date(r.at + sign*n);
  }
  if (!p.date) return null;
  const d = p.date; const dayWord = /\b(today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|in \d+ days?)\b/.test(phrase);
  if (!hasClock(phrase)){ d.setHours(old.getHours(), old.getMinutes(), 0, 0); if (d.getTime() < now()) d.setDate(d.getDate()+1); return d; }
  if (!dayWord && !/\bin \d+ (minutes?|hours?)\b|\bin (half an hour|an hour)\b/.test(phrase)){
    const same = new Date(old); same.setHours(d.getHours(), d.getMinutes(), 0, 0);
    if (same.getTime() > now()) return same;
  }
  return d;
}
function commitReminder(r, old, label){
  r.fired = false; J.save(); try { J.renderAll(); } catch(_){}
  lastEntity = {kind:'reminder', id:r.id, at:now()};
  try { window.dispatchEvent(new CustomEvent('jarvis:reminder-updated', {detail:r})); } catch(_){}
  undoable(label, 'reminder', r, ()=>{ Object.assign(r, old); J.save(); J.renderAll(); });
  try { J.go('reminders'); } catch(_){}
}
const lower1 = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
/** the words as they were said (keeps "Thursday", "Rami"), found again in the original text */
function orig(said, val){ const s = String(said||'').replace(/[.!?]+$/,''); const v = String(val||''); const i = lc(s).lastIndexOf(lc(v)); return v && i >= 0 ? s.substr(i, v.length) : v; }
let SAID = '';
let depthEdit = false;
function edits(t, said){
  let m; SAID = said;
  const T = t.replace(/^(?:no|nope|oops|sorry|wait|actually|hmm|oh)\b[\s,]*(?:(?:no|wait|sorry|actually)\b[\s,]*)*/, '').replace(/\s+(?:instead|please|thanks)$/,'').trim();
  const recent = fresh(lastEntity, 5*MIN) && (lastEntity.idle||0) <= 2 ? lastEntity : null;
  const IT = '(?:it|that|this|that one|this one)';
  const kindWord = /\b(reminders?|alarms?|timers?)\b/.test(T) ? 'reminder' : new RegExp('\\b'+NOTE_N+'\\b').test(T) ? 'note' : new RegExp('\\b(?:'+EXP_N+'|income|salary)\\b').test(T) ? 'expense' : null;
  const target = kindWord || (recent && recent.kind) || null;
  /* ---------- just removed by voice: "undo that" brings it back; "move it", "make it 30" must not hit another entry ---------- */
  const rm = lastRemoved && now() - lastRemoved.at < 10*MIN && !(lastEntity && lastEntity.at > lastRemoved.at) ? lastRemoved : null;
  if (rm && !depthEdit){
    if (/^(?:undo|undo (?:that|it|this|the delete|the last one)|scratch that|cancel that|reverse that|take (?:that|it) back|bring (?:it|that|this) back|put (?:it|that|this) back|restore (?:it|that|this)|undelete(?: it| that)?|don't delete (?:it|that)|i didn't mean (?:that|to(?: delete (?:it|that))?)|keep (?:it|that))$/.test(T)){
      const what = rm.said; return rm.restore() ? `Okay, I brought back ${what}.` : 'That one is already back.';
    }
    if (/^(?:(?:make|change|put|set|move|push|shift|call|name|label|rename|file|switch|update|edit|fix|correct|categori[sz]e|recategori[sz]e|snooze|delay|postpone|reschedule|mark|pin)\s+)(?:it|that|this)\b|^(?:it|that|this)\s+(?:was|is|should|cost|came)\b/.test(T))
      return `You just removed ${rm.said}. Say undo to bring it back, then change it.`;
  }

  // "it", "that", "this" only mean something right after an entry was added or changed
  if (!recent && !depthEdit){
    // an edit that names no entry, long after the last one: ask which, rather than changing the wrong thing
    const amountish = /^(?:(?:make|change|set|put)\s+(?:it|that|this)\s+(?:to\s+|at\s+)?|(?:it|that|this)\s+(?:was|is|should be|should have been|cost|came to)\s+(?:actually\s+|really\s+|only\s+|just\s+)?|(?:change|set|make|fix|correct|update)\s+the\s+(?:amount|price|total|cost)\s+(?:to|as)\s+)\$?\d+(?:\.\d{1,2})?(?:\s*(?:dollars?|bucks|usd))?(?:\s+not\s+\$?\d+(?:\.\d+)?)?$/.test(T);
    const renameish = /^(?:rename|call|name|relabel)\s+(?:it|that|this)\s+(?:to\s+|as\s+)?[a-z]/.test(T);
    const catish = (m = T.match(/^(?:put|move|file|switch|change)\s+(?:it|that|this)\s+(?:to|in|into|under|as)\s+(?:the\s+)?(.+?)(?: category)?$/)) && catOf(m[1]) && !TIMEWORD.test(T);
    if (amountish || renameish || catish){
      let cand = lastEntity && now() - lastEntity.at < 3*HOUR ? lastEntity : null;
      if (cand && cand.kind !== 'expense' && !renameish) cand = null;
      if (!cand){ const e = lastExpense('expense'); if (e) cand = {kind:'expense', id:e.id}; }
      const d = db();
      const ent = cand && (cand.kind === 'expense' ? (d.expenses||[]) : cand.kind === 'reminder' ? (d.reminders||[]) : (d.notes||[])).find(x=>x.id === cand.id);
      if (ent){
        const what = cand.kind === 'expense' ? `${ent.desc}, ${money(ent.amount)}` : cand.kind === 'reminder' ? `your reminder to ${lower1(ent.text||'')}` : 'your last note';
        const kind = cand.kind, id = cand.id, t0 = t, s0 = said;
        pending = {at:now(), no:"Okay, I'll leave it.", fn:()=>{ lastEntity = {kind, id, at:now()}; depthEdit = true; try { return edits(t0, s0); } finally { depthEdit = false; } }};
        setKind('chat');
        return `Do you mean ${what}? Say yes and I'll change it.`;
      }
    }
  }
  if (!recent && /^(?:(?:make|change|put|set|move|push|shift|call|name|label|rename|delete|remove|cancel|pin|unpin|scratch|undo|snooze|delay|postpone|reschedule|mark|file|categori[sz]e|recategori[sz]e)\s+)?(?:it|that|this)\b/.test(T)) return null;

  /* ---------- delete ---------- */
  if ((m = T.match(new RegExp('^(?:delete|remove|erase|cancel|get rid of|scratch|undo|drop|bin|trash)\\s+(?:'+IT+'|the last one|that last one)(?: (?:'+EXP_N+'|'+REM_N+'|'+NOTE_N+'))?$')))
    || (m = T.match(/^(?:scratch that|undo that|forget that one|take (?:that|it) (?:back|off|out))$/))){
    if (!recent) return null;
    return deleteEntity(recent.kind);
  }
  if ((m = T.match(new RegExp('^(?:delete|remove|erase|get rid of|take off|cancel)\\s+(?:the|my)\\s+(.+?)\\s+(expense|payment|purchase|transaction|entry|income)$'))) && !/^(?:last|latest|newest|most recent|previous|recent)$/.test(m[1])){
    const e = findExpense(m[1]); if (!e) return `I couldn't find an expense for ${m[1]}.`;
    return deleteExpense(e);
  }
  if ((m = T.match(/^(?:delete|remove|cancel|get rid of)\s+(?:the|my)\s+(?:reminder|alarm)\s+(?:about|for|to)\s+(.+)$/)) || (m = T.match(/^(?:delete|remove|cancel|get rid of)\s+(?:the|my)\s+(.+?)\s+reminder$/))){
    if (!/^(last|latest|newest|most recent|next|previous|recent)$/.test(m[1])){
      const r = lastReminder(m[1]); if (!r) return `I couldn't find a reminder about ${m[1]}.`;
      return deleteReminder(r);
    }
  }
  if ((m = T.match(/^(?:delete|remove|get rid of|erase|cancel|scratch|undo)\s+(?:the|my)\s+(?:latest|newest|most recent|previous|last|(next))\s+(reminder|note)$/)) && !(m[1] && m[2] === 'note')){
    if (m[1]){ const nx = (db().reminders||[]).filter(r=>!r.done && r.at >= now() - MIN).sort((a,b)=>a.at-b.at)[0]; return nx ? deleteReminder(nx) : 'You have no upcoming reminders.'; }
    if (m[2] === 'note'){ const n = lastNote(); return n ? deleteNote(n) : 'No notes to delete.'; }
    const r = lastReminder(); return r ? deleteReminder(r) : 'No reminders to remove.';
  }
  if ((m = T.match(/^(?:delete|remove|get rid of|erase|cancel|scratch|undo)\s+(?:the|my)\s+(?:latest|newest|most recent|previous|last)\s+(expense|payment|purchase|entry)$/))){ const e = lastExpense('expense'); return e ? deleteExpense(e) : "There's no expense to remove."; }

  /* ---------- expenses: amount ---------- */
  const expAmount = () => {
    const pats = [
      new RegExp('^(?:change|update|edit|correct|fix|set|make|adjust|switch)\\s+(?:the |my )?(?:last |latest |previous |most recent )?(?:(.+?) )?(?:'+EXP_N+'|income|salary)(?: amount| price| total| cost)?\\s+(?:to|into|as|for)\\s+(.+)$'),
      new RegExp('^(?:the |my )?(?:last |latest |previous )(?:'+EXP_N+'|income|payment)\\s+(?:was|is|should be|should have been)\\s+(?:actually |really |only |just )?(.+)$'),
      new RegExp('^(?:'+IT+')\\s+(?:was|is|should be|should have been|cost|came to|was actually|was really|was only|was just)\\s+(?:actually |really |only |just |more like )?(.+?)(?:\\s+not\\s+.+)?$'),
      new RegExp('^(?:make|change|put|set)\\s+(?:'+IT+')\\s+(?:to |into |as |at )?(.+)$'),
      /^(?:change|update|set|make|fix|correct|edit)\s+(?:the |its |that |the last )?(?:amount|price|total|cost|value|number)(?: of (?:it|that|the last (?:expense|payment|purchase)))?\s+(?:to|as)\s+(.+)$/,
      /^(?:it was|that was|make it|it's|its|that's|thats|i meant|i said)?\s*(\$?\d+(?:\.\d{1,2})?(?:\s*(?:dollars?|bucks|usd|euros?|pounds?|lira))?)(?:\s+not\s+\$?\d+(?:\.\d+)?(?:\s*(?:dollars?|bucks))?)?$/
    ];
    for (let i = 0; i < pats.length; i++){
      const mm = T.match(pats[i]); if (!mm) continue;
      const val = mm[mm.length-1];
      if (i === 5 && !(recent && recent.kind === 'expense' && fresh(recent, 3*MIN))) continue;
      if (i === 4 && !(target === 'expense' || /\b(?:expense|payment|purchase)\b/.test(T))) continue;
      if (i >= 2 && !(target === 'expense')) continue;
      if (TIMEWORD.test(val) && !/\b(dollars?|bucks|\$)\b/.test(val)) continue;
      const amt = /^\$?\s?\d/.test(val.trim()) || /^(?:about |around )?\$?\d/.test(val.trim()) ? amountIn(val) : null;
      if (amt == null) continue;
      if (/\d\s*(?:%|percent)/.test(val)) continue;
      const hint = i === 0 ? mm[1] : null;
      let e = hint && !/^(last|latest|previous|most recent|the|my)$/.test(hint) ? findExpense(hint) : null;
      if (!e) e = lastExpense(/\b(income|salary)\b/.test(T) ? 'income' : new RegExp('\\b'+EXP_N+'\\b').test(T) && !(recent && recent.kind === 'expense' && !/\blast\b/.test(T)) ? 'expense' : null);
      if (!e) return "You don't have any expenses yet.";
      const old = snapshot(e); e.amount = amt;
      commitExpense(e, old, `${e.desc}: now ${money(amt)}`);
      return `Done. ${e.desc} is now ${money(amt)}${e.type==='income' ? ' income' : ''}.`;
    }
    return null;
  };
  /* ---------- expenses: category ---------- */
  const expCat = () => {
    const pats = [
      new RegExp('^(?:move|put|file|change|switch|recategori[sz]e|categori[sz]e|class|mark|tag|log)\\s+(?:'+IT+'|the |my )?(?:last |latest |previous )?(?:(.+?) )?(?:'+EXP_N+')?\\s*(?:to|in|into|under|as|over to)\\s+(?:the\\s+)?(.+?)(?: category)?$'),
      new RegExp('^(?:change|set|switch|make)\\s+(?:the |its |the last )?(?:category|type)(?: of (?:'+IT+'|the last (?:'+EXP_N+')|my last (?:'+EXP_N+')))?\\s+(?:to|as)\\s+(.+)$'),
      new RegExp('^(?:'+IT+')\\s+(?:should be|should go|goes|belongs|was|is)\\s+(?:(?:in|under|into|for|a|an)\\s+)?(.+?)(?: category)?$'),
      new RegExp('^(?:'+IT+')\\s+(?:should be|was|is)\\s+(?:in|under) (?:the )?(.+?)(?: category)?$')
    ];
    for (let i = 0; i < pats.length; i++){
      const mm = T.match(pats[i]); if (!mm) continue;
      let val = mm[mm.length-1];
      if (/^(income|an income|salary|money in|earnings)$/.test(val)) return setType('income');
      if (/^(an? )?(expense|spending|money out)$/.test(val)) return setType('expense');
      const c = catOf(val); if (!c) continue;
      if (i >= 2 && target !== 'expense') continue;
      if (i === 0 && !/\b(it|that|this)\b/.test(T.split(/\s(?:to|in|into|under|as)\s/)[0]) && !new RegExp(EXP_N).test(T) && target !== 'expense') continue;
      const hint = i === 0 ? mm[1] : null;
      let e = hint && !/^(last|latest|previous|it|that|this|the|my)$/.test(hint) ? findExpense(hint) : null;
      if (!e) e = lastExpense('expense'); if (!e) return "You don't have any expenses yet.";
      const old = snapshot(e); e.cat = c; if (e.type === 'income') e.type = 'expense';
      commitExpense(e, old, `Moved to ${c}`);
      return `Done. ${e.desc}, ${money(e.amount)}, is now under ${c}.`;
    }
    return null;
  };
  const setType = type => {
    const e = lastExpense(); if (!e) return "You don't have any entries yet.";
    if (e.type === type) return `That's already logged as ${type === 'income' ? 'income' : 'an expense'}.`;
    const old = snapshot(e); e.type = type; e.cat = type === 'income' ? 'Income' : (J.categorize ? J.categorize(e.desc||'') : 'Other');
    commitExpense(e, old, type === 'income' ? 'Changed to income' : 'Changed to an expense');
    return type === 'income' ? `Done. ${e.desc}, ${money(e.amount)}, is now income.` : `Done. ${e.desc}, ${money(e.amount)}, is now an expense under ${e.cat}.`;
  };
  /* ---------- expenses: description ---------- */
  const expDesc = () => {
    const pats = [
      new RegExp('^(?:rename|relabel)\\s+(?:'+IT+'|the |my )?(?:last |latest |previous )?(?:'+EXP_N+'|income)?\\s*(?:to|as)\\s+(.+)$'),
      new RegExp('^(?:change|update|edit|set)\\s+(?:the )?(?:name|description|label|title)(?: of (?:'+IT+'|the last (?:'+EXP_N+'|income)|my last (?:'+EXP_N+'|income)))?\\s+(?:to|as)\\s+(.+)$'),
      new RegExp('^(?:call|name|label)\\s+(?:'+IT+')\\s+(.+)$'),
      new RegExp('^(?:'+IT+')\\s+was\\s+for\\s+(?!\\d)(.+)$'),
      new RegExp('^(?:change|update|edit)\\s+(?:the |my )?(?:last |latest )(?:'+EXP_N+')\\s+(?:to|into)\\s+(?!\\$?\\d)(.+)$')
    ];
    for (let i = 0; i < pats.length; i++){
      const mm = T.match(pats[i]); if (!mm) continue;
      if (i >= 2 && target !== 'expense') continue;
      if (i === 0 && !new RegExp('\\b(?:'+EXP_N+'|income)\\b').test(T) && target !== 'expense') continue;
      const val = mm[1].replace(/^(?:the|a|an|my)\s+/, '').trim(); if (!val) continue;
      if (/^\$?\d/.test(val)) continue;
      const e = lastExpense(); if (!e) return "You don't have any expenses yet.";
      const old = snapshot(e); e.desc = cap(orig(SAID, val));
      if (e.type === 'expense' && (i === 3 || old.cat === 'Other' || (J.categorize && J.categorize(old.desc||'') === old.cat))){ const c = J.categorize ? J.categorize(val) : 'Other'; if (c !== 'Other') e.cat = c; }
      commitExpense(e, old, `Renamed to ${e.desc}`);
      return `Done. It's now ${e.desc}, ${money(e.amount)}${e.type==='expense' ? ', under ' + e.cat : ''}.`;
    }
    return null;
  };
  /* ---------- expenses: date ---------- */
  const expDate = () => {
    const mm = T.match(new RegExp('^(?:'+IT+'|the last (?:'+EXP_N+')|my last (?:'+EXP_N+'))\\s+(?:was|happened|should be)\\s+(?:on |from )?(yesterday|the day before yesterday|today|(?:last )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))$'))
      || T.match(new RegExp('^(?:move|change|set|put)\\s+(?:'+IT+'|the last (?:'+EXP_N+')|my last (?:'+EXP_N+'))\\s+(?:to|on)\\s+(yesterday|the day before yesterday|today|(?:last )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))$'));
    if (!mm) return null;
    if (!new RegExp(EXP_N).test(T) && target !== 'expense') return null;
    const e = lastExpense(); if (!e) return "You don't have any expenses yet.";
    const d = new Date(e.at), today = new Date(); const w = mm[1];
    let back = 0;
    if (w === 'yesterday') back = 1; else if (w === 'the day before yesterday') back = 2; else if (w !== 'today'){ const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']; const wd = days.indexOf(w.replace(/^last /,'')); back = (today.getDay() - wd + 7) % 7 || 7; }
    const nd = new Date(today); nd.setDate(today.getDate() - back); nd.setHours(d.getHours(), d.getMinutes(), d.getSeconds(), 0);
    if (nd.getTime() > now()) nd.setTime(now());
    const old = snapshot(e); e.at = nd.getTime();
    commitExpense(e, old, 'Date changed');
    return `Done. ${e.desc}, ${money(e.amount)}, is now dated ${w === 'today' ? 'today' : J.whenText(e.at).split(',')[0].replace(/^Yesterday$/,'yesterday')}.`;
  };

  /* ---------- reminders ---------- */
  const remEdit = () => {
    let mm, r = null, phrase = null, rename = null;
    // "move my reminder (about rent) to 6 pm", "push the dentist reminder to friday", "reschedule it for tomorrow"
    if ((mm = T.match(/^(?:move|push|change|shift|reschedule|postpone|delay|put|bump|update|edit)\s+(?:the |my )?(?:last |latest )?(?:(.+?) )?(?:reminder|alarm|timer)(?: (?:about|for) (.+?))?(?: time)?\s+(?:to|for|until|till|at|by|back|forward|on)\s+(.+)$/)) && !/^(?:an?|new|another|one)$/.test(mm[1]||'')){
      const topic = mm[2] || (mm[1] && !/^(last|latest|next|the|my)$/.test(mm[1]) ? mm[1] : null);
      r = lastReminder(topic); phrase = mm[3];
      if (/^(?:change|update|edit)$/.test(T.split(' ')[0]) && !TIMEWORD.test(phrase) && !/\b(later|earlier|\d)\b/.test(phrase)){ rename = phrase; phrase = null; }
      else if (/\b(back|forward)\b/.test(T) && !/\b(later|earlier)\b/.test(phrase)) phrase += /\bback\b/.test(T) ? ' later' : ' earlier';
    }
    else if ((mm = T.match(/^(?:move|push|shift|reschedule|postpone|delay|bump)\s+(?:it|that|this)\s+(?:to|for|until|till|at|by|on|back|forward)?\s*(.+)$/)) && target === 'reminder'){ r = lastReminder(); phrase = mm[1]; if (/\bback\b/.test(T) && !/\b(later|earlier)\b/.test(phrase)) phrase += ' later'; }
    else if ((mm = T.match(/^(?:make|change|set)\s+(?:it|that|this)\s+(?:to |for |at )?(.+)$/)) && target === 'reminder' && TIMEWORD.test(mm[1])){ r = lastReminder(); phrase = mm[1]; }
    else if ((mm = T.match(/^(?:it|that|this)\s+(?:should be|is|was supposed to be|needs to be)\s+(?:at |for |on )?(.+)$/)) && target === 'reminder' && TIMEWORD.test(mm[1])){ r = lastReminder(); phrase = mm[1]; }
    else if ((mm = T.match(/^(?:snooze|delay|push)\s+(?:it|that|my reminder|the reminder)?\s*(?:for|by)?\s*(\d+|an?|half an?)\s+(minutes?|mins?|hours?)$/)) && (target === 'reminder' || /reminder/.test(T))){ r = lastReminder(); phrase = mm[1] + ' ' + mm[2] + ' later'; }
    // rename
    else if ((mm = T.match(/^(?:rename|change|edit|update)\s+(?:the |my )?(?:last |latest )?(?:reminder|alarm)(?: text| name| wording)?\s+(?:to|into|as)\s+(.+)$/)) && !TIMEWORD.test(mm[1])){ r = lastReminder(); rename = mm[1]; }
    else if ((mm = T.match(/^(?:change|rename)\s+(?:it|that)\s+to\s+(.+)$/)) && target === 'reminder' && !TIMEWORD.test(mm[1])){ r = lastReminder(); rename = mm[1]; }
    // repeat
    else if ((mm = T.match(/^(?:make|set|have)\s+(?:it|that|the reminder|my reminder|my last reminder)\s+(?:repeat\s+)?(daily|every day|each day|weekly|every week|monthly|every month|repeat (?:daily|weekly|monthly)|one time|just once|once|not repeat|stop repeating)$/)) && (target === 'reminder' || /reminder/.test(T))){
      r = lastReminder(); if (!r) return "You don't have any reminders.";
      const w = mm[1]; const rep = /day|daily/.test(w) ? 'daily' : /week/.test(w) ? 'weekly' : /month/.test(w) ? 'monthly' : 'none';
      const old = snapshot(r); r.repeat = rep; commitReminder(r, old, rep === 'none' ? 'Set to one time' : 'Repeats ' + rep);
      return rep === 'none' ? `Done. ${r.text} will only remind you once.` : `Done. ${r.text} now repeats ${rep === 'daily' ? 'every day' : rep === 'weekly' ? 'every week' : 'every month'}.`;
    }
    else if ((mm = T.match(/^stop repeating(?: (?:it|that|the reminder|my reminder))?$/)) && (target === 'reminder' || /reminder/.test(T))){ r = lastReminder(); if (!r) return "You don't have any reminders."; const old = snapshot(r); r.repeat = 'none'; commitReminder(r, old, 'Set to one time'); return `Done. ${r.text} will only remind you once.`; }
    else return null;
    if (!r) return mm && /about|for/.test(T) ? "I couldn't find that reminder. Say: what are my reminders." : "You don't have any reminders to change.";
    if (rename){ const old = snapshot(r); r.text = cap(orig(SAID, rename.replace(/^(?:to|that|say)\s+/, ''))); commitReminder(r, old, 'Reminder renamed'); return `Done. The reminder now says: ${r.text}.`; }
    const d = newTime(r, ' ' + phrase.replace(/^(?:to|for|until|till|at)\s+/, '') + ' ');
    if (!d) return `What time should I move it to? For example: move my reminder to 6 pm.`;
    if (d.getTime() < now() - MIN) return 'That time has already passed. Try a time later today or another day.';
    const old = snapshot(r); r.at = d.getTime(); r.done = false;
    commitReminder(r, old, 'Reminder moved');
    return `Done. I'll remind you to ${J.youify ? J.youify(lower1(r.text)) : lower1(r.text)} ${J.whenSpoken ? J.whenSpoken(r.at) : J.whenText(r.at)}.`;
  };

  /* ---------- notes ---------- */
  const noteEdit = () => {
    let mm;
    if ((mm = T.match(/^(?:change|edit|update|replace|rewrite|fix)\s+(?:my |the |that |this )?(?:last |latest )?note\s+(?:to|to say|so it says|with|into)\s+(.+)$/))){
      const n = lastNote(); if (!n) return "You don't have any notes yet.";
      const old = snapshot(n); n.text = cap(orig(SAID, mm[1].replace(/^(?:say|says|read|that)\s+/, ''))); J.save(); J.renderAll(); lastEntity = {kind:'note', id:n.id, at:now()};
      undoable('Note changed', 'note', n, ()=>{ Object.assign(n, old); J.save(); J.renderAll(); }); try { J.go('notes'); } catch(_){}
      return `Done. Your note now says: ${n.text}.`;
    }
    if ((mm = T.match(/^(?:add|append|put)\s+(.+?)\s+(?:to|on|onto|at the end of)\s+(?:my |the )?(?:last |latest )?note$/)) || (mm = T.match(/^(?:also add|add)\s+(.+?)\s+to (?:it|that)$/)) && target === 'note'){
      const n = lastNote(); if (!n) return "You don't have any notes yet.";
      const old = snapshot(n); const add = orig(SAID, mm[1].replace(/^(?:that|this)\s+/, ''));
      n.text = n.text.replace(/[.\s]+$/,'') + (/[,;:]$/.test(n.text) ? ' ' : ', ') + add; J.save(); J.renderAll(); lastEntity = {kind:'note', id:n.id, at:now()};
      undoable('Added to note', 'note', n, ()=>{ Object.assign(n, old); J.save(); J.renderAll(); }); try { J.go('notes'); } catch(_){}
      return `Added. Your note now says: ${n.text}.`;
    }
    if ((mm = T.match(/^(pin|unpin)\s+(?:it|that|my last note|the last note|my latest note|that note)$/)) && (target === 'note' || /note/.test(T))){
      const n = lastNote(); if (!n) return "You don't have any notes yet.";
      n.pinned = mm[1] === 'pin'; J.save(); J.renderAll(); try { J.go('notes'); } catch(_){}
      return n.pinned ? 'Pinned it to the top of your notes.' : 'Unpinned.';
    }
    if ((mm = T.match(/^(?:delete|remove|erase)\s+(?:that|this|the last|my last|my latest)\s+note$/))){ const n = lastNote(); return n ? deleteNote(n) : "You don't have any notes."; }
    return null;
  };

  if (target === 'reminder' || /\b(reminders?|alarms?|timers?)\b/.test(T)){ const r = remEdit(); if (r) return r; }
  if (target === 'note' || /\bnote\b/.test(T)){ const r = noteEdit(); if (r) return r; }
  if (target === 'expense' || new RegExp('\\b(?:'+EXP_N+'|income)\\b').test(T)){
    const r = expAmount() || expDate() || expCat() || expDesc(); if (r) return r;
  }
  return null;
}
function deleteEntity(kind){
  if (kind === 'expense'){ const e = lastExpense(); return e ? deleteExpense(e) : 'Nothing to remove.'; }
  if (kind === 'reminder'){ const r = lastReminder(); return r ? deleteReminder(r) : 'Nothing to remove.'; }
  if (kind === 'note'){ const n = lastNote(); return n ? deleteNote(n) : 'Nothing to remove.'; }
  return null;
}
/* the entry removed last by voice, so "undo that" / "bring it back" can restore it (and "move it to X" does not hit another entry) */
function removedNow(kind, key, item, i, said, after){
  const restore = ()=>{ const d = db(), list = d[key] || (d[key] = []); if (list.includes(item)) return false; list.splice(Math.min(i, list.length), 0, item); J.save(); J.renderAll(); try { after && after(); } catch(_){} lastEntity = {kind, id:item.id, at:now()}; lastRemoved = null; return true; };
  lastRemoved = {kind, item, at:now(), said, restore};
  return restore;
}
function deleteExpense(e){
  const d = db(); const i = d.expenses.indexOf(e); if (i < 0) return 'Nothing to remove.';
  d.expenses.splice(i, 1); J.save(); J.renderAll(); lastEntity = null;
  try { window.dispatchEvent(new CustomEvent('jarvis:expense-removed', {detail:{id:e.id, expense:e}})); } catch(_){}
  const back = removedNow('expense', 'expenses', e, i, `${money(e.amount)} for ${lc(e.desc)}`, ()=>{ window.dispatchEvent(new CustomEvent('jarvis:expense-restored', {detail:{id:e.id, expense:e}})); });
  J.toast(`Removed ${money(e.amount)} ${e.desc}`, back);
  try { J.go('budget'); } catch(_){}
  return `Removed ${money(e.amount)} for ${lc(e.desc)}.`;
}
function deleteReminder(r){
  const d = db(); const i = d.reminders.indexOf(r); if (i < 0) return 'Nothing to remove.';
  d.reminders.splice(i, 1); J.save(); J.renderAll(); lastEntity = null;
  J.toast(`Removed: ${r.text}`, removedNow('reminder', 'reminders', r, i, `your reminder to ${lower1(r.text)}`));
  try { J.go('reminders'); } catch(_){}
  return `Removed your reminder to ${lower1(r.text)}.`;
}
function deleteNote(n){
  const d = db(); const i = d.notes.indexOf(n); if (i < 0) return 'Nothing to remove.';
  d.notes.splice(i, 1); J.save(); J.renderAll(); lastEntity = null;
  J.toast('Note deleted', removedNow('note', 'notes', n, i, 'your note'));
  return 'Deleted that note.';
}

/* =========================================================
   3. Quick answers, no internet needed: maths, units, dates, time abroad, coins, spelling, capitals
   ========================================================= */
const ASK_PRE = /^(?:(?:hey |ok |okay )?(?:what's|whats|what is|what are|what does|what do|what will|what would|how much is|how much are|how much does|how much do|how much will|how many is|how far is|how long is|how heavy is|how big is|how tall is|how much would|calculate|compute|work out|figure out|solve|tell me|quick maths?|maths?|do the math(?: on)?|can you calculate|give me)\s+)+/;
function calc(t){
  let s = moreNumbers(t).replace(/[?]/g,'').trim();
  if (S().budget) s = s.replace(/\bmy (?:monthly )?budget\b/g, String(S().budget));
  // tips and splitting a bill
  let m;
  // "if I save 300 a month, how much will I have in a year"
  if ((m = s.match(/^(?:(?:if|when) )?(?:i|we) (?:save|put (?:away|aside)|set aside|invest) \$?(\d+(?:\.\d+)?)(?: dollars?| bucks)? (?:a|an|per|every|each) (day|week|month|year)\b.*?\b(?:in|after|over|for) (a|an|one|\d+) (days?|weeks?|months?|years?)$/))){
    const per = {day:1, week:7, month:30.4375, year:365.25}, unit = m[4].replace(/s$/,'');
    const k = /^(?:a|an|one)$/.test(m[3]) ? 1 : +m[3];
    const times = unit === m[2] ? k : Math.round(k * per[unit] / per[m[2]] * 100) / 100;
    if (!(times > 0) || times > 1e6) return null;
    return `Saving ${money(+m[1])} a ${m[2]} gives you ${money(+m[1] * times)} after ${k} ${unit}${k === 1 ? '' : 's'}, before any interest.`;
  }
  if ((m = s.match(/^(?:what(?:'s| is| would be)|how much (?:is|would be|should be)|calculate|work out)? ?(?:(?:a|an|the|my) )?(?:(\d+(?:\.\d+)?)\s*(?:%|percent|per cent) )?tip (?:on|for) (?:a |an )?\$?(\d+(?:\.\d+)?)(?: dollars?| bucks)?(?: bill| check| dinner| meal)?$|^how much (?:should i |do i )?tip (?:on|for) (?:a |an )?\$?(\d+(?:\.\d+)?)(?: dollars?| bucks)?(?: bill| check)?$/))){
    const bill = parseFloat(m[2] || m[3]); const p = m[1] ? parseFloat(m[1]) : null;
    if (p != null) return `A ${num(p)}% tip on ${money(bill)} is ${money(bill*p/100)}, so ${money(bill*(1+p/100))} in total.`;
    return `On ${money(bill)}: a 10% tip is ${money(bill*.1)}, 15% is ${money(bill*.15)}, and 20% is ${money(bill*.2)}.`;
  }
  if ((m = s.match(/^(?:how much (?:is it|each|per person) (?:if (?:we|i) )?)?split(?:ting)? (?:a |the )?\$?(\d+(?:\.\d+)?)(?: dollars?| bucks)?(?: bill| check)? (?:(?:between|among|by|in|into|with|for|across) )?(\d+)(?: (people|persons|ways|of us|friends|guys|others))?(?: each)?$/)) && (/\b(?:between|among|by|in|into|with|for|across)\b/.test(s) || /\b(ways|people|persons)\b/.test(s))){
    let n = parseInt(m[2]); if (/\bwith\b/.test(s) && /friends|guys|others/.test(m[3]||'')) n += 1; if (!n) return null;
    return `${money(parseFloat(m[1]))} split ${n} ways is ${money(parseFloat(m[1])/n)} each.`;
  }
  s = s.replace(ASK_PRE, '').replace(/\s+(?:equal|equals|make|makes|come to|comes to|is|be|give me|give you)$/,'').replace(/^(?:what|how much)\s+/,'').trim();
  if (!/\d/.test(s)) return null;
  let e = ' ' + s + ' ';
  const R = [
    [/\bthe square root of\b|\bsquare root of\b|\bsquare root\b|\broot of\b/g, ' sqrt '],
    [/\b(\d+(?:\.\d+)?) squared\b/g, ' $1 ^ 2 '], [/\b(\d+(?:\.\d+)?) cubed\b/g, ' $1 ^ 3 '],
    [/\bto the power of\b|\bto the\b(?= \d+(?:st|nd|rd|th)? power)|\braised to(?: the power of)?\b/g, ' ^ '], [/(\d)(?:st|nd|rd|th)? power\b/g, '$1'],
    [/(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)\s+off\s+(?:of\s+)?\$?(\d+(?:\.\d+)?)/g, ' $2 * ( 1 - $1 / 100 ) '],
    [/(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)\s+of\b/g, ' ( $1 / 100 ) * '],
    [/(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)/g, ' $1 % '],
    [/\bhalf of\b/g, ' 0.5 * '], [/\ba third of\b|\bone third of\b/g, ' ( 1 / 3 ) * '], [/\ba quarter of\b|\bone quarter of\b/g, ' 0.25 * '],
    [/\bdouble\b|\btwice\b/g, ' 2 * '], [/\btriple\b/g, ' 3 * '],
    [/\badd (\d+(?:\.\d+)?) to (\d+(?:\.\d+)?)\b/g, ' $2 + $1 '], [/\badd (?:up )?(\d+(?:\.\d+)?) and (\d+(?:\.\d+)?)\b/g, ' $1 + $2 '], [/\bsum of (\d+(?:\.\d+)?) and (\d+(?:\.\d+)?)\b/g, ' $1 + $2 '], [/\bsubtract (\d+(?:\.\d+)?) from (\d+(?:\.\d+)?)\b/g, ' $2 - $1 '], [/\btake (\d+(?:\.\d+)?) (?:away )?from (\d+(?:\.\d+)?)\b/g, ' $2 - $1 '],
    [/\bdivide (\d+(?:\.\d+)?) by (\d+(?:\.\d+)?)\b/g, ' $1 / $2 '], [/\bmultiply (\d+(?:\.\d+)?) (?:by|times|and) (\d+(?:\.\d+)?)\b/g, ' $1 * $2 '],
    [/\bplus\b|\band\b(?= \d)|\badded to\b|\+/g, ' + '], [/\bminus\b|\bless\b|\btake away\b|−/g, ' - '],
    [/\bmultiplied by\b|\btimes\b|\bx\b|×|\*/g, ' * '], [/\bdivided by\b|\bdivided into\b|\bover\b|÷|\//g, ' / '],
    [/\$/g, ' '], [/\b(?:dollars?|bucks|usd)\b/g, ' '], [/\bby\b/g, ' * ']
  ];
  for (const [re, rep] of R) e = e.replace(re, rep);
  e = e.replace(/\s+/g, ' ').trim();
  if (!/^[\d\s.+\-*/^()%sqrt]+$/.test(e)) return null;
  if (!/[+\-*/^%]|sqrt/.test(e)) return null;
  const v = evalExpr(e); if (v == null || !isFinite(v)) return v === Infinity || v === -Infinity ? "You can't divide by zero, even with my help." : null;
  if (/^(?:multiply|divide|add|subtract|take|sum)\b/.test(s)) return `That's ${num(+v.toPrecision(12))}.`;
  let said = s.replace(/\bpercent\b|\bper cent\b/g, '%').replace(/\s+%/g, '%').replace(/\s+/g,' ').trim();
  said = said.replace(/^\(|\)$/g, '');
  return `${cap(said)} is ${num(+v.toPrecision(12))}.`;
}
/** "what time is sunset", "when is sunrise tomorrow": from the weather the brief already fetched */
function sunTimes(t){
  const m = t.match(/^(?:what time (?:is|'s)|when (?:is|'s)|when does|what time does|time of|what(?:'s| is))? ?(?:the )?(sunset|sunrise|sun ?set|sun ?rise|sun (?:set|go down|come up|rise))(?: today| tonight| tomorrow| this evening)?$/);
  if (!m) return null;
  const rise = /rise|come up/.test(m[1]), tmrw = /tomorrow/.test(t);
  let d = null; try { d = J.weather && J.weather.data && J.weather.data.d; } catch(e){}
  const iso = d && (rise ? d.rise : d.set) && (rise ? d.rise : d.set)[tmrw ? 1 : 0];
  if (!iso) return `I don't have ${rise ? 'sunrise' : 'sunset'} times yet. Ask me for the weather first, and I'll have them.`;
  const when = new Date(iso); if (!isFinite(when)) return null;
  const place = (J.weather.location && J.weather.location.name) ? ` in ${J.weather.location.name}` : '';
  return `${rise ? 'Sunrise' : 'Sunset'}${place} is at ${when.toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})} ${tmrw ? 'tomorrow' : 'today'}.`;
}
function evalExpr(src){
  const tok = src.match(/sqrt|\d+(?:\.\d+)?|[+\-*/^()%]/g); if (!tok) return null;
  let i = 0; const peek = () => tok[i], next = () => tok[i++];
  function expr(){
    let v = term();
    while (peek() === '+' || peek() === '-'){
      const op = next(); const start = i; let r = term(); const pct = tok[i-1] === '%';
      if (pct && !/[*/]/.test(tok.slice(start, i).join(''))) r = v * r; // "150 + 20%" = 180
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  function term(){ let v = power(); while (peek() === '*' || peek() === '/'){ const op = next(); const r = power(); v = op === '*' ? v * r : v / r; } return v; }
  function power(){ const b = unary(); if (peek() === '^'){ next(); return Math.pow(b, power()); } return b; }
  function unary(){ if (peek() === '-'){ next(); return -unary(); } if (peek() === '+'){ next(); return unary(); } return postfix(); }
  function postfix(){ let v = primary(); while (peek() === '%'){ next(); v = v / 100; } return v; }
  function primary(){
    const k = next();
    if (k === 'sqrt') return Math.sqrt(unary());
    if (k === '('){ const v = expr(); if (next() !== ')') throw new Error('paren'); return v; }
    const n = parseFloat(k); if (isNaN(n)) throw new Error('bad'); return n;
  }
  try { const v = expr(); return i === tok.length ? v : null; } catch(e){ return null; }
}

/* ---------- units ---------- */
const U = {};
function unit(key, dim, f, names, say){ U[key] = {dim, f, say: say || names[0]}; names.forEach(n => UN.push([n, key])); }
const UN = [];
unit('mm','len',.001,['millimeters','millimetres','millimeter','millimetre','mm']); unit('cm','len',.01,['centimeters','centimetres','centimeter','centimetre','cm','cms']);
unit('m','len',1,['meters','metres','meter','metre','m']); unit('km','len',1000,['kilometers','kilometres','kilometer','kilometre','km','kms','klicks']);
unit('in','len',.0254,['inches','inch','in']); unit('ft','len',.3048,['feet','foot','ft']); unit('yd','len',.9144,['yards','yard','yd']); unit('mi','len',1609.344,['miles','mile','mi']); unit('nmi','len',1852,['nautical miles','nautical mile']);
unit('mg','mass',1e-6,['milligrams','milligram','mg']); unit('g','mass',.001,['grams','gram','g','grammes']); unit('kg','mass',1,['kilograms','kilogram','kilos','kilo','kg','kgs']);
unit('t','mass',1000,['metric tons','metric tonnes','tonnes','tonne','tons','ton']); unit('oz','mass',.028349523125,['ounces','ounce','oz']); unit('lb','mass',.45359237,['pounds','pound','lbs','lb']); unit('st','mass',6.35029318,['stone','stones']);
unit('ml','vol',.001,['milliliters','millilitres','milliliter','millilitre','ml','mls']); unit('cl','vol',.01,['centiliters','centilitres','cl']); unit('l','vol',1,['liters','litres','liter','litre','l']);
unit('tsp','vol',.00492892,['teaspoons','teaspoon','tsp']); unit('tbsp','vol',.0147868,['tablespoons','tablespoon','tbsp']); unit('floz','vol',.0295735,['fluid ounces','fluid ounce','fl oz']);
unit('cup','vol',.236588,['cups','cup']); unit('pt','vol',.473176,['pints','pint']); unit('qt','vol',.946353,['quarts','quart']); unit('gal','vol',3.78541,['gallons','gallon','gal']);
unit('sqm','area',1,['square meters','square metres','square meter','square metre','sq m','sqm','m2']); unit('sqkm','area',1e6,['square kilometers','square kilometres','square kilometer','sq km','km2']);
unit('sqft','area',.09290304,['square feet','square foot','sq ft','sqft']); unit('acre','area',4046.8564224,['acres','acre']); unit('ha','area',1e4,['hectares','hectare','ha']); unit('sqmi','area',2589988.11,['square miles','square mile']);
unit('kph','speed',1/3.6,['kilometers per hour','kilometres per hour','kilometers an hour','kilometres an hour','km per hour','km an hour','kph','kmh','km/h']); unit('mph','speed',.44704,['miles per hour','miles an hour','mph']); unit('mps','speed',1,['meters per second','metres per second','m/s']); unit('kn','speed',.514444,['knots','knot']);
unit('s','time',1,['seconds','second','secs','sec']); unit('min','time',60,['minutes','minute','mins']); unit('h','time',3600,['hours','hour','hrs','hr']); unit('d','time',86400,['days','day']); unit('wk','time',604800,['weeks','week']); unit('yr','time',31557600,['years','year']);
unit('kb','data',1024,['kilobytes','kilobyte','kb']); unit('mb','data',1048576,['megabytes','megabyte','mb','megs','meg']); unit('gb','data',1073741824,['gigabytes','gigabyte','gb','gigs','gig']); unit('tb','data',1099511627776,['terabytes','terabyte','tb']);
unit('kcal','energy',4184,['kilocalories','kcal']); unit('kj','energy',1000,['kilojoules','kilojoule','kj']);
unit('c','temp',null,['degrees celsius','degrees centigrade','celsius','centigrade','°c','c'],'degrees Celsius'); unit('f','temp',null,['degrees fahrenheit','fahrenheit','°f','f'],'degrees Fahrenheit'); unit('k','temp',null,['kelvin','kelvins'],'kelvin');
UN.sort((a,b)=>b[0].length - a[0].length);
const SAY = {mm:'millimeters',cm:'centimeters',m:'meters',km:'kilometers',in:'inches',ft:'feet',yd:'yards',mi:'miles',nmi:'nautical miles',mg:'milligrams',g:'grams',kg:'kilograms',t:'metric tons',oz:'ounces',lb:'pounds',st:'stone',ml:'milliliters',cl:'centiliters',l:'liters',tsp:'teaspoons',tbsp:'tablespoons',floz:'fluid ounces',cup:'cups',pt:'pints',qt:'quarts',gal:'gallons',sqm:'square meters',sqkm:'square kilometers',sqft:'square feet',acre:'acres',ha:'hectares',sqmi:'square miles',kph:'kilometers per hour',mph:'miles per hour',mps:'meters per second',kn:'knots',s:'seconds',min:'minutes',h:'hours',d:'days',wk:'weeks',yr:'years',kb:'kilobytes',mb:'megabytes',gb:'gigabytes',tb:'terabytes',kcal:'kilocalories',kj:'kilojoules',c:'degrees Celsius',f:'degrees Fahrenheit',k:'kelvin'};
const ONE = {mm:'millimeter',cm:'centimeter',m:'meter',km:'kilometer',in:'inch',ft:'foot',yd:'yard',mi:'mile',nmi:'nautical mile',mg:'milligram',g:'gram',kg:'kilogram',t:'metric ton',oz:'ounce',lb:'pound',st:'stone',ml:'milliliter',cl:'centiliter',l:'liter',tsp:'teaspoon',tbsp:'tablespoon',floz:'fluid ounce',cup:'cup',pt:'pint',qt:'quart',gal:'gallon',sqm:'square meter',sqkm:'square kilometer',sqft:'square foot',acre:'acre',ha:'hectare',sqmi:'square mile',kph:'kilometer per hour',mph:'mile per hour',mps:'meter per second',kn:'knot',s:'second',min:'minute',h:'hour',d:'day',wk:'week',yr:'year',kb:'kilobyte',mb:'megabyte',gb:'gigabyte',tb:'terabyte',kcal:'kilocalorie',kj:'kilojoule',c:'degree Celsius',f:'degree Fahrenheit',k:'kelvin'};
const unitName = (k, n) => Math.abs(n) === 1 ? ONE[k] : SAY[k];
function unitKey(s){ s = lc(s).trim().replace(/^(?:a |an |the )/, ''); for (const [n, k] of UN) if (s === n) return k; return null; }
const UNIT_RE = '((?:degrees )?[a-z°/0-9]+(?: [a-z/]+){0,2}?)';
function toTemp(v, from, to){ const c = from === 'c' ? v : from === 'f' ? (v-32)*5/9 : v-273.15; return to === 'c' ? c : to === 'f' ? c*9/5+32 : c+273.15; }
function convertUnits(t){
  let s = moreNumbers(t).replace(/[?]/g,'').replace(ASK_PRE, '').replace(/^(?:convert|change|turn)\s+/, '').replace(/^(?:minus|negative) (?=\d)/, '-').trim();
  let m, n, a, b;
  if ((m = s.match(/^(\d+) (?:foot|feet|ft)(?: and)? (\d{1,2})(?: inch(?:es)?)? (?:in|to|into) (cm|centimeters|centimetres|meters|metres|m)$/))){ const cm = (parseInt(m[1])*12 + parseInt(m[2])) * 2.54; return `${m[1]} feet ${m[2]} inch${m[2]==='1'?'':'es'} is ${/^c/.test(m[3]) ? num(Math.round(cm)) + ' centimeters' : num(+(cm/100).toFixed(2)) + ' meters'}.`; }
  if ((m = s.match(new RegExp('^'+NUM+' ?'+UNIT_RE+' (?:to|in|into|in to|as|is how many|equals how many|is what in|in terms of) '+UNIT_RE+'$')))){ n = toN(m[1]); a = m[2]; b = m[3]; }
  else if ((m = s.match(new RegExp('^how many '+UNIT_RE+' (?:are |is )?(?:there )?(?:in|is|are|make|to|per|equals?|in an?|in one) (?:'+NUM+' )?'+UNIT_RE+'$')))){ b = m[1]; n = m[2] ? toN(m[2]) : 1; a = m[3]; }
  else if ((m = s.match(new RegExp('^'+NUM+' ?'+UNIT_RE+' (?:is|are|equals?) how many '+UNIT_RE+'$')))){ n = toN(m[1]); a = m[2]; b = m[3]; }
  else return null;
  if (/^degrees?$/.test(a)){ const kb0 = unitKey(b); a = kb0 === 'f' ? 'c' : kb0 === 'c' ? 'f' : a; }
  const ka = unitKey(a), kb = unitKey(b);
  if (!ka || !kb || ka === kb) return null;
  if (U[ka].dim !== U[kb].dim) return null;
  if (isNaN(n)) return null;
  let v;
  if (U[ka].dim === 'temp') v = toTemp(n, ka, kb); else v = n * U[ka].f / U[kb].f;
  const show = x => num(Math.abs(x) >= 1 ? +x.toFixed(2) : +x.toPrecision(3));
  // heights: 180 centimeters is 5 feet 11 inches
  if (kb === 'ft' && U[ka].dim === 'len' && n * U[ka].f < 3 && n * U[ka].f > 0.3){
    const inch = n * U[ka].f / .0254; let ft = Math.floor(inch / 12), rest = Math.round(inch - ft*12); if (rest === 12){ ft++; rest = 0; }
    return `${num(n)} ${unitName(ka, n)} is ${ft} ${ft===1?'foot':'feet'}${rest ? ' ' + rest + ' inch' + (rest===1?'':'es') : ''}.`;
  }
  return `${num(n)} ${unitName(ka, n)} is ${show(v)} ${unitName(kb, +show(v).replace(/,/g,''))}.`;
}

/* ---------- currencies ---------- */
const CUR = [
  ['LBP', /^(?:lebanese (?:pounds?|liras?|lira)|liras?|lira|lbp|l\.?l\.?|ll)$/, 'Lebanese pounds', 'Lebanese pound'],
  ['USD', /^(?:us |american |u\.s\. )?(?:dollars?|bucks|usd|\$|greenbacks?)$/, 'US dollars', 'US dollar'],
  ['EUR', /^(?:euros?|eur|€)$/, 'euros', 'euro'],
  ['GBP', /^(?:british pounds?|pounds? sterling|sterling|gbp|quid|£|uk pounds?|english pounds?)$/, 'British pounds', 'British pound'],
  ['AED', /^(?:uae |emirati )?(?:dirhams?|aed)$/, 'UAE dirhams', 'UAE dirham'],
  ['SAR', /^(?:saudi (?:riyals?|rials?)|riyals?|rials?|sar)$/, 'Saudi riyals', 'Saudi riyal'],
  ['QAR', /^(?:qatari (?:riyals?|rials?)|qar)$/, 'Qatari riyals', 'Qatari riyal'],
  ['KWD', /^(?:kuwaiti dinars?|kwd)$/, 'Kuwaiti dinars', 'Kuwaiti dinar'],
  ['JOD', /^(?:jordanian dinars?|jod|dinars?)$/, 'Jordanian dinars', 'Jordanian dinar'],
  ['EGP', /^(?:egyptian pounds?|egp)$/, 'Egyptian pounds', 'Egyptian pound'],
  ['TRY', /^(?:turkish liras?|turkish lira|try)$/, 'Turkish lira', 'Turkish lira'],
  ['CAD', /^(?:canadian dollars?|cad)$/, 'Canadian dollars', 'Canadian dollar'],
  ['AUD', /^(?:australian dollars?|aussie dollars?|aud)$/, 'Australian dollars', 'Australian dollar'],
  ['CHF', /^(?:swiss francs?|francs?|chf)$/, 'Swiss francs', 'Swiss franc'],
  ['JPY', /^(?:japanese )?(?:yen|jpy)$/, 'Japanese yen', 'Japanese yen'],
  ['CNY', /^(?:chinese )?(?:yuan|renminbi|rmb|cny)$/, 'Chinese yuan', 'Chinese yuan'],
  ['INR', /^(?:indian )?(?:rupees?|inr)$/, 'Indian rupees', 'Indian rupee'],
  ['RUB', /^(?:russian )?(?:rubles?|roubles?|rub)$/, 'Russian rubles', 'Russian ruble'],
  ['SEK', /^(?:swedish )?(?:kronor|krona|sek)$/, 'Swedish kronor', 'Swedish krona'],
  ['BRL', /^(?:brazilian )?(?:reais|real|brl)$/, 'Brazilian reais', 'Brazilian real'],
  ['MXN', /^(?:mexican )?(?:pesos?|mxn)$/, 'Mexican pesos', 'Mexican peso'],
  ['XAU', /^$/, 'ounces of gold', 'ounce of gold']
];
function curKey(s){ s = lc(s).trim().replace(/^(?:a |an |the |one )/, ''); if (/^(?:pounds?)$/.test(s)) return 'GBP'; for (const [k, re] of CUR) if (re.test(s)) return k; return null; }
const curName = (k, n) => { const c = CUR.find(x=>x[0]===k); return c ? (n === 1 ? c[3] : c[2]) : k; };
const FX_LS = 'jarvis2-fx';
let fxMem = null;
function fxCache(){ if (fxMem) return fxMem; try { fxMem = JSON.parse(localStorage.getItem(FX_LS) || 'null'); } catch(e){ fxMem = null; } return fxMem; }
function fxStore(o){ fxMem = o; try { localStorage.setItem(FX_LS, JSON.stringify(o)); } catch(e){} }
async function fetchJSON(url, ms, init){
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tm = setTimeout(()=>{ try { ac && ac.abort(); } catch(e){} }, ms || 8000);
  try {
    const r = await fetch(url, Object.assign({signal: ac ? ac.signal : undefined, headers:{'Accept':'application/json'}}, init||{}));
    if (r.status === 404) { const e = new Error('404'); e.status = 404; throw e; }
    if (!r.ok) { const e = new Error('http ' + r.status); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(tm); }
}
async function getRates(){
  const c = fxCache();
  if (c && now() - c.at < 6*HOUR) return c;
  try {
    const d = await fetchJSON('https://open.er-api.com/v6/latest/USD', 8000);
    if (!d || d.result !== 'success' || !d.rates) throw new Error('bad');
    const o = {at: now(), updated: (d.time_last_update_unix || 0) * 1000 || now(), rates: d.rates}; fxStore(o); return o;
  } catch(e){ if (c) return Object.assign({stale:true}, c); throw e; }
}
function fxParse(t){
  let s = moreNumbers(t).replace(/[?]/g,'').replace(/\b(?:today|right now|now|currently|at the moment|in lebanon|on the black market|on the market)\b/g,' ').replace(/\s+/g,' ').trim();
  s = s.replace(ASK_PRE, '').replace(/^(?:convert|change|exchange|turn)\s+/, '').replace(/^(?:the )?(?:current )?/, '').trim();
  const CW = '([a-z$€£.]+(?: [a-z.]+){0,2}?)';
  const tries = [];
  let m;
  if ((m = s.match(new RegExp('^\\$?'+NUM+'? ?'+CW+'(?: worth)? (?:to|in|into|in to|for|as|against|vs|versus|is how many|equals how many) '+CW+'$')))) tries.push({n: m[1] ? toN(m[1]) : 1, a:m[2], b:m[3]});
  if ((m = s.match(new RegExp('^how many '+CW+' (?:is|are|for|in|to|make|do i get for|would i get for|equals?|per) (?:'+NUM+' )?'+CW+'$')))) tries.push({n: m[2] ? toN(m[2]) : 1, a:m[3], b:m[1]});
  if ((m = s.match(new RegExp('^(?:exchange )?rate (?:for|of|on) (?:the )?'+CW+'(?: (?:to|against|vs|versus|in) (?:the )?'+CW+')?$'))) || (m = s.match(new RegExp('^(?:the )?'+CW+' (?:exchange )?rate(?: (?:to|against|vs|versus|in) (?:the )?'+CW+')?$')))) tries.push({n:1, a:m[1], b:m[2]});
  if ((m = s.match(new RegExp('^'+CW+' (?:to|vs|versus|against|and) (?:the )?'+CW+' (?:exchange )?rate$')))) tries.push({n:1, a:m[1], b:m[2]});
  if ((m = s.match(new RegExp('^(?:a |one )?'+CW+' (?:worth|at|going for|trading at)(?: (?:in|to) '+CW+')?$')))) tries.push({n:1, a:m[1], b:m[2]});
  if ((m = s.match(/^(?:a |one |the )?(dollar|euro|lira|lebanese lira|pound|dirham|riyal)$/)) && /^how much is|^what('s| is) the /.test(t)) tries.push({n:1, a:m[1]});
  if ((m = s.match(new RegExp('^\\$(\\d+(?:\\.\\d+)?) (?:to|in|into|in to) '+CW+'$')))) tries.push({n:parseFloat(m[1]), a:'$', b:m[2]});
  for (const q of tries){
    const ka = curKey(q.a), kb = q.b ? curKey(q.b) : null;
    if (!ka || (q.b && !kb) || isNaN(q.n)) continue;
    const to = kb || (ka === 'USD' ? 'LBP' : 'USD');
    if (ka === to) continue;
    return {n:q.n, from:ka, to};
  }
  return null;
}
function fxAnswer(q, r){
  const ra = q.from === 'USD' ? 1 : r.rates[q.from], rb = q.to === 'USD' ? 1 : r.rates[q.to];
  if (!ra || !rb) return `I don't have a rate for ${!ra ? curName(q.from) : curName(q.to)} right now.`;
  // "what's the lira rate": 1 lira is worth almost nothing, so say it the useful way round (1 dollar = 89,500 lira)
  if (q.n === 1 && 1 / ra * rb < 0.01) return fxAnswer({n:1, from:q.to, to:q.from}, r);
  const v = q.n / ra * rb;
  const show = q.to === 'LBP' || v >= 1000 ? new Intl.NumberFormat('en-US', {maximumFractionDigits:0}).format(q.to === 'LBP' && v > 1000 ? Math.round(v/100)*100 : Math.round(v)) : num(+v.toFixed(v < 1 ? 4 : 2));
  let s = `${num(q.n)} ${curName(q.from, q.n)} is about ${show} ${curName(q.to, v)}.`;
  if (q.from === 'LBP' || q.to === 'LBP') s += ' That uses the official rate; shops in Lebanon may differ a little.';
  const age = now() - (r.updated || r.at);
  if (r.stale || age > 36*HOUR) s += ` Rates from ${new Date(r.updated || r.at).toLocaleDateString([], {month:'short', day:'numeric'})}.`;
  return s;
}

/* ---------- time in other cities ---------- */
const TZ = {
  'beirut':'Asia/Beirut','lebanon':'Asia/Beirut','tripoli lebanon':'Asia/Beirut','jounieh':'Asia/Beirut','byblos':'Asia/Beirut','sidon':'Asia/Beirut','tyre':'Asia/Beirut','zahle':'Asia/Beirut',
  'dubai':'Asia/Dubai','abu dhabi':'Asia/Dubai','uae':'Asia/Dubai','the uae':'Asia/Dubai','sharjah':'Asia/Dubai','emirates':'Asia/Dubai',
  'riyadh':'Asia/Riyadh','saudi':'Asia/Riyadh','saudi arabia':'Asia/Riyadh','jeddah':'Asia/Riyadh','mecca':'Asia/Riyadh','doha':'Asia/Qatar','qatar':'Asia/Qatar','kuwait':'Asia/Kuwait','kuwait city':'Asia/Kuwait',
  'bahrain':'Asia/Bahrain','manama':'Asia/Bahrain','muscat':'Asia/Muscat','oman':'Asia/Muscat','amman':'Asia/Amman','jordan':'Asia/Amman','damascus':'Asia/Damascus','syria':'Asia/Damascus','baghdad':'Asia/Baghdad','iraq':'Asia/Baghdad','erbil':'Asia/Baghdad',
  'cairo':'Africa/Cairo','egypt':'Africa/Cairo','istanbul':'Europe/Istanbul','turkey':'Europe/Istanbul','ankara':'Europe/Istanbul','tehran':'Asia/Tehran','iran':'Asia/Tehran','jerusalem':'Asia/Jerusalem','cyprus':'Asia/Nicosia','nicosia':'Asia/Nicosia','larnaca':'Asia/Nicosia','limassol':'Asia/Nicosia',
  'london':'Europe/London','uk':'Europe/London','the uk':'Europe/London','england':'Europe/London','britain':'Europe/London','manchester':'Europe/London','edinburgh':'Europe/London','dublin':'Europe/Dublin','ireland':'Europe/Dublin',
  'paris':'Europe/Paris','france':'Europe/Paris','lyon':'Europe/Paris','marseille':'Europe/Paris','nice':'Europe/Paris','berlin':'Europe/Berlin','germany':'Europe/Berlin','munich':'Europe/Berlin','frankfurt':'Europe/Berlin','hamburg':'Europe/Berlin',
  'madrid':'Europe/Madrid','spain':'Europe/Madrid','barcelona':'Europe/Madrid','rome':'Europe/Rome','italy':'Europe/Rome','milan':'Europe/Rome','amsterdam':'Europe/Amsterdam','netherlands':'Europe/Amsterdam','brussels':'Europe/Brussels','belgium':'Europe/Brussels',
  'zurich':'Europe/Zurich','geneva':'Europe/Zurich','switzerland':'Europe/Zurich','vienna':'Europe/Vienna','austria':'Europe/Vienna','lisbon':'Europe/Lisbon','portugal':'Europe/Lisbon','athens':'Europe/Athens','greece':'Europe/Athens',
  'stockholm':'Europe/Stockholm','sweden':'Europe/Stockholm','oslo':'Europe/Oslo','norway':'Europe/Oslo','copenhagen':'Europe/Copenhagen','denmark':'Europe/Copenhagen','helsinki':'Europe/Helsinki','finland':'Europe/Helsinki','warsaw':'Europe/Warsaw','poland':'Europe/Warsaw',
  'prague':'Europe/Prague','budapest':'Europe/Budapest','bucharest':'Europe/Bucharest','sofia':'Europe/Sofia','kyiv':'Europe/Kyiv','kiev':'Europe/Kyiv','ukraine':'Europe/Kyiv','moscow':'Europe/Moscow','russia':'Europe/Moscow','yerevan':'Asia/Yerevan','armenia':'Asia/Yerevan',
  'new york':'America/New_York','nyc':'America/New_York','new york city':'America/New_York','boston':'America/New_York','miami':'America/New_York','washington':'America/New_York','washington dc':'America/New_York','dc':'America/New_York','atlanta':'America/New_York','philadelphia':'America/New_York','detroit':'America/Detroit','florida':'America/New_York','the east coast':'America/New_York','toronto':'America/Toronto','montreal':'America/Toronto','ottawa':'America/Toronto','canada':'America/Toronto',
  'chicago':'America/Chicago','houston':'America/Chicago','dallas':'America/Chicago','texas':'America/Chicago','austin':'America/Chicago','denver':'America/Denver','phoenix':'America/Phoenix','los angeles':'America/Los_Angeles','la':'America/Los_Angeles','l.a.':'America/Los_Angeles','san francisco':'America/Los_Angeles','seattle':'America/Los_Angeles','las vegas':'America/Los_Angeles','vegas':'America/Los_Angeles','california':'America/Los_Angeles','the west coast':'America/Los_Angeles','vancouver':'America/Vancouver','san diego':'America/Los_Angeles',
  'america':'America/New_York','the us':'America/New_York','the usa':'America/New_York','usa':'America/New_York','us':'America/New_York','the states':'America/New_York','united states':'America/New_York','the united states':'America/New_York',
  'mexico city':'America/Mexico_City','mexico':'America/Mexico_City','sao paulo':'America/Sao_Paulo','são paulo':'America/Sao_Paulo','rio':'America/Sao_Paulo','rio de janeiro':'America/Sao_Paulo','brazil':'America/Sao_Paulo','buenos aires':'America/Argentina/Buenos_Aires','argentina':'America/Argentina/Buenos_Aires','bogota':'America/Bogota','lima':'America/Lima','santiago':'America/Santiago','caracas':'America/Caracas',
  'tokyo':'Asia/Tokyo','japan':'Asia/Tokyo','osaka':'Asia/Tokyo','seoul':'Asia/Seoul','korea':'Asia/Seoul','south korea':'Asia/Seoul','beijing':'Asia/Shanghai','shanghai':'Asia/Shanghai','china':'Asia/Shanghai','hong kong':'Asia/Hong_Kong','taipei':'Asia/Taipei','singapore':'Asia/Singapore','kuala lumpur':'Asia/Kuala_Lumpur','malaysia':'Asia/Kuala_Lumpur',
  'bangkok':'Asia/Bangkok','thailand':'Asia/Bangkok','jakarta':'Asia/Jakarta','bali':'Asia/Makassar','manila':'Asia/Manila','philippines':'Asia/Manila','hanoi':'Asia/Ho_Chi_Minh','vietnam':'Asia/Ho_Chi_Minh','delhi':'Asia/Kolkata','new delhi':'Asia/Kolkata','mumbai':'Asia/Kolkata','india':'Asia/Kolkata','bangalore':'Asia/Kolkata','karachi':'Asia/Karachi','pakistan':'Asia/Karachi','dhaka':'Asia/Dhaka','kathmandu':'Asia/Kathmandu','colombo':'Asia/Colombo',
  'sydney':'Australia/Sydney','melbourne':'Australia/Melbourne','australia':'Australia/Sydney','brisbane':'Australia/Brisbane','perth':'Australia/Perth','auckland':'Pacific/Auckland','new zealand':'Pacific/Auckland','honolulu':'Pacific/Honolulu','hawaii':'Pacific/Honolulu',
  'lagos':'Africa/Lagos','nigeria':'Africa/Lagos','nairobi':'Africa/Nairobi','kenya':'Africa/Nairobi','johannesburg':'Africa/Johannesburg','cape town':'Africa/Johannesburg','south africa':'Africa/Johannesburg','casablanca':'Africa/Casablanca','morocco':'Africa/Casablanca','tunis':'Africa/Tunis','tunisia':'Africa/Tunis','algiers':'Africa/Algiers','algeria':'Africa/Algiers','accra':'Africa/Accra','ghana':'Africa/Accra','abidjan':'Africa/Abidjan','ivory coast':'Africa/Abidjan','dakar':'Africa/Dakar','senegal':'Africa/Dakar','kinshasa':'Africa/Kinshasa','luanda':'Africa/Luanda','addis ababa':'Africa/Addis_Ababa','ethiopia':'Africa/Addis_Ababa'
};
function tzParts(tz, at){
  const f = new Intl.DateTimeFormat('en-US', {timeZone:tz, hour:'numeric', minute:'2-digit', weekday:'long', year:'numeric', month:'numeric', day:'numeric', hour12:true});
  const p = {}; f.formatToParts(new Date(at)).forEach(x=>{ p[x.type] = x.value; }); return p;
}
function tzOffsetMin(tz, at){
  const p = tzParts(tz, at); let h = +p.hour % 12; if (/pm/i.test(p.dayPeriod)) h += 12;
  const asUTC = Date.UTC(+p.year, +p.month-1, +p.day, h, +p.minute);
  return Math.round((asUTC - Math.floor(at/6e4)*6e4) / 6e4);
}
function timeIn(placeName, tz){
  const at = now(); let p;
  try { p = tzParts(tz, at); } catch(e){ return null; }
  const localDay = new Date(at).toLocaleDateString('en-US', {weekday:'long'});
  const diff = tzOffsetMin(tz, at) - (-new Date(at).getTimezoneOffset());
  const hrs = Math.abs(diff) / 60; const hs = (hrs % 1 ? num(hrs) : String(hrs)) + (hrs === 1 ? ' hour' : ' hours');
  const rel = diff === 0 ? 'the same time as you' : `${hs} ${diff > 0 ? 'ahead of' : 'behind'} you`;
  return `It's ${p.hour}:${p.minute} ${p.dayPeriod}${p.weekday !== localDay ? ' on ' + p.weekday : ''} in ${placeName}, ${rel}.`;
}
const titleCase = s => String(s).replace(/\b([a-z])/g, c=>c.toUpperCase()).replace(/\b(Of|The|And|De|Da)\b/g, w=>w.toLowerCase()).replace(/^./, c=>c.toUpperCase());
function timeAbroad(t, turnId){
  let m = t.replace(/\s+(?:right now|now|currently|at the moment|today)$/,'').match(/^(?:what(?:'s| is) the |what )?(?:time|time is it|time it is|the time|current time|local time)(?: is it)?(?: right now| now)? (?:in|at|over in) (.+)$|^what(?:'s| is) the (?:local |current )?time (?:in|at) (.+)$|^what time is it (?:right now |now )?(?:in|at) (.+)$|^(?:is it|is it already) (?:night|morning|day|daytime|late|evening) in (.+)$|^what(?:'s| is) the time difference (?:with|between (?:here|me|us|beirut|lebanon) and|to) (.+)$|^how many hours (?:ahead|behind) is (.+)$/);
  if (!m) return null;
  const place = (m[1] || m[2] || m[3] || m[4] || m[5] || m[6] || '').replace(/^(?:the city of )/, '').trim();
  if (!place || place.split(' ').length > 4) return null;
  const tz = TZ[place] || TZ[place.replace(/^the /, '')];
  const nm = /^(uk|us|usa|uae|the uk|the us|the usa|the uae|la|nyc|dc)$/.test(place) ? place.replace(/^the /,'').toUpperCase() : titleCase(place.replace(/^the /, ''));
  if (tz) return timeIn(nm, tz);
  // unknown city: ask the free Open-Meteo place search for its time zone
  lateAsync(turnId, async ()=>{
    const d = await fetchJSON('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(place), 8000);
    const r = d && d.results && d.results[0];
    if (!r) return `I couldn't find a place called ${nm}.`;
    if (!r.timezone) return `I found ${r.name}, but not its time zone.`;
    return timeIn(r.name + (r.country && lc(r.country) !== lc(r.name) ? ', ' + r.country : ''), r.timezone);
  }, `I couldn't look up the time in ${nm} right now. Check your connection and try again.`);
  return `Checking the time in ${nm}…`;
}

/* ---------- dates: days until, holidays ---------- */
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monIdx = s => MONTHS.findIndex(x=>x.startsWith(lc(s).slice(0,3)));
function easter(y){ const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1; return new Date(y, mo-1, da); }
function orthodoxEaster(y){ const a=y%4,b=y%7,c=y%19,d=(19*c+15)%30,e=(2*a+4*b-d+34)%7,mo=Math.floor((d+e+114)/31),da=((d+e+114)%31)+1; const j = new Date(y, mo-1, da); j.setDate(j.getDate()+13); return j; }
const nthDow = (y, mo, dow, n) => { const d = new Date(y, mo, 1); d.setDate(1 + (dow - d.getDay() + 7) % 7 + (n-1)*7); return d; };
// Islamic dates move with the moon: these are the expected dates (they can shift by a day)
const HIJRI = {
  ramadan: ['2026-02-18','2027-02-08','2028-01-28','2029-01-16','2030-01-06'],
  eid: ['2026-03-20','2027-03-10','2028-02-27','2029-02-15','2030-02-05'],
  adha: ['2026-05-27','2027-05-16','2028-05-05','2029-04-24','2030-04-13'],
  hijri: ['2026-06-16','2027-06-06','2028-05-25','2029-05-14','2030-05-03'],
  ashura: ['2026-06-25','2027-06-15','2028-06-03','2029-05-23','2030-05-12'],
  mawlid: ['2026-08-25','2027-08-14','2028-08-03','2029-07-24','2030-07-13']
};
const hijriNext = (k, from) => { for (const s of HIJRI[k]){ const [y,m,d] = s.split('-').map(Number); const dt = new Date(y, m-1, d); if (dt.getTime() >= from) return dt; } return null; };
const HOLIDAYS = [
  {re:/^(?:christmas|xmas|christmas day)$/, name:'Christmas', f:y=>new Date(y,11,25)},
  {re:/^christmas eve$/, name:'Christmas Eve', f:y=>new Date(y,11,24)},
  {re:/^(?:new year'?s?(?: day)?|the new year|new years)$/, name:"New Year's Day", f:y=>new Date(y,0,1)},
  {re:/^new year'?s? eve$/, name:"New Year's Eve", f:y=>new Date(y,11,31)},
  {re:/^(?:valentine'?s?(?: day)?)$/, name:"Valentine's Day", f:y=>new Date(y,1,14)},
  {re:/^halloween$/, name:'Halloween', f:y=>new Date(y,9,31)},
  {re:/^(?:easter|easter sunday|western easter|catholic easter)$/, name:'Easter', f:easter},
  {re:/^(?:orthodox easter|greek easter)$/, name:'Orthodox Easter', f:orthodoxEaster},
  {re:/^good friday$/, name:'Good Friday', f:y=>{ const e = easter(y); e.setDate(e.getDate()-2); return e; }},
  {re:/^(?:mother'?s day|mothers day)$/, name:"Mother's Day in Lebanon", f:y=>new Date(y,2,21)},
  {re:/^(?:father'?s day|fathers day)$/, name:"Father's Day", f:y=>nthDow(y,5,0,3)},
  {re:/^(?:independence day|lebanese independence day|lebanon'?s independence day|lebanon independence day)$/, name:"Lebanon's Independence Day", f:y=>new Date(y,10,22)},
  {re:/^(?:labou?r day|workers'? day|may day)$/, name:'Labor Day', f:y=>new Date(y,4,1)},
  {re:/^(?:liberation day|resistance and liberation day)$/, name:'Liberation Day', f:y=>new Date(y,4,25)},
  {re:/^(?:saint maroun(?:'s)? day|st\.? maroun(?:'s)? day|mar maroun)$/, name:"Saint Maroun's Day", f:y=>new Date(y,1,9)},
  {re:/^(?:assumption(?: day)?|the assumption)$/, name:'Assumption Day', f:y=>new Date(y,7,15)},
  {re:/^(?:annunciation(?: day)?|the annunciation)$/, name:'Annunciation Day', f:y=>new Date(y,2,25)},
  {re:/^(?:armenian christmas)$/, name:'Armenian Christmas', f:y=>new Date(y,0,6)},
  {re:/^(?:thanksgiving|american thanksgiving)$/, name:'Thanksgiving', f:y=>nthDow(y,10,4,4)},
  {re:/^black friday$/, name:'Black Friday', f:y=>{ const d = nthDow(y,10,4,4); d.setDate(d.getDate()+1); return d; }},
  {re:/^(?:ramadan|ramadan start|the start of ramadan|the first day of ramadan)$/, name:'Ramadan', hijri:'ramadan'},
  {re:/^(?:eid|eid al fitr|eid al-fitr|eid el fitr|eid ul fitr|the end of ramadan|small eid)$/, name:'Eid al-Fitr', hijri:'eid'},
  {re:/^(?:eid al adha|eid al-adha|eid el adha|eid ul adha|adha|big eid|the big eid)$/, name:'Eid al-Adha', hijri:'adha'},
  {re:/^(?:islamic new year|hijri new year|muharram)$/, name:'Islamic New Year', hijri:'hijri'},
  {re:/^(?:ashura|ashoura)$/, name:'Ashura', hijri:'ashura'},
  {re:/^(?:mawlid|the prophet'?s birthday|prophet'?s birthday|mawlid al nabi)$/, name:"the Prophet's Birthday", hijri:'mawlid'},
  {re:/^(?:summer)$/, name:'the first day of summer', f:y=>new Date(y,5,21)},
  {re:/^(?:winter)$/, name:'the first day of winter', f:y=>new Date(y,11,21)},
  {re:/^(?:spring)$/, name:'the first day of spring', f:y=>new Date(y,2,20)},
  {re:/^(?:autumn|fall)$/, name:'the first day of autumn', f:y=>new Date(y,8,22)}
];
const LEB_HOLIDAYS = [/^christmas$/, /new year/, /maroun/, /annunciation/, /^good friday$/, /^labou?r/, /liberation/, /assumption/, /independence/, /^eid/, /^(eid al adha)$/, /islamic new year/, /^ashura$/, /^mawlid$/, /armenian/];
const day0 = ts => { const d = new Date(ts); d.setHours(0,0,0,0); return d.getTime(); };
function nextHoliday(h, from){
  if (h.hijri){ const d = hijriNext(h.hijri, from); return d ? {date:d, approx:true} : null; }
  const y = new Date(from).getFullYear(); let d = h.f(y); if (d.getTime() < from) d = h.f(y+1); return {date:d};
}
function dateFrom(x){
  x = lc(x).replace(/^(?:the |this |next |coming )/, '').replace(/(\d)(?:st|nd|rd|th)\b/g, '$1').trim(); let m;
  const today = day0(now());
  if (/^(?:my )?birthday$/.test(x) || /^my (?:birthday|bday)$/.test(x)) return st.birthday ? (()=>{ const [mo, d] = st.birthday.split('-').map(Number); const y = new Date().getFullYear(); let dt = new Date(y, mo-1, d); if (dt.getTime() < today) dt = new Date(y+1, mo-1, d); return {date:dt, name:'your birthday'}; })() : {need:'birthday'};
  for (const h of HOLIDAYS) if (h.re.test(x)){ const r = nextHoliday(h, today); return r ? Object.assign(r, {name:h.name}) : null; }
  if ((m = x.match(new RegExp('^'+MON_RE+'\\.? (\\d{1,2})(?: (\\d{4}))?$'))) || (m = x.match(new RegExp('^(\\d{1,2}) (?:of )?'+MON_RE+'\\.?(?: (\\d{4}))?$')))){
    const isMonFirst = isNaN(parseInt(m[1])); const mo = monIdx(isMonFirst ? m[1] : m[2]); const d = parseInt(isMonFirst ? m[2] : m[1]); const y0 = m[3] ? parseInt(m[3]) : new Date().getFullYear();
    if (mo < 0 || d < 1 || d > 31) return null;
    let dt = new Date(y0, mo, d); if (!m[3] && dt.getTime() < today) dt = new Date(y0+1, mo, d);
    return {date:dt, name: dt.toLocaleDateString([], {month:'long', day:'numeric'}) + (m[3] ? ', ' + m[3] : '')};
  }
  if ((m = x.match(/^(\d{1,2})$/))){ const d = parseInt(m[1]); const n = new Date(); let dt = new Date(n.getFullYear(), n.getMonth(), d); if (dt.getTime() < today) dt = new Date(n.getFullYear(), n.getMonth()+1, d); return {date:dt, name:'the ' + ordinal(d)}; }
  if ((m = x.match(/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/))){ const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']; const n = new Date(); const diff = (days.indexOf(m[1]) - n.getDay() + 7) % 7 || 7; const dt = new Date(today + diff*DAY + 2*HOUR); dt.setHours(0,0,0,0); return {date:dt, name:cap(m[1])}; }
  if (/^(?:the )?weekend$/.test(x)){ const n = new Date(); const diff = (6 - n.getDay() + 7) % 7; const dt = new Date(today + diff*DAY + 2*HOUR); dt.setHours(0,0,0,0); return {date:dt, name:'the weekend'}; }
  if (/^(?:the )?end of (?:the )?month$/.test(x)){ const n = new Date(); return {date:new Date(n.getFullYear(), n.getMonth()+1, 0), name:'the end of the month'}; }
  if (/^(?:the )?end of (?:the )?year$/.test(x)){ const n = new Date(); return {date:new Date(n.getFullYear(), 11, 31), name:'the end of the year'}; }
  if (/^payday$|^pay day$|^(?:my )?salary$/.test(x)) return {need:'payday'};
  return null;
}
const ordinal = n => n + (n%100>=11 && n%100<=13 ? 'th' : ['th','st','nd','rd'][n%10] || 'th');
function daysUntil(t){
  let m, x, mode = 'days';
  if ((m = t.match(/^how many (days|weeks|sleeps|months)(?: are)?(?: (?:left|remaining|to go))? (?:until|till|til|to|before|unti|left until|left till|left to|left before|away is|is it (?:until|till|to)) (.+?)(?: from (?:now|today))?$/))){ mode = m[1]; x = m[2]; }
  else if ((m = t.match(/^how (?:long|far away|far off|soon)(?: is it)?(?: until| till| til| to| before| away is| off is| is)? (.+?)(?: from now)?$/)) && !/\b(drive|flight|walk|take|it take|does)\b/.test(t)){ x = m[1]; }
  else if ((m = t.match(/^(?:days|time) (?:until|till|left until|left till|to|left to|before) (.+)$/))){ x = m[1]; }
  else if ((m = t.match(/^when(?:'s| is| will be| does)? (.+?)(?: this year| next year| start| begin| starting)?$/)) && HOLIDAYS.some(h=>h.re.test(m[1].replace(/^(?:the |this |next )/, '')))){ x = m[1]; mode = 'when'; }
  else if ((m = t.match(/^what (?:day|date|day of the week) (?:is|does|will|falls on|is it on|will it be on) (.+?)(?: on| fall on| be on| this year| next year)?$/)) && !/^(?:it|today|tomorrow|yesterday)$/.test(m[1])){ x = m[1]; mode = 'when'; }
  else if ((m = t.match(/^what(?:'s| is| will be) the date (?:of |on |for )?(?:the )?(next \w+day|this \w+day|\w+day|christmas|easter|eid|ramadan|new year'?s?|the weekend)$/))){ x = m[1].replace(/^(?:next|this) /, ''); mode = 'date'; }
  else if ((m = t.match(/^is (?:it|today) (?:a )?(holiday|public holiday|bank holiday|a day off)(?: today)?$|^(?:is there|any) (?:a )?(?:public )?holiday today$/))) return holidayToday();
  else if ((m = t.match(/^(?:what(?:'s| is) the |when(?:'s| is) the )?next (?:public |bank )?holiday$/))) return nextPublicHoliday();
  else return null;
  if (/^(?:my |the )?(?:meeting|appointment|event|reminder|alarm|flight|cpi|fed|fomc|jobs report|market|markets|next )/.test(x)) return null;
  const d = dateFrom(x.trim()); if (!d) return null;
  if (d.need === 'birthday') return "I don't know your birthday yet. Tell me, like: my birthday is March 3.";
  if (d.need === 'payday') return null;
  const days = Math.round((day0(d.date.getTime()) - day0(now())) / DAY);
  const wd = d.date.toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'});
  const approx = d.approx ? ', depending on the moon sighting' : '';
  const nm = cap(d.name);
  if (mode === 'date') return days === 0 ? `That's today, ${wd}.` : `${cap(d.name)} is ${wd}${d.approx ? ', depending on the moon sighting' : ''}.`;
  if (mode === 'when') return days === 0 ? `${nm} is today!` : `${nm} is on ${wd}${d.approx ? ' (expected)' : ''}, ${days === 1 ? 'tomorrow' : 'in ' + days + ' days'}${approx}.`;
  if (days === 0) return `${nm} is today!`;
  if (mode === 'weeks') return `${nm} is ${num(+(days/7).toFixed(1))} weeks away, on ${wd}${approx}.`;
  if (mode === 'months'){ const mo = +(days/30.44).toFixed(1); return `${nm} is about ${num(mo)} month${mo === 1 ? '' : 's'} away, on ${wd}${approx}.`; }
  if (mode === 'sleeps') return `${days} sleep${days === 1 ? '' : 's'} until ${d.name}${approx}.`;
  return `${days} day${days === 1 ? '' : 's'} until ${d.name}. It's on ${wd}${approx}.`;
}
function publicHolidays(from){
  return HOLIDAYS.filter(h=>LEB_HOLIDAYS.some(r=>r.test(h.name.toLowerCase().replace(/^lebanon's /,'').replace(/^the /, '')))).map(h=>{ const r = nextHoliday(h, from); return r && Object.assign(r, {name:h.name}); }).filter(Boolean).sort((a,b)=>a.date-b.date);
}
function holidayToday(){
  const t0 = day0(now()); const list = publicHolidays(t0);
  const today = list.find(h=>day0(h.date.getTime()) === t0);
  if (today) return `Yes, today is ${today.name}${today.approx ? ', if the moon sighting agrees' : ''}.`;
  const nx = list[0];
  return `Not a public holiday in Lebanon that I know of.` + (nx ? ` The next one is ${nx.name}, on ${nx.date.toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'})}.` : '');
}
function nextPublicHoliday(){
  const t0 = day0(now()); const nx = publicHolidays(t0 + DAY)[0]; if (!nx) return null;
  const days = Math.round((day0(nx.date.getTime()) - t0)/DAY);
  return `The next public holiday in Lebanon is ${nx.name}, on ${nx.date.toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'})}, in ${days} day${days===1?'':'s'}${nx.approx ? ', depending on the moon sighting' : ''}.`;
}
function setBirthday(t){
  const m = t.match(new RegExp('^my (?:birthday|bday|birth date|date of birth) is (?:on )?(?:the )?(?:'+MON_RE+'\\.? (\\d{1,2})(?:st|nd|rd|th)?|(\\d{1,2})(?:st|nd|rd|th)? (?:of )?'+MON_RE+')(?: \\d{4})?$'));
  if (!m) return null;
  const mo = monIdx(m[1] || m[4]), d = parseInt(m[2] || m[3]); if (mo < 0 || !d || d > 31) return null;
  st.birthday = (mo+1) + '-' + d; J.save();
  const r = dateFrom('my birthday'); const days = Math.round((day0(r.date.getTime()) - day0(now()))/DAY);
  return days === 0 ? `Got it. And that's today, happy birthday, ${S().name}!` : `Got it, ${MONTHS[mo].replace(/^./, c=>c.toUpperCase())} ${d}. That's ${days} day${days===1?'':'s'} away.`;
}
function tomorrowDate(t){
  if (/^(?:what(?:'s| is) )?(?:tomorrow'?s date|the date tomorrow|the date of tomorrow)$|^what (?:day|date) (?:is|will it be) tomorrow$|^what(?:'s| is) tomorrow(?:'s)? (?:day|date)$|^what day of the week is tomorrow$/.test(t)){ setKind('chat'); const d = new Date(now() + DAY); return `Tomorrow is ${d.toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'})}.`; }
  if (/^(?:what (?:day|date) was (?:it )?yesterday|what was yesterday'?s date|yesterday'?s date)$/.test(t)){ setKind('chat'); const d = new Date(now() - DAY); return `Yesterday was ${d.toLocaleDateString([], {weekday:'long', month:'long', day:'numeric'})}.`; }
  if (/^(?:what(?:'s| is) )?(?:the )?week (?:number|of the year)$|^what week (?:is it|of the year is it|are we in)$/.test(t)){ setKind('chat'); const d = new Date(); const j = new Date(d.getFullYear(), 0, 1); const w = Math.ceil(((d - j) / DAY + j.getDay() + 1) / 7); return `It's week ${w} of ${d.getFullYear()}.`; }
  if (/^how many days (?:are )?(?:left )?(?:in|until the end of) (?:the |this )?(month|year)$/.test(t)){ setKind('chat'); const d = new Date(); const end = /month/.test(t) ? new Date(d.getFullYear(), d.getMonth()+1, 0) : new Date(d.getFullYear(), 11, 31); const n = Math.round((day0(end.getTime()) - day0(now()))/DAY); return `${n} day${n===1?'':'s'} left in the ${/month/.test(t) ? 'month' : 'year'}, counting from today.`; }
  return null;
}

/* ---------- little things ---------- */
let lastCoin = '', lastFact = '';
const FACTS = [
  "Here's one: Beirut has been rebuilt at least seven times in its history, which is why it's called the city that never dies.",
  "Here's one: compound interest at 7% a year doubles your money in about 10 years. That's the rule of 72: 72 divided by the rate.",
  "Here's one: the cedar on Lebanon's flag can live for over a thousand years. Some trees in the Cedars of God are around 3,000 years old.",
  "Here's one: the New York Stock Exchange started in 1792 under a buttonwood tree, with just 24 brokers.",
  "Here's one: honey never spoils. Archaeologists have found jars of it in Egyptian tombs that were still good to eat.",
  "Here's one: the word salary may come from the Latin for salt, because salt was once so valuable.",
  "Here's one: the Phoenicians, from the coast of today's Lebanon, spread one of the first alphabets, the ancestor of the one you're reading.",
  "Here's one: octopuses have three hearts and blue blood."
];
function games(t, said){
  let m;
  if (/^(?:flip|toss) (?:a |one )?coin(?: for me)?$|^heads or tails$|^coin (?:flip|toss)$|^(?:do a|let's do a) coin (?:flip|toss)$/.test(t)){ setKind('chat'); const h = Math.random() < .5; lastCoin = h ? 'Heads' : 'Tails'; return pickOne([`It's ${lc(lastCoin)}.`, `${lastCoin}!`, `I flipped it: ${lc(lastCoin)}.`]); }
  if ((m = t.match(/^(?:roll|throw) (?:a |an |the |(\d) )?(?:dice|die|dices)(?: for me)?$/))){ setKind('chat'); const n = Math.min(6, parseInt(m[1] || (/\bdice\b/.test(t) && m[1] ? m[1] : '1'))); const r = Array.from({length:n}, ()=>1 + Math.floor(Math.random()*6)); return n === 1 ? `You rolled a ${r[0]}.` : `You rolled ${r.slice(0,-1).join(', ')} and ${r[r.length-1]}. That's ${r.reduce((a,b)=>a+b,0)}.`; }
  if ((m = t.match(/^(?:pick|choose|give me|say|generate|think of) (?:a |me a )?(?:random )?number(?: (?:between|from) (\d+) (?:and|to) (\d+))?$|^random number(?: (?:between|from) (\d+) (?:and|to) (\d+))?$/))){
    setKind('chat'); let a = parseInt(m[1] || m[3] || '1'), b = parseInt(m[2] || m[4] || '100'); if (a > b) [a, b] = [b, a];
    return `${pickOne(['How about', "I'll go with", 'Your number is'])} ${a + Math.floor(Math.random()*(b - a + 1))}.`;
  }
  if ((m = t.match(/^(?:pick|choose)(?: (?:between|one))? (.+?) or (.+)$/)) && t.split(' ').length <= 12){ setKind('chat'); return `I'd go with ${pickOne([m[1], m[2]]).replace(/^(?:a|an|the)\s+/, '')}.`; }
  if ((m = said.match(/^(?:how (?:do|would) (?:you|i) spell|how is|how's|spell|spelling of|can you spell|what's the spelling of|what is the spelling of)\s+(?:the word\s+)?["“]?([A-Za-z][A-Za-z'’-]{0,30}(?: (?!spelled\b|spelt\b)[A-Za-z'’-]{1,30})?)["”]?(?:\s+spelled|\s+spelt)?[?.!]*$/i)) && (/^spell|spell/i.test(said))){
    const w = m[1].replace(/[’]/g,"'"); if (/^(it|that|this|me|you)$/i.test(w)) return null; setKind('chat');
    return `${cap(w)} is spelled ${w.toUpperCase().split('').filter(c=>c!==' ').map(c=>c === "'" ? 'apostrophe' : c === '-' ? 'dash' : c).join(', ')}.`;
  }
  if (/^(?:tell me |give me |say )?(?:something (?:interesting|cool|fun|random)|a (?:fun |random |cool )?fact|(?:a )?fun fact|did you know|random fact|teach me something)(?: please| today)?$/.test(t)){ setKind('chat'); const f = pickOne(FACTS, lastFact); lastFact = f; return f; }
  if (/^(?:what(?:'s| is) )?the meaning of life$/.test(t)){ setKind('chat'); return `Forty-two, if you ask the books. I'd say good food, good people, and a budget that balances, ${S().name}.`; }
  return null;
}
const CAPITALS = {lebanon:'Beirut',france:'Paris',spain:'Madrid',italy:'Rome',germany:'Berlin',england:'London','united kingdom':'London',uk:'London','the uk':'London',britain:'London',portugal:'Lisbon',greece:'Athens',turkey:'Ankara',cyprus:'Nicosia',syria:'Damascus',jordan:'Amman',iraq:'Baghdad',iran:'Tehran',egypt:'Cairo','saudi arabia':'Riyadh',uae:'Abu Dhabi','the uae':'Abu Dhabi','united arab emirates':'Abu Dhabi','the united arab emirates':'Abu Dhabi',qatar:'Doha',kuwait:'Kuwait City',bahrain:'Manama',oman:'Muscat',yemen:'Sanaa',israel:'Jerusalem, though most countries keep their embassies in Tel Aviv',palestine:'Ramallah is the seat of government; Jerusalem is the declared capital',morocco:'Rabat',algeria:'Algiers',tunisia:'Tunis',libya:'Tripoli',sudan:'Khartoum',ethiopia:'Addis Ababa',kenya:'Nairobi',nigeria:'Abuja','south africa':'Pretoria, Cape Town and Bloemfontein',ghana:'Accra',senegal:'Dakar',russia:'Moscow',ukraine:'Kyiv',poland:'Warsaw',netherlands:'Amsterdam','the netherlands':'Amsterdam',holland:'Amsterdam',belgium:'Brussels',switzerland:'Bern',austria:'Vienna',sweden:'Stockholm',norway:'Oslo',denmark:'Copenhagen',finland:'Helsinki',ireland:'Dublin',scotland:'Edinburgh',hungary:'Budapest','czech republic':'Prague',czechia:'Prague',romania:'Bucharest',bulgaria:'Sofia',serbia:'Belgrade',croatia:'Zagreb',armenia:'Yerevan',georgia:'Tbilisi',azerbaijan:'Baku',usa:'Washington, D.C.','the usa':'Washington, D.C.','united states':'Washington, D.C.','the united states':'Washington, D.C.','the us':'Washington, D.C.',america:'Washington, D.C.',canada:'Ottawa',mexico:'Mexico City',brazil:'Brasília',argentina:'Buenos Aires',chile:'Santiago',colombia:'Bogotá',peru:'Lima',venezuela:'Caracas',cuba:'Havana',china:'Beijing',japan:'Tokyo','south korea':'Seoul','north korea':'Pyongyang',korea:'Seoul',india:'New Delhi',pakistan:'Islamabad',afghanistan:'Kabul',bangladesh:'Dhaka',indonesia:'Jakarta',malaysia:'Kuala Lumpur',singapore:'Singapore',thailand:'Bangkok',vietnam:'Hanoi',philippines:'Manila','the philippines':'Manila',australia:'Canberra','new zealand':'Wellington',armenia_:'Yerevan'};
function capitalOf(t){
  const m = t.match(/^(?:what(?:'s| is) )?(?:the )?capital (?:city )?of (.+)$|^(?:what(?:'s| is) )?(.+?)(?:'s| s) capital(?: city)?$/); if (!m) return null;
  const c = (m[1] || m[2]).replace(/^the (?=(uk|us|usa|uae|netherlands|philippines|united))/, 'the ').trim();
  const v = CAPITALS[c] || CAPITALS[c.replace(/^the /, '')]; if (!v) return null;
  setKind('feature');
  return /,|;|though| and /.test(v) ? `The capital of ${titleCase(c.replace(/^the /,'the '))} is ${v}.`.replace(/of The /, 'of the ') : `The capital of ${titleCase(c).replace(/^The /, 'the ')} is ${v}.`;
}

/* ---------- async answers ---------- */
function lateAsync(turnId, job, failText){
  const id = turnId != null ? turnId : (J.turnInfo ? J.turnInfo().seq : null);
  Promise.resolve().then(job).then(text=>{
    // nothing usable came back (e.g. the AI only offered a command we won't run): never leave "One moment…" hanging
    if (text) deliver(id, text);
    else { let f = null; try { f = typeof failText === 'function' ? failText(null) : failText; } catch(_){} deliver(id, f || "Sorry, I couldn't work that one out. Try asking it another way."); }
  }).catch(e=>{
    const off = typeof navigator !== 'undefined' && navigator.onLine === false;
    deliver(id, off ? "You're offline right now. Connect to the internet and ask me again, and I'll look it up." : (typeof failText === 'function' ? failText(e) : failText));
  });
}
function deliver(turnId, text, kind){
  try { J.addLateReply(text, {turn: turnId, speak: true, kind}); } catch(e){ try { J.addLateReply(text); J.speak(text); } catch(_){} }
  const last = mem[mem.length-1]; if (last && /^(One moment|Checking|Looking|Let me)/.test(last.reply || '')) last.reply = text;
}

/* phrasings a feature would misread ("nice weather for a walk" is not a city called A Walk): sent to the right command first */
function preRoute(t){
  if (/\b(?:weather|day|time)\b.*\bfor (?:a |an |the )?(?:walk|run|jog|hike|swim|picnic|bbq|barbecue|beach|drive|bike ride|ride|stroll)\b/.test(t) && /^(?:is|will|would|should|how|what)\b/.test(t)) return /\btomorrow\b/.test(t) ? "what's the weather tomorrow" : "what's the weather";
  if (/\b(?:weather|forecast)\b/.test(t) && /\b(?:this |the |for the )?weekend\b/.test(t) && /^(?:what|how|is|will|any)\b/.test(t) && !/\b(?:in|at) [a-z]/.test(t.replace(/\b(?:in|at) the weekend\b/, ''))) return "how's the weather looking this weekend";
  return null;
}
/** "undo that" right after logging food, water or a habit (expenses, reminders and notes are handled by edits()) */
function undoRecent(t){
  if (!/^(?:undo|scratch|cancel|delete|remove|take back|take away)(?: that| it| this| the last (?:one|thing))?(?: please)?$/.test(t) || !/\b(?:that|it|this|one|thing)\b|^undo$/.test(t)) return null;
  // the last thing logged, looking back past questions asked since ("did I read today?" ... "undo that")
  let last = null;
  for (let k = mem.length - 1; k >= Math.max(0, mem.length - 4); k--){ const x = mem[k]; if (!x || now() - x.at > 5*MIN) break; if (/^(?:did|have|how|what|what's|whats|is|are|when|where|who|which|do|does|show|read|open)\b/i.test(x.said || '') || x.kind === 'chat' || x.kind === 'fallback') continue; last = x; break; }
  if (!last) return null;
  if (mem.slice(mem.indexOf(last)).some(x=>x.entity)) return null;     // an expense, reminder or note came after: edits() handles "undo that"
  const s = lc(last.said||''), rep = lc(last.reply||'');
  if (/\bwater\b/.test(s) && /\b(?:glass|glasses|water)\b/.test(rep) && /^(?:i |log |add |\d|a |one |had |drank )/.test(s)) return J.rethink('remove a glass of water');
  if (/^logged .* calories/.test(rep)) return J.rethink('undo last food');
  if (/\b(?:streak|done for today|of \d+(?:\.\d+)? \w+\. |to go\.|all done)\b/.test(rep) && /^i |^mark |^check off |^tick off /.test(s)) return J.rethink('undo last habit');
  return null;
}
function early(said, t, depth){
  if (!t) return null;
  const turnId = J.turnInfo ? J.turnInfo().seq : null;
  let r;
  if (!depth && (r = compound(t))) return r;
  if (!depth && (r = preRoute(t))){ const out = J.rethink(r); if (out) return out; }
  if (!depth && (r = undoRecent(t))) return r;
  if ((r = edits(t, said))) return r;
  if ((r = setBirthday(t))) return r;
  if ((r = tomorrowDate(t))) return r;
  if ((r = timeAbroad(t, turnId))) return r;
  if ((r = convertUnits(t))) { setKind('feature'); return r; }
  const fq = fxParse(t);
  if (fq){
    setKind('feature');
    const c = fxCache();
    if (c && now() - c.at < 6*HOUR) return fxAnswer(fq, c);
    if (navigator.onLine === false) return c ? fxAnswer(fq, Object.assign({stale:true}, c)) : "You're offline right now, and I don't have exchange rates saved yet. Ask me again once you're connected.";
    lateAsync(turnId, async ()=>fxAnswer(fq, await getRates()), "I couldn't get exchange rates right now. Check your connection and try again.");
    return 'One moment, checking the rate…';
  }
  if ((r = calc(t))) { setKind('feature'); return r; }
  if ((r = sunTimes(t))) { setKind('feature'); return r; }
  if ((r = daysUntil(t))) { setKind('feature'); return r; }
  if ((r = games(t, said))) return r;
  if ((r = capitalOf(t))) return r;
  return null;
}

/* =========================================================
   4. Rewordings: map the many ways of saying things to commands the app knows
   ========================================================= */
const has = (t, re) => re.test(t);
function period(t){
  if (/\btoday\b|\bso far today\b|\bthis morning\b/.test(t)) return 'today';
  if (/\byesterday\b|\blast night\b/.test(t)) return 'yesterday';
  if (/\blast week\b/.test(t)) return 'last week';
  if (/\b(this|the|past|last) (week|7 days|seven days)\b|\bthis past week\b|\bweekly\b/.test(t)) return 'this week';
  if (/\b(?:last|previous|past) month\b/.test(t)) return 'last month';
  if (/\bthis year\b/.test(t)) return 'this year';
  if (/\b(this|the) month\b|\bmonthly\b|\bso far\b/.test(t)) return 'this month';
  return '';
}
const SPEND_VERB = '(?:spent|spend|spending|blown|blew|blow|burned|burnt|burn|dropped|drop|splurged|splurge|wasted|waste|forked out|shelled out|paid out|paid|pay|gone through|went through|go through|dished out|put out|laid out|used|lost|thrown away|threw away|chucked|parted with|let go of|done|did)';
const MONEY_N = '(?:money|cash|dollars|bucks|\\$|budget|funds|dough)';
const CAT_WORD = /^(?:food|foods|food and drinks?|food & drinks?|drinks?|eating out|dining(?: out)?|restaurants?|takeaway|groceries|grocery|supermarket|transport|transportation|travel|commute|bills?|utilities|subscriptions?|shopping|clothes|clothing|health|medical|healthcare|fun|entertainment|leisure|going out|other|misc|miscellaneous)$/;
function rewrite(t){
  let m;
  const p = period(t);
  const R = [];
  /* --- one thing's price: "how much did I pay for the coffee" (before the spending totals below) --- */
  if ((m = t.match(/^(?:how much|what) did i pay for (?:the |my |a |an )?([a-z][a-z &']{2,24}?)(?: today| yesterday)?$/)) && findExpense(m[1]) && !CAT_WORD.test(m[1])) return 'item:' + m[1];
  if ((m = t.match(/^(?:how much|what) did i pay for (?:the |my |a |an )?([a-z][a-z &']{2,24}?)( today| yesterday| this week| last week| this month| last month)?$/))) return `how much did I spend on ${m[1]}${m[2] || ''}`;
  /* --- "how much went on coffee last month", "how much money on transport" --- */
  if ((m = t.match(/^how much (?:money |cash )?(?:went|goes|has gone|have i put|did i put|did i drop|is going)? ?on (?:the |my )?([a-z][a-z &']{2,24}?)( today| yesterday| this week| last week| this month| last month| this year| so far)?$/))) return `how much did I spend on ${m[1]}${m[2] || ''}`;
  /* --- logging said as "log 30 for gas", "add 12 dollars for coffee" --- */
  if ((m = t.match(/^(?:log|add|record|enter|put down|note down|track)(?: an?)?(?: expense| payment| purchase)?(?: of)? (\$?\d+(?:\.\d{1,2})?\s*(?:dollars?|bucks|usd|\$)?(?:\s*(?:and\s+)?\d{1,2}\s*cents?)?)\s+(?:for|on|at)\s+(.+)$/))) return `I spent ${m[1]} on ${m[2]}`;
  /* --- spending (keeps the period and the category) --- */
  if ((m = t.match(new RegExp('^(?:how much|what)(?: money| cash)?(?: have| did| do| had)? (?:i|we)(?: really| actually| already)? '+SPEND_VERB+'(?: so far)?(?: on| for| at) (.+?)(?: '+['today','yesterday','this week','last week','this month','so far','lately','recently','in total','the week','the month'].join('| ')+')*$')))) return `how much did I spend on ${m[1].replace(/^(?:the|my)\s+/,'')}${p ? ' ' + p : ''}`;
  if (new RegExp('^(?:so )?(?:how much|how much money|how much cash|what)(?: money| cash)? (?:(?:have|did|do|had|has) )?(?:i|we)(?:\\x27ve| have)? '+SPEND_VERB+'\\b').test(t) || new RegExp('^how much (?:have|did) i '+SPEND_VERB+'$').test(t)) return `how much have I spent${p ? ' ' + p : ''}`;
  if (/^(?:what(?:'s| is| was)|how bad is|how big is|how much is|show me|give me) (?:the |my )?(?:damage|tab|bill|total|spend|outflow|burn(?: rate)?)(?: so far)?(?: for| this| last| today| yesterday| the|$)/.test(t) && !/\b(phone|electric|electricity|internet|water)\b/.test(t)) return `how much have I spent${p ? ' ' + p : ''}`;
  if (/^(?:how much|what) (?:money )?(?:went|has gone|is gone|did i lose|have i lost|left my (?:account|pocket|wallet))\b|^where (?:has|did|does|is|'s|did all) (?:all )?(?:my|the) (?:money|cash|salary|paycheck|pay) (?:go|gone|going|went)\b|^where(?:'s| is) (?:all )?my (?:money|cash|salary) (?:going|gone)\b/.test(t)) return `how much have I spent${p ? ' ' + p : ''}`;
  if (/\b(?:my|the) (?:spending|expenses|outgoings|spend)\b/.test(t) && /^(?:how(?:'s| is| are| was)|what(?:'s| is| are| were)|give me|show me|tell me|run me through|walk me through|break ?down|how do|how does|check|any update on)\b/.test(t) && !/\bbudget\b/.test(t)) return `how much have I spent${p ? ' ' + p : ''}`;
  if (/^(?:my )?(?:spending|expenses|spend|outgoings)(?: for| so far)?(?: today| yesterday| this week| last week| this month| the week| the month)$/.test(t)) return `how much have I spent${p ? ' ' + p : ''}`;
  if (/^(?:what(?:'s| is| was)|which (?:is|was)) (?:my |the )?(?:biggest|largest|highest|most expensive|priciest) (?:single )?(?:expense|purchase|payment|thing i bought|spend)(?: this month| this week| today| so far)?$/.test(t)) return 'biggest';
  if (/\b(?:breakdown|break down|split|biggest|top|largest|main|highest)\b.*\b(?:spending|spend|expenses?|categories|category|costs?|purchases?)\b|\bwhat (?:am i|have i been|did i) (?:spending|spend) (?:the )?most on\b|\bwhere (?:am i|do i|did i) spend(?:ing)? the most\b/.test(t)) return `how much have I spent${p ? ' ' + p : ''}`;
  if (/^(?:how(?:'s| is)|what(?:'s| is)) my (?:monthly )?budget (?:looking|doing|going|holding up|shaping up|at)(?: like)?(?: this month| so far)?$/.test(t)) return "how's my budget";
  if (/^(?:how(?:'s| is| are) )?(?:my )?(?:finances|money|wallet|cash|bank account|account|money situation|financial situation|finance)(?: doing| looking| holding up| situation| status)*(?: this month| today| this week)?$|^how am i doing (?:on|with|for) (?:cash|money|funds|finances|my money|the budget)( this month)?$|^how(?:'s| is) (?:the |my )?(?:money|cash|budget) situation$|^how am i doing financially$|^(?:am i|are we) (?:doing )?(?:ok|okay|good|fine|alright|well) (?:on|with|for) (?:money|cash|budget|spending|my budget)(?: this month)?$/.test(t)) return `how's my budget`;
  if (/^(?:am i|are we) (?:broke|poor|rich|over ?spending|spending too much|bleeding money|in the red|in the green)\b|^(?:did|have) i (?:go|gone|went) over\b|^(?:did|have) i (?:overspend|overspent|over spend|over spent|blow|blown|bust|busted|break|broken|exceed|exceeded) (?:my |the )?budget\b|^(?:have i|did i) (?:spent|spend) too much\b|^is my budget (?:blown|busted|gone|ok|okay|fine)\b/.test(t)) return 'am I over budget';
  if (/^(?:how much|what)(?: money| cash)? (?:do i have|have i got|is there|can i (?:still )?(?:spend|use|afford))(?: left| remaining| to spend| still)?(?: to spend)?(?: this month| for this month| for the month| for the rest of the month| until the end of the month| till payday| until payday| for the week| this week)?$|^how (?:far|close) am i (?:from|to) (?:my |the )?(?:budget|budget limit|limit|spending limit)$|^how much (?:room|space|wiggle room) (?:do i have|is) (?:left )?in (?:my |the )?budget$|^what(?:'s| is) (?:left|remaining) (?:in|of|on) (?:my |the )?(?:budget|money|month)$|^(?:what(?:'s| is) )?my remaining budget$|^how much (?:of my budget|budget) (?:is |do i have )?left$|^can i (?:still )?afford (?:anything|stuff|more|to spend)\b/.test(t)) return 'how much is left in my budget';
  if (/^can i afford (?:a |an |the |to )?(.+)$/.test(t)) return 'how much is left in my budget';
  if (/^(?:how much|what)(?: money| cash)? (?:did|have|do) i (?:make|made|earn|earned|bring in|brought in|take home|get paid|receive|received)(?: so far)?(?: this month| this year| in total| lately)?$|^(?:what(?:'s| is| was)|how much is|how much was) my (?:income|salary|pay|paycheck|earnings)(?: this month)?$|^how much (?:came|money came|has come) in\b/.test(t)) return 'how much did I make this month';
  if (/^(?:what(?:'s| is| was) )?my (?:net|net balance|net income|cash flow|cashflow|savings|balance|bottom line)(?: this month| so far| for the month)?$|^(?:how much )?(?:did|have) i (?:save|saved)(?: anything| any money| money)?(?: this month| so far)?$|^what(?:'s| is) (?:left )?after (?:my )?expenses$|^am i (?:saving|in profit|positive|net positive|cash ?flow positive)\b/.test(t)) return "what's my balance";
  if (/^(?:show|open|pull up|bring up|take me to|go to|let me see|let's see|lemme see|can i see|i want to see|display) (?:me )?(?:my |the )?(?:money|finances|spending|expenses|transactions|payments|wallet|purchases|budget|money page|money screen|money tab|budget page|budget screen)(?: page| screen| tab| list)?$/.test(t)) return 'show me my budget';
  if (/^(?:what|which) (?:did i buy|have i bought|purchases did i make|payments did i make|were my (?:last|latest|recent) (?:purchases|expenses|payments))\b|^(?:what(?:'s| was| were| are) )?my (?:last|latest|recent|most recent) (?:expense|purchase|payment|transaction|expenses|purchases|payments|transactions)$|^(?:list|read|tell me|read me|show|show me|give me) (?:my |the )?(?:recent |last |latest |newest )(?:few )?(?:expenses|purchases|payments|transactions|spending)$|^(?:list|read|tell me|read me) my (?:expenses|purchases|payments|transactions)$/.test(t)) return 'recent';
  if ((m = t.match(/^(?:how much (?:was|were|did|is)|what did|what was) (?:the |my )?([a-z][a-z &']{2,24}?)(?: cost| come to| set me back)?(?: me)?( today| yesterday| this week| last week| this month| so far)?$/)) && !/^(?:it|that|this|budget|balance|income|salary|spending|total|bill)$/.test(m[1]) && (catOf(m[1]) || findExpense(m[1]))){ const c = findExpense(m[1]) ? null : catOf(m[1]); if (!c && !m[2]) return 'item:' + m[1]; return `how much did I spend on ${c ? lc(c) : m[1]}${m[2] || ''}`; }
  if ((m = t.match(/^how much (?:did|has|have) (the |my )?([a-z][a-z &']{2,24}?) (?:cost|costed|set|come to)( me)?(?: back)?( today| yesterday| this week| last week| this month| so far)?$/)) && (m[3] || m[1] === 'my ' || catOf(m[2]) || findExpense(m[2]))){ m = [m[0], m[2], m[4]]; const c = catOf(m[1]); if (!c && !m[2] && findExpense(m[1])) return 'item:' + m[1]; return `how much did I spend on ${c ? lc(c) : m[1]}${m[2] || ''}`; }
  /* --- logging spending said another way: "I blew 20 bucks on shawarma", "lunch was 18 dollars" --- */
  if ((m = t.match(/^(?:so |and |yeah )?(?:i |we )?(?:just )?(?:blew|blown|dropped|splurged|wasted|forked out|shelled out|dished out|threw down|laid out|put down|burned|burnt|dropped|lost|gave|handed over|tipped)\s+(\$?\d+(?:\.\d{1,2})?\s*(?:dollars?|bucks|usd|\$)?(?:\s*(?:and\s+)?\d{1,2}\s*cents?)?\s+(?:on|for|at)\s+.+)$/))) return `I spent ${m[1]}`;
  if ((m = t.match(/^(?:the |my |a |an |our )?([a-z][a-z' ]{1,30}?) (?:was|cost|cost me|came to|came out to|set me back|ran me|was like|were) (?:about |around |like )?\$?(\d+(?:\.\d{1,2})?)\s*(dollars?|bucks|usd|\$)?((?:\s*(?:and\s+)?\d{1,2}\s*cents?)?)$/)) && (m[3] || /\$/.test(t) || (J.categorize && J.categorize(m[1]) !== 'Other')) && !/\b(it|that|this|temperature|weather|score|time|meeting|flight|age|he|she|they)\b/.test(m[1])) return {confirm:`I spent ${m[2]}${m[4] ? ' dollars' + m[4] : ''} on ${m[1]}`, ask:`Should I log ${money(parseFloat(m[2]) + (m[4] ? (parseInt((m[4].match(/\d+/)||['0'])[0])/100) : 0))} for ${m[1]}? Say yes and I'll add it.`};
  if ((m = t.match(/^(?:what(?:'s| is) )?(?:the )?(?:exchange|conversion|fx) rate (?:for |of |from |between )?(?:the )?([a-z]+(?: [a-z]+)?) (?:to|vs|versus|against|and|in) (?:the )?([a-z]+(?: [a-z]+)?)$/))) return `how much is 1 ${m[1]} in ${m[2]}`;
  if (/^(?:should i|do i need to|can i|is it ok to) wear (?:a |an |my )?(?:shorts|jacket|coat|sweater|hoodie|t-shirt|tshirt|scarf|boots|sandals|something warm|layers)\b/.test(t)) return /tomorrow/.test(t) ? 'do I need a jacket tomorrow' : 'do I need a jacket';
  /* --- weather --- */
  if (/\b(?:whether|weather|forecast)\b/.test(t) && /^(?:so |and )?(?:what(?:'s| is| will| does)|how(?:'s| is| does| will)|check|any|is|give|tell|get|show|whats|hows|what's)\b/.test(t) && !/\b(?:app|apps|note|notes|market|stock)\b/.test(t)){
    const where = t.match(/\b(?:in|for|at) ([a-z][a-z .'-]{1,30}?)(?: (?:today|tomorrow|now|right now|this week|this weekend|tonight))?$/);
    const placeBad = where && /^(the |my |an? |this |that )?(morning|afternoon|evening|night|tonight|today|tomorrow|week|weekend|moment|area|city|town|here|outside|rest of the day|next few days|coming days|days ahead)$/.test(where[1]);
    if (where && !placeBad) return `what's the weather in ${where[1]}${/tomorrow/.test(t) ? ' tomorrow' : ''}`;
    if (/\bweekend\b/.test(t)) return "how's the weather looking this weekend";
    if (/\btomorrow\b/.test(t)) return "what's the weather tomorrow";
    if (/\b(?:week|next few days|coming days|days ahead|this week)\b/.test(t)) return "what's the forecast";
    return "what's the weather";
  }
  if (/^(?:is|will) (?:it|today|tomorrow|this afternoon|tonight) (?:be )?(?:a )?(?:good|nice|great|ok|okay|bad) (?:day|time|weather|evening|night) (?:for|to)\b|^(?:can|should) i (?:go to the beach|go swimming|go for a (?:walk|run|hike|swim)|go hiking|sit outside|eat outside|dry (?:my )?(?:clothes|laundry))(?: today| tomorrow| later)?$/.test(t)) return /\btomorrow\b/.test(t) ? "what's the weather tomorrow" : "what's the weather";
  if (/^(?:what(?:'s| is| will be)|how(?:'s| is)) (?:the )?(?:high|low|humidity|uv|uv index|wind|windchill|feels like|real feel)(?: today| tomorrow| now| like)?$|^how (?:humid|windy|sunny) (?:is it|will it be|is it going to be)(?: today| tomorrow| outside)?$/.test(t)) return /\btomorrow\b/.test(t) ? "what's the weather tomorrow" : "what's the weather";
  if (/^(?:do i|should i|will i|would i|am i going to|i'?m going to|gonna) (?:need|want|have to|take|bring|grab|carry)(?: to (?:take|bring|grab|carry))? (?:an? |my |some )?(?:umbrella|brolly|raincoat|rain jacket|rain coat)\b|\b(?:umbrella|raincoat) (?:today|tomorrow|weather)\b|^(?:is|will) it (?:gonna |going to )?(?:be )?(?:wet|stormy|pouring|showery|drizzly)\b|^(?:any|is there any|will there be any|is there|chance of|what are the chances of|what's the chance of) (?:rain|showers|storms?|thunder(?:storms?)?|snow)\b|^(?:is it|will it be) (?:a )?(?:rainy|wet) day\b/.test(t)) return /\btomorrow\b/.test(t) ? 'will it rain tomorrow' : 'will it rain today';
  if (/^(?:how(?:'s| is| does)|what(?:'s| is)) (?:it )?(?:looking |like )?(?:outside|out there|out)(?: looking| like)?(?: today| now| right now| this morning)?$|^(?:what(?:'s| is) it like|how(?:'s| is) it) (?:out(?:side)?|out there)\b|^(?:is it|is the weather) (?:nice|good|bad|ok|okay|decent|pleasant|beautiful|lovely|gloomy|grey|gray) (?:out|outside|today|out there)\b|^(?:what(?:'s| is) )?the (?:temp|temperature|degrees)(?: outside| out| now| right now)?$|^how many degrees(?: is it)?(?: outside| out| now| today)?$|^(?:is it|will it be|is it going to be|is it gonna be) (?:beach|shorts|t-?shirt|sweater|hoodie|coat|jacket) weather\b|^(?:what should i|what do i|how should i) (?:wear|dress|put on)(?: for| today| tomorrow| outside|$)|^(?:is it|will it be) (?:sunny|cloudy|windy|foggy|humid|hot|cold|chilly|freezing|warm|nice|boiling|scorching)\b/.test(t)) return /\btomorrow\b/.test(t) ? "what's the weather tomorrow" : /\bwear|dress|put on|jacket|coat|sweater|hoodie\b/.test(t) ? 'what should I wear today' : "what's the weather";
  /* --- the day / brief --- */
  if (/^(?:what(?:'s| is| does)|how(?:'s| is| does)) (?:my |the )?(?:day|today|morning|schedule today|day today) (?:look|looks|looking|shaping up|seem|seems)(?: like)?(?: today)?$|^(?:what(?:'s| is)|what have i got|what do i have) (?:on )?(?:the |my )?(?:agenda|plate|docket|cards|menu|program|programme)(?: for)?(?: today)?$|^(?:what(?:'s| is)|what have i got|what do i have) (?:on|going on|happening|planned|lined up)(?: for)?(?: today| this morning)?$|^(?:anything|is there anything|stuff|things?) (?:i (?:need|have|got|should|gotta|must) (?:to )?(?:do|know|remember|handle|take care of)|(?:to do|happening|going on|on)) (?:today|this morning)$|^(?:what(?:'s| is)|any) (?:the )?(?:plan|update|updates|news) (?:for |on )?(?:today|my day|the day)$|^(?:fill|catch|bring|get) me (?:in|up)(?: to speed)?(?: on (?:today|my day|everything))?$|^(?:what(?:'s| is) )?(?:the )?(?:rundown|run down|lowdown|low down|scoop|tldr|summary|overview|update)(?: for today| of today| on today| of my day)?$|^(?:what did i miss|what's new|whats new|what's going on|what is going on|what's happening|what is happening|what's the story|what's the deal today)$|^(?:start|begin|kick off) (?:my|the) day$|^(?:give me|tell me|read me|run me through|walk me through|talk me through|take me through) (?:the |my |a )?(?:rundown|run down|lowdown|summary|overview|recap|day|today|morning)(?: for today| of today| of my day| on today)?$|^(?:run|walk|talk|take) me through (?:today|my day|the day)$|^(?:good morning )?what(?:'s| is) (?:up|on) (?:for )?today$|^(?:morning|daily) (?:update|summary|rundown|report|recap)$|^(?:what do i need to know|what should i know)(?: today| this morning| for today)?$|^(?:what(?:'s| is)) (?:the )?(?:situation|status|state of play|state of things|word|latest)(?: today| this morning| for today)?$|^(?:what(?:'s| is)|so what(?:'s| is)) (?:the|my|our) (?:plan|game plan|agenda)$/.test(t)) return 'brief me';
  if (/^(?:what(?:'s| is)|what have i got|what do i have|anything|is there anything) (?:on|going on|happening|planned|lined up) (?:for )?tomorrow$|^(?:how(?:'s| is| does)|what(?:'s| is| does)) tomorrow (?:look|looking|shaping up)(?: like)?$|^(?:what(?:'s| is) )?(?:the )?plan for tomorrow$|^(?:prep|get) me (?:ready )?for tomorrow$/.test(t)) return 'what does my day look like tomorrow';
  /* --- reminders, to-dos --- */
  if (/^(?:what|anything|is there anything|stuff|things?) (?:do i |have i |i )?(?:need|have|got|gotta|must|should) (?:to )?(?:do|remember|take care of|handle|get done)(?: today| tonight| later| this week| soon)?$|^(?:what(?:'s| is| are)) (?:on )?my (?:to ?do(?:s| list)?|to-do(?:s| list)?|tasks?|task list|list|chores|errands)(?: for today| today)?$|^(?:read|show|open|check|list) (?:me )?my (?:to ?do(?:s| list)?|to-do(?:s| list)?|tasks?|task list|errands)$|^(?:did i forget|am i forgetting|have i forgotten) (?:anything|something)\b|^(?:what(?:'s| is)|any) (?:pending|due|overdue)\b|^(?:what(?:'s| is| are)) (?:my )?(?:upcoming|next|pending) (?:reminders?|tasks?|things?)$|^(?:what (?:did|have) i (?:ask|asked|tell|told) you to remind me(?: about| of)?)$|^(?:what are you|what were you) (?:supposed to )?remind(?:ing)? me (?:about|of)$|^what (?:am i|was i) (?:supposed|meant) to (?:do|be doing)(?: today| now| this week| tomorrow)?$/.test(t)) return 'what are my reminders';
  /* --- notes --- */
  if (/^(?:what(?:'s| is| did i| have i)) (?:in|on) my notes|^(?:what(?:'s| was)|read me) my (?:last|latest|recent|newest) notes?$|^(?:what did i|what have i) (?:write|written|note|noted|save|saved) (?:down|in my notes)?$|^(?:show|open|pull up|bring up|check|go to|take me to) (?:me )?(?:my |the )?notes(?: page| screen| tab)?$|^(?:do i have|have i got|any) (?:any )?notes\b/.test(t)) return 'read my notes';
  /* --- food --- */
  if (/^(?:how(?:'s| is| am)) (?:my |i )?(?:diet|eating|calories|calorie intake|food|nutrition|macros)(?: doing| going| looking| today)*$|^how(?:'s| is) my (?:calorie|food|diet|nutrition) (?:goal|count|intake|tracking|diary|log)(?: today| looking| going)*$|^(?:how much|how many calories) (?:have i|did i) (?:eaten|eat|had|have|consumed|consume|taken in)(?: so far)?(?: today)?$|^(?:what(?:'s| is)) my (?:calorie (?:count|total|intake)|intake|food intake)(?: today| so far)?$|^(?:how many|how much) (?:cals|kcals?|calories) (?:am i at|have i got|so far|do i have)(?: today| so far)?$|^(?:where am i at|where am i) (?:on|with) (?:calories|food|my diet|my calories)(?: today)?$|^am i (?:on track|doing ok|doing okay|doing good) (?:with|on) (?:my )?(?:calories|diet|food|eating)(?: today)?$/.test(t)) return 'how many calories today';
  if (/^(?:how many|how much) (?:more )?(?:calories|cals) (?:can i (?:still )?(?:eat|have)|are left|left|remaining|do i have left|to go)(?: today| for today)?$|^(?:can i (?:still )?(?:eat|have) (?:more|something|a snack|dessert|anything))(?: today| tonight)?$|^(?:am i|have i gone) over (?:my )?(?:calories|calorie goal|calorie limit)\b/.test(t)) return 'how many calories do I have left';
  if (/^(?:what|what all) (?:have i|did i) (?:eaten|eat|had|have)(?: so far)?(?: today| for (?:breakfast|lunch|dinner))?$|^(?:what(?:'s| is)) in my (?:food )?(?:diary|log)(?: today)?$|^(?:show|read|list) (?:me )?(?:what i ate|my meals|my food log|today'?s meals)(?: today)?$/.test(t)) return 'what did I eat today';
  if (/^(?:how much|how many (?:glasses|cups|bottles|liters|litres)(?: of)?) (?:water )?(?:have i|did i) (?:drink|drunk|drank|had|have)(?: water)?(?: so far)?(?: today)?$|^(?:am i|have i been) (?:drinking enough|hydrated|staying hydrated|dehydrated)\b|^(?:how(?:'s| is)) my (?:water|hydration)(?: intake| today| goal| doing)*$|^(?:what(?:'s| is)) my water(?: intake| count| total)?(?: today)?$/.test(t)) return 'how much water have I had';
  if (/^(?:how much|how many grams of) (protein|carbs|carbohydrates|fat|fats|fiber|fibre|sugar)(?: have i| did i)(?: had| eaten| have| eat| got)?(?: so far)?(?: today)?$|^(?:what(?:'s| is| are)|how(?:'s| is| are)) my (protein|carbs|fat|fiber|sugar|macros)(?: intake| count| today| at| looking)*$/.test(t)){ const w = (t.match(/\b(protein|carbs|carbohydrates|fats?|fiber|fibre|sugar|macros)\b/)||[])[1] || 'protein'; return /^(?:fiber|fibre|sugar|macros)$/.test(w) ? 'how many calories today' : `how much ${w === 'carbohydrates' ? 'carbs' : /^fat/.test(w) ? 'fat' : w} have I had`; }
  if (/^(?:what|wat) (?:should|can|could|do) i (?:eat|have|cook|make|grab|order)(?: for| now| tonight| today|$)|^(?:what(?:'s| is)|any) (?:good )?(?:idea|ideas|suggestion|suggestions) for (?:lunch|dinner|breakfast|a snack|food|a meal)\b|^(?:suggest|recommend) (?:a |me a |some |me some )?(?:meal|food|snack|dinner|lunch|breakfast|something to eat)\b|^(?:i(?:'m| am) )?(?:hungry|starving|peckish) (?:what|any) (?:should|ideas?|suggestions?)\b|^(?:what(?:'s| is) )?(?:for )?(?:dinner|lunch) (?:tonight|today)$|^(?:what(?:'s| is)|what are) (?:a |some )?(?:healthy|good|light|quick|easy|low ?cal(?:orie)?) (?:option|options|idea|ideas|thing|things|food|meal|choice|choices)?\s*(?:for|to eat for|to have for|to make for) (?:breakfast|lunch|dinner|a snack)$|^(?:what(?:'s| is)) (?:a )?(?:healthy|good|light|quick) (?:breakfast|lunch|dinner|snack)$/.test(t)){ const meal = (t.match(/\b(breakfast|lunch|dinner)\b/) || [])[1]; return meal ? `what should I eat for ${meal}` : 'what should I eat'; }
  /* --- habits and goals --- */
  if (/^(?:how(?:'s| is| are| am i)) (?:my |i )?(?:habits|habit tracker|routines?|streaks?|daily habits)(?: doing| going| looking| holding up| today| this week)*$|^(?:how am i doing|am i doing (?:ok|okay|good|well)|am i on track) (?:on|with) (?:my )?(?:habits|routines?|streaks?)(?: today| this week)?$|^(?:did i|have i) (?:do|done|did|finish|finished|complete|completed|miss|missed) (?:all )?(?:my |any )?(?:habits|routines?)(?: today| yet)?$|^(?:what|which) habits? (?:do i (?:still )?have(?: left)?|are (?:left|remaining|still left|done|due)|did i (?:miss|skip|do))(?: today| for today)?$|^(?:what(?:'s| is)) left (?:to do )?(?:on|in|for) my habits(?: today)?$/.test(t)) return /\b(left|remaining|still|due)\b/.test(t) ? 'what habits are left today' : 'how are my habits going';
  if (/^(?:how(?:'s| is| are)) (?:my |the )?(?:goals?|savings? goals?|targets?|savings|progress)(?: doing| going| looking| coming along| progressing)*$|^(?:am i|are we) (?:on track|on target|on schedule|getting closer|close) (?:with|for|to|on) (?:my |the )?(?:goals?|savings?|target)\b|^(?:how close am i|how far am i|how much (?:more )?do i need) (?:to|from|for|until) (?:my |the )?(?:goals?|savings? goal|target)\b/.test(t)) return 'how are my goals going';
  if (/^(?:how long|how many days) (?:is|has been|have i (?:kept|had|been on)) my (?:streak|streaks)\b|^(?:what(?:'s| is)) my (?:longest|best|current) streak$|^(?:how(?:'s| is)) my streak(?: going| doing| looking)*$/.test(t)) return "what's my streak";
  /* --- markets --- */
  if (/^(?:how(?:'s| is| are| did| were)|what(?:'s| is| are)) (?:the )?(?:markets?|stocks?|stock market|wall street|indices|indexes|equities|s&p|s and p)(?: doing| looking| up to| today| like| going| trading| behaving)*(?: today)?$|^(?:what(?:'s| is)) (?:going on|happening|new|up) (?:in|with|on) (?:the )?(?:markets?|stock market|stocks|wall street)(?: today)?$|^what (?:happened|went on) (?:in|on|with) (?:the )?(?:markets?|stock market|stocks|wall street)(?: today| yesterday| this week)?$|^(?:are|is) (?:the )?(?:markets?|stocks|stock market|wall street) (?:up|down|green|red|crashing|rallying|tanking|mooning|ok|okay)(?: today)?$|^(?:any|what(?:'s| is| are) the) (?:big )?(?:movers|market movers|winners|losers)(?: today)?$|^(?:give me|tell me|what(?:'s| is)) (?:a |the )?(?:quick )?(?:market|markets|stock) (?:check|pulse|snapshot|picture|wrap|overview|summary|recap)$|^(?:check|show|open) (?:the )?(?:markets?|stocks)(?: for me)?$|^market (?:check|pulse|snapshot|wrap|overview|summary|recap|report)$/.test(t)) return "how's the market";
  if (/^(?:what(?:'s| is| are)|any|is there any|give me|read me|tell me|show me) (?:the )?(?:latest |top |big |breaking |today's )?(?:(?:financial|finance|business|economic|economy|money|stock) )?(?:news|headlines|stories)(?: today| this morning)?$|^(?:what(?:'s| is)) (?:the )?(?:news|headlines) (?:today|this morning)$|^(?:the )?(?:headlines|news headlines)$|^(?:what(?:'s| is)) in the news(?: today)?$|^(?:any|what) (?:news|headlines)(?: today)?$/.test(t)) return 'market news';
  if (/^(?:how(?:'s| is| are)) (?:my )?(?:portfolio|investments?|stocks|positions|holdings|shares)(?: doing| looking| today| going)*$|^(?:what(?:'s| is)) (?:on )?my (?:watch ?list|stocks|portfolio)$|^(?:how(?:'s| is)) my (?:watch ?list)(?: doing| looking| today)*$/.test(t)) return "how's my watchlist";
  if (/^(?:what(?:'s| is)) (?:happening|coming up|on) (?:in|on) (?:the )?(?:economy|economic calendar|econ calendar)(?: this week| today)?$|^(?:any|what) (?:big |major |important )?(?:economic|macro) (?:news|data|events|numbers|releases)(?: this week| today| coming up)?$|^(?:when(?:'s| is)) (?:the )?(?:next )?(?:inflation|interest rate|rate) (?:report|number|data|decision|announcement|cut|hike)$/.test(t)) return /inflation/.test(t) ? 'when is CPI' : /rate/.test(t) ? "when's the next Fed meeting" : "what's on the economic calendar";
  if (/^(?:how(?:'s| is| are)|what(?:'s| is| are)) (?:the )?(?:crypto|cryptos|cryptocurrency|cryptocurrencies|crypto market|coins)(?: doing| looking| today| at)*$/.test(t)) return "how's bitcoin doing";
  if ((m = t.match(/^(?:is|are|did|has|have) (?:the )?([a-z][a-z0-9&. ]{1,24}?)(?: stock| shares| price)? (?:up|down|green|red|going up|going down|go up|go down|gone up|gone down|rising|falling|dropping|rallying|crashing|gain|gained|drop|dropped|fall|fell|rise|rose)(?: or (?:up|down))?(?: today| this week| at all)?$/)) && !/^(?:it|i|you|we|they|he|she|my day|the weather|the temperature)$/.test(m[1])){ const x = m[1]; return /^(?:markets?|stock market|stocks|wall street|the market)$/.test(x) ? "how's the market" : `how's ${x} doing`; }
  if ((m = t.match(/^(?:what(?:'s| is)|how(?:'s| is| are)) (?:the )?(?:price of |value of )?(bitcoin|btc|ethereum|eth|gold|silver|oil|crude|crude oil|brent)(?: price| doing| at| trading at| worth| today| now| right now| looking)*$|^(?:how much is|what(?:'s| is)) (?:a |one )?(bitcoin|btc|ethereum|eth|ounce of gold|barrel of oil)(?: worth| going for| today| now)*$/))) return `how's ${(m[1]||m[2]).replace(/^ounce of /,'').replace(/^barrel of /,'')} doing`;
  /* --- calendar and alarms --- */
  if (/^(?:what(?:'s| is)|what are) (?:my )?(?:meetings?|events?|appointments?)(?: today| for today)?$|^(?:do i have|have i got|any|is there) (?:any )?(?:meetings?|events?|appointments?|calls?)(?: today| this morning| this afternoon)?$|^(?:am i|are we) (?:meeting|seeing) (?:anyone|anybody|someone)(?: today)?$|^(?:what(?:'s| is)) on (?:the |my )?(?:calendar|schedule|diary)(?: today)?$/.test(t)) return /tomorrow/.test(t) ? "what's on my calendar tomorrow" : "what's on my calendar today";
  if (/^(?:what(?:'s| is)|any|do i have) (?:my )?(?:meetings?|events?|appointments?|plans) (?:for )?(tomorrow|this week|next week|this weekend|on \w+day)$|^(?:what(?:'s| is)) on (?:the |my )?(?:calendar|schedule|diary) (?:for )?(tomorrow|this week|next week|this weekend)$/.test(t)) return `what's on my calendar ${t.match(/(tomorrow|this week|next week|this weekend|on \w+day)$/)[1]}`;
  if ((m = t.match(/^do i have (?:time|a minute|a sec|an hour|space|room) (?:for|to) .+?(?: (today|tomorrow|tonight|this afternoon|this morning|this evening|this weekend|on \w+day))?$/))) return `am I free ${m[1] || 'today'}`;
  if ((m = t.match(/^(?:what(?:'s| is)|anything|is there anything) (?:on|happening|going on|planned) (?:for )?(this weekend|the weekend|next week|this week|next weekend|on \w+day|\w+day)$/))) return `what's on my calendar ${m[1].replace(/^the /, 'this ')}`;
  if (/^(?:when(?:'s| is)|what time is|what(?:'s| is)) (?:my )?(?:next|first|upcoming) (?:call|meeting|event|appointment|thing)\b|^(?:what(?:'s| is)) (?:up )?next$|^(?:what(?:'s| is)) (?:coming up )?next on (?:my )?(?:calendar|schedule|agenda)$/.test(t)) return 'when is my next meeting';
  if (/^(?:what time (?:is|does) my alarm|when (?:will|does) my alarm|is my alarm (?:set|on)|did i set (?:an|my) alarm|what alarms? (?:have i|do i have)|have i got (?:an|any) alarms?|show (?:me )?(?:my )?alarms?|any alarms?)\b/.test(t)) return 'what alarms do I have';
  /* --- receipts --- */
  if (/^(?:scan|snap|photograph|read|capture|upload|add|log) (?:a |my |the |this |another )?(?:receipt|bill|invoice)s?\b|^(?:take|snap) a (?:photo|picture|pic) of (?:a |my |the |this )?(?:receipt|bill)$/.test(t)) return 'scan a receipt';
  if (/^(?:show|open|see|check|where are|pull up) (?:me )?(?:my |the )?(?:receipts?|scanned receipts|bills)(?: page| screen| tab)?$/.test(t)) return 'show me my receipts';
  /* --- settings --- */
  if (/^(?:open|show|go to|take me to|change|adjust|edit) (?:the |my )?(?:settings|preferences|options|setup|set up|configuration|config)(?: page| screen| menu)?$|^(?:where(?:'s| are| is)) (?:the )?(?:settings|preferences)$/.test(t)) return 'open settings';
  if (/^(?:turn on|switch to|enable|use|go|make it|put it in|change to) (?:the )?(?:dark|night)(?: mode| theme| side)?$/.test(t)) return 'dark mode';
  if (/^(?:turn on|switch to|enable|use|go|make it|put it in|change to) (?:the )?(?:light|day|bright|white)(?: mode| theme)?$|^turn off (?:the )?dark (?:mode|theme)$/.test(t)) return 'light mode';
  /* --- health (Builder C's health.js answers these when your iPhone is synced) --- */
  if (/^(?:how many|how much|what(?:'s| is| are)) (?:my )?(?:steps|step count|walking|kilometers walked|distance walked)(?: today| so far| have i done| did i do| have i walked| did i walk| am i at)*(?: today)?$|^(?:have i|did i) (?:walk(?:ed)?|move[d]?) (?:enough|much|a lot)(?: today)?$|^(?:how far|how much) (?:have i|did i) (?:walk(?:ed)?|move[d]?)(?: today)?$/.test(t)) return 'how many steps today';
  if (/^(?:how (?:did|well did|long did|much did) i sleep|how (?:was|is) my sleep|how many hours (?:did i|have i) sleep|did i (?:sleep|get) (?:well|enough|good)(?: sleep)?|what(?:'s| is| was) my sleep(?: score| like)?)(?: last night| yesterday)?$/.test(t)) return 'how did I sleep';
  if (/^(?:what(?:'s| is| was)|how(?:'s| is)) my (?:resting )?(?:heart ?rate|pulse|bpm|heart)(?: today| now| like| at)*$/.test(t)) return "what's my heart rate";
  if (/^(?:how much (?:do|did) i weigh|what(?:'s| is| was) my (?:weight|current weight|latest weight)|how heavy am i)(?: now| today| this week)?$/.test(t)) return 'what is my weight';
  return null;
}
/* A keyword vote, for anything the rules above did not catch: "give me a spending update", "anything due today".
   Each area scores the words heard; a clear winner (score 2 or more, ahead of the rest) is answered with that area's command. */
const AREAS = [
  {id:'overspend', w:[[/\b(?:overspen[dt]|over ?budget|over my budget|under budget|within budget|blown? (?:my|the) budget|too much)\b/, 3], [/\b(?:budget|spend|spent|spending)\b/, 1]], cmd:()=>'am I over budget'},
  {id:'left', w:[[/\b(?:left|remaining|remain|still have|afford)\b/, 1.5], [/\b(?:money|budget|cash|spend|month)\b/, 1]], need:/\b(?:money|budget|cash|spend|afford)\b|\bleft (?:this|for the) month\b|remaining for the month/, cmd:()=>'how much is left in my budget'},
  {id:'spend', w:[[/\b(?:spend|spent|spending|expenses?|outgoings|purchases?|bought|cost me|costs|blew|blown|money went|paid for)\b/, 2], [/\b(?:money|cash|dollars|bucks|update|total|summary|breakdown)\b/, 0.5]], cmd:(t,p)=>{ const c = t.match(/\b(?:on|for|at) ([a-z][a-z &']{2,24}?)(?: today| yesterday| this week| last week| this month| so far)?$/); return c && catOf(c[1].replace(/^(?:the|my)\s+/, '')) ? `how much did I spend on ${c[1].replace(/^(?:the|my)\s+/, '')}${p ? ' ' + p : ''}` : `how much have I spent${p ? ' ' + p : ''}`; }},
  {id:'income', w:[[/\b(?:income|earn|earned|earnings|salary|paycheck|pay ?check|made|got paid|came in)\b/, 2]], cmd:()=>'how much did I make this month'},
  {id:'reminders', w:[[/\b(?:reminders?|remind|due|to ?do|to-do|todos|tasks?|errands?|supposed to|need to do|have to do|got to do|chores)\b/, 2], [/\b(?:today|later|tonight|anything|something|pending)\b/, 0.5]], cmd:()=>'what are my reminders'},
  {id:'calendar', w:[[/\b(?:meetings?|appointments?|calendar|schedule|events?|busy|calls)\b/, 2], [/\b(?:today|tomorrow|this week|afternoon|morning)\b/, 0.5]], cmd:(t)=>/\bnext\b/.test(t) ? 'when is my next meeting' : `what's on my calendar ${/\btomorrow\b/.test(t) ? 'tomorrow' : /\bweek\b/.test(t) ? 'this week' : 'today'}`},
  {id:'protein', w:[[/\b(?:protein|carbs?|carbohydrates|fats?|fibre|fiber|sugar|macros?)\b/, 3]], cmd:t=>{ const w = (t.match(/\b(protein|carbs?|carbohydrates|fats?)\b/)||[])[1]; return w ? `how much ${/^carb/.test(w) ? 'carbs' : /^fat/.test(w) ? 'fat' : 'protein'} have I had` : 'how many calories today'; }},
  {id:'water', w:[[/\b(?:water|hydrated|hydration|glasses)\b/, 2.5], [/\b(?:drink|drank|drunk|enough)\b/, 0.5]], cmd:()=>'how much water have I had'},
  {id:'food', w:[[/\b(?:calories|cals|kcal|calorie|diet|food|meals?|eaten|ate|eat|eating|nutrition)\b/, 2]], cmd:()=>'how many calories today'},
  {id:'goals', w:[[/\b(?:goals?|savings goal|savings|targets?|saving for)\b/, 2.5], [/\b(?:progress|track|close|far)\b/, 0.5]], cmd:()=>'how are my goals going'},
  {id:'habits', w:[[/\b(?:habits?|routines?|streaks?|in a row|worked out|workouts?|work out|meditat\w*|gym)\b/, 2], [/\b(?:days|progress|today|done)\b/, 0.5]], cmd:(t)=>/\b(?:streak|in a row)\b/.test(t) ? "what's my streak" : 'how are my habits going'},
  {id:'markets', w:[[/\b(?:markets?|stocks?|shares|nasdaq|dow|s&p|wall street|portfolio|investments?|equities)\b/, 2], [/\b(?:today|up|down|happened|doing|green|red)\b/, 0.5]], cmd:(t)=>/\b(?:portfolio|investments?|my stocks|watchlist)\b/.test(t) ? "how's my watchlist" : "how's the market"},
  {id:'notes', w:[[/\bnotes\b/, 2]], cmd:()=>'read my notes'},
  {id:'receipts', w:[[/\breceipts?\b/, 2.5]], cmd:()=>'show me my receipts'},
  {id:'brief', w:[[/\b(?:my day|the day|today's plan|heads up|rundown|briefing|brief)\b/, 2]], cmd:()=>'brief me'}
];
function classify(t){
  if (t.split(' ').length > 16) return null;
  if (/^(?:call|phone|ring|text|message|send|email|play|open|launch|order|book|navigate|drive|turn|switch|take|set|make|buy|find|search|start|stop|cancel|delete|remove|add|put|move|change|write|note|remind|tell (?!me)|ask|pay|transfer)\b/.test(t)) return null;
  if (!/^(?:what|what's|whats|how|how's|hows|when|where|which|is|are|am|do|does|did|have|has|can|could|give|tell|show|any|anything|read|check|update|total)\b/.test(t) && (t.split(' ').length > 5 || /^(?:i|i'm|im|my|we|it|that|this|the)\b/.test(t))) return null;
  const scores = AREAS.map(a=>{ let sc = 0; for (const [re, w] of a.w) if (re.test(t)) sc += w; if (a.need && !a.need.test(t)) sc = 0; return {a, sc}; }).sort((x,y)=>y.sc-x.sc);
  const top = scores[0], second = scores[1];
  if (!top || top.sc < 2 || (second && second.sc >= top.sc && !(top.a.id === 'overspend' || top.a.id === 'left'))) return null;
  return top.a.cmd(t, period(t));
}
/* follow-ups: "what about tomorrow?", "and this week?", "how about Paris?" */
function followUp(t){
  // "how much is 100 dollars in lira?" … "and in euros?" / "what about 500?"
  const lm = mem[mem.length-1];
  if (lm && now() - lm.at < 4*MIN){
    const fm = t.match(/^(?:and |but |ok |okay |so )?(?:what about|how about|and|and what about|same for|now)\s+(?:in |to |into )?(.+?)$/);
    let pq = null; try { pq = fm && fxParse(lc(lm.said)); } catch(e){}
    if (pq){
      const x = fm[1].trim();
      const cands = /^\$?\d/.test(x) ? [`how much is ${x}${/[a-z]/.test(x.replace(/^\$?[\d.,]+\s*/, '')) ? '' : ' ' + pq.from} in ${pq.to}`] : [`how much is ${pq.n} ${pq.from} in ${x}`];
      for (const c of cands){ try { if (fxParse(lc(c))) return c; } catch(e){} }
    }
  }
  if (lm && now() - lm.at < 4*MIN && /\btime\b.*\bin [a-z]/.test(lc(lm.said))){
    const fm2 = t.match(/^(?:and |but |ok |okay |so )?(?:what about|how about|and|and what about|same for|now)\s+(?:in |for )?([a-z][a-z .'-]{1,30})$/);
    if (fm2 && !/\b(?:tomorrow|today|tonight|week|month|it|that|this)\b/.test(fm2[1])) return `what time is it in ${fm2[1].trim()}`;
  }
  if (!fresh(lastDomain, 4*MIN)) return null;
  const m = t.match(/^(?:and |but |ok |okay |so )?(?:what about|how about|and|what of|and for|and what about|same for|and how about|now|ok and|okay and)\s+(.+?)$/) || t.match(/^(tomorrow|today|tonight|this week|last week|yesterday|this weekend|next week|this month)$/);
  if (!m) return null;
  const x = m[1].replace(/^(?:for |in |on )/, '').trim();
  const d = lastDomain.domain, prev = lastDomain.said;
  const tw = /^(today|tomorrow|tonight|yesterday|this week|last week|next week|this weekend|the weekend|this month|last month)$/.test(x) ? x : null;
  if (d === 'weather'){
    if (tw === 'tomorrow') return /\b(rain|umbrella)\b/.test(prev) ? 'will it rain tomorrow' : "what's the weather tomorrow";
    if (tw === 'today' || tw === 'tonight') return /\b(rain|umbrella)\b/.test(prev) ? 'will it rain today' : "what's the weather today";
    if (tw === 'this weekend' || tw === 'the weekend') return "how's the weather looking this weekend";
    if (tw === 'this week' || tw === 'next week') return "what's the forecast";
    if (!tw && /^[a-z][a-z .'-]{1,30}$/.test(x) && x.split(' ').length <= 3 && !/\b(it|that|this|me|you|money|spending|food|calories)\b/.test(x)) return `what's the weather in ${x}`;
  }
  if (d === 'spending'){
    if (tw && tw !== 'tomorrow' && tw !== 'next week' && tw !== 'tonight'){ const c = prev.match(/\bon ([a-z &]+?)(?: today| yesterday| this week| last week| this month)?$/); return c ? `how much did I spend on ${c[1]} ${tw}` : `how much have I spent ${tw}`; }
    if (!tw && /^(?:on )?([a-z &]{3,24})$/.test(x) && catOf(x.replace(/^on /,''))) return `how much did I spend on ${x.replace(/^on /,'')}${period(prev) ? ' ' + period(prev) : ''}`;
  }
  if (d === 'calendar' && tw) return `what's on my calendar ${tw}`;
  if (d === 'brief' && tw === 'tomorrow') return 'what does my day look like tomorrow';
  if (d === 'food' && /^(protein|carbs|fat|fiber|sugar|water)$/.test(x)) return x === 'water' ? 'how much water have I had' : `how much ${x} have I had`;
  if (d === 'markets' && !tw && /^[a-z0-9&. -]{2,24}$/.test(x)) return `how's ${x} doing`;
  return null;
}
/* "what's the weather and what's on my calendar": two requests in one breath */
const START1 = /^(?:what|what's|whats|how|how's|hows|when|when's|where|where's|who|is|are|am i|do i|does|did i|can i|will it|should i|remind me|set (?:a|an|my)|wake me|log|i spent|spent|paid|i paid|brief me|give me|tell me|show me|check|read|open|any|add|i ate|i had|i drank|turn|switch|delete|change|move)\b/;
const START2 = /^(?:what|what's|whats|how|how's|hows|when|when's|where's|is it|is the|are the|are my|am i|do i|did i|will it|should i|remind me|set (?:a|an|my)|wake me|log|i spent|spent|i paid|brief me|show me|check|read me|read my|open|any|give me|tell me)\b/;
function splitParts(t){
  if (!/\b(?:and|also|plus|then)\b/.test(t) || t.split(' ').length > 32) return null;
  const bits = t.split(/\s+(and then|and also|and after that|and|also|plus|then)\s+/);
  const parts = []; let cur = bits[0];
  for (let k = 1; k < bits.length; k += 2){ const sep = bits[k], txt = bits[k+1] || ''; if (START2.test(txt)){ parts.push(cur); cur = txt; } else cur += ' ' + sep + ' ' + txt; }
  parts.push(cur);
  if (parts.length < 2 || parts.length > 4 || !START1.test(parts[0])) return null;
  return parts.map(x=>x.trim()).filter(Boolean);
}
function compound(t){
  const parts = splitParts(t); if (!parts) return null;
  const out = []; let missed = null;
  for (const p of parts){
    let r = null;
    try { r = J.rethink(p); } catch(e){ r = null; }
    if (!r){ let rw = rewrite(p); if (rw && typeof rw === 'object') rw = null; if (rw === 'recent' || rw === 'biggest' || /^item:/.test(rw||'')) r = special(rw, p); else if (rw) try { r = J.rethink(rw); } catch(e){} }
    if (!r){ if (!out.length) return null; missed = p; continue; }
    out.push(r);
  }
  setKind('feature');
  return out.join(' ') + (missed ? ` I didn't catch the part about ${missed.split(' ').slice(0, 6).join(' ')}.` : '');
}
/** what a cost question said about one thing: "how much was my coffee" -> the last coffee, and this month's coffee total */
function itemCost(word){
  const e = findExpense(word); if (!e) return null;
  try { J.go('budget'); } catch(_){}
  const w = lc(word).replace(/^(?:the|my|a|an)\s+/, '').replace(/(?:es|s)$/, '');
  const m0 = new Date(); m0.setDate(1); m0.setHours(0,0,0,0);
  const same = (db().expenses||[]).filter(x=>x.type==='expense' && x.at >= +m0 && lc(x.desc).includes(w));
  const when = J.whenSpoken ? J.whenSpoken(e.at) : J.whenText(e.at), d = lc(e.desc), pl = /[^s]s$/.test(d);
  return `Your last ${d} ${pl ? 'were' : 'was'} ${money(e.amount)}, ${when}.` + (same.length > 1 ? ` This month ${d} ${pl ? 'add' : 'adds'} up to ${money(same.reduce((s,x)=>s+x.amount,0))} over ${same.length} payments.` : '');
}
function special(c, t){ if (c === 'recent') return recentExpenses(); if (c === 'biggest') return biggestExpense(t); if (typeof c === 'string' && c.indexOf('item:') === 0) return itemCost(c.slice(5)); return null; }
function recentExpenses(){
  const list = (db().expenses||[]).filter(e=>e.type==='expense').sort((a,b)=>b.at-a.at).slice(0,3);
  try { J.go('budget'); } catch(e){}
  if (!list.length) return 'No expenses logged yet. Say, for example: I spent 20 on lunch.';
  return 'Your latest: ' + list.map(e=>`${money(e.amount)} for ${lc(e.desc)}, ${J.whenSpoken ? J.whenSpoken(e.at) : J.whenText(e.at)}`).join('; ') + '.';
}
function biggestExpense(t){
  const from = /\bweek\b/.test(t) ? (()=>{ const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d.getTime(); })() : /\btoday\b/.test(t) ? (()=>{ const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })() : new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const label = /\bweek\b/.test(t) ? 'this week' : /\btoday\b/.test(t) ? 'today' : 'this month';
  const list = (db().expenses||[]).filter(e=>e.type==='expense' && e.at >= from).sort((a,b)=>b.amount-a.amount);
  try { J.go('budget'); } catch(e){}
  if (!list.length) return `No spending recorded ${label} yet.`;
  const e = list[0]; return `Your biggest expense ${label} is ${money(e.amount)} for ${e.desc}, under ${e.cat}, ${J.whenText(e.at).replace(/^(Today|Yesterday), .*/, m=>m.split(',')[0].toLowerCase())}.`;
}

/* =========================================================
   5. Looking things up: dictionary and Wikipedia (free, no key); the Gemini AI when a key is saved
   ========================================================= */
const PERSONAL = /\b(my|mine|me|i|i'm|im|i've|ive|i'd|i'll|we|our|us)\b/;
const LIVE = /\b(score|scores|won|win|winning|lost|lose|playing tonight|game last night|match|news|latest|right now|tonight|this week|yesterday|today|weather|traffic|open now|stock|price|cost|election results|live)\b/;
function knowledgeQuery(t, said){
  let m;
  const s = t.replace(/^(?:hey |ok |okay )?(?:jarvis )?/, '').replace(/\s+(?:please|for me)$/,'').trim();
  // definitions
  if ((m = s.match(/^(?:what does|what do) (?:the word )?["']?([a-z][a-z' -]{1,30}?)["']? mean$|^(?:what(?:'s| is) the )?(?:meaning|definition) of (?:the word )?["']?([a-z][a-z' -]{1,30}?)["']?$|^define (?:the word )?["']?([a-z][a-z' -]{1,30}?)["']?$|^what(?:'s| is) (?:a |an )?["']?([a-z][a-z'-]{1,24})["']? mean$|^what is the word ([a-z][a-z'-]{1,24})$/))){
    const w = (m[1]||m[2]||m[3]||m[4]||m[5]).trim(); if (w.split(' ').length <= 3) return {type:'define', q:w};
  }
  const QW = /^(?:who|what|whats|what's|when|where|why|how|which|whose|tell me about|tell me something about|what do you know about|do you know (?:anything )?about|have you heard of|explain|describe|give me info on|info on|information on|facts about|teach me about|who's|where's|when's|how's|is|are|was|were|does|did|do|can|could|has|have|will|would|should|wiki|wikipedia|look up|search for|search|google|find out)\b/;
  if (!QW.test(s)) return null;
  // sums and money maths are never encyclopedia questions
  if (/\d/.test(s) && /(?:%|\bpercent\b|\btip\b|\bplus\b|\bminus\b|\btimes\b|\bdivided\b|\bsplit\b|\bsquared?\b|\bdollars?\b|\bbucks\b|\blira\b|\beuros?\b)/.test(s)) return null;
  if (PERSONAL.test(s.replace(/^(?:tell me|give me|teach me|let me know)\b/, '')) && !/^(?:who|what) (?:is|was|are|were) (?:the )?(?!my\b)/.test(s)) return null;
  if (/\b(?:budget|spending|spent|money left|remaining for the month|left this month|calories|my day|reminders?|meetings?|the markets? today|in the markets?)\b/.test(s)) return null;
  if (/\b(?:you|your|yourself|jarvis)\b/.test(s.replace(/^(?:what do you know about|do you know (?:anything )?about|can you tell me about|could you tell me about|have you heard of|do you know who|do you know what)\b/, ''))) return null;
  if (s.split(' ').length > 18) return null;
  if (/\b(?:today|tonight|right now|this week|yesterday|tomorrow|this morning|this afternoon)\b/.test(s) && !/^(?:who(?:'s| is| was)|what(?:'s| is) (?:a|an|the meaning)|define)\b/.test(s)) return null;
  // live or local things Wikipedia can't answer: sports results, listings, flights, places nearby
  if (/\b(?:last night|tonight|this weekend|right now|near me|nearby)\b/.test(s) || /\b(?:score|scores|flights?|hotels?|restaurants?|tickets?|on tv|showtimes|open now|deliver|delivery|traffic)\b/.test(s) || /^who won\b(?!.*\b(?:19|20)\d\d\b)/.test(s)) return null;
  // "who is X", "what is X", "tell me about X": X is a page title
  if ((m = s.match(/^(?:who(?:'s| is| was| were| are)|what(?:'s| is| was| are| were)|tell me (?:something )?about|what do you know about|do you know (?:anything )?about|have you heard of|explain|describe|give me info on|info on|information on|facts about|teach me about|look up|search for|search|google|wiki|wikipedia|find out about)\s+(?:a |an |the )?(.+?)(?:\s+on wikipedia)?$/))){
    const x = m[1].trim();
    if (/^(?:time|date|day|weather|temperature|forecast|news|score|plan|deal|story|matter|point|problem|difference)\b/.test(x)) return null;
    if (/^(?:up|new|happening|going on|good|wrong)$/.test(x)) return null;
    if (/^(?:the )?(?:president|prime minister|king|ceo|leader|pope|mayor|governor|head)\b/.test(x)) return {type:'wiki', q:s, title:x, live:true};
    return {type:'wiki', q:s, title:x, live:LIVE.test(s)};
  }
  return {type:'wiki', q:s, title:null, live:LIVE.test(s)};
}
function cleanExtract(txt, maxWords){
  let s = String(txt||'').replace(/\s*\([^()]*(?:\([^()]*\)[^()]*)*\)/g, '').replace(/\s*\[[^\]]*\]/g, '').replace(/\s+([,.;])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  const sents = s.match(/[^.!?]+(?:[.!?](?=\s|$)|$)/g) || [s];
  let out = '';
  for (let x of sents){ x = x.trim(); const n = (out + ' ' + x).trim(); if (out && n.split(' ').length > (maxWords || 45)) break; out = n; if (out.split(' ').length > 22) break; }
  return out.trim();
}
async function wikiSummary(title){
  const t = title.replace(/\s+/g, '_');
  const d = await fetchJSON('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(t) + '?redirect=true', 8000);
  if (!d || d.type === 'disambiguation' || !d.extract) return null;
  return {title:d.title, text:cleanExtract(d.extract), desc:d.description};
}
async function wikiSearch(q){
  const u = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&generator=search&gsrlimit=1&gsrsearch=' + encodeURIComponent(q) + '&prop=extracts&exintro=1&explaintext=1&exsentences=3';
  const d = await fetchJSON(u, 8000);
  const pages = d && d.query && d.query.pages; if (!pages) return null;
  const p = Object.values(pages).sort((a,b)=>(a.index||0)-(b.index||0))[0];
  if (!p || !p.extract || /may refer to:?$/.test(p.extract.trim())) return null;
  return {title:p.title, text:cleanExtract(p.extract)};
}
let wikiFailLast = '';
function wikiFail(e){
  if (e && e.status === 404) return null;
  const r = pickOne(["I couldn't reach Wikipedia just now. Check your connection and ask me again.", "Wikipedia isn't answering right now. Try again in a moment.", "The lookup didn't go through. Check your internet and try once more."], wikiFailLast);
  wikiFailLast = r; return r;
}
async function lookUp(q){
  if (q.type === 'define'){
    try {
      const d = await fetchJSON('https://api.dictionaryapi.dev/api/v2/entries/en/' + encodeURIComponent(q.q), 8000);
      const e = Array.isArray(d) && d[0]; const mean = e && e.meanings && e.meanings[0]; const def = mean && mean.definitions && mean.definitions[0];
      if (def && def.definition){
        let s = `${cap(e.word || q.q)}${mean.partOfSpeech ? ', ' + mean.partOfSpeech : ''}: ${def.definition.replace(/\.$/,'')}.`;
        if (def.example && s.split(' ').length < 30) s += ` For example: ${cap(def.example.replace(/\.$/,''))}.`;
        return s;
      }
    } catch(e){ if (!(e && e.status === 404)) throw e; }
    const w = await wikiSummary(q.q).catch(()=>null); if (w) return w.text;
    return `I couldn't find a definition for ${q.q}. Check the spelling and try again.`;
  }
  let r = null;
  if (q.title && q.title.split(' ').length <= 6){ try { r = await wikiSummary(q.title.replace(/\b\w/g, c=>c.toUpperCase())); } catch(e){ if (!(e && e.status === 404)) throw e; } }
  if (!r) r = await wikiSearch(q.q.replace(/^(?:tell me (?:something )?about|what do you know about|look up|search for|search|google|wiki|wikipedia|find out about)\s+/, ''));
  if (!r) return pickOne([`I looked it up but didn't find a clear answer. Try asking it a different way.`, `Wikipedia didn't have a clear answer for that one. Try different words.`]);
  const pre = q.live ? 'Here is what Wikipedia says, which may not be up to date: ' : pickOne(['', 'According to Wikipedia, ', '']);
  let body = cap(r.text);
  if (/, $/.test(pre) && /^(The|This|It|In|A|An|These|Its)\b/.test(body)) body = body.charAt(0).toLowerCase() + body.slice(1);
  return pre + body;
}

/* ---------- Gemini (only when a free key is saved in Food > AI photos) ---------- */
const AI = () => (J.ai && J.ai.hasKey && J.ai.hasKey()) ? J.ai : null;
let aiCool = 0, aiBusy = false, aiLastAt = 0;
const COMMANDS = [
  'brief me', 'what does my day look like tomorrow',
  "what's the weather", "what's the weather tomorrow", "what's the weather in <city>", 'will it rain today', 'do I need a jacket',
  "how's the market", "how's <company or ticker> doing", 'market news', "what's on the economic calendar", "how's my watchlist", 'add <company> to my watchlist',
  'how much have I spent this month', 'how much have I spent this week', 'how much have I spent today', 'how much did I spend on <category>', 'how much is left in my budget', 'am I over budget', "what's my balance", 'how much did I make this month',
  'I spent <amount> on <thing>', 'got paid <amount>', 'set my budget to <amount>',
  'remind me to <task> <time>', 'what are my reminders', 'wake me up at <time>', 'set a timer for <minutes> minutes', "what's on my calendar today", 'when is my next meeting', 'add <event> to my calendar <day> at <time>',
  'read my notes', 'note: <text>',
  'how many calories today', 'how many calories do I have left', 'what did I eat today', 'I ate <food>', 'I drank a glass of water', 'how much water have I had', 'what should I eat', 'how many calories in <food>',
  'how are my habits going', 'how are my goals going', "what's my streak", 'I worked out', 'add a habit to <habit> every day',
  'scan a receipt', 'show me my receipts', 'how many steps today', 'how did I sleep', 'open settings', 'dark mode', 'light mode',
  'change my last expense to <amount>', 'move my reminder to <time>', 'delete the last expense'
];
function aiSystem(){
  const w = J.weather && J.weather.location, loc = w && w.name ? w.name + (w.region ? ', ' + w.region : '') : '';
  return `You are Jarvis, a warm, concise voice assistant inside a personal phone app for ${S().name}${loc ? `, who lives in ${loc}` : ' (no home city set yet; if a question depends on location, ask which city)'}. Today is ${new Date().toLocaleString([], {weekday:'long', year:'numeric', month:'long', day:'numeric', hour:'numeric', minute:'2-digit'})}. Money is shown in ${S().currency}.
The app understands these commands (angle brackets are slots to fill):
${COMMANDS.map(c=>'- '+c).join('\n')}
Decide what the user wants.
- If one of the app's commands does it, reply with {"command": "<the command, slots filled, in plain words>"}. The app then runs it with the user's real data. Use this for anything about their day, weather, markets, money, reminders, calendar, notes, food, habits, health or settings.
- Never invent the user's personal data (spending, schedule, health, notes): use a command for those.
- Only use a "note:" command if the user clearly asked to save or note something.
- Otherwise answer it yourself: {"answer": "<1 to 3 short spoken sentences, plain text, no markdown, no lists, no emojis>"}. Be accurate; if a question needs live data you do not have (scores, today's news), say so briefly and suggest where to look.
Return only JSON.`;
}
const AI_SCHEMA = {type:'OBJECT', properties:{command:{type:'STRING', nullable:true}, answer:{type:'STRING', nullable:true}}};
function aiHistory(){
  return mem.slice(-6).map(x=>`User: ${x.said}\nJarvis: ${String(x.reply||'').slice(0, 300)}`).join('\n');
}
async function askAI(said){
  const ai = AI(); if (!ai) throw Object.assign(new Error('nokey'), {kind:'nokey'});
  if (now() < aiCool) throw Object.assign(new Error('cool'), {kind:'quota'});
  const wait = 1200 - (now() - aiLastAt); if (wait > 0) await new Promise(r=>setTimeout(r, wait));
  aiLastAt = now();
  const hist = aiHistory();
  const prompt = (hist ? `Recent conversation:\n${hist}\n\n` : '') + `User: ${said}`;
  try {
    const res = await ai.gemini([{text:prompt}], {system:aiSystem(), schema:AI_SCHEMA, json:true, timeout:15000, maxTokens:400, temperature:0.4});
    return res && res.json || null;
  } catch(e){
    if (e && e.kind === 'quota') aiCool = now() + (e.daily ? 6*HOUR : 60e3);
    if (e && (e.kind === 'badkey' || e.kind === 'denied' || e.kind === 'project' || e.kind === 'region')) aiCool = now() + 30*MIN;
    throw e;
  }
}
const SAVE_WORDS = /\b(note|notes|save|write|jot|remember|keep)\b/;
const SAVE_ASK = /\b(save|write (?:it|this|that) down|jot|remember (?:it|this|that)|keep (?:it|this|that))\b/;
function runCommand(cmd, said){
  cmd = String(cmd||'').replace(/[<>]/g, '').trim(); if (!cmd || cmd.length > 200) return null;
  if (/^(?:note|take a note|make a note|save a note|remember that|write down)\b/i.test(cmd) && !SAVE_WORDS.test(lc(said))) return null;
  // the AI may only change data when the words heard asked for it: money with the same amount, a reminder or alarm when one was asked for
  const c = lc(cmd), heard = lc(J.wordsToNumbers ? J.wordsToNumbers(String(said||'')) : said);
  const amt = x => (moreNumbers(x).match(/\d+(?:\.\d+)?/g) || []).map(Number);
  if (/^(?:i spent|i paid|spent|paid|got paid|i got paid|i earned|i received|set my budget|change my last expense|delete the last expense)\b/.test(c)){
    if (/^delete\b/.test(c) ? !/\b(?:delete|remove|undo|cancel|scratch|get rid of)\b.*\b(?:expenses?|payments?|purchases?|transactions?|spending|charge|last one|it|that)\b/.test(heard) : !amt(c).some(n=>amt(heard).includes(n))) return null;
  }
  if (/^(?:remind me|wake me|set a timer|set an alarm|add .* to my calendar|add a habit|move my reminder)\b/.test(c) && !/\b(?:remind|reminder|alarm|wake|timer|calendar|habit|schedule|don't let me forget|dont let me forget)\b/.test(heard)) return null;
  if (/^(?:dark mode|light mode)$/.test(c) && !/\b(?:dark|light|theme|mode|bright|night)\b/.test(heard)) return null;
  const norm = J.normalizeSpeech ? J.normalizeSpeech(cmd) : cmd;
  before(); let r = null;
  try { r = J.rethink(norm); } catch(e){ r = null; }
  noticeNew(); try { J.renderAll(); } catch(e){}
  return r;
}
/** an AI answer made fit to be read aloud: no markdown, lists, links or emoji, and at most about three sentences */
function speakable(x){
  let s = String(x||'').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '').replace(/[*_#`>~|]/g, '').replace(/^\s*(?:[-•]|\d+[.)])\s+/gm, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (s.length > 360){ const sents = s.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [s]; let out = ''; for (const x of sents){ if ((out + x).length > 360) break; out += x; } s = (out || s.slice(0, 340).replace(/\s+\S*$/, '') + '…').trim(); }
  return s;
}
function aiAnswer(said, turnId, local){
  const ai = AI(); if (!ai || now() < aiCool || aiBusy) return null;
  aiBusy = true;
  lateAsync(turnId, async ()=>{
    try {
      const j = await askAI(said);
      if (j && j.command){ const r = runCommand(j.command, said); if (r) return r; }
      if (j && j.answer) return speakable(j.answer);
      if (local) return await local();
      return null;
    } catch(e){
      if (local) return await local();
      throw e;
    } finally { aiBusy = false; }
  }, e=>fallbackText(lc(said), true));
  return pickOne(['One moment…', 'Let me think…', 'One moment, let me check…']);
}

/* =========================================================
   6. Late: when nothing else understood it
   ========================================================= */
function late(said, t){
  const turnId = J.turnInfo ? J.turnInfo().seq : null;
  let r, c;
  // a follow-up to the last question
  if ((c = followUp(t))){ r = J.rethink(c); if (r) return r; }
  // the same request in other words
  if ((c = rewrite(t)) && typeof c === 'object' && c.confirm){ pending = {cmd:c.confirm, at:now()}; setKind('chat'); return c.ask; }
  if ((c = rewrite(t))){ const sp = special(c, t); if (sp) return sp; r = J.rethink(c); if (r) return r; }
  // the same, after dropping a polite lead-in ("I was wondering", "just checking")
  const t2 = t.replace(/^(?:i (?:want|wanna|would like|'d like|need) to know|do you know|tell me|i was (?:just )?wondering|just (?:checking|wondering|curious)|quick one|real quick|i'm curious|i am curious|curious|out of curiosity|by the way|btw|so basically|basically|i mean|listen|look|hey so)\b[\s,]*(?:if |whether |about )?/, '').replace(/\s+(?:real quick|quickly|by any chance|right now|at the moment|again)$/, '').trim();
  if (t2 && t2 !== t){ r = J.rethink(t2) || ((c = rewrite(t2)) && typeof c === 'string' && (special(c, t2) || J.rethink(c))); if (r) return r; }
  // remembered conversation
  if (/^(?:what (?:did|have) (?:we|i) (?:talk|talked|speak|spoke|chat|chatted) about|what (?:did|have) i (?:ask|asked)(?: you)?(?: before| earlier| today)?|remind me what (?:we talked about|i asked|i said))$/.test(t)) return recap();
  // the closest area by keywords ("give me a spending update", "anything due today")
  const cls = classify(t2 || t);
  if (cls){ r = J.rethink(cls); if (r) return r; }
  // a question for the AI (free key) or for Wikipedia / the dictionary
  const q = knowledgeQuery(t, said) || (t2 && t2 !== t ? knowledgeQuery(t2, said) : null);
  if (AI()){
    const local = q ? async ()=>{ try { return await lookUp(q); } catch(e){ return wikiFail(e); } } : null;
    const a = aiAnswer(said, turnId, local); if (a) return a;
  }
  if (q){
    setKind('feature');
    if (navigator.onLine === false) return "You're offline right now. Connect to the internet and ask me again, and I'll look it up.";
    lateAsync(turnId, ()=>lookUp(q), e=>wikiFail(e) || "I couldn't find that one. Try asking it a different way.");
    return q.type === 'define' ? `Looking up ${q.q}…` : pickOne(['One moment, looking that up…', 'One moment, let me check…']);
  }
  return null;
}
/* "Should I log $18 for lunch?" "Yes." */
let pending = null;
function confirm(t){
  if (!pending) return null;
  const p = pending; pending = null;
  if (now() - p.at > 90e3) return null;
  if (/^(?:yes|yeah|yep|yup|sure|ok|okay|please|yes please|do it|go ahead|log it|add it|change it|correct|right|exactly|absolutely|of course|definitely|sure thing|yalla|that one|yes that one)(?: please| thanks| jarvis)?$/.test(t)){ if (p.fn) return p.fn() || null; before(); const r = J.rethink(p.cmd); noticeNew(); return r || null; }
  if (/^(?:no|nope|nah|no thanks|don't|dont|cancel|never ?mind|forget it|leave it)(?: please| thanks| jarvis)?$/.test(t)){ setKind('chat'); return p.no || "Okay, I won't log it."; }
  return null;
}
function recap(){
  setKind('chat');
  const seen = new Set(); const asked = mem.filter(x=>x.said && x.kind !== 'chat' && x.kind !== 'fallback' && !/^(what did|remind me what)/.test(lc(x.said))).map(x=>x.said.replace(/[.?!]+$/,'')).reverse().filter(x=>{ const k = lc(x); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0,4).reverse();
  if (!asked.length) return "We haven't talked about much yet today.";
  return 'Recently you asked: ' + asked.map(x=>lower1(x)).join('; ') + '.';
}

/* =========================================================
   7. The closest thing Jarvis can do (for the last-resort reply)
   ========================================================= */
const NEAR = [
  [/\b(car|tyres?|tires?|engine|noise|broken|broke|fix|repair|leak|leaking|mechanic|plumber|electrician|ac|fridge)\b/, ['Want a reminder to get it looked at? Say: remind me to call the mechanic tomorrow at 9.', 'I can remind you to sort it out. Say: remind me to fix it on Saturday.']],
  [/\b(money|cash|spend|spent|spending|expense|expenses|cost|costs|pay|paid|bought|buy|price|budget|afford|bill|bills|salary|income|bank|account|card|wallet|save|saving|savings)\b/, ['I can track your money. Try: how much did I spend this week?', 'For money, try: how much is left in my budget?', 'Want your spending? Say: how much have I spent this month.']],
  [/\b(weather|rain|sun|sunny|cold|hot|warm|outside|umbrella|jacket|wear|temperature|degrees|wind|snow|storm|forecast)\b/, ["For the weather, try: what's the weather tomorrow?", 'Try: do I need a jacket today?', 'Ask me: will it rain today?']],
  [/\b(stock|stocks|market|markets|shares|invest|investing|investment|crypto|bitcoin|gold|oil|nasdaq|dow|s&p|economy|inflation|fed|rates|ticker|apple|tesla|nvidia|portfolio)\b/, ["For markets, try: how's the market today?", 'Try: how is Apple doing?', "Ask me: what's on the economic calendar?"]],
  [/\b(meeting|meetings|calendar|schedule|appointment|event|events|plan|plans|busy|free|tomorrow|tonight|week|weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/, ["For your plans, try: what's on my calendar tomorrow?", 'Try: when is my next meeting?', 'Want a reminder? Say: remind me to call Ali tomorrow at 5.']],
  [/\b(remind|reminder|reminders|forget|remember|todo|to-do|task|tasks|errand|errands|later)\b/, ['Want a reminder? Say: remind me to, then what and when.', 'Try: remind me to pay rent on Friday at 9.', 'Say: what are my reminders?']],
  [/\b(alarm|wake|timer|clock|minutes|seconds)\b/, ['Try: wake me up at 6:30, or set a timer for 10 minutes.', 'Say: set a timer for 5 minutes.']],
  [/\b(food|eat|ate|eating|hungry|meal|meals|lunch|dinner|breakfast|snack|calories|diet|protein|water|drink|drank|coffee|weight)\b/, ['For food, try: how many calories today?', 'Try: what should I eat for dinner?', 'Say what you ate, like: I had a shawarma for lunch.']],
  [/\b(habit|habits|gym|workout|work out|exercise|run|running|walk|walking|meditate|meditation|read|reading|goal|goals|streak|sleep|steps)\b/, ['Try: how are my habits going?', 'Say: I worked out, and I will tick it off.', 'Try: how are my goals going?']],
  [/\b(receipt|receipts|invoice|scan)\b/, ['Try: scan a receipt.']],
  [/\b(convert|exchange|dollar|dollars|euro|euros|lira|lbp|rate|currency)\b/, ['Try: how much is 100 dollars in lira?', 'Try: convert 50 euros to dollars.']],
  [/\b(time|date|day|today|holiday|christmas|eid|ramadan|birthday)\b/, ['Try: how many days until Christmas?', "Ask me: what time is it in London?"]]
];
const DOES_NOT = [
  [/^(?:call|phone|ring|dial|facetime|video call)\b/, "Calling isn't something I do yet.", 'Want a reminder to call? Say: remind me to call, and when.'],
  [/^(?:text|message|send|email|e-mail|whatsapp|reply to|dm)\b/, "Sending messages isn't something I do yet.", 'I can remind you to send it. Say: remind me to text, and when.'],
  [/^(?:play|put on|shuffle|skip|pause|resume)\b|\b(?:music|song|songs|playlist|spotify|podcast|album|radio)\b/, "Music isn't something I play yet.", 'I can give you your brief or the markets instead.'],
  [/^(?:turn on|turn off|switch on|switch off|dim|brighten) (?:the )?(?:lights?|tv|ac|air|heater|fan)\b|\b(?:lights|thermostat|smart home)\b/, "Smart home controls aren't connected to me.", 'I can set a reminder or an alarm for it.'],
  [/^(?:order|book|reserve|buy me|get me a (?:taxi|uber|cab))\b|\b(?:uber|taxi|cab|pizza delivery|table for)\b/, "Ordering and booking aren't something I do yet.", 'I can remind you to do it. Say: remind me to book it at 6.'],
  [/^(?:navigate|directions|take me to (?!my|the (?:budget|notes|settings|markets?|calendar|reminders?|habits|food|receipts))|how do i get to|how far is|drive to)\b/, 'For directions, Apple Maps or Google Maps will do it best.', 'I can remind you when to leave.'],
  [/^(?:open|launch|start) (?:youtube|instagram|whatsapp|facebook|tiktok|netflix|spotify|maps|camera|safari|chrome|gmail|snapchat|twitter|x|the app store|settings app)\b/, "Opening other apps isn't something I can do from here.", 'I can open your notes, reminders, budget, food, habits and markets.'],
  [/^(?:take a (?:picture|photo|selfie)|take (?:a )?pic)\b/, "Photos only work for receipts and food here.", 'Say: scan a receipt, or scan my plate.'],
  [/^(?:translate)\b/, "Translation isn't built in yet.", null],
  [/\b(?:tv|on tv|movie times|showtimes)\b/, "TV listings aren't something I have.", null],
  [/\b(?:score|scores|who won|won the game|the game|the match|playing tonight|kick ?off|fixtures?)\b/, "I don't get live sports scores yet.", null],
  [/\b(?:flights?|hotels?|airbnb|plane tickets?|book a flight)\b/, "Flight and hotel search isn't something I do yet.", 'I can remind you to book it. Say: remind me to book flights tonight at 8.'],
  [/\b(?:restaurants?|cafes?|near me|nearby|closest|nearest)\b/, 'Finding places works best in Google Maps or Apple Maps.', null],
  [/\b(?:volume|brightness|wi-?fi|bluetooth|airplane mode|flashlight|torch|do not disturb|ringer|silent mode)\b/, 'Phone settings like that are in your iPhone, not in Jarvis.', 'In Jarvis Settings I can change my voice and how fast I talk.']
];
let fbLast = [], tipShown = false;
function fallbackText(t, quiet){
  setKind('fallback');
  const one = list => { const opts = list.filter(x=>!fbLast.includes(x)); const r = (opts.length ? opts : list)[Math.floor(Math.random()*(opts.length || list.length))]; fbLast.push(r); if (fbLast.length > 2) fbLast.shift(); return r; };
  let lead = null, tail = null;
  for (const [re, a, b] of DOES_NOT) if (re.test(t)){ lead = a; tail = b; break; }
  const near = NEAR.find(([re])=>re.test(t));
  const saveTalk = SAVE_ASK.test(t);
  if (!lead){
    if (/^(?:i |we )?(?:spent|spend) (?:the |my |a |all )?(?:day|night|weekend|morning|afternoon|evening|time|hours|week|holiday|summer)\b/.test(t)) return one(['Sounds nice. Anything I can do for you?', 'Love that. Need anything from me?']);
    if (/\bnotes?\b/.test(t) && !/\b(save|keep|write|jot|remember)\b/.test(t)) return one(['Want to hear them? Say: read my notes.', 'To see them, say: show me my notes.']);
    if (/^i (?:just )?(?:paid|bought|purchased|spent)\b/.test(t) && !/\d/.test(t)) return one(['Want me to log it? Tell me the amount, like: I paid 500 for rent.', 'How much was it? Say, for example: I paid 500 for rent.']);
    if (saveTalk) return one(['Want me to keep that? Say: note, then what to save.', 'To save it, say: note, then what you want kept.']);
    if (/^(?:i need to|i have to|i've got to|i got to|i gotta|i must|i should|don't forget|dont forget|i'm going to|i am going to|i'm gonna|i want to|i wanna|we should|we need to|we have to)\b/.test(t) || /\b(tomorrow|tonight|later today|this (evening|afternoon|weekend)|next week|at \d{1,2}( ?(am|pm))?)\b/.test(t))
      return one(['Want a reminder for that? Say: remind me to, then what and when.', 'I can remind you. Say: remind me to, plus the time.', 'Should I remind you? Just say: remind me to, and when.']);
  }
  const isQ = /^(what|who|whom|whose|where|when|why|how|which|is|are|was|were|do|does|did|can|could|will|would|should|has|have|tell me|explain|define|find|search|look up|google)\b/.test(t);
  const sugg = near ? one(near[1]) : null;
  let s;
  if (lead) s = lead + ' ' + (tail || sugg || 'Ask me about your day, money or the markets.');
  else if (sugg) s = (isQ ? one(["I'm not sure about that one.", "I don't have an answer for that yet.", "That one's beyond me for now."]) : /^(?:i|i'm|im|my|we|our|it|it's|the|this|that)\b/.test(t) ? one(['Got it.', 'I hear you.', 'Okay.']) : one(["I didn't quite get that.", "I'm not sure what you mean.", 'Hmm, I missed that.'])) + ' ' + sugg;
  else if (isQ) s = one(["I'm not sure about that one. Ask me about your day, money, the weather or the markets.", "I don't have an answer for that yet. Try your brief, the weather or your spending.", "That one's beyond me for now. I can do your brief, money, markets, food and habits."]);
  else s = one(["I didn't quite get that. You can ask for your brief, the weather or your spending.", "Hmm, I missed that. Try: brief me, or how much did I spend this week.", "Sorry, say that another way? I can do your day, money, markets, food and habits."]);
  if (!quiet && !tipShown && !AI() && s.split(' ').length <= 16){ tipShown = true; s += ' Tip: add a free Google key in Food, AI photos, and I can answer almost anything.'; }
  return s;
}

J.brain = {catOf, early, late, before, after, confirm, suggest: t=>fallbackText(lc(t)), rewrite, followUp, calc, convertUnits, fxParse, daysUntil, edits, knowledgeQuery, cleanExtract, recap,
  get lastEntity(){ return lastEntity; }, get memory(){ return mem.slice(); }, _reset(){ mem.length = 0; lastEntity = null; lastRemoved = null; lastDomain = null; tipShown = false; aiCool = 0; }};
J.addSuggestions(["What's 15% of 240?", 'How much is 100 dollars in lira?', 'What time is it in London?', 'Change my last expense to 50', 'How many days until Christmas?', 'Who is Fairuz?']);
} catch(e){ try { console.error('brain', e); } catch(_){} }
})();
