import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WEAPON_RIGS, attackTrack, sample, handPos, dirFrom, solveArm } from '../src/entities/attacks.js';
import { buildHumanoid } from '../src/entities/humanoid.js';
import { CHARACTER_BY_ID } from '../src/entities/characters.js';

const BLADE = { katana: 1.0, odachi: 1.7, kanabo: 1.3, naginata: 0.65, wakizashi: 0.6, tessen: 0.45, tekkokagi: 0.42 };

test('every weapon strike points forward at the moment of impact', () => {
  for (const [id, rig] of Object.entries(WEAPON_RIGS)) {
    for (const v of rig.variants) {
      if (v.hitAt >= 1) continue;
      const P = sample(attackTrack(rig, v), v.hitAt, {});
      const tip = dirFrom(P.ty, P.tp);
      if (id === 'yumi') { assert.ok(tip.y > 0.9, 'bow held upright'); continue; }
      assert.ok(tip.z > 0.85, `${id} ${v.name}: tip ${tip.toArray().map((n) => n.toFixed(2))}`);
    }
  }
});

test('blades never pass through the head or hat', () => {
  const owners = { katana: 'katana', odachi: 'odachi', kanabo: 'kanabo', naginata: 'naginata', wakizashi: 'katana', tessen: 'naginata', tekkokagi: 'katana' };
  for (const [id, len] of Object.entries(BLADE)) {
    const rig = WEAPON_RIGS[id], look = CHARACTER_BY_ID[owners[id]].look;
    const parts = buildHumanoid(look);
    const { upper: a, lower: b } = parts.armLen;
    for (const v of rig.variants) {
      const track = attackTrack(rig, v);
      for (let i = 0; i <= 50; i++) {
        const P = sample(track, i / 50, {});
        const hand = handPos(P.y, P.h, P.r), tip = dirFrom(P.ty, P.tp);
        const got = solveArm(parts.armR, hand, a, b, new THREE.Vector3(0.7, -1, -0.35));
        for (let s = 0.15; s <= rig.mount + len; s += 0.05) {
          const p = got.clone().addScaledVector(tip, s);
          assert.ok(Math.hypot(p.x, p.y - 0.88, p.z) > (look.hat === 'helmet' ? 0.25 : 0.2), `${id} ${v.name} through head at t=${i / 50}`);
          if (look.hat === 'kasa' && p.y > 0.95 && p.y < 1.2) assert.ok(Math.hypot(p.x, p.z) > 0.46, `${id} ${v.name} through hat at t=${i / 50}`);
        }
      }
    }
  }
});
