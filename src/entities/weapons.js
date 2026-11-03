// Weapons: meshes, stats and the attack choreography for each fighting style.
// Each weapon has a distinct feel: reach, arc, tempo, mobility and animation.
import * as THREE from 'three';
import { mat, ease } from './humanoid.js';

const steel = () => mat(0xd8dde3, { metalness: 0.85, roughness: 0.25 });
const darkSteel = () => mat(0x5a5f66, { metalness: 0.8, roughness: 0.35 });
const wood = () => mat(0x6a4a30, { roughness: 0.8 });
const wrap = () => mat(0x22222a, { roughness: 0.9 });
const gold = () => mat(0xd4a84b, { metalness: 0.7, roughness: 0.3 });

function blade(len, w = 0.05, thick = 0.012, curve = 0.08) {
  // slightly curved single-edged blade: thin box bent via vertex offsets
  const g = new THREE.BoxGeometry(w, len, thick, 1, 10, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + len / 2) / len;
    p.setX(i, p.getX(i) * (1 - t * 0.5) + Math.pow(t, 2) * curve);
  }
  g.translate(0, len / 2, 0);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, steel()); m.castShadow = true; return m;
}
function handle(len, r = 0.022, m = wrap()) { const h = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), m); h.position.y = -len / 2; h.castShadow = true; return h; }
function guard() { const g = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.015, 12), gold()); return g; }

export const WEAPON_MESHES = {
  katana: () => { const g = new THREE.Group(); g.add(blade(0.95, 0.05)); g.add(guard()); g.add(handle(0.3)); return g; },
  wakizashi: () => { const g = new THREE.Group(); g.add(blade(0.55, 0.045)); g.add(guard()); g.add(handle(0.2)); return g; },
  odachi: () => { const g = new THREE.Group(); g.add(blade(1.65, 0.07, 0.016, 0.14)); g.add(guard()); g.add(handle(0.5, 0.026)); return g; },
  naginata: () => { const g = new THREE.Group(); const pole = handle(1.9, 0.024, wood()); pole.position.y = -0.95 + 0.1; g.add(pole); const b = blade(0.6, 0.06, 0.014, 0.12); b.position.y = 0.1; g.add(b); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12), gold()); ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; g.add(ring); return g; },
  kanabo: () => { const g = new THREE.Group(); const club = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.05, 1.3, 8), wood()); club.position.y = 0.5; club.castShadow = true; g.add(club); for (let i = 0; i < 18; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 5), darkSteel()); const a = (i % 6) / 6 * Math.PI * 2, y = 0.45 + Math.floor(i / 6) * 0.25; s.position.set(Math.cos(a) * 0.085, y, Math.sin(a) * 0.085); s.lookAt(Math.cos(a) * 2, y, Math.sin(a) * 2); s.rotateX(Math.PI / 2); g.add(s); } g.add(handle(0.35, 0.03)); return g; },
  yumi: () => { const g = new THREE.Group(); const bow = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.018, 6, 28, 2.4), wood()); bow.rotation.z = Math.PI / 2 + 1.2 - Math.PI; bow.rotation.y = Math.PI / 2; bow.position.y = 0.3; bow.castShadow = true; g.add(bow); const str = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1.75, 4), mat(0xeeeeee)); str.position.set(0, 0.3, -0.5); g.add(str); return g; },
  kusarigama: () => { const g = new THREE.Group(); const h = handle(0.42, 0.02, wood()); h.position.y = -0.1; g.add(h); const sickle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 6, 14, Math.PI * 0.9), steel()); sickle.position.set(0.12, 0.12, 0); sickle.rotation.z = -0.4; sickle.scale.set(1, 0.55, 1); sickle.castShadow = true; g.add(sickle); const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.6, 5), darkSteel()); chain.position.y = -0.6; g.add(chain); const weight = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), darkSteel()); weight.position.y = -0.92; g.add(weight); return g; },
  tessen: () => { const g = new THREE.Group(); const fan = new THREE.Mesh(new THREE.CircleGeometry(0.42, 18, 0.1, Math.PI - 0.2), mat(0xc0392b, { side: THREE.DoubleSide, roughness: 0.6 })); fan.position.y = 0.05; g.add(fan); for (let i = 0; i <= 8; i++) { const a = 0.1 + (Math.PI - 0.2) * i / 8; const rib = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.012, 0.006), steel()); rib.position.set(Math.cos(a) * 0.21, 0.05 + Math.sin(a) * 0.21, 0.004); rib.rotation.z = a; g.add(rib); } g.add(handle(0.12, 0.02)); return g; },
  tekkokagi: () => { const g = new THREE.Group(); const band = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 12), darkSteel()); band.rotation.x = Math.PI / 2; g.add(band); for (let i = -1; i <= 1; i++) { const claw = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.42, 6), steel()); claw.position.set(i * 0.045, 0.24, 0.02); claw.rotation.z = -i * 0.08; claw.castShadow = true; g.add(claw); } return g; },
  binoculars: () => { const g = new THREE.Group(); for (const sx of [-1, 1]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.22, 10), mat(0x2a2a2a, { metalness: 0.6, roughness: 0.4 })); t.position.set(sx * 0.06, 0.05, 0); t.rotation.x = Math.PI / 2; g.add(t); } return g; },
};

/**
 * Attack poses: t in [0,1]. Drive the right arm (weapon hand), left arm and torso twist.
 * Each style has a wind-up, a strike window (hitStart..hitEnd) and a recovery.
 */
export const POSES = {
  slash: (t, p, anim) => {
    const sw = t < 0.3 ? -ease.out(t / 0.3) : ease.inOut((t - 0.3) / 0.7) * 2 - 1;   // -1 raised right → +1 swept left
    p.torso.rotation.y = -sw * 0.7 * (anim.mirror ? -1 : 1);
    p.armR.shoulder.rotation.x = -1.6 + sw * 0.4;
    p.armR.shoulder.rotation.z = -0.6 + sw * 1.3;
    p.armR.shoulder.rotation.y = sw * 0.6;
    p.armR.elbow.rotation.x = -0.5 + Math.abs(sw) * 0.2;
    p.armL.shoulder.rotation.x = -1.3 + sw * 0.3; p.armL.shoulder.rotation.z = 0.35 + sw * 0.9;
    p.armL.elbow.rotation.x = -1.0;
  },
  short: (t, p) => {
    const sw = t < 0.25 ? -ease.out(t / 0.25) : ease.inOut((t - 0.25) / 0.75) * 2 - 1;
    p.torso.rotation.y = -sw * 0.5;
    p.armR.shoulder.rotation.x = -1.3 + sw * 0.5; p.armR.shoulder.rotation.z = -0.3 + sw * 1.1; p.armR.elbow.rotation.x = -0.9 + Math.abs(sw) * 0.5;
    p.armR.hand.rotation.x = Math.PI; // reverse grip
    p.armL.shoulder.rotation.x = -0.6; p.armL.elbow.rotation.x = -1.2;
  },
  heavy: (t, p) => {
    // overhead wind-up then crushing downward smash, body leans in
    const up = ease.out(Math.min(1, t / 0.45));
    const down = t < 0.45 ? 0 : ease.in(Math.min(1, (t - 0.45) / 0.25));
    const rec = t < 0.7 ? 0 : (t - 0.7) / 0.3;
    const a = -2.9 * up + 3.6 * down - 0.7 * rec;
    p.armR.shoulder.rotation.x = a; p.armL.shoulder.rotation.x = a;
    p.armR.shoulder.rotation.z = -0.2; p.armL.shoulder.rotation.z = 0.2;
    p.armR.elbow.rotation.x = -0.6 * up + 0.4 * down; p.armL.elbow.rotation.x = -0.6 * up + 0.4 * down;
    p.torso.rotation.x += -0.3 * up + 0.8 * down - 0.5 * rec;
    p.hips.position.y -= 0.12 * down * (1 - rec);
  },
  thrust: (t, p) => {
    const back = ease.out(Math.min(1, t / 0.3));
    const fwd = t < 0.3 ? 0 : ease.out(Math.min(1, (t - 0.3) / 0.2));
    const rec = t < 0.6 ? 0 : (t - 0.6) / 0.4;
    const x = -1.2 + 0.5 * back - 0.6 * fwd;
    p.armR.shoulder.rotation.x = x; p.armL.shoulder.rotation.x = x - 0.3;
    p.armR.shoulder.rotation.z = -0.25; p.armL.shoulder.rotation.z = 0.35;
    p.armR.elbow.rotation.x = -1.4 * back + 1.3 * fwd - 0.2 * rec; p.armL.elbow.rotation.x = -1.0 * back + 0.9 * fwd;
    p.torso.rotation.y = 0.6 * back - 1.0 * fwd + 0.4 * rec;
    p.torso.rotation.x += 0.25 * fwd * (1 - rec);
    p.armR.hand.rotation.x = -Math.PI / 2; // weapon horizontal, pointing forward
  },
  bow: (t, p) => {
    // left arm holds the bow forward, right hand draws to the cheek and releases
    const draw = ease.out(Math.min(1, t / 0.4));
    const rel = t < 0.4 ? 0 : ease.out(Math.min(1, (t - 0.4) / 0.15));
    p.torso.rotation.y = -0.9;
    p.armL.shoulder.rotation.x = -1.55; p.armL.shoulder.rotation.z = 0.0; p.armL.elbow.rotation.x = -0.05;
    p.armL.hand.rotation.x = -Math.PI / 2;
    p.armR.shoulder.rotation.x = -1.4 + 0.1 * draw; p.armR.shoulder.rotation.z = -0.3 - 0.9 * draw + 0.5 * rel;
    p.armR.elbow.rotation.x = -0.4 - 1.5 * draw + 1.2 * rel;
    p.head.rotation.y = 0.9;
  },
  chain: (t, p) => {
    // twirl overhead then fling the sickle forward
    const spin = Math.min(1, t / 0.45);
    const fling = t < 0.45 ? 0 : ease.out(Math.min(1, (t - 0.45) / 0.2));
    p.armR.shoulder.rotation.x = -2.6 + 1.9 * fling; p.armR.shoulder.rotation.z = -0.4 + Math.sin(spin * 12) * 0.35 * (1 - fling);
    p.armR.elbow.rotation.x = -0.3; p.armR.hand.rotation.x = Math.sin(spin * 12) * 1.5 * (1 - fling);
    p.torso.rotation.y = -0.4 + 0.9 * fling;
    p.armL.shoulder.rotation.x = -0.4; p.armL.elbow.rotation.x = -1.0;
  },
  fan: (t, p) => {
    // snap open and a tight horizontal sweep with a pivot step
    const sw = ease.inOut(t) * 2 - 1;
    p.torso.rotation.y = -sw * 1.0;
    p.armR.shoulder.rotation.x = -1.5; p.armR.shoulder.rotation.z = -0.9 + sw * 1.6; p.armR.elbow.rotation.x = -0.2 - Math.abs(sw) * 0.3;
    p.armR.hand.rotation.z = Math.PI / 2; p.armR.hand.rotation.x = -Math.PI / 2 * ease.out(Math.min(1, t * 4));
    p.armL.shoulder.rotation.x = -0.3 - sw * 0.6; p.armL.shoulder.rotation.z = 0.5;
  },
  claw: (t, p, anim) => {
    // rapid alternating punches (mirror flips each strike)
    const m = anim.mirror ? -1 : 1;
    const punch = ease.out(Math.min(1, t / 0.35)) * (t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4);
    const A = m > 0 ? p.armR : p.armL, B = m > 0 ? p.armL : p.armR;
    A.shoulder.rotation.x = -0.3 - 1.4 * punch; A.elbow.rotation.x = -1.3 + 1.2 * punch; A.shoulder.rotation.z = -0.1 * m;
    B.shoulder.rotation.x = -0.5 + 0.3 * punch; B.elbow.rotation.x = -1.6; B.shoulder.rotation.z = 0.3 * m;
    p.torso.rotation.y = -m * 0.5 * punch; p.torso.rotation.x += 0.15 * punch;
    A.hand.rotation.x = -Math.PI / 2;
  },
  use: (t, p) => {
    // generic "use item" gesture: raise right hand
    const u = Math.sin(t * Math.PI);
    p.armR.shoulder.rotation.x = -1.2 * u; p.armR.elbow.rotation.x = -1.4 * u;
  },
  throwing: (t, p) => {
    const back = ease.out(Math.min(1, t / 0.3));
    const fwd = t < 0.3 ? 0 : ease.out(Math.min(1, (t - 0.3) / 0.2));
    p.armR.shoulder.rotation.x = -1.0 - 1.6 * back + 2.4 * fwd; p.armR.elbow.rotation.x = -1.5 * back + 1.4 * fwd;
    p.torso.rotation.y = 0.5 * back - 0.9 * fwd;
  },
  cast: (t, p) => {
    const u = ease.out(Math.min(1, t / 0.3));
    p.armR.shoulder.rotation.x = -1.6 * u; p.armL.shoulder.rotation.x = -1.6 * u;
    p.armR.shoulder.rotation.z = -0.3; p.armL.shoulder.rotation.z = 0.3;
    p.armR.elbow.rotation.x = -0.2; p.armL.elbow.rotation.x = -0.2;
  },
};

/**
 * Weapon definitions. damage per hit, range (reach from player), arc (radians total),
 * cooldown = full animation length, hitAt = fraction of the animation where damage lands,
 * speed = movement multiplier while wielding.
 */
export const WEAPONS = {
  katana:     { id: 'katana', name: 'Katana', icon: '🗡️', style: 'slash', damage: 26, range: 2.6, arc: 2.4, cooldown: 0.5, hitAt: 0.5, speed: 1.0, knock: 2.5, two: true, combo: true },
  yumi:       { id: 'yumi', name: 'Yumi', icon: '🏹', style: 'bow', damage: 22, range: 30, arc: 0, cooldown: 0.62, hitAt: 0.42, speed: 1.1, projectile: 'arrow', knock: 1, two: true, offhand: true },
  odachi:     { id: 'odachi', name: 'Ōdachi', icon: '⚔️', style: 'heavy', damage: 55, range: 3.6, arc: 3.2, cooldown: 1.05, hitAt: 0.6, speed: 0.86, knock: 5, two: true },
  naginata:   { id: 'naginata', name: 'Naginata', icon: '🔱', style: 'thrust', damage: 32, range: 4.4, arc: 1.3, cooldown: 0.7, hitAt: 0.42, speed: 0.95, knock: 3.5, two: true, pierce: true },
  kanabo:     { id: 'kanabo', name: 'Kanabō', icon: '🏏', style: 'heavy', damage: 70, range: 3.0, arc: 3.6, cooldown: 1.3, hitAt: 0.62, speed: 0.8, knock: 7, two: true, stun: 1.2 },
  kusarigama: { id: 'kusarigama', name: 'Kusarigama', icon: '⛓️', style: 'chain', damage: 24, range: 9, arc: 0.5, cooldown: 0.85, hitAt: 0.5, speed: 1.0, knock: -4, projectile: 'sickle', two: false },
  wakizashi:  { id: 'wakizashi', name: 'Wakizashi', icon: '🔪', style: 'short', damage: 15, range: 2.0, arc: 2.2, cooldown: 0.28, hitAt: 0.45, speed: 1.15, knock: 1.5, keeper: true },
  tessen:     { id: 'tessen', name: 'Tessen', icon: '🪭', style: 'fan', damage: 20, range: 2.3, arc: 3.6, cooldown: 0.4, hitAt: 0.5, speed: 1.15, knock: 2, keeper: true, deflect: true },
  tekkokagi:  { id: 'tekkokagi', name: 'Tekko-Kagi', icon: '🐾', style: 'claw', damage: 30, range: 1.35, arc: 1.8, cooldown: 0.2, hitAt: 0.3, speed: 1.2, knock: 0.6, keeper: true, alternate: true },
  binoculars: { id: 'binoculars', name: 'Binoculars', icon: '🔭', style: 'use', damage: 0, range: 0, arc: 0, cooldown: 0.3, hitAt: 1, speed: 1.0, keeper: true, tool: 'zoom' },
};

/** Rubs / materials applied to the primary weapon. */
export const RUBS = {
  serrated: { label: 'Serrated', vs: 'zombie', color: 0xa8b0b8 },
  garlic:   { label: 'Garlic',   vs: 'vampire', color: 0xe9e4c8 },
  salt:     { label: 'Salt',     vs: 'ghost',   color: 0xf4f7ff },
  silver:   { label: 'Silver',   vs: 'werewolf', color: 0xeef2ff },
};
