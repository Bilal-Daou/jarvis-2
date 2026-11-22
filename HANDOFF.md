# Jarvis 2.0 · Handoff for a new assistant

_Written 17 November 2026. State of the code: `main` branch, last app change in commit `870f94d` (16 Nov 2026, "Round 5 audit"). Everything after that on `main` is the automatic "Update market data" bot._

Read this whole file before changing anything. Section 10 (Bilal's preferences) matters as much as the code.

---

## 1. PROJECT SUMMARY

**What it is.** Jarvis 2.0 is a voice-first personal assistant that runs in the phone's web browser and can be added to the home screen like an app (a "PWA", progressive web app). You tap one big mic, talk, and Jarvis answers out loud and does the job.

**Who it's for.** Bilal Daou, who uses an iPhone. He has a finance and accounting background (master's in finance) and is a complete beginner at coding. He opens Jarvis with his iPhone **Action Button**, through a Shortcut that opens the website in Safari. Later he may rename it and **sell it in the Lebanese market**, so it has to stay professional and must not be hard-coded to him.

**What problem it solves.** It's one place, driven by voice, for daily life admin:
- notes, reminders and alarms
- a budget and expense tracker (income, budget goal, categories, LBP support)
- a morning brief (weather, today's reminders, yesterday's spending, habits, food, markets)
- markets (indices, watchlist, economic calendar, news, earnings)
- food and calorie tracking (barcode scan, AI photo, voice)
- receipt scanning into expenses
- habits and goals with streaks
- iPhone calendar, Health and alarms, pulled in through Shortcuts
- general questions (maths, currency, time abroad, definitions, Wikipedia), all with free services

**Live site:** https://bilal-daou.github.io/jarvis-2/
**Code:** https://github.com/bilal-daou/jarvis-2 (public)

---

## 2. TECH STACK

There is **no backend, no database, no build step, no npm, no framework and no `.env` file.** It is plain files served by GitHub Pages.

| Part | What is used |
|---|---|
| App language | Plain HTML, CSS and JavaScript (ES2020-ish, no TypeScript, no bundler) |
| Framework | None. Hand-written DOM code. Features are plugins registering on `window.Jarvis` |
| Hosting | GitHub Pages, served from the **`gh-pages`** branch (it must always equal `main`) |
| Offline / install | `manifest.json` + service worker `sw.js` (cache name currently **`jarvis-v8`**) |
| Data storage | Browser `localStorage` on the phone only. Main key **`jarvis2`**. No server copy |
| Voice in | Browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) |
| Voice out | Browser `speechSynthesis`, auto-picks the most natural voice, voice picker in Settings |
| Reminder alerts | In-app alarm (WebAudio) + `Notification` while open; on the iPhone, `.ics` Calendar files and a "Jarvis Alarm" Shortcut |
| Market data | GitHub Actions job (`.github/workflows/finance-data.yml`) running **Python 3.12** + **`yfinance==1.8.0`** → writes `data/finance.json` |
| Fonts | Google Fonts (fonts.googleapis.com) |

**Libraries loaded from a CDN only when needed (pinned versions):**
- Tesseract.js **5.1.1** (receipt OCR): `cdn.jsdelivr.net/npm/tesseract.js@5.1.1`, `tesseract.js-core@5.1.1`, `@tesseract.js-data/eng@1.0.0`
- ZXing **0.21.3** (barcodes): `cdn.jsdelivr.net/npm/@zxing/library@0.21.3`

**Free outside services (no keys needed):**
- Weather: `api.open-meteo.com`; city search and time zones: `geocoding-api.open-meteo.com`; reverse geocoding: `api.bigdatacloud.net`
- Food products: Open Food Facts (`world.openfoodfacts.org`)
- Exchange rates: `open.er-api.com`
- Wikipedia summaries: `en.wikipedia.org`; definitions: `api.dictionaryapi.dev`
- Market data (only inside the GitHub job, never on the phone): Yahoo Finance via yfinance, Stooq, CoinGecko, CNBC / MarketWatch / Yahoo / Google News RSS, Forex Factory weekly calendar JSON, Nasdaq earnings calendar

**Optional, user-supplied key (the only "secret" in the whole app):**
- **Google Gemini API, free tier.** Used for AI food photos (`features/food.js`) and, if a key exists, as the last fallback for general questions (`features/brain.js`). The user pastes their own key inside the app (Food → **AI food photos** card → **Turn on AI food photos** → **Paste key**). It is stored only on that phone in `localStorage` key **`jarvis2-ai`**, and kept out of backups. The last model that worked is tried first, then this list: `gemini-flash-latest`, `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`. Bilal has a key or was walked through getting one (new keys start with `AQ.`, older ones with `AIza`). **No paid AI is wired in.**

---

## 3. FOLDER STRUCTURE

```
jarvis-2/
├── index.html                 Core app (~221 KB): all screens' HTML + CSS, storage, voice in/out,
│                              the command parser think(), Home, Today, Notes, Reminders, Money (budget),
│                              More (apps), Settings, back stack, edit sheets, plugin API (window.Jarvis).
├── sw.js                      Service worker: offline cache (CACHE='jarvis-v8', list FILES), caches the
│                              CDN scanner libraries, serves calendar files at /ics/<name>.ics?d=<base64url>,
│                              handles notification taps.
├── manifest.json              Home-screen app info (name "Jarvis 2.0", icons, colors, standalone).
├── icon.svg, icon-180.png, icon-192.png, icon-512.png   App icons.
├── README.md                  Short user-facing description (outdated: describes v2 only).
├── HANDOFF.md                 This file.
├── .gitignore                 Ignores __pycache__/ and *.pyc.
├── features/                  One plugin per feature, loaded at the end of index.html in this order:
│   ├── brief.js               Morning brief "Today" card, weather (Open-Meteo), spoken brief, Jarvis.addBriefLine()
│   ├── habits.js              Habits (streaks, rings, heatmap) and Goals (progress, pace)
│   ├── finance.js             Markets screen; reads data/finance.json; watchlist; econ calendar; news
│   ├── receipt.js             Receipt photo → Tesseract OCR → review → expense (handles LBP, default rate 89,500)
│   ├── food.js                Barcode scan, Open Food Facts, offline food table (incl. Lebanese foods),
│   │                          calories/macros/water, AI food photos, shared Gemini helper Jarvis.ai
│   ├── calendar.js            Alarms and Calendar: .ics "Add to Calendar", "Jarvis Alarm" Shortcut, loud in-app
│   │                          alarm, agenda screen, reads iPhone calendar from #cal= links, setup guide
│   ├── health.js              iPhone Health + alarms from the Action Button Shortcut (#sync= link): steps,
│   │                          energy, resting heart rate, weight, sleep, workouts, alarms. Health screen + Home tile
│   └── brain.js               Loaded LAST. Smarter understanding: entry fixes by voice, maths, conversions,
│                              time abroad, follow-ups, rewordings, undo, Wikipedia/dictionary, Gemini fallback
├── data/
│   ├── finance.json           Market data written by the bot (~90 KB). Do not edit by hand.
│   └── watchlist.json         Extra tickers the data job should fetch ({"_help": ..., "symbols": []}).
├── scripts/
│   ├── fetch_finance.py       The market data job (standard library + optional yfinance).
│   └── tests/
│       ├── test_fetch_finance.py   31 unit tests for the data job.
│       └── fixtures/          Saved sample responses (Yahoo, Forex Factory, RSS, Atom...).
└── .github/workflows/
    └── finance-data.yml       "Markets data" GitHub Action: schedule, tests, fetch, validate, commit to
                               main, force-push same commit to gh-pages.
```

**How the code fits together.** `index.html` defines `window.Jarvis` (around line 962) with: `db`, `settings`, `save()`, `store(namespace, defaults)`, `addView()`, `addIntent()`, `addHomeCard()`, `addSuggestions()`, `addExpense()`, `addReminder()`, `addNote()`, `speak()`, `go()`, `toast()`, `modal()`, `loadScript()`, `css()`, `addLateReply()` and more. Each `features/*.js` is wrapped in `(function(){ ... })()`, grabs `window.Jarvis`, and registers its screen, voice intents and Home card.

**How a spoken sentence is handled** (`think()` in `index.html`): pending-note check → `smallTalk()` → `brain.early` → each plugin's intents → built-in commands (budget, spending, notes, reminders...) → `brain.late` (rewordings, Wikipedia, Gemini) → a friendly "here's what I can do" reply. **Nothing is saved as a note unless the user explicitly asks** ("note...", "write down...", "remember that...").

**Where data lives.** One `localStorage` object under key `jarvis2`:
`{notes:[], reminders:[], expenses:[], settings:{name, currency, budget, speak, rate, pitch, voice, theme, accent, setupDone}, brain:{}, brief:{}, calendar:{}, finance:{}, food:{}, habits:{}, health:{}, receipts:{}}`.
Features get their slice with `Jarvis.store('food', defaults)`. Small extra keys: `jarvis2-ai` (Gemini key, not in backups), `jarvis2-finance-cache`, `jarvis2-fx`, `jarvis2-habits-tab`, and session key `jarvis2-toast`. The weather city is stored in `brief.loc` (not in `settings`). `setupDone` controls whether the first-run Welcome sheet shows. Note: `features/receipt.js` (around line 636) writes `localStorage['jarvis2']` directly, so if the storage key ever changes, change it there too. Backups (Settings → Backup → Save) download the `jarvis2` object as `jarvis-backup-YYYY-MM-DD.json` (UTC date). The Gemini key is a separate key, so it is never in a backup.

**Screen ids vs. tab names** (useful for `Jarvis.go('<id>')` and searching the code): Home = `home`, Today = `today`, Money = `budget`, More = `apps`, Notes = `notes`, Reminders = `reminders`, Settings = `settings`; plugin screens: `calendar`, `health`, `finance` (Markets), `food`, `habits`, `receipts`. Settings opens from the gear icon at the top of Home or from More.

**iPhone links the app understands:**
- `https://bilal-daou.github.io/jarvis-2/#sync=<text>` sent by the Action Button Shortcut (format documented at the top of `features/health.js`: `[calendar]`, `[steps]`, `[energy]`, `[heart]`, `[weight]`, `[sleep]`, `[workouts]`, `[alarms]` blocks; base64 or JSON also accepted)
- `#cal=<lines>`: older calendar-only link, still works
- `shortcuts://run-shortcut?name=Jarvis%20Alarm&input=text&text=...`: Jarvis calls this to set a real Clock alarm

---

## 4. HOW TO RUN IT

**There is nothing to install, and no `.env` variables or secrets.** The only optional key (Gemini) is pasted by the user inside the app on the phone.

**Get the code:**
```bash
git clone https://github.com/bilal-daou/jarvis-2.git
cd jarvis-2
```

**Run it on a computer.** It needs a small local web server: opening `index.html` by double-click (`file://`) breaks the service worker and the data file.
```bash
python3 -m http.server 8000
# then open http://localhost:8000/ in Chrome
```
The mic works on `localhost` and on https. Chrome supports speech recognition. Firefox doesn't.

**Test on a phone.** Only the live https site works well (mic, install). Push and open https://bilal-daou.github.io/jarvis-2/.

**Run the data job tests and the job itself (Python 3.12+):**
```bash
python3 -m unittest discover -s scripts/tests -v     # 31 tests, standard library only
pip install "yfinance==1.8.0"                         # optional; job falls back without it
python3 scripts/fetch_finance.py                      # live data → data/finance.json
python3 scripts/fetch_finance.py --sample             # clearly marked sample file, no network
python3 scripts/fetch_finance.py --force              # skip the calendar/earnings throttles (55 min / 6 h)
```
**Careful:** both commands overwrite `data/finance.json`. Don't commit that file yourself (the bot owns it). Undo with `git checkout data/finance.json`.

**Publish (deploy) a change.** GitHub Pages serves the `gh-pages` branch, which must equal `main`:
```bash
git pull --rebase origin main          # the bot commits market data to main all day
git push origin main main:gh-pages     # push both; the site updates in ~1 minute
```
Before every release that changes app files, **bump `CACHE` in `sw.js`** (`jarvis-v8` → `jarvis-v9`). If you add a feature file, also add it to the `FILES` list in `sw.js` and a `<script src="features/....js">` near the end of `index.html` (before `brain.js`, which must stay last). Tell Bilal to close and reopen Jarvis (twice) to pick up an update.

**The market data bot** runs by itself on a schedule (weekday pre-market 11:15 UTC, every 30 min 13:00-21:30 UTC, 22:30 UTC, and twice a day on weekends). You can also run it by hand: GitHub → Actions → "Markets data" → Run workflow. It needs no secrets (uses the built-in `GITHUB_TOKEN` with `contents: write`).

---

## 5. WHAT'S DONE

All of this is live and passed automated tests plus separate reviewer checks. It has **not yet been tested on a real iPhone by an assistant**. Bilal is the only real-device tester.

- **Core / voice.** Big mic, chat sheet with optional typing, spoken replies, natural-voice auto-pick + voice picker, speed and pitch. Understands iPhone speech quirks (curly apostrophes, "Jarvis, ...", "um"), numbers like "2 million", "250k" and "a grand", Lebanese words (yalla, shukran). Mic is fully released after speaking (Safari's orange dot may linger about a second, which is Apple's doing).
- **Notes.** Saved only on an explicit ask. Auto tags, pin, search, edit, read aloud, "save that" saves Jarvis's last answer.
- **Reminders.** One-off and repeating ("every Sunday at 6 pm"), "in 20 minutes", snooze, done, overdue list. Can be moved by voice ("move my reminder to 6 pm").
- **Making reminders ring on iPhone** (`calendar.js`). After setting a reminder, a "Make it ring on your iPhone" sheet offers **Add to Calendar** (an .ics alert, no setup, silent if the phone is on silent) or **Set iPhone alarm** (a real Clock alarm through the one-time "Jarvis Alarm" Shortcut). There is also a loud in-app alarm with Snooze/Stop while Jarvis is open.
- **Money.** Expenses and income by voice, auto categories, monthly budget goal, category donut, daily chart, income vs spending, comparison with last month, questions like "how much did I spend on coffee last month", "am I over budget", "what's my balance". Currency setting includes LBP.
- **Editing everything by typing.** Tap any expense, reminder, note or food entry. Edit chips appear under voice answers. Undo by voice ("undo that", "bring it back").
- **Morning brief.** Today card with weather (set city by voice, e.g. "set my city to Beirut"), hourly strip, today's reminders, yesterday's spending, and a ~20-second spoken brief ("good morning" / Play my brief).
- **Markets.** Indices, gold, oil, 10-year yield, EUR/USD, Bitcoin, watchlist (add by voice: "add Palantir to my watchlist"), charts, economic calendar with plain "what it means", headlines, earnings. Data refreshes about every 30 minutes in US market hours.
- **Food.** Barcode scan (Open Food Facts), voice logging ("I ate 2 eggs and a banana", Lebanese dishes built in), calorie ring, macros, water, AI food photos (Gemini free key).
- **Receipts.** Photo → OCR → review store, total, date and items (incl. LBP) → saved as an expense.
- **Habits & Goals.** Rings, streaks, heatmaps, goals with on-track pace ("save 5000 dollars by June"), voice ("I worked out", "how are my habits").
- **iPhone calendar, Health and alarms inside Jarvis** (`health.js` + `calendar.js`) via the Action Button Shortcut and `#sync=`. Setup guide with Copy and Test buttons under **More → Connect your iPhone**.
- **General questions, free.** Maths, unit and currency conversion, time in other cities, days until, definitions, "who is...", Wikipedia. Gemini only if a key is saved.
- **Design.** iOS-style premium redesign, dark/light theme, accent color, calm Home (big mic, Play my brief, quick-action row: Type / Expense / Food / Remind, key tiles), bottom menu (Home, Today, Money, More), **Back button** on every screen showing where it goes, first-run Welcome sheet, accessibility fixes.
- **Install / offline.** Add to Home Screen, works offline after first load. Backup / restore / erase in Settings.
- **Testing done so far:** about 13,000 automated cases in round 5 (≈7,000 spoken phrases and ≈4,000 random app steps in the deep audit, plus suites from earlier rounds). **Only the 31 Python tests live in the repo.** The JavaScript test suites lived in a temporary cloud folder and are gone (see section 8).

---

## 6. WHAT'S IN PROGRESS

**Nothing is half-built.** Round 5 plus its deep audit was finished, re-reviewed ("ship") and published on 16 Nov 2026 (commit `870f94d`, service worker `jarvis-v8`). The last message to Bilal said:

> Next step is yours: try it on your iPhone, and set up the iPhone connection in **More → Connect your iPhone** when you have 5 minutes. Tell me anything that feels off.

So we stopped **waiting on Bilal** for:
1. **Real-iPhone testing** of round 5, and his feedback.
2. **Doing the iPhone setup** (More → Connect your iPhone): editing his Action Button Shortcut so it sends calendar + Health + alarms via `#sync=`, and creating the "Jarvis Alarm" Shortcut. He hadn't done it yet at handoff time.
3. Confirming the Shortcut action names for **Sleep** and **alarms** actually match what iOS shows. These were never checked on a real device.

The branches `round4-wip`, `round5-wip`, `audit-wip` and `wf-test` on GitHub are **old leftovers**. Everything useful from them is already in `main`. Don't build on them.

---

## 7. WHAT'S NEXT (in priority order)

1. **Act on Bilal's real-iPhone feedback** from round 5, and help him through the iPhone setup step by step (plain words, Copy buttons, no typing for him).
2. **Fix whatever the Shortcut setup reveals**, especially the Sleep and alarms action labels, and whether `#sync=` arrives correctly from the Action Button.
3. **Put the JavaScript tests back in the repo** (e.g. a `tests/` folder runnable with Node + Playwright) so future rounds don't depend on lost scratch files. This is a minor step and needs no okay.
4. **Roadmap phase 4: voice / meeting notes** (record a conversation or meeting → transcript → summary and action items). Phases 1-3 (notes/reminders/budget, finance brief + econ calendar, food scanner) are done.
5. **Paid "AI brain"** (a real LLM for conversation, ~$5-10/month). Bilal wants it **later**. **Do not add until he explicitly says go.** It would need an API key, and since there is no backend, a small serverless proxy (e.g. Cloudflare Worker) to hide the key. That costs money and is his decision.
6. **Paid natural voice** (ElevenLabs / OpenAI TTS, ~$5/month). Asked him on 15 Nov, no answer yet. Ask before adding.
7. **Only when he decides to sell:** rename/rebrand (app name, icons, manifest, domain), user accounts (email + password, each person's own private data), a server + cloud database, a privacy policy. The data is already in one `jarvis2` object split by `Jarvis.store()` namespaces so this can be added without a rewrite. Probably also a proper domain instead of `bilal-daou.github.io`.

---

## 8. KNOWN PROBLEMS

- **Reminders can't ring by themselves when Jarvis is closed.** That's an iPhone limit for web apps. The workaround is the Calendar `.ics` alert (silent when the phone is on silent) or the "Jarvis Alarm" Shortcut (real Clock alarm, needs one-time setup). Web Push for home-screen apps would need a server, which we don't have.
- **Two separate copies of the data on iPhone.** The Action Button Shortcut opens Jarvis in **Safari**, and Safari's storage is separate from the home-screen icon's. We told Bilal to **use only the Action Button (Safari) version** and to move data with Backup → Restore if needed.
- **Data lives only on the phone.** There's no sync between devices and no cloud backup. If Safari website data is cleared (or iOS clears storage for a site that hasn't been opened in a while), everything is lost unless he saved a backup. Remind him to use Settings → Backup now and then.
- **Never tested on a real iPhone by us.** Camera, mic, voices, Calendar "Add" screen, Shortcuts and Health sync have only been tested in desktop/emulated browsers. The Shortcut step names for Sleep and alarms are unverified.
- **JavaScript tests:** restored in `tests/` (see section 14).
- **Very large single files.** `index.html` is ~221 KB, `features/food.js` ~185 KB, `brain.js` ~164 KB. The understanding is built from many regular expressions, so a change to phrasing can break other phrasings. Re-test widely after any change to `think()` or `brain.js`.
- **Gemini model list will go stale.** `AI_MODELS` in `features/food.js` is a hand-made list (Nov 2026). Google renames and retires models, so update it if AI photos stop working. The free tier may let Google use photos to improve its AI. Bilal was told not to snap private things.
- **Free data sources can break without warning.** Yahoo often blocks plain requests (that's why yfinance is used), and Nasdaq earnings is optional and sometimes blocked. The job keeps the previous values when a source fails, so the app shows older data instead of crashing.
- **Hard-coded or Lebanon-specific bits to review for a rename/sale:** see section 12a. Since v32 the code holds no owner link or name (one comment in the v31 mic block excepted). Still to decide: the link, the public repo and its history, and the app name "Jarvis". The user's name, city and currency are all set by the user, not hard-coded (name and currency in `settings`, city in `brief.loc`).
- **Stale branches** `round4-wip`, `round5-wip`, `audit-wip`, `wf-test` are still on GitHub (plus `claude/project-thread-qyf2gi`, the branch this handoff was written on). They're harmless. Cloud sessions couldn't delete them through the proxy, and Bilal can delete them on GitHub.
- **The project files folder copy is old.** The app files in `/mnt/project-files/jarvis-2/` are from 15 Nov (v2). The real, current code is only on GitHub.
- **Updates can look "stuck".** `sw.js` is network-first for the app's own files, so this is usually the browser's HTTP cache or an old service worker still in control. Fix: bump `CACHE` in `sw.js` on every release (forces the new worker), and tell him to close and reopen the app twice.

---

## 9. DECISIONS MADE (don't undo these without asking Bilal)

1. **A web app (PWA) on GitHub Pages, not a native iOS app.** It's free, needs no App Store or Mac, and updates instantly through one link. claude.ai Artifacts were rejected for hosting because dictation there didn't work in iPhone Safari.
2. **Public repo + `gh-pages` branch.** Free Pages hosting needs a public repo. Pages serves `gh-pages`, so always push `main` **and** `gh-pages`. (The Pages settings API was blocked from cloud sessions; pushing a `gh-pages` branch switched hosting on.)
3. **No backend, no database, no keys on a server.** All personal data stays on the phone in `localStorage` (privacy, zero cost). Kept in **one `jarvis2` object with `Jarvis.store()` namespaces** so accounts + a cloud database can be added later without a rewrite.
4. **Plugin architecture.** `index.html` is the core and each feature is its own `features/*.js` registering on `window.Jarvis`. `brain.js` loads last.
5. **Market data comes from a scheduled GitHub Action, not the phone.** It avoids CORS problems and API keys, and it's free. It uses `yfinance` because Yahoo blocks plain requests. Every source is isolated, and a failed source keeps the old values. The workflow never commits an invalid `finance.json`, and it rebases with `-X theirs` so it doesn't fight app pushes.
6. **Free services only.** Open-Meteo, Open Food Facts, Tesseract.js, ZXing, Wikipedia, dictionaryapi.dev, open.er-api.com. Gemini is the free tier with the user's own key, stored only on the phone and not in backups.
7. **Notes are saved only when explicitly asked.** Anything else is conversation and gets a friendly answer. (Bilal reported this bug; don't regress it.)
8. **Reminders ring through the iPhone's own apps** (Calendar .ics alert or a Clock alarm via Shortcut), because iOS doesn't let web apps ring when closed.
9. **iPhone data comes in through the Action Button Shortcut** (`#sync=`), because a website can't read Health, Calendar or alarms directly. Bilal should **use only the Action Button (Safari) version** of Jarvis.
10. **No paid AI brain and no paid voice yet.** Both wait for Bilal's explicit go.
11. **Nothing hard-coded to Bilal** (name, city, currency are settings), so a rename for Lebanon stays easy. LBP is supported in the currency list and receipts.
12. **Calm Home.** One big mic, a few key tiles and quick actions, with the rest behind the bottom menu (Bilal found earlier versions crowded). Everything should be one or two taps away.

---

## 10. MY PREFERENCES (Bilal's standing rules)

- **I'm a beginner.** Finance background, no coding. Explain everything in plain language and explain technical words the first time.
- **Voice-first.** I talk to Jarvis and never type. At most I copy and paste. Any setup you give me should be taps and Copy buttons, not typing.
- **Only ask my okay for important decisions:** anything that costs money, can't be undone, publishes something outside the project, or changes the goal. Handle minor steps yourself (building, testing, committing, pushing updates to the site has been done under blanket okays).
- **When I say I'm going to sleep or give a blanket okay,** go ahead without asking. In the morning, tell me which okays you gave automatically, what was done, and what's left.
- **Resume automatically after a usage limit.** Never wait for me to say "continue".
- **Quality bar: best option, no rough first drafts, always double-check.** Use builder agents for the work, then **separate reviewer agents** to check it (a second reviewer when unsure), fix what they find, and only then send it to me.
- **After every big batch of work:** run an independent deep audit of the live app like a real person would use it (UX, visuals, accessibility, everything one or two taps away, iPhone integration), test heavily (thousands of automated cases are fine), fix, re-review, publish, then send me **one** summary. I'm at work from about 8 AM. Beirut time, so I'm back around 5-6 PM.
- **Premium look.** Polished, modern, like a top-tier iPhone app. I found v1 "too basic".
- **Keep it sellable.** Professional and friendly, nothing hard-coded to me. I may rename it and sell it in Lebanon.
- **Paid things:** a paid AI brain ($5-10/month) is wanted later. Wait for my go. Same for a paid voice.
- **When a security/permission prompt needs my tap,** give me a direct link and say exactly where to tap.
- **Messages:** lead with the result, short and clear, and give the live link with "close and reopen Jarvis" when something is updated.

---

## 11. ANYTHING ELSE (gotchas)

- **Always `git pull --rebase origin main` before pushing.** The "Markets data" bot commits to `main` about every 30 minutes on weekdays and force-pushes `gh-pages`. If you only push `main`, the site won't change until the bot's next run.
- **Don't edit `data/finance.json` by hand.** The bot overwrites it.
- **Bump `sw.js` `CACHE`** on every app release, and keep its `FILES` list in sync with the feature files.
- **`brain.js` must load last**, and `brief.js` defines `Jarvis.addBriefLine` that other features use, so keep the script order in `index.html`.
- **The iPhone Calendar "Add" screen only appears for a real https link returning `text/calendar`.** That's why `sw.js` serves `/ics/<name>.ics?d=<base64url>` on the same site. A `data:` or blob link was blocked on iPhone.
- **Shortcuts "Open URLs" opens Safari**, never the home-screen app. That's the reason behind the "use only the Action Button version" rule.
- **Test as Bilal speaks:** iPhone dictation adds a final period, uses curly apostrophes (`’`), says "Jarvis, ..." first, and spells numbers as words. Test casual Lebanese-English phrasing too.
- **Cloud sessions can't open `bilal-daou.github.io` directly** (the network proxy blocked it in earlier sessions). Test locally with `python3 -m http.server` + Playwright/Chromium, and check the GitHub Pages deploy run in Actions instead.
- **New Gemini keys start with `AQ.`** (since May 2026). Old ones start with `AIza`. The key check in `food.js` accepts both.
- **Lebanese context:** LBP amounts can be huge (millions). The default LBP rate is 89,500 per USD in `receipt.js`, and live rates come from open.er-api.com.
- **Plan document** from the very first thread: https://claude.ai/artifact/TRe9zKRk4WGmr9xT6sd9VL (the beginner's plan, roadmap and example prompts).
- **Roadmap at a glance:** P1 notes/reminders/budget ✅ · P2 finance brief + econ calendar ✅ · P3 food scanner ✅ (plus receipts, habits, brief, calendar, Health added on the way) · P4 voice/meeting notes ⏳.
- **Bilal's GitHub login is `Bilal-Daou`.** The Claude GitHub App is installed on the repo, so a new session can push to it.

---

## 12. WHERE THE FILES ARE

**Short answer: the only up-to-date copy of the app's code is on GitHub.** Nothing has been saved into a folder on your computer.

1. **GitHub (the master copy):** https://github.com/bilal-daou/jarvis-2
   - GitHub is a website that stores code. Open the link and you'll see the files (`index.html`, the `features` folder and so on). Tap any file to read it.
   - **To download everything as one file:** on that page tap the green **Code** button, then **Download ZIP**. Or use this direct link: https://github.com/bilal-daou/jarvis-2/archive/refs/heads/main.zip
     - **On iPhone:** the ZIP goes to the **Files** app → **Downloads**. Tap the ZIP once and it unpacks into a `jarvis-2-main` folder.
     - **On a computer:** it goes to your Downloads folder. Double-click the ZIP to unpack it.
2. **The live app (the website itself):** https://bilal-daou.github.io/jarvis-2/. This is what your Action Button opens. GitHub builds it automatically from a copy of the same code (that copy is called the `gh-pages` branch; a "branch" is just a named copy of the code kept on GitHub).
3. **This handoff file** is saved in two places:
   - In this Claude project's files: `jarvis-2/HANDOFF.md` (the same folder also holds **old** app files from 15 November, so don't use those as a starting point).
   - On GitHub: until you approve it, it sits in a "pull request" (a proposed change you accept with one tap: open the link I send you and tap the green **Merge pull request** button, then **Confirm merge**). After that it's at https://github.com/bilal-daou/jarvis-2/blob/main/HANDOFF.md.
4. **To continue in a new Claude Code session:** start the new session with the repository `bilal-daou/jarvis-2` selected (when Claude Code asks which repository to use, pick **jarvis-2**). Then copy this whole document and paste it as your first message, or just say: "Read HANDOFF.md in the jarvis-2 repo first, then continue." The Claude GitHub App is already installed on the repo, so the new session can save changes to it.
5. **Your personal data** (notes, expenses, reminders, food, habits) is **not** in any of these places. It lives only inside Safari on your iPhone. To keep a copy: open Jarvis, tap the **gear icon** at the top of Home (or More → Settings), go to **Backup** and tap **Save**. A `jarvis-backup-<date>.json` file lands in Files → Downloads. To bring it back later, use the **Restore** button next to Save and pick that file.

---

## 12a. MAKING IT SELLABLE (brand-free link, App Store) · 20 Nov 2026, v32

Goal (owner): a buyer never sees the owner's name or can link the app to him (not in the link, the app, or the code), enters their own details and it's their app. Maybe the App Store later.

**Done in v32 (commits `a83c8b2`, `385411a`), tested on localhost and on the live site:**
- `features/calendar.js`: `APP_URL` removed. `appURL()` = `location.origin + location.pathname` (minus `index.html`) feeds the Shortcut guide's `#sync=` link and the alarm Shortcut's `x-success` back link. The live link is unchanged, so the owner's Shortcuts keep working. On localhost the guide now shows the localhost link (only matters when testing on a PC).
- `features/finance.js` `repoEditLink()`: no fallback owner/repo. Returns `''` when the app isn't on `*.github.io`, and then the "Open the feed list on GitHub" button is hidden.
- README rewritten (current features, no owner link). Manifest description updated. Owner name removed from comments (brain.js, finance.js, the index.html name example, fetch_finance.py, workflow).
- **`_config.yml`** (GitHub Pages `exclude`) stops publishing `HANDOFF.md`, `CLAUDE.md`, `README.md` and `scripts/` on the app's address. Before this, `<site>/HANDOFF` showed these notes (full name, GitHub login, personal habits) to anyone with the link. They're still in the public repo. **If you add another notes file at the repo root, add it to `exclude`.**

**Still tied to the owner (his decisions):**
1. The link `bilal-daou.github.io/jarvis-2`.
2. The public repo `Bilal-Daou/jarvis-2`: its name, HANDOFF.md/CLAUDE.md, and git history (authors "Bilal Daou" and "bilaldaou2002"; 30 commits carry his university email, readable by anyone through a commit's `.patch`). History can't be cleaned without a rewrite, so the plan is a fresh repo with no history.
3. One comment in `index.html` (~line 2064, the v31 orange-dot block: "v30 report + Bilal"). Left alone because another session owns that code. Change it to "the owner" the next time that block is edited.
4. This PC commits with his university email (`git config user.email`). Suggested: switch to his GitHub "noreply" address (ask first).
5. The name "Jarvis" is Iron Man's AI in Marvel films (Disney). Pick a new name before selling, above all for the App Store. A rename touches manifest.json, `<title>`, `apple-mobile-web-app-title`, the footer, many spoken replies, the "Jarvis, ..." wake-word stripping in `think()`/brain.js, Shortcut default names in calendar.js, and alarm/.ics labels. **Keep the internal storage key `jarvis2`** (changing it wipes users' data; receipt.js writes it too).

**Lebanon-specific defaults** (good for the Lebanese market; they'd need to become settings for other markets): LBP rate 89,500 (`receipt.js` `DEFAULT_LBP_RATE`, and the lira-rate reply in brain.js ~668); "Beirut" one-tap city (brief.js `BEIRUT` line 21 + button ~620, Welcome sheet in index.html ~1947-1959) and "set my city to Beirut" examples; Lebanese public holidays and Mother's Day date (brain.js ~766-854); Lebanon fun facts (brain.js ~875-881); Lebanese foods and the AI food-photo prompt "The person lives in Lebanon" (food.js ~1189); receipts tuned for Lebanese dual-currency bills and DD/MM dates (receipt.js); Lebanese words (yalla, shukran); Lebanese towns in the time-zone map (brain.js ~681).

**Neutral link options:**
- **Free (recommended):** a free GitHub **organization** named after the new app. Copy only the app files into a fresh repo (one first commit, neutral author, no HANDOFF/CLAUDE; keep notes in a private repo or on the PC), turn on Pages (gh-pages) and Actions (the market bot moves with the code; turn it off in the old repo). Repo `<org>.github.io` gives `https://<org>.github.io/`. Use an organization, not a second personal account: GitHub's terms allow one free personal account per person.
- **Paid (only on his go):** a custom domain, about $10–15/year. Turn on WHOIS privacy (usually free). Point the bare domain with A records; a `www` CNAME to `<user>.github.io` shows the GitHub account in DNS.

**Moving the owner's phone to a new link** (storage is per address, so a new address starts empty):
1. Old address: Settings → Backup → Save.
2. New address: Settings → Backup → Restore, then re-paste the Gemini key (`jarvis2-ai` is never in backups).
3. "Jarvis" Shortcut: replace the link in Open URLs with the Copy button in More → Connect your iPhone. "Jarvis Alarm" needs no change (its back link now comes from `appURL()`).
4. Old address: replace its site with a small redirect page that keeps `location.hash` (so `#sync=` still arrives) for a few months. Only after step 1.
5. Re-add any home-screen icon.

**App Store (paid, only on his go):** Apple Developer Program $99/year. An individual account shows the person's legal name as the seller, so "not linked to him" needs an **organization** account (a legal entity + a free D-U-N-S number). Wrap the web app with Capacitor (free). Building needs Xcode, so a Mac, a rented cloud Mac or a cloud build service (Codemagic, GitHub Actions macOS runners). Guideline 4.2 rejects plain website wrappers, so add native value: local notifications (reminders ring when the app is closed), native speech in/out (would also end the iPhone web-voice and orange-dot problems), HealthKit directly (no Shortcut). A privacy policy URL and App Privacy labels are required (HealthKit has extra rules). Apple keeps 15% of sales under the Small Business Program. Full plain-language report: in the 20 Nov "brand-free" session.

---

## 13. SESSION LOG (Claude Code desktop, 17–18 Nov 2026)

- Code now lives locally at `D:\Desktop\JARVIS 2.0` (git clone). This PC pushes as GitHub user `bilaldaou2002`, a collaborator on `Bilal-Daou/jarvis-2`. Python 3.12 + Node are installed; local preview = `.claude/launch.json` ("jarvis", port 8000).
- **v9 (45e7f44) made iPhone voice WORSE** (no recognition, no speech, mic dot still on): it chunked speech, wrapped `speechSynthesis.cancel`, added a first-tap silent utterance and suspended calendar.js's AudioContext. **Reverted in v10.** Don't reintroduce those without a real-iPhone test, and change one thing at a time.
- **v11:** if speech hasn't started after 1.8 s, the voice is marked dead (`localStorage['jarvis2-deadvoices']`) and the reply is repeated with the default voice. Theory: iPhone lists Premium/Enhanced voices that aren't downloaded, and the auto-pick prefers them, so speech is silent. Added `Jarvis.stopSpeaking()`. **Waiting on an iPhone test.**
- Still open: the orange mic dot stays on after closing the chat (X).
- **v12 (18 Nov):** receipts now read Lebanese dual-currency totals (`lebaneseDual()` in `features/receipt.js`). Tested end to end in the browser with a real VCoop photo (`.claude/test/vcoop.jpg`, local only), which gave VCoop, $122.70, 2 Nov 2026, Groceries. The browser pane can now open localhost, so test receipts locally with `Jarvis._receipt.onFile(file)`.
- Voice: Bilal's iPhone was on **Silent** (🔕). Website speech is muted in Silent mode. Waiting to hear whether it speaks with Silent off. If yes, the next step is making speech play even on Silent (one change only).
- **v13 (18 Nov):** confirmed that speech works with Silent off. `speak()` now sets `navigator.audioSession.type = 'playback'` (but never while the mic is listening) so Jarvis can talk on Silent. **Not yet tested on the iPhone.** If listening breaks, revert this one line.
- Still open: the orange mic dot after closing the chat (X). Next fix, done on its own.

### Where to pick up (end of the 18 Nov session)
- **v13's Silent-mode change didn't work** (`audioSession = 'playback'` doesn't make iPhone website speech play on Silent), so it was removed in **v14**. For now the answer is: Jarvis talks only when Silent is off. Possible next idea: tell the user on screen ("Your phone is on Silent, so turn it off to hear me"). Website speech can't be forced through Silent.
- **iPhone setup DONE on Bilal's real iPhone (18 Nov, evening, guided by screenshots):**
  - "Jarvis" shortcut (run by the Action Button) sends calendar, steps, active energy, resting heart rate and sleep via `#sync=`. All verified arriving (Connect page shows ✓ Arrived; his exact link was replayed on localhost and parsed fine).
  - Real-device findings: a bare "Repeat Item" bubble (not set to Title/Value) works, since calendar events become their title and sleep samples their stage (Deep/Core/REM/Awake). "Fill Missing" in Group by Day adds a harmless `0` line (steps/energy are summed). Shortcuts' "last 1 day" for sleep returns from the start of yesterday. On his iOS, tapping a shortcut tile opens the editor (no •••), and the guide text was fixed in **v15**.
  - "Jarvis Alarm" shortcut: its Input/Time were empty (faded). Fixed to Get dates from **Shortcut Input** → Create Alarm for **Dates**. The Test button created a real Clock alarm. ✅
  - Deleted leftover shortcuts "Rename Shortcut" and "Open URLs".
  - Sleep showed "nothing for last night" only because he didn't wear the watch. **19 Nov: confirmed, real sleep shows (6h 19m with Deep/Core/REM/Awake).**
- **Next tasks, in order, one per session:**
  1. ~~Clock-alarms block~~ **DONE 19 Nov** on his iPhone (iOS calls it "Find Alarms"; Repeat Item → Label | Time | Is Enabled; arrived fine: ~120 alarms, all off, many old/"Jarvis" test ones). Suggested he add Find Alarms filter "Is Enabled is on". v16 = guide text says Find Alarms. NEXT: task 2.
  2. **Shareable iCloud links for future customers:** from his phone, Share → Copy iCloud Link for both "Jarvis" and "Jarvis Alarm", then add an "Add the shortcut" button in the Connect page so customers skip building it. Remove anything personal first; the URL inside is the public app URL, so that's fine.
  3. **The mic dot** stays on after closing the chat (X). Try one small change at a time, publish, and have Bilal test.
- **v17 (19 Nov), three small improvements, tested on localhost (not yet on iPhone):**
  - **Mic dot attempt (one change):** calendar.js keeps an AudioContext running from the first tap (for the in-app alarm). After the mic, `finish()` in index.html now calls `Jarvis.calendar.audioRest()`, which suspends it (not while ringing or in nightstand) and re-arms `unlock` so the next tap resumes it. **Result on iPhone: the dot now goes away on X ✅, BUT the mic stopped hearing after the first question**, because `audioRest` re-armed `unlock`, so the next tap (the mic button) resumed audio while recognition started. **v18 removes the re-arm** (startSound() resumes audio itself when an alarm rings). Ask Bilal whether the mic now hears every time. Lesson: never wake/resume audio on the mic tap.
  - **v18 still bad on iPhone** (Bilal, 19 Nov): first reply not spoken, 2nd mic use didn't hear, slow, and **the voice changed by itself**. **v19:** (a) removed the `audioRest()` call from `finish()` entirely, so the mic is back to v16 behaviour (orange-dot problem open again; next idea: suspend only on the X / closeSheet, tested alone). (b) Real cause of the voice change: v11's silent-voice fallback put the chosen voice on a permanent dead list after ONE reply that didn't start in 1.8 s. Now: retry once in the same voice, mark dead only after 3 failed replies in a row and show a toast; old list key `jarvis2-deadvoices` is wiped on load (new key `jarvis2-deadvoices2`). **Bilal confirmed v19 works (hears every question, same voice).** Bilal wants: fast, reliable, voice never changes on its own; later a paid natural "Jarvis-like" British butler voice + smarter brain, AFTER the free app is polished.
  - **Backup nudge:** Home shows "Save a backup" when the last backup is 7+ days old, or none was ever saved and the data is 2+ days old. The date is in localStorage `jarvis2-lastBackup` (outside db). Settings → Backup → Save also records it. Bilal's real backup on 19 Nov came before this code, so he'll see the nudge once; one tap clears it.
  - **Morning brief:** the health line now adds "a bit short" / "a solid night" and the next iPhone Clock alarm that is ON within 24 h (Bilal's alarms are all off, so it won't say it yet).
- **Working rules learned:** Bilal can't read code. Test everything possible on the computer first (the browser pane works on localhost; run `Jarvis._receipt.onFile(file)` for receipts). Only voice/iPhone things need him to test. Keep each change small and reversible.

### Where to pick up (end of the 19 Nov session)
- **Working on iPhone (v19):** sleep, Clock alarms (Find Alarms block), mic hears every question, voice stays the chosen one, speed is fine (Bilal confirmed). Backup nudge and the brief's next-alarm/sleep-quality line are live (only localhost-tested; his alarms are all off, so no alarm line yet).
- **Next session, first task: the orange mic dot after X.** It's back since v19 undid the v17 fix. v17 proved that suspending calendar.js's AudioContext (`Jarvis.calendar.audioRest()`, still in the code, unused) clears the dot, but calling it after EVERY recognition broke speech/listening. Next try, ONE change only: call `audioRest()` from `closeSheet()` in index.html (the X) only, never from `finish()`, and never resume audio on a tap. Publish, then Bilal tests: dot gone after X? Mic still hears 3 questions in a row? Same voice?
- **Then:** shareable iCloud links (Bilal: "later"), a full check of every screen, then the paid upgrades **only on his explicit go**: smarter AI brain and a natural British-butler voice "like Jarvis" (ElevenLabs or similar, ~$5/month; no cloning of the film actor's voice). His plan: polish the free app first, pay last.
- Bilal saved his first backup on 19 Nov; remind him weekly.

### 20 Nov session
- **v20:** `closeSheet()` (the X) now calls `Jarvis.calendar.audioRest()`. Only change. Not yet tested on iPhone.
- **v21: Debug report.** `jvLog(msg)` (top of main script) keeps the last 200 mic/voice/audio events in localStorage `jarvis2-debuglog` (times + event names, never the spoken words). Settings → Debug report → Show / Clear. Shows app version and audio-engine state. Testing flow: Bilal clears it, does the test, taps Show, sends one screenshot; Claude reads it.
- **v22:** Settings footer shows "version N" (bump it AND the `jv-ver` meta in index.html AND `CACHE` in sw.js every release). sw.js now fetches with `cache: 'no-cache'`, because GitHub Pages sends `max-age=600` and the phone kept showing the old app for up to 10 min after a publish (Bilal saw no Debug report right after v21).
- **First real debug report (v22, Bilal, 19 Nov ~23:55):**
  - Mic use #1 (before any X) heard fine, but the reply was NOT spoken: `speak (try 0)` and `(try 1)` never got `voice started`. Speech right after the mic is silent sometimes (bug A, open). Next idea, ONE change: wait ~0.5 s after the mic ends before speaking, and/or don't switch `audioSession` to 'playback' right before speaking.
  - Every mic use AFTER X (which ran `audioRest`, suspending the AudioContext) got `mic onstart` within ~25 ms (the first one took 1 s) and then never heard anything. **So suspending the AudioContext breaks later recognition on iPhone, even without resuming it.** Same lesson as v17. Don't use `audioRest` for the mic dot again; the orange dot needs a different idea.
  - The brief (speaking without the mic) works every time.
- **v23:** removed `audioRest()` from `closeSheet()` (back to v19 mic behaviour; orange dot will be back). More logging: `mic heard words` (first result), `heard N letters` on finish, `mic tap: stop` for a manual stop.
- **v23 report (Bilal, 20 Nov 00:00):** the mic heard 5/5 (X no longer breaks it) ✅. But speaking after the mic failed 5/5 (`speak` try 0 + try 1, never `voice started`, voices Samantha and Daniel). `speak` ran ~6–40 ms after the mic ended. In the v22 report the brief spoke fine ~1.1 s after a mic end with the same 'playback' session → timing, not the session type.
- **v24 (ONE change):** `speak()` waits until `AFTER_MIC_MS` (1000 ms) has passed since `lastMicEnd` (set in `finish()`), logging `speak waits N ms after mic`. A newer speak/stop or a new mic cancels the wait. Next: Bilal tests; if speech now works, try lowering to ~600 ms for speed. If not, look at the retry (cancel()+speak() in the same instant) and then the 'playback' switch.
- **v24 report (20 Nov 00:05):** the 1 s wait did NOT help (0/4 mic replies spoken, no `voice started`). The brief, started by a tap 2.7 s after a mic use, spoke fine. Every test began with a full close + reopen, then the mic first. **New theory:** iPhone WebKit blocks `speechSynthesis.speak()` that isn't inside a user gesture until one gesture-speak unlocks it. AudioContext was unlocked on the first tap (calendar.js) but speech never was; the brief tap was the first gesture-speak.
- **v25 (ONE change):** `unlockSpeech()` in index.html: the first pointerdown/touchend/click anywhere, EXCEPT on `#micBtn` (v17 lesson), speaks a zero-volume ' ' utterance and logs `voice unlocked by a tap`. Also logs `app opened`. The v24 1 s wait is still in; if v25 works, lower `AFTER_MIC_MS` (try 300, then 0) for speed. If the first tap after opening is the mic button itself, the voice isn't unlocked yet. Watch the report for that (opening the chat sheet is a tap, so normally it's covered).
- **v25 report (20 Nov 00:10):** the unlock didn't help: 0/5 mic replies spoken, even after X taps (which surely unlocked). The brief spoke 5 s after a mic end. Found: **the dead-voice rule was switching voices again** (Samantha→Daniel→Karen across v23/v24), because silent replies after the mic counted as misses.
- **v26:** (1) FIX: dead-voice list wiped (new key `jarvis2-deadvoices3`) and misses within 20 s of a mic end never count. (2) DIAGNOSTIC: speak retries up to 3 times, 1.5 s apart (first try ~1 s after mic, last ~5.5 s). (3) DIAGNOSTIC: Settings → Debug report → **Test voice** speaks 3 s after the tap (outside the tap). The header shows `voice unlocked: yes/no`.
  - Read the next report like this. Late retries start (`voice started` after try 2/3) → iPhone needs ~3 s after the mic; fix = wait longer / keep retrying. The Test voice is silent on a fresh open with no mic use → iPhone blocks any speak not inside a tap; fix = speak inside a tap (e.g., the user taps the mic to stop, or tap-to-hear on the reply). The Test voice speaks but mic replies never do → something mic-specific (try not setting audioSession 'playback').
- **v26 report (20 Nov 00:15): KEY FINDING.** The Test voice (speak 3 s after a tap, NO mic used, `voice unlocked: yes`) was silent on all 4 tries, twice. Mic replies were silent on every try too. **So on Bilal's iPhone, speech that doesn't start inside a tap is silent; the mic is not the cause.** The zero-volume unlock doesn't help. Still unknown: is it iOS's rule, or the running AudioContext (calendar.js alarm engine) blocking non-tap speech?
- **v27:** (1) `AFTER_MIC_MS` = 0 (the wait didn't matter) and one retry again. (2) Every Jarvis chat bubble has `data-say`, so tapping it speaks it (a tap always works). A reply that couldn't be spoken gets a "🔈 Tap to hear" label (class `tap-hear`). (3) DIAGNOSTIC: Settings → Debug report → **Voice tests**: test 1 speaks 3 s later as is; test 2 pauses the AudioContext at 7 s and speaks at 9 s; then it resumes the engine at 13 s.
  - Next: if test 2 speaks and test 1 doesn't → the AudioContext blocks speech; fix = only run the engine when needed (but v20/v22 showed a SUSPENDED engine during the mic stops hearing, so maybe close/recreate instead, carefully). If both are silent → iOS rule: hands-free spoken replies are impossible in a web app; options: tap-to-hear (done), tap the mic to finish = answer spoken inside that tap (handle text synchronously in the stop tap), or the paid/native route later.
- **v27 report (20 Nov 00:23): mic replies SPOKE 4/4** (`voice started` right after `speak try 0`). The log began with a few tap-started speaks (voice previews or bubble taps). **Conclusion:** on iPhone, ONE real tap-started utterance unlocks speech for the session, and after that non-tap speech (mic replies) works. The v25 unlock used ' ' (blank) at volume 0, which iOS didn't count. Bilal didn't run the Voice tests (not needed now).
- **v28:** the unlock speaks '.' (volume 0, rate 2) on the first non-mic tap and logs `voice unlock: started (good)` / `did not start, will retry on next tap` (it re-arms until some speech has started). The header now shows `voice unlocked: yes` only once speech has REALLY started (`speechEverStarted`). Tap-to-hear bubbles stay as a fallback.
  - If '.' isn't counted either: try a real short word on the first tap (but iOS may ignore volume 0, so it might be audible), or speak a short greeting when the chat opens.
  - Not done: the orange dot (later; don't use `audioRest`); maybe remove the Voice tests button once the voice is settled.
- **v29:** X (`closeSheet`) also calls `stopSpeaking()`. Bilal pressed X during a long spoken answer and it kept talking.
- **v29 report (20 Nov 00:31): ✅ WORKS.** After a fresh open with no voice taps, 6/6 mic answers were spoken (`voice started` within ms of `speak try 0`), hearing 6/6, same voice (Karen), and X stopped the voice both times.

### Where to pick up (end of the 20 Nov session)
- **Voice + mic are fixed (v29, confirmed on iPhone).** The root cause was that iPhone only allows a web app's non-tap speech after ONE real tap-started utterance. The first non-mic tap now speaks '.' at volume 0 (`unlockSpeech`). Don't remove it. Tapping an answer bubble also speaks it ("Tap to hear" label if a reply couldn't speak).
- **Debug report** (Settings → Debug report: Voice tests / Show / Clear) is the testing method now. Bilal does the test, taps Show and pastes or screenshots it. Keep `jvLog` calls for any audio/mic change. The "Voice tests" button can be removed later (no longer needed).
- **Release checklist:** bump `jv-ver` meta + footer "version N" in index.html + `CACHE` in sw.js.
- **Next task: the orange mic dot after X**, using the debug report. Proven: suspending the calendar AudioContext (`audioRest`) clears the dot but makes later recognition hear nothing → don't. Ideas to try one at a time: check whether the dot is tied to the recognizer (`releaseRec` aborts it, but maybe call `r.stop()` first), the audio session ('none' instead of 'playback' after the mic?), or just iOS's normal indicator lingering a few seconds. First ask Bilal exactly when it shows and how long it stays.
- Then: shareable iCloud links, a full screen check, paid voice/brain only on his go. Remind about the weekly backup.
- **v30 (logging only) report (20 Nov 17:03):** after X, every 2 s for 20 s: recognizer=none, listening=false, speaking=false, audioSession=playback, **calendar AudioContext=running**. So the recognizer and session are already released; the only thing still "live" is the running AudioContext (already known: suspending it clears the dot but breaks later hearing). Mic heard 4/4, voice spoke 3/3. Waiting on Bilal: how long the dot stays after X. Next idea (one change): on X, close() the AudioContext and recreate it on the next NON-mic tap (not suspend), log it, test that hearing still works 3x.
- **Bilal (20 Nov ~17:10):** the dot stays 25 s+ after X. His workaround ALWAYS clears it: reopen the chat (the mic auto-starts), then X while it is listening (= `finish(r,false)` → abort mid-listen, no speech after). Voice also works with Do Not Disturb on (he always uses DND).
- **v31 (ONE change):** on X, if the mic was used since the chat opened and isn't listening now, `flushMic()` starts a hidden recognizer inside the X tap and aborts it 1 s after `audiostart` (or at 2.5 s), session auto→playback around it, the same as his workaround. A real mic start kills it (`killFlush`). Logs `dot flush: ...`. Tested on localhost (runs and cleans up; the mic is blocked there). Next: Bilal tests: dot gone after X by itself? Mic still hears 3x in a row after reopening? If the flush breaks hearing, remove it.
- **Bilal's next wishes:** (1) make the app brand-free for selling: no name in the link (`bilal-daou.github.io`), nothing tied to him; maybe the App Store later (needs Apple Developer $99/yr + a native wrapper; paid only on his go). See the "hard-coded bits" list in Known problems. (2) He mentioned "11 photos" from an older chat about optional things to add in the app; not in this repo's notes, so ask him to resend.
- **v31 result (Bilal, 20 Nov ~17:16): ✅ ORANGE DOT FIXED.** On X, `dot flush` start → audiostart → abort (1 s); the dot went away both times, and the mic still heard every question afterwards (4/4, same voice Karen). Keep `flushMic()`; don't remove it.
- **v33 (one change + logging; v32 was the brand-free session):** a tap anywhere on a Jarvis answer used to replay it from the start (Bilal: customers will find that annoying). Now each answer has a small 🔈 button (`.say-btn`): tap = play, tap again while it plays = stop. Taps on the answer text do nothing but log `tapped an answer (not the speaker), speaking: true/false`. The "Tap to hear" label now sits on the 🔈. Debug report shows the last 200 lines (was 60). Tested on localhost.
  - Open question: Bilal says he "has to tap the screen for it to start talking". In the v31 log the first answer DID report `voice started` 1 s before his tap (then the tap restarted it), and the next answers spoke without a tap. Next report should show whether replies are truly silent until a tap (look for `tapped an answer ... speaking: true` right after `voice started` = iPhone says it's talking but he hears nothing).
- **v33 report (Bilal, 20 Nov 17:36):** 🔈 button works (10 taps on the answer text while it spoke = no restart). Dot flush worked 2/2. After the first reply, 6/6 replies spoke by themselves. **BUT the first reply after a fresh open was silent** (`speak` try 0 + 1, no `voice started` → "Tap to hear"; he tapped 🔈 and from then on all was fine). Cause: the wake-up '.' at volume 0 logged `did not start` on all 3 taps (2 in Settings, 1 that opened the chat and started the mic, where `startListening`'s `speechSynthesis.cancel()` kills it ~50 ms later).
- **v34 (ONE change):** the wake-up says the real word 'Ready' (volume 0, rate 2, in the chosen voice) instead of '.'; logs `voice unlock: ended` (and `WITHOUT starting`) plus `mic start: cancels a pending voice unlock`. Next: if it starts on iPhone, the first reply should speak. If he HEARS "Ready", iOS ignores volume 0 (decide whether that's acceptable). If the wake-up is cancelled by the orb/mic tap (customer path: first tap = the orb), next fix = don't cancel a pending wake-up in `startListening`, tested alone.
- **v34 report (Bilal, 20 Nov 17:41):** first reply still silent; 'Ready' wake-up logged neither start, end nor error (dropped entirely), and the second try was cancelled by the mic start 64 ms later. Header `audio now: none`: the calendar AudioContext was never created in that load (unexplained; v33 had it running).
- **Root-cause theory:** `UNLOCK_EVENTS` began with `pointerdown`, which fires first and removed the touchend/click listeners. On iPhone a touch `pointerdown` is NOT a user activation (only touchend/click), so speech started there is dropped silently. The 🔈 button (click) always worked.
- **v35 (ONE change):** `UNLOCK_EVENTS = ['touchend','click']`; the log says which event ran the wake-up. Logging only: calendar.js `ctx()` logs `audio engine: could not create (...)`. NOTE: calendar.js `unlock()` also starts on `pointerdown` (AudioContext); may explain the engine issue, so look at it next if the report shows it. If the wake-up still gets cancelled by an orb/mic tap, next fix = `startListening` doesn't cancel a pending wake-up.
- **v35 report (Bilal, 20 Nov 17:45): ✅ ALL GOOD.** After a fresh open, the FIRST reply spoke by itself (`voice started` 2 ms after `speak try 0`), 5/5 heard, 5/5 spoken (Karen), dot flush 3/3 (dot gone), engine running. Bilal: "perfection".

### Where to pick up (end of the 20 Nov evening session)
- **Voice, mic and orange dot are all fixed and confirmed on iPhone (v35).** Keep: `unlockSpeech` on touchend/click only (never pointerdown), 'Ready' at volume 0; `flushMic()` on X; the 🔈 `.say-btn` replay button (whole-bubble tap no longer replays).
- **Optional cleanup later (one at a time, low priority):** the v30 "after X" 2-second state logging (`watchAfterX`). (The Settings "Voice tests" button was removed in v36.) calendar.js `unlock()` still starts on `pointerdown` too (AudioContext); it works now, so leave it unless the alarm sound has trouble.
- **Next tasks:** (1) Bilal will resend "11 photos" from an older chat about optional things to add in the app. (2) Making it sellable: see section 12a (link without his name, public repo history shows his university email, the name "Jarvis", App Store costs); every paid step needs his explicit go. (3) A full check of every screen. Remind him about the weekly backup. Keep replies SHORT with one step (he got confused by a long multi-topic answer).

### 20 Nov night session: full screen check → v36 (commit `867810f`)
- **How it ran:** the owner asked to split the work into separate sessions. One session checked every screen (read-only), three fixed problems in parallel (split by file so no two touched the same file), and the starting session did the last fixes, the release and this note. Working notes with every finding, file:line and test: the side-session notes file `screen-check-handoff.md` (outside the repo, in the Claude side-session-notes folder of the session that started this).
- **Owner's okays used:** he left with a blanket okay ("if there's anything that needs approval, you have my approval"). Used for: removing the Settings "Voice tests" button (it paused the alarm sound engine, risky for customers) and adding a Debug report **Copy** button; publishing v36. Nothing paid, nothing removed besides Voice tests.
- **What v36 changed (no voice/mic/audio code touched):**
  - First run: picking a city from the Welcome sheet ("Search a city" / "Use my location") now returns to the Welcome sheet (`openSetup` + callbacks in brief.js `openLocation`/`useGPS`). The Home weather tile refreshes by itself when a city is set or the forecast arrives (brief.js `homeChanged()` fires `jarvis:brief-state`).
  - Layout: no cut-off text on Today at 375 px (2-line clamp on the calendar, receipts and brief tile texts). Settings rows can use `set-row wrap` (label on its own line, buttons below); the Debug report row uses it.
  - Colours: new CSS var `--on-accent` (text on accent fills; dark for the blue/green/orange accents, set in `applyTheme()` via `LIGHT_ACCENT_INK`), and light-theme `--accent-ink` darker for those three (`--ink-k`). Use `var(--on-accent,#fff)` for any new white-on-accent text. Habits buttons pick dark/white text by brightness (`fillStyle()`, `goalFill`).
  - Navigation: new hook `Jarvis.subNav[viewId] = {open, label, close, leave}` in index.html (`subNav()`, `updateBar()`, `goBack()`, `go()`): a screen's inner page closes first on the top Back, iPhone swipe back and Escape; `leave()` runs when you go to another screen. Habits uses it for habit and goal details. `renderAll()` now also calls `updateBar()`.
  - Water: Habits' water habit and Food's glasses are one number (habits.js `waterToFood()` in `setValue()`/`putValue()`, guarded by `fromFood`; a new water habit starts at Food's glasses).
  - Markets: 5D charts and tiles use the 5-day move (`moveFor()`); calendar labels for central-bank speeches, inflation expectations, financial stability report.
  - Food: search/barcode retry once after 1.5 s; message no longer blames the internet when online; meal "+" clears the old search; "400 g e" → "400 g"; tapping a 7-day bar shows a "Showing …" toast.
  - Money: Restore shows what the backup holds and asks before replacing; Money has rows to Receipts and Markets (`#moneyLinks`). More profile card opens Settings at "Your name" (`showField()`).
  - Receipts: typed mode says "Scan instead"; saved receipts have Edit (opens the linked payment; `jarvis:expense-updated` copies changes back); blur tips hidden when the items add up.
  - Wording: `realName()` / `greetName()` in index.html: no ", there" anywhere in replies when no name is set; "what's my name" with no name explains how to set it; no-budget hint on budget questions; "Your habit is done today".
- **Testing gotchas learned:** in the browser pane, when the pane is hidden CSS slide animations freeze (views look shifted 34 px): inject `*{animation:none!important;transition:none!important}` before layout checks. The local python server lets the browser cache feature files: `fetch(url,{cache:'reload'})` each changed file, then reload. Screenshot coordinates are 1.5× CSS px. `navigator.clipboard` only works on a real tap (a JS `.click()` falls back). Computed colours may come back as `color(srgb r g b)` in 0–1.

### Where to pick up (end of the 20 Nov night session)
- **v36 is live.** The owner hasn't tested it on his iPhone yet. Give him the iPhone checklist below ONE step at a time.
- **iPhone checklist (only a real iPhone can show these):**
  1. Close and reopen Jarvis twice. Settings, at the very bottom, says "version 36".
  2. Ask Jarvis 3 questions with the mic. Each answer is spoken, and the orange dot goes away after X (v35 behaviour must be unchanged).
  3. Food → Snap your food: the camera opens; take a photo of a plate (needs the Gemini key).
  4. Money → Receipts → Scan a receipt: the camera opens; scan a real receipt; check store, total and date.
  5. Set a reminder 2 minutes ahead → "Add to Calendar (rings)": the iPhone Calendar "Add" screen appears; tap Add; it alerts in 2 minutes.
  6. Press the Action Button: Jarvis opens, and More shows "iPhone connected · Last sync just now".
  7. Settings → Debug report → Copy, then paste in Notes: the whole report pastes.
- **Known, not fixed (next sessions, one at a time):**
  - "remind me to pay rent on the 1st at 9 am" is set for TOMORROW 9 AM and keeps "on the 1st" in the text. Date parsing in `think()`/brain.js; re-test widely after any change there.
  - Red and pink accents: white button text is 3.5–3.7:1 (4.5 wanted). Owner to decide whether to darken them. Purple (default) passes.
  - Watchlist rows show today's % in the pill while their 5D line shows the 5-day move.
  - After "Use my location" the Welcome chip says "Your location · Change" until the town name arrives; closing the city search by tapping the backdrop doesn't return to the Welcome sheet.
  - Connect guide `.tg` tags ("Optional", "3 actions") are 4.1–4.4:1 contrast.
  - Before selling: consider hiding the Debug report for customers (e.g. show it after 5 taps on the version line). `watchAfterX` (v30 "after X" logging) is still called from `closeSheet`; remove only together with other voice work and an iPhone test.
  - Two comments in index.html still say "Bilal" (the v34 wake-up block and the v31 dot-flush block). Change to "the owner" only when that voice code is edited anyway.
- **Next tasks (unchanged):** the owner's "11 photos" of optional features (ask him to resend), making it sellable (section 12a), weekly backup reminder. Keep replies SHORT, one step at a time.

### v37 (20 Nov 2026, late night): customers never see the Google key screen
- Owner's point: a paying customer should never be asked to create a Google API key. Chose option B (free, now).
- `features/food.js`: with no AI key, a photo without a barcode now opens `showNoBarcode()` (search, "Type it myself", "Scan a barcode instead", tip to say it on the mic) instead of `showAiSetup`. The same goes for the `nokey` error. The capture sheet no longer shows "Turn on AI for plates". The AI card moved into a folded `<details class="fdp-adv">` "Advanced: use your own Google AI key" at the bottom of Food. The setup sheet and the voice command still work for whoever wants their own key.
- Tested at 375px in light and dark (no-barcode sheet, search hand-off). Not tested on iPhone yet.
- Costs list given to the owner (domain, Apple $99/yr, Google Play $25 once, AI/voice/database usage, store cut). Plan agreed: finish the free polish first, then Capacitor apps (Android first, iPhone when he gets a Mac), then the paid "wow" parts, then the business parts. Option A (owner-run AI helper) waits for his go.
- Next: receipts. Ask him for ONE receipt photo it got wrong + what Jarvis showed.

---

## 14. AUTOMATIC TESTS (`tests/`, added 22 Nov 2026)

The JavaScript tests are back in the repo (replaces "JS suites are lost" in section 8).
- **Run:** `cd tests`, then `npm install` (first time only), then `npm test`. Uses the installed Google Chrome, iPhone size 375×812, light + dark. 66 checks, about 2–3 minutes, all passing on v37.
- **Covers:** load with no console errors, all 12 screens, typed brain commands (notes only when asked, expense, income, reminder, food, currency/name/theme), food search + v37 no-barcode sheet (`#fdnbQ`), receipt parser incl. `lebaneseDual()` (tested through `Jarvis._receipt.parse`, since it isn't exported), backup save/restore round trip.
- **Gotchas:** outside internet is blocked in tests; app files are served from disk by Playwright because `python -m http.server` stalled at random on Windows under parallel load (the Python server still starts). `node_modules/` and test output are gitignored.
- **Add a test** after every fix: copy a test in `tests/specs/`, use `app.say('...')` and `app.db()`. No app code was changed to make the tests pass (no bugs found).
