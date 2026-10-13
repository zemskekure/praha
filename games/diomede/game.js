// Diomede: a top-down walk around the two Diomede Islands with a man in a turtleneck, his white whippet and a
// rowing boat. World building first: the islands, the strait, the date line, the village, the boat.
// Art is drawn in code for now (placeholders); sprites from RetroDiffusion replace them later, one by one,
// through the SPRITES table (an entry with an image wins over the code-drawn stand-in).
(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('c'), g = canvas.getContext('2d');
  const T = 16;                                   // pixels per tile
  const MW = 170, MH = 130;                       // map size in tiles

  // ------------------------------------------------------------------ seeded randomness (the world is the same every visit)
  const mulberry = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const hash2 = (x, y, s = 0) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s, 2246822519); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; };
  const vnoise = (x, y, s) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const fbm = (x, y, s) => vnoise(x, y, s) * 0.55 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.3 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.15;

  // ------------------------------------------------------------------ the islands
  // Big Diomede (west, Russia) is long and lies north-south; Little Diomede (east, USA) is small and round-shouldered.
  // Both are steep plateaus ringed by cliffs; you can only land where there is a beach.
  const ISLANDS = [
    { id: 'big', name: 'Big Diomede', country: 'Russia', nick: 'Tomorrow Island', cx: 44, cy: 64, rx: 25, ry: 52, seed: 3, beach: { ang: 0.05, width: 0.42 } },
    { id: 'little', name: 'Little Diomede', country: 'USA', nick: 'Yesterday Island', cx: 124, cy: 68, rx: 17, ry: 14, seed: 11, beach: { ang: Math.PI, width: 0.55 } },
  ];
  const DATE_LINE = 86;                           // tile column of the International Date Line (in the strait)
  const radius = (I, a) => 1 + 0.13 * Math.sin(a * 3 + I.seed) + 0.08 * Math.sin(a * 5 + I.seed * 2) + 0.05 * Math.sin(a * 9 + I.seed * 3) + 0.06 * (fbm(Math.cos(a) * 2 + I.seed, Math.sin(a) * 2, I.seed) - 0.5);
  function islandAt(x, y) {   // which island a tile belongs to, and how deep inside it is (0 at the shore, 1 at the centre)
    for (const I of ISLANDS) { const dx = (x - I.cx) / I.rx, dy = (y - I.cy) / I.ry, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx), R = radius(I, a);
      if (r < R) return { I, depth: 1 - r / R, ang: a }; }
    return null;
  }
  const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

  // Tile kinds. Walkable: shingle, tundra, snow, scree, path, dock. Boat floats on deep and shallow water only.
  const K = { DEEP: 0, SHALLOW: 1, SHINGLE: 2, CLIFF: 3, TUNDRA: 4, SNOW: 5, SCREE: 6, PATH: 7, DOCK: 8 };
  const WALK = new Set([K.SHINGLE, K.TUNDRA, K.SNOW, K.SCREE, K.PATH, K.DOCK]), FLOAT = new Set([K.DEEP, K.SHALLOW]);
  const map = new Uint8Array(MW * MH), owner = new Int8Array(MW * MH).fill(-1);
  const at = (x, y) => x < 0 || y < 0 || x >= MW || y >= MH ? K.DEEP : map[y * MW + x];
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const h = islandAt(x + 0.5, y + 0.5), k = y * MW + x;
    if (!h) { map[k] = K.DEEP; continue; }
    owner[k] = ISLANDS.indexOf(h.I);
    const onBeach = angDiff(h.ang, h.I.beach.ang) < h.I.beach.width;
    const edge = h.depth * Math.min(h.I.rx, h.I.ry);          // tiles from the shore, roughly
    const n = fbm(x * 0.12, y * 0.12, h.I.seed);
    if (edge < (onBeach ? 3.2 : 1.6)) map[k] = onBeach ? K.SHINGLE : K.CLIFF;
    else if (n > 0.66 && edge > 5 && !(h.I.id === 'little' && x < h.I.cx + 2)) map[k] = K.SNOW;
    else if (n < 0.34) map[k] = K.SCREE;
    else map[k] = K.TUNDRA;
  }
  // Shallow water within 3 tiles of any land.
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (map[y * MW + x] === K.DEEP) {
    outer: for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const t = at(x + dx, y + dy); if (t !== K.DEEP && t !== K.SHALLOW && dx * dx + dy * dy <= 10) { map[y * MW + x] = K.SHALLOW; break outer; } }
  }
  // Docks: a wooden pier from each beach straight out into the strait, toward the other island.
  function pier(I, dir) {
    const y = Math.round(I.cy + 1); let x = Math.round(I.cx);
    while (at(x, y) !== K.DEEP && at(x, y) !== K.SHALLOW && x > 0 && x < MW - 1) x += dir;   // walk out to the waterline
    const start = x; for (let i = 0; i < 6; i++) { map[y * MW + x] = K.DOCK; map[(y + 1) * MW + x] = K.DOCK; x += dir; }
    return { x0: start, x1: x - dir, y, end: { x: (x + dir * 1.5) * T + T / 2, y: (y + 1) * T } };
  }
  const piers = { big: pier(ISLANDS[0], 1), little: pier(ISLANDS[1], -1) };
  // Paths: from each pier up into the island (to the village on Little Diomede, to the weather station on Big).
  function path(x0, y0, x1, y1) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let i = 0; i <= n; i++) { const x = Math.round(x0 + (x1 - x0) * i / n + Math.sin(i * 0.4) * 1.2), y = Math.round(y0 + (y1 - y0) * i / n); for (const [dx, dy] of [[0, 0], [1, 0]]) { const k = (y + dy) * MW + x + dx; if (WALK.has(map[k]) && map[k] !== K.DOCK) map[k] = K.PATH; } } }
  const L = ISLANDS[1], B = ISLANDS[0];
  path(piers.little.x0 + 1, piers.little.y, L.cx - 3, L.cy - 6);
  path(piers.big.x0 - 1, piers.big.y, B.cx + 4, B.cy - 18);
  // The cliffs must still let you up from the beach: carve the path through any cliff tile it meets.
  for (let k = 0; k < map.length; k++) if (map[k] === K.CLIFF) { const x = k % MW, y = (k / MW) | 0; if (at(x - 1, y) === K.PATH && at(x + 1, y) === K.PATH) map[k] = K.PATH; }

  // ------------------------------------------------------------------ props (code-drawn stand-ins until the sprites arrive)
  const rnd = mulberry(20261013);
  const props = [];
  const place = (kind, tx, ty, extra = {}) => props.push({ kind, x: tx * T, y: ty * T, ...extra });
  // Little Diomede: houses climbing the slope above the beach, drying racks, upturned skin boats, the school.
  const HOUSE_COL = ['#7d4b3a', '#4d6b78', '#8a7b5a', '#5e6e4f', '#a0553c', '#6b6f75'];
  for (let i = 0; i < 7; i++) { const tx = L.cx - 12 + (i % 3) * 5.6 + (Math.floor(i / 3) % 2) * 2.4 + rnd() * 0.6, ty = L.cy - 9 + Math.floor(i / 3) * 5.2 + rnd() * 0.5; if (WALK.has(at(tx | 0, ty | 0))) place('house', tx, ty, { col: HOUSE_COL[i % HOUSE_COL.length], w: 2 + (rnd() < 0.4 ? 1 : 0), v: i }); }
  place('school', L.cx - 4, L.cy - 10);
  for (let i = 0; i < 4; i++) place('rack', L.cx - 14 + i * 2.2, L.cy + 4 + rnd());
  for (let i = 0; i < 3; i++) place('umiak', L.cx - 15 + i * 2.5, L.cy + 7.5);
  // Big Diomede: the weather station, its mast, a radar dome and a fuel tank, all old and quiet.
  place('station', B.cx + 3, B.cy - 20); place('mast', B.cx + 7, B.cy - 22); place('dome', B.cx - 1, B.cy - 24); place('tank', B.cx + 6, B.cy - 16);
  // Boulders and lichen-covered rocks everywhere on the plateaus.
  for (let i = 0; i < 160; i++) { const tx = 4 + rnd() * (MW - 8), ty = 4 + rnd() * (MH - 8), t = at(tx | 0, ty | 0); if (t === K.TUNDRA || t === K.SCREE) place('rock', tx, ty, { s: 0.6 + rnd() * 0.8 }); }
  // Date-line buoys in the strait.
  for (let ty = 6; ty < MH - 6; ty += 9) if (at(DATE_LINE, ty) === K.DEEP) place('buoy', DATE_LINE + 0.5, ty);

  // ------------------------------------------------------------------ the map, painted once
  const PAL = {
    [K.DEEP]: ['#24394a', '#20333f', '#2a4253'], [K.SHALLOW]: ['#33586a', '#2f5162', '#3a6273'], [K.SHINGLE]: ['#8d877c', '#7c776d', '#a19a8c'],
    [K.CLIFF]: ['#55524f', '#4a4845', '#625e59'], [K.TUNDRA]: ['#66734d', '#5d6a45', '#748256'], [K.SNOW]: ['#e3e8eb', '#d3dadf', '#eef1f2'],
    [K.SCREE]: ['#77736b', '#6a675f', '#86817a'], [K.PATH]: ['#8f8068', '#83755e', '#9c8d74'], [K.DOCK]: ['#7b5b3d', '#6c4f35', '#8a6847'],
  };
  const world = document.createElement('canvas'); world.width = MW * T; world.height = MH * T;
  const w = world.getContext('2d');
  // Ground textures from RetroDiffusion's tilesets (each 32 px texture covers 2x2 tiles); code colours where there is none.
  const TEX = { [K.TUNDRA]: 'tex-grass', [K.SCREE]: 'tex-rock', [K.SHINGLE]: 'tex-shingle', [K.DEEP]: 'tex-water', [K.SHALLOW]: 'tex-water' };
  function paintWorld() {
  for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
    const t = at(tx, ty), pal = PAL[t], X = tx * T, Y = ty * T, tex = SPR[TEX[t]];
    w.fillStyle = pal[0]; w.fillRect(X, Y, T, T);
    if (tex) { w.drawImage(tex, (tx % 2) * 16, (ty % 2) * 16, 16, 16, X, Y, T, T); if (t === K.SHALLOW) { w.fillStyle = 'rgba(120,170,180,0.28)'; w.fillRect(X, Y, T, T); } if (t === K.DEEP) { w.fillStyle = 'rgba(16,30,44,0.35)'; w.fillRect(X, Y, T, T); } }
    else for (let i = 0; i < 18; i++) { const r = hash2(tx * 31 + i, ty * 17 - i, t); w.fillStyle = pal[1 + (r > 0.5 ? 1 : 0)]; w.fillRect(X + ((r * 997) | 0) % T, Y + ((r * 7919) | 0) % T, 1 + (t === K.SHINGLE ? 1 : 0), 1); }
    if (t === K.TUNDRA && hash2(tx, ty, 5) > 0.6) { w.fillStyle = '#a7a568'; w.fillRect(X + 4 + ((hash2(tx, ty, 6) * 8) | 0), Y + 5, 2, 2); }   // lichen
    if (t === K.DOCK) { w.fillStyle = '#5a412b'; for (let i = 0; i < T; i += 4) w.fillRect(X + i, Y, 1, T); }
    // Cliffs and banks read as height: a dark face where land drops to water to its south.
    if (!FLOAT.has(t) && t !== K.DOCK && FLOAT.has(at(tx, ty + 1))) { w.fillStyle = t === K.SHINGLE ? '#6a655c' : '#3b3936'; w.fillRect(X, Y + T - (t === K.SHINGLE ? 3 : 7), T, t === K.SHINGLE ? 3 : 7); }
    if (t === K.CLIFF) { w.fillStyle = '#3f3d3a'; w.fillRect(X + ((hash2(tx, ty, 8) * 12) | 0), Y + 3, 3, 9); }
    // Surf: pale foam where water touches land.
    if (FLOAT.has(t)) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = at(tx + dx, ty + dy); if (!FLOAT.has(n) && n !== K.DOCK) { w.fillStyle = 'rgba(232,238,240,0.55)'; for (let i = 0; i < 6; i++) { const r = hash2(tx + i, ty - i, 9); const px = dx ? (dx > 0 ? T - 2 : 0) : (r * T) | 0, py = dy ? (dy > 0 ? T - 2 : 0) : (r * T) | 0; w.fillRect(X + px, Y + py, 2, 2); } } }
  }
  // The date line: an orange dashed line painted on the water.
  w.fillStyle = '#e0703a'; for (let y = 0; y < MH * T; y += 12) w.fillRect(DATE_LINE * T + T / 2 - 1, y, 2, 6);
  }

  // ------------------------------------------------------------------ sprites: code-drawn stand-ins
  const SPR = {}, META = {};   // loaded sprite images and their frame data (art/sprites.json); empty means draw in code
  async function loadArt() {
    try { Object.assign(META, await (await fetch('art/sprites.json')).json()); } catch (e) { return; }
    await Promise.all(Object.keys(META).map(n => new Promise(res => { const im = new Image(); im.onload = () => { SPR[n] = im; res(); }; im.onerror = res; im.src = `art/${n}.png`; })));
  }
  // The whippet, drawn as pixel art in code after the reference: cream body with a deep chest and tucked waist, a tan
  // coat, folded ears, a long thin tail, near legs white and far legs grey-green, bold dark outline. Four gallop frames
  // and a standing frame, facing right; facing left is the mirror.
  const DOG = (() => {
    const W2 = 34, H2 = 22, mk = () => { const c = document.createElement('canvas'); c.width = W2; c.height = H2; return c; };
    const poly = (c, pts, col) => { c.fillStyle = col; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); };
    const line = (c, x0, y0, x1, y1, col) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1; c.fillStyle = col; for (let i = 0; i <= n; i++) c.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1); };
    // paw offsets [front near, front far, hind near, hind far] from shoulder (20,11) and hip (10,10), and a body bob
    const POSES = {
      run0: { bob: -1, legs: [[7, 7], [5, 7], [-7, 6], [-5, 7]], tail: 2 }, run1: { bob: 0, legs: [[2, 8], [4, 8], [-3, 8], [-1, 8]], tail: 1 },
      run2: { bob: 0, legs: [[-4, 7], [-2, 8], [5, 8], [3, 7]], tail: 0 }, run3: { bob: -1, legs: [[0, 8], [2, 8], [1, 8], [-2, 8]], tail: 1 },
      stand: { bob: 0, legs: [[0, 8], [1, 8], [0, 8], [-1, 8]], tail: 3 },
    };
    const out = {};
    for (const [name, P] of Object.entries(POSES)) {
      const cv = mk(), c = cv.getContext('2d'), b = P.bob, WHITE = '#f3eee4', SHADE = '#dcd3c3', FAR = '#6f8a83', TAN = '#c79b5f', TAND = '#9c7443';
      const legs = (i, x0, y0) => { const [dx, dy] = P.legs[i], kx = x0 + dx * 0.45 + (i < 2 ? 1 : -1), ky = y0 + dy * 0.5; line(c, x0, y0, kx, ky, i % 2 ? FAR : WHITE); line(c, kx, ky, x0 + dx, y0 + dy, i % 2 ? FAR : WHITE); c.fillStyle = i % 2 ? FAR : WHITE; c.fillRect(Math.round(x0 + dx), Math.round(y0 + dy), 2, 1); };
      legs(1, 20, 11 + b); legs(3, 10, 10 + b);                                         // far legs, behind the body
      poly(c, [[7, 7 + b], [9, 5.5 + b], [20, 5.5 + b], [23.5, 7 + b], [23.5, 10 + b], [21, 13 + b], [17, 13 + b], [13.5, 10.5 + b], [10, 10.5 + b], [7, 9.5 + b]], WHITE);   // body: deep chest, tucked waist
      poly(c, [[17, 12 + b], [21, 13 + b], [23.5, 10 + b], [23.5, 11.5 + b], [20, 13.5 + b]], SHADE);
      poly(c, [[20, 6 + b], [23, 2.5 + b], [25.5, 3 + b], [24.5, 8.5 + b]], WHITE);       // neck
      poly(c, [[22.5, 1.5 + b], [26, 1 + b], [28, 2.5 + b], [31, 3.6 + b], [30.5, 4.6 + b], [26, 5 + b], [23.5, 4.5 + b]], WHITE);   // long narrow head and muzzle
      c.fillStyle = '#2a2420'; c.fillRect(30, Math.round(3.5 + b), 1, 1); c.fillRect(26, Math.round(2.5 + b), 1, 1);               // nose, eye
      c.fillStyle = '#9a948c'; c.fillRect(22, Math.round(0.5 + b), 2, 1); c.fillStyle = '#d99c8c'; c.fillRect(23, Math.round(1.5 + b), 1, 1);   // folded rose ear
      poly(c, [[10, 5 + b], [19.5, 5 + b], [21, 7 + b], [20, 10 + b], [11, 10 + b], [9.5, 7 + b]], TAN);                        // the coat
      line(c, 11, 10 + b, 20, 10 + b, TAND); line(c, 21, 7 + b, 21, 10 + b, TAND); c.fillStyle = '#e8c890'; c.fillRect(12, Math.round(5.5 + b), 4, 1);
      const tw = P.tail; line(c, 7, 8 + b, 4, 9 + b + tw * 0.4, WHITE); line(c, 4, 9 + b + tw * 0.4, 1, 8 + b + tw, WHITE);   // tail
      legs(0, 20, 11 + b); legs(2, 10, 10 + b);                                         // near legs
      // Binarise, then a bold dark outline around everything.
      const id = c.getImageData(0, 0, W2, H2), d = id.data;
      for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 100 ? 255 : 0;
      const filled = (x, y) => x >= 0 && y >= 0 && x < W2 && y < H2 && d[(y * W2 + x) * 4 + 3] === 255;
      const o = new Uint8ClampedArray(d);
      for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) if (!filled(x, y) && (filled(x + 1, y) || filled(x - 1, y) || filled(x, y + 1) || filled(x, y - 1))) { const k = (y * W2 + x) * 4; o[k] = 0x2b; o[k + 1] = 0x26; o[k + 2] = 0x22; o[k + 3] = 255; }
      c.putImageData(new ImageData(o, W2, H2), 0, 0);
      const fl = mk(), fc = fl.getContext('2d'); fc.translate(W2, 0); fc.scale(-1, 1); fc.drawImage(cv, 0, 0);
      out[name] = { right: cv, left: fl };
    }
    return out;
  })();
  function px(c, x, y, w2 = 1, h2 = 1, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w2, h2); }
  const PROP_SPR = { school: 'school', station: 'station', dome: 'dome' };
  function drawProp(c, p, ox, oy) {
    const x = p.x - ox, y = p.y - oy;
    const sn = p.kind === 'house' ? ['house-a', 'house-b', 'house-c'][p.v % 3] : p.kind === 'rock' && p.s > 1.15 ? 'rock-a' : PROP_SPR[p.kind];
    if (sn && SPR[sn]) { const im = SPR[sn]; c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(Math.round(x - im.width / 2 + 3), Math.round(y + 6), im.width - 6, 3); c.drawImage(im, Math.round(x - im.width / 2), Math.round(y + 8 - im.height)); return; }
    switch (p.kind) {
      case 'house': { const wd = p.w * T; px(c, x - 1, y + 9, wd + 2, 3, 'rgba(0,0,0,0.25)'); px(c, x, y - 4, wd, 13, p.col); px(c, x - 1, y - 9, wd + 2, 6, '#3d3432'); px(c, x + 3, y, 4, 5, '#f2d48a'); px(c, x + wd - 7, y + 1, 3, 8, '#2a2522'); for (let i = 0; i < wd; i += 3) px(c, x + i, y + 9, 1, 3, '#2f2a28'); break; }   // on stilts
      case 'school': px(c, x - 1, y + 10, 42, 3, 'rgba(0,0,0,0.25)'); px(c, x, y - 4, 40, 14, '#9c3d2e'); px(c, x - 1, y - 9, 42, 6, '#3d3432'); for (let i = 4; i < 38; i += 7) px(c, x + i, y, 4, 4, '#f2d48a'); break;
      case 'rack': px(c, x, y, 1, 10, '#4b3a2a'); px(c, x + 14, y, 1, 10, '#4b3a2a'); px(c, x, y + 1, 15, 1, '#4b3a2a'); for (let i = 2; i < 14; i += 3) px(c, x + i, y + 2, 2, 6, '#8e5b4a'); break;   // fish drying
      case 'umiak': px(c, x, y, 18, 5, '#c9b896'); px(c, x + 2, y + 1, 14, 3, '#b6a37f'); px(c, x, y + 5, 18, 1, 'rgba(0,0,0,0.3)'); break;
      case 'station': px(c, x - 1, y + 12, 34, 3, 'rgba(0,0,0,0.25)'); px(c, x, y - 2, 32, 14, '#c8c2b4'); px(c, x - 1, y - 7, 34, 6, '#6e7477'); px(c, x + 5, y + 2, 4, 4, '#3a4a58'); px(c, x + 14, y + 2, 4, 4, '#3a4a58'); px(c, x + 24, y + 3, 5, 9, '#5b5048'); break;
      case 'mast': px(c, x, y - 34, 2, 44, '#9aa1a4'); for (let i = 0; i < 40; i += 6) px(c, x - 2, y - 32 + i, 6, 1, '#9aa1a4'); px(c, x - 1, y - 36, 4, 3, '#e0703a'); break;
      case 'dome': px(c, x - 2, y + 8, 26, 3, 'rgba(0,0,0,0.25)'); for (let r = 0; r < 11; r++) px(c, x + 11 - Math.sqrt(121 - r * r), y - r + 6, 2 * Math.sqrt(121 - r * r), 1, r > 7 ? '#f1f1ee' : '#dcdcd8'); break;
      case 'tank': px(c, x, y, 14, 9, '#8c7a66'); px(c, x, y - 2, 14, 3, '#a3927d'); px(c, x, y + 9, 14, 2, 'rgba(0,0,0,0.3)'); break;
      case 'rock': { const s = p.s * 7; px(c, x - s / 2, y - s / 3, s, s * 0.7, '#6f6b64'); px(c, x - s / 2, y - s / 3, s * 0.6, s * 0.3, '#8a857d'); px(c, x - s / 2 + 1, y + s * 0.37, s, 1, 'rgba(0,0,0,0.35)'); break; }
      case 'buoy': { const bob = Math.sin(now * 2 + p.y) * 1; px(c, x - 3, y - 3 + bob, 6, 6, '#e0703a'); px(c, x - 1, y - 7 + bob, 2, 4, '#2b2b2b'); px(c, x - 4, y + 3 + bob, 8, 1, 'rgba(232,238,240,0.6)'); break; }
    }
  }
  // The man: dark turtleneck, sand trousers, short brown hair; seen from above and a little in front.
  function drawMan(c, x, y, dir, step, sitting) {
    x = Math.round(x); y = Math.round(y);
    if (SPR.man) {   // RetroDiffusion walk sheet: rows up, left, down, right; 4 steps each
      const row = [2, 3, 0, 1][dir], f = sitting ? 1 : (man.moving ? Math.floor(step * 0.55) % 4 : 1), M = META.man;
      if (!sitting) px(c, x - 6, y - 1, 12, 3, 'rgba(0,0,0,0.22)');
      c.drawImage(SPR.man, (row * 4 + f) * M.fw, 0, M.fw, sitting ? 30 : M.fh, x - M.fw / 2, y - 44, M.fw, sitting ? 30 : M.fh);
      return;
    }
    px(c, x - 5, y + 1, 10, 3, 'rgba(0,0,0,0.25)');                     // shadow
    if (!sitting) { const s = Math.sin(step) * 2; px(c, x - 3, y - 5 + Math.max(0, s), 2, 6 - Math.max(0, s), '#b9a684'); px(c, x + 1, y - 5 + Math.max(0, -s), 2, 6 - Math.max(0, -s), '#b9a684'); px(c, x - 3, y, 2, 1, '#2c2622'); px(c, x + 1, y, 2, 1, '#2c2622'); }
    px(c, x - 4, y - 13, 8, 9, '#1d2430');                             // turtleneck body
    px(c, x - 5, y - 12, 1, 6, '#1d2430'); px(c, x + 4, y - 12, 1, 6, '#1d2430');   // arms
    px(c, x - 2, y - 14, 4, 2, '#252d3a');                             // the roll neck
    px(c, x - 3, y - 19, 6, 5, '#d8b49a');                             // face
    px(c, x - 3, y - 20, 6, 2, '#4a3426'); if (dir !== 0) px(c, x - 3, y - 18, 6, 2, '#4a3426');   // hair (back of head when facing away)
    if (dir === 0) { px(c, x - 2, y - 17, 1, 1, '#2a2020'); px(c, x + 1, y - 17, 1, 1, '#2a2020'); }
    if (dir === 1) px(c, x + 2, y - 17, 1, 1, '#2a2020'); if (dir === 3) px(c, x - 3, y - 17, 1, 1, '#2a2020');
  }
  // The whippet: white, long thin legs, deep chest, a thin tail, a grey patch on one ear.
  function drawDog(c, x, y, dir, step, sitting) {
    x = Math.round(x); y = Math.round(y);
    if (DOG) {
      const face = dir === 3 || (dir !== 1 && dog.face === 'left') ? 'left' : 'right';
      const fr = sitting ? DOG.stand : DOG['run' + (Math.floor(step * 0.9) % 4)];
      px(c, x - 9, y - 1, 18, 2, 'rgba(0,0,0,0.22)');
      c.drawImage(fr[face], x - 17, y - 20);
      return;
    }
    px(c, x - 6, y, 12, 2, 'rgba(0,0,0,0.22)');
    const side = dir === 1 || dir === 3, f = dir === 3 ? -1 : 1, s = Math.sin(step) * 1.5;
    if (side) {
      if (!sitting) { px(c, x - 4 + s, y - 4, 1, 4, '#e9e6e0'); px(c, x - 2 - s, y - 4, 1, 4, '#e9e6e0'); px(c, x + 3 + s, y - 4, 1, 4, '#e9e6e0'); px(c, x + 4 - s, y - 4, 1, 4, '#e9e6e0'); }
      px(c, x - 5, y - 7, 10, 3, '#f4f2ee'); px(c, x - 5, y - 5, 3, 1, '#f4f2ee');            // body, tucked belly
      px(c, x + 4 * f - (f < 0 ? 2 : 0), y - 10, 3, 3, '#f4f2ee'); px(c, x + 6 * f - (f < 0 ? 1 : 0), y - 9, 2, 1, '#e9e6e0');   // head and long muzzle
      px(c, x + 3 * f, y - 11, 1, 2, '#9a9690');                                         // ear
      px(c, x - 6 * f - (f < 0 ? 0 : 1), y - 8, 2, 1, '#e9e6e0'); px(c, x - 7 * f - (f < 0 ? 0 : 1), y - 7 + (sitting ? 2 : 0), 1, 2, '#e9e6e0');   // tail
    } else {
      if (!sitting) { px(c, x - 2, y - 3 + Math.max(0, s), 1, 3, '#e9e6e0'); px(c, x + 1, y - 3 + Math.max(0, -s), 1, 3, '#e9e6e0'); }
      px(c, x - 2, y - 9, 4, 6, '#f4f2ee'); px(c, x - 2, y - 12 + (dir === 2 ? 2 : 0), 4, 3, '#f4f2ee');
      px(c, x - 2, y - 13 + (dir === 2 ? 2 : 0), 1, 2, '#9a9690'); px(c, x + 1, y - 13 + (dir === 2 ? 2 : 0), 1, 2, '#e9e6e0');
      if (dir === 0) px(c, x - 1, y - 10, 2, 1, '#2a2020');
    }
  }
  // The boat: a small wooden rowing boat, drawn along its heading, with oars that sweep while rowing.
  function drawBoat(c, b, ox, oy) {
    const cx = b.x - ox, cy = b.y - oy, ca = Math.cos(b.a), sa = Math.sin(b.a);
    if (SPR.boat) {   // 8 painted views; pick the one whose bow points closest to the heading
      const M = META.boat; let best = 0, bd = 9; M.angles.forEach((a, i) => { const d = Math.abs(Math.atan2(Math.sin(a - b.a), Math.cos(a - b.a))); if (d < bd) { bd = d; best = i; } });
      if (Math.abs(b.v) > 5) { c.fillStyle = 'rgba(232,238,240,0.4)'; c.fillRect(Math.round(cx - ca * 22) - 3, Math.round(cy - sa * 22) - 1, 6, 2); }
      c.drawImage(SPR.boat, best * M.fw, 0, M.fw, M.fh, Math.round(cx - M.fw / 2), Math.round(cy - M.fh / 2), M.fw, M.fh);
      return;
    }
    const P = (u, v) => [cx + u * sa + v * ca, cy - u * ca + v * sa];   // u along the bow, v to starboard
    const hull = [[11, 0], [7, 4.5], [-8, 4.5], [-11, 3], [-11, -3], [-8, -4.5], [7, -4.5]];
    c.fillStyle = 'rgba(232,238,240,0.35)'; if (Math.abs(b.v) > 5) { const [wx, wy] = P(-13, 0); c.fillRect(wx - 3, wy - 1, 6, 2); }
    c.beginPath(); hull.forEach(([u, v], i) => { const [X, Y] = P(u, v + 0.8); i ? c.lineTo(X, Y + 1) : c.moveTo(X, Y + 1); }); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill();
    c.beginPath(); hull.forEach(([u, v], i) => { const [X, Y] = P(u, v); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); c.fillStyle = '#7a5032'; c.fill();
    c.beginPath(); hull.map(([u, v]) => [u * 0.8, v * 0.7]).forEach(([u, v], i) => { const [X, Y] = P(u, v); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); c.fillStyle = '#a7774c'; c.fill();
    for (const u of [5, -2]) { const [x1, y1] = P(u, -3.5), [x2, y2] = P(u, 3.5); c.strokeStyle = '#5e3d25'; c.lineWidth = 2; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }   // thwarts
    if (b.manned) {
      const sweep = Math.sin(b.stroke) * 5;
      for (const side of [-1, 1]) { const [x1, y1] = P(1, side * 4), [x2, y2] = P(1 - sweep, side * 13); c.strokeStyle = '#c9a678'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); px(c, x2 - 1, y2 - 1, 3, 3, '#c9a678'); }
    }
  }

  // ------------------------------------------------------------------ the characters
  const startX = (piers.little.x0 + 2) * T, startY = (piers.little.y - 1) * T;
  const man = { x: startX, y: startY, dir: 3, step: 0, moving: false, inBoat: false };
  const dog = { x: startX + 22, y: startY + 6, dir: 3, step: 0, moving: false, mode: 'follow', t: 0, ang: 0 };
  const boat = { x: piers.little.end.x, y: piers.little.end.y + 4, a: -Math.PI / 2, v: 0, stroke: 0, manned: false };
  const walkable = (x, y) => WALK.has(at(Math.floor(x / T), Math.floor(y / T)));
  const floats = (x, y) => FLOAT.has(at(Math.floor(x / T), Math.floor(y / T)));

  // ------------------------------------------------------------------ input
  const keys = new Set();
  addEventListener('keydown', e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys.add(k);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
    if (k === 'e' || k === ' ') toggleBoat(); if (k === 'm') showMap = !showMap; });
  addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  addEventListener('blur', () => keys.clear());
  // Touch: hold and drag from where you touched; the man walks (or the boat rows) that way.
  let touch = null;
  canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') touch = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', e => { if (touch) { touch.x = e.clientX; touch.y = e.clientY; } });
  for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => { touch = null; });
  $('btn-e').addEventListener('click', () => toggleBoat()); $('btn-m').addEventListener('click', () => { showMap = !showMap; });
  function axis() {
    let x = (keys.has('d') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('a') || keys.has('ArrowLeft') ? 1 : 0);
    let y = (keys.has('s') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('w') || keys.has('ArrowUp') ? 1 : 0);
    if (touch) { const dx = touch.x - touch.x0, dy = touch.y - touch.y0, l = Math.hypot(dx, dy); if (l > 12) { x = dx / Math.max(l, 50); y = dy / Math.max(l, 50); } }
    return [x, y];
  }
  function toggleBoat() {
    if (!man.inBoat) {
      if (Math.hypot(man.x - boat.x, man.y - boat.y) < 30) { man.inBoat = true; boat.manned = true; dog.mode = 'boat'; say('You climb in. The whippet jumps in after you.'); }
      else say('The boat is moored at the end of the pier.');
    } else {
      // Step off onto the nearest walkable tile within reach (a pier or a beach).
      let best = null;
      for (let r = 8; r <= 30 && !best; r += 4) for (let a = 0; a < 6.28; a += 0.4) { const x = boat.x + Math.cos(a) * r, y = boat.y + Math.sin(a) * r; if (walkable(x, y)) { best = [x, y]; break; } }
      if (!best) { say('Too far from a pier or a beach to step ashore.'); return; }
      man.inBoat = false; boat.manned = false; boat.v = 0; [man.x, man.y] = best; dog.mode = 'follow'; dog.x = best[0] + 10; dog.y = best[1] + 4;
    }
  }
  let msg = '', msgT = 0; const say = s => { msg = s; msgT = 3.5; };

  // ------------------------------------------------------------------ time: Little Diomede runs a day behind
  // Game clock: one real second is one minute. Little Diomede (Alaska time) starts on a Tuesday at 08:00;
  // Big Diomede (Russian time across the date line) is 21 hours ahead: Wednesday 05:00.
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let clock = 2 * 1440 + 8 * 60;   // minutes since Sunday 00:00, Little Diomede
  const fmt = m => { m = ((m % 10080) + 10080) % 10080; const d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mi = Math.floor(m % 60); return `${DAYS[d]} ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`; };

  // ------------------------------------------------------------------ update
  let now = 0, last = performance.now(), showMap = false, idle = 0;
  function update(dt) {
    now += dt; clock += dt; if (msgT > 0) msgT -= dt;
    const [ax, ay] = axis();
    if (man.inBoat) {
      // Row: up/down pull forward and back, left/right turn. The boat glides and slows in the water.
      const pull = -ay, turn = ax;
      boat.a += turn * 1.9 * dt * (0.4 + Math.min(1, Math.abs(boat.v) / 30));
      boat.v += pull * 42 * dt; boat.v *= Math.exp(-dt * 0.9); boat.v = Math.max(-18, Math.min(46, boat.v));
      if (pull || turn) boat.stroke += dt * 6;
      const nx = boat.x + Math.cos(boat.a) * boat.v * dt, ny = boat.y + Math.sin(boat.a) * boat.v * dt;
      const bow = [nx + Math.cos(boat.a) * 11 * Math.sign(boat.v || 1), ny + Math.sin(boat.a) * 11 * Math.sign(boat.v || 1)];
      if (floats(nx, ny) && floats(...bow)) { boat.x = nx; boat.y = ny; } else { boat.v *= -0.25; say('Rocks. Back off and find the pier.'); }
      man.x = boat.x - Math.cos(boat.a) * 2; man.y = boat.y - Math.sin(boat.a) * 2; dog.x = boat.x + Math.cos(boat.a) * 6; dog.y = boat.y + Math.sin(boat.a) * 6;
      dog.dir = dirOf(Math.cos(boat.a), Math.sin(boat.a)); man.dir = dog.dir;
    } else {
      const l = Math.hypot(ax, ay); man.moving = l > 0.1;
      if (man.moving) {
        const sp = 64 * Math.min(1, l), vx = ax / Math.max(1, l) * sp, vy = ay / Math.max(1, l) * sp;
        if (walkable(man.x + vx * dt, man.y)) man.x += vx * dt; if (walkable(man.x, man.y + vy * dt)) man.y += vy * dt;
        man.dir = dirOf(vx, vy); man.step += dt * 10; idle = 0;
      } else idle += dt;
      // The whippet: trots after him, and when he stands still for a while it runs a few happy laps around him.
      if (idle > 4 && dog.mode === 'follow') { dog.mode = 'zoom'; dog.t = 0; dog.ang = Math.atan2(dog.y - man.y, dog.x - man.x); }
      if (dog.mode === 'zoom' && (man.moving || dog.t > 5)) dog.mode = 'follow';
      let tx, ty, speed;
      if (dog.mode === 'zoom') { dog.t += dt; dog.ang += dt * 3.2; const R = 26 + Math.sin(dog.t * 2) * 6; tx = man.x + Math.cos(dog.ang) * R; ty = man.y + Math.sin(dog.ang) * R * 0.7; speed = 120; }
      else { const bx = man.x - Math.cos(dirAngle(man.dir)) * 16 + 10, by = man.y - Math.sin(dirAngle(man.dir)) * 16 + 4; tx = bx; ty = by; speed = 90; }
      const dx = tx - dog.x, dy = ty - dog.y, d = Math.hypot(dx, dy);
      dog.moving = d > (dog.mode === 'zoom' ? 2 : 10);
      if (dog.moving) { const v = Math.min(speed, d * 4) * dt, nx = dog.x + dx / d * v, ny = dog.y + dy / d * v;
        if (walkable(nx, ny)) { dog.x = nx; dog.y = ny; } else if (d > 60) { dog.x = man.x + 8; dog.y = man.y + 4; }
        dog.dir = dirOf(dx, dy); if (Math.abs(dx) > 2) dog.face = dx < 0 ? 'left' : 'right'; dog.step += dt * (dog.mode === 'zoom' ? 18 : 12); }
    }
  }
  const dirOf = (x, y) => Math.abs(x) > Math.abs(y) ? (x > 0 ? 1 : 3) : (y > 0 ? 0 : 2);   // 0 down, 1 right, 2 up, 3 left
  const dirAngle = d => [Math.PI / 2, 0, -Math.PI / 2, Math.PI][d];

  // ------------------------------------------------------------------ draw
  let VW = 320, VH = 180, SCALE = 3;
  function resize() { SCALE = Math.max(2, Math.round(Math.min(innerWidth / 300, innerHeight / 190))); VW = Math.ceil(innerWidth / SCALE); VH = Math.ceil(innerHeight / SCALE); canvas.width = VW; canvas.height = VH; g.imageSmoothingEnabled = false; }
  addEventListener('resize', resize); resize();
  const cam = { x: man.x, y: man.y };
  function draw() {
    const fx = man.inBoat ? boat.x : man.x, fy = man.inBoat ? boat.y : man.y;
    cam.x += (fx - cam.x) * 0.12; cam.y += (fy - cam.y) * 0.12;
    const ox = Math.round(Math.max(0, Math.min(MW * T - VW, cam.x - VW / 2))), oy = Math.round(Math.max(0, Math.min(MH * T - VH, cam.y - VH / 2)));
    g.drawImage(world, ox, oy, VW, VH, 0, 0, VW, VH);
    // Water glints drift with the current.
    for (let i = 0; i < 90; i++) { const gx = (hash2(i, 1, 4) * (VW + 40) + now * 6 * (0.5 + hash2(i, 2, 4))) % (VW + 40) - 20, gy = hash2(i, 3, 4) * VH;
      if (floats(gx + ox, gy + oy) && Math.sin(now * 2 + i) > 0.6) px(g, gx, gy, 2, 1, 'rgba(220,232,236,0.5)'); }
    // Everything that stands is drawn from back to front by its foot.
    const items = props.map(p => ({ y: p.y + 8, d: () => drawProp(g, p, ox, oy) }));
    items.push({ y: boat.y, d: () => drawBoat(g, boat, ox, oy) });
    if (man.inBoat) {   // seated in the hull: drawn right after the boat, dog first if it sits further back on screen
      const sitM = () => drawMan(g, man.x - ox, man.y - oy + 20, man.dir, 0, true), sitD = () => drawDog(g, dog.x - ox, dog.y - oy + 6, dog.dir, 0, true);
      items.push({ y: boat.y + 0.1, d: dog.y < man.y ? () => { sitD(); sitM(); } : () => { sitM(); sitD(); } });
    } else {
      items.push({ y: man.y, d: () => drawMan(g, man.x - ox, man.y - oy, man.dir, man.step, false) });
      items.push({ y: dog.y, d: () => drawDog(g, dog.x - ox, dog.y - oy, dog.dir, dog.step, !dog.moving) });
    }
    items.sort((a, b) => a.y - b.y).forEach(i => i.d());
    // Message line, bottom centre of the picture.
    if (msgT > 0) { g.font = '8px monospace'; const wdt = g.measureText(msg).width + 10; g.globalAlpha = Math.min(1, msgT); px(g, (VW - wdt) / 2, VH - 26, wdt, 13, 'rgba(16,22,28,0.85)'); g.fillStyle = '#efe9dc'; g.fillText(msg, (VW - wdt) / 2 + 5, VH - 16); g.globalAlpha = 1; }
    if (showMap) drawMiniMap();
    hud(fx, fy);
  }
  function drawMiniMap() {
    const s = Math.min((VW - 20) / MW, (VH - 20) / MH), mx = (VW - MW * s) / 2, my = (VH - MH * s) / 2;
    px(g, mx - 4, my - 4, MW * s + 8, MH * s + 8, 'rgba(16,22,28,0.9)');
    g.drawImage(world, 0, 0, MW * T, MH * T, mx, my, MW * s, MH * s);
    const p = man.inBoat ? boat : man; px(g, mx + p.x / T * s - 2, my + p.y / T * s - 2, 4, 4, '#e0703a');
  }
  const hudEl = { little: $('clock-little'), big: $('clock-big'), where: $('where') };
  let lastHud = '';
  function hud(x, y) {
    const tx = x / T, ty = y / T, k = at(tx | 0, ty | 0), own = owner[(ty | 0) * MW + (tx | 0)];
    const near = Math.abs(tx - DATE_LINE - 0.5) < 1.2 && FLOAT.has(k);
    const side = tx < DATE_LINE + 0.5 ? 'big' : 'little';
    const where = near ? 'International Date Line' : own >= 0 ? `${ISLANDS[own].name} · ${ISLANDS[own].nick}` : `Bering Strait · ${side === 'big' ? 'Russian side' : 'American side'}`;
    const key = where + side + Math.floor(clock);
    if (key === lastHud) return; lastHud = key;
    hudEl.where.textContent = where; hudEl.where.classList.toggle('line', near);
    hudEl.little.textContent = `Little Diomede · ${fmt(clock)}`; hudEl.big.textContent = `Big Diomede · ${fmt(clock + 21 * 60)}`;
    hudEl.little.className = side === 'little' ? 'here' : 'there'; hudEl.big.className = side === 'big' ? 'here' : 'there';
  }

  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    update(dt); draw();
    window.__frames = (window.__frames || 0) + 1;
    requestAnimationFrame(frame);
  }
  say('Little Diomede. The boat is at the end of the pier.');
  await loadArt(); paintWorld();
  window.__ready = true;
  window.__game = { man, dog, boat, toggleBoat, keys };   // for the self-check
  requestAnimationFrame(frame);
})();
