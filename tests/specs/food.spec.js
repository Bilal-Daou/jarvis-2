// Food search and the v37 "no barcode" photo sheet.
const { test, expect } = require('./helpers');

test('food search shows common foods offline', async ({ app }) => {
  await app.go('food');
  const inp = app.page.locator('#fdSIn');
  await inp.fill('banana');
  await inp.press('Enter');
  await expect(app.page.locator('#fdSRes')).toContainText(/banana/i, { timeout: 8000 });
});

test('parseFoods reads several foods', async ({ app }) => {
  const r = await app.page.evaluate(() => JSON.stringify(window.__food.parseFoods('2 eggs and a banana')));
  expect(r.toLowerCase()).toContain('egg');
  expect(r.toLowerCase()).toContain('banana');
});

test('photo with no barcode and no AI key shows the search/type/voice sheet', async ({ app }) => {
  expect(await app.page.evaluate(() => window.Jarvis.ai.hasKey())).toBe(false);
  await app.page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240;
    const x = c.getContext('2d'); x.fillStyle = '#c84'; x.fillRect(0, 0, 320, 240); x.fillStyle = '#fff'; x.fillRect(60, 60, 120, 80);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    window.__food.onPhotoFile(new File([blob], 'plate.jpg', { type: 'image/jpeg' }));
  });
  await expect(app.page.locator('#fdnbQ')).toBeVisible({ timeout: 15000 });
  await expect(app.page.locator('#fdnbType')).toBeVisible();
  // no key screen is ever shown to a customer
  await expect(app.page.getByText(/paste key/i)).toHaveCount(0);
  expect(app.errors).toEqual([]);
});
