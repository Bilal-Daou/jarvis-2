# Jarvis 2.0

A voice-first personal assistant that runs in your phone's browser and installs like an app (Share → Add to Home Screen).
It works from whatever address it is hosted at: nothing in the code is tied to one account or domain.

**Talk (or type) to it:**
- Notes: "Note: idea for an app that scans food labels"
- Reminders: "Remind me to call mom every Sunday at 6 pm", "in 20 minutes", "tomorrow at 9 am"
- Money: "Paid 15 dollars for groceries", "Got paid 2000 salary", "Am I over budget?", "What's my balance?"
- Markets: "How's the market?", "Add Palantir to my watchlist"
- Food: "I ate 2 eggs and a banana", barcode scan, food photos
- Habits and goals: "I worked out", "Save 5000 dollars by June"
- Your day: "Good morning" plays a short brief (weather, reminders, spending, habits, markets)
- Questions: maths, conversions, currency, time abroad, definitions, "who is..."
- Fixes: "Undo that", "That was actually 40"

**Screens:** Home, Today, Money, Markets, Food, Receipts, Habits & Goals, Calendar & Alarms, Health, Notes, Reminders, Settings (name, currency, voice, theme, backup/restore).

**iPhone extras (optional):** an iPhone Shortcut can send calendar, Health and alarm data into the app, and set real Clock alarms. Setup is under More → Connect your iPhone.

Everything personal is saved on your own device. Nothing is sent to a server.

## Running it
Plain HTML, CSS and JavaScript with no build step. Serve the folder with any static host (for example GitHub Pages), or locally:

```
python -m http.server 8000
```

then open http://localhost:8000 in Chrome. Market data in `data/finance.json` is refreshed by the "Markets data" GitHub Action.
