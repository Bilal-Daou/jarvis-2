# Jarvis automatic tests

These tests open the app in a real Chrome window (hidden) at iPhone size (375×812), once in light mode
and once in dark mode, and check that it works. No manual testing needed.

## Run everything (one command)

From this `tests` folder:

```
npm install
npm test
```

`npm install` is only needed the first time. The tests use the Google Chrome already installed on the PC.
To use Playwright's own Chromium instead: `npx playwright install chromium`, then `set PW_CHANNEL=chromium` before `npm test`.
Needs Node and Python (the runner starts `python -m http.server 8123` from the repo root by itself).

## What is covered (66 checks = 33 tests × light + dark)

- `app.spec.js` – app loads with no console errors, right theme; every screen opens (Home, Today, Money, More,
  Notes, Reminders, Settings, Food, Habits, Health, Markets, Calendar); bottom menu tabs.
- `brain.spec.js` – typed commands: small talk is never saved as a note, notes saved only when asked, expense,
  income, reminder "in 20 minutes", food "I ate 2 eggs and a banana", currency / name / theme changes, data survives reload.
- `food.spec.js` – offline food search, `parseFoods`, v37 photo with no barcode and no AI key → the
  search/type/voice sheet (`#fdnbQ`), never a key screen.
- `receipt.spec.js` – receipt parser with sample OCR text, including Lebanese dual-currency totals (`lebaneseDual()`).
- `backup.spec.js` – Backup save → wipe → Restore gives the same data back; non-backup files are refused.

## How it stays repeatable

- Outside internet (weather, fonts, Open Food Facts…) is blocked, so results never depend on the network.
- The app files are read straight from the repo folder (Python's simple server sometimes stalled on Windows
  when several test browsers loaded at once).
- Each test starts from a fresh, already set-up phone (`setupDone`, speech off). The service worker is turned off.
