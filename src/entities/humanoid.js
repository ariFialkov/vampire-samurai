// Procedural humanoid rig. The samurai and the humanoid monsters (skeleton, zombie, witch,
// vampire, demon) share one bone layout so they share the procedural animation, but each is
// dressed from detailed primitives: hakama, wide kimono sleeves, layered armour, faces,
// ribcages, capes... merged per bone by Parts, so detail doesn't cost draw calls.
import * as THREE from 'three';
import { Parts, G } from './parts.js';

const mats = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts }));
  return mats.get(key);
}

/** Pleated, flared trouser leg (hakama) or robe skirt: lathe with vertical folds. */
function pleated(rTop, rBottom, h, folds = 10, depth = 0.012, ragged = 0) {
  const prof = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; prof.push([rBottom + (rTop - rBottom) * Math.pow(t, 1.2), -h + t * h]); }
  const g = G.lathe(prof, 28);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
    const a = Math.atan2(z, x), r = Math.hypot(x, z);
    const t = (y + h) / h;                                   // 0 at hem, 1 at top
    let nr = r + Math.sin(a * folds) * depth * (1.2 - t);
    let ny = y;
    if (ragged && t < 0.05) ny += (Math.sin(a * 7.3) * 0.5 + 0.5) * ragged + Math.abs(Math.sin(a * 13.1)) * ragged * 0.6;
    p.setXYZ(i, Math.cos(a) * nr, ny, Math.sin(a) * nr);
  }
  g.computeVertexNormals();
  return g;
}

export function buildHumanoid(spec) {
  const S = {
    scale: 1, bulk: 1, legLen: 0.8, armLen: 0.62, skin: 0xe8c39e, top: 0x3b4a6b, bottom: 0x2a2a33, hair: 0x1a1410, hat: 'none',
    obi: 0x8a1c1c, collar: 0xf0ebe0, kind: 'samurai', hunch: 0, opacity: 1, eyes: null, ...spec,
  };
  const B = S.bulk, L = S.legLen, A = S.armLen;
  const P = new Parts();
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = L + 0.13; root.add(hips);
  const parts = { root, hips };
  const bones = S.kind === 'skeleton';
  const robe = S.kind === 'witch';

  // ---------------------------------------------------------------- legs
  const mkLeg = (side) => {
    const hip = new THREE.Group(); hip.position.set(side * 0.12 * B, -0.05, 0); hips.add(hip);
    const knee = new THREE.Group(); knee.position.y = -L * 0.5; hip.add(knee);
    if (bones) {
      P.add(hip, G.capsule(0.032, L * 0.42, 8), S.skin, { p: [0, -L * 0.25, 0] });
      P.add(knee, G.sphere(0.05, 10, 8), S.skin);
      P.add(knee, G.capsule(0.028, L * 0.42, 8), S.skin, { p: [0, -L * 0.25, 0] });
      P.add(knee, G.capsule(0.022, L * 0.38, 6), S.skin, { p: [0.03, -L * 0.25, 0.01] });   // fibula
      P.add(knee, G.box(0.08, 0.035, 0.2), S.skin, { p: [0, -L * 0.5 - 0.035, 0.05] });
      for (let k = 0; k < 4; k++) P.add(knee, G.capsule(0.01, 0.05, 4), S.skin, { p: [-0.03 + k * 0.02, -L * 0.5 - 0.04, 0.17], r: [Math.PI / 2, 0, 0] });
    } else if (robe) {
      P.add(hip, G.capsule(0.08, L * 0.4, 8), S.bottom, { p: [0, -L * 0.25, 0] });
      P.add(knee, G.capsule(0.065, L * 0.4, 8), S.bottom, { p: [0, -L * 0.25, 0] });
      P.add(knee, G.capsule(0.055, 0.14, 8), 0x1a1410, { p: [0, -L * 0.5 - 0.02, 0.06], r: [Math.PI / 2, 0, 0] });
    } else if (S.kind === 'samurai') {
      // wide pleated hakama, tabi socks and straw waraji sandals
      P.add(hip, pleated(0.12 * B, 0.2 * B, L * 0.52, 8, 0.014), S.bottom, { p: [0, 0.02, 0] });
      P.add(knee, pleated(0.2 * B, 0.25 * B, L * 0.47, 8, 0.016), S.bottom, { p: [0, 0.02, 0] });
      P.add(knee, G.capsule(0.06, 0.1, 10), 0xf4f1ea, { p: [0, -L * 0.5 + 0.02, 0.01] });
      P.add(knee, G.capsule(0.055, 0.14, 10), 0xf4f1ea, { p: [0, -L * 0.5 - 0.03, 0.06], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.7] });
      P.add(knee, G.box(0.13, 0.025, 0.28), 0xc8a265, { p: [0, -L * 0.5 - 0.075, 0.05] });
      P.add(knee, G.torus(0.05, 0.008, Math.PI, 6, 10), 0x8a6a44, { p: [0, -L * 0.5 - 0.04, 0.06], r: [0, 0, 0] });
    } else {
      // trousers (zombie, vampire, demon)
      P.add(hip, G.capsule(0.095 * B, L * 0.42, 10), S.bottom, { p: [0, -L * 0.25, 0] });
      P.add(knee, G.capsule(0.08 * B, L * 0.42, 10), S.kind === 'demon' ? S.skin : S.bottom, { p: [0, -L * 0.25, 0] });
      if (S.kind === 'zombie') P.add(knee, pleated(0.1, 0.11, 0.1, 5, 0.01, 0.04), S.bottom, { p: [0, -L * 0.08, 0] });
      if (S.kind === 'demon') { for (let k = -1; k <= 1; k++) P.add(knee, G.cone(0.025, 0.09, 6), 0xd8cfc0, { p: [k * 0.04, -L * 0.5 - 0.05, 0.16], r: [Math.PI / 2, 0, 0] }); P.add(knee, G.box(0.14, 0.07, 0.22), S.skin, { p: [0, -L * 0.5 - 0.04, 0.05] }); }
      else P.add(knee, G.box(0.12, 0.08, 0.26), 0x1a1410, { p: [0, -L * 0.5 - 0.04, 0.05] });
    }
    return { hip, knee };
  };
  parts.legL = mkLeg(-1); parts.legR = mkLeg(1);

  // ---------------------------------------------------------------- torso
  const torso = new THREE.Group(); hips.add(torso);
  parts.torso = torso;
  if (bones) {
    // pelvis, vertebrae, ribcage, sternum, clavicles
    P.add(hips, G.torus(0.12, 0.03, Math.PI * 1.4, 6, 14), S.skin, { p: [0, 0, 0], r: [Math.PI / 2, 0, Math.PI * 0.8], s: [1.2, 1, 0.8] });
    for (let k = 0; k < 9; k++) P.add(torso, G.cyl(0.03, 0.035, 0.05, 8), S.skin, { p: [0, 0.04 + k * 0.065, -0.06] });
    for (let k = 0; k < 6; k++) {
      const y = 0.28 + k * 0.055, r = 0.15 - Math.abs(k - 2) * 0.012;
      P.add(torso, G.torus(r, 0.013, Math.PI * 1.55, 5, 18), S.skin, { p: [0, y, 0.0], r: [Math.PI / 2, 0, -Math.PI * 0.725 + Math.PI / 2], s: [1.15, 0.85, 1] });
    }
    P.add(torso, G.box(0.04, 0.24, 0.025), S.skin, { p: [0, 0.4, 0.13] });
    for (const s of [-1, 1]) P.add(torso, G.capsule(0.016, 0.16, 5), S.skin, { p: [s * 0.1, 0.6, 0.05], r: [0, 0, s * 1.45] });
    P.add(torso, G.box(0.18, 0.1, 0.05), 0x5a4a3a, { p: [0, -0.05, 0.08] });     // rag of a loincloth
  } else {
    // kimono body: lathe from waist to shoulders, flattened front-to-back
    const body = G.lathe([[0.17, -0.02], [0.19, 0.12], [0.215, 0.32], [0.225, 0.5], [0.2, 0.6], [0.12, 0.68], [0.05, 0.7]], 22);
    P.add(torso, body, S.top, { s: [1.18 * B, 1, 0.82 * B] });
    if (S.kind === 'samurai' || S.kind === 'zombie') {
      // crossed collar: white under-collar (juban) and the kimono's own collar band
      for (const s of [-1, 1]) {
        P.add(torso, G.box(0.05, 0.36, 0.02), S.collar, { p: [s * 0.055, 0.5, 0.165 * B], r: [-0.12, 0, s * 0.42] });
        P.add(torso, G.box(0.055, 0.42, 0.022), S.kind === 'zombie' ? 0x2e2924 : 0x1d1a24, { p: [s * 0.085, 0.47, 0.17 * B], r: [-0.12, 0, s * 0.45] });
      }
      P.add(torso, G.cyl(0.215 * B, 0.215 * B, 0.13, 22, true), S.obi, { p: [0, 0.12, 0], s: [1.15, 1, 0.85] });     // obi sash
      P.add(torso, G.box(0.18, 0.1, 0.07), S.obi, { p: [0, 0.12, -0.19 * B] });                                // knot at the back
      P.add(torso, G.box(0.03, 0.15, 0.03), 0x2a2018, { p: [-0.15 * B, 0.11, 0.15 * B], r: [0.3, 0, 0.2] });     // tucked saya end
    }
    if (S.kind === 'zombie') {
      P.add(torso, pleated(0.21, 0.23, 0.2, 7, 0.012, 0.06), S.top, { p: [0, 0.05, 0], s: [1.15, 1, 0.85] });      // ragged hem
      for (let k = 0; k < 3; k++) P.add(torso, G.capsule(0.012, 0.18, 4), 0xc9c2a8, { p: [0.08, 0.36 + k * 0.05, 0.17], r: [0, 0, Math.PI / 2] });   // exposed ribs
      P.add(torso, G.box(0.16, 0.18, 0.02), 0x5d2a24, { p: [0.08, 0.41, 0.168] });
    }
    if (S.kind === 'vampire') {
      P.add(torso, G.box(0.22, 0.36, 0.03), 0x5a0f14, { p: [0, 0.4, 0.17] });          // waistcoat
      for (let k = 0; k < 4; k++) P.add(torso, G.sphere(0.012, 6, 5), 0xd4a84b, { p: [0, 0.3 + k * 0.07, 0.19], m: 'metal' });
      P.add(torso, G.cone(0.05, 0.12, 6), 0xa01020, { p: [0, 0.57, 0.18], r: [Math.PI, 0, 0] });      // cravat
      // stiff high collar of the cape
      P.add(torso, G.lathe([[0.2, 0], [0.24, 0.12], [0.3, 0.3]], 20).rotateY(Math.PI), S.cape ?? 0x14131a, { p: [0, 0.6, -0.02], s: [1, 1, 0.8] });
    }
    if (S.kind === 'demon') {
      for (let k = 0; k < 6; k++) P.add(torso, G.cone(0.04 + k * 0.004, 0.16, 6), 0x1d0a0a, { p: [0, 0.12 + k * 0.1, -0.2], r: [-Math.PI / 2 - 0.4, 0, 0] });   // spine spikes
      P.add(torso, G.box(0.36, 0.2, 0.05), 0x3a0d0f, { p: [0, 0.4, 0.17] });     // chest plates
      P.add(hips, G.tube([[0, 0, -0.15], [0, -0.2, -0.45], [0, -0.1, -0.8], [0, 0.15, -0.95]], 0.05, 0.015), S.skin);    // tail
      P.add(hips, G.cone(0.05, 0.12, 4), 0x1d0a0a, { p: [0, 0.2, -1.0], r: [0.8, 0, 0] });
      P.add(hips, pleated(0.24, 0.27, 0.32, 6, 0.01, 0.05), 0x1a0606, { p: [0, 0.05, 0] });   // loincloth
    }
  }
  if (robe) {
    // witch: a long flared robe from the waist to the ground, plus a shawl
    const R = pleated(0.21, 0.52, L + 0.12, 9, 0.02, 0.03);
    const robeMesh = new THREE.Group(); robeMesh.position.y = 0.05; hips.add(robeMesh);
    P.add(robeMesh, R, S.top, { p: [0, 0, 0] });
    P.add(torso, G.lathe([[0.3, 0.44], [0.26, 0.58], [0.12, 0.7]], 18), 0x3a2a4a, { s: [1.1, 1, 0.9] });
    parts.robe = robeMesh;
  }
  if (S.armor) {
    // dō (lacquered lamellar cuirass), kusazuri skirt plates
    const ac = S.armor;
    for (let k = 0; k < 5; k++) P.add(torso, G.cyl(0.235 * B, 0.225 * B, 0.075, 22, true), k % 2 ? ac.plate : ac.lace, { p: [0, 0.2 + k * 0.075, 0], s: [1.17, 1, 0.86] });
    P.add(torso, G.box(0.36 * B, 0.12, 0.03), ac.trim, { p: [0, 0.6, 0.18 * B], m: 'metal' });
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k - 2) * 0.62;
      for (let j = 0; j < 3; j++) P.add(hips, G.box(0.17 * B, 0.075, 0.02), j % 2 ? ac.lace : ac.plate, { p: [Math.cos(a) * 0.25 * B, -0.02 - j * 0.075, -Math.sin(a) * 0.2 * B], r: [0.15, -a - Math.PI / 2, 0], order: 'YXZ' });
    }
  }
  if (S.cape) {
    const capeG = new THREE.Group(); capeG.position.set(0, 0.62, -0.17); torso.add(capeG);
    const cg = G.box(0.62 * B, 1.0, 0.015, 6, 8, 1);
    const cp = cg.attributes.position;
    for (let i = 0; i < cp.count; i++) { const y = cp.getY(i), x = cp.getX(i); cp.setZ(i, cp.getZ(i) - Math.cos(x * 6) * 0.03 - (0.5 - y) * 0.05); cp.setX(i, x * (1 + (0.5 - y) * 0.5)); }
    cg.computeVertexNormals();
    P.add(capeG, cg, S.cape, { p: [0, -0.5, 0] });
    P.add(capeG, G.box(0.6 * B, 1.0, 0.012, 1, 1, 1), 0x5a0f14, { p: [0, -0.5, 0.012] });
    parts.cape = capeG;
  }

  // ---------------------------------------------------------------- head
  const neck = new THREE.Group(); neck.position.y = 0.72; torso.add(neck);
  parts.head = neck;
  P.add(neck, G.cyl(0.055, 0.065, 0.12, 10), bones ? S.skin : S.skin, { p: [0, 0.02, 0] });
  if (bones) {
    P.add(neck, G.sphere(0.13, 16, 12), S.skin, { p: [0, 0.2, -0.01], s: [0.95, 1, 1.08] });
    P.add(neck, G.box(0.13, 0.06, 0.1), S.skin, { p: [0, 0.07, 0.05] });                              // jaw
    P.add(neck, G.box(0.11, 0.025, 0.02), 0xf2ead2, { p: [0, 0.1, 0.105] });                        // teeth
    for (const s of [-1, 1]) P.add(neck, G.sphere(0.035, 8, 6), 0x0d0b09, { p: [s * 0.05, 0.19, 0.105] });   // sockets
    P.add(neck, G.cone(0.018, 0.04, 3), 0x0d0b09, { p: [0, 0.14, 0.12], r: [Math.PI, 0, 0] });
  } else {
    const headW = S.kind === 'demon' ? 1.15 : 1;
    P.add(neck, G.sphere(0.16, 18, 14), S.skin, { p: [0, 0.16, 0], s: [0.95 * headW, 1.08, 1] });
    P.add(neck, G.sphere(0.1, 12, 8), S.skin, { p: [0, 0.09, 0.05], s: [1, 0.8, 1] });               // jaw / cheeks
    P.add(neck, G.cone(0.025, 0.06, 6), S.skin, { p: [0, 0.15, 0.165], r: [Math.PI / 2, 0, 0], s: S.kind === 'witch' ? [1, 2.4, 1] : [1, 1, 1] });  // nose
    for (const s of [-1, 1]) {
      P.add(neck, G.sphere(0.04, 8, 6), S.skin, { p: [s * 0.15, 0.15, 0], s: [0.5, 1, 0.8] });                  // ears
      if (!S.eyes) {
        P.add(neck, G.sphere(0.021, 8, 6), S.kind === 'zombie' ? 0xc8d0a0 : 0xf4f1ea, { p: [s * 0.055, 0.18, 0.135], s: [1.2, 0.8, 0.6] });
        P.add(neck, G.sphere(0.012, 6, 5), S.kind === 'zombie' ? 0x6a6a50 : 0x1a1410, { p: [s * 0.055, 0.18, 0.148] });
      }
      P.add(neck, G.box(0.06, 0.012, 0.02), S.kind === 'zombie' ? 0x3a3a2a : S.hair, { p: [s * 0.058, 0.215, 0.14], r: [0, 0, s * (S.kind === 'demon' ? 0.4 : -0.1)] });   // brows
    }
    P.add(neck, G.box(0.06, 0.01, 0.01), 0x7a3a30, { p: [0, 0.09, 0.15] });     // mouth
    if (S.kind === 'vampire') for (const s of [-1, 1]) P.add(neck, G.cone(0.008, 0.035, 4), 0xffffff, { p: [s * 0.02, 0.075, 0.15], r: [Math.PI, 0, 0] });
    if (S.kind === 'zombie') P.add(neck, G.box(0.05, 0.035, 0.02), 0x5d2a24, { p: [-0.07, 0.24, 0.12], r: [0, 0, 0.4] });
    // hair
    if (S.hat !== 'helmet' && S.kind !== 'demon') P.add(neck, new THREE.SphereGeometry(0.168, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), S.hair, { p: [0, 0.18, -0.01], s: [1, 1.05, 1.03], r: [-0.25, 0, 0] });
    if (S.kind === 'vampire') P.add(neck, G.cone(0.035, 0.07, 4), S.hair, { p: [0, 0.27, 0.14], r: [Math.PI + 0.3, 0, 0] });   // widow's peak
    if (S.kind === 'witch') for (let k = 0; k < 7; k++) { const a = Math.PI * 0.6 + k * 0.3; P.add(neck, G.box(0.03, 0.38, 0.01), S.hair, { p: [Math.cos(a) * 0.16, 0.0, Math.sin(a) * -0.16 + 0.0], r: [0.1, -a + Math.PI / 2, 0], order: 'YXZ' }); }
    if (S.topknot) {
      P.add(neck, G.capsule(0.03, 0.12, 8), S.hair, { p: [0, 0.34, 0.0], r: [Math.PI / 2, 0, 0] });    // chonmage
      P.add(neck, G.torus(0.032, 0.008, Math.PI * 2, 5, 10), 0xf4f1ea, { p: [0, 0.34, -0.05] });
    }
  }
  if (S.eyes) {
    for (const s of [-1, 1]) P.add(neck, G.sphere(0.026, 8, 6), S.eyes, { p: [s * 0.058, 0.18, 0.138], s: [1.3, 0.7, 0.6], m: 'glow' });
  }
  if (S.hat === 'kasa') {
    P.add(neck, G.cone(0.44, 0.2, 24), 0xc8a265, { p: [0, 0.37, 0] });
    P.add(neck, G.torus(0.43, 0.012, Math.PI * 2, 4, 28), 0x8a6a44, { p: [0, 0.27, 0], r: [Math.PI / 2, 0, 0] });
    P.add(neck, G.cyl(0.14, 0.15, 0.08, 14, true), 0x8a6a44, { p: [0, 0.27, 0] });
    for (const s of [-1, 1]) P.add(neck, G.capsule(0.005, 0.2, 4), 0xf4f1ea, { p: [s * 0.12, 0.13, 0.05], r: [0.2, 0, s * 0.15] });   // chin cords
  } else if (S.hat === 'witch') {
    P.add(neck, G.cyl(0.44, 0.44, 0.02, 24), 0x14101a, { p: [0, 0.29, 0] });
    P.add(neck, G.tube([[0, 0.29, 0], [0, 0.55, -0.02], [0.03, 0.75, -0.08], [0.15, 0.85, -0.2]], 0.17, 0.01, 12, 12), 0x14101a);
    P.add(neck, G.cyl(0.175, 0.175, 0.05, 20, true), 0x5a2a6a, { p: [0, 0.32, 0] });
  } else if (S.hat === 'horns') {
    for (const s of [-1, 1]) P.add(neck, G.tube([[s * 0.11, 0.26, 0.02], [s * 0.22, 0.38, -0.02], [s * 0.26, 0.55, -0.08], [s * 0.2, 0.7, -0.16]], 0.05, 0.006, 14, 8), 0x1d1210);
  } else if (S.hat === 'helmet') {
    P.add(neck, new THREE.SphereGeometry(0.19, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), 0x2d2d33, { p: [0, 0.18, 0], m: 'metal' });
    for (let k = 0; k < 3; k++) P.add(neck, G.lathe([[0.2 + k * 0.035, 0.0], [0.24 + k * 0.04, -0.06]], 20), 0x2d2d33, { p: [0, 0.2 - k * 0.06, -0.02], m: 'metal' });   // shikoro neck guard
    P.add(neck, G.torus(0.13, 0.016, Math.PI * 0.9, 6, 16), 0xd4a84b, { p: [0, 0.34, 0.1], r: [0, 0, Math.PI * 0.05], m: 'metal' });   // crescent maedate
    for (const s of [-1, 1]) P.add(neck, G.box(0.08, 0.06, 0.02), 0x2d2d33, { p: [s * 0.2, 0.2, 0.08], r: [0, s * 0.6, 0], m: 'metal' });   // fukigaeshi
  }

  // ---------------------------------------------------------------- arms
  const mkArm = (side) => {
    const shoulder = new THREE.Group(); shoulder.position.set(side * 0.26 * B, 0.62, 0); torso.add(shoulder);
    const elbow = new THREE.Group(); elbow.position.y = -A * 0.5; shoulder.add(elbow);
    const hand = new THREE.Group(); hand.position.y = -A * 0.52; elbow.add(hand);
    if (bones) {
      P.add(shoulder, G.capsule(0.025, A * 0.4, 6), S.skin, { p: [0, -A * 0.25, 0] });
      P.add(elbow, G.capsule(0.02, A * 0.4, 6), S.skin, { p: [0, -A * 0.25, 0] });
      P.add(elbow, G.capsule(0.016, A * 0.38, 6), S.skin, { p: [0.025, -A * 0.25, 0] });
      for (let k = 0; k < 4; k++) P.add(hand, G.capsule(0.009, 0.07, 4), S.skin, { p: [-0.02 + k * 0.014, -0.04, 0.01] });
    } else {
      const sleeve = S.kind === 'samurai' || S.kind === 'zombie' || S.kind === 'witch';
      P.add(shoulder, G.capsule(0.06 * B, A * 0.36, 10), S.kind === 'demon' ? S.skin : S.top, { p: [0, -A * 0.25, 0] });
      if (sleeve) {
        // wide kimono sleeve hanging from the upper arm
        const sl = pleated(0.085 * B, 0.15 * B, A * 0.62, 6, 0.008, S.kind === 'zombie' && side > 0 ? 0.05 : 0);
        P.add(shoulder, sl, S.top, { p: [0, 0.02, 0], s: [1, 1, 1.25] });
      }
      if (S.armor) for (let k = 0; k < 3; k++) P.add(shoulder, G.box(0.2 * B, 0.07, 0.17 * B), k % 2 ? S.armor.lace : S.armor.plate, { p: [side * 0.03, 0.02 - k * 0.075, 0], r: [0, 0, side * 0.12] });
      const fore = S.kind === 'demon' ? S.skin : (sleeve && !S.armor ? S.skin : (S.armor ? 0x2a2a2e : S.skin));
      P.add(elbow, G.capsule(0.05 * B, A * 0.38, 10), fore, { p: [0, -A * 0.25, 0] });
      if (S.kind === 'vampire') P.add(elbow, G.cyl(0.06, 0.055, A * 0.38, 10, true), S.top, { p: [0, -A * 0.22, 0] });
      // hand: palm, fingers, thumb
      P.add(hand, G.box(0.075 * B, 0.08, 0.04), S.skin, { p: [0, -0.01, 0] });
      for (let k = 0; k < 4; k++) P.add(hand, G.capsule(0.011 * B, 0.045, 4), S.skin, { p: [-0.026 + k * 0.017, -0.07, 0.008], r: [0.2, 0, 0] });
      P.add(hand, G.capsule(0.012 * B, 0.04, 4), S.skin, { p: [side * -0.045, -0.02, 0.02], r: [0, 0, side * 0.7] });
      if (S.kind === 'demon' || S.kind === 'zombie') for (let k = 0; k < 4; k++) P.add(hand, G.cone(0.008, 0.04, 4), S.kind === 'demon' ? 0xe8e0d0 : 0x6a6a50, { p: [-0.026 + k * 0.017, -0.11, 0.01], r: [Math.PI, 0, 0] });
    }
    return { shoulder, elbow, hand };
  };
  parts.armL = mkArm(-1); parts.armR = mkArm(1);

  const opts = S.opacity < 1 ? { transparent: true, opacity: S.opacity, depthWrite: false } : {};
  const materials = {
    base: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02, ...opts }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.75, ...opts }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, ...opts }),
  };
  P.build(materials);
  parts.materials = Object.values(materials);
  parts.height = L + 0.13 + 0.72 + 0.35;
  parts.armLen = { upper: A * 0.5, lower: A * 0.52 };
  root.scale.setScalar(S.scale);
  torso.rotation.x = S.hunch;
  return parts;
}

/**
 * Procedural animation. `anim` is mutable per-entity state.
 * pose: optional function (t, parts, anim) from the weapon style, applied over the base pose.
 */
export function animateHumanoid(parts, anim, dt, pose) {
  const { speed = 0, attackT = -1, attackDur = 0.5, hurt = 0 } = anim;
  anim.phase = (anim.phase ?? 0) + dt * (4 + speed * 9);
  anim.breath = (anim.breath ?? 0) + dt * 2.2;
  const ph = anim.phase, s = THREE.MathUtils.clamp(speed, 0, 1);
  const legAmp = 0.75 * s, armAmp = 0.45 * s;
  const Lg = parts.legL, R = parts.legR, AL = parts.armL, AR = parts.armR;
  Lg.hip.rotation.x = Math.sin(ph) * legAmp;
  R.hip.rotation.x = Math.sin(ph + Math.PI) * legAmp;
  Lg.knee.rotation.x = Math.max(0, -Math.sin(ph - 0.6)) * legAmp * 1.2;
  R.knee.rotation.x = Math.max(0, -Math.sin(ph + Math.PI - 0.6)) * legAmp * 1.2;
  AL.shoulder.rotation.set(Math.sin(ph + Math.PI) * armAmp, 0, 0.12);
  AR.shoulder.rotation.set(Math.sin(ph) * armAmp, 0, -0.12);
  AL.elbow.rotation.set(-0.3 - Math.max(0, Math.sin(ph + Math.PI)) * 0.4 * s, 0, 0);
  AR.elbow.rotation.set(-0.3 - Math.max(0, Math.sin(ph)) * 0.4 * s, 0, 0);
  const baseY = parts.hips.userData.baseY ?? (parts.hips.userData.baseY = parts.hips.position.y);
  parts.hips.position.y = baseY + Math.abs(Math.sin(ph)) * 0.05 * s + Math.sin(anim.breath) * 0.008;
  parts.torso.rotation.set((anim.hunch ?? 0) + s * 0.12 + Math.sin(anim.breath) * 0.01, Math.sin(ph) * 0.06 * s, 0);
  parts.head.rotation.set(-s * 0.1, 0, 0);
  AR.hand.rotation.set(0, 0, 0); AL.hand.rotation.set(0, 0, 0);
  if (parts.cape) parts.cape.rotation.x = 0.1 + s * 0.6 + Math.sin(anim.breath * 2) * 0.05;
  if (parts.robe) parts.robe.rotation.x = -s * 0.15;
  if (attackT >= 0 && pose) pose(THREE.MathUtils.clamp(attackT / attackDur, 0, 1), parts, anim);
  if (hurt > 0) { parts.torso.rotation.x -= hurt * 0.4; parts.head.rotation.x -= hurt * 0.3; }
}

/** Easing helpers for poses. */
export const ease = {
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  pulse: (t, a, b) => (t < a ? t / a : t < b ? 1 : 1 - (t - b) / (1 - b)),
};
