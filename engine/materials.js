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
        passable: !!flags.passable,      // player can walk through (doors)
        transparent: !!flags.transparent, // preview-only hint
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
  QUARTZ:      A('QUARTZ', 'minecraft:quartz_block', '#e8e3da'),
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

// ---- doors -----------------------------------------------------------------
// Bedrock door states: direction (0=east,1=south,2=west,3=north),
// door_hinge_bit, open_bit, upper_block_bit.
const DOOR_BLOCKS = {
  oak: ['minecraft:oak_door', '#a9803f'],
  spruce: ['minecraft:spruce_door', '#6d5232'],
  dark: ['minecraft:dark_oak_door', '#4a3520'],
  iron: ['minecraft:iron_door', '#c6c6c6'],
};
export const DIR = { east: 0, south: 1, west: 2, north: 3 };

export function doorId(kind, dir, upper, hinge = 0) {
  const [block, color] = DOOR_BLOCKS[kind] || DOOR_BLOCKS.oak;
  return MATERIALS.add(null, block, color, {
    direction: I(dir),
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
    { name: 'glass',    wall: MAT.C_WHITE,   trim: MAT.IRON,      floor: MAT.SMOOTH,  glass: MAT.TINTED, stair: 'quartz',     door: 'iron' },
    { name: 'noir',     wall: MAT.C_BLACK,   trim: MAT.C_GRAY,    floor: MAT.DEEPSLATE, glass: MAT.TINTED, stair: 'deepslate', door: 'iron' },
    { name: 'steel',    wall: MAT.C_LGRAY,   trim: MAT.IRON,      floor: MAT.SMOOTH,  glass: MAT.GLASS,  stair: 'stonebrick', door: 'iron' },
    { name: 'azure',    wall: MAT.C_BLUE,    trim: MAT.QUARTZ,    floor: MAT.SMOOTH,  glass: MAT.TINTED, stair: 'quartz',     door: 'iron' },
    { name: 'ivory',    wall: MAT.QUARTZ,    trim: MAT.C_LGRAY,   floor: MAT.SMOOTH,  glass: MAT.GLASS,  stair: 'quartz',     door: 'iron' },
    { name: 'teal',     wall: MAT.C_CYAN,    trim: MAT.C_WHITE,   floor: MAT.SMOOTH,  glass: MAT.TINTED, stair: 'quartz',     door: 'iron' },
  ],
  mid: [
    { name: 'brick',    wall: MAT.BRICK,     trim: MAT.STONEBRICK, floor: MAT.OAK,    glass: MAT.GLASS,  stair: 'brick',      door: 'oak' },
    { name: 'stone',    wall: MAT.STONEBRICK, trim: MAT.SMOOTH,   floor: MAT.OAK,     glass: MAT.GLASS,  stair: 'stonebrick', door: 'oak' },
    { name: 'sand',     wall: MAT.SANDSTONE, trim: MAT.QUARTZ,    floor: MAT.SPRUCE,  glass: MAT.GLASS,  stair: 'sandstone',  door: 'spruce' },
    { name: 'rust',     wall: MAT.C_ORANGE,  trim: MAT.C_WHITE,   floor: MAT.OAK,     glass: MAT.GLASS,  stair: 'brick',      door: 'oak' },
    { name: 'slate',    wall: MAT.C_GRAY,    trim: MAT.C_LGRAY,   floor: MAT.SMOOTH,  glass: MAT.GLASS,  stair: 'stonebrick', door: 'oak' },
  ],
  house: [
    { name: 'cottage',  wall: MAT.OAK,       trim: MAT.SPRUCE,    floor: MAT.OAK,     glass: MAT.GLASS,  stair: 'dark',       door: 'oak', roof: MAT.SPRUCE },
    { name: 'brickhome',wall: MAT.BRICK,     trim: MAT.OAK,       floor: MAT.OAK,     glass: MAT.GLASS,  stair: 'dark',       door: 'oak', roof: MAT.SPRUCE },
    { name: 'stucco',   wall: MAT.C_WHITE,   trim: MAT.SPRUCE,    floor: MAT.SPRUCE,  glass: MAT.GLASS,  stair: 'brick',      door: 'spruce', roof: MAT.BRICK },
    { name: 'stonehome',wall: MAT.STONEBRICK, trim: MAT.OAK,      floor: MAT.OAK,     glass: MAT.GLASS,  stair: 'dark',       door: 'oak', roof: MAT.DEEPSLATE },
    { name: 'greenhome',wall: MAT.C_GREEN,   trim: MAT.OAK,       floor: MAT.OAK,     glass: MAT.GLASS,  stair: 'dark',       door: 'oak', roof: MAT.SPRUCE },
  ],
};
