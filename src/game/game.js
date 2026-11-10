// Top-level game: renderer, camera, state machine (menu → playing → result) and the loop.
import * as THREE from 'three';
import { World } from '../world/world.js';
import { Player, ZOOM_PRESETS } from '../entities/player.js';
import { CHARACTER_BY_ID } from '../entities/characters.js';
import { Effects } from '../entities/effects.js';
import { Projectiles, PROJECTILE_KINDS, projectileMesh } from '../entities/projectiles.js';
import { Chain } from '../entities/chain.js';
import { WEAPON_RIGS } from '../entities/attacks.js';
import { techniquesFor } from '../entities/specials.js';
import { Monster, MONSTERS } from '../entities/monsters.js';
import { ITEMS, buildPickupMesh } from '../entities/collectibles.js';
import { WaveDirector } from './waves.js';
import { RoundClient } from './round.js';
import { Pickups } from './pickups.js';
import { Hud } from '../ui/hud.js';
import { Menu } from '../ui/menu.js';
import { Input, PAD } from '../core/input.js';
import { Sfx } from '../core/audio.js';
import { Rng } from '../../shared/rng.js';
import { GOLD_PER_STAKE, goldTargetOf } from '../../shared/rtp.js';
import { Gold } from './gold.js';

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
    this.input.onPadChange = () => this.updatePrompts();
    this.input.onSwipe = (x0, y0, x1, y1) => this.brushStroke(x0, y0, x1, y1);
    this.bindPause();
    this.input.onPadConnect = (brand) => { this.input.padBrand = brand; if (this.state === 'playing') this.hud.toast('Controller connected'); };
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
    this.gold = new Gold(this);
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
    { const c = new Chain(g, () => 0); c.update(0.016, new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 1, 0)); items.push(c.links, c.weight); }
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
    if (this.player) this.player.dispose();
    this.player = new Player(CHARACTER_BY_ID[id], this.scene, this.world);
    // Stand in the torii gate at the top of the southern steps, looking out over the valley
    this.player.pos.set(0, this.world.surfaceAt(0, 25.2), 25.2);
    this.player.facing = 0;
    this.player.mesh.position.copy(this.player.pos);
    this.hud.bind(this.player);
    this.player.onTechnique = (t) => this.techniqueBanner(t);
    this.renderTechniques(id);
  }

  /** The technique's name floats up beside the samurai as it's performed. */
  techniqueBanner(t) {
    const el = this._tb ??= $('technique');
    el.innerHTML = `<b lang="ja">${t.jp}</b><span>${t.name}</span>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    this._tbT = 1.4;
  }

  /** Menu: the selected samurai's special techniques and how to perform them. */
  renderTechniques(id) {
    const el = $('techniques');
    if (!el) return;
    const w = CHARACTER_BY_ID[id].weapon;
    const list = techniquesFor(w, WEAPON_RIGS[w]);
    el.innerHTML = list.map((t) => `<li><b lang="ja">${t.jp}</b><span class="tn">${t.name}</span><span class="th">${t.how}</span></li>`).join('');
  }

  async startRound(characterId) {
    if (this.state !== 'menu') return;
    this.audio.ensure();
    try { this.roundInfo = await this.round.start(characterId); }
    catch (e) { this.hud.toast(e.message === 'insufficient balance' ? 'Not enough balance for that wager' : 'Could not start round'); this.menu.refresh(); return; }
    this.state = 'playing';
    if (this.input.isTouch) this.showSwipeHint();
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
      toast: (m) => this.hud.toast(m), sound: this.sound, shake: (a) => { this.shakeT = Math.max(this.shakeT, a); this.input.rumble(Math.min(1, a), 220); },
      onKill: (m) => { this.kills++; this.waves.onKill(m); this.gold.onKill(m); },
      onTreeFelled: (t) => this.gold.drop({ x: t.x, y: t.y + 1.5, z: t.z }, 1.5, 2 + Math.floor(Math.random() * 2), 3),
      rumble: (s, ms) => this.input.rumble(s, ms),
      onShatter: (p) => { this.player.onShattered(p); this.sound('shatter'); this.input.rumble(0.35, 70); this.gold.drop(p.pos, 0.7, 1, 1.2); },
      onHurt: (a) => { this.hud.flashHurt(a); this.sound('hurt'); this.shakeT = Math.max(this.shakeT, a * 0.5); this.input.rumble(0.25 + a * 0.6, 160); },
      onDeath: () => this.onPlayerDeath(),
      spawnItemLater: (id, pos, delay) => this.pickups.spawnLater(id, pos, delay),
    };
    this.waves = new WaveDirector(this.roundInfo.script, this.rng.fork('waves'), this);
    const sc = this.roundInfo.script;
    this.gold.reset(sc.goldTarget ?? goldTargetOf(sc.multiplier));
    this.waves.begin();
    this.hud.setWave(1, ''); this.hud.setStats(this.round.bet, 0, 0, true);
    this.hud.refreshSlots();
    this.hud.show();
    this.input.enabled = true;
    this.hud.banner('Survive');
    this.focus.copy(this.player.pos);
    this.updateCamera(0, true);
  }

  clearEntities() {
    for (const m of this.monsters) m.dispose(this.scene);
    this.monsters.length = 0;
    this.projectiles.clear();
    this.pickups.clear();
    this.gold.reset(0);
    this.world.forest.reset();
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
    $('result-gold').textContent = this.gold.tally.toLocaleString('en-US');
    $('result-mult').textContent = `${res.multiplier}×`;
    $('result-payout').textContent = res.payout.toFixed(2);
    $('result-kills').textContent = String(this.kills);
    $('result-title').textContent = res.multiplier >= 5 ? 'A legend of the temple' : res.multiplier >= 1 ? 'The guardian falls, rich in gold' : 'The guardian falls';
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
      if (typeof a === 'object') {
        if (a.type === 'attack') { this.player.attack(this.ctx, a.dir, a.vec); this.hideSwipeHint(); }
        else if (a.type === 'gesture') this.player.technique(this.ctx, a.g, a.ago, a.rot);
        continue;
      }
      if (a === 'attack') this.player.attack(this.ctx);
      else if (a === 'release') this.player.release(this.ctx);
      else if (a === 'use') this.player.attack(this.ctx);   // Triangle / Y: use what's in hand
      else if (a === 'prev') { this.player.cycle(-1); this.hud.refreshSlots(); }
      else if (a === 'next') { this.player.cycle(1); this.hud.refreshSlots(); }
      else if (a === 'equip') this.pickups.equipNear();
      else if (a.startsWith('slot')) { if (this.player.select(Number(a[4]))) this.hud.refreshSlots(); }
    }
  }

  frame() {
    const now = performance.now(); const dt = Math.min(0.05, (now - this.lastT) / 1000); this.lastT = now;
    this.input.pollPad();
    this.handlePadMenus();
    if (this.state === 'paused') {
      // the world holds still behind the pause menu
      if (!this.headless) this.renderer.render(this.scene, this.camera);
      return;
    }
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
      // which monsters are in view and how far away (out of sight they close in faster)
      this.updateView();
      const pp = this.player.pos;
      for (const m of this.monsters) {
        m.onScreen = this.inView(m.pos.x, m.pos.y + 1, m.pos.z, 3.5 * (m.rig?.root?.scale?.x ?? 1));
        m.far = Math.hypot(m.pos.x - pp.x, m.pos.z - pp.z) > 70;
      }
      this.waves.update(dt);
      for (let i = this.monsters.length - 1; i >= 0; i--) {
        const m = this.monsters[i];
        m.update(dt, ctx);
        if (!m.alive && m.removed && (m.left || !['zombie', 'werewolf', 'demon'].includes(m.type))) this.monsters.splice(i, 1);
      }
      this.projectiles.update(dt, ctx);
      this.world.forest.update(dt, ctx);
      this.pickups.update(dt);
      this.gold.update(dt);
      this.effects.update(dt);
      this.hud.update(dt);
      this.updateDrawMeter();
      this.updateFlow();
      this.updateTechniqueBanner(dt);
      this.win = this.round.bet * this.gold.tally / GOLD_PER_STAKE;
      this.hud.setStats(this.round.bet, this.gold.tally, this.kills);
      this.focus.copy(this.player.pos);
    } else {
      // menu / result: slow orbit around the samurai at the temple
      this.effects.update(dt);
      const t = performance.now() * 0.00008;
      this.focus.copy(this.player.pos);
      if (this.player.anim) { this.player.anim.speed = 0; this.player.anim.attackT = -1; }
      this.player.mesh.position.copy(this.player.pos); this.player.mesh.rotation.y = this.player.facing;
      this.player.update(this.state === 'menu' ? dt : 0.0001, this._idleInput ??= { move: new THREE.Vector2(), aim: null, holding: false }, { effects: this.effects, monsters: [], projectiles: this.projectiles, toast: () => {} });
      this.menuOrbit = t;
    }
    this.updateCamera(dt);
    const zoom = playing ? this.player.zoom : 0;
    this.world.update(dt, this.focus, {
      shadowHalf: [34, 52, 80][zoom],
      grassSpread: playing ? [1, 1.45, 2.1][zoom] : 1.7,
      interactors: this.grassPushers(),
    });
    // spray kicked up by anyone wading quickly through the shallows
    for (const sp of this.world.splashes ?? []) this.effects.burst(_tmp.set(sp.x, sp.y + 0.15, sp.z), { count: 3 + Math.round(sp.speed * 0.4), color: [0xe8f4ff, 0xbfdcf0, 0xffffff], speed: 1.6 + sp.speed * 0.15, life: 0.45, size: 0.55, gravity: 9, up: 1.4, spread: 0.8 });
    if (!this.headless) this.renderer.render(this.scene, this.camera);
  }

  /** Controller navigation outside of play: menu and result screens. */
  handlePadMenus() {
    const P = this.input.padPressed;
    if (!P.size) return;
    if (this.state === 'playing' && P.has(PAD.START)) { this.pause(); return; }
    if (this.state === 'paused') {
      if (P.has(PAD.START) || P.has(PAD.A) || P.has(PAD.B)) this.resume();
      else if (P.has(PAD.Y)) this.toggleSound();
      else if (P.has(PAD.X)) this.toggleHelp();
      return;
    }
    if (this.state === 'menu') {
      if (P.has(PAD.UP)) this.menu.cycleCharacter(-1);
      if (P.has(PAD.DOWN)) this.menu.cycleCharacter(1);
      if (P.has(PAD.LEFT) || P.has(PAD.LB)) this.menu.step(-1);
      if (P.has(PAD.RIGHT) || P.has(PAD.RB)) this.menu.step(1);
      if (P.has(PAD.A) || P.has(PAD.START)) this.startRound(this.menu.selected);
    } else if (this.state === 'result' && (P.has(PAD.A) || P.has(PAD.START))) this.toMenu();
  }

  /** On-screen prompts follow the device in use (keyboard/mouse, touch or which controller). */
  updatePrompts() {
    const I = this.input;
    const ps = I.padBrand === 'ps';
    const b = (psName, xboxName) => (ps ? psName : xboxName);
    const hint = $('controls-hint'), play = $('tap-to-play'), cont = document.querySelector('#result .tap-to-play');
    const line = '<span class="line"></span>';
    if (I.usingPad) {
      hint.textContent = `Left stick move · Right stick flick to strike: ← → cut, ↑ thrust, ↓ cleave · ${b('Square / R2', 'X / RT')} combo (hold to draw) · ${b('L1 / R1', 'LB / RB')} items · ${b('Triangle', 'Y')} use · ${b('Cross', 'A')} equip`;
      play.innerHTML = `${line}Press ${b('Cross', 'A')} to play${line}`;
      cont.innerHTML = `${line}Press ${b('Cross', 'A')} to continue${line}`;
    } else {
      hint.textContent = 'WASD move · Arrows or I J K L strike: ← → cut, ↑ thrust, ↓ cleave · Space / click combo · Q/E items · F equip';
      play.innerHTML = `${line}Click or tap anywhere to play${line}`;
      cont.innerHTML = `${line}Tap anywhere to continue${line}`;
    }
  }

  // ------------------------------------------------------------------ pause
  bindPause() {
    const press = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    $('btn-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (this.state === 'playing') this.pause(); });
    press('pause-resume', () => this.resume());
    press('pause-sound', () => this.toggleSound());
    press('pause-controls', () => this.toggleHelp());
    $('pause').addEventListener('pointerdown', (e) => { if (e.target.id === 'pause') this.resume(); });   // tap outside the card
    window.addEventListener('keydown', (e) => {
      if (e.repeat || (e.code !== 'Escape' && e.code !== 'KeyP')) return;
      if (this.state === 'playing') { e.preventDefault(); this.pause(); } else if (this.state === 'paused') { e.preventDefault(); this.resume(); }
    });
    // leaving the tab or app pauses the round
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false; this.input.actions.length = 0; this.input.keys.clear(); this.input.strikeKeys = []; this.input.attackHeld = false;
    this.player.release?.(this.ctx);
    $('pause-sound').textContent = `Sound: ${this.settings.sound ? 'on' : 'off'}`;
    const pad = this.input.usingPad, ps = this.input.padBrand === 'ps';
    $('pause-note').textContent = pad ? `${ps ? 'Options' : 'Menu'} or ${ps ? 'Cross' : 'A'} to resume · ${ps ? 'Triangle' : 'Y'} sound · ${ps ? 'Square' : 'X'} controls` : this.input.isTouch ? 'Tap outside to resume' : 'Esc or P to resume';
    $('pause').classList.remove('hidden');
    $('pause-resume').focus({ preventScroll: true });
  }

  resume() {
    if (this.state !== 'paused') return;
    $('pause').classList.add('hidden');
    $('pause-help').classList.add('hidden'); $('pause-controls').setAttribute('aria-expanded', 'false');
    this.state = 'playing';
    this.lastT = performance.now();
    this.input.actions.length = 0;
    this.input.enabled = true;
  }

  toggleSound() {
    this.settings.sound = !this.settings.sound;
    localStorage.setItem('vs.settings', JSON.stringify(this.settings));
    const opt = $('opt-sound'); if (opt) opt.checked = this.settings.sound;
    $('pause-sound').textContent = `Sound: ${this.settings.sound ? 'on' : 'off'}`;
  }

  /** The controls for whichever device is in use, and the techniques of this samurai. */
  toggleHelp() {
    const el = $('pause-help'), btn = $('pause-controls');
    const open = el.classList.contains('hidden');
    el.classList.toggle('hidden', !open); btn.setAttribute('aria-expanded', String(open));
    if (!open) return;
    const I = this.input, ps = I.padBrand === 'ps', b = (p, x) => (ps ? p : x);
    const rows = I.usingPad ? [
      ['Move', 'Left stick'], ['Strike', 'Flick the right stick: ← → cut, ↑ thrust, ↓ cleave'], ['Combo', b('Square / R2', 'X / RT') + ' (hold to draw the bow)'],
      ['Technique', 'Roll the right stick in a circle or half circle, or flick twice'], ['Items', `${b('L1 / R1', 'LB / RB')} cycle · ${b('Triangle', 'Y')} use · ${b('Cross', 'A')} equip`],
    ] : I.isTouch ? [
      ['Move', 'Joystick, bottom left'], ['Strike', 'Swipe: ← → cut, ↑ thrust, ↓ cleave'], ['Combo', 'Tap (hold to draw the bow)'],
      ['Technique', 'Draw a circle or half circle, or swipe the same way twice'], ['Items', 'The arrow buttons cycle · the crossed-swords button uses · Equip lights up when standing on one'],
    ] : [
      ['Move', 'W A S D'], ['Strike', 'Arrows or I J K L: ← → cut, ↑ thrust, ↓ cleave'], ['Combo', 'Space or click (hold to draw the bow)'],
      ['Technique', 'Arrows in turn ↑→↓← (three for a half circle), or the same arrow twice'], ['Items', 'Q / E or scroll cycle · 1-5 select · F equip'],
    ];
    const w = this.player?.weaponId;
    const tech = techniquesFor(this.player?.slots?.[0]?.weapon ?? w, WEAPON_RIGS[this.player?.slots?.[0]?.weapon ?? w]);
    el.innerHTML = rows.map(([k, v]) => `<div><b>${k}</b> · ${v}</div>`).join('') +
      (tech.length ? `<div style="margin-top:8px"><b>Techniques</b> · ${tech.map((t) => `${t.name} (${t.how.toLowerCase()})`).join('; ')}</div>` : '');
  }

  /** Flow: varied strikes chained in rhythm light small marks above the samurai. */
  updateFlow() {
    const el = this._flow ??= $('flow');
    const pl = this.player, n = pl.flow ?? 0;
    if (n !== this._flowN) {
      this._flowN = n;
      el.innerHTML = n ? `<span lang="ja">流</span>${'<i></i>'.repeat(n)}` : '';
      el.classList.toggle('show', n > 0);
      el.classList.toggle('high', n >= 3);
    }
    if (!n) return;
    _tmp.copy(pl.pos); _tmp.y += 2.55;
    _tmp.project(this.camera);
    el.style.transform = `translate(${(_tmp.x * 0.5 + 0.5) * innerWidth}px, ${(-_tmp.y * 0.5 + 0.5) * innerHeight}px)`;
  }

  updateTechniqueBanner(dt) {
    if (!(this._tbT > 0)) return;
    this._tbT -= dt;
    const el = this._tb, pl = this.player;
    _tmp.copy(pl.pos); _tmp.y += 2.9 + pl.air;
    _tmp.project(this.camera);
    el.style.transform = `translate(${(_tmp.x * 0.5 + 0.5) * innerWidth}px, ${(-_tmp.y * 0.5 + 0.5) * innerHeight}px)`;
    if (this._tbT <= 0) el.classList.remove('show');
  }

  /** An ink stroke along a swipe, so the gesture visibly turns into the strike. */
  brushStroke(x0, y0, x1, y1) {
    const layer = this._swipeLayer ??= $('swipe-layer');
    const dx = x1 - x0, dy = y1 - y0, len = Math.max(60, Math.hypot(dx, dy) * 2.2);
    const el = document.createElement('i');
    el.className = 'swipe';
    el.style.left = `${x0}px`; el.style.top = `${y0}px`; el.style.width = `${len}px`;
    el.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 420);
  }

  showSwipeHint() { const el = $('swipe-hint'); if (!el) return; el.classList.add('show'); clearTimeout(this._swipeT); this._swipeT = setTimeout(() => el.classList.remove('show'), 9000); }
  hideSwipeHint() { const el = $('swipe-hint'); if (el?.classList.contains('show')) { clearTimeout(this._swipeT); this._swipeT = setTimeout(() => el.classList.remove('show'), 1200); } }

  /** Slim draw-strength bar floating above the archer while the bow is drawn. */
  updateDrawMeter() {
    const el = this._dm ??= $('draw-meter');
    const pl = this.player;
    if (!pl.drawing) { el.style.opacity = '0'; return; }
    _tmp.copy(pl.pos); _tmp.y += 2.35;
    _tmp.project(this.camera);
    el.style.transform = `translate(${(_tmp.x * 0.5 + 0.5) * innerWidth}px, ${(-_tmp.y * 0.5 + 0.5) * innerHeight}px)`;
    el.style.opacity = '1';
    el.firstChild.style.width = `${pl.drawPower * 100}%`;
    el.classList.toggle('full', pl.drawPower >= 1);
  }

  /** The player and the nearest monsters trample the grass as they move through it. */
  grassPushers() {
    const out = this._pushers ??= [];
    out.length = 0;
    const p = this.player;
    if (!p) return out;
    out.push({ id: 'player', x: p.pos.x, z: p.pos.z, r: 0.75, facing: p.facing });
    const near = [];
    for (const m of this.monsters) {
      if (!m.alive || m.type === 'ghost') continue;
      const d = (m.pos.x - p.pos.x) ** 2 + (m.pos.z - p.pos.z) ** 2;
      if (d < 35 * 35) near.push([d, m]);
    }
    near.sort((a, b) => a[0] - b[0]);
    this.world.forest.pushers(out);
    for (let i = 0; i < near.length && out.length < 24; i++) { const m = near[i][1]; out.push({ id: m.id, x: m.pos.x, z: m.pos.z, r: m.radius * 1.3 + 0.25, facing: m.facing }); }
    return out;
  }

  /**
   * What the player can see: the camera as it is now, and where it is settling for the
   * current zoom (so a zoom-out in progress is accounted for before it reveals anything).
   */
  updateView() {
    this._pv.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this._pv);
    const c = this._viewCam ??= new THREE.PerspectiveCamera();
    const z = ZOOM_PRESETS[this.player.zoom], f = this.player.pos;
    if (c.fov !== this.camera.fov || c.aspect !== this.camera.aspect || c.far !== this.camera.far) {
      c.fov = this.camera.fov; c.aspect = this.camera.aspect; c.near = this.camera.near; c.far = this.camera.far; c.updateProjectionMatrix();
    }
    c.position.set(f.x, f.y + z.h, f.z + z.d); c.lookAt(f.x, f.y + 1, f.z - 1); c.updateMatrixWorld(true);
    this._pv2 ??= new THREE.Matrix4(); this.frustum2 ??= new THREE.Frustum();
    this._pv2.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
    this.frustum2.setFromProjectionMatrix(this._pv2);
  }

  /** Is anything within r of (x, y, z) visible, now or once the camera settles? */
  inView(x, y, z, r = 2) {
    const S = this._sph ??= new THREE.Sphere();
    S.center.set(x, y, z); S.radius = r;
    return this.frustum.intersectsSphere(S) || (this.frustum2?.intersectsSphere(S) ?? false);
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
