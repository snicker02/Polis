// tools/make-java-world.mjs — a small, real Java world in Anvil format.
//
// There is no Java world to hand here, so this writes one: chunks with proper
// Heightmaps packed the way Java packs them, zlib-compressed, laid out in a
// region file with its sector header, and zipped like an exported world. The
// reader is then checked against it. It is not a substitute for a world from
// the game, but it does prove the container, the packing and the NBT.

import { deflateSync, gzipSync } from 'node:zlib';
import { encodeJavaNbt, J } from '../engine/export-java.js';

const T_LONG_ARRAY = 12, T_COMPOUND = 10;

// Java packs 9-bit heights into longs, as many whole values per long as fit.
export function packHeightmap(heights, bits = 9) {
  const perLong = Math.floor(64 / bits);
  const longs = new BigInt64Array(Math.ceil(256 / perLong));
  for (let i = 0; i < 256; i++) {
    const li = Math.floor(i / perLong);
    const shift = BigInt((i % perLong) * bits);
    longs[li] = BigInt.asIntN(64, BigInt.asUintN(64, longs[li]) | (BigInt(heights[i] & 0x1ff) << shift));
  }
  return longs;
}

// the NBT writer here only knows the tags Polis writes, so long arrays are
// added by hand
function longArray(values) {
  const body = new Uint8Array(4 + values.length * 8);
  const dv = new DataView(body.buffer);
  dv.setInt32(0, values.length, false);
  values.forEach((v, i) => dv.setBigInt64(4 + i * 8, v, false));
  return [T_LONG_ARRAY, body];
}

function chunkNbt(cx, cz, heights) {
  // hand-rolled, because the heightmap is a long array
  const parts = [];
  const enc = new TextEncoder();
  const push = (type, name, payload) => {
    const n = enc.encode(name);
    const head = new Uint8Array(3 + n.length);
    head[0] = type;
    head[1] = (n.length >> 8) & 0xff; head[2] = n.length & 0xff;
    head.set(n, 3);
    parts.push(head, payload);
  };
  const int = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v, false); return b; };
  push(3, 'DataVersion', int(3953));
  push(3, 'xPos', int(cx));
  push(3, 'zPos', int(cz));
  push(3, 'yPos', int(-4));
  // Heightmaps: { WORLD_SURFACE: long[] }
  const hm = [];
  const hmName = enc.encode('WORLD_SURFACE');
  const [, hmBody] = longArray(Array.from(packHeightmap(heights)));
  const hmHead = new Uint8Array(3 + hmName.length);
  hmHead[0] = T_LONG_ARRAY;
  hmHead[1] = (hmName.length >> 8) & 0xff; hmHead[2] = hmName.length & 0xff;
  hmHead.set(hmName, 3);
  hm.push(hmHead, hmBody, Uint8Array.of(0));
  const hmSize = hm.reduce((a, b) => a + b.length, 0);
  const hmAll = new Uint8Array(hmSize);
  let o = 0;
  for (const part of hm) { hmAll.set(part, o); o += part.length; }
  push(T_COMPOUND, 'Heightmaps', hmAll);
  parts.push(Uint8Array.of(0));                        // end of the root compound

  const size = parts.reduce((a, b) => a + b.length, 0);
  const body = new Uint8Array(size);
  let p = 0;
  for (const part of parts) { body.set(part, p); p += part.length; }
  // the root: a compound with an empty name
  const out = new Uint8Array(3 + body.length);
  out[0] = T_COMPOUND;
  out.set(body, 3);
  return out;
}

// one region file: 32x32 chunks, of which we write a patch
export function makeRegion(originX, originZ, groundOf) {
  const chunks = [];
  for (let lz = 0; lz < 32; lz++)
    for (let lx = 0; lx < 32; lx++) {
      const cx = originX + lx, cz = originZ + lz;
      const heights = new Int16Array(256);
      for (let i = 0; i < 256; i++) {
        const x = cx * 16 + (i % 16), z = cz * 16 + Math.floor(i / 16);
        // stored as height above the bottom of the world, of the space above the ground
        heights[i] = groundOf(x, z) + 64 + 1;
      }
      chunks.push({ index: lx + lz * 32, data: deflateSync(Buffer.from(chunkNbt(cx, cz, heights))) });
    }
  // header, then each chunk on a 4 KiB boundary
  const sectors = [];
  let sector = 2;
  const payload = [];
  for (const c of chunks) {
    const len = 5 + c.data.length;
    const need = Math.ceil(len / 4096);
    const block = Buffer.alloc(need * 4096);
    block.writeUInt32BE(c.data.length + 1, 0);
    block[4] = 2;                                      // zlib
    Buffer.from(c.data).copy(block, 5);
    payload.push(block);
    sectors.push({ index: c.index, sector, count: need });
    sector += need;
  }
  const header = Buffer.alloc(8192);
  for (const s of sectors) {
    header.writeUInt8((s.sector >> 16) & 0xff, s.index * 4);
    header.writeUInt8((s.sector >> 8) & 0xff, s.index * 4 + 1);
    header.writeUInt8(s.sector & 0xff, s.index * 4 + 2);
    header.writeUInt8(s.count, s.index * 4 + 3);
    header.writeUInt32BE(1, 4096 + s.index * 4);
  }
  return Buffer.concat([header, ...payload]);
}

export function makeLevelDat(name, spawn) {
  const root = J.comp({ Data: J.comp({ LevelName: J.str(name), SpawnX: J.int(spawn[0]), SpawnY: J.int(spawn[1]), SpawnZ: J.int(spawn[2]) }) });
  return gzipSync(Buffer.from(encodeJavaNbt(root)));
}
