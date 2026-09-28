// tools/make-bedrock-world.mjs — write Bedrock worlds from scratch, for checks.
//
// A LevelDB table writer, a write-ahead log writer (32 KB blocks, CRC32C,
// fragmented records), a stored zip writer and the chunk records Polis reads.
// Written independently of engine/worldfile.js so the reader is tested
// against a separate implementation of the format.
import zlib from 'node:zlib';

// ---- writers (independent of the reader under test) -----------------------
export const u8 = (a) => new Uint8Array(a);
export function cat(parts) {
  let n = 0; for (const p of parts) n += p.length;
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export function varint(n) { const b = []; while (n > 127) { b.push((n & 127) | 128); n >>>= 7; } b.push(n); return u8(b); }
export function u32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; }
export function u64(n) { const b = new Uint8Array(8); const dv = new DataView(b.buffer); dv.setUint32(0, n % 4294967296, true); dv.setUint32(4, Math.floor(n / 4294967296), true); return b; }
export function chunkKey(cx, cz, tag, y) {
  const b = new Uint8Array(y === undefined ? 9 : 10); const dv = new DataView(b.buffer);
  dv.setInt32(0, cx, true); dv.setInt32(4, cz, true); b[8] = tag; if (y !== undefined) dv.setInt8(9, y);
  return b;
}
export function data3d(height) {                         // 512-byte heightmap + one uniform biome section
  const b = new Uint8Array(512 + 5); const dv = new DataView(b.buffer);
  for (let i = 0; i < 256; i++) dv.setUint16(i * 2, height + 64, true);
  b[512] = 1; dv.setInt32(513, 1, true);           // bitsPer 0 (head 1): one biome id
  return b;
}
export function subchunk(y, top) {                       // stone up to local height `top`, air above
  const bits = 1, words = 128, idx = new Uint8Array(4096);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let yy = 0; yy <= top; yy++) idx[((x * 16) + z) * 16 + yy] = 1;
  const w = new Uint8Array(words * 4); const dv = new DataView(w.buffer);
  for (let i = 0; i < words; i++) { let word = 0; for (let k = 0; k < 32; k++) word |= (idx[i * 32 + k] & 1) << k; dv.setUint32(i * 4, word >>> 0, true); }
  const enc = new TextEncoder();
  const nbt = (name) => { const n = enc.encode(name), k = enc.encode('name'); return u8([10, 0, 0, 8, k.length, 0, ...k, n.length, 0, ...n, 0]); };
  return cat([u8([9, 1, y & 0xff, (bits << 1) | 1]), w, u32(2), nbt('minecraft:air'), nbt('minecraft:stone')]);
}
export const cmp = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };

// records: [key, value|null, seq]; compression 0, 2 (zlib) or 4 (raw deflate)
export function writeTable(records, compression, perBlock = 16) {
  const rs = records.slice().sort((a, b) => cmp(a[0], b[0]) || b[2] - a[2]);
  const parts = []; let off = 0; const index = [];
  const block = (entries) => {
    const body = [];
    for (const [k, v] of entries) body.push(varint(0), varint(k.length), varint(v.length), k, v);
    body.push(u32(0), u32(1));                     // one restart at 0
    return cat(body);
  };
  const put = (raw, type) => {
    const data = type === 2 ? zlib.deflateSync(raw) : type === 4 ? zlib.deflateRawSync(raw) : raw;
    const handle = { off, size: data.length };
    parts.push(data, u8([type, 0, 0, 0, 0])); off += data.length + 5;
    return handle;
  };
  for (let i = 0; i < rs.length; i += perBlock) {
    const entries = rs.slice(i, i + perBlock).map(([k, v, seq]) => {
      const type = v ? 1 : 0;
      const tail = new Uint8Array(8); const dv = new DataView(tail.buffer);
      const packed = seq * 256 + type;
      dv.setUint32(0, packed % 4294967296, true); dv.setUint32(4, Math.floor(packed / 4294967296), true);
      return [cat([k, tail]), v || new Uint8Array(0)];
    });
    const h = put(block(entries), compression);
    index.push([entries[entries.length - 1][0], cat([varint(h.off), varint(h.size)])]);
  }
  const meta = put(block([]), 0);
  const idx = put(block(index), compression);
  const footer = new Uint8Array(48);
  footer.set(cat([varint(meta.off), varint(meta.size), varint(idx.off), varint(idx.size)]));
  const fdv = new DataView(footer.buffer); fdv.setUint32(40, 0x8b80fb57, true); fdv.setUint32(44, 0xdb477524, true);
  return cat([...parts, footer]);
}

let T = null;
export function crc32c(buf) {
  if (!T) { T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0x82f63b78 : c >>> 1; T[n] = c >>> 0; } }
  let c = 0xffffffff; for (const b of buf) c = T[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}
export const mask = (c) => ((((c >>> 15) | (c << 17)) >>> 0) + 0xa282ead8) >>> 0;

// batches: [{ seq, ops: [key, value|null][] }]; corrupt: index of a batch whose CRC is broken
export function writeLog(batches, { corrupt = -1 } = {}) {
  const out = []; let pos = 0; const BLOCK = 32768;
  batches.forEach((b, bi) => {
    const recs = [u64(b.seq), u32(b.ops.length)];
    for (const [k, v] of b.ops) recs.push(v ? cat([u8([1]), varint(k.length), k, varint(v.length), v]) : cat([u8([0]), varint(k.length), k]));
    let left = cat(recs), begin = true;
    while (true) {
      const room = BLOCK - (pos % BLOCK);
      if (room < 7) { out.push(new Uint8Array(room)); pos += room; continue; }
      const n = Math.min(room - 7, left.length), end = n === left.length;
      const type = begin && end ? 1 : begin ? 2 : end ? 4 : 3;
      const frag = left.subarray(0, n);
      let crc = mask(crc32c(cat([u8([type]), frag])));
      if (bi === corrupt) crc ^= 1;
      out.push(u32(crc), u8([n & 0xff, n >> 8, type]), frag); pos += 7 + n;
      left = left.subarray(n); begin = false;
      if (end) break;
    }
  });
  return cat(out);
}

export function writeZip(files) {                        // stored entries
  const enc = new TextEncoder(), locals = [], central = []; let off = 0;
  for (const [name, data] of files) {
    const n = enc.encode(name), crc = zlib.crc32(data);
    const lh = new Uint8Array(30); const l = new DataView(lh.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true); l.setUint32(22, data.length, true); l.setUint16(26, n.length, true);
    locals.push(lh, n, data);
    const ch = new Uint8Array(46); const c = new DataView(ch.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, n.length, true); c.setUint32(42, off, true);
    central.push(ch, n);
    off += 30 + n.length + data.length;
  }
  const cd = cat(central);
  const e = new Uint8Array(22); const d = new DataView(e.buffer);
  d.setUint32(0, 0x06054b50, true); d.setUint16(8, files.length, true); d.setUint16(10, files.length, true);
  d.setUint32(12, cd.length, true); d.setUint32(16, off, true);
  return cat([...locals, cd, e]);
}


// a small world: Data3D heightmaps (and a subchunk each) over a square of
// chunks, as one table; enough for the app to load, map and pick a site
export function makeBedrockWorld({ cx0 = -16, cz0 = -16, cx1 = 15, cz1 = 15, height = 70 } = {}) {
  const recs = []; let seq = 1;
  for (let cx = cx0; cx <= cx1; cx++)
    for (let cz = cz0; cz <= cz1; cz++) {
      recs.push([chunkKey(cx, cz, 43), data3d(height), seq++]);
      recs.push([chunkKey(cx, cz, 47, 4), subchunk(4, height - 64 - 1), seq++]);
    }
  return writeZip([['db/000001.ldb', writeTable(recs, 4, 64)], ['db/CURRENT', new TextEncoder().encode('MANIFEST-000002\n')]]);
}
