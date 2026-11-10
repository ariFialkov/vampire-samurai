import test from 'node:test';
import assert from 'node:assert/strict';
import { nuggetValue } from '../src/game/gold.js';
import { WAVE_MULTIPLIERS, goldTargetOf, drawOutcome, MAX_WAVE } from '../shared/rtp.js';

/** Play a round's gold: each wave brings `per` nuggets; the player picks up a share of them. */
function simulate(deathWave, share = 1, per = 10) {
  const target = goldTargetOf(WAVE_MULTIPLIERS[deathWave]);
  let tally = 0, carry = 0;
  for (let wave = 1; wave <= 200; wave++) {
    for (let i = 0; i < per; i++) {
      carry += share;
      if (carry < 1) continue;
      carry -= 1;
      const v = nuggetValue({ target, tally, wave, progress: (i + 1) / per, weight: 1, perWave: per });
      assert.ok(v >= 0 && tally + v <= target, 'never past the target');
      tally += v;
      if (tally >= target) return { wave, tally, target };
    }
  }
  return { wave: Infinity, tally, target };
}

test('every outcome pays something, measured in gold (1,000 = the stake)', () => {
  assert.equal(WAVE_MULTIPLIERS[0], 0);
  for (let w = 1; w <= MAX_WAVE; w++) assert.ok(WAVE_MULTIPLIERS[w] > 0 && WAVE_MULTIPLIERS[w] >= WAVE_MULTIPLIERS[w - 1]);
  assert.equal(goldTargetOf(1), 1000);
  const o = drawOutcome({ serverSeed: 's', nonce: 1 });
  assert.equal(o.goldTarget, goldTargetOf(o.multiplier));
});

test('a guardian who gathers the gold as it comes reaches the target on the fated wave', () => {
  for (let w = 1; w <= MAX_WAVE; w++) {
    const r = simulate(w);
    assert.equal(r.tally, r.target, `lands exactly on wave ${w}`);
    assert.ok(Math.abs(r.wave - w) <= 1, `fated ${w}, reached on ${r.wave}`);
  }
});

test('gathering less gold stretches the round, but it still ends; gathering faster ends it a little sooner', () => {
  for (const w of [5, 12, 20, 30, 45]) {
    const lazy = simulate(w, 0.4), keen = simulate(w, 1, 16);
    assert.ok(Number.isFinite(lazy.wave) && lazy.wave >= w - 1, `lazy ${lazy.wave} vs fated ${w}`);
    assert.ok(lazy.wave <= w + 8, `lazy too slow: ${lazy.wave} vs ${w}`);
    assert.ok(keen.wave <= w + 1 && keen.wave >= w - 3, `keen ${keen.wave} vs ${w}`);
    assert.equal(lazy.tally, lazy.target); assert.equal(keen.tally, keen.target);
  }
});
