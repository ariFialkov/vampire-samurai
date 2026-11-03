// Felling trees. Melee hits chip away at a tree (it shudders and spits wood chips); when it
// goes, it topples in the direction the guardian was facing, crushing whatever it lands on.
// The canopy bursts into leaves on impact and the trunk becomes a log. A log lying across a
// slope rolls downhill, gathering speed and flattening monsters (and grass) in its path.
import * as THREE from 'three';
import { SPECIES } from './foliage.js';

const FELLABLE = { cherry: 80, maple: 70, mulberry: 85, pine: 110 };     // hit points at scale 1
const LEAF_FX = { cherry: [0xffd6e4, 0xf7a8c4, 0xffffff], maple: [0xd8452a, 0xf0782e, 0xb8302b], mulberry: [0x5c9a3c, 0x78b64c], pine: [0x2f5e3a, 0x3d7448] };
const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}

/** Log geometry: a bark cylinder lying along +x, with the attributes the wind shader expects. */
function logGeometry(r, len, color) {
  const g = new THREE.CylinderGeometry(r, r * 0.88, len, 12, 1, false);
  g.rotateZ(Math.PI / 2);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3); _c.setHex(color);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r * 0.9; col[i * 3 + 1] = _c.g * 0.9; col[i * 3 + 2] = _c.b * 0.9; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFlex', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(n), 1));
  return g;
}

function single(geo, mat, depth, color) {
  const m = new THREE.InstancedMesh(geo, mat, 1);
  m.setMatrixAt(0, new THREE.Matrix4());
  if (color) m.setColorAt(0, color);
  m.customDepthMaterial = depth;
  m.castShadow = true; m.frustumCulled = false;
  return m;
}

export class Forest {
  constructor(world, scene, treeSpots) {
    this.world = world; this.scene = scene;
    this.trees = treeSpots.filter((t) => FELLABLE[t.species] && t.tm);
    for (const t of this.trees) { t.hp = FELLABLE[t.species] * t.scale; t.shake = 0; }
    this.cell = 8;
    this.grid = new Map();
    for (const t of this.trees) {
      const k = Math.floor(t.x / this.cell) * 65536 + Math.floor(t.z / this.cell);
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(t);
    }
    this.falling = [];
    this.logs = [];
    this.dirty = new Set();
  }

  nearby(x, z) {
    const out = [];
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const b = this.grid.get((cx + dx) * 65536 + cz + dz); if (b) out.push(...b); }
    return out;
  }

  setInstance(t, matrix) {
    t.tm.setMatrixAt(t.index, matrix); t.lm.setMatrixAt(t.index, matrix);
    this.dirty.add(t.tm); this.dirty.add(t.lm);
  }
  baseMatrix(t, tilt = 0, tiltDir = null) {
    _q.setFromAxisAngle(UP, t.rot);
    if (tilt && tiltDir) _q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(tiltDir.z, 0, -tiltDir.x), tilt));
    return _m.compose(_v.set(t.x, t.y, t.z), _q, _s.set(t.scale, t.scale, t.scale));
  }

  /**
   * A melee swing from `pos` facing `facing`. Damages the nearest standing tree inside the
   * weapon's reach and arc; returns true if a tree was struck.
   */
  hit(pos, facing, range, arc, damage, ctx) {
    const fx = Math.sin(facing), fz = Math.cos(facing);
    let best = null, bd = Infinity;
    for (const t of this.nearby(pos.x, pos.z)) {
      if (t.felled) continue;
      const dx = t.x - pos.x, dz = t.z - pos.z, d = Math.hypot(dx, dz);
      const reach = range + SPECIES[t.species].collider * t.scale;
      if (d > reach || d < 0.01) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d)));
      if (ang > Math.max(0.5, arc / 2)) continue;
      if (d < bd) { bd = d; best = t; }
    }
    if (!best) return false;
    const t = best;
    t.hp -= damage;
    t.shake = 0.3; t.shakeDir = new THREE.Vector3(fx, 0, fz);
    ctx.effects.burst(new THREE.Vector3(t.x - fx * 0.3, t.y + 1.0, t.z - fz * 0.3), { count: 10, color: [0xc8a26a, 0x8a6a44, 0xe8d4a8], speed: 3.5, life: 0.5, size: 0.7, gravity: 9 });
    ctx.sound?.('hit');
    if (t.hp <= 0) this.fell(t, fx, fz, ctx);
    return true;
  }

  fell(t, fx, fz, ctx) {
    t.felled = true;
    if (t.solid) t.solid.off = true;
    this.setInstance(t, ZERO);
    const S = SPECIES[t.species];
    // a stump stays behind (short enough to step onto)
    const stumpH = 0.38 * t.scale;
    const stump = single(logGeometry(S.trunkR * 1.2 * t.scale, stumpH, S.trunk).rotateZ(-Math.PI / 2), t.mats.trunk, t.mats.trunkDepth);
    stump.position.set(t.x, t.y + stumpH / 2 - 0.05, t.z);
    this.scene.add(stump);
    const stumpSolid = this.world.solids.addCircle(t.x, t.z, S.trunkR * 1.2 * t.scale + 0.1, t.y + stumpH);
    (this.stumps ??= []).push({ mesh: stump, solid: stumpSolid });
    // the tree itself, pivoting about its base
    const pivot = new THREE.Group(); pivot.position.set(t.x, t.y, t.z);
    const inner = new THREE.Group(); inner.rotation.y = t.rot; inner.scale.setScalar(t.scale); pivot.add(inner);
    const col = new THREE.Color(); t.lm.getColorAt(t.index, col);
    inner.add(single(t.geo.trunk, t.mats.trunk, t.mats.trunkDepth));
    inner.add(single(t.geo.leaves, t.mats.leaf, t.mats.leafDepth, col));
    this.scene.add(pivot);
    const height = (S.trunkH + S.canopy[1]) * t.scale;
    this.falling.push({ t, pivot, stump, dir: new THREE.Vector3(fx, 0, fz), axis: new THREE.Vector3(fz, 0, -fx), angle: 0.04, omega: 0.25, height, S });
    ctx.sound?.('swing');
  }

  /** Stand every tree back up (new round). */
  reset() {
    for (const t of this.trees) {
      if (t.felled) { t.felled = false; if (t.solid) t.solid.off = false; }
      t.hp = FELLABLE[t.species] * t.scale; t.shake = 0;
      this.setInstance(t, this.baseMatrix(t));
    }
    for (const s of this.stumps ?? []) { this.scene.remove(s.mesh); s.solid.off = true; }
    for (const F of this.falling) this.scene.remove(F.pivot);
    for (const L of this.logs) this.scene.remove(L.mesh);
    this.stumps = []; this.falling = []; this.logs = [];
    for (const m of this.dirty) m.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
  }

  /** Grass-trampling points for logs (so a rolling log leaves a flattened swath). */
  pushers(out) {
    for (const L of this.logs) {
      for (let k = -1; k <= 1; k++) out.push({ id: `log${L.id}:${k}`, x: L.c.x + L.axis.x * k * L.len * 0.4, z: L.c.z + L.axis.z * k * L.len * 0.4, r: L.r + 0.5, log: true });
    }
    return out;
  }

  update(dt, ctx) {
    const W = this.world, T = W.terrain;
    // shudder when struck
    for (const t of this.trees) {
      if (t.shake <= 0 || t.felled) continue;
      t.shake = Math.max(0, t.shake - dt);
      this.setInstance(t, this.baseMatrix(t, Math.sin(t.shake * 40) * 0.05 * (t.shake / 0.3), t.shakeDir));
    }
    // toppling trees
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const F = this.falling[i];
      F.omega += (1.5 * 9.8 / F.height) * Math.sin(F.angle) * dt;
      F.angle += F.omega * dt;
      F.pivot.quaternion.setFromAxisAngle(F.axis, F.angle);
      const tipX = F.t.x + F.dir.x * Math.sin(F.angle) * F.height, tipZ = F.t.z + F.dir.z * Math.sin(F.angle) * F.height;
      const tipY = F.t.y + Math.cos(F.angle) * F.height;
      if (tipY > T.heightAt(tipX, tipZ) + 0.6 && F.angle < 1.75) continue;
      // impact: crush everything under the trunk and canopy
      const width = F.S.canopy[0] * F.t.scale * 0.55;
      let crushed = 0;
      for (const m of ctx.monsters) {
        if (!m.alive || m.ally) continue;
        const d = segDist(m.pos.x, m.pos.z, F.t.x, F.t.z, tipX, tipZ);
        const along = Math.hypot(m.pos.x - F.t.x, m.pos.z - F.t.z) / F.height;
        if (d < m.radius + 0.5 + width * Math.min(1, along * 1.4)) { m.damage(320, 'tree', ctx); crushed++; }
      }
      ctx.shake?.(0.6);
      ctx.sound?.('hit');
      for (let k = 0; k < 6; k++) {
        const f = 0.45 + k * 0.1;
        ctx.effects.burst(new THREE.Vector3(F.t.x + F.dir.x * F.height * f, T.heightAt(F.t.x + F.dir.x * F.height * f, F.t.z + F.dir.z * F.height * f) + 1, F.t.z + F.dir.z * F.height * f), { count: 18, color: LEAF_FX[F.t.species], speed: 4, life: 1.1, size: 1.1, gravity: 2.5, spread: 3 });
      }
      if (crushed > 1) ctx.toast?.(`Timber! ${crushed} crushed`);
      this.scene.remove(F.pivot);
      this.falling.splice(i, 1);
      this.spawnLog(F);
    }
    // logs
    for (let i = this.logs.length - 1; i >= 0; i--) {
      const L = this.logs[i];
      L.life -= dt;
      const gx = (T.heightAt(L.c.x + 1, L.c.z) - T.heightAt(L.c.x - 1, L.c.z)) / 2, gz = (T.heightAt(L.c.x, L.c.z + 1) - T.heightAt(L.c.x, L.c.z - 1)) / 2;
      const nx = -L.axis.z, nz = L.axis.x;                       // roll direction (perpendicular to the log)
      const downhill = -(gx * nx + gz * nz);                      // slope along it (tan of the angle)
      if (Math.abs(downhill) > 0.07 || Math.abs(L.v) > 0.2) L.v += (2 / 3) * 9.8 * downhill * dt;
      L.v *= Math.exp(-(Math.abs(downhill) < 0.05 ? 1.6 : 0.25) * dt);
      L.v = Math.max(-13, Math.min(13, L.v));
      if (Math.abs(L.v) > 0.05) {
        const px = L.c.x + nx * L.v * dt, pz = L.c.z + nz * L.v * dt;
        // stopped by rocks, walls, trees, deep water and the map edge
        const ends = [[px + L.axis.x * L.len * 0.45, pz + L.axis.z * L.len * 0.45], [px, pz], [px - L.axis.x * L.len * 0.45, pz - L.axis.z * L.len * 0.45]];
        const blocked = ends.some(([x, z]) => { const q = W.solids.pushOut(x, z, L.r * 0.8, Math.max(L.c.y - L.r, T.heightAt(x, z))); return Math.hypot(q.x - x, q.z - z) > 0.01 || T.isDeepWater(x, z) || Math.max(Math.abs(x), Math.abs(z)) > 196; });
        if (blocked) { L.v *= -0.25; if (Math.abs(L.v) < 0.6) L.v = 0; }
        else { L.c.x = px; L.c.z = pz; L.spin += (L.v * dt) / L.r; }
      }
      const ground = Math.max(T.heightAt(L.c.x, L.c.z), T.heightAt(L.c.x + L.axis.x * L.len * 0.4, L.c.z + L.axis.z * L.len * 0.4), T.heightAt(L.c.x - L.axis.x * L.len * 0.4, L.c.z - L.axis.z * L.len * 0.4));
      L.c.y = THREE.MathUtils.damp(L.c.y, ground + L.r, 12, dt);
      // crush
      if (Math.abs(L.v) > 1.3) {
        const ax = L.c.x + L.axis.x * L.len / 2, az = L.c.z + L.axis.z * L.len / 2, bx = L.c.x - L.axis.x * L.len / 2, bz = L.c.z - L.axis.z * L.len / 2;
        for (const m of ctx.monsters) {
          if (!m.alive || m.ally || (L.hitT.get(m.id) ?? 0) > ctx.time) continue;
          if (segDist(m.pos.x, m.pos.z, ax, az, bx, bz) < L.r + m.radius + 0.25 && Math.abs(m.pos.y - L.c.y) < 2) {
            m.damage(150 * Math.min(1, Math.abs(L.v) / 5), 'log', ctx);
            m.pos.x += nx * Math.sign(L.v) * 1.2; m.pos.z += nz * Math.sign(L.v) * 1.2; m.stun = Math.max(m.stun, 0.8);
            L.hitT.set(m.id, ctx.time + 0.8);
          }
        }
      }
      const sink = L.life < 2 ? (2 - L.life) * 0.4 : 0;
      L.mesh.position.set(L.c.x, L.c.y - sink, L.c.z);
      L.mesh.quaternion.setFromAxisAngle(UP, L.yaw).multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), L.spin));
      if (L.life <= 0) { this.scene.remove(L.mesh); this.logs.splice(i, 1); }
    }
    for (const m of this.dirty) m.instanceMatrix.needsUpdate = true;
    this.dirty.clear();
  }

  spawnLog(F) {
    const S = F.S, t = F.t;
    const r = S.trunkR * 1.05 * t.scale, len = Math.max(1.6, S.trunkH * 0.95 * t.scale);
    const mesh = single(logGeometry(r, len, S.trunk), t.mats.trunk, t.mats.trunkDepth);
    const c = new THREE.Vector3(t.x + F.dir.x * (0.45 + len / 2), 0, t.z + F.dir.z * (0.45 + len / 2));
    c.y = this.world.heightAt(c.x, c.z) + r;
    const L = { id: (this._id = (this._id ?? 0) + 1), mesh, c, axis: F.dir.clone(), yaw: Math.atan2(-F.dir.z, F.dir.x), r, len, v: 0, spin: 0, life: 40, hitT: new Map() };
    this.scene.add(mesh);
    this.logs.push(L);
  }
}
