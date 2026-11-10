// Kinetic body for the samurai. Instead of playing canned loops on every joint, the body is
// driven from the ground up:
//   feet   are planted in the world and only move when they step (a gait stepper paced by
//          speed, settle steps when standing, and the footwork each strike asks for)
//   legs   reach those feet with two-bone IK, ankles keep the soles on the ground
//   hips   sit as high as the planted feet allow, sway over the supporting foot and dip on
//          landings (a spring, so weight visibly settles)
//   spine  lumbar + chest share the strike's twist with the hips leading (the kinetic chain),
//          lean into acceleration and bank into turns through underdamped springs
//   head   tracks the nearest threat (or scans the land), keeping the gaze level
//   arms   follow the weapon (IK in chest space) or hang and swing as counterweights
// Any abrupt change of pose (weapon swap, item use, death) is hidden by inertial blending.
import * as THREE from 'three';
import { poseArms, freeArm, solveTwoBone } from './attacks.js';
import { angleDiff } from '../core/math.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/** Damped spring toward a target: w = natural frequency (rad/s), z = damping ratio (1 = critical). */
export class Spring {
  constructor(x = 0) { this.x = x; this.v = 0; }
  to(target, w, z, dt) {
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (w * w * (target - this.x) - 2 * z * w * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3(), _pole = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _qd = new THREE.Quaternion(), _e = new THREE.Euler();
const ID = new THREE.Quaternion();

export class Body {
  /** parts: a humanoid rig from buildHumanoid. */
  constructor(parts) {
    this.p = parts;
    this.a = parts.legLen.upper; this.b = parts.legLen.lower;
    this.ankleH = parts.ankleH;
    this.restHipsY = parts.hips.position.y;
    this.hipX = parts.legR.hip.position.x; this.hipY = parts.legR.hip.position.y;
    parts.hips.rotation.order = 'YXZ'; parts.torso.rotation.order = 'YXZ'; parts.chest.rotation.order = 'YXZ';
    parts.neck.rotation.order = 'YXZ'; parts.head.rotation.order = 'YXZ';
    const mk = (side, leg) => ({ side, leg, pos: new THREE.Vector3(), yaw: 0, pitch: 0, swing: null, lifted: false, stanceU: -1, local: new THREE.Vector3() });
    this.R = mk(1, parts.legR); this.L = mk(-1, parts.legL);
    this.feet = [this.R, this.L];
    // resting stance: weapon-side foot a little forward, the other back and turned out (ready, balanced)
    const w = this.hipX;
    this.stance = { 1: { x: w * 1.15, z: 0.09, yaw: 0.08 }, [-1]: { x: -w * 1.15, z: -0.11, yaw: -0.42 } };
    this.gaitStance = { 1: { x: w * 0.82, z: 0, yaw: 0.04 }, [-1]: { x: -w * 0.82, z: 0, yaw: -0.04 } };
    this.hy = new Spring(this.restHipsY); this.sway = new Spring(); this.fwd = new Spring();
    this.lean = new Spring(); this.bank = new Spring(); this.kick = new Spring(); this.flinch = new Spring();
    this.headYaw = new Spring(); this.headPitch = new Spring();
    this.phase = 0; this.walking = false; this.still = 0;
    this.aF = 0; this.aR = 0; this.prevVel = new THREE.Vector3(); this.prevFacing = 0;
    this.breath = Math.random() * 6; this.exert = 0;
    this.scan = 0; this.scanPitch = 0; this.scanT = 1.5;
    this.ready = false;
    // inertial blending
    this.joints = [parts.hips, parts.torso, parts.chest, parts.neck, parts.head];
    for (const arm of [parts.armL, parts.armR]) this.joints.push(arm.shoulder, arm.elbow, arm.hand);
    for (const leg of [parts.legL, parts.legR]) this.joints.push(leg.hip, leg.knee, leg.ankle);
    this.moved = [parts.hips, parts.armL.shoulder, parts.armR.shoulder];
    this.blend = null; this.blendReq = 0;
    this.cur = null;
  }

  /** Include extra objects (weapon grips) in inertial blending. */
  track(...objs) { for (const o of objs) if (!this.joints.includes(o)) this.joints.push(o); }

  /** Smoothly hide a discontinuity in the pose this frame (weapon swap, gesture start/end...). */
  transition(dur = 0.2) { this.blendReq = Math.max(this.blendReq, dur); }

  // ------------------------------------------------------------------ frames
  toWorld(x, z, pos, f, out) {
    const c = Math.cos(f), s = Math.sin(f), k = this.sc;
    return out.set(pos.x + k * (x * c + z * s), pos.y, pos.z + k * (-x * s + z * c));
  }
  toLocal(w, out) {
    const { pos, facing: f } = this.cur, c = Math.cos(f), s = Math.sin(f), k = 1 / this.sc;
    const dx = w.x - pos.x, dz = w.z - pos.z;
    return out.set((dx * c - dz * s) * k, (w.y - pos.y) * k, (dx * s + dz * c) * k);
  }
  stanceTarget(foot, out) {
    const st = this.stance[foot.side];
    this.toWorld(st.x, st.z, this.cur.pos, this.cur.facing, out);
    out.y = this.cur.ground(out.x, out.z);
    return this.cur.facing + st.yaw;
  }

  startSwing(foot, dur, h, target, cmd) {
    foot.swing = { from: foot.pos.clone(), fromYaw: foot.yaw, t: 0, dur: Math.max(0.06, dur), h, target, cmd };
  }

  /** Put the feet straight into stance (spawn, teleport). */
  plant(s) {
    this.cur = s; this.sc = this.p.root.scale.x;
    for (const f of this.feet) { f.yaw = this.stanceTarget(f, f.pos); f.swing = null; }
    this.prevFacing = s.facing; this.prevVel.copy(s.vel); this.ready = true;
  }

  // ------------------------------------------------------------------ update
  /**
   * s: { pos, facing, vel, ground(x,z), moveDir (Vector2|null), look (Vector3|null),
   *      pose, poseLead, poseMid (weapon channels or null), rig, grips, wstate, intensity,
   *      act ({t, rate, end, steps, fired, endPos} | null), item ({fn, t} | null),
   *      dying (seconds, or -1), hurt (0..1 kick this frame) }
   */
  update(dt, s) {
    dt = Math.max(1e-4, Math.min(0.05, dt));
    this.cur = s; this.sc = this.p.root.scale.x;
    if (!this.ready) this.plant(s);
    const p = this.p, f = s.facing, pos = s.pos, vel = s.vel;
    const v = Math.hypot(vel.x, vel.z);
    const cf = Math.cos(f), sf = Math.sin(f);
    // acceleration in the body's own frame (forward / weapon side), smoothed
    const ax = clamp((vel.x - this.prevVel.x) / dt, -30, 30), az = clamp((vel.z - this.prevVel.z) / dt, -30, 30);
    this.prevVel.copy(vel);
    const df = angleDiff(this.prevFacing, f);
    const k = 1 - Math.exp(-10 * dt);
    this.aF = lerp(this.aF, ax * sf + az * cf, k);
    this.aR = lerp(this.aR, ax * cf - az * sf, k);
    this.prevFacing = f;
    const dying = s.dying ?? -1;
    const g = sstep(0.35, 1.5, v) * (dying >= 0 ? 0 : 1);
    const run = sstep(3, 6, v);
    const P = s.pose, PL = s.poseLead ?? P, PM = s.poseMid ?? P;
    const R = this.R, L = this.L;

    // ---------------------------------------------------------------- feet
    const act = s.act;
    let footwork = false;
    // spinning on the spot: planted feet pivot with the body instead of twisting the legs
    if (s.pivot && df) {
      const c = Math.cos(df), sn = Math.sin(df);
      for (const foot of this.feet) {
        if (foot.swing || foot.airborne) continue;
        const dx = foot.pos.x - pos.x, dz = foot.pos.z - pos.z;
        foot.pos.x = pos.x + dx * c + dz * sn; foot.pos.z = pos.z - dx * sn + dz * c;
        foot.yaw += df;
      }
    }
    // airborne: the feet tuck (or trail behind in a dash) and are carried with the body
    const airborne = !!s.airFeet;
    let airLanding = 0;
    for (const foot of this.feet) {
      if (airborne) {
        // carried in the body's own frame, so they turn with it through a spin
        const fp = s.airFeet[foot.side];
        if (!foot.airborne) { foot.airborne = true; foot.swing = null; foot.airLocal = this.toLocal(foot.pos, new THREE.Vector3()); }
        // the tuck eases out as the body comes back down, so the feet reach for the ground
        foot.airLocal.lerp(_a.set(fp.x, fp.y * Math.min(1, ((s.air ?? 0) + 0.04) / 0.4), fp.z), 1 - Math.exp(-14 * dt));
        this.toWorld(foot.airLocal.x, foot.airLocal.z, pos, f, foot.pos); foot.pos.y = pos.y + foot.airLocal.y * this.sc;
        foot.yaw = f + (foot.side > 0 ? 0.1 : -0.25);
      } else if (foot.airborne) {
        foot.airborne = false; airLanding = 0.9;
      }
    }
    if (airborne) footwork = true;
    if (act && dying < 0 && !airborne) {
      footwork = act.steps.length > 0 && act.t < act.end + 0.05;
      act.steps.forEach((st, i) => {
        if (act.fired.has(i) || act.t < st.t0) return;
        act.fired.add(i);
        const foot = st.side > 0 ? R : L;
        this.startSwing(foot, (st.t1 - st.t0) / act.rate, st.h, (out) => {
          this.toWorld(st.x, st.z, act.endPos, this.cur.facing, out);
          return this.cur.facing + st.yaw;
        }, true);
      });
    }
    if (v > 0.3 && !footwork && dying < 0) {
      const legLen = (this.a + this.b) * this.sc;
      const cad = (1.7 + 0.32 * v) * Math.sqrt(0.8 / legLen), T = 2 / cad;
      // a foot can only sweep so far under the body while it's down (about 0.9 leg lengths);
      // faster than that the stance gets shorter and the stride gains a flight phase, as in a run
      const duty = Math.min(lerp(0.6, 0.4, sstep(2.4, 5.2, v)), (0.9 * legLen) / (v * T));
      if (!this.walking) {
        // set off with whichever foot trails behind the direction of travel
        this.walking = true;
        const dx = vel.x / v, dz = vel.z / v;
        const lagR = (R.pos.x - pos.x) * dx + (R.pos.z - pos.z) * dz, lagL = (L.pos.x - pos.x) * dx + (L.pos.z - pos.z) * dz;
        const first = lagR < lagL ? R : L;
        this.phase = (((duty - 0.01 - (first === R ? 0 : 0.5)) % 1) + 1) % 1;
        R.lifted = L.lifted = false;
      }
      this.phase = (this.phase + dt / T) % 1;
      for (const foot of this.feet) {
        const u = (this.phase + (foot.side > 0 ? 0 : 0.5)) % 1;
        foot.stanceU = u < duty ? u / duty : -1;
        if (u < duty) { foot.lifted = false; continue; }
        if (foot.lifted || foot.swing) continue;
        const other = foot === R ? L : R;
        if (v < 3 && other.swing && !other.swing.cmd) continue;          // walking: one foot always down
        foot.lifted = true;
        const stanceT = duty * T;
        const gs = this.gaitStance[foot.side];
        this.startSwing(foot, Math.max(0.09, (1 - u) * T), lerp(0.06, 0.15, sstep(2, 6, v)), (out) => {
          const sw = foot.swing, c = this.cur;
          const lead = (1 - sw.t) * sw.dur + stanceT * 0.5;           // land ahead, so mid-stance is under the hips
          this.toWorld(gs.x, gs.z, c.pos, c.facing, out);
          out.x += c.vel.x * lead; out.z += c.vel.z * lead;
          return c.facing + gs.yaw;
        }, false);
      }
    } else {
      this.walking = false; R.stanceU = L.stanceU = -1;
    }
    this.still = v < 0.25 ? this.still + dt : 0;
    if (!this.walking && !footwork && !R.swing && !L.swing && dying < 0) {
      // settle: step whichever foot is furthest from the resting stance back into it
      let worst = null, err = 0;
      for (const foot of this.feet) {
        const yaw = this.stanceTarget(foot, _t);
        const e = Math.hypot(foot.pos.x - _t.x, foot.pos.z - _t.z) / this.sc + 0.12 * Math.abs(angleDiff(foot.yaw, yaw));
        if (e > err) { err = e; worst = foot; }
      }
      if (worst && err > (this.still > 0.35 ? 0.04 : 0.16)) {
        const m = Math.min(1, err / 0.5);
        this.startSwing(worst, 0.2 + 0.14 * m, 0.035 + 0.06 * m, (out) => this.stanceTarget(worst, out), false);
      }
    }
    // advance swings
    let landing = airLanding;
    for (const foot of this.feet) {
      const S = foot.swing;
      if (!S) continue;
      S.t = Math.min(1, S.t + dt / S.dur);
      if (S.t > 0.995) S.t = 1;
      const yaw = S.target(_t);
      // the height under the landing spot is eased, so a target sliding over a ledge doesn't jolt
      const gy = s.ground(_t.x, _t.z);
      S.gy = S.gy == null ? gy : lerp(S.gy, gy, 1 - Math.exp(-18 * dt));
      _t.y = S.gy;
      const e = sstep(0, 1, S.t);
      foot.pos.x = lerp(S.from.x, _t.x, e); foot.pos.z = lerp(S.from.z, _t.z, e);
      foot.pos.y = lerp(S.from.y, _t.y, e) + S.h * this.sc * Math.sin(Math.PI * Math.min(1, S.t * 1.08));
      foot.yaw = S.fromYaw + angleDiff(S.fromYaw, yaw) * e;
      if (S.t >= 1) { foot.swing = null; landing = Math.max(landing, S.cmd ? 0.5 : 0.12 + 0.06 * v); }
    }
    // feet stay glued to the ground they stand on (stairs, slopes)
    for (const foot of this.feet) if (!foot.swing && !foot.airborne) foot.pos.y = lerp(foot.pos.y, s.ground(foot.pos.x, foot.pos.z), 1 - Math.exp(-(airLanding ? 40 : 20) * dt));
    // heel lift: rolling off the toes late in each stance, toes down after push-off, heel first on landing
    for (const foot of this.feet) {
      let pitch = 0;
      if (foot.airborne) pitch = 0.45;
      else if (foot.swing) pitch = lerp(0.5, -0.2, foot.swing.t) * (foot.swing.cmd ? 0.6 : g);
      else if (foot.stanceU >= 0) pitch = sstep(0.62, 1, foot.stanceU) * 0.5 * g;
      else if (foot.side < 0) pitch = 0.1 * (1 - g);                     // back heel just off the ground, ready
      foot.pitch = lerp(foot.pitch, pitch, 1 - Math.exp(-18 * dt));
    }

    // ---------------------------------------------------------------- hips
    for (const foot of this.feet) {
      _t.copy(foot.pos); _t.y += (this.ankleH + Math.max(0, Math.sin(foot.pitch)) * 0.1) * this.sc;
      this.toLocal(_t, foot.local);
    }
    let sx = 0, sw = 0;
    for (const foot of this.feet) { const wgt = foot.swing || foot.airborne ? 0.1 : 1; sx += foot.local.x * wgt; sw += wgt; }
    const t = performance.now() * 0.001;
    this.sway.to((sx / sw) * 0.45 + Math.sin(t * 0.55) * 0.012 * (1 - g), 7, 0.9, dt);
    this.fwd.to(clamp(this.aF * 0.006, -0.05, 0.06) + (P ? P.ln * 0.1 : 0), 9, 0.8, dt);
    const dieC = dying >= 0 ? 0.42 * sstep(0, 0.6, dying) : 0;
    const crouch = 0.04 * (1 - g) + (0.02 + 0.05 * run) * g + (P ? P.cr : 0) + dieC;
    let yT = this.restHipsY - crouch;
    // the hips can't rise higher than the planted feet allow (this is what makes the walk dip
    // through double support and the body sink into a lunge)
    const reach = (this.a + this.b) * 0.985;
    let allowed = Infinity;
    for (const foot of this.feet) {
      if (foot.swing || foot.airborne) continue;
      const hx = this.sway.x + foot.side * this.hipX, hz = this.fwd.x;
      const dxz = Math.hypot(foot.local.x - hx, foot.local.z - hz);
      allowed = Math.min(allowed, foot.local.y + Math.sqrt(Math.max(0, reach * reach - dxz * dxz)) - this.hipY);
    }
    // softened: a foot briefly out of reach is better than the whole body jolting down to it
    this.allowed = Number.isFinite(this.allowed) ? lerp(this.allowed, allowed, Number.isFinite(allowed) ? 1 - Math.exp(-25 * dt) : 1) : allowed;
    yT = Math.min(yT, this.allowed);
    if (landing) this.hy.v -= landing;
    this.hy.to(yT, 18, 0.75, dt);
    // pelvis: turns with the stride (and leads the strike's twist), drops on the swinging side
    const gaitYaw = clamp(-(R.local.z - L.local.z) * 0.5, -0.32, 0.32);
    const swR = R.swing ? Math.sin(Math.PI * R.swing.t) : 0, swL = L.swing ? Math.sin(Math.PI * L.swing.t) : 0;
    const roll = (swL - swR) * 0.05 * (0.4 + 0.6 * g);
    const pelvisTw = PL ? 0.35 * PL.tw : 0;
    const pelvisPitch = 0.04 * g + 0.06 * run + (P ? P.ln * 0.15 : 0);
    p.hips.position.set(this.sway.x, this.hy.x, this.fwd.x);
    p.hips.rotation.set(pelvisPitch, gaitYaw + pelvisTw, roll);

    // ---------------------------------------------------------------- legs
    p.hips.updateMatrix();
    _qi.copy(p.hips.quaternion).invert();
    for (const foot of this.feet) {
      const leg = foot.leg;
      _a.copy(foot.local).sub(p.hips.position).applyQuaternion(_qi);
      const yl = foot.yaw - f;
      _pole.set(Math.sin(yl) + foot.side * 0.12, 0.05, Math.cos(yl)).applyQuaternion(_qi);
      solveTwoBone(leg.hip, leg.knee, _a, this.a, this.b, _pole, 1);
      // ankle: the sole lies flat (or rolls on the toes), pointing where the foot points
      _qd.setFromEuler(_e.set(foot.pitch, yl, 0, 'YXZ'));
      _q.copy(p.hips.quaternion).multiply(leg.hip.quaternion).multiply(leg.knee.quaternion).invert();
      leg.ankle.quaternion.copy(_q.multiply(_qd));
    }

    // ---------------------------------------------------------------- spine
    this.exert = lerp(this.exert, Math.min(1, v / 6 + (act ? 0.6 : 0)), 1 - Math.exp(-0.4 * dt));
    this.breath += dt * (1.4 + 2.2 * this.exert);
    const br = Math.sin(this.breath);
    if (s.hurt) { this.lean.v -= 3.2 * s.hurt; this.kick.v += (Math.random() < 0.5 ? -1 : 1) * 4 * s.hurt; this.flinch.v += 5 * s.hurt; }
    const lean = this.lean.to(0.03 + 0.06 * g + 0.08 * run + clamp(this.aF * 0.014, -0.14, 0.18) + (P ? P.ln : 0) + (dying >= 0 ? 0.55 * sstep(0.1, 0.6, dying) : 0), 9, 0.55, dt);
    const bank = this.bank.to(clamp(-this.aR * 0.016, -0.2, 0.2), 8, 0.5, dt);
    const kick = this.kick.to(0, 10, 0.45, dt);
    const flinch = this.flinch.to(0, 12, 0.5, dt);
    const tw = P ? P.tw : 0;
    const lumbarYaw = (PM ? 0.3 * PM.tw : 0) - 0.5 * gaitYaw;
    const chestYaw = tw - pelvisTw - (PM ? 0.3 * PM.tw : 0) - 0.4 * gaitYaw + kick;
    p.torso.rotation.set(lean * 0.45 - pelvisPitch * 0.7, lumbarYaw, bank * 0.5 - roll * 0.6);
    p.chest.rotation.set(lean * 0.55 - 0.03 + br * 0.012 - flinch * 0.15, chestYaw, bank * 0.5 - roll * 0.4);

    // ---------------------------------------------------------------- head
    const chestWorld = f + gaitYaw + pelvisTw + lumbarYaw + chestYaw;
    let lookYaw, lookPitch = 0.04 * g;
    if (s.look) {
      const dx = s.look.x - pos.x, dz = s.look.z - pos.z, d = Math.hypot(dx, dz);
      lookYaw = Math.atan2(dx, dz);
      lookPitch = clamp(Math.atan2(1.6 * this.sc - (s.look.y - pos.y + 0.9), Math.max(1, d)), -0.3, 0.45);
    } else if (s.moveDir && s.moveDir.lengthSq() > 0.09) {
      lookYaw = Math.atan2(s.moveDir.x, s.moveDir.y);                    // eyes lead into the turn
    } else {
      // standing alone: an unhurried look around the land
      this.scanT -= dt;
      if (this.scanT < 0) { this.scan = (Math.random() - 0.5) * 1.5; this.scanPitch = (Math.random() - 0.35) * 0.18; this.scanT = 2.5 + Math.random() * 3.5; }
      lookYaw = f + this.scan; lookPitch = this.scanPitch;
    }
    if (!(s.moveDir && s.moveDir.lengthSq() > 0.09) && !s.look) { /* keep the scan */ } else { this.scan = 0; this.scanT = Math.min(this.scanT, 1.2); }
    const rel = clamp(angleDiff(chestWorld, lookYaw), -1.2, 1.2);
    const hy = this.headYaw.to(rel, 13, 1, dt);
    const hp = this.headPitch.to(lookPitch, 11, 1, dt);
    const level = -(lean + pelvisPitch) * 0.8 + (dying >= 0 ? 0.5 * sstep(0.1, 0.6, dying) : 0) + flinch * 0.3;
    const lroll = -bank * 0.7 + roll * 0.4;
    p.neck.rotation.set(0.4 * (hp + level), 0.4 * hy, 0.4 * lroll);
    p.head.rotation.set(0.6 * (hp + level), 0.6 * hy, 0.6 * lroll);

    // ---------------------------------------------------------------- arms
    for (const arm of [p.armL, p.armR]) {
      const base = arm.shoulder.userData.base;
      arm.shoulder.position.set(base.x, base.y + br * 0.004, base.z);
    }
    const swingR = clamp(L.local.z * 1.8, -1, 1) * g, swingL = clamp(R.local.z * 1.8, -1, 1) * g;
    const intensity = s.intensity ?? 0;
    if (P && s.rig && dying < 0) {
      P.swing = s.rig.main === 'L' ? swingR : swingL;
      P.int = intensity;
      poseArms(p, s.rig, P, s.grips, s.wstate, dt);
    } else if (s.item) {
      // item gestures are authored as joint angles over the old relaxed base pose
      for (const [arm, side, sw] of [[p.armR, 1, swingR], [p.armL, -1, swingL]]) {
        arm.shoulder.rotation.set(-sw * 0.45, 0, -side * 0.12);
        arm.elbow.rotation.set(-0.3 - Math.max(0, sw) * 0.4, 0, 0);
        arm.hand.rotation.set(0, 0, 0);
      }
      s.item.fn(s.item.t, p, { mirror: false });
    } else {
      freeArm(p, p.armR, 1, swingR, intensity);
      freeArm(p, p.armL, -1, swingL, intensity);
    }

    this.inertialize(dt);
  }

  inertialize(dt) {
    const J = this.joints;
    if (!this.prevQ || this.prevQ.length !== J.length) {
      this.prevQ = J.map((j) => j.quaternion.clone());
      this.prevP = this.moved.map((j) => j.position.clone());
      this.offQ = J.map(() => new THREE.Quaternion());
      this.offP = this.moved.map(() => new THREE.Vector3());
    }
    if (this.blendReq) {
      // offsets from where the pose just was to where it now wants to be; decay them away
      for (let i = 0; i < J.length; i++) this.offQ[i].copy(this.prevQ[i]).multiply(_q.copy(J[i].quaternion).invert());
      for (let i = 0; i < this.moved.length; i++) this.offP[i].subVectors(this.prevP[i], this.moved[i].position);
      this.blend = { t: 0, dur: this.blendReq };
      this.blendReq = 0;
    }
    if (this.blend) {
      const w = 1 - sstep(0, 1, this.blend.t / this.blend.dur);
      for (let i = 0; i < J.length; i++) J[i].quaternion.premultiply(_q.copy(ID).slerp(this.offQ[i], w));
      for (let i = 0; i < this.moved.length; i++) this.moved[i].position.addScaledVector(this.offP[i], w);
      this.blend.t += dt;
      if (this.blend.t > this.blend.dur) this.blend = null;
    }
    for (let i = 0; i < J.length; i++) this.prevQ[i].copy(J[i].quaternion);
    for (let i = 0; i < this.moved.length; i++) this.prevP[i].copy(this.moved[i].position);
  }
}
