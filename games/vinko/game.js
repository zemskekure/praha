// Vínko: one long night in Lokál Korunní. Top-down pixel art on a canvas. Three scenes (the pub, the toilet and
// Korunní street) are painted once each; the people are RetroDiffusion walk sheets; light is laid over each frame.
// Online through the artifact room: every player's presence carries who they play and what they are doing, and one
// host page runs everyone nobody plays.
(async () => {
  const $ = id => document.getElementById(id);
  const canvas = $('c'), g = canvas.getContext('2d');
  let VW = 600, VH = 330, SCALE = 2;
  function resize() {
    SCALE = Math.max(1, Math.round(Math.min(innerWidth / 600, innerHeight / 330)));
    VW = Math.ceil(innerWidth / SCALE); VH = Math.ceil(innerHeight / SCALE);
    canvas.width = VW; canvas.height = VH; g.imageSmoothingEnabled = false;
  }
  resize(); addEventListener('resize', resize);

  // ------------------------------------------------------------------ small tools
  const hash2 = (x, y, s = 0) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s, 2246822519); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const px = (c, x, y, w = 1, h = 1, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; };
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function pline(c, pts, col) { c.fillStyle = col; for (let i = 0; i < pts.length - 1; i++) { let [x0, y0] = pts[i].map(Math.round), [x1, y1] = pts[i + 1].map(Math.round); const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy; for (;;) { c.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } } }
  function pcirc(c, cx, cy, r, col, from = 0, to = 6.283) { const pts = []; for (let a = from; a <= to + 0.01; a += 0.35 / Math.max(1, r / 3)) pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); pline(c, pts, col); }
  function glow(x, y, r, col, a) { if (a <= 0) return; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  function texture(k, w, h, f) { const im = k.createImageData(w, h), d = im.data; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f(x, y), i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; } k.putImageData(im, 0, 0); }

  // ================================================================== SCENES
  // Each scene: a floor (x 0..W, y 0..H), a wall standing above y = 0 (WALL px tall), furniture painted once and cut
  // into 8 px bands so people sort in front of and behind it, solid rectangles, seats, and doors to the others.
  const SC = {};
  function scene(id, W, H, WALL, name) {
    const s = { id, W, H, WALL, name, solids: [], pieces: [], seats: [], doors: [], lightsOut: [] };
    s.block = (x0, y0, x1, y1) => s.solids.push([x0, y0, x1, y1]);
    s.block(-40, -WALL - 40, W + 40, 6); s.block(-40, H - 4, W + 40, H + 60); s.block(-40, -40, 4, H + 40); s.block(W - 4, -40, W + 40, H + 40);
    s.piece = (w, h, paint, x, y, solid) => { const [c, k] = mk(w, h); paint(k, w, h); s.pieces.push({ c, x, y, w, h }); if (solid) s.block(...solid); };
    [s.floor, s.fx] = mk(W, H); [s.wall, s.wx] = mk(W, WALL);
    SC[id] = s; return s;
  }
  function finish(s) {
    s.bands = []; for (const p of s.pieces) for (let y = 0; y < p.h; y += 8) s.bands.push({ p, sy: y, sh: Math.min(8, p.h - y), base: p.y + Math.min(p.h, y + 8) - (y + 8 >= p.h ? 6 : 0) });
    s.blocked = (x, y, r = 3) => x < 6 || y < 8 || x > s.W - 6 || y > s.H - 6 || s.solids.some(q => x + r > q[0] && x - r < q[2] && y + r > q[1] && y - r < q[3]);
    s.GC = 6; s.GW = Math.ceil(s.W / s.GC); s.GH = Math.ceil(s.H / s.GC); s.grid = new Uint8Array(s.GW * s.GH);
    for (let j = 0; j < s.GH; j++) for (let i = 0; i < s.GW; i++) s.grid[j * s.GW + i] = s.blocked(i * s.GC + s.GC / 2, j * s.GC + s.GC / 2, 4) ? 1 : 0;
  }
  const WOOD = ['#3b2414', '#4f311c', '#5e3a21', '#6f4528', '#7f5131'];
  function plankTop(k, x, y, w, h, vertical) { px(k, x, y, w, h, WOOD[3]); for (let i = 0; i < (vertical ? w : h); i++) { const q = hash2(i, x + y, 7); if (q > 0.8) vertical ? px(k, x + i, y, 1, h, WOOD[2]) : px(k, x, y + i, w, 1, WOOD[2]); if (q < 0.12) vertical ? px(k, x + i, y, 1, h, WOOD[4]) : px(k, x, y + i, w, 1, WOOD[4]); } px(k, x, y, w, 1, WOOD[4]); px(k, x, y, 1, h, WOOD[4]); }

  // ------------------------------------------------------------------ the pub: Lokál Korunní
  const PUB = scene('pub', 600, 250, 70, 'Lokál Korunní');
  const WINDOWS = [384, 452, 520].map(x => ({ x, w: 44 }));
  const BAR = { x: 30, y: 26, w: 28, h: 176 };
  const CHANDELIERS = [{ x: 200, y: 112 }, { x: 430, y: 118 }];
  const CANDLES = [];
  { const s = PUB, W = s.W, H = s.H, WALL = s.WALL, fx = s.fx, wx = s.wx;
    // the floor: honey oak in a herringbone, each plank its own shade, a dark groove between
    const OAK = ['#8e5f37', '#986640', '#a06c44', '#a87249', '#92623b', '#885a34'].map(hex);
    texture(fx, W, H, (x, y) => { const C = 8, col = Math.floor(x / C), lx = x - col * C, dir = col % 2 ? 1 : -1, v = y + (dir > 0 ? lx : C - 1 - lx) * 0.5, plank = Math.floor(v / 3), lv = v - plank * 3;
      const h = hash2(col, plank, 3), c = OAK[Math.floor(h * OAK.length)], groove = lv < 0.55 || lx === 0, grain = (hash2(x >> 2, y, 4) - 0.5) * 6 + Math.sin((x + y * 3) * 0.9 + h * 20) * 2, k = groove ? 0.8 : 1;
      return [clamp(c[0] * k + grain, 0, 255), clamp(c[1] * k + grain * 0.8, 0, 255), clamp(c[2] * k + grain * 0.5, 0, 255)]; });
    { const gr = fx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,230,190,0.08)'); gr.addColorStop(0.5, 'rgba(255,230,190,0)'); gr.addColorStop(1, 'rgba(40,20,10,0.18)'); fx.fillStyle = gr; fx.fillRect(0, 0, W, H); }
    // a long runner rug down the middle aisle, worn at the edges
    for (let y = 60; y < 236; y++) for (let x = 352; x < 366; x++) { const edge = x === 352 || x === 365 || (y % 8 === 0 && (x === 353 || x === 364)); px(fx, x, y, 1, 1, edge ? '#5a2a20' : ((x + y) % 6 < 3 ? '#7a3a2a' : '#6e3426')); }
    // the back wall: cream wallpaper with a red pattern over dark panelling covered in white chalk drawings
    px(wx, 0, 0, W, WALL, '#efe2cf');
    for (let y = 4; y < WALL - 30; y += 12) for (let x = (y / 12 % 2) * 7; x < W; x += 14) { const c = '#c27466'; px(wx, x + 3, y, 2, 1, c); px(wx, x + 2, y + 1, 4, 1, c); px(wx, x + 1, y + 2, 2, 2, c); px(wx, x + 5, y + 2, 2, 2, c); px(wx, x + 3, y + 3, 2, 3, c); px(wx, x + 2, y + 6, 1, 1, '#d79a8c'); px(wx, x + 5, y + 6, 1, 1, '#d79a8c'); }
    px(wx, 0, 0, W, 3, '#f7efe2'); px(wx, 0, 3, W, 1, '#d8c8b0');
    const PY = WALL - 30; px(wx, 0, PY, W, 30, '#5b3a24'); px(wx, 0, PY, W, 2, '#7a5034'); px(wx, 0, PY + 2, W, 1, '#3e2716');
    for (let x = 0; x < W; x += 30) px(wx, x, PY + 3, 1, 27, '#4a2e1b');
    px(wx, 0, WALL - 2, W, 2, '#3a2415');
    const ch = '#f4efe6';
    const face = (x, y, r) => { pcirc(wx, x, y, r, ch); px(wx, x - 2, y - 1, 1, 1, ch); px(wx, x + 2, y - 1, 1, 1, ch); pcirc(wx, x, y + 1, r * 0.5, ch, 0.4, 2.7); };
    const mug = (x, y) => { pline(wx, [[x, y], [x, y + 9], [x + 7, y + 9], [x + 7, y]], ch); pcirc(wx, x + 9, y + 4, 3, ch, -1.4, 1.4); pline(wx, [[x - 1, y - 1], [x + 2, y - 3], [x + 5, y - 2], [x + 8, y - 3]], ch); };
    const hat = (x, y) => { pline(wx, [[x, y], [x, y - 4], [x + 2, y - 7], [x + 5, y - 6], [x + 8, y - 8], [x + 10, y - 5], [x + 10, y]], ch); pline(wx, [[x, y], [x + 10, y]], ch); };
    for (let i = 0; i < 9; i++) { const x = 140 + i * 23 + (hash2(i, 1, 9) - 0.5) * 6, y = PY + 9 + hash2(i, 2, 9) * 10;
      if (i % 3 === 0) { face(x, y + 4, 5); hat(x - 5, y - 1); } else if (i % 3 === 1) mug(x - 3, y); else { face(x, y + 5, 4); pline(wx, [[x - 6, y + 13], [x - 2, y + 10], [x + 3, y + 10], [x + 7, y + 13]], ch); } }
    pline(wx, [[132, PY + 25], [150, PY + 22], [175, PY + 26], [205, PY + 23], [240, PY + 26], [290, PY + 22], [335, PY + 25]], ch);
    // coats on hooks along the panelling
    for (const [cx, col] of [[350, '#4a5a3a'], [360, '#7a3b2e'], [372, '#2f3a52']]) { px(wx, cx + 2, PY + 1, 2, 2, '#c9a43c'); px(wx, cx, PY + 3, 6, 16, col); px(wx, cx + 1, PY + 3, 1, 15, 'rgba(255,255,255,0.12)'); }
    // the bar's back: shelves with bottles, the TV above
    px(wx, 2, 14, 66, PY - 14, '#3a2617'); for (const sy of [24, 33]) { px(wx, 4, sy, 62, 2, '#6b4a30');
      for (let bx = 6; bx < 64; bx += 4) { const c = ['#2f5a33', '#7a2a24', '#c9a43c', '#e7e2d6', '#3b4f6e'][Math.floor(hash2(bx, sy, 2) * 5)]; px(wx, bx, sy - 6, 3, 6, c); px(wx, bx + 1, sy - 8, 1, 2, c); px(wx, bx, sy - 5, 1, 3, 'rgba(255,255,255,0.35)'); } }
    px(wx, 18, 3, 34, 10, '#111'); px(wx, 19, 4, 32, 8, '#20323d');
    // the toilet door
    px(wx, 94, 16, 26, WALL - 16, '#2c1b10'); px(wx, 96, 18, 22, WALL - 18, '#6e4429'); px(wx, 98, 20, 18, 18, '#7d4f31'); px(wx, 98, 41, 18, 24, '#7d4f31'); px(wx, 113, 42, 2, 2, '#d9b25a');
    px(wx, 101, 8, 12, 6, '#1d1d1d'); px(wx, 102, 9, 10, 4, '#f1ead8'); px(wx, 103, 10, 2, 2, '#1d1d1d'); px(wx, 107, 10, 3, 2, '#1d1d1d');
    for (const vx of [170, 214]) { px(wx, vx, 8, 26, 14, '#2c2a28'); for (let k = 0; k < 6; k++) px(wx, vx + 1, 9 + k * 2, 24, 1, '#6d6964'); }
    pcirc(wx, 300, 20, 8, '#2b2420'); for (let r = 7; r > 0; r--) pcirc(wx, 300, 20, r, '#f6f1e6');
    for (const w of WINDOWS) { px(wx, w.x - 3, 6, w.w + 6, PY - 2, '#d9c9b2'); px(wx, w.x, 9, w.w, PY - 8, '#0d1424'); px(wx, w.x - 3, PY + 1, w.w + 6, 3, '#f2e9da'); px(wx, w.x + 2, PY + 6, w.w - 4, 6, '#8c8378'); for (let i = 0; i < w.w - 4; i += 3) px(wx, w.x + 3 + i, PY + 6, 1, 6, '#6f675d'); }   // radiators under the windows
    // long tables with a bench each side, end-on to the back wall like in the photo
    for (const tx of [118, 198, 278]) {
      const ty = 56, tl = 146, tw = 24;
      s.piece(tw + 2, tl + 14, k => { plankTop(k, 1, 0, tw, tl, true); px(k, 1, tl, tw, 6, WOOD[1]); px(k, 1, tl, tw, 1, WOOD[0]); px(k, 2, tl + 6, 3, 8, WOOD[0]); px(k, tw - 3, tl + 6, 3, 8, WOOD[0]);
        for (let i = 0; i < 4; i++) { const gy = 10 + i * 34 + hash2(tx, i, 1) * 10, gx = 5 + (i % 2) * 11; px(k, gx, gy, 4, 5, 'rgba(230,180,80,0.85)'); px(k, gx, gy, 4, 2, '#f4f0e4'); px(k, gx + 4, gy + 1, 1, 3, 'rgba(255,255,255,0.4)'); }
        for (const cy of [40, 104]) { px(k, 10, cy, 5, 5, 'rgba(200,220,230,0.5)'); px(k, 12, cy + 1, 1, 2, '#fff2c0'); } }, tx - 1, ty, [tx, ty + 4, tx + tw, ty + tl + 2]);
      for (const cy of [40, 104]) CANDLES.push({ x: tx + 12, y: ty + cy + 2 });
      for (const [bx, face] of [[tx - 13, 1], [tx + tw + 4, 3]]) {
        s.piece(10, tl - 8 + 12, k => { plankTop(k, 0, 0, 9, tl - 8, true); px(k, 0, tl - 8, 9, 4, WOOD[1]); px(k, 1, tl - 4, 2, 8, WOOD[0]); px(k, 6, tl - 4, 2, 8, WOOD[0]); }, bx, ty + 4, [bx, ty + 8, bx + 9, ty + tl - 2]);
        for (let sy = ty + 18; sy < ty + tl - 8; sy += 20) s.seats.push({ x: bx + 4.5, y: sy, face, standX: bx + (face === 1 ? -8 : 17) });
      }
    }
    // square tables with bentwood chairs by the windows
    for (const [tx, ty] of [[386, 74], [470, 74], [386, 162], [470, 162]]) {
      s.piece(38, 34, k => { plankTop(k, 0, 0, 38, 24, false); px(k, 0, 24, 38, 5, WOOD[1]); px(k, 0, 24, 38, 1, WOOD[0]); px(k, 2, 29, 3, 5, WOOD[0]); px(k, 33, 29, 3, 5, WOOD[0]); px(k, 7, 6, 4, 5, 'rgba(230,180,80,0.85)'); px(k, 7, 6, 4, 2, '#f4f0e4'); px(k, 25, 8, 5, 5, 'rgba(200,220,230,0.5)'); px(k, 27, 9, 1, 2, '#fff2c0'); }, tx, ty, [tx, ty + 2, tx + 38, ty + 27]);
      CANDLES.push({ x: tx + 27, y: ty + 10 });
      for (const [cx, cy, back, face] of [[tx - 13, ty + 2, 'left', 1], [tx + 41, ty + 2, 'right', 3]]) {
        s.piece(12, 26, k => { px(k, 1, 8, 10, 8, '#2a1a10'); px(k, 2, 9, 8, 6, '#3a2416'); px(k, 2, 16, 2, 9, '#21140c'); px(k, 8, 16, 2, 9, '#21140c'); const bx = back === 'left' ? 0 : 9; px(k, bx, 0, 3, 16, '#22150d'); pcirc(k, bx + 1, 4, 3, '#22150d'); }, cx, cy, [cx + 1, cy + 8, cx + 11, cy + 18]);
        s.seats.push({ x: cx + 6, y: cy + 13, face, standX: cx + (face === 1 ? -6 : 18) });
      }
    }
    // the bar: a long counter down the left wall, beer taps, the barman's narrow lane behind it
    s.piece(BAR.w + 2, BAR.h + 16, k => { plankTop(k, 0, 0, BAR.w, BAR.h, true); px(k, 0, 0, BAR.w, 2, '#9a6a3d'); px(k, BAR.w - 3, 0, 3, BAR.h, '#8a5d36'); px(k, 0, BAR.h, BAR.w, 14, WOOD[1]); px(k, 0, BAR.h, BAR.w, 1, WOOD[0]); for (let i = 3; i < BAR.w; i += 6) px(k, i, BAR.h + 2, 1, 12, WOOD[0]);
      for (let i = 0; i < 3; i++) { const y = 40 + i * 14; px(k, 10, y, 8, 3, '#bfc6c9'); px(k, 13, y - 7, 2, 7, '#d6dcdf'); px(k, 12, y - 10, 4, 3, i === 1 ? '#c9a43c' : '#2b2b2b'); }
      for (let i = 0; i < 5; i++) { px(k, 6 + (i % 3) * 7, 96 + i * 9, 5, 7, '#e9c35a'); px(k, 6 + (i % 3) * 7, 96 + i * 9, 5, 2, '#fbf6e8'); } }, BAR.x, BAR.y, [BAR.x, BAR.y + 4, BAR.x + BAR.w, BAR.y + BAR.h + 4]);
    s.piece(14, 40, k => { px(k, 6, 4, 2, 34, '#2a1a10'); px(k, 2, 37, 10, 2, '#2a1a10'); px(k, 1, 6, 6, 12, '#5b6b4a'); px(k, 8, 4, 6, 15, '#7a3b2e'); px(k, 2, 2, 10, 2, '#2a1a10'); }, W - 26, 150, [W - 22, 184, W - 12, 190]);
    s.doors.push({ x0: 90, y0: 4, x1: 124, y1: 26, to: 'wc', at: [107, 18], name: 'záchod' });
    s.doors.push({ x0: W - 26, y0: 192, x1: W, y1: 236, to: 'street', at: [W - 16, 214], name: 'ven' });
    finish(s);
  }

  // ------------------------------------------------------------------ the toilet
  const WC = scene('wc', 210, 130, 64, 'Záchod');
  { const s = WC, W = s.W, H = s.H, WALL = s.WALL, fx = s.fx, wx = s.wx;
    texture(fx, W, H, (x, y) => { const g2 = x % 7 === 0 || y % 7 === 0, t = hash2(x / 7 | 0, y / 7 | 0, 2), dirt = hash2(x, y, 5) < 0.02 ? -20 : 0, base = ((x / 7 | 0) + (y / 7 | 0)) % 2 ? 232 : 220;
      return g2 ? [176, 182, 178] : [base + dirt - t * 6, base + 6 + dirt - t * 6, base + 2 + dirt - t * 6]; });
    px(wx, 0, 0, W, WALL, '#d6d0bd'); for (let y = 0; y < 26; y += 3) px(wx, 0, y, W, 1, 'rgba(0,0,0,0.03)');
    for (let y = 26; y < WALL; y++) for (let x = 0; x < W; x++) { const g2 = x % 8 === 0 || (y - 26) % 8 === 0; px(wx, x, y, 1, 1, g2 ? '#7f9a86' : ((x / 8 | 0) + ((y - 26) / 8 | 0)) % 3 ? '#a8c6b0' : '#9fbea8'); }
    px(wx, 0, 25, W, 2, '#6e8a76');
    // graffiti on the painted wall
    wx.font = '7px monospace'; wx.fillStyle = '#2b2b5a'; wx.fillText('Paťas byl tady', 8, 10); wx.fillStyle = '#5a2b2b'; wx.fillText('BOHEMKA', 120, 9); wx.fillStyle = '#2b2b2b'; wx.fillText('K+M', 160, 20); wx.fillText('IIII IIII II', 70, 21);
    pcirc(wx, 100, 12, 3, '#a33', 3.6, 6.0); pcirc(wx, 105, 12, 3, '#a33', 3.4, 5.8); pline(wx, [[97, 13], [102, 19], [108, 13]], '#a33');
    // two urinals with a divider, a sink with a mirror and a dripping tap, a stall in the corner
    for (const ux of [22, 52]) { px(wx, ux, 30, 14, 26, '#f4f4f0'); px(wx, ux + 2, 32, 10, 20, '#e2e4e0'); px(wx, ux + 5, 54, 4, 4, '#c9cbc6'); px(wx, ux + 6, 27, 2, 3, '#b8bcbf'); }
    px(wx, 44, 30, 2, 30, '#c9cbc6');
    px(wx, 84, 6, 26, 18, '#9fb3bb'); px(wx, 85, 7, 24, 16, '#c7d6dc'); pline(wx, [[88, 20], [100, 8]], '#e9f1f4'); px(wx, 84, 34, 26, 8, '#f4f4f0'); px(wx, 86, 36, 22, 4, '#dfe3e1'); px(wx, 96, 30, 2, 5, '#b8bcbf');
    s.piece(72, 82, k => { px(k, 0, 0, 3, 76, '#7a8f82'); px(k, 0, 74, 72, 8, '#8fa597'); px(k, 3, 0, 69, 74, '#e9ece8'); for (let y = 0; y < 74; y += 7) px(k, 3, y, 69, 1, '#d5dad6');
      px(k, 26, 6, 20, 16, '#f6f6f2'); px(k, 29, 9, 14, 10, '#d9e2e4'); px(k, 28, 2, 16, 5, '#e6e6e2'); px(k, 0, 74, 34, 8, '#6f8578'); px(k, 2, 76, 30, 4, '#7d9486'); px(k, 28, 77, 2, 2, '#c9a43c'); }, 136, 0, [136, 0, 210, 80]);
    s.piece(10, 16, k => { px(k, 1, 3, 8, 12, '#6b6f72'); px(k, 0, 2, 10, 2, '#8a8f93'); }, 116, 50, [117, 56, 125, 64]);
    s.doors.push({ x0: 86, y0: H - 22, x1: 124, y1: H, to: 'pub', at: [105, H - 14], name: 'zpátky' });
    s.spots = [[29, 18], [59, 18], [97, 22], [80, 70], [60, 80], [110, 90]];
    finish(s);
  }

  // ------------------------------------------------------------------ Korunní street
  const ST = scene('street', 760, 250, 118, 'Korunní');
  const TREES = [70, 250, 430, 590].map(x => ({ x, y: 30 })), LAMPS = [160, 340, 520, 700].map(x => ({ x, y: 64 }));
  const TAXI = { x: 150, y: 80, w: 58, h: 26 };
  { const s = ST, W = s.W, H = s.H, WALL = s.WALL, fx = s.fx, wx = s.wx;
    const mosaic = (x, y) => { const sq = ((x / 9 | 0) + (y / 9 | 0)) % 2, n = hash2(x >> 1, y >> 1, 9); const v = sq ? 205 - n * 40 : 70 - n * 30; return [v, v, v + 4]; };
    texture(fx, W, H, (x, y) => {
      if (y < 70) return mosaic(x, y);                                                             // the Prague mosaic pavement
      if (y < 76) return y === 70 ? [120, 120, 118] : [158 - (x % 24 === 0 ? 30 : 0), 156, 150];   // granite curb
      if (y > 204) return mosaic(x + 4, y);
      if (y > 198) return [158 - (x % 24 === 0 ? 30 : 0), 156, 150];
      const n = hash2(x, y, 3) * 14; let c = [54 + n, 55 + n, 58 + n];                                // asphalt
      for (const ty of [108, 148]) { if (y === ty || y === ty + 9) c = [138, 142, 146]; if (y === ty + 1 || y === ty + 10) c = [30, 30, 32]; }   // tram rails
      if (x >= 80 && x < 124 && y > 78 && y < 196 && (x - 80) % 10 < 6) c = [196, 196, 190];                  // the zebra crossing
      return c; });
    // facades: a cream house at the left, Lokál's ochre Art Nouveau house at the right
    px(wx, 0, 0, W, WALL, '#e2d3b2'); px(wx, 380, 0, W - 380, WALL, '#d6ad74');
    for (let y = 6; y < 54; y += 24) for (let x = 16; x < W; x += 46) { const lit = hash2(x, y, 4) > 0.55; px(wx, x - 3, y - 2, 26, 22, x > 380 ? '#efdcb8' : '#f2e8d4'); px(wx, x, y, 20, 18, lit ? '#e7b35c' : '#283246'); px(wx, x + 9, y, 2, 18, x > 380 ? '#efdcb8' : '#f2e8d4'); px(wx, x - 4, y + 18, 28, 3, '#cbb796'); }
    px(wx, 380, 58, W - 380, 4, '#b98d55'); px(wx, 0, 58, 380, 4, '#cbbd9b');                              // cornice above the shops
    px(wx, 0, 62, 380, WALL - 62, '#d9c9a6'); px(wx, 380, 62, W - 380, WALL - 62, '#c99d62');
    for (let y = 66; y < WALL; y += 8) px(wx, 380, y, W - 380, 1, '#b8894f');                               // rusticated ground floor
    px(wx, 60, 72, 90, 40, '#5b5f63'); for (let y = 74; y < 112; y += 3) px(wx, 60, y, 90, 1, '#4a4d50');     // a closed shutter
    for (const lx of [412, 470, 528, 586]) { px(wx, lx - 2, 70, 44, 46, '#8b6235'); px(wx, lx, 72, 40, 44, '#ffcf86'); for (let i = 0; i < 40; i += 4) px(wx, lx + i, 72, 2, 44, 'rgba(255,248,232,0.35)'); px(wx, lx, 90, 40, 2, '#8b6235'); }
    px(wx, 636, 66, 32, 50, '#3a2414'); px(wx, 639, 69, 26, 47, '#5a3a20'); px(wx, 650, 90, 2, 4, '#d9b25a');           // Lokál's door
    px(wx, 620, 46, 64, 12, '#1d1d1d'); wx.font = 'bold 9px serif'; wx.fillStyle = '#f2ead8'; wx.fillText('Lokál', 634, 56);
    px(wx, 350, 74, 22, 9, '#b0302a'); px(wx, 351, 75, 20, 7, '#f4ece0'); wx.font = '5px sans-serif'; wx.fillStyle = '#b0302a'; wx.fillText('KORUNNÍ', 352, 81);
    // trees in iron grates, lamps, the tram stop
    for (const t of TREES) { px(fx, t.x - 8, t.y - 4, 16, 8, '#2a2a2a'); for (let i = 0; i < 16; i += 2) px(fx, t.x - 8 + i, t.y - 4, 1, 8, '#4a4a4a'); s.piece(8, 26, k => { px(k, 2, 0, 4, 26, '#3a2a1e'); px(k, 2, 0, 1, 26, '#5a4430'); }, t.x - 4, t.y - 22, [t.x - 3, t.y - 2, t.x + 3, t.y + 2]); }
    for (const L of LAMPS) s.piece(10, 74, k => { px(k, 4, 6, 2, 68, '#2c2f33'); px(k, 3, 70, 4, 4, '#2c2f33'); px(k, 1, 0, 8, 6, '#2c2f33'); px(k, 2, 4, 6, 2, '#ffe2a8'); }, L.x - 5, L.y - 70, [L.x - 2, L.y - 2, L.x + 2, L.y + 2]);
    s.piece(64, 34, k => { px(k, 0, 0, 64, 4, '#3a3f45'); px(k, 0, 4, 64, 24, 'rgba(170,200,215,0.28)'); px(k, 0, 4, 2, 28, '#3a3f45'); px(k, 62, 4, 2, 28, '#3a3f45'); px(k, 6, 18, 40, 4, '#5a4a3a'); px(k, 48, 6, 12, 22, '#e9e2c8'); px(k, 49, 7, 10, 20, '#d97a4a'); }, 280, 10, [280, 30, 344, 40]);
    s.piece(8, 60, k => { px(k, 3, 10, 2, 50, '#3a3f45'); px(k, 0, 0, 8, 10, '#e8e8e2'); px(k, 1, 2, 6, 6, '#c22'); }, 352, -14, [353, 42, 359, 48]);
    // the taxi: an old cream Mercedes W124, parked at the curb, a man in the driver's seat
    s.piece(TAXI.w, TAXI.h + 6, k => { const w = TAXI.w, h = TAXI.h; px(k, 2, h, w - 4, 6, 'rgba(0,0,0,0.35)'); px(k, 0, 3, w, h - 6, '#e7dbba'); px(k, 2, 1, w - 4, h - 2, '#efe5c8'); px(k, 14, 4, 30, h - 8, '#d9cdaa');
      px(k, 12, 5, 6, h - 10, '#2b3644'); px(k, 40, 5, 6, h - 10, '#2b3644'); px(k, 19, 4, 20, 2, '#2b3644'); px(k, 19, h - 6, 20, 2, '#2b3644'); px(k, 24, 10, 10, 6, '#f2c437'); px(k, 25, 11, 8, 4, '#222'); k.font = '4px sans-serif'; k.fillStyle = '#f2c437'; k.fillText('TAXI', 25, 15);
      px(k, w - 2, 4, 2, 4, '#fff4c8'); px(k, w - 2, h - 8, 2, 4, '#fff4c8'); px(k, 0, 4, 2, 4, '#b02a22'); px(k, 0, h - 8, 2, 4, '#b02a22'); px(k, 38, 7, 4, 4, '#2a201a'); }, TAXI.x, TAXI.y, [TAXI.x, TAXI.y + 2, TAXI.x + TAXI.w, TAXI.y + TAXI.h]);
    s.doors.push({ x0: 632, y0: 2, x1: 672, y1: 24, to: 'pub', at: [652, 16], name: 'do hospody' });
    finish(s);
  }
  // where you arrive through each door
  const ARRIVE = { pub: { wc: [107, 30], street: [PUB.W - 34, 214] }, wc: { pub: [105, 108] }, street: { pub: [652, 30] } };

  // ================================================================== ART
  const SPR = {}, META = {};
  async function loadArt() {
    try { Object.assign(META, await (await fetch('art/sprites.json')).json()); } catch (e) { return; }
    await Promise.all(Object.keys(META).map(n => new Promise(res => { const im = new Image(); im.onload = () => { SPR[n] = im; res(); }; im.onerror = res; im.src = `art/${n}.png`; })));
  }
  const silCache = new Map();
  function sil(img) { if (silCache.has(img)) return silCache.get(img); const [c, x] = mk(img.width, img.height); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); silCache.set(img, c); return c; }

  // ================================================================== THE PEOPLE
  const LINES = {
    kevin: ['„Dvě děti, chlapi. Dvě.“', '„Mám propustku do jedenácti. Do jedenácti zítra.“', '„Žena volala. Nevidíte mě.“', '„Tohle je můj první večer od února.“'],
    patas: ['„Víte, že tady za Rakouska-Uherska byla… no, taky hospoda.“', '„Historicky vzato jsem měl ještě tak dvě.“', '„Já nejsem opilej. Já jsem v kontextu doby.“', '„Pánové, dějinnej okamžik. Další rundu.“'],
    stepa: ['„Já tu mám kolo, dám si jen jedno.“', '„Kolik je? Tak to jsem tu ještě dobrej.“', '„Zpátky to beru přes Riegráč. Z kopce.“', '„Kolo mám zamčený. Asi.“'],
    pazout: ['„Já jsem v zásadě konzervativec. Tradice, rodina, pořádek.“', '„…a občas malá procházka k taxíku.“', '„Nepůjdem na chvilku ven? Jen na vzduch.“', '„Za první republiky by tohle bylo úplně normální.“'],
    ado: ['„Kolik má tohle kalorií? Ne, neříkej mi to.“', '„Zítra v šest nohy. Takže ještě jedno.“', '„Ten výčepní má fakt hezký předloktí.“', '„Pivo je v podstatě tekutej chleba. Sacharidy, kluci.“'],
    kopinaut: ['„Viděls ten gól? Ne? Já taky ne, byl jsem venku.“', '„Bohemka. To je láska na celej život.“', '„Nepůjdem k taxíku? Mám takovej pocit.“', '„Ďolíček v zimě, to je víc než kostel.“'],
    bob: ['„Pivo.“', '„Ještě jedno pivo.“', '„Pivo je jídlo.“', '„Kde mám tričko? To je dobrá otázka.“'],
    sasa: ['„Já jsem úplně v pohodě. Fakt.“', '„Kdo jde ven? Nikdo? Já jdu ven.“', '„Hehe.“', '„Neznáte někoho, kdo zná někoho?“'],
    barman: ['„Tak co to bude?“', '„Pilsner z tanku. Nic jinýho nemáme a nic jinýho nechcete.“', '„Pánové, trochu tišeji.“', '„Dvanáct let za pípou. Tohle je ještě klidnej večer.“'],
  };
  // In the toilet people say what they would never say at the table.
  const WC_LINES = {
    kevin: '„Někdy mi chybí, jaký to bylo před dětma. A pak bych je nevyměnil za nic.“', patas: '„Víš, co je na historii nejhorší? Že se nedá vrátit.“',
    stepa: '„Já vždycky přijdu pozdě. Ale přijdu, ne?“', pazout: '„Mezi náma: já nejsem tak konzervativní, jak dělám.“', ado: '„Jsem rád, že jste moji kluci. Fakt.“',
    kopinaut: '„Bohemka spadne a já tu budu stejně. S váma.“', bob: '„Já vím, že piju moc. Ale s váma je to jiný pití.“', sasa: '„Já nejsem v pohodě. Ale teď jo.“',
  };
  const WC_ANY = ['„Kdo to sem napsal? …Aha, já.“', '„Víš, že tě mám rád, jo?“', '„Tohle je nejlepší hospoda na světě. A nejlepší hajzl.“'];
  const OUCH = ['„Au, vole!“', '„Za co?!“', '„Tohle si vypiješ.“', '„Hele, klid.“', '„Ty jsi fakt magor.“', '„To bolelo. Trochu.“'];
  const NAMES = { kevin: 'Kevin', patas: 'Paťas', stepa: 'Štěpa', pazout: 'Pažout', ado: 'Ado', kopinaut: 'Kopinaut', bob: 'Bob', sasa: 'Saša', barman: 'Výčepní' };
  const TRAITS = { patas: 'historik, opilý', stepa: 'cyklista, chodí pozdě', pazout: 'konzervativní feťák', ado: 'fitness, gay', kopinaut: 'Bohemka, feťák', bob: 'pije hodně piva', kevin: 'dvě děti, pivo', sasa: 'feťák, vždycky v pohodě' };
  const PLAYABLE = ['kevin', 'patas', 'stepa', 'pazout', 'ado', 'kopinaut', 'bob', 'sasa'];
  const OUTDOORSY = { pazout: 0.3, kopinaut: 0.35, sasa: 0.35 };   // who steps out to Korunní more often
  const START = { kevin: [PUB.W - 40, 214], patas: [171, 98], bob: [171, 136], sasa: [251, 104], pazout: [251, 142], ado: [72, 120], kopinaut: [524, 52], stepa: [12, 30], barman: [16, 110] };
  const cast = Object.keys(START).map(id => ({ id, x: START[id][0], y: START[id][1], scene: id === 'stepa' ? 'street' : 'pub', dir: 0, step: 0, moving: false, look: null, lookT: 2 + Math.random() * 3,
    path: null, plan: 'idle', planT: 2 + Math.random() * 6, line: 0, say: null, present: id !== 'stepa', idle: 0, ctrl: 'npc', tx: 0, ty: 0, sayKey: 0,
    seat: -1, beer: id === 'barman' ? -1 : (Math.random() < 0.7 ? 0.6 + Math.random() * 0.4 : -1), sipT: 0, drunk: 0, beers: 0, punchT: 0, hitT: 0, starsT: 0, kx: 0, ky: 0, puN: 0, pu: null }));
  const by = id => cast.find(c => c.id === id);
  let me = null;
  const sceneOf = c => SC[c.scene];
  const dirOf = (x, y) => Math.abs(x) > Math.abs(y) ? (x > 0 ? 1 : 3) : (y > 0 ? 0 : 2);
  const dirVec = d => [[0, 1], [1, 0], [0, -1], [-1, 0]][d];
  // drunk speech: vowels stretch, words slip
  function slur(t, d) { if (d < 0.25) return t; let o = ''; for (const ch of t) { o += ch; if ('aeiouyáéíóúůý'.includes(ch) && Math.random() < d * 0.25) o += ch; } return d > 0.7 ? o.replace(/“$/, ' …hik.“') : o; }
  function speak(c, text, dur) { c.say = { text, t: 0, dur: dur || 1.4 + text.length * 0.07 }; c.sayKey++; }
  function nextLine(c) { const L = LINES[c.id]; const t = L[c.line % L.length]; c.line++; return t; }
  function seatOcc(s, i) { return cast.some(c => c.scene === s.id && c.seat === i && c.present); }
  function sitDown(c, i) { const s = sceneOf(c), q = s.seats[i]; c.seat = i; c.x = q.x; c.y = q.y; c.dir = q.face; c.path = null; c.moving = false; c.look = null; }
  function standUp(c) { const s = sceneOf(c), q = s.seats[c.seat]; c.seat = -1; if (!q) return; for (const dy of [0, 6, -6, 12, -12]) if (!s.blocked(q.standX, q.y + dy)) { c.x = q.standX; c.y = q.y + dy; return; } c.x = q.standX; }
  function freeSeatNear(s, x, y, maxD) { let best = -1, bd = maxD; s.seats.forEach((q, i) => { const d = Math.hypot(q.x - x, q.y - y); if (d < bd && !seatOcc(s, i)) { bd = d; best = i; } }); return best; }

  // ------------------------------------------------------------------ paths
  function findPath(s, x0, y0, x1, y1) {
    const G = s.GC, GW = s.GW, GH = s.GH, grid = s.grid;
    const st = [clamp(x0 / G | 0, 0, GW - 1), clamp(y0 / G | 0, 0, GH - 1)], e = [clamp(x1 / G | 0, 0, GW - 1), clamp(y1 / G | 0, 0, GH - 1)];
    const key = (i, j) => j * GW + i, open = [[0, st[0], st[1]]], cost = new Map([[key(...st), 0]]), from = new Map();
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]); const [, i, j] = open.shift();
      if (i === e[0] && j === e[1]) { const pts = [[x1, y1]]; let k = key(i, j); while (from.has(k)) { k = from.get(k); pts.unshift([(k % GW) * G + G / 2, (k / GW | 0) * G + G / 2]); } return pts.filter((_, n) => n % 2 === 1 || n === pts.length - 1); }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH || (grid[key(ni, nj)] && !(ni === e[0] && nj === e[1]))) continue;
        if (di && dj && (grid[key(i + di, j)] || grid[key(i, j + dj)])) continue;
        const nc = cost.get(key(i, j)) + (di && dj ? 1.41 : 1); if (nc < (cost.get(key(ni, nj)) ?? 1e9)) { cost.set(key(ni, nj), nc); from.set(key(ni, nj), key(i, j)); open.push([nc + Math.hypot(e[0] - ni, e[1] - nj), ni, nj]); }
      }
      if (cost.size > 5000) break;
    }
    return [[x1, y1]];
  }
  function walkTo(c, x, y) { c.path = findPath(sceneOf(c), c.x, c.y, x, y); }
  function moveAlong(c, dt, speed) {
    if (!c.path || !c.path.length) { c.moving = false; return true; }
    const [tx, ty] = c.path[0], dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
    if (d < 3) { c.path.shift(); if (!c.path.length) { c.moving = false; return true; } return false; }
    const v = Math.min(d, speed * dt); c.x += dx / d * v; c.y += dy / d * v; c.dir = dirOf(dx, dy); c.step += dt * 9; c.moving = true; return false;
  }
  // go through a door: the friends standing close come along
  function goThrough(c, door, followers = []) {
    const to = door.to, at = ARRIVE[to][c.scene] || ARRIVE[to].pub || [40, 40];
    if (c.seat >= 0) c.seat = -1;
    c.scene = to; c.x = at[0]; c.y = at[1]; c.path = null; c.moving = false; c.dir = to === 'street' ? 0 : to === 'wc' ? 2 : (c.dir);
    followers.forEach((f, i) => { if (f.seat >= 0) f.seat = -1; f.scene = to; f.x = at[0] + [-14, 14, -8, 10][i % 4]; f.y = at[1] + 8 + (i >> 2) * 8; f.path = null; f.moving = false; f.plan = 'follow'; f.planT = 25 + Math.random() * 20; f.leader = c; });
  }

  // ================================================================== INPUT
  const keys = new Set();
  addEventListener('keydown', e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys.add(k);
    if (me && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
    if (!me || e.repeat) return; if (k === 'e' || k === ' ') use(); if (k === 'q') drink(me); if (k === 'f') punch(me); if (k === 'Escape') leave(); });
  addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  addEventListener('blur', () => keys.clear());
  let touch = null;
  canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') touch = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', e => { if (touch) { touch.x = e.clientX; touch.y = e.clientY; } });
  for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => { touch = null; });
  $('btn-e').addEventListener('click', () => me && use()); $('btn-q').addEventListener('click', () => me && drink(me)); $('btn-f').addEventListener('click', () => me && punch(me)); $('btn-tab').addEventListener('click', () => me && leave());
  function axis() {
    let x = (keys.has('d') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('a') || keys.has('ArrowLeft') ? 1 : 0);
    let y = (keys.has('s') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('w') || keys.has('ArrowUp') ? 1 : 0);
    if (touch) { const dx = touch.x - touch.x0, dy = touch.y - touch.y0, l = Math.hypot(dx, dy); if (l > 12) { x = dx / Math.max(l, 50); y = dy / Math.max(l, 50); } }
    return [x, y];
  }

  // ------------------------------------------------------------------ what E does here
  let askN = 0, ask = null, fade = 0, pending = null;
  function context() {   // the one thing E would do right now, for the hint and for use()
    if (!me) return null; const s = sceneOf(me);
    if (me.seat >= 0) return { k: 'stand', label: 'E: vstát' };
    for (const d of s.doors) if (me.x > d.x0 && me.x < d.x1 && me.y > d.y0 && me.y < d.y1) return { k: 'door', d, label: `E: ${d.name}` };
    if (s.id === 'pub' && me.x < BAR.x + BAR.w + 18 && me.y > BAR.y && me.y < BAR.y + BAR.h) return { k: 'bar', label: me.beer > 0.05 ? 'E: další pivo' : 'E: jedno pivo' };
    let best = null, bd = 30; for (const c of cast) if (c !== me && c.present && c.scene === me.scene) { const d = Math.hypot(c.x - me.x, c.y - me.y); if (d < bd) { bd = d; best = c; } }
    const seat = freeSeatNear(s, me.x, me.y, 16); if (seat >= 0 && (!best || bd > 12)) return { k: 'sit', i: seat, label: 'E: sednout si' };
    if (best) return { k: 'talk', c: best, label: `E: ${NAMES[best.id]}` };
    if (s.id === 'street' && me.x > TAXI.x - 16 && me.x < TAXI.x + TAXI.w + 16 && me.y < TAXI.y + 4) return { k: 'taxi', label: 'E: k taxíku' };
    return null;
  }
  function use() {
    const a = context(); if (!a) { speak(me, slur(nextLine(me), me.drunk)); return; }
    if (a.k === 'stand') standUp(me);
    else if (a.k === 'sit') sitDown(me, a.i);
    else if (a.k === 'door') { const near = cast.filter(c => c !== me && c.ctrl === 'npc' && c.present && c.scene === me.scene && c.id !== 'barman' && Math.hypot(c.x - me.x, c.y - me.y) < 46);
      fade = 1; pending = () => { goThrough(me, a.d, isHost() ? near : []); if (near.length && isHost()) speak(near[0], pick(['„Jdu s tebou.“', '„Počkej, jdu taky.“', '„Jo, jdem.“'])); camSnap = true; };
      if (!isHost() && near.length) ask = { target: near.map(c => c.id).join(','), n: ++askN, follow: a.d.to }; }
    else if (a.k === 'bar') { speak(me, slur('„Jedno, prosím.“', me.drunk), 1.8); ask = { target: 'barman', n: ++askN }; if (isHost()) answer('barman', me);
      setTimeout(() => { if (me) { me.beer = 1; me.beers++; } }, 1700); }
    else if (a.k === 'talk') { const c = a.c; me.dir = dirOf(c.x - me.x, c.y - me.y);
      if (c.ctrl === 'npc') { ask = { target: c.id, n: ++askN }; if (isHost()) answer(c.id, me); } else speak(me, slur(me.scene === 'wc' ? WC_LINES[me.id] : nextLine(me), me.drunk)); }
    else if (a.k === 'taxi') speak(me, '„Dobrý večer…“', 1.6), setTimeout(() => toast('Z taxíku: „Nastup si, šéfe. Ale až příště.“'), 1200);
  }
  let toastT = 0, toastText = '';
  const toast = t => { toastText = t; toastT = 3.5; };
  function answer(id, asker) {   // the host makes a pub-run character turn and reply
    const c = by(id); if (!c || c.ctrl !== 'npc') return;
    c.dir = dirOf(asker.x - c.x, asker.y - c.y); c.look = null; c.planT = Math.max(c.planT, 4);
    const line = c.scene === 'wc' && WC_LINES[c.id] ? (Math.random() < 0.6 ? WC_LINES[c.id] : pick(WC_ANY)) : nextLine(c);
    setTimeout(() => speak(c, slur(line, c.drunk)), id === 'barman' ? 900 : 300);
  }

  // ------------------------------------------------------------------ beer, punches
  function drink(c) {
    if (c.beer <= 0.02 || c.sipT > 0) { if (c === me && c.beer <= 0.02) toast('Nemáš pivo. Dojdi si k baru.'); return; }
    c.sipT = 1.3; c.beer = Math.max(0, c.beer - 0.25); c.drunk = Math.min(1.4, c.drunk + 0.06);
    if (c.beer <= 0.02) { c.beer = -1; if (Math.random() < 0.6) setTimeout(() => speak(c, slur(pick(['„Prázdný.“', '„Další?“', '„Ahh. Ještě jedno.“']), c.drunk)), 1300); }
  }
  let punches = [];   // recent punch times, for the barman's patience
  function punch(c) {
    if (c.punchT > 0 || c.seat >= 0) return;
    const [vx, vy] = dirVec(c.dir); let best = null, bd = 26;
    for (const o of cast) if (o !== c && o.present && o.scene === c.scene && o.id !== 'barman') { const dx = o.x - c.x, dy = o.y - c.y, d = Math.hypot(dx, dy); if (d < bd && (dx * vx + dy * vy) > -4) { bd = d; best = o; } }
    c.punchT = 0.28;
    if (!best) return;
    c.puN++; c.pu = { t: best.id, n: c.puN };
    land(c, best);
  }
  // the hit itself: everyone sees the stars; whoever runs the one who was hit moves him and makes him say something
  function land(from, to) {
    to.starsT = 1.5; to.hitT = 0.5; from.punchT = Math.max(from.punchT, 0.28);
    const owner = to === me || (to.ctrl === 'npc' && isHost());
    if (!owner) return;
    const d = Math.hypot(to.x - from.x, to.y - from.y) || 1; to.kx = (to.x - from.x) / d * 110; to.ky = (to.y - from.y) / d * 60;
    if (to.seat >= 0) standUp(to);
    if (to.beer > 0) { to.beer = Math.max(0, to.beer - 0.35); spills.push({ x: to.x + to.kx * 0.1, y: to.y + 4, t: now, scene: to.scene }); if (to.beer <= 0.02) to.beer = -1; }
    setTimeout(() => speak(to, slur(pick(OUCH), to.drunk)), 250);
    if (to.ctrl === 'npc' && Math.random() < 0.3) setTimeout(() => { to.dir = dirOf(from.x - to.x, from.y - to.y); punch(to); }, 700);
    if (isHost()) { punches = punches.filter(t => now - t < 60).concat(now); if (punches.length >= 4) { punches = []; const b = by('barman'); if (b.ctrl === 'npc' && to.scene === 'pub') setTimeout(() => speak(b, '„Pánové! Ještě jednou a jdete ven!“', 3), 600); } }
  }
  const spills = [];

  // ================================================================== THE NIGHT
  let clock = 20 * 60, now = 0, chatter = 6, camSnap = true, knockT = 25;
  const fmt = m => { const h = Math.floor(m / 60) % 24, mi = Math.floor(m % 60); return `Út ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`; };
  function lifeOf(c, dt) {
    const s = sceneOf(c);
    if (c.id === 'barman') { c.planT -= dt; if (c.planT <= 0) { c.planT = 4 + Math.random() * 6; walkTo(c, 16, BAR.y + 20 + Math.random() * (BAR.h - 40)); } if (moveAlong(c, dt, 26) && !c.say) c.dir = 1; idleLook(c, dt); return; }
    if (!c.present) { if (clock >= 20 * 60 + 40) { c.present = true; c.plan = 'door'; c.door = ST.doors[0]; walkTo(c, 652, 16); } return; }   // Štěpa, late as always
    c.planT -= dt;
    if (c.seat >= 0) {   // sitting: sip now and then, look at the others, get up when it is time
      if (c.beer > 0.02 && Math.random() < dt / 9) drink(c);
      if (c.planT <= 0) { standUp(c); c.plan = 'idle'; c.planT = 0; } else { idleLook(c, dt); return; }
    }
    if (c.plan === 'idle' && c.planT <= 0) {
      const r = Math.random(), heavy = c.id === 'bob' || c.id === 'kevin' || c.id === 'patas', out = OUTDOORSY[c.id] || 0.08;
      if (s.id !== 'pub') { c.plan = 'door'; c.door = s.doors[0]; walkTo(c, (c.door.x0 + c.door.x1) / 2, (c.door.y0 + c.door.y1) / 2); }
      else if (c.beer <= 0.02 && r < (heavy ? 0.8 : 0.5)) { c.plan = 'bar'; walkTo(c, BAR.x + BAR.w + 9, BAR.y + 30 + Math.random() * (BAR.h - 60)); }
      else if (r < 0.55) { const i = freeSeatNear(s, c.x + (Math.random() - 0.5) * 160, c.y + (Math.random() - 0.5) * 80, 400); if (i >= 0) { c.plan = 'seat'; c.seatGoal = i; const q = s.seats[i]; walkTo(c, q.standX, q.y); } else c.planT = 5; }
      else if (r < 0.55 + out) { c.plan = 'door'; c.door = s.doors[1]; walkTo(c, s.doors[1].at[0] - 10, s.doors[1].at[1]); }
      else if (r < 0.7 + out) { c.plan = 'door'; c.door = s.doors[0]; walkTo(c, 107, 20); }
      else { const o = cast.filter(o => o !== c && o.present && o.scene === c.scene && o.id !== 'barman'); const t = pick(o); if (t) { c.plan = 'visit'; c.target = t; walkTo(c, t.x + (Math.random() < 0.5 ? -18 : 18), t.y + 4); } else c.planT = 5; }
    }
    if (c.plan === 'follow') { const L = c.leader; if (!L || L.scene !== c.scene || c.planT <= 0) { c.plan = 'idle'; c.planT = 1; } else if (Math.hypot(L.x - c.x, L.y - c.y) > 36 && (!c.path || !c.path.length)) walkTo(c, L.x + (c.x < L.x ? -16 : 16), L.y + 6); }
    const arrived = moveAlong(c, dt, 34 - c.drunk * 6);
    if (arrived && c.plan !== 'idle' && c.plan !== 'follow') {
      if (c.plan === 'bar') { c.dir = 3; c.plan = 'wait'; c.planT = 2; speak(c, slur('„Jedno.“', c.drunk), 1.4); }
      else if (c.plan === 'wait' && c.planT <= 0) { c.beer = 1; c.beers++; c.plan = 'idle'; c.planT = 1; }
      else if (c.plan === 'seat') { if (!seatOcc(s, c.seatGoal)) { sitDown(c, c.seatGoal); c.planT = 25 + Math.random() * 40; } c.plan = 'idle'; if (c.seat < 0) c.planT = 2; }
      else if (c.plan === 'door') { goThrough(c, c.door); c.plan = c.scene === 'pub' ? 'idle' : 'away'; c.planT = c.scene === 'pub' ? 3 : 14 + Math.random() * 18;
        if (c.scene === 'wc') walkTo(c, ...pick(WC.spots)); if (c.scene === 'street') walkTo(c, 420 + Math.random() * 200, 20 + Math.random() * 30); }
      else if (c.plan === 'visit') { if (c.target) c.dir = dirOf(c.target.x - c.x, c.target.y - c.y); c.plan = 'idle'; c.planT = 8 + Math.random() * 12; if (!c.say && Math.random() < 0.5) speak(c, slur(nextLine(c), c.drunk)); }
      else if (c.plan === 'away' && c.planT <= 0) { c.plan = 'idle'; c.planT = 0; }
    }
    if (c.plan === 'away' && c.planT <= 0) { c.plan = 'idle'; c.planT = 0; }
    if (!c.moving) { idleLook(c, dt); if (c.beer > 0.02 && Math.random() < dt / 14) drink(c); }
  }
  function idleLook(c, dt) {
    if (c.moving || c.say) { c.look = null; return; }
    if ((c.lookT -= dt) <= 0) { const o = cast.filter(o => o !== c && o.present && o.scene === c.scene); const t = pick(o);
      c.look = c.seat >= 0 ? (Math.random() < 0.6 ? null : (t ? dirOf(t.x - c.x, t.y - c.y) : null)) : Math.random() < 0.65 && t ? dirOf(t.x - c.x, t.y - c.y) : Math.random() < 0.5 ? null : Math.floor(Math.random() * 4); c.lookT = 2 + Math.random() * 4; }
  }
  function update(dt) {
    now += dt; const host = isHost(); clock += dt * (host && keys.has('t') ? 20 : 1);
    if (fade > 0) { fade -= dt * 4; if (fade <= 0.5 && pending) { pending(); pending = null; } }
    if (me) {
      const [ax, ay] = axis(), l = Math.hypot(ax, ay), s = sceneOf(me);
      if (l > 0.1 && me.seat >= 0) standUp(me);
      me.moving = l > 0.1 && me.hitT <= 0;
      if (me.moving) { const sp = (62 - me.drunk * 10) * Math.min(1, l); let vx = ax / Math.max(1, l) * sp, vy = ay / Math.max(1, l) * sp;
        const sway = Math.sin(now * 2.3) * me.drunk * 22; vx += -ay / Math.max(1, l) * sway; vy += ax / Math.max(1, l) * sway;   // the floor tilts a little after a few
        if (!s.blocked(me.x + vx * dt, me.y)) me.x += vx * dt; if (!s.blocked(me.x, me.y + vy * dt)) me.y += vy * dt;
        me.dir = dirOf(ax, ay); me.step += dt * 10; me.look = null; me.idle = 0; } else { me.idle += dt; idleLook(me, dt); }
      me.drunk = Math.max(0, me.drunk - dt * 0.004);
    }
    for (const c of cast) {
      if (c.ctrl === 'npc' && host) lifeOf(c, dt);
      else if (c.ctrl === 'remote' || (c.ctrl === 'npc' && !host)) {
        const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy); if (d > 80) { c.x = c.tx; c.y = c.ty; } else { const k = Math.min(1, dt * 12); c.x += dx * k; c.y += dy * k; }
        if (c.moving) c.step += dt * 9; else if (c.seat < 0) idleLook(c, dt); }
      if (c.kx || c.ky) { const s = sceneOf(c); if (!s.blocked(c.x + c.kx * dt, c.y)) c.x += c.kx * dt; if (!s.blocked(c.x, c.y + c.ky * dt)) c.y += c.ky * dt; c.kx *= Math.exp(-dt * 9); c.ky *= Math.exp(-dt * 9); if (Math.abs(c.kx) + Math.abs(c.ky) < 2) c.kx = c.ky = 0; }
      c.sipT = Math.max(0, c.sipT - dt); c.punchT = Math.max(0, c.punchT - dt); c.hitT = Math.max(0, c.hitT - dt); c.starsT = Math.max(0, c.starsT - dt);
      if (c.say && (c.say.t += dt) > c.say.dur) c.say = null; }
    if (host && (chatter -= dt) <= 0) { chatter = 7 + Math.random() * 9; const o = cast.filter(c => c.present && c.ctrl === 'npc' && c.id !== 'barman' && !c.moving && !c.say); const c = pick(o);
      if (c) { const inWc = c.scene === 'wc' && cast.some(x => x !== c && x.scene === 'wc' && x.present); speak(c, slur(inWc ? (Math.random() < 0.6 ? WC_LINES[c.id] : pick(WC_ANY)) : nextLine(c), c.drunk)); } }
    if (toastT > 0) toastT -= dt;
    if (me && me.scene === 'wc' && (knockT -= dt) <= 0) { knockT = 30 + Math.random() * 30; toast(pick(['Ťuk, ťuk. „Bude to?“', 'Někdo bouchá na dveře. „Kluci, pospěšte si!“', 'Ťuk, ťuk. „Je tam někdo?“'])); }
    net(dt);
    for (const sm of smoke) { sm.x += sm.vx * dt; sm.y += Math.sin(now * 0.2 + sm.ph) * 2 * dt; if (sm.x > PUB.W + 120) sm.x = -120; }
  }
  const smoke = Array.from({ length: 7 }, (_, i) => ({ x: hash2(i, 1, 5) * PUB.W, y: hash2(i, 2, 5) * PUB.H * 0.8, r: 60 + hash2(i, 3, 5) * 70, vx: 2 + hash2(i, 4, 5) * 3, ph: i }));

  // ================================================================== DRAWING
  function frameOf(c) { const M = META[c.id]; const d = c.seat >= 0 ? (c.look ?? c.dir) : c.moving || c.look == null ? c.dir : c.look; return [([2, 1, 0, 3][d] * 4 + (c.moving ? Math.floor(c.step * 0.55) % 4 : 1)) * M.fw, M, d]; }
  function drawGlass(c, x, y, d) {   // a half-litre of Pilsner: gold, a cap of foam, a glint
    if (c.beer < 0 || d === 2) return;
    const lift = c.sipT > 0 ? Math.sin(Math.min(1, (1.3 - c.sipT) / 0.4) * Math.PI / 2) * Math.min(1, c.sipT / 0.3) : 0;
    const side = d === 1 ? 8 : d === 3 ? -12 : 7, gx = Math.round(x + 24 + side), gy = Math.round(y + 24 - lift * 10), lvl = Math.round(clamp(c.beer, 0, 1) * 6);
    px(g, gx, gy, 5, 7, 'rgba(220,235,240,0.55)'); if (lvl) px(g, gx, gy + 7 - lvl, 5, lvl, '#e3a92e'); if (lvl > 1) px(g, gx, gy + 6 - lvl, 5, 2, '#fbf6e8'); px(g, gx + 4, gy + 1, 1, 5, 'rgba(255,255,255,0.6)'); px(g, d === 3 ? gx - 1 : gx + 5, gy + 2, 1, 3, 'rgba(220,235,240,0.7)');
  }
  function drawPerson(c, ox, oy) {
    const im = SPR[c.id]; if (!im) return; const [sx, M, d] = frameOf(c);
    const [fx2, fy2] = dirVec(c.dir), lunge = c.punchT > 0 ? Math.sin((0.28 - c.punchT) / 0.28 * Math.PI) * 4 : 0, shake = c.hitT > 0 ? (Math.random() - 0.5) * 2 : 0;
    const sway = c.moving ? Math.sin(now * 2.3 + c.x * 0.01) * c.drunk * 2 : 0;
    const x = Math.round(c.x - ox + fx2 * lunge + shake + sway) - 24, y = Math.round(c.y - oy + fy2 * lunge * 0.5) - 44;
    if (c.seat >= 0) {   // sitting: the upper body on the bench, legs under the table
      const top = 31; g.drawImage(im, sx, 0, M.fw, top, x, y + 9, M.fw, top);
      drawGlass(c, x, y + 6, d); return;
    }
    const br = c.moving ? 0 : ((now + c.x * 0.01) % 3.4 > 1.7 ? 1 : 0), cut = 29;
    g.drawImage(im, sx, cut, M.fw, M.fh - cut, x, y + cut, M.fw, M.fh - cut); g.drawImage(im, sx, 0, M.fw, cut + 1, x, y + br, M.fw, cut + 1);
    if (d !== 2) drawGlass(c, x, y, d);
    if (c.punchT > 0) { const k = (0.28 - c.punchT) / 0.28, hx = Math.round(c.x - ox + fx2 * (10 + lunge * 2)), hy = Math.round(c.y - oy - 22 + fy2 * 6); px(g, hx - 1, hy - 1, 4, 4, '#e2b391'); px(g, hx - 1, hy - 1, 4, 1, '#c48f6b'); if (k > 0.2) for (let i = 1; i < 4; i++) px(g, hx - fx2 * i * 3, hy + (i % 2), 2, 1, `rgba(255,255,255,${0.5 - i * 0.12})`); }
  }
  function drawStars(c, ox, oy) { if (c.starsT <= 0) return; const X = c.x - ox, Y = c.y - oy - (c.seat >= 0 ? 38 : 48); for (let i = 0; i < 3; i++) { const a = now * 6 + i * 2.09; const sx2 = X + Math.cos(a) * 9, sy2 = Y + Math.sin(a) * 3; px(g, sx2 - 1, sy2, 3, 1, '#ffe25a'); px(g, sx2, sy2 - 1, 1, 3, '#ffe25a'); } }
  function blob(x, y, rx, ry, a) { g.save(); g.translate(x, y); g.scale(1, ry / rx); const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(30,16,8,${a})`); gr.addColorStop(0.6, `rgba(30,16,8,${a * 0.6})`); gr.addColorStop(1, 'rgba(30,16,8,0)'); g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore(); }
  let camX = 0, camY = 0;
  function draw() {
    const s = me ? sceneOf(me) : PUB, d = me ? me.drunk : 0;
    const fx = me ? me.x + Math.sin(now * 0.7) * d * 8 : s.W / 2 + Math.sin(now * 0.07) * 180, fy = me ? me.y + Math.cos(now * 0.53) * d * 5 : s.H / 2 - 30 + Math.sin(now * 0.05) * 30;
    const k = camSnap ? 1 : me ? 0.12 : 0.02; camSnap = false; camX += ((fx - VW / 2) - camX) * k; camY += ((fy - 20 - VH / 2) - camY) * k;
    const ox = Math.round(s.W + 24 < VW ? (s.W - VW) / 2 : clamp(camX, -12, s.W + 12 - VW)), oy = Math.round(s.H + s.WALL + 24 < VH ? (s.H - s.WALL - VH) / 2 + 0 : clamp(camY, -s.WALL - 8, s.H + 14 - VH));
    g.fillStyle = '#0d0907'; g.fillRect(0, 0, VW, VH);
    g.drawImage(s.floor, -ox, -oy); g.drawImage(s.wall, -ox, -s.WALL - oy);
    liveWall(s, ox, oy);
    for (const sp of spills) if (sp.scene === s.id && now - sp.t < 90) { const a = 0.35 * (1 - (now - sp.t) / 90); g.fillStyle = `rgba(190,140,40,${a})`; g.beginPath(); g.ellipse(sp.x - ox, sp.y - oy, 7, 3, 0, 0, 6.283); g.fill(); }
    const here = cast.filter(c => c.present && c.scene === s.id);
    for (const c of here) blob(c.x - ox, c.y - oy - 1, c.seat >= 0 ? 6 : 7.5, 2.6, 0.5);
    if (s.id === 'pub') for (const L of CHANDELIERS) for (const c of here) { if (c.seat >= 0) continue;
      const dx = c.x - L.x, dy = c.y - L.y, dd = Math.hypot(dx, dy); if (dd > 150 || dd < 1) continue; const a = 0.18 * (1 - dd / 150), im = SPR[c.id]; if (!im) continue; const [sx, M] = frameOf(c);
      g.save(); g.globalAlpha = a; g.setTransform(1, 0, -dx / dd * 0.6, -dy / dd * 0.35 - 0.2, Math.round(c.x - ox), Math.round(c.y - oy)); g.drawImage(sil(im), sx, 0, M.fw, 44, -24, -44, 48, 44); g.restore(); }
    const items = s.bands.map(b => ({ y: b.base, d: () => g.drawImage(b.p.c, 0, b.sy, b.p.w, b.sh, b.p.x - ox, b.p.y + b.sy - oy, b.p.w, b.sh) }));
    for (const c of here) items.push({ y: c.seat >= 0 ? c.y + 7 : c.y, d: () => drawPerson(c, ox, oy) });
    if (s.id === 'street') tramItem(items, ox, oy);
    items.sort((a, b) => a.y - b.y).forEach(i => i.d());
    px(g, -ox - 12, -s.WALL - oy, 12, s.H + s.WALL + 20, '#1c120b'); px(g, s.W - ox, -s.WALL - oy, 12, s.H + s.WALL + 20, '#1c120b'); px(g, -ox - 12, s.H - oy, s.W + 24, 14, '#24170e');
    if (s.id === 'pub') { px(g, s.W - ox - 2, 190 - oy, 14, 40, '#120a06'); px(g, s.W - ox, 190 - oy, 2, 40, '#6b4a30'); }
    if (s.id === 'wc') { px(g, 86 - ox, s.H - 2 - oy, 38, 16, '#5a3a22'); }
    light(s, ox, oy);
    for (const c of here) drawStars(c, ox, oy);
    for (const c of here) if (c.say) bubble(c, ox, oy);
    const a = context(); if (a && !me.say) { g.font = '8px VT323, monospace'; const t = a.label, w2 = g.measureText(t).width + 8, X = Math.round(me.x - ox - w2 / 2), Y = Math.round(me.y - oy + 6); px(g, X, Y, w2, 10, 'rgba(23,17,13,0.8)'); g.fillStyle = '#d9a441'; g.fillText(t, X + 4, Y + 8); }
    if (toastT > 0) { g.save(); g.globalAlpha = Math.min(1, toastT); g.font = '10px VT323, monospace'; const w2 = g.measureText(toastText).width + 12, X = Math.round((VW - w2) / 2), Y = VH - 46; px(g, X, Y, w2, 14, 'rgba(23,17,13,0.9)'); g.fillStyle = '#f3e9d8'; g.fillText(toastText, X + 6, Y + 10); g.restore(); }
    if (fade > 0) { g.fillStyle = `rgba(8,5,3,${1 - Math.abs(fade - 0.5) * 2})`; g.fillRect(0, 0, VW, VH); }
  }
  function liveWall(s, ox, oy) {
    if (s.id === 'pub') {
      for (const w of WINDOWS) { const X = w.x - ox, Y = -s.WALL - oy;
        px(g, X, Y + 9, w.w, 32, '#0f1830'); for (let i = 0; i < 4; i++) { const lx = X + 4 + i * 11; px(g, lx, Y + 14, 5, 7, hash2(i, w.x, 1) > 0.4 ? '#e9b45c' : '#26304a'); px(g, lx, Y + 27, 5, 7, hash2(i, w.x, 2) > 0.5 ? '#e0a24e' : '#26304a'); }
        const tram = tramPos(); if (tram && tram.x > w.x * 1.2 - 300 && tram.x < w.x * 1.2 + 40) px(g, X, Y + 33, w.w, 6, 'rgba(255,220,150,0.6)');
        px(g, X, Y + 36, w.w, 5, '#3a3f4a'); glow(X + w.w / 2, Y + 30, 14, '255,190,110', 0.5);
        for (const side of [0, 1]) { const sway = Math.sin(now * 0.7 + w.x + side) * 1.5; for (let k = 0; k < 9; k++) { const cx = side ? X + w.w - 1 - k : X + k; px(g, cx + (k > 5 ? sway : 0), Y + 9, 1, 32, `rgba(246,240,228,${0.55 - k * 0.04})`); } } }
      { const X = 19 - ox, Y = -s.WALL + 4 - oy, t = now * 0.8; px(g, X, Y, 32, 8, '#cfe2ea'); px(g, X + 15, Y, 1, 8, '#b33'); for (let i = 0; i < 6; i++) px(g, X + 3 + ((i * 7 + t * (i % 2 ? 9 : -7)) % 26 + 26) % 26, Y + 2 + (i % 3) * 2, 2, 2, i < 3 ? '#c22' : '#225'); px(g, X + ((t * 12) % 30), Y + 4, 1, 1, '#000'); }
      { const X = 300 - ox, Y = -s.WALL + 20 - oy, h = (clock / 60) % 12, m = clock % 60; pline(g, [[X, Y], [X + Math.sin(h / 12 * 6.283) * 4, Y - Math.cos(h / 12 * 6.283) * 4]], '#2b2420'); pline(g, [[X, Y], [X + Math.sin(m / 60 * 6.283) * 6, Y - Math.cos(m / 60 * 6.283) * 6]], '#2b2420'); }
    }
    if (s.id === 'wc') { const ph = (now * 1.3) % 1; px(g, 97 - ox, -s.WALL + 35 + ph * 22 - oy, 1, 2, `rgba(170,200,220,${1 - ph})`); }   // the dripping tap
  }
  // tram 22: about once a real minute (an hour of the night) it rolls through Korunní, one way then the other
  function tramPos() { const t = clock % 60; if (t > 12) return null; const right = Math.floor(clock / 60) % 2 === 0, k = t / 12; return { x: right ? -280 + k * (ST.W + 320) : ST.W + 40 - k * (ST.W + 320), y: right ? 104 : 144, right }; }
  function tramItem(items, ox, oy) {
    const T = tramPos(); if (!T) return;
    items.push({ y: T.y + 22, d: () => { const X = Math.round(T.x - ox), Y = Math.round(T.y - oy - 14), L = 240;
      px(g, X + 4, Y + 30, L - 8, 5, 'rgba(0,0,0,0.35)'); px(g, X, Y, L, 30, '#b8262a'); px(g, X, Y + 4, L, 10, '#efe4cc'); px(g, X + 2, Y + 16, L - 4, 10, '#8e1d21');
      for (let i = 8; i < L - 10; i += 14) px(g, X + i, Y + 5, 10, 7, '#ffe7a8'); px(g, X + (T.right ? L - 4 : 0), Y + 6, 4, 18, '#2a2a2a');
      for (const j of [60, 180]) { px(g, X + j, Y - 2, 14, 3, '#3a3a3a'); pline(g, [[X + j + 7, Y - 2], [X + j + 2, Y - 14], [X + j + 12, Y - 14]], '#2a2a2a'); }
      g.font = '8px VT323, monospace'; g.fillStyle = '#ffe25a'; g.fillText('22', X + (T.right ? L - 18 : 6), Y + 13); } });
  }
  function light(s, ox, oy) {
    g.save();
    const flick = s.id === 'wc' && hash2(Math.floor(now * 8), 1, 3) < 0.04 ? 0.6 : 1;
    const grade = s.id === 'pub' ? [228, 188, 150] : s.id === 'wc' ? [200 * flick, 214 * flick, 206 * flick] : [96, 110, 160];
    const dr = me ? clamp(me.drunk, 0, 1) : 0; grade[0] = Math.min(255, grade[0] + dr * 20); grade[2] = grade[2] - dr * 12;
    g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${grade.map(Math.round).join(',')})`; g.fillRect(0, 0, VW, VH);
    g.globalCompositeOperation = 'lighter';
    if (s.id === 'pub') {
      for (const L of CHANDELIERS) { const X = L.x - ox, Y = L.y - oy, fl = 0.97 + 0.03 * Math.sin(now * 3 + L.x); glow(X, Y, 160, '255,180,100', 0.22 * fl); glow(X, Y - 70, 40, '255,220,160', 0.45 * fl); glow(X, Y, 60, '255,214,160', 0.12); }
      for (const C of CANDLES) { const f = 0.8 + 0.2 * Math.sin(now * 9 + C.x) * Math.sin(now * 4.1 + C.y); glow(C.x - ox, C.y - oy, 26, '255,170,80', 0.22 * f); glow(C.x - ox, C.y - oy - 2, 5, '255,230,170', 0.6 * f); }
      for (const w of WINDOWS) glow(w.x - ox + w.w / 2, -oy + 18, 50, '120,150,230', 0.08);
      { const X = 35 - ox, Y = -s.WALL + 8 - oy, f = 0.6 + 0.4 * Math.abs(Math.sin(now * 5.3) * Math.sin(now * 1.7)); glow(X, Y + 18, 44, '170,200,255', 0.16 * f); }
      glow(44 - ox, BAR.y + 60 - oy, 100, '255,170,80', 0.12);
    } else if (s.id === 'wc') {
      glow(105 - ox, -20 - oy, 160, '220,245,235', 0.22 * flick); glow(97 - ox, -s.WALL + 14 - oy, 30, '230,245,255', 0.1);
    } else {
      for (const L of LAMPS) { glow(L.x - ox, L.y - oy - 66, 18, '255,220,160', 0.8); glow(L.x - ox, L.y - oy, 90, '255,170,90', 0.3); }
      for (const lx of [412, 470, 528, 586]) glow(lx + 20 - ox, 6 - oy, 50, '255,180,90', 0.28);
      glow(TAXI.x + 40 - ox, TAXI.y + 9 - oy, 4, '255,120,60', 0.5 + 0.4 * Math.sin(now * 2));   // a cigarette in the dark of the cab
      const T = tramPos(); if (T) { glow(T.x + 120 - ox, T.y - oy, 160, '255,230,170', 0.22); glow(T.x + (T.right ? 244 : -4) - ox, T.y - oy, 40, '255,250,220', 0.5); }
    }
    g.globalCompositeOperation = 'source-over';
    if (s.id === 'pub') {
      for (const sm of smoke) { const X = sm.x - ox, Y = sm.y - oy; if (X < -sm.r || X > VW + sm.r) continue; const gr = g.createRadialGradient(X, Y, 0, X, Y, sm.r); gr.addColorStop(0, 'rgba(220,205,185,0.07)'); gr.addColorStop(1, 'rgba(220,205,185,0)'); g.fillStyle = gr; g.fillRect(X - sm.r, Y - sm.r, sm.r * 2, sm.r * 2); }
      for (let i = 0; i < 40; i++) { const L = CHANDELIERS[i % 2], a = now * 0.1 + i, X = L.x - ox + Math.sin(a * 0.7 + i) * 50, Y = L.y - oy - 40 + Math.sin(a * 0.43 + i * 2) * 40; px(g, X, Y, 1, 1, `rgba(255,236,200,${0.25 + 0.2 * Math.sin(now + i)})`); }
      for (const L of CHANDELIERS) { const X = L.x - ox, Y = L.y - oy - 74, fl = 0.9 + 0.1 * Math.sin(now * 2 + L.x);
        px(g, X - 1, Y - 120, 2, 112, '#6b5226'); px(g, X - 1, Y - 120, 1, 112, '#a88a48');
        for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; pline(g, [[X, Y - 9], [X + Math.cos(a) * 20, Y + Math.sin(a) * 7]], 'rgba(150,118,56,0.8)'); }
        const back = [], front = []; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; (Math.sin(a) < 0 ? back : front).push(a); }
        const candle = a => { const bx = X + Math.cos(a) * 21, by2 = Y + Math.sin(a) * 7; px(g, bx - 1, by2 - 7, 3, 6, '#fff3d6'); px(g, bx - 1, by2 - 7, 1, 6, '#ffffff'); px(g, bx - 1, by2 - 1, 3, 2, '#8a6a2e'); };
        back.forEach(candle); for (let a = 0; a < 6.283; a += 0.03) px(g, X + Math.cos(a) * 21, Y + Math.sin(a) * 7, 1, 2, Math.sin(a) > 0 ? '#d6b25c' : '#8f7130'); front.forEach(candle);
        g.globalCompositeOperation = 'lighter'; glow(X, Y - 3, 46, '255,214,150', 0.32 * fl); glow(X, Y - 3, 16, '255,240,210', 0.35 * fl); g.globalCompositeOperation = 'source-over'; }
    }
    if (s.id === 'wc') { px(g, 60 - ox, -s.WALL - 6 - oy, 90, 5, '#d8dcd8'); px(g, 62 - ox, -s.WALL - 5 - oy, 86, 3, flick < 1 ? '#9aa' : '#f4fffb'); }
    if (s.id === 'street') {   // the lime trees' canopies and the tram wires overhead
      for (const t of TREES) { const X = t.x - ox, Y = t.y - oy - 46, sw = Math.sin(now * 0.8 + t.x) * 1.5;
        for (let i = 0; i < 26; i++) { const a = i * 2.4, r = 6 + hash2(i, t.x, 2) * 22, bx = X + Math.cos(a) * r + sw, by2 = Y + Math.sin(a) * r * 0.6; g.fillStyle = ['#1f3a22', '#284a2a', '#2f5531', '#3a6638'][i % 4]; g.beginPath(); g.arc(bx, by2, 9 - r * 0.15, 0, 6.283); g.fill(); } }
      for (const wy of [104, 144]) { px(g, -ox, wy - 40 - oy, ST.W, 1, 'rgba(20,20,24,0.8)'); }
    }
    const vg = g.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.35, VW / 2, VH / 2, Math.max(VW, VH) * 0.72); vg.addColorStop(0, 'rgba(20,10,4,0)'); vg.addColorStop(1, `rgba(20,10,4,${0.5 + dr * 0.2})`); g.fillStyle = vg; g.fillRect(0, 0, VW, VH);
    g.restore();
  }
  function bubble(c, ox, oy) {
    const L = c.say, shown = L.text.slice(0, Math.max(1, Math.floor(L.t * 32))), a = Math.min(1, L.t * 4, (L.dur - L.t) * 3);
    g.save(); g.globalAlpha = Math.max(0, a); g.font = '10px VT323, monospace';
    const w2 = Math.ceil(g.measureText(L.text).width) + 10, X = Math.round(clamp(c.x - ox - w2 / 2, 4, VW - w2 - 4)), Y = Math.round(c.y - oy - (c.seat >= 0 ? 42 : 52));
    px(g, X, Y - 10, w2, 14, 'rgba(23,17,13,0.9)'); px(g, Math.round(c.x - ox) - 1, Y + 4, 3, 2, 'rgba(23,17,13,0.9)');
    g.fillStyle = c === me ? '#f3e9d8' : '#f2d7a6'; g.fillText(shown, X + 5, Y + 1);
    g.font = '8px VT323, monospace'; g.fillStyle = '#b9a993'; if (c !== me) g.fillText(NAMES[c.id], X + 2, Y - 12);
    g.restore();
  }
  let hudKey = '';
  function hud() {
    const n = peersHere(), s = me ? sceneOf(me) : PUB, beers = me ? me.beers : 0, k = fmt(clock) + (me ? me.id : '') + n + s.id + beers; if (k === hudKey) return; hudKey = k;
    $('clock').textContent = `${fmt(clock)} · ${s.name}`;
    $('who').textContent = me ? NAMES[me.id] + (beers ? ` · ${beers} ${beers === 1 ? 'pivo' : beers < 5 ? 'piva' : 'piv'}` : '') + (n > 1 ? ` · nás ${n}` : '') : 'vyber si, za koho hraješ';
  }

  // ================================================================== ONLINE
  // Everyone who has the page open is in the same night. Each player's presence carries who they play, the scene,
  // where they stand or sit, their beer, the line they last said and the last punch they threw. The viewer with the
  // lowest peer label is the host: it runs everyone nobody plays and the clock, and shares them in its presence.
  let room = null, peers = [], sendT = 0, lastSent = '';
  const seenSay = new Map(), seenAsk = new Map(), seenPu = new Map();
  const viewers = () => peers.filter(p => p.kind === 'viewer');
  const lowestPeer = () => viewers().map(p => p.peer).sort()[0];
  function isHost() { if (!room) return true; const v = viewers(); if (!v.length) return true; const low = lowestPeer(); return v.some(p => p.sameTab && p.peer === low); }
  const peersHere = () => room ? Math.max(me ? 1 : 0, viewers().filter(p => p.presence && typeof p.presence.who === 'string').length) : (me ? 1 : 0);
  function claims() { const m = new Map(); for (const p of [...viewers()].sort((a, b) => a.peer < b.peer ? -1 : 1)) { const w = p.presence && p.presence.who; if (PLAYABLE.includes(w) && !m.has(w)) m.set(w, p); } return m; }
  const pack = c => [c.id, Math.round(c.x), Math.round(c.y), c.dir, c.moving ? 1 : 0, c.look ?? -1, c.present ? 1 : 0, c.sayKey, c.say ? c.say.text : '', c.scene, c.seat, Math.round(c.beer * 100), c.sipT > 0 ? 1 : 0, Math.round(c.drunk * 100), c.pu ? c.pu.t : '', c.pu ? c.pu.n : 0];
  function unpack(c, e, remoteSpeech) {
    c.tx = +e[1] || c.x; c.ty = +e[2] || c.y; c.dir = (e[3] | 0) & 3; c.moving = !!e[4]; c.look = e[5] >= 0 ? e[5] & 3 : null;
    const sc = SC[e[9]] ? e[9] : 'pub'; if (sc !== c.scene || !c.present) { c.x = c.tx; c.y = c.ty; } c.scene = sc; c.present = !!e[6];
    c.seat = Number.isInteger(e[10]) ? e[10] : -1; if (c.seat >= 0) { c.x = c.tx; c.y = c.ty; }
    c.beer = Number.isFinite(e[11]) ? e[11] / 100 : -1; if (e[12] && c.sipT <= 0) c.sipT = 1.3; c.drunk = Number.isFinite(e[13]) ? e[13] / 100 : 0;
    if (e[7] !== seenSay.get(c.id)) { const first = !seenSay.has(c.id); seenSay.set(c.id, e[7]); if (!first && typeof e[8] === 'string' && e[8]) speak(c, e[8].slice(0, 160)); }
    if (e[15] !== seenPu.get(c.id)) { const first = !seenPu.has(c.id); seenPu.set(c.id, e[15]); const t = by(e[14]); if (!first && t && e[15]) land(c, t); }
  }
  function net(dt) {
    if (!room || (sendT -= dt) > 0) return; sendT = 1 / 15;
    const P = me ? { who: me.id, me: pack(me), ask } : { who: null, me: null, ask: null };
    if (isHost()) { P.clock = Math.round(clock * 10) / 10; P.npc = cast.filter(c => c.ctrl === 'npc').map(pack); } else { P.clock = null; P.npc = null; }
    const k = JSON.stringify(P); if (k === lastSent) return; lastSent = k; room.presence(P).catch(() => {});
  }
  function applyPeers() {
    peers = room ? room.peers() : [];
    const cl = claims(), host = isHost();
    if (me && cl.get(me.id) && !cl.get(me.id).sameTab) { const lost = me.id; leave(); showIntro(`${NAMES[lost]} už hraje někdo jiný. Vyber si jiného.`); }
    for (const c of cast) {
      if (c === me) continue;
      const p = cl.get(c.id);
      if (p && !p.sameTab) { const q = p.presence; if (c.ctrl !== 'remote') { c.ctrl = 'remote'; c.path = null; }
        if (Array.isArray(q.me) && q.me[0] === c.id) unpack(c, q.me);
        if (q.ask && typeof q.ask === 'object') { const n = q.ask.n, first = !seenAsk.has(p.peer); if (n !== seenAsk.get(p.peer)) { seenAsk.set(p.peer, n);
          if (!first && host && typeof q.ask.target === 'string') { if (q.ask.follow && SC[q.ask.follow]) { const fol = q.ask.target.split(',').map(by).filter(f => f && f.ctrl === 'npc'); const door = sceneOf(c).doors.find(d => d.to === q.ask.follow); if (door) setTimeout(() => goThrough(c, door, fol), 0); }
            else answer(q.ask.target, c); } } } }
      else if (c.ctrl === 'remote') { c.ctrl = 'npc'; c.path = null; c.plan = 'idle'; c.planT = 3; }
    }
    if (!host) { const h = viewers().find(p => p.peer === lowestPeer()), q = h && h.presence;
      if (q && Array.isArray(q.npc)) for (const e of q.npc) { const c = by(e && e[0]); if (c && c.ctrl === 'npc' && Array.isArray(e)) unpack(c, e); }
      if (q && typeof q.clock === 'number' && Math.abs(q.clock - clock) > 1.5) clock = q.clock; }
    renderCards();
  }
  async function connect() {
    try { if (!window.claude || !window.claude.use) return; const r = await window.claude.use('room'); if (!r) return;
      room = r; r.onPeers(() => applyPeers(), () => { room = null; peers = []; renderCards(); }); } catch (e) { room = null; }
  }

  // ================================================================== THE INTRO: who are you tonight?
  function portrait(id) {
    const f = SPR['face-' + id]; if (f) { const [c, k] = mk(64, 64); k.drawImage(f, 0, 0, 64, 64); return c; }
    const [c, k] = mk(48, 34), im = SPR[id]; if (im) k.drawImage(im, 8 * 48, 2, 48, 34, 0, 0, 48, 34); return c;
  }
  function renderCards(note) {
    const box = $('cards'); if (!box) return; const cl = claims();
    if (!box.childElementCount) for (const id of PLAYABLE) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'card'; b.dataset.id = id;
      const cv = portrait(id); cv.className = 'face'; const n = document.createElement('b'); n.textContent = NAMES[id]; const t = document.createElement('span'); t.textContent = TRAITS[id]; const st = document.createElement('i');
      b.append(cv, n, t, st); b.addEventListener('click', () => enter(id)); box.append(b); }
    for (const b of box.children) { const p = cl.get(b.dataset.id), mine = me && me.id === b.dataset.id, taken = p && !p.sameTab;
      b.disabled = !!taken; b.classList.toggle('taken', !!taken); b.querySelector('i').textContent = mine ? 'ty' : taken ? 'hraje někdo' : 'volný'; }
    const n = viewers().length, line = $('intro-note');
    if (note) line.textContent = note;
    else line.textContent = room ? (n > 1 ? `Online · na stránce je vás ${n}. Každý hraje za jednoho.` : 'Online · zatím jsi tu sám. Pošli odkaz klukům.') : 'Hraješ sám. Online se hraje přes sdílený odkaz na tuhle stránku.';
  }
  function showIntro(note) { $('intro').hidden = false; renderCards(note); const f = $('cards').querySelector('button:not(:disabled)'); if (f) f.focus(); }
  function enter(id) {
    const p = claims().get(id); if (p && !p.sameTab) { renderCards(`${NAMES[id]} už hraje někdo jiný.`); return; }
    if (me) leave(true);
    me = by(id); me.ctrl = 'me'; me.path = null; me.moving = false;
    if (!me.present) { me.present = true; me.scene = 'pub'; me.x = PUB.W - 34; me.y = 214; }
    $('intro').hidden = true; hudKey = ''; lastSent = ''; camSnap = true;
  }
  function leave(quiet) {
    if (!me) return; const c = me; me = null; c.ctrl = 'npc'; c.path = null; c.plan = 'idle'; c.planT = 3; c.moving = false; lastSent = ''; hudKey = ''; camSnap = true;
    if (!quiet) showIntro();
  }

  // ================================================================== GO
  let last = performance.now();
  function frame(t) { const dt = Math.min(0.05, (t - last) / 1000); last = t; update(dt); draw(); hud(); requestAnimationFrame(frame); }
  await loadArt();
  try { await document.fonts.load('10px VT323', 'Dvě děti, chlapi. Žena volala. Paťas Štěpa Pažout Saša Výčepní ťuk'); } catch (e) {}
  // seat the pub before the night starts: most of them already have a table
  for (const c of cast) if (c.present && c.id !== 'barman' && c.id !== 'ado' && c.id !== 'kevin' && Math.random() < 0.85) { const i = freeSeatNear(PUB, c.x, c.y, 400); if (i >= 0) { sitDown(c, i); c.planT = 10 + Math.random() * 40; } }
  $('load')?.remove();
  window.__game = { cast, by, keys, use, drink, punch, enter, leave, isHost, context, SC, get me() { return me; }, setClock: m => { clock = m; }, tramPos };
  showIntro(); connect();
  window.__ready = true;
  requestAnimationFrame(frame);
})();
