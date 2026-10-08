import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildMuseum } from './museum.js';
import { Walker } from './nav.js';
import { createPost } from './post.js';
import { ImpactSimulation } from './sim/simulation.js';
import { createDisplay } from './sim/display.js';
import { ARTWORKS } from './artworks/index.js';
import { Viewer } from './viewer.js';
import { Sound } from './audio.js';
import { Cursor } from './cursor.js';
import { loadCollection, saveCollection, newId, nextNumber } from './collection.js';
import { clamp, damp, escapeHtml, wait } from './util.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#gl');

// ------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const DPR = Math.min(devicePixelRatio, innerWidth < 820 ? 1.5 : 1.75);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // gallery shadows are static; moments request updates

const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const sound = new Sound();
const cursor = new Cursor();
const IDS = ARTWORKS.map((a) => a.id);
const state = { mode: 'loading', focus: null, current: null, works: loadCollection(IDS), anims: [] };

function animate(obj, key, to, duration, ease = (t) => t * t * (3 - 2 * t)) {
  return new Promise((resolve) => {
    state.anims = state.anims.filter((a) => !(a.obj === obj && a.key === key));
    state.anims.push({ obj, key, from: obj[key], to, t: 0, d: duration, ease, resolve });
  });
}

function toast(main, small = '', ms = 4200) {
  const t = $('#toast');
  t.innerHTML = `${small ? `<small>${escapeHtml(small)}</small>` : ''}${escapeHtml(main)}`;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

const show = (sel, on = true) => $(sel).classList.toggle('show', on);
const yieldTask = () => new Promise((r) => setTimeout(r, 0));

// ------------------------------------------------------------ boot
async function boot() {
  try {
    await Promise.race([
      Promise.all(['400 54px "Instrument Serif"', 'italic 400 24px "Instrument Serif"',
        '300 20px Matter', '400 20px Matter', '500 20px Matter',
        '500 20px Inter', '400 20px Inter'].map((f) => document.fonts.load(f))),
      wait(3500),
    ]);
  } catch { /* fall back to system serif */ }

  const list = $('#load-list');
  list.innerHTML = ARTWORKS.map((d) => `<li><span>${d.number} · ${d.title}</span><em>Waiting</em></li>`).join('');

  const museum = buildMuseum();
  museum.scene.environment = envTex;
  museum.scene.environmentIntensity = 0.42;
  const galleryCam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 160);
  const walker = new Walker(galleryCam, canvas);
  walker.colliders = museum.colliders;
  const post = createPost(renderer, museum.scene, galleryCam);
  post.setSize(innerWidth, innerHeight, DPR);

  // Pre-compile shaders in the variant actually used: the composer renders into a target.
  function warm(scene, cam) {
    renderer.setRenderTarget(post.composer.renderTarget1);
    const p = renderer.compileAsync(scene, cam).catch(() => {});
    renderer.setRenderTarget(null);
    return p;
  }
  await warm(museum.scene, galleryCam);

  const sims = {};

  // Each work is performed once at load: the museum's own record of the event.
  // The gallery shows its instant; entering rewinds it to before it happened.
  dropSeededWorks();

  async function conserve() {
    const enterBtn = $('#btn-enter');
    for (let i = 0; i < ARTWORKS.length; i++) {
      const def = ARTWORKS[i];
      enterBtn.textContent = `Conserving the collection · ${i + 1} / ${ARTWORKS.length}`;
      list.children[i].querySelector('em').textContent = 'Conserving';
      const sim = new ImpactSimulation(def);
      sim.scene.environment = envTex;
      sim.scene.environmentIntensity = 0.35;
      const compiled = warm(sim.scene, sim.camera);
      def.canonical(sim);
      sim.startRecording();
      let last = performance.now();
      // only as far as the instant the gallery shows (plus a breath): that is all the rewind needs
      const enough = () => sim.recording.impactTime != null && sim.time > sim.recording.impactTime + def.heroOffset + 0.25;
      while (sim.time < def.canonicalDuration && !enough()) {
        sim.advance(1 / 60);
        if (performance.now() - last > 28) { await yieldTask(); last = performance.now(); }
      }
      sim.canonical = sim.recording;
      sim.heroTime = (sim.canonical.impactTime ?? 0.3) + def.heroOffset;
      sim.canonicalExtra = { bursts: sim.particles.serialize(), splash: sim.ctx.splash?.serialize() ?? null };
      sim.reset();
      await compiled;
      sims[def.id] = sim;
      const display = createDisplay(sim, { scenery: true });
      display.load(sim.canonicalExtra);
      display.update(sim.heroTime, sim.canonical);
      museum.addInstallation(def, display);
      rebuildHotspots();
      list.children[i].classList.add('done');
      list.children[i].querySelector('em').textContent = 'Ready';
      await yieldTask();
    }
    refreshAcquisitions();
    await warm(museum.scene, galleryCam);
  }

  /**
   * The wing was briefly seeded with four works of the museum's own. They are no
   * longer wanted, so any browser that already took them has them removed once.
   * Matched on their exact signature, never on count, so anything a visitor
   * actually preserved alongside them survives.
   */
  function dropSeededWorks() {
    if (!localStorage.getItem('museum-of-impact.seeded')) return;
    const seeded = [
      ['Forty Milliseconds', 'R. Alvarez', 'shatter'],
      ['The Crown', 'Mei Lin', 'splash'],
      ['Sixteen Stones, Disagreeing', 'J. Okonkwo', 'collapse'],
      ['Winter, Interrupted', 'a visitor', 'break'],
    ];
    const keep = state.works.filter((w) => !seeded.some(([t, c, src]) => w.title === t && w.creator === c && w.sourceArtwork === src));
    if (keep.length !== state.works.length) state.works = saveCollection(keep);
    try { localStorage.removeItem('museum-of-impact.seeded'); } catch { /* private window */ }
  }

  function makeDisplay(work) {
    const sim = sims[work.sourceArtwork];
    if (!sim) return null;
    const d = createDisplay(sim, { scenery: false });
    d.apply(work.state);
    d.load(work.extra);
    d.update(work.extra?.t ?? 0, null);
    return d;
  }

  function refreshAcquisitions() {
    museum.setAcquisitions(state.works, makeDisplay);
    rebuildHotspots();
    $('#count').textContent = `(${ARTWORKS.length + state.works.length})`;
  }

  // ------------------------------------------------------------ viewer
  const viewer = new Viewer({
    renderer, post, sound, cursor,
    onExit: (r) => exitMoment(r),
    onPreserve: (data) => {
      const work = { id: newId(), date: Date.now(), ...data };
      state.works.push(work);
      state.works = saveCollection(state.works);
      $('#role').textContent = 'You are an artist now.';
      return work;
    },
    nextNumber: () => nextNumber(state.works),
  });

  // ------------------------------------------------------------ hotspots
  const hotRoot = $('#hotspots');
  function titleOf(a) { return a.kind === 'moment' ? a.def.title : a.work.title; }
  function rebuildHotspots() {
    hotRoot.innerHTML = '';
    for (const a of museum.artworks) {
      const el = document.createElement('button');
      el.className = 'hotspot';
      el.setAttribute('aria-label', `Approach ${titleOf(a)}`);
      el.innerHTML = `<span><small>${a.kind === 'moment' ? a.def.number : 'NEW'}</small>${escapeHtml(titleOf(a))}</span>`;
      el.addEventListener('click', () => approach(a));
      a.el = el;
      hotRoot.appendChild(el);
    }
  }

  const v3 = new THREE.Vector3();
  function updateHotspots() {
    for (const a of museum.artworks) {
      if (!a.el) continue;
      v3.copy(a.hotspot).project(galleryCam);
      const dist = galleryCam.position.distanceTo(a.hotspot);
      const visible = v3.z < 1 && Math.abs(v3.x) < 1.1 && Math.abs(v3.y) < 1.1 && dist < 22 && dist > 3.2 && state.mode === 'gallery' && state.focus !== a;
      a.el.style.opacity = visible ? clamp(1.2 - dist / 20, 0.2, 0.85) : 0;
      a.el.style.pointerEvents = visible ? 'auto' : 'none';
      if (visible) a.el.style.transform = `translate(${((v3.x + 1) / 2) * innerWidth}px, ${((1 - v3.y) / 2) * innerHeight}px)`;
      a.el.classList.toggle('near', dist < 8);
    }
  }

  // ------------------------------------------------------------ focus / plaque
  const fwd = new THREE.Vector3();
  function updateFocus() {
    let best = null, bestScore = Infinity;
    galleryCam.getWorldDirection(fwd);
    for (const a of museum.artworks) {
      const to = a.center.clone().sub(galleryCam.position);
      const d = to.length();
      const ang = fwd.angleTo(to.normalize());
      if (d < 5 && ang < 0.5) {
        const s = d + ang * 6;
        if (s < bestScore) { bestScore = s; best = a; }
      }
    }
    if (best !== state.focus) setFocus(best);
  }

  function setFocus(a) {
    state.focus = a;
    show('#placard', !!a);
    if (!a) return;
    if (a.kind === 'moment') {
      const d = a.def;
      $('#pl-count').textContent = d.number;
      $('#pl-eyebrow').textContent = 'Permanent collection';
      $('#pl-title').textContent = d.title;
      $('#pl-medium').textContent = `${d.material} · ${d.year}`;
      $('#pl-text').textContent = d.text;
      $('#btn-moment').querySelector('span').textContent = 'Enter the moment';
    } else {
      const w = a.work;
      $('#pl-count').textContent = w.number;
      $('#pl-eyebrow').textContent = 'New acquisition';
      $('#pl-title').textContent = w.title;
      $('#pl-medium').textContent = `After ${sims[w.sourceArtwork]?.def.title} · ${w.creator ? w.creator : 'a visitor'}, ${new Date(w.date).getFullYear()}`;
      $('#pl-text').textContent = w.note ? `“${w.note}”` : '';
      $('#btn-moment').querySelector('span').textContent = 'Experience this moment';
    }
  }
  $('#btn-moment').addEventListener('click', () => state.focus && enter(state.focus));

  // ------------------------------------------------------------ walking
  function approach(a, duration) {
    if (state.mode !== 'gallery') return;
    const d = duration ?? clamp(galleryCam.position.distanceTo(a.viewPos) / 2.2, 1.4, 4.4);
    // leave room on the right for the plaque on wide screens
    walker.goTo(a.viewPos, a.viewYaw - (innerWidth > 820 ? 0.2 : 0), a.viewPitch, d);
    hideHint();
  }

  const raycaster = new THREE.Raycaster();
  walker.onTap = (ndc) => {
    if (state.mode !== 'gallery') return;
    raycaster.setFromCamera(ndc, galleryCam);
    const hit = raycaster.intersectObjects(museum.hitTargets(), false)[0];
    if (!hit) return;
    const a = hit.object.userData.artwork;
    if (a) {
      if (galleryCam.position.distanceTo(a.viewPos) < 0.9 && state.focus === a) enter(a);
      else approach(a);
      return;
    }
    if (hit.object.userData.floor) {
      const p = hit.point.clone();
      p.y = 1.65;
      const dir = p.clone().sub(walker.pos);
      const len = dir.length();
      if (len < 0.3) return;
      const stop = walker.pos.clone().addScaledVector(dir.normalize(), Math.max(0, len - 0.4));
      walker.goTo(stop, walker.yaw, walker.pitch * 0.5, clamp(len / 1.8, 0.8, 4));
      hideHint();
    }
  };
  // the cursor knows when it rests on a work
  let hoverCheck = 0;
  canvas.addEventListener('pointermove', (e) => {
    if (state.mode !== 'gallery' || performance.now() - hoverCheck < 60) return;
    hoverCheck = performance.now();
    raycaster.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), galleryCam);
    const hit = raycaster.intersectObjects(museum.hitTargets(), false)[0];
    cursor.set(hit?.object.userData.artwork ? 'ring' : 'default');
  });

  let hintTimer;
  function hideHint() {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => $('#hint').classList.add('gone'), 3000);
  }
  // the keys stay on the wall, but they step back once the visitor is walking
  const gKeys = $('#g-keys');
  let keysTimer;
  function restKeys() {
    gKeys.classList.remove('dim');
    clearTimeout(keysTimer);
    keysTimer = setTimeout(() => gKeys.classList.add('dim'), 9000);
  }
  for (const ev of ['pointermove', 'pointerdown', 'wheel']) addEventListener(ev, restKeys, { passive: true });
  addEventListener('keydown', restKeys);
  restKeys();

  // ------------------------------------------------------------ transitions
  async function enter(a) {
    if (state.mode !== 'gallery') return;
    state.mode = 'transition';
    state.current = a;
    walker.enabled = false;
    show('#hud', false);
    setFocus(null);
    cursor.set('default');
    const close = a.center.clone().addScaledVector(a.normal, Math.max(1.6, (a.viewDist ?? 3.4) * 0.62));
    close.y = 1.35;
    walker.goTo(close, a.viewYaw, 0.05, 1.7);
    animate(galleryCam, 'fov', 36, 1.7);
    sound.setScene('moment');
    await wait(700);
    await animate(post.u.uFade, 'value', 1, 1.0);
    const sim = a.kind === 'moment' ? sims[a.id] : sims[a.work.sourceArtwork];
    state.mode = 'moment';
    viewer.open(sim, { work: a.kind === 'acquisition' ? a.work : null });
    post.use(sim.scene, sim.camera);
    animate(post.u.uFade, 'value', 0, 1.4);
  }

  async function exitMoment({ acquired } = {}) {
    if (state.mode !== 'moment') return;
    state.mode = 'transition';
    await animate(post.u.uFade, 'value', 1, 0.9);
    viewer.close();
    post.u.uAberr.value = 0;
    post.u.uGrain.value = 0.045;
    galleryCam.fov = 55;
    galleryCam.updateProjectionMatrix();
    let a = state.current;
    if (acquired) {
      refreshAcquisitions();
      a = museum.artworks.find((x) => x.kind === 'acquisition' && x.work.id === acquired.id) || a;
    } else if (a?.kind === 'acquisition') {
      a = museum.artworks.find((x) => x.kind === 'acquisition' && x.work.id === a.work.id) || a;
    }
    if (a) walker.set(a.viewPos.clone().addScaledVector(a.normal, acquired ? 2.2 : 0.6), a.viewYaw, a.viewPitch);
    post.use(museum.scene, galleryCam);
    state.mode = 'gallery';
    walker.enabled = true;
    show('#hud', true);
    sound.setScene('museum');
    renderer.shadowMap.needsUpdate = true;
    shadowFrames = 2;
    if (a) walker.goTo(a.viewPos, a.viewYaw - (innerWidth > 820 ? 0.2 : 0), a.viewPitch, acquired ? 4.5 : 2.2);
    if (acquired) {
      const light = museum.spotlightWork(acquired.id);
      if (light) animate(light, 'intensity', 70, 4);
      setTimeout(() => toast(acquired.title, `New acquisition · Impact No. ${acquired.number}`, 5200), 1800);
    }
    await animate(post.u.uFade, 'value', 0, 1.8);
  }

  /** Enter a work the wing has no room for: no approach, just the moment itself. */
  async function enterStored(work) {
    if (state.mode !== 'gallery') return;
    const sim = sims[work.sourceArtwork];
    if (!sim) return;
    state.mode = 'transition';
    state.current = null;
    walker.enabled = false;
    show('#hud', false);
    setFocus(null);
    cursor.set('default');
    sound.setScene('moment');
    await animate(post.u.uFade, 'value', 1, 1.0);
    state.mode = 'moment';
    viewer.open(sim, { work });
    post.use(sim.scene, sim.camera);
    animate(post.u.uFade, 'value', 0, 1.4);
  }

  // ------------------------------------------------------------ catalogue
  function openIndex() {
    const perm = ARTWORKS.map((d) => ({ n: d.number, t: d.title, d: `${d.material} · ${d.year}`, a: museum.artworks.find((x) => x.id === d.id) }));
    const acq = state.works.slice().reverse().map((w) => ({ n: w.number, t: w.title, w: w.id, d: `${w.creator ? 'Created by ' + w.creator : 'Created by a visitor'} · after ${sims[w.sourceArtwork]?.def.title ?? ''}`, a: museum.artworks.find((x) => x.kind === 'acquisition' && x.work.id === w.id) }));
    const row = (r) => `<li data-id="${r.a ? museum.artworks.indexOf(r.a) : -1}"${r.w ? ` data-work="${escapeHtml(r.w)}"` : ''}><span class="n">${r.n}</span><span class="t">${escapeHtml(r.t)}</span><span class="d">${escapeHtml(r.d)}</span><span class="g">${r.a ? 'Walk to it →' : 'In storage · view →'}</span></li>`;
    const onView = acq.filter((r) => r.a).length;
    const note = acq.length > onView
      ? `${acq.length} preserved · the ${onView} most recent are on view, the rest are in storage and can be opened from here`
      : 'Preserved by visitors';
    const html = `<li class="sect"><span class="eyebrow">Permanent collection</span></li>${perm.map(row).join('')}<li class="sect"><span class="eyebrow">New acquisitions</span><span class="d">${escapeHtml(note)}</span></li>${acq.length ? acq.map(row).join('') : '<li class="sect"><span class="d">None yet. The first could be yours.</span></li>'}`;
    $('#ix-list').innerHTML = html;
    show('#index', true);
  }
  $('#btn-index').addEventListener('click', openIndex);
  $('#ix-close').addEventListener('click', () => show('#index', false));
  $('#ix-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const a = museum.artworks[+li.dataset.id];
    if (a) { show('#index', false); approach(a); return; }
    // in storage: there is no dais to walk to, so go straight into the moment
    const work = state.works.find((w) => w.id === li.dataset.work);
    if (!work) return;
    show('#index', false);
    enterStored(work);
  });

  $('#btn-sound').addEventListener('click', (e) => {
    sound.setMuted(!sound.muted);
    e.currentTarget.textContent = sound.muted ? 'Sound off' : 'Sound on';
  });

  // ------------------------------------------------------------ intro
  walker.set(new THREE.Vector3(0, 1.75, 4.6), 0, -0.02);
  post.u.uFade.value = 1;
  state.mode = 'intro';
  show('#loader', false);
  show('#intro', true);
  animate(post.u.uFade, 'value', 0.15, 2.5);
  const enterBtn = $('#btn-enter');
  enterBtn.disabled = true;
  conserve().then(() => {
    $('#intro-acq').textContent = state.works.length ? `and ${state.works.length} visitor acquisition${state.works.length > 1 ? 's' : ''}` : 'and an empty visitors’ wing';
    enterBtn.disabled = false;
    enterBtn.textContent = 'Enter as an observer';
    enterBtn.classList.add('ready');
  }).catch((e) => {
    console.error(e);
    enterBtn.textContent = 'The collection could not be prepared';
  });

  async function admit() {
    if (state.mode !== 'intro' || enterBtn.disabled) return;
    sound.start();
    show('#intro', false);
    animate(post.u.uFade, 'value', 0, 2.0);
    walker.goTo(new THREE.Vector3(0, 1.65, 1.2), 0, 0.03, 3.6);
    await wait(2000);
    state.mode = 'gallery';
    walker.enabled = true;
    show('#hud', true);
  }
  enterBtn.addEventListener('click', admit);

  // Enter walks you in from the threshold, and into whatever work you are standing before
  addEventListener('keydown', (e) => {
    if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
    if (e.target.closest?.('input, textarea')) return;
    if (document.querySelector('#index').classList.contains('show')) return;
    if (state.mode === 'intro') { e.preventDefault(); admit(); }
    else if (state.mode === 'gallery' && state.focus) { e.preventDefault(); enter(state.focus); }
  });

  // automated tests drive real pointer input; this only exposes where things are
  if (new URLSearchParams(location.search).has('debug')) {
    window.__moi = {
      state, viewer, sims, museum,
      screenOf(v) { const p = v.clone().project(state.mode === 'moment' ? viewer.sim.camera : galleryCam); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; },
      grabPoint() { const g = viewer.sim.grabbables.find((x) => x.kind === 'prop' || !x.breakable.broken); const m = g.meshes[0]; const t = m.children.length ? m.children[1] : m; return this.screenOf(t.getWorldPosition(new THREE.Vector3())); },
      approach(i) { approach(museum.artworks[i]); },
      dropTarget() { const t = viewer.sim.def.testTarget; return t ? this.screenOf(new THREE.Vector3(t[0], viewer.holdAnchor?.y ?? 1, t[2])) : null; },
      raise(dy) { viewer.holdAnchor.y = Math.min(2.6, viewer.holdAnchor.y + dy); viewer.updateHoldPlane(); viewer.holding.last.copy(viewer.holdAnchor); viewer.sim.moveHold(viewer.holdAnchor); },
      enter(i) { enter(museum.artworks[i]); },
    };
  }

  // ------------------------------------------------------------ loop
  addEventListener('resize', () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h);
    post.setSize(w, h, DPR);
    galleryCam.aspect = w / h;
    galleryCam.updateProjectionMatrix();
    viewer.resize();
  });

  const clock = new THREE.Clock();
  let frameNo = 0;
  let shadowFrames = 3;
  let grainTime = 0;
  renderer.setAnimationLoop(() => {
    // While the works are being conserved the intro holds its last frame: rendering the hall
    // now would compile each new installation's shaders synchronously, one stall at a time.
    if (state.mode === 'intro' && !$('#btn-enter.ready') && !state.anims.length) { clock.getDelta(); return; }
    const dt = Math.min(clock.getDelta(), 1 / 20);
    frameNo++;
    const t = clock.elapsedTime;

    for (const a of state.anims.slice()) {
      a.t += dt;
      const k = clamp(a.t / a.d, 0, 1);
      a.obj[a.key] = a.from + (a.to - a.from) * a.ease(k);
      if (a.obj === galleryCam) galleryCam.updateProjectionMatrix();
      if (k >= 1) { state.anims.splice(state.anims.indexOf(a), 1); a.resolve(); }
    }

    if (state.mode === 'moment') {
      viewer.update(dt);
    } else {
      if (state.mode === 'intro') {
        walker.tYaw = Math.sin(t * 0.08) * 0.05;
        walker.yaw += (walker.tYaw - walker.yaw) * damp(2, dt);
      }
      walker.update(dt);
      museum.update(dt, t);
      // the installations breathe: a few thousandths of a second either side of their instant
      for (const def of ARTWORKS) {
        const inst = museum.installations[def.id];
        const sim = sims[def.id];
        if (!inst || !sim) continue;
        if (galleryCam.position.distanceTo(inst.artwork.center) > 16) continue;
        const amp = def.id === 'collapse' ? 0.03 : def.id === 'splash' ? 0.006 : 0.004;
        inst.display.update(sim.heroTime + Math.sin(t * 0.55 + def.number * 1.7) * amp, sim.canonical);
      }
      if (state.mode === 'gallery') updateFocus();
      updateHotspots();
    }
    if (state.mode === 'moment' || shadowFrames > 0) { renderer.shadowMap.needsUpdate = true; shadowFrames--; }
    // grain advances with real time, except while the world is frozen
    if (!(state.mode === 'moment' && viewer.state === 'frozen')) grainTime = t;
    post.render(grainTime);
  });
}

boot().catch((e) => {
  console.error(e);
  $('#loader .eyebrow').textContent = 'The museum could not open: ' + (e.message || e);
});
