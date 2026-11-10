import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Rotation, KeyRing, Doubles } from '../src/core/gestures.js';
import { TECHNIQUES, BOW_TECHNIQUES, techniquesFor, pickTechnique, tempoOf, withOffHand } from '../src/entities/specials.js';
import { WEAPON_RIGS, sample, handPos, dirFrom, solveArm, toChest } from '../src/entities/attacks.js';
import { buildHumanoid } from '../src/entities/humanoid.js';
import { CHARACTER_BY_ID } from '../src/entities/characters.js';

test('rolling a full circle is recognised as it closes, either way round', () => {
  for (const dir of [1, -1]) {
    const r = new Rotation();
    let got = null;
    for (let i = 0; i <= 40 && !got; i++) got = r.add(dir * (i / 40) * Math.PI * 2, i * 0.012);
    assert.equal(got?.g, 'circle'); assert.equal(got.rot, dir);
  }
});

test('a half circle reports on release; a flick or slow wander does not', () => {
  const r = new Rotation();
  for (let i = 0; i <= 12; i++) r.add((i / 12) * Math.PI * 0.95, i * 0.02);
  assert.equal(r.end()?.g, 'half');
  for (let i = 0; i < 5; i++) r.add(0.1 * i, i * 0.02);
  assert.equal(r.end(), null, 'a flick');
  for (let i = 0; i <= 40; i++) r.add((i / 40) * Math.PI * 2, i * 0.08);   // a full turn over 3 s is no gesture
  assert.equal(r.end(), null, 'too slow');
});

test('arrow keys in turn: three is a half circle, four a full circle; doubles', () => {
  const k = new KeyRing();
  assert.equal(k.press('up', 0), null); assert.equal(k.press('right', 0.1), null); assert.equal(k.press('down', 0.2), null);
  assert.equal(k.poll(0.25), null, 'waits to see if a fourth comes');
  assert.deepEqual(k.press('left', 0.3)?.g, 'circle');
  k.press('left', 2); k.press('down', 2.1); k.press('right', 2.2);
  assert.equal(k.poll(2.5)?.g, 'half');
  const d = new Doubles();
  assert.equal(d.strike('up', 0), null); assert.equal(d.strike('up', 0.2)?.g, 'double:up');
  assert.equal(d.strike('up', 0.3), null, 'a third does not double again');
  assert.equal(d.strike('left', 1), null); assert.equal(d.strike('left', 1.6), null, 'too slow');
});

test('the tree: a string of strikes before the gesture unlocks the stronger technique', () => {
  const list = techniquesFor('katana', WEAPON_RIGS.katana);
  const H = (...keys) => keys.map((key) => ({ key }));
  assert.equal(pickTechnique(list, 'circle', [], 0, {}).id, 'whirlwind');
  assert.equal(pickTechnique(list, 'circle', H('cutL', 'cutR'), 1, {}).id, 'tengu');
  assert.equal(pickTechnique(list, 'circle', H('cutL', 'cutL'), 1, {}).id, 'whirlwind', 'the cuts must alternate');
  assert.equal(pickTechnique(list, 'circle', H('thrust', 'cleave'), 1, {}).id, 'petals');
  assert.equal(pickTechnique(list, 'circle', H('thrust', 'cleave'), 0, {}).id, 'whirlwind', 'petals needs flow');
  assert.equal(pickTechnique(list, 'circle', [], 0, { whirlwind: 1 }), null, 'cooling down');
  assert.equal(pickTechnique(list, 'half', [], 0, {}).id, 'dragon');
  assert.equal(pickTechnique(list, 'double:up', [], 0, {}).id, 'flash');
  assert.equal(pickTechnique(list, 'double:left', [], 0, {}).id, 'cross');
  assert.equal(pickTechnique(techniquesFor('yumi', WEAPON_RIGS.yumi), 'circle', [], 0, {}).id, 'storm');
  assert.equal(techniquesFor('kanabo', WEAPON_RIGS.kanabo).find((t) => t.id === 'whirlwind').name, 'Oni Typhoon');
});

test('techniques are well formed for every weapon and tempo', () => {
  for (const [id, rig] of Object.entries(WEAPON_RIGS)) {
    const list = techniquesFor(id, rig);
    const T = id === 'yumi' ? 1 : tempoOf(rig);
    for (const tech of list) {
      const s = tech.build(T);
      const times = s.keys.map((k) => k.t);
      assert.ok(times.every((t, i) => t > (i ? times[i - 1] : 0)), `${id} ${tech.id} key order`);
      const end = times[times.length - 1];
      for (const h of s.hits) assert.ok(h.t > 0 && h.t <= end, `${id} ${tech.id} hit inside`);
      if (s.spin) assert.ok(s.spin.t0 < s.spin.t1 && s.spin.t1 <= end + 1e-9, `${id} ${tech.id} spin inside`);
      if (s.air) assert.ok(s.air.t1 <= end + 1e-9 && s.air.h > 0, `${id} ${tech.id} air`);
      if (rig.off === 'track') assert.ok(withOffHand(s.keys, rig).every((k) => k.O), `${id} ${tech.id} off hand`);
    }
  }
});

const hatR = (y) => 0.47 * Math.min(1, Math.max(0, (1.2 - y) / 0.22));
test('no technique swings the blade through the head or hat', () => {
  const BLADE = { katana: 1.0, odachi: 1.7, kanabo: 1.3, naginata: 0.65, wakizashi: 0.6, tessen: 0.45, tekkokagi: 0.42 };
  const owners = { katana: 'katana', odachi: 'odachi', kanabo: 'kanabo', naginata: 'naginata', wakizashi: 'katana', tessen: 'naginata', tekkokagi: 'katana' };
  for (const [id, len] of Object.entries(BLADE)) {
    const rig = WEAPON_RIGS[id], look = CHARACTER_BY_ID[owners[id]].look, parts = buildHumanoid(look);
    const cy = parts.chest.position.y, { upper: a, lower: b } = parts.armLen;
    const starts = [rig.carry, ...Object.values(rig.moves).map((m) => m.keys[m.keys.length - 1])];
    for (const tech of techniquesFor(id, rig)) for (const from of starts) {
      const s = tech.build(tempoOf(rig));
      const keys = [{ ...from, t: 0 }, ...s.keys], end = keys[keys.length - 1].t;
      for (let i = 0; i <= 50; i++) {
        const P = sample(keys, (i / 50) * end, {});
        const tip = dirFrom(P.ty, P.tp);
        const got = solveArm(parts.armR, toChest(parts, handPos(P.y, P.h, P.r)), a, b, new THREE.Vector3(0.7, -1, -0.35)).add(new THREE.Vector3(0, cy, 0));
        for (let d = 0.15; d <= rig.mount + len; d += 0.05) {
          const p = got.clone().addScaledVector(tip, d);
          assert.ok(Math.hypot(p.x, p.y - 0.88, p.z) > (look.hat === 'helmet' ? 0.25 : 0.2), `${id} ${tech.id} through head at ${i}/50`);
          if (look.hat === 'kasa' && p.y > 0.95 && p.y < 1.2) assert.ok(Math.hypot(p.x, p.z) > hatR(p.y), `${id} ${tech.id} through hat at ${i}/50`);
        }
      }
    }
  }
});
