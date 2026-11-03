// Weapon choreography. Every weapon has a resting guard ("carry") and 2-3 attack variants
// that cycle while you mash attack (forehand, backhand, rising, overhead, thrust...).
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
 * the handle), 'track' (explicit O channels) or 'free' (left to the walk cycle);
 * mount: how far up the weapon the hand sits; face: 'sweep' (edge leads the swing) or 'forward'.
 */
export const WEAPON_RIGS = {
  katana: {
    main: 'R', off: 'grip', spacing: 0.2, mount: 0.06, face: 'sweep',
    carry: K(0, 0.25, 0.3, 0.36, 0.05, 0.6),
    variants: [
      { name: 'forehand cut', hitAt: 0.44, keys: [K(0.26, 1.2, 0.84, 0.3, 2.3, 0.3, 0.45, -0.05), K(0.44, 0.05, 0.56, 0.52, 0, -0.05, 0, 0.12, 0.05), K(0.6, -0.85, 0.36, 0.32, -1.6, -0.4, -0.4, 0.15, 0.08)] },
      { name: 'backhand sweep', hitAt: 0.44, keys: [K(0.24, -0.95, 0.6, 0.32, -2.05, 0.12, -0.45), K(0.44, 0.05, 0.58, 0.54, 0.1, 0, 0, 0.1, 0.04), K(0.62, 1.1, 0.62, 0.4, 1.85, 0.2, 0.45, 0.05, 0.04)] },
      { name: 'rising cut', hitAt: 0.44, keys: [K(0.25, -0.4, 0.26, 0.3, -1.15, -0.7, -0.3, 0.1, 0.1), K(0.44, 0.1, 0.5, 0.52, 0.1, 0.15, 0, 0.05, 0.04), K(0.6, 1.1, 0.82, 0.42, 1.75, 0.7, 0.3, -0.06)] },
    ],
  },
  odachi: {
    main: 'R', off: 'grip', spacing: 0.32, mount: 0.06, face: 'sweep',
    carry: K(0, 0.4, 0.34, 0.44, 0.3, 0.8),
    variants: [
      { name: 'overhead cleave', hitAt: 0.58, keys: [K(0.38, 0.2, 1.2, 0.3, 3.0, 1.38, 0, -0.15), K(0.58, 0, 0.52, 0.62, 0, -0.3, 0, 0.25, 0.12), K(0.74, 0, 0.2, 0.5, 0, -0.95, 0, 0.3, 0.14)] },
      { name: 'wide sweep', hitAt: 0.56, keys: [K(0.35, 1.15, 0.58, 0.3, 2.2, 0.15, 0.55, 0, 0.05), K(0.56, 0.05, 0.55, 0.62, 0, -0.05, 0, 0.1, 0.08), K(0.74, -1.0, 0.5, 0.34, -2.05, -0.1, -0.6, 0.1, 0.08)] },
      { name: 'rising cleave', hitAt: 0.56, keys: [K(0.35, -0.4, 0.26, 0.32, -1.3, -0.7, -0.35, 0.1, 0.12), K(0.56, 0.1, 0.52, 0.62, 0.1, 0.2, 0, 0.05, 0.05), K(0.74, 1.15, 0.85, 0.42, 1.8, 0.7, 0.3, -0.1)] },
    ],
  },
  kanabo: {
    main: 'R', off: 'grip', spacing: 0.22, mount: 0.15, face: 'sweep',
    carry: K(0, 0.7, 0.55, 0.24, 2.4, 0.85),
    variants: [
      { name: 'overhead smash', hitAt: 0.6, keys: [K(0.4, 0.2, 1.2, 0.36, 3.0, 1.38, 0, -0.15), K(0.6, 0, 0.5, 0.58, 0, -0.45, 0, 0.3, 0.15), K(0.76, 0, 0.2, 0.52, 0, -1.05, 0, 0.32, 0.16)] },
      { name: 'home-run swing', hitAt: 0.58, keys: [K(0.38, 1.15, 0.62, 0.28, 2.25, 0.3, 0.6, 0, 0.06), K(0.58, 0, 0.55, 0.55, 0, 0, 0, 0.1, 0.1), K(0.76, -1.0, 0.55, 0.34, -2.15, 0.1, -0.7, 0.05, 0.08)] },
      { name: 'low sweep', hitAt: 0.58, keys: [K(0.36, 1.0, 0.4, 0.32, 1.85, -0.3, 0.5, 0.2, 0.14), K(0.58, 0, 0.36, 0.58, 0, -0.45, 0, 0.3, 0.16), K(0.76, -0.9, 0.38, 0.32, -1.95, -0.4, -0.6, 0.25, 0.14)] },
    ],
  },
  naginata: {
    main: 'R', off: 'grip', spacing: 0.34, mount: 0.8, face: 'sweep',
    carry: K(0, 0.6, 0.38, 0.55, 0.1, 0.5),
    variants: [
      { name: 'thrust', hitAt: 0.44, keys: [K(0.3, 0.75, 0.46, 0.42, 0.05, 0.08, 0.2, -0.05), K(0.44, 0.35, 0.5, 0.65, 0, 0, -0.1, 0.2, 0.06), K(0.6, 0.35, 0.5, 0.62, 0, 0, -0.1, 0.2, 0.06)] },
      { name: 'wide sweep', hitAt: 0.46, keys: [K(0.3, 0.9, 0.5, 0.52, 1.5, 0.25, 0.45), K(0.46, 0.3, 0.45, 0.62, 0, 0.1, 0, 0.1, 0.05), K(0.62, -0.3, 0.42, 0.55, -1.45, 0.05, -0.5, 0.1, 0.05)] },
      { name: 'rising slash', hitAt: 0.46, keys: [K(0.3, 0.5, 0.3, 0.5, -0.4, -0.55, -0.3, 0.1, 0.08), K(0.46, 0.4, 0.45, 0.62, 0.05, 0.25, 0, 0.05), K(0.62, 0.95, 0.75, 0.5, 1.5, 0.8, 0.3, -0.05)] },
    ],
  },
  wakizashi: {
    main: 'R', off: 'free', mount: 0.05, face: 'sweep',
    carry: K(0, 0.6, 0.35, 0.34, 0.35, 0.35),
    variants: [
      { name: 'forehand slash', hitAt: 0.42, keys: [K(0.22, 1.25, 0.68, 0.3, 2.1, 0.25, 0.4), K(0.42, 0.1, 0.55, 0.53, 0.05, -0.05, 0, 0.1, 0.04), K(0.6, -0.9, 0.45, 0.4, -1.6, -0.2, -0.35, 0.1, 0.04)] },
      { name: 'backhand slash', hitAt: 0.42, keys: [K(0.22, -0.6, 0.6, 0.32, -1.65, 0.15, -0.4), K(0.42, 0.2, 0.55, 0.53, 0.2, 0, 0, 0.08), K(0.6, 1.2, 0.6, 0.42, 2.0, 0.2, 0.4)] },
      { name: 'quick thrust', hitAt: 0.42, keys: [K(0.25, 0.9, 0.45, 0.25, 0.1, 0, 0.2), K(0.42, 0.25, 0.52, 0.62, 0, 0, -0.1, 0.15, 0.05), K(0.6, 0.25, 0.52, 0.6, 0, 0, -0.1, 0.15, 0.05)] },
    ],
  },
  tessen: {
    main: 'R', off: 'free', mount: 0.06, face: 'sweep',
    carry: K(0, 0.6, 0.4, 0.32, 0.5, 0.7),
    variants: [
      { name: 'fan sweep', hitAt: 0.45, keys: [K(0.22, 1.3, 0.6, 0.32, 2.2, 0.1, 0.5), K(0.45, 0, 0.55, 0.55, 0, 0, 0, 0.05), K(0.65, -1.0, 0.55, 0.32, -2.1, 0.1, -0.5)] },
      { name: 'return sweep', hitAt: 0.45, keys: [K(0.22, -0.9, 0.55, 0.3, -1.9, 0.1, -0.5), K(0.45, 0.1, 0.55, 0.55, 0.1, 0), K(0.65, 1.3, 0.6, 0.4, 2.1, 0.2, 0.5)] },
      { name: 'rising flick', hitAt: 0.45, keys: [K(0.25, 0.3, 0.25, 0.38, 0.3, -0.8, -0.6, 0.1, 0.08), K(0.45, 0.1, 0.6, 0.55, 0, 0.3), K(0.65, 1.1, 0.85, 0.42, 1.7, 0.75, 0.5, -0.1)] },
    ],
  },
  tekkokagi: {
    main: 'R', off: 'track', mount: 0, face: 'sweep',
    carry: K(0, 0.35, 0.55, 0.32, 0.1, 0.3, 0, 0, 0, O(-0.35, 0.55, 0.32, -0.1, 0.3)),
    variants: [
      { name: 'right jab', hitAt: 0.32, keys: [K(0.15, 0.35, 0.56, 0.25, 0.1, 0.2, 0.25, 0, 0, O(-0.35, 0.6, 0.3, -0.1, 0.4)), K(0.32, 0.08, 0.58, 0.62, 0, 0, -0.35, 0.15, 0.03, O(-0.4, 0.55, 0.28, -0.2, 0.3)), K(0.55, 0.2, 0.56, 0.45, 0.05, 0.1, -0.2, 0.1, 0, O(-0.35, 0.58, 0.3, -0.1, 0.35))] },
      { name: 'left jab', hitAt: 0.32, keys: [K(0.15, 0.4, 0.6, 0.3, 0.1, 0.4, -0.25, 0, 0, O(-0.3, 0.55, 0.25, -0.1, 0.2)), K(0.32, 0.4, 0.55, 0.28, 0.2, 0.3, 0.35, 0.15, 0.03, O(-0.08, 0.58, 0.62, 0, 0)), K(0.55, 0.35, 0.58, 0.3, 0.1, 0.35, 0.2, 0.1, 0, O(-0.2, 0.56, 0.45, -0.05, 0.1))] },
      { name: 'hook swipe', hitAt: 0.38, keys: [K(0.2, 1.0, 0.6, 0.35, 1.45, 0.1, 0.45, 0, 0, O(-0.35, 0.6, 0.3, -0.1, 0.4)), K(0.38, 0, 0.58, 0.55, 0, 0, 0, 0.12, 0.04, O(-0.4, 0.58, 0.28, -0.1, 0.35)), K(0.56, -0.8, 0.55, 0.4, -1.25, 0, -0.45, 0.1, 0.03, O(-0.3, 0.6, 0.3, -0.1, 0.4))] },
    ],
  },
  kusarigama: {
    main: 'R', off: 'free', mount: 0.15, face: 'sweep',
    carry: K(0, 0.55, 0.35, 0.3, 0.35, 0.6),
    variants: [
      { name: 'whirl and fling', hitAt: 0.5, keys: [K(0.15, 0.85, 1.12, 0.3, 1.9, 0.45, 0, -0.1), K(0.28, -0.2, 1.16, 0.3, -1.4, 0.45, 0, -0.1), K(0.4, 0.85, 1.12, 0.3, 1.9, 0.45), K(0.5, 0.15, 0.6, 0.6, 0, 0, -0.1, 0.15, 0.05), K(0.68, 0.15, 0.55, 0.55, 0, -0.1)] },
      { name: 'side fling', hitAt: 0.5, keys: [K(0.25, 1.2, 0.55, 0.3, 2.0, 0, 0.5), K(0.5, 0.05, 0.55, 0.58, 0, 0, 0, 0.1), K(0.68, -0.6, 0.5, 0.45, -1.0, 0, -0.4)] },
    ],
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

// ---------------------------------------------------------------------------- track sampling
const CH = ['y', 'h', 'r', 'ty', 'tp', 'tw', 'ln', 'cr'];
const OCH = ['y', 'h', 'r', 'ty', 'tp'];
function catmull(p0, p1, p2, p3, u) {
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}
/** Sample a keyframe list at time t (0..1) with Catmull-Rom interpolation. */
export function sample(keys, t, out = {}) {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const u = Math.min(1, Math.max(0, (t - k1.t) / Math.max(1e-4, k2.t - k1.t)));
  for (const c of CH) out[c] = catmull(k0[c], k1[c], k2[c], k3[c], u);
  if (k1.O || k2.O) {
    const o0 = k0.O ?? k1.O ?? k2.O, o1 = k1.O ?? k2.O, o2 = k2.O ?? k1.O, o3 = k3.O ?? k2.O ?? k1.O;
    out.O ??= {};
    for (const c of OCH) out.O[c] = catmull(o0[c], o1[c], o2[c], o3[c], u);
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
const _e = new THREE.Euler();

/**
 * Two-bone IK for one arm (shoulder -> elbow -> hand), all in torso space.
 * pole: rough direction the elbow should point. Returns the hand position actually reached.
 */
export function solveArm(arm, target, a, b, pole, out = new THREE.Vector3()) {
  const S = arm.shoulder.position;
  _d.subVectors(target, S);
  let d = _d.length();
  d = Math.min(a + b - 1e-3, Math.max(Math.abs(a - b) + 1e-3, d));
  _d.normalize();
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const alpha = Math.acos(Math.min(1, Math.max(-1, cosA)));
  const cosG = (a * a + b * b - d * d) / (2 * a * b);
  const gamma = Math.acos(Math.min(1, Math.max(-1, cosG)));
  // bend plane: away from the pole direction perpendicular to the reach line
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-6) _p.set(0, -1, 0).addScaledVector(_d, _d.y);
  _p.normalize();
  _u.copy(_d).multiplyScalar(Math.cos(alpha)).addScaledVector(_p, Math.sin(alpha)).normalize();   // upper arm
  const elbowPos = _w.copy(S).addScaledVector(_u, a);
  _f.copy(S).addScaledVector(_d, d).sub(elbowPos).normalize();                                     // forearm
  // shoulder basis: local -y -> upper arm, local +z -> the side the forearm bends toward
  _y.copy(_u).negate();
  _z.copy(_f).addScaledVector(_u, -_f.dot(_u));
  if (_z.lengthSq() < 1e-6) _z.copy(_d).cross(_y);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  arm.shoulder.quaternion.setFromRotationMatrix(_m);
  arm.elbow.rotation.set(-(Math.PI - gamma), 0, 0);
  return out.copy(S).addScaledVector(_d, d);
}

/** Orient a grip (child of a hand) so the weapon's +y points along `tip` and +z along `face`. */
export function orientGrip(arm, grip, tip, face) {
  _y.copy(tip).normalize();
  _z.copy(face).addScaledVector(_y, -face.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z);
  _q.setFromRotationMatrix(_m);                                   // weapon orientation in torso space
  _qe.setFromEuler(_e.set(arm.elbow.rotation.x, arm.elbow.rotation.y, arm.elbow.rotation.z));
  const handQ = arm.shoulder.quaternion.clone().multiply(_qe);    // hand orientation in torso space
  grip.quaternion.copy(handQ.invert().multiply(_q));
}

const _hand = new THREE.Vector3(), _tip = new THREE.Vector3(), _tip2 = new THREE.Vector3(), _face = new THREE.Vector3(), _sweep = new THREE.Vector3();
const _offT = new THREE.Vector3(), _pole = new THREE.Vector3(), _reached = new THREE.Vector3(), _tmp = {}, _tmp2 = {};

/**
 * Pose the arms and weapon for `rig` at attack time t (0..1) of `variant`, or the carry pose
 * when variant is null. state keeps the last blade facing so it never flips.
 */
export function poseWeapon(parts, rig, variant, t, grips, state) {
  const track = variant ? attackTrack(rig, variant) : null;
  const P = track ? sample(track, t, _tmp) : rig.carry;
  const mainArm = rig.main === 'L' ? parts.armL : parts.armR;
  const offArm = rig.main === 'L' ? parts.armR : parts.armL;
  const { upper: a, lower: b } = parts.armLen;
  // body
  parts.torso.rotation.y += P.tw;
  parts.torso.rotation.x += P.ln;
  parts.hips.position.y -= P.cr;
  if (P.cr > 0.02) {           // a lunging stance
    const s = P.cr * 2.6;
    parts.legR.hip.rotation.x -= s; parts.legL.hip.rotation.x += s * 0.6;
    parts.legR.knee.rotation.x += s * 0.8; parts.legL.knee.rotation.x += s * 0.5;
  }
  // main hand
  handPos(P.y, P.h, P.r, _hand);
  dirFrom(P.ty, P.tp, _tip);
  const side = rig.main === 'L' ? -1 : 1;
  _pole.set(side * 0.7, -1, -0.35);
  solveArm(mainArm, _hand, a, b, _pole, _reached);
  // blade facing: normal of the swing plane so the edge leads; steady when not swinging
  if (rig.face === 'forward') _face.set(0, 0, 1);
  else {
    if (track) { const Q = sample(track, Math.min(1, t + 0.02), _tmp2); dirFrom(Q.ty, Q.tp, _tip2); _sweep.subVectors(_tip2, _tip); }
    else _sweep.set(0, 0, 0);
    if (_sweep.lengthSq() > 1e-5) _face.crossVectors(_tip, _sweep).normalize();
    else _face.crossVectors(_tip, _y.set(-side, 0, 0)).normalize();
    if (state.face && _face.dot(state.face) < 0) _face.negate();
  }
  state.face = (state.face ?? new THREE.Vector3()).copy(_face);
  orientGrip(mainArm, grips.main, _tip, _face);
  // off hand
  if (rig.off === 'grip') {
    _offT.copy(_reached).addScaledVector(_tip, -rig.spacing);
    solveArm(offArm, _offT, a, b, _pole.set(-side * 0.7, -1, -0.35));
  } else if (P.O) {
    handPos(P.O.y, P.O.h, P.O.r, _offT);
    solveArm(offArm, _offT, a, b, _pole.set(-side * 0.7, -1, -0.35));
    if (grips.off) orientGrip(offArm, grips.off, dirFrom(P.O.ty, P.O.tp, _tip2), _face);
  }
}
