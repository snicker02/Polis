// engine/blockcore.js — sparse voxel store + Bedrock export.
//
// This is a same-API rebuild of the shared block engine: sparse Map with packed
// integer keys, a material-indexed palette, chunk splitting, a little-endian
// NBT writer for .mcstructure, and a zip writer for .mcpack.
// No dependencies. Runs identically in the browser and in node.

export const EMPTY = -1;

// Key packing: x,z in [0,1023], y in [-64,959]  ->  fits in 30 bits.
const KX = 1024, KZ = 1024, YOFF = 64;

export class VoxelWorld {
  constructor(opts = {}) {
    this.budget = opts.budget || 4000000;
    this.cells = new Map();
    this.data = new Map();     // packed key -> block-entity description (beds)
    this.overflow = 0;
    this.minX = Infinity; this.minY = Infinity; this.minZ = Infinity;
    this.maxX = -Infinity; this.maxY = -Infinity; this.maxZ = -Infinity;
  }

  static key(x, y, z) { return ((y + YOFF) * KZ + z) * KX + x; }
  static unkey(k) {
    const x = k % KX; const r = (k - x) / KX;
    const z = r % KZ; const y = (r - z) / KZ - YOFF;
    return [x, y, z];
  }

  inRange(x, y, z) {
    return x >= 0 && x < KX && z >= 0 && z < KZ && y >= -YOFF && y < 960;
  }

  set(x, y, z, id) {
    if (id === EMPTY || id === undefined || id === null) return this.clear(x, y, z);
    if (!this.inRange(x, y, z)) return false;
    const k = ((y + YOFF) * KZ + z) * KX + x;
    if (!this.cells.has(k)) {
      if (this.cells.size >= this.budget) { this.overflow++; return false; }
    }
    if (this.cells.get(k) !== id) this.data.delete(k);   // new block, stale entity data goes
    this.cells.set(k, id);
    if (x < this.minX) this.minX = x; if (x > this.maxX) this.maxX = x;
    if (y < this.minY) this.minY = y; if (y > this.maxY) this.maxY = y;
    if (z < this.minZ) this.minZ = z; if (z > this.maxZ) this.maxZ = z;
    return true;
  }

  get(x, y, z) {
    if (!this.inRange(x, y, z)) return EMPTY;
    const v = this.cells.get(((y + YOFF) * KZ + z) * KX + x);
    return v === undefined ? EMPTY : v;
  }

  has(x, y, z) { return this.get(x, y, z) !== EMPTY; }

  clear(x, y, z) {
    if (!this.inRange(x, y, z)) return false;
    const k = ((y + YOFF) * KZ + z) * KX + x;
    this.data.delete(k);
    return this.cells.delete(k);
  }

  // Block-entity data for a cell: { id: 'Bed', bytes: { color: 14, ... } }.
  // Written into the structure's block_position_data on export.
  setData(x, y, z, d) {
    if (!this.inRange(x, y, z)) return;
    this.data.set(((y + YOFF) * KZ + z) * KX + x, d);
  }
  getData(x, y, z) {
    return this.data.get(((y + YOFF) * KZ + z) * KX + x);
  }

  get size() { return this.cells.size; }

  get box() {
    if (!this.cells.size) return { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, empty: true };
    return {
      x0: this.minX, y0: this.minY, z0: this.minZ,
      x1: this.maxX, y1: this.maxY, z1: this.maxZ, empty: false,
    };
  }

  forEach(cb) {
    for (const [k, id] of this.cells) {
      const x = k % KX; const r = (k - x) / KX;
      const z = r % KZ; const y = (r - z) / KZ - YOFF;
      cb(x, y, z, id);
    }
  }

  // ---- fill helpers -------------------------------------------------------
  box3(x0, y0, z0, x1, y1, z1, id) {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) this.set(x, y, z, id);
  }
  rectXZ(x0, z0, x1, z1, y, id) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, id);
  }
  // Hollow perimeter ring (walls) between y0..y1 inclusive.
  ring(x0, z0, x1, z1, y0, y1, id) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) { this.set(x, y, z0, id); this.set(x, y, z1, id); }
      for (let z = z0 + 1; z <= z1 - 1; z++) { this.set(x0, y, z, id); this.set(x1, y, z, id); }
    }
  }
  column(x, z, y0, y1, id) { for (let y = y0; y <= y1; y++) this.set(x, y, z, id); }
}

// Perimeter cells of a rect, in a stable order, as [x,z,side,i,len].
export function perimeter(x0, z0, x1, z1) {
  const out = [];
  const w = x1 - x0 + 1, d = z1 - z0 + 1;
  for (let i = 0; i < w; i++) { out.push([x0 + i, z0, 'north', i, w]); out.push([x0 + i, z1, 'south', i, w]); }
  for (let i = 1; i < d - 1; i++) { out.push([x0, z0 + i, 'west', i, d]); out.push([x1, z0 + i, 'east', i, d]); }
  return out;
}

// ============================================================================
// Little-endian NBT writer
// ============================================================================

export const TAG = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11 };

class ByteWriter {
  constructor(cap = 1 << 16) {
    this.buf = new ArrayBuffer(cap);
    this.view = new DataView(this.buf);
    this.u8 = new Uint8Array(this.buf);
    this.p = 0;
  }
  need(n) {
    if (this.p + n <= this.buf.byteLength) return;
    let cap = this.buf.byteLength;
    while (cap < this.p + n) cap *= 2;
    const nb = new ArrayBuffer(cap);
    new Uint8Array(nb).set(this.u8.subarray(0, this.p));
    this.buf = nb; this.view = new DataView(nb); this.u8 = new Uint8Array(nb);
  }
  byte(v) { this.need(1); this.view.setInt8(this.p, v); this.p += 1; }
  short(v) { this.need(2); this.view.setInt16(this.p, v, true); this.p += 2; }
  int(v) { this.need(4); this.view.setInt32(this.p, v, true); this.p += 4; }
  float(v) { this.need(4); this.view.setFloat32(this.p, v, true); this.p += 4; }
  double(v) { this.need(8); this.view.setFloat64(this.p, v, true); this.p += 8; }
  long(v) {
    this.need(8);
    const big = BigInt(v);
    this.view.setBigInt64(this.p, big, true); this.p += 8;
  }
  str(s) {
    const bytes = utf8(s);
    this.need(2 + bytes.length);
    this.view.setUint16(this.p, bytes.length, true); this.p += 2;
    this.u8.set(bytes, this.p); this.p += bytes.length;
  }
  ints(arr) {
    this.need(arr.length * 4);
    for (let i = 0; i < arr.length; i++) { this.view.setInt32(this.p, arr[i], true); this.p += 4; }
  }
  done() { return this.u8.slice(0, this.p); }
}

function utf8(s) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  const out = []; for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
  return Uint8Array.from(out);
}

// Tag constructors
export const N = {
  byte: (v) => ({ t: TAG.BYTE, v }),
  short: (v) => ({ t: TAG.SHORT, v }),
  int: (v) => ({ t: TAG.INT, v }),
  float: (v) => ({ t: TAG.FLOAT, v }),
  long: (v) => ({ t: TAG.LONG, v: BigInt(v) }),
  double: (v) => ({ t: TAG.DOUBLE, v }),
  str: (v) => ({ t: TAG.STRING, v }),
  list: (et, items) => ({ t: TAG.LIST, et, v: items }),
  intList: (arr) => ({ t: TAG.LIST, et: TAG.INT, v: arr, typed: true }),
  comp: (obj) => ({ t: TAG.COMPOUND, v: obj }),
};

function writePayload(w, tag) {
  switch (tag.t) {
    case TAG.BYTE: w.byte(tag.v); break;
    case TAG.SHORT: w.short(tag.v); break;
    case TAG.INT: w.int(tag.v); break;
    case TAG.FLOAT: w.float(tag.v); break;
    case TAG.LONG: w.long(tag.v); break;
    case TAG.DOUBLE: w.double(tag.v); break;
    case TAG.STRING: w.str(tag.v); break;
    case TAG.BYTE_ARRAY: { w.int(tag.v.length); for (const b of tag.v) w.byte(b); break; }
    case TAG.INT_ARRAY: { w.int(tag.v.length); w.ints(tag.v); break; }
    case TAG.LIST: {
      // empty lists keep their element type when copied from game data (keepEt)
      w.byte(tag.v.length || tag.keepEt ? tag.et : TAG.END);
      w.int(tag.v.length);
      if (tag.typed) { w.ints(tag.v); }
      else for (const item of tag.v) writePayload(w, item);
      break;
    }
    case TAG.COMPOUND: {
      for (const key of Object.keys(tag.v)) {
        const child = tag.v[key];
        w.byte(child.t); w.str(key); writePayload(w, child);
      }
      w.byte(TAG.END);
      break;
    }
    default: throw new Error('unsupported tag ' + tag.t);
  }
}

export function encodeNbt(rootCompound, rootName = '') {
  const w = new ByteWriter();
  w.byte(TAG.COMPOUND); w.str(rootName);
  writePayload(w, rootCompound);
  return w.done();
}

// ============================================================================
// .mcstructure
// ============================================================================

// Advisory block version stamp written into each palette entry.
// Every palette entry carries the block-state version its name and states
// belong to; Bedrock upgrades older entries on load. All blocks are written in
// 1.21.60 form, checked by tools/validate.js against Bedrock's own state list
// for that version (tools/bedrock-states.json).
export const BLOCK_VERSION = 18168865;       // 1.21.60.33  (0x01153C21)

function stateTag(st) {
  const out = {};
  for (const k of Object.keys(st).sort()) {
    const s = st[k];
    out[k] = s.type === 'byte' ? N.byte(s.value) : s.type === 'int' ? N.int(s.value) : N.str(s.value);
  }
  return N.comp(out);
}

/**
 * Build one .mcstructure from a list of packed cells.
 * keys/ids are parallel typed arrays (see splitWorld).
 */
export function writeMcStructure(keys, ids, box, materials, opts = {}) {
  const sx = box.x1 - box.x0 + 1, sy = box.y1 - box.y0 + 1, sz = box.z1 - box.z0 + 1;
  const n = sx * sy * sz;
  if (n <= 0) throw new Error('empty structure box');
  const palette = [];
  const remap = new Map();
  // One palette entry per distinct block+states: materials that differ only
  // by role (a road and a wall of the same concrete) share an entry.
  const byBlock = new Map();
  const slot = (id) => {
    let p = remap.get(id);
    if (p !== undefined) return p;
    const d = materials.def(id);
    const k = d.block + '|' + Object.keys(d.states).sort().map((s) => `${s}=${d.states[s].type}:${d.states[s].value}`).join(',');
    p = byBlock.get(k);
    if (p === undefined) { p = palette.length; palette.push(id); byBlock.set(k, p); }
    remap.set(id, p);
    return p;
  };
  // Index -1 is "structure void": loading leaves whatever was already there.
  // With airId set, empty cells become real air instead, so loading the
  // structure clears terrain, trees and water out of the whole volume.
  let fill = -1;
  if (opts.airId !== undefined && opts.airId !== null) {
    fill = slot(opts.airId);
  }
  // Entity-only structures still carry one (unused) palette entry, as every
  // structure the game itself saves does. Cells stay structure void.
  if (opts.placeholderId !== undefined && !palette.length) slot(opts.placeholderId);
  const layer0 = new Int32Array(n).fill(fill);
  // With an outline mask, air only fills columns inside the city: land
  // outside an organic outline is left exactly as it was.
  if (fill !== -1 && opts.inside) {
    layer0.fill(-1);
    for (let x = box.x0; x <= box.x1; x++)
      for (let z = box.z0; z <= box.z1; z++) {
        if (!opts.inside(x, z)) continue;
        for (let y = box.y0; y <= box.y1; y++) layer0[((x - box.x0) * sy + (y - box.y0)) * sz + (z - box.z0)] = fill;
      }
  }
  // Generated fill (foundations): opts.fillFn(x, y, z) returns a material id
  // for cells with y < opts.fillBelowY, filled before the world's own cells.
  if (opts.fillFn && opts.fillBelowY !== undefined) {
    const yTop = Math.min(box.y1, opts.fillBelowY - 1);
    for (let x = box.x0; x <= box.x1; x++)
      for (let y = box.y0; y <= yTop; y++)
        for (let z = box.z0; z <= box.z1; z++) {
          const id = opts.fillFn(x, y, z);
          if (id < 0) continue;
          layer0[((x - box.x0) * sy + (y - box.y0)) * sz + (z - box.z0)] = slot(id);
        }
  }

  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const x = k % KX; const r = (k - x) / KX;
    const z = r % KZ; const y = (r - z) / KZ - YOFF;
    layer0[((x - box.x0) * sy + (y - box.y0)) * sz + (z - box.z0)] = slot(ids[i]);
  }
  const layer1 = new Int32Array(n).fill(-1);

  // block entities (bed colours, sign text): keyed by the flattened layer index
  const posData = {};
  let posCount = 0;
  if (opts.blockData && opts.blockData.size) {
    for (let i = 0; i < keys.length; i++) {
      const d = opts.blockData.get(keys[i]);
      if (!d) continue;
      const k = keys[i];
      const x = k % KX; const r = (k - x) / KX;
      const z = r % KZ; const y = (r - z) / KZ - YOFF;
      const idx = ((x - box.x0) * sy + (y - box.y0)) * sz + (z - box.z0);
      const ent = { id: N.str(d.id), isMovable: N.byte(1), x: N.int(x), y: N.int(y), z: N.int(z) };
      for (const [bk, bv] of Object.entries(d.bytes || {})) ent[bk] = N.byte(bv);
      for (const [bk, bv] of Object.entries(d.tags || {})) ent[bk] = bv;      // typed tags (signs)
      posData[String(idx)] = N.comp({ block_entity_data: N.comp(ent) });
      posCount++;
    }
  }

  const palTags = palette.map((mid) => {
    const def = materials.def(mid);
    return N.comp({
      name: N.str(def.block),
      states: stateTag(def.states),
      version: N.int(def.version || BLOCK_VERSION),
    });
  });

  const root = N.comp({
    format_version: N.int(1),
    size: N.intList([sx, sy, sz]),
    structure: N.comp({
      block_indices: N.list(TAG.LIST, [N.intList(layer0), N.intList(layer1)]),
      entities: N.list(TAG.COMPOUND, opts.entities || []),
      palette: N.comp({
        default: N.comp({
          block_palette: N.list(TAG.COMPOUND, palTags),
          block_position_data: N.comp(posData),
        }),
      }),
    }),
    // As in structures saved by the game: the origin is the box's minimum
    // corner, and entity Pos / block-entity x,y,z are in the same coordinates.
    structure_world_origin: N.intList([box.x0, box.y0, box.z0]),
  });

  return { data: encodeNbt(root), size: [sx, sy, sz], paletteSize: palette.length, cells: keys.length,
    entities: posCount, mobs: (opts.entities || []).length };
}

/**
 * Split the world into aligned chunks of `size` x `size` footprint.
 * Returns [{cx, cz, keys, ids, box}] where box is the tight bounding box
 * of that chunk's cells (never larger than size x 384 x size).
 */
export function splitWorld(world, size = 64) {
  const counts = new Map();
  const boxes = new Map();
  world.forEach((x, y, z) => {
    const cx = Math.floor(x / size), cz = Math.floor(z / size);
    const ck = cx * 100000 + cz;
    counts.set(ck, (counts.get(ck) || 0) + 1);
    let b = boxes.get(ck);
    if (!b) { b = { cx, cz, x0: x, y0: y, z0: z, x1: x, y1: y, z1: z }; boxes.set(ck, b); }
    else {
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
      if (z < b.z0) b.z0 = z; if (z > b.z1) b.z1 = z;
    }
  });
  const chunks = new Map();
  for (const [ck, c] of counts) {
    chunks.set(ck, { ...boxes.get(ck), keys: new Int32Array(c), ids: new Int32Array(c), n: 0 });
  }
  for (const [k, id] of world.cells) {
    const x = k % KX; const r = (k - x) / KX;
    const z = r % KZ;
    const ck = Math.floor(x / size) * 100000 + Math.floor(z / size);
    const c = chunks.get(ck);
    c.keys[c.n] = k; c.ids[c.n] = id; c.n++;
  }
  return [...chunks.values()].sort((a, b) => (a.cz - b.cz) || (a.cx - b.cx));
}

// ============================================================================
// zip / .mcpack
// ============================================================================

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function defaultDeflate(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate-raw');
    const stream = new Blob([bytes]).stream().pipeThrough(cs);
    const out = await new Response(stream).arrayBuffer();
    return new Uint8Array(out);
  } catch (e) { return null; }
}

/**
 * files: [{name, data:Uint8Array}]
 * opts.deflateRaw: optional async (Uint8Array) => Uint8Array|null
 */
export async function makeZip(files, opts = {}) {
  const deflate = opts.deflateRaw === undefined ? defaultDeflate : opts.deflateRaw;
  const locals = [];
  const central = [];
  let offset = 0;
  const parts = [];

  for (const f of files) {
    const nameBytes = utf8(f.name);
    const raw = f.data;
    const crc = crc32(raw);
    let comp = null;
    if (deflate && raw.length > 256) comp = await deflate(raw);
    const useDeflate = comp && comp.length < raw.length;
    const payload = useDeflate ? comp : raw;
    const method = useDeflate ? 8 : 0;

    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);      // version needed
    lv.setUint16(6, 0, true);       // flags
    lv.setUint16(8, method, true);
    lv.setUint16(10, 0, true);      // time
    lv.setUint16(12, 0, true);      // date
    lv.setUint32(14, crc, true);
    lv.setUint32(18, payload.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);
    parts.push(lh, payload);
    locals.push({ offset, crc, method, comp: payload.length, raw: raw.length, nameBytes });
    offset += lh.length + payload.length;
  }

  for (const e of locals) {
    const ch = new Uint8Array(46 + e.nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, e.method, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, e.crc, true);
    cv.setUint32(20, e.comp, true);
    cv.setUint32(24, e.raw, true);
    cv.setUint16(28, e.nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, e.offset, true);
    ch.set(e.nameBytes, 46);
    central.push(ch);
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) { parts.push(c); cdSize += c.length; }

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  parts.push(end);

  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function uuid4(rand) {
  if (!rand && typeof globalThis.crypto !== 'undefined' && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  const r = rand || Math.random;
  const hexd = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += hexd[(Math.floor(r() * 16) & 0x3) | 0x8];
    else s += hexd[Math.floor(r() * 16)];
  }
  return s;
}

/**
 * Build a Bedrock behaviour pack (.mcpack) containing the structures.
 * structures: [{name, data}]
 */
export async function buildMcPack(structures, opts = {}) {
  const ns = opts.namespace || 'polis';
  const packName = opts.packName || 'Polis City';
  // Bedrock rejects a pack whose header and module uuids are the same, and a
  // caller-supplied deterministic rand can easily produce two identical ones.
  const headerUuid = uuid4(opts.rand);
  let moduleUuid = uuid4(opts.rand);
  if (moduleUuid === headerUuid) {
    const hexd = '0123456789abcdef';
    const last = headerUuid[35];
    moduleUuid = moduleUuid.slice(0, 35) + hexd[(hexd.indexOf(last) + 1) % 16];
  }
  const manifest = {
    format_version: 2,
    header: {
      name: packName,
      description: opts.description || 'Generated by Polis',
      uuid: headerUuid,
      version: [1, 0, 0],
      min_engine_version: [1, 21, 0],
    },
    modules: [
      { type: 'data', uuid: moduleUuid, version: [1, 0, 0] },
    ],
  };
  const files = [
    { name: 'manifest.json', data: utf8(JSON.stringify(manifest, null, 2)) },
  ];
  if (opts.guide) files.push({ name: 'placement-guide.txt', data: utf8(opts.guide) });
  for (const f of opts.files || []) {
    files.push({ name: f.name, data: typeof f.data === 'string' ? utf8(f.data) : f.data });
  }
  for (const s of structures) {
    files.push({ name: `structures/${ns}/${s.name}.mcstructure`, data: s.data });
  }
  return makeZip(files, opts);
}
