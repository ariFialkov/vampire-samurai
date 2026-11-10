// The samurai: movement, facing/aim, inventory (5 slots), weapon combat and item use.
import * as THREE from 'three';
import { buildHumanoid } from './humanoid.js';
import { WEAPONS, WEAPON_MESHES, POSES, RUBS } from './weapons.js';
import { ITEMS } from './collectibles.js';
import { MONSTERS } from './monsters.js';
import { dampAngle, angleDiff } from '../core/math.js';
import { WEAPON_RIGS, MOVE_KINDS, moveTrack, moveSteps, poseDistance, sample, attackTrack, dirFrom } from './attacks.js';
import { Chain } from './chain.js';
import { Body } from './body.js';
import { BladeTrail } from './trail.js';
import { techniquesFor, pickTechnique, tempoOf, withOffHand, AIR_FEET } from './specials.js';

const CHS = ['y', 'h', 'r', 'ty', 'tp', 'tw', 'ln', 'cr'], OCHS = ['y', 'h', 'r', 'ty', 'tp'];
function copyPose(dst, src) {
  for (const c of CHS) dst[c] = src[c] ?? 0;
  if (src.O) { dst.O ??= {}; for (const c of OCHS) dst.O[c] = src.O[c] ?? 0; } else dst.O = null;
  return dst;
}
/** Exact critically damped spring of every pose channel toward `target` (w ~ stiffness). */
function springPose(P, V, target, w, dt) {
  const e = Math.exp(-w * dt);
  const step = (o, vo, k, goal) => { const x = o[k], v = vo[k] ?? 0, j0 = x - goal, j1 = v + j0 * w; o[k] = e * (j0 + j1 * dt) + goal; vo[k] = e * (v - j1 * w * dt); };
  for (const c of CHS) step(P, V, c, target[c] ?? 0);
  if (target.O) {
    if (!P.O) P.O = { ...target.O };
    V.O ??= {};
    for (const c of OCHS) step(P.O, V.O, c, target.O[c] ?? 0);
  } else P.O = null;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _look = new THREE.Vector3(), _mv = new THREE.Vector2();

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
    this.body = new Body(this.rig);
    this.trail = new BladeTrail(scene);
    this.pose = {}; this.poseVel = {}; this.act = null; this.buffer = null;
    this.flow = 0; this.lastMove = null; this.lastMoveEnd = -9; this.hitStop = 0; this.hurtKick = 0;
    this.history = []; this.techCd = {}; this.air = 0; this._bodyPos = new THREE.Vector3();
    this.onTechnique = null;               // (technique) => void, for the on-screen name
    this.vel = new THREE.Vector3();
    // Inventory: slot 0 is always the primary weapon
    this.slots = [{ id: character.weapon, count: 1, weapon: character.weapon, primary: true }, null, null, null, null];
    this.selected = 0;
    this.rub = null;                 // serrated | garlic | salt | silver
    this.flamingTekko = false;
    this.attackT = -1; this.attackDur = 0.5; this.hitDone = false;
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
      this.body.track(this.grips.R, this.grips.L);
    }
    this.grips.R.quaternion.identity(); this.grips.L.quaternion.identity();
    this.attackVariant = null; this.weaponState = {}; this.drawing = false; this.nockedArrow = null;
    this.act = null; this.buffer = null; this.flow = 0;
    this.trail?.clear();
    this.body.transition(0.25);                         // the hands move to the new grip smoothly
    const wr = WEAPON_RIGS[this.usingWeapon ? this.weaponId : this.slots[0].weapon];
    copyPose(this.pose, wr.carry); this.poseVel = {};
    this.chain?.setVisible(false); this.sickleProj = null;
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
    if (id === 'kusarigama') {
      this.chain ??= new Chain(this.scene, (x, z) => this.world.heightAt(x, z));
      this.chain.setVisible(true); this.chain.ready = false;
    }
    if (id === 'yumi') {                                 // an arrow that appears in the drawing hand
      const a = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.88, 5), new THREE.MeshStandardMaterial({ color: 0x8a6a44, roughness: 0.8 })); shaft.position.y = 0.44; a.add(shaft);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 6), new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 0.6, roughness: 0.3 })); tip.position.y = 0.92; a.add(tip);
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.004), new THREE.MeshStandardMaterial({ color: 0xf2eee6 })); fl.position.y = 0.08; a.add(fl);
      a.visible = false;
      this.grips.R.add(a); this.weaponMeshes.push(a); this.nockedArrow = a;
    }
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
    this.health -= amount; this.hurt = 1; this.invuln = 0.35; this.hurtKick = Math.min(1, 0.4 + amount / 30);
    ctx.onHurt?.(Math.min(1, amount / 30));
    ctx.effects.burst(_v.copy(this.pos).setY(this.pos.y + 1.1), { count: 8, color: 0x8a1c1c, speed: 2.5, life: 0.4, size: 0.7 });
    if (this.health <= 0) { this.health = 0; this.alive = false; this.dying = true; this.deathT = 0; ctx.onDeath?.(); }
  }
  heal(frac) { this.health = Math.min(this.maxHealth, this.health + this.maxHealth * frac); }

  // ------------------------------------------------------------------ actions
  /**
   * dir: null for the plain attack (chains the weapon's combo), or 'up' | 'down' | 'left' |
   * 'right' for a specific strike: up = thrust, down = overhead cleave, left / right = a cut
   * that sweeps toward that side of the screen. vec: the input direction on the ground (x right,
   * y down-screen), used to aim the bow and thrown items.
   */
  attack(ctx, dir = null, vec = null) {
    if (!this.alive) return;
    const s = this.current;
    if (!s) return;
    if (vec && (!s.weapon || s.weapon === 'yumi') && Math.hypot(vec.x, vec.y) > 0.2) this.facing = Math.atan2(vec.x, vec.y);
    if (s.weapon === 'yumi') { if (!this.act) this.startDraw(); return; }
    if (!s.weapon) { if (this.attackT < 0) { this.attackVariant = null; this.useItem(s, ctx); } return; }
    const w = WEAPONS[s.weapon];
    const rig = WEAPON_RIGS[s.weapon];
    if (w.tool === 'zoom') {
      if (this.attackT >= 0) return;
      this.zoom = (this.zoom + 1) % ZOOM_PRESETS.length; ctx.toast(['Close view', 'High view', 'Scout view'][this.zoom]);
      this.attackVariant = rig.variants[0]; this.startAnim('weapon', 0.9); this.pendingHit = null;
      return;
    }
    const key = dir ? this.moveForDir(dir, rig) : null;
    if (this.act) { this.buffer = { key, directional: !!dir, dir, req: this.clock }; return; }      // flows on when this strike completes
    this.startMove(key, !!dir, ctx, dir);
  }

  /** Which move a direction asks for; the side cuts follow the screen, whatever way we face. */
  moveForDir(dir, rig) {
    const M = rig.moves;
    if (dir === 'up') return M.thrust ? 'thrust' : 'cutL';
    if (dir === 'down') return M.cleave ? 'cleave' : 'cutR';
    // cutL ends on the body's -x side; that side is screen-left when the body's +x points right
    const plusXRight = Math.cos(this.facing) >= 0;
    return (dir === 'left') === plusXRight ? 'cutL' : 'cutR';
  }

  /** Closest enemy roughly along `aim` within reach (for strikes to settle on). */
  findTarget(ctx, aim, reach) {
    let target = null, best = Infinity;
    for (const m of ctx.monsters ?? []) {
      if (!m.alive || m.ally) continue;
      const dx = m.pos.x - this.pos.x, dz = m.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > reach + m.radius) continue;
      const da = Math.abs(angleDiff(aim, Math.atan2(dx, dz)));
      if (da > 0.95 && d > 1.2) continue;
      const score = d + da * 2.2;
      if (score < best) { best = score; target = { m, d, ang: Math.atan2(dx, dz) }; }
    }
    return target;
  }
  inputAim() { const mv = this.input?.move; return mv && mv.lengthSq() > 0.09 ? Math.atan2(mv.x, mv.y) : this.facing; }

  /** Melee reach of the current weapon (the kusarigama's sickle, not its thrown range). */
  meleeRange(w, rig) { return rig.moves?.cutL?.stats?.range ?? w.range; }

  startMove(key, directional, ctx, dir = null, req = null) {
    const w = this.weapon, rig = WEAPON_RIGS[this.weaponId];
    const chained = this.clock - this.lastMoveEnd < 0.6;
    if (!key) {
      this.comboStep = chained && this.lastWasCombo ? (this.comboStep ?? 0) + 1 : 0;
      key = rig.combo[this.comboStep % rig.combo.length];
    }
    const move = rig.moves[key];
    // flow: varied strikes chained in rhythm build momentum; repeating one move or mashing doesn't
    if (directional) this.flow = chained && key !== this.lastMove ? Math.min(4, this.flow + 1) : 0;
    else this.flow = 0;
    // a strike starts from wherever the blade is now: the closer it already is to this move's
    // windup, the shorter the windup (so complementary strikes flow into each other)
    const ease = Math.min(1, Math.max(0.45, poseDistance(this.pose, move.keys[0]) / 1.6)) * (1 - 0.05 * this.flow);
    const tr = moveTrack(move, this.pose, ease, this.poseVel);
    const K = MOVE_KINDS[move.kind], ov = move.stats ?? {};
    const stats = {
      kind: move.kind,
      range: ov.range ?? w.range * K.range,
      arc: ov.arc ?? (move.kind === 'whirl' ? Math.PI * 2 : Math.max(0.6, w.arc * K.arc)),
      dmg: K.dmg * (1 + 0.1 * this.flow),
      knock: K.knock, stun: K.stun ? Math.max(K.stun, w.stun ?? 0) : (w.stun ?? 0),
      limit: w.two ? (move.kind === 'thrust' ? 4 : 99) : K.pierce,
      hitStop: K.hitStop, fire: move.fire,
    };
    let aim = this.inputAim();
    const target = this.findTarget(ctx, aim, stats.range * 1.45);
    if (target) aim = target.ang;
    let lunge = (move.lunge ?? K.lunge) * (rig.lunge ?? 1);
    if (move.kind === 'thrust' && rig.lunge == null && w.range > 3.5) lunge *= 0.75;
    if (target) lunge = Math.min(lunge, Math.max(0, target.d - stats.range * 0.55));
    this.beginAct({
      key, name: move.name, rig, w, directional, dir, req,
      keys: tr.keys, end: tr.end, windup: tr.windup, hit: tr.hit,
      hits: [{ t: tr.hit, st: stats }],
      travel: lunge > 0 ? [{ t0: tr.windup * 0.5, t1: tr.hit, dist: lunge }] : [],
      steps: moveSteps(move, tr.windup, tr.hit, tr.end), aim,
    });
  }

  /** Start an act: an ordinary strike or a technique. */
  beginAct(o) {
    const rate = this.status.speedy > 0 ? 1 / 0.65 : 1;
    this.act = {
      t: 0, rate, fired: new Set(), endPos: this.pos.clone(), travel: [], steps: [], special: null,
      ...o, startClock: this.clock,
    };
    for (const tr of this.act.travel) tr.done = 0;
    this.history.push({ key: o.key, dir: o.dir ?? null, start: this.clock, req: o.req ?? this.clock, end: null, act: this.act });
    if (this.history.length > 8) this.history.shift();
    this.attackVariant = null;
  }

  /**
   * A special-technique gesture (circle, half circle, double flick). The strikes thrown while
   * drawing the gesture don't count toward its string; a technique cuts in from whatever pose
   * the body is in (the motion simply carries on into it).
   */
  technique(ctx, g, ago = 0, rot = 0) {
    if (!this.alive || !this.usingWeapon) return false;
    // facing grows anticlockwise on screen, so a clockwise roll spins the body clockwise
    this._techRot = rot ? -rot : 1;
    const id = this.weaponId, rig = WEAPON_RIGS[id], w = this.weapon;
    const list = techniquesFor(id, rig);
    if (!list.length) return false;
    const gStart = this.clock - ago - 0.05;
    // the string of strikes chained just before the gesture began
    const hist = [];
    for (let i = this.history.length - 1; i >= 0; i--) {
      const e = this.history[i];
      if (e.req >= gStart) continue;               // thrown while drawing the gesture
      const after = hist.length ? hist[0].start : gStart;
      if (after - (e.end ?? after) > 0.9) break;
      hist.unshift(e);
    }
    // a strike still queued behind the current one is part of the string too
    let flow = this.flow;
    if (this.buffer?.key) {
      if (this.buffer.req < gStart) hist.push({ key: this.buffer.key, dir: this.buffer.dir, start: this.clock, end: null });
      if (this.buffer.directional && this.buffer.key !== this.act?.key) flow = Math.min(4, flow + 1);
    }
    const tech = pickTechnique(list, g, hist, flow, this.techCd);
    if (!tech) return false;
    // a technique cuts straight in over an ordinary strike (the motion carries on into it);
    // it waits only for another technique to finish
    const A = this.act;
    if (A?.special) { this.buffer = { tech }; return true; }
    if (A) this.endAct(A, true);
    this.buffer = null;
    this.drawing = false; if (this.nockedArrow) this.nockedArrow.visible = id === 'yumi';
    this.startTechnique(tech, ctx);
    return true;
  }

  startTechnique(tech, ctx) {
    const id = this.weaponId, rig = WEAPON_RIGS[id], w = this.weapon;
    const T = id === 'yumi' ? 1 : tempoOf(rig);
    const spec = tech.build(T);
    const keys = withOffHand([{ ...this.pose, O: this.pose.O ? { ...this.pose.O } : null, t: 0, v: { ...this.poseVel } }, ...spec.keys], rig);
    const reach = this.meleeRange(w, rig) * (tech.reach ?? 1);
    let aim = this.inputAim();
    const target = this.findTarget(ctx, aim, Math.max(reach * 1.5, 5));
    if (target) aim = target.ang;
    const travel = (spec.travel ?? []).map((tr) => ({ ...tr, dist: tr.toTarget && target ? Math.min(tr.dist, Math.max(0, target.d - 0.9)) : tr.dist }));
    const flowMul = 1 + 0.1 * this.flow;
    const hits = spec.hits.map((h) => ({
      t: h.t, fx: h.fx, shake: h.shake, arrows: h.arrows,
      st: {
        kind: 'special', shape: h.shape ?? 'arc', range: h.rangeAbs ?? reach * (h.range ?? 1), arc: h.shape === 'circle' || h.shape === 'ring' ? Math.PI * 2 : (h.arc ?? Math.max(1.2, w.arc)),
        dmg: (h.dmg ?? 1) * flowMul, knock: h.knock ?? 1, stun: Math.max(h.stun ?? 0, w.stun ?? 0), limit: 99, width: h.width, len: h.len, hitStop: h.shape === 'ring' ? 0.09 : 0.04,
      },
    }));
    const first = spec.keys[0].t, hit = hits[0].t;
    // a technique counts as a varied strike for flow, a branch of the tree as two
    this.flow = Math.min(4, this.flow + (tech.after ? 2 : 1));
    this.techCd[tech.id] = tech.cd;
    this.beginAct({
      key: `tech:${tech.id}`, name: tech.name, rig, w, directional: true, special: tech,
      keys, end: spec.keys[spec.keys.length - 1].t, windup: first, hit, hits, aim, travel,
      steps: spec.steps ?? [], spin: spec.spin ? { ...spec.spin, sign: this._techRot || 1 } : null,
      air: spec.air ?? null, iframes: spec.iframes ?? null, pivot: !!spec.pivot, sweepSpin: spec.sweep === 'spin', lineFrom: null,
    });
    this.onTechnique?.(tech);
    ctx.sound?.('swing');
  }

  endAct(A, interrupted = false) {
    const h = this.history.find((e) => e.act === A);
    if (h) h.end = this.clock;
    this.act = null; this.air = 0;
    this.lastMoveEnd = this.clock; this.lastMove = A.key; this.lastWasCombo = !A.directional;
    if (interrupted) return;
    if (this.buffer) {
      const b = this.buffer; this.buffer = null;
      if (b.tech) this.startTechnique(b.tech, this.ctx);
      else this.startMove(b.key, b.directional, this.ctx, b.dir, b.req);
    }
  }

  // ------------------------------------------------------------------ bow: hold to draw, release to loose
  startDraw() {
    if (this.drawing || this.attackT >= 0) return;
    this.drawing = true; this.drawT = 0; this.charged = false;
    this.body.transition(0.12);
    this.attackVariant = WEAPON_RIGS.yumi.variants[0];
    if (this.nockedArrow) this.nockedArrow.visible = true;
  }
  /** 0..1 draw strength (full after a second of holding). */
  get drawPower() { return this.drawing ? Math.min(1, this.drawT / 1.0) : 0; }
  release(ctx) {
    if (!this.drawing) return;
    const held = this.drawT;
    this.drawing = false;
    if (this.nockedArrow) this.nockedArrow.visible = false;
    const quick = held < 0.2;                  // a tap: instant snap shot for point-blank defence
    const p = quick ? 0 : Math.min(1, held / 1.0);
    const w = WEAPONS.yumi;
    const from = this.pos.clone().setY(this.pos.y + 1.3), aim = this.aimDir();
    const damage = (quick ? 16 : 18 + 42 * p) * this.damageMult();
    ctx.projectiles.fire('arrow', {
      from, dir: aim, speed: quick ? 30 : 26 + 26 * p, range: quick ? 14 : 16 + 26 * p, damage, owner: 'player',
      pierce: p >= 0.98, trail: p >= 0.98 ? 0xffe29a : null,
      onHit: (m) => { m.damage(this.weaponDamage({ ...w, damage }, m), 'arrow', ctx); if (quick && m.alive) { m.pos.addScaledVector(aim, 1.2); m.stun = Math.max(m.stun, 0.25); } },
    });
    ctx.sound?.('bow');
    // play out the release and recovery
    this.startAnim('weapon', 0.45);
    this.attackT = 0.42 * 0.45;
    this.pendingHit = null;
  }

  startAnim(style, dur) {
    this.attackT = 0; this.attackDur = dur; this.hitDone = false; this.animStyle = style;
    if (!this.usingWeapon) this.body.transition(0.16);      // ease into the item gesture
  }

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

  /** Strike everything in the move's reach and arc; returns how many were hit. */
  resolveMeleeHit(w, ctx, st = null, lineFrom = null) {
    st ??= { range: w.range, arc: w.arc, dmg: 1, knock: 1, stun: w.stun ?? 0, limit: w.two ? 99 : 2, kind: 'cut' };
    const aim = this.aimDir();
    const hits = [];
    // line shapes: the path just dashed along, or a strip straight ahead
    let la = null, lb = null;
    if (st.shape === 'line' && lineFrom) { la = lineFrom; lb = this.pos; }
    if (st.shape === 'ahead') { la = this.pos; lb = _b.copy(this.pos).addScaledVector(aim, st.len ?? 6); }
    for (const m of ctx.monsters) {
      if (!m.alive || m.ally) continue;
      _v.copy(m.pos).sub(this.pos); _v.y = 0;
      const d = _v.length();
      if (la) {
        // distance from the monster to the segment la-lb
        const sx = lb.x - la.x, sz = lb.z - la.z, L2 = sx * sx + sz * sz || 1;
        const u = Math.max(0, Math.min(1, ((m.pos.x - la.x) * sx + (m.pos.z - la.z) * sz) / L2));
        const ex = la.x + sx * u - m.pos.x, ez = la.z + sz * u - m.pos.z;
        if (Math.hypot(ex, ez) > (st.width ?? 1.4) + m.radius) continue;
        hits.push({ m, d });
        continue;
      }
      if (d > st.range + m.radius) continue;
      const ang = Math.acos(THREE.MathUtils.clamp(_v.normalize().dot(aim), -1, 1));
      if (ang > st.arc / 2 + (d < 1 ? 1 : 0)) continue;
      hits.push({ m, d });
    }
    hits.sort((a, b) => a.d - b.d);
    let count = 0;
    for (const { m } of hits) {
      const dmg = this.weaponDamage(w, m) * st.dmg;
      const killed = m.damage(dmg, w.id, ctx);
      if (!killed && w.knock) { _w.copy(m.pos).sub(this.pos).setY(0).normalize(); m.pos.addScaledVector(_w, w.knock * 0.25 * st.knock); }
      if (st.stun && !killed) m.stun = Math.max(m.stun, st.stun);
      if (w.id === 'tekkokagi' && this.flamingTekko && !killed) m.burn = Math.max(m.burn, 2);
      count++;
      if (count >= st.limit) break;
    }
    if (hits.length) { ctx.effects.burst(this.pos.clone().addScaledVector(aim, Math.min(st.range, 3) * 0.6).setY(this.pos.y + 1.1), { count: 6 + this.flow * 2, color: this.flow >= 3 ? [0xfff0c0, 0xffd27a] : 0xfff0c0, speed: 3, life: 0.25, size: 0.6, gravity: 2 }); ctx.sound?.('hit'); }
    if (la) { if (!hits.length) ctx.sound?.('swing'); return count; }
    // swings also chop at trees; enough hits fells one in the direction you face
    const chopped = this.world.forest?.hit(this.pos, this.facing, Math.max(1.3, Math.min(st.range, 4)), Math.min(st.arc, 3.6), w.damage * this.damageMult() * st.dmg, ctx);
    if (!hits.length && !chopped) ctx.sound?.('swing');
    return count;
  }

  /** The bow's techniques: a ring of arrows, a spread, or one great piercing shot. */
  fireVolley(v, aim, ctx) {
    const from = this.pos.clone().setY(this.pos.y + 1.3), w = WEAPONS.yumi;
    for (let i = 0; i < v.count; i++) {
      const a = v.ring ? aim + (i / v.count) * Math.PI * 2 : aim + (v.count > 1 ? (i - (v.count - 1) / 2) * (v.spread ?? 0.2) : 0);
      const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const damage = (v.dmg ?? w.damage) * this.damageMult() * (1 + 0.1 * this.flow);
      ctx.projectiles.fire('arrow', { from: from.clone(), dir, speed: v.speed ?? 34, range: v.range ?? 26, damage, owner: 'player', pierce: !!v.pierce, trail: v.gold ? 0xffe29a : null,
        onHit: (m) => m.damage(this.weaponDamage({ ...w, damage }, m), 'arrow', ctx) });
    }
    ctx.sound?.('bow');
  }

  /** Dust, sparks and petals that make each technique read. */
  techniqueFx(h, A, ctx) {
    const E = ctx.effects, p = this.pos, y = p.y;
    if (!E || !h.fx) return;
    const aim = this.aimDir();
    if (h.fx === 'ring') {
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; E.burst(_v.set(p.x + Math.sin(a) * 1.2, y + 0.15, p.z + Math.cos(a) * 1.2), { count: 3, color: [0xc9a86a, 0x8a6a44, 0xe8dcc0], speed: 5, life: 0.6, size: 1.1, gravity: 6, up: 0.6 }); }
    } else if (h.fx === 'crack') {
      for (let d = 1; d <= (h.st.len ?? 6); d += 0.8) E.burst(_v.copy(p).addScaledVector(aim, d).setY(this.world.heightAt(p.x + aim.x * d, p.z + aim.z * d) + 0.1), { count: 4, color: [0xc9a86a, 0x6a5a4a], speed: 4, life: 0.55, size: 1.0, gravity: 9, up: 1.2 });
    } else if (h.fx === 'petals') {
      E.burst(_v.copy(p).setY(y + 1.0), { count: 18, color: [0xffc7d9, 0xffe0ea, 0xf49ab8], speed: 4.5, life: 0.9, size: 0.7, gravity: 0.6, spread: 1 });
    } else if (h.fx === 'spin') {
      E.burst(_v.copy(p).setY(y + 0.1), { count: 10, color: [0xc9a86a, 0xe8dcc0], speed: 3.5, life: 0.45, size: 0.8, gravity: 3, up: 0.3 });
    } else if (h.fx === 'streak' && A.lineFrom) {
      const n = 8; for (let i = 0; i <= n; i++) E.burst(_v.lerpVectors(A.lineFrom, p, i / n).setY(y + 1.0), { count: 2, color: [0xf2f6ff, 0xffe3a0], speed: 1.2, life: 0.35, size: 0.7, gravity: 0 });
    } else if (h.fx === 'rise') {
      E.burst(_v.copy(p).addScaledVector(aim, 1.2).setY(y + 0.8), { count: 12, color: [0xfff0c0, 0xffd27a], speed: 4, life: 0.4, size: 0.7, gravity: -2, up: 2 });
    } else if (h.fx === 'spark') {
      E.burst(_v.copy(p).addScaledVector(aim, 1.3).setY(y + 1.1), { count: 6, color: 0xfff0c0, speed: 3, life: 0.25, size: 0.6, gravity: 2 });
    }
  }

  fireWeapon(w, ctx) {
    const from = this.pos.clone().setY(this.pos.y + 1.3);
    const aim = this.aimDir();
    if (w.projectile === 'arrow') {
      ctx.projectiles.fire('arrow', { from, dir: aim, speed: 34, range: w.range, damage: w.damage, owner: 'player', pierce: false, onHit: (m, p) => { const dmg = this.weaponDamage(w, m); m.damage(dmg, 'arrow', ctx); } });
      ctx.sound?.('bow');
    } else if (w.projectile === 'sickle') {
      this.sickleProj = ctx.projectiles.fire('sickle', { from, dir: aim, speed: 22, range: w.range, damage: w.damage, owner: 'player', onHit: (m, p) => { const dmg = this.weaponDamage(w, m); const killed = m.damage(dmg, 'sickle', ctx); if (!killed) { _w.copy(this.pos).sub(m.pos).setY(0).normalize(); m.pos.addScaledVector(_w, 1.5); m.stun = Math.max(m.stun, 0.4); } } });
      ctx.sound?.('swing');
    }
  }

  // ------------------------------------------------------------------ update
  update(dt, input, ctx) {
    this.ctx = ctx;
    if (this.dying) { this.updateDeath(dt); return; }
    this.invuln = Math.max(0, this.invuln - dt); this.hurt = Math.max(0, this.hurt - dt * 3);
    for (const k in this.status) this.status[k] = Math.max(0, this.status[k] - dt);
    if (this.drawing) {
      this.drawT += dt;
      if (!this.charged && this.drawT >= 1) { this.charged = true; ctx.sound?.('charged'); }
    }
    this.clock = (this.clock ?? 0) + dt;

    // movement: the samurai faces the way they move, and attacks go where they face
    this.input = input;
    const w = this.weapon;
    const A = this.act;
    const striking = !!A && A.t < A.end;
    for (const k in this.techCd) this.techCd[k] -= dt;
    const heavySwing = this.attackT >= 0 && w.style === 'heavy' && !this.usingWeapon;
    // wading slows you down (up to about half speed in thigh-deep water)
    const wade = Math.max(0, Math.min(1, (this.world.terrain.waterLevelAt(this.pos.x, this.pos.z) - this.world.heightAt(this.pos.x, this.pos.z)) / 0.6));
    const speedMult = (this.usingWeapon ? w.speed : 1.05) * (this.status.speedy > 0 ? 1.4 : 1) * (heavySwing ? 0.35 : 1) * (1 - 0.5 * wade) * (this.drawing ? 0.55 : 1) * (striking ? 0.18 : 1);
    const mv = input.move;
    const target = _v.set(mv.x, 0, mv.y).multiplyScalar(this.baseSpeed * speedMult);
    this.vel.lerp(target, 1 - Math.exp(-(striking ? 18 : 10) * dt));
    const r = this.world.move(this.pos, this.pos.x + this.vel.x * dt, this.pos.z + this.vel.z * dt, this.radius);
    // feet follow the ground; quick to climb steps, a little gravity when stepping down
    const dy = r.y - this.pos.y;
    this.pos.set(r.x, dy > 0 ? THREE.MathUtils.damp(this.pos.y, r.y, 25, dt) : THREE.MathUtils.damp(this.pos.y, r.y, 14, dt), r.z);
    if (Math.abs(this.pos.y - r.y) < 0.01) this.pos.y = r.y;
    if (A && !A.spin && A.t < A.hit) this.facing = dampAngle(this.facing, A.aim, 22, dt);   // turn into the strike
    else if (this.drawing && input.aim && input.aim.lengthSq() > 0.09) this.facing = dampAngle(this.facing, Math.atan2(input.aim.x, input.aim.y), 20, dt);
    else if (mv.lengthSq() > 0.02) {
      const turn = striking ? 3 : heavySwing ? 5 : this.attackT >= 0 ? 10 : 14;
      this.facing = dampAngle(this.facing, Math.atan2(mv.x, mv.y), turn, dt);
    }

    // ------------------------------------------------------------ strikes
    let P = this.pose, PL = null, PM = null;
    const prev = copyPose(this._prevPose ??= {}, this.pose);
    if (A) {
      const rate = A.rate * (this.hitStop > 0 ? 0.12 : 1);
      this.hitStop -= dt;
      A.t += dt * rate;
      // spins turn the whole body on the spot; otherwise turn into the strike
      if (A.spin) {
        const u = sstep(A.spin.t0, A.spin.t1, A.t);
        this.facing = A.aim + A.spin.sign * Math.PI * 2 * A.spin.turns * u;
      }
      // the body travels into the strike (lunges, leaps, dashes) along the strike's line
      const ax = Math.sin(A.aim), az = Math.cos(A.aim);
      let remaining = 0;
      for (const tr of A.travel) {
        if (A.lineFrom === null && A.t >= tr.t0) A.lineFrom = this.pos.clone();
        const want = tr.dist * sstep(tr.t0, tr.t1, A.t);
        const step = want - tr.done;
        if (Math.abs(step) > 1e-4) {
          const rr = this.world.move(this.pos, this.pos.x + ax * step, this.pos.z + az * step, this.radius);
          this.pos.x = rr.x; this.pos.z = rr.z;
          if (A.air) this.pos.y = Math.max(this.pos.y, rr.y);
        }
        tr.done = want; remaining += tr.dist - want;
      }
      A.endPos.set(this.pos.x + ax * remaining, this.pos.y, this.pos.z + az * remaining);
      // airborne arc
      this.air = A.air && A.t > A.air.t0 && A.t < A.air.t1 ? A.air.h * Math.sin(Math.PI * (A.t - A.air.t0) / (A.air.t1 - A.air.t0)) : 0;
      if (A.iframes && A.t >= A.iframes[0] && A.t <= A.iframes[1]) this.invuln = Math.max(this.invuln, 0.06);
      for (const h of A.hits) {
        if (h.done || A.t < h.t) continue;
        h.done = true;
        let n = 0;
        if (h.arrows) this.fireVolley(h.arrows, A.aim, ctx);
        else if (h.st.fire) { this.fireWeapon(A.w, ctx); }
        else n = this.resolveMeleeHit(A.w, ctx, h.st, A.lineFrom);
        this.techniqueFx(h, A, ctx);
        if (n > 0) {
          this.hitStop = h.st.hitStop;
          const heavy = h.st.kind === 'cleave' || h.st.shape === 'ring';
          ctx.rumble?.(heavy ? 0.6 : 0.3, heavy ? 120 : 60);
          if (h.st.kind === 'cleave') ctx.shake?.(0.1);
        }
        if (h.shake) ctx.shake?.(h.shake);
      }
      sample(A.keys, Math.min(A.t, A.end), P);
      PL = sample(A.keys, Math.min(A.t + 0.05, A.end), this._pl ??= {});
      PM = sample(A.keys, Math.min(A.t + 0.025, A.end), this._pm ??= {});
      // which way the blade is about to travel: during the windup, the coming cut
      const sw = P.sweep = this._sweep ??= new THREE.Vector3();
      if (A.sweepSpin && A.t >= A.spin.t0 * 0.8 && A.t <= A.spin.t1) sw.set(0, 0, -A.spin.sign);   // spinning: the edge leads round
      else if (A.t < A.windup) {
        const H = sample(A.keys, A.hit, this._ph ??= {}), W = A.keys[1];
        dirFrom(H.ty, H.tp, sw).sub(dirFrom(W.ty, W.tp, _a));
      } else {
        const Q = sample(A.keys, Math.min(A.t + 0.03, A.end), this._pq ??= {});
        dirFrom(Q.ty, Q.tp, sw).sub(dirFrom(P.ty, P.tp, _a));
        if (sw.lengthSq() < 1e-6) { const H = sample(A.keys, A.hit, this._ph ??= {}); dirFrom(H.ty, H.tp, sw).sub(dirFrom(A.keys[1].ty, A.keys[1].tp, _a)); }
      }
      const lastHit = A.hits[A.hits.length - 1].t;
      P.swingW = 1 - sstep(lastHit + (A.end - lastHit) * 0.5, A.end, A.t);
      for (const c of CHS) this.poseVel[c] = (P[c] - prev[c]) / Math.max(1e-3, dt);
      if (A.t >= A.end) this.endAct(A);
    } else if (this.flow > 0 && this.clock - this.lastMoveEnd > 1.4) this.flow = 0;   // the moment passed

    // legacy timed animations: bow draw/release, binoculars, item gestures
    if (this.attackT >= 0) {
      this.attackT += dt;
      const hitAt = this.attackVariant ? this.attackVariant.hitAt : this.pendingHit?.hitAt;
      if (this.pendingHit && !this.hitDone && this.attackT >= this.attackDur * hitAt) {
        this.hitDone = true;
        const wp = this.pendingHit;
        if (wp.projectile) this.fireWeapon(wp, ctx); else this.resolveMeleeHit(wp, ctx);
      }
      if (this.attackT >= this.attackDur) {
        const wasItem = !this.usingWeapon;
        this.attackT = -1; this.pendingHit = null;
        if (wasItem) this.body.transition(0.22);
        if (this.weaponId === 'yumi' && input.holding) this.startDraw();   // still holding: nock the next arrow
        else this.attackVariant = null;
      }
    }
    const weaponRig = this.usingWeapon ? WEAPON_RIGS[this.weaponId] : null;
    if (!this.act) { P.sweep = null; P.swingW = null; }
    if (weaponRig && !A) {
      const legacy = this.drawing || (this.attackT >= 0 && this.attackVariant);
      if (legacy) {
        let t = this.attackDur > 0 ? this.attackT / this.attackDur : 0;
        if (this.drawing) {
          // the draw follows how long the button is held; at full draw the arms tremble slightly
          const d = Math.min(1, this.drawT / 0.85);
          t = 0.4 * (1 - (1 - d) * (1 - d)) + (this.drawT > 1 ? Math.sin(this.drawT * 40) * 0.002 : 0);
        }
        sample(attackTrack(weaponRig, this.attackVariant ?? weaponRig.variants[0]), Math.min(1, Math.max(0, t)), P);
        for (const c of CHS) this.poseVel[c] = (P[c] - prev[c]) / Math.max(1e-3, dt);
      } else {
        // guard: springs back from the follow-through; carried lower and trailing when running
        const g = this._guard ??= {};
        copyPose(g, weaponRig.carry);
        const spd = this.vel.length(), run = sstep(2.5, 5.5, spd) * 0.8;
        g.y += 0.12 * run; g.h -= 0.05 * run; g.r -= 0.03 * run; g.tp -= 0.3 * run;
        const br = Math.sin(this.clock * 1.5);
        g.h += br * 0.006; g.tp += Math.sin(this.clock * 0.7 + 1) * 0.012;
        springPose(P, this.poseVel, g, 13, dt);
      }
    }

    // holy water hose: continuous cone
    const holy = this.status.holy > 0;
    if (holy !== this._holy) { this._holy = holy; this.body.transition(0.2); }
    if (holy) {
      const aim = this.aimDir();
      for (let i = 0; i < 3; i++) ctx.effects.burst(this.pos.clone().setY(this.pos.y + 1.2).addScaledVector(aim, 0.8 + i * 0.3), { count: 2, color: [0x9ad0ff, 0xdff2ff], speed: 10, life: 0.5, size: 0.8, gravity: 3, up: 0.1, spread: 0.3 });
      for (const m of ctx.monsters) {
        if (!m.alive || m.ally) continue;
        _w.copy(m.pos).sub(this.pos).setY(0); const d = _w.length(); if (d > 9) continue;
        if (_w.normalize().dot(aim) < 0.8) continue;
        if (m.type === 'demon') m.damage(90 * dt, 'holy', ctx); else { m.pos.addScaledVector(_w, 6 * dt); m.slow = 0.3; }
      }
    }

    // ------------------------------------------------------------ body
    this.mesh.position.copy(this.pos); this.mesh.position.y += this.air;
    this.mesh.rotation.y = this.facing;
    const itemGesture = !this.usingWeapon && this.attackT >= 0 && POSES[this.animStyle];
    const look = this.lookTarget(ctx, A);
    this.body.update(dt, {
      pos: this._bodyPos.set(this.pos.x, this.pos.y + this.air, this.pos.z), facing: this.facing, vel: this.vel,
      ground: (x, z) => this.world.groundAt(x, z, this.pos.y + 0.45),
      moveDir: mv, look,
      air: this.air, airFeet: A?.air && A.t > A.air.t0 && A.t < A.air.t1 ? AIR_FEET[A.air.feet] : null, pivot: !!(A && A.pivot && A.spin && A.t >= A.spin.t0 && A.t <= A.spin.t1 + 0.05),
      pose: weaponRig && !holy ? P : null, poseLead: PL, poseMid: PM, rig: weaponRig, grips: this.weaponGrips, wstate: this.weaponState,
      intensity: A ? sstep(0, A.windup, A.t) * (1 - sstep(A.hit, A.end + 0.15, A.t)) : 0,
      act: A && this.act === A ? A : null,
      item: itemGesture ? { fn: POSES[this.animStyle], t: Math.min(1, this.attackT / this.attackDur) } : null,
      dying: -1, hurt: this.hurtKick,
    });
    this.hurtKick = 0;
    if (holy) { this.rig.armR.shoulder.rotation.set(-1.4, 0, -0.1); this.rig.armL.shoulder.rotation.set(-1.2, 0, 0.1); }

    if (weaponRig) {
      this.mesh.updateMatrixWorld(true);
      if (this.weaponId === 'kusarigama' && this.chain && this.weaponMesh) {
        // the chain runs from the handle to the sickle (flying, or back in hand)
        const flying = this.sickleProj && !this.sickleProj.removed;
        if (!flying) this.sickleProj = null;
        const sickle = this.weaponMesh.getObjectByName('sickle');
        if (sickle) sickle.visible = !flying;
        const start = this.weaponMesh.localToWorld(_w.copy(this.weaponMesh.userData.chainAnchor));
        this.chain.update(dt, start, flying ? this.sickleProj.pos : null);
      }
      if (this.weaponId === 'yumi' && this.weaponMesh?.userData.setNock) {
        // pull the bow string back to the drawing hand
        const hand = this.grips.R.getWorldPosition(_w);
        const local = this.weaponMesh.worldToLocal(hand);
        this.weaponMesh.userData.setNock(this.drawing && local.z < -0.22 ? local.setX(0) : null);
      }
    }
    // the blade's trail through each live strike
    const span = weaponRig?.trail;
    const live = !!(A && span && this.weaponMesh && A.t > A.windup * 0.85 && A.t < A.end - 0.02);
    if (span && this.weaponMesh) {
      this.weaponMesh.localToWorld(_a.set(0, span[0], 0)); this.weaponMesh.localToWorld(_b.set(0, span[1], 0));
      this.trail.color.setHex(this.flamingTekko && this.weaponId === 'tekkokagi' ? 0xffa060 : A?.special ? 0xffe3a0 : this.flow >= 3 ? 0xfff0c8 : 0xf2f6ff);
      this.trail.life = A?.special ? 0.24 : 0.16;
      this.trail.update(dt, live, _a, _b, A ? Math.min(1.3, 0.7 + A.hits[0].st.dmg * 0.25) : 1);
    } else this.trail.update(dt, false);
    // blink while invulnerable
    this.mesh.visible = !(this.invuln > 0.4 && Math.floor(this.invuln * 20) % 2 === 0);
  }

  /** Where the eyes go: the strike's target, else the nearest threat in sight, else nowhere. */
  lookTarget(ctx, A) {
    let best = null, bd = 14;
    for (const m of ctx.monsters ?? []) {
      if (!m.alive || m.ally || (m.type === 'ghost' && !ctx.ectoGoggles && m.visibility < 0.3)) continue;
      const d = Math.hypot(m.pos.x - this.pos.x, m.pos.z - this.pos.z);
      // hysteresis: stay on the current threat unless another is clearly closer
      const dd = m === this._lookAt ? d - 1.5 : d;
      if (dd < bd) { bd = dd; best = m; }
    }
    if (A) {
      // during a strike look along it
      return _look.set(this.pos.x + Math.sin(A.aim) * 3, this.pos.y + 0.8, this.pos.z + Math.cos(A.aim) * 3);
    }
    this._lookAt = best;
    return best ? _look.copy(best.pos) : null;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.trail.dispose();
    this.chain?.setVisible(false);
  }

  updateDeath(dt) {
    this.deathT += dt;
    const t = this.deathT;
    // knees give, the body folds, then topples
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x = 1.4 * sstep(0.45, 1.25, t) * sstep(0.45, 1.25, t);
    this.body.update(dt, {
      pos: this.pos, facing: this.facing, vel: this.vel.multiplyScalar(0.9),
      ground: (x, z) => this.world.groundAt(x, z, this.pos.y + 0.45),
      moveDir: null, look: null, pose: null, rig: null, act: null, item: null, intensity: 0, dying: t, hurt: 0,
    });
    this.trail.update(dt, false);
    this.mesh.visible = true;
  }
}
