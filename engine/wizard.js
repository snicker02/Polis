// engine/wizard.js — the wizard's tower.
//
// A round tower of mossy stone brick, fifteen by fifteen with its garden, four
// floors six high and a pointed hat of a roof, in the lot's own frame (zoo.js:
// lotFrame: u across, v back from the street; c the middle):
//
// - the ground floor, the cauldron room: a great cauldron over a soul campfire in
//   the middle, cauldrons of water, lava and powder snow round the walls, a barrel
//   of buckets and bottles;
// - the first floor, the brewing lab: three brewing stands, blaze powder in each, a
//   cauldron of water to fill bottles from, chests of every ingredient;
// - the second floor, the enchanting library: the table in the middle with fifteen
//   bookshelves round it two away and two high (the most the table counts) and the
//   cells between left open, a gap at the back to come in by; lapis, books and
//   bottles o' enchanting in a chest; an anvil and a grindstone;
// - the top floor, the wizard's own room under the roof: a bed, a crafting table,
//   a furnace, an ender chest, chests; a spyglass to look out of the windows with.
//
// One ladder up the back wall from the ground to the top floor, through a hole in
// each floor. The roof: a brim of purpur stairs all round, then a cone of them
// rising to a point with an end rod on top. Every exposed top of the roof is a
// stair (nothing spawns on a stair), and each column of the cone is filled down far
// enough that no gap opens between the inside and the out.

import { MAT, MATERIALS, B, I, S, stairId, WEIRDO, chestId, furnaceId, grindstoneId, doorId, DIR } from './materials.js';
import { framed } from './townbits.js';
import { N } from './blockcore.js';

const item = (name, count, slot) => N.comp({ Count: N.byte(count), Damage: N.short(0), Name: N.str(name), Slot: N.byte(slot), WasPickedUp: N.byte(0) });
const mat = (block, color, states = {}, flags = {}) => MATERIALS.add(null, 'minecraft:' + block, color, states, flags);
const LADDERS = { north: MAT.LADDER_2, south: MAT.LADDER_3, west: MAT.LADDER_4, east: MAT.LADDER_5 };

export const WIZARD_SIZE = [15, 15];
export const WIZARD_P = 6;                          // the height of a floor
export const WIZARD_FLOORS = 4;
// inside the wall, and the wall itself (closed on every face: a step out of any cell
// inside lands inside or in the wall)
export const inTower = (du, dv) => du * du + dv * dv <= 25;
export const inWall = (du, dv) => { const d = du * du + dv * dv; return d > 25 && d <= 42; };

export function wizardTower(world, lot, face, cfg, rng, G, signTags) {
  const W = 15, D = 15, c = 7, P = WIZARD_P, NF = WIZARD_FLOORS;
  const F = framed(world, lot, face, W, D, G, signTags);
  if (!F) return null;
  const { put, clear, pos, sign, wallSign, FRONT, BACK, RIGHT, LEFT } = F;
  const floorY = (k) => G + k * P;                 // the floor of storey k (its top surface)
  const TOP = G + NF * P;                          // the brim of the roof, over the wall's last course
  const PEAK = 13;                                 // the cone's levels over the brim
  // (inward: the way from (u, v) to the middle, the axis that is further)
  const inward = (u, v) => { const du = c - u, dv = c - v; return Math.abs(du) >= Math.abs(dv) ? (du > 0 ? RIGHT : LEFT) : (dv > 0 ? BACK : FRONT); };

  for (let u = 0; u < W; u++) for (let v = 0; v < D; v++) for (let y = G + 1; y <= TOP + PEAK + 4; y++) clear(u, v, y);

  // ---- the garden: grass, a path to the door, flowers, lamps on posts at the corners
  const lights = [];
  for (let u = 0; u < W; u++) for (let v = 0; v < D; v++) {
    const du = u - c, dv = v - c;
    if (inTower(du, dv) || inWall(du, dv)) continue;
    put(u, v, G, u === c && v < c ? MAT.GRASS_PATH : MAT.GRASS);
  }
  for (const [u, v] of [[1, 1], [13, 1], [1, 13], [13, 13]]) { for (let y = G + 1; y <= G + 3; y++) put(u, v, y, MAT.FENCE); put(u, v, G + 4, MAT.LAMP); lights.push(pos(u, v, G + 4)); }
  for (const [u, v] of [[3, 1], [11, 1], [1, 4], [13, 4], [4, 0], [10, 0]]) put(u, v, G + 1, MAT.ALLIUM);

  // ---- the wall: mossy and cracked stone brick, up to the brim
  const STONES = [MAT.STONEBRICK, MAT.STONEBRICK, MAT.STONEBRICK, MAT.MOSSY_BRICK, MAT.CRACKED_BRICK];
  for (let u = 0; u < W; u++) for (let v = 0; v < D; v++) {
    const du = u - c, dv = v - c;
    if (!inWall(du, dv)) continue;
    for (let y = G; y < TOP; y++) put(u, v, y, STONES[Math.floor(rng() * STONES.length)]);
  }
  // the floors: stone brick on the ground, dark oak above, glowstone set in each
  // (lighting the room under it and the room over it); the ground floor's lights in
  // its floor too
  const GLOW = [[0, 0], [3, 3], [-3, 3], [3, -3], [-3, -3], [5, 0], [-5, 0], [0, -5]];
  for (let k = 0; k < NF; k++) {
    for (let u = 0; u < W; u++) for (let v = 0; v < D; v++) {
      const du = u - c, dv = v - c;
      if (!inTower(du, dv)) continue;
      put(u, v, floorY(k), k === 0 ? MAT.STONEBRICK : MAT.DARK_PLANKS);
    }
    for (const [du, dv] of GLOW) { if (k === 0 && du === 0 && dv === 0) continue; put(c + du, c + dv, floorY(k), MAT.GLOWSTONE); lights.push(pos(c + du, c + dv, floorY(k))); }
  }
  // windows: glass two high on every floor, on the sides and the corners between
  // (none at the back, where the ladder hangs; the front of the ground floor is the door)
  const windows = [];
  for (let k = 0; k < NF; k++) for (const [du, dv] of [[-6, 0], [6, 0], [0, -6], [-4, -4], [4, -4], [-4, 4], [4, 4]]) {
    if (k === 0 && du === 0 && dv === -6) continue;
    for (const y of [floorY(k) + 2, floorY(k) + 3]) { put(c + du, c + dv, y, MAT.GLASS); windows.push(pos(c + du, c + dv, y)); }
  }
  // the door, dark oak, in the front wall
  put(c, c - 6, G + 1, doorId('dark', DIR[FRONT], false));
  put(c, c - 6, G + 2, doorId('dark', DIR[FRONT], true));
  const frontDoor = pos(c, c - 6, G + 1);

  // ---- the ladder up the back wall, through a hole in every floor
  const ladder = [];
  for (let y = G + 1; y <= floorY(NF - 1); y++) { put(c, c + 5, y, LADDERS[FRONT]); ladder.push(pos(c, c + 5, y)); }

  // ---- the ground floor: the cauldron room
  const cauldrons = [];
  const CAMP = mat('soul_campfire', '#5fb4b8', { extinguished: B(0), 'minecraft:cardinal_direction': S('south') });
  const WATER_C = MAT.CAULDRON_FULL;
  const LAVA_C = mat('cauldron', '#c8521a', { cauldron_liquid: S('lava'), fill_level: I(6) });
  const SNOW_C = mat('cauldron', '#e6eef0', { cauldron_liquid: S('powder_snow'), fill_level: I(6) });
  put(c, c, G, CAMP); put(c, c, G + 1, WATER_C); cauldrons.push(pos(c, c, G + 1));            // the great cauldron, over a fire
  lights.push(pos(c, c, G));
  for (const [du, dv, id] of [[-4, -2, WATER_C], [4, -2, LAVA_C], [-4, 2, SNOW_C], [4, 2, WATER_C], [-2, 4, WATER_C], [2, 4, LAVA_C]]) {
    put(c + du, c + dv, G + 1, id); cauldrons.push(pos(c + du, c + dv, G + 1));
  }
  const barrels = [];
  {
    const [u, v] = [c - 3, c - 4];
    put(u, v, G + 1, mat('barrel', '#7d5a34', { facing_direction: I(1), open_bit: B(0) }));
    const [x, z] = F.fr.at(u, v);
    world.setData(x, G + 1, z, { id: 'Barrel', tags: { Items: N.list(10, [item('minecraft:bucket', 4, 0), item('minecraft:water_bucket', 1, 1), item('minecraft:glass_bottle', 16, 2)]) } });
    barrels.push(pos(u, v, G + 1));
  }

  // ---- the first floor: the brewing lab
  const y1 = floorY(1) + 1;
  const brewing = [], chests = [];
  for (const [du, dv] of [[-2, -4], [0, -4], [2, -4]]) {
    put(c + du, c + dv, y1, MAT.BREWING);
    const [x, z] = F.fr.at(c + du, c + dv);
    world.setData(x, y1, z, { id: 'BrewingStand', tags: { Items: N.list(10, [item('minecraft:blaze_powder', 8, 4)]) } });
    brewing.push(pos(c + du, c + dv, y1));
  }
  put(c - 4, c - 1, y1, WATER_C); cauldrons.push(pos(c - 4, c - 1, y1));
  const chest = (u, v, y, items) => {
    put(u, v, y, chestId(inward(u, v)));
    const [x, z] = F.fr.at(u, v);
    world.setData(x, y, z, { id: 'Chest', tags: { Items: N.list(10, items.map(([n, k], s) => item('minecraft:' + n, k, s))) } });
    chests.push(pos(u, v, y));
  };
  chest(c + 4, c - 1, y1, [['nether_wart', 64], ['blaze_powder', 32], ['glass_bottle', 48], ['redstone', 32], ['glowstone_dust', 32],
    ['gunpowder', 16], ['fermented_spider_eye', 16], ['dragon_breath', 4]]);
  chest(c + 4, c + 1, y1, [['sugar', 32], ['spider_eye', 16], ['magma_cream', 16], ['golden_carrot', 16], ['glistering_melon_slice', 16],
    ['rabbit_foot', 8], ['ghast_tear', 8], ['phantom_membrane', 8], ['pufferfish', 8], ['turtle_helmet', 1]]);
  chest(c - 4, c + 1, y1, [['nether_wart', 64], ['glass_bottle', 32], ['water_bucket', 1]]);

  // ---- the second floor: the enchanting library
  const y2 = floorY(2) + 1;
  const table = pos(c, c, y2);
  put(c, c, y2, mat('enchanting_table', '#5a2a6a'));
  const shelves = [];
  for (let du = -2; du <= 2; du++) for (let dv = -2; dv <= 2; dv++) {
    if (Math.max(Math.abs(du), Math.abs(dv)) !== 2) continue;
    if (du === 0 && dv === 2) continue;                              // the way in, from the ladder
    for (const y of [y2, y2 + 1]) { put(c + du, c + dv, y, MAT.BOOKSHELF); shelves.push(pos(c + du, c + dv, y)); }
  }
  for (const [du, dv] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { put(c + du, c + dv, y2 + 2, MAT.LAMP); lights.push(pos(c + du, c + dv, y2 + 2)); }
  // more shelves round the wall, either side of the windows
  for (const [du, dv] of [[-4, -2], [-4, -1], [4, -2], [4, -1], [-1, -4], [1, -4]]) for (const y of [y2, y2 + 1, y2 + 2]) put(c + du, c + dv, y, MAT.BOOKSHELF);
  const ANVIL = MAT.ANVIL;
  put(c + 4, c + 2, y2, ANVIL);
  const anvil = pos(c + 4, c + 2, y2);
  put(c - 4, c + 2, y2, grindstoneId(inward(c - 4, c + 2)));
  chest(c - 3, c - 3, y2, [['lapis_lazuli', 64], ['lapis_lazuli', 64], ['book', 16], ['experience_bottle', 64], ['experience_bottle', 64]]);

  // ---- the top floor: the wizard's room, under the roof
  const y3 = floorY(3) + 1;
  F.bed(c - 3, c + 2, y3, F.neg(F.fr.across), 10);                   // (foot by the middle, head to the wall)
  put(c - 4, c - 2, y3, MAT.CRAFTING);
  put(c - 3, c - 3, y3, furnaceId('furnace', inward(c - 3, c - 3)));
  put(c + 3, c - 3, y3, mat('ender_chest', '#2b3b3b', { 'minecraft:cardinal_direction': S(inward(c + 3, c - 3)) }));
  chest(c + 4, c - 1, y3, [['spyglass', 1], ['bread', 16], ['torch', 32], ['book', 8], ['feather', 8], ['ink_sac', 8]]);
  chest(c + 4, c + 1, y3, [['amethyst_shard', 16], ['ender_pearl', 8], ['clock', 1], ['compass', 1], ['map', 1]]);

  // ---- the roof: a brim, then the cone, every top a stair rising inward
  const R = (k) => (k === 0 ? 7.05 : 5.0 - 0.42 * (k - 1));          // the radius of level k
  const levelOf = (u, v) => {                                        // the level whose ring holds this column
    const d = Math.hypot(u - c, v - c);
    if (d > R(0)) return -1;
    for (let k = 0; k <= PEAK; k++) if (k === PEAK || d > R(k + 1)) return k;
    return PEAK;
  };
  const roof = [];
  const kOf = new Map();
  for (let u = 0; u < W; u++) for (let v = 0; v < D; v++) kOf.set(u + ',' + v, levelOf(u, v));
  for (let u = 0; u < W; u++) for (let v = 0; v < D; v++) {
    const k = kOf.get(u + ',' + v);
    if (k < 0) continue;
    const y = TOP + k;
    if (u === c && v === c) { put(u, v, y, mat('purpur_block', '#a97ca9', { pillar_axis: S('y') })); put(u, v, y + 1, mat('end_rod', '#f2eee4', { facing_direction: I(1) })); lights.push(pos(u, v, y + 1)); roof.push(pos(u, v, y)); }
    else { put(u, v, y, stairId('purpur', WEIRDO[inward(u, v)])); roof.push(pos(u, v, y)); }
    // closed: fill down to just over the lowest neighbour's ring (inside the wall's
    // own column, down to the brim)
    let low = k;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = kOf.get((u + a) + ',' + (v + b));
      const kn = n === undefined || n < 0 ? 0 : n;
      low = Math.min(low, kn + 1);
    }
    if (!inTower(u - c, v - c) && !inWall(u - c, v - c)) low = k;    // (the brim's overhang hangs free)
    for (let yy = TOP + low; yy < y; yy++) put(u, v, yy, mat('purpur_block', '#a97ca9', { pillar_axis: S('y') }));
  }
  // lights hung inside the roof, over the top floor (the hat is tall: well over heads)
  for (const [du, dv] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
    const u = c + du, v = c + dv, k = kOf.get(u + ',' + v);
    const yy = TOP + k - 1;
    const [x, z] = F.fr.at(u, v);
    if (yy > y3 + 2 && !world.has(x, yy, z)) { put(u, v, yy, MAT.SOUL_LAMP_HANG); lights.push(pos(u, v, yy)); }
  }

  sign(c - 2, 0, G + 1, F.neg(F.fr.back), "Wizard's Tower\ncauldrons, brewing\nenchanting: ladder\nat the back");
  void wallSign; void BACK;
  return { kind: 'wizard', lot, frontDoor, table, shelves, brewing, cauldrons, barrels, chests, anvil, ladder, windows, roof, lights,
    sideways: F.fr.sideways, door: pos(c, -1, G + 1), frame: { at: F.fr.at, c, P, NF, G, TOP, PEAK, floorY: [0, 1, 2, 3].map(floorY) } };
}
