// Trees, shrubs, grass and petals. Each tree species is ONE merged geometry
// (branching trunk + hundreds of individual leaf quads) instanced across the map, so a
// whole forest of fluttering leaves costs a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { applyWind, wind } from './wind.js';
import { Rng } from '../../shared/rng.js';
import { PLAY_LIMIT, TEMPLE_RADIUS, PADDY, LAKES } from './terrain.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

// ----------------------------------------------------------------------------- species
export const SPECIES = {
  cherry:   { trunk: 0x5a4030, leaf: [0xf7b6cf, 0xffd9e6, 0xf096b8], trunkH: 3.4, trunkR: 0.28, branches: 5, depth: 2, canopy: [3.4, 2.2, 3.4], leafSize: 0.32, leaves: 820, lean: 0.25, collider: 0.5, sway: 0.55, flutter: 0.1 },
  pine:     { trunk: 0x8f4b2c, leaf: [0x2f5e3a, 0x3a7046, 0x244a2d], trunkH: 7.5, trunkR: 0.34, branches: 0, depth: 0, layers: 4, canopy: [2.6, 1.0, 2.6], leafSize: 0.42, leaves: 720, lean: 0.08, collider: 0.55, sway: 0.35, flutter: 0.05 },
  mulberry: { trunk: 0x6b4a32, leaf: [0x5c9a3c, 0x78b64c, 0x4b8530], trunkH: 2.6, trunkR: 0.3, branches: 4, depth: 2, canopy: [3.0, 2.6, 3.0], leafSize: 0.42, leaves: 700, lean: 0.15, collider: 0.5, sway: 0.5, flutter: 0.09 },
  maple:    { trunk: 0x4f3a2c, leaf: [0xc8452a, 0xe0782e, 0xb8302b], trunkH: 2.2, trunkR: 0.2, branches: 5, depth: 2, canopy: [2.9, 1.6, 2.9], leafSize: 0.3, leaves: 760, lean: 0.3, collider: 0.4, sway: 0.6, flutter: 0.11 },
  tea:      { trunk: 0x4a3a2a, leaf: [0x3b6b35, 0x4b7f3f, 0x325c2c], trunkH: 0.35, trunkR: 0.06, branches: 0, depth: 0, canopy: [1.0, 0.8, 1.0], leafSize: 0.18, leaves: 170, lean: 0, collider: 0, sway: 0.25, flutter: 0.08 },
  bonsai:   { trunk: 0x5a4538, leaf: [0x2d5a33, 0x3a6e3f, 0x24482a], trunkH: 1.1, trunkR: 0.12, branches: 3, depth: 1, layers: 3, canopy: [1.1, 0.5, 1.1], leafSize: 0.16, leaves: 220, lean: 0.6, collider: 0.35, sway: 0.2, flutter: 0.06, pot: true },
};

/** Build a cylinder segment between two points. */
function limb(a, b, r0, r1, geoms, color, flex0, flex1) {
  const dir = _v.copy(b).sub(a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1, false);
  g.translate(0, len / 2, 0);
  _q.setFromUnitVectors(UP, dir.normalize());
  g.applyQuaternion(_q);
  g.translate(a.x, a.y, a.z);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3), flex = new Float32Array(n), phase = new Float32Array(n);
  _c.setHex(color);
  for (let i = 0; i < n; i++) {
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    // vertices in the top half of the segment belong to flex1
    const y = g.attributes.position.getY(i) - a.y;
    const t = THREE.MathUtils.clamp(y / Math.max(0.001, b.y - a.y), 0, 1);
    flex[i] = THREE.MathUtils.lerp(flex0, flex1, t);
    phase[i] = 0;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFlex', new THREE.BufferAttribute(flex, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geoms.push(g);
}

/** Scatter N leaf quads in an ellipsoid. Every leaf has its own phase, flex rises toward its tip. */
function leafCloud(center, radii, count, size, colors, rng, geoms, baseFlex = 0.75) {
  const n = count * 4;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  const flex = new Float32Array(n), phase = new Float32Array(n), idx = new Uint32Array(count * 6);
  const ca = new THREE.Color(colors[0]), cb = new THREE.Color(colors[1]), cc = new THREE.Color(colors[2]);
  const corners = [new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(0, 0, 0.9), new THREE.Vector3(0.5, 0, 0), new THREE.Vector3(0, 0, -0.1)];
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < count; i++) {
    // random point in ellipsoid biased toward the shell for a fuller silhouette
    let x, y, z, d;
    do { x = rng.float(-1, 1); y = rng.float(-1, 1); z = rng.float(-1, 1); d = x * x + y * y + z * z; } while (d > 1);
    const shell = Math.pow(d, 0.35);
    const len = Math.sqrt(d) || 1;
    x = x / len * shell; y = y / len * shell; z = z / len * shell;
    const cx = center.x + x * radii[0], cy = center.y + y * radii[1], cz = center.z + z * radii[2];
    e.set(rng.float(-0.9, 0.9), rng.float(0, Math.PI * 2), rng.float(-0.6, 0.6));
    q.setFromEuler(e);
    const s = size * rng.float(0.7, 1.3);
    const ph = rng.next();
    const tint = rng.next();
    _c.copy(ca).lerp(cb, tint).lerp(cc, rng.next() * 0.5);
    // leaves at the outer shell and top are lit brighter
    const light = 0.85 + 0.3 * (0.5 + 0.5 * y) * shell;
    const nx = x, ny = 0.6 + y * 0.5, nz = z;
    for (let k = 0; k < 4; k++) {
      const v = corners[k].clone().multiplyScalar(s).applyQuaternion(q);
      const vi = i * 4 + k;
      pos[vi * 3] = cx + v.x; pos[vi * 3 + 1] = cy + v.y; pos[vi * 3 + 2] = cz + v.z;
      col[vi * 3] = _c.r * light; col[vi * 3 + 1] = _c.g * light; col[vi * 3 + 2] = _c.b * light;
      nor[vi * 3] = nx; nor[vi * 3 + 1] = ny; nor[vi * 3 + 2] = nz;
      flex[vi] = k === 1 ? 1.0 : baseFlex + 0.1 * shell;
      phase[vi] = ph;
    }
    idx[i * 6] = i * 4; idx[i * 6 + 1] = i * 4 + 1; idx[i * 6 + 2] = i * 4 + 2;
    idx[i * 6 + 3] = i * 4; idx[i * 6 + 4] = i * 4 + 2; idx[i * 6 + 5] = i * 4 + 3;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFlex', new THREE.BufferAttribute(flex, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  geoms.push(g);
}

/** Build one tree of a species as a single merged geometry. */
export function buildTreeGeometry(name, rng, quality = 1) {
  const S = SPECIES[name];
  const geoms = [];
  const leafCount = Math.max(40, Math.round(S.leaves * quality));
  const tips = [];
  const base = new THREE.Vector3(0, -0.3, 0);
  if (S.trunkH > 0.2) {
    const top = new THREE.Vector3(S.lean * rng.float(-1, 1), S.trunkH, S.lean * rng.float(-1, 1));
    limb(base, top, S.trunkR * 1.15, S.trunkR * 0.6, geoms, S.trunk, 0, 0.15);
    if (S.branches > 0) {
      const grow = (from, dir, len, r, depth, flex) => {
        const to = from.clone().addScaledVector(dir, len);
        limb(from, to, r, r * 0.55, geoms, S.trunk, flex, flex + 0.15);
        if (depth <= 0) { tips.push(to); return; }
        const n = depth === S.depth ? S.branches : 2 + rng.int(0, 1);
        for (let i = 0; i < n; i++) {
          const nd = dir.clone();
          nd.x += rng.float(-0.9, 0.9); nd.z += rng.float(-0.9, 0.9); nd.y += rng.float(-0.2, 0.5);
          nd.normalize();
          grow(to, nd, len * rng.float(0.55, 0.8), r * 0.55, depth - 1, flex + 0.15);
        }
      };
      for (let i = 0; i < S.branches; i++) {
        const a = (i / S.branches) * Math.PI * 2 + rng.float(-0.4, 0.4);
        const dir = new THREE.Vector3(Math.cos(a) * 0.8, rng.float(0.5, 1.1), Math.sin(a) * 0.8).normalize();
        const from = top.clone().lerp(base, rng.float(0, 0.35));
        grow(from, dir, S.canopy[0] * rng.float(0.45, 0.7), S.trunkR * 0.6, S.depth - 1, 0.15);
      }
    } else tips.push(top);
  }
  // Canopy: leaf clouds around branch tips (or layered discs for pines / bonsai)
  const center = new THREE.Vector3(0, S.trunkH + S.canopy[1] * 0.35, 0);
  if (S.layers) {
    const per = Math.round(leafCount / S.layers);
    for (let l = 0; l < S.layers; l++) {
      const t = l / (S.layers - 1 || 1);
      const y = S.trunkH * (0.45 + 0.6 * t);
      const r = S.canopy[0] * (1.25 - 0.75 * t) * (name === 'bonsai' ? 1 : 1);
      const off = name === 'bonsai' ? new THREE.Vector3(rng.float(-0.7, 0.7), 0, rng.float(-0.7, 0.7)) : new THREE.Vector3(rng.float(-0.4, 0.4), 0, rng.float(-0.4, 0.4));
      if (name === 'bonsai') limb(new THREE.Vector3(0, y - 0.5, 0), off.clone().setY(y), S.trunkR * 0.7, S.trunkR * 0.3, geoms, S.trunk, 0.1, 0.3);
      leafCloud(off.setY(y), [r, S.canopy[1], r], per, S.leafSize, S.leaf, rng, geoms, 0.55 + 0.3 * t);
    }
  } else if (tips.length > 1) {
    const per = Math.max(8, Math.round(leafCount / (tips.length + 1)));
    for (const tip of tips) leafCloud(tip, [S.canopy[0] * 0.42, S.canopy[1] * 0.45, S.canopy[2] * 0.42], per, S.leafSize, S.leaf, rng, geoms, 0.7);
    leafCloud(center, [S.canopy[0] * 0.75, S.canopy[1] * 0.75, S.canopy[2] * 0.75], per, S.leafSize, S.leaf, rng, geoms, 0.65);
  } else {
    leafCloud(center.setY(S.trunkH + S.canopy[1] * 0.3), S.canopy, leafCount, S.leafSize, S.leaf, rng, geoms, 0.6);
  }
  if (S.pot) {
    const pot = new THREE.CylinderGeometry(0.55, 0.42, 0.5, 10);
    pot.translate(0, -0.05, 0);
    const n = pot.attributes.position.count;
    const col = new Float32Array(n * 3).fill(0.42), flex = new Float32Array(n), phase = new Float32Array(n);
    for (let i = 0; i < n; i++) { col[i * 3 + 1] = 0.4; col[i * 3 + 2] = 0.38; }
    pot.setAttribute('color', new THREE.BufferAttribute(col, 3));
    pot.setAttribute('aFlex', new THREE.BufferAttribute(flex, 1));
    pot.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geoms.push(pot);
  }
  for (const g of geoms) if (g.attributes.uv) g.deleteAttribute('uv');
  const merged = mergeGeometries(geoms, false);
  merged.computeBoundingSphere();
  return merged;
}

// ----------------------------------------------------------------------------- placement
export function placeFlora(terrain, rng, quality) {
  const density = quality >= 1 ? 1 : 0.55;
  const out = { cherry: [], pine: [], mulberry: [], maple: [], tea: [], bonsai: [] };
  const colliders = [];
  const taken = [];
  const free = (x, z, r) => {
    for (const t of taken) if (Math.hypot(t.x - x, t.z - z) < t.r + r) return false;
    return true;
  };
  const inPaddy = (x, z) => Math.abs(x - PADDY.x) < PADDY.w / 2 + 6 && Math.abs(z - PADDY.z) < PADDY.h / 2 + 6;
  const nearLake = (x, z, m = 3) => LAKES.some((L) => Math.hypot(x - L.x, z - L.z) < L.r + m);

  const tryPlace = (species, x, z, spacing, scale) => {
    const d = Math.hypot(x, z);
    if (Math.max(Math.abs(x), Math.abs(z)) > PLAY_LIMIT - 4) return false;
    if (terrain.isWater(x, z) || inPaddy(x, z)) return false;
    if (terrain.slopeAt(x, z) > 0.42) return false;
    if (!free(x, z, spacing)) return false;
    if (d < TEMPLE_RADIUS + 6 && species !== 'bonsai' && species !== 'tea') return false;
    const y = terrain.heightAt(x, z);
    out[species].push({ x, y, z, rot: rng.float(0, Math.PI * 2), scale });
    taken.push({ x, z, r: spacing });
    const cr = SPECIES[species].collider * scale;
    if (cr > 0) colliders.push({ x, z, r: cr });
    return true;
  };

  // Tea plant rows & juniper bonsai around the temple grounds
  for (let ring = 0; ring < 2; ring++) {
    const R = TEMPLE_RADIUS + 14 + ring * 7;
    const n = Math.round(R * 0.9 * density);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (Math.sin(a * 2.5) > 0.6) continue; // gaps in the rows for paths
      tryPlace('tea', Math.cos(a) * R + rng.float(-0.6, 0.6), Math.sin(a) * R + rng.float(-0.6, 0.6), 0.8, rng.float(0.8, 1.2));
    }
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    const R = TEMPLE_RADIUS - 4;
    tryPlace('bonsai', Math.cos(a) * R, Math.sin(a) * R, 1.2, rng.float(0.8, 1.1));
  }
  // Cherry blossoms line the paths and crown the hill slopes
  for (let i = 0; i < 70 * density; i++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(TEMPLE_RADIUS + 10, 95);
    tryPlace('cherry', Math.cos(a) * r, Math.sin(a) * r, 4.5, rng.float(0.8, 1.25));
  }
  // Mid-distance mix: mulberry, maple, cherry groves
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
  // Dense pine forest on the outer wilds
  for (let i = 0; i < 300 * density; i++) {
    const x = rng.float(-PLAY_LIMIT, PLAY_LIMIT), z = rng.float(-PLAY_LIMIT, PLAY_LIMIT);
    if (Math.hypot(x, z) < 140) continue;
    tryPlace('pine', x, z, 3.0, rng.float(0.8, 1.4));
  }
  // Mulberry orchard near the paddies
  for (let i = 0; i < 24 * density; i++) {
    tryPlace('mulberry', PADDY.x + rng.float(-PADDY.w / 2, PADDY.w / 2), PADDY.z + PADDY.h / 2 + 8 + rng.float(0, 18), 4, rng.float(0.8, 1.1));
  }
  return { placements: out, colliders };
}

export function buildFloraMeshes(placements, rng, quality, shadows) {
  const group = new THREE.Group();
  group.name = 'flora';
  for (const species in placements) {
    const list = placements[species];
    if (!list.length) continue;
    // A couple of geometry variants per species keep the forest from looking cloned
    const variants = [];
    const nv = species === 'tea' ? 1 : 2;
    for (let v = 0; v < nv; v++) variants.push(buildTreeGeometry(species, rng.fork(`${species}${v}`), quality));
    const S = SPECIES[species];
    const mat = applyWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }), { scale: S.sway, flutter: S.flutter });
    for (let v = 0; v < nv; v++) {
      const items = list.filter((_, i) => i % nv === v);
      if (!items.length) continue;
      const mesh = new THREE.InstancedMesh(variants[v], mat, items.length);
      mesh.castShadow = shadows && species !== 'tea';
      mesh.receiveShadow = false;
      items.forEach((p, i) => {
        _q.setFromAxisAngle(UP, p.rot);
        _m.compose(_v.set(p.x, p.y, p.z), _q, new THREE.Vector3(p.scale, p.scale, p.scale));
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, _c.setHSL(0, 0, 1).offsetHSL(rng.float(-0.015, 0.015), 0, rng.float(-0.06, 0.06)));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.name = `flora-${species}-${v}`;
      group.add(mesh);
    }
  }
  return group;
}

// ----------------------------------------------------------------------------- grass carpet
export class GrassCarpet {
  constructor(terrain, count, radius) {
    this.terrain = terrain;
    this.count = count;
    this.radius = radius;
    this.cell = 1.0;
    this.lastCx = 1e9; this.lastCz = 1e9;
    // A curved blade: 3 segments, flex rises with height
    const g = new THREE.BufferGeometry();
    const segs = 3, pos = [], nor = [], flex = [], phase = [], idx = [], col = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs, w = 0.06 * (1 - t) + 0.005, y = t, bend = t * t * 0.1;
      pos.push(-w, y, bend, w, y, bend);
      nor.push(0, 0.3, 1, 0, 0.3, 1);
      flex.push(t, t); phase.push(0, 0);
      const shade = 0.55 + 0.45 * t;
      col.push(shade, shade, shade, shade, shade, shade);
    }
    for (let s = 0; s < segs; s++) {
      const a = s * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aFlex', new THREE.Float32BufferAttribute(flex, 1));
    g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
    g.setIndex(idx);
    const mat = applyWind(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), { scale: 0.35, flutter: 0.06 });
    this.mesh = new THREE.InstancedMesh(g, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'grass';
    this.mesh.receiveShadow = true;
    this.colorA = new THREE.Color(0x6fb04a); this.colorB = new THREE.Color(0x3f7a2e);
    this.colorRice = new THREE.Color(0x9ad15a);
    this.update(0, 0, true);
  }
  /** Widen the carpet (same blade budget, sparser) when the camera is high. */
  setRadius(r) { if (r !== this.radius) { this.radius = r; this.lastCx = 1e9; } }
  /** Rebuild the carpet around (px,pz) when the player moved enough. Deterministic per cell. */
  update(px, pz, force = false) {
    const cx = Math.floor(px / this.cell), cz = Math.floor(pz / this.cell);
    if (!force && Math.abs(cx - this.lastCx) < 3 && Math.abs(cz - this.lastCz) < 3) return;
    this.lastCx = cx; this.lastCz = cz;
    const R = this.radius, cells = Math.ceil(R / this.cell);
    const perCell = Math.max(1, Math.round(this.count / (Math.PI * cells * cells)));
    let i = 0;
    const T = this.terrain;
    for (let dz = -cells; dz <= cells && i < this.count; dz++) {
      for (let dx = -cells; dx <= cells && i < this.count; dx++) {
        if (dx * dx + dz * dz > cells * cells) continue;
        const gx = cx + dx, gz = cz + dz;
        let h = (gx * 73856093) ^ (gz * 19349663);
        for (let k = 0; k < perCell && i < this.count; k++) {
          h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16;
          const r1 = (h >>> 0) / 4294967296;
          h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13;
          const r2 = (h >>> 0) / 4294967296;
          h = Math.imul(h ^ 0x9e3779b9, 2654435761);
          const r3 = (h >>> 0) / 4294967296;
          let x = (gx + r1) * this.cell, z = (gz + r2) * this.cell;
          const inPaddy = Math.abs(x - PADDY.x) < PADDY.w / 2 - 1 && Math.abs(z - PADDY.z) < PADDY.h / 2 - 1;
          if (inPaddy) { x = Math.round(x / 0.9) * 0.9; z = Math.round(z / 0.9) * 0.9; }
          const y = T.heightAt(x, z);
          const water = T.waterLevelAt(x, z);
          const d = Math.hypot(x, z);
          const bad = (!inPaddy && y < water + 0.25) || d < TEMPLE_RADIUS + 1 || T.slopeAt(x, z) > 0.4 || y > 24;
          if (bad) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); i++; continue; }
          const s = inPaddy ? 0.7 + r3 * 0.3 : 0.36 + r3 * 0.42;
          _q.setFromAxisAngle(UP, r1 * 6.283);
          _m.compose(_v.set(x, inPaddy ? water - 0.1 : y - 0.02, z), _q, new THREE.Vector3(s * 1.1, s, s * 1.1));
          this.mesh.setMatrixAt(i, _m);
          if (inPaddy) _c.copy(this.colorRice); else _c.copy(this.colorA).lerp(this.colorB, r2);
          this.mesh.setColorAt(i, _c);
          i++;
        }
      }
    }
    for (; i < this.count; i++) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
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
      _q.setFromEuler(new THREE.Euler(t * 2 + s * 10, t * 1.5 + s * 5, s * 6));
      _m.compose(_v.set(x, y, z), _q, new THREE.Vector3(1, 1, 1));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
