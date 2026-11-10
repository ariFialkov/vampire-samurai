// Asset-catalog renderer. Loaded in a browser by tools/catalog/build.mjs (through the Vite dev
// server, so it uses the game's real modules). Builds every samurai, monster, weapon and
// collectible exactly as the game does, renders several views of each on a transparent
// background and measures them (size, triangles, meshes, rig pivots, palette).
import * as THREE from 'three';
import { CHARACTERS } from '/src/entities/characters.js';
import { Player } from '/src/entities/player.js';
import { Monster, MONSTERS } from '/src/entities/monsters.js';
import { WEAPONS, WEAPON_MESHES, RUBS } from '/src/entities/weapons.js';
import { ITEMS, buildPickupMesh } from '/src/entities/collectibles.js';
import { WEAPON_RIGS } from '/src/entities/attacks.js';
import { techniquesFor } from '/src/entities/specials.js';
import { Rng } from '/shared/rng.js';

const SIZE = 640;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(SIZE, SIZE);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xe6eeff, 0x5a4a3a, 1.05));
const key = new THREE.DirectionalLight(0xfff1d6, 2.3); key.position.set(3, 5, 4); scene.add(key);
const rim = new THREE.DirectionalLight(0xbfd4ff, 1.1); rim.position.set(-4, 3, -5); scene.add(rim);
const fill = new THREE.DirectionalLight(0xffffff, 0.35); fill.position.set(-3, 1, 3); scene.add(fill);
// soft contact shadow under each model
const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(0,0,0,0.55)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
contact.rotation.x = -Math.PI / 2; contact.position.y = 0.002;

const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 100);
const fakeWorld = { surfaceAt: () => 0, groundAt: () => 0, heightAt: () => -100, move: (p, x, z) => ({ x, y: 0, z }), terrain: { waterLevelAt: () => -200 } };
// a quiet stand-in for the game while the samurai poses on their own body controller
const fakeCtx = { monsters: [], effects: { burst() {} }, projectiles: { fire: () => ({ pos: new THREE.Vector3(), removed: true }), area() {} }, toast() {}, sound() {} };
const stillInput = { move: new THREE.Vector2(), aim: null, holding: false };
const MOVE_LABEL = { cutL: 'cut (sweeps left)', cutR: 'cut (sweeps right)', thrust: 'thrust', cleave: 'overhead', rise: 'combo', low: 'combo', jabL: 'combo' };

const VIEWS = { 'three-quarter': [0.62, 0.16], front: [0, 0.1], side: [Math.PI / 2, 0.1], back: [Math.PI, 0.14] };
const r2 = (n) => Math.round(n * 100) / 100;
const hex = (c) => '#' + c.getHexString();

function measure(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, true);
  let tris = 0, meshes = 0; const mats = new Set(); const colors = new Map();
  obj.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh) || !o.visible) return;
    const g = o.geometry; meshes++;
    const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    tris += t * (o.isInstancedMesh ? o.count : 1);
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
    // palette: vertex colours weighted by how much of the model uses them, else the material colour
    const ca = g.attributes.color, c = new THREE.Color();
    if (ca) for (let i = 0; i < ca.count; i += 3) { c.setRGB(ca.getX(i), ca.getY(i), ca.getZ(i)); const k = hex(c); colors.set(k, (colors.get(k) ?? 0) + 1); }
    else if (o.material?.color) { const k = hex(o.material.color); colors.set(k, (colors.get(k) ?? 0) + g.attributes.position.count / 3); }
  });
  const size = box.getSize(new THREE.Vector3());
  const palette = [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => k);
  return { box, size: { height: r2(size.y), width: r2(size.x), depth: r2(size.z) }, triangles: Math.round(tris), meshes, materials: mats.size, palette };
}

function shoot(obj, box, yaw, pitch, pad = 1.18) {
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.y * 0.5, Math.hypot(size.x, size.z) * 0.5) * pad;
  const dist = radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  camera.position.set(center.x + Math.sin(yaw) * Math.cos(pitch) * dist, center.y + Math.sin(pitch) * dist, center.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(center);
  contact.scale.setScalar(Math.max(size.x, size.z) * 1.4 + 0.3);
  contact.position.set(center.x, box.min.y + 0.002, center.z);
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/webp', 0.9);
}

function render(obj, views, withShadow = true) {
  scene.add(obj); if (withShadow) scene.add(contact);
  const m = measure(obj);
  const images = {};
  for (const v of views) { const [yaw, pitch] = VIEWS[v]; images[v] = shoot(obj, m.box, yaw, pitch); }
  scene.remove(obj); scene.remove(contact);
  delete m.box;
  return { ...m, images };
}

/** World-space pivot of every named bone group of a rig (metres, model space). */
function rigPivots(root, bones) {
  root.updateMatrixWorld(true);
  const out = [];
  for (const [name, g] of bones) if (g) { const p = g.getWorldPosition(new THREE.Vector3()); out.push({ bone: name, position: [r2(p.x), r2(p.y), r2(p.z)] }); }
  return out;
}
function humanoidBones(p) {
  return [['root', p.root], ['hips', p.hips], ['torso', p.torso], ['chest', p.chest], ['neck', p.neck], ['head', p.head],
    ['shoulder.L', p.armL.shoulder], ['elbow.L', p.armL.elbow], ['hand.L', p.armL.hand],
    ['shoulder.R', p.armR.shoulder], ['elbow.R', p.armR.elbow], ['hand.R', p.armR.hand],
    ['hip.L', p.legL.hip], ['knee.L', p.legL.knee], ['ankle.L', p.legL.ankle], ['hip.R', p.legR.hip], ['knee.R', p.legR.knee], ['ankle.R', p.legR.ankle],
    ['cape', p.cape], ['robe', p.robe]];
}

const SAMURAI_NOTES = {
  katana: 'Balanced all-rounder: medium build, conical straw kasa hat, topknot, navy kimono over charcoal hakama.',
  yumi: 'The smallest, lightest samurai: slim build, bare head with topknot, green kimono. Holds an asymmetric longbow in the left hand.',
  odachi: 'A giant: broad shoulders, full lacquered armour (do cuirass, sode shoulder plates, kusazuri skirt) and a crested kabuto helmet.',
  naginata: 'Tall and lean, cream kimono with jade obi and kasa hat. The polearm is gripped two-handed partway down the shaft.',
  kanabo: 'The heaviest build: brown-and-green lamellar armour, topknot, rests the studded club on the shoulder.',
  kusarigama: 'Lithe trickster in dark clothing with a vermilion collar; sickle in the right hand, a simulated chain hangs from the handle.',
};
const MONSTER_NOTES = {
  skeleton: { tier: 1, look: 'Bare bones: skull with dark sockets and teeth, ribcage, spine, pelvis, thin limb bones, a rag of loincloth.', behaviour: 'Weakest, slow, low health; arrives in large hordes.', death: 'Collapses into a pile of bones.' },
  zombie: { tier: 2, look: 'Green-grey skin, hunched, torn kimono with a ragged hem and one torn sleeve, exposed ribs, sunken eyes, claws. Walks arms-out.', behaviour: 'Slower than skeletons but tough; hordes slightly smaller.', death: 'Falls over backwards with its hands up in the air.' },
  witch: { tier: 3, look: 'Long flared robe to the ground, shawl, pointed hat with a bent tip, long grey hair strands, long nose; staff with a glowing violet orb.', behaviour: 'Keeps short-medium range and casts homing spell orbs; backs away when approached.', death: 'Leaves an empty pile of clothes; sometimes a spell collectible appears.' },
  vampire: { tier: 4, look: 'Pale skin, slicked hair with widow\'s peak, red eyes, fangs, high stiff collar, long cape, crimson waistcoat with gold buttons and cravat.', behaviour: 'Fast with short untouchable dashes every few seconds.', death: 'Turns into a bat and flies away.' },
  ghost: { tier: 5, look: 'Translucent flowing shroud with a wavy tattered hem, round head with hollow eyes and mouth, trailing arms; faint blue glow.', behaviour: 'Medium speed; fades in and out of visibility; drifts through walls and trees.', death: 'Fizzles out in a puff of ghostly vapour.' },
  werewolf: { tier: 6, look: 'Runs on all fours: heavy shoulders, shaggy mane and hackles, long snout with fangs, pointed ears, glowing yellow eyes, digitigrade legs, claws, bushy tail.', behaviour: 'Very fast, hunts alone or in loose packs, lunges; heavy damage.', death: 'Slumps over onto its side.' },
  demon: { tier: 7, look: 'Large (about 1.55x scale), dark red skin, curved horns, glowing orange eyes, spine spikes, chest plates, clawed hands and feet, loincloth, tail.', behaviour: 'Rare boss-like waves: very high health and speed; turns the sky to night; camouflaged in the dark; throws fireballs.', death: 'Burns away, shrinking in a burst of embers.' },
};
const DEATH_ORDER = ['skeleton', 'zombie', 'witch', 'vampire', 'ghost', 'werewolf', 'demon'];

async function renderAll() {
  const assets = [], files = {};
  const store = (id, images) => { const out = {}; for (const [v, url] of Object.entries(images)) { const f = `${id}-${v}.webp`; files[f] = url; out[v] = `img/${f}`; } return out; };

  // ---------------------------------------------------------------- samurai
  for (const c of CHARACTERS) {
    const pl = new Player(c, new THREE.Scene(), fakeWorld);
    const rig = WEAPON_RIGS[c.weapon];
    // the samurai's own body controller: settle into guard, then strike
    pl.body.scan = 0; pl.body.scanT = 1e9;
    const settle = (n) => { for (let i = 0; i < n; i++) pl.update(1 / 60, stillInput, fakeCtx); };
    const subject = new THREE.Group(); subject.add(pl.mesh);
    if (pl.chain) subject.add(pl.chain.links, pl.chain.weight);          // the simulated chain lives in world space
    settle(120);
    pl.pos.set(0, 0, 0); pl.body.ready = false; settle(60);
    const guard = render(subject, ['three-quarter', 'front', 'side', 'back']);
    const bones = rigPivots(pl.mesh, humanoidBones(pl.rig));
    if (rig.moves) { pl.attack(fakeCtx, 'left'); for (let i = 0; i < 120 && pl.act && pl.act.t < pl.act.hit; i++) settle(1); }
    else { pl.attack(fakeCtx); settle(55); }
    pl.pos.set(0, 0, 0); pl.mesh.position.set(0, 0, 0);
    const action = render(subject, ['three-quarter']);
    const w = WEAPONS[c.weapon];
    assets.push({
      id: `samurai-${c.id}`, name: c.name, category: 'Samurai', subcategory: 'Playable character',
      description: c.desc, look: SAMURAI_NOTES[c.id],
      size: guard.size, triangles: guard.triangles, meshes: guard.meshes, materials: guard.materials, palette: guard.palette,
      scale: c.look.scale, proportions: { scale: c.look.scale, bulk: c.look.bulk, legLength: c.look.legLen, armLength: c.look.armLen },
      images: store(`samurai-${c.id}`, { ...guard.images, action: action.images['three-quarter'] }),
      rig: { type: 'Humanoid (shared by samurai and humanoid monsters)', bones },
      animations: ['Procedural: idle stance with breathing and weight shifts, gait with planted feet (walk to run), head tracking', `Guard stance (${w.name}), springs back after every strike`,
        ...(rig.moves ? Object.entries(rig.moves).map(([k, m]) => `Strike, ${MOVE_LABEL[k] ?? k}: ${m.name}`) : rig.variants.map((v) => `Attack: ${v.name}`)),
        ...techniquesFor(c.weapon, rig).map((t) => `Technique: ${t.name} (${t.jp}), ${t.how.toLowerCase()}`),
        'Hurt flinch (spring impulse)', 'Death: knees give, then topples', 'Item gestures: use, throw, cast, stomp'],
      stats: { Health: c.health, 'Move speed': `${c.speed} m/s`, Weapon: w.name, Damage: w.damage, Reach: `${w.range} m`, 'Attack time': `${w.cooldown} s` },
      attach: [{ point: 'hand.R grip', holds: rig.main === 'R' ? w.name : 'arrow (while drawing)' }, { point: 'hand.L grip', holds: rig.main === 'L' ? w.name : (c.weapon === 'tekkokagi' ? 'claws' : (rig.off === 'grip' ? 'second hand on the handle' : 'free')) }],
      source: ['src/entities/characters.js', 'src/entities/humanoid.js', 'src/entities/attacks.js'],
      tags: [c.weapon, w.style, 'player', 'humanoid'],
    });
  }

  // ---------------------------------------------------------------- monsters
  for (const type of DEATH_ORDER) {
    const m = new Monster(type, { x: 0, y: 0, z: 0 }, new Rng(`cat-${type}`), new THREE.Scene());
    m.facing = 0; m.anim.speed = 0; m.applyAnim(0.0001);
    if (type === 'ghost') m.rig.mats.forEach((mt) => { mt.opacity = 0.6; });
    if (type === 'demon') m.materials.forEach((mt) => { mt.opacity = 1; mt.transparent = false; });
    const shot = render(m.mesh, ['three-quarter', 'front', 'side', 'back']);
    const R = m.rig, D = MONSTERS[type], N = MONSTER_NOTES[type];
    const bones = R.quadruped
      ? [['root', R.root], ['body', R.body], ['neck', R.neck], ['tail', R.tail], ...R.legs.flatMap((l, i) => [[`${l.front ? 'front' : 'hind'}.${i % 2 ? 'R' : 'L'}.hip`, l.hip], [`${l.front ? 'front' : 'hind'}.${i % 2 ? 'R' : 'L'}.knee`, l.knee]])]
      : R.ghost ? [['root', R.root], ['shroud', R.sheet], ['arm.L', R.arms[0]], ['arm.R', R.arms[1]]] : humanoidBones(R);
    assets.push({
      id: `monster-${type}`, name: D.name, category: 'Monster', subcategory: `Tier ${N.tier} of 7`, tier: N.tier,
      description: N.behaviour, look: N.look,
      size: shot.size, triangles: shot.triangles, meshes: shot.meshes, materials: shot.materials, palette: shot.palette,
      scale: type === 'demon' ? 1.55 : 1,
      images: store(`monster-${type}`, shot.images),
      rig: { type: R.quadruped ? 'Quadruped' : R.ghost ? 'Floating shroud' : 'Humanoid (shared)', bones: rigPivots(R.root, bones) },
      animations: R.quadruped ? ['Gallop cycle', 'Lunge', 'Bite attack', `Death: ${N.death}`] : R.ghost ? ['Hover bob and sway', 'Fade in / out', 'Reaching attack', `Death: ${N.death}`]
        : ['Idle breathing', 'Walk cycle', type === 'witch' ? 'Spell cast' : 'Claw / swing attack', ...(type === 'vampire' ? ['Dash'] : []), `Death: ${N.death}`],
      stats: { Health: D.hp, 'Move speed': `${D.speed} m/s`, Damage: D.damage, Reach: `${D.range} m`, 'Attack every': `${D.cooldown} s`, 'Group size': `${D.group[0]}-${D.group[1]}` },
      source: ['src/entities/monsters.js', ...(R.quadruped || R.ghost ? [] : ['src/entities/humanoid.js'])],
      tags: [type, R.quadruped ? 'quadruped' : R.ghost ? 'ghost' : 'humanoid', `tier ${N.tier}`],
    });
  }

  // ---------------------------------------------------------------- weapons
  for (const [id, w] of Object.entries(WEAPONS)) {
    const g = new THREE.Group(); const mesh = WEAPON_MESHES[id](); g.add(mesh);
    if (id !== 'binoculars' && id !== 'tekkokagi') { mesh.rotation.z = -Math.PI / 2 + 0.35; }
    mesh.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(mesh); mesh.position.y -= b.min.y;
    const shot = render(g, ['three-quarter'], true);
    const rig = WEAPON_RIGS[id];
    const len = new THREE.Box3().setFromObject(WEAPON_MESHES[id]()).getSize(new THREE.Vector3());
    assets.push({
      id: `weapon-${id}`, name: w.name, category: 'Weapon', subcategory: w.keeper ? 'Secondary (collectible keeper)' : 'Primary weapon',
      description: w.keeper ? (ITEMS[id]?.desc ?? '') : `Primary weapon of the ${w.name} samurai.`,
      look: `Held ${rig.main === 'L' ? 'in the left hand' : 'in the right hand'}${rig.off === 'grip' ? ', two-handed' : ''}. Model space: +Y runs from the grip toward the tip.`,
      size: { height: r2(len.y), width: r2(len.x), depth: r2(len.z) }, length: r2(len.y),
      triangles: shot.triangles, meshes: shot.meshes, materials: shot.materials, palette: shot.palette,
      images: store(`weapon-${id}`, shot.images),
      animations: rig.moves ? Object.entries(rig.moves).map(([k, m]) => `Strike, ${MOVE_LABEL[k] ?? k}: ${m.name}`) : rig.variants.map((v) => `Attack: ${v.name}`),
      stats: { Damage: w.damage, Reach: `${w.range} m`, 'Swing arc': w.arc ? `${Math.round(w.arc * 57.3)} deg` : 'n/a', 'Attack time': `${w.cooldown} s`, 'Move speed': `x${w.speed}` },
      attach: [{ point: 'grip', holds: `hand sits ${rig.mount} m up the weapon's +Y axis` }, ...(rig.off === 'grip' ? [{ point: 'second hand', holds: `${rig.spacing} m further down the handle` }] : [])],
      source: ['src/entities/weapons.js', 'src/entities/attacks.js'],
      tags: [id, w.style, w.keeper ? 'keeper' : 'primary'],
    });
  }

  // ---------------------------------------------------------------- collectibles
  const KIND = { use: 'One-time use', keeper: 'Keeper', upgrade: 'Upgrade (applied on pickup)' };
  for (const [id, it] of Object.entries(ITEMS)) {
    if (it.weapon) continue;          // keepers are catalogued under Weapons
    const pick = buildPickupMesh(id, 1);
    const core = pick.userData.core; pick.remove(core); core.position.set(0, 0, 0); core.rotation.set(0, 0.5, 0);
    const g = new THREE.Group(); g.add(core);
    g.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(core); core.position.y -= b.min.y;
    const shot = render(g, ['three-quarter'], true);
    assets.push({
      id: `item-${id}`, name: it.name, category: 'Collectible', subcategory: KIND[it.kind] + (it.spell ? ' (witch spell)' : ''),
      description: it.desc, look: 'Floats above a glowing ring with a name label in game; the model spins slowly.',
      size: shot.size, triangles: shot.triangles, meshes: shot.meshes, materials: shot.materials, palette: shot.palette,
      images: store(`item-${id}`, shot.images),
      stats: { Type: KIND[it.kind], 'Per slot': it.max, 'Per pickup': it.pickupCount ?? 1, ...(it.rub ? { 'Bonus vs': RUBS[it.rub].vs } : {}) },
      source: ['src/entities/collectibles.js'],
      tags: [id, it.kind, ...(it.spell ? ['spell'] : [])],
    });
  }
  return { assets, files };
}

window.__renderCatalog = renderAll;
window.__ready = true;
