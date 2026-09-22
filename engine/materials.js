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
    // A role (road, ground, sidewalk...) keeps a material separate from
    // another use of the same block, so a city style can restyle the roads
    // without touching grey-concrete walls. The exported block is the same.
    const key = block + '|' + stateKey(states) + (flags.role ? '|' + flags.role : '');
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
        role: flags.role || null,        // what it is for, when a style may restyle it
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
  GRASS:       A('GRASS', 'minecraft:grass_block', '#6a9c3f', {}, { role: 'ground' }),
  ASPHALT:     A('ASPHALT', 'minecraft:gray_concrete', '#4b4f52', {}, { role: 'road' }),
  ASPHALT_DK:  A('ASPHALT_DK', 'minecraft:black_concrete', '#1b1d20'),
  SIDEWALK:    A('SIDEWALK', 'minecraft:light_gray_concrete', '#9aa0a1', {}, { role: 'sidewalk' }),
  CURB:        A('CURB', 'minecraft:smooth_stone', '#b0b0b0'),
  LINE:        A('LINE', 'minecraft:yellow_concrete', '#d5b31f', {}, { role: 'line' }),
  CROSSWALK:   A('CROSSWALK', 'minecraft:white_concrete', '#dfe3e4', {}, { role: 'crosswalk' }),
  PATH:        A('PATH', 'minecraft:sandstone', '#d9cfa0', {}, { role: 'path' }),

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

// ---- roles a city style can restyle (0.2.7) ---------------------------------
Object.assign(MAT, {
  PLANTER:      A('PLANTER', 'minecraft:grass_block', '#6a9c3f', {}, { role: 'planter' }),
  LAMP_POST:    A('LAMP_POST', 'minecraft:iron_bars', '#6f7478', {}, { role: 'lamppost' }),
  STREET_LIGHT: A('STREET_LIGHT', 'minecraft:sea_lantern', '#e6f2ec', {}, { role: 'streetlight' }),
  WALL_BODY:    A('WALL_BODY', 'minecraft:stone_bricks', '#7b7b75', {}, { role: 'wall' }),
  WALL_CAP:     A('WALL_CAP', 'minecraft:smooth_stone', '#a8a8a8', {}, { role: 'wallcap' }),
  RETAIN:       A('RETAIN', 'minecraft:stone_bricks', '#7b7b75', {}, { role: 'retain' }),
  INTERIOR_WALL:A('INTERIOR_WALL', 'minecraft:white_concrete', '#e4e6e6', {}, { role: 'interior' }),
});

// ---- city-style materials (0.2.7): names and states checked against
// Bedrock 1.21.60 (note: plain terracotta is hardened_clay, dead bush is
// deadbush, cobblestone stairs are stone_stairs) -----------------------------
Object.assign(MAT, {
  SAND:           A('SAND', 'minecraft:sand', '#dbcf8e'),
  SMOOTH_SAND:    A('SMOOTH_SAND', 'minecraft:smooth_sandstone', '#e0d6a3'),
  CUT_SAND:       A('CUT_SAND', 'minecraft:cut_sandstone', '#d9cd96'),
  CHISELED_SAND:  A('CHISELED_SAND', 'minecraft:chiseled_sandstone', '#d6ca92'),
  RED_SAND:       A('RED_SAND', 'minecraft:red_sandstone', '#b5621f'),
  SMOOTH_RED_SAND:A('SMOOTH_RED_SAND', 'minecraft:smooth_red_sandstone', '#b8662a'),
  TERRACOTTA:     A('TERRACOTTA', 'minecraft:hardened_clay', '#985e43'),
  T_WHITE:        A('T_WHITE', 'minecraft:white_terracotta', '#d2b2a1'),
  T_ORANGE:       A('T_ORANGE', 'minecraft:orange_terracotta', '#a15325'),
  T_YELLOW:       A('T_YELLOW', 'minecraft:yellow_terracotta', '#ba8523'),
  T_PINK:         A('T_PINK', 'minecraft:pink_terracotta', '#a24e4f'),
  T_LGRAY:        A('T_LGRAY', 'minecraft:light_gray_terracotta', '#876a61'),
  ACACIA:         A('ACACIA', 'minecraft:acacia_planks', '#a85a32'),
  ACACIA_LOG:     A('ACACIA_LOG', 'minecraft:acacia_log', '#676157', { pillar_axis: S('y') }),
  ACACIA_LEAF:    A('ACACIA_LEAF', 'minecraft:acacia_leaves', '#5f8d2a', { persistent_bit: B(1), update_bit: B(0) }),
  DEADBUSH:       A('DEADBUSH', 'minecraft:deadbush', '#8f6a32', {}, { passable: true, flowable: true, transparent: true }),
  CACTUS:         A('CACTUS', 'minecraft:cactus', '#58822b', { age: I(0) }),
  SNOW:           A('SNOW', 'minecraft:snow', '#f4f9fb'),
  SNOW_LAYER:     A('SNOW_LAYER', 'minecraft:snow_layer', '#f4f9fb', { covered_bit: B(0), height: I(0) },
                    { passable: true, flowable: true, flat: true }),
  PACKED_ICE:     A('PACKED_ICE', 'minecraft:packed_ice', '#8db4f0'),
  COBBLE:         A('COBBLE', 'minecraft:cobblestone', '#7a7a7a'),
  MOSSY_COBBLE:   A('MOSSY_COBBLE', 'minecraft:mossy_cobblestone', '#6d7a5c'),
  MOSSY_BRICK:    A('MOSSY_BRICK', 'minecraft:mossy_stone_bricks', '#737a66'),
  CRACKED_BRICK:  A('CRACKED_BRICK', 'minecraft:cracked_stone_bricks', '#76766f'),
  DEEP_BRICK:     A('DEEP_BRICK', 'minecraft:deepslate_bricks', '#474749'),
  SPRUCE_FRAME:   A('SPRUCE_FRAME', 'minecraft:spruce_log', '#3b2b1a', { pillar_axis: S('y') }, { role: 'frame' }),
  OAK_FRAME:      A('OAK_FRAME', 'minecraft:oak_log', '#6b5433', { pillar_axis: S('y') }, { role: 'frame' }),
  DARK_FRAME:     A('DARK_FRAME', 'minecraft:dark_oak_log', '#3c2e1a', { pillar_axis: S('y') }, { role: 'frame' }),
  CHERRY:         A('CHERRY', 'minecraft:cherry_planks', '#e3b1a8'),
  CHERRY_LOG:     A('CHERRY_LOG', 'minecraft:cherry_log', '#3a2330', { pillar_axis: S('y') }),
  CHERRY_LEAF:    A('CHERRY_LEAF', 'minecraft:cherry_leaves', '#f0a8c8', { persistent_bit: B(1), update_bit: B(0) }),
  CHERRY_FRAME:   A('CHERRY_FRAME', 'minecraft:cherry_log', '#3a2330', { pillar_axis: S('y') }, { role: 'frame' }),
  C_PINK:         A('C_PINK', 'minecraft:pink_concrete', '#d6658f'),
  CALCITE:        A('CALCITE', 'minecraft:calcite', '#dfe0dc'),
  BAMBOO_PLANKS:  A('BAMBOO_PLANKS', 'minecraft:bamboo_planks', '#c9b25a'),
  MUD_BRICK:      A('MUD_BRICK', 'minecraft:mud_bricks', '#89694f'),
  PACKED_MUD:     A('PACKED_MUD', 'minecraft:packed_mud', '#8e6b50'),
  JUNGLE:         A('JUNGLE', 'minecraft:jungle_planks', '#a07350'),
});
Object.assign(MAT, {
  SPRUCE_FENCE: A('SPRUCE_FENCE', 'minecraft:spruce_fence', '#5b4430'),
  DARK_FENCE:   A('DARK_FENCE', 'minecraft:dark_oak_fence', '#3f2d1a'),
  CHERRY_FENCE: A('CHERRY_FENCE', 'minecraft:cherry_fence', '#e3b1a8'),
  ACACIA_FENCE: A('ACACIA_FENCE', 'minecraft:acacia_fence', '#a85a32'),
});
// ---- art, water, landmarks (0.3.2) ------------------------------------------
// Glazed terracotta tiles: four of one colour, each turned a quarter from the
// last, make a 2x2 motif. (Light grey is "silver" in Bedrock.)
export const GLAZE_COLORS = ['blue', 'red', 'yellow', 'cyan', 'orange', 'purple', 'lime', 'magenta',
  'white', 'pink', 'black', 'green', 'brown', 'light_blue', 'gray', 'silver'];
export const glazedId = (color, facing) => MATERIALS.add(null, `minecraft:${color}_glazed_terracotta`, '#b87a4a',
  { facing_direction: I(facing) });
Object.assign(MAT, {
  SG_RED:     A('SG_RED', 'minecraft:red_stained_glass', '#a33a3a', {}, { transparent: true }),
  SG_BLUE:    A('SG_BLUE', 'minecraft:blue_stained_glass', '#3a4ea3', {}, { transparent: true }),
  SG_YELLOW:  A('SG_YELLOW', 'minecraft:yellow_stained_glass', '#d8c23a', {}, { transparent: true }),
  SG_PURPLE:  A('SG_PURPLE', 'minecraft:purple_stained_glass', '#7a3aa3', {}, { transparent: true }),
  SG_GREEN:   A('SG_GREEN', 'minecraft:green_stained_glass', '#4f7a2e', {}, { transparent: true }),
  C_RED2:     A('C_RED2', 'minecraft:red_concrete', '#8e2121'),
  LIGHT_ROD:  A('LIGHT_ROD', 'minecraft:lightning_rod', '#c4703a', { facing_direction: I(1) }),
  CANAL_BED:  A('CANAL_BED', 'minecraft:stone', '#7d7d7d', {}, { role: 'canalbed' }),
  DOCK:       A('DOCK', 'minecraft:spruce_planks', '#7a5c37', {}, { role: 'dock' }),
});
export const STAINED = [MAT.SG_RED, MAT.SG_BLUE, MAT.SG_YELLOW, MAT.SG_PURPLE, MAT.SG_GREEN];
Object.assign(MAT, {
  DESK:     A('DESK', 'minecraft:oak_slab', '#a9803f', { 'minecraft:vertical_half': S('top') }),   // a desktop at knee-to-waist height
  C_BLACK2: A('C_BLACK2', 'minecraft:black_concrete', '#141519'),
});

// A standing sign; ground_sign_direction 0..15 turning from south (0) through
// west (4), north (8), east (12) — the same numbers as Java's rotation.
export const SIGN_FACING = { south: 0, west: 4, north: 8, east: 12 };
export const signId = (dir) => MATERIALS.add(null, 'minecraft:standing_sign', '#a2824e',
  { ground_sign_direction: I(dir) }, { passable: true, transparent: true, flowable: true });

// A sign on a wall; facing_direction is the way it faces (2 north, 3 south,
// 4 west, 5 east), confirmed against Bedrock's own table.
export const WALL_SIGN_FACING = { north: 2, south: 3, west: 4, east: 5 };
export const wallSignId = (facing) => MATERIALS.add(null, 'minecraft:wall_sign', '#a2824e',
  { facing_direction: I(WALL_SIGN_FACING[facing]) }, { passable: true, transparent: true });

export const pinkPetalsId = (facing) => MATERIALS.add(null, 'minecraft:pink_petals', '#f0a8c8',
  { growth: I(3), 'minecraft:cardinal_direction': S(facing) }, { passable: true, flowable: true, transparent: true });

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
  CAULDRON_FULL: A('CAULDRON_FULL', 'minecraft:cauldron', '#3f5f94', { cauldron_liquid: S('water'), fill_level: I(6) }),
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
// ---- more variety (0.2.4): every id/state checked against Bedrock 1.21.60,
// every orientation against Bedrock's Java->Bedrock table ------------------
const GATE = { passable: true };                  // a closed gate opens for the player, like a door
Object.assign(MAT, {
  POPPY:       A('POPPY', 'minecraft:poppy', '#c8302a', {}, PLANT),
  OXEYE:       A('OXEYE', 'minecraft:oxeye_daisy', '#e9e7d8', {}, PLANT),
  LILY_VALLEY: A('LILY_VALLEY', 'minecraft:lily_of_the_valley', '#f2f2ea', {}, PLANT),
  TULIP_PINK:  A('TULIP_PINK', 'minecraft:pink_tulip', '#e7a3c0', {}, PLANT),
  TULIP_RED:   A('TULIP_RED', 'minecraft:red_tulip', '#d23c2d', {}, PLANT),
  LAMP:        A('LAMP', 'minecraft:lantern', '#e8b04a', { hanging: B(0) }, { passable: false }),
  LAMP_HANG:   A('LAMP_HANG', 'minecraft:lantern', '#e8b04a', { hanging: B(1) }),
  HAY:         A('HAY', 'minecraft:hay_block', '#c9a43a', { deprecated: I(0), pillar_axis: S('y') }),
  FENCE:       A('FENCE', 'minecraft:oak_fence', '#a2824e'),
  SMITHING:    A('SMITHING', 'minecraft:smithing_table', '#3c3f4b'),
  MELON:       A('MELON', 'minecraft:melon_block', '#6f9a2c'),
});
export const FLOWERS = [MAT.DANDELION, MAT.CORNFLOWER, MAT.ALLIUM, MAT.AZURE_BLUET, MAT.BLUE_ORCHID,
  MAT.POPPY, MAT.OXEYE, MAT.LILY_VALLEY, MAT.TULIP_PINK, MAT.TULIP_RED];

// ---- landmarks (0.2.5) -------------------------------------------------------
Object.assign(MAT, {
  SMOOTH_QUARTZ:  A('SMOOTH_QUARTZ', 'minecraft:smooth_quartz', '#ece7df', { pillar_axis: S('y') }),
  QUARTZ_PILLAR:  A('QUARTZ_PILLAR', 'minecraft:quartz_pillar', '#e6e0d5', { pillar_axis: S('y') }),
  CHISELED_QUARTZ:A('CHISELED_QUARTZ', 'minecraft:chiseled_quartz_block', '#e3ddd1', { pillar_axis: S('y') }),
  CHISELED_STONE: A('CHISELED_STONE', 'minecraft:chiseled_stone_bricks', '#77776f'),
  ANDESITE:       A('ANDESITE', 'minecraft:polished_andesite', '#8f9190'),
  COPPER_ROOF:    A('COPPER_ROOF', 'minecraft:waxed_oxidized_copper', '#4fa888'),   // waxed: stays green
  GOLD:           A('GOLD', 'minecraft:gold_block', '#f2cf3e'),
  BELL_HANG:      A('BELL_HANG', 'minecraft:bell', '#e2b93b', { attachment: S('hanging'), direction: I(0), toggle_bit: B(0) }),
  DARK_PLANKS:    A('DARK_PLANKS', 'minecraft:dark_oak_planks', '#4a3520'),
});
export const WOOLS = ['red', 'yellow', 'blue', 'white', 'lime', 'orange', 'cyan', 'purple']
  .map((c) => MATERIALS.add(null, `minecraft:${c}_wool`, { red: '#a12722', yellow: '#f8c627', blue: '#35399d', white: '#e9ecec',
    lime: '#70b919', orange: '#f07613', cyan: '#158991', purple: '#792aac' }[c]));

// Blocks whose minecraft:cardinal_direction is simply the way they face
// (fence gate, chest, lectern, smoker, stonecutter, pumpkin) — unlike doors.
const faced = (block, color, extra = {}, flags = {}) => (facing) =>
  MATERIALS.add(null, block, color, { 'minecraft:cardinal_direction': S(facing), ...extra }, flags);
export const gateId = faced('minecraft:fence_gate', '#a2824e', { in_wall_bit: B(0), open_bit: B(0) }, GATE);
export const chestId = faced('minecraft:chest', '#9a6a2f');
export const lecternId = faced('minecraft:lectern', '#a5824f', { powered_bit: B(0) });
export const smokerId = faced('minecraft:smoker', '#5b5750');
export const stonecutterId = faced('minecraft:stonecutter_block', '#8a8a8a');
export const pumpkinId = faced('minecraft:pumpkin', '#d98323');
// Looms and grindstones use the old number (0 south, 1 west, 2 north, 3 east).
const LEGACY = { south: 0, west: 1, north: 2, east: 3 };
export const loomId = (facing) => MATERIALS.add(null, 'minecraft:loom', '#b58b5a', { direction: I(LEGACY[facing]) });
export const grindstoneId = (facing) => MATERIALS.add(null, 'minecraft:grindstone', '#8d8d8d',
  { attachment: S('standing'), direction: I(LEGACY[facing]) });
// bamboo: a stalk of plain segments with leaves at the top
export const bambooId = (leaves) => MATERIALS.add(null, 'minecraft:bamboo', '#6c9a2e',
  { age_bit: B(0), bamboo_leaf_size: S(leaves), bamboo_stalk_thickness: S('thin') });
export const CARPETS = [MAT.CARPET_BLUE, MAT.CARPET_CYAN, MAT.CARPET_BROWN, MAT.CARPET_GRAY];

// crops: wheat / carrots / beetroot / potatoes, growth 0..7
const CROP_BLOCKS = {
  wheat: ['minecraft:wheat', '#c9b64a'],
  carrots: ['minecraft:carrots', '#e08a2c'],
  beetroot: ['minecraft:beetroot', '#9c2f3a'],
  potatoes: ['minecraft:potatoes', '#a8903f'],
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
  acacia:   ['minecraft:acacia_door',   '#a85a32'],
  cherry:   ['minecraft:cherry_door',   '#e3b1a8'],
  jungle:   ['minecraft:jungle_door',   '#a07350'],
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
  smoothsand: ['minecraft:smooth_sandstone_stairs', '#e0d6a3'],
  redsand: ['minecraft:red_sandstone_stairs', '#b5621f'],
  acacia: ['minecraft:acacia_stairs', '#a85a32'],
  cherry: ['minecraft:cherry_stairs', '#e3b1a8'],
  cobble: ['minecraft:stone_stairs', '#7a7a7a'],            // Bedrock's name for cobblestone stairs
  mossy: ['minecraft:mossy_stone_brick_stairs', '#737a66'],
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
  smoothsand: MAT.SMOOTH_SAND, redsand: MAT.RED_SAND, acacia: MAT.ACACIA,
  cherry: MAT.CHERRY, cobble: MAT.COBBLE, mossy: MAT.MOSSY_BRICK,
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
