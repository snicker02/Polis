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

export const id = "2w";
export const label = "2w. square, stadium, cemetery, allotments, bandstand";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const name = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id).block; };
  const seen = new Map();
  let squares = 0, fountains = 0, stalls = 0, pitches = 0, goals = 0, lights = 0;
  let graves = 0, gates = 0, plots = 0, crops = 0, stands = 0, reachBad = 0, waterBad = 0;
  for (const [size, seed] of [[320, 5], [352, 11], [288, 3]]) {
    const r = generateCity({ ...DEFAULTS, size, seed });
    const w = r.world;
    for (const L of r.landmarks) {
      seen.set(L.kind, (seen.get(L.kind) || 0) + 1);
      if (L.kind === 'townsquare') {
        squares++;
        const [fx, fy, fz] = L.fountain;
        if (name(w, fx, fy + 1, fz) === 'minecraft:water') fountains++;
        stalls += L.stalls.length;
      } else if (L.kind === 'stadium') {
        pitches++;
        goals += L.goals.length;
        lights += L.lights.filter(([x, y, z]) => name(w, x, y, z) === 'minecraft:glowstone').length;
      } else if (L.kind === 'cemetery') {
        graves += L.graves.length;
        if (!w.has(L.gate[0], L.gate[1], L.gate[2])) gates++;        // the gateway is open
      } else if (L.kind === 'allotments') {
        plots += L.plots.length;
        for (const P of L.plots)
          for (let z = P.z0; z <= P.z1; z++)
            for (let x = P.x0; x <= P.x1; x++) if (/wheat|carrots|potatoes|beetroot/.test(name(w, x, 2, z) || '')) crops++;
      } else if (L.kind === 'bandstand') stands++;
    }
    // every door in the city still reachable, and no water able to run
    if (r.reach.unreached.length) reachBad++;
    w.forEach((x, y, z, id) => {
      if (MATERIALS.def(id).block !== 'minecraft:water') return;
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
        const n = w.get(x + dx, y + dy, z + dz);
        if (n === -1 || (MATERIALS.isPassable(n) && MATERIALS.def(n).block !== 'minecraft:water')) { waterBad++; return; }
      }
    });
  }
  check('new landmarks: all five appear in big cities', ['townsquare', 'stadium', 'cemetery', 'allotments', 'bandstand'].every((k) => seen.get(k)),
    [...seen.entries()].filter(([k]) => ['townsquare', 'stadium', 'cemetery', 'allotments', 'bandstand'].includes(k)).map(([k, n]) => `${k}:${n}`).join(' '));
  check('town square: a fountain holding water, with stalls round it', squares > 0 && fountains === squares && stalls > 0,
    `${squares} squares, ${fountains} fountains, ${stalls} stalls`);
  check('stadium: a pitch with goals at both ends and floodlights that light', pitches > 0 && goals === pitches * 2 && lights === pitches * 4,
    `${pitches} pitches, ${goals} goals, ${lights} lights`);
  check('cemetery: headstones and a gateway you can walk through', graves > 0 && gates > 0, `${graves} headstones, ${gates} open gates`);
  check('allotments: fenced plots with crops growing in them', plots > 0 && crops > plots * 5, `${plots} plots, ${crops} crops`);
  check('new landmarks: nothing they build blocks a door or lets water run', reachBad === 0 && waterBad === 0,
    `${reachBad} cities with unreachable doors, ${waterBad} leaks`);
  note(`${squares} squares · ${pitches} stadiums · ${graves} headstones · ${plots} allotment plots · ${stands} bandstands`);
}
