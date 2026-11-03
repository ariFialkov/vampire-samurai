// Procedural countryside heightfield. An analytic height function is sampled once into a
// grid; the ground mesh is built from exactly that grid and heightAt() interpolates the
// same triangles, so feet, grass and props always sit on the surface you can see.
import * as THREE from 'three';
import { Noise2D } from '../../shared/noise.js';
import { Rng } from '../../shared/rng.js';

export const MAP_SIZE = 440;          // world units, square map centred on 0,0
export const MAP_HALF = MAP_SIZE / 2;
export const PLAY_LIMIT = MAP_HALF - 22; // soft border (the ring of mountains starts here)
export const WATER_LEVEL = 0.0;
export const TEMPLE_RADIUS = 30;     // flat top of the temple hill
export const TEMPLE_HEIGHT = 12;
export const GRID_SEG = 220;               // ground mesh segments per side (2 m cells)
export const GRID_N = GRID_SEG + 1;
export const GRID_CELL = MAP_SIZE / GRID_SEG;

export const LAKES = [
  { x: -95, z: 70, r: 42 },
  { x: 120, z: -60, r: 34 },
  { x: 30, z: 150, r: 26 },
];
export const PADDY = { x: -70, z: -115, w: 90, h: 60, steps: 4 }; // terraced rice paddies
export const CAVES = [
  { x: 150, z: 95, angle: -2.3 },
  { x: -150, z: -40, angle: 0.4 },
];

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

export class Terrain {
  constructor(seed = 'countryside') {
    this.rng = new Rng(seed);
    this.noise = new Noise2D(this.rng);
    this.noise2 = new Noise2D(this.rng.fork('detail'));
    // Sample the analytic surface once into the height grid
    this.heights = new Float32Array(GRID_N * GRID_N);
    for (let iz = 0; iz < GRID_N; iz++) {
      for (let ix = 0; ix < GRID_N; ix++) {
        this.heights[iz * GRID_N + ix] = this.computeHeight(-MAP_HALF + ix * GRID_CELL, -MAP_HALF + iz * GRID_CELL);
      }
    }
    this.templeY = this.heightAt(0, 0);
  }

  /** Base rolling-hills height before features. */
  baseHeight(x, z) {
    const n = this.noise;
    const d = Math.hypot(x, z);
    const wild = clamp01((d - 40) / 170);           // wilder further from the temple
    let h = 2.0;
    h += n.fbm(x * 0.0075, z * 0.0075, 4) * (3 + 9 * wild);     // broad hills & valleys
    h += n.fbm(x * 0.03 + 7, z * 0.03 - 3, 3) * (0.5 + 1.6 * wild); // bumps
    h += this.noise2.noise(x * 0.12, z * 0.12) * 0.18;         // tiny undulation
    // ridge line to the north-east for a valley feel
    const ridge = 1 - Math.abs(n.noise(x * 0.004 + 3, z * 0.004 + 9));
    h += ridge * ridge * 6 * wild;
    return h;
  }

  /** Height of the visible ground mesh at (x, z): same triangulation as PlaneGeometry. */
  heightAt(x, z) {
    let gx = (x + MAP_HALF) / GRID_CELL, gz = (z + MAP_HALF) / GRID_CELL;
    gx = Math.min(GRID_SEG - 1e-4, Math.max(0, gx)); gz = Math.min(GRID_SEG - 1e-4, Math.max(0, gz));
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const fx = gx - ix, fz = gz - iz;
    const H = this.heights, i = iz * GRID_N + ix;
    const ha = H[i], hd = H[i + 1], hb = H[i + GRID_N], hc = H[i + GRID_N + 1];
    if (fx + fz <= 1) return ha + (hd - ha) * fx + (hb - ha) * fz;
    return hc + (hb - hc) * (1 - fx) + (hd - hc) * (1 - fz);
  }

  /** Height grid as a float texture for GPU-placed grass. */
  heightTexture() {
    if (!this._tex) {
      this._tex = new THREE.DataTexture(this.heights, GRID_N, GRID_N, THREE.RedFormat, THREE.FloatType);
      this._tex.magFilter = this._tex.minFilter = THREE.NearestFilter;
      this._tex.needsUpdate = true;
    }
    return this._tex;
  }

  computeHeight(x, z) {
    let h = this.baseHeight(x, z);
    // Temple hill: a gentle flat-topped mound in the centre
    const d = Math.hypot(x, z);
    const hill = 1 - smooth(clamp01((d - TEMPLE_RADIUS) / 55));
    h = THREE.MathUtils.lerp(h, 2.5, clamp01(1 - (d - TEMPLE_RADIUS) / 60) * 0.9) + hill * TEMPLE_HEIGHT;
    if (d < TEMPLE_RADIUS) h = 2.5 + TEMPLE_HEIGHT;
    // Lakes: basins pushed below water level
    for (const L of LAKES) {
      const ld = Math.hypot(x - L.x, z - L.z) / L.r;
      if (ld < 1.4) {
        const t = smooth(clamp01(1 - (ld - 0.55) / 0.85));
        h = THREE.MathUtils.lerp(h, WATER_LEVEL - 2.2, t);
      }
    }
    // Rice paddies: terraces that step down toward the south
    const P = PADDY;
    const px = (x - P.x) / P.w + 0.5, pz = (z - P.z) / P.h + 0.5;
    if (px > -0.15 && px < 1.15 && pz > -0.15 && pz < 1.15) {
      const edge = smooth(clamp01(Math.min(px + 0.15, 1.15 - px, pz + 0.15, 1.15 - pz) / 0.25));
      const step = Math.floor(clamp01(pz) * P.steps);
      const terraced = 1.0 + step * 0.9 - 0.25; // flat shelf per terrace, slightly below water of that shelf
      h = THREE.MathUtils.lerp(h, terraced, edge);
    }
    // Mountain ring around the map border (natural wall)
    const border = Math.max(Math.abs(x), Math.abs(z));
    const b = clamp01((border - PLAY_LIMIT + 6) / (MAP_HALF - PLAY_LIMIT));
    h += smooth(b) * (26 + this.noise.noise(x * 0.05, z * 0.05) * 8);
    return h;
  }

  /** Height of the water surface at a point (paddies have stepped water). */
  waterLevelAt(x, z) {
    const P = PADDY;
    const px = (x - P.x) / P.w + 0.5, pz = (z - P.z) / P.h + 0.5;
    if (px > 0 && px < 1 && pz > 0 && pz < 1) {
      const step = Math.floor(pz * P.steps);
      return 1.0 + step * 0.9;
    }
    return WATER_LEVEL;
  }

  isWater(x, z) { return this.heightAt(x, z) < this.waterLevelAt(x, z) - 0.05; }
  isDeepWater(x, z) { return this.heightAt(x, z) < this.waterLevelAt(x, z) - 0.9; }

  normalAt(x, z, eps = 0.6) {
    const hl = this.heightAt(x - eps, z), hr = this.heightAt(x + eps, z);
    const hd = this.heightAt(x, z - eps), hu = this.heightAt(x, z + eps);
    const n = new THREE.Vector3(hl - hr, 2 * eps, hd - hu);
    return n.normalize();
  }

  slopeAt(x, z) { return 1 - this.normalAt(x, z).y; }

  /** Build the ground mesh from the height grid, with vertex colours from height, slope and moisture. */
  buildMesh() {
    const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, GRID_SEG, GRID_SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const grass = new THREE.Color(0x5e8f3a), grassDark = new THREE.Color(0x4a7a30), grassDry = new THREE.Color(0x86a04c);
    const dirt = new THREE.Color(0x7d6243), rock = new THREE.Color(0x7d7a74), rockDark = new THREE.Color(0x5b5955);
    const sand = new THREE.Color(0xcdbd90), moss = new THREE.Color(0x4f7a3a), paddy = new THREE.Color(0x4d6b3a);
    const mountainTop = new THREE.Color(0xb9b6ae), mud = new THREE.Color(0x4a5236);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.heights[i];
      pos.setY(i, h);
      const slope = 1 - this.normalAt(x, z, 1.5).y;
      const water = this.waterLevelAt(x, z);
      const n = this.noise2.fbm(x * 0.05, z * 0.05, 2) * 0.5 + 0.5;
      c.copy(grass).lerp(grassDark, n);
      c.lerp(grassDry, clamp01(this.noise.noise(x * 0.02 + 40, z * 0.02) * 0.9));
      if (h - water < 1.2) c.lerp(sand, clamp01(1 - (h - water) / 1.2) * 0.9);
      if (h < water - 0.3) c.lerp(mud, 0.85);
      if (slope > 0.18) c.lerp(dirt, clamp01((slope - 0.18) / 0.15));
      if (slope > 0.3) c.lerp(rock, clamp01((slope - 0.3) / 0.2));
      if (slope > 0.5) c.lerp(rockDark, clamp01((slope - 0.5) / 0.3));
      if (h > 24) c.lerp(mountainTop, clamp01((h - 24) / 14));
      const P = PADDY;
      const px = (x - P.x) / P.w + 0.5, pz = (z - P.z) / P.h + 0.5;
      if (px > 0 && px < 1 && pz > 0 && pz < 1) c.lerp(paddy, 0.8);
      if (Math.hypot(x, z) < TEMPLE_RADIUS + 3) c.lerp(moss, 0.5);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    // Break up the 2 m vertex colours with fine procedural mottling in the fragment shader
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = 'varying vec3 vGroundPos;\n' + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = `varying vec3 vGroundPos;
        float gHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float gNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(gHash(i), gHash(i+vec2(1,0)), f.x), mix(gHash(i+vec2(0,1)), gHash(i+vec2(1,1)), f.x), f.y); }
      ` + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        float m1 = gNoise(vGroundPos.xz * 0.9), m2 = gNoise(vGroundPos.xz * 3.7), m3 = gNoise(vGroundPos.xz * 0.21);
        diffuseColor.rgb *= 0.86 + 0.16 * m1 + 0.08 * m2 + 0.08 * (m3 - 0.5);`);
    };
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

}
