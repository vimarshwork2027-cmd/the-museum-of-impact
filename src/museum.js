// The gallery: a vaulted corridor in the manner of the Uffizi, at dusk.
// Coordinates: the hall runs along −z, x ∈ [−5, 5], floor at y = 0.
import * as THREE from 'three';
import * as T from './textures.js';

export const HALL = { x0: -5, x1: 5, zNear: 6, zFar: -50, wallH: 7.2, vaultR: 5 };
const LEN = HALL.zNear - HALL.zFar;
const ZMID = (HALL.zNear + HALL.zFar) / 2;
const BAYS = Array.from({ length: 9 }, (_, i) => 3 - i * 6); // pilaster lines
const WINDOWS = Array.from({ length: 8 }, (_, i) => -i * 6);
// New Acquisitions: the far wing, deliberately left with room to grow
export const ACQ_ZONE = { z0: -36.5, slots: [[-2.6, -40], [2.6, -40], [-2.6, -44.5], [2.6, -44.5], [-2.6, -48.6], [2.6, -48.6]] };
const SUN_DIR = new THREE.Vector3(1, -0.62, -0.22).normalize();

const printVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const printFrag = /* glsl */ `
  uniform sampler2D map;
  uniform float uReveal, uPrint, uHover, uHasMap;
  uniform vec3 uVoid;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec3 c = uHasMap > 0.5 ? texture2D(map, vUv).rgb : uVoid;
    if (uPrint > 0.5) c = c / (1.0 + c * 0.45) * 1.25;
    else c = pow(c, vec3(0.92)) * 1.35;
    float weave = (sin(vUv.x * 1400.0) * sin(vUv.y * 1050.0)) * 0.025 + (hash(floor(vUv * 600.0)) - 0.5) * 0.03;
    c *= 1.0 + weave;
    float v = smoothstep(0.95, 0.25, length((vUv - 0.5) * vec2(1.0, 1.2)));
    c *= mix(0.62, 1.0, v);
    c *= vec3(1.02, 0.99, 0.93);
    c *= uReveal * (1.0 + uHover * 0.18);
    gl_FragColor = vec4(c, 1.0);
  }
`;

export function printMaterial(map = null, { print = 1 } = {}) {
  return new THREE.ShaderMaterial({
    vertexShader: printVert,
    fragmentShader: printFrag,
    uniforms: {
      map: { value: map },
      uHasMap: { value: map ? 1 : 0 },
      uReveal: { value: 1 },
      uPrint: { value: print },
      uHover: { value: 0 },
      uVoid: { value: new THREE.Color('#0d0a07') },
    },
  });
}

/** Rectangular ring extruded with a bevel — one step of a frame profile. */
function ring(ow, oh, iw, ih, depth, bevel, mat) {
  const s = new THREE.Shape();
  s.moveTo(-ow / 2, -oh / 2); s.lineTo(ow / 2, -oh / 2); s.lineTo(ow / 2, oh / 2); s.lineTo(-ow / 2, oh / 2); s.closePath();
  const h = new THREE.Path();
  h.moveTo(-iw / 2, -ih / 2); h.lineTo(-iw / 2, ih / 2); h.lineTo(iw / 2, ih / 2); h.lineTo(iw / 2, -ih / 2); h.closePath();
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 1 });
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

let _gold, _goldDark, _slip;
function frameMaterials() {
  if (_gold) return { gold: _gold, goldDark: _goldDark, slip: _slip };
  const gilt = T.gilt(); gilt.repeat.set(3, 3);
  const orn = T.ornament(); orn.repeat.set(6, 6);
  _gold = new THREE.MeshStandardMaterial({ color: '#d2a95e', map: gilt, metalness: 1, roughness: 0.4, bumpMap: orn, bumpScale: 0.7, envMapIntensity: 0.9 });
  _goldDark = new THREE.MeshStandardMaterial({ color: '#8a6a38', map: gilt, metalness: 1, roughness: 0.48, bumpMap: orn, bumpScale: 1.2, envMapIntensity: 0.8 });
  _slip = new THREE.MeshStandardMaterial({ color: '#1c1610', roughness: 0.8 });
  return { gold: _gold, goldDark: _goldDark, slip: _slip };
}

/** Ornate gilt frame around a w×h canvas, facing +z, canvas centred at origin. */
export function makeFrame(w, h, { band = 0.2, dark = false } = {}) {
  const { gold, goldDark, slip } = frameMaterials();
  const g = new THREE.Group();
  const outer = ring(w + band * 2, h + band * 2, w + band * 0.7, h + band * 0.7, 0.05, 0.035, dark ? goldDark : gold);
  outer.position.z = -0.02;
  const orn = ring(w + band * 1.45, h + band * 1.45, w + band * 0.95, h + band * 0.95, 0.04, 0.02, goldDark);
  orn.position.z = 0.04;
  const lip = ring(w + band * 0.7, h + band * 0.7, w + 0.01, h + 0.01, 0.03, 0.012, dark ? goldDark : gold);
  lip.position.z = 0.0;
  const liner = ring(w + 0.06, h + 0.06, w - 0.005, h - 0.005, 0.01, 0.004, slip);
  liner.position.z = 0.0;
  g.add(outer, orn, lip, liner);
  return g;
}

function addBox(parent, w, h, d, x, y, z, mat, { shadow = true } = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function archShape(w, rectH, cx = 0, y0 = 0) {
  const s = new THREE.Shape();
  s.moveTo(cx - w / 2, y0);
  s.lineTo(cx + w / 2, y0);
  s.lineTo(cx + w / 2, y0 + rectH);
  s.absarc(cx, y0 + rectH, w / 2, 0, Math.PI, false);
  s.lineTo(cx - w / 2, y0);
  return s;
}

function normaliseUVs(geo) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  }
  uv.needsUpdate = true;
}

export function buildMuseum(fonts) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#120d09');
  scene.fog = new THREE.FogExp2('#2a1f16', 0.012);

  const walkable = [];
  const colliders = []; // {x, z, r}
  const artworks = [];
  const plaster = T.plaster();
  const plasterMat = new THREE.MeshStandardMaterial({ map: plaster, color: '#d8c6a6', roughness: 0.92 });
  const stoneMat = new THREE.MeshStandardMaterial({ map: plaster, color: '#e2d3b8', roughness: 0.85 });
  const darkWood = new THREE.MeshStandardMaterial({ color: '#2a1b10', roughness: 0.6 });

  // ---------- floor & runner
  const parq = T.parquet();
  parq.repeat.set(4, 17 * LEN / 42);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, LEN), new THREE.MeshStandardMaterial({ map: parq, roughness: 0.42, envMapIntensity: 0.5 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, ZMID);
  floor.receiveShadow = true;
  floor.userData.floor = true;
  scene.add(floor);
  walkable.push(floor);

  const runTex = T.runner();
  runTex.repeat.set(1, 30 * LEN / 42);
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(2.6, LEN - 2.5), new THREE.MeshStandardMaterial({ map: runTex, roughness: 0.95 }));
  runner.rotation.x = -Math.PI / 2;
  runner.position.set(0, 0.006, ZMID - 0.6);
  runner.receiveShadow = true;
  runner.userData.floor = true;
  scene.add(runner);
  walkable.push(runner);

  // ---------- long walls
  const wainTex = T.wainscot();
  wainTex.repeat.set(LEN / 2.4, 1);
  const wainMat = new THREE.MeshStandardMaterial({ map: wainTex, roughness: 0.75 });
  for (const side of [-1, 1]) {
    const x = side * 5;
    const upper = new THREE.Mesh(new THREE.PlaneGeometry(LEN, HALL.wallH - 1.1), plasterMat);
    upper.position.set(x, 1.1 + (HALL.wallH - 1.1) / 2, ZMID);
    upper.rotation.y = -side * Math.PI / 2;
    upper.receiveShadow = true;
    scene.add(upper);
    const low = new THREE.Mesh(new THREE.PlaneGeometry(LEN, 1.1), wainMat);
    low.position.set(x - side * 0.005, 0.55, ZMID);
    low.rotation.y = -side * Math.PI / 2;
    low.receiveShadow = true;
    scene.add(low);
    // chair rail, cornice (two steps)
    addBox(scene, 0.06, 0.07, LEN, x - side * 0.03, 1.12, ZMID, stoneMat, { shadow: false });
    addBox(scene, 0.32, 0.28, LEN, x - side * 0.16, HALL.wallH - 0.14, ZMID, stoneMat, { shadow: false });
    addBox(scene, 0.5, 0.12, LEN, x - side * 0.25, HALL.wallH + 0.06, ZMID, stoneMat, { shadow: false });
    // pilasters
    for (const z of BAYS) {
      addBox(scene, 0.26, HALL.wallH - 0.3, 0.72, x - side * 0.13, (HALL.wallH - 0.3) / 2 + 0.02, z, stoneMat);
      addBox(scene, 0.34, 0.22, 0.86, x - side * 0.17, HALL.wallH - 0.38, z, stoneMat, { shadow: false });
      addBox(scene, 0.32, 0.3, 0.84, x - side * 0.16, 0.15, z, stoneMat);
    }
  }

  // ---------- vault, ribs, coffers
  const cof = T.coffer();
  cof.map.repeat.set(13, Math.round(34 * LEN / 42));
  cof.bump.repeat.set(13, Math.round(34 * LEN / 42));
  const vault = new THREE.Mesh(
    new THREE.CylinderGeometry(HALL.vaultR, HALL.vaultR, LEN, 64, 1, true, Math.PI / 2, Math.PI),
    new THREE.MeshStandardMaterial({ map: cof.map, bumpMap: cof.bump, bumpScale: 3, roughness: 0.85, side: THREE.BackSide }),
  );
  vault.rotation.x = Math.PI / 2;
  vault.position.set(0, HALL.wallH + 0.12, ZMID);
  scene.add(vault);
  for (const z of BAYS) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(HALL.vaultR - 0.08, 0.16, 8, 48, Math.PI), stoneMat);
    rib.position.set(0, HALL.wallH + 0.12, z);
    scene.add(rib);
  }

  // ---------- end walls
  const endShape = () => {
    const s = new THREE.Shape();
    s.moveTo(-5, 0); s.lineTo(5, 0); s.lineTo(5, HALL.wallH + 0.12);
    s.absarc(0, HALL.wallH + 0.12, 5, 0, Math.PI, false);
    s.lineTo(-5, 0);
    return s;
  };
  const farWall = new THREE.Mesh(new THREE.ShapeGeometry(endShape(), 32), new THREE.MeshStandardMaterial({ color: '#3b2a1e', roughness: 0.9, map: plaster }));
  farWall.position.z = HALL.zFar;
  farWall.receiveShadow = true;
  scene.add(farWall);
  const nearShape = endShape();
  nearShape.holes.push(archShape(2.6, 3.2, 0, 0));
  const nearWall = new THREE.Mesh(new THREE.ShapeGeometry(nearShape, 32), plasterMat);
  nearWall.position.z = HALL.zNear;
  nearWall.rotation.y = Math.PI;
  scene.add(nearWall);
  const doorVoid = new THREE.Mesh(new THREE.ShapeGeometry(archShape(2.6, 3.2), 16), new THREE.MeshBasicMaterial({ color: '#050302' }));
  doorVoid.position.set(0, 0, HALL.zNear + 0.3);
  doorVoid.rotation.y = Math.PI;
  scene.add(doorVoid);

  // ---------- windows (left wall) + light shafts
  const glassTex = T.windowGlass();
  const glassMat = new THREE.MeshBasicMaterial({ map: glassTex, color: new THREE.Color(2.6, 2.3, 2.0), fog: false });
  const winShape = archShape(2.0, 3.6, 0, 1.6);
  const outerWin = archShape(2.5, 3.6, 0, 1.4);
  outerWin.holes.push(archShape(2.0, 3.6, 0, 1.6));
  const winFrameGeo = new THREE.ExtrudeGeometry(outerWin, { depth: 0.3, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2, curveSegments: 24 });
  const glassGeo = new THREE.ShapeGeometry(winShape, 24);
  normaliseUVs(glassGeo);
  const shaftMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uStrength: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float along; attribute float across;
      varying float vAlong; varying float vAcross; varying vec3 vWorld;
      void main() { vAlong = along; vAcross = across; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uStrength; varying float vAlong; varying float vAcross; varying vec3 vWorld;
      void main() {
        float edge = smoothstep(0.0, 0.35, vAcross) * smoothstep(1.0, 0.65, vAcross);
        float fall = pow(1.0 - vAlong, 1.4) * smoothstep(0.0, 0.08, vAlong);
        float drift = 0.85 + 0.15 * sin(vWorld.z * 1.7 + vWorld.y * 2.3 + uTime * 0.25);
        gl_FragColor = vec4(vec3(1.0, 0.78, 0.52) * 0.075 * edge * fall * drift * uStrength, 1.0);
      }
    `,
  });
  const patchTex = T.softDot();
  const patchMat = new THREE.MeshBasicMaterial({ map: patchTex, color: new THREE.Color(0.55, 0.38, 0.22), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

  for (const z of WINDOWS) {
    const frame = new THREE.Mesh(winFrameGeo, stoneMat);
    frame.rotation.y = Math.PI / 2;
    frame.position.set(-5.02, 0, z);
    scene.add(frame);
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.rotation.y = Math.PI / 2;
    glass.position.set(-4.99, 0, z);
    scene.add(glass);
    // sill
    addBox(scene, 0.45, 0.08, 2.4, -4.8, 1.38, z, stoneMat);
    // shaft: a soft prism from the glazing toward the floor
    const shaft = makeShaft(z);
    shaft.material = shaftMat;
    scene.add(shaft);
    // pool of light on the parquet
    const corners = [[1.7, z - 0.9], [5.2, z - 0.9], [5.2, z + 0.9], [1.7, z + 0.9]].map(([y, zz]) => {
      const t = y / -SUN_DIR.y;
      return new THREE.Vector3(-4.95 + SUN_DIR.x * t, 0.012, zz + SUN_DIR.z * t);
    });
    const pg = new THREE.BufferGeometry().setFromPoints(corners);
    pg.setIndex([0, 1, 2, 0, 2, 3]);
    pg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    const pool = new THREE.Mesh(pg, patchMat);
    pool.renderOrder = 2;
    scene.add(pool);
  }

  function makeShaft(z) {
    const L = 11.5;
    const pts = [], along = [], across = [];
    const ys = [1.7, 5.4], zs = [z - 0.85, z + 0.85];
    // 4 long faces of the prism, each as its own quad strip so "across" fades edges
    const corner = (y, zz, t) => new THREE.Vector3(-4.95, y, zz).addScaledVector(SUN_DIR, t * L);
    const faces = [
      [[ys[0], zs[0]], [ys[0], zs[1]]],
      [[ys[1], zs[0]], [ys[1], zs[1]]],
      [[ys[0], zs[0]], [ys[1], zs[0]]],
      [[ys[0], zs[1]], [ys[1], zs[1]]],
      [[ys[0], (zs[0] + zs[1]) / 2], [ys[1], (zs[0] + zs[1]) / 2]],
    ];
    const idx = [];
    for (const [[ya, za], [yb, zb]] of faces) {
      const base = pts.length;
      for (const t of [0, 1]) {
        pts.push(corner(ya, za, t), corner(yb, zb, t));
        along.push(t, t);
        across.push(0, 1);
      }
      idx.push(base, base + 1, base + 3, base, base + 3, base + 2);
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    g.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
    g.setAttribute('across', new THREE.Float32BufferAttribute(across, 1));
    g.setIndex(idx);
    const m = new THREE.Mesh(g);
    m.renderOrder = 3;
    m.frustumCulled = false;
    return m;
  }

  // ---------- lighting
  scene.add(new THREE.HemisphereLight('#ffe2c0', '#2a1a10', 0.55));
  const sun = new THREE.DirectionalLight('#ffb478', 2.4);
  sun.position.set(-4.5, 6.2, -22).addScaledVector(SUN_DIR, -12);
  sun.target.position.set(1, 0, -23);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -32; sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const bounce = new THREE.DirectionalLight('#ffd6a8', 0.35);
  bounce.position.set(4, 3, -10);
  scene.add(bounce);

  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.4, 2.6) });
  const lampGeo = new THREE.SphereGeometry(0.05, 12, 8);
  function spot(pos, target, { intensity = 60, angle = 0.36, penumbra = 0.75, color = '#ffe0b5' } = {}) {
    const s = new THREE.SpotLight(color, intensity, 0, angle, penumbra, 1.7);
    s.position.copy(pos);
    s.target.position.copy(target);
    scene.add(s, s.target);
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.copy(pos);
    scene.add(lamp);
    return s;
  }

  // ---------- labels
  const SERIF = `"Instrument Serif", "Cormorant Garamond", Georgia, serif`;
  const SANS = `Matter, "Inter", "Helvetica Neue", Arial, sans-serif`;
  const brass = new THREE.MeshStandardMaterial({ color: '#8c6a3a', metalness: 1, roughness: 0.35 });
  const daisMat = new THREE.MeshStandardMaterial({ map: T.marble({ base: '#1f1c19', vein: 'rgba(170,160,145,', seed: 61, size: 512 }), roughness: 0.55, envMapIntensity: 0.4 });

  /** A small museum plaque on a slanted brass lectern. */
  function plaque(lines, { w = 0.3, h = 0.2 } = {}) {
    const g = new THREE.Group();
    const tex = T.textTexture(600, 400, lines, { bg: '#ebe2cf' });
    const card = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
    const backing = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, h + 0.02, 0.012), brass);
    backing.position.z = -0.008;
    const head = new THREE.Group();
    head.add(card, backing);
    head.rotation.x = -0.75;
    head.position.y = 0.92;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.9, 10), brass);
    post.position.y = 0.45;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.02, 24), brass);
    foot.position.y = 0.01;
    g.add(head, post, foot);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }
  const plaqueLines = (def) => [
    { text: def.title.toUpperCase(), font: `400 66px ${SERIF}`, color: '#1b150f', x: 40, y: 120, spacing: '3px' },
    { text: `IMPACT No. ${def.number}`, font: `500 22px ${SANS}`, color: '#6c5a42', x: 40, y: 200, spacing: '5px' },
    { text: def.material.toUpperCase(), font: `500 22px ${SANS}`, color: '#6c5a42', x: 40, y: 245, spacing: '5px' },
    { text: String(def.year), font: `italic 34px ${SERIF}`, color: '#5a4a38', x: 40, y: 330 },
  ];

  // ---------- the vitrine (The Shatter keeps its glass case)
  const marbleTex = T.marble({ base: '#e8e1d4', vein: 'rgba(110,98,86,', seed: 3, size: 512 });
  const plinthMat = new THREE.MeshStandardMaterial({ map: marbleTex, roughness: 0.35 });
  function vitrine(x, z) {
    const vit = new THREE.Group();
    vit.position.set(x, 0, z);
    addBox(vit, 0.9, 0.08, 0.9, 0, 0.04, 0, plinthMat);
    addBox(vit, 0.78, 0.86, 0.78, 0, 0.51, 0, plinthMat);
    addBox(vit, 0.92, 0.06, 0.92, 0, 0.97, 0, plinthMat);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(0.86, 1.05, 0.86),
      new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.07, roughness: 0.04, metalness: 0, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide }),
    );
    glass.position.y = 1.525;
    glass.renderOrder = 5;
    vit.add(glass);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) addBox(vit, 0.018, 1.05, 0.018, a * 0.43, 1.525, b * 0.43, brass);
    addBox(vit, 0.88, 0.018, 0.88, 0, 2.05, 0, brass);
    scene.add(vit);
    return vit;
  }

  // ---------- installations of the permanent collection
  const installations = {};
  const DAIS_H = 0.12;
  function addInstallation(def, display) {
    const g = def.gallery;
    const root = new THREE.Group();
    root.position.set(g.x, 0, g.z);
    scene.add(root);
    let lift = 0, radius;
    if (g.vitrine) {
      vitrine(g.x, g.z);
      radius = 0.95;
    } else {
      const d = g.dais;
      const base = new THREE.Mesh(new THREE.BoxGeometry(d, DAIS_H, d), daisMat);
      base.position.y = DAIS_H / 2;
      base.receiveShadow = true;
      base.castShadow = true;
      const lip = new THREE.Mesh(new THREE.BoxGeometry(d + 0.04, 0.012, d + 0.04), brass);
      lip.position.y = DAIS_H;
      root.add(base, lip);
      lift = DAIS_H + 0.006;
      radius = d * 0.72;
    }
    display.group.position.y = lift;
    root.add(display.group);
    // approach from the corridor: face the runner and the entrance
    const normal = new THREE.Vector3(-Math.sign(g.x) * 0.55, 0, 1).normalize();
    if (g.x === 0) normal.set(0, 0, 1);
    const pl = plaque(plaqueLines(def));
    const side = new THREE.Vector3(-normal.z, 0, normal.x);
    const pp = normal.clone().multiplyScalar(radius + 0.35).addScaledVector(side, g.x === 0 ? 0.55 : 0.45 * -Math.sign(g.x));
    pl.position.set(g.x + pp.x, 0, g.z + pp.z);
    pl.rotation.y = Math.atan2(normal.x, normal.z);
    scene.add(pl);
    const proxy = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.6, 2.1, radius * 1.6), new THREE.MeshBasicMaterial());
    proxy.visible = false;
    proxy.position.set(g.x, 1.05, g.z);
    scene.add(proxy);
    colliders.push({ x: g.x, z: g.z, r: radius + 0.15 }, { x: pl.position.x, z: pl.position.z, r: 0.25 });
    spot(new THREE.Vector3(g.x + normal.x * 1.6 + 0.4, 6.9, g.z + normal.z * 1.6), new THREE.Vector3(g.x, 0.9, g.z), { intensity: g.vitrine ? 30 : 70, angle: g.vitrine ? 0.2 : 0.26, penumbra: 0.8 });
    const a = register({
      kind: 'moment', id: def.id, def, center: new THREE.Vector3(g.x, 1.0, g.z), normal, viewDist: g.vitrine ? 3.3 : 3.1, hit: [proxy], // the case is 0.86 across and 2 m tall: stand off it
      hotspot: new THREE.Vector3(g.x, g.vitrine ? 2.2 : 1.6, g.z), display,
    });
    proxy.userData.artwork = a;
    installations[def.id] = { root, display, artwork: a };
    return a;
  }

  // ---------- the hung collection: the museum's older pictures, each with its card
  const weave = T.canvasWeave();
  weave.repeat.set(7, 9);
  // Hung in the middle of a bay, never on a pilaster line (see BAYS), and in the
  // order they happened: the corridor is walked forward through two thousand years.
  const PICTURES = [
    { z: -12, subject: 'caesar', seed: 44, title: 'The Death of Caesar', artist: 'After Vincenzo Camuccini', date: '1806', note: 'Oil on linen', when: '15 March 44 BC' },
    { z: -18, subject: 'constantinople', seed: 1453, title: 'The Fall of Constantinople', artist: 'After a Venetian hand', date: '1499', note: 'Oil on panel', when: '29 May 1453' },
    { z: -24, subject: 'bastille', seed: 1789, title: 'The Storming of the Bastille', artist: 'After Jean-Pierre Houël', date: '1789', note: 'Oil on linen', when: '14 July 1789' },
    { z: -30, subject: 'berlin', seed: 1989, title: 'The Fall of the Berlin Wall', artist: 'After the photographs of November 1989', date: '1990', note: 'Oil on linen', when: '9 November 1989' },
  ];
  for (const pic of PICTURES) {
    const clash = BAYS.find((b) => Math.abs(b - pic.z) < 1.1);
    if (clash !== undefined) console.warn(`picture at z=${pic.z} would hang on the pilaster at ${clash}`);
  }
  for (const pic of PICTURES) {
    const w = 1.5, h = 1.02;
    const g = new THREE.Group();
    g.position.set(4.96, 2.86, pic.z);
    g.rotation.y = -Math.PI / 2;
    g.add(makeFrame(w, h, { band: 0.16 }));
    const paint = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
      map: T.painting({ subject: pic.subject, seed: pic.seed, ratio: h / w, size: 1024 }),
      bumpMap: weave,
      bumpScale: 0.25,
      roughness: 0.56,
      metalness: 0,
      envMapIntensity: 0.35,
    }));
    paint.position.z = 0.012;
    paint.receiveShadow = true;
    g.add(paint);
    // its card, at reading height below the frame
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.2), new THREE.MeshStandardMaterial({
      map: T.textTexture(780, 300, [
        { text: pic.when.toUpperCase(), font: `500 25px ${SANS}`, color: '#b08c4e', x: 20, y: 42, spacing: '5px' },
        { text: pic.title, font: `italic 54px ${SERIF}`, color: '#e8dcc2', x: 20, y: 118, wrap: 740, lh: 52 },
        { text: pic.artist, font: `400 23px ${SANS}`, color: '#9b8866', x: 20, y: 226 },
        { text: `${pic.note} · ${pic.date}`, font: `400 23px ${SANS}`, color: '#7d6746', x: 20, y: 262 },
      ]),
      transparent: true,
      roughness: 0.9,
    }));
    card.position.set(0, -h / 2 - 0.3, 0.014);
    g.add(card);
    scene.add(g);
    // each picture gets its own small wash of light, as a gallery would give it
    spot(new THREE.Vector3(3.5, 6.4, pic.z), new THREE.Vector3(4.95, 2.9, pic.z), { intensity: 26, angle: 0.22, penumbra: 0.85 });
  }

  // ---------- benches
  const leather = new THREE.MeshStandardMaterial({ color: '#4a1a14', roughness: 0.55 });
  for (const [x, z] of [[0, -16], [-2.8, -28.5]]) {
    const b = new THREE.Group();
    b.position.set(x, 0, z);
    addBox(b, 0.62, 0.1, 1.9, 0, 0.44, 0, leather);
    addBox(b, 0.66, 0.06, 1.94, 0, 0.37, 0, darkWood);
    for (const [bx, bz] of [[-0.26, -0.85], [0.26, -0.85], [0.26, 0.85], [-0.26, 0.85]]) addBox(b, 0.06, 0.36, 0.06, bx, 0.18, bz, darkWood);
    scene.add(b);
    colliders.push({ x, z: z - 0.6, r: 0.55 }, { x, z: z + 0.6, r: 0.55 });
  }

  // ---------- New Acquisitions: an inscription, a threshold, and room
  const acqTitle = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 1.1),
    new THREE.MeshStandardMaterial({
      map: T.textTexture(2048, 352, [
        { text: 'NEW ACQUISITIONS', font: `500 34px ${SANS}`, color: '#c9a76a', x: 1024, y: 70, align: 'center', spacing: '18px' },
        { text: 'Moments preserved by our visitors', font: `150px ${SERIF}`, color: '#e9dcc4', x: 1024, y: 240, align: 'center' },
        { text: 'Each was made inside this museum, by someone who walked in as an observer.', font: `italic 40px ${SERIF}`, color: '#a8957a', x: 1024, y: 320, align: 'center' },
      ]),
      transparent: true,
      roughness: 0.9,
    }),
  );
  acqTitle.position.set(0, 5.4, HALL.zFar + 0.03);
  scene.add(acqTitle);
  const threshold = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 0.22), new THREE.MeshStandardMaterial({ color: '#8c6a3a', metalness: 1, roughness: 0.4 }));
  threshold.rotation.x = -Math.PI / 2;
  threshold.position.set(0, 0.009, ACQ_ZONE.z0);
  scene.add(threshold);
  spot(new THREE.Vector3(0, 6.9, -41), new THREE.Vector3(0, 0.6, -44.5), { intensity: 60, angle: 0.62, penumbra: 0.9 });
  // one light kept in reserve for the newest work (count never changes → no recompiles)
  const newLight = spot(new THREE.Vector3(0, 6.9, -44), new THREE.Vector3(0, 0, -44), { intensity: 0, angle: 0.24, penumbra: 0.75 });

  // ---------- dust in the air
  const dustCount = 1600;
  const dp = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dp[i * 3] = (Math.random() - 0.5) * 9.4;
    dp[i * 3 + 1] = Math.random() * 7;
    dp[i * 3 + 2] = HALL.zFar + Math.random() * LEN;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ map: T.softDot(), color: '#ffd9a8', size: 0.028, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  scene.add(dust);

  // ---------- artwork registry
  function register(a) {
    const n = a.normal.clone().normalize();
    const dist = a.viewDist ?? 3.4;
    const viewPos = a.center.clone().addScaledVector(n, dist);
    viewPos.y = 1.65;
    a.viewPos = viewPos;
    a.viewYaw = Math.atan2(n.x, n.z);
    a.viewPitch = -Math.atan2(a.center.y - 1.65, dist) * (a.pitchK ?? 0.8) + 0.12;
    artworks.push(a);
    return a;
  }

  // ---------- visitor works: real 3D installations, newest nearest the threshold
  const acq = [];
  function setAcquisitions(works, makeDisplay) {
    for (const x of acq) { scene.remove(x.root); scene.remove(x.plaque); scene.remove(x.proxy); }
    acq.length = 0;
    for (let i = artworks.length - 1; i >= 0; i--) if (artworks[i].kind === 'acquisition') artworks.splice(i, 1);
    for (let i = colliders.length - 1; i >= 0; i--) if (colliders[i].acq) colliders.splice(i, 1);
    const recent = works.slice(-ACQ_ZONE.slots.length).reverse();
    recent.forEach((work, i) => {
      const display = makeDisplay(work);
      if (!display) return;
      const [x, z] = ACQ_ZONE.slots[i];
      const root = new THREE.Group();
      root.position.set(x, 0, z);
      // fit the composition onto its dais
      const box = new THREE.Box3();
      for (const c of display.clones) box.expandByPoint(c.position);
      const ctr = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const span = Math.max(Math.hypot(size.x, size.z) / 2, 0.2);
      const s = Math.min(1, 1.1 / span);
      display.group.scale.setScalar(s);
      display.group.position.set(-ctr.x * s, DAIS_H + 0.006, -ctr.z * s);
      const d = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.38, DAIS_H, 64), daisMat);
      d.position.y = DAIS_H / 2;
      d.receiveShadow = true;
      const lip = new THREE.Mesh(new THREE.TorusGeometry(1.365, 0.008, 6, 96), brass);
      lip.rotation.x = Math.PI / 2;
      lip.position.y = DAIS_H;
      root.add(d, lip, display.group);
      scene.add(root);
      const normal = new THREE.Vector3(-Math.sign(x) * 0.6, 0, 1).normalize();
      const pl = plaque([
        { text: 'NEW ACQUISITION', font: `500 20px ${SANS}`, color: '#7b6648', x: 40, y: 70, spacing: '5px' },
        { text: work.title, font: `56px ${SERIF}`, color: '#1b150f', x: 40, y: 150, wrap: 520, lh: 56 },
        { text: `IMPACT No. ${work.number}`, font: `500 20px ${SANS}`, color: '#6c5a42', x: 40, y: 290, spacing: '5px' },
        { text: `${work.creator ? 'Created by ' + work.creator : 'Created by a visitor'} · ${new Date(work.date).getFullYear()}`, font: `italic 30px ${SERIF}`, color: '#5a4a38', x: 40, y: 345 },
      ]);
      const side = new THREE.Vector3(-normal.z, 0, normal.x);
      const pp = normal.clone().multiplyScalar(1.65).addScaledVector(side, 0.5 * -Math.sign(x));
      pl.position.set(x + pp.x, 0, z + pp.z);
      pl.rotation.y = Math.atan2(normal.x, normal.z);
      scene.add(pl);
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2, 2.6), new THREE.MeshBasicMaterial());
      proxy.visible = false;
      proxy.position.set(x, 1, z);
      scene.add(proxy);
      colliders.push({ x, z, r: 1.5, acq: true }, { x: pl.position.x, z: pl.position.z, r: 0.25, acq: true });
      const a = register({ kind: 'acquisition', id: work.id, work, center: new THREE.Vector3(x, 0.9, z), normal, viewDist: 3.4, pitchK: 0.6, hit: [proxy], hotspot: new THREE.Vector3(x, 1.5, z), display });
      proxy.userData.artwork = a;
      acq.push({ root, plaque: pl, proxy, work, artwork: a });
    });
  }

  /** Give the newest work its own light, slowly. */
  function spotlightWork(workId) {
    const x = acq.find((q) => q.work.id === workId);
    if (!x) return null;
    newLight.position.set(x.root.position.x + 0.5, 6.9, x.root.position.z + 1.2);
    newLight.target.position.set(x.root.position.x, 0.6, x.root.position.z);
    newLight.intensity = 0;
    return newLight;
  }

  const shaftU = shaftMat.uniforms;
  function update(dt, t) {
    shaftU.uTime.value = t;
    const p = dust.geometry.attributes.position;
    for (let i = 0; i < dustCount; i++) {
      let y = p.getY(i) + dt * (0.02 + (i % 7) * 0.004);
      if (y > 7) y = 0;
      p.setY(i, y);
      p.setX(i, p.getX(i) + Math.sin(t * 0.2 + i) * dt * 0.02);
    }
    p.needsUpdate = true;
  }

  const hitTargets = () => [floor, runner, ...artworks.flatMap((a) => a.hit)];

  return { scene, artworks, colliders, walkable, hitTargets, addInstallation, installations, setAcquisitions, spotlightWork, update };
}
