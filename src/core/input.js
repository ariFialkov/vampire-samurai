// Unified input: keyboard + mouse on desktop, static joystick + swipes on touch, and game
// controllers (PS5 DualSense, Xbox and other "standard" layout pads) via the Gamepad API.
// Produces a normalised move vector and edge-triggered actions. The samurai faces the way
// they move. Strikes come in two forms:
//   'attack'                         the plain attack (chains the weapon's combo)
//   { type: 'attack', dir, vec }     a specific strike: dir 'up' thrust, 'down' cleave,
//                                    'left' / 'right' a cut sweeping that way across the screen
//   { type: 'gesture', g, rot, ago } a special-technique gesture: g 'circle' | 'half' |
//                                    'double:<dir>', rot +1 clockwise / -1 anticlockwise on
//                                    screen, ago = seconds since the gesture began
// Directional strikes are the arrow keys or I J K L, a swipe on touch, a flick of the right
// stick on a controller. Holding one (key or stick) also aims and draws the bow.
import * as THREE from 'three';
import { Rotation, KeyRing, Doubles } from './gestures.js';

// W3C "standard" gamepad button indices (same positions on PlayStation and Xbox pads)
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const ATTACK_BUTTONS = [PAD.X, PAD.RT];          // Square / X, or R2 / RT
const DEADZONE = 0.2;
const FLICK = 0.62, REARM = 0.3;                  // right stick: a strike fires past FLICK, re-arms under REARM
const SWIPE = 26;                                 // touch: pixels before a drag counts as a swipe
const STRIKE_KEYS = { ArrowUp: 'up', KeyI: 'up', ArrowDown: 'down', KeyK: 'down', ArrowLeft: 'left', KeyJ: 'left', ArrowRight: 'right', KeyL: 'right' };
const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
/** Dominant direction of a screen-space vector (y down). */
export function dirOf(x, y) { return Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down'); }

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = new THREE.Vector2();
    this.attackHeld = false;
    this.actions = [];                      // queued edge actions: 'attack','equip','prev','next','zoom'
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    // Switch to touch mode the first time a finger touches the screen
    window.addEventListener('touchstart', () => { if (!this.isTouch) { this.isTouch = true; document.body.classList.add('touch'); } }, { passive: true, once: true });
    this.joy = { active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0 };
    this.enabled = false;
    this.wheelAccum = 0;
    // controller state
    this.pad = null; this.padPrev = []; this.padPressed = new Set(); this.padHeld = false;
    this.padStick = new THREE.Vector2(); this.padBrand = null; this.usingPad = false;
    this.rStick = new THREE.Vector2(); this.rArmed = true; this.rHeld = false;
    this.strikeKeys = [];                   // directional keys held, most recent last
    this.aim = null;                        // held strike direction (Vector2) for aiming the bow
    this.onSwipe = null;                    // (x0, y0, x1, y1) for the on-screen brush stroke
    this.gStick = new Rotation(); this.gKeys = new KeyRing(); this.gDbl = new Doubles();
    window.addEventListener('gamepadconnected', (e) => this.onPadConnect?.(this.brandOf(e.gamepad)));
    window.addEventListener('gamepaddisconnected', () => { this.usingPad = false; document.body.classList.remove('pad'); this.onPadDisconnect?.(); });
    // any keyboard / mouse / touch input switches the prompts back from the controller
    const notPad = () => { if (this.usingPad) { this.usingPad = false; document.body.classList.remove('pad'); this.onPadChange?.(); } };
    window.addEventListener('keydown', notPad); window.addEventListener('mousedown', notPad); window.addEventListener('touchstart', notPad, { passive: true });
    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (e.code === 'Space') { this.actions.push('attack'); this.attackHeld = true; e.preventDefault(); }
      const sd = STRIKE_KEYS[e.code];
      if (sd) {
        e.preventDefault();
        this.strikeKeys = this.strikeKeys.filter((k) => k !== sd).concat(sd);
        this.actions.push({ type: 'attack', dir: sd, vec: { x: DIR_VEC[sd][0], y: DIR_VEC[sd][1] } });
        const now = performance.now() / 1000;
        this.gesture(this.gDbl.strike(sd, now));
        this.gesture(this.gKeys.press(sd, now));
      }
      if (e.code === 'KeyQ') this.actions.push('prev');
      if (e.code === 'KeyE') this.actions.push('next');
      if (e.code === 'KeyM') this.actions.push('equip');
      if (e.code === 'KeyF') this.actions.push('equip');
      if (e.code === 'Digit1') this.actions.push('slot0');
      if (e.code === 'Digit2') this.actions.push('slot1');
      if (e.code === 'Digit3') this.actions.push('slot2');
      if (e.code === 'Digit4') this.actions.push('slot3');
      if (e.code === 'Digit5') this.actions.push('slot4');
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') { this.attackHeld = false; if (this.enabled) this.actions.push('release'); }
      const sd = STRIKE_KEYS[e.code];
      if (sd && !Object.entries(STRIKE_KEYS).some(([k, d]) => d === sd && k !== e.code && this.keys.has(k))) {
        this.strikeKeys = this.strikeKeys.filter((k) => k !== sd);
        if (this.enabled && !this.strikeKeys.length) this.actions.push('release');
      }
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.strikeKeys = []; });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.isTouch) return;
      if (e.button === 0) { this.attackHeld = true; this.actions.push('attack'); }
      if (e.button === 2) this.actions.push('equip');
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0 && this.attackHeld) { this.attackHeld = false; if (this.enabled) this.actions.push('release'); } });
    window.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.wheelAccum += e.deltaY;
      if (this.wheelAccum > 40) { this.actions.push('next'); this.wheelAccum = 0; }
      if (this.wheelAccum < -40) { this.actions.push('prev'); this.wheelAccum = 0; }
    }, { passive: true });

    // Touch: a static joystick (bottom-left element) and tap-to-attack elsewhere on the canvas
    const joyEl = document.getElementById('joystick');
    const knob = document.getElementById('joystick-knob');
    const RADIUS = 48;
    const joyStart = (e) => {
      const t = e.changedTouches[0];
      const r = joyEl.getBoundingClientRect();
      this.joy.active = true; this.joy.id = t.identifier;
      this.joy.cx = r.left + r.width / 2; this.joy.cy = r.top + r.height / 2;
      joyMove(e);
      e.preventDefault();
    };
    const joyMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.joy.id) continue;
        let dx = t.clientX - this.joy.cx, dy = t.clientY - this.joy.cy;
        const d = Math.hypot(dx, dy);
        if (d > RADIUS) { dx = dx / d * RADIUS; dy = dy / d * RADIUS; }
        this.joy.dx = dx / RADIUS; this.joy.dy = dy / RADIUS;
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
      }
      e.preventDefault();
    };
    const joyEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.joy.id) continue;
        this.joy.active = false; this.joy.dx = 0; this.joy.dy = 0; this.joy.id = -1;
        knob.style.transform = '';
      }
    };
    joyEl.addEventListener('touchstart', joyStart, { passive: false });
    joyEl.addEventListener('touchmove', joyMove, { passive: false });
    joyEl.addEventListener('touchend', joyEnd);
    joyEl.addEventListener('touchcancel', joyEnd);
    // Touch on the open screen: swipe to strike in that direction, tap for the plain attack,
    // press and hold to draw the bow (or keep a plain attack going for other weapons)
    this.swipes = new Map();
    this.canvas.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const sw = { x: t.clientX, y: t.clientY, t: performance.now(), done: false, held: false, lx: t.clientX, ly: t.clientY, rot: new Rotation() };
        sw.timer = setTimeout(() => { if (!sw.done) { sw.held = true; sw.done = true; this.attackHeld = true; this.actions.push('attack'); } }, 220);
        this.swipes.set(t.identifier, sw);
      }
    }, { passive: true });
    this.canvas.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        const sw = this.swipes.get(t.identifier);
        if (!sw || sw.held) continue;
        // the path's heading, for circles drawn with the finger
        const mx = t.clientX - sw.lx, my = t.clientY - sw.ly;
        if (Math.hypot(mx, my) > 9) { this.gesture(sw.rot.add(Math.atan2(my, mx), performance.now() / 1000)); sw.lx = t.clientX; sw.ly = t.clientY; }
        if (sw.done) continue;
        const dx = t.clientX - sw.x, dy = t.clientY - sw.y, d = Math.hypot(dx, dy);
        if (d < SWIPE) continue;
        sw.done = true; clearTimeout(sw.timer);
        const dir = dirOf(dx, dy);
        this.actions.push({ type: 'attack', dir, vec: { x: dx / d, y: dy / d } });
        this.gesture(this.gDbl.strike(dir, performance.now() / 1000));
        this.onSwipe?.(sw.x, sw.y, t.clientX, t.clientY);
      }
    }, { passive: true });
    const touchEnd = (e) => {
      for (const t of e.changedTouches) {
        const sw = this.swipes.get(t.identifier);
        if (!sw) continue;
        this.swipes.delete(t.identifier); clearTimeout(sw.timer);
        if (!this.enabled) continue;
        if (sw.done) this.gesture(sw.rot.end());
        if (!sw.done) this.actions.push('attack');                         // a tap
        else if (sw.held) { this.attackHeld = false; this.actions.push('release'); }
      }
    };
    this.canvas.addEventListener('touchend', touchEnd, { passive: true });
    this.canvas.addEventListener('touchcancel', touchEnd, { passive: true });
    const btn = (id, action, hold) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); this.actions.push(action); if (hold) this.attackHeld = true; }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); if (hold) { this.attackHeld = false; this.actions.push('release'); } }, { passive: false });
      el.addEventListener('mousedown', (e) => { e.preventDefault(); this.actions.push(action); if (hold) this.attackHeld = true; });
      el.addEventListener('mouseup', () => { if (hold) { this.attackHeld = false; this.actions.push('release'); } });
    };
    btn('btn-attack', 'attack', true);
    btn('btn-equip', 'equip');
    btn('btn-prev', 'prev');
    btn('btn-next', 'next');
  }

  /** Queue a recognised gesture (see src/core/gestures.js). */
  gesture(r) {
    if (!r || !this.enabled) return;
    this.actions.push({ type: 'gesture', g: r.g, rot: r.rot, ago: Math.max(0, performance.now() / 1000 - r.t0) });
  }

  /** Attack is being held on any device (keys, mouse, touch or controller). */
  get holding() { return this.attackHeld || this.padHeld || this.rHeld || this.strikeKeys.length > 0; }

  brandOf(gp) {
    const id = (gp?.id ?? '').toLowerCase();
    if (/054c|dualsense|dualshock|playstation|sony|wireless controller/.test(id)) return 'ps';
    if (/045e|xbox|xinput|microsoft/.test(id)) return 'xbox';
    return 'generic';
  }

  /**
   * Read the controller once per frame (call every frame, menus included). Buttons pressed
   * this frame land in padPressed; during play they are also turned into game actions.
   */
  pollPad() {
    this.padPressed.clear();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected && (!gp || p.timestamp > gp.timestamp)) gp = p;   // the pad used most recently
    this.pad = gp;
    if (!gp) { this.padHeld = false; this.padStick.set(0, 0); this.padPrev = []; return; }
    const down = gp.buttons.map((b) => b.pressed || b.value > 0.5);
    const released = new Set();
    for (let i = 0; i < down.length; i++) {
      if (down[i] && !this.padPrev[i]) this.padPressed.add(i);
      if (!down[i] && this.padPrev[i]) released.add(i);
    }
    this.padPrev = down;
    // left stick with a radial dead zone, rescaled so movement starts smoothly at its edge
    let sx = gp.axes[0] ?? 0, sy = gp.axes[1] ?? 0;
    const m = Math.hypot(sx, sy);
    if (m < DEADZONE) { sx = 0; sy = 0; } else { const k = Math.min(1, (m - DEADZONE) / (1 - DEADZONE)) / m; sx *= k; sy *= k; }
    if (down[PAD.UP]) sy -= 1; if (down[PAD.DOWN]) sy += 1;
    this.padStick.set(sx, sy);
    if (this.padPressed.size || m > DEADZONE) {
      const brand = this.brandOf(gp);
      const changed = !this.usingPad || brand !== this.padBrand;
      this.padBrand = brand;
      if (!this.usingPad) { this.usingPad = true; document.body.classList.add('pad'); }
      if (changed) this.onPadChange?.();     // prompts switch to this controller's button names
    }
    const wasHeld = this.padHeld;
    this.padHeld = ATTACK_BUTTONS.some((i) => down[i]);
    // right stick: flick it to strike that way; holding it aims (the bow draws while it's held)
    const rx = gp.axes[2] ?? 0, ry = gp.axes[3] ?? 0, rm = Math.hypot(rx, ry);
    this.rStick.set(rx, ry);
    const rStrike = this.rArmed && rm > FLICK;
    if (rStrike) this.rArmed = false;
    if (rm < REARM) this.rArmed = true;
    const wasR = this.rHeld;
    this.rHeld = rm > REARM;
    if (rm > DEADZONE && !this.usingPad) { this.usingPad = true; document.body.classList.add('pad'); this.onPadChange?.(); }
    if (!this.enabled) return;
    const now = performance.now() / 1000;
    if (rStrike) { const d = dirOf(rx, ry); this.actions.push({ type: 'attack', dir: d, vec: { x: rx / rm, y: ry / rm } }); this.gesture(this.gDbl.strike(d, now)); }
    // rolling the stick round its rim
    if (rm > 0.55) this.gesture(this.gStick.add(Math.atan2(ry, rx), now));
    else if (rm < REARM && this.gStick.prev !== null) this.gesture(this.gStick.end());
    if (wasR && !this.rHeld) this.actions.push('release');
    const P = this.padPressed;
    if (ATTACK_BUTTONS.some((i) => P.has(i))) this.actions.push('attack');
    if (wasHeld && !this.padHeld && ATTACK_BUTTONS.some((i) => released.has(i))) this.actions.push('release');
    if (P.has(PAD.Y)) this.actions.push('use');
    if (P.has(PAD.A)) this.actions.push('equip');
    if (P.has(PAD.LB) || P.has(PAD.LEFT)) this.actions.push('prev');
    if (P.has(PAD.RB) || P.has(PAD.RIGHT)) this.actions.push('next');
  }

  /** Short controller rumble (ignored where unsupported). */
  rumble(strength = 0.5, ms = 120) {
    const a = this.pad?.vibrationActuator;
    if (!a || !this.usingPad) return;
    try { a.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: strength, weakMagnitude: Math.min(1, strength * 1.3) })?.catch?.(() => {}); } catch { /* unsupported */ }
  }

  /** Called once per frame; returns the move vector in world XZ (x right, z down-screen). */
  update() {
    this.gesture(this.gKeys.poll(performance.now() / 1000));
    let x = 0, z = 0;
    if (this.keys.has('KeyW')) z -= 1;
    if (this.keys.has('KeyS')) z += 1;
    if (this.keys.has('KeyA')) x -= 1;
    if (this.keys.has('KeyD')) x += 1;
    // aim: the right stick while held, else the held strike key
    if (this.rHeld) this.aim = (this._aim ??= new THREE.Vector2()).copy(this.rStick).normalize();
    else if (this.strikeKeys.length) { const v = DIR_VEC[this.strikeKeys[this.strikeKeys.length - 1]]; this.aim = (this._aim ??= new THREE.Vector2()).set(v[0], v[1]); }
    else this.aim = null;
    if (this.joy.active) { x += this.joy.dx; z += this.joy.dy; }
    x += this.padStick.x; z += this.padStick.y;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    this.move.set(x, z);
    return this.move;
  }

  drain() { const a = this.actions; this.actions = []; return a; }
}
