import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WEAPON_RIGS, MOVE_KINDS, attackTrack, moveTrack, moveSteps, sample, handPos, dirFrom, solveArm, toChest } from '../src/entities/attacks.js';
import { buildHumanoid } from '../src/entities/humanoid.js';
import { CHARACTER_BY_ID } from '../src/entities/characters.js';

// the kasa is a shallow cone: 0.44 m brim at y 0.99 (torso space) rising to a point at 1.19
const hatR = (y) => 0.47 * Math.min(1, Math.max(0, (1.2 - y) / 0.22));
const BLADE = { katana: 1.0, odachi: 1.7, kanabo: 1.3, naginata: 0.65, wakizashi: 0.6, tessen: 0.45, tekkokagi: 0.42 };
const MELEE = Object.entries(WEAPON_RIGS).filter(([, r]) => r.moves);

test('every melee weapon has a strike for each direction and a combo', () => {
  for (const [id, rig] of MELEE) {
    for (const k of ['cutL', 'cutR', 'thrust', 'cleave']) assert.ok(rig.moves[k], `${id} lacks ${k}`);
    assert.ok(rig.combo.length && rig.combo.every((k) => rig.moves[k]), `${id} combo`);
    for (const [k, m] of Object.entries(rig.moves)) {
      assert.ok(MOVE_KINDS[m.kind], `${id} ${k} kind`);
      const times = m.keys.map((x) => x.t);
      assert.ok(times.every((t, i) => !i || t > times[i - 1]), `${id} ${k} keys in order`);
      assert.ok(m.hit > times[0] && m.hit <= times[times.length - 1], `${id} ${k} hit inside the strike`);
    }
  }
});

test('every strike points forward at the moment of impact, from any starting pose', () => {
  for (const [id, rig] of MELEE) {
    const starts = [rig.carry, ...Object.values(rig.moves).map((m) => m.keys[m.keys.length - 1])];
    for (const [k, m] of Object.entries(rig.moves)) {
      if (m.kind === 'whirl') continue;
      for (const from of starts) for (const ease of [1, 0.45]) {
        const tr = moveTrack(m, from, ease);
        const P = sample(tr.keys, tr.hit, {});
        const tip = dirFrom(P.ty, P.tp);
        assert.ok(tip.z > 0.85, `${id} ${k}: tip ${tip.toArray().map((n) => n.toFixed(2))}`);
      }
    }
  }
  for (const id of ['yumi']) for (const v of WEAPON_RIGS[id].variants) {
    const P = sample(attackTrack(WEAPON_RIGS[id], v), v.hitAt, {});
    assert.ok(dirFrom(P.ty, P.tp).y > 0.9, 'bow held upright');
  }
});

test('footwork lands by the hit and stays inside the move', () => {
  for (const [id, rig] of MELEE) for (const [k, m] of Object.entries(rig.moves)) {
    const tr = moveTrack(m, rig.carry, 1);
    for (const st of moveSteps(m, tr.windup, tr.hit, tr.end)) {
      assert.ok(st.t1 > st.t0 && st.t0 >= 0 && st.t1 <= tr.end + 1e-6, `${id} ${k} step timing`);
      assert.ok(Math.abs(st.x) < 0.3 && Math.abs(st.z) < 0.5, `${id} ${k} step size`);
    }
  }
});

test('blades never pass through the head or hat, chaining any strike into any other', () => {
  const owners = { katana: 'katana', odachi: 'odachi', kanabo: 'kanabo', naginata: 'naginata', wakizashi: 'katana', tessen: 'naginata', tekkokagi: 'katana' };
  for (const [id, len] of Object.entries(BLADE)) {
    const rig = WEAPON_RIGS[id], look = CHARACTER_BY_ID[owners[id]].look;
    const parts = buildHumanoid(look);
    const cy = parts.chest.position.y;
    const { upper: a, lower: b } = parts.armLen;
    const starts = [rig.carry, ...Object.values(rig.moves).map((m) => m.keys[m.keys.length - 1])];
    for (const [k, m] of Object.entries(rig.moves)) for (const from of starts) {
      const tr = moveTrack(m, from, 1);
      for (let i = 0; i <= 40; i++) {
        const P = sample(tr.keys, (i / 40) * tr.end, {});
        const hand = toChest(parts, handPos(P.y, P.h, P.r)), tip = dirFrom(P.ty, P.tp);
        const got = solveArm(parts.armR, hand, a, b, new THREE.Vector3(0.7, -1, -0.35)).add(new THREE.Vector3(0, cy, 0));
        for (let s = 0.15; s <= rig.mount + len; s += 0.05) {
          const p = got.clone().addScaledVector(tip, s);
          assert.ok(Math.hypot(p.x, p.y - 0.88, p.z) > (look.hat === 'helmet' ? 0.25 : 0.2), `${id} ${k} through head at ${i}/40`);
          if (look.hat === 'kasa' && p.y > 0.95 && p.y < 1.2) assert.ok(Math.hypot(p.x, p.z) > hatR(p.y), `${id} ${k} through hat at ${i}/40`);
        }
      }
    }
  }
});
