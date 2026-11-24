// Conversation mode (v43): after Jarvis SPEAKS an answer, the mic opens again by itself.
// A real mic and voice can't run in tests, so both are faked before the app loads:
//  - window.__fake.recs: every recognizer the app created; rec.hear('words', confidence) = the user says something
//  - the fake voice "speaks" for __fake.speakMs, then fires onend like a real one; cancel() interrupts it
const { test, expect } = require('./helpers');

function fakes() {
  const F = window.__fake = { recs: [], speakMs: 250, spoken: [], speaking: false, cur: null, timer: null };
  class FakeSR {
    constructor() { this.aborted = false; this.started = false; F.recs.push(this); }
    start() { this.started = true; setTimeout(() => { if (!this.aborted && this.onstart) this.onstart(); if (!this.aborted && this.onaudiostart) this.onaudiostart(); }, 30); }
    stop() { setTimeout(() => { if (!this.aborted && this.onend) this.onend(); }, 20); }
    abort() { this.aborted = true; }
    hear(text, conf) {
      if (this.aborted) return false;
      const res = [{ transcript: text, confidence: conf == null ? 0.92 : conf }]; res.isFinal = true;
      if (this.onresult) this.onresult({ results: [res] });
      setTimeout(() => { if (!this.aborted && this.onend) this.onend(); }, 20);
      return true;
    }
  }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  const ss = window.speechSynthesis;
  Object.defineProperty(ss, 'speaking', { configurable: true, get: () => F.speaking });
  Object.defineProperty(ss, 'pending', { configurable: true, get: () => false });
  ss.speak = u => {
    if (u.volume === 0) return;                       // the silent iPhone "unlock" word: ignore
    F.spoken.push(u.text); F.cur = u; F.speaking = true;
    setTimeout(() => {
      if (F.cur !== u) return; if (u.onstart) u.onstart({});
      F.timer = setTimeout(() => { if (F.cur !== u) return; F.cur = null; F.speaking = false; if (u.onend) u.onend({}); }, F.speakMs);
    }, 10);
  };
  ss.cancel = () => { const u = F.cur; if (!u) return; F.cur = null; F.speaking = false; clearTimeout(F.timer); if (u.onerror) u.onerror({ error: 'interrupted' }); if (u.onend) u.onend({}); };
}

async function setup(app, opts) {
  const { page } = app;
  await page.addInitScript(fakes);
  await page.reload();
  await page.waitForFunction(() => window.Jarvis && window.Jarvis._convo && window.__fake && document.getElementById('v-health'));
  await page.evaluate(o => { Jarvis.settings.speak = true; Object.assign(Jarvis._convo.cfg, { gap: 80, quiet: 1500 }, o || {}); }, opts || {});
}
const st = page => page.evaluate(() => Jarvis._convo.state);
const recCount = page => page.evaluate(() => __fake.recs.length);
const lastRec = (page, text, conf) => page.evaluate(([t, c]) => __fake.recs[__fake.recs.length - 1].hear(t, c), [text, conf]);
const msgs = page => page.evaluate(() => [...document.querySelectorAll('#chat .msg')].map(m => (m.classList.contains('me') ? 'me: ' : 'ai: ') + m.textContent.replace('🔈', '').trim()));
const live = page => page.locator('#live').textContent();

/** tap the Home mic, ask one question, and wait until the follow-up mic is listening */
async function firstTurn(app, question) {
  const { page } = app;
  const base = await recCount(page), said = await page.evaluate(() => __fake.spoken.length);
  await page.locator('#heroMic').click();
  await expect.poll(() => recCount(page)).toBe(base + 1);
  await expect.poll(() => st(page)).toMatchObject({ on: true, followUp: false });
  await page.waitForTimeout(60);
  await lastRec(page, question || "what's my name");
  await expect.poll(() => page.evaluate(() => __fake.spoken.length)).toBeGreaterThan(said);
  await expect.poll(() => recCount(page), { timeout: 8000 }).toBe(base + 2);
  await expect.poll(() => st(page)).toMatchObject({ on: true, followUp: true });
  await page.waitForTimeout(60);   // the fake mic "starts" 30 ms later
}

test('conversation mode: setting is on by default and can be turned off', async ({ app }) => {
  const { page } = app;
  await setup(app);
  await app.go('settings');
  await expect(page.locator('#sConvo')).toBeChecked();
  await page.locator('label.switch:has(#sConvo)').click();
  await expect(page.locator('#sConvo')).not.toBeChecked();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('jarvis2')).settings.convo);
  expect(saved).toBe(false);
  // with the setting off, a spoken question is answered and the mic does NOT open again
  await app.go('home');
  await page.locator('#heroMic').click();
  await expect.poll(() => recCount(page)).toBe(1);
  await page.waitForTimeout(60);
  await lastRec(page, "what's my name");
  await expect.poll(() => page.evaluate(() => __fake.spoken.length)).toBeGreaterThan(0);
  await page.waitForTimeout(800);   // voice 250 ms + gap 80 ms, with room to spare
  expect(await recCount(page)).toBe(1);
  expect((await st(page)).on).toBe(false);
  expect(app.errors).toEqual([]);
});

test('conversation mode: listens again after the answer, then stops quietly after silence', async ({ app }) => {
  const { page } = app;
  await setup(app, { quiet: 3000 });
  await firstTurn(app);
  await expect(page.locator('body')).toHaveClass(/is-listening/);
  expect(await live(page)).toMatch(/follow-up/i);
  const before = await msgs(page);
  expect(before.some(m => /^me: what's my name/i.test(m))).toBe(true);
  // nobody talks: after the quiet window (3 s in this test, 8 s on the phone) it stops by itself
  await expect.poll(() => st(page), { timeout: 10000 }).toMatchObject({ on: false, followUp: false });
  await expect(page.locator('body')).not.toHaveClass(/is-listening/);
  expect(await msgs(page)).toEqual(before);                  // no reply, nothing added
  expect(await live(page)).not.toMatch(/didn.t catch/i);     // no error message
  const n = await recCount(page);
  await page.waitForTimeout(800);
  expect(await recCount(page)).toBe(n);                      // and it doesn't start again (no loop)
  const log = await page.evaluate(() => localStorage.getItem('jarvis2-debuglog') || '');
  expect(log).toMatch(/convo: listening again/);
  expect(log).toMatch(/convo: off \(silence\)/);
  expect(app.errors).toEqual([]);
});

test('conversation mode: noise, fillers and empty results are ignored, real words still work', async ({ app }) => {
  const { page } = app;
  await setup(app, { quiet: 15000 });
  await firstTurn(app);
  const before = await msgs(page);
  // "uh" → ignored, the mic listens again inside the same window
  await lastRec(page, 'uh');
  await expect.poll(() => recCount(page), { timeout: 6000 }).toBe(3);
  await page.waitForTimeout(60);
  // empty result → ignored too
  await lastRec(page, '');
  await expect.poll(() => recCount(page), { timeout: 6000 }).toBe(4);
  await page.waitForTimeout(60);
  expect(await msgs(page)).toEqual(before);                  // nothing answered
  expect(await live(page)).not.toMatch(/didn.t catch/i);
  expect((await st(page)).on).toBe(true);
  // after two noise restarts the window ends quietly on the next scrap
  await lastRec(page, 'hmm');
  await expect.poll(() => st(page), { timeout: 6000 }).toMatchObject({ on: false });
  expect(await msgs(page)).toEqual(before);
  // the filters themselves
  const r = await page.evaluate(() => {
    const W = Jarvis._convo.realWords;
    return { um: W('um', 0.9), a: W('a', 0.9), low: W('the cat', 0.2), unknownConf: W('what time is it', 0), real: W("what's the weather", 0.9), yes: W('yes', 0.9) };
  });
  expect(r).toEqual({ um: false, a: false, low: false, unknownConf: true, real: true, yes: true });
  expect(app.errors).toEqual([]);
});

test('conversation mode: real follow-up question gets answered and the mic opens again', async ({ app }) => {
  const { page } = app;
  await setup(app, { quiet: 8000 });
  await firstTurn(app);
  await lastRec(page, 'what is 2 plus 2');
  await expect.poll(() => msgs(page)).toEqual(expect.arrayContaining([expect.stringMatching(/^me: what is 2 plus 2/i)]));
  await expect.poll(() => recCount(page), { timeout: 8000 }).toBe(3);
  await expect.poll(() => st(page)).toMatchObject({ on: true, followUp: true, autos: 2 });
  expect(app.errors).toEqual([]);
});

test('conversation mode: saying "stop" ends it with no answer', async ({ app }) => {
  const { page } = app;
  await setup(app, { quiet: 8000 });
  await firstTurn(app);
  const before = await msgs(page);
  await lastRec(page, 'Stop.');
  await expect.poll(() => st(page)).toMatchObject({ on: false, followUp: false });
  await page.waitForTimeout(700);
  expect(await msgs(page)).toEqual(before);
  expect(await recCount(page)).toBe(2);
  expect(await live(page)).toMatch(/okay/i);
  await expect(page.locator('body')).not.toHaveClass(/is-listening/);
  const w = await page.evaluate(() => ['stop', "That's all.", 'okay Jarvis that’s all', 'thanks Jarvis', 'no thank you', 'stop the timer', "what's next"].map(Jarvis._convo.endWord));
  expect(w).toEqual(['quiet', 'quiet', 'quiet', 'reply', 'reply', '', '']);
  expect(app.errors).toEqual([]);
});

test('conversation mode: "thanks Jarvis" gets a short answer, then the mic stays off', async ({ app }) => {
  const { page } = app;
  await setup(app, { quiet: 8000 });
  await firstTurn(app);
  const n = (await msgs(page)).length;
  await lastRec(page, 'Thanks Jarvis.');
  await expect.poll(async () => (await msgs(page)).length).toBe(n + 2);   // their words + Jarvis's short reply
  expect((await st(page)).on).toBe(false);
  await page.waitForTimeout(800);   // the reply is spoken (250 ms) and the gap passes: no new mic
  expect(await recCount(page)).toBe(2);
  expect(app.errors).toEqual([]);
});

test('conversation mode: tapping the mic while Jarvis talks interrupts and listens; tapping while listening ends it', async ({ app }) => {
  const { page } = app;
  await setup(app, { quiet: 8000 });
  await page.evaluate(() => { __fake.speakMs = 5000; });   // a long answer
  await page.locator('#heroMic').click();
  await expect.poll(() => recCount(page)).toBe(1);
  await page.waitForTimeout(60);
  await lastRec(page, "what's my name");
  await expect.poll(() => page.evaluate(() => __fake.speaking)).toBe(true);
  await page.locator('#micBtn').click();                        // tap to interrupt
  await expect.poll(() => page.evaluate(() => __fake.speaking)).toBe(false);
  await expect.poll(() => recCount(page)).toBe(2);
  await expect.poll(() => st(page)).toMatchObject({ on: true });
  await expect(page.locator('body')).toHaveClass(/is-listening/);
  await page.waitForTimeout(60);
  await page.locator('#micBtn').click();                        // tap while listening = stop
  await expect.poll(() => st(page)).toMatchObject({ on: false });
  await expect(page.locator('body')).not.toHaveClass(/is-listening/);
  expect(app.errors).toEqual([]);
});

test('conversation mode: closing the chat or leaving the app ends it', async ({ app }) => {
  const { page } = app;
  await setup(app, { quiet: 8000 });
  await firstTurn(app);
  await page.locator('#closeSheet').click();
  await expect.poll(() => st(page)).toMatchObject({ on: false, followUp: false });
  // leaving the app while a follow-up listens
  await firstTurn(app, 'what is 3 plus 3');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect.poll(() => st(page)).toMatchObject({ on: false, followUp: false });
  expect(app.errors).toEqual([]);
});

test('conversation mode: a "One moment…" answer waits for the real answer before listening again', async ({ app }) => {
  const { page } = app;
  await setup(app, { quiet: 8000 });
  await page.locator('#heroMic').click();
  await expect.poll(() => recCount(page)).toBe(1);
  await page.waitForTimeout(60);
  await lastRec(page, 'who is Albert Einstein');
  // the first spoken line is a placeholder; the mic must not open until the late answer has been spoken too
  await expect.poll(() => page.evaluate(() => __fake.spoken.length), { timeout: 8000 }).toBeGreaterThan(1);
  const spoken = await page.evaluate(() => __fake.spoken.slice());
  expect(spoken[0]).toMatch(/^(One moment|Checking|Looking|Let me)/);
  await expect.poll(() => recCount(page), { timeout: 8000 }).toBe(2);
  await expect.poll(() => st(page)).toMatchObject({ on: true, followUp: true });
  const log = await page.evaluate(() => localStorage.getItem('jarvis2-debuglog') || '');
  expect(log).toMatch(/convo: waiting for the full answer/);
  expect(app.errors).toEqual([]);
});
