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

export const id = "2i";
export const label = "2i. outline and hills";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  let cities = 0, irregular = 0, badPiece = 0, outside = 0, raisedNoStairs = 0, unreached = 0, total = 0;
  let raised = 0, stairs = 0, streetsNotLevel = 0, hollow = 0, maxE = 0;
  let badFacing = 0, straightRuns = 0, stairsAll = 0, badStraight = 0, badEntry = 0;
  const WD = { '1,0': 0, '-1,0': 1, '0,1': 2, '0,-1': 3 };      // weirdo_direction: east, west, south, north
  for (const [size, seed, transit] of [[160, 12345, 'roads'], [192, 1, 'rails'], [128, 2, 'trams'], [224, 3, 'rails'],
                                         [96, 4, 'roads'], [256, 5, 'rails'], [160, 6, 'trams'], [192, 7, 'roads']]) {
    const r = generateCity({ ...DEFAULTS, size, seed, transit, hills: 3 });
    const w = r.world, { W, D, mask, use } = r.plan;
    cities++;
    // outline: irregular (clearly not the full rectangle), one connected piece, nothing outside it
    let area = 0; for (let i = 0; i < W * D; i++) if (mask[i]) area++;
    if (area < W * D * 0.95) irregular++;
    const seen = new Uint8Array(W * D); let first = mask.indexOf(1), comps = 0;
    for (let i0 = 0; i0 < W * D; i0++) {
      if (!mask[i0] || seen[i0]) continue;
      comps++;
      const q = [i0]; seen[i0] = 1;
      for (let h = 0; h < q.length; h++) {
        const i = q[h], x = i % W, z = (i - x) / W;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz, j = nz * W + nx;
          if (nx < 0 || nz < 0 || nx >= W || nz >= D || !mask[j] || seen[j]) continue;
          seen[j] = 1; q.push(j);
        }
      }
    }
    if (comps !== 1 || first < 0) badPiece++;
    w.forEach((x, y, z) => { if (x < 0 || z < 0 || x >= W || z >= D || !mask[z * W + x]) outside++; });
    // hills
    for (const b of r.hills.blocks) {
      if (!b.e) continue;
      raised++; maxE = Math.max(maxE, b.e);
      const n = r.stairRuns.filter((s2) => s2.block.x0 === b.x0 && s2.block.z0 === b.z0).length;
      stairs += n;
      if (!n) raisedNoStairs++;
      // the terrace is solid from the base up to its surface (staircase cells
      // are cut down on purpose; below each step they must still be solid)
      const stairAt = new Map();
      for (const s2 of r.stairRuns) s2.cells.forEach(([sx, sz], i) => stairAt.set(sx + ',' + sz, i));
      // the notch at the foot of a flight along the kerb is cut to street level on purpose
      for (const s2 of r.stairRuns) if (s2.foot) stairAt.set(s2.foot.join(','), -1);
      for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) {
        const i = stairAt.get(x + ',' + z);
        const topSolid = i === undefined ? 1 + b.e : 1 + i;       // step i sits on solid ground up to y = 1 + i (a notch: y = 0)
        for (let y = 0; y <= topSolid; y++) if (!w.has(x, y, z)) hollow++;
      }
    }
    // streets stay level: every road cell has its surface at the street level
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++)
      if (use[z * W + x] === USE.ROAD && r.groundAt(x, z) !== 1) streetsNotLevel++;
    total += r.reach.total; unreached += r.reach.unreached.length;
    const solidW = (x, y, z) => { const id = w.get(x, y, z); return id !== -1 && !MATERIALS.isPassable(id); };
    for (const run of r.stairRuns) {
      stairsAll++;
      if (run.kind === 'straight' || run.kind === 'stoop') {
        straightRuns++;
        if (run.dir[0] !== -run.out[0] || run.dir[1] !== -run.out[1]) badStraight++;
      }
      // entered head on: the cell before the first step, against the climb, is
      // street-level ground with room to stand (never the side of a step)
      const [fx, fz] = [run.cells[0][0] - run.dir[0], run.cells[0][1] - run.dir[1]];
      if (!(solidW(fx, 1, fz) && !solidW(fx, 2, fz) && !solidW(fx, 3, fz))) badEntry++;
      run.cells.forEach(([x, z], i) => {
        const id = w.get(x, 2 + i, z);
        const d = id < 0 ? null : MATERIALS.def(id);
        if (!d || !/_stairs$/.test(d.block) || d.states.weirdo_direction.value !== WD[run.dir.join()]) badFacing++;
      });
    }
  }
  check('outline: every organic city is irregular, not the full rectangle', irregular === cities, `${irregular}/${cities}`);
  check('outline: every city is one connected piece', badPiece === 0, `${badPiece} split`);
  check('outline: nothing is placed outside the city outline', outside === 0, `${outside} blocks`);
  check('hills: blocks are raised, up to three', raised > 0 && maxE === 3, `${raised} raised, max ${maxE}`);
  check('hills: every raised block has a staircase from the street', raisedNoStairs === 0, `${raisedNoStairs} without`);
  check('hills: every building door can be walked to from the streets', unreached === 0, `${unreached}/${total} unreachable`);
  check('hills: streets stay level (railway untouched)', streetsNotLevel === 0, `${streetsNotLevel}`);
  check('hills: every step faces the way its staircase climbs', badFacing === 0, `${badFacing} wrong`);
  // 0.20.1: flights face straight in (from the pavement, or as a stoop from
  // the road); one along the kerb only where nothing straight fits a side.
  check('hills: staircases climb straight in from the street, facing it (at least 98%)', straightRuns >= stairsAll * 0.98 && badStraight === 0,
    `${straightRuns}/${stairsAll} straight in, ${badStraight} not facing the street`);
  check('hills: every staircase is entered head on, from standing room at its foot', badEntry === 0, `${badEntry} entered from the side or blocked`);
  check('hills: terraces are solid underneath', hollow === 0, `${hollow} gaps`);
  note(`${cities} cities · ${raised} raised blocks · ${stairs} staircases · ${total - unreached}/${total} doors reachable from the streets`);

  // the other settings still work: square outline, no hills
  const sq = generateCity({ ...DEFAULTS, size: 160, seed: 12345, outline: 'square', transit: 'rails' });
  let sqArea = 0; for (const v of sq.plan.mask) if (v) sqArea++;
  check('square outline: fills the whole plan, loop and gates intact', sqArea === sq.plan.W * sq.plan.D && sq.transit.stats.loop && sq.wall.gates.length === 4);
  check('square outline: every door reachable', sq.reach.unreached.length === 0);
  const flat = generateCity({ ...DEFAULTS, size: 160, seed: 12345, hills: 0 });
  check('hills off: no raised blocks, no staircases', flat.hills.blocks.every((b) => !b.e) && flat.stairRuns.length === 0);
}
