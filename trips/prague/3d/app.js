// Praha 3D: a pixel-art drive through real Prague. Plain three.js (r128, global THREE), no build step.
// Data (made by tools/praha3d/*.mjs): terrain-near.bin, terrain-far.bin (Float32 heights), buildings.bin, land.bin,
// roads.bin, trees.bin (int16 local metres at 1/4 m) and path.json (the drive, every 5 m).
// The scene is drawn at a low resolution and scaled up with hard pixels; every material ends with the same
// ordered dither and colour posterising, so terrain, buildings, trees and sky share one pixel-art palette.
(async function () {
  const $ = id => document.getElementById(id);
  const say = t => { $('load').textContent = t; };
  const P = new URLSearchParams(location.search);
  const get = async (f, bin) => { const r = await fetch(f); if (!r.ok) throw Error(`${f}: HTTP ${r.status}`); return bin ? r.arrayBuffer() : r.json(); };
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
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap;
  const scene = new THREE.Scene();
  const HORIZON = new THREE.Color('#d3dfe4'), ZENITH = new THREE.Color('#3f7fc4');
  scene.fog = new THREE.FogExp2(HORIZON, 1 / 8200);
  const camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.4, 45000);
  const SUN = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();   // late afternoon, from the south-west
  scene.add(new THREE.HemisphereLight(0xdfe9f2, 0x8a7d66, 0.62));
  const sun = new THREE.DirectionalLight(0xfff1d8, 0.78);
  const LITE = Math.min(innerWidth, innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4;   // phones: smaller shadows, chunkier pixels
  const SMAP = LITE ? 1024 : 2048;
  sun.castShadow = true; sun.shadow.mapSize.set(SMAP, SMAP); sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  // Every material: ordered dither + posterise at the end, so the whole frame shares one pixel palette.
  const PIX = `
    float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
    float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
    vec3 pixelate(vec3 c) { float b = bayer4(gl_FragCoord.xy) - 0.5; return floor(c * 22.0 + 0.5 + b * 0.9) / 22.0; }`;
  function patch(mat, kind) {
    mat.customProgramCacheKey = () => 'p3d-' + kind;
    mat.onBeforeCompile = sh => {
      if (kind === 'bld') {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 wall;\nvarying vec4 vWall;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWall = wall;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vWall;')
          .replace('#include <color_fragment>', `#include <color_fragment>
          {
            float u = vWall.x, v = vWall.y, style = floor(vWall.z / 1000.0), top = mod(vWall.z, 1000.0);
            if (style > 0.5) {
              float dist = length(vViewPosition);
              float fl = floor(v / 3.3), fv = fract(v / 3.3), col, fu, win = 0.0;
              if (style < 1.5) { col = floor(u / 2.9); fu = fract(u / 2.9);
                win = fl < 0.5 ? step(0.14, fu) * step(fu, 0.86) * step(0.12, fv) * step(fv, 0.74) : step(0.3, fu) * step(fu, 0.7) * step(0.28, fv) * step(fv, 0.8); }
              else if (style < 2.5) { col = floor(u / 4.6); fu = fract(u / 4.6); float fv2 = fract(v / 9.0);
                win = step(0.36, fu) * step(fu, 0.64) * step(0.22, fv2) * step(fv2, 0.86) * step(3.0, v); }
              else if (style < 3.5) { col = floor(u / 1.6); fu = fract(u / 1.6); win = step(0.08, fu) * step(fu, 0.92) * step(0.22, fv) * step(fv, 0.86); }
              else { col = floor(u / 6.0); fu = fract(u / 6.0); win = step(0.25, fu) * step(fu, 0.75) * step(0.55, fv) * step(fv, 0.8); }
              win *= step(v, top - 1.1) * step(0.0, v);
              float rnd = fract(sin(dot(vec2(col, fl), vec2(12.9898, 78.233))) * 43758.5453);
              vec3 glass = mix(vec3(0.17, 0.2, 0.26), vec3(0.42, 0.52, 0.62), rnd * 0.6);
              vec3 walled = diffuseColor.rgb;
              walled = mix(walled, walled * 0.8, step(top - 0.7, v) * step(v, top - 0.25));   // cornice line
              walled *= 0.82 + 0.18 * smoothstep(0.0, 3.5, v);                               // dirt and shade at the foot
              float fade = 1.0 - smoothstep(140.0, 520.0, dist);
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
  const flatMat = kind => patch(new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, shininess: 0, specular: 0x000000 }), kind);

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
          float body = step(0.6, c), core = step(0.68, fbm(uv + vec2(0.04, 0.05)));
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
  const lr = reader(lBuf), waterPolys = [];
  const polyPath = (ctx, rings, f) => { ctx.beginPath(); for (const r of rings) { r.forEach((p, k) => { const [a, b] = f(p); k ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.closePath(); } };
  for (let k = 0; k < lr.count; k++) {
    const cls = lr.u8(), nr = lr.u8(), rings = []; for (let q = 0; q < nr; q++) rings.push(lr.pts());
    g.fillStyle = LAND[cls]; polyPath(g, rings, toG); g.fill('evenodd');
    if (cls === 0) { waterPolys.push(rings); polyPath(m, rings, ([x, z]) => [(x - N.x0) / N.cell, (z - N.z0) / N.cell]); m.fill('evenodd'); }
  }
  // Roads: pavements under the urban roads and the footpaths are painted; the roads themselves are geometry.
  const rr = reader(rBuf), roads = [];
  for (let k = 0; k < rr.count; k++) { const cls = rr.u8(), fl = rr.u8(), w = rr.u8() / 4, layer = rr.i8(), pts = rr.pts(); roads.push({ cls, bridge: fl & 1, sett: fl & 2, oneway: fl & 4, w, layer, pts }); }
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const r of roads) if (r.cls === 6 && !r.bridge) { g.strokeStyle = '#d9cdb3'; g.lineWidth = Math.max(1, r.w / GPX); polyPath(g, [r.pts], toG); g.stroke(); }
  for (const r of roads) if (r.cls <= 4 && !r.bridge) { g.strokeStyle = '#cac1af'; g.lineWidth = (r.w + (r.cls <= 3 ? 6 : 2)) / GPX; polyPath(g, [r.pts], toG); g.stroke(); }
  // Grain: a little per-texel noise so grass, paving and water read as pixel texture rather than flat fills.
  const img = g.getImageData(0, 0, gw, gh), px = img.data;
  let seed = 7; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < px.length; i += 4) { const water = px[i + 2] > px[i] + 30; const nz = (rnd() - 0.5) * (water ? 10 : 16) + (water && rnd() < 0.03 ? 28 : 0); px[i] += nz; px[i + 1] += nz; px[i + 2] += nz; }
  g.putImageData(img, 0, 0);
  const groundTex = new THREE.CanvasTexture(ground);
  groundTex.magFilter = THREE.NearestFilter; groundTex.minFilter = THREE.LinearMipmapLinearFilter; groundTex.anisotropy = 4;
  const wmask = m.getImageData(0, 0, GN.w, GN.h).data;
  await yieldUI();

  // ---------------------------------------------------------------- terrain meshes
  say('Raising the hills…');
  // The river: terrain under water sits flat, a metre under the lowest bank around it.
  const drawn = GN.d.slice();
  for (let j = 0; j < GN.h; j++) for (let i = 0; i < GN.w; i++) if (wmask[(j * GN.w + i) * 4 + 3] > 100) {
    let lo = Infinity; for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < GN.w && b < GN.h) lo = Math.min(lo, GN.d[b * GN.w + a]); }
    drawn[j * GN.w + i] = lo - 1.2;
  }
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
  const nearMesh = new THREE.Mesh(terrainGeo(GN, drawn, true, false), patch(new THREE.MeshLambertMaterial({ map: groundTex }), 'ground'));
  nearMesh.receiveShadow = true; scene.add(nearMesh);
  const farMesh = new THREE.Mesh(terrainGeo(GF, GF.d, false, true), patch(new THREE.MeshLambertMaterial({ vertexColors: true }), 'far'));
  farMesh.receiveShadow = false; scene.add(farMesh);
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
  const STYLE = [1, 1, 2, 4, 0, 3];   // windows by kind: other, house, church, industrial, tower, modern
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
  let nBuild = 0;
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
    const wcol = wall, perim0 = (Math.abs(cx * 7.13 + cz * 3.71) % 50);
    for (const r of rings) {
      let u = perim0;
      for (let q = 0; q < r.length; q++) {
        const a = r[q], b = r[(q + 1) % r.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), [nx, nz] = outward(a, b);
        const st = len > 1.8 && top > 3.5 ? style : 0, ex = (uu, y) => [uu, y - (gref + minH), st * 1000 + Math.min(999, top), 0];
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
    nBuild++;
  }
  for (const G of tiles.values()) { if (!G.n) continue; const mesh = G.mesh(bMat); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); }
  await yieldUI();

  // ---------------------------------------------------------------- roads, bridges, rails
  say('Laying the streets…');
  const RG = new Geo('rd'), rMat = flatMat('road');
  const ROADCOL = ['#545459', '#56565a', '#5a595c', '#5f5e60', '#6b6966', '#b5a78e', '#cfc3a8', '#6d655c', '#58575a'];
  const DECK = [140, 132, 120];
  const lift = [0.32, 0.3, 0.28, 0.26, 0.24, 0.22, 0.2, 0.18, 0.36];   // bigger roads sit a hair higher where they meet
  for (const r of roads) {
    if (r.cls === 6 && !r.bridge) continue;
    // Resample to at most 6 m steps so the ribbon follows the ground.
    const pts = []; for (let q = 0; q < r.pts.length - 1; q++) { const a = r.pts[q], b = r.pts[q + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 6)); for (let s = 0; s < n; s++) pts.push([a[0] + (b[0] - a[0]) * s / n, a[1] + (b[1] - a[1]) * s / n]); }
    pts.push(r.pts.at(-1)); if (pts.length < 2) continue;
    const cum = [0]; for (let q = 1; q < pts.length; q++) cum.push(cum[q - 1] + Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]));
    const total = cum.at(-1) || 1, hA = H(...pts[0]), hB = H(...pts.at(-1));
    const ys = pts.map((p, q) => { const t = H(p[0], p[1]) + lift[r.cls]; return r.bridge ? Math.max(hA + (hB - hA) * cum[q] / total + 0.4 + Math.max(0, r.layer - 1) * 5, t) : t; });
    const col = r.cls === 3 && r.sett ? [112, 106, 100] : r.cls === 4 && r.sett ? [118, 111, 104] : new THREE.Color(ROADCOL[r.cls]).toArray().map(v => v * 255);
    const hw = r.w / 2, type = r.cls === 7 ? 3 : r.cls === 8 ? 4 : r.cls <= 2 ? (r.oneway ? 2 : 1) : r.sett || r.cls === 5 ? 5 : 0;
    let prevL = -1, prevR = -1;
    for (let q = 0; q < pts.length; q++) {
      const a = pts[Math.max(0, q - 1)], b = pts[Math.min(pts.length - 1, q + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      const p = pts[q], y = ys[q];
      const L = RG.v(p[0] + nx * hw, y, p[1] + nz * hw, col, [cum[q], hw, hw, type]), R = RG.v(p[0] - nx * hw, y, p[1] - nz * hw, col, [cum[q], -hw, hw, type]);
      if (prevL >= 0) { RG.tri(prevL, prevR, R, 0, 1, 0); RG.tri(prevL, R, L, 0, 1, 0); }
      prevL = L; prevR = R;
      // Bridges: a deck edge and, over low ground, piers every 30 m.
      if (r.bridge && r.cls <= 4 && q > 0) {
        const pa = pts[q - 1], ya = ys[q - 1], dcol = r.cls === 5 || r.cls === 6 ? [150, 136, 112] : DECK;
        for (const side of [1, -1]) {
          const ax = pa[0] + nx * hw * side, az = pa[1] + nz * hw * side, bx = p[0] + nx * hw * side, bz = p[1] + nz * hw * side;
          const i0 = RG.v(ax, ya - 1.6, az, dcol, [0, 0, 0, 0]), i1 = RG.v(bx, y - 1.6, bz, dcol, [0, 0, 0, 0]), i2 = RG.v(bx, y + 0.9, bz, dcol, [0, 0, 0, 0]), i3 = RG.v(ax, ya + 0.9, az, dcol, [0, 0, 0, 0]);
          RG.tri(i0, i1, i2, nx * side, 0, nz * side); RG.tri(i0, i2, i3, nx * side, 0, nz * side);
        }
        const under = H(p[0], p[1]);
        if (y - under > 4 && Math.floor(cum[q] / 30) !== Math.floor(cum[q - 1] / 30)) {
          const pw = 1.6, corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [p[0] + nx * hw * 0.8 * s + (dx / l) * pw * t, p[1] + nz * hw * 0.8 * s + (dz / l) * pw * t]);
          for (let c = 0; c < 4; c++) { const A = corners[c], B = corners[(c + 1) % 4], ex = B[0] - A[0], ez = B[1] - A[1], el = Math.hypot(ex, ez) || 1;
            const i0 = RG.v(A[0], under - 3, A[1], dcol, [0, 0, 0, 0]), i1 = RG.v(B[0], under - 3, B[1], dcol, [0, 0, 0, 0]), i2 = RG.v(B[0], y - 1.6, B[1], dcol, [0, 0, 0, 0]), i3 = RG.v(A[0], y - 1.6, A[1], dcol, [0, 0, 0, 0]);
            const cxp = (corners[0][0] + corners[2][0]) / 2, czp = (corners[0][1] + corners[2][1]) / 2, mx = (A[0] + B[0]) / 2 - cxp, mz = (A[1] + B[1]) / 2 - czp;
            RG.tri(i0, i1, i2, mx, 0, mz); RG.tri(i0, i2, i3, mx, 0, mz); }
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
  const treeMat = patch(new THREE.MeshPhongMaterial({ flatShading: true, shininess: 0, specular: 0x000000 }), 'tree');
  const crown = new THREE.IcosahedronGeometry(1, 0), cone = new THREE.ConeGeometry(1, 1, 6), trunk = new THREE.CylinderGeometry(0.16, 0.24, 1, 5);
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

  // ---------------------------------------------------------------- the drive
  const pts = path.points, step = path.step, total = path.total;
  const base = pts.map(p => H(p[0], p[1]));
  // Over bridges, run straight from bank to bank instead of following the riverbed.
  for (let q = 0; q < pts.length; q++) if (pts[q][2]) {
    let e = q; while (e < pts.length - 1 && pts[e + 1][2]) e++;
    const a = Math.max(0, q - 1), b = Math.min(pts.length - 1, e + 1);
    for (let k = q; k <= e; k++) base[k] = Math.max(base[k], base[a] + (base[b] - base[a]) * (k - a) / Math.max(1, b - a) + 0.4);
    q = e;
  }
  const ys = base.map((_, q) => { let s = 0, n = 0; for (let k = Math.max(0, q - 3); k <= Math.min(base.length - 1, q + 3); k++) { s += base[k]; n++; } return s / n; });
  function at(s) {
    s = Math.max(0, Math.min(total - 0.01, s));
    const f = s / step, i = Math.min(pts.length - 2, Math.floor(f)), t = f - i, a = pts[i], b = pts[i + 1];
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, y: ys[i] + (ys[i + 1] - ys[i]) * t, i };
  }
  const VIEWS = [{ name: 'Street', eye: 1.6, ahead: 26, aim: 0.6, fov: 68, shadow: 320 }, { name: 'Drone', eye: 42, ahead: 150, aim: 8, fov: 62, shadow: 650 }, { name: 'Bird', eye: 260, ahead: 620, aim: 0, fov: 55, shadow: 1500 }];
  let view = Math.max(0, Math.min(2, +(P.get('view') ?? 0) || ['street', 'drone', 'bird'].indexOf(P.get('view')) || 0));
  if (P.get('view') === 'drone') view = 1; if (P.get('view') === 'bird') view = 2;
  let s = Math.max(0, Math.min(total - 1, +(P.get('m') || 0) || (+(P.get('km') || 0) * 1000)));
  let kmh = P.has('paused') ? 0 : +(P.get('speed') || 32), paused = P.has('paused');
  const cur = { eye: VIEWS[view].eye, ahead: VIEWS[view].ahead, aim: VIEWS[view].aim, fov: VIEWS[view].fov };

  // Street lamps on both sides of the drive, every 32 m: the posts give the street its depth at eye level.
  {
    const lamps = [];
    for (let q = 2; q < pts.length - 2; q += 6) {
      if (pts[q][2]) continue;
      const a = pts[q - 1], b = pts[q + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      for (const side of [1, -1]) { const lx = pts[q][0] - dz / l * 7.5 * side, lz = pts[q][1] + dx / l * 7.5 * side, gi = Math.round((lx - N.x0) / N.cell), gj = Math.round((lz - N.z0) / N.cell);
        if (gi >= 0 && gj >= 0 && gi < GN.w && gj < GN.h && wmask[(gj * GN.w + gi) * 4 + 3] > 100) continue;   // not in the river
        lamps.push([pts[q][0] - dz / l * 7.5 * side, pts[q][1] + dx / l * 7.5 * side, Math.atan2(dx, dz) + (side > 0 ? Math.PI / 2 : -Math.PI / 2)]); }
    }
    const post = new THREE.BoxGeometry(0.22, 7, 0.22); post.translate(0, 3.5, 0);
    const arm = new THREE.BoxGeometry(0.16, 0.16, 1.6); arm.translate(0, 6.9, 0.7);
    const head = new THREE.BoxGeometry(0.5, 0.35, 0.7); head.translate(0, 6.75, 1.4);
    const lampMat = patch(new THREE.MeshPhongMaterial({ color: 0x33393a, flatShading: true, shininess: 0, specular: 0x000000 }), 'lamp');
    for (const gtry of [post, arm, head]) {
      const im = new THREE.InstancedMesh(gtry, lampMat, lamps.length);
      lamps.forEach(([x, z, rot], k) => { Q0.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot); M4.compose(T.set(x, H(x, z) - 0.2, z), Q0, S.set(1, 1, 1)); im.setMatrixAt(k, M4); });
      im.castShadow = true; scene.add(im);
    }
  }

  // ---------------------------------------------------------------- HUD
  const hud = { street: $('street'), place: $('place'), km: $('km'), lm: $('lm'), speed: $('speed') };
  const viewBtns = [...document.querySelectorAll('#views button')];
  const setView = v => { view = v; viewBtns.forEach((b, k) => b.setAttribute('aria-pressed', k === v)); };
  viewBtns.forEach((b, k) => b.addEventListener('click', () => setView(k))); setView(view);
  function placeAt(s) { let best = null; for (const [ps, name] of path.places) if (Math.abs(ps - s) < 900 && (!best || Math.abs(ps - s) < Math.abs(best[0] - s))) best = [ps, name]; return best ? best[1] : 'Praha'; }
  const mapCv = $('map'), mctx = mapCv.getContext('2d');
  function drawMap(p) {
    const W = mapCv.width, Hh = mapCv.height, sc = Math.min(W / (N.x1 - N.x0), Hh / (N.z1 - N.z0));
    mctx.fillStyle = '#e9e2d0'; mctx.fillRect(0, 0, W, Hh);
    const f = ([x, z]) => [(x - N.x0) * sc, (z - N.z0) * sc];
    mctx.fillStyle = '#7ea0c0'; for (const rings of waterPolys) { polyPath(mctx, rings, f); mctx.fill('evenodd'); }
    mctx.strokeStyle = '#b8402c'; mctx.lineWidth = 2; polyPath(mctx, [pts.map(q => [q[0], q[1]])], f); mctx.stroke();
    const [a, b] = f([p.x, p.z]); mctx.fillStyle = '#1d1d1d'; mctx.fillRect(a - 3, b - 3, 6, 6);
  }

  // ---------------------------------------------------------------- input: scroll / drag / keys change speed
  const bump = d => { kmh = Math.max(-120, Math.min(260, kmh + d)); paused = false; };
  addEventListener('wheel', e => { e.preventDefault(); bump(-e.deltaY * 0.06); }, { passive: false });
  let ty = null;
  addEventListener('touchstart', e => { ty = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchmove', e => { if (ty == null) return; const y = e.touches[0].clientY; bump((ty - y) * 0.35); ty = y; }, { passive: true });
  addEventListener('touchend', () => { ty = null; });
  addEventListener('keydown', e => {
    if (e.key === 'ArrowUp') bump(8); else if (e.key === 'ArrowDown') bump(-8);
    else if (e.key === ' ') { paused = !paused; e.preventDefault(); }
    else if (e.key === 'v' || e.key === 'V') setView((view + 1) % 3);
    else if (e.key === 'm' || e.key === 'M') mapCv.hidden = !mapCv.hidden;
    else if (e.key >= '1' && e.key <= '3') setView(+e.key - 1);
  });

  // ---------------------------------------------------------------- size: a low-resolution frame, scaled up with hard pixels
  function resize() {
    const px = Math.max(2, Math.round(innerHeight / (LITE ? 220 : 270))), w = Math.ceil(innerWidth / px), h = Math.ceil(innerHeight / px);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();

  // ---------------------------------------------------------------- loop
  const look = new THREE.Vector3();
  let last = performance.now(), frames = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!paused) { s += kmh / 3.6 * dt; if (s >= total) s -= total; if (s < 0) s += total; }
    const V = VIEWS[view], k = 1 - Math.exp(-dt * 2.2);
    for (const key of ['eye', 'ahead', 'aim', 'fov']) cur[key] += (V[key] - cur[key]) * k;
    const p = at(s), q = at(s + cur.ahead), p2 = at(s + 4);
    // Keep to the right-hand lane at street level.
    const hx = p2.x - p.x, hz = p2.z - p.z, hl = Math.hypot(hx, hz) || 1, lane = cur.eye < 5 ? 1.8 : 0;
    camera.position.set(p.x - hz / hl * lane, p.y + cur.eye, p.z + hx / hl * lane);
    look.set(q.x - hz / hl * lane, q.y + cur.aim + Math.min(cur.eye, 2) * 0.6, q.z + hx / hl * lane);
    camera.lookAt(look);
    if (Math.abs(camera.fov - cur.fov) > 0.05) { camera.fov = cur.fov; camera.updateProjectionMatrix(); }
    sky.position.copy(camera.position); sky.material.uniforms.time.value = now / 1000;
    // The sun's shadow box follows the camera, snapped to its texels so shadows do not shimmer.
    const R = V.shadow, focus = new THREE.Vector3().lerpVectors(camera.position, look, 0.5), texel = 2 * R / SMAP;
    focus.x = Math.round(focus.x / texel) * texel; focus.z = Math.round(focus.z / texel) * texel;
    const sc = sun.shadow.camera; if (sc.right !== R) { sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 6000; sc.updateProjectionMatrix(); }
    sun.target.position.copy(focus); sun.position.copy(focus).addScaledVector(SUN, 2500);
    renderer.render(scene, camera);
    if (frames++ % 6 === 0) {
      const ni = pts[p.i][3];
      hud.street.textContent = ni >= 0 ? path.names[ni] : '';
      hud.place.textContent = placeAt(s);
      hud.km.textContent = `${(s / 1000).toFixed(2)} / ${(total / 1000).toFixed(1)} km`;
      hud.speed.textContent = paused ? 'paused' : `${Math.round(kmh)} km/h`;
      const lm = path.landmarks.filter(l => l.s > s - 60 && l.s < s + 260).sort((a, b) => Math.abs(a.s - s) - Math.abs(b.s - s))[0];
      hud.lm.textContent = lm ? (lm.side < 0 ? '◀ ' : '') + lm.name + (lm.side >= 0 ? ' ▶' : '') : '';
      if (!mapCv.hidden) drawMap(p);
    }
    window.__frames = frames;
    requestAnimationFrame(frame);
  }
  $('load').hidden = true;
  window.__ready = true; window.__stats = { buildings: nBuild, roads: roads.length, trees: nT, tiles: tiles.size };
  requestAnimationFrame(frame);
})().catch(e => { const l = document.getElementById('load'); l.hidden = false; l.textContent = 'Could not build the scene: ' + e.message; console.error(e); window.__error = e.message; });
