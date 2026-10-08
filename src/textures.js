// Procedural canvas textures. Every surface in the museum is painted here,
// so the project ships with no image assets at all.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

const memo = new Map();
/** Painting a texture is expensive; identical requests share one. */
function cached(name, fn) {
  return (...args) => {
    const key = name + JSON.stringify(args);
    if (!memo.has(key)) memo.set(key, fn(...args));
    return memo.get(key);
  };
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(ctx, w, h, n, rng, alpha, colors, size = 2) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rng() * colors.length) | 0];
    ctx.globalAlpha = alpha * rng();
    const s = size * (0.4 + rng());
    ctx.fillRect(rng() * w, rng() * h, s, s);
  }
  ctx.globalAlpha = 1;
}

/** Chevron oak parquet ("point de Hongrie"), tiles seamlessly. */
export function parquet() {
  const S = 1024;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(11);
  ctx.fillStyle = '#3a2414';
  ctx.fillRect(0, 0, S, S);
  const cols = 4, cw = S / cols, half = cw / 2, rowH = 64;
  const tones = ['#7a4d2b', '#6b4224', '#835532', '#5f3a20', '#8c5c36', '#734a2a', '#946340'];
  const plank = (pts, dir) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = tones[(rng() * tones.length) | 0];
    ctx.fill();
    ctx.clip();
    ctx.globalAlpha = 0.16;
    const [x0, y0] = pts[0];
    for (let i = 0; i < 10; i++) {
      ctx.strokeStyle = rng() > 0.5 ? '#2a170a' : '#b07a4c';
      ctx.lineWidth = 0.7 + rng() * 1.2;
      const off = rng() * rowH;
      ctx.beginPath();
      ctx.moveTo(x0 - 4, y0 + off);
      ctx.lineTo(x0 + half + 4, y0 + off + dir * (half + 4));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(x0, y0, x0 + half, y0);
    g.addColorStop(0, 'rgba(255,220,170,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(18,9,3,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.stroke();
  };
  for (let col = 0; col < cols; col++) {
    const x = col * cw;
    for (let y = -cw; y < S + cw; y += rowH) {
      plank([[x, y], [x + half, y - half], [x + half, y - half + rowH], [x, y + rowH]], -1);
      plank([[x + half, y - half], [x + cw, y], [x + cw, y + rowH], [x + half, y - half + rowH]], 1);
    }
  }
  speckle(ctx, S, S, 6000, rng, 0.15, ['#1d0f06', '#b07a4c'], 2);
  return toTexture(c, { repeat: [4, 17] });
}

/** Warm limestone plaster for the upper walls. */
export function plaster(base = '#b9a587') {
  const S = 512;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(7);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const r = 20 + rng() * 90;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    const light = rng() > 0.5;
    g.addColorStop(0, light ? 'rgba(235,220,195,0.10)' : 'rgba(90,70,45,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      ctx.save();
      ctx.translate(rng() * 0 + (i * 97.3) % S + dx, (i * 53.1 + rng() * 40) % S + dy);
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    }
  }
  speckle(ctx, S, S, 9000, rng, 0.12, ['#6e5a40', '#e8dcc5'], 1.5);
  return toTexture(c);
}

/** Lower-wall wainscot with raised panel mouldings (one panel per tile). */
export function wainscot() {
  const W = 512, H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#8f7a5c';
  ctx.fillRect(0, 0, W, H);
  const m = 34;
  // panel shadow and highlight bevels
  ctx.strokeStyle = 'rgba(40,28,15,0.65)';
  ctx.lineWidth = 6;
  ctx.strokeRect(m + 3, m + 3, W - 2 * m, H - 2 * m);
  ctx.strokeStyle = 'rgba(232,214,182,0.55)';
  ctx.lineWidth = 4;
  ctx.strokeRect(m - 2, m - 2, W - 2 * m, H - 2 * m);
  ctx.strokeStyle = 'rgba(60,44,26,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(m + 14, m + 14, W - 2 * m - 28, H - 2 * m - 28);
  ctx.strokeStyle = 'rgba(232,214,182,0.35)';
  ctx.strokeRect(m + 12, m + 12, W - 2 * m - 28, H - 2 * m - 28);
  const rng = mulberry32(3);
  speckle(ctx, W, H, 3000, rng, 0.12, ['#4c3b26', '#d4c09e'], 1.5);
  // skirting band
  const g = ctx.createLinearGradient(0, H - 18, 0, H);
  g.addColorStop(0, '#5a4630');
  g.addColorStop(1, '#2c2015');
  ctx.fillStyle = g;
  ctx.fillRect(0, H - 18, W, 18);
  return toTexture(c);
}

/** Coffered vault panel with a gilded rosette. Returns colour + bump. */
export function coffer() {
  const S = 256;
  const [c, ctx] = canvas(S);
  const [b, bx] = canvas(S);
  ctx.fillStyle = '#9b8566';
  ctx.fillRect(0, 0, S, S);
  bx.fillStyle = '#ffffff';
  bx.fillRect(0, 0, S, S);
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const inset = 18 + i * 12;
    const shade = 140 - i * 18;
    ctx.fillStyle = `rgb(${shade + 20},${shade + 4},${shade - 22})`;
    ctx.fillRect(inset, inset, S - inset * 2, S - inset * 2);
    const v = 235 - i * 40;
    bx.fillStyle = `rgb(${v},${v},${v})`;
    bx.fillRect(inset, inset, S - inset * 2, S - inset * 2);
  }
  // deep field
  ctx.fillStyle = '#4a3a29';
  ctx.fillRect(78, 78, S - 156, S - 156);
  // rosette
  ctx.save();
  ctx.translate(S / 2, S / 2);
  for (let k = 0; k < 12; k++) {
    ctx.rotate(Math.PI / 6);
    ctx.fillStyle = '#c9a25a';
    ctx.beginPath();
    ctx.ellipse(0, 14, 5, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e1bf73';
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  bx.save();
  bx.translate(S / 2, S / 2);
  bx.fillStyle = '#d8d8d8';
  bx.beginPath();
  bx.arc(0, 0, 30, 0, Math.PI * 2);
  bx.fill();
  bx.restore();
  const rng = mulberry32(5);
  speckle(ctx, S, S, 2500, rng, 0.2, ['#3a2b1c', '#d9c49c'], 1.5);
  return { map: toTexture(c), bump: toTexture(b, { srgb: false }) };
}

/** Grey-green runner carpet with terracotta borders (cf. Uffizi corridor). */
export function runner() {
  const W = 256, H = 512;
  const [c, ctx] = canvas(W, H);
  const rng = mulberry32(9);
  ctx.fillStyle = '#4c5250';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#9c5a34';
  ctx.fillRect(0, 0, 18, H);
  ctx.fillRect(W - 18, 0, 18, H);
  ctx.fillStyle = '#d29a63';
  ctx.fillRect(20, 0, 3, H);
  ctx.fillRect(W - 23, 0, 3, H);
  speckle(ctx, W, H, 14000, rng, 0.25, ['#2d3231', '#6d7472', '#3d4341'], 1.5);
  return toTexture(c, { repeat: [1, 30] });
}

/** Polished marble with soft veins. */
export const marble = cached('marble', function marble({ base = '#e9e4da', vein = 'rgba(90,82,74,', seed = 21, size = 1024 } = {}) {
  const S = size;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const r = 60 + rng() * 260;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, rng() > 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(150,140,128,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(rng() * S, rng() * S);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
  ctx.filter = 'blur(1.2px)';
  for (let i = 0; i < 26; i++) {
    let x = rng() * S, y = rng() * S;
    let ang = rng() * Math.PI * 2;
    ctx.strokeStyle = vein + (0.12 + rng() * 0.35) + ')';
    ctx.lineWidth = 0.6 + rng() * 2.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const seg = 30 + rng() * 60;
    for (let k = 0; k < seg; k++) {
      ang += (rng() - 0.5) * 0.7;
      x += Math.cos(ang) * 9;
      y += Math.sin(ang) * 9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.filter = 'none';
  return toTexture(c);
});

/** Baroque ornament used as a bump map on the gilded frames. */
export const ornament = cached('ornament', function ornament() {
  const W = 512, H = 64;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, W, H);
  const rng = mulberry32(31);
  for (let x = 0; x < W; x += 32) {
    // acanthus scroll
    ctx.strokeStyle = '#f0f0f0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x + 16, H / 2, 11, 0.3, Math.PI * 1.7);
    ctx.stroke();
    ctx.fillStyle = '#e0e0e0';
    ctx.beginPath();
    ctx.arc(x + 16, H / 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#303030';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 16, H / 2, 15, 0.2, Math.PI * 1.8);
    ctx.stroke();
  }
  // beading top and bottom
  for (let x = 4; x < W; x += 8) {
    ctx.fillStyle = '#e8e8e8';
    ctx.beginPath(); ctx.arc(x, 5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x, H - 5, 3, 0, Math.PI * 2); ctx.fill();
  }
  speckle(ctx, W, H, 1500, rng, 0.5, ['#202020', '#ffffff'], 1.5);
  const t = toTexture(c, { srgb: false });
  return t;
});

/** Worn gilding colour variation. */
export const gilt = cached('gilt', function gilt() {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(41);
  ctx.fillStyle = '#c49a52';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = rng() > 0.6 ? 'rgba(90,55,25,0.25)' : 'rgba(240,210,140,0.18)';
    const r = 2 + rng() * 14;
    ctx.beginPath();
    ctx.arc(rng() * S, rng() * S, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c);
});

/** Dusk sky glimpsed through an arched mullioned window. Alpha-less; the
 *  geometry carries the arch shape. */
export function windowGlass() {
  const W = 256, H = 640;
  const [c, ctx] = canvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#6f86a0');
  g.addColorStop(0.45, '#c9a37e');
  g.addColorStop(0.7, '#f1c58c');
  g.addColorStop(1, '#ffdcaa');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // distant rooftops
  const rng = mulberry32(17);
  ctx.fillStyle = 'rgba(120,88,70,0.55)';
  let x = 0;
  while (x < W) {
    const w = 20 + rng() * 60;
    const h = 60 + rng() * 120;
    ctx.fillRect(x, H - h, w, h);
    x += w;
  }
  ctx.fillStyle = 'rgba(255,230,190,0.5)';
  for (let i = 0; i < 40; i++) ctx.fillRect(rng() * W, H - rng() * 150, 3, 4);
  // mullions
  ctx.strokeStyle = '#2b2118';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
  for (let y = 120; y < H; y += 105) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(W / 4, 0); ctx.lineTo(W / 4, H);
  ctx.moveTo((3 * W) / 4, 0); ctx.lineTo((3 * W) / 4, H);
  ctx.stroke();
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Delft-blue painted glaze for the porcelain vase, mapped (angle, height). */
export const delft = cached('delft', function delft() {
  const W = 1024, H = 512;
  const [c, ctx] = canvas(W, H);
  const rng = mulberry32(51);
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(0, 0, W, H);
  const blue = (a) => `rgba(28,52,120,${a})`;
  ctx.fillStyle = blue(0.9);
  ctx.fillRect(0, H * 0.06, W, 6);
  ctx.fillRect(0, H * 0.9, W, 6);
  ctx.fillRect(0, H * 0.94, W, 3);
  // meander band
  ctx.strokeStyle = blue(0.85);
  ctx.lineWidth = 3;
  for (let x = 0; x < W; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, H * 0.12 + 14); ctx.lineTo(x, H * 0.12); ctx.lineTo(x + 22, H * 0.12);
    ctx.lineTo(x + 22, H * 0.12 + 10); ctx.lineTo(x + 10, H * 0.12 + 10);
    ctx.stroke();
  }
  // floral sprays
  ctx.filter = 'blur(0.6px)';
  for (let i = 0; i < 7; i++) {
    const cx = (i + 0.5) * (W / 7), cy = H * 0.52;
    ctx.strokeStyle = blue(0.75);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 120);
    ctx.bezierCurveTo(cx - 30, cy + 40, cx + 30, cy - 40, cx, cy - 110);
    ctx.stroke();
    for (let k = 0; k < 9; k++) {
      const t = k / 9;
      const px = cx + Math.sin(t * 7 + i) * 26, py = cy + 110 - t * 220;
      ctx.fillStyle = blue(0.35 + rng() * 0.5);
      ctx.beginPath();
      ctx.ellipse(px, py, 9 + rng() * 10, 5 + rng() * 5, rng() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = blue(0.8);
    ctx.beginPath();
    ctx.arc(cx, cy - 115, 13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.filter = 'none';
  speckle(ctx, W, H, 2000, rng, 0.08, ['#1c3478'], 1.5);
  const t = toTexture(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
});

/** Apple skin: red over yellow with vertical streaks. */
export const appleSkin = cached('appleSkin', function appleSkin() {
  const W = 512, H = 256;
  const [c, ctx] = canvas(W, H);
  const rng = mulberry32(61);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#6e1410');
  g.addColorStop(0.5, '#a3201a');
  g.addColorStop(1, '#c8a040');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 220; i++) {
    ctx.strokeStyle = rng() > 0.5 ? 'rgba(220,170,70,0.18)' : 'rgba(80,10,8,0.25)';
    ctx.lineWidth = 1 + rng() * 3;
    const x = rng() * W;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + (rng() - 0.5) * 20, H * 0.3, x + (rng() - 0.5) * 20, H * 0.6, x + (rng() - 0.5) * 30, H);
    ctx.stroke();
  }
  speckle(ctx, W, H, 1500, rng, 0.5, ['#e8c27a'], 1.5);
  return toTexture(c);
});

/** Text drawn onto a transparent canvas texture. lines: [{text, font, color, y, align}] */
export function textTexture(w, h, lines, { bg = null } = {}) {
  const [c, ctx] = canvas(w, h);
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  for (const l of lines) {
    ctx.font = l.font;
    ctx.fillStyle = l.color || '#111';
    ctx.textAlign = l.align || 'left';
    ctx.textBaseline = 'alphabetic';
    if (l.spacing && 'letterSpacing' in ctx) ctx.letterSpacing = l.spacing;
    else if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if (l.wrap) {
      const words = l.text.split(' ');
      let line = '', y = l.y;
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > l.wrap && line) {
          ctx.fillText(line, l.x ?? 0, y);
          line = word;
          y += l.lh;
        } else line = test;
      }
      if (line) ctx.fillText(line, l.x ?? 0, y);
    } else ctx.fillText(l.text, l.x ?? 0, l.y);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Soft radial sprite for dust motes and light pools. */
export const softDot = cached('softDot', function softDot() {
  const S = 64;
  const [c, ctx] = canvas(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  return t;
});

/** Hairline scratches for glass roughness (linear data). */
export const scratches = cached('scratches', function scratches() {
  const S = 512;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(81);
  ctx.fillStyle = '#0d0d0d';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.08 + rng() * 0.3})`;
    ctx.lineWidth = 0.4 + rng() * 0.8;
    const x = rng() * S, y = rng() * S, a = rng() * Math.PI, l = 10 + rng() * 90;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (rng() - 0.5) * 8, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  speckle(ctx, S, S, 3000, rng, 0.25, ['#ffffff'], 1);
  return toTexture(c, { srgb: false });
});

/** Aged porcelain glaze for a plate, mapped (angle, radius 0→1). */
export const plateGlaze = cached('plateGlaze', function plateGlaze() {
  const W = 1024, H = 256;
  const [c, ctx] = canvas(W, H);
  const rng = mulberry32(91);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#efe8da');
  g.addColorStop(1, '#e8dfcc');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // gilt rim line and a sepia laurel band
  ctx.fillStyle = '#b48a43';
  ctx.fillRect(0, H * 0.955, W, H * 0.03);
  ctx.fillRect(0, H * 0.62, W, 2);
  ctx.strokeStyle = 'rgba(122,92,60,0.75)';
  ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 28) {
    ctx.beginPath();
    ctx.ellipse(x + 7, H * 0.78, 9, 4, 0.6, 0, Math.PI * 2);
    ctx.ellipse(x + 21, H * 0.82, 9, 4, -0.6, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, H * 0.8); ctx.lineTo(W, H * 0.8);
  ctx.stroke();
  // crazing: fine network of age cracks in the glaze
  ctx.strokeStyle = 'rgba(120,100,70,0.16)';
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 420; i++) {
    let x = rng() * W, y = rng() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * 30; y += (rng() - 0.5) * 30; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  speckle(ctx, W, H, 2500, rng, 0.12, ['#8a7454', '#ffffff'], 1.2);
  const t = toTexture(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
});

/** Honed limestone / travertine with pores. */
export const limestone = cached('limestone', function limestone({ base = '#bfb39c', seed = 101, size = 512 } = {}) {
  const S = size;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  // soft mottling, no banding (bands read as wood grain on cylinders)
  for (let i = 0; i < 160; i++) {
    const r = 10 + rng() * 70;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${rng() > 0.5 ? '255,248,232' : '80,66,48'},${0.05 + rng() * 0.07})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      ctx.save();
      ctx.translate(((i * 131.7) % S) + dx, ((i * 71.3 + rng() * 60) % S) + dy);
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    }
  }
  for (let i = 0; i < 520; i++) {
    const r = 0.5 + Math.pow(rng(), 3) * 3;
    ctx.fillStyle = `rgba(70,58,42,${0.12 + rng() * 0.3})`;
    ctx.beginPath();
    ctx.arc(rng() * S, rng() * S, r, 0, Math.PI * 2);
    ctx.fill();
  }
  speckle(ctx, S, S, 7000, rng, 0.18, ['#6b5b44', '#efe4cf'], 1.4);
  return toTexture(c);
});

/** Speckled granite. */
export const granite = cached('granite', function granite() {
  const S = 512;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(121);
  ctx.fillStyle = '#3d3a37';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, S, 26000, rng, 0.75, ['#191715', '#6d6762', '#8e857c', '#262321', '#a39a90'], 2.6);
  speckle(ctx, S, S, 2500, rng, 0.6, ['#c7bdb0', '#0c0b0a'], 3.5);
  return toTexture(c);
});

/** Dark honed slate for the moment stage floor. */
export const slate = cached('slate', function slate() {
  const S = 1024;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(111);
  ctx.fillStyle = '#1b1814';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 120; i++) {
    const r = 40 + rng() * 220;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, rng() > 0.5 ? 'rgba(70,62,52,0.16)' : 'rgba(0,0,0,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(rng() * S, rng() * S);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, r * 2, r * 2);
    ctx.restore();
  }
  // large flags with fine joints
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.lineWidth = 2;
  for (let k = 0; k <= 4; k++) {
    ctx.beginPath(); ctx.moveTo(0, k * S / 4); ctx.lineTo(S, k * S / 4); ctx.stroke();
    for (let j = 0; j < 4; j++) {
      const off = (k % 2) * S / 8;
      ctx.beginPath(); ctx.moveTo(j * S / 4 + off, k * S / 4); ctx.lineTo(j * S / 4 + off, (k + 1) * S / 4); ctx.stroke();
    }
  }
  speckle(ctx, S, S, 12000, rng, 0.2, ['#3b342c', '#0a0806'], 1.5);
  return toTexture(c);
});

// ---------------------------------------------------------------- paintings
// The gallery's own pictures. Built the way an oil painting is: a warm ground,
// dead-colouring laid in broad translucent strokes, lights scumbled on top,
// then varnish, dust and two centuries of craquelure.

/** Fine linen weave — the bump map under every painted canvas. */
export const canvasWeave = cached('canvasWeave', function canvasWeave() {
  const S = 256;
  const [c, ctx] = canvas(S);
  const rng = mulberry32(5);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 3) {
    ctx.fillStyle = `rgba(255,255,255,${0.22 + rng() * 0.14})`;
    ctx.fillRect(i, 0, 1.4, S);
    ctx.fillStyle = `rgba(0,0,0,${0.18 + rng() * 0.12})`;
    ctx.fillRect(i + 1.6, 0, 1.2, S);
  }
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < S; i += 3) {
    ctx.fillStyle = `rgba(255,255,255,${0.22 + rng() * 0.14})`;
    ctx.fillRect(0, i, S, 1.4);
    ctx.fillStyle = `rgba(0,0,0,${0.18 + rng() * 0.12})`;
    ctx.fillRect(0, i + 1.6, S, 1.2);
  }
  ctx.globalAlpha = 1;
  return toTexture(c, { srgb: false });
});

/** A painter's hand: soft, oriented, translucent marks. */
function painter(ctx, rng, W, H) {
  const pick = (a) => a[(rng() * a.length) | 0];
  const api = {
    /** One loaded brushmark. */
    mark(x, y, len, wid, ang, color, alpha) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(0.5, len / 2), Math.max(0.5, wid / 2), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    },
    /** A passage of strokes scattered through a box, all roughly one direction. */
    field(n, [bx, by, bw, bh], colors, { len = [0.1, 0.3], wid = [0.012, 0.04], ang = 0, spread = 0.35, alpha = [0.05, 0.16], curve = 0 } = {}) {
      for (let i = 0; i < n; i++) {
        const x = bx + rng() * bw, y = by + rng() * bh;
        const a = ang + (rng() - 0.5) * spread + (curve ? ((x - bx) / bw - 0.5) * curve : 0);
        api.mark(x, y, (len[0] + rng() * (len[1] - len[0])) * W, (wid[0] + rng() * (wid[1] - wid[0])) * W,
          a, pick(colors), alpha[0] + rng() * (alpha[1] - alpha[0]));
      }
    },
    /** Light in the air: a soft radial bloom. */
    glow(x, y, r, color, alpha) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(0.45, color.replace(/[\d.]+\)$/, `${alpha * 0.45})`));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.restore();
    },
    /** A dark mass, broken at the edges so it reads as paint and not as a shape. */
    mass(pts, colors, alpha = 0.9) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = colors[0];
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        const n = 14;
        for (let k = 0; k < n; k++) {
          const t = k / n;
          api.mark(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.05 * W, 0.03 * W,
            Math.atan2(y1 - y0, x1 - x0) + (rng() - 0.5), pick(colors), 0.25 + rng() * 0.4);
        }
      }
    },
    /** A standing body, read as one dark shape: tapered trunk, shoulders, head. */
    figure(x, y, h, { colors = ['#141009'], alpha = 0.95, lean = 0, arm = 0, w = h * 0.3 } = {}) {
      const sw = w * 0.46, hw = w * 0.33, tilt = lean * h * 0.12;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = pick(colors);
      ctx.beginPath();
      ctx.moveTo(x - sw, y);
      ctx.lineTo(x + sw, y);
      ctx.lineTo(x + hw + tilt, y - h * 0.74);
      ctx.quadraticCurveTo(x + tilt, y - h * 0.94, x - hw + tilt, y - h * 0.74);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x + tilt * 1.2, y - h * 0.87, w * 0.21, h * 0.095, lean * 0.3, 0, Math.PI * 2);
      ctx.fill();
      if (arm) {
        const a = arm;
        ctx.translate(x + tilt, y - h * 0.72);
        ctx.rotate(a);
        ctx.fillRect(-w * 0.07, -h * 0.02, w * 0.12, h * 0.46);
        ctx.restore();
        return;
      }
      ctx.restore();
    },
    pick,
    rnd: (a, b) => a + rng() * (b - a),
  };
  return api;
}

const SUBJECTS = {
  /** The Death of Caesar, after Vincenzo Camuccini. One white figure down in a cold hall. */
  caesar(ctx, p, W, H) {
    const floor = H * 0.76;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#201a12'); g.addColorStop(0.3, '#4c4336');
    g.addColorStop(0.62, '#7b7059'); g.addColorStop(0.78, '#5b503d'); g.addColorStop(1, '#241d14');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    p.field(200, [0, 0, W, floor], ['#6b6252', '#453d31', '#8b8068'], { ang: 1.57, spread: 0.3, len: [0.1, 0.4], wid: [0.03, 0.09], alpha: [0.05, 0.14] });

    // a colonnade the whole width, deepest in the middle
    for (let i = 0; i < 6; i++) {
      const x = W * (0.03 + i * 0.185), wc = W * 0.072;
      const dark = i >= 2 && i <= 3;
      p.mass([[x, H * 0.02], [x + wc, H * 0.02], [x + wc * 0.93, floor], [x + wc * 0.07, floor]],
        dark ? ['#2b241a', '#1d1810'] : ['#5a5041', '#6e6451', '#3c3529'], 0.94);
      p.field(44, [x, H * 0.02, wc, floor], ['#a0957c', '#48402f'], { ang: 1.57, spread: 0.08, len: [0.05, 0.19], wid: [0.006, 0.016], alpha: [0.1, 0.26] });
    }
    p.mass([[0, 0], [W, 0], [W, H * 0.1], [0, H * 0.12]], ['#241d14', '#180f08'], 0.9);
    p.glow(W * 0.3, H * 0.1, W * 0.75, 'rgba(255,246,219,0.45)', 0.36);

    // the floor, and the pool of light that finds him
    p.mass([[0, floor], [W, floor - H * 0.018], [W, H], [0, H]], ['#6a6050', '#584e3e', '#7b7160'], 0.97);
    p.field(120, [0, floor - H * 0.02, W, H - floor], ['#8c8270', '#4e4536', '#9d9280'], { ang: -0.012, spread: 0.05, len: [0.16, 0.5], wid: [0.008, 0.03], alpha: [0.09, 0.24] });
    p.glow(W * 0.37, floor + H * 0.03, W * 0.34, 'rgba(255,250,232,0.55)', 0.4);

    // the conspirators: a knot, not a row — set back, overlapping, drawing away right
    const mob = [
      [0.52, 0.86, 0, 0.06], [0.565, 1.02, -1.4, 0.0], [0.60, 0.78, 0, 0.07],
      [0.645, 1.1, 0, 0.0], [0.69, 0.9, -1.95, 0.05], [0.715, 1.04, 0, 0.0],
      [0.765, 0.84, 0, 0.055], [0.80, 1.0, -1.15, 0.0], [0.855, 0.92, 0, 0.04], [0.90, 1.06, 0, 0.0],
    ];
    for (const [mx, sc, arm, back] of mob) {
      p.figure(W * mx, floor + H * (0.03 - back), H * 0.31 * sc, {
        colors: back ? ['#241310', '#190e0b'] : ['#331a15', '#1d100d', '#4d261d'],
        lean: p.rnd(0.05, 0.4), arm, alpha: back ? 0.8 : 0.96,
      });
    }
    // the glint at the end of one raised arm
    p.mark(W * 0.6, floor - H * 0.23, W * 0.024, W * 0.006, -1.35, '#efe6cf', 0.9);
    p.mark(W * 0.715, floor - H * 0.26, W * 0.02, W * 0.005, -1.9, '#efe6cf', 0.8);

    // Caesar, fallen on the step: the one pale mass, built as a body and not a mound
    const cx = W * 0.3, cy = floor + H * 0.06;
    ctx.save();
    ctx.globalAlpha = 0.97;
    ctx.fillStyle = '#ded4bc';
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.135, cy + H * 0.055);                                   // the shoulder, lowest
    ctx.quadraticCurveTo(cx - W * 0.095, cy - H * 0.055, cx - W * 0.02, cy - H * 0.05); // chest rising
    ctx.quadraticCurveTo(cx + W * 0.05, cy - H * 0.045, cx + W * 0.075, cy + H * 0.005); // the hip
    ctx.quadraticCurveTo(cx + W * 0.1, cy - H * 0.05, cx + W * 0.15, cy - H * 0.03);     // a knee drawn up
    ctx.quadraticCurveTo(cx + W * 0.215, cy + H * 0.01, cx + W * 0.2, cy + H * 0.065);   // the shin
    ctx.quadraticCurveTo(cx + W * 0.12, cy + H * 0.045, cx + W * 0.06, cy + H * 0.085);
    ctx.quadraticCurveTo(cx - W * 0.04, cy + H * 0.105, cx - W * 0.135, cy + H * 0.055);
    ctx.closePath();
    ctx.fill();
    ctx.clip();
    p.field(200, [cx - W * 0.14, cy - H * 0.09, W * 0.35, H * 0.22], ['#f7f1de', '#cdc2a7', '#8e8471', '#fffbf0'], { ang: 0.28, spread: 0.8, len: [0.02, 0.1], wid: [0.006, 0.024], alpha: [0.14, 0.38] });
    ctx.restore();
    // the head fallen back over the step, an arm thrown out, the cloak beneath
    p.mark(cx - W * 0.165, cy + H * 0.045, W * 0.038, W * 0.04, 0.35, '#c6ab8d', 0.96);
    p.mark(cx - W * 0.2, cy + H * 0.062, W * 0.055, W * 0.03, 0.55, '#4a3a2c', 0.75);
    p.mark(cx - W * 0.085, cy + H * 0.085, W * 0.12, W * 0.026, -0.12, '#e8e0cb', 0.9); // the outflung arm
    p.mark(cx - W * 0.145, cy + H * 0.092, W * 0.028, W * 0.026, 0, '#c6ab8d', 0.9);    // its hand
    p.mark(cx + W * 0.19, cy + H * 0.08, W * 0.13, W * 0.026, 0.18, '#8e2420', 0.6);
    p.mark(cx - W * 0.02, cy + H * 0.1, W * 0.2, W * 0.02, 0.05, '#7a1f1c', 0.4);
  },

  /** The Fall of Constantinople: the land walls, and the city burning behind them. */
  constantinople(ctx, p, W, H) {
    const wallTop = H * 0.44, ground = H * 0.72;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#191410'); g.addColorStop(0.26, '#4a3119');
    g.addColorStop(0.46, '#9c5f27'); g.addColorStop(0.62, '#5a3f22'); g.addColorStop(1, '#120e09');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    p.field(230, [0, 0, W, ground], ['#2a1f14', '#5a3f23', '#86592c', '#171108'], { ang: -0.06, spread: 0.22, len: [0.2, 0.6], wid: [0.03, 0.09], alpha: [0.05, 0.14], curve: 0.22 });
    p.glow(W * 0.64, H * 0.4, W * 0.46, 'rgba(255,164,60,0.6)', 0.48);
    p.glow(W * 0.3, H * 0.38, W * 0.26, 'rgba(255,130,50,0.45)', 0.3);

    // the city: domes and a minaret in silhouette against the fire
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#1b1309';
    ctx.beginPath(); ctx.ellipse(W * 0.66, wallTop - H * 0.03, W * 0.1, H * 0.12, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(W * 0.56, wallTop - H * 0.035, W * 0.2, H * 0.04);
    ctx.beginPath(); ctx.ellipse(W * 0.79, wallTop + H * 0.01, W * 0.055, H * 0.065, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(W * 0.604, wallTop - H * 0.26, W * 0.013, H * 0.23);
    ctx.beginPath(); ctx.moveTo(W * 0.6, wallTop - H * 0.26); ctx.lineTo(W * 0.611, wallTop - H * 0.31); ctx.lineTo(W * 0.622, wallTop - H * 0.26); ctx.fill();
    ctx.restore();

    // the land walls, with their square towers
    p.mass([[0, wallTop + H * 0.05], [W, wallTop + H * 0.02], [W, ground], [0, ground + H * 0.02]], ['#2c2416', '#3b3120', '#1b160e'], 0.97);
    for (let i = 0; i < 7; i++) {
      const x = W * (0.01 + i * 0.152), tw = W * 0.082, top = wallTop - H * (0.04 + (i % 2) * 0.02);
      p.mass([[x, top], [x + tw, top], [x + tw, ground], [x, ground]], ['#352b1b', '#473a24', '#1f1910'], 0.97);
      ctx.save(); ctx.globalAlpha = 0.95; ctx.fillStyle = '#2b2317';
      for (let k = 0; k < 3; k++) ctx.fillRect(x + W * (0.009 + k * 0.028), top - H * 0.032, W * 0.017, H * 0.034);
      ctx.restore();
    }
    p.field(220, [0, wallTop - H * 0.06, W, ground - wallTop], ['#604d2e', '#272015', '#80683f'], { ang: 1.57, spread: 0.28, len: [0.03, 0.15], wid: [0.008, 0.026], alpha: [0.07, 0.2] });
    // the breach, and the smoke above it
    p.glow(W * 0.42, wallTop + H * 0.14, W * 0.2, 'rgba(255,196,110,0.65)', 0.45);
    p.field(100, [W * 0.16, H * 0.06, W * 0.62, H * 0.42], ['#6d5234', '#3a2d1d', '#8f7044'], { ang: -0.22, spread: 0.4, len: [0.14, 0.46], wid: [0.035, 0.11], alpha: [0.05, 0.14] });

    // the host on the plain
    p.mass([[0, ground], [W, ground - H * 0.012], [W, H], [0, H]], ['#191309', '#221a0f', '#100c07'], 0.97);
    for (let i = 0; i < 64; i++) {
      const x = p.rnd(-0.02, 1.02) * W, y = p.rnd(ground + H * 0.015, H * 1.0);
      const sc = 0.5 + (y - ground) / (H - ground) * 0.9;
      p.figure(x, y, H * 0.11 * sc, { colors: ['#0e0a05', '#17110a'], lean: p.rnd(-0.2, 0.2), alpha: 0.92 });
      if (i % 9 === 0) {
        p.mark(x + W * 0.012, y - H * 0.13 * sc, W * 0.004, H * 0.16 * sc, 0.04, '#0e0a05', 0.85);
        p.mark(x + W * 0.03, y - H * 0.19 * sc, W * 0.03, H * 0.018, 0.04, i % 18 ? '#8e2a1e' : '#1f3d2a', 0.8);
      }
    }
  },

  /** The Storming of the Bastille, after Jean-Pierre Houël. */
  bastille(ctx, p, W, H) {
    const ground = H * 0.7;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#39404a'); g.addColorStop(0.28, '#6b6a64');
    g.addColorStop(0.52, '#8d8169'); g.addColorStop(0.72, '#4f4634'); g.addColorStop(1, '#1d1811');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    p.field(200, [0, 0, W, ground], ['#5a5c64', '#8a8373', '#383940', '#a49b84'], { ang: -0.08, spread: 0.24, len: [0.2, 0.62], wid: [0.03, 0.1], alpha: [0.05, 0.13], curve: 0.2 });
    p.glow(W * 0.2, H * 0.14, W * 0.56, 'rgba(255,250,232,0.42)', 0.3);

    // the fortress: a solid block with round towers, filling the right half
    p.mass([[W * 0.4, H * 0.33], [W, H * 0.28], [W, ground], [W * 0.4, ground]], ['#3a3327', '#463e2f', '#28221a'], 0.97);
    for (const [tx, ty, tw] of [[0.43, 0.165, 0.078], [0.61, 0.095, 0.088], [0.79, 0.125, 0.088], [0.96, 0.185, 0.078]]) {
      const x = W * tx, top = H * ty, r = W * tw;
      p.mass([[x - r, top + H * 0.012], [x + r, top + H * 0.012], [x + r * 1.08, ground], [x - r * 1.08, ground]], ['#3f3729', '#4e4535', '#2a241a'], 0.98);
      ctx.save(); ctx.globalAlpha = 0.95; ctx.fillStyle = '#5f553f';
      ctx.beginPath(); ctx.ellipse(x, top + H * 0.012, r, H * 0.022, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#453c2d';
      for (let k = 0; k < 5; k++) ctx.fillRect(x - r * 0.86 + k * r * 0.43, top - H * 0.018, r * 0.26, H * 0.032);
      ctx.restore();
      p.field(80, [x - r, top, r * 2, ground - top], ['#857a62', '#423a2c', '#9e937a'], { ang: 1.57, spread: 0.2, len: [0.04, 0.18], wid: [0.008, 0.03], alpha: [0.09, 0.24] });
      // a window or two, dark
      p.mark(x, top + H * 0.14, W * 0.012, H * 0.038, 0, '#241e16', 0.8);
    }
    // gunsmoke rolling off the wall, with the flash inside it
    p.glow(W * 0.46, H * 0.56, W * 0.24, 'rgba(255,212,142,0.6)', 0.42);
    p.field(80, [W * 0.22, H * 0.4, W * 0.42, H * 0.3], ['#b7ad96', '#8e8572', '#dcd5c0'], { ang: -0.22, spread: 0.45, len: [0.08, 0.3], wid: [0.04, 0.11], alpha: [0.06, 0.16] });
    p.mark(W * 0.48, H * 0.56, W * 0.045, W * 0.016, 0.25, '#ffecba', 0.85);

    // the crowd, filling the near ground
    p.mass([[0, ground], [W, ground - H * 0.014], [W, H], [0, H]], ['#2a2217', '#191309', '#3a3021'], 0.97);
    p.field(130, [0, ground - H * 0.012, W, H - ground], ['#4c3e27', '#1c1610', '#67542f'], { ang: 0.02, spread: 0.13, len: [0.1, 0.36], wid: [0.01, 0.04], alpha: [0.1, 0.28] });
    for (let i = 0; i < 80; i++) {
      const x = p.rnd(-0.02, 1.02) * W, y = p.rnd(ground - H * 0.005, H * 1.0);
      const sc = 0.55 + (y - ground) / (H - ground) * 1.0;
      p.figure(x, y, H * 0.15 * sc, { colors: ['#15100a', '#241b11', '#2f2417'], lean: p.rnd(-0.25, 0.25), alpha: 0.93, arm: i % 7 === 0 ? -1.3 : 0 });
      if (i % 4 === 0) p.mark(x + W * 0.01, y - H * 0.2 * sc, W * 0.0035, H * 0.2 * sc, p.rnd(-0.14, 0.14), '#120d07', 0.8);
    }
    // the colours, carried
    p.mark(W * 0.17, ground + H * 0.02, W * 0.005, H * 0.2, -0.04, '#120d07', 0.9);
    const fy = ground - H * 0.12;
    p.mark(W * 0.188, fy, W * 0.028, H * 0.04, -0.06, '#2c4274', 0.9);
    p.mark(W * 0.214, fy - H * 0.002, W * 0.028, H * 0.04, -0.06, '#ddd4bd', 0.9);
    p.mark(W * 0.24, fy - H * 0.004, W * 0.028, H * 0.04, -0.06, '#96281f', 0.9);
  },

  /** The Fall of the Berlin Wall, after the photographs of November 1989. */
  berlin(ctx, p, W, H) {
    const wallTop = H * 0.52, base = H * 0.84;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b0f16'); g.addColorStop(0.4, '#1b222c');
    g.addColorStop(0.52, '#3b4450'); g.addColorStop(1, '#07090d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    p.field(180, [0, 0, W, wallTop], ['#121823', '#222b38', '#090c12'], { ang: -0.04, spread: 0.2, len: [0.2, 0.6], wid: [0.03, 0.1], alpha: [0.06, 0.16] });
    p.glow(W * 0.44, wallTop - H * 0.04, W * 0.66, 'rgba(255,228,174,0.5)', 0.44);
    p.glow(W * 0.8, wallTop - H * 0.01, W * 0.26, 'rgba(188,216,255,0.4)', 0.26);

    // the slab wall and its rolled coping
    p.mass([[0, wallTop + H * 0.035], [W, wallTop + H * 0.015], [W, base], [0, base + H * 0.012]], ['#8a8882', '#73726d', '#9d9a93'], 0.98);
    ctx.save(); ctx.globalAlpha = 0.92; ctx.fillStyle = '#aaa79e';
    ctx.beginPath(); ctx.ellipse(W * 0.5, wallTop + H * 0.035, W * 0.56, H * 0.024, -0.01, Math.PI, 0); ctx.fill(); ctx.restore();
    p.field(200, [0, wallTop + H * 0.04, W, base - wallTop], ['#96948d', '#6a6964', '#b2afa6', '#525149'], { ang: 1.57, spread: 0.25, len: [0.05, 0.22], wid: [0.012, 0.045], alpha: [0.07, 0.2] });
    for (let i = 0; i < 24; i++) {
      const x = p.rnd(0, W), y = p.rnd(wallTop + H * 0.09, base - H * 0.03);
      p.mark(x, y, p.rnd(0.03, 0.11) * W, p.rnd(0.012, 0.04) * H, p.rnd(-0.5, 0.5),
        p.pick(['#95373f', '#2d5a80', '#bb8b36', '#46744d', '#73467a']), p.rnd(0.14, 0.34));
    }
    ctx.save(); ctx.globalAlpha = 0.28; ctx.strokeStyle = '#3c3b37'; ctx.lineWidth = W * 0.0035;
    for (let i = 1; i < 9; i++) { const x = (i / 9) * W; ctx.beginPath(); ctx.moveTo(x, wallTop + H * 0.04); ctx.lineTo(x + W * 0.004, base); ctx.stroke(); }
    ctx.restore();

    // the people on top, against the glare
    for (let i = 0; i < 12; i++) {
      const x = W * (0.05 + i * 0.082) + p.rnd(-W * 0.012, W * 0.012);
      p.figure(x, wallTop + H * 0.035, H * p.rnd(0.17, 0.23), { colors: ['#090b10', '#13161d'], lean: p.rnd(-0.3, 0.3), alpha: 0.96, arm: i % 3 === 0 ? -1.25 + p.rnd(-0.3, 0.3) : 0 });
    }
    // the crowd at the foot of it, and one hammer striking
    p.mass([[0, base], [W, base - H * 0.01], [W, H], [0, H]], ['#090b10', '#11151d'], 0.97);
    for (let i = 0; i < 54; i++) {
      const x = p.rnd(-0.02, 1.02) * W, y = p.rnd(base + H * 0.01, H * 1.0);
      p.figure(x, y, H * p.rnd(0.12, 0.18), { colors: ['#06080d', '#0d1017'], lean: p.rnd(-0.2, 0.2), alpha: 0.95 });
    }
    p.glow(W * 0.28, base - H * 0.015, W * 0.075, 'rgba(255,232,184,0.75)', 0.55);
    for (let i = 0; i < 16; i++) p.mark(W * 0.28 + p.rnd(-0.045, 0.045) * W, base - H * 0.015 + p.rnd(-0.035, 0.02) * H, W * 0.0045, W * 0.0045, 0, '#ffeec4', p.rnd(0.4, 0.95));
  },
};

/**
 * One painting, as a map plus the weave to bump it with.
 * subject: 'storm' | 'vessels' | 'arch'
 */
export const painting = cached('painting', function painting({ subject = 'storm', seed = 1, size = 768, ratio = 1.32 } = {}) {
  const W = size, H = Math.round(size * ratio);
  const [c, ctx] = canvas(W, H);
  const rng = mulberry32(seed);
  const p = painter(ctx, rng, W, H);
  // warm ground, so nothing reads as pure black
  ctx.fillStyle = '#3a2a1b';
  ctx.fillRect(0, 0, W, H);
  (SUBJECTS[subject] || SUBJECTS.storm)(ctx, p, W, H);

  // ---- age: varnish, dust, craquelure, a darkened edge
  const v = ctx.createRadialGradient(W * 0.45, H * 0.38, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
  v.addColorStop(0, 'rgba(118, 84, 40, 0.06)');
  v.addColorStop(0.55, 'rgba(60, 40, 18, 0.16)');
  v.addColorStop(1, 'rgba(14, 9, 4, 0.62)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  speckle(ctx, W, H, 2600, rng, 0.09, ['#efe2c4', '#1a1208', '#6b5533'], 1.6);
  // craquelure: a slow network of hairlines, lighter where the varnish lifted
  ctx.lineWidth = 0.7;
  for (let i = 0; i < 180; i++) {
    let x = rng() * W, y = rng() * H, a = rng() * Math.PI * 2;
    ctx.strokeStyle = rng() > 0.5 ? `rgba(26,18,8,${0.1 + rng() * 0.2})` : `rgba(226,210,178,${0.05 + rng() * 0.1})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const seg = 3 + ((rng() * 7) | 0);
    for (let k = 0; k < seg; k++) {
      a += (rng() - 0.5) * 1.9;
      x += Math.cos(a) * (6 + rng() * 22);
      y += Math.sin(a) * (6 + rng() * 22);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // the canvas edge where the stretcher pulls it
  const e = ctx.createLinearGradient(0, 0, 0, H * 0.04);
  e.addColorStop(0, 'rgba(10,7,3,0.5)');
  e.addColorStop(1, 'rgba(10,7,3,0)');
  ctx.fillStyle = e;
  ctx.fillRect(0, 0, W, H * 0.04);
  return toTexture(c, { aniso: 16 });
});
