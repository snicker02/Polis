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

export const id = "2v";
export const label = "2v. Java worlds";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const { makeRegion, makeLevelDat, packHeightmap } = await import('../make-java-world.mjs');
  const { makeZip } = await import('../../engine/blockcore.js');
  const { readJavaWorld, readJavaLevelDat, worldKind, unpackHeightmap, gunzip, readJavaNbt } = await import('../../engine/javaworld.js');
  const { siteGround, findSites } = await import('../../engine/worldfile.js');

  // the packing Java uses for heightmaps: nine bits at a time, no value split
  // across two longs
  const heights = new Int16Array(256);
  for (let i = 0; i < 256; i++) heights[i] = (i * 7) % 384;
  const back = unpackHeightmap(packHeightmap(heights));
  check('java worlds: heightmaps pack and unpack exactly', [...heights].every((h, i) => h === back[i]));

  // a region file in Anvil format, read back
  const ground = (x, z) => 64 + Math.round(6 * Math.sin(x / 40) + 4 * Math.cos(z / 33));
  const region = makeRegion(0, 0, ground);
  const files = [
    { name: 'level.dat', data: new Uint8Array(makeLevelDat('Test World', [100, 70, 60])) },
    { name: 'region/r.0.0.mca', data: new Uint8Array(region) },
  ];
  const zipped = await makeZip(files, { deflateRaw });
  const bytes = new Uint8Array(zipped);
  check('java worlds: a zipped world folder is recognised as Java', worldKind(bytes) === 'java');
  const lvl = readJavaLevelDat(bytes);
  check('java worlds: level.dat gives the name and spawn', lvl && lvl.name === 'Test World' && lvl.spawn[0] === 100,
    lvl ? `${lvl.name} at ${lvl.spawn.join(',')}` : 'unreadable');
  const { chunks } = readJavaWorld(bytes);
  check('java worlds: every chunk of the region is read', chunks.size === 1024, `${chunks.size}`);
  let wrong = 0, checked = 0;
  for (const [key, h] of chunks) {
    const [cx, cz] = key.split(',').map(Number);
    for (let i = 0; i < 256; i += 31) {
      const x = cx * 16 + (i % 16), z = cz * 16 + Math.floor(i / 16);
      checked++;
      if (h[i] !== ground(x, z)) wrong++;
    }
  }
  check('java worlds: the heights read back are the heights that were written', wrong === 0, `${wrong} of ${checked} wrong`);

  // and a city fitted to that ground, the same path a Bedrock world takes
  const sites = findSites(chunks, 160, { step: 64 });
  const best = sites.map((s) => ({ s, g: siteGround(chunks, s.x, s.z, 160) }))
    .sort((a, b) => b.g.buildableShare - a.g.buildableShare)[0];
  const city = generateCity({ ...DEFAULTS, size: 160, seed: 7, terrain: best.g, transit: 'rails' });
  const v = verifyAll(city.world, city.buildings);
  check('java worlds: a city fits the ground read from one, and everything is reachable',
    city.buildings.length > 10 && v.ok === v.total && v.floorsReached === v.floorsChecked && city.reach.unreached.length === 0,
    `${city.buildings.length} buildings on ${(best.g.buildableShare * 100).toFixed(0)}% buildable ground`);
  note(`read ${chunks.size} chunks from an Anvil region and fitted a ${city.buildings.length}-building city to them`);
}
