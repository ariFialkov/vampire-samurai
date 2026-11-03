// GPU grass. A fixed set of blade instances is laid out on a jittered grid inside one tile;
// the vertex shader wraps every blade to its nearest copy around the player, so the field is
// world-locked, evenly dense and costs nothing on the CPU per frame. Heights come from the
// terrain grid texture (same triangles as the ground mesh) and a density mask decides where
// grass and rice grow. Blades sway in the shared wind and bend away from anything walking
// through them: the player and nearby monsters leave tapered trails in a trample map.
import * as THREE from 'three';
import { wind } from './wind.js';
import { MAP_HALF, MAP_SIZE, GRID_N, GRID_CELL, PADDY, LAKES, TEMPLE_RADIUS } from './terrain.js';
import { TEMPLE_PATH } from './temple.js';

export const MAX_PUSHERS = 16;
const TN = 320, TCELL = 0.3;              // trample map: 320 x 320 texels of 30 cm, wrapping every 96 m
const RECOVER = 2.4;                      // seconds for flattened grass to spring mostly back

/**
 * Trample map. Each walker stamps the grass along the path it actually took this frame:
 * bent forward along the direction of travel and outward from the line it walked. Stamps
 * fade over a couple of seconds, and the shader only bends grass above a threshold, so
 * older parts of a trail both weaken and narrow: a tapered wake behind each walker.
 * Stored toroidally in world space, so it never needs re-centring.
 */
class Trample {
  constructor() {
    this.str = new Float32Array(TN * TN);
    this.dx = new Float32Array(TN * TN);
    this.dz = new Float32Array(TN * TN);
    this.data = new Uint8Array(TN * TN * 4);
    this.tex = new THREE.DataTexture(this.data, TN, TN, THREE.RGBAFormat);
    this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping;
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    this.prev = new Map();
    this.active = false;
  }
  idx(ix, iz) { return (((iz % TN) + TN) % TN) * TN + (((ix % TN) + TN) % TN); }
  stamp(ax, az, bx, bz, r) {
    let fx = bx - ax, fz = bz - az;
    const len = Math.hypot(fx, fz);
    const moving = len > 0.004;
    if (moving) { fx /= len; fz /= len; }
    const x0 = Math.floor((Math.min(ax, bx) - r) / TCELL), x1 = Math.floor((Math.max(ax, bx) + r) / TCELL);
    const z0 = Math.floor((Math.min(az, bz) - r) / TCELL), z1 = Math.floor((Math.max(az, bz) + r) / TCELL);
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        const px = (ix + 0.5) * TCELL, pz = (iz + 0.5) * TCELL;
        let t = 0, cx = bx, cz = bz;
        if (moving) { t = Math.max(0, Math.min(1, ((px - ax) * fx + (pz - az) * fz) / len)); cx = ax + fx * len * t; cz = az + fz * len * t; }
        const ox = px - cx, oz = pz - cz, l = Math.hypot(ox, oz);
        if (l >= r) continue;
        const s = 1 - (l / r) * (l / r);
        const i = this.idx(ix, iz);
        if (s < this.str[i] * 0.85) continue;
        let dx, dz;
        if (moving) {
          // pressed forward along the stride and outward from the walker's line
          const side = (ox * -fz + oz * fx) >= 0 ? 1 : -1, out = 0.35 + 0.65 * (l / r);
          dx = fx * 0.7 + -fz * side * out; dz = fz * 0.7 + fx * side * out;
        } else if (l > 0.05) { dx = ox / l; dz = oz / l; }
        else { dx = this.dx[i]; dz = this.dz[i]; }
        const dl = Math.hypot(dx, dz) || 1;
        this.dx[i] = dx / dl; this.dz[i] = dz / dl;
        this.str[i] = Math.max(this.str[i], s);
        this.active = true;
      }
    }
  }
  /** walkers: [{id, x, z, r}] */
  update(dt, walkers) {
    const seen = new Set();
    for (const w of walkers) {
      const p = this.prev.get(w.id);
      seen.add(w.id);
      if (p && Math.hypot(w.x - p.x, w.z - p.z) < 3) this.stamp(p.x, p.z, w.x, w.z, w.r);
      else this.stamp(w.x, w.z, w.x, w.z, w.r);
      if (p) { p.x = w.x; p.z = w.z; } else this.prev.set(w.id, { x: w.x, z: w.z });
    }
    for (const id of this.prev.keys()) if (!seen.has(id)) this.prev.delete(id);
    if (!this.active) return;
    const k = Math.exp(-dt / RECOVER);
    const S = this.str, D = this.data, X = this.dx, Z = this.dz;
    let any = false;
    for (let i = 0; i < S.length; i++) {
      let s = S[i];
      if (s <= 0) continue;
      s *= k;
      if (s < 0.02) s = 0; else any = true;
      S[i] = s;
      const o = i * 4;
      D[o] = (X[i] * 0.5 + 0.5) * 255; D[o + 1] = (Z[i] * 0.5 + 0.5) * 255; D[o + 2] = s * 255;
    }
    this.active = any;
    this.tex.needsUpdate = true;
  }
}

function bladeGeometry(segments) {
  const pos = [], idx = [];
  for (let s = 0; s < segments; s++) {
    const t = s / segments;
    const w = Math.pow(1 - t, 0.6);           // taper toward the tip
    pos.push(-w, t, 0, w, t, 0);
  }
  pos.push(0, 1, 0);                           // pointed tip
  for (let s = 0; s < segments - 1; s++) {
    const a = s * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const last = (segments - 1) * 2;
  idx.push(last, last + 1, segments * 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

function distToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

/** Density / rice / colour-variation mask, 1 texel per metre. */
function buildMask(world) {
  const T = world.terrain, S = world.solids;
  const N = MAP_SIZE;
  const data = new Uint8Array(N * N * 4);
  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const x = -MAP_HALF + ix + 0.5, z = -MAP_HALF + iz + 0.5;
      const h = T.heightAt(x, z), water = T.waterLevelAt(x, z);
      const inPaddy = Math.abs(x - PADDY.x) < PADDY.w / 2 - 1.5 && Math.abs(z - PADDY.z) < PADDY.h / 2 - 1.5;
      let d = 1;
      if (!inPaddy && h < water + 0.25) d = 0;
      else if (!inPaddy && h < water + 0.9) d *= 0.4;
      const slope = T.slopeAt(x, z);
      if (slope > 0.32) d *= Math.max(0, 1 - (slope - 0.32) / 0.12);
      if (h > 21) d *= Math.max(0, 1 - (h - 21) / 4);
      if (S.topAt(x, z) > h + 0.05) d = 0;                              // temple floor, steps, structures
      for (let i = 0; i < TEMPLE_PATH.length - 1; i++) {
        const a = TEMPLE_PATH[i], b = TEMPLE_PATH[i + 1];
        const pd = distToSegment(x, z, a[0], a[1], b[0], b[1]);
        if (pd < 1.5) d *= 0.12 + 0.88 * (pd / 1.5);
      }
      if (inPaddy) {                                                     // rice grows in the flooded terraces
        const row = (z - PADDY.z) / PADDY.h * PADDY.steps;
        const edge = Math.abs(row - Math.round(row));
        d = edge < 0.05 ? 0 : 0.85;
      }
      const v = T.noise.fbm(x * 0.035, z * 0.035, 3) * 0.5 + 0.5;
      const o = (iz * N + ix) * 4;
      data[o] = Math.round(d * 255);
      data[o + 1] = inPaddy ? 255 : 0;
      data[o + 2] = Math.round(Math.max(0, Math.min(1, v)) * 255);
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class Grass {
  constructor(world, { count, radius }, receiveShadow) {
    this.radius = radius;
    const tile = radius * 2;
    const geo = bladeGeometry(count > 60000 ? 4 : 3);
    const side = Math.ceil(Math.sqrt(count));
    const blades = new Float32Array(side * side * 4);
    let s = 1234567;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) {
      const k = (j * side + i) * 4;
      blades[k] = ((i + rnd()) / side - 0.5) * tile;
      blades[k + 1] = ((j + rnd()) / side - 0.5) * tile;
      blades[k + 2] = rnd();   // density threshold + facing
      blades[k + 3] = rnd();   // height / phase
    }
    geo.setAttribute('aBlade', new THREE.InstancedBufferAttribute(blades, 4));
    geo.instanceCount = side * side;

    this.trample = new Trample();
    this.uniforms = {
      uCenter: { value: new THREE.Vector3() },
      uTile: { value: tile }, uRadius: { value: radius }, uSpread: { value: 1 },
      uHalf: { value: MAP_HALF }, uCell: { value: GRID_CELL }, uN: { value: GRID_N },
      uHeight: { value: world.terrain.heightTexture() },
      uMask: { value: buildMask(world) },
      uTrample: { value: this.trample.tex },
      uTrampleSpan: { value: TN * TCELL },
    };
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms, {
        uTime: wind.uniforms.uTime, uWindDir: wind.uniforms.uWindDir, uWindStrength: wind.uniforms.uWindStrength,
      });
      shader.vertexShader = /* glsl */`
        uniform vec3 uCenter; uniform float uTile, uRadius, uSpread, uHalf, uCell, uN;
        uniform sampler2D uHeight; uniform sampler2D uMask;
        uniform sampler2D uTrample; uniform float uTrampleSpan;
        uniform float uTime; uniform vec2 uWindDir; uniform float uWindStrength;
        attribute vec4 aBlade;
        varying vec3 vGrass;
        float gTerrain(vec2 p) {
          vec2 g = clamp((p + uHalf) / uCell, vec2(0.0), vec2(uN - 1.001));
          vec2 i = floor(g); vec2 f = g - i; ivec2 c = ivec2(i);
          float ha = texelFetch(uHeight, c, 0).r, hd = texelFetch(uHeight, c + ivec2(1, 0), 0).r;
          float hb = texelFetch(uHeight, c + ivec2(0, 1), 0).r, hc = texelFetch(uHeight, c + ivec2(1, 1), 0).r;
          if (f.x + f.y <= 1.0) return ha + (hd - ha) * f.x + (hb - ha) * f.y;
          return hc + (hb - hc) * (1.0 - f.x) + (hd - hc) * (1.0 - f.y);
        }
      ` + shader.vertexShader
        .replace('#include <beginnormal_vertex>', /* glsl */`
          float gT = uTile * uSpread;
          vec2 gb = aBlade.xy * uSpread;
          vec2 gw = gb + floor((uCenter.xz - gb) / gT + 0.5) * gT;
          float gR = uRadius * uSpread;
          float gFade = 1.0 - smoothstep(gR * 0.5, gR, length(gw - uCenter.xz));
          vec4 gm = texture2D(uMask, (gw + uHalf) / (2.0 * uHalf));
          float gRice = step(0.5, gm.g);
          if (gRice > 0.5) gw = floor(gw / 0.55 + 0.5) * 0.55 + (aBlade.zw - 0.5) * 0.14;   // rice in planted clumps
          float gKeep = step(aBlade.z, gm.r);
          float gH = mix(0.3 + 0.42 * aBlade.w, 0.62 + 0.3 * aBlade.w, gRice) * (0.78 + 0.45 * gm.b) * gKeep * gFade;
          float gAng = fract(aBlade.z * 7.31 + aBlade.w * 3.7) * 6.2832;
          vec2 gFwd = vec2(sin(gAng), cos(gAng));
          vec2 gSide = vec2(gFwd.y, -gFwd.x);
          float along = dot(gw, uWindDir);
          float gGust = 0.5 + 0.5 * sin(uTime * 1.6 - along * 0.22 + aBlade.w * 2.0);
          gGust = gGust * 0.75 + 0.25 * sin(uTime * 4.3 + aBlade.z * 31.0);
          vec2 gBend = gFwd * 0.28 + uWindDir * (0.12 + 0.5 * gGust) * uWindStrength;
          // trampled: bend along the stored direction; weak (old) parts of a trail stand back up first
          vec4 gTr = texture2D(uTrample, gw / uTrampleSpan);
          float gTk = smoothstep(0.12, 0.7, gTr.b);
          gBend = mix(gBend, (gTr.rg * 2.0 - 1.0) * 1.55, gTk);
          float gBl = length(gBend);
          if (gBl > 1.5) gBend *= 1.5 / gBl;
          vec3 objectNormal = normalize(vec3(gFwd.x * 0.3 + gBend.x * 0.25, 1.0, gFwd.y * 0.3 + gBend.y * 0.25));
        `)
        .replace('#include <begin_vertex>', /* glsl */`
          float gt = position.y;
          float gWidth = 0.05 * (0.75 + 0.5 * aBlade.w) * mix(1.0, 0.65, gRice);
          float gDrop = clamp(dot(gBend, gBend) * 0.2, 0.0, 0.55);
          vec2 gOff = gBend * gt * gt * gH;
          vec3 transformed = vec3(
            gw.x + gSide.x * position.x * gWidth + gOff.x,
            gTerrain(gw) - 0.03 + gt * gH * (1.0 - gDrop * gt),
            gw.y + gSide.y * position.x * gWidth + gOff.y);
          vGrass = vec3(gt, gm.b, gRice);
        `);
      shader.fragmentShader = 'varying vec3 vGrass;\n' + shader.fragmentShader.replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        vec3 gRoot = mix(vec3(0.13, 0.25, 0.07), vec3(0.24, 0.30, 0.09), vGrass.y);
        vec3 gTip = mix(vec3(0.36, 0.56, 0.17), vec3(0.5, 0.6, 0.23), vGrass.y);
        vec3 gc = mix(gRoot, gTip, smoothstep(0.0, 1.0, vGrass.x));
        gc = mix(gc, mix(vec3(0.22, 0.42, 0.12), vec3(0.55, 0.78, 0.30), vGrass.x), vGrass.z);
        diffuseColor.rgb = gc * 0.92;
      `).replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize(vNormal); // light both faces of a blade the same');
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = receiveShadow;
    this.mesh.name = 'grass';
  }

  /** walkers: [{id, x, z, r}] (the player and nearby monsters) trample the grass. */
  update(dt, focus, spread, walkers = []) {
    this.uniforms.uCenter.value.copy(focus);
    this.uniforms.uSpread.value = spread;
    this.trample.update(dt, walkers);
  }
}
