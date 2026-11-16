/* =========================================================
   Morning brief: the "Today" card at the top of Home
   (weather + reminders + yesterday's spending) and a spoken
   daily briefing. Weather: Open-Meteo (free, no key).
   ========================================================= */
(function(){
'use strict';
try {
  const J = window.Jarvis; if (!J) return;

  // Other features can add one sentence to the spoken brief, e.g.
  //   Jarvis.addBriefLine(() => 'You closed 3 of 5 habits yesterday.')
  // Defined first, at file load, so later feature files can always call it.
  const briefLines = [];
  J.addBriefLine = fn => { if (typeof fn === 'function' && !briefLines.includes(fn)) briefLines.push(fn); };

  /* ---------------- state ---------------- */
  const st = J.store('brief', {loc:null, unit:'C', wx:null, pillDay:''});
  if (st.unit !== 'F') st.unit = 'C';
  const FRESH = 30*60e3;           // weather is re-fetched after 30 minutes
  const BEIRUT = {lat:33.8938, lon:35.5018, name:'Beirut', region:'Lebanon', src:'search'};
  let inflight = null, lastErr = 0, playing = false, caption = '', pollT = null, lastHTML = '', cardEl = null, pillChecked = false, ready = false, estCache = null;

  const num = x => typeof x === 'number' && isFinite(x);
  const r0 = x => Math.round(x);
  const conv = c => st.unit === 'F' ? c*9/5+32 : c;
  const T = c => num(c) ? String(r0(conv(c))) : '–';
  const locKey = l => l ? l.lat.toFixed(2)+','+l.lon.toFixed(2) : '';
  const P = iso => Date.parse(iso + 'Z');                       // parse a location-local "YYYY-MM-DDTHH:MM" as a comparable number
  const hourOf = iso => parseInt(iso.slice(11,13), 10);
  const h12 = (h, m) => { const ap = h < 12 ? 'AM' : 'PM'; const hh = h % 12 || 12; return m ? `${hh}:${String(m).padStart(2,'0')} ${ap}` : `${hh} ${ap}`; };
  const isoTime = iso => h12(hourOf(iso), parseInt(iso.slice(14,16), 10) || 0);
  const dayKey = d => { d = new Date(d); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); };
  const lc = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  const placeName = () => !st.loc ? '' : st.loc.name || 'your area';

  /* ---------------- weather codes ---------------- */
  // [group, day description, night description, how to say it after "It's 18 degrees ..."]
  const WMO = {
    0:['clear','Sunny','Clear','and sunny','and clear'], 1:['clear','Mostly sunny','Mostly clear','and mostly sunny','and mostly clear'],
    2:['partly','Partly cloudy','Partly cloudy','and partly cloudy'], 3:['cloudy','Cloudy','Cloudy','and cloudy'],
    45:['fog','Foggy','Foggy','and foggy'], 48:['fog','Icy fog','Icy fog','with icy fog'],
    51:['drizzle','Light drizzle','Light drizzle','with light drizzle'], 53:['drizzle','Drizzle','Drizzle','with some drizzle'], 55:['drizzle','Heavy drizzle','Heavy drizzle','with heavy drizzle'],
    56:['drizzle','Freezing drizzle','Freezing drizzle','with freezing drizzle'], 57:['drizzle','Freezing drizzle','Freezing drizzle','with freezing drizzle'],
    61:['rain','Light rain','Light rain','with light rain'], 63:['rain','Rain','Rain','and raining'], 65:['rain','Heavy rain','Heavy rain','with heavy rain'],
    66:['rain','Freezing rain','Freezing rain','with freezing rain'], 67:['rain','Freezing rain','Freezing rain','with heavy freezing rain'],
    71:['snow','Light snow','Light snow','with light snow'], 73:['snow','Snow','Snow','and snowing'], 75:['snow','Heavy snow','Heavy snow','with heavy snow'], 77:['snow','Snow grains','Snow grains','with snow grains'],
    80:['rain','Light showers','Light showers','with light showers'], 81:['rain','Showers','Showers','with rain showers'], 82:['rain','Heavy showers','Heavy showers','with heavy showers'],
    85:['snow','Snow showers','Snow showers','with snow showers'], 86:['snow','Heavy snow showers','Heavy snow showers','with heavy snow showers'],
    95:['storm','Thunderstorm','Thunderstorm','with thunderstorms'], 96:['storm','Storm with hail','Storm with hail','with thunderstorms and hail'], 99:['storm','Storm with hail','Storm with hail','with thunderstorms and hail']
  };
  const LOOKS = {clear:'sunny', partly:'partly cloudy', cloudy:'cloudy', fog:'foggy', drizzle:'drizzly', rain:'rainy', snow:'snowy', storm:'stormy'};
  const NOW_WET = {drizzle:"it's drizzling", rain:"it's raining", storm:"there's a thunderstorm", snow:"it's snowing"};
  const WMO_FALLBACK = ['cloudy','Cloudy','Cloudy','and cloudy'];
  function wmo(code){ return num(code) ? (WMO[code] || WMO[Math.floor(code/10)*10] || WMO_FALLBACK) : WMO_FALLBACK; }
  function desc(code, day){ const w = wmo(code); return day ? w[1] : w[2]; }
  function sayCond(code, day){ const w = wmo(code); return w[0]==='clear' ? (day ? w[3] : w[4]) : w[3]; }

  /* ---------------- icons (inline SVG, day / night) ---------------- */
  const CLOUD = 'M19 50h27a10.5 10.5 0 0 0 1.2-20.9A14.5 14.5 0 0 0 19.6 26 12 12 0 0 0 19 50z';
  const sunSVG = (cx, cy, r, anim) => `<g class="${anim?'bf-spin':''}" style="transform-origin:${cx}px ${cy}px">${[0,45,90,135,180,225,270,315].map(a=>`<rect x="${cx-1.6}" y="${cy-r-9}" width="3.2" height="6" rx="1.6" fill="url(#bfSun)" transform="rotate(${a} ${cx} ${cy})"/>`).join('')}</g><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#bfSun)"/>`;
  const moonSVG = (cx, cy, r) => `<path d="M${cx+r*0.35} ${cy-r} a${r} ${r} 0 1 0 ${r*0.65} ${r*1.55} a${r*0.82} ${r*0.82} 0 0 1 ${-r*0.65} ${-r*1.55}z" fill="url(#bfMoon)"/>`;
  function icon(code, day, size, anim){
    const g = wmo(code)[0]; const a = anim ? ' bf-anim' : '';
    const cloud = (dark, y) => `<path class="${anim?'bf-drift':''}" d="${CLOUD}" fill="url(#${dark?'bfCloudD':'bfCloud'})" transform="translate(0 ${y||0})"/>`;
    let s = '';
    if (g === 'clear'){
      s = day ? sunSVG(32, 32, 12, anim) : moonSVG(30, 32, 15) + '<circle cx="47" cy="17" r="1.6" fill="#fff" opacity=".9"/><circle cx="52" cy="30" r="1.1" fill="#fff" opacity=".7"/>';
      if (code === 1) s += `<path d="${CLOUD}" fill="url(#bfCloud)" transform="${day ? 'translate(22 14) scale(.55)' : 'translate(27 25) scale(.52)'}" opacity=".95"/>`;
    }
    else if (g === 'partly') s = (day ? sunSVG(24, 22, 9.5, anim) : moonSVG(22, 21, 11)) + cloud(false, 4);
    else if (g === 'cloudy') s = `<path d="${CLOUD}" fill="url(#bfCloudD)" transform="translate(10 -6) scale(.78)" opacity=".9"/>` + cloud(false, 2);
    else if (g === 'fog') s = cloud(false, -6) + [50,56].map((y,i)=>`<rect x="${12+i*6}" y="${y}" width="${36-i*6}" height="3.4" rx="1.7" fill="#dfe7f3" opacity="${.9-i*.25}"/>`).join('');
    else if (g === 'drizzle' || g === 'rain'){
      const heavy = [65,67,82].includes(code), n = g === 'drizzle' ? 3 : heavy ? 4 : 3;
      s = cloud(g === 'rain', -6) + Array.from({length:n}, (_, i)=>{ const x = 20 + i*(26/(n-1||1)); return `<line class="${anim?'bf-drop':''}" style="animation-delay:${i*.27}s" x1="${x}" y1="${g==='drizzle'?47:46}" x2="${x-3}" y2="${g==='drizzle'?52:55}" stroke="#7cc8ff" stroke-width="${g==='drizzle'?2.6:3}" stroke-linecap="round"/>`; }).join('');
    }
    else if (g === 'snow') s = cloud(false, -6) + [20,32,44].map((x,i)=>`<circle class="${anim?'bf-flake':''}" style="animation-delay:${i*.4}s" cx="${x}" cy="${51+(i%2)*4}" r="2.6" fill="#fff"/>`).join('');
    else if (g === 'storm') s = cloud(true, -6) + `<path class="${anim?'bf-bolt':''}" d="M34 41l-8 12h6l-3 9 10-13h-6l4-8z" fill="url(#bfBolt)"/>` + `<line x1="20" y1="46" x2="17" y2="54" stroke="#7cc8ff" stroke-width="3" stroke-linecap="round"/><line x1="46" y1="46" x2="43" y2="54" stroke="#7cc8ff" stroke-width="3" stroke-linecap="round"/>`;
    return `<svg class="bf-wi${a}" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">${s}</svg>`;
  }
  const UI = {
    pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    gps:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
    search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    chev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
    stop:'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="6.5" width="11" height="11" rx="2.5"/></svg>',
    drop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z"/></svg>',
    uv:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    wind:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/></svg>',
    sunset:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M17 18a5 5 0 0 0-10 0M12 9V3M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M16 6l-4 3-4-3"/></svg>',
    sunrise:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M17 18a5 5 0 0 0-10 0M12 2v7M4.2 10.2l1.4 1.4M1 18h2M21 18h2M18.4 11.6l1.4-1.4M23 22H1M8 6l4-4 4 4"/></svg>',
    bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
    card:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/></svg>',
    x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    retry:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>'
  };

  /* ---------------- styles ---------------- */
  J.css(`
#hc-brief{margin-top:14px}
.bf-card{position:relative;overflow:hidden;border-radius:26px;padding:16px 16px 14px;color:#fff;isolation:isolate;box-shadow:0 18px 40px -12px var(--bf-shadow,rgba(30,60,140,.5));transition:background .6s var(--ease)}
.bf-card,.bf-card button{color:#fff}
.bf-card::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.18))}
.bf-fx{position:absolute;inset:0;z-index:-1;pointer-events:none;overflow:hidden}
.bf-glow{position:absolute;right:-70px;top:-90px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,rgba(255,226,140,.65),rgba(255,190,90,.18) 45%,transparent 70%)}
.bf-moonglow{position:absolute;right:-60px;top:-80px;width:230px;height:230px;border-radius:50%;background:radial-gradient(circle,rgba(190,205,255,.35),transparent 65%)}
.bf-star{position:absolute;width:2px;height:2px;border-radius:50%;background:#fff;opacity:.7;animation:bfTw 3.2s ease-in-out infinite}
@keyframes bfTw{50%{opacity:.15}}
.bf-fxcloud{position:absolute;width:180px;height:60px;border-radius:60px;background:rgba(255,255,255,.12);filter:blur(6px);animation:bfFloat 26s linear infinite}
.bf-fxcloud::before{content:"";position:absolute;left:36px;top:-30px;width:80px;height:80px;border-radius:50%;background:inherit}
@keyframes bfFloat{from{transform:translateX(-220px)}to{transform:translateX(480px)}}
.bf-rain{position:absolute;inset:-40px 0 0;background-image:linear-gradient(105deg,transparent 48%,rgba(190,220,255,.28) 49%,rgba(190,220,255,.28) 51%,transparent 52%);background-size:22px 46px;animation:bfRain .9s linear infinite;opacity:.55}
@keyframes bfRain{to{background-position:-8px 46px}}
.bf-snowfx{position:absolute;inset:-60px 0 0;background-image:radial-gradient(circle,rgba(255,255,255,.75) 1.4px,transparent 2px),radial-gradient(circle,rgba(255,255,255,.5) 1px,transparent 1.6px);background-size:46px 46px,30px 30px;background-position:0 0,15px 20px;animation:bfSnow 7s linear infinite}
@keyframes bfSnow{to{background-position:20px 46px,5px 50px}}
.bf-flash{position:absolute;inset:0;background:rgba(255,255,255,.0);animation:bfFlash 7s infinite}
@keyframes bfFlash{0%,92%,96%,100%{background:rgba(255,255,255,0)}93%,95%{background:rgba(255,255,255,.14)}}
.bf-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
.bf-loc{display:flex;align-items:center;gap:6px;border:0;background:rgba(255,255,255,.16);border-radius:999px;padding:7px 11px 7px 9px;font-weight:700;font-size:13px;cursor:pointer;min-width:0;max-width:62%;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.bf-loc svg{width:15px;height:15px;flex:none}
.bf-loc span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bf-loc .bf-chev{width:13px;height:13px;opacity:.8}
.bf-unit{display:flex;background:rgba(0,0,0,.16);border-radius:999px;padding:3px;flex:none}
.bf-unit button{border:0;background:none;font-weight:700;font-size:12px;padding:5px 10px;border-radius:999px;cursor:pointer;opacity:.75;min-width:38px}
.bf-unit button.on{background:rgba(255,255,255,.95);color:#1c2440;opacity:1}
.bf-kicker{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.8;margin:10px 0 0}
.bf-main{display:flex;align-items:center;gap:6px;margin:2px 0 4px}
.bf-main .bf-wi{flex:none;margin-left:-8px;filter:drop-shadow(0 8px 14px rgba(0,0,0,.22))}
.bf-temp{font-size:60px;font-weight:800;letter-spacing:-3px;line-height:1;display:flex;align-items:flex-start;text-shadow:0 2px 12px rgba(0,0,0,.12)}
.bf-temp sup{font-size:26px;letter-spacing:0;margin-top:6px;font-weight:700;opacity:.9}
.bf-side{margin-left:auto;text-align:right;display:flex;flex-direction:column;gap:1px;min-width:0}
.bf-side b{font-size:16px;font-weight:800;letter-spacing:-.2px}
.bf-side span{font-size:13px;opacity:.88;font-weight:500;white-space:nowrap}
.bf-meta{display:flex;flex-wrap:nowrap;gap:5px;margin:6px 0 12px;overflow-x:auto;scrollbar-width:none}
.bf-meta::-webkit-scrollbar{display:none}
.bf-meta span{flex:none;display:flex;align-items:center;gap:4px;font-size:11.5px;font-weight:600;background:rgba(255,255,255,.14);padding:5px 8px;border-radius:999px;white-space:nowrap}
.bf-meta svg{width:13px;height:13px}
.bf-hours{display:grid;grid-template-columns:repeat(8,1fr);background:rgba(0,0,0,.14);border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:9px 2px 8px;margin-bottom:10px}
.bf-hours>div{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0}
.bf-hours span{font-size:10.5px;font-weight:700;opacity:.8;white-space:nowrap}
.bf-hours b{font-size:13.5px;font-weight:800}
.bf-hours i{font-style:normal;font-size:9.5px;font-weight:700;color:#bfe3ff;height:12px;line-height:12px}
.bf-hours .bf-now span{opacity:1}
.bf-tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
.bf-tile{border:0;text-align:left;background:rgba(255,255,255,.14);border-radius:16px;padding:10px 11px;cursor:pointer;min-width:0;display:flex;flex-direction:column;gap:1px;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.bf-tile:active{transform:scale(.98)}
.bf-tile .bf-tl{display:flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;opacity:.85}
.bf-tile .bf-tl svg{width:13px;height:13px}
.bf-tile b{font-size:17px;font-weight:800;letter-spacing:-.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bf-tile small{font-size:12px;opacity:.88;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}
.bf-pill{display:inline-block;font-size:10.5px;font-weight:800;padding:1px 6px;border-radius:999px;background:rgba(255,255,255,.22);margin-left:2px;vertical-align:1px}
.bf-play{width:100%;border:0;display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.96);border-radius:18px;padding:9px 14px 9px 9px;cursor:pointer;box-shadow:0 10px 24px -8px rgba(0,0,0,.35);transition:transform .15s var(--ease)}
.bf-card .bf-play{color:#151b33}
.bf-play:active{transform:scale(.98)}
.bf-play .bf-pi{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;flex:none;box-shadow:0 6px 14px -4px var(--accent)}
.bf-play .bf-pi svg{width:19px;height:19px}
.bf-play .bf-pt{flex:1;text-align:left;min-width:0}
.bf-play .bf-pt b{display:block;font-size:15px;font-weight:800}
.bf-play .bf-pt small{display:block;font-size:12px;color:#5d6580;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bf-eq{display:flex;align-items:center;gap:3px;height:22px}
.bf-eq i{width:3.5px;height:6px;border-radius:3px;background:linear-gradient(180deg,var(--accent2),var(--accent));opacity:.55}
.bf-playing .bf-eq i{animation:bfEq .9s ease-in-out infinite;opacity:1}
.bf-eq i:nth-child(2){animation-delay:.15s}.bf-eq i:nth-child(3){animation-delay:.3s}.bf-eq i:nth-child(4){animation-delay:.45s}
@keyframes bfEq{0%,100%{height:5px}50%{height:20px}}
.bf-cap{margin-top:10px;font-size:13.5px;line-height:1.5;background:rgba(0,0,0,.18);border-radius:14px;padding:10px 12px;animation:fadeUp .3s var(--ease)}
.bf-foot{display:flex;justify-content:space-between;gap:8px;font-size:11px;opacity:.72;margin-top:10px;font-weight:600}
.bf-foot .bf-off{color:#ffe7a3;opacity:1}
.bf-setup{display:flex;align-items:center;gap:10px;margin:8px 0 12px}
.bf-setup b{display:block;font-size:17px;font-weight:800;letter-spacing:-.2px}
.bf-setup span{font-size:13px;opacity:.88}
.bf-acts{display:grid;grid-template-columns:1.35fr 1fr 1fr;gap:8px;margin-bottom:12px}
.bf-acts .bf-btn{justify-content:center;padding:11px 8px}
.bf-btn{display:flex;align-items:center;gap:6px;white-space:nowrap;border:0;background:rgba(255,255,255,.18);border-radius:13px;padding:10px 13px;font-weight:700;font-size:13.5px;cursor:pointer}
.bf-btn.solid{background:rgba(255,255,255,.95)}
.bf-card .bf-btn.solid{color:#151b33}
.bf-btn svg{width:16px;height:16px}
.bf-sk{background:linear-gradient(90deg,rgba(255,255,255,.14) 25%,rgba(255,255,255,.3) 50%,rgba(255,255,255,.14) 75%);background-size:300% 100%;animation:bfShim 1.4s ease-in-out infinite;border-radius:12px}
@keyframes bfShim{from{background-position:100% 0}to{background-position:-50% 0}}
.bf-err{display:flex;align-items:center;gap:10px;background:rgba(0,0,0,.16);border-radius:16px;padding:12px;margin:8px 0 12px}
.bf-err div{flex:1;min-width:0}.bf-err b{display:block;font-size:14px}.bf-err span{font-size:12.5px;opacity:.85}
/* animated icon bits */
.bf-anim .bf-spin{animation:bfSpin 18s linear infinite}
@keyframes bfSpin{to{transform:rotate(360deg)}}
.bf-anim .bf-drift{animation:bfDrift 5s ease-in-out infinite}
@keyframes bfDrift{50%{transform:translateX(2.5px)}}
.bf-anim .bf-drop{animation:bfDrop 1.1s ease-in infinite}
@keyframes bfDrop{0%{opacity:0;transform:translateY(-3px)}30%{opacity:1}100%{opacity:0;transform:translateY(6px)}}
.bf-anim .bf-flake{animation:bfFlk 2.2s ease-in-out infinite}
@keyframes bfFlk{0%{opacity:0;transform:translateY(-3px)}40%{opacity:1}100%{opacity:0;transform:translateY(6px)}}
.bf-anim .bf-bolt{animation:bfBolt 3s infinite}
@keyframes bfBolt{0%,80%,100%{opacity:1}85%,90%{opacity:.25}}
/* themes */
.bf-t-morning{background:linear-gradient(150deg,#f3864f 0%,#e98b67 22%,#5b93dd 64%,#2f63c8 100%);--bf-shadow:rgba(220,110,70,.45)}
.bf-t-sunny{background:linear-gradient(155deg,#3aa0f5 0%,#1f78e0 50%,#1556be 100%);--bf-shadow:rgba(31,120,224,.5)}
.bf-t-golden{background:linear-gradient(150deg,#ec8a3c 0%,#d9586a 52%,#6a40b8 100%);--bf-shadow:rgba(217,88,106,.45)}
.bf-t-partly{background:linear-gradient(155deg,#4b92e0 0%,#3a6fc3 55%,#4c5f93 100%);--bf-shadow:rgba(58,111,195,.45)}
.bf-t-cloudy{background:linear-gradient(155deg,#6f7f9e 0%,#55627f 55%,#3d4864 100%);--bf-shadow:rgba(60,72,100,.5)}
.bf-t-fog{background:linear-gradient(155deg,#8a94a8 0%,#666f86 55%,#4a5268 100%);--bf-shadow:rgba(80,88,110,.45)}
.bf-t-rain{background:linear-gradient(160deg,#41618f 0%,#2e4577 55%,#1e2c55 100%);--bf-shadow:rgba(30,44,85,.55)}
.bf-t-storm{background:linear-gradient(160deg,#47367a 0%,#2c2356 55%,#161331 100%);--bf-shadow:rgba(44,35,86,.6)}
.bf-t-snow{background:linear-gradient(160deg,#6e9bd3 0%,#5275b4 55%,#3c5690 100%);--bf-shadow:rgba(60,86,144,.5)}
.bf-t-night{background:linear-gradient(160deg,#25306a 0%,#161b47 55%,#0b0e2a 100%);--bf-shadow:rgba(22,27,71,.6)}
.bf-t-nightcloud{background:linear-gradient(160deg,#34405f 0%,#222a45 55%,#12172b 100%);--bf-shadow:rgba(20,26,48,.6)}
.bf-t-nightrain{background:linear-gradient(160deg,#243458 0%,#172140 55%,#0b1124 100%);--bf-shadow:rgba(16,24,50,.6)}
.bf-t-neutral{background:linear-gradient(155deg,#2a8f9d 0%,#22678f 50%,#2b3f86 100%);--bf-shadow:rgba(34,103,143,.45)}
[data-theme="light"] .bf-card{box-shadow:0 18px 36px -14px var(--bf-shadow,rgba(30,60,140,.5))}
/* morning "brief is ready" state of the Play button (in the card, so it never covers anything) */
.bf-play.bf-ready{box-shadow:0 0 0 3px rgba(255,255,255,.35),0 10px 24px -8px rgba(0,0,0,.35);animation:bfReady 2.6s ease-in-out 3}
@keyframes bfReady{50%{box-shadow:0 0 0 6px rgba(255,255,255,.18),0 10px 24px -8px rgba(0,0,0,.35)}}
.bf-play .bf-pi{position:relative}
.bf-play .bf-new{position:absolute;top:-3px;right:-3px;width:11px;height:11px;border-radius:50%;background:#ffb020;border:2px solid #fff}
/* location modal */
.bf-m p{color:var(--muted);margin:-6px 0 14px;font-size:13.5px}
.bf-m .bf-gps{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:12px}
.bf-m .bf-gps svg{width:18px;height:18px}
.bf-m .bf-or{display:flex;align-items:center;gap:10px;color:var(--faint-ink);font-size:12px;font-weight:600;margin:2px 0 10px}
.bf-m .bf-or::before,.bf-m .bf-or::after{content:"";flex:1;height:1px;background:var(--line)}
.bf-m .bf-q{position:relative}
.bf-m .bf-q svg{position:absolute;left:12px;top:13px;width:18px;height:18px;color:var(--muted)}
.bf-m .bf-q input{padding-left:38px}
.bf-m .bf-res{display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto}
.bf-m .bf-r{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid var(--line);background:var(--card);border-radius:14px;padding:11px 12px;cursor:pointer;color:var(--text)}
.bf-m .bf-r svg{width:17px;height:17px;color:var(--accent-ink);flex:none}
.bf-m .bf-r b{display:block;font-size:14.5px}
.bf-m .bf-r small{color:var(--muted);font-size:12px}
.bf-m .bf-note{color:var(--muted);font-size:13px;text-align:center;padding:10px}
.bf-m .bf-msg{font-size:13px;border-radius:12px;padding:10px 12px;margin:-4px 0 12px;background:rgba(245,158,11,.12);color:var(--text)}
@media (prefers-reduced-motion: reduce){.bf-card,.bf-card *,.bf-card *::before{animation:none!important}}
`);

  // gradient defs for the weather icons (kept in the document once; not display:none so gradients resolve)
  function ensureDefs(){
    if (document.getElementById('bfDefs')) return;
    const d = document.createElement('div'); d.id = 'bfDefs'; d.setAttribute('aria-hidden','true');
    d.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    d.innerHTML = `<svg width="0" height="0"><defs>
      <linearGradient id="bfSun" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset="1" stop-color="#ff9f2e"/></linearGradient>
      <linearGradient id="bfMoon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbe8"/><stop offset="1" stop-color="#c9d2ff"/></linearGradient>
      <linearGradient id="bfCloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9e3f2"/></linearGradient>
      <linearGradient id="bfCloudD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9d2e2"/><stop offset="1" stop-color="#8996ad"/></linearGradient>
      <linearGradient id="bfBolt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff06a"/><stop offset="1" stop-color="#ffb020"/></linearGradient>
    </defs></svg>`;
    document.body.appendChild(d);
  }

  /* ---------------- network ---------------- */
  function getJSON(url, ms){
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(()=>{ try { ctl && ctl.abort(); } catch(e){} }, ms || 10000);
    return fetch(url, ctl ? {signal:ctl.signal} : {}).then(r=>{ clearTimeout(timer); if (!r.ok) throw new Error('HTTP '+r.status); return r.json(); }, e=>{ clearTimeout(timer); throw e; });
  }
  function wxURL(l){
    return 'https://api.open-meteo.com/v1/forecast?latitude='+(+l.lat).toFixed(4)+'&longitude='+(+l.lon).toFixed(4)+
      '&current=temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m'+
      '&hourly=temperature_2m,weather_code,precipitation_probability,apparent_temperature'+
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max'+
      '&timezone=auto&forecast_days=3';
  }
  function parseWx(d, l){
    if (!d || !d.current || !d.hourly || !d.daily || !Array.isArray(d.hourly.time) || !Array.isArray(d.daily.time)) throw new Error('Unexpected weather data');
    const c = d.current, h = d.hourly, dl = d.daily;
    return {at:Date.now(), key:locKey(l), off:+d.utc_offset_seconds || 0,
      cur:{time:c.time, t:c.temperature_2m, feels:c.apparent_temperature, code:c.weather_code, isDay:c.is_day, wind:c.wind_speed_10m, hum:c.relative_humidity_2m},
      h:{time:h.time, t:h.temperature_2m||[], code:h.weather_code||[], pop:h.precipitation_probability||[], feels:h.apparent_temperature||[]},
      d:{time:dl.time, code:dl.weather_code||[], max:dl.temperature_2m_max||[], min:dl.temperature_2m_min||[], pop:dl.precipitation_probability_max||[], rise:dl.sunrise||[], set:dl.sunset||[], uv:dl.uv_index_max||[]}};
  }
  const fetchForecast = l => getJSON(wxURL(l), 10000).then(d=>parseWx(d, l));
  const geocode = q => getJSON('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(q)+'&count=5&language=en&format=json', 8000)
    .then(d=>(d && d.results || []).map(r=>({lat:r.latitude, lon:r.longitude, name:r.name, region:[r.admin1, r.country].filter((x,i,a)=>x && a.indexOf(x)===i && x!==r.name).join(', '), src:'search'})));

  function cached(){ return st.loc && st.wx && st.wx.key === locKey(st.loc) ? st.wx : null; }
  function isFresh(){ const w = cached(); return !!w && Date.now() - w.at < FRESH; }
  function refresh(force){
    if (!st.loc) return Promise.resolve(null);
    if (inflight) return inflight;
    if (!force && isFresh()) return Promise.resolve(cached());
    const l = st.loc;
    inflight = fetchForecast(l).then(wx=>{
      if (locKey(st.loc) === wx.key){ st.wx = wx; J.save(); }
      lastErr = 0; return wx;
    }).catch(e=>{ lastErr = Date.now(); return null; })
      .finally(()=>{ inflight = null; paint(); });
    paint();
    return inflight;
  }
  function maybeRefresh(){
    if (!st.loc || inflight || isFresh()) return;
    if (navigator.onLine === false) return;
    if (lastErr && Date.now() - lastErr < 60e3) return;   // don't hammer after a failure
    refresh(false);
  }
  window.addEventListener('online', ()=>{ lastErr = 0; maybeRefresh(); });

  /* ---------------- weather math (all in the location's own clock) ---------------- */
  function locNow(wx){ return new Date(Date.now() + wx.off*1000).toISOString().slice(0,16); }
  function isDayAt(wx, iso){
    const i = wx.d.time.indexOf(iso.slice(0,10));
    if (i < 0 || !wx.d.rise[i] || !wx.d.set[i]) { const h = hourOf(iso); return h >= 6 && h < 18; }
    return iso >= wx.d.rise[i] && iso < wx.d.set[i];
  }
  function now(wx){
    if (!wx) return null;
    const n = locNow(wx); const di = wx.d.time.indexOf(n.slice(0,10)); const hi = wx.h.time.indexOf(n.slice(0,13)+':00');
    if (di < 0 || hi < 0) return null;                    // cache too old to describe today
    const age = Date.now() - wx.at, live = age < 60*60e3 && num(wx.cur.t);
    const day = isDayAt(wx, n);
    const v = {n, di, hi, age, day, live,
      t: live ? wx.cur.t : wx.h.t[hi], code: live ? wx.cur.code : wx.h.code[hi], feels: live ? wx.cur.feels : wx.h.feels[hi],
      wind: live ? wx.cur.wind : null, max: wx.d.max[di], min: wx.d.min[di], pop: wx.d.pop[di], uv: wx.d.uv[di], rise: wx.d.rise[di], set: wx.d.set[di]};
    if (!num(v.t)) return null;
    let phase = 'night';
    if (day){ phase = 'day';
      if (v.rise && (P(n) - P(v.rise)) / 6e4 < 180) phase = 'morning';
      if (v.set && (P(v.set) - P(n)) / 6e4 < 80) phase = 'golden'; }
    v.phase = phase; return v;
  }
  function themeFor(code, phase){
    const g = wmo(code)[0];
    if (phase === 'night') return (g === 'rain' || g === 'drizzle' || g === 'storm' || g === 'snow') ? (g === 'storm' ? 'storm' : 'nightrain') : (g === 'clear' ? 'night' : 'nightcloud');
    if (g === 'storm') return 'storm';
    if (g === 'rain' || g === 'drizzle') return 'rain';
    if (g === 'snow') return 'snow';
    if (g === 'fog') return 'fog';
    if (g === 'cloudy') return 'cloudy';
    if (g === 'partly') return phase === 'golden' ? 'golden' : 'partly';
    return phase === 'morning' ? 'morning' : phase === 'golden' ? 'golden' : 'sunny';
  }
  function fxFor(theme){
    if (theme === 'sunny' || theme === 'morning' || theme === 'golden') return '<div class="bf-glow"></div>';
    if (theme === 'night') return '<div class="bf-moonglow"></div>' + [[8,14],[22,40],[38,10],[55,28],[70,12],[84,44],[63,58],[14,66],[92,20],[46,74]].map(([x,y],i)=>`<i class="bf-star" style="left:${x}%;top:${y}%;animation-delay:${(i*.37)%3}s"></i>`).join('');
    if (theme === 'partly' || theme === 'cloudy' || theme === 'fog' || theme === 'nightcloud') return '<div class="bf-fxcloud" style="top:18px"></div><div class="bf-fxcloud" style="top:120px;animation-delay:-13s;animation-duration:34s"></div>';
    if (theme === 'rain' || theme === 'nightrain') return '<div class="bf-rain"></div>';
    if (theme === 'storm') return '<div class="bf-rain"></div><div class="bf-flash"></div>';
    if (theme === 'snow') return '<div class="bf-snowfx"></div>';
    return '';
  }
  function deviceTheme(){ const h = new Date().getHours(); return h < 6 || h >= 19 ? 'night' : 'neutral'; }
  // rain outlook for a day: highest chance from now (today) or all day (other days), and when it is most likely
  function rainOutlook(wx, v, dayIdx){
    const date = wx.d.time[dayIdx]; if (!date) return null;
    let i = dayIdx === 0 ? v.hi : wx.h.time.indexOf(date+'T00:00'); if (i < 0) return null;
    let max = 0, at = null, first = null;
    for (; i < wx.h.time.length && wx.h.time[i].slice(0,10) === date; i++){
      const p = wx.h.pop[i]; if (!num(p)) continue;
      if (p > max){ max = p; at = wx.h.time[i]; }
      if (first === null && p >= 50) first = wx.h.time[i];
    }
    if (dayIdx > 0 && !max && num(wx.d.pop[dayIdx])) max = wx.d.pop[dayIdx];
    const when = first || at, hi = when ? wx.h.time.indexOf(when) : -1;
    const kind = hi >= 0 && wmo(wx.h.code[hi])[0] === 'snow' ? 'snow' : 'rain';
    return {max, at: when, likely: max >= 50, kind};
  }
  const pct10 = p => Math.max(10, Math.round(p/10)*10);
  const deg = c => { const v = r0(conv(c)); return (v < 0 ? 'minus ' + (-v) : v) + (Math.abs(v) === 1 ? ' degree' : ' degrees'); };
  const n = c => { const v = r0(conv(c)); return v < 0 ? 'minus ' + (-v) : String(v); };

  /* ---------------- reminders + spending ---------------- */
  function remindersToday(){
    const t = Date.now(), today = new Date().toDateString();
    const rs = J.db.reminders || [];
    const list = rs.filter(r=>!r.done && r.at >= t - 6e4 && new Date(r.at).toDateString() === today).sort((a,b)=>a.at-b.at);
    const next = rs.filter(r=>!r.done && r.at >= t - 6e4).sort((a,b)=>a.at-b.at)[0] || null;
    const overdue = rs.filter(r=>!r.done && r.at < t - 6e4).length;
    return {list, next, overdue, any: rs.length > 0};
  }
  const remTime = ts => { const d = new Date(ts); return h12(d.getHours(), d.getMinutes()); };
  function spending(){
    const exp = (J.db.expenses || []).filter(e=>e.type === 'expense' && num(+e.amount));
    if (!exp.length) return null;
    const t0 = new Date(); t0.setHours(0,0,0,0); const today = t0.getTime();
    const y0 = new Date(t0); y0.setDate(y0.getDate()-1); const yStart = y0.getTime();
    const yesterday = exp.filter(e=>e.at >= yStart && e.at < today).reduce((s,e)=>s + +e.amount, 0);
    const first = Math.min(...exp.map(e=>e.at));
    // daily average over the last 30 full days (or since the first expense, if that is more recent)
    const days = Math.min(30, Math.floor((today - new Date(first).setHours(0,0,0,0)) / 864e5));
    let avg = null;
    if (days >= 3){ const from = today - days*864e5; avg = exp.filter(e=>e.at >= from && e.at < today).reduce((s,e)=>s + +e.amount, 0) / days; }
    return {yesterday, avg, days};
  }
  const CUR_WORD = {'$':['dollar','dollars'], '€':['euro','euros'], '£':['pound','pounds'], 'L£':['Lebanese pound','Lebanese pounds'], 'AED':['dirham','dirhams'], 'SAR':['riyal','riyals']};
  function money(v){
    const c = J.settings.currency || '$'; const x = v >= 10 ? r0(v) : Math.round(v*100)/100;
    const w = CUR_WORD[c]; const s = x.toLocaleString('en-US');
    return w ? `${s} ${x === 1 ? w[0] : w[1]}` : J.fmt(x);
  }
  function compare(y, avg){
    if (!avg) return null; const ratio = y / avg;
    if (ratio < .6) return {word:'well under', short:'Well under avg', pct:r0((1-ratio)*100), dir:-1};
    if (ratio < .9) return {word:'a bit under', short:'Under avg', pct:r0((1-ratio)*100), dir:-1};
    if (ratio <= 1.1) return {word:'about the same as', short:'About average', pct:0, dir:0};
    if (ratio <= 1.5) return {word:'a bit over', short:'Over avg', pct:r0((ratio-1)*100), dir:1};
    return {word:'well over', short:'Well over avg', pct:r0((ratio-1)*100), dir:1};
  }

  /* ---------------- what Jarvis says ---------------- */
  function weatherLines(wx, place, opts){
    const v = now(wx); if (!v) return null; opts = opts || {};
    const out = []; const h = hourOf(v.n);
    out.push(`It's ${deg(v.t)} ${sayCond(v.code, v.day)}${place ? ' in ' + place : ''}.`);
    if (num(v.feels) && Math.abs(v.feels - v.t) >= 2.5) out.push(`It feels more like ${n(v.feels)}.`);
    const g = wmo(v.code)[0], wetNow = g === 'rain' || g === 'drizzle' || g === 'storm', snowNow = g === 'snow';
    if (h < 17){
      if (num(v.max) && num(v.min) && v.max - v.min < 1.5) out.push(`It stays around ${n(v.max)} all day.`);
      else if (num(v.max) && num(v.min)) out.push(v.t < v.max - 0.5 ? `Up to ${n(v.max)} later, with a low of ${n(v.min)}.` : `That's about today's high. The low is ${n(v.min)}.`);
      const ro = rainOutlook(wx, v, 0);
      if (ro){
        if (wetNow) out.push('Keep an umbrella handy.');
        else if (snowNow) out.push('Dress warmly and take care on the roads.');
        else if (ro.likely) out.push(ro.kind === 'snow' ? `Snow is likely around ${isoTime(ro.at)}, so dress warmly.` : `Rain is likely around ${isoTime(ro.at)}, so take an umbrella.`);
        else if (ro.max >= 20) out.push(`There's a small chance of ${ro.kind}, about ${pct10(ro.max)} percent.`);
        else out.push(h >= 12 ? 'No rain expected for the rest of the day.' : 'No rain expected.');
      }
      if (opts.uv !== false && v.day && h < 15 && (g === 'clear' || g === 'partly') && num(v.uv) && v.uv >= 6) out.push(`The UV index is high, so wear sunscreen.`);
    } else {
      const ro = rainOutlook(wx, v, 0);
      if (wetNow) out.push('Keep an umbrella handy tonight.');
      else if (snowNow) out.push('Dress warmly if you go out.');
      else if (ro && ro.likely) out.push(`${ro.kind === 'snow' ? 'Snow' : 'Rain'} is likely around ${isoTime(ro.at)}.`);
      const t1 = 1 + v.di;
      if (wx.d.time[t1] && num(wx.d.max[t1])){
        const r1 = rainOutlook(wx, v, t1);
        const g1 = wmo(wx.d.code[t1])[0], wet1 = g1 === 'rain' || g1 === 'drizzle' || g1 === 'storm' || g1 === 'snow';
        out.push(`Tomorrow looks ${LOOKS[g1] || 'cloudy'}, with a high of ${n(wx.d.max[t1])}${r1 && r1.likely && !wet1 ? ` and a good chance of ${r1.kind}` : ''}.`);
      }
    }
    return out.join(' ');
  }
  function reminderLine(){
    const r = remindersToday(); if (!r.any) return null;
    let s;
    if (r.list.length === 1) s = `You have one reminder today: ${lc(r.list[0].text)} at ${remTime(r.list[0].at)}.`;
    else if (r.list.length > 1) s = `You have ${r.list.length} reminders today. First up: ${lc(r.list[0].text)} at ${remTime(r.list[0].at)}.`;
    else s = 'No reminders left for today.';
    if (r.overdue) s += r.overdue === 1 ? ' One reminder is overdue.' : ` ${r.overdue} reminders are overdue.`;
    return s;
  }
  function spendLine(){
    const sp = spending(); if (!sp) return null; const out = [];
    if (sp.yesterday > 0){
      const c = compare(sp.yesterday, sp.avg);
      out.push(c ? `Yesterday you spent ${money(sp.yesterday)}, ${c.word} your daily average of ${money(sp.avg)}.` : `Yesterday you spent ${money(sp.yesterday)}.`);
    } else if (sp.days >= 1) out.push(`You didn't log any spending yesterday.`);
    const S = J.settings;
    if (S.budget > 0){
      const left = S.budget - J.sum(J.inMonth(J.monthKey(Date.now())));
      out.push(left >= 0 ? `You have ${money(left)} left in this month's budget.` : `You're ${money(-left)} over this month's budget.`);
    }
    return out.join(' ') || null;
  }
  function closing(){ const h = new Date().getHours(); return h < 12 ? 'Have a great day.' : h < 17 ? 'Have a great afternoon.' : 'Have a relaxing evening.'; }
  function composeBrief(){
    const S = J.settings, parts = [];
    const name = (S.name || '').trim();
    parts.push(name && name.toLowerCase() !== 'there' ? `${J.greeting()}, ${name}.` : `${J.greeting()}.`);
    const wx = cached(); let w = null; if (wx){ w = weatherLines(wx, placeName()); if (w) parts.push(w); }
    if (!w) parts.push(st.loc ? "I'm still getting the weather, ask me again in a moment." : "For the weather, tell me your city, for example: set my city to Beirut.");
    const r = reminderLine(); parts.push(r || 'You have nothing scheduled today.');
    const s = spendLine(); if (s) parts.push(s);
    briefLines.forEach(fn=>{
      try {
        let x = fn(); if (typeof x !== 'string') return;
        x = x.replace(/\s+/g, ' ').trim(); if (!x) return;
        x = x.charAt(0).toUpperCase() + x.slice(1);
        if (!/[.!?…]["”')]*$/.test(x)) x += '.';
        if (!parts.includes(x)) parts.push(x);
      } catch(e){ if (!fn.bfWarned){ fn.bfWarned = true; try { console.warn('A morning-brief line failed and was skipped:', e); } catch(_){} } }
    });
    parts.push(closing());
    return parts.join(' ');
  }

  /* ---------------- tomorrow: weather, calendar and reminders for the next day ---------------- */
  function calendarBetween(from, to){
    const C = J.calendar; if (!C) return null;
    try {
      if (typeof C.between === 'function') return C.between(from, to) || [];
      const s = C.store; if (!s || (!s.syncedAt && !(s.local || []).length)) return null;   // calendar not connected: say nothing about it
      return [].concat(s.events || [], s.local || []).filter(e => e && e.title && +e.start < to && +e.end > from).sort((a,b)=>(b.allDay - a.allDay) || a.start - b.start);
    } catch(e){ return null; }
  }
  function remindersBetween(from, to){
    const out = [];
    (J.db.reminders || []).forEach(r=>{
      if (r.done || !num(+r.at)) return;
      let at = +r.at;
      if (r.repeat === 'daily') while (at < from) at += 864e5;          // a daily reminder also happens tomorrow
      else if (r.repeat === 'weekly') while (at < from) at += 7*864e5;
      if (at >= from && at < to) out.push({text:r.text, at});
    });
    return out.sort((a,b)=>a.at-b.at);
  }
  const andList = a => a.length <= 1 ? a.join('') : a.slice(0,-1).join(', ') + ' and ' + a[a.length-1];
  function composeTomorrow(){
    const t0 = new Date(); t0.setHours(0,0,0,0); t0.setDate(t0.getDate()+1);
    const from = t0.getTime(), t1 = new Date(t0); t1.setDate(t1.getDate()+1); const to = t1.getTime();
    const parts = [`Here's tomorrow, ${t0.toLocaleDateString('en-US', {weekday:'long', month:'long', day:'numeric'})}.`];
    // weather
    const wx = cached(), v = now(wx), i = v ? v.di + 1 : -1;
    if (!st.loc) parts.push('For the weather, tell me your city, for example: set my city to Beirut.');
    else if (v && wx.d.time[i] && num(wx.d.max[i])){
      const ro = rainOutlook(wx, v, i);
      parts.push(`In ${placeName()} it looks ${LOOKS[wmo(wx.d.code[i])[0]] || 'cloudy'}, with a high of ${n(wx.d.max[i])} and a low of ${n(wx.d.min[i])}.` +
        (ro ? (ro.likely ? ` ${ro.kind === 'snow' ? 'Snow' : 'Rain'} is likely around ${isoTime(ro.at)}, so ${ro.kind === 'snow' ? 'dress warmly' : 'take an umbrella'}.` : ro.max >= 20 ? ` There's about a ${pct10(ro.max)} percent chance of ${ro.kind}.` : ' No rain expected.') : ''));
    } else parts.push("I'm still getting tomorrow's weather, ask me again in a moment.");
    // calendar
    const evs = calendarBetween(from, to);
    if (evs){
      if (!evs.length) parts.push('Your calendar is clear.');
      else { const say = evs.slice(0, 5).map(e => e.allDay ? `${e.title}, all day` : `${e.title} at ${remTime(e.start)}`);
        parts.push(`On your calendar: ${andList(say)}${evs.length > 5 ? `, plus ${evs.length - 5} more` : ''}.`); }
    }
    // reminders
    const rs = remindersBetween(from, to);
    if (rs.length === 1) parts.push(`You have one reminder: ${lc(rs[0].text)} at ${remTime(rs[0].at)}.`);
    else if (rs.length > 1) parts.push(`You have ${rs.length} reminders: ${andList(rs.slice(0, 4).map(r=>`${lc(r.text)} at ${remTime(r.at)}`))}${rs.length > 4 ? `, plus ${rs.length - 4} more` : ''}.`);
    else parts.push(evs && evs.length ? 'No reminders.' : 'No reminders set for tomorrow.');
    parts.push(new Date().getHours() >= 17 ? 'Sleep well.' : "That's tomorrow.");
    return parts.join(' ');
  }

  /* ---------------- speaking ---------------- */
  function sayNow(text){
    const S = J.settings, was = S.speak; S.speak = true;   // the Play button always speaks, even if replies are muted
    try { J.speak(text); } finally { S.speak = was; }
  }
  function stopPoll(){ clearInterval(pollT); pollT = null; }
  function watchSpeech(){
    stopPoll(); let ticks = 0;
    pollT = setInterval(()=>{
      ticks++; let speaking = false; try { speaking = speechSynthesis.speaking || speechSynthesis.pending; } catch(e){}
      if (!speaking && ticks > 4){ stopPoll(); playing = false; paint(); }
    }, 300);
  }
  function playBrief(){
    ready = false;
    if (playing){ try { speechSynthesis.cancel(); } catch(e){} playing = false; stopPoll(); paint(); return; }
    const text = composeBrief(); caption = text;
    if (!('speechSynthesis' in window)){ playing = false; paint(); J.toast("Voice isn't available here, so here's your brief as text."); return; }
    playing = true; sayNow(text); watchSpeech(); paint();
    maybeRefresh();
  }
  // a reply that arrives after a network call: shown in the chat like a normal Jarvis reply
  function lateReply(text){
    const chat = document.getElementById('chat');
    if (J.addLateReply){ try { J.addLateReply(text); } catch(e){} }
    else if (chat){ const el = document.createElement('div'); el.className = 'msg ai'; el.innerHTML = `<div class="who">Jarvis</div>${J.esc(text)}`; chat.appendChild(el); chat.scrollTop = chat.scrollHeight; }
    let tries = 0;
    (function waitTurn(){ let busy = false; try { busy = speechSynthesis.speaking; } catch(e){} if (busy && ++tries < 32) return setTimeout(waitTurn, 250); J.speak(text); })();
  }

  /* ---------------- the Home card ---------------- */
  function ago(ms){ const m = Math.floor(ms/6e4); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.floor(m/60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago'); return Math.floor(h/24) + 'd ago'; }
  function estSeconds(text){ return Math.max(10, Math.round(text.split(/\s+/).length / 2.7 / 5) * 5); }
  // the length estimate needs the whole brief (incl. other features' lines): compute it at most once a minute, not on every paint
  function estimate(){ const k = Math.floor(Date.now()/60e3) + '|' + (cached() ? cached().at : 0) + '|' + st.unit; if (!estCache || estCache.k !== k) estCache = {k, s: estSeconds(composeBrief())}; return estCache.s; }
  function headHTML(){
    return `<div class="bf-head">
      <button class="bf-loc" data-bf="loc" aria-label="Change location">${UI.pin}<span>${st.loc ? J.esc(placeName()) : 'Set location'}</span><span class="bf-chev">${UI.chev}</span></button>
      <div class="bf-unit" role="group" aria-label="Temperature unit"><button data-bf-unit="C" class="${st.unit==='C'?'on':''}">°C</button><button data-bf-unit="F" class="${st.unit==='F'?'on':''}">°F</button></div></div>`;
  }
  function weatherHTML(wx, v){
    const hours = [];
    for (let i = v.hi; i < v.hi + 8 && i < wx.h.time.length; i++){
      const iso = wx.h.time[i], p = wx.h.pop[i];
      hours.push(`<div class="${i===v.hi?'bf-now':''}"><span>${i===v.hi ? 'Now' : isoTime(iso).replace(' ','')}</span>${icon(wx.h.code[i], isDayAt(wx, iso), 28, false)}<b>${T(i===v.hi ? v.t : wx.h.t[i])}°</b><i>${num(p) && p >= 20 ? p+'%' : ''}</i></div>`);
    }
    const ro = rainOutlook(wx, v, 0);
    const chips = [];
    chips.push(`<span>${UI.drop}${ro ? (ro.max >= 20 ? `${ro.max}% rain${ro.at ? ' · ' + isoTime(ro.at) : ''}` : 'No rain') : (num(v.pop) ? v.pop+'% rain' : '–')}</span>`);
    const g0 = wmo(v.code)[0];
    if (v.day && num(v.uv) && (g0 === 'clear' || g0 === 'partly' || !(ro && ro.max >= 20 && ro.at))) chips.push(`<span>${UI.uv}UV ${r0(v.uv)}</span>`);
    if (num(v.wind)) chips.push(`<span>${UI.wind}${st.unit==='F' ? r0(v.wind*0.621371)+' mph' : r0(v.wind)+' km/h'}</span>`);
    if (v.day && v.set) chips.push(`<span>${UI.sunset}${isoTime(v.set)}</span>`);
    else if (!v.day){ const nx = v.n < (v.rise||'') ? v.rise : wx.d.rise[v.di+1]; if (nx) chips.push(`<span>${UI.sunrise}${isoTime(nx)}</span>`); }
    return `<div class="bf-main">${icon(v.code, v.day, 86, true)}<div class="bf-temp">${T(v.t)}<sup>°${st.unit}</sup></div>
      <div class="bf-side"><b>${desc(v.code, v.day)}</b>${num(v.feels) ? `<span>Feels like ${T(v.feels)}°</span>` : ''}${num(v.max) ? `<span>H ${T(v.max)}° · L ${T(v.min)}°</span>` : ''}</div></div>
      <div class="bf-meta">${chips.join('')}</div>
      <div class="bf-hours" aria-label="Next hours">${hours.join('')}</div>`;
  }
  function skeletonHTML(){
    return `<div class="bf-main" aria-label="Loading weather"><div class="bf-sk" style="width:78px;height:78px;border-radius:50%"></div><div class="bf-sk" style="width:92px;height:56px;margin-left:8px"></div>
      <div style="margin-left:auto;display:flex;flex-direction:column;gap:7px;align-items:flex-end"><div class="bf-sk" style="width:90px;height:16px"></div><div class="bf-sk" style="width:70px;height:12px"></div><div class="bf-sk" style="width:80px;height:12px"></div></div></div>
      <div class="bf-meta"><div class="bf-sk" style="width:84px;height:24px;border-radius:999px"></div><div class="bf-sk" style="width:60px;height:24px;border-radius:999px"></div><div class="bf-sk" style="width:70px;height:24px;border-radius:999px"></div></div>
      <div class="bf-sk" style="height:84px;border-radius:18px;margin-bottom:10px"></div>`;
  }
  function tilesHTML(){
    const r = remindersToday(); const sp = spending(); const cur = J.settings.currency;
    let rem;
    if (r.list.length) rem = `<b>${r.list.length} today${r.overdue ? ` <span class="bf-pill">${r.overdue} late</span>` : ''}</b><small>Next: ${J.esc(r.list[0].text)} · ${remTime(r.list[0].at)}</small>`;
    else if (r.overdue) rem = `<b>${r.overdue} overdue</b><small>Nothing else today</small>`;
    else if (r.next) rem = `<b>Clear today</b><small>Next: ${J.esc(J.whenText(r.next.at))}</small>`;
    else rem = `<b>Clear today</b><small>Say “Remind me to…”</small>`;
    let spd;
    if (!sp) spd = `<b>${J.fmt(0)}</b><small>Say “Paid 10 for coffee”</small>`;
    else {
      const c = compare(sp.yesterday, sp.avg);
      const sub = sp.yesterday > 0 && c ? (c.dir === 0 ? `About your daily avg` : `${c.dir < 0 ? '▼' : '▲'} ${c.pct}% vs daily avg`) : sp.avg ? `Daily avg ${J.fmt(r0(sp.avg))}` : (sp.yesterday > 0 ? 'Keep logging to see trends' : 'Nothing logged');
      spd = `<b>${J.fmt(Math.round(sp.yesterday*100)/100)}</b><small>${sub}</small>`;
    }
    return `<div class="bf-tiles">
      <button class="bf-tile" data-go="reminders"><span class="bf-tl">${UI.bell}Reminders</span>${rem}</button>
      <button class="bf-tile" data-go="budget"><span class="bf-tl">${UI.card}Yesterday</span>${spd}</button></div>`;
  }
  function playHTML(){
    const secs = estimate(), rd = ready && !playing;
    return `<button class="bf-play ${playing?'bf-playing':''}${rd?' bf-ready':''}" data-bf="play" aria-label="${playing?'Stop the brief':rd?'Your morning brief is ready. Play it':'Play my brief'}">
      <span class="bf-pi">${playing ? UI.stop : UI.play}${rd ? '<i class="bf-new"></i>' : ''}</span>
      <span class="bf-pt"><b>${playing ? 'Playing your brief…' : rd ? 'Your morning brief is ready' : 'Play my brief'}</b><small>${playing ? 'Tap to stop' : rd ? `Tap to listen · ~${secs} sec` : `~${secs} sec · weather, plans, money`}</small></span>
      <span class="bf-eq"><i></i><i></i><i></i><i></i></span></button>
      ${playing && caption ? `<div class="bf-cap">${J.esc(caption)}</div>` : ''}`;
  }
  function cardHTML(){
    const wx = cached(), v = now(wx), loading = !!inflight && !v;
    let theme, body, foot = '';
    if (!st.loc){
      theme = deviceTheme();
      body = `<div class="bf-setup">${icon(theme === 'night' ? 0 : 2, theme !== 'night', 58, true)}<div><b>Add your city</b><span>See the weather here and hear it in your daily brief.</span></div></div>
        <div class="bf-acts"><button class="bf-btn solid" data-bf="gps">${UI.gps}My location</button><button class="bf-btn" data-bf="beirut">Beirut</button><button class="bf-btn" data-bf="loc">${UI.search}Search</button></div>`;
    } else if (v){
      theme = themeFor(v.code, v.phase);
      body = weatherHTML(wx, v);
      const off = navigator.onLine === false || (lastErr && !isFresh());
      foot = `<div class="bf-foot"><span class="${off?'bf-off':''}">${off ? (navigator.onLine === false ? 'Offline · ' : "Couldn't refresh · ") : ''}Updated ${ago(Date.now()-wx.at)}</span><span>Open-Meteo</span></div>`;
    } else if (loading){
      theme = deviceTheme(); body = skeletonHTML();
    } else {
      theme = deviceTheme();
      const off = navigator.onLine === false;
      body = `<div class="bf-err">${icon(3, true, 44, false)}<div><b>${off ? "You're offline" : "Couldn't load the weather"}</b><span>${off ? 'Weather will appear when you are back online.' : 'Check your connection and try again.'}</span></div><button class="bf-btn" data-bf="retry" aria-label="Try again">${UI.retry}Retry</button></div>`;
    }
    return `<div class="bf-card bf-t-${theme}"><div class="bf-fx">${fxFor(theme)}</div>${headHTML()}${body}${tilesHTML()}${playHTML()}${foot}</div>`;
  }
  // tell the Home screen's brief pill when playing / ready changes (it reads J.brief.playing and J.brief.ready)
  let stateSig = '';
  function notify(){
    const sig = (playing ? 'p' : '') + (ready ? 'r' : '');
    if (sig === stateSig) return; stateSig = sig;
    try { window.dispatchEvent(new CustomEvent('jarvis:brief-state', {detail:{playing, ready}})); } catch(e){}
  }
  function paint(){
    notify();
    if (!cardEl) return;
    const html = cardHTML();
    if (html !== lastHTML){ lastHTML = html; cardEl.innerHTML = html; }
  }
  function onCardClick(e){
    const u = e.target.closest('[data-bf-unit]');
    if (u){ st.unit = u.dataset.bfUnit; J.save(); paint(); return; }
    const b = e.target.closest('[data-bf]'); if (!b) return;
    const a = b.dataset.bf;
    if (a === 'play') playBrief();
    else if (a === 'loc') openLocation();
    else if (a === 'gps') useGPS(null);
    else if (a === 'beirut') setLocation(Object.assign({}, BEIRUT));
    else if (a === 'retry'){ lastErr = 0; refresh(true); }
  }

  /* ---------------- location ---------------- */
  function setLocation(l){
    const changed = locKey(l) !== locKey(st.loc);
    st.loc = {lat:+l.lat, lon:+l.lon, name:l.name || 'Your location', region:l.region || '', src:l.src || 'search'};
    if (changed){ st.wx = null; lastErr = 0; }
    J.save(); paint(); return refresh(changed);
  }
  function reverseName(lat, lon){
    // free, no key; only used to show a friendly name for GPS coordinates
    return getJSON('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude='+lat.toFixed(4)+'&longitude='+lon.toFixed(4)+'&localityLanguage=en', 6000)
      .then(d=>({name: d.city || d.locality || d.principalSubdivision || '', region: d.countryName || ''})).catch(()=>null);
  }
  function useGPS(msgEl){
    const say = (t)=>{ if (msgEl){ msgEl.textContent = t; msgEl.style.display = 'block'; } else J.toast(t); };
    if (!('geolocation' in navigator)){ say("This browser can't share your location. Search for your city instead."); if (!msgEl) openLocation(); return; }
    if (msgEl) say('Finding you…'); else J.toast('Finding your location…');
    navigator.geolocation.getCurrentPosition(pos=>{
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      J.closeModal();
      setLocation({lat, lon, name:'Your location', src:'gps'});
      reverseName(lat, lon).then(r=>{ if (r && r.name && st.loc && st.loc.src === 'gps' && locKey(st.loc) === locKey({lat, lon})){ st.loc.name = r.name; st.loc.region = r.region; J.save(); paint(); } });
    }, err=>{
      const t = err && err.code === 1 ? "Location is blocked for this site. You can allow it in your browser settings, or just search for your city below."
        : "Couldn't find your location right now. Try again, or search for your city below.";
      if (msgEl) say(t); else openLocation(t);
    }, {enableHighAccuracy:false, timeout:12000, maximumAge:10*60e3});
  }
  function openLocation(message){
    const hasGeo = 'geolocation' in navigator;
    J.modal(`<div class="bf-m"><h4>Where are you?</h4><p>Jarvis uses this only to get your local weather.</p>
      <div class="bf-msg" id="bfMsg" style="display:${message?'block':'none'}">${message ? J.esc(message) : ''}</div>
      ${hasGeo ? `<button class="btn bf-gps" id="bfGps">${UI.gps}Use my location</button><div class="bf-or">or search a city</div>` : ''}
      <div class="bf-q">${UI.search}<input id="bfQ" placeholder="City name, e.g. Beirut" autocomplete="off" enterkeyhint="search"></div>
      <div class="bf-res" id="bfRes"></div>
      <div class="row"><button class="btn ghost" id="bfCancel">Close</button></div></div>`);
    let results = [Object.assign({}, BEIRUT)], timer = null, seq = 0;
    const resEl = document.getElementById('bfRes'), q = document.getElementById('bfQ');
    const draw = (list, note) => {
      results = list;
      resEl.innerHTML = (note ? `<div class="bf-note">${note}</div>` : '') + list.map((r,i)=>`<button class="bf-r" data-bf-pick="${i}">${UI.pin}<span><b>${J.esc(r.name)}</b><small>${J.esc(r.region || '')}</small></span></button>`).join('');
    };
    draw(results, st.loc ? `Now: ${J.esc(placeName())}` : 'Suggested');
    resEl.onclick = e=>{ const b = e.target.closest('[data-bf-pick]'); if (!b) return; const r = results[+b.dataset.bfPick]; if (r){ J.closeModal(); setLocation(r); J.toast(`Weather set to ${r.name}`); } };
    q.oninput = ()=>{
      clearTimeout(timer); const v = q.value.trim(); const my = ++seq;
      if (v.length < 2){ draw([Object.assign({}, BEIRUT)], 'Suggested'); return; }
      timer = setTimeout(()=>{
        resEl.innerHTML = '<div class="bf-note">Searching…</div>';
        geocode(v).then(list=>{ if (my !== seq) return; list.length ? draw(list) : draw([], `No places found for “${J.esc(v)}”. Check the spelling?`); })
          .catch(()=>{ if (my !== seq) return; draw([], "Couldn't search right now. Check your connection and try again."); });
      }, 350);
    };
    q.onkeydown = e=>{ if (e.key === 'Enter'){ clearTimeout(timer); q.oninput(); } };
    const g = document.getElementById('bfGps'); if (g) g.onclick = ()=>useGPS(document.getElementById('bfMsg'));
    document.getElementById('bfCancel').onclick = J.closeModal;
    setTimeout(()=>{ try { if (!message) q.focus(); } catch(e){} }, 60);
  }

  /* ---------------- once-a-day "your morning brief is ready" ----------------
     Shown inside the Today card on Home (never floating over other screens):
     the Play button turns into "Your morning brief is ready" the first time Home
     is shown each day between 4 AM and noon, until it is played or it turns noon. */
  function maybePill(){
    if (ready && new Date().getHours() >= 12) ready = false;
    if (pillChecked) return;
    if (J.current && J.current !== 'home') return;      // decide only when Home is actually on screen
    pillChecked = true;
    const d = new Date(); if (d.getHours() >= 12 || d.getHours() < 4) return;
    if (st.pillDay === dayKey(d)) return;
    st.pillDay = dayKey(d); J.save(); ready = true;
  }

  J.addHomeCard({id:'brief', order:1, render(el){
    ensureDefs();
    if (cardEl !== el){ cardEl = el; lastHTML = ''; el.onclick = onCardClick; }
    maybePill(); paint(); maybeRefresh();
  }});

  /* ---------------- voice ---------------- */
  const title = s => s.replace(/(^|[\s-])([a-z])/g, (x, a, b)=>a + b.toUpperCase());
  function clean(t){ return t.replace(/[.]/g,'').replace(/^(hey |ok |okay )?jarvis\s+/,'').replace(/\s+(jarvis|please)$/,'').replace(/\s+(jarvis|please)$/,'').trim(); }
  const BRIEF_RE = /^(good morning|morning|(the |my |today's |a )?(morning |daily )?brief(ing)?( for today| today)?|brief me( on (my |the )?day)?|(play|read|give|start|run|do|get|show|tell) (me )?(my |the |a |today's )?(morning |daily )?brief(ing)?|what('s| is| are) (the |my |today's )(morning |daily )?brief(ing)?( for today| today)?|what('s| is| does) my day look(ing)?( like)?( today)?|what does (today|my day) look like|how('s| is) my day( looking| going| shaping up)?( today)?|what('s| is) my day like|what('s| is) (the|my) plan (for )?(today|the day)|what('s| is) (going on|happening|on|new|up) (for )?today|what('s| is) on my plate( today)?|what do i have (going on |on |planned )?today|what have i got (going on |on )?today|anything (that )?i should know( about)?( today| for today)?|anything (important |new )?(today|for today)|((tell me|talk me through|run me through|walk me through) )?(about )?my day|(give me |read me )?(a |the )?(rundown|summary|overview|recap) (of|for) (my |the )?(day|today)|catch me up|fill me in|update me( on (my |the )?(day|today))?|what('s| is) (new|going on|happening)( with me)?|give me an update|(my )?daily update|today's update|start my day|let's start the day)$/;
  const NOT_MINE = /^(note|take a note|new note|add a note|remind|set (a )?reminder|remember|write|jot|paid|spent|spend|bought|buy|got paid)\b/;
  function needLocation(){ return "I don't know where you are yet. Say “set my city to Beirut”, or open Today and tap “Add your city”."; }
  function noWeatherYet(after){
    // nothing cached yet: fetch, then answer in the chat
    refresh(true).then(wx=>{ lateReply(wx ? after(wx) : "Sorry, I couldn't reach the weather service. Check your connection and try again."); });
    return `One moment, checking the weather in ${placeName()}.`;
  }
  function dayIndexFor(t, wx){ const v = now(wx); if (!v) return null; return /\btomorrow\b/.test(t) ? v.di + 1 : v.di; }
  function weatherAnswer(t, wx, place){
    const v = now(wx); if (!v) return "I don't have a forecast for today yet.";
    // sunscreen / UV
    if (/\b(sunscreen|sun cream|sunblock|sunglasses|uv)\b/.test(t)){
      const i = /\btomorrow\b/.test(t) ? v.di + 1 : v.di, uv = wx.d.uv[i], when = i === v.di ? 'today' : 'tomorrow';
      if (!num(uv)) return weatherLines(wx, place, {uv:true});
      return uv >= 3 ? `Yes. The UV index in ${place} reaches ${Math.round(uv)} ${when}, so sunscreen is a good idea.` : `Not really. The UV index in ${place} stays low ${when}, around ${Math.round(uv)}.`;
    }
    // tonight: how low it goes for the rest of today
    if (/\b(tonight|this evening|overnight)\b/.test(t) && !/\btomorrow\b/.test(t)){
      const rest = []; for (let k = v.hi; k < wx.h.time.length && wx.h.time[k].slice(0,10) === v.n.slice(0,10); k++) if (num(wx.h.t[k])) rest.push(wx.h.t[k]);
      const lo = rest.length ? Math.min(...rest) : v.min;
      if (num(lo)) return `It's ${deg(v.t)} in ${place} now, and it drops to about ${n(lo)} tonight.${lo <= 14 ? ' Take a jacket if you go out.' : ''}`;
    }
    if (/\btomorrow\b/.test(t)){
      const i = v.di + 1; if (!wx.d.time[i]) return "I don't have tomorrow's forecast yet.";
      const ro = rainOutlook(wx, v, i);
      return `Tomorrow in ${place}: ${lc(desc(wx.d.code[i], true))}, with a high of ${n(wx.d.max[i])} and a low of ${n(wx.d.min[i])}.` +
        (ro ? (ro.likely ? ` ${ro.kind === 'snow' ? 'Snow' : 'Rain'} is likely around ${isoTime(ro.at)}.` : ro.max >= 20 ? ` About a ${pct10(ro.max)} percent chance of ${ro.kind}.` : ' No rain expected.') : '');
    }
    return weatherLines(wx, place, {uv:true});
  }
  function rainAnswer(t, wx, place){
    const v = now(wx); if (!v) return "I don't have a forecast for today yet.";
    const tomorrow = /\btomorrow\b/.test(t), i = tomorrow ? v.di + 1 : v.di, when = tomorrow ? 'tomorrow' : 'today';
    const g = wmo(v.code)[0];
    if (!tomorrow && (g === 'rain' || g === 'drizzle' || g === 'storm')) return `Yes, ${NOW_WET[g]} in ${place} right now. Take an umbrella.`;
    if (!tomorrow && g === 'snow') return `It's snowing in ${place} right now, so no rain, but dress warmly.`;
    const ro = rainOutlook(wx, v, i); if (!ro) return `I don't have the rain forecast for ${when} yet.`;
    if (ro.likely && ro.kind === 'snow') return `Snow is more likely than rain in ${place} ${when}, around ${isoTime(ro.at)}. Dress warmly.`;
    if (/\bsnow/.test(t) && ro.kind !== 'snow') return `No snow expected in ${place} ${when}.` + (ro.likely ? ` Rain is likely around ${isoTime(ro.at)}, though.` : '');
    if (ro.likely) return `Yes, rain is likely in ${place} ${when}, around ${isoTime(ro.at)}, about ${pct10(ro.max)} percent chance. Take an umbrella.`;
    if (ro.max >= 20) return `Maybe. There's about a ${pct10(ro.max)} percent chance of ${ro.kind} in ${place} ${when}${ro.at ? ', most likely around ' + isoTime(ro.at) : ''}.`;
    return `No, ${/\bsnow/.test(t) ? 'snow' : 'rain'} isn't expected in ${place} ${tomorrow ? 'tomorrow' : hourOf(v.n) >= 12 ? 'for the rest of today' : 'today'}.`;
  }

  // "do I need a jacket?": judged on how cold it feels for the rest of the day (or tomorrow)
  function coatAnswer(t, wx, place){
    const v = now(wx); if (!v) return weatherAnswer(t, wx, place);
    const tomorrow = /\btomorrow\b/.test(t), when = tomorrow ? 'tomorrow' : 'today';
    let lo, hi;
    if (tomorrow){ const i = v.di + 1; if (!num(wx.d.min[i])) return "I don't have tomorrow's forecast yet."; lo = wx.d.min[i]; hi = wx.d.max[i]; }
    else {
      const rest = []; for (let k = v.hi; k < wx.h.time.length && wx.h.time[k].slice(0,10) === v.n.slice(0,10); k++){ const f = num(wx.h.feels[k]) ? wx.h.feels[k] : wx.h.t[k]; if (num(f)) rest.push(f); }
      lo = rest.length ? Math.min(...rest) : v.min; hi = num(v.max) ? v.max : v.t;
    }
    const now0 = tomorrow ? '' : `It's ${deg(v.t)} in ${place} now. `;
    if (lo <= 12) return `${now0}Yes, take a jacket. It gets down to about ${n(lo)} ${when}.`;
    if (lo <= 17) return `${now0}A light jacket is a good idea. It drops to about ${n(lo)} ${tomorrow ? 'tomorrow' : 'later'}.`;
    return `${now0}No jacket needed ${when}. It stays above ${n(lo)}${num(hi) ? `, with a high of ${n(hi)}` : ''}.`;
  }

  J.addIntent((said, raw)=>{
    let t = clean(raw);
    if (NOT_MINE.test(t)) return null;
    let m;

    // tomorrow: "what does my day look like tomorrow", "how does tomorrow look", "brief me on tomorrow"
    const TOPIC = /\b(weather|rain|raining|snow|temperature|temp|hot|cold|warm|sunny|forecast|umbrella|jacket|market|markets|stocks?|spend|spent|spending|budget|money|calories?|food|eat|ate|eaten|water|habits?|goals?|streak|receipts?|remind|reminders?|notes?|calendar|schedule|agenda|events?|meetings?|appointments?|alarms?|date|time|news|price)\b/;
    const TMR_RE = /^(what('s| is| does| will) (my day|my day tomorrow|tomorrow|my tomorrow) (look|looks|looking|be looking)( like)?( tomorrow)?|how('s| is| does| will) (my day )?tomorrow (look|looks|looking|shaping up|be)( like)?|how('s| is| does) my day (look|looking|shaping up)( like)? tomorrow|what('s| is) (the plan|my plan|my day|the day|on|happening|going on|in store|ahead|lined up)( like)? (for )?tomorrow|what('s| is) tomorrow like|what have i got (on |going on |lined up )?(for )?tomorrow|what do i have (going on |lined up |planned )(for )?tomorrow|(give me |read me |play |tell me )?(my |the |a )?(brief|briefing|rundown|summary|overview|preview|plan) (for|of|on) tomorrow|brief me (on|for|about) tomorrow|tomorrow's (brief|briefing|plan|plans|rundown|summary|preview|agenda)|(tell me |talk me through |walk me through |run me through )(about )?(my day )?tomorrow|(prep|prepare) me for tomorrow)$/;
    const tmrLoose = /\btomorrow('s)?\b/.test(t) && t.split(' ').length <= 10
      && /^(what|what's|whats|how|how's|give me|tell me|read me|run me|walk me|talk me|is there)\b/.test(t)
      && /\b(my day|the day|day look|tomorrow look|look like|looks like|looking|plan|plans|planned|rundown|run down|brief|briefing|summary|overview|recap|preview|ahead|in store|lined up|need to know|should know)\b/.test(t)
      && !TOPIC.test(t);
    if (/\btomorrow\b/.test(t) && (TMR_RE.test(t) || tmrLoose)){
      if (st.loc && !cached() && navigator.onLine !== false) refresh(true); else maybeRefresh();
      return composeTomorrow();
    }
    // the full brief (exact phrases, or a question about today that names no single topic)
    const briefLoose = t.split(' ').length <= 10 && !/\btomorrow\b/.test(t)
      && /^(what|what's|whats|how|anything|any|give me|tell me|read me|run me|walk me|talk me|fill me|is there|do i|have i)\b/.test(t)
      && /\b(my day|today|today's|the day|this morning)\b/.test(t)
      && /\b(agenda|rundown|run down|plan|plans|planned|look|looks|looking|need to know|should know|going on|happening|have|got|on my plate|update|brief|briefing|summary|overview|recap|ahead|in store|lined up|up)\b/.test(t)
      && !/\b(weather|rain|raining|temperature|temp|hot|cold|warm|sunny|forecast|market|markets|stocks?|spend|spent|spending|budget|money|calories?|kcal|protein|carbs?|fats?|fiber|sugar|macros|nutrition|food|eat|ate|eaten|meals?|water|drink|drank|drunk|habits?|goals?|streak|receipts?|remind|reminders?|notes?|calendar|schedule|agenda|meetings?|events?|appointments?|alarms?|date|time|day of the week|what day|news|price)\b/.test(t);
    if (BRIEF_RE.test(t) || briefLoose){
      ready = false;
      const s = composeBrief(); caption = s;
      if (st.loc && !cached() && navigator.onLine !== false){ refresh(true); }
      else maybeRefresh();
      J.go('home');
      return s;
    }
    // temperature unit
    if ((m = t.match(/^(?:use|switch to|change to|show|set (?:it |units? )?to|in) (fahrenheit|celsius|centigrade)( please)?$/))){
      st.unit = m[1] === 'fahrenheit' ? 'F' : 'C'; J.save(); paint();
      return `Okay, I'll show temperatures in ${m[1] === 'fahrenheit' ? 'Fahrenheit' : 'Celsius'}.`;
    }
    // set the city by voice
    if ((m = t.match(/^(?:set|change|update|switch) (?:my |the )?(?:city|location|weather location|town)(?: to| as)? (.+)$/)) || (m = t.match(/^my (?:city|location) is (.+)$/))){
      const q = title(m[1].replace(/^(to )/, '').trim()); if (!q) return null;
      if (/^(my (current )?location|here|where i am)$/.test(q)){ openLocation(); return 'Tap “Use my location” and allow access, and I will use where you are.'; }
      geocode(q).then(list=>{
        if (!list.length) return lateReply(`I couldn't find a place called ${q}. Try saying the city and the country.`);
        const r = list[0]; setLocation(r).then(wx=>{
          const w = wx && weatherLines(wx, r.name);
          lateReply(`Done. I'll use ${r.name}${r.region ? ', ' + r.region : ''} for your weather.` + (w ? ' ' + w : ''));
        });
      }).catch(()=>lateReply("I couldn't look that place up right now. Check your connection and try again."));
      return `Looking up ${q}…`;
    }
    const coatQ = /\b(do|should|will|would) i (need|wear|take|bring|want) (a |my |an |some )?(jacket|coat|sweater|hoodie|jumper|scarf|layers?)\b|\b(jacket|coat|sweater) weather\b|\bwhat should i wear\b/.test(t);
    const rainQ = /\b(will|is) it (going to |gonna )?(rain|be raining|pour|drizzle|snow|be snowing)\b|\bis it snowing\b|\bis it (raining|pouring|drizzling|storming)\b|\b(it's|it is) (going to|gonna) rain\b|\bwill there be (any )?rain\b|\b(chance|odds) of rain\b|\b(do|should) i (need|take|bring) (an |my )?umbrella\b|\bany rain\b|\bis rain (coming|expected)\b/.test(t);
    const wxQ = /\b(weather|forecast|temperature)\b|\bhow (hot|cold|warm|chilly) is it\b|\bis it (hot|cold|warm|sunny|cloudy|chilly|nice) (outside|out|today)\b|\bwhat should i wear\b|^(what's|what is|how's|how is) it (like )?(outside|out there|out)( today| right now| now)?$|^(is|will) it (going to |gonna )?(be |get )?(hot|cold|warm|chilly|sunny|cloudy|windy|nice|freezing|humid|rainy|snowy|stormy|foggy|clear)\b|^(what's|what is|what will be|what'll be) the (high|low|temp|temperature|humidity|uv|uv index|wind|high and low)\b|\bhow (hot|cold|warm|chilly|windy|humid) (is it|will it be|will it get|is it going to (be|get)|is it gonna (be|get)|does it get)\b|\b(sunscreen|sun cream|sunblock|sunglasses|uv)\b|^(the )?temp$|\bhow('s| is) (it|the weather) (outside|out there|out)\b|^is it (hot|cold|warm|sunny|cloudy|chilly|nice|windy|freezing)( outside| out| today| now| right now)?$/.test(t) || coatQ;
    if (!rainQ && !wxQ) return null;
    if (/\b(app|apps|note|notes)\b/.test(t)) return null;

    // weather somewhere else: "what's the weather in Paris"
    if ((m = t.match(/\b(?:in|for|at) ([a-z][a-z .'-]{1,40}?)(?: (?:today|tomorrow|now|right now|this week))?$/)) && !/^(the |my |an? |this |that )?(morning|afternoon|evening|night|tonight|today|tomorrow|week|weekend|moment|hour|minute|minutes|while|bit|few hours|couple of hours|rest of the day|next hour|next few hours|area|city|town|here|outside)$/.test(m[1])){
      const q = title(m[1].trim());
      if (!st.loc || q.toLowerCase() !== placeName().toLowerCase()){
        geocode(q).then(list=>{
          if (!list.length) return lateReply(`I couldn't find a place called ${q}.`);
          const r = list[0];
          return fetchForecast(r).then(wx=>lateReply(coatQ ? coatAnswer(t, wx, r.name) : rainQ ? rainAnswer(t, wx, r.name) : weatherAnswer(t, wx, r.name)));
        }).catch(()=>lateReply("I couldn't reach the weather service right now. Check your connection and try again."));
        return `Checking ${q}…`;
      }
    }
    if (!st.loc) return needLocation();
    const wx = cached();
    if (!wx || !now(wx)){
      if (navigator.onLine === false) return "You're offline and I don't have a recent forecast saved. Try again when you're connected.";
      return noWeatherYet(w=>coatQ ? coatAnswer(t, w, placeName()) : rainQ ? rainAnswer(t, w, placeName()) : weatherAnswer(t, w, placeName()));
    }
    maybeRefresh();
    return coatQ ? coatAnswer(t, wx, placeName()) : rainQ ? rainAnswer(t, wx, placeName()) : weatherAnswer(t, wx, placeName());
  });
  J.addSuggestions(['Brief me', "What's the weather?", 'Will it rain today?']);

  // small API for other features
  J.weather = {get location(){ return st.loc; }, get data(){ return cached(); }, now: ()=>now(cached()), describe: desc, refresh: ()=>refresh(true)};
  // playing: the brief is being read aloud now; ready: the once-a-morning "your brief is ready" state (Home's pill shows both)
  J.brief = {compose: composeBrief, composeTomorrow, play: playBrief, get playing(){ return playing; }, get ready(){ return ready && !playing; }};
} catch(e){ try { console.error('brief', e); } catch(_){} }
})();
