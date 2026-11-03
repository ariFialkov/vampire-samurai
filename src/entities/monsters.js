// The seven monsters: builders, stats, AI and the signature death of each kind.
import * as THREE from 'three';
import { buildHumanoid, animateHumanoid, mat, ease } from './humanoid.js';
import { WATER_LEVEL } from '../world/terrain.js';

const _v = new THREE.Vector3();

export const MONSTERS = {
  skeleton: { name: 'Skeleton', hp: 22, speed: 2.9, damage: 6, range: 1.5, cooldown: 1.4, radius: 0.45, score: 1, group: [6, 14] },
  zombie:   { name: 'Zombie', hp: 65, speed: 2.1, damage: 10, range: 1.6, cooldown: 1.7, radius: 0.5, score: 2, group: [4, 9] },
  witch:    { name: 'Witch', hp: 38, speed: 2.5, damage: 9, range: 13, cooldown: 2.4, radius: 0.45, score: 3, group: [2, 4], ranged: true },
  vampire:  { name: 'Vampire', hp: 52, speed: 4.2, damage: 13, range: 1.7, cooldown: 1.2, radius: 0.45, score: 4, group: [2, 4] },
  ghost:    { name: 'Ghost', hp: 34, speed: 3.3, damage: 11, range: 1.6, cooldown: 1.3, radius: 0.45, score: 5, group: [2, 5] },
  werewolf: { name: 'Werewolf', hp: 58, speed: 6.6, damage: 22, range: 2.0, cooldown: 1.1, radius: 0.6, score: 7, group: [1, 4] },
  demon:    { name: 'Demon', hp: 240, speed: 5.6, damage: 28, range: 2.4, cooldown: 1.3, radius: 0.75, score: 15, group: [1, 3] },
};

// ------------------------------------------------------------------ builders
function buildWerewolf() {
  const fur = mat(0x4a3a2e, { roughness: 0.95 }), dark = mat(0x2a2019);
  const root = new THREE.Group();
  const body = new THREE.Group(); body.position.y = 0.75; root.add(body);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.9, 4, 10), fur); torso.rotation.z = Math.PI / 2; torso.rotation.x = 0; torso.scale.set(1, 1, 1.1); torso.castShadow = true; body.add(torso);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), fur); chest.position.set(0, 0.05, 0.4); chest.castShadow = true; body.add(chest);
  const neck = new THREE.Group(); neck.position.set(0, 0.25, 0.7); body.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), fur); head.castShadow = true; neck.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.32), dark); snout.position.set(0, -0.05, 0.3); neck.add(snout);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), fur); ear.position.set(sx * 0.14, 0.24, -0.05); ear.rotation.z = -sx * 0.3; neck.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd23a })); eye.position.set(sx * 0.1, 0.06, 0.2); neck.add(eye);
  }
  const legs = [];
  for (const [sx, fz] of [[-1, 0.42], [1, 0.42], [-1, -0.42], [1, -0.42]]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.22, -0.1, fz); body.add(hip);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.32, 3, 8), fur); upper.position.y = -0.2; upper.castShadow = true; hip.add(upper);
    const knee = new THREE.Group(); knee.position.y = -0.4; hip.add(knee);
    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 3, 8), fur); lower.position.y = -0.17; lower.castShadow = true; knee.add(lower);
    const paw = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.2), dark); paw.position.set(0, -0.35, 0.04); knee.add(paw);
    legs.push({ hip, knee, front: fz > 0 });
  }
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.5, 3, 6), fur); tail.position.set(0, 0.1, -0.85); tail.rotation.x = -0.9; body.add(tail);
  return { root, body, neck, legs, tail, hips: body, torso: body, head: neck, height: 1.3, quadruped: true };
}

function buildGhost() {
  const m = new THREE.MeshStandardMaterial({ color: 0xdfe9ff, transparent: true, opacity: 0.55, roughness: 0.4, emissive: 0x6a7fb0, emissiveIntensity: 0.35, depthWrite: false, side: THREE.DoubleSide });
  const root = new THREE.Group();
  const sheet = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.6, 14, 6, true), m); sheet.position.y = 1.0; root.add(sheet);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), m); head.position.y = 1.75; root.add(head);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x101828, transparent: true, opacity: 0.9 });
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), eyeM); e.position.set(sx * 0.12, 1.8, 0.28); root.add(e); }
  const arms = [];
  for (const sx of [-1, 1]) { const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5, 3, 6), m); a.position.set(sx * 0.5, 1.2, 0.15); a.rotation.z = sx * 1.2; root.add(a); arms.push(a); }
  return { root, sheet, head, arms, mats: [m, eyeM], ghost: true, height: 2.0 };
}

const LOOKS = {
  skeleton: () => buildHumanoid({ scale: 0.95, bulk: 0.72, skin: 0xe8e2d0, top: 0xe8e2d0, bottom: 0xe8e2d0, obi: 0x5a4a3a, skull: true, sleeves: false }),
  zombie: () => buildHumanoid({ scale: 1.0, bulk: 1.1, skin: 0x7f9a5a, top: 0x4a4238, bottom: 0x3a3330, obi: 0x2a2520, hair: 0x2a2a1a, hunch: 0.45 }),
  witch: () => { const p = buildHumanoid({ scale: 1.0, bulk: 0.9, skin: 0xb8c8a0, top: 0x1a1522, bottom: 0x1a1522, obi: 0x5a2a6a, hair: 0x3a2a3a, hat: 'witch' }); const robe = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 12, 1, true), mat(0x1a1522, { side: THREE.DoubleSide })); robe.position.y = -0.45; robe.castShadow = true; p.hips.add(robe); p.robe = robe; const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.5, 6), mat(0x4a3a2a)); staff.position.y = -0.4; p.armR.hand.add(staff); const orb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0xb04cff })); orb.position.y = 0.4; p.armR.hand.add(orb); return p; },
  vampire: () => buildHumanoid({ scale: 1.05, bulk: 0.95, skin: 0xe8e6ee, top: 0x14131a, bottom: 0x14131a, obi: 0x5a0f14, hair: 0x0a0a0a, cape: 0x5a0f14, eyes: 0xff2020 }),
  demon: () => buildHumanoid({ scale: 1.55, bulk: 1.4, legLen: 0.9, armLen: 0.75, skin: 0x3a0f12, top: 0x2a0a0d, bottom: 0x1a0608, obi: 0x0a0506, hair: 0x1a0608, hat: 'horns', eyes: 0xff6a00, sleeves: false }),
};

// ------------------------------------------------------------------ monster
let nextId = 1;
export class Monster {
  constructor(type, pos, rng, scene) {
    this.id = nextId++;
    this.type = type;
    this.def = MONSTERS[type];
    this.rng = rng;
    this.scene = scene;
    this.pos = new THREE.Vector3(pos.x, pos.y, pos.z);
    this.hp = this.def.hp; this.maxHp = this.def.hp;
    this.radius = this.def.radius;
    this.alive = true; this.dying = false; this.deathT = 0; this.removed = false;
    this.ally = false; this.stun = 0; this.burn = 0; this.slow = 0; this.hurt = 0;
    this.cooldown = rng.float(0.3, 1.2);
    this.attackT = -1;
    this.facing = rng.float(0, Math.PI * 2);
    this.anim = { speed: 0, phase: rng.float(0, 6) };
    this.vel = new THREE.Vector3();
    this.visible = 1;            // ghosts fade in/out
    this.ghostTimer = rng.float(0, 3);
    this.dashTimer = rng.float(2, 4); this.dashing = 0;
    this.lungeTimer = rng.float(1, 3); this.lunging = 0;
    this.invulnerable = false;
    this.hitFlash = 0;
    this.seen = false;
    this.target = null;
    this.rig = type === 'werewolf' ? buildWerewolf() : type === 'ghost' ? buildGhost() : LOOKS[type]();
    this.mesh = this.rig.root;
    this.mesh.position.copy(this.pos);
    this.collectMaterials();
    if (type === 'demon') for (const m of this.materials) if (m.emissive) { m.emissive.setHex(0x4a0a08); m.emissiveIntensity = 0.35; }
    scene.add(this.mesh);
  }
  collectMaterials() {
    // Clone shared materials so hit flashes / camouflage affect only this monster.
    const cloned = new Map();
    this.mesh.traverse((o) => {
      if (!o.isMesh || this.type === 'ghost') return;
      if (!cloned.has(o.material)) { const c = o.material.clone(); c.userData.owned = true; cloned.set(o.material, c); }
      o.material = cloned.get(o.material);
    });
    this.materials = this.type === 'ghost' ? this.rig.mats : [...cloned.values()];
  }
  get height() { return this.rig.height ?? 1.7; }

  damage(amount, source, ctx) {
    if (!this.alive || this.invulnerable) return false;
    this.hp -= amount;
    this.hurt = 1; this.hitFlash = 0.15;
    ctx.effects.burst(_v.copy(this.pos).setY(this.pos.y + 1), { count: 6, color: this.type === 'skeleton' ? 0xe8e2d0 : this.type === 'ghost' ? 0xcfe0ff : 0x8a1c1c, speed: 2.5, life: 0.4, size: 0.7 });
    if (this.hp <= 0) { this.die(ctx, source); return true; }
    return false;
  }

  die(ctx, source) {
    this.alive = false; this.dying = true; this.deathT = 0;
    ctx.onKill?.(this, source);
    const E = ctx.effects, p = this.pos;
    switch (this.type) {
      case 'skeleton': {
        // collapses into a pile of bones
        E.burst(_v.copy(p).setY(p.y + 0.8), { count: 14, color: 0xe8e2d0, speed: 3, life: 0.6, size: 0.9 });
        const pile = new THREE.Group();
        const bone = mat(0xe8e2d0, { roughness: 0.9 });
        for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.3 + Math.random() * 0.25, 3, 6), bone); b.position.set((Math.random() - 0.5) * 0.7, 0.05 + Math.random() * 0.12, (Math.random() - 0.5) * 0.7); b.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.4, Math.random() * Math.PI, 0); b.castShadow = true; pile.add(b); }
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), bone); skull.position.set(0.15, 0.14, 0.1); pile.add(skull);
        pile.position.copy(p);
        E.leave(pile, 25);
        this.mesh.visible = false; this.removed = true; ctx.scene.remove(this.mesh);
        break;
      }
      case 'zombie': break;       // falls over backwards (animated in update)
      case 'witch': {
        // an empty pile of clothes, that may reveal a spell after a couple of seconds
        E.burst(_v.copy(p).setY(p.y + 1), { count: 16, color: 0x8a4cff, speed: 2, life: 0.6, size: 0.8, gravity: 1 });
        const pile = new THREE.Group();
        const cloth = mat(0x1a1522, { roughness: 1 });
        const robe = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), cloth); robe.scale.set(1, 0.25, 1); robe.position.y = 0.1; robe.castShadow = true; pile.add(robe);
        const hat = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 12), cloth); hat.position.set(0.35, 0.12, 0.2); hat.rotation.z = Math.PI / 2 + 0.3; pile.add(hat);
        pile.position.copy(p);
        const drop = this.rng.chance(0.28) ? this.rng.pick(['protector', 'speedy', 'lucky', 'lucky', 'speedy']) : null;
        E.leave(pile, 2.4);
        if (drop) ctx.spawnItemLater?.(drop, p.clone(), 2.4);
        this.mesh.visible = false; this.removed = true; ctx.scene.remove(this.mesh);
        break;
      }
      case 'vampire': {
        // turns into a bat and flies away
        E.burst(_v.copy(p).setY(p.y + 1), { count: 18, color: 0x2a0a10, speed: 3, life: 0.5, size: 0.9, gravity: 0 });
        const bat = new THREE.Group();
        const bm = mat(0x151015);
        const body = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), bm); bat.add(body);
        const wings = [];
        for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.28), mat(0x151015, { side: THREE.DoubleSide })); w.position.x = sx * 0.28; wings.push([w, sx]); bat.add(w); }
        bat.position.copy(p).setY(p.y + 1.2);
        const dir = new THREE.Vector3(this.rng.float(-1, 1), 0, this.rng.float(-1, 1)).normalize();
        E.leave(bat, 4, (t, dt, m) => { m.position.addScaledVector(dir, dt * 6); m.position.y += dt * 3.5; for (const [w, sx] of wings) w.rotation.z = sx * Math.sin(t * 28) * 0.9; });
        this.mesh.visible = false; this.removed = true; ctx.scene.remove(this.mesh);
        break;
      }
      case 'ghost': {
        E.burst(_v.copy(p).setY(p.y + 1.2), { count: 36, color: [0xdfe9ff, 0xffffff, 0xaebbe0], speed: 1.6, life: 1.4, size: 1.6, gravity: -1.2 });
        this.mesh.visible = false; this.removed = true; ctx.scene.remove(this.mesh);
        break;
      }
      case 'werewolf': break;     // slumps over
      case 'demon': {
        E.burst(_v.copy(p).setY(p.y + 1.5), { count: 60, color: [0xff5a1a, 0xffb02a, 0x2a0a08], speed: 5, life: 1.2, size: 2, gravity: -2 });
        break;                    // burns away (scaled in update)
      }
    }
  }

  /** Target selection: the player, or (as an ally) the nearest hostile monster. */
  pickTarget(ctx) {
    if (!this.ally) return ctx.player.alive ? ctx.player : null;
    let best = null, bd = 1e9;
    for (const m of ctx.monsters) { if (m === this || !m.alive || m.ally) continue; const d = m.pos.distanceToSquared(this.pos); if (d < bd) { bd = d; best = m; } }
    return best;
  }

  update(dt, ctx) {
    const { world, player } = ctx;
    if (this.dying) { this.updateDeath(dt, ctx); return; }
    this.hurt = Math.max(0, this.hurt - dt * 4);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.cooldown -= dt;
    if (this.burn > 0) { this.burn -= dt; if (!this.burnTick || (this.burnTick -= dt) <= 0) { this.burnTick = 0.5; this.hp -= 4; ctx.effects.burst(_v.copy(this.pos).setY(this.pos.y + 1), { count: 3, color: [0xff7a1a, 0xffc040], speed: 1.5, life: 0.4, size: 0.9, gravity: -3 }); if (this.hp <= 0) { this.die(ctx, 'fire'); return; } } }
    if (this.stun > 0) { this.stun -= dt; this.anim.speed = 0; this.applyAnim(dt); return; }

    const target = this.pickTarget(ctx);
    const D = this.def;
    let speed = D.speed * (this.slow > 0 ? 0.5 : 1) * (ctx.speedMult ?? 1);
    this.slow = Math.max(0, this.slow - dt);
    const toT = target ? _v.copy(target.pos).sub(this.pos) : _v.set(0, 0, 0);
    toT.y = 0;
    const dist = toT.length();
    if (dist > 0.001) toT.divideScalar(dist);
    if (!this.seen && dist < 70) this.seen = true;
    let wantMove = true, dirX = toT.x, dirZ = toT.z;

    // ---- type specific behaviour
    if (this.type === 'witch') {
      if (dist < 7) { dirX = -toT.x; dirZ = -toT.z; }
      else if (dist < 11) { dirX = -toT.z; dirZ = toT.x; speed *= 0.6; }   // strafe
      if (dist < D.range && this.cooldown <= 0 && target) {
        this.cooldown = D.cooldown; this.attackT = 0;
        const from = this.pos.clone().setY(this.pos.y + 1.4);
        ctx.projectiles.fire('spell', { from, dir: toT.clone(), speed: 9, range: 20, damage: D.damage, owner: this.ally ? 'player' : 'monster', homing: 1.5, onHit: (victim, p) => victim.damage?.(p.damage, this, ctx) ?? victim.takeDamage?.(p.damage, this) });
      }
    } else if (this.type === 'vampire') {
      this.dashTimer -= dt;
      if (this.dashing > 0) { this.dashing -= dt; speed = 19; this.invulnerable = true; ctx.effects.burst(_v.copy(this.pos).setY(this.pos.y + 1), { count: 2, color: 0x3a0a14, speed: 0.5, life: 0.3, size: 1.2, gravity: 0 }); }
      else { this.invulnerable = false; if (this.dashTimer <= 0 && dist > 3 && dist < 24) { this.dashing = 0.42; this.dashTimer = this.rng.float(2.5, 4); } }
    } else if (this.type === 'ghost') {
      // pops in and out of visibility
      this.ghostTimer -= dt;
      if (this.ghostTimer <= 0) { this.visibleTarget = this.visibleTarget === 0 ? 1 : 0; this.ghostTimer = this.visibleTarget ? this.rng.float(1.2, 2.0) : this.rng.float(2.0, 3.5); }
      if (this.visibleTarget === undefined) this.visibleTarget = 1;
      const goal = ctx.ectoGoggles ? 1 : this.visibleTarget;
      this.visible = THREE.MathUtils.damp(this.visible, goal, 6, dt);
      const op = 0.05 + 0.55 * this.visible;
      for (const m of this.rig.mats) m.opacity = m === this.rig.mats[1] ? op * 1.5 : op;
      if (ctx.ectoGoggles) this.rig.mats[0].emissive.setHex(0x3aff9a); else this.rig.mats[0].emissive.setHex(0x6a7fb0);
    } else if (this.type === 'werewolf') {
      this.lungeTimer -= dt;
      if (this.lunging > 0) { this.lunging -= dt; speed = 15; }
      else if (this.lungeTimer <= 0 && dist > 3 && dist < 7) { this.lunging = 0.32; this.lungeTimer = this.rng.float(2, 3.5); }
      // pack behaviour: drift toward pack-mates a little, so packs stay loose but together
      if (this.pack) { let cx = 0, cz = 0, n = 0; for (const m of this.pack) if (m.alive && m !== this) { cx += m.pos.x; cz += m.pos.z; n++; } if (n) { cx = cx / n - this.pos.x; cz = cz / n - this.pos.z; const l = Math.hypot(cx, cz); if (l > 6) { dirX += cx / l * 0.5; dirZ += cz / l * 0.5; } } }
    } else if (this.type === 'demon') {
      // camouflaged: dim and flickering in the night light
      const cam = ctx.night ? 0.38 + 0.12 * Math.sin(ctx.time * 9 + this.id) : 0.85;
      for (const m of this.materials) if (m.transparent !== undefined) { m.transparent = true; m.opacity = cam; }
      if (this.cooldown <= 0 && dist < 9 && dist > D.range && this.rng.chance(dt * 0.4)) {
        this.cooldown = 1.0;
        ctx.projectiles.fire('fireball', { from: this.pos.clone().setY(this.pos.y + 1.8), dir: toT.clone(), speed: 12, range: 16, damage: 14, owner: this.ally ? 'player' : 'monster', onHit: (victim, p) => victim.damage?.(p.damage, this, ctx) ?? victim.takeDamage?.(p.damage, this) });
      }
    }

    // ---- melee attack
    const meleeRange = D.range + (target?.radius ?? 0.5);
    if (!D.ranged && target && dist < meleeRange && this.cooldown <= 0 && this.attackT < 0) {
      this.attackT = 0; this.cooldown = D.cooldown; this.hitDone = false;
    }
    if (this.attackT >= 0) {
      this.attackT += dt;
      const dur = 0.55;
      if (!this.hitDone && this.attackT > dur * 0.5) {
        this.hitDone = true;
        if (!D.ranged && target && this.pos.distanceTo(target.pos) < meleeRange + 0.6) {
          if (target === player) player.takeDamage(D.damage, this);
          else target.damage?.(D.damage, this, ctx);
        }
      }
      if (this.attackT > dur) this.attackT = -1;
      if (!D.ranged) wantMove = false;
    }

    // ---- separation from other monsters
    let sx = 0, sz = 0;
    for (const m of ctx.monsters) {
      if (m === this || !m.alive) continue;
      const dx = this.pos.x - m.pos.x, dz = this.pos.z - m.pos.z;
      const d2 = dx * dx + dz * dz, min = this.radius + m.radius + 0.2;
      if (d2 < min * min && d2 > 1e-4) { const d = Math.sqrt(d2); sx += dx / d * (min - d); sz += dz / d * (min - d); }
    }
    if (wantMove && target && (dist > meleeRange * 0.9 || D.ranged)) {
      this.vel.x = dirX * speed; this.vel.z = dirZ * speed;
    } else { this.vel.x *= 0.6; this.vel.z *= 0.6; }
    let nx = this.pos.x + (this.vel.x + sx * 8) * dt, nz = this.pos.z + (this.vel.z + sz * 8) * dt;
    const r = world.resolve(nx, nz, this.radius, true);
    if (r) { nx = r.x; nz = r.z; }
    this.pos.x = nx; this.pos.z = nz;
    const ground = world.heightAt(nx, nz);
    const waterY = world.terrain.waterLevelAt(nx, nz);
    this.pos.y = this.type === 'ghost' ? Math.max(ground, waterY) + 0.6 + Math.sin(ctx.time * 2 + this.id) * 0.2 : Math.max(ground, waterY - 0.5);
    const moving = Math.hypot(this.vel.x, this.vel.z);
    if (moving > 0.3) this.facing = THREE.MathUtils.lerp(this.facing, Math.atan2(this.vel.x, this.vel.z), 1 - Math.exp(-10 * dt));
    else if (target && dist < 12) this.facing = Math.atan2(toT.x, toT.z);
    this.anim.speed = THREE.MathUtils.clamp(moving / Math.max(2.5, D.speed), 0, 1.4);
    this.applyAnim(dt);
  }

  applyAnim(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.facing;
    const rig = this.rig;
    if (rig.quadruped) {
      this.anim.phase = (this.anim.phase ?? 0) + dt * (2 + this.anim.speed * 14);
      const ph = this.anim.phase, s = this.anim.speed;
      for (const [i, leg] of rig.legs.entries()) {
        const off = (leg.front ? 0 : Math.PI) + (i % 2) * 0.4;
        leg.hip.rotation.x = Math.sin(ph + off) * 0.9 * s;
        leg.knee.rotation.x = Math.max(0, Math.sin(ph + off - 1)) * 0.9 * s;
      }
      rig.body.position.y = 0.75 + Math.abs(Math.sin(ph)) * 0.12 * s;
      rig.body.rotation.x = Math.sin(ph) * 0.1 * s + (this.lunging > 0 ? -0.4 : 0);
      rig.tail.rotation.z = Math.sin(ph * 0.5) * 0.4;
      rig.neck.rotation.x = this.attackT >= 0 ? -0.5 + Math.sin(this.attackT * 12) * 0.5 : -0.1;
    } else if (rig.ghost) {
      rig.root.position.y = this.pos.y;
      rig.sheet.rotation.y += dt * 0.5;
      for (const [i, a] of rig.arms.entries()) a.rotation.x = Math.sin(this.anim.phase + i * 2) * 0.3;
      this.anim.phase += dt * 3;
    } else {
      const hunch = this.type === 'zombie' ? 0.45 : 0;
      this.anim.hunch = hunch;
      this.anim.attackT = this.attackT; this.anim.attackDur = 0.55; this.anim.hurt = this.hurt;
      animateHumanoid(rig, this.anim, dt, (t, p) => {
        if (this.type === 'witch') { const u = Math.sin(t * Math.PI); p.armR.shoulder.rotation.x = -1.8 * u; p.armL.shoulder.rotation.x = -1.2 * u; p.armL.shoulder.rotation.z = 0.5; }
        else { const sw = t < 0.4 ? -ease.out(t / 0.4) : ease.inOut((t - 0.4) / 0.6) * 2 - 1; p.armR.shoulder.rotation.x = -1.5 - sw * 0.6; p.armR.shoulder.rotation.z = -0.4 + sw; p.armL.shoulder.rotation.x = -1.5 - sw * 0.6; p.armL.shoulder.rotation.z = 0.4 - sw; p.torso.rotation.x += 0.3 * Math.max(0, sw); }
      });
      if (this.type === 'zombie') { rig.armR.shoulder.rotation.x = -1.5 + Math.sin(this.anim.phase) * 0.15; rig.armL.shoulder.rotation.x = -1.5 - Math.sin(this.anim.phase) * 0.15; rig.armR.elbow.rotation.x = -0.1; rig.armL.elbow.rotation.x = -0.1; }
    }
    // hit flash
    if (this.hitFlash > 0 || this._flashed) {
      const on = this.hitFlash > 0;
      for (const m of this.materials) if (m.emissive) { if (m.userData.flashBase === undefined) m.userData.flashBase = m.emissive.getHex(); m.emissive.setHex(on ? 0xff8866 : m.userData.flashBase); }
      this._flashed = on;
    }
  }

  updateDeath(dt, ctx) {
    this.deathT += dt;
    const rig = this.rig;
    if (this.type === 'zombie') {
      // falls backwards, hands up in the air, then lies there
      const t = Math.min(1, this.deathT / 0.7);
      const e = ease.in(t);
      this.mesh.rotation.x = -Math.PI / 2 * e;
      this.mesh.position.y = this.pos.y + 0.0;
      rig.armR.shoulder.rotation.x = -3.0; rig.armL.shoulder.rotation.x = -3.0;
      rig.armR.elbow.rotation.x = 0; rig.armL.elbow.rotation.x = 0;
      rig.torso.rotation.x = 0.1;
      if (this.deathT > 1 && !this.left) { this.left = true; this.removed = true; ctx.scene.remove(this.mesh); ctx.effects.leave(this.mesh, 18); }
    } else if (this.type === 'werewolf') {
      const t = Math.min(1, this.deathT / 0.5);
      this.mesh.rotation.z = Math.PI / 2 * ease.out(t);
      this.mesh.position.y = this.pos.y + 0.3 * (1 - t);
      if (this.deathT > 0.8 && !this.left) { this.left = true; this.removed = true; ctx.scene.remove(this.mesh); ctx.effects.leave(this.mesh, 14); }
    } else if (this.type === 'demon') {
      const t = Math.min(1, this.deathT / 1.2);
      this.mesh.scale.setScalar(1.55 * (1 - ease.in(t)));
      this.mesh.rotation.y += dt * 4;
      if (this.rng.chance(dt * 20)) ctx.effects.burst(_v.copy(this.pos).setY(this.pos.y + 1.5), { count: 4, color: [0xff5a1a, 0xffb02a], speed: 3, life: 0.6, size: 1.5, gravity: -3 });
      if (t >= 1 && !this.left) { this.left = true; this.removed = true; ctx.scene.remove(this.mesh); }
    } else if (!this.removed) { this.removed = true; ctx.scene.remove(this.mesh); }
  }

  dispose(scene) { if (!this.removed) { scene.remove(this.mesh); this.removed = true; } }
}
