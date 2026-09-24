// engine/bedrockblocks.js — reading the actual blocks of a Bedrock world.
//
// The heightmap in a chunk record says how high the surface is, but it counts
// the top of anything: a tree reads as ground eight blocks too high, and a
// filter that removes trees removes real detail with them. The blocks
// themselves are in the subchunk records (tag 47), so for the ground a city
// is actually going to be fitted to, they are read properly:
//
//   subchunk record: version, storage count, [y index], then per storage:
//     a header byte  (bits per block << 1 | 1)
//     the indices    packed into 32-bit words, whole values only
//     the palette    a count, then that many little-endian NBT compounds
//
// Reading every subchunk of a whole world would be far too slow, so the map
// still uses the heightmaps and this is done only for the square the city
// will stand on — a hundred chunks or so.

import { tableEntries } from './worldfile.js';

// ---- little-endian NBT, one value at a time -------------------------------
const T = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11 };

function reader(bytes, start = 0) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = start;
  const str = () => {
    const n = dv.getUint16(p, true); p += 2;
    const s = new TextDecoder().decode(bytes.subarray(p, p + n));
    p += n;
    return s;
  };
  const value = (type) => {
    switch (type) {
      case T.BYTE: { const v = dv.getInt8(p); p += 1; return v; }
      case T.SHORT: { const v = dv.getInt16(p, true); p += 2; return v; }
      case T.INT: { const v = dv.getInt32(p, true); p += 4; return v; }
      case T.LONG: { const v = dv.getBigInt64(p, true); p += 8; return v; }
      case T.FLOAT: { const v = dv.getFloat32(p, true); p += 4; return v; }
      case T.DOUBLE: { const v = dv.getFloat64(p, true); p += 8; return v; }
      case T.BYTE_ARRAY: { const n = dv.getInt32(p, true); p += 4; const v = bytes.subarray(p, p + n); p += n; return v; }
      case T.STRING: return str();
      case T.LIST: {
        const et = bytes[p]; p += 1;
        const n = dv.getInt32(p, true); p += 4;
        const out = [];
        for (let i = 0; i < n; i++) out.push(value(et));
        return out;
      }
      case T.COMPOUND: {
        const out = {};
        for (;;) {
          const tt = bytes[p]; p += 1;
          if (tt === T.END) break;
          out[str()] = value(tt);
        }
        return out;
      }
      case T.INT_ARRAY: { const n = dv.getInt32(p, true); p += 4; const v = new Int32Array(n); for (let i = 0; i < n; i++) { v[i] = dv.getInt32(p, true); p += 4; } return v; }
      default: throw new Error('unknown tag ' + type);
    }
  };
  return {
    compound() {
      const tag = bytes[p]; p += 1;
      if (tag !== T.COMPOUND) throw new Error('expected a compound');
      str();
      return value(T.COMPOUND);
    },
    get pos() { return p; },
  };
}

// ---- one subchunk --------------------------------------------------------
// Returns { y, names, indices } — names is the palette, indices has one
// palette index per block, ordered x, then z, then y (Bedrock's order).
export function decodeSubChunk(bytes) {
  if (!bytes || bytes.length < 4) return null;
  let p = 0;
  const version = bytes[p++];
  if (version !== 1 && version !== 8 && version !== 9) return null;
  let storages = 1;
  if (version >= 8) storages = bytes[p++];
  let y = 0;
  if (version === 9) y = (bytes[p++] << 24) >> 24;              // signed
  if (!storages) return null;
  // only the first storage holds the blocks; the second is waterlogging
  const head = bytes[p++];
  const bits = head >> 1;
  if (!bits) return null;
  const perWord = Math.floor(32 / bits);
  const words = Math.ceil(4096 / perWord);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const indices = new Uint16Array(4096);
  const mask = (1 << bits) - 1;
  for (let i = 0, w = 0; w < words; w++) {
    const word = dv.getUint32(p + w * 4, true);
    for (let k = 0; k < perWord && i < 4096; k++, i++) indices[i] = (word >>> (k * bits)) & mask;
  }
  p += words * 4;
  const count = dv.getInt32(p, true); p += 4;
  const rd = reader(bytes, p);
  const names = [];
  for (let i = 0; i < count; i++) {
    let c;
    try { c = rd.compound(); } catch { return null; }
    names.push(c.name || '');
  }
  return { y, names, indices };
}

// what counts as the ground, and what is standing on it
const SKY = /(^|:)(air|cave_air|void_air)$/;
const PLANT = /(leaves|leaf_litter|log|wood|sapling|flower|tulip|rose|dandelion|grass$|tallgrass|double_plant|bamboo|cactus|sugar_cane|reeds|vine|mushroom|snow_layer|deadbush|azalea|moss_carpet|pink_petals|fern|bush|firefly)/;
const LIQUID = /(^|:)(water|flowing_water|lava|flowing_lava)$/;

// ---- a chunk's columns ---------------------------------------------------
// Reads down each column for the first real block: the ground. Water is
// noted where it lies on top of it.
export function chunkGround(subchunks, bottom = -64) {
  const ground = new Int16Array(256).fill(-999);
  const water = new Uint8Array(256);
  const surface = new Array(256).fill('');
  const sorted = subchunks.filter(Boolean).sort((a, b) => b.y - a.y);   // from the sky down
  for (const sc of sorted) {
    const base = sc.y * 16;
    for (let x = 0; x < 16; x++)
      for (let z = 0; z < 16; z++) {
        const col = x * 16 + z;                                 // for the 16x16 output
        if (ground[col] > -900) continue;                       // already found
        for (let y = 15; y >= 0; y--) {
          const name = sc.names[sc.indices[((x * 16) + z) * 16 + y]] || '';
          if (!name || SKY.test(name)) continue;
          if (LIQUID.test(name)) { water[col] = 1; continue; }  // remember it and keep going down
          if (PLANT.test(name)) continue;                       // a tree is not the ground
          ground[col] = base + y;
          surface[col] = name;
          break;
        }
      }
  }
  // the output is indexed z*16+x, like the heightmaps
  const out = new Int16Array(256), wet = new Uint8Array(256), top = new Array(256);
  for (let x = 0; x < 16; x++)
    for (let z = 0; z < 16; z++) {
      out[z * 16 + x] = ground[x * 16 + z];
      wet[z * 16 + x] = water[x * 16 + z];
      top[z * 16 + x] = surface[x * 16 + z];
    }
  return { ground: out, water: wet, surface: top };
}

// ---- the ground under a site ---------------------------------------------
// index: Map of "cx,cz" -> which zip entry that chunk's records live in,
// built while the world was first read.
export function exactGround(zip, index, x0, z0, size) {
  const need = new Map();                                       // entry -> [chunk keys]
  for (let cz = Math.floor(z0 / 16); cz <= Math.floor((z0 + size - 1) / 16); cz++)
    for (let cx = Math.floor(x0 / 16); cx <= Math.floor((x0 + size - 1) / 16); cx++) {
      const key = cx + ',' + cz;
      const entries = index.get(key);
      if (!entries) continue;
      for (const entry of entries) {
        if (!need.has(entry)) need.set(entry, []);
        need.get(entry).push(key);
      }
    }
  const ground = new Int16Array(size * size).fill(-999);
  const water = new Uint8Array(size * size);
  const surface = new Array(size * size).fill('');
  for (const [entryIndex, keys] of need) {
    const wanted = new Set(keys);
    let data;
    try { data = zip.read(zip.entries[entryIndex]); } catch { continue; }
    const perChunk = new Map();
    for (const [key, value] of tableEntries(data)) {
      if (key.length !== 10 || key[8] !== 47) continue;          // a subchunk record
      const dv = new DataView(key.buffer, key.byteOffset, key.byteLength);
      const cx = dv.getInt32(0, true), cz = dv.getInt32(4, true);
      const name = cx + ',' + cz;
      if (!wanted.has(name)) continue;
      const sc = decodeSubChunk(value);
      if (!sc) continue;
      if (!perChunk.has(name)) perChunk.set(name, []);
      perChunk.get(name).push(sc);
    }
    for (const [name, subs] of perChunk) {
      const [cx, cz] = name.split(',').map(Number);
      const g = chunkGround(subs);
      for (let lz = 0; lz < 16; lz++)
        for (let lx = 0; lx < 16; lx++) {
          const wx = cx * 16 + lx, wz = cz * 16 + lz;
          if (wx < x0 || wz < z0 || wx >= x0 + size || wz >= z0 + size) continue;
          const i = (wz - z0) * size + (wx - x0);
          ground[i] = g.ground[lz * 16 + lx];
          water[i] = g.water[lz * 16 + lx];
          surface[i] = g.surface[lz * 16 + lx];
        }
    }
  }
  return { ground, water, surface, size, x0, z0 };
}
