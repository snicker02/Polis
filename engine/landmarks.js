// engine/landmarks.js — one-off civic buildings near downtown.
//
// Each city picks the lots nearest its downtown focal point that are big
// enough, and builds up to four landmarks on them:
//
//   town hall    quartz, set back behind a forecourt with a two-storey
//                colonnade, a copper dome, and the village bell out front
//   clock tower  slender stone tower with a clock face on all four sides,
//                an open belfry with a hanging bell, and a copper spire
//   library      brick, bookshelves and lecterns on every floor
//   market       paved square with striped stalls and a covered well
//
// The three buildings are made by the same engine as every other building
// (building.js), so they keep the same guarantees — stairs to every floor,
// doors, windows, head room — and the same flood-fill verification. Only
// the ornament is new, and none of it sits on a floor a player walks.

import { makeBuilding, OUTWARD } from './building.js';
import { MAT, WOOLS, pumpkinId, smokerId, stairId, WEIRDO, STAINED } from './materials.js';
import { USE } from './plan.js';
import { styleOf } from './styles.js';

export const LANDMARKS = ['townhall', 'clocktower', 'library', 'market', 'church', 'school', 'lighthouse', 'castle'];
const NEED = {                       // [shorter side, longer side] of the lot
  townhall: [13, 15], clocktower: [9, 9], library: [11, 12], market: [12, 12],
  church: [13, 15], school: [13, 14], lighthouse: [9, 9], castle: [13, 13],
};

// Mark the lots, each kind at most once:
//   town hall, clock tower, library, market, church  the lots nearest downtown
//   school      halfway out towards the edge
//   lighthouse  beside the canal (or, with no canal, out at the edge)
//   castle      on the highest hill
export function chooseLandmarks(plan, cfg, hills = null, canal = null) {
  if (!cfg.landmarks) return [];
  const [fx, fz] = plan.focal;
  const reach = Math.max(plan.W, plan.D) * 0.45;
  const all = plan.lots
    .filter((l) => l.kind === USE.LOT)
    .map((l) => ({ l, cx: (l.x0 + l.x1) / 2, cz: (l.z0 + l.z1) / 2,
      a: Math.min(l.x1 - l.x0 + 1, l.z1 - l.z0 + 1), b: Math.max(l.x1 - l.x0 + 1, l.z1 - l.z0 + 1) }))
    .map((c) => ({ ...c, d: Math.hypot(c.cx - fx, c.cz - fz) }));
  const fits = (c, kind) => !c.l.landmark && c.a >= NEED[kind][0] && c.b >= NEED[kind][1];
  const out = [];
  const take = (kind, list) => { const pick = list.find((c) => fits(c, kind)); if (pick) { pick.l.landmark = kind; out.push(pick.l); } };
  const downtown = all.filter((c) => c.l.style !== 'house' && c.d <= reach).sort((p, q) => p.d - q.d);
  for (const kind of ['townhall', 'clocktower', 'library', 'market', 'church']) take(kind, downtown);
  const maxD = Math.max(1, ...all.map((c) => c.d));
  take('school', all.slice().sort((p, q) => Math.abs(p.d - maxD * 0.5) - Math.abs(q.d - maxD * 0.5)));
  if (canal) {
    const canalCells = [];
    for (let u = canal.u0; u <= canal.u1; u += 2) canalCells.push(canal.cell(u, canal.ch0));
    const toCanal = (c) => Math.min(...canalCells.map(([x, z]) => Math.max(0, Math.abs(x - c.cx) - (c.l.x1 - c.l.x0) / 2) + Math.max(0, Math.abs(z - c.cz) - (c.l.z1 - c.l.z0) / 2)));
    take('lighthouse', all.filter((c) => toCanal(c) <= 8).sort((p, q) => toCanal(p) - toCanal(q)));
  }
  if (!out.some((l) => l.landmark === 'lighthouse')) take('lighthouse', all.slice().sort((p, q) => q.d - p.d));
  const elev = (c) => (hills ? hills.elev[Math.round(c.cz) * plan.W + Math.round(c.cx)] : 0);
  take('castle', all.slice().sort((p, q) => elev(q) - elev(p) || q.a - p.a));
  return out;
}

// ---- helpers ---------------------------------------------------------------
const right = (face) => { const [fx, fz] = OUTWARD[face]; return [fz, -fx]; };   // viewer outside, facing the building

function inset(lot, face, front, side) {
  const r = { x0: lot.x0 + side, z0: lot.z0 + side, x1: lot.x1 - side, z1: lot.z1 - side };
  if (face === 'south') r.z1 = lot.z1 - front;
  else if (face === 'north') r.z0 = lot.z0 + front;
  else if (face === 'east') r.x1 = lot.x1 - front;
  else r.x0 = lot.x0 + front;
  return r;
}

function pave(world, lot, G, pick) {
  for (let z = lot.z0; z <= lot.z1; z++)
    for (let x = lot.x0; x <= lot.x1; x++) {
      world.set(x, G, z, pick(x, z));
      for (let y = G + 1; y <= G + 4; y++) world.clear(x, y, z);
    }
}

// the facade line of a rect on its street side, left to right as the viewer sees it
function facadeCells(r, face) {
  const cells = [];
  if (face === 'south') for (let x = r.x0; x <= r.x1; x++) cells.push([x, r.z1]);
  else if (face === 'north') for (let x = r.x1; x >= r.x0; x--) cells.push([x, r.z0]);
  else if (face === 'east') for (let z = r.z1; z >= r.z0; z--) cells.push([r.x1, z]);
  else for (let z = r.z0; z <= r.z1; z++) cells.push([r.x0, z]);
  return cells;
}

const inLot = (lot, x, z) => x >= lot.x0 && x <= lot.x1 && z >= lot.z0 && z <= lot.z1;

// ---- town hall -------------------------------------------------------------
function townHall(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, () => LP.hallPave);
  const r = inset(lot, face, 3, 1);
  const P = cfg.pitch;
  const floors = Math.min(r.x1 - r.x0, r.z1 - r.z0) >= 14 ? 3 : 2;
  const theme = { name: 'town hall', wall: LP.hallWall, trim: LP.hallColumn, floor: LP.hallFloor,
    glass: LP.hallGlass, stair: LP.hallStair, door: LP.hallDoor };
  const rec = makeBuilding(world, { ...r, floors, pitch: P, groundY: G, style: 'tower', facing: face, theme,
    roofAccess: false, useStairs: cfg.useStairs, stairStyle: 'wide', lights: cfg.lights, setback: false, setbackEvery: 99 }, rng);
  if (!rec) return null;
  const [Fx, Fz] = OUTWARD[face], [Rx, Rz] = right(face);

  // colonnade: a quartz column every other block along the facade, one block
  // out, two storeys tall, under a continuous entablature; clear of the doors
  const cols = facadeCells(rec.rects[0], face);
  const colTop = Math.min(rec.roofY, G + 2 * P) - 1;
  const nearDoor = (x, z) => rec.doorCells.some(([a, b]) => Math.abs(a - x) + Math.abs(b - z) <= 2);
  cols.forEach(([x, z], i) => {
    const px = x + Fx, pz = z + Fz;
    if (!inLot(lot, px, pz)) return;
    if (i % 2 === 0 && !nearDoor(x, z)) {
      for (let y = G + 1; y < colTop; y++) world.set(px, y, pz, LP.hallColumn);
      world.set(px, colTop, pz, LP.hallCapital);
    }
    world.set(px, colTop + 1, pz, LP.entablature);
  });

  // the village bell, in the forecourt beside the path to the doors
  let bell = null;
  const [dx, dz] = rec.doorCells[0];
  for (const k of [-4, 5, -5, 6, -3, 4]) {
    const bx = dx + 2 * Fx + k * Rx, bz = dz + 2 * Fz + k * Rz;
    if (!inLot(lot, bx, bz) || world.has(bx, G + 1, bz) || !world.has(bx, G, bz)) continue;
    world.set(bx, G + 1, bz, MAT.BELL);
    bell = [bx, G + 1, bz];
    break;
  }

  // copper dome on the roof
  const top = rec.rects[rec.floors - 1];
  const cx = Math.round((top.x0 + top.x1) / 2), cz = Math.round((top.z0 + top.z1) / 2);
  if (top.x1 - top.x0 >= 8 && top.z1 - top.z0 >= 8) {
    const y0 = rec.roofY;
    for (let dz2 = -2; dz2 <= 2; dz2++) for (let dx2 = -2; dx2 <= 2; dx2++) {
      world.set(cx + dx2, y0 + 1, cz + dz2, LP.domeBase);
      world.set(cx + dx2, y0 + 2, cz + dz2, Math.abs(dx2) === 2 || Math.abs(dz2) === 2 ? LP.domeRing : LP.domeBase);
      world.set(cx + dx2, y0 + 3, cz + dz2, LP.dome);
      if (Math.abs(dx2) <= 1 && Math.abs(dz2) <= 1) world.set(cx + dx2, y0 + 4, cz + dz2, LP.dome);
    }
    world.set(cx, y0 + 5, cz, LP.dome);
    world.set(cx, y0 + 6, cz, LP.finial);
    rec.topY = Math.max(rec.topY, y0 + 6);
  }
  rec.rooms = (k) => (k === 0 ? 'hall' : 'office');
  rec.landmark = 'townhall';
  return { kind: 'townhall', rec, bell, lot };
}

// ---- clock tower -----------------------------------------------------------
// face pattern, rows top to bottom, columns left to right as seen from outside:
// 12 o'clock marker, minute hand up, 9 - centre - hour hand - 3, 6 o'clock
export const CLOCK_FACE = ['QQBQQ', 'QQBQQ', 'BQGBB', 'QQQQQ', 'QQBQQ'];

function clockTower(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, (x, z) => LP.clockPave[(x + z) & 1]);
  const cx = Math.floor((lot.x0 + lot.x1) / 2), cz = Math.floor((lot.z0 + lot.z1) / 2);
  const r = { x0: cx - 3, z0: cz - 3, x1: cx + 3, z1: cz + 3 };
  const floors = Math.max(4, Math.min(8, cfg.maxFloors | 0 || 8));
  const theme = { name: 'clock tower', wall: LP.clockWall, trim: LP.clockTrim, floor: LP.clockFloor,
    glass: MAT.GLASS, stair: LP.clockStair, door: LP.clockDoor };
  const rec = makeBuilding(world, { ...r, floors, pitch: cfg.pitch, groundY: G, style: 'mid', facing: face, theme,
    roofAccess: false, useStairs: cfg.useStairs, stairStyle: 'spiral', lights: cfg.lights, setback: false, setbackEvery: 99 }, rng);
  if (!rec) return null;
  const y0 = rec.roofY;
  const t = rec.rects[rec.floors - 1];
  const ring = (x, z) => x === t.x0 || x === t.x1 || z === t.z0 || z === t.z1;
  // clock stage: a 7-block-tall shaft of stone with a face on each side
  for (let y = y0 + 1; y <= y0 + 7; y++)
    for (let z = t.z0; z <= t.z1; z++)
      for (let x = t.x0; x <= t.x1; x++) {
        if (ring(x, z)) world.set(x, y, z, LP.clockWall); else world.clear(x, y, z);
      }
  const faces = [];
  for (const side of ['north', 'south', 'east', 'west']) {
    const [Fx, Fz] = OUTWARD[side], [Rx, Rz] = right(side);
    const sx = cx + 3 * Fx, sz = cz + 3 * Fz;
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 5; j++) {
        const ch = CLOCK_FACE[i][j];
        const m = ch === 'B' ? MAT.C_BLACK : ch === 'G' ? MAT.GOLD : MAT.SMOOTH_QUARTZ;
        world.set(sx + (j - 2) * Rx, y0 + 6 - i, sz + (j - 2) * Rz, m);
      }
    faces.push({ side, centre: [sx, y0 + 4, sz] });
  }
  // belfry: solid floor, four corner piers, open arches, bell hanging from the roof
  for (let z = t.z0; z <= t.z1; z++) for (let x = t.x0; x <= t.x1; x++) world.set(x, y0 + 8, z, LP.clockWall);
  for (const [x, z] of [[t.x0, t.z0], [t.x1, t.z0], [t.x0, t.z1], [t.x1, t.z1]])
    for (let y = y0 + 9; y <= y0 + 11; y++) world.set(x, y, z, LP.clockTrim);
  for (let z = t.z0; z <= t.z1; z++) for (let x = t.x0; x <= t.x1; x++) world.set(x, y0 + 12, z, LP.spire);
  world.set(cx, y0 + 11, cz, MAT.BELL_HANG);
  // copper spire with a gold finial
  for (let k = 1; k <= 3; k++) {
    const h = 3 - k;
    for (let dz = -h; dz <= h; dz++) for (let dx = -h; dx <= h; dx++) world.set(cx + dx, y0 + 12 + k, cz + dz, LP.spire);
  }
  world.set(cx, y0 + 16, cz, LP.finial);
  rec.topY = y0 + 16;
  rec.rooms = (k) => (k === 0 ? 'hall' : (k % 2 ? 'office' : 'library'));
  rec.landmark = 'clocktower';
  return { kind: 'clocktower', rec, faces, belfryBell: [cx, y0 + 11, cz], lot };
}

// ---- library ---------------------------------------------------------------
function library(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, () => LP.libPave);
  const r = inset(lot, face, 2, 1);
  const floors = Math.min(r.x1 - r.x0, r.z1 - r.z0) >= 14 ? 3 : 2;
  const theme = { name: 'library', wall: LP.libWall, trim: LP.libTrim, floor: LP.libFloor,
    glass: MAT.PANE, stair: LP.libStair, door: LP.libDoor };
  const rec = makeBuilding(world, { ...r, floors, pitch: cfg.pitch, groundY: G, style: 'mid', facing: face, theme,
    roofAccess: cfg.roofAccess, useStairs: cfg.useStairs, stairStyle: 'switchback', lights: cfg.lights, setback: false, setbackEvery: 99 }, rng);
  if (!rec) return null;
  // lantern posts either side of the entrance
  const [Fx, Fz] = OUTWARD[face], [Rx, Rz] = right(face);
  const [dx, dz] = rec.doorCells[0];
  for (const k of [-2, 2]) {
    const x = dx + Fx + k * Rx, z = dz + Fz + k * Rz;
    if (!inLot(lot, x, z) || world.has(x, G + 1, z)) continue;
    world.set(x, G + 1, z, MAT.FENCE); world.set(x, G + 2, z, MAT.FENCE); world.set(x, G + 3, z, MAT.LAMP);
  }
  rec.rooms = () => 'library';
  rec.landmark = 'library';
  return { kind: 'library', rec, lot };
}

// ---- market square ---------------------------------------------------------
function market(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, (x, z) => LP.market[(x + z) & 1]);
  const I = { x0: lot.x0 + 1, z0: lot.z0 + 1, x1: lot.x1 - 1, z1: lot.z1 - 1 };
  const Lx = I.x1 - I.x0 + 1, Lz = I.z1 - I.z0 + 1;
  const mx = I.x0 + Math.floor(Lx / 2), mz = I.z0 + Math.floor(Lz / 2);
  // a covered well in big squares (2x2 of water at ground level, stone rim,
  // four posts and a roof); a lantern post in small ones
  const bigSquare = Lx >= 16 && Lz >= 16;
  const cx = mx - 1, cz = mz - 1;
  let well = null;
  if (bigSquare) {
    for (let dz = -1; dz <= 2; dz++)
      for (let dx = -1; dx <= 2; dx++) {
        const x = cx + dx, z = cz + dz;
        const water = dx >= 0 && dx <= 1 && dz >= 0 && dz <= 1;
        if (water) world.set(x, G, z, MAT.WATER);
        else world.set(x, G + 1, z, LP.wellRim);
        if ((dx === -1 || dx === 2) && (dz === -1 || dz === 2)) { world.set(x, G + 2, z, MAT.FENCE); world.set(x, G + 3, z, MAT.FENCE); }
        world.set(x, G + 4, z, LP.wellRoof);
      }
    world.set(cx, G + 3, cz, MAT.LAMP_HANG);
    well = [cx, cz];
  }
  const nearWell = (x0, z0, x1, z1) => bigSquare && x1 >= cx - 2 && x0 <= cx + 3 && z1 >= cz - 2 && z0 <= cz + 3;
  // stalls on a 5-block grid (3-block stall, 2-block aisle), centred in the square
  const grid = (lo, len) => {
    const n = Math.max(0, Math.floor((len + 2) / 5));
    const start = lo + Math.floor((len - (5 * n - 2)) / 2);
    return Array.from({ length: n }, (_, i) => start + 5 * i);
  };
  const GOODS = [() => MAT.MELON, () => pumpkinId(rng.pick(['north', 'south', 'east', 'west'])), () => MAT.HAY,
    () => MAT.BARREL, () => MAT.COMPOSTER, () => MAT.CAULDRON_FULL, () => MAT.CRAFTING, () => smokerId('south')];
  const stalls = [];
  let k = 0;
  for (const sz of grid(I.z0, Lz))
    for (const sx of grid(I.x0, Lx)) {
      if (nearWell(sx, sz, sx + 2, sz + 2)) continue;
      for (const [x, z] of [[sx, sz], [sx + 2, sz], [sx, sz + 2], [sx + 2, sz + 2]]) {
        world.set(x, G + 1, z, MAT.FENCE); world.set(x, G + 2, z, MAT.FENCE);
      }
      const wool = WOOLS[k++ % WOOLS.length];
      for (let z = sz; z <= sz + 2; z++) for (let x = sx; x <= sx + 2; x++) world.set(x, G + 3, z, wool);
      world.set(sx + 1, G + 1, sz + 1, rng.pick(GOODS)());
      stalls.push({ x0: sx, z0: sz, x1: sx + 2, z1: sz + 2 });
    }
  if (!bigSquare) {
    // lantern post where the aisles cross, if that spot is clear
    const px = mx, pz = mz;
    if (!world.has(px, G + 1, pz) && !world.has(px, G + 3, pz)) {
      world.set(px, G + 1, pz, MAT.FENCE); world.set(px, G + 2, pz, MAT.FENCE); world.set(px, G + 3, pz, MAT.LAMP);
    }
  }
  return { kind: 'market', rec: null, stalls, well, lot };
}

// ---- church ------------------------------------------------------------------
// A tall nave with stained glass, pews facing the altar, and a bell tower with
// a spire rising over the entrance.
function church(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, () => LP.hallPave);
  const r = inset(lot, face, 2, 1);
  const P = Math.max(8, cfg.pitch + 3);
  const glass = rng.pick(STAINED);
  const theme = { name: 'church', wall: LP.churchWall || LP.clockWall, trim: LP.churchTrim || LP.clockTrim,
    floor: LP.clockFloor, glass, stair: LP.clockStair, door: LP.clockDoor };
  const rec = makeBuilding(world, { ...r, floors: 1, pitch: P, groundY: G, style: 'mid', facing: face, theme,
    roofAccess: false, useStairs: cfg.useStairs, stairStyle: 'switchback', lights: cfg.lights, setback: false, setbackEvery: 99 }, rng);
  if (!rec) return null;
  const [Fx, Fz] = OUTWARD[face], [Rx, Rz] = right(face);
  const I = { x0: r.x0 + 1, z0: r.z0 + 1, x1: r.x1 - 1, z1: r.z1 - 1 };
  // depth runs from the entrance (d = 0) to the altar; across from the viewer's left
  const alongFace = face === 'north' || face === 'south';
  const depthLen = alongFace ? I.z1 - I.z0 + 1 : I.x1 - I.x0 + 1;
  const acrossLen = alongFace ? I.x1 - I.x0 + 1 : I.z1 - I.z0 + 1;
  const cellAt = (d, a) => {
    // d measured inward from the entrance wall, a across left to right as seen from the entrance
    if (face === 'south') return [I.x0 + a, I.z1 - d];
    if (face === 'north') return [I.x1 - a, I.z0 + d];
    if (face === 'east') return [I.x1 - d, I.z0 + a];
    return [I.x0 + d, I.z1 - a];
  };
  const y = G + 1;
  // altar at the far end: a raised block with a lectern before it
  const midA = Math.floor(acrossLen / 2);
  const [ax, az] = cellAt(depthLen - 1, midA);
  world.set(ax, y, az, LP.hallCapital || MAT.CHISELED_STONE);
  world.set(ax, y + 1, az, MAT.LAMP);
  // pews: rows of stairs with their backs to the entrance, a central aisle and side aisles
  const pewFacing = { north: WEIRDO.north, south: WEIRDO.south, east: WEIRDO.east, west: WEIRDO.west }[face];
  let pews = 0;
  for (let d = 3; d <= depthLen - 4; d += 2) {
    for (let a = 1; a < acrossLen - 1; a++) {
      if (Math.abs(a - midA) <= 1 - (acrossLen % 2)) continue;          // the aisle up the middle
      if (a === midA) continue;
      const [x, z] = cellAt(d, a);
      if (world.has(x, y, z)) continue;
      world.set(x, y, z, stairId(LP.clockStair || 'dark', pewFacing));
      pews++;
    }
  }
  // bell tower over the entrance, rising from the roof, with a spire
  const t = rec.rects[0];
  const [dx, dz] = rec.doorCells[0];
  const tc = [dx - 2 * Fx, dz - 2 * Fz];                      // two in from the facade
  const T0 = { x0: tc[0] - 2, z0: tc[1] - 2, x1: tc[0] + 2, z1: tc[1] + 2 };
  const y0 = rec.roofY;
  const tw = theme.wall, spire = LP.churchRoof || LP.spire;
  for (let yy = y0 + 1; yy <= y0 + 8; yy++)
    for (let z = T0.z0; z <= T0.z1; z++) for (let x = T0.x0; x <= T0.x1; x++) {
      const ring = x === T0.x0 || x === T0.x1 || z === T0.z0 || z === T0.z1;
      if (!ring) { world.clear(x, yy, z); continue; }
      const midSide = (x === tc[0] || z === tc[1]) && yy >= y0 + 6 && yy <= y0 + 7;   // belfry arches
      if (midSide) world.clear(x, yy, z); else world.set(x, yy, z, tw);
    }
  for (let z = T0.z0; z <= T0.z1; z++) for (let x = T0.x0; x <= T0.x1; x++) world.set(x, y0 + 9, z, spire);
  world.set(tc[0], y0 + 8, tc[1], MAT.BELL_HANG);
  for (let k = 1; k <= 2; k++) for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) world.set(tc[0] + x, y0 + 9 + k, tc[1] + z, spire);
  for (let k = 3; k <= 6; k++) world.set(tc[0], y0 + 9 + k, tc[1], spire);
  world.set(tc[0], y0 + 16, tc[1], LP.finial);
  rec.topY = y0 + 16;
  rec.rooms = () => 'chapel';
  rec.landmark = 'church';
  return { kind: 'church', rec, lot, pews, tower: T0, spireTop: [tc[0], y0 + 16, tc[1]], bell: null, belfryBell: [tc[0], y0 + 8, tc[1]] };
}

// ---- school ------------------------------------------------------------------
// Classrooms with a lectern at the front, a yard with a flagpole.
function school(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, () => LP.libPave);
  const r = inset(lot, face, 3, 1);
  const floors = Math.min(r.x1 - r.x0, r.z1 - r.z0) >= 13 ? 3 : 2;
  const theme = { name: 'school', wall: LP.schoolWall || MAT.BRICK, trim: LP.schoolTrim || MAT.C_WHITE, floor: LP.libFloor,
    glass: MAT.GLASS, stair: LP.libStair, door: 'oak' };
  const rec = makeBuilding(world, { ...r, floors, pitch: cfg.pitch, groundY: G, style: 'mid', facing: face, theme,
    roofAccess: false, useStairs: cfg.useStairs, stairStyle: 'switchback', lights: cfg.lights, setback: false, setbackEvery: 99 }, rng);
  if (!rec) return null;
  // flagpole in the yard: five fence posts and a wool flag
  const [Fx, Fz] = OUTWARD[face], [Rx, Rz] = right(face);
  const [dx, dz] = rec.doorCells[0];
  let flag = null;
  for (const k of [-4, 4, -5, 5]) {
    const px = dx + 2 * Fx + k * Rx, pz = dz + 2 * Fz + k * Rz;
    if (!inLot(lot, px, pz) || world.has(px, G + 1, pz)) continue;
    for (let yy = G + 1; yy <= G + 6; yy++) world.set(px, yy, pz, MAT.FENCE);
    const wool = rng.pick(WOOLS);
    for (let i = 1; i <= 2; i++) for (let yy = G + 5; yy <= G + 6; yy++) {
      const fx2 = px + i * Rx * Math.sign(k), fz2 = pz + i * Rz * Math.sign(k);
      if (!world.has(fx2, yy, fz2)) world.set(fx2, yy, fz2, wool);
    }
    flag = [px, pz];
    break;
  }
  rec.useOverride = () => 'classrooms';
  rec.landmark = 'school';
  return { kind: 'school', rec, lot, flag };
}

// ---- lighthouse ----------------------------------------------------------------
// A slender tower banded red and white, with a glass lantern room on top.
function lighthouse(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, (x, z) => LP.clockPave[(x + z) & 1]);
  const cx = Math.floor((lot.x0 + lot.x1) / 2), cz = Math.floor((lot.z0 + lot.z1) / 2);
  const r = { x0: cx - 3, z0: cz - 3, x1: cx + 3, z1: cz + 3 };
  const floors = Math.max(6, Math.min(10, cfg.maxFloors | 0 || 10));
  const theme = { name: 'lighthouse', wall: MAT.C_WHITE, trim: MAT.C_RED2, floor: MAT.SMOOTH, glass: MAT.GLASS, stair: 'stonebrick', door: 'spruce' };
  const rec = makeBuilding(world, { ...r, floors, pitch: cfg.pitch, groundY: G, style: 'mid', facing: face, theme,
    roofAccess: false, useStairs: cfg.useStairs, stairStyle: 'spiral', lights: cfg.lights, setback: false, setbackEvery: 99 }, rng);
  if (!rec) return null;
  // bands: every four blocks up, the outer wall turns red (windows and door left alone)
  let red = 0;
  for (let yy = G + 1; yy <= rec.roofY; yy++) {
    if (Math.floor((yy - G - 1) / 4) % 2 !== 1) continue;
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) {
      if (!(x === r.x0 || x === r.x1 || z === r.z0 || z === r.z1)) continue;
      const id = world.get(x, yy, z);
      if (id === MAT.C_WHITE || id === MAT.C_RED2) { world.set(x, yy, z, MAT.C_RED2); red++; }
    }
  }
  // the lantern room: glass all round, a bright light in the middle, a red cap
  const y0 = rec.roofY;
  for (let yy = y0 + 1; yy <= y0 + 3; yy++)
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) {
      const ring = x === r.x0 || x === r.x1 || z === r.z0 || z === r.z1;
      const corner = (x === r.x0 || x === r.x1) && (z === r.z0 || z === r.z1);
      if (corner) world.set(x, yy, z, MAT.C_RED2);
      else if (ring) world.set(x, yy, z, MAT.GLASS);
      else world.clear(x, yy, z);
    }
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) world.set(cx + dx, y0 + 1, cz + dz, MAT.GLOWSTONE);
  world.set(cx, y0 + 2, cz, MAT.LANTERN);
  for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) world.set(x, y0 + 4, z, MAT.C_RED2);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) world.set(cx + dx, y0 + 5, cz + dz, MAT.C_RED2);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) world.set(cx + dx, y0 + 6, cz + dz, MAT.C_RED2);
  world.set(cx, y0 + 7, cz, MAT.LIGHT_ROD);
  rec.topY = y0 + 7;
  rec.rooms = (k) => (k === 0 ? 'hall' : 'office');
  rec.landmark = 'lighthouse';
  return { kind: 'lighthouse', rec, lot, red, lantern: [cx, y0 + 1, cz] };
}

// ---- castle --------------------------------------------------------------------
// A stone keep on the highest hill: crenellated roof, four corner turrets.
function castle(world, lot, face, cfg, rng, G) {
  pave(world, lot, G, (x, z) => ((x + z) & 1 ? MAT.COBBLE : MAT.STONEBRICK));
  const cx = Math.floor((lot.x0 + lot.x1) / 2), cz = Math.floor((lot.z0 + lot.z1) / 2);
  const half = Math.min(7, Math.floor((Math.min(lot.x1 - lot.x0, lot.z1 - lot.z0) - 4) / 2));
  const r = { x0: cx - half, z0: cz - half, x1: cx + half, z1: cz + half };
  const theme = { name: 'castle', wall: MAT.STONEBRICK, trim: MAT.CRACKED_BRICK, floor: MAT.SPRUCE, glass: MAT.GLASS, stair: 'stonebrick', door: 'dark' };
  const rec = makeBuilding(world, { ...r, floors: 4, pitch: cfg.pitch, groundY: G, style: 'mid', facing: face, theme,
    roofAccess: cfg.roofAccess, useStairs: cfg.useStairs, stairStyle: cfg.stairStyle, lights: cfg.lights, setback: false, setbackEvery: 99 }, rng);
  if (!rec) return null;
  const t = rec.rects[rec.floors - 1], y0 = rec.roofY;
  // crenellations: merlons on every other block of the parapet
  let merlons = 0;
  for (let z = t.z0; z <= t.z1; z++) for (let x = t.x0; x <= t.x1; x++) {
    if (!(x === t.x0 || x === t.x1 || z === t.z0 || z === t.z1)) continue;
    world.set(x, y0 + 1, z, MAT.STONEBRICK);
    if ((x + z) % 2 === 0) { world.set(x, y0 + 2, z, MAT.STONEBRICK); merlons++; }
  }
  // corner turrets: 3x3 towers round each corner, a storey above the roof, crenellated
  const turrets = [];
  for (const [kx, kz] of [[t.x0, t.z0], [t.x1, t.z0], [t.x0, t.z1], [t.x1, t.z1]]) {
    const ox = kx === t.x0 ? -1 : 1, oz = kz === t.z0 ? -1 : 1;
    for (let yy = G + 1; yy <= y0 + 4; yy++)
      for (const [dx, dz] of [[0, 0], [ox, 0], [0, oz], [ox, oz]]) world.set(kx + dx, yy, kz + dz, MAT.STONEBRICK);
    for (const [dx, dz] of [[ox, 0], [0, oz], [ox, oz], [0, 0]]) if ((dx + dz) % 2 === 0) world.set(kx + dx, y0 + 5, kz + dz, MAT.STONEBRICK);
    turrets.push([kx, kz]);
  }
  rec.topY = y0 + 5;
  rec.rooms = (k) => (k === 0 ? 'hall' : k === rec.floors - 1 ? 'library' : 'bedroom');
  rec.landmark = 'castle';
  return { kind: 'castle', rec, lot, merlons, turrets };
}

const BUILDERS = { townhall: townHall, clocktower: clockTower, library, market, church, school, lighthouse, castle };
export function buildLandmark(world, lot, face, cfg, rng, G) {
  return BUILDERS[lot.landmark](world, lot, face, cfg, rng, G);
}
