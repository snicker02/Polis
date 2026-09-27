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

export const id = "2g";
export const label = "2g. animals and variety";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const name = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id).block; };
  const def = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id); };
  let pens = 0, badPen = 0, grovesN = 0, badGrove = 0, badBamboo = 0, kinds = new Set(), stations = new Set(), crops = new Set();
  let hay = 0, lamps = 0, chests = 0, lecterns = 0;
  const STATION_BLOCKS = ['cartography_table', 'fletching_table', 'blast_furnace', 'brewing_stand', 'cauldron', 'barrel',
    'smoker', 'lectern', 'stonecutter_block', 'loom', 'grindstone', 'smithing_table', 'composter'];
  for (const seed of [12345, 2, 3, 7]) {
    const r = generateCity({ ...DEFAULTS, size: 192, seed, ranchChance: 0.2, pandaChance: 1 });
    const w = r.world, G = 1;
    for (const p of r.ranches) {
      pens++; kinds.add(p.kind);
      // fence all round except the gate, gate facing the street
      for (let z = p.z0; z <= p.z1; z++) for (let x = p.x0; x <= p.x1; x++) {
        if (!(x === p.x0 || x === p.x1 || z === p.z0 || z === p.z1)) continue;
        const g = r.groundAt(x, z);
        const n = name(w, x, g + 1, z);
        if (x === p.gate[0] && z === p.gate[1]) {
          const d = def(w, x, g + 1, z);
          if (n !== 'minecraft:fence_gate' || d.states['minecraft:cardinal_direction'].value !== p.side) badPen++;
        } else if (n !== 'minecraft:oak_fence' || name(w, x, g + 2, z) !== 'minecraft:oak_fence') badPen++;   // two high
      }
      for (const a of p.animals) if (a.x <= p.x0 || a.x >= p.x1 || a.z <= p.z0 || a.z >= p.z1 || a.type !== p.kind) badPen++;
      if (!p.animals.length) badPen++;
    }
    // groves: pandas inside a fenced bamboo garden; every bamboo stands on grass or bamboo
    const pandas = r.spawns.filter((q) => q.type === 'panda');
    w.forEach((x, y, z, id) => {
      if (MATERIALS.def(id).block !== 'minecraft:bamboo') return;
      const below = name(w, x, y - 1, z);
      if (!['minecraft:bamboo', 'minecraft:grass_block', 'minecraft:sand'].includes(below)) badBamboo++;
    });
    for (const p of pandas) {
      grovesN++;
      // walk out from the panda until a fence or gate is hit in all four directions (it is enclosed)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let hit = false;
        for (let k = 1; k < 24 && !hit; k++) {
          const n = name(w, p.x + dx * k, p.y, p.z + dz * k);
          if (n === 'minecraft:oak_fence' || n === 'minecraft:fence_gate') hit = true;
        }
        if (!hit) badGrove++;
      }
    }
    w.forEach((x, y, z, id) => {
      const b = MATERIALS.def(id).block.replace('minecraft:', '');
      if (STATION_BLOCKS.includes(b)) stations.add(b);
      if (/^(wheat|carrots|beetroot|potatoes)$/.test(b)) crops.add(b);
      if (b === 'hay_block') hay++;
      if (b === 'lantern') lamps++;
      if (b === 'chest') chests++;
      if (b === 'lectern') lecterns++;
    });
    const v = verifyAll(w, r.buildings);
    check(`animals ${seed}: every building floor still reachable`, v.floorsReached === v.floorsChecked);
  }
  check('pens: fenced two high all round, one gate facing the street, animals inside', pens > 0 && badPen === 0, `${badPen} problems in ${pens} pens`);
  check('pens: all four kinds of farm animal appear', kinds.size === 4, [...kinds].join(','));
  check('groves: every panda is fenced in on all sides', grovesN > 0 && badGrove === 0, `${badGrove} open sides`);
  check('groves: every bamboo stalk stands on grass, sand or bamboo', badBamboo === 0, `${badBamboo}`);
  check('interiors: every villager workstation appears (all 13 professions)', stations.size === 13,
    STATION_BLOCKS.filter((b) => !stations.has(b)).join(','));
  check('farms: all four crops grow, including potatoes', crops.size === 4, [...crops].join(','));
  check('variety: hay, lanterns, chests and lecterns placed', hay > 0 && lamps > 0 && chests > 0 && lecterns > 0,
    `hay ${hay} lanterns ${lamps} chests ${chests} lecterns ${lecterns}`);
  note(`${pens} pens (${[...kinds].join(', ')}) · ${grovesN} pandas in groves · ${stations.size} workstation types · ` +
    `${hay} hay · ${lamps} lanterns · ${chests} chests · ${lecterns} lecterns`);
}
