// engine/bridges.js — long bridges between the parts of a city.
//
// On real ground a city rarely comes out as one lump: a river, a bluff or a
// patch of unexplored land splits it, and the outline used to keep only the
// piece holding downtown and throw the rest away. Instead the outlying
// districts are kept and joined to the main one by a viaduct: a deck on
// piers, wide enough for the street it carries, with railings, lamps, and
// track where the city has a railway.
//
// The wall does not follow a bridge. Both ends are inside a walled district
// already, and a wall across a viaduct would only be a gate nobody opens.
//
// SHAPE
// -----
// A span is a POLYLINE: a list of centre cells, each one step north, south,
// east or west from the last. A plain bridge is a straight run of that list
// and nothing else about it changes. Two things need more than a straight
// run:
//
//   angled spans   Two districts are not always a row or a column apart. When
//                  no straight crossing exists the span is laid as a
//                  staircase between the two nearest banks, which reaches
//                  districts that used to be left off the network entirely.
//
//   bent ends      The deck used to stop at the first cell of the district it
//                  reached, wherever that happened to be, and the track then
//                  went looking for the ring with an L-shaped spur. A spur
//                  with a leg in it is the wrong shape: the join wants to be
//                  a single curve. So the deck's ends are BENT to meet the
//                  ring — the polyline carries on round a corner until it
//                  stands square on the ring's contour, one cell short of the
//                  track, with its two lanes straddling the crossing. Each
//                  lane then turns onto the ring with one curve and no
//                  detour. The spur search is still there for the ends no
//                  bend could serve.
//
// A bend has to know where the ring actually runs, so it is worked out when
// the bridge is BUILT — after the railway has been laid — rather than when it
// is planned. Planning only reserves the carriageway.

import { MAT, MATERIALS, railId, poweredRailId, RAIL } from './materials.js';
import { USE } from './plan.js';

const MAX_GAP = 96;        // no span longer than this
const MIN_GAP = 3;         // shorter than this is not a bridge, it is a kerb
const TAIL_MAX = 14;       // how far a bent end may carry on into a district
const LEAD = 2;            // cells of straight run before a bend meets the ring
const BOOST_EVERY = 9;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---- polyline geometry ----------------------------------------------------

// A 4-connected staircase from a to b, inclusive of both. Straight when the
// two share a row or a column; otherwise it steps along the long axis and
// takes a step along the short one wherever the error says so.
export function stepsAlong(a, b) {
  const [ax, az] = a, [bx, bz] = b;
  const dx = bx - ax, dz = bz - az;
  const sx = Math.sign(dx), sz = Math.sign(dz);
  const mx = Math.abs(dx), mz = Math.abs(dz);
  const major = Math.max(mx, mz), minor = Math.min(mx, mz);
  const alongX = mx >= mz;
  const path = [[ax, az]];
  let x = ax, z = az, err = 0;
  for (let k = 0; k < major; k++) {
    if (alongX) x += sx; else z += sz;
    path.push([x, z]);
    err += minor;
    if (minor > 0 && err >= major) {
      err -= major;
      if (alongX) z += sz; else x += sx;
      path.push([x, z]);
    }
  }
  return path;
}

// the unit step leaving cell k (at the last cell, the one that arrived)
export function dirAt(path, k) {
  const n = path.length;
  if (n < 2) return [1, 0];
  const [x0, z0] = k < n - 1 ? path[k] : path[n - 2];
  const [x1, z1] = k < n - 1 ? path[k + 1] : path[n - 1];
  const dx = Math.sign(x1 - x0), dz = Math.sign(z1 - z0);
  return dx || dz ? [dx, dz] : [1, 0];
}
const perpOf = (d) => [-d[1], d[0]];
const key2 = (x, z) => x + ',' + z;
const key3 = (x, y, z) => x + ',' + y + ',' + z;

// every cell of the carriageway at path index k, across the deck. At a corner
// both the arriving and the leaving cross-section are laid, which fills the
// inside of the bend so the deck is one piece.
function stripAt(path, k, half) {
  const out = [];
  const seen = new Set();
  const dirs = [dirAt(path, k)];
  if (k > 0) dirs.push(dirAt(path, k - 1));
  for (const d of dirs) {
    const p = perpOf(d);
    for (let w = -half; w <= half; w++) {
      const x = path[k][0] + p[0] * w, z = path[k][1] + p[1] * w;
      const kk = key2(x, z);
      if (seen.has(kk)) continue;
      seen.add(kk);
      out.push([x, z, w]);
    }
  }
  // at a corner the deck turns full width, a square (the two crossings alone left
  // the outside of the bend open: the deck pinched there, and the loop two in from
  // its edge could not get round)
  if (dirs.length === 2 && (dirs[0][0] !== dirs[1][0] || dirs[0][1] !== dirs[1][1])) {
    const p = perpOf(dirs[0]);
    for (let dz = -half; dz <= half; dz++) for (let dx = -half; dx <= half; dx++) {
      const x = path[k][0] + dx, z = path[k][1] + dz, kk = key2(x, z);
      if (seen.has(kk)) continue;
      seen.add(kk);
      out.push([x, z, Math.max(Math.abs(dx), Math.abs(dz)) * (p[0] * dx + p[1] * dz < 0 ? -1 : 1)]);
    }
  }
  return out;
}

// A polyline that doubles back is cut back to where it was before the
// excursion, so what comes out is a simple path: no cell twice, every step
// one cell. Both the offset lanes and the bent tails need this — an offset
// bunches up on the inside of a bend, and a staircase aimed at a lead-in cell
// can walk through the approach on its way there.
export function trimLoops(cells) {
  const out = [];
  const seen = new Map();
  for (const [x, z] of cells) {
    const kk = key2(x, z);
    if (seen.has(kk)) {
      const j = seen.get(kk);
      for (let i = out.length - 1; i > j; i--) seen.delete(key2(out[i][0], out[i][1]));
      out.length = j + 1;
      continue;
    }
    seen.set(kk, out.length);
    out.push([x, z]);
  }
  return out;
}

// every step of a polyline is one cell north, south, east or west
export function unitPath(path) {
  for (let k = 1; k < path.length; k++) {
    const dx = Math.abs(path[k][0] - path[k - 1][0]), dz = Math.abs(path[k][1] - path[k - 1][1]);
    if (dx + dz !== 1) return false;
  }
  return path.length > 1;
}

// ---- finding the crossings ------------------------------------------------
// Each district is a set of city cells. For every one that is not the main
// district the shortest crossing is found: a straight run along a row or a
// column first, because a straight bridge is the better bridge, and a
// staircase between the nearest banks only when no straight run exists.
export function planBridges(plan, cfg, districts) {
  if (!cfg.bridges || districts.length < 2) return [];
  const { W, D, use } = plan;
  const main = districts[0];
  // Two tracks, one each way, a kerb either side: five across, the tracks two
  // apart (side by side they would run into each other). Wider was not needed.
  const width = 5;
  const half = width >> 1;
  const spans = [];
  // Joined in a chain: each district to whatever is joined already (downtown's
  // district, the districts bridged so far, their bridges), the nearest first, so
  // a district reached only through another is still reached. (Each used to be
  // bridged only to downtown's, and one more than a span away from it, behind
  // another, was left with no road or rail to the rest.)
  const joined = new Set(main);
  const left = districts.slice(1);
  while (left.length) {
    const inJoined = (i) => joined.has(i);
    let pick = null;
    for (let k = 0; k < left.length; k++) {
      const other = left[k];
      // a street carried on across, centred on it: straight if its line reaches
      // the far side's street, else curving from the end of one street to the
      // end of another; only then the old searches
      let best = centredCrossing(plan, other, inJoined, half) || curvedCrossing(plan, other, inJoined, half);
      if (!best) {
        best = straightCrossing(W, D, other, inJoined);
        if (best) { best.path = stepsAlong(best.from, best.to); best.angled = false; }
        else best = angledCrossing(W, D, other, joined, half);
      }
      if (!best) continue;
      const len = Math.abs(best.from[0] - best.to[0]) + Math.abs(best.from[1] - best.to[1]);
      if (!pick || len < pick.len) pick = { k, best, len };
    }
    if (!pick) break;                                        // nothing left can be reached
    const other = left.splice(pick.k, 1)[0];
    spans.push({ ...pick.best, width, half });
    for (const i of other) joined.add(i);
    for (let k = 0; k < pick.best.path.length; k++)
      for (const [cx, cz] of stripAt(pick.best.path, k, half)) if (cx >= 0 && cz >= 0 && cx < W && cz < D) joined.add(cz * W + cx);
  }

  // the deck's cells become street, so the city builds and exports them
  for (const s of spans) {
    s.cells = [];
    for (let k = 0; k < s.path.length; k++)
      for (const [cx, cz, w] of stripAt(s.path, k, s.half)) {
        if (cx < 0 || cz < 0 || cx >= W || cz >= D) continue;
        const i = cz * W + cx;
        // (the cells over the gap, not on either shore: the divider goes only there)
        if (plan.mask && !plan.mask[i]) (s.gapCells || (s.gapCells = new Set())).add(i);
        use[i] = USE.ROAD;
        if (plan.mask) plan.mask[i] = 1;
        (plan.bridgeCells || (plan.bridgeCells = new Set())).add(i);   // (no ordinary line runs on a bridge: transit.js)
        s.cells.push([cx, cz, w]);
      }
    s.length = s.path.length;
  }
  return spans;
}

// The old search, kept whole because a straight bridge is still what most
// split cities want: walk out from the district along every row and column it
// touches until the main one is met, and take the shortest gap.
function straightCrossing(W, D, other, inMain) {
  let best = null;
  const rows = new Set(), cols = new Set();
  for (const i of other) { const x = i % W; rows.add((i - x) / W); cols.add(x); }
  const consider = (fixed, along, axis) => {
    for (const dir of [1, -1]) {
      const x = axis === 'x' ? along : fixed, z = axis === 'x' ? fixed : along;
      let gap = 0;
      for (let step = 1; step <= MAX_GAP; step++) {
        const nx = axis === 'x' ? x + dir * step : x;
        const nz = axis === 'x' ? z : z + dir * step;
        if (nx < 1 || nz < 1 || nx >= W - 1 || nz >= D - 1) break;
        const j = nz * W + nx;
        if (other.has(j)) { gap = 0; continue; }          // still in the home district
        gap++;
        if (inMain(j)) {
          if (gap >= MIN_GAP && (!best || gap < best.gap)) best = { axis, fixed, from: [x, z], to: [nx, nz], gap, dir };
          break;
        }
      }
    }
  };
  for (const z of rows) {
    let lo = Infinity, hi = -Infinity;
    for (const i of other) { const x = i % W; if ((i - x) / W !== z) continue; lo = Math.min(lo, x); hi = Math.max(hi, x); }
    if (lo <= hi) { consider(z, lo, 'x'); consider(z, hi, 'x'); }
  }
  for (const x of cols) {
    let lo = Infinity, hi = -Infinity;
    for (const i of other) { if (i % W !== x) continue; const z = (i - (i % W)) / W; lo = Math.min(lo, z); hi = Math.max(hi, z); }
    if (lo <= hi) { consider(x, lo, 'z'); consider(x, hi, 'z'); }
  }
  return best;
}

// ---- a street carried on across -------------------------------------------------
// A bridge carries a street on: it leaves on a street's centre line and lands on
// one (it used to take the shortest gap along any row, and landed off the street).
// The streets: the corridors' centre lines; where one leaves a district, the last
// cell in it is an exit, heading out.
function streetExits(plan, inSet, half) {
  const { W, D, use, corridors } = plan;
  const street = (x, z) => x >= 0 && z >= 0 && x < W && z < D && (use[z * W + x] === USE.ROAD || use[z * W + x] === USE.SIDEWALK);
  const exits = [];
  for (const c of corridors || []) {
    if (c.w < 3) continue;
    const alongX = c.axis === 'x';
    const a = alongX ? Math.floor((c.z0 + c.z1) / 2) : Math.floor((c.x0 + c.x1) / 2);
    const u0 = alongX ? c.x0 : c.z0, u1 = alongX ? c.x1 : c.z1;
    const cell = (u) => (alongX ? [u, a] : [a, u]);
    for (let u = u0; u <= u1; u++) {
      const [x, z] = cell(u);
      if (x <= half || z <= half || x >= W - half - 1 || z >= D - half - 1) continue;
      if (!inSet(z * W + x) || !street(x, z)) continue;
      for (const dir of [1, -1]) {
        const [nx, nz] = cell(u + dir);
        if (nx < 0 || nz < 0 || nx >= W || nz >= D || inSet(nz * W + nx)) continue;
        const out = alongX ? [dir, 0] : [0, dir];
        if (!landsSquare(plan, inSet, [x, z], [-out[0], -out[1]], half)) continue;
        exits.push({ at: [x, z], out, axis: c.axis });
      }
    }
  }
  return exits;
}

// A bridge lands INTO a district, not along its edge: the street goes on inland
// three cells or more, with land either side of it for the deck's width and one
// more over those cells. (Landing on the coast, the deck ran in along the shore,
// its middle only two from the water, and the loop round the city cut across the
// end of it: the two tracks side by side, which in the game run into each other.)
function landsSquare(plan, inSet, at, inward, half) {
  const { W, D, use } = plan;
  const ok = (x, z) => x >= 0 && z >= 0 && x < W && z < D && inSet(z * W + x);
  const street = (x, z) => use[z * W + x] === USE.ROAD || use[z * W + x] === USE.SIDEWALK;
  const side = [inward[1], inward[0]];
  // (the deck's own width on land for its first two cells in: enough to keep it
  // off the coast without ruling out a street that reaches a rounded shore)
  for (let k = 0; k <= 2; k++) {
    const x = at[0] + inward[0] * k, z = at[1] + inward[1] * k;
    if (!ok(x, z) || !street(x, z)) return false;
    if (k <= 1) for (const sg of [1, -1]) for (let w = 1; w <= half; w++) if (!ok(x + side[0] * w * sg, z + side[1] * w * sg)) return false;
  }
  return true;
}

// straight: a street's line runs out over the gap and onto a street of the other
function centredCrossing(plan, other, inJoined, half) {
  const { W, D, use } = plan;
  const street = (x, z) => use[z * W + x] === USE.ROAD || use[z * W + x] === USE.SIDEWALK;
  let best = null;
  for (const e of streetExits(plan, (i) => other.has(i), half)) {
    const [x, z] = e.at, [dx, dz] = e.out;
    for (let step = 1; step <= MAX_GAP; step++) {
      const nx = x + dx * step, nz = z + dz * step;
      if (nx <= half || nz <= half || nx >= W - half - 1 || nz >= D - half - 1) break;
      const j = nz * W + nx;
      if (other.has(j)) break;                              // back on home ground: not a crossing
      if (inJoined(j)) {
        if (step - 1 >= MIN_GAP && street(nx, nz) && landsSquare(plan, inJoined, [nx, nz], [dx, dz], half) && (!best || step < best.gap)) {
          best = { axis: e.axis, from: [x, z], to: [nx, nz], gap: step - 1, dir: dx || dz };
          best.path = stepsAlong(best.from, best.to); best.angled = false; best.centred = true;
        }
        break;
      }
    }
  }
  return best;
}

// curved: from the end of a street of this district to the end of one of the
// other, leaving square out of the one and arriving square into the other, made
// as streets turn: straight runs and right-angled corners (an L where the two
// streets meet square, a Z where they face each other a little to one side). A
// staircase of single steps would not carry the loop: the contour two in from a
// ragged edge is not two clean lane rows. Over open ground only.
function curvedCrossing(plan, other, inJoined, half) {
  const { W, D } = plan;
  const from = streetExits(plan, (i) => other.has(i), half), to = streetExits(plan, inJoined, half);
  const legs = (pts) => { const path = []; for (let k = 0; k + 1 < pts.length; k++) { const run = stepsAlong(pts[k], pts[k + 1]); path.push(...(k ? run.slice(1) : run)); } return path; };
  let best = null;
  for (const a of from) for (const b of to) {
    const [ax, az] = a.at, [bx, bz] = b.at;
    // (a curve may be half as long again as a straight span: it is only looked for
    // where no street carries straight across, and a long bridge that carries the
    // loop round is better than a short one landing off the street)
    const dist = Math.abs(ax - bx) + Math.abs(az - bz);
    if (dist < MIN_GAP + 2 || dist > MAX_GAP * 1.5) continue;
    const routes = [];
    const dot = a.out[0] * b.out[0] + a.out[1] * b.out[1];
    if (dot === 0) {                                           // an L: one corner
      const c = a.out[0] ? [bx, az] : [ax, bz];
      if (a.out[0] * (c[0] - ax) + a.out[1] * (c[1] - az) > half + 1 && b.out[0] * (c[0] - bx) + b.out[1] * (c[1] - bz) > half + 1) routes.push([a.at, c, b.at]);
    } else if (dot === 1) {                                    // a U: out of both, along beyond them, back in
      const alongX = a.out[0] !== 0, sg = alongX ? a.out[0] : a.out[1];
      const reach = sg > 0 ? Math.max(alongX ? ax : az, alongX ? bx : bz) + half + 3 : Math.min(alongX ? ax : az, alongX ? bx : bz) - half - 3;
      const lateral = alongX ? bz - az : bx - ax;
      if (Math.abs(lateral) > 2 * half + 2) routes.push(alongX ? [a.at, [reach, az], [reach, bz], b.at] : [a.at, [ax, reach], [bx, reach], b.at]);
    } else if (dot === -1) {                                   // a Z: out, across at the middle, on in
      const along = a.out[0] ? 0 : 1, gap = along ? bz - az : bx - ax, side = along ? bx - ax : bz - bz + (bz - az);
      const lateral = along ? bx - ax : bz - az;
      if (gap * (a.out[0] + a.out[1]) > 2 * (half + 1) && lateral !== 0) {
        const m = Math.round((along ? az + bz : ax + bx) / 2);
        const p1 = along ? [ax, m] : [m, az], p2 = along ? [bx, m] : [m, bz];
        routes.push([a.at, p1, p2, b.at]);
      }
    }
    for (const pts of routes) {
      const path = legs(pts);
      if (path.length > MAX_GAP * 1.6) continue;
      const turns = pts.length - 2, score = path.length + 3 * turns;
      if (best && score >= best.score) continue;
      let ok = path.length >= 3;
      for (let k = 1; k < path.length - 1 && ok; k++) {
        const [x, z] = path[k];
        if (x <= half || z <= half || x >= W - half - 1 || z >= D - half - 1) ok = false;
        const j = z * W + x;
        if ((other.has(j) && k > half + 1) || (inJoined(j) && k < path.length - half - 2)) ok = false;
      }
      if (!ok) continue;
      const vx = bx - ax, vz = bz - az, alongX = Math.abs(vx) >= Math.abs(vz);
      best = { score, len: path.length, gap: path.length, from: a.at, to: b.at, path, angled: true, curved: true, centred: true,
        axis: alongX ? 'x' : 'z', dir: Math.sign(alongX ? vx : vz) || 1 };
    }
  }
  return best;
}

// No row or column joins the two: take the pair of banks nearest each other
// and lay a staircase between them. A district cut off by a diagonal river
// used to get no bridge at all, which left it — and everything built on it —
// off the network however big it was.
function angledCrossing(W, D, other, main, half) {
  // how far every cell is from the main district, and which cell of it is nearest
  const dist = new Int32Array(W * D).fill(-1);
  const near = new Int32Array(W * D).fill(-1);
  const q = [];
  for (const i of main) { dist[i] = 0; near[i] = i; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % W, z = (i - x) / W;
    if (dist[i] >= MAX_GAP) continue;
    for (const [dx, dz] of N4) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
      const j = nz * W + nx;
      if (dist[j] >= 0) continue;
      dist[j] = dist[i] + 1; near[j] = near[i]; q.push(j);
    }
  }

  const room = (x, z) => x >= half + 1 && z >= half + 1 && x < W - half - 1 && z < D - half - 1;
  let best = null;
  for (const i of other) {
    const x = i % W, z = (i - x) / W;
    if (!room(x, z)) continue;
    let edge = false;
    for (const [dx, dz] of N4) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= D || !other.has(nz * W + nx)) { edge = true; break; }
    }
    if (!edge) continue;
    const g = dist[i];
    if (g < MIN_GAP || g > MAX_GAP || near[i] < 0) continue;
    const bx = near[i] % W, bz = (near[i] - (near[i] % W)) / W;
    if (!room(bx, bz)) continue;
    const path = stepsAlong([x, z], [bx, bz]);
    // the run must leave home and stay out of it: a line that clips the
    // district's own coast on the way is not a crossing
    let backIn = 0;
    for (let k = 1; k < path.length - 1; k++) if (other.has(path[k][1] * W + path[k][0])) backIn++;
    if (backIn > 1) continue;
    // a staircase with longer straight runs carries track better, so it wins
    // ties: a rail can be powered on a straight but never on a curve
    const score = g * 10 - Math.min(longestRun(path), 8);
    if (!best || score < best.score) {
      const alongX = Math.abs(bx - x) >= Math.abs(bz - z);
      best = { score, gap: g, from: [x, z], to: [bx, bz], path, angled: true,
        axis: alongX ? 'x' : 'z', dir: Math.sign(alongX ? bx - x : bz - z) || 1 };
    }
  }
  return best;
}

function longestRun(path) {
  let best = 1, run = 1;
  for (let k = 2; k < path.length; k++) {
    const a = dirAt(path, k - 2), b = dirAt(path, k - 1);
    if (a[0] === b[0] && a[1] === b[1]) run++; else run = 1;
    if (run > best) best = run;
  }
  return best;
}

// ---- bending an end onto the ring -----------------------------------------
// The deck arrives at a district and the ring runs somewhere near. The bend
// carries the polyline on until it stands one cell short of the ring, square
// on, so that the lane either side of the centre line faces a piece of ring
// track head on. Nothing comes back unless the whole thing works out: the
// ring has to be at deck level (a bend cannot climb), straight for the width
// of the deck (both lanes must land on it), and reachable in a run short
// enough to be a bridgehead rather than a second bridge.
function bendToRing(transit, end, out, deckY, laneOff, onLand, inPlan) {
  if (!transit || !transit.lines) return null;
  const want = deckY + 1;

  // A cell will do if the deck can stand on it and so can the two cells a
  // lane could sit on — one either side, on whichever axis the deck is
  // running when it gets there, which is not known until the route is
  // chosen. Both axes are tested, which is four cells and the centre.
  // It must also lead AWAY from the span. Without that the walk was free to
  // set off back down the bridge it had just arrived on, and the deck came
  // out folded over itself.
  const ahead = (x, z) => (x - end[0]) * out[0] + (z - end[1]) * out[1] >= 0;
  const roomIn = (ok) => (x, z) => ahead(x, z) && ok(x, z)
    && ok(x + laneOff, z) && ok(x - laneOff, z)
    && ok(x, z + laneOff) && ok(x, z - laneOff);

  // Where a bridgehead may go, walked once from the end of the span so that
  // every ring within reach is costed against the same map. It is walked
  // TWICE: first over the city's own land, and only if that finds nothing
  // over whatever else is in bounds. A bridgehead that leaves the outline is
  // claiming new ground the way the span itself does — it is paved, added to
  // the city, and given a footing down to the terrain — but it is the second
  // choice, not the first.
  const walk = (ok) => {
    const room = roomIn(ok);
    const dist = new Map(), from = new Map();
    dist.set(key2(end[0], end[1]), 0);
    const q = [end];
    for (let h = 0; h < q.length; h++) {
      const [x, z] = q[h];
      const d = dist.get(key2(x, z));
      if (d >= TAIL_MAX) continue;
      for (const [dx, dz] of N4) {
        const nx = x + dx, nz = z + dz;
        if (Math.max(Math.abs(nx - end[0]), Math.abs(nz - end[1])) > TAIL_MAX) continue;
        const kk = key2(nx, nz);
        if (dist.has(kk) || !room(nx, nz)) continue;
        dist.set(kk, d + 1); from.set(kk, [x, z]); q.push([nx, nz]);
      }
    }
    return { dist, from, room };
  };

  for (const ok of [onLand, inPlan]) {
    const { dist, from, room } = walk(ok);
    const routeTo = (cell) => {
      const out2 = [];
      let at = cell;
      while (at) { out2.push(at); at = from.get(key2(at[0], at[1])); }
      return out2.reverse();
    };

    let best = null;
    for (const line of transit.lines) {
      if (!line.loop) continue;
      const cells = line.cells;
      for (let i = 0; i < cells.length; i++) {
        const [px, py, pz] = cells[i];
        if (py !== want) continue;
        const dx = px - end[0], dz = pz - end[1];
        if (Math.max(Math.abs(dx), Math.abs(dz)) > TAIL_MAX) continue;
        if (dx * out[0] + dz * out[1] <= 0) continue;        // behind the deck: the other bank's ring
        const t = ringRun(cells, i, laneOff + 1, want);
        if (!t) continue;
        // arrive square on: the approach is whichever perpendicular points at it
        const a = perpOf(t);
        const arrive = (a[0] * dx + a[1] * dz) >= 0 ? a : [-a[0], -a[1]];
        if (arrive[0] * out[0] + arrive[1] * out[1] < 0) continue;   // a bend, not a U-turn
        const stop = [px - arrive[0], pz - arrive[1]];               // one cell short of the track
        // The last few steps have to be the approach itself. One cell is not
        // enough: the lanes are offset from the centre line, and an offset
        // taken round a corner lands a lane on the ring rather than in front
        // of it. Where the ring runs alongside the deck a cell away there is
        // no room to turn onto it, and the end is left to the spur search.
        const pre = [stop[0] - arrive[0] * LEAD, stop[1] - arrive[1] * LEAD];
        const preKey = key2(pre[0], pre[1]);
        if (!dist.has(preKey)) continue;
        if (dist.get(preKey) + LEAD > TAIL_MAX) continue;
        const back = from.get(preKey);
        if (back && back[0] === pre[0] + arrive[0] && back[1] === pre[1] + arrive[1]) continue;  // arrives from the wrong side
        let clear = true;
        for (let s2 = LEAD - 1; s2 >= 0 && clear; s2--)
          if (!room(stop[0] - arrive[0] * s2, stop[1] - arrive[1] * s2)) clear = false;
        if (!clear) continue;
        const run = routeTo(pre);
        for (let s2 = LEAD - 1; s2 >= 0; s2--) run.push([stop[0] - arrive[0] * s2, stop[1] - arrive[1] * s2]);
        const tail = trimLoops(run).slice(1);
        if (!tail.length || tail.length > TAIL_MAX) continue;
        if (!unitPath([end, ...tail])) continue;
        const turn = Math.abs(arrive[0] - out[0]) + Math.abs(arrive[1] - out[1]);
        const score = tail.length * 2 + turn;
        if (!best || score < best.score) best = { score, tail, arrive, stop, ring: [px, py, pz] };
      }
    }
    if (best) return best;
  }
  return null;
}

// Does this lane end already face a ring square on? A deck that meets the
// ring properly where it stands wants leaving alone: bending it moves both
// lanes, and a bend that fixes one end can spoil the other. So an end is only
// bent when it needs to be.
function straightShot(transit, cell, out, deckY, laneOff) {
  if (!transit || !transit.lines) return false;
  const want = deckY + 1;
  for (const line of transit.lines) {
    if (!line.loop) continue;
    for (let i = 0; i < line.cells.length; i++) {
      const [x, y, z] = line.cells[i];
      if (y !== want) continue;
      const dx = x - cell[0], dz = z - cell[1];
      // straight ahead, and not so far that the spur is a railway of its own
      if (dx * out[1] - dz * out[0] !== 0) continue;
      const a = dx * out[0] + dz * out[1];
      if (a < 1 || a > 8) continue;
      const t = ringRun(line.cells, i, 1, want);
      if (t && (t[0] * out[0] + t[1] * out[1]) === 0) return true;   // lying across the approach
    }
  }
  return false;
}

// the direction a ring runs at cell i, if it runs dead straight for `reach`
// cells either side of it at the same height
function ringRun(cells, i, reach, y) {
  const n = cells.length;
  const at = (k) => cells[((k % n) + n) % n];
  const [ax, , az] = at(i);
  const [x1, , z1] = at(i + reach);
  const t = [Math.sign(x1 - ax), Math.sign(z1 - az)];
  if (t[0] && t[1]) return null;
  if (!t[0] && !t[1]) return null;
  for (let k = -reach; k <= reach; k++) {
    const [x, yy, z] = at(i + k);
    if (yy !== y) return null;
    if (x !== ax + t[0] * k || z !== az + t[1] * k) return null;
  }
  return t;
}

// ---- building them --------------------------------------------------------
// The deck is flat, at whichever end is higher, with piers down to the ground
// and railings along the edges. A lamp every eight blocks. Where an end can
// be bent onto the ring it carries on past the bank without parapets — that
// stretch is a bridgehead at street level, not a viaduct — and stops one cell
// short of the track it is aiming at, so the ring itself is never paved over.
export function buildBridges(world, plan, spans, hills, G, terrain, buildings = [], transit = null) {
  const { W } = plan;
  // a ramp must not bury a doorway: the buildings are already up by now
  const doorways = new Set();
  for (const rec of buildings)
    for (const [dx, dz] of rec.doorCells || [])
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) doorways.add(key2(dx + ox, dz + oz));
  // the ring's own track, which a bridgehead stops short of rather than
  // cutting through
  const ringRail = new Set();
  if (transit) for (const line of transit.lines || []) if (line.loop)
    for (const [x, y, z] of line.cells) ringRail.add(key3(x, y, z));

  const built = [];
  for (const s of spans) {
    const levelAt = (x, z) => G + (hills && hills.elev ? hills.elev[z * W + x] : 0);
    const spanPath = s.path;
    const last = spanPath[spanPath.length - 1];
    const deckY = Math.max(levelAt(spanPath[0][0], spanPath[0][1]), levelAt(last[0], last[1]));
    const half = s.half !== undefined ? s.half : s.width >> 1;
    const laneOff = Math.max(1, half - 1);

    // ---- bend the ends onto the ring ---------------------------------------
    const outAt = (which) => {
      const d = which === 0 ? dirAt(spanPath, 0) : dirAt(spanPath, spanPath.length - 1);
      return which === 0 ? [-d[0], -d[1]] : d;
    };
    const inPlan = (x, z) => x >= 1 && z >= 1 && x < W - 1 && z < plan.D - 1;
    const onLand = (x, z) => inPlan(x, z) && (!plan.mask || plan.mask[z * W + x] === 1);
    // Where both lanes of an end already face the ring, leave the deck where
    // it is: bending moves the whole end, and a bend chosen to fix one lane
    // can push the other off a join it already had.
    const needsBend = (which) => {
      const k = which === 0 ? Math.min(1, spanPath.length - 1) : Math.max(0, spanPath.length - 2);
      const q = perpOf(dirAt(spanPath, k));
      const o = outAt(which);
      for (const side of [-1, 1]) {
        const c = [spanPath[k][0] + side * laneOff * q[0], spanPath[k][1] + side * laneOff * q[1]];
        if (!straightShot(transit, c, o, deckY, laneOff)) return true;
      }
      return false;
    };
    const headTail = needsBend(0) ? bendToRing(transit, spanPath[0], outAt(0), deckY, laneOff, onLand, inPlan) : null;
    const footTail = needsBend(1) ? bendToRing(transit, last, outAt(1), deckY, laneOff, onLand, inPlan) : null;
    const path = [];
    const kind = [];            // 'span' where it flies, 'head' at a bridgehead
    const clips = [];           // a bent end stops flush here
    if (headTail) { for (let i = headTail.tail.length - 1; i >= 0; i--) { path.push(headTail.tail[i]); kind.push('head'); } clips.push(headTail); }
    for (const c of spanPath) { path.push(c); kind.push('span'); }
    if (footTail) { for (const c of footTail.tail) { path.push(c); kind.push('head'); } clips.push(footTail); }

    // Nothing of the deck may reach past a bend's stop line — but only near
    // that crossing. The stop line is a half-plane across the whole city, and
    // a bridge bent at both ends had one end's line quietly cutting away the
    // other end's deck. Only the cells around the crossing need guarding: the
    // ring runs through there and the deck has to hold back from it.
    const clipped = (x, z) => clips.some((c) =>
      Math.max(Math.abs(x - c.stop[0]), Math.abs(z - c.stop[1])) <= half + 2
      && (x - c.stop[0]) * c.arrive[0] + (z - c.stop[1]) * c.arrive[1] > 0);

    // ---- the carriageway ---------------------------------------------------
    const deck = new Map();
    for (let k = 0; k < path.length; k++)
      for (const [x, z, w] of stripAt(path, k, half)) {
        const kk = key2(x, z);
        if (clipped(x, z) || !inPlan(x, z)) continue;
        if (ringRail.has(key3(x, deckY + 1, z))) continue;   // leave the ring's own track alone
        const had = deck.get(kk);
        // a cell that is the kerb of one cross-section and the middle of
        // another — which is what the inside of a bend looks like — is middle
        if (had) { had[3] = had[3] && Math.abs(w) === half; continue; }
        deck.set(kk, [x, z, k, Math.abs(w) === half]);
      }
    // the open mouths of the roadway carry no parapet, or nothing could drive on
    const mouths = new Set();
    for (const k of [0, path.length - 1])
      for (const [x, z] of stripAt(path, k, half)) mouths.add(key2(x, z));

    let piers = 0, lamps = 0;
    for (const [, [x, z, k]] of deck) {
      world.set(x, deckY, z, MAT.ASPHALT);
      for (let y = deckY + 1; y <= deckY + 5; y++) world.clear(x, y, z);
      // A bridgehead is laid after the plan was drawn, so the plan is told
      // about it: it is street like the rest of the deck, and everything that
      // reads the plan — the walk that proves the city is connected, and the
      // export — has to see it that way. Where it has claimed ground outside
      // the outline it is given a footing down to the terrain, for the same
      // reason the span gets piers: a carriageway hanging in the air is worse
      // than no carriageway.
      if (kind[k] === 'head') {
        const i = z * W + x;
        if (plan.mask && !plan.mask[i]) {
          plan.mask[i] = 1;
          const groundY = terrain && terrain.ground ? G + (terrain.ground[i] - terrain.baseY) : G;
          for (let yy = deckY - 1; yy >= Math.min(groundY, deckY - 1); yy--) world.set(x, yy, z, MAT.STONEBRICK);
        }
        plan.use[i] = USE.ROAD;
      }
    }
    // A parapet runs along the kerb — the outermost cell of the cross-section
    // — and nowhere else. Reading it off the deck's own outline instead put a
    // wall down the middle of the carriageway wherever a cell had been left
    // unpaved to spare a rail underneath it.
    for (const [kk, [x, z, k, kerb]] of deck) {
      if (!kerb || kind[k] === 'head' || mouths.has(kk)) continue;
      world.set(x, deckY + 1, z, MAT.STONEBRICK);
      if (k % 8 === 0) { world.set(x, deckY + 2, z, MAT.LAMP); lamps++; }
    }
    // piers every four blocks, down to whatever is beneath
    for (let k = 0; k < path.length; k++) {
      if (kind[k] !== 'span' || k % 4 || k === 0 || k === path.length - 1) continue;
      const p = perpOf(dirAt(path, k));
      for (const w of [-half, half]) {
        const x = path[k][0] + p[0] * w, z = path[k][1] + p[1] * w;
        if (!deck.has(key2(x, z))) continue;
        const groundY = terrain && terrain.ground ? G + (terrain.ground[z * W + x] - terrain.baseY) : G;
        for (let y = deckY - 1; y >= Math.min(groundY, deckY - 1); y--) world.set(x, y, z, MAT.STONEBRICK);
        piers++;
      }
    }

    // ---- steps down where a plain end meets a lower street ------------------
    // A bent end already stands on the ground it was bent to meet, so only
    // the ends left straight need a ramp off the deck.
    for (const which of [0, 1]) {
      if (which === 0 ? headTail : footTail) continue;
      const end = which === 0 ? path[0] : path[path.length - 1];
      const out = outAt(which);
      const endY = levelAt(end[0], end[1]);
      if (endY >= deckY) continue;
      const p = perpOf(out);
      for (let d = 1; d <= deckY - endY; d++)
        for (let w = -half; w <= half; w++) {
          const cx = end[0] + out[0] * d + p[0] * w, cz = end[1] + out[1] * d + p[1] * w;
          if (doorways.has(key2(cx, cz))) continue;          // leave the way into a building alone
          world.set(cx, deckY - d, cz, MAT.ASPHALT);
          for (let y = deckY - d + 1; y <= deckY + 4; y++) world.clear(cx, y, cz);
        }
    }

    // Where an end was bent the lane runs right to the last cell of the
    // polyline, because that cell is the one facing the ring. A plain end
    // keeps the old margin: the lane stops one cell inside the deck, so the
    // kerb of the viaduct is not also the buffer of a railway.
    // A raised brick along the deck's middle so its two tracks can never run into
    // each other (side by side, or with a third line laid down the middle, the game
    // merged them into a tangle). Only over the water: where the deck meets the
    // land the two tracks part, one carrying on with the ring, the other turning
    // once onto it, and a brick there (it followed the deck onto the shore, and was
    // laid even over the loop's own rail) forced them into knots. Never over a rail.
    let divider = 0;
    const gap = s.gapCells || new Set();
    for (const [x, z] of path) {
      if (!gap.has(z * W + x) || !world.has(x, deckY, z)) continue;
      const id = world.get(x, deckY + 1, z);
      if (id >= 0) continue;                                 // (a rail, or anything else standing there)
      world.set(x, deckY + 1, z, MAT.STONEBRICK);
      divider++;
    }
    built.push({ ...s, path, kind, spanPath, deckY, piers, lamps, half, laneOff, divider,
      lane: [headTail ? 0 : 1, footTail ? path.length - 1 : path.length - 2],
      bentHead: !!headTail, bentFoot: !!footTail,
      from: path[0], to: path[path.length - 1], length: path.length,
      bent: (headTail ? 1 : 0) + (footTail ? 1 : 0) });
  }
  return built;
}

// ---- track across a bridge ------------------------------------------------
// A rail connects in two directions only — there is no three-way junction
// without a switch — so a spur cannot simply tee into a ring. Instead the
// bridge carries two tracks, one each way, and each ring is DIVERTED into one
// of them: the ring cell where the bridge meets it is turned into a curve
// leading onto the deck. What was three separate railways (ring, bridge,
// ring) becomes one circuit that runs round one district, crosses, runs round
// the other, and crosses back.
//
// With the deck bent onto the ring the join is a single curve: the lane ends
// one cell short of the track, facing it. Where the deck could not be bent —
// a ring below deck level, or none within reach — the older L-shaped search
// still runs: inward, then a turn, with a curve at the corner.
export function bridgeRails(world, bridges, transit, G) {
  // Ringed whole (transit.js): the loop already runs over every deck, along its
  // two lane rows. Its rails there are seated on the deck, at deck height; the
  // line is then shaped whole (city.js: shapeLine), ramps at the banks included.
  if (transit && transit.ringedWhole) {
    let seated = 0;
    for (const b of bridges) {
      const strip = new Set(b.cells.map(([x, z]) => x + ',' + z));
      const y = b.deckY + 1;
      for (const line of transit.lines) {
        if (!line.loop) continue;
        for (const c of line.cells) {
          if (c.length < 3 || !strip.has(c[0] + ',' + c[2])) continue;
          const id = world.get(c[0], c[1], c[2]);
          const isRail = id >= 0 && /rail/.test(MATERIALS.def(id).block);
          if (c[1] !== y) {
            if (isRail) world.clear(c[0], c[1], c[2]);
            c[1] = y;
          }
          for (let h = 1; h <= 2; h++) world.clear(c[0], y + h, c[2]);
          world.set(c[0], y, c[2], isRail ? id : railId(RAIL.NS));
          seated++;
        }
      }
    }
    return seated;
  }
  if (!transit || !bridges.length) return 0;
  const REACH_IN = 28;            // how far onward a spur may run
  const REACH_LAT = 20;           // and how far it may turn aside after that

  const railAt = (x, y, z) => {
    const id = world.get(x, y, z);
    return id >= 0 && /rail/.test(MATERIALS.def(id).block);
  };
  // The cells of every ring. A spur should join the loop, not the first stray
  // piece of track it happens to meet, so a ring cell always beats a nearer
  // non-ring one.
  const ringCells = new Set();
  const ringIndex = new Map();               // a ring cell -> its ring and its place round it
  for (const line of transit.lines || []) {
    if (!line.loop) continue;
    line.cells.forEach(([x, y, z], i) => { ringCells.add(key3(x, y, z)); ringIndex.set(key3(x, y, z), { line, i }); });
  }
  // cells this function has laid or bent: two spurs must not cross, and a
  // ring cell already turned onto one lane cannot be turned onto another
  const taken = new Set();

  // the curve joining two directions, each a unit step
  const curveFor = (a, b) => {
    const dx = a[0] + b[0], dz = a[1] + b[1];
    return dx > 0 ? (dz > 0 ? RAIL.SE : RAIL.NE) : (dz > 0 ? RAIL.SW : RAIL.NW);
  };
  const straightFor = (d) => (d[0] ? RAIL.EW : RAIL.NS);

  let laid = 0;
  for (const b of bridges) {
    const path = b.path;
    const half = b.half !== undefined ? b.half : b.width >> 1;
    const laneOff = b.laneOff !== undefined ? b.laneOff : Math.max(1, half - 1);
    const y = b.deckY + 1;

    // ---- the two lanes, one either side of the centre line -----------------
    // Offsetting a polyline gives a polyline: the offset points are joined
    // back up into single steps, so a staircase deck carries a staircase of
    // track, curve by curve.
    const [k0, k1] = b.lane || [1, path.length - 2];
    const laneCells = (side) => {
      const pts = [];
      for (let k = k0; k <= k1; k++) {
        const p = perpOf(dirAt(path, k));
        pts.push([path[k][0] + side * laneOff * p[0], path[k][1] + side * laneOff * p[1]]);
      }
      // On the inside of a bend the offset points bunch up and can double
      // back, so the run is trimmed into a simple path. It still ends exactly
      // on the last offset point, which is the cell facing the ring.
      const run = [pts[0]];
      for (let k = 1; k < pts.length; k++)
        for (const c of stepsAlong(run[run.length - 1], pts[k]).slice(1)) run.push(c);
      return trimLoops(run);
    };

    const lanes = [-1, 1].map((side) => {
      // A lane stops short of any ring: on an angled deck it can run on over the
      // ring's track at the bank, and laid over it, it cut the ring it was meant
      // to join. Trimmed from the deck's middle outward, it ends in front of the
      // ring instead, and joins it there.
      const full = laneCells(side);
      // (only where the lane crosses the ring at right angles: that is the lane
      // that cut it; one running alongside the ring is left as it was, since an
      // end trimmed there would point along the ring with nothing to turn onto)
      const ringAt = (x, z) => { for (const yy of [y - 1, y, y + 1]) { const r = ringIndex.get(key3(x, yy, z)); if (r) return r; } return null; };
      const crosses = (k) => {
        const [x, z] = full[k], r = ringAt(x, z);
        if (!r) return false;
        const n = r.line.cells.length, a = r.line.cells[(r.i - 1 + n) % n], c = r.line.cells[(r.i + 1) % n];
        const ringAlongX = a[0] !== c[0] && a[2] === c[2], ringAlongZ = a[2] !== c[2] && a[0] === c[0];
        const p = full[k - 1] || full[k], q = full[k + 1] || full[k];
        const laneAlongX = p[0] !== q[0] && p[1] === q[1], laneAlongZ = p[1] !== q[1] && p[0] === q[0];
        return (ringAlongX && laneAlongZ) || (ringAlongZ && laneAlongX);
      };
      const mid = Math.floor(full.length / 2);
      let lo = mid, hi = mid;
      while (lo > 0 && !crosses(lo - 1)) lo--;
      while (hi < full.length - 1 && !crosses(hi + 1)) hi++;
      const trimmed = crosses(mid) ? [] : full.slice(lo, hi + 1);
      const out = layLane(trimmed);
      out.full = full; out.trimmed = trimmed.length !== full.length;
      return out;
    });
    // lay a lane's cells: track, the odd booster on a straight, room over it
    function layLane(cells) {
      const dirs = cells.map(([x, z], k) => {
        const prev = cells[k - 1], next = cells[k + 1];
        if (prev && next) {
          const a = [prev[0] - x, prev[1] - z], c = [next[0] - x, next[1] - z];
          return (a[0] + c[0] === 0 && a[1] + c[1] === 0) ? straightFor(c) : curveFor(a, c);
        }
        if (next) return straightFor([next[0] - x, next[1] - z]);
        if (prev) return straightFor([x - prev[0], z - prev[1]]);
        return RAIL.EW;
      });
      // a booster every so often, but never on a curve: a powered rail has no
      // curved form, so a staircase is boosted on its straights
      let since = BOOST_EVERY;
      const out = [];
      cells.forEach(([x, z], k) => {
        const curved = dirs[k] >= 6;
        const boost = !curved && since >= BOOST_EVERY && k > 0 && k < cells.length - 1;
        world.set(x, b.deckY, z, boost ? MAT.REDSTONE : MAT.GRAVEL);
        world.set(x, y, z, boost ? poweredRailId(dirs[k]) : railId(dirs[k]));
        for (let h = 1; h <= 3; h++) world.clear(x, y + h, z);
        since = boost ? 0 : since + 1;
        out.push([x, y, z]);
      });
      return out;
    }

    // ---- lead each lane end onto the ring ----------------------------------
    // Four ends, and the junctions they want are not always four different
    // cells. Taking them in a fixed order lets the first end claim the
    // junction the second needed and pushes that one out onto a long lateral
    // detour — the wrong shape, chosen for no better reason than which lane
    // was looked at first. So every end is costed, the cheapest join is
    // committed, and the ones left are costed again against what remains.
    let joined = 0;
    const ends = [];
    const laneEnds = lanes.map(() => []);
    const record = (li, rec) => { ends.push(rec); laneEnds[li].push(rec); };

    // What one end can reach: the spur, the junction it lands on and what to
    // turn that junction into. Nothing is written here.
    const search = ({ cells, head }) => {
      const end = head ? cells[0] : cells[cells.length - 1];
      const nb = head ? cells[1] : cells[cells.length - 2];
      const step = [Math.sign(end[0] - nb[0]), Math.sign(end[2] - nb[2])];   // on out of the deck
      const latU = perpOf(step);
      const at = (a, l) => [end[0] + step[0] * a + latU[0] * l, end[2] + step[1] * a + latU[1] * l];

      // Try one corner: a cells onward, then l aside. A candidate only counts
      // if the whole spur can actually be built — the way to it clear of
      // track, and the rail it reaches lying across the approach so there is
      // something to curve onto. With a bent deck the winner is a = 1, l = 0:
      // the ring is already in front of it.
      let sawRail = false;               // track at deck level, usable or not
      const consider = (a, l) => {
        const [jx, jz] = at(a, l);
        let jy = null;
        for (let dy = 1; dy >= -1; dy--) {
          const yy = end[1] + dy;
          if (!railAt(jx, yy, jz)) continue;
          sawRail = true;
          if (!taken.has(key3(jx, yy, jz))) { jy = yy; break; }
        }
        if (jy === null) return null;
        // A height change is made on the spur's first cell, a slope (a flat rail
        // beside one a block higher looked joined and was a step a cart cannot
        // take): up, it rises onward; down, it rises back toward the deck and the
        // spur goes on a block lower. Then the spur runs at the ring's height to
        // the junction, which stays a flat curve. So it needs a straight cell first.
        const dy = jy - end[1];
        const RISE = (d) => (d[0] === 1 ? RAIL.UP_E : d[0] === -1 ? RAIL.UP_W : d[1] === -1 ? RAIL.UP_N : RAIL.UP_S);
        if (dy !== 0 && a < 2) return null;

        const sign = Math.sign(l);
        const spur = [];
        for (let k = 1; k <= (l === 0 ? a - 1 : a); k++) {
          const first = k === 1 && dy !== 0;
          spur.push({ pos: at(k, 0), y: dy < 0 ? jy : first ? end[1] : jy,
            rail: first ? RISE(dy > 0 ? step : [-step[0], -step[1]]) : straightFor(step) });
        }
        if (l !== 0) {
          if (!spur.length) return null;                     // no room for a corner
          if (dy !== 0 && spur.length < 2) return null;      // (the slope and the corner need a cell each)
          spur[spur.length - 1].rail = curveFor([-step[0], -step[1]], [latU[0] * sign, latU[1] * sign]);
          for (let m = 1; m < Math.abs(l); m++) spur.push({ pos: at(a, sign * m), y: jy, rail: straightFor(latU) });
          if (spur[spur.length - 1].rail >= 2 && spur[spur.length - 1].rail <= 5 && Math.abs(l)) return null;   // (a corner cannot be the slope)
        }
        for (const { pos, y: sy } of spur)
          if (taken.has(key3(pos[0], sy, pos[1])) || railAt(pos[0], sy, pos[1])) return null;

        // Which side of the junction the rest of the ring lies on decides the
        // curve, so it is looked up rather than assumed — and "side" is
        // relative to however the spur arrives, not to the bridge, since it
        // may come round a corner.
        const approach = l === 0 ? step : [latU[0] * sign, latU[1] * sign];
        const side = [[approach[1], approach[0]], [-approach[1], -approach[0]]];
        let ringSide = null;
        for (const [sx, sz] of side)
          if (railAt(jx + sx, jy, jz + sz) || railAt(jx + sx, jy + 1, jz + sz) || railAt(jx + sx, jy - 1, jz + sz)) { ringSide = [sx, sz]; break; }
        if (!ringSide) return null;

        const curve = curveFor([-approach[0], -approach[1]], ringSide);
        const ring = ringCells.has(key3(jx, jy, jz));
        // a ring always beats a stray piece of track, then the shortest run,
        // then the straightest
        const score = (ring ? 0 : 1e6) + (a + Math.abs(l)) * 10 + Math.abs(l);
        return { score, a, l, spur, jx, jy, jz, curve, ring, y: end[1], approach, sides: side };
      };

      // every junction this end could use, its cheapest approach kept
      const byJunction = new Map();
      for (let a = 1; a <= REACH_IN; a++)
        for (let l = -REACH_LAT; l <= REACH_LAT; l++) {
          const c = consider(a, l);
          if (!c) continue;
          const kk = key3(c.jx, c.jy, c.jz);
          const had = byJunction.get(kk);
          if (!had || c.score < had.score) byJunction.set(kk, c);
        }
      if (byJunction.size) {
        const cands = [...byJunction.values()].sort((p, q) => p.score - q.score).slice(0, 12);
        // the cells a candidate would claim, so two of them can be told apart
        for (const c of cands) {
          c.cells = new Set([key3(c.jx, c.jy, c.jz)]);
          for (const { pos, y: sy } of c.spur) c.cells.add(key3(pos[0], sy !== undefined ? sy : c.y, pos[1]));
        }
        return { cands };
      }
      // Say which of the three it is, because they want different fixes. A
      // ring below the deck needs the spur to descend, which it cannot do;
      // nothing in reach at all means the bank carries no railway near this
      // end; anything else is a spur that could not be routed.
      let below = false;
      for (let a = 1; a <= REACH_IN && !below; a++)
        for (let l = -REACH_LAT; l <= REACH_LAT && !below; l++) {
          const [x, z] = at(a, l);
          for (let dy = -5; dy <= 5; dy++)
            if (Math.abs(dy) > 1 && railAt(x, end[1] + dy, z)) { below = true; break; }
        }
      return { why: sawRail ? 'no way through to the track in front of it' : below ? 'the ring is not at deck level' : 'no track within reach' };
    };

    const commit = ({ cells, li, head }, best) => {
      for (const { pos, rail, y: sy } of best.spur) {
        const [x, z] = pos, yy = sy !== undefined ? sy : best.y;
        if (!world.has(x, yy - 1, z)) world.set(x, yy - 1, z, MAT.GRAVEL);
        world.set(x, yy, z, railId(rail));
        for (let h = 1; h <= 3; h++) world.clear(x, yy + h, z);
        taken.add(key3(x, yy, z));
        cells.push([x, yy, z]);
      }
      // Bend the ring's own rail so it leads onto the spur. A rail joins two
      // directions and no more, so the ring gives way here: a cart coming
      // round is turned onto the bridge instead of carrying on. Keep what the
      // ring's rail was, so the bend can be undone if this lane is taken up
      // again below.
      const wasRail = world.get(best.jx, best.jy, best.jz);
      world.set(best.jx, best.jy, best.jz, railId(best.curve));
      taken.add(key3(best.jx, best.jy, best.jz));
      joined++;
      const laneEnd = head ? cells[0] : cells[cells.length - 1 - best.spur.length];
      const laneNext = head ? cells[1] : cells[cells.length - 2 - best.spur.length];
      record(li, { joined: true, head, a: best.a, leg: Math.abs(best.l), ring: best.ring,
        junction: [best.jx, best.jy, best.jz], wasRail, spur: best.spur.map(({ pos, y: sy }) => [pos[0], sy !== undefined ? sy : best.y, pos[1]]),
        approach: best.approach, sides: best.sides, laneEnd, laneNext });
    };

    // The four ends are settled together rather than one after another.
    // Which junction an end may use depends on what the other three have
    // taken, and a lane only earns its keep if BOTH of its ends join — so the
    // choice is made over all of them at once: most lanes joined end to end
    // first, then most ends joined, then the tidiest shapes. There are four
    // ends and a dozen candidates apiece, so this is a handful of thousands
    // of combinations, not a search.
    const seats = [];
    lanes.forEach((cells, li) => { if (cells.length >= 4) seats.push({ li, cells, head: true }, { li, cells, head: false }); });
    let found = seats.map(search);
    // (trimmed short of a ring it crossed, a lane can end where it has no way onto
    // the ring: that lane is laid again whole, as it was before the trim)
    lanes.forEach((cells, li) => {
      if (!cells.trimmed) return;
      const mine = seats.map((st, k) => (st.li === li ? k : -1)).filter((k) => k >= 0);
      if (mine.every((k) => found[k].cands)) return;
      for (const [x, yy, z] of cells) { world.clear(x, yy, z); if (world.get(x, yy - 1, z) === MAT.REDSTONE) world.set(x, yy - 1, z, MAT.GRAVEL); }
      const whole = layLane(cells.full);
      cells.length = 0; cells.push(...whole); cells.trimmed = false;
      for (const k of mine) found[k] = search(seats[k]);
    });
    const options = found.map((r) => r.cands || []);

    let chosen = null;
    const pick = new Array(seats.length).fill(-1);
    const walk = (i, used) => {
      if (i === seats.length) {
        let full = 0, n = 0, cost = 0;
        lanes.forEach((cells, li) => {
          const mine = seats.map((s, k) => (s.li === li ? pick[k] : -1)).filter((v, k) => seats[k].li === li);
          if (mine.length === 2 && mine.every((v) => v >= 0)) full++;
        });
        pick.forEach((v, k) => { if (v >= 0) { n++; cost += options[k][v].score; } });
        if (!chosen || full > chosen.full || (full === chosen.full && (n > chosen.n || (n === chosen.n && cost < chosen.cost))))
          chosen = { full, n, cost, pick: pick.slice() };
        return;
      }
      pick[i] = -1;
      walk(i + 1, used);
      options[i].forEach((c, ci) => {
        for (const k of c.cells) if (used.has(k)) return;
        for (const k of c.cells) used.add(k);
        pick[i] = ci;
        walk(i + 1, used);
        for (const k of c.cells) used.delete(k);
        pick[i] = -1;
      });
    };
    walk(0, new Set());

    seats.forEach((seat, k) => {
      const ci = chosen ? chosen.pick[k] : -1;
      if (ci >= 0) commit(seat, options[k][ci]);
      else record(seat.li, { joined: false, head: seat.head, why: found[k].why || 'no way through to the track in front of it' });
    });

    // A lane that cannot reach a ring at both ends is taken up rather than
    // left hanging. Half a lane is not half a railway — it is a cart running
    // to the end of the deck and stopping, which is what a buffer at the end
    // of a viaduct looks like from the ground. One lane that runs right
    // through is worth more than two that do not, so the deck carries a
    // single track in that case, and the ring's own rail is put back the way
    // it was where the lane had already bent it.
    const kept = [], removed = [];
    lanes.forEach((cells, li) => {
      if (cells.length < 4) return;
      const mine = laneEnds[li];
      if (mine.length === 2 && mine.every((e) => e.joined)) { kept.push(cells); return; }
      for (const e of mine) {
        if (!e.joined) continue;
        const [jx, jy, jz] = e.junction;
        world.set(jx, jy, jz, e.wasRail);          // unbend the ring
        taken.delete(key3(jx, jy, jz));
        joined--;
      }
      for (const [x, yy, z] of cells) {
        world.clear(x, yy, z);
        if (world.get(x, yy - 1, z) === MAT.REDSTONE) world.set(x, yy - 1, z, MAT.GRAVEL);
        taken.delete(key3(x, yy, z));
      }
      removed.push(li);
    });

    // The two junctions on one bank turn opposite ways along the ring: each to the
    // side away from the other. Then the ring comes in along one, crosses, goes
    // round the other district, comes back on the other lane and carries on
    // along the ring the other way; the stretch of ring between the two is left
    // out. (Each chose its side by which had track first, so both turned the same
    // way: the ring between them dead-ended, and the circuit never crossed.)
    for (const head of [true, false]) {
      const pair = kept.length === 2 ? ends.filter((e) => e.joined && e.head === head && e.sides) : [];
      if (pair.length !== 2) continue;
      // "away" is measured round the ring: the shorter stretch between the two is
      // the one left out, so each turns onto its ring neighbour on the longer
      // stretch (by direction alone, a partner a little to one side fooled it)
      pair.forEach((e, k) => {
        const o = pair[1 - k];
        const me = ringIndex.get(key3(...e.junction)), them = ringIndex.get(key3(...o.junction));
        if (!me || !them || me.line !== them.line) return;
        const cells = me.line.cells, n = cells.length;
        const fwd = (them.i - me.i + n) % n, back = (me.i - them.i + n) % n;
        const nb = cells[fwd < back ? (me.i - 1 + n) % n : (me.i + 1) % n];
        const [jx, , jz] = e.junction, side = [Math.sign(nb[0] - jx), Math.sign(nb[2] - jz)];
        if (!e.sides.some(([sx, sz]) => sx === side[0] && sz === side[1])) return;   // (not across the approach: leave it)
        world.set(...e.junction, railId(curveFor([-e.approach[0], -e.approach[1]], side)));
      });
      // the stretch of ring between the two, left out of the circuit, is taken up
      // (a stub a cart could stray onto and stop)
      if (pair.length === 2) {
        const a = ringIndex.get(key3(...pair[0].junction)), c = ringIndex.get(key3(...pair[1].junction));
        if (a && c && a.line === c.line) {
          const cells = a.line.cells, n = cells.length;
          const fwd = (c.i - a.i + n) % n, back = (a.i - c.i + n) % n;
          const [from, len] = fwd <= back ? [a.i, fwd] : [c.i, back];
          if (len > 1 && len < 16) for (let s2 = 1; s2 < len; s2++) {
            const [x, yy, z] = cells[(from + s2) % n];
            if (taken.has(key3(x, yy, z)) || !railAt(x, yy, z)) continue;
            world.clear(x, yy, z);
            if (world.get(x, yy - 1, z) === MAT.REDSTONE) world.set(x, yy - 1, z, MAT.GRAVEL);
          }
        }
      }
    }
    // Every join made mutual: the cell before a junction (the spur's last, or the
    // lane's end) turned to lead from its own neighbour into the junction. (A lane
    // that ended beside its junction, not facing it, was left pointing at nothing.)
    const dirTo = (from, to) => [Math.sign(to[0] - from[0]), Math.sign(to[2] - from[2])];
    for (const e of ends) {
      if (!e.joined || !e.laneEnd || !e.laneNext) continue;
      const chain = [e.laneNext, e.laneEnd, ...e.spur];
      const last = chain[chain.length - 1], prev = chain[chain.length - 2];
      if (Math.abs(last[0] - e.junction[0]) + Math.abs(last[2] - e.junction[2]) !== 1) continue;
      if (!railAt(last[0], last[1], last[2])) continue;
      const a = dirTo(last, prev), c = dirTo(last, e.junction);
      const straightOn = a[0] + c[0] === 0 && a[1] + c[1] === 0;
      // the junction a block up: the cell before it rises toward it (straight on)
      const RISE_TO = (d) => (d[0] === 1 ? RAIL.UP_E : d[0] === -1 ? RAIL.UP_W : d[1] === -1 ? RAIL.UP_N : RAIL.UP_S);
      const shape = e.junction[1] === last[1] + 1 && straightOn ? RISE_TO(c) : straightOn ? straightFor(c) : curveFor(a, c);
      world.set(last[0], last[1], last[2], railId(shape));
    }

    for (const cells of kept) {
      const mid = cells[Math.floor(cells.length / 2)];
      transit.lines.push({ axis: b.axis, bridge: true, cells, stations: [mid] });
      transit.carts.push({ type: 'minecart', x: mid[0], y: mid[1], z: mid[2] });
      transit.stats.lines++;
      transit.stats.rails += cells.length;
      laid++;
    }
    b.joined = joined;
    b.ends = ends;
    b.lanes = kept.length;
    b.lanesRemoved = removed.length;
  }
  return laid;
}
