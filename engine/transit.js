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

import { MAT, railId, poweredRailId, RAIL } from './materials.js';
import { USE } from './plan.js';

export const TRANSIT_MODES = ['roads', 'rails', 'trams'];
const RAMP = 4;           // blocks of climb
const CLEAR_GAP = 10;     // crossings closer than this share one bridge
const BOOST_EVERY = 16;
const BOOST_MIN = 6;              // no closer together than this, even at bends

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
  const O = edgeDistance(plan);
  let loop = null;
  for (const k of [3, 2]) {
    const ring = [];
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (O[z * W + x] === k) ring.push([x, z]);
    const cyc = traceCycle(ring, (x, z) => road(x, z));
    if (cyc) { loop = { k, cells: cyc }; break; }
  }
  const minO = loop ? loop.k + 2 : 2;
  const inner = (x, z) => road(x, z) && O[z * W + x] >= minO;
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
  if (loop) {
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
    stats.loopLength = n;
  }

  stats.lines = lines.length;
  // one cart per line, on its first station
  const carts = lines.map((l) => ({ type: 'minecart', x: l.stations[0][0], y: l.stations[0][1], z: l.stations[0][2] }));
  return { mode, lines, carts, stats };
}

// Trees are planted after the railway, and a canopy can hang into the two
// blocks a cart and rider need. Trim foliage out of that space along every
// line (foliage only: nothing structural is ever placed there).
const FOLIAGE = new Set([MAT.LEAVES, MAT.SPRUCE_LEAF, MAT.LOG, MAT.SPRUCE_LOG]);
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
export function edgeDistance(plan) {
  const { W, D } = plan;
  const inCity = (i) => (plan.mask ? plan.mask[i] === 1 : plan.use[i] !== USE.EMPTY);
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

