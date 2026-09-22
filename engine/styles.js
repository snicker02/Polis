// engine/styles.js — city styles.
//
// A style is one table:
//   themes    building palettes (wall, trim, floor, glass, stair kind, door kind)
//             for houses, mid-rises and towers, picked as each building is made
//   remap     what each role material becomes once the city is built: ground,
//             roads, sidewalks, markings, park paths, trees, flowers, street
//             lamps, the perimeter wall, terrace faces (null = removed)
//   landmark  the town hall, clock tower, library and market in the style
//   extras    snow cover, cacti among the trees
//
// Role materials (materials.js, role:) are separate from other uses of the
// same block, so restyling the roads never touches a grey-concrete wall.
// Every block here is checked against Bedrock's own 1.21.60 state list by
// tools/validate.js.

import { MAT, THEMES, pinkPetalsId } from './materials.js';

const T = (name, wall, trim, floor, glass, stair, door, roof) => ({ name, wall, trim, floor, glass, stair, door, roof });

const MODERN_LANDMARK = {
  hallPave: MAT.ANDESITE, hallWall: MAT.SMOOTH_QUARTZ, hallColumn: MAT.QUARTZ_PILLAR, hallCapital: MAT.CHISELED_QUARTZ,
  hallFloor: MAT.ANDESITE, hallGlass: MAT.PANE, hallStair: 'quartz', hallDoor: 'dark', entablature: MAT.SMOOTH_QUARTZ,
  domeBase: MAT.SMOOTH_QUARTZ, domeRing: MAT.QUARTZ_PILLAR, dome: MAT.COPPER_ROOF, finial: MAT.GOLD,
  clockPave: [MAT.ANDESITE, MAT.STONEBRICK], clockWall: MAT.STONEBRICK, clockTrim: MAT.CHISELED_STONE, clockFloor: MAT.SMOOTH,
  clockStair: 'stonebrick', clockDoor: 'spruce', spire: MAT.COPPER_ROOF,
  libPave: MAT.SIDEWALK, libWall: MAT.BRICK, libTrim: MAT.STONEBRICK, libFloor: MAT.DARK_PLANKS, libStair: 'stonebrick', libDoor: 'spruce',
  market: [MAT.ANDESITE, MAT.STONEBRICK], wellRim: MAT.STONEBRICK, wellRoof: MAT.DARK_PLANKS,
};

export const STYLES = {
  modern: {
    label: 'Modern',
    themes: THEMES,
    remap: {},
    landmark: MODERN_LANDMARK,
  },

  desert: {
    label: 'Desert',
    themes: {
      house: [
        T('adobe', MAT.SMOOTH_SAND, MAT.CUT_SAND, MAT.ACACIA, MAT.GLASS, 'smoothsand', 'acacia', MAT.SMOOTH_SAND),
        T('clay', MAT.TERRACOTTA, MAT.SMOOTH_SAND, MAT.ACACIA, MAT.GLASS, 'acacia', 'acacia', MAT.ACACIA),
        T('ochre', MAT.T_YELLOW, MAT.CUT_SAND, MAT.SMOOTH_SAND, MAT.GLASS, 'sandstone', 'jungle', MAT.SANDSTONE),
        T('rose', MAT.T_WHITE, MAT.T_ORANGE, MAT.ACACIA, MAT.GLASS, 'redsand', 'acacia', MAT.RED_SAND),
      ],
      mid: [
        T('sandstone', MAT.SANDSTONE, MAT.CHISELED_SAND, MAT.SMOOTH_SAND, MAT.PANE, 'sandstone', 'jungle'),
        T('redrock', MAT.RED_SAND, MAT.SMOOTH_RED_SAND, MAT.ACACIA, MAT.PANE, 'redsand', 'acacia'),
        T('terracotta', MAT.T_ORANGE, MAT.CUT_SAND, MAT.SMOOTH_SAND, MAT.PANE, 'smoothsand', 'acacia'),
      ],
      tower: [
        T('cut', MAT.CUT_SAND, MAT.SMOOTH_SAND, MAT.SMOOTH_SAND, MAT.GLASS, 'smoothsand', 'jungle'),
        T('ochre', MAT.T_YELLOW, MAT.CHISELED_SAND, MAT.SMOOTH_SAND, MAT.GLASS, 'sandstone', 'acacia'),
        T('clay', MAT.TERRACOTTA, MAT.SMOOTH_SAND, MAT.ACACIA, MAT.GLASS, 'acacia', 'acacia'),
      ],
    },
    remap: {
      GRASS: 'SAND', ASPHALT: 'SMOOTH_SAND', SIDEWALK: 'CUT_SAND', LINE: 'T_ORANGE', CROSSWALK: 'T_WHITE',
      PATH: 'SMOOTH_RED_SAND', LOG: 'ACACIA_LOG', LEAVES: 'ACACIA_LEAF', SPRUCE_LOG: 'ACACIA_LOG', SPRUCE_LEAF: 'ACACIA_LEAF',
      FLOWERS: 'DEADBUSH', LAMP_POST: 'ACACIA_FENCE', STREET_LIGHT: 'LAMP',
      WALL_BODY: 'SANDSTONE', WALL_CAP: 'SMOOTH_SAND', RETAIN: 'CUT_SAND', INTERIOR_WALL: 'SMOOTH_SAND',
    },
    cactus: 0.45,
    landmark: { ...MODERN_LANDMARK,
      hallPave: MAT.SMOOTH_SAND, hallWall: MAT.SMOOTH_SAND, hallColumn: MAT.CUT_SAND, hallCapital: MAT.CHISELED_SAND,
      hallFloor: MAT.ACACIA, hallStair: 'smoothsand', hallDoor: 'acacia', entablature: MAT.SMOOTH_SAND,
      domeBase: MAT.SMOOTH_SAND, domeRing: MAT.CUT_SAND, dome: MAT.T_ORANGE,
      clockPave: [MAT.SMOOTH_SAND, MAT.CUT_SAND], clockWall: MAT.SANDSTONE, clockTrim: MAT.CHISELED_SAND, clockFloor: MAT.SMOOTH_SAND,
      clockStair: 'sandstone', clockDoor: 'acacia', spire: MAT.T_ORANGE,
      libPave: MAT.CUT_SAND, libWall: MAT.TERRACOTTA, libTrim: MAT.CUT_SAND, libFloor: MAT.ACACIA, libStair: 'smoothsand', libDoor: 'acacia',
      market: [MAT.SMOOTH_SAND, MAT.CUT_SAND], wellRim: MAT.CUT_SAND, wellRoof: MAT.ACACIA },
  },

  snowy: {
    label: 'Snowy',
    themes: {
      house: [
        T('lodge', MAT.SPRUCE, MAT.SPRUCE_FRAME, MAT.SPRUCE, MAT.GLASS, 'spruce', 'spruce', MAT.DEEPSLATE),
        T('fieldstone', MAT.COBBLE, MAT.SPRUCE_FRAME, MAT.SPRUCE, MAT.GLASS, 'dark', 'dark', MAT.SPRUCE),
        T('whitewash', MAT.C_WHITE, MAT.SPRUCE_FRAME, MAT.SPRUCE, MAT.GLASS, 'dark', 'spruce', MAT.SPRUCE),
        T('slate', MAT.DEEP_BRICK, MAT.SPRUCE, MAT.SPRUCE, MAT.GLASS, 'deepslate', 'spruce', MAT.DEEPSLATE),
      ],
      mid: [
        T('stone', MAT.STONEBRICK, MAT.SPRUCE_FRAME, MAT.SPRUCE, MAT.GLASS, 'stonebrick', 'spruce'),
        T('cobble', MAT.COBBLE, MAT.STONEBRICK, MAT.SPRUCE, MAT.GLASS, 'cobble', 'dark'),
        T('deepslate', MAT.DEEP_BRICK, MAT.C_WHITE, MAT.SPRUCE, MAT.GLASS, 'deepslate', 'spruce'),
      ],
      tower: [
        T('granite', MAT.STONEBRICK, MAT.DEEP_BRICK, MAT.SMOOTH, MAT.GLASS, 'stonebrick', 'spruce'),
        T('frost', MAT.C_WHITE, MAT.SPRUCE_FRAME, MAT.SPRUCE, MAT.GLASS, 'spruce', 'spruce'),
        T('basalt', MAT.DEEP_BRICK, MAT.STONEBRICK, MAT.SMOOTH, MAT.GLASS, 'deepslate', 'dark'),
      ],
    },
    remap: {
      ASPHALT: 'DEEP_BRICK', SIDEWALK: 'STONEBRICK', LINE: 'DEEP_BRICK', CROSSWALK: 'C_WHITE', PATH: 'STONEBRICK',
      LOG: 'SPRUCE_LOG', LEAVES: 'SPRUCE_LEAF', FLOWERS: null, LAMP_POST: 'SPRUCE_FENCE', STREET_LIGHT: 'LAMP',
      WALL_BODY: 'COBBLE', RETAIN: 'COBBLE', INTERIOR_WALL: 'SPRUCE',
    },
    snow: true,
    landmark: { ...MODERN_LANDMARK,
      hallPave: MAT.STONEBRICK, hallWall: MAT.C_WHITE, hallColumn: MAT.SPRUCE_FRAME, hallCapital: MAT.SPRUCE,
      hallFloor: MAT.SPRUCE, hallStair: 'spruce', hallDoor: 'spruce', entablature: MAT.SPRUCE,
      domeBase: MAT.C_WHITE, domeRing: MAT.SPRUCE_FRAME,
      clockPave: [MAT.STONEBRICK, MAT.COBBLE], clockTrim: MAT.DEEP_BRICK, clockFloor: MAT.SPRUCE,
      libPave: MAT.STONEBRICK, libWall: MAT.STONEBRICK, libTrim: MAT.SPRUCE_FRAME, libFloor: MAT.SPRUCE,
      market: [MAT.STONEBRICK, MAT.COBBLE], wellRim: MAT.COBBLE, wellRoof: MAT.SPRUCE },
  },

  cherry: {
    label: 'Cherry blossom',
    themes: {
      house: [
        T('blossom', MAT.CHERRY, MAT.CHERRY_FRAME, MAT.CHERRY, MAT.GLASS, 'cherry', 'cherry', MAT.DARK_PLANKS),
        T('calcite', MAT.CALCITE, MAT.CHERRY_FRAME, MAT.BAMBOO_PLANKS, MAT.GLASS, 'dark', 'cherry', MAT.DARK_PLANKS),
        T('petal', MAT.T_PINK, MAT.C_WHITE, MAT.CHERRY, MAT.GLASS, 'cherry', 'birch', MAT.CHERRY),
        T('plaster', MAT.C_WHITE, MAT.DARK_FRAME, MAT.CHERRY, MAT.GLASS, 'dark', 'cherry', MAT.DARK_PLANKS),
      ],
      mid: [
        T('white', MAT.C_WHITE, MAT.CHERRY_FRAME, MAT.CHERRY, MAT.PANE, 'cherry', 'cherry'),
        T('stone', MAT.CALCITE, MAT.DARK_PLANKS, MAT.BAMBOO_PLANKS, MAT.PANE, 'dark', 'birch'),
        T('pink', MAT.C_PINK, MAT.C_WHITE, MAT.CHERRY, MAT.PANE, 'quartz', 'cherry'),
      ],
      tower: [
        T('pearl', MAT.C_WHITE, MAT.C_PINK, MAT.SMOOTH, MAT.TINTED, 'quartz', 'cherry'),
        T('calcite', MAT.CALCITE, MAT.CHERRY_FRAME, MAT.CHERRY, MAT.GLASS, 'cherry', 'cherry'),
        T('rose', MAT.C_PINK, MAT.CALCITE, MAT.SMOOTH, MAT.GLASS, 'quartz', 'birch'),
      ],
    },
    remap: {
      ASPHALT: 'GRAVEL', SIDEWALK: 'CALCITE', LINE: 'GRAVEL', CROSSWALK: 'C_WHITE', PATH: 'GRAVEL',
      LOG: 'CHERRY_LOG', LEAVES: 'CHERRY_LEAF', SPRUCE_LOG: 'CHERRY_LOG', SPRUCE_LEAF: 'CHERRY_LEAF',
      FLOWERS_HALF: 'PINK_PETALS', LAMP_POST: 'CHERRY_FENCE', STREET_LIGHT: 'LAMP',
      WALL_BODY: 'CALCITE', WALL_CAP: 'CHERRY', INTERIOR_WALL: 'CALCITE',
    },
    landmark: { ...MODERN_LANDMARK,
      hallPave: MAT.CALCITE, hallWall: MAT.CALCITE, hallColumn: MAT.CHERRY_FRAME, hallCapital: MAT.CHERRY,
      hallFloor: MAT.CHERRY, hallStair: 'cherry', hallDoor: 'cherry', entablature: MAT.CHERRY,
      domeBase: MAT.CALCITE, domeRing: MAT.CHERRY_FRAME, dome: MAT.T_PINK,
      clockPave: [MAT.CALCITE, MAT.STONEBRICK], clockWall: MAT.CALCITE, clockTrim: MAT.CHERRY_FRAME, clockFloor: MAT.CHERRY,
      clockStair: 'cherry', clockDoor: 'cherry', spire: MAT.T_PINK,
      libPave: MAT.CALCITE, libWall: MAT.CHERRY, libTrim: MAT.DARK_FRAME, libFloor: MAT.BAMBOO_PLANKS, libStair: 'cherry', libDoor: 'cherry',
      market: [MAT.CALCITE, MAT.STONEBRICK], wellRim: MAT.CALCITE, wellRoof: MAT.CHERRY },
  },

  medieval: {
    label: 'Medieval',
    themes: {
      house: [
        T('timber', MAT.C_WHITE, MAT.OAK_FRAME, MAT.OAK, MAT.GLASS, 'dark', 'oak', MAT.SPRUCE),
        T('darktimber', MAT.C_WHITE, MAT.DARK_FRAME, MAT.SPRUCE, MAT.GLASS, 'dark', 'dark', MAT.DARK_PLANKS),
        T('stonehouse', MAT.COBBLE, MAT.OAK_FRAME, MAT.OAK, MAT.GLASS, 'cobble', 'spruce', MAT.SPRUCE),
        T('mossy', MAT.MOSSY_COBBLE, MAT.SPRUCE_FRAME, MAT.SPRUCE, MAT.GLASS, 'mossy', 'dark', MAT.SPRUCE),
      ],
      mid: [
        T('guildhall', MAT.STONEBRICK, MAT.DARK_FRAME, MAT.SPRUCE, MAT.GLASS, 'stonebrick', 'dark'),
        T('inn', MAT.C_WHITE, MAT.OAK_FRAME, MAT.OAK, MAT.GLASS, 'dark', 'oak'),
        T('cobble', MAT.COBBLE, MAT.STONEBRICK, MAT.SPRUCE, MAT.GLASS, 'cobble', 'spruce'),
      ],
      tower: [
        T('keep', MAT.STONEBRICK, MAT.CRACKED_BRICK, MAT.SPRUCE, MAT.GLASS, 'stonebrick', 'dark'),
        T('bastion', MAT.COBBLE, MAT.STONEBRICK, MAT.SPRUCE, MAT.GLASS, 'cobble', 'spruce'),
        T('ruin', MAT.MOSSY_BRICK, MAT.STONEBRICK, MAT.OAK, MAT.GLASS, 'mossy', 'dark'),
      ],
    },
    remap: {
      ASPHALT: 'COBBLE', SIDEWALK: 'STONEBRICK', LINE: 'COBBLE', CROSSWALK: 'STONEBRICK', PATH: 'GRASS_PATH',
      LAMP_POST: 'DARK_FENCE', STREET_LIGHT: 'LAMP', RETAIN: 'COBBLE', INTERIOR_WALL: 'OAK',
    },
    landmark: { ...MODERN_LANDMARK,
      hallPave: MAT.COBBLE, hallWall: MAT.STONEBRICK, hallColumn: MAT.DARK_FRAME, hallCapital: MAT.CHISELED_STONE,
      hallFloor: MAT.SPRUCE, hallGlass: MAT.GLASS, hallStair: 'stonebrick', hallDoor: 'dark', entablature: MAT.STONEBRICK,
      domeBase: MAT.STONEBRICK, domeRing: MAT.CHISELED_STONE,
      clockPave: [MAT.COBBLE, MAT.STONEBRICK], clockFloor: MAT.SPRUCE,
      libPave: MAT.COBBLE, libWall: MAT.COBBLE, libTrim: MAT.OAK_FRAME, libFloor: MAT.SPRUCE,
      market: [MAT.COBBLE, MAT.STONEBRICK], wellRim: MAT.COBBLE, wellRoof: MAT.SPRUCE },
  },
};
export const STYLE_NAMES = Object.keys(STYLES);
export const styleOf = (name) => STYLES[name] || STYLES.modern;

// Build the id -> id table for a style (null = remove the block).
export function remapTable(style, FLOWER_IDS) {
  const map = new Map();
  for (const [role, target] of Object.entries(style.remap || {})) {
    if (role === 'FLOWERS') {
      for (const f of FLOWER_IDS) map.set(f, target === null ? null : MAT[target]);
    } else if (role === 'FLOWERS_HALF') {
      FLOWER_IDS.forEach((f, i) => { if (i % 2 === 0) map.set(f, pinkPetalsId(['north', 'east', 'south', 'west'][i % 4])); });
    } else {
      map.set(MAT[role], target === null ? null : MAT[target]);
    }
  }
  return map;
}
