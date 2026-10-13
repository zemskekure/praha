// Diomede: a top-down walk around the two Diomede Islands with a man in a turtleneck, his white whippet and a
// rowing boat. World building first: the islands, the strait, the date line, the village, the boat.
// Art is drawn in code for now (placeholders); sprites from RetroDiffusion replace them later, one by one,
// through the SPRITES table (an entry with an image wins over the code-drawn stand-in).
(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('c'), g = canvas.getContext('2d');
  const T = 16;                                   // pixels per tile
  const MW = 236, MH = 176;                       // map size in tiles

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
    { id: 'big', name: 'Big Diomede', country: 'Russia', nick: 'Tomorrow Island', cx: 62, cy: 88, rx: 36, ry: 72, seed: 3, beach: { ang: 0.05, width: 0.42 } },
    { id: 'little', name: 'Little Diomede', country: 'USA', nick: 'Yesterday Island', cx: 178, cy: 90, rx: 28, ry: 22, seed: 11, beach: { ang: Math.PI, width: 0.55 } },
  ];
  const DATE_LINE = 121;                           // tile column of the International Date Line (in the strait)
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
    else if (n < 0.3) map[k] = K.SCREE;
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
    const start = x; for (let i = 0; i < 7; i++) { for (const r of [-1, 0, 1]) map[(y + r) * MW + x] = K.DOCK; x += dir; }
    return { x0: start, x1: x - dir, y, dir, end: { x: (x - dir * 2) * T + T / 2, y: (y + 2) * T + 10 } };
  }
  const piers = { big: pier(ISLANDS[0], 1), little: pier(ISLANDS[1], -1) };
  // Paths: from each pier up into the island (to the village on Little Diomede, to the weather station on Big).
  const trails = [];   // the paths again, as smooth lines in pixels, for painting
  function path(x0, y0, x1, y1) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); const tr = []; trails.push(tr); for (let i = 0; i <= n; i++) { tr.push([(x0 + (x1 - x0) * i / n + Math.sin(i * 0.4) * 1.2 + 1) * T, (y0 + (y1 - y0) * i / n + 0.5) * T]); const x = Math.round(x0 + (x1 - x0) * i / n + Math.sin(i * 0.4) * 1.2), y = Math.round(y0 + (y1 - y0) * i / n); for (const [dx, dy] of [[0, 0], [1, 0]]) { const k = (y + dy) * MW + x + dx; if (WALK.has(map[k]) && map[k] !== K.DOCK) map[k] = K.PATH; } } }
  const L = ISLANDS[1], B = ISLANDS[0];
  path(piers.little.x0 + 1, piers.little.y, L.cx - 6, L.cy - 6); path(L.cx - 20, L.cy - 1, L.cx + 6, L.cy - 4);
  path(piers.big.x0 - 1, piers.big.y, B.cx + 8, B.cy - 18);
  // The cliffs must still let you up from the beach: carve the path through any cliff tile it meets.
  for (let k = 0; k < map.length; k++) if (map[k] === K.CLIFF) { const x = k % MW, y = (k / MW) | 0; if (at(x - 1, y) === K.PATH && at(x + 1, y) === K.PATH) map[k] = K.PATH; }

  // ------------------------------------------------------------------ props (code-drawn stand-ins until the sprites arrive)
  const rnd = mulberry(20261013);
  const props = [];
  const place = (kind, tx, ty, extra = {}) => props.push({ kind, x: tx * T, y: ty * T, ...extra });
  // Little Diomede: three houses above the beach.
  const HOUSE_COL = ['#7d4b3a', '#4d6b78', '#8a7b5a', '#5e6e4f', '#a0553c', '#6b6f75'];
  for (let i = 0; i < 3; i++) { const tx = L.cx - 17 + i * 9 + (i === 1 ? 1 : 0), ty = L.cy - 9 + (i === 1 ? -2 : 0) + rnd() * 0.6; if (WALK.has(at(tx | 0, ty | 0))) place('house', tx, ty, { col: HOUSE_COL[i % HOUSE_COL.length], w: 2 + (rnd() < 0.4 ? 1 : 0), v: i }); }
  for (let i = 0; i < 4; i++) rnd();   // keep the seeded layout below unchanged
  for (const [dx, dy] of [[-10, -3], [-18, 3]]) place('lamp', L.cx + dx, L.cy + dy);
  // Big Diomede: only the old weather station and its mast.
  place('station', B.cx + 6, B.cy - 22); place('mast', B.cx + 14, B.cy - 26);
  // Boulders and lichen-covered rocks everywhere on the plateaus.
  for (let i = 0; i < 0; i++) { const tx = 4 + rnd() * (MW - 8), ty = 4 + rnd() * (MH - 8), t = at(tx | 0, ty | 0); if (t === K.TUNDRA || t === K.SCREE) place('rock', tx, ty, { s: 0.6 + rnd() * 0.8 }); }
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
  }
  // Organic edges: the tile painting is resampled through a smooth noise field, so shores, beaches, snow and grass
  // meet in curves instead of 16 px steps. Piers stay straight. The curved shoreline is kept for the surf.
  const surf = [], waterMask = document.createElement('canvas'), reflTmp = document.createElement('canvas');   // per tile row: [x, y, nx, ny] water pixels touching land, nx/ny pointing out to sea
  // Nature, painted per pixel after the warp: meadows that drift between moss, sage and autumn gold with rusty
  // bearberry patches, and a sea that deepens from turquoise shallows to ink blue. Ordered dithering keeps it pixel art.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const MEADOW = ['#465f3a', '#526c3f', '#5f7a45', '#6d874b', '#7c9350', '#8d9c56', '#a0a35c', '#b3a660', '#c2a964'].map(hex);
  const BERRY = ['#6b7446', '#7d7449', '#8d6f4a', '#97704c'].map(hex);
  const PEBBLE = ['#5f5a52', '#716a5f', '#857c6e', '#998e7d', '#ad a08d'.replace(' ', ''), '#c2b5a0'].map(hex);
  const CLIFFP = ['#2f2e2c', '#3a3936', '#47453f', '#55524b', '#63604f'].map(hex);
  const DIRT = ['#6f5f48', '#7d6b51', '#8c795c', '#9a8866'].map(hex);
  const ROCK = ['#55574d', '#63655a', '#727366', '#838374', '#8a9a5c'].map(hex);
  const SEA = ['#8cc8bf', '#71b5b3', '#5a9fa8', '#47889b', '#3a7290', '#2f5f80', '#284f71', '#224364', '#1d3958'].map(hex);
  function paintNature(out, kind, W, H) {
    const C = 8, cw = Math.ceil(W / C) + 1, ch = Math.ceil(H / C) + 1, zone = new Float32Array(cw * ch), patch = new Float32Array(cw * ch), dist = new Float32Array(cw * ch);
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { const x = i * C, y = j * C, k = j * cw + i;
      zone[k] = fbm(x / 170, y / 170, 71); patch[k] = fbm(x / 28, y / 28, 83);
      const kk = kind[Math.min(H - 1, y) * W + Math.min(W - 1, x)]; dist[k] = kk === K.DEEP || kk === K.SHALLOW ? 1e6 : 0; }
    // Distance to land, in cells (two-pass chamfer).
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) { const k = j * cw + i; let d = dist[k]; if (!d) continue;
      if (i) d = Math.min(d, dist[k - 1] + 1); if (j) { d = Math.min(d, dist[k - cw] + 1); if (i) d = Math.min(d, dist[k - cw - 1] + 1.414); if (i < cw - 1) d = Math.min(d, dist[k - cw + 1] + 1.414); } dist[k] = d; }
    for (let j = ch - 1; j >= 0; j--) for (let i = cw - 1; i >= 0; i--) { const k = j * cw + i; let d = dist[k]; if (!d) continue;
      if (i < cw - 1) d = Math.min(d, dist[k + 1] + 1); if (j < ch - 1) { d = Math.min(d, dist[k + cw] + 1); if (i < cw - 1) d = Math.min(d, dist[k + cw + 1] + 1.414); if (i) d = Math.min(d, dist[k + cw - 1] + 1.414); } dist[k] = d; }
    const lerp = (A, x, y) => { const i = Math.min(cw - 2, (x / C) | 0), j = Math.min(ch - 2, (y / C) | 0), fx = x / C - i, fy = y / C - j, k = j * cw + i;
      return (A[k] * (1 - fx) + A[k + 1] * fx) * (1 - fy) + (A[k + cw] * (1 - fx) + A[k + cw + 1] * fx) * fy; };
    const pick = (P, v, x, y) => { const f = Math.max(0, Math.min(P.length - 1.001, v * (P.length - 1))), b = f | 0; return P[(f - b) * 16 > BAYER[(y & 3) * 4 + (x & 3)] ? b + 1 : b]; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, t = kind[i]; let c;
      if (t === K.TUNDRA) {
        const z = lerp(zone, x, y), pa = lerp(patch, x, y), fine = hash2(x >> 1, y >> 1, 5) - 0.5;
        if (pa > 0.72 && z < 0.45 && hash2(x >> 1, y >> 1, 9) < 0.7) c = pick(BERRY, (pa - 0.72) * 4 + fine * 0.6, x, y);
        else c = pick(MEADOW, 0.15 + (z - 0.3) * 1.3 + (pa - 0.5) * 0.5 + fine * 0.18, x, y);
      } else if (t === K.SHINGLE) {   // rounded pebbles, each its own shade, lit from the top left
        const px2 = x >> 1, py2 = y >> 1, hv = hash2(px2 + ((y >> 2) & 1), py2, 21);
        c = pick(PEBBLE, 0.25 + hv * 0.55 + (lerp(zone, x, y) - 0.5) * 0.4 + ((x & 1) === 0 && (y & 1) === 0 ? 0.12 : 0), x, y);
      } else if (t === K.CLIFF) {   // dark basalt, streaked downward
        const st = hash2(x >> 1, (y >> 3) + ((x >> 1) & 3) * 7, 31);
        c = pick(CLIFFP, 0.15 + st * 0.6 + (lerp(zone, x, y) - 0.5) * 0.3, x, y);
      } else if (t === K.SCREE) {   // broken rock with lichen
        const hv = hash2(x >> 2, y >> 2, 23), l = hash2(x >> 1, y >> 1, 24);
        c = l < 0.42 ? pick(MEADOW, 0.1 + lerp(zone, x, y) * 0.5 + (hv - 0.5) * 0.3, x, y) : l > 0.9 ? ROCK[4] : pick(ROCK.slice(0, 4), 0.25 + hv * 0.55 + ((y & 3) === 0 ? 0.15 : 0), x, y);
      } else if (t === K.DEEP || t === K.SHALLOW) {
        const d = lerp(dist, x, y) * C, v = Math.min(1, Math.pow(d / 190, 0.75)) + (lerp(zone, x, y) - 0.5) * 0.15;
        c = pick(SEA, v, x, y);
      } else continue;
      out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; }
  }
  // Wildflowers in drifts: yellow arctic poppies, magenta fireweed, blue forget-me-nots, white cotton grass.
  const FLOWERS = [['#f4d65a', '#c9a637'], ['#d65493', '#a63a70'], ['#7f95e0', '#5a6fbf'], ['#f6f3e8', '#cfcabb']];
  function plantFlowers(kind, W, H) {
    // The trails: worn earth with soft, grassy edges.
    for (const tr of trails) for (let i = 0; i < tr.length - 1; i++) { const [ax, ay] = tr[i], [bx, by] = tr[i + 1], L = Math.hypot(bx - ax, by - ay);
      for (let s2 = 0; s2 < L; s2 += 3) { const cx = ax + (bx - ax) * s2 / L, cy = ay + (by - ay) * s2 / L, r = 6 + fbm(cx / 30, cy / 30, 3) * 3;
        for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) { const X = Math.round(cx + dx), Y = Math.round(cy + dy); if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const kk = kind[Y * W + X]; if (kk === K.DEEP || kk === K.SHALLOW || kk === K.DOCK) continue;
          const d = Math.hypot(dx, dy) / r; if (d > 1 - hash2(X, Y, 33) * 0.35) continue; const v = 0.3 + hash2(X >> 1, Y >> 1, 34) * 0.5 - d * 0.3, f = Math.max(0, Math.min(3, Math.floor(v * 4))); const c = DIRT[f];
          w.fillStyle = `rgb(${c.join(',')})`; w.fillRect(X, Y, 1, 1); } } }
    // Boulders: lichen-spotted stones resting in the grass, each with its own shadow.
    for (let i = 0; i < 1400; i++) { const x = (hash2(i, 1, 55) * W) | 0, y = (hash2(i, 2, 55) * H) | 0, kk = kind[y * W + x]; if (kk !== K.TUNDRA && kk !== K.SCREE) continue;
      if (kk === K.TUNDRA && hash2(i, 3, 55) > 0.35) continue; const r = 2 + Math.floor(hash2(i, 4, 55) ** 2 * 6);
      w.fillStyle = 'rgba(30,36,26,0.35)'; w.beginPath(); w.ellipse(x + 2, y + 2, r + 1, r * 0.7 + 1, 0, 0, 6.283); w.fill();
      w.fillStyle = '#5c5d57'; w.beginPath(); w.ellipse(x, y, r, r * 0.75, 0, 0, 6.283); w.fill();
      w.fillStyle = '#7b7b72'; w.beginPath(); w.ellipse(x - r * 0.25, y - r * 0.25, r * 0.6, r * 0.42, 0, 0, 6.283); w.fill();
      if (r > 3) { w.fillStyle = hash2(i, 5, 55) < 0.5 ? '#c9a33e' : '#9aa65a'; w.fillRect(x + ((hash2(i, 6, 55) - 0.5) * r) | 0, y - 1, 2, 1); } }
    for (let i = 0; i < 70000; i++) { const x = (hash2(i, 1, 77) * W) | 0, y = (hash2(i, 2, 77) * H) | 0;
      if (kind[y * W + x] !== K.TUNDRA) continue;
      const bloom = fbm(x / 60, y / 60, 101); if (bloom < 0.5 || hash2(i, 4, 77) > (bloom - 0.5) * 4) continue;
      const [c1, c2] = FLOWERS[Math.floor(fbm(x / 90, y / 90, 113) * 7.99) % 4];
      w.fillStyle = '#3f5a33'; w.fillRect(x, y + 1, 1, 1);
      w.fillStyle = c1; w.fillRect(x, y, 1, 1); if (hash2(i, 3, 77) < 0.35) { w.fillStyle = c2; w.fillRect(x + 1, y, 1, 1); } }
  }
  function warpWorld() {
    const W = world.width, H = world.height, src = w.getImageData(0, 0, W, H).data, out = new Uint8ClampedArray(src.length), kind = new Uint8Array(W * H);
    const G = 4, gw = Math.ceil(W / G) + 1, gh = Math.ceil(H / G) + 1, ofx = new Float32Array(gw * gh), ofy = new Float32Array(gw * gh), A = 7;
    // The land itself is classified smoothly, from the same island shapes and noise the tiles came from, sampled at the
    // warped position: coasts, cliff bands and rocky patches become curves instead of 16 px steps.
    const gE = new Float32Array(gw * gh), gN = new Float32Array(gw * gh), gB = new Uint8Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) { const x = i * G, y = j * G, k = j * gw + i; ofx[k] = (fbm(x / 38, y / 38, 41) - 0.5) * 2 * A; ofy[k] = (fbm(x / 38, y / 38, 57) - 0.5) * 2 * A;
      const tx = (x + ofx[k]) / T, ty = (y + ofy[k]) / T; let best = -1e9, bi = null, ba = 0;
      for (const I of ISLANDS) { const dx = (tx - I.cx) / I.rx, dy = (ty - I.cy) / I.ry, a = Math.atan2(dy, dx), e = (1 - Math.hypot(dx, dy) / radius(I, a)) * Math.min(I.rx, I.ry); if (e > best) { best = e; bi = I; ba = a; } }
      gE[k] = best; gN[k] = fbm(tx * 0.12, ty * 0.12, bi.seed); gB[k] = angDiff(ba, bi.beach.ang) < bi.beach.width ? 1 : 0; }
    for (let y = 0; y < H; y++) { const j = Math.min(gh - 2, (y / G) | 0), fy = y / G - j;
      for (let x = 0; x < W; x++) { const i = Math.min(gw - 2, (x / G) | 0), fx = x / G - i, k0 = j * gw + i;
        const dx = (ofx[k0] * (1 - fx) + ofx[k0 + 1] * fx) * (1 - fy) + (ofx[k0 + gw] * (1 - fx) + ofx[k0 + gw + 1] * fx) * fy;
        const dy = (ofy[k0] * (1 - fx) + ofy[k0 + 1] * fx) * (1 - fy) + (ofy[k0 + gw] * (1 - fx) + ofy[k0 + gw + 1] * fx) * fy;
        let sx = Math.max(0, Math.min(W - 1, Math.round(x + dx))), sy = Math.max(0, Math.min(H - 1, Math.round(y + dy)));
        const own = at((x / T) | 0, (y / T) | 0); let t;
        if (own === K.DOCK) { sx = x; sy = y; t = own; }
        else { const e = (gE[k0] * (1 - fx) + gE[k0 + 1] * fx) * (1 - fy) + (gE[k0 + gw] * (1 - fx) + gE[k0 + gw + 1] * fx) * fy, n = (gN[k0] * (1 - fx) + gN[k0 + 1] * fx) * (1 - fy) + (gN[k0 + gw] * (1 - fx) + gN[k0 + gw + 1] * fx) * fy, beach = gB[fx < 0.5 ? (fy < 0.5 ? k0 : k0 + gw) : (fy < 0.5 ? k0 + 1 : k0 + gw + 1)];
          t = e <= 0 ? K.DEEP : e < (beach ? 3.2 : 1.6) ? (beach ? K.SHINGLE : K.CLIFF) : n < 0.3 ? K.SCREE : K.TUNDRA;
          if (t !== K.DEEP && at((sx / T) | 0, (sy / T) | 0) === K.PATH && t === K.CLIFF) t = K.SCREE; }
        const si = (sy * W + sx) * 4, di = (y * W + x) * 4; out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = 255; kind[y * W + x] = t; } }
    paintNature(out, kind, W, H);
    w.putImageData(new ImageData(out, W, H), 0, 0);
    plantFlowers(kind, W, H);
    { const m = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) if (kind[i] === K.DEEP || kind[i] === K.SHALLOW) m[i * 4 + 3] = 255;
      waterMask.width = W; waterMask.height = H; waterMask.getContext('2d').putImageData(new ImageData(m, W, H), 0, 0); }
    for (let ty = 0; ty < MH; ty++) surf.push([]);
    const wet = k => k === K.DEEP || k === K.SHALLOW;
    for (let y = 1; y < H - 1; y += 2) for (let x = 1; x < W - 1; x += 2) { if (!wet(kind[y * W + x])) continue;
      let nx = 0, ny = 0; for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) { const k = kind[Math.min(H - 1, Math.max(0, y + dy)) * W + Math.min(W - 1, Math.max(0, x + dx))]; if (!wet(k) && k !== K.DOCK) { nx -= dx; ny -= dy; } }
      if (nx || ny) { const l = Math.hypot(nx, ny); surf[(y / T) | 0].push([x, y, nx / l, ny / l]); } }
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
  const PROP_SPR = { school: ['school2', 'school'], station: ['station2', 'station'], dome: ['dome2', 'dome'], rack: ['rack2'], umiak: ['umiak2'], tank: ['tank2'], mast: ['mast2'], buoy: ['buoy2'], walrus: ['walrus'], seal: ['seal'] };
  const pick = list => list && list.find(n => SPR[n]);
  function propSprite(p) {
    if (p.kind === 'house') return pick([['house-a2', 'house-b2', 'house-c2', 'house-d2'][p.v % 4], ['house-a', 'house-b', 'house-c'][p.v % 3]]);
    if (p.kind === 'rock') return p.s > 1.25 ? pick(['rock-a']) : p.s > 1.0 ? pick(['rock-b2']) : null;
    return pick(PROP_SPR[p.kind]);
  }
  function drawProp(c, p, ox, oy) {
    const x = p.x - ox, y = p.y - oy;
    const sn = propSprite(p);
    if (sn && p.rot) { const im = SPR[sn]; c.save(); c.translate(Math.round(x), Math.round(y)); c.rotate(p.rot);
      c.globalAlpha = 0.28; c.drawImage(sil(im), -im.width / 2 + 3, -im.height / 2 + 3); c.globalAlpha = 1;   // lying flat: a soft drop shadow
      c.drawImage(im, -im.width / 2, -im.height / 2); c.restore(); return; }
    if (sn) { const im = SPR[sn], k = p.kind === 'mast' ? 2 : 1, bob = p.kind === 'buoy' ? Math.round(Math.sin(now * 2 + p.y) * 1.5) : 0; c.drawImage(im, Math.round(x - im.width * k / 2), Math.round(y + 8 - im.height * k + bob), im.width * k, im.height * k); return; }
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
      case 'lamp': px(c, x, y - 16, 2, 24, '#2c2a28'); px(c, x - 2, y - 19, 6, 4, '#3a3630'); px(c, x - 1, y - 18, 4, 2, lightLevel() > 0.25 ? '#ffe2a0' : '#8a8578'); break;
      case 'buoy': { const bob = Math.sin(now * 2 + p.y) * 1; px(c, x - 3, y - 3 + bob, 6, 6, '#e0703a'); px(c, x - 1, y - 7 + bob, 2, 4, '#2b2b2b'); px(c, x - 4, y + 3 + bob, 8, 1, 'rgba(232,238,240,0.6)'); break; }
    }
  }
  // Walk sheets (rows up, left, down, right; 4 steps): which frame, and drawing it with its feet at (x, y).
  function sheetFrame(name, dir, step, moving) { const M = META[name]; if (!M || !SPR[name]) return null; const row = [2, 1, 0, 3][dir], f = moving ? Math.floor(step * 0.55) % 4 : 1; return [(row * 4 + f) * M.fw, 0, M.fw, M.fh]; }
  function drawSheet(name, x, y, dir, step, moving) { const F = sheetFrame(name, dir, step, moving); if (!F) return; g.drawImage(SPR[name], F[0], 0, F[2], F[3], Math.round(x - F[2] / 2), Math.round(y - 44), F[2], F[3]); }
  // The man: dark turtleneck, sand trousers, short brown hair; seen from above and a little in front.
  function drawMan(c, x, y, dir, step, sitting) {
    x = Math.round(x); y = Math.round(y);
    if (SPR.man) {   // RetroDiffusion walk sheet: rows up, left, down, right; 4 steps each
      const row = [2, 1, 0, 3][dir], f = sitting ? 1 : (man.moving ? Math.floor(step * 0.55) % 4 : 1), M = META.man;
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
  const startX = (piers.little.x0 + piers.little.dir * 1) * T + T / 2, startY = piers.little.y * T + T / 2;   // on the pier, by the shore
  const man = { x: startX, y: startY, dir: 3, step: 0, moving: false, inBoat: false };
  const dog = { x: startX + 14, y: startY + 10, dir: 3, step: 0, moving: false, mode: 'follow', t: 0, ang: 0 };
  const boat = { x: piers.little.end.x, y: piers.little.end.y, a: piers.little.dir > 0 ? 0 : Math.PI, v: 0, stroke: 0, manned: false };   // moored alongside the pier's end
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
      if (Math.hypot(man.x - boat.x, man.y - boat.y) < 56) { man.inBoat = true; boat.manned = true; dog.mode = 'boat'; say('You climb in. The whippet jumps in after you.'); }
      else say('The boat is moored at the end of the pier.');
    } else {
      // Step off onto the nearest walkable tile within reach (a pier or a beach).
      let best = null;
      for (let r = 8; r <= 48 && !best; r += 4) for (let a = 0; a < 6.28; a += 0.4) { const x = boat.x + Math.cos(a) * r, y = boat.y + Math.sin(a) * r; if (walkable(x, y)) { best = [x, y]; break; } }
      if (!best) { say('Too far from a pier or a beach to step ashore.'); return; }
      man.inBoat = false; boat.manned = false; boat.v = 0; [man.x, man.y] = best; dog.mode = 'follow'; dog.t = 0; dog.x = best[0] + 10; dog.y = best[1] + 4;
    }
  }
  let msg = '', msgT = 0; const say = s => { msg = s; msgT = 3.5; };

  // ------------------------------------------------------------------ time: Little Diomede runs a day behind
  // Game clock: one real second is one minute. Little Diomede (Alaska time) starts on a Tuesday at 08:00;
  // Big Diomede (Russian time across the date line) is 21 hours ahead: Wednesday 05:00.
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let clock = 2 * 1440 + 5 * 60 + 20;   // minutes since Sunday 00:00, Little Diomede: Tuesday 05:20, just before dawn
  const fmt = m => { m = ((m % 10080) + 10080) % 10080; const d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60), mi = Math.floor(m % 60); return `${DAYS[d]} ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`; };

  // ================================================================== ATMOSPHERE
  // Light, time, weather and life. Everything is driven by the Little Diomede clock and a slow, seeded weather.
  const hourNow = () => (((clock % 1440) + 1440) % 1440) / 60;
  // The sun: rises 06:10 in the east, a low arctic arc through the south (at most ~24 degrees), sets 18:40 in the west.
  function sunState(h = hourNow()) {
    const rise = 6.15, set = 18.65, day = (h - rise) / (set - rise);
    const elev = day > 0 && day < 1 ? Math.sin(day * Math.PI) * 0.42 : -0.25;
    const az = Math.PI / 2 + Math.max(0, Math.min(1, day)) * Math.PI;   // east (pi/2) through south (pi) to west (3pi/2), clockwise from north
    return { elev, az, up: elev > 0 };
  }
  // The colour of each hour: what the world is multiplied by, and a warm or cool glow screened over it.
  const GRADE = [   // hour, multiply rgb, glow rgb, glow strength
    [0, [62, 78, 128], [40, 70, 120], 0.05], [4.8, [66, 80, 132], [60, 80, 140], 0.05], [5.7, [140, 130, 176], [210, 140, 170], 0.10],
    [6.3, [255, 208, 190], [255, 150, 110], 0.14], [7.4, [255, 234, 216], [255, 200, 150], 0.08], [9.5, [255, 252, 246], [255, 255, 255], 0.0],
    [14.5, [255, 248, 236], [255, 230, 200], 0.04], [16.8, [255, 222, 186], [255, 160, 80], 0.13], [18.2, [248, 186, 160], [255, 120, 80], 0.16],
    [18.9, [172, 150, 192], [190, 120, 170], 0.12], [19.8, [98, 106, 152], [70, 90, 150], 0.06], [24, [62, 78, 128], [40, 70, 120], 0.05],
  ];

  const SKYREF = [[0, [40, 60, 110], 0.15], [5.7, [150, 120, 190], 0.25], [6.3, [255, 140, 120], 0.20], [7.4, [255, 210, 170], 0.22], [10, [170, 210, 235], 0.25],
    [15, [190, 215, 230], 0.22], [16.8, [255, 150, 70], 0.16], [18.2, [255, 100, 80], 0.20], [18.9, [190, 120, 180], 0.30], [19.8, [80, 100, 160], 0.20], [24, [40, 60, 110], 0.15]];
  function skyRef(h = hourNow()) { let i = 0; while (i < SKYREF.length - 2 && SKYREF[i + 1][0] <= h) i++; const a = SKYREF[i], b = SKYREF[i + 1], t = (h - a[0]) / (b[0] - a[0]), o = overcast() * 0.7, c = a[1].map((v, k) => v + (b[1][k] - v) * t), l = (c[0] + c[1] + c[2]) / 3; return { c: c.map(v => Math.round(v + (l - v) * o)), a: a[2] + (b[2] - a[2]) * t }; }
  // Under heavy snow the sun is gone: the colour drains toward a cold, even grey and the warm glow fades.
  const overcast = () => { const W = weather(); return Math.min(1, W.snow * 0.8 + W.fog * 0.4); };
  function grade(h = hourNow()) {
    let i = 0; while (i < GRADE.length - 2 && GRADE[i + 1][0] <= h) i++;
    const a = GRADE[i], b = GRADE[i + 1], t = (h - a[0]) / (b[0] - a[0]), m = (x, y) => x + (y - x) * t;
    const mul = a[1].map((v, k) => m(v, b[1][k])), o = overcast() * 0.7, lum = (mul[0] + mul[1] + mul[2]) / 3 * 0.92, cool = [lum * 0.94, lum * 0.98, lum * 1.06].map(v => Math.min(255, v));
    return { mul: mul.map((v, k) => v + (cool[k] - v) * o), glow: a[2].map((v, k) => m(v, b[2][k])), gs: m(a[3], b[3]) * (1 - o) };
  }
  const lightLevel = () => { const G = grade(); return 1 - (G.mul[0] + G.mul[1] + G.mul[2]) / 765; };   // 0 at noon, ~0.7 at night
  // Weather: snow comes and goes in waves; the wind veers slowly and gusts.
  const weather = () => { const t = clock / 60 + 211;   // phase picked so the first day is clear from dawn to dusk, with a little snow late at night
    const n = fbm(t * 0.35, 3.1, 99); return { snow: Math.max(0, Math.min(1, (n - 0.6) * 3.5)), fog: Math.max(0, Math.min(0.6, (fbm(t * 0.25, 8.3, 7) - 0.58) * 3)) }; };
  const wind = { x: 10, y: 3 };
  function windStep() { const a = 0.25 + 0.6 * (fbm(clock * 0.004, 1.7, 3) - 0.5) * 2, gust = 1 + 0.25 * Math.max(0, Math.sin(now * 0.7) * Math.sin(now * 0.23)); const sp = (5 + 8 * weather().snow) * gust; wind.x = Math.cos(a) * sp; wind.y = Math.sin(a) * sp; }

  // Silhouettes for shadows, cached per image.
  const silCache = new Map();
  function sil(img) { if (silCache.has(img)) return silCache.get(img); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); silCache.set(img, c); return c; }
  // A shadow is the silhouette laid on the ground away from the sun (or the moon), longer when the light is low.
  let SH = { dx: 0, dy: 0.5, a: 0.3 };
  function shadowSetup() {
    const S = sunState(), h = hourNow();
    if (S.up) { const len = Math.min(3.2, 0.5 / Math.tan(Math.max(0.12, S.elev))); SH = { dx: -Math.sin(S.az) * len, dy: Math.cos(S.az) * len, a: 0.34 * Math.min(1, S.elev / 0.1) }; }
    else { const mAz = Math.PI / 2 + ((h + 12) % 24 - 6.15) / 12.5 * Math.PI; SH = { dx: -Math.sin(mAz) * 0.9, dy: Math.cos(mAz) * 0.9, a: 0.14 }; }   // moon shadows
  }
  function drawShadow(img, sx, sy, sw, sh, fx, fy, k = 1) {
    if (SH.a < 0.02) return;
    const DX = SH.dx * sh * k, DY = SH.dy * sh * k;
    g.save(); g.globalAlpha = SH.a; g.setTransform(1, 0, -DX / sh, -DY / sh, Math.round(fx), Math.round(fy));
    g.drawImage(sil(img), sx, sy, sw, sh, -sw * k / 2, -sh, sw * k, sh); g.restore();
  }

  // ------------------------------------------------------------------ life: birds, ice, seals, villagers, smoke, prints
  const R2 = mulberry(777);
  const gulls = Array.from({ length: 9 }, (_, i) => ({ cx: (20 + R2() * (MW - 40)) * T, cy: (20 + R2() * (MH - 40)) * T, R: 60 + R2() * 160, w: (R2() < 0.5 ? -1 : 1) * (0.15 + R2() * 0.25), ph: R2() * 6.28, alt: 20 + R2() * 40 }));
  // Auklet clouds swirl off the cliffs of both islands.
  const cliffs = []; for (let k = 0; k < map.length; k += 7) if (map[k] === K.CLIFF && cliffs.length < 400) cliffs.push(k);
  const swarms = Array.from({ length: 2 }, (_, i) => { const k = cliffs[Math.floor(R2() * cliffs.length)] || 0; return { x: (k % MW) * T, y: ((k / MW) | 0) * T, n: 26, seed: i * 31 }; });
  // Ice floes drift south through the strait and wrap round.
  const floes = Array.from({ length: 8 }, () => ({ x: (DATE_LINE - 14 + R2() * 28) * T, y: R2() * MH * T, r: 7 + R2() * 16, sp: 3 + R2() * 4, rot: R2() * 6, pts: Array.from({ length: 8 }, () => 0.7 + R2() * 0.35) }));
  // Seals surface here and there near the shores, look around, and dive.
  const shallows = []; for (let k = 0; k < map.length; k += 3) if (map[k] === K.SHALLOW) shallows.push(k);
  const seals = Array.from({ length: 0 }, (_, i) => { const k = shallows[Math.floor(R2() * shallows.length)] || 0; return { x: (k % MW) * T + 8, y: ((k / MW) | 0) * T + 8, ph: R2() * 20 }; });
  // Villagers walk between the houses, the racks and the pier, and stop to talk to nobody in particular.
  const homes = props.filter(p => p.kind === 'house' || p.kind === 'rack' || p.kind === 'school').map(p => [p.x, p.y + 14]);
  homes.push([(piers.little.x0 + 1) * T, piers.little.y * T + 8]);
  const villagers = [].map((sp, i) => { const h = homes[i % homes.length]; return { sp, x: h[0], y: h[1], to: 1 + i, wait: i * 2, dir: 0, step: 0, moving: false }; });
  // Footprints in snow and on the shingle; a wake behind the boat.
  const prints = [], wakes = [];
  let printT = 0;

  function lifeStep(dt) {
    windStep();
    for (const f of floes) { f.y += f.sp * dt; if (f.y > MH * T + 30) { f.y = -30; } f.rot += dt * 0.02;
      if (man.inBoat) { const d = Math.hypot(boat.x - f.x, boat.y - f.y); if (d < f.r + 12) { const nx = (boat.x - f.x) / d, ny = (boat.y - f.y) / d; boat.x = f.x + nx * (f.r + 12); boat.y = f.y + ny * (f.r + 12); boat.v *= 0.92; } } }
    for (const v of villagers) {
      if (v.wait > 0) { v.wait -= dt; v.moving = false; continue; }
      const [tx, ty] = homes[v.to % homes.length], dx = tx - v.x, dy = ty - v.y, d = Math.hypot(dx, dy);
      if (d < 3) { v.wait = 3 + hash2(v.to, 1, 2) * 6; v.to = (v.to + 1 + Math.floor(hash2(v.to, 3, 4) * 3)) % homes.length; continue; }
      const sp = 22 * dt, nx = v.x + dx / d * sp, ny = v.y + dy / d * sp;
      if (walkable(nx, ny)) { v.x = nx; v.y = ny; } else { v.to = (v.to + 1) % homes.length; }
      v.dir = dirOf(dx, dy); v.step += dt * 7; v.moving = true;
    }
    printT -= dt;
    if (printT <= 0) { printT = 0.32;
      const soft = (x, y) => { const t = at(Math.floor(x / T), Math.floor(y / T)); return t === K.SNOW || t === K.SHINGLE; };
      if (!man.inBoat && man.moving && soft(man.x, man.y)) prints.push({ x: man.x + (prints.length % 2 ? 2 : -2), y: man.y, t: now, k: 0 });
      if (!man.inBoat && dog.moving && soft(dog.x, dog.y)) prints.push({ x: dog.x, y: dog.y, t: now, k: 1 });
      if (man.inBoat && Math.abs(boat.v) > 6) wakes.push({ x: boat.x - Math.cos(boat.a) * 16, y: boat.y - Math.sin(boat.a) * 16, t: now });
      while (prints.length > 400) prints.shift(); while (wakes.length > 40) wakes.shift();
    }
  }

  // ------------------------------------------------------------------ the layers
  // A road of glitter on the water toward a low light: the sun at either end of the day, the moon at night.
  function lightRoad(ox, oy, az, col, a, n) {
    const dx = Math.sin(az), dy = -Math.cos(az), cx = VW / 2, cy = VH / 2;
    for (let i = 0; i < n; i++) { const t = hash2(i, 41, 1) * Math.max(VW, VH), w = 18 + t * 0.12, off = (hash2(i, 42, 1) - 0.5) * w, wob = Math.sin(now * 2.2 + i * 1.7) * 3;
      const sx = cx + dx * t - dy * (off + wob), sy = cy + dy * t + dx * (off + wob); if (sx < 0 || sy < 0 || sx >= VW || sy >= VH || !floats(sx + ox, sy + oy)) continue;
      const tw = Math.max(0, Math.sin(now * 4 + i * 2.3)); px(g, sx, sy, 2 + (i % 3 === 0 ? 1 : 0), 1, `rgba(${col},${a * tw * (1 - Math.abs(off) / (w * 0.6))})`); }
  }
  function drawWater(ox, oy) {
    const G = grade(), h = hourNow(), night = lightLevel(), golden = (h > 16 && h < 19.2) || (h > 5.6 && h < 7.6);
    // Soft swells: short light ripples anchored in the sea, each swelling and fading on its own time, drifting a little with the wind.
    { const CW = 44, CH = 26;
      for (let cy = Math.floor(oy / CH) - 1; cy * CH < oy + VH + CH; cy++) for (let cx = Math.floor(ox / CW) - 1; cx * CW < ox + VW + CW; cx++) {
        const life = 4 + hash2(cx, cy, 3) * 5, t = (now + hash2(cx, cy, 4) * life) / life, cyc = Math.floor(t), a = Math.sin((t - cyc) * Math.PI);
        const wx = cx * CW + hash2(cx + cyc * 131, cy, 5) * CW + wind.x * (t - cyc) * 2, wy = cy * CH + hash2(cx, cy + cyc * 71, 6) * CH + wind.y * (t - cyc);
        if (!floats(wx, wy)) continue; const X = wx - ox, Y = wy - oy, L = 3 + a * 7;
        px(g, X, Y, L, 1, `rgba(${golden ? '255,214,170' : '218,238,236'},${0.2 * a})`); px(g, X + 1, Y + 1, L - 2, 1, `rgba(10,30,50,${0.10 * a})`); } }
    // Surf breathing along the curved shoreline.
    for (let ty = Math.max(0, Math.floor(oy / T) - 1); ty < Math.min(MH, (oy + VH) / T + 1); ty++) for (const [x, y, nx, ny] of surf[ty]) {
      const X = x - ox; if (X < -4 || X > VW + 4) continue; const ph = Math.sin(now * 1.2 + hash2(x >> 3, y >> 3, 6) * 6.28 - (x + y) * 0.01), reach = 1 + (ph + 1) * 2.2;
      px(g, X + nx * reach, y - oy + ny * reach, 2, 1, `rgba(238,244,246,${0.25 + 0.4 * (ph + 1) / 2})`); }
    // Glints: warm in low sun, silver under the moon.
    const n = golden ? 160 : night > 0.45 ? 120 : 70, col = golden ? '255,200,140' : night > 0.45 ? '200,215,255' : '230,240,244';
    for (let i = 0; i < n; i++) { const gx = (hash2(i, 1, 4) * (VW + 40) + now * 6 * (0.5 + hash2(i, 2, 4))) % (VW + 40) - 20, gy = hash2(i, 3, 4) * VH;
      if (floats(gx + ox, gy + oy) && Math.sin(now * 2.2 + i * 1.7) > 0.55) px(g, gx, gy, golden ? 3 : 2, 1, `rgba(${col},0.7)`); }
    // Ice floes.
    for (const f of floes) { const X = f.x - ox, Y = f.y - oy; if (!floats(f.x, f.y) || !floats(f.x + f.r, f.y) || !floats(f.x - f.r, f.y)) continue; if (X < -40 || Y < -40 || X > VW + 40 || Y > VH + 40) continue;
      const poly = (dx, dy, k, col) => { g.beginPath(); f.pts.forEach((r, i) => { const a = f.rot + i / f.pts.length * 6.283; const x = X + dx + Math.cos(a) * f.r * r * k, y = Y + dy + Math.sin(a) * f.r * r * 0.8 * k; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fillStyle = col; g.fill(); };
      poly(1, 3, 1, 'rgba(20,40,60,0.35)'); poly(0, 0, 1, '#cfe0e8'); poly(-1, -1, 0.82, '#eef5f7'); }
    // Seals: a head breaks the surface, ripples, looks around, dives.
    for (const s of seals) { const c = (now + s.ph) % 16; if (c > 6) continue; const X = s.x - ox, Y = s.y - oy; if (X < -10 || Y < -10 || X > VW + 10 || Y > VH + 10) continue;
      const up = Math.min(1, c / 0.6, (6 - c) / 0.6); g.strokeStyle = `rgba(220,232,236,${0.4 * up})`; g.beginPath(); g.ellipse(X, Y + 2, 5 + c, 2 + c * 0.4, 0, 0, 6.283); g.stroke();
      px(g, X - 2, Y - 2 * up, 5, 4 * up, '#3b3f44'); px(g, X - 1, Y - 2 * up, 3, 1, '#565b60'); if (up > 0.8) px(g, X + 1, Y - 1, 1, 1, '#111'); }
    // Wakes behind the boat.
    for (const w2 of wakes) { const age = now - w2.t; if (age > 2) continue; g.strokeStyle = `rgba(230,238,240,${0.4 * (1 - age / 2)})`; g.beginPath(); g.ellipse(w2.x - ox, w2.y - oy, 3 + age * 8, 1.5 + age * 3, boat.a, 0, 6.283); g.stroke(); }
  }
  function drawGround(ox, oy) {
    // Tufts of tundra grass lean and shiver with the wind.
    { const wl = Math.hypot(wind.x, wind.y) || 1, tx0 = Math.floor(ox / T), ty0 = Math.floor(oy / T);
      for (let ty = ty0; ty <= ty0 + Math.ceil(VH / T) + 1; ty++) for (let tx = tx0; tx <= tx0 + Math.ceil(VW / T) + 1; tx++) {
        if (at(tx, ty) !== K.TUNDRA) continue;
        for (let j = 0; j < 3; j++) { if (hash2(tx, ty, 50 + j) > 0.45) continue;
          const X = tx * T + hash2(tx, ty, 60 + j) * T, Y = ty * T + hash2(tx, ty, 70 + j) * T; if (!walkable(X, Y)) continue;
          const sway = (Math.sin(now * 2.4 + X * 0.07 + Y * 0.03) * 0.5 + 0.7) * Math.min(1.6, wl / 10), x = Math.round(X - ox), y = Math.round(Y - oy);
          const lx = Math.round(wind.x / wl * 2 * sway), ly = Math.round(wind.y / wl * sway);
          const c = hash2(tx, ty, 80 + j) < 0.5 ? '#9aa36a' : '#b9b47c';
          px(g, x, y, 1, 1, '#5f6a44'); px(g, x + Math.round(lx * 0.5), y - 1, 1, 1, c); px(g, x + lx, y - 2 + ly, 1, 1, c);
          px(g, x + 2, y, 1, 1, '#5f6a44'); px(g, x + 2 + lx, y - 2 + ly, 1, 1, '#d6cf98'); }
      } }
    // Footprints fade over a minute.
    for (const p of prints) { const age = now - p.t; if (age > 60) continue; const a = 0.28 * (1 - age / 60), X = p.x - ox, Y = p.y - oy; if (p.k) { px(g, X - 3, Y - 1, 1, 1, `rgba(70,80,96,${a})`); px(g, X + 2, Y, 1, 1, `rgba(70,80,96,${a})`); } else px(g, X - 1, Y - 1, 2, 2, `rgba(70,80,96,${a})`); }
    // Spindrift: wind-blown snow streaking across the land.
    const W = weather(), n = W.snow * 60, wl = Math.hypot(wind.x, wind.y) || 1;
    for (let i = 0; i < n; i++) { const span = VW + 80; const x0 = (hash2(i, 9, 1) * span + now * wind.x * (1.6 + hash2(i, 8, 1))) % span - 40, y0 = (hash2(i, 7, 1) * (VH + 40) + now * wind.y * 1.6) % (VH + 40) - 20;
      if (!walkable(x0 + ox, y0 + oy)) continue; const L2 = 6 + hash2(i, 6, 1) * 12; g.strokeStyle = 'rgba(244,248,250,0.32)'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 - wind.x / wl * L2, y0 - wind.y / wl * L2); g.stroke(); }
  }
  function drawSky(ox, oy) {   // things above the ground: smoke, birds (with their shadows), cloud shadows
    for (const p of props) if (p.kind === 'house' || p.kind === 'school') {   // chimney smoke bends with the wind
      const sn = propSprite(p), im = sn && SPR[sn]; const cx = p.x - ox + (im ? -im.width * 0.22 : 0), cy = p.y + 8 - oy - (im ? im.height * 0.86 : 20);
      if (cx < -60 || cx > VW + 60 || cy < -80 || cy > VH + 60) continue;
      for (let k = 0; k < 7; k++) { const age = (now * 0.35 + k / 7 + hash2(p.x, p.y, 3)) % 1; const X = cx + wind.x * age * 5 + Math.sin(now + k) * 2, Y = cy - age * 26 + wind.y * age * 3, r = 2 + age * 6;
        g.fillStyle = `rgba(214,216,220,${0.4 * (1 - age)})`; g.beginPath(); g.arc(X, Y, r, 0, 6.283); g.fill(); }
    }
    for (const b of gulls) {   // gulls glide in wide loops; their shadows slide on the ground
      const a = b.ph + now * b.w, X = b.cx + Math.cos(a) * b.R - ox + wind.x * 0.5, Y = b.cy + Math.sin(a) * b.R * 0.7 - oy;
      if (X < -40 || Y < -40 || X > VW + 40 || Y > VH + 60) continue;
      const flap = Math.sin(now * 7 + b.ph * 9) > 0.2 ? -2 : 0;
      px(g, X + b.alt * 0.4, Y + b.alt, 5, 1, 'rgba(0,0,0,0.12)');
      g.strokeStyle = '#f1efea'; g.lineWidth = 1; g.beginPath(); g.moveTo(X - 4, Y + flap); g.lineTo(X, Y); g.lineTo(X + 4, Y + flap); g.stroke(); px(g, X - 4, Y + flap, 1, 1, '#4a4c50'); px(g, X + 3, Y + flap, 1, 1, '#4a4c50');
    }
    for (const sw of swarms) { const X0 = sw.x - ox, Y0 = sw.y - oy; if (X0 < -80 || Y0 < -80 || X0 > VW + 80 || Y0 > VH + 80) continue;   // auklet clouds
      for (let j = 0; j < sw.n; j++) { const hh = hash2(j, sw.seed, 5), a = now * (0.9 + hh) + hh * 40, r = 14 + 30 * hash2(j, sw.seed, 6) + 8 * Math.sin(now * 1.4 + j);
        px(g, X0 + Math.cos(a) * r, Y0 + Math.sin(a * 1.3) * r * 0.6 - 10, 2, 1, (j + Math.floor(now * 8)) % 3 ? '#26282c' : '#3a3d42'); } }
    // Cloud shadows drift across land and sea in daylight.
    const S = sunState(); if (S.up) for (let i = 0; i < 7; i++) {
      const span = MW * T + 600, X = ((hash2(i, 1, 9) * span + clock * 9) % span) - 300 - ox, Y = ((hash2(i, 2, 9) * MH * T + clock * 2.5) % (MH * T)) - oy;
      if (X < -260 || X > VW + 260 || Y < -200 || Y > VH + 200) continue;
      g.fillStyle = 'rgba(20,32,48,0.11)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(X + Math.cos(k * 1.7 + i) * 60, Y + Math.sin(k * 2.3 + i) * 30, 50 + hash2(i, k, 3) * 40, 0, 6.283); g.fill(); }
    }
    // Cotton-grass seeds and pollen floating on the air, catching the light; at dusk they glow like embers.
    if (S.up && weather().snow < 0.2) { const h = hourNow(), warm = h > 16 || h < 8;
      for (let i = 0; i < 46; i++) { const span = VW + 40, t = now * (0.5 + hash2(i, 2, 13) * 0.6);
        const x = ((hash2(i, 1, 13) * span + t * (wind.x * 1.4 + 4) - ox * 0.3) % span + span) % span - 20, y = ((hash2(i, 3, 13) * (VH + 40) + t * wind.y + Math.sin(t * 0.9 + i) * 10 - oy * 0.3) % (VH + 40) + VH + 40) % (VH + 40) - 20;
        const tw = 0.5 + 0.5 * Math.sin(now * 2 + i * 1.3); px(g, x, y, 1, 1, warm ? `rgba(255,226,160,${0.5 + 0.4 * tw})` : `rgba(255,255,248,${0.45 + 0.35 * tw})`); } }
  }
  // Colour of the hour, then lights, stars, aurora, snow and fog on top.
  function drawLight(ox, oy) {
    const G = grade(), night = lightLevel(), h = hourNow();
    g.save();
    // Land and sea take the light differently: warm light gilds the land but the sea keeps a deep violet-blue under it.
    if (reflTmp.width !== VW || reflTmp.height !== VH) { reflTmp.width = VW; reflTmp.height = VH; } const rc = reflTmp.getContext('2d');
    { const m = G.mul, warm = Math.max(0, Math.min(1, (m[0] - m[2]) / 60)), wm = [m[0] * 0.5, m[1] * 0.62, Math.min(255, m[0] * 0.86)].map((v, k) => Math.round(m[k] + (v - m[k]) * warm));
      rc.globalCompositeOperation = 'copy'; rc.drawImage(waterMask, ox, oy, VW, VH, 0, 0, VW, VH); rc.globalCompositeOperation = 'source-in'; rc.fillStyle = `rgb(${wm.join(',')})`; rc.fillRect(0, 0, VW, VH);
      rc.globalCompositeOperation = 'destination-over'; rc.fillStyle = `rgb(${m.map(Math.round).join(',')})`; rc.fillRect(0, 0, VW, VH);
      g.globalCompositeOperation = 'multiply'; g.drawImage(reflTmp, 0, 0); }
    // The sea mirrors the sky: peach at dawn, molten orange at golden hour, violet at dusk.
    { const R = skyRef();
      rc.globalCompositeOperation = 'copy'; rc.drawImage(waterMask, ox, oy, VW, VH, 0, 0, VW, VH); rc.globalCompositeOperation = 'source-in'; rc.fillStyle = `rgb(${R.c.join(',')})`; rc.fillRect(0, 0, VW, VH);
      g.globalCompositeOperation = 'screen'; g.globalAlpha = R.a; g.drawImage(reflTmp, 0, 0); g.globalAlpha = 1; }
    if (G.gs > 0) { g.globalCompositeOperation = 'screen'; g.fillStyle = `rgba(${G.glow.map(Math.round).join(',')},${G.gs})`; g.fillRect(0, 0, VW, VH); }
    g.globalCompositeOperation = 'lighter';
    // The northern lights: green and teal curtains rippling across the snow and the sea on clear nights.
    const aur = Math.max(0, night - 0.35) * 2 * (0.4 + 0.6 * fbm(clock * 0.01, 4.2, 5)) * (1 - weather().snow * 0.8);
    if (aur > 0.02) for (let band = 0; band < 3; band++) for (let x = 0; x < VW; x += 3) {
      const wx = x + ox, base = VH * (0.2 + band * 0.25) + Math.sin(wx * 0.006 + now * 0.12 + band * 2) * 50 + Math.sin(wx * 0.021 - now * 0.35 + band) * 14;
      const hgt = 40 + 30 * Math.sin(wx * 0.013 + now * 0.5 + band), shimmer = 0.5 + 0.5 * Math.sin(wx * 0.05 + now * 1.6 + band * 3);
      const gr = g.createLinearGradient(0, base - hgt, 0, base + 10); gr.addColorStop(0, 'rgba(60,255,170,0)'); gr.addColorStop(0.7, `rgba(70,255,160,${0.10 * aur * shimmer})`); gr.addColorStop(1, `rgba(120,140,255,${0.05 * aur})`);
      g.fillStyle = gr; g.fillRect(x, base - hgt, 3, hgt + 10);
    }
    if (night > 0.3) {
      const k = Math.min(1, (night - 0.3) * 2.5);
      // Stars mirrored in still water.
      for (let i = 0; i < 140; i++) { const sx = hash2(i, 11, 1) * VW, sy = hash2(i, 12, 1) * VH; if (!floats(sx + ox, sy + oy)) continue; const tw = 0.5 + 0.5 * Math.sin(now * 3 + i); px(g, sx, sy, 1, 1, `rgba(200,215,255,${0.5 * k * tw})`); }
      // The moon lays a trembling silver road across the sea, pointing to where it hangs.
      lightRoad(ox, oy, Math.PI / 2 + ((h + 12) % 24 - 6.15) / 12.5 * Math.PI, '220,230,255', 0.55 * k, 520);
      const glow = (x, y, r, col, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
      // Warm windows and lamps; the light spills on the snow in front.
      for (const p of props) {
        const X = p.x - ox, Y = p.y + 8 - oy; if (X < -80 || X > VW + 80 || Y < -80 || Y > VH + 120) continue;
        if (p.kind === 'house' || p.kind === 'school') { const im = SPR[propSprite(p)], hh = im ? im.height : 30; const fl = 0.9 + 0.1 * Math.sin(now * 5 + p.x);
          glow(X, Y - hh * 0.4, 34, '255,186,104', 0.48 * k * fl); glow(X, Y + 10, 48, '255,166,86', 0.30 * k * fl); glow(X, Y - hh * 0.4, 8, '255,236,190', 0.7 * k * fl); }
        if (p.kind === 'lamp') { glow(X + 1, Y - 18, 56, '255,200,120', 0.40 * k); glow(X + 1, Y - 18, 6, '255,245,210', 0.9 * k); }
        if (p.kind === 'station') glow(X, Y - 30, 30, '170,210,255', 0.10 * k);
        if (p.kind === 'mast') { const blink = Math.sin(now * 3) > 0.6; if (blink) glow(X, Y - 112, 12, '255,60,40', 0.8 * k); }
      }
      // His lantern.
      const lx = (man.inBoat ? boat.x : man.x) - ox + 6, ly = (man.inBoat ? boat.y : man.y) - oy - 12, fl = 0.92 + 0.08 * Math.sin(now * 9) * Math.sin(now * 3.7);
      glow(lx, ly, 60, '255,190,120', 0.36 * k * fl); glow(lx, ly, 10, '255,230,180', 0.6 * k * fl);
    }
    // Low sun: a warm wash rising from the side the sun is on, and a molten road on the sea toward it.
    const S = sunState(); const clear = 1 - overcast(); if (S.up && S.elev < 0.3 && clear > 0.1) lightRoad(ox, oy, S.az, '255,196,110', 0.9 * clear * (1 - S.elev / 0.3), 900); if (S.up && S.elev < 0.2) { const sx = VW / 2 + Math.sin(S.az) * VW * 0.7, sy = VH / 2 - Math.cos(S.az) * VH * 0.7, gr = g.createRadialGradient(sx, sy, 0, sx, sy, VW * 0.9); gr.addColorStop(0, `rgba(255,150,80,${0.07 * (1 - S.elev / 0.2)})`); gr.addColorStop(1, 'rgba(255,150,80,0)'); g.fillStyle = gr; g.fillRect(0, 0, VW, VH); }
    g.restore();
    // Snow falling in three depths, carried by the wind.
    const W = weather(), flakes = Math.round(W.snow * 420);
    for (let i = 0; i < flakes; i++) { const layer = i % 3, sp = 0.5 + layer * 0.45, span = VW + 20;
      const x = ((hash2(i, 21, 1) * span + now * wind.x * sp * 1.6 + Math.sin(now * 0.8 + i) * 6 - ox * 0.15 * sp) % span + span) % span - 10, y = ((hash2(i, 22, 1) * (VH + 20) + now * (14 + wind.y) * sp - oy * 0.15 * sp) % (VH + 20) + VH + 20) % (VH + 20) - 10;
      px(g, x, y, layer === 2 ? 2 : 1, layer === 2 ? 2 : 1, `rgba(${night > 0.4 ? '200,210,230' : '250,252,255'},${0.45 + layer * 0.2})`); }
    // Fog banks rolling through the strait.
    if (W.fog > 0.02) for (let i = 0; i < 6; i++) { const span = MW * T, X = ((hash2(i, 31, 1) * span + now * wind.x * 1.5) % span) - ox, Y = hash2(i, 32, 1) * MH * T - oy;
      if (X < -300 || X > VW + 300 || Y < -200 || Y > VH + 200) continue; const gr = g.createRadialGradient(X, Y, 0, X, Y, 220); const c = night > 0.4 ? '150,165,200' : '235,238,240'; gr.addColorStop(0, `rgba(${c},${0.16 * W.fog})`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(X - 220, Y - 220, 440, 440); }
    // A soft vignette keeps the eye on the man.
    const vg = g.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.35, VW / 2, VH / 2, Math.max(VW, VH) * 0.75); vg.addColorStop(0, 'rgba(10,14,22,0)'); vg.addColorStop(1, `rgba(10,14,22,${0.28 + night * 0.25})`); g.fillStyle = vg; g.fillRect(0, 0, VW, VH);
  }

  // ------------------------------------------------------------------ update
  let now = 0, last = performance.now(), showMap = false, idle = 0;
  function update(dt) {
    now += dt; clock += dt * (keys.has('t') ? 60 : 1); if (msgT > 0) msgT -= dt;
    lifeStep(dt);
    const [ax, ay] = axis();
    if (man.inBoat) {
      // Row: up/down pull forward and back, left/right turn. The boat glides and slows in the water.
      const pull = -ay, turn = ax;
      boat.a += turn * 2.2 * dt;
      boat.v += pull * 90 * dt; boat.v *= Math.exp(-dt * 0.7); boat.v = Math.max(-40, Math.min(110, boat.v));
      if (pull || turn) boat.stroke += dt * 6;
      const nx = boat.x + Math.cos(boat.a) * boat.v * dt, ny = boat.y + Math.sin(boat.a) * boat.v * dt;
      const bow = [nx + Math.cos(boat.a) * 11 * Math.sign(boat.v || 1), ny + Math.sin(boat.a) * 11 * Math.sign(boat.v || 1)];
      const ok = (x, y) => floats(x, y) && floats(x + Math.cos(boat.a) * 11 * Math.sign(boat.v || 1), y + Math.sin(boat.a) * 11 * Math.sign(boat.v || 1));
      if (ok(nx, ny)) { boat.x = nx; boat.y = ny; }
      else if (ok(nx, boat.y)) { boat.x = nx; boat.v *= 0.97; } else if (ok(boat.x, ny)) { boat.y = ny; boat.v *= 0.97; }   // glance along the shore
      else { boat.v *= 0.3; say('The shore. Row along it to the pier.'); }
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
      // The whippet keeps its own company: it trots off to sniff at things, stands about, and only runs back to him
      // when he gets far away. Now and then, when he stops for a while, it does happy laps around him.
      const far = Math.hypot(man.x - dog.x, man.y - dog.y);
      dog.t -= dt;
      if (far > 190 && dog.mode !== 'follow') { dog.mode = 'follow'; dog.t = 0; }
      if (idle > 4 && dog.mode !== 'zoom' && !dog.zoomed && far < 90 && Math.random() < dt * 0.15) { dog.mode = 'zoom'; dog.t = 5; dog.zoomed = true; dog.ang = Math.atan2(dog.y - man.y, dog.x - man.x); }
      if (man.moving) dog.zoomed = false;
      if (dog.mode === 'zoom' && (man.moving || dog.t <= 0)) { dog.mode = 'rest'; dog.t = 2; }
      if (dog.mode === 'follow' && far < 40 && dog.t <= 0) { const r = Math.random(); dog.mode = r < 0.6 ? 'roam' : r < 0.85 ? 'rest' : 'follow'; dog.t = dog.mode === 'follow' ? 4 : 4 + Math.random() * 5; dog.target = null; }
      if (dog.mode === 'rest' && dog.t <= 0) { dog.mode = Math.random() < 0.65 ? 'roam' : 'follow'; dog.t = 3; dog.target = null; }
      if (dog.mode === 'roam' && !dog.target) { for (let k = 0; k < 12; k++) { const a = Math.random() * 6.283, r = 40 + Math.random() * 75, x = man.x + Math.cos(a) * r, y = man.y + Math.sin(a) * r; if (walkable(x, y)) { dog.target = [x, y]; break; } } if (!dog.target) dog.mode = 'follow'; dog.sniff = 0; }
      let tx = dog.x, ty = dog.y, speed = 0;
      if (dog.mode === 'zoom') { dog.ang += dt * 3.2; const R = 26 + Math.sin(dog.t * 2) * 6; tx = man.x + Math.cos(dog.ang) * R; ty = man.y + Math.sin(dog.ang) * R * 0.7; speed = 120; }
      else if (dog.mode === 'follow') { tx = man.x - Math.cos(dirAngle(man.dir)) * 16 + 10; ty = man.y - Math.sin(dirAngle(man.dir)) * 16 + 4; speed = far > 120 ? 150 : 90; }
      else if (dog.mode === 'roam') { [tx, ty] = dog.target;
        if (Math.hypot(tx - dog.x, ty - dog.y) < 6) { dog.sniff += dt; if (dog.sniff > 2 + (dog.target[0] % 3)) { dog.target = null; if (Math.random() < 0.3) { dog.mode = 'rest'; dog.t = 3 + Math.random() * 5; } } }
        speed = 55; }
      const dx = tx - dog.x, dy = ty - dog.y, d = Math.hypot(dx, dy);
      dog.moving = speed > 0 && d > (dog.mode === 'zoom' ? 2 : dog.mode === 'roam' ? 5 : 10);
      if (dog.moving) { const v = Math.min(speed, d * 4) * dt, nx = dog.x + dx / d * v, ny = dog.y + dy / d * v;
        if (walkable(nx, ny)) { dog.x = nx; dog.y = ny; } else if (dog.mode === "roam") dog.target = null; else if (d > 60) { dog.x = man.x + 8; dog.y = man.y + 4; }
        dog.dir = dirOf(dx, dy); if (Math.abs(dx) > 2) dog.face = dx < 0 ? 'left' : 'right'; dog.step += dt * (dog.mode === 'zoom' ? 18 : speed > 100 ? 16 : speed < 60 ? 8 : 12); }
    }
  }
  const dirOf = (x, y) => Math.abs(x) > Math.abs(y) ? (x > 0 ? 1 : 3) : (y > 0 ? 0 : 2);   // 0 down, 1 right, 2 up, 3 left
  const dirAngle = d => [Math.PI / 2, 0, -Math.PI / 2, Math.PI][d];

  // ------------------------------------------------------------------ draw
  let VW = 320, VH = 180, SCALE = 3;
  function resize() { SCALE = Math.max(2, Math.round(Math.min(innerWidth / 520, innerHeight / 300))); VW = Math.ceil(innerWidth / SCALE); VH = Math.ceil(innerHeight / SCALE); canvas.width = VW; canvas.height = VH; g.imageSmoothingEnabled = false; }
  addEventListener('resize', resize); resize();
  const cam = { x: man.x, y: man.y };
  function draw() {
    const fx = man.inBoat ? boat.x : man.x, fy = man.inBoat ? boat.y : man.y;
    cam.x += (fx - cam.x) * 0.12; cam.y += (fy - cam.y) * 0.12;
    const ox = Math.round(Math.max(0, Math.min(MW * T - VW, cam.x - VW / 2))), oy = Math.round(Math.max(0, Math.min(MH * T - VH, cam.y - VH / 2)));
    g.drawImage(world, ox, oy, VW, VH, 0, 0, VW, VH);
    drawWater(ox, oy); drawGround(ox, oy);
    // Shadows first, all laid the same way by the sun (or the moon).
    shadowSetup();
    for (const p of props) { const sn = propSprite(p); if (!sn || p.rot) continue; const im = SPR[sn], X = p.x - ox, Y = p.y + 8 - oy; if (X < -200 || X > VW + 200 || Y < -60 || Y > VH + 300) continue; drawShadow(im, 0, 0, im.width, im.height, X, Y, p.kind === 'mast' ? 2 : 1); }
    if (!man.inBoat) { const F = sheetFrame('man', man.dir, man.step, man.moving); if (F) drawShadow(SPR.man, F[0], 0, F[2], 44, man.x - ox, man.y - oy); const D = DOG[dog.moving ? 'run' + (Math.floor(dog.step * 0.9) % 4) : 'stand'][dog.face === 'left' ? 'left' : 'right']; drawShadow(D, 0, 0, D.width, 20, dog.x - ox, dog.y - oy); }
    for (const v of villagers) { const F = sheetFrame(v.sp, v.dir, v.step, v.moving); if (F) drawShadow(SPR[v.sp], F[0], 0, F[2], 44, v.x - ox, v.y - oy); }
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
    for (const v of villagers) items.push({ y: v.y, d: () => drawSheet(v.sp, v.x - ox, v.y - oy, v.dir, v.step, v.moving) });
    items.sort((a, b) => a.y - b.y).forEach(i => i.d());
    drawSky(ox, oy); drawLight(ox, oy);
    // Message line, bottom centre of the picture.
    if (!man.inBoat && Math.hypot(man.x - boat.x, man.y - boat.y) < 56) { const X = boat.x - ox, Y = boat.y - oy - 26; g.font = '8px monospace'; px(g, X - 24, Y - 8, 48, 11, 'rgba(16,22,28,0.85)'); g.fillStyle = '#efe9dc'; g.fillText('E: board', X - 18, Y); }
    if (man.inBoat && Math.hypot(boat.v) < 8) { let near = false; for (let a = 0; a < 6.28 && !near; a += 0.5) for (let r = 12; r <= 48 && !near; r += 6) near = walkable(boat.x + Math.cos(a) * r, boat.y + Math.sin(a) * r); if (near) { const X = boat.x - ox, Y = boat.y - oy - 30; g.font = '8px monospace'; px(g, X - 32, Y - 8, 64, 11, 'rgba(16,22,28,0.85)'); g.fillStyle = '#efe9dc'; g.fillText('E: step ashore', X - 28, Y); } }
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
    const where = near ? 'International Date Line' : k === K.DOCK ? `${tx < DATE_LINE ? 'Big' : 'Little'} Diomede · the pier` : own >= 0 ? `${ISLANDS[own].name} · ${ISLANDS[own].nick}` : `Bering Strait · ${side === 'big' ? 'Russian side' : 'American side'}`;
    const key = where + side + Math.floor(clock) + (keys.has('t') ? 't' : '');
    if (key === lastHud) return; lastHud = key;
    hudEl.where.textContent = where; hudEl.where.classList.toggle('line', near);
    const hh = hourNow(), part = hh < 5.6 || hh >= 20 ? 'night' : hh < 7.4 ? 'dawn' : hh < 16.6 ? 'day' : hh < 18.9 ? 'golden hour' : 'dusk';
    hudEl.little.textContent = `Little Diomede · ${fmt(clock)} · ${part}`; hudEl.big.textContent = `Big Diomede · ${fmt(clock + 21 * 60)}`;
    hudEl.little.className = side === 'little' ? 'here' : 'there'; hudEl.big.className = side === 'big' ? 'here' : 'there';
  }

  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    update(dt); draw();
    window.__frames = (window.__frames || 0) + 1;
    requestAnimationFrame(frame);
  }
  say('Little Diomede, before dawn. The boat waits at the end of the pier.');
  await loadArt(); await new Promise(r => setTimeout(r, 30)); paintWorld(); warpWorld();
  window.__ready = true; document.getElementById("load")?.remove();
  window.__game = { man, dog, boat, toggleBoat, keys, setHour: h => { clock = 2 * 1440 + h * 60; }, weather, grade, skyRef };   // for the self-check
  requestAnimationFrame(frame);
})();
