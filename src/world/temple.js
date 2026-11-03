// The temple ruins: a mossy stone platform on the central hill, broken pillars, a torii
// gate, fallen walls and the stone lanterns (candle holders) that light when demons come.
import * as THREE from 'three';
import { TEMPLE_RADIUS, TEMPLE_HEIGHT } from './terrain.js';

const stone = new THREE.MeshStandardMaterial({ color: 0x9a968c, roughness: 0.9 });
const stoneDark = new THREE.MeshStandardMaterial({ color: 0x6e6a62, roughness: 0.95 });
const moss = new THREE.MeshStandardMaterial({ color: 0x4f7d3a, roughness: 1 });
const woodRed = new THREE.MeshStandardMaterial({ color: 0xb23a2a, roughness: 0.7 });
const woodDark = new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.8 });
const lanternPaper = new THREE.MeshStandardMaterial({ color: 0xf2e2b8, roughness: 0.6, emissive: 0x000000 });

export function buildTemple(terrain, rng) {
  const group = new THREE.Group();
  group.name = 'temple';
  const colliders = [];
  const lanterns = [];
  const baseY = terrain.heightAt(0, 0);

  const add = (mesh, collide = 0) => {
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    if (collide > 0) colliders.push({ x: mesh.position.x, z: mesh.position.z, r: collide });
    return mesh;
  };

  // Stone platform: two tiers with worn edges
  const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(22, 23.5, 1.2, 36), stone);
  tier1.position.set(0, baseY + 0.5, 0);
  add(tier1);
  const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(13, 14, 1.0, 32), stoneDark);
  tier2.position.set(0, baseY + 1.6, 0);
  add(tier2);
  const mossPatch = new THREE.Mesh(new THREE.CircleGeometry(9, 24), moss);
  mossPatch.rotation.x = -Math.PI / 2; mossPatch.position.set(2, baseY + 2.12, -1);
  mossPatch.receiveShadow = true; group.add(mossPatch);

  // Steps on four sides
  for (let s = 0; s < 4; s++) {
    const a = s * Math.PI / 2;
    for (let k = 0; k < 4; k++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 1.2), stone);
      const r = 23.5 + k * 1.1;
      step.position.set(Math.cos(a) * r, baseY + 1.0 - k * 0.3, Math.sin(a) * r);
      step.rotation.y = -a;
      add(step);
    }
  }

  // Pillars: a ring of 12, several broken at different heights, two toppled
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const x = Math.cos(a) * 10.5, z = Math.sin(a) * 10.5;
    const h = rng.chance(0.4) ? rng.float(1.5, 3.5) : rng.float(5.5, 7);
    if (i === 4 || i === 9) {
      // toppled pillar lying on the floor
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 6, 12), stone);
      p.position.set(x * 0.8, baseY + 2.8, z * 0.8);
      p.rotation.z = Math.PI / 2; p.rotation.y = a + 0.4;
      add(p, 1.5);
      continue;
    }
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.8, h, 12), stone);
    pillar.position.set(x, baseY + 2.1 + h / 2, z);
    add(pillar, 1.0);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 2), stoneDark);
    plinth.position.set(x, baseY + 2.35, z);
    add(plinth);
    if (h > 5) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.9), stoneDark);
      cap.position.set(x, baseY + 2.1 + h + 0.25, z);
      add(cap);
    }
  }
  // Remains of a lintel across two tall pillars
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(7, 0.8, 1.2), stoneDark);
  lintel.position.set(0, baseY + 9.4, -10.3); add(lintel);

  // Ruined walls
  for (let i = 0; i < 5; i++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(15, 20);
    const w = new THREE.Mesh(new THREE.BoxGeometry(rng.float(3, 6), rng.float(1, 2.6), 0.9), stoneDark);
    w.position.set(Math.cos(a) * r, baseY + 1.1 + w.geometry.parameters.height / 2, Math.sin(a) * r);
    w.rotation.y = -a + Math.PI / 2 + rng.float(-0.3, 0.3);
    add(w, 2.2);
  }

  // Torii gate at the top of the southern steps
  const toriiZ = 27;
  for (const sx of [-2.4, 2.4]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 6.5, 10), woodRed);
    post.position.set(sx, terrain.heightAt(sx, toriiZ) + 3.1, toriiZ);
    add(post, 0.5);
  }
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.42, 0.6), woodDark);
  kasagi.position.set(0, terrain.heightAt(0, toriiZ) + 6.4, toriiZ); kasagi.rotation.z = 0; add(kasagi);
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.3, 0.4), woodRed);
  nuki.position.set(0, terrain.heightAt(0, toriiZ) + 5.3, toriiZ); add(nuki);

  // Stone lanterns (tōrō) around the platform: each holds a candle light for demon nights
  const lanternGeo = (() => {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 8), stone); post.position.y = 0.8; g.add(post);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.3, 8), stoneDark); base.position.y = 0.15; g.add(base);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), stoneDark); box.position.y = 1.95; g.add(box);
    const paper = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.62), lanternPaper.clone()); paper.position.y = 1.95; g.add(paper);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.9, 0.55, 4), stone); roof.position.y = 2.55; roof.rotation.y = Math.PI / 4; g.add(roof);
    const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), stoneDark); jewel.position.y = 2.9; g.add(jewel);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    return { g, paper };
  });
  const lanternSpots = [];
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; lanternSpots.push([Math.cos(a) * 19, Math.sin(a) * 19]); }
  lanternSpots.push([-5, 32], [5, 32], [-5, 40], [5, 40]);
  for (const [x, z] of lanternSpots) {
    const { g, paper } = lanternGeo();
    g.position.set(x, terrain.heightAt(x, z) + (Math.hypot(x, z) < 22 ? 1.1 : 0), z);
    group.add(g);
    colliders.push({ x, z, r: 0.6 });
    const light = new THREE.PointLight(0xffa242, 0, 14, 1.6);
    light.position.set(0, 2.0, 0);
    g.add(light);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0 }));
    flame.position.y = 1.95; g.add(flame);
    lanterns.push({ group: g, light, paper, flame, phase: Math.random() * 10 });
  }

  // A few scattered boulders and broken statues down the slopes
  const rockGeo = new THREE.DodecahedronGeometry(1, 1);
  for (let i = 0; i < 10; i++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(TEMPLE_RADIUS + 2, TEMPLE_RADIUS + 25);
    const rock = new THREE.Mesh(rockGeo, stoneDark);
    const s = rng.float(0.6, 1.6);
    rock.scale.set(s * rng.float(0.8, 1.4), s * 0.8, s);
    rock.position.set(Math.cos(a) * r, terrain.heightAt(Math.cos(a) * r, Math.sin(a) * r) + s * 0.3, Math.sin(a) * r);
    rock.rotation.set(rng.float(0, 3), rng.float(0, 3), 0);
    add(rock, s * 0.9);
  }
  group.userData.lanterns = lanterns;
  group.userData.colliders = colliders;
  return group;
}

/** Drive candle flicker / lighting state. lit in [0,1]. */
export function updateLanterns(lanterns, lit, t) {
  for (const L of lanterns) {
    const flicker = lit * (0.75 + 0.25 * Math.sin(t * 11 + L.phase) * Math.sin(t * 7.3 + L.phase * 2));
    L.light.intensity = flicker * 2.6;
    L.flame.material.opacity = lit;
    L.flame.scale.setScalar(0.8 + 0.3 * flicker);
    L.paper.material.emissive.setRGB(1.0 * flicker, 0.55 * flicker, 0.2 * flicker);
    L.paper.material.emissiveIntensity = 1.2;
  }
}

/** Rock formations: boulders scattered on slopes and two cave mouths dug into hillsides. */
export function buildRocks(terrain, rng, caves) {
  const group = new THREE.Group();
  group.name = 'rocks';
  const colliders = [];
  const geo = new THREE.DodecahedronGeometry(1, 1);
  // perturb the dodecahedron so it reads as a boulder
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + rng.next() * 0.3), p.getY(i) * (0.8 + rng.next() * 0.3), p.getZ(i) * (0.85 + rng.next() * 0.3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x7b776f, roughness: 0.95 });
  const count = 140;
  const mesh = new THREE.InstancedMesh(geo, mat, count + caves.length * 14);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  let i = 0;
  for (let k = 0; k < count; k++) {
    const x = rng.float(-200, 200), z = rng.float(-200, 200);
    if (Math.hypot(x, z) < 40 || terrain.isWater(x, z)) continue;
    const slope = terrain.slopeAt(x, z);
    if (slope < 0.12 && rng.chance(0.7)) continue;
    const sc = rng.float(0.5, 2.2);
    q.setFromEuler(new THREE.Euler(rng.float(0, 3), rng.float(0, 3), rng.float(0, 3)));
    m.compose(v.set(x, terrain.heightAt(x, z) + sc * 0.25, z), q, s.set(sc * rng.float(0.8, 1.5), sc * 0.8, sc));
    mesh.setMatrixAt(i++, m);
    colliders.push({ x, z, r: sc * 0.9 });
  }
  // Cave mouths: an arch of boulders with a dark interior pocket
  for (const c of caves) {
    const y = terrain.heightAt(c.x, c.z);
    const dir = new THREE.Vector3(Math.cos(c.angle), 0, Math.sin(c.angle));
    for (let k = 0; k < 14; k++) {
      const t = (k / 13) * Math.PI;
      const rx = Math.cos(t) * 5.5, ry = Math.sin(t) * 5.0;
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      const pos = new THREE.Vector3(c.x, y, c.z).addScaledVector(side, rx).addScaledVector(dir, -1.5);
      pos.y = terrain.heightAt(pos.x, pos.z) + ry;
      const sc = rng.float(1.4, 2.4);
      q.setFromEuler(new THREE.Euler(rng.float(0, 3), rng.float(0, 3), 0));
      m.compose(pos, q, s.set(sc, sc, sc));
      mesh.setMatrixAt(i++, m);
      if (ry < 2) colliders.push({ x: pos.x, z: pos.z, r: sc * 0.8 });
    }
    const dark = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 9, 16, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x0a0907, roughness: 1, side: THREE.BackSide }));
    dark.rotation.z = Math.PI / 2; dark.rotation.y = -c.angle;
    dark.position.set(c.x - dir.x * 4, y + 1.0, c.z - dir.z * 4);
    group.add(dark);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(4.0, 16), new THREE.MeshBasicMaterial({ color: 0x06050a }));
    mouth.position.set(c.x - dir.x * 1.2, y + 2.4, c.z - dir.z * 1.2);
    mouth.lookAt(c.x + dir.x * 10, y + 2.4, c.z + dir.z * 10);
    group.add(mouth);
  }
  mesh.count = i;
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  group.userData.colliders = colliders;
  return group;
}
