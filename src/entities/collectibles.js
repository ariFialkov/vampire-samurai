// Collectible catalogue: one-time-use items, keepers (secondary weapons/tools) and upgrades.
import * as THREE from 'three';
import { mat } from './humanoid.js';
import { WEAPON_MESHES } from './weapons.js';

export const ITEMS = {
  // ---- one-time use (stackable where noted)
  super_stomp:   { name: 'Super Stomp', icon: '🦶', kind: 'use', max: 1, weight: 5, color: 0xc9a86a, desc: 'Shatters every skeleton nearby.' },
  headshots:     { name: 'Headshots Only', icon: '🎯', kind: 'use', max: 1, weight: 4, color: 0xd44a3a, desc: '10s: every hit is a headshot. Zombies fall in one.' },
  corpuscular:   { name: 'Corpuscular Ray', icon: '☀️', kind: 'use', max: 1, weight: 4, color: 0xffd36a, desc: '3s beam of sunlight. Burns vampires in it.' },
  ecto_goggles:  { name: 'Ecto-Goggles', icon: '🥽', kind: 'use', max: 1, weight: 4, color: 0x6ad4c9, desc: '30s: see ghosts, even when hidden.' },
  wolfsbane:     { name: 'Wolfsbane Grenade', icon: '💣', kind: 'use', max: 1, weight: 4, color: 0x9a6ad4, desc: '15s cloud of wolfsbane. Werewolves burn in it.' },
  holy_water:    { name: 'Holy Water Hose', icon: '💧', kind: 'use', max: 1, weight: 3, color: 0x6aa8ff, desc: '10s stream: ravages demons, pushes back the rest.' },
  protector:     { name: 'Protector Spell', icon: '🛡️', kind: 'use', max: 1, weight: 0, color: 0xffffff, desc: 'Nearby monsters become your allies.', spell: true },
  speedy:        { name: 'Speedy Spell', icon: '💨', kind: 'use', max: 1, weight: 0, color: 0xb0ffd0, desc: '10s: move and attack faster.', spell: true },
  lucky:         { name: 'Lucky Spell', icon: '🍀', kind: 'use', max: 1, weight: 0, color: 0x5aff6a, desc: '30s: many more collectibles appear.', spell: true },
  mulberry:      { name: 'Mulberry', icon: '🫐', kind: 'use', max: 5, weight: 12, color: 0x5a2a6a, desc: 'Restores 15% health.' },
  green_tea:     { name: 'Green Tea', icon: '🍵', kind: 'use', max: 2, weight: 6, color: 0x7fb86a, desc: 'Restores 50% health.' },
  shuriken:      { name: 'Shuriken', icon: '✴️', kind: 'use', max: 12, weight: 9, color: 0xb0b8c0, desc: 'Thrown star. Mid range, decent damage.', pickupCount: 4 },
  makibishi:     { name: 'Makibishi', icon: '🔩', kind: 'use', max: 6, weight: 6, color: 0x555a60, desc: 'Caltrops: wound anything that steps on them.', pickupCount: 3 },
  bohiya:        { name: 'Bo-hiya', icon: '🚀', kind: 'use', max: 3, weight: 5, color: 0xff7a2a, desc: 'Fire rocket arrow. Explodes and burns.', pickupCount: 1 },
  // ---- keepers
  wakizashi:     { name: 'Wakizashi', icon: '🔪', kind: 'keeper', max: 1, weight: 4, color: 0xd8dde3, desc: 'Short sword. Quick, light, nimble.', weapon: 'wakizashi' },
  tessen:        { name: 'Tessen', icon: '🪭', kind: 'keeper', max: 1, weight: 3, color: 0xc0392b, desc: 'Bladed war fan. Wide, fast, elegant.', weapon: 'tessen' },
  tekkokagi:     { name: 'Tekko-Kagi', icon: '🐾', kind: 'keeper', max: 1, weight: 0.8, color: 0xeeeeee, desc: 'Claws. Brutal and fast, but you must get close.', weapon: 'tekkokagi' },
  binoculars:    { name: 'Binoculars', icon: '🔭', kind: 'keeper', max: 1, weight: 3, color: 0x2a2a2a, desc: 'Cycle camera height to scout the land.', weapon: 'binoculars' },
  // ---- upgrades (instant)
  rub_serrated:  { name: 'Serrated', icon: '🪚', kind: 'upgrade', max: 1, weight: 2.5, color: 0xa8b0b8, desc: '2× damage to zombies.', rub: 'serrated' },
  rub_garlic:    { name: 'Garlic', icon: '🧄', kind: 'upgrade', max: 1, weight: 2.5, color: 0xe9e4c8, desc: '2× damage to vampires.', rub: 'garlic' },
  rub_salt:      { name: 'Salt', icon: '🧂', kind: 'upgrade', max: 1, weight: 2.5, color: 0xf4f7ff, desc: '2× damage to ghosts.', rub: 'salt' },
  rub_silver:    { name: 'Silver', icon: '🥈', kind: 'upgrade', max: 1, weight: 2.5, color: 0xeef2ff, desc: '2× damage to werewolves.', rub: 'silver' },
  flaming_tekko: { name: 'Flaming Tekko-Kagi', icon: '🔥', kind: 'upgrade', max: 1, weight: 0, color: 0xff6a2a, desc: 'Your claws burn: 2× damage to everything.', flaming: true },
};

const labelCache = new Map();
function labelSprite(text, color = '#f6e9c8') {
  if (!labelCache.has(text)) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.font = '600 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 8;
    g.fillStyle = color; g.fillText(text, 128, 32);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    labelCache.set(text, tex);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelCache.get(text), transparent: true, depthTest: false }));
  s.scale.set(3.2, 0.8, 1); s.position.y = 1.6;
  return s;
}

/** Build the floating pickup representation. */
export function buildPickupMesh(id) {
  const def = ITEMS[id];
  const g = new THREE.Group();
  let core;
  if (def.weapon) { core = WEAPON_MESHES[def.weapon](); core.scale.setScalar(0.8); core.rotation.z = 0.6; }
  else if (def.kind === 'upgrade') { core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), mat(def.color, { metalness: 0.6, roughness: 0.3, emissive: def.color, emissiveIntensity: 0.25 })); }
  else if (def.spell) { core = new THREE.Mesh(new THREE.TorusKnotGeometry(0.2, 0.07, 48, 8), new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.6, roughness: 0.3 })); }
  else { core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), mat(def.color, { roughness: 0.5, emissive: def.color, emissiveIntensity: 0.15 })); }
  core.castShadow = true;
  core.position.y = 0.8;
  g.add(core);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 24), new THREE.MeshBasicMaterial({ color: def.kind === 'upgrade' ? 0xd4a84b : def.spell ? 0xffffff : 0x9ad4a0, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
  g.add(ring);
  g.add(labelSprite(def.name, def.kind === 'upgrade' ? '#f1cf7a' : '#f6e9c8'));
  g.userData.core = core;
  return g;
}

/** Weighted pick of an item id to spawn given the player's inventory. */
export function rollSpawnItem(rng, inventory, lucky) {
  const w = {};
  const hasTekko = inventory.some((s) => s && s.id === 'tekkokagi');
  for (const id in ITEMS) {
    const d = ITEMS[id];
    let weight = d.weight;
    if (id === 'flaming_tekko') weight = hasTekko ? 1.5 : 0;
    if (d.kind === 'keeper' && inventory.some((s) => s && s.id === id)) weight = 0;
    if (lucky && d.kind !== 'upgrade') weight *= 1.3;
    if (weight > 0) w[id] = weight;
  }
  return rng.weighted(w);
}
