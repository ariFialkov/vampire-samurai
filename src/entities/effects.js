// Lightweight particle pool (one InstancedMesh) + timed debris (bone piles, clothes, etc.)
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Effects {
  constructor(scene, max = 1500) {
    this.scene = scene;
    this.max = max;
    const geo = new THREE.SphereGeometry(0.08, 6, 5);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    scene.add(this.mesh);
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max); this.grav = new Float32Array(max); this.col = new Float32Array(max * 3);
    this.head = 0;
    this.debris = [];
    this.time = 0;
  }
  /** Emit a burst. opts: count, color (hex or [hex..]), speed, life, size, gravity, up, spread */
  burst(pos, opts = {}) {
    const { count = 12, color = 0xffffff, speed = 3, life = 0.7, size = 1, gravity = 6, up = 1, spread = 1 } = opts;
    for (let k = 0; k < count; k++) {
      const i = this.head; this.head = (this.head + 1) % this.max;
      this.p[i * 3] = pos.x + (Math.random() - 0.5) * spread * 0.4; this.p[i * 3 + 1] = pos.y + (Math.random() - 0.5) * spread * 0.4; this.p[i * 3 + 2] = pos.z + (Math.random() - 0.5) * spread * 0.4;
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI;
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.v[i * 3] = Math.cos(a) * Math.cos(e) * sp; this.v[i * 3 + 1] = Math.sin(e) * sp * up + speed * 0.3 * up; this.v[i * 3 + 2] = Math.sin(a) * Math.cos(e) * sp;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.8);
      this.size[i] = size * (0.6 + Math.random() * 0.9); this.grav[i] = gravity;
      _c.setHex(Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color);
      this.col[i * 3] = _c.r; this.col[i * 3 + 1] = _c.g; this.col[i * 3 + 2] = _c.b;
    }
  }
  /** Leave a mesh in the world for `seconds`, with optional per-frame updater and fade. */
  leave(mesh, seconds, onUpdate) {
    this.scene.add(mesh);
    this.debris.push({ mesh, t: 0, ttl: seconds, onUpdate });
  }
  update(dt) {
    this.time += dt;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { _m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, _m); continue; }
      this.life[i] -= dt;
      this.v[i * 3 + 1] -= this.grav[i] * dt;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      const s = this.size[i] * (0.3 + 0.7 * t);
      _m.compose(_v.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]), _q.identity(), _s.set(s, s, s));
      this.mesh.setMatrixAt(i, _m);
      this.mesh.setColorAt(i, _c.setRGB(this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.t += dt;
      if (d.onUpdate) d.onUpdate(d.t, dt, d.mesh);
      if (d.t > d.ttl - 1.5) d.mesh.traverse((o) => { if (o.material && !o.material.userData.keepOpacity) { o.material.transparent = true; o.material.opacity = Math.max(0, (d.ttl - d.t) / 1.5); } });
      if (d.t >= d.ttl) { this.scene.remove(d.mesh); d.mesh.traverse((o) => { if (o.material && o.material.userData.owned) o.material.dispose(); }); this.debris.splice(i, 1); }
    }
  }
}
