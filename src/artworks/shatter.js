// 01 — THE SHATTER. The flagship. The vessel and its fracture pattern are the
// original vase; it is now blown glass, and the visitor causes the impact.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { fractureShell } from '../sim/fracture.js';
import { scratches } from '../textures.js';
import { V, boxBody, crackFlash } from './common.js';

let edgeMat;

export default {
  id: 'shatter',
  number: '001',
  title: 'The Shatter',
  material: 'Blown glass',
  year: 2026,
  sound: 'glass',
  personality: 'fast · sharp · chaotic · delicate',
  text: 'A vessel that survived three centuries of careful hands. It is not the artwork. The forty milliseconds after it meets the stone are.',
  hint: 'Take hold of the glass',
  holding: 'Holding the vessel',
  heroOffset: 0.05,
  testTarget: [0.35, 0, 0.2],
  canonicalDuration: 2.4,
  holdMinY: 0.24,
  stage: { floor: 'slate', plinth: { height: 1.0, display: false }, keyPos: V(-1.6, 3.6, 2.2), keyTarget: V(0, 1.1, 0), keyIntensity: 26 },
  camera: { pos: V(0.95, 1.5, 2.1), target: V(0, 1.12, 0) },
  gallery: { x: 0, z: -6, vitrine: true },

  build(sim) {
    const top = 1.0;
    const profile = new THREE.SplineCurve([
      V(0.06, 0), V(0.088, 0.035), V(0.128, 0.14), V(0.118, 0.26), V(0.062, 0.34), V(0.047, 0.39), V(0.066, 0.43),
    ].map((v) => new THREE.Vector2(v.x, v.y)));
    const thick = 0.0055;
    const surface = (a, b, layer) => {
      const p = profile.getPoint(b);
      const r = p.x - layer * thick;
      return V(Math.cos(a) * r, top + p.y + 0.008, Math.sin(a) * r);
    };
    const shards = fractureShell({ surface, sectors: 10, bands: [0, 0.14, 0.32, 0.5, 0.68, 0.85, 1], aJitter: 0.24, bJitter: 0.05, res: 7, seed: 4 });

    const scratch = scratches();
    scratch.repeat.set(2, 1);
    const glass = new THREE.MeshPhysicalMaterial({
      color: '#f7fcfa', metalness: 0, roughness: 0.14, roughnessMap: scratch, transmission: 1, thickness: 0.012, ior: 1.5,
      attenuationColor: new THREE.Color('#d2ece2'), attenuationDistance: 0.5, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02,
      envMapIntensity: 1.7, side: THREE.DoubleSide,
    });
    const inner = glass.clone(); // same features as the outer skin → same compiled shader
    inner.roughness = 0.05;
    edgeMat = glass.clone();
    Object.assign(edgeMat, { roughness: 0.4, transmission: 0.8, thickness: 0.02, attenuationDistance: 0.04, envMapIntensity: 2 });
    edgeMat.color.set('#c3e6d8');
    edgeMat.attenuationColor.set('#6fb59a');
    const mats = [glass, inner, edgeMat];
    const pieces = shards.map((s) => sim.add(new THREE.Mesh(s.geometry, mats), boxBody(0.012, s.half, s.center, s.quaternion), { material: 'glass' }));
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.062, 0.012, 40), [edgeMat, inner, inner]);
    const fb = new CANNON.Body({ mass: 0.04, shape: new CANNON.Cylinder(0.06, 0.062, 0.012, 12) });
    fb.position.set(0, top + 0.006, 0);
    pieces.push(sim.add(foot, fb, { material: 'glass' }));

    const carrier = new CANNON.Body({ mass: 0.6, shape: new CANNON.Cylinder(0.1, 0.1, 0.43, 16) });
    carrier.position.set(0, top + 0.215, 0);
    carrier.linearDamping = 0.02;
    carrier.angularDamping = 0.05;
    sim.addBreakable(carrier, pieces, {
      material: 'glass', threshold: 1.55,
      profile: { radial: 0.6, falloff: 0.14, jitter: 0.22, spin: 10, bounce: 0.5, lift: 0.9 },
      onBreak: (s, point, normal, speed) => {
        const seed = Math.floor(s.time * 1e4);
        s.particles.add('glass', s.time, { origin: point, dir: normal, speed: 0.8 + speed * 0.5, count: 110, seed, spread: 0.85 });
        s.particles.add('glass', s.time, { origin: point, dir: normal, speed: 0.3 + speed * 0.2, count: 60, seed: seed + 1, spread: 1, scale: 0.6 });
      },
    });
    return { carrier };
  },

  /** The museum's own record of the event: dropped onto its plinth. */
  canonical(sim) {
    const c = sim.ctx.carrier;
    c.position.set(0.02, 1.0 + 0.215 + 0.9, 0.0);
    c.quaternion.setFromEuler(0.12, 0.3, 0.32);
    c.velocity.set(0, -0.4, 0);
  },

  visuals(sim, t) { if (edgeMat) crackFlash(edgeMat, sim, t, { color: '#e9fff6', peak: 1.6, decay: 22 }); },
};
