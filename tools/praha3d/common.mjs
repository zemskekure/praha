// Shared settings for the Praha 3D build: the local frame and file locations.
import { join } from 'node:path';
import { readJSON } from '../../.claude/skills/pixel-path/scripts/lib.mjs';

export const TRIP = 'trips/prague';
export const OUT = join(TRIP, '3d');
export const CACHE = join(TRIP, '.cache3d');
export const R = 6371008.8;

const route = readJSON(join(TRIP, 'route.json'));
let b = [1e9, 1e9, -1e9, -1e9];
for (const [lon, lat] of route.line) b = [Math.min(b[0], lon), Math.min(b[1], lat), Math.max(b[2], lon), Math.max(b[3], lat)];
export const ROUTE = route;
// Origin in the middle of the route. Local metres: x east, z south (three.js looks down -z for north).
export const LON0 = (b[0] + b[2]) / 2, LAT0 = (b[1] + b[3]) / 2;
const KX = Math.cos(LAT0 * Math.PI / 180) * R * Math.PI / 180, KZ = R * Math.PI / 180;
export const toXZ = (lon, lat) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];
export const toLL = (x, z) => [LON0 + x / KX, LAT0 - z / KZ];

// The detailed area: the route's box plus a margin, so the skyline across the river is real.
const M = 1300;
const [x0, z1] = toXZ(b[0], b[1]), [x1, z0] = toXZ(b[2], b[3]);
export const NEAR = { x0: Math.floor((x0 - M) / 12) * 12, z0: Math.floor((z0 - M) / 12) * 12, x1: Math.ceil((x1 + M) / 12) * 12, z1: Math.ceil((z1 + M) / 12) * 12, cell: 12 };
// The horizon: 32 km square around the origin, coarse.
export const FAR = { x0: -16000, z0: -16000, x1: 16000, z1: 16000, cell: 160 };
export const nearBBoxLL = () => { const [a, c] = toLL(NEAR.x0, NEAR.z1), [d, e] = toLL(NEAR.x1, NEAR.z0); return [c, a, e, d]; };   // s, w, n, e
