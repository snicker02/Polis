// engine/factory.js — a factory: working redstone, and a hall to put it in.
//
// Nineteen by twenty-five (a porch row before the front wall, for the outer
// pressure plates), stone brick, skylights in a saw-tooth roof, two chimneys
// smoking (lit campfires on top). Laid out in the lot's own frame (zoo.js:
// lotFrame). Each machine built the plainest way that works, since none of it can
// be tried in the game from here:
//
// - The control room: four levers on the side wall, each on a wall block with a
//   redstone lamp set in the wall above it (the lever powers the block it is on,
//   the lamp beside that block lights: no wire to go wrong); and the master
//   switch, a lever on a console beside a bench of lamps with redstone dust along
//   their tops (dust powers the block under it: the whole bench lights).
// - The doors: a double iron door in the front wall, a pressure plate before it
//   on each side (a plate powers the door beside it: it opens as you come).
// - The assembly line: a raised channel, a water source at its head and flowing
//   water down it, over a hopper at its end that feeds a chest; workstations along
//   it (smoker, blast furnace, smithing table, stonecutter: villagers' jobs).
// - The freight siding: a short track with a minecart on it, a detector rail on a
//   redstone lamp with another beside it (a cart on the rail lights them), and a
//   loading chest; a stone stop at each end and two powered rails before it on
//   blocks of redstone, so the cart shuttles to and fro by itself.
//
// Every machine's parts are returned, for the checks' redstone simulator.

import { MAT, MATERIALS, B, I, S, chestId, smokerId, stonecutterId, furnaceId, railId, RAIL, stairId, WEIRDO, ironDoorId, DIR } from './materials.js';
import { lotFrame } from './zoo.js';
import { helpers } from './services.js';

export const FACTORY_SIZE = [19, 25];   // (fifteen by twenty-two, or thirteen by eighteen, where the lot is smaller: the same machines)

// the redstone blocks, as Bedrock has them
const LAMP = () => MATERIALS.add(null, 'minecraft:redstone_lamp', '#8a5a3a', {});
const DUST = () => MATERIALS.add(null, 'minecraft:redstone_wire', '#a01010', { redstone_signal: I(0) });
const PLATE = () => MATERIALS.add(null, 'minecraft:stone_pressure_plate', '#8a8a8a', { redstone_signal: I(0) });
const lever = (dir) => MATERIALS.add(null, 'minecraft:lever', '#6a5a4a', { lever_direction: S(dir), open_bit: B(0) });
const REDSTONE_BLOCK = () => MATERIALS.add(null, 'minecraft:redstone_block', '#b01010', {});
const powered = (dir) => MATERIALS.add(null, 'minecraft:golden_rail', '#c8a040', { rail_data_bit: B(1), rail_direction: I(dir) });
const detector = (dir) => MATERIALS.add(null, 'minecraft:detector_rail', '#8a6a5a', { rail_data_bit: B(0), rail_direction: I(dir) });
const hopper = (facing) => MATERIALS.add(null, 'minecraft:hopper', '#4a4a4a', { facing_direction: I(facing), toggle_bit: B(0) });
const water = (depth, flowing) => MATERIALS.add(null, flowing ? 'minecraft:flowing_water' : 'minecraft:water', '#3a5ad0', { liquid_depth: I(depth) });
const FACING_NUM = { north: 2, south: 3, west: 4, east: 5 };

export function factory(world, lot, face, cfg, rng, G, signTags) {
  // nineteen by twenty-five where the lot allows, else fifteen by twenty-two (the
  // bench shorter, the siding nearer in)
  // (and thirteen by eighteen, the line shorter and its workstations side by side:
  // a city of small blocks seldom has a lot of fifteen by twenty-two, and a ticked
  // factory found no lot at all)
  let W = 0, D = 0, fr = null;
  for (const [w, d] of [[19, 25], [15, 22], [13, 18]]) { fr = lotFrame(lot, face, w, d); if (fr) { W = w; D = d; break; } }
  if (!fr) return null;
  const small = W === 13;
  const H = 6, TOP = G + H + 1, FRONT = 1, mid = (W - 1) / 2;
  const h = helpers(world, fr, G, signTags);
  const { at, put, clear, neg, sign, nameOf } = h;
  const back = fr.back, across = fr.across;
  const pos = (u, v, y) => { const [x, z] = at(u, v); return [x, y, z]; };
  // ---- the hall: stone brick, windows high, a saw-tooth roof of skylights ------------------
  for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
    for (let y = G + 1; y <= TOP + 7; y++) clear(u, v, y);
    put(u, v, G, v < FRONT ? MAT.MUSEUM_PLINTH : MAT.SMOOTH);
    if (v < FRONT) continue;
    const edge = u === 0 || u === W - 1 || v === FRONT || v === D - 1;
    if (edge) for (let y = G + 1; y < TOP; y++) put(u, v, y, MAT.STONEBRICK);
    // the roof: a row of glass in every fourth, a stone brick tooth behind each
    const k = (v - FRONT) % 4;
    put(u, v, TOP, k === 0 ? MAT.GLASS : MAT.STONEBRICK);
    if (k === 1 && v < D - 1) put(u, v, TOP + 1, stairId('stonebrick', WEIRDO[nameOf(back)]));
  }
  for (let v = FRONT + 2; v < D - 1; v += 3) for (let y = G + 4; y <= G + 5; y++) { put(0, v, y, MAT.GLASS); put(W - 1, v, y, MAT.GLASS); }
  // the chimneys at the back corners, smoking
  const chimneys = [];
  for (const u of [2, W - 3]) {
    for (let y = TOP; y <= TOP + 5; y++) put(u, D - 3, y, MAT.BRICK);
    put(u, D - 3, TOP + 6, MAT.HEARTH); chimneys.push(pos(u, D - 3, TOP + 6));
  }
  for (const [u, v] of [[4, 4], [W - 5, 4], [4, 13], [W - 5, 13], [mid, D - 5]]) put(u, v, TOP - 1, MAT.LAMP_HANG);

  // ---- the doors: a double iron door, a pressure plate before it each side -------------
  // (as every building's double door: the same facing, out to the street, and the
  // hinges on the outer edges; "right" is the side clockwise from the facing)
  const facingOut = nameOf(neg(back));
  const CLOCKWISE = { north: [1, 0], east: [0, 1], south: [-1, 0], west: [0, -1] }[facingOut];
  const [ax, az] = at(mid - 1, FRONT), [bx, bz] = at(mid, FRONT);
  const secondIsRight = (bx - ax) * CLOCKWISE[0] + (bz - az) * CLOCKWISE[1] > 0;
  const doors = [], plates = [];
  for (const [u, hinge] of [[mid - 1, secondIsRight ? 0 : 1], [mid, secondIsRight ? 1 : 0]]) {
    put(u, FRONT, G + 1, ironDoorId(DIR[facingOut], false, hinge)); put(u, FRONT, G + 2, ironDoorId(DIR[facingOut], true, hinge));
    doors.push(pos(u, FRONT, G + 1));
    for (const v of [FRONT - 1, FRONT + 1]) { put(u, v, G + 1, PLATE()); plates.push(pos(u, v, G + 1)); }
  }

  // ---- the control room: four levers each lighting the lamp above it; the master switch --
  const panel = [];
  for (let i = 0; i < 4; i++) {
    const v = FRONT + 3 + i;
    put(0, v, G + 2, MAT.STONEBRICK);                     // the wall block the lever is on
    put(0, v, G + 3, LAMP());                             // its lamp, in the wall above
    put(1, v, G + 2, lever(nameOf(across)));              // the lever, facing into the room
    panel.push({ lever: pos(1, v, G + 2), block: pos(0, v, G + 2), lamp: pos(0, v, G + 3) });
  }
  // the master switch: a lever on a console, beside a bench of lamps with dust along their tops
  const BENCH_V = FRONT + (small ? 7 : 8), bench = [];
  put(2, BENCH_V, G + 1, MAT.SMOOTH_QUARTZ);
  put(2, BENCH_V, G + 2, lever(back[0] !== 0 ? 'up_east_west' : 'up_north_south'));
  for (let u = 3; u <= W - 6; u++) { put(u, BENCH_V, G + 1, LAMP()); put(u, BENCH_V, G + 2, DUST()); bench.push({ lamp: pos(u, BENCH_V, G + 1), dust: pos(u, BENCH_V, G + 2) }); }
  const master = { lever: pos(2, BENCH_V, G + 2), console: pos(2, BENCH_V, G + 1) };
  sign(3, FRONT + 2, G + 1, neg(back), 'Control room');

  // ---- the assembly line: a raised channel of flowing water over a hopper into a chest ----
  const LU = 3, L0 = BENCH_V + 3, L1 = L0 + (small ? 4 : 7);   // its head and end
  const line = [];
  for (let v = L0 - 1; v <= L1 + 1; v++) {
    put(LU, v, G + 1, MAT.SMOOTH);                        // its bed
    for (const u of [LU - 1, LU + 1]) put(u, v, G + 2, MAT.GLASS);   // its sides
  }
  put(LU, L0 - 1, G + 2, MAT.GLASS); put(LU, L1 + 1, G + 2, MAT.GLASS);   // its ends
  for (let v = L0; v <= L1; v++) { const d = v - L0; put(LU, v, G + 2, water(d, d > 0)); line.push(pos(LU, v, G + 2)); }
  // the hopper under its end, facing on into the chest beyond
  put(LU, L1, G + 1, hopper(FACING_NUM[nameOf(back)]));
  put(LU, L1 + 1, G + 1, chestId(nameOf(neg(back))));
  const hop = pos(LU, L1, G + 1), chest = pos(LU, L1 + 1, G + 1);
  // the workstations along it
  const stations = [];
  const sv = small ? [L0, L0 + 1, L0 + 2, L0 + 3] : [L0 + 1, L0 + 3, L0 + 5, L0 + 7];
  for (const [v, id] of [[sv[0], smokerId(nameOf(neg(across)))], [sv[1], furnaceId('blast', nameOf(neg(across)))], [sv[2], MAT.SMITHING], [sv[3], stonecutterId(nameOf(neg(across)))]]) {
    put(LU + 2, v, G + 1, id); stations.push(pos(LU + 2, v, G + 1));
  }
  sign(LU + 2, L0 - 1, G + 1, neg(back), 'Assembly line');

  // ---- the freight siding: a track, a minecart, a detector rail lighting its lamps --------
  const TU = W - 4, T0 = FRONT + 6, T1 = D - 3;
  const alongZ = back[0] === 0, railDir = alongZ ? RAIL.NS : RAIL.EW;
  const DET = Math.floor((T0 + T1) / 2);
  // (its rails also kept as a list: on a fitted city a later transit pass clears
  // every rail and lays the railway again, so the city sets these again at its end)
  // (and at both ends a stone stop with two powered rails before it, on blocks of
  // redstone that keep them powered: a cart runs into the stop, comes back, and the
  // powered rails send it off the other way: it shuttles, end to end, by itself)
  const rails = [], railBlocks = [], boosters = [], stops = [];
  for (let v = T0; v <= T1; v++) {
    const boost = v <= T0 + 1 || v >= T1 - 1;
    const id = v === DET ? detector(railDir) : boost ? powered(railDir) : railId(railDir);
    if (v === DET) put(TU, v, G, LAMP());
    // (the redstone block under a powered rail also laid again with it: on a fitted
    // city the transit's pass beds its rails in gravel, and the gravel took it)
    if (boost) { put(TU, v, G, REDSTONE_BLOCK()); boosters.push(pos(TU, v, G + 1)); railBlocks.push([...pos(TU, v, G), REDSTONE_BLOCK()]); }
    put(TU, v, G + 1, id);
    rails.push(pos(TU, v, G + 1)); railBlocks.push([...pos(TU, v, G + 1), id]);
  }
  for (const v of [T0 - 1, T1 + 1]) { put(TU, v, G + 1, MAT.STONEBRICK); stops.push(pos(TU, v, G + 1)); }
  put(TU + 1, DET, G + 1, LAMP());                         // the lamp beside it
  put(TU + 1, T1, G + 1, chestId(nameOf(neg(across))));    // the loading chest
  const siding = { detector: pos(TU, DET, G + 1), under: pos(TU, DET, G), beside: pos(TU + 1, DET, G + 1), cart: pos(TU, T0 + 1, G + 1), chest: pos(TU + 1, T1, G + 1), boosters, stops };
  sign(TU - 1, T0 - 1, G + 1, neg(back), 'Freight siding');

  const doorAt = at(mid, -1);
  return { kind: 'factory', lot, panel, master, bench, doors, plates, line, hopper: hop, chest, stations, rails, railBlocks, siding, chimneys,
    sideways: fr.sideways, wide: W, door: [doorAt[0], G + 1, doorAt[1]], frame: { at, W, D, H, TOP, FRONT, mid, BENCH_V, L0, L1, LU, TU, T0, T1, DET } };
}

// ---- the workshop: more machines, beside the factory --------------------------------------
// Thirteen by fifteen, brick, six clear inside. Its machines face straight up or
// down wherever a facing matters (a sideways facing is where a block can stand a
// quarter turn out, as the factory's doors did):
// - three smelters on the back wall, furnace, blast furnace, smoker: a chest, a
//   hopper down into the furnace, the furnace, a hopper down out of it, a chest:
//   ore in at the top, fuel in the furnace, the smelted out at the bottom;
// - two presses: a sticky piston facing up, an iron block on it, one worked by a
//   lever on the console beside it (it holds), one by a button (a stamp);
// - the instrument bench: note blocks, each on the block that gives its sound
//   (bass drum, snare, hat, bass, bell, flute, chime, guitar, xylophone, iron
//   xylophone), a button on top of each;
// - night lights: inverted daylight sensors on the roof over lamps set in it.
export const WORKSHOP_SIZE = [13, 15];
const STONE = () => MATERIALS.add(null, 'minecraft:stone', '#7d7d7d', {});
const WOOL = () => MATERIALS.add(null, 'minecraft:white_wool', '#e8e8e8', {});
const NOTE = () => MATERIALS.add(null, 'minecraft:noteblock', '#6a4a3a', {});
const piston = (f) => MATERIALS.add(null, 'minecraft:sticky_piston', '#7a8a6a', { facing_direction: I(f) });
const buttonUp = () => MATERIALS.add(null, 'minecraft:wooden_button', '#a08050', { button_pressed_bit: B(0), facing_direction: I(1) });
const SENSOR = () => MATERIALS.add(null, 'minecraft:daylight_detector_inverted', '#8a7a5a', { redstone_signal: I(0) });

export function workshop(world, lot, face, cfg, rng, G, signTags) {
  const W = 13, D = 15, H = 6, TOP = G + H + 1, mid = 6;
  const fr = lotFrame(lot, face, W, D);
  if (!fr) return null;
  const h = helpers(world, fr, G, signTags);
  const { at, put, clear, neg, sign, nameOf } = h;
  const back = fr.back;
  const pos = (u, v, y) => { const [x, z] = at(u, v); return [x, y, z]; };
  for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
    for (let y = G + 1; y <= TOP + 2; y++) clear(u, v, y);
    put(u, v, G, MAT.SMOOTH); put(u, v, TOP, MAT.SMOOTH);
    if (u === 0 || u === W - 1 || v === 0 || v === D - 1) for (let y = G + 1; y < TOP; y++) put(u, v, y, MAT.BRICK);
  }
  for (let u = mid - 1; u <= mid + 1; u++) for (let y = G + 1; y <= G + 3; y++) clear(u, 0, y);
  for (const v of [4, 10]) for (let y = G + 3; y <= G + 4; y++) { put(0, v, y, MAT.GLASS); put(W - 1, v, y, MAT.GLASS); }
  const front = nameOf(neg(back));
  // the smelters: chest, hopper down, furnace, hopper down, chest (top to bottom)
  const smelters = [];
  for (const [u, furnace] of [[3, furnaceId('furnace', front)], [6, furnaceId('blast', front)], [9, smokerId(front)]]) {
    const v = D - 2;
    put(u, v, G + 1, chestId(front)); put(u, v, G + 2, hopper(0)); put(u, v, G + 3, furnace); put(u, v, G + 4, hopper(0)); put(u, v, G + 5, chestId(front));
    smelters.push({ out: pos(u, v, G + 1), down: pos(u, v, G + 2), furnace: pos(u, v, G + 3), feed: pos(u, v, G + 4), input: pos(u, v, G + 5) });
  }
  sign(2, D - 4, G + 1, neg(back), 'Smelters');
  // the presses: a sticky piston up, an iron block on it; a lever, a button
  const presses = [];
  for (const [pu, cu, button] of [[5, 4, false], [8, 9, true]]) {
    put(pu, 7, G + 1, piston(1)); put(pu, 7, G + 2, MAT.IRON);
    put(cu, 7, G + 1, MAT.SMOOTH_QUARTZ);
    put(cu, 7, G + 2, button ? buttonUp() : lever(back[0] !== 0 ? 'up_east_west' : 'up_north_south'));
    presses.push({ piston: pos(pu, 7, G + 1), block: pos(pu, 7, G + 2), console: pos(cu, 7, G + 1), control: pos(cu, 7, G + 2), button });
  }
  sign(6, 5, G + 1, neg(back), 'Presses');
  // the instrument bench: each note block on its sounding block, a button on top
  const sounds = [['bass drum', STONE()], ['snare', MAT.SAND], ['hat', MAT.GLASS], ['bass', MAT.OAK], ['bell', MAT.GOLD],
    ['flute', MAT.CLAY], ['chime', MAT.PACKED_ICE], ['guitar', WOOL()], ['xylophone', MAT.BONE_Y], ['iron xylophone', MAT.IRON]];
  const notes = [];
  sounds.forEach(([name, under], i) => {
    const u = 1 + i;
    put(u, 3, G, under); put(u, 3, G + 1, NOTE()); put(u, 3, G + 2, buttonUp());
    notes.push({ name, under: pos(u, 3, G), note: pos(u, 3, G + 1), button: pos(u, 3, G + 2) });
  });
  sign(11, 2, G + 1, neg(back), 'Instruments');
  // the night lights: lamps in the roof, inverted daylight sensors on them
  const nightLights = [];
  for (const [u, v] of [[3, 6], [9, 6], [6, 11]]) { put(u, v, TOP, LAMP()); put(u, v, TOP + 1, SENSOR()); nightLights.push({ lamp: pos(u, v, TOP), sensor: pos(u, v, TOP + 1) }); }
  for (const [u, v] of [[3, 9], [9, 9], [6, 2]]) put(u, v, TOP - 1, MAT.LAMP_HANG);
  const doorAt = at(mid, -1);
  return { kind: 'workshop', lot, smelters, presses, notes, nightLights, sideways: fr.sideways,
    door: [doorAt[0], G + 1, doorAt[1]], frame: { at, W, D, H, TOP, mid } };
}
