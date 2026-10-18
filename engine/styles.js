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
    lightBlock: MAT.SHROOMLIGHT,     // the flush lights set into the ground
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
// Steampunk: a Victorian industrial town of brick and dark oak, deepslate and copper
// (unwaxed: its roofs and walls of copper turn green in the game as the days go by);
// a smoking chimney stack on every roof, copper pipes down the side walls, lightning
// rods (stylebits.js: steampunkDress); cobbled streets, brick pavements, lanterns on
// dark posts.
STYLES.steampunk = {
  label: 'Steampunk',
  steam: true,
  themes: {
    house: [
      T('foundry', MAT.BRICK, MAT.DARK_FRAME, MAT.DARK_PLANKS, MAT.GLASS, 'copper', 'dark', MAT.COPPER_CUT),
      T('ironworks', MAT.DEEPSLATE_BRICKS, MAT.BRICK, MAT.SPRUCE, MAT.GLASS, 'copper', 'spruce', MAT.COPPER_CUT),
      T('gaslamp', MAT.BRICK, MAT.DEEPSLATE_BRICKS, MAT.DARK_PLANKS, MAT.GLASS, 'deepslate', 'dark', MAT.DEEPSLATE),
    ],
    mid: [
      T('mill', MAT.BRICK, MAT.DARK_FRAME, MAT.DARK_PLANKS, MAT.GLASS, 'brick', 'dark'),
      T('boiler', MAT.DEEPSLATE_BRICKS, MAT.COPPER_CUT, MAT.SPRUCE, MAT.GLASS, 'deepslate', 'spruce'),
      T('brass', MAT.COPPER_BLK, MAT.BRICK, MAT.DARK_PLANKS, MAT.GLASS, 'copper', 'dark'),
    ],
    tower: [
      T('clockwork', MAT.BRICK, MAT.COPPER_CUT, MAT.DARK_PLANKS, MAT.GLASS, 'brick', 'dark'),
      T('foundrytower', MAT.DEEPSLATE_BRICKS, MAT.IRON, MAT.DARK_PLANKS, MAT.TINTED, 'deepslate', 'dark'),
      T('verdigris', MAT.COPPER_CUT, MAT.DEEPSLATE_BRICKS, MAT.SPRUCE, MAT.GLASS, 'copper', 'spruce'),
    ],
  },
  remap: {
    ASPHALT: 'COBBLED_DEEPSLATE', SIDEWALK: 'BRICK', LINE: 'COBBLED_DEEPSLATE', CROSSWALK: 'ANDESITE', PATH: 'GRAVEL',
    LAMP_POST: 'DARK_FENCE', STREET_LIGHT: 'LAMP', WALL_BODY: 'BRICK', WALL_CAP: 'DEEPSLATE_BRICKS', RETAIN: 'BRICK',
    INTERIOR_WALL: 'BRICK', CANAL_BED: 'COBBLED_DEEPSLATE', DOCK: 'DARK_PLANKS',
  },
  landmark: { ...MODERN_LANDMARK,
    hallPave: MAT.COBBLED_DEEPSLATE, hallWall: MAT.BRICK, hallColumn: MAT.DEEPSLATE_BRICKS, hallCapital: MAT.COPPER_CUT,
    hallFloor: MAT.DARK_PLANKS, hallGlass: MAT.GLASS, hallStair: 'brick', hallDoor: 'dark', entablature: MAT.DEEPSLATE_BRICKS,
    domeBase: MAT.BRICK, domeRing: MAT.DEEPSLATE_BRICKS, dome: MAT.COPPER_BLK, finial: MAT.IRON,
    clockPave: [MAT.COBBLED_DEEPSLATE, MAT.BRICK], clockWall: MAT.BRICK, clockTrim: MAT.COPPER_CUT, clockFloor: MAT.DARK_PLANKS,
    clockStair: 'brick', clockDoor: 'dark', spire: MAT.COPPER_CUT,
    libPave: MAT.BRICK, libWall: MAT.DEEPSLATE_BRICKS, libTrim: MAT.BRICK, libFloor: MAT.DARK_PLANKS, libStair: 'deepslate', libDoor: 'dark',
    schoolWall: MAT.BRICK, schoolTrim: MAT.DEEPSLATE_BRICKS,
    market: [MAT.COBBLED_DEEPSLATE, MAT.BRICK], wellRim: MAT.BRICK, wellRoof: MAT.COPPER_CUT },
};

// Santorini: whitewashed houses with flat roofs, blue doors and window frames, blue
// domes on the roofs (a chapel's, a lantern on its cross), bougainvillea over the
// doorways (stylebits.js: santoriniDress); white lanes and cream paths, a white wall
// capped in blue. Best on hills: the town steps down them in terraces.
STYLES.santorini = {
  label: 'Santorini',
  santorini: true,
  flatRoofs: true,                 // a house's roof is flat, for its dome and terrace
  hillTown: true,                  // on hills and low, unless the sliders say otherwise (city.js)
  roofSlab: MAT.C_WHITE,           // whitewashed roofs
  noArcade: true,
  shapedChance: 0,
  themes: {
    house: [
      T('casa', MAT.C_WHITE, MAT.C_BLUE, MAT.SMOOTH_SAND, MAT.GLASS, 'quartz', 'warped', MAT.C_WHITE),
      T('galazio', MAT.C_WHITE, MAT.C_LBLUE, MAT.OAK, MAT.GLASS, 'smoothsand', 'warped', MAT.C_WHITE),
      T('kokkino', MAT.C_WHITE, MAT.T_ORANGE, MAT.SMOOTH_SAND, MAT.GLASS, 'smoothsand', 'warped', MAT.C_WHITE),
      T('kyklades', MAT.CALCITE, MAT.C_BLUE, MAT.OAK, MAT.GLASS, 'quartz', 'warped', MAT.CALCITE),
    ],
    mid: [
      T('kastro', MAT.C_WHITE, MAT.CALCITE, MAT.SMOOTH_SAND, MAT.GLASS, 'quartz', 'warped'),
      T('oia', MAT.C_WHITE, MAT.SMOOTH_SAND, MAT.OAK, MAT.GLASS, 'smoothsand', 'warped'),
      T('fira', MAT.SMOOTH_SAND, MAT.C_WHITE, MAT.OAK, MAT.GLASS, 'smoothsand', 'oak'),
    ],
    tower: [
      T('pyrgos', MAT.C_WHITE, MAT.CALCITE, MAT.SMOOTH_SAND, MAT.GLASS, 'quartz', 'warped'),
      T('faros', MAT.CALCITE, MAT.C_WHITE, MAT.OAK, MAT.GLASS, 'quartz', 'warped'),
    ],
  },
  remap: {
    ASPHALT: 'CALCITE', SIDEWALK: 'WHITE_PATH', LINE: 'CALCITE', CROSSWALK: 'SMOOTH_SAND', PATH: 'SMOOTH_SAND',
    LAMP_POST: 'FENCE', STREET_LIGHT: 'LAMP', WALL_BODY: 'C_WHITE', WALL_CAP: 'C_BLUE', RETAIN: 'C_WHITE',
    INTERIOR_WALL: 'C_WHITE', CANAL_BED: 'SMOOTH_SAND',
  },
  landmark: { ...MODERN_LANDMARK,
    hallPave: MAT.SMOOTH_SAND, hallWall: MAT.C_WHITE, hallColumn: MAT.CALCITE, hallCapital: MAT.C_BLUE,
    hallFloor: MAT.SMOOTH_SAND, hallGlass: MAT.GLASS, hallStair: 'quartz', hallDoor: 'warped', entablature: MAT.C_WHITE,
    domeBase: MAT.C_WHITE, domeRing: MAT.C_WHITE, dome: MAT.C_BLUE, finial: MAT.LAMP,
    clockPave: [MAT.SMOOTH_SAND, MAT.CALCITE], clockWall: MAT.C_WHITE, clockTrim: MAT.C_BLUE, clockFloor: MAT.OAK,
    clockStair: 'quartz', clockDoor: 'warped', spire: MAT.C_BLUE,
    libPave: MAT.SMOOTH_SAND, libWall: MAT.C_WHITE, libTrim: MAT.C_BLUE, libFloor: MAT.OAK, libStair: 'quartz', libDoor: 'warped',
    schoolWall: MAT.C_WHITE, schoolTrim: MAT.C_LBLUE,
    market: [MAT.SMOOTH_SAND, MAT.CALCITE], wellRim: MAT.C_WHITE, wellRoof: MAT.C_BLUE },
};

// Cyberpunk: black towers, deepslate and chrome, tinted glass; a band of neon round
// every other floor, a blade sign down the street front, an antenna with a light on
// every roof (stylebits.js: cyberDress); black streets with magenta lines and cyan
// crossings, deepslate pavements, neon street lights, a wall capped in light.
STYLES.cyberpunk = {
  label: 'Cyberpunk',
  neon: true,
  noArcade: true,
  themes: {
    house: [
      T('capsule', MAT.C_GRAY, MAT.C_BLACK2, MAT.POLISHED_DEEPSLATE, MAT.TINTED, 'deepslate', 'warped', MAT.DEEPSLATE),
      T('stack', MAT.C_BLACK2, MAT.C_MAGENTA, MAT.POLISHED_DEEPSLATE, MAT.TINTED, 'blackstone', 'crimson', MAT.C_BLACK2),
    ],
    mid: [
      T('arcology', MAT.C_BLACK2, MAT.C_GRAY, MAT.POLISHED_DEEPSLATE, MAT.TINTED, 'blackstone', 'crimson'),
      T('neonblock', MAT.DEEPSLATE, MAT.C_MAGENTA, MAT.POLISHED_DEEPSLATE, MAT.SG_PURPLE, 'deepslate', 'warped'),
      T('grid', MAT.C_GRAY, MAT.C_CYAN, MAT.POLISHED_DEEPSLATE, MAT.TINTED, 'deepslate', 'warped'),
    ],
    tower: [
      T('megacorp', MAT.C_BLACK2, MAT.C_CYAN, MAT.POLISHED_DEEPSLATE, MAT.TINTED, 'blackstone', 'warped'),
      T('spire', MAT.DEEPSLATE, MAT.C_MAGENTA, MAT.POLISHED_DEEPSLATE, MAT.SG_MAGENTA, 'deepslate', 'crimson'),
      T('chrome', MAT.IRON, MAT.C_BLACK2, MAT.POLISHED_DEEPSLATE, MAT.TINTED, 'quartz', 'warped'),
    ],
  },
  remap: {
    ASPHALT: 'C_BLACK2', SIDEWALK: 'POLISHED_DEEPSLATE', LINE: 'C_MAGENTA', CROSSWALK: 'C_CYAN', PATH: 'POLISHED_DEEPSLATE',
    STREET_LIGHT: 'FROG_PINK', WALL_BODY: 'C_BLACK2', WALL_CAP: 'SEA_LANTERN', RETAIN: 'DEEPSLATE_BRICKS',
    INTERIOR_WALL: 'C_GRAY', CANAL_BED: 'POLISHED_DEEPSLATE',
  },
  landmark: { ...MODERN_LANDMARK,
    hallPave: MAT.POLISHED_DEEPSLATE, hallWall: MAT.C_BLACK2, hallColumn: MAT.C_GRAY, hallCapital: MAT.SEA_LANTERN,
    hallFloor: MAT.POLISHED_DEEPSLATE, hallGlass: MAT.TINTED, hallStair: 'blackstone', hallDoor: 'warped', entablature: MAT.C_MAGENTA,
    domeBase: MAT.C_BLACK2, domeRing: MAT.C_CYAN, dome: MAT.TINTED, finial: MAT.SEA_LANTERN,
    clockPave: [MAT.POLISHED_DEEPSLATE, MAT.C_BLACK2], clockWall: MAT.C_BLACK2, clockTrim: MAT.C_CYAN, clockFloor: MAT.POLISHED_DEEPSLATE,
    clockStair: 'deepslate', clockDoor: 'warped', spire: MAT.IRON,
    libPave: MAT.POLISHED_DEEPSLATE, libWall: MAT.DEEPSLATE, libTrim: MAT.C_MAGENTA, libFloor: MAT.POLISHED_DEEPSLATE, libStair: 'deepslate', libDoor: 'crimson',
    schoolWall: MAT.C_GRAY, schoolTrim: MAT.C_CYAN,
    market: [MAT.POLISHED_DEEPSLATE, MAT.C_BLACK2], wellRim: MAT.C_GRAY, wellRoof: MAT.C_MAGENTA },
};

// Sunken: a city gone under the sea, to swim through. Prismarine, mossy and cracked
// stone, dark prismarine trim, sea lanterns for lamps; sand for its ground and its
// streets of prismarine brick. A sunken district floods (flood.js): the sea over its
// streets and through its rooms to a dozen blocks up, the tall buildings standing out
// of it, a glass wall holding it in where it meets the dry city (doors where the
// streets cross), a conduit on its open ground giving water breathing; kelp, seagrass,
// coral and sea life in place of villagers and farm animals.
STYLES.sunken = {
  label: 'Sunken',
  sunken: true,
  noArcade: true,
  lightBlock: MAT.SEA_LANTERN,
  themes: {
    house: [
      T('reef', MAT.AQUA_WALL, MAT.DARK_PRISMARINE, MAT.PRISMARINE, MAT.GLASS, 'prismarine', 'warped', MAT.DARK_PRISMARINE),
      T('wreck', MAT.MOSSY_BRICK, MAT.PRISMARINE, MAT.SPRUCE, MAT.GLASS, 'mossy', 'spruce', MAT.PRISMARINE),
      T('grotto', MAT.PRISMARINE, MAT.CRACKED_BRICK, MAT.AQUA_WALL, MAT.GLASS, 'darkprismarine', 'warped', MAT.DARK_PRISMARINE),
    ],
    mid: [
      T('atlantis', MAT.AQUA_WALL, MAT.DARK_PRISMARINE, MAT.PRISMARINE, MAT.GLASS, 'prismarine', 'warped'),
      T('drowned', MAT.MOSSY_BRICK, MAT.CRACKED_BRICK, MAT.SPRUCE, MAT.GLASS, 'mossy', 'spruce'),
      T('lagoon', MAT.PRISMARINE, MAT.AQUA_WALL, MAT.DARK_PRISMARINE, MAT.GLASS, 'darkprismarine', 'warped'),
    ],
    tower: [
      T('monument', MAT.DARK_PRISMARINE, MAT.SEA_LANTERN, MAT.PRISMARINE, MAT.GLASS, 'darkprismarine', 'warped'),
      T('beacon', MAT.AQUA_WALL, MAT.DARK_PRISMARINE, MAT.AQUA_WALL, MAT.GLASS, 'prismarine', 'warped'),
    ],
  },
  remap: {
    GRASS: 'SAND', PLANTER: 'SAND', ASPHALT: 'SAND', SIDEWALK: 'AQUA_WALL', LINE: 'DARK_PRISMARINE', CROSSWALK: 'PRISMARINE', PATH: 'GRAVEL',
    FLOWERS: null, LAMP_POST: 'WARPED_FENCE', STREET_LIGHT: 'SEA_LANTERN',
    WALL_BODY: 'MOSSY_BRICK', WALL_CAP: 'DARK_PRISMARINE', RETAIN: 'MOSSY_BRICK', INTERIOR_WALL: 'PRISMARINE', CANAL_BED: 'SAND',
  },
  landmark: { ...MODERN_LANDMARK,
    hallPave: MAT.AQUA_WALL, hallWall: MAT.PRISMARINE, hallColumn: MAT.DARK_PRISMARINE, hallCapital: MAT.SEA_LANTERN,
    hallFloor: MAT.AQUA_WALL, hallGlass: MAT.GLASS, hallStair: 'prismarine', hallDoor: 'warped', entablature: MAT.DARK_PRISMARINE,
    domeBase: MAT.AQUA_WALL, domeRing: MAT.DARK_PRISMARINE, dome: MAT.PRISMARINE, finial: MAT.SEA_LANTERN,
    clockPave: [MAT.AQUA_WALL, MAT.PRISMARINE], clockWall: MAT.MOSSY_BRICK, clockTrim: MAT.DARK_PRISMARINE, clockFloor: MAT.AQUA_WALL,
    clockStair: 'darkprismarine', clockDoor: 'warped', spire: MAT.PRISMARINE,
    libPave: MAT.AQUA_WALL, libWall: MAT.PRISMARINE, libTrim: MAT.DARK_PRISMARINE, libFloor: MAT.AQUA_WALL, libStair: 'prismarine', libDoor: 'warped',
    schoolWall: MAT.MOSSY_BRICK, schoolTrim: MAT.PRISMARINE,
    market: [MAT.AQUA_WALL, MAT.PRISMARINE], wellRim: MAT.DARK_PRISMARINE, wellRoof: MAT.PRISMARINE },
};

// Mesoamerican: mossy stone and jungle wood; the towers stepped pyramids, a temple on
// top with a roof comb and braziers (building.js: pyramid; stylebits.js: mesoDress);
// vines down the street fronts and leaves along the eaves over the streets; jungle trees;
// on hills, the open spaces paved as plazas, each lot its own terrace (city.js).
STYLES.mesoamerican = {
  label: 'Mesoamerican',
  meso: true,
  pyramid: true,
  noArcade: true,
  shapedChance: 0,
  themes: {
    house: [
      T('milpa', MAT.MOSSY_COBBLE, MAT.JUNGLE_LOG, MAT.JUNGLE, MAT.GLASS, 'jungle', 'jungle', MAT.JUNGLE),
      T('adobe', MAT.MUD_BRICK, MAT.JUNGLE_LOG, MAT.PACKED_MUD, MAT.GLASS, 'mudbrick', 'jungle', MAT.MUD_BRICK),
      T('jade', MAT.MOSSY_BRICK, MAT.CHISELED_STONE, MAT.JUNGLE, MAT.GLASS, 'jungle', 'jungle', MAT.MOSSY_BRICK),
    ],
    mid: [
      T('palenque', MAT.MOSSY_BRICK, MAT.CHISELED_STONE, MAT.JUNGLE, MAT.GLASS, 'mossy', 'jungle'),
      T('copan', MAT.STONEBRICK, MAT.MOSSY_BRICK, MAT.JUNGLE, MAT.GLASS, 'stonebrick', 'jungle'),
      T('uxmal', MAT.CUT_SAND, MAT.CHISELED_SAND, MAT.JUNGLE, MAT.GLASS, 'sandstone', 'jungle'),
    ],
    tower: [
      T('tikal', MAT.MOSSY_BRICK, MAT.CHISELED_STONE, MAT.JUNGLE, MAT.GLASS, 'mossy', 'jungle'),
      T('chichen', MAT.CUT_SAND, MAT.CHISELED_SAND, MAT.JUNGLE, MAT.GLASS, 'sandstone', 'jungle'),
      T('teotihuacan', MAT.MOSSY_COBBLE, MAT.MOSSY_BRICK, MAT.PACKED_MUD, MAT.GLASS, 'mossy', 'jungle'),
    ],
  },
  remap: {
    ASPHALT: 'PACKED_MUD', SIDEWALK: 'MOSSY_BRICK', LINE: 'MOSSY_COBBLE', CROSSWALK: 'CHISELED_STONE', PATH: 'MOSS_BLOCK',
    LOG: 'JUNGLE_LOG', LEAVES: 'JUNGLE_LEAF', SPRUCE_LOG: 'JUNGLE_LOG', SPRUCE_LEAF: 'JUNGLE_LEAF',
    LAMP_POST: 'JUNGLE_FENCE', STREET_LIGHT: 'LAMP',
    WALL_BODY: 'MOSSY_COBBLE', WALL_CAP: 'CHISELED_STONE', RETAIN: 'MOSSY_BRICK', INTERIOR_WALL: 'JUNGLE', CANAL_BED: 'MOSSY_COBBLE',
  },
  landmark: { ...MODERN_LANDMARK,
    hallPave: MAT.MOSSY_BRICK, hallWall: MAT.MOSSY_BRICK, hallColumn: MAT.CHISELED_STONE, hallCapital: MAT.GOLD,
    hallFloor: MAT.JUNGLE, hallGlass: MAT.GLASS, hallStair: 'mossy', hallDoor: 'jungle', entablature: MAT.CHISELED_STONE,
    domeBase: MAT.MOSSY_BRICK, domeRing: MAT.CHISELED_STONE, dome: MAT.MOSSY_COBBLE, finial: MAT.GOLD,
    clockPave: [MAT.MOSSY_BRICK, MAT.STONEBRICK], clockWall: MAT.MOSSY_BRICK, clockTrim: MAT.CHISELED_STONE, clockFloor: MAT.JUNGLE,
    clockStair: 'mossy', clockDoor: 'jungle', spire: MAT.MOSSY_COBBLE,
    libPave: MAT.MOSSY_BRICK, libWall: MAT.MOSSY_BRICK, libTrim: MAT.CHISELED_STONE, libFloor: MAT.JUNGLE, libStair: 'jungle', libDoor: 'jungle',
    schoolWall: MAT.MOSSY_COBBLE, schoolTrim: MAT.JUNGLE_LOG,
    market: [MAT.MOSSY_BRICK, MAT.PACKED_MUD], wellRim: MAT.MOSSY_COBBLE, wellRoof: MAT.JUNGLE },
};

// Moorish / Andalusian: whitewash, brick and terracotta; courtyards with fountains
// (courtyard.js), arcades of pointed arches on the mid-rises' street fronts and pointed
// windows over them (building.js), glazed tile dados, panels and friezes (stylebits.js:
// moorishDress), a minaret for a clock tower (landmarks.js); brick and terracotta
// streets, cream pavements, tiled fountains in the plazas.
STYLES.moorish = {
  label: 'Moorish / Andalusian',
  moorish: true,
  pointedArches: true,
  lancets: true,
  minaret: true,
  fountains: true,
  courtyardChance: 0.65,
  themes: {
    house: [
      T('carmen', MAT.C_WHITE, MAT.T_ORANGE, MAT.TERRACOTTA, MAT.GLASS, 'brick', 'dark', MAT.BRICK),
      T('patio', MAT.T_WHITE, MAT.BRICK, MAT.SMOOTH_SAND, MAT.GLASS, 'brick', 'dark', MAT.BRICK),
      T('zellige', MAT.CALCITE, MAT.C_LBLUE, MAT.TERRACOTTA, MAT.GLASS, 'brick', 'acacia', MAT.BRICK),
    ],
    mid: [
      T('alcazar', MAT.C_WHITE, MAT.BRICK, MAT.TERRACOTTA, MAT.GLASS, 'brick', 'dark'),
      T('medina', MAT.SMOOTH_SAND, MAT.T_ORANGE, MAT.TERRACOTTA, MAT.GLASS, 'smoothsand', 'acacia'),
      T('mudejar', MAT.BRICK, MAT.CUT_SAND, MAT.SMOOTH_SAND, MAT.GLASS, 'brick', 'dark'),
    ],
    tower: [
      T('giralda', MAT.BRICK, MAT.CUT_SAND, MAT.SMOOTH_SAND, MAT.GLASS, 'brick', 'dark'),
      T('alhambra', MAT.T_ORANGE, MAT.C_WHITE, MAT.TERRACOTTA, MAT.GLASS, 'smoothsand', 'dark'),
    ],
  },
  remap: {
    ASPHALT: 'BRICK', SIDEWALK: 'SMOOTH_SAND', LINE: 'T_WHITE', CROSSWALK: 'C_WHITE', PATH: 'TERRACOTTA',
    LOG: 'ACACIA_LOG', LEAVES: 'ACACIA_LEAF', LAMP_POST: 'DARK_FENCE', STREET_LIGHT: 'LAMP',
    WALL_BODY: 'SMOOTH_SAND', WALL_CAP: 'T_ORANGE', RETAIN: 'BRICK', INTERIOR_WALL: 'C_WHITE', CANAL_BED: 'TERRACOTTA',
  },
  landmark: { ...MODERN_LANDMARK,
    hallPave: MAT.SMOOTH_SAND, hallWall: MAT.C_WHITE, hallColumn: MAT.CUT_SAND, hallCapital: MAT.T_ORANGE,
    hallFloor: MAT.TERRACOTTA, hallGlass: MAT.GLASS, hallStair: 'brick', hallDoor: 'dark', entablature: MAT.BRICK,
    domeBase: MAT.C_WHITE, domeRing: MAT.T_ORANGE, dome: MAT.C_WHITE, finial: MAT.GOLD,
    clockPave: [MAT.SMOOTH_SAND, MAT.TERRACOTTA], clockWall: MAT.BRICK, clockTrim: MAT.CUT_SAND, clockFloor: MAT.TERRACOTTA,
    clockStair: 'brick', clockDoor: 'dark', spire: MAT.T_ORANGE,
    libPave: MAT.SMOOTH_SAND, libWall: MAT.C_WHITE, libTrim: MAT.BRICK, libFloor: MAT.TERRACOTTA, libStair: 'brick', libDoor: 'dark',
    schoolWall: MAT.C_WHITE, schoolTrim: MAT.T_ORANGE,
    market: [MAT.SMOOTH_SAND, MAT.TERRACOTTA], wellRim: MAT.CUT_SAND, wellRoof: MAT.T_ORANGE },
};

// Elven / forest: mangrove and moss; every building wrapped round a great tree, its
// corners trunks that rise past the roof into a crown of leaves; lanterns hung on chains
// under the eaves (stylebits.js: elvenDress); moss streets, mangrove trees.
STYLES.elven = {
  label: 'Elven / forest',
  elven: true,
  noArcade: true,
  shapedChance: 0,
  themes: {
    house: [
      T('glade', MAT.MANGROVE, MAT.MANGROVE_LOG, MAT.MANGROVE, MAT.GLASS, 'mangrove', 'mangrove', MAT.MOSS_BLOCK),
      T('hollow', MAT.MOSS_BLOCK, MAT.MANGROVE_LOG, MAT.MANGROVE, MAT.GLASS, 'mangrove', 'mangrove', MAT.MOSS_BLOCK),
      T('bower', MAT.MOSSY_BRICK, MAT.MANGROVE_LOG, MAT.MANGROVE, MAT.GLASS, 'mangrove', 'mangrove', MAT.MANGROVE),
    ],
    mid: [
      T('grove', MAT.MANGROVE, MAT.MANGROVE_LOG, MAT.MANGROVE, MAT.GLASS, 'mangrove', 'mangrove'),
      T('mossgate', MAT.MOSS_BLOCK, MAT.MANGROVE, MAT.MANGROVE, MAT.GLASS, 'mangrove', 'mangrove'),
      T('thornwall', MAT.MOSSY_BRICK, MAT.MANGROVE, MAT.MANGROVE, MAT.GLASS, 'mossy', 'mangrove'),
    ],
    tower: [
      T('elderwood', MAT.MANGROVE, MAT.MOSS_BLOCK, MAT.MANGROVE, MAT.GLASS, 'mangrove', 'mangrove'),
      T('starbough', MAT.MOSSY_BRICK, MAT.MANGROVE, MAT.MANGROVE, MAT.GLASS, 'mangrove', 'mangrove'),
    ],
  },
  remap: {
    ASPHALT: 'MOSS_BLOCK', SIDEWALK: 'MOSSY_COBBLE', LINE: 'MOSSY_BRICK', CROSSWALK: 'MANGROVE', PATH: 'MOSS_BLOCK',
    LOG: 'MANGROVE_LOG', LEAVES: 'MANGROVE_LEAF', SPRUCE_LOG: 'MANGROVE_LOG', SPRUCE_LEAF: 'MANGROVE_LEAF',
    LAMP_POST: 'MANGROVE_FENCE', STREET_LIGHT: 'LAMP',
    WALL_BODY: 'MOSSY_COBBLE', WALL_CAP: 'MOSS_BLOCK', RETAIN: 'MOSSY_BRICK', INTERIOR_WALL: 'MANGROVE', CANAL_BED: 'MOSS_BLOCK',
  },
  landmark: { ...MODERN_LANDMARK,
    hallPave: MAT.MOSSY_BRICK, hallWall: MAT.MANGROVE, hallColumn: MAT.MANGROVE_LOG, hallCapital: MAT.MOSS_BLOCK,
    hallFloor: MAT.MANGROVE, hallGlass: MAT.GLASS, hallStair: 'mangrove', hallDoor: 'mangrove', entablature: MAT.MANGROVE_LOG,
    domeBase: MAT.MANGROVE, domeRing: MAT.MANGROVE_LOG, dome: MAT.MANGROVE_LEAF, finial: MAT.LAMP,
    clockPave: [MAT.MOSSY_BRICK, MAT.MOSS_BLOCK], clockWall: MAT.MANGROVE, clockTrim: MAT.MANGROVE_LOG, clockFloor: MAT.MANGROVE,
    clockStair: 'mangrove', clockDoor: 'mangrove', spire: MAT.MANGROVE_LEAF,
    libPave: MAT.MOSSY_BRICK, libWall: MAT.MANGROVE, libTrim: MAT.MANGROVE_LOG, libFloor: MAT.MANGROVE, libStair: 'mangrove', libDoor: 'mangrove',
    schoolWall: MAT.MANGROVE, schoolTrim: MAT.MANGROVE_LOG,
    market: [MAT.MOSSY_BRICK, MAT.MOSS_BLOCK], wellRim: MAT.MOSSY_COBBLE, wellRoof: MAT.MANGROVE },
};

// End city: purpur and end stone; purpur pillars at the corners, end rods for lights on
// the roofs (stylebits.js: endDress) and on the street lamps; the ground end stone, the
// trees chorus plants, a chorus flower on each (city.js: applyStyle).
STYLES.endcity = {
  label: 'End city',
  endcity: true,
  chorus: true,
  noArcade: true,
  shapedChance: 0,
  lightBlock: MAT.FROG_PINK,
  themes: {
    house: [
      T('shulker', MAT.PURPUR, MAT.PURPUR_PILLAR, MAT.END_BRICKS, MAT.SG_MAGENTA, 'purpur', 'crimson', MAT.PURPUR),
      T('voidhut', MAT.END_BRICKS, MAT.PURPUR, MAT.END_STONE, MAT.SG_PURPLE, 'purpur', 'crimson', MAT.PURPUR),
    ],
    mid: [
      T('outpost', MAT.PURPUR, MAT.END_BRICKS, MAT.END_BRICKS, MAT.SG_MAGENTA, 'purpur', 'crimson'),
      T('enderhall', MAT.END_BRICKS, MAT.PURPUR_PILLAR, MAT.PURPUR, MAT.SG_PURPLE, 'purpur', 'crimson'),
    ],
    tower: [
      T('spire', MAT.PURPUR, MAT.PURPUR_PILLAR, MAT.END_BRICKS, MAT.SG_MAGENTA, 'purpur', 'crimson'),
      T('stronghold', MAT.END_BRICKS, MAT.PURPUR, MAT.PURPUR, MAT.SG_PURPLE, 'purpur', 'crimson'),
    ],
  },
  remap: {
    GRASS: 'END_STONE', PLANTER: 'END_STONE', ASPHALT: 'END_BRICKS', SIDEWALK: 'PURPUR', LINE: 'PURPUR_PILLAR', CROSSWALK: 'END_STONE', PATH: 'END_STONE',
    LEAVES: null, SPRUCE_LEAF: null, FLOWERS: null,
    LAMP_POST: 'PURPUR_PILLAR', STREET_LIGHT: 'END_ROD',
    WALL_BODY: 'END_BRICKS', WALL_CAP: 'PURPUR', RETAIN: 'END_BRICKS', INTERIOR_WALL: 'PURPUR', CANAL_BED: 'END_STONE',
  },
  landmark: { ...MODERN_LANDMARK,
    hallPave: MAT.END_BRICKS, hallWall: MAT.PURPUR, hallColumn: MAT.PURPUR_PILLAR, hallCapital: MAT.END_ROD,
    hallFloor: MAT.END_BRICKS, hallGlass: MAT.SG_MAGENTA, hallStair: 'purpur', hallDoor: 'crimson', entablature: MAT.PURPUR_PILLAR,
    domeBase: MAT.PURPUR, domeRing: MAT.PURPUR_PILLAR, dome: MAT.PURPUR, finial: MAT.END_ROD,
    clockPave: [MAT.END_BRICKS, MAT.PURPUR], clockWall: MAT.PURPUR, clockTrim: MAT.PURPUR_PILLAR, clockFloor: MAT.END_BRICKS,
    clockStair: 'purpur', clockDoor: 'crimson', spire: MAT.PURPUR,
    libPave: MAT.END_BRICKS, libWall: MAT.END_BRICKS, libTrim: MAT.PURPUR, libFloor: MAT.PURPUR, libStair: 'purpur', libDoor: 'crimson',
    schoolWall: MAT.PURPUR, schoolTrim: MAT.END_BRICKS,
    market: [MAT.END_BRICKS, MAT.PURPUR], wellRim: MAT.PURPUR, wellRoof: MAT.PURPUR_PILLAR },
};

// Dwarven: deepslate and blackstone with gold trim; lava behind glass up the corners for
// light (stylebits.js: dwarvenDress); blackstone streets lined in gold; the metro dug
// under it, while that option is where it was (city.js).
STYLES.dwarven = {
  label: 'Dwarven',
  dwarven: true,
  noArcade: true,
  shapedChance: 0,
  lightBlock: MAT.SHROOMLIGHT,
  themes: {
    house: [
      T('hearth', MAT.DEEPSLATE_BRICKS, MAT.GOLD, MAT.POLISHED_DEEPSLATE, MAT.TINTED, 'deepslate', 'dark', MAT.DEEPSLATE_TILES),
      T('forge', MAT.POL_BLACKSTONE, MAT.GILDED_BLACKSTONE, MAT.POLISHED_DEEPSLATE, MAT.TINTED, 'blackstone', 'dark', MAT.DEEPSLATE_TILES),
    ],
    mid: [
      T('hall', MAT.DEEPSLATE_BRICKS, MAT.GOLD, MAT.POLISHED_DEEPSLATE, MAT.TINTED, 'deepslate', 'dark'),
      T('anvil', MAT.DEEPSLATE_TILES, MAT.GILDED_BLACKSTONE, MAT.POLISHED_DEEPSLATE, MAT.TINTED, 'deepslate', 'dark'),
      T('vault', MAT.POL_BLACKSTONE, MAT.GOLD, MAT.DEEPSLATE_TILES, MAT.TINTED, 'blackstone', 'dark'),
    ],
    tower: [
      T('throne', MAT.DEEPSLATE_BRICKS, MAT.GOLD, MAT.POLISHED_DEEPSLATE, MAT.TINTED, 'deepslate', 'dark'),
      T('delve', MAT.DEEPSLATE_TILES, MAT.GOLD, MAT.POL_BLACKSTONE, MAT.TINTED, 'blackstone', 'dark'),
    ],
  },
  remap: {
    ASPHALT: 'POL_BLACKSTONE', SIDEWALK: 'POLISHED_DEEPSLATE', LINE: 'GOLD', CROSSWALK: 'DEEPSLATE_TILES', PATH: 'COBBLED_DEEPSLATE',
    LAMP_POST: 'POL_BLACKSTONE', STREET_LIGHT: 'SHROOMLIGHT',
    WALL_BODY: 'DEEPSLATE_BRICKS', WALL_CAP: 'GOLD', RETAIN: 'DEEPSLATE_BRICKS', INTERIOR_WALL: 'POLISHED_DEEPSLATE', CANAL_BED: 'COBBLED_DEEPSLATE',
  },
  landmark: { ...MODERN_LANDMARK,
    hallPave: MAT.POLISHED_DEEPSLATE, hallWall: MAT.DEEPSLATE_BRICKS, hallColumn: MAT.POL_BLACKSTONE, hallCapital: MAT.GOLD,
    hallFloor: MAT.POLISHED_DEEPSLATE, hallGlass: MAT.TINTED, hallStair: 'deepslate', hallDoor: 'dark', entablature: MAT.GOLD,
    domeBase: MAT.DEEPSLATE_BRICKS, domeRing: MAT.GOLD, dome: MAT.DEEPSLATE_TILES, finial: MAT.GOLD,
    clockPave: [MAT.POLISHED_DEEPSLATE, MAT.DEEPSLATE_TILES], clockWall: MAT.DEEPSLATE_BRICKS, clockTrim: MAT.GOLD, clockFloor: MAT.POLISHED_DEEPSLATE,
    clockStair: 'deepslate', clockDoor: 'dark', spire: MAT.DEEPSLATE_TILES,
    libPave: MAT.POLISHED_DEEPSLATE, libWall: MAT.DEEPSLATE_BRICKS, libTrim: MAT.GOLD, libFloor: MAT.POLISHED_DEEPSLATE, libStair: 'deepslate', libDoor: 'dark',
    schoolWall: MAT.DEEPSLATE_BRICKS, schoolTrim: MAT.GILDED_BLACKSTONE,
    market: [MAT.POLISHED_DEEPSLATE, MAT.POL_BLACKSTONE], wellRim: MAT.DEEPSLATE_BRICKS, wellRoof: MAT.GOLD },
};

// Brutalist: raw concrete; the windows set deep in a grid of concrete slabs and fins, the
// floors over the ground floor hanging out over it on columns (building.js: cantilever;
// stylebits.js: brutalDress); flat roofs; concrete streets and pavements.
STYLES.brutalist = {
  label: 'Brutalist',
  brutal: true,
  cantilever: true,
  flatRoofs: true,
  roofSlab: MAT.C_LGRAY,
  noArcade: true,
  shapedChance: 0,
  themes: {
    house: [
      T('bunker', MAT.C_LGRAY, MAT.C_GRAY, MAT.SMOOTH, MAT.GLASS, 'stonebrick', 'spruce', MAT.C_LGRAY),
      T('slab', MAT.SMOOTH, MAT.C_LGRAY, MAT.SMOOTH, MAT.GLASS, 'stonebrick', 'dark', MAT.SMOOTH),
    ],
    mid: [
      T('estate', MAT.C_LGRAY, MAT.SMOOTH, MAT.SMOOTH, MAT.GLASS, 'stonebrick', 'spruce'),
      T('barbican', MAT.C_GRAY, MAT.C_LGRAY, MAT.SMOOTH, MAT.TINTED, 'stonebrick', 'dark'),
    ],
    tower: [
      T('trellick', MAT.C_LGRAY, MAT.C_GRAY, MAT.SMOOTH, MAT.GLASS, 'stonebrick', 'spruce'),
      T('habitat', MAT.SMOOTH, MAT.C_LGRAY, MAT.SMOOTH, MAT.TINTED, 'stonebrick', 'dark'),
    ],
  },
  remap: {
    ASPHALT: 'C_GRAY', SIDEWALK: 'C_LGRAY', LINE: 'SMOOTH', CROSSWALK: 'SMOOTH', PATH: 'C_LGRAY',
    LAMP_POST: 'C_GRAY', STREET_LIGHT: 'LAMP',
    WALL_BODY: 'C_LGRAY', WALL_CAP: 'SMOOTH', RETAIN: 'C_LGRAY', INTERIOR_WALL: 'C_LGRAY', CANAL_BED: 'C_GRAY',
  },
  landmark: { ...MODERN_LANDMARK,
    hallPave: MAT.C_LGRAY, hallWall: MAT.C_LGRAY, hallColumn: MAT.C_GRAY, hallCapital: MAT.SMOOTH,
    hallFloor: MAT.SMOOTH, hallGlass: MAT.GLASS, hallStair: 'stonebrick', hallDoor: 'spruce', entablature: MAT.C_GRAY,
    domeBase: MAT.C_LGRAY, domeRing: MAT.C_GRAY, dome: MAT.C_LGRAY, finial: MAT.LAMP,
    clockPave: [MAT.C_LGRAY, MAT.SMOOTH], clockWall: MAT.C_LGRAY, clockTrim: MAT.C_GRAY, clockFloor: MAT.SMOOTH,
    clockStair: 'stonebrick', clockDoor: 'spruce', spire: MAT.C_GRAY,
    libPave: MAT.C_LGRAY, libWall: MAT.C_LGRAY, libTrim: MAT.C_GRAY, libFloor: MAT.SMOOTH, libStair: 'stonebrick', libDoor: 'spruce',
    schoolWall: MAT.C_LGRAY, schoolTrim: MAT.C_GRAY,
    market: [MAT.C_LGRAY, MAT.SMOOTH], wellRim: MAT.C_GRAY, wellRoof: MAT.C_LGRAY },
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
