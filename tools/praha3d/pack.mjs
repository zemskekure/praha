// Step 3: pack the OpenStreetMap answers into small binary files the page reads:
//   buildings.bin  every building (or building:part) with its rings, height, roof shape and colours
//   land.bin       land cover polygons (water, parks, woods, squares...) painted onto the ground
//   roads.bin      roads, paths and rails as lines (bridges flagged; tunnels left out)
//   trees.bin      mapped trees plus trees scattered through parks and woods
//   path.json      the drive: a point every 5 m with bridge flags, street and district names, landmarks
// Coordinates are local metres (x east, z south), stored as int16 at 0.25 m.
import { join } from 'node:path';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readJSON, cumulative, locate } from '../../.claude/skills/pixel-path/scripts/lib.mjs';
import { TRIP, OUT, CACHE, NEAR, ROUTE, toXZ, LON0, LAT0 } from './common.mjs';

const Q = 4;   // quantisation: 1/4 m
// ------------------------------------------------------------------ read and dedupe
const els = new Map();
for (const f of readdirSync(join(CACHE, 'osm')).filter(f => f.endsWith('.json'))) for (const e of JSON.parse(readFileSync(join(CACHE, 'osm', f), 'utf8')).elements) els.set(e.type[0] + e.id, e);
console.log(`${els.size} OSM elements`);

const ring = g => g.map(p => toXZ(p.lon, p.lat));
// Multipolygon members arrive as separate ways: join them end to end into closed rings.
function assemble(members, role) {
  const segs = members.filter(m => m.type === 'way' && m.geometry && (m.role || 'outer') === role).map(m => m.geometry.map(p => [p.lon, p.lat]));
  const rings = [];
  const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
  while (segs.length) {
    let cur = segs.shift();
    for (let guard = 0; guard < 1000 && !same(cur[0], cur.at(-1)); guard++) {
      const i = segs.findIndex(s => same(s[0], cur.at(-1)) || same(s.at(-1), cur.at(-1)));
      if (i < 0) break;
      const s = segs.splice(i, 1)[0];
      cur = cur.concat(same(s[0], cur.at(-1)) ? s.slice(1) : s.reverse().slice(1));
    }
    if (cur.length >= 4 && same(cur[0], cur.at(-1))) rings.push(cur.map(([lon, lat]) => toXZ(lon, lat)));
  }
  return rings;
}
function polys(e) {   // [[outer, ...holes], ...]
  if (e.type === 'way') return e.geometry && e.geometry.length >= 4 ? [[ring(e.geometry)]] : [];
  if (e.type === 'relation' && e.members) {
    const outers = assemble(e.members, 'outer'), inners = assemble(e.members, 'inner');
    return outers.map(o => [o, ...inners.filter(h => inside(h[0], o))]);
  }
  return [];
}
function inside([x, z], r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, zi] = r[i], [xj, zj] = r[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
const area = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return a / 2; };
const centroid = r => { let x = 0, z = 0; for (const p of r) { x += p[0]; z += p[1]; } return [x / r.length, z / r.length]; };
// Drop points closer than 0.4 m and straight-through points; buildings keep their corners.
function clean(r) {
  const o = [];
  for (const p of r) if (!o.length || Math.hypot(p[0] - o.at(-1)[0], p[1] - o.at(-1)[1]) > 0.4) o.push(p);
  if (o.length > 1 && Math.hypot(o[0][0] - o.at(-1)[0], o[0][1] - o.at(-1)[1]) < 0.4) o.pop();
  const k = [];
  for (let i = 0; i < o.length; i++) {
    const a = o[(i + o.length - 1) % o.length], b = o[i], c = o[(i + 1) % o.length];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]), l = Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (l === 0 || Math.abs(cr) / l > 0.02) k.push(b);
  }
  return k.length >= 3 ? k : null;
}
const fits = r => r.every(([x, z]) => Math.abs(x) * Q < 32000 && Math.abs(z) * Q < 32000);

// ------------------------------------------------------------------ binary writer
class W { constructor() { this.b = Buffer.alloc(1 << 20); this.n = 0; }
  need(k) { if (this.n + k > this.b.length) { const nb = Buffer.alloc(Math.max(this.b.length * 2, this.n + k)); this.b.copy(nb); this.b = nb; } }
  u8(v) { this.need(1); this.b.writeUInt8(Math.max(0, Math.min(255, Math.round(v))), this.n); this.n += 1; }
  i8(v) { this.need(1); this.b.writeInt8(Math.max(-128, Math.min(127, Math.round(v))), this.n); this.n += 1; }
  u16(v) { this.need(2); this.b.writeUInt16LE(Math.max(0, Math.min(65535, Math.round(v))), this.n); this.n += 2; }
  i16(v) { this.need(2); this.b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v))), this.n); this.n += 2; }
  u32(v) { this.need(4); this.b.writeUInt32LE(v, this.n); this.n += 4; }
  pts(r) { this.u16(r.length); for (const [x, z] of r) { this.i16(x * Q); this.i16(z * Q); } }
  out() { return this.b.subarray(0, this.n); } }

// ------------------------------------------------------------------ colours
const NAMED = { white: '#f2f0ea', black: '#2a2a2a', grey: '#8f8f8c', gray: '#8f8f8c', lightgrey: '#c4c2bc', lightgray: '#c4c2bc', darkgrey: '#5b5b59', darkgray: '#5b5b59', silver: '#bdbdbd',
  red: '#a8432f', darkred: '#7d2c22', maroon: '#6f2a22', brown: '#7a5134', orange: '#d4874a', yellow: '#e6cf7a', beige: '#e3d7b5', ivory: '#efe9d6', cream: '#eee3c3', tan: '#cfb48a',
  khaki: '#c9bb83', gold: '#d6b052', wheat: '#e7d6ae', sienna: '#9a5536', peru: '#c08552', salmon: '#e09b80', pink: '#e7b7ad', green: '#5f8a55', darkgreen: '#3f5f3a', olive: '#7e7a45',
  lightgreen: '#9cbf88', teal: '#4f8a87', turquoise: '#6fb1a6', blue: '#5576a0', lightblue: '#9fbad4', navy: '#2f3f63', purple: '#6e5578', copper: '#6fa58a' };
function colour(s) {
  if (!s) return null; s = s.trim().toLowerCase().replace(/[\s_-]/g, '');
  if (NAMED[s]) s = NAMED[s];
  let m = s.match(/^#?([0-9a-f]{6})$/); if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  m = s.match(/^#?([0-9a-f]{3})$/); if (m) return [0, 1, 2].map(i => parseInt(m[1][i] + m[1][i], 16));
  return null;
}
const hex = h => colour(h);
const hash = n => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };
const pick = (list, id) => hex(list[Math.floor(hash(id) * list.length)]);
// Prague's old town: pastel stucco and Bath-like sandstone, red tiles, green copper.
const WALLS = ['#eadcc0', '#e4c98f', '#efe3b9', '#dbb68c', '#f1ebd9', '#d2c8b4', '#e7cab6', '#d9d1a9', '#cbb99b', '#ebd8a9', '#ded8ca', '#e3bb90', '#c9d1c0', '#e8d0c8'];
const MODERN = ['#c7c3ba', '#b3b1aa', '#d6d2c8', '#a9aca8'];
const TILES = ['#a5492f', '#96412a', '#b0583a', '#8c3c28', '#9e5a3c', '#a84f36'];
const KIND = { other: 0, house: 1, church: 2, industrial: 3, tower: 4, modern: 5, old: 6 };
// The historic towns, drawn by hand (lon, lat): inside them, buildings get the old look (baroque and gothic plaster,
// tall red roofs, small framed windows). Staré Město and Josefov inside the ring of Národní, Na Příkopě and Revoluční;
// Malá Strana and Hradčany between the river, Petřín and the castle walls; the Vyšehrad fortress.
const OLD_ZONES = [
  [[14.4128, 50.0912], [14.4199, 50.0930], [14.4262, 50.0925], [14.4302, 50.0897], [14.4287, 50.0862], [14.4268, 50.0843], [14.4205, 50.0815], [14.4166, 50.0813], [14.4135, 50.0820], [14.4130, 50.0860]],
  [[14.3895, 50.0905], [14.3960, 50.0935], [14.4040, 50.0938], [14.4110, 50.0925], [14.4128, 50.0880], [14.4115, 50.0835], [14.4085, 50.0805], [14.4035, 50.0800], [14.3990, 50.0840], [14.3905, 50.0860]],
  [[14.4150, 50.0665], [14.4215, 50.0668], [14.4235, 50.0640], [14.4200, 50.0617], [14.4150, 50.0625], [14.4135, 50.0645]],
].map(z => z.map(([lon, lat]) => toXZ(lon, lat)));
const OLD_WALLS = ['#ead6a6', '#e3bd82', '#f1e3c0', '#d9a383', '#f0ebdf', '#e0b893', '#cdb48a', '#f3d9ad', '#d6c19c', '#edcd9c', '#e6c6b4', '#c9b9a0', '#f2e6cf', '#dcc7a2'];
const ROOF = { flat: 0, gabled: 1, hipped: 2, pyramidal: 3, dome: 4, onion: 5, band: 6 };
const num = v => { const m = String(v ?? '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };

// ------------------------------------------------------------------ buildings
const parts = [], outlines = [];
for (const e of els.values()) {
  const t = e.tags || {};
  if (t['building:part'] && t['building:part'] !== 'no') parts.push(e);
  else if ((t.building && t.building !== 'no') || (e.type !== 'node' && /^(tower|mast|chimney)$/.test(t.man_made || '') && t.height)) outlines.push(e);
}
// A building drawn with parts is drawn by its parts only (the outline would cover them).
const grid = new Map(), key = (x, z) => `${Math.floor(x / 50)},${Math.floor(z / 50)}`;
for (const p of parts) for (const pg of polys(p)) { const c = centroid(pg[0]); const k = key(...c); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c); }
function hasParts(outer) {
  let b = [1e9, 1e9, -1e9, -1e9]; for (const [x, z] of outer) b = [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)];
  for (let gx = Math.floor(b[0] / 50); gx <= Math.floor(b[2] / 50); gx++) for (let gz = Math.floor(b[1] / 50); gz <= Math.floor(b[3] / 50); gz++)
    for (const c of grid.get(`${gx},${gz}`) || []) if (inside(c, outer)) return true;
  return false;
}
const B = new W(); let nB = 0; B.u32(0x42443350); B.u32(0);
const stats = { roof: {}, kind: {}, tagged: 0 };
function addBuilding(e, isPart) {
  const t = e.tags || {};
  for (const pg of polys(e)) {
    const rings = pg.map(clean).filter(Boolean); if (!rings.length || rings[0] === pg[0] && false) continue;
    const outer = rings[0]; if (!clean(pg[0]) || !fits(outer)) continue;
    const A = Math.abs(area(outer)); if (A < 6) continue;
    if (!isPart && grid.size && hasParts(outer)) continue;
    const b = `${t.building || ''} ${t['building:part'] || ''}`.toLowerCase(), wor = t.amenity === 'place_of_worship';
    let kind = /church|cathedral|chapel|basilica|monastery/.test(b) || (wor && !isPart) ? 'church'
      : /^(tower|mast|chimney)$/.test(t.man_made || '') || /tower|bell_tower|campanile/.test(b) ? 'tower'
      : /industrial|warehouse|garage|shed|hangar|service|transformer|roof|carport|construction/.test(b) ? 'industrial'
      : /house|detached|villa|bungalow|cabin|farm/.test(b) ? 'house'
      : /office|commercial|retail|hotel|hospital|university|school|train_station|transportation|parking/.test(b) ? 'modern' : 'other';
    if ((kind === 'other' || kind === 'house' || kind === 'modern') && OLD_ZONES.some(z => inside(centroid(outer), z))) kind = 'old';
    const lv = num(t['building:levels']), rl = num(t['roof:levels']), mlv = num(t['building:min_level']);
    let shape = (t['roof:shape'] || '').toLowerCase();
    let h = num(t.height), minH = num(t.min_height);
    if (!(minH >= 0)) minH = mlv > 0 ? mlv * 3.3 : 0;
    if (t.building === 'roof') minH = Math.max(minH, 3);
    let rh = num(t['roof:height']);
    if (!(rh >= 0)) rh = rl > 0 ? rl * 2.8 : NaN;
    if (!(h > 0)) {
      const base = lv > 0 ? lv * 3.3 + 0.8 : { house: 8, church: 18, industrial: 6, tower: 25, modern: 16, other: 15, old: 13 }[kind];
      h = minH + base + (rh > 0 ? rh : 0) * (lv > 0 ? 1 : 0);
    }
    if (shape) stats.tagged++;
    // Untagged roofs: Prague's old blocks carry pitched red roofs; big modern boxes and sheds are flat.
    let roof = ROOF[shape] ?? (/(half-hipped|mansard|gambrel|round|saltbox)/.test(shape) ? ROOF.band : /cone|pyramid/.test(shape) ? ROOF.pyramidal : shape === 'skillion' ? ROOF.flat : undefined);
    if (roof === undefined) roof = kind === 'old' && A < 9000 ? ROOF.band : kind === 'industrial' || kind === 'modern' || A > 6000 || h > 40 || isPart && !shape ? ROOF.flat : kind === 'house' && A < 400 ? ROOF.hipped : ROOF.band;
    if (roof === ROOF.flat) rh = 0;
    else if (!(rh > 0)) {
      const d = Math.sqrt(A);
      rh = kind === 'old' && roof !== ROOF.dome && roof !== ROOF.onion && roof !== ROOF.pyramidal ? Math.max(4.5, Math.min(8, d * 0.32)) : roof === ROOF.dome ? Math.min(d * 0.5, 14) : roof === ROOF.onion ? Math.min(d * 0.8, 12) : roof === ROOF.pyramidal ? Math.min(d * (kind === 'church' || kind === 'tower' ? 1.4 : 0.5), 40) : Math.max(2.5, Math.min(5.5, d * 0.22));
    }
    rh = Math.min(rh, Math.max(1, h - minH - 1));
    let wall = colour(t['building:colour'] || t['colour']);
    let rc = colour(t['roof:colour']);
    const mat = (t['roof:material'] || '').toLowerCase();
    if (!rc) rc = /copper/.test(mat) ? hex('#6fa58a') : /slate/.test(mat) ? hex('#4d5560') : /metal|tin|zinc/.test(mat) ? hex('#7c8288') : /glass/.test(mat) ? hex('#8fb2c4')
      : roof === ROOF.flat ? hex(['#807e79', '#8a8781', '#76746f'][Math.floor(hash(e.id) * 3)]) : (roof === ROOF.dome || roof === ROOF.onion) ? hex('#6fa58a')
      : kind === 'church' && roof === ROOF.pyramidal ? hex(hash(e.id + 7) < 0.5 ? '#4d5560' : '#6fa58a') : pick(TILES, e.id + 3);
    if (!wall) wall = kind === 'church' ? pick(['#e9e3d3', '#cfc4ab', '#b9ae97', '#efe7d2'], e.id) : kind === 'industrial' ? pick(['#a8a297', '#b7a99a', '#9a8f84'], e.id) : kind === 'modern' ? pick(MODERN, e.id) : kind === 'old' ? pick(OLD_WALLS, e.id) : pick(WALLS, e.id);
    stats.roof[roof] = (stats.roof[roof] || 0) + 1; stats.kind[kind] = (stats.kind[kind] || 0) + 1;
    B.u8(KIND[kind]); B.u8(roof); B.u16(h * 10); B.u16(minH * 10); B.u16(rh * 10);
    for (const c of wall) B.u8(c); for (const c of rc) B.u8(c);
    B.u8(rings.length); for (const r of rings) B.pts(r);
    nB++;
  }
}
for (const e of parts) addBuilding(e, true);
for (const e of outlines) addBuilding(e, false);
// Towers mapped as a single point (masts, the odd chimney): a slim octagon.
for (const e of els.values()) if (e.type === 'node' && /^(tower|mast|chimney)$/.test(e.tags?.man_made || '')) {
  const [x, z] = toXZ(e.lon, e.lat), h = num(e.tags.height); if (!(h > 0) || !fits([[x, z]])) continue;
  const r = Math.max(2.5, h / 40), oct = Array.from({ length: 8 }, (_, i) => [x + r * Math.cos(i * Math.PI / 4), z + r * Math.sin(i * Math.PI / 4)]);
  B.u8(KIND.tower); B.u8(ROOF.pyramidal); B.u16(h * 10); B.u16(0); B.u16(r * 30); for (const c of hex('#c9c7c2')) B.u8(c); for (const c of hex('#9a9a96')) B.u8(c); B.u8(1); B.pts(oct); nB++;
}
B.b.writeUInt32LE(nB, 4);

// ------------------------------------------------------------------ land cover
const LAND = { water: 0, park: 1, wood: 2, grass: 3, farm: 4, pave: 5, parking: 6, sport: 7, rail: 8, urban: 9 };
function landClass(t) {
  if (t.natural === 'water' || t.waterway === 'riverbank' || t.landuse === 'reservoir' || t.landuse === 'basin') return 'water';
  if (t.natural === 'wood' || t.landuse === 'forest') return 'wood';
  if (t.natural === 'scrub' || t.natural === 'heath') return 'wood';
  if (t.leisure === 'park' || t.leisure === 'garden' || t.leisure === 'golf_course' || t.landuse === 'cemetery' || t.landuse === 'allotments' || t.landuse === 'orchard' || t.landuse === 'vineyard') return 'park';
  if (/^(grass|meadow|recreation_ground|village_green|greenfield)$/.test(t.landuse || '') || t.natural === 'grassland') return 'grass';
  if (/^(farmland|farmyard)$/.test(t.landuse || '')) return 'farm';
  if (t.leisure === 'pitch' || t.leisure === 'playground') return 'sport';
  if (t.amenity === 'parking') return 'parking';
  if (t.place === 'square' || t.highway === 'pedestrian') return 'pave';
  if (t.landuse === 'railway') return 'rail';
  if (/^(residential|commercial|retail|industrial|construction|garages|education|religious)$/.test(t.landuse || '')) return 'urban';
  return null;
}
const L = new W(); let nL = 0; L.u32(0x4c443350); L.u32(0);
const landPolys = { park: [], wood: [] };
// Paint order: big, general classes first, so parks and water draw over the urban ground.
const ORDER = ['urban', 'farm', 'rail', 'grass', 'park', 'wood', 'sport', 'parking', 'pave', 'water'];
const landList = [];
for (const e of els.values()) { const c = landClass(e.tags || {}); if (!c || e.type === 'node') continue; for (const pg of polys(e)) landList.push([c, pg]); }
landList.sort((a, b) => ORDER.indexOf(a[0]) - ORDER.indexOf(b[0]) || Math.abs(area(b[1][0])) - Math.abs(area(a[1][0])));
for (const [c, pg] of landList) {
  const rings = pg.map(clean).filter(Boolean); if (!rings.length || !fits(rings[0])) continue;
  L.u8(LAND[c]); L.u8(rings.length); for (const r of rings) L.pts(r); nL++;
  if (c === 'park' || c === 'wood') landPolys[c].push(rings);
}
L.b.writeUInt32LE(nL, 4);

// ------------------------------------------------------------------ roads and rails
const RC = { major: 0, secondary: 1, tertiary: 2, minor: 3, service: 4, pedestrian: 5, path: 6, rail: 7, tram: 8 };
function roadClass(t) {
  const h = t.highway || '';
  if (/^(motorway|trunk|primary)(_link)?$/.test(h)) return 'major';
  if (/^secondary(_link)?$/.test(h)) return 'secondary';
  if (/^tertiary(_link)?$/.test(h)) return 'tertiary';
  if (/^(residential|unclassified|living_street|road)$/.test(h)) return 'minor';
  if (h === 'service') return 'service';
  if (h === 'pedestrian') return 'pedestrian';
  if (/^(footway|path|cycleway|steps|track|bridleway)$/.test(h)) return 'path';
  if (t.railway === 'tram') return 'tram';
  if (/^(rail|light_rail|narrow_gauge)$/.test(t.railway || '')) return 'rail';
  return null;
}
const WIDTH = { major: 15, secondary: 12, tertiary: 10, minor: 7.5, service: 4.5, pedestrian: 6, path: 2.5, rail: 4, tram: 2.6 };
const roadNames = new Map();
const Rw = new W(); let nR = 0; Rw.u32(0x52443350); Rw.u32(0);
for (const e of els.values()) {
  if (e.type !== 'way' || !e.geometry) continue;
  const t = e.tags || {}, c = roadClass(t);
  if (!c || t.area === 'yes' || t.tunnel === 'yes' || t.tunnel === 'building_passage' || t.location === 'underground' || +t.layer < 0 || t.covered === 'yes' && c === 'path') continue;
  const r = ring(e.geometry); if (!fits(r)) continue;
  let w = num(t.width); if (!(w > 1.5 && w < 40) || c === 'tram' || c === 'rail') w = WIDTH[c];
  if (c !== 'tram' && c !== 'rail' && c !== 'path' && +t.lanes > 0) w = Math.max(w, Math.min(+t.lanes * 3.3, 24));
  const sett = /sett|cobblestone|paving_stones|unhewn/.test(t.surface || '') ? 2 : 0;
  const nm = t.name ? (roadNames.has(t.name) ? roadNames.get(t.name) : (roadNames.set(t.name, roadNames.size), roadNames.size - 1)) : 65535;
  Rw.u8(RC[c]); Rw.u8((t.bridge && t.bridge !== 'no' ? 1 : 0) | sett | (t.oneway === 'yes' ? 4 : 0)); Rw.u8(w * 4); Rw.i8(+t.layer || 0); Rw.u16(nm); Rw.pts(r); nR++;
}
Rw.b.writeUInt32LE(nR, 4);

// ------------------------------------------------------------------ trees
let seed = 12345; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
const T = new W(); let nT = 0; T.u32(0x54443350); T.u32(0);
for (const e of els.values()) if (e.type === 'node' && e.tags?.natural === 'tree') {
  const [x, z] = toXZ(e.lon, e.lat); if (!fits([[x, z]])) continue;
  const lt = (e.tags.leaf_type || '').startsWith('needle') ? 1 : 0;
  T.i16(x * Q); T.i16(z * Q); T.u8(110 + rnd() * 90); T.u8(lt); nT++;
}
const mapped = nT;
// Scatter more inside parks (sparse) and woods (dense), so Petřín and Letná read as wooded hills.
for (const [cls, per, cap] of [['wood', 70, 26000], ['park', 260, 14000]]) {
  let n = 0;
  for (const rings of landPolys[cls]) {
    const o = rings[0], A = Math.abs(area(o)); let k = Math.round(A / per);
    let b = [1e9, 1e9, -1e9, -1e9]; for (const [x, z] of o) b = [Math.min(b[0], x), Math.min(b[1], z), Math.max(b[2], x), Math.max(b[3], z)];
    for (let tries = 0; k > 0 && tries < k * 6 && n < cap; tries++) {
      const p = [b[0] + rnd() * (b[2] - b[0]), b[1] + rnd() * (b[3] - b[1])];
      if (!inside(p, o) || rings.slice(1).some(h => inside(p, h))) continue;
      T.i16(p[0] * Q); T.i16(p[1] * Q); T.u8(cls === 'wood' ? 130 + rnd() * 110 : 100 + rnd() * 100); T.u8(cls === 'wood' && rnd() < 0.25 ? 1 : 0); nT++; n++; k--;
    }
  }
}
T.b.writeUInt32LE(nT, 4);

// ------------------------------------------------------------------ the drive
const line = ROUTE.line, cum = cumulative(line), total = cum.at(-1);
const chunk = readJSON(join(TRIP, 'data/c0000.json')), samples = chunk.samples, names = chunk.names;
const lms = readJSON(join(TRIP, 'data/landmarks.json'), []);
const pts = [];
for (let s = 0; s <= total; s += 5) {
  const p = locate(line, cum, s), [x, z] = toXZ(p.lon, p.lat), smp = samples[Math.min(samples.length - 1, Math.round(s / 10))];
  pts.push([+x.toFixed(2), +z.toFixed(2), smp?.[5] ? 1 : 0, smp?.[6] ?? -1]);
}
// The best-known landmarks near the road, shown as a caption as you pass (the LDS record is a mis-tagged building).
const shown = lms.filter(l => l.qid !== 'Q42504' && Math.abs(l.side) < 700 && l.links >= 15).sort((a, b) => b.links - a.links).slice(0, 30)
  .map(l => ({ name: l.name, s: l.s, side: l.side }));
const path = { roadNames: [...roadNames.keys()], total: Math.round(total), step: 5, points: pts, names, places: chunk.places.filter(p => Math.abs(p[3]) < 900).map(p => [p[0], p[1]]), landmarks: shown,
  near: NEAR, far: { x0: -16000, z0: -16000, x1: 16000, z1: 16000, cell: 160 }, origin: [LON0, LAT0], from: 'Pražský hrad', to: 'Vyšehrad' };

writeFileSync(join(OUT, 'buildings.bin'), B.out());
writeFileSync(join(OUT, 'land.bin'), L.out());
writeFileSync(join(OUT, 'roads.bin'), Rw.out());
writeFileSync(join(OUT, 'trees.bin'), T.out());
writeFileSync(join(OUT, 'path.json'), JSON.stringify(path));
console.log(`buildings ${nB} (${(B.n / 1e6).toFixed(2)} MB; kinds ${JSON.stringify(stats.kind)}; roofs ${JSON.stringify(stats.roof)}; ${stats.tagged} with a roof shape tagged)`);
console.log(`land ${nL} (${(L.n / 1e6).toFixed(2)} MB), roads ${nR} (${(Rw.n / 1e6).toFixed(2)} MB), trees ${nT} (${mapped} mapped), path ${pts.length} points, ${shown.length} landmarks`);
