// tools/checks/2za-leveldb-log.js — reading a Bedrock world's LevelDB the whole way.
//
// Bedrock keeps recent writes (freshly generated chunks especially) in the
// LevelDB write-ahead log, db/*.log, not only in the sorted tables, db/*.ldb.
// This builds a small world zip from scratch, with a real table writer and a
// real log writer (32 KB blocks, CRC32C, fragmented records), and checks that
// every chunk is found and that the newest record of each key wins.

export const id = '2za';
export const label = '2za. LevelDB tables + write-ahead log';

import { cat, u8, u32, chunkKey, data3d, subchunk, writeTable, writeLog, writeZip } from '../make-bedrock-world.mjs';

export default async function run(ctx) {
  const { check, note } = ctx;
  const { readWorld, tableEntries, logRecords, worldReport } = await import('../../engine/worldfile.js');
  const { exactGround, rebuildHeights } = await import('../../engine/bedrockblocks.js');
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

  // ---- chunks without a heightmap record --------------------------------
  // F: blocks only (two subchunks); G: generation started, no terrain yet;
  // H: pre-1.18 Data2D heightmap; I: an all-air subchunk only; J: normal.
  const i32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, n, true); return b; };
  const data2d = (height) => { const b = new Uint8Array(512 + 256); const dv = new DataView(b.buffer); for (let i = 0; i < 256; i++) dv.setInt16(i * 2, height, true); return b; };
  const airOnly = (y) => { const enc = new TextEncoder(), n = enc.encode('minecraft:air'), k = enc.encode('name');
    return cat([u8([9, 1, y & 0xff, 3]), new Uint8Array(512), u32(1), u8([10, 0, 0, 8, k.length, 0, ...k, n.length, 0, ...n, 0])]); };
  const t4 = writeTable([
    [chunkKey(20, 0, SUB, 4), subchunk(4, 9), 1],
    [chunkKey(20, 0, SUB, 5), subchunk(5, 2), 2],
    [chunkKey(20, 0, 54), i32(2), 3],
    [chunkKey(21, 0, 54), i32(1), 4],
    [chunkKey(21, 0, 44), u8([40]), 5],
    [chunkKey(22, 0, 45), data2d(70), 6],
    [chunkKey(23, 0, SUB, 6), airOnly(6), 7],
    [chunkKey(24, 0, D3), data3d(66), 8],
  ], 4);
  const w4 = readWorld(writeZip([['db/000011.ldb', t4]]));
  const st = w4.stats;
  check('census: every chunk with any record is counted', st.withRecords === 5, String(st.withRecords));
  check('Data2D heightmap is used when there is no Data3D', h(w4.chunks, 22, 0) === 70 && st.fromLegacy === 1);
  check('chunks with blocks but no heightmap are listed for rebuilding',
    st.blocksOnly.slice().sort().join('|') === '20,0|23,0', st.blocksOnly.join('|'));
  check('chunks with records but no blocks are listed as bare', st.bare.join('|') === '21,0' && w4.census.get('21,0').fin === 1);
  const rb = rebuildHeights(w4.zip, w4.index, st.blocksOnly);
  check('heights rebuilt from blocks: top non-air block + 1, highest subchunk wins',
    rb.get('20,0') && rb.get('20,0')[0] === 5 * 16 + 2 + 1 && rb.get('20,0')[255] === 83, rb.get('20,0') ? String(rb.get('20,0')[0]) : 'missing');
  check('an all-air chunk is not given a height', !rb.has('23,0'));
  const bareSet = new Set(['21,0', '23,0']);
  const rep = worldReport(st, rb.size, bareSet, w4.census);
  check('report names rebuilt and red chunks with their generation state',
    /1 rebuilt from blocks/.test(rep) && /2 have records but no terrain/.test(rep) && /1 need population/.test(rep) && /1 no state/.test(rep) && /1 from old-format/.test(rep), rep);
  check('report is empty for a plain world', worldReport({ logs: 0, fromLegacy: 0 }, 0, new Set(), new Map()) === '');
  note('LevelDB: .ldb tables and .log write-ahead log, newest sequence wins, deletions honoured; census, Data2D, heights from blocks');
}
