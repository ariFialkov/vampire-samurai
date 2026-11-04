// Water: lakes and the flooded rice terraces. A smooth, depth-tinted surface (clear teal in
// the shallows, deep blue-green further out) with a thin shoreline foam and sky reflection at
// grazing angles. Around the guardian, two world-locked grids (toroidal, like the grass
// trample map) react to anyone wading:
//  - a wave-equation ripple grid: legs push the surface down and the disturbance spreads
//    behind them as a fanning wake,
//  - a foam trail: each leg stamps white water along the path it took, fading and narrowing
//    behind the walker so it reads as a tapered wake rather than a circle.
import * as THREE from 'three';
import { MAP_SIZE, MAP_HALF, WATER_LEVEL, PADDY, GRID_N, GRID_CELL } from './terrain.js';
import { wind } from './wind.js';

const RN = 192, RCELL = 0.2, SPAN = RN * RCELL;        // ripple grid: 38.4 m, 20 cm cells
const WAVE_SPEED = 1.6;                                  // m/s
const DAMPING = 0.65;                                    // per second

export class Water {
  constructor(world) {
    this.world = world;
    this.h = new Float32Array(RN * RN);
    this.foam = new Float32Array(RN * RN);
    this.foamActive = false;
    this.v = new Float32Array(RN * RN);
    this.data = new Uint8Array(RN * RN * 4);
    for (let i = 0; i < RN * RN; i++) this.data[i * 4] = 128;
    this.tex = new THREE.DataTexture(this.data, RN, RN, THREE.RGBAFormat);
    this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping;
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    this.energy = 0;
    this.prev = new Map();
    this.splashT = new Map();
    this.uniforms = {
      uTime: { value: 0 }, uRipple: { value: this.tex }, uRippleSpan: { value: SPAN }, uRippleTexel: { value: 1 / RN },
      uCenter: { value: new THREE.Vector3() }, uWindDir: wind.uniforms.uWindDir, uWindStrength: wind.uniforms.uWindStrength,
      uHeight: { value: world.terrain.heightTexture() }, uHalf: { value: MAP_HALF }, uCell: { value: GRID_CELL }, uN: { value: GRID_N },
      uSky: { value: new THREE.Color(0x9fc4e6) },
    };
    const mat = new THREE.MeshStandardMaterial({ color: 0x3f7f9a, transparent: true, roughness: 0.18, metalness: 0.05, depthWrite: false });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = 'varying vec3 vWorld;\n' + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = /* glsl */`
        varying vec3 vWorld;
        uniform float uTime, uRippleSpan, uRippleTexel, uHalf, uCell, uN, uWindStrength;
        uniform sampler2D uRipple, uHeight;
        uniform vec3 uCenter, uSky;
        uniform vec2 uWindDir;
        float wTerrain(vec2 p) {
          vec2 g = clamp((p + uHalf) / uCell, vec2(0.0), vec2(uN - 1.001));
          vec2 i = floor(g); vec2 f = g - i; ivec2 c = ivec2(i);
          float ha = texelFetch(uHeight, c, 0).r, hd = texelFetch(uHeight, c + ivec2(1, 0), 0).r;
          float hb = texelFetch(uHeight, c + ivec2(0, 1), 0).r, hc = texelFetch(uHeight, c + ivec2(1, 1), 0).r;
          if (f.x + f.y <= 1.0) return ha + (hd - ha) * f.x + (hb - ha) * f.y;
          return hc + (hb - hc) * (1.0 - f.x) + (hd - hc) * (1.0 - f.y);
        }
        float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float wNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(wHash(i), wHash(i + vec2(1, 0)), f.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), f.x), f.y); }
        // ripple height in metres (encoded 128 + h * 300)
        float wRipple(vec2 p) { return (texture2D(uRipple, p / uRippleSpan).r * 255.0 - 128.0) / 300.0; }
      ` + shader.fragmentShader
        .replace('#include <color_fragment>', /* glsl */`
          #include <color_fragment>
          float wDepth = vWorld.y - wTerrain(vWorld.xz);
          float wFade = 1.0 - smoothstep(13.0, 18.0, length(vWorld.xz - uCenter.xz));
          float wRip = wRipple(vWorld.xz) * wFade;
          vec3 shallow = vec3(0.24, 0.5, 0.5), deep = vec3(0.05, 0.2, 0.3);
          diffuseColor.rgb = mix(shallow, deep, smoothstep(0.0, 2.2, wDepth));
          diffuseColor.a = mix(0.18, 0.86, smoothstep(0.0, 1.6, wDepth));
        `)
        .replace('#include <normal_fragment_begin>', /* glsl */`
          #include <normal_fragment_begin>
          vec2 wSlope = vec2(0.0);
          float wE = uRippleTexel * uRippleSpan;
          float rL = wRipple(vWorld.xz - vec2(wE, 0.0)), rR = wRipple(vWorld.xz + vec2(wE, 0.0)), rD = wRipple(vWorld.xz - vec2(0.0, wE)), rU = wRipple(vWorld.xz + vec2(0.0, wE));
          vec2 wRipSlope = vec2(rR - rL, rU - rD) / (2.0 * wE) * 2.2 * wFade;
          wSlope += wRipSlope;
          vec3 wN = normalize(vec3(-wSlope.x, 1.0, -wSlope.y));
          normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
        `)
        .replace('#include <opaque_fragment>', /* glsl */`
          // sky reflection at grazing angles, shoreline foam and whitened wake crests
          float wFres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
          outgoingLight = mix(outgoingLight, uSky, wFres * 0.35);
          // ripple slopes catch the light, so the wake reads even from straight above
          outgoingLight *= 1.0 + clamp(dot(wRipSlope, vec2(0.55, 0.83)) * 1.9, -0.4, 0.6);
          float shore = 1.0 - smoothstep(0.015, 0.07, wDepth);
          float foamN = wNoise(vWorld.xz * 4.0 + vec2(uTime * 0.3, -uTime * 0.2));
          float foam = shore * smoothstep(0.45, 0.8, foamN + shore * 0.3) + smoothstep(0.05, 0.12, abs(wRip)) * 0.35;
          outgoingLight = mix(outgoingLight, vec3(0.92, 0.95, 0.95), clamp(foam, 0.0, 0.85));
          // white water trailing behind each wading leg; older (weaker) parts thin out first
          float trail = texture2D(uRipple, vWorld.xz / uRippleSpan).g * wFade;
          float wake = smoothstep(0.16, 0.7, trail) * (0.55 + 0.45 * smoothstep(0.2, 0.8, wNoise(vWorld.xz * 7.0 + vec2(uTime * 0.9, -uTime * 0.6))));
          foam += wake;
          outgoingLight = mix(outgoingLight, vec3(0.93, 0.96, 0.96), clamp(wake, 0.0, 0.8));
          diffuseColor.a = max(diffuseColor.a, min(0.9, foam * 0.85));
          #include <opaque_fragment>
        `);
    };
    this.material = mat;
    this.group = new THREE.Group();
    this.group.name = 'water';
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 1, 1), mat);
    lake.rotation.x = -Math.PI / 2; lake.position.y = WATER_LEVEL; lake.renderOrder = 1;
    this.group.add(lake);
    const P = PADDY;
    for (let s = 0; s < P.steps; s++) {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(P.w, P.h / P.steps, 1, 1), mat);
      sheet.rotation.x = -Math.PI / 2;
      sheet.position.set(P.x, 1.0 + s * 0.9, P.z - P.h / 2 + (s + 0.5) * (P.h / P.steps));
      sheet.renderOrder = 1;
      this.group.add(sheet);
    }
  }

  idx(ix, iz) { return (((iz % RN) + RN) % RN) * RN + (((ix % RN) + RN) % RN); }

  /** Push the surface down in a soft disc (a leg or body moving through the water). */
  disturb(x, z, r, amount) {
    const ix0 = Math.floor((x - r) / RCELL), ix1 = Math.floor((x + r) / RCELL);
    const iz0 = Math.floor((z - r) / RCELL), iz1 = Math.floor((z + r) / RCELL);
    for (let iz = iz0; iz <= iz1; iz++) for (let ix = ix0; ix <= ix1; ix++) {
      const dx = (ix + 0.5) * RCELL - x, dz = (iz + 0.5) * RCELL - z, d2 = (dx * dx + dz * dz) / (r * r);
      if (d2 >= 1) continue;
      const k = (1 - d2) * (1 - d2);
      this.v[this.idx(ix, iz)] -= amount * k;
    }
    this.energy = 1;
  }

  /** Stamp foam along a leg's path this frame (a capsule from a to b). */
  stampFoam(ax, az, bx, bz, r, strength) {
    let fx = bx - ax, fz = bz - az;
    const len = Math.hypot(fx, fz);
    if (len > 3) return;
    if (len > 1e-4) { fx /= len; fz /= len; }
    const x0 = Math.floor((Math.min(ax, bx) - r) / RCELL), x1 = Math.floor((Math.max(ax, bx) + r) / RCELL);
    const z0 = Math.floor((Math.min(az, bz) - r) / RCELL), z1 = Math.floor((Math.max(az, bz) + r) / RCELL);
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      const px = (ix + 0.5) * RCELL, pz = (iz + 0.5) * RCELL;
      const t = len > 1e-4 ? Math.max(0, Math.min(len, (px - ax) * fx + (pz - az) * fz)) : 0;
      const d = Math.hypot(px - ax - fx * t, pz - az - fz * t);
      if (d >= r) continue;
      const i = this.idx(ix, iz);
      this.foam[i] = Math.max(this.foam[i], strength * (1 - (d / r) * (d / r)));
    }
    this.foamActive = true;
  }

  /**
   * walkers: [{id, x, z, r, facing?}] — feet in shallow water make waves; returns splash points
   * (for spray particles) where someone is wading quickly.
   */
  update(dt, focus, walkers, time) {
    const T = this.world.terrain;
    this.uniforms.uTime.value = time;
    this.uniforms.uCenter.value.copy(focus);
    const splashes = [];
    const seen = new Set();
    for (const w of walkers) {
      if (w.log) continue;
      const level = T.waterLevelAt(w.x, w.z), depth = level - T.heightAt(w.x, w.z);
      const prev = this.prev.get(w.id);
      seen.add(w.id);
      if (!prev) { this.prev.set(w.id, { x: w.x, z: w.z, px: w.x, pz: w.z }); continue; }
      const speed = Math.min(12, Math.hypot(w.x - prev.x, w.z - prev.z) / Math.max(dt, 1e-3));
      prev.x = w.x; prev.z = w.z;
      if (depth < 0.03) continue;
      const wade = Math.min(1, depth / 0.5);
      // two legs (perpendicular to facing), stepping alternately
      const f = w.facing ?? 0, sx = Math.cos(f), sz = -Math.sin(f);
      const step = Math.sin(time * (6 + speed * 1.2) + (typeof w.id === 'number' ? w.id : 0));
      const legR = w.r * 0.3;
      const base = 0.45 + speed * 0.55;
      if (speed > 0.25) {
        this.disturb(w.x + sx * legR, w.z + sz * legR, 0.2, base * wade * (0.6 + 0.4 * Math.max(0, step)) * dt * 9);
        this.disturb(w.x - sx * legR, w.z - sz * legR, 0.2, base * wade * (0.6 + 0.4 * Math.max(0, -step)) * dt * 9);
        const strength = Math.min(1, 0.45 + speed * 0.15) * Math.min(1, depth / 0.15);
        for (const side of [1, -1]) this.stampFoam(prev.px + sx * legR * side, prev.pz + sz * legR * side, w.x + sx * legR * side, w.z + sz * legR * side, 0.17 + w.r * 0.08, strength);
      }
      prev.px = w.x; prev.pz = w.z;
      const t = this.splashT.get(w.id) ?? 0;
      if (speed > 2 && time > t) { this.splashT.set(w.id, time + 0.12); splashes.push({ x: w.x, y: level, z: w.z, speed }); }
    }
    for (const id of this.prev.keys()) if (!seen.has(id)) this.prev.delete(id);
    if (this.foamActive) {
      // foam fades over about a second; with the shader's threshold the trail also narrows
      const k = Math.exp(-dt / 0.9), F = this.foam;
      let any = false;
      for (let i = 0; i < F.length; i++) { if (F[i] > 0) { F[i] *= k; if (F[i] < 0.02) F[i] = 0; else any = true; } }
      this.foamActive = any;
      for (let i = 0; i < F.length; i++) this.data[i * 4 + 1] = F[i] * 255;
      this.tex.needsUpdate = true;
    }
    if (this.energy <= 0) return splashes;
    // wave equation (semi-implicit Euler), a couple of sub-steps for stability
    const steps = dt > 1 / 45 ? 2 : 1, h = dt / steps;
    const c2 = (WAVE_SPEED * WAVE_SPEED) / (RCELL * RCELL), damp = Math.exp(-DAMPING * h);
    const H = this.h, V = this.v;
    let energy = 0;
    for (let s = 0; s < steps; s++) {
      for (let iz = 0; iz < RN; iz++) {
        const row = iz * RN, up = ((iz + 1) % RN) * RN, dn = ((iz - 1 + RN) % RN) * RN;
        for (let ix = 0; ix < RN; ix++) {
          const i = row + ix, l = row + ((ix - 1 + RN) % RN), r = row + ((ix + 1) % RN);
          const lap = H[l] + H[r] + H[up + ix] + H[dn + ix] - 4 * H[i];
          V[i] = (V[i] + c2 * lap * h) * damp;
        }
      }
      for (let i = 0; i < H.length; i++) { H[i] += V[i] * h; H[i] *= 0.999; }
    }
    const D = this.data;
    for (let i = 0; i < H.length; i++) {
      const v = H[i];
      energy = Math.max(energy, Math.abs(v), Math.abs(V[i]) * 0.1);
      D[i * 4] = Math.max(0, Math.min(255, 128 + v * 300));
    }
    this.tex.needsUpdate = true;
    if (energy < 0.0015) { this.energy = 0; this.h.fill(0); this.v.fill(0); for (let i = 0; i < H.length; i++) this.data[i * 4] = 128; }
    return splashes;
  }
}
