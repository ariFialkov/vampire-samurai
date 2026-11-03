// Corner minimap: a painted map of the countryside (water, hills, paddies, temple, woods)
// centred on the guardian, with every enemy shown — those beyond its range sit on the rim
// pointing toward them, so the last stragglers of a wave are always easy to find.
import { MAP_HALF, MAP_SIZE, PADDY } from '../world/terrain.js';

export const MINIMAP_RANGE = 70;     // metres from the centre to the rim
const BG = 384;                       // background texture resolution

export class Minimap {
  constructor(world, el) {
    this.world = world;
    this.el = el;
    this.ctx = el.getContext('2d');
    this.bg = this.paint();
    this.t = 0;
  }

  /** Paint the whole map once: hill-shaded terrain, water, paddies, temple, trees. */
  paint() {
    const T = this.world.terrain, S = this.world.solids;
    const c = document.createElement('canvas'); c.width = c.height = BG;
    const g = c.getContext('2d');
    const img = g.createImageData(BG, BG);
    const m = MAP_SIZE / BG;
    for (let py = 0; py < BG; py++) {
      for (let px = 0; px < BG; px++) {
        const x = -MAP_HALF + (px + 0.5) * m, z = -MAP_HALF + (py + 0.5) * m;
        const h = T.heightAt(x, z), w = T.waterLevelAt(x, z);
        const dx = T.heightAt(x + 1, z) - T.heightAt(x - 1, z), dz = T.heightAt(x, z + 1) - T.heightAt(x, z - 1);
        const shade = Math.max(0.55, Math.min(1.25, 1 - (dx * 0.35 + dz * 0.25)));
        let r, gg, b;
        const inPaddy = Math.abs(x - PADDY.x) < PADDY.w / 2 && Math.abs(z - PADDY.z) < PADDY.h / 2;
        if (h < w - 0.05 && !inPaddy) { const d = Math.min(1, (w - h) / 2.2); r = 70 - 25 * d; gg = 125 - 30 * d; b = 150 - 10 * d; }
        else if (inPaddy) { r = 110; gg = 150; b = 110; }
        else if (h > 23) { const k = Math.min(1, (h - 23) / 12); r = 95 + 70 * k; gg = 110 + 50 * k; b = 80 + 80 * k; }
        else { const k = Math.min(1, Math.max(0, (h - 2) / 18)); r = 78 + 30 * k; gg = 118 + 18 * k; b = 62 + 10 * k; }
        if (S.topAt(x, z) > h + 0.05) { r = 150; gg = 146; b = 136; }              // temple stone
        const o = (py * BG + px) * 4;
        img.data[o] = Math.min(255, r * shade); img.data[o + 1] = Math.min(255, gg * shade); img.data[o + 2] = Math.min(255, b * shade); img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = 'rgba(28,48,26,0.55)';
    for (const t of this.world.treeSpots) { g.beginPath(); g.arc((t.x + MAP_HALF) / m, (t.z + MAP_HALF) / m, 1.6 * (t.scale ?? 1), 0, 7); g.fill(); }
    return c;
  }

  /** Redraw (throttled to ~15 fps). */
  update(dt, player, monsters, pickups) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1 / 15;
    const cv = this.el, ctx = this.ctx;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = Math.round(cv.clientWidth * dpr);
    if (!size) return;
    if (cv.width !== size) { cv.width = cv.height = size; }
    const R = size / 2, k = R / MINIMAP_RANGE;            // pixels per metre
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.clip();
    // terrain under the player (screen up = -z, matching the camera)
    const m = MAP_SIZE / BG;
    const sx = (player.pos.x - MINIMAP_RANGE + MAP_HALF) / m, sy = (player.pos.z - MINIMAP_RANGE + MAP_HALF) / m, sw = (2 * MINIMAP_RANGE) / m;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(this.bg, sx, sy, sw, sw, 0, 0, size, size);
    ctx.globalAlpha = 1;
    // pickups
    for (const p of pickups) {
      const x = R + (p.pos.x - player.pos.x) * k, y = R + (p.pos.z - player.pos.z) * k;
      if ((x - R) ** 2 + (y - R) ** 2 > (R - 4) ** 2) continue;
      ctx.fillStyle = '#e8c26a';
      ctx.beginPath(); ctx.moveTo(x, y - 3 * dpr); ctx.lineTo(x + 3 * dpr, y); ctx.lineTo(x, y + 3 * dpr); ctx.lineTo(x - 3 * dpr, y); ctx.fill();
    }
    // enemies (beyond range: pinned to the rim as arrows)
    for (const mo of monsters) {
      if (!mo.alive) continue;
      const dx = mo.pos.x - player.pos.x, dz = mo.pos.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      const col = mo.ally ? '#f6e9c8' : mo.type === 'demon' ? '#ff7a2a' : '#e5483a';
      if (d * k < R - 6 * dpr) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(R + dx * k, R + dz * k, (mo.type === 'demon' ? 3.4 : 2.4) * dpr, 0, 7); ctx.fill();
      } else {
        const a = Math.atan2(dz, dx), rr = R - 6 * dpr;
        const x = R + Math.cos(a) * rr, y = R + Math.sin(a) * rr;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(5 * dpr, 0); ctx.lineTo(-3 * dpr, -3.5 * dpr); ctx.lineTo(-3 * dpr, 3.5 * dpr); ctx.fill();
        ctx.restore();
      }
    }
    // the guardian: an arrow pointing the way they face
    ctx.save(); ctx.translate(R, R); ctx.rotate(Math.PI - player.facing);
    ctx.fillStyle = '#f6e9c8'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.moveTo(0, -6 * dpr); ctx.lineTo(4.5 * dpr, 5 * dpr); ctx.lineTo(0, 2.5 * dpr); ctx.lineTo(-4.5 * dpr, 5 * dpr); ctx.closePath(); ctx.stroke(); ctx.fill();
    ctx.restore();
    ctx.restore();
    // rim
    ctx.strokeStyle = 'rgba(212,168,75,0.7)'; ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.stroke();
  }
}
