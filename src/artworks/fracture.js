// 02 — THE FRACTURE. An aged porcelain plate. Heavier than glass, slower to
// give: it cracks along radial lines, the pieces slide and rock, chips scatter.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { fractureShell } from '../sim/fracture.js';
import { plateGlaze } from '../textures.js';
import { V, boxBody, crackFlash } from './common.js';

let edge;
const R = 0.135;

export default {
  id: 'fracture',
  number: '002',
  title: 'The Fracture',
  material: 'Porcelain, gilt rim',
  year: 2026,
  sound: 'ceramic',
  personality: 'fragile · heavy · ceramic · angular',
  text: 'A dinner plate from a house that no longer exists. Ceramic does not shatter; it decides where to part, and then it is final.',
  hint: 'Take hold of the plate',
  holding: 'Holding the plate',
  heroOffset: 0.06,
  testTarget: [0.5, 0, 0.2],
  canonicalDuration: 2.6,
  holdMinY: 0.06,
  stage: { floor: 'slate', plinth: { height: 0.9, width: 0.4 }, keyPos: V(-1.8, 3.6, 2.2), keyTarget: V(0.2, 0.5, 0), keyIntensity: 30 },
  camera: { pos: V(1.2, 1.5, 1.75), target: V(0.22, 0.72, 0) },
  gallery: { x: 2.5, z: -13, dais: 1.9 },

  build(sim) {
    const top = 0.9;
    const thick = 0.0065;
    const lift = (r) => (r < 0.075 ? 0.004 : 0.004 + Math.pow((r - 0.075) / (R - 0.075), 1.6) * 0.016);
    const surface = (a, b, layer) => {
      const r = Math.max(b, 0.0001) * R;
      return V(Math.cos(a) * r, top + lift(r) + thick - layer * thick + 0.001, Math.sin(a) * r);
    };
    const shards = fractureShell({ surface, sectors: 8, bands: [0, 0.36, 0.7, 1], aJitter: 0.28, bJitter: 0.08, res: 8, seed: 21 });
    const glaze = new THREE.MeshPhysicalMaterial({ map: plateGlaze(), roughness: 0.26, clearcoat: 0.8, clearcoatRoughness: 0.12, side: THREE.DoubleSide });
    const under = new THREE.MeshStandardMaterial({ color: '#e6ddca', roughness: 0.5, side: THREE.DoubleSide });
    edge = new THREE.MeshStandardMaterial({ color: '#efe8da', roughness: 0.93, side: THREE.DoubleSide, emissive: '#000' });
    const pieces = shards.map((s) => {
      const half = s.half.clone();
      half.z = Math.max(half.z, 0.006);
      return sim.add(new THREE.Mesh(s.geometry, [glaze, under, edge]), boxBody(0.035, half, s.center, s.quaternion), { material: 'ceramic' });
    });
    const carrier = new CANNON.Body({ mass: 0.7, shape: new CANNON.Cylinder(R, R * 0.92, 0.022, 20) });
    carrier.position.set(0, top + 0.011, 0);
    sim.addBreakable(carrier, pieces, {
      material: 'ceramic', threshold: 2.3,
      profile: { radial: 0.24, falloff: 0.1, jitter: 0.08, spin: 4, bounce: 0.32, lift: 0.7 },
      onBreak: (s, point, normal, speed) => {
        const seed = Math.floor(s.time * 1e4) + 7;
        s.particles.add('chips', s.time, { origin: point, dir: normal, speed: 0.6 + speed * 0.35, count: 70, seed, spread: 0.9 });
        s.particles.add('dust', s.time, { origin: point, dir: normal, speed: 1, count: 10, seed: seed + 3, scale: 0.5 });
      },
    });
    return { carrier };
  },

  canonical(sim) {
    const c = sim.ctx.carrier;
    c.position.set(0.5, 1.75, 0.05);
    c.quaternion.setFromEuler(0.9, 0.2, 0.5);
    c.velocity.set(0, 0, 0);
  },

  visuals(sim, t) { if (edge) crackFlash(edge, sim, t, { color: '#fff3dc', peak: 0.9, decay: 14, hide: false }); },
};
