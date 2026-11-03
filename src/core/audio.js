// Tiny procedural sound set (no asset downloads): swings, hits, pickups, wave chimes.
export class Sfx {
  constructor() { this.ctx = null; this.enabled = true; }
  ensure() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.enabled = false; } } if (this.ctx?.state === 'suspended') this.ctx.resume(); }
  play(kind) {
    if (!this.enabled) return; this.ensure(); const c = this.ctx; if (!c) return;
    const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination);
    const env = (peak, dur) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.start(t); o.stop(t + dur + 0.05); };
    switch (kind) {
      case 'swing': o.type = 'triangle'; o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.12); env(0.08, 0.14); break;
      case 'hit': o.type = 'square'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.1); env(0.12, 0.12); break;
      case 'bow': o.type = 'sine'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(300, t + 0.08); env(0.07, 0.1); break;
      case 'pickup': o.type = 'sine'; o.frequency.setValueAtTime(660, t); o.frequency.setValueAtTime(990, t + 0.07); env(0.09, 0.25); break;
      case 'hurt': o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.25); env(0.1, 0.3); break;
      case 'wave': o.type = 'sine'; o.frequency.setValueAtTime(440, t); o.frequency.setValueAtTime(554, t + 0.18); o.frequency.setValueAtTime(659, t + 0.36); env(0.08, 0.9); break;
      case 'clear': o.type = 'sine'; o.frequency.setValueAtTime(523, t); o.frequency.setValueAtTime(784, t + 0.15); env(0.08, 0.7); break;
      case 'death': o.type = 'sawtooth'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(40, t + 1.2); env(0.1, 1.3); break;
    }
  }
}
