// Special techniques: complex gestures (rolling the stick, a circle swipe, a key sequence, a
// double flick), sometimes after a particular string of strikes, unleash a special move.
// They are built from the same pieces as ordinary strikes, so they flow the same way: pose
// keyframes for the arms (starting from wherever the blade is), plus what the whole body does
// (spin on the spot, leap, dash, hop) and where and when it hits.
//
// Gestures (see src/core/gestures.js):
//   circle        a full roll of the right stick / a circle swipe / ↑→↓← (any start, either way)
//   half          a half circle
//   double:up     the same direction twice quickly (also double:down, double:side)
//
// Each technique: { id, name, jp, gesture, after?(history) -> bool, minFlow?, cd, build(ctx) }.
// `after` reads the strikes chained just before the gesture, so longer strings unlock
// stronger techniques (the tree): circle alone is Whirlwind, but two opposite cuts and then a
// circle is Tengu Dive, a leaping spin that lands in a cleave.

const K = (t, y, h, r, ty, tp, tw = 0, ln = 0, cr = 0, O = null) => ({ t, y, h, r, ty, tp, tw, ln, cr, O });
const OB = (y, h, r, ty = 0, tp = 0) => ({ y, h, r, ty, tp });

const isCut = (k) => k === 'cutL' || k === 'cutR' || k === 'rise' || k === 'low' || k === 'jabL';
const tail = (h, n) => h.slice(-n).map((e) => e.key);

/** Feet while airborne, stance-local (x, height above the root, z). */
export const AIR_FEET = {
  tuck: { 1: { x: 0.13, y: 0.32, z: 0.1 }, [-1]: { x: -0.13, y: 0.36, z: -0.05 } },
  superman: { 1: { x: 0.12, y: 0.42, z: 0.22 }, [-1]: { x: -0.12, y: 0.34, z: -0.48 } },
  dash: { 1: { x: 0.13, y: 0.1, z: 0.38 }, [-1]: { x: -0.13, y: 0.16, z: -0.5 } },
};

/** Weapon-specific names for the shared techniques (and a little reach). */
const LOCAL = {
  kanabo: { whirlwind: { name: 'Oni Typhoon', jp: '鬼嵐' }, splitter: { name: 'Mountain Breaker', jp: '山崩し' } },
  naginata: { whirlwind: { name: 'Water Wheel', jp: '水車', reach: 1.15 }, flash: { name: 'Lightning Reach', jp: '稲妻突き' } },
  kusarigama: { whirlwind: { name: 'Chain Storm', jp: '鎖嵐', reach: 1.8 }, petals: { name: 'Thousand Links', jp: '千鎖', reach: 1.6 } },
  tekkokagi: { cross: { name: 'Tiger Claws', jp: '虎爪' }, whirlwind: { name: 'Claw Cyclone', jp: '爪旋風' } },
  tessen: { whirlwind: { name: 'Wind Dance', jp: '風舞' }, cross: { name: 'Folding Fan', jp: '扇返し' } },
  odachi: { whirlwind: { name: 'Great Wheel', jp: '大車輪' } },
  wakizashi: { flash: { name: 'Shadow Step', jp: '影歩' } },
};

export const TECHNIQUES = [
  {
    id: 'tengu', name: 'Tengu Dive', jp: '天狗落とし', gesture: 'circle', cd: 1,
    how: 'Two opposite cuts, then roll a full circle',
    after: (h) => {
      const [x, y] = h.slice(-2);
      if (!x || !y || !isCut(x.key) || !isCut(y.key)) return false;
      return x.dir && y.dir ? x.dir !== y.dir : x.key !== y.key;      // opposite sides of the screen
    },
    build: (T) => ({
      keys: [K(0.1 * T, -0.4, 0.26, 0.3, -1.15, -0.7, -0.3, 0.12, 0.22), K(0.22 * T, 1.0, 0.7, 0.6, 1.4, 0.05, 0.3, 0.45),
        K(0.42 * T, 1.1, 0.72, 0.6, 1.5, 0, 0.3, 0.5), K(0.5 * T, 0.08, 1.0, 0.5, 0, 1.95, 0, 0.1), K(0.6 * T, 0, 0.5, 0.62, 0, -0.3, 0, 0.3, 0.16),
        K(0.8 * T, 0, 0.3, 0.52, 0, -0.8, 0, 0.28, 0.14)],
      hits: [{ t: 0.34 * T, shape: 'circle', range: 1.0, dmg: 0.7, fx: 'spin' }, { t: 0.6 * T, shape: 'ring', rangeAbs: 3.0, dmg: 1.9, stun: 1.3, knock: 2.2, fx: 'ring', shake: 0.4 }],
      spin: { t0: 0.2 * T, t1: 0.48 * T, turns: 1 }, air: { t0: 0.14 * T, t1: 0.6 * T, h: 1.4, feet: 'superman' },
      travel: [{ t0: 0.14 * T, t1: 0.6 * T, dist: 4, toTarget: true }], iframes: [0.12 * T, 0.62 * T], pivot: true,
    }),
  },
  {
    id: 'petals', name: 'Thousand Petals', jp: '千本桜', gesture: 'circle', cd: 1, minFlow: 1,
    how: 'Thrust, cleave, then roll a full circle (with flow)',
    after: (h) => { const [a, b] = tail(h, 2); return a === 'thrust' && b === 'cleave'; },
    build: (T) => ({
      keys: [K(0.1 * T, 1.0, 0.62, 0.45, 1.9, 0.2, 0.35, 0, 0.1), K(0.18 * T, 1.2, 0.55, 0.6, 1.45, 0, 0.2, 0.08, 0.16),
        K(0.8 * T, 1.2, 0.55, 0.6, 1.45, 0, 0.2, 0.08, 0.16), K(0.95 * T, 0.4, 0.45, 0.5, 0.5, -0.2, 0, 0.05, 0.08)],
      hits: [0.25, 0.38, 0.51, 0.64, 0.77].map((t) => ({ t: t * T, shape: 'circle', range: 1.15, dmg: 0.75, fx: 'petals' })),
      spin: { t0: 0.16 * T, t1: 0.82 * T, turns: 2 }, iframes: [0.15 * T, 0.82 * T], pivot: true, sweep: 'spin',
    }),
  },
  {
    id: 'whirlwind', name: 'Whirlwind', jp: '旋風', gesture: 'circle', cd: 2.5,
    how: 'Roll a full circle',
    build: (T) => ({
      keys: [K(0.1 * T, 1.0, 0.62, 0.45, 1.9, 0.2, 0.35, 0, 0.1), K(0.18 * T, 1.2, 0.55, 0.58, 1.45, 0, 0.2, 0.08, 0.14),
        K(0.5 * T, 1.2, 0.55, 0.58, 1.45, 0, 0.2, 0.08, 0.14), K(0.64 * T, 0.4, 0.45, 0.5, 0.5, -0.2, 0, 0.05, 0.08)],
      hits: [{ t: 0.3 * T, shape: 'circle', range: 1.05, dmg: 0.85, fx: 'spin' }, { t: 0.46 * T, shape: 'circle', range: 1.05, dmg: 0.85, fx: 'spin' }],
      spin: { t0: 0.16 * T, t1: 0.52 * T, turns: 1 }, pivot: true, sweep: 'spin',
    }),
  },
  {
    id: 'dragon', name: 'Rising Dragon', jp: '昇龍', gesture: 'half', cd: 2.5,
    how: 'Roll a half circle',
    build: (T) => ({
      keys: [K(0.1 * T, -0.4, 0.22, 0.32, -1.2, -0.8, -0.35, 0.15, 0.2), K(0.2 * T, 0.1, 0.85, 0.5, 0.1, 1.0, 0, -0.15),
        K(0.38 * T, 0.35, 1.12, 0.36, 0.4, 1.55, 0.1, -0.2), K(0.48 * T, 0.3, 0.8, 0.45, 0.3, 1.0, 0, 0, 0.08)],
      hits: [{ t: 0.2 * T, shape: 'arc', range: 1.15, arc: 1.8, dmg: 1.5, stun: 1.5, knock: 2.4, fx: 'rise' }],
      air: { t0: 0.17 * T, t1: 0.42 * T, h: 0.55, feet: 'tuck' }, travel: [{ t0: 0.08 * T, t1: 0.2 * T, dist: 0.6, toTarget: true }],
    }),
  },
  {
    id: 'flash', name: 'Flash Step', jp: '一閃', gesture: 'double:up', cd: 2,
    how: 'Flick forward twice',
    build: (T) => ({
      keys: [K(0.1 * T, -0.6, 0.32, 0.28, -2.2, -0.15, -0.5, 0.2, 0.15), K(0.2 * T, 0.2, 0.5, 0.6, 0.4, 0, 0.3, 0.35, 0.12),
        K(0.28 * T, 0.95, 0.5, 0.5, 1.6, -0.05, 0.45, 0.3, 0.1), K(0.52 * T, 0.85, 0.35, 0.45, 1.2, -0.55, 0.3, 0.1, 0.05)],
      hits: [{ t: 0.27 * T, shape: 'line', width: 1.4, dmg: 1.6, knock: 0.5, fx: 'streak' }],
      air: { t0: 0.12 * T, t1: 0.27 * T, h: 0.06, feet: 'dash' }, travel: [{ t0: 0.12 * T, t1: 0.26 * T, dist: 5.5 }], iframes: [0.1 * T, 0.3 * T],
    }),
  },
  {
    id: 'splitter', name: 'Earth Splitter', jp: '地割り', gesture: 'double:down', cd: 2.5,
    how: 'Flick down twice',
    build: (T) => ({
      keys: [K(0.12 * T, 0.1, 0.75, 0.5, 0, 1.25, 0, -0.06), K(0.24 * T, 0.06, 1.05, 0.45, 0, 2.0, 0, -0.15, -0.02),
        K(0.36 * T, 0, 0.22, 0.62, 0, -0.95, 0, 0.4, 0.26), K(0.62 * T, 0, 0.2, 0.58, 0, -1.0, 0, 0.38, 0.24)],
      hits: [{ t: 0.36 * T, shape: 'ahead', len: 7, width: 1.8, dmg: 1.7, stun: 0.9, knock: 1.5, fx: 'crack', shake: 0.35 }],
      travel: [{ t0: 0.2 * T, t1: 0.36 * T, dist: 0.3 }],
      steps: [{ side: 1, t0: 0.18 * T, t1: 0.36 * T, x: 0.14, z: 0.3, yaw: 0.05, h: 0.1 }, { side: -1, t0: 0.4 * T, t1: 0.6 * T, x: -0.13, z: -0.16, yaw: -0.35, h: 0.03 }],
    }),
  },
  {
    id: 'cross', name: 'Cross Slash', jp: '十字斬り', gesture: 'double:side', cd: 1,
    how: 'Flick to one side twice',
    build: (T) => ({
      keys: [K(0.08 * T, 1.2, 0.76, 0.36, 2.3, 0.22, 0.45, -0.05), K(0.14 * T, 0.05, 0.56, 0.52, 0, -0.05, 0, 0.12, 0.05),
        K(0.2 * T, -0.95, 0.6, 0.32, -2.05, 0.12, -0.45), K(0.27 * T, 0.05, 0.58, 0.54, 0.1, 0, 0, 0.1, 0.04),
        K(0.37 * T, 1.1, 0.62, 0.4, 1.85, 0.2, 0.45, 0.05, 0.04)],
      hits: [{ t: 0.14 * T, shape: 'arc', dmg: 1.05, fx: 'spark' }, { t: 0.27 * T, shape: 'arc', dmg: 1.05, fx: 'spark' }],
      travel: [{ t0: 0.04 * T, t1: 0.27 * T, dist: 0.35, toTarget: true }],
      steps: [{ side: 1, t0: 0.03 * T, t1: 0.14 * T, x: 0.14, z: 0.2, yaw: 0.15, h: 0.05 }, { side: -1, t0: 0.16 * T, t1: 0.27 * T, x: -0.14, z: 0.05, yaw: -0.25, h: 0.05 }],
    }),
  },
];

/** The bow's own techniques: volleys rather than cuts. */
const DRAW = [K(0.1, -0.15, 0.62, 0.58, 0, 1.5, -0.35, 0, 0, OB(-0.12, 0.62, 0.5)), K(0.24, -0.15, 0.64, 0.6, 0, 1.5, -0.45, 0, 0, OB(0.45, 0.76, 0.12)),
  K(0.3, -0.15, 0.64, 0.6, 0, 1.5, -0.45, 0, 0, OB(1.3, 0.72, 0.22))];
export const BOW_TECHNIQUES = [
  { id: 'storm', name: 'Arrow Storm', jp: '矢嵐', gesture: 'circle', cd: 3, how: 'Roll a full circle',
    build: () => ({ keys: [...DRAW, K(0.72, -0.3, 0.5, 0.4, 0.1, 1.45, -0.2, 0, 0, OB(0.6, 0.6, 0.3))], hits: [{ t: 0.3, arrows: { count: 12, ring: true, dmg: 26 } }], spin: { t0: 0.3, t1: 0.68, turns: 1 }, pivot: true }) },
  { id: 'dragonArrow', name: 'Dragon Arrow', jp: '龍矢', gesture: 'half', cd: 2.5, how: 'Roll a half circle',
    build: () => ({ keys: [...DRAW, K(0.55, -0.15, 0.6, 0.55, 0, 1.5, -0.4, 0, 0, OB(1.1, 0.7, 0.25))], hits: [{ t: 0.3, arrows: { count: 1, dmg: 75, speed: 62, range: 60, pierce: true, gold: true } }], travel: [{ t0: 0.3, t1: 0.42, dist: -0.5 }] }) },
  { id: 'triple', name: 'Triple Loose', jp: '三本矢', gesture: 'double:up', cd: 1.5, how: 'Flick forward twice',
    build: () => ({ keys: [...DRAW, K(0.5, -0.15, 0.6, 0.55, 0, 1.5, -0.4, 0, 0, OB(1.1, 0.7, 0.25))], hits: [{ t: 0.3, arrows: { count: 3, spread: 0.22, dmg: 34 } }] }) },
];

/** How fast this weapon moves relative to the katana (techniques keep the weapon's tempo). */
export function tempoOf(rig) {
  const h = rig.moves?.cutL?.hit;
  return h ? Math.min(1.9, Math.max(0.55, h / 0.253)) : 1;
}

/** Techniques available to a weapon, with its local names. */
export function techniquesFor(weaponId, rig) {
  if (weaponId === 'yumi') return BOW_TECHNIQUES;
  if (!rig?.moves) return [];
  const local = LOCAL[weaponId] ?? {};
  return TECHNIQUES.map((t) => ({ ...t, ...(local[t.id] ?? {}) }));
}

/**
 * Pick the technique for a gesture: the most specific one whose string of preceding strikes
 * matches (so the tree rewards longer chains), that isn't cooling down and whose flow is met.
 */
export function pickTechnique(list, gesture, history, flow, cooldowns) {
  const g = gesture.startsWith('double:') && (gesture.endsWith('left') || gesture.endsWith('right')) ? 'double:side' : gesture;
  const cands = list.filter((t) => t.gesture === g && (cooldowns[t.id] ?? 0) <= 0 && (t.minFlow ?? 0) <= flow && (!t.after || t.after(history)));
  cands.sort((a, b) => (b.after ? 1 : 0) - (a.after ? 1 : 0));
  return cands[0] ?? null;
}

/** For weapons whose off hand tracks its own path (twin claws), mirror it from the main hand. */
export function withOffHand(keys, rig) {
  if (rig.off !== 'track') return keys;
  return keys.map((k) => (k.O ? k : { ...k, O: OB(-k.y * 0.7 - 0.25, k.h, k.r * 0.9, -k.ty * 0.6, k.tp) }));
}
