// Walking the gallery: drag to look, WASD / arrows / wheel to walk,
// click the floor to stroll there, click an artwork to approach it.
import * as THREE from 'three';
import { HALL } from './museum.js';
import { clamp, damp, wrapAngle, easeInOutCubic } from './util.js';

export class Walker {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.pos = new THREE.Vector3(0, 1.65, 4.2);
    this.yaw = 0;
    this.pitch = 0.02;
    this.tYaw = this.yaw;
    this.tPitch = this.pitch;
    this.vel = new THREE.Vector3();
    this.keys = new Set();
    this.enabled = false;
    this.colliders = [];
    this.tween = null;
    this.bob = 0;
    this.drag = null;
    this.onTap = null; // (ndc) => void
    this.mouse = new THREE.Vector2();

    dom.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.button !== 0) return;
      this.drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: 0, id: e.pointerId };
    });
    window.addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      if (!this.enabled || !this.drag || this.drag.id !== e.pointerId) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      this.drag.moved += Math.abs(dx) + Math.abs(dy);
      if (this.drag.moved > 4) {
        this.tween = null;
        const k = e.pointerType === 'touch' ? 0.0055 : 0.0032;
        this.tYaw += dx * k;
        this.tPitch = clamp(this.tPitch - dy * k, -0.6, 0.7);
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (!this.drag || this.drag.id !== e.pointerId) return;
      const tap = this.drag.moved < 6;
      this.drag = null;
      if (tap && this.enabled && this.onTap && e.target === this.dom) {
        this.onTap(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, textarea')) return;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.tween = null;
      const f = this.forward();
      this.vel.addScaledVector(f, -e.deltaY * 0.004);
    }, { passive: false });
  }

  forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Glide to a position and gaze, eased. */
  goTo(pos, yaw, pitch, duration = 2.2) {
    const dYaw = wrapAngle(yaw - this.yaw);
    this.tween = {
      from: this.pos.clone(), to: pos.clone(), yaw0: this.yaw, yaw1: this.yaw + dYaw, p0: this.pitch, p1: pitch, t: 0, d: duration,
    };
    this.vel.set(0, 0, 0);
  }

  set(pos, yaw, pitch) {
    this.pos.copy(pos);
    this.yaw = this.tYaw = yaw;
    this.pitch = this.tPitch = pitch;
    this.tween = null;
    this.vel.set(0, 0, 0);
  }

  update(dt) {
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const k = easeInOutCubic(clamp(tw.t / tw.d, 0, 1));
      this.pos.lerpVectors(tw.from, tw.to, k);
      this.yaw = this.tYaw = tw.yaw0 + (tw.yaw1 - tw.yaw0) * k;
      this.pitch = this.tPitch = tw.p0 + (tw.p1 - tw.p0) * k;
      this.bob += dt * 5 * Math.sin(k * Math.PI);
      if (tw.t >= tw.d) { this.tween = null; tw.done?.(); }
    } else if (this.enabled) {
      const f = this.forward();
      const r = new THREE.Vector3(-f.z, 0, f.x);
      const acc = new THREE.Vector3();
      const K = this.keys;
      if (K.has('KeyW') || K.has('ArrowUp')) acc.add(f);
      if (K.has('KeyS') || K.has('ArrowDown')) acc.sub(f);
      if (K.has('KeyA')) acc.sub(r);
      if (K.has('KeyD')) acc.add(r);
      if (K.has('ArrowLeft')) this.tYaw += dt * 1.4;
      if (K.has('ArrowRight')) this.tYaw -= dt * 1.4;
      if (acc.lengthSq() > 0) acc.normalize().multiplyScalar(9 * dt);
      this.vel.add(acc);
      this.vel.multiplyScalar(1 - damp(4.5, dt));
      const speed = this.vel.length();
      if (speed > 2.6) this.vel.multiplyScalar(2.6 / speed);
      this.pos.addScaledVector(this.vel, dt);
      this.bob += dt * speed * 3.2;
      this.yaw += wrapAngle(this.tYaw - this.yaw) * damp(9, dt);
      this.pitch += (this.tPitch - this.pitch) * damp(9, dt);
    }
    // keep inside the hall and out of the furniture
    this.pos.x = clamp(this.pos.x, HALL.x0 + 0.7, HALL.x1 - 0.7);
    this.pos.z = clamp(this.pos.z, HALL.zFar + 1.2, HALL.zNear - 1.0);
    for (const c of this.colliders) {
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < c.r && d > 1e-4) {
        this.pos.x = c.x + (dx / d) * c.r;
        this.pos.z = c.z + (dz / d) * c.r;
      }
    }
    const bobY = Math.sin(this.bob) * 0.012;
    this.camera.position.set(this.pos.x, this.pos.y + bobY, this.pos.z);
    // a breath of parallax with the mouse
    const px = this.enabled && !this.drag ? this.mouse.x * 0.02 : 0;
    const py = this.enabled && !this.drag ? this.mouse.y * 0.012 : 0;
    this.camera.rotation.set(this.pitch * -1 + py, this.yaw - px, 0, 'YXZ');
  }
}
