// Trees, shrubs and drifting petals. Each species is built as two merged geometries (a bark
// trunk with branches, and hundreds of textured leaf cards) instanced across the map, so a
// whole forest of individually fluttering leaves costs a handful of draw calls. Leaf cards
// sample a procedural atlas (eye-shaped leaf sprigs, maple leaves, cherry blossoms, pine
// needles) with alpha cut-out, and shadows use the same wind so they dapple in sync.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { applyWind, wind } from './wind.js';
import { foliageAtlas, barkTexture, ATLAS } from './textures.js';
import { PLAY_LIMIT, TEMPLE_RADIUS, PADDY, LAKES } from './terrain.js';
import { TEMPLE_PATH } from './temple.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// card: [width, length] in metres of one leaf card; atlas: which atlas cell it shows
export const SPECIES = {
  cherry:   { trunk: 0x5a4036, leaf: [0xffffff, 0xfff4f7, 0xffe8ee], atlas: ATLAS.blossom, card: [0.5, 0.5], trunkH: 3.4, trunkR: 0.3, branches: 5, depth: 2, canopy: [3.4, 2.2, 3.4], leaves: 720, lean: 0.25, collider: 0.5, sway: 0.5, flutter: 0.07 },
  pine:     { trunk: 0x9a5534, leaf: [0x2f5e3a, 0x3d7448, 0x274d30], atlas: ATLAS.needles, card: [0.55, 0.62], trunkH: 7.5, trunkR: 0.36, branches: 0, depth: 0, layers: 4, canopy: [2.6, 1.0, 2.6], leaves: 560, lean: 0.08, collider: 0.55, sway: 0.32, flutter: 0.04 },
  mulberry: { trunk: 0x6b4a34, leaf: [0x4f8f34, 0x6aa844, 0x3f7a2a], atlas: ATLAS.sprig, card: [0.55, 0.6], trunkH: 2.6, trunkR: 0.32, branches: 4, depth: 2, canopy: [3.0, 2.6, 3.0], leaves: 600, lean: 0.15, collider: 0.5, sway: 0.5, flutter: 0.08 },
  maple:    { trunk: 0x4f3a2c, leaf: [0xc8452a, 0xe0782e, 0xa92e26], atlas: ATLAS.maple, card: [0.3, 0.3], trunkH: 2.3, trunkR: 0.22, branches: 5, depth: 2, canopy: [2.9, 1.6, 2.9], leaves: 950, lean: 0.3, collider: 0.4, sway: 0.55, flutter: 0.1 },
  tea:      { trunk: 0x4a3a2a, leaf: [0x2f6030, 0x3f7638, 0x285428], atlas: ATLAS.sprig, card: [0.32, 0.36], trunkH: 0.35, trunkR: 0.06, branches: 0, depth: 0, canopy: [1.0, 0.75, 1.0], leaves: 150, lean: 0, collider: 0, sway: 0.2, flutter: 0.06 },
  bonsai:   { trunk: 0x5a4538, leaf: [0x2d5a33, 0x3a6e3f, 0x24482a], atlas: ATLAS.needles, card: [0.3, 0.34], trunkH: 1.1, trunkR: 0.13, branches: 3, depth: 1, layers: 3, canopy: [1.1, 0.5, 1.1], leaves: 200, lean: 0.6, collider: 0.4, sway: 0.18, flutter: 0.05, pot: true },
};

function withAttrs(g, color, flex0, flex1, y0, y1) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3), flex = new Float32Array(n), phase = new Float32Array(n);
  _c.setHex(color);
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    const t = THREE.MathUtils.clamp((g.attributes.position.getY(i) - y0) / Math.max(0.001, y1 - y0), 0, 1);
    flex[i] = THREE.MathUtils.lerp(flex0, flex1, t);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFlex', new THREE.BufferAttribute(flex, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  return g;
}

/** A tapered bark cylinder between two points. */
function limb(a, b, r0, r1, geoms, color, flex0, flex1, flare = false) {
  const dir = _v.copy(b).sub(a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, 8, 3, true);
  if (flare) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) < -len / 2 + 0.01) { p.setX(i, p.getX(i) * 1.55); p.setZ(i, p.getZ(i) * 1.55); } }
  g.translate(0, len / 2, 0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len * 0.6);
  _q.setFromUnitVectors(UP, dir.normalize());
  g.applyQuaternion(_q);
  g.translate(a.x, a.y, a.z);
  geoms.push(withAttrs(g, color, flex0, flex1, a.y, b.y));
}

/** Scatter `count` leaf cards in an ellipsoid. Each card is rooted at its point and points outward. */
function leafCloud(center, radii, count, S, rng, out, baseFlex = 0.7) {
  const [cw, cl] = S.card;
  const col0 = (S.atlas % 2) * 0.5, row = Math.floor(S.atlas / 2);
  const u0 = col0 + 0.004, u1 = col0 + 0.496, v0 = 1 - (row + 1) * 0.5 + 0.004, v1 = 1 - row * 0.5 - 0.004;
  const n = count * 4;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const flex = new Float32Array(n), phase = new Float32Array(n), idx = new Uint32Array(count * 6);
  const ca = new THREE.Color(S.leaf[0]), cb = new THREE.Color(S.leaf[1]), cc = new THREE.Color(S.leaf[2]);
  const out3 = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(), tmp = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    let x, y, z, d;
    do { x = rng.float(-1, 1); y = rng.float(-1, 1); z = rng.float(-1, 1); d = x * x + y * y + z * z; } while (d > 1 || d < 0.01);
    const shell = Math.pow(d, 0.3), len = Math.sqrt(d);
    x = (x / len) * shell; y = (y / len) * shell; z = (z / len) * shell;
    const cx = center.x + x * radii[0], cy = center.y + y * radii[1], cz = center.z + z * radii[2];
    // card axis: outward from the canopy centre, biased upward, with a random twist
    out3.set(x + rng.float(-0.5, 0.5), y * 0.6 + 0.55 + rng.float(-0.3, 0.3), z + rng.float(-0.5, 0.5)).normalize();
    tmp.set(rng.float(-1, 1), rng.float(-1, 1), rng.float(-1, 1));
    side.crossVectors(out3, tmp).normalize();
    up.copy(out3);
    const s = rng.float(0.75, 1.25);
    const w = cw * s * 0.5, l = cl * s;
    const ph = rng.next();
    _c.copy(ca).lerp(cb, rng.next()).lerp(cc, rng.next() * 0.6);
    const light = 0.86 + 0.24 * (0.5 + 0.5 * y) * shell;
    const corners = [[-w, 0], [w, 0], [w, l], [-w, l]];
    const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (let k = 0; k < 4; k++) {
      const vi = i * 4 + k;
      const px = cx + side.x * corners[k][0] + up.x * corners[k][1];
      const py = cy + side.y * corners[k][0] + up.y * corners[k][1];
      const pz = cz + side.z * corners[k][0] + up.z * corners[k][1];
      pos[vi * 3] = px; pos[vi * 3 + 1] = py; pos[vi * 3 + 2] = pz;
      col[vi * 3] = _c.r * light; col[vi * 3 + 1] = _c.g * light; col[vi * 3 + 2] = _c.b * light;
      nor[vi * 3] = x; nor[vi * 3 + 1] = 0.55 + y * 0.6; nor[vi * 3 + 2] = z;
      uv[vi * 2] = uvs[k][0]; uv[vi * 2 + 1] = uvs[k][1];
      flex[vi] = k >= 2 ? 1.0 : baseFlex + 0.1 * shell;
      phase[vi] = ph;
    }
    idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFlex', new THREE.BufferAttribute(flex, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  // normalise canopy normals
  const nn = g.attributes.normal;
  for (let i = 0; i < nn.count; i++) { tmp.fromBufferAttribute(nn, i).normalize(); nn.setXYZ(i, tmp.x, tmp.y, tmp.z); }
  out.push(g);
}

/** Build one tree of a species: { trunk, leaves } geometries. */
export function buildTreeGeometry(name, rng, quality = 1) {
  const S = SPECIES[name];
  const trunk = [], leaves = [];
  const leafCount = Math.max(40, Math.round(S.leaves * quality));
  const tips = [];
  const base = new THREE.Vector3(0, -0.3, 0);
  const top = new THREE.Vector3(S.lean * rng.float(-1, 1), S.trunkH, S.lean * rng.float(-1, 1));
  limb(base, top, S.trunkR * 1.15, S.trunkR * 0.62, trunk, S.trunk, 0, 0.15, S.trunkH > 1);
  if (S.branches > 0) {
    const grow = (from, dir, len, r, depth, flex) => {
      const to = from.clone().addScaledVector(dir, len);
      limb(from, to, r, r * 0.55, trunk, S.trunk, flex, flex + 0.15);
      if (depth <= 0) { tips.push(to); return; }
      const n = 2 + rng.int(0, 1);
      for (let i = 0; i < n; i++) {
        const nd = dir.clone();
        nd.x += rng.float(-0.9, 0.9); nd.z += rng.float(-0.9, 0.9); nd.y += rng.float(-0.2, 0.5);
        grow(to, nd.normalize(), len * rng.float(0.55, 0.8), r * 0.55, depth - 1, flex + 0.15);
      }
    };
    for (let i = 0; i < S.branches; i++) {
      const a = (i / S.branches) * Math.PI * 2 + rng.float(-0.4, 0.4);
      const dir = new THREE.Vector3(Math.cos(a) * 0.8, rng.float(0.5, 1.1), Math.sin(a) * 0.8).normalize();
      const from = top.clone().lerp(base, rng.float(0, 0.35));
      grow(from, dir, S.canopy[0] * rng.float(0.45, 0.7), S.trunkR * 0.6, S.depth - 1, 0.15);
    }
  } else tips.push(top);

  const center = new THREE.Vector3(0, S.trunkH + S.canopy[1] * 0.35, 0);
  if (S.layers) {
    const per = Math.round(leafCount / S.layers);
    for (let l = 0; l < S.layers; l++) {
      const t = l / (S.layers - 1 || 1);
      const y = S.trunkH * (0.45 + 0.6 * t);
      const r = S.canopy[0] * (1.25 - 0.75 * t);
      const spread = name === 'bonsai' ? 0.7 : 0.4;
      const off = new THREE.Vector3(rng.float(-spread, spread), y, rng.float(-spread, spread));
      // a branch reaching each layer
      limb(new THREE.Vector3(0, y - 0.4, 0), off.clone().setY(y), S.trunkR * 0.6, S.trunkR * 0.25, trunk, S.trunk, 0.1, 0.35);
      leafCloud(off, [r, S.canopy[1], r], per, S, rng, leaves, 0.55 + 0.3 * t);
    }
  } else if (tips.length > 1) {
    const per = Math.max(8, Math.round(leafCount / (tips.length + 1)));
    for (const tip of tips) leafCloud(tip, [S.canopy[0] * 0.42, S.canopy[1] * 0.45, S.canopy[2] * 0.42], per, S, rng, leaves, 0.7);
    leafCloud(center, [S.canopy[0] * 0.72, S.canopy[1] * 0.72, S.canopy[2] * 0.72], per, S, rng, leaves, 0.65);
  } else {
    leafCloud(center.setY(S.trunkH + S.canopy[1] * 0.3), S.canopy, leafCount, S, rng, leaves, 0.55);
  }
  if (S.pot) {
    const pot = new THREE.CylinderGeometry(0.55, 0.42, 0.5, 16);
    pot.translate(0, -0.05, 0);
    trunk.push(withAttrs(pot, 0x6b6560, 0, 0, 0, 1));
  }
  const t = mergeGeometries(trunk, false), l = mergeGeometries(leaves, false);
  t.computeBoundingSphere(); l.computeBoundingSphere();
  return { trunk: t, leaves: l };
}

// ----------------------------------------------------------------------------- placement
function nearPath(x, z, m) {
  for (let i = 0; i < TEMPLE_PATH.length - 1; i++) {
    const [ax, az] = TEMPLE_PATH[i], [bx, bz] = TEMPLE_PATH[i + 1];
    const vx = bx - ax, vz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz)));
    if (Math.hypot(x - ax - vx * t, z - az - vz * t) < m) return true;
  }
  return false;
}

export function placeFlora(terrain, rng, quality, solids) {
  const density = quality >= 1 ? 1 : 0.6;
  const out = { cherry: [], pine: [], mulberry: [], maple: [], tea: [], bonsai: [] };
  const taken = [];
  const free = (x, z, r) => { for (const t of taken) if (Math.hypot(t.x - x, t.z - z) < t.r + r) return false; return true; };
  const inPaddy = (x, z) => Math.abs(x - PADDY.x) < PADDY.w / 2 + 6 && Math.abs(z - PADDY.z) < PADDY.h / 2 + 6;
  const nearLake = (x, z, m = 3) => LAKES.some((L) => Math.hypot(x - L.x, z - L.z) < L.r + m);
  const stepAngles = [0, Math.PI / 2, Math.PI, -Math.PI / 2];

  const tryPlace = (species, x, z, spacing, scale) => {
    const d = Math.hypot(x, z);
    if (Math.max(Math.abs(x), Math.abs(z)) > PLAY_LIMIT - 4) return false;
    if (terrain.isWater(x, z) || inPaddy(x, z)) return false;
    if (terrain.slopeAt(x, z) > 0.42) return false;
    if (nearPath(x, z, species === 'tea' ? 1.6 : 2.8)) return false;
    if (solids.topAt(x, z) > terrain.heightAt(x, z) + 0.05) return false;           // not on structures
    if (d < TEMPLE_RADIUS + 3) {
      const a = Math.atan2(z, x);
      if (stepAngles.some((s) => Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s))) < 0.32)) return false;  // keep the stairs clear
    }
    if (!free(x, z, spacing)) return false;
    if (d < TEMPLE_RADIUS + 6 && species !== 'bonsai' && species !== 'tea') return false;
    const y = terrain.heightAt(x, z);
    out[species].push({ x, y, z, rot: rng.float(0, Math.PI * 2), scale });
    taken.push({ x, z, r: spacing });
    const cr = SPECIES[species].collider * scale;
    if (cr > 0) solids.addCircle(x, z, cr, Infinity);
    return true;
  };

  // Tea plant rows around the temple grounds, juniper bonsai at the platform's foot
  for (let ring = 0; ring < 2; ring++) {
    const R = TEMPLE_RADIUS + 14 + ring * 7;
    const n = Math.round(R * 0.9 * density);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (Math.sin(a * 2.5) > 0.6) continue;
      tryPlace('tea', Math.cos(a) * R + rng.float(-0.6, 0.6), Math.sin(a) * R + rng.float(-0.6, 0.6), 0.8, rng.float(0.8, 1.2));
    }
  }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.26; tryPlace('bonsai', Math.cos(a) * 26.5, Math.sin(a) * 26.5, 1.2, rng.float(0.85, 1.1)); }
  // Cherry blossoms line the path and crown the hill slopes
  for (let k = 0; k < 14; k++) { const p = TEMPLE_PATH[1 + (k % (TEMPLE_PATH.length - 1))]; tryPlace('cherry', p[0] + (k % 2 ? 5 : -5) + rng.float(-1, 1), p[1] + rng.float(-2, 2), 4.2, rng.float(0.9, 1.2)); }
  for (let i = 0; i < 70 * density; i++) { const a = rng.float(0, Math.PI * 2), r = rng.float(TEMPLE_RADIUS + 10, 95); tryPlace('cherry', Math.cos(a) * r, Math.sin(a) * r, 4.5, rng.float(0.8, 1.25)); }
  for (let i = 0; i < 260 * density; i++) {
    const x = rng.float(-PLAY_LIMIT, PLAY_LIMIT), z = rng.float(-PLAY_LIMIT, PLAY_LIMIT);
    const d = Math.hypot(x, z);
    if (d < 60) continue;
    let species;
    if (nearLake(x, z, 14)) species = rng.pick(['maple', 'maple', 'cherry', 'mulberry']);
    else if (d < 150) species = rng.weighted({ mulberry: 3, maple: 3, cherry: 2, pine: 1 });
    else species = rng.weighted({ pine: 5, maple: 1.5, mulberry: 1 });
    tryPlace(species, x, z, species === 'pine' ? 3.2 : 4.2, rng.float(0.75, 1.3));
  }
  for (let i = 0; i < 300 * density; i++) {
    const x = rng.float(-PLAY_LIMIT, PLAY_LIMIT), z = rng.float(-PLAY_LIMIT, PLAY_LIMIT);
    if (Math.hypot(x, z) < 140) continue;
    tryPlace('pine', x, z, 3.0, rng.float(0.8, 1.4));
  }
  for (let i = 0; i < 24 * density; i++) tryPlace('mulberry', PADDY.x + rng.float(-PADDY.w / 2, PADDY.w / 2), PADDY.z + PADDY.h / 2 + 8 + rng.float(0, 18), 4, rng.float(0.8, 1.1));
  return { placements: out };
}

export function buildFloraMeshes(placements, rng, quality, shadows) {
  const group = new THREE.Group();
  group.name = 'flora';
  const atlas = foliageAtlas();
  const bark = barkTexture();
  for (const species in placements) {
    const list = placements[species];
    if (!list.length) continue;
    const S = SPECIES[species];
    const nv = species === 'tea' ? 1 : 2;
    const variants = [];
    for (let v = 0; v < nv; v++) variants.push(buildTreeGeometry(species, rng.fork(`${species}${v}`), quality));
    const windOpts = { scale: S.sway, flutter: S.flutter };
    const trunkMat = applyWind(new THREE.MeshStandardMaterial({ map: bark, vertexColors: true, roughness: 0.95 }), windOpts);
    const leafMat = applyWind(new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true, roughness: 0.8, alphaTest: 0.45, side: THREE.DoubleSide, alphaToCoverage: true }), { ...windOpts, twoSided: true });
    const trunkDepth = applyWind(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), windOpts);
    const leafDepth = applyWind(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.45, side: THREE.DoubleSide }), windOpts);
    for (let v = 0; v < nv; v++) {
      const items = list.filter((_, i) => i % nv === v);
      if (!items.length) continue;
      const tm = new THREE.InstancedMesh(variants[v].trunk, trunkMat, items.length);
      const lm = new THREE.InstancedMesh(variants[v].leaves, leafMat, items.length);
      tm.customDepthMaterial = trunkDepth; lm.customDepthMaterial = leafDepth;
      tm.castShadow = lm.castShadow = shadows && species !== 'tea';
      tm.receiveShadow = true; lm.receiveShadow = false;
      items.forEach((p, i) => {
        _q.setFromAxisAngle(UP, p.rot);
        _m.compose(_v.set(p.x, p.y, p.z), _q, new THREE.Vector3(p.scale, p.scale, p.scale));
        tm.setMatrixAt(i, _m); lm.setMatrixAt(i, _m);
        lm.setColorAt(i, _c.setRGB(1, 1, 1).offsetHSL(rng.float(-0.015, 0.015), 0, rng.float(-0.06, 0.04)));
      });
      for (const m of [tm, lm]) { m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.name = `flora-${species}-${v}`; group.add(m); }
    }
  }
  return group;
}

// ----------------------------------------------------------------------------- petals
/** Cherry petals drifting on the breeze around the player. */
export class Petals {
  constructor(count = 220) {
    this.count = count;
    const g = new THREE.PlaneGeometry(0.12, 0.09);
    const mat = new THREE.MeshBasicMaterial({ color: 0xf2a3c0, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    this.mesh = new THREE.InstancedMesh(g, mat, count);
    this.mesh.frustumCulled = false;
    this.p = new Float32Array(count * 3);
    this.seed = new Float32Array(count);
    for (let i = 0; i < count; i++) { this.seed[i] = Math.random(); this.p[i * 3] = (Math.random() - 0.5) * 60; this.p[i * 3 + 1] = Math.random() * 10; this.p[i * 3 + 2] = (Math.random() - 0.5) * 60; }
    this.radius = 32;
    this._e = new THREE.Euler(); this._s = new THREE.Vector3(1, 1, 1);
  }
  update(dt, px, pz, terrain) {
    const wd = wind.uniforms.uWindDir.value, ws = wind.uniforms.uWindStrength.value;
    const t = wind.time;
    for (let i = 0; i < this.count; i++) {
      const s = this.seed[i];
      let x = this.p[i * 3], y = this.p[i * 3 + 1], z = this.p[i * 3 + 2];
      x += (wd.x * (1.2 + ws * 2.5) + Math.sin(t * 1.3 + s * 20) * 0.8) * dt;
      z += (wd.y * (1.2 + ws * 2.5) + Math.cos(t * 1.1 + s * 17) * 0.8) * dt;
      y -= (0.5 + s * 0.6) * dt;
      const ground = terrain.heightAt(x, z);
      if (y < ground + 0.05 || Math.abs(x - px) > this.radius || Math.abs(z - pz) > this.radius) {
        x = px + (Math.random() - 0.5) * this.radius * 1.8 - wd.x * this.radius * 0.6;
        z = pz + (Math.random() - 0.5) * this.radius * 1.8 - wd.y * this.radius * 0.6;
        y = terrain.heightAt(x, z) + 3 + Math.random() * 8;
      }
      this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
      _q.setFromEuler(this._e.set(t * 2 + s * 10, t * 1.5 + s * 5, s * 6));
      _m.compose(_v.set(x, y, z), _q, this._s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
