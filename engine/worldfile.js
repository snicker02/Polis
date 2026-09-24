// engine/worldfile.js — reading a Minecraft Bedrock world.
//
// A .mcworld is a zip. Inside it, db/*.ldb are LevelDB tables holding one
// record per chunk. The record we want is tag 43 ("Data3D", 1.18 and later):
// 512 bytes of heightmap (16x16 uint16, the height of the world surface
// measured from the bottom of the world at y = -64), followed by one palette
// section of biomes per 16 blocks of height.
//
// Everything here is synchronous and dependency-free so it runs in the
// browser: the zip and the LevelDB blocks are both DEFLATE, which inflate.js
// decompresses.

import { inflateRaw, inflate } from './inflate.js';

export const WORLD_BOTTOM = -64;

// ---- zip ---------------------------------------------------------------
export function readZipEntries(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // end-of-central-directory record, scanning back from the end
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    // the local header tells us where the data actually starts
    const lNameLen = dv.getUint16(local + 26, true), lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    entries.push({ name, method, start, compSize, size });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, read: (e) => (e.method === 0 ? bytes.subarray(e.start, e.start + e.size) : inflateRaw(bytes.subarray(e.start, e.start + e.compSize), e.size)) };
}

// ---- LevelDB tables ------------------------------------------------------
const MAGIC_LO = 0x8b80fb57, MAGIC_HI = 0xdb477524;

function varint(buf, i) {
  let x = 0, shift = 0;
  for (;;) { const b = buf[i++]; x |= (b & 0x7f) << shift; if (!(b & 0x80)) break; shift += 7; }
  return [x >>> 0, i];
}

function unpackBlock(buf, dv, offset, size) {
  const raw = buf.subarray(offset, offset + size);
  const type = buf[offset + size];                    // then a 4-byte checksum
  if (type === 0) return raw;
  if (type === 2) return inflate(raw);
  if (type === 4) return inflateRaw(raw);
  return null;                                        // 1 = snappy: not used by Bedrock
}

function* blockEntries(block) {
  if (block.length < 4) return;
  const dv = new DataView(block.buffer, block.byteOffset, block.byteLength);
  const restarts = dv.getUint32(block.length - 4, true);
  const end = block.length - 4 - restarts * 4;
  let i = 0, key = new Uint8Array(0);
  while (i < end) {
    let shared, nonShared, valLen;
    [shared, i] = varint(block, i);
    [nonShared, i] = varint(block, i);
    [valLen, i] = varint(block, i);
    const next = new Uint8Array(shared + nonShared);
    next.set(key.subarray(0, shared));
    next.set(block.subarray(i, i + nonShared), shared);
    i += nonShared;
    key = next;
    yield [key, block.subarray(i, i + valLen)];
    i += valLen;
  }
}

// every key/value in one .ldb table, with the internal-key suffix stripped
export function* tableEntries(bytes) {
  if (bytes.length < 48) return;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const f = bytes.length - 48;
  if (dv.getUint32(f + 40, true) !== MAGIC_LO || dv.getUint32(f + 44, true) !== MAGIC_HI) return;
  let i = f, mOff, mSize, iOff, iSize;
  [mOff, i] = varint(bytes, i); [mSize, i] = varint(bytes, i);
  [iOff, i] = varint(bytes, i); [iSize, i] = varint(bytes, i);
  const index = unpackBlock(bytes, dv, iOff, iSize);
  if (!index) return;
  for (const [, handle] of blockEntries(index)) {
    let j = 0, off, size;
    [off, j] = varint(handle, j); [size, j] = varint(handle, j);
    let block;
    try { block = unpackBlock(bytes, dv, off, size); } catch { continue; }
    if (!block) continue;
    for (const [ikey, value] of blockEntries(block)) {
      if (ikey.length < 8) continue;
      yield [ikey.subarray(0, ikey.length - 8), value];
    }
  }
}

// ---- chunks --------------------------------------------------------------
const CHUNK_KEY = 9, DATA3D = 43;

function biomeSections(v) {
  let i = 512;
  const dv = new DataView(v.buffer, v.byteOffset, v.byteLength);
  const out = [];
  let prev = null;
  while (i < v.length && out.length < 24) {
    const head = v[i++];
    if (head === 0xff) { out.push(prev); continue; }
    const bitsPer = head >> 1;
    if (bitsPer === 0) { prev = [dv.getInt32(i, true)]; i += 4; out.push(prev); continue; }
    const perWord = Math.floor(32 / bitsPer);
    i += Math.ceil(4096 / perWord) * 4;
    const count = dv.getInt32(i, true); i += 4;
    const pal = [];
    for (let p = 0; p < count; p++) { pal.push(dv.getInt32(i, true)); i += 4; }
    prev = pal;
    out.push(pal);
  }
  return out;
}

// Read the surface heights (and the biome at the surface) of every chunk in
// the world, optionally only those near a point, which is much faster.
export function readWorld(bytes, opts = {}) {
  const zip = readZipEntries(bytes);
  const tables = zip.entries.filter((e) => /(^|\/)db\/.*\.ldb$/.test(e.name));
  const near = opts.near, radius = opts.radiusChunks || Infinity;
  const chunks = new Map();
  let biomeOf = new Map();
  // which table each chunk's records live in, so the blocks of a chosen site
  // can be read later without going through the whole world again
  const index = new Map();
  for (const e of tables) {
    const entryIndex = zip.entries.indexOf(e);
    let data;
    try { data = zip.read(e); } catch { continue; }
    for (const [key, value] of tableEntries(data)) {
      if (key.length === 9 || key.length === 10) {
        const kv = new DataView(key.buffer, key.byteOffset, key.byteLength);
        const k = kv.getInt32(0, true) + ',' + kv.getInt32(4, true);
        let list = index.get(k);
        if (!list) { list = new Set(); index.set(k, list); }
        list.add(entryIndex);
      }
      if (key.length !== CHUNK_KEY || key[8] !== DATA3D || value.length < 512) continue;
      const dv = new DataView(key.buffer, key.byteOffset, key.byteLength);
      const cx = dv.getInt32(0, true), cz = dv.getInt32(4, true);
      if (near && (Math.abs(cx - near[0]) > radius || Math.abs(cz - near[1]) > radius)) continue;
      const hv = new DataView(value.buffer, value.byteOffset, value.byteLength);
      const heights = new Int16Array(256);
      for (let i = 0; i < 256; i++) heights[i] = hv.getUint16(i * 2, true) + WORLD_BOTTOM;
      chunks.set(cx + ',' + cz, heights);
      if (opts.biomes) {
        const secs = biomeSections(value).filter(Boolean);
        const mid = secs[Math.min(secs.length - 1, 8)] || [0];
        biomeOf.set(cx + ',' + cz, mid[0]);
      }
    }
  }
  return { chunks, biomes: biomeOf, zip, index };
}

// The world's name, spawn and seed, from level.dat (an 8-byte header, then
// little-endian NBT). decodeNbt is passed in so this file stays dependency-free.
export function readLevelDat(bytes, decodeNbt) {
  const zip = readZipEntries(bytes);
  const e = zip.entries.find((x) => /(^|\/)level\.dat$/.test(x.name));
  if (!e) return null;
  const { root } = decodeNbt(zip.read(e).subarray(8));
  return { name: root.LevelName, spawn: [root.SpawnX, root.SpawnY, root.SpawnZ], seed: String(root.RandomSeed ?? '') };
}

// ---- the ground under a city -------------------------------------------
// Heights for a square of blocks, and what share of it is water (anything at
// or below sea level, y 62).
export const SEA_LEVEL = 62;
export function heightField(chunks, x0, z0, size) {
  const h = new Int16Array(size * size);
  let known = 0, water = 0;
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      const wx = x0 + x, wz = z0 + z;
      const c = chunks.get(Math.floor(wx / 16) + ',' + Math.floor(wz / 16));
      if (!c) { h[z * size + x] = -999; continue; }
      const y = c[(((wz % 16) + 16) % 16) * 16 + (((wx % 16) + 16) % 16)];
      h[z * size + x] = y;
      known++;
      if (y <= SEA_LEVEL) water++;
    }
  return { h, size, x0, z0, known, water, coverage: known / (size * size), waterShare: known ? water / known : 0 };
}

// The heightmap counts the highest block of anything, so a forest reads as
// rough ground. A median over a small window removes trees (a minority of
// columns, several blocks tall) and leaves the ground.
export function groundField(field, window = 2) {
  const { h, size } = field;
  const g = new Int16Array(size * size);
  const buf = [];
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      buf.length = 0;
      for (let dz = -window; dz <= window; dz++)
        for (let dx = -window; dx <= window; dx++) {
          const nx = x + dx, nz = z + dz;
          if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
          const y = h[nz * size + nx];
          if (y > -900) buf.push(y);
        }
      if (!buf.length) { g[z * size + x] = -999; continue; }
      buf.sort((a, b) => a - b);
      g[z * size + x] = buf[Math.floor(buf.length / 2)];      // the median: trees drop out
    }
  return { ...field, h: g, raw: h };
}

// What a city built here would sit on: the base level is the median of the
// dry ground (water and the odd cave mouth left out), which is the level the
// streets take, with the blocks terracing up from it.
export function siteGround(chunks, x, z, size, opts = {}) {
  const field = groundField(heightField(chunks, x, z, size));
  // With the real blocks to hand (Bedrock worlds, read on demand), the ground
  // is what is actually there rather than a heightmap with the trees filtered
  // off it — which keeps the small rises and hollows the filter smooths away.
  const exact = opts.exact && opts.exact.size === size ? opts.exact : null;
  const ground = exact ? Int16Array.from(exact.ground) : field.h;
  const water = new Uint8Array(size * size);
  if (exact) for (let i = 0; i < water.length; i++) if (exact.water[i]) water[i] = 1;
  const dry = [];
  for (let i = 0; i < ground.length; i++) {
    const y = ground[i];
    if (y < -900) continue;
    // without the blocks, water is judged by height; with them, it is known
    if (exact ? water[i] : y <= SEA_LEVEL) { water[i] = 1; continue; }
    dry.push(y);
  }
  dry.sort((a, b) => a - b);
  const median = dry.length ? dry[Math.floor(dry.length / 2)] : SEA_LEVEL + 1;
  const baseY = opts.baseY !== undefined ? opts.baseY : median;
  let buildable = 0;
  for (let i = 0; i < ground.length; i++) {
    const y = ground[i];
    if (y < -900 || water[i]) continue;
    const rise = y - baseY;
    if (rise >= -(opts.cut ?? 6) && rise <= (opts.fill ?? 10)) buildable++;
  }
  return { ground, raw: field.raw || field.h, water, baseY, size, x0: x, z0: z, exact: !!exact,
    surface: exact ? exact.surface : null,
    coverage: field.coverage, waterShare: field.waterShare,
    buildableShare: buildable / (size * size),
    p05: dry.length ? dry[Math.floor(dry.length * 0.05)] : baseY,
    p95: dry.length ? dry[Math.floor(dry.length * 0.95)] : baseY };
}

// Rank places to put a city: flat, dry enough, fully explored.
export function findSites(chunks, size, opts = {}) {
  const step = opts.step || 16;
  const cells = [...chunks.keys()].map((k) => k.split(',').map(Number));
  if (!cells.length) return [];
  const xs = cells.map((c) => c[0]), zs = cells.map((c) => c[1]);
  const near = opts.near;
  const range = opts.rangeChunks || 160;
  const x0 = near ? (near[0] - range) * 16 : Math.min(...xs) * 16;
  const x1 = near ? (near[0] + range) * 16 : Math.max(...xs) * 16;
  const z0 = near ? (near[1] - range) * 16 : Math.min(...zs) * 16;
  const z1 = near ? (near[1] + range) * 16 : Math.max(...zs) * 16;
  const out = [];
  for (let z = z0; z + size <= z1; z += step)
    for (let x = x0; x + size <= x1; x += step) {
      const f = groundField(heightField(chunks, x, z, size));
      if (f.coverage < 0.999) continue;
      let sum = 0, min = 9999, max = -9999;
      for (const y of f.h) { sum += y; min = Math.min(min, y); max = Math.max(max, y); }
      const mean = sum / f.h.length;
      let rough = 0;
      for (let i = 0; i < f.h.length; i++) rough += Math.abs(f.h[i] - mean);
      out.push({ x, z, mean: Math.round(mean), min, max, spread: max - min,
        rough: rough / f.h.length, water: f.waterShare });
    }
  return out;
}
