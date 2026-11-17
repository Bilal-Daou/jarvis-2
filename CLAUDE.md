# Jarvis 2.0 — read me first

Voice-first personal assistant web app (PWA) for iPhone. Plain HTML/CSS/JS, no build step, hosted on GitHub Pages.

- **Full context:** read `HANDOFF.md` before changing anything (stack, structure, decisions, known problems, roadmap).
- **Owner:** Bilal — beginner, finance background. Plain language, explain technical words, give one clear next step.
- **Workflow:** one task per session; at ~25–30% context, update `HANDOFF.md` (what's done / next / gotchas) and start a new session.

## Must-follow rules
- `git pull --rebase origin main` before pushing (market-data bot commits to `main` ~every 30 min).
- Publish = `git push origin main main:gh-pages` (site serves `gh-pages`).
- Bump `CACHE` in `sw.js` on every app release; keep its `FILES` list in sync with `features/`.
- `brain.js` loads last in `index.html`. Never hand-edit `data/finance.json`.
- Notes are saved only when the user explicitly asks — don't regress.
- Nothing hard-coded to Bilal (must stay sellable). No paid services without his explicit go.
- Run locally: `python -m http.server 8000` → http://localhost:8000 in Chrome.
