// Water: lakes and the flooded rice terraces. Two layers of motion:
//  - wind ripples: a few travelling wavelets layered in the shader, drifting with the breeze
//  - a ripple simulation: a small wave-equation grid around the guardian (toroidal, world
//    locked, like the grass trample map). Legs wading through it push the surface down, the
//    disturbance spreads as rings and, when moving faster than the waves, a V-shaped wake.
// The surface is tinted by depth (clear and teal in the shallows, deep blue-green further
// out), fringed with foam at the shore, crests of the wake whiten, and it reflects the sky
// at grazing angles.
import * as THREE from 'three';
import { MAP_SIZE, MAP_HALF, WATER_LEVEL, PADDY, GRID_N, GRID_CELL } from './terrain.js';
import { wind } from './wind.js';

const RN = 192, RCELL = 0.2, SPAN = RN * RCELL;        // ripple grid: 38.4 m, 20 cm cells
const WAVE_SPEED = 1.6;                                  // m/s
const DAMPING = 0.65;                                    // per second
const MAX_WADERS = 8;

export class Water {
  constructor(world) {
    this.world = world;
    this.h = new Float32Array(RN * RN);
    this.v = new Float32Array(RN * RN);
    this.data = new Uint8Array(RN * RN * 4).fill(128);
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
      uWaders: { value: Array.from({ length: MAX_WADERS }, () => new THREE.Vector4()) },
      uSky: { value: new THREE.Color(0x9fc4e6) }, uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.3) },
    };
    const mat = new THREE.MeshStandardMaterial({ color: 0x3f7f9a, transparent: true, roughness: 0.18, metalness: 0.05, depthWrite: false });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = 'varying vec3 vWorld;\n' + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = /* glsl */`
        varying vec3 vWorld;
        uniform float uTime, uRippleSpan, uRippleTexel, uHalf, uCell, uN, uWindStrength;
        uniform sampler2D uRipple, uHeight;
        uniform vec3 uCenter, uSky, uSunDir;
        uniform vec2 uWindDir;
        uniform vec4 uWaders[${MAX_WADERS}];
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
        // wind wavelets: sum of travelling waves, returns the slope (dh/dx, dh/dz)
        vec2 wWaves(vec2 p) {
          vec2 d0 = uWindDir, d1 = vec2(d0.x * 0.8 - d0.y * 0.6, d0.x * 0.6 + d0.y * 0.8), d2 = vec2(d0.x * 0.8 + d0.y * 0.6, -d0.x * 0.6 + d0.y * 0.8), d3 = vec2(-d0.y, d0.x);
          vec4 k = vec4(2.3, 3.7, 5.9, 9.1), a = vec4(0.03, 0.02, 0.012, 0.007) * (0.5 + uWindStrength);
          vec4 ph = vec4(dot(p, d0) * k.x - uTime * 2.6, dot(p, d1) * k.y - uTime * 3.3, dot(p, d2) * k.z - uTime * 4.1, dot(p, d3) * k.w - uTime * 5.0);
          vec4 c = cos(ph) * a * k;
          return d0 * c.x + d1 * c.y + d2 * c.z + d3 * c.w;
        }
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
          vec2 wSlope = wWaves(vWorld.xz);
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
          // ripple slopes catch the light (rings read even from straight above) and the sun glints
          outgoingLight *= 1.0 + clamp(dot(wRipSlope, vec2(0.55, 0.83)) * 1.9, -0.4, 0.6);
          vec3 wView = normalize(cameraPosition - vWorld);
          float glint = pow(max(dot(reflect(-wView, wN), normalize(uSunDir)), 0.0), 220.0);
          outgoingLight += vec3(1.0, 0.96, 0.85) * glint * 1.4;
          float shore = 1.0 - smoothstep(0.015, 0.07, wDepth);
          float foamN = wNoise(vWorld.xz * 4.0 + vec2(uTime * 0.3, -uTime * 0.2));
          float foam = shore * smoothstep(0.45, 0.8, foamN + shore * 0.3) + smoothstep(0.035, 0.1, abs(wRip)) * 0.55;
          outgoingLight = mix(outgoingLight, vec3(0.92, 0.95, 0.95), clamp(foam, 0.0, 0.85));
          // white water breaking around each wading leg (stronger the faster they move)
          float collar = 0.0;
          for (int i = 0; i < ${MAX_WADERS}; i++) {
            vec4 W = uWaders[i];
            if (W.z <= 0.0) continue;
            float d = length(vWorld.xz - W.xy);
            float ring = smoothstep(W.w * 0.25, W.w * 0.55, d) * (1.0 - smoothstep(W.w * 0.55, W.w * 1.15, d));
            collar += ring * W.z * smoothstep(0.25, 0.75, wNoise(vWorld.xz * 11.0 + vec2(uTime * 2.3, -uTime * 1.7)) + 0.25);
          }
          foam += collar;
          outgoingLight = mix(outgoingLight, vec3(0.94, 0.97, 0.97), clamp(collar, 0.0, 0.8));
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
    const waders = [];
    for (const w of walkers) {
      if (w.log) continue;
      const level = T.waterLevelAt(w.x, w.z), depth = level - T.heightAt(w.x, w.z);
      const prev = this.prev.get(w.id);
      seen.add(w.id);
      if (!prev) { this.prev.set(w.id, { x: w.x, z: w.z }); continue; }
      const speed = Math.min(12, Math.hypot(w.x - prev.x, w.z - prev.z) / Math.max(dt, 1e-3));
      prev.x = w.x; prev.z = w.z;
      if (depth < 0.03) continue;
      const wade = Math.min(1, depth / 0.5);
      // two legs (perpendicular to facing), stepping alternately, plus the body's push
      const f = w.facing ?? 0, sx = Math.cos(f), sz = -Math.sin(f);
      const step = Math.sin(time * (6 + speed * 1.2) + (typeof w.id === 'number' ? w.id : 0));
      const legR = w.r * 0.3;
      const base = 0.45 + speed * 0.55;
      this.disturb(w.x + sx * legR, w.z + sz * legR, 0.2, base * wade * (0.6 + 0.4 * Math.max(0, step)) * dt * 9);
      this.disturb(w.x - sx * legR, w.z - sz * legR, 0.2, base * wade * (0.6 + 0.4 * Math.max(0, -step)) * dt * 9);
      waders.push([Math.hypot(w.x - focus.x, w.z - focus.z), w.x, w.z, Math.min(1, 0.35 + speed * 0.18) * Math.min(1, depth / 0.15), w.r * 0.6 + 0.2]);
      if (speed < 0.3) this.disturb(w.x, w.z, 0.5, Math.abs(Math.sin(time * 1.7)) * 0.4 * dt * wade);   // idle shuffling
      const t = this.splashT.get(w.id) ?? 0;
      if (speed > 2 && time > t) { this.splashT.set(w.id, time + 0.12); splashes.push({ x: w.x, y: level, z: w.z, speed }); }
    }
    for (const id of this.prev.keys()) if (!seen.has(id)) this.prev.delete(id);
    waders.sort((a, b) => a[0] - b[0]);
    this.uniforms.uWaders.value.forEach((u, i) => { const w = waders[i]; if (w) u.set(w[1], w[2], w[3], w[4]); else u.z = 0; });
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
    if (energy < 0.0015) { this.energy = 0; this.h.fill(0); this.v.fill(0); this.data.fill(128); }
    return splashes;
  }
}
