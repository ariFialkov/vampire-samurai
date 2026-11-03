// Collectible catalogue: one-time-use items, keepers (secondary weapons/tools) and upgrades.
import * as THREE from 'three';
import { mat } from './humanoid.js';
import { WEAPON_MESHES } from './weapons.js';
import { Parts, G } from './parts.js';

export const ITEMS = {
  // ---- one-time use (stackable where noted)
  super_stomp:   { name: 'Super Stomp', kind: 'use', max: 1, weight: 5, color: 0xc9a86a, desc: 'Shatters every skeleton nearby.' },
  headshots:     { name: 'Headshots Only', kind: 'use', max: 1, weight: 4, color: 0xd44a3a, desc: '10s: every hit is a headshot. Zombies fall in one.' },
  corpuscular:   { name: 'Corpuscular Ray', kind: 'use', max: 1, weight: 4, color: 0xffd36a, desc: '3s beam of sunlight. Burns vampires in it.' },
  ecto_goggles:  { name: 'Ecto-Goggles', kind: 'use', max: 1, weight: 4, color: 0x6ad4c9, desc: '30s: see ghosts, even when hidden.' },
  wolfsbane:     { name: 'Wolfsbane Grenade', kind: 'use', max: 1, weight: 4, color: 0x9a6ad4, desc: '15s cloud of wolfsbane. Werewolves burn in it.' },
  holy_water:    { name: 'Holy Water Hose', kind: 'use', max: 1, weight: 3, color: 0x6aa8ff, desc: '10s stream: ravages demons, pushes back the rest.' },
  protector:     { name: 'Protector Spell', kind: 'use', max: 1, weight: 0, color: 0xffffff, desc: 'Nearby monsters become your allies.', spell: true },
  speedy:        { name: 'Speedy Spell', kind: 'use', max: 1, weight: 0, color: 0xb0ffd0, desc: '10s: move and attack faster.', spell: true },
  lucky:         { name: 'Lucky Spell', kind: 'use', max: 1, weight: 0, color: 0x5aff6a, desc: '30s: many more collectibles appear.', spell: true },
  mulberry:      { name: 'Mulberry', kind: 'use', max: 5, weight: 12, color: 0x5a2a6a, desc: 'Restores 15% health.' },
  green_tea:     { name: 'Green Tea', kind: 'use', max: 2, weight: 6, color: 0x7fb86a, desc: 'Restores 50% health.' },
  shuriken:      { name: 'Shuriken', kind: 'use', max: 12, weight: 9, color: 0xb0b8c0, desc: 'Thrown star. Mid range, decent damage.', pickupCount: 3 },
  makibishi:     { name: 'Makibishi', kind: 'use', max: 6, weight: 6, color: 0x555a60, desc: 'Caltrops: wound anything that steps on them.', pickupCount: 3 },
  bohiya:        { name: 'Bo-hiya', kind: 'use', max: 3, weight: 5, color: 0xff7a2a, desc: 'Fire rocket arrow. Explodes and burns.', pickupCount: 1 },
  // ---- keepers
  wakizashi:     { name: 'Wakizashi', kind: 'keeper', max: 1, weight: 4, color: 0xd8dde3, desc: 'Short sword. Quick, light, nimble.', weapon: 'wakizashi' },
  tessen:        { name: 'Tessen', kind: 'keeper', max: 1, weight: 3, color: 0xc0392b, desc: 'Bladed war fan. Wide, fast, elegant.', weapon: 'tessen' },
  tekkokagi:     { name: 'Tekko-Kagi', kind: 'keeper', max: 1, weight: 0.8, color: 0xeeeeee, desc: 'Claws. Brutal and fast, but you must get close.', weapon: 'tekkokagi' },
  binoculars:    { name: 'Binoculars', kind: 'keeper', max: 1, weight: 3, color: 0x2a2a2a, desc: 'Cycle camera height to scout the land.', weapon: 'binoculars' },
  // ---- upgrades (instant)
  rub_serrated:  { name: 'Serrated', kind: 'upgrade', max: 1, weight: 2.5, color: 0xa8b0b8, desc: '2× damage to zombies.', rub: 'serrated' },
  rub_garlic:    { name: 'Garlic', kind: 'upgrade', max: 1, weight: 2.5, color: 0xe9e4c8, desc: '2× damage to vampires.', rub: 'garlic' },
  rub_salt:      { name: 'Salt', kind: 'upgrade', max: 1, weight: 2.5, color: 0xf4f7ff, desc: '2× damage to ghosts.', rub: 'salt' },
  rub_silver:    { name: 'Silver', kind: 'upgrade', max: 1, weight: 2.5, color: 0xeef2ff, desc: '2× damage to werewolves.', rub: 'silver' },
  flaming_tekko: { name: 'Flaming Tekko-Kagi', kind: 'upgrade', max: 1, weight: 0, color: 0xff6a2a, desc: 'Your claws burn: 2× damage to everything.', flaming: true },
};

const labelCache = new Map(), spriteMats = new Map();
function labelSprite(text, color = '#f6e9c8') {
  if (!labelCache.has(text)) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = '600 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 8;
    g.fillStyle = color; g.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    labelCache.set(text, tex);
  }
  if (!spriteMats.has(text)) spriteMats.set(text, new THREE.SpriteMaterial({ map: labelCache.get(text), transparent: true, depthTest: false }));
  const s = new THREE.Sprite(spriteMats.get(text));
  s.scale.set(2.6, 0.65, 1); s.position.y = 1.55;
  return s;
}

// ---------------------------------------------------------------- pickup models
// Small, recognisable models of each item, built from merged parts with shared materials
// (so a new pickup never compiles a new shader).
const PM = {
  base: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 }),
  metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.45 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
};

function caltrop(P, g, x, z, ry) {
  const dirs = [[0, 1, 0], [0.94, -0.33, 0], [-0.47, -0.33, 0.82], [-0.47, -0.33, -0.82]];
  for (const [dx, dy, dz] of dirs) {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz));
    const e = new THREE.Euler().setFromQuaternion(q);
    P.add(g, G.cone(0.035, 0.2, 6), 0x5d6168, { p: [x + dx * 0.1, 0.1 + dy * 0.1, z + dz * 0.1], r: [e.x, e.y, e.z], m: 'metal' });
  }
}

const MODELS = {
  super_stomp: (P, g) => {      // an iron-shod geta clog with its red thong
    P.add(g, G.box(0.3, 0.06, 0.62), 0x9a7a52, { p: [0, 0.12, 0] });
    for (const z of [-0.17, 0.17]) P.add(g, G.box(0.28, 0.12, 0.06), 0x5d6168, { p: [0, 0.03, z], m: 'metal' });
    P.add(g, G.torus(0.1, 0.02, Math.PI, 6, 14), 0xc0392b, { p: [0, 0.15, 0.06], r: [0, Math.PI / 2, 0] });
    P.add(g, G.cyl(0.02, 0.02, 0.12, 6), 0xc0392b, { p: [0, 0.2, 0.2], r: [0.6, 0, 0] });
  },
  headshots: (P, g) => {        // crosshair around a skull
    P.add(g, G.torus(0.3, 0.025, Math.PI * 2, 6, 28), 0xc0392b, { r: [0, 0, 0] });
    for (let k = 0; k < 4; k++) P.add(g, G.box(0.03, 0.14, 0.03), 0xc0392b, { p: [Math.cos(k * Math.PI / 2) * 0.3, Math.sin(k * Math.PI / 2) * 0.3, 0], r: [0, 0, k * Math.PI / 2] });
    P.add(g, G.sphere(0.12, 14, 10), 0xeae4d2, { p: [0, 0.02, 0] });
    P.add(g, G.box(0.1, 0.06, 0.08), 0xeae4d2, { p: [0, -0.1, 0.02] });
    for (const sx of [-1, 1]) P.add(g, G.sphere(0.03, 6, 5), 0x1a1410, { p: [sx * 0.045, 0.03, 0.1] });
  },
  corpuscular: (P, g) => {      // bronze sun mirror with golden rays
    P.add(g, G.cyl(0.26, 0.26, 0.04, 24), 0xc89a4a, { r: [Math.PI / 2, 0, 0], m: 'metal' });
    P.add(g, G.torus(0.26, 0.025, Math.PI * 2, 6, 28), 0x8a6a2a, { m: 'metal' });
    P.add(g, G.cyl(0.17, 0.17, 0.045, 24), 0xfff1b0, { r: [Math.PI / 2, 0, 0], m: 'glow' });
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; P.add(g, G.cone(0.03, 0.14, 4), 0xffd36a, { p: [Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0], r: [0, 0, a - Math.PI / 2], m: 'glow' }); }
  },
  ecto_goggles: (P, g) => {     // brass goggles with glowing green lenses
    for (const sx of [-1, 1]) {
      P.add(g, G.cyl(0.11, 0.12, 0.1, 18, true), 0x8a6a2a, { p: [sx * 0.13, 0, 0], r: [Math.PI / 2, 0, 0], m: 'metal' });
      P.add(g, G.cyl(0.095, 0.095, 0.02, 18), 0x5fffb0, { p: [sx * 0.13, 0, 0.05], r: [Math.PI / 2, 0, 0], m: 'glow' });
    }
    P.add(g, G.box(0.08, 0.03, 0.04), 0x8a6a2a, { m: 'metal' });
    P.add(g, G.torus(0.26, 0.022, Math.PI, 6, 18), 0x3a2a1a, { p: [0, 0, -0.02], r: [Math.PI / 2, 0, Math.PI] });
  },
  wolfsbane: (P, g) => {        // clay grenade pot, fuse and purple aconite flowers
    P.add(g, G.sphere(0.2, 16, 12), 0x8a5a3a, {});
    P.add(g, G.cyl(0.07, 0.09, 0.08, 12), 0x6a4430, { p: [0, 0.21, 0] });
    P.add(g, G.torus(0.2, 0.015, Math.PI * 2, 5, 24), 0x3a2a1a, { r: [Math.PI / 2, 0, 0] });
    P.add(g, G.tube([[0, 0.25, 0], [0.05, 0.33, 0], [0.12, 0.36, 0.02]], 0.012, 0.01, 6, 5), 0xc8a265);
    P.add(g, G.sphere(0.025, 6, 5), 0xffa040, { p: [0.12, 0.36, 0.02], m: 'glow' });
    for (let k = 0; k < 6; k++) P.add(g, G.cone(0.035, 0.08, 6), 0x9a5ad4, { p: [-0.12 + (k % 3) * 0.03, 0.12 + Math.floor(k / 3) * 0.07, 0.16], r: [-0.4, 0, 0] });
  },
  holy_water: (P, g) => {       // a gourd flask with a coiled hose
    P.add(g, G.sphere(0.18, 16, 12), 0x9ec4e8, { p: [0, -0.06, 0] });
    P.add(g, G.sphere(0.12, 14, 10), 0x9ec4e8, { p: [0, 0.18, 0] });
    P.add(g, G.torus(0.075, 0.02, Math.PI * 2, 6, 16), 0xc8a265, { p: [0, 0.08, 0], r: [Math.PI / 2, 0, 0] });
    P.add(g, G.cyl(0.03, 0.04, 0.08, 10), 0x8a6a44, { p: [0, 0.32, 0] });
    P.add(g, G.tube([[0, 0.34, 0], [0.12, 0.38, 0.05], [0.22, 0.22, 0.08], [0.24, 0.02, 0.06], [0.16, -0.16, 0.1]], 0.018, 0.018, 18, 6), 0x5a7d9a);
    P.add(g, G.sphere(0.05, 8, 6), 0xd8f0ff, { p: [0.05, 0.0, 0.17], m: 'glow' });
  },
  protector: (P, g) => ofuda(P, g, 0xd4a84b),
  speedy: (P, g) => {
    ofuda(P, g, 0x5fae86);
    for (let k = 0; k < 3; k++) P.add(g, G.torus(0.25 + k * 0.05, 0.012, Math.PI * 0.9, 5, 18), 0x9affd0, { p: [0, -0.1 + k * 0.12, 0], r: [Math.PI / 2, 0, k * 1.3], m: 'glow' });
  },
  lucky: (P, g) => {            // omamori charm pouch with its knot
    P.add(g, G.box(0.26, 0.34, 0.06), 0x3f8a52, { p: [0, -0.02, 0] });
    P.add(g, G.cyl(0.13, 0.13, 0.06, 16, false), 0x3f8a52, { p: [0, 0.15, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.7] });
    for (const y of [-0.1, 0.0, 0.08]) P.add(g, G.box(0.27, 0.015, 0.065), 0xd4a84b, { p: [0, y, 0] });
    P.add(g, G.torus(0.04, 0.012, Math.PI * 2, 5, 12), 0xd4a84b, { p: [-0.04, 0.27, 0] });
    P.add(g, G.torus(0.04, 0.012, Math.PI * 2, 5, 12), 0xd4a84b, { p: [0.04, 0.27, 0] });
    P.add(g, G.box(0.1, 0.1, 0.004), 0xb0ffb8, { p: [0, -0.05, 0.034], m: 'glow' });
  },
  mulberry: (P, g) => {         // a clustered berry with a leaf
    for (let k = 0; k < 18; k++) {
      const y = -0.16 + (k / 18) * 0.32, a = k * 2.4, r = 0.075 * Math.sin(Math.PI * (k + 1) / 19) + 0.02;
      P.add(g, G.sphere(0.045, 8, 6), k % 3 ? 0x3a1240 : 0x5a2268, { p: [Math.cos(a) * r, y, Math.sin(a) * r] });
    }
    P.add(g, G.cyl(0.01, 0.012, 0.08, 5), 0x4a6a2a, { p: [0, 0.2, 0] });
    P.add(g, G.sphere(0.12, 10, 6), 0x4f8f34, { p: [0.1, 0.24, 0], s: [1.2, 0.12, 0.6], r: [0, 0, -0.4] });
  },
  green_tea: (P, g) => {        // a chawan of whisked matcha and a bamboo whisk
    const bowl = G.lathe([[0.05, -0.12], [0.09, -0.12], [0.1, -0.1], [0.2, 0.0], [0.23, 0.1], [0.215, 0.11], [0.19, 0.02], [0.0, -0.08]], 24);
    P.add(g, bowl, 0x4a3a30, {});
    P.add(g, G.cyl(0.19, 0.19, 0.01, 24), 0x8fd05a, { p: [0, 0.06, 0], m: 'glow' });
    P.add(g, G.cyl(0.05, 0.02, 0.18, 10, true), 0xd8c08a, { p: [0.28, -0.03, 0] });
    P.add(g, G.cyl(0.02, 0.02, 0.12, 8), 0xc8a265, { p: [0.28, 0.12, 0] });
  },
  shuriken: (P, g) => {
    const sh = new THREE.Shape();
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 2, r = k % 2 ? 0.07 : 0.28; const x = Math.cos(a) * r, y = Math.sin(a) * r; k ? sh.lineTo(x, y) : sh.moveTo(x, y); }
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.03, 0, Math.PI * 2, true); sh.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1 });
    geo.translate(0, 0, -0.012);
    P.add(g, geo, 0xb8c0c8, { m: 'metal' });
    P.add(g, geo.clone(), 0xb8c0c8, { p: [0.12, -0.12, -0.06], r: [0.4, 0.3, 0.5], m: 'metal' });
  },
  makibishi: (P, g) => { caltrop(P, g, 0, 0, 0); caltrop(P, g, 0.2, 0.1, 1); caltrop(P, g, -0.15, 0.14, 2); },
  bohiya: (P, g) => {           // fire-rocket arrow
    P.add(g, G.cyl(0.02, 0.02, 0.9, 8), 0x6a4a30, { r: [0, 0, Math.PI / 2 - 0.5] });
    P.add(g, G.cyl(0.06, 0.05, 0.22, 12), 0x3a3030, { p: [0.28, 0.16, 0], r: [0, 0, Math.PI / 2 - 0.5] });
    P.add(g, G.cone(0.05, 0.1, 8), 0x9aa2aa, { p: [0.42, 0.24, 0], r: [0, 0, -Math.PI / 2 + 1.07], m: 'metal' });
    for (const s of [-1, 1]) P.add(g, G.box(0.12, 0.06, 0.008), 0xeeeeee, { p: [-0.36, -0.2 + s * 0.03, 0], r: [0, 0, 0.5] });
    P.add(g, G.sphere(0.06, 8, 6), 0xff8a2a, { p: [0.15, 0.08, 0], m: 'glow' });
  },
  rub_serrated: (P, g) => {     // a serrated saw blade
    P.add(g, G.box(0.56, 0.1, 0.012), 0xc8ced6, { m: 'metal' });
    for (let k = 0; k < 9; k++) P.add(g, G.cone(0.03, 0.06, 3), 0xc8ced6, { p: [-0.25 + k * 0.0625, -0.075, 0], r: [Math.PI, 0, 0], m: 'metal' });
    P.add(g, G.cyl(0.03, 0.03, 0.18, 8), 0x2a2a30, { p: [0.36, 0.01, 0], r: [0, 0, Math.PI / 2] });
  },
  rub_garlic: (P, g) => {       // a lobed garlic bulb
    const bulb = G.lathe([[0.0, -0.16], [0.12, -0.13], [0.18, -0.04], [0.16, 0.06], [0.08, 0.14], [0.02, 0.24], [0.0, 0.26]], 20);
    const bp = bulb.attributes.position;
    for (let i = 0; i < bp.count; i++) { const a = Math.atan2(bp.getZ(i), bp.getX(i)), k = 1 + 0.1 * Math.abs(Math.sin(a * 4)); bp.setX(i, bp.getX(i) * k); bp.setZ(i, bp.getZ(i) * k); }
    bulb.computeVertexNormals();
    P.add(g, bulb, 0xf2ece0, {});
    for (let k = 0; k < 6; k++) P.add(g, G.cyl(0.006, 0.004, 0.08, 4), 0xc8b88a, { p: [Math.cos(k) * 0.04, -0.2, Math.sin(k) * 0.04] });
  },
  rub_salt: (P, g) => {         // a dish heaped with salt crystals
    P.add(g, G.lathe([[0.0, -0.06], [0.2, -0.06], [0.26, 0.0], [0.25, 0.01], [0.19, -0.04], [0.0, -0.04]], 24), 0x2a3440, {});
    P.add(g, G.cone(0.19, 0.16, 18), 0xf6f8ff, { p: [0, 0.04, 0] });
    for (let k = 0; k < 5; k++) P.add(g, G.box(0.04, 0.04, 0.04), 0xffffff, { p: [Math.cos(k * 1.3) * 0.12, 0.0, Math.sin(k * 1.3) * 0.12], r: [k, k * 2, 0] });
  },
  rub_silver: (P, g) => {       // a silver ingot
    P.add(g, G.cyl(0.16, 0.22, 0.1, 4), 0xdfe4ee, { r: [0, Math.PI / 4, 0], s: [1.6, 1, 0.8], m: 'metal' });
  },
  flaming_tekko: (P, g) => {
    for (let k = 0; k < 5; k++) P.add(g, G.cone(0.05 + (k % 2) * 0.02, 0.22 + (k % 3) * 0.06, 6), k % 2 ? 0xffb02a : 0xff5a1a, { p: [-0.1 + k * 0.05, 0.3, 0], m: 'glow' });
  },
};
function ofuda(P, g, accent) {  // a paper talisman with a red seal, glowing at the edge
  P.add(g, G.box(0.24, 0.52, 0.01), 0xf6efd8, {});
  P.add(g, G.box(0.27, 0.55, 0.004), accent, { p: [0, 0, -0.008], m: 'glow' });
  P.add(g, G.cyl(0.06, 0.06, 0.012, 16), 0xb02a1e, { p: [0, 0.12, 0.006], r: [Math.PI / 2, 0, 0] });
  for (const y of [-0.04, -0.1, -0.16]) P.add(g, G.box(0.12, 0.02, 0.012), 0x1a1410, { p: [0, y, 0.006] });
}

/** Build the floating pickup representation. */
export function buildPickupMesh(id, count = 1) {
  const def = ITEMS[id];
  const g = new THREE.Group();
  let core;
  if (def.weapon) {
    core = new THREE.Group();
    const w = WEAPON_MESHES[def.weapon]();
    w.scale.setScalar({ wakizashi: 1.25, tessen: 1.6, tekkokagi: 2.0, binoculars: 3.0 }[def.weapon] ?? 1.2);
    w.rotation.z = def.weapon === 'binoculars' ? 0 : 0.7;
    if (def.weapon === 'tessen' || def.weapon === 'binoculars') w.rotation.x = -0.5;
    core.add(w);
  } else {
    core = new THREE.Group();
    const P = new Parts();
    const inner = new THREE.Group(); core.add(inner);
    MODELS[id](P, inner);
    if (id === 'flaming_tekko') { const claws = WEAPON_MESHES.tekkokagi(); claws.scale.setScalar(1.6); inner.add(claws); }
    P.build(PM);
    inner.scale.setScalar(1.25);
  }
  core.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  core.position.y = 0.8;
  g.add(core);
  const ring = new THREE.Mesh(RING_GEO, def.kind === 'upgrade' ? RING_MATS.upgrade : def.spell ? RING_MATS.spell : RING_MATS.item);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
  g.add(ring);
  g.add(labelSprite(count > 1 ? `${def.name} \u00d7${count}` : def.name, def.kind === 'upgrade' ? '#f1cf7a' : '#f6e9c8'));
  g.userData.core = core;
  return g;
}
const RING_GEO = new THREE.RingGeometry(0.5, 0.62, 32);
const RING_MATS = {
  item: new THREE.MeshBasicMaterial({ color: 0x9ad4a0, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  upgrade: new THREE.MeshBasicMaterial({ color: 0xd4a84b, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
  spell: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
};

/** Weighted pick of an item id to spawn given the player's inventory. */
export function rollSpawnItem(rng, inventory, lucky) {
  const w = {};
  const hasTekko = inventory.some((s) => s && s.id === 'tekkokagi');
  for (const id in ITEMS) {
    const d = ITEMS[id];
    let weight = d.weight;
    if (id === 'flaming_tekko') weight = hasTekko ? 1.5 : 0;
    if (d.kind === 'keeper' && inventory.some((s) => s && s.id === id)) weight = 0;
    if (lucky && d.kind !== 'upgrade') weight *= 1.3;
    if (weight > 0) w[id] = weight;
  }
  return rng.weighted(w);
}
