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

export const id = "6b";
export const label = "6b. air fill and /function build";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
refreshWalkThrough();
{
  const city = generateCity({ ...DEFAULTS, size: 160, seed: 41 });
  const w = city.world, wb = w.box;
  const out = await exportPack(w, { fillAir: true, deflateRaw, rand: Math.random });
  // (the city's own tiles: the plugs for the rooms under it, loaded first, are stone
  // through the rooms and void elsewhere, so the air-fill checks are not for them)
  const cityTiles = out.structures.filter((st) => !st.plug && !st.drain);
  const z = readZip(out.data);
  const inflate = (e) => {
    const p = localPayload(out.data, e);
    return e.method === 8 ? new Uint8Array(zlib.inflateRawSync(Buffer.from(p))) : p;
  };
  const byName = new Map(z.entries.map((e) => [e.name, e]));
  const fnBuild = byName.get('functions/polis/build.mcfunction');
  const fnCent = byName.get('functions/polis/build_centered.mcfunction');
  check('pack: functions/polis/build.mcfunction present', !!fnBuild);
  check('pack: functions/polis/build_centered.mcfunction present', !!fnCent);

  // parse a function into [name, dx, dy, dz]
  const parseFn = (e) => {
    // (build_centered ends by marking its spot: exactly these two lines, checked here)
    const marker = (l) => /^kill @e\[type=armor_stand,name=[a-z0-9_]+_centre\]$/.test(l) || /^summon armor_stand [a-z0-9_]+_centre ~ ~ ~$/.test(l);
    const lines = new TextDecoder().decode(inflate(e)).split('\n')
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('say ') && !l.startsWith('tickingarea ') && !marker(l));
    return lines.map((l) => {
      const m = l.match(/^structure load polis:(\S+) (~-?\d*) (~-?\d*) (~-?\d*)$/);
      if (!m) return { bad: l };
      const n = (t) => (t === '~' ? 0 : Number(t.slice(1)));
      return { name: m[1], d: [n(m[2]), n(m[3]), n(m[4])] };
    });
  };
  const build = fnBuild ? parseFn(fnBuild) : [];
  const cent = fnCent ? parseFn(fnCent) : [];
  check('function: every command is a valid relative structure load or say (no leading slash)',
    build.every((l) => !l.bad) && cent.every((l) => !l.bad),
    (build.concat(cent).find((l) => l.bad) || {}).bad);
  check('function: one line per structure', build.length === out.structures.length && cent.length === out.structures.length,
    `${build.length}/${cent.length} vs ${out.structures.length}`);

  // decode every tile and check the air fill
  const tiles = new Map();
  let voidsInside = 0, voidsOutside = 0, notAir0 = 0, heightBad = 0, footprint = 0, wideBad = 0;
  const cityMask = w.cityMask;
  const insideCity = (x, z) => !cityMask || (x >= 0 && z >= 0 && x < cityMask.W && z < cityMask.D && cityMask.data[z * cityMask.W + x] === 1);
  for (const st of cityTiles) {
    const e = byName.get(`structures/polis/${st.name}.mcstructure`);
    const { root } = decodeNbt(inflate(e));
    const pal = root.structure.palette.default.block_palette;
    const l0 = root.structure.block_indices[0];
    const [ox, oy, oz] = root.structure_world_origin, [ssx, ssy, ssz] = root.size;
    for (let i = 0; i < l0.length; i++) {
      if (l0[i] !== -1) continue;
      const zz = i % ssz, rr = (i - zz) / ssz, x = (rr - (rr % ssy)) / ssy;
      if (insideCity(ox + x, oz + zz)) voidsInside++; else voidsOutside++;
    }
    if (pal[0].name !== 'minecraft:air') notAir0++;
    if (root.size[1] !== wb.y1 - wb.y0 + 1) heightBad++;
    if (root.size[0] > 64 || root.size[2] > 64) wideBad++;
    footprint += root.size[0] * root.size[2];
    tiles.set(st.name, { size: [...root.size], pal, l0 });
  }
  // (the plugs too, for the simulation below: build loads them first, and the
  // city's own tiles put the air back over them)
  for (const st of out.structures) {
    if (!st.plug && !st.drain) continue;
    const { root } = decodeNbt(inflate(byName.get(`structures/polis/${st.name}.mcstructure`)));
    tiles.set(st.name, { size: [...root.size], pal: root.structure.palette.default.block_palette, l0: root.structure.block_indices[0] });
  }
  check('air fill: no structure-void cells inside the outline (void only outside it)', voidsInside === 0, `${voidsInside} void inside`);
  check('air fill: land outside an organic outline is left untouched', !cityMask || voidsOutside > 0);
  check('air fill: air is in every palette', notAir0 === 0, `${notAir0} tiles without`);
  check('air fill: every tile spans the full city height', heightBad === 0, `${heightBad} short`);
  check('air fill: tiles stay within 64 across', wideBad === 0);
  // every column of the city lies in exactly one tile (tiles outside an
  // organic outline, where there is nothing, are simply not written)
  {
    const covered = new Map();
    for (const st of cityTiles) for (let x = st.box.x0; x <= st.box.x1; x++) for (let z = st.box.z0; z <= st.box.z1; z++)
      covered.set(x + ',' + z, (covered.get(x + ',' + z) || 0) + 1);
    let missingCols = 0, doubled = 0;
    for (let z = wb.z0; z <= wb.z1; z++) for (let x = wb.x0; x <= wb.x1; x++) {
      const n = covered.get(x + ',' + z) || 0;
      if (insideCity(x, z) && n === 0) missingCols++;
      if (n > 1) doubled++;
    }
    check('air fill: every city column lies in exactly one tile', missingCols === 0 && doubled === 0, `${missingCols} missing, ${doubled} doubled`);
  }

  // simulate running each function from a player position into a world that
  // already contains junk, then compare cell-for-cell with the source city
  const simulate = (lines, player) => {
    const placed = new Map();   // "x,y,z" -> block name
    for (const ln of lines) {
      const t = tiles.get(ln.name);
      const [sx, sy, sz] = t.size;
      const ox = player[0] + ln.d[0], oy = player[1] + ln.d[1], oz = player[2] + ln.d[2];
      for (let x = 0; x < sx; x++) for (let y = 0; y < sy; y++) for (let zz = 0; zz < sz; zz++) {
        const v = t.l0[(x * sy + y) * sz + zz];
        if (v >= 0) placed.set(`${ox + x},${oy + y},${oz + zz}`, t.pal[v].name);
      }
    }
    return placed;
  };
  const player = [1000, 70, -500];
  const verifyPlacement = (placed, cornerX, cornerZ, label) => {
    let wrong = 0, missing = 0, extra = 0;
    const ground = player[1] - 1;            // block under the player's feet
    const oy = ground - 1;                   // city y=1 (surface) lands there, so y=0 at ground-1
    w.forEach((x, y, zz, id) => {
      const k = `${cornerX + (x - wb.x0)},${oy + y},${cornerZ + (zz - wb.z0)}`;
      const got = placed.get(k);
      if (got === undefined) missing++;
      else if (got !== MATERIALS.def(id).block) wrong++;
    });
    let airCount = 0;
    for (const v of placed.values()) if (v === 'minecraft:air') airCount++;
    let area = 0;
    for (let z = wb.z0; z <= wb.z1; z++) for (let x = wb.x0; x <= wb.x1; x++) if (insideCity(x, z)) area++;
    const vol = area * (wb.y1 - wb.y0 + 1);          // the city's columns, full height
    extra = placed.size - vol;
    check(`${label}: every block lands in the right place`, wrong === 0 && missing === 0, `${wrong} wrong, ${missing} missing`);
    check(`${label}: every column inside the outline written, nothing outside it`, extra === 0, `${extra} extra`);
    check(`${label}: every empty cell is air`, airCount === vol - w.size, `${airCount} vs ${vol - w.size}`);
  };
  verifyPlacement(simulate(build, player), player[0], player[2], 'build');
  // the centred functions centre on the monument's alcove when there is one
  const mid = w.centre || [Math.floor((wb.x0 + wb.x1 + 1) / 2), Math.floor((wb.z0 + wb.z1 + 1) / 2)];
  const cx = mid[0], cz = mid[1];
  verifyPlacement(simulate(cent, player), player[0] - (cx - wb.x0), player[2] - (cz - wb.z0), 'build_centered');
  check('build: surface layer replaces the block under your feet', GROUND_DROP === 2);

  // with air fill off, empty cells stay as structure void
  const plain = buildStructures(w, { fillAir: false });
  // (but a room dug under a building, a cellar or the crypt, is always air: the
  // ground in the game would fill it otherwise)
  const { inAirBox } = await import('../../engine/underground.js');
  const room = inAirBox(w) || (() => false);
  let plainVoids = 0, plainAir = 0;
  for (const st of plain.slice(0, 2)) {
    const { root } = decodeNbt(st.data);
    const l0 = root.structure.block_indices[0], pal = root.structure.palette.default.block_palette;
    const sy = root.size[1], sz = root.size[2], [ox, oy, oz] = st.offset;
    for (let i = 0; i < l0.length; i++) {
      if (l0[i] === -1) { plainVoids++; continue; }
      if (pal[l0[i]].name !== 'minecraft:air') continue;
      const z = i % sz, y = Math.floor(i / sz) % sy, x = Math.floor(i / (sy * sz));
      if (!room(ox + x, oy + y, oz + z)) plainAir++;
    }
  }
  check('air off: empty cells remain structure void', plainVoids > 0);
  check('air off: no air in palettes but inside a room dug under a building', plainAir === 0, `${plainAir} air cells outside a room`);
  note(`${out.structures.length} tiles · ${(out.data.length / 1024).toFixed(0)} KiB pack · ` +
    `simulated both functions cell-for-cell against the source world`);
}
}
