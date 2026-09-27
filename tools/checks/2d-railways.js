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

export const id = "2d";
export const label = "2d. railways";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  // rail ends: [dx, dz, height of that end above the rail's own y]
  const ENDS = {
    0: [[0, -1, 0], [0, 1, 0]], 1: [[-1, 0, 0], [1, 0, 0]],
    2: [[1, 0, 1], [-1, 0, 0]], 3: [[-1, 0, 1], [1, 0, 0]],
    4: [[0, -1, 1], [0, 1, 0]], 5: [[0, 1, 1], [0, -1, 0]],
    6: [[0, 1, 0], [1, 0, 0]], 7: [[0, 1, 0], [-1, 0, 0]],        // curves: SE, SW
    8: [[0, -1, 0], [-1, 0, 0]], 9: [[0, -1, 0], [1, 0, 0]],      // NW, NE
  };
  const isRail = (w, x, y, z) => { const id = w.get(x, y, z); return id >= 0 && /rail$/.test(MATERIALS.def(id).block); };
  const dirOf = (w, x, y, z) => MATERIALS.def(w.get(x, y, z)).states.rail_direction.value;
  const blocking = (w, x, y, z) => { const id = w.get(x, y, z); return id !== -1 && !MATERIALS.isPassable(id); };
  let totals = { lines: 0, bridges: 0, rails: 0, carts: 0 };
  for (const [transit, c] of [['rails', { size: 160, seed: 12345 }], ['rails', { size: 224, seed: 7 }],
                              ['trams', { size: 192, seed: 5 }], ['rails', { size: 128, seed: 3, pitch: 7 }],
                              // regressions: tree canopies over the track (fixed by trimOverRails)
                              ['rails', { size: 256, seed: 11, blockIrregularity: 1 }], ['trams', { size: 192, seed: 22, blockIrregularity: 0.5 }]]) {
    const r = generateCity({ ...DEFAULTS, ...c, transit });
    const w = r.world;
    const tag = `${transit} ${c.size}/${c.seed}`;
    const rails = [];
    w.forEach((x, y, z, id) => { if (/rail$/.test(MATERIALS.def(id).block)) rails.push([x, y, z]); });
    let noSupport = 0, unpowered = 0, lowRoof = 0, badLink = 0, offRoad = 0, sideTouch = 0, noBuffer = 0;
    const key = (x, y, z) => `${x},${y},${z}`;
    const adj = new Map();
    for (const [x, y, z] of rails) {
      const id = w.get(x, y, z), d = MATERIALS.def(id);
      const below = w.get(x, y - 1, z);
      if (below === -1 || MATERIALS.def(below).flowable || MATERIALS.isPassable(below)) noSupport++;
      if (d.block === 'minecraft:golden_rail' && (below === -1 || MATERIALS.def(below).block !== 'minecraft:redstone_block')) unpowered++;
      if (blocking(w, x, y + 1, z) || blocking(w, x, y + 2, z)) lowRoof++;
      const u2 = r.plan.use[z * r.plan.W + x];
      if (u2 !== USE.ROAD && u2 !== 9 /* the harbour's goods yard */) offRoad++;
      const links = [];
      for (const [dx, dz, h] of ENDS[dir = dirOf(w, x, y, z)]) {
        const endY = y + h;
        let found = null;
        for (const yb of [endY, endY - 1]) {
          if (!isRail(w, x + dx, yb, z + dz)) continue;
          const back = ENDS[dirOf(w, x + dx, yb, z + dz)].find(([ex, ez]) => ex === -dx && ez === -dz);
          if (back && yb + back[2] === endY) found = key(x + dx, yb, z + dz);
        }
        if (found) links.push(found);
        else if (!blocking(w, x + dx, y, z + dz)) noBuffer++;       // open end with no buffer
      }
      adj.set(key(x, y, z), links);
      // no rail may touch this one except at its two ends (Bedrock would
      // re-curve them on a block update)
      const endDirs = ENDS[dirOf(w, x, y, z)].map(([ex, ez]) => ex + ',' + ez);
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (endDirs.includes(sx + ',' + sz)) continue;
        for (const yy of [y - 1, y, y + 1]) if (isRail(w, x + sx, yy, z + sz)) sideTouch++;
      }
    }
    var dir;
    // links must be mutual; each connected piece is a line with exactly two ends
    for (const [k, links] of adj) for (const l of links) if (!(adj.get(l) || []).includes(k)) badLink++;
    const seen = new Set(); let comps = 0, badComp = 0, cycles = 0, cycleLen = 0;
    for (const k of adj.keys()) {
      if (seen.has(k)) continue;
      comps++;
      const stack = [k]; let ends = 0, size = 0;
      while (stack.length) {
        const u = stack.pop(); if (seen.has(u)) continue; seen.add(u); size++;
        const ls = adj.get(u); if (ls.length < 2) ends++;
        for (const v of ls) if (!seen.has(v)) stack.push(v);
      }
      if (ends === 0) { cycles++; cycleLen = size; }      // the perimeter loop
      else if (ends !== 2) badComp++;
    }
    check(`${tag}: exactly one closed loop round the city, and only when planned`,
      cycles === (r.transit.stats.loop ? 1 : 0) && (!r.transit.stats.loop || cycleLen === r.transit.stats.loopLength),
      `${cycles} loops, ${cycleLen} vs ${r.transit.stats.loopLength} rails`);
    if (r.transit.stats.loop) {
      // any outline: the loop's curves are where it turns, and every straight
      // two steps from a curve is a powered booster
      const L = r.transit.lines.find((l) => l.loop);
      const n = L.cells.length;
      const isCurve = (i) => dirOf(w, L.cells[(i + n) % n][0], L.cells[(i + n) % n][1], L.cells[(i + n) % n][2]) >= 6;
      let curves = 0, onWall = 0;
      const boosts = [];
      for (let i = 0; i < n; i++) {
        if (isCurve(i)) curves++;
        const [x, y, z] = L.cells[i];
        if (MATERIALS.def(w.get(x, y, z)).block === 'minecraft:golden_rail') boosts.push(i);
        if (r.wall && r.wall.ring.some(([a, b]) => a === x && b === z)) onWall++;
      }
      // A cart leaves a curve slowly, so boosters follow the bends — but an
      // organic loop bends constantly, and one at every bend puts five in a
      // row. They are spaced instead: never closer than four, never further
      // than nine (plus the leeway a curve forces).
      const gaps = boosts.slice(1).map((v, i) => v - boosts[i]);
      const tooClose = gaps.filter((g) => g < 4).length;
      const tooFar = gaps.filter((g) => g > 11).length;
      check(`${tag}: the loop turns with curved rails (at least four corners)`, curves >= 4, `${curves}`);
      check(`${tag}: boosters spaced along the loop, neither bunched nor missing`, tooClose === 0 && tooFar === 0 && boosts.length > 3,
        `${boosts.length} boosters · ${tooClose} bunched · ${tooFar} too far apart`);
      check(`${tag}: no loop rail under the wall`, onWall === 0);
    }
    const carts = r.spawns.filter((p) => p.type === 'minecart');
    const cartOnRail = carts.every((p) => isRail(w, p.x, p.y, p.z));
    check(`${tag}: every rail sits on a solid block`, noSupport === 0, `${noSupport}`);
    check(`${tag}: every powered rail sits on a redstone block`, unpowered === 0, `${unpowered}`);
    check(`${tag}: 2 clear blocks above every rail (cart + rider)`, lowRoof === 0, `${lowRoof}`);
    check(`${tag}: rails only on road cells or the goods yard`, offRoad === 0, `${offRoad}`);
    check(`${tag}: every rail joins its neighbours end to end`, badLink === 0, `${badLink}`);
    check(`${tag}: no rail touches another from the side`, sideTouch === 0, `${sideTouch}`);
    check(`${tag}: every open end of track has a buffer block`, noBuffer === 0, `${noBuffer}`);
    check(`${tag}: every piece of track is one line with two ends (no junctions)`, badComp === 0 && comps === r.transit.stats.lines,
      `${badComp} bad, ${comps} pieces vs ${r.transit.stats.lines} lines`);
    check(`${tag}: one minecart per line, on the rails`, carts.length === r.transit.stats.lines && cartOnRail);
    const v = verifyAll(w, r.buildings);
    check(`${tag}: every building floor still reachable`, v.floorsReached === v.floorsChecked, `${v.floorsReached}/${v.floorsChecked}`);
    totals.lines += r.transit.stats.lines; totals.bridges += r.transit.stats.bridges; totals.rails += rails.length; totals.carts += carts.length;
  }
  check('railways: bridges built', totals.bridges > 0);
  const plain = generateCity({ ...DEFAULTS, size: 128, seed: 3 });
  let anyRail = false; plain.world.forEach((x, y, z, id) => { if (/rail$/.test(MATERIALS.def(id).block)) anyRail = true; });
  check('roads mode: no rails at all', !anyRail && !plain.transit);
  note(`${totals.lines} lines · ${totals.bridges} bridges · ${totals.rails.toLocaleString()} rails · ${totals.carts} carts, all topology checks clean`);
}
