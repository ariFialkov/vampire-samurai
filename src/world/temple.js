// The temple ruins on the central hill: a two-tier paved stone platform reached by steps,
// weathered vermilion pillars on stone plinths (some broken, two toppled), the remains of the
// main hall's gate with a fragment of tiled roof, earthen walls, a central altar, stone
// lanterns that light when demons come, a torii gate and a stepping-stone path downhill.
// Every piece registers its real footprint and top height with the world's solids, so what
// looks walkable is walkable and what looks solid blocks you.
import * as THREE from 'three';
import { stoneTexture, pavingTexture, lacquerTexture, roofTileTexture, plasterTexture } from './textures.js';

export const TEMPLE = { R1: 22, H1: 0.9, R2: 12.5, H2: 0.6 };
/** Centre line of the stepping-stone path from the south steps down the hill. */
export const TEMPLE_PATH = [[0, 23.5], [0.4, 31], [1.4, 38], [-0.8, 46], [-2.4, 55], [0.4, 64], [2, 74], [-1, 84]];

function texMat(tex, rx, ry, opts = {}) {
  const t = tex.clone(); t.repeat.set(rx, ry); t.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92, metalness: 0, ...opts });
}
const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

/** Bend a box's vertices upward toward its ends (the curve of a torii lintel / roof eave). */
function bendUp(geo, amount, halfLen) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / halfLen; p.setY(i, p.getY(i) + amount * x * x * x * x); }
  geo.computeVertexNormals();
  return geo;
}

export function buildTemple(terrain, rng, solids) {
  const group = new THREE.Group();
  group.name = 'temple';
  const lanterns = [];
  const base = terrain.templeY;
  const T1 = base + TEMPLE.H1, T2 = T1 + TEMPLE.H2;

  const stone = texMat(stoneTexture(), 2, 1);
  const stoneMossy = texMat(stoneTexture(true), 2, 1);
  const stoneDark = texMat(stoneTexture(), 1, 1, { color: 0x8a8780 });
  const lacquer = texMat(lacquerTexture(), 1, 2, { roughness: 0.7 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1d1a18, roughness: 0.6 });
  const roof = texMat(roofTileTexture(), 3, 2, { roughness: 0.65, side: THREE.DoubleSide });
  const plaster = texMat(plasterTexture(), 1, 0.6);
  const bronze = new THREE.MeshStandardMaterial({ color: 0x5d4a2e, metalness: 0.7, roughness: 0.45 });

  const add = (mesh) => { group.add(shadowed(mesh)); return mesh; };
  /** Add a box-shaped solid matching a (y-rotated) mesh. */
  const boxSolid = (mesh, hx, hz, top, bottom) => solids.addBox(mesh.position.x, mesh.position.z, hx, hz, -mesh.rotation.y, top, bottom);

  // ---------------------------------------------------------------- platform tiers
  const tier = (R, H, y0, mossy) => {
    const prof = [[R + 0.35, -0.8], [R + 0.3, 0], [R + 0.12, H * 0.45], [R + 0.02, H - 0.12], [R - 0.12, H]].map(([r, y]) => new THREE.Vector2(r, y));
    const side = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), texMat(stoneTexture(mossy), R * 1.2, 0.4));
    side.position.y = y0; add(side);
    const top = new THREE.Mesh(new THREE.CircleGeometry(R - 0.12, 96), texMat(pavingTexture(), R / 2.6, R / 2.6));
    top.rotation.x = -Math.PI / 2; top.position.y = y0 + H + 0.002; top.receiveShadow = true;
    group.add(top);
    solids.addCircle(0, 0, R, y0 + H);
  };
  tier(TEMPLE.R1, TEMPLE.H1, base, true);
  tier(TEMPLE.R2, TEMPLE.H2, T1, false);

  // ---------------------------------------------------------------- steps
  const steps = (R, y0, tops, angles, width) => {
    for (const a of angles) {
      tops.forEach((top, k) => {
        const depth = 1.05, r = R + 0.45 + k * depth;
        const h = top - (y0 - 0.8);
        const step = new THREE.Mesh(new THREE.BoxGeometry(width - k * 0.3, h, depth + 0.05), stone);
        step.position.set(Math.cos(a) * r, y0 - 0.8 + h / 2, Math.sin(a) * r);
        step.rotation.y = -(a + Math.PI / 2);
        add(step);
        boxSolid(step, (width - k * 0.3) / 2, depth / 2 + 0.03, top);
      });
      // low stone cheek walls either side of each flight
      for (const s of [-1, 1]) {
        const off = width / 2 + 0.3, len = tops.length * 1.05 + 0.6;
        const tx = -Math.sin(a) * off * s, tz = Math.cos(a) * off * s;
        const r = R + 0.2 + len / 2;
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.55, (tops[0] - y0) + 1.2, len), stoneMossy);
        cheek.position.set(Math.cos(a) * r + tx, y0 + (tops[0] - y0) / 2 - 0.3 + 0.3, Math.sin(a) * r + tz);
        cheek.rotation.y = Math.PI / 2 - a;
        add(cheek);
        boxSolid(cheek, 0.275, len / 2, cheek.position.y + cheek.geometry.parameters.height / 2);
      }
    }
  };
  steps(TEMPLE.R1, base, [base + 0.6, base + 0.3], [0, Math.PI / 2, Math.PI, -Math.PI / 2], 7);
  steps(TEMPLE.R2, T1, [T1 + 0.3], [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4], 4.5);

  // ---------------------------------------------------------------- pillars
  // closed cylinder with gentle entasis; broken ones get a splintered top showing bare wood
  const pillarGeo = (h, broken) => {
    const g = new THREE.CylinderGeometry(0.47, 0.5, h, 20, 6, false);
    g.translate(0, h / 2, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), t = y / h;
      const k = 1 + 0.05 * Math.sin(t * Math.PI);
      p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
      if (broken && y > h - 0.001) {
        const a = Math.atan2(p.getZ(i), p.getX(i)), r = Math.hypot(p.getX(i), p.getZ(i));
        const jag = (Math.abs(Math.sin(a * 3.0 + h)) * 0.35 + Math.abs(Math.sin(a * 7.0)) * 0.12) * (r > 0.01 ? 1 : 0.5);
        p.setY(i, y - jag);
      }
    }
    g.computeVertexNormals();
    return g;
  };
  const bareWood = new THREE.MeshStandardMaterial({ color: 0x8a7258, roughness: 0.95 });
  const pillarMats = [lacquer, bareWood, bareWood];
  const pillarAt = (x, z, h, broken) => {
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.95, 0.4, 10), stoneDark);
    plinth.position.set(x, T2 + 0.2, z); add(plinth);
    solids.addCircle(x, z, 0.92, T2 + 0.4);
    const p = new THREE.Mesh(pillarGeo(h, broken), broken ? pillarMats : lacquer);
    p.position.set(x, T2 + 0.4, z); p.rotation.y = rng.float(0, 6); add(p);
    if (!broken) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.35, 1.15), black);
      cap.position.set(x, T2 + 0.4 + h + 0.17, z); add(cap);
    }
    solids.addCircle(x, z, 0.55, T2 + 0.4 + h);
  };
  const ringR = 9.6;
  const pillarAngles = [];
  for (let i = 0; i < 12; i++) pillarAngles.push((i / 12) * Math.PI * 2 + Math.PI / 12);
  const gateIdx = [8, 9]; // the two pillars flanking north (angle ~ -90deg) stand tall and carry the hall gate
  pillarAngles.forEach((a, i) => {
    const x = Math.cos(a) * ringR, z = Math.sin(a) * ringR;
    if (i === 3 || i === 11) return;                 // these two lie toppled (below)
    if (gateIdx.includes(i)) return pillarAt(x, z, 7.2, false);
    const broken = rng.chance(0.55);
    pillarAt(x, z, broken ? rng.float(1.1, 3.6) : rng.float(5.4, 6.6), broken);
  });
  // gate of the main hall: tie beam, bracket blocks and a fragment of the tiled eave
  {
    const [a1, a2] = [pillarAngles[8], pillarAngles[9]];
    const p1 = new THREE.Vector3(Math.cos(a1) * ringR, 0, Math.sin(a1) * ringR), p2 = new THREE.Vector3(Math.cos(a2) * ringR, 0, Math.sin(a2) * ringR);
    const mid = p1.clone().add(p2).multiplyScalar(0.5), span = p1.distanceTo(p2);
    const ang = Math.atan2(p2.z - p1.z, p2.x - p1.x);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 1.4, 0.45, 0.42), lacquer);
    beam.position.set(mid.x, T2 + 0.4 + 6.1, mid.z); beam.rotation.y = -ang; add(beam);
    const head = new THREE.Mesh(new THREE.BoxGeometry(span + 2.2, 0.32, 0.9), black);
    head.position.set(mid.x, T2 + 0.4 + 7.55, mid.z); head.rotation.y = -ang; add(head);
    const eaveGeo = bendUp(new THREE.PlaneGeometry(span + 6, 4.5, 24, 6), 0.0, 1);
    const ep = eaveGeo.attributes.position;
    for (let i = 0; i < ep.count; i++) {
      const x = ep.getX(i) / ((span + 6) / 2), yv = ep.getY(i);
      ep.setZ(i, 0.55 * x * x * x * x + (yv + 2.25) * (yv + 2.25) * 0.04);
    }
    eaveGeo.computeVertexNormals();
    const eave = new THREE.Mesh(eaveGeo, roof);
    eave.rotation.order = 'YXZ';
    eave.rotation.y = -ang; eave.rotation.x = -Math.PI / 2 + 0.42;
    eave.position.set(mid.x * 1.05, T2 + 0.4 + 8.25, mid.z * 1.05);
    add(eave);
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, span + 5.4, 10), black);
    ridge.rotation.z = Math.PI / 2; ridge.rotation.y = -ang;
    ridge.position.set(mid.x * 1.12, T2 + 0.4 + 9.15, mid.z * 1.12); add(ridge);
  }
  // toppled pillars, cracked into two pieces
  for (const i of [3, 11]) {
    const a = pillarAngles[i];
    const x = Math.cos(a) * ringR, z = Math.sin(a) * ringR;
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.95, 0.4, 10), stoneDark);
    plinth.position.set(x, T2 + 0.2, z); add(plinth); solids.addCircle(x, z, 0.92, T2 + 0.4);
    const dir = a + Math.PI / 2 + rng.float(-0.4, 0.4);
    let along = 1.2;
    for (const len of [2.6, 3.2]) {
      const piece = new THREE.Mesh(pillarGeo(len, true), pillarMats);
      piece.rotation.order = 'YXZ'; piece.rotation.y = -dir; piece.rotation.z = -Math.PI / 2;
      const cx = x + Math.cos(dir) * along, cz = z + Math.sin(dir) * along;
      piece.position.set(cx, T2 + 0.47, cz);
      add(piece);
      const mx = cx + Math.cos(dir) * len / 2, mz = cz + Math.sin(dir) * len / 2;
      solids.addBox(mx, mz, len / 2, 0.5, dir, T2 + 0.97);
      along += len + 0.35;
    }
  }

  // ---------------------------------------------------------------- central altar, burner, Jizō
  {
    const dais = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.7, 2.4), stoneMossy);
    dais.position.set(0, T2 + 0.35, -1.2); add(dais); boxSolid(dais, 1.8, 1.2, T2 + 0.7);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.12, 2.7), stoneDark);
    top.position.set(0, T2 + 0.76, -1.2); add(top);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bronze);
    bowl.scale.y = 0.75; bowl.position.set(0.9, T2 + 1.15, -1.2); add(bowl);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 24), bronze);
    rim.rotation.x = Math.PI / 2; rim.position.set(0.9, T2 + 1.15, -1.2); add(rim);
    for (let k = 0; k < 3; k++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.36, 6), bronze); const la = k * 2.09; leg.position.set(0.9 + Math.cos(la) * 0.28, T2 + 0.97, -1.2 + Math.sin(la) * 0.28); add(leg); }
    // weathered Jizō statue with a faded red bib
    const jz = new THREE.Group(); jz.position.set(-0.7, T2 + 0.82, -1.3);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.55, 6, 14), stone); body.position.y = 0.55; jz.add(body);
    const headJ = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), stone); headJ.position.y = 1.2; jz.add(headJ);
    const bib = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 16, 1, true, -1.2, 2.4), new THREE.MeshStandardMaterial({ color: 0xa83a2c, roughness: 0.9, side: THREE.DoubleSide }));
    bib.position.y = 0.82; jz.add(bib);
    jz.traverse((o) => o.isMesh && shadowed(o)); group.add(jz);
  }

  // ---------------------------------------------------------------- ruined earthen walls (dobei)
  for (const [a, r, len, h] of [[0.55, 17.5, 6, 1.9], [1.25, 18, 4, 1.3], [2.4, 17.2, 5.5, 2.1], [3.6, 18.2, 3.5, 1.1], [4.3, 17.6, 6.5, 1.8], [5.55, 18, 4.5, 1.5]]) {
    const wall = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, h, 0.7), plaster); body.position.y = h / 2; wall.add(body);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(len + 0.2, 0.35, 0.9), stoneDark); foot.position.y = 0.17; wall.add(foot);
    const capGeo = bendUp(new THREE.BoxGeometry(len + 0.5, 0.18, 1.15, 12, 1, 1), 0.12, (len + 0.5) / 2);
    const cap = new THREE.Mesh(capGeo, roof); cap.position.y = h + 0.09; wall.add(cap);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(len + 0.3, 0.16, 0.28), black); ridge.position.y = h + 0.24; wall.add(ridge);
    wall.position.set(Math.cos(a) * r, T1, Math.sin(a) * r);
    wall.rotation.y = -a + Math.PI / 2;
    wall.traverse((o) => o.isMesh && shadowed(o)); group.add(wall);
    solids.addBox(wall.position.x, wall.position.z, (len + 0.5) / 2, 0.58, a - Math.PI / 2, T1 + h + 0.3);
  }

  // ---------------------------------------------------------------- fallen roof section on the east terrace
  {
    const g = new THREE.PlaneGeometry(7, 4.2, 14, 6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) / 3.5; p.setZ(i, 0.35 * x * x * x * x + Math.sin(p.getY(i) * 0.9) * 0.08); }
    g.computeVertexNormals();
    const slab = new THREE.Mesh(g, roof);
    slab.rotation.order = 'YXZ';
    slab.rotation.y = -0.6; slab.rotation.x = -Math.PI / 2 + 0.28;
    slab.position.set(15.6, T1 + 0.75, -5.2);
    add(slab);
    solids.addBox(15.6, -5.2, 3.5, 2.0, 0.6, T1 + 1.4);
    for (let k = 0; k < 9; k++) {                      // scattered broken tiles
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 8, 1, true, 0, Math.PI), roof);
      t.rotation.set(Math.PI / 2, rng.float(0, 6), 0);
      t.position.set(15.6 + rng.float(-4, 4), T1 + 0.08, -5.2 + rng.float(-3.5, 3.5));
      add(t);
    }
  }

  // ---------------------------------------------------------------- torii gate (south, at the top of the path)
  {
    const tz = 27.5, ty = terrain.heightAt(0, tz);
    const torii = new THREE.Group(); torii.position.set(0, ty, tz);
    for (const sx of [-2.7, 2.7]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 6.4, 20), lacquer); post.position.set(sx, 3.2, 0); torii.add(post);
      const kamaki = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.55, 20), black); kamaki.position.set(sx, 0.27, 0); torii.add(kamaki);
      const daiwa = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 8, 20), black); daiwa.rotation.x = Math.PI / 2; daiwa.position.set(sx, 5.55, 0); torii.add(daiwa);
      solids.addCircle(sx, tz, 0.45, Infinity);
    }
    const kasagi = new THREE.Mesh(bendUp(new THREE.BoxGeometry(8.8, 0.36, 0.78, 24, 1, 1), 0.45, 4.4), black); kasagi.position.y = 6.62; torii.add(kasagi);
    const shimaki = new THREE.Mesh(bendUp(new THREE.BoxGeometry(8.2, 0.3, 0.62, 24, 1, 1), 0.38, 4.1), lacquer); shimaki.position.y = 6.3; torii.add(shimaki);
    const nuki = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.34, 0.36), lacquer); nuki.position.y = 5.0; torii.add(nuki);
    const gaku = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.1, 0.3), lacquer); gaku.position.y = 5.65; torii.add(gaku);
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.95, 0.12), black); plaque.position.set(0, 5.65, 0.2); torii.add(plaque);
    torii.traverse((o) => o.isMesh && shadowed(o)); group.add(torii);
  }

  // ---------------------------------------------------------------- stone lanterns (tōrō)
  const lanternMeshes = (() => {
    const L = new THREE.Group();
    const parts = [
      [new THREE.CylinderGeometry(0.55, 0.62, 0.22, 6), 0.11, stoneDark],     // kiso
      [new THREE.CylinderGeometry(0.19, 0.24, 1.3, 12), 0.87, stone],        // sao
      [new THREE.CylinderGeometry(0.5, 0.3, 0.22, 6), 1.62, stoneDark],       // chūdai
      [new THREE.ConeGeometry(0.85, 0.48, 6), 2.42, stoneDark],               // kasa
      [new THREE.CylinderGeometry(0.13, 0.17, 0.14, 8), 2.72, stone],        // ukebana
      [new THREE.SphereGeometry(0.15, 12, 10), 2.88, stone],                  // hōju
    ];
    for (const [geo, y, m] of parts) { const mesh = new THREE.Mesh(geo, m); mesh.position.y = y; mesh.rotation.y = Math.PI / 6; L.add(shadowed(mesh)); }
    // fire box: four corner posts and paper windows
    for (let k = 0; k < 4; k++) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), stoneDark); const a = Math.PI / 4 + k * Math.PI / 2; post.position.set(Math.cos(a) * 0.3, 1.97, Math.sin(a) * 0.3); L.add(shadowed(post)); }
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), new THREE.MeshStandardMaterial({ color: 0xf2e2b8, roughness: 0.6, emissive: 0x000000 }));
    paper.position.y = 1.97; L.add(paper);
    return { L, paper };
  });
  const spots = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; spots.push([Math.cos(a) * 18.8, Math.sin(a) * 18.8, T1]); }
  for (const [x, z] of [[-3.4, 31], [3.6, 31.5], [-3.2, 38], [4.2, 38.5]]) spots.push([x, z, terrain.heightAt(x, z)]);
  for (const [x, z, y] of spots) {
    const { L, paper } = lanternMeshes();
    L.position.set(x, y, z); L.rotation.y = Math.atan2(x, z);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0 }));
    flame.position.y = 1.95; L.add(flame);
    group.add(L);
    solids.addCircle(x, z, 0.6, y + 3.0);
    lanterns.push({ group: L, paper, flame, phase: rng.float(0, 10) });
  }
  // A few shared candle lights (cheaper than one per lantern)
  const lights = [];
  for (const [x, z, y] of [[13.3, 13.3, T1], [-13.3, 13.3, T1], [13.3, -13.3, T1], [-13.3, -13.3, T1], [0, 34.5, terrain.heightAt(0, 34.5)]]) {
    const l = new THREE.PointLight(0xffa242, 0, 26, 1.4); l.position.set(x, y + 2.2, z); group.add(l); lights.push({ light: l, phase: rng.float(0, 10) });
  }

  // ---------------------------------------------------------------- stepping-stone path down the hill
  {
    const g = new THREE.CylinderGeometry(0.5, 0.56, 0.18, 9);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 0.82 + 0.3 * Math.abs(Math.sin(i * 12.9898)); if (Math.abs(p.getY(i)) < 0.5) { p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * (0.75 + 0.25 * k)); } }
    g.computeVertexNormals();
    const pts = [];
    for (let i = 0; i < TEMPLE_PATH.length - 1; i++) {
      const [ax, az] = TEMPLE_PATH[i], [bx, bz] = TEMPLE_PATH[i + 1];
      const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 1.15);
      for (let k = 0; k < n; k++) { const t = k / n; pts.push([ax + (bx - ax) * t, az + (bz - az) * t, Math.atan2(bz - az, bx - ax)]); }
    }
    const inst = new THREE.InstancedMesh(g, texMat(stoneTexture(true), 0.6, 0.6), pts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    pts.forEach(([x, z, a], i) => {
      const side = (i % 2 ? 1 : -1) * 0.35;
      const px = x - Math.sin(a) * side, pz = z + Math.cos(a) * side;
      const n = terrain.normalAt(px, pz);
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.float(0, 6)));
      const s = rng.float(0.85, 1.15);
      m.compose(v.set(px, terrain.heightAt(px, pz) + 0.02, pz), q, sc.set(s, 1, s));
      inst.setMatrixAt(i, m);
    });
    inst.receiveShadow = true;
    group.add(inst);
  }

  group.userData.lanterns = lanterns;
  group.userData.lights = lights;
  return group;
}

/** Drive candle flicker / lighting state. lit in [0,1]. */
export function updateLanterns(temple, lit, t) {
  for (const L of temple.userData.lanterns) {
    const flicker = lit * (0.78 + 0.22 * Math.sin(t * 11 + L.phase) * Math.sin(t * 7.3 + L.phase * 2));
    L.flame.material.opacity = lit;
    L.flame.scale.setScalar(0.8 + 0.3 * flicker);
    L.paper.material.emissive.setRGB(1.0 * flicker, 0.55 * flicker, 0.2 * flicker);
    L.paper.material.emissiveIntensity = 1.3;
  }
  for (const L of temple.userData.lights) L.light.intensity = lit * 9 * (0.82 + 0.18 * Math.sin(t * 9 + L.phase) * Math.sin(t * 5.1 + L.phase));
}

/** Boulders scattered on slopes and two cave mouths dug into hillsides. */
export function buildRocks(terrain, rng, caves, solids) {
  const group = new THREE.Group();
  group.name = 'rocks';
  const mat = new THREE.MeshStandardMaterial({ map: stoneTexture(true), roughness: 0.95, vertexColors: true });
  const variants = [0, 1, 2].map((v) => {
    const geo = new THREE.IcosahedronGeometry(1, 3);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3);
    const f = [rng.float(0.8, 1.3), rng.float(0.6, 0.9), rng.float(0.8, 1.2)];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.16 * Math.sin(x * 3.1 + v) * Math.sin(y * 2.7 + v * 2) + 0.08 * Math.sin(z * 7.3 + x * 5.1);
      const flat = y < -0.2 ? 0.6 : 1;   // flattened underside sits into the ground
      p.setXYZ(i, x * n * f[0], y * n * f[1] * flat, z * n * f[2]);
      const moss = Math.max(0, y) * 0.9;  // moss on the upper faces
      col[i * 3] = 1 - 0.35 * moss; col[i * 3 + 1] = 1 - 0.05 * moss; col[i * 3 + 2] = 1 - 0.45 * moss;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return geo;
  });
  const placements = [[], [], []];
  for (let k = 0; k < 160; k++) {
    const x = rng.float(-200, 200), z = rng.float(-200, 200);
    if (Math.hypot(x, z) < 34 || terrain.isWater(x, z)) continue;
    if (terrain.slopeAt(x, z) < 0.1 && rng.chance(0.7)) continue;
    placements[k % 3].push({ x, z, s: rng.float(0.5, 2.2), rot: rng.float(0, 6) });
  }
  const caveRocks = [];
  for (const c of caves) {
    const y = terrain.heightAt(c.x, c.z);
    const dir = new THREE.Vector3(Math.cos(c.angle), 0, Math.sin(c.angle)), side = new THREE.Vector3(-dir.z, 0, dir.x);
    for (let k = 0; k < 15; k++) {
      const t = (k / 14) * Math.PI;
      const pos = new THREE.Vector3(c.x, y, c.z).addScaledVector(side, Math.cos(t) * 5.5).addScaledVector(dir, -1.5);
      const lift = Math.sin(t) * 5.0;
      caveRocks.push({ x: pos.x, z: pos.z, lift, s: rng.float(1.4, 2.4), rot: rng.float(0, 6) });
    }
    const dark = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 9, 20, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x0a0907, roughness: 1, side: THREE.BackSide }));
    dark.rotation.z = Math.PI / 2; dark.rotation.y = -c.angle;
    dark.position.set(c.x - dir.x * 4, y + 1.0, c.z - dir.z * 4);
    group.add(dark);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(4.0, 20), new THREE.MeshBasicMaterial({ color: 0x06050a }));
    mouth.position.set(c.x - dir.x * 1.2, y + 2.4, c.z - dir.z * 1.2);
    mouth.lookAt(c.x + dir.x * 10, y + 2.4, c.z + dir.z * 10);
    group.add(mouth);
    solids.addCircle(c.x - dir.x * 3, c.z - dir.z * 3, 3.6, Infinity);   // the cave pocket itself
  }
  caveRocks.forEach((r, i) => placements[i % 3].push({ ...r, cave: true }));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  placements.forEach((list, vi) => {
    const mesh = new THREE.InstancedMesh(variants[vi], mat, list.length);
    mesh.castShadow = true; mesh.receiveShadow = true;
    list.forEach((r, i) => {
      q.setFromEuler(new THREE.Euler(r.cave ? rng.float(0, 3) : 0, r.rot, r.cave ? rng.float(0, 3) : 0));
      const y = terrain.heightAt(r.x, r.z) + (r.lift ?? 0) + r.s * 0.15;
      m.compose(v.set(r.x, y, r.z), q, s.set(r.s, r.s, r.s));
      mesh.setMatrixAt(i, m);
      if (!r.lift || r.lift < 2) solids.addCircle(r.x, r.z, r.s * 0.95, Infinity);
    });
    group.add(mesh);
  });
  return group;
}
