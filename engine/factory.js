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
//   loading chest.
//
// Every machine's parts are returned, for the checks' redstone simulator.

import { MAT, MATERIALS, B, I, S, chestId, smokerId, stonecutterId, furnaceId, railId, RAIL, stairId, WEIRDO } from './materials.js';
import { lotFrame } from './zoo.js';
import { helpers } from './services.js';

export const FACTORY_SIZE = [19, 25];   // (fifteen by twenty-two, or thirteen by eighteen, where the lot is smaller: the same machines)

// the redstone blocks, as Bedrock has them
const LAMP = () => MATERIALS.add(null, 'minecraft:redstone_lamp', '#8a5a3a', {});
const DUST = () => MATERIALS.add(null, 'minecraft:redstone_wire', '#a01010', { redstone_signal: I(0) });
const PLATE = () => MATERIALS.add(null, 'minecraft:stone_pressure_plate', '#8a8a8a', { redstone_signal: I(0) });
const lever = (dir) => MATERIALS.add(null, 'minecraft:lever', '#6a5a4a', { lever_direction: S(dir), open_bit: B(0) });
const door = (facing, upper, hinge) => MATERIALS.add(null, 'minecraft:iron_door', '#c8c8c8',
  { door_hinge_bit: B(hinge), 'minecraft:cardinal_direction': S(facing), open_bit: B(0), upper_block_bit: B(upper) });
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
  const facingOut = nameOf(neg(back));
  const doors = [], plates = [];
  for (const [u, hinge] of [[mid - 1, 0], [mid, 1]]) {
    put(u, FRONT, G + 1, door(facingOut, 0, hinge)); put(u, FRONT, G + 2, door(facingOut, 1, hinge));
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
  const rails = [], railBlocks = [];
  for (let v = T0; v <= T1; v++) {
    const id = v === DET ? detector(railDir) : railId(railDir);
    if (v === DET) put(TU, v, G, LAMP());
    put(TU, v, G + 1, id);
    rails.push(pos(TU, v, G + 1)); railBlocks.push([...pos(TU, v, G + 1), id]);
  }
  put(TU + 1, DET, G + 1, LAMP());                         // the lamp beside it
  put(TU + 1, T1, G + 1, chestId(nameOf(neg(across))));    // the loading chest
  const siding = { detector: pos(TU, DET, G + 1), under: pos(TU, DET, G), beside: pos(TU + 1, DET, G + 1), cart: pos(TU, T0 + 1, G + 1), chest: pos(TU + 1, T1, G + 1) };
  sign(TU - 1, T0 - 1, G + 1, neg(back), 'Freight siding');

  const doorAt = at(mid, -1);
  return { kind: 'factory', lot, panel, master, bench, doors, plates, line, hopper: hop, chest, stations, rails, railBlocks, siding, chimneys,
    sideways: fr.sideways, wide: W, door: [doorAt[0], G + 1, doorAt[1]], frame: { at, W, D, H, TOP, FRONT, mid, BENCH_V, L0, L1, LU, TU, T0, T1, DET } };
}
