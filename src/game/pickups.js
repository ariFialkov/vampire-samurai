// Collectibles lying in the world: spawning, bobbing, pickup and swapping.
import * as THREE from 'three';
import { ITEMS, buildPickupMesh, rollSpawnItem } from '../entities/collectibles.js';
import { WEAPONS } from '../entities/weapons.js';

export class Pickups {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.timer = 4;
    this.pending = [];
    this.max = 16;
  }
  spawn(id, pos, count) {
    const def = ITEMS[id];
    const n = count ?? def.pickupCount ?? 1;
    const mesh = buildPickupMesh(id, n);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    const p = { id, count: n, mesh, pos: pos.clone(), t: Math.random() * 6, ttl: def.kind === 'upgrade' ? 60 : 90 };
    this.list.push(p);
    return p;
  }
  spawnNear(pos, id, radius) {
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * radius;
    const q = this.game.world.openSpotNear(pos.x + Math.cos(a) * r, pos.z + Math.sin(a) * r) ?? { x: pos.x, z: pos.z, y: pos.y };
    return this.spawn(id, new THREE.Vector3(q.x, q.y, q.z));
  }
  spawnLater(id, pos, delay) { this.pending.push({ id, pos, delay }); }
  remove(p) { this.game.scene.remove(p.mesh); this.list.splice(this.list.indexOf(p), 1); }
  clear() { for (const p of this.list) this.game.scene.remove(p.mesh); this.list.length = 0; this.pending.length = 0; }

  update(dt) {
    const game = this.game, player = game.player, rng = game.rng;
    for (let i = this.pending.length - 1; i >= 0; i--) { const q = this.pending[i]; q.delay -= dt; if (q.delay <= 0) { this.spawn(q.id, q.pos); this.pending.splice(i, 1); } }
    // periodic spawns around the player, more under the Lucky Spell
    this.timer -= dt * (player.status.lucky > 0 ? 3.2 : 1);
    if (this.timer <= 0 && this.list.length < this.max) {
      this.timer = 7 + rng.float(0, 5);
      const id = rollSpawnItem(rng, player.slots, player.status.lucky > 0);
      const a = rng.float(0, Math.PI * 2), r = rng.float(10, 34);
      const q = game.world.openSpotNear(player.pos.x + Math.cos(a) * r, player.pos.z + Math.sin(a) * r);
      if (q && !game.world.terrain.isWater(q.x, q.z)) this.spawn(id, new THREE.Vector3(q.x, q.y, q.z));
    }
    // bob + collect
    let near = null, nd = 1e9;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt; p.ttl -= dt;
      p.mesh.userData.core.position.y = 0.8 + Math.sin(p.t * 2.2) * 0.15;
      p.mesh.userData.core.rotation.y += dt * 1.2;
      if (p.ttl <= 0) { this.remove(p); continue; }
      if (!player.alive) continue;
      const d = Math.hypot(p.pos.x - player.pos.x, p.pos.z - player.pos.z);
      if (d < 1.3 && !p.declined) {
        const n = player.take(p.id, p.count, game.ctx);
        if (n > 0) {
          game.sound?.('pickup');
          if (n >= p.count) { this.flash(p); this.remove(p); continue; }
          p.count -= n;                       // the rest stays on the ground
          p.declined = true;
        }
      }
      if (d > 1.6) p.declined = false;       // step away and back to try again
      if (d < 2.2 && d < nd && !player.isUseless(p.id)) { near = p; nd = d; }
    }
    player.nearItem = near;
    game.hud.setEquipAvailable(!!near && !player.hasSpaceFor(near.id));
  }
  /** M / right-click / Equip: swap the selected slot's item for the nearby collectible. */
  equipNear() {
    const game = this.game, player = game.player, p = player.nearItem;
    if (!p) return;
    if (player.isUseless(p.id)) return;
    if (player.hasSpaceFor(p.id)) {
      const n = player.take(p.id, p.count, game.ctx);
      if (n >= p.count) { this.flash(p); this.remove(p); } else p.count -= n;
      return;
    }
    const old = player.swap(p.id, Math.min(p.count, ITEMS[p.id].max));
    this.flash(p); this.remove(p);
    if (old) { const drop = this.spawn(old.id, player.pos.clone(), old.count); drop.ttl = 120; drop.declined = true; }
    game.hud.toast(`Equipped ${ITEMS[p.id].name}`);
  }
  flash(p) { this.game.effects.burst(p.pos.clone().setY(p.pos.y + 0.8), { count: 14, color: [0xffffff, 0xffe9a0], speed: 2, life: 0.5, size: 0.8, gravity: -1 }); }
}
