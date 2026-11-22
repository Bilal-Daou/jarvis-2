// Shared helpers: open the app with a clean, set-up phone and no outside internet.
const { test: base, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };

// console messages that come from blocked outside services, not from app bugs
const IGNORE = [/Failed to load resource/i, /net::ERR_/i, /ERR_FAILED/i, /Failed to fetch/i];

const test = base.extend({
  app: async ({ page }, use, info) => {
    const errors = [];
    page.on('console', m => { if (m.type() === 'error' && !IGNORE.some(r => r.test(m.text()))) errors.push(m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    // keep tests offline and repeatable: only the local server is reachable
    await page.route(/^https?:\/\/(?!(localhost|127\.0\.0\.1)[:/])/, r => r.abort());
    // app files are read straight from the repo folder: Python's simple server sometimes stalls on
    // Windows when many test browsers ask at once, which made tests fail at random
    await page.route(/^http:\/\/(localhost|127\.0\.0\.1):\d+\//, async r => {
      let p = decodeURIComponent(new URL(r.request().url()).pathname).replace(/^\/+/, '') || 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: 'not found' });
      r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
    });
    const theme = info.project.name === 'light' ? 'light' : 'dark';
    await page.addInitScript(theme => {
      if (sessionStorage.getItem('__seeded')) return;      // seed once so reloads keep data
      sessionStorage.setItem('__seeded', '1');
      localStorage.clear();
      localStorage.setItem('jarvis2', JSON.stringify({ notes: [], reminders: [], expenses: [],
        settings: { name: 'Sam', currency: '$', budget: 0, speak: false, rate: 1, pitch: 1, voice: '', theme, accent: '#6d5dfc', setupDone: true } }));
      // no real speech in tests
      try { window.speechSynthesis.speak = () => {}; } catch (e) {}
    }, theme);
    // the simple Python server sometimes stalls a file under parallel load: try the page load once more
    const ready = () => page.waitForFunction(() => window.Jarvis && window.Jarvis.handle && window.__food && window.Jarvis._receipt &&
      ['food', 'habits', 'health', 'finance', 'calendar'].every(id => document.getElementById('v-' + id)), null, { timeout: 15000 });
    await page.goto('index.html');
    try { await ready(); } catch (e) { await page.reload(); await ready(); }
    const app = {
      page, errors, theme,
      say: async text => page.evaluate(t => { window.Jarvis.handle(t); const c = document.getElementById('chat'); return c && c.lastElementChild ? c.lastElementChild.textContent : ''; }, text),
      db: async () => page.evaluate(() => JSON.parse(JSON.stringify(window.Jarvis.db))),
      go: async id => page.evaluate(id => window.Jarvis.go(id), id),
    };
    await use(app);
  },
});
module.exports = { test, expect };
