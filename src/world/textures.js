// Procedural canvas textures (no downloads): stone, paving, bark, weathered wood, roof tiles
// and the foliage atlas (leaf sprigs, maple leaves, cherry blossoms, pine needles).
import * as THREE from 'three';

let seed = 99173;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const cache = new Map();

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function finish(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function speckle(g, w, h, n, colors, rMax = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    g.globalAlpha = 0.08 + rnd() * 0.25;
    g.beginPath(); g.arc(rnd() * w, rnd() * h, 0.4 + rnd() * rMax, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}
function blotches(g, w, h, n, color, rMin, rMax, alpha) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * h, r = rMin + rnd() * (rMax - rMin);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, color); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = alpha * (0.5 + rnd() * 0.5); g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    // wrap for seamless tiling
    for (const [ox, oy] of [[w, 0], [-w, 0], [0, h], [0, -h]]) { g.save(); g.translate(ox, oy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
  }
  g.globalAlpha = 1;
}
function cracks(g, w, h, n, color) {
  g.strokeStyle = color; g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = rnd() * w, y = rnd() * h, a = rnd() * 6.28;
    g.lineWidth = 0.6 + rnd() * 1.2; g.globalAlpha = 0.35 + rnd() * 0.3;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 8; k++) { a += (rnd() - 0.5) * 1.2; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); }
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** Weathered granite. */
export function stoneTexture(mossy = false) {
  const key = 'stone' + mossy;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#9a968c'; g.fillRect(0, 0, 256, 256);
  blotches(g, 256, 256, 30, '#7d7a72', 20, 60, 0.5);
  blotches(g, 256, 256, 20, '#b2ada2', 15, 45, 0.4);
  speckle(g, 256, 256, 2600, ['#5e5b55', '#c9c4b8', '#807b72', '#3f3d39']);
  cracks(g, 256, 256, 6, '#4a4741');
  if (mossy) { blotches(g, 256, 256, 26, '#4f7a34', 10, 40, 0.75); speckle(g, 256, 256, 900, ['#5d8a3c', '#3e6a2a'], 2.5); }
  const t = finish(c); cache.set(key, t); return t;
}

/** Irregular flagstone paving with mossy grout, for the temple floor. */
export function pavingTexture() {
  if (cache.has('paving')) return cache.get('paving');
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#4c5a36'; g.fillRect(0, 0, S, S);  // mossy grout
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const y0 = (r / rows) * S, hgt = S / rows;
    let x = -rnd() * 60;
    while (x < S) {
      const wdt = 55 + rnd() * 70;
      const shade = 130 + Math.floor(rnd() * 40);
      g.fillStyle = `rgb(${shade},${shade - 4},${shade - 12})`;
      const pad = 3 + rnd() * 2;
      const rr = 6;
      const bx = x + pad, by = y0 + pad, bw = wdt - pad * 2, bh = hgt - pad * 2;
      for (const ox of [0, S, -S]) {
        g.beginPath();
        g.moveTo(bx + ox + rr, by); g.lineTo(bx + ox + bw - rr, by); g.quadraticCurveTo(bx + ox + bw, by, bx + ox + bw, by + rr);
        g.lineTo(bx + ox + bw, by + bh - rr); g.quadraticCurveTo(bx + ox + bw, by + bh, bx + ox + bw - rr, by + bh);
        g.lineTo(bx + ox + rr, by + bh); g.quadraticCurveTo(bx + ox, by + bh, bx + ox, by + bh - rr);
        g.lineTo(bx + ox, by + rr); g.quadraticCurveTo(bx + ox, by, bx + ox + rr, by); g.fill();
      }
      x += wdt;
    }
  }
  speckle(g, S, S, 6000, ['#5e5b55', '#c9c4b8', '#807b72', '#3f3d39']);
  cracks(g, S, S, 14, '#3f3d39');
  blotches(g, S, S, 22, '#5a7d3c', 12, 40, 0.45);
  const t = finish(c); cache.set('paving', t); return t;
}

/** Bark: vertical furrows, near-white so each species tints it with its own colour. */
export function barkTexture() {
  if (cache.has('bark')) return cache.get('bark');
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#d8d0c4'; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 128, w = 1 + rnd() * 4;
    g.fillStyle = rnd() < 0.6 ? '#8f8578' : '#efe8dc';
    g.globalAlpha = 0.25 + rnd() * 0.45;
    g.beginPath(); g.moveTo(x, 0);
    let xx = x;
    for (let y = 0; y <= 256; y += 16) { xx += (rnd() - 0.5) * 4; g.lineTo(xx, y); }
    for (let y = 256; y >= 0; y -= 16) g.lineTo(xx + w + (rnd() - 0.5) * 2, y);
    g.fill();
    g.fillRect(x + 128, 0, 0, 0);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(70,60,50,0.35)'; g.fillRect(rnd() * 128, rnd() * 256, 3 + rnd() * 8, 1 + rnd() * 2); }
  const t = finish(c); cache.set('bark', t); return t;
}

/** Weathered vermilion lacquer over grey wood. */
export function lacquerTexture() {
  if (cache.has('lacquer')) return cache.get('lacquer');
  const [c, g] = canvas(128, 256);
  g.fillStyle = '#a8352a'; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 40; i++) { g.fillStyle = rnd() < 0.5 ? '#8e2a21' : '#bd4535'; g.globalAlpha = 0.3; g.fillRect(rnd() * 128, 0, 1 + rnd() * 3, 256); }
  g.globalAlpha = 1;
  blotches(g, 128, 256, 16, '#6f6255', 6, 22, 0.85);   // paint peeled to bare wood
  speckle(g, 128, 256, 900, ['#5a1f18', '#c85a48', '#6f6255']);
  const t = finish(c); cache.set('lacquer', t); return t;
}

/** Curved kawara roof tiles (rows of dark grey half-pipes). */
export function roofTileTexture() {
  if (cache.has('roof')) return cache.get('roof');
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#2c3036'; g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    const grd = g.createLinearGradient(x, 0, x + 32, 0);
    grd.addColorStop(0, '#22262b'); grd.addColorStop(0.5, '#5a6068'); grd.addColorStop(1, '#22262b');
    g.fillStyle = grd; g.fillRect(x + 2, 0, 28, 256);
  }
  for (let y = 0; y < 256; y += 42) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, y, 256, 3); }
  speckle(g, 256, 256, 1200, ['#1a1d21', '#6a7078', '#4f7a34']);
  const t = finish(c); cache.set('roof', t); return t;
}

/** Plastered earthen wall. */
export function plasterTexture() {
  if (cache.has('plaster')) return cache.get('plaster');
  const [c, g] = canvas(256, 128);
  g.fillStyle = '#cdbb98'; g.fillRect(0, 0, 256, 128);
  blotches(g, 256, 128, 22, '#a8936c', 10, 40, 0.5);
  speckle(g, 256, 128, 1400, ['#8f7b58', '#e3d4b4']);
  cracks(g, 256, 128, 8, '#6f5d40');
  const t = finish(c); cache.set('plaster', t); return t;
}

// ----------------------------------------------------------------------------- foliage atlas
export const ATLAS = { sprig: 0, maple: 1, blossom: 2, needles: 3 };

function eyeLeaf(g, x, y, len, wid, ang, fill, rib) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const grd = g.createLinearGradient(-wid, 0, wid, 0);
  grd.addColorStop(0, fill[0]); grd.addColorStop(0.5, fill[1]); grd.addColorStop(1, fill[0]);
  g.fillStyle = grd;
  g.beginPath(); g.moveTo(0, 0);
  g.bezierCurveTo(wid * 1.15, -len * 0.25, wid * 0.9, -len * 0.75, 0, -len);
  g.bezierCurveTo(-wid * 0.9, -len * 0.75, -wid * 1.15, -len * 0.25, 0, 0);
  g.fill();
  g.strokeStyle = rib; g.lineWidth = Math.max(1, wid * 0.09); g.globalAlpha = 0.7;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * 0.96); g.stroke();
  g.lineWidth = Math.max(0.6, wid * 0.045); g.globalAlpha = 0.45;
  for (let k = 1; k < 6; k++) {
    const yy = -len * k / 6.5, ww = wid * Math.sin(Math.PI * k / 6.5) * 0.85;
    g.beginPath(); g.moveTo(0, yy); g.quadraticCurveTo(ww * 0.6, yy - len * 0.04, ww, yy - len * 0.09); g.stroke();
    g.beginPath(); g.moveTo(0, yy); g.quadraticCurveTo(-ww * 0.6, yy - len * 0.04, -ww, yy - len * 0.09); g.stroke();
  }
  g.restore(); g.globalAlpha = 1;
}

export function foliageAtlas() {
  if (cache.has('atlas')) return cache.get('atlas');
  const S = 256;
  const [c, g] = canvas(S * 2, S * 2);
  const cell = (i) => [(i % 2) * S, Math.floor(i / 2) * S];

  // 0: sprig of eye-shaped leaves on a twig (pale so vertex colour tints it)
  {
    const [ox, oy] = cell(ATLAS.sprig);
    g.save(); g.translate(ox + S / 2, oy + S - 6);
    g.strokeStyle = '#8a7a66'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(4, -90, 0, -150); g.stroke();
    const fill = ['#c9d6b8', '#f4f8ee'], rib = '#93a37f';
    eyeLeaf(g, 0, -110, 120, 34, 0.0, fill, rib);
    eyeLeaf(g, 2, -70, 105, 30, 0.75, fill, rib);
    eyeLeaf(g, -2, -55, 100, 29, -0.8, fill, rib);
    eyeLeaf(g, 1, -25, 80, 24, 1.1, fill, rib);
    eyeLeaf(g, -1, -20, 78, 23, -1.15, fill, rib);
    g.restore();
  }
  // 1: palmate maple leaf
  {
    const [ox, oy] = cell(ATLAS.maple);
    g.save(); g.translate(ox + S / 2, oy + S * 0.62);
    g.fillStyle = '#f2eee6';
    g.beginPath();
    const lobes = 7;
    for (let i = 0; i <= 140; i++) {
      const t = (i / 140) * Math.PI * 2;
      const a = t - Math.PI / 2;
      const lobe = Math.pow(Math.abs(Math.cos((t * lobes) / 2)), 0.5);
      const bottom = Math.max(0, Math.cos(t - Math.PI)) ;   // notch where the stem attaches
      const serr = 1 + 0.05 * Math.sin(t * 60);
      const r = S * 0.44 * (0.38 + 0.62 * lobe) * (1 - 0.65 * Math.pow(bottom, 3)) * serr;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.fill();
    g.strokeStyle = '#b9ad9c'; g.lineWidth = 2;
    for (let k = 0; k < lobes; k++) {
      const a = -Math.PI / 2 + ((k - (lobes - 1) / 2) / lobes) * Math.PI * 1.55;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * S * 0.36, Math.sin(a) * S * 0.36); g.stroke();
    }
    g.lineWidth = 4; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, S * 0.36); g.stroke();
    g.restore();
  }
  // 2: cherry blossom cluster (real colours; vertex colour stays near white)
  {
    const [ox, oy] = cell(ATLAS.blossom);
    g.save(); g.translate(ox, oy);
    g.strokeStyle = '#5a4030'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(S / 2, S - 4); g.quadraticCurveTo(S * 0.45, S * 0.75, S * 0.5, S * 0.4); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(S * 0.47, S * 0.62); g.lineTo(S * 0.36, S * 0.45); g.moveTo(S * 0.49, S * 0.5); g.lineTo(S * 0.64, S * 0.45); g.stroke();
    eyeLeaf(g, S * 0.47, S * 0.78, 44, 13, -0.9, ['#7aa04e', '#a6c76e'], '#5c7d3a');
    const flowers = [[0.5, 0.26, 36], [0.33, 0.42, 32], [0.66, 0.44, 33], [0.46, 0.6, 30], [0.6, 0.27, 24], [0.38, 0.22, 22]];
    for (const [fx, fy, r] of flowers) {
      const cx = fx * S, cy = fy * S, rot = rnd() * 6;
      for (let p = 0; p < 5; p++) {
        const a = rot + (p / 5) * Math.PI * 2;
        g.save(); g.translate(cx, cy); g.rotate(a);
        const grd = g.createLinearGradient(0, 0, 0, -r);
        grd.addColorStop(0, '#e58fb0'); grd.addColorStop(0.45, '#f9d3e1'); grd.addColorStop(1, '#fff3f7');
        g.fillStyle = grd;
        g.beginPath(); g.moveTo(0, 0);
        g.bezierCurveTo(r * 0.55, -r * 0.3, r * 0.5, -r * 0.95, r * 0.12, -r);
        g.lineTo(0, -r * 0.88); g.lineTo(-r * 0.12, -r);          // the notch at the petal tip
        g.bezierCurveTo(-r * 0.5, -r * 0.95, -r * 0.55, -r * 0.3, 0, 0);
        g.fill(); g.restore();
      }
      g.fillStyle = '#c2406e'; g.beginPath(); g.arc(cx, cy, r * 0.16, 0, 7); g.fill();
      g.fillStyle = '#ffe28a';
      for (let k = 0; k < 7; k++) { const a = rnd() * 6.28, d = r * (0.18 + rnd() * 0.12); g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, 0, 7); g.fill(); }
    }
    g.restore();
  }
  // 3: pine needle tuft
  {
    const [ox, oy] = cell(ATLAS.needles);
    g.save(); g.translate(ox + S / 2, oy + S - 8);
    g.lineCap = 'round';
    for (let k = 0; k < 70; k++) {
      const a = -Math.PI / 2 + (rnd() - 0.5) * 1.6, len = S * (0.55 + rnd() * 0.38);
      g.strokeStyle = rnd() < 0.5 ? '#d5e0cc' : '#f2f6ee'; g.lineWidth = 2.2 + rnd() * 1.4;
      g.beginPath(); g.moveTo(0, -10); g.quadraticCurveTo(Math.cos(a) * len * 0.5, -10 + Math.sin(a) * len * 0.5 - 6, Math.cos(a) * len, Math.sin(a) * len); g.stroke();
    }
    g.strokeStyle = '#7a6a56'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -40); g.stroke();
    g.restore();
  }
  const t = finish(c, { repeat: false });
  t.generateMipmaps = true;
  cache.set('atlas', t);
  return t;
}
