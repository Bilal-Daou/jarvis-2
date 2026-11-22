// Backup save -> erase -> restore gives the same data back.
const { test, expect } = require('./helpers');
const fs = require('fs');

test('backup save and restore round trip', async ({ app }) => {
  const { page } = app;
  await app.say('note pick up the dry cleaning');
  await app.say('I spent 20 dollars on lunch');
  await app.say('remind me to pay rent tomorrow at 9 am');
  const before = await app.db();
  expect(before.notes.length + before.expenses.length + before.reminders.length).toBe(3);

  await app.go('settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('exportBtn').click())]);
  expect(dl.suggestedFilename()).toMatch(/^jarvis-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await dl.path();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(saved.notes).toHaveLength(1);

  // wipe the phone's data, then restore from the file
  await page.evaluate(() => localStorage.setItem('jarvis2', JSON.stringify({ notes: [], reminders: [], expenses: [], settings: window.Jarvis.settings })));
  await page.reload();
  await page.waitForFunction(() => window.Jarvis && window.Jarvis.db);
  expect((await app.db()).notes).toHaveLength(0);

  await app.go('settings');
  await page.locator('#importFile').setInputFiles({ name: 'jarvis-backup.json', mimeType: 'application/json', buffer: fs.readFileSync(file) });
  await page.locator('#mSave').click();
  await page.waitForFunction(() => window.Jarvis && window.Jarvis.db && window.Jarvis.db.notes.length === 1);
  const after = await app.db();
  expect(after.notes).toEqual(before.notes);
  expect(after.expenses).toEqual(before.expenses);
  expect(after.reminders.map(r => r.text)).toEqual(before.reminders.map(r => r.text));
  expect(app.errors).toEqual([]);
});

test('restore rejects a file that is not a backup', async ({ app }) => {
  await app.go('settings');
  await app.page.locator('#importFile').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(app.page.getByText('That file is not a Jarvis backup')).toBeVisible();
});
