// Solid geometry for collisions. Every structure registers its real footprint (circle or
// rotated box) and the absolute height of its top. While moving, anything whose top is
// within a step of your feet is ground you can walk onto; anything taller blocks you.
// The same data drives entity feet height, so visuals and collisions can't drift apart.

export const STEP_HEIGHT = 0.5;   // tallest ledge a samurai or monster can step up
const BODY_HEIGHT = 1.7;          // things whose bottom is above head height don't block

export class Solids {
  constructor(cellSize = 6) {
    this.cell = cellSize;
    this.grid = new Map();
    this.list = [];
  }

  /** circle: {x, z, r, top, bottom?}  box: {x, z, hx, hz, rot, top, bottom?} */
  add(s) {
    s.bottom ??= -Infinity;
    if (s.hx !== undefined) {
      s.cos = Math.cos(s.rot ?? 0); s.sin = Math.sin(s.rot ?? 0);
      s.reach = Math.hypot(s.hx, s.hz);
    } else s.reach = s.r;
    this.list.push(s);
    const c = this.cell;
    const x0 = Math.floor((s.x - s.reach) / c), x1 = Math.floor((s.x + s.reach) / c);
    const z0 = Math.floor((s.z - s.reach) / c), z1 = Math.floor((s.z + s.reach) / c);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = ix * 65536 + iz;
      let b = this.grid.get(k);
      if (!b) this.grid.set(k, (b = []));
      b.push(s);
    }
    return s;
  }
  addCircle(x, z, r, top, bottom) { return this.add({ x, z, r, top, bottom }); }
  addBox(x, z, hx, hz, rot, top, bottom) { return this.add({ x, z, hx, hz, rot, top, bottom }); }

  bucket(x, z) { return this.grid.get(Math.floor(x / this.cell) * 65536 + Math.floor(z / this.cell)); }

  /** Is (x,z) inside solid s's footprint (expanded by pad)? */
  contains(s, x, z, pad = 0) {
    const dx = x - s.x, dz = z - s.z;
    if (s.hx === undefined) return dx * dx + dz * dz <= (s.r + pad) * (s.r + pad);
    const lx = dx * s.cos + dz * s.sin, lz = -dx * s.sin + dz * s.cos;
    return Math.abs(lx) <= s.hx + pad && Math.abs(lz) <= s.hz + pad;
  }

  /** Highest walkable top at (x,z) reachable from feet height `y`, or -Infinity. */
  topAt(x, z, y = Infinity) {
    const b = this.bucket(x, z);
    let best = -Infinity;
    if (!b) return best;
    for (const s of b) {
      if (s.top > best && s.top <= y + STEP_HEIGHT && this.contains(s, x, z)) best = s.top;
    }
    return best;
  }

  /**
   * Push a circle (x, z, r) out of every solid that is too tall to step onto from feet height y.
   * Returns the corrected {x, z}.
   */
  pushOut(x, z, r, y) {
    for (let iter = 0; iter < 2; iter++) {
      const b = this.bucket(x, z);
      if (!b) break;
      let moved = false;
      for (const s of b) {
        if (s.top <= y + STEP_HEIGHT || s.bottom > y + BODY_HEIGHT) continue;
        const dx = x - s.x, dz = z - s.z;
        if (s.hx === undefined) {
          const min = s.r + r, d2 = dx * dx + dz * dz;
          if (d2 < min * min) {
            const d = Math.sqrt(d2) || 1e-4;
            x = s.x + (dx / d) * min; z = s.z + (dz / d) * min; moved = true;
          }
        } else {
          // rotated box: closest point in box space
          const lx = dx * s.cos + dz * s.sin, lz = -dx * s.sin + dz * s.cos;
          const cx = Math.max(-s.hx, Math.min(s.hx, lx)), cz = Math.max(-s.hz, Math.min(s.hz, lz));
          let ox = lx - cx, oz = lz - cz;
          const d2 = ox * ox + oz * oz;
          if (d2 >= r * r) continue;
          let nx, nz;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            nx = cx + (ox / d) * r; nz = cz + (oz / d) * r;
          } else {
            // centre is inside the box: leave through the nearest face
            const px = s.hx - Math.abs(lx), pz = s.hz - Math.abs(lz);
            if (px < pz) { nx = Math.sign(lx || 1) * (s.hx + r); nz = lz; } else { nx = lx; nz = Math.sign(lz || 1) * (s.hz + r); }
          }
          x = s.x + nx * s.cos - nz * s.sin; z = s.z + nx * s.sin + nz * s.cos; moved = true;
        }
      }
      if (!moved) break;
    }
    return { x, z };
  }
}
