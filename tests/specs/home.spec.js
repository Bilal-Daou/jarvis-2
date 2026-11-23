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

test('trend charts draw from saved history and switch 7D / 30D', async ({ app }) => {
  await app.say('spent 25 on lunch');
  await app.page.evaluate(() => {
    const H = window.Jarvis.health.store, p = n => String(n).padStart(2, '0');
    for (let i = 0; i < 20; i++) { const d = new Date(); d.setDate(d.getDate() - i); H.history[`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`] = { steps: 5000 + i * 100, sleep: 420, weight: 80 - i * 0.1 }; }
    H.syncedAt = Date.now();
  });
  const before = await app.page.evaluate(() => JSON.stringify(window.Jarvis.health.store.history));
  await app.go('health');
  const steps = app.page.locator('[data-trend-id="steps"]');
  await expect(steps.locator('.tr-bar:not(.none)')).toHaveCount(7);
  await steps.locator('[data-trend="steps:30"]').click();
  await expect(app.page.locator('[data-trend-id="steps"] .tr-bar:not(.none)')).toHaveCount(20);
  await expect(app.page.locator('[data-trend-id="weight"] .tr-line')).toBeVisible();
  expect(await app.page.evaluate(() => JSON.stringify(window.Jarvis.health.store.history))).toBe(before);   // read only
  await app.go('budget');
  await expect(app.page.locator('[data-trend-id="spend"]')).toContainText('$25');
  await app.go('food');
  await expect(app.page.locator('[data-trend-id="kcal"]')).toBeVisible();
  expect(app.errors).toEqual([]);
});

// a real finger swipe through Chrome's touch input
async function swipe(page, x0, y0, x1, y1, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  const pt = (x, y) => [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x0, y0) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps) });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(450);
}

test('swipe left deletes a payment with Undo; swipe right goes back', async ({ app }) => {
  await app.say('spent 12 on coffee');
  await app.go('apps'); await app.go('budget');
  const row = app.page.locator('#txList [data-edit-exp]').first();
  await app.page.waitForTimeout(500); await row.scrollIntoViewIfNeeded(); await app.page.waitForTimeout(200);
  const b = await row.boundingBox();
  await swipe(app.page, b.x + b.width - 20, b.y + b.height / 2, b.x + 20, b.y + b.height / 2);
  expect((await app.db()).expenses.length).toBe(0);
  await expect(app.page.locator('#toast')).toContainText('Deleted');
  await app.page.locator('#toastUndo').click();
  expect((await app.db()).expenses.length).toBe(1);
  // a short swipe only shows the Delete button; nothing is deleted until it is tapped
  await app.page.waitForTimeout(300); await app.page.locator('#txList [data-edit-exp]').first().scrollIntoViewIfNeeded();
  const b2 = await app.page.locator('#txList [data-edit-exp]').first().boundingBox();
  await swipe(app.page, b2.x + b2.width - 20, b2.y + b2.height / 2, b2.x + b2.width - 100, b2.y + b2.height / 2, 4);
  await expect(app.page.locator('.sw-del')).toBeVisible();
  expect((await app.db()).expenses.length).toBe(1);
  // the next touch elsewhere only closes the open row
  await swipe(app.page, 60, 300, 330, 305);
  await expect(app.page.locator('.sw-del')).toHaveCount(0);
  expect(await app.page.evaluate(() => window.Jarvis.current)).toBe('budget');
  // swipe right goes back to where the page was opened from: More -> Notes, then back to More
  await app.page.locator('.nav [data-go="apps"]').click();
  await app.go('notes'); await app.page.waitForTimeout(500);
  await swipe(app.page, 60, 300, 330, 305);
  expect(await app.page.evaluate(() => window.Jarvis.current)).toBe('apps');
  // More is a main tab: swiping right there does nothing (like iPhone apps)
  await swipe(app.page, 60, 300, 330, 305);
  expect(await app.page.evaluate(() => window.Jarvis.current)).toBe('apps');
  expect(app.errors).toEqual([]);
});

test('swipe left also deletes food entries and reminders, each with Undo', async ({ app }) => {
  await app.say('I ate a banana');
  await app.say('remind me to call the bank in 20 minutes');
  const kcal = () => app.page.evaluate(() => window.Jarvis.food.today().kcal);
  expect(await kcal()).toBeGreaterThan(0);
  for (let i = 0; i < 3 && await app.page.locator('.cal-sheet-wrap.open,#modal.open').count(); i++) { await app.page.keyboard.press('Escape'); await app.page.waitForTimeout(400); }
  await app.page.locator('.nav [data-go="food"]').click(); await app.page.waitForTimeout(500);
  const it = app.page.locator('#fdMeals [data-entry]').first(); await it.scrollIntoViewIfNeeded(); await app.page.waitForTimeout(200);
  let b = await it.boundingBox();
  await swipe(app.page, b.x + b.width - 10, b.y + b.height / 2, b.x + 10, b.y + b.height / 2);
  expect(await kcal()).toBe(0);
  await app.page.locator('#toastUndo').click();
  expect(await kcal()).toBeGreaterThan(0);
  await app.go('reminders'); await app.page.waitForTimeout(500);
  const rw = app.page.locator('#remList .jv-rowwrap').first(); b = await rw.boundingBox();
  await swipe(app.page, b.x + b.width - 10, b.y + b.height / 2, b.x + 10, b.y + b.height / 2);
  expect((await app.db()).reminders.length).toBe(0);
  await app.page.locator('#toastUndo').click();
  expect((await app.db()).reminders.length).toBe(1);
  expect(app.errors).toEqual([]);
});
