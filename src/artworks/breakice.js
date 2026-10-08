// 04 — THE BREAK. A block of clear ice on a stone slab, a hammer beside it.
// Crystalline, sharp, fragile: the block is pre-fractured into Voronoi cells.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { voronoiBlock } from '../sim/voronoi.js';
import { limestone } from '../textures.js';
import { V, boxBody, crackFlash } from './common.js';

let frost;
const SIZE = V(0.36, 0.28, 0.3);

export default {
  id: 'break',
  number: '004',
  title: 'The Break',
  material: 'Clear ice, iron, ash wood',
  year: 2026,
  sound: 'ice',
  personality: 'crystalline · sharp · fragile',
  text: 'Water held still for a winter. The hammer is not the artwork, and neither is the ice. The instant between them is.',
  hint: 'Take up the hammer',
  holding: 'Holding the hammer',
  heroOffset: 0.05,
  testTarget: [-0.1, 0, 0.02],
  canonicalDuration: 2.4,
  holdMinY: 0.06,
  stage: { floor: 'slate', keyPos: V(-1.5, 3.4, 1.9), keyTarget: V(0, 0.55, 0), keyIntensity: 30, glowDir: V(0.2, 0.25, -1) },
  camera: { pos: V(1.05, 1.2, 1.5), target: V(0.02, 0.6, 0) },
  gallery: { x: 2.5, z: -25, dais: 1.9 },

  build(sim) {
    // the slab
    const slabH = 0.45;
    const stone = new THREE.MeshStandardMaterial({ map: limestone({ base: '#a99d88', seed: 7 }), roughness: 0.88 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, slabH, 0.55), stone);
    slab.position.set(0.1, slabH / 2, 0);
    sim.addScenery(slab);
    sim.addStatic(new CANNON.Box(new CANNON.Vec3(0.45, slabH / 2, 0.275)), slab.position);

    // the ice
    const center = V(-0.05, slabH + SIZE.y / 2 + 0.001, 0);
    const shards = voronoiBlock(SIZE, 26, { seed: 3, bias: V(0, SIZE.y * 0.4, 0), biasAmount: 0.55 });
    const ice = new THREE.MeshPhysicalMaterial({
      color: '#f2f9ff', roughness: 0.07, transmission: 1, thickness: 0.28, ior: 1.31, attenuationColor: new THREE.Color('#b9def7'),
      attenuationDistance: 1.4, specularIntensity: 1, clearcoat: 0.8, clearcoatRoughness: 0.04, envMapIntensity: 2.4,
      emissive: new THREE.Color('#2b4f6b'), emissiveIntensity: 0.35, // light held inside the ice
    });
    frost = ice.clone(); // same features as the polished skin → one shader
    Object.assign(frost, { roughness: 0.34, transmission: 0.82, thickness: 0.12, attenuationDistance: 0.4, envMapIntensity: 1.6, emissiveIntensity: 0 });
    frost.color.set('#f4fbff');
    const pieces = shards.map((s) => {
      const p = s.center.clone().add(center);
      return sim.add(new THREE.Mesh(s.geometry, [ice, frost]), boxBody(Math.max(0.05, s.volume * 900 * 8), s.half, p), { material: 'ice' });
    });
    const carrier = new CANNON.Body({ mass: 9, shape: new CANNON.Box(new CANNON.Vec3(SIZE.x / 2, SIZE.y / 2, SIZE.z / 2)) });
    carrier.position.copy(center);
    sim.addBreakable(carrier, pieces, {
      material: 'ice', threshold: 1.1, grab: false,
      profile: { radial: 0.32, falloff: 0.16, jitter: 0.12, spin: 5, bounce: 0.3 },
      onBreak: (s, point, normal, speed) => {
        const seed = Math.floor(s.time * 1e4) + 11;
        s.particles.add('crystal', s.time, { origin: point, dir: normal, speed: 0.8 + speed * 0.45, count: 150, seed, spread: 0.9 });
        s.particles.add('crystal', s.time, { origin: point, dir: new THREE.Vector3(0, 1, 0), speed: 0.4 + speed * 0.15, count: 60, seed: seed + 1, spread: 1, scale: 0.5 });
      },
    });
    // light caught inside the ice
    const glow = new THREE.PointLight('#cfeaff', 0.55, 1.3, 2);
    glow.position.copy(center).add(V(0.02, -0.02, 0.03));
    sim.scene.add(glow);

    // the hammer: iron head, ash handle
    const hammer = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.6 });
    const iron = new THREE.MeshStandardMaterial({ color: '#3d3a36', metalness: 0.85, roughness: 0.42 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.38, 14), wood);
    handle.rotation.z = Math.PI / 2;
    handle.position.x = 0.05;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.05), iron);
    head.position.x = -0.15;
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.012, 16), iron);
    face.position.set(-0.15, -0.058, 0);
    hammer.add(handle, head, face);
    hammer.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // a thin handle is a poor thing to aim a cursor at: an invisible sleeve is picked instead
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.13), new THREE.MeshBasicMaterial());
    grip.position.x = -0.02;
    grip.visible = false;
    grip.userData.outline = head; // but the head is what lights up
    hammer.add(grip);
    const hb = new CANNON.Body({ mass: 2.6 });
    hb.addShape(new CANNON.Box(new CANNON.Vec3(0.19, 0.016, 0.016)), new CANNON.Vec3(0.05, 0, 0));
    hb.addShape(new CANNON.Box(new CANNON.Vec3(0.036, 0.062, 0.036)), new CANNON.Vec3(-0.15, 0, 0));
    hb.position.set(0.37, slabH + 0.027, 0.14); // clear of the ice: a wider striking face must not rest against it
    hb.quaternion.setFromEuler(Math.PI / 2, 0, 0.4); // lying flat on the slab, angled toward the ice
    hb.angularDamping = 0.2;
    const hp = sim.add(hammer, hb, { kind: 'prop', material: 'iron', grab: true });
    return { carrier, hammer: hp };
  },

  holdLift: 0.5, // taken up head-down, the head must clear the ice it is to strike
  holdFocus: V(-0.05, 0.73, 0), // and comes to hand over the ice, so the cursor alone can aim it
  /** A hammer is taken up head-down, the way a hand would hold it. */
  holdPose() { return new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI * 0.46)); },

  canonical(sim) {
    const h = sim.ctx.hammer.body;
    h.position.set(-0.02, 1.08, 0.0);
    h.quaternion.setFromEuler(0, 0, 0.35);
    h.velocity.set(0.1, -2.6, 0);
    h.angularVelocity.set(0, 0, -2);
  },

  visuals(sim, t) { if (frost) crackFlash(frost, sim, t, { color: '#e6f5ff', peak: 1.4, decay: 16 }); },
};
