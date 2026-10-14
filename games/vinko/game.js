// Vínko: one long night in Lokál Korunní. Top-down pixel art on a canvas. Three scenes (the pub, the toilet and
// Korunní street) are painted once each; the people are RetroDiffusion walk sheets; light is laid over each frame.
// Online through the artifact room: every player's presence carries who they play and what they are doing, and one
// host page runs everyone nobody plays.
(async () => {
  const $ = id => document.getElementById(id);
  const canvas = $('c'), g = canvas.getContext('2d');
  let VW = 600, VH = 330, SCALE = 2;
  function resize() {
    SCALE = Math.max(2, Math.round(Math.min(innerWidth / 400, innerHeight / 225)));
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
    s.piece = (w, h, paint, x, y, solid, base) => { const [c, k] = mk(w, h); paint(k, w, h); s.pieces.push({ c, x, y, w, h, base }); if (solid) s.block(...solid); };   // base: sort the whole piece at one depth
    [s.floor, s.fx] = mk(W, H); [s.wall, s.wx] = mk(W, WALL);
    SC[id] = s; return s;
  }
  function finish(s) {
    s.bands = []; for (const p of s.pieces) for (let y = 0; y < p.h; y += 8) s.bands.push({ p, sy: y, sh: Math.min(8, p.h - y), base: p.base ?? p.y + Math.min(p.h, y + 8) - (y + 8 >= p.h ? 6 : 0) });
    s.blocked = (x, y, r = 3) => x < 6 || y < 8 || x > s.W - 6 || y > s.H - 6 || s.solids.some(q => x + r > q[0] && x - r < q[2] && y + r > q[1] && y - r < q[3]);
    s.GC = 6; s.GW = Math.ceil(s.W / s.GC); s.GH = Math.ceil(s.H / s.GC); s.grid = new Uint8Array(s.GW * s.GH);
    for (let j = 0; j < s.GH; j++) for (let i = 0; i < s.GW; i++) s.grid[j * s.GW + i] = s.blocked(i * s.GC + s.GC / 2, j * s.GC + s.GC / 2, 4) ? 1 : 0;
  }
  const WOOD = ['#3b2414', '#4f311c', '#5e3a21', '#6f4528', '#7f5131'];
  function plankTop(k, x, y, w, h, vertical) { px(k, x, y, w, h, WOOD[3]); for (let i = 0; i < (vertical ? w : h); i++) { const q = hash2(i, x + y, 7); if (q > 0.8) vertical ? px(k, x + i, y, 1, h, WOOD[2]) : px(k, x, y + i, w, 1, WOOD[2]); if (q < 0.12) vertical ? px(k, x + i, y, 1, h, WOOD[4]) : px(k, x, y + i, w, 1, WOOD[4]); } px(k, x, y, w, 1, WOOD[4]); px(k, x, y, 1, h, WOOD[4]); }

  // ------------------------------------------------------------------ the pub: Lokál Korunní
  // Two rooms in one: the tap room on the corner (arched windows, the steel island bar with the tank behind glass)
  // and the long dining hall (benches and long tables, bentwood chairs by the side windows, the chalk-drawn panelling).
  const PUB = scene('pub', 580, 250, 84, 'Lokál Korunní');
  const BAR = { x: 48, y: 44, w: 104, h: 28, face: 22 };          // the island's footprint on the floor; its top is drawn 22 px higher
  const ARCHES = [{ x: 8, w: 32 }, { x: 160, w: 32 }];
  const CHANDELIERS = [{ x: 100, y: 150, hang: 84 }, { x: 300, y: 120, hang: 74 }, { x: 470, y: 120, hang: 74 }];
  const CANDLES = [];
  const SIDE_WINDOWS = [40, 110, 180];                              // windows in the right-hand wall, onto Šumavská
  { const s = PUB, W = s.W, H = s.H, WALL = s.WALL, fx = s.fx, wx = s.wx;
    const OAK = ['#8e5f37', '#986640', '#a06c44', '#a87249', '#92623b', '#885a34'].map(hex);
    texture(fx, W, H, (x, y) => { const C = 8, col = Math.floor(x / C), lx = x - col * C, dir = col % 2 ? 1 : -1, v = y + (dir > 0 ? lx : C - 1 - lx) * 0.5, plank = Math.floor(v / 3), lv = v - plank * 3;
      const h = hash2(col, plank, 3), c = OAK[Math.floor(h * OAK.length)], groove = lv < 0.55 || lx === 0, grain = (hash2(x >> 2, y, 4) - 0.5) * 6 + Math.sin((x + y * 3) * 0.9 + h * 20) * 2, k = groove ? 0.8 : 1;
      return [clamp(c[0] * k + grain, 0, 255), clamp(c[1] * k + grain * 0.8, 0, 255), clamp(c[2] * k + grain * 0.5, 0, 255)]; });
    { const gr = fx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,230,190,0.08)'); gr.addColorStop(0.5, 'rgba(255,230,190,0)'); gr.addColorStop(1, 'rgba(40,20,10,0.18)'); fx.fillStyle = gr; fx.fillRect(0, 0, W, H); }
    // a steel grate behind the bar where the barmen stand, as in the photo
    for (let y = 8; y < 42; y++) for (let x = 42; x < 158; x++) px(fx, x, y, 1, 1, (x + y) % 4 === 0 ? '#6c7176' : (x % 4 === 0 || y % 4 === 0) ? '#7f8489' : '#9aa0a5');
    // wallpaper: cream with a red stamped pattern, over the whole tap room and above the panelling in the hall
    px(wx, 0, 0, W, WALL, '#efe2cf');
    for (let y = 4; y < WALL; y += 12) for (let x = (y / 12 % 2) * 7; x < W; x += 14) { const c = '#c27466'; px(wx, x + 3, y, 2, 1, c); px(wx, x + 2, y + 1, 4, 1, c); px(wx, x + 1, y + 2, 2, 2, c); px(wx, x + 5, y + 2, 2, 2, c); px(wx, x + 3, y + 3, 2, 3, c); px(wx, x + 2, y + 6, 1, 1, '#d79a8c'); px(wx, x + 5, y + 6, 1, 1, '#d79a8c'); }
    px(wx, 0, 0, W, 3, '#f7efe2'); px(wx, 0, 3, W, 1, '#d8c8b0'); px(wx, 0, WALL - 3, 200, 3, '#5b3a24');
    // the tap room: two tall arched windows to Korunní with dark brown frames, and the steel back counter between them
    for (const a of ARCHES) { const X = a.x, Y0 = 12, Y1 = WALL - 8, r = a.w / 2;
      px(wx, X - 3, Y0 + r - 3, a.w + 6, Y1 - Y0 - r + 6, '#e6d8c2'); for (let k = 0; k <= r + 3; k++) { const hh = Math.round(Math.sqrt(Math.max(0, (r + 3) ** 2 - (k - r - 3 + 0.5) ** 2))); }
      for (let yy = Y0 - 3; yy < Y1 + 3; yy++) for (let xx = X - 3; xx < X + a.w + 3; xx++) { const dx = xx - (X + r - 0.5), dy = yy - (Y0 + r); const inArch = yy >= Y0 + r || dx * dx + dy * dy <= (r + 3) ** 2; if (!inArch) continue;
        const inner = (yy >= Y0 + r || dx * dx + dy * dy <= r * r) && xx >= X && xx < X + a.w && yy < Y1; px(wx, xx, yy, 1, 1, inner ? '#0f1830' : '#4a2c18'); }
      px(wx, X + r - 1, Y0, 2, Y1 - Y0, '#4a2c18'); px(wx, X, Y0 + r + 8, a.w, 2, '#4a2c18'); px(wx, X - 4, Y1, a.w + 8, 3, '#e9dcc6'); }
    px(wx, 48, WALL - 34, 104, 34, '#b8bec3'); px(wx, 48, WALL - 34, 104, 2, '#e3e7ea'); px(wx, 48, WALL - 4, 104, 4, '#8a9095');
    for (const sy of [WALL - 62, WALL - 50]) { px(wx, 52, sy, 96, 2, 'rgba(210,230,240,0.7)'); for (let bx = 54; bx < 146; bx += 6) { px(wx, bx, sy - 7, 4, 7, 'rgba(230,240,245,0.6)'); px(wx, bx + 1, sy - 6, 1, 5, 'rgba(255,255,255,0.7)'); } }   // glass shelves of upturned mugs
    for (let i = 0; i < 4; i++) px(wx, 62 + i * 24, WALL - 28, 14, 18, '#a9afb4');
    // the hall: tall dark panelling covered in white chalk drawings, the toilet door, two vents above
    const PX0 = 200, PY = WALL - 56; px(wx, PX0, PY, W - PX0, 56, '#5b3a24'); px(wx, PX0, PY, W - PX0, 2, '#7a5034'); px(wx, PX0, PY + 2, W - PX0, 1, '#3e2716');
    for (let x = PX0; x < W; x += 34) px(wx, x, PY + 3, 1, 53, '#4a2e1b');
    const ch = '#f4efe6';
    const face = (x, y, r) => { pcirc(wx, x, y, r, ch); px(wx, x - 2, y - 1, 1, 1, ch); px(wx, x + 2, y - 1, 1, 1, ch); pcirc(wx, x, y + 1, r * 0.5, ch, 0.4, 2.7); };
    const mug = (x, y) => { pline(wx, [[x, y], [x, y + 9], [x + 7, y + 9], [x + 7, y]], ch); pcirc(wx, x + 9, y + 4, 3, ch, -1.4, 1.4); pline(wx, [[x - 1, y - 1], [x + 2, y - 3], [x + 5, y - 2], [x + 8, y - 3]], ch); };
    const hat = (x, y) => { pline(wx, [[x, y], [x, y - 4], [x + 2, y - 7], [x + 5, y - 6], [x + 8, y - 8], [x + 10, y - 5], [x + 10, y]], ch); pline(wx, [[x, y], [x + 10, y]], ch); };
    const body = (x, y) => { pline(wx, [[x, y], [x - 4, y + 10], [x - 6, y + 22]], ch); pline(wx, [[x, y], [x + 5, y + 10], [x + 7, y + 22]], ch); pline(wx, [[x - 3, y + 6], [x - 10, y + 2]], ch); pline(wx, [[x + 3, y + 6], [x + 10, y + 1]], ch); };
    for (let i = 0; i < 13; i++) { const x = PX0 + 50 + i * 27 + (hash2(i, 1, 9) - 0.5) * 8, y = PY + 10 + hash2(i, 2, 9) * 8;
      if (i % 4 === 0) { face(x, y + 4, 6); hat(x - 5, y - 2); body(x, y + 11); } else if (i % 4 === 1) { mug(x - 3, y + 6); mug(x + 6, y + 14); } else if (i % 4 === 2) { face(x, y + 6, 5); body(x, y + 12); } else { pcirc(wx, x, y + 18, 9, ch, 3.3, 6.1); pline(wx, [[x - 9, y + 18], [x + 9, y + 18]], ch); face(x, y + 6, 4); } }
    px(wx, 216, PY - 6, 30, 62, '#2c1b10'); px(wx, 218, PY - 4, 26, 60, '#6e4429'); px(wx, 221, PY - 1, 20, 22, '#7d4f31'); px(wx, 221, PY + 25, 20, 28, '#7d4f31'); px(wx, 239, PY + 26, 2, 3, '#d9b25a');
    px(wx, 224, PY - 16, 14, 7, '#1d1d1d'); px(wx, 225, PY - 15, 12, 5, '#f1ead8'); wx.font = '5px sans-serif'; wx.fillStyle = '#1d1d1d'; wx.fillText('WC', 226, PY - 11);
    for (const vx of [300, 360]) { px(wx, vx, 6, 30, 16, '#2c2a28'); for (let k = 0; k < 7; k++) px(wx, vx + 1, 7 + k * 2, 28, 1, '#6d6964'); }
    // the island bar: brushed steel, four taps, a drip tray; through its glass front the polished Pilsner tank
    s.piece(BAR.w, BAR.h + BAR.face, k => { const w = BAR.w, h = BAR.h, f = BAR.face;
      for (let y = 0; y < h; y++) px(k, 0, y, w, 1, y % 3 ? '#c9ced2' : '#bfc5c9'); px(k, 0, 0, w, 1, '#eef1f3'); px(k, 0, h - 1, w, 1, '#8d9398');
      px(k, 30, 9, 44, 6, '#8d9398'); for (let i = 0; i < 4; i++) { const tx = 36 + i * 10; px(k, tx, 4, 3, 8, '#e5e9ec'); px(k, tx - 1, 3, 5, 2, '#f7f9fa'); px(k, tx, 11, 3, 2, '#5d6266'); }
      px(k, 0, h, w, f, '#1d2226'); px(k, 2, h + 1, w - 4, f - 3, 'rgba(120,140,150,0.35)');
      for (const cx of [28, 76]) { for (let r = 9; r >= 0; r--) { const c = r > 7 ? '#6f6a64' : r > 4 ? '#c7c2ba' : r > 2 ? '#e6e1d9' : '#a9a49c'; pcirc(k, cx, h + f / 2, r, c); } for (let a = 0; a < 6.28; a += 0.7) px(k, cx + Math.cos(a) * 8, h + f / 2 + Math.sin(a) * 8, 1, 1, '#4a4642'); px(k, cx - 4, h + 5, 3, 2, '#ffffff'); }
      pline(k, [[4, h + 3], [16, h + f - 2]], 'rgba(255,255,255,0.18)'); pline(k, [[54, h + 3], [66, h + f - 2]], 'rgba(255,255,255,0.18)');
      px(k, 0, h + f - 2, w, 2, '#8d9398'); px(k, 0, h, 2, f, '#8d9398'); px(k, w - 2, h, 2, f, '#8d9398'); }, BAR.x, BAR.y - BAR.face, [BAR.x, BAR.y, BAR.x + BAR.w, BAR.y + BAR.h], BAR.y + BAR.h);
    s.doors.push({ x0: 212, y0: 4, x1: 250, y1: 26, to: 'wc', at: [231, 18], name: 'záchod' });
    s.doors.push({ x0: 72, y0: 226, x1: 128, y1: 250, to: 'street', at: [100, 240], name: 'ven na Korunní' });
    finish(s);
  }

  // ------------------------------------------------------------------ the toilet
  const WC = scene('wc', 190, 84, 64, 'Záchod');
  { const s = WC, W = s.W, H = s.H, WALL = s.WALL, fx = s.fx, wx = s.wx;
    // a worn floor of small grey tiles, grimy grout, a drain in the middle
    texture(fx, W, H, (x, y) => { const g2 = x % 6 === 0 || y % 6 === 0, t = hash2(x / 6 | 0, y / 6 | 0, 2), dirt = hash2(x >> 1, y >> 1, 5) < 0.04 ? -14 : 0, base = 148 + t * 14 + dirt;
      return g2 ? [104, 108, 102] : [base, base + 3, base - 2]; });
    for (let r = 4; r >= 0; r--) pcirc(fx, 95, 46, r, r > 2 ? '#5c605a' : '#3c3f3a');
    // the walls: dingy cream paint above, green tiles below
    px(wx, 0, 0, W, WALL, '#cfc7b0'); for (let y = 0; y < 26; y += 3) px(wx, 0, y, W, 1, 'rgba(0,0,0,0.04)');
    for (let y = 26; y < WALL; y++) for (let x = 0; x < W; x++) { const g2 = x % 8 === 0 || (y - 26) % 8 === 0; px(wx, x, y, 1, 1, g2 ? '#6f8a76' : ((x / 8 | 0) + ((y - 26) / 8 | 0)) % 3 ? '#93b29c' : '#89a892'); }
    px(wx, 0, 25, W, 2, '#5e7a66');
    wx.font = '7px monospace'; wx.fillStyle = '#2b2b5a'; wx.fillText('Paťas byl tady', 6, 10); wx.fillStyle = '#5a2b2b'; wx.fillText('BOHEMKA', 104, 9); wx.fillStyle = '#2b2b2b'; wx.fillText('K+M', 168, 8); wx.fillText('IIII II', 64, 21);
    wx.font = 'bold 7px monospace'; wx.fillStyle = '#b3241d'; wx.fillText('ADO JE BUZERANT', 98, 21); pline(wx, [[98, 23], [158, 22]], '#b3241d');   // fresh, in red marker
    pcirc(wx, 92, 12, 3, '#a33', 3.6, 6.0); pcirc(wx, 97, 12, 3, '#a33', 3.4, 5.8); pline(wx, [[89, 13], [94, 19], [100, 13]], '#a33');
    // two urinals with a divider, and a sink with a mirror and a dripping tap
    for (const ux of [12, 38]) { px(wx, ux, 32, 14, 24, '#f1f1ec'); px(wx, ux + 2, 34, 10, 18, '#dcdfdb'); px(wx, ux + 5, 52, 4, 4, '#bfc2bd'); px(wx, ux + 6, 29, 2, 3, '#b8bcbf'); px(wx, ux - 1, 56, 16, 2, 'rgba(0,0,0,0.25)'); }
    px(wx, 32, 30, 2, 30, '#b9bcb8');
    px(wx, 62, 6, 24, 18, '#8fa3ab'); px(wx, 63, 7, 22, 16, '#bccbd1'); pline(wx, [[66, 20], [78, 8]], '#e2ebee'); px(wx, 62, 36, 24, 8, '#f1f1ec'); px(wx, 64, 38, 20, 4, '#d8dcda'); px(wx, 73, 32, 2, 5, '#b8bcbf'); px(wx, 62, 44, 24, 2, 'rgba(0,0,0,0.25)');
    s.doors.push({ x0: 76, y0: H - 18, x1: 114, y1: H, to: 'pub', at: [95, H - 10], name: 'zpátky do hospody' });
    s.spots = [[19, 12], [45, 12], [74, 14], [60, 50], [110, 50]];
    finish(s);
  }

  // ------------------------------------------------------------------ the corner of Korunní and Šumavská
  // Lokál's house is the cream corner block: a rusticated ground floor with brown-framed arched windows and a pink
  // plinth, white upper floors with pediments. Korunní with its tram runs across the front; Šumavská, with parked cars
  // and the taxi, runs off to the left past the corner.
  const ST = scene('street', 860, 240, 150, 'Korunní × Šumavská');
  const CORNER = 170;                                               // where the house ends and Šumavská begins
  const TREES = [{ x: 120, y: 14 }, { x: 300, y: 222 }, { x: 560, y: 222 }, { x: 800, y: 222 }];
  const LAMPS = [{ x: 230, y: 64 }, { x: 500, y: 64 }, { x: 790, y: 64 }];
  const TAXI = { x: 212, y: 62, w: 84, h: 37 };   // parked at the curb in front of the corner, the driver's door on the pavement side
  const ARCHW = [];                                                 // the lit arched windows on the ground floor
  { const s = ST, W = s.W, H = s.H, WALL = s.WALL, fx = s.fx, wx = s.wx;
    const granite = (x, y) => { const row = Math.floor(y / 5), off = (row % 2) * 3 + Math.floor(hash2(row, 0, 4) * 3), cx = Math.floor((x + off) / (5 + (row % 3 === 0 ? 1 : 0))), n = hash2(cx, row, 9), jy = y % 5 === 0, jx = (x + off) % (5 + (row % 3 === 0 ? 1 : 0)) === 0;
      const v = jy || jx ? 140 + n * 10 : 166 + n * 30 + (hash2(x, y, 2) - 0.5) * 6; return [v, v - 1, v - 5]; };
    texture(fx, W, H, (x, y) => {
      if (x < CORNER - 8) {                                        // Šumavská: asphalt, its curb along the corner
        if (x >= CORNER - 14) return [158, 156, 150];
        const n = hash2(x, y, 3) * 14; let c = [54 + n, 55 + n, 58 + n];
        if (y > 92 && y < 132 && x > 8 && (y - 92) % 10 < 6) c = [196, 196, 190];          // the zebra across Šumavská
        if (x === 44 || x === 45) if (y % 14 < 7) c = [170, 170, 160];
        return c; }
      if (y < 70) { const band = (y > 12 && y < 16) || (y > 54 && y < 58); const c = granite(x, y); return band ? [c[0] - 70, c[1] - 70, c[2] - 66] : c; }
      if (y < 76) return y === 70 ? [120, 120, 118] : [158 - (x % 24 === 0 ? 30 : 0), 156, 150];
      if (y > 206) return granite(x, y);
      if (y > 200) return [158 - (x % 24 === 0 ? 30 : 0), 156, 150];
      const n = hash2(x, y, 3) * 14; let c = [54 + n, 55 + n, 58 + n];
      for (const ty of [110, 150]) { if (y === ty || y === ty + 9) c = [138, 142, 146]; if (y === ty + 1 || y === ty + 10) c = [30, 30, 32]; }
      if (x >= 186 && x < 230 && y > 78 && y < 198 && (x - 186) % 10 < 6) c = [196, 196, 190];   // the zebra across Korunní
      return c; });
    // the wall: Šumavská receding at the left (dark sky, far houses), the corner house along Korunní
    { const gr = wx.createLinearGradient(0, 0, 0, WALL); gr.addColorStop(0, '#0b1020'); gr.addColorStop(1, '#1b2236'); wx.fillStyle = gr; wx.fillRect(0, 0, CORNER, WALL); }
    for (let i = 0; i < 6; i++) { const x = i * 30 - 6, h = 60 + hash2(i, 3, 2) * 40; px(wx, x, WALL - h, 32, h, i % 2 ? '#2a2c38' : '#30323e'); for (let wy = WALL - h + 8; wy < WALL - 10; wy += 12) for (let wxx = x + 4; wxx < x + 28; wxx += 8) px(wx, wxx, wy, 4, 6, hash2(wxx, wy, 1) > 0.65 ? '#d9a453' : '#1b1d26'); }
    px(wx, 0, WALL - 8, CORNER, 8, '#1c1d22');
    // upper floors
    px(wx, CORNER, 0, W - CORNER, 96, '#efe8d6');
    for (let fl = 0; fl < 2; fl++) for (let x = CORNER + 22; x < W - 10; x += 44) { const y = 10 + fl * 42; const lit = hash2(x, fl, 4) > 0.6;
      px(wx, x - 4, y - 6, 26, 4, '#d9cdb2'); pline(wx, [[x - 4, y - 6], [x + 9, y - 11], [x + 22, y - 6]], '#cbbd9f');   // the pediment
      px(wx, x - 2, y - 2, 22, 30, '#d8ccb0'); px(wx, x, y, 18, 26, '#5a3a22'); px(wx, x + 1, y + 1, 7, 11, lit ? '#e7b35c' : '#202838'); px(wx, x + 10, y + 1, 7, 11, lit ? '#e1a752' : '#202838'); px(wx, x + 1, y + 14, 7, 11, lit ? '#d99c4a' : '#1b2230'); px(wx, x + 10, y + 14, 7, 11, lit ? '#d99c4a' : '#1b2230');
      px(wx, x - 3, y + 26, 24, 3, '#e5dac4'); }
    px(wx, CORNER, 94, W - CORNER, 6, '#d6c8aa'); px(wx, CORNER, 94, W - CORNER, 1, '#f6f0e2');                 // cornice over the shops
    // the rusticated ground floor and the pink plinth
    px(wx, CORNER, 100, W - CORNER, 42, '#eadfc4'); for (let y = 104; y < 142; y += 6) px(wx, CORNER, y, W - CORNER, 1, '#cfc1a2');
    px(wx, CORNER, 142, W - CORNER, 8, '#e0aaa2'); px(wx, CORNER, 142, W - CORNER, 1, '#c98f86');
    // the corner itself: a narrow chamfer, a little darker, with the street sign
    px(wx, CORNER, 0, 12, WALL, 'rgba(120,100,70,0.18)'); px(wx, CORNER + 18, 104, 36, 9, '#b0302a'); px(wx, CORNER + 19, 105, 34, 7, '#f4ece0'); wx.font = '6px sans-serif'; wx.fillStyle = '#b0302a'; wx.fillText('KORUNNÍ', CORNER + 21, 111);
    // arched windows into the pub, warm inside; the arched door with Lokál's plate above
    for (let x = CORNER + 70; x < W - 30; x += 54) {
      const door = Math.abs(x - 610) < 27, w = 22, top = door ? 104 : 108, bot = door ? 142 : 134, r = w / 2;
      for (let yy = top; yy < bot; yy++) for (let xx = x; xx < x + w; xx++) { const dx = xx - (x + r - 0.5), dy = yy - (top + r); if (yy < top + r && dx * dx + dy * dy > r * r) continue;
        const inner = (yy >= top + r || dx * dx + dy * dy <= (r - 2) ** 2) && xx > x + 1 && xx < x + w - 2 && yy < bot - (door ? 0 : 2); px(wx, xx, yy, 1, 1, inner ? (door ? '#3a2414' : '#ffcf86') : '#5a3a22'); }
      if (door) { px(wx, x + 10, top + 4, 2, bot - top - 4, '#2a180c'); px(wx, x + 15, 124, 2, 3, '#d9b25a'); px(wx, x - 6, 96, 34, 8, '#1d1d1d'); wx.font = 'bold 7px serif'; wx.fillStyle = '#f2ead8'; wx.fillText('Lokál', x - 1, 103); }
      else { px(wx, x + r - 1, top + 2, 2, bot - top - 4, '#5a3a22'); px(wx, x + 2, top + r + 4, w - 4, 2, '#5a3a22'); for (let i = 3; i < w - 3; i += 3) px(wx, x + i, top + r + 7, 1, bot - top - r - 10, 'rgba(255,248,232,0.35)'); ARCHW.push(x + r); } }
    s.doors.push({ x0: 596, y0: 2, x1: 636, y1: 22, to: 'pub', at: [616, 14], name: 'do Lokálu' });
    finish(s);
  }
  // ------------------------------------------------------------------ furniture from RetroDiffusion
  // Props are placed once the art has loaded: each stands with its bottom edge on the floor at (x, y); its footprint
  // (the last few rows) is solid unless told otherwise; seats come with the benches and chairs.
  function prop(s, name, x, y, o = {}) {
    const im = SPR[name]; if (!im) return null; const w = im.width, h = im.height, X = Math.round(x - w / 2), Y = Math.round(y - h);
    const flip = !!o.flip;
    s.piece(w, h, k => { if (flip) { k.translate(w, 0); k.scale(-1, 1); } k.drawImage(im, 0, 0); }, X, Y,
      o.solid === false ? null : [X + (o.inset ?? 2), y - (o.depth ?? 6), X + w - (o.inset ?? 2), y], o.base);
    return { X, Y, w, h };
  }
  function furnish() {
    { const s = PUB;
      // the hall: rows of long tables with a bench behind (you sit facing the room) and one in front (your back to us)
      for (const tx of [262, 340]) for (const ty of [56, 118, 180]) {
        prop(s, 'p-longtable', tx, ty, { depth: 12 }); prop(s, 'p-bench', tx, ty - 14, { depth: 4 }); prop(s, 'p-bench', tx, ty + 16, { depth: 4 });
        for (const dx of [-14, 0, 14]) { s.seats.push({ x: tx + dx, y: ty - 16, face: 0, standX: tx + dx, standY: ty - 26 }); s.seats.push({ x: tx + dx, y: ty + 12, face: 2, standX: tx + dx, standY: ty + 24 }); }
      }
      // square tables with a bentwood chair either side along the windowed wall
      for (const tx of [440, 520]) for (const ty of [56, 128, 200]) {
        prop(s, 'p-sqtable', tx, ty, { depth: 10 });
        prop(s, 't-chair', tx - 18, ty - 2, { depth: 6 }); prop(s, 't-chair', tx + 18, ty - 2, { depth: 6, flip: true });
        s.seats.push({ x: tx - 18, y: ty - 6, face: 1, standX: tx - 30, standY: ty - 2 }); s.seats.push({ x: tx + 18, y: ty - 6, face: 3, standX: tx + 30, standY: ty - 2 });
      }
      // the tap room: tall tables, the tank in the corner, the back counter behind the barmen, a menu, coats, plants
      for (const [x, y] of [[44, 150], [158, 162], [100, 212]]) prop(s, 'p-standtable', x, y, { depth: 5, inset: 5 });
      prop(s, 'p-bar', 100, 22, { depth: 14, base: 21 });
      prop(s, 'p-tank', 24, 50, { depth: 10 }); prop(s, 'p-crates', 172, 36, { depth: 8 });
      prop(s, 'p-coatstand', 16, 196, { depth: 5 }); prop(s, 'p-menu', 40, 238, { depth: 5 }); prop(s, 'p-plant', 186, 238, { depth: 5 }); prop(s, 'p-plant', 566, 244, { depth: 5 });
      // on the island bar: the taps, a jar of utopenci, a waiting mug
      const top = BAR.y - BAR.face; prop(s, 'p-taps', BAR.x + 52, top + 16, { solid: false, base: BAR.y + BAR.h + 0.3 }); prop(s, 'p-utopenci', BAR.x + 18, top + 20, { solid: false, base: BAR.y + BAR.h + 0.3 });
      prop(s, 't-mug', BAR.x + 84, top + 22, { solid: false, base: BAR.y + BAR.h + 0.3 }); prop(s, 'p-shot', BAR.x + 74, top + 22, { solid: false, base: BAR.y + BAR.h + 0.3 });
      // on the walls: radiators under the arches, the clock on the panelling
      for (const a of ARCHES) if (SPR['p-radiator']) s.wx.drawImage(SPR['p-radiator'], a.x + a.w / 2 - 10, s.WALL - 28);
      if (SPR['p-clock']) s.wx.drawImage(SPR['p-clock'], 470, 8);
      finish(s); }
    { const s = WC;
      prop(s, 'w-stall', 136, 12, { depth: 10 }); prop(s, 'w-stall', 166, 12, { depth: 10 }); prop(s, 'w-bin', 104, 14, { depth: 4 });
      if (SPR['w-dryer']) s.wx.drawImage(SPR['w-dryer'], 88, 30);
      finish(s); }
    { const s = ST;
      // Lokál's garden: beer-garden sets in front of the windows, and you can sit outside
      for (const tx of [660, 740]) { prop(s, 's-garden', tx, 50, { depth: 14 }); s.seats.push({ x: tx - 16, y: 44, face: 1, standX: tx - 30, standY: 46 }); s.seats.push({ x: tx + 16, y: 44, face: 3, standX: tx + 30, standY: 46 }); }
      for (const t of TREES) prop(s, 's-tree', t.x, t.y, { depth: 4, inset: 24 });
      for (const L of LAMPS) prop(s, 's-lamp', L.x, L.y, { depth: 3, inset: 5 });
      prop(s, 's-noentry', CORNER + 8, 70, { depth: 3, inset: 7 }); prop(s, 's-stop', 704, 68, { depth: 4, inset: 8 }); prop(s, 's-bin', 430, 66, { depth: 3 });
      prop(s, 's-bike', 560, 66, { depth: 4 }); prop(s, 's-scooter', 196, 40, { depth: 3 }); prop(s, 's-pigeon', 480, 40, { solid: false });
      // parked along Korunní: the taxi at the near curb, cars at the far one
      prop(s, 't-taxi', TAXI.x + TAXI.w / 2, TAXI.y + TAXI.h, { depth: 16 });
      prop(s, 's-car1', 360, 198, { depth: 14 }); prop(s, 's-car3', 560, 198, { depth: 14 }); prop(s, 's-car2', 740, 198, { depth: 14 });
      finish(s); }
  }
  const ARRIVE = { pub: { wc: [231, 30], street: [100, 226] }, wc: { pub: [95, 66] }, street: { pub: [616, 30] } };

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
    waiter: ['„Jedno? Hned to bude.“', '„Nesu, nesu.“', '„Malý nebo velký? Dobře, velký.“', '„Hned jsem u vás.“'],
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
  const NAMES = { kevin: 'Kevin', patas: 'Paťas', stepa: 'Štěpa', pazout: 'Pažout', ado: 'Ado', kopinaut: 'Kopinaut', bob: 'Bob', sasa: 'Saša', barman2: 'Výčepní', barman3: 'Výčepní', waiter: 'Číšník' };
  const staff = c => c.id.startsWith('barman') || c.id === 'waiter';
  const sid = c => c.id === 'waiter' ? 'barman' : c.id;   // the waiter wears the old barman's sheet
  const TRAITS = { patas: 'historik, opilý', stepa: 'cyklista, chodí pozdě', pazout: 'konzervativní feťák', ado: 'fitness, gay', kopinaut: 'Bohemka, feťák', bob: 'pije hodně piva', kevin: 'dvě děti, pivo', sasa: 'feťák, vždycky v pohodě' };
  const PLAYABLE = ['kevin', 'patas', 'stepa', 'pazout', 'ado', 'kopinaut', 'bob', 'sasa'];
  const OUTDOORSY = { pazout: 0.3, kopinaut: 0.35, sasa: 0.35 };   // who steps out to Korunní more often
  const START = { kevin: [40, 222], patas: [330, 100], bob: [330, 140], sasa: [404, 104], pazout: [404, 150], ado: [118, 96], kopinaut: [520, 90], stepa: [840, 30], barman2: [74, 34], barman3: [128, 34], waiter: [170, 70] };
  const cast = Object.keys(START).map(id => ({ id, x: START[id][0], y: START[id][1], scene: id === 'stepa' ? 'street' : 'pub', dir: 0, step: 0, moving: false, look: null, lookT: 2 + Math.random() * 3,
    path: null, plan: 'idle', planT: 2 + Math.random() * 6, line: 0, say: null, present: id !== 'stepa', idle: 0, ctrl: 'npc', tx: 0, ty: 0, sayKey: 0,
    seat: -1, beer: id.startsWith('barman') || id === 'waiter' ? -1 : (Math.random() < 0.7 ? 0.6 + Math.random() * 0.4 : -1), sipT: 0, drunk: 0, beers: 0, punchT: 0, hitT: 0, starsT: 0, kx: 0, ky: 0, puN: 0, pu: null, money: 3000, bags: 0, high: 0, smokeT: 0 }));
  const PRICE = { beer: 59, bag: 1500 };
  const by = id => cast.find(c => c.id === id);
  let me = null;
  const sceneOf = c => SC[c.scene];
  const dirOf = (x, y) => Math.abs(x) > Math.abs(y) ? (x > 0 ? 1 : 3) : (y > 0 ? 0 : 2);
  const dirVec = d => [[0, 1], [1, 0], [0, -1], [-1, 0]][d];
  // drunk speech: vowels stretch, words slip
  function slur(t, d) { if (d < 0.25) return t; let o = ''; for (const ch of t) { o += ch; if ('aeiouyáéíóúůý'.includes(ch) && Math.random() < d * 0.25) o += ch; } return d > 0.7 ? o.replace(/“$/, ' …hik.“') : o; }
  function speak(c, text, dur, quiet) { c.say = { text, t: 0, dur: dur || 1.4 + text.length * 0.07 }; c.sayKey++; if (!staff(c) && !quiet && !/^„Jedno, prosím/.test(text)) logLine(NAMES[c.id], text); }
  function nextLine(c) { const L = LINES[c.id] || LINES.barman; const t = L[c.line % L.length]; c.line++; return t; }
  function seatOcc(s, i) { return cast.some(c => c.scene === s.id && c.seat === i && c.present); }
  function sitDown(c, i) { const s = sceneOf(c), q = s.seats[i]; c.seat = i; c.x = q.x; c.y = q.y; c.dir = q.face; c.path = null; c.moving = false; c.look = null; }
  function standUp(c) { const s = sceneOf(c), q = s.seats[c.seat]; c.seat = -1; if (!q) return; const sy = q.standY ?? q.y; for (const dy of [0, 6, -6, 12, -12]) if (!s.blocked(q.standX, sy + dy)) { c.x = q.standX; c.y = sy + dy; return; } c.x = q.standX; c.y = sy; }
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
  addEventListener('keydown', e => { if (typing() || taxiOpen()) return; const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys.add(k);
    if (me && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
    if (!me || e.repeat) return; if (k === 'Enter' || k === 't') { e.preventDefault(); openChat(); return; } if (k === 'e' || k === ' ') use(); if (k === 'q') drink(me); if (k === 'f') punch(me); if (k === 'g') lightUp(me); if (k === 'Escape') leave(); });
  addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  addEventListener('blur', () => keys.clear());
  let touch = null;
  canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') touch = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', e => { if (touch) { touch.x = e.clientX; touch.y = e.clientY; } });
  for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => { touch = null; });
  $('btn-e').addEventListener('click', () => me && use()); $('btn-chat').addEventListener('click', () => me && openChat()); $('btn-q').addEventListener('click', () => me && drink(me)); $('btn-f').addEventListener('click', () => me && punch(me)); $('btn-tab').addEventListener('click', () => me && leave());
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
    if (s.id === 'pub' && me.x > BAR.x - 8 && me.x < BAR.x + BAR.w + 8 && me.y > BAR.y + BAR.h && me.y < BAR.y + BAR.h + 22) return { k: 'bar', label: me.beer > 0.05 ? 'E: další pivo' : 'E: jedno pivo' };
    if (s.id === 'wc' && atSink(me) && me.bags > 0 && !(me.smokeT > 0)) return { k: 'line', label: 'E: udělat si lajnu' };
    { const w = by('waiter'); if (w.present && w.scene === me.scene && Math.hypot(w.x - me.x, w.y - me.y) < 34) return { k: 'waiter', label: 'E: objednat u číšníka' }; }
    let best = null, bd = 30; for (const c of cast) if (c !== me && c.present && c.scene === me.scene) { const d = Math.hypot(c.x - me.x, c.y - me.y); if (d < bd) { bd = d; best = c; } }
    const seat = freeSeatNear(s, me.x, me.y, 16); if (seat >= 0 && (!best || bd > 12)) return { k: 'sit', i: seat, label: 'E: sednout si' };
    if (best && !staff(best)) return { k: 'talk', c: best, label: 'E / Enter: napsat' };
    if (s.id === 'street' && me.x > TAXI.x && me.x < TAXI.x + TAXI.w && me.y > TAXI.y - 18 && me.y < TAXI.y + 12) return { k: 'taxi', label: 'E: k taxíku' };
    return null;
  }
  function use() {
    const a = context(); if (!a) return;
    if (a.k === 'stand') standUp(me);
    else if (a.k === 'sit') sitDown(me, a.i);
    else if (a.k === 'door') { const near = cast.filter(c => c !== me && c.ctrl === 'npc' && c.present && c.scene === me.scene && !staff(c) && Math.hypot(c.x - me.x, c.y - me.y) < 46);
      fade = 1; pending = () => { goThrough(me, a.d, isHost() ? near : []); if (near.length && isHost()) speak(near[0], pick(['„Jdu s tebou.“', '„Počkej, jdu taky.“', '„Jo, jdem.“'])); camSnap = true; };
      if (!isHost() && near.length) ask = { target: near.map(c => c.id).join(','), n: ++askN, follow: a.d.to }; }
    else if (a.k === 'bar') { if (me.money < PRICE.beer) { toast('Na pivo už nemáš.'); return; } me.money -= PRICE.beer; speak(me, slur('„Jedno, prosím.“', me.drunk), 1.8); const bm = nearestStaff(me); ask = { target: bm, n: ++askN }; if (isHost()) answer(bm, me);
      setTimeout(() => { if (me) { me.beer = 1; me.beers++; } }, 1700); }
    else if (a.k === 'waiter') { if (me.money < PRICE.beer) { toast('Na pivo už nemáš.'); return; } speak(me, slur('„Jedno pivo, prosím.“', me.drunk), 1.8, true); ask = { target: 'waiter', n: ++askN }; if (isHost()) answer('waiter', me);
      setTimeout(() => { if (me) { me.money -= PRICE.beer; me.beer = 1; me.beers++; toast('Číšník ti přinesl pivo.'); } }, 6000); }
    else if (a.k === 'line') lightUp(me);
    else if (a.k === 'talk') { me.dir = dirOf(a.c.x - me.x, a.c.y - me.y); openChat(); }
    else if (a.k === 'taxi') openTaxi();
  }
  // ------------------------------------------------------------------ chat: Enter, type, Enter
  const chatIn = $('chat-in'), chatBox = $('chat');
  const typing = () => document.activeElement === chatIn;
  function openChat() { if (!me) return; keys.clear(); chatBox.hidden = false; chatIn.value = ''; chatIn.focus(); }
  chatIn.addEventListener('keydown', e => { e.stopPropagation();
    if (e.key === 'Escape') { chatIn.blur(); chatBox.hidden = true; }
    if (e.key === 'Enter') { e.preventDefault(); const t = chatIn.value.replace(/\s+/g, ' ').trim().slice(0, 120); chatIn.blur(); chatBox.hidden = true; if (t && me) speak(me, slur(t, me.drunk), 2 + t.length * 0.08); } });
  chatIn.addEventListener('blur', () => { chatBox.hidden = true; });
  function logLine(who, text) { const L = $('log'); if (!L) return; const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = who + ': '; d.append(b, text.replace(/^„|“$/g, '')); L.append(d); while (L.childElementCount > 6) L.firstChild.remove(); L.hidden = false; clearTimeout(logLine.t); logLine.t = setTimeout(() => { L.hidden = true; }, 15000); }

  // ------------------------------------------------------------------ the taxi on Šumavská
  const taxiOpen = () => !$('taxi').hidden;
  const DRIVER = ['„Dobrej večer, šéfe. Kam to bude?“', '„Jo, ty seš kamarád Saši, ne?“', '„Rychle, támhle jede dvaadvacítka.“', '„Já tu stojím každej večer. Jako hodiny.“'];
  function openTaxi() { keys.clear(); $('taxi').hidden = false; $('taxi-say').textContent = pick(DRIVER); $('taxi-money').textContent = `Máš u sebe ${me.money} Kč.`; $('taxi-buy').disabled = me.money < PRICE.bag; $('taxi-buy').focus(); }
  function closeTaxi() { $('taxi').hidden = true; canvas.focus?.(); }
  $('taxi-buy').addEventListener('click', () => { if (!me || me.money < PRICE.bag) return; me.money -= PRICE.bag; me.bags++; $('taxi-say').textContent = pick(['„Tady máš. A neviděl jsi mě.“', '„Gram. Čistej jak sníh na Sněžce.“', '„Dobrá volba, šéfe. Pozdravuj Sašu.“']); $('taxi-money').textContent = `Máš u sebe ${me.money} Kč a ${me.bags}× psaníčko. Na záchodě na G.`; $('taxi-buy').disabled = me.money < PRICE.bag; });
  $('taxi-no').addEventListener('click', closeTaxi);
  $('taxi').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeTaxi(); });
  const atSink = c => c.scene === 'wc' && Math.abs(c.x - 80) < 24 && c.y < 30;
  // G: in the toilet only. For a few minutes everything is faster, sharper and louder; then the comedown.
  function lightUp(c) {
    if (c.bags <= 0) { toast('Nemáš psaníčko. Taxík stojí na Korunní.'); return; }
    if (c.scene !== 'wc') { toast('Tady ne. Na záchod.'); return; }
    if (!atSink(c)) { toast('K umyvadlu. Tam je místo na lajnu.'); return; }
    c.bags--; c.x = 94; c.y = 16; c.dir = 3; c.look = null; c.smokeT = 3; setTimeout(() => { c.high = Math.min(1, c.high + 0.8); }, 2600);
  }
  let toastT = 0, toastText = '';
  const toast = t => { toastText = t; toastT = 3.5; };
  const nearestStaff = c => ['barman2', 'barman3'].sort((a, b) => Math.abs(by(a).x - c.x) - Math.abs(by(b).x - c.x))[0];
  function answer(id, asker) {   // the host makes a pub-run character turn and reply
    const c = by(id); if (!c || c.ctrl !== 'npc') return;
    // whoever you speak to stops what they were doing, turns to you, and stays a while
    c.path = null; c.moving = false; if (c.seat < 0 && !staff(c)) c.plan = 'idle'; c.planT = Math.max(c.planT, staff(c) ? 6 : 14);
    c.dir = dirOf(asker.x - c.x, asker.y - c.y); c.look = null; c.attend = asker; c.attendT = 8;
    const line = c.scene === 'wc' && WC_LINES[c.id] ? (Math.random() < 0.6 ? WC_LINES[c.id] : pick(WC_ANY)) : nextLine(c);
    setTimeout(() => speak(c, slur(line, c.drunk)), staff(c) ? 900 : 300);
  }

  // ------------------------------------------------------------------ beer, punches
  function drink(c) {
    if (c.beer <= 0.02 || c.sipT > 0) { if (c === me && c.beer <= 0.02) toast('Nemáš pivo. Dojdi si k baru.'); return; }
    c.sipT = 1.3; c.beer = Math.max(0, c.beer - 0.25); c.drunk = Math.min(1.4, c.drunk + 0.06);
    if (c.beer <= 0.02) c.beer = -1;
  }
  let punches = [];   // recent punch times, for the barman's patience
  function punch(c) {
    if (c.punchT > 0 || c.seat >= 0) return;
    const [vx, vy] = dirVec(c.dir); let best = null, bd = 26;
    for (const o of cast) if (o !== c && o.present && o.scene === c.scene && !staff(o)) { const dx = o.x - c.x, dy = o.y - c.y, d = Math.hypot(dx, dy); if (d < bd && (dx * vx + dy * vy) > -4) { bd = d; best = o; } }
    c.punchT = 0.32;
    if (!best) return;
    c.puN++; c.pu = { t: best.id, n: c.puN };
    land(c, best);
  }
  // the hit itself: everyone sees the stars; whoever runs the one who was hit moves him and makes him say something
  function land(from, to) {
    to.starsT = 1.5; to.hitT = 0.5; from.punchT = Math.max(from.punchT, 0.32);
    const owner = to === me || (to.ctrl === 'npc' && isHost());
    if (!owner) return;
    const d = Math.hypot(to.x - from.x, to.y - from.y) || 1; to.kx = (to.x - from.x) / d * 110; to.ky = (to.y - from.y) / d * 60;
    if (to.seat >= 0) standUp(to); if (to.ctrl === 'npc') { to.path = null; to.plan = 'idle'; to.planT = Math.max(to.planT, 10); to.attend = from; to.attendT = 4; }
    if (to.beer > 0) { to.beer = Math.max(0, to.beer - 0.35); spills.push({ x: to.x + to.kx * 0.1, y: to.y + 4, t: now, scene: to.scene }); if (to.beer <= 0.02) to.beer = -1; }
    if (to.ctrl === 'npc' && Math.random() < 0.3) setTimeout(() => { to.dir = dirOf(from.x - to.x, from.y - to.y); punch(to); }, 700);
    if (isHost()) { punches = punches.filter(t => now - t < 60).concat(now); if (punches.length >= 4) { punches = []; const b = by(nearestStaff(to)); if (b.ctrl === 'npc' && to.scene === 'pub') setTimeout(() => speak(b, '„Pánové! Ještě jednou a jdete ven!“', 3), 600); } }
  }
  const spills = [];

  // ================================================================== THE NIGHT
  let clock = 20 * 60, now = 0, chatter = 6, camSnap = true, knockT = 25;
  const fmt = m => { const h = Math.floor(m / 60) % 24, mi = Math.floor(m % 60); return `Út ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`; };
  function lifeOf(c, dt) {
    const s = sceneOf(c);
    if (c.id === 'waiter') {   // now and then he does a round of the hall, stops by people, and goes back to the bar
      c.planT -= dt;
      if (c.attendT > 0) { c.attendT -= dt; c.path = null; c.moving = false; if (c.attend && !c.say) c.dir = dirOf(c.attend.x - c.x, c.attend.y - c.y); idleLook(c, dt); return; }
      if (c.planT <= 0 && (!c.path || !c.path.length)) {
        const guests = cast.filter(o => o.present && !staff(o) && o.scene === 'pub' && o.x > 190);
        if (c.plan !== 'round' && Math.random() < 0.7) { const t = pick(guests); const [x, y] = t ? [t.x + (t.x > 400 ? -22 : 22), t.y + 8] : [220 + Math.random() * 330, 30 + Math.random() * 200]; c.plan = 'round'; walkTo(c, x, y); c.planT = 8; }
        else { c.plan = 'home'; walkTo(c, 170, 70); c.planT = 25 + Math.random() * 25; } }
      if (moveAlong(c, dt, 30) && c.plan === 'round' && !c.waved) { c.waved = true; c.dir = 0; } if (c.moving) c.waved = false;
      idleLook(c, dt); return; }
    if (staff(c)) { c.planT -= dt; if (c.planT <= 0) { c.planT = 6 + Math.random() * 10; walkTo(c, (c.id === 'barman2' ? 60 : 104) + Math.random() * 40, 34); } if (c.attendT > 0) { c.attendT -= dt; c.path = null; c.moving = false; if (c.attend && !c.say) c.dir = dirOf(c.attend.x - c.x, c.attend.y - c.y); } else if (moveAlong(c, dt, 24) && !c.say) c.dir = 0; idleLook(c, dt); return; }
    if (!c.present) { if (clock >= 20 * 60 + 40) { c.present = true; c.plan = 'door'; c.door = ST.doors[0]; walkTo(c, 616, 14); } return; }   // Štěpa, late as always
    c.planT -= dt; if (c.attendT > 0) { c.attendT -= dt; if (c.attend) { c.look = null; if (!c.say) c.dir = dirOf(c.attend.x - c.x, c.attend.y - c.y); } }
    if (cast.some(o => o.ctrl !== 'npc' && o.scene === c.scene && Math.hypot(o.x - c.x, o.y - c.y) < 30)) c.planT = Math.max(c.planT, 2);
    if (c.seat >= 0) {   // sitting: sip now and then, look at the others, get up when it is time
      if (c.beer > 0.02 && Math.random() < dt / 9) drink(c);
      if (c.planT <= 0) { standUp(c); c.plan = 'idle'; c.planT = 0; } else { idleLook(c, dt); return; }
    }
    if (c.plan === 'idle' && c.planT <= 0 && s.id === 'pub' && Math.random() < 0.45) c.planT = 12 + Math.random() * 20;   // often they just stay where they are
    if (c.plan === 'idle' && c.planT <= 0) {
      const r = Math.random(), heavy = c.id === 'bob' || c.id === 'kevin' || c.id === 'patas', out = OUTDOORSY[c.id] || 0.08;
      if (s.id !== 'pub') { c.plan = 'door'; c.door = s.doors[0]; walkTo(c, (c.door.x0 + c.door.x1) / 2, (c.door.y0 + c.door.y1) / 2); }
      else if (c.beer <= 0.02 && r < (heavy ? 0.8 : 0.5)) { c.plan = 'bar'; walkTo(c, BAR.x + 12 + Math.random() * (BAR.w - 24), BAR.y + BAR.h + 10); }
      else if (r < 0.55) { const i = freeSeatNear(s, c.x + (Math.random() - 0.5) * 160, c.y + (Math.random() - 0.5) * 80, 400); if (i >= 0) { c.plan = 'seat'; c.seatGoal = i; const q = s.seats[i]; walkTo(c, q.standX, q.standY ?? q.y); } else c.planT = 5; }
      else if (r < 0.55 + out) { c.plan = 'door'; c.door = s.doors[1]; walkTo(c, s.doors[1].at[0] + 6, s.doors[1].at[1]); }
      else if (r < 0.7 + out) { c.plan = 'door'; c.door = s.doors[0]; walkTo(c, ...s.doors[0].at); }
      else { const o = cast.filter(o => o !== c && o.present && o.scene === c.scene && !staff(o)); const t = pick(o); if (t) { c.plan = 'visit'; c.target = t; walkTo(c, t.x + (Math.random() < 0.5 ? -18 : 18), t.y + 4); } else c.planT = 5; }
    }
    if (c.plan === 'follow') { const L = c.leader; if (!L || L.scene !== c.scene || c.planT <= 0) { c.plan = 'idle'; c.planT = 1; } else if (Math.hypot(L.x - c.x, L.y - c.y) > 36 && (!c.path || !c.path.length)) walkTo(c, L.x + (c.x < L.x ? -16 : 16), L.y + 6); }
    const arrived = moveAlong(c, dt, 34 - c.drunk * 6);
    if (arrived && c.plan !== 'idle' && c.plan !== 'follow') {
      if (c.plan === 'bar') { c.dir = 2; c.plan = 'wait'; c.planT = 2; speak(c, slur('„Jedno.“', c.drunk), 1.4); }
      else if (c.plan === 'wait' && c.planT <= 0) { c.beer = 1; c.beers++; c.plan = 'idle'; c.planT = 1; }
      else if (c.plan === 'seat') { if (!seatOcc(s, c.seatGoal)) { sitDown(c, c.seatGoal); c.planT = 60 + Math.random() * 90; } c.plan = 'idle'; if (c.seat < 0) c.planT = 2; }
      else if (c.plan === 'door') { goThrough(c, c.door); c.plan = c.scene === 'pub' ? 'idle' : 'away'; c.planT = c.scene === 'pub' ? 6 : 30 + Math.random() * 30;
        if (c.scene === 'wc') walkTo(c, ...pick(WC.spots)); if (c.scene === 'street') walkTo(c, 420 + Math.random() * 200, 20 + Math.random() * 30); }
      else if (c.plan === 'visit') { if (c.target) c.dir = dirOf(c.target.x - c.x, c.target.y - c.y); c.plan = 'idle'; c.planT = 25 + Math.random() * 30; if (!c.say && Math.random() < 0.5) speak(c, slur(nextLine(c), c.drunk)); }
      else if (c.plan === 'away' && c.planT <= 0) { c.plan = 'idle'; c.planT = 0; }
    }
    if (c.plan === 'away' && c.planT <= 0) { c.plan = 'idle'; c.planT = 0; }
    if (!c.moving) { idleLook(c, dt); if (c.beer > 0.02 && Math.random() < dt / 14) drink(c); }
  }
  function idleLook(c, dt) {
    if (c.moving || c.say || c.attendT > 0) { c.look = null; return; }
    if ((c.lookT -= dt) <= 0) { const o = cast.filter(o => o !== c && o.present && o.scene === c.scene); const t = pick(o);
      c.look = c.seat >= 0 ? (Math.random() < 0.6 ? null : (t ? dirOf(t.x - c.x, t.y - c.y) : null)) : Math.random() < 0.65 && t ? dirOf(t.x - c.x, t.y - c.y) : Math.random() < 0.5 ? null : Math.floor(Math.random() * 4); c.lookT = 2 + Math.random() * 4; }
  }
  function update(dt) {
    now += dt * (me ? 1 + me.high * 0.35 : 1); const host = isHost(); clock += dt * (host && keys.has('t') ? 20 : 1);
    if (fade > 0) { fade -= dt * 4; if (fade <= 0.5 && pending) { pending(); pending = null; } }
    if (me) {
      const [ax, ay] = axis(), l = Math.hypot(ax, ay), s = sceneOf(me);
      if (l > 0.1 && me.seat >= 0) standUp(me);
      me.moving = l > 0.1 && me.hitT <= 0 && !(me.smokeT > 0);
      if (me.moving) { const sp = (62 - me.drunk * 10 + me.high * 28) * Math.min(1, l); let vx = ax / Math.max(1, l) * sp, vy = ay / Math.max(1, l) * sp;
        const sway = Math.sin(now * 2.3) * me.drunk * 22; vx += -ay / Math.max(1, l) * sway; vy += ax / Math.max(1, l) * sway;   // the floor tilts a little after a few
        if (!s.blocked(me.x + vx * dt, me.y)) me.x += vx * dt; if (!s.blocked(me.x, me.y + vy * dt)) me.y += vy * dt;
        me.dir = dirOf(ax, ay); me.step += dt * 10; me.look = null; me.idle = 0; } else { me.idle += dt; idleLook(me, dt); }
      me.drunk = Math.max(0, me.drunk - dt * 0.004); me.high = Math.max(0, me.high - dt * 0.005); me.smokeT = Math.max(0, me.smokeT - dt); if (me.smokeT > 0) { me.dir = 3; me.moving = false; }
    }
    for (const c of cast) {
      if (c.ctrl === 'npc' && !staff(c)) { c.present = false; continue; }   // online only: a friend is here only while someone plays him
      if (c.ctrl === 'npc' && host) lifeOf(c, dt);
      else if (c.ctrl === 'remote' || (c.ctrl === 'npc' && !host)) {
        const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy); if (d > 80) { c.x = c.tx; c.y = c.ty; } else { const k = Math.min(1, dt * 12); c.x += dx * k; c.y += dy * k; }
        if (c.moving) c.step += dt * 9; else if (c.seat < 0) idleLook(c, dt); }
      if (c.kx || c.ky) { const s = sceneOf(c); if (!s.blocked(c.x + c.kx * dt, c.y)) c.x += c.kx * dt; if (!s.blocked(c.x, c.y + c.ky * dt)) c.y += c.ky * dt; c.kx *= Math.exp(-dt * 9); c.ky *= Math.exp(-dt * 9); if (Math.abs(c.kx) + Math.abs(c.ky) < 2) c.kx = c.ky = 0; }
      c.sipT = Math.max(0, c.sipT - dt); c.punchT = Math.max(0, c.punchT - dt); c.hitT = Math.max(0, c.hitT - dt); c.starsT = Math.max(0, c.starsT - dt);
      if (c.say && (c.say.t += dt) > c.say.dur) c.say = null; }
    // (no chatter: everything said tonight is said by the players)
    if (toastT > 0) toastT -= dt;
    if (me && me.scene === 'wc' && (knockT -= dt) <= 0) { knockT = 30 + Math.random() * 30; toast(pick(['Ťuk, ťuk. „Bude to?“', 'Někdo bouchá na dveře. „Kluci, pospěšte si!“', 'Ťuk, ťuk. „Je tam někdo?“'])); }
    net(dt);
    for (const sm of smoke) { sm.x += sm.vx * dt; sm.y += Math.sin(now * 0.2 + sm.ph) * 2 * dt; if (sm.x > PUB.W + 120) sm.x = -120; }
  }
  const smoke = Array.from({ length: 7 }, (_, i) => ({ x: hash2(i, 1, 5) * PUB.W, y: hash2(i, 2, 5) * PUB.H * 0.8, r: 60 + hash2(i, 3, 5) * 70, vx: 2 + hash2(i, 4, 5) * 3, ph: i }));

  // ================================================================== DRAWING
  function frameOf(c) { const M = META[sid(c)]; const d = c.sipT > 0 && !staff(c) ? 0 : c.seat >= 0 ? (c.look ?? c.dir) : c.moving || c.look == null ? c.dir : c.look; return [([2, 1, 0, 3][d] * 4 + (c.moving ? Math.floor(c.step * 0.55) % 4 : 1)) * M.fw, M, d]; }
  // Each sprite's own sleeve and skin colours, read once from its front-facing frame, so the arms drawn for drinking
  // and punching match the clothes.
  const TONES = {};
  function tones(id) {
    if (TONES[id]) return TONES[id]; const im = SPR[id]; if (!im) return { sleeve: '#888', skin: '#d9a77f', line: '#2a1d16' };
    const [c, k] = mk(48, 48); k.drawImage(im, 9 * 48, 0, 48, 48, 0, 0, 48, 48); const d = k.getImageData(0, 0, 48, 48).data;
    const mode = (x0, y0, x1, y1, ok) => { const m = new Map(); for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * 48 + x) * 4; if (d[i + 3] < 200) continue; const r = d[i], g2 = d[i + 1], b = d[i + 2]; if (ok && !ok(r, g2, b)) continue; const key = `${r},${g2},${b}`; m.set(key, (m.get(key) || 0) + 1); } let best = null, n = 0; for (const [kk, v] of m) if (v > n) { n = v; best = kk; } return best ? `rgb(${best})` : null; };
    const skin = mode(18, 12, 30, 24, (r, g2, b) => r > 150 && r > b + 30 && g2 > 90) || '#d9a77f';
    const sleeve = mode(15, 19, 33, 25, (r, g2, b) => r + g2 + b > 60) || '#777';
    return (TONES[id] = { skin, sleeve, line: '#21170f' });
  }
  function thick(x0, y0, x1, y1, w, col) { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0))); g.fillStyle = col; for (let i = 0; i <= n; i++) { const t = i / n; g.fillRect(Math.round(x0 + (x1 - x0) * t - w / 2), Math.round(y0 + (y1 - y0) * t - w / 2), w, w); } }
  function arm(c, sx, sy, hx, hy) { const T = tones(sid(c)); thick(sx, sy, hx, hy, 4, T.line); thick(sx, sy, hx, hy, 2, T.sleeve); px(g, hx - 2, hy - 2, 4, 4, T.line); px(g, hx - 1, hy - 1, 3, 3, T.skin); }
  function glass(x, y, lvl, tilt) {   // a half-litre mug of Pilsner; tilt > 0 leans it toward the mouth
    const t = Math.round(tilt * 2);
    px(g, x - 1, y - 1, 7, 9, 'rgba(25,18,12,0.7)'); px(g, x, y, 5, 7, 'rgba(225,238,242,0.75)');
    const L = Math.round(clamp(lvl, 0, 1) * 6); if (L) { px(g, x, y + 7 - L, 5, L, '#e3a92e'); px(g, x, y + 7 - L - (t > 0 ? 0 : 1), 5, 2, '#fbf6e8'); }
    px(g, x + 4, y + 1, 1, 5, 'rgba(255,255,255,0.7)'); px(g, x + 5, y + 2, 2, 1, 'rgba(225,238,242,0.9)'); px(g, x + 6, y + 2, 1, 3, 'rgba(225,238,242,0.9)');
  }
  // Drinking: the mug comes up to the mouth, the head tips back, a few swallows, and down again.
  // Punching: a short wind-up, the arm shoots out at full length with a lean into it, and back.
  function drawPerson(c, ox, oy) {
    const im = SPR[sid(c)]; if (!im) return; const [sx, M, d] = frameOf(c);
    const [fx2, fy2] = dirVec(c.dir);
    const pk = c.punchT > 0 ? 1 - c.punchT / 0.32 : -1, lean = pk < 0 ? 0 : pk < 0.25 ? -1.5 : pk < 0.65 ? 3 : 3 * (1 - (pk - 0.65) / 0.35);
    const sway = c.moving ? Math.sin(now * 2.3 + c.x * 0.01) * c.drunk * 2 : 0;
    const bend = c.smokeT > 0 && c.scene === 'wc' ? 3 : 0;   // leaning over the sink
    const x = Math.round(c.x - ox + fx2 * lean + sway) - 24 - bend, y = Math.round(c.y - oy + fy2 * lean * 0.5) - 44 + bend;
    const sip = c.sipT > 0 ? 1.3 - c.sipT : -1, up = sip < 0 ? 0 : sip < 0.3 ? sip / 0.3 : sip < 1.0 ? 1 : (1.3 - sip) / 0.3, tip = up >= 1 ? 1 : 0;
    const flinch = c.hitT > 0 ? c.hitT / 0.5 : 0;
    if (flinch) { g.save(); g.translate(x + 24, y + 44); g.rotate(-fx2 * 0.12 * flinch); g.translate(-x - 24, -y - 44); }
    const hideArm = up > 0.05 && c.beer >= 0 && d === 0;
    if (hideArm) { g.save(); g.beginPath(); g.rect(x - 2, y - 4, 52, 56); g.rect(x + 28, y + 23 + (c.seat >= 0 ? 9 : 0), 8, 11); g.clip('evenodd'); }
    if (c.seat >= 0) { g.drawImage(im, sx, 0, M.fw, 31, x, y + 9 - tip, M.fw, 31); }
    else { const br = c.moving ? 0 : ((now + c.x * 0.01) % 3.4 > 1.7 ? 1 : 0), cut = 29;
      g.drawImage(im, sx, cut, M.fw, M.fh - cut, x, y + cut, M.fw, M.fh - cut); g.drawImage(im, sx, 0, M.fw, cut + 1, x, y + br - tip, M.fw, cut + 1); }
    if (hideArm) g.restore();
    const by2 = c.seat >= 0 ? 9 : 0;   // seated people sit lower
    // Body points measured on the walk sheets (48 px frames, feet at row 44): shoulders near row 21, the mouth near
    // row 16 (front) or 18 (side), the hanging hand near row 31.
    const P = d === 0 ? { sh: [29, 21], rest: [30, 31], mouth: [24, 16], pSh: [18, 21] }
            : d === 1 ? { sh: [24, 22], rest: [27, 31], mouth: [30, 18], pSh: [24, 22] }
            : d === 3 ? { sh: [24, 22], rest: [21, 31], mouth: [18, 18], pSh: [24, 22] }
            :           { sh: [30, 21], rest: [31, 31], mouth: [24, 14], pSh: [18, 21] };
    const at = (q, dy = 0) => [x + q[0], y + q[1] + by2 + dy];
    // the arm with the beer
    if (c.beer >= 0 && d !== 2) {
      const [shX, shY] = at(P.sh), [rx, ry] = at(P.rest), [mx, my] = at(P.mouth, -tip);
      const hx = rx + (mx - rx) * up, hy = ry + (my - ry) * up;
      const T = tones(sid(c));
      if (up > 0.05) {   // a slim forearm from the elbow at his side up to the mug, in his own sleeve; a small hand around the glass
        const ex = x + 29, ey = y + 27 + by2; thick(ex, ey, hx + 1, hy + 1, 3, 'rgba(25,18,12,0.55)'); thick(ex, ey, hx + 1, hy + 1, 2, T.sleeve); px(g, hx, hy, 2, 2, T.skin);
      } else px(g, hx - 1, hy - 1, 2, 2, T.skin);
      const gx = d === 3 ? hx - 5 : d === 1 ? hx : hx - 2 - 2 * up, gy = hy - 4 - up * 3;
      glass(Math.round(gx), Math.round(gy), c.beer, up);
      if (tip && Math.floor(now * 4) % 2 === 0) px(g, mx, my + 4, 1, 1, 'rgba(255,255,255,0.6)');   // a swallow
    }
    // the punching arm
    if (pk >= 0) {
      const side = d === 3 ? -1 : 1, ext = pk < 0.25 ? -2 : pk < 0.65 ? 12 : 12 * (1 - (pk - 0.65) / 0.35);
      const [shX, shY] = at(P.pSh);
      const hx = d === 1 || d === 3 ? shX + side * (4 + ext * 0.85) : shX + (d === 0 ? 1 : 0), hy = d === 0 ? shY + 3 + ext * 0.4 : d === 2 ? shY - 3 - ext * 0.4 : shY;
      arm(c, shX, shY, hx, hy); const T = tones(sid(c)); px(g, hx - 2, hy - 2, 5, 5, T.line); px(g, hx - 1, hy - 1, 4, 4, T.skin);
      if (pk > 0.25 && pk < 0.6) for (let i = 1; i <= 3; i++) px(g, hx - fx2 * (4 + i * 3), hy - fy2 * (4 + i * 3) + (i % 2), fx2 ? 3 : 1, fx2 ? 1 : 3, `rgba(255,255,255,${0.55 - i * 0.15})`);
    }
    if (flinch) g.restore();
  }
  function drawStars(c, ox, oy) { if (c.starsT <= 0) return; const X = c.x - ox, Y = c.y - oy - (c.seat >= 0 ? 38 : 48); for (let i = 0; i < 3; i++) { const a = now * 6 + i * 2.09; const sx2 = X + Math.cos(a) * 9, sy2 = Y + Math.sin(a) * 3; px(g, sx2 - 1, sy2, 3, 1, '#ffe25a'); px(g, sx2, sy2 - 1, 1, 3, '#ffe25a'); } }
  function blob(x, y, rx, ry, a) { g.save(); g.translate(x, y); g.scale(1, ry / rx); const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(30,16,8,${a})`); gr.addColorStop(0.6, `rgba(30,16,8,${a * 0.6})`); gr.addColorStop(1, 'rgba(30,16,8,0)'); g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore(); }
  let camX = 0, camY = 0, view = [0, 0];
  function draw() {
    const s = me ? sceneOf(me) : PUB, d = me ? me.drunk : 0;
    const jit = me ? me.high * (Math.random() - 0.5) * 1.5 : 0, fx = me ? me.x + Math.sin(now * 0.7) * d * 8 + jit : s.W / 2 + Math.sin(now * 0.07) * 180, fy = me ? me.y + Math.cos(now * 0.53) * d * 5 : s.H / 2 - 30 + Math.sin(now * 0.05) * 30;
    const k = camSnap ? 1 : me ? 0.12 : 0.02; camSnap = false; camX += ((fx - VW / 2) - camX) * k; camY += ((fy - 20 - VH / 2) - camY) * k;
    const ox = Math.round(s.W + 24 < VW ? (s.W - VW) / 2 : clamp(camX, -12, s.W + 12 - VW)), oy = Math.round(s.H + s.WALL + 24 < VH ? (s.H - s.WALL - VH) / 2 + 0 : clamp(camY, -s.WALL - 8, s.H + 14 - VH));
    g.fillStyle = '#0d0907'; g.fillRect(0, 0, VW, VH);
    view = [ox, oy];
    g.drawImage(s.floor, -ox, -oy); g.drawImage(s.wall, -ox, -s.WALL - oy);
    liveWall(s, ox, oy);
    for (const sp of spills) if (sp.scene === s.id && now - sp.t < 90) { const a = 0.35 * (1 - (now - sp.t) / 90); g.fillStyle = `rgba(190,140,40,${a})`; g.beginPath(); g.ellipse(sp.x - ox, sp.y - oy, 7, 3, 0, 0, 6.283); g.fill(); }
    const here = cast.filter(c => c.present && c.scene === s.id);
    for (const c of here) blob(c.x - ox, c.y - oy - 1, c.seat >= 0 ? 6 : 7.5, 2.6, 0.5);
    if (s.id === 'pub') for (const L of CHANDELIERS) for (const c of here) { if (c.seat >= 0) continue;
      const dx = c.x - L.x, dy = c.y - L.y, dd = Math.hypot(dx, dy); if (dd > 150 || dd < 1) continue; const a = 0.18 * (1 - dd / 150), im = SPR[sid(c)]; if (!im) continue; const [sx, M] = frameOf(c);
      g.save(); g.globalAlpha = a; g.setTransform(1, 0, -dx / dd * 0.6, -dy / dd * 0.35 - 0.2, Math.round(c.x - ox), Math.round(c.y - oy)); g.drawImage(sil(im), sx, 0, M.fw, 44, -24, -44, 48, 44); g.restore(); }
    const items = s.bands.map(b => ({ y: b.base, d: () => g.drawImage(b.p.c, 0, b.sy, b.p.w, b.sh, b.p.x - ox, b.p.y + b.sy - oy, b.p.w, b.sh) }));
    for (const c of here) items.push({ y: c.seat >= 0 ? c.y + 7 : c.y, d: () => drawPerson(c, ox, oy) });
    if (s.id === 'street') tramItem(items, ox, oy);
    items.sort((a, b) => a.y - b.y).forEach(i => i.d());
    px(g, -ox - 12, -s.WALL - oy, 12, s.H + s.WALL + 20, '#1c120b'); px(g, s.W - ox, -s.WALL - oy, 12, s.H + s.WALL + 20, '#1c120b'); px(g, -ox - 12, s.H - oy, s.W + 24, 14, '#24170e');
    if (s.id === 'pub') {   // the way out to Korunní: a door in the front wall with a lit sign, a mat in front of it
      px(g, 76 - ox, s.H - 2 - oy, 48, 16, '#120a06'); px(g, 74 - ox, s.H - 2 - oy, 2, 16, '#8a6a46'); px(g, 124 - ox, s.H - 2 - oy, 2, 16, '#8a6a46'); px(g, 80 - ox, s.H - 14 - oy, 40, 10, '#5a2a22');
      g.font = '8px VT323, monospace'; const t = 'VEN · Korunní'; const tw = g.measureText(t).width; px(g, 100 - ox - tw / 2 - 4, s.H + 2 - oy, tw + 8, 10, '#2f6b3a'); g.fillStyle = '#e8f5e0'; g.fillText(t, 100 - ox - tw / 2, s.H + 10 - oy);
      for (const wy of SIDE_WINDOWS) { px(g, s.W - ox, wy - oy, 4, 40, '#d9c9b2'); px(g, s.W - ox + 1, wy + 2 - oy, 3, 36, '#2a3550'); } }
    if (s.id === 'wc') { px(g, 76 - ox, s.H - 2 - oy, 38, 14, '#5a3a22'); }
    light(s, ox, oy);
    for (const c of here) drawStars(c, ox, oy);
    for (const c of here) if (c.smokeT > 0) for (let k = 0; k < 5; k++) { const a = (now * 3 + k * 1.3) % 1; px(g, c.x - ox - 2 + Math.sin(k * 2.1) * 6 * a, c.y - oy - 30 - a * 8, 1, 1, `rgba(255,255,255,${1 - a})`); }
    for (const c of here) if (c.say) bubble(c, ox, oy);
    const a = context(); if (a && !me.say) { g.font = '8px VT323, monospace'; const t = a.label, w2 = g.measureText(t).width + 8, X = Math.round(me.x - ox - w2 / 2), Y = Math.round(me.y - oy + 6); px(g, X, Y, w2, 10, 'rgba(23,17,13,0.8)'); g.fillStyle = '#d9a441'; g.fillText(t, X + 4, Y + 8); }
    if (toastT > 0) { g.save(); g.globalAlpha = Math.min(1, toastT); g.font = '10px VT323, monospace'; const w2 = g.measureText(toastText).width + 12, X = Math.round((VW - w2) / 2), Y = VH - 46; px(g, X, Y, w2, 14, 'rgba(23,17,13,0.9)'); g.fillStyle = '#f3e9d8'; g.fillText(toastText, X + 6, Y + 10); g.restore(); }
    if (fade > 0) { g.fillStyle = `rgba(8,5,3,${1 - Math.abs(fade - 0.5) * 2})`; g.fillRect(0, 0, VW, VH); }
  }
  function liveWall(s, ox, oy) {
    if (s.id === 'pub') {   // through the arched windows: Korunní at night, a lamp, and the tram's light sliding past
      const tram = tramPos();
      for (const a of ARCHES) { const X = a.x - ox, Y = -s.WALL - oy + 12, r = a.w / 2;
        g.save(); g.beginPath(); g.rect(X, Y + r, a.w, s.WALL - 20 - r); g.arc(X + r, Y + r, r, Math.PI, 0); g.clip();
        px(g, X, Y, a.w, 30 + r, '#0f1830'); for (let i = 0; i < 3; i++) px(g, X + 3 + i * 11, Y + 6, 6, 8, hash2(i, a.x, 1) > 0.4 ? '#e9b45c' : '#26304a');
        px(g, X, Y + 46, a.w, 20, '#262a33'); glow(X + r, Y + 34, 18, '255,190,110', 0.5);
        if (tram && Math.abs(tram.x + 120 - (a.x * 1.3 + 100)) < 160) px(g, X, Y + 40, a.w, 8, 'rgba(255,214,140,0.75)');
        g.restore();
        for (const side of [0, 1]) { const sway = Math.sin(now * 0.7 + a.x + side) * 1.2; for (let k = 0; k < 7; k++) { const cx = side ? X + a.w - 1 - k : X + k; px(g, cx + (k > 4 ? sway : 0), Y + r + 4, 1, s.WALL - 26 - r, `rgba(246,240,228,${0.5 - k * 0.05})`); } } }
    }
    if (s.id === 'wc') for (const c of cast) if (c.present && c.scene === 'wc' && c.smokeT > 0) { const k = clamp((c.smokeT - 0.4) / 2.4, 0, 1), L = Math.round(14 * k);
      px(g, 64 - ox, -s.WALL + 34 - oy, 20, 5, '#15171a'); px(g, 64 - ox, -s.WALL + 34 - oy, 20, 1, '#3a3f45');   // a phone on the edge of the sink
      if (L > 0) px(g, 66 - ox, -s.WALL + 36 - oy, L, 1, '#ffffff'); px(g, 82 - ox, -s.WALL + 32 - oy, 1, 5, '#d8c48a'); px(g, 81 - ox, -s.WALL + 32 - oy, 1, 1, '#b8a46a'); }   // the line, and a rolled-up banknote
    if (s.id === 'wc') { const ph = (now * 1.3) % 1; px(g, 74 - ox, -s.WALL + 37 + ph * 6 - oy, 1, 2, `rgba(170,200,220,${1 - ph})`); }   // the dripping tap
  }
  // tram 22: about once a real minute (an hour of the night) it rolls through Korunní, one way then the other
  function tramPos() { const t = clock % 60; if (t > 12) return null; const right = Math.floor(clock / 60) % 2 === 0, k = t / 12; return { x: right ? -280 + k * (ST.W + 320) : ST.W + 40 - k * (ST.W + 320), y: right ? 110 : 150, right }; }
  function tramItem(items, ox, oy) {
    const T = tramPos(); if (!T) return;
    const TS = SPR['s-tram']; if (TS) { items.push({ y: T.y + 26, d: () => { const X = Math.round(T.x - ox), Y = Math.round(T.y + 26 - TS.height - oy);
      g.save(); if (!T.right) { g.translate(X + TS.width, 0); g.scale(-1, 1); g.drawImage(TS, 0, Y); } else g.drawImage(TS, X, Y); g.restore(); } }); return; }
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
      for (const L of CHANDELIERS) { const X = L.x - ox, Y = L.y - oy, fl = 0.97 + 0.03 * Math.sin(now * 3 + L.x); glow(X, Y, 150, '255,180,100', 0.22 * fl); glow(X, Y - L.hang, 40, '255,220,160', 0.45 * fl); glow(X, Y, 60, '255,214,160', 0.12); }
      for (const C of CANDLES) { const f = 0.8 + 0.2 * Math.sin(now * 9 + C.x) * Math.sin(now * 4.1 + C.y); glow(C.x - ox, C.y - oy, 26, '255,170,80', 0.22 * f); glow(C.x - ox, C.y - oy - 2, 5, '255,230,170', 0.6 * f); }
      for (const a of ARCHES) glow(a.x - ox + a.w / 2, -oy + 10, 50, '120,150,230', 0.1);
      for (const wy of SIDE_WINDOWS) glow(s.W - ox, wy + 20 - oy, 60, '130,160,230', 0.1);
      glow(BAR.x + BAR.w / 2 - ox, BAR.y + 10 - oy, 110, '255,170,80', 0.12); glow(BAR.x + BAR.w / 2 - ox, BAR.y - 14 - oy, 50, '235,245,255', 0.08);
    } else if (s.id === 'wc') {
      glow(95 - ox, -10 - oy, 130, '220,245,235', 0.16 * flick); glow(74 - ox, -s.WALL + 14 - oy, 26, '230,245,255', 0.1);
    } else {
      for (const L of LAMPS) { glow(L.x - ox, L.y - oy - 88, 18, '255,220,160', 0.8); glow(L.x - ox, L.y - oy, 100, '255,170,90', 0.3); }
      for (const ax of ARCHW) { glow(ax - ox, -28 - oy, 16, '255,200,120', 0.35); glow(ax - ox, 10 - oy, 46, '255,170,80', 0.22); }
      glow(TAXI.x + 9 - ox, TAXI.y + 15 - oy, 4, '255,120,60', 0.5 + 0.4 * Math.sin(now * 2));   // a cigarette in the dark of the cab
      const T = tramPos(); if (T) { glow(T.x + 120 - ox, T.y - oy, 160, '255,230,170', 0.22); glow(T.x + (T.right ? 244 : -4) - ox, T.y - oy, 40, '255,250,220', 0.5); }
    }
    g.globalCompositeOperation = 'source-over';
    if (s.id === 'pub') {
      for (const sm of smoke) { const X = sm.x - ox, Y = sm.y - oy; if (X < -sm.r || X > VW + sm.r) continue; const gr = g.createRadialGradient(X, Y, 0, X, Y, sm.r); gr.addColorStop(0, 'rgba(220,205,185,0.07)'); gr.addColorStop(1, 'rgba(220,205,185,0)'); g.fillStyle = gr; g.fillRect(X - sm.r, Y - sm.r, sm.r * 2, sm.r * 2); }
      for (let i = 0; i < 40; i++) { const L = CHANDELIERS[i % 3], a = now * 0.1 + i, X = L.x - ox + Math.sin(a * 0.7 + i) * 50, Y = L.y - oy - L.hang / 2 + Math.sin(a * 0.43 + i * 2) * 30; px(g, X, Y, 1, 1, `rgba(255,236,200,${0.25 + 0.2 * Math.sin(now + i)})`); }
      for (const L of CHANDELIERS) { const X = L.x - ox, Y = L.y - oy - L.hang, fl = 0.9 + 0.1 * Math.sin(now * 2 + L.x), rod = L.y - L.hang + PUB.WALL;
        const near = me && me.scene === 'pub' ? Math.hypot(me.x - L.x, me.y - 24 - (L.y - L.hang)) : 999; g.globalAlpha = clamp((near - 18) / 50, 0.18, 1);   // fades when you stand under it
        px(g, X - 1, Y - rod, 2, rod - 8, '#6b5226'); px(g, X - 1, Y - rod, 1, rod - 8, '#a88a48');
        for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; pline(g, [[X, Y - 9], [X + Math.cos(a) * 20, Y + Math.sin(a) * 7]], 'rgba(150,118,56,0.8)'); }
        const back = [], front = []; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; (Math.sin(a) < 0 ? back : front).push(a); }
        const candle = a => { const bx = X + Math.cos(a) * 21, by2 = Y + Math.sin(a) * 7; px(g, bx - 1, by2 - 7, 3, 6, '#fff3d6'); px(g, bx - 1, by2 - 7, 1, 6, '#ffffff'); px(g, bx - 1, by2 - 1, 3, 2, '#8a6a2e'); };
        back.forEach(candle); for (let a = 0; a < 6.283; a += 0.03) px(g, X + Math.cos(a) * 21, Y + Math.sin(a) * 7, 1, 2, Math.sin(a) > 0 ? '#d6b25c' : '#8f7130'); front.forEach(candle);
        g.globalCompositeOperation = 'lighter'; glow(X, Y - 3, 46, '255,214,150', 0.32 * fl); glow(X, Y - 3, 16, '255,240,210', 0.35 * fl); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
    }
    if (s.id === 'wc') { px(g, 50 - ox, -s.WALL - 6 - oy, 90, 5, '#d8dcd8'); px(g, 52 - ox, -s.WALL - 5 - oy, 86, 3, flick < 1 ? '#9aa' : '#f4fffb'); }
    if (s.id === 'street') {   // the lime trees' canopies and the tram wires overhead
      for (const t of TREES) { const X = t.x - ox, Y = t.y - oy - 46, sw = Math.sin(now * 0.8 + t.x) * 1.5;
        for (let i = 0; i < 26; i++) { const a = i * 2.4, r = 6 + hash2(i, t.x, 2) * 22, bx = X + Math.cos(a) * r + sw, by2 = Y + Math.sin(a) * r * 0.6; g.fillStyle = ['#1f3a22', '#284a2a', '#2f5531', '#3a6638'][i % 4]; g.beginPath(); g.arc(bx, by2, 9 - r * 0.15, 0, 6.283); g.fill(); } }
      for (const wy of [110, 150]) { px(g, CORNER - 10 - ox, wy - 46 - oy, ST.W, 1, 'rgba(20,20,24,0.8)'); }
    }
    if (me && me.high > 0.02) { const h = me.high, beat = Math.max(0, Math.sin(now * 9)) ** 8;   // cold, hard light and a racing pulse at the edges
      g.globalCompositeOperation = 'overlay'; g.fillStyle = `rgba(150,215,255,${0.22 * h})`; g.fillRect(0, 0, VW, VH);
      g.globalCompositeOperation = 'saturation'; g.fillStyle = `rgba(255,0,0,${0.3 * h})`; g.fillRect(0, 0, VW, VH); g.globalCompositeOperation = 'source-over';
      const pv = g.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.3, VW / 2, VH / 2, Math.max(VW, VH) * 0.7); pv.addColorStop(0, 'rgba(255,255,255,0)'); pv.addColorStop(1, `rgba(255,255,255,${0.12 * h * beat})`); g.fillStyle = pv; g.fillRect(0, 0, VW, VH); }
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
    const n = peersHere(), s = me ? sceneOf(me) : PUB, beers = me ? me.beers : 0, k = fmt(clock) + (me ? me.id + me.money + me.bags : '') + n + s.id + beers; if (k === hudKey) return; hudKey = k;
    $('clock').textContent = `${fmt(clock)} · ${s.name}`;
    $('who').textContent = me ? NAMES[me.id] + ` · ${me.money} Kč` + (beers ? ` · ${beers} ${beers === 1 ? 'pivo' : beers < 5 ? 'piva' : 'piv'}` : '') + (me.bags ? ` · ${me.bags}× psaníčko` : '') + (n > 1 ? ` · nás ${n}` : '') : 'vyber si, za koho hraješ';
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
  const pack = c => [c.id, Math.round(c.x), Math.round(c.y), c.dir, c.moving ? 1 : 0, c.look ?? -1, c.present ? 1 : 0, c.sayKey, c.say ? c.say.text : '', c.scene, c.seat, Math.round(c.beer * 100), c.sipT > 0 ? 1 : 0, Math.round(c.drunk * 100), c.pu ? c.pu.t : '', c.pu ? c.pu.n : 0, c.smokeT > 0 ? Math.round(c.smokeT * 10) : 0];
  function unpack(c, e, remoteSpeech) {
    c.tx = +e[1] || c.x; c.ty = +e[2] || c.y; c.dir = (e[3] | 0) & 3; c.moving = !!e[4]; c.look = e[5] >= 0 ? e[5] & 3 : null;
    const sc = SC[e[9]] ? e[9] : 'pub'; if (sc !== c.scene || !c.present) { c.x = c.tx; c.y = c.ty; } c.scene = sc; c.present = !!e[6];
    c.seat = Number.isInteger(e[10]) ? e[10] : -1; if (c.seat >= 0) { c.x = c.tx; c.y = c.ty; }
    c.beer = Number.isFinite(e[11]) ? e[11] / 100 : -1; if (e[12] && c.sipT <= 0) c.sipT = 1.3; c.drunk = Number.isFinite(e[13]) ? e[13] / 100 : 0;
    if (e[7] !== seenSay.get(c.id)) { const first = !seenSay.has(c.id); seenSay.set(c.id, e[7]); if (!first && typeof e[8] === 'string' && e[8]) speak(c, e[8].slice(0, 160)); }
    c.smokeT = e[16] > 0 ? e[16] / 10 : 0;
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
    try { if (window.claude && window.claude.use) { const r = await window.claude.use('room'); if (r) { room = r; r.onPeers(() => applyPeers(), () => { room = null; peers = []; renderCards(); }); return; } } } catch (e) { room = null; }
    wsRoom();   // not on claude.ai: our own server (games/vinko/server) relays the same presence over a WebSocket
  }
  // The same small surface as the artifact room (presence, peers, onPeers), over games/vinko/server's /room.
  function wsRoom() {
    if (!/^https?:$/.test(location.protocol)) return;
    let ws, mine = {}, me2 = null, list = [], handlers = [], retry = 1000;
    const snap = () => list.map(p => ({ peer: p.peer, by: null, isMe: p.peer === me2, sameTab: p.peer === me2, kind: 'viewer', guest: false, presence: p.peer === me2 ? mine : (p.presence || {}), updatedAt: Date.now() }));
    const fire = () => handlers.forEach(h => h({ peers: snap() }));
    const open = () => {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/room`);
      ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'hello') { me2 = m.peer; retry = 1000; ws.send(JSON.stringify({ t: 'presence', p: mine })); if (!room) { room = R; R.onPeers(() => applyPeers()); } }
        if (m.t === 'peers' && Array.isArray(m.peers)) { list = m.peers; fire(); } };
      ws.onclose = () => { list = []; fire(); setTimeout(open, retry = Math.min(15000, retry * 2)); };
    };
    const R = { presence: async patch => { mine = { ...mine, ...patch }; for (const k in mine) if (mine[k] === null) delete mine[k]; if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'presence', p: mine })); },
      peers: () => snap(), onPeers: h => { handlers.push(h); setTimeout(() => h({ peers: snap() }), 0); return () => {}; }, connected: () => !!ws && ws.readyState === 1 };
    try { open(); } catch (e) {}
  }

  // ================================================================== THE INTRO: who are you tonight?
  // Each card holds a small canvas with the friend's own sprite: breathing at rest, walking in place when picked out.
  let cardCv = [], hoverId = null;
  function renderCards(note) {
    const box = $('cards'); if (!box) return; const cl = claims();
    if (!box.childElementCount) for (const id of PLAYABLE) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'card'; b.dataset.id = id; b.setAttribute('aria-label', `${NAMES[id]}, ${TRAITS[id]}`);
      const [cv] = mk(48, 48); cv.className = 'spr'; const n = document.createElement('b'); n.textContent = NAMES[id];
      b.append(cv, n); b.addEventListener('click', () => enter(id));
      for (const ev of ['pointerenter', 'focus']) b.addEventListener(ev, () => { hoverId = id; pickInfo(); });
      for (const ev of ['pointerleave', 'blur']) b.addEventListener(ev, () => { if (hoverId === id) { hoverId = null; pickInfo(); } });
      box.append(b); cardCv.push({ id, cv, k: cv.getContext('2d') }); }
    for (const b of box.children) { const p = cl.get(b.dataset.id), mine = me && me.id === b.dataset.id, taken = p && !p.sameTab;
      b.disabled = !!taken; b.classList.toggle('taken', !!taken); b.classList.toggle('mine', !!mine); }
    pickInfo();
    const n = viewers().length, line = $('intro-note');
    if (note) line.textContent = note;
    else line.textContent = room ? (n > 1 ? `Online · na stránce je vás ${n}. Každý hraje za jednoho.` : 'Online · zatím jsi tu sám. Pošli odkaz klukům.') : 'Hraješ sám. Online se hraje přes sdílený odkaz na tuhle stránku.';
  }
  function pickInfo() {
    const id = hoverId, cl = claims(), face = $('pick-face'), k = face.getContext('2d'); k.imageSmoothingEnabled = false; k.clearRect(0, 0, 64, 64);
    if (!id) { face.style.visibility = 'hidden'; $('pick-name').textContent = ''; $('pick-line').textContent = 'Najeď na někoho, klikni na toho, za koho hraješ.'; return; }
    face.style.visibility = ''; const f = SPR['face-' + id]; if (f) k.drawImage(f, 0, 0, 64, 64);
    const p = cl.get(id), taken = p && !p.sameTab;
    $('pick-name').textContent = NAMES[id] + (taken ? ' · hraje někdo jiný' : me && me.id === id ? ' · to jsi ty' : '');
    $('pick-line').textContent = TRAITS[id].charAt(0).toUpperCase() + TRAITS[id].slice(1) + '. ' + (LINES[id][0] || '');
  }
  function animateCards() {
    if ($('intro').hidden) return;
    for (const c of cardCv) { const im = SPR[c.id]; if (!im) continue; const walk = c.id === hoverId, f = walk ? 8 + Math.floor(now * 7) % 4 : 9, br = !walk && (now + c.id.length * 0.4) % 3.4 > 1.7 ? 1 : 0;
      c.k.clearRect(0, 0, 48, 48); c.k.fillStyle = 'rgba(0,0,0,0.35)'; c.k.beginPath(); c.k.ellipse(24, 44, 8, 2.5, 0, 0, 6.283); c.k.fill();
      c.k.drawImage(im, f * 48, 29, 48, 19, 0, 29, 48, 19); c.k.drawImage(im, f * 48, 0, 48, 30, 0, br, 48, 30); }
  }
  // The 18+ gate, once per browser.
  let adultOk = false; try { adultOk = localStorage.getItem('vinko-18') === '1'; } catch (e) {}
  $('adult-ok').addEventListener('click', () => { adultOk = true; try { localStorage.setItem('vinko-18', '1'); } catch (e) {} $('intro').classList.remove('gated'); const f = $('cards').querySelector('button:not(:disabled)'); if (f) f.focus(); });
  function showIntro(note) { $('intro').classList.toggle('gated', !adultOk); if (!adultOk) setTimeout(() => $('adult-ok').focus(), 0); $('intro').hidden = false; renderCards(note); const f = $('cards').querySelector('button:not(:disabled)'); if (f) f.focus(); }
  function enter(id) {
    const p = claims().get(id); if (p && !p.sameTab) { renderCards(`${NAMES[id]} už hraje někdo jiný.`); return; }
    if (me) leave(true);
    me = by(id); me.ctrl = 'me'; me.path = null; me.moving = false;
    if (!me.present) { me.present = true; me.scene = 'pub'; me.x = 100; me.y = 204; }
    $('intro').hidden = true; hudKey = ''; lastSent = ''; camSnap = true;
  }
  function leave(quiet) {
    if (!me) return; const c = me; me = null; c.ctrl = 'npc'; c.path = null; c.plan = 'idle'; c.planT = 3; c.moving = false; lastSent = ''; hudKey = ''; camSnap = true;
    if (!quiet) showIntro();
  }

  // ================================================================== GO
  let last = performance.now();
  function frame(t) { const dt = Math.min(0.05, (t - last) / 1000); last = t; update(dt); draw(); hud(); animateCards(); requestAnimationFrame(frame); }
  await loadArt(); furnish();
  try { await document.fonts.load('10px VT323', 'Dvě děti, chlapi. Žena volala. Paťas Štěpa Pažout Saša Výčepní ťuk'); } catch (e) {}
  $('load')?.remove();
  window.__game = { cast, by, keys, use, drink, punch, enter, leave, isHost, context, SC, get me() { return me; }, setClock: m => { clock = m; }, tramPos, screenOf: c => [(c.x - view[0]) * SCALE, (c.y - view[1]) * SCALE] };
  showIntro(); connect();
  window.__ready = true;
  requestAnimationFrame(frame);
})();
