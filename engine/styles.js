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

  // The look of the villages the game builds by itself: oak and spruce, white
  // plaster between the timbers, cobble footings, dirt paths and hay roofs.
  // Buildings are kept low, so a village reads as a village rather than a town
  // in village colours.
  village: {
    label: 'Village',
    lowRise: true,                 // see city.js: floors are capped for this style
    rustic: true,                  // deep eaves, stone footings, solid corner posts
    themes: {
      house: [
        T('plaster', MAT.C_WHITE, MAT.OAK_FRAME, MAT.OAK, MAT.GLASS, 'oak', 'oak', MAT.OAK),
        T('cottage', MAT.C_WHITE, MAT.SPRUCE_FRAME, MAT.SPRUCE, MAT.GLASS, 'spruce', 'spruce', MAT.SPRUCE),
        T('cobblefoot', MAT.COBBLE, MAT.OAK_FRAME, MAT.OAK, MAT.GLASS, 'cobble', 'oak', MAT.OAK),
        T('thatch', MAT.C_WHITE, MAT.OAK_FRAME, MAT.OAK, MAT.GLASS, 'oak', 'oak', MAT.HAY),
        T('brickcot', MAT.BRICK, MAT.OAK_FRAME, MAT.OAK, MAT.GLASS, 'brick', 'oak', MAT.SPRUCE),
      ],
      mid: [
        T('inn', MAT.C_WHITE, MAT.OAK_FRAME, MAT.OAK, MAT.GLASS, 'oak', 'oak'),
        T('barn', MAT.SPRUCE, MAT.SPRUCE_FRAME, MAT.SPRUCE, MAT.GLASS, 'spruce', 'spruce'),
        T('smithy', MAT.COBBLE, MAT.STONEBRICK, MAT.SPRUCE, MAT.GLASS, 'cobble', 'spruce'),
        T('brickhall', MAT.BRICK, MAT.OAK_FRAME, MAT.OAK, MAT.GLASS, 'brick', 'oak'),
      ],
      tower: [
        T('granary', MAT.C_WHITE, MAT.OAK_FRAME, MAT.OAK, MAT.GLASS, 'oak', 'oak'),
        T('stonehouse', MAT.COBBLE, MAT.OAK_FRAME, MAT.SPRUCE, MAT.GLASS, 'cobble', 'oak'),
      ],
    },
    remap: {
      ASPHALT: 'GRASS_PATH', SIDEWALK: 'COBBLE', LINE: 'GRASS_PATH', CROSSWALK: 'COBBLE', PATH: 'GRASS_PATH',
      LAMP_POST: 'FENCE', STREET_LIGHT: 'LANTERN', RETAIN: 'COBBLE', INTERIOR_WALL: 'OAK',
    },
    landmark: { ...MODERN_LANDMARK,
      hallPave: MAT.COBBLE, hallWall: MAT.C_WHITE, hallColumn: MAT.OAK_FRAME, hallCapital: MAT.OAK,
      hallFloor: MAT.OAK, hallGlass: MAT.GLASS, hallStair: 'oak', hallDoor: 'oak', entablature: MAT.OAK_FRAME,
      domeBase: MAT.COBBLE, domeRing: MAT.OAK_FRAME, dome: MAT.HAY, finial: MAT.OAK_FRAME,
      clockPave: [MAT.COBBLE, MAT.GRASS_PATH], clockWall: MAT.COBBLE, clockTrim: MAT.STONEBRICK, clockFloor: MAT.OAK,
      clockStair: 'cobble', clockDoor: 'oak', spire: MAT.OAK_FRAME,
      libPave: MAT.COBBLE, libWall: MAT.C_WHITE, libTrim: MAT.OAK_FRAME, libFloor: MAT.OAK, libStair: 'oak', libDoor: 'oak',
      market: [MAT.GRASS_PATH, MAT.COBBLE], wellRim: MAT.COBBLE, wellRoof: MAT.OAK },
  },

  // The Nether, brought up: crimson and warped wood, nether brick and
  // blackstone, basalt columns, shroomlight lamps, fungus trees on nylium.
  // (The canal stays water: lava would take the boats, the fish and anyone who
  // stepped in, and water only boils away in the Nether itself.)
  nether: {
    label: 'Nether',
    themes: {
      house: [
        T('crimson', MAT.CRIMSON_PLANKS, MAT.CRIMSON_FRAME, MAT.WARPED_PLANKS, MAT.SG_RED, 'crimson', 'crimson', MAT.NETHER_WART),
        T('warped', MAT.WARPED_PLANKS, MAT.WARPED_FRAME, MAT.CRIMSON_PLANKS, MAT.TINTED, 'warped', 'warped', MAT.WARPED_WART),
        T('blackcot', MAT.PB_BRICKS, MAT.CRIMSON_FRAME, MAT.CRIMSON_PLANKS, MAT.SG_RED, 'pbbrick', 'crimson', MAT.NETHER_BRICK),
      ],
      mid: [
        T('netherbrick', MAT.NETHER_BRICK, MAT.RED_NETHER_BRICK, MAT.CRIMSON_PLANKS, MAT.SG_RED, 'netherbrick', 'crimson'),
        T('blackstone', MAT.PB_BRICKS, MAT.CHISELED_PB, MAT.WARPED_PLANKS, MAT.TINTED, 'pbbrick', 'warped'),
        T('basalt', MAT.SMOOTH_BASALT, MAT.POL_BLACKSTONE, MAT.CRIMSON_PLANKS, MAT.SG_RED, 'blackstone', 'crimson'),
      ],
      tower: [
        T('bastion', MAT.PB_BRICKS, MAT.GILDED_BLACKSTONE, MAT.CRIMSON_PLANKS, MAT.TINTED, 'pbbrick', 'crimson'),
        T('obsidian', MAT.BLACKSTONE, MAT.CRYING_OBSIDIAN, MAT.WARPED_PLANKS, MAT.TINTED, 'blackstone', 'warped'),
        T('fortress', MAT.NETHER_BRICK, MAT.CHISELED_NB, MAT.CRIMSON_PLANKS, MAT.SG_RED, 'netherbrick', 'crimson'),
      ],
    },
    remap: {
      GRASS: 'CRIMSON_NYLIUM', PLANTER: 'CRIMSON_NYLIUM', ASPHALT: 'BLACKSTONE', SIDEWALK: 'POL_BLACKSTONE',
      LINE: 'GILDED_BLACKSTONE', CROSSWALK: 'QUARTZ', PATH: 'SOUL_SOIL',
      LOG: 'CRIMSON_STEM', LEAVES: 'NETHER_WART', SPRUCE_LOG: 'WARPED_STEM', SPRUCE_LEAF: 'WARPED_WART',
      FLOWERS: 'CRIMSON_ROOTS', LAMP_POST: 'NETHER_FENCE', STREET_LIGHT: 'SHROOMLIGHT', LANTERN: 'SHROOMLIGHT',
      WALL_BODY: 'NETHER_BRICK', WALL_CAP: 'POL_BLACKSTONE', RETAIN: 'BLACKSTONE', INTERIOR_WALL: 'POL_BLACKSTONE',
      CANAL_BED: 'BLACKSTONE', DOCK: 'CRIMSON_PLANKS',
    },
    landmark: { ...MODERN_LANDMARK,
      hallPave: MAT.POL_BLACKSTONE, hallWall: MAT.NETHER_BRICK, hallColumn: MAT.POL_BASALT, hallCapital: MAT.CHISELED_PB,
      hallFloor: MAT.CRIMSON_PLANKS, hallGlass: MAT.SG_RED, hallStair: 'pbbrick', hallDoor: 'crimson', entablature: MAT.RED_NETHER_BRICK,
      domeBase: MAT.NETHER_BRICK, domeRing: MAT.POL_BASALT, dome: MAT.NETHER_WART, finial: MAT.GOLD,
      clockPave: [MAT.POL_BLACKSTONE, MAT.BLACKSTONE], clockWall: MAT.PB_BRICKS, clockTrim: MAT.GILDED_BLACKSTONE, clockFloor: MAT.WARPED_PLANKS,
      clockStair: 'pbbrick', clockDoor: 'warped', spire: MAT.BLACKSTONE,
      libPave: MAT.POL_BLACKSTONE, libWall: MAT.NETHER_BRICK, libTrim: MAT.RED_NETHER_BRICK, libFloor: MAT.CRIMSON_PLANKS, libStair: 'netherbrick', libDoor: 'crimson',
      schoolWall: MAT.NETHER_BRICK, schoolTrim: MAT.POL_BLACKSTONE,
      market: [MAT.POL_BLACKSTONE, MAT.BLACKSTONE], wellRim: MAT.PB_BRICKS, wellRoof: MAT.CRIMSON_PLANKS },
  },

  // Japan and its neighbours: white plaster between dark timber, paper screens,
  // grey tile roofs with a skirt of eaves at every floor turning up at the
  // corners, pagodas for towers, vermilion torii at the gates of parks and
  // squares, stone lanterns, gravel roads, pines and cherries.
  eastasian: {
    label: 'East Asian',
    eaves: true,                   // a skirt of tile eaves at every floor (building.js, twist.js)
    towerShapes: [['pagoda', 0.6], ['pagoda-oct', 0.4]],
    shapedChance: 0.85,            // most towers are pagodas, whatever the Shaped towers slider says
    torii: true,                   // gates where paths meet the street, and stone lanterns (city.js)
    themes: {
      house: [
        T('machiya', MAT.C_WHITE, MAT.DARK_FRAME, MAT.BAMBOO_PLANKS, MAT.SG_WHITE, 'deepslate', 'dark', MAT.DEEPSLATE),
        T('ryokan', MAT.C_WHITE, MAT.SPRUCE_FRAME, MAT.SPRUCE, MAT.SG_WHITE, 'deepslate', 'spruce', MAT.DEEPSLATE),
        T('teahouse', MAT.BAMBOO_PLANKS, MAT.DARK_FRAME, MAT.BAMBOO_MOSAIC, MAT.SG_WHITE, 'bamboo', 'dark', MAT.DEEPSLATE),
      ],
      mid: [
        T('shoten', MAT.C_WHITE, MAT.DARK_FRAME, MAT.SPRUCE, MAT.SG_WHITE, 'deepslate', 'dark'),
        T('kura', MAT.C_WHITE, MAT.DEEPSLATE, MAT.DARK_PLANKS, MAT.SG_WHITE, 'deepslate', 'spruce'),
        T('shrinehall', MAT.C_RED, MAT.DARK_FRAME, MAT.SPRUCE, MAT.SG_WHITE, 'dark', 'dark'),
      ],
      tower: [
        T('pagoda', MAT.DARK_PLANKS, MAT.C_RED, MAT.SPRUCE, MAT.SG_WHITE, 'deepslate', 'dark'),
        T('tenshu', MAT.C_WHITE, MAT.DARK_FRAME, MAT.SPRUCE, MAT.SG_WHITE, 'deepslate', 'dark'),
      ],
    },
    remap: {
      ASPHALT: 'GRAVEL', SIDEWALK: 'STONEBRICK', LINE: 'GRAVEL', CROSSWALK: 'STONEBRICK', PATH: 'GRAVEL',
      LOG: 'PINE_LOG', LEAVES: 'PINE_LEAF', SPRUCE_LOG: 'CHERRY_LOG', SPRUCE_LEAF: 'CHERRY_LEAF',
      LAMP_POST: 'DARK_FENCE', STREET_LIGHT: 'LAMP',
      WALL_BODY: 'STONEBRICK', WALL_CAP: 'DEEPSLATE', RETAIN: 'STONEBRICK', INTERIOR_WALL: 'C_WHITE', DOCK: 'DARK_PLANKS',
    },
    landmark: { ...MODERN_LANDMARK,
      hallPave: MAT.STONEBRICK, hallWall: MAT.C_WHITE, hallColumn: MAT.C_RED, hallCapital: MAT.DARK_PLANKS,
      hallFloor: MAT.SPRUCE, hallGlass: MAT.SG_WHITE, hallStair: 'deepslate', hallDoor: 'dark', entablature: MAT.DARK_PLANKS,
      domeBase: MAT.C_WHITE, domeRing: MAT.C_RED, dome: MAT.DEEPSLATE, finial: MAT.GOLD,
      clockPave: [MAT.STONEBRICK, MAT.GRAVEL], clockWall: MAT.C_WHITE, clockTrim: MAT.DARK_FRAME, clockFloor: MAT.SPRUCE,
      clockStair: 'deepslate', clockDoor: 'dark', spire: MAT.DEEPSLATE,
      libPave: MAT.STONEBRICK, libWall: MAT.C_WHITE, libTrim: MAT.DARK_FRAME, libFloor: MAT.BAMBOO_PLANKS, libStair: 'deepslate', libDoor: 'dark',
      schoolWall: MAT.C_WHITE, schoolTrim: MAT.DARK_FRAME,
      market: [MAT.STONEBRICK, MAT.GRAVEL], wellRim: MAT.STONEBRICK, wellRoof: MAT.DEEPSLATE },
  },
};
// Venice: canals for the main streets (walkways along both banks, bridges and
// footbridges), piazzas, palazzi in pink, white and brick with pointed Gothic
// windows, terracotta roofs, and a brick campanile with a green copper spire.
STYLES.venetian = {
  label: 'Venetian',
  venetian: true,
  lancets: true,                   // pointed Gothic windows (building.js)
  campanile: true,                 // the clock tower is a brick campanile
  themes: {
    house: [
      T('casa', MAT.T_PINK, MAT.CALCITE, MAT.SPRUCE, MAT.GLASS, 'brick', 'dark', MAT.T_ORANGE),
      T('casetta', MAT.T_ORANGE, MAT.CALCITE, MAT.OAK, MAT.GLASS, 'brick', 'spruce', MAT.TERRACOTTA),
      T('mattone', MAT.BRICK, MAT.CALCITE, MAT.SPRUCE, MAT.GLASS, 'brick', 'dark', MAT.T_ORANGE),
    ],
    mid: [
      T('palazzo', MAT.T_PINK, MAT.CALCITE, MAT.DARK_PLANKS, MAT.GLASS, 'quartz', 'dark'),
      T('biancopalazzo', MAT.CALCITE, MAT.BRICK, MAT.SPRUCE, MAT.GLASS, 'brick', 'dark'),
      T('ca', MAT.BRICK, MAT.CALCITE, MAT.OAK, MAT.GLASS, 'quartz', 'spruce'),
    ],
    tower: [
      T('torre', MAT.BRICK, MAT.CALCITE, MAT.SPRUCE, MAT.GLASS, 'brick', 'dark'),
      T('torrebianca', MAT.CALCITE, MAT.T_PINK, MAT.DARK_PLANKS, MAT.GLASS, 'quartz', 'dark'),
    ],
  },
  remap: {
    ASPHALT: 'STONEBRICK', SIDEWALK: 'STONEBRICK', LINE: 'STONEBRICK', CROSSWALK: 'CALCITE', PATH: 'STONEBRICK',
    LAMP_POST: 'DARK_FENCE', STREET_LIGHT: 'LAMP', RETAIN: 'BRICK', INTERIOR_WALL: 'CALCITE',
    CANAL_BED: 'STONEBRICK', DOCK: 'DARK_PLANKS', WALL_BODY: 'BRICK', WALL_CAP: 'CALCITE',
  },
  landmark: { ...MODERN_LANDMARK,
    hallPave: MAT.STONEBRICK, hallWall: MAT.T_PINK, hallColumn: MAT.CALCITE, hallCapital: MAT.QUARTZ,
    hallFloor: MAT.DARK_PLANKS, hallGlass: MAT.GLASS, hallStair: 'quartz', hallDoor: 'dark', entablature: MAT.CALCITE,
    domeBase: MAT.CALCITE, domeRing: MAT.QUARTZ, dome: MAT.COPPER_ROOF, finial: MAT.GOLD,
    clockPave: [MAT.STONEBRICK, MAT.CALCITE], clockWall: MAT.BRICK, clockTrim: MAT.CALCITE, clockFloor: MAT.SPRUCE,
    clockStair: 'brick', clockDoor: 'dark', spire: MAT.COPPER_ROOF,
    libPave: MAT.STONEBRICK, libWall: MAT.CALCITE, libTrim: MAT.BRICK, libFloor: MAT.DARK_PLANKS, libStair: 'quartz', libDoor: 'dark',
    schoolWall: MAT.T_PINK, schoolTrim: MAT.CALCITE,
    market: [MAT.STONEBRICK, MAT.CALCITE], wellRim: MAT.CALCITE, wellRoof: MAT.T_ORANGE },
};

// Art Deco: stepped towers (setbacks every four floors), vertical fins of
// trim between the bays, gold finials and a sunburst crown with a spire;
// white, black and limestone, with quartz and gold (building.js: artDeco).
STYLES.artdeco = {
  label: 'Art Deco',
  deco: true,
  shapedChance: 0,                 // no twisting towers: the setbacks are the shape
  themes: {
    house: [
      T('villa', MAT.C_WHITE, MAT.C_BLACK2, MAT.DARK_PLANKS, MAT.GLASS, 'quartz', 'dark', MAT.QUARTZ),
      T('creamvilla', MAT.SMOOTH_SAND, MAT.QUARTZ, MAT.OAK, MAT.GLASS, 'quartz', 'oak', MAT.SMOOTH_SAND),
    ],
    mid: [
      T('deco', MAT.C_WHITE, MAT.QUARTZ, MAT.DARK_PLANKS, MAT.TINTED, 'quartz', 'dark'),
      T('limestone', MAT.SMOOTH_SAND, MAT.QUARTZ, MAT.OAK, MAT.GLASS, 'quartz', 'oak'),
      T('noir', MAT.C_BLACK2, MAT.QUARTZ, MAT.DARK_PLANKS, MAT.TINTED, 'blackstone', 'dark'),
    ],
    tower: [
      T('chrysler', MAT.IRON, MAT.QUARTZ, MAT.DARK_PLANKS, MAT.TINTED, 'quartz', 'dark'),
      T('empire', MAT.SMOOTH_SAND, MAT.QUARTZ, MAT.OAK, MAT.TINTED, 'quartz', 'dark'),
      T('noirgold', MAT.C_BLACK2, MAT.QUARTZ, MAT.DARK_PLANKS, MAT.TINTED, 'blackstone', 'dark'),
    ],
  },
  remap: { SIDEWALK: 'SMOOTH', CROSSWALK: 'QUARTZ', LAMP_POST: 'BARS', WALL_CAP: 'QUARTZ' },
  landmark: { ...MODERN_LANDMARK,
    hallWall: MAT.SMOOTH_SAND, hallColumn: MAT.QUARTZ, hallCapital: MAT.GOLD, entablature: MAT.QUARTZ,
    domeBase: MAT.QUARTZ, domeRing: MAT.GOLD, finial: MAT.GOLD,
    clockWall: MAT.SMOOTH_SAND, clockTrim: MAT.QUARTZ, spire: MAT.GOLD,
    libWall: MAT.SMOOTH_SAND, libTrim: MAT.QUARTZ, schoolWall: MAT.SMOOTH_SAND, schoolTrim: MAT.QUARTZ },
};

// A city of glass: walls of stained glass in every colour (a rainbow skyline),
// clear glass windows framed in quartz, glass floors to see through the whole
// building, glass streets and quartz pavements, trees of quartz and green glass,
// glass-pane lamp posts under sea lanterns. No paintings: a wall of glass is
// no place to hang one.
STYLES.glass = {
  label: 'Glass',
  glass: true,
  themes: {
    house: [
      T('crystal', MAT.SG_LIGHT_BLUE, MAT.QUARTZ, MAT.SG_WHITE, MAT.GLASS, 'quartz', 'birch', MAT.SG_CYAN),
      T('rose', MAT.SG_PINK, MAT.QUARTZ, MAT.SG_WHITE, MAT.GLASS, 'quartz', 'birch', MAT.SG_MAGENTA),
      T('citrine', MAT.SG_YELLOW, MAT.QUARTZ, MAT.SG_WHITE, MAT.GLASS, 'quartz', 'birch', MAT.SG_ORANGE),
    ],
    mid: [
      T('aqua', MAT.SG_CYAN, MAT.QUARTZ, MAT.SG_LIGHT_GRAY, MAT.GLASS, 'quartz', 'birch'),
      T('amethyst', MAT.SG_PURPLE, MAT.QUARTZ, MAT.SG_WHITE, MAT.GLASS, 'quartz', 'birch'),
      T('jade', MAT.SG_LIME, MAT.QUARTZ, MAT.SG_WHITE, MAT.GLASS, 'quartz', 'birch'),
      T('frost', MAT.SG_WHITE, MAT.QUARTZ, MAT.SG_LIGHT_GRAY, MAT.GLASS, 'quartz', 'birch'),
    ],
    tower: [
      T('sapphire', MAT.SG_BLUE, MAT.QUARTZ, MAT.SG_LIGHT_GRAY, MAT.GLASS, 'quartz', 'birch'),
      T('emerald', MAT.SG_GREEN, MAT.QUARTZ, MAT.SG_WHITE, MAT.GLASS, 'quartz', 'birch'),
      T('ruby', MAT.SG_RED, MAT.QUARTZ, MAT.SG_WHITE, MAT.GLASS, 'quartz', 'birch'),
      T('smoke', MAT.TINTED, MAT.QUARTZ, MAT.SG_GRAY, MAT.GLASS, 'quartz', 'birch'),
      T('prism', MAT.GLASS, MAT.QUARTZ, MAT.SG_WHITE, MAT.SG_LIGHT_BLUE, 'quartz', 'birch'),
    ],
  },
  remap: {
    ASPHALT: 'SG_LIGHT_GRAY', SIDEWALK: 'QUARTZ', LINE: 'SG_WHITE', CROSSWALK: 'SG_WHITE', PATH: 'SG_WHITE',
    LOG: 'QUARTZ', LEAVES: 'SG_LIME', SPRUCE_LOG: 'QUARTZ', SPRUCE_LEAF: 'SG_GREEN',
    LAMP_POST: 'PANE', STREET_LIGHT: 'LANTERN',
    WALL_BODY: 'SG_LIGHT_BLUE', WALL_CAP: 'QUARTZ', RETAIN: 'SG_WHITE', INTERIOR_WALL: 'SG_WHITE',
    CANAL_BED: 'QUARTZ', DOCK: 'QUARTZ',
  },
  landmark: { ...MODERN_LANDMARK,
    hallPave: MAT.QUARTZ, hallWall: MAT.SG_WHITE, hallColumn: MAT.QUARTZ, hallCapital: MAT.QUARTZ,
    hallFloor: MAT.SG_LIGHT_GRAY, hallGlass: MAT.SG_LIGHT_BLUE, hallStair: 'quartz', hallDoor: 'birch', entablature: MAT.QUARTZ,
    domeBase: MAT.QUARTZ, domeRing: MAT.QUARTZ, dome: MAT.SG_LIGHT_BLUE, finial: MAT.LANTERN,
    clockPave: [MAT.QUARTZ, MAT.SG_WHITE], clockWall: MAT.SG_CYAN, clockTrim: MAT.QUARTZ, clockFloor: MAT.SG_WHITE,
    clockStair: 'quartz', clockDoor: 'birch', spire: MAT.SG_LIGHT_BLUE,
    libPave: MAT.QUARTZ, libWall: MAT.SG_PURPLE, libTrim: MAT.QUARTZ, libFloor: MAT.SG_WHITE, libStair: 'quartz', libDoor: 'birch',
    schoolWall: MAT.SG_YELLOW, schoolTrim: MAT.QUARTZ,
    market: [MAT.QUARTZ, MAT.SG_WHITE], wellRim: MAT.QUARTZ, wellRoof: MAT.SG_CYAN },
};

// A walled fortress town: the medieval palette inside a curtain wall with
// towers and gatehouses, the castle keep at its heart, narrow streets and small
// lots (city.js: fortressWall, and the overrides in generateCity).
STYLES.fortress = {
  ...STYLES.medieval,
  label: 'Walled fortress',
  fortress: true,
  keepAtCentre: true,
  remap: { ...STYLES.medieval.remap, WALL_BODY: 'STONEBRICK', WALL_CAP: 'STONEBRICK' },
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
