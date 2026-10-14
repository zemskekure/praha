// Vínko: one long night in Lokál Korunní. Top-down pixel art on a canvas: the pub is painted once (floor, walls,
// furniture), the people are RetroDiffusion walk sheets, and the light is laid over everything each frame.
(async () => {
  const $ = id => document.getElementById(id);
  const canvas = $('c'), g = canvas.getContext('2d');
  let VW = 420, VH = 240, SCALE = 3;
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
  // crisp 1 px lines and circles, for the chalk drawings
  function pline(c, pts, col) { c.fillStyle = col; for (let i = 0; i < pts.length - 1; i++) { let [x0, y0] = pts[i].map(Math.round), [x1, y1] = pts[i + 1].map(Math.round); const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy; for (;;) { c.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } } } }
  function pcirc(c, cx, cy, r, col, from = 0, to = 6.283) { const pts = []; for (let a = from; a <= to + 0.01; a += 0.35 / Math.max(1, r / 3)) pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); pline(c, pts, col); }

  // ------------------------------------------------------------------ the room
  // Floor coordinates: x 0..W, y 0..H. The back wall stands above y = 0, WALL px tall; side walls are dark edges.
  const W = 600, H = 250, WALL = 70;
  const solids = [];                       // rectangles nobody walks through
  const block = (x0, y0, x1, y1) => solids.push([x0, y0, x1, y1]);
  block(-40, -WALL - 40, W + 40, 6);       // the back wall (feet stop a little in front of it)
  block(-40, H - 4, W + 40, H + 60); block(-40, -40, 4, H + 40); block(W - 4, -40, W + 40, H + 40);
  const DOORS = { wc: { x: 96, y: 8, w: 22 }, street: { x: W - 6, y: 196, h: 34 } };

  // The floor: honey oak in a herringbone, each plank its own shade, a dark groove between.
  const [floorC, fx] = mk(W, H);
  { const im = fx.createImageData(W, H), d = im.data, OAK = ['#9b6a3e', '#a47144', '#ad784a', '#b6804f', '#a06d40', '#946339'].map(hex);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const C = 8, col = Math.floor(x / C), lx = x - col * C, dir = col % 2 ? 1 : -1, v = y + (dir > 0 ? lx : C - 1 - lx) * 0.5, plank = Math.floor(v / 3), lv = v - plank * 3;
      const h = hash2(col, plank, 3), c = OAK[Math.floor(h * OAK.length)], groove = lv < 0.55 || lx === 0, grain = (hash2(x >> 2, y, 4) - 0.5) * 6 + Math.sin((x + y * 3) * 0.9 + h * 20) * 2;
      const k = groove ? 0.82 : 1, i = (y * W + x) * 4; d[i] = clamp(c[0] * k + grain, 0, 255); d[i + 1] = clamp(c[1] * k + grain * 0.8, 0, 255); d[i + 2] = clamp(c[2] * k + grain * 0.5, 0, 255); d[i + 3] = 255; }
    fx.putImageData(im, 0, 0);
    // a soft polish where people walk and where the light falls
    const gr = fx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(255,230,190,0.10)'); gr.addColorStop(0.5, 'rgba(255,230,190,0)'); gr.addColorStop(1, 'rgba(40,20,10,0.14)'); fx.fillStyle = gr; fx.fillRect(0, 0, W, H); }

  // The back wall: cream wallpaper with a red pattern over dark panelling covered in white chalk drawings; the bar's
  // shelves and TV at the left, the toilet door, a clock, air vents, and tall windows to Korunní street at the right.
  const WINDOWS = [384, 452, 520].map(x => ({ x, w: 44 }));
  const [wallC, wx] = mk(W, WALL);
  { px(wx, 0, 0, W, WALL, '#efe2cf');
    for (let y = 4; y < WALL - 30; y += 12) for (let x = (y / 12 % 2) * 7; x < W; x += 14) {   // the red damask stamp
      const c = '#c27466'; px(wx, x + 3, y, 2, 1, c); px(wx, x + 2, y + 1, 4, 1, c); px(wx, x + 1, y + 2, 2, 2, c); px(wx, x + 5, y + 2, 2, 2, c); px(wx, x + 3, y + 3, 2, 3, c); px(wx, x + 2, y + 6, 1, 1, '#d79a8c'); px(wx, x + 5, y + 6, 1, 1, '#d79a8c'); }
    px(wx, 0, 0, W, 3, '#f7efe2'); px(wx, 0, 3, W, 1, '#d8c8b0');                                  // cornice
    const PY = WALL - 30; px(wx, 0, PY, W, 30, '#5b3a24'); px(wx, 0, PY, W, 2, '#7a5034'); px(wx, 0, PY + 2, W, 1, '#3e2716');   // panelling
    for (let x = 0; x < W; x += 30) px(wx, x, PY + 3, 1, 27, '#4a2e1b');
    px(wx, 0, WALL - 2, W, 2, '#3a2415');                                                           // skirting
    // the chalk mural: cheerful line drawings of the pub's life
    const ch = '#f4efe6';
    const face = (x, y, r) => { pcirc(wx, x, y, r, ch); px(wx, x - 2, y - 1, 1, 1, ch); px(wx, x + 2, y - 1, 1, 1, ch); pcirc(wx, x, y + 1, r * 0.5, ch, 0.4, 2.7); };
    const mug = (x, y) => { pline(wx, [[x, y], [x, y + 9], [x + 7, y + 9], [x + 7, y]], ch); pcirc(wx, x + 9, y + 4, 3, ch, -1.4, 1.4); pline(wx, [[x - 1, y - 1], [x + 2, y - 3], [x + 5, y - 2], [x + 8, y - 3]], ch); };
    const hat = (x, y) => { pline(wx, [[x, y], [x, y - 4], [x + 2, y - 7], [x + 5, y - 6], [x + 8, y - 8], [x + 10, y - 5], [x + 10, y]], ch); pline(wx, [[x, y], [x + 10, y]], ch); };
    for (let i = 0; i < 9; i++) { const x = 140 + i * 23 + (hash2(i, 1, 9) - 0.5) * 6, y = PY + 9 + hash2(i, 2, 9) * 10;
      if (i % 3 === 0) { face(x, y + 4, 5); hat(x - 5, y - 1); } else if (i % 3 === 1) mug(x - 3, y); else { face(x, y + 5, 4); pline(wx, [[x - 6, y + 13], [x - 2, y + 10], [x + 3, y + 10], [x + 7, y + 13]], ch); } }
    pline(wx, [[132, PY + 25], [150, PY + 22], [175, PY + 26], [205, PY + 23], [240, PY + 26], [290, PY + 22], [335, PY + 25]], ch);
    // the bar's back: shelves with bottles, the tap beer sign, the TV above
    px(wx, 2, 14, 66, PY - 14, '#3a2617'); for (const sy of [24, 33]) { px(wx, 4, sy, 62, 2, '#6b4a30');
      for (let bx = 6; bx < 64; bx += 4) { const c = ['#2f5a33', '#7a2a24', '#c9a43c', '#e7e2d6', '#3b4f6e'][Math.floor(hash2(bx, sy, 2) * 5)]; px(wx, bx, sy - 6, 3, 6, c); px(wx, bx + 1, sy - 8, 1, 2, c); px(wx, bx, sy - 5, 1, 3, 'rgba(255,255,255,0.35)'); } }
    px(wx, 18, 3, 34, 10, '#111'); px(wx, 19, 4, 32, 8, '#20323d');                               // the TV (picture drawn live)
    // the toilet door
    const D = DOORS.wc; px(wx, D.x - 2, 16, D.w + 4, WALL - 16, '#2c1b10'); px(wx, D.x, 18, D.w, WALL - 18, '#6e4429'); px(wx, D.x + 2, 20, D.w - 4, 18, '#7d4f31'); px(wx, D.x + 2, 41, D.w - 4, 24, '#7d4f31'); px(wx, D.x + D.w - 5, 42, 2, 2, '#d9b25a');
    px(wx, D.x + 5, 8, 12, 6, '#1d1d1d'); px(wx, D.x + 6, 9, 10, 4, '#f1ead8'); px(wx, D.x + 7, 10, 2, 2, '#1d1d1d'); px(wx, D.x + 11, 10, 3, 2, '#1d1d1d');   // a little WC sign
    // two air vents and a wall clock (its hands are drawn live)
    for (const vx of [170, 214]) { px(wx, vx, 8, 26, 14, '#2c2a28'); for (let k = 0; k < 6; k++) px(wx, vx + 1, 9 + k * 2, 24, 1, '#6d6964'); }
    pcirc(wx, 300, 20, 8, '#2b2420'); for (let r = 7; r > 0; r--) pcirc(wx, 300, 20, r, '#f6f1e6');
    // windows: a deep reveal, the night outside drawn live, sheer curtains drawn live
    for (const w of WINDOWS) { px(wx, w.x - 3, 6, w.w + 6, PY - 2, '#d9c9b2'); px(wx, w.x, 9, w.w, PY - 8, '#0d1424'); px(wx, w.x - 3, PY + 1, w.w + 6, 3, '#f2e9da'); }
  }

  // Furniture, painted once each and cut into 8 px bands so that people sort correctly in front of and behind it.
  const pieces = [];   // { c: canvas, x, y (top-left on the floor), h, base }
  function piece(w, h, paint, x, y, solid) { const [c, k] = mk(w, h); paint(k, w, h); pieces.push({ c, x, y, w, h }); if (solid) block(...solid); }
  const WOOD = ['#3b2414', '#4f311c', '#5e3a21', '#6f4528', '#7f5131'];
  function plankTop(k, x, y, w, h, vertical) { px(k, x, y, w, h, WOOD[3]); for (let i = 0; i < (vertical ? w : h); i++) { const s = hash2(i, x + y, 7); if (s > 0.8) vertical ? px(k, x + i, y, 1, h, WOOD[2]) : px(k, x, y + i, w, 1, WOOD[2]); if (s < 0.12) vertical ? px(k, x + i, y, 1, h, WOOD[4]) : px(k, x, y + i, w, 1, WOOD[4]); } px(k, x, y, w, 1, WOOD[4]); px(k, x, y, 1, h, WOOD[4]); }
  // long tables with a bench on each side, end-on to the back wall like in the photo
  for (const tx of [118, 198, 278]) {
    const ty = 62, tl = 104, tw = 24;
    piece(tw + 2, tl + 14, (k) => { plankTop(k, 1, 0, tw, tl, true); px(k, 1, tl, tw, 6, WOOD[1]); px(k, 1, tl, tw, 1, WOOD[0]); px(k, 2, tl + 6, 3, 8, WOOD[0]); px(k, tw - 3, tl + 6, 3, 8, WOOD[0]);
      for (let i = 0; i < 3; i++) { const gy = 14 + i * 34 + hash2(tx, i, 1) * 10; px(k, 6 + (i % 2) * 10, gy, 4, 5, 'rgba(230,236,240,0.55)'); px(k, 6 + (i % 2) * 10, gy, 4, 2, '#f4f0e4'); } }, tx - 1, ty, [tx, ty + 4, tx + tw, ty + tl + 2]);
    for (const bx of [tx - 13, tx + tw + 4]) piece(10, tl - 8 + 12, (k) => { plankTop(k, 0, 0, 9, tl - 8, true); px(k, 0, tl - 8, 9, 4, WOOD[1]); px(k, 1, tl - 4, 2, 8, WOOD[0]); px(k, 6, tl - 4, 2, 8, WOOD[0]); }, bx, ty + 4, [bx, ty + 8, bx + 9, ty + tl - 2]);
  }
  // square tables with bentwood chairs by the windows
  for (const [tx, ty] of [[386, 74], [470, 74], [386, 162], [470, 162]]) {
    piece(38, 34, (k) => { plankTop(k, 0, 0, 38, 24, false); px(k, 0, 24, 38, 5, WOOD[1]); px(k, 0, 24, 38, 1, WOOD[0]); px(k, 2, 29, 3, 5, WOOD[0]); px(k, 33, 29, 3, 5, WOOD[0]); px(k, 15, 6, 4, 5, '#f4f0e4'); }, tx, ty, [tx, ty + 2, tx + 38, ty + 27]);
    for (const [cx, cy, back] of [[tx - 13, ty + 2, 'left'], [tx + 41, ty + 2, 'right']]) piece(12, 26, (k) => {
      px(k, 1, 8, 10, 8, '#2a1a10'); px(k, 2, 9, 8, 6, '#3a2416'); px(k, 2, 16, 2, 9, '#21140c'); px(k, 8, 16, 2, 9, '#21140c');     // seat and legs
      const bx = back === 'left' ? 0 : 9; px(k, bx, 0, 3, 16, '#22150d'); pcirc(k, bx + 1, 4, 3, '#22150d');                    // the bent back
    }, cx, cy, [cx + 1, cy + 8, cx + 11, cy + 18]);
  }
  // the bar: a long counter down the left wall, beer taps, the barman's narrow lane behind it
  const BAR = { x: 30, y: 26, w: 28, h: 170 };
  piece(BAR.w + 2, BAR.h + 16, (k) => { plankTop(k, 0, 0, BAR.w, BAR.h, true); px(k, 0, 0, BAR.w, 2, '#9a6a3d'); px(k, BAR.w - 3, 0, 3, BAR.h, '#8a5d36'); px(k, 0, BAR.h, BAR.w, 14, WOOD[1]); px(k, 0, BAR.h, BAR.w, 1, WOOD[0]); for (let i = 3; i < BAR.w; i += 6) px(k, i, BAR.h + 2, 1, 12, WOOD[0]);
    for (let i = 0; i < 3; i++) { const y = 40 + i * 14; px(k, 10, y, 8, 3, '#bfc6c9'); px(k, 13, y - 7, 2, 7, '#d6dcdf'); px(k, 12, y - 10, 4, 3, i === 1 ? '#c9a43c' : '#2b2b2b'); }   // the taps
    for (let i = 0; i < 5; i++) { px(k, 6 + (i % 3) * 7, 96 + i * 9, 5, 7, '#e9c35a'); px(k, 6 + (i % 3) * 7, 96 + i * 9, 5, 2, '#fbf6e8'); } }, BAR.x, BAR.y, [BAR.x, BAR.y + 4, BAR.x + BAR.w, BAR.y + BAR.h + 4]);
  // a coat stand by the street door
  piece(14, 40, (k) => { px(k, 6, 4, 2, 34, '#2a1a10'); px(k, 2, 37, 10, 2, '#2a1a10'); px(k, 1, 6, 6, 12, '#5b6b4a'); px(k, 8, 4, 6, 15, '#7a3b2e'); px(k, 2, 2, 10, 2, '#2a1a10'); }, W - 26, 156, [W - 22, 190, W - 12, 196]);
  const bands = []; for (const p of pieces) for (let y = 0; y < p.h; y += 8) bands.push({ p, sy: y, sh: Math.min(8, p.h - y), base: p.y + Math.min(p.h, y + 8) - (y + 8 >= p.h ? 6 : 0) });
  const CHANDELIERS = [{ x: 200, y: 112 }, { x: 430, y: 118 }];

  // ------------------------------------------------------------------ art
  const SPR = {}, META = {};
  async function loadArt() {
    try { Object.assign(META, await (await fetch('art/sprites.json')).json()); } catch (e) { return; }
    await Promise.all(Object.keys(META).map(n => new Promise(res => { const im = new Image(); im.onload = () => { SPR[n] = im; res(); }; im.onerror = res; im.src = `art/${n}.png`; })));
  }
  const silCache = new Map();
  function sil(img) { if (silCache.has(img)) return silCache.get(img); const [c, x] = mk(img.width, img.height); x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); silCache.set(img, c); return c; }

  // ------------------------------------------------------------------ the people
  // Walk sheets: 16 frames, rows of 4 steps; dir 0 down, 1 right, 2 up, 3 left maps to sheet rows [2, 1, 0, 3].
  const LINES = {
    kevin: ['„Dvě děti, chlapi. Dvě.“', '„Mám propustku do jedenácti. Do jedenácti zítra.“', '„Žena volala. Nevidíte mě.“', '„Tohle je můj první večer od února.“'],
    patas: ['„Víte, že tady za Rakouska-Uherska byla… no, taky hospoda.“', '„Historicky vzato jsem měl ještě tak dvě.“', '„Já nejsem opilej. Já jsem v kontextu doby.“', '„Pánové, dějinnej okamžik. Další rundu.“'],
    stepa: ['„Já tu mám kolo, dám si jen jedno.“', '„Kolik je? Tak to jsem tu ještě dobrej.“', '„Zpátky to beru přes Riegráč. Z kopce.“', '„Helmu si nechám. Člověk nikdy neví.“'],
    pazout: ['„Já jsem v zásadě konzervativec. Tradice, rodina, pořádek.“', '„…a občas malá procházka k taxíku.“', '„Nepůjdem na chvilku ven? Jen na vzduch.“', '„Za první republiky by tohle bylo úplně normální.“'],
    ado: ['„Kolik má tohle kalorií? Ne, neříkej mi to.“', '„Zítra v šest nohy. Takže ještě jedno.“', '„Ten výčepní má fakt hezký předloktí.“', '„Pivo je v podstatě tekutej chleba. Sacharidy, kluci.“'],
    kopinaut: ['„Viděls ten gól? Ne? Já taky ne, byl jsem venku.“', '„Bohemka. To je láska na celej život.“', '„Nepůjdem k taxíku? Mám takovej pocit.“', '„Ďolíček v zimě, to je víc než kostel.“'],
    bob: ['„Pivo.“', '„Ještě jedno pivo.“', '„Pivo je jídlo.“', '„Kde mám tričko? To je dobrá otázka.“'],
    sasa: ['„Já jsem úplně v pohodě. Fakt.“', '„Kdo jde ven? Nikdo? Já jdu ven.“', '„Hehe.“', '„Neznáte někoho, kdo zná někoho?“'],
    barman: ['„Tak co to bude?“', '„Pilsner z tanku. Nic jinýho nemáme a nic jinýho nechcete.“', '„Pánové, trochu tišeji.“', '„Dvanáct let za pípou. Tohle je ještě klidnej večer.“'],
  };
  const NAMES = { kevin: 'Kevin', patas: 'Paťas', stepa: 'Štěpa', pazout: 'Pažout', ado: 'Ado', kopinaut: 'Kopinaut', bob: 'Bob', sasa: 'Saša', barman: 'Výčepní' };
  // Where each one stands when nobody is going anywhere: in the aisles between the long tables, at the bar, by the windows.
  const HOMES = { kevin: [W - 40, 214], patas: [171, 98], bob: [171, 136], sasa: [251, 104], pazout: [251, 142], ado: [72, 120], kopinaut: [524, 52], stepa: [340, 120], barman: [16, 110] };
  const cast = Object.keys(HOMES).map(id => ({ id, x: HOMES[id][0], y: HOMES[id][1], home: HOMES[id].slice(), dir: 0, step: 0, moving: false, look: null, lookT: 2 + Math.random() * 3,
    path: null, plan: 'idle', planT: 6 + Math.random() * 14, line: 0, say: null, present: id !== 'stepa', idle: 0, ctrl: 'npc', tx: 0, ty: 0, sayKey: 0 }));
  const by = id => cast.find(c => c.id === id);
  let me = null;               // the character this player plays; null while choosing on the intro screen
  const stepa = by('stepa'); stepa.x = W - 14; stepa.y = 212;
  const TRAITS = { patas: 'historik, opilý', stepa: 'cyklista, chodí pozdě', pazout: 'konzervativní feťák', ado: 'fitness, gay', kopinaut: 'Bohemka, feťák', bob: 'pije hodně piva', kevin: 'dvě děti, pivo', sasa: 'feťák, vždycky v pohodě' };
  const PLAYABLE = ['kevin', 'patas', 'stepa', 'pazout', 'ado', 'kopinaut', 'bob', 'sasa'];

  const blockedAt = (x, y, r = 3) => x < 6 || y < 8 || x > W - 6 || y > H - 6 || solids.some(s => x + r > s[0] && x - r < s[2] && y + r > s[1] && y - r < s[3]);
  // A coarse walk grid for finding a way round the tables.
  const GC = 6, GW = Math.ceil(W / GC), GH = Math.ceil(H / GC), grid = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) grid[j * GW + i] = blockedAt(i * GC + GC / 2, j * GC + GC / 2, 4) ? 1 : 0;
  function findPath(x0, y0, x1, y1) {
    const s = [clamp(x0 / GC | 0, 0, GW - 1), clamp(y0 / GC | 0, 0, GH - 1)], e = [clamp(x1 / GC | 0, 0, GW - 1), clamp(y1 / GC | 0, 0, GH - 1)];
    const key = (i, j) => j * GW + i, open = [[0, s[0], s[1]]], cost = new Map([[key(...s), 0]]), from = new Map();
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]); const [, i, j] = open.shift();
      if (i === e[0] && j === e[1]) { const pts = [[x1, y1]]; let k = key(i, j); while (from.has(k)) { k = from.get(k); pts.unshift([(k % GW) * GC + GC / 2, (k / GW | 0) * GC + GC / 2]); } return pts.filter((_, n) => n % 2 === 1 || n === pts.length - 1); }
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH || (grid[key(ni, nj)] && !(ni === e[0] && nj === e[1]))) continue;
        if (di && dj && (grid[key(i + di, j)] || grid[key(i, j + dj)])) continue;
        const nc = cost.get(key(i, j)) + (di && dj ? 1.41 : 1); if (nc < (cost.get(key(ni, nj)) ?? 1e9)) { cost.set(key(ni, nj), nc); from.set(key(ni, nj), key(i, j)); open.push([nc + Math.hypot(e[0] - ni, e[1] - nj), ni, nj]); }
      }
      if (cost.size > 4000) break;
    }
    return [[x1, y1]];
  }
  const dirOf = (x, y) => Math.abs(x) > Math.abs(y) ? (x > 0 ? 1 : 3) : (y > 0 ? 0 : 2);
  function speak(c, text, dur) { c.say = { text, t: 0, dur: dur || 1.4 + text.length * 0.07 }; c.sayKey++; }
  function nextLine(c) { const L = LINES[c.id]; const t = L[c.line % L.length]; c.line++; return t; }

  // ------------------------------------------------------------------ input
  const keys = new Set();
  addEventListener('keydown', e => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys.add(k);
    if (me && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
    if (me && (k === 'e' || k === ' ')) use(); if (me && k === 'Escape') leave(); });
  addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  addEventListener('blur', () => keys.clear());
  let touch = null;
  canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') touch = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', e => { if (touch) { touch.x = e.clientX; touch.y = e.clientY; } });
  for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => { touch = null; });
  $('btn-e').addEventListener('click', () => me && use()); $('btn-tab').addEventListener('click', () => me && leave());
  function axis() {
    let x = (keys.has('d') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('a') || keys.has('ArrowLeft') ? 1 : 0);
    let y = (keys.has('s') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('w') || keys.has('ArrowUp') ? 1 : 0);
    if (touch) { const dx = touch.x - touch.x0, dy = touch.y - touch.y0, l = Math.hypot(dx, dy); if (l > 12) { x = dx / Math.max(l, 50); y = dy / Math.max(l, 50); } }
    return [x, y];
  }
  // E: talk to whoever is nearest, or order at the bar.
  // E: order at the bar, or talk to whoever is nearest. A friend run by the pub answers; a friend played by someone
  // else hears you say one of your own lines.
  let askN = 0, ask = null;
  function use() {
    let best = null, bd = 34;
    for (const c of cast) if (c !== me && c.present) { const d = Math.hypot(c.x - me.x, c.y - me.y); if (d < bd) { bd = d; best = c; } }
    const atBar = me.x < BAR.x + BAR.w + 18 && me.y > BAR.y && me.y < BAR.y + BAR.h;
    if (atBar && (!best || best.id === 'barman' || bd > 20)) { speak(me, '„Jedno, prosím.“', 1.8); ask = { target: 'barman', n: ++askN }; if (isHost()) answer('barman', me); return; }
    if (!best) { speak(me, nextLine(me)); return; }
    me.dir = dirOf(best.x - me.x, best.y - me.y);
    if (best.ctrl === 'npc') { ask = { target: best.id, n: ++askN }; if (isHost()) answer(best.id, me); } else speak(me, nextLine(me));
  }
  function answer(id, asker) {   // the host makes a pub-run character turn and reply
    const c = by(id); if (!c || c.ctrl !== 'npc') return;
    c.dir = dirOf(asker.x - c.x, asker.y - c.y); c.look = null; c.planT = Math.max(c.planT, 4);
    setTimeout(() => npcSay(c, nextLine(c)), id === 'barman' ? 900 : 300);
  }
  const npcSay = (c, text) => speak(c, text);

  // ------------------------------------------------------------------ the night
  let clock = 20 * 60, now = 0, chatter = 6;
  const fmt = m => { const h = Math.floor(m / 60) % 24, mi = Math.floor(m % 60); return `Út ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`; };
  function walkTo(c, x, y) { c.path = findPath(c.x, c.y, x, y); }
  function moveAlong(c, dt, speed) {
    if (!c.path || !c.path.length) { c.moving = false; return true; }
    const [tx, ty] = c.path[0], dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy);
    if (d < 3) { c.path.shift(); if (!c.path.length) { c.moving = false; return true; } return false; }
    const v = Math.min(d, speed * dt); c.x += dx / d * v; c.y += dy / d * v; c.dir = dirOf(dx, dy); c.step += dt * 9; c.moving = true; return false;
  }
  function lifeOf(c, dt) {
    if (c.ctrl !== 'npc') return;
    if (c.id === 'barman') {   // he paces his lane, polishes, and looks out at the room
      c.planT -= dt; if (c.planT <= 0) { c.planT = 4 + Math.random() * 6; walkTo(c, 16, BAR.y + 20 + Math.random() * (BAR.h - 40)); }
      if (moveAlong(c, dt, 26) && !c.say) c.dir = 1; idleLook(c, dt); return;
    }
    if (!c.present) {   // Štěpa: late, as always
      if (clock >= 20 * 60 + 40) { c.present = true; walkTo(c, ...c.home); c.plan = 'arrive'; npcSay(c, '„Sorry, defekt. Na Nuselským mostě.“'); }
      return;
    }
    c.planT -= dt;
    if (c.plan === 'idle' && c.planT <= 0) {
      const r = Math.random(), beer = c.id === 'bob' || c.id === 'kevin' || c.id === 'patas';
      if (r < (beer ? 0.55 : 0.3)) { c.plan = 'bar'; walkTo(c, BAR.x + BAR.w + 9, BAR.y + 30 + Math.random() * (BAR.h - 60)); }
      else if (r < 0.75) { const o = cast.filter(o => o !== c && o.present && o.id !== 'barman'); const t = o[Math.floor(Math.random() * o.length)]; c.plan = 'visit'; c.target = t; walkTo(c, t.x + (Math.random() < 0.5 ? -18 : 18), t.y + 4); }
      else { c.plan = 'home'; walkTo(c, ...c.home); }
    }
    const arrived = moveAlong(c, dt, 34);
    if (arrived && c.plan !== 'idle') {
      if (c.plan === 'bar') { c.dir = 3; c.plan = 'drink'; c.planT = 3 + Math.random() * 3; }
      else if (c.plan === 'drink' && c.planT <= 0) { c.plan = 'home'; walkTo(c, ...c.home); }
      else if (c.plan === 'visit') { if (c.target) c.dir = dirOf(c.target.x - c.x, c.target.y - c.y); c.plan = 'idle'; c.planT = 8 + Math.random() * 12; c.home = [c.x, c.y]; if (!c.say && Math.random() < 0.6) npcSay(c, nextLine(c)); }
      else if (c.plan === 'home' || c.plan === 'arrive') { c.plan = 'idle'; c.planT = 10 + Math.random() * 20; }
    }
    if (!c.moving) idleLook(c, dt);
  }
  function idleLook(c, dt) {   // standing still, people look about: at a friend, at the bar, out of the window
    if (c.moving || c.say) { c.look = null; return; }
    if ((c.lookT -= dt) <= 0) { const o = cast.filter(o => o !== c && o.present); const t = o[Math.floor(Math.random() * o.length)];
      c.look = Math.random() < 0.65 && t ? dirOf(t.x - c.x, t.y - c.y) : Math.random() < 0.5 ? null : Math.floor(Math.random() * 4); c.lookT = 2 + Math.random() * 4; }
  }
  function update(dt) {
    now += dt; const host = isHost(); if (host) clock += dt * (keys.has('t') ? 20 : 1); else clock += dt;
    if (me) { const [ax, ay] = axis(), l = Math.hypot(ax, ay); me.moving = l > 0.1;
      if (me.moving) { const sp = 62 * Math.min(1, l), vx = ax / Math.max(1, l) * sp, vy = ay / Math.max(1, l) * sp;
        if (!blockedAt(me.x + vx * dt, me.y)) me.x += vx * dt; if (!blockedAt(me.x, me.y + vy * dt)) me.y += vy * dt;
        me.dir = dirOf(vx, vy); me.step += dt * 10; me.look = null; me.idle = 0; } else { me.idle += dt; idleLook(me, dt); } }
    for (const c of cast) {
      if (c.ctrl === 'npc' && host) lifeOf(c, dt);
      else if (c.ctrl === 'remote' || (c.ctrl === 'npc' && !host)) {   // someone else moves this one: glide to where they last said it was
        const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy); if (d > 80) { c.x = c.tx; c.y = c.ty; } else { const k = Math.min(1, dt * 12); c.x += dx * k; c.y += dy * k; }
        if (c.moving) c.step += dt * 9; else idleLook(c, dt); }
      if (c.say && (c.say.t += dt) > c.say.dur) c.say = null; }
    // now and then someone across the room says something (the host decides, everyone hears)
    if (host && (chatter -= dt) <= 0) { chatter = 7 + Math.random() * 9; if (!cast.some(c => c.say)) { const o = cast.filter(c => c.present && c.ctrl === 'npc' && c.id !== 'barman' && !c.moving); const c = o[Math.floor(Math.random() * o.length)]; if (c) npcSay(c, nextLine(c)); } }
    net(dt);
    for (const s of smoke) { s.x += s.vx * dt; s.y += Math.sin(now * 0.2 + s.ph) * 2 * dt; if (s.x > W + 120) s.x = -120; }
  }
  const smoke = Array.from({ length: 7 }, (_, i) => ({ x: hash2(i, 1, 5) * W, y: hash2(i, 2, 5) * H * 0.8, r: 60 + hash2(i, 3, 5) * 70, vx: 2 + hash2(i, 4, 5) * 3, ph: i }));

  // ------------------------------------------------------------------ drawing
  function frameOf(c) { const M = META[c.id]; const d = c.moving || c.look == null ? c.dir : c.look; return [([2, 1, 0, 3][d] * 4 + (c.moving ? Math.floor(c.step * 0.55) % 4 : 1)) * M.fw, M]; }
  function drawPerson(c, ox, oy) {
    const im = SPR[c.id]; if (!im) return; const [sx, M] = frameOf(c), x = Math.round(c.x - ox) - 24, y = Math.round(c.y - oy) - 44;
    // breathing: on each out-breath the upper body settles a pixel while the feet stay put
    const br = c.moving ? 0 : ((now + c.x * 0.01) % 3.4 > 1.7 ? 1 : 0), cut = 29;
    g.drawImage(im, sx, cut, M.fw, M.fh - cut, x, y + cut, M.fw, M.fh - cut); g.drawImage(im, sx, 0, M.fw, cut + 1, x, y + br, M.fw, cut + 1);
  }
  function blob(x, y, rx, ry, a) { g.save(); g.translate(x, y); g.scale(1, ry / rx); const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx); gr.addColorStop(0, `rgba(30,16,8,${a})`); gr.addColorStop(0.6, `rgba(30,16,8,${a * 0.6})`); gr.addColorStop(1, 'rgba(30,16,8,0)'); g.fillStyle = gr; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore(); }
  function glow(x, y, r, col, a) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  let camX = 0, camY = 0;
  function draw() {
    const fx = me ? me.x : W / 2 + Math.sin(now * 0.07) * 180, fy = me ? me.y : H / 2 - 30 + Math.sin(now * 0.05) * 30; camX += ((fx - VW / 2) - camX) * (me ? 0.12 : 0.02); camY += ((fy - 20 - VH / 2) - camY) * (me ? 0.12 : 0.02);
    const ox = Math.round(clamp(camX, -12, W + 12 - VW)), oy = Math.round(clamp(camY, -WALL - 8, H + 14 - VH));
    g.fillStyle = '#120c08'; g.fillRect(0, 0, VW, VH);
    g.drawImage(floorC, -ox, -oy); g.drawImage(wallC, -ox, -WALL - oy);
    // the live parts of the wall: the night through the windows, the curtains, the TV, the clock
    for (const w of WINDOWS) { const X = w.x - ox, Y = -WALL - oy;
      px(g, X, Y + 9, w.w, 32, '#0f1830'); for (let i = 0; i < 4; i++) { const lx = X + 4 + i * 11; px(g, lx, Y + 14, 5, 7, hash2(i, w.x, 1) > 0.4 ? '#e9b45c' : '#26304a'); px(g, lx, Y + 27, 5, 7, hash2(i, w.x, 2) > 0.5 ? '#e0a24e' : '#26304a'); }   // windows across Korunní
      px(g, X, Y + 36, w.w, 5, '#3a3f4a'); const lampOn = 1; if (lampOn) glow(X + w.w / 2, Y + 30, 14, '255,190,110', 0.5);
      for (const side of [0, 1]) { const sway = Math.sin(now * 0.7 + w.x + side) * 1.5; for (let k = 0; k < 9; k++) { const cx = side ? X + w.w - 1 - k : X + k; px(g, cx + (k > 5 ? sway : 0), Y + 9, 1, 32, `rgba(246,240,228,${0.55 - k * 0.04})`); } } }
    { const X = 19 - ox, Y = -WALL + 4 - oy, t = now * 0.8; px(g, X, Y, 32, 8, '#cfe2ea'); px(g, X + 15, Y, 1, 8, '#b33'); for (let i = 0; i < 6; i++) px(g, X + 3 + ((i * 7 + t * (i % 2 ? 9 : -7)) % 26 + 26) % 26, Y + 2 + (i % 3) * 2, 2, 2, i < 3 ? '#c22' : '#225'); px(g, X + ((t * 12) % 30), Y + 4, 1, 1, '#000'); }
    { const X = 300 - ox, Y = -WALL + 20 - oy, h = (clock / 60) % 12, m = clock % 60; pline(g, [[X, Y], [X + Math.sin(h / 12 * 6.283) * 4, Y - Math.cos(h / 12 * 6.283) * 4]], '#2b2420'); pline(g, [[X, Y], [X + Math.sin(m / 60 * 6.283) * 6, Y - Math.cos(m / 60 * 6.283) * 6]], '#2b2420'); }
    // contact shadows under everyone, then people and furniture from back to front
    for (const c of cast) if (c.present) blob(c.x - ox, c.y - oy - 1, 7.5, 2.6, 0.5);
    for (const L of CHANDELIERS) for (const c of cast) if (c.present) {   // a faint long shadow away from the nearest chandelier
      const dx = c.x - L.x, dy = c.y - L.y, d = Math.hypot(dx, dy); if (d > 150) continue; const a = 0.18 * (1 - d / 150), im = SPR[c.id]; if (!im) continue; const [sx, M] = frameOf(c);
      g.save(); g.globalAlpha = a; g.setTransform(1, 0, -dx / d * 0.6, -dy / d * 0.35 - 0.2, Math.round(c.x - ox), Math.round(c.y - oy)); g.drawImage(sil(im), sx, 0, M.fw, 44, -24, -44, 48, 44); g.restore(); }
    const items = bands.map(b => ({ y: b.base, d: () => g.drawImage(b.p.c, 0, b.sy, b.p.w, b.sh, b.p.x - ox, b.p.y + b.sy - oy, b.p.w, b.sh) }));
    for (const c of cast) if (c.present) items.push({ y: c.y, d: () => drawPerson(c, ox, oy) });
    items.sort((a, b) => a.y - b.y).forEach(i => i.d());
    // the front edge of the room and the side walls
    px(g, -ox - 12, -WALL - oy, 12, H + WALL + 20, '#24170e'); px(g, W - ox, -WALL - oy, 12, H + WALL + 20, '#24170e'); px(g, -ox - 12, H - oy, W + 24, 14, '#2c1c11'); px(g, -ox, H - oy, W, 2, '#4a3020');
    { const D = DOORS.street; px(g, W - ox - 2, D.y - oy - 6, 14, D.h + 6, '#120a06'); px(g, W - ox, D.y - oy - 6, 2, D.h + 6, '#6b4a30'); }   // the way out to Korunní
    // chandeliers hang above everything
    light(ox, oy);
    // the chandeliers hang above everything and shine: a brass ring on a rod from the ceiling, a crown of glass candles
    for (const L of CHANDELIERS) { const X = L.x - ox, Y = L.y - oy - 74, fl = 0.9 + 0.1 * Math.sin(now * 2 + L.x);
      px(g, X - 1, Y - 120, 2, 112, '#6b5226'); px(g, X - 1, Y - 120, 1, 112, '#a88a48');
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; pline(g, [[X, Y - 9], [X + Math.cos(a) * 20, Y + Math.sin(a) * 7]], 'rgba(150,118,56,0.8)'); }
      const back = [], front = []; for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; (Math.sin(a) < 0 ? back : front).push(a); }
      const candle = a => { const bx = X + Math.cos(a) * 21, by = Y + Math.sin(a) * 7; px(g, bx - 1, by - 7, 3, 6, '#fff3d6'); px(g, bx - 1, by - 7, 1, 6, '#ffffff'); px(g, bx - 1, by - 1, 3, 2, '#8a6a2e'); };
      back.forEach(candle);
      for (let a = 0; a < 6.283; a += 0.03) { const rx = X + Math.cos(a) * 21, ry = Y + Math.sin(a) * 7; px(g, rx, ry, 1, 2, Math.sin(a) > 0 ? '#d6b25c' : '#8f7130'); }
      front.forEach(candle);
      g.save(); g.globalCompositeOperation = 'lighter'; glow(X, Y - 3, 46, '255,214,150', 0.32 * fl); glow(X, Y - 3, 16, '255,240,210', 0.35 * fl); g.restore(); }
    for (const c of cast) if (c.say) bubble(c, ox, oy);
  }
  function light(ox, oy) {
    g.save();
    g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgb(232,196,160)'; g.fillRect(0, 0, VW, VH);   // the room's warm dusk
    g.globalCompositeOperation = 'lighter';
    for (const L of CHANDELIERS) { const X = L.x - ox, Y = L.y - oy, fl = 0.97 + 0.03 * Math.sin(now * 3 + L.x);
      glow(X, Y, 150, '255,190,110', 0.22 * fl); glow(X, Y - 70, 40, '255,220,160', 0.45 * fl); glow(X, Y, 60, '255,214,160', 0.12); }
    for (const w of WINDOWS) { const X = w.x - ox + w.w / 2, Y = -oy + 18; glow(X, Y, 50, '120,150,230', 0.10); }   // cold street light through the curtains
    { const X = 35 - ox, Y = -WALL + 8 - oy, f = 0.6 + 0.4 * Math.abs(Math.sin(now * 5.3) * Math.sin(now * 1.7)); glow(X, Y + 18, 44, '170,200,255', 0.16 * f); }   // the hockey on the TV
    glow(44 - ox, BAR.y + 60 - oy, 90, '255,180,90', 0.10);                                                         // the bar
    g.globalCompositeOperation = 'source-over';
    for (const s of smoke) { const X = s.x - ox, Y = s.y - oy; if (X < -s.r || X > VW + s.r) continue; const gr = g.createRadialGradient(X, Y, 0, X, Y, s.r); gr.addColorStop(0, 'rgba(220,205,185,0.07)'); gr.addColorStop(1, 'rgba(220,205,185,0)'); g.fillStyle = gr; g.fillRect(X - s.r, Y - s.r, s.r * 2, s.r * 2); }
    for (let i = 0; i < 40; i++) { const L = CHANDELIERS[i % 2], a = now * 0.1 + i, X = L.x - ox + Math.sin(a * 0.7 + i) * 50, Y = L.y - oy - 40 + Math.sin(a * 0.43 + i * 2) * 40; px(g, X, Y, 1, 1, `rgba(255,236,200,${0.25 + 0.2 * Math.sin(now + i)})`); }   // dust in the light
    const vg = g.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.35, VW / 2, VH / 2, Math.max(VW, VH) * 0.72); vg.addColorStop(0, 'rgba(20,10,4,0)'); vg.addColorStop(1, 'rgba(20,10,4,0.5)'); g.fillStyle = vg; g.fillRect(0, 0, VW, VH);
    g.restore();
  }
  function bubble(c, ox, oy) {
    const L = c.say, shown = L.text.slice(0, Math.max(1, Math.floor(L.t * 32))), a = Math.min(1, L.t * 4, (L.dur - L.t) * 3);
    g.save(); g.globalAlpha = Math.max(0, a); g.font = '10px VT323, monospace';
    const w2 = Math.ceil(g.measureText(L.text).width) + 10, X = Math.round(clamp(c.x - ox - w2 / 2, 4, VW - w2 - 4)), Y = Math.round(c.y - oy - 52);
    px(g, X, Y - 10, w2, 14, 'rgba(23,17,13,0.9)'); px(g, Math.round(c.x - ox) - 1, Y + 4, 3, 2, 'rgba(23,17,13,0.9)');
    g.fillStyle = c === me ? '#f3e9d8' : '#f2d7a6'; g.fillText(shown, X + 5, Y + 1);
    g.font = '8px VT323, monospace'; g.fillStyle = '#b9a993'; if (c !== me) g.fillText(NAMES[c.id], X + 2, Y - 12);
    g.restore();
  }
  let hudKey = '';
  function hud() {
    const n = peersHere(), k = fmt(clock) + (me ? me.id : '') + n; if (k === hudKey) return; hudKey = k;
    $('clock').textContent = fmt(clock); $('who').textContent = me ? NAMES[me.id] + (n > 1 ? ` · v hospodě ${n}` : '') : 'vyber si, za koho hraješ';
  }

  // ================================================================== ONLINE
  // Everyone who has the page open is in the same pub. Each player's presence says who they play, where they stand,
  // which way they face and the line they last said. The viewer with the lowest peer label is the host: their page
  // runs everyone nobody plays, and the clock, and shares them in its presence, so every screen shows the same night.
  // Without a room (a saved copy, or nobody else here) the page plays alone, and is its own host.
  let room = null, peers = [], sendT = 0, lastSent = '';
  const seenSay = new Map(), seenAsk = new Map();
  const viewers = () => peers.filter(p => p.kind === 'viewer');
  const lowestPeer = () => viewers().map(p => p.peer).sort()[0];
  function isHost() { if (!room) return true; const v = viewers(); if (!v.length) return true; const low = lowestPeer(); return v.some(p => p.sameTab && p.peer === low); }
  const peersHere = () => room ? Math.max(me ? 1 : 0, viewers().filter(p => p.presence && typeof p.presence.who === 'string').length) : (me ? 1 : 0);
  function claims() {   // who plays whom; if two pick the same friend, the lower peer label keeps him
    const m = new Map();
    for (const p of [...viewers()].sort((a, b) => a.peer < b.peer ? -1 : 1)) { const w = p.presence && p.presence.who; if (PLAYABLE.includes(w) && !m.has(w)) m.set(w, p); }
    return m;
  }
  function net(dt) {
    if (!room || (sendT -= dt) > 0) return; sendT = 1 / 15;
    const P = me ? { who: me.id, x: Math.round(me.x), y: Math.round(me.y), d: me.dir, m: me.moving ? 1 : 0, l: me.look ?? -1, s: me.say ? me.say.text : '', sk: me.sayKey, ask }
                 : { who: null, x: null, y: null, d: null, m: null, l: null, s: null, sk: null, ask: null };
    if (isHost()) { P.clock = Math.round(clock * 10) / 10; P.npc = cast.filter(c => c.ctrl === 'npc').map(c => [c.id, Math.round(c.x), Math.round(c.y), c.dir, c.moving ? 1 : 0, c.look ?? -1, c.present ? 1 : 0, c.sayKey, c.say ? c.say.text : '']); }
    else { P.clock = null; P.npc = null; }
    const k = JSON.stringify(P); if (k === lastSent) return; lastSent = k; room.presence(P).catch(() => {});
  }
  function applyPeers() {
    peers = room ? room.peers() : [];
    const cl = claims(), host = isHost();
    if (me && cl.get(me.id) && !cl.get(me.id).sameTab) { const lost = me.id; leave(); showIntro(`${NAMES[lost]} už hraje někdo jiný. Vyber si jiného.`); }
    for (const c of cast) {
      if (c === me) continue;
      const p = cl.get(c.id);
      if (p && !p.sameTab) {
        const q = p.presence;
        if (c.ctrl !== 'remote') { c.ctrl = 'remote'; c.path = null; if (!c.present) { c.x = +q.x || c.x; c.y = +q.y || c.y; } }
        c.present = true; c.tx = Number.isFinite(q.x) ? q.x : c.x; c.ty = Number.isFinite(q.y) ? q.y : c.y; c.dir = (q.d | 0) & 3; c.moving = !!q.m; c.look = q.l >= 0 ? q.l & 3 : null;
        if (q.sk !== seenSay.get(c.id)) { const first = !seenSay.has(c.id); seenSay.set(c.id, q.sk); if (!first && typeof q.s === 'string' && q.s) speak(c, q.s.slice(0, 140)); }
        if (q.ask && typeof q.ask === 'object') { const n = q.ask.n, first = !seenAsk.has(p.peer); if (n !== seenAsk.get(p.peer)) { seenAsk.set(p.peer, n); if (!first && host && typeof q.ask.target === 'string') answer(q.ask.target, c); } }
      } else if (c.ctrl === 'remote') { c.ctrl = 'npc'; c.path = null; c.plan = 'idle'; c.planT = 3; c.home = [c.x, c.y]; }
    }
    if (!host) {   // the host's pub: everyone nobody plays, and the time
      const h = viewers().find(p => p.peer === lowestPeer()), q = h && h.presence;
      if (q && Array.isArray(q.npc)) for (const e of q.npc) { const c = by(e[0]); if (!c || c.ctrl !== 'npc' || !Array.isArray(e)) continue;
        c.tx = +e[1] || c.x; c.ty = +e[2] || c.y; c.dir = (e[3] | 0) & 3; c.moving = !!e[4]; c.look = e[5] >= 0 ? e[5] & 3 : null; if (!c.present && e[6]) { c.x = c.tx; c.y = c.ty; } c.present = !!e[6];
        if (e[7] !== seenSay.get(c.id)) { const first = !seenSay.has(c.id); seenSay.set(c.id, e[7]); if (!first && typeof e[8] === 'string' && e[8]) speak(c, e[8].slice(0, 140)); } }
      if (q && typeof q.clock === 'number' && Math.abs(q.clock - clock) > 1.5) clock = q.clock;
    }
    renderCards();
  }
  async function connect() {
    try { if (!window.claude || !window.claude.use) return; const r = await window.claude.use('room'); if (!r) return;
      room = r; r.onPeers(() => applyPeers(), () => { room = null; peers = []; renderCards(); }); } catch (e) { room = null; }
  }

  // ------------------------------------------------------------------ the intro: who are you tonight?
  function portrait(id) {
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
    if (!me.present) { me.present = true; me.x = W - 30; me.y = 212; }
    $('intro').hidden = true; hudKey = ''; lastSent = ''; canvas.focus?.();
  }
  function leave(quiet) {
    if (!me) return; const c = me; me = null; c.ctrl = 'npc'; c.path = null; c.plan = 'idle'; c.planT = 3; c.home = [c.x, c.y]; c.moving = false; lastSent = ''; hudKey = '';
    if (!quiet) showIntro();
  }

  // ------------------------------------------------------------------ go
  let last = performance.now();
  function frame(t) { const dt = Math.min(0.05, (t - last) / 1000); last = t; update(dt); draw(); hud(); requestAnimationFrame(frame); }
  await loadArt();
  try { await document.fonts.load('10px VT323', 'Dvě děti, chlapi. Žena volala. Paťas Štěpa Pažout Saša Výčepní'); } catch (e) {}
  $('load')?.remove();
  window.__game = { cast, by, keys, use, enter, leave, isHost, get me() { return me; }, setClock: m => { clock = m; } };
  showIntro(); connect();
  window.__ready = true;
  requestAnimationFrame(frame);
})();
