// engine/java-blocks.js — turning Polis blocks into Java Edition blocks.
//
// The generator only ever deals in blocks with states. Those states are
// written the Bedrock way (facing_direction=2, upside_down_bit=1,
// weirdo_direction=0), and Java writes the same ideas differently
// (facing=north, half=top, facing=east). This translates one to the other.
//
// The rules below were checked against Mojang's own Java-to-Bedrock mapping
// table and against Java's block state definitions, block by block, by
// tools/check-java-blocks.mjs.

// Bedrock's facing_direction: 0 down, 1 up, 2 north, 3 south, 4 west, 5 east
const FACING = ['down', 'up', 'north', 'south', 'west', 'east'];

// Bedrock's weirdo_direction on stairs: 0 east, 1 west, 2 south, 3 north
const STAIR_FACING = ['east', 'west', 'south', 'north'];

// Bedrock's direction on doors, and on beds: 0 south/ 1 west/ 2 north/ 3 east
// for beds; doors count 0 east, 1 south, 2 west, 3 north.
const DOOR_FACING = ['east', 'south', 'west', 'north'];
// a door's direction, from Bedrock back to Java
const DOOR_TURN = { east: 'north', west: 'south', south: 'east', north: 'west' };
const BED_FACING = ['south', 'west', 'north', 'east'];

// rail_direction to Java's shape
const RAIL_SHAPE = ['north_south', 'east_west', 'ascending_east', 'ascending_west',
  'ascending_north', 'ascending_south', 'south_east', 'south_west', 'north_west', 'north_east'];

// Blocks whose name differs. Everything not listed keeps its name.
const RENAME = {
  'minecraft:grass_block': 'minecraft:grass_block',
  'minecraft:brick_block': 'minecraft:bricks',
  'minecraft:stone_bricks': 'minecraft:stone_bricks',
  'minecraft:stonebrick': 'minecraft:stone_bricks',
  'minecraft:wooden_door': 'minecraft:oak_door',
  'minecraft:spruce_door': 'minecraft:spruce_door',
  'minecraft:frame': 'minecraft:item_frame',
  'minecraft:standing_sign': 'minecraft:oak_sign',
  'minecraft:wall_sign': 'minecraft:oak_wall_sign',
  'minecraft:golden_rail': 'minecraft:powered_rail',
  'minecraft:glowingobsidian': 'minecraft:obsidian',
  'minecraft:invisibleBedrock': 'minecraft:barrier',
  'minecraft:concrete': 'minecraft:white_concrete',
  'minecraft:concretePowder': 'minecraft:white_concrete_powder',
  'minecraft:log': 'minecraft:oak_log',
  'minecraft:log2': 'minecraft:acacia_log',
  'minecraft:leaves': 'minecraft:oak_leaves',
  'minecraft:leaves2': 'minecraft:acacia_leaves',
  'minecraft:waterlily': 'minecraft:lily_pad',
  'minecraft:web': 'minecraft:cobweb',
  'minecraft:unlit_redstone_torch': 'minecraft:redstone_torch',
  'minecraft:lit_pumpkin': 'minecraft:jack_o_lantern',
  'minecraft:melon_block': 'minecraft:melon',
  'minecraft:noteblock': 'minecraft:note_block',
  'minecraft:mob_spawner': 'minecraft:spawner',
  'minecraft:monster_egg': 'minecraft:infested_stone',
  'minecraft:quartz_ore': 'minecraft:nether_quartz_ore',
  'minecraft:snow_layer': 'minecraft:snow',
  'minecraft:snow': 'minecraft:snow_block',
  'minecraft:trapdoor': 'minecraft:oak_trapdoor',
  'minecraft:wooden_slab': 'minecraft:oak_slab',
  'minecraft:double_wooden_slab': 'minecraft:oak_slab',
  'minecraft:stone_slab': 'minecraft:smooth_stone_slab',
  'minecraft:hay_block': 'minecraft:hay_block',
  'minecraft:torch': 'minecraft:torch',
  'minecraft:fence_gate': 'minecraft:oak_fence_gate',
  'minecraft:silver_glazed_terracotta': 'minecraft:light_gray_glazed_terracotta',
  'minecraft:fence': 'minecraft:oak_fence',
  'minecraft:wooden_pressure_plate': 'minecraft:oak_pressure_plate',
  'minecraft:wooden_button': 'minecraft:oak_button',
  'minecraft:stonecutter_block': 'minecraft:stonecutter',
  'minecraft:grass_path': 'minecraft:dirt_path',
  'minecraft:beetroot': 'minecraft:beetroots',
  'minecraft:deadbush': 'minecraft:dead_bush',
  'minecraft:pumpkin': 'minecraft:pumpkin',
  'minecraft:cauldron': 'minecraft:cauldron',
  'minecraft:yellow_flower': 'minecraft:dandelion',
  'minecraft:tallgrass': 'minecraft:short_grass',
  'minecraft:double_plant': 'minecraft:tall_grass',
  'minecraft:sapling': 'minecraft:oak_sapling',
  'minecraft:reeds': 'minecraft:sugar_cane',
  'minecraft:cocoa': 'minecraft:cocoa',
  'minecraft:hardened_clay': 'minecraft:terracotta',
  'minecraft:stained_hardened_clay': 'minecraft:white_terracotta',
};

// A state translation per property. Each returns [name, value] for Java, or
// null to drop the property.
function translateState(block, key, value) {
  switch (key) {
    // Bedrock 1.20+ writes this on doors, chests, furnaces and the like. On a
    // door it is a quarter-turn away from Java's facing (Mojang's own mapping
    // table: java facing=north is bedrock east); everything else matches.
    case 'minecraft:cardinal_direction':
      if (/_door$/.test(block)) return ['facing', DOOR_TURN[String(value)] || String(value)];
      return ['facing', String(value)];
    case 'powered_bit': return ['powered', value ? 'true' : 'false'];
    case 'deprecated': return null;
    case 'cauldron_liquid': return null;
    case 'fill_level': return ['level', String(Math.min(3, value))];
    case 'brewing_stand_slot_a_bit': return ['has_bottle_0', value ? 'true' : 'false'];
    case 'brewing_stand_slot_b_bit': return ['has_bottle_1', value ? 'true' : 'false'];
    case 'brewing_stand_slot_c_bit': return ['has_bottle_2', value ? 'true' : 'false'];
    case 'composter_fill_level': return ['level', String(Math.min(8, value))];
    case 'moisturized_amount': return ['moisture', String(Math.min(7, value))];
    case 'minecraft:vertical_half': return ['type', String(value) === 'top' ? 'top' : 'bottom'];
    case 'height': return ['layers', String(Math.min(8, value + 1))];      // snow layers count from one
    case 'covered_bit': return null;
    case 'toggle_bit': return null;
    case 'age_bit': return ['age', value ? '1' : '0'];
    case 'bamboo_leaf_size': return ['leaves', value === 'large_leaves' ? 'large' : value === 'small_leaves' ? 'small' : 'none'];
    case 'bamboo_stalk_thickness': return ['stage', value === 'thick' ? '1' : '0'];
    case 'attachment':
      // the bell's attachment; a grindstone calls the same idea "face"
      if (/grindstone$/.test(block)) return ['face', { standing: 'floor', hanging: 'ceiling', side: 'wall', multiple: 'wall' }[String(value)] || 'floor'];
      return ['attachment', { standing: 'floor', hanging: 'ceiling', side: 'single_wall', multiple: 'double_wall' }[String(value)] || 'floor'];
    case 'growth':
      return ['age', String(value)];
    case 'facing_direction': {
      const f = FACING[value] || 'north';
      // torches, ladders, wall signs and the like face outward from the wall
      if (/torch$/.test(block) && (f === 'up' || f === 'down')) return null;
      return ['facing', f];
    }
    case 'weirdo_direction': return ['facing', STAIR_FACING[value] || 'east'];
    case 'upside_down_bit': return ['half', value ? 'top' : 'bottom'];
    case 'open_bit': return ['open', value ? 'true' : 'false'];
    case 'door_hinge_bit': return ['hinge', value ? 'right' : 'left'];
    case 'upper_block_bit': return ['half', value ? 'upper' : 'lower'];
    case 'direction':
      if (/_bed$/.test(block) || block === 'minecraft:bed') return ['facing', BED_FACING[value] || 'south'];
      return ['facing', DOOR_TURN[DOOR_FACING[value]] || 'north'];
    case 'rail_direction': return ['shape', RAIL_SHAPE[value] || 'north_south'];
    case 'ground_sign_direction': return ['rotation', String(value)];
    case 'pillar_axis': return ['axis', String(value)];
    case 'top_slot_bit': return ['type', value ? 'top' : 'bottom'];
    case 'age': return ['age', String(value)];
    case 'persistent_bit': return ['persistent', value ? 'true' : 'false'];
    case 'update_bit': return null;
    case 'infiniburn_bit': return null;
    case 'in_wall_bit': return ['in_wall', value ? 'true' : 'false'];
    case 'liquid_depth': return ['level', String(value)];
    case 'item_frame_map_bit': return ['map', value ? 'true' : 'false'];
    case 'item_frame_photo_bit': return null;
    case 'rail_data_bit': return ['powered', value ? 'true' : 'false'];
    case 'hanging': return ['hanging', value ? 'true' : 'false'];
    case 'head_piece_bit': return ['part', value ? 'head' : 'foot'];
    case 'occupied_bit': return ['occupied', value ? 'true' : 'false'];
    case 'structure_block_type': return null;
    case 'color': return null;                       // Java carries colour in the block name
    default: return [key, typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)];
  }
}

// Colours live in the block name in Java (red_bed), but in the state or the
// block entity in Bedrock.
const COLOURS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];

export function toJava(block, states = {}, extra = {}) {
  let name = RENAME[block] || block;
  const props = {};
  for (const [key, spec] of Object.entries(states)) {
    const value = spec && spec.value !== undefined ? spec.value : spec;
    const t = translateState(name, key, value);
    if (!t) continue;
    props[t[0]] = t[1];
  }
  // a bed's colour comes from its block entity in Bedrock
  if (name === 'minecraft:bed') name = `minecraft:${COLOURS[extra.color || 0] || 'red'}_bed`;
  // Bedrock turns quartz into a pillar with a state; Java gives it its own name
  if (/quartz/.test(name) && props.axis) {
    name = name === 'minecraft:chiseled_quartz_block' || name === 'minecraft:smooth_quartz' ? name : 'minecraft:quartz_pillar';
    if (name !== 'minecraft:quartz_pillar') delete props.axis;          // those two have no axis in Java
  }
  // a plain pumpkin does not face anywhere in Java (a carved one does)
  if (name === 'minecraft:pumpkin') delete props.facing;
  // a full cauldron is its own block in Java
  if (name === 'minecraft:cauldron') {
    const level = Number(props.level || 0);
    delete props.level;
    if (level > 0) { name = 'minecraft:water_cauldron'; props.level = String(Math.max(1, Math.min(3, level))); }
  }
  // beetroots grow through four stages in Java, eight in Bedrock
  if (name === 'minecraft:beetroots' && props.age !== undefined) props.age = String(Math.min(3, Math.floor(Number(props.age) / 2)));
  // pink petals count flowers from one
  if (name === 'minecraft:pink_petals' && props.age !== undefined) {
    props.flower_amount = String(Math.max(1, Math.min(4, Number(props.age) + 1)));
    delete props.age;
  }
  if (name === 'minecraft:purpur_block' && props.axis) { name = 'minecraft:purpur_pillar'; }
  // Java has no "double slab": it is a slab with type=double
  if (/^minecraft:double_/.test(name)) { name = name.replace('double_', ''); props.type = 'double'; }
  return { name, props };
}

// Sign text goes in front_text/back_text as four lines. Up to 1.20.4 each
// line was a JSON string; from 1.20.5 they are text components, where a plain
// string is simply the words — a JSON string there shows up on the sign
// verbatim, braces and all.
export function javaSignText(lines) {
  const rows = String(lines || '').split('\n').slice(0, 4);
  while (rows.length < 4) rows.push('');
  return rows;
}
