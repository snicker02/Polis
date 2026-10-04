// tools/checks/2zx-districts-joined.js — every district joined to the rest.
//
// A city fitted to real ground can fall into districts (land split by water or
// ground too high or low to build on); bridges join them. Each used to be
// bridged only to downtown's district, so one more than a span from it, behind
// another, was left with no road or rail to the rest (and the reach check walks
// from every district's own streets, so nothing noticed). Now they are joined in
// a chain, nearest first, each to whatever is joined already. Checked on a made
// landscape (three masses west to east, two channels, downtown in the west: the
// east only reachable through the middle) and on the test terrain's split site:
// every district reached on foot from downtown's streets across the bridges,
// one rail network touching every district, track across every bridge, every
// building walking through.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zx';
export const label = '2zx. every district joined';

export function threeMasses(size = 256) {
  const ground = new Float32Array(size * size).fill(64), water = new Uint8Array(size * size);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++)
    if ((x >= 72 && x < 100) || (x >= 150 && x < 178)) { water[z * size + x] = 1; ground[z * size + x] = 62; }
  return { ground, raw: ground, water, baseY: 64, size, x0: 0, z0: 0, exact: false, surface: null, coverage: 1, waterShare: 0.2, buildableShare: 0.8, p05: 64, p95: 64 };
}

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const root = ROOT || join(new URL('.', import.meta.url).pathname, '..', '..');
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { USE } = await import('../../engine/plan.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { siteGround } = await import('../../engine/worldfile.js');
  const raw = JSON.parse(readFileSync(join(root, 'tools', 'test-terrain.json'), 'utf8'));
  const terrain = new Map(Object.entries(raw).map(([k, v]) => [k, Int16Array.from(v)]));
  const L = { furnish: false, lightAll: false, fish: false, hostileCount: 0 };

  const cities = [
    ['made: three masses', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 447261885, terrain: threeMasses(), focal: [0.15, 0.5], transit: 'rails', bridges: true })],
    ['test terrain split site', generateCity({ ...DEFAULTS, ...L, size: 192, seed: 447261885, terrain: siteGround(terrain, -160, -192, 192), transit: 'rails', bridges: true })],
  ];
  let notReached = 0, railSplit = 0, bareBridge = 0, districts = 0, bridges = 0, ok = true;
  for (const [, r] of cities) {
    const { W, D, use } = r.plan, ds = r.plan.districts;
    districts += ds.length; bridges += r.bridges.length;
    const v = verifyAll(r.world, r.buildings);
    if (v.ok !== v.total || r.reach.unreached.length) ok = false;
    // on foot from downtown's streets
    const street = (i) => use[i] === USE.ROAD || use[i] === USE.SIDEWALK;
    let start = -1; for (const i of ds[0]) if (street(i)) { start = i; break; }
    const seen = new Uint8Array(W * D); const q = [start]; seen[start] = 1;
    while (q.length) { const i = q.pop(); const x = i % W, z = (i - x) / W; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue; const j = nz * W + nx; if (!seen[j] && street(j)) { seen[j] = 1; q.push(j); } } }
    for (const d of ds) if (![...d].some((i) => seen[i])) notReached++;
    // by rail: one network touching every district
    const railCols = new Set(); r.world.forEach((x, y, z, id) => { if (/rail/.test(MATERIALS.def(id).block) && x >= 0 && z >= 0 && x < W && z < D) railCols.add(z * W + x); });
    const net = new Map(); let nid = 0;
    for (const c of railCols) { if (net.has(c)) continue; nid++; const qq = [c]; net.set(c, nid); while (qq.length) { const i = qq.pop(); const x = i % W, z = (i - x) / W; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue; const j = nz * W + nx; if (railCols.has(j) && !net.has(j)) { net.set(j, nid); qq.push(j); } } } }
    const touch = new Map(); for (const [c, n] of net) { const k = ds.findIndex((d) => d.has(c)); if (k < 0) continue; if (!touch.has(n)) touch.set(n, new Set()); touch.get(n).add(k); }
    if (Math.max(0, ...[...touch.values()].map((s) => s.size)) < ds.length) railSplit++;
    for (const b of r.bridges) if (!b.cells.some(([x, z]) => railCols.has(z * W + x))) bareBridge++;
  }
  check('districts: the made landscape falls into three, the far one bridged through the middle', cities[0][1].plan.districts.length === 3 && cities[0][1].bridges.length === 2);
  check('districts: every one reached on foot from downtown\'s streets, across the bridges', notReached === 0, `${notReached} not reached`);
  check('districts: one rail network touches every district', railSplit === 0, `${railSplit} cities split`);
  check('districts: track across every bridge', bareBridge === 0, `${bareBridge} without`);
  check('districts: every building walks through', ok);
  note(`districts: ${districts} districts, ${bridges} bridges over ${cities.length} cities`);
}
