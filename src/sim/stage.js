// The photographic "pocket" a moment lives in: a mottled old-master backdrop,
// a polished floor, a single warm key light. Shared by every moment.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { marble, slate } from '../textures.js';

export const GROUP = { STATIC: 1, PIECE: 2, PROP: 4, ACTIVE: 8, CARRIER: 16 };
export const ALL = 1 | 2 | 4 | 8 | 16;

const domeVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const domeFrag = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uGlowDir;
  uniform vec3 uDeep;
  uniform vec3 uMid;
  uniform vec3 uGlow;
  float hash(vec3 p) { p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
  void main() {
    vec3 d = normalize(vDir);
    float g = max(dot(d, normalize(uGlowDir)), 0.0);
    float n = fbm(d * 4.0 + 3.1);
    vec3 col = mix(uDeep, uMid, smoothstep(0.0, 0.9, g + (n - 0.5) * 0.35));
    col = mix(col, uGlow, pow(g, 6.0) * 0.55 * (0.7 + n * 0.6));
    col *= 0.85 + n * 0.3;
    col *= smoothstep(-0.35, 0.15, d.y) * 0.7 + 0.3;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function buildStage(scene, world, opts = {}) {
  const {
    floor = 'dark',
    glowDir = new THREE.Vector3(0, 0.25, -1),
    keyPos = new THREE.Vector3(-2.2, 4.2, 2.4),
    keyTarget = new THREE.Vector3(0, 0.6, 0),
    keyIntensity = 60,
    plinth = false,
    arena = 1.5, // the moment happens inside this radius; nothing leaves it
  } = opts;

  const deep = new THREE.Color('#0b0907');
  scene.background = deep;
  scene.fog = new THREE.Fog('#0f0c09', 5, 13);

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(30, 48, 24),
    new THREE.ShaderMaterial({
      vertexShader: domeVert,
      fragmentShader: domeFrag,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uGlowDir: { value: glowDir },
        uDeep: { value: new THREE.Color('#090705') },
        uMid: { value: new THREE.Color('#2a2117') },
        uGlow: { value: new THREE.Color('#6b5236') },
      },
    }),
  );
  dome.renderOrder = -1;
  scene.add(dome);

  const floorTex = floor === 'slate' ? slate()
    : floor === 'dark' ? marble({ base: '#14110e', vein: 'rgba(205,195,180,', seed: 77 })
    : marble({ base: '#b9b0a2', vein: 'rgba(70,62,54,', seed: 78 });
  floorTex.repeat.set(floor === 'slate' ? 3 : 4, floor === 'slate' ? 3 : 4);
  const floorMesh = new THREE.Mesh(
    new THREE.CircleGeometry(14, 64),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: floor === 'slate' ? 0.55 : floor === 'dark' ? 0.22 : 0.32, metalness: 0.0, envMapIntensity: 0.6 }),
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  scene.add(floorMesh);

  // the floor grips: without it a sphere rolls across a frictionless plane for ever
  const groundMat = new CANNON.Material('ground');
  const floorBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: groundMat, collisionFilterGroup: GROUP.STATIC, collisionFilterMask: ALL & ~GROUP.STATIC });
  floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floorBody);
  world.addContactMaterial(new CANNON.ContactMaterial(groundMat, world.defaultMaterial, { friction: 0.85, restitution: 0.12 }));

  // ---------- the edge of the moment
  // An invisible wall rings the stage so a ball or a hammer cannot wander out of
  // the light, and a hair-thin line on the floor tells the visitor it is there.
  if (arena) {
    const SEG = 24;
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const q = new CANNON.Quaternion();
      q.setFromEuler(0, -a + Math.PI / 2, 0);
      const wall = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3((Math.PI * arena) / SEG + 0.02, 1.4, 0.06)),
        material: groundMat,
        collisionFilterGroup: GROUP.STATIC,
        collisionFilterMask: ALL & ~GROUP.STATIC,
      });
      wall.position.set(Math.cos(a) * (arena + 0.06), 1.4, Math.sin(a) * (arena + 0.06));
      wall.quaternion.copy(q);
      world.addBody(wall);
    }
    const edge = new THREE.Mesh(
      new THREE.RingGeometry(arena - 0.012, arena, 128),
      new THREE.MeshBasicMaterial({ color: '#c7a46a', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.004;
    edge.renderOrder = 2;
    scene.add(edge);
  }

  scene.add(new THREE.HemisphereLight('#ffe9cc', '#1a120c', floor === 'dark' ? 0.35 : 0.18));

  const key = new THREE.SpotLight('#ffe2bc', keyIntensity, 0, 0.42, 0.75, 1.6);
  key.position.copy(keyPos);
  key.target.position.copy(keyTarget);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.02;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 14;
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight('#d8e0ff', 0.55);
  rim.position.set(2.5, 2.5, -3.5);
  scene.add(rim);
  const fill = new THREE.DirectionalLight('#ffcf9a', 0.25);
  fill.position.set(3, 1.2, 3);
  scene.add(fill);

  let plinthTop = 0;
  if (plinth) {
    const h = plinth.height ?? 1.0, w = plinth.width ?? 0.46;
    plinthTop = h;
    const tex = marble({ base: '#e4ddd0', vein: 'rgba(110,98,86,', seed: 90, size: 512 });
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.38 });
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h - 0.08, w), mat);
    body.position.y = (h - 0.08) / 2 + 0.04;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.06, w + 0.08), mat);
    base.position.y = 0.03;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.04, w + 0.06), mat);
    cap.position.y = h - 0.02;
    for (const m of [body, base, cap]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    g.position.set(plinth.x ?? 0, 0, plinth.z ?? 0);
    g.userData.scenery = plinth.display !== false;
    scene.add(g);
    const pb = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3((w + 0.06) / 2, h / 2, (w + 0.06) / 2)), collisionFilterGroup: GROUP.STATIC, collisionFilterMask: ALL & ~GROUP.STATIC });
    pb.position.set(plinth.x ?? 0, h / 2, plinth.z ?? 0);
    world.addBody(pb);
  }

  // pre-allocated so the light count never changes (no shader recompiles)
  const ceremony = new THREE.SpotLight('#ffe6c4', 0, 0, 0.32, 0.8, 1.5);
  ceremony.position.set(0.4, 5.5, 0.8);
  scene.add(ceremony, ceremony.target);

  return { key, rim, fill, ceremony, plinthTop, floorMesh, arena, groundMat, plinthGroup: plinth ? scene.children.find((c) => c.userData.scenery !== undefined) : null };
}
