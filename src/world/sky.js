// Lighting and sky. Day: warm sun, pale blue gradient sky, soft fog. Night (demon waves):
// the sun drops in seconds, the sky turns to indigo moonlight and the temple candles light.
import * as THREE from 'three';

export class Sky {
  constructor(scene, renderer, shadows, mapSize = 2048) {
    this.scene = scene;
    this.night = 0;          // 0 = full day, 1 = full night
    this.targetNight = 0;
    this.time = 0;
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5c6b3a, 0.9);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    this.sun.position.set(60, 90, 30);
    this.sun.castShadow = shadows;
    const s = this.sun.shadow;
    s.mapSize.set(mapSize, mapSize);
    s.camera.near = 20; s.camera.far = 260;
    this.shadowHalf = 0;
    this.setShadowHalf(40);
    s.bias = -0.0004; s.normalBias = 0.04;
    this._snap = { right: new THREE.Vector3(), up: new THREE.Vector3(), fwd: new THREE.Vector3(), p: new THREE.Vector3() };
    scene.add(this.sun); scene.add(this.sun.target);
    this.moon = new THREE.DirectionalLight(0x9fb4ff, 0);
    this.moon.position.set(-50, 80, -40);
    scene.add(this.moon); scene.add(this.moon.target);
    this.fog = new THREE.Fog(0xcfe0ee, 120, 330);
    scene.fog = this.fog;

    // Gradient sky dome
    this.uniforms = {
      uTop: { value: new THREE.Color(0x5e9bd6) }, uHorizon: { value: new THREE.Color(0xdfeaf2) },
      uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3).normalize() }, uNight: { value: 0 }, uTime: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 uTop, uHorizon, uSunDir; uniform float uNight, uTime; varying vec3 vDir;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
        void main(){
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 day = mix(uHorizon, uTop, pow(h, 0.55));
          float sun = pow(max(dot(vDir, uSunDir), 0.0), 350.0);
          float halo = pow(max(dot(vDir, uSunDir), 0.0), 8.0) * 0.25;
          day += vec3(1.0, 0.92, 0.75) * (sun * 1.6 + halo);
          // soft clouds
          float c = sin(vDir.x * 9.0 + uTime * 0.02) * sin(vDir.z * 7.0 - uTime * 0.015) * sin(vDir.y * 20.0);
          c = smoothstep(0.35, 0.75, c) * smoothstep(0.02, 0.25, h) * 0.5;
          day = mix(day, vec3(1.0), c);
          vec3 nightTop = vec3(0.03, 0.04, 0.10), nightHor = vec3(0.16, 0.14, 0.26);
          vec3 night = mix(nightHor, nightTop, pow(h, 0.6));
          vec3 moonDir = normalize(vec3(-0.5, 0.8, -0.4));
          float moon = pow(max(dot(vDir, moonDir), 0.0), 900.0) * 2.5 + pow(max(dot(vDir, moonDir), 0.0), 20.0) * 0.15;
          night += vec3(0.75, 0.8, 1.0) * moon;
          float star = step(0.9985, hash(floor(vDir * 180.0))) * h;
          night += star * 0.8;
          float dusk = smoothstep(0.0, 0.5, uNight) * (1.0 - smoothstep(0.5, 1.0, uNight));
          vec3 col = mix(day, night, uNight) + vec3(0.6, 0.2, 0.05) * dusk * pow(1.0 - h, 3.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), skyMat);
    this.dome.frustumCulled = false;
    scene.add(this.dome);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
  }

  setNight(on) { this.targetNight = on ? 1 : 0; }

  /** Size of the shadowed area around the player (grows when the camera zooms out). */
  setShadowHalf(h) {
    if (h === this.shadowHalf) return;
    this.shadowHalf = h;
    const c = this.sun.shadow.camera;
    c.left = -h; c.right = h; c.top = h; c.bottom = -h;
    c.updateProjectionMatrix();
  }

  update(dt, focus, shadowHalf) {
    if (shadowHalf) this.setShadowHalf(shadowHalf);
    this.time += dt;
    // The sun "mysteriously sets" over ~4s when a demon wave starts, and rises back after.
    const speed = this.targetNight > this.night ? 0.28 : 0.12;
    this.night = THREE.MathUtils.damp(this.night, this.targetNight, speed * 8, dt);
    if (Math.abs(this.night - this.targetNight) < 1e-3) this.night = this.targetNight;   // settle exactly (keeps shadows still)
    const n = this.night;
    const sunElev = THREE.MathUtils.lerp(0.95, -0.2, n);
    const sunDir = new THREE.Vector3(0.55, sunElev, 0.35).normalize();
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uNight.value = n;
    this.uniforms.uTime.value = this.time;
    this.sun.intensity = Math.max(0, 2.4 * (1 - n * 1.4));
    this.sun.color.setRGB(1, THREE.MathUtils.lerp(0.95, 0.6, n), THREE.MathUtils.lerp(0.84, 0.35, n));
    this.moon.intensity = 1.1 * n;
    this.hemi.intensity = THREE.MathUtils.lerp(0.9, 0.4, n);
    this.hemi.color.setRGB(THREE.MathUtils.lerp(0.81, 0.45, n), THREE.MathUtils.lerp(0.9, 0.5, n), THREE.MathUtils.lerp(1, 0.8, n));
    this.fog.color.setRGB(THREE.MathUtils.lerp(0.81, 0.05, n), THREE.MathUtils.lerp(0.88, 0.06, n), THREE.MathUtils.lerp(0.93, 0.12, n));
    this.fog.near = THREE.MathUtils.lerp(120, 40, n); this.fog.far = THREE.MathUtils.lerp(330, 170, n);
    this.scene.background = this.fog.color;
    // Shadow camera follows the player, snapped to whole shadow-map texels in light space
    // so the shadows don't crawl or shimmer as you move.
    if (focus) {
      const S = this._snap;
      S.fwd.copy(sunDir).negate();
      S.right.crossVectors(S.fwd, new THREE.Vector3(0, 1, 0)).normalize();
      S.up.crossVectors(S.right, S.fwd).normalize();
      const texel = (2 * this.shadowHalf) / this.sun.shadow.mapSize.x;
      const px = focus.dot(S.right), py = focus.dot(S.up);
      S.p.copy(focus)
        .addScaledVector(S.right, Math.round(px / texel) * texel - px)
        .addScaledVector(S.up, Math.round(py / texel) * texel - py);
      this.sun.position.copy(S.p).addScaledVector(sunDir, 120);
      this.sun.target.position.copy(S.p);
      this.dome.position.copy(focus);
      this.moon.position.set(focus.x - 50, focus.y + 80, focus.z - 40);
      this.moon.target.position.copy(focus);
    }
  }
}
