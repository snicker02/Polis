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

export const id = "6c";
export const label = "6c. city ids";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const A1 = generateCity({ ...DEFAULTS, size: 128, seed: 12345 });
  const idA1 = cityId(A1.world, 12345);
  // churn the material registry with other generations, then regenerate
  generateCity({ ...DEFAULTS, size: 96, seed: 7, useStairs: false });
  generateSingle({ ...DEFAULTS, style: 'house', floors: 3, pitch: 6, bw: 11, bd: 11, seed: 3 });
  const A2 = generateCity({ ...DEFAULTS, size: 128, seed: 12345 });
  const idA2 = cityId(A2.world, 12345);
  const B = generateCity({ ...DEFAULTS, size: 128, seed: 12345, maxFloors: 9 });
  const idB = cityId(B.world, 12345);
  const C = generateCity({ ...DEFAULTS, size: 128, seed: 12346 });
  const idC = cityId(C.world, 12346);

  check('city id: valid Bedrock namespace', /^[a-z0-9_]+$/.test(idA1), idA1);
  check('city id: starts with polis_ and carries the seed', idA1.startsWith('polis_12345_'), idA1);
  check('city id: same city -> same id, even after other generations', idA1 === idA2, `${idA1} vs ${idA2}`);
  check('city id: same seed, different settings -> different id', idA1 !== idB, `${idA1} vs ${idB}`);
  check('city id: different seed -> different id', idA1 !== idC);
  check('city id: negative seeds still valid', /^polis_\d+_[0-9a-f]{4}$/.test(cityId(A1.world, -5)));

  // two packs exported together share no structure or function paths
  const pa = await exportPack(A1.world, { namespace: idA1, seed: 12345, deflateRaw });
  const pb = await exportPack(B.world, { namespace: idB, seed: 12345, deflateRaw });
  const na = new Set(readZip(pa.data).entries.map((e) => e.name).filter((n) => n !== 'manifest.json' && n !== 'placement-guide.txt'));
  const nb = readZip(pb.data).entries.map((e) => e.name).filter((n) => n !== 'manifest.json' && n !== 'placement-guide.txt');
  const clash = nb.filter((n) => na.has(n));
  check('two cities: no shared structure/function paths', clash.length === 0, clash.slice(0, 3).join(', '));

  // functions reference their own namespace, and the files live under it
  const za = readZip(pa.data);
  const fe = za.entries.find((e) => e.name === `functions/${idA1}/build_centered.mcfunction`);
  check('pack: function lives under the city namespace', !!fe);
  if (fe) {
    const p = localPayload(pa.data, fe);
    const txt = new TextDecoder().decode(fe.method === 8 ? zlib.inflateRawSync(Buffer.from(p)) : p);
    const loads = txt.split('\n').filter((l) => l.startsWith('structure load '));
    check('function: every load uses the city namespace', loads.length > 0 && loads.every((l) => l.startsWith(`structure load ${idA1}:`)));
    const paths = new Set(za.entries.map((e) => e.name));
    check('function: every referenced structure exists in the pack',
      loads.every((l) => paths.has(`structures/${idA1}/${l.split(' ')[2].split(':')[1]}.mcstructure`)));
  }
  // the guide leads with the exact command and names the seed
  const first = pa.guide.split('\n').slice(0, 8).join('\n');
  check('guide: the build command is in the first lines', first.includes(`/function ${idA1}/build_centered`));
  check('guide: names the seed and city id', pa.guide.includes('seed 12345') && pa.guide.includes(`City id  ${idA1}`));
  note(`${idA1} · ${idB} · ${idC}`);
}
