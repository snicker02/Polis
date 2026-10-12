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
import { N } from './blockcore.js';

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
//   xylophone), each played by a button on a key block before it (a note block
//   sounds only with air above it);
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
  // (a note block sounds only with air above it: a button on top of it took that
  // space, and the bench was silent. So each has a key block in front of it, on the
  // player's side, the button on the key: the button powers the key, the key the
  // note block beside it; no key touches another note block)
  sounds.forEach(([name, under], i) => {
    const u = 1 + i;
    put(u, 3, G, under); put(u, 3, G + 1, NOTE());
    put(u, 2, G + 1, MAT.SMOOTH_QUARTZ); put(u, 2, G + 2, buttonUp());
    notes.push({ name, under: pos(u, 3, G), note: pos(u, 3, G + 1), key: pos(u, 2, G + 1), button: pos(u, 2, G + 2) });
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

// ---- the mill: a sugar cane farm, an observer clock, an item sorter ------------------------
// Thirteen by fifteen (as the workshop), stone brick, six clear inside, a skylight over
// the farm; with the factory, on the nearest lot that takes it. Each machine as the plainest working
// design (Bedrock's own block states throughout: a piston's facing counts south 2,
// north 3, east 4, west 5; an observer faces the way it watches, and sends its pulse
// out of its back; a repeater's or comparator's direction points from its output to
// its input; a wall torch names the side its block is on):
//
// - The sugar cane farm, along the back: a row of cane on dirt, a channel of water
//   before it (the cane's water, and a stream carrying the harvest to a hopper at its
//   end, into a barrel). Behind each cane, at its second block, a piston facing it;
//   on the piston an observer watching the cane's third block; behind the observers a
//   line of dust on blocks, beside the pistons. Cane grows three high: the observer
//   pulses, the dust powers the blocks under it, the pistons fire and break the cane
//   at its second block, pushing the stalk out over the stream; the top falls.
//   (The observer watches the third block, never the cell a piston head goes into, so
//   it does not set itself off again and again.)
// - The observer clock: two observers facing each other, each set off by the other,
//   over and over, as fast as redstone goes. One of them rides a sticky piston worked
//   by a lever: lever on, the piston lifts it into line and the clock runs (a lamp on
//   one observer's back, a note block on the other's); lever off, it drops out of line
//   and the clock stops.
// - The item sorter: a line of hoppers along the top, carrying what goes into the
//   chest at its head, past four filters. Each filter hopper under the line holds 41 of
//   its item and four named sticks; it points into a comparator, so it never empties
//   itself. A comparator reads it at 2; one more of its item makes 3, enough to reach
//   along three dust and set off a repeater, which powers the block a torch hangs on:
//   the torch goes out, the block above it no longer powered, and the hopper under the
//   filter, locked till then, takes one item and puts it in the chest before it. Back
//   to 41, the comparator falls to 2, the torch comes on again and locks it. Whatever
//   matches no filter goes on to a barrel at the end of the line.
export const MILL_SIZE = [13, 15];
export const SORTED = [['minecraft:sugar_cane', 'Sugar cane'], ['minecraft:coal', 'Coal'], ['minecraft:iron_ingot', 'Iron ingots'], ['minecraft:cobblestone', 'Cobblestone']];
export const FILTER = { item: 41, named: 4, name: 'Polis filter' };
export const MILL_LANTERNS = [[2, 1], [10, 1], [6, 2], [1, 6], [11, 6], [6, 6], [3, 8], [9, 8], [10, 12], [1, 9], [10, 9]];
export const MILL_FLOOR_LIGHTS = [[1, 2], [11, 2], [1, 7], [11, 7], [6, 8], [10, 13]];
// Bedrock's piston facing (south 2, north 3, east 4, west 5); the usual one elsewhere
const PISTON_FACING = { down: 0, up: 1, south: 2, north: 3, east: 4, west: 5 };
const pistonId = (dir, sticky = false) => MATERIALS.add(null, sticky ? 'minecraft:sticky_piston' : 'minecraft:piston', sticky ? '#7a8a6a' : '#8a8a7a', { facing_direction: I(PISTON_FACING[dir]) });
const observerId = (watches) => MATERIALS.add(null, 'minecraft:observer', '#5e5e5e', { 'minecraft:facing_direction': S(watches), powered_bit: B(0) });
const comparatorId = (toInput) => MATERIALS.add(null, 'minecraft:unpowered_comparator', '#b8b0a8', { 'minecraft:cardinal_direction': S(toInput), output_lit_bit: B(0), output_subtract_bit: B(0) }, { passable: true, flat: true });
const repeaterId = (toInput) => MATERIALS.add(null, 'minecraft:unpowered_repeater', '#b8a8a8', { 'minecraft:cardinal_direction': S(toInput), repeater_delay: I(0) }, { passable: true, flat: true });
const redTorchId = (side) => MATERIALS.add(null, 'minecraft:redstone_torch', '#d03020', { torch_facing_direction: S(side) }, { passable: true, transparent: true });
const CANE = () => MATERIALS.add(null, 'minecraft:reeds', '#8fcf5a', { age: I(0) }, { passable: true, transparent: true });
const barrelId = (dir) => MATERIALS.add(null, 'minecraft:barrel', '#7d5a34', { facing_direction: I(FACING_NUM[dir]), open_bit: B(0) });
const hopperTo = (dir) => hopper(dir === 'down' ? 0 : FACING_NUM[dir]);
const item = (name, count, slot, custom) => N.comp({ Count: N.byte(count), Damage: N.short(0), Name: N.str(name), Slot: N.byte(slot), WasPickedUp: N.byte(0),
  ...(custom ? { tag: N.comp({ display: N.comp({ Name: N.str(custom) }) }) } : {}) });

export function mill(world, lot, face, cfg, rng, G, signTags) {
  const [W, D] = MILL_SIZE, H = 6, TOP = G + H + 1, mid = 6;
  const fr = lotFrame(lot, face, W, D);
  if (!fr) return null;
  const h = helpers(world, fr, G, signTags);
  const { at, put, clear, neg, sign, nameOf } = h;
  const back = fr.back, across = fr.across;
  const BACK = nameOf(back), FRONT_ = nameOf(neg(back)), RIGHT = nameOf(across), LEFT = nameOf(neg(across));
  const pos = (u, v, y) => { const [x, z] = at(u, v); return [x, y, z]; };
  // ---- the hall ------------------------------------------------------------------------------
  const Vc = D - 4;                                  // the cane's row
  for (let v = 0; v < D; v++) for (let u = 0; u < W; u++) {
    for (let y = G + 1; y <= TOP + 2; y++) clear(u, v, y);
    put(u, v, G - 1, MAT.STONEBRICK); put(u, v, G, MAT.SMOOTH);
    // (glass over the farm, every other row: daylight on the cane)
    put(u, v, TOP, v >= Vc - 2 && v <= Vc + 1 && u >= 1 && u <= 9 && (v + u) % 2 === 0 ? MAT.GLASS : MAT.SMOOTH);
    if (u === 0 || u === W - 1 || v === 0 || v === D - 1) for (let y = G + 1; y < TOP; y++) put(u, v, y, MAT.STONEBRICK);
  }
  for (let u = mid - 1; u <= mid + 1; u++) for (let y = G + 1; y <= G + 3; y++) clear(u, 0, y);
  for (const v of [5, 9]) for (let y = G + 4; y <= G + 5; y++) { put(0, v, y, MAT.GLASS); put(W - 1, v, y, MAT.GLASS); }

  // ---- the sugar cane farm, along the back ----------------------------------------------------
  // (v: Vc - 2 the channel's lip, Vc - 1 the channel, Vc the cane, Vc + 1 pistons and
  // observers, Vc + 2 the dust; the bed raised a block, so the barrel stands on the floor)
  const CANE_U = [1, 2, 3, 4, 5, 6, 7], END = 8;
  const farm = { canes: [], water: [], pistons: [], observers: [], dust: [] };
  for (let u = 1; u <= END + 1; u++) for (let v = Vc - 2; v <= Vc + 2; v++) put(u, v, G + 1, MAT.STONEBRICK);
  for (let u = 1; u <= END; u++) {
    // the channel: its source at the head, the stream a step shallower each block on;
    // its lip of glass before it
    const d = u - 1;
    put(u, Vc - 1, G + 2, water(d, d > 0)); farm.water.push(pos(u, Vc - 1, G + 2));
    put(u, Vc - 2, G + 2, MAT.GLASS);
  }
  put(END + 1, Vc - 1, G + 2, MAT.GLASS); put(END + 1, Vc - 2, G + 2, MAT.GLASS); put(END, Vc, G + 2, MAT.STONEBRICK);
  // the hopper under the stream's end, into the barrel before it
  put(END, Vc - 1, G + 1, hopperTo(FRONT_)); put(END, Vc - 2, G + 1, barrelId(FRONT_));
  farm.hopper = pos(END, Vc - 1, G + 1); farm.barrel = pos(END, Vc - 2, G + 1);
  for (const u of CANE_U) {
    put(u, Vc, G + 2, MAT.DIRT); put(u, Vc, G + 3, CANE());
    for (let y = G + 2; y <= G + 3; y++) put(u, Vc + 1, y, MAT.STONEBRICK);
    put(u, Vc + 1, G + 4, pistonId(FRONT_));                 // at the cane's second block, facing it
    put(u, Vc + 1, G + 5, observerId(FRONT_));               // on it, watching the cane's third
    for (let y = G + 2; y <= G + 4; y++) put(u, Vc + 2, y, MAT.STONEBRICK);
    put(u, Vc + 2, G + 5, DUST());                           // behind the observer, on a block beside the piston
    farm.canes.push({ dirt: pos(u, Vc, G + 2), base: pos(u, Vc, G + 3), second: pos(u, Vc, G + 4), third: pos(u, Vc, G + 5) });
    farm.pistons.push(pos(u, Vc + 1, G + 4)); farm.observers.push(pos(u, Vc + 1, G + 5)); farm.dust.push(pos(u, Vc + 2, G + 5));
  }
  sign(9, Vc - 3, G + 1, neg(back), 'Sugar cane farm\nthe harvest goes\ninto the barrel');

  // ---- the item sorter, inside the door ---------------------------------------------------------
  // (v: VS - 1 the chests, VS the hoppers, VS + 1 .. VS + 4 the redstone behind)
  const VS = 3, COLS = [3, 5, 7, 9], L0 = 2, L1 = 10;
  const sorter = { line: [], columns: [] };
  for (let u = L0; u <= L1; u++) { put(u, VS, G + 3, hopperTo(u < L1 ? RIGHT : 'down')); sorter.line.push(pos(u, VS, G + 3)); }
  for (let u = L0; u <= L1; u++) if (!COLS.includes(u)) { put(u, VS, G + 1, MAT.SMOOTH); put(u, VS, G + 2, MAT.GLASS); }
  // the chest at its head (put things in it); the barrel at its end (what matches no filter)
  put(L0, VS, G + 4, chestId(FRONT_)); sorter.input = pos(L0, VS, G + 4);
  put(L1, VS, G + 2, barrelId(FRONT_)); sorter.overflow = pos(L1, VS, G + 2);
  COLS.forEach((u, k) => {
    const [name, label] = SORTED[k];
    put(u, VS - 1, G + 1, chestId(FRONT_));                         // its chest
    put(u, VS, G + 1, hopperTo(FRONT_));                            // the locked hopper, into the chest
    put(u, VS, G + 2, hopperTo(BACK));                              // the filter, into the comparator (so never out)
    const [fx, fz] = at(u, VS);
    world.setData(fx, G + 2, fz, { id: 'Hopper', tags: { Items: N.list(10, [item(name, FILTER.item, 0), ...[1, 2, 3, 4].map((s) => item('minecraft:stick', 1, s, FILTER.name))]) } });
    for (let v = VS + 1; v <= VS + 4; v++) put(u, v, G - 1, MAT.STONEBRICK);
    put(u, VS + 1, G, redTorchId(BACK));                            // the torch, on the block behind it
    put(u, VS + 1, G + 1, MAT.STONEBRICK);                          // the block it powers, beside the locked hopper
    put(u, VS + 1, G + 2, comparatorId(FRONT_));                    // reading the filter
    put(u, VS + 2, G, MAT.STONEBRICK);                              // the torch's block
    put(u, VS + 2, G + 1, MAT.STONEBRICK); put(u, VS + 2, G + 2, DUST());
    put(u, VS + 3, G, repeaterId(BACK));                            // into the torch's block
    put(u, VS + 3, G + 1, MAT.STONEBRICK); put(u, VS + 3, G + 2, DUST());
    put(u, VS + 4, G, MAT.STONEBRICK); put(u, VS + 4, G + 1, DUST()); // the third dust, on the block behind the repeater
    sign(u, VS - 2, G + 1, neg(back), label);
    sorter.columns.push({ item: name, label, chest: pos(u, VS - 1, G + 1), locked: pos(u, VS, G + 1), filter: pos(u, VS, G + 2), torch: pos(u, VS + 1, G),
      lockBlock: pos(u, VS + 1, G + 1), comparator: pos(u, VS + 1, G + 2), torchBlock: pos(u, VS + 2, G), dust: [pos(u, VS + 2, G + 2), pos(u, VS + 3, G + 2), pos(u, VS + 4, G + 1)],
      repeater: pos(u, VS + 3, G), repeaterIn: pos(u, VS + 4, G), line: pos(u, VS, G + 3) });
  });
  sign(1, VS - 1, G + 1, neg(back), 'Item sorter\nput things in the\nchest at the top');

  // ---- the observer clock, beside the farm --------------------------------------------------------
  // (along v at the right wall: the lamp, the fixed observer watching back, the sticky
  // piston with the rider on it watching forward, the note block; the lever's console
  // beside the piston)
  const CU = W - 2, CV = Vc - 1;              // the column; the fixed observer's row
  put(CU, CV - 1, G + 1, MAT.STONEBRICK); put(CU, CV - 1, G + 2, MAT.STONEBRICK); put(CU, CV - 1, G + 3, LAMP());
  put(CU, CV, G + 1, MAT.STONEBRICK); put(CU, CV, G + 2, MAT.STONEBRICK); put(CU, CV, G + 3, observerId(BACK));
  put(CU, CV + 1, G + 1, pistonId('up', true)); put(CU, CV + 1, G + 2, observerId(FRONT_));   // the rider, out of line till the piston lifts it
  put(CU, CV + 2, G + 1, MAT.STONEBRICK); put(CU, CV + 2, G + 2, MAT.GLASS); put(CU, CV + 2, G + 3, NOTE());
  put(CU - 1, CV + 1, G + 1, MAT.SMOOTH_QUARTZ); put(CU - 1, CV + 1, G + 2, lever(back[0] !== 0 ? 'up_north_south' : 'up_east_west'));
  const clock = { lamp: pos(CU, CV - 1, G + 3), fixed: pos(CU, CV, G + 3), piston: pos(CU, CV + 1, G + 1), rider: pos(CU, CV + 1, G + 2), inLine: pos(CU, CV + 1, G + 3),
    note: pos(CU, CV + 2, G + 3), console: pos(CU - 1, CV + 1, G + 1), lever: pos(CU - 1, CV + 1, G + 2) };
  sign(CU - 1, CV - 1, G + 1, neg(back), 'Observer clock\npull the lever');

  // ---- the lights: lanterns hung from the ceiling clear of the machines, lights set in
  // the floor of the walks -------------------------------------------------------------------------
  const lanterns = [];
  for (const [u, v] of MILL_LANTERNS) {
    if ([1, 2, 3, 4].some((d) => world.has(...pos(u, v, TOP - d)))) continue;
    put(u, v, TOP - 1, MAT.LAMP_HANG); lanterns.push(pos(u, v, TOP - 1));
  }
  for (const [u, v] of MILL_FLOOR_LIGHTS) { put(u, v, G, MAT.SHROOMLIGHT); lanterns.push(pos(u, v, G)); }
  const doorAt = at(mid, -1);
  return { kind: 'mill', lot, farm, sorter, clock, lanterns, sideways: fr.sideways,
    door: [doorAt[0], G + 1, doorAt[1]], frame: { at, W, D, H, TOP, mid, Vc, VS, CU, CV } };
}
