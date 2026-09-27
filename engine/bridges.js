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
  // Two lanes and a rail: a bridge carries the traffic of the street it
  // joins, and the loop has to be able to run across it.
  const width = Math.max(7, Math.min(9, (cfg.streetWidth | 0 || 5) + 2));
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
// Track across a bridge, joined to the rings at both ends.
//
// A rail connects in two directions only — there is no three-way junction
// without a switch — so a spur cannot simply tee into a ring. Instead the
// bridge carries two tracks, one each way, and each ring is DIVERTED into
// one of them: the ring cell where the bridge meets it is turned into a
// curve leading onto the deck. What was three separate railways (ring,
// bridge, ring) becomes one circuit that runs round one district, crosses,
// runs round the other, and crosses back.
//
// A lane end does not always have the ring straight in front of it. Where the
// ring runs parallel to one side of the deck, the lane on that side meets it
// at once and the lane on the other side never does: searching straight
// inward walks alongside the ring for its whole length and finds nothing, and
// that end is left as a buffer. So the search is L-shaped — inward, then a
// turn — and the spur is built with a curve at the corner. Four lane ends per
// bridge, four joins.
export function bridgeRails(world, bridges, transit, G) {
  if (!transit || !bridges.length) return 0;
  const REACH_IN = 28;            // how far inward a spur may run
  const REACH_LAT = 20;           // and how far it may turn aside after that

  const railAt = (x, y, z) => {
    const id = world.get(x, y, z);
    return id >= 0 && /rail/.test(MATERIALS.def(id).block);
  };
  // The cells of every ring. A spur should join the loop, not the first
  // stray piece of track it happens to meet, so a ring cell always beats a
  // nearer non-ring one.
  const ringCells = new Set();
  for (const line of transit.lines || []) {
    if (!line.loop) continue;
    for (const [x, y, z] of line.cells) ringCells.add(x + ',' + y + ',' + z);
  }
  // cells this function has laid or bent: two spurs must not cross, and a
  // ring cell already turned onto one lane cannot be turned onto another
  const taken = new Set();
  const key = (x, y, z) => x + ',' + y + ',' + z;

  // the curve joining two directions, each a unit step
  const curveFor = (a, b) => {
    const dx = a[0] + b[0], dz = a[1] + b[1];
    return dx > 0 ? (dz > 0 ? RAIL.SE : RAIL.NE) : (dz > 0 ? RAIL.SW : RAIL.NW);
  };

  let laid = 0;
  for (const b of bridges) {
    const alongX = b.axis === 'x';
    const dir = alongX ? RAIL.EW : RAIL.NS;
    const cross = alongX ? RAIL.NS : RAIL.EW;
    const half = b.width >> 1;
    // the two lanes sit either side of the middle of the deck
    const lanes = [-1, 1].map((side) => {
      const cells = [];
      for (let k = 1; k < b.length - 1; k++) {
        const base = [alongX ? b.from[0] + b.dir * k : b.from[0], alongX ? b.from[1] : b.from[1] + b.dir * k];
        const x = alongX ? base[0] : base[0] + side * (half - 1);
        const z = alongX ? base[1] + side * (half - 1) : base[1];
        const y = b.deckY + 1;
        const boost = k % 9 === 4;
        world.set(x, b.deckY, z, boost ? MAT.REDSTONE : MAT.GRAVEL);
        world.set(x, y, z, boost ? poweredRailId(dir) : railId(dir));
        for (let h = 1; h <= 3; h++) world.clear(x, y + h, z);
        cells.push([x, y, z]);
      }
      return cells;
    });

    // Where a lane runs out onto the bank, look for a ring — in front of the
    // end, or off to one side of it — and lead the lane onto it, bending the
    // ring's own rail to meet the spur so a cart runs straight through.
    let joined = 0;
    const ends = [];
    for (const cells of lanes) {
      if (cells.length < 4) continue;
      for (const end of [cells[0], cells[cells.length - 1]]) {
        const inward = end === cells[0] ? -b.dir : b.dir;
        const step = alongX ? [inward, 0] : [0, inward];       // along the bridge
        const latU = alongX ? [0, 1] : [1, 0];                 // across it
        // where a cell (a inward, l aside) lands
        const at = (a, l) => [end[0] + step[0] * a + latU[0] * l, end[2] + step[1] * a + latU[1] * l];

        // Try one corner: a cells inward, then l aside. A candidate only
        // counts if the whole spur can actually be built — the way to it
        // clear of track, and the rail it reaches lying across the approach
        // so there is something to curve onto. Checking that here rather
        // than after choosing means a blocked or unturnable candidate is
        // passed over for the next one instead of losing the end.
        let sawRail = false;               // track at deck level, usable or not
        const consider = (a, l) => {
          const [jx, jz] = at(a, l);
          let jy = null;
          for (let dy = 1; dy >= -1; dy--) {
            const yy = end[1] + dy;
            if (!railAt(jx, yy, jz)) continue;
            sawRail = true;
            if (!taken.has(key(jx, yy, jz))) { jy = yy; break; }
          }
          if (jy === null) return null;

          const sign = Math.sign(l);
          const y = end[1];
          const path = [];
          for (let k = 1; k <= (l === 0 ? a - 1 : a); k++) path.push({ pos: at(k, 0), rail: dir });
          if (l !== 0) {
            if (!path.length) return null;                     // no room for a corner
            path[path.length - 1].rail = curveFor([-step[0], -step[1]], [latU[0] * sign, latU[1] * sign]);
            for (let m = 1; m < Math.abs(l); m++) path.push({ pos: at(a, sign * m), rail: cross });
          }
          for (const { pos } of path)
            if (taken.has(key(pos[0], y, pos[1])) || railAt(pos[0], y, pos[1])) return null;

          // Which side of the junction the rest of the ring lies on decides
          // the curve, so it is looked up rather than assumed — and "side"
          // is relative to however the spur arrives, not to the bridge,
          // since it may come round a corner.
          const approach = l === 0 ? step : [latU[0] * sign, latU[1] * sign];
          const side = [[approach[1], approach[0]], [-approach[1], -approach[0]]];
          let ringSide = null;
          for (const [sx, sz] of side)
            if (railAt(jx + sx, jy, jz + sz) || railAt(jx + sx, jy + 1, jz + sz) || railAt(jx + sx, jy - 1, jz + sz)) { ringSide = [sx, sz]; break; }
          if (!ringSide) return null;

          const curve = curveFor([-approach[0], -approach[1]], ringSide);
          const ring = ringCells.has(key(jx, jy, jz));
          // a ring always beats a stray piece of track, then the shortest
          // run, then the straightest
          const score = (ring ? 0 : 1e6) + (a + Math.abs(l)) * 10 + Math.abs(l);
          return { score, a, l, path, jx, jy, jz, curve, ring, y };
        };

        let best = null;
        for (let a = 1; a <= REACH_IN; a++)
          for (let l = -REACH_LAT; l <= REACH_LAT; l++) {
            const c = consider(a, l);
            if (c && (!best || c.score < best.score)) best = c;
          }
        if (!best) {
          // Say which of the three it is, because they want different fixes.
          // A ring below the deck needs the spur to descend, which it cannot
          // do; nothing in reach at all means the bank carries no railway
          // near this end; anything else is a spur that could not be routed.
          let below = false;
          for (let a = 1; a <= REACH_IN && !below; a++)
            for (let l = -REACH_LAT; l <= REACH_LAT && !below; l++) {
              const [x, z] = at(a, l);
              for (let dy = -5; dy <= 5; dy++)
                if (Math.abs(dy) > 1 && railAt(x, end[1] + dy, z)) { below = true; break; }
            }
          ends.push({ joined: false, why: sawRail ? 'no way through to the track in front of it' : below ? 'the ring is not at deck level' : 'no track within reach' });
          continue;
        }

        for (const { pos, rail } of best.path) {
          const [x, z] = pos;
          if (!world.has(x, best.y - 1, z)) world.set(x, best.y - 1, z, MAT.GRAVEL);
          world.set(x, best.y, z, railId(rail));
          for (let h = 1; h <= 3; h++) world.clear(x, best.y + h, z);
          taken.add(key(x, best.y, z));
          cells.push([x, best.y, z]);
        }
        // Bend the ring's own rail so it leads onto the spur. A rail joins
        // two directions and no more, so the ring gives way here: a cart
        // coming round is turned onto the bridge instead of carrying on.
        world.set(best.jx, best.jy, best.jz, railId(best.curve));
        taken.add(key(best.jx, best.jy, best.jz));
        joined++;
        ends.push({ joined: true, a: best.a, leg: Math.abs(best.l), ring: best.ring });
      }
    }

    for (const cells of lanes) {
      if (cells.length < 4) continue;
      const mid = cells[Math.floor(cells.length / 2)];
      transit.lines.push({ axis: alongX ? 'x' : 'z', bridge: true, cells, stations: [mid] });
      transit.carts.push({ type: 'minecart', x: mid[0], y: mid[1], z: mid[2] });
      transit.stats.lines++;
      transit.stats.rails += cells.length;
      laid++;
    }
    b.joined = joined;
    b.ends = ends;
  }
  return laid;
}
