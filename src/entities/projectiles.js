// Projectiles (arrows, shuriken, fire arrows, chain sickle, witch spells) and
// area hazards (wolfsbane clouds, sunlight ray, makibishi, holy water stream).
import * as THREE from 'three';
import { mat } from './humanoid.js';

const _v = new THREE.Vector3();

// Soft round glow texture for magic and fire (additive sprites instead of real lights:
// adding/removing a light makes three.js recompile every shader, which caused hitches).
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
const glowMat = (color, opacity = 0.9) => new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

// Built once; every projectile is a cheap clone sharing geometry and materials.
const TEMPLATES = {
  arrow: () => { const g = new THREE.Group(); const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 5), mat(0x8a6a44)); shaft.rotation.x = Math.PI / 2; g.add(shaft); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 6), mat(0xd8dde3, { metalness: 0.8 })); tip.rotation.x = Math.PI / 2; tip.position.z = 0.5; g.add(tip); const fl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.01, 0.12), mat(0xeeeeee)); fl.position.z = -0.4; g.add(fl); return g; },
  shuriken: () => { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), mat(0x9aa2aa, { metalness: 0.9, roughness: 0.3 })); b.rotation.z = i * Math.PI / 2; b.position.set(Math.cos(i * Math.PI / 2 + Math.PI / 2) * 0.1, Math.sin(i * Math.PI / 2 + Math.PI / 2) * 0.1, 0); g.add(b); } return g; },
  bohiya: () => { const g = new THREE.Group(); const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6), mat(0x4a3a2a)); shaft.rotation.x = Math.PI / 2; g.add(shaft); const head = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.35, 8), mat(0x2a2a2a)); head.rotation.x = Math.PI / 2; head.position.z = 0.5; g.add(head); const flame = new THREE.Sprite(glowMat(0xff8a2a)); flame.scale.setScalar(0.7); flame.position.z = -0.6; g.add(flame); return g; },
  sickle: () => { const g = new THREE.Group(); const s = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 14, Math.PI * 0.9), mat(0xd8dde3, { metalness: 0.8 })); s.scale.set(1, 0.55, 1); g.add(s); return g; },
  spell: () => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), new THREE.MeshBasicMaterial({ color: 0xd9a6ff })); g.add(c); const halo = new THREE.Sprite(glowMat(0xb04cff)); halo.scale.setScalar(1.5); g.add(halo); return g; },
  fireball: () => { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffc070 })); g.add(c); const halo = new THREE.Sprite(glowMat(0xff5a1a)); halo.scale.setScalar(1.8); g.add(halo); return g; },
};
const built = {};
const MESH = new Proxy({}, { get: (_, kind) => () => (built[kind] ??= TEMPLATES[kind]()).clone() });
export const PROJECTILE_KINDS = Object.keys(TEMPLATES);
export function projectileMesh(kind) { return MESH[kind](); }

export class Projectiles {
  constructor(scene, effects) {
    this.scene = scene; this.effects = effects;
    this.list = [];
    this.areas = [];
  }
  /**
   * @param kind arrow|shuriken|bohiya|sickle|spell|fireball
   * @param opts { from:Vector3, dir:Vector3(xz), speed, range, damage, owner:'player'|'monster', onHit, gravity, burn, splash }
   */
  fire(kind, opts) {
    const mesh = MESH[kind]();
    mesh.position.copy(opts.from);
    this.scene.add(mesh);
    const p = { trail: opts.trail ?? null, kind, mesh, pos: opts.from.clone(), vel: opts.dir.clone().normalize().multiplyScalar(opts.speed), speed: opts.speed, dist: 0, range: opts.range, damage: opts.damage, owner: opts.owner, onHit: opts.onHit, gravity: opts.gravity ?? 0, splash: opts.splash ?? 0, burn: opts.burn ?? 0, returning: false, origin: opts.from.clone(), hit: new Set(), t: 0, homing: opts.homing ?? 0, pierce: opts.pierce ?? false, alive: true };
    if (kind === 'bohiya') p.vel.y = opts.speed * 0.35;
    this.list.push(p);
    return p;
  }
  /**
   * Monster spells and fireballs can be destroyed: cut through by a blade, or hit by one of
   * the guardian's own shots. One hit is enough. `by` describes what did it, for the reward.
   */
  shatterable(p) { return p.owner === 'monster' && (p.kind === 'spell' || p.kind === 'fireball') && !p.removed; }
  shatter(p, ctx, by = 'blade') {
    const i = this.list.indexOf(p);
    if (i < 0) return;
    const col = p.kind === 'spell' ? [0xd9a6ff, 0xb04cff, 0xffffff] : [0xffb347, 0xff5a1a, 0xfff0c0];
    this.effects.burst(p.pos, { count: 18, color: col, speed: 5.5, life: 0.45, size: 0.75, gravity: 1, spread: 1 });
    this.effects.burst(p.pos, { count: 6, color: 0xffffff, speed: 1.2, life: 0.18, size: 1.6, gravity: 0 });
    this.remove(i);
    ctx.onShatter?.(p, by);
  }
  /** The war fan bats a spell back: it becomes the guardian's own shot, aimed at the nearest monster. */
  reflect(p, ctx, from) {
    let best = null, bd = 30;
    for (const m of ctx.monsters) { if (!m.alive || m.ally) continue; const d = m.pos.distanceTo(p.pos); if (d < bd) { bd = d; best = m; } }
    _v.copy(best ? best.pos : p.pos.clone().sub(from).add(p.pos)).setY(p.pos.y).sub(p.pos);
    if (_v.lengthSq() < 1e-4) _v.subVectors(p.pos, from).setY(0);
    p.vel.copy(_v.normalize().multiplyScalar(p.speed * 1.6));
    p.owner = 'player'; p.homing = 0; p.dist = 0; p.range = 30; p.damage *= 2.5; p.hit.clear();
    p.onHit = (m, q) => m.damage(q.damage, 'reflected', ctx);
    this.effects.burst(p.pos, { count: 10, color: [0xffffff, 0xd9a6ff], speed: 3, life: 0.3, size: 0.8, gravity: 0 });
    ctx.onShatter?.(p, 'reflect');
  }

  /** Area hazard: { kind, pos, radius, ttl, onTick(monster, dt) , mesh } */
  area(a) {
    if (a.mesh) this.scene.add(a.mesh);
    a.t = 0;
    this.areas.push(a);
    return a;
  }
  update(dt, ctx) {
    const { monsters, player, world } = ctx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (p.homing && p.owner === 'monster') {
        _v.copy(player.pos).setY(p.pos.y).sub(p.pos).normalize().multiplyScalar(p.speed);
        p.vel.lerp(_v, Math.min(1, p.homing * dt));
      }
      if (p.kind === 'sickle') {
        // out and back on the chain
        if (!p.returning && p.dist >= p.range) p.returning = true;
        if (p.returning) { _v.copy(player.pos).setY(p.pos.y + 0.0).sub(p.pos); const d = _v.length(); if (d < 1) { this.remove(i); continue; } p.vel.copy(_v.normalize().multiplyScalar(p.speed * 1.3)); }
        p.mesh.rotation.y += dt * 25;
      }
      if (p.kind === 'shuriken') p.mesh.rotation.z += dt * 30;
      p.vel.y -= p.gravity * dt;
      if (p.trail) this.effects.burst(p.pos, { count: 1, color: p.trail, speed: 0.3, life: 0.35, size: 0.7, gravity: 0 });
      p.pos.addScaledVector(p.vel, dt);
      p.dist += p.speed * dt;
      p.mesh.position.copy(p.pos);
      if (p.kind !== 'sickle' && p.kind !== 'spell') p.mesh.lookAt(_v.copy(p.pos).add(p.vel));
      const ground = world.heightAt(p.pos.x, p.pos.z);
      let dead = false;
      if (p.owner === 'player') {
        // the guardian's shots knock enemy spells out of the air
        for (let j = this.list.length - 1; j >= 0; j--) {
          const q = this.list[j];
          if (q === p || !this.shatterable(q)) continue;
          if (q.pos.distanceToSquared(p.pos) < 0.6 * 0.6) {
            this.shatter(q, ctx, p.kind);
            if (j < i) i--;                                   // the list shifted under us
            if (!p.pierce && p.kind !== 'sickle') dead = true;
            break;
          }
        }
        if (!dead) for (const m of monsters) {
          if (!m.alive || m.ally || p.hit.has(m)) continue;
          const dx = m.pos.x - p.pos.x, dz = m.pos.z - p.pos.z;
          if (dx * dx + dz * dz < (m.radius + 0.5) ** 2 && Math.abs(m.pos.y + 0.9 - p.pos.y) < 2.2) {
            p.hit.add(m);
            p.onHit?.(m, p);
            if (p.kind === 'bohiya') { this.explode(p, ctx); dead = true; break; }
            if (!p.pierce && p.kind !== 'sickle') { dead = true; break; }
          }
        }
      } else if (player.alive) {
        const dx = player.pos.x - p.pos.x, dz = player.pos.z - p.pos.z;
        if (dx * dx + dz * dz < 0.9 && Math.abs(player.pos.y + 0.9 - p.pos.y) < 2.0) { p.onHit?.(player, p); dead = true; }
      }
      if (p.pos.y < ground + 0.05) { if (p.kind === 'bohiya') this.explode(p, ctx); dead = true; }
      if (p.kind !== 'sickle' && p.dist > p.range) dead = true;
      if (dead) { if (p.kind === 'spell') this.effects.burst(p.pos, { count: 8, color: 0xb04cff, speed: 2, life: 0.4, size: 0.8, gravity: 0 }); this.remove(i); }
    }
    for (let i = this.areas.length - 1; i >= 0; i--) {
      const a = this.areas[i];
      a.t += dt;
      a.onUpdate?.(a, dt, ctx);
      if (a.t >= a.ttl || a.dead) { if (a.mesh) this.scene.remove(a.mesh); a.onEnd?.(a, ctx); this.areas.splice(i, 1); }
    }
  }
  explode(p, ctx) {
    this.effects.burst(p.pos, { count: 40, color: [0xff7a1a, 0xffc040, 0x552211], speed: 6, life: 0.8, size: 1.6, gravity: 4 });
    for (const m of ctx.monsters) {
      if (!m.alive || m.ally) continue;
      const d = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z);
      if (d < p.splash) { m.damage(p.damage * (1 - d / p.splash * 0.5), 'fire', ctx); if (p.burn) m.burn = Math.max(m.burn, p.burn); }
    }
  }
  remove(i) { const p = this.list[i]; p.removed = true; this.scene.remove(p.mesh); this.list.splice(i, 1); }
  clear() { for (const p of this.list) this.scene.remove(p.mesh); this.list.length = 0; for (const a of this.areas) if (a.mesh) this.scene.remove(a.mesh); this.areas.length = 0; }
}
