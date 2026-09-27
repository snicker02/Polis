import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import zlib from 'node:zlib';

import { generateCity, generateSingle, DEFAULTS } from '../../engine/city.js';
import { USE } from '../../engine/plan.js';
import { verifyAll, verifyBuilding } from '../../engine/verify.js';
import { MATERIALS, THEMES, DOOR_KINDS, doorId, MAT, BED_VEC, stairId, cropId, CROP_KINDS, bedId, furnaceId, railId, poweredRailId,
  gateId, chestId, lecternId, smokerId, stonecutterId, pumpkinId, loomId, grindstoneId, bambooId, FLOWERS } from '../../engine/materials.js';
import { BLOCK_VERSION } from '../../engine/blockcore.js';
import { VoxelWorld, splitWorld, buildMcPack } from '../../engine/blockcore.js';
import { buildStructures, placementGuide, CHUNK, exportPack, tileList, functionFiles, GROUND_DROP, cityId, exportSalt, POLIS_VERSION, SUMMON_IDS } from '../../engine/export.js';
import { buildMesh, MAX_QUADS, STRIDE } from '../../engine/mesher.js';
import { decodeNbt, readZip, localPayload } from '../nbt-read.js';
import { decodeTyped } from '../nbt-typed.js';
import { walkCity } from '../../engine/terrain.js';
import { CLOCK_FACE, LANDMARK_NAMES } from '../../engine/landmarks.js';
import { STYLES, remapTable } from '../../engine/styles.js';
import { CAT_COATS, SHEEP_COATS, PAINTING_MOTIFS } from '../../engine/entity-templates.js';

export const id = "2j";
export const label = "2j. city styles";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const name = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id).block; };
  const SOIL = { flower: ['minecraft:grass_block', 'minecraft:dirt'],
    dead: ['minecraft:sand', 'minecraft:hardened_clay', 'minecraft:grass_block', 'minecraft:dirt'] };
  const FLOWER_NAMES = new Set(['dandelion', 'cornflower', 'allium', 'azure_bluet', 'blue_orchid', 'poppy', 'oxeye_daisy',
    'lily_of_the_valley', 'pink_tulip', 'red_tulip', 'pink_petals'].map((n) => 'minecraft:' + n));
  const summary = [];
  for (const st of Object.keys(STYLES)) {
    for (const [size, seed, transit] of [[160, 12345, 'rails'], [128, 3, 'roads']]) {
      const r = generateCity({ ...DEFAULTS, size, seed, transit, cityStyle: st });
      const w = r.world;
      const tag = `${st} ${size}/${seed}`;
      const v = verifyAll(w, r.buildings);
      check(`${tag}: every floor reachable`, v.ok === v.total && v.floorsReached === v.floorsChecked, `${v.floorsReached}/${v.floorsChecked}`);
      check(`${tag}: every door reachable from the streets`, r.reach.unreached.length === 0, `${r.reach.unreached.length} not`);
      // no role material the style restyles is left behind
      const table = remapTable(STYLES[st], [...FLOWERS]);
      let leftover = 0;
      w.forEach((x, y, z, id) => { if (table.has(id)) leftover++; });
      check(`${tag}: every restyled material replaced`, leftover === 0, `${leftover} left`);
      // plants on proper ground, cacti with four open sides, snow on solid ground
      let badPlant = 0, badCactus = 0, badSnow = 0, snow = 0, cacti = 0, petals = 0, dead = 0;
      w.forEach((x, y, z, id) => {
        const b = MATERIALS.def(id).block;
        const below = name(w, x, y - 1, z);
        if (FLOWER_NAMES.has(b)) { if (!SOIL.flower.includes(below)) badPlant++; if (b === 'minecraft:pink_petals') petals++; }
        else if (b === 'minecraft:deadbush') { dead++; if (!SOIL.dead.includes(below)) badPlant++; }
        else if (b === 'minecraft:cactus') {
          cacti++;
          if (below !== 'minecraft:sand' && below !== 'minecraft:cactus') badCactus++;
          // only something solid beside it breaks a cactus (a flower or dead bush does not)
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = w.get(x + dx, y, z + dz);
            if (n !== -1 && !MATERIALS.isPassable(n)) badCactus++;
          }
        } else if (b === 'minecraft:snow_layer') {
          snow++;
          const bid = w.get(x, y - 1, z);
          if (bid < 0 || MATERIALS.isPassable(bid)) badSnow++;
        }
      });
      check(`${tag}: flowers and bushes stand on soil they can grow on`, badPlant === 0, `${badPlant}`);
      check(`${tag}: every cactus on sand with nothing solid beside it`, badCactus === 0, `${badCactus}`);
      check(`${tag}: snow only on solid ground`, badSnow === 0, `${badSnow}`);
      if (st === 'snowy') check(`${tag}: snow covers open ground`, snow > 500, String(snow));
      if (st === 'desert') check(`${tag}: cacti and dead bushes in the desert`, cacti > 0 && dead > 0, `${cacti} cacti, ${dead} bushes`);
      if (st === 'cherry') check(`${tag}: pink petals among the flowers`, petals > 0, String(petals));
      if (size === 160) summary.push(`${st}: ${cacti ? cacti + ' cacti · ' : ''}${snow ? snow + ' snow · ' : ''}${petals ? petals + ' petals · ' : ''}${r.buildings.length} buildings`);
    }
  }
  // every style, default settings: at least four pens, one of each farm animal, well stocked
  {
    let short = [];
    for (const st of Object.keys(STYLES)) for (const [size, seed] of [[160, 12345], [128, 3], [224, 4]]) {
      const r = generateCity({ ...DEFAULTS, size, seed, cityStyle: st });
      const kinds = new Set(r.ranches.map((x) => x.kind));
      if (r.ranches.length < 4 || kinds.size < 4 || r.ranches.some((x) => x.animals.length < 4)) short.push(`${st} ${size}/${seed}: ${r.ranches.length} pens`);
    }
    check('pens: every city, every style, has at least four pens with all four farm animals', short.length === 0, short.join('; '));
  }
  // golems scale with the slider
  const g0 = generateCity({ ...DEFAULTS, size: 160, seed: 12345, golemsPer10: 0 }).spawns.filter((p) => p.type === 'golem').length;
  const g5 = generateCity({ ...DEFAULTS, size: 160, seed: 12345, golemsPer10: 5 }).spawns.filter((p) => p.type === 'golem').length;
  check('golems: none at 0 per 10 villagers, more at 5', g0 === 0 && g5 >= 20, `${g0} / ${g5}`);
  note(summary.join('\n   '));
}
