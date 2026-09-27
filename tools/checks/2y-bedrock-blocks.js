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

export const id = "2y";
export const label = "2y. Bedrock blocks";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const { decodeSubChunk, chunkGround, exactGround } = await import('../../engine/bedrockblocks.js');

  // build a subchunk the way Bedrock stores one: a palette, indices packed
  // into words, and the blocks ordered x, then z, then y
  const palette = ['minecraft:air', 'minecraft:stone', 'minecraft:grass_block', 'minecraft:oak_leaves', 'minecraft:water'];
  const bits = 4, perWord = Math.floor(32 / bits), words = Math.ceil(4096 / perWord);
  const idx = new Uint8Array(4096);
  const at = (x, y, z) => ((x * 16) + z) * 16 + y;
  for (let x = 0; x < 16; x++)
    for (let z = 0; z < 16; z++) {
      const h = 4 + ((x + z) % 3);                       // a little relief
      for (let y = 0; y <= h; y++) idx[at(x, y, z)] = y === h ? 2 : 1;
      if (x === 0) { idx[at(x, h + 1, z)] = 4; }         // a strip of water on top
      if (x === 1) { idx[at(x, h + 3, z)] = 3; }         // a tree's leaves, floating above
    }
  const body = [];
  body.push(9, 1, 0, (bits << 1) | 1);                   // version, storages, y index, header
  const wordBytes = new Uint8Array(words * 4);
  const wdv = new DataView(wordBytes.buffer);
  for (let w = 0; w < words; w++) {
    let word = 0;
    for (let k = 0; k < perWord; k++) {
      const i = w * perWord + k;
      if (i >= 4096) break;
      word |= (idx[i] & 0xf) << (k * bits);
    }
    wdv.setUint32(w * 4, word >>> 0, true);
  }
  const countBytes = new Uint8Array(4);
  new DataView(countBytes.buffer).setInt32(0, palette.length, true);
  // each palette entry is a little-endian NBT compound with a name
  const enc = new TextEncoder();
  const paletteBytes = [];
  for (const name of palette) {
    const n = enc.encode(name), key = enc.encode('name');
    const out = [10, 0, 0];                              // compound, empty name
    out.push(8, key.length & 0xff, key.length >> 8, ...key, n.length & 0xff, n.length >> 8, ...n);
    out.push(0);                                         // end of compound
    paletteBytes.push(...out);
  }
  const bytes = new Uint8Array([...body, ...wordBytes, ...countBytes, ...paletteBytes]);

  const sc = decodeSubChunk(bytes);
  check('bedrock blocks: a subchunk decodes to its palette and indices',
    sc && sc.names.length === palette.length && sc.indices.length === 4096,
    sc ? `${sc.names.length} palette entries` : 'failed');
  const g = chunkGround([sc]);
  let right = 0, wet = 0, leafy = 0;
  for (let x = 0; x < 16; x++)
    for (let z = 0; z < 16; z++) {
      const want = 4 + ((x + z) % 3);
      const got = g.ground[z * 16 + x];
      if (got === want) right++;
      if (g.water[z * 16 + x]) wet++;
      if (got > want) leafy++;
    }
  check('bedrock blocks: the ground is the ground, not the treetops', right === 256 && leafy === 0, `${right}/256 columns right`);
  check('bedrock blocks: water on top of the ground is noticed', wet === 16, `${wet} wet columns`);
  // with nothing indexed there is nothing to read, and it must not throw
  const empty = exactGround({ entries: [], read: () => { throw new Error('no'); } }, new Map(), 0, 0, 16);
  check('bedrock blocks: a site with no blocks to read comes back empty, not broken',
    empty.ground.length === 256 && [...empty.ground].every((v) => v < -900));
  note('subchunk format: palette, packed indices, x then z then y');
}
