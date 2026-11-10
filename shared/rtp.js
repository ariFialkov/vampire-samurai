// ---------------------------------------------------------------------------
// Outcome engine.
//
// Vampire Samurai looks like a skill game, but every round is settled like a
// classic deterministic betting game: before the round starts, the server draws the
// round's outcome from a paytable whose expected value equals the configured RTP.
// The client receives the outcome as a "script" (the wave the player is fated to
// fall on) and a seed; the wave director then steers the difficulty smoothly so the
// round lands on that result no matter how the player plays.
// ---------------------------------------------------------------------------
import { Rng } from './rng.js';

/**
 * Payout multiplier for a round whose fated wave is `n`. Waves are short and come quickly, so
 * the curve is spread over 60 of them: every round pays something (gold from the first wave
 * on), break-even comes around wave 23 and the top prize at wave 60.
 */
export const WAVE_MULTIPLIERS = [
  0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.11, 0.15, 0.2, 0.24, 0.28, 0.33, 0.38, 0.45, 0.5, 0.57, 0.64, 0.71,
  0.8, 0.87, 0.96, 1.1, 1.2, 1.3, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.7, 2.9, 3.3, 3.6, 4, 4.4, 4.9, 5.4,
  6, 6.7, 7.6, 8.5, 9.7, 11, 12, 14, 16, 19, 22, 26, 32, 39, 48, 60, 79, 104, 144, 208, 300,
];
export const MAX_WAVE = WAVE_MULTIPLIERS.length - 1;

/**
 * Gold: the round's prize is collected as gold nuggets. 1,000 gold is the stake, so a round
 * fated to pay 1.6x ends once the guardian holds 1,600 gold.
 */
export const GOLD_PER_STAKE = 1000;
export const goldTargetOf = (multiplier) => Math.round(multiplier * GOLD_PER_STAKE);
/**
 * The gold the round's pacing expects by now: wave `w` in progress, `p` (0..1) of it cleared.
 * Following this curve the target is reached on the fated wave, about twenty on average.
 */
export function goldPace(w, p) {
  const a = WAVE_MULTIPLIERS[Math.max(0, Math.min(MAX_WAVE, w - 1))], b = WAVE_MULTIPLIERS[Math.max(0, Math.min(MAX_WAVE, w))];
  return GOLD_PER_STAKE * (a + (b - a) * Math.max(0, Math.min(1, p)));
}

/** How hard wave n is, on the scale the monster roster and budgets are written for (1..25). */
export const difficultyOf = (n) => 0.4 * n + 1;

/**
 * Hazard shape: relative chance of falling on wave w, given the guardian reached it.
 * Very low early and rising steeply with difficulty, so most rounds run around twenty
 * quick waves (median wave 20 at 96% RTP) and long runs grow steadily rarer.
 */
const hazardShape = (w) => 0.3 + 0.016 * Math.pow(difficultyOf(w), 2.5);

function distribution(level) {
  const probs = [0];
  let survive = 1;
  for (let w = 1; w <= MAX_WAVE; w++) {
    const h = w === MAX_WAVE ? 1 : Math.min(0.95, level * hazardShape(w));
    probs[w] = survive * h;
    survive *= 1 - h;
  }
  return probs;
}

export function expectedRtp(probs) {
  let ev = 0;
  for (let w = 0; w < probs.length; w++) ev += probs[w] * WAVE_MULTIPLIERS[w];
  return ev;
}

const tableCache = new Map();
/**
 * Probability distribution over the wave the guardian falls on, with an expected payout
 * equal to `rtp`. The hazard level is solved by bisection (EV falls as hazard rises).
 */
export function buildPaytable(rtp) {
  if (tableCache.has(rtp)) return tableCache.get(rtp);
  let lo = 1e-6, hi = 20;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (expectedRtp(distribution(mid)) > rtp) lo = mid; else hi = mid;
  }
  const probs = distribution((lo + hi) / 2);
  tableCache.set(rtp, probs);
  return probs;
}

/** Median wave the guardian falls on for a given RTP. */
export function medianWave(rtp) {
  const probs = buildPaytable(rtp);
  let c = 0;
  for (let w = 0; w < probs.length; w++) { c += probs[w]; if (c >= 0.5) return w; }
  return MAX_WAVE;
}

/**
 * Draw a round outcome. Fully determined by (serverSeed, clientSeed, nonce, rtp).
 * Returns the fated death wave and the round seed the client simulation uses.
 */
export function drawOutcome({ serverSeed, clientSeed = 'c', nonce = 0, rtp = 0.96 }) {
  const seed = `${serverSeed}|${clientSeed}|${nonce}`;
  const rng = new Rng(`outcome:${seed}`);
  const probs = buildPaytable(rtp);
  let r = rng.next(), deathWave = 1;
  for (let w = 0; w <= MAX_WAVE; w++) { r -= probs[w]; if (r <= 0) { deathWave = w; break; } }
  if (deathWave < 1) deathWave = 1;
  // Where within the fated wave the player falls (0 = at start, 1 = right before clearing it)
  const deathProgress = 0.15 + 0.8 * rng.next();
  // Per-round variation of the difficulty profile (so no two rounds feel identical)
  const profile = {
    restWaves: [],             // waves that are deliberately easier
    hordeBias: rng.float(0.8, 1.25),
    rangedBias: rng.float(0.8, 1.25),
    packBias: rng.float(0.7, 1.4),
    demonWave: deathWave >= 23 && rng.chance(0.35) ? rng.int(20, deathWave) : -1,
  };
  for (let w = 4; w < deathWave; w++) if (rng.chance(0.14)) profile.restWaves.push(w);
  return {
    seed: `round:${seed}`,
    deathWave,
    deathProgress,
    multiplier: WAVE_MULTIPLIERS[deathWave],
    goldTarget: goldTargetOf(WAVE_MULTIPLIERS[deathWave]),
    profile,
  };
}
