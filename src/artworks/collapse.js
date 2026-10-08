// 05 — THE COLLAPSE. A small classical portico of stacked limestone and a heavy
// granite sphere. The point is the chain reaction: one stone moves another.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { limestone, granite as graniteTex } from '../textures.js';
import { V, boxBody, sphereBody, cylinderBody } from './common.js';

let lastDust = -1;

export default {
  id: 'collapse',
  number: '005',
  title: 'The Collapse',
  material: 'Limestone, granite',
  year: 2026,
  sound: 'stone',
  personality: 'heavy · slow · powerful · structural',
  text: 'Sixteen stones agreeing to stand. It takes only one disagreement — and then gravity finishes the argument at its own pace.',
  hint: 'Lift the granite sphere',
  holdFocus: V(0, 0.55, 0), // the standing stones
  holding: 'Holding the sphere',
  cineRadius: 2.6,
  heroOffset: 0.42,
  testTarget: [0.0, 0, 0.02],
  canonicalDuration: 4.2,
  holdMinY: 0.14,
  stage: { floor: 'slate', keyPos: V(-2.4, 4.4, 2.8), keyTarget: V(0, 0.5, 0), keyIntensity: 40, glowDir: V(0.2, 0.2, -1) },
  camera: { pos: V(1.9, 1.35, 2.5), target: V(0.1, 0.55, 0) },
  gallery: { x: 0, z: -32, dais: 2.8 },

  build(sim) {
    const stoneTex = limestone({ base: '#c4b79f', seed: 31 });
    const stone = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.86 });
    const stoneDark = new THREE.MeshStandardMaterial({ map: stoneTex, color: '#cfc3ad', roughness: 0.9 });
    // stylobate (static)
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.08, 0.5), stoneDark);
    base.position.set(0, 0.04, 0);
    sim.addScenery(base);
    sim.addStatic(new CANNON.Box(new CANNON.Vec3(0.675, 0.04, 0.25)), base.position);

    const blocks = [];
    const addBlock = (geo, body) => {
      const p = sim.add(new THREE.Mesh(geo, stone), body, { material: 'stone', self: true });
      // sixteen stones agreeing to stand: they settle quickly and go back to sleep,
      // so solver creep never accumulates into a collapse nobody caused
      body.linearDamping = 0.06;
      body.angularDamping = 0.22;
      body.allowSleep = true;
      body.sleepSpeedLimit = 0.08;
      body.sleepTimeLimit = 0.3;
      body.sleep();
      blocks.push(p);
      return p;
    };
    const drumH = 0.16, drumR = 0.065;
    const drumGeo = new THREE.CylinderGeometry(drumR, drumR * 1.03, drumH, 20);
    let y = 0.08;
    const xs = [-0.42, 0, 0.42];
    for (const x of xs) {
      let yy = y;
      for (let k = 0; k < 3; k++) {
        addBlock(drumGeo, cylinderBody(7, drumR, drumH, V(x, yy + drumH / 2, 0)));
        yy += drumH;
      }
      addBlock(new THREE.BoxGeometry(0.17, 0.05, 0.17), boxBody(3, V(0.085, 0.025, 0.085), V(x, yy + 0.025, 0)));
    }
    y += drumH * 3 + 0.05;
    const lintel = () => addBlock(new THREE.BoxGeometry(1.06, 0.1, 0.2), boxBody(18, V(0.53, 0.05, 0.1), V(0, y + 0.05, 0)));
    lintel();
    y += 0.1;
    addBlock(new THREE.BoxGeometry(1.12, 0.06, 0.24), boxBody(10, V(0.56, 0.03, 0.12), V(0, y + 0.03, 0)));
    y += 0.06;
    addBlock(new THREE.BoxGeometry(0.72, 0.09, 0.18), boxBody(8, V(0.36, 0.045, 0.09), V(0, y + 0.045, 0)));
    y += 0.09;
    addBlock(new THREE.BoxGeometry(0.34, 0.08, 0.14), boxBody(4, V(0.17, 0.04, 0.07), V(0, y + 0.04, 0)));

    // a low plinth for the sphere
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.32), stoneDark);
    plinth.position.set(1.05, 0.21, 0.15);
    sim.addScenery(plinth);
    sim.addStatic(new CANNON.Box(new CANNON.Vec3(0.16, 0.21, 0.16)), plinth.position);
    const granite = new THREE.MeshStandardMaterial({ map: graniteTex(), roughness: 0.38, metalness: 0.05 });
    const ball = sim.add(new THREE.Mesh(new THREE.SphereGeometry(0.115, 48, 24), granite), sphereBody(32, 0.115, V(1.05, 0.42 + 0.115, 0.15)), { kind: 'prop', material: 'stone', grab: true });
    ball.body.angularDamping = 0.3;
    return { blocks, ball };
  },

  canonical(sim) {
    const b = sim.ctx.ball.body;
    b.position.set(-0.28, 1.55, 0.06);
    b.velocity.set(0.9, -0.6, 0);
  },

  preStep(sim) {
    if (sim.impacted || sim.mode === 'compose') return;
    // first contact between the sphere and the structure starts the collapse
    const ball = sim.ctx.ball.body;
    for (const c of sim.world.contacts) {
      const other = c.bi === ball ? c.bj : c.bj === ball ? c.bi : null;
      if (other && sim.ctx.blocks.some((p) => p.body === other)) {
        if (sim.mode === 'hold') { sim.requestLive = true; break; }
        const at = new THREE.Vector3(ball.position.x, ball.position.y, ball.position.z);
        sim.markImpact(at);
        // the stone striking stone is the work: give it the full impact, not a tap
        sim.emit({ type: 'break', material: 'stone', v: Math.max(ball.velocity.length(), 1.6), pos: at });
        for (const p of sim.ctx.blocks) p.body.wakeUp();
        break;
      }
    }
  },

  onHit(sim, piece, v, pos) {
    if (piece.material !== 'stone' || v < 0.9 || sim.mode !== 'live') return;
    if (sim.time - lastDust < 0.04) return;
    lastDust = sim.time;
    const seed = Math.floor(sim.time * 1e4) + piece.index;
    sim.particles.add('dust', sim.time, { origin: pos, speed: v, count: Math.min(14, 4 + v * 3) | 0, seed, scale: Math.min(1.4, 0.5 + v * 0.25) });
    if (v > 1.6) sim.particles.add('grit', sim.time, { origin: pos, dir: new THREE.Vector3(0, 1, 0), speed: 0.4 + v * 0.35, count: Math.min(16, 3 + v * 3) | 0, seed: seed + 5, spread: 0.9 });
  },

  reset() { lastDust = -1; },
};
