// A soft motion trail behind a blade: a ribbon between the hilt end and the tip, recorded each
// frame while a strike is live and fading out over a fraction of a second. Brightest at the tip,
// transparent toward the hand, so it reads as the arc of the cut rather than a solid shape.
import * as THREE from 'three';

const N = 28;            // samples kept

export class BladeTrail {
  constructor(scene) {
    this.samples = [];   // { a: Vector3 (hilt end), b: Vector3 (tip), age }
    this.life = 0.16;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 2 * 3);
    this.col = new Float32Array(N * 2 * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.color = new THREE.Color(0xf2f6ff);
    scene.add(this.mesh);
  }

  /** emit: record this frame's blade (a = hilt end, b = tip, world space). strength 0..1. */
  update(dt, emit, a, b, strength = 1) {
    for (const s of this.samples) s.age += dt;
    while (this.samples.length && this.samples[0].age > this.life) this.samples.shift();
    if (emit) {
      this.samples.push({ a: a.clone(), b: b.clone(), age: 0, k: strength });
      if (this.samples.length > N) this.samples.shift();
    }
    const n = this.samples.length;
    const g = this.mesh.geometry;
    g.setDrawRange(0, Math.max(0, (n - 1) * 6));
    this.mesh.visible = n > 1;
    if (n < 2) return;
    const c = this.color;
    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      const fade = Math.pow(Math.max(0, 1 - s.age / this.life), 1.6) * (i / (n - 1)) ** 0.5 * s.k;
      this.pos.set([s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z], i * 6);
      this.col.set([c.r, c.g, c.b, 0, c.r, c.g, c.b, 0.55 * fade], i * 8);
    }
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }

  clear() { this.samples.length = 0; this.mesh.visible = false; }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
