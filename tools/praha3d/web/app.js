// Praha 3D: a pixel-art drive through real Prague. Plain three.js (r128, global THREE), no build step.
// Data (made by tools/praha3d/*.mjs): terrain-near.bin, terrain-far.bin (Float32 heights), buildings.bin, land.bin,
// roads.bin, trees.bin (int16 local metres at 1/4 m) and path.json (the drive, every 5 m).
// The scene is drawn at a low resolution and scaled up with hard pixels; every material ends with the same
// ordered dither and colour posterising, so terrain, buildings, trees and sky share one pixel-art palette.
(async function () {
  const $ = id => document.getElementById(id);
  const say = t => { $('load').textContent = t; };
  const P = new URLSearchParams(location.search);
  // Two looks share this code: 'pixel' (low resolution, posterised, hard shadows) and 'studio' (full resolution,
  // anti-aliased, soft shadows, materials that reflect a sky environment, a glassy river). The page picks one.
  const STUDIO = (window.PRAHA_STYLE || P.get('style')) === 'studio';
  // Binary files are read raw (local server) or, where only text can be hosted, from a base64 copy next to them.
  const b64 = t => { const s = atob(t.trim()), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; };
  const get = async (f, bin) => {
    let r = await fetch(f).catch(() => null);
    if (bin && !(r && r.ok && !(r.headers.get('content-type') || '').includes('text/html'))) { r = await fetch(f + '.txt'); if (!r.ok) throw Error(`${f}: HTTP ${r.status}`); return b64(await r.text()); }
    if (!r || !r.ok) throw Error(`${f}: HTTP ${r ? r.status : 'failed'}`);
    return bin ? r.arrayBuffer() : r.json();
  };
  say('Loading the map…');
  const [path, nearBuf, farBuf, bBuf, lBuf, rBuf, tBuf] = await Promise.all([get('path.json'), get('terrain-near.bin', 1), get('terrain-far.bin', 1),
    get('buildings.bin', 1), get('land.bin', 1), get('roads.bin', 1), get('trees.bin', 1)]);
  const yieldUI = () => new Promise(r => setTimeout(r, 0));

  // ---------------------------------------------------------------- terrain sampling (matches the mesh triangles)
  const N = path.near, F = path.far;
  const grid = (G, buf) => ({ ...G, w: Math.round((G.x1 - G.x0) / G.cell) + 1, h: Math.round((G.z1 - G.z0) / G.cell) + 1, d: new Float32Array(buf) });
  const GN = grid(N, nearBuf), GF = grid(F, farBuf);
  function sample(G, d, x, z) {
    const fx = (x - G.x0) / G.cell, fz = (z - G.z0) / G.cell;
    if (fx < 0 || fz < 0 || fx > G.w - 1 || fz > G.h - 1) return null;
    const i = Math.min(G.w - 2, Math.floor(fx)), j = Math.min(G.h - 2, Math.floor(fz)), tx = fx - i, tz = fz - j;
    const a = d[j * G.w + i], dd = d[j * G.w + i + 1], b = d[(j + 1) * G.w + i], c = d[(j + 1) * G.w + i + 1];
    return tx + tz <= 1 ? a + (dd - a) * tx + (b - a) * tz : c + (b - c) * (1 - tx) + (dd - c) * (1 - tz);
  }
  const H = (x, z) => sample(GN, GN.d, x, z) ?? sample(GF, GF.d, x, z) ?? 190;

  // ---------------------------------------------------------------- binary readers
  function reader(buf) {
    const v = new DataView(buf); let o = 8;
    const r = { count: v.getUint32(4, true),
      u8: () => v.getUint8(o++), i8: () => v.getInt8(o++), u16: () => { const x = v.getUint16(o, true); o += 2; return x; },
      pts: () => { const n = v.getUint16(o, true); o += 2; const a = new Array(n); for (let k = 0; k < n; k++) { a[k] = [v.getInt16(o, true) / 4, v.getInt16(o + 2, true) / 4]; o += 4; } return a; },
      i16: () => { const x = v.getInt16(o, true); o += 2; return x; } };
    return r;
  }
  const signedArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; };
  const inPoly = ([x, z], r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };

  // ---------------------------------------------------------------- renderer, camera, light
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: STUDIO, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(STUDIO ? Math.min(devicePixelRatio || 1, 1.5) : 1);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = STUDIO ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
  if (STUDIO) canvas.style.imageRendering = 'auto';
  const scene = new THREE.Scene();
  const HORIZON = new THREE.Color('#d3dfe4'), ZENITH = new THREE.Color('#3f7fc4');
  scene.fog = new THREE.FogExp2(HORIZON, STUDIO ? 1 / 12000 : 1 / 8200);
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.4, 45000);
  const SUN = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();   // late afternoon, from the south-west
  scene.add(new THREE.HemisphereLight(0xdfe9f2, 0x8a7d66, STUDIO ? 0.42 : 0.62));
  const sun = new THREE.DirectionalLight(0xfff1d8, STUDIO ? 0.95 : 0.78);
  const LITE = Math.min(innerWidth, innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4;   // phones: smaller shadows, chunkier pixels
  const SMAP = STUDIO ? (LITE ? 2048 : 4096) : LITE ? 1024 : 2048;
  if (STUDIO) { sun.shadow.radius = 3; sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.4; }
  sun.castShadow = true; sun.shadow.mapSize.set(SMAP, SMAP); sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  // Every material: ordered dither + posterise at the end, so the whole frame shares one pixel palette.
  const PIX = `
    float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
    float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
    vec3 pixelate(vec3 c) { float b = bayer4(gl_FragCoord.xy) - 0.5; ${STUDIO ? 'return c + b / 255.0;' : 'return floor(c * 22.0 + 0.5 + b * 0.9) / 22.0;'} }`;
  function patch(mat, kind) {
    mat.customProgramCacheKey = () => 'p3d-' + kind;
    mat.onBeforeCompile = sh => {
      if (kind === 'bld') {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 wall;\nvarying vec4 vWall;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWall = wall;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vWall;')
          .replace('#include <color_fragment>', `#include <color_fragment>
          {
            float u = vWall.x, v = vWall.y, style = floor(vWall.z / 1000.0), top = mod(vWall.z, 1000.0), seed = vWall.w;
            if (style > 0.5) {
              // Every building gets its own rhythm from its seed: window spacing, size, frames and ledges.
              float dist = length(vViewPosition);
              float fh = style > 4.5 ? 3.7 + seed * 0.5 : 3.3;
              float fl = floor(v / fh), fv = fract(v / fh), col, fu, win = 0.0, frame = 0.0, ledge = 0.0;
              if (style < 1.5) { float cw = 2.6 + seed * 0.8; col = floor(u / cw); fu = fract(u / cw);
                float ww = 0.17 + seed * 0.08;
                win = fl < 0.5 ? step(0.12, fu) * step(fu, 0.88) * step(0.1, fv) * step(fv, 0.76) : step(0.5 - ww, fu) * step(fu, 0.5 + ww) * step(0.28, fv) * step(fv, 0.8);
                frame = fl < 0.5 ? 0.0 : step(seed, 0.55) * step(0.44 - ww, fu) * step(fu, 0.56 + ww) * step(0.22, fv) * step(fv, 0.86);
                ledge = step(0.5, fl) * step(fv, 0.05) * step(0.45, seed); }
              else if (style < 2.5) { col = floor(u / 4.6); fu = fract(u / 4.6); float fv2 = fract(v / 9.0);
                win = step(0.36, fu) * step(fu, 0.64) * step(0.22, fv2) * step(fv2, 0.86) * step(3.0, v);
                win *= 1.0 - step(0.78, fv2) * step(0.86 - 0.5 * abs(fu - 0.5) * 2.0, fv2); }   // pointed tops
              else if (style < 3.5) { col = floor(u / 1.6); fu = fract(u / 1.6); win = step(0.08, fu) * step(fu, 0.92) * step(0.22, fv) * step(fv, 0.86); }
              else if (style < 4.5) { col = floor(u / 6.0); fu = fract(u / 6.0); win = step(0.25, fu) * step(fu, 0.75) * step(0.55, fv) * step(fv, 0.8); }
              else {   // old town: small framed windows, ledges between floors, arched portals and shops on the ground floor
                float cw = 2.7 + seed * 0.9; col = floor(u / cw); fu = fract(u / cw);
                if (fl < 0.5) {
                  float ax = (fu - 0.5) / 0.32, arch = 1.0 - step(0.62, fv) * step(0.62 + 0.3 * sqrt(max(0.0, 1.0 - ax * ax)), fv);
                  win = step(0.18, fu) * step(fu, 0.82) * step(0.04, fv) * step(fv, 0.92) * arch * step(0.35, fract(col * 0.37 + seed));
                } else {
                  win = step(0.34, fu) * step(fu, 0.66) * step(0.3, fv) * step(fv, 0.78);
                  frame = step(0.28, fu) * step(fu, 0.72) * step(0.24, fv) * step(fv, 0.85);
                }
                ledge = step(0.5, fl) * step(fv, 0.06);
              }
              win *= step(v, top - 1.1) * step(0.0, v);
              frame *= step(v, top - 0.9);
              float rnd = fract(sin(dot(vec2(col, fl) + seed * 17.0, vec2(12.9898, 78.233))) * 43758.5453);
              vec3 glass = mix(vec3(0.15, 0.18, 0.24), vec3(0.42, 0.52, 0.62), rnd * 0.6);
              if (style > 4.5) glass = mix(glass, vec3(0.62, 0.55, 0.38), step(0.9, rnd) * 0.5);   // a warm lit window here and there
              vec3 walled = diffuseColor.rgb;
              walled = mix(walled, walled * 0.8, step(top - 0.7, v) * step(v, top - 0.25));   // cornice line
              walled = mix(walled, walled * 0.86, ledge);
              walled *= 0.82 + 0.18 * smoothstep(0.0, 3.5, v);                               // dirt and shade at the foot
              float fade = 1.0 - smoothstep(140.0, 520.0, dist);
              walled = mix(walled, min(vec3(1.0), walled * 1.16 + 0.05), frame * fade);
              diffuseColor.rgb = mix(walled * (1.0 - 0.1 * (1.0 - fade) * step(0.5, style)), glass, win * fade);
            }
          }`);
      }
      if (kind === 'road') {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 rd;\nvarying vec4 vRd;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRd = rd;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vRd;')
          .replace('#include <color_fragment>', `#include <color_fragment>
          {
            float along = vRd.x, ac = vRd.y, hw = vRd.z, t = vRd.w; vec3 paint = vec3(0.86, 0.85, 0.8);
            if (t > 0.5 && t < 1.5) { float dash = step(0.55, fract(along / 9.0)); diffuseColor.rgb = mix(diffuseColor.rgb, paint, dash * step(abs(ac), 0.09)); }
            if (t > 0.5 && t < 2.5) diffuseColor.rgb = mix(diffuseColor.rgb, paint * 0.95, step(hw - 0.45, abs(ac)) * step(abs(ac), hw - 0.3));
            if (t > 2.5 && t < 3.5) { float a = abs(ac); diffuseColor.rgb *= 1.0 - 0.18 * step(0.55, fract(along / 0.65)) * step(a, 1.25); float rail = step(abs(a - 0.72), 0.06); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.31, 0.3), rail); }
            if (t > 3.5 && t < 4.5) { float a = abs(ac); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.4, 0.38), step(abs(a - 0.72), 0.06)); }
          }`);
      }
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + PIX)
        .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor.rgb = pixelate(gl_FragColor.rgb);');
    };
    return mat;
  }
  // Studio materials are physically based and pick up the sky environment (set on the scene below).
  const mat = (opts, kind, std = {}) => patch(STUDIO ? new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...opts, ...std }) : new THREE.MeshPhongMaterial({ flatShading: true, shininess: 0, specular: 0x000000, ...opts }), kind);
  const flatMat = kind => mat({ vertexColors: true, flatShading: true }, kind, kind === 'road' ? { roughness: 0.92 } : { roughness: 0.8 });

  // ---------------------------------------------------------------- sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { sunDir: { value: SUN }, horizon: { value: HORIZON }, zenith: { value: ZENITH }, time: { value: 0 } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir; uniform vec3 sunDir, horizon, zenith; uniform float time; ${PIX}
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { return n(p) * 0.55 + n(p * 2.1) * 0.27 + n(p * 4.3) * 0.13 + n(p * 8.7) * 0.05; }
      void main() {
        vec3 d = normalize(vDir); float y = d.y;
        vec3 col = mix(horizon, zenith, pow(clamp(y, 0.0, 1.0), 0.5));
        if (y < 0.0) col = mix(horizon, horizon * 0.92, clamp(-y * 8.0, 0.0, 1.0));
        float s = dot(d, sunDir);
        col += vec3(1.0, 0.86, 0.6) * smoothstep(0.96, 1.0, s) * 0.22;
        if (y > 0.015) {
          vec2 uv = d.xz / (y + 0.1) * 1.6 + vec2(time * 0.004, time * 0.002);
          float c = fbm(uv), fade = smoothstep(0.015, 0.12, y);
          float body = ${STUDIO ? 'smoothstep(0.54, 0.7, c)' : 'step(0.6, c)'}, core = ${STUDIO ? 'smoothstep(0.62, 0.78, fbm(uv + vec2(0.04, 0.05)))' : 'step(0.68, fbm(uv + vec2(0.04, 0.05)))'};
          vec3 cloud = mix(vec3(0.78, 0.82, 0.88), vec3(0.98, 0.98, 0.97), core);
          col = mix(col, cloud, body * fade * 0.95);
        }
        col = mix(col, vec3(1.0, 0.97, 0.86), step(0.9988, s));
        gl_FragColor = vec4(pixelate(col), 1.0);
      }`
  }));
  sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);

  // ---------------------------------------------------------------- land: ground texture and the water mask
  say('Painting the ground…');
  const LAND = ['#4a759c', '#7fa25a', '#5a8040', '#8eaf63', '#bab274', '#cbbea4', '#9c988e', '#6f9e57', '#8d8276', '#b9b1a1'];
  const GPX = 2;   // metres per ground texel
  const gw = Math.round((N.x1 - N.x0) / GPX), gh = Math.round((N.z1 - N.z0) / GPX);
  const ground = document.createElement('canvas'); ground.width = gw; ground.height = gh;
  const g = ground.getContext('2d');
  g.fillStyle = '#b9b1a1'; g.fillRect(0, 0, gw, gh);
  const toG = ([x, z]) => [(x - N.x0) / GPX, (z - N.z0) / GPX];
  const mask = document.createElement('canvas'); mask.width = GN.w; mask.height = GN.h;
  const m = mask.getContext('2d'); m.fillStyle = '#fff';
  const lr = reader(lBuf), waterPolys = [], paveds = [];
  // Squares and pedestrian streets: a mosaic of pale and darker setts, as on Prague's squares.
  const pc = document.createElement('canvas'); pc.width = pc.height = 4; const pcx = pc.getContext('2d');
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { pcx.fillStyle = (x + y) % 2 ? '#cfc2a8' : ((x * 3 + y) % 5 ? '#c4b59a' : '#b7a88f'); pcx.fillRect(x, y, 1, 1); }
  const paving = g.createPattern(pc, 'repeat');
  const polyPath = (ctx, rings, f) => { ctx.beginPath(); for (const r of rings) { r.forEach((p, k) => { const [a, b] = f(p); k ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.closePath(); } };
  for (let k = 0; k < lr.count; k++) {
    const cls = lr.u8(), nr = lr.u8(), rings = []; for (let q = 0; q < nr; q++) rings.push(lr.pts());
    g.fillStyle = cls === 5 ? paving : LAND[cls]; polyPath(g, rings, toG); g.fill('evenodd');
    if (cls === 5) paveds.push(rings);
    if (cls === 0) { waterPolys.push(rings); polyPath(m, rings, ([x, z]) => [(x - N.x0) / N.cell, (z - N.z0) / N.cell]); m.fill('evenodd'); }
  }
  // Roads: pavements under the urban roads and the footpaths are painted; the roads themselves are geometry.
  const rr = reader(rBuf), roads = [];
  for (let k = 0; k < rr.count; k++) { const cls = rr.u8(), fl = rr.u8(), w = rr.u8() / 4, layer = rr.i8(), nm = rr.u16(), pts = rr.pts(); roads.push({ cls, bridge: fl & 1, sett: fl & 2, oneway: fl & 4, w, layer, name: nm < 65535 ? path.roadNames[nm] : '', pts }); }
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const r of roads) if (r.cls === 6 && !r.bridge) { g.strokeStyle = '#d9cdb3'; g.lineWidth = Math.max(1, r.w / GPX); polyPath(g, [r.pts], toG); g.stroke(); }
  for (const r of roads) if (r.cls <= 4 && !r.bridge) { g.strokeStyle = '#cac1af'; g.lineWidth = (r.w + (r.cls <= 3 ? 6 : 2)) / GPX; polyPath(g, [r.pts], toG); g.stroke(); }
  // Embankments: a band of stone along every shore (the facing and the promenade on top).
  g.strokeStyle = '#9b9183'; g.lineWidth = 34 / GPX; g.lineJoin = 'round';
  for (const rings of waterPolys) { polyPath(g, rings, toG); g.stroke(); }
  for (const rings of waterPolys) { g.fillStyle = LAND[0]; g.save(); polyPath(g, rings, toG); g.clip('evenodd'); g.strokeStyle = '#7d7466'; g.lineWidth = 14 / GPX; polyPath(g, rings, toG); g.stroke(); g.restore(); }
  // Grain: a little per-texel noise so grass, paving and water read as pixel texture rather than flat fills.
  const img = g.getImageData(0, 0, gw, gh), px = img.data;
  let seed = 7; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < px.length; i += 4) { const water = px[i + 2] > px[i] + 30; const nz = (rnd() - 0.5) * (water ? 10 : STUDIO ? 7 : 16) + (water && rnd() < 0.03 ? 28 : 0); px[i] += nz; px[i + 1] += nz; px[i + 2] += nz; }
  g.putImageData(img, 0, 0);
  const groundTex = new THREE.CanvasTexture(ground);
  groundTex.magFilter = STUDIO ? THREE.LinearFilter : THREE.NearestFilter; groundTex.minFilter = THREE.LinearMipmapLinearFilter; groundTex.anisotropy = 4;
  const wmask = m.getImageData(0, 0, GN.w, GN.h).data;
  await yieldUI();

  // ---------------------------------------------------------------- terrain meshes
  say('Raising the hills…');
  // The river: the terrain data smooths the banks away, so the water is set well under the lowest ground around it;
  // the embankment walls show, and bridges get their height back (see the bridge decks below).
  // The banks: the terrain data blurs the embankments into a slope down to the water, so every street dipped towards
  // the river and climbed again onto the bridges. Prague's embankments are walls with the street level on top: land
  // within ~70 m of the water is lifted to the level of the city just behind it (never lowered, so the Vyšehrad rock
  // and the slopes of Letná keep their height).
  const WET = k => wmask[k * 4 + 3] > 100, inG = (i, j) => i >= 0 && j >= 0 && i < GN.w && j < GN.h;
  {
    const dist = new Int16Array(GN.w * GN.h).fill(99), queue = [];
    for (let k = 0; k < dist.length; k++) if (WET(k)) { dist[k] = 0; queue.push(k); }
    for (let qi = 0; qi < queue.length; qi++) { const k = queue[qi], i = k % GN.w, j = (k / GN.w) | 0; if (dist[k] >= 9) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (inG(a, b) && dist[b * GN.w + a] > dist[k] + 1) { dist[b * GN.w + a] = dist[k] + 1; queue.push(b * GN.w + a); } } }
    const src = GN.d.slice();
    for (let j = 0; j < GN.h; j++) for (let i = 0; i < GN.w; i++) {
      const k = j * GN.w + i, d = dist[k]; if (d < 1 || d > 7) continue;
      const ring = []; for (let dj = -7; dj <= 7; dj++) for (let di = -7; di <= 7; di++) { const a = i + di, b = j + dj; if (inG(a, b)) { const dd = dist[b * GN.w + a]; if (dd >= 6 && dd <= 9) ring.push(src[b * GN.w + a]); } }
      if (ring.length < 4) continue;
      ring.sort((x, y) => x - y); const ref = ring[ring.length >> 1], w = d <= 4 ? 1 : (7 - d) / 3;
      GN.d[k] = Math.max(src[k], src[k] + (ref - src[k]) * w);
    }
  }
  // The river: deep water sits well under the banks; the water cells along the shore stay at street level as the
  // embankment's top, so the drop happens inside the river, faced in stone (painted on the ground below).
  const drawn = GN.d.slice();
  for (let j = 0; j < GN.h; j++) for (let i = 0; i < GN.w; i++) if (WET(j * GN.w + i)) {
    let lo = Infinity, shore = -Infinity;
    for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const a = i + di, b = j + dj; if (inG(a, b)) { lo = Math.min(lo, GN.d[b * GN.w + a]); if (Math.abs(di) <= 1 && Math.abs(dj) <= 1 && !WET(b * GN.w + a)) shore = Math.max(shore, GN.d[b * GN.w + a]); } }
    drawn[j * GN.w + i] = shore > -Infinity ? shore - 0.3 : lo - 4.5;
  }
  const HD = (x, z) => sample(GN, drawn, x, z) ?? H(x, z);   // the ground as drawn (the riverbed under bridges)
  const isWater = (x, z) => { const i = Math.round((x - N.x0) / N.cell), j = Math.round((z - N.z0) / N.cell); return i >= 0 && j >= 0 && i < GN.w && j < GN.h && wmask[(j * GN.w + i) * 4 + 3] > 100; };
  function terrainGeo(G, d, uv, lowerInside) {
    const pos = new Float32Array(G.w * G.h * 3), uvs = uv ? new Float32Array(G.w * G.h * 2) : null, col = uv ? null : new Float32Array(G.w * G.h * 3);
    for (let j = 0; j < G.h; j++) for (let i = 0; i < G.w; i++) {
      const k = j * G.w + i, x = G.x0 + i * G.cell, z = G.z0 + j * G.cell;
      let y = d[k];
      if (lowerInside && x > N.x0 + G.cell && x < N.x1 - G.cell && z > N.z0 + G.cell && z < N.z1 - G.cell) y -= 30;
      pos.set([x, y, z], k * 3);
      if (uvs) uvs.set([(x - N.x0) / (N.x1 - N.x0), 1 - (z - N.z0) / (N.z1 - N.z0)], k * 2);
      if (col) {   // the wider city: a patchwork of roofs, parks and woods, darker on the wooded hills
        const hsh = Math.abs(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) % 1, hi = (y - 190) / 200;
        const c = new THREE.Color(hsh < 0.3 ? '#a8836a' : hsh < 0.52 ? '#9b948a' : hsh < 0.8 ? '#7d9457' : '#5d7a45');
        if (hi > 0.45) c.lerp(new THREE.Color('#5d7a45'), 0.55);
        col.set([c.r, c.g, c.b], k * 3);
      }
    }
    const idx = new Uint32Array((G.w - 1) * (G.h - 1) * 6); let o = 0;
    for (let j = 0; j < G.h - 1; j++) for (let i = 0; i < G.w - 1; i++) {
      const a = j * G.w + i, dd = a + 1, b = a + G.w, c = b + 1;
      idx.set([a, b, dd, b, c, dd], o); o += 6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (uvs) geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals();
    return geo;
  }
  const nearMesh = new THREE.Mesh(terrainGeo(GN, drawn, true, false), (STUDIO ? patch(new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.96, metalness: 0 }), 'ground') : patch(new THREE.MeshLambertMaterial({ map: groundTex }), 'ground')));
  nearMesh.receiveShadow = true; scene.add(nearMesh);
  const farMesh = new THREE.Mesh(terrainGeo(GF, GF.d, false, true), (STUDIO ? patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }), 'far') : patch(new THREE.MeshLambertMaterial({ vertexColors: true }), 'far')));
  farMesh.receiveShadow = false; scene.add(farMesh);
  if (STUDIO) {
    // The sky as an environment: every material reflects a soft blue dome with a warm sun patch and a pale horizon.
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { sunDir: { value: SUN } },
      vertexShader: 'varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vD; uniform vec3 sunDir; void main() { vec3 d = normalize(vD);
        vec3 c = mix(vec3(0.83, 0.87, 0.89), vec3(0.3, 0.52, 0.8), pow(clamp(d.y, 0.0, 1.0), 0.5));
        if (d.y < 0.0) c = mix(vec3(0.83, 0.87, 0.89), vec3(0.42, 0.4, 0.36), clamp(-d.y * 4.0, 0.0, 1.0));
        c += vec3(1.0, 0.85, 0.6) * pow(max(dot(d, sunDir), 0.0), 40.0) * 2.5;
        gl_FragColor = vec4(c, 1.0); }` })));
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.02).texture; pm.dispose();
    // The river: a still, glassy surface over the riverbed, drawn on the cells that are water.
    const wpos = [], widx = [], wid = new Map();
    const wet = (i, j) => i >= 0 && j >= 0 && i < GN.w && j < GN.h && wmask[(j * GN.w + i) * 4 + 3] > 100;
    // The surface sits 3.3 m over the deep riverbed near it, and always under the stone shelf of the shore.
    const level = (i, j) => { let lo = Infinity, near = Infinity;
      for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) if (inG(i + di, j + dj)) { const v = drawn[(j + dj) * GN.w + i + di]; if (wet(i + di, j + dj)) lo = Math.min(lo, v); if (Math.abs(di) <= 1 && Math.abs(dj) <= 1) near = Math.min(near, v); }
      return Math.min(lo + 3.3, near - 0.6); };
    const wv = (i, j) => { const k = j * GN.w + i; if (!wid.has(k)) { wid.set(k, wpos.length / 3); wpos.push(N.x0 + i * N.cell, level(i, j), N.z0 + j * N.cell); } return wid.get(k); };
    for (let j = 0; j < GN.h - 1; j++) for (let i = 0; i < GN.w - 1; i++) {
      if (!(wet(i, j) || wet(i + 1, j) || wet(i, j + 1) || wet(i + 1, j + 1))) continue;
      const a = wv(i, j), d = wv(i + 1, j), b = wv(i, j + 1), c = wv(i + 1, j + 1); widx.push(a, b, d, b, c, d);
    }
    // One level per stretch of river: smooth the surface heights so it lies flat, like water does.
    for (let pass = 0; pass < 6; pass++) for (const [k, n] of wid) { let sum = 0, cnt = 0; const i = k % GN.w, j = (k / GN.w) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const m = wid.get((j + dj) * GN.w + i + di); if (m !== undefined) { sum += wpos[m * 3 + 1]; cnt++; } }
      if (cnt) wpos[n * 3 + 1] = (wpos[n * 3 + 1] + sum) / (cnt + 1); }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3)); wg.setIndex(widx.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(widx, 1) : new THREE.Uint16BufferAttribute(widx, 1)); wg.computeVertexNormals();
    const water = new THREE.Mesh(wg, patch(new THREE.MeshStandardMaterial({ color: 0x2f5a74, roughness: 0.07, metalness: 0.0, envMapIntensity: 1.6, transparent: true, opacity: 0.93 }), 'water'));
    water.receiveShadow = true; scene.add(water);
  }
  await yieldUI();

  // ---------------------------------------------------------------- geometry builder (indexed, flat shaded)
  class Geo {
    constructor(extra) { this.p = []; this.c = []; this.e = []; this.i = []; this.extra = extra; this.n = 0; }
    v(x, y, z, col, ex) { this.p.push(x, y, z); this.c.push(col[0], col[1], col[2]); this.e.push(ex[0], ex[1], ex[2], ex[3]); return this.n++; }
    // A triangle facing `up` (or `normal`): the winding is fixed here, so callers do not have to care.
    tri(a, b, c, nx, ny, nz) {
      const P = this.p, ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az, vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      if (cx * nx + cy * ny + cz * nz >= 0) this.i.push(a, b, c); else this.i.push(a, c, b);
    }
    mesh(mat) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(this.c), 3, true));
      geo.setAttribute(this.extra, new THREE.Float32BufferAttribute(this.e, 4));
      geo.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
      geo.computeBoundingSphere();
      return new THREE.Mesh(geo, mat);
    }
  }

  // ---------------------------------------------------------------- buildings
  const bMat = flatMat('bld');
  const TILE = 400, tiles = new Map();
  const tileOf = (x, z) => { const k = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`; if (!tiles.has(k)) tiles.set(k, new Geo('wall')); return tiles.get(k); };
  const br = reader(bBuf);
  const STYLE = [1, 1, 2, 4, 0, 3, 5];   // windows by kind: other, house, church, industrial, tower, modern, old town
  const shade = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
  const V2 = (x, z) => new THREE.Vector2(x, z);
  function inset(ring, d, outward) {   // move each corner inwards along the bisector of its two edges
    const n = ring.length, out = [];
    for (let k = 0; k < n; k++) {
      const a = ring[(k + n - 1) % n], b = ring[k], c = ring[(k + 1) % n];
      const n1 = outward(a, b), n2 = outward(b, c), dot = n1[0] * n2[0] + n1[1] * n2[1];
      let mx = (n1[0] + n2[0]) / (1 + dot), mz = (n1[1] + n2[1]) / (1 + dot);
      const len = Math.hypot(mx, mz); if (len > 3) { mx *= 3 / len; mz *= 3 / len; }
      out.push([b[0] - mx * d, b[1] - mz * d]);
    }
    return out;
  }
  function selfCrosses(r) {
    const n = r.length; if (n > 60) return false;
    const cross = (p, q, s, t) => { const d = (q[0] - p[0]) * (t[1] - s[1]) - (q[1] - p[1]) * (t[0] - s[0]); if (Math.abs(d) < 1e-9) return false;
      const u = ((s[0] - p[0]) * (t[1] - s[1]) - (s[1] - p[1]) * (t[0] - s[0])) / d, v = ((s[0] - p[0]) * (q[1] - p[1]) - (s[1] - p[1]) * (q[0] - p[0])) / d; return u > 0.001 && u < 0.999 && v > 0.001 && v < 0.999; };
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (cross(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) return true; }
    return false;
  }
  function flatCap(G, rings, y, col, ex) {
    const contour = rings[0].map(p => V2(p[0], p[1])), holes = rings.slice(1).map(r => r.map(p => V2(p[0], p[1])));
    let tris; try { tris = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { return; }
    const all = rings.flat(), ids = all.map(p => G.v(p[0], y, p[1], col, ex));
    for (const t of tris) G.tri(ids[t[0]], ids[t[1]], ids[t[2]], 0, 1, 0);
  }
  let nBuild = 0; const feet = [];   // ground floors, for the car to bump into
  for (let k = 0; k < br.count; k++) {
    const kind = br.u8(), roof = br.u8(), h = br.u16() / 10, minH = br.u16() / 10; let rh = br.u16() / 10;
    const wall = [br.u8(), br.u8(), br.u8()], rc = [br.u8(), br.u8(), br.u8()], nr = br.u8(), rings = [];
    for (let q = 0; q < nr; q++) rings.push(br.pts());
    if (k % 3000 === 0) { say(`Building Prague… ${k.toLocaleString()} of ${br.count.toLocaleString()} buildings`); await yieldUI(); }
    // Outer ring counter-clockwise, holes clockwise (in x/z), so "outward" is the same formula for every edge.
    if (signedArea(rings[0]) < 0) rings[0].reverse();
    for (let q = 1; q < rings.length; q++) if (signedArea(rings[q]) > 0) rings[q].reverse();
    const outer = rings[0];
    let cx = 0, cz = 0; for (const p of outer) { cx += p[0]; cz += p[1]; } cx /= outer.length; cz /= outer.length;
    let gmin = Infinity; for (const p of outer) gmin = Math.min(gmin, H(p[0], p[1]));
    const gref = H(cx, cz), bottom = minH > 0 ? gref + minH : gmin - 0.6, wallTop = gref + Math.max(h - rh, minH + 1);
    const G = tileOf(cx, cz), style = STYLE[kind], top = wallTop - (gref + minH);
    const sgn = signedArea(outer) >= 0 ? 1 : -1;   // after the fix-up above, 1
    const outward = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; return [dz / l * sgn, -dx / l * sgn]; };
    // Walls: one quad per edge, sunlit or not by its own orientation (flat shading does the rest).
    const wcol = wall, perim0 = (Math.abs(cx * 7.13 + cz * 3.71) % 50), seed = Math.abs(Math.sin(cx * 0.731 + cz * 1.37) * 1000) % 1;
    for (const r of rings) {
      let u = perim0;
      for (let q = 0; q < r.length; q++) {
        const a = r[q], b = r[(q + 1) % r.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), [nx, nz] = outward(a, b);
        const st = len > 1.8 && top > 3.5 ? style : 0, ex = (uu, y) => [uu, y - (gref + minH), st * 1000 + Math.min(999, top), seed];
        const i0 = G.v(a[0], bottom, a[1], wcol, ex(u, bottom)), i1 = G.v(b[0], bottom, b[1], wcol, ex(u + len, bottom));
        const i2 = G.v(b[0], wallTop, b[1], wcol, ex(u + len, wallTop)), i3 = G.v(a[0], wallTop, a[1], wcol, ex(u, wallTop));
        G.tri(i0, i1, i2, nx, 0, nz); G.tri(i0, i2, i3, nx, 0, nz);
        u += len;
      }
    }
    // Roofs.
    const R0 = [0, 0, 0, 0], yt = wallTop, peak = wallTop + rh;
    let done = false;
    const rect = rings.length === 1 && outer.length === 4 && outer.every((p, q) => { const a = outer[(q + 3) % 4], c = outer[(q + 1) % 4]; const d1 = [a[0] - p[0], a[1] - p[1]], d2 = [c[0] - p[0], c[1] - p[1]]; return Math.abs(d1[0] * d2[0] + d1[1] * d2[1]) / (Math.hypot(...d1) * Math.hypot(...d2)) < 0.2; });
    if (rh > 0.3 && rect && (roof === 1 || roof === 2)) {
      // A true gable or hip on a rectangle: the ridge runs along the long side.
      let [p0, p1, p2, p3] = outer; if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < Math.hypot(p2[0] - p1[0], p2[1] - p1[1])) [p0, p1, p2, p3] = [p1, p2, p3, p0];
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), S = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), ax = (p1[0] - p0[0]) / L, az = (p1[1] - p0[1]) / L;
      const m0 = [(p0[0] + p3[0]) / 2, (p0[1] + p3[1]) / 2], m1 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2], hip = roof === 2 ? Math.min(S / 2, L / 2 - 0.5) : 0;
      const r0 = [m0[0] + ax * hip, m0[1] + az * hip], r1 = [m1[0] - ax * hip, m1[1] - az * hip];
      const v = p => G.v(p[0], yt, p[1], rc, R0), R0i = G.v(r0[0], peak, r0[1], rc, R0), R1i = G.v(r1[0], peak, r1[1], rc, R0);
      const c0 = v(p0), c1 = v(p1), c2 = v(p2), c3 = v(p3);
      const up = (a, b, c) => { const [nx, nz] = outward(a, b); return [nx, 1, nz]; };
      let n = up(p0, p1); G.tri(c0, c1, R1i, ...n); G.tri(c0, R1i, R0i, ...n);
      n = up(p2, p3); G.tri(c2, c3, R0i, ...n); G.tri(c2, R0i, R1i, ...n);
      if (roof === 2) { n = up(p1, p2); G.tri(c1, c2, R1i, ...n); n = up(p3, p0); G.tri(c3, c0, R0i, ...n); }
      else {   // gable ends are wall
        const gw = (p, q, rr) => { const [nx, nz] = outward(p, q); const a = G.v(p[0], yt, p[1], wcol, R0), b = G.v(q[0], yt, q[1], wcol, R0), c = G.v(rr[0], peak, rr[1], wcol, R0); G.tri(a, b, c, nx, 0, nz); };
        gw(p1, p2, r1); gw(p3, p0, r0);
      }
      done = true;
    }
    if (!done && rh > 0.3 && (roof === 3 || ((roof === 1 || roof === 2) && rings.length === 1 && outer.length <= 8))) {
      const apex = G.v(cx, peak, cz, rc, R0);   // pyramid / spire
      for (let q = 0; q < outer.length; q++) { const a = outer[q], b = outer[(q + 1) % outer.length], [nx, nz] = outward(a, b); G.tri(G.v(a[0], yt, a[1], rc, R0), G.v(b[0], yt, b[1], rc, R0), apex, nx, 0.6, nz); }
      done = true;
    }
    if (!done && rh > 0.3 && (roof === 4 || roof === 5)) {
      // Dome or onion: a lathe over the centroid, with a flat collar under it.
      flatCap(G, rings, yt, shade(rc, 0.8), R0);
      let rad = Infinity; for (let q = 0; q < outer.length; q++) { const a = outer[q], b = outer[(q + 1) % outer.length], dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((cx - a[0]) * dx + (cz - a[1]) * dz) / l2)); rad = Math.min(rad, Math.hypot(a[0] + t * dx - cx, a[1] + t * dz - cz)); }
      rad = Math.max(rad, 0.8);
      const prof = roof === 4 ? [[1, 0], [0.97, 0.22], [0.87, 0.45], [0.7, 0.65], [0.48, 0.82], [0.22, 0.95], [0, 1]] : [[0.75, 0], [1.05, 0.2], [1.1, 0.35], [0.9, 0.55], [0.5, 0.75], [0.18, 0.9], [0, 1]];
      const seg = 12, ids = prof.map(([pr, ph]) => Array.from({ length: seg }, (_, s) => G.v(cx + Math.cos(s / seg * 6.283) * rad * pr, yt + ph * rh, cz + Math.sin(s / seg * 6.283) * rad * pr, rc, R0)));
      for (let a = 0; a < prof.length - 1; a++) for (let s = 0; s < seg; s++) {
        const s2 = (s + 1) % seg, ang = (s + 0.5) / seg * 6.283, nx = Math.cos(ang), nz = Math.sin(ang), ny = (prof[a][0] - prof[a + 1][0]) * rad / Math.max(0.01, (prof[a + 1][1] - prof[a][1]) * rh);
        G.tri(ids[a][s], ids[a][s2], ids[a + 1][s2], nx, ny, nz); if (a < prof.length - 2) G.tri(ids[a][s], ids[a + 1][s2], ids[a + 1][s], nx, ny, nz);
      }
      done = true;
    }
    if (!done && rh > 0.3) {
      // Everything else pitched: a band of roof sloping in from every wall, flat on top (Prague's courtyard blocks).
      let d = Math.min(rh * 1.2, 4.5);
      for (let tries = 0; tries < 3 && !done; tries++, d *= 0.5) {
        const inner = rings.map(r => inset(r, d, outward));
        const ok = inner.every((r, q) => { const a0 = signedArea(rings[q]), a1 = signedArea(r); return Math.sign(a0) === Math.sign(a1) && Math.abs(a1) > Math.abs(a0) * (q ? 1.0 : 0.12) && !selfCrosses(r); });
        if (!ok) continue;
        const ph = yt + rh * (d / Math.min(rh * 1.2, 4.5));
        rings.forEach((r, q) => { const ir = inner[q]; for (let s = 0; s < r.length; s++) { const a = r[s], b = r[(s + 1) % r.length], ia = ir[s], ib = ir[(s + 1) % r.length], [nx, nz] = outward(a, b);
          const A = G.v(a[0], yt, a[1], rc, R0), B = G.v(b[0], yt, b[1], rc, R0), C = G.v(ib[0], ph, ib[1], rc, R0), D = G.v(ia[0], ph, ia[1], rc, R0); G.tri(A, B, C, nx, 1, nz); G.tri(A, C, D, nx, 1, nz); } });
        flatCap(G, inner, ph, shade(rc, 0.88), R0);
        done = true;
      }
    }
    if (!done) flatCap(G, rings, yt, rc, R0);
    if (minH < 2.5 && kind !== 4) feet.push(outer);
    nBuild++;
  }
  for (const G of tiles.values()) { if (!G.n) continue; const mesh = G.mesh(bMat); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); }
  await yieldUI();

  // ---------------------------------------------------------------- roads, bridges, rails
  say('Laying the streets…');
  const RG = new Geo('rd'), rMat = flatMat('road');
  const ROADCOL = ['#545459', '#56565a', '#5a595c', '#5f5e60', '#6b6966', '#b5a78e', '#cfc3a8', '#6d655c', '#58575a'];
  const DECK = [146, 138, 124], STONE = [156, 142, 120];
  const lift = [0.32, 0.3, 0.28, 0.26, 0.24, 0.22, 0.2, 0.18, 0.36];   // bigger roads sit a hair higher where they meet
  const deckAt = new Map(), dkey = (x, z) => `${Math.round(x / 3)},${Math.round(z / 3)}`;   // bridge decks, for the camera and the cars
  const deck = (x, z) => { let best = -Infinity; for (const [dx, dz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) { const v = deckAt.get(dkey(x + dx, z + dz)); if (v > best) best = v; } return best; };
  const net = { car: [], tram: [] };   // ways the traffic drives on, with their heights
  const smooth01 = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const quad = (G, A, B, y0a, y0b, y1a, y1b, col, nx, nz) => { const i0 = G.v(A[0], y0a, A[1], col, [0, 0, 0, 0]), i1 = G.v(B[0], y0b, B[1], col, [0, 0, 0, 0]), i2 = G.v(B[0], y1b, B[1], col, [0, 0, 0, 0]), i3 = G.v(A[0], y1a, A[1], col, [0, 0, 0, 0]); G.tri(i0, i1, i2, nx, 0, nz); G.tri(i0, i2, i3, nx, 0, nz); };
  const laid = [];
  for (const r of roads) {
    if (r.cls === 6 && !r.bridge) continue;
    // Resample to at most 6 m steps so the ribbon follows the ground.
    const pts = []; for (let q = 0; q < r.pts.length - 1; q++) { const a = r.pts[q], b = r.pts[q + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 6)); for (let s = 0; s < n; s++) pts.push([a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n]); }
    pts.push(r.pts.at(-1)); if (pts.length < 2) continue;
    const cum = [0]; for (let q = 1; q < pts.length; q++) cum.push(cum[q - 1] + Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]));
    const total = cum.at(-1) || 1, hA = H(...pts[0]), hB = H(...pts.at(-1));
    // Bridges over the river: at least 10 m over the riverbed, ramping up from a bank end (not from an end that is
    // itself over the water, where the bridge continues as the next way).
    let deckMin = -Infinity;
    if (r.bridge) { let lo = Infinity; for (const p of pts) if (isWater(p[0], p[1])) lo = Math.min(lo, HD(p[0], p[1])); if (lo < Infinity) deckMin = lo + 10; }
    const wetA = isWater(...pts[0]), wetB = isWater(...pts.at(-1));
    const ys = pts.map((p, q) => {
      const t = H(p[0], p[1]) + lift[r.cls]; if (!r.bridge) return t;
      const f = cum[q] / total, base = hA + (hB - hA) * f + 0.4 + Math.max(0, r.layer - 1) * 5;
      const ramp = Math.min(wetA ? 1 : smooth01(cum[q] / Math.min(40, total * 0.3)), wetB ? 1 : smooth01((total - cum[q]) / Math.min(40, total * 0.3)));
      return Math.max(t, deckMin > base ? base + (deckMin - base) * ramp : base);
    });
    if (r.bridge) pts.forEach((p, q) => { const a = pts[Math.max(0, q - 1)], b = pts[Math.min(pts.length - 1, q + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      for (const o of [-0.7, 0, 0.7]) { const k = dkey(p[0] - dz / l * r.w / 2 * o, p[1] + dx / l * r.w / 2 * o); deckAt.set(k, Math.max(deckAt.get(k) ?? -Infinity, ys[q] - lift[r.cls])); } });
    if (r.cls <= 3) net.car.push({ pts, ys, cum, total, hw: r.w / 2, oneway: r.oneway, name: r.name, cls: r.cls });
    if (r.cls === 8) net.tram.push({ pts, ys, cum, total, hw: 0, oneway: 0, name: r.name, cls: 8 });
    laid.push([r, pts, ys, cum]);
  }
  // Second pass, now that every deck is known: a parapet only where no other deck continues beside it
  // (a bridge carrying two carriageways and a tram track is one wide deck, not three walled ones).
  const deckBeside = (x, z) => deckAt.has(dkey(x, z));
  for (const [r, pts, ys, cum] of laid) {    const col = r.cls === 3 && r.sett ? [112, 106, 100] : r.cls === 4 && r.sett ? [118, 111, 104] : new THREE.Color(ROADCOL[r.cls]).toArray().map(v => v * 255);
    const hw = r.w / 2, type = r.cls === 7 ? 3 : r.cls === 8 ? 4 : r.cls <= 2 ? (r.oneway ? 2 : 1) : r.sett || r.cls === 5 ? 5 : 0;
    let prevL = -1, prevR = -1;
    for (let q = 0; q < pts.length; q++) {
      const a = pts[Math.max(0, q - 1)], b = pts[Math.min(pts.length - 1, q + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      const p = pts[q], y = ys[q];
      const L = RG.v(p[0] + nx * hw, y, p[1] + nz * hw, col, [cum[q], hw, hw, type]), R = RG.v(p[0] - nx * hw, y, p[1] - nz * hw, col, [cum[q], -hw, hw, type]);
      if (prevL >= 0) { RG.tri(prevL, prevR, R, 0, 1, 0); RG.tri(prevL, R, L, 0, 1, 0); }
      prevL = L; prevR = R;
      // Bridges: a deep deck edge with a parapet and, over the river or low ground, stone piers every 32 m.
      if (r.bridge && q > 0) {
        const pa = pts[q - 1], ya = ys[q - 1], dcol = r.cls === 5 || r.cls === 6 ? STONE : DECK;
        for (const side of [1, -1]) {
          if (deckBeside(p[0] + nx * (hw + 2.5) * side, p[1] + nz * (hw + 2.5) * side) || deckBeside(pa[0] + nx * (hw + 2.5) * side, pa[1] + nz * (hw + 2.5) * side)) continue;
          const A = [pa[0] + nx * hw * side, pa[1] + nz * hw * side], B = [p[0] + nx * hw * side, p[1] + nz * hw * side];
          quad(RG, A, B, ya - 2.4, y - 2.4, ya + 1.0, y + 1.0, dcol, nx * side, nz * side);
          const Ai = [A[0] - nx * 0.45 * side, A[1] - nz * 0.45 * side], Bi = [B[0] - nx * 0.45 * side, B[1] - nz * 0.45 * side];
          quad(RG, Ai, Bi, ya, y, ya + 1.0, y + 1.0, dcol.map(c => c * 0.9), -nx * side, -nz * side);
        }
        const under = HD(p[0], p[1]);
        if (y - under > 4 && Math.floor(cum[q] / 32) !== Math.floor(cum[q - 1] / 32)) {
          const pw = 2.4, ux = dx / l, uz = dz / l, half = hw + 0.6;
          // A pier with pointed cutwaters up- and downstream.
          const ring = [[0, -half - 2], [pw, -half], [pw, half], [0, half + 2], [-pw, half], [-pw, -half]].map(([t, sd]) => [p[0] + ux * t + nx * sd, p[1] + uz * t + nz * sd]);
          for (let c = 0; c < ring.length; c++) { const A = ring[c], B = ring[(c + 1) % ring.length], mx = (A[0] + B[0]) / 2 - p[0], mz = (A[1] + B[1]) / 2 - p[1];
            quad(RG, A, B, under - 3, under - 3, y - 2.4, y - 2.4, STONE, mx, mz); }
        }
      }
    }
  }
  const roadMesh = RG.mesh(rMat); roadMesh.receiveShadow = true; scene.add(roadMesh);
  await yieldUI();

  // ---------------------------------------------------------------- trees
  say('Planting the trees…');
  const tr = reader(tBuf), nT = tr.count;
  const leafy = [], pines = [];
  for (let k = 0; k < nT; k++) { const x = tr.i16() / 4, z = tr.i16() / 4, s = tr.u8(), kind = tr.u8(); (kind ? pines : leafy).push([x, z, 4 + s / 255 * 14]); }
  const treeMat = mat({ flatShading: !STUDIO }, 'tree', { roughness: 0.95 });
  const crown = STUDIO ? new THREE.IcosahedronGeometry(1, 2) : new THREE.IcosahedronGeometry(1, 0), cone = new THREE.ConeGeometry(1, 1, STUDIO ? 10 : 6), trunk = new THREE.CylinderGeometry(0.16, 0.24, 1, STUDIO ? 8 : 5);
  crown.translate(0, 0, 0); cone.translate(0, 0.5, 0); trunk.translate(0, 0.5, 0);
  const crowns = new THREE.InstancedMesh(crown, treeMat, leafy.length), cones = new THREE.InstancedMesh(cone, treeMat, pines.length), trunks = new THREE.InstancedMesh(trunk, treeMat, nT);
  const M4 = new THREE.Matrix4(), Q0 = new THREE.Quaternion(), S = new THREE.Vector3(), T = new THREE.Vector3(), C = new THREE.Color();
  const GREENS = ['#4b7533', '#5a8439', '#6a9240', '#527d37', '#77993f', '#456c30'].map(c => new THREE.Color(c));
  let ti = 0;
  leafy.forEach(([x, z, h], k) => {
    const y = H(x, z), r = h * (0.3 + rnd() * 0.08);
    Q0.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
    M4.compose(T.set(x, y + h - r * 0.85, z), Q0, S.set(r * (0.9 + rnd() * 0.2), r * 0.95, r * (0.9 + rnd() * 0.2))); crowns.setMatrixAt(k, M4);
    crowns.setColorAt(k, C.copy(GREENS[Math.floor(rnd() * GREENS.length)]));
    M4.compose(T.set(x, y - 0.3, z), Q0, S.set(1, h - r * 1.2, 1)); trunks.setMatrixAt(ti, M4); trunks.setColorAt(ti++, C.set('#5a4535'));
  });
  pines.forEach(([x, z, h], k) => {
    const y = H(x, z);
    M4.compose(T.set(x, y + h * 0.18, z), Q0.identity(), S.set(h * 0.22, h * 0.85, h * 0.22)); cones.setMatrixAt(k, M4);
    cones.setColorAt(k, C.set(rnd() < 0.5 ? '#2f5a33' : '#3a6638'));
    M4.compose(T.set(x, y - 0.3, z), Q0, S.set(1, h * 0.3, 1)); trunks.setMatrixAt(ti, M4); trunks.setColorAt(ti++, C.set('#4f3c2e'));
  });
  for (const im of [crowns, cones, trunks]) { im.castShadow = true; im.receiveShadow = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.instanceMatrix.needsUpdate = true; scene.add(im); }

  // ---------------------------------------------------------------- the drive (the route)
  const pts = path.points, step = path.step, total = path.total;
  const base = pts.map(p => H(p[0], p[1]));
  // Over bridges, ride on the deck that was built; fall back to a straight line from bank to bank.
  for (let q = 0; q < pts.length; q++) if (pts[q][2]) {
    let e = q; while (e < pts.length - 1 && pts[e + 1][2]) e++;
    const a = Math.max(0, q - 1), b = Math.min(pts.length - 1, e + 1);
    for (let k = q; k <= e; k++) { const d = deck(pts[k][0], pts[k][1]); base[k] = d > -Infinity ? d : Math.max(base[k], base[a] + (base[b] - base[a]) * (k - a) / Math.max(1, b - a) + 0.4); }
    q = e;
  }
  const ys = base.map((_, q) => { let s = 0, n = 0; for (let k = Math.max(0, q - 2); k <= Math.min(base.length - 1, q + 2); k++) { s += base[k]; n++; } return s / n; });
  function at(s) {
    s = Math.max(0, Math.min(total - 0.01, s));
    const f = s / step, i = Math.min(pts.length - 2, Math.floor(f)), t = f - i, a = pts[i], b = pts[i + 1];
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, y: ys[i] + (ys[i + 1] - ys[i]) * t, i };
  }
  // Which 20 m cells the route passes through: parked cars keep out of them.
  const nearRoute = new Set(); for (const p of pts) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) nearRoute.add(`${Math.floor(p[0] / 20) + dx},${Math.floor(p[1] / 20) + dz}`);
  const onRoute = (x, z) => nearRoute.has(`${Math.floor(x / 20)},${Math.floor(z / 20)}`);

  // Street lamps on both sides of the drive, every 30 m: the posts give the street its depth at eye level.
  const UP = new THREE.Vector3(0, 1, 0);
  {
    const lamps = [];
    for (let q = 2; q < pts.length - 2; q += 6) {
      if (pts[q][2]) continue;
      const a = pts[q - 1], b = pts[q + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      for (const side of [1, -1]) { const lx = pts[q][0] - dz / l * 7.5 * side, lz = pts[q][1] + dx / l * 7.5 * side;
        if (!isWater(lx, lz)) lamps.push([lx, lz, Math.atan2(dx, dz) + (side > 0 ? Math.PI / 2 : -Math.PI / 2)]); }
    }
    const post = new THREE.BoxGeometry(0.22, 7, 0.22); post.translate(0, 3.5, 0);
    const arm = new THREE.BoxGeometry(0.16, 0.16, 1.6); arm.translate(0, 6.9, 0.7);
    const head = new THREE.BoxGeometry(0.5, 0.35, 0.7); head.translate(0, 6.75, 1.4);
    const lampMat = mat({ color: 0x33393a, flatShading: true }, 'lamp', { roughness: 0.45, metalness: 0.6 });
    for (const gtry of [post, arm, head]) {
      const im = new THREE.InstancedMesh(gtry, lampMat, lamps.length);
      lamps.forEach(([x, z, rot], k) => { Q0.setFromAxisAngle(UP, rot); M4.compose(T.set(x, H(x, z) - 0.2, z), Q0, S.set(1, 1, 1)); im.setMatrixAt(k, M4); });
      im.castShadow = true; scene.add(im);
    }
  }

  // ---------------------------------------------------------------- vehicles and people: little box models
  say('Waking the city up…');
  // A model is a list of boxes [w, h, l, x, y, z, colour]; +z is forward. Colours of 'paint' parts are white so an
  // instance colour can repaint them.
  function model(parts) {
    const pos = [], col = [];
    for (const [w, h, l, x, y, z, c] of parts) {
      const cc = new THREE.Color(c), X = [x - w / 2, x + w / 2], Y = [y - h / 2, y + h / 2], Z = [z - l / 2, z + l / 2];
      const faces = [[[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]], [[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]],
        [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]]];
      for (const f of faces) for (const k of [0, 1, 2, 0, 2, 3]) { const [a, b, d] = f[k]; pos.push(X[a], Y[b], Z[d]); col.push(cc.r, cc.g, cc.b); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }
  const GLASS = '#3a4656', TYRE = '#1e1e20';
  const carParts = paint => [[1.78, 0.72, 4.3, 0, 0.68, 0, paint], [1.62, 0.52, 2.1, 0, 1.3, -0.25, GLASS], [1.56, 0.1, 1.95, 0, 1.6, -0.25, paint],
    [0.28, 0.64, 0.64, 0.8, 0.32, 1.35, TYRE], [0.28, 0.64, 0.64, -0.8, 0.32, 1.35, TYRE], [0.28, 0.64, 0.64, 0.8, 0.32, -1.35, TYRE], [0.28, 0.64, 0.64, -0.8, 0.32, -1.35, TYRE],
    [0.34, 0.14, 0.06, 0.6, 0.86, 2.16, '#fff3c8'], [0.34, 0.14, 0.06, -0.6, 0.86, 2.16, '#fff3c8'], [0.34, 0.14, 0.06, 0.6, 0.86, -2.16, '#c0261c'], [0.34, 0.14, 0.06, -0.6, 0.86, -2.16, '#c0261c']];
  const carGeo = model(carParts('#ffffff'));
  // Prague's T3 tram: red skirt, dark windows, cream band, grey roof and pantograph.
  const tramGeo = model([[2.48, 1.25, 14, 0, 1.0, 0, '#c42a20'], [2.5, 0.95, 13.4, 0, 2.08, 0, '#2b3340'], [2.48, 0.5, 14, 0, 2.8, 0, '#efe4c8'], [2.2, 0.28, 12.5, 0, 3.18, 0, '#8c8c88'],
    [0.08, 0.7, 1.6, 0, 3.65, 1.5, '#333'], [2.1, 0.5, 2.6, 0, 0.3, 4.6, '#222'], [2.1, 0.5, 2.6, 0, 0.3, -4.6, '#222'], [1.6, 0.4, 0.06, 0, 2.6, 7.01, '#2b3340'], [0.5, 0.3, 0.06, 0, 3.0, 7.02, '#f2c94c']]);
  const bodyGeo = model([[0.46, 0.68, 0.27, 0, 1.2, 0, '#ffffff'], [0.17, 0.84, 0.22, 0.11, 0.42, 0, '#777777'], [0.17, 0.84, 0.22, -0.11, 0.42, 0, '#777777'], [0.12, 0.6, 0.14, 0.3, 1.18, 0, '#ffffff'], [0.12, 0.6, 0.14, -0.3, 1.18, 0, '#ffffff']]);
  const headGeo = model([[0.24, 0.26, 0.24, 0, 1.69, 0, '#e2b896'], [0.26, 0.08, 0.26, 0, 1.84, 0, '#4a3628']]);
  const objMat = mat({ vertexColors: true, flatShading: true }, 'obj', { roughness: 0.42, metalness: 0.1 });
  const PAINT = ['#c8c8c4', '#2c2f36', '#e9e7e1', '#9a1f1f', '#26496e', '#4e5a63', '#7b7f84', '#1d5c3a', '#d4a52c', '#6a1e2e', '#b7b0a2', '#f0f0ec'].map(c => new THREE.Color(c));
  const CLOTHES = ['#2d3a55', '#5a2f2f', '#2f4a3a', '#7d6b4f', '#3a3a3e', '#a33b2a', '#c9b38a', '#4f6b8a', '#6e3d5c', '#d9d4c8', '#1f2a30'].map(c => new THREE.Color(c));
  const placeRot = (im, k, x, y, z, rot, pitch = 0) => { Q0.setFromEuler(new THREE.Euler(pitch, rot, 0, 'YXZ')); M4.compose(T.set(x, y, z), Q0, S.set(1, 1, 1)); im.setMatrixAt(k, M4); };

  // The road network: way ends that meet, so traffic can turn from one way into the next.
  const ends = new Map(), ekey = (p) => `${Math.round(p[0])},${Math.round(p[1])}`;
  for (const kind of ['car', 'tram']) for (const w of net[kind]) for (const e of [0, 1]) { const k = kind + ekey(e ? w.pts.at(-1) : w.pts[0]); if (!ends.has(k)) ends.set(k, []); ends.get(k).push([w, e]); }
  const cellOf = (x, z) => `${Math.floor(x / 200)},${Math.floor(z / 200)}`, wayCells = { car: new Map(), tram: new Map() };
  for (const kind of ['car', 'tram']) for (const w of net[kind]) { const m = w.pts[Math.floor(w.pts.length / 2)], k = cellOf(...m); if (!wayCells[kind].has(k)) wayCells[kind].set(k, []); wayCells[kind].get(k).push(w); }
  function wayPoint(w, d) {   // position, height and heading at distance d along a way
    d = Math.max(0, Math.min(w.total, d));
    let lo = 0, hi = w.cum.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (w.cum[mid] <= d) lo = mid; else hi = mid; }
    const t = (d - w.cum[lo]) / ((w.cum[hi] - w.cum[lo]) || 1), a = w.pts[lo], b = w.pts[hi];
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, y: w.ys[lo] + (w.ys[hi] - w.ys[lo]) * t, fx: (b[0] - a[0]) / ((w.cum[hi] - w.cum[lo]) || 1), fz: (b[1] - a[1]) / ((w.cum[hi] - w.cum[lo]) || 1) };
  }
  function spawn(kind, ag, cx, cz, range) {
    for (let tries = 0; tries < 12; tries++) {
      const list = wayCells[kind].get(cellOf(cx + (rnd() - 0.5) * 2 * range, cz + (rnd() - 0.5) * 2 * range));
      if (!list || !list.length) continue;
      const w = list[Math.floor(rnd() * list.length)];
      if (w.total < 15) continue;
      ag.w = w; ag.d = rnd() * w.total; ag.dir = w.oneway || rnd() < 0.5 ? 1 : -1; ag.trail = []; return true;
    }
    return false;
  }
  function advance(kind, ag, dist) {
    ag.d += ag.dir * dist;
    for (let guard = 0; guard < 4 && (ag.d < 0 || ag.d > ag.w.total); guard++) {
      const end = ag.d > ag.w.total ? 1 : 0, over = end ? ag.d - ag.w.total : -ag.d, here = end ? ag.w.pts.at(-1) : ag.w.pts[0];
      const options = (ends.get(kind + ekey(here)) || []).filter(([w, e]) => w !== ag.w && w.total > 4 && !(w.oneway && e === 1));
      if (!options.length) { if (ag.w.oneway) return false; ag.dir = -ag.dir; ag.d = end ? ag.w.total - over : over; continue; }
      const [w, e] = options[Math.floor(rnd() * options.length)];
      ag.w = w; ag.dir = e === 0 ? 1 : -1; ag.d = e === 0 ? over : w.total - over;
    }
    return true;
  }
  const lanePos = (ag, back = 0) => {
    const p = wayPoint(ag.w, ag.d - ag.dir * back), fx = p.fx * ag.dir, fz = p.fz * ag.dir, off = ag.w.oneway || ag.w.cls === 8 ? 0 : Math.min(ag.w.hw * 0.5, 1.9);
    return { x: p.x - fz * off, z: p.z + fx * off, y: p.y, rot: Math.atan2(fx, fz) };
  };
  const NCARS = LITE ? 90 : 220, NTRAMS = LITE ? 10 : 18;
  const cars = new THREE.InstancedMesh(carGeo, objMat, NCARS), carAgents = [];
  for (let k = 0; k < NCARS; k++) { carAgents.push({ v: (24 + rnd() * 22) / 3.6, w: null }); cars.setColorAt(k, PAINT[Math.floor(rnd() * PAINT.length)]); placeRot(cars, k, 0, -999, 0, 0); }
  cars.castShadow = true; cars.receiveShadow = true; cars.frustumCulled = false; scene.add(cars);
  const trams = new THREE.InstancedMesh(tramGeo, objMat, NTRAMS * 2), tramAgents = [];
  for (let k = 0; k < NTRAMS; k++) tramAgents.push({ v: (26 + rnd() * 10) / 3.6, w: null, trail: [] });
  for (let k = 0; k < NTRAMS * 2; k++) { placeRot(trams, k, 0, -999, 0, 0); trams.setColorAt(k, C.set('#ffffff')); }
  trams.castShadow = true; trams.frustumCulled = false; scene.add(trams);
  function trailAt(tr, back) {   // a point `back` metres behind the head of a trail
    let acc = 0;
    for (let k = tr.length - 1; k > 0; k--) { const a = tr[k], b = tr[k - 1], l = Math.hypot(a[0] - b[0], a[2] - b[2]); if (acc + l >= back) { const t = (back - acc) / (l || 1); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; } acc += l; }
    return tr[0];
  }
  function moveTram(ag, dist) {
    if (!advance('tram', ag, dist)) return false;
    const p = lanePos(ag), last = ag.trail.at(-1);
    if (!last || Math.hypot(p.x - last[0], p.z - last[2]) > 0.8) { ag.trail.push([p.x, p.y, p.z]); if (ag.trail.length > 90) ag.trail.shift(); }
    return true;
  }

  // Parked cars along the side streets (never on the route itself, where the camera drives).
  const parked = [];
  for (const r of roads) {
    if ((r.cls !== 3 && r.cls !== 4) || r.bridge || r.w < 5 || parked.length > (LITE ? 1800 : 4500)) continue;
    const P0 = r.pts; let acc = 0;
    for (let q = 0; q < P0.length - 1; q++) {
      const a = P0[q], b = P0[q + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), fx = (b[0] - a[0]) / (L || 1), fz = (b[1] - a[1]) / (L || 1);
      for (let d = 8; d < L - 8; d += 6.2) for (const side of r.w >= 7 ? [1, -1] : [1]) {
        if (rnd() > 0.55) continue;
        const off = (r.w / 2 - 1.05) * side, x = a[0] + fx * d - fz * off, z = a[1] + fz * d + fx * off;
        if (onRoute(x, z) || isWater(x, z)) continue;
        parked.push([x, z, Math.atan2(fx, fz) + (rnd() < 0.5 ? 0 : Math.PI)]);
      }
      acc += L;
    }
  }
  const parkedMesh = new THREE.InstancedMesh(carGeo, objMat, Math.max(1, parked.length)); parkedMesh.setColorAt(0, PAINT[0]);
  parked.forEach(([x, z, rot], k) => { placeRot(parkedMesh, k, x, H(x, z) + 0.22, z, rot); parkedMesh.setColorAt(k, PAINT[Math.floor(rnd() * PAINT.length)]); });
  parkedMesh.castShadow = true; parkedMesh.receiveShadow = true; scene.add(parkedMesh);

  // People: strolling on the squares and pedestrian streets, and along the footpaths.
  const people = [];
  const PCAP = LITE ? 900 : 2400;
  const polyArea = r => Math.abs(signedArea(r));
  for (const rings of paveds) {
    const o = rings[0]; let n = Math.min(60, Math.round(polyArea(o) / 140));
    let b = [1e9, 1e9, -1e9, -1e9]; for (const [x, z] of o) b = [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)];
    for (let t = 0; t < n * 5 && n > 0 && people.length < PCAP; t++) { const p = [b[0] + rnd() * (b[2] - b[0]), b[1] + rnd() * (b[3] - b[1])]; if (inPoly(p, o)) { people.push([p[0], p[1], rnd() * 6.28, 1.5 + rnd() * 4, 0.5 + rnd() * 0.6, rnd() * 6.28]); n--; } }
  }
  for (const r of roads) {
    if (r.cls !== 6 || people.length >= PCAP) continue;
    for (let q = 0; q < r.pts.length - 1; q++) { const a = r.pts[q], b = r.pts[q + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let d = rnd() * 25; d < L; d += 25) if (rnd() < 0.45 && people.length < PCAP) { const t = d / L; people.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[0] - a[0], b[1] - a[1]), 3 + rnd() * 6, 0.6 + rnd() * 0.5, rnd() * 6.28]); } }
  }
  const bodies = new THREE.InstancedMesh(bodyGeo, objMat, Math.max(1, people.length)), heads = new THREE.InstancedMesh(headGeo, objMat, Math.max(1, people.length));
  people.forEach((p, k) => { bodies.setColorAt(k, CLOTHES[Math.floor(rnd() * CLOTHES.length)]); heads.setColorAt(k, C.set('#ffffff')); });
  if (!people.length) { bodies.setColorAt(0, C.set('#ffffff')); heads.setColorAt(0, C.set('#ffffff')); }
  bodies.castShadow = true; scene.add(bodies, heads); bodies.frustumCulled = heads.frustumCulled = false;

  // Your car: a red hatchback that rides along the route, or goes anywhere in free-drive mode.
  const myCar = new THREE.Mesh(model(carParts('#b8291f')), mat({ vertexColors: true, flatShading: true }, 'mycar', { roughness: 0.3, metalness: 0.15 })); myCar.castShadow = true; scene.add(myCar);
  // Where the buildings stand, at 2 m, so the car stops at walls instead of driving through them.
  const OCC = 2, ow = Math.ceil((N.x1 - N.x0) / OCC), oh = Math.ceil((N.z1 - N.z0) / OCC);
  const occCv = document.createElement('canvas'); occCv.width = ow; occCv.height = oh;
  const oc = occCv.getContext('2d'); oc.fillStyle = '#000';
  for (const r of feet) { polyPath(oc, [r], ([x, z]) => [(x - N.x0) / OCC, (z - N.z0) / OCC]); oc.fill(); }
  const occ = oc.getImageData(0, 0, ow, oh).data; feet.length = 0;
  const blocked = (x, z) => { const i = Math.floor((x - N.x0) / OCC), j = Math.floor((z - N.z0) / OCC); return i < 0 || j < 0 || i >= ow || j >= oh || occ[(j * ow + i) * 4 + 3] > 128; };
  // Nearest named road, for the street name while driving freely.
  const segCells = new Map();
  for (const r of roads) if (r.name && r.cls <= 6) for (let q = 0; q < r.pts.length - 1; q++) { const a = r.pts[q], k = `${Math.floor(a[0] / 40)},${Math.floor(a[1] / 40)}`; if (!segCells.has(k)) segCells.set(k, []); segCells.get(k).push([a, r.pts[q + 1], r.name]); }
  function streetAt(x, z) {
    let best = null, bd = 30;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const [a, b, name] of segCells.get(`${Math.floor(x / 40) + dx},${Math.floor(z / 40) + dz}`) || []) {
      const ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / l2)), d = Math.hypot(a[0] + ex * t - x, a[1] + ez * t - z);
      if (d < bd) { bd = d; best = name; }
    }
    return best;
  }

  // ---------------------------------------------------------------- views and state
  const VIEWS = ['street', 'car', 'drone', 'bird'];
  let view = Math.max(0, VIEWS.indexOf(P.get('view') || 'street'));
  let s = Math.max(0, Math.min(total - 1, +(P.get('m') || 0) || (+(P.get('km') || 0) * 1000)));
  let kmh = P.has('paused') ? 0 : +(P.get('speed') || 32), paused = P.has('paused');
  const drive = { on: false, x: 0, z: 0, y: 0, h: 0, v: 0, pitch: 0 };
  let lookYaw = 0;
  const keys = new Set();

  // ---------------------------------------------------------------- HUD
  const hud = { street: $('street'), place: $('place'), km: $('km'), lm: $('lm'), speed: $('speed'), help: $('help') };
  const viewBtns = [...document.querySelectorAll('#views button[data-view]')], driveBtn = $('drive');
  const setView = v => { view = v; viewBtns.forEach((b, k) => b.setAttribute('aria-pressed', k === v)); };
  viewBtns.forEach((b, k) => b.addEventListener('click', () => setView(k))); setView(view);
  function setDrive(on) {
    if (on && !drive.on) {   // leave the route where you are, in the right-hand lane
      const p = at(s), p2 = at(s + 4), hx = p2.x - p.x, hz = p2.z - p.z, hl = Math.hypot(hx, hz) || 1;
      Object.assign(drive, { on: true, x: p.x - hz / hl * 1.8, z: p.z + hx / hl * 1.8, y: p.y, h: Math.atan2(hx, hz), v: Math.max(0, kmh / 3.6), pitch: 0 });
      if (view === 0) setView(1);
    } else if (!on) drive.on = false;
    driveBtn.setAttribute('aria-pressed', drive.on);
    hud.help.textContent = drive.on ? 'W A S D or arrows: drive · Q/E or drag: look · F: back to the tour' : 'Scroll or drag: speed · Q/E or drag: look · F: drive · V: view · M: map';
  }
  driveBtn.addEventListener('click', () => setDrive(!drive.on));
  setDrive(P.has('drive'));
  function placeAt(s) { let best = null; for (const [ps, name] of path.places) if (Math.abs(ps - s) < 900 && (!best || Math.abs(ps - s) < Math.abs(best[0] - s))) best = [ps, name]; return best ? best[1] : 'Praha'; }
  const mapCv = $('map'), mctx = mapCv.getContext('2d');
  function drawMap(x, z) {
    const W = mapCv.width, Hh = mapCv.height, sc = Math.min(W / (N.x1 - N.x0), Hh / (N.z1 - N.z0));
    mctx.fillStyle = '#e9e2d0'; mctx.fillRect(0, 0, W, Hh);
    const f = ([x, z]) => [(x - N.x0) * sc, (z - N.z0) * sc];
    mctx.fillStyle = '#7ea0c0'; for (const rings of waterPolys) { polyPath(mctx, rings, f); mctx.fill('evenodd'); }
    mctx.strokeStyle = '#b8402c'; mctx.lineWidth = 2; polyPath(mctx, [pts.map(q => [q[0], q[1]])], f); mctx.stroke();
    const [a, b] = f([x, z]); mctx.fillStyle = '#1d1d1d'; mctx.fillRect(a - 3, b - 3, 6, 6);
  }

  // ---------------------------------------------------------------- input
  const bump = d => { kmh = Math.max(-120, Math.min(260, kmh + d)); paused = false; };
  addEventListener('wheel', e => { e.preventDefault(); if (!drive.on) bump(-e.deltaY * 0.06); }, { passive: false });
  // Mouse: drag to look around. Touch: drag sideways to look, up and down for speed (or, driving, to steer and accelerate).
  let drag = null;
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, axis: e.pointerType === 'mouse' ? 'look' : null, touch: e.pointerType !== 'mouse' }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    if (drive.on && drag.touch) return;   // read as a joystick in the loop
    if (!drag.axis && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8) drag.axis = Math.abs(e.clientX - drag.x0) > Math.abs(e.clientY - drag.y0) ? 'look' : 'speed';
    if (drag.axis === 'look') lookYaw = Math.max(-2.8, Math.min(2.8, lookYaw - dx * 0.006));
    else if (drag.axis === 'speed') bump(-dy * 0.35);
  });
  const endDrag = () => { drag = null; };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
  addEventListener('keydown', e => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    keys.add(k);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
    if (!drive.on && k === 'ArrowUp') bump(8); else if (!drive.on && k === 'ArrowDown') bump(-8);
    else if (k === ' ') { if (drive.on) drive.v *= 0.2; else paused = !paused; }
    else if (k === 'v') setView((view + 1) % VIEWS.length);
    else if (k === 'f') setDrive(!drive.on);
    else if (k === 'm') mapCv.hidden = !mapCv.hidden;
    else if (k >= '1' && k <= '4') setView(+k - 1);
  });
  addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  addEventListener('blur', () => keys.clear());

  // ---------------------------------------------------------------- size: a low-resolution frame, scaled up with hard pixels
  function resize() {
    const px = STUDIO ? 1 : Math.max(2, Math.round(innerHeight / (LITE ? 220 : 270))), w = Math.ceil(innerWidth / px), h = Math.ceil(innerHeight / px);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  // ---------------------------------------------------------------- loop
  const look = new THREE.Vector3(), camOff = new THREE.Vector3(), lookOff = new THREE.Vector3(), anchor = new THREE.Vector3();
  let first = true, last = performance.now(), frames = 0, tSim = 0;
  const rotY = (x, z, a) => [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
  function driveStep(dt) {
    const up = keys.has('w') || keys.has('ArrowUp'), down = keys.has('s') || keys.has('ArrowDown');
    let steer = (keys.has('a') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('d') || keys.has('ArrowRight') ? 1 : 0);
    let throttle = (up ? 1 : 0) - (down ? 1 : 0);
    if (drag && drag.touch) { throttle = Math.max(-1, Math.min(1, -(drag.y - drag.y0) / 70)); steer = Math.max(-1, Math.min(1, -(drag.x - drag.x0) / 70)); }
    const D = drive;
    if (throttle) D.v += throttle * (throttle * D.v < 0 ? 14 : 6.5) * dt; else D.v *= Math.exp(-dt * 0.7);
    D.v = Math.max(-7, Math.min(30, D.v)) * Math.exp(-dt * 0.05);
    D.h += steer * 1.7 * Math.max(-1, Math.min(1, D.v / 7)) * dt;
    const fx = Math.sin(D.h), fz = Math.cos(D.h), nx = D.x + fx * D.v * dt, nz = D.z + fz * D.v * dt, sx = Math.sign(D.v) || 1;
    // Bump into walls: test the nose (or tail) corners.
    const hit = [[0.85, 2.2], [-0.85, 2.2], [0, 2.3]].some(([o, l]) => blocked(nx + fz * o + fx * l * sx, nz - fx * o + fz * l * sx));
    if (hit) D.v = -D.v * 0.25; else { D.x = nx; D.z = nz; }
    const dk = deck(D.x, D.z), g = H(D.x, D.z), ty = dk > -Infinity && Math.abs(dk - D.y) < 2.5 ? dk : g;
    D.y += (ty - D.y) * Math.min(1, dt * 10);
    const gF = H(D.x + fx * 2, D.z + fz * 2), gB = H(D.x - fx * 2, D.z - fz * 2);
    D.pitch += (Math.atan2(gB - gF, 4) * (ty === g ? 1 : 0) - D.pitch) * Math.min(1, dt * 6);
  }
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; tSim += dt;
    // Where am I, and which way am I facing?
    let px, py, pz, fx, fz, carRot, carPitch = 0;
    if (drive.on) { driveStep(dt); px = drive.x; py = drive.y; pz = drive.z; fx = Math.sin(drive.h); fz = Math.cos(drive.h); carRot = drive.h; carPitch = drive.pitch; }
    else {
      if (!paused) { s += kmh / 3.6 * dt; if (s >= total) s -= total; if (s < 0) s += total; }
      const p = at(s), p2 = at(s + 5), hx = p2.x - p.x, hz = p2.z - p.z, hl = Math.hypot(hx, hz) || 1;
      fx = hx / hl; fz = hz / hl; px = p.x - fz * 1.8; pz = p.z + fx * 1.8; py = p.y; carRot = Math.atan2(fx, fz);
    }
    // Look around: Q/E or a drag turns the head; it drifts back to the road when you let go.
    const qe = (keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0);
    if (qe) lookYaw = Math.max(-2.8, Math.min(2.8, lookYaw + qe * 1.8 * dt)); else if (!drag || drag.axis !== 'look') lookYaw *= Math.exp(-dt * 1.6);
    myCar.position.set(px, py + 0.22, pz); myCar.rotation.set(0, 0, 0); myCar.rotation.order = 'YXZ'; myCar.rotation.y = carRot; myCar.rotation.x = carPitch;
    myCar.visible = view !== 0;
    // The camera, as offsets from the car, eased so that switching views glides.
    const V = VIEWS[view], ahead = !drive.on ? at(s + (view === 2 ? 150 : view === 3 ? 620 : 26)) : null;
    let co, lo;   // camera offset and look offset in world space, relative to the car
    const [rfx, rfz] = rotY(fx, fz, lookYaw);
    if (V === 'street') { co = [fx * 0.3, 1.45, fz * 0.3]; lo = [rfx * 30, 1.2, rfz * 30]; }
    else if (V === 'car') { co = [-rfx * 8.5, 3.1, -rfz * 8.5]; lo = [fx * 10, 1.2, fz * 10]; }
    else if (V === 'drone') { co = [-rfx * 30, 42, -rfz * 30]; lo = [rfx * 140, 4, rfz * 140]; }
    else { co = [-rfx * 160, 260, -rfz * 160]; lo = [rfx * 520, 0, rfz * 520]; }
    // Street view on the route: aim at the road ahead (smoother on bends than the car's own heading).
    if (V === 'street' && ahead && Math.abs(lookYaw) < 0.02) lo = [ahead.x - fz * 1.8 - px, ahead.y + 1.2 - py, ahead.z + fx * 1.8 - pz];
    anchor.set(px, py, pz);
    const k = first ? 1 : 1 - Math.exp(-dt * 4);
    camOff.x += (co[0] - camOff.x) * k; camOff.y += (co[1] - camOff.y) * k; camOff.z += (co[2] - camOff.z) * k;
    lookOff.x += (lo[0] - lookOff.x) * k; lookOff.y += (lo[1] - lookOff.y) * k; lookOff.z += (lo[2] - lookOff.z) * k;
    first = false;
    camera.position.copy(anchor).add(camOff);
    // Never under the ground (the chase camera on a hill).
    const gcam = Math.max(H(camera.position.x, camera.position.z), deck(camera.position.x, camera.position.z)) + 0.6; if (camera.position.y < gcam) camera.position.y = gcam;
    look.copy(anchor).add(lookOff); camera.lookAt(look);
    const fov = V === 'street' ? 68 : V === 'car' ? 66 : V === 'drone' ? 62 : 55;
    if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * k; camera.updateProjectionMatrix(); }
    sky.position.copy(camera.position); sky.material.uniforms.time.value = now / 1000;

    // Traffic, trams and people near the camera.
    const cx = camera.position.x, cz = camera.position.z, range = V === 'bird' ? 1100 : 650;
    carAgents.forEach((ag, k2) => {
      if (!ag.w || Math.hypot(ag.x - cx, ag.z - cz) > range * 1.3) { if (!spawn('car', ag, cx, cz, range)) return; }
      if (!advance('car', ag, ag.v * dt)) { ag.w = null; return; }
      const p = lanePos(ag); ag.x = p.x; ag.z = p.z; placeRot(cars, k2, p.x, p.y + 0.22, p.z, p.rot);
    });
    cars.instanceMatrix.needsUpdate = true;
    tramAgents.forEach((ag, k2) => {
      if (!ag.w || Math.hypot(ag.x - cx, ag.z - cz) > range * 1.4) { if (!spawn('tram', ag, cx, cz, range)) return; ag.trail = []; for (let i = 0; i < 45; i++) if (!moveTram(ag, 1)) break; }
      if (!moveTram(ag, ag.v * dt)) { ag.w = null; return; }
      const head = ag.trail.at(-1); ag.x = head[0]; ag.z = head[2];
      for (let c = 0; c < 2; c++) {   // two coupled cars, each laid between its own front and back on the track
        const F = trailAt(ag.trail, c * 15), B = trailAt(ag.trail, c * 15 + 14);
        placeRot(trams, k2 * 2 + c, (F[0] + B[0]) / 2, (F[1] + B[1]) / 2 + 0.05, (F[2] + B[2]) / 2, Math.atan2(F[0] - B[0], F[2] - B[2]));
      }
    });
    trams.instanceMatrix.needsUpdate = true;
    if (frames % 2 === 0) {
      people.forEach(([x, z, dir, amp, sp, ph], k2) => {
        const w = Math.sin(tSim * sp * 0.5 + ph), qx = x + Math.sin(dir) * amp * w, qz = z + Math.cos(dir) * amp * w;
        const rot = dir + (Math.cos(tSim * sp * 0.5 + ph) >= 0 ? 0 : Math.PI), y = H(qx, qz);
        placeRot(bodies, k2, qx, y, qz, rot); placeRot(heads, k2, qx, y, qz, rot);
      });
      bodies.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true;
    }

    // The sun's shadow box follows the camera, snapped to its texels so shadows do not shimmer.
    const R = V === 'street' ? 320 : V === 'car' ? 360 : V === 'drone' ? 650 : 1500, focus = new THREE.Vector3().lerpVectors(camera.position, look, 0.5), texel = 2 * R / SMAP;
    focus.x = Math.round(focus.x / texel) * texel; focus.z = Math.round(focus.z / texel) * texel;
    const sc = sun.shadow.camera; if (sc.right !== R) { sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 6000; sc.updateProjectionMatrix(); }
    sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(SUN, 2500);
    renderer.render(scene, camera);
    if (frames++ % 6 === 0) {
      if (drive.on) {
        hud.street.textContent = streetAt(px, pz) || ' '; hud.place.textContent = 'Free drive';
        hud.km.textContent = ''; hud.speed.textContent = `${Math.round(Math.abs(drive.v) * 3.6)} km/h${drive.v < -0.3 ? ' R' : ''}`; hud.lm.textContent = '';
      } else {
        const p = at(s), ni = pts[p.i][3];
        hud.street.textContent = ni >= 0 ? path.names[ni] : '';
        hud.place.textContent = placeAt(s);
        hud.km.textContent = `${(s / 1000).toFixed(2)} / ${(total / 1000).toFixed(1)} km`;
        hud.speed.textContent = paused ? 'paused' : `${Math.round(kmh)} km/h`;
        const lm = path.landmarks.filter(l => l.s > s - 60 && l.s < s + 260).sort((a, b) => Math.abs(a.s - s) - Math.abs(b.s - s))[0];
        hud.lm.textContent = lm ? (lm.side < 0 ? '◀ ' : '') + lm.name + (lm.side >= 0 ? ' ▶' : '') : '';
      }
      if (!mapCv.hidden) drawMap(px, pz);
    }
    window.__frames = frames;
    requestAnimationFrame(frame);
  }
  $('load').hidden = true;
  window.__ready = true; window.__stats = { buildings: nBuild, roads: roads.length, trees: nT, tiles: tiles.size, cars: NCARS, trams: NTRAMS, parked: parked.length, people: people.length };
  window.__keys = keys;   // lets the self-check press keys
  requestAnimationFrame(frame);
})().catch(e => { const l = document.getElementById('load'); l.hidden = false; l.textContent = 'Could not build the scene: ' + e.message; console.error(e); window.__error = e.message; });
