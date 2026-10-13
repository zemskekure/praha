// Step 1: real terrain from Terrain Tiles (Terrarium PNGs, AWS Open Data). Writes 3d/terrain-near.bin and 3d/terrain-far.bin
// as Float32 heights (metres) on a regular grid, row by row from north-west.
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { politeFetch, decodePNG } from '../../.claude/skills/pixel-path/scripts/lib.mjs';
import { OUT, CACHE, NEAR, FAR, toLL } from './common.mjs';

const tiles = new Map();
async function tile(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (!tiles.has(k)) tiles.set(k, politeFetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${k}.png`, { cacheDir: join(CACHE, 'terrarium'), gapMs: 20, binary: true }).then(b => decodePNG(b)));
  return tiles.get(k);
}
async function heightAt(lon, lat, z) {
  const n = 2 ** z, fx = (lon + 180) / 360 * n * 256, s = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)), fy = (1 - s / Math.PI) / 2 * n * 256;
  const px = fx - 0.5, py = fy - 0.5, ix = Math.floor(px), iy = Math.floor(py), tx = px - ix, ty = py - iy;
  const v = async (X, Y) => { const t = await tile(z, Math.floor(X / 256), Math.floor(Y / 256)), i = ((Y & 255) * t.width + (X & 255)) * 4, d = t.data; return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768; };
  const [a, b, c, d] = await Promise.all([v(ix, iy), v(ix + 1, iy), v(ix, iy + 1), v(ix + 1, iy + 1)]);
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
async function grid(G, z, blur) {
  const w = Math.round((G.x1 - G.x0) / G.cell) + 1, h = Math.round((G.z1 - G.z0) / G.cell) + 1, out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const row = [];
    for (let i = 0; i < w; i++) row.push(heightAt(...toLL(G.x0 + i * G.cell, G.z0 + j * G.cell), z));
    (await Promise.all(row)).forEach((v, i) => out[j * w + i] = v);
  }
  // Terrain Tiles carry some noise (and a few buildings) at this zoom: a light blur keeps the slopes and drops the speckle.
  for (let pass = 0; pass < blur; pass++) {
    const src = out.slice();
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      let s = 0, n = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < w && b < h) { s += src[b * w + a]; n++; } }
      out[j * w + i] = s / n;
    }
  }
  let mn = Infinity, mx = -Infinity; for (const v of out) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  return { w, h, data: out, min: mn, max: mx };
}
mkdirSync(OUT, { recursive: true });
const near = await grid(NEAR, 14, 2);
writeFileSync(join(OUT, 'terrain-near.bin'), Buffer.from(near.data.buffer));
console.log(`near terrain ${near.w}x${near.h} at ${NEAR.cell} m, ${near.min.toFixed(0)}-${near.max.toFixed(0)} m`);
const far = await grid(FAR, 11, 1);
writeFileSync(join(OUT, 'terrain-far.bin'), Buffer.from(far.data.buffer));
console.log(`far terrain ${far.w}x${far.h} at ${FAR.cell} m, ${far.min.toFixed(0)}-${far.max.toFixed(0)} m`);
