// engine/water.js — a canal through the city.
//
// One long street through the middle of the city becomes a canal: a stone
// channel of water two deep, with its surface three blocks below the street,
// walkways along both banks (and railings where the street is wide enough).
// Every crossing street carries straight over on its own road deck, with two
// blocks of air between water and deck, so streets and railway lines cross
// at street level and a boat fits underneath.
//
// It follows the rule that keeps every other water in Polis in place: each
// water block has solid stone or water on all four sides and underneath. The
// city's stone base is extended down to hold it, the channel's ends stop well
// inside the wall, and water never flows upward.
//
// A dock: a flight of steps down from the walkway to a wooden landing at the
// water's edge, where the boats are.

import { MAT, stairId, WEIRDO } from './materials.js';
import { USE } from './plan.js';

export const USE_CANAL = 8;
// Levels, with the street surface at y = 1: bed at -4, water at -3 and -2,
// air at -1 and 0 (two clear blocks under a bridge deck), street or deck at 1.
export const BED = -4, WATER_LO = -3, WATER_HI = -2;

// Choose the canal's street (before surfaces and railways are laid): the
// longest straight street at least 5 wide that stays well inside the city.
// opts (for a city of canals, planCanals):
//   exclude     corridors already taken by another canal
//   allowCanal  a canal may run straight through another's water (a junction)
//   minRun      the shortest straight run worth a canal
//   footbridges a railed footbridge across the channel every ~18 blocks with no street
export function planCanal(plan, cfg, edgeDist, opts = {}) {
  if (!cfg.canal) return null;
  const { W, D, use, roadAxis } = plan;
  const inner = (x, z) => x >= 0 && z >= 0 && x < W && z < D && edgeDist[z * W + x] >= 4;
  const passable = (u) => u === USE.ROAD || (opts.allowCanal && u === USE_CANAL);
  let best = null;
  for (const c of plan.corridors) {
    if (c.w < 5) continue;
    if (opts.exclude && opts.exclude.has(c)) continue;
    // the corridor's cells that are still road, inside the city
    const along = c.axis === 'x' ? [Math.max(0, c.x0), Math.min(W - 1, c.x1)] : [Math.max(0, c.z0), Math.min(D - 1, c.z1)];
    const a0 = c.axis === 'x' ? c.z0 : c.x0, a1 = c.axis === 'x' ? c.z1 : c.x1;   // across
    let run = [], bestRun = [];
    for (let u = along[0]; u <= along[1] + 1; u++) {
      let ok = u <= along[1];
      for (let a = a0; a <= a1 && ok; a++) {
        const x = c.axis === 'x' ? u : a, z = c.axis === 'x' ? a : u;
        if (!inner(x, z) || !passable(use[z * W + x])) ok = false;
      }
      if (ok) run.push(u); else { if (run.length > bestRun.length) bestRun = run; run = []; }
    }
    // A city cut to real ground is rarely straight for a third of its width,
    // and a short canal is better than none, so the run needed is shorter on
    // a fitted site than it was.
    const need = opts.minRun || (cfg.terrain ? Math.max(16, Math.min(W, D) * 0.2) : Math.max(24, Math.min(W, D) * 0.35));
    if (bestRun.length < need) continue;
    const score = bestRun.length * 10 + c.w;
    if (!best || score > best.score) best = { score, axis: c.axis, u0: bestRun[0], u1: bestRun[bestRun.length - 1], a0, a1, w: a1 - a0 + 1, corridor: c };
  }
  if (!best) return null;
  // channel: the middle three across; railings on the next row out if wide enough
  const mid = Math.floor((best.a0 + best.a1) / 2);
  best.ch0 = mid - 1; best.ch1 = mid + 1;
  best.railed = best.w >= 7;
  best.bridges = 0;
  const cell = (u, a) => (best.axis === 'x' ? [u, a] : [a, u]);
  best.cell = cell;
  // Where a street meets the canal's street from either side, that stretch
  // stays road right across: a bridge over the water, carrying the street
  // (and any railway on it) straight over at street level.
  const isRoad = (x, z) => x >= 0 && z >= 0 && x < W && z < D && use[z * W + x] === USE.ROAD;
  const bridgeAt = (u) => {
    const [cx, cz] = cell(u, mid);
    if (roadAxis[cz * W + cx] === 3) return true;
    const [lx, lz] = cell(u, best.a0 - 1), [rx, rz] = cell(u, best.a1 + 1);
    return isRoad(lx, lz) || isRoad(rx, rz);
  };
  best.bridgeSpans = [];
  best.footbridges = [];
  // a junction: where this canal runs through another's water
  const junction = (u) => { for (let a = best.ch0; a <= best.ch1; a++) { const [x, z] = cell(u, a); if (use[z * W + x] === USE_CANAL) return true; } return false; };
  let spanStart = null, lastCross = best.u0;
  for (let u = best.u0; u <= best.u1 + 1; u++) {
    const br = u <= best.u1 && bridgeAt(u) && !junction(u);
    if (br && spanStart === null) spanStart = u;
    if (!br && spanStart !== null) { best.bridgeSpans.push([spanStart, u - 1]); lastCross = u - 1; spanStart = null; }
    if (br || u > best.u1) continue;
    // a footbridge: three across the channel, walked on the middle, railed on
    // the outer two; every ~18 blocks with no street crossing, clear of junctions
    if (opts.footbridges && u - lastCross >= 18 && u + 2 <= best.u1 - 4 &&
        ![u, u + 1, u + 2].some((q) => junction(q) || bridgeAt(q))) {
      for (let q = u; q <= u + 2; q++)
        for (let a = best.a0; a <= best.a1; a++) { const [x, z] = cell(q, a); use[z * W + x] = USE.SIDEWALK; }
      best.footbridges.push([u, u + 2]);
      lastCross = u + 2;
      u += 2;
      continue;
    }
    for (let a = best.a0; a <= best.a1; a++) {
      const [x, z] = cell(u, a);
      if (use[z * W + x] === USE_CANAL) continue;              // another canal's water stays water
      use[z * W + x] = a >= best.ch0 && a <= best.ch1 ? USE_CANAL : USE.SIDEWALK;
    }
  }
  best.bridges = best.bridgeSpans.length + best.footbridges.length;
  return best;
}

// A city of canals (the Venetian style): the best canal, then the next best on
// another street, and so on, up to `max`. Later canals may cross earlier ones
// (open water at the junction); streets cross them on their decks, and
// footbridges carry the walkways across between streets.
export function planCanals(plan, cfg, edgeDist, max = 6) {
  const out = [], exclude = new Set();
  const minRun = Math.max(16, Math.min(plan.W, plan.D) * 0.18);
  for (let i = 0; i < max; i++) {
    const c = planCanal(plan, cfg, edgeDist, { exclude, allowCanal: true, minRun, footbridges: true });
    if (!c) break;
    exclude.add(c.corridor);
    out.push(c);
  }
  return out;
}

// Carve it (after the ground is laid): extend the stone base under the whole
// city, cut the channel, fill it, railings, dock.
export function buildCanal(world, plan, canal, G, rng) {
  const { W, D, mask } = plan;
  // the city's base goes down to the canal bed everywhere, so the channel is
  // walled in by solid stone on every side. Once only: with several canals, a
  // second pass would fill the first canal's channel (and the air under its
  // bridges) back in with stone.
  if (!world.canalBaseLaid) {
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++)
        if (!mask || mask[z * W + x]) for (let y = BED; y <= 0; y++) world.set(x, y, z, MAT.BASE);
    world.canalBaseLaid = true;
  }
  const { cell } = canal;
  let water = 0;
  const lanes = [];
  for (let u = canal.u0; u <= canal.u1; u++) {
    for (let a = canal.ch0; a <= canal.ch1; a++) {
      const [x, z] = cell(u, a);
      world.set(x, BED, z, MAT.CANAL_BED);
      for (let y = WATER_LO; y <= WATER_HI; y++) { world.set(x, y, z, MAT.WATER); water++; }
      for (let y = WATER_HI + 1; y <= 0; y++) world.clear(x, y, z);
      if (plan.use[z * W + x] === USE_CANAL) {
        for (let y = G; y <= G + 3; y++) world.clear(x, y, z);   // open water
      }
      // under a bridge the road deck at y = G stays: two blocks of air below it
    }
    lanes.push(u);
  }
  // railings on the row either side of the channel (not on bridges)
  if (canal.railed) {
    for (let u = canal.u0; u <= canal.u1; u++)
      for (const a of [canal.ch0 - 1, canal.ch1 + 1]) {
        const [x, z] = cell(u, a);
        if (plan.use[z * W + x] !== USE.SIDEWALK) continue;
        if (!world.has(x, G + 1, z)) world.set(x, G + 1, z, MAT.FENCE);
      }
  }
  // footbridges: railed along both edges over the water, a lantern at each rail's ends
  for (const [f0, f2] of canal.footbridges || []) {
    for (const u of [f0, f2])
      for (let a = canal.ch0; a <= canal.ch1; a++) {
        const [x, z] = cell(u, a);
        if (!world.has(x, G + 1, z)) world.set(x, G + 1, z, MAT.FENCE);
        if (a === canal.ch0 || a === canal.ch1) world.set(x, G + 2, z, MAT.LAMP);
      }
  }
  // bridge railings: along both edges of each bridge, over the water only
  for (const [b0, b1] of canal.bridgeSpans) {
    if (b1 - b0 < 2) continue;                        // too narrow to rail and still cross
    for (const u of [b0, b1])
      for (let a = canal.ch0; a <= canal.ch1; a++) {
        const [x, z] = cell(u, a);
        if (!world.has(x, G + 1, z)) world.set(x, G + 1, z, MAT.FENCE);
      }
  }
  canal.water = water;
  canal.dock = canal.noDock ? null : buildDock(world, plan, canal, G);      // (no dock over a chasm)
  canal.landmarkBridge = dressBridge(world, plan, canal, G);
  return canal;
}

// One crossing is made a piece of architecture rather than a slab of road:
// the widest span gets a stone tower at each corner, an arch of stairs
// springing between them over the water, a lamp on every tower and a
// balustrade along both parapets. The deck itself is untouched, so the street
// and any railway across it still run.
function dressBridge(world, plan, canal, G) {
  const { W } = plan;
  const cell = (u, a) => (canal.axis === 'x' ? [u, a] : [a, u]);
  if (!canal.bridgeSpans || !canal.bridgeSpans.length) return null;
  // the widest span, and wide enough to be worth dressing
  let best = null;
  for (const [b0, b1] of canal.bridgeSpans) if (!best || b1 - b0 > best[1] - best[0]) best = [b0, b1];
  if (!best || best[1] - best[0] < 2) return null;
  const [b0, b1] = best;
  const a0 = canal.ch0 - 1, a1 = canal.ch1 + 1;          // the banks either side
  const towers = [];
  const HEIGHT = 5;
  for (const u of [b0, b1])
    for (const a of [a0, a1]) {
      const [x, z] = cell(u, a);
      for (let y = G + 1; y <= G + HEIGHT; y++) world.set(x, y, z, MAT.STONEBRICK);
      world.set(x, G + HEIGHT + 1, z, MAT.LAMP);
      towers.push([x, G + HEIGHT + 1, z]);
    }
  // the arch: stairs rising from each tower to meet over the middle
  const mid = Math.floor((a0 + a1) / 2);
  let arches = 0;
  for (const u of [b0, b1]) {
    for (let step = 1; a0 + step < mid; step++) {
      const y = G + HEIGHT - step + 1;
      if (y <= G + 1) break;
      for (const a of [a0 + step, a1 - step]) {
        const [x, z] = cell(u, a);
        if (world.has(x, y, z)) continue;
        world.set(x, y, z, MAT.STONEBRICK);
        arches++;
      }
    }
    const [mx, mz] = cell(u, mid);
    const capY = G + HEIGHT - Math.max(1, mid - a0) + 1;
    if (capY > G + 1 && !world.has(mx, capY, mz)) { world.set(mx, capY, mz, MAT.STONEBRICK); arches++; }
  }
  // a balustrade along both parapets, between the towers
  let rails = 0;
  for (const u of [b0, b1])
    for (let a = a0 + 1; a <= a1 - 1; a++) {
      const [x, z] = cell(u, a);
      if (world.has(x, G + 1, z)) continue;
      world.set(x, G + 1, z, MAT.FENCE);
      rails++;
    }
  return { span: [b0, b1], towers, arches, rails, height: HEIGHT };
}

// A dock on one bank: three stairs down from the walkway (y G) to a wooden
// landing just above the water (planks at WATER_HI, you stand at WATER_HI+1),
// three blocks long, open to the sky, the railing opened for it.
function buildDock(world, plan, canal, G) {
  const { W } = plan, { cell } = canal;
  const bank = canal.ch0 - 1;                       // the bank row next to the channel, on the low side
  const len = 6;                                    // 3 steps + 3 landing
  // find a stretch of open water beside a plain bank, away from the bridges
  const open = (u) => {
    const [cx, cz] = cell(u, canal.ch0);
    const [bx, bz] = cell(u, bank);
    return plan.use[cz * W + cx] === USE_CANAL && plan.use[bz * W + bx] === USE.SIDEWALK;
  };
  const midU = Math.floor((canal.u0 + canal.u1) / 2);
  let start = null;
  for (let d = 0; d < canal.u1 - canal.u0 && start === null; d++) {
    for (const u0 of [midU - d, midU + d]) {
      if (u0 - 2 < canal.u0 || u0 + len + 1 > canal.u1) continue;
      let ok = true;
      for (let u = u0 - 2; u < u0 + len + 2 && ok; u++) if (!open(u)) ok = false;
      if (ok) { start = u0; break; }
    }
  }
  if (start === null) return null;
  // the stairs climb back towards the walkway (the -u direction)
  const upDir = canal.axis === 'x' ? WEIRDO.west : WEIRDO.north;
  const steps = [];
  for (let i = 0; i < len; i++) {
    const [x, z] = cell(start + i, bank);
    for (let y = WATER_HI + 1; y <= G + 3; y++) world.clear(x, y, z);
    if (i < 3) {
      const y = G - i;                                // stairs at y 1, 0, -1: walkway level down
      for (let yy = BED; yy < y; yy++) world.set(x, yy, z, MAT.BASE);
      world.set(x, y, z, stairId('stonebrick', upDir));
      steps.push([x, y, z]);
    } else {
      for (let yy = BED; yy < WATER_HI; yy++) world.set(x, yy, z, MAT.BASE);
      world.set(x, WATER_HI, z, MAT.DOCK);            // the landing, level with the water surface
    }
  }
  // boats in the channel beside the landing
  const boats = [];
  for (const i of [3, 5]) {
    const [x, z] = cell(start + i, canal.ch0);
    boats.push({ type: 'boat', x, y: WATER_HI, z });
  }
  const landing = [3, 4, 5].map((i) => { const [x, z] = cell(start + i, bank); return [x, WATER_HI + 1, z]; });
  return { start, steps, landing, boats };
}
