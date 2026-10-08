import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function boxBody(mass, half, pos, quat) {
  const b = new CANNON.Body({ mass, shape: new CANNON.Box(new CANNON.Vec3(half.x, half.y, half.z)) });
  b.position.set(pos.x, pos.y, pos.z);
  if (quat) b.quaternion.set(quat.x, quat.y, quat.z, quat.w);
  return b;
}

export function sphereBody(mass, r, pos) {
  const b = new CANNON.Body({ mass, shape: new CANNON.Sphere(r) });
  b.position.set(pos.x, pos.y, pos.z);
  return b;
}

export function cylinderBody(mass, r, h, pos, segments = 14) {
  const b = new CANNON.Body({ mass, shape: new CANNON.Cylinder(r, r, h, segments) });
  b.position.set(pos.x, pos.y, pos.z);
  return b;
}

/** A shader-free "crack" glow: fracture-face emissive that flashes at the break. */
export function crackFlash(material, sim, t, { color = '#fff6e8', peak = 2.2, decay = 18, hide = true } = {}) {
  const bt = sim.recording?.breakTime;
  const broken = bt != null && t >= bt;
  // fracture faces don't exist until the object breaks (they would show through glass and ice)
  if (hide && material.visible !== broken) material.visible = broken;
  const k = broken ? Math.exp(-(t - bt) * decay) * peak : 0;
  material.emissive.set(color);
  material.emissiveIntensity = k;
}
