// engine/export.js — world -> Bedrock structures, functions and placement guide.
//
// Bedrock structures are capped at 64 blocks per horizontal axis, so the city
// is cut into aligned 64x64 tiles. The pack also ships two functions that load
// every tile in one go, relative to wherever the player is standing:
//
//   /function polis/build            city corner at your feet
//   /function polis/build_centered   city centred on you
//
// Both put the city's ground layer where the block under your feet is.

import { splitWorld, writeMcStructure, buildMcPack, makeZip, crc32 } from './blockcore.js';
import { MATERIALS, MAT } from './materials.js';
import { makeEntity, STRUCTURE_MOBS } from './entities.js';
import { makeRng } from './rng.js';

// Must match main.js VERSION, package.json and index.html data-version;
// tools/validate.js fails if they drift. The app refuses to export when the
// browser has mixed cached copies of old and new files.
export const POLIS_VERSION = '0.14.3';

export const CHUNK = 64;          // Bedrock structure limit per horizontal axis
export const GROUND_DROP = 2;     // base layer y=0 sits 2 below feet; surface y=1 replaces the block you stand on

// ---- per-city identity ---------------------------------------------------------
// Every export gets its own namespace, e.g. polis_12345_a3f9, so two city packs
// active on the same world never hand each other's tiles to /structure load.
// The suffix is a content hash: same seed with different sliders -> different id;
// the same city regenerated later -> the same id. It hashes block names and
// states, not registry ids, because door/stair ids depend on session history.
// The export settings that change the structure files (air fill, foundation,
// clearance) are part of the id too: two packs of the same city exported with
// different settings must not share names.
export function exportSalt(opts = {}) {
  return `a${opts.fillAir ? 1 : 0}f${opts.foundation | 0}c${opts.fillAir ? (opts.clearAbove | 0) : 0}`;
}
const hashCache = new WeakMap();
export function cityId(world, seed, version = POLIS_VERSION, salt = '') {
  const enc = new TextEncoder();
  let h = hashCache.get(world);
  if (!h || h.size !== world.size) { h = { size: world.size, v: cellHash(world) }; hashCache.set(world, h); }
  const hex = ((h.v ^ crc32(enc.encode(`polis ${version} ${salt}`))) >>> 0).toString(16).padStart(8, '0').slice(0, 4);
  return `polis_${seed >>> 0}_${hex}`;
}
function cellHash(world) {
  const n = MATERIALS.length;
  const enc = new TextEncoder();
  const matHash = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const d = MATERIALS.def(i);
    const st = Object.keys(d.states).sort().map((k) => k + '=' + d.states[k].value).join(',');
    matHash[i] = crc32(enc.encode(d.block + '|' + st));
  }
  // The Polis version (mixed in by cityId) is part of the id: packs from
  // different versions carry different functions, so they must never share a
  // namespace, even for an identical city. (0.1.4 and 0.1.5 did.)
  let a = 0, b = 0;
  for (const [k, id] of world.cells) {
    // order-independent: sum two differently mixed per-cell hashes
    let h = (Math.imul(k, 0x9e3779b1) ^ matHash[id]) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    a = (a + h) >>> 0;
    b = (b + Math.imul(h, 0x27d4eb2f)) >>> 0;
  }
  return (a ^ (b >>> 7)) >>> 0;
}

// Tile layout without encoding anything — cheap enough to call on every UI change.
export function tileList(world, opts = {}) {
  const size = opts.chunkSize || CHUNK;
  const prefix = opts.prefix || 'c';
  const chunks = splitWorld(world, size);
  const wb = world.box;
  const F = Math.max(0, Math.min(48, opts.foundation | 0));
  const topY = opts.fillAir ? Math.max(wb.y1, wb.y0 + 1 + Math.max(0, Math.min(200, opts.clearAbove | 0))) : wb.y1;
  // fitted to real ground: the tile still spans the terrain, but each column
  // only carves and founds as far as it has to (see clearTo / fillFrom)

  return chunks.map((c) => {
    let box = { x0: c.x0, y0: c.y0, z0: c.z0, x1: c.x1, y1: c.y1, z1: c.z1 };
    if (opts.fillAir || F) {
      // Full tile footprint: loading carves (air fill) and/or founds the whole
      // column, from the bottom of the foundation to the clearance height.
      box = {
        x0: Math.max(wb.x0, c.cx * size), x1: Math.min(wb.x1, c.cx * size + size - 1),
        z0: Math.max(wb.z0, c.cz * size), z1: Math.min(wb.z1, c.cz * size + size - 1),
        y0: wb.y0 - F, y1: opts.fillAir ? topY : wb.y1,
      };
    }
    return {
      name: `${prefix}_x${c.cx}_z${c.cz}`,
      chunk: c, box,
      offset: [box.x0, box.y0, box.z0],
      size: [box.x1 - box.x0 + 1, box.y1 - box.y0 + 1, box.z1 - box.z0 + 1],
      cells: c.keys.length,
    };
  });
}

// Foundation: solid ground under the city's stone base, so on sloping land the
// low side becomes a retaining wall instead of a gap. Stone bricks round the
// outside face (it shows where the ground falls away), stone inside.
export function foundationFill(world) {
  const wb = world.box;
  const inside = cityInside(world);
  if (!inside) return (x, y, z) => (x === wb.x0 || x === wb.x1 || z === wb.z0 || z === wb.z1) ? MAT.STONEBRICK : MAT.BASE;
  // organic outline: only under the city, stone bricks on the outline itself
  return (x, y, z) => {
    if (!inside(x, z)) return -1;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!inside(x + dx, z + dz)) return MAT.STONEBRICK;
    return MAT.BASE;
  };
}

// The city's outline, if it has one (organic cities): a test for "is this
// column part of the city". Square cities return null (everything is).
export function cityInside(world) {
  const m = world.cityMask;
  if (!m) return null;
  return (x, z) => x >= 0 && z >= 0 && x < m.W && z < m.D && m.data[z * m.W + x] === 1;
}

// Fitted to real ground: how high each column has to be carved, and how deep
// it has to be founded. Outside the city the world is not touched at all;
// inside, a column is cleared only up to whichever is higher — the city's own
// roofs or the ground that was there — and founded only down to that ground.
function columnLimits(world, opts) {
  const t = opts.terrain;
  if (!t) return {};
  const { ground, baseY, size } = t;
  // The ground array has had the treetops filtered off it, which is right for
  // deciding heights and wrong for deciding what to clear: a tree left
  // standing over a street becomes a floating tree once its trunk is cut.
  // Clearing goes by the raw heightmap — the top of anything — and always at
  // least as high above the city as the clearance setting asks.
  const raw = t.raw || ground;
  const headroom = Math.max(4, Math.min(200, opts.clearAbove | 0));
  const tops = new Int32Array(size * size).fill(-9999);
  world.forEach((x, y, z) => {
    if (x < 0 || z < 0 || x >= size || z >= size) return;
    const i = z * size + x;
    if (y > tops[i]) tops[i] = y;
  });
  const groundY = (x, z) => {
    const g = ground[z * size + x];
    return g < -900 ? null : g - baseY + 1;             // the terrain, in city heights
  };
  const rawY = (x, z) => {
    const g = raw[z * size + x];
    return g < -900 ? null : g - baseY + 1;             // the top of whatever stands there
  };
  return {
    clearTo: (x, z) => {
      if (x < 0 || z < 0 || x >= size || z >= size) return -9999;
      const gy = groundY(x, z), ry = rawY(x, z);
      const roof = tops[z * size + x];
      // a graded step: the hillside above it is exactly what has to go, so
      // clear well above the step rather than stopping at it
      if (world.cutFaces && world.cutFaces.has(x + ',' + z)) {
        return Math.max(roof >= -9000 ? roof + headroom : -9999, ry === null ? -9999 : ry + 3);
      }
      // above the city's own roofs by the clearance asked for, and above
      // anything that was standing there (trees included)
      return Math.max(
        roof >= -9000 ? roof + headroom : -9999,
        gy === null ? -9999 : gy + 3,
        ry === null ? -9999 : ry + 3,
      );
    },
    fillFrom: (x, z) => {
      if (x < 0 || z < 0 || x >= size || z >= size) return 9999;
      const gy = groundY(x, z);
      return gy === null ? 9999 : gy - 2;               // no deeper than the ground it stands on
    },
  };
}

export function buildStructures(world, opts = {}) {
  const airId = opts.fillAir ? MAT.AIR : undefined;
  const F = Math.max(0, Math.min(48, opts.foundation | 0));
  const fill = F ? { fillFn: foundationFill(world), fillBelowY: world.box.y0 } : {};
  const limits = columnLimits(world, opts);
  return tileList(world, opts).map((t) => {
    const res = writeMcStructure(t.chunk.keys, t.chunk.ids, t.box, MATERIALS,
      { airId, blockData: world.data, inside: cityInside(world), ...fill, ...limits });
    return {
      name: t.name, data: res.data, box: t.box,
      size: res.size, cells: res.cells, paletteSize: res.paletteSize, entities: res.entities,
      offset: t.offset,
    };
  });
}

// ---- mob structures ------------------------------------------------------------
// Villagers and golems travel inside entity-only structures (no blocks, every
// cell structure void), one per 64x64 tile, so they arrive wherever blocks do.
export function mobTiles(spawns, opts = {}) {
  const size = opts.chunkSize || CHUNK;
  const groups = new Map();
  for (const p of spawns || []) {
    if (!STRUCTURE_MOBS.has(p.type)) continue;
    const cx = Math.floor(p.x / size), cz = Math.floor(p.z / size);
    const k = cx + ',' + cz;
    if (!groups.has(k)) groups.set(k, { cx, cz, mobs: [] });
    groups.get(k).mobs.push(p);
  }
  return [...groups.values()].sort((a, b) => a.cz - b.cz || a.cx - b.cx).map((g) => {
    const box = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
    for (const p of g.mobs) {
      box.x0 = Math.min(box.x0, p.x); box.x1 = Math.max(box.x1, p.x);
      box.z0 = Math.min(box.z0, p.z); box.z1 = Math.max(box.z1, p.z);
      const tall = p.type === 'golem' ? 2 : p.type === 'painting' ? (p.h || 1) : 1;
      box.y0 = Math.min(box.y0, p.y); box.y1 = Math.max(box.y1, p.y + tall);   // cats, pandas fit in 2; a painting is as tall as it is
    }
    return {
      name: `m_x${g.cx}_z${g.cz}`, box, mobs: g.mobs,
      offset: [box.x0, box.y0, box.z0],
      size: [box.x1 - box.x0 + 1, box.y1 - box.y0 + 1, box.z1 - box.z0 + 1],
    };
  });
}

export function buildMobStructures(spawns, opts = {}) {
  const rng = makeRng(((opts.seed | 0) ^ 0x6d0b5) >>> 0);
  return mobTiles(spawns, opts).map((t) => {
    const entities = t.mobs.map((p) => makeEntity(p.type, p.x, p.y, p.z, rng,
      { profession: p.profession, tier: p.tier, motif: p.motif, direction: p.direction, pos: p.pos }));
    const res = writeMcStructure([], [], t.box, MATERIALS, { entities, placeholderId: MAT.AIR });
    return {
      name: t.name, data: res.data, box: t.box, size: res.size, offset: t.offset,
      cells: 0, paletteSize: 0, entities: 0, mobs: res.mobs,
      villagers: t.mobs.filter((p) => p.type === 'villager').length,
      golems: t.mobs.filter((p) => p.type === 'golem').length,
      cats: t.mobs.filter((p) => p.type === 'cat').length,
      paintings: t.mobs.filter((p) => p.type === 'painting').length,
      pandas: t.mobs.filter((p) => p.type === 'panda').length,
    };
  });
}

// Ticking areas keep the whole city simulated while populate runs, so the
// minecart summons reach every line. Each area is at most 144 x 144 blocks,
// which can never exceed Bedrock's 100-chunk limit per area however the city
// straddles chunk borders.
export function tickingAreas(world, ns) {
  const wb = world.box, S = 144, out = [];
  for (let z = wb.z0; z <= wb.z1; z += S)
    for (let x = wb.x0; x <= wb.x1; x += S)
      out.push({ name: `${ns}_t${out.length + 1}`, x0: x, z0: z, x1: Math.min(wb.x1, x + S - 1), z1: Math.min(wb.z1, z + S - 1) });
  return out;
}

// ---- functions ----------------------------------------------------------------
function rel(v) { return v === 0 ? '~' : `~${v}`; }

// Entity names as the /summon command accepts them (Microsoft's /summon
// reference). Only minecarts are still summoned; villagers and golems come
// from mob structures, where the game's own internal ids are used.
// Only minecarts are still summoned; every mob travels in mob structures.
export const SUMMON_IDS = { minecart: 'minecraft:minecart', boat: 'minecraft:boat' };
const FARM_ANIMALS = ['cow', 'sheep', 'pig', 'chicken'];

// build     blocks only, safe to rerun; ends by adding ticking areas
// populate  mob structures + minecart summons; run once, after the city has
//           appeared, from the same spot; ends by removing the ticking areas
export function functionFiles(tiles, world, opts = {}) {
  const ns = opts.namespace || 'polis';
  const spawns = opts.spawns || [];
  const mobs = opts.mobTiles || mobTiles(spawns, opts);
  const wb = world.box;
  // The centred functions put the city's marked centre block under the
  // player's feet (opts.centre); failing that, the middle of the footprint.
  const mid = opts.centre || world.centre;
  const cx = mid ? mid[0] : Math.floor((wb.x0 + wb.x1 + 1) / 2);
  const cz = mid ? mid[1] : Math.floor((wb.z0 + wb.z1 + 1) / 2);
  const villagers = spawns.filter((p) => p.type === 'villager').length;
  const golems = spawns.filter((p) => p.type === 'golem').length;
  const cats = spawns.filter((p) => p.type === 'cat').length;
  const pandas = spawns.filter((p) => p.type === 'panda').length;
  const carts = spawns.filter((p) => p.type === 'minecart');
  // Boats ride along in populate, while its ticking areas still hold the city
  // loaded — summoned from their own function afterwards, the distant ones
  // (the harbour) silently failed. The separate function stays as a fallback.
  const boats = spawns.filter((p) => p.type === 'boat');
  const animals = spawns.filter((p) => FARM_ANIMALS.includes(p.type));
  const summoned = carts.concat(boats);
  const sumLine = (p, dx, dz) => `summon ${SUMMON_IDS[p.type]} ${rel(p.x - dx)} ${rel(p.y - GROUND_DROP)} ${rel(p.z - dz)}`;
  const areas = tickingAreas(world, ns);
  const top = wb.y1 - wb.y0 + 2;
  const load = (t, dx, dz) =>
    `structure load ${ns}:${t.name} ${rel(t.offset[0] - dx)} ${rel(t.offset[1] - GROUND_DROP)} ${rel(t.offset[2] - dz)}`;
  const build = (dx, dz, title, pop) => [
    `# ${title}`,
    `# ${tiles.length} structure${tiles.length === 1 ? '' : 's'}. Safe to run again: blocks only.`,
    '# Only loaded chunks are filled: stand near the middle and raise render distance.',
    `# When the whole city is standing, run /function ${ns}/${pop} from the SAME spot.`,
    ...tiles.map((t) => load(t, dx, dz)),
    ...areas.map((a) => `tickingarea add ${rel(a.x0 - dx)} ${rel(-GROUND_DROP)} ${rel(a.z0 - dz)} ${rel(a.x1 - dx)} ${rel(top)} ${rel(a.z1 - dz)} ${a.name}`),
    `say Polis: city placed. When it has finished appearing, run /function ${ns}/${pop} from this same spot.`,
  ].join('\n') + '\n';
  const populate = (dx, dz, title) => [
    `# ${title}`,
    `# ${villagers} villagers, ${golems} iron golems, ${cats} cats, ${pandas} pandas and ${animals.length} farm animals ` +
      `arrive inside ${mobs.length} mob structure${mobs.length === 1 ? '' : 's'}` +
      (summoned.length ? `; ${carts.length} minecarts and ${boats.length} boats are summoned.` : '.'),
    '# Run ONCE, from the same spot you ran build from, after the city has appeared.',
    `say Polis: bringing in ${villagers} villagers, ${golems} golems, ${cats} cats, ${pandas} pandas, ` +
      `${animals.length} farm animals` + (summoned.length ? `, ${carts.length} minecarts and ${boats.length} boats...` : '...'),
    ...mobs.map((t) => load(t, dx, dz)),
    ...summoned.map((p) => sumLine(p, dx, dz)),
    ...areas.map((a) => `tickingarea remove ${a.name}`),
    'say Polis: done. Villagers take jobs from the workstations and claim beds over the next few minutes.',
    ...(boats.length ? [`say Polis: any boat that did not appear, run /function ${ns}/${dx === wb.x0 ? 'boats' : 'boats_centered'} from beside the water.`] : []),
  ].join('\n') + '\n';
  const files = [
    { name: `functions/${ns}/build.mcfunction`, fn: `${ns}/build`,
      text: build(wb.x0, wb.z0, 'Polis: city corner at your feet', 'populate') },
    { name: `functions/${ns}/build_centered.mcfunction`, fn: `${ns}/build_centered`,
      text: build(cx, cz, 'Polis: city centred on you', 'populate_centered') },
    { name: `functions/${ns}/populate.mcfunction`, fn: `${ns}/populate`,
      text: populate(wb.x0, wb.z0, 'Polis: villagers, golems and minecarts (pairs with build)') },
    { name: `functions/${ns}/populate_centered.mcfunction`, fn: `${ns}/populate_centered`,
      text: populate(cx, cz, 'Polis: villagers, golems and minecarts (pairs with build_centered)') },
  ];
  // fallbacks for the summoned kinds: run near any that are missing
  for (const [group, list, noun] of [['minecarts', carts, 'minecarts'], ['boats', boats, 'boats at the dock and harbour']]) {
    if (!list.length) continue;
    const only = (dx, dz, title) => [
      `# ${title}`,
      `# Summons only reach simulated chunks: walk closer if some ${noun} are missing.`,
      `say Polis: summoning ${list.length} ${noun}...`,
      ...list.map((p) => sumLine(p, dx, dz)),
    ].join('\n') + '\n';
    files.push(
      { name: `functions/${ns}/${group}.mcfunction`, fn: `${ns}/${group}`, text: only(wb.x0, wb.z0, `Polis: ${noun} only (pairs with build)`) },
      { name: `functions/${ns}/${group}_centered.mcfunction`, fn: `${ns}/${group}_centered`, text: only(cx, cz, `Polis: ${noun} only (pairs with build_centered)`) });
  }
  return files;
}

// ---- guide --------------------------------------------------------------------
export function placementGuide(tiles, opts = {}) {
  const ns = opts.namespace || 'polis';
  const base = opts.base || [0, 64, 0];
  const L = [];
  L.push('POLIS — placement guide');
  L.push('=======================');
  L.push('');
  L.push('TO BUILD THIS CITY, stand where you want it and type in chat:');
  L.push('');
  L.push(`    /function ${ns}/build_centered`);
  L.push('');
  L.push('then, once the city has finished appearing, from the same spot:');
  L.push('');
  L.push(`    /function ${ns}/populate_centered`);
  L.push('');
  if (opts.site) {
    L.push('');
    L.push('This city was fitted to your world, so it must be placed exactly where it was fitted.');
    L.push(`Stand at X ${opts.site.x}, Y ${opts.site.y + 1}, Z ${opts.site.z} — the north-west corner of the site,`);
    L.push(`one block above the city's base level of y ${opts.site.y} — and run:`);
    L.push('');
    L.push(`    /function ${ns}/build`);
    L.push('');
    if (opts.site.centre) {
      L.push('Or stand in the centre monument\'s alcove and use the centred version:');
      L.push('');
      L.push(`    /tp ${opts.site.centre.join(' ')}`);
      L.push(`    /function ${ns}/build_centered`);
      L.push('');
    }
    L.push('Either spot places the city on the ground it was fitted to. What matters is');
    L.push('standing on the right block: the corner for build, the alcove for build_centered.');
    L.push('');
  }
  if (opts.centre) L.push('The city centre is a diamond monument with beacons on top: build_centered puts you in its alcove, under the sign.');
  L.push(`Functions in this pack: ${ns}/build, build_centered, populate, populate_centered`);
  L.push('(plus minecarts / minecarts_centered on railway cities, to re-summon carts near you).');
  L.push(`Made with Polis v${POLIS_VERSION}. If /function says one is "not found", an older`);
  L.push('Polis pack is probably still active on this world: remove old Polis packs.');
  L.push('');
  L.push(`City id  ${ns}` + (opts.seed !== undefined ? `      seed ${opts.seed}` : ''));
  if (opts.summary) L.push(opts.summary);
  L.push('The seed only matters in the Polis app; the city itself is inside this pack.');
  L.push('Every exported city has its own id, so several packs can be active at once.');
  L.push('');
  L.push(`${tiles.length} structure${tiles.length === 1 ? '' : 's'}, each at most ${CHUNK}x${CHUNK} blocks across.`);
  L.push(opts.fillAir
    ? `Air fill is ON: loading clears terrain, trees and water out of the city volume, up to ${Math.max(0, opts.clearAbove | 0)} blocks above ground or the tallest roof.`
    : 'Air fill is OFF: empty cells keep whatever was already there (best on a flat world).');
  if (opts.foundation | 0) L.push(`Foundation: ${opts.foundation | 0} solid blocks under the city, so it sits into sloping ground.`);
  L.push('');
  L.push('HOW TO BUILD IT:');
  L.push('  1. Import the .mcpack and enable the behaviour pack on your world. Cheats on.');
  L.push('  2. Stand on the ground where you want the city and run:');
  L.push(`       /function ${ns}/build_centered`);
  L.push('     The city ground replaces the block you are standing on.');
  L.push('  3. Wait until the whole city has finished appearing, then - WITHOUT MOVING - run:');
  L.push(`       /function ${ns}/populate_centered`);
  L.push('     This summons the villagers and iron golems. Run it once.');
  L.push('');
  L.push(`  (${ns}/build and ${ns}/populate do the same with the city corner at your feet.)`);
  L.push('');
  L.push('  Only loaded chunks get filled. For a big city stand near the middle and raise');
  L.push('  render distance. build is safe to rerun if tiles were missed; populate is not.');
  L.push('');
  L.push(`EXACT COORDINATES (base corner ${base.join(' ')}):`);
  for (const t of tiles) {
    const x = base[0] + t.offset[0], y = base[1] + t.offset[1], z = base[2] + t.offset[2];
    L.push(`  /structure load ${ns}:${t.name} ${x} ${y} ${z}`);
  }
  L.push('');
  L.push('OFFSETS (relative to the city corner):');
  for (const t of tiles) {
    L.push(`  ${t.name}  ->  +${t.offset[0]} +${t.offset[1]} +${t.offset[2]}   size ${t.size.join('x')}   ${t.cells} blocks`);
  }
  L.push('');
  L.push('If nothing loads: check the pack is enabled on this world and cheats are on.');
  L.push('If only part loads: those tiles were outside loaded chunks — move and rerun.');
  return L.join('\n');
}

export function commandList(tiles, opts = {}) {
  const ns = opts.namespace || 'polis';
  const base = opts.base || [0, 64, 0];
  return tiles.map((t) =>
    `/structure load ${ns}:${t.name} ${base[0] + t.offset[0]} ${base[1] + t.offset[1]} ${base[2] + t.offset[2]}`);
}

// ---- packages -----------------------------------------------------------------
export async function exportPack(world, optsIn = {}) {
  // the city's marked centre unless the caller names one
  const opts = { ...optsIn, centre: optsIn.centre || world.centre };
  const tiles = tileList(world, opts);
  const structures = buildStructures(world, opts);
  const mobStructs = buildMobStructures(opts.spawns, opts);
  const guide = placementGuide(tiles, opts);
  const fns = functionFiles(tiles, world, { ...opts, mobTiles: mobStructs });
  const data = await buildMcPack(structures.concat(mobStructs), {
    ...opts, guide,
    files: fns.map((f) => ({ name: f.name, data: f.text })),
  });
  return { data, structures, mobStructures: mobStructs, guide, functions: fns };
}

export async function exportStructuresZip(world, opts = {}) {
  const tiles = tileList(world, opts);
  const structures = buildStructures(world, opts);
  const mobStructs = buildMobStructures(opts.spawns, opts);
  const guide = placementGuide(tiles, opts);
  const fns = functionFiles(tiles, world, { ...opts, mobTiles: mobStructs });
  const files = structures.concat(mobStructs).map((s) => ({ name: `${s.name}.mcstructure`, data: s.data }));
  for (const f of fns) files.push({ name: f.name, data: new TextEncoder().encode(f.text) });
  files.push({ name: 'placement-guide.txt', data: new TextEncoder().encode(guide) });
  const data = await makeZip(files, opts);
  return { data, structures, mobStructures: mobStructs, guide, functions: fns };
}
