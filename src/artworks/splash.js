// 03 — THE SPLASH. A marble basin of still water and a bronze sphere.
// Fluid, organic, soft. The liquid is choreographed, not solved (see sim/splash.js).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { marble } from '../textures.js';
import { Splash, SURFACE_Y, BASIN_R } from '../sim/splash.js';
import { V, sphereBody } from './common.js';

const BALL_R = 0.048;

export default {
  id: 'splash',
  number: '003',
  title: 'The Splash',
  material: 'Water, Carrara marble, bronze',
  year: 2026,
  sound: 'liquid',
  personality: 'fluid · organic · soft · beautiful',
  text: 'Still water keeps no shape of its own. For a third of a second it builds a crown, then gives it back, drop by drop.',
  hint: 'Take the bronze sphere',
  holdFocus: V(0, 0.86, 0), // the surface of the water
  holding: 'Holding the sphere',
  cineRadius: 1.35,
  heroOffset: 0.085,
  testTarget: [0.04, 0, 0.02],
  canonicalDuration: 2.4,
  holdMinY: 0.06,
  splash: true,
  stage: { floor: 'slate', keyPos: V(-1.4, 3.6, 1.8), keyTarget: V(0, 0.8, 0), keyIntensity: 30, glowDir: V(0, 0.3, -1) },
  camera: { pos: V(1.05, 1.5, 1.6), target: V(0.14, 0.82, 0.1) },
  gallery: { x: -2.5, z: -19, dais: 1.9 },

  build(sim) {
    const tex = marble({ base: '#e6dfd2', vein: 'rgba(110,98,86,', seed: 13, size: 512 });
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.3 });
    const inner = new THREE.MeshStandardMaterial({ color: '#1e2a2a', roughness: 0.6 });
    // basin: a lathe in two materials (outer marble, dark inner bowl)
    const outer = [[0.0, 0.0], [0.16, 0.0], [0.13, 0.08], [0.09, 0.12], [0.085, 0.5], [0.2, 0.56], [0.5, 0.62], [0.58, 0.76], [0.58, 0.86], [0.5, 0.87]].map(([x, y]) => new THREE.Vector2(x, y));
    const outerMesh = new THREE.Mesh(new THREE.LatheGeometry(outer, 64), mat);
    const bowl = [[0.49, 0.865], [0.485, 0.7], [0.4, 0.6], [0.0, 0.585]].map(([x, y]) => new THREE.Vector2(x, y));
    const bowlMesh = new THREE.Mesh(new THREE.LatheGeometry(bowl, 64), inner);
    bowlMesh.material.side = THREE.DoubleSide;
    const basin = new THREE.Group();
    basin.add(outerMesh, bowlMesh);
    sim.addScenery(basin);
    // colliders: bowl floor + ring wall
    sim.addStatic(new CANNON.Box(new CANNON.Vec3(0.4, 0.02, 0.4)), V(0, 0.6, 0));
    const N = 20;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -a);
      sim.addStatic(new CANNON.Box(new CANNON.Vec3(0.05, 0.14, 0.09)), V(Math.cos(a) * 0.54, 0.74, Math.sin(a) * 0.54), q);
    }
    // the liquid
    const splash = new Splash(sim.scene);
    // side table for the sphere
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.7, 24), mat);
    table.position.set(0.66, 0.35, 0.4);
    sim.addScenery(table);
    sim.addStatic(new CANNON.Cylinder(0.11, 0.13, 0.7, 12), table.position);
    const bronze = new THREE.MeshPhysicalMaterial({ color: '#7a5532', metalness: 1, roughness: 0.3, clearcoat: 0.4 });
    const ball = sim.add(new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 48, 24), bronze), sphereBody(1.6, BALL_R, V(0.66, 0.7 + BALL_R, 0.4)), { kind: 'prop', material: 'bronze', grab: true });
    return { splash, ball };
  },

  canonical(sim) {
    const b = sim.ctx.ball.body;
    b.position.set(0.07, 1.42, 0.03);
    b.velocity.set(0, -0.3, 0);
  },

  preStep(sim) {
    const b = sim.ctx.ball.body;
    const r = Math.hypot(b.position.x, b.position.z);
    const inBasin = r < BASIN_R - 0.01;
    if (!inBasin) return;
    if (!sim.splashed && sim.mode === 'hold' && b.position.y - BALL_R * 0.3 < SURFACE_Y) { sim.requestLive = true; return; }
    if (!sim.splashed && sim.mode === 'live' && b.position.y - BALL_R * 0.3 < SURFACE_Y && b.velocity.y < -0.25) {
      sim.splashed = true;
      const s = Math.max(-b.velocity.y, 1.2);
      const p = sim.ctx.splash.trigger(sim.time, { x: b.position.x, z: b.position.z, s, seed: Math.floor(sim.time * 1e4) + 3 });
      sim.markImpact(new THREE.Vector3(b.position.x, SURFACE_Y, b.position.z));
      sim.emit({ type: 'break', material: 'liquid', v: s, pos: new THREE.Vector3(b.position.x, SURFACE_Y, b.position.z) });
      // every droplet that falls back is heard, at the moment it lands
      for (const d of sim.ctx.splash.landings()) {
        if (Math.random() > 0.45) continue;
        sim.recording?.event({ t: p.t0 + d.t, type: 'hit', material: 'liquid', v: Math.min(d.v, 1.2) * 0.6, pos: new THREE.Vector3(0, SURFACE_Y, 0) });
      }
    }
    if (b.position.y < SURFACE_Y) {
      // water: heavy drag and a little lift; the sphere sinks slowly
      b.velocity.scale(0.965, b.velocity);
      b.angularVelocity.scale(0.95, b.angularVelocity);
      b.force.y += b.mass * 9.82 * 0.35;
    }
  },

  visuals(sim, t) { sim.ctx.splash.update(t, performance.now() / 1000); },
  reset(sim) { sim.splashed = false; sim.ctx.splash.clear(); },
};
