// engine/harbour.js — the working waterfront.
//
// A stretch of the canal, clear of the bridges, is widened into a basin. The
// bank beside it becomes a quay: mooring bollards, stacked crates and barrels,
// gantry cranes whose arms reach out over the water with chains hanging from
// them, and boats tied up alongside. Behind the quay stand warehouses, and
// behind those a goods yard with rail sidings and parked minecarts.
//
// The district is reserved while the city is still being planned, so no
// ordinary lots are laid out on it and the hills leave it level. The basin
// follows the same rule as every other water in Polis: solid stone or water on
// all four sides and underneath.

import { MAT, chestId, signId, SIGN_FACING, railId, poweredRailId, RAIL } from './materials.js';
import { USE } from './plan.js';
import { USE_CANAL, BED, WATER_LO, WATER_HI } from './water.js';
import { makeBuilding } from './building.js';
import { signTags } from './landmarks.js';

// Plan it: choose a stretch of canal and the land beside it. Returns the
// district, with the lots it swallows already removed from the plan.
export const USE_YARD = 9;      // the goods yard: rails may sit on it, but the railway never routes through it

export function planHarbour(plan, canal, cfg) {
  if (!canal || !cfg.harbour) return null;
  const { W, D, use } = plan;
  const { cell } = canal;
  const inCity = (x, z) => x >= 1 && z >= 1 && x < W - 1 && z < D - 1 && (!plan.mask || plan.mask[z * W + x]);
  // The waterfront stays inside the block beside the canal: it never crosses a
  // street, so no road or railway is paved over. How deep can it go here?
  const depthAt = (u, side) => {
    const edge = side > 0 ? canal.ch1 : canal.ch0;
    for (let k = 1; k <= 40; k++) {
      const [x, z] = cell(u, edge + side * k);
      if (!inCity(x, z)) return k - 1;
      const u2 = use[z * W + x];
      if (u2 === USE.ROAD || u2 === USE_CANAL || u2 === USE.EMPTY) return k - 1;   // the next street
    }
    return 40;
  };
  const clearOf = (u) => !canal.bridgeSpans.some(([b0, b1]) => u >= b0 - 1 && u <= b1 + 1);
  let best = null;
  for (const side of [1, -1]) {
    const edge = side > 0 ? canal.ch1 : canal.ch0;
    let run = [];
    for (let u = canal.u0 + 2; u <= canal.u1 - 2 + 1; u++) {
      const d = u <= canal.u1 - 2 && clearOf(u) ? depthAt(u, side) : 0;
      if (d >= 16) { run.push({ u, d }); continue; }
      if (run.length >= 12) {
        const depth = Math.min(...run.map((r) => r.d));
        const len = Math.min(run.length, 30);
        const score = len * Math.min(depth, 24);
        if (!best || score > best.score) best = { score, side, edge, u0: run[0].u, u1: run[0].u + len - 1, depth };
      }
      run = [];
    }
  }
  if (!best) return null;
  // bands from the water inland, sized to the room there is
  const BASIN = 4, QUAY = 3;
  const sheds = Math.max(7, Math.min(10, best.depth - BASIN - QUAY - 5));
  const yard = Math.min(9, best.depth - BASIN - QUAY - sheds);
  if (yard < 5) return null;
  const aAt = (k) => best.edge + best.side * k;
  const needed = BASIN + QUAY + sheds + yard;
  const h = { u0: best.u0, u1: best.u1, side: best.side, edge: best.edge, aAt, cell, axis: canal.axis,
    basin: BASIN, quay: QUAY, sheds, yard, needed };
  for (let u = h.u0; u <= h.u1; u++)
    for (let k = 1; k <= needed; k++) {
      const [x, z] = cell(u, aAt(k));
      // water, then the quay, then the ground the warehouses stand on, and
      // finally the paved goods yard (its sidings need road ground)
      use[z * W + x] = k <= BASIN ? USE_CANAL
        : k <= BASIN + QUAY ? USE.SIDEWALK
        : k <= BASIN + QUAY + sheds ? USE.LOT
        : USE_YARD;
    }
  const taken = new Set();
  for (let u = h.u0; u <= h.u1; u++) for (let k = 1; k <= needed; k++) taken.add(cell(u, aAt(k)).join());
  plan.lots = plan.lots.filter((l) => {
    for (let x = l.x0; x <= l.x1; x++) for (let z = l.z0; z <= l.z1; z++) if (taken.has(x + ',' + z)) return false;
    return true;
  });
  h.cells = taken;
  return h;
}

// Build it (after the canal is cut, before the lots go up).
export function buildHarbour(world, plan, h, cfg, rng, G, buildings) {
  const { cell, aAt } = h;
  const put = (u, k, y, m) => { const [x, z] = cell(u, aAt(k)); world.set(x, y, z, m); return [x, z]; };
  const clearCol = (u, k, y0, y1) => { const [x, z] = cell(u, aAt(k)); for (let y = y0; y <= y1; y++) world.clear(x, y, z); };
  const out = { basin: 0, cranes: [], crates: 0, boats: [], warehouses: [], sidings: [], sign: null, rect: { u0: h.u0, u1: h.u1 } };

  // ---- basin: the canal widened, walled and open to the sky
  for (let u = h.u0; u <= h.u1; u++) {
    for (let k = 1; k <= h.basin; k++) {
      put(u, k, BED, MAT.CANAL_BED);
      for (let y = WATER_LO; y <= WATER_HI; y++) { put(u, k, y, MAT.WATER); out.basin++; }
      clearCol(u, k, WATER_HI + 1, G + 6);
    }
    // quay wall and its walkway
    for (let k = h.basin + 1; k <= h.basin + h.quay; k++) {
      for (let y = BED; y <= G - 1; y++) put(u, k, y, MAT.BASE);
      put(u, k, G, k === h.basin + 1 ? MAT.STONEBRICK : MAT.ANDESITE);
      clearCol(u, k, G + 1, G + 6);
    }
  }

  // ---- warehouses along the back of the quay
  const shedK0 = h.basin + h.quay + 1;
  const theme = { name: 'warehouse', wall: MAT.BRICK, trim: MAT.DEEPSLATE, floor: MAT.SMOOTH, glass: MAT.GLASS,
    stair: 'stonebrick', door: 'dark' };
  const face = h.axis === 'x'
    ? (h.side > 0 ? 'north' : 'south')                        // the door looks back at the quay
    : (h.side > 0 ? 'west' : 'east');
  for (let u = h.u0 + 1; u + 9 <= h.u1; u += 11) {
    const [ax, az] = cell(u, aAt(shedK0));
    const [bx, bz] = cell(u + 9, aAt(shedK0 + h.sheds - 2));
    const r = { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) };
    const rec = makeBuilding(world, { ...r, floors: 1, pitch: Math.max(6, cfg.pitch + 1), groundY: G, style: 'mid', facing: face,
      theme, roofAccess: false, useStairs: cfg.useStairs, stairStyle: 'switchback', lights: cfg.lights, setback: false,
      setbackEvery: 99, detail: cfg.detail }, rng);
    if (!rec) continue;
    rec.rooms = () => 'warehouse';
    rec.landmark = 'harbour';
    buildings.push(rec);
    out.warehouses.push(rec);
  }

  // ---- quay furniture: bollards, crates, cranes, and boats alongside
  // (the warehouses are already up, so their doorways can be kept clear)
  const doorways = new Set();
  for (const rec of out.warehouses)
    for (const [dx, dz] of rec.doorCells)
      for (let ox = -3; ox <= 3; ox++) for (let oz = -3; oz <= 3; oz++) doorways.add((dx + ox) + ',' + (dz + oz));
  const clearOfDoor = (u, k) => { const [x, z] = cell(u, aAt(k)); return !doorways.has(x + ',' + z); };
  const kEdge = h.basin + 1;                                  // the walkway right by the water
  for (let u = h.u0 + 2; u <= h.u1 - 2; u += 4) {
    if (clearOfDoor(u, kEdge)) put(u, kEdge, G + 1, MAT.IRON); // a bollard to tie up to
    // always a couple of boats tied up, more on a long quay
    const always = u === h.u0 + 2 || u >= h.u1 - 5;
    if (always || rng.chance(0.55)) {
      const [bx, bz] = cell(u, aAt(1));
      out.boats.push({ type: 'boat', x: bx, y: WATER_HI, z: bz });
    }
  }
  // crates stack on the middle of the quay; the row against the warehouses
  // stays a clear walking lane
  for (let u = h.u0 + 1; u <= h.u1 - 1; u++) {
    for (let k = h.basin + 2; k <= h.basin + h.quay - 1; k++) {
      if (!rng.chance(0.22) || !clearOfDoor(u, k)) continue;
      const stack = rng.int(1, 3);
      for (let i = 0; i < stack; i++) put(u, k, G + 1 + i, rng.chance(0.5) ? MAT.BARREL : chestId(rng.pick(['north', 'south', 'east', 'west'])));
      out.crates += stack;
    }
  }
  // gantry cranes: two legs on the quay, an arm out over the water, a chain
  // cranes wherever the quay is clear of the warehouse doors, spaced out
  let lastCrane = -99;
  for (let u = h.u0 + 2; u <= h.u1 - 2; u++) {
    if (u - lastCrane < 6 || out.cranes.length >= 4) continue;
    const legK = h.basin + 2;
    if (!clearOfDoor(u, legK) || !clearOfDoor(u + 1, legK)) continue;
    lastCrane = u;
    for (const uu of [u, u + 1])
      for (let y = G + 1; y <= G + 6; y++) put(uu, legK, y, MAT.IRON);
    for (let k = 2; k <= legK; k++) { put(u, k, G + 7, MAT.IRON); put(u + 1, k, G + 7, MAT.IRON); }
    for (let k = 2; k <= legK; k += 2) put(u, k, G + 6, MAT.CHAIN);
    for (let y = G + 3; y <= G + 5; y++) put(u, 2, y, MAT.CHAIN);
    const [cx, cz] = cell(u, aAt(2));
    out.cranes.push([cx, G + 7, cz]);
  }

  // ---- goods yard: paving, sidings with buffers, parked carts, a loading dock
  const yardK0 = h.basin + h.quay + h.sheds + 1;
  for (let u = h.u0; u <= h.u1; u++)
    for (let k = yardK0; k <= yardK0 + h.yard - 1; k++) {
      for (let y = BED; y <= G - 1; y++) put(u, k, y, MAT.BASE);
      put(u, k, G, MAT.GRAVEL);
      clearCol(u, k, G + 1, G + 5);
    }
  // one siding per three blocks of yard, always inside it, three apart
  const sidingKs = h.yard >= 8 ? [yardK0 + 1, yardK0 + 4] : [yardK0 + 1];
  for (const k of sidingKs) {
    const cells = [];
    for (let u = h.u0 + 2; u <= h.u1 - 2; u++) {
      put(u, k, G, MAT.GRAVEL);
      const [x, z] = cell(u, aAt(k));
      cells.push([x, G + 1, z]);
    }
    out.sidings.push({ k, cells });
  }
  // a loading platform beside the sidings
  const platK = sidingKs.length > 1 ? yardK0 + 2 : yardK0 + 3;
  if (platK <= yardK0 + h.yard - 1) {
    for (let u = h.u0 + 4; u <= h.u1 - 4; u++) {
      put(u, platK, G + 1, MAT.SMOOTH);
      if (u % 5 === 0) put(u, platK, G + 2, MAT.BARREL);
    }
  }
  // the name, on the quay facing the city
  const signU = h.u0 + Math.floor((h.u1 - h.u0) / 2);
  const [sx, sz] = cell(signU, aAt(h.basin + h.quay));
  if (!world.has(sx, G + 1, sz)) {
    const facing = h.axis === 'x' ? (h.side > 0 ? 'south' : 'north') : (h.side > 0 ? 'east' : 'west');
    world.set(sx, G + 1, sz, signId(SIGN_FACING[facing]));
    world.setData(sx, G + 1, sz, { id: 'Sign', tags: signTags('Harbour\nwarehouses\nand goods yard') });
    out.sign = [sx, G + 1, sz];
  }
  return out;
}

// The sidings become proper rail lines, laid once the railway is in, so they
// are buffered, powered and carted like every other line.
export function harbourSidings(world, h, out, transit, G) {
  if (!transit || !out.sidings.length) return;
  const alongX = h.axis === 'x';
  for (const s of out.sidings) {
    const dir = alongX ? RAIL.EW : RAIL.NS;
    const cells = s.cells;
    for (let i = 0; i < cells.length; i++) {
      const [x, y, z] = cells[i];
      world.set(x, y - 1, z, MAT.GRAVEL);
      const boost = i % 16 === 8;
      if (boost) world.set(x, y - 1, z, MAT.REDSTONE);
      world.set(x, y, z, boost ? poweredRailId(dir) : railId(dir));
      for (let yy = y + 1; yy <= y + 2; yy++) world.clear(x, yy, z);
    }
    // buffers at both ends, one step on beyond the last rail either way
    const step = [cells[1][0] - cells[0][0], cells[1][2] - cells[0][2]];
    const ends = [[cells[0], [-step[0], -step[1]]], [cells[cells.length - 1], step]];
    for (const [[x, y, z], [dx, dz]] of ends) {
      world.set(x + dx, y - 1, z + dz, MAT.GRAVEL);
      world.set(x + dx, y, z + dz, MAT.STONEBRICK);
      for (let yy = y + 1; yy <= y + 2; yy++) world.clear(x + dx, yy, z + dz);
    }
    const mid = cells[Math.floor(cells.length / 2)];
    transit.lines.push({ axis: alongX ? 'x' : 'z', siding: true, cells, stations: [mid] });
    transit.carts.push({ type: 'minecart', x: mid[0], y: mid[1], z: mid[2] });
    transit.stats.lines++;
    transit.stats.rails += cells.length;
  }
}
