// Volumetric pre-fracture for solid blocks (the ice). Each Voronoi cell of a
// seeded point cloud, clipped to the block, becomes a convex shard. Faces that
// lie on the block's skin keep material 0 (polished); interior fracture faces
// get material 1 (frosted). Built once at load; nothing fractures at runtime.
import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { mulberry32 } from '../util.js';

/**
 * @param {THREE.Vector3} size  full block extents
 * @param {number} count        number of cells
 * @param {object} o            { seed, bias: Vector3 (denser seeds near this local point) }
 */
export function voronoiBlock(size, count, { seed = 1, bias = null, biasAmount = 0.5 } = {}) {
  const rng = mulberry32(seed);
  const h = size.clone().multiplyScalar(0.5);
  const seeds = [];
  for (let i = 0; i < count; i++) {
    const p = new THREE.Vector3((rng() * 2 - 1) * h.x, (rng() * 2 - 1) * h.y, (rng() * 2 - 1) * h.z);
    if (bias && rng() < biasAmount) p.lerp(bias, 0.55 * rng());
    seeds.push(p);
  }
  // box planes as (n, d): n·x <= d
  const boxPlanes = [
    [new THREE.Vector3(1, 0, 0), h.x], [new THREE.Vector3(-1, 0, 0), h.x],
    [new THREE.Vector3(0, 1, 0), h.y], [new THREE.Vector3(0, -1, 0), h.y],
    [new THREE.Vector3(0, 0, 1), h.z], [new THREE.Vector3(0, 0, -1), h.z],
  ];
  const shards = [];
  const m = new THREE.Matrix3();
  const v = new THREE.Vector3();
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    const planes = boxPlanes.slice();
    for (let j = 0; j < seeds.length; j++) {
      if (j === i) continue;
      const n = seeds[j].clone().sub(s);
      const mid = seeds[j].clone().add(s).multiplyScalar(0.5);
      n.normalize();
      planes.push([n, n.dot(mid)]);
    }
    // vertices = feasible triple-plane intersections
    const pts = [];
    const P = planes.length;
    for (let a = 0; a < P; a++) for (let b = a + 1; b < P; b++) for (let c = b + 1; c < P; c++) {
      const [na, da] = planes[a], [nb, db] = planes[b], [nc, dc] = planes[c];
      m.set(na.x, na.y, na.z, nb.x, nb.y, nb.z, nc.x, nc.y, nc.z);
      const det = m.determinant();
      if (Math.abs(det) < 1e-9) continue;
      m.invert();
      v.set(da, db, dc).applyMatrix3(m);
      let ok = true;
      for (let k = 0; k < P; k++) {
        if (planes[k][0].dot(v) > planes[k][1] + 1e-6) { ok = false; break; }
      }
      if (ok && !pts.some((q) => q.distanceToSquared(v) < 1e-10)) pts.push(v.clone());
    }
    if (pts.length < 4) continue;
    shards.push(buildHull(pts, h));
  }
  return shards.filter(Boolean);
}

function buildHull(points, h) {
  const hull = new ConvexHull().setFromPoints(points);
  const center = new THREE.Vector3();
  for (const p of points) center.add(p);
  center.divideScalar(points.length);
  const pos = [], nor = [], uv = [];
  const groups = [[], []];
  for (const face of hull.faces) {
    const n = face.normal;
    const verts = [];
    let e = face.edge;
    do { verts.push(e.head().point); e = e.next; } while (e !== face.edge);
    // skin faces lie on a box plane
    const p0 = verts[0];
    const onSkin = (Math.abs(Math.abs(n.x) - 1) < 1e-4 && Math.abs(Math.abs(p0.x) - h.x) < 1e-4)
      || (Math.abs(Math.abs(n.y) - 1) < 1e-4 && Math.abs(Math.abs(p0.y) - h.y) < 1e-4)
      || (Math.abs(Math.abs(n.z) - 1) < 1e-4 && Math.abs(Math.abs(p0.z) - h.z) < 1e-4);
    const g = groups[onSkin ? 0 : 1];
    for (let k = 1; k < verts.length - 1; k++) g.push(verts[0], verts[k], verts[k + 1], n);
  }
  let start = 0;
  const geo = new THREE.BufferGeometry();
  const gl = [];
  groups.forEach((list, gi) => {
    for (let k = 0; k < list.length; k += 4) {
      const n = list[k + 3];
      for (let q = 0; q < 3; q++) {
        const p = list[k + q];
        pos.push(p.x - center.x, p.y - center.y, p.z - center.z);
        nor.push(n.x, n.y, n.z);
        // planar UV from the dominant axis
        const ax = Math.abs(n.x), ay = Math.abs(n.y);
        if (ax > ay && ax > Math.abs(n.z)) uv.push(p.z * 3, p.y * 3);
        else if (ay > Math.abs(n.z)) uv.push(p.x * 3, p.z * 3);
        else uv.push(p.x * 3, p.y * 3);
      }
    }
    const count = (list.length / 4) * 3;
    gl.push([start, count, gi]);
    start += count;
  });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  for (const [s, c, m] of gl) if (c) geo.addGroup(s, c, m);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const bb = geo.boundingBox;
  const half = new THREE.Vector3().subVectors(bb.max, bb.min).multiplyScalar(0.45);
  half.x = Math.max(half.x, 0.008); half.y = Math.max(half.y, 0.008); half.z = Math.max(half.z, 0.008);
  return { geometry: geo, center, quaternion: new THREE.Quaternion(), half, volume: half.x * half.y * half.z };
}
