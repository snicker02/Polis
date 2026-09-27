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

export const id = "4";
export const label = "4. mcstructure round-trip";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const biggest = fx.biggestCity();
  const structures = buildStructures(biggest.world, { prefix: 'c' });
  check('structures produced', structures.length > 0);
  const s = structures.reduce((a, b) => (b.cells > a.cells ? b : a));
  const { root } = decodeNbt(s.data);
  const size = root.size;
  check('nbt: format_version present', root.format_version === 1, String(root.format_version));
  check('nbt: size matches box', size && size.length === 3 &&
    size[0] === s.size[0] && size[1] === s.size[1] && size[2] === s.size[2],
    [...(size || [])].join(',') + ' vs ' + s.size.join(','));
  check('nbt: world origin present', root.structure_world_origin && root.structure_world_origin.length === 3);
  const st = root.structure;
  const layers = st.block_indices;
  check('nbt: two block index layers', layers.length === 2, String(layers.length));
  const n = size[0] * size[1] * size[2];
  check('nbt: layer 0 length', layers[0].length === n, `${layers[0].length} vs ${n}`);
  check('nbt: layer 1 length', layers[1].length === n, `${layers[1].length} vs ${n}`);
  let l1bad = 0;
  for (let i = 0; i < layers[1].length; i++) if (layers[1][i] !== -1) l1bad++;
  check('nbt: layer 1 is all empty', l1bad === 0, `${l1bad} set`);

  const pal = st.palette.default.block_palette;
  check('nbt: palette size matches', pal.length === s.paletteSize, `${pal.length} vs ${s.paletteSize}`);
  let idxBad = 0, filled = 0;
  for (let i = 0; i < layers[0].length; i++) {
    const v = layers[0][i];
    if (v === -1) continue;
    filled++;
    if (v < 0 || v >= pal.length) idxBad++;
  }
  check('nbt: indices inside palette', idxBad === 0, `${idxBad} out of range`);
  check('nbt: filled cell count matches', filled === s.cells, `${filled} vs ${s.cells}`);

  // spot-check the mapping: decode a handful of cells back to material ids
  const [sx, sy, sz] = size;
  let spotBad = 0, spots = 0;
  for (let i = 0; i < layers[0].length && spots < 400; i += 37) {
    const v = layers[0][i];
    if (v === -1) continue;
    spots++;
    const z = i % sz, rest = (i - z) / sz;
    const y = rest % sy, x = (rest - y) / sy;
    const id = biggest.world.get(s.box.x0 + x, s.box.y0 + y, s.box.z0 + z);
    if (id === -1) { spotBad++; continue; }
    if (pal[v].name !== MATERIALS.def(id).block) spotBad++;
  }
  check('nbt: index order maps back to the right block', spotBad === 0, `${spotBad}/${spots} wrong`);

  let palBad = 0;
  for (const p of pal) {
    if (typeof p.name !== 'string' || !/^minecraft:[a-z0-9_]+$/.test(p.name)) palBad++;
    if (typeof p.version !== 'number' || p.version <= 0) palBad++;
    if (typeof p.states !== 'object') palBad++;
  }
  check('nbt: palette entries well formed', palBad === 0, `${palBad} problems`);
  note(`largest chunk ${s.size.join('×')} · ${s.cells.toLocaleString()} cells · ` +
    `${s.paletteSize} palette entries · ${(s.data.length / 1024).toFixed(0)} KiB`);
}
