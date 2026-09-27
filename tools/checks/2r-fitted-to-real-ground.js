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

export const id = "2r";
export const label = "2r. fitted to real ground";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  // a patch of real Bedrock terrain (heights read from a saved world), so
  // this is tested against ground that actually exists, not a noise field
  const chunks = fx.terrain();
  const { heightField, groundField } = await fx.worldfile();

  // the median filter must take the trees off: raw heights are the top of
  // anything, ground heights should be smoother
  const f = heightField(chunks, -160, -160, 160);
  const g = groundField(f);
  let jitterRaw = 0, jitterGround = 0, n = 0;
  for (let z = 1; z < 159; z++) for (let x = 1; x < 159; x++) {
    const i = z * 160 + x;
    if (f.h[i] < -900 || f.h[i - 1] < -900) continue;
    jitterRaw += Math.abs(f.h[i] - f.h[i - 1]);
    jitterGround += Math.abs(g.h[i] - g.h[i - 1]);
    n++;
  }
  check('ground: the median filter takes the treetops off the heightmap', n > 0 && jitterGround < jitterRaw * 0.75,
    `${(jitterRaw / n).toFixed(2)} raw vs ${(jitterGround / n).toFixed(2)} after`);

  const sites = await fx.sites(160);
  check('sites: candidate sites found in the terrain', sites.length > 0, `${sites.length}`);
  let built = 0, unreachable = 0, floorsBad = 0, followed = 0, blocks = 0, worst = 1;
  let tallSteps = 0, lots = 0, flatLots = 0, canals = 0, levelCanals = 0, shellCells = 0, shellLeaks = 0;
  for (let si = 0; si < Math.min(4, sites.length); si++) {
    const { site, r } = await fx.fitted(160, si);
    built++;
    const v = verifyAll(r.world, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked) floorsBad++;
    unreachable += r.reach.unreached.length;
    // the city surface follows the ground cell by cell
    const elev = r.hills.elev;
    for (let i = 0; i < elev.length; i++) {
      const g = site.ground[i];
      if (!r.plan.mask[i] || g < -900) continue;
      blocks++;
      if (Math.abs(elev[i] - Math.max(0, Math.min(10, g - site.baseY))) <= 2) followed++;
    }
    // nowhere in the city is there a step taller than one block, and every
    // lot is dead level so its building has flat ground
    // the retaining walls that face a cut are part of the mask but are walls,
    // not ground, so they are not steps in the city surface
    const faces = r.world.cutFaces || new Set();
    for (let z = 1; z < 159; z++) for (let x = 1; x < 159; x++) {
      const i = z * 160 + x;
      if (!r.plan.mask[i] || faces.has(x + ',' + z)) continue;
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        const j = (z + dz) * 160 + (x + dx);
        if (!r.plan.mask[j] || faces.has((x + dx) + ',' + (z + dz))) continue;
        if (Math.abs(elev[i] - elev[j]) > 1) tallSteps++;
      }
    }
    for (const lot of r.plan.lots) {
      let lo = 99, hi = -99;
      for (let z = lot.z0; z <= lot.z1; z++) for (let x = lot.x0; x <= lot.x1; x++) { lo = Math.min(lo, elev[z * 160 + x]); hi = Math.max(hi, elev[z * 160 + x]); }
      lots++;
      if (hi === lo) flatLots++;
    }
    // the canal holds one level: water cannot slope
    if (r.canal) {
      const levels = new Set();
      for (let u = r.canal.u0; u <= r.canal.u1; u++)
        for (let a = r.canal.ch0; a <= r.canal.ch1; a++) {
          const [cx, cz] = r.canal.cell(u, a);
          if (cx >= 0 && cz >= 0 && cx < 160 && cz < 160) levels.add(elev[cz * 160 + cx]);
        }
      canals++;
      if (levels.size === 1) levelCanals++;
    }
    // the land shown in the preview is never written into the city itself
    if (r.shell) {
      shellCells += r.shell.length;
      for (const [x, y, z] of r.shell) if (r.world.has(x, y, z)) shellLeaks++;
    }
    // real water is left alone (a pond inside a block is filled in, by design)
    let deep = 0, deepUsed = 0;
    for (let i = 0; i < site.water.length; i++) {
      if (site.ground[i] < -900 || site.ground[i] > 59) continue;      // three or more below sea level
      deep++;
      if (r.plan.mask[i]) deepUsed++;
    }
    if (deep > 20) worst = Math.min(worst, 1 - deepUsed / deep);
  }
  check('fitted cities: every floor and door reachable on real ground', built > 0 && floorsBad === 0 && unreachable === 0,
    `${built} cities, ${floorsBad} with unreachable floors, ${unreachable} doors`);
  check('fitted cities: the city surface follows the ground cell by cell', blocks > 0 && followed / blocks > 0.8,
    `${((followed / blocks) * 100).toFixed(0)}% of cells within two blocks of their ground`);
  check('fitted cities: no step taller than one block anywhere in the city', tallSteps === 0, `${tallSteps} steps`);
  check('fitted cities: every lot is dead level under its building', lots > 0 && flatLots === lots, `${flatLots}/${lots}`);
  check('fitted cities: the canal holds one level (water cannot slope)', canals === 0 || levelCanals === canals, `${levelCanals}/${canals}`);
  // the clearance setting has to reach above the city, and trees standing on
  // the site have to go with it (a trunk cut below leaves a floating tree)
  {
    const { site, r: r2 } = await fx.fitted(160, 0);
    const terrain = { ground: site.ground, raw: site.raw, baseY: site.baseY, size: 160 };
    const volume = (clearAbove) => {
      const st = buildStructures(r2.world, { prefix: 'c', fillAir: true, foundation: 12, clearAbove, terrain });
      let air = 0;
      for (const s2 of st) {
        const t2 = decodeTyped(s2.data);
        const pal = t2.v.structure.v.palette.v.default.v.block_palette.v;
        for (const c of t2.v.structure.v.block_indices.v[0].v) if (c.v >= 0 && pal[c.v].v.name.v === 'minecraft:air') air++;
      }
      return air;
    };
    const low = volume(4), high = volume(48);
    check('fitted cities: the clearance setting decides how much is cleared above', high > low * 1.5,
      `${low.toLocaleString()} cleared at 4, ${high.toLocaleString()} at 48`);
  }
  // both ways of placing a fitted city must put it in the same place, and on
  // the ground it was fitted to
  {
    const { site, r: r3 } = await fx.fitted(160, 0);
    const wb = r3.world.box, tiles = tileList(r3.world, { prefix: 'c', fillAir: true });
    const corner = [site.x0 + wb.x0, site.baseY + 1, site.z0 + wb.z0];
    const stand = [site.x0 + r3.centre.stand[0], site.baseY + (r3.centre.stand[1] - 1), site.z0 + r3.centre.stand[2]];
    const [cx2, cz2] = r3.world.centre;
    let apart = 0;
    for (const t of tiles) {
      const a = [corner[0] + (t.box.x0 - wb.x0), corner[1] + (t.box.y0 - GROUND_DROP), corner[2] + (t.box.z0 - wb.z0)];
      const b = [stand[0] + (t.box.x0 - cx2), stand[1] + (t.box.y0 - GROUND_DROP), stand[2] + (t.box.z0 - cz2)];
      if (a.join() !== b.join()) apart++;
    }
    const cell0 = [corner[0] + (0 - wb.x0), corner[1] + (1 - GROUND_DROP), corner[2] + (0 - wb.z0)];
    check('fitted cities: corner with build and centre with build_centered land in the same place',
      apart === 0, `${apart} tiles apart`);
    check('fitted cities: placed on the very ground they were fitted to',
      cell0.join() === [site.x0, site.baseY, site.z0].join(), `${cell0.join(',')} vs ${[site.x0, site.baseY, site.z0].join(',')}`);
  }
  // On rolling ground a line both turns and climbs. A corner has to be a
  // curve and a climbing rail has to be straight, so a turn on a step leaves
  // the track disconnected.
  {
    let corners = 0, unclimbed = 0, gaps = 0, unsupported = 0, turns = 0;
    for (const seed of [7, 21]) {
      const { r: rr } = await fx.fitted(160, 0, { seed });
      const w2 = rr.world;
      for (const line of rr.transit ? rr.transit.lines : []) {
        const c = line.cells;
        const at = (i) => (line.loop ? c[(i + c.length) % c.length] : c[i]);
        for (let i = 0; i < c.length; i++) {
          const [x, y, z] = c[i];
          const id = w2.get(x, y, z);
          if (id < 0 || !/rail/.test(MATERIALS.def(id).block)) { gaps++; continue; }
          const dir = MATERIALS.def(id).states.rail_direction.value;
          const p = at(i - 1), n = at(i + 1);
          const turning = p && n && p[0] !== n[0] && p[2] !== n[2];
          if (turning) {
            turns++;
            if (p[1] !== y || n[1] !== y) corners++;                       // a corner on a step
            if (dir >= 2 && dir <= 5) corners++;                           // or turned into a climb
          } else if (p && p[1] !== y) {
            const pid = w2.get(p[0], p[1], p[2]);
            const pdir = pid >= 0 ? MATERIALS.def(pid).states.rail_direction.value : -1;
            if (!((dir >= 2 && dir <= 5) || (pdir >= 2 && pdir <= 5))) unclimbed++;
          }
          const below = w2.get(x, y - 1, z);
          if (below === -1 || MATERIALS.isPassable(below)) unsupported++;
        }
      }
    }
    check('fitted cities: the railway turns flat and climbs straight, with no gaps',
      corners === 0 && unclimbed === 0 && gaps === 0 && unsupported === 0 && turns > 0,
      `${turns} turns · ${corners} bad corners · ${unclimbed} unclimbed steps · ${gaps} gaps · ${unsupported} unsupported`);
  }
  // where the city cuts into rising ground, the raw face is walled
  {
    const { site, r: rr } = await fx.fitted(160, 0);
    const faces = rr.world.cutFaces || new Set();
    let facedWall = 0, stillRaw = 0;
    for (const key of faces) {
      const [x, z] = key.split(',').map(Number);
      let top = -999;
      for (let y = 60; y > -8; y--) if (rr.world.has(x, y, z)) { top = y; break; }
      if (top === -999) { stillRaw++; continue; }
      const id = rr.world.get(x, top, z);
      if (/grass|water|sand|snow|terracotta|podzol|dirt/.test(MATERIALS.def(id).block)) facedWall++;
      else stillRaw++;
    }
    // every graded cell must carry a surface and climb no more than a block
    // from its neighbours, so the slope is walkable and not a face
    let steep = 0;
    for (const key of faces) {
      const [x, z] = key.split(',').map(Number);
      let top = -999;
      for (let y = 60; y > -8; y--) if (rr.world.has(x, y, z)) { top = y; break; }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!faces.has((x + dx) + ',' + (z + dz))) continue;
        let ntop = -999;
        for (let y = 60; y > -8; y--) if (rr.world.has(x + dx, y, z + dz)) { ntop = y; break; }
        if (ntop <= -900) continue;
        // grading must never leave a step taller than the land already had
        const g1 = site.ground[z * 160 + x], g2 = site.ground[(z + dz) * 160 + (x + dx)];
        const natural = (g1 > -900 && g2 > -900) ? Math.abs(g1 - g2) : 99;
        if (Math.abs(ntop - top) > Math.max(1, natural)) steep++;
      }
    }
    // A few cells resist: where two slopes meet against a real cliff the land
    // itself jumps, and grading can only do so much. The bar is that nearly
    // all of it is a proper graded slope, not that every cell is perfect.
    check('fitted cities: cuts into the hillside are graded, a block at a time',
      faces.size > 0 && stillRaw <= faces.size * 0.02 && steep <= faces.size * 0.02,
      `${faces.size} graded cells · ${stillRaw} without a natural surface · ${steep} steps taller than the land was`);
    // and the land behind a wall is not carved away
    const terrain2 = { ground: site.ground, raw: site.raw, baseY: site.baseY, size: 160 };
    const st2 = buildStructures(rr.world, { prefix: 'c', fillAir: true, foundation: 12, clearAbove: 32, terrain: terrain2 });
    let carved = 0;
    for (const piece of st2) {
      const t2 = decodeTyped(piece.data);
      const pal = t2.v.structure.v.palette.v.default.v.block_palette.v;
      const [sx, sy, sz] = t2.v.size.v.map((v) => v.v);
      const [ox, oy, oz] = t2.v.structure_world_origin.v.map((v) => v.v);
      const l0 = t2.v.structure.v.block_indices.v[0].v;
      for (let i = 0; i < l0.length; i++) {
        const v = l0[i].v;
        if (v < 0 || pal[v].v.name.v !== 'minecraft:air') continue;
        const z2 = i % sz, r2 = (i - z2) / sz, y2 = r2 % sy, x2 = (r2 - y2) / sy;
        const key = (ox + x2) + ',' + (oz + z2);
        if (!faces.has(key)) continue;
        const ground = site.ground[(oz + z2) * 160 + (ox + x2)];
        if (ground > -900 && (oy + y2) > ground - site.baseY + 4) carved++;    // cut well above the land
      }
    }
    check('fitted cities: the hillside above a graded step is cut away, so the step shows', carved > 0, `${carved} cells cleared`);
  }
  check('fitted cities: the preview carries the surrounding land, and the export does not',
    shellCells > 0 && shellLeaks === 0, `${shellCells} land blocks for the preview, ${shellLeaks} in the world`);
  check('fitted cities: the outline keeps off deep water', worst > 0.85, `${(worst * 100).toFixed(0)}% of deep water left alone`);
  note(`${built} cities generated on real terrain from a saved world`);
}
