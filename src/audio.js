// Sound. Everything is synthesised once at start-up; nothing is a file.
//
// Impacts: a family of sounds per material, chosen by collision speed, with
// thresholds, cooldowns and slight pitch variation. Time scale stretches and
// softens them (slow motion is heard, not just seen); rewinding plays real
// fragments reversed; freezing silences them so the room itself is heard.
//
// Ambience: room tone, distant footsteps, an almost-subliminal tonal bed and,
// rarely, a single low note in the hall's reverb.
import { mulberry32 } from './util.js';

// collision speed (m/s) at which each tier starts
const TIERS = {
  glass: [[0.28, 'tick'], [0.9, 'clink'], [2.4, 'crack']],
  ceramic: [[0.32, 'tap'], [1.0, 'clack'], [2.6, 'crack']],
  stone: [[0.45, 'knock'], [1.3, 'thud'], [2.6, 'impact']],
  ice: [[0.28, 'tick'], [0.9, 'hit'], [2.2, 'crack']],
  liquid: [[0.0, 'drop']],
  iron: [[0.35, 'clank']],
  bronze: [[0.3, 'clink']],
};
const BREAK = { glass: ['crack', 'shatter'], ceramic: ['crack', 'break'], ice: ['crack', 'break'], liquid: ['splash'], stone: ['impact', 'debris'] };
const GAIN = { tick: 0.22, clink: 0.35, crack: 0.55, shatter: 0.8, tap: 0.25, clack: 0.4, break: 0.85, knock: 0.45, thud: 0.72, impact: 0.95, debris: 0.5, hit: 0.5, drop: 0.16, splash: 0.7, clank: 0.45 };

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lib = {};
    this.active = new Set();
    this.window = [];
    this.lastByKey = {};
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);
    this.verb = ctx.createConvolver();
    this.verb.buffer = this.impulse(3.6, 2.6);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.5;
    this.verb.connect(this.wet).connect(this.master);
    this.fx = ctx.createGain();
    this.fx.connect(this.master);
    const fxSend = ctx.createGain();
    fxSend.gain.value = 0.28;
    this.fx.connect(fxSend).connect(this.verb);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0;
    this.amb.connect(this.master);
    const ambSend = ctx.createGain();
    ambSend.gain.value = 0.9;
    this.amb.connect(ambSend).connect(this.verb);
    this.build();
    this.startAmbience();
    this.setScene('museum');
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.15);
  }

  // ------------------------------------------------------------ synthesis
  buf(seconds, fill) {
    const ctx = this.ctx, sr = ctx.sampleRate;
    const b = ctx.createBuffer(1, Math.max(1, Math.floor(seconds * sr)), sr);
    const d = b.getChannelData(0);
    fill(d, sr);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0) for (let i = 0; i < d.length; i++) d[i] /= peak * 1.05;
    // short fade-in avoids clicks
    for (let i = 0; i < Math.min(64, d.length); i++) d[i] *= i / 64;
    return b;
  }

  impulse(seconds, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += ((Math.random() * 2 - 1) - lp) * 0.55;
        d[i] = lp * Math.pow(1 - i / len, decay) * (i < 400 ? i / 400 : 1);
      }
    }
    return b;
  }

  build() {
    const variants = 3;
    const make = (name, seconds, fn) => Array.from({ length: variants }, (_, v) => this.buf(seconds, (d, sr) => fn(d, sr, mulberry32(name.length * 97 + v * 13 + 1), v)));
    // helpers
    const partial = (d, sr, t0, f, a, decay, glide = 0) => {
      const s0 = Math.floor(t0 * sr);
      let ph = 0;
      for (let i = s0; i < d.length; i++) {
        const t = (i - s0) / sr;
        const env = a * Math.exp(-t * decay);
        if (env < 1e-4) break;
        ph += (2 * Math.PI * f * (1 + glide * t)) / sr;
        d[i] += Math.sin(ph) * env;
      }
    };
    const noise = (d, sr, rng, t0, dur, a, lp = 1, hp = 0) => {
      const s0 = Math.floor(t0 * sr), n = Math.floor(dur * sr);
      let l = 0, prev = 0;
      for (let i = 0; i < n && s0 + i < d.length; i++) {
        const w = rng() * 2 - 1;
        l += (w - l) * lp;
        const h = l - prev * hp;
        prev = l;
        d[s0 + i] += h * a * Math.exp((-i / n) * 5);
      }
    };
    const click = (d, sr, rng, t0, a) => noise(d, sr, rng, t0, 0.003, a, 1, 0.9);
    const scatter = (d, sr, rng, count, span, fn) => { for (let k = 0; k < count; k++) fn(Math.pow(rng(), 1.8) * span, 1 - k / count); };

    this.lib.glass = {
      tick: make('gt', 0.12, (d, sr, r) => { click(d, sr, r, 0, 0.6); for (const f of [4200, 6100, 8300]) partial(d, sr, 0, f * (0.9 + r() * 0.2), 0.3, 70); }),
      clink: make('gc', 0.45, (d, sr, r) => { click(d, sr, r, 0, 0.5); for (const f of [2400, 3900, 5600, 7300]) partial(d, sr, 0, f * (0.92 + r() * 0.16), 0.35, 12 + r() * 10); }),
      crack: make('gk', 0.3, (d, sr, r) => { click(d, sr, r, 0, 1); noise(d, sr, r, 0, 0.05, 0.8, 1, 0.95); for (const f of [5200, 7700, 9800]) partial(d, sr, 0.002, f, 0.25, 35); }),
      shatter: make('gs', 1.4, (d, sr, r) => {
        partial(d, sr, 0, 90, 0.6, 22);
        noise(d, sr, r, 0, 0.35, 0.6, 1, 0.92);
        scatter(d, sr, r, 70, 1.0, (t, w) => { click(d, sr, r, t, 0.3 * w); partial(d, sr, t, 2800 + r() * 6500, 0.18 * w, 25 + r() * 40); });
      }),
    };
    this.lib.ceramic = {
      tap: make('ct', 0.12, (d, sr, r) => { click(d, sr, r, 0, 0.5); for (const f of [1700, 2900]) partial(d, sr, 0, f * (0.9 + r() * 0.2), 0.35, 45); }),
      clack: make('cc', 0.25, (d, sr, r) => { click(d, sr, r, 0, 0.7); noise(d, sr, r, 0, 0.03, 0.4, 0.6); for (const f of [1100, 1900, 3100]) partial(d, sr, 0, f * (0.92 + r() * 0.16), 0.35, 28); }),
      crack: make('ck', 0.25, (d, sr, r) => { click(d, sr, r, 0, 1); noise(d, sr, r, 0, 0.06, 0.9, 0.7, 0.6); partial(d, sr, 0, 2100, 0.3, 40); }),
      break: make('cb', 1.0, (d, sr, r) => {
        partial(d, sr, 0, 130, 0.7, 16);
        noise(d, sr, r, 0, 0.12, 0.6, 0.5);
        scatter(d, sr, r, 30, 0.7, (t, w) => { click(d, sr, r, t, 0.4 * w); partial(d, sr, t, 1000 + r() * 2600, 0.25 * w, 30 + r() * 30); });
      }),
    };
    // Stone used to live almost entirely below 120 Hz, where a laptop speaker
    // cannot follow it. Each tier now carries a mid transient as well as the body.
    this.lib.stone = {
      knock: make('sk', 0.25, (d, sr, r) => {
        click(d, sr, r, 0, 0.7);
        noise(d, sr, r, 0, 0.035, 0.6, 0.35, 0.3);
        for (const f of [340, 520, 910, 1480, 2260]) partial(d, sr, 0, f * (0.9 + r() * 0.2), 0.3, 38);
      }),
      thud: make('sh', 0.6, (d, sr, r) => {
        click(d, sr, r, 0, 0.8);
        partial(d, sr, 0, 62 + r() * 10, 1, 9);
        partial(d, sr, 0, 112, 0.5, 14);
        for (const f of [430, 780, 1320]) partial(d, sr, 0, f * (0.92 + r() * 0.16), 0.4, 26);
        noise(d, sr, r, 0, 0.14, 0.7, 0.3, 0.35);
      }),
      impact: make('si', 1.1, (d, sr, r) => {
        click(d, sr, r, 0, 1);
        partial(d, sr, 0, 52, 1, 6);
        partial(d, sr, 0, 96, 0.6, 9);
        for (const f of [380, 690, 1150, 1830]) partial(d, sr, 0, f * (0.9 + r() * 0.2), 0.5, 15 + r() * 10);
        noise(d, sr, r, 0, 0.45, 0.8, 0.05);
        noise(d, sr, r, 0, 0.09, 0.9, 0.5, 0.45); // the crack of the two faces meeting
        noise(d, sr, r, 0.01, 0.25, 0.5, 0.4);
      }),
      debris: make('sd', 1.2, (d, sr, r) => {
        scatter(d, sr, r, 60, 1.0, (t, w) => { noise(d, sr, r, t, 0.012, 0.55 * w, 0.45, 0.3); partial(d, sr, t, 700 + r() * 1600, 0.12 * w, 40 + r() * 40); });
      }),
    };
    this.lib.ice = {
      tick: make('it', 0.12, (d, sr, r) => { click(d, sr, r, 0, 0.5); for (const f of [3200, 5100]) partial(d, sr, 0, f * (0.9 + r() * 0.2), 0.3, 55); noise(d, sr, r, 0, 0.01, 0.2, 1, 0.8); }),
      hit: make('ih', 0.35, (d, sr, r) => { partial(d, sr, 0, 180, 0.7, 20); click(d, sr, r, 0, 0.8); partial(d, sr, 0, 2400, 0.3, 30); }),
      crack: make('ik', 0.5, (d, sr, r) => { click(d, sr, r, 0, 1); for (const f of [2900, 4700, 7600]) partial(d, sr, 0.001, f, 0.3, 20, -0.25); noise(d, sr, r, 0, 0.03, 0.6, 1, 0.95); }),
      break: make('ib', 1.2, (d, sr, r) => {
        partial(d, sr, 0, 150, 0.6, 14);
        scatter(d, sr, r, 50, 0.9, (t, w) => { click(d, sr, r, t, 0.3 * w); partial(d, sr, t, 2600 + r() * 5000, 0.2 * w, 30 + r() * 30); });
      }),
    };
    this.lib.liquid = {
      drop: make('ld', 0.12, (d, sr, r) => { partial(d, sr, 0, 520 + r() * 300, 0.5, 40, 6); }),
      splash: make('ls', 1.3, (d, sr, r) => {
        partial(d, sr, 0, 70, 0.6, 12);
        noise(d, sr, r, 0, 0.5, 0.8, 0.25, 0.3);
        scatter(d, sr, r, 16, 0.9, (t, w) => partial(d, sr, t, 400 + r() * 900, 0.3 * w, 30, 5));
      }),
    };
    this.lib.iron = { clank: make('fc', 0.8, (d, sr, r) => { click(d, sr, r, 0, 0.7); for (const f of [520, 1340, 2210, 3400]) partial(d, sr, 0, f * (0.95 + r() * 0.1), 0.3, 9 + r() * 5); }) };
    this.lib.bronze = { clink: make('bc', 0.9, (d, sr, r) => { click(d, sr, r, 0, 0.5); for (const f of [880, 2350, 4100]) partial(d, sr, 0, f * (0.95 + r() * 0.1), 0.3, 7 + r() * 4); }) };
    // footsteps and a single soft note, for the hall
    this.lib.step = make('fs', 0.25, (d, sr, r) => { noise(d, sr, r, 0, 0.02, 0.8, 0.25); partial(d, sr, 0, 90, 0.4, 40); });
  }

  reversed(b) {
    if (b._rev) return b._rev;
    const r = this.ctx.createBuffer(1, b.length, b.sampleRate);
    const s = b.getChannelData(0), d = r.getChannelData(0);
    for (let i = 0; i < s.length; i++) d[i] = s[s.length - 1 - i];
    b._rev = r;
    return r;
  }

  play(buffer, { gain = 0.5, rate = 1, pan = 0, reverse = false, bus = this.fx } = {}) {
    if (!this.ctx || !buffer) return;
    const now = this.ctx.currentTime;
    // never more than ~12 voices per 100ms: quiet the pile-up instead of clipping
    this.window = this.window.filter((t) => now - t < 0.1);
    if (this.window.length > 12) return;
    this.window.push(now);
    const src = this.ctx.createBufferSource();
    src.buffer = reverse ? this.reversed(buffer) : buffer;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    let node = src.connect(g);
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
    node.connect(bus);
    src.start();
    const rec = { src, g };
    this.active.add(rec);
    src.onended = () => this.active.delete(rec);
  }

  /** A collision. v = impact speed; speed = current time scale (1 = real time). */
  hit(material, v, { speed = 1, reverse = false, pan = 0 } = {}) {
    const tiers = TIERS[material];
    const lib = this.lib[material];
    if (!tiers || !lib) return;
    let tier = null;
    for (const [th, name] of tiers) if (v >= th) tier = name;
    if (!tier) return;
    const key = material + tier;
    const now = this.ctx?.currentTime ?? 0;
    if (now - (this.lastByKey[key] || 0) < (tier === 'tick' || tier === 'tap' || tier === 'drop' ? 0.03 : 0.015)) return;
    this.lastByKey[key] = now;
    const list = lib[tier];
    const b = list[(Math.random() * list.length) | 0];
    const loud = Math.min(1, 0.35 + v / 4);
    this.play(b, {
      gain: GAIN[tier] * loud * this.slowGain(speed) * (reverse ? 0.35 : 1),
      rate: this.rate(speed),
      pan,
      reverse,
    });
  }

  /** The defining sound of the work: crack + shatter, splash, stone impact. */
  breakSound(material, v, { speed = 1, reverse = false } = {}) {
    const names = BREAK[material];
    const lib = this.lib[material];
    if (!names || !lib) return this.hit(material, v, { speed, reverse });
    for (const n of names) {
      const list = lib[n];
      if (!list) continue;
      this.play(list[(Math.random() * list.length) | 0], { gain: GAIN[n] * Math.min(1, 0.55 + v / 6) * this.slowGain(speed) * (reverse ? 0.4 : 1), rate: this.rate(speed), reverse });
    }
  }

  rate(speed) { return Math.max(0.06, Math.min(1, speed)) * (0.94 + Math.random() * 0.12); }
  slowGain(speed) { return 0.3 + 0.7 * Math.sqrt(Math.max(0.0, Math.min(1, speed))); }

  /** Time stopped: everything in flight goes quiet at once. */
  silence(fade = 0.18) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const { src, g } of this.active) {
      g.gain.cancelScheduledValues(now);
      g.gain.setTargetAtTime(0, now, fade / 3);
      try { src.stop(now + fade * 2); } catch { /* already stopped */ }
    }
    this.active.clear();
  }

  // ------------------------------------------------------------ ambience
  startAmbience() {
    const ctx = this.ctx;
    // room tone
    const n = ctx.createBufferSource();
    n.buffer = this.buf(6, (d) => { let l = 0; for (let i = 0; i < d.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = l; } });
    n.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 280;
    this.room = ctx.createGain();
    this.room.gain.value = 0.05;
    n.connect(lp).connect(this.room).connect(this.amb);
    n.start();
    // a tonal bed you feel more than hear
    this.pad = ctx.createGain();
    this.pad.gain.value = 0.0;
    const padLp = ctx.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 700;
    this.pad.connect(padLp).connect(this.amb);
    for (const [f, a] of [[110, 1], [164.8, 0.7], [246.9, 0.35], [329.6, 0.18]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = ctx.createGain();
      g.gain.value = 0.012 * a;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.03 + Math.random() * 0.05;
      const lg = ctx.createGain();
      lg.gain.value = 0.008 * a;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(this.pad);
      o.start();
      lfo.start();
    }
    this.scheduleFootsteps();
    this.scheduleNote();
  }

  scheduleFootsteps() {
    const next = 7000 + Math.random() * 11000;
    setTimeout(() => {
      if (this.ctx && this.footsteps) {
        const steps = 4 + ((Math.random() * 6) | 0);
        const pan = (Math.random() - 0.5) * 1.4;
        const base = 0.02 + Math.random() * 0.02;
        for (let k = 0; k < steps; k++) {
          setTimeout(() => {
            const b = this.lib.step[(Math.random() * this.lib.step.length) | 0];
            this.play(b, { gain: base * (1 - Math.abs(k - steps / 2) / steps), rate: 0.9 + Math.random() * 0.15, pan, bus: this.amb });
          }, k * (520 + Math.random() * 80));
        }
      }
      this.scheduleFootsteps();
    }, next);
  }

  scheduleNote() {
    const next = 28000 + Math.random() * 30000;
    setTimeout(() => {
      if (this.ctx && this.notes) this.note([196, 220, 261.6, 293.7, 329.6][(Math.random() * 5) | 0], 0.018);
      this.scheduleNote();
    }, next);
  }

  note(f, amp = 0.02, decay = 4.5) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    for (const [m, a] of [[1, 1], [2.01, 0.3], [3.02, 0.12]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * m;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(amp * a, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay / m);
      o.connect(g).connect(this.amb);
      o.start(now);
      o.stop(now + decay + 0.2);
    }
  }

  /** museum | moment | frozen | ceremony — the room's presence in each state. */
  setScene(scene) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const s = {
      museum: { amb: 1, room: 0.05, pad: 1, fx: 1, steps: true, notes: true, tc: 1.6 },
      moment: { amb: 0.35, room: 0.035, pad: 0.15, fx: 1, steps: false, notes: false, tc: 1.2 },
      frozen: { amb: 1, room: 0.06, pad: 0.25, fx: 1, steps: true, notes: false, tc: 0.5 },
      ceremony: { amb: 1, room: 0.05, pad: 1.4, fx: 1, steps: false, notes: true, tc: 1.8 },
    }[scene];
    this.amb.gain.setTargetAtTime(s.amb, now, s.tc);
    this.room.gain.setTargetAtTime(s.room, now, s.tc);
    this.pad.gain.setTargetAtTime(s.pad, now, s.tc * 1.5);
    this.footsteps = s.steps;
    this.notes = s.notes;
  }
}
