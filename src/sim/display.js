// The gallery installation of a moment: the actual 3D fragments, standing in the
// museum. Shares geometry with the simulation; swaps transmissive materials for
// cheap look-alikes so the museum never pays for a transmission pass.
import * as THREE from 'three';
import { Particles } from './particles.js';
import { Splash } from './splash.js';

const cache = new Map();
export function displayMaterial(m) {
  if (Array.isArray(m)) return m.map(displayMaterial);
  if (!m || !m.isMeshPhysicalMaterial || !(m.transmission > 0)) return m;
  if (cache.has(m)) return cache.get(m);
  const d = new THREE.MeshPhysicalMaterial({
    color: m.color.clone().lerp(new THREE.Color('#9fb8b2'), 0.25),
    roughness: Math.max(0.02, m.roughness * 0.5),
    metalness: 0,
    transparent: true,
    opacity: 0.4,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 2.6,
    side: m.side,
    depthWrite: false,
    emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0),
  });
  cache.set(m, d);
  return d;
}

function cloneVisual(obj) {
  // userData holds a back-reference to the physics piece; three would try to JSON-copy it
  const ud = obj.userData;
  obj.userData = {};
  const c = obj.clone(true);
  obj.userData = ud;
  c.traverse((o) => {
    if (o.isMesh) {
      o.material = displayMaterial(o.material);
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return c;
}

/**
 * @param sim       ImpactSimulation (source of geometry/materials)
 * @param opts      { scenery: bool }
 * @returns { group, clones, update(t, recording?), apply(state), load(extra) }
 */
export function createDisplay(sim, { scenery = true } = {}) {
  const group = new THREE.Group();
  const clones = sim.meshes.map((m) => {
    const c = cloneVisual(m);
    group.add(c);
    return c;
  });
  if (scenery) for (const s of sim.scenery) group.add(cloneVisual(s));
  const particles = new Particles(group);
  const splash = sim.def.splash ? new Splash(group, { display: true }) : null;
  return {
    group,
    clones,
    particles,
    splash,
    /** Animate from a recording (permanent works breathe around their instant). */
    update(t, recording) {
      if (recording) recording.sample(t, clones);
      particles.update(t);
      splash?.update(t, performance.now() / 1000);
    },
    apply(state) {
      for (let i = 0; i < clones.length; i++) {
        const k = i * 7;
        if (k + 6 >= state.length) break;
        clones[i].position.set(state[k], state[k + 1], state[k + 2]);
        clones[i].quaternion.set(state[k + 3], state[k + 4], state[k + 5], state[k + 6]).normalize();
      }
    },
    load(extra) {
      particles.load(extra?.bursts);
      splash?.load(extra?.splash);
    },
  };
}
