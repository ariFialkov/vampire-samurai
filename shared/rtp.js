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

/** Payout multiplier for a round that ended while the player was on wave `n`. */
export const WAVE_MULTIPLIERS = [
  0, 0, 0, 0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1, 1.3, 1.7, 2.2, 2.8, 3.6, 4.6, 6, 8, 11, 15, 22, 35, 60, 120, 300,
];
export const MAX_WAVE = WAVE_MULTIPLIERS.length - 1;

/**
 * Hazard shape: relative chance of falling on wave w, given the guardian reached it.
 * Low early and rising with the square of the wave, so most rounds last several waves
 * (median around wave 8 at 96% RTP) and long runs grow steadily rarer.
 */
const hazardShape = (w) => 0.45 + 0.016 * w * w;

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
    demonWave: deathWave >= 10 && rng.chance(0.35) ? rng.int(9, deathWave) : -1,
  };
  for (let w = 3; w < deathWave; w++) if (rng.chance(0.18)) profile.restWaves.push(w);
  return {
    seed: `round:${seed}`,
    deathWave,
    deathProgress,
    multiplier: WAVE_MULTIPLIERS[deathWave],
    profile,
  };
}
