// engine/transit.js — minecart railways along the street grid.
//
// LAYOUT
// ------
// One straight line down the middle of every street. East-west lines run at
// ground level straight through every junction. North-south lines never cross
// them at grade: where one meets an east-west track it climbs a 4-block ramp,
// crosses on a bridge, and comes back down:
//
//        rail y:  1  1  2  3  4  5  4  3  2  1  1
//                 ── ─╱ ╱  ╱  ╱ ═══ ╲  ╲  ╲  ╲─ ──
//                             deck (y 4) over the east-west track at y 1,
//                             which keeps 2 clear blocks for a cart and rider
//
// So no two tracks ever touch, and every line is a simple path: no junctions
// to derail at, no switching to get wrong.
//
// POWER
// -----
// Every powered rail sits on a redstone block, so it is permanently on and
// no wiring is needed. Ramps are all powered rails (carts climb 4 blocks from
// a standstill). Flat track gets a powered booster every 16 blocks.
//
// STATIONS
// --------
// Each line ends in a buffer block with a powered rail in front of it. A cart
// that stops there is pushed off again, so every line is a shuttle that runs
// back and forth on its own. Hop in as it passes, or wait at an end.

import { MAT, MATERIALS, railId, poweredRailId, RAIL } from './materials.js';
import { USE } from './plan.js';

export const TRANSIT_MODES = ['roads', 'rails', 'trams'];
const RAMP = 4;           // blocks of climb
const CLEAR_GAP = 10;     // crossings closer than this share one bridge
const STRANDED_MAX = 14;   // a run shorter than this with no station is scrap
const BOOST_EVERY = 9;            // a cart loses speed long before 16 blocks
const BOOST_MIN = 4;              // no closer together than this, even at bends

export function layTransit(world, plan, mode, G) {
  if (mode !== 'rails' && mode !== 'trams') return null;
  const { W, D, use } = plan;
  const road = (x, z) => x >= 0 && z >= 0 && x < W && z < D && use[z * W + x] === USE.ROAD;

  // ---- surface: rails mode turns the carriageway into a green railway strip
  if (mode === 'rails') {
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++)
        if (road(x, z)) { world.set(x, G, z, MAT.GRASS); world.clear(x, G + 1, z); }
  }

  // ---- centre lines from the corridor list ----------------------------------
  const rows = new Set(), cols = new Set();
  for (const c of plan.corridors) {
    if (c.axis === 'x') rows.add(Math.floor((c.z0 + c.z1) / 2));
    else cols.add(Math.floor((c.x0 + c.x1) / 2));
  }
  const runs = (fixed, len, isRoad) => {
    const out = [];
    let a = -1;
    for (let i = 0; i <= len; i++) {
      const ok = i < len && isRoad(i);
      if (ok && a < 0) a = i;
      if (!ok && a >= 0) { if (i - a >= 12) out.push([a, i - 1]); a = -1; }
    }
    return out;
  };

  // A street made of segments with different widths has two centre lines a
  // block apart. Two tracks side by side would be merged into curves by the
  // game on the first block update, so of any overlapping runs within 2 rows
  // (or columns) of each other only the longest is kept.
  const pick = (fixedSet, len, isRoadAt) => {
    const all = [];
    for (const f of fixedSet) for (const [a, b] of runs(f, len, (i) => isRoadAt(f, i))) all.push({ f, a, b });
    all.sort((p, q) => (q.b - q.a) - (p.b - p.a));
    const kept = [];
    for (const r of all) {
      const clash = kept.some((k) => Math.abs(k.f - r.f) <= 2 && k.a <= r.b + 1 && r.a <= k.b + 1);
      if (!clash) kept.push(r);
    }
    return kept;
  };
  let xRuns = pick(rows, W, (z, x) => road(x, z));
  let zRuns = pick(cols, D, (x, z) => road(x, z));

  // ---- the perimeter loop -----------------------------------------------------
  // O = how far each cell is from the edge of the city (Chebyshev, so the
  // contour has square corners). The wall stands at O = 1. The loop runs
  // along the contour O = k in the outer streets: on a square city that is
  // the ring road's middle row; on an organic one it follows every bend,
  // with a curved rail at each corner. Every other line stays at O >= k + 2,
  // so nothing crosses or touches the loop, and no rail is ever under the wall.
  // The loop runs round the city's edge, which has to be a single ring. A
  // city split into districts and joined by bridges has several edges, so the
  // loop follows the main district and the outlying ones are reached by the
  // bridge instead of being ringed as well.
  // A city whose districts the bridges join is ringed whole: the loop traced over
  // all of it, bridge decks included. On a deck five across, the contour two in
  // from its edge is the two lane rows, so the one loop crosses every bridge out
  // on one side and back on the other, round every district: one circuit by its
  // shape (splicing each district's own ring onto the bridges after the fact went
  // wrong over and over). Only if that does not close is the old way taken.
  let main = plan.districts && plan.districts.length > 1 ? plan.districts[0] : null;
  if (main && plan.bridged) {
    const Ow = edgeDistance(plan);
    for (const k of [2, 3]) {
      const cyc = traceContour(W, D, (x, z) => Ow[z * W + x] >= k && road(x, z));
      if (!cyc || cyc.length < 40) continue;
      const touches = plan.districts.every((d) => cyc.some(([x, z]) => d.has(z * W + x)));
      // and never beside itself: two stretches of one ring side by side (where a
      // deck pinches against its bank) would run into each other in the game
      const at = new Map(); cyc.forEach(([x, z], i) => at.set(x + ',' + z, i));
      const n = cyc.length;
      const besideItself = cyc.some(([x, z], i) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
        const j = at.get((x + dx) + ',' + (z + dz));
        return j !== undefined && Math.min((j - i + n) % n, (i - j + n) % n) > 1;
      }));
      if (touches && !besideItself) { main = null; plan.unionLoop = { k, cells: cyc }; break; }
    }
  }
  const inMain = (x, z) => !main || main.has(z * W + x);
  // Two measures of "how far in from the edge": one for the whole city, which
  // decides where the ordinary lines may run, and one for the main district
  // alone, which the loop is traced on. Using the main-district one for both
  // leaves the outlying districts with no lines at all.
  const O = edgeDistance(plan);
  const Oloop = main ? edgeDistance(plan, (x, z) => inMain(x, z)) : O;
  let loop = plan.unionLoop || null;                          // (the whole city's first: a tidy rectangle would miss the bridges)
  if (!loop) {
    const body = main || (() => { const set = new Set(); for (let i = 0; i < W * D; i++) if (road(i % W, (i - (i % W)) / W)) set.add(i); return set; })();
    const rect = rectRing(W, D, body, (x, z) => road(x, z) && inMain(x, z) && Oloop[z * W + x] >= 2);
    if (rect) loop = { k: 3, cells: rect };
  }
  for (const k of loop ? [] : [3, 2, 4]) {
    const ring = [];
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (Oloop[z * W + x] === k && inMain(x, z)) ring.push([x, z]);
    const cyc = traceCycle(ring, (x, z) => road(x, z) && inMain(x, z));
    if (cyc) { loop = { k, cells: cyc }; break; }
  }
  // A ring only traces when the cells sit in a tidy circuit, which a city cut
  // to real ground seldom does: one spur or pinch and there is no loop at
  // all, and with it go every curved rail in the city. So when that fails,
  // the edge is walked instead — a contour always closes, however ragged the
  // shape — and the walk is tidied into a circuit.
  if (!loop && plan.unionLoop) loop = plan.unionLoop;           // the whole city's, bridges and all
  if (!loop) {
    for (const k of [3, 2, 4]) {
      const cyc = traceContour(W, D, (x, z) => Oloop[z * W + x] >= k && road(x, z) && inMain(x, z));
      // the same standard the district rings are held to: a walk that runs
      // back alongside itself lays track in circles, which is worse than no
      // ring at all
      if (cyc && cyc.length >= 40 && tidyRing(cyc)) { loop = { k, cells: cyc }; break; }
    }
  }
  const extraLoops = [];
  const ringedWhole = !!plan.unionLoop && loop === plan.unionLoop;
  if (main) {
    for (const d of plan.districts.slice(1)) {
      if (d.size < 600) continue;               // too small to be worth a circuit
      const inD = (x, z) => d.has(z * W + x);
      const Od = edgeDistance(plan, inD);
      const rect = rectRing(W, D, d, (x, z) => road(x, z) && inD(x, z) && Od[z * W + x] >= 2);
      if (rect) { extraLoops.push({ k: 3, cells: rect }); continue; }
      for (const k of [3, 2]) {
        const ring = [];
        for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (Od[z * W + x] === k && inD(x, z)) ring.push([x, z]);
        let cyc = traceCycle(ring, (x, z) => road(x, z) && inD(x, z));
        if (!cyc) {
          const walked = traceContour(W, D, (x, z) => Od[z * W + x] >= k && road(x, z) && inD(x, z));
          // A walk round a narrow strip goes out along one side and back
          // along the other, and the two runs end up side by side: track
          // laid on that is a thicket of curves, not a circuit. Such a ring
          // is refused, and the district keeps its straight lines.
          cyc = walked && tidyRing(walked) ? walked : null;
        }
        if (cyc && cyc.length >= 40) { extraLoops.push({ k, cells: cyc }); break; }
      }
    }
  }


  // Every ring has to be worked out before the straight lines are picked,
  // because a line may not be laid where a ring is going to run. On flat
  // ground two lines sharing a cell went unnoticed: the second simply wrote
  // its rail over the first. On real ground they are lifted to different
  // heights, and what is left is one line at grade and pieces of the other
  // stranded in the air above it — the little humps and closed circles of
  // track that join nothing. The main district was already protected by
  // minO; its outlying districts have had rings of their own since they
  // started getting them, and nothing kept the lines off those.
  const ringGuard = new Uint8Array(W * D);
  // A traced ring can skip a cell or two where the city's edge is ragged (big
  // cities, real ground): rails go only on the ring's cells, so each skip was a
  // gap in the track and the loop could not be ridden round. Every gap is closed
  // by the shortest way through street between the cells either side of it,
  // keeping off the rest of the ring.
  for (const ring of [loop, ...extraLoops]) {
    if (!ring || !ring.cells) continue;
    const C = ring.cells, onRing = new Set(C.map(([x, z]) => x + ',' + z)), out = [];
    for (let i = 0; i < C.length; i++) {
      const a = C[i], b = C[(i + 1) % C.length];
      out.push(a);
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) <= 1) continue;
      const prev = new Map([[a[0] + ',' + a[1], null]]), q = [[a[0], a[1], 0]];
      let found = null;
      while (q.length && !found) {
        const [x, z, d] = q.shift();
        if (d > 12) break;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz, k = nx + ',' + nz;
          if (prev.has(k)) continue;
          if (nx === b[0] && nz === b[1]) { prev.set(k, x + ',' + z); found = k; break; }
          if (!road(nx, nz) || onRing.has(k)) continue;
          prev.set(k, x + ',' + z); q.push([nx, nz, d + 1]);
        }
      }
      if (!found) continue;
      const between = [];
      for (let k = prev.get(found); k && k !== a[0] + ',' + a[1]; k = prev.get(k)) between.unshift(k.split(',').map(Number));
      for (const c of between) { out.push(c); onRing.add(c[0] + ',' + c[1]); }
    }
    ring.cells = out;
  }
  for (const ring of [loop, ...extraLoops]) {
    if (!ring) continue;
    for (const [x, z] of ring.cells)
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, nz = z + dz;
        if (nx >= 0 && nz >= 0 && nx < W && nz < D) ringGuard[nz * W + nx] = 1;
      }
  }

  const minO = loop ? loop.k + 2 : 2;
  // Outlying districts big enough to be worth it are ringed too, so a line
  // there keeps off its own district's ring as well as off its edge.
  const inner = (x, z) => road(x, z) && !ringGuard[z * W + x] && (inMain(x, z) ? Oloop[z * W + x] >= minO : O[z * W + x] >= 2);
  xRuns = pick(rows, W, (z, x) => inner(x, z));
  zRuns = pick(cols, D, (x, z) => inner(x, z));

  const railAt = new Map();          // "x,z" -> rail height at ground crossing check
  const lines = [];
  const stats = { lines: 0, rails: 0, bridges: 0, boosters: 0, loop: false, loopLength: 0 };
  const key = (x, z) => x + ',' + z;

  const bed = (x, z) => { if (mode === 'rails') world.set(x, G, z, MAT.GRAVEL); };
  const flatRail = (x, z, dir, powered) => {
    bed(x, z);
    if (powered) { world.set(x, G, z, MAT.REDSTONE); world.set(x, G + 1, z, poweredRailId(dir)); stats.boosters++; }
    else world.set(x, G + 1, z, railId(dir));
    for (let y = G + 2; y <= G + 3; y++) world.clear(x, y, z);
    stats.rails++;
  };
  // a line segment from a to b (inclusive) along one axis, buffers at both ends
  const station = (line, x, z) => line.stations.push([x, G + 1, z]);

  // ---- east-west lines, at grade -------------------------------------------
  for (const { f: z, a: xa, b: xb } of xRuns) {
    {
      const line = { axis: 'x', z, x0: xa, x1: xb, stations: [], cells: [] };
      bed(xa, z); bed(xb, z);
      world.set(xa, G + 1, z, MAT.STONEBRICK);          // buffers
      world.set(xb, G + 1, z, MAT.STONEBRICK);
      railAt.set(key(xa, z), G + 1);                     // north-south lines must bridge these too
      railAt.set(key(xb, z), G + 1);
      for (let x = xa + 1; x <= xb - 1; x++) {
        const end = x === xa + 1 || x === xb - 1;
        const boost = end || ((x - xa) % BOOST_EVERY === 0 && x < xb - 2);
        flatRail(x, z, RAIL.EW, boost);
        railAt.set(key(x, z), G + 1);
        line.cells.push([x, G + 1, z]);
      }
      station(line, xa + 1, z); station(line, xb - 1, z);
      lines.push(line);
    }
  }

  // ---- north-south lines, bridging every east-west track -------------------
  for (const { f: x, a: za, b: zb } of zRuns) {
    {
      // crossings strictly inside the run, clustered
      const cross = [];
      for (let z = za; z <= zb; z++) if (railAt.has(key(x, z))) cross.push(z);
      const clusters = [];
      for (const z of cross) {
        const last = clusters[clusters.length - 1];
        if (last && z - last[1] < CLEAR_GAP) last[1] = z; else clusters.push([z, z]);
      }
      // split the run where a bridge will not fit; each piece is its own line
      const pieces = [];
      let start = za;
      const bridges = [];
      for (const [c0, c1] of clusters) {
        const fits = c0 - RAMP - 1 >= start + 1 && c1 + RAMP + 1 <= zb - 1;
        if (fits) { bridges.push([c0, c1]); continue; }
        // stop short of the crossing and start again beyond it
        if (c0 - 1 - start >= 6) pieces.push([start, c0 - 1, bridges.splice(0)]);
        else bridges.length = 0;
        start = c1 + 1;
      }
      if (zb - start >= 6) pieces.push([start, zb, bridges.splice(0)]);

      for (const [pa, pb, brs] of pieces) {
        const line = { axis: 'z', x, z0: pa, z1: pb, stations: [], cells: [], bridges: brs.length };
        // height profile
        const h = new Map();
        for (let z = pa + 1; z <= pb - 1; z++) h.set(z, 0);
        for (const [c0, c1] of brs) {
          for (let i = 0; i < RAMP; i++) { h.set(c0 - RAMP + i, i); h.set(c1 + RAMP - i, i); }
          for (let z = c0; z <= c1; z++) h.set(z, RAMP);
          stats.bridges++;
        }
        const up = (z) => {                 // which way this cell's rail slopes, if at all
          const here = h.get(z), next = h.get(z + 1), prev = h.get(z - 1);
          if (next !== undefined && next > here) return RAIL.UP_S;
          if (prev !== undefined && prev > here) return RAIL.UP_N;
          return -1;
        };
        const onBridge = (z) => brs.some(([c0, c1]) => z >= c0 && z <= c1);
        bed(x, pa); bed(x, pb);
        world.set(x, G + 1, pa, MAT.STONEBRICK);
        world.set(x, G + 1, pb, MAT.STONEBRICK);
        for (let z = pa + 1; z <= pb - 1; z++) {
          const lift = h.get(z);
          const slope = up(z);
          const y = G + 1 + lift;
          if (onBridge(z)) {
            // deck over the crossing: keep the track below and 2 blocks above it clear
            world.set(x, y - 1, z, MAT.STONEBRICK);
            world.set(x, y, z, railId(RAIL.NS));
          } else if (slope >= 0) {
            bed(x, z);
            for (let yy = G + 1; yy < y - 1; yy++) world.set(x, yy, z, MAT.STONEBRICK);
            if (y - 1 > G) world.set(x, y - 1, z, MAT.REDSTONE);
            else world.set(x, G, z, MAT.REDSTONE);
            world.set(x, y, z, poweredRailId(slope));
            stats.boosters++;
          } else {
            const end = z === pa + 1 || z === pb - 1;
            const boost = end || ((z - pa) % BOOST_EVERY === 0 && z < pb - 2 && h.get(z - 1) === 0 && h.get(z + 1) === 0);
            flatRail(x, z, RAIL.NS, boost);
            stats.rails--; // counted below
          }
          for (let yy = y + 1; yy <= y + 2; yy++) world.clear(x, yy, z);
          stats.rails++;
          line.cells.push([x, y, z]);
        }
        station(line, x, pa + 1); station(line, x, pb - 1);
        lines.push(line);
      }
    }
  }

  // ---- lay the loop -------------------------------------------------------------
  // Each district gets a ring of its own: the main one keeps the city loop,
  // and an island joined by a bridge is circled too, so a cart can go round
  // it rather than only arriving and stopping.
  for (const ring of [loop, ...extraLoops]) {
  if (ring) {
    const loop = ring;
    const cells = loop.cells;                   // in order round the cycle
    const n = cells.length;
    const dirOf = (i) => {
      const [x, z] = cells[i], [px, pz] = cells[(i - 1 + n) % n], [nx, nz] = cells[(i + 1) % n];
      const has = (dx, dz) => (px - x === dx && pz - z === dz) || (nx - x === dx && nz - z === dz);
      if (has(0, -1) && has(0, 1)) return RAIL.NS;
      if (has(-1, 0) && has(1, 0)) return RAIL.EW;
      if (has(0, 1) && has(1, 0)) return RAIL.SE;
      if (has(0, 1) && has(-1, 0)) return RAIL.SW;
      if (has(0, -1) && has(-1, 0)) return RAIL.NW;
      return RAIL.NE;
    };
    const dirs = cells.map((_, i) => dirOf(i));
    const curve = (i) => dirs[(i + n) % n] >= 6;
    // path distance to the nearest curve, both ways round
    const toCurve = cells.map((_, i) => {
      for (let d = 0; d < n; d++) if (curve(i + d) || curve(i - d)) return d;
      return n;
    });
    const line = { axis: 'loop', loop: true, stations: [], cells: [], k: loop.k };
    let sinceBoost = 0;
    cells.forEach(([x, z], i) => {
      if (curve(i)) {
        bed(x, z);
        world.set(x, G + 1, z, railId(dirs[i]));          // curves cannot be powered
        for (let y = G + 2; y <= G + 3; y++) world.clear(x, y, z);
        stats.rails++;
        sinceBoost++;
      } else {
        // A cart leaves a curve slowly, so a booster goes just after one —
        // but an organic outline bends every few blocks, and a booster at
        // every bend puts five of them in a row doing nothing. So they are
        // kept at least BOOST_MIN apart, and never further than BOOST_EVERY.
        const boost = (toCurve[i] === 2 && sinceBoost >= BOOST_MIN) || sinceBoost >= BOOST_EVERY;
        flatRail(x, z, dirs[i], boost);
        sinceBoost = boost ? 0 : sinceBoost + 1;
      }
      line.cells.push([x, G + 1, z]);
    });
    // the cart starts on plain straight track
    const start = cells.findIndex(([x, z], i) => !curve(i) && world.get(x, G, z) !== MAT.REDSTONE);
    line.stations.push([cells[start][0], G + 1, cells[start][1]]);
    lines.push(line);
    stats.loop = true;
    stats.loopLength = Math.max(stats.loopLength || 0, n);
    stats.loops = (stats.loops || 0) + 1;
  }
  }

  stats.lines = lines.length;
  // one cart per line, on its first station
  const carts = lines.map((l) => ({ type: 'minecart', x: l.stations[0][0], y: l.stations[0][1], z: l.stations[0][2] }));
  return { mode, lines, carts, stats, ringedWhole };
}

// Trees are planted after the railway, and a canopy can hang into the two
// blocks a cart and rider need. Trim foliage out of that space along every
// line (foliage only: nothing structural is ever placed there).
const FOLIAGE = new Set([MAT.LEAVES, MAT.SPRUCE_LEAF, MAT.LOG, MAT.SPRUCE_LOG]);
// Track that leads nowhere.
//
// A few pieces of rail always end up stranded: a viaduct's deck is cut
// through a line that was already at grade, or a line is severed where the
// ground was terraced under it, and what is left is a stub of five or ten
// blocks sitting in a street with nothing at either end. In the game it reads
// as a mistake — a little "U" of track beside a house, or a closed circle of
// curves joining itself — so it is taken up again rather than left.
//
// A run is only removed if it is short AND holds no station: every real line
// records one, bridge lanes included, so anything with a station is a railway
// someone can use however odd it looks.
export function sweepStrandedRails(world, transit, G) {
  if (!transit) return 0;
  const isRail = (id) => id >= 0 && /rail/.test(MATERIALS.def(id).block);
  const rails = new Map();
  world.forEach((x, y, z, id) => { if (isRail(id)) rails.set(x + ',' + y + ',' + z, [x, y, z]); });
  // What counts as scrap. A run is spared if it holds a station or a cart —
  // that is a line the planner meant to lay, however short, and some of them
  // are short by design — or if it is part of a viaduct's lane, which a
  // six-block bridge makes four cells long. What is left over is the other
  // kind: a piece of a line whose station went with the part that was cut
  // away, or track no line claims at all.
  const spared = new Set();
  for (const l of transit.lines) {
    for (const [x, y, z] of l.stations || []) spared.add(x + ',' + y + ',' + z);
    if (l.bridge) for (const [x, y, z] of l.cells) spared.add(x + ',' + y + ',' + z);
  }
  for (const c of transit.carts || []) spared.add(c.x + ',' + c.y + ',' + c.z);

  const seen = new Set();
  let taken = 0, runs = 0;
  for (const start of rails.keys()) {
    if (seen.has(start)) continue;
    const comp = [];
    const q = [start];
    seen.add(start);
    let keeps = false;
    while (q.length) {
      const k = q.pop();
      comp.push(k);
      if (spared.has(k)) keeps = true;
      const [x, y, z] = rails.get(k);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        for (const dy of [0, 1, -1]) {
          const nk = (x + dx) + ',' + (y + dy) + ',' + (z + dz);
          if (rails.has(nk) && !seen.has(nk)) { seen.add(nk); q.push(nk); }
        }
    }
    if (keeps || comp.length > STRANDED_MAX) continue;
    runs++;
    for (const k of comp) {
      const [x, y, z] = rails.get(k);
      world.clear(x, y, z);
      // a booster's redstone block underneath is no use without its rail
      if (world.get(x, y - 1, z) === MAT.REDSTONE) world.set(x, y - 1, z, MAT.GRAVEL);
      taken++;
    }
    // The records go too, or the stats, the exporter and the minecart that
    // was going to be spawned all still believe in the track.
    const gone = new Set(comp);
    for (const l of transit.lines) {
      const before = l.cells.length;
      l.cells = l.cells.filter(([x, y, z]) => !gone.has(x + ',' + y + ',' + z));
      if (l.cells.length !== before) transit.stats.rails -= before - l.cells.length;
      l.stations = (l.stations || []).filter(([x, y, z]) => !gone.has(x + ',' + y + ',' + z));
    }
    transit.carts = (transit.carts || []).filter((c) => !gone.has(c.x + ',' + c.y + ',' + c.z));
  }
  // A viaduct is raised over ground the railway was already crossing, and its
  // piers and abutment take out the track underneath. The line survives
  // either side, so nothing here is stranded — but its record still lists the
  // cells that were wiped, and the stats and the exported carts are counted
  // off that record. So the record is trimmed to the track that is actually
  // there.
  let ghosts = 0;
  for (const l of transit.lines) {
    const before = l.cells.length;
    // where the track ended up a block off the record, the record is
    // corrected rather than tolerated, so "the line says there is rail here"
    // and "there is rail here" mean the same thing afterwards
    l.cells = l.cells.filter((c) => {
      const [x, y, z] = c;
      for (const dy of [0, -1, 1]) if (isRail(world.get(x, y + dy, z))) { c[1] = y + dy; return true; }
      return false;
    });
    if (l.cells.length !== before) {
      ghosts += before - l.cells.length;
      transit.stats.rails -= before - l.cells.length;
      const live = new Set(l.cells.map(([x, y, z]) => x + ',' + y + ',' + z));
      l.stations = (l.stations || []).filter(([x, y, z]) => live.has(x + ',' + y + ',' + z));
    }
  }
  // One rail, one owner. Where a viaduct's lane was laid along track that was
  // already at grade, the world holds a single rail and two lines both claim
  // it. The lane is what was actually built there, so the older line gives up
  // the cell — otherwise the stats count the rail twice and a cart is spawned
  // on a line that no longer runs where it thinks it does.
  const claimed = new Map();
  for (const l of transit.lines) if (l.bridge) for (const [x, y, z] of l.cells) claimed.set(x + ',' + y + ',' + z, l);
  for (const l of transit.lines) {
    if (l.bridge) continue;
    const before = l.cells.length;
    l.cells = l.cells.filter(([x, y, z]) => claimed.get(x + ',' + y + ',' + z) === undefined);
    if (l.cells.length !== before) {
      transit.stats.rails -= before - l.cells.length;
      const kept = new Set(l.cells.map(([x, y, z]) => x + ',' + y + ',' + z));
      l.stations = (l.stations || []).filter(([x, y, z]) => kept.has(x + ',' + y + ',' + z));
    }
  }

  transit.lines = transit.lines.filter((l) => l.cells.length);
  const live = new Set();
  for (const l of transit.lines) for (const [x, y, z] of l.cells) live.add(x + ',' + y + ',' + z);
  // A line that lost the cell its cart or its station stood on keeps both —
  // they move to track it still has. Dropping them instead would leave a
  // working railway with nothing running on it.
  transit.carts = (transit.carts || []).filter((c) => live.has(c.x + ',' + c.y + ',' + c.z));
  const hasCart = new Set(transit.carts.map((c) => c.x + ',' + c.y + ',' + c.z));
  for (const l of transit.lines) {
    if (!l.stations || !l.stations.length) l.stations = [l.cells[Math.floor(l.cells.length / 2)].slice()];
    if (l.cells.some(([x, y, z]) => hasCart.has(x + ',' + y + ',' + z))) continue;
    const [x, y, z] = l.stations[0];
    transit.carts.push({ type: 'minecart', x, y, z });
    hasCart.add(x + ',' + y + ',' + z);
  }
  transit.stats.stranded = runs;
  transit.stats.ghosts = ghosts;
  return taken;
}

export function trimOverRails(world, transit) {
  if (!transit) return 0;
  let n = 0;
  for (const l of transit.lines) {
    for (const [x, y, z] of l.cells) {
      for (let yy = y + 1; yy <= y + 2; yy++) {
        const id = world.get(x, yy, z);
        if (id !== -1 && FOLIAGE.has(id)) { world.clear(x, yy, z); n++; }
      }
    }
  }
  return n;
}

// Chebyshev distance of every city cell to the nearest non-city cell (or the
// edge of the plan). 0 outside the city.
export function edgeDistance(plan, within = null) {
  const { W, D } = plan;
  // "within" narrows it to one district, so a split city measures its main
  // part rather than the gaps between its pieces
  const inCity = (i) => ((plan.mask ? plan.mask[i] === 1 : plan.use[i] !== USE.EMPTY)
    && (!within || within(i % W, (i - (i % W)) / W)));
  const O = new Int16Array(W * D);
  const q = [];
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (!inCity(i)) continue;
      let edge = false;
      for (let dz = -1; dz <= 1 && !edge; dz++) for (let dx = -1; dx <= 1 && !edge; dx++) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= D || !inCity(nz * W + nx)) edge = true;
      }
      if (edge) { O[i] = 1; q.push(i); }
    }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, z = (i - x) / W;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
      const j = nz * W + nx;
      if (!inCity(j) || O[j]) continue;
      O[j] = O[i] + 1; q.push(j);
    }
  }
  return O;
}

// A ring that follows the city's edge, like the wall does: the bounding box
// of the district, drawn inward until every cell of the rectangle is road.
// It cannot double back on itself the way a traced contour can, so the track
// is a plain circuit with four corners.
function rectRing(W, D, cells, isRoad) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const i of cells) {
    const x = i % W, z = (i - x) / W;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
  }
  for (let m = 2; m <= 14; m++) {
    const a = x0 + m, b = x1 - m, c = z0 + m, d = z1 - m;
    if (b - a < 16 || d - c < 16) break;
    const ring = [];
    for (let x = a; x <= b; x++) ring.push([x, c]);
    for (let z = c + 1; z <= d; z++) ring.push([b, z]);
    for (let x = b - 1; x >= a; x--) ring.push([x, d]);
    for (let z = d - 1; z > c; z--) ring.push([a, z]);
    if (ring.every(([x, z]) => isRoad(x, z))) return ring;
  }
  return null;
}

// Is this ring a real circuit — no cell beside another it is not next to in
// the walk, and wide enough to be a loop rather than a there-and-back?
function tidyRing(cells) {
  const n = cells.length;
  const at = new Map();
  cells.forEach(([x, z], i) => at.set(x + ',' + z, i));
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const [x, z] = cells[i];
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = at.get((x + dx) + ',' + (z + dz));
      if (j === undefined) continue;
      const step = Math.min((j - i + n) % n, (i - j + n) % n);
      if (step > 1) return false;               // the ring touches itself
    }
  }
  return Math.min(x1 - x0, z1 - z0) >= 12;      // and it encloses something
}

// Walking the edge of a region: from the top-left cell, step round it with a
// hand on the wall, which comes back to where it started however ragged the
// shape is. The result is thinned so that no cell repeats and each is next to
// the one before, which is what the rails need.
function traceContour(W, D, ok) {
  let start = null;
  for (let z = 0; z < D && !start; z++) for (let x = 0; x < W; x++) if (ok(x, z)) { start = [x, z]; break; }
  if (!start) return null;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const path = [];
  const seen = new Set();
  let [cx, cz] = start, dir = 0;
  for (let step = 0; step < W * D * 4; step++) {
    const key = cx + ',' + cz;
    if (!seen.has(key)) { seen.add(key); path.push([cx, cz]); }
    // turn as far left as possible, then try straight on, then right
    let moved = false;
    for (let t = 3; t <= 6; t++) {
      const nd = (dir + t) % 4;
      const nx = cx + DIRS[nd][0], nz = cz + DIRS[nd][1];
      if (nx < 0 || nz < 0 || nx >= W || nz >= D || !ok(nx, nz)) continue;
      cx = nx; cz = nz; dir = nd; moved = true;
      break;
    }
    if (!moved) return null;
    if (cx === start[0] && cz === start[1] && path.length > 8) break;
  }
  // the walk may double back on itself; keep only the cells that carry on
  const out = [];
  for (const [x, z] of path) {
    if (!out.length) { out.push([x, z]); continue; }
    const [px, pz] = out[out.length - 1];
    if (Math.abs(px - x) + Math.abs(pz - z) === 1) out.push([x, z]);
  }
  // The ends have to meet. A walk that comes back beside its own middle
  // rather than its start still holds a circuit inside it, so the lead-in is
  // dropped and the circuit kept.
  const [lx, lz] = out[out.length - 1];
  let cut = -1;
  for (let i = 0; i < out.length - 8; i++) {
    if (Math.abs(out[i][0] - lx) + Math.abs(out[i][1] - lz) === 1) { cut = i; break; }
  }
  if (cut < 0) return null;
  const ring = out.slice(cut);
  return ring.length >= 40 ? ring : null;
}

// The cells must form one simple closed loop: every cell a road cell with
// exactly two loop neighbours (4-connected), all in a single cycle. Returns
// the cells in order round the loop, or null.
function traceCycle(ring, ok) {
  if (ring.length < 16) return null;
  const set = new Set(ring.map(([x, z]) => x + ',' + z));
  const nb = (x, z) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [x + dx, z + dz]).filter(([a, b]) => set.has(a + ',' + b));
  for (const [x, z] of ring) if (!ok(x, z) || nb(x, z).length !== 2) return null;
  const out = [ring[0]];
  const seen = new Set([ring[0].join()]);
  let cur = ring[0], prev = null;
  for (;;) {
    const next = nb(cur[0], cur[1]).find((c) => !prev || c.join() !== prev.join());
    if (!next) return null;
    if (next.join() === ring[0].join()) break;
    if (seen.has(next.join())) return null;
    seen.add(next.join()); out.push(next); prev = cur; cur = next;
  }
  return out.length === ring.length ? out : null;
}

