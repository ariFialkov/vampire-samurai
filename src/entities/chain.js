// Kusarigama chain: a Verlet rope pinned to the handle (and, while thrown, to the flying
// sickle), rendered as interlocking oval links spaced along its curve. At rest it hangs from
// the handle with its weight swinging; when lashed out it pays out behind the sickle, sags
// under gravity, and reels back in as the sickle returns.
import * as THREE from 'three';

const N = 28;                 // simulated points
const LINK = 0.07;            // spacing of rendered links (m)
const MAX_LINKS = 170;
const REST_LEN = 0.55;        // hanging length when the sickle is in hand
const _a = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _r = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1);
const X = new THREE.Vector3(1, 0, 0);

export class Chain {
  constructor(scene, groundAt) {
    this.scene = scene; this.groundAt = groundAt;
    const geo = new THREE.TorusGeometry(0.02, 0.0065, 5, 10);
    geo.scale(1.5, 1, 1);                      // oval links along +x
    const mat = new THREE.MeshStandardMaterial({ color: 0x6a6f78, metalness: 0.55, roughness: 0.4 });
    this.links = new THREE.InstancedMesh(geo, mat, MAX_LINKS);
    this.links.castShadow = true; this.links.frustumCulled = false; this.links.count = 0;
    this.weight = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat);
    this.weight.castShadow = true;
    scene.add(this.links); scene.add(this.weight);
    this.p = Array.from({ length: N }, () => new THREE.Vector3());
    this.o = Array.from({ length: N }, () => new THREE.Vector3());
    this.len = REST_LEN;
    this.ready = false;
    this.visible = true;
  }

  setVisible(v) { this.visible = v; this.links.visible = v; this.weight.visible = v; }
  dispose() { this.scene.remove(this.links); this.scene.remove(this.weight); }

  reset(start) {
    for (let i = 0; i < N; i++) { this.p[i].set(start.x, start.y - (i / (N - 1)) * this.len, start.z); this.o[i].copy(this.p[i]); }
    this.ready = true;
  }

  /** start: handle end (world); end: flying sickle position or null when it's in hand. */
  update(dt, start, end) {
    if (!this.visible) return;
    if (!this.ready || this.p[0].distanceTo(start) > 4) this.reset(start);
    // pay out instantly behind the sickle, reel in smoothly when it comes home
    const want = end ? Math.max(REST_LEN, start.distanceTo(end) * 1.05) : REST_LEN;
    this.len = want > this.len ? want : THREE.MathUtils.damp(this.len, want, 9, dt);
    const seg = this.len / (N - 1);
    const steps = 2, h = Math.min(dt, 1 / 30) / steps;
    for (let s = 0; s < steps; s++) {
      for (let i = 1; i < N; i++) {
        const p = this.p[i], o = this.o[i];
        _a.subVectors(p, o).multiplyScalar(0.985);
        o.copy(p);
        p.add(_a); p.y -= 9.8 * h * h;
      }
      for (let it = 0; it < 10; it++) {
        this.p[0].copy(start);
        if (end) this.p[N - 1].copy(end);
        for (let i = 0; i < N - 1; i++) {
          const a = this.p[i], b = this.p[i + 1];
          _d.subVectors(b, a);
          const d = _d.length() || 1e-6, diff = (d - seg) / d;
          const fa = i === 0 ? 0 : 0.5, fb = i + 1 === N - 1 && end ? 0 : (i === 0 ? 1 : 0.5);
          a.addScaledVector(_d, diff * fa);
          b.addScaledVector(_d, -diff * fb);
        }
      }
      for (let i = 1; i < N; i++) { const g = this.groundAt(this.p[i].x, this.p[i].z) + 0.02; if (this.p[i].y < g) this.p[i].y = g; }
    }
    // links every LINK metres along the curve, alternately rolled 90 degrees so they interlock
    let k = 0, carry = 0;
    for (let i = 0; i < N - 1 && k < MAX_LINKS; i++) {
      const a = this.p[i], b = this.p[i + 1];
      _d.subVectors(b, a);
      const L = _d.length();
      if (L < 1e-5) continue;
      _d.divideScalar(L);
      _q.setFromUnitVectors(X, _d);
      let t = carry;
      while (t < L && k < MAX_LINKS) {
        _a.copy(a).addScaledVector(_d, t);
        _r.setFromAxisAngle(X, k % 2 ? Math.PI / 2 : 0);
        _m.compose(_a, _r.premultiply(_q), _s);
        this.links.setMatrixAt(k++, _m);
        t += LINK;
      }
      carry = t - L;
    }
    this.links.count = k;
    this.links.instanceMatrix.needsUpdate = true;
    this.weight.visible = !end;
    this.weight.position.copy(this.p[N - 1]);
  }
}
