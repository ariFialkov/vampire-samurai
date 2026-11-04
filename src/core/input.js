// Unified input: keyboard + mouse on desktop, static joystick + buttons on touch, and
// game controllers (PS5 DualSense, Xbox and other "standard" layout pads) via the Gamepad API.
// Produces a normalised move vector and edge-triggered actions. The samurai always faces
// the direction they move, so there is no separate aiming.
import * as THREE from 'three';

// W3C "standard" gamepad button indices (same positions on PlayStation and Xbox pads)
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, SELECT: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const ATTACK_BUTTONS = [PAD.X, PAD.RT];          // Square / X, or R2 / RT
const DEADZONE = 0.2;

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
    });
    window.addEventListener('blur', () => this.keys.clear());
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
    this.canvas.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (let i = 0; i < e.changedTouches.length; i++) this.actions.push('attack');
      this.attackHeld = true;
    }, { passive: true });
    this.canvas.addEventListener('touchend', () => { if (this.enabled && this.attackHeld) { this.attackHeld = false; this.actions.push('release'); } }, { passive: true });
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

  /** Attack is being held on any device (keys, mouse, touch or controller). */
  get holding() { return this.attackHeld || this.padHeld; }

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
    if (!this.enabled) return;
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
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.joy.active) { x += this.joy.dx; z += this.joy.dy; }
    x += this.padStick.x; z += this.padStick.y;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    this.move.set(x, z);
    return this.move;
  }

  drain() { const a = this.actions; this.actions = []; return a; }
}
