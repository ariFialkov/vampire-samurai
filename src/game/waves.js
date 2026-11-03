// Wave director. Composes waves from the round's seeded RNG and difficulty profile, spawns
// monsters out in the wilds, and STEERS the round toward the pre-drawn outcome:
//  - before the fated wave the guardian cannot fall (lucky dodges, lighter pressure, heals)
//  - on the fated wave, once the scripted progress is reached, pressure ramps until he falls.
//
// Composition: the first two waves are a single kind; from wave 3 on, every wave mixes
// several kinds, split into many small groups that arrive in timed "pushes" from different
// directions (sometimes a pincer), with ghosts drifting in alone and wolves hunting as packs.
import { Monster, MONSTERS } from '../entities/monsters.js';

const UNLOCK = { skeleton: 1, zombie: 2, witch: 3, vampire: 4, ghost: 5, werewolf: 6, demon: 9 };
const BASE_WEIGHT = { skeleton: 5, zombie: 4, witch: 2.4, vampire: 2.4, ghost: 2, werewolf: 2 };

export class WaveDirector {
  constructor(script, rng, game) {
    this.script = script; this.rng = rng; this.game = game;
    this.wave = 0;
    this.state = 'idle';         // idle | intermission | active | doom
    this.timer = 0;
    this.queue = [];             // pending spawn groups: { type, count, at, angle, pack }
    this.spawned = 0; this.total = 0; this.killed = 0;
    this.waveTime = 0;
    this.doomT = 0;
    this.healTimer = 0;
    this.demonWave = false;
    this.playerDamageMult = 1;
  }

  begin() { this.state = 'intermission'; this.timer = 3.5; this.wave = 0; }

  /** Budget-weighted composition of wave n. */
  compose(n) {
    const P = this.script.profile, rng = this.rng.fork(`wave${n}`);
    const rest = P.restWaves.includes(n);
    const isDemon = n === P.demonWave;
    let budget = (7 + n * 4.5 + n * n * 0.32) * (rest ? 0.55 : 1) * rng.float(0.88, 1.12);
    const dur = 22 + n * 2.2;
    const avail = Object.keys(BASE_WEIGHT).filter((t) => UNLOCK[t] <= n);
    const bias = { skeleton: P.hordeBias, zombie: P.hordeBias, witch: P.rangedBias, werewolf: P.packBias };

    // ---- roster: which kinds appear
    let roster;
    if (n === 1) roster = ['skeleton'];
    else if (n === 2) roster = ['zombie'];
    else {
      const want = Math.min(avail.length, rest ? 2 : Math.max(2, Math.min(5, 2 + Math.floor((n - 3) / 2) + (rng.chance(0.3) ? 1 : 0))));
      roster = [];
      const newest = avail.find((t) => UNLOCK[t] === n);
      if (newest) roster.push(newest);                       // a newly unlocked monster always debuts
      const pool = {};
      for (const t of avail) if (!roster.includes(t)) pool[t] = BASE_WEIGHT[t] * (bias[t] ?? 1);
      while (roster.length < want && Object.keys(pool).length) { const t = rng.weighted(pool); roster.push(t); delete pool[t]; }
    }

    // ---- split the budget across the roster and into groups
    const groups = [];
    if (isDemon) {
      const demons = 1 + Math.floor(n / 7);
      for (let i = 0; i < demons; i++) groups.push({ type: 'demon', count: 1, role: i === 0 ? 'lead' : 'late' });
      budget *= 0.45;
    }
    const shares = roster.map((t) => BASE_WEIGHT[t] * (bias[t] ?? 1) * rng.float(0.6, 1.4));
    const shareSum = shares.reduce((a, b) => a + b, 0);
    roster.forEach((t, i) => {
      const D = MONSTERS[t];
      let count = Math.max(t === 'skeleton' ? 4 : 1, Math.round((budget * shares[i]) / shareSum / D.score));
      const horde = t === 'skeleton' || t === 'zombie';
      const maxSize = Math.max(1, Math.ceil(count / (horde ? 2 : 1)));     // hordes always come in from 2+ directions
      while (count > 0) {
        let size = t === 'ghost' ? 1 : rng.int(D.group[0], D.group[1]);
        if (horde) size = Math.round(size * Math.min(1.6, 0.7 + n * 0.06));
        size = Math.max(1, Math.min(count, size, maxSize));
        groups.push({ type: t, count: size, pack: t === 'werewolf', role: t === 'ghost' ? 'drift' : horde ? 'horde' : 'support' });
        count -= size;
      }
    });

    // ---- pushes: several timed assaults, each from its own direction
    const nPush = n <= 2 ? 2 : Math.min(6, 2 + Math.floor(n / 3));
    const pushes = [];
    const baseAngle = rng.float(0, Math.PI * 2);
    for (let i = 0; i < nPush; i++) {
      pushes.push({
        t: (nPush === 1 ? 0 : (i / (nPush - 1)) * dur * 0.68) + rng.float(-2, 2),
        angle: baseAngle + i * rng.float(1.4, 2.6),
        pincer: n >= 4 && rng.chance(0.3),
      });
    }
    pushes[0].t = 0;
    const hordePush = (i) => pushes[i % nPush];
    let h = 0;
    for (const g of groups) {
      let p;
      if (g.role === 'drift') { g.at = rng.float(0, dur * 0.8); g.angle = rng.float(0, Math.PI * 2); continue; }
      if (g.role === 'lead') p = pushes[0];
      else if (g.role === 'late') p = pushes[nPush - 1];
      else if (g.role === 'horde') p = hordePush(h++);
      else p = rng.chance(0.6) ? pushes[rng.int(0, nPush - 1)] : pushes[(h + 1) % nPush];   // support joins a push (often a horde's)
      const flip = p.pincer && rng.chance(0.5) ? Math.PI + rng.float(-0.5, 0.5) : 0;
      g.angle = p.angle + flip + rng.float(-0.55, 0.55);
      g.at = Math.max(0, p.t + (g.role === 'support' ? rng.float(1.5, 5) : rng.float(0, 3)));
    }
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
    this.game.hud.banner(`Wave ${this.wave}`);
    this.game.hud.setWave(this.wave);
    this.game.sound?.('wave');
  }

  /** Spawn a group out in the wilds, loosely spread around its approach direction. */
  spawnGroup(g) {
    const game = this.game, rng = this.rng, pp = game.player.pos;
    const pack = [];
    const baseDist = g.type === 'skeleton' || g.type === 'zombie' ? 46 : 54;
    for (let i = 0; i < g.count; i++) {
      const a = g.angle + rng.float(-0.18, 0.18);
      let dist = baseDist + rng.float(-4, 12);
      let x = pp.x + Math.cos(a) * dist, z = pp.z + Math.sin(a) * dist;
      const e = game.world.edgePoint(a);
      if (Math.hypot(e.x - pp.x, e.z - pp.z) < dist) { x = e.x + rng.float(-6, 6); z = e.z + rng.float(-6, 6); }
      const spot = game.world.openSpotNear(x, z, 0.6, 10, 2.5);
      if (!spot) continue;
      const m = new Monster(g.type, spot, rng.fork(`m${this.spawned}`), game.scene);
      if (g.pack) { m.pack = pack; pack.push(m); }
      game.monsters.push(m);
      this.spawned++;
    }
  }

  /** Spawn a reinforcement group close to the player during the doom phase. */
  spawnDoom() {
    const game = this.game, rng = this.rng, n = this.wave;
    const types = Object.keys(UNLOCK).filter((t) => UNLOCK[t] <= Math.max(2, n) && (t !== 'demon' || this.demonWave));
    const type = rng.pick(types);
    const count = type === 'skeleton' ? 6 : type === 'zombie' ? 4 : type === 'demon' ? 1 : 2;
    for (let i = 0; i < count; i++) {
      const a = rng.float(0, Math.PI * 2), r = rng.float(16, 24);
      const spot = game.world.openSpotNear(game.player.pos.x + Math.cos(a) * r, game.player.pos.z + Math.sin(a) * r);
      if (!spot) continue;
      const m = new Monster(type, spot, rng.fork(`d${this.doomT}${i}`), game.scene);
      m.aware = true;
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
      if (this.waveTime > 60 && this.queue.length) this.spawnGroup(this.queue.shift());
      // once everyone is out, stragglers that never found the guardian start hunting
      if (!this.queue.length && this.waveTime > 20) for (const m of game.monsters) m.aware = true;
      if (this.state === 'active') {
        if (fated && this.progress >= S.deathProgress) { this.state = 'doom'; this.doomT = 0; }
        else if (!this.queue.length && this.alive === 0 && this.waveTime > 2) {
          this.state = 'intermission'; this.timer = 6.5;
          game.world.setNight(false);
          game.hud.banner('Wave cleared');
          game.sound?.('clear');
        }
      } else {
        this.doomTick = (this.doomTick ?? 0) - dt;
        if (this.doomTick <= 0 && this.alive < 26) { this.doomTick = Math.max(2.5, 7 - this.doomT * 0.15); this.spawnDoom(); }
        if (!this.queue.length && this.alive === 0) this.spawnDoom();
      }
    }
  }
}
