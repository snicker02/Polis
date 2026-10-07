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

import { splitWorld, writeMcStructure, buildMcPack, makeZip, crc32, VoxelWorld } from './blockcore.js';
import { MATERIALS, MAT } from './materials.js';
import { makeEntity, STRUCTURE_MOBS } from './entities.js';
import { makeRng } from './rng.js';

// Must match main.js VERSION, package.json and index.html data-version;
// tools/validate.js fails if they drift. The app refuses to export when the
// browser has mixed cached copies of old and new files.
export const POLIS_VERSION = '0.41.1';

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
  // On stilts the piles are the foundation: each goes on down into the ground
  // below; islands and the seawall stand on solid ground; under open water
  // nothing is put, so the seabed (or water, or land) beneath is left as it is.
  // a floating city is built in the sky: there is no ground to found it on
  if (world.floating) return () => -1;
  if (world.stiltGrid) {
    const { W, D, kind } = world.stiltGrid;
    return (x, y, z) => {
      if (x < 0 || z < 0 || x >= W || z >= D) return -1;
      const k = kind[z * W + x];
      return k === 2 ? MAT.DARK_FRAME : k === 3 ? MAT.BASE : -1;
    };
  }
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
      { airId, blockData: world.data, inside: cityInside(world), ...fill, ...limits,
        // a dome's inside is always written as air: water or ground there is driven out
        // and so is every room dug under a building (a cellar, the crypt)
        ...(cityAir(world) ? { airAt: cityAir(world), domeAirId: MAT.AIR } : {}) });
    return {
      name: t.name, data: res.data, box: t.box,
      size: res.size, cells: res.cells, paletteSize: res.paletteSize, entities: res.entities,
      offset: t.offset,
    };
  });
}

// The cells that must be written as air whatever else is asked: the inside of a
// dome, and every room dug under a building (in the game the ground there is the
// world's own: without air it would fill the room)
export function cityAir(world) {
  const dome = world.dome ? domeAir(world.dome) : null, rooms = inAirBox(world);
  if (!dome && !rooms) return null;
  return (x, y, z) => (dome && dome(x, y, z)) || (rooms && rooms(x, y, z));
}

// ---- fish that stay ------------------------------------------------------------
// The game's own three fish (fish-entities.js), each with one thing added: a
// component group that makes the fish persistent (and, to be sure, takes it off
// distance despawning), and an event, polis:keep, that adds it. Polis summons its
// fish with that event; a wild fish never gets it and despawns as it always has.
// The jail's, zoo's and aquarium's mobs as the game defines them (mob-entities.js),
// each with one thing added: polis:kept (persistent; where the mob has a despawn
// rule, that rule kept off a persistent one) and polis:keep, which runs the game's
// own spawn event (a cat's coat, a panda's gene, a baby or not) and then adds it.
// Summoned with polis:keep, a mob never despawns. (Named by /summon, the
// despawnable ones vanished once no player was near: the jail and most of the zoo
// stood empty.)
export function mobEntityFiles() {
  return Object.entries(VANILLA_MOBS).map(([kind, def]) => {
    const d = JSON.parse(JSON.stringify(def));
    const e = d['minecraft:entity'];
    const has = (name) => JSON.stringify(e).includes('"' + name + '"');
    const kept = { 'minecraft:persistent': {} };
    if (has('minecraft:despawn')) kept['minecraft:despawn'] = { despawn_from_distance: {}, filters: { test: 'is_persistent', value: false } };
    e.component_groups = { ...(e.component_groups || {}), 'polis:kept': kept };
    const spawned = e.events && e.events['minecraft:entity_spawned'];
    e.events = { ...(e.events || {}), 'polis:keep': spawned
      ? { sequence: [JSON.parse(JSON.stringify(spawned)), { add: { component_groups: ['polis:kept'] } }] }
      : { add: { component_groups: ['polis:kept'] } } };
    return { name: `entities/${kind}.json`, data: JSON.stringify(d, null, 2) };
  });
}

export function fishEntityFiles() {
  const KEPT = {
    'minecraft:persistent': {},
    'minecraft:despawn': { despawn_from_distance: { max_distance: 40, min_distance: 32 }, filters: { test: 'is_persistent', value: false } },
  };
  return Object.entries(VANILLA_FISH).map(([kind, def]) => {
    const d = JSON.parse(JSON.stringify(def));
    const e = d['minecraft:entity'];
    e.component_groups = { ...(e.component_groups || {}), 'polis:kept': KEPT };
    e.events = { ...(e.events || {}), 'polis:keep': { add: { component_groups: ['polis:kept'] } } };
    // and a tropical fish kept as one of the 22 named ones: the game's own
    // become_X event's groups, and kept (the aquarium's reef: zoo.js)
    for (const [name, ev] of Object.entries(e.events)) {
      const m = name.match(/^minecraft:become_(.+)$/);
      if (!m || !ev.add || !ev.add.component_groups) continue;
      e.events['polis:keep_' + m[1]] = { add: { component_groups: [...ev.add.component_groups, 'polis:kept'] } };
    }
    return { name: `entities/${kind === 'cod' ? 'fish' : kind}.json`, data: JSON.stringify(d, null, 2) };
  });
}

// ---- draining a dome ------------------------------------------------------------
// Built under water, a dome's inside is drained before the city goes in: one
// structure per tile, air (in both of a cell's layers) through every cell of
// the dome's inside, blocks' cells included, "leave alone" everywhere else.
// build loads these first, so every block of the city is then placed into air:
// nothing it places can come out waterlogged, whatever the game does with a
// structure's second layer.
export function buildDrainStructures(world, opts = {}) {
  if (!world.dome) return [];
  const airAt = domeAir(world.dome);
  return tileList(world, opts).map((t) => {
    const res = writeMcStructure([], [], t.box, MATERIALS, { airAt, domeAirId: MAT.AIR });
    return { name: t.name + '_d', data: res.data, box: t.box, size: res.size, cells: 0, offset: t.offset, drain: true };
  });
}

// ---- plugging the rooms under the city before it goes in ---------------------------
// The city goes in a tile at a time. A tunnel crosses many tiles: while one is in
// and the next is not, the tunnel stands open at the edge between them, onto the
// world's own ground, and where that ground holds water the water came in (and
// took the rails with it). So before any of the city, plugs go in: stone brick
// through every cell of every room dug under the city (cellars, the crypt, the
// metro). Each tile of the city then puts its own share back to air, and a room's
// open edge only ever meets a plug until the next tile replaces it.
export function buildPlugStructures(world, opts = {}) {
  const rooms = inAirBox(world);
  if (!rooms) return [];
  const boxes = world.airBoxes;
  // a room's cells and the cells round them under the street (its walls: the
  // next tile's wall can stand right on the edge between tiles). The city's tiles
  // overwrite every one of these: sealRooms made every cell round a room a block.
  const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const plugAt = (x, y, z) => rooms(x, y, z) || (y < 1 && N6.some(([dx, dy, dz]) => rooms(x + dx, y + dy, z + dz)));
  return tileList(world, opts).filter((t) => boxes.some((b) => b.x0 <= t.box.x1 && b.x1 >= t.box.x0 && b.z0 <= t.box.z1 && b.z1 >= t.box.z0 && b.y0 <= t.box.y1 && b.y1 >= t.box.y0)).map((t) => {
    const res = writeMcStructure([], [], t.box, MATERIALS, { airAt: plugAt, domeAirId: MAT.STONEBRICK });
    return { name: t.name + '_p', data: res.data, box: t.box, size: res.size, cells: 0, offset: t.offset, plug: true };
  });
}

// ---- taking a city away -----------------------------------------------------------
// remove: everything the city put above its ground goes back to air, its ground
// to grass, and under that (cellars, metro, foundations) to dirt, column by
// column at the city's own ground height (a city on hills leaves the hills'
// shape). Only inside the city's outline. With air fill the city replaced the
// world's ground, so there is no old ground to put back: this leaves a clean
// site. One structure a tile, loaded by remove and remove_centered.
export function buildRemoveStructures(world, opts = {}) {
  const g = world.cityGround;
  if (!g) return [];
  const above = (x, y, z) => g.inside(x, z) && y > g.at(x, z);
  // the ground: grass on the city's own surface, dirt under it (the writer's fill,
  // asked of every cell of the tile; nothing outside the outline)
  const ground = (x, y, z) => { if (!g.inside(x, z)) return -1; const top = g.at(x, z); return y > top ? -1 : y === top ? MAT.GRASS : MAT.DIRT; };
  return tileList(world, opts).map((t) => {
    const res = writeMcStructure([], [], t.box, MATERIALS, { airAt: above, domeAirId: MAT.AIR, fillFn: ground, fillBelowY: t.box.y1 + 1 });
    return { name: t.name + '_r', data: res.data, box: t.box, size: res.size, cells: 0, offset: t.offset, remove: true };
  });
}

// Every rail of the city set again with its exact shape, once the whole city is
// in. The game reshapes a rail to the rails beside it as it goes in, and the city
// goes in a tile at a time: a curve at a tile's edge, its neighbour not in yet,
// turned itself straight, and stayed so. Straights and climbs first, the curves
// last (both their neighbours there when they go in).
export function railLines(world, dx, dz) {
  // Only the rails the game can have reshaped: those within two of a tile's edge
  // (a rail there goes in before the one it joins, in the next tile, and turns to
  // what it finds) and every curve and slope; a straight inside a tile goes in with
  // its neighbours and keeps its shape. (Every rail of a big city with a metro ran
  // past ten thousand commands, and Bedrock would not load populate or rails.)
  const nearEdge = (n) => { const m = ((n % CHUNK) + CHUNK) % CHUNK; return m <= 1 || m >= CHUNK - 2; };
  const rails = [];
  world.forEach((x, y, z, id) => {
    const d = MATERIALS.def(id);
    if (d.block !== 'minecraft:rail' && d.block !== 'minecraft:golden_rail') return;
    const st = d.states.rail_direction, dir = Number(st ? (st.value ?? st) : 0);
    if (dir < 2 && !nearEdge(x) && !nearEdge(z)) return;
    rails.push({ x, y, z, golden: d.block === 'minecraft:golden_rail', dir });
  });
  const rank = (r) => (r.dir >= 6 ? 2 : r.dir >= 2 ? 1 : 0);
  rails.sort((a, b) => rank(a) - rank(b));
  return rails.map((r) => `setblock ${rel(r.x - dx)} ${rel(r.y - GROUND_DROP)} ${rel(r.z - dz)} ${r.golden ? `minecraft:golden_rail ["rail_data_bit"=true,"rail_direction"=${r.dir}]` : `minecraft:rail ["rail_direction"=${r.dir}]`}`);
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
export const SUMMON_IDS = { minecart: 'minecraft:minecart', boat: 'minecraft:boat',
  cod: 'minecraft:cod', salmon: 'minecraft:salmon', tropicalfish: 'minecraft:tropicalfish' };
// Fish are summoned with a name: Bedrock keeps a named mob, where an unnamed
// fish despawns like a wild one once the player is away. The name form of
// /summon is <entity> <name> <position>.
export const FISH = new Set(['cod', 'salmon', 'tropicalfish']);
import { HOSTILE_KINDS } from './hostiles.js';
import { VANILLA_MOBS } from './mob-entities.js';
import { ARMOUR_SLOTS } from './museum.js';
import { domeAir } from './dome.js';
import { inAirBox } from './underground.js';
import { VANILLA_FISH } from './fish-entities.js';
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
  const fish = spawns.filter((p) => FISH.has(p.type));
  const summoned = carts.concat(boats, fish);
  // hostile mobs: their own functions always; populate too when asked
  const hostiles = opts.hostiles || [];
  const inmates = opts.inmates || [];
  // the zoo's animals and the aquarium's fish (zoo.js): kept fish by the pack's
  // event (a tropical one as its named variety), everything else by its name
  const zooFolk = opts.zoo || [];
  // an inmate that rides (the enderman, which cannot teleport out of a minecart):
  // the minecart on its rail, the inmate, and the inmate set riding it
  // (each kept by the pack's polis:keep, named still: a name from /summon alone
  // did not keep a mob)
  const keptLine = (be, p, dx, dz) => `summon ${be} ${rel(p.x - dx)} ${rel(p.y - GROUND_DROP)} ${rel(p.z - dz)} 0 0 polis:keep ${p.name}`;
  const inmateLines = (p, dx, dz) => {
    const line = keptLine(HOSTILE_KINDS[p.type].be, p, dx, dz);
    if (!p.ride) return [line];
    const X = rel(p.x - dx), Y = rel(p.y - GROUND_DROP), Z = rel(p.z - dz), at = `x=${X},y=${Y},z=${Z},r=2,c=1`;
    return [`summon minecraft:${p.ride} ${X} ${Y} ${Z}`, line,
      `ride @e[type=${HOSTILE_KINDS[p.type].be},name=${p.name},${at}] start_riding @e[type=minecraft:${p.ride},${at}] teleport_rider`];
  };
  const ZOO_KEEP = new Set(['cod', 'salmon', 'tropicalfish']);
  // the museum's armour stands: each summoned facing into its room, then dressed a
  // piece at a time (standard item names only: one unknown and the function would
  // not load)
  const stands = opts.stands || [];
  const standLines = (p, dx, dz) => {
    const X = rel(p.x - dx), Y = rel(p.y - GROUND_DROP), Z = rel(p.z - dz), at = `x=${X},y=${Y},z=${Z},r=1,c=1`;
    return [`summon minecraft:armor_stand ${X} ${Y} ${Z} ${p.yRot} 0`,
      ...ARMOUR_SLOTS.map(([slot, piece]) => `replaceitem entity @e[type=minecraft:armor_stand,${at}] ${slot} 0 minecraft:${p.set}_${piece}`)];
  };
  const zooLine = (p, dx, dz) => `summon minecraft:${p.type} ${rel(p.x - dx)} ${rel(p.y - GROUND_DROP)} ${rel(p.z - dz)} 0 0 polis:keep${p.variety ? '_' + p.variety : ''} ${p.name}`;
  const hostLine = (p, dx, dz) => `summon ${HOSTILE_KINDS[p.type].be} ${p.name} ${rel(p.x - dx)} ${rel(p.y - GROUND_DROP)} ${rel(p.z - dz)}`;
  const inPop = !!opts.hostilesInPopulate && hostiles.length > 0;
  const kindsIn = [...new Set(hostiles.map((p) => p.type))];
  const hostileWarnings = [
    ...(kindsIn.some((k) => k === 'creeper' || k === 'enderman') ? ['say Polis: creepers and endermen can damage blocks. /gamerule mobgriefing false stops that.'] : []),
    ...(kindsIn.some((k) => ['pillager', 'vindicator', 'evoker', 'witch', 'zoglin'].includes(k)) ? ['say Polis: illagers and zoglins attack villagers; iron golems fight back.'] : []),
    'say Polis: hostile mobs do not appear on Peaceful.',
  ];
  // a fish is summoned with the pack's polis:keep event, which makes it
  // persistent (a Bedrock fish despawns 32-40 blocks from the player, named or
  // not): see fish-entities.js and fishEntityFiles
  const sumLine = (p, dx, dz) => FISH.has(p.type)
    ? `summon ${SUMMON_IDS[p.type]} ${rel(p.x - dx)} ${rel(p.y - GROUND_DROP)} ${rel(p.z - dz)} 0 0 polis:keep ${p.name || 'Fish'}`
    : `summon ${SUMMON_IDS[p.type]} ${rel(p.x - dx)} ${rel(p.y - GROUND_DROP)} ${rel(p.z - dz)}`;
  const summonedNote = () => [carts.length && `${carts.length} minecarts`, boats.length && `${boats.length} boats`, fish.length && `${fish.length} fish`]
    .filter(Boolean).join(', ');
  const areas = tickingAreas(world, ns);
  const top = wb.y1 - wb.y0 + 2;
  const load = (t, dx, dz) =>
    `structure load ${ns}:${t.name} ${rel(t.offset[0] - dx)} ${rel(t.offset[1] - GROUND_DROP)} ${rel(t.offset[2] - dz)}`;
  // the armor stand build_centered leaves on its spot: this city's own name
  const anchor = centreAnchor(ns);
  // the plugs for the rooms under the city: which tiles have one (same names, _p)
  const plugTiles = new Set(buildPlugStructures(world, opts).map((p) => p.name));
  const plugs = tiles.filter((t) => plugTiles.has(t.name + '_p')).map((t) => ({ ...t, name: t.name + '_p' }));
  const build = (dx, dz, title, pop) => [
    `# ${title}`,
    `# ${tiles.length} structure${tiles.length === 1 ? '' : 's'}. Safe to run again: blocks only.`,
    '# Only loaded chunks are filled: stand near the middle and raise render distance.',
    `# When the whole city is standing, run /function ${ns}/${pop} from the SAME spot.`,
    ...plugs.map((t) => load(t, dx, dz)),                                                     // the rooms under the city plugged first
    ...(world.dome ? tiles.map((t) => load({ ...t, name: t.name + '_d' }, dx, dz)) : []),   // drain the dome first
    ...tiles.map((t) => load(t, dx, dz)),
    // (its own ticking areas taken off first: built again, it never doubles them)
    ...areas.map((a) => `tickingarea remove ${a.name}`),
    ...areas.map((a) => `tickingarea add ${rel(a.x0 - dx)} ${rel(-GROUND_DROP)} ${rel(a.z0 - dz)} ${rel(a.x1 - dx)} ${rel(top)} ${rel(a.z1 - dz)} ${a.name}`),
    // the centred version marks this spot (an armor stand in the centre mark's
    // alcove), and the other centred functions run from it wherever you stand
    ...(pop === 'populate_centered' ? [`kill @e[type=armor_stand,name=${anchor}]`, `summon armor_stand ${anchor} ~ ~ ~`] : []),
    `say Polis: city placed. When it has finished appearing, run /function ${ns}/${pop} from this same spot.`,
    ...(pop === 'populate_centered' ? [`say Polis: this spot is marked by an armor stand. To come back to it: /tp @s @e[type=armor_stand,name=${anchor},c=1]`] : []),
  ].join('\n') + '\n';
  const railCache = new Map();
  const rails = (dx, dz) => { const k = dx + ',' + dz; if (!railCache.has(k)) railCache.set(k, railLines(world, dx, dz)); return railCache.get(k); };
  // remove: every entity but players in the city's room taken away first (nothing
  // buried), then the city taken away, the ticking areas let go
  const removeTiles = world.cityGround ? tiles.map((t) => ({ ...t, name: t.name + '_r' })) : [];
  const remove = (dx, dz) => [
    '# Polis: take this city away. Run from the same spot as build (or build_centered for remove_centered).',
    '# Everything the city put above its ground goes back to air, its ground to grass, everything under it to dirt.',
    '# Every entity in the city\'s room that is not a player (villagers, animals, minecarts, items...) is removed first.',
    `say Polis: taking the city away...`,
    `kill @e[type=!player,x=${rel(wb.x0 - dx)},y=${rel(wb.y0 - GROUND_DROP)},z=${rel(wb.z0 - dz)},dx=${wb.x1 - wb.x0},dy=${wb.y1 - wb.y0 + 8},dz=${wb.z1 - wb.z0}]`,
    ...removeTiles.map((t) => load(t, dx, dz)),
    ...areas.map((a) => `tickingarea remove ${a.name}`),
    'say Polis: the city is gone. Run it again from the same spot if any of it was not loaded.',
  ].join('\n') + '\n';
  const populate = (dx, dz, title) => [
    `# ${title}`,
    `# ${villagers} villagers, ${golems} iron golems, ${cats} cats, ${pandas} pandas and ${animals.length} farm animals ` +
      `arrive inside ${mobs.length} mob structure${mobs.length === 1 ? '' : 's'}` +
      (summoned.length ? `; ${summonedNote()} are summoned.` : '.'),
    '# Run ONCE, from the same spot you ran build from, after the city has appeared.',
    `say Polis: bringing in ${villagers} villagers, ${golems} golems, ${cats} cats, ${pandas} pandas, ` +
      `${animals.length} farm animals` + (summoned.length ? `, ${summonedNote()}...` : '...'),
    ...mobs.map((t) => load(t, dx, dz)),
    ...(rails(dx, dz).length ? ['say Polis: setting every rail again (a curve can straighten itself while the city goes in)...', ...rails(dx, dz)] : []),
    ...summoned.map((p) => sumLine(p, dx, dz)),
    ...(inPop ? [`say Polis: and ${hostiles.length} hostile mobs.`, ...hostiles.map((p) => hostLine(p, dx, dz)), ...hostileWarnings] : []),
    // the jail's inmates: always, they are locked up (named, so none despawns)
    ...(inmates.length ? [`say Polis: and ${inmates.length} inmates for the jail.`, ...inmates.flatMap((p) => inmateLines(p, dx, dz)),
      'say Polis: the jail is empty on Peaceful: hostile mobs do not appear there.'] : []),
    ...(zooFolk.length ? [`say Polis: and ${zooFolk.length} animals and fish for the zoo and aquarium.`, ...zooFolk.map((p) => zooLine(p, dx, dz))] : []),
    ...(stands.length ? [`say Polis: and ${stands.length} suits of armour for the museum.`, ...stands.flatMap((p) => standLines(p, dx, dz))] : []),
    ...areas.map((a) => `tickingarea remove ${a.name}`),
    'say Polis: done. Villagers take jobs from the workstations and claim beds over the next few minutes.',
    ...(boats.length ? [`say Polis: any boat that did not appear, run /function ${ns}/${dx === wb.x0 ? 'boats' : 'boats_centered'} from beside the water.`] : []),
    ...(fish.length ? [`say Polis: if the ponds or canal look empty, run /function ${ns}/${dx === wb.x0 ? 'fish' : 'fish_centered'} from beside the water.`] : []),
    // A summon only reaches loaded chunks (villagers and animals come in
    // structures, which wait for theirs). The ticking areas keep the city loaded,
    // but a world holds ten at most: another city's left behind, and these were
    // never made, and the jail and zoo stayed empty.
    ...(inmates.length || zooFolk.length ? [
      `say Polis: if the ${[inmates.length ? 'jail' : '', zooFolk.length ? 'zoo or aquarium' : ''].filter(Boolean).join(' or ')} stays empty, part of the city was not loaded. A world holds ten ticking areas at most: see them with /tickingarea list, clear old ones with /tickingarea remove_all,`,
      `say Polis: then from this spot run /function ${ns}/${dx === wb.x0 ? 'areas' : 'areas_centered'}, wait a moment, and run ${[inmates.length ? `/function ${ns}/${dx === wb.x0 ? 'jail' : 'jail_centered'}` : '', zooFolk.length ? `/function ${ns}/${dx === wb.x0 ? 'zoo' : 'zoo_centered'}` : ''].filter(Boolean).join(' and ')}.`] : []),
  ].join('\n') + '\n';
  const files = [
    { name: `functions/${ns}/build.mcfunction`, fn: `${ns}/build`,
      text: build(wb.x0, wb.z0, 'Polis: city corner at your feet', 'populate') },
    { name: `functions/${ns}/build_centered.mcfunction`, fn: `${ns}/build_centered`,
      text: build(cx, cz, 'Polis: city centred on you', 'populate_centered') },
    // (only where the city has track)
    ...(rails(wb.x0, wb.z0).length ? [
      { name: `functions/${ns}/rails.mcfunction`, fn: `${ns}/rails`,
        text: ['# Polis: every rail set again with its exact shape. Run from the same spot as build.', ...rails(wb.x0, wb.z0)].join('\n') + '\n' },
      { name: `functions/${ns}/rails_centered.mcfunction`, fn: `${ns}/rails_centered`,
        text: ['# Polis: every rail set again with its exact shape. Run from the same spot as build_centered.', ...rails(cx, cz)].join('\n') + '\n' },
    ] : []),
    ...(removeTiles.length ? [
      { name: `functions/${ns}/remove.mcfunction`, fn: `${ns}/remove`, text: remove(wb.x0, wb.z0) },
      { name: `functions/${ns}/remove_centered.mcfunction`, fn: `${ns}/remove_centered`, text: remove(cx, cz) },
    ] : []),
    { name: `functions/${ns}/populate.mcfunction`, fn: `${ns}/populate`,
      text: populate(wb.x0, wb.z0, 'Polis: villagers, golems and minecarts (pairs with build)') },
    { name: `functions/${ns}/populate_centered.mcfunction`, fn: `${ns}/populate_centered`,
      text: populate(cx, cz, 'Polis: villagers, golems and minecarts (pairs with build_centered)') },
  ];
  // hostile mobs, on demand: summon (from the build spot) and clear
  if (hostiles.length) {
    const hostileFn = (dx, dz, title) => [
      `# ${title}`,
      `# ${hostiles.length} hostile mobs, all untouched by daylight, named so they stay.`,
      '# Summons only reach loaded chunks: run from the spot you ran build from, render distance up.',
      `# Remove them again with /function ${ns}/hostiles_clear.`,
      `say Polis: summoning ${hostiles.length} hostile mobs...`,
      ...hostiles.map((p) => hostLine(p, dx, dz)),
      ...hostileWarnings,
    ].join('\n') + '\n';
    files.push({ name: `functions/${ns}/hostiles.mcfunction`, fn: `${ns}/hostiles`,
      text: hostileFn(wb.x0, wb.z0, 'Polis: hostile mobs (pairs with build)') });
    files.push({ name: `functions/${ns}/hostiles_centered.mcfunction`, fn: `${ns}/hostiles_centered`,
      text: hostileFn(cx, cz, 'Polis: hostile mobs (pairs with build_centered)') });
    files.push({ name: `functions/${ns}/hostiles_clear.mcfunction`, fn: `${ns}/hostiles_clear`,
      text: [
        '# Polis: removes the hostile mobs Polis summoned (by kind and name), wherever they are loaded.',
        ...kindsIn.map((k) => `kill @e[type=${HOSTILE_KINDS[k].be},name=${HOSTILE_KINDS[k].name}]`),
        'say Polis: hostile mobs cleared.',
      ].join('\n') + '\n' });
  }
  // fallbacks for the summoned kinds: run near any that are missing
  for (const [group, list, noun] of [['minecarts', carts, 'minecarts'], ['boats', boats, 'boats at the dock and harbour'], ['fish', fish, 'fish in the ponds and canal']]) {
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
  // the jail and the zoo on their own, to fill them again (after the areas below)
  for (const [group, list, line, noun] of [['jail', inmates, inmateLines, 'inmates for the jail'], ['zoo', zooFolk, (p, dx, dz) => [zooLine(p, dx, dz)], 'animals and fish for the zoo and aquarium'], ['museum', stands, standLines, 'suits of armour for the museum']]) {
    if (!list.length) continue;
    const only = (dx, dz, title) => [
      `# ${title}`,
      '# Summons only reach loaded chunks: run areas (or areas_centered) first and wait a moment, or walk closer.',
      `say Polis: summoning ${list.length} ${noun}...`,
      ...list.flatMap((p) => line(p, dx, dz)),
      `say Polis: done. Any still missing: the city there was not loaded (walk closer and run this again).`,
    ].join('\n') + '\n';
    files.push(
      { name: `functions/${ns}/${group}.mcfunction`, fn: `${ns}/${group}`, text: only(wb.x0, wb.z0, `Polis: ${noun} only (pairs with build)`) },
      { name: `functions/${ns}/${group}_centered.mcfunction`, fn: `${ns}/${group}_centered`, text: only(cx, cz, `Polis: ${noun} only (pairs with build_centered)`) });
  }
  // the city's ticking areas made again, on their own (populate takes them off
  // at its end; a world holds ten, so clear others first if they do not take)
  if (areas.length) {
    const areaFn = (dx, dz, title) => [
      `# ${title}`,
      '# A world holds ten ticking areas at most: /tickingarea list, and /tickingarea remove_all to clear old ones.',
      ...areas.map((a) => `tickingarea remove ${a.name}`),
      ...areas.map((a) => `tickingarea add ${rel(a.x0 - dx)} ${rel(-GROUND_DROP)} ${rel(a.z0 - dz)} ${rel(a.x1 - dx)} ${rel(top)} ${rel(a.z1 - dz)} ${a.name}`),
      `say Polis: ${areas.length} ticking areas over the city. Give them a moment to load, then summon what is missing.`,
    ].join('\n') + '\n';
    files.push(
      { name: `functions/${ns}/areas.mcfunction`, fn: `${ns}/areas`, text: areaFn(wb.x0, wb.z0, 'Polis: the city kept loaded (pairs with build)') },
      { name: `functions/${ns}/areas_centered.mcfunction`, fn: `${ns}/areas_centered`, text: areaFn(cx, cz, 'Polis: the city kept loaded (pairs with build_centered)') });
  }
  // The centred functions run from where the player stands, as they always
  // have. build_centered leaves an armor stand on its spot, to come back to
  // (/tp @s @e[type=armor_stand,name=<city id>_centre,c=1]), and each centred
  // function has an optional <name>_from_mark that runs it from the marker
  // without moving: if that ever fails, the ordinary function is untouched.
  const out = files.slice();
  for (const f of files) {
    if (!f.fn.endsWith('_centered') || f.fn === `${ns}/build_centered`) continue;
    const base = f.fn.slice(ns.length + 1, -'_centered'.length);
    out.push({ name: `functions/${ns}/${base}_from_mark.mcfunction`, fn: `${ns}/${base}_from_mark`, text: [
      `# Polis: ${base}_centered, run from the spot build_centered marked (an armor stand named ${anchor}), wherever you stand.`,
      `# Or go back to the spot yourself and run ${base}_centered: /tp @s @e[type=armor_stand,name=${anchor},c=1]`,
      `execute at @e[type=armor_stand,name=${anchor},c=1] run function ${ns}/${base}_centered`,
    ].join('\n') + '\n' });
  }
  return out;
}

// the name of the armor stand build_centered leaves on its spot
export const centreAnchor = (ns) => `${ns}_centre`;

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
  L.push('To take the city away again: /function <city id>/remove_centered from the build_centered spot (or remove from the build spot).'.replace('<city id>', opts.namespace || 'polis'));
  L.push('  It clears the city to a clean site (grass on the city\'s own ground) and removes every non-player entity in the area.');
  if (opts.plugs) L.push('Underground: build first fills every room under the city (cellars, crypt, metro) with stone, then the city puts the rooms back: the world\'s own groundwater cannot get in at the edge of a tile not yet loaded.');
  L.push(`build_centered also leaves an armor stand on its spot (named ${centreAnchor(ns)}). Run populate_centered`);
  L.push('  from that spot; if you have moved, go back to it first:');
  L.push(`    /tp @s @e[type=armor_stand,name=${centreAnchor(ns)},c=1]`);
  L.push(`  (or try /function ${ns}/populate_from_mark, which runs populate_centered from the marker for you)`);
  L.push(`Functions in this pack: ${ns}/build, build_centered, populate, populate_centered`);
  L.push('(plus minecarts / minecarts_centered on railway cities, to re-summon carts near you,');
  L.push(' boats / boats_centered for the dock, and fish / fish_centered for the ponds and canal).');
  L.push('');
  L.push('A JAIL, ZOO OR AQUARIUM EMPTY? Their animals are summoned, and a summon only reaches');
  L.push('loaded chunks. The city is kept loaded by ticking areas, and a world holds ten at most:');
  L.push('another city\'s left behind and these are never made. From the build spot:');
  L.push('    /tickingarea list            (see them)');
  L.push('    /tickingarea remove_all      (clear old ones)');
  L.push(`    /function ${ns}/areas_centered   (this city's, again; then wait a moment)`);
  L.push(`    /function ${ns}/jail_centered    and    /function ${ns}/zoo_centered`);
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
  if (opts.floating) L.push('Floating islands: build it high in the sky (stand well above the ground, with room below for the islands\' undersides). The foundation setting does nothing here.');
  if ((opts.foundation | 0) && opts.stilts) L.push(`Foundation (on stilts): the piles go on ${opts.foundation | 0} blocks further down into the ground below; islands and the seawall stand on solid ground, and under open water nothing is put.`);
  else if (opts.foundation | 0) L.push(`Foundation: ${opts.foundation | 0} solid blocks under the city, so it sits into sloping ground.`);
  if (opts.dome) {
    L.push('Dome: build first drains the whole inside of the dome (air through every cell, the');
    L.push('  liquid layer too), then places the city into the dry space, so nothing comes out');
    L.push('  waterlogged. Built under water (or into a hillside), the dome is emptied and');
    L.push('  everything outside the glass is left alone. If water got in somewhere (a chunk that');
    L.push('  was not loaded yet), run build again from the same spot: it drains again.');
  }
  L.push('');
  L.push('HOW TO BUILD IT:');
  L.push('  1. Import the .mcpack and enable the behaviour pack on your world. Cheats on.');
  L.push('  2. Stand on the ground where you want the city and run:');
  L.push(`       /function ${ns}/build_centered`);
  L.push('     The city ground replaces the block you are standing on.');
  L.push('  3. Wait until the whole city has finished appearing, then - WITHOUT MOVING - run:');
  L.push(`       /function ${ns}/populate_centered`);
  L.push('     This brings in the villagers, iron golems, animals and fish. Run it once.');
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
  const structures = buildStructures(world, opts).concat(buildDrainStructures(world, opts), buildPlugStructures(world, opts), buildRemoveStructures(world, opts));
  const mobStructs = buildMobStructures(opts.spawns, opts);
  const guide = placementGuide(tiles, { ...opts, dome: !!world.dome, stilts: !!world.stiltGrid, floating: !!world.floating, plugs: !!(world.airBoxes && world.airBoxes.length) });
  const fns = functionFiles(tiles, world, { ...opts, mobTiles: mobStructs });
  // the fish's definitions where there are fish to keep: the ponds' or the
  // aquarium's (its fish are summoned with keep events these define); the mobs'
  // where there is a jail or a zoo to keep
  const hasFish = (opts.spawns || []).some((p) => FISH.has(p.type)) || (opts.zoo || []).some((p) => FISH.has(p.type) || p.type === 'tropicalfish');
  const hasKept = (opts.inmates || []).length > 0 || (opts.zoo || []).length > 0;
  const data = await buildMcPack(structures.concat(mobStructs), {
    ...opts, guide,
    files: fns.map((f) => ({ name: f.name, data: f.text })).concat(hasFish ? fishEntityFiles() : [], hasKept ? mobEntityFiles() : []),
  });
  return { data, structures, mobStructures: mobStructs, guide, functions: fns };
}

export async function exportStructuresZip(world, opts = {}) {
  const tiles = tileList(world, opts);
  const structures = buildStructures(world, opts).concat(buildDrainStructures(world, opts), buildPlugStructures(world, opts), buildRemoveStructures(world, opts));
  const mobStructs = buildMobStructures(opts.spawns, opts);
  const guide = placementGuide(tiles, { ...opts, dome: !!world.dome, stilts: !!world.stiltGrid, floating: !!world.floating, plugs: !!(world.airBoxes && world.airBoxes.length) });
  const fns = functionFiles(tiles, world, { ...opts, mobTiles: mobStructs });
  const files = structures.concat(mobStructs).map((s) => ({ name: `${s.name}.mcstructure`, data: s.data }));
  for (const f of fns) files.push({ name: f.name, data: new TextEncoder().encode(f.text) });
  files.push({ name: 'placement-guide.txt', data: new TextEncoder().encode(guide) });
  const data = await makeZip(files, opts);
  return { data, structures, mobStructures: mobStructs, guide, functions: fns };
}
