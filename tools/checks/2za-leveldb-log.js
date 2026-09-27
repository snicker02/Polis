// tools/checks/2za-leveldb-log.js — reading a Bedrock world's LevelDB the whole way.
//
// Bedrock keeps recent writes (freshly generated chunks especially) in the
// LevelDB write-ahead log, db/*.log, not only in the sorted tables, db/*.ldb.
// This builds a small world zip from scratch, with a real table writer and a
// real log writer (32 KB blocks, CRC32C, fragmented records), and checks that
// every chunk is found and that the newest record of each key wins.
import zlib from 'node:zlib';

export const id = '2za';
export const label = '2za. LevelDB tables + write-ahead log';

// ---- writers (independent of the reader under test) -----------------------
const u8 = (a) => new Uint8Array(a);
function cat(parts) {
  let n = 0; for (const p of parts) n += p.length;
  const out = new Uint8Array(n); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function varint(n) { const b = []; while (n > 127) { b.push((n & 127) | 128); n >>>= 7; } b.push(n); return u8(b); }
function u32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; }
function u64(n) { const b = new Uint8Array(8); const dv = new DataView(b.buffer); dv.setUint32(0, n % 4294967296, true); dv.setUint32(4, Math.floor(n / 4294967296), true); return b; }
function chunkKey(cx, cz, tag, y) {
  const b = new Uint8Array(y === undefined ? 9 : 10); const dv = new DataView(b.buffer);
  dv.setInt32(0, cx, true); dv.setInt32(4, cz, true); b[8] = tag; if (y !== undefined) dv.setInt8(9, y);
  return b;
}
function data3d(height) {                         // 512-byte heightmap + one uniform biome section
  const b = new Uint8Array(512 + 5); const dv = new DataView(b.buffer);
  for (let i = 0; i < 256; i++) dv.setUint16(i * 2, height + 64, true);
  b[512] = 1; dv.setInt32(513, 1, true);           // bitsPer 0 (head 1): one biome id
  return b;
}
function subchunk(y, top) {                       // stone up to local height `top`, air above
  const bits = 1, words = 128, idx = new Uint8Array(4096);
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) for (let yy = 0; yy <= top; yy++) idx[((x * 16) + z) * 16 + yy] = 1;
  const w = new Uint8Array(words * 4); const dv = new DataView(w.buffer);
  for (let i = 0; i < words; i++) { let word = 0; for (let k = 0; k < 32; k++) word |= (idx[i * 32 + k] & 1) << k; dv.setUint32(i * 4, word >>> 0, true); }
  const enc = new TextEncoder();
  const nbt = (name) => { const n = enc.encode(name), k = enc.encode('name'); return u8([10, 0, 0, 8, k.length, 0, ...k, n.length, 0, ...n, 0]); };
  return cat([u8([9, 1, y & 0xff, (bits << 1) | 1]), w, u32(2), nbt('minecraft:air'), nbt('minecraft:stone')]);
}
const cmp = (a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; };

// records: [key, value|null, seq]; compression 0, 2 (zlib) or 4 (raw deflate)
function writeTable(records, compression, perBlock = 16) {
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
function crc32c(buf) {
  if (!T) { T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0x82f63b78 : c >>> 1; T[n] = c >>> 0; } }
  let c = 0xffffffff; for (const b of buf) c = T[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0;
}
const mask = (c) => ((((c >>> 15) | (c << 17)) >>> 0) + 0xa282ead8) >>> 0;

// batches: [{ seq, ops: [key, value|null][] }]; corrupt: index of a batch whose CRC is broken
function writeLog(batches, { corrupt = -1 } = {}) {
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

function writeZip(files) {                        // stored entries
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

export default async function run(ctx) {
  const { check, note } = ctx;
  const { readWorld, tableEntries, logRecords } = await import('../../engine/worldfile.js');
  const { exactGround } = await import('../../engine/bedrockblocks.js');
  const D3 = 43, SUB = 47;
  const h = (chunks, cx, cz) => { const c = chunks.get(cx + ',' + cz); return c ? c[0] : undefined; };

  // table 1 (raw deflate): A, B, D. table 2 (zlib): E newer than its log copy.
  const t1 = writeTable([
    [chunkKey(0, 0, D3), data3d(70), 5],                     // A: only in a table
    [chunkKey(1, 0, D3), data3d(70), 6],                     // B: superseded by the log
    [chunkKey(1, 0, SUB, 4), subchunk(4, 5), 6],             //    its blocks, superseded too
    [chunkKey(3, 0, D3), data3d(70), 7],                     // D: deleted in the log
  ], 4);
  const t2 = writeTable([[chunkKey(4, 0, D3), data3d(111), 500]], 2);   // E: table is newer

  // the log: C only here, B overridden, D deleted, E older than the table,
  // a big batch that spans several 32 KB blocks, a corrupt batch, and a good one after it
  const big = [];
  for (let i = 0; i < 120; i++) big.push([chunkKey(10 + (i % 12), 10 + Math.floor(i / 12), D3), data3d(60 + (i % 7))]);
  const log = writeLog([
    { seq: 100, ops: [[chunkKey(2, 0, D3), data3d(80)], [chunkKey(2, 0, SUB, 4), subchunk(4, 9)]] },   // C
    { seq: 102, ops: [[chunkKey(1, 0, D3), data3d(90)], [chunkKey(1, 0, SUB, 4), subchunk(4, 10)]] },  // B newer
    { seq: 104, ops: [[chunkKey(3, 0, D3), null]] },                                                    // D deleted
    { seq: 105, ops: [[chunkKey(4, 0, D3), data3d(99)]] },                                              // E older
    { seq: 200, ops: big },
    { seq: 400, ops: [[chunkKey(5, 0, D3), data3d(77)]] },                                              // corrupt
    { seq: 401, ops: [[chunkKey(6, 0, D3), data3d(78)]] },                                              // after it
  ], { corrupt: 5 });
  check('log fixture really spans more than one 32 KB block (fragmented records)', log.length > 65536, `${log.length} bytes`);

  const files = [['w/db/000005.ldb', t1], ['w/db/000009.ldb', t2], ['w/db/000010.log', log], ['w/level.dat', new Uint8Array(8)]];
  const world = readWorld(writeZip(files));
  const { chunks } = world;

  check('table-only chunk is read', h(chunks, 0, 0) === 70);
  check('log-only chunk is read (the recently generated case)', h(chunks, 2, 0) === 80, String(h(chunks, 2, 0)));
  check('a newer log record overrides the table', h(chunks, 1, 0) === 90, String(h(chunks, 1, 0)));
  check('a deletion in the log removes the chunk', !chunks.has('3,0'));
  check('a newer table record beats an older log record', h(chunks, 4, 0) === 111, String(h(chunks, 4, 0)));
  let bigOk = 0;
  for (let i = 0; i < 120; i++) if (h(chunks, 10 + (i % 12), 10 + Math.floor(i / 12)) === 60 + (i % 7)) bigOk++;
  check('a batch fragmented across log blocks is reassembled', bigOk === 120, `${bigOk}/120`);
  check('a batch with a bad checksum is skipped', !chunks.has('5,0'));
  check('records after a bad batch are still read', h(chunks, 6, 0) === 78);
  check('the chunk index points log-only chunks at the log file',
    [...(world.index.get('2,0') || [])].some((i) => /\.log$/.test(world.zip.entries[i].name)));
  check('read stats report the log', world.stats.logs === 1 && world.stats.logRecords > 120, JSON.stringify(world.stats));

  // file order must not matter
  const rev = readWorld(writeZip(files.slice().reverse())).chunks;
  const same = [...chunks.keys()].every((k) => rev.get(k)?.[0] === chunks.get(k)[0]) && rev.size === chunks.size;
  check('result is independent of file order', same, `${chunks.size} vs ${rev.size}`);

  // exact ground under a site: blocks from the log, newest subchunk wins
  const eg = exactGround(world.zip, world.index, 16, 0, 32);    // chunks 1 and 2
  check('exact ground reads a log-only chunk\'s blocks', eg.ground[16] === 4 * 16 + 9, String(eg.ground[16]));
  check('exact ground takes the newer subchunk from the log', eg.ground[0] === 4 * 16 + 10, String(eg.ground[0]));

  // a torn write at the end of the log (game killed mid-write) must not throw or lose earlier records
  const torn = log.subarray(0, log.length - 20);
  let tornOk = true, n = 0;
  try { for (const r of logRecords(torn)) n++; } catch { tornOk = false; }
  check('a torn log tail is tolerated', tornOk && n > 120, `${n} records`);

  // the reported symptom: a region split between tables and the log, as a
  // fresh pregen leaves it. Tables alone give a speckled map; with the log it is whole.
  const tableRecs = [], logOps = [];
  let s = 1;
  for (let cx = 0; cx < 64; cx++) for (let cz = 0; cz < 64; cz++) {
    const rec = [chunkKey(cx, cz, D3), data3d(64)];
    ((cx * 31 + cz * 17) % 5 < 2 ? tableRecs : logOps).push(rec);
  }
  const t3 = writeTable(tableRecs.map(([k, v]) => [k, v, s++]), 4, 64);
  const log3 = writeLog([{ seq: 100000, ops: logOps }]);
  const zip3 = writeZip([['db/000003.ldb', t3], ['db/000004.log', log3]]);
  let tablesOnly = 0;
  for (const [k] of tableEntries(t3)) if (k.length === 9 && k[8] === D3) tablesOnly++;
  const whole = readWorld(zip3).chunks.size;
  check('split region: tables alone miss chunks, tables + log find all 4096',
    tablesOnly < 4096 && whole === 4096, `tables only ${tablesOnly}, with log ${whole}`);
  note('LevelDB: .ldb tables and .log write-ahead log, newest sequence wins, deletions honoured');
}
