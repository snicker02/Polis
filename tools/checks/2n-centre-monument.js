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

export const id = "2n";
export const label = "2n. centre monument";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const name = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id).block; };
  let cities = 0, marked = 0, bad = 0, landedWrong = 0, maxDrift = 0, beams = 0;
  for (const [size, seed, transit] of [[160, 12345, 'roads'], [192, 1, 'rails'], [224, 3, 'trams'], [128, 2, 'rails'], [96, 4, 'roads']]) {
    const r = generateCity({ ...DEFAULTS, size, seed, transit });
    const w = r.world;
    cities++;
    if (!r.centre) continue;
    marked++;
    const c = r.centre;
    maxDrift = Math.max(maxDrift, c.drift);
    // you can stand in the alcove, on solid ground
    const [sx, sy, sz] = c.stand;
    if (w.has(sx, sy, sz) || w.has(sx, sy + 1, sz) || !w.has(sx, sy - 1, sz)) bad++;
    // three beacons, each with its block entity, and open sky above them
    if (c.beacons.length !== 3) bad++;
    for (const [bx, by, bz] of c.beacons) {
      if (name(w, bx, by, bz) !== 'minecraft:beacon') bad++;
      const d = w.getData(bx, by, bz);
      if (!d || d.id !== 'Beacon') bad++;
      let clear = true;
      for (let y = by + 1; y <= by + 10; y++) if (w.has(bx, y, bz)) clear = false;
      if (clear) beams++;
    }
    // the sign above the entrance, facing out of it, with the right words
    const [gx, gy, gz] = c.sign;
    const sd = w.getData(gx, gy, gz);
    const FACE = { 2: [0, -1], 3: [0, 1], 4: [-1, 0], 5: [1, 0] };
    if (name(w, gx, gy, gz) !== 'minecraft:wall_sign' || !sd || !/city centre/.test(sd.tags.FrontText.v.Text.v)) bad++;
    else {
      const f = FACE[MATERIALS.def(w.get(gx, gy, gz)).states.facing_direction.value];
      // the sign is above the alcove mouth and faces away from the monument
      if (!f || w.has(gx + f[0], gy, gz + f[1])) bad++;
    }
    // a wall of diamond round the alcove
    let diamond = 0;
    for (let x = sx - 2; x <= sx + 2; x++) for (let y = sy - 1; y <= sy + 3; y++) for (let z = sz - 2; z <= sz + 2; z++)
      if (name(w, x, y, z) === 'minecraft:diamond_block') diamond++;
    if (diamond < 20) bad++;
    // build_centered must put the player in the alcove
    const tiles = tileList(w, { prefix: 'c', fillAir: true });
    const cx = w.centre[0], cz = w.centre[1];
    const host = tiles.findIndex((t) => sx >= t.box.x0 && sx <= t.box.x1 && sz >= t.box.z0 && sz <= t.box.z1);
    const t = tiles[host];
    const landed = [t.box.x0 - cx + (sx - t.box.x0), t.box.y0 - GROUND_DROP + (sy - 1 - t.box.y0), t.box.z0 - cz + (sz - t.box.z0)];
    if (landed.join() !== '0,-1,0') landedWrong++;
  }
  check('centre monument: in every city, with a clear alcove to stand in and three beacons', marked === cities && bad === 0, `${marked}/${cities}, ${bad} problems`);
  check('centre monument: open sky above every beacon, so the beams show', beams === marked * 3, `${beams}/${marked * 3}`);
  check('centre monument: build_centered puts the player in the alcove', landedWrong === 0, `${landedWrong} wrong`);
  const off = generateCity({ ...DEFAULTS, size: 160, seed: 12345, centreMark: false });
  check('centre monument: none when switched off, and the export falls back to the middle', !off.centre && !off.world.centre);
  note(`${marked} monuments, at most ${maxDrift} blocks from the exact middle (it needs open, level ground under open sky)`);
}
