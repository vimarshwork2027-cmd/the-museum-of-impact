// Decorative debris that is a pure function of time: glass glitter, ceramic
// chips, ice crystals, stone grit and dust. Nothing is integrated frame by frame,
// so rewinding, scrubbing and freezing are exact — evaluate at t and draw.
import * as THREE from 'three';
import { mulberry32 } from '../util.js';
import { softDot } from '../textures.js';

const G = 9.81;
const KINDS = {
  glass: { max: 260, life: Infinity, e: 0.25, size: [0.003, 0.012] },
  chips: { max: 200, life: Infinity, e: 0.3, size: [0.004, 0.012] },
  crystal: { max: 260, life: Infinity, e: 0.2, size: [0.002, 0.009] },
  grit: { max: 200, life: Infinity, e: 0.2, size: [0.006, 0.022] },
};

function makeMaterial(kind) {
  switch (kind) {
    case 'glass': return new THREE.MeshPhysicalMaterial({ color: '#e8f4f0', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.75, clearcoat: 1, emissive: '#223', envMapIntensity: 2 });
    case 'chips': return new THREE.MeshStandardMaterial({ color: '#efe7d8', roughness: 0.35 });
    case 'crystal': return new THREE.MeshPhysicalMaterial({ color: '#dff1ff', roughness: 0.05, transparent: true, opacity: 0.85, emissive: '#2a4a66', emissiveIntensity: 0.6, envMapIntensity: 2 });
    case 'grit': return new THREE.MeshStandardMaterial({ color: '#9a8c74', roughness: 0.95 });
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _axis = new THREE.Vector3();

export class Particles {
  constructor(parent, { floorY = 0 } = {}) {
    this.floorY = floorY;
    this.group = new THREE.Group();
    parent.add(this.group);
    this.bursts = [];
    this.meshes = {};
    const geo = new THREE.TetrahedronGeometry(1, 0);
    for (const [kind, k] of Object.entries(KINDS)) {
      const mesh = new THREE.InstancedMesh(kind === 'grit' ? new THREE.DodecahedronGeometry(1, 0) : geo, makeMaterial(kind), k.max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = kind !== 'crystal';
      this.group.add(mesh);
      this.meshes[kind] = mesh;
    }
    // dust: soft sprites
    this.dustMax = 220;
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.dustMax * 3), 3));
    dg.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(this.dustMax), 1));
    dg.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(this.dustMax), 1));
    this.dust = new THREE.Points(dg, new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { map: { value: softDot() }, uColor: { value: new THREE.Color('#b9ab92') }, uScale: { value: 600 } },
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aAlpha; varying float vAlpha; uniform float uScale;
        void main() { vAlpha = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D map; uniform vec3 uColor; varying float vAlpha;
        void main() { float a = texture2D(map, gl_PointCoord).a; gl_FragColor = vec4(uColor, a * vAlpha); }
      `,
    }));
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  /** origin, dir (bias, normalized), speed, count, seed, spread (0..1 cone width) */
  add(kind, t0, { origin, dir = new THREE.Vector3(0, 1, 0), speed = 2, count = 30, seed = 1, spread = 0.8, scale = 1 }) {
    const rng = mulberry32(seed);
    const parts = [];
    const n = new THREE.Vector3().copy(dir).normalize();
    for (let i = 0; i < count; i++) {
      const r = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
      const v = n.clone().lerp(r, spread).normalize().multiplyScalar(speed * (0.25 + rng() * 0.9));
      const k = KINDS[kind];
      parts.push({
        p0: new THREE.Vector3(origin.x + (rng() - 0.5) * 0.04, origin.y + (rng() - 0.5) * 0.04, origin.z + (rng() - 0.5) * 0.04),
        v,
        size: k ? (k.size[0] + rng() * (k.size[1] - k.size[0])) * scale : (0.08 + rng() * 0.12) * scale,
        axis: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(),
        spin: (rng() - 0.5) * 40,
        a0: 0.35 + rng() * 0.4,
      });
    }
    this.bursts.push({ kind, t0, parts, origin: origin.clone() });
  }

  serialize() {
    return this.bursts.map((b) => ({ k: b.kind, t: +b.t0.toFixed(4), p: b.parts.map((q) => [q.p0.x, q.p0.y, q.p0.z, q.v.x, q.v.y, q.v.z, q.size, q.spin].map((x) => +x.toFixed(4))) }));
  }

  load(list) {
    this.bursts = (list || []).map((b) => ({
      kind: b.k, t0: b.t,
      parts: b.p.map((a, i) => ({ p0: new THREE.Vector3(a[0], a[1], a[2]), v: new THREE.Vector3(a[3], a[4], a[5]), size: a[6], spin: a[7], axis: new THREE.Vector3(Math.sin(i), Math.cos(i * 1.3), 0.5).normalize(), a0: 0.5 })),
    }));
  }

  reset() { this.bursts = []; }

  /** Ballistic flight with one damped bounce, then rest. */
  ballistic(q, t, e, out) {
    const fy = this.floorY;
    const y0 = q.p0.y - fy;
    const vy = q.v.y;
    const t1 = (vy + Math.sqrt(Math.max(vy * vy + 2 * G * y0, 0))) / G;
    if (t < t1) {
      out.set(q.p0.x + q.v.x * t, q.p0.y + vy * t - 0.5 * G * t * t, q.p0.z + q.v.z * t);
      return t;
    }
    const x1 = q.p0.x + q.v.x * t1, z1 = q.p0.z + q.v.z * t1;
    const vy2 = e * (G * t1 - vy);
    const t2 = (2 * vy2) / G;
    const tt = Math.min(t - t1, t2);
    out.set(x1 + q.v.x * 0.35 * tt, fy + vy2 * tt - 0.5 * G * tt * tt + q.size * 0.5, z1 + q.v.z * 0.35 * tt);
    return t1 + tt * 0.3;
  }

  update(t) {
    const counts = {};
    for (const k of Object.keys(KINDS)) counts[k] = 0;
    let dn = 0;
    const dp = this.dust.geometry.attributes.position, ds = this.dust.geometry.attributes.aSize, da = this.dust.geometry.attributes.aAlpha;
    for (const b of this.bursts) {
      const lt = t - b.t0;
      if (lt < 0) continue;
      if (b.kind === 'dust') {
        for (const q of b.parts) {
          if (dn >= this.dustMax) break;
          const life = 3.2;
          if (lt > life) continue;
          const r = 1 - Math.exp(-lt * 2.2);
          dp.setXYZ(dn, q.p0.x + q.v.x * 0.25 * r, q.p0.y + Math.abs(q.v.y) * 0.08 * r + lt * 0.05, q.p0.z + q.v.z * 0.25 * r);
          ds.setX(dn, q.size * (0.4 + r * 2.4));
          da.setX(dn, q.a0 * Math.min(1, lt * 20) * (1 - lt / life) * 0.5);
          dn++;
        }
        continue;
      }
      const mesh = this.meshes[b.kind];
      const k = KINDS[b.kind];
      for (const q of b.parts) {
        const c = counts[b.kind];
        if (c >= k.max) break;
        const spinT = this.ballistic(q, lt, k.e, _p);
        _axis.copy(q.axis);
        _q.setFromAxisAngle(_axis, q.spin * spinT);
        _s.setScalar(q.size);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(c, _m);
        counts[b.kind] = c + 1;
      }
    }
    for (const [kind, mesh] of Object.entries(this.meshes)) {
      mesh.count = counts[kind];
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.dust.geometry.setDrawRange(0, dn);
    dp.needsUpdate = ds.needsUpdate = da.needsUpdate = true;
  }
}
