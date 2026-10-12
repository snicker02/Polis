// engine/themepark.js — a theme park beside the city, at the end of a road of its own.
//
// Like the airport (offsite.js), ground of the city's own outside its square: a park
// a hundred and ten along the city's edge by eighty out from it, on the side away from
// the airport where there is one, at the height its road leaves the city. In its own
// frame: u along the edge (the road arrives at u = 0), v out from the city.
//
// - the entrance: an arch over the gate, a plaza of six stalls inside it, an avenue
//   of gravel up the middle with benches, paths off it to each ride;
// - the roller coaster, the Leviathan, winding through nearly the whole park inside its
//   fence, by the railway's own rules (a block of rise a rail, a curve only on the level:
//   railgraph.js follows it as a cart does). The station on the front run (a hump: a
//   powered rail up, a level top, the station rail beyond it a powered rail with nothing
//   powering it, which holds a cart; a button on a post beside it sends it off); a
//   switchback across the front right, climbing; the lift hill up the right side to
//   twenty-six; the helix; then switchbacks through every quarter of the park, a hill on
//   every run (ROUTE), over the paths high enough to walk under, home down the left.
//   Every climbing rail powered, boosters along the level. A block under every raised
//   rail (redstone under a powered one), a pillar every fourth, three clear over every
//   rail. Three minecarts at the station;
// - a giant Ferris wheel, twelve across, twelve cabins (park.js: ferrisWheel);
// - the drop tower: a shaft thirty-six high, a ladder up its back to a railed platform;
//   jump into the open middle and fall into three deep of water at the bottom (water
//   breaks any fall), out by a doorway over the water and steps down;
// - a carousel: a round platform, horses on poles, a striped roof;
// - a fence round it all, lamps wherever the night would be dark.

import { MAT, MATERIALS, B, I, railId, poweredRailId, RAIL, stairId, WEIRDO, signId, SIGN_FACING, WOOLS } from './materials.js';
import { edgeRoute, accessRoad, OUT, OPPOSITE, NAME, lightGround } from './offsite.js';
import { ferrisWheel } from './park.js';
import { commandBlock } from './airport.js';

export const THEMEPARK = { L: 110, D: 80, LIFT: 26 };
// the big wheel's turn: a whole turn in forty-eight frames of seven and a half degrees
// (its cabins hang straight down as it turns, so nothing short of a whole turn brings it
// back exactly to itself on the grid: a whole turn loops by its nature)
export const WHEEL_FRAMES = 48, WHEEL_PERIOD = 2 * Math.PI;
export const WHEEL_COLOURS = () => null;
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

// The coaster's route: from its start corner, segment by segment, each [direction, steps,
// height to reach] (E, W along u; N out from the city, S back toward it). Each segment
// leaves its corner level and arrives at the next level (a curve only on the level, its
// neighbours level with it), and between changes a block of rise or fall a step.
// The route as laid in the park (ROUTE): the front run with the station; a switchback
// across the front right; the lift hill up the right; a high run in; a helix down round a
// square, passing under its own top; behind the drop tower and north over the carousel's
// path; east and west behind the carousel; along the back fence; a serpentine through
// the back left; south over the wheel's path; four rows across the front left; home.
// Wherever it crosses a path it is four and more up (two clear under the block it sits
// on); it never comes nearer a ride than the paths do.
export const ROUTE = [
  ['E', 103, 1],                                  // the front run, the station on it
  ['N', 6, 1], ['W', 46, 6], ['N', 6, 6],          // the first switchback, climbing as it goes
  ['E', 23, 2], ['E', 23, 7],                     // a dip, up again to the lift
  ['N', 23, 26],                                  // the lift hill
  ['W', 15, 26],                                  // the high run in
  ['N', 12, 17], ['E', 12, 8], ['S', 12, 4], ['W', 16, 4],   // the helix: down round a square, under its own top
  ['S', 6, 4], ['W', 10, 12], ['W', 10, 4],       // behind the drop tower, a camelback
  ['N', 13, 12], ['N', 13, 4],                    // north over the carousel's path, another
  ['E', 18, 14], ['E', 19, 4],                    // east behind the carousel, a hill
  ['N', 6, 4], ['W', 20, 16], ['W', 19, 4],       // back west, a higher hill
  ['N', 6, 4], ['W', 28, 18], ['W', 28, 4],       // along the back fence, the highest after the lift
  ['S', 22, 4], ['E', 10, 4], ['N', 18, 14], ['E', 10, 14],  // the back-left serpentine: up
  ['S', 18, 4], ['E', 10, 4], ['N', 18, 14], ['E', 8, 14],   // down, and up again
  ['S', 34, 6],                                   // south over the wheel's path
  ['W', 20, 16], ['W', 20, 4], ['S', 6, 4],       // the front-left serpentine: four rows, a hill on each
  ['E', 20, 14], ['E', 20, 4], ['S', 6, 4],
  ['W', 20, 12], ['W', 20, 4], ['S', 6, 4],
  ['E', 20, 10], ['E', 20, 4], ['S', 6, 4],
  ['W', 44, 3], ['S', 5, 1],                      // and home
];
const STEP = { E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] };
export function coasterRoute(u0, v0, route = ROUTE, station = 8) {
  let u = u0, v = v0, h = 1;
  const cells = [[u, v, h]], errors = [];
  route.forEach(([d, n, target], si) => {
    const [du, dv] = STEP[d];
    for (let k = 1; k <= n; k++) {
      u += du; v += dv;
      if (k >= 2 && k <= n - 1 && h !== target) h += Math.sign(target - h);
      cells.push([u, v, h]);
    }
    if (h !== target) errors.push(`segment ${si} (${d} ${n}) ends at ${h}, not ${target}`);
  });
  const last = cells.pop();
  if (last[0] !== u0 || last[1] !== v0 || last[2] !== 1) errors.push(`the route does not close: ends at ${last}`);
  // the station's hump on the front run
  cells[station][2] = 2;
  const all = cells.map(([cu, cv, ch], i) => [cu, cv, ch, i === station - 1 ? 'hump-up' : i === station ? 'hump-top' : i === station + 1 ? 'station' : 'plain']);
  const N = all.length;
  all.forEach((c, i) => { const next = all[(i + 1) % N]; if (c[3] === 'plain' && next[2] > c[2]) c[3] = 'lift'; });
  let run = 0;
  all.forEach((c, i) => {
    const prev = all[(i - 1 + N) % N], next = all[(i + 1) % N];
    if (c[3] !== 'plain') { run = 0; return; }
    run = prev[2] === c[2] && next[2] === c[2] ? run + 1 : 0;
    if (run && run % 5 === 0) c[3] = 'boost';
  });
  // where it passes over itself, room between: its own rail, the block under the upper,
  // three clear over the lower
  const cols = new Map();
  for (const c of all) { const k = c[0] + ',' + c[1]; if (!cols.has(k)) cols.set(k, []); cols.get(k).push(c[2]); }
  for (const [k, hs] of cols) if (hs.length > 1) { hs.sort((a, b) => a - b); for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] < 5) errors.push(`at ${k} it passes over itself ${hs[i] - hs[i - 1]} apart`); }
  return { all, station, cols, errors };
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
  const track = coasterRoute(u0, v0);
  if (track.errors.length) throw new Error('theme park coaster: ' + track.errors.join('; '));
  const prof = { all: track.all.map((c) => [c[2], c[3]]), station: track.station };
  const loop = track.all.map((c) => [c[0], c[1]]);
  const H = Math.max(...track.all.map((c) => c[2]));
  const P = loop.map(([u, v], i) => pos(u, v, YA + prof.all[i][0]));
  const pathCell = new Set(paved.map(([u, v]) => u + ',' + v));
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
    // a pillar every fourth, but never where the track passes under itself or over a path
    if (ht > 2 && i % 4 === 0 && track.cols.get(u + ',' + v).length === 1 && !pathCell.has(u + ',' + v)) for (let y = YA + 1; y < YA + ht - 1; y++) put(u, v, y, MAT.STONEBRICK);
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
  const wheel = ferrisWheel(put, pos, wu, wv, wy, wr, YA, 12, 0, WHEEL_COLOURS());
  sign(wu + 1, wv - 3, YA + 1, inName, 'Big Wheel');
  // It turns: forty-eight frames of it, each seven and a half degrees on, a whole turn
  // (twenty-four seconds) and round again. Saved in the pack as structures (export.js: world.anims), every block of its
  // plane and air between. Under the ground a clock of command blocks loads them in
  // turn, a frame every half second: a repeating block loading the first once a turn,
  // chain blocks after it each waiting half a second to load the next, silent.
  const FRAMES = WHEEL_FRAMES, frames = [];
  for (let f = 0; f < FRAMES; f++) {
    const cells = new Map();
    const rec = (u, v, y, id) => { if (v !== wv) return; const [x, z] = at(u, v); cells.set(x + ',' + y + ',' + z, id); };
    ferrisWheel(rec, pos, wu, wv, wy, wr, YA, 12, (f * WHEEL_PERIOD) / FRAMES, WHEEL_COLOURS());
    frames.push(cells);
  }
  const fx = [], fy = [], fz = [];
  for (const c of frames) for (const k of c.keys()) { const [x, y, z] = k.split(',').map(Number); fx.push(x); fy.push(y); fz.push(z); }
  const fbox = { x0: Math.min(...fx), x1: Math.max(...fx), y0: Math.max(YA + 1, Math.min(...fy)), y1: Math.max(...fy), z0: Math.min(...fz), z1: Math.max(...fz) };
  world.anims = [...(world.anims || []), ...frames.map((cells, f) => ({ name: `wheel_f${f}`, box: fbox, cells }))];
  const FACE = { north: 2, south: 3, west: 4, east: 5 }[NAME(acc.across)];
  // (a plain timed chain, nothing to count: the repeating block loads frame 0 once a
  // whole turn, every chain block after it waits half a second and loads the next)
  const STEP = 10;
  const clock = [];
  for (let f = 0; f < FRAMES; f++) {
    const mode = f === 0 ? 'repeat' : 'chain', delay = f === 0 ? FRAMES * STEP : STEP;
    const [x, y, z] = pos(wu - 3 + f, wv + 4, YA - 1);
    const id = MATERIALS.add(null, mode === 'repeat' ? 'minecraft:repeating_command_block' : 'minecraft:chain_command_block', mode === 'repeat' ? '#6b4fa0' : '#5d8f6a',
      { conditional_bit: B(0), facing_direction: I(FACE) });
    world.set(x, y, z, id);
    const cmd = `structure load {ns}:wheel_f${f} ~${fbox.x0 - x} ~${fbox.y0 - y} ~${fbox.z0 - z}`;
    world.setData(x, y, z, commandBlock(cmd, { mode, delay }));
    clock.push({ at: [x, y, z], cmd, mode, delay });
  }
  wheel.turning = { frames: FRAMES, box: fbox, clock };

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
