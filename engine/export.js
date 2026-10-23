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

import { traderDef, tradeFiles } from './market.js';
import { splitWorld, writeMcStructure, buildMcPack, makeZip, crc32, VoxelWorld, N } from './blockcore.js';
import { MATERIALS, MAT } from './materials.js';
import { makeEntity, STRUCTURE_MOBS, makeRiderPair, makeCart, makeBoat } from './entities.js';
import { makeRng } from './rng.js';

// Must match main.js VERSION, package.json and index.html data-version;
// tools/validate.js fails if they drift. The app refuses to export when the
// browser has mixed cached copies of old and new files.
export const POLIS_VERSION = '0.82.1';

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

// The city's own tag, from its blocks alone (no version, no export settings): the
// same city exported again, by this version or another, carries the same tag, so a
// goto from a newer pack finds the centre marker an older pack's build_centered left.
export function layoutTag(world) {
  let h = hashCache.get(world);
  if (!h || h.size !== world.size) { h = { size: world.size, v: cellHash(world) }; hashCache.set(world, h); }
  return 'polis_c_' + (h.v >>> 0).toString(16).padStart(8, '0');
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
  const m = world.cityMask, extra = world.extraInside || [];
  if (!m && !extra.length) return null;
  // (ground of the city's own outside its square: the airport's airfield and road)
  const inRect = (x, z) => extra.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
  const P = world.planSize;
  const inPlan = m ? (x, z) => x >= 0 && z >= 0 && x < m.W && z < m.D && m.data[z * m.W + x] === 1
    : (x, z) => x >= 0 && z >= 0 && x < P.W && z < P.D;
  return (x, z) => inPlan(x, z) || inRect(x, z);
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

// A command block's command naming one of the pack's own structures ({ns}: the theme
// park's turning wheel loads its frames by name) given the pack's namespace.
function blockDataFor(world, opts) {
  const ns = opts.namespace || 'polis';
  let any = false;
  for (const d of world.data.values()) if (d && d.id === 'CommandBlock' && d.tags.Command.v.includes('{ns}')) { any = true; break; }
  if (!any) return world.data;
  const out = new Map();
  for (const [k, d] of world.data) out.set(k, d && d.id === 'CommandBlock' && d.tags.Command.v.includes('{ns}')
    ? { ...d, tags: { ...d.tags, Command: N.str(d.tags.Command.v.split('{ns}').join(ns)) } } : d);
  return out;
}

// The frames of anything that moves (the theme park's wheel): each a structure of its
// own, every cell of its box written (air where the frame has nothing), loaded in turn
// by command blocks in the city.
export function buildAnimStructures(world, opts = {}) {
  return (world.anims || []).map((a) => {
    const keys = [], ids = [];
    for (const [k, id] of a.cells) { const [x, y, z] = k.split(',').map(Number); if (y < a.box.y0) continue; keys.push(VoxelWorld.key(x, y, z)); ids.push(id); }
    const res = writeMcStructure(keys, ids, a.box, MATERIALS, { airId: MAT.AIR });
    return { name: a.name, data: res.data, box: a.box, size: res.size, cells: res.cells, paletteSize: res.paletteSize, entities: 0, offset: [a.box.x0, a.box.y0, a.box.z0] };
  });
}

// ---- the rails under the city: in with populate, not with build -------------------
// The city goes in a tile at a time, and a room under it (a metro tunnel) crosses many
// tiles. The plugs (buildPlugStructures) keep the world's water out of every tile's
// share of a room until that tile goes in; but where one tile is in and its neighbour's
// ground has not loaded yet, the tunnel's end stands open onto that ground, and when it
// loads its water can run in for a moment before its own plug and tile arrive. It
// drains away when they do; a rail it ran over is gone (in the game water breaks a rail
// and drops it). So the rails in the rooms under the city are left out of build: the
// tunnels go in empty, and populate (run once the whole city is standing, every tile
// in, any such water long gone) lays them, a structure a tile of nothing but rails.
const RAIL_BLOCK = /^minecraft:(rail|golden_rail|detector_rail|activator_rail)$/;
export function undergroundRail(world) {
  const rooms = inAirBox(world);
  if (!rooms) return null;
  return (x, y, z, id) => RAIL_BLOCK.test(MATERIALS.def(id).block) && rooms(x, y, z);
}
export function buildRailStructures(world, opts = {}) {
  const under = undergroundRail(world);
  if (!under) return [];
  const out = [];
  for (const t of tileList(world, opts)) {
    const keys = [], ids = [];
    t.chunk.keys.forEach((k, i) => { const [x, y, z] = VoxelWorld.unkey(k); if (under(x, y, z, t.chunk.ids[i])) { keys.push(k); ids.push(t.chunk.ids[i]); } });
    if (!keys.length) continue;
    const res = writeMcStructure(keys, ids, t.box, MATERIALS, {});     // (everything else structure void: left as it is)
    out.push({ name: t.name + '_rl', data: res.data, box: t.box, size: res.size, cells: res.cells, offset: t.offset, rails: keys.length });
  }
  return out;
}

export function buildStructures(world, opts = {}) {
  const airId = opts.fillAir ? MAT.AIR : undefined;
  const F = Math.max(0, Math.min(48, opts.foundation | 0));
  const fill = F ? { fillFn: foundationFill(world), fillBelowY: world.box.y0 } : {};
  const limits = columnLimits(world, opts);
  const under = undergroundRail(world);
  return tileList(world, opts).map((t) => {
    // (the rails under the city left out: air there, until populate lays them)
    let keys = t.chunk.keys, ids = t.chunk.ids;
    if (under) {
      keys = []; ids = [];
      t.chunk.keys.forEach((k, i) => { const [x, y, z] = VoxelWorld.unkey(k); if (!under(x, y, z, t.chunk.ids[i])) { keys.push(k); ids.push(t.chunk.ids[i]); } });
    }
    const res = writeMcStructure(keys, ids, t.box, MATERIALS,
      { airId, blockData: blockDataFor(world, opts), inside: cityInside(world), ...fill, ...limits,
        wet: world.wet, waterId: MAT.WATER,      // (waterlogged plants: the botanical garden's)
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
  const dome = world.dome ? domeAir(world.dome) : null, rooms = inAirBox(world), bridge = world.bridgeAir || null;
  if (!dome && !rooms && !bridge) return null;
  // (and the air over a bridge out to another city: joins.js)
  return (x, y, z) => (dome && dome(x, y, z)) || (rooms && rooms(x, y, z)) || (bridge && bridge(x, y, z));
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
    // (the wandering trader as the farmers' market keeps it: market.js)
    const d = kind === 'wandering_trader' ? traderDef(def) : JSON.parse(JSON.stringify(def));
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

// ---- the sea round a hall under it (sea.js) ---------------------------------------
// The water outside the glass, one structure a tile: water in every cell of the sea
// that holds none of the city's blocks, "leave alone" everywhere else. build loads
// these after every tile of the city, so the glass is whole all round before any
// water comes in.
export function seaBoxes(world, opts = {}) {
  const sea = world.sea;
  if (!sea) return [];
  const out = [];
  for (const t of tileList(world, opts)) {
    // (its own box: the tile's columns, from the seabed to the sea's surface; a tile's
    // own box ends at its highest block, under the sea's top over the hall's roof)
    const b = { x0: Math.max(t.box.x0, sea.box.x0 + 1), x1: Math.min(t.box.x1, sea.box.x1 - 1), z0: Math.max(t.box.z0, sea.box.z0 + 1), z1: Math.min(t.box.z1, sea.box.z1 - 1), y0: sea.y0 !== undefined ? sea.y0 : sea.G + 1, y1: sea.S };
    if (b.x0 > b.x1 || b.z0 > b.z1) continue;
    out.push({ name: t.name + '_s', box: b, offset: [b.x0, b.y0, b.z0] });
  }
  return out;
}
export function buildSeaStructures(world, opts = {}) {
  const sea = world.sea;
  if (!sea) return [];
  const at = (x, y, z) => sea.at(x, y, z) && !world.has(x, y, z);
  return seaBoxes(world, opts).map((t) => {
    const res = writeMcStructure([], [], t.box, MATERIALS, { seaAt: at, seaId: MAT.WATER });
    return { name: t.name, data: res.data, box: t.box, size: res.size, cells: 0, offset: t.offset, sea: true };
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
  const sb = world.sea && world.sea.box;
  const above = (x, y, z) => (g.inside(x, z) && y > g.at(x, z)) || (sb && x >= sb.x0 && x <= sb.x1 && z >= sb.z0 && z <= sb.z1 && y > world.sea.G);
  // the ground: grass on the city's own surface, dirt under it (the writer's fill,
  // asked of every cell of the tile; nothing outside the outline)
  const ground = (x, y, z) => { if (!g.inside(x, z)) return -1; const top = g.at(x, z); return y > top ? -1 : y === top ? MAT.GRASS : MAT.DIRT; };
  return tileList(world, opts).map((t) => {
    // (up to the sea's top, under a hall: its water too, over the roof)
    const box = sb ? { ...t.box, y1: Math.max(t.box.y1, world.sea.S + 1) } : t.box;
    const res = writeMcStructure([], [], box, MATERIALS, { airAt: above, domeAirId: MAT.AIR, fillFn: ground, fillBelowY: box.y1 + 1 });
    return { name: t.name + '_r', data: res.data, box, size: res.size, cells: 0, offset: t.offset, remove: true };
  });
}

// Every rail of the city set again with its exact shape, once the whole city is
// in. The game reshapes a rail to the rails beside it as it goes in, and the city
// goes in a tile at a time: a curve at a tile's edge, its neighbour not in yet,
// turned itself straight, and stayed so. Straights and climbs first, the curves
// last (both their neighbours there when they go in).
function railItems(world, dx, dz) {
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
  return rails.map((r) => ({ x: r.x, z: r.z, cmd: `setblock ${rel(r.x - dx)} ${rel(r.y - GROUND_DROP)} ${rel(r.z - dz)} ${r.golden ? `minecraft:golden_rail ["rail_data_bit"=true,"rail_direction"=${r.dir}]` : `minecraft:rail ["rail_direction"=${r.dir}]`}` }));
}
export function railLines(world, dx, dz) { return railItems(world, dx, dz).map((r) => r.cmd); }

// Every rail under the city set by hand, one setblock each, straights and slopes first,
// the curves last (both their neighbours there when they go in). populate loads the
// rails in structures first; this follows, so a rail the structures did not put down (a
// tile whose chunks were not loaded, whatever the reason) is put down all the same, and
// each one with its exact shape. Its own function (metro_rails), so it can be run again
// on its own; in parts of at most 8000 lines (Bedrock will not load a longer function).
function undergroundRailItems(world, dx, dz) {
  const under = undergroundRail(world);
  if (!under) return [];
  const rails = [];
  world.forEach((x, y, z, id) => {
    if (!under(x, y, z, id)) return;
    const d = MATERIALS.def(id), st = d.states.rail_direction, dir = Number(st ? (st.value ?? st) : 0);
    rails.push({ x, y, z, d, dir });
  });
  const rank = (r) => (r.dir >= 6 ? 2 : r.dir >= 2 ? 1 : 0);
  rails.sort((a, b) => rank(a) - rank(b) || a.y - b.y || a.x - b.x || a.z - b.z);
  const stateText = (states) => Object.entries(states).map(([k, v]) => {
    const t = v && v.type, val = v && v.value !== undefined ? v.value : v;
    return `"${k}"=${t === 'string' ? `"${val}"` : /_bit$/.test(k) ? (val ? 'true' : 'false') : val}`;
  }).join(',');
  return rails.map((r) => ({ x: r.x, z: r.z, cmd: `setblock ${rel(r.x - dx)} ${rel(r.y - GROUND_DROP)} ${rel(r.z - dz)} ${r.d.block} [${stateText(r.d.states)}]` }));
}
export function undergroundRailLines(world, dx, dz) { return undergroundRailItems(world, dx, dz).map((r) => r.cmd); }

// ---- mob structures ------------------------------------------------------------
// Villagers and golems travel inside entity-only structures (no blocks, every
// cell structure void), one per 64x64 tile, so they arrive wherever blocks do.
export function mobTiles(spawns, opts = {}) {
  const size = opts.chunkSize || CHUNK;
  const groups = new Map();
  for (const p of spawns || []) {
    if (!STRUCTURE_MOBS.has(p.type)) continue;
    const cx = Math.floor(p.x / size), cz = Math.floor(p.z / size);
    // (a landmark's mobs in tiles of their own: jail, zoo, museum load just theirs)
    const k = cx + ',' + cz + ',' + (p.group || '');
    if (!groups.has(k)) groups.set(k, { cx, cz, group: p.group || '', mobs: [] });
    groups.get(k).mobs.push(p);
  }
  return [...groups.values()].sort((a, b) => a.group.localeCompare(b.group) || a.cz - b.cz || a.cx - b.cx).map((g) => {
    const box = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
    for (const p of g.mobs) {
      const bx = Math.floor(p.x), bz = Math.floor(p.z), by = Math.floor(p.y);
      box.x0 = Math.min(box.x0, bx); box.x1 = Math.max(box.x1, bx);
      box.z0 = Math.min(box.z0, bz); box.z1 = Math.max(box.z1, bz);
      const tall = p.type === 'golem' ? 2 : p.type === 'painting' ? (p.h || 1) : p.type === 'mob' ? (p.kind === 'ghast' ? 4 : 3) : 1;
      box.y0 = Math.min(box.y0, by); box.y1 = Math.max(box.y1, by + tall);   // cats, pandas fit in 2; a painting is as tall as it is
    }
    return {
      name: g.group ? `m_${g.group}_x${g.cx}_z${g.cz}` : `m_x${g.cx}_z${g.cz}`, box, mobs: g.mobs, group: g.group,
      offset: [box.x0, box.y0, box.z0],
      size: [box.x1 - box.x0 + 1, box.y1 - box.y0 + 1, box.z1 - box.z0 + 1],
    };
  });
}

// tags, status effects and a name a spawn asks for, put on its entity as the game
// saves them (the stadium's fighters: tagged, Resistance V)
function entityOf(p, e) { const pos = e.v.Pos && e.v.Pos.v; return !!pos && (p.tags || p.effects) && Math.floor(pos[0].v) === Math.floor(p.x) && Math.floor(pos[2].v) === Math.floor(p.z); }
function withExtras(e, p) {
  if (!p || !(p.tags || p.effects)) return e;
  if (p.tags) e.v.Tags = N.list(8, p.tags.map((t) => N.str(t)));
  if (p.effects) e.v.ActiveEffects = N.list(10, p.effects.map((f) => N.comp({
    Ambient: N.byte(0), Amplifier: N.byte(f.amp), DisplayOnScreenTextureAnimation: N.byte(0), Duration: N.int(f.ticks),
    DurationEasy: N.int(f.ticks), DurationHard: N.int(f.ticks), DurationNormal: N.int(f.ticks), Id: N.byte(f.id), ShowParticles: N.byte(0) })));
  if (p.name && p.type === 'golem') e.v.CustomName = N.str(p.name);
  return e;
}

export function buildMobStructures(spawns, opts = {}) {
  const rng = makeRng(((opts.seed | 0) ^ 0x6d0b5) >>> 0);
  return mobTiles(spawns, opts).map((t) => {
    // (a rider is two entities: the minecart and the enderman riding it)
    const entities = t.mobs.flatMap((p) => p.type === 'ender_rider' ? makeRiderPair(p.x, p.y, p.z, rng, p.name)
      : p.type === 'cart' ? [makeCart(p.x, p.y, p.z, rng)]
      : p.type === 'parkboat' ? [makeBoat(p.x, p.y, p.z, rng)]
      : p.type === 'mob' ? (p.ride ? mobInMinecart(p.kind, p.x, p.y, p.z, rng, p) : [mobNbt(p.kind, p.x, p.y, p.z, rng, p)])
      : [makeEntity(p.type, p.x, p.y, p.z, rng, { profession: p.profession, tier: p.tier, motif: p.motif, direction: p.direction, pos: p.pos })]).map((e) => withExtras(e, t.mobs.find((p) => entityOf(p, e)) || null));
    const res = writeMcStructure([], [], t.box, MATERIALS, { entities, placeholderId: MAT.AIR });
    return {
      // (its landmark's group kept: the jail, zoo, museum and mall functions load their own tiles by it)
      name: t.name, group: t.group, data: res.data, box: t.box, size: res.size, offset: t.offset,
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

// A world holds ten ticking areas at most (Bedrock), each of 100 chunks at most. A
// city over ten of the squares above (a 512 city with its harbour is twenty) cannot
// be held loaded all at once: build asked for twenty, the game made ten (or none,
// with another city's still on), and populate's rails, mobs and summons in the rest
// went nowhere. Such a city is filled in parts instead: squares of 128 on the world's
// own 128 grid (a tile never split; 9 x 9 chunks at most, however it sits), STAGE_AREAS
// of them a part, held loaded one part at a time, plus one small area on the spot it
// is run from. Half the world's ten left free for anything else.
export const MAX_TICKING_AREAS = 10, STAGE_AREAS = 4, STAGE_SQ = 128, HOME_SQ = 144;
export function needsStages(world) { return tickingAreas(world, 'x').length > MAX_TICKING_AREAS; }
export function stagePlan(world, ns) {
  const wb = world.box, S = STAGE_SQ, fl = (v) => Math.floor(v / S);
  const i0 = fl(wb.x0), i1 = fl(wb.x1), j0 = fl(wb.z0), j1 = fl(wb.z1);
  const nc = i1 - i0 + 1, nr = j1 - j0 + 1;
  // (the squares of a part side by side: 2 x 2, or 4 in a row, whichever makes fewest parts)
  const shapes = [[2, 2], [4, 1], [1, 4]];
  const count = ([a, b]) => Math.ceil(nc / a) * Math.ceil(nr / b);
  const [a, b] = shapes.reduce((best, s) => (count(s) < count(best) ? s : best));
  const sq = (i, j) => ({ i, j, x0: Math.max(wb.x0, i * S), z0: Math.max(wb.z0, j * S), x1: Math.min(wb.x1, i * S + S - 1), z1: Math.min(wb.z1, j * S + S - 1) });
  const groups = new Map();
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = Math.floor((i - i0) / a) + ',' + Math.floor((j - j0) / b);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(sq(i, j));
  }
  const mid = world.centre || [Math.floor((wb.x0 + wb.x1 + 1) / 2), Math.floor((wb.z0 + wb.z1 + 1) / 2)];
  const d2 = (s) => ((s.x0 + s.x1) / 2 - mid[0]) ** 2 + ((s.z0 + s.z1) / 2 - mid[1]) ** 2;
  const named = (list) => list.map((s, n) => ({ ...s, name: `${ns}_t${n + 1}` }));
  // (the parts nearest the middle first, where the player stands)
  const stages = [...groups.values()].map((list) => ({ squares: named(list), d: Math.min(...list.map(d2)) }))
    .sort((p, q) => p.d - q.d).map((p) => p.squares);
  const index = new Map();
  stages.forEach((st, k) => st.forEach((s) => index.set(s.i + ',' + s.j, k)));
  // where each part lies, from the middle (the build_centered spot): the middle if it takes
  // in that spot, else a point of the compass (north is -Z); its reach in blocks from it
  const where = stages.map((st) => {
    const x0 = Math.min(...st.map((q) => q.x0)), x1 = Math.max(...st.map((q) => q.x1)), z0 = Math.min(...st.map((q) => q.z0)), z1 = Math.max(...st.map((q) => q.z1));
    const box = { x0: x0 - mid[0], x1: x1 - mid[0], z0: z0 - mid[1], z1: z1 - mid[1] };
    if (box.x0 <= 0 && box.x1 >= 0 && box.z0 <= 0 && box.z1 >= 0) return { name: 'the middle', box };
    const ex = (box.x0 + box.x1) / 2, ez = (box.z0 + box.z1) / 2;
    const ang = (Math.atan2(ex, -ez) * 180) / Math.PI;            // 0 north, 90 east
    const NAMES = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    return { name: NAMES[((Math.round(ang / 45) % 8) + 8) % 8], box };
  });
  // the squares kept loaded once a part is done (and by build): STAGE_AREAS of them
  // (four areas of HOME_SQ round the middle of the metro, if the city has one, else round the
  // middle: not on the grid, so the whole metro, within METRO_REACH of the city's middle, is
  // under them; 144 across is ten chunks at most, however it sits)
  const mb = world.metroBox, hc = mb ? [Math.floor((mb.x0 + mb.x1 + 1) / 2), Math.floor((mb.z0 + mb.z1 + 1) / 2)] : mid;
  const H = HOME_SQ, home = [];
  for (const [za, zb] of [[hc[1] - H, hc[1] - 1], [hc[1], hc[1] + H - 1]]) for (const [xa, xb] of [[hc[0] - H, hc[0] - 1], [hc[0], hc[0] + H - 1]]) {
    const q = { x0: Math.max(wb.x0, xa), x1: Math.min(wb.x1, xb), z0: Math.max(wb.z0, za), z1: Math.min(wb.z1, zb) };
    if (q.x0 <= q.x1 && q.z0 <= q.z1) home.push({ ...q, name: `${ns}_t${home.length + 1}` });
  }
  return { stages, where, home, mark: `${ns}_m`, names: [...Array(STAGE_AREAS)].map((_, n) => `${ns}_t${n + 1}`),
    squareOf: (x, z) => fl(x) + ',' + fl(z), stageOf: (x, z) => index.get(fl(x) + ',' + fl(z)) ?? -1 };
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
import { mobNbt, mobInMinecart } from './mob-nbt.js';
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
  // (a city over ten ticking areas: filled in parts, see stagePlan)
  const staged = areas.length > MAX_TICKING_AREAS;
  const plan = staged ? stagePlan(world, ns) : null;
  const holdAreas = staged ? plan.home : areas;             // what build, areas and the end of populate keep on
  const areaNames = staged ? [...plan.names, plan.mark] : areas.map((a) => a.name);
  const addArea = (a, dx, dz) => `tickingarea add ${rel(a.x0 - dx)} ${rel(-GROUND_DROP)} ${rel(a.z0 - dz)} ${rel(a.x1 - dx)} ${rel(top)} ${rel(a.z1 - dz)} ${a.name}`;
  const MARK = `${ns}_pop`;                                  // the spot a part runs from (an armor stand, gone at the end)
  // A run in parts: <base>_part<k> starts at part k (the player on the build spot: the
  // marker put down there, and a small ticking area on it); _next swaps the ticking areas
  // for the part's own; each _wait waits for one of them to load; _go runs the part from
  // the marker (a scheduled function runs where its player is now, not where it began);
  // _run does the work and starts the next part, or, the last, puts the middle's areas back.
  // (every: each of the city's parts, numbered as the guide numbers them, even one with
  // nothing to do; otherwise only the parts with work in them)
  const chain = (base, dx, dz, items, outro, every = false) => {
    // (only the squares with work in them held loaded: no waiting on empty ones)
    const used = new Set(items.map((it) => plan.squareOf(it.x, it.z)));
    const parts = plan.stages.map((sqs, k) => {
      const busy = sqs.filter((q) => used.has(q.i + ',' + q.j));
      return { sqs: (busy.length ? busy : sqs.slice(0, 1)).map((q, n) => ({ ...q, name: plan.names[n] })), where: plan.where[k].name,
        items: items.filter((it) => plan.stageOf(it.x, it.z) === k) };
    }).filter((p) => every || p.items.length);
    if (!parts.length) return { files: [], entry: [] };
    const N = parts.length, F = (n) => `${ns}/${base}_part${n}`, out = [];
    const file = (fn, lines) => out.push({ name: `functions/${fn}.mcfunction`, fn, text: lines.join('\n') + '\n' });
    parts.forEach((p, i) => {
      const n = i + 1, sq = p.sqs;
      file(F(n), [`# Polis: ${base}, from part ${n} of ${N} on. Run from the same spot as build${dx === wb.x0 ? '' : '_centered'}.`,
        `kill @e[type=armor_stand,name=${MARK}]`, `summon armor_stand ${MARK} ~ ~ ~`,
        `tickingarea remove ${plan.mark}`, `tickingarea add ~ ~ ~ ~ ~ ~ ${plan.mark}`, `function ${F(n)}_next`]);
      const wait = (j) => `schedule on_area_loaded add tickingarea ${sq[j].name} ${j + 1 < sq.length ? `${F(n)}_wait${j + 2}` : `${F(n)}_go`}`;
      file(`${F(n)}_next`, [`# Polis: ${base}, part ${n} of ${N}: its part of the city held loaded, then waited for`,
        ...plan.names.map((nm) => `tickingarea remove ${nm}`), ...sq.map((a) => addArea(a, dx, dz)),
        `say Polis: part ${n} of ${N} (${p.where}): waiting for its part of the city to load...`, wait(0)]);
      for (let j = 1; j < sq.length; j++) file(`${F(n)}_wait${j + 1}`, [wait(j)]);
      file(`${F(n)}_go`, [`execute at @e[type=armor_stand,name=${MARK},c=1] run function ${F(n)}_run`]);
      const cmds = p.items.map((it) => it.cmd), chunks = [];
      for (let c = 0; c < cmds.length; c += 7500) chunks.push(cmds.slice(c, c + 7500));
      if (!chunks.length) chunks.push([]);                   // (a part with nothing to do still says so and goes on)
      const tail = [`say Polis: part ${n} of ${N} (${p.where}) done.`, ...(n < N ? [`function ${F(n + 1)}_next`] : [])].concat(n < N ? [] : [...plan.names.map((nm) => `tickingarea remove ${nm}`),
        ...holdAreas.map((a) => addArea(a, dx, dz)), `tickingarea remove ${plan.mark}`, ...outro, `kill @e[type=armor_stand,name=${MARK}]`]);
      chunks.forEach((c, m) => file(`${F(n)}_run${m ? '_' + (m + 1) : ''}`, [
        ...(m ? [] : [`say Polis: part ${n} of ${N} (${p.where})...`]), ...c,
        ...(m + 1 < chunks.length ? [`function ${F(n)}_run_${m + 2}`] : tail)]));
    });
    return { files: out, entry: [
      `say Polis: this city is bigger than a world can keep loaded at once (ten ticking areas at most), so it is done in ${N} parts, one after another.`,
      `say Polis: each part needs ${STAGE_AREAS + 1} free ticking areas. If it stops before saying it is done: /tickingarea list, remove old ones, and from this spot run /function ${F('<n>')} for the part it stopped at (the placement guide has a table of the parts).`,
      `function ${F(1)}`] };
  };
  // the armor stand build_centered leaves on its spot: this city's own name
  const anchor = centreAnchor(ns);
  const ctag = layoutTag(world);
  // the plugs for the rooms under the city: which tiles have one (same names, _p)
  const plugTiles = new Set(buildPlugStructures(world, opts).map((p) => p.name));
  // the rails under the city: populate lays them (same names, _rl)
  const railStructs = buildRailStructures(world, opts);
  const railByName = new Set(railStructs.map((p) => p.name));
  const railTiles = tiles.filter((t) => railByName.has(t.name + '_rl')).map((t) => ({ ...t, name: t.name + '_rl' }));
  const railCount = railStructs.reduce((a, p) => a + p.rails, 0), undergroundRailCount = railCount;
  const metroCache = new Map();
  const metroParts = (dx, dz) => {
    const k = dx + ',' + dz;
    if (!metroCache.has(k)) { const ls = undergroundRailLines(world, dx, dz), parts = []; for (let i = 0; i < ls.length; i += 8000) parts.push(ls.slice(i, i + 8000)); metroCache.set(k, parts); }
    return metroCache.get(k);
  };
  const plugs = tiles.filter((t) => plugTiles.has(t.name + '_p')).map((t) => ({ ...t, name: t.name + '_p' }));
  const seaTiles = seaBoxes(world, opts);
  // (a city with command blocks in it, the airport's pads or the stadium's: the game's
  // command block chat turned off, or every run of one is a line in the chat)
  const hasCommands = [...world.data.values()].some((d) => d && d.id === 'CommandBlock');
  const build = (dx, dz, title, pop) => [
    `# ${title}`,
    ...(hasCommands ? ['gamerule commandblockoutput false'] : []),
    `# ${tiles.length} structure${tiles.length === 1 ? '' : 's'}. Safe to run again: blocks only.`,
    '# Only loaded chunks are filled: stand near the middle and raise render distance.',
    `# When the whole city is standing, run /function ${ns}/${pop} from the SAME spot.`,
    ...plugs.map((t) => load(t, dx, dz)),                                                     // the rooms under the city plugged first
    ...(world.dome ? tiles.map((t) => load({ ...t, name: t.name + '_d' }, dx, dz)) : []),   // drain the dome first
    ...tiles.map((t) => load(t, dx, dz)),
    // the sea round a hall under it: last, once all the glass is in
    ...(seaTiles.length ? [`say Polis: letting the sea in round the glass...`, ...seaTiles.map((t) => load(t, dx, dz))] : []),
    // (its own ticking areas taken off first: built again, it never doubles them)
    ...areaNames.map((n) => `tickingarea remove ${n}`),
    ...holdAreas.map((a) => addArea(a, dx, dz)),
    // the centred version marks this spot (an armor stand in the centre mark's
    // alcove), and the other centred functions run from it wherever you stand
    ...(pop === 'populate_centered' ? [`kill @e[type=armor_stand,name=${anchor}]`, `kill @e[type=armor_stand,tag=${ctag}]`, `summon armor_stand ${anchor} ~ ~ ~`, `tag @e[type=armor_stand,name=${anchor},r=2] add ${ctag}`] : []),
    `say Polis ${POLIS_VERSION} (${ns}): city placed. When it has finished appearing, run /function ${ns}/${pop} from this same spot.`,
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
    ...areaNames.map((n) => `tickingarea remove ${n}`),
    'say Polis: the city is gone. Run it again from the same spot if any of it was not loaded.',
  ].join('\n') + '\n';
  const populateWhole = (dx, dz, title) => [
    `# ${title}`,
    `# ${villagers} villagers, ${golems} iron golems, ${cats} cats, ${pandas} pandas and ${animals.length} farm animals ` +
      `arrive inside ${mobs.length} mob structure${mobs.length === 1 ? '' : 's'}` +
      (summoned.length ? `; ${summonedNote()} are summoned.` : '.'),
    '# Run ONCE, from the same spot you ran build from, after the city has appeared.',
    // (The ticking areas build made hold the city loaded while this runs, and stay on
    // after: populate leaves them alone. Taken off at its end, a later run, or jail,
    // zoo or museum, found the far side unloaded; taken off and made again at its
    // start, the far side was unloaded at that very moment, still loading again
    // while every summon and rail ran, and none of them reached it. release takes
    // them off; areas makes them again, run on its own and a moment let pass.)
    `say Polis ${POLIS_VERSION} (${ns}): bringing in ${villagers} villagers, ${golems} golems, ${cats} cats, ${pandas} pandas, ` +
      `${animals.length} farm animals` + (summoned.length ? `, ${summonedNote()}...` : '...'),
    ...(railTiles.length ? [`say Polis: laying the ${railCount} rails under the city (left out of build, so no water could take them)...`,
      `kill @e[type=item,x=${rel(wb.x0 - dx)},y=${rel(wb.y0 - GROUND_DROP)},z=${rel(wb.z0 - dz)},dx=${wb.x1 - wb.x0},dy=${Math.max(1, 1 - wb.y0)},dz=${wb.z1 - wb.z0}]`,     // (any rail an earlier build's water dropped, under the ground)
      ...railTiles.map((t) => load(t, dx, dz)),
      // (and each one set again by hand: whatever the structures did not put down)
      ...(metroParts(dx, dz).length ? [`function ${ns}/metro_rails${dx === wb.x0 ? '' : '_centered'}`] : [])] : []),
    ...mobs.map((t) => load(t, dx, dz)),
    ...(rails(dx, dz).length ? ['say Polis: setting every rail again (a curve can straighten itself while the city goes in)...', ...rails(dx, dz)] : []),
    ...summoned.map((p) => sumLine(p, dx, dz)),
    ...(inPop ? [`say Polis: and ${hostiles.length} hostile mobs.`, ...hostiles.map((p) => hostLine(p, dx, dz)), ...hostileWarnings] : []),
    // the jail's inmates: always, they are locked up (named, so none despawns)



    // (the jail's inmates, the zoo's and aquarium's animals and fish and the museum's
    // armour stands came in the structures above, in tiles of their own)
    ...(inmates.length ? ['say Polis: the jail\'s inmates came in with the rest; on Peaceful the game takes hostile mobs away.'] : []),
    'say Polis: done. Villagers take jobs from the workstations and claim beds over the next few minutes.',
    ...(boats.length ? [`say Polis: any boat that did not appear, run /function ${ns}/${dx === wb.x0 ? 'boats' : 'boats_centered'} from beside the water.`] : []),
    ...(fish.length ? [`say Polis: if the ponds or canal look empty, run /function ${ns}/${dx === wb.x0 ? 'fish' : 'fish_centered'} from beside the water.`] : []),
    // A summon only reaches loaded chunks (villagers and animals come in
    // structures, which wait for theirs). The ticking areas keep the city loaded,
    // but a world holds ten at most: another city's left behind, and these were
    // never made, and the jail and zoo stayed empty.
    ...(inmates.length || zooFolk.length || stands.length ? [
      `say Polis: if the ${[inmates.length ? 'jail' : '', zooFolk.length ? 'zoo or aquarium' : '', stands.length ? 'museum\'s armour room' : ''].filter(Boolean).join(' or ')} stays empty, part of the city was not loaded. A world holds ten ticking areas at most: see them with /tickingarea list, clear old ones with /tickingarea remove_all,`,
      `say Polis: then from this spot run /function ${ns}/${dx === wb.x0 ? 'areas' : 'areas_centered'}, wait a moment, and run ${[inmates.length ? `/function ${ns}/${dx === wb.x0 ? 'jail' : 'jail_centered'}` : '', zooFolk.length ? `/function ${ns}/${dx === wb.x0 ? 'zoo' : 'zoo_centered'}` : '', stands.length ? `/function ${ns}/${dx === wb.x0 ? 'museum' : 'museum_centered'}` : ''].filter(Boolean).join(' and ')}.`] : []),
    ...(areas.length ? [`say Polis: the city's ticking areas stay on (the whole city kept running). When everything is in, run /function ${ns}/${dx === wb.x0 ? 'release' : 'release_centered'} to take them off.`] : []),
  ].join('\n') + '\n';
  // the same, in parts (a city over ten ticking areas): each part's rails, mobs, rails set
  // again and summons, while its part of the city is held loaded
  const popItems = (dx, dz) => [
    ...railTiles.map((t) => ({ x: t.offset[0], z: t.offset[2], cmd: load(t, dx, dz) })),
    ...undergroundRailItems(world, dx, dz),
    ...mobs.map((t) => ({ x: t.offset[0], z: t.offset[2], cmd: load(t, dx, dz) })),
    ...railItems(world, dx, dz),
    ...summoned.map((p) => ({ x: p.x, z: p.z, cmd: sumLine(p, dx, dz) })),
    ...(inPop ? hostiles.map((p) => ({ x: p.x, z: p.z, cmd: hostLine(p, dx, dz) })) : []),
  ];
  const sfx = (dx) => (dx === wb.x0 ? '' : '_centered');
  const chainCache = new Map();
  const popChain = (dx, dz) => {
    const k = dx + ',' + dz;
    if (!chainCache.has(k)) chainCache.set(k, chain('populate' + sfx(dx), dx, dz, popItems(dx, dz), [
      ...(inPop ? hostileWarnings : []),
      ...(inmates.length ? ['say Polis: the jail\'s inmates came in with the rest; on Peaceful the game takes hostile mobs away.'] : []),
      'say Polis: done. Villagers take jobs from the workstations and claim beds over the next few minutes.',
      ...(boats.length ? [`say Polis: any boat that did not appear, run /function ${ns}/boats${sfx(dx)} from beside the water.`] : []),
      ...(fish.length ? [`say Polis: if the ponds or canal look empty, run /function ${ns}/fish${sfx(dx)} from beside the water.`] : []),
      ...(inmates.length || zooFolk.length || stands.length ? [
        `say Polis: if the ${[inmates.length ? 'jail' : '', zooFolk.length ? 'zoo or aquarium' : '', stands.length ? 'museum\'s armour room' : ''].filter(Boolean).join(' or ')} stays empty, run ${[inmates.length ? `/function ${ns}/jail${sfx(dx)}` : '', zooFolk.length ? `/function ${ns}/zoo${sfx(dx)}` : '', stands.length ? `/function ${ns}/museum${sfx(dx)}` : ''].filter(Boolean).join(' or ')} from this spot (each holds its own part of the city loaded while it runs).`] : []),
      `say Polis: the middle of the city stays held loaded (${holdAreas.length} ticking areas). /function ${ns}/release${sfx(dx)} takes them off.`,
    ], true));
    return chainCache.get(k);
  };
  const populate = (dx, dz, title) => !staged ? populateWhole(dx, dz, title) : [
    `# ${title}`,
    `# ${villagers} villagers, ${golems} iron golems, ${cats} cats, ${pandas} pandas and ${animals.length} farm animals ` +
      `arrive inside ${mobs.length} mob structure${mobs.length === 1 ? '' : 's'}` + (summoned.length ? `; ${summonedNote()} are summoned.` : '.'),
    '# Run ONCE, from the same spot you ran build from, after the city has appeared. It runs in parts, one part',
    '# of the city held loaded at a time (a world holds ten ticking areas, not enough for all of it).',
    `say Polis ${POLIS_VERSION} (${ns}): bringing in ${villagers} villagers, ${golems} golems, ${cats} cats, ${pandas} pandas, ` +
      `${animals.length} farm animals` + (summoned.length ? `, ${summonedNote()}...` : '...'),
    ...(railTiles.length ? [`say Polis: and laying the ${railCount} rails under the city (left out of build, so no water could take them).`,
      `kill @e[type=item,x=${rel(wb.x0 - dx)},y=${rel(wb.y0 - GROUND_DROP)},z=${rel(wb.z0 - dz)},dx=${wb.x1 - wb.x0},dy=${Math.max(1, 1 - wb.y0)},dz=${wb.z1 - wb.z0}]`] : []),
    ...popChain(dx, dz).entry,
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
    // (the rails under the city by hand: populate calls these; they can be run again on their own)
    ...(staged ? [] : metroParts(wb.x0, wb.z0)).map((part, k) => ({ name: `functions/${ns}/metro_rails${k ? '_' + (k + 1) : ''}.mcfunction`, fn: `${ns}/metro_rails${k ? '_' + (k + 1) : ''}`,
      text: [`# Polis ${POLIS_VERSION}: the rails under the city (metro), each set by hand${k ? ` (part ${k + 1})` : ''}. Run from the same spot as build.`, ...part,
        ...(k + 1 < metroParts(wb.x0, wb.z0).length ? [`function ${ns}/metro_rails_${k + 2}`] : [`say Polis: ${undergroundRailCount} rails under the city set.`])].join('\n') + '\n' })),
    ...(staged ? [] : metroParts(cx, cz)).map((part, k) => ({ name: `functions/${ns}/metro_rails_centered${k ? '_' + (k + 1) : ''}.mcfunction`, fn: `${ns}/metro_rails_centered${k ? '_' + (k + 1) : ''}`,
      text: [`# Polis ${POLIS_VERSION}: the rails under the city (metro), each set by hand${k ? ` (part ${k + 1})` : ''}. Run from the same spot as build_centered.`, ...part,
        ...(k + 1 < metroParts(cx, cz).length ? [`function ${ns}/metro_rails_centered_${k + 2}`] : [`say Polis: ${undergroundRailCount} rails under the city set.`])].join('\n') + '\n' })),
    ...(removeTiles.length ? [
      { name: `functions/${ns}/remove.mcfunction`, fn: `${ns}/remove`, text: remove(wb.x0, wb.z0) },
      { name: `functions/${ns}/remove_centered.mcfunction`, fn: `${ns}/remove_centered`, text: remove(cx, cz) },
    ] : []),
    { name: `functions/${ns}/populate.mcfunction`, fn: `${ns}/populate`,
      text: populate(wb.x0, wb.z0, 'Polis: villagers, golems and minecarts (pairs with build)') },
    { name: `functions/${ns}/populate_centered.mcfunction`, fn: `${ns}/populate_centered`,
      text: populate(cx, cz, 'Polis: villagers, golems and minecarts (pairs with build_centered)') },
  ];
  if (staged) {
    files.push(...popChain(wb.x0, wb.z0).files, ...popChain(cx, cz).files);
    // the rails under the city by hand, in parts as populate is
    for (const [dx, dz] of [[wb.x0, wb.z0], [cx, cz]]) {
      const c = chain('metro_rails' + sfx(dx), dx, dz, undergroundRailItems(world, dx, dz), [`say Polis: ${undergroundRailCount} rails under the city set.`], true);
      if (!c.entry.length) continue;
      files.push({ name: `functions/${ns}/metro_rails${sfx(dx)}.mcfunction`, fn: `${ns}/metro_rails${sfx(dx)}`,
        text: [`# Polis ${POLIS_VERSION}: the rails under the city (metro), each set by hand, in parts. Run from the same spot as build${sfx(dx)}.`, ...c.entry].join('\n') + '\n' }, ...c.files);
    }
  }
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
  // each landmark's mobs again on their own: its own structure tiles loaded (a
  // structure waits for its chunks, as a summon does not)
  for (const [group, noun] of [['jail', 'inmates for the jail'], ['zoo', 'animals and fish for the zoo and aquarium'], ['museum', 'suits of armour for the museum'], ['mall', 'shopkeepers for the mall'], ['stadium', 'fighters for the stadium\'s bouts'], ['arena', 'fighters for the Mega Arena\'s cage'], ['market', 'traders for the farmers\' market']]) {
    const tiles = mobs.filter((t) => t.group === group);
    if (!tiles.length) continue;
    const only = (dx, dz, title) => [
      `# ${title}`,
      `# The ${noun}, in ${tiles.length} structure${tiles.length === 1 ? '' : 's'} of their own. Run once: each run brings another set.`,
      `say Polis: bringing in the ${noun}...`,
      ...tiles.map((t) => load(t, dx, dz)),
      `say Polis: done (a structure goes in when its part of the world loads).`,
    ].join('\n') + '\n';
    if (staged) {
      // (in parts, each holding its own part of the city loaded while its structures go in)
      for (const [dx, dz] of [[wb.x0, wb.z0], [cx, cz]]) {
        const c = chain(group + sfx(dx), dx, dz, tiles.map((t) => ({ x: t.offset[0], z: t.offset[2], cmd: load(t, dx, dz) })), ['say Polis: done.']);
        files.push({ name: `functions/${ns}/${group}${sfx(dx)}.mcfunction`, fn: `${ns}/${group}${sfx(dx)}`, text: [
          `# Polis: ${noun} only (pairs with build${sfx(dx)}), in ${tiles.length} structure${tiles.length === 1 ? '' : 's'} of their own. Run once: each run brings another set.`,
          `say Polis: bringing in the ${noun}...`, ...c.entry].join('\n') + '\n' }, ...c.files);
      }
      continue;
    }
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
      ...areaNames.map((n) => `tickingarea remove ${n}`),
      ...holdAreas.map((a) => addArea(a, dx, dz)),
      staged ? `say Polis: ${holdAreas.length} ticking areas over the middle of the city (it is too big for a world to keep all of it loaded).`
        : `say Polis: ${areas.length} ticking areas over the city. Give them a moment to load, then summon what is missing.`,
    ].join('\n') + '\n';
    files.push(
      { name: `functions/${ns}/areas.mcfunction`, fn: `${ns}/areas`, text: areaFn(wb.x0, wb.z0, 'Polis: the city kept loaded (pairs with build)') },
      { name: `functions/${ns}/areas_centered.mcfunction`, fn: `${ns}/areas_centered`, text: areaFn(cx, cz, 'Polis: the city kept loaded (pairs with build_centered)') });
    // and taking them off, when everything is in (populate leaves them on)
    const releaseFn = (title) => [`# ${title}`, ...areaNames.map((n) => `tickingarea remove ${n}`),
      `say Polis: the city's ${holdAreas.length} ticking areas are off. It runs only near players now, as the rest of the world does.`].join('\n') + '\n';
    files.push(
      { name: `functions/${ns}/release.mcfunction`, fn: `${ns}/release`, text: releaseFn('Polis: the city\'s ticking areas taken off (pairs with build)') },
      { name: `functions/${ns}/release_centered.mcfunction`, fn: `${ns}/release_centered`, text: releaseFn('Polis: the city\'s ticking areas taken off (pairs with build_centered)') });
  }
  // goto_<kind>: to each landmark, from the spot build_centered marked, wherever you
  // stand (the city's ticking areas keep the marker loaded), facing its front
  // (the marker found by the city's own tag, not this pack's name: a city built from
  // an older pack, or an earlier export of this one, has a marker of another name.
  // One built before the tag existed is marked again with mark_centre.)
  const places = placeOffsets(world, opts);
  for (const P of places) {
    const r = (a) => `~${a || ''}`;
    files.push({ name: `functions/${ns}/goto_${P.id}.mcfunction`, fn: `${ns}/goto_${P.id}`, text: [
      `# Polis: to the ${P.name}, ${P.words} of the build_centered spot. Or from that spot: /tp @s ${r(P.rel[0])} ${r(P.rel[1])} ${r(P.rel[2])}`,
      `execute at @e[type=armor_stand,tag=${ctag},c=1] run tp @s ${r(P.rel[0])} ${r(P.rel[1])} ${r(P.rel[2])} facing ${r(P.relLook[0])} ${r(P.relLook[1])} ${r(P.relLook[2])}`,
      `execute if entity @e[type=armor_stand,tag=${ctag}] run say Polis: the ${P.name}.`,
      `execute unless entity @e[type=armor_stand,tag=${ctag}] run say Polis: the city's centre marker was not found (a city built from an older pack has none, or you are too far away for it to be loaded). Stand exactly where you ran build_centered, run /function ${ns}/mark_centre, then try again. Or use Find a landmark in the Polis app for the coordinates.`,
    ].join('\n') + '\n' });
  }
  // a city joined to another's bridge (joins.js): stand_here takes you from the other city's
  // marked build spot to this city's, where build_centered puts its road against the bridge
  if (world.joinFrom && world.joinFrom.ctag) {
    const J = world.joinFrom, [ox, oy, oz] = J.offset, who = J.name || 'the other city';
    const r = (a) => `~${a || ''}`, clean = (t) => String(t).replace(/[^A-Za-z0-9 _'-]/g, '');
    files.push({ name: `functions/${ns}/stand_here.mcfunction`, fn: `${ns}/stand_here`, text: [
      `# Polis: to this city's build spot, from ${who}'s (its build_centered marker), so its road meets ${who}'s ${J.side === 'west' ? 'east' : J.side === 'east' ? 'west' : J.side === 'north' ? 'south' : 'north'} bridge.`,
      `# Or from that marker yourself: /tp @s ${r(ox)} ${r(oy)} ${r(oz)}`,
      // (found by the other city's tag; failing that by its marker's name, a marker made by
      // another export of it; failing both, said what to do: 0.75.4)
      `execute at @e[type=armor_stand,tag=${J.ctag},c=1] run tp @s ${r(ox)} ${r(oy)} ${r(oz)}`,
      ...(J.ns ? [`execute unless entity @e[type=armor_stand,tag=${J.ctag}] at @e[type=armor_stand,name=${centreAnchor(J.ns)},c=1] run tp @s ${r(ox)} ${r(oy)} ${r(oz)}`] : []),
      `execute if entity @e[type=armor_stand,tag=${J.ctag}] run say Polis: this is the build spot for ${ns}, against ${clean(who)}'s bridge. Run /function ${ns}/build_centered from here (do not move first).`,
      ...(J.ns ? [`execute unless entity @e[type=armor_stand,tag=${J.ctag}] if entity @e[type=armor_stand,name=${centreAnchor(J.ns)}] run say Polis: this is the build spot for ${ns}, against ${clean(who)}'s bridge (found by its marker's name). Run /function ${ns}/build_centered from here (do not move first).`] : []),
      `execute unless entity @e[type=armor_stand,tag=${J.ctag}]${J.ns ? ` unless entity @e[type=armor_stand,name=${centreAnchor(J.ns)}]` : ''} run say Polis: ${clean(who)}'s centre marker was not found: it is only found when you are near it. Go to ${clean(who)}'s build spot (its armor stand, in the centre monument's alcove) and run this again. Or stand exactly on that spot and run /function ${ns}/stand_here_from_spot.`,
    ].join('\n') + '\n' });
    // the same, with no marker: run on the other city's build spot itself
    files.push({ name: `functions/${ns}/stand_here_from_spot.mcfunction`, fn: `${ns}/stand_here_from_spot`, text: [
      `# Polis: to this city's build spot, from ${who}'s build spot. Run standing exactly where ${who}'s build_centered was run (no marker needed).`,
      `tp @s ${r(ox)} ${r(oy)} ${r(oz)}`,
      `say Polis: this is the build spot for ${ns}, if you ran this from ${clean(who)}'s. Run /function ${ns}/build_centered from here (do not move first).`,
    ].join('\n') + '\n' });
  }
  if (places.length) files.push({ name: `functions/${ns}/mark_centre.mcfunction`, fn: `${ns}/mark_centre`, text: [
    `# Polis: mark this spot as the city's centre, for the goto functions. Stand exactly where you ran build_centered`,
    `# (in the centre monument's alcove, under its sign). Needed only for a city built from a pack older than 0.56.0.`,
    `kill @e[type=armor_stand,tag=${ctag}]`,
    `kill @e[type=armor_stand,name=${anchor}]`,
    `summon armor_stand ${anchor} ~ ~ ~`,
    `tag @e[type=armor_stand,name=${anchor},r=2] add ${ctag}`,
    `say Polis: this spot is marked as the city's centre. /function ${ns}/goto_<name> now works from anywhere in the city.`,
  ].join('\n') + '\n' });
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
  // A safety net: a command with NaN or undefined in it would not parse, and
  // Bedrock would load none of its function (three armour stands with no place
  // took populate down). Such a line is left out, and said so on the console.
  for (const f of out) {
    if (!f.text) continue;
    const bad = f.text.split('\n').filter((l) => /\bNaN\b|undefined|\[object /.test(l));
    if (!bad.length) continue;
    console.warn(`Polis: ${bad.length} malformed command(s) left out of ${f.fn || f.name}: ${bad[0]}`);
    f.dropped = bad;              // (kept on the file: the checks fail on any, the net only keeps the pack loading)
    f.text = f.text.split('\n').filter((l) => !/\bNaN\b|undefined|\[object /.test(l)).join('\n');
  }
  return out;
}

// Where each landmark is from the build_centered spot (city.js: landmarkPlaces): the
// offsets a /tp from that spot takes, and in words ("171 west, 98 north").
export function placeOffsets(world, opts = {}) {
  const wb = world.box, mid = opts.centre || world.centre;
  const cx = mid ? mid[0] : Math.floor((wb.x0 + wb.x1 + 1) / 2);
  const cz = mid ? mid[1] : Math.floor((wb.z0 + wb.z1 + 1) / 2);
  return (opts.places || []).filter((P) => P && P.at && P.at.every(Number.isFinite)).map((P) => {
    const rel = [P.at[0] - cx, P.at[1] - GROUND_DROP, P.at[2] - cz];
    const relLook = [P.look[0] - cx, P.look[1] - GROUND_DROP, P.look[2] - cz];
    const words = [rel[0] && `${Math.abs(rel[0])} ${rel[0] > 0 ? 'east' : 'west'}`, rel[2] && `${Math.abs(rel[2])} ${rel[2] > 0 ? 'south' : 'north'}`].filter(Boolean).join(', ') || 'right here';
    return { ...P, rel, relLook, words };      // (look stays the city point it was)
  });
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
  if (opts.world && opts.world.joinFrom) {
    const J = opts.world.joinFrom, who = J.name || 'the other city';
    L.push(`THIS CITY JOINS ${who.toUpperCase()}, by its bridge. Build ${who} first (its build_centered, then populate_centered).`);
    L.push(`Then stand on ${who}'s build spot (its armor stand marker) and run:`);
    L.push('');
    L.push(`    /function ${ns}/stand_here          (takes you to this city's build spot)`);
    L.push(`    /function ${ns}/build_centered      (from there, without moving)`);
    L.push(`    /function ${ns}/populate_centered   (once it has finished appearing)`);
    L.push('');
    L.push(`  stand_here finds ${who}'s marker only when you are near it: stand on ${who}'s build spot first.`);
    L.push(`  Standing exactly on that spot, /function ${ns}/stand_here_from_spot does the same with no marker.`);
    L.push(`  Or by hand, from ${who}'s marker: /tp @s ~${J.offset[0] || ''} ~${J.offset[1] || ''} ~${J.offset[2] || ''}  (x east, y up, z south).`);
    L.push(`  This city's road comes out on its ${J.side} side and meets the bridge's landing.`);
    L.push('');
  }
  if (opts.world && opts.world.joins && opts.world.joins.length) {
    L.push('BRIDGES TO OTHER CITIES. Each ends at a landing where the next city\'s road comes in.');
    for (const j of opts.world.joins) L.push(`    ${j.side.padEnd(6)} a ${j.kind}, ${j.gap} blocks across: its far end x ${j.end[0] >= 0 ? '+' : ''}${j.end[0]}, z ${j.end[2] >= 0 ? '+' : ''}${j.end[2]} from the build spot`);
    L.push('  To build a city at the end of one: in the Polis app, after exporting this city, pick it under');
    L.push('  "Join to" (this city\'s name and the bridge\'s side), generate the next city and export it. Its');
    L.push('  pack has a stand_here function that takes you from this city\'s build spot to its own.');
    L.push('');
  }
  if (opts.centre) L.push('The city centre is a diamond monument with beacons on top: build_centered puts you in its alcove, under the sign.');
  L.push('To take the city away again: /function <city id>/remove_centered from the build_centered spot (or remove from the build spot).'.replace('<city id>', opts.namespace || 'polis'));
  L.push('  It clears the city to a clean site (grass on the city\'s own ground) and removes every non-player entity in the area.');
  if (opts.plugs) L.push('Underground: build first fills every room under the city (cellars, crypt, metro) with stone, then the city puts the rooms back: the world\'s own groundwater cannot get in at the edge of a tile not yet loaded.');
  if (opts.plugs) L.push('The rails under the city (the metro) are not laid by build: populate lays them, once the whole city is in, so no water running in at a tile\'s edge while it loads can wash them away.');
  if (opts.plugs) L.push('If any are missing afterwards, /function <city>/metro_rails_centered (or metro_rails, or metro_rails_from_mark) sets every one of them again, one by one. The first line build and populate say in chat names the Polis version and the city\'s function name: check it is this pack\'s.');
  L.push(`build_centered also leaves an armor stand on its spot (named ${centreAnchor(ns)}). Run populate_centered`);
  L.push('  from that spot; if you have moved, go back to it first:');
  L.push(`    /tp @s @e[type=armor_stand,name=${centreAnchor(ns)},c=1]`);
  L.push(`  (or try /function ${ns}/populate_from_mark, which runs populate_centered from the marker for you)`);
  L.push(`Functions in this pack: ${ns}/build, build_centered, populate, populate_centered`);
  L.push('(plus minecarts / minecarts_centered on railway cities, to re-summon carts near you,');
  L.push(' boats / boats_centered for the dock, and fish / fish_centered for the ponds and canal).');
  L.push('');
  const places = opts.world ? placeOffsets(opts.world, opts) : [];
  if (places.length) {
    L.push('WHERE THINGS ARE (from the build_centered spot; north is -Z). To go to one:');
    L.push(`    /function ${ns}/goto_<name>     e.g. /function ${ns}/goto_${places[0].id}`);
    L.push('  (it takes you there from the marker build_centered left, wherever you are in the city.');
    L.push(`  A city built from a pack older than 0.56.0 has no such marker: stand exactly where you ran`);
    L.push(`  build_centered and run /function ${ns}/mark_centre once. The Polis app's Find a landmark panel`);
    L.push('  also gives each landmark\'s coordinates from your build spot.)');
    const w = Math.max(...places.map((P) => P.name.length));
    for (const P of places) L.push(`  ${P.name.padEnd(w)}  ${P.words.padEnd(20)}  goto_${P.id}`);
    L.push('');
  }
  if ((opts.places || []).some((P) => P.kind === 'airport')) {
    L.push('THE AIRPORT\'S LAUNCH PADS run command blocks: take an elytra and rockets from the chest beside a');
    L.push('  pad, put the elytra on, step on the plate; it lifts you high and slows your fall, so open the elytra');
    L.push('  (jump in the air). If a pad does nothing: /gamerule commandblocksenabled true (cheats must be on).');
    L.push('  On the grass beside the terminal, a compass rose set in the ground, true to the world: its red point');
    L.push('  and the red N point north (-Z). Fly over it to get your bearings.');
    L.push('');
  }
  if ((opts.spawns || []).some((p) => p.group === 'stadium')) {
    L.push('THE STADIUM\'S BOUTS: the fighters come with populate (or /function ' + ns + '/stadium_centered); each is');
    L.push('  saved with Resistance V, so none is ever hurt, and a command block under the pitch gives it again (silently:');
    L.push('  build turns the command block chat off with /gamerule commandblockoutput false; needs command blocks on).');
    L.push('  Four bouts, one to each quarter of the pitch: iron golems against a vindicator, a husk, a ravager and a zoglin.');
    L.push('  The pitch is a glass cage, roofed in glass eight blocks up, so no fighter is thrown out of it.');
    L.push('  The fans go up into the stands by the stair from the street.');
    L.push('  The bouts run while you are near enough for the stadium to be simulated.');
    L.push('');
  }
  if ((opts.spawns || []).some((p) => p.group === 'arena')) {
    const HUNT = ['wolf', 'fox', 'ocelot', 'cat', 'polar_bear', 'goat', 'llama'], PREY = ['sheep', 'rabbit', 'chicken'];
    const kinds = [...new Set(opts.spawns.filter((p) => p.group === 'arena' && p.type === 'mob' && !HUNT.includes(p.kind) && !PREY.includes(p.kind)).map((p) => p.kind.replace(/_/g, ' ')))];
    L.push('THE MEGA ARENA: a covered arena beside the city, its doors at the end of its own road. A tunnel under the stands');
    L.push('  leads in to the walkway round the cage; climb the rows of seats (a staircase all round) to the concourse at the top.');
    L.push('  In the glass cage, roofed in glass fourteen blocks up, every mob a cage can hold, two of each, and a dozen');
    L.push('  iron golems to take them on: ' + kinds.join(', ') + '.');
    L.push('  And the hunters with their prey: wolves (after sheep, rabbits, foxes and the skeletons), foxes (chickens, rabbits),');
    L.push('  ocelots (chickens), cats (rabbits), polar bears (foxes), goats (they ram anything near), llamas (they spit at');
    L.push('  wolves); sheep, rabbits and chickens to be chased. Two of each, kept from harm like the rest.');
    L.push('  Every fighter is saved with Resistance V (no damage at all) and named (a named mob never despawns), and a');
    L.push('  silent command block under the sand gives the Resistance again every two seconds: the fights go on and');
    L.push('  nobody dies. The roof keeps the sun off. They come with populate, or /function ' + ns + '/arena_centered');
    L.push('  (each run brings another set). Command blocks must be on (/gamerule commandblocksenabled true).');
    L.push('  Not in the cage: creeper (would blow it open), ghast, guardian and elder guardian (fly or need water),');
    L.push('  enderman and shulker (teleport out), evoker and vex (pass through walls), Wither, Warden, Ender Dragon (no cage');
    L.push('  holds them), phantom (fights only players), piglins and hoglins (turn into other mobs in the Overworld), creaking;');
    L.push('  and of the animals: frogs (they swallow small slimes whole, past any Resistance), bees (die when they sting),');
    L.push('  pandas (only a hurt one fights, and only players), and the ones that need water.');
    L.push('');
  }
  if ((opts.spawns || []).some((p) => p.group === 'market')) {
    const names = [...new Set(opts.spawns.filter((p) => p.group === 'market').map((p) => p.name))];
    L.push('THE FARMERS\' MARKET: a wandering trader in each stall of the market, each stall its own trades (they come back');
    L.push('  after a while, as a villager\'s do): ' + names.join(', ') + '.');
    L.push('  Trade over the counter at the front of a stall. The traders come with populate, or /function ' + ns + '/market_centered');
    L.push('  (each run brings another set). They never leave or despawn; a wandering trader the game sends is as it always was.');
    L.push('');
  }
  if ((opts.world && opts.world.data ? [...opts.world.data.values()] : []).some((d) => d && d.id === 'CommandBlock' && /lever \["open_bit"/.test(d.tags.Command.v))) {
    L.push('FIREWORKS: a lever on the town hall\'s front wall, beside its doors, a sign by it. Flip it on and the fireworks');
    L.push('  go up over the town square every second and a half, five at a time, from the column in the fountain; off,');
    L.push('  they stop. Each dispenser holds nine stacks of rockets (about twenty minutes of show); refill them with any');
    L.push('  rockets. Command blocks must be on (/gamerule commandblocksenabled true), and you must be near enough for the');
    L.push('  square and the town hall to be loaded.');
    L.push('');
  }
  if ((opts.places || []).some((P) => P.kind === 'maproom')) {
    L.push('THE MAP ROOM: the whole city laid out in blocks on its floor, north to the north. Up the four steps beside');
    L.push('  the doors to the gallery round it, and look down: the key is on the signs along the gallery\'s back wall');
    L.push('  (red: you are here; gold: the town hall; yellow: the landmarks; white: towers; grey: streets; blue: water).');
    L.push('');
  }
  if ((opts.world && opts.world.data ? [...opts.world.data.values()] : []).some((d) => d && d.id === 'CommandBlock' && /function \{ns\}\/goto_/.test(d.tags.Command.v))) {
    L.push('FIND A LANDMARK IN THE GAME: the board by the centre monument has a sign for every landmark; press the button');
    L.push('  under one and it takes you there (it runs /function ' + ns + '/goto_<name> for you). Command blocks must be on.');
    L.push('');
  }
  if ((opts.places || []).some((P) => P.kind === 'university')) {
    L.push('THE UNIVERSITY: a campus beside the city through its gate: the avenue across the quad to the clock tower, eight');
    L.push('  schools round the quad (Science, Medicine, Engineering, Agriculture, Law, Arts, Music, Astronomy), each with');
    L.push('  its name over its door; the Great Library (an enchanting table among its shelves, in the middle) and the Great');
    L.push('  Hall (a lecture theatre) either side of the clock tower; a ladder inside the tower climbs to the belfry and its');
    L.push('  bell. Behind it all, the sports field.');
    L.push('');
  }
  if ((opts.places || []).some((P) => P.kind === 'themepark')) {
    L.push('THE THEME PARK\'S BIG WHEEL turns: a clock of command blocks under it loads its frames in turn (silently),');
    L.push('  a whole turn every 24 seconds. It runs only while you are near (within simulation distance), and only with');
    L.push('  command blocks on: if it stands still, run  /gamerule commandblocksenabled true  and walk up to it.');
    L.push('  A wheel built from a pack older than 0.56.1 used a counting clock that may not run: build the theme park again.');
    L.push('  Its cabins cannot be ridden while it turns. The Leviathan: press the button at its station. A lap is near');
    L.push('  900 rails: the lift hill, a corkscrew, hills all round the park, a second lift and corkscrew, the dark tunnel.');
    L.push('  Behind the coaster, along the walk at the back: bumper boats (the boats come in the park\'s own structures, with populate');
    L.push('  or /function ' + ns + '/themepark_centered), a hedge maze');
    L.push('  with a chest at its far end, trampolines of slime with a tower to jump off (slime takes the fall), and an');
    L.push('  archery range: bows and arrows in the chest, and a target lights its lamp when an arrow hits it.');
    L.push('');
  }
  if ((opts.places || []).some((P) => P.kind === 'watertower' || P.kind === 'petrol')) {
    L.push('THE WATER TOWER: a ladder up its front leg to the catwalk round the tank; a second ladder up the tank to its roof,');
    L.push('  where a hatch drops you into the water. THE PETROL STATION: press a pump\'s button and it hands out a lump of coal.');
    L.push('');
  }
  if ((opts.places || []).some((P) => P.kind === 'bandstand')) {
    L.push('THE BANDSTAND: press the button on the stand in the middle of the stage and it plays its tune, a melody and a');
    L.push('  bass, from the note blocks on its roof (the lamp on top lights while it plays). Every city has its own tune.');
    L.push('');
  }
  if ((opts.places || []).some((P) => P.kind === 'themepark')) {
    L.push('THE SHOOTING GALLERY (in the theme park\'s archery range): flip the lever on the counter and six targets rise out');
    L.push('  of the floor and sink again, one after another out from the middle, over and over. Hit one while it is up and');
    L.push('  its lamp lights. Lever off to stop them. Bows and arrows in the chest.');
    L.push('');
  }
  if ((opts.places || []).some((P) => P.kind === 'wizard')) {
    L.push('THE WIZARD\'S TOWER: the ladder up the back wall goes to every floor. On the ground the cauldrons; on the first');
    L.push('  floor the brewing stands (blaze powder in them, every ingredient in the chests); on the second the enchanting');
    L.push('  table with fifteen bookshelves round it, lapis and bottles o\' enchanting in the chest (throw them for the levels');
    L.push('  you need), an anvil and a grindstone; at the top the wizard\'s own room, a bed and an ender chest.');
    L.push('');
  }
  if ((opts.places || []).some((P) => P.kind === 'nightclub')) {
    L.push('THE NIGHTCLUB: the jukebox panel is across the back of the club, six buttons, each with its song\'s name on a');
    L.push('  sign over it. Press one and its song plays from the floors above (a few seconds\' wait for the higher songs:');
    L.push('  the signal climbs the tower to them). Each song is a melody and a rhythm line of note blocks, seventy-odd');
    L.push('  steps, twenty-odd seconds. The glass bands up the outside show the circuits. A real jukebox and a chest of');
    L.push('  every music disc are at the booth too. Do not break the blocks over the club: the songs are up there.');
    L.push('');
  }
  if (opts.world && opts.world.lifts) {
    L.push('BUBBLE LIFTS: the tall towers have two shafts of water beside the stairs, behind a pair of open doors on every');
    L.push('  floor. Step into the one over soul sand and it carries you up to the top floor (you pop out: step off sideways);');
    L.push('  the one over magma drags you down. To get off on a floor between, hold forward into its doorway as you pass.');
    L.push('  At the bottom of the down shaft the magma burns: crouch (sneak) and walk out.');
    L.push('');
  }
  if ((opts.places || []).some((P) => P.kind === 'bank')) {
    L.push('THE BANK\'S VAULT: go through the gap at the end of the counter to the tellers\' side. Five levers on the back wall');
    L.push('  open the vault\'s iron door when each is set right, on or off; the lamp over the door lights when they are.');
    L.push('  The code is on the manager\'s sign at the far end, for those who look (and in the summary in the app).');
    L.push('  Inside, a button by the door lets you out. Plain redstone: no command blocks.');
    L.push('');
  }
  if ((opts.places || []).some((P) => P.kind === 'sports')) {
    L.push('THE SPORTS CENTRE: the court and the pool lane on the ground; the climbing wall across the back of the hall');
    L.push('  (ladders and scaffolding: hold jump to go up scaffolding, sneak to come down; hay to land on) up to a');
    L.push('  platform that leads into the parkour room over the pool. Its floor is lava (not really: it is concrete):');
    L.push('  jump block to block to the platform at the front, then down the ladder to the lobby. The running track is');
    L.push('  on the roof: up the ladder in the parkour room.');
    L.push('');
  }
  if ((opts.places || []).some((P) => P.kind === 'mill')) {
    L.push('THE MILL, beside the factory: plain redstone, no command blocks.');
    L.push('  The item sorter: put things in the chest at the top left of the line. Sugar cane, coal, iron ingots and');
    L.push('  cobblestone each go into their own barrel below; anything else goes on to the barrel at the end. Each');
    L.push('  filter hopper holds 41 of its item and four sticks named "Polis filter": leave them be (without them a');
    L.push('  filter takes in anything). The first of each item waits in the hopper under its filter till the next comes.');
    L.push('  The observer clock: lever up. The piston lifts an observer into a ring of ten, each watching the one');
    L.push('  before it; a pulse runs round once a second, flashing the lamp on top and playing the note block. Lever');
    L.push('  down to stop it.');
    L.push('  The sugar cane farm: when a cane grows three high its observer sets off the pistons, which break it and');
    L.push('  push the stalks into the stream; the stream carries them to the barrel at its end. The top stalk drops');
    L.push('  at the foot of the cane now and then. Cane grows slowly (many minutes a block, at random),');
    L.push('  and only while you are near. To watch it work sooner: /gamerule randomtickspeed 20 (and back to 1 after).');
    L.push('');
  }
  if (opts.world && needsStages(opts.world)) {
    const plan = stagePlan(opts.world, ns);
    L.push('A BIG CITY, FILLED IN PARTS. A world holds ten ticking areas at most, too few to keep all of');
    L.push(`this city loaded at once. So populate (and metro_rails, jail, zoo...) work in ${plan.stages.length} parts or fewer:`);
    L.push(`each holds its own part of the city loaded with ${STAGE_AREAS} ticking areas (and one small one on your spot),`);
    L.push('waits for it to load, does that part\'s work, and goes on to the next. Stay in the world until it says');
    L.push('"done" (it says "part 1 of N...", then "part 1 of N done.", and so on as it goes). Afterwards the middle of the city stays');
    L.push(`held loaded (${STAGE_AREAS} ticking areas): /function ${ns}/release_centered takes them off.`);
    L.push('If it stops at a part: /tickingarea list, remove old ones (/tickingarea remove_all clears them all),');
    L.push(`then from the build spot run /function ${ns}/populate_centered_part<n> for that part (e.g. populate_centered_part2).`);
    L.push('');
    L.push('THE PARTS, from the build_centered spot (the armor stand in the centre monument\'s alcove).');
    L.push('North is -Z (F3 says "Facing: north"): x is blocks east (+) or west (-) of the spot, z blocks south (+) or north (-).');
    L.push('In chat each part names itself the same way: "part 3 of 6 (south-east)...".');
    const sg = (v) => (v > 0 ? '+' + v : String(v));
    plan.where.forEach((w, k) => {
      L.push(`    part ${String(k + 1).padEnd(2)}  ${w.name.padEnd(11)}  x ${sg(w.box.x0)} to ${sg(w.box.x1)},  z ${sg(w.box.z0)} to ${sg(w.box.z1)}`);
    });
    L.push(`(populate_centered and metro_rails_centered go part by part in this order; populate and metro_rails, run from the corner, have the same parts.)`);
    L.push('');
  }
  L.push('A JAIL, ZOO OR AQUARIUM EMPTY? Their animals are summoned, and a summon only reaches');
  L.push('loaded chunks. The city is kept loaded by ticking areas, and a world holds ten at most:');
  L.push('another city\'s left behind and these are never made. From the build spot:');
  L.push('    /tickingarea list            (see them)');
  L.push('    /tickingarea remove_all      (clear old ones)');
  L.push(`    /function ${ns}/areas_centered   (this city's, again; then wait a moment)`);
  L.push(`    /function ${ns}/jail_centered, /function ${ns}/zoo_centered, /function ${ns}/museum_centered`);
  if ((opts.spawns || []).some((p) => p.group === 'mall')) L.push(`    /function ${ns}/mall_centered   (the mall's shopkeepers, if their booths are empty)`);
  L.push('populate leaves the ticking areas on (the whole city kept running, so a later run still');
  L.push(`reaches every part). When everything is in:   /function ${ns}/release_centered`);
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
  if (opts.sea && opts.world && opts.world.sea && opts.world.sea.sunken) {
    L.push('THE SUNKEN CITY: build puts the city in, then lets the sea in over the sunken streets last, once the glass');
    L.push('  wall round them is whole. Swim in through any doorway. The conduits (in their prismarine frames on the open');
    L.push('  ground) give Water Breathing, sight and quick mining to everyone within 96 blocks: stay near one. The doors in');
    L.push('  the glass wall hold the sea back, open or shut: walk through one and you are in the water. If any of the sea');
    L.push('  did not appear (a chunk that was not loaded), run build again from the same spot.');
    L.push('  The trams and railway run on through the flood in tubes of glass: swim to one of the doors in a tube\'s side');
    L.push('  (at the stations and every 24 blocks or so) and step in out of the water. The metro stays dry: its stairs');
    L.push('  come up in glass booths with a door on to the street.');
    L.push('');
  }
  else if (opts.sea) {
    L.push('UNDER THE SEA: the city stands on the seabed in a hall of glass, the sea all round and over it, held');
    L.push('  in by a second wall of glass. build drains the hall first, puts the city in, and lets the sea in last,');
    L.push('  once all the glass is standing. Four glass tunnels lead out under the sea, one a side, to double doors');
    L.push('  in the outer wall. The tank stands on your ground like an aquarium: build it on open, level land (or');
    L.push('  out in the ocean). If any of the sea did not appear (a chunk that was not loaded), run build again from');
    L.push('  the same spot. remove takes the sea and both walls away with the city.');
    L.push('');
  }
  else if (opts.dome) {
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
  const structures = buildStructures(world, opts).concat(buildDrainStructures(world, opts), buildPlugStructures(world, opts), buildRailStructures(world, opts), buildRemoveStructures(world, opts), buildAnimStructures(world, opts), buildSeaStructures(world, opts));
  const mobStructs = buildMobStructures(opts.spawns, opts);
  const guide = placementGuide(tiles, { ...opts, world, dome: !!world.dome, sea: !!world.sea, stilts: !!world.stiltGrid, floating: !!world.floating, plugs: !!(world.airBoxes && world.airBoxes.length) });
  const fns = functionFiles(tiles, world, { ...opts, mobTiles: mobStructs });
  // the fish's definitions where there are fish to keep: the ponds' or the
  // aquarium's (its fish are summoned with keep events these define); the mobs'
  // where there is a jail or a zoo to keep
  const hasFish = (opts.spawns || []).some((p) => FISH.has(p.type)) || (opts.zoo || []).some((p) => FISH.has(p.type) || p.type === 'tropicalfish');
  // (and any other mob saved kept: the arena's cage, the market's traders)
  const hasKept = (opts.inmates || []).length > 0 || (opts.zoo || []).length > 0 || (opts.spawns || []).some((p) => p.type === 'mob');
  const hasMarket = (opts.spawns || []).some((p) => p.kind === 'wandering_trader');
  const data = await buildMcPack(structures.concat(mobStructs), {
    ...opts, guide,
    files: fns.map((f) => ({ name: f.name, data: f.text })).concat(hasFish ? fishEntityFiles() : [], hasKept ? mobEntityFiles() : [], hasMarket ? tradeFiles() : []),
  });
  return { data, structures, mobStructures: mobStructs, guide, functions: fns };
}

export async function exportStructuresZip(world, opts = {}) {
  const tiles = tileList(world, opts);
  const structures = buildStructures(world, opts).concat(buildDrainStructures(world, opts), buildPlugStructures(world, opts), buildRailStructures(world, opts), buildRemoveStructures(world, opts), buildAnimStructures(world, opts), buildSeaStructures(world, opts));
  const mobStructs = buildMobStructures(opts.spawns, opts);
  const guide = placementGuide(tiles, { ...opts, world, dome: !!world.dome, sea: !!world.sea, stilts: !!world.stiltGrid, floating: !!world.floating, plugs: !!(world.airBoxes && world.airBoxes.length) });
  const fns = functionFiles(tiles, world, { ...opts, mobTiles: mobStructs });
  const files = structures.concat(mobStructs).map((s) => ({ name: `${s.name}.mcstructure`, data: s.data }));
  for (const f of fns) files.push({ name: f.name, data: new TextEncoder().encode(f.text) });
  files.push({ name: 'placement-guide.txt', data: new TextEncoder().encode(guide) });
  const data = await makeZip(files, opts);
  return { data, structures, mobStructures: mobStructs, guide, functions: fns };
}
