// Shared wind state + vertex-shader injection. Every foliage material calls applyWind()
// so trunks lean, canopies sway in coherent gusts and each leaf flutters on its own phase,
// all on the GPU. Geometries supply two attributes:
//   aFlex  : 0 = rigid (trunk base) .. 1 = free leaf tip
//   aPhase : per-leaf random phase so neighbouring leaves never move in lockstep
import * as THREE from 'three';

export const wind = {
  uniforms: {
    uTime: { value: 0 },
    uWindDir: { value: new THREE.Vector2(0.8, 0.6).normalize() },
    uWindStrength: { value: 0.55 },
  },
  time: 0,
  angle: 0.65,
  update(dt) {
    this.time += dt;
    // Slowly wandering breeze direction and strength (gusty, never static)
    this.angle += Math.sin(this.time * 0.07) * 0.0015;
    const gust = 0.45 + 0.25 * Math.sin(this.time * 0.21) + 0.15 * Math.sin(this.time * 0.53 + 1.3) + 0.08 * Math.sin(this.time * 1.7);
    this.uniforms.uTime.value = this.time;
    this.uniforms.uWindDir.value.set(Math.cos(this.angle), Math.sin(this.angle));
    this.uniforms.uWindStrength.value = gust;
  },
};

const VERT_HEAD = /* glsl */`
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
attribute float aFlex;
attribute float aPhase;
`;

const VERT_BODY = /* glsl */`
#include <begin_vertex>
{
  #ifdef USE_INSTANCING
    vec3 ipos = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #else
    vec3 ipos = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif
  float f = aFlex;
  float f2 = f * f;
  // Large coherent gusts travelling across the map along the wind direction
  float along = dot(ipos.xz, uWindDir);
  float gust = 0.5 + 0.5 * sin(uTime * 0.9 - along * 0.09) ;
  gust = gust * 0.7 + 0.3 * sin(uTime * 1.7 - along * 0.21 + aPhase);
  float sway = (0.35 + 0.65 * gust) * uWindStrength;
  // Whole-canopy sway (bends with height)
  transformed.xz += uWindDir * f2 * sway * WIND_SCALE;
  transformed.y  -= f2 * sway * 0.12 * WIND_SCALE;
  // Individual leaf flutter: fast, small, random phase, perpendicular jitter
  float flutter = sin(uTime * 7.3 + aPhase * 17.0) * 0.6 + sin(uTime * 11.1 + aPhase * 29.0) * 0.4;
  float flutterAmp = FLUTTER_SCALE * (0.25 + 0.75 * gust) * uWindStrength;
  vec2 perp = vec2(-uWindDir.y, uWindDir.x);
  transformed.xz += perp * flutter * flutterAmp * f * f;
  transformed.y  += flutter * flutterAmp * 0.5 * f;
}
`;

/**
 * Inject wind into any MeshStandardMaterial / MeshLambertMaterial.
 * @param {THREE.Material} material
 * @param {{scale?:number, flutter?:number}} opts  scale: canopy sway amplitude (world units at flex 1)
 */
export function applyWind(material, opts = {}) {
  const scale = (opts.scale ?? 0.6).toFixed(3);
  const flutter = (opts.flutter ?? 0.08).toFixed(3);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.uniforms.uTime;
    shader.uniforms.uWindDir = wind.uniforms.uWindDir;
    shader.uniforms.uWindStrength = wind.uniforms.uWindStrength;
    shader.vertexShader = VERT_HEAD + shader.vertexShader.replace(
      '#include <begin_vertex>',
      VERT_BODY.replace(/WIND_SCALE/g, scale).replace(/FLUTTER_SCALE/g, flutter),
    );
  };
  material.customProgramCacheKey = () => `wind:${scale}:${flutter}`;
  return material;
}
