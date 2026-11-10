// Gesture recognition for special techniques, shared by every device.
//   Rotation  follows a direction that keeps turning (the right stick rolled around its rim,
//             or the path of a swipe) and reports a full circle as soon as it closes, or a
//             half circle when the gesture ends having turned at least half way.
//   KeyRing   reads arrow-key presses as directions on a dial: four in turn (↑→↓←, from any
//             start, either way) is a circle, three is a half circle.
//   Doubles   the same strike direction twice in quick succession.
// Angles are in screen space (x right, y down), so a positive turn is clockwise on screen.

const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class Rotation {
  constructor({ full = TAU * 0.84, half = Math.PI * 0.82, window = 0.85 } = {}) {
    this.full = full; this.half = half; this.window = window;
    this.reset();
  }
  reset() { this.samples = []; this.cum = 0; this.prev = null; this.start = null; this.fired = false; }
  /** A direction sample (radians) at time t (seconds). Returns { g: 'circle', rot } when a turn closes. */
  add(a, t) {
    if (this.prev === null) { this.prev = a; this.start = t; this.samples.push({ t, c: 0 }); return null; }
    const d = wrap(a - this.prev);
    this.prev = a;
    if (Math.abs(d) > 1.9) { this.samples = [{ t, c: this.cum }]; return null; }   // snapped through the middle: not a roll
    this.cum += d;
    this.samples.push({ t, c: this.cum });
    while (this.samples.length && t - this.samples[0].t > this.window) this.samples.shift();
    for (const s of this.samples) {
      const turn = this.cum - s.c;
      if (Math.abs(turn) >= this.full) {
        this.samples = [{ t, c: this.cum }];       // keep rolling for another one
        this.fired = true;
        return { g: 'circle', rot: Math.sign(turn), t0: this.start };
      }
    }
    return null;
  }
  /** The gesture ended (stick back to centre, finger lifted). Returns a half circle or null. */
  end() {
    let best = 0;
    for (const s of this.samples) if (Math.abs(this.cum - s.c) > Math.abs(best)) best = this.cum - s.c;
    const fired = this.fired, t0 = this.start;
    this.reset();
    return !fired && Math.abs(best) >= this.half ? { g: 'half', rot: Math.sign(best), t0 } : null;
  }
}

const DIAL = { up: 0, right: 1, down: 2, left: 3 };

export class KeyRing {
  constructor({ window = 0.9, settle = 0.17 } = {}) { this.window = window; this.settle = settle; this.presses = []; this.pending = null; }
  /** A directional key went down. Returns { g: 'circle', rot } on the fourth press in turn. */
  press(dir, t) {
    this.presses = this.presses.filter((p) => t - p.t <= this.window);
    this.presses.push({ i: DIAL[dir], t });
    this.pending = null;
    // how many presses in a row step the same way round the dial
    let run = 1, rot = 0;
    for (let k = this.presses.length - 1; k > 0; k--) {
      const step = (this.presses[k].i - this.presses[k - 1].i + 4) % 4;
      const s = step === 1 ? 1 : step === 3 ? -1 : 0;
      if (!s || (rot && s !== rot)) break;
      rot = s; run++;
    }
    const t0 = this.presses[this.presses.length - run].t;
    if (run >= 4) { this.presses = []; return { g: 'circle', rot, t0 }; }
    if (run === 3) this.pending = { t, rot, t0 };    // a half circle, unless a fourth press follows
    return null;
  }
  /** Call every frame: a half circle is reported once no fourth press has come. */
  poll(t) {
    if (this.pending && t - this.pending.t >= this.settle) { const { rot, t0 } = this.pending; this.pending = null; this.presses = []; return { g: 'half', rot, t0 }; }
    return null;
  }
}

export class Doubles {
  constructor(window = 0.32) { this.window = window; this.last = null; }
  /** A strike in direction `dir` at time t. Returns { g: 'double:<dir>' } on the second quick one. */
  strike(dir, t) {
    const l = this.last;
    if (l && l.dir === dir && t - l.t <= this.window) { this.last = null; return { g: `double:${dir}`, rot: 0, t0: l.t }; }
    this.last = { dir, t };
    return null;
  }
}
