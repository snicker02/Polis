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

import { MATERIALS } from './materials.js';
import { toJava, javaSignText } from './java-blocks.js';
import { javaEntity, javaEntityPos } from './java-entities.js';

// ---- big-endian NBT ------------------------------------------------------
const T = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11 };

class Writer {
  constructor() { this.parts = []; this.len = 0; }
  bytes(b) { this.parts.push(b); this.len += b.length; }
  u8(v) { this.bytes(Uint8Array.of(v & 0xff)); }
  i16(v) { this.bytes(Uint8Array.of((v >> 8) & 0xff, v & 0xff)); }
  i32(v) { this.bytes(Uint8Array.of((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff)); }
  str(s) {
    const b = new TextEncoder().encode(s);
    this.i16(b.length);
    this.bytes(b);
  }
  finish() {
    const out = new Uint8Array(this.len);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
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
    case T.FLOAT: { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, payload, false); w.bytes(b); break; }
    case T.DOUBLE: { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, payload, false); w.bytes(b); break; }
    case T.STRING: w.str(payload); break;
    case T.LIST:
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
  const blocks = [];
  for (const [x, y, z, id, data] of cells) {
    const def = MATERIALS.def(id);
    if (!def) continue;
    const { name, props } = toJava(def.block, def.states, data && data.bytes ? data.bytes : {});
    const key = name + '|' + Object.entries(props).sort().map(([k, v]) => k + '=' + v).join(',');
    let index = paletteIndex.get(key);
    if (index === undefined) {
      index = palette.length;
      paletteIndex.set(key, index);
      const entry = { Name: J.str(name) };
      if (Object.keys(props).length) entry.Properties = J.comp(Object.fromEntries(Object.entries(props).map(([k, v]) => [k, J.str(String(v))])));
      palette.push(J.comp(entry));
    }
    const be = javaBlockEntity(name, data);
    const block = {
      state: J.int(index),
      pos: J.list(T.INT, [x - box.x0, y - box.y0, z - box.z0]),
    };
    if (be) block.nbt = be;
    blocks.push(J.comp(block));
  }
  const size = [box.x1 - box.x0 + 1, box.y1 - box.y0 + 1, box.z1 - box.z0 + 1];
  const root = J.comp({
    DataVersion: J.int(opts.dataVersion || 3953),        // 1.21.1
    size: J.list(T.INT, size),
    palette: J.list(T.COMPOUND, palette.map((p) => p[1])),
    blocks: J.list(T.COMPOUND, blocks.map((b) => b[1])),
    entities: J.list(T.COMPOUND, javaEntities(opts.spawns, box).map((e) => e[1])),
  });
  return { nbt: encodeJavaNbt(root), size, palette: palette.length, blocks: blocks.length };
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
  const ground = [];
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
        for (let y = bottom - depth; y < bottom; y++) if (!world.has(x, y, z)) ground.push([x, y, z]);
      }
  }
  const AIR = MATERIALS.add(null, 'minecraft:air', '#000000', {}, { passable: true, transparent: true });
  const FILL = MATERIALS.add(null, 'minecraft:stone', '#7d7d7d');
  for (const [x, y, z, id] of air.map((c) => [...c, AIR]).concat(ground.map((c) => [...c, FILL]))) {
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
  }
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
        description: `Polis — ${opts.description || 'a procedural city'}`,
        pack_format: opts.packFormat || 48,
        supported_formats: { min_inclusive: 26, max_inclusive: 81 },
      },
    }, null, 2),
  });
  for (const s of structures) files.push({ name: `data/${ns}/structure/${s.name}.nbt`, data: s.nbt });
  // one function places every piece, each at its own offset from the player
  const lines = [
    '# Polis — stand where you want the north-west corner and run this',
    `say Polis: placing ${structures.length} pieces...`,
    ...structures.map((s) => `place template ${ns}:${s.name} ~${s.offset[0]} ~${s.offset[1]} ~${s.offset[2]}`),
    'say Polis: done.',
  ];
  files.push({ name: `data/${ns}/function/build.mcfunction`, text: lines.join('\n') + '\n' });
  return files;
}
