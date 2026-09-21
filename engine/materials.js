// engine/materials.js — block palette for Polis.
//
// Every material is (bedrock block id, block states, preview colour).
// Block ids are the FLATTENED modern Bedrock ids (1.21+). If a future
// version renames one, this table is the only place to edit.

export const B = (v) => ({ type: 'byte', value: v | 0 });
export const I = (v) => ({ type: 'int', value: v | 0 });
export const S = (v) => ({ type: 'string', value: String(v) });

const hex = (h) => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];

function stateKey(states) {
  const keys = Object.keys(states).sort();
  return keys.map((k) => `${k}=${states[k].type}:${states[k].value}`).join(',');
}

class Registry {
  constructor() {
    this.defs = [];
    this.byKey = new Map();
    this.byName = new Map();
  }
  add(name, block, color, states = {}, flags = {}) {
    const key = block + '|' + stateKey(states);
    let id = this.byKey.get(key);
    if (id === undefined) {
      id = this.defs.length;
      this.defs.push({
        id, name, block, states, color: hex(color),
        passable: !!flags.passable,      // player can walk through (doors, flowers, crops, carpet)
        transparent: !!flags.transparent, // preview-only hint
        flowable: !!flags.flowable,      // water flows into / washes away this block
        version: flags.version || 0,     // palette version tag; 0 = default (1.21.60)
        flat: !!flags.flat,              // preview draws it as a thin plate (rails, carpet)
      });
      this.byKey.set(key, id);
    }
    if (name && !this.byName.has(name)) this.byName.set(name, id);
    return id;
  }
  def(id) { return this.defs[id]; }
  color(id) { return this.defs[id].color; }
  isPassable(id) { return id >= 0 && this.defs[id].passable; }
  get length() { return this.defs.length; }
}

export const MATERIALS = new Registry();
const A = (n, b, c, st, fl) => MATERIALS.add(n, b, c, st, fl);

export const MAT = {
  // Never placed in the world; only written into exported structures when
  // "fill air" is on, so empty cells overwrite whatever terrain was there.
  AIR:         A('AIR', 'minecraft:air', '#000000', {}, { passable: true, transparent: true }),

  // ---- ground & street ----
  BASE:        A('BASE', 'minecraft:stone', '#7d7d7d'),
  DIRT:        A('DIRT', 'minecraft:dirt', '#7a5b3c'),
  GRASS:       A('GRASS', 'minecraft:grass_block', '#6a9c3f'),
  ASPHALT:     A('ASPHALT', 'minecraft:gray_concrete', '#4b4f52'),
  ASPHALT_DK:  A('ASPHALT_DK', 'minecraft:black_concrete', '#1b1d20'),
  SIDEWALK:    A('SIDEWALK', 'minecraft:light_gray_concrete', '#9aa0a1'),
  CURB:        A('CURB', 'minecraft:smooth_stone', '#b0b0b0'),
  LINE:        A('LINE', 'minecraft:yellow_concrete', '#d5b31f'),
  CROSSWALK:   A('CROSSWALK', 'minecraft:white_concrete', '#dfe3e4'),
  PATH:        A('PATH', 'minecraft:sandstone', '#d9cfa0'),

  // ---- generic structure ----
  GLASS:       A('GLASS', 'minecraft:glass', '#b4dbe6', {}, { transparent: true }),
  TINTED:      A('TINTED', 'minecraft:tinted_glass', '#2c3a44', {}, { transparent: true }),
  PANE:        A('PANE', 'minecraft:glass_pane', '#c2e2ec', {}, { transparent: true }),
  IRON:        A('IRON', 'minecraft:iron_block', '#d8d8d8'),
  BARS:        A('BARS', 'minecraft:iron_bars', '#6f7478'),
  LANTERN:     A('LANTERN', 'minecraft:sea_lantern', '#e6f2ec'),
  GLOWSTONE:   A('GLOWSTONE', 'minecraft:glowstone', '#f2d28a'),

  // ---- walls / floors ----
  QUARTZ:      A('QUARTZ', 'minecraft:quartz_block', '#e8e3da', { pillar_axis: S('y') }),
  SMOOTH:      A('SMOOTH', 'minecraft:smooth_stone', '#a8a8a8'),
  STONEBRICK:  A('STONEBRICK', 'minecraft:stone_bricks', '#7b7b75'),
  DEEPSLATE:   A('DEEPSLATE', 'minecraft:deepslate_tiles', '#35353a'),
  BRICK:       A('BRICK', 'minecraft:brick_block', '#965a4c'),
  SANDSTONE:   A('SANDSTONE', 'minecraft:sandstone', '#dfd5a0'),
  OAK:         A('OAK', 'minecraft:oak_planks', '#b18c53'),
  SPRUCE:      A('SPRUCE', 'minecraft:spruce_planks', '#7a5c37'),
  C_WHITE:     A('C_WHITE', 'minecraft:white_concrete', '#cfd5d6'),
  C_LGRAY:     A('C_LGRAY', 'minecraft:light_gray_concrete', '#8f9698'),
  C_GRAY:      A('C_GRAY', 'minecraft:gray_concrete', '#4b4f52'),
  C_BLACK:     A('C_BLACK', 'minecraft:black_concrete', '#1b1d20'),
  C_BLUE:      A('C_BLUE', 'minecraft:blue_concrete', '#2c368c'),
  C_CYAN:      A('C_CYAN', 'minecraft:cyan_concrete', '#157a8a'),
  C_RED:       A('C_RED', 'minecraft:red_concrete', '#8d2121'),
  C_ORANGE:    A('C_ORANGE', 'minecraft:orange_concrete', '#c06a10'),
  C_GREEN:     A('C_GREEN', 'minecraft:green_concrete', '#4f6a1c'),

  // ---- nature ----
  LOG:         A('LOG', 'minecraft:oak_log', '#6b5433', { pillar_axis: S('y') }),
  LEAVES:      A('LEAVES', 'minecraft:oak_leaves', '#4f8a33',
                 { persistent_bit: B(1), update_bit: B(0) }),
  SPRUCE_LOG:  A('SPRUCE_LOG', 'minecraft:spruce_log', '#4c3a22', { pillar_axis: S('y') }),
  SPRUCE_LEAF: A('SPRUCE_LEAF', 'minecraft:spruce_leaves', '#3f6b3a',
                 { persistent_bit: B(1), update_bit: B(0) }),
  WATER:       A('WATER', 'minecraft:water', '#3a63c0', { liquid_depth: I(0) }, { transparent: true }),
};

// ---- life: farms, water, plants, furniture, workstations --------------------
// Every id and state below was checked against Microsoft's Bedrock block list
// (learn.microsoft.com, vanilla listings, 2026-08) or is already proven in game.
const PLANT = { passable: true, flowable: true, transparent: true };
const RUG = { passable: true, flowable: true, flat: true };
Object.assign(MAT, {
  FARMLAND:    A('FARMLAND', 'minecraft:farmland', '#5b3b1f', { moisturized_amount: I(7) }),
  GRASS_PATH:  A('GRASS_PATH', 'minecraft:grass_path', '#9b7f4c'),
  CLAY:        A('CLAY', 'minecraft:clay', '#9fa5b1'),
  COMPOSTER:   A('COMPOSTER', 'minecraft:composter', '#7a5530', { composter_fill_level: I(0) }),
  CRAFTING:    A('CRAFTING', 'minecraft:crafting_table', '#9c6b3c'),
  BOOKSHELF:   A('BOOKSHELF', 'minecraft:bookshelf', '#8a6a3e'),
  BARREL:      A('BARREL', 'minecraft:barrel', '#7d5a34', { facing_direction: I(1), open_bit: B(0) }),
  CARTOGRAPHY: A('CARTOGRAPHY', 'minecraft:cartography_table', '#6b5a45'),
  FLETCHING:   A('FLETCHING', 'minecraft:fletching_table', '#c2ab7a'),
  BREWING:     A('BREWING', 'minecraft:brewing_stand', '#8b7a5c',
                 { brewing_stand_slot_a_bit: B(0), brewing_stand_slot_b_bit: B(0), brewing_stand_slot_c_bit: B(0) }),
  CAULDRON:    A('CAULDRON', 'minecraft:cauldron', '#3f3f44', { cauldron_liquid: S('water'), fill_level: I(0) }),
  BELL:        A('BELL', 'minecraft:bell', '#e2b93b', { attachment: S('standing'), direction: I(0), toggle_bit: B(0) }),
  AZALEA:      A('AZALEA', 'minecraft:azalea', '#5f7d2e'),
  AZALEA_FL:   A('AZALEA_FL', 'minecraft:flowering_azalea', '#7d6b8a'),
  DANDELION:   A('DANDELION', 'minecraft:dandelion', '#e8d23a', {}, PLANT),
  CORNFLOWER:  A('CORNFLOWER', 'minecraft:cornflower', '#4f6fd6', {}, PLANT),
  ALLIUM:      A('ALLIUM', 'minecraft:allium', '#b169d8', {}, PLANT),
  AZURE_BLUET: A('AZURE_BLUET', 'minecraft:azure_bluet', '#dfe6ee', {}, PLANT),
  BLUE_ORCHID: A('BLUE_ORCHID', 'minecraft:blue_orchid', '#3aa2d6', {}, PLANT),
  CARPET_BLUE: A('CARPET_BLUE', 'minecraft:blue_carpet', '#35399d', {}, RUG),
  CARPET_CYAN: A('CARPET_CYAN', 'minecraft:cyan_carpet', '#158991', {}, RUG),
  CARPET_BROWN:A('CARPET_BROWN', 'minecraft:brown_carpet', '#724728', {}, RUG),
  CARPET_GRAY: A('CARPET_GRAY', 'minecraft:gray_carpet', '#3e4447', {}, RUG),
});
export const FLOWERS = [MAT.DANDELION, MAT.CORNFLOWER, MAT.ALLIUM, MAT.AZURE_BLUET, MAT.BLUE_ORCHID];
export const CARPETS = [MAT.CARPET_BLUE, MAT.CARPET_CYAN, MAT.CARPET_BROWN, MAT.CARPET_GRAY];

// crops: wheat / carrots / beetroot, growth 0..7
const CROP_BLOCKS = {
  wheat: ['minecraft:wheat', '#c9b64a'],
  carrots: ['minecraft:carrots', '#e08a2c'],
  beetroot: ['minecraft:beetroot', '#9c2f3a'],
};
export const CROP_KINDS = Object.keys(CROP_BLOCKS);
export function cropId(kind, growth) {
  const [block, color] = CROP_BLOCKS[kind] || CROP_BLOCKS.wheat;
  return MATERIALS.add(null, block, color, { growth: I(Math.max(0, Math.min(7, growth))) }, PLANT);
}

// Beds: direction is where the head lies from the foot, using the legacy
// numbering Bedrock inherited: 0 = south (+z), 1 = west (-x), 2 = north (-z),
// 3 = east (+x). Colour lives in the bed's block entity (see VoxelWorld.setData).
export const BED_DIR = { south: 0, west: 1, north: 2, east: 3 };
export const BED_VEC = [[0, 1], [-1, 0], [0, -1], [1, 0]];
export function bedId(dir, head) {
  return MATERIALS.add(null, 'minecraft:bed', '#b8312f', {
    direction: I(dir), head_piece_bit: B(head ? 1 : 0), occupied_bit: B(0),
  });
}

// Furnace family: minecraft:cardinal_direction = the way the front faces.
// (Valid at 1.21.60, so no special version tag is needed.)
export function furnaceId(kind, facing) {
  const block = kind === 'blast' ? 'minecraft:blast_furnace' : 'minecraft:furnace';
  return MATERIALS.add(null, block, kind === 'blast' ? '#4f4f55' : '#6e6e6e',
    { 'minecraft:cardinal_direction': S(facing) });
}

// ---- transit: rails, powered rails, railbed --------------------------------
// rail_direction (from Bedrock's own Java->Bedrock tables): 0 north-south,
// 1 east-west, 2 ascending east, 3 ascending west, 4 ascending north,
// 5 ascending south. A powered rail on a redstone block is permanently on.
// Curves (plain rails only): 6 south-east, 7 south-west, 8 north-west,
// 9 north-east, also confirmed against Bedrock's Java->Bedrock table.
export const RAIL = { NS: 0, EW: 1, UP_E: 2, UP_W: 3, UP_N: 4, UP_S: 5, SE: 6, SW: 7, NW: 8, NE: 9 };
const FLAT = { passable: true, flowable: true, flat: true };
export function railId(dir) {
  return MATERIALS.add(null, 'minecraft:rail', '#8d7b62', { rail_direction: I(dir) }, FLAT);
}
export function poweredRailId(dir) {
  return MATERIALS.add(null, 'minecraft:golden_rail', '#d8b13a',
    { rail_data_bit: B(1), rail_direction: I(dir) }, FLAT);
}
Object.assign(MAT, {
  REDSTONE:  A('REDSTONE', 'minecraft:redstone_block', '#a1170f'),
  GRAVEL:    A('GRAVEL', 'minecraft:gravel', '#857c78'),
});

// ---- doors -----------------------------------------------------------------
// Bedrock door states: direction (0=east,1=south,2=west,3=north),
// door_hinge_bit, open_bit, upper_block_bit.
//
// Bedrock block names, which are NOT all the Java names: the oak door is
// still minecraft:wooden_door in Bedrock (minecraft:oak_door does not exist
// there and loads as a broken block). Only doors a player can open by hand
// are used — an iron door needs redstone, so it is deliberately absent.
const DOOR_BLOCKS = {
  oak:      ['minecraft:wooden_door',   '#a9803f'],
  spruce:   ['minecraft:spruce_door',   '#6d5232'],
  birch:    ['minecraft:birch_door',    '#d7c98b'],
  dark:     ['minecraft:dark_oak_door', '#4a3520'],
  mangrove: ['minecraft:mangrove_door', '#773933'],
  crimson:  ['minecraft:crimson_door',  '#6a344b'],
  warped:   ['minecraft:warped_door',   '#2b6963'],
};
export const DOOR_KINDS = Object.keys(DOOR_BLOCKS);
export const DIR = { east: 0, south: 1, west: 2, north: 3 };

// Doors store their facing in minecraft:cardinal_direction, but ROTATED a
// quarter turn from the way the door faces. Bedrock's own Java->Bedrock table
// (tools/bedrock-states.json, _doorFacingToCardinal) gives:
//   facing north -> "east", south -> "west", east -> "south", west -> "north".
// `dir` here is the DIR numbering (east 0, south 1, west 2, north 3), which is
// the Java facing. 0.1.7-0.1.8 wrote the facing unrotated, so every door was a
// quarter turn out; single doors hid it, double doors came apart.
const DOOR_CARDINAL = ['south', 'west', 'north', 'east'];   // indexed by DIR
export function doorId(kind, dir, upper, hinge = 0) {
  const [block, color] = DOOR_BLOCKS[kind] || DOOR_BLOCKS.oak;  // unknown kind -> oak, never iron
  return MATERIALS.add(null, block, color, {
    'minecraft:cardinal_direction': S(DOOR_CARDINAL[dir & 3]),
    door_hinge_bit: B(hinge),
    open_bit: B(0),
    upper_block_bit: B(upper ? 1 : 0),
  }, { passable: true });
}

// ---- stairs ----------------------------------------------------------------
// Bedrock stairs states: weirdo_direction (0=east,1=west,2=south,3=north),
// upside_down_bit.
const STAIR_BLOCKS = {
  stonebrick: ['minecraft:stone_brick_stairs', '#7b7b75'],
  oak: ['minecraft:oak_stairs', '#b18c53'],
  spruce: ['minecraft:spruce_stairs', '#7a5c37'],
  dark: ['minecraft:dark_oak_stairs', '#4a3520'],
  brick: ['minecraft:brick_stairs', '#965a4c'],
  quartz: ['minecraft:quartz_stairs', '#e8e3da'],
  deepslate: ['minecraft:deepslate_tile_stairs', '#35353a'],
  sandstone: ['minecraft:sandstone_stairs', '#dfd5a0'],
};
export const WEIRDO = { east: 0, west: 1, south: 2, north: 3 };

export function stairId(kind, dir, upsideDown = false) {
  const [block, color] = STAIR_BLOCKS[kind] || STAIR_BLOCKS.stonebrick;
  return MATERIALS.add(null, block, color, {
    upside_down_bit: B(upsideDown ? 1 : 0),
    weirdo_direction: I(dir),
  });
}

// Full-block fallback for every stair kind (used when stair blocks are off).
export const STAIR_SOLID = {
  stonebrick: MAT.STONEBRICK, oak: MAT.OAK, spruce: MAT.SPRUCE,
  dark: MAT.SPRUCE, brick: MAT.BRICK, quartz: MAT.QUARTZ,
  deepslate: MAT.DEEPSLATE, sandstone: MAT.SANDSTONE,
};

// ---- building themes -------------------------------------------------------
// wall / trim / floor / glass / stair-kind / door-kind
export const THEMES = {
  tower: [
    { name: 'glass',    wall: MAT.C_WHITE,   trim: MAT.IRON,      floor: MAT.SMOOTH,  glass: MAT.TINTED, stair: 'quartz',     door: 'dark' },
    { name: 'noir',     wall: MAT.C_BLACK,   trim: MAT.C_GRAY,    floor: MAT.DEEPSLATE, glass: MAT.TINTED, stair: 'deepslate', door: 'crimson' },
    { name: 'steel',    wall: MAT.C_LGRAY,   trim: MAT.IRON,      floor: MAT.SMOOTH,  glass: MAT.GLASS,  stair: 'stonebrick', door: 'spruce' },
    { name: 'azure',    wall: MAT.C_BLUE,    trim: MAT.QUARTZ,    floor: MAT.SMOOTH,  glass: MAT.TINTED, stair: 'quartz',     door: 'warped' },
    { name: 'ivory',    wall: MAT.QUARTZ,    trim: MAT.C_LGRAY,   floor: MAT.SMOOTH,  glass: MAT.GLASS,  stair: 'quartz',     door: 'birch' },
    { name: 'teal',     wall: MAT.C_CYAN,    trim: MAT.C_WHITE,   floor: MAT.SMOOTH,  glass: MAT.TINTED, stair: 'quartz',     door: 'warped' },
  ],
  mid: [
    { name: 'brick',    wall: MAT.BRICK,     trim: MAT.STONEBRICK, floor: MAT.OAK,    glass: MAT.GLASS,  stair: 'brick',      door: 'oak' },
    { name: 'stone',    wall: MAT.STONEBRICK, trim: MAT.SMOOTH,   floor: MAT.OAK,     glass: MAT.GLASS,  stair: 'stonebrick', door: 'oak' },
    { name: 'sand',     wall: MAT.SANDSTONE, trim: MAT.QUARTZ,    floor: MAT.SPRUCE,  glass: MAT.GLASS,  stair: 'sandstone',  door: 'spruce' },
    { name: 'rust',     wall: MAT.C_ORANGE,  trim: MAT.C_WHITE,   floor: MAT.OAK,     glass: MAT.GLASS,  stair: 'brick',      door: 'oak' },
    { name: 'slate',    wall: MAT.C_GRAY,    trim: MAT.C_LGRAY,   floor: MAT.SMOOTH,  glass: MAT.GLASS,  stair: 'stonebrick', door: 'mangrove' },
  ],
  house: [
    { name: 'cottage',  wall: MAT.OAK,       trim: MAT.SPRUCE,    floor: MAT.OAK,     glass: MAT.GLASS,  stair: 'dark',       door: 'oak', roof: MAT.SPRUCE },
    { name: 'brickhome',wall: MAT.BRICK,     trim: MAT.OAK,       floor: MAT.OAK,     glass: MAT.GLASS,  stair: 'dark',       door: 'oak', roof: MAT.SPRUCE },
    { name: 'stucco',   wall: MAT.C_WHITE,   trim: MAT.SPRUCE,    floor: MAT.SPRUCE,  glass: MAT.GLASS,  stair: 'brick',      door: 'spruce', roof: MAT.BRICK },
    { name: 'stonehome',wall: MAT.STONEBRICK, trim: MAT.OAK,      floor: MAT.OAK,     glass: MAT.GLASS,  stair: 'dark',       door: 'oak', roof: MAT.DEEPSLATE },
    { name: 'greenhome',wall: MAT.C_GREEN,   trim: MAT.OAK,       floor: MAT.OAK,     glass: MAT.GLASS,  stair: 'dark',       door: 'oak', roof: MAT.SPRUCE },
  ],
};
