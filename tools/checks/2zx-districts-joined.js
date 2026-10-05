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
  const { MATERIALS, MAT } = await import('../../engine/materials.js');
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
  // ridden, not only touching: following the rails as a cart can (railgraph.js:
  // shapes that lead to each other, and a height change only up a slope), from
  // the city loop, one closed circuit through every district (the old check only
  // asked that one network touch every district, which a broken loop passed; and
  // a flat rail beside a higher one was counted joined, which a cart cannot take)
  {
    const { railLinks, railsOf, trackFrom } = await import('../../engine/railgraph.js');
    const { findSites } = await import('../../engine/worldfile.js');
    let open = 0, short = 0, loopsOpen = 0, sitesChecked = 0;
    for (const [, r] of cities) {
      const { W } = r.plan, ds = r.plan.districts;
      const rails = railsOf(r.world, MATERIALS);
      const loop = r.transit.lines.find((l) => l.loop);
      const start = loop && loop.cells.map((c) => c.join(',')).find((k) => rails.has(k));
      if (!start) { open++; continue; }
      const t = trackFrom(rails, start);
      if ([...t].some((k) => railLinks(rails, k).length !== 2)) open++;
      if (!ds.every((d) => [...t].some((k) => { const [x, , z] = k.split(',').map(Number); return d.has(z * W + x); }))) short++;
    }
    // and on the fitted test sites (hills: a street dipping a block for a cell
    // made a dip in the track a cart cannot take), every loop closed
    // (and the bigger 256 ones, where a bridge's approach levelled away track
    // beside its landing and the loop came out with gaps)
    for (const size of [160, 192, 256]) {
      const sites = findSites(terrain, size, { step: 64 });
      for (let i = 0; i < Math.min(3, sites.length); i++) {
        const r = generateCity({ ...DEFAULTS, ...L, size, seed: 447261885, terrain: siteGround(terrain, sites[i].x, sites[i].z, size), transit: 'rails', bridges: true });
        const rails = railsOf(r.world, MATERIALS);
        sitesChecked++;
        for (const l of r.transit.lines.filter((q) => q.loop)) {
          const st = l.cells.map((c) => c.join(',')).find((k) => rails.has(k));
          if (!st) continue;
          if ([...trackFrom(rails, st)].some((k) => railLinks(rails, k).length !== 2)) loopsOpen++;
        }
      }
    }
    check('districts: the city loop is one closed circuit a cart can ride (every rail joined to two, climbs only up slopes)', open === 0, `${open} open`);
    check('districts: and that circuit runs through every district, across the bridges', short === 0, `${short} cities where it misses one`);
    check('loops: on every fitted test site the loop is closed (no dips a cart cannot take)', loopsOpen === 0 && sitesChecked >= 4, `${loopsOpen} open over ${sitesChecked} sites`);
  }
  // bridges: five across (two tracks, a kerb either side), carrying a street on
  // centred at both ends, curving (straight runs and square corners) where the
  // streets do not line up; and the loop rides round over them, one closed circuit
  {
    const { railLinks, railsOf, trackFrom } = await import('../../engine/railgraph.js');
    const land = (size, wet) => { const g = new Float32Array(size * size).fill(64), w = new Uint8Array(size * size); for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) if (wet(x, z)) { w[z * size + x] = 1; g[z * size + x] = 62; } return { ground: g, raw: g, water: w, baseY: 64, size, x0: 0, z0: 0, exact: false, surface: null, coverage: 1, waterShare: 0.2, buildableShare: 0.8, p05: 64, p95: 64 }; };
    const made = [
      generateCity({ ...DEFAULTS, ...L, size: 224, seed: 447261885, focal: [0.27, 0.31], transit: 'rails', bridges: true, terrain: land(224, (x, z) => !((x - 60) ** 2 + (z - 70) ** 2 < 55 ** 2 || (x - 170) ** 2 + (z - 160) ** 2 < 45 ** 2)) }),
      generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7, focal: [0.27, 0.5], transit: 'rails', bridges: true, terrain: land(256, (x, z) => !((x - 70) ** 2 + (z - 128) ** 2 < 60 ** 2 || (x - 180) ** 2 + (z - 60) ** 2 < 40 ** 2 || (x - 190) ** 2 + (z - 200) ** 2 < 42 ** 2)) }),
    ];
    let wide = 0, offStreet = 0, curved = 0, openLoops = 0, missed = 0, all = 0;
    for (const r of [...made, ...cities.map(([, c]) => c)]) {
      const { W, use } = r.plan, street = ([x, z]) => use[z * W + x] === USE.ROAD || use[z * W + x] === USE.SIDEWALK;
      for (const b of r.bridges) { all++; if (2 * b.half + 1 !== 5) wide++; if (!street(b.from) || !street(b.to)) offStreet++; if (b.curved) curved++; }
      const rails = railsOf(r.world, MATERIALS), loop = r.transit.lines.find((l) => l.loop);
      const st = loop && loop.cells.map((c) => c.join(',')).find((k) => rails.has(k));
      if (!st) { openLoops++; continue; }
      const t = trackFrom(rails, st);
      if ([...t].some((k) => railLinks(rails, k).length !== 2)) openLoops++;
      if (!r.plan.districts.every((d) => [...t].some((k) => { const [x, , z] = k.split(',').map(Number); return d.has(z * W + x); }))) missed++;
    }
    // the two tracks kept apart: a raised brick down the middle of every deck, end
    // to end, no rail on a deck's middle, and no rail on a deck crowded by more
    // than two others (three tracks side by side merged into a tangle in the game)
    // (over the water only: where the deck meets the land the two tracks part,
    // one carrying on with the ring and the other turning once onto it, and a
    // brick on the shore forced them into knots)
    let gapsInDivider = 0, midRails = 0, crowded = 0, onShore = 0;
    for (const r of [...made, ...cities.map(([, c]) => c)]) {
      const w = r.world, Wp = r.plan.W;
      for (const b of r.bridges) {
        const deck = new Set(b.cells.map(([x, z]) => x + ',' + z));
        const gap = b.gapCells || new Set();
        for (const [x, z] of b.path) {
          if (!w.has(x, b.deckY, z)) continue;
          const brick = w.get(x, b.deckY + 1, z) === MAT.STONEBRICK;
          if (!gap.has(z * Wp + x)) { if (brick) onShore++; continue; }
          if (!brick) gapsInDivider++;
          for (let y = b.deckY; y <= b.deckY + 2; y++) { const id = w.get(x, y, z); if (id >= 0 && /rail/.test(MATERIALS.def(id).block)) midRails++; }
        }
        for (const k of deck) {
          const [x, z] = k.split(',').map(Number), y = b.deckY + 1, isRail = (xx, zz) => { for (const dy of [-1, 0, 1]) { const id = w.get(xx, y + dy, zz); if (id >= 0 && /rail/.test(MATERIALS.def(id).block)) return true; } return false; };
          if (!isRail(x, z)) continue;
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => isRail(x + dx, z + dz)).length > 2) crowded++;
        }
      }
    }
    check('bridges: a raised brick down the middle of every deck over the water, end to end', gapsInDivider === 0, `${gapsInDivider} gaps`);
    check('bridges: no brick where the deck meets the land (the tracks part there)', onShore === 0, `${onShore} on the shore`);
    check('bridges: no rail on a deck\'s middle (no line laid between its two tracks)', midRails === 0, `${midRails}`);
    check('bridges: two tracks a deck, never crowded together', crowded === 0, `${crowded} crowded`);
    check('bridges: five across (two tracks, a kerb either side)', wide === 0 && all > 0, `${wide} of ${all} not`);
    check('bridges: each carries a street on, landing on one at both ends (centred, not off to one side)', offStreet === 0, `${offStreet} off the street`);
    check('bridges: where the streets do not line up, a bridge curves (square corners)', curved >= 2, `${curved} curved`);
    check('bridges: over straight and curved bridges alike, the loop one closed circuit through every district', openLoops === 0 && missed === 0, `${openLoops} open, ${missed} missing a district`);
  }
  // Players' own cities, rebuilt from their sites (ground and water read from the
  // blocks of their worlds) and their saved settings. Each ringed whole: one loop
  // closed through every district and across every bridge, each line one piece,
  // and at the bridges no rail crowded and no brick where a deck meets the land.
  // (The second has two bridges from the old search, one landing at a corner of
  // the shore: the loop's band pinched there until landings got platforms.)
  {
    const { railLinks, railsOf, trackFrom } = await import('../../engine/railgraph.js');
    const { readFileSync } = await import('node:fs');
    for (const name of ['site-1004841.json', 'site-1004954.json']) {
      const fx = JSON.parse(readFileSync(new URL('./' + name, import.meta.url), 'utf8'));
      const ground = new Int16Array(Uint8Array.from(Buffer.from(fx.ground, 'base64')).buffer);
      const water = Uint8Array.from(Buffer.from(fx.water, 'base64'));
      const r = generateCity({ ...DEFAULTS, ...fx.settings, furnish: false, villagers: 0, fish: false, terrain: { ground, water, baseY: fx.baseY } });
      const rails = railsOf(r.world, MATERIALS);
      const loop = r.transit.lines.find((l) => l.loop);
      const st = loop && loop.cells.map((c) => c.join(',')).find((k) => rails.has(k));
      const t = st ? trackFrom(rails, st) : new Set();
      const closed = t.size > 0 && [...t].every((k) => railLinks(rails, k).length === 2);
      const { W } = r.plan;
      const through = r.plan.districts.every((d) => [...t].some((k) => { const [x, , z] = k.split(',').map(Number); return d.has(z * W + x); }));
      const seen = new Set(); let pieces = 0;
      for (const k of rails.keys()) { if (seen.has(k)) continue; pieces++; const c = [k]; seen.add(k); for (let j = 0; j < c.length; j++) for (const m of railLinks(rails, c[j])) if (!seen.has(m)) { seen.add(m); c.push(m); } }
      // crowded rails at the bridges: on a deck or within six of a landing
      const nearBridge = (x, z) => r.bridges.some((b) => b.cells.some(([bx, bz]) => Math.abs(bx - x) <= 6 && Math.abs(bz - z) <= 6));
      let crowdedAtBridges = 0;
      for (const k of rails.keys()) { const [x, y, z] = k.split(',').map(Number); let n = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [-1, 0, 1]) if (rails.has((x + dx) + ',' + (y + dy) + ',' + (z + dz))) { n++; break; } if (n >= 3 && nearBridge(x, z)) crowdedAtBridges++; }
      let shore = 0;
      for (const b of r.bridges) { const gap = b.gapCells || new Set(); for (const [x, z] of b.path) if (!gap.has(z * W + x) && r.world.get(x, b.deckY + 1, z) === MAT.STONEBRICK) shore++; }
      const id = name.replace('site-', '').replace('.json', '');
      check(`a player's city (${id}): rebuilt as it was (${fx.expect.districts} districts, ${fx.expect.bridges} bridges), ringed whole`, r.plan.districts.length === fx.expect.districts && r.bridges.length === fx.expect.bridges && !!r.transit.ringedWhole, `${r.plan.districts.length} districts, ${r.bridges.length} bridges, ringed whole ${!!r.transit.ringedWhole}`);
      check(`a player's city (${id}): the loop one closed circuit through every district`, closed && through, `${closed ? 'closed' : 'open'}, ${through ? 'through all' : 'misses one'}`);
      check(`a player's city (${id}): each line one piece; at the bridges no rail crowded, no brick on a landing`, pieces === r.transit.lines.length && crowdedAtBridges === 0 && shore === 0, `${pieces} pieces for ${r.transit.lines.length} lines, ${crowdedAtBridges} crowded at bridges, ${shore} bricks on landings`);
    }
  }
  check('districts: the made landscape falls into three, the far one bridged through the middle', cities[0][1].plan.districts.length === 3 && cities[0][1].bridges.length === 2);
  check('districts: every one reached on foot from downtown\'s streets, across the bridges', notReached === 0, `${notReached} not reached`);
  check('districts: one rail network touches every district', railSplit === 0, `${railSplit} cities split`);
  check('districts: track across every bridge', bareBridge === 0, `${bareBridge} without`);
  check('districts: every building walks through', ok);
  note(`districts: ${districts} districts, ${bridges} bridges over ${cities.length} cities`);
}
