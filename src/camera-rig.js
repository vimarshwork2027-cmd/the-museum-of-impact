// The visitor's eye inside a moment. Spherical orbit around a target with
// damping and inertia, pan, zoom, WASD walking, focus and reset — plus a
// cinematic layer that can take the camera for a shot and hand it back
// without a snap (the rig adopts wherever the shot left the camera).
import * as THREE from 'three';
import { clamp, damp } from './util.js';

const _sph = new THREE.Spherical();
const _v = new THREE.Vector3();

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.target = new THREE.Vector3();
    this.goal = { target: new THREE.Vector3(), radius: 2, theta: 0, phi: 1.2 };
    this.cur = { target: new THREE.Vector3(), radius: 2, theta: 0, phi: 1.2 };
    this.vel = { theta: 0, phi: 0 };
    this.keys = new Set();
    this.enabled = false;
    this.minPhi = 0.12;
    this.maxPhi = Math.PI / 2 - 0.02;
    this.minR = 0.18;
    this.maxR = 7;
    this.cine = { w: 0, goal: 0, pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.drag = null;
    this.blockWheel = false; // set while holding an object (wheel turns it instead)

    dom.addEventListener('pointerdown', (e) => {
      // while something is held the left button belongs to the hand; the others still frame the shot
      if (!this.enabled || (this.captured && e.button === 0)) return;
      const pan = e.button === 1 || e.button === 2 || e.shiftKey;
      this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId, pan, moved: 0 };
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      this.drag.moved += Math.abs(dx) + Math.abs(dy);
      this.takeBack();
      if (this.drag.pan) this.pan(dx, dy);
      else {
        const k = e.pointerType === 'touch' ? 0.009 : 0.0055;
        this.vel.theta = -dx * k * 14;
        this.vel.phi = -dy * k * 14;
        this.goal.theta -= dx * k;
        this.goal.phi = clamp(this.goal.phi - dy * k, this.minPhi, this.maxPhi);
      }
    });
    window.addEventListener('pointerup', (e) => { if (this.drag?.id === e.pointerId) this.drag = null; });
    dom.addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
    dom.addEventListener('wheel', (e) => {
      if (!this.enabled || this.blockWheel) return;
      e.preventDefault();
      this.takeBack();
      this.goal.radius = clamp(this.goal.radius * Math.exp(e.deltaY * 0.0012), this.minR, this.maxR);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.target.closest?.('input, textarea')) return;
      this.keys.add(e.code);
      if (e.code === 'KeyR') this.reset();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Place the rig at a camera position looking at a target (no animation). */
  set(pos, target) {
    this.home = { pos: pos.clone(), target: target.clone() };
    this.adopt(pos, target);
    Object.assign(this.cur, { radius: this.goal.radius, theta: this.goal.theta, phi: this.goal.phi });
    this.cur.target.copy(this.goal.target);
    this.cine.w = this.cine.goal = 0;
    this.apply();
  }

  adopt(pos, target) {
    _v.copy(pos).sub(target);
    _sph.setFromVector3(_v);
    this.goal.target.copy(target);
    this.goal.radius = clamp(_sph.radius, this.minR, this.maxR);
    this.goal.theta = _sph.theta;
    this.goal.phi = clamp(_sph.phi, this.minPhi, this.maxPhi);
  }

  /** Animate to a view. */
  glide(pos, target) {
    this.adopt(pos, target);
    // keep theta continuous
    while (this.goal.theta - this.cur.theta > Math.PI) this.goal.theta -= Math.PI * 2;
    while (this.goal.theta - this.cur.theta < -Math.PI) this.goal.theta += Math.PI * 2;
  }

  reset() { if (this.home) { this.takeBack(); this.glide(this.home.pos, this.home.target); } }

  focus(point, radius = 0.5) {
    this.takeBack();
    this.goal.target.copy(point);
    this.goal.radius = clamp(radius, this.minR, this.maxR);
  }

  pan(dx, dy) {
    const r = this.cur.radius;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    this.goal.target.addScaledVector(right, -dx * r * 0.0016).addScaledVector(up, dy * r * 0.0016);
    this.goal.target.y = Math.max(0.02, this.goal.target.y);
  }

  // ------------------------------------------------------------ cinematic layer
  /** Hold a shot: pos/look are updated by the caller every frame while it lasts. */
  shot(on) { this.cine.goal = on ? 1 : 0; if (!on) this.takeBack(); }

  /** Hand the camera back from wherever the shot left it — no jump. */
  takeBack() {
    if (this.cine.w <= 0.001 && this.cine.goal === 0) return;
    this.cine.goal = 0;
    this.cine.w = 0;
    this.adopt(this.camera.position, this.cine.look);
    Object.assign(this.cur, { radius: this.goal.radius, theta: this.goal.theta, phi: this.goal.phi });
    this.cur.target.copy(this.goal.target);
  }

  update(dt) {
    // walking: move the target across the floor, relative to the view
    if (this.enabled && this.keys.size) {
      const fast = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 3 : 1;
      const f = new THREE.Vector3(-Math.sin(this.cur.theta), 0, -Math.cos(this.cur.theta));
      const r = new THREE.Vector3(-f.z, 0, f.x);
      const m = new THREE.Vector3();
      if (this.keys.has('KeyW')) m.add(f);
      if (this.keys.has('KeyS')) m.sub(f);
      if (this.keys.has('KeyA')) m.sub(r);
      if (this.keys.has('KeyD')) m.add(r);
      if (m.lengthSq()) { this.takeBack(); this.goal.target.addScaledVector(m.normalize(), dt * 0.7 * fast); }
    }
    // inertia after a flick
    if (!this.drag) {
      this.goal.theta += this.vel.theta * dt * 0.06;
      this.goal.phi = clamp(this.goal.phi + this.vel.phi * dt * 0.06, this.minPhi, this.maxPhi);
      this.vel.theta *= 1 - damp(4, dt);
      this.vel.phi *= 1 - damp(4, dt);
    }
    const k = damp(this.drag ? 14 : 6, dt);
    this.cur.theta += (this.goal.theta - this.cur.theta) * k;
    this.cur.phi += (this.goal.phi - this.cur.phi) * k;
    this.cur.radius += (this.goal.radius - this.cur.radius) * damp(6, dt);
    this.cur.target.lerp(this.goal.target, damp(5, dt));
    this.cine.w += (this.cine.goal - this.cine.w) * damp(this.cine.goal ? 2.6 : 4, dt);
    this.apply();
  }

  apply() {
    _sph.set(this.cur.radius, this.cur.phi, this.cur.theta);
    _v.setFromSpherical(_sph).add(this.cur.target);
    const w = this.cine.w;
    if (w > 0.001) {
      _v.lerp(this.cine.pos, w);
      this.camera.position.copy(_v);
      const look = this.cur.target.clone().lerp(this.cine.look, w);
      this.camera.lookAt(look);
    } else {
      this.camera.position.copy(_v);
      this.camera.lookAt(this.cur.target);
    }
    if (this.camera.position.y < 0.04) this.camera.position.y = 0.04;
  }
}
