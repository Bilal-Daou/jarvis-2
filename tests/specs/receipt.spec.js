// Receipt parsing with sample OCR text (no camera, no OCR library needed).
// lebaneseDual() is internal, so it is tested through the parser that calls it.
const { test, expect } = require('./helpers');

const parse = (app, text, opts) => app.page.evaluate(([t, o]) => {
  const r = window.Jarvis._receipt.parse(t, Object.assign({ now: new Date(2026, 10, 20) }, o || {}));
  return JSON.parse(JSON.stringify(r));
}, [text, opts || {}]);

test('lebaneseDual: Total line with USD and LBP plus printed rate', async ({ app }) => {
  const r = await parse(app, ['VCOOP SUPERMARKET', 'BEIRUT', '02/11/2026', 'RICE 2KG   4.50', 'MILK   2.20',
    'RATE 89,500', 'TOTAL FUSD 122.70  LBP 10,981,650', 'CASH USD 130.00'].join('\n'));
  expect(r.total).toBe(122.7);
  expect(r.currency).toBe('USD');
  expect(r.dual).toBe(true);
  expect(r.rate).toBe(89500);
  expect(r.alt).toEqual({ total: 10981650, currency: 'LBP' });
  expect(r.conf).toBe('high');
});

test('lebaneseDual: fixes OCR look-alike letters in the USD amount', async ({ app }) => {
  const r = await parse(app, ['VCOOP', 'RATE 89500', 'TOTAL USD I2.5O  LBP 1,118,750'].join('\n'));
  expect(r.total).toBe(12.5);
  expect(r.currency).toBe('USD');
});

test('lebaneseDual: Total word and USD amount on neighbouring lines', async ({ app }) => {
  const r = await parse(app, ['SPINNEYS', 'TOTAL', 'USD 45.00 LBP 4,027,500', 'RATE 89500'].join('\n'));
  expect(r.total).toBe(45);
  expect(r.dual).toBe(true);
});

test('plain USD receipt: merchant, date, total, items', async ({ app }) => {
  const r = await parse(app, ['STARBUCKS', 'Hamra Street', 'Date: 15/11/2026', 'Latte  4.50', 'Croissant  3.00',
    'Subtotal  7.50', 'TOTAL  $7.50', 'Cash  10.00', 'Change  2.50'].join('\n'));
  expect(r.total).toBe(7.5);
  expect(r.currency).toBe('USD');
  expect(r.merchant.toLowerCase()).toContain('starbucks');
  expect(new Date(r.date).getDate()).toBe(15);
  expect(new Date(r.date).getMonth()).toBe(10);
  expect(r.items.length).toBeGreaterThanOrEqual(2);
  expect(r.conf).toBe('high');
});

test('LBP-only receipt', async ({ app }) => {
  const r = await parse(app, ['ABC BAKERY', '20/11/2026', 'MANOUSHE  150,000 LL', 'COFFEE  200,000 LL', 'TOTAL  350,000 LL'].join('\n'));
  expect(r.total).toBe(350000);
  expect(r.currency).toBe('LBP');
});

test('parseAmount handles commas and dots', async ({ app }) => {
  const v = await app.page.evaluate(() => ['12.50', '1,234.56', '10,981,650'].map(s => window.Jarvis._receipt.parseAmount(s)));
  expect(v).toEqual([12.5, 1234.56, 10981650]);
});
