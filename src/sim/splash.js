// THE SPLASH, choreographed. A believable splash as a pure function of time
// since entry: surface cavity → crown with tendrils → droplets and smaller
// secondaries → Worthington jet → ripples (including ripples from every droplet
// that falls back). No fluid solver, so time can stop, run backwards or crawl.
import * as THREE from 'three';
import { mulberry32 } from '../util.js';

const G = 9.81;
export const SURFACE_Y = 0.8;
export const BASIN_R = 0.47;
const MAX_RINGS = 12;
const MAX_DROPS = 170;

const waveChunk = /* glsl */ `
  uniform float uT; uniform vec2 uC; uniform float uAmp; uniform float uIdle;
  uniform vec4 uRings[${MAX_RINGS}];
  float hAt(vec2 p) {
    float h = 0.0;
    float rr = length(p);
    float edge = 1.0 - smoothstep(${(BASIN_R - 0.05).toFixed(3)}, ${BASIN_R.toFixed(3)}, rr);
    h += 0.0012 * sin(p.x * 23.0 + uIdle * 0.9) * sin(p.y * 19.0 - uIdle * 0.7);
    if (uT > 0.0) {
      float t = uT;
      float r = length(p - uC);
      float cav = -uAmp * exp(-r * r / (0.0016 + t * 0.03)) * exp(-t * 7.0) * smoothstep(0.0, 0.015, t);
      float front = 0.5 * t + 0.03;
      float inside = 1.0 - smoothstep(front - 0.03, front + 0.03, r);
      float ring = uAmp * 0.55 * sin(44.0 * r - 26.0 * t) * inside * exp(-1.6 * t) / (1.0 + 9.0 * r);
      h += cav + ring;
    }
    for (int i = 0; i < ${MAX_RINGS}; i++) {
      vec4 R = uRings[i];
      float t = uT - R.z;
      if (R.w <= 0.0 || t <= 0.0) continue;
      float r = length(p - R.xy);
      float front = 0.35 * t + 0.01;
      float inside = 1.0 - smoothstep(front - 0.015, front + 0.015, r);
      h += R.w * sin(70.0 * r - 30.0 * t) * inside * exp(-2.4 * t) / (1.0 + 30.0 * r);
    }
    return h * edge;
  }
`;

function liquidMaterial(opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: '#dcebe8', roughness: 0.03, metalness: 0, transmission: 1, ior: 1.333, thickness: 0.25,
    attenuationColor: new THREE.Color('#7da7a1'), attenuationDistance: 0.7, specularIntensity: 1, envMapIntensity: 1.6,
    clearcoat: 0.6, clearcoatRoughness: 0.05, ...opts,
  });
}

/** Cheap look-alike for the gallery (no transmission pass in the museum). */
function liquidDisplayMaterial() {
  return new THREE.MeshPhysicalMaterial({ color: '#9fbdb8', roughness: 0.04, transparent: true, opacity: 0.62, envMapIntensity: 2.2, clearcoat: 1 });
}

export class Splash {
  constructor(parent, { display = false, center = new THREE.Vector3(0, 0, 0) } = {}) {
    this.root = new THREE.Group();
    this.root.position.copy(center);
    parent.add(this.root);
    this.params = null;
    this.uniforms = {
      uT: { value: -1 }, uC: { value: new THREE.Vector2() }, uAmp: { value: 0.04 }, uIdle: { value: 0 },
      uRings: { value: Array.from({ length: MAX_RINGS }, () => new THREE.Vector4(0, 0, 0, 0)) },
    };

    // surface: dense radial disc, displaced in the vertex shader
    const geo = new THREE.CircleGeometry(BASIN_R, 160, 0, Math.PI * 2);
    // subdivide radially: rebuild as rings for even vertex density
    const ring = new THREE.RingGeometry(0.0005, BASIN_R, 160, 60);
    ring.rotateX(-Math.PI / 2);
    geo.dispose();
    const mat = display ? liquidDisplayMaterial() : liquidMaterial();
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${waveChunk}`)
        .replace('#include <beginnormal_vertex>', `
          vec2 pp = position.xz;
          float e = 0.004;
          float hC = hAt(pp);
          float hX = hAt(pp + vec2(e, 0.0));
          float hZ = hAt(pp + vec2(0.0, e));
          vec3 objectNormal = normalize(vec3(-(hX - hC) / e, 1.0, -(hZ - hC) / e));
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(1.0, 0.0, 0.0);
          #endif
        `)
        .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x, position.y + hC, position.z);');
    };
    mat.customProgramCacheKey = () => 'liquid-surface' + (display ? '-d' : '');
    this.surface = new THREE.Mesh(ring, mat);
    this.surface.position.y = SURFACE_Y;
    this.surface.receiveShadow = true;
    this.root.add(this.surface);

    // crown: open cylinder bent into a flaring wall with tendrils
    const crownGeo = new THREE.CylinderGeometry(1, 1, 1, 128, 16, true);
    crownGeo.translate(0, 0.5, 0);
    this.crownMat = display ? liquidDisplayMaterial() : liquidMaterial({ thickness: 0.02, transmission: 0.95, side: THREE.DoubleSide });
    this.crownMat.side = THREE.DoubleSide;
    this.crownBase = crownGeo.attributes.position.array.slice();
    this.crown = new THREE.Mesh(crownGeo, this.crownMat);
    this.crown.visible = false;
    this.crown.castShadow = true;
    this.root.add(this.crown);

    // Worthington jet
    this.jet = new THREE.Mesh(new THREE.CapsuleGeometry(1, 1, 6, 16), this.crownMat);
    this.jet.visible = false;
    this.root.add(this.jet);

    // droplets
    const dropMat = display ? liquidDisplayMaterial() : liquidMaterial({ thickness: 0.01 });
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), dropMat, MAX_DROPS);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.drops.count = 0;
    this.drops.frustumCulled = false;
    this.drops.castShadow = true;
    this.root.add(this.drops);
  }

  /** x, z in basin-local metres; s = entry speed (m/s). */
  trigger(t0, { x, z, s, seed = 1 }) {
    const rng = mulberry32(seed);
    const k = Math.min(Math.max(s / 4, 0.4), 1.6);
    const p = { t0, x, z, s, k, amp: 0.018 + 0.03 * k, crownH: 0.05 + 0.09 * k, crownT: 0.26 + 0.12 * k, r0: 0.03, spikes: 16 + Math.floor(rng() * 5), drops: [], rings: [] };
    // primary droplets leave from the tendril tips; secondaries are smaller and faster
    const N = Math.floor(40 + 36 * k);
    for (let i = 0; i < N; i++) {
      const primary = i < N * 0.55;
      const ang = primary ? ((Math.floor(rng() * p.spikes) + 0.5) / p.spikes) * Math.PI * 2 : rng() * Math.PI * 2;
      const td = (primary ? 0.05 : 0.03) + rng() * p.crownT * 0.6;
      const rr = this.crownRadius(p, td) + (primary ? 0.02 : 0.005);
      const hh = this.crownHeight(p, td) * (primary ? 1.05 : 0.6 + rng() * 0.4);
      const out = (primary ? 0.45 : 0.8) * k * (0.6 + rng() * 0.8);
      const up = (primary ? 1.25 : 1.6) * k * (0.5 + rng() * 0.7);
      p.drops.push({
        td, px: x + Math.cos(ang) * rr, py: SURFACE_Y + hh, pz: z + Math.sin(ang) * rr,
        vx: Math.cos(ang) * out, vy: up, vz: Math.sin(ang) * out,
        size: (primary ? 0.0045 + rng() * 0.004 : 0.0018 + rng() * 0.0025) * (0.8 + k * 0.3),
      });
    }
    // the jet's tip pinches off one fat drop
    p.jetDrop = { td: 0.2 + 0.08 * k, vy: 0.9 * k, size: 0.008 + 0.004 * k };
    // landing times → secondary ripples (the largest few)
    for (const d of p.drops) {
      const dy = d.py - SURFACE_Y;
      const tl = (d.vy + Math.sqrt(d.vy * d.vy + 2 * G * dy)) / G;
      d.tl = tl;
      const lx = d.px + d.vx * tl, lz = d.pz + d.vz * tl;
      d.inside = Math.hypot(lx, lz) < BASIN_R - 0.01;
      d.lx = lx; d.lz = lz;
    }
    p.rings = p.drops.filter((d) => d.inside && d.size > 0.005).sort((a, b) => b.size - a.size).slice(0, MAX_RINGS)
      .map((d) => ({ x: d.lx, z: d.lz, t: d.td + d.tl, a: d.size * 0.6 }));
    this.params = p;
    return p;
  }

  clear() { this.params = null; }

  crownRadius(p, t) { return p.r0 + 0.11 * p.k * Math.sqrt(Math.max(t, 0)); }
  crownHeight(p, t) {
    const u = t / p.crownT;
    return u <= 0 || u >= 1 ? 0 : p.crownH * Math.sin(Math.PI * Math.pow(u, 0.7));
  }

  /** Landing events for the sound system: [{t, v}] relative to the impact. */
  landings() {
    if (!this.params) return [];
    return this.params.drops.filter((d) => d.size > 0.004).map((d) => ({ t: d.td + d.tl, v: d.size * 200, inside: d.inside }));
  }

  update(tAbs, idleTime = 0) {
    const u = this.uniforms;
    u.uIdle.value = idleTime;
    const p = this.params;
    if (!p) { u.uT.value = -1; this.crown.visible = false; this.jet.visible = false; this.drops.count = 0; return; }
    const t = tAbs - p.t0;
    u.uT.value = t;
    u.uC.value.set(p.x, p.z);
    u.uAmp.value = p.amp;
    for (let i = 0; i < MAX_RINGS; i++) {
      const r = p.rings[i];
      if (r) u.uRings.value[i].set(r.x, r.z, r.t, r.a); else u.uRings.value[i].set(0, 0, 0, 0);
    }
    // crown
    const H = this.crownHeight(p, t);
    this.crown.visible = H > 0.002;
    if (this.crown.visible) {
      const R = this.crownRadius(p, t);
      const pos = this.crown.geometry.attributes.position;
      const base = this.crownBase;
      for (let i = 0; i < pos.count; i++) {
        const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
        const ang = Math.atan2(bz, bx);
        const spike = Math.pow(Math.abs(Math.cos((ang * p.spikes) / 2)), 10);
        const v = by; // 0 at the surface → 1 at the rim
        const flare = R + v * H * 0.55 + v * v * H * 0.25;
        const thin = 1 - v * 0.04;
        const top = H * (1 + spike * 0.55 * Math.pow(v, 3));
        pos.setXYZ(i, p.x + bx * flare * thin, SURFACE_Y - 0.004 + v * top, p.z + bz * flare * thin);
      }
      pos.needsUpdate = true;
      this.crown.geometry.computeVertexNormals();
    }
    // jet
    const jt = t - 0.12;
    const jd = 0.42 + 0.12 * p.k;
    if (jt > 0 && jt < jd) {
      const hj = (0.06 + 0.12 * p.k) * Math.sin((Math.PI * jt) / jd);
      this.jet.visible = hj > 0.004;
      this.jet.scale.set(0.011 + 0.004 * p.k, hj / 2, 0.011 + 0.004 * p.k);
      this.jet.position.set(p.x, SURFACE_Y + hj / 2 - 0.01, p.z);
    } else this.jet.visible = false;
    // droplets
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pp = new THREE.Vector3(), dir = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let n = 0;
    const put = (x, y, z, vx, vy, vz, size) => {
      if (n >= MAX_DROPS) return;
      dir.set(vx, vy, vz);
      const sp = dir.length();
      if (sp > 1e-4) q.setFromUnitVectors(up, dir.normalize()); else q.identity();
      const stretch = 1 + Math.min(sp * 0.35, 1.6);
      s.set(size, size * stretch, size);
      pp.set(x, y, z);
      m.compose(pp, q, s);
      this.drops.setMatrixAt(n++, m);
    };
    for (const d of p.drops) {
      const lt = t - d.td;
      if (lt < 0) continue;
      if (d.inside && lt > d.tl) continue; // swallowed back into the basin
      const y = d.py + d.vy * lt - 0.5 * G * lt * lt;
      if (!d.inside && y < 0.003) continue; // reached the museum floor
      put(d.px + d.vx * lt, y, d.pz + d.vz * lt, d.vx, d.vy - G * lt, d.vz, d.size);
    }
    // jet drop
    const jdp = p.jetDrop;
    const lt = t - 0.12 - jdp.td;
    if (lt > 0) {
      const y0 = SURFACE_Y + (0.06 + 0.12 * p.k) * 0.9;
      const y = y0 + jdp.vy * lt - 0.5 * G * lt * lt;
      if (y > SURFACE_Y) put(p.x, y, p.z, 0, jdp.vy - G * lt, 0, jdp.size);
    }
    this.drops.count = n;
    this.drops.instanceMatrix.needsUpdate = true;
  }

  serialize() { return this.params ? { ...this.params } : null; }
  load(p) { this.params = p ? { ...p } : null; }
}
