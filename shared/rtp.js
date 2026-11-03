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
  0, 0, 0.25, 0.5, 0.8, 1.2, 1.6, 2.2, 3, 4, 5.5, 7.5, 10, 14, 20, 28, 40, 60, 90, 140, 250, 500,
];
export const MAX_WAVE = WAVE_MULTIPLIERS.length - 1;

/** Base (un-normalised) probability shape: geometric-ish decay with a long tail. */
function baseShape(w) {
  if (w <= 0) return 0;
  return Math.pow(0.78, w) * (1 + 0.25 * Math.sin(w * 1.7));
}

/**
 * Build a probability distribution over "death wave" whose expected payout equals rtp.
 * We scale the probability mass of the losing waves (multiplier 0) so that the
 * expected value lands exactly on the requested RTP. Any RTP in (0, maxMult) is valid.
 */
export function buildPaytable(rtp) {
  const shape = [];
  for (let w = 0; w <= MAX_WAVE; w++) shape[w] = baseShape(w);
  let winMass = 0, winEv = 0, loseMass = 0;
  for (let w = 0; w <= MAX_WAVE; w++) {
    if (WAVE_MULTIPLIERS[w] > 0) { winMass += shape[w]; winEv += shape[w] * WAVE_MULTIPLIERS[w]; }
    else loseMass += shape[w];
  }
  // Need: pWin * (winEv / winMass) = rtp  ->  pWin = rtp * winMass / winEv
  const pWin = Math.min(0.999, rtp * winMass / winEv);
  const probs = [];
  for (let w = 0; w <= MAX_WAVE; w++) {
    probs[w] = WAVE_MULTIPLIERS[w] > 0 ? (shape[w] / winMass) * pWin : (shape[w] / loseMass) * (1 - pWin);
  }
  return probs;
}

export function expectedRtp(probs) {
  let ev = 0;
  for (let w = 0; w < probs.length; w++) ev += probs[w] * WAVE_MULTIPLIERS[w];
  return ev;
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
    demonWave: deathWave >= 9 && rng.chance(0.35) ? rng.int(8, Math.max(8, deathWave)) : -1,
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
