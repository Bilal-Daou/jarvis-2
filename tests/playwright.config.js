// Playwright settings: serves the app from the repo root and runs every test
// on an iPhone-size screen (375x812), once in light mode and once in dark mode.
const { defineConfig } = require('@playwright/test');
const PORT = 8123;
const iphone = { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' };
module.exports = defineConfig({
  testDir: './specs',
  timeout: 60000,
  retries: 0,
  workers: 4,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}/`, browserName: 'chromium', channel: process.env.PW_CHANNEL || 'chrome', ...iphone },
  projects: [
    { name: 'light', use: { colorScheme: 'light' } },
    { name: 'dark', use: { colorScheme: 'dark' } },
  ],
  webServer: {
    command: `python -m http.server ${PORT} --bind 127.0.0.1`,
    cwd: '..',
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: true,
    timeout: 30000,
  },
});
