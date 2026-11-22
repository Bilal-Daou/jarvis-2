// Typed commands go through the same brain as voice.
const { test, expect } = require('./helpers');

test('small talk is NOT saved as a note', async ({ app }) => {
  await app.say('I went to the gym today');
  await app.say('how are you');
  await app.say('the weather is nice');
  expect((await app.db()).notes).toHaveLength(0);
});

test('a note is saved when explicitly asked', async ({ app }) => {
  await app.say('note buy milk tomorrow');
  await app.say('remember that the wifi password is on the fridge');
  const notes = (await app.db()).notes.map(n => n.text.toLowerCase());
  expect(notes).toHaveLength(2);
  expect(notes.join('|')).toContain('buy milk');
  expect(notes.join('|')).toContain('wifi password');
});

test('adds an expense', async ({ app }) => {
  await app.say('I spent 12 dollars on coffee');
  const ex = (await app.db()).expenses;
  expect(ex).toHaveLength(1);
  expect(ex[0].amount).toBe(12);
  expect(ex[0].type).toBe('expense');
});

test('adds income', async ({ app }) => {
  await app.say('I got paid 2000 dollars salary');
  const ex = (await app.db()).expenses;
  expect(ex).toHaveLength(1);
  expect(ex[0].type).toBe('income');
  expect(ex[0].amount).toBe(2000);
});

test('sets a reminder', async ({ app }) => {
  await app.say('remind me to call mom in 20 minutes');
  const r = (await app.db()).reminders;
  expect(r).toHaveLength(1);
  expect(r[0].text.toLowerCase()).toContain('call mom');
  const mins = (r[0].at - Date.now()) / 60000;
  expect(mins).toBeGreaterThan(18);
  expect(mins).toBeLessThan(21);
});

test('logs food: "I ate 2 eggs and a banana"', async ({ app }) => {
  await app.say('I ate 2 eggs and a banana');
  const all = JSON.stringify((await app.db()).food || {}).toLowerCase();
  expect(all).toContain('egg');
  expect(all).toContain('banana');
  expect((await app.db()).notes).toHaveLength(0);
});

test('changes currency, name and theme', async ({ app }) => {
  await app.say('set my currency to euros');
  expect((await app.db()).settings.currency).toBe('€');
  await app.say('call me Alex');
  expect((await app.db()).settings.name).toBe('Alex');
  await app.say('switch to light mode');
  expect(await app.page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  await app.say('dark mode');
  expect(await app.page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  expect((await app.db()).notes).toHaveLength(0);
  expect(app.errors).toEqual([]);
});

test('data survives a reload', async ({ app }) => {
  await app.say('I spent 5 dollars on a sandwich');
  await app.page.reload();
  await app.page.waitForFunction(() => window.Jarvis && window.Jarvis.db);
  expect((await app.db()).expenses).toHaveLength(1);
});
