// Pre-fractured shell geometry. A surface is cut into a grid of cells whose
// boundaries wander (seeded), so neighbouring shards share their crack lines
// exactly and the object reads as whole until the moment it breaks.
import * as THREE from 'three';

/**
 * @param {object} o
 * @param {(a:number,b:number,layer:0|1)=>THREE.Vector3} o.surface  a∈[0,2π), b∈[0,1]; layer 0 = outer, 1 = inner
 * @param {number} o.sectors  cells around a
 * @param {number[]} o.bands  boundaries in b, e.g. [0, .3, .6, 1]
 * @param {number} o.aJitter  crack wander in a
 * @param {number} o.bJitter  crack wander in b
 * @param {number} o.res      samples per cell edge
 * @param {number} o.seed
 * @returns {{geometry:THREE.BufferGeometry, center:THREE.Vector3, quaternion:THREE.Quaternion, half:THREE.Vector3}[]}
 */
export function fractureShell(o) {
  const { surface, sectors, bands, aJitter = 0.12, bJitter = 0.04, res = 6, seed = 1 } = o;
  const TAU = Math.PI * 2;
  const phase = (k, m) => Math.sin(k * 12.9898 + m * 78.233 + seed * 3.17) * 43758.5453 % 1;

  // Sector boundary k as a function of b (wavy meridian). k wraps.
  const aEdge = (k, b) => {
    const kk = ((k % sectors) + sectors) % sectors;
    const base = (k / sectors) * TAU;
    const p1 = phase(kk, 1), p2 = phase(kk, 2);
    return base + aJitter * (Math.sin(b * 9 + p1 * 6) * 0.6 + Math.sin(b * 23 + p2 * 6) * 0.4) * (TAU / sectors);
  };
  // Band boundary j as a function of a (wavy parallel). Outer bounds stay exact.
  const bEdge = (j, a) => {
    if (j === 0 || j === bands.length - 1) return bands[j];
    const p1 = phase(j, 3), p2 = phase(j, 4);
    return bands[j] + bJitter * (Math.sin(a * 3 + p1 * 6) * 0.5 + Math.sin(a * 7 + p2 * 6) * 0.5);
  };

  const shards = [];
  for (let j = 0; j < bands.length - 1; j++) {
    for (let k = 0; k < sectors; k++) {
      // Parametric cell: (u,v) → (a,b) such that shared edges coincide.
      const cell = (u, v) => {
        const bLin = bands[j] + (bands[j + 1] - bands[j]) * v;
        const a = aEdge(k, bLin) + (aEdge(k + 1, bLin) - aEdge(k, bLin)) * u;
        const b = bEdge(j, a) + (bEdge(j + 1, a) - bEdge(j, a)) * v;
        return [a, b];
      };
      shards.push(buildCell(cell, surface, res));
    }
  }
  return shards;
}

function buildCell(cell, surface, res) {
  const N = res;
  const pos = [], uv = [], idx = [];
  const groups = [];
  const outer = [], inner = [];
  // grid samples
  for (let iv = 0; iv <= N; iv++) {
    for (let iu = 0; iu <= N; iu++) {
      const [a, b] = cell(iu / N, iv / N);
      outer.push({ p: surface(a, b, 0), a, b });
      inner.push({ p: surface(a, b, 1), a, b });
    }
  }
  const TAU = Math.PI * 2;
  const pushV = (p, u, v) => { pos.push(p.x, p.y, p.z); uv.push(u, v); return pos.length / 3 - 1; };

  // outer surface
  let start = idx.length;
  const oBase = pos.length / 3;
  for (const s of outer) pushV(s.p, s.a / TAU, s.b);
  for (let iv = 0; iv < N; iv++) for (let iu = 0; iu < N; iu++) {
    const a = oBase + iv * (N + 1) + iu, b = a + 1, c = a + (N + 1), d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  groups.push([start, idx.length - start, 0]);

  // inner surface
  start = idx.length;
  const iBase = pos.length / 3;
  for (const s of inner) pushV(s.p, s.a / TAU, s.b);
  for (let iv = 0; iv < N; iv++) for (let iu = 0; iu < N; iu++) {
    const a = iBase + iv * (N + 1) + iu, b = a + 1, c = a + (N + 1), d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  groups.push([start, idx.length - start, 1]);

  // four fracture faces joining outer to inner
  start = idx.length;
  const edges = [];
  const at = (iu, iv) => iv * (N + 1) + iu;
  const e0 = [], e1 = [], e2 = [], e3 = [];
  for (let i = 0; i <= N; i++) {
    e0.push(at(i, 0)); e1.push(at(N, i)); e2.push(at(N - i, N)); e3.push(at(0, N - i));
  }
  edges.push(e0, e1, e2, e3);
  for (const e of edges) {
    const base = pos.length / 3;
    for (let i = 0; i < e.length; i++) {
      pushV(outer[e[i]].p, i / N, 0);
      pushV(inner[e[i]].p, i / N, 1);
    }
    for (let i = 0; i < e.length - 1; i++) {
      const o0 = base + i * 2, i0 = o0 + 1, o1 = o0 + 2, i1 = o0 + 3;
      idx.push(o0, o1, i0, o1, i1, i0);
    }
  }
  groups.push([start, idx.length - start, 2]);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  for (const [s, c, m] of groups) g.addGroup(s, c, m);

  // Local frame: tangent along a, bitangent along b, normal outward.
  const mid = outer[at(N >> 1, N >> 1)].p;
  const pa = outer[at(N, N >> 1)].p.clone().sub(outer[at(0, N >> 1)].p).normalize();
  const pb = outer[at(N >> 1, N)].p.clone().sub(outer[at(N >> 1, 0)].p).normalize();
  const n = new THREE.Vector3().crossVectors(pa, pb).normalize();
  const bt = new THREE.Vector3().crossVectors(n, pa).normalize();
  const m = new THREE.Matrix4().makeBasis(pa, bt, n);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);

  const center = new THREE.Vector3();
  let cnt = 0;
  for (const s of outer) { center.add(s.p); cnt++; }
  for (const s of inner) { center.add(s.p); cnt++; }
  center.divideScalar(cnt);
  if (!isFinite(center.x)) center.copy(mid);

  const inv = new THREE.Matrix4().compose(center, q, new THREE.Vector3(1, 1, 1)).invert();
  g.applyMatrix4(inv);
  g.computeVertexNormals();
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const half = new THREE.Vector3().subVectors(bb.max, bb.min).multiplyScalar(0.5);
  half.x = Math.max(half.x * 0.85, 0.008);
  half.y = Math.max(half.y * 0.85, 0.008);
  half.z = Math.max(half.z, 0.008);
  g.computeBoundingSphere();
  return { geometry: g, center, quaternion: q, half };
}
