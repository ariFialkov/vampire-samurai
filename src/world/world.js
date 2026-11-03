// Assembles the countryside: terrain, water, flora, temple, rocks, grass and petals,
// and owns the solid geometry that every moving thing walks on and collides with.
import * as THREE from 'three';
import { Terrain, PLAY_LIMIT, CAVES, TEMPLE_RADIUS, MAP_HALF, PADDY } from './terrain.js';
import { placeFlora, buildFloraMeshes, Petals } from './foliage.js';
import { Grass } from './grass.js';
import { buildTemple, buildRocks, updateLanterns, TEMPLE } from './temple.js';
import { Solids, STEP_HEIGHT } from './solids.js';
import { Sky } from './sky.js';
import { wind } from './wind.js';
import { Rng } from '../../shared/rng.js';

export class World {
  constructor(scene, renderer, options) {
    this.scene = scene;
    this.options = options;
    const quality = options.quality ? 1 : 0.6;
    const rng = new Rng('vampire-samurai-world-v2');
    this.terrain = new Terrain('countryside');
    this.solids = new Solids();
    this.ground = this.terrain.buildMesh();
    scene.add(this.ground);
    this.water = this.terrain.buildWater();
    scene.add(this.water);
    this.sky = new Sky(scene, renderer, options.shadows, options.quality ? 2048 : 1024);

    this.temple = buildTemple(this.terrain, rng.fork('temple'), this.solids);
    scene.add(this.temple);
    this.rocks = buildRocks(this.terrain, rng.fork('rocks'), CAVES, this.solids);
    scene.add(this.rocks);
    const flora = placeFlora(this.terrain, rng.fork('flora'), quality, this.solids);
    this.flora = buildFloraMeshes(flora.placements, rng.fork('mesh'), options.quality ? 1 : 0.85, options.shadows);
    scene.add(this.flora);
    this.grass = new Grass(this, options.quality ? { count: 110000, radius: 30 } : { count: 32000, radius: 20 }, options.shadows);
    scene.add(this.grass.mesh);
    this.petals = new Petals(options.quality ? 240 : 110);
    scene.add(this.petals.mesh);

    this.lanternLit = 0;
    this.treeSpots = Object.values(flora.placements).flat();
  }

  /** Terrain height only (no structures). */
  heightAt(x, z) { return this.terrain.heightAt(x, z); }

  /** Feet height at (x,z) for something whose feet are currently at y. */
  groundAt(x, z, y = Infinity) {
    return Math.max(this.terrain.heightAt(x, z), this.solids.topAt(x, z, y));
  }

  /** Height of the walkable surface at (x,z) (temple floors included), for placing things. */
  surfaceAt(x, z) { return this.groundAt(x, z, this.terrain.heightAt(x, z) + 2.5); }

  /** A nearby open spot (not inside a wall, tree or deep water) around (x,z), or null. */
  openSpotNear(x, z, r = 0.6, tries = 8, spread = 2) {
    for (let i = 0; i < tries; i++) {
      const a = i * 2.39996, d = i === 0 ? 0 : spread * Math.sqrt(i);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (this.isOpen(px, pz, r)) return { x: px, z: pz, y: this.surfaceAt(px, pz) };
    }
    return null;
  }

  /**
   * Move a circle of radius r from `pos` (with feet at pos.y) toward (nx, nz).
   * Resolves solids, steep terrain, deep water and the map border; slides along walls.
   * Returns {x, z, y} where y is the ground height at the new spot.
   */
  move(pos, nx, nz, r, opts = {}) {
    const y = pos.y;
    const tryAt = (x, z) => {
      const p = this.solids.pushOut(x, z, r, y);
      const lim = PLAY_LIMIT - r;
      p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-lim, Math.min(lim, p.z));
      if (!opts.water && this.terrain.isDeepWater(p.x, p.z)) return null;
      const g = this.groundAt(p.x, p.z, y);
      // terrain too steep to climb (cliffs, mountain ring)
      if (!opts.climb && g > y + STEP_HEIGHT * 0.6 && this.terrain.slopeAt(p.x, p.z) > 0.55) return null;
      p.y = g;
      return p;
    };
    return tryAt(nx, nz) ?? tryAt(nx, pos.z) ?? tryAt(pos.x, nz) ?? { x: pos.x, z: pos.z, y: this.groundAt(pos.x, pos.z, y) };
  }

  /** Temple level of feet height y at (x,z): 0 ground, 1 lower terrace, 2 upper terrace. */
  templeLevel(x, z, y) {
    const r = Math.hypot(x, z);
    if (r > TEMPLE.R1 + 0.5) return 0;
    const base = this.terrain.templeY;
    if (y > base + TEMPLE.H1 + TEMPLE.H2 - 0.2 && r < TEMPLE.R2 + 0.3) return 2;
    if (y > base + TEMPLE.H1 - 0.2) return 1;
    return 0;
  }

  /**
   * Where to walk to reach `to` from `from` (both {x,z} with feet y). Climbing onto a temple
   * terrace means going via its stairs; everything else is a straight line (dropping off a
   * ledge is always allowed).
   */
  navWaypoint(from, fromY, to, toY) {
    const a = this.templeLevel(from.x, from.z, fromY), b = this.templeLevel(to.x, to.z, toY);
    if (b <= a) return to;
    // stairs up from level a: lower flights face the cardinal directions, upper ones the diagonals
    const angles = a === 0 ? [0, Math.PI / 2, Math.PI, -Math.PI / 2] : [Math.PI / 4, 3 * Math.PI / 4, -Math.PI / 4, -3 * Math.PI / 4];
    const R = a === 0 ? TEMPLE.R1 : TEMPLE.R2;
    let best = null, bd = Infinity;
    for (const ang of angles) {
      const bx = Math.cos(ang) * (R + 3.2), bz = Math.sin(ang) * (R + 3.2);
      const d = Math.hypot(bx - from.x, bz - from.z) + Math.hypot(bx - to.x, bz - to.z);
      if (d < bd) { bd = d; best = { ang, bx, bz }; }
    }
    // at the foot of the stairs: walk straight up them
    if (Math.hypot(best.bx - from.x, best.bz - from.z) < 2.2) return { x: Math.cos(best.ang) * (R - 2), z: Math.sin(best.ang) * (R - 2) };
    return { x: best.bx, z: best.bz };
  }

  /** Candidate spawn point on the map edge at angle a. */
  edgePoint(a) {
    const lim = PLAY_LIMIT - 10;
    const x = THREE.MathUtils.clamp(Math.cos(a) * lim, -lim, lim), z = THREE.MathUtils.clamp(Math.sin(a) * lim, -lim, lim);
    return { x, z };
  }

  /** Is (x,z) open ground a monster can stand on? */
  isOpen(x, z, r = 0.6) {
    if (Math.max(Math.abs(x), Math.abs(z)) > PLAY_LIMIT - 4) return false;
    if (this.terrain.isDeepWater(x, z)) return false;
    const p = this.solids.pushOut(x, z, r, this.surfaceAt(x, z));
    return Math.hypot(p.x - x, p.z - z) < 0.01;
  }

  setNight(on) { this.sky.setNight(on); }

  update(dt, focus, opts = {}) {
    wind.update(dt);
    this.sky.update(dt, focus, opts.shadowHalf);
    this.water.userData.uniforms.uTime.value = wind.time;
    this.grass.update(dt, focus, opts.grassSpread ?? 1, opts.interactors);
    this.petals.update(dt, focus.x, focus.z, this.terrain);
    this.lanternLit = THREE.MathUtils.damp(this.lanternLit, this.sky.targetNight, 3, dt);
    updateLanterns(this.temple, this.lanternLit, wind.time);
  }
}

export { MAP_HALF, PADDY, TEMPLE_RADIUS };
