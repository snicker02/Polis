// engine/airport.js — an airport beside the city.
//
// No lot holds a runway, so the airport is an airfield of its own outside the
// city's square, on the side where a street leads straight out to the edge across
// open ground (no lot, farm, canal or water in the way). An access road three wide
// runs from that street out through the city's wall to the terminal; the airfield
// lies at the height the road leaves the city.
//
// Laid out in its own frame: u along the city's edge (the access road arrives at
// u = 0), v out from the city (v = 0 the first row outside it):
//
// - the forecourt before the terminal, lamps along it;
// - the terminal, twenty-five by fourteen: a glass front with the doors, check-in
//   desks, the departures and arrivals boards, rows of seats looking out at the
//   runway, three doors out onto the apron;
// - the control tower beside it, its cab of glass twenty-two up, reached by a
//   ladder inside the shaft, a light on its roof;
// - the apron: three elytra launch pads before the terminal's doors (step on the
//   plate: a command block under it lifts you high and slows your fall, so you
//   can open the elytra; a chest beside each with an elytra and rockets), two
//   parked aircraft, a hangar with a third;
// - the taxiway, two links across the grass, and the runway, nine wide and as long
//   as the airfield: black, its centre line dashed, threshold stripes at both ends,
//   lights along both edges; a windsock beyond it;
// - a fence round it all, open where the road comes in, lamps where the night
//   would be dark.

import { MAT, MATERIALS, I, B, stairId, WEIRDO, chestId, signId, SIGN_FACING, WOOLS } from './materials.js';
import { N } from './blockcore.js';
import { USE } from './plan.js';

const OUT = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
const NAME = (d) => (d[0] > 0 ? 'east' : d[0] < 0 ? 'west' : d[1] > 0 ? 'south' : 'north');
export const AIRFIELD = { L: 120, D: 50 };            // along the edge, out from it
const ALLOWED = new Set([USE.EMPTY, USE.ROAD, USE.SIDEWALK, USE.PARK, USE.PLAZA]);

// The way out: for each side, every street the edge can be reached from in a
// straight line across open ground, three wide; the shortest, nearest the middle.
export function airportRoute(plan, world, GROUND, elevAt) {
  const { W, D, use } = plan;
  const at = (x, z) => use[z * W + x];
  const water = (x, z) => { const y = GROUND + elevAt(x, z); const i = world.get(x, y, z); return i >= 0 && /water/.test(MATERIALS.def(i).block); };
  // something standing on the street a player could not walk through (the wall); a rail is walked over
  const blocked = (x, z) => { const y = GROUND + elevAt(x, z); return [1, 2].some((d) => { const i = world.get(x, y + d, z); return i >= 0 && !/rail/.test(MATERIALS.def(i).block); }); };
  let best = null;
  for (const side of ['north', 'south', 'west', 'east']) {
    const [fx, fz] = OUT[side];
    const along = fx ? D : W;
    for (let t = 6; t < along - 6; t++) {
      // (from the edge in: x, z of the k-th cell in, s across)
      const cellOf = (k, s) => fx ? [fx > 0 ? W - 1 - k : k, t + s] : [t + s, fz > 0 ? D - 1 - k : k];
      // in to the first stretch of street open to walk on: a street the city's wall
      // stands on (where the outline runs along its end) is gone through, the wall
      // cut, to the open street beyond it
      let k = 0, ok = false;
      for (; k < Math.min(W, D) / 3; k++) {
        const row = [-1, 0, 1].map((s) => cellOf(k, s));
        if (row.some(([x, z]) => !ALLOWED.has(at(x, z)) || water(x, z))) break;
        if (at(...row[1]) === USE.ROAD && !blocked(...row[1])) { ok = true; break; }
      }
      if (!ok) continue;
      // (a street on the edge itself, open, as a square city's ring road with its wall
      // beside it: the way out its one row)
      const n = Math.max(1, k);
      const score = k + 0.04 * Math.abs(t - along / 2);
      if (!best || score < best.score) best = { side, t, k, score, street: cellOf(k, 0), cells: [...Array(n).keys()].map((j) => [-1, 0, 1].map((s) => cellOf(n - 1 - j, s))) };
    }
  }
  return best;          // cells: rows from the street outward, each three across
}

export function buildAirport(world, plan, cfg, ctx) {
  const { GROUND, elevAt, signTags } = ctx;
  const route = airportRoute(plan, world, GROUND, elevAt);
  if (!route) return { missing: 'no street leads straight out of the city across open ground for the airport\'s road' };
  const across0 = (i) => (OUT[route.side][0] ? [0, 1] : [1, 0])[i];
  const { W, D } = plan;
  const side = route.side, F = OUT[side], inward = [-F[0], -F[1]];
  const outName = side, inName = NAME(inward);
  const across = F[0] ? [0, 1] : [1, 0];
  const base = side === 'north' ? [route.t, -1] : side === 'south' ? [route.t, D] : side === 'west' ? [-1, route.t] : [W, route.t];
  const at = (u, v) => [base[0] + across[0] * u + F[0] * v, base[1] + across[1] * u + F[1] * v];
  const acrossName = NAME(across), backName = NAME([-across[0], -across[1]]);
  const mat = (block, color, states = {}) => MATERIALS.add(null, 'minecraft:' + block, color, states);
  const YELLOW = mat('yellow_concrete', '#d5b31f'), TARMAC = MAT.C_GRAY, APRON = MAT.C_LGRAY, RUNWAY = MAT.C_BLACK, PAINT = MAT.C_WHITE;
  const LIGHT = MAT.SEA_LANTERN, TURF = MAT.GRASS;
  const PLATE = mat('stone_pressure_plate', '#8a8a8a', { redstone_signal: I(0) });
  const CMD = mat('command_block', '#b07a5a', { conditional_bit: B(0), facing_direction: I(0) });
  const CHAIN = mat('chain_command_block', '#5d8f6a', { conditional_bit: B(0), facing_direction: I(0) });

  // ---- the access road: from the street out through the wall, three wide --------------------
  const road = [];
  let y = null;
  const inCity = (x, z) => !plan.mask || plan.mask[z * W + x] === 1;
  const isRail = (x, yy, z) => { const i = world.get(x, yy, z); return i >= 0 && /rail/.test(MATERIALS.def(i).block); };
  let gateRow = null;
  for (const row of route.cells) {
    const [cx, cz] = row[1];
    if (inCity(cx, cz) || y === null) y = GROUND + elevAt(cx, cz);
    for (const [x, z] of row) {
      if (world.has(x, y + 1, z) && !isRail(x, y + 1, z)) gateRow = row;      // (the wall, cut here)
      for (let yy = y + 1; yy <= y + 16; yy++) if (!isRail(x, yy, z)) world.clear(x, yy, z);   // (a tram's rails kept)
      for (let yy = GROUND - 2; yy < y; yy++) if (!world.has(x, yy, z)) world.set(x, yy, z, MAT.BASE);
      world.set(x, y, z, TARMAC);
      road.push([x, y, z]);
    }
  }
  // the gateway: a quartz post each side where the wall goes on, a lamp on each, and
  // a sign on the street pointing the way
  const gate = [];
  if (gateRow) {
    const [a, b] = [gateRow[0], gateRow[2]];
    for (const [x, z] of [[2 * a[0] - gateRow[1][0], 2 * a[1] - gateRow[1][1]], [2 * b[0] - gateRow[1][0], 2 * b[1] - gateRow[1][1]]]) {
      const gy = GROUND + elevAt(x, z);
      if (!world.has(x, gy + 1, z) || isRail(x, gy + 1, z)) continue;          // (no wall there to stand a post in)
      for (let yy = gy + 1; yy <= gy + 4; yy++) world.set(x, yy, z, MAT.QUARTZ_PILLAR);
      world.set(x, gy + 5, z, MAT.LAMP);
      gate.push([x, gy + 1, z]);
    }
  }
  const [stx, stz] = route.street;
  const signSpots = [2, -2, 3, -3].map((d) => [stx + d * across0(0), stz + d * across0(1)]);
  let streetSign = null;
  for (const [x, z] of signSpots) {
    if (x < 0 || z < 0 || x >= W || z >= D) continue;
    const sy = GROUND + elevAt(x, z);
    if (!world.has(x, sy, z) || world.has(x, sy + 1, z) || world.has(x, sy + 2, z)) continue;
    world.set(x, sy + 1, z, signId(SIGN_FACING[NAME([-OUT[route.side][0], -OUT[route.side][1]])]));
    world.setData(x, sy + 1, z, { id: 'Sign', tags: signTags('Airport\nthis way') });
    streetSign = [x, sy + 1, z];
    break;
  }
  const YA = y;                                            // the airfield's surface
  const put = (u, v, yy, id) => { const [x, z] = at(u, v); world.set(x, yy, z, id); };
  const clear = (u, v, yy) => { const [x, z] = at(u, v); world.clear(x, yy, z); };
  const has = (u, v, yy) => { const [x, z] = at(u, v); return world.has(x, yy, z); };
  const pos = (u, v, yy) => { const [x, z] = at(u, v); return [x, yy, z]; };
  const sign = (u, v, yy, face, text) => { const [x, z] = at(u, v); world.set(x, yy, z, signId(SIGN_FACING[face])); world.setData(x, yy, z, { id: 'Sign', tags: signTags(text) }); };
  const U0 = -AIRFIELD.L / 2, U1 = AIRFIELD.L / 2 - 1, VD = AIRFIELD.D;

  // ---- the ground: turf on a stone bed, the fence round it --------------------------------
  for (let u = U0; u <= U1; u++) for (let v = 0; v < VD; v++) {
    for (let yy = GROUND - 2; yy < YA; yy++) put(u, v, yy, MAT.BASE);
    put(u, v, YA, TURF);
    for (let yy = YA + 1; yy <= YA + 30; yy++) clear(u, v, yy);
  }
  const fence = [];
  for (let u = U0; u <= U1; u++) for (let v = 0; v < VD; v++) {
    const edge = u === U0 || u === U1 || v === 0 || v === VD - 1;
    if (!edge || (v === 0 && Math.abs(u) <= 2)) continue;
    put(u, v, YA + 1, MAT.FENCE); fence.push(pos(u, v, YA + 1));
  }
  // the road on to the forecourt
  for (let v = 0; v <= 2; v++) for (let u = -1; u <= 1; u++) { put(u, v, YA, TARMAC); road.push(pos(u, v, YA)); }

  // ---- the forecourt -----------------------------------------------------------------------
  for (let v = 3; v <= 5; v++) for (let u = -14; u <= 20; u++) put(u, v, YA, MAT.SMOOTH);
  const lamps = [];
  const lampPost = (u, v) => { for (let yy = YA + 1; yy <= YA + 3; yy++) put(u, v, yy, MAT.FENCE); put(u, v, YA + 4, MAT.LAMP); lamps.push(pos(u, v, YA + 4)); };
  for (const u of [-13, -6, 6, 13]) lampPost(u, 3);

  // ---- the terminal ------------------------------------------------------------------------
  const T = { u0: -12, u1: 12, v0: 6, v1: 19, top: YA + 7 };
  for (let u = T.u0; u <= T.u1; u++) for (let v = T.v0; v <= T.v1; v++) {
    put(u, v, YA, MAT.SMOOTH_QUARTZ);
    const sky = u >= -8 && u <= 8 && v >= 10 && v <= 15;
    put(u, v, T.top, sky ? MAT.GLASS : MAT.C_LGRAY);
    const wall = u === T.u0 || u === T.u1 || v === T.v0 || v === T.v1;
    if (!wall) continue;
    for (let yy = YA + 1; yy < T.top; yy++) {
      const glassy = (v === T.v0 || v === T.v1) && u !== T.u0 && u !== T.u1;
      put(u, v, yy, yy === T.top - 1 ? MAT.C_LBLUE : glassy ? MAT.GLASS : (yy === YA + 3 || yy === YA + 4) && (u - T.u0) % 3 === 0 ? MAT.GLASS : MAT.C_WHITE);
    }
  }
  // the doors: in from the forecourt, out to each launch pad
  const doors = [];
  for (let u = -1; u <= 1; u++) for (let yy = YA + 1; yy <= YA + 3; yy++) clear(u, T.v0, yy);
  doors.push(pos(0, T.v0, YA + 1));
  const PADS = [-8, 0, 8];
  for (const pu of PADS) { for (let u = pu - 1; u <= pu + 1; u++) for (let yy = YA + 1; yy <= YA + 2; yy++) clear(u, T.v1, yy); doors.push(pos(pu, T.v1, YA + 1)); }
  // check-in desks, the boards, seats looking out at the runway, lanterns
  const desks = [];
  for (const [a, b] of [[-10, -4], [4, 10]]) for (let u = a; u <= b; u++) { put(u, 10, YA + 1, MAT.SMOOTH_QUARTZ); desks.push(pos(u, 10, YA + 1)); }
  sign(-7, 9, YA + 1, inName, 'Check-in');
  sign(7, 9, YA + 1, inName, 'Check-in');
  sign(-5, 7, YA + 1, inName, 'Departures\nNether  10:00\nThe End  12:30\nSkylands 15:45');
  sign(5, 7, YA + 1, inName, 'Arrivals\nOverworld 11:15\nDeep Dark 13:40\nOcean   16:05');
  const seats = [];
  for (const v of [13, 15]) for (let u = -10; u <= 10; u++) {
    if (Math.abs(u) <= 2 || Math.abs(Math.abs(u) - 8) <= 1) continue;          // the ways through to the doors
    put(u, v, YA + 1, stairId('oak', WEIRDO[inName])); seats.push(pos(u, v, YA + 1));
  }
  for (const u of [-9, -3, 3, 9]) for (const v of [8, 12, 17]) { put(u, v, T.top - 1, MAT.LAMP_HANG); lamps.push(pos(u, v, T.top - 1)); }
  sign(-3, T.v0 - 1, YA + 1, inName, 'Airport');

  // ---- the control tower -------------------------------------------------------------------
  const TW = { u0: 15, u1: 19, v0: 7, v1: 11, cab: YA + 21 };
  for (let u = TW.u0; u <= TW.u1; u++) for (let v = TW.v0; v <= TW.v1; v++) {
    put(u, v, YA, MAT.SMOOTH);
    const wall = u === TW.u0 || u === TW.u1 || v === TW.v0 || v === TW.v1;
    if (wall) for (let yy = YA + 1; yy < TW.cab; yy++) put(u, v, yy, (yy - YA) % 5 === 0 ? MAT.C_LBLUE : MAT.C_WHITE);
  }
  const tu = 17;
  for (let yy = YA + 1; yy <= YA + 2; yy++) clear(tu, TW.v0, yy);                       // its door, on the forecourt
  const ladder = [];
  const LADDER = { north: MAT.LADDER_2, south: MAT.LADDER_3, west: MAT.LADDER_4, east: MAT.LADDER_5 };
  for (let yy = YA + 1; yy <= TW.cab + 1; yy++) { put(tu, TW.v1 - 1, yy, LADDER[inName]); ladder.push(pos(tu, TW.v1 - 1, yy)); }
  // the cab: a floor seven by seven (a hole where the ladder comes up), glass all round, a roof, a light on it
  for (let u = TW.u0 - 1; u <= TW.u1 + 1; u++) for (let v = TW.v0 - 1; v <= TW.v1 + 1; v++) {
    if (!(u === tu && v === TW.v1 - 1)) put(u, v, TW.cab, MAT.SMOOTH_QUARTZ);
    const ring = u === TW.u0 - 1 || u === TW.u1 + 1 || v === TW.v0 - 1 || v === TW.v1 + 1;
    for (let yy = TW.cab + 1; yy <= TW.cab + 3; yy++) if (ring) put(u, v, yy, MAT.GLASS); else if (!(u === tu && v === TW.v1 - 1 && yy === TW.cab + 1)) clear(u, v, yy);
    put(u, v, TW.cab + 4, MAT.C_GRAY);
  }
  put(tu, TW.v0 + 2, TW.cab + 5, LIGHT);
  const consoles = [];
  for (const [u, v] of [[TW.u0, TW.v0], [TW.u0 + 1, TW.v0], [TW.u1, TW.v0], [TW.u1 - 1, TW.v0], [TW.u0, TW.v0 + 1], [TW.u1, TW.v0 + 1]]) { put(u, v, TW.cab + 1, MAT.DESK); consoles.push(pos(u, v, TW.cab + 1)); }
  put(tu, TW.v0 + 2, TW.cab + 3, MAT.LAMP_HANG); lamps.push(pos(tu, TW.v0 + 2, TW.cab + 3));
  sign(TW.u0, TW.v0 + 2, TW.cab + 1, outName, 'Control tower');

  // ---- the apron, the launch pads ----------------------------------------------------------
  const AP = { v0: 20, v1: 31 };
  for (let u = U0 + 2; u <= U1 - 2; u++) for (let v = AP.v0; v <= AP.v1; v++) put(u, v, YA, APRON);
  const pads = [];
  for (const pu of PADS) {
    const pv = 22;
    for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) put(pu + du, pv + dv, YA, (du + dv) % 2 === 0 ? YELLOW : MAT.C_BLACK);
    // the plate on a command block (an impulse block: on the plate's press it lifts the
    // player on it high), a chain block under it (slow falling, so a fall is never fatal)
    put(pu, pv, YA, CMD); put(pu, pv, YA - 1, CHAIN);
    const [cx, cz] = at(pu, pv);
    world.setData(cx, YA, cz, commandBlock('effect @p[r=2] levitation 3 20 true', false));
    world.setData(cx, YA - 1, cz, commandBlock('effect @p[r=3] slow_falling 30 0 true', true));
    put(pu, pv, YA + 1, PLATE);
    // a chest beside it: an elytra, rockets
    put(pu + 2, AP.v0, YA + 1, chestId(outName));
    const [hx, hz] = at(pu + 2, AP.v0);
    world.setData(hx, YA + 1, hz, { id: 'Chest', tags: { Items: N.list(10, [
      N.comp({ Count: N.byte(1), Damage: N.short(0), Name: N.str('minecraft:elytra'), Slot: N.byte(0), WasPickedUp: N.byte(0) }),
      N.comp({ Count: N.byte(1), Damage: N.short(0), Name: N.str('minecraft:elytra'), Slot: N.byte(1), WasPickedUp: N.byte(0) }),
      N.comp({ Count: N.byte(64), Damage: N.short(0), Name: N.str('minecraft:firework_rocket'), Slot: N.byte(2), WasPickedUp: N.byte(0) }),
    ]) } });
    sign(pu - 2, AP.v0, YA + 1, inName, 'Launch pad\nElytra in the chest\nPut it on, then\nstep on the plate');
    pads.push({ plate: pos(pu, pv, YA + 1), command: pos(pu, pv, YA), chain: pos(pu, pv, YA - 1), chest: pos(pu + 2, AP.v0, YA + 1) });
  }

  // ---- the aircraft ------------------------------------------------------------------------
  // a fuselage along v (its tail at v0, its nose toward the runway), the wings across
  // it, engines under them, a tail fin, wheels; the livery on the fin and wingtips
  const planes = [];
  const plane = (u0, v0, livery) => {
    const blocks = [];
    const P = (du, dv, dy, id) => { put(u0 + du, v0 + dv, YA + dy, id); blocks.push(pos(u0 + du, v0 + dv, YA + dy)); };
    for (let dv = 1; dv <= 9; dv++) { P(0, dv, 2, MAT.C_WHITE); if (dv >= 2 && dv <= 8) P(0, dv, 3, dv === 8 ? MAT.GLASS : MAT.C_WHITE); }
    P(0, 10, 2, MAT.C_LGRAY);                                         // the nose
    for (let du = -5; du <= 5; du++) if (du) P(du, 5, 2, Math.abs(du) === 5 ? livery : MAT.C_WHITE);   // the wings
    for (const du of [-3, 3]) P(du, 6, 1, MAT.C_GRAY);                // the engines
    P(0, 0, 2, MAT.C_WHITE);
    for (let dy = 3; dy <= 5; dy++) P(0, 0, dy, livery);              // the tail fin
    for (let du = -2; du <= 2; du++) if (du) P(du, 0, 3, MAT.C_WHITE); // the tailplane
    for (const [du, dv] of [[0, 8], [-2, 4], [2, 4]]) P(du, dv, 1, MAT.FENCE);   // the wheels
    planes.push({ u: u0, v: v0, livery, blocks });
  };
  const red = mat('red_concrete', '#8e2121'), blue = mat('blue_concrete', '#2c2e8f');
  plane(-26, 20, red);
  plane(28, 20, blue);

  // ---- the hangar, a third aircraft in it --------------------------------------------------
  const HG = { u0: -54, u1: -40, v0: 18, v1: 31, top: YA + 9 };
  for (let u = HG.u0; u <= HG.u1; u++) for (let v = HG.v0; v <= HG.v1; v++) {
    put(u, v, YA, APRON);
    for (let yy = YA + 1; yy <= HG.top; yy++) clear(u, v, yy);
    const inset = Math.min(u - HG.u0, HG.u1 - u);
    const roofY = HG.top - Math.max(0, 2 - inset);                 // the roof rounded at its sides
    put(u, v, roofY, MAT.IRON);
    const wall = u === HG.u0 || u === HG.u1 || v === HG.v0;
    if (wall) for (let yy = YA + 1; yy < roofY; yy++) put(u, v, yy, MAT.C_LGRAY);
  }
  plane(-47, 19, mat('lime_concrete', '#5e9718'));
  const hangar = { door: pos(-47, HG.v1, YA + 1) };
  for (const u of [HG.u0 + 2, HG.u1 - 2]) { put(u, HG.v0 + 3, HG.top - 3, MAT.LAMP_HANG); lamps.push(pos(u, HG.v0 + 3, HG.top - 3)); }

  // ---- the taxiway, its links, the runway --------------------------------------------------
  const TX = { v0: 32, v1: 34 }, RW = { v0: 37, v1: 45 };
  for (let u = U0 + 2; u <= U1 - 2; u++) for (let v = TX.v0; v <= TX.v1; v++) put(u, v, YA, v === 33 && ((u % 4) + 4) % 4 < 2 ? YELLOW : TARMAC);
  for (const lu of [-40, 40]) for (let u = lu - 1; u <= lu + 1; u++) for (let v = TX.v1 + 1; v < RW.v0; v++) put(u, v, YA, TARMAC);
  const runway = { u0: U0 + 2, u1: U1 - 2, v0: RW.v0, v1: RW.v1 };
  const lights = [];
  for (let u = runway.u0; u <= runway.u1; u++) for (let v = RW.v0; v <= RW.v1; v++) {
    let id = RUNWAY;
    const fromEnd = Math.min(u - runway.u0, runway.u1 - u);
    if (v === 41 && fromEnd > 6 && (u - runway.u0) % 6 < 3) id = PAINT;                    // the centre line
    if (fromEnd >= 1 && fromEnd <= 4 && v !== 41 && v !== RW.v0 && v !== RW.v1 && v % 2 === 0) id = PAINT;   // threshold stripes
    put(u, v, YA, id);
  }
  for (let u = runway.u0; u <= runway.u1; u += 5) for (const v of [RW.v0 - 1, RW.v1 + 1]) { put(u, v, YA, LIGHT); lights.push(pos(u, v, YA)); }
  for (const u of [runway.u0 - 1, runway.u1 + 1]) for (let v = RW.v0; v <= RW.v1; v += 2) { put(u, v, YA, LIGHT); lights.push(pos(u, v, YA)); }
  // the windsock
  const sock = pos(0, 48, YA + 5);
  for (let yy = YA + 1; yy <= YA + 4; yy++) put(0, 48, yy, MAT.FENCE);
  const ORANGE = WOOLS[5], WHITE = WOOLS[3];
  put(0, 48, YA + 5, ORANGE); put(1, 48, YA + 5, WHITE); put(2, 48, YA + 5, ORANGE);

  // ---- no dark corners: a lamp wherever the airfield's ground is out of reach of a light ----
  const lit = [...lamps, ...lights];
  const near = (x, yy, z) => lit.some(([a, b, c]) => Math.abs(a - x) + Math.abs(b - yy) + Math.abs(c - z) <= 11);
  for (let v = 1; v < VD - 1; v++) for (let u = U0 + 1; u < U1; u++) {
    const [x, z] = at(u, v);
    if (world.get(x, YA, z) !== TURF && world.get(x, YA, z) !== APRON) continue;
    if (near(x, YA + 1, z)) continue;
    // (on the apron a light set flush in it, which nothing taxis or parks into; on the
    // grass a lamp on a post)
    if (world.get(x, YA, z) === APRON) { world.set(x, YA, z, LIGHT); lights.push([x, YA, z]); lit.push([x, YA, z]); continue; }
    if ([0, 1, 2, 3, 4].some((d) => world.has(x, YA + 1 + d, z))) continue;
    lampPost(u, v); lit.push(lamps[lamps.length - 1]);
  }

  // the airfield's ground (with its road out of the city) is the city's own for the
  // export: founded and cleared like it (export.js: cityInside)
  const c0 = at(U0, 0), c1 = at(U1, VD - 1);
  const rect = { x0: Math.min(c0[0], c1[0]), x1: Math.max(c0[0], c1[0]), z0: Math.min(c0[1], c1[1]), z1: Math.max(c0[1], c1[1]) };
  const rx = road.map((p) => p[0]), rz = road.map((p) => p[2]);
  const roadRect = { x0: Math.min(...rx), x1: Math.max(...rx), z0: Math.min(...rz), z1: Math.max(...rz) };
  const [vx, vz] = at(0, 4), [lx, lz] = at(0, T.v0);
  return {
    kind: 'airport', lot: rect, roadRect, side, street: [route.street[0], GROUND + elevAt(...route.street), route.street[1]], gate, streetSign, ground: YA, noLighting: true, rec: null,
    road, runway: { ...runway, length: runway.u1 - runway.u0 + 1, width: RW.v1 - RW.v0 + 1, cells: (u, v) => pos(u, v, YA) }, lights,
    terminal: { ...T, doors, desks, seats }, tower: { ...TW, ladder, consoles, top: TW.cab + 5, door: pos(tu, TW.v0, YA + 1) },
    pads, planes, hangar, fence, lamps, sock,
    visit: [vx, YA + 1, vz], visitLook: [lx, YA + 2, lz],
    frame: { at, pos, U0, U1, VD, YA, F, across, T, TW, AP, TX, RW, HG },
    acrossName, backName,
  };
}

// a command block's own data, as the game saves one: an impulse block run by redstone
// (the airport's plates), a chain block after one, always active, or a repeating block
// always active, every delay ticks (the stadium's)
export function commandBlock(command, chainOrOpts) {
  const o = typeof chainOrOpts === 'object' ? chainOrOpts : { mode: chainOrOpts ? 'chain' : 'impulse' };
  const mode = o.mode || 'impulse', auto = mode !== 'impulse';
  return { id: 'CommandBlock', tags: {
    Command: N.str(command), CustomName: N.str(''), ExecuteOnFirstTick: N.byte(mode === 'repeat' ? 1 : 0), LPCommandMode: N.int(mode === 'chain' ? 2 : mode === 'repeat' ? 1 : 0),
    LPCondionalMode: N.byte(0), LPRedstoneMode: N.byte(auto ? 1 : 0), LastExecution: N.long(0n), LastOutput: N.str(''),
    LastOutputParams: N.list(8, []), SuccessCount: N.int(0), TickDelay: N.int(o.delay | 0), TrackOutput: N.byte(0), Version: N.int(36),
    auto: N.byte(auto ? 1 : 0), conditionMet: N.byte(0), conditionalMode: N.byte(0), powered: N.byte(0) } };
}
