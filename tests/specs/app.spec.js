// The app loads cleanly and every screen opens.
const { test, expect } = require('./helpers');

const VIEWS = { home: 'Home', today: 'Today (morning brief)', budget: 'Money', apps: 'More', notes: 'Notes',
  reminders: 'Reminders', settings: 'Settings', food: 'Food', habits: 'Habits', health: 'Health',
  finance: 'Markets / finance brief', calendar: 'Calendar' };

test('app loads with no console errors and uses the right theme', async ({ app }) => {
  await expect(app.page.locator('#v-home')).toBeVisible();
  await app.page.waitForTimeout(800);
  expect(await app.page.evaluate(() => document.documentElement.dataset.theme)).toBe(app.theme);
  expect(app.errors).toEqual([]);
});

for (const [id, label] of Object.entries(VIEWS)) {
  test(`opens ${label}`, async ({ app }) => {
    await app.go(id);
    const view = app.page.locator('#v-' + id);
    await expect(view).toHaveClass(/active/);
    await expect(view).toBeVisible();
    expect(await app.page.evaluate(() => window.Jarvis.current)).toBe(id);
    expect((await view.innerText()).trim().length).toBeGreaterThan(0);
    await app.page.waitForTimeout(300);
    expect(app.errors).toEqual([]);
  });
}

test('bottom menu tabs work', async ({ app }) => {
  for (const id of ['food', 'budget', 'health', 'apps', 'home']) {
    await app.page.locator(`.nav [data-go="${id}"]`).first().click();
    await expect(app.page.locator('#v-' + id)).toHaveClass(/active/);
  }
  expect(app.errors).toEqual([]);
});
