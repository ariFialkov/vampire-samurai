// Builds detailed characters from many small primitives, then merges everything attached to
// the same bone (group) into a single mesh per material. Lots of detail, few draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Parts {
  constructor() { this.buckets = new Map(); }
  /**
   * @param group  bone (THREE.Group) the piece moves with
   * @param geo    a fresh geometry (consumed)
   * @param color  hex colour
   * @param o      { p:[x,y,z], r:[x,y,z], s:number|[x,y,z], m:'base'|'metal'|'glow', order }
   */
  add(group, geo, color, o = {}) {
    const p = o.p ?? [0, 0, 0], r = o.r ?? [0, 0, 0];
    const s = typeof o.s === 'number' ? [o.s, o.s, o.s] : (o.s ?? [1, 1, 1]);
    _m.compose(_p.set(p[0], p[1], p[2]), _q.setFromEuler(_e.set(r[0], r[1], r[2], o.order ?? 'XYZ')), _s.set(s[0], s[1], s[2]));
    if (!geo.index) { const idx = []; for (let i = 0; i < geo.attributes.position.count; i++) idx.push(i); geo.setIndex(idx); }
    geo.applyMatrix4(_m);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.clearGroups();
    const n = geo.attributes.position.count, col = new Float32Array(n * 3);
    _c.setHex(color);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const key = o.m ?? 'base';
    if (!this.buckets.has(group)) this.buckets.set(group, {});
    const b = this.buckets.get(group);
    (b[key] ??= []).push(geo);
    return geo;
  }
  /** Merge and attach. materials: { base, metal?, glow? } */
  build(materials, castShadow = true) {
    for (const [group, b] of this.buckets) {
      for (const key in b) {
        const mesh = new THREE.Mesh(mergeGeometries(b[key], false), materials[key] ?? materials.base);
        mesh.castShadow = castShadow; mesh.receiveShadow = false;
        group.add(mesh);
      }
    }
    this.buckets.clear();
  }
}

// ---- shape helpers (all return fresh geometries)
export const G = {
  sphere: (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h),
  capsule: (r, len, segs = 12) => new THREE.CapsuleGeometry(r, len, 5, segs),
  box: (w, h, d, sx = 1, sy = 1, sz = 1) => new THREE.BoxGeometry(w, h, d, sx, sy, sz),
  cyl: (rt, rb, h, segs = 14, open = false) => new THREE.CylinderGeometry(rt, rb, h, segs, 1, open),
  cone: (r, h, segs = 12) => new THREE.ConeGeometry(r, h, segs),
  torus: (r, t, arc = Math.PI * 2, rs = 8, ts = 20) => new THREE.TorusGeometry(r, t, rs, ts, arc),
  /** Surface of revolution from [[radius, y], ...] bottom to top. */
  lathe: (prof, segs = 18) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y)), segs),
  /** Tube along points with radius tapering r0 → r1. */
  tube: (pts, r0, r1 = r0, segs = 12, radial = 8) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(curve, segs, 1, radial, false);
    const pos = g.attributes.position, nor = g.attributes.normal;
    // taper: rebuild positions from the curve with interpolated radius
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, c = curve.getPointAt(t), r = r0 + (r1 - r0) * t;
      for (let j = 0; j <= radial; j++) {
        const k = i * (radial + 1) + j;
        pos.setXYZ(k, c.x + nor.getX(k) * r, c.y + nor.getY(k) * r, c.z + nor.getZ(k) * r);
      }
    }
    return g;
  },
};
