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
import { MAT, WOOLS, pumpkinId, smokerId, stairId, WEIRDO, STAINED, gateId, signId, SIGN_FACING } from './materials.js';
import { N } from './blockcore.js';
import { USE, frontage } from './plan.js';
import { FLOWERS as FLOWERS_M } from './materials.js';
import { styleOf } from './styles.js';

export const LANDMARKS = ['townhall', 'clocktower', 'library', 'market', 'church', 'mansion', 'school', 'lighthouse', 'castle'];
const NEED = {                       // [shorter side, longer side] of the lot
  townhall: [13, 15], clocktower: [9, 9], library: [11, 12], market: [12, 12],
  church: [13, 15], mansion: [15, 20], school: [16, 22], lighthouse: [9, 9], castle: [13, 13],
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
  // the school wants a big lot (building, porch, yard and a sports field);
  // if the city has none, it makes do with a smaller one
  // the mansion takes the biggest lot it can find out of the middle of town
  const byArea = all.slice().filter((c) => c.d > maxD * 0.25).sort((p, q) => (q.a * q.b) - (p.a * p.b));
  take('mansion', byArea);
  // prefer a lot that runs deep back from its street: room for a sports field behind
  const depthOf = (c) => { const side = frontage(plan, c.l).side; return side === 'north' || side === 'south' ? c.l.z1 - c.l.z0 + 1 : c.l.x1 - c.l.x0 + 1; };
  const halfway = all.slice().sort((p, q) => {
    const fp = depthOf(p) >= SCHOOL_FIELD_DEPTH ? 0 : 1, fq = depthOf(q) >= SCHOOL_FIELD_DEPTH ? 0 : 1;
    return fp - fq || Math.abs(p.d - maxD * 0.5) - Math.abs(q.d - maxD * 0.5);
  });
  take('school', halfway);
  if (!out.some((l) => l.landmark === 'school')) { const keep = NEED.school; NEED.school = [13, 14]; take('school', halfway); NEED.school = keep; }
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
// Set back behind a front yard: a covered porch over the entrance, a bell
// cupola, a flagpole, and (on a big enough lot) a fenced sports field behind.
// Inside, classrooms with rows of desks facing the lectern (life.js).
// lot depth (back from the street) that fits yard, building, path and field
export const SCHOOL_FIELD_DEPTH = 5 + 9 + 1 + 8;

function school(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, () => LP.libPave);
  const alongFace = face === 'north' || face === 'south';
  const lotDepth = alongFace ? lot.z1 - lot.z0 + 1 : lot.x1 - lot.x0 + 1;
  const lotWidth = alongFace ? lot.x1 - lot.x0 + 1 : lot.z1 - lot.z0 + 1;
  // (d, a): d inward from the street edge, a across, left to right as seen from the street
  const at = (d, a) => {
    if (face === 'south') return [lot.x0 + a, lot.z1 - d];
    if (face === 'north') return [lot.x1 - a, lot.z0 + d];
    if (face === 'east') return [lot.x1 - d, lot.z1 - a];
    return [lot.x0 + d, lot.z0 + a];
  };
  const rectOf = (d0, d1, a0, a1) => {
    const [x0, z0] = at(d0, a0), [x1, z1] = at(d1, a1);
    return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
  };
  const front = 5;                                   // yard, flagpole and porch in front
  const avail = lotDepth - front;
  // a field (at least 8 deep) behind a building at least 9 deep, with a path between
  let bDepth, fieldDepth = 0;
  if (avail >= 9 + 1 + 8) {
    bDepth = Math.max(9, Math.min(12, avail - 1 - 8));
    fieldDepth = Math.min(14, avail - bDepth - 1);
  } else bDepth = Math.min(avail - 1, 14);
  if (bDepth < 7 || lotWidth < 9) return null;
  const r = rectOf(front, front + bDepth - 1, 1, lotWidth - 2);
  const wide = lotWidth - 2;
  const floors = 3;                                  // a big, easy-to-find building that carries its sign in proportion
  const theme = { name: 'school', wall: LP.schoolWall || MAT.BRICK, trim: LP.schoolTrim || MAT.C_WHITE, floor: LP.libFloor,
    glass: MAT.GLASS, stair: LP.libStair, door: 'oak' };
  const rec = makeBuilding(world, { ...r, floors, pitch: cfg.pitch, groundY: G, style: 'mid', facing: face, theme,
    roofAccess: false, useStairs: cfg.useStairs, stairStyle: 'switchback', lights: cfg.lights, setback: false, setbackEvery: 99 }, rng);
  if (!rec) return null;
  const [dx, dz] = rec.doorCells[0];
  // the door's a (across) position
  let doorA = 0;
  for (let a = 0; a < lotWidth; a++) { const [x, z] = at(front, a); if (x === dx && z === dz) doorA = a; }

  // covered porch: two columns at the front corners, a roof, a lantern under it
  const porch = [];
  for (let d = front - 3; d <= front - 1; d++)
    for (let a = doorA - 2; a <= doorA + 2; a++) { const [x, z] = at(d, a); world.set(x, G + 4, z, theme.trim); porch.push([x, z]); }
  for (const a of [doorA - 2, doorA + 2]) {
    const [x, z] = at(front - 3, a);
    for (let y = G + 1; y <= G + 3; y++) world.set(x, y, z, LP.hallColumn || MAT.QUARTZ_PILLAR);
  }
  { const [x, z] = at(front - 2, doorA); world.set(x, G + 3, z, MAT.LAMP_HANG); }

  // bell cupola towards the back of the roof
  const y0 = rec.roofY;
  const cd = front + bDepth - 3, ca = 1 + Math.floor(wide / 2);
  for (const [od, oa] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const [x, z] = at(cd + od, ca + oa);
    for (let y = y0 + 1; y <= y0 + 3; y++) world.set(x, y, z, theme.trim);
  }
  for (let od = -1; od <= 1; od++) for (let oa = -1; oa <= 1; oa++) { const [x, z] = at(cd + od, ca + oa); world.set(x, y0 + 4, z, LP.dome); }
  const [bx, bz] = at(cd, ca);
  world.set(bx, y0 + 3, bz, MAT.BELL_HANG);
  world.set(bx, y0 + 5, bz, LP.finial);
  const cupolaBell = [bx, y0 + 3, bz];

  // flagpole in the front yard, clear of the porch
  let flag = null;
  for (const k of [-5, 5, -6, 6]) {
    const a = doorA + k;
    if (a < 1 || a > lotWidth - 2) continue;
    const [px, pz] = at(1, a);
    if (world.has(px, G + 1, pz)) continue;
    for (let y = G + 1; y <= G + 6; y++) world.set(px, y, pz, MAT.FENCE);
    const wool = rng.pick(WOOLS);
    for (let i = 1; i <= 2; i++) for (let y = G + 5; y <= G + 6; y++) {
      const [fx2, fz2] = at(1, a + i * Math.sign(k));
      if (!world.has(fx2, y, fz2)) world.set(fx2, y, fz2, wool);
    }
    flag = [px, pz];
    break;
  }

  // sports field behind: fenced, a gate facing the school, white lines, two goals
  let field = null;
  if (fieldDepth) {
    const d0 = front + bDepth + 1, d1 = d0 + fieldDepth - 1, fa0 = 1, fa1 = lotWidth - 2;
    const midA = Math.floor((fa0 + fa1) / 2), midD = Math.floor((d0 + d1) / 2);
    for (let d = d0; d <= d1; d++)
      for (let a = fa0; a <= fa1; a++) {
        const [x, z] = at(d, a);
        const edge = d === d0 || d === d1 || a === fa0 || a === fa1;
        const line = !edge && (d === d0 + 1 || d === d1 - 1 || a === fa0 + 1 || a === fa1 - 1 || a === midA);
        world.set(x, G, z, line ? MAT.CALCITE : MAT.GRASS);
        if (edge) world.set(x, G + 1, z, d === d0 && a === midA ? gateId(OPPOSITE_FACE[face]) : MAT.FENCE);
      }
    for (const a of [fa0 + 2, fa1 - 2]) {                 // goals: two posts and a crossbar
      for (const od of [-1, 1]) { const [x, z] = at(midD + od, a); world.set(x, G + 1, z, MAT.FENCE); world.set(x, G + 2, z, MAT.FENCE); }
      const [x, z] = at(midD, a); world.set(x, G + 2, z, MAT.FENCE);
    }
    const [gx, gz] = at(d0, midA);
    field = { rect: rectOf(d0, d1, fa0, fa1), gate: [gx, gz], goals: [fa0 + 2, fa1 - 2].map((a) => at(midD, a)) };
  }
  rec.topY = Math.max(rec.topY, y0 + 5);             // the cupola stands above the roof
  rec.useOverride = () => 'classrooms';
  rec.landmark = 'school';
  return { kind: 'school', rec, lot, flag, porch, cupolaBell, field };
}
const OPPOSITE_FACE = { north: 'south', south: 'north', east: 'west', west: 'east' };

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

// ---- mansion -------------------------------------------------------------------
// An estate: a main house with a portico and two flanking wings, a hedge round
// the grounds with gate piers, a driveway up to the door, and a formal garden
// behind with paths, a fountain, flower beds and benches.
function mansion(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  const alongFace = face === 'north' || face === 'south';
  const lotDepth = alongFace ? lot.z1 - lot.z0 + 1 : lot.x1 - lot.x0 + 1;
  const lotWidth = alongFace ? lot.x1 - lot.x0 + 1 : lot.z1 - lot.z0 + 1;
  const at = (d, a) => {
    if (face === 'south') return [lot.x0 + a, lot.z1 - d];
    if (face === 'north') return [lot.x1 - a, lot.z0 + d];
    if (face === 'east') return [lot.x1 - d, lot.z1 - a];
    return [lot.x0 + d, lot.z0 + a];
  };
  const rectOf = (d0, d1, a0, a1) => {
    const [x0, z0] = at(d0, a0), [x1, z1] = at(d1, a1);
    return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
  };
  const front = 6;                                     // lawn, driveway and portico
  const avail = lotDepth - front - 1;
  const rear = avail >= 16 ? Math.min(12, avail - 10) : 0;     // formal garden behind, if there is room
  const mainD = Math.min(11, avail - rear);
  // wings flank the house where the frontage allows; otherwise the house takes it all
  let wingW = lotWidth >= 28 ? 6 : lotWidth >= 24 ? 5 : 0;
  let mainW = wingW ? lotWidth - 2 - 2 * (wingW + 1) : lotWidth - 2;
  if (mainW < 9 && wingW) { wingW = 0; mainW = lotWidth - 2; }
  if (mainW < 9 || mainD < 8) return null;
  pave(world, lot, G, () => MAT.GRASS);
  const mainA0 = wingW ? 1 + wingW + 1 : 1;
  const main = rectOf(front, front + mainD - 1, mainA0, mainA0 + mainW - 1);
  const theme = { name: 'mansion', wall: LP.mansionWall || MAT.C_WHITE, trim: LP.hallColumn || MAT.QUARTZ_PILLAR,
    floor: LP.libFloor, glass: MAT.PANE, stair: LP.hallStair, door: LP.hallDoor };
  const rec = makeBuilding(world, { ...main, floors: 3, pitch: cfg.pitch, groundY: G, style: 'house', facing: face, theme,
    roofAccess: false, useStairs: cfg.useStairs, stairStyle: 'switchback', lights: cfg.lights, setback: false, setbackEvery: 99 }, rng);
  if (!rec) return null;
  // two wings, set back a little, each with its own door to the grounds
  const wings = [];
  for (const a0 of wingW ? [1, lotWidth - 1 - wingW] : []) {
    const wr = rectOf(front + 2, front + mainD - 2, a0, a0 + wingW - 1);
    const w2 = makeBuilding(world, { ...wr, floors: 2, pitch: cfg.pitch, groundY: G, style: 'house', facing: face, theme,
      roofAccess: false, useStairs: cfg.useStairs, stairStyle: 'spiral', lights: cfg.lights, setback: false, setbackEvery: 99 }, rng);
    if (w2) { w2.landmark = 'mansion'; wings.push(w2); }
  }
  // portico: columns two deep in front of the door, with a roof over them
  const [dx, dz] = rec.doorCells[0];
  let doorA = 0;
  for (let a = 0; a < lotWidth; a++) { const [x, z] = at(front, a); if (x === dx && z === dz) doorA = a; }
  const portico = [];
  for (let d = front - 2; d <= front - 1; d++)
    for (let a = doorA - 2; a <= doorA + 2; a++) {
      const [x, z] = at(d, a);
      world.set(x, G + 4, z, theme.trim);
      portico.push([x, z]);
    }
  for (const a of [doorA - 2, doorA + 2])
    for (const d of [front - 2, front - 1]) {
      const [x, z] = at(d, a);
      for (let y = G + 1; y <= G + 3; y++) world.set(x, y, z, theme.trim);
    }
  { const [x, z] = at(front - 1, doorA); world.set(x, G + 3, z, MAT.LAMP_HANG); }

  // driveway from the street to the portico, and a hedge round the grounds
  for (let d = 0; d < front - 2; d++)
    for (const a of [doorA - 1, doorA, doorA + 1]) { const [x, z] = at(d, a); world.set(x, G, z, MAT.ANDESITE); }
  const gateA = [doorA - 1, doorA, doorA + 1];
  for (let a = 0; a < lotWidth; a++) {
    const [x, z] = at(0, a);
    if (gateA.includes(a)) continue;
    world.set(x, G + 1, z, MAT.LEAVES); world.set(x, G + 2, z, MAT.LEAVES);
  }
  for (const a of [doorA - 2, doorA + 2]) {                     // gate piers with lanterns
    const [x, z] = at(0, a);
    for (let y = G + 1; y <= G + 3; y++) world.set(x, y, z, theme.trim);
    world.set(x, G + 4, z, MAT.LAMP);
  }
  // formal garden behind: crossing paths, a fountain, flower beds, benches
  let garden = null;
  if (rear >= 7) {
    const d0 = front + mainD, d1 = Math.min(lotDepth - 1, d0 + rear - 1);
    const cd = Math.floor((d0 + d1) / 2), ca = Math.floor(lotWidth / 2);
    for (let d = d0; d <= d1; d++)
      for (let a = 1; a < lotWidth - 1; a++) {
        const [x, z] = at(d, a);
        const path = d === cd || a === ca;
        world.set(x, G, z, path ? MAT.PATH : MAT.GRASS);
        for (let y = G + 1; y <= G + 3; y++) world.clear(x, y, z);
      }
    // fountain at the crossing
    for (let dd = -1; dd <= 1; dd++)
      for (let da = -1; da <= 1; da++) {
        const [x, z] = at(cd + dd, ca + da);
        if (dd === 0 && da === 0) { world.set(x, G, z, MAT.WATER); continue; }
        world.set(x, G, z, MAT.STONEBRICK);
        world.set(x, G + 1, z, MAT.STONEBRICK);
      }
    { const [x, z] = at(cd, ca); world.set(x, G + 1, z, MAT.WATER); }
    // benches facing the fountain, flower beds in the quarters
    for (const [dd, da, dir] of [[-3, 0, WEIRDO.south], [3, 0, WEIRDO.north]]) {
      for (const off of [-1, 0, 1]) {
        const [x, z] = at(cd + dd, ca + da + off);
        if (!world.has(x, G + 1, z)) world.set(x, G + 1, z, stairId(theme.stair, dir));
      }
    }
    for (let d = d0 + 1; d <= d1 - 1; d++)
      for (let a = 2; a < lotWidth - 2; a++) {
        if (d === cd || a === ca || Math.abs(d - cd) <= 2 && Math.abs(a - ca) <= 2) continue;
        const [x, z] = at(d, a);
        if ((d + a) % 3 === 0 && !world.has(x, G + 1, z)) world.set(x, G + 1, z, rng.pick(FLOWERS_M));
      }
    garden = { rect: rectOf(d0, d1, 1, lotWidth - 2), fountain: at(cd, ca) };
  }
  rec.landmark = 'mansion';
  return { kind: 'mansion', rec, wings, lot, portico, garden, gate: at(0, doorA) };
}

const BUILDERS = { townhall: townHall, clocktower: clockTower, library, market, church, mansion, school, lighthouse, castle };
export const LANDMARK_NAMES = { townhall: 'Town Hall', clocktower: 'Clock Tower', library: 'Library', market: 'Market',
  church: 'Church', school: 'School', lighthouse: 'Lighthouse', castle: 'Castle', mansion: 'Mansion' };

export function buildLandmark(world, lot, face, cfg, rng, G) {
  const L = BUILDERS[lot.landmark](world, lot, face, cfg, rng, G);
  if (L) L.nameSign = nameSign(world, L, face, G);
  return L;
}

// A small standing sign with the landmark's name, beside the path to its
// front door (never on it), facing the street. The sign's block entity is laid
// out exactly as Bedrock saves one (from a structure saved in game).
export function signTags(text) {
  const side = (t) => N.comp({
    FilteredText: N.str(''), HideGlowOutline: N.byte(0), IgnoreLighting: N.byte(0), PersistFormatting: N.byte(1),
    SignTextColor: N.int(-16777216), Text: N.str(t), TextOwner: N.str(''),
  });
  return { BackText: side(''), BlockEntityVersion: N.int(0), FrontText: side(text), IsWaxed: N.byte(0) };
}
function nameSign(world, L, face, G) {
  const text = LANDMARK_NAMES[L.kind];
  const [Fx, Fz] = OUTWARD[face], [Rx, Rz] = right(face);
  const lot = L.lot;
  // where to stand it: out from the front door, two or three blocks to one side
  let base, offsets;
  if (L.rec && L.rec.doorCells) {
    const [dx, dz] = L.rec.doorCells[0];
    base = [dx, dz];
    offsets = [];
    for (const out of [1, 2, 3]) for (const k of [2, -2, 3, -3, 4, -4]) offsets.push([out, k]);
  } else {
    // the market: on its street edge, near the middle
    const mx = Math.floor((lot.x0 + lot.x1) / 2), mz = Math.floor((lot.z0 + lot.z1) / 2);
    base = face === 'south' ? [mx, lot.z1] : face === 'north' ? [mx, lot.z0] : face === 'east' ? [lot.x1, mz] : [lot.x0, mz];
    offsets = [];
    for (let k = 0; k <= 6; k++) for (const s of k ? [k, -k] : [0]) offsets.push([0, s]);
  }
  const doorAt = new Set((L.rec && L.rec.doorCells ? L.rec.doorCells : []).map(([a, b]) => a + ',' + b));
  for (const [out, k] of offsets) {
    const x = base[0] + out * Fx + k * Rx, z = base[1] + out * Fz + k * Rz;
    if (x < lot.x0 || x > lot.x1 || z < lot.z0 || z > lot.z1) continue;
    if (doorAt.has((x - Fx) + ',' + (z - Fz))) continue;          // never right in front of a door
    if (!world.has(x, G, z) || world.has(x, G + 1, z) || world.has(x, G + 2, z)) continue;
    world.set(x, G + 1, z, signId(SIGN_FACING[face]));
    world.setData(x, G + 1, z, { id: 'Sign', tags: signTags(text) });
    return [x, G + 1, z];
  }
  return null;
}
