// engine/bridges.js — long bridges between the parts of a city.
//
// On real ground a city rarely comes out as one lump: a river, a bluff or a
// patch of unexplored land splits it, and the outline used to keep only the
// piece holding downtown and throw the rest away. Instead the outlying
// districts are kept and joined to the main one by a viaduct: a straight deck
// on piers, wide enough for the street it carries, with railings, lamps, and
// track where the city has a railway.
//
// The wall does not follow a bridge. Both ends are inside a walled district
// already, and a wall across a viaduct would only be a gate nobody opens.

import { MAT, MATERIALS, stairId, WEIRDO, railId, poweredRailId, RAIL } from './materials.js';
import { USE } from './plan.js';

// ---- finding the crossings ------------------------------------------------
// Each district is a set of city cells. For every one that is not the main
// district, the shortest straight run to it — along a row or a column — is
// the bridge.
export function planBridges(plan, cfg, districts) {
  if (!cfg.bridges || districts.length < 2) return [];
  const { W, D, use } = plan;
  const main = districts[0];
  const width = Math.max(3, Math.min(7, cfg.streetWidth | 0 || 5));
  const spans = [];
  const inMain = (i) => main.has(i);

  for (const other of districts.slice(1)) {
    let best = null;
    // try every row and column the other district touches
    const rows = new Set(), cols = new Set();
    for (const i of other) { const x = i % W; rows.add((i - x) / W); cols.add(x); }
    const consider = (fixed, along, axis) => {
      // walk out from the district along this line until the main one is met
      for (const dir of [1, -1]) {
        let x = axis === 'x' ? along : fixed, z = axis === 'x' ? fixed : along;
        let gap = 0;
        for (let step = 1; step <= 96; step++) {
          const nx = axis === 'x' ? x + dir * step : x;
          const nz = axis === 'x' ? z : z + dir * step;
          if (nx < 1 || nz < 1 || nx >= W - 1 || nz >= D - 1) break;
          const j = nz * W + nx;
          if (other.has(j)) { gap = 0; continue; }          // still in the home district
          gap++;
          if (inMain(j)) {
            if (gap >= 3 && (!best || gap < best.gap)) best = { axis, fixed, from: [x, z], to: [nx, nz], gap, dir };
            break;
          }
        }
      }
    };
    for (const z of rows) {
      // the cell of this district furthest along the row, both ways
      let lo = Infinity, hi = -Infinity;
      for (const i of other) { const x = i % W; if ((i - x) / W !== z) continue; lo = Math.min(lo, x); hi = Math.max(hi, x); }
      if (lo <= hi) { consider(z, lo, 'x'); consider(z, hi, 'x'); }
    }
    for (const x of cols) {
      let lo = Infinity, hi = -Infinity;
      for (const i of other) { if (i % W !== x) continue; const z = (i - (i % W)) / W; lo = Math.min(lo, z); hi = Math.max(hi, z); }
      if (lo <= hi) { consider(x, lo, 'z'); consider(x, hi, 'z'); }
    }
    if (best) spans.push({ ...best, width });
  }

  // the deck's cells become street, so the city builds and exports them
  for (const s of spans) {
    const half = s.width >> 1;
    s.cells = [];
    const steps = Math.abs(s.axis === 'x' ? s.to[0] - s.from[0] : s.to[1] - s.from[1]);
    for (let k = 0; k <= steps; k++) {
      const x = s.axis === 'x' ? s.from[0] + s.dir * k : s.from[0];
      const z = s.axis === 'x' ? s.from[1] : s.from[1] + s.dir * k;
      for (let w = -half; w <= half; w++) {
        const cx = s.axis === 'x' ? x : x + w;
        const cz = s.axis === 'x' ? z + w : z;
        if (cx < 0 || cz < 0 || cx >= W || cz >= D) continue;
        const i = cz * W + cx;
        use[i] = USE.ROAD;
        if (plan.mask) plan.mask[i] = 1;
        s.cells.push([cx, cz, w]);
      }
    }
  }
  return spans;
}

// ---- building them --------------------------------------------------------
// The deck is flat, at whichever end is higher, with piers down to the ground
// and railings along the edges. A lamp every eight blocks.
export function buildBridges(world, plan, spans, hills, G, terrain, buildings = []) {
  const { W } = plan;
  // a ramp must not bury a doorway: the buildings are already up by now
  const doorways = new Set();
  for (const rec of buildings)
    for (const [dx, dz] of rec.doorCells || [])
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) doorways.add((dx + ox) + ',' + (dz + oz));
  const built = [];
  for (const s of spans) {
    const levelAt = (x, z) => G + (hills && hills.elev ? hills.elev[z * W + x] : 0);
    const deckY = Math.max(levelAt(s.from[0], s.from[1]), levelAt(s.to[0], s.to[1]));
    const half = s.width >> 1;
    let piers = 0, lamps = 0;
    const alongX = s.axis === 'x';
    const steps = Math.abs(alongX ? s.to[0] - s.from[0] : s.to[1] - s.from[1]);
    for (let k = 0; k <= steps; k++) {
      const bx = alongX ? s.from[0] + s.dir * k : s.from[0];
      const bz = alongX ? s.from[1] : s.from[1] + s.dir * k;
      for (let w = -half; w <= half; w++) {
        const x = alongX ? bx : bx + w;
        const z = alongX ? bz + w : bz;
        // the deck, and the parapet along its edges
        world.set(x, deckY, z, MAT.ASPHALT);
        for (let y = deckY + 1; y <= deckY + 5; y++) world.clear(x, y, z);
        if (Math.abs(w) === half) {
          world.set(x, deckY + 1, z, MAT.STONEBRICK);
          if (k % 8 === 0) { world.set(x, deckY + 2, z, MAT.LAMP); lamps++; }
        }
      }
      // piers every four blocks, down to whatever is beneath
      if (k % 4 === 0 && k > 0 && k < steps) {
        for (const w of [-half, half]) {
          const x = alongX ? bx : bx + w;
          const z = alongX ? bz + w : bz;
          const groundY = terrain && terrain.ground ? G + (terrain.ground[z * W + x] - terrain.baseY) : G;
          for (let y = deckY - 1; y >= Math.min(groundY, deckY - 1); y--) world.set(x, y, z, MAT.STONEBRICK);
          piers++;
        }
      }
    }
    // steps down where the deck meets a lower street
    for (const end of [s.from, s.to]) {
      const endY = levelAt(end[0], end[1]);
      if (endY >= deckY) continue;
      for (let d = 1; d <= deckY - endY; d++) {
        const x = alongX ? end[0] + (end === s.from ? -s.dir * d : s.dir * d) : end[0];
        const z = alongX ? end[1] : end[1] + (end === s.from ? -s.dir * d : s.dir * d);
        for (let w = -half; w <= half; w++) {
          const cx = alongX ? x : x + w;
          const cz = alongX ? z + w : z;
          if (doorways.has(cx + ',' + cz)) continue;          // leave the way into a building alone
          world.set(cx, deckY - d, cz, MAT.ASPHALT);
          for (let y = deckY - d + 1; y <= deckY + 4; y++) world.clear(cx, y, cz);
        }
      }
    }
    built.push({ ...s, deckY, piers, lamps, length: steps + 1 });
  }
  return built;
}

// Track along a bridge, laid after the railway so it joins the same records:
// a line of its own, buffered at both ends, with a cart on it.
export function bridgeRails(world, bridges, transit, G) {
  if (!transit || !bridges.length) return 0;
  let laid = 0;
  for (const b of bridges) {
    const alongX = b.axis === 'x';
    const dir = alongX ? RAIL.EW : RAIL.NS;
    const cells = [];
    for (let k = 1; k < b.length - 1; k++) {
      const x = alongX ? b.from[0] + b.dir * k : b.from[0];
      const z = alongX ? b.from[1] : b.from[1] + b.dir * k;
      const y = b.deckY + 1;
      const boost = k % 16 === 8;
      world.set(x, b.deckY, z, boost ? MAT.REDSTONE : MAT.GRAVEL);
      world.set(x, y, z, boost ? poweredRailId(dir) : railId(dir));
      for (let h = 1; h <= 3; h++) world.clear(x, y + h, z);
      cells.push([x, y, z]);
    }
    if (cells.length < 4) continue;
    for (const [x, y, z] of [cells[0], cells[cells.length - 1]]) {
      const step = [cells[1][0] - cells[0][0], cells[1][2] - cells[0][2]];
      const away = (x === cells[0][0] && z === cells[0][2]) ? [-step[0], -step[1]] : step;
      world.set(x + away[0], y - 1, z + away[1], MAT.GRAVEL);
      world.set(x + away[0], y, z + away[1], MAT.STONEBRICK);
    }
    const mid = cells[Math.floor(cells.length / 2)];
    transit.lines.push({ axis: alongX ? 'x' : 'z', bridge: true, cells, stations: [mid] });
    transit.carts.push({ type: 'minecart', x: mid[0], y: mid[1], z: mid[2] });
    transit.stats.lines++;
    transit.stats.rails += cells.length;
    laid++;
  }
  return laid;
}
