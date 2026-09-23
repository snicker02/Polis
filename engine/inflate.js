// engine/inflate.js — raw DEFLATE decompression, in plain JavaScript.
//
// Reading a Minecraft world means unzipping a .mcworld and unpacking LevelDB
// blocks, both of which are DEFLATE. The browser's DecompressionStream is
// asynchronous, which does not suit a parser that walks a table block by
// block, so this does it synchronously. It is the classic algorithm: fixed
// and dynamic Huffman codes, a 32 KB sliding window, length/distance pairs.

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073,
  4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

// A canonical Huffman table: for each code length, the first code and the
// index of its first symbol, so decoding is a walk down the lengths.
function buildTable(lengths) {
  const maxBits = Math.max(...lengths, 0);
  const count = new Int32Array(maxBits + 1);
  for (const l of lengths) if (l) count[l]++;
  const first = new Int32Array(maxBits + 2), firstSym = new Int32Array(maxBits + 2);
  let code = 0, sym = 0;
  for (let b = 1; b <= maxBits; b++) {
    first[b] = code; firstSym[b] = sym;
    code = (code + count[b]) << 1;
    sym += count[b];
  }
  const sorted = new Int32Array(sym);
  const offset = new Int32Array(maxBits + 2);
  let acc = 0;
  for (let b = 1; b <= maxBits; b++) { offset[b] = acc; acc += count[b]; }
  for (let i = 0; i < lengths.length; i++) if (lengths[i]) sorted[offset[lengths[i]]++] = i;
  return { maxBits, count, first, firstSym, sorted };
}

export function inflateRaw(src, expected = 0) {
  let out = new Uint8Array(Math.max(expected || 0, src.length * 4, 1024));
  let o = 0;
  let pos = 0, bitBuf = 0, bitCount = 0;

  const need = (n) => { while (bitCount < n) { bitBuf |= src[pos++] << bitCount; bitCount += 8; } };
  const bits = (n) => { if (!n) return 0; need(n); const v = bitBuf & ((1 << n) - 1); bitBuf >>>= n; bitCount -= n; return v; };
  const decode = (t) => {
    let code = 0, firstCode = 0, index = 0;
    for (let len = 1; len <= t.maxBits; len++) {
      code |= bits(1);
      const n = t.count[len];
      if (code - firstCode < n) return t.sorted[index + (code - firstCode)];
      index += n;
      firstCode = (firstCode + n) << 1;
      code <<= 1;
    }
    throw new Error('bad Huffman code');
  };
  const grow = (extra) => {
    if (o + extra <= out.length) return;
    const bigger = new Uint8Array(Math.max(out.length * 2, o + extra));
    bigger.set(out.subarray(0, o));
    out = bigger;
  };

  for (;;) {
    const last = bits(1), type = bits(2);
    if (type === 0) {                                  // stored
      bitBuf = 0; bitCount = 0;
      const len = src[pos] | (src[pos + 1] << 8);
      pos += 4;
      grow(len);
      out.set(src.subarray(pos, pos + len), o);
      o += len; pos += len;
    } else {
      let litTable, distTable;
      if (type === 1) {                                // fixed codes
        const l = new Uint8Array(288);
        l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288);
        litTable = buildTable(l);
        distTable = buildTable(new Uint8Array(30).fill(5));
      } else if (type === 2) {                         // dynamic codes
        const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
        const clen = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) clen[CLEN_ORDER[i]] = bits(3);
        const clTable = buildTable(clen);
        const lengths = new Uint8Array(hlit + hdist);
        for (let i = 0; i < lengths.length;) {
          const sym = decode(clTable);
          if (sym < 16) lengths[i++] = sym;
          else if (sym === 16) { const prev = lengths[i - 1], n = 3 + bits(2); for (let j = 0; j < n; j++) lengths[i++] = prev; }
          else if (sym === 17) { const n = 3 + bits(3); i += n; }
          else { const n = 11 + bits(7); i += n; }
        }
        litTable = buildTable(lengths.subarray(0, hlit));
        distTable = buildTable(lengths.subarray(hlit));
      } else throw new Error('bad block type');

      for (;;) {
        const sym = decode(litTable);
        if (sym < 256) { grow(1); out[o++] = sym; continue; }
        if (sym === 256) break;
        const li = sym - 257;
        const len = LEN_BASE[li] + bits(LEN_EXTRA[li]);
        const di = decode(distTable);
        const dist = DIST_BASE[di] + bits(DIST_EXTRA[di]);
        grow(len);
        let from = o - dist;
        for (let i = 0; i < len; i++) out[o++] = out[from++];
      }
    }
    if (last) break;
  }
  return out.subarray(0, o);
}

// zlib wrapper (2-byte header, adler32 tail) around the same stream
export function inflate(src) {
  if ((src[0] & 0x0f) !== 8) throw new Error('not zlib data');
  return inflateRaw(src.subarray(2));
}
