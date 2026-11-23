// v42: the Home "Today" view, the bottom tab bar and the floating mic.
const { test, expect } = require('./helpers');

test('Home shows today at a glance, with Set up chips when nothing is set up', async ({ app }) => {
  const box = app.page.locator('#hmToday');
  await expect(box.locator('.hm-rings')).toBeVisible();
  await expect(box.locator('.hm-lg')).toHaveCount(3);                       // calories, steps, spent
  await expect(box.locator('.hm-next')).toBeVisible();
  await expect(box.locator('.hm-sleep')).toBeVisible();
  // a fresh phone: no Health sync, no budget -> gentle chips, never empty boxes
  await expect(box.locator('.hm-sleep .hm-chip')).toBeVisible();
  await expect(box.locator('[data-set-budget] .hm-chip')).toHaveText(/Set budget/);
  expect(app.errors).toEqual([]);
});

test('Home numbers follow the data (spending, calories, steps)', async ({ app }) => {
  await app.say('set my budget to 1000');
  await app.say('spent 40 on groceries');
  await app.page.evaluate(() => {
    const H = window.Jarvis.health.store, d = new Date(), p = n => String(n).padStart(2, '0');
    const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    H.syncedAt = Date.now(); H.steps = { v: 4321, day, at: Date.now() };
    window.Jarvis.go('home'); window.Jarvis.renderAll();
  });
  const box = app.page.locator('#hmToday');
  await expect(box).toContainText('$40');
  await expect(box).toContainText('$960 left of $1,000');
  await expect(box).toContainText('4,321');
  await expect(box.locator('.hr-fill')).toHaveCount(2);                     // steps + money rings drawn
  expect(app.errors).toEqual([]);
});

test('tab bar: five tabs, right one lit, mic floats on other screens', async ({ app }) => {
  const tabs = app.page.locator('.nav .tab');
  await expect(tabs).toHaveText(['Home', 'Food', 'Money', 'Health', 'More']);
  await expect(app.page.locator('#orb')).toBeHidden();                      // Home has the big mic
  await app.go('receipts');
  await expect(app.page.locator('.nav .tab.active')).toHaveText('Money');
  await expect(app.page.locator('#orb')).toBeVisible();
  await app.go('habits');
  await expect(app.page.locator('.nav .tab.active')).toHaveText('More');
  await app.go('today');
  await expect(app.page.locator('.nav .tab.active')).toHaveText('Home');
  // the bar sits at the very bottom and never covers the last thing on a page
  const r = await app.page.evaluate(() => {
    const nav = document.getElementById('nav').getBoundingClientRect();
    return { bottom: Math.round(nav.bottom), h: innerHeight, pad: parseFloat(getComputedStyle(document.querySelector('.app')).paddingBottom), navH: nav.height };
  });
  expect(r.bottom).toBe(r.h);
  expect(r.pad).toBeGreaterThan(r.navH);
  expect(app.errors).toEqual([]);
});

test('voice still opens pages through the tab bar screens', async ({ app }) => {
  await app.say('open food');
  expect(await app.page.evaluate(() => window.Jarvis.current)).toBe('food');
  await expect(app.page.locator('.nav .tab.active')).toHaveText('Food');
  expect(app.errors).toEqual([]);
});
