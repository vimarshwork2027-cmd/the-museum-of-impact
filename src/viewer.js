// Inside a moment.
//
//   rewind → return → hold → live (impact) → frozen/compose → offer → ceremony
//
// rewind:  the museum's own record of the event plays backwards to before it.
// return:  the object settles back to where it rests.
// hold:    the visitor takes it, raises it, turns it, lets go (or strikes).
// live:    physics runs and is recorded. The impact takes the camera for a
//          moment and slows time; then time is the visitor's (1× … 0.1×,
//          rewind, scrub).
// frozen:  time = 0. Everything stays suspended; the camera is free; fragments
//          can be taken, turned and thrown into each other. "Find a moment"
//          scrubs the instant without leaving the frozen state.
// ceremony: the composition becomes an installation in its own light.
import * as THREE from 'three';
import { CameraRig } from './camera-rig.js';
import { clamp, damp, easeInOutCubic, smoothstep, escapeHtml } from './util.js';
import { textTexture } from './textures.js';

const SPEEDS = [1, 0.5, 0.25, 0.1];
const DOWN = new THREE.Vector3(0, -1, 0);
const _v3 = new THREE.Vector3();

// What the hands can do, in each state. `lead` is the one thing to do next.
const LEGEND = {
  hold: [
    { k: ['click'], t: 'take hold of it', lead: true },
    { k: ['move'], t: 'then raise it' },
    { k: ['click'], t: 'and let it go' },
    { k: ['right drag'], t: 'reframe' },
  ],
  holding: [
    { k: ['move'], t: 'raise · lower · carry', lead: true },
    { k: ['click'], t: 'let go', lead: true },
    { k: ['scroll'], t: 'nearer · further' },
    { k: ['shift', 'scroll'], t: 'turn it' },
  ],
  cine: [],
  live: [
    { k: ['F'], t: 'freeze the moment', lead: true },
    { k: ['1', '2', '3', '4'], t: 'speed' },
    { k: ['←', '→'], t: 'rewind · forward' },
    { k: ['space'], t: 'pause' },
    { k: ['drag'], t: 'look around' },
    { k: ['T'], t: 'start over' },
  ],
  frozen: [
    { k: ['click'], t: 'take a fragment · click to place', lead: true },
    { k: ['scroll'], t: 'turn it' },
    { k: ['drag'], t: 'orbit' },
    { k: ['W', 'A', 'S', 'D'], t: 'walk' },
    { k: ['dbl click'], t: 'focus' },
    { k: ['R'], t: 'reset the view' },
    { k: ['P'], t: 'preserve this moment', lead: true },
    { k: ['T'], t: 'start over' },
  ],
};
const $ = (s) => document.querySelector(s);
const SERIF = `"Instrument Serif", Georgia, serif`;
const SANS = `Matter, "Inter", "Helvetica Neue", Arial, sans-serif`;

export class Viewer {
  constructor({ renderer, post, sound, cursor, onExit, onPreserve, nextNumber }) {
    this.renderer = renderer;
    this.post = post;
    this.sound = sound;
    this.cursor = cursor;
    this.onExit = onExit;
    this.onPreserve = onPreserve;
    this.nextNumber = nextNumber;
    this.dom = renderer.domElement;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.plane = new THREE.Plane();
    this.active = false;
    this.speed = 1;
    this.dir = 1;
    this.lastMove = performance.now();
    this.bindInput(); // registered before the rig so a grab can claim the pointer first
    this.rig = new CameraRig(new THREE.PerspectiveCamera(), this.dom);
    this.buildUI();
    this.outline = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#fff1d6', transparent: true, opacity: 0.22, side: THREE.BackSide, depthWrite: false }));
    this.outline.matrixAutoUpdate = false;
    this.outline.renderOrder = 4;
    this.guide = this.buildGuide();
  }

  /** The plumb line and landing ring shown while something is held. */
  buildGuide() {
    const g = new THREE.Group();
    g.visible = false;
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]);
    this.guideLine = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: '#c7a46a', dashSize: 0.035, gapSize: 0.03, transparent: true, opacity: 0.5, depthWrite: false }));
    this.guideLine.computeLineDistances();
    this.guideLine.frustumCulled = false;
    this.guideRing = new THREE.Mesh(
      new THREE.RingGeometry(0.052, 0.062, 56),
      new THREE.MeshBasicMaterial({ color: '#c7a46a', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.guideRing.rotation.x = -Math.PI / 2;
    g.add(this.guideLine, this.guideRing);
    g.renderOrder = 3;
    return g;
  }

  // ================================================================ UI
  buildUI() {
    this.ui = {
      root: $('#mui'), state: $('#ctx-state'), no: $('#m-no'), title: $('#m-title'), meta: $('#m-meta'),
      caption: $('#caption'), cMain: $('#caption .c-main'), cSub: $('#caption .c-sub'),
      time: $('#time'), track: $('#track'), fill: $('#track-fill'), head: $('#playhead'), impact: $('#impact-mark'), tc: $('#timecode'),
      speeds: $('#speeds'), freeze: $('#btn-freeze'), rewind: $('#btn-rewind'),
      frozen: $('#frozen-bar'), find: $('#find-track'), findHead: $('#find-head'), release: $('#btn-release'), again: $('#btn-again'), preserve: $('#btn-preserve'),
      offer: $('#offer'), acq: $('#acq'), acquired: $('#acquired'), hint: $('#hold-hint'), work: $('#m-work'),
      keys: $('#m-keys'), restart: $('#btn-restart'),
      holding: $('#holding'), holdWhat: $('#holding-what'), holdH: $('#holding-h'), holdGauge: $('#holding-gauge u'),
    };
    this.ui.speeds.innerHTML = SPEEDS.map((s) => `<button data-s="${s}">${s === 1 ? '1×' : s + '×'}</button>`).join('');
    this.ui.speeds.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.setSpeed(+b.dataset.s, 1);
    });
    this.ui.rewind.addEventListener('click', () => this.setSpeed(Math.min(this.speed || 0.5, 0.5), -1));
    this.ui.freeze.addEventListener('click', () => this.freeze());
    this.ui.release.addEventListener('click', () => this.toggleRelease());
    this.ui.again.addEventListener('click', () => this.beginAgain());
    this.ui.restart.addEventListener('click', () => this.restart());
    $('#m-exit').addEventListener('click', () => this.exit());
    this.ui.preserve.addEventListener('click', () => this.openCard());
    $('#acq-cancel').addEventListener('click', () => this.closeCard());
    this.ui.acq.addEventListener('submit', (e) => { e.preventDefault(); this.preserve(); });
    $('#btn-return').addEventListener('click', () => this.exit());

    // scrubbing the live timeline
    const scrub = (e) => {
      const r = this.ui.track.getBoundingClientRect();
      const k = clamp((e.clientX - r.left) / r.width, 0, 1);
      this.p = Math.min(k * this.timelineEnd(), this.sim.recording.end);
      this.prevP = this.p;
    };
    this.ui.track.addEventListener('pointerdown', (e) => {
      if (this.state !== 'live' || !this.sim.recording) return;
      this.scrubbing = true;
      this.ui.track.setPointerCapture(e.pointerId);
      this.paused = true;
      scrub(e);
    });
    this.ui.track.addEventListener('pointermove', (e) => { if (this.scrubbing) scrub(e); });
    this.ui.track.addEventListener('pointerup', () => { this.scrubbing = false; });

    // finding a moment while frozen
    const find = (e) => {
      const r = this.ui.find.getBoundingClientRect();
      const k = clamp((e.clientX - r.left) / r.width, 0, 1);
      this.setFrozenTime(this.findRange[0] + k * (this.findRange[1] - this.findRange[0]));
    };
    this.ui.find.addEventListener('pointerdown', (e) => {
      if (this.state !== 'frozen' || !this.findRange) return;
      this.finding = true;
      this.ui.find.setPointerCapture(e.pointerId);
      find(e);
    });
    this.ui.find.addEventListener('pointermove', (e) => { if (this.finding) find(e); });
    this.ui.find.addEventListener('pointerup', () => { this.finding = false; this.sim.startCompose(); });
  }

  /** Draw the legend for a state (and remember it, so holding can swap in and out). */
  setKeys(which) {
    if (this.keysFor === which) return;
    this.keysFor = which;
    const rows = LEGEND[which] || [];
    this.ui.keys.innerHTML = rows
      .map((r) => `<span class="k-row${r.lead ? ' lead' : ''}">${r.k.map((k) => `<kbd class="${k.length > 1 ? 'wide' : ''}">${k}</kbd>`).join('')}<em>${r.t}</em></span>`)
      .join('');
    this.ui.keys.classList.toggle('dim', !rows.length);
  }

  showState(word) {
    const el = this.ui.state;
    el.textContent = word;
    el.classList.add('show');
    clearTimeout(this._stT);
    this._stT = setTimeout(() => el.classList.remove('show'), 2600);
  }

  caption(main, sub = '', hold = 0) {
    const c = this.ui.caption;
    clearTimeout(this._capT);
    if (!main) { c.classList.remove('show'); return; }
    this.ui.cMain.textContent = main;
    this.ui.cSub.textContent = sub;
    c.classList.add('show');
    if (hold) this._capT = setTimeout(() => c.classList.remove('show'), hold);
  }

  setSpeed(s, dir = 1) {
    this.auto = false;
    this.speed = s;
    this.dir = dir;
    this.paused = false;
    if (dir > 0 && this.sim.recording && this.p >= this.timelineEnd() - 1e-4) { this.p = 0; this.prevP = 0; }
    this.syncSpeeds();
  }

  syncSpeeds() {
    [...this.ui.speeds.children].forEach((b) => b.classList.toggle('on', this.dir > 0 && !this.paused && +b.dataset.s === this.speed));
    this.ui.rewind.classList.toggle('on', this.dir < 0 && !this.paused);
  }

  // ================================================================ input
  bindInput() {
    const ndcOf = (e) => this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.dom.addEventListener('pointerdown', (e) => {
      if (!this.active || e.button !== 0) return;
      ndcOf(e);
      // the hand latches: one click takes it, the next lets it go. Dragging still works.
      if (this.holding) { this.dropHeld(); return; }
      if (this.dragging) { this.endDragging(); return; }
      if (this.state === 'hold') {
        const hit = this.pick(this.holdables());
        if (!hit) return;
        const g = this.sim.grabTargetFor(hit.mesh);
        if (!g) return;
        this.rig.captured = true;
        this.rig.blockWheel = true; // the wheel pushes the object away, it does not zoom
        // The hand works in an upright plane facing the eye: moving the cursor up
        // raises the object, moving it down brings it down on whatever is below.
        this.holdAnchor = hit.point.clone();
        // a posed tool is taken up clear of what it is meant to strike
        this.holdAnchor.y += this.sim.def.holdLift ?? 0.22;
        // and brought into the same plane as the work it is meant to meet, so that
        // moving the cursor alone can aim it — no scrolling for depth first
        const focus = this.sim.def.holdFocus;
        if (focus) {
          const n = this.planeNormal();
          this.holdAnchor.addScaledVector(n, n.dot(focus) - n.dot(this.holdAnchor));
          this.clampToArena(this.holdAnchor);
        }
        this.updateHoldPlane();
        const start = this.holdAnchor.clone();
        this.sim.beginHold(g, hit.point);
        this.sim.moveHold(start);
        this.holding = { id: e.pointerId, last: start.clone(), down: performance.now(), moved: 0, px: e.clientX, py: e.clientY };
        this.heldName = this.sim.def.holding || 'Holding';
        this.aimed = null;
        this.holdFloorY = -Infinity;
        this.cursor.set('grabbing');
        this.showHolding(true);
        this.setKeys('holding');
        this.holdHint('Move to raise · click to let go');
        this.updateGuide(); // establishes the surface before the hand can move it anywhere
      } else if (this.state === 'frozen' && !this.ceremony && !this.card) {
        const hit = this.pick(this.sim.meshes);
        if (!hit) return;
        this.rig.captured = true;
        this.rig.blockWheel = true;
        this.facingPlane(hit.point, false);
        this.sim.beginDrag(hit.piece, hit.point);
        this.dragging = { id: e.pointerId, hit, down: performance.now(), moved: 0, px: e.clientX, py: e.clientY };
        this.cursor.set('grabbing');
        this.cursor.say('Click again to place it', 2400);
        this.hintPiece = null;
        clearTimeout(this._fragT);
        this.ui.hint.classList.remove('show');
        if (this.step !== 'compose') { this.step = 'compose'; this.showState('Compose'); }
      }
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      this.lastMove = performance.now();
      this.ui.root.classList.remove('idle');
      ndcOf(e);
      const grip = this.holding || this.dragging;
      if (grip) {
        grip.moved += Math.abs(e.clientX - grip.px) + Math.abs(e.clientY - grip.py);
        grip.px = e.clientX;
        grip.py = e.clientY;
        this.raycaster.setFromCamera(this.ndc, this.rig.camera);
        const p = this.raycaster.ray.intersectPlane(this.plane, new THREE.Vector3());
        if (p) {
          if (this.holding) {
            // the moment has an edge: the hand cannot carry it out of the light
            this.clampToArena(p);
            p.y = clamp(p.y, this.sim.def.holdMinY ?? 0.1, 2.6);
            p.y = Math.max(p.y, this.holdFloorY ?? -Infinity); // nothing is pushed through the plinth
            this.holdAnchor.copy(p);
            this.holding.last.copy(p);
            this.sim.moveHold(p);
          } else {
            this.clampToArena(p);
            p.y = Math.max(p.y, 0.02);
            this.sim.moveDrag(p);
          }
        }
        return;
      }
      if (e.target !== this.dom) return;
      if (this.state === 'hold') {
        const hit = this.pick(this.holdables());
        this.hover = hit;
        this.cursor.set(hit ? 'grab' : 'default');
      } else if (this.state === 'frozen' && !this.ceremony) {
        const hit = this.pick(this.sim.meshes);
        this.hover = hit;
        this.cursor.set(hit ? 'grab' : 'default');
      } else this.cursor.set('default');
    });
    // A click latches; a drag-and-throw still lets go on the way up.
    const wasDrag = (g) => g.moved > 16 || performance.now() - g.down > 340;
    window.addEventListener('pointerup', (e) => {
      if (this.holding && this.holding.id === e.pointerId) {
        if (wasDrag(this.holding)) this.dropHeld();
        else this.holding.id = -1; // latched: the pointer is free, the object is not
      }
      if (this.dragging && this.dragging.id === e.pointerId) {
        if (wasDrag(this.dragging)) this.endDragging();
        else this.dragging.id = -1;
      }
    });
    this.dom.addEventListener('wheel', (e) => {
      if (!this.active || (!this.holding && !this.dragging)) return;
      e.preventDefault();
      e.stopPropagation(); // the rig must not zoom while the wheel is raising something
      const cam = this.rig.camera;
      const d = clamp(e.deltaY, -80, 80);
      if (this.holding && !e.shiftKey) {
        // the cursor carries the height; the wheel pushes the object away or draws it nearer
        const n = this.planeNormal();
        this.holdAnchor.addScaledVector(n, -d * 0.0022);
        this.clampToArena(this.holdAnchor);
        this.updateHoldPlane();
        this.holding.last.copy(this.holdAnchor);
        this.sim.moveHold(this.holdAnchor);
        return;
      }
      const axis = e.shiftKey && this.holding ? new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0) : e.shiftKey ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
      const a = d * 0.006;
      if (this.holding) this.sim.turnHold(axis, a);
      else this.sim.turnDrag(axis, a);
    }, { passive: false });
    this.dom.addEventListener('dblclick', (e) => {
      if (!this.active || (this.state !== 'frozen' && this.state !== 'live')) return;
      ndcOf(e);
      const hit = this.pick(this.sim.meshes);
      if (hit) this.rig.focus(hit.mesh.getWorldPosition(new THREE.Vector3()), 0.5);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.active || e.target.closest?.('input, textarea')) return;
      if (e.code === 'Escape') { if (this.card) this.closeCard(); else this.exit(); return; }
      if (this.state === 'live' && this.handedOver) {
        if (e.code === 'Space') { e.preventDefault(); this.paused = !this.paused; this.syncSpeeds(); }
        if (e.code === 'KeyF') this.freeze();
        if (e.code === 'ArrowLeft') this.setSpeed(0.25, -1);
        if (e.code === 'ArrowRight') this.setSpeed(0.25, 1);
        if (/^Digit[1-4]$/.test(e.code)) this.setSpeed(SPEEDS[+e.code.slice(5) - 1], 1);
      } else if (this.state === 'frozen' && !this.ceremony) {
        if (e.code === 'Space') {
          e.preventDefault();
          if (this.dragging) this.endDragging(); else this.toggleRelease();
        }
        if (e.code === 'KeyP') this.openCard();
      }
      if (this.state === 'hold' && this.holding && e.code === 'Space') { e.preventDefault(); this.dropHeld(); }
      if (e.code === 'KeyT' && !this.ceremony && !this.card) this.restart();
    });
    this.dom.addEventListener('contextmenu', (e) => { if (this.active) e.preventDefault(); });
  }

  holdables() { return this.sim.grabbables.filter((g) => g.kind === 'prop' || !g.breakable.broken).flatMap((g) => g.meshes); }

  /** Let go of what is in the hand: this is the release, and the impact follows. */
  dropHeld() {
    if (!this.holding) return;
    this.holding = null;
    this.rig.captured = false;
    this.rig.blockWheel = false;
    this.showHolding(false);
    this.guide.visible = false;
    this.cursor.set('grab');
    this.cursor.say('');
    this.release();
  }

  /** Put down a fragment in the frozen world. */
  endDragging() {
    if (!this.dragging) return;
    this.sim.endDrag();
    this.dragging = null;
    this.rig.captured = false;
    this.rig.blockWheel = false;
    this.cursor.set('grab');
    this.cursor.say('');
    this.rearranged();
  }

  /** Keep a point inside the moment's own stage. */
  clampToArena(p) {
    const r = (this.sim.stage.arena ?? 1.5) - 0.14;
    const d = Math.hypot(p.x, p.z);
    if (d > r) { p.x = (p.x / d) * r; p.z = (p.z / d) * r; }
    return p;
  }

  /** The fragment the hint points at: near the eye, clear of the edges of the frame. */
  pickHintPiece() {
    const cam = this.rig.camera.position;
    let best = null, score = Infinity;
    for (const m of this.sim.meshes) {
      if (!m.visible) continue;
      const p = m.getWorldPosition(new THREE.Vector3());
      const d = p.distanceTo(cam);
      if (d < 0.3) continue; // too close to the eye to read as a thing
      const ndc = p.clone().project(this.rig.camera);
      if (ndc.z > 1 || Math.abs(ndc.x) > 0.62 || Math.abs(ndc.y) > 0.52) continue; // off frame
      if (d < score) { score = d; best = m; }
    }
    return best;
  }

  showHolding(on) {
    this.ui.holding.classList.toggle('show', on);
    if (!on) this.ui.holding.classList.remove('aimed');
    if (on) this.ui.holdWhat.textContent = this.heldName || 'Holding';
  }

  holdHint(text) {
    this.ui.hint.querySelector('span').textContent = text;
    this.ui.hint.classList.add('show');
  }

  /** Start the work over from anywhere — the one control that is always there. */
  restart() {
    if (!this.active || this.ceremony) return;
    if (this.card) this.closeCard();
    this.ui.acq.classList.remove('show');
    this.card = false;
    this.holding = this.dragging = null;
    this.rig.captured = false;
    this.rig.blockWheel = false;
    this.guide.visible = false;
    this.showHolding(false);
    this.sound.silence();
    this.sim.endHold();
    this.sim.endDrag();
    this.showState('Again');
    this.beginAgain();
  }

  /**
   * While something is held: a plumb line down to whatever is below it and a ring
   * where it will land, so the height the visitor is choosing is visible.
   */
  updateGuide() {
    const h = this.sim.hold;
    if (!h || !this.holding) { this.guide.visible = false; return; }
    // everything the held thing is made of — never let it see itself
    const b = h.body;
    const own = new Set();
    for (const m of h.g.meshes) m.traverse((o) => own.add(o));
    const box = new THREE.Box3();
    for (const m of h.g.meshes) box.expandByObject(m);
    if (box.isEmpty()) { this.guide.visible = false; return; }
    const c = box.getCenter(_v3);

    // One cast straight down, always from above the whole stage — probing from the
    // object itself would miss the plinth top once the object was already inside it.
    this.raycaster.set(new THREE.Vector3(c.x, Math.max(3.2, box.max.y + 0.1), c.z), DOWN);
    this.raycaster.far = 8;
    const below = this.raycaster.intersectObjects(this.sim.scene.children, true).filter((x) => {
      if (!x.object.isMesh || !x.object.visible) return false;
      let o = x.object;
      while (o) { if (own.has(o) || o === this.guide || o === this.outline) return false; o = o.parent; }
      return true;
    });
    this.raycaster.far = Infinity;
    const isWork = (x) => !!(x.object.userData.piece || x.object.parent?.userData.piece);
    const landing = below[0];
    // the plinth, the slab, the floor: solid things the hand cannot push through.
    // A work is not one of them — a hammer has to be able to reach the ice.
    const solid = below.find((x) => !isWork(x));

    // How far the object hangs below the hand — so the floor can be expressed as a
    // limit on the hand itself, which the next cursor move will also respect.
    if (solid) {
      const under = solid.point.y;
      this.holdFloorY = under + (this.holdAnchor.y - box.min.y); // a limit on the hand
      h.floorY = under + (b.position.y - box.min.y); // the same limit, on the body itself
      if (this.holdAnchor.y < this.holdFloorY) {
        this.holdAnchor.y = this.holdFloorY;
        this.updateHoldPlane();
        h.target.copy(this.holdAnchor);
        this.holding.last.copy(this.holdAnchor);
      }
    } else { this.holdFloorY = -Infinity; h.floorY = null; }

    const groundY = landing ? landing.point.y : 0;
    const drop = Math.max(0, box.min.y - groundY);
    const onTarget = !!landing && isWork(landing);
    if (onTarget !== this.aimed) {
      this.aimed = onTarget;
      this.guideRing.material.color.set(onTarget ? '#ffe2a8' : '#c7a46a');
      this.guideLine.material.color.set(onTarget ? '#ffe2a8' : '#c7a46a');
      this.ui.holding.classList.toggle('aimed', onTarget);
      this.holdHint(onTarget ? 'Let go — it will strike' : 'Move to raise · click to let go');
    }
    this.guide.visible = true;
    const pos = this.guideLine.geometry.attributes.position;
    pos.setXYZ(0, c.x, box.min.y, c.z);
    pos.setXYZ(1, c.x, groundY + 0.002, c.z);
    pos.needsUpdate = true;
    this.guideLine.computeLineDistances();
    this.guideRing.position.set(c.x, groundY + 0.003, c.z);
    const s = clamp(0.5 + drop * 0.6, 0.5, 2.2);
    this.guideRing.scale.set(s, s, 1);
    this.guideRing.material.opacity = clamp(0.18 + drop * 0.5, 0.18, 0.72) * (this.aimed ? 1.3 : 1);
    this.guideLine.material.opacity = drop < 0.004 ? 0 : (this.aimed ? 0.75 : 0.5);
    this.ui.holdH.textContent = `${drop.toFixed(2)} m`;
    this.ui.holdGauge.style.width = `${clamp(drop / 1.6, 0, 1) * 100}%`;
  }

  pick(objects) {
    this.raycaster.setFromCamera(this.ndc, this.rig.camera);
    const hit = this.raycaster.intersectObjects(objects, true)[0];
    if (!hit) return null;
    let o = hit.object;
    while (o && !o.userData.piece) o = o.parent;
    if (!o) return null;
    return { mesh: o, child: hit.object.userData.outline || hit.object, piece: o.userData.piece, point: hit.point };
  }

  /** The horizontal direction the eye is looking: the normal of the hand's plane. */
  planeNormal() {
    const n = new THREE.Vector3();
    this.rig.camera.getWorldDirection(n);
    n.y = 0;
    if (n.lengthSq() < 1e-4) n.set(0, 0, 1);
    return n.normalize();
  }

  /** Re-fit the upright hand plane through the anchor, facing wherever the eye now is. */
  updateHoldPlane() {
    this.plane.setFromNormalAndCoplanarPoint(this.planeNormal(), this.holdAnchor);
  }

  /** The plane the hand moves in: upright and facing the eye, so up is up. */
  facingPlane(point, upright) {
    const n = new THREE.Vector3();
    this.rig.camera.getWorldDirection(n);
    if (upright) { n.y = 0; if (n.lengthSq() < 1e-4) n.set(0, 0, 1); n.normalize(); }
    this.plane.setFromNormalAndCoplanarPoint(n, point);
  }

  // ================================================================ lifecycle
  open(sim, { work = null } = {}) {
    this.sim = sim;
    this.work = work;
    this.active = true;
    this.ceremony = false;
    this.card = false;
    this.composedOnce = false;
    this.rig.camera = sim.camera;
    this.resize();
    this.rig.enabled = true;
    this.rig.set(sim.def.camera.pos, sim.def.camera.target);
    sim.scene.add(this.outline, this.guide);
    this.guide.visible = false;
    sim.onLiveEvent = (e) => this.playEvent(e, 1, false);
    this.ui.root.classList.add('show');
    this.ui.root.classList.remove('ceremony', 'idle');
    this.ui.no.textContent = work ? `Impact No. ${work.number}` : `Impact No. ${sim.def.number}`;
    this.ui.title.textContent = work ? work.title : sim.def.title;
    this.ui.meta.textContent = work ? `After ${sim.def.title} · created by ${work.creator || 'a visitor'}` : `${sim.def.material} · ${sim.def.year}`;
    this.ui.work.classList.toggle('show', !!(work && work.note));
    if (work?.note) this.ui.work.innerHTML = `<p>“${escapeHtml(work.note)}”</p>`;
    for (const el of [this.ui.time, this.ui.frozen, this.ui.offer, this.ui.acq, this.ui.acquired]) el.classList.remove('show');
    this.showHolding(false);
    this.setKeys(null);
    this.resetStage();
    this.sound.setScene('moment');
    if (work) this.openWork(work);
    else this.beginRewind();
  }

  resetStage() {
    const st = this.sim.stage;
    st.key.intensity = this.sim.def.stage.keyIntensity ?? 30;
    st.rim.intensity = 0.55;
    st.fill.intensity = 0.25;
    st.ceremony.intensity = 0;
    if (this.dais) this.dais.visible = false;
    if (this.plaque) this.plaque.visible = false;
    this.post.u.uVignette.value = 0.85;
  }

  beginRewind() {
    const sim = this.sim;
    sim.reset();
    sim.recording = sim.canonical;
    sim.particles.load(sim.canonicalExtra.bursts);
    if (sim.ctx.splash) sim.ctx.splash.load(sim.canonicalExtra.splash);
    this.state = 'rewind';
    this.phaseT = 0;
    this.p = sim.heroTime;
    this.ui.time.classList.remove('show');
    this.caption('Time rewinds', 'to the instant before it happened');
    this.showState('');
  }

  beginReturn() {
    this.state = 'return';
    this.phaseT = 0;
    this.from = this.sim.meshes.map((m) => ({ p: m.position.clone(), q: m.quaternion.clone() }));
    this.sim.reset();
    this.to = this.sim.meshes.map((m) => ({ p: m.position.clone(), q: m.quaternion.clone() }));
  }

  beginHold(message) {
    const sim = this.sim;
    this.state = 'hold';
    this.handedOver = false;
    sim.mode = 'hold';
    this.ui.time.classList.remove('show');
    this.ui.frozen.classList.remove('show');
    this.ui.root.classList.remove('cine');
    this.rig.shot(false);
    this.caption(null);
    this.holdHint(message || sim.def.hint);
    this.showHolding(false);
    this.setKeys('hold');
    this.guide.visible = false;
    this.rig.blockWheel = false;
    this.post.u.uDesat.value = 0;
    this.post.u.uAberr.value = 0;
  }

  release() {
    const sim = this.sim;
    sim.endHold();
    if (sim.mode !== 'live') sim.startRecording();
    this.beginLive();
  }

  beginLive() {
    const sim = this.sim;
    this.state = 'live';
    this.p = 0;
    this.prevP = 0;
    this.speed = 1;
    this.dir = 1;
    this.auto = true;
    this.paused = false;
    this.handedOver = false;
    this.ended = false;
    this.restFor = 0;
    this.impactSeenAt = null;
    this.liveStart = performance.now();
    this.ui.hint.classList.remove('show');
    this.showHolding(false);
    this.guide.visible = false;
    this.rig.blockWheel = false;
    this.setKeys('cine');
    // the recording starts at the instant of release: an impact logged at t = 0
    // (a swung hammer, a sphere already touching the stones) is still a sound
    this.eventFloor = -1e-6;
    this.ui.root.classList.add('cine');
    this.cursor.set('default');
    // cinematic shot follows the falling object
    this.shot = { theta: this.rig.cur.theta + 0.25, radius: Math.min(this.rig.cur.radius, sim.def.cineRadius ?? 1.45), focus: this.focusPoint() };
    this.rig.shot(true);
    this.rig.cine.pos.copy(this.rig.camera.position);
    this.rig.cine.look.copy(this.rig.cur.target);
  }

  focusPoint() {
    const sim = this.sim;
    if (sim.impacted && sim.impactPos) return sim.impactPos.clone();
    const g = sim.grabbables[0];
    const b = g?.body;
    return b ? new THREE.Vector3(b.position.x, b.position.y, b.position.z) : sim.def.camera.target.clone();
  }

  openWork(work) {
    const sim = this.sim;
    sim.reset();
    sim.applyState(work.state);
    sim.particles.load(work.extra?.bursts);
    if (sim.ctx.splash) sim.ctx.splash.load(work.extra?.splash);
    // a preserved work is always after its break: fracture faces are part of it
    sim.recording = { breakTime: -Infinity, count: 0, events: [] };
    this.frozenT = work.extra?.t ?? 0;
    sim.visuals(this.frozenT);
    if (work.cam) this.rig.set(new THREE.Vector3().fromArray(work.cam.p), new THREE.Vector3().fromArray(work.cam.t));
    this.enterFrozen({ fromWork: true });
    this.caption(work.title, work.creator ? `created by ${work.creator}` : 'created by a visitor', 3800);
  }

  // ================================================================ freezing
  freeze() {
    if (this.state !== 'live' || !this.sim.recording) return;
    const rec = this.sim.recording;
    // never punish a late freeze: if the moment has already settled, drift back to where it mattered
    if (rec.impactTime != null && this.p > rec.impactTime + 0.45 && rec.motionAt(this.p) < 0.18) {
      const target = rec.findMoment(rec.impactTime + 0.02, rec.impactTime + 1.3);
      this.state = 'drift';
      this.drift = { from: this.p, to: target, t: 0 };
      this.ui.time.classList.remove('show');
      this.sound.silence();
      this.caption('Time drifts back', 'to where it mattered', 2600);
      return;
    }
    this.enterFrozen();
  }

  enterFrozen({ fromWork = false } = {}) {
    const sim = this.sim;
    this.state = 'frozen';
    this.step = 'freeze';
    this.rig.shot(false);
    this.ui.root.classList.remove('cine');
    this.ui.time.classList.remove('show');
    this.sound.silence();
    this.sound.setScene('frozen');
    if (!fromWork) {
      this.frozenT = this.p;
      sim.recording.sample(this.p, sim.meshes);
      sim.visuals(this.p);
      this.post.u.uFlash.value = 0.12;
      this.showState('Freeze');
    }
    const rec = sim.recording;
    if (rec && rec.count > 2) {
      const it = rec.impactTime ?? 0;
      this.findRange = [Math.max(0, it - 0.12), Math.min(rec.end, it + 1.6)];
      if (this.frozenT < this.findRange[0] || this.frozenT > this.findRange[1]) this.findRange = [Math.max(0, this.frozenT - 0.5), Math.min(rec.end, this.frozenT + 0.5)];
      this.ui.find.parentElement.hidden = false;
      this.syncFind();
    } else {
      this.findRange = null;
      this.ui.find.parentElement.hidden = true;
    }
    sim.startCompose();
    this.setKeys('frozen');
    this.ui.release.textContent = 'Release time';
    this.ui.frozen.classList.add('show');
    this.ui.preserve.classList.remove('urged');
    if (!fromWork) this.caption('Time has stopped', 'walk around it · move the fragments · preserve what you make', 6000);
    // a hint pinned to an actual fragment: the surest way to show they can be taken
    this.hintPiece = null;
    clearTimeout(this._fragT);
    if (!fromWork && !this.composedOnce) {
      this._fragT = setTimeout(() => {
        if (this.state !== 'frozen' || this.ceremony || this.card || this.composedOnce) return;
        this.hintPiece = this.pickHintPiece();
        if (this.hintPiece) this.holdHint('Click a fragment to move it');
      }, 1500);
    }
    // the way to keep it should be obvious long before the museum offers
    clearTimeout(this._urgeT);
    this._urgeT = setTimeout(() => {
      if (this.state === 'frozen' && !this.ceremony && !this.card) this.ui.preserve.classList.add('urged');
    }, fromWork ? 600000 : 2600);
    clearTimeout(this._offerT);
    this._offerT = setTimeout(() => { if (this.state === 'frozen' && !this.ceremony && !this.card) this.ui.offer.classList.add('show'); }, fromWork ? 600000 : 9000);
  }

  setFrozenTime(t) {
    const sim = this.sim;
    this.frozenT = t;
    sim.recording.sample(t, sim.meshes);
    sim.visuals(t);
    sim.startCompose();
    this.syncFind();
  }

  syncFind() {
    if (!this.findRange) return;
    const k = (this.frozenT - this.findRange[0]) / (this.findRange[1] - this.findRange[0] || 1);
    this.ui.findHead.style.left = `${clamp(k, 0, 1) * 100}%`;
  }

  toggleRelease() {
    const sim = this.sim;
    if (this.state !== 'frozen' || this.ceremony) return;
    sim.setHold(sim.gravityOn);
    this.ui.release.textContent = sim.gravityOn ? 'Hold time' : 'Release time';
    if (sim.gravityOn) this.rearranged();
  }

  rearranged() {
    this.composedOnce = true;
    this.hintPiece = null;
    clearTimeout(this._fragT);
    this.ui.hint.classList.remove('show');
    this.ui.preserve.classList.add('urged');
    clearTimeout(this._offerT);
    this._offerT = setTimeout(() => { if (this.state === 'frozen' && !this.ceremony && !this.card) this.ui.offer.classList.add('show'); }, 1400);
  }

  beginAgain() {
    this.sim.stopAll?.();
    this.ui.frozen.classList.remove('show');
    this.ui.offer.classList.remove('show');
    this.sound.setScene('moment');
    this.post.u.uCool.value = 0;
    this.work = null;
    this.ui.no.textContent = `Impact No. ${this.sim.def.number}`;
    this.ui.title.textContent = this.sim.def.title;
    this.ui.meta.textContent = `${this.sim.def.material} · ${this.sim.def.year}`;
    this.ui.work.classList.remove('show');
    this.beginReturnFromHere();
  }

  /** Glide everything back to rest from wherever it is now. */
  beginReturnFromHere() {
    this.state = 'return';
    this.phaseT = 0;
    this.from = this.sim.meshes.map((m) => ({ p: m.position.clone(), q: m.quaternion.clone() }));
    this.sim.reset();
    this.to = this.sim.meshes.map((m) => ({ p: m.position.clone(), q: m.quaternion.clone() }));
    this.sim.applyState(this.from.flatMap((f) => [f.p.x, f.p.y, f.p.z, f.q.x, f.q.y, f.q.z, f.q.w]));
    this.rig.reset();
  }

  // ================================================================ preserving
  openCard() {
    if (this.state !== 'frozen' || this.ceremony || this.card) return;
    this.card = true;
    this.ui.offer.classList.remove('show');
    this.ui.preserve.classList.remove('urged');
    this.ui.frozen.classList.remove('show'); // filling in the record, not scrubbing time
    $('#acq-no').textContent = this.nextNumber();
    $('#acq-src').textContent = this.sim.def.title;
    $('#acq-year').textContent = new Date().getFullYear();
    $('#acq-title').placeholder = `${this.sim.def.title}, rearranged`;
    this.ui.acq.classList.add('show');
    this.showState('Preserve');
    setTimeout(() => $('#acq-by').focus(), 300);
  }

  closeCard() {
    this.card = false;
    this.ui.acq.classList.remove('show');
    if (this.state === 'frozen' && !this.ceremony) this.ui.frozen.classList.add('show');
    this.ui.preserve.classList.add('urged');
  }

  async preserve() {
    const sim = this.sim;
    this.card = false;
    this.ceremony = true;
    sim.endDrag();
    const data = {
      title: $('#acq-title').value.trim() || $('#acq-title').placeholder,
      creator: $('#acq-by').value.trim(),
      note: $('#acq-note').value.trim(),
      number: $('#acq-no').textContent,
      sourceArtwork: sim.id,
      state: sim.captureState(),
      extra: { t: +this.frozenT.toFixed(4), bursts: sim.particles.serialize(), splash: sim.ctx.splash?.serialize() ?? null },
      cam: { p: this.rig.camera.position.toArray().map((x) => +x.toFixed(3)), t: this.rig.cur.target.toArray().map((x) => +x.toFixed(3)), q: this.rig.camera.quaternion.toArray().map((x) => +x.toFixed(4)) },
    };
    const work = this.onPreserve(data);
    this.preserved = work;
    this.ceremonyStart(work);
  }

  ceremonyStart(work) {
    const sim = this.sim;
    this.setKeys(null);
    this.guide.visible = false;
    this.ui.acq.classList.remove('show');
    this.ui.frozen.classList.remove('show');
    this.ui.root.classList.add('ceremony');
    this.cursor.set('default');
    this.sound.setScene('ceremony');
    setTimeout(() => { this.sound.note(146.8, 0.02, 6); this.sound.note(220, 0.014, 6); }, 600);
    // the composition settles where it is
    sim.setHold(true);
    this.ceremonyT = 0;
    // centre and extent of the work
    const box = new THREE.Box3();
    for (const m of sim.meshes) box.expandByPoint(m.position);
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const r = clamp(Math.hypot(size.x, size.z) / 2 + 0.25, 0.45, 2.4);
    if (!this.dais) {
      this.dais = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.02, 0.08, 72), new THREE.MeshStandardMaterial({ color: '#1d1915', roughness: 0.35, metalness: 0.1 }));
      this.dais.receiveShadow = true;
    }
    sim.scene.add(this.dais);
    this.dais.scale.set(r, 1, r);
    this.dais.position.set(c.x, -0.05, c.z);
    this.dais.visible = true;
    // plaque on a small brass stand, facing the visitor
    if (this.plaque) { this.plaque.material.map.dispose(); sim.scene.remove(this.plaque); }
    this.plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.17), new THREE.MeshStandardMaterial({
      map: textTexture(520, 340, [
        { text: 'NEW ACQUISITION', font: `500 17px ${SANS}`, color: '#7b6648', x: 30, y: 52, spacing: '5px' },
        { text: `Impact No. ${work.number}`, font: `italic 26px ${SERIF}`, color: '#3a2e22', x: 30, y: 96 },
        { text: work.title, font: `46px ${SERIF}`, color: '#1b150f', x: 30, y: 160, wrap: 460, lh: 46 },
        { text: `${work.creator ? 'Created by ' + work.creator : 'Created by a visitor'} · ${new Date(work.date).getFullYear()}`, font: `400 17px ${SANS}`, color: '#5a4a38', x: 30, y: 300 },
      ], { bg: '#e9e0cd' }),
      roughness: 0.7,
    }));
    const toCam = new THREE.Vector3().subVectors(this.rig.camera.position, c).setY(0).normalize();
    this.plaque.position.set(c.x + toCam.x * (r + 0.12), 0.28, c.z + toCam.z * (r + 0.12));
    this.plaque.lookAt(this.rig.camera.position.x, 0.6, this.rig.camera.position.z);
    this.plaque.rotateX(-0.45);
    this.plaque.scale.setScalar(0.001);
    sim.scene.add(this.plaque);
    // its own light
    const st = sim.stage;
    st.ceremony.position.set(c.x + 0.6, 5.4, c.z + 0.9);
    st.ceremony.target.position.copy(c);
    st.ceremony.angle = Math.atan(r * 1.3 / 5.2);
    this.cer = { c, r, key0: st.key.intensity, from: this.rig.camera.position.clone(), look0: this.rig.cur.target.clone() };
    const dir = new THREE.Vector3().subVectors(this.rig.camera.position, c);
    dir.y = Math.max(dir.y, 0.35);
    dir.normalize();
    this.cer.to = c.clone().addScaledVector(dir, Math.max(2.2, r * 2.4)).setY(Math.max(1.1, c.y + r * 0.9));
    this.rig.shot(true);
    this.rig.cine.pos.copy(this.rig.camera.position);
    this.rig.cine.look.copy(this.cer.look0);
    this.rig.cine.w = 1;
  }

  exit() {
    if (!this.active || this.card) return;
    this.onExit(this.preserved ? { acquired: this.preserved } : {});
  }

  close() {
    this.active = false;
    this.rig.enabled = false;
    this.rig.captured = false;
    this.holding = this.dragging = null;
    this.ceremony = false;
    this.preserved = null;
    clearTimeout(this._offerT);
    clearTimeout(this._urgeT);
    clearTimeout(this._fragT);
    this.hintPiece = null;
    this.ui.preserve.classList.remove('urged');
    this.sim.endHold();
    this.sim.endDrag();
    this.sim.mode = 'hold';
    this.sim.onLiveEvent = null;
    this.sim.scene.remove(this.outline, this.guide);
    this.rig.blockWheel = false;
    this.guide.visible = false;
    this.showHolding(false);
    this.setKeys(null);
    this.ui.root.classList.remove('show', 'ceremony', 'cine');
    for (const el of [this.ui.time, this.ui.frozen, this.ui.offer, this.ui.acq, this.ui.acquired, this.ui.hint]) el.classList.remove('show');
    this.caption(null);
    this.cursor.set('default');
    this.post.u.uCool.value = 0;
    this.post.u.uDesat.value = 0;
    this.post.u.uFreezeGrain.value = 0;
    this.resetStage();
  }

  resize() {
    const cam = this.sim?.camera;
    if (!cam) return;
    cam.aspect = innerWidth / innerHeight;
    cam.fov = cam.aspect < 1 ? 52 : 34;
    cam.updateProjectionMatrix();
  }

  timelineEnd() {
    const rec = this.sim.recording;
    return this.ended ? rec.end : Math.max(rec.end, (rec.impactTime ?? 0) + (this.sim.def.settle ?? 3));
  }

  // ================================================================ events → sound
  playEvent(e, speed, reverse) {
    if (e.type === 'break') this.sound.breakSound(e.material, e.v, { speed, reverse });
    else if (e.type === 'hit') this.sound.hit(e.material, e.v, { speed, reverse });
  }

  scanEvents(a, b) {
    const rec = this.sim.recording;
    if (!rec || a === b) return;
    const s = this.dir < 0 ? this.speed : this.speed;
    if (b > a) {
      for (const e of rec.events) if (e.t > a && e.t <= b) this.playEvent(e, s, false);
    } else {
      for (const e of rec.events) if (e.t <= a && e.t > b && (e.type === 'break' || e.v > 1)) this.playEvent(e, s, true);
    }
  }

  // ================================================================ frame
  update(dt) {
    if (!this.active) return;
    const sim = this.sim;
    const u = this.post.u;
    u.uFlash.value *= 1 - damp(6, dt);
    if (performance.now() - this.lastMove > 2200) this.ui.root.classList.add('idle');

    switch (this.state) {
      case 'rewind': {
        this.phaseT += dt;
        const D = 2.4;
        const k = easeInOutCubic(clamp(this.phaseT / D, 0, 1));
        const prev = this.p;
        this.p = sim.heroTime * (1 - k);
        this.dir = -1;
        this.speed = 1;
        this.scanEvents(prev, this.p);
        sim.recording.sample(this.p, sim.meshes);
        sim.visuals(this.p);
        u.uDesat.value = 0.55 * Math.sin(k * Math.PI);
        u.uAberr.value = 0.04 * Math.sin(k * Math.PI);
        if (this.phaseT >= D) this.beginReturn();
        break;
      }
      case 'return': {
        this.phaseT += dt;
        const k = easeInOutCubic(clamp(this.phaseT / 1.3, 0, 1));
        for (let i = 0; i < sim.meshes.length; i++) {
          sim.meshes[i].position.lerpVectors(this.from[i].p, this.to[i].p, k);
          sim.meshes[i].quaternion.slerpQuaternions(this.from[i].q, this.to[i].q, k);
        }
        sim.visuals(-1);
        if (this.phaseT >= 1.3) { sim.syncMeshes(); this.beginHold(); this.caption(null); }
        break;
      }
      case 'hold': {
        if (this.holding) { this.updateHoldPlane(); this.updateGuide(); sim.updateHold(dt); } else this.guide.visible = false;
        sim.advance(dt);
        sim.visuals(0);
        if (sim.mode === 'live') { this.holding = null; this.rig.captured = false; this.beginLive(); }
        this.placeHint();
        break;
      }
      case 'live': this.updateLive(dt); break;
      case 'drift': {
        this.drift.t += dt;
        const k = easeInOutCubic(clamp(this.drift.t / 1.5, 0, 1));
        this.p = this.drift.from + (this.drift.to - this.drift.from) * k;
        sim.recording.sample(this.p, sim.meshes);
        sim.visuals(this.p);
        if (this.drift.t >= 1.5) this.enterFrozen();
        break;
      }
      case 'frozen': {
        if (!this.ceremony) { sim.stepCompose(dt); this.placeHint(); }
        else this.updateCeremony(dt);
        u.uCool.value += (0.22 - u.uCool.value) * damp(2, dt);
        break;
      }
    }
    // the grain itself stops when time stops
    u.uFreezeGrain.value = this.state === 'frozen' ? 1 : 0;
    if (this.state !== 'frozen') u.uCool.value *= 1 - damp(2, dt);
    if (this.state !== 'rewind') { u.uDesat.value *= 1 - damp(3, dt); u.uAberr.value *= 1 - damp(3, dt); }
    this.updateOutline();
    this.rig.update(dt);
  }

  updateLive(dt) {
    const sim = this.sim;
    const rec = sim.recording;
    const prev = this.eventFloor != null ? this.eventFloor : this.p;
    this.eventFloor = null;
    const atEdge = this.p >= sim.time - 1e-6;
    // the impact takes time for itself: slow, then hand over
    if (sim.impacted && this.impactSeenAt == null && this.p >= rec.impactTime) {
      this.impactSeenAt = performance.now();
      this.post.u.uFlash.value = 0.18;
      this.showState('Impact');
      this.shot.focus = sim.impactPos ? sim.impactPos.clone() : this.shot.focus;
    }
    if (this.auto) {
      const want = this.impactSeenAt != null ? 0.18 : 1;
      this.speed += (want - this.speed) * damp(this.impactSeenAt != null ? 14 : 4, dt);
      if (this.impactSeenAt != null && performance.now() - this.impactSeenAt > 1700) {
        this.auto = false;
        this.speed = 0.25;
        this.handOver();
      } else if (this.impactSeenAt == null && performance.now() - this.liveStart > 2800) {
        // Nothing broke. The shot still has to end: while it runs the whole
        // interface is hidden, so a gentle drop used to leave no way out at all.
        this.auto = false;
        this.speed = 1;
        this.handOver();
      }
    }
    const s = this.paused ? 0 : this.speed;
    if (this.dir > 0 && atEdge && !this.ended && !this.scrubbing) {
      sim.advance(dt * s);
      this.p = sim.time;
      if (sim.impacted && (rec.end >= this.timelineEnd() || rec.end > 8)) this.ended = true;
    } else if (!this.scrubbing) {
      this.p = clamp(this.p + this.dir * dt * s, 0, rec.end);
      if (this.dir > 0 && this.p >= rec.end && this.ended && !this.paused) { this.paused = true; this.syncSpeeds(); }
      if (this.dir < 0 && this.p <= 0) { this.paused = true; this.syncSpeeds(); }
      rec.sample(this.p, sim.meshes);
    } else rec.sample(this.p, sim.meshes);
    sim.visuals(this.p);
    if (!this.scrubbing) this.scanEvents(prev, this.p);
    this.prevP = this.p;

    // it survived: no impact and everything is still — let the visitor try again
    if (!sim.impacted && this.p >= sim.time - 1e-6) {
      const g = sim.grabbables.find((x) => x.body.type !== 4);
      const atRest = !g || g.body.sleepState === 2 || g.body.velocity.length() < 0.05;
      this.restFor = atRest ? this.restFor + dt : 0;
      if (this.restFor > 0.5 || sim.time > 5) {
        sim.mode = 'hold';
        sim.recording = null;
        sim.time = 0;
        sim.particles.reset();
        // surviving is a real outcome, not a failure: name it and hand it straight back
        this.beginHold(sim.def.id === 'break' ? 'It held. Swing harder.'
          : sim.def.id === 'collapse' ? 'It stands. Aim for the stones.'
          : sim.def.id === 'splash' ? 'It missed the water. Try again.'
          : 'It held. Raise it higher.');
        this.caption('It held', 'raise it higher and let go again', 3600);
        this.rig.takeBack();
        return;
      }
    }
    // cinematic camera
    if (!this.handedOver && this.rig.cine.goal > 0) {
      const sh = this.shot;
      const f = this.focusPoint();
      sh.focus.lerp(f, damp(sim.impacted ? 3 : 6, dt));
      sh.theta += dt * (sim.impacted ? 0.1 : 0.22);
      const target = sh.radius * (sim.impacted ? 0.92 : 1);
      const pos = new THREE.Vector3().setFromSpherical(new THREE.Spherical(target, 1.22, sh.theta)).add(sh.focus);
      pos.y = Math.max(pos.y, 0.12);
      this.rig.cine.pos.lerp(pos, damp(2.5, dt));
      this.rig.cine.look.lerp(sh.focus, damp(4, dt));
    }
    // timeline
    const end = this.timelineEnd();
    const k = clamp(this.p / end, 0, 1) * 100;
    this.ui.fill.style.width = `${k}%`;
    this.ui.head.style.left = `${k}%`;
    if (rec.impactTime != null) { this.ui.impact.style.left = `${(rec.impactTime / end) * 100}%`; this.ui.impact.hidden = false; } else this.ui.impact.hidden = true;
    const rel = this.p - (rec.impactTime ?? 0);
    this.ui.tc.textContent = `${rel < 0 ? '−' : '+'}${Math.abs(rel).toFixed(3)} s`;
  }

  handOver() {
    this.handedOver = true;
    this.setKeys('live');
    this.rig.takeBack();
    this.ui.root.classList.remove('cine');
    this.ui.time.classList.add('show');
    this.lastMove = performance.now();
    this.ui.root.classList.remove('idle');
    this.syncSpeeds();
  }

  updateCeremony(dt) {
    const sim = this.sim;
    const c = this.cer;
    this.ceremonyT += dt;
    const t = this.ceremonyT;
    if (t < 1.5) sim.stepCompose(dt); // let anything still moving come to rest
    const k = (a, b) => smoothstep(a, b, t);
    const st = sim.stage;
    st.key.intensity = c.key0 * (1 - 0.7 * k(0.2, 2.2));
    st.rim.intensity = 0.55 * (1 - 0.6 * k(0.2, 2.2));
    st.fill.intensity = 0.25 * (1 - 0.8 * k(0.2, 2.2));
    st.ceremony.intensity = 55 * k(0.8, 3.0);
    this.post.u.uVignette.value = 0.85 + 0.35 * k(0.2, 2.2);
    this.dais.position.y = -0.05 + 0.05 * easeInOutCubic(k(1.0, 2.6));
    this.plaque.scale.setScalar(Math.max(0.001, easeInOutCubic(k(2.2, 3.2))));
    // the camera steps back to present the installation
    const m = easeInOutCubic(k(0.6, 5.5));
    this.rig.cine.pos.lerpVectors(c.from, c.to, m);
    this.rig.cine.look.lerpVectors(c.look0, c.c, m);
    if (t > 4.2 && !this.ui.acquired.classList.contains('show')) {
      const w = this.preserved;
      $('#acquired-no').textContent = `Impact No. ${w.number}`;
      $('#acquired-title').textContent = w.title;
      $('#acquired-by').textContent = `${w.creator ? 'Created by ' + w.creator : 'Created by a visitor'} · ${new Date(w.date).getFullYear()}`;
      this.ui.acquired.classList.add('show');
    }
  }

  placeHint() {
    const el = this.ui.hint;
    if (!el.classList.contains('show')) return;
    let p;
    if (this.state === 'frozen') {
      if (!this.hintPiece) { el.classList.remove('show'); return; }
      p = this.hintPiece.getWorldPosition(new THREE.Vector3());
    } else {
      const g = this.sim.grabbables.find((x) => x.kind === 'prop' || !x.breakable.broken);
      if (!g) return;
      p = new THREE.Vector3(g.body.position.x, g.body.position.y, g.body.position.z);
    }
    p.project(this.rig.camera);
    const x = ((p.x + 1) / 2) * innerWidth, y = ((1 - p.y) / 2) * innerHeight;
    // near the right edge the label would run off the screen: hang it on the other side
    el.classList.toggle('flip', x > innerWidth - 340);
    el.style.transform = `translate(${x}px, ${y}px)`;
  }

  updateOutline() {
    const h = !this.holding && !this.dragging && (this.state === 'hold' || (this.state === 'frozen' && !this.ceremony)) ? this.hover : null;
    // with nothing under the cursor, the fragment the hint names glows instead
    const hinted = this.state === 'frozen' && !this.hover && !this.dragging && this.hintPiece
      && this.ui.hint.classList.contains('show') ? this.hintPiece : null;
    const target = this.dragging ? this.dragging.hit.child : (h?.child || hinted);
    if (!target) { this.outline.visible = false; return; }
    this.outline.visible = true;
    this.outline.geometry = target.geometry;
    target.updateWorldMatrix(true, false);
    this.outline.matrix.copy(target.matrixWorld).multiply(new THREE.Matrix4().makeScale(1.06, 1.06, 1.06));
    this.outline.material.opacity = this.dragging ? 0.3
      : target === hinted ? 0.2 + 0.14 * (0.5 + 0.5 * Math.sin(performance.now() / 420))
      : 0.16 + 0.06 * Math.sin(performance.now() / 260);
  }
}
