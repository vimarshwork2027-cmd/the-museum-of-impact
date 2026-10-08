// A growable buffer of physics snapshots plus an event log. The time system
// never reverses physics: it records forward and interpolates between frames.
import * as THREE from 'three';

const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();

export class Recording {
  constructor(n, dt) {
    this.n = n;
    this.dt = dt;
    this.cap = 256;
    this.data = new Float32Array(this.cap * n * 7);
    this.count = 0;
    this.events = []; // { t, type, ... } sorted by t
    this.impactTime = null;
    this.breakTime = null;
  }

  get end() { return Math.max(0, (this.count - 1) * this.dt); }

  push(meshes) {
    if (this.count >= this.cap) {
      this.cap *= 2;
      const d = new Float32Array(this.cap * this.n * 7);
      d.set(this.data);
      this.data = d;
    }
    const o = this.count * this.n * 7;
    for (let i = 0; i < this.n; i++) {
      const m = meshes[i], k = o + i * 7;
      this.data[k] = m.position.x; this.data[k + 1] = m.position.y; this.data[k + 2] = m.position.z;
      this.data[k + 3] = m.quaternion.x; this.data[k + 4] = m.quaternion.y; this.data[k + 5] = m.quaternion.z; this.data[k + 6] = m.quaternion.w;
    }
    this.count++;
  }

  event(e) { this.events.push(e); }

  /** Interpolated state at t applied onto meshes (or any objects with position/quaternion). */
  sample(t, meshes) {
    if (!this.count) return;
    const n = this.n;
    const x = Math.min(Math.max(t, 0), this.end) / this.dt;
    const f0 = Math.min(Math.floor(x), this.count - 1);
    const f1 = Math.min(f0 + 1, this.count - 1);
    const a = x - f0;
    const d = this.data;
    for (let i = 0; i < n; i++) {
      const k0 = (f0 * n + i) * 7, k1 = (f1 * n + i) * 7;
      const m = meshes[i];
      m.position.set(d[k0] + (d[k1] - d[k0]) * a, d[k0 + 1] + (d[k1 + 1] - d[k0 + 1]) * a, d[k0 + 2] + (d[k1 + 2] - d[k0 + 2]) * a);
      _q0.set(d[k0 + 3], d[k0 + 4], d[k0 + 5], d[k0 + 6]);
      _q1.set(d[k1 + 3], d[k1 + 4], d[k1 + 5], d[k1 + 6]);
      m.quaternion.slerpQuaternions(_q0, _q1, a);
    }
  }

  /** Mean fragment speed around t — used to judge whether a frozen instant is "alive". */
  motionAt(t) {
    if (this.count < 2) return 0;
    const n = this.n, d = this.data;
    const f0 = Math.min(Math.max(Math.floor(t / this.dt), 0), this.count - 2);
    let s = 0;
    for (let i = 0; i < n; i++) {
      const k0 = (f0 * n + i) * 7, k1 = ((f0 + 1) * n + i) * 7;
      s += Math.hypot(d[k1] - d[k0], d[k1 + 1] - d[k0 + 1], d[k1 + 2] - d[k0 + 2]) / this.dt;
    }
    return s / n;
  }

  /** Spatial spread of all pieces at t — a cheap measure of how "open" the moment is. */
  spreadAt(t) {
    if (!this.count) return 0;
    const n = this.n, d = this.data;
    const f = Math.min(Math.max(Math.round(t / this.dt), 0), this.count - 1);
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < n; i++) { const k = (f * n + i) * 7; cx += d[k]; cy += d[k + 1]; cz += d[k + 2]; }
    cx /= n; cy /= n; cz /= n;
    let s = 0;
    for (let i = 0; i < n; i++) { const k = (f * n + i) * 7; s += Math.hypot(d[k] - cx, (d[k + 1] - cy) * 1.6, d[k + 2] - cz); }
    return s / n;
  }

  /** The most alive instant in [a, b]: fragments moving fastest, a beat after contact. */
  findMoment(a, b) {
    let best = a, score = -1;
    for (let t = a; t <= Math.min(b, this.end); t += this.dt) {
      const ramp = Math.min(1, Math.max(0, (t - a) / 0.05));
      const s = this.motionAt(t) * ramp * (1 - (t - a) / (b - a) * 0.3);
      if (s > score) { score = s; best = t; }
    }
    return best;
  }
}
