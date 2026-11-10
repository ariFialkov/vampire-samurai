// Gold: the round's prize, collected as nuggets that monsters drop, felled trees shed and the
// wilderness hides. The tally starts at zero; 1,000 gold returns the stake, anything past
// that is profit.
//
// The round's outcome is still drawn before it starts (shared/rtp.js): it fixes the gold the
// guardian will end with. A nugget's worth is settled the moment it's picked up, along the
// round's pacing curve: richer if the guardian has fallen behind the curve, leaner if ahead,
// and never more than what's left to the target. When the tally reaches the target, gold
// stops appearing and the horde closes in (the wave director takes it from there), so the
// gold on screen at the end is exactly the payout.
import * as THREE from 'three';
import { goldPace } from '../../shared/rtp.js';

/** Per monster: chance to drop, nugget size (weight), and how many. */
export const DROPS = {
  skeleton: { chance: 0.5, weight: 1, n: 1 }, zombie: { chance: 0.6, weight: 1, n: 1 }, witch: { chance: 0.85, weight: 1.5, n: 1 },
  vampire: { chance: 0.9, weight: 2, n: 1 }, ghost: { chance: 0.85, weight: 1.5, n: 1 }, werewolf: { chance: 0.9, weight: 2, n: 1 },
  demon: { chance: 1, weight: 3, n: 5 },
};

/**
 * What a nugget of `weight` is worth when picked up now. Pure, so it can be tested.
 * perWave: the weight of gold that typically turns up in a wave (drives the base size).
 */
export function nuggetValue({ target, tally, wave, progress, weight = 1, perWave = 10 }) {
  const remaining = target - tally;
  if (remaining <= 0) return 0;
  const inc = Math.max(20, goldPace(wave, 1) - goldPace(wave, 0));   // what this wave is worth on the curve
  const base = inc / Math.max(4, perWave);
  const ahead = (tally - goldPace(wave, progress)) / inc;            // > 0: ahead of the curve
  const k = Math.min(3, Math.max(0.3, 1 - ahead * 0.8));
  return Math.max(1, Math.min(remaining, Math.round(base * weight * k)));
}

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();

function nuggetGeometry(seed) {
  // a lumpy little nugget: an icosahedron with its corners pushed in and out
  const g = new THREE.IcosahedronGeometry(0.1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    const k = 1 + 0.28 * Math.sin(_v.x * 41 + seed) * Math.cos(_v.y * 37 - seed * 2) + 0.12 * Math.sin(_v.z * 53 + seed * 3);
    p.setXYZ(i, _v.x * k * 1.2, _v.y * k * 0.75, _v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Bright, warm gold that reads without reflections to pick up (the scene has no env map). */
export const goldMaterial = () => new THREE.MeshStandardMaterial({ color: 0xffd04a, metalness: 0.5, roughness: 0.24, emissive: 0xb07400, emissiveIntensity: 0.75 });

/** A nugget model on its own (used by the game and the asset catalog). */
export function nuggetMesh(weight = 1, seed = 0, mat = null) {
  mat ??= goldMaterial();
  const m = new THREE.Mesh(nuggetGeometry(seed * 2.3 + 1), mat);
  m.scale.setScalar(0.8 + 0.35 * Math.sqrt(weight));
  return m;
}

export class Gold {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.geos = [0, 1, 2].map((s) => nuggetGeometry(s * 2.3 + 1));
    this.mat = goldMaterial();
    // a soft glint that catches the eye from a distance
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,248,214,1)'); r.addColorStop(0.18, 'rgba(255,214,120,0.75)'); r.addColorStop(1, 'rgba(255,190,60,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,240,0.9)'; g.fillRect(31, 4, 2, 56); g.fillRect(4, 31, 56, 2);
    this.glintMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.reset(0);
  }

  /** New round: target gold (the drawn outcome) and the bet it's measured against. */
  reset(target) {
    for (const n of this.list) this.game.scene.remove(n.mesh);
    this.list.length = 0;
    this.target = target; this.tally = 0; this.reached = false;
    this.wildT = 2; this.perWave = 10; this.waveWeight = 0; this.lastWave = 0;
    for (const el of document.querySelectorAll('.gold-pop')) el.remove();
  }

  /** Throw `n` nuggets of `weight` out of something at `pos` (a kill, a fallen tree). */
  drop(pos, weight = 1, n = 1, spread = 2.4) {
    if (this.reached) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.8 + Math.random() * spread;
      this.add(_v.set(pos.x, pos.y + 1, pos.z), weight, new THREE.Vector3(Math.cos(a) * s, 4 + Math.random() * 2.5, Math.sin(a) * s));
    }
  }

  add(pos, weight, vel = null, wild = false) {
    const mesh = new THREE.Group();
    const core = new THREE.Mesh(this.geos[Math.floor(Math.random() * 3)], this.mat);
    const k = 1.05 + 0.45 * Math.sqrt(weight);
    core.scale.setScalar(k); core.castShadow = true; core.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    mesh.add(core);
    const glint = new THREE.Sprite(this.glintMat); glint.scale.setScalar(0.5 * k); glint.position.y = 0.1; mesh.add(glint);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    const n = { mesh, core, glint, pos: mesh.position, vel, weight, t: Math.random() * 5, ttl: wild ? 120 : 50, wild, fade: 0 };
    this.list.push(n);
    this.waveWeight += wild ? 0 : weight;
    return n;
  }

  /** Gold for a kill, by monster type. */
  onKill(m) {
    const d = DROPS[m.type];
    if (!d || this.reached || Math.random() > d.chance) return;
    this.drop(m.pos, d.weight, d.n);
  }

  update(dt) {
    const game = this.game, player = game.player, W = game.waves;
    // learn how much gold a wave tends to bring, so a nugget's base worth fits the pace
    if (W.wave !== this.lastWave) {
      if (this.lastWave > 0) this.perWave = this.perWave * 0.6 + Math.max(4, this.waveWeight) * 0.4;
      this.lastWave = W.wave; this.waveWeight = 0;
    }
    // a few nuggets lie out in the wilds, appearing only where nobody is looking
    this.wildT -= dt;
    if (this.wildT <= 0 && !this.reached && game.state === 'playing') {
      this.wildT = 3.5 + Math.random() * 3;
      if (this.list.filter((n) => n.wild).length < 7) {
        const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 26;
        const q = game.world.openSpotNear(player.pos.x + Math.cos(a) * r, player.pos.z + Math.sin(a) * r, 0.4, 6, 2);
        if (q && !game.world.terrain.isWater(q.x, q.z) && !game.inView(q.x, q.y + 0.3, q.z, 1)) this.add(_v.set(q.x, q.y + 0.08, q.z), 1, null, true);
      }
    }
    const pp = player.pos;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      n.t += dt; n.ttl -= dt;
      // thrown out in an arc, settling on the ground
      if (n.vel) {
        n.vel.y -= 16 * dt;
        n.pos.addScaledVector(n.vel, dt);
        const gy = game.world.groundAt(n.pos.x, n.pos.z, n.pos.y + 0.5) + 0.08;
        if (n.pos.y <= gy) { n.pos.y = gy; if (Math.abs(n.vel.y) < 2) n.vel = null; else { n.vel.y *= -0.35; n.vel.x *= 0.5; n.vel.z *= 0.5; } }
      }
      n.core.rotation.y += dt * 0.8;
      n.glint.material.rotation = n.t;
      const tw = 0.35 + 0.65 * Math.max(0, Math.sin(n.t * 2.3 + n.weight));
      n.glint.scale.setScalar((0.35 + 0.55 * tw) * (1.05 + 0.45 * Math.sqrt(n.weight)));
      // the target is met (or the nugget is old): it melts away
      if (this.reached || n.ttl <= 0) {
        n.fade += dt * 2;
        n.mesh.scale.setScalar(Math.max(0.001, 1 - n.fade));
        if (n.fade >= 1) { game.scene.remove(n.mesh); this.list.splice(i, 1); }
        continue;
      }
      if (!player.alive) continue;
      // drawn to the guardian once close, then collected
      const dx = pp.x - n.pos.x, dz = pp.z - n.pos.z, d = Math.hypot(dx, dz);
      if (d < 5 && !n.vel) {
        const pull = (1 - d / 5) * 16 + 4;
        n.pos.x += (dx / d) * Math.min(d, pull * dt); n.pos.z += (dz / d) * Math.min(d, pull * dt);
        n.pos.y += ((pp.y + 0.6) - n.pos.y) * Math.min(1, dt * 6);
      }
      if (d < 0.75) { this.collect(n); game.scene.remove(n.mesh); this.list.splice(i, 1); }
    }
    this.updatePops(dt);
  }

  collect(n) {
    const game = this.game, W = game.waves;
    const v = nuggetValue({ target: this.target, tally: this.tally, wave: Math.max(1, W.wave), progress: W.progress, weight: n.weight, perWave: this.perWave });
    if (v <= 0) return;
    this.tally += v;
    game.sound?.('gold');
    this.pop(n.pos, v);
    if (this.tally >= this.target) { this.tally = this.target; this.reached = true; this.onReached?.(); }
  }

  /** The round ran long without the gold being gathered: sweep up what's left of the target. */
  sweep() {
    if (this.reached) return;
    const left = this.target - this.tally;
    this.tally = this.target; this.reached = true;
    if (left > 0) this.pop(this.game.player.pos, left);
    this.onReached?.();
  }

  // ---------------------------------------------------------------- "+12" pop-ups
  pop(pos, v) {
    const el = document.createElement('div');
    el.className = 'gold-pop';
    el.textContent = `+${v.toLocaleString('en-US')}`;
    document.getElementById('hud')?.appendChild(el);
    (this.pops ??= []).push({ el, pos: pos.clone().setY(pos.y + 1.8), t: 0 });
  }
  updatePops(dt) {
    const cam = this.game.camera;
    for (let i = (this.pops ?? []).length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      _v.copy(p.pos).addScaledVector(UP, p.t * 0.9).project(cam);
      p.el.style.transform = `translate(${(_v.x * 0.5 + 0.5) * innerWidth}px, ${(-_v.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%)`;
      p.el.style.opacity = String(Math.min(1, 3 * (1 - p.t / 0.9)));
      if (p.t >= 0.9) { p.el.remove(); this.pops.splice(i, 1); }
    }
  }
}
