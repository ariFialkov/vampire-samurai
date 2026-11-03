// Deterministic PRNG utilities shared by the server (outcome engine) and the client
// (simulation). Everything the round does that affects the result is derived from a
// seed string, so the same seed always produces the same round.

/** 32-bit string hash (cyrb53-lite). */
export function hashString(str) {
  let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) * 4294967296 + (h1 >>> 0);
}

/** sfc32 generator. Returns a function producing floats in [0, 1). */
export function sfc32(a, b, c, d) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** A small RNG object with helpers, seeded from any string. */
export class Rng {
  constructor(seed) {
    const h = hashString(String(seed));
    const lo = h % 4294967296, hi = Math.floor(h / 4294967296);
    this.next = sfc32(lo ^ 0x9e3779b9, hi ^ 0x85ebca6b, (lo * 31) ^ 0xc2b2ae35, (hi * 17) ^ 0x27d4eb2f);
    for (let i = 0; i < 12; i++) this.next();
  }
  float(min = 0, max = 1) { return min + (max - min) * this.next(); }
  int(min, max) { return Math.floor(this.float(min, max + 1)); }
  chance(p) { return this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  /** Pick a key from a {key: weight} map. */
  weighted(map) {
    let total = 0;
    for (const k in map) total += map[k];
    let r = this.next() * total;
    for (const k in map) { r -= map[k]; if (r <= 0) return k; }
    return Object.keys(map)[0];
  }
  gaussian(mean = 0, sd = 1) {
    const u = 1 - this.next(), v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  fork(label) { return new Rng(`${label}:${this.next()}`); }
}
