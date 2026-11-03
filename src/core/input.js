// Unified input: keyboard + mouse on desktop, static joystick + buttons on touch.
// Produces a normalised move vector, aim direction (world XZ) and edge-triggered actions.
import * as THREE from 'three';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = new THREE.Vector2();
    this.pointer = new THREE.Vector2();    // NDC -1..1
    this.pointerDown = false;
    this.attackHeld = false;
    this.actions = [];                      // queued edge actions: 'attack','equip','prev','next','zoom'
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    // Switch to touch mode the first time a finger touches the screen
    window.addEventListener('touchstart', () => { if (!this.isTouch) { this.isTouch = true; document.body.classList.add('touch'); } }, { passive: true, once: true });
    this.joy = { active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0 };
    this.enabled = false;
    this.wheelAccum = 0;
    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (!this.enabled) return;
      if (e.code === 'Space') { this.actions.push('attack'); e.preventDefault(); }
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
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.isTouch) return;
      if (e.button === 0) { this.attackHeld = true; this.actions.push('attack'); }
      if (e.button === 2) this.actions.push('equip');
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.attackHeld = false; });
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
      for (const t of e.changedTouches) {
        this.pointer.set((t.clientX / innerWidth) * 2 - 1, -(t.clientY / innerHeight) * 2 + 1);
        this.actions.push('attack');
      }
    }, { passive: true });
    const btn = (id, action, hold) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => { e.preventDefault(); this.actions.push(action); if (hold) this.attackHeld = true; }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); if (hold) this.attackHeld = false; }, { passive: false });
      el.addEventListener('mousedown', (e) => { e.preventDefault(); this.actions.push(action); if (hold) this.attackHeld = true; });
      el.addEventListener('mouseup', () => { if (hold) this.attackHeld = false; });
    };
    btn('btn-attack', 'attack', true);
    btn('btn-equip', 'equip');
    btn('btn-prev', 'prev');
    btn('btn-next', 'next');
  }

  /** Called once per frame; returns the move vector in world XZ (x right, z down-screen). */
  update() {
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.joy.active) { x += this.joy.dx; z += this.joy.dy; }
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    this.move.set(x, z);
    return this.move;
  }

  drain() { const a = this.actions; this.actions = []; return a; }
}
