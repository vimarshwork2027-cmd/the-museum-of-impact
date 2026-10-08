// ImpactSimulation — one artwork's world. It owns the scene, the physics, the
// visitor's hold-and-release, breakables, analytic debris, the recording that
// makes time controllable, and the frozen "compose" world.
//
// Time model: t = 0 is the instant the visitor lets go. Live physics runs
// forward and is recorded; slow motion, rewind and scrubbing replay the
// recording. Freezing hands the sampled state back to live physics.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { buildStage, GROUP, ALL } from './stage.js';
import { Recording } from './recording.js';
import { Particles } from './particles.js';
import { mulberry32 } from '../util.js';

const STEP = 1 / 240;
const REC_EVERY = 2; // 120 recorded frames per second
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

export class ImpactSimulation {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.scene = new THREE.Scene();
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 14; // stacked stone needs a better-converged solver
    this.world.allowSleep = true;
    this.world.defaultContactMaterial.friction = 0.45;
    this.world.defaultContactMaterial.restitution = 0.15;
    this.camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.02, 80);
    this.pieces = [];
    this.meshes = [];
    this.breakables = [];
    this.scenery = [];
    this.grabbables = [];
    this.time = 0;
    this.recording = null;
    this.mode = 'hold'; // hold | live | compose
    this.onLiveEvent = null;
    this.stage = buildStage(this.scene, this.world, def.stage || {});
    if (this.stage.plinthGroup && this.stage.plinthGroup.userData.scenery) this.scenery.push(this.stage.plinthGroup);
    this.particles = new Particles(this.scene);
    this.jointBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
    this.jointBody.collisionFilterGroup = 0;
    this.jointBody.collisionFilterMask = 0;
    this.world.addBody(this.jointBody);
    this.ctx = def.build(this) || {};
    this.captureRest();
  }

  // ------------------------------------------------------------ building

  /** A rigid object whose transform is recorded. kind: 'piece' | 'prop'. */
  add(mesh, body, { kind = 'piece', material = 'glass', self = false, grab = false, display = true } = {}) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    body.collisionFilterGroup = kind === 'prop' ? GROUP.PROP : GROUP.PIECE;
    body.collisionFilterMask = this.maskFor(kind, self);
    // a prop the visitor handles has to be able to stop: drag, spin resistance, a rest threshold
    if (kind === 'prop') {
      body.linearDamping = Math.max(body.linearDamping, 0.06);
      body.angularDamping = Math.max(body.angularDamping, 0.35);
      body.sleepSpeedLimit = 0.11;
      body.sleepTimeLimit = 0.45;
    }
    this.world.addBody(body);
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    const piece = { mesh, body, kind, material, self, index: this.pieces.length, display, lastHit: -1 };
    mesh.userData.piece = piece;
    this.pieces.push(piece);
    this.meshes.push(mesh);
    body.addEventListener('collide', (e) => this.onCollide(piece, e));
    if (grab) this.grabbables.push({ kind: 'prop', piece, body, meshes: [mesh] });
    return piece;
  }

  maskFor(kind, self) {
    if (kind === 'prop') return ALL & ~GROUP.PROP | GROUP.PROP;
    return GROUP.STATIC | GROUP.PROP | GROUP.CARRIER | GROUP.ACTIVE | (self ? GROUP.PIECE : 0);
  }

  /** Static, non-recorded set dressing that also appears in the gallery installation. */
  addScenery(obj, { display = true } = {}) {
    obj.traverse?.((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(obj);
    if (display) this.scenery.push(obj);
    return obj;
  }

  addStatic(shape, pos, quat) {
    const b = new CANNON.Body({ mass: 0, shape, collisionFilterGroup: GROUP.STATIC, collisionFilterMask: ALL & ~GROUP.STATIC });
    b.position.set(pos.x, pos.y, pos.z);
    if (quat) b.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    this.world.addBody(b);
    return b;
  }

  /**
   * An object made of pre-fractured pieces, carried as one rigid body until an
   * impact exceeds its threshold. pieces: already-added pieces in rest pose.
   */
  addBreakable(carrier, pieces, { material, threshold = 2, profile = {}, grab = true, onBreak = null } = {}) {
    carrier.collisionFilterGroup = GROUP.CARRIER;
    carrier.collisionFilterMask = GROUP.STATIC | GROUP.PROP | GROUP.PIECE;
    this.world.addBody(carrier);
    const cq = carrier.quaternion;
    const inv = new THREE.Matrix4().compose(
      new THREE.Vector3(carrier.position.x, carrier.position.y, carrier.position.z),
      new THREE.Quaternion(cq.x, cq.y, cq.z, cq.w), // three reads private fields: never pass cannon types
      new THREE.Vector3(1, 1, 1),
    ).invert();
    const b = {
      carrier, pieces, material, threshold, onBreak, broken: false,
      profile: { radial: 0.35, falloff: 0.12, jitter: 0.15, spin: 6, bounce: 0.5, ...profile },
      local: pieces.map((p) => {
        _m.compose(p.mesh.position, p.mesh.quaternion, new THREE.Vector3(1, 1, 1)).premultiply(inv);
        const pos = new THREE.Vector3(), q = new THREE.Quaternion();
        _m.decompose(pos, q, new THREE.Vector3());
        return { pos, q };
      }),
      preVel: new CANNON.Vec3(), preAng: new CANNON.Vec3(),
    };
    for (const p of pieces) { p.breakable = b; p.body.type = CANNON.Body.KINEMATIC; p.body.collisionFilterMask = 0; }
    carrier.addEventListener('collide', (e) => {
      if (b.broken || this.mode === 'compose') return;
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      const c = e.contact;
      const point = new THREE.Vector3(c.bi.position.x + c.ri.x, c.bi.position.y + c.ri.y, c.bi.position.z + c.ri.z);
      const n = new THREE.Vector3(c.ni.x, c.ni.y, c.ni.z);
      if (c.bi === carrier) n.negate(); // n now points from the struck surface into the object
      if (v >= threshold && (this.mode === 'live' || this.mode === 'hold')) this.pendingBreak = { b, point, normal: n, speed: v };
      else if (v > 0.35) this.emit({ type: 'hit', material, v, pos: point });
    });
    this.breakables.push(b);
    if (grab) this.grabbables.push({ kind: 'breakable', breakable: b, body: carrier, meshes: pieces.map((p) => p.mesh) });
    return b;
  }

  // ------------------------------------------------------------ rest state

  bodies() {
    return [...this.pieces.map((p) => p.body), ...this.breakables.map((b) => b.carrier)];
  }

  captureRest() {
    this.rest = this.bodies().map((b) => ({
      b, pos: b.position.clone(), q: b.quaternion.clone(), type: b.type, mask: b.collisionFilterMask, group: b.collisionFilterGroup,
      sleep: b.sleepState, ld: b.linearDamping, ad: b.angularDamping,
    }));
  }

  reset() {
    this.endDrag();
    this.world.gravity.set(0, -9.82, 0);
    for (const r of this.rest) {
      const b = r.b;
      b.type = r.type;
      b.position.copy(r.pos);
      b.quaternion.copy(r.q);
      b.velocity.setZero();
      b.angularVelocity.setZero();
      b.collisionFilterMask = r.mask;
      b.collisionFilterGroup = r.group;
      b.linearDamping = r.ld;
      b.angularDamping = r.ad;
      b.updateMassProperties();
      b.allowSleep = true;
      if (r.sleep === CANNON.Body.SLEEPING) b.sleep(); else b.wakeUp();
    }
    for (const b of this.breakables) b.broken = false;
    for (const p of this.pieces) p.lastHit = -1;
    this.pendingBreak = null;
    this.time = 0;
    this.recording = null;
    this.mode = 'hold';
    this.impacted = false;
    this.particles.reset();
    this.def.reset?.(this);
    this.syncMeshes();
  }

  // ------------------------------------------------------------ events

  emit(e) {
    e.t = this.time;
    if (this.mode === 'live' && this.recording) this.recording.event(e);
    else this.onLiveEvent?.(e);
  }

  markImpact(pos) {
    if (this.impacted) return;
    this.impacted = true;
    if (this.recording && this.recording.impactTime == null) this.recording.impactTime = this.time;
    this.impactPos = pos ? pos.clone() : null;
  }

  onCollide(piece, e) {
    if (piece.breakable && !piece.breakable.broken) return;
    const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
    if (v < 0.22) return;
    const now = this.mode === 'compose' ? performance.now() / 1000 : this.time;
    if (now - piece.lastHit < 0.07) return;
    piece.lastHit = now;
    const c = e.contact;
    const pos = new THREE.Vector3(c.bi.position.x + c.ri.x, c.bi.position.y + c.ri.y, c.bi.position.z + c.ri.z);
    this.emit({ type: 'hit', material: piece.material, v, pos });
    this.def.onHit?.(this, piece, v, pos, e.body);
    if (this.mode === 'compose' && v > 0.25) this.promote(e.body);
  }

  // ------------------------------------------------------------ stepping

  startRecording() {
    this.recording = new Recording(this.meshes.length, STEP * REC_EVERY);
    for (const p of this.pieces) p.lastHit = -1;
    this.time = 0;
    this.stepCount = 0;
    this.mode = 'live';
    this.syncMeshes();
    this.recording.push(this.meshes);
  }

  /** Advance live physics by dtSim seconds (fixed internal step). */
  advance(dtSim) {
    this.acc = (this.acc || 0) + dtSim;
    let steps = 0;
    while (this.acc >= STEP && steps < 40) {
      this.acc -= STEP;
      steps++;
      for (const b of this.breakables) if (!b.broken) { b.preVel.copy(b.carrier.velocity); b.preAng.copy(b.carrier.angularVelocity); }
      this.def.preStep?.(this);
      this.world.step(STEP);
      if (this.mode === 'live') this.time += STEP;
      if (this.mode === 'hold' && (this.pendingBreak || this.requestLive)) {
        // the visitor struck it while still holding: that swing is the release
        this.endHold();
        this.startRecording();
        this.autoReleased = true;
      }
      this.requestLive = false;
      if (this.pendingBreak) { this.doBreak(this.pendingBreak); this.pendingBreak = null; }
      this.settle();
      this.followCarriers();
      if (this.mode === 'live' && this.recording) {
        this.stepCount++;
        if (this.stepCount % REC_EVERY === 0) { this.syncMeshes(); this.recording.push(this.meshes); }
      }
    }
    this.syncMeshes();
  }

  /**
   * Contact friction cannon-es does not model: rolling resistance, a rest
   * threshold, and the wall at the edge of the moment. Without this a sphere
   * on a plane rolls for ever, and the visitor can never pick it up again.
   */
  settle() {
    const r = this.stage.arena;
    // only bodies actually touching something are resisted — a fall is never damped
    const touching = new Set();
    for (const c of this.world.contacts) { touching.add(c.bi.id); touching.add(c.bj.id); }
    const SPIN = 3.2 * STEP; // rad/s shed per step while in contact
    const SLIDE = 0.55 * STEP; // m/s shed per step while in contact
    for (const p of this.pieces) {
      const b = p.body;
      if (b.type !== CANNON.Body.DYNAMIC) continue;
      if (r) {
        const d = Math.hypot(b.position.x, b.position.z);
        if (d > r - 0.03) {
          const nx = b.position.x / (d || 1), nz = b.position.z / (d || 1);
          const vn = b.velocity.x * nx + b.velocity.z * nz;
          if (vn > 0) { b.velocity.x -= nx * vn * 1.5; b.velocity.z -= nz * vn * 1.5; }
          const k = Math.min(d, r - 0.03);
          b.position.x = nx * k;
          b.position.z = nz * k;
        }
      }
      if (!touching.has(b.id) || b.sleepState === CANNON.Body.SLEEPING) continue;
      const w = b.angularVelocity, v = b.velocity;
      const spin = w.length();
      if (spin > 1e-5) w.scale(Math.max(0, (spin - SPIN) / spin), w);
      const sp = v.length();
      if (sp > 1e-5) v.scale(Math.max(0, (sp - SLIDE) / sp), v);
      if (v.length() < 0.085 && w.length() < 0.55) { v.setZero(); w.setZero(); }
    }
  }

  followCarriers() {
    for (const b of this.breakables) {
      if (b.broken) continue;
      const c = b.carrier;
      for (let i = 0; i < b.pieces.length; i++) {
        const l = b.local[i], body = b.pieces[i].body;
        _v.copy(l.pos).applyQuaternion(c.quaternion);
        body.position.set(c.position.x + _v.x, c.position.y + _v.y, c.position.z + _v.z);
        _q.set(c.quaternion.x, c.quaternion.y, c.quaternion.z, c.quaternion.w).multiply(l.q);
        body.quaternion.set(_q.x, _q.y, _q.z, _q.w);
      }
    }
  }

  syncMeshes() {
    for (const p of this.pieces) {
      p.mesh.position.copy(p.body.position);
      p.mesh.quaternion.copy(p.body.quaternion);
    }
  }

  doBreak({ b, point, normal, speed }) {
    b.broken = true;
    const c = b.carrier;
    const rng = mulberry32(Math.floor(this.time * 1e5) + Math.floor(point.x * 1e4));
    const prof = b.profile;
    const cp = new THREE.Vector3(c.position.x, c.position.y, c.position.z);
    const cv = new THREE.Vector3(b.preVel.x, b.preVel.y, b.preVel.z);
    const cw = new THREE.Vector3(b.preAng.x, b.preAng.y, b.preAng.z);
    const vn = cv.dot(normal); // negative: moving into the surface
    for (const p of b.pieces) {
      const body = p.body;
      body.type = CANNON.Body.DYNAMIC;
      body.updateMassProperties();
      body.collisionFilterMask = this.maskFor('piece', p.self);
      body.wakeUp();
      const pos = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
      const r = pos.clone().sub(cp);
      const v = cv.clone().add(new THREE.Vector3().crossVectors(cw, r));
      // cancel the inward motion, then bounce part of it back
      v.addScaledVector(normal, -vn * (1 + prof.bounce * (0.4 + rng() * 0.6)));
      const d = pos.clone().sub(point);
      const dist = d.length();
      d.normalize();
      const burst = speed * prof.radial * Math.exp(-dist / prof.falloff);
      v.addScaledVector(d, burst);
      v.addScaledVector(normal, burst * (prof.lift ?? 0.35));
      v.add(new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(speed * prof.jitter));
      body.velocity.set(v.x, v.y, v.z);
      const s = prof.spin * Math.min(speed, 8);
      body.angularVelocity.set(cw.x + (rng() - 0.5) * s, cw.y + (rng() - 0.5) * s, cw.z + (rng() - 0.5) * s);
    }
    c.collisionFilterMask = 0;
    c.type = CANNON.Body.KINEMATIC;
    c.velocity.setZero();
    c.angularVelocity.setZero();
    if (this.recording) this.recording.breakTime = this.time;
    this.markImpact(point);
    this.emit({ type: 'break', material: b.material, v: speed, pos: point });
    b.onBreak?.(this, point, normal, speed);
  }

  /** Visual state that is a function of time (debris, liquid, crack glow). */
  visuals(t) {
    this.particles.update(t);
    this.def.visuals?.(this, t);
  }

  // ------------------------------------------------------------ holding (before the impact)

  grabTargetFor(mesh) {
    return this.grabbables.find((g) => g.meshes.includes(mesh) && (g.kind === 'prop' || !g.breakable.broken)) || null;
  }

  beginHold(g, hit) {
    const body = g.body;
    this.hold = { g, body, local: body.pointToLocalFrame(new CANNON.Vec3(hit.x, hit.y, hit.z)), target: hit.clone(), rot: new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w), hist: [] };
    // Some things are taken up a particular way round — a hammer hangs head-down.
    // The grip is assumed at once rather than swung into: sweeping through the
    // pose can carry the head across the work and break it on pickup.
    const pose = this.def.holdPose?.(g, this);
    if (pose) {
      this.hold.rot.copy(pose);
      body.quaternion.set(pose.x, pose.y, pose.z, pose.w);
      body.angularVelocity.setZero();
      this.hold.local = body.pointToLocalFrame(new CANNON.Vec3(hit.x, hit.y, hit.z));
    }
    body.type = CANNON.Body.KINEMATIC;
    // a held thing must never fall asleep: it is driven by velocity, and cannon
    // stops integrating a sleeping body, so the hand would simply stop working
    this.hold.allowSleep = body.allowSleep;
    body.allowSleep = false;
    body.wakeUp();
    // Only what is in the hand wakes. Waking the whole world used to rouse a
    // standing structure that is stable at rest but creeps once simulated, so it
    // fell apart on its own the moment the visitor picked anything up. Cannon
    // wakes a sleeping body when something actually collides with it.
  }

  moveHold(point) { if (this.hold) this.hold.target.copy(point); }

  turnHold(axis, angle) {
    if (!this.hold) return;
    this.hold.rot.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
  }

  /** Called each frame before advance() while holding: drive the kinematic body. */
  updateHold(dt) {
    const h = this.hold;
    if (!h) return;
    const body = h.body;
    body.wakeUp();
    _v.set(h.local.x, h.local.y, h.local.z).applyQuaternion(h.rot);
    const want = h.target.clone().sub(_v);
    want.y = Math.max(want.y, this.def.holdMinY ?? 0.12);
    // The surface the viewer found beneath it, in body-origin terms. Never ask the
    // hand for a height below it, or the object clips a frame into the plinth
    // before the next correction catches up.
    if (h.floorY != null) want.y = Math.max(want.y, h.floorY);
    const cur = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
    const vel = want.sub(cur).divideScalar(Math.max(dt, 1 / 120));
    if (vel.length() > 7) vel.setLength(7);
    body.velocity.set(vel.x, vel.y, vel.z);
    // orientation toward the held rotation
    const cq = new THREE.Quaternion(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    const dq = h.rot.clone().multiply(cq.clone().invert());
    if (dq.w < 0) { dq.x *= -1; dq.y *= -1; dq.z *= -1; dq.w *= -1; }
    const angle = 2 * Math.acos(Math.min(1, dq.w));
    const s = Math.sqrt(1 - dq.w * dq.w);
    if (s > 1e-4) {
      const w = Math.min(angle / Math.max(dt, 1 / 120), 12);
      body.angularVelocity.set((dq.x / s) * w, (dq.y / s) * w, (dq.z / s) * w);
    } else body.angularVelocity.setZero();
    h.hist.push({ t: performance.now(), v: vel.clone() });
    while (h.hist.length > 6) h.hist.shift();
  }

  endHold() {
    const h = this.hold;
    if (!h) return null;
    this.hold = null;
    const body = h.body;
    body.type = CANNON.Body.DYNAMIC;
    body.allowSleep = h.allowSleep ?? true;
    body.updateMassProperties();
    body.wakeUp();
    // release with the hand's recent motion: a drop or a throw
    const v = new THREE.Vector3();
    for (const s of h.hist) v.add(s.v);
    if (h.hist.length) v.divideScalar(h.hist.length);
    if (v.length() > 6) v.setLength(6);
    body.velocity.set(v.x, v.y, v.z);
    body.angularVelocity.scale(0.5, body.angularVelocity);
    return h.g;
  }

  // ------------------------------------------------------------ state I/O

  captureState() {
    const out = [];
    for (const m of this.meshes) {
      out.push(+m.position.x.toFixed(4), +m.position.y.toFixed(4), +m.position.z.toFixed(4),
        +m.quaternion.x.toFixed(4), +m.quaternion.y.toFixed(4), +m.quaternion.z.toFixed(4), +m.quaternion.w.toFixed(4));
    }
    return out;
  }

  applyState(arr) {
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i], k = i * 7;
      if (k + 6 >= arr.length) break;
      m.position.set(arr[k], arr[k + 1], arr[k + 2]);
      m.quaternion.set(arr[k + 3], arr[k + 4], arr[k + 5], arr[k + 6]).normalize();
    }
  }

  // ------------------------------------------------------------ compose (the frozen world)

  startCompose() {
    this.mode = 'compose';
    this.endHold();
    this.pendingBreak = null;
    for (const b of this.breakables) { b.carrier.collisionFilterMask = 0; b.carrier.type = CANNON.Body.KINEMATIC; b.carrier.velocity.setZero(); }
    for (const p of this.pieces) {
      const b = p.body;
      b.type = CANNON.Body.DYNAMIC;
      b.updateMassProperties();
      b.collisionFilterGroup = p.kind === 'prop' ? GROUP.PROP : GROUP.PIECE;
      b.collisionFilterMask = this.maskFor(p.kind, p.self);
      b.position.copy(p.mesh.position);
      b.quaternion.copy(p.mesh.quaternion);
      b.velocity.setZero();
      b.angularVelocity.setZero();
      b.allowSleep = false;
      b.wakeUp();
      p.activeUntil = 0;
    }
    this.setHold(true);
  }

  /** hold = suspended in time (no gravity, viscous); release = gravity returns. */
  setHold(hold) {
    this.gravityOn = !hold;
    this.world.gravity.set(0, hold ? 0 : -9.82, 0);
    for (const p of this.pieces) {
      p.body.linearDamping = hold ? 0.4 : 0.03;
      p.body.angularDamping = hold ? 0.5 : 0.1;
      p.body.wakeUp();
    }
  }

  /** A body touched by an active one joins the chain reaction for a moment. */
  promote(body) {
    const p = this.pieces.find((q) => q.body === body);
    if (!p || p.kind === 'prop') return;
    if (body.collisionFilterGroup !== GROUP.ACTIVE) {
      body.collisionFilterGroup = GROUP.ACTIVE;
      body.collisionFilterMask = ALL;
    }
    p.activeUntil = performance.now() + 1600;
  }

  stepCompose(dt) {
    if (this.mode !== 'compose') return;
    const now = performance.now();
    for (const p of this.pieces) {
      if (p.activeUntil && now > p.activeUntil && (!this.drag || this.drag.bodyA !== p.body)) {
        p.activeUntil = 0;
        p.body.collisionFilterGroup = p.kind === 'prop' ? GROUP.PROP : GROUP.PIECE;
        p.body.collisionFilterMask = this.maskFor(p.kind, p.self);
      }
    }
    this.world.step(1 / 120, Math.min(dt, 1 / 20), 6);
    if (this.gravityOn) this.settle();
    this.syncMeshes();
  }

  beginDrag(piece, point) {
    this.endDrag();
    const b = piece.body;
    const local = new CANNON.Vec3();
    b.pointToLocalFrame(new CANNON.Vec3(point.x, point.y, point.z), local);
    this.jointBody.position.set(point.x, point.y, point.z);
    this.drag = new CANNON.PointToPointConstraint(b, local, this.jointBody, new CANNON.Vec3(0, 0, 0), 60 * Math.max(b.mass, 0.05));
    this.world.addConstraint(this.drag);
    b.collisionFilterGroup = GROUP.ACTIVE;
    b.collisionFilterMask = ALL;
    piece.activeUntil = Infinity;
    this.drag.allowSleep = b.allowSleep;
    b.allowSleep = false;
    b.wakeUp();
    b.angularDamping = 0.7;
  }

  moveDrag(p) {
    if (!this.drag) return;
    this.jointBody.position.set(p.x, p.y, p.z);
    this.drag.bodyA.wakeUp();
  }

  turnDrag(axis, angle) {
    if (!this.drag) return;
    const b = this.drag.bodyA;
    const q = new CANNON.Quaternion();
    q.setFromAxisAngle(new CANNON.Vec3(axis.x, axis.y, axis.z), angle);
    b.quaternion = q.mult(b.quaternion);
    b.wakeUp();
  }

  endDrag() {
    if (!this.drag) return;
    const b = this.drag.bodyA;
    b.allowSleep = this.drag.allowSleep ?? true;
    this.world.removeConstraint(this.drag);
    this.drag = null;
    b.angularDamping = this.gravityOn ? 0.1 : 0.5;
    const p = this.pieces.find((q) => q.body === b);
    if (p) p.activeUntil = performance.now() + 1600;
  }
}
