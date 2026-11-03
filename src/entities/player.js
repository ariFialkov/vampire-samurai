// The samurai: movement, facing/aim, inventory (5 slots), weapon combat and item use.
import * as THREE from 'three';
import { buildHumanoid, animateHumanoid } from './humanoid.js';
import { WEAPONS, WEAPON_MESHES, POSES, RUBS } from './weapons.js';
import { ITEMS } from './collectibles.js';
import { MONSTERS } from './monsters.js';
import { dampAngle } from '../core/math.js';
import { WEAPON_RIGS, poseWeapon } from './attacks.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
export const ZOOM_PRESETS = [
  { h: 10.5, d: 8.5 },
  { h: 20, d: 15 },
  { h: 36, d: 26 },
];

export class Player {
  constructor(character, scene, world) {
    this.char = character;
    this.scene = scene; this.world = world;
    this.pos = new THREE.Vector3(0, world.surfaceAt(0, 6), 6);
    this.facing = Math.PI;
    this.maxHealth = character.health; this.health = this.maxHealth;
    this.baseSpeed = character.speed;
    this.alive = true; this.dying = false; this.deathT = 0;
    this.radius = 0.45;
    this.invuln = 0; this.hurt = 0;
    this.rig = buildHumanoid(character.look);
    this.mesh = this.rig.root;
    scene.add(this.mesh);
    this.anim = { speed: 0, phase: 0, attackT: -1, attackDur: 0.5 };
    this.vel = new THREE.Vector3();
    // Inventory: slot 0 is always the primary weapon
    this.slots = [{ id: character.weapon, count: 1, weapon: character.weapon, primary: true }, null, null, null, null];
    this.selected = 0;
    this.rub = null;                 // serrated | garlic | salt | silver
    this.flamingTekko = false;
    this.attackT = -1; this.attackDur = 0.5; this.hitDone = false; this.mirror = false;
    this.comboStep = 0;
    this.weaponMesh = null;
    this.status = { headshots: 0, ecto: 0, speedy: 0, lucky: 0, holy: 0 };
    this.zoom = 0;
    this.kills = 0;
    this.nearItem = null;
    this.setWeaponMesh();
  }

  get current() { return this.slots[this.selected]; }
  get weaponId() { const s = this.current; return s && s.weapon ? s.weapon : this.slots[0].weapon; }
  get weapon() { return WEAPONS[this.weaponId]; }
  get usingWeapon() { const s = this.current; return !!(s && s.weapon); }

  /** Mount the current weapon in the hand(s) its choreography expects. */
  setWeaponMesh() {
    for (const m of this.weaponMeshes ?? []) m.parent?.remove(m);
    this.weaponMeshes = [];
    this.weaponMesh = null;
    if (!this.grips) {
      this.grips = { R: new THREE.Group(), L: new THREE.Group() };
      this.rig.armR.hand.add(this.grips.R); this.rig.armL.hand.add(this.grips.L);
    }
    this.grips.R.quaternion.identity(); this.grips.L.quaternion.identity();
    this.attackVariant = null; this.weaponState = {};
    const id = this.usingWeapon ? this.weaponId : null;
    if (!id) return;
    const rig = WEAPON_RIGS[id];
    const mount = (hand) => {
      const m = WEAPON_MESHES[id]();
      m.position.y = rig.mount;
      this.grips[hand].add(m);
      this.weaponMeshes.push(m);
      return m;
    };
    this.weaponMesh = mount(rig.main);
    if (id === 'tekkokagi') mount('L');                 // claws on both fists
    for (const m of this.weaponMeshes) {
      if (this.rub && this.current.primary) {
        const tint = new THREE.Color(RUBS[this.rub].color);
        m.traverse((o) => { if (o.isMesh && o.material.metalness > 0.5) { o.material = o.material.clone(); o.material.color.lerp(tint, 0.6); o.material.emissive = tint.clone().multiplyScalar(0.12); } });
      }
      if (this.flamingTekko && id === 'tekkokagi') m.traverse((o) => { if (o.isMesh && o.material.metalness > 0.5) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0xff5a1a); o.material.emissiveIntensity = 1.2; } });
    }
  }

  get weaponGrips() {
    const rig = WEAPON_RIGS[this.weaponId];
    return { main: this.grips[rig.main], off: rig.off === 'track' ? this.grips[rig.main === 'L' ? 'R' : 'L'] : null };
  }

  select(i) {
    if (i < 0) i = 4; if (i > 4) i = 0;
    if (this.slots[i] === null) return false;
    this.selected = i; this.setWeaponMesh(); return true;
  }
  cycle(dir) {
    let i = this.selected;
    for (let k = 0; k < 5; k++) { i = (i + dir + 5) % 5; if (this.slots[i]) { this.selected = i; this.setWeaponMesh(); return; } }
  }
  findSlot(id) { return this.slots.findIndex((s) => s && s.id === id); }
  emptySlot() { return this.slots.findIndex((s) => s === null); }
  /** Would picking this up be pointless (a second copy of a keeper, flames without claws)? */
  isUseless(id) {
    const def = ITEMS[id];
    if (def.flaming) return this.findSlot('tekkokagi') < 0;
    return def.kind === 'keeper' && this.findSlot(id) >= 0;
  }
  /** Is there room to take at least one of this item without swapping anything out? */
  hasSpaceFor(id) {
    const def = ITEMS[id];
    if (def.kind === 'upgrade') return true;
    if (def.max > 1 && this.slots.some((s) => s && s.id === id && s.count < def.max)) return true;
    return this.emptySlot() >= 0;
  }
  /**
   * Take up to `count` of an item. Stackable items top up their existing stack first and
   * spill into a fresh slot; everything else needs a slot of its own.
   * Returns how many were taken (0 if none fit or it's useless).
   */
  take(id, count = 1, ctx) {
    const def = ITEMS[id];
    if (this.isUseless(id)) return 0;
    if (def.kind === 'upgrade') {
      if (def.rub) { this.rub = def.rub; this.setWeaponMesh(); ctx.toast(`${def.name} ${WEAPONS[this.slots[0].weapon].name}: double damage to ${MONSTERS[RUBS[def.rub].vs].name.toLowerCase()}s`); }
      else if (def.flaming) { this.flamingTekko = true; this.setWeaponMesh(); ctx.toast('Flaming Tekko-Kagi: double damage to everything'); }
      return count;
    }
    let left = count;
    if (def.max > 1) {
      for (const s of this.slots) {
        if (!s || s.id !== id || s.count >= def.max) continue;
        const add = Math.min(left, def.max - s.count);
        s.count += add; left -= add;
        if (!left) return count;
      }
    }
    while (left > 0) {
      const e = this.emptySlot();
      if (e < 0) break;
      const add = Math.min(left, def.max);
      this.slots[e] = { id, count: add, weapon: def.weapon ?? null };
      left -= add;
    }
    return count - left;
  }
  /** Swap the selected (non-primary) slot with a new item; returns the dropped item or null. */
  swap(id, count) {
    if (this.selected === 0) { const e = [1, 2, 3, 4].find((k) => this.slots[k]); if (e === undefined) return null; this.selected = e; }
    const old = this.slots[this.selected];
    const def = ITEMS[id];
    this.slots[this.selected] = { id, count: Math.min(def.max, count), weapon: def.weapon ?? null };
    this.setWeaponMesh();
    return old;
  }
  /** Use one of the selected item; when the last one is gone, return to the primary weapon. */
  consume() {
    const s = this.current; if (!s) return;
    s.count -= 1;
    if (s.count <= 0) { this.slots[this.selected] = null; this.selected = 0; this.setWeaponMesh(); }
  }

  takeDamage(amount, source) {
    if (!this.alive || this.invuln > 0) return;
    const ctx = this.ctx;
    amount *= ctx.playerDamageMult ?? 1;
    if (ctx.guardian && this.health - amount <= 0) {
      // The round script says this is not the wave the guardian falls on: a lucky dodge.
      this.health = Math.max(1, this.health * 0.5); this.invuln = 1.6; ctx.toast('Dodged!'); ctx.onHurt?.(0.4);
      return;
    }
    this.health -= amount; this.hurt = 1; this.invuln = 0.35;
    ctx.onHurt?.(Math.min(1, amount / 30));
    ctx.effects.burst(_v.copy(this.pos).setY(this.pos.y + 1.1), { count: 8, color: 0x8a1c1c, speed: 2.5, life: 0.4, size: 0.7 });
    if (this.health <= 0) { this.health = 0; this.alive = false; this.dying = true; this.deathT = 0; ctx.onDeath?.(); }
  }
  heal(frac) { this.health = Math.min(this.maxHealth, this.health + this.maxHealth * frac); }

  // ------------------------------------------------------------------ actions
  attack(ctx) {
    if (!this.alive) return;
    if (this.attackT >= 0) {
      // mashing: queue the next swing if pressed during the back half of this one
      if (this.attackVariant && this.attackT > this.attackDur * 0.45) this.buffered = true;
      return;
    }
    const s = this.current;
    if (!s) return;
    if (s.weapon) {
      const w = WEAPONS[s.weapon];
      const rig = WEAPON_RIGS[s.weapon];
      if (w.tool === 'zoom') {
        this.zoom = (this.zoom + 1) % ZOOM_PRESETS.length; ctx.toast(['Close view', 'High view', 'Scout view'][this.zoom]);
        this.attackVariant = rig.variants[0]; this.startAnim('weapon', 0.9); this.pendingHit = null;
        return;
      }
      // chain through the weapon's variations while attacks keep coming
      const sinceLast = this.clock - (this.lastAttackEnd ?? -9);
      this.comboStep = sinceLast < 0.55 ? this.comboStep + 1 : 0;
      this.attackVariant = rig.variants[this.comboStep % rig.variants.length];
      const speedy = this.status.speedy > 0 ? 0.65 : 1;
      this.startAnim('weapon', w.cooldown * speedy * (rig.variants.length > 1 ? 1.15 : 1));
      this.pendingHit = w;
      return;
    }
    this.attackVariant = null;
    this.useItem(s, ctx);
  }
  startAnim(style, dur) { this.attackT = 0; this.attackDur = dur; this.hitDone = false; this.animStyle = style; }

  useItem(s, ctx) {
    const def = ITEMS[s.id];
    const here = this.pos.clone();
    const aim = this.aimDir();
    switch (s.id) {
      case 'mulberry': this.heal(0.15); ctx.toast('Mulberry: +15% health'); this.startAnim('use', 0.4); break;
      case 'green_tea': this.heal(0.5); ctx.toast('Green tea: +50% health'); this.startAnim('use', 0.6); break;
      case 'shuriken': this.startAnim('throwing', 0.3); ctx.projectiles.fire('shuriken', { from: here.clone().setY(here.y + 1.3), dir: aim, speed: 26, range: 18, damage: 28 * this.damageMult(), owner: 'player', onHit: (m, p) => m.damage(p.damage, 'shuriken', ctx) }); break;
      case 'bohiya': this.startAnim('throwing', 0.5); ctx.projectiles.fire('bohiya', { from: here.clone().setY(here.y + 1.4), dir: aim, speed: 18, range: 60, damage: 50, owner: 'player', gravity: 7, splash: 4.5, burn: 4, onHit: () => {} }); break;
      case 'makibishi': { this.startAnim('use', 0.3); const m = new THREE.Group(); for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.TetrahedronGeometry(0.12), new THREE.MeshStandardMaterial({ color: 0x555a60, metalness: 0.7, roughness: 0.4 })); c.position.set((Math.random() - 0.5) * 0.8, 0.08, (Math.random() - 0.5) * 0.8); c.rotation.set(Math.random(), Math.random(), 0); m.add(c); } m.position.copy(here).setY(this.world.heightAt(here.x, here.z)); ctx.projectiles.area({ kind: 'makibishi', mesh: m, pos: m.position.clone(), radius: 0.8, ttl: 90, uses: 4, onUpdate: (a, dt, c) => { for (const mo of c.monsters) { if (!mo.alive || mo.ally || mo.type === 'ghost' || (a.cd && a.cd[mo.id] > 0)) continue; if (Math.hypot(mo.pos.x - a.pos.x, mo.pos.z - a.pos.z) < a.radius + mo.radius) { mo.damage(22, 'makibishi', c); mo.slow = 2; a.cd = a.cd || {}; a.cd[mo.id] = 1.5; a.uses -= 1; if (a.uses <= 0) a.dead = true; } } if (a.cd) for (const k in a.cd) a.cd[k] -= dt; } }); ctx.toast('Makibishi scattered'); break; }
      case 'super_stomp': { this.startAnim('heavy', 0.7); ctx.effects.burst(here.clone().setY(here.y + 0.2), { count: 60, color: [0xc9a86a, 0x8a6a44], speed: 7, life: 0.8, size: 1.5, gravity: 8, up: 0.5 }); ctx.shake?.(0.8); let n = 0; for (const m of ctx.monsters) if (m.alive && !m.ally && m.type === 'skeleton' && m.pos.distanceTo(here) < 12) { m.damage(9999, 'stomp', ctx); n++; } ctx.toast(`Super Stomp: ${n} skeletons shattered`); break; }
      case 'headshots': this.status.headshots = 10; ctx.toast('Headshots Only: 10s'); this.startAnim('use', 0.4); break;
      case 'ecto_goggles': this.status.ecto = 30; ctx.toast('Ecto-Goggles: 30s'); this.startAnim('use', 0.4); break;
      case 'speedy': this.status.speedy = 10; ctx.toast('Speedy Spell: 10s'); this.startAnim('cast', 0.5); break;
      case 'lucky': this.status.lucky = 30; ctx.toast('Lucky Spell: 30s'); this.startAnim('cast', 0.5); break;
      case 'protector': { this.startAnim('cast', 0.7); let n = 0; for (const m of ctx.monsters) if (m.alive && !m.ally && m.pos.distanceTo(here) < 11) { m.ally = true; n++; ctx.effects.burst(m.pos.clone().setY(m.pos.y + 1), { count: 12, color: 0xffffff, speed: 2, life: 0.6, size: 1, gravity: -1 }); } ctx.toast(`Protector Spell: ${n} monsters now fight for you`); break; }
      case 'corpuscular': { this.startAnim('cast', 0.6); const beam = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); beam.position.copy(here).setY(here.y + 30); const pool = new THREE.Mesh(new THREE.CircleGeometry(4.5, 32), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })); pool.rotation.x = -Math.PI / 2; pool.position.y = -29.9; beam.add(pool); ctx.projectiles.area({ kind: 'ray', mesh: beam, pos: here.clone(), radius: 4.5, ttl: 3, onUpdate: (a, dt, c) => { a.mesh.material.opacity = 0.35 * (1 - a.t / 3) + 0.1; for (const m of c.monsters) if (m.alive && !m.ally && m.type === 'vampire' && Math.hypot(m.pos.x - a.pos.x, m.pos.z - a.pos.z) < a.radius) { m.invulnerable = false; m.dashing = 0; m.damage(60 * dt, 'sun', c); m.burn = Math.max(m.burn, 1); } } }); ctx.toast('Corpuscular Ray'); break; }
      case 'wolfsbane': { this.startAnim('throwing', 0.5); const target = here.clone().addScaledVector(aim, 7); target.y = this.world.heightAt(target.x, target.z); const cloud = new THREE.Group(); for (let i = 0; i < 7; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(1.6 + Math.random(), 10, 8), new THREE.MeshStandardMaterial({ color: 0x9a6ad4, transparent: true, opacity: 0.3, depthWrite: false })); p.position.set((Math.random() - 0.5) * 4, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 4); cloud.add(p); } cloud.position.copy(target); ctx.projectiles.area({ kind: 'wolfsbane', mesh: cloud, pos: target.clone(), radius: 4.5, ttl: 15, onUpdate: (a, dt, c) => { a.mesh.children.forEach((p, i) => { p.position.y += Math.sin(a.t * 2 + i) * dt * 0.3; p.material.opacity = 0.3 * Math.min(1, (15 - a.t) / 2); }); for (const m of c.monsters) if (m.alive && !m.ally && m.type === 'werewolf' && Math.hypot(m.pos.x - a.pos.x, m.pos.z - a.pos.z) < a.radius) { m.damage(45 * dt, 'wolfsbane', c); m.slow = 0.5; } } }); ctx.toast('Wolfsbane cloud'); break; }
      case 'holy_water': this.status.holy = 10; ctx.toast('Holy Water Hose: 10s'); this.startAnim('cast', 0.3); break;
      default: return;
    }
    if (def.kind === 'use') this.consume();
  }

  damageMult() { return this.status.speedy > 0 ? 1.15 : 1; }

  /** Damage multiplier of the current weapon against a monster type. */
  weaponDamage(w, monster) {
    let d = w.damage * this.damageMult();
    if (this.current?.primary && this.rub && RUBS[this.rub].vs === monster.type) d *= 2;
    if (w.id === 'tekkokagi' && this.flamingTekko) d *= 2;
    if (this.status.headshots > 0 && monster.type === 'zombie') d = 9999;
    return d;
  }

  aimDir() { return new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)); }

  resolveMeleeHit(w, ctx) {
    const aim = this.aimDir();
    const hits = [];
    for (const m of ctx.monsters) {
      if (!m.alive || m.ally) continue;
      _v.copy(m.pos).sub(this.pos); _v.y = 0;
      const d = _v.length();
      if (d > w.range + m.radius) continue;
      const ang = Math.acos(THREE.MathUtils.clamp(_v.normalize().dot(aim), -1, 1));
      if (ang > w.arc / 2 + (d < 1 ? 1 : 0)) continue;
      hits.push({ m, d });
    }
    hits.sort((a, b) => a.d - b.d);
    let count = 0;
    for (const { m } of hits) {
      const dmg = this.weaponDamage(w, m);
      const killed = m.damage(dmg, w.id, ctx);
      if (!killed && w.knock) { _w.copy(m.pos).sub(this.pos).setY(0).normalize(); m.pos.addScaledVector(_w, w.knock * 0.25); }
      if (w.stun && !killed) m.stun = Math.max(m.stun, w.stun);
      if (w.id === 'tekkokagi' && this.flamingTekko && !killed) m.burn = Math.max(m.burn, 2);
      count++;
      if (!w.two && count >= 2) break;
    }
    if (hits.length) { ctx.effects.burst(this.pos.clone().addScaledVector(aim, w.range * 0.6).setY(this.pos.y + 1.1), { count: 6, color: 0xfff0c0, speed: 3, life: 0.25, size: 0.6, gravity: 2 }); ctx.sound?.('hit'); }
    // swings also chop at trees; enough hits fells one in the direction you face
    const chopped = this.world.forest?.hit(this.pos, this.facing, Math.max(1.3, w.range), w.arc, w.damage * this.damageMult(), ctx);
    if (!hits.length && !chopped) ctx.sound?.('swing');
  }

  fireWeapon(w, ctx) {
    const from = this.pos.clone().setY(this.pos.y + 1.3);
    const aim = this.aimDir();
    if (w.projectile === 'arrow') {
      ctx.projectiles.fire('arrow', { from, dir: aim, speed: 34, range: w.range, damage: w.damage, owner: 'player', pierce: false, onHit: (m, p) => { const dmg = this.weaponDamage(w, m); m.damage(dmg, 'arrow', ctx); } });
      ctx.sound?.('bow');
    } else if (w.projectile === 'sickle') {
      ctx.projectiles.fire('sickle', { from, dir: aim, speed: 22, range: w.range, damage: w.damage, owner: 'player', onHit: (m, p) => { const dmg = this.weaponDamage(w, m); const killed = m.damage(dmg, 'sickle', ctx); if (!killed) { _w.copy(this.pos).sub(m.pos).setY(0).normalize(); m.pos.addScaledVector(_w, 1.5); m.stun = Math.max(m.stun, 0.4); } } });
      ctx.sound?.('swing');
    }
  }

  // ------------------------------------------------------------------ update
  update(dt, input, ctx) {
    this.ctx = ctx;
    if (this.dying) { this.updateDeath(dt); return; }
    this.invuln = Math.max(0, this.invuln - dt); this.hurt = Math.max(0, this.hurt - dt * 3);
    for (const k in this.status) this.status[k] = Math.max(0, this.status[k] - dt);
    this.clock = (this.clock ?? 0) + dt;

    // movement: the samurai faces the way they move, and attacks go where they face
    const w = this.weapon;
    const heavySwing = this.attackT >= 0 && w.style === 'heavy';
    // wading slows you down (up to about half speed in thigh-deep water)
    const wade = Math.max(0, Math.min(1, (this.world.terrain.waterLevelAt(this.pos.x, this.pos.z) - this.world.heightAt(this.pos.x, this.pos.z)) / 0.6));
    const speedMult = (this.usingWeapon ? w.speed : 1.05) * (this.status.speedy > 0 ? 1.4 : 1) * (heavySwing ? 0.35 : 1) * (1 - 0.5 * wade);
    const mv = input.move;
    const target = _v.set(mv.x, 0, mv.y).multiplyScalar(this.baseSpeed * speedMult);
    this.vel.lerp(target, 1 - Math.exp(-12 * dt));
    const r = this.world.move(this.pos, this.pos.x + this.vel.x * dt, this.pos.z + this.vel.z * dt, this.radius);
    // feet follow the ground; quick to climb steps, a little gravity when stepping down
    const dy = r.y - this.pos.y;
    this.pos.set(r.x, dy > 0 ? THREE.MathUtils.damp(this.pos.y, r.y, 25, dt) : THREE.MathUtils.damp(this.pos.y, r.y, 14, dt), r.z);
    if (Math.abs(this.pos.y - r.y) < 0.01) this.pos.y = r.y;
    if (mv.lengthSq() > 0.02) {
      const turn = heavySwing ? 5 : this.attackT >= 0 ? 10 : 18;
      this.facing = dampAngle(this.facing, Math.atan2(mv.x, mv.y), turn, dt);
    }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.facing;

    // attacks
    if (this.attackT >= 0) {
      this.attackT += dt;
      const hitAt = this.attackVariant ? this.attackVariant.hitAt : this.pendingHit?.hitAt;
      if (this.pendingHit && !this.hitDone && this.attackT >= this.attackDur * hitAt) {
        this.hitDone = true;
        const wp = this.pendingHit;
        if (wp.projectile) this.fireWeapon(wp, ctx); else this.resolveMeleeHit(wp, ctx);
      }
      if (this.attackT >= this.attackDur) {
        const chained = this.buffered && this.attackVariant && this.usingWeapon;
        this.attackT = -1; this.pendingHit = null; this.buffered = false; this.lastAttackEnd = this.clock;
        if (chained) this.attack(ctx);
        else this.attackVariant = this.usingWeapon ? null : this.attackVariant;
      }
    }
    // holy water hose: continuous cone
    if (this.status.holy > 0) {
      const aim = this.aimDir();
      for (let i = 0; i < 3; i++) ctx.effects.burst(this.pos.clone().setY(this.pos.y + 1.2).addScaledVector(aim, 0.8 + i * 0.3), { count: 2, color: [0x9ad0ff, 0xdff2ff], speed: 10, life: 0.5, size: 0.8, gravity: 3, up: 0.1, spread: 0.3 });
      for (const m of ctx.monsters) {
        if (!m.alive || m.ally) continue;
        _w.copy(m.pos).sub(this.pos).setY(0); const d = _w.length(); if (d > 9) continue;
        if (_w.normalize().dot(aim) < 0.8) continue;
        if (m.type === 'demon') m.damage(90 * dt, 'holy', ctx); else { m.pos.addScaledVector(_w, 6 * dt); m.slow = 0.3; }
      }
      this.rig.armR.shoulder.rotation.x = -1.4; this.rig.armL.shoulder.rotation.x = -1.2;
    }
    this.anim.speed = Math.min(1.2, this.vel.length() / (this.baseSpeed * 0.9));
    // weapons are posed by their choreography (IK); item use keeps the simple gesture poses
    const weaponAnim = this.usingWeapon && this.status.holy <= 0;
    this.anim.attackT = weaponAnim ? -1 : this.attackT; this.anim.attackDur = this.attackDur; this.anim.hurt = this.hurt; this.anim.mirror = this.mirror;
    animateHumanoid(this.rig, this.anim, dt, POSES[this.animStyle] ?? null);
    if (weaponAnim) {
      const t = this.attackT >= 0 && this.attackVariant ? this.attackT / this.attackDur : 0;
      poseWeapon(this.rig, WEAPON_RIGS[this.weaponId], this.attackT >= 0 ? this.attackVariant : null, Math.min(1, t), this.weaponGrips, this.weaponState);
    }
    // blink while invulnerable
    this.mesh.visible = !(this.invuln > 0.4 && Math.floor(this.invuln * 20) % 2 === 0);
  }

  updateDeath(dt) {
    this.deathT += dt;
    const t = Math.min(1, this.deathT / 1.2);
    this.mesh.rotation.x = Math.PI / 2 * t * t;
    this.rig.armR.shoulder.rotation.x = -0.5; this.rig.armL.shoulder.rotation.x = -0.5;
    this.mesh.visible = true;
  }
}
