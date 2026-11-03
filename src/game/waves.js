// Wave director. Composes waves from the round's seeded RNG and difficulty profile, spawns
// monsters at the map edges, and STEERS the round toward the pre-drawn outcome:
//  - before the fated wave the guardian cannot fall (lucky dodges, lighter pressure, heals)
//  - on the fated wave, once the scripted progress is reached, pressure ramps until he falls.
import * as THREE from 'three';
import { Monster, MONSTERS } from '../entities/monsters.js';

const UNLOCK = { skeleton: 1, zombie: 2, witch: 3, vampire: 5, ghost: 6, werewolf: 7, demon: 9 };

export class WaveDirector {
  constructor(script, rng, game) {
    this.script = script; this.rng = rng; this.game = game;
    this.wave = 0;
    this.state = 'idle';         // idle | intermission | active | doom
    this.timer = 0;
    this.queue = [];             // pending spawn groups: { type, count, at (time), angle, pack }
    this.spawned = 0; this.total = 0; this.killed = 0;
    this.waveTime = 0;
    this.doomT = 0;
    this.healTimer = 0;
    this.demonWave = false;
    this.playerDamageMult = 1;
  }

  begin() { this.state = 'intermission'; this.timer = 3.5; this.wave = 0; }

  /** Compose wave n. Budget grows with n; profile biases vary per round; some waves are rests. */
  compose(n) {
    const P = this.script.profile, rng = this.rng.fork(`wave${n}`);
    const rest = P.restWaves.includes(n);
    const isDemon = n === P.demonWave;
    let budget = (6 + n * 4.2 + n * n * 0.35) * (rest ? 0.5 : 1) * rng.float(0.85, 1.15);
    const groups = [];
    const avail = Object.keys(UNLOCK).filter((t) => UNLOCK[t] <= n && t !== 'demon');
    const weights = {};
    for (const t of avail) {
      const age = n - UNLOCK[t];
      weights[t] = (t === 'skeleton' ? 6 * P.hordeBias : t === 'zombie' ? 4 * P.hordeBias : t === 'witch' ? 2.5 * P.rangedBias : t === 'werewolf' ? 2 * P.packBias : 2.2) * (1 + age * 0.08) / (1 + age * 0.05);
    }
    if (isDemon) {
      const demons = 1 + Math.floor(n / 6);
      for (let i = 0; i < demons; i++) groups.push({ type: 'demon', count: 1, angle: rng.float(0, Math.PI * 2) });
      budget *= 0.35;
    }
    let guard = 0;
    while (budget > 0 && guard++ < 40) {
      const type = rng.weighted(weights);
      const D = MONSTERS[type];
      const count = Math.max(1, Math.round(rng.int(D.group[0], D.group[1]) * (type === 'skeleton' || type === 'zombie' ? Math.min(2.2, 0.6 + n * 0.12) : 1)));
      groups.push({ type, count, angle: rng.float(0, Math.PI * 2), pack: type === 'werewolf' });
      budget -= count * D.score;
    }
    // spread the groups over the first ~55% of the wave
    const dur = 18 + n * 2.5;
    for (const g of groups) g.at = rng.float(0, dur * 0.55);
    groups.sort((a, b) => a.at - b.at);
    return { groups, rest, isDemon, total: groups.reduce((s, g) => s + g.count, 0) };
  }

  startWave() {
    this.wave += 1;
    const comp = this.compose(this.wave);
    this.queue = comp.groups; this.total = comp.total; this.spawned = 0; this.killed = 0; this.waveTime = 0;
    this.state = 'active';
    this.demonWave = comp.isDemon;
    this.game.world.setNight(comp.isDemon);
    this.game.hud.banner(comp.isDemon ? 'The sun sets' : comp.rest ? 'A quiet moment' : `Wave ${this.wave}`, comp.isDemon ? `Wave ${this.wave} · Demons` : comp.rest ? `Wave ${this.wave}` : waveTagline(this.wave, comp));
    this.game.hud.setWave(this.wave, comp.rest ? 'rest' : comp.isDemon ? 'demons' : '');
    this.game.sound?.('wave');
  }

  spawnGroup(g) {
    const game = this.game, rng = this.rng;
    const pack = [];
    const pp = game.player.pos;
    for (let i = 0; i < g.count; i++) {
      // Monsters come in from the wilds: spawn just beyond the view toward this group's edge angle
      const a = g.angle + rng.float(-0.25, 0.25);
      const dist = (g.type === 'skeleton' || g.type === 'zombie' ? 42 : 52) + rng.float(0, 10);
      let x = pp.x + Math.cos(a) * dist, z = pp.z + Math.sin(a) * dist;
      const e = game.world.edgePoint(a);
      if (Math.hypot(e.x - pp.x, e.z - pp.z) < dist) { x = e.x; z = e.z; }
      const r = game.world.resolve(x + rng.float(-3, 3), z + rng.float(-3, 3), 0.5, true); if (r) { x = r.x; z = r.z; }
      const m = new Monster(g.type, { x, y: game.world.heightAt(x, z), z }, rng.fork(`m${this.spawned}`), game.scene);
      if (g.pack) { m.pack = pack; pack.push(m); }
      game.monsters.push(m);
      this.spawned++;
    }
  }

  /** Spawn a reinforcement group adjacent to the player during the doom phase. */
  spawnDoom() {
    const game = this.game, rng = this.rng, n = this.wave;
    const types = Object.keys(UNLOCK).filter((t) => UNLOCK[t] <= Math.max(2, n));
    const type = rng.pick(types.filter((t) => t !== 'demon' || this.demonWave).concat(n >= 6 ? ['werewolf', 'vampire'] : ['skeleton']));
    const count = type === 'skeleton' ? 6 : type === 'zombie' ? 4 : 2;
    for (let i = 0; i < count; i++) {
      const a = rng.float(0, Math.PI * 2), r = rng.float(14, 22);
      let x = game.player.pos.x + Math.cos(a) * r, z = game.player.pos.z + Math.sin(a) * r;
      const p = game.world.resolve(x, z, 0.5, true); if (p) { x = p.x; z = p.z; }
      const m = new Monster(type, { x, y: game.world.heightAt(x, z), z }, rng.fork(`d${this.doomT}${i}`), game.scene);
      m.seen = true;
      game.monsters.push(m);
      this.spawned++; this.total++;
    }
  }

  onKill() { this.killed++; }

  get alive() { return this.game.monsters.filter((m) => m.alive && !m.ally).length; }
  get progress() { return this.total ? this.killed / this.total : 0; }

  update(dt) {
    const S = this.script, game = this.game, player = game.player;
    const fated = this.wave === S.deathWave;
    const protect = this.wave < S.deathWave || (fated && this.state !== 'doom');
    // ---- steering: damage multiplier & helping hand before the fated moment
    let mult = 1;
    if (protect) {
      const hp = player.health / player.maxHealth;
      mult = hp < 0.2 ? 0.3 : hp < 0.4 ? 0.65 : 1;
      this.healTimer -= dt;
      const healsOut = game.pickups.list.filter((p) => (p.id === 'mulberry' || p.id === 'green_tea') && p.pos.distanceTo(player.pos) < 30).length;
      if (hp < 0.45 && this.healTimer <= 0 && healsOut < 2) { this.healTimer = 12; game.pickups.spawnNear(player.pos, hp < 0.25 ? 'green_tea' : 'mulberry', 6); }
    }
    if (this.state === 'doom') {
      this.doomT += dt;
      mult = 1 + this.doomT * 0.12 + (this.doomT > 30 ? (this.doomT - 30) * 0.6 : 0);
      game.speedMult = 1 + Math.min(0.6, this.doomT * 0.02);
    } else game.speedMult = 1;
    this.playerDamageMult = mult;
    game.guardian = protect;

    if (this.state === 'intermission') {
      this.timer -= dt;
      if (this.timer <= 0) this.startWave();
      return;
    }
    if (this.state === 'active' || this.state === 'doom') {
      this.waveTime += dt;
      while (this.queue.length && this.queue[0].at <= this.waveTime) this.spawnGroup(this.queue.shift());
      // hurry stragglers after a long time
      if (this.waveTime > 50 && this.queue.length) this.spawnGroup(this.queue.shift());
      if (this.state === 'active') {
        if (fated && this.progress >= S.deathProgress) { this.state = 'doom'; this.doomT = 0; game.hud.banner('The horde swells', 'Hold the line'); }
        else if (!this.queue.length && this.alive === 0 && this.waveTime > 2) {
          // wave cleared
          this.state = 'intermission'; this.timer = 6.5;
          game.world.setNight(false);
          game.hud.banner('Wave cleared', `${this.wave} down`);
          game.sound?.('clear');
        }
      } else {
        // doom: steady reinforcements until the guardian falls
        this.doomTick = (this.doomTick ?? 0) - dt;
        if (this.doomTick <= 0 && this.alive < 26) { this.doomTick = Math.max(2.5, 7 - this.doomT * 0.15); this.spawnDoom(); }
        if (!this.queue.length && this.alive === 0) this.spawnDoom();
      }
    }
  }
}

function waveTagline(n, comp) {
  const types = [...new Set(comp.groups.map((g) => g.type))];
  const names = types.map((t) => MONSTERS[t].name.toLowerCase() + 's');
  return names.slice(0, 3).join(' · ');
}
