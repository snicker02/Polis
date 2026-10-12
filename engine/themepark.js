// engine/themepark.js — a theme park beside the city, at the end of a road of its own.
//
// Like the airport (offsite.js), ground of the city's own outside its square: a park
// a hundred and ten along the city's edge by eighty out from it, on the side away from
// the airport where there is one, at the height its road leaves the city. In its own
// frame: u along the edge (the road arrives at u = 0), v out from the city.
//
// - the entrance: an arch over the gate, a plaza of six stalls inside it, an avenue
//   of gravel up the middle with benches, paths off it to each ride;
// - the roller coaster, round the whole park inside its fence, by the railway's own
//   rules (a block of rise a rail, a curve only on the level: railgraph.js follows it
//   as a cart does). The station on the front run (a hump: a powered rail up, a level
//   top, the station rail beyond it a powered rail with nothing powering it, which
//   holds a cart; a button on a post beside it sends it off); the lift hill up the
//   right side to twenty-six, every climbing rail powered; along the back the big drop,
//   a camelback, a second hill, each climb powered; down to the ground along the left
//   and home. Boosters along the level. A block under every raised rail (redstone
//   under a powered one), a pillar every fourth, three clear over every rail.
//   Three minecarts at the station;
// - a giant Ferris wheel, twelve across, twelve cabins (park.js: ferrisWheel);
// - the drop tower: a shaft thirty-six high, a ladder up its back to a railed platform;
//   jump into the open middle and fall into three deep of water at the bottom (water
//   breaks any fall), out by a doorway over the water and steps down;
// - a carousel: a round platform, horses on poles, a striped roof;
// - a fence round it all, lamps wherever the night would be dark.

import { MAT, MATERIALS, B, I, railId, poweredRailId, RAIL, stairId, WEIRDO, signId, SIGN_FACING, WOOLS } from './materials.js';
import { edgeRoute, accessRoad, OUT, OPPOSITE, NAME, lightGround } from './offsite.js';
import { ferrisWheel } from './park.js';

export const THEMEPARK = { L: 110, D: 80, LIFT: 26 };
const brake = (dir) => MATERIALS.add(null, 'minecraft:golden_rail', '#d8b13a', { rail_data_bit: B(0), rail_direction: I(dir) }, { passable: true, flowable: true, flat: true });
const buttonUp = () => MATERIALS.add(null, 'minecraft:wooden_button', '#a08050', { button_pressed_bit: B(0), facing_direction: I(1) });

// a rail's shape from the cells either side of it (world x, y, z): straight, a slope
// rising toward the higher, or a curve on the level (as park.js)
function shapeOf(prev, cur, next) {
  const d = (a) => [Math.sign(a[0] - cur[0]), Math.sign(a[2] - cur[2])];
  const [p, n] = [d(prev), d(next)];
  const up = next[1] > cur[1] ? n : prev[1] > cur[1] ? p : null;
  if (up) return up[0] === 1 ? RAIL.UP_E : up[0] === -1 ? RAIL.UP_W : up[1] === -1 ? RAIL.UP_N : RAIL.UP_S;
  if (p[0] === -n[0] && p[1] === -n[1]) return p[0] !== 0 ? RAIL.EW : RAIL.NS;
  const has = (a, b) => (p[0] === a && p[1] === b) || (n[0] === a && n[1] === b);
  const S = has(0, 1), N = has(0, -1), E = has(1, 0), W = has(-1, 0);
  return S && E ? RAIL.SE : S && W ? RAIL.SW : N && W ? RAIL.NW : RAIL.NE;
}

// The coaster's heights round its loop: front (from its first corner), right, back, left.
export function coasterProfile(Lf, Lr, Lb, Ll, H) {
  const front = [], right = [], back = [], left = [];
  // the front: level, the station's hump eight in
  const s = 8;
  for (let i = 0; i < Lf; i++) front.push([i === s ? 2 : 1, i === s - 1 ? 'hump-up' : i === s ? 'hump-top' : i === s + 1 ? 'station' : (i > s + 3 && i < Lf - 2 && (i - s) % 5 === 0) ? 'boost' : 'plain']);
  // the right: the lift hill to H, then level to the corner
  for (let j = 0; j < Lr; j++) right.push([j <= 1 ? 1 : Math.min(H, j), 'plain']);
  // the back: the big drop, a camelback, a second hill, level home to the corner at four
  const seq = [H, H];
  const to = (h) => { let c = seq[seq.length - 1]; while (c !== h) { c += Math.sign(h - c); seq.push(c); } };
  const level = (n) => { for (let i = 0; i < n; i++) seq.push(seq[seq.length - 1]); };
  to(4); level(3); to(Math.round(H * 0.6)); level(2); to(4); level(3); to(9); level(2); to(4);
  while (seq.length < Lb) seq.push(4);
  for (let k = 0; k < Lb; k++) back.push([seq[k], 'plain']);
  // the left: level two, down to the ground, level home
  for (let k = 0; k < Ll; k++) left.push([k <= 1 ? 4 : Math.max(1, 4 - (k - 1)), 'plain']);
  const all = [...front, ...right, ...back, ...left];
  // roles: a rail that climbs to the next is powered (the lift and every climb); along
  // the level a booster every fifth
  all.forEach((c, i) => {
    const next = all[(i + 1) % all.length];
    if (c[1] === 'plain' && next[0] > c[0]) c[1] = 'lift';
  });
  let run = 0;
  all.forEach((c, i) => {
    const prev = all[(i - 1 + all.length) % all.length], next = all[(i + 1) % all.length];
    if (c[1] !== 'plain') { run = 0; return; }
    run = prev[0] === c[0] && next[0] === c[0] ? run + 1 : 0;
    if (run && run % 5 === 0) c[1] = 'boost';
  });
  return { all, lens: [Lf, Lr, Lb, Ll], station: s };
}

export function buildThemePark(world, plan, cfg, ctx) {
  const { signTags } = ctx;
  const { L, D: VD } = THEMEPARK;
  const U0 = -L / 2, U1 = L / 2 - 1;
  // away from the airport where there is one: its opposite side first, then either of the others
  const avoid = ctx.avoid || [];
  const sides = ctx.awayFrom ? [OPPOSITE[ctx.awayFrom], ...['north', 'south', 'west', 'east'].filter((s) => s !== ctx.awayFrom && s !== OPPOSITE[ctx.awayFrom])] : undefined;
  const route = edgeRoute(plan, world, ctx.GROUND, ctx.elevAt, { sides, avoid, footprint: [U0, U1, VD] });
  if (!route) return { missing: 'no street leads straight out of the city across open ground for the theme park\'s road' + (ctx.awayFrom ? ' (on a side the airport does not take)' : '') };
  const acc = accessRoad(world, plan, route, ctx, 'Theme Park', MAT.C_GRAY);
  const { at, road, gate, streetSign } = acc, YA = acc.YA, side = route.side;
  const inName = NAME([-OUT[side][0], -OUT[side][1]]), outName = side;
  const put = (u, v, y, id) => { const [x, z] = at(u, v); world.set(x, y, z, id); };
  const clear = (u, v, y) => { const [x, z] = at(u, v); world.clear(x, y, z); };
  const has = (u, v, y) => { const [x, z] = at(u, v); return world.has(x, y, z); };
  const pos = (u, v, y) => { const [x, z] = at(u, v); return [x, y, z]; };
  const sign = (u, v, y, face, text) => { const [x, z] = at(u, v); world.set(x, y, z, signId(SIGN_FACING[face])); world.setData(x, y, z, { id: 'Sign', tags: signTags(text) }); return [x, y, z]; };
  const mat = (block, color) => MATERIALS.add(null, 'minecraft:' + block, color, {});
  const RED = mat('red_concrete', '#8e2121'), YELLOW = mat('yellow_concrete', '#d5b31f'), WHITE_WOOL = WOOLS[3], RED_WOOL = WOOLS[0];

  // ---- the ground, the fence ---------------------------------------------------------------
  for (let u = U0; u <= U1; u++) for (let v = 0; v < VD; v++) {
    for (let y = ctx.GROUND - 2; y < YA; y++) put(u, v, y, MAT.BASE);
    put(u, v, YA, MAT.GRASS);
    for (let y = YA + 1; y <= YA + 44; y++) clear(u, v, y);
  }
  const fence = [];
  for (let u = U0; u <= U1; u++) for (let v = 0; v < VD; v++) {
    const edge = u === U0 || u === U1 || v === 0 || v === VD - 1;
    if (!edge || (v === 0 && Math.abs(u) <= 2)) continue;
    put(u, v, YA + 1, MAT.FENCE); fence.push(pos(u, v, YA + 1));
  }
  for (let v = 0; v <= 1; v++) for (let u = -1; u <= 1; u++) { put(u, v, YA, MAT.C_GRAY); road.push(pos(u, v, YA)); }
  // the entrance arch over the gate
  for (const u of [-3, 3]) for (let y = YA + 1; y <= YA + 6; y++) put(u, 0, y, MAT.QUARTZ_PILLAR);
  for (let u = -3; u <= 3; u++) put(u, 0, YA + 7, (u + 3) % 2 ? RED_WOOL : WHITE_WOOL);
  const archSign = sign(0, 0, YA + 8, inName, 'Theme Park');
  for (const u of [-3, 3]) put(u, 0, YA + 8, MAT.LAMP);

  // ---- the avenue, the paths -----------------------------------------------------------------
  const PATH = MAT.GRAVEL;
  const paved = [];
  const pave = (u, v) => { put(u, v, YA, PATH); paved.push([u, v]); };
  for (let v = 1; v <= 72; v++) for (let u = -1; u <= 1; u++) pave(u, v);
  for (let u = -2; u >= -12; u--) for (const v of [43, 44, 45]) pave(u, v);       // to the wheel
  for (let u = 2; u <= 21; u++) for (const v of [24, 25]) pave(u, v);              // to the drop tower
  for (let u = 2; u <= 18; u++) for (const v of [55, 56, 57]) pave(u, v);          // to the carousel
  for (let v = 2; v <= 6; v++) for (let u = -18; u <= 18; u++) if (Math.abs(u) > 1) pave(u, v);   // the plaza

  // ---- the stalls on the plaza ----------------------------------------------------------------
  const STALLS = ['Popcorn', 'Candy floss', 'Hot dogs', 'Ice cream', 'Lemonade', 'Prizes'];
  const stalls = [];
  [-17, -12, -7, 5, 10, 15].forEach((ua, k) => {
    for (let du = 0; du < 3; du++) {
      put(ua + du, 5, YA + 1, MAT.SMOOTH_QUARTZ);                                     // the counter
      for (let dv = 5; dv <= 7; dv++) put(ua + du, dv, YA + 3, (du + k) % 2 === 0 ? RED_WOOL : WHITE_WOOL);   // the awning
    }
    for (const du of [0, 2]) { put(ua + du, 7, YA + 1, MAT.FENCE); put(ua + du, 7, YA + 2, MAT.FENCE); }
    stalls.push({ name: STALLS[k], counter: pos(ua + 1, 5, YA + 1), sign: sign(ua + 1, 4, YA + 1, inName, STALLS[k]) });
  });

  // ---- the roller coaster ---------------------------------------------------------------------
  const u0 = U0 + 3, u1 = U1 - 3, v0 = 9, v1 = VD - 4;
  const loop = [];
  for (let u = u0; u < u1; u++) loop.push([u, v0]);
  for (let v = v0; v < v1; v++) loop.push([u1, v]);
  for (let u = u1; u > u0; u--) loop.push([u, v1]);
  for (let v = v1; v > v0; v--) loop.push([u0, v]);
  const H = Math.min(THEMEPARK.LIFT, (v1 - v0) - 6);
  const prof = coasterProfile(u1 - u0, v1 - v0, u1 - u0, v1 - v0, H);
  const P = loop.map(([u, v], i) => pos(u, v, YA + prof.all[i][0]));
  const rails = [], railBlocks = [], supports = [];
  let station = null;
  loop.forEach(([u, v], i) => {
    const [ht, role] = prof.all[i];
    const prev = P[(i - 1 + P.length) % P.length], cur = P[i], next = P[(i + 1) % P.length];
    const shape = shapeOf(prev, cur, next);
    const curve = shape >= 6;
    const powered = !curve && (role === 'lift' || role === 'boost' || role === 'hump-up');
    const id = role === 'station' ? brake(shape) : powered ? poweredRailId(shape) : railId(shape);
    const under = powered ? MAT.REDSTONE : ht === 1 ? null : MAT.STONEBRICK;
    if (ht > 2 && i % 4 === 0) for (let y = YA + 1; y < YA + ht - 1; y++) put(u, v, y, MAT.STONEBRICK);    // a pillar
    if (under !== null) { put(u, v, YA + ht - 1, under); railBlocks.push([...pos(u, v, YA + ht - 1), under]); supports.push(pos(u, v, YA + ht - 1)); }
    for (let y = YA + ht + 1; y <= YA + ht + 3; y++) clear(u, v, y);
    put(u, v, YA + ht, id); railBlocks.push([...pos(u, v, YA + ht), id]);
    rails.push({ at: pos(u, v, YA + ht), role, shape, i });
    if (role === 'station') station = { u, v, rail: pos(u, v, YA + ht) };
  });
  // the station: a post beside the station rail, inside the loop, a button on top
  put(station.u, v0 + 1, YA + 1, MAT.SMOOTH_QUARTZ); put(station.u, v0 + 1, YA + 2, buttonUp());
  const stationSign = sign(station.u + 1, v0 + 1, YA + 1, inName, 'The Leviathan\npress the button\nto ride');
  station.button = pos(station.u, v0 + 1, YA + 2); station.post = pos(station.u, v0 + 1, YA + 1);
  // three carts: in the station, and two on the level before the hump
  const carts = [[...station.rail], pos(u0 + prof.station - 3, v0, YA + 1), pos(u0 + prof.station - 5, v0, YA + 1)];

  // ---- the giant Ferris wheel -------------------------------------------------------------------
  const wr = 12, wu = -26, wv = 44, wy = YA + wr + 3;
  const wheel = ferrisWheel(put, pos, wu, wv, wy, wr, YA, 12);
  sign(wu + 1, wv - 3, YA + 1, inName, 'Big Wheel');

  // ---- the drop tower -----------------------------------------------------------------------------
  const TU = 24, TV = 30, TOP = YA + 36;                    // its middle; the platform's height
  const water = [];
  for (let du = -2; du <= 2; du++) for (let dv = -2; dv <= 2; dv++) {
    const ring = Math.abs(du) === 2 || Math.abs(dv) === 2;
    put(TU + du, TV + dv, YA, MAT.STONEBRICK);
    if (ring) for (let y = YA + 1; y < TOP; y++) put(TU + du, TV + dv, y, (Math.floor((y - YA) / 4) % 2) ? RED : MAT.C_WHITE);
    else for (let y = YA + 1; y <= YA + 3; y++) { put(TU + du, TV + dv, y, MAT.WATER); water.push(pos(TU + du, TV + dv, y)); }
    if (ring) put(TU + du, TV + dv, TOP, MAT.SMOOTH_QUARTZ);
  }
  // the ladder up its back, the railing round the top (open where the ladder arrives)
  const LADDER = { north: MAT.LADDER_2, south: MAT.LADDER_3, west: MAT.LADDER_4, east: MAT.LADDER_5 };
  const ladder = [];
  for (let y = YA + 1; y <= TOP + 1; y++) { put(TU, TV + 3, y, LADDER[outName]); ladder.push(pos(TU, TV + 3, y)); }
  for (let du = -2; du <= 2; du++) for (let dv = -2; dv <= 2; dv++) {
    const ring = Math.abs(du) === 2 || Math.abs(dv) === 2;
    if (ring && !(du === 0 && dv === 2)) put(TU + du, TV + dv, TOP + 1, MAT.FENCE);
  }
  put(TU + 2, TV + 2, TOP + 2, MAT.LAMP);
  // out: a doorway over the water on the front, steps down to the path
  for (const y of [YA + 4, YA + 5]) clear(TU, TV - 2, y);
  const stepsOut = [];
  for (const [dv, hgt] of [[-3, 3], [-4, 2], [-5, 1]]) {
    for (let y = YA + 1; y < YA + hgt; y++) put(TU, TV + dv, y, MAT.STONEBRICK);
    put(TU, TV + dv, YA + hgt, stairId('stonebrick', WEIRDO[outName])); stepsOut.push(pos(TU, TV + dv, YA + hgt));
  }
  sign(TU + 1, TV + 4, YA + 1, outName, 'The Plunge\nclimb the ladder\njump in the middle\nwater at the bottom');
  const tower = { ladder, top: pos(TU, TV + 2, TOP + 1), water, door: pos(TU, TV - 2, YA + 4), steps: stepsOut, height: TOP - YA };

  // ---- the carousel ---------------------------------------------------------------------------------
  const CU = 24, CV = 56;
  const horses = [];
  for (let du = -5; du <= 5; du++) for (let dv = -5; dv <= 5; dv++) {
    const d = Math.hypot(du, dv);
    if (d <= 5.4) put(CU + du, CV + dv, YA, MAT.SMOOTH_QUARTZ);
    if (d <= 5.4 && d > 3.6) put(CU + du, CV + dv, YA + 6, ((Math.round(Math.atan2(dv, du) * 4 / Math.PI) + 8) % 2) ? RED_WOOL : WHITE_WOOL);
    if (d <= 3.6 && d > 1.6) put(CU + du, CV + dv, YA + 7, ((Math.round(Math.atan2(dv, du) * 4 / Math.PI) + 8) % 2) ? WHITE_WOOL : RED_WOOL);
    if (d <= 1.6) put(CU + du, CV + dv, YA + 8, RED_WOOL);
  }
  for (let y = YA + 1; y <= YA + 7; y++) put(CU, CV, y, MAT.QUARTZ_PILLAR);
  put(CU, CV, YA + 9, MAT.LAMP);
  const COLOURS = [WOOLS[1], WOOLS[2], WOOLS[4], WOOLS[5], WOOLS[6], WOOLS[7], WOOLS[0], WOOLS[3]];
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, du = Math.round(3 * Math.cos(a)), dv = Math.round(3 * Math.sin(a));
    for (let y = YA + 1; y <= YA + 5; y++) put(CU + du, CV + dv, y, y === YA + 2 ? COLOURS[k] : MAT.FENCE);
    horses.push(pos(CU + du, CV + dv, YA + 2));
  }
  for (const [du, dv] of [[5, 0], [-5, 0], [0, 5], [0, -5]]) for (let y = YA + 1; y <= YA + 5; y++) put(CU + du, CV + dv, y, MAT.QUARTZ_PILLAR);
  for (const [du, dv] of [[2, 2], [-2, 2], [2, -2], [-2, -2]]) put(CU + du, CV + dv, YA + 6, MAT.LAMP_HANG);
  sign(CU - 6, CV, YA + 1, inName, 'Carousel');
  const carousel = { centre: pos(CU, CV, YA + 1), horses };

  // ---- benches along the avenue ----------------------------------------------------------------------
  const benches = [];
  for (let v = 14; v <= 70; v += 8) for (const [u, d] of [[-3, 'west'], [3, 'east']]) {
    if (has(u, v, YA + 1)) continue;
    put(u, v, YA + 1, stairId('oak', WEIRDO[d])); benches.push(pos(u, v, YA + 1));
  }

  // ---- lamps wherever the night would be dark ---------------------------------------------------------
  const lit = [];
  for (const u of [-3, 3]) lit.push(pos(u, 0, YA + 8));
  lit.push(pos(CU, CV, YA + 9), pos(TU + 2, TV + 2, TOP + 2));
  for (const [du, dv] of [[2, 2], [-2, 2], [2, -2], [-2, -2]]) lit.push(pos(CU + du, CV + dv, YA + 6));
  const cells = [];
  for (let v = 1; v < VD - 1; v++) for (let u = U0 + 1; u < U1; u++) cells.push([u, v]);
  const lamps = lightGround(world, { at }, YA, cells, (u, v, x, z) => {
    const id = world.get(x, YA, z);
    if (id === MAT.GRASS) return 'soft';
    if (id === PATH && !world.has(x, YA + 1, z)) return 'hard';
    return null;
  }, lit, MAT.FENCE, MAT.SEA_LANTERN);

  const a0 = at(U0, 0), a1 = at(U1, VD - 1);
  const rect = { x0: Math.min(a0[0], a1[0]), x1: Math.max(a0[0], a1[0]), z0: Math.min(a0[1], a1[1]), z1: Math.max(a0[1], a1[1]) };
  const rx = road.map((p) => p[0]), rz = road.map((p) => p[2]);
  const roadRect = { x0: Math.min(...rx), x1: Math.max(...rx), z0: Math.min(...rz), z1: Math.max(...rz) };
  const [vx, vz] = at(0, 3), [lx, lz] = at(0, 9);
  return {
    kind: 'themepark', lot: rect, roadRect, side, street: acc.street, gate, streetSign, ground: YA, noLighting: true, rec: null,
    road, coaster: { rails, railBlocks, supports, station, carts, lift: H, length: rails.length, stationSign },
    wheel, tower, carousel, stalls, benches, fence, lamps: [...lit, ...lamps], arch: archSign,
    visit: [vx, YA + 1, vz], visitLook: [lx, YA + 2, lz],
    frame: { at, pos, U0, U1, VD, YA, u0, u1, v0, v1 },
    map: { loop: loop.map(([u, v]) => at(u, v)), wheel: [at(wu - wr, wv), at(wu + wr, wv)], tower: at(TU, TV), carousel: at(CU, CV) },
  };
}
