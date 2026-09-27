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

export const id = "6";
export const label = "6. mcpack zip";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const small = generateCity({ ...DEFAULTS, size: 96, seed: 31 });
  const structures = buildStructures(small.world, { prefix: 'c' });
  const guide = placementGuide(structures, { base: [10, 64, -20] });
  const zipBytes = await buildMcPack(structures, { guide, deflateRaw, rand: () => 0.5 });
  const z = readZip(zipBytes);
  check('zip: entry count matches directory', z.entries.length === z.count, `${z.entries.length}/${z.count}`);
  const names = z.entries.map((e) => e.name);
  check('zip: manifest present', names.includes('manifest.json'));
  check('zip: guide present', names.includes('placement-guide.txt'));
  check('zip: one structure file per chunk',
    names.filter((n) => n.endsWith('.mcstructure')).length === structures.length,
    `${names.filter((n) => n.endsWith('.mcstructure')).length} vs ${structures.length}`);
  check('zip: structures live under structures/polis/',
    names.filter((n) => n.endsWith('.mcstructure')).every((n) => n.startsWith('structures/polis/')));

  const inflate = (e) => {
    const p = localPayload(zipBytes, e);
    return e.method === 8 ? new Uint8Array(zlib.inflateRawSync(Buffer.from(p))) : p;
  };
  const man = z.entries.find((e) => e.name === 'manifest.json');
  let manifest = null;
  try { manifest = JSON.parse(new TextDecoder().decode(inflate(man))); } catch (e) { /* caught below */ }
  check('zip: manifest.json parses', !!manifest);
  if (manifest) {
    check('manifest: format_version 2', manifest.format_version === 2);
    check('manifest: header uuid looks like a uuid',
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(manifest.header.uuid),
      manifest.header.uuid);
    check('manifest: has a data module', manifest.modules.some((m) => m.type === 'data'));
    check('manifest: module uuid differs from header uuid',
      manifest.modules[0].uuid !== manifest.header.uuid);
    check('manifest: min_engine_version set', Array.isArray(manifest.header.min_engine_version));
  }

  // payload fidelity for every structure entry
  let byteBad = 0, crcBad = 0;
  for (const e of z.entries.filter((x) => x.name.endsWith('.mcstructure'))) {
    const src = structures.find((s) => e.name.endsWith(`/${s.name}.mcstructure`));
    const got = inflate(e);
    if (!src || got.length !== src.data.length) { byteBad++; continue; }
    for (let i = 0; i < got.length; i++) if (got[i] !== src.data[i]) { byteBad++; break; }
    if (e.raw !== src.data.length) crcBad++;
  }
  check('zip: structure payloads survive the round trip', byteBad === 0, `${byteBad} corrupted`);
  check('zip: uncompressed sizes recorded correctly', crcBad === 0, `${crcBad} wrong`);

  // guide has one load command per structure and correct offsets
  const cmds = guide.split('\n').filter((l) => l.includes('/structure load'));
  check('guide: one command per structure', cmds.length === structures.length,
    `${cmds.length} vs ${structures.length}`);
  let cmdBad = 0;
  for (let i = 0; i < structures.length; i++) {
    const s = structures[i];
    const want = `/structure load polis:${s.name} ${10 + s.offset[0]} ${64 + s.offset[1]} ${-20 + s.offset[2]}`;
    if (cmds[i].trim() !== want) { cmdBad++; if (cmdBad === 1) note('got: ' + cmds[i].trim() + '\n   want: ' + want); }
  }
  check('guide: commands carry the right base offsets', cmdBad === 0, `${cmdBad} wrong`);
  note(`${structures.length} structures · zip ${(zipBytes.length / 1024).toFixed(0)} KiB ` +
    `(deflated from ${(structures.reduce((a, s) => a + s.data.length, 0) / 1024).toFixed(0)} KiB)`);
}
