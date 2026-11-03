// Procedural humanoid rig built from smooth primitives. One builder serves the samurai,
// skeletons, zombies, witches, vampires and demons through a spec of proportions/colours.
// Animation is procedural (walk cycle, breathing, per-weapon attack poses).
import * as THREE from 'three';

const mats = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts }));
  return mats.get(key);
}

function capsule(r, len, m, segs = 8) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, segs), m);
  mesh.castShadow = true;
  return mesh;
}
function sphere(r, m, w = 12, h = 10) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, w, h), m); s.castShadow = true; return s; }
function box(w, h, d, m) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.castShadow = true; return b; }

/**
 * @param spec {
 *   scale, bulk, legLen, armLen, skin, top, bottom, hair, hat: 'kasa'|'witch'|'horns'|'none',
 *   cape, skull, hunch, transparent, emissiveEyes
 * }
 */
export function buildHumanoid(spec) {
  const S = {
    scale: 1, bulk: 1, legLen: 0.78, armLen: 0.62, skin: 0xe8c39e, top: 0x3b4a6b, bottom: 0x2a2a33, hair: 0x1a1410, hat: 'none',
    cape: null, skull: false, hunch: 0, opacity: 1, eyes: null, sleeves: true, ...spec,
  };
  const opts = S.opacity < 1 ? { transparent: true, opacity: S.opacity, depthWrite: false } : {};
  const skin = mat(S.skin, opts), top = mat(S.top, opts), bottom = mat(S.bottom, opts), hair = mat(S.hair, opts);

  const root = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = S.legLen + 0.22;
  root.add(hips);
  const parts = { root, hips };

  // Legs
  const mkLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.13 * S.bulk, -0.05, 0);
    const upper = capsule(0.1 * S.bulk, S.legLen * 0.42, bottom); upper.position.y = -S.legLen * 0.25; hip.add(upper);
    const knee = new THREE.Group(); knee.position.y = -S.legLen * 0.5; hip.add(knee);
    const lower = capsule(0.085 * S.bulk, S.legLen * 0.42, S.skull ? skin : bottom); lower.position.y = -S.legLen * 0.25; knee.add(lower);
    const foot = box(0.14, 0.08, 0.26, mat(S.skull ? S.skin : 0x1a1410, opts)); foot.position.set(0, -S.legLen * 0.5, 0.06); knee.add(foot);
    hips.add(hip);
    return { hip, knee };
  };
  parts.legL = mkLeg(-1); parts.legR = mkLeg(1);

  // Torso (kimono / armour) + obi
  const torso = new THREE.Group();
  torso.rotation.x = S.hunch;
  hips.add(torso);
  const chest = capsule(0.21 * S.bulk, 0.36, top, 10); chest.position.y = 0.36; chest.scale.set(1.15, 1, 0.8); torso.add(chest);
  const belly = capsule(0.2 * S.bulk, 0.1, top, 10); belly.position.y = 0.14; belly.scale.set(1.1, 1, 0.8); torso.add(belly);
  const obi = box(0.5 * S.bulk, 0.12, 0.36, mat(S.obi ?? 0x8a1c1c, opts)); obi.position.y = 0.12; torso.add(obi);
  parts.torso = torso;
  if (S.cape) {
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.6 * S.bulk, 0.95, 1, 4), mat(S.cape, { side: THREE.DoubleSide, ...opts }));
    cape.position.set(0, 0.56, -0.2); cape.rotation.x = 0.15; cape.castShadow = true;
    torso.add(cape); parts.cape = cape;
  }

  // Head
  const neck = new THREE.Group(); neck.position.y = 0.72; torso.add(neck);
  const head = sphere(0.16, skin, 14, 12); head.position.y = 0.15; head.scale.set(1, 1.1, 1); neck.add(head);
  parts.head = neck;
  if (S.skull) {
    const eyeM = mat(0x111111, opts);
    for (const sx of [-1, 1]) { const e = sphere(0.045, eyeM, 6, 5); e.position.set(sx * 0.06, 0.17, 0.13); neck.add(e); }
    const jaw = box(0.16, 0.06, 0.12, skin); jaw.position.set(0, 0.03, 0.06); neck.add(jaw);
  } else {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.165, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair); cap.position.y = 0.17; cap.scale.set(1.02, 1.05, 1.02); neck.add(cap);
    if (S.topknot) { const t = sphere(0.06, hair, 8, 6); t.position.set(0, 0.34, -0.03); t.scale.set(1, 0.7, 1.4); neck.add(t); }
  }
  if (S.eyes) {
    const eyeM = new THREE.MeshBasicMaterial({ color: S.eyes });
    for (const sx of [-1, 1]) { const e = sphere(0.035, eyeM, 6, 5); e.position.set(sx * 0.06, 0.17, 0.14); neck.add(e); }
  }
  if (S.hat === 'kasa') {
    const kasa = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.2, 16, 1, true), mat(0xc8a265, { side: THREE.DoubleSide, roughness: 1 }));
    kasa.position.y = 0.34; kasa.castShadow = true; neck.add(kasa);
  } else if (S.hat === 'witch') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 16), mat(0x14101a, opts)); brim.position.y = 0.28; neck.add(brim);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.55, 12), mat(0x14101a, opts)); cone.position.y = 0.55; cone.rotation.z = 0.12; neck.add(cone);
  } else if (S.hat === 'horns') {
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 8), mat(0x1d1210)); horn.position.set(sx * 0.12, 0.3, 0); horn.rotation.z = -sx * 0.5; neck.add(horn);
    }
  } else if (S.hat === 'helmet') {
    const kabuto = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat(0x2d2d33, { metalness: 0.5, roughness: 0.4 })); kabuto.position.y = 0.18; neck.add(kabuto);
    const crest = box(0.02, 0.22, 0.1, mat(0xd4a84b, { metalness: 0.7, roughness: 0.3 })); crest.position.set(0, 0.4, 0.05); neck.add(crest);
  }

  // Arms
  const mkArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.27 * S.bulk, 0.64, 0);
    const upper = capsule(0.07 * S.bulk, S.armLen * 0.4, S.sleeves ? top : skin); upper.position.y = -S.armLen * 0.25; shoulder.add(upper);
    if (S.pauldron) { const p = sphere(0.12 * S.bulk, mat(S.pauldron, opts), 10, 8); p.position.y = 0.02; p.scale.set(1, 0.7, 1); shoulder.add(p); }
    const elbow = new THREE.Group(); elbow.position.y = -S.armLen * 0.5; shoulder.add(elbow);
    const fore = capsule(0.06 * S.bulk, S.armLen * 0.4, skin); fore.position.y = -S.armLen * 0.25; elbow.add(fore);
    const hand = new THREE.Group(); hand.position.y = -S.armLen * 0.52; elbow.add(hand);
    const palm = sphere(0.065 * S.bulk, skin, 8, 6); hand.add(palm);
    torso.add(shoulder);
    return { shoulder, elbow, hand };
  };
  parts.armL = mkArm(-1); parts.armR = mkArm(1);
  parts.height = (S.legLen + 0.22 + 0.72 + 0.35);
  root.scale.setScalar(S.scale);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return parts;
}

/**
 * Procedural animation state machine. `anim` is mutable per-entity state.
 * pose: optional function (t, parts, out) from the weapon style, applied over the base pose.
 */
export function animateHumanoid(parts, anim, dt, pose) {
  const { speed = 0, attackT = -1, attackDur = 0.5, hurt = 0, dead = false } = anim;
  anim.phase = (anim.phase ?? 0) + dt * (4 + speed * 9);
  anim.breath = (anim.breath ?? 0) + dt * 2.2;
  const ph = anim.phase, s = THREE.MathUtils.clamp(speed, 0, 1);
  const legAmp = 0.75 * s, armAmp = 0.45 * s;
  const L = parts.legL, R = parts.legR, AL = parts.armL, AR = parts.armR;
  L.hip.rotation.x = Math.sin(ph) * legAmp;
  R.hip.rotation.x = Math.sin(ph + Math.PI) * legAmp;
  L.knee.rotation.x = Math.max(0, -Math.sin(ph - 0.6)) * legAmp * 1.2;
  R.knee.rotation.x = Math.max(0, -Math.sin(ph + Math.PI - 0.6)) * legAmp * 1.2;
  AL.shoulder.rotation.x = Math.sin(ph + Math.PI) * armAmp;
  AR.shoulder.rotation.x = Math.sin(ph) * armAmp;
  AL.shoulder.rotation.z = 0.12; AR.shoulder.rotation.z = -0.12;
  AL.elbow.rotation.x = -0.3 - Math.max(0, Math.sin(ph + Math.PI)) * 0.4 * s;
  AR.elbow.rotation.x = -0.3 - Math.max(0, Math.sin(ph)) * 0.4 * s;
  parts.hips.position.y = parts.hips.userData.baseY ?? (parts.hips.userData.baseY = parts.hips.position.y);
  parts.hips.position.y += Math.abs(Math.sin(ph)) * 0.05 * s + Math.sin(anim.breath) * 0.008;
  parts.torso.rotation.x = (anim.hunch ?? 0) + s * 0.12 + Math.sin(anim.breath) * 0.01;
  parts.torso.rotation.y = Math.sin(ph) * 0.06 * s;
  parts.head.rotation.x = -s * 0.1;
  parts.head.rotation.y = 0;
  AR.hand.rotation.set(0, 0, 0); AL.hand.rotation.set(0, 0, 0);
  if (parts.cape) parts.cape.rotation.x = 0.15 + s * 0.6 + Math.sin(anim.breath * 2) * 0.05;
  // Attack pose overrides arms/torso
  if (attackT >= 0 && pose) {
    const t = THREE.MathUtils.clamp(attackT / attackDur, 0, 1);
    pose(t, parts, anim);
  }
  if (hurt > 0) { parts.torso.rotation.x -= hurt * 0.4; parts.head.rotation.x -= hurt * 0.3; }
  if (dead) return;
}

/** Easing helpers for poses. */
export const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  inOut: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  pulse: (t, a, b) => t < a ? t / a : t < b ? 1 : 1 - (t - b) / (1 - b),
};
