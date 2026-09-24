// engine/javaworld.js — reading a Java Edition world.
//
// Java stores chunks in Anvil region files: world/region/r.<x>.<z>.mca, each
// holding up to 1024 chunks in a 32x32 block of the world. The file starts
// with an 8 KiB header — 1024 entries of "where the chunk is and how many
// 4 KiB sectors it takes", then 1024 timestamps — and each chunk is a length,
// a compression byte and then NBT, big-endian, usually zlib.
//
// What Polis wants from it is the same thing it takes from a Bedrock world:
// the height of the ground in every column, and the biome. Java keeps the
// first in Heightmaps.WORLD_SURFACE, packed nine bits at a time into longs.
//
// Everything here is synchronous and dependency-free, like the Bedrock
// reader: inflate.js does the decompression.

import { inflate, inflateRaw } from './inflate.js';
import { readZipEntries } from './worldfile.js';

export const JAVA_BOTTOM = -64;

// ---- gzip ---------------------------------------------------------------
// level.dat is gzipped; a chunk may be. The header is ten bytes, with a few
// optional fields after it.
export function gunzip(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error('not gzip data');
  const flags = bytes[3];
  let i = 10;
  if (flags & 4) { i += 2 + (bytes[i] | (bytes[i + 1] << 8)); }       // extra
  if (flags & 8) { while (bytes[i]) i++; i++; }                       // file name
  if (flags & 16) { while (bytes[i]) i++; i++; }                      // comment
  if (flags & 2) i += 2;                                              // header CRC
  return inflateRaw(bytes.subarray(i));
}

// ---- big-endian NBT ------------------------------------------------------
const T = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12 };

export function readJavaNbt(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const str = () => {
    const n = dv.getUint16(p, false); p += 2;
    const s = new TextDecoder().decode(bytes.subarray(p, p + n));
    p += n;
    return s;
  };
  const value = (type) => {
    switch (type) {
      case T.BYTE: { const v = dv.getInt8(p); p += 1; return v; }
      case T.SHORT: { const v = dv.getInt16(p, false); p += 2; return v; }
      case T.INT: { const v = dv.getInt32(p, false); p += 4; return v; }
      case T.LONG: { const v = dv.getBigInt64(p, false); p += 8; return v; }
      case T.FLOAT: { const v = dv.getFloat32(p, false); p += 4; return v; }
      case T.DOUBLE: { const v = dv.getFloat64(p, false); p += 8; return v; }
      case T.BYTE_ARRAY: { const n = dv.getInt32(p, false); p += 4; const v = bytes.subarray(p, p + n); p += n; return v; }
      case T.STRING: return str();
      case T.LIST: {
        const et = bytes[p]; p += 1;
        const n = dv.getInt32(p, false); p += 4;
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
      case T.INT_ARRAY: { const n = dv.getInt32(p, false); p += 4; const v = new Int32Array(n); for (let i = 0; i < n; i++) { v[i] = dv.getInt32(p, false); p += 4; } return v; }
      case T.LONG_ARRAY: { const n = dv.getInt32(p, false); p += 4; const v = new BigInt64Array(n); for (let i = 0; i < n; i++) { v[i] = dv.getBigInt64(p, false); p += 8; } return v; }
      default: throw new Error('unknown NBT tag ' + type);
    }
  };
  const tag = bytes[p]; p += 1;
  if (tag !== T.COMPOUND) throw new Error('NBT does not start with a compound');
  str();                                                   // the root's name
  return value(T.COMPOUND);
}

// ---- Anvil region files --------------------------------------------------
// Yields the NBT of every chunk in one .mca file.
export function* regionChunks(bytes) {
  if (bytes.length < 8192) return;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < 1024; i++) {
    const entry = dv.getUint32(i * 4, false);
    const offset = entry >>> 8, sectors = entry & 0xff;
    if (!offset || !sectors) continue;                     // that chunk was never saved
    const start = offset * 4096;
    if (start + 5 > bytes.length) continue;
    const length = dv.getUint32(start, false);
    const compression = bytes[start + 4];
    const data = bytes.subarray(start + 5, start + 4 + length);
    let raw;
    try {
      raw = compression === 1 ? gunzip(data) : compression === 2 ? inflate(data) : compression === 3 ? data : null;
    } catch { continue; }
    if (!raw) continue;                                    // 4 is LZ4, which Polis does not read
    try { yield readJavaNbt(raw); } catch { /* a chunk we cannot read is skipped */ }
  }
}

// ---- heights -------------------------------------------------------------
// Heightmaps are packed: as many values as fit whole into each 64-bit long,
// lowest bits first, with no value split across two longs.
export function unpackHeightmap(longs, bits = 9) {
  const out = new Int16Array(256);
  if (!longs || !longs.length) return out;
  const perLong = Math.floor(64 / bits);
  const mask = (1n << BigInt(bits)) - 1n;
  for (let i = 0; i < 256; i++) {
    const li = Math.floor(i / perLong);
    if (li >= longs.length) break;
    const shift = BigInt((i % perLong) * bits);
    out[i] = Number((BigInt.asUintN(64, longs[li]) >> shift) & mask);
  }
  return out;
}

// The height of the ground in a chunk's 16x16 columns, in world coordinates.
export function chunkHeights(chunk) {
  const maps = chunk.Heightmaps || {};
  const packed = maps.WORLD_SURFACE || maps.MOTION_BLOCKING || null;
  if (!packed) return null;
  const raw = unpackHeightmap(packed);
  const out = new Int16Array(256);
  // the map holds the height above the bottom of the world of the space just
  // above the surface, so the surface itself is one lower
  for (let i = 0; i < 256; i++) out[i] = raw[i] + JAVA_BOTTOM - 1;
  return out;
}

// ---- the world -----------------------------------------------------------
// Takes a zipped Java world folder (region/*.mca inside, at any depth) and
// returns the same shape the Bedrock reader does, so everything downstream —
// site picking, terrain fitting — works unchanged.
export function readJavaWorld(bytes, opts = {}) {
  const zip = readZipEntries(bytes);
  const regions = zip.entries.filter((e) => /(^|\/)region\/r\.-?\d+\.-?\d+\.mca$/.test(e.name));
  const chunks = new Map();
  const biomes = new Map();
  for (const entry of regions) {
    let data;
    try { data = zip.read(entry); } catch { continue; }
    for (const chunk of regionChunks(data)) {
      const cx = chunk.xPos, cz = chunk.zPos;
      if (cx === undefined || cz === undefined) continue;
      if (opts.near && opts.radiusChunks !== undefined &&
        (Math.abs(cx - opts.near[0]) > opts.radiusChunks || Math.abs(cz - opts.near[1]) > opts.radiusChunks)) continue;
      const heights = chunkHeights(chunk);
      if (!heights) continue;
      chunks.set(cx + ',' + cz, heights);
      if (opts.biomes) {
        const sections = chunk.sections || [];
        const mid = sections[Math.floor(sections.length / 2)];
        const pal = mid && mid.biomes && mid.biomes.palette;
        if (pal && pal.length) biomes.set(cx + ',' + cz, pal[0]);
      }
    }
  }
  return { chunks, biomes, regions: regions.length };
}

// name, spawn and seed, from a Java level.dat (gzipped NBT)
export function readJavaLevelDat(bytes) {
  const zip = readZipEntries(bytes);
  const e = zip.entries.find((x) => /(^|\/)level\.dat$/.test(x.name));
  if (!e) return null;
  let nbt;
  try { nbt = readJavaNbt(gunzip(zip.read(e))); } catch { return null; }
  const d = nbt.Data || nbt;
  return {
    name: d.LevelName,
    spawn: [d.SpawnX || 0, d.SpawnY || 64, d.SpawnZ || 0],
    seed: String((d.WorldGenSettings && d.WorldGenSettings.seed) ?? d.RandomSeed ?? ''),
  };
}

// Is this zip a Java world or a Bedrock one?
export function worldKind(bytes) {
  const zip = readZipEntries(bytes);
  if (zip.entries.some((e) => /(^|\/)region\/r\.-?\d+\.-?\d+\.mca$/.test(e.name))) return 'java';
  if (zip.entries.some((e) => /(^|\/)db\/.*\.ldb$/.test(e.name))) return 'bedrock';
  return null;
}
