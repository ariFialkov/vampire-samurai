import test from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/entities/player.js';
import { CHARACTER_BY_ID } from '../src/entities/characters.js';

const world = { surfaceAt: () => 0, heightAt: () => 0 };
const scene = { add() {}, remove() {} };
const ctx = { toast() {} };
const fresh = () => new Player(CHARACTER_BY_ID.katana, scene, world);
const view = (p) => p.slots.map((s) => (s ? `${s.id}:${s.count}` : '-')).join(' ');

test('the same collectible can fill more than one slot', () => {
  const p = fresh();
  for (let i = 0; i < 4; i++) assert.equal(p.take('green_tea', 1, ctx), 1);
  assert.equal(view(p), 'katana:1 green_tea:2 green_tea:2 - -');
  assert.equal(p.take('green_tea', 1, ctx), 1);
  assert.equal(view(p), 'katana:1 green_tea:2 green_tea:2 green_tea:1 -');
});

test('stacks top up first, overflow spills into a free slot, leftovers stay out', () => {
  const p = fresh();
  for (let i = 0; i < 4; i++) p.take('shuriken', 3, ctx);
  assert.equal(view(p), 'katana:1 shuriken:12 - - -');
  assert.equal(p.take('shuriken', 3, ctx), 3);
  assert.equal(view(p), 'katana:1 shuriken:12 shuriken:3 - -');
  p.take('super_stomp', 1, ctx); p.take('super_stomp', 1, ctx);
  assert.equal(p.take('super_stomp', 1, ctx), 0, 'no room left');
});

test('using the last of an item returns to the primary weapon', () => {
  const p = fresh();
  p.take('mulberry', 1, ctx);
  p.select(1);
  p.consume();
  assert.equal(p.selected, 0);
  assert.equal(p.slots[1], null);
});
