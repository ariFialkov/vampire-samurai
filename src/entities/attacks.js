// Weapon choreography. Every weapon has a resting guard ("carry") and a set of moves, each on
// its own input: cuts to either side, a thrust and an overhead cleave (plus combo extras).
//
// Keyframes describe where the weapon hand goes and where the blade points, in torso space
// (x toward the weapon hand's side, y up, z forward):
//   y  = hand yaw around the body (0 = straight ahead), h = hand height, r = reach
//   ty = blade yaw, tp = blade pitch (the direction the tip points)
//   tw = torso twist, ln = forward lean, cr = crouch / lunge
//   O  = optional explicit off-hand {y, h, r, ty, tp} (claws, bow string hand, binoculars)
// A two-bone IK solves each arm to reach its hand target, the wrist turns the weapon so the
// blade points along `t` with its edge leading the swing, and on two-handed weapons the
// off hand grips the handle behind the weapon hand.
import * as THREE from 'three';

const K = (t, y, h, r, ty, tp, tw = 0, ln = 0, cr = 0, O = null) => ({ t, y, h, r, ty, tp, tw, ln, cr, O });
const O = (y, h, r, ty = 0, tp = 0) => ({ y, h, r, ty, tp });

/**
 * main: which hand holds the weapon ('R' or 'L'); off: 'grip' (two-handed, `spacing` m down
 * the handle), 'track' (explicit O channels) or 'free' (balances the body); mount: how far up
 * the weapon the hand sits; face: 'sweep' (edge leads the swing) or 'forward'.
 *
 * moves: each attack has its own input (cutL / cutR sweep to either side, thrust, cleave) and
 * keyframes in SECONDS. A move starts from wherever the weapon is right now (so one strike
 * flows into the next), passes through its keys and ends in its follow-through; the guard
 * then springs back in. `hit` is when damage lands. kind picks reach, arc, footwork and lunge.
 * combo: what the plain attack button chains through.
 * trail: [from, to] along the weapon's +y for the blade's motion trail.
 */
export const WEAPON_RIGS = {
  katana: {
    main: 'R', off: 'grip', spacing: 0.2, mount: 0.06, face: 'sweep', trail: [0.3, 0.98],
    carry: K(0, 0.25, 0.3, 0.36, 0.05, 0.6),
    moves: {
      cutL: { name: 'Kesa-giri (diagonal cut)', kind: 'cut', hit: 0.253, keys: [K(0.15, 1.2, 0.84, 0.3, 2.3, 0.3, 0.45, -0.05), K(0.253, 0.05, 0.56, 0.52, 0, -0.05, 0, 0.12, 0.05), K(0.345, -0.85, 0.36, 0.32, -1.6, -0.4, -0.4, 0.15, 0.08)] },
      cutR: { name: 'Gyaku-kesa (reverse cut)', kind: 'cut', hit: 0.253, keys: [K(0.138, -0.95, 0.6, 0.32, -2.05, 0.12, -0.45), K(0.253, 0.05, 0.58, 0.54, 0.1, 0, 0, 0.1, 0.04), K(0.357, 1.1, 0.62, 0.4, 1.85, 0.2, 0.45, 0.05, 0.04)] },
      rise: { name: 'Kiri-age (rising cut)', kind: 'cut', hit: 0.253, keys: [K(0.144, -0.4, 0.26, 0.3, -1.15, -0.7, -0.3, 0.1, 0.1), K(0.253, 0.1, 0.5, 0.52, 0.1, 0.15, 0, 0.05, 0.04), K(0.345, 1.1, 0.8, 0.46, 1.75, 0.55, 0.3, -0.06)] },
      thrust: { name: 'Tsuki (thrust)', kind: 'thrust', hit: 0.23, keys: [K(0.13, 0.2, 0.34, 0.2, 0.02, 0.12, 0.2, -0.03, 0.03), K(0.23, 0.04, 0.46, 0.62, 0, 0, -0.12, 0.2, 0.1), K(0.36, 0.04, 0.46, 0.6, 0, 0.02, -0.12, 0.18, 0.09)] },
      // blade pitched past vertical (tp > pi/2) lies back over the head: a straight vertical cut
      cleave: { name: 'Shomen-giri (overhead cleave)', kind: 'cleave', hit: 0.31, keys: [K(0.1, 0.12, 0.7, 0.52, 0, 1.2, 0, -0.06), K(0.2, 0.08, 1.0, 0.5, 0, 1.95, 0, -0.12, -0.02), K(0.31, 0, 0.55, 0.6, 0, -0.15, 0, 0.22, 0.1), K(0.43, 0, 0.32, 0.52, 0, -0.7, 0, 0.26, 0.12)] },
    },
    combo: ['cutL', 'cutR', 'rise'],
  },
  odachi: {
    main: 'R', off: 'grip', spacing: 0.32, mount: 0.06, face: 'sweep', trail: [0.5, 1.68],
    carry: K(0, 0.4, 0.34, 0.44, 0.3, 0.8),
    moves: {
      cleave: { name: 'Overhead cleave', kind: 'cleave', hit: 0.7, keys: [K(0.46, 0.2, 1.2, 0.3, 3.0, 1.38, 0, -0.15), K(0.7, 0, 0.52, 0.62, 0, -0.3, 0, 0.25, 0.12), K(0.89, 0, 0.2, 0.5, 0, -0.95, 0, 0.3, 0.14)] },
      cutL: { name: 'Wide sweep', kind: 'cut', hit: 0.68, keys: [K(0.42, 1.15, 0.58, 0.3, 2.2, 0.15, 0.55, 0, 0.05), K(0.68, 0.05, 0.55, 0.62, 0, -0.05, 0, 0.1, 0.08), K(0.89, -1.0, 0.5, 0.34, -2.05, -0.1, -0.6, 0.1, 0.08)] },
      cutR: { name: 'Return sweep', kind: 'cut', hit: 0.68, keys: [K(0.42, -1.0, 0.55, 0.32, -2.1, 0.12, -0.6, 0, 0.05), K(0.68, 0.05, 0.55, 0.62, 0.1, -0.05, 0, 0.1, 0.08), K(0.89, 1.1, 0.55, 0.36, 2.0, -0.05, 0.55, 0.1, 0.08)] },
      rise: { name: 'Rising cleave', kind: 'cut', hit: 0.68, keys: [K(0.42, -0.4, 0.26, 0.32, -1.3, -0.7, -0.35, 0.1, 0.12), K(0.68, 0.1, 0.52, 0.62, 0.1, 0.2, 0, 0.05, 0.05), K(0.89, 1.15, 0.85, 0.42, 1.8, 0.7, 0.3, -0.1)] },
      thrust: { name: 'Long thrust', kind: 'thrust', hit: 0.56, keys: [K(0.34, 0.22, 0.36, 0.22, 0.02, 0.1, 0.2, -0.03, 0.03), K(0.56, 0.04, 0.48, 0.66, 0, 0, -0.15, 0.2, 0.1), K(0.74, 0.04, 0.47, 0.64, 0, 0.02, -0.15, 0.18, 0.09)] },
    },
    combo: ['cleave', 'cutL', 'rise'],
  },
  kanabo: {
    main: 'R', off: 'grip', spacing: 0.22, mount: 0.15, face: 'sweep', trail: [0.55, 1.2], lunge: 0.6,
    carry: K(0, 0.7, 0.55, 0.24, 2.4, 0.85),
    moves: {
      cleave: { name: 'Overhead smash', kind: 'cleave', hit: 0.9, keys: [K(0.6, 0.2, 1.2, 0.36, 3.0, 1.38, 0, -0.15), K(0.9, 0, 0.5, 0.58, 0, -0.45, 0, 0.3, 0.15), K(1.14, 0, 0.2, 0.52, 0, -1.05, 0, 0.32, 0.16)] },
      cutL: { name: 'Home-run swing', kind: 'cut', hit: 0.87, keys: [K(0.57, 1.15, 0.62, 0.28, 2.25, 0.3, 0.6, 0, 0.06), K(0.87, 0, 0.55, 0.55, 0, 0, 0, 0.1, 0.1), K(1.14, -1.0, 0.55, 0.34, -2.15, 0.1, -0.7, 0.05, 0.08)] },
      cutR: { name: 'Backhand swing', kind: 'cut', hit: 0.87, keys: [K(0.57, -1.0, 0.6, 0.3, -2.2, 0.25, -0.6, 0, 0.06), K(0.87, 0, 0.55, 0.55, 0, 0, 0, 0.1, 0.1), K(1.14, 1.1, 0.58, 0.34, 2.1, 0.1, 0.65, 0.05, 0.08)] },
      low: { name: 'Low sweep', kind: 'cut', hit: 0.87, keys: [K(0.54, 1.0, 0.4, 0.32, 1.85, -0.3, 0.5, 0.2, 0.14), K(0.87, 0, 0.36, 0.58, 0, -0.45, 0, 0.3, 0.16), K(1.14, -0.9, 0.38, 0.32, -1.95, -0.4, -0.6, 0.25, 0.14)] },
      thrust: { name: 'Battering ram', kind: 'thrust', hit: 0.64, keys: [K(0.42, 0.3, 0.4, 0.22, 0.05, 0.2, 0.25, -0.02, 0.03), K(0.64, 0.05, 0.5, 0.62, 0, 0.05, -0.15, 0.22, 0.1), K(0.88, 0.05, 0.5, 0.6, 0, 0.05, -0.15, 0.2, 0.09)] },
    },
    combo: ['cleave', 'cutL', 'low'],
  },
  naginata: {
    main: 'R', off: 'grip', spacing: 0.34, mount: 0.8, face: 'sweep', trail: [0.95, 1.5], lunge: 0.75,
    carry: K(0, 0.6, 0.38, 0.55, 0.1, 0.5),
    moves: {
      thrust: { name: 'Thrust', kind: 'thrust', hit: 0.354, keys: [K(0.24, 0.75, 0.46, 0.42, 0.05, 0.08, 0.2, -0.05), K(0.354, 0.35, 0.5, 0.65, 0, 0, -0.1, 0.2, 0.06), K(0.483, 0.35, 0.5, 0.62, 0, 0, -0.1, 0.2, 0.06)] },
      cutL: { name: 'Wide sweep', kind: 'cut', hit: 0.37, keys: [K(0.24, 0.9, 0.5, 0.52, 1.5, 0.25, 0.45), K(0.37, 0.3, 0.45, 0.62, 0, 0.1, 0, 0.1, 0.05), K(0.5, -0.3, 0.42, 0.55, -1.45, 0.05, -0.5, 0.1, 0.05)] },
      cutR: { name: 'Return sweep', kind: 'cut', hit: 0.37, keys: [K(0.24, -0.3, 0.45, 0.52, -1.45, 0.2, -0.45), K(0.37, 0.3, 0.45, 0.62, 0, 0.1, 0, 0.1, 0.05), K(0.5, 0.9, 0.48, 0.55, 1.5, 0.05, 0.5, 0.1, 0.05)] },
      rise: { name: 'Rising slash', kind: 'cut', hit: 0.37, keys: [K(0.24, 0.5, 0.3, 0.5, -0.4, -0.55, -0.3, 0.1, 0.08), K(0.37, 0.4, 0.45, 0.62, 0.05, 0.25, 0, 0.05), K(0.5, 0.95, 0.75, 0.5, 1.5, 0.8, 0.3, -0.05)] },
      cleave: { name: 'Overhead chop', kind: 'cleave', hit: 0.45, keys: [K(0.15, 0.45, 0.7, 0.55, 0, 1.2, 0, -0.06), K(0.3, 0.4, 1.0, 0.5, 0, 1.95, 0, -0.12), K(0.45, 0.35, 0.5, 0.6, 0, -0.15, 0, 0.22, 0.1), K(0.58, 0.35, 0.35, 0.58, 0, -0.5, 0, 0.24, 0.11)] },
    },
    combo: ['thrust', 'cutL', 'rise'],
  },
  wakizashi: {
    main: 'R', off: 'free', mount: 0.05, face: 'sweep', trail: [0.18, 0.58],
    carry: K(0, 0.6, 0.35, 0.34, 0.35, 0.35),
    moves: {
      cutL: { name: 'Forehand slash', kind: 'cut', hit: 0.135, keys: [K(0.071, 1.25, 0.68, 0.3, 2.1, 0.25, 0.4), K(0.135, 0.1, 0.55, 0.53, 0.05, -0.05, 0, 0.1, 0.04), K(0.193, -0.9, 0.45, 0.4, -1.6, -0.2, -0.35, 0.1, 0.04)] },
      cutR: { name: 'Backhand slash', kind: 'cut', hit: 0.135, keys: [K(0.071, -0.6, 0.6, 0.32, -1.65, 0.15, -0.4), K(0.135, 0.2, 0.55, 0.53, 0.2, 0, 0, 0.08), K(0.193, 1.2, 0.6, 0.42, 2.0, 0.2, 0.4)] },
      thrust: { name: 'Quick thrust', kind: 'thrust', hit: 0.135, keys: [K(0.08, 0.9, 0.45, 0.25, 0.1, 0, 0.2), K(0.135, 0.25, 0.52, 0.62, 0, 0, -0.1, 0.15, 0.05), K(0.193, 0.25, 0.52, 0.6, 0, 0, -0.1, 0.15, 0.05)] },
      cleave: { name: 'Short chop', kind: 'cleave', hit: 0.17, keys: [K(0.06, 0.2, 0.7, 0.5, 0, 1.2, 0, -0.05), K(0.11, 0.12, 1.0, 0.5, 0, 1.95, 0, -0.1), K(0.17, 0.1, 0.55, 0.52, 0, -0.2, 0, 0.15, 0.06), K(0.24, 0.1, 0.4, 0.48, 0, -0.6, 0, 0.18, 0.07)] },
    },
    combo: ['cutL', 'cutR', 'thrust'],
  },
  tessen: {
    main: 'R', off: 'free', mount: 0.06, face: 'sweep', trail: [0.12, 0.48],
    carry: K(0, 0.6, 0.4, 0.32, 0.5, 0.7),
    moves: {
      cutL: { name: 'Fan sweep', kind: 'cut', hit: 0.207, keys: [K(0.101, 1.3, 0.6, 0.32, 2.2, 0.1, 0.5), K(0.207, 0, 0.55, 0.55, 0, 0, 0, 0.05), K(0.299, -1.0, 0.55, 0.32, -2.1, 0.1, -0.5)] },
      cutR: { name: 'Return sweep', kind: 'cut', hit: 0.207, keys: [K(0.101, -0.9, 0.55, 0.3, -1.9, 0.1, -0.5), K(0.207, 0.1, 0.55, 0.55, 0.1, 0), K(0.299, 1.3, 0.6, 0.4, 2.1, 0.2, 0.5)] },
      rise: { name: 'Rising flick', kind: 'cut', hit: 0.207, keys: [K(0.115, 0.3, 0.25, 0.38, 0.3, -0.8, -0.6, 0.1, 0.08), K(0.207, 0.1, 0.6, 0.55, 0, 0.3), K(0.299, 1.1, 0.85, 0.42, 1.7, 0.75, 0.5, -0.1)] },
      thrust: { name: 'Closed-fan jab', kind: 'thrust', hit: 0.19, keys: [K(0.1, 0.5, 0.45, 0.25, 0.1, 0.1, 0.2), K(0.19, 0.15, 0.52, 0.6, 0, 0, -0.15, 0.12, 0.04), K(0.27, 0.15, 0.52, 0.58, 0, 0, -0.12, 0.1, 0.04)] },
      cleave: { name: 'Iron chop', kind: 'cleave', hit: 0.22, keys: [K(0.07, 0.2, 0.7, 0.5, 0, 1.2, 0, -0.05), K(0.13, 0.12, 1.0, 0.5, 0, 1.95, 0, -0.1), K(0.22, 0.1, 0.55, 0.52, 0, -0.2, 0, 0.15, 0.06), K(0.3, 0.1, 0.4, 0.5, 0, -0.55, 0, 0.16, 0.06)] },
    },
    combo: ['cutL', 'cutR', 'rise'],
  },
  tekkokagi: {
    main: 'R', off: 'track', mount: 0, face: 'sweep', trail: [0.12, 0.45], lunge: 0.4,
    carry: K(0, 0.35, 0.55, 0.32, 0.1, 0.3, 0, 0, 0, O(-0.35, 0.55, 0.32, -0.1, 0.3)),
    moves: {
      thrust: { name: 'Right jab', kind: 'thrust', hit: 0.074, keys: [K(0.035, 0.35, 0.56, 0.25, 0.1, 0.2, 0.25, 0, 0, O(-0.35, 0.6, 0.3, -0.1, 0.4)), K(0.074, 0.08, 0.58, 0.62, 0, 0, -0.35, 0.15, 0.03, O(-0.4, 0.55, 0.28, -0.2, 0.3)), K(0.127, 0.2, 0.56, 0.45, 0.05, 0.1, -0.2, 0.1, 0, O(-0.35, 0.58, 0.3, -0.1, 0.35))] },
      jabL: { name: 'Left jab', kind: 'thrust', hit: 0.074, keys: [K(0.035, 0.4, 0.6, 0.3, 0.1, 0.4, -0.25, 0, 0, O(-0.3, 0.55, 0.25, -0.1, 0.2)), K(0.074, 0.4, 0.55, 0.28, 0.2, 0.3, 0.35, 0.15, 0.03, O(-0.08, 0.58, 0.62, 0, 0)), K(0.127, 0.35, 0.58, 0.3, 0.1, 0.35, 0.2, 0.1, 0, O(-0.2, 0.56, 0.45, -0.05, 0.1))] },
      cutL: { name: 'Hook rake', kind: 'cut', hit: 0.087, keys: [K(0.046, 1.0, 0.6, 0.35, 1.45, 0.1, 0.45, 0, 0, O(-0.35, 0.6, 0.3, -0.1, 0.4)), K(0.087, 0, 0.58, 0.55, 0, 0, 0, 0.12, 0.04, O(-0.4, 0.58, 0.28, -0.1, 0.35)), K(0.129, -0.8, 0.55, 0.4, -1.25, 0, -0.45, 0.1, 0.03, O(-0.3, 0.6, 0.3, -0.1, 0.4))] },
      cutR: { name: 'Backhand rake', kind: 'cut', hit: 0.087, keys: [K(0.046, -0.6, 0.58, 0.35, -1.1, 0.05, -0.4, 0, 0, O(-0.55, 0.5, 0.25, -0.2, 0.2)), K(0.087, 0.05, 0.58, 0.55, 0, 0, 0, 0.12, 0.04, O(-0.45, 0.56, 0.28, -0.1, 0.3)), K(0.129, 0.9, 0.55, 0.4, 1.3, 0, 0.45, 0.1, 0.03, O(-0.3, 0.6, 0.3, -0.1, 0.4))] },
      cleave: { name: 'Twin uppercut', kind: 'cleave', hit: 0.12, keys: [K(0.07, 0.3, 0.35, 0.28, 0.1, -0.5, 0.2, 0.05, 0.06, O(-0.3, 0.35, 0.28, -0.1, -0.5)), K(0.12, 0.12, 0.85, 0.5, 0, 0.5, 0, -0.08, 0, O(-0.12, 0.85, 0.5, 0, 0.5)), K(0.18, 0.12, 0.95, 0.42, 0, 1.0, 0, -0.1, 0, O(-0.12, 0.95, 0.42, 0, 1.0))] },
    },
    combo: ['thrust', 'jabL', 'cutL'],
  },
  kusarigama: {
    main: 'R', off: 'free', mount: 0.15, face: 'sweep', trail: [0.02, 0.32],
    carry: K(0, 0.55, 0.35, 0.3, 0.35, 0.6),
    moves: {
      thrust: { name: 'Whirl and fling', kind: 'fling', hit: 0.489, fire: true, keys: [K(0.147, 0.85, 1.12, 0.3, 1.9, 0.45, 0, -0.1), K(0.274, -0.2, 1.16, 0.3, -1.4, 0.45, 0, -0.1), K(0.391, 0.85, 1.12, 0.3, 1.9, 0.45), K(0.489, 0.15, 0.6, 0.6, 0, 0, -0.1, 0.15, 0.05), K(0.665, 0.15, 0.55, 0.55, 0, -0.1)] },
      cutL: { name: 'Sickle sweep', kind: 'cut', hit: 0.33, stats: { range: 2.3, arc: 2.6 }, keys: [K(0.2, 1.2, 0.55, 0.3, 2.0, 0, 0.5), K(0.33, 0.05, 0.55, 0.58, 0, 0, 0, 0.1), K(0.46, -0.6, 0.5, 0.45, -1.0, 0, -0.4)] },
      cutR: { name: 'Sickle return', kind: 'cut', hit: 0.33, stats: { range: 2.3, arc: 2.6 }, keys: [K(0.2, -0.6, 0.5, 0.4, -1.2, 0, -0.4), K(0.33, 0.05, 0.55, 0.58, 0, 0, 0, 0.1), K(0.46, 1.1, 0.55, 0.4, 1.8, 0, 0.45)] },
      cleave: { name: 'Overhead whirl', kind: 'whirl', hit: 0.36, stats: { range: 2.8 }, keys: [K(0.12, 0.85, 1.12, 0.3, 1.9, 0.45, 0, -0.1), K(0.24, -0.2, 1.16, 0.3, -1.4, 0.45, 0, -0.1), K(0.36, 0.85, 1.12, 0.3, 1.9, 0.45), K(0.48, -0.2, 1.16, 0.3, -1.4, 0.45), K(0.62, 0.55, 0.5, 0.4, 0.6, 0.2)] },
    },
    combo: ['thrust'],
  },
  yumi: {
    main: 'L', off: 'track', mount: 0, face: 'forward',
    carry: K(0, -0.5, 0.3, 0.26, 0.2, 1.35, 0, 0, 0, null),
    variants: [
      { name: 'draw and loose', hitAt: 0.42, keys: [K(0.18, -0.15, 0.62, 0.58, 0, 1.5, -0.35, 0, 0, O(-0.12, 0.62, 0.5)), K(0.4, -0.15, 0.64, 0.6, 0, 1.5, -0.45, 0, 0, O(0.45, 0.76, 0.12)), K(0.55, -0.15, 0.64, 0.6, 0, 1.5, -0.45, 0, 0, O(1.3, 0.72, 0.22))] },
    ],
  },
  binoculars: {
    main: 'R', off: 'track', mount: 0, face: 'forward',
    carry: K(0, 0.5, 0.3, 0.3, 0, 1.4),
    variants: [
      { name: 'scout', hitAt: 1, keys: [K(0.3, 0.12, 0.8, 0.28, 0, 1.5, 0, -0.05, 0, O(-0.12, 0.8, 0.28)), K(0.75, 0.12, 0.8, 0.28, 0, 1.5, 0, -0.05, 0, O(-0.12, 0.8, 0.28))] },
    ],
  },
};

/**
 * What each kind of move does in play, relative to the weapon's own stats, plus its footwork:
 * lunge = metres the body travels into the strike; steps = feet placements (stance-local x/z
 * in metres, yaw in radians, relative to where the body ends up; times relative to the keys).
 */
export const MOVE_KINDS = {
  cut:    { dmg: 1.0, range: 1.0, arc: 1.0, knock: 1.0, stun: 0, pierce: 2, lunge: 0.22, hitStop: 0.05 },
  thrust: { dmg: 1.15, range: 1.3, arc: 0.42, knock: 0.7, stun: 0, pierce: 4, lunge: 0.6, hitStop: 0.045 },
  cleave: { dmg: 1.6, range: 1.12, arc: 0.6, knock: 1.5, stun: 0.6, pierce: 2, lunge: 0.32, hitStop: 0.085 },
  whirl:  { dmg: 0.9, range: 1.0, arc: Math.PI * 2, knock: 1.2, stun: 0, pierce: 6, lunge: 0, hitStop: 0.05 },
  fling:  { dmg: 1.0, range: 1.0, arc: 0, knock: 1.0, stun: 0, pierce: 1, lunge: 0.1, hitStop: 0 },
};

/** Footwork for a move, timed from its (possibly shortened) windup key and hit. */
export function moveSteps(move, windup, hit, end) {
  const kind = move.kind, R = 1, L = -1;
  if (kind === 'thrust') return [
    { side: R, t0: windup * 0.55, t1: hit, x: 0.14, z: 0.34, yaw: 0.05, h: 0.07 },        // fumikomi: the lead foot drives in
    { side: L, t0: hit, t1: hit + (end - hit) * 0.85, x: -0.13, z: -0.16, yaw: -0.35, h: 0.03 },   // the back foot slides up behind
  ];
  if (kind === 'cleave') return [
    { side: R, t0: windup * 0.75, t1: hit, x: 0.14, z: 0.28, yaw: 0.05, h: 0.09 },
    { side: L, t0: hit + (end - hit) * 0.15, t1: end, x: -0.13, z: -0.14, yaw: -0.35, h: 0.03 },
  ];
  if (move.name && /rise|rising|uppercut/i.test(move.name)) return [{ side: R, t0: windup * 0.6, t1: hit, x: 0.14, z: 0.2, yaw: 0.1, h: 0.06 }];
  if (kind === 'cut') {
    // the body turns from the ground up: the foot on the side the blade comes from steps in
    const lead = move.keys[0].y >= 0 ? R : L;
    return [{ side: lead, t0: windup * 0.6, t1: hit, x: lead * 0.14, z: 0.2, yaw: lead > 0 ? 0.15 : -0.2, h: 0.05 }];
  }
  return [];
}

/**
 * The track for a move starting from the current pose `from`. windupScale < 1 shortens the
 * windup when the weapon is already close to where the move begins (one cut flowing into the
 * next). Returns { keys, hit, end, windup } in seconds.
 */
export function moveTrack(move, from, windupScale = 1, vel = null) {
  const first = move.keys[0];
  const shift = first.t * (1 - windupScale);
  const keys = [{ ...from, O: from.O ? { ...from.O } : null, t: 0, v: vel ? { ...vel } : null }, ...move.keys.map((k) => ({ ...k, t: k.t - shift }))];
  return { keys, hit: move.hit - shift, end: move.keys[move.keys.length - 1].t - shift, windup: first.t - shift };
}

/** How far (roughly, in "effort") the weapon has to travel from pose a to pose b. */
export function poseDistance(a, b) {
  const ha = handPos(a.y, a.h, a.r, new THREE.Vector3()), hb = handPos(b.y, b.h, b.r, new THREE.Vector3());
  const ta = dirFrom(a.ty, a.tp, new THREE.Vector3()), tb = dirFrom(b.ty, b.tp, new THREE.Vector3());
  return ha.distanceTo(hb) * 2.5 + Math.acos(Math.max(-1, Math.min(1, ta.dot(tb)))) * 0.5;
}

// ---------------------------------------------------------------------------- track sampling
const CH = ['y', 'h', 'r', 'ty', 'tp', 'tw', 'ln', 'cr'];
const OCH = ['y', 'h', 'r', 'ty', 'tp'];
function hermite(p1, p2, m1, m2, u) {
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
}
/**
 * Sample a keyframe list at time t: Catmull-Rom, except that a key carrying `v` (channel
 * velocities per second) leaves with that velocity, so a move picks up the motion already
 * under way instead of jerking into its own.
 */
export function sample(keys, t, out = {}) {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const span = Math.max(1e-4, k2.t - k1.t);
  const u = Math.min(1, Math.max(0, (t - k1.t) / span));
  for (const c of CH) {
    let m1 = 0.5 * (k2[c] - k0[c]);
    if (k1.v && k1.v[c] != null) { const lim = Math.abs(k2[c] - k1[c]) * 1.5 + 0.05; m1 = Math.max(-lim, Math.min(lim, k1.v[c] * span)); }
    out[c] = hermite(k1[c], k2[c], m1, 0.5 * (k3[c] - k1[c]), u);
  }
  if (k1.O || k2.O) {
    const o0 = k0.O ?? k1.O ?? k2.O, o1 = k1.O ?? k2.O, o2 = k2.O ?? k1.O, o3 = k3.O ?? k2.O ?? k1.O;
    out.O ??= {};
    for (const c of OCH) out.O[c] = hermite(o1[c], o2[c], 0.5 * (o2[c] - o0[c]), 0.5 * (o3[c] - o1[c]), u);
  } else out.O = null;
  return out;
}
/** The full track for an attack: carry -> keys -> carry. */
export function attackTrack(rig, variant) {
  const c = rig.carry;
  return [{ ...c, t: 0 }, ...variant.keys, { ...c, t: 1 }];
}
export const handPos = (y, h, r, v = new THREE.Vector3()) => v.set(Math.sin(y) * r, h, Math.cos(y) * r);
export const dirFrom = (ty, tp, v = new THREE.Vector3()) => v.set(Math.sin(ty) * Math.cos(tp), Math.sin(tp), Math.cos(ty) * Math.cos(tp));

// ---------------------------------------------------------------------------- IK + wrist
const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _w = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qe = new THREE.Quaternion();
const _qh = new THREE.Quaternion(), _qi = new THREE.Quaternion();
function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
const _e = new THREE.Euler();

/**
 * Two-bone IK in the parent space of `root`: root -> mid -> end. pole: the direction the middle
 * joint should point (elbows out and down, knees forward). bend = -1 for arms (the elbow folds
 * the forearm forward), +1 for legs (the knee folds the shin back). Returns where the end lands.
 */
export function solveTwoBone(root, mid, target, a, b, pole, bend, out = new THREE.Vector3()) {
  const S = root.position;
  _d.subVectors(target, S);
  let d = _d.length();
  // soft reach limit: the limb eases toward straight instead of snapping locked
  const L = a + b, k0 = L * 0.96, span = L * 0.035;
  if (d > k0) d = k0 + span * (1 - Math.exp(-(d - k0) / span));
  d = Math.max(Math.abs(a - b) + 1e-3, d);
  _d.normalize();
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const alpha = Math.acos(Math.min(1, Math.max(-1, cosA)));
  const cosG = (a * a + b * b - d * d) / (2 * a * b);
  const gamma = Math.acos(Math.min(1, Math.max(-1, cosG)));
  // bend plane: toward the pole direction perpendicular to the reach line
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-6) _p.set(0, -1, 0).addScaledVector(_d, _d.y);
  _p.normalize();
  _u.copy(_d).multiplyScalar(Math.cos(alpha)).addScaledVector(_p, Math.sin(alpha)).normalize();   // upper bone
  const midPos = _w.copy(S).addScaledVector(_u, a);
  _f.copy(S).addScaledVector(_d, d).sub(midPos).normalize();                                       // lower bone
  // root basis: local -y along the upper bone, local z toward the side the lower bone folds to.
  // That side is taken from the pole (stable even when the limb is straight), not from the
  // lower bone, whose sideways component vanishes as the limb straightens.
  _y.copy(_u).negate();
  _z.copy(_p).multiplyScalar(Math.cos(alpha)).addScaledVector(_d, -Math.sin(alpha)).normalize();
  if (bend < 0) _z.negate();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  root.quaternion.setFromRotationMatrix(_m);
  mid.rotation.set(bend * (Math.PI - gamma), 0, 0);
  return out.copy(S).addScaledVector(_d, d);
}

/** Arm IK (shoulder -> elbow -> hand) in the space the shoulder lives in. */
export function solveArm(arm, target, a, b, pole, out = new THREE.Vector3()) {
  return solveTwoBone(arm.shoulder, arm.elbow, target, a, b, pole, -1, out);
}

/** Clavicle: the shoulder rises and comes forward a little as the hand reaches up and out. */
export function shrug(arm, target) {
  const base = arm.shoulder.userData.base;
  if (!base) return;
  const up = Math.min(1, Math.max(0, (target.y - base.y + 0.15) / 0.6));
  const fwd = Math.min(1, Math.max(0, (target.z - 0.2) / 0.4));
  arm.shoulder.position.set(base.x * (1 - 0.06 * fwd), base.y + 0.045 * up * up, base.z + 0.035 * fwd);
}

/**
 * Orient a grip (child of a hand) so the weapon's +y points along `tip` and +z along `face`.
 * The wrist takes `wrist` of the turn (so the hand visibly follows the weapon), the grip the rest.
 */
export function orientGrip(arm, grip, tip, face, wrist = 0) {
  _y.copy(tip).normalize();
  _z.copy(face).addScaledVector(_y, -face.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  _q.setFromRotationMatrix(_m);                                   // weapon orientation in the shoulder's parent space
  _qe.setFromEuler(_e.set(arm.elbow.rotation.x, arm.elbow.rotation.y, arm.elbow.rotation.z));
  _qh.copy(arm.shoulder.quaternion).multiply(_qe).invert().multiply(_q);   // needed turn below the forearm
  // the wrist's share fades out as the turn nears half a revolution, where its shortest path
  // would flip sides from one frame to the next
  const ang = 2 * Math.acos(Math.min(1, Math.abs(_qh.w)));
  arm.hand.quaternion.identity().slerp(_qh, wrist * (1 - smoothstep(2.2, 2.9, ang)));
  grip.quaternion.copy(_qi.copy(arm.hand.quaternion).invert().multiply(_qh));
}

/** Rotate unit vector `from` toward `to` about `axis` by at most maxAngle (both ⟂ axis). */
function rollToward(from, to, axis, maxAngle) {
  const ang = Math.atan2(_w.crossVectors(from, to).dot(axis), from.dot(to));
  const step = Math.max(-maxAngle, Math.min(maxAngle, ang));
  return from.applyAxisAngle(axis, step).normalize();
}

const _hand = new THREE.Vector3(), _tip = new THREE.Vector3(), _tip2 = new THREE.Vector3(), _face = new THREE.Vector3(), _sweep = new THREE.Vector3();
const _offT = new THREE.Vector3(), _pole = new THREE.Vector3(), _reached = new THREE.Vector3(), _tmp = {};

/** Torso-space hand target -> the chest's space (the arms hang from the chest). */
export function toChest(parts, v) { if (parts.chest) v.y -= parts.chest.position.y; return v; }

/**
 * Pose the arms and weapon from pose channels P (see K above). Arms are solved in chest space,
 * so the body's lean and twist carry them. state keeps the blade's facing between frames: the
 * edge leads during swings and the wrist rolls it there at a limited rate (no flips).
 */
export function poseArms(parts, rig, P, grips, state, dt = 1 / 60) {
  const mainArm = rig.main === 'L' ? parts.armL : parts.armR;
  const offArm = rig.main === 'L' ? parts.armR : parts.armL;
  const { upper: a, lower: b } = parts.armLen;
  const side = rig.main === 'L' ? -1 : 1;
  toChest(parts, handPos(P.y, P.h, P.r, _hand));
  dirFrom(P.ty, P.tp, _tip);
  shrug(mainArm, _hand);
  solveArm(mainArm, _hand, a, b, _pole.set(side * 0.7, -1, -0.35), _reached);
  // blade facing
  if (rig.face === 'forward') _face.set(0, 0, 1);
  else {
    const guard = _sweep.crossVectors(_tip, _y.set(-side, 0, 0)).normalize();
    let w;
    if (P.sweep) {
      // the strike tells us which way the blade is about to travel: the edge turns to lead it
      // from the windup on, so it never has to flip mid-cut
      _tip2.copy(P.sweep); w = P.swingW ?? 1;
    } else {
      let speed = 0;
      if (state.prevTip) { _tip2.subVectors(_tip, state.prevTip); speed = _tip2.length() / Math.max(1e-3, dt); }
      w = smoothstep(1.5, 5, speed);
    }
    if (w > 0.01) _face.crossVectors(_tip, _tip2).normalize().multiplyScalar(w).addScaledVector(guard, 1 - w);
    else _face.copy(guard);
    _face.addScaledVector(_tip, -_face.dot(_tip));
    if (_face.lengthSq() < 1e-6) _face.copy(guard);
    _face.normalize();
    if (state.face) {
      const f = state.face.addScaledVector(_tip, -state.face.dot(_tip));
      if (f.lengthSq() > 1e-6) { f.normalize(); _face.copy(rollToward(f, _face, _tip, (6 + 20 * w) * dt)); }
    }
  }
  state.face = (state.face ?? new THREE.Vector3()).copy(_face);
  state.prevTip = (state.prevTip ?? new THREE.Vector3()).copy(_tip);
  orientGrip(mainArm, grips.main, _tip, _face, rig.off === 'grip' ? 0.25 : 0.4);
  // off hand
  if (rig.off === 'grip') {
    _offT.copy(_reached).addScaledVector(_tip, -rig.spacing);
    shrug(offArm, _offT);
    solveArm(offArm, _offT, a, b, _pole.set(-side * 0.7, -1, -0.35));
    offArm.hand.quaternion.identity();
  } else if (P.O) {
    toChest(parts, handPos(P.O.y, P.O.h, P.O.r, _offT));
    shrug(offArm, _offT);
    solveArm(offArm, _offT, a, b, _pole.set(-side * 0.7, -1, -0.35));
    if (grips.off) orientGrip(offArm, grips.off, dirFrom(P.O.ty, P.O.tp, _tip2), _face, 0.3);
    else offArm.hand.quaternion.identity();
  } else if (rig.off === 'free') {
    freeArm(parts, offArm, -side, P.swing ?? 0, P.int ?? 0);
  }
}

/**
 * A free arm: hangs relaxed and swings with the walk; during a strike it opens out to the side
 * and back as a counterweight (intensity 0..1).
 */
export function freeArm(parts, arm, side, swing, intensity) {
  const { upper: a, lower: b } = parts.armLen;
  const base = arm.shoulder.userData.base ?? arm.shoulder.position;
  // hanging: hand just in front of the hip, swinging fore and aft
  _offT.set(base.x * 1.12, base.y - (a + b) * 0.9, 0.04 + swing * 0.22);
  _offT.y += Math.abs(swing) * 0.06;
  // counterweight: out to the side and slightly back, at chest height
  _hand.set(base.x + side * 0.38, base.y - 0.12, -0.12);
  _offT.lerp(_hand, intensity);
  shrug(arm, _offT);
  solveArm(arm, _offT, a, b, _pole.set(side * 0.5, -0.4, -1));
  arm.hand.quaternion.identity();
  arm.hand.rotation.set(-0.15 - intensity * 0.3, 0, side * 0.1);
}

/** Compatibility helper: pose for `variant` at normalised t, or the carry pose. */
export function poseWeapon(parts, rig, variant, t, grips, state) {
  const P = variant ? sample(attackTrack(rig, variant), t, _tmp) : rig.carry;
  parts.torso.rotation.y += P.tw;
  parts.torso.rotation.x += P.ln;
  parts.hips.position.y -= P.cr;
  poseArms(parts, rig, P, grips, state);
}
