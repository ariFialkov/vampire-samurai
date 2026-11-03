// Procedural countryside heightfield. One analytic height function drives the mesh,
// placement of every object and all entity movement, so the world is always consistent.
import * as THREE from 'three';
import { Noise2D } from '../../shared/noise.js';
import { Rng } from '../../shared/rng.js';

export const MAP_SIZE = 440;          // world units, square map centred on 0,0
export const MAP_HALF = MAP_SIZE / 2;
export const PLAY_LIMIT = MAP_HALF - 22; // soft border (the ring of mountains starts here)
export const WATER_LEVEL = 0.0;
export const TEMPLE_RADIUS = 30;     // flat top of the temple hill
export const TEMPLE_HEIGHT = 12;

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
    this.cache = new Map();
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

  heightAt(x, z) {
    const key = ((x * 4) | 0) * 100003 + ((z * 4) | 0);
    const c = this.cache.get(key);
    if (c !== undefined) return c;
    const h = this.computeHeight(x, z);
    if (this.cache.size > 200000) this.cache.clear();
    this.cache.set(key, h);
    return h;
  }

  computeHeight(x, z) {
    let h = this.baseHeight(x, z);
    // Temple hill: a gentle flat-topped mound in the centre
    const d = Math.hypot(x, z);
    const hill = 1 - smooth(clamp01((d - TEMPLE_RADIUS) / 55));
    h = THREE.MathUtils.lerp(h, 2.5, clamp01(1 - (d - TEMPLE_RADIUS) / 60) * 0.9) + hill * TEMPLE_HEIGHT;
    if (d < TEMPLE_RADIUS) h = 2.5 + TEMPLE_HEIGHT + this.noise2.noise(x * 0.2, z * 0.2) * 0.05;
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

  /** Build the ground mesh with vertex colours derived from height, slope and moisture. */
  buildMesh(segments = 220) {
    const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const grass = new THREE.Color(0x6fa14c), grassDark = new THREE.Color(0x4f7d36), grassDry = new THREE.Color(0x9bb060);
    const dirt = new THREE.Color(0x8a6a44), rock = new THREE.Color(0x7d7a74), rockDark = new THREE.Color(0x5b5955);
    const sand = new THREE.Color(0xd9c89a), moss = new THREE.Color(0x55803f), paddy = new THREE.Color(0x3f6e3a);
    const mountainTop = new THREE.Color(0xb9b6ae);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.computeHeight(x, z);
      pos.setY(i, h);
      const slope = 1 - this.normalAt(x, z, 1.2).y;
      const water = this.waterLevelAt(x, z);
      const n = this.noise2.fbm(x * 0.05, z * 0.05, 2) * 0.5 + 0.5;
      c.copy(grass).lerp(grassDark, n);
      c.lerp(grassDry, clamp01(this.noise.noise(x * 0.02 + 40, z * 0.02) * 0.9));
      if (h - water < 1.2) c.lerp(sand, clamp01(1 - (h - water) / 1.2) * 0.9);
      if (h < water - 0.3) c.lerp(new THREE.Color(0x4a5a3a), 0.8);
      if (slope > 0.18) c.lerp(dirt, clamp01((slope - 0.18) / 0.15));
      if (slope > 0.3) c.lerp(rock, clamp01((slope - 0.3) / 0.2));
      if (slope > 0.5) c.lerp(rockDark, clamp01((slope - 0.5) / 0.3));
      if (h > 24) c.lerp(mountainTop, clamp01((h - 24) / 14));
      const P = PADDY;
      const px = (x - P.x) / P.w + 0.5, pz = (z - P.z) / P.h + 0.5;
      if (px > 0 && px < 1 && pz > 0 && pz < 1) c.lerp(paddy, 0.75);
      if (Math.hypot(x, z) < TEMPLE_RADIUS + 3) c.lerp(moss, 0.5);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  /** Animated water: lakes + paddies. One big plane at lake level, plus terrace sheets. */
  buildWater() {
    const group = new THREE.Group();
    const uniforms = { uTime: { value: 0 }, uNight: { value: 0 } };
    const mat = new THREE.MeshStandardMaterial({ color: 0x4f8fb3, transparent: true, opacity: 0.72, roughness: 0.25, metalness: 0.1 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uniforms.uTime;
      shader.vertexShader = `uniform float uTime;\nvarying vec3 vWorld;\n` + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec4 wpos = modelMatrix * vec4(position, 1.0);
         vWorld = wpos.xyz;
         transformed.y += sin(wpos.x * 0.6 + uTime * 1.2) * 0.04 + sin(wpos.z * 0.45 - uTime * 0.9) * 0.04;`
      );
      shader.fragmentShader = `uniform float uTime;\nvarying vec3 vWorld;\n` + shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
         float r1 = sin(vWorld.x * 1.7 + uTime * 1.5) * 0.5 + sin(vWorld.z * 2.3 - uTime * 1.1) * 0.5;
         float r2 = sin(vWorld.z * 1.4 + uTime * 1.3) * 0.5 + sin(vWorld.x * 2.1 + uTime * 0.7) * 0.5;
         normal = normalize(normal + vec3(r1 * 0.08, 0.0, r2 * 0.08));`
      ).replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         float g1 = sin(vWorld.x * 1.9 + vWorld.z * 0.7 + uTime * 1.4) * sin(vWorld.z * 2.3 - vWorld.x * 0.4 - uTime * 1.1);
         float g2 = sin(vWorld.x * 0.37 - uTime * 0.5) * sin(vWorld.z * 0.29 + uTime * 0.4);
         float glint = pow(max(0.0, g1 * (0.6 + 0.4 * g2)), 14.0);
         diffuseColor.rgb += glint * 0.12;`
      );
    };
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 64, 64), mat);
    lake.rotation.x = -Math.PI / 2;
    lake.position.y = WATER_LEVEL;
    lake.name = 'lake';
    group.add(lake);
    // Paddy terraces: thin water sheets per terrace
    const P = PADDY;
    for (let s = 0; s < P.steps; s++) {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(P.w, P.h / P.steps, 8, 4), mat);
      sheet.rotation.x = -Math.PI / 2;
      sheet.position.set(P.x, 1.0 + s * 0.9, P.z - P.h / 2 + (s + 0.5) * (P.h / P.steps));
      group.add(sheet);
    }
    group.userData.uniforms = uniforms;
    return group;
  }
}
