import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPaytable, expectedRtp, drawOutcome, medianWave, WAVE_MULTIPLIERS } from '../shared/rtp.js';
import { Rng } from '../shared/rng.js';

test('paytable expected value equals the configured RTP', () => {
  for (const rtp of [0.9, 0.94, 0.96, 0.98]) {
    const probs = buildPaytable(rtp);
    const sum = probs.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, 'probabilities sum to 1');
    assert.ok(Math.abs(expectedRtp(probs) - rtp) < 1e-9, `EV matches ${rtp}`);
  }
});

test('the median round runs about twenty waves at 96% RTP, and most rounds pay something', () => {
  const m = medianWave(0.96);
  assert.ok(m >= 18 && m <= 22, `median wave ${m}`);
  const p = buildPaytable(0.96);
  const pays = p.reduce((t, x, w) => t + (WAVE_MULTIPLIERS[w] > 0 ? x : 0), 0);
  assert.ok(pays > 0.85, `rounds paying something: ${pays}`);
  const probs = buildPaytable(0.96);
  assert.ok(probs[1] < 0.06, 'few rounds end on the first wave');
});

test('outcomes are deterministic for the same seeds', () => {
  const a = drawOutcome({ serverSeed: 'abc', clientSeed: 'x', nonce: 3, rtp: 0.96 });
  const b = drawOutcome({ serverSeed: 'abc', clientSeed: 'x', nonce: 3, rtp: 0.96 });
  assert.deepEqual(a, b);
  const c = drawOutcome({ serverSeed: 'abc', clientSeed: 'x', nonce: 4, rtp: 0.96 });
  assert.notEqual(a.seed, c.seed);
});

test('simulated RTP converges to the configuration', () => {
  const rtp = 0.96, n = 200000;
  let paid = 0;
  for (let i = 0; i < n; i++) paid += drawOutcome({ serverSeed: 'sim', clientSeed: 'c', nonce: i, rtp }).multiplier;
  const observed = paid / n;
  assert.ok(Math.abs(observed - rtp) < 0.03, `observed ${observed}`);
});

test('rng is stable', () => {
  const r1 = new Rng('seed'), r2 = new Rng('seed');
  for (let i = 0; i < 100; i++) assert.equal(r1.next(), r2.next());
  assert.ok(WAVE_MULTIPLIERS.length > 10);
});
