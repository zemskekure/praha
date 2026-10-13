// Step 2: OpenStreetMap features for the detailed area (buildings and their parts, bridges, roads, rail, land cover,
// water, trees) plus the tall buildings and towers for 7 km around, for the skyline. Raw answers are cached per tile
// in .cache3d/osm, so a rerun only fetches what is missing. Overpass is slow and flaky: tiles are retried across mirrors.
import { join } from 'node:path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { sleep } from '../../.claude/skills/pixel-path/scripts/lib.mjs';
import { CACHE, NEAR, toLL } from './common.mjs';

const MIRRORS0 = ['https://overpass.kumi.systems/api/interpreter', 'https://lz4.overpass-api.de/api/interpreter', 'https://overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
// REVERSE=1 runs the tiles backwards and prefers the other mirror, so two runs can share the work.
const MIRRORS = process.env.REVERSE ? [MIRRORS0[4], MIRRORS0[0], ...MIRRORS0.slice(1, 4)] : MIRRORS0;
const UA = process.env.PIXEL_PATH_USER_AGENT || 'praha-3d/1.0 (github.com/zemskekure/praha)';
const dir = join(CACHE, 'osm'); mkdirSync(dir, { recursive: true });

async function overpass(name, q) {
  const f = join(dir, name + '.json');
  if (existsSync(f)) return;
  const lock = f + '.lock'; if (existsSync(lock)) return; writeFileSync(lock, '');   // the other run has it
  for (let round = 0; round < 6; round++) for (const m of MIRRORS) {
    try {
      const r = await fetch(m, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA }, signal: AbortSignal.timeout(300000) });
      const t = await r.text();
      if (r.ok && t.startsWith('{') && !/"remark":\s*"runtime error/.test(t)) { writeFileSync(f, t); rmSync(lock, { force: true }); console.log(`${name}: ${(t.length / 1e6).toFixed(1)} MB from ${new URL(m).host}`); return; }
      console.error(`  ${name} ${new URL(m).host}: HTTP ${r.status} ${t.slice(0, 80).replace(/\s+/g, ' ')}`);
    } catch (e) { console.error(`  ${name} ${new URL(m).host}: ${e.cause?.code || e.message}`); }
    await sleep(3000);
  }
  rmSync(lock, { force: true });
  throw Error(`${name}: every mirror failed; rerun later (finished tiles are kept)`);
}

const NX = 3, NZ = 3, W = (NEAR.x1 - NEAR.x0) / NX, H = (NEAR.z1 - NEAR.z0) / NZ;
const order = []; for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) order.push([i, j]);
if (process.env.REVERSE) order.reverse();
for (const [i, j] of order) {
  const [w, n] = toLL(NEAR.x0 + i * W, NEAR.z0 + j * H), [e, s] = toLL(NEAR.x0 + (i + 1) * W, NEAR.z0 + (j + 1) * H);
  const bb = [s, w, n, e].map(v => v.toFixed(5)).join(',');
  await overpass(`tile-${i}-${j}`, `[out:json][timeout:240][bbox:${bb}];(
    way[building]; relation[building][type=multipolygon]; way["building:part"]; relation["building:part"][type=multipolygon];
    way[man_made=bridge]; way[highway]; way[railway~"^(rail|tram|light_rail|narrow_gauge)$"];
    way[landuse]; relation[landuse][type=multipolygon]; way[leisure~"^(park|garden|pitch|playground|golf_course)$"]; relation[leisure~"^(park|garden)$"][type=multipolygon];
    way[natural~"^(water|wood|scrub|grassland|heath)$"]; relation[natural~"^(water|wood|scrub)$"][type=multipolygon]; way[waterway=riverbank]; relation[waterway=riverbank];
    way[amenity=parking]; way[place=square]; way[highway=pedestrian][area=yes]; node[natural=tree];
  );out geom;`);
}
const [w, n] = toLL(-7000, -7000), [e, s] = toLL(7000, 7000);
await overpass('skyline', `[out:json][timeout:240][bbox:${[s, w, n, e].map(v => v.toFixed(5)).join(',')}];(
  way[building][height](if:number(t["height"])>=35); way["building:part"][height](if:number(t["height"])>=35); way[building]["building:levels"](if:number(t["building:levels"])>=12);
  way[man_made~"^(tower|mast|chimney)$"]; node[man_made~"^(tower|mast|chimney)$"][height](if:number(t["height"])>=40);
);out geom;`);
console.log('osm: done');
