// Top-level game: renderer, camera, state machine (menu → playing → result) and the loop.
import * as THREE from 'three';
import { World } from '../world/world.js';
import { Player, ZOOM_PRESETS } from '../entities/player.js';
import { CHARACTER_BY_ID } from '../entities/characters.js';
import { Effects } from '../entities/effects.js';
import { Projectiles, PROJECTILE_KINDS, projectileMesh } from '../entities/projectiles.js';
import { Monster, MONSTERS } from '../entities/monsters.js';
import { ITEMS, buildPickupMesh } from '../entities/collectibles.js';
import { WaveDirector } from './waves.js';
import { RoundClient } from './round.js';
import { Pickups } from './pickups.js';
import { Hud } from '../ui/hud.js';
import { Minimap, MINIMAP_RANGE } from '../ui/minimap.js';
import { Menu } from '../ui/menu.js';
import { Input } from '../core/input.js';
import { Sfx } from '../core/audio.js';
import { Rng } from '../../shared/rng.js';
import { WAVE_MULTIPLIERS } from '../../shared/rtp.js';

const $ = (id) => document.getElementById(id);
const _tmp = new THREE.Vector3();

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.settings = Object.assign({ quality: !matchMedia('(pointer: coarse)').matches, shadows: !matchMedia('(pointer: coarse)').matches, sound: true }, JSON.parse(localStorage.getItem('vs.settings') || '{}'));
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.settings.quality ? 2 : 1.5));
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.5, 1200);
    this.lastT = performance.now();
    this.input = new Input(canvas);
    if (this.input.isTouch) document.body.classList.add('touch');
    this.audio = new Sfx();
    this.sound = (k) => { if (this.settings.sound) this.audio.play(k); };
    this.hud = new Hud();
    this.round = new RoundClient();
    this.state = 'loading';
    this.monsters = [];
    this.kills = 0;
    this.shakeT = 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.focus = new THREE.Vector3(0, 14, 6);
    this.rng = new Rng('idle');
    this.ctx = null;
    this.onResize = () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight, false); };
    addEventListener('resize', this.onResize); this.onResize();
  }

  async init() {
    this.world = new World(this.scene, this.renderer, this.settings);
    this.effects = new Effects(this.scene);
    this.projectiles = new Projectiles(this.scene, this.effects);
    this.pickups = new Pickups(this);
    this.minimap = new Minimap(this.world, $('minimap'));
    this.frustum = new THREE.Frustum();
    this._pv = new THREE.Matrix4();
    await Promise.all([this.round.init(), this.prewarm()]);
    this.menu = new Menu(this.round, this.settings);
    this.menu.onPlay = (id) => this.startRound(id);
    this.menu.onSelect = (id) => this.showPreview(id);
    this.hud.onSlotTap = (i) => { if (this.player?.select(i)) this.hud.refreshSlots(); };
    this.showPreview(this.menu.selected);
    this.state = 'menu';
    this.focus.copy(this.player.pos);
    this.updateCamera(0, true);
    $('loading').classList.add('hidden');
    $('result').addEventListener('pointerdown', () => { if (this.state === 'result') this.toMenu(); });
    this.menu.show();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /**
   * Compile every shader the game will ever need before play starts (one of each monster,
   * projectile, pickup and effect, rendered off to the side), so nothing hitches the first
   * time a witch casts or a ghost appears.
   */
  async prewarm() {
    const g = new THREE.Group();
    const rng = new Rng('prewarm');
    const items = [];
    for (const t of Object.keys(MONSTERS)) { const m = new Monster(t, { x: 0, y: 0, z: 0 }, rng.fork(t), g); items.push(m.mesh); }
    for (const k of PROJECTILE_KINDS) { const p = projectileMesh(k); g.add(p); items.push(p); }
    for (const id of Object.keys(ITEMS)) { const p = buildPickupMesh(id, 2); g.add(p); items.push(p); }
    const fx = [
      new THREE.MeshStandardMaterial({ color: 0x9a6ad4, transparent: true, opacity: 0.3, depthWrite: false }),
      new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
      new THREE.MeshStandardMaterial({ color: 0x555a60, metalness: 0.7, roughness: 0.4 }),
    ];
    for (const m of fx) { const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), m); g.add(mesh); items.push(mesh); }
    // lay everything out right in front of the camera and inside the sun's shadow area, then
    // render a real frame: this compiles the colour AND shadow-depth shaders for all of it
    const focus = new THREE.Vector3(0, this.world.surfaceAt(0, 6), 6);
    this.sky?.update?.(0, focus);
    this.world.update(0, focus, {});
    this.camera.position.set(focus.x, focus.y + 9, focus.z + 9); this.camera.lookAt(focus);
    items.forEach((o, i) => { o.position.set(focus.x - 6 + (i % 10) * 1.3, focus.y, focus.z - 3 + Math.floor(i / 10) * 1.5); });
    g.traverse((o) => { o.frustumCulled = false; if (o.isMesh) o.castShadow = true; });
    this.scene.add(g);
    try { await this.renderer.compileAsync(this.scene, this.camera); } catch { /* fall back to the render below */ }
    this.renderer.render(this.scene, this.camera);
    this.scene.remove(g);
  }

  /** The samurai stands at the temple while the menu is up. */
  showPreview(id) {
    if (this.player) { this.scene.remove(this.player.mesh); }
    this.player = new Player(CHARACTER_BY_ID[id], this.scene, this.world);
    // Stand in the torii gate at the top of the southern steps, looking out over the valley
    this.player.pos.set(0, this.world.surfaceAt(0, 25.2), 25.2);
    this.player.facing = 0;
    this.player.mesh.position.copy(this.player.pos);
    this.hud.bind(this.player);
  }

  async startRound(characterId) {
    if (this.state !== 'menu') return;
    this.audio.ensure();
    try { this.roundInfo = await this.round.start(characterId); }
    catch (e) { this.hud.toast(e.message === 'insufficient balance' ? 'Not enough balance for that wager' : 'Could not start round'); this.menu.refresh(); return; }
    this.state = 'playing';
    this.menu.hide();
    this.rng = new Rng(this.roundInfo.script.seed);
    this.kills = 0; this.win = 0;
    this.showPreview(characterId);
    this.player.pos.set(0, this.world.surfaceAt(0, 6), 6);
    this.player.facing = Math.PI;
    this.clearEntities();
    this.ctx = {
      scene: this.scene, world: this.world, player: this.player, monsters: this.monsters, effects: this.effects, projectiles: this.projectiles,
      time: 0, night: false, ectoGoggles: false, speedMult: 1, playerDamageMult: 1, guardian: true,
      toast: (m) => this.hud.toast(m), sound: this.sound, shake: (a) => { this.shakeT = Math.max(this.shakeT, a); },
      onKill: (m) => { this.kills++; this.waves.onKill(m); },
      onHurt: (a) => { this.hud.flashHurt(a); this.sound('hurt'); this.shakeT = Math.max(this.shakeT, a * 0.5); },
      onDeath: () => this.onPlayerDeath(),
      spawnItemLater: (id, pos, delay) => this.pickups.spawnLater(id, pos, delay),
    };
    this.waves = new WaveDirector(this.roundInfo.script, this.rng.fork('waves'), this);
    this.waves.begin();
    this.hud.setWave(1, ''); this.hud.setStats(this.round.bet, 0, 0);
    this.hud.refreshSlots();
    this.hud.show();
    this.input.enabled = true;
    this.hud.banner('Guard the temple');
    this.focus.copy(this.player.pos);
    this.updateCamera(0, true);
  }

  clearEntities() {
    for (const m of this.monsters) m.dispose(this.scene);
    this.monsters.length = 0;
    this.projectiles.clear();
    this.pickups.clear();
    this.world.setNight(false);
  }

  onPlayerDeath() {
    if (this.state !== 'playing') return;
    this.state = 'dying';
    this.input.enabled = false;
    this.sound('death');
    this.hud.banner('The guardian falls');
    setTimeout(() => this.showResult(), 2200);
  }

  async showResult() {
    const wave = this.waves.wave;
    const res = await this.round.settle(wave);
    this.state = 'result';
    this.hud.hide();
    $('result-wave').textContent = String(wave);
    $('result-mult').textContent = `${res.multiplier}×`;
    $('result-payout').textContent = res.payout.toFixed(2);
    $('result-kills').textContent = String(this.kills);
    $('result-title').textContent = res.payout > 0 ? (res.multiplier >= 5 ? 'A legend of the temple' : 'The guardian falls, honoured') : 'The guardian falls';
    $('result-fair').textContent = res.serverSeed ? `provably fair · seed ${res.serverSeed.slice(0, 24)}… · nonce ${this.roundInfo.nonce}` : '';
    $('result').classList.remove('hidden');
  }

  toMenu() {
    $('result').classList.add('hidden');
    this.clearEntities();
    this.state = 'menu';
    this.showPreview(this.menu.selected);
    this.menu.show();
  }

  handleActions() {
    for (const a of this.input.drain()) {
      if (a === 'attack') this.player.attack(this.ctx);
      else if (a === 'prev') { this.player.cycle(-1); this.hud.refreshSlots(); }
      else if (a === 'next') { this.player.cycle(1); this.hud.refreshSlots(); }
      else if (a === 'equip') this.pickups.equipNear();
      else if (a.startsWith('slot')) { if (this.player.select(Number(a[4]))) this.hud.refreshSlots(); }
    }
    if (this.input.attackHeld && this.player.usingWeapon) this.player.attack(this.ctx);
  }

  frame() {
    const now = performance.now(); const dt = Math.min(0.05, (now - this.lastT) / 1000); this.lastT = now;
    const playing = this.state === 'playing' || this.state === 'dying';
    if (playing) {
      const ctx = this.ctx;
      ctx.time += dt;
      ctx.night = this.world.sky.night > 0.5;
      ctx.ectoGoggles = this.player.status.ecto > 0;
      ctx.speedMult = this.speedMult ?? 1;
      ctx.playerDamageMult = this.waves.playerDamageMult;
      ctx.guardian = this.guardian;
      this.input.update();
      if (this.state === 'playing') this.handleActions();
      this.player.update(dt, this.input, ctx);
      // which monsters are on screen / on the minimap (out of sight they close in faster)
      this._pv.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this._pv);
      const pp = this.player.pos;
      for (const m of this.monsters) {
        _tmp.copy(m.pos); _tmp.y += 1;
        m.onScreen = this.frustum.containsPoint(_tmp);
        m.onMinimap = Math.hypot(m.pos.x - pp.x, m.pos.z - pp.z) < MINIMAP_RANGE;
      }
      this.waves.update(dt);
      for (let i = this.monsters.length - 1; i >= 0; i--) {
        const m = this.monsters[i];
        m.update(dt, ctx);
        if (!m.alive && m.removed && (m.left || !['zombie', 'werewolf', 'demon'].includes(m.type))) this.monsters.splice(i, 1);
      }
      this.projectiles.update(dt, ctx);
      this.pickups.update(dt);
      this.effects.update(dt);
      this.hud.update(dt);
      this.minimap.update(dt, this.player, this.monsters, this.pickups.list);
      this.win = this.round.bet * WAVE_MULTIPLIERS[Math.min(WAVE_MULTIPLIERS.length - 1, this.waves.wave)];
      this.hud.setStats(this.round.bet, this.win, this.kills);
      this.focus.copy(this.player.pos);
    } else {
      // menu / result: slow orbit around the samurai at the temple
      this.effects.update(dt);
      const t = performance.now() * 0.00008;
      this.focus.copy(this.player.pos);
      if (this.player.anim) { this.player.anim.speed = 0; this.player.anim.attackT = -1; }
      this.player.mesh.position.copy(this.player.pos); this.player.mesh.rotation.y = this.player.facing;
      this.player.update(0.0001, { move: new THREE.Vector2() }, this.ctx ?? { effects: this.effects, monsters: [], projectiles: this.projectiles, toast: () => {} });
      this.menuOrbit = t;
    }
    this.updateCamera(dt);
    const zoom = playing ? this.player.zoom : 0;
    this.world.update(dt, this.focus, {
      shadowHalf: [34, 52, 80][zoom],
      grassSpread: playing ? [1, 1.45, 2.1][zoom] : 1.7,
      interactors: this.grassPushers(),
    });
    if (!this.headless) this.renderer.render(this.scene, this.camera);
  }

  /** The player and the nearest monsters trample the grass as they move through it. */
  grassPushers() {
    const out = this._pushers ??= [];
    out.length = 0;
    const p = this.player;
    if (!p) return out;
    out.push({ id: 'player', x: p.pos.x, z: p.pos.z, r: 0.75 });
    const near = [];
    for (const m of this.monsters) {
      if (!m.alive || m.type === 'ghost') continue;
      const d = (m.pos.x - p.pos.x) ** 2 + (m.pos.z - p.pos.z) ** 2;
      if (d < 35 * 35) near.push([d, m]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < near.length && out.length < 24; i++) { const m = near[i][1]; out.push({ id: m.id, x: m.pos.x, z: m.pos.z, r: m.radius * 1.3 + 0.25 }); }
    return out;
  }

  updateCamera(dt, snap = false) {
    const playing = this.state === 'playing' || this.state === 'dying';
    let target, look;
    if (playing) {
      const z = ZOOM_PRESETS[this.player.zoom];
      target = new THREE.Vector3(this.focus.x, this.focus.y + z.h, this.focus.z + z.d);
      look = new THREE.Vector3(this.focus.x, this.focus.y + 1, this.focus.z - 1);
    } else {
      // over-the-shoulder view from behind the samurai, drifting gently
      const a = Math.sin((this.menuOrbit ?? 0) * 6) * 0.35;
      target = new THREE.Vector3(this.focus.x + Math.sin(a) * 3.5 - 1.5, this.focus.y + 3.4, this.focus.z - 6.5 - Math.cos(a) * 0.5);
      look = new THREE.Vector3(this.focus.x + 1.5, this.focus.y + 1.6, this.focus.z + 10);
    }
    if (snap) { this.camPos.copy(target); this.camLook.copy(look); }
    const k = playing ? 8 : 2.5;
    this.camPos.x = THREE.MathUtils.damp(this.camPos.x, target.x, k, dt);
    this.camPos.y = THREE.MathUtils.damp(this.camPos.y, target.y, k, dt);
    this.camPos.z = THREE.MathUtils.damp(this.camPos.z, target.z, k, dt);
    this.camLook.x = THREE.MathUtils.damp(this.camLook.x, look.x, k, dt);
    this.camLook.y = THREE.MathUtils.damp(this.camLook.y, look.y, k, dt);
    this.camLook.z = THREE.MathUtils.damp(this.camLook.z, look.z, k, dt);
    this.camera.position.copy(this.camPos);
    if (this.shakeT > 0) { this.shakeT -= dt; this.camera.position.x += (Math.random() - 0.5) * this.shakeT * 0.6; this.camera.position.y += (Math.random() - 0.5) * this.shakeT * 0.6; }
    this.camera.lookAt(this.camLook);
  }
}
