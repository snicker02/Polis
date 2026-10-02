// engine/export-java.js — Java Edition output: .nbt structures in a datapack.
//
// Java differs from Bedrock in every layer of the output:
//   NBT is big-endian and gzipped, not little-endian and raw.
//   A structure is {size, palette:[{Name,Properties}], blocks:[{state,pos,nbt}]}
//     rather than a flat array of palette indices.
//   There is no add-on: a datapack carries the structures, and functions place
//     them with /place template.
//   Sign text is JSON per line; a bed's colour is part of its block name.
//
// The city itself is untouched by any of this: it is the same blocks, written
// a different way.

import { MATERIALS, MAT } from './materials.js';
import { toJava, javaSignText } from './java-blocks.js';
import { HOSTILE_KINDS } from './hostiles.js';
import { domeAir } from './dome.js';
import { VoxelWorld } from './blockcore.js';
import { javaEntity, javaEntityPos } from './java-entities.js';

// ---- big-endian NBT ------------------------------------------------------
const T = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11 };

// One growing buffer (doubling as needed) and tag names encoded once: a big
// city lists a million blocks, and a fresh little array for every byte, as
// this used to make, left the export waiting on the garbage collector.
const TEXT = new TextEncoder();
const NAMES = new Map();
class Writer {
  constructor() { this.buf = new Uint8Array(1 << 16); this.dv = new DataView(this.buf.buffer); this.len = 0; }
  room(n) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const b = new Uint8Array(cap); b.set(this.buf.subarray(0, this.len));
    this.buf = b; this.dv = new DataView(b.buffer);
  }
  bytes(b) { this.room(b.length); this.buf.set(b, this.len); this.len += b.length; }
  u8(v) { this.room(1); this.buf[this.len++] = v & 0xff; }
  i16(v) { this.room(2); this.dv.setInt16(this.len, v, false); this.len += 2; }
  i32(v) { this.room(4); this.dv.setInt32(this.len, v | 0, false); this.len += 4; }
  f32(v) { this.room(4); this.dv.setFloat32(this.len, v, false); this.len += 4; }
  f64(v) { this.room(8); this.dv.setFloat64(this.len, v, false); this.len += 8; }
  str(s) {
    let b = NAMES.get(s);
    if (!b) { b = TEXT.encode(s); if (s.length <= 48 && NAMES.size < 4096) NAMES.set(s, b); }
    this.i16(b.length);
    this.bytes(b);
  }
  finish() { return this.buf.slice(0, this.len); }
}

// A value is [type, payload]; compounds are plain objects of them.
export const J = {
  byte: (v) => [T.BYTE, v],
  short: (v) => [T.SHORT, v],
  int: (v) => [T.INT, v],
  float: (v) => [T.FLOAT, v],
  double: (v) => [T.DOUBLE, v],
  str: (v) => [T.STRING, v],
  list: (type, items) => [T.LIST, { type, items }],
  comp: (obj) => [T.COMPOUND, obj],
};

function writeValue(w, [type, payload]) {
  switch (type) {
    case T.BYTE: w.u8(payload); break;
    case T.SHORT: w.i16(payload); break;
    case T.INT: w.i32(payload); break;
    case T.FLOAT: w.f32(payload); break;
    case T.DOUBLE: w.f64(payload); break;
    case T.STRING: w.str(payload); break;
    case T.LIST:
      if (payload.raw) { writeRawBlocks(w, payload.raw); break; }
      w.u8(payload.type);
      w.i32(payload.items.length);
      for (const item of payload.items) writeValue(w, [payload.type, item[1] !== undefined && Array.isArray(item) ? item[1] : item]);
      break;
    case T.COMPOUND:
      for (const [key, value] of Object.entries(payload)) {
        if (!value) continue;
        w.u8(value[0]);
        w.str(key);
        writeValue(w, value);
      }
      w.u8(T.END);
      break;
    default: throw new Error('cannot write NBT type ' + type);
  }
}

// A structure's blocks list written straight from flat arrays, the same bytes
// as a list of {state, pos, nbt?} compounds, without making one per block.
function writeRawBlocks(w, raw) {
  const { state, x, y, z, nbt, n } = raw;
  w.u8(T.COMPOUND);
  w.i32(n);
  for (let i = 0; i < n; i++) {
    w.u8(T.INT); w.str('state'); w.i32(state[i]);
    w.u8(T.LIST); w.str('pos'); w.u8(T.INT); w.i32(3); w.i32(x[i]); w.i32(y[i]); w.i32(z[i]);
    const be = nbt.get(i);
    if (be) { w.u8(T.COMPOUND); w.str('nbt'); writeValue(w, be); }
    w.u8(T.END);
  }
}

export function encodeJavaNbt(root, rootName = '') {
  const w = new Writer();
  w.u8(T.COMPOUND);
  w.str(rootName);
  writeValue(w, root);
  return w.finish();
}

// ---- a Java structure ----------------------------------------------------
// Java's block entities live inside the structure's blocks list, as "nbt".
function javaBlockEntity(name, data) {
  if (!data) return null;
  if (data.id === 'Sign') {
    const text = data.tags && data.tags.FrontText ? data.tags.FrontText.v.Text.v : '';
    const side = (rows) => J.comp({ messages: J.list(T.STRING, rows), color: J.str('black'), has_glowing_text: J.byte(0) });
    return J.comp({ id: J.str(name), is_waxed: J.byte(0), front_text: side(javaSignText(text)), back_text: side(javaSignText('')) });
  }
  if (data.id === 'Beacon') return J.comp({ id: J.str('minecraft:beacon') });
  if (data.id === 'MobSpawner') {
    // the same spawner on Java: what it spawns, and the same rhythm and reach
    const t = data.tags || {}, v = (k, d) => (t[k] ? t[k].v : d);
    const ident = v('EntityIdentifier', 'minecraft:tropicalfish') === 'minecraft:tropicalfish' ? 'minecraft:tropical_fish' : v('EntityIdentifier', 'minecraft:tropicalfish');
    return J.comp({
      id: J.str('minecraft:mob_spawner'),
      SpawnData: J.comp({ entity: J.comp({ id: J.str(ident) }) }),
      Delay: J.short(v('Delay', 200)), MinSpawnDelay: J.short(v('MinSpawnDelay', 200)), MaxSpawnDelay: J.short(v('MaxSpawnDelay', 800)),
      SpawnCount: J.short(v('SpawnCount', 4)), MaxNearbyEntities: J.short(v('MaxNearbyEntities', 6)),
      RequiredPlayerRange: J.short(v('RequiredPlayerRange', 16)), SpawnRange: J.short(v('SpawnRange', 4)),
    });
  }
  if (data.id === 'Bed') return null;                    // Java carries the colour in the block name
  return null;
}

// cells: iterable of [x, y, z, materialId, blockData]
// Java keeps a structure's entities beside its blocks: a position in the
// structure's own coordinates, the block it belongs to, and the entity's NBT.
function javaEntities(spawns, box) {
  const out = [];
  for (const spawn of spawns || []) {
    const e = javaEntity(spawn, J);
    if (!e) continue;
    const pos = javaEntityPos(spawn, box);
    out.push(J.comp({
      pos: J.list(T.DOUBLE, pos),
      blockPos: J.list(T.INT, [Math.floor(pos[0]), Math.floor(pos[1]), Math.floor(pos[2])]),
      nbt: J.comp({ id: J.str(e.id), ...e.nbt }),
    }));
  }
  return out;
}

export function writeJavaStructure(cells, box, opts = {}) {
  const palette = [];
  const paletteIndex = new Map();
  const cap = cells.length !== undefined ? cells.length : 0;
  const raw = { state: new Int32Array(cap), x: new Int32Array(cap), y: new Int32Array(cap), z: new Int32Array(cap), nbt: new Map(), n: 0 };
  const byMaterial = new Map();                        // material id (no block data) -> palette index
  for (const [x, y, z, id, data] of cells) {
    let index = data ? undefined : byMaterial.get(id);
    let name = null;
    if (index === undefined) {
      const def = MATERIALS.def(id);
      if (!def) continue;
      const jv = toJava(def.block, def.states, data && data.bytes ? data.bytes : {});
      name = jv.name;
      const props = jv.props;
      const key = name + '|' + Object.entries(props).sort().map(([k, v]) => k + '=' + v).join(',');
      index = paletteIndex.get(key);
      if (index === undefined) {
        index = palette.length;
        paletteIndex.set(key, index);
        const entry = { Name: J.str(name) };
        if (Object.keys(props).length) entry.Properties = J.comp(Object.fromEntries(Object.entries(props).map(([k, v]) => [k, J.str(String(v))])));
        palette.push(J.comp(entry));
      }
      if (!data) byMaterial.set(id, index);
    }
    const i = raw.n++;
    if (i >= raw.state.length) {                      // an iterable without a length: grow
      for (const k of ['state', 'x', 'y', 'z']) { const b = new Int32Array(Math.max(16, raw[k].length * 2)); b.set(raw[k]); raw[k] = b; }
    }
    raw.state[i] = index; raw.x[i] = x - box.x0; raw.y[i] = y - box.y0; raw.z[i] = z - box.z0;
    if (data) { const be = javaBlockEntity(name || toJava(MATERIALS.def(id).block, MATERIALS.def(id).states, data.bytes || {}).name, data); if (be) raw.nbt.set(i, be); }
  }
  const size = [box.x1 - box.x0 + 1, box.y1 - box.y0 + 1, box.z1 - box.z0 + 1];
  const root = J.comp({
    DataVersion: J.int(opts.dataVersion || 3953),        // 1.21.1
    size: J.list(T.INT, size),
    palette: J.list(T.COMPOUND, palette.map((p) => p[1])),
    blocks: [T.LIST, { type: T.COMPOUND, raw }],
    entities: J.list(T.COMPOUND, javaEntities(opts.spawns, box).map((e) => e[1])),
  });
  return { nbt: encodeJavaNbt(root), size, palette: palette.length, blocks: raw.n };
}

// Java structures are placed a piece at a time, so the city is cut into
// 48-block cubes — the size a structure block handles.
export function javaTiles(world, opts = {}) {
  const step = opts.tile || 48;
  const box = world.box;
  const cells = new Map();
  // Java places only the blocks a structure lists, so without air the old
  // landscape stays standing inside the city — trees and all. Air is written
  // for the empty part of every column the city occupies, up to its own roof
  // plus the clearance asked for.
  const air = [];
  const ground = [], piles = [];
  if (opts.fillAir) {
    const mask = world.cityMask;
    const inside = (x, z) => !mask || (x >= 0 && z >= 0 && x < mask.W && z < mask.D && mask.data[z * mask.W + x] === 1);
    const clearance = Math.max(0, Math.min(200, opts.clearAbove | 0));
    const depth = Math.max(0, Math.min(48, opts.foundation === undefined ? 8 : opts.foundation | 0));
    const tops = new Map(), bottoms = new Map();
    world.forEach((x, y, z) => {
      const k = x + ',' + z;
      const t = tops.get(k);
      if (t === undefined || y > t) tops.set(k, y);
      const b = bottoms.get(k);
      if (b === undefined || y < b) bottoms.set(k, y);
    });
    for (let x = box.x0; x <= box.x1; x++)
      for (let z = box.z0; z <= box.z1; z++) {
        if (!inside(x, z)) continue;
        const key = x + ',' + z;
        const top = tops.get(key);
        if (top === undefined) continue;                 // nothing of the city stands here
        const bottom = bottoms.get(key);
        // The empty cells the city means to be empty — rooms, the space under
        // a bridge, the air over the streets — are cleared. Below the city's
        // lowest block the column is filled instead, or clearing it would
        // leave a cavern under the town and holes wherever the surface opens.
        const ceiling = Math.min(box.y1 + clearance, top + clearance);
        for (let y = bottom; y <= ceiling; y++) if (!world.has(x, y, z)) air.push([x, y, z]);
        // (on stilts: a pile goes on down, islands and seawall are founded, open water is left alone)
        const sk = world.stiltGrid && x >= 0 && z >= 0 && x < world.stiltGrid.W && z < world.stiltGrid.D ? world.stiltGrid.kind[z * world.stiltGrid.W + x] : 0;
        if (sk === 1) continue;
        for (let y = bottom - depth; y < bottom; y++) if (!world.has(x, y, z)) (sk === 2 ? piles : ground).push([x, y, z]);
      }
  }
  const AIR = MATERIALS.add(null, 'minecraft:air', '#000000', {}, { passable: true, transparent: true });
  const FILL = MATERIALS.add(null, 'minecraft:stone', '#7d7d7d');
  const place = (x, y, z, id) => {
    const tx = Math.floor((x - box.x0) / step), ty = Math.floor((y - box.y0) / step), tz = Math.floor((z - box.z0) / step);
    const key = tx + ',' + ty + ',' + tz;
    let t = cells.get(key);
    if (!t) {
      t = { key, cells: [], box: { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity } };
      cells.set(key, t);
    }
    t.cells.push([x, y, z, id, null]);
    const b = t.box;
    b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.z0 = Math.min(b.z0, z);
    b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); b.z1 = Math.max(b.z1, z);
  };
  for (const [x, y, z] of air) place(x, y, z, AIR);
  for (const [x, y, z] of ground) place(x, y, z, FILL);
  for (const [x, y, z] of piles) place(x, y, z, MAT.DARK_FRAME);
  world.forEach((x, y, z, id) => {
    const tx = Math.floor((x - box.x0) / step), ty = Math.floor((y - box.y0) / step), tz = Math.floor((z - box.z0) / step);
    const key = tx + ',' + ty + ',' + tz;
    let t = cells.get(key);
    if (!t) {
      t = { key, cells: [], box: { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity } };
      cells.set(key, t);
    }
    t.cells.push([x, y, z, id, world.getData(x, y, z)]);
    const b = t.box;
    b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.z0 = Math.min(b.z0, z);
    b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); b.z1 = Math.max(b.z1, z);
  });
  // each piece takes the living things that stand inside it
  const out = [];
  let n = 0;
  for (const t of cells.values()) {
    // each living thing belongs to exactly one piece: the one holding the
    // block it stands in
    const inside = (opts.spawns || []).filter((p) => {
      const x = Math.floor(p.type === 'painting' && p.pos ? p.pos[0] : p.x);
      const y = Math.floor(p.type === 'painting' && p.pos ? p.pos[1] : p.y);
      const z = Math.floor(p.type === 'painting' && p.pos ? p.pos[2] : p.z);
      return x >= t.box.x0 && x <= t.box.x1 && y >= t.box.y0 && y <= t.box.y1 && z >= t.box.z0 && z <= t.box.z1;
    });
    const s = writeJavaStructure(t.cells, t.box, { ...opts, spawns: inside });
    s.entities = inside.length;
    out.push({
      name: `${opts.prefix || 'city'}_${n++}`,
      nbt: s.nbt, size: s.size, palette: s.palette, blocks: s.blocks, entities: s.entities || 0,
      // where it goes, relative to the player standing at the city's corner
      offset: [t.box.x0 - box.x0, t.box.y0 - (opts.groundDrop === undefined ? 2 : opts.groundDrop), t.box.z0 - box.z0],
    });
  }
  // A dome built under water is drained first: structures of air through every
  // cell of its inside, blocks' cells included, placed before the city (build
  // places pieces in order). Java's /place template waterlogs a block it puts
  // into water, so every block has to go into air instead.
  if (world.dome) {
    const d = world.dome, inDome = domeAir(d), drains = new Map();
    for (let x = Math.floor(d.cx - d.R); x <= Math.ceil(d.cx + d.R); x++)
      for (let z = Math.floor(d.cz - d.R); z <= Math.ceil(d.cz + d.R); z++)
        for (let y = d.G + 1; y <= d.G + d.c; y++) {
          if (!inDome(x, y, z)) continue;
          const key = Math.floor((x - box.x0) / step) + ',' + Math.floor((y - box.y0) / step) + ',' + Math.floor((z - box.z0) / step);
          let t = drains.get(key);
          if (!t) { t = { cells: [], box: { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity } }; drains.set(key, t); }
          t.cells.push([x, y, z, AIR, null]);
          const b = t.box;
          if (x < b.x0) b.x0 = x; if (y < b.y0) b.y0 = y; if (z < b.z0) b.z0 = z;
          if (x > b.x1) b.x1 = x; if (y > b.y1) b.y1 = y; if (z > b.z1) b.z1 = z;
        }
    const drainOut = [];
    let m = 0;
    for (const t of drains.values()) {
      const s = writeJavaStructure(t.cells, t.box, { ...opts, spawns: [] });
      drainOut.push({
        name: `${opts.prefix || 'city'}_d${m++}`, drain: true,
        nbt: s.nbt, size: s.size, palette: s.palette, blocks: s.blocks, entities: 0,
        offset: [t.box.x0 - box.x0, t.box.y0 - (opts.groundDrop === undefined ? 2 : opts.groundDrop), t.box.z0 - box.z0],
      });
    }
    return drainOut.concat(out);
  }
  return out;
}

// ---- the datapack --------------------------------------------------------
// Java 1.21 looks for data/<ns>/structure/*.nbt and data/<ns>/function/*.mcfunction.
export function javaPackFiles(structures, opts = {}) {
  const ns = opts.namespace || 'polis';
  const files = [];
  files.push({
    name: 'pack.mcmeta',
    text: JSON.stringify({
      pack: {
        description: `${opts.name || 'Polis'} — ${opts.description || 'a procedural city'}`,
        pack_format: opts.packFormat || 48,
        supported_formats: { min_inclusive: 26, max_inclusive: 81 },
      },
    }, null, 2),
  });
  for (const s of structures) files.push({ name: `data/${ns}/structure/${s.name}.nbt`, data: s.nbt });
  // A piece placed into a chunk the game has not loaded is silently dropped,
  // and a city is far wider than the loaded area around the player. So the
  // ground is forceloaded first, in rectangles of at most 256 chunks (the
  // limit for one command), and released afterwards.
  let x1 = 0, z1 = 0;
  for (const s of structures) {
    x1 = Math.max(x1, s.offset[0] + s.size[0]);
    z1 = Math.max(z1, s.offset[2] + s.size[2]);
  }
  // 15 chunks wide: standing mid-chunk it can still only touch 16, so the
  // command never asks for more than the 256 chunks it allows
  const STEP = 15 * 16;
  const areas = [];
  for (let x = 0; x <= x1; x += STEP)
    for (let z = 0; z <= z1; z += STEP)
      areas.push([x, z, Math.min(x + STEP - 1, x1), Math.min(z + STEP - 1, z1)]);
  const lines = [
    '# Polis — stand where you want the north-west corner and run this',
    `say Polis: loading the ground (${areas.length} area${areas.length === 1 ? '' : 's'})...`,
    ...areas.map(([ax, az, bx, bz]) => `forceload add ~${ax} ~${az} ~${bx} ~${bz}`),
    `say Polis: placing ${structures.length} pieces...`,
    ...structures.map((s) => `place template ${ns}:${s.name} ~${s.offset[0]} ~${s.offset[1]} ~${s.offset[2]}`),
    ...areas.map(([ax, az, bx, bz]) => `forceload remove ~${ax} ~${az} ~${bx} ~${bz}`),
    'say Polis: done.',
  ];
  files.push({ name: `data/${ns}/function/build.mcfunction`, text: lines.join('\n') + '\n' });
  // hostile mobs, on demand, from the same corner: the ground forceloaded first
  // (as build does), each kept (PersistenceRequired) and tagged for clearing
  const hostiles = opts.hostiles || [];
  if (hostiles.length && opts.box) {
    const b = opts.box;
    files.push({ name: `data/${ns}/function/hostiles.mcfunction`, text: [
      '# Polis: hostile mobs, all untouched by daylight. Stand where you ran build and run this.',
      `# Remove them again with /function ${ns}:hostiles_clear.`,
      `say Polis: summoning ${hostiles.length} hostile mobs...`,
      ...areas.map(([ax, az, bx, bz]) => `forceload add ~${ax} ~${az} ~${bx} ~${bz}`),
      ...hostiles.map((p) => `summon ${HOSTILE_KINDS[p.type].java} ~${p.x - b.x0} ~${p.y - b.y0} ~${p.z - b.z0} {PersistenceRequired:1b,Tags:["polis_hostile"]}`),
      ...areas.map(([ax, az, bx, bz]) => `forceload remove ~${ax} ~${az} ~${bx} ~${bz}`),
      'say Polis: done. Creepers and endermen can damage blocks: /gamerule mobGriefing false stops that.',
    ].join('\n') + '\n' });
    files.push({ name: `data/${ns}/function/hostiles_clear.mcfunction`, text: [
      '# Polis: removes the hostile mobs Polis summoned.',
      'kill @e[tag=polis_hostile]',
      'say Polis: hostile mobs cleared.',
    ].join('\n') + '\n' });
  }
  return files;
}
