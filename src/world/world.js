// Assembles the countryside: terrain, water, flora, temple, rocks, grass and petals.
// Also owns the static colliders every moving thing resolves against.
import * as THREE from 'three';
import { Terrain, PLAY_LIMIT, CAVES, TEMPLE_RADIUS } from './terrain.js';
import { placeFlora, buildFloraMeshes, GrassCarpet, Petals } from './foliage.js';
import { buildTemple, buildRocks, updateLanterns } from './temple.js';
import { Sky } from './sky.js';
import { wind } from './wind.js';
import { Rng } from '../../shared/rng.js';

export class World {
  constructor(scene, renderer, options) {
    this.scene = scene;
    this.options = options;
    const quality = options.quality ? 1 : 0.5;
    const rng = new Rng('vampire-samurai-world-v1');
    this.terrain = new Terrain('countryside');
    this.ground = this.terrain.buildMesh(options.quality ? 220 : 150);
    scene.add(this.ground);
    this.water = this.terrain.buildWater();
    scene.add(this.water);
    this.sky = new Sky(scene, renderer, options.shadows);

    const flora = placeFlora(this.terrain, rng.fork('flora'), quality);
    this.flora = buildFloraMeshes(flora.placements, rng.fork('mesh'), quality, options.shadows);
    scene.add(this.flora);
    this.temple = buildTemple(this.terrain, rng.fork('temple'));
    scene.add(this.temple);
    this.rocks = buildRocks(this.terrain, rng.fork('rocks'), CAVES);
    scene.add(this.rocks);
    this.grass = new GrassCarpet(this.terrain, options.quality ? 26000 : 9000, options.quality ? 46 : 32);
    scene.add(this.grass.mesh);
    this.petals = new Petals(options.quality ? 240 : 100);
    scene.add(this.petals.mesh);

    this.colliders = [...flora.colliders, ...this.temple.userData.colliders, ...this.rocks.userData.colliders];
    // Spatial hash for colliders
    this.cellSize = 8;
    this.grid = new Map();
    for (const c of this.colliders) {
      const cx = Math.floor(c.x / this.cellSize), cz = Math.floor(c.z / this.cellSize);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const k = (cx + dx) * 100000 + (cz + dz);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(c);
      }
    }
    this.lanternLit = 0;
    this.cherrySpots = flora.placements.cherry;
    this.treeSpots = Object.values(flora.placements).flat();
  }

  heightAt(x, z) { return this.terrain.heightAt(x, z); }

  /** Push a circle (x,z,r) out of static colliders, water and the map border. Returns new {x,z}. */
  resolve(x, z, r, allowWater = false) {
    const k = Math.floor(x / this.cellSize) * 100000 + Math.floor(z / this.cellSize);
    const list = this.grid.get(k);
    if (list) {
      for (const c of list) {
        const dx = x - c.x, dz = z - c.z;
        const d = Math.hypot(dx, dz), min = c.r + r;
        if (d < min && d > 1e-4) { x = c.x + dx / d * min; z = c.z + dz / d * min; }
      }
    }
    const lim = PLAY_LIMIT - r;
    if (x > lim) x = lim; if (x < -lim) x = -lim; if (z > lim) z = lim; if (z < -lim) z = -lim;
    if (!allowWater && this.terrain.isDeepWater(x, z)) return null;
    return { x, z };
  }

  /** Candidate spawn point on the map edge at angle a. */
  edgePoint(a) {
    let x = Math.cos(a) * (PLAY_LIMIT - 10), z = Math.sin(a) * (PLAY_LIMIT - 10);
    const lim = PLAY_LIMIT - 10;
    x = THREE.MathUtils.clamp(x, -lim, lim); z = THREE.MathUtils.clamp(z, -lim, lim);
    return { x, z };
  }

  /** A random walkable point within a ring around the centre. */
  randomPoint(rng, rMin, rMax, tries = 20) {
    for (let i = 0; i < tries; i++) {
      const a = rng.float(0, Math.PI * 2), r = rng.float(rMin, rMax);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.max(Math.abs(x), Math.abs(z)) > PLAY_LIMIT - 6) continue;
      if (this.terrain.isWater(x, z) || this.terrain.slopeAt(x, z) > 0.35) continue;
      if (Math.hypot(x, z) < TEMPLE_RADIUS && this.resolve(x, z, 1) === null) continue;
      return { x, y: this.heightAt(x, z), z };
    }
    return { x: 0, y: this.heightAt(0, 0), z: 40 };
  }

  setNight(on) { this.sky.setNight(on); }

  update(dt, focus, viewRadius = 0) {
    wind.update(dt);
    if (viewRadius) this.grass.setRadius(viewRadius);
    this.sky.update(dt, focus);
    this.water.userData.uniforms.uTime.value = wind.time;
    this.grass.update(focus.x, focus.z);
    this.petals.update(dt, focus.x, focus.z, this.terrain);
    const target = this.sky.targetNight;
    this.lanternLit = THREE.MathUtils.damp(this.lanternLit, target, 3, dt);
    updateLanterns(this.temple.userData.lanterns, this.lanternLit, wind.time);
  }
}
