// tools/nbt-read.js — minimal little-endian NBT reader, used only by the
// validator to read back what the writer produced.

const TAG = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11 };

export function decodeNbt(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const dec = new TextDecoder();

  const str = () => { const n = dv.getUint16(p, true); p += 2; const s = dec.decode(bytes.subarray(p, p + n)); p += n; return s; };

  function payload(t) {
    switch (t) {
      case TAG.BYTE: { const v = dv.getInt8(p); p += 1; return v; }
      case TAG.SHORT: { const v = dv.getInt16(p, true); p += 2; return v; }
      case TAG.INT: { const v = dv.getInt32(p, true); p += 4; return v; }
      case TAG.LONG: { const v = dv.getBigInt64(p, true); p += 8; return v; }
      case TAG.FLOAT: { const v = dv.getFloat32(p, true); p += 4; return v; }
      case TAG.DOUBLE: { const v = dv.getFloat64(p, true); p += 8; return v; }
      case TAG.BYTE_ARRAY: { const n = dv.getInt32(p, true); p += 4; const v = bytes.subarray(p, p + n); p += n; return v; }
      case TAG.STRING: return str();
      case TAG.LIST: {
        const et = dv.getInt8(p); p += 1;
        const n = dv.getInt32(p, true); p += 4;
        if (et === TAG.INT) { const a = new Int32Array(n); for (let i = 0; i < n; i++) { a[i] = dv.getInt32(p, true); p += 4; } return a; }
        const out = [];
        for (let i = 0; i < n; i++) out.push(payload(et));
        return out;
      }
      case TAG.COMPOUND: {
        const obj = {};
        for (;;) {
          const ct = dv.getInt8(p); p += 1;
          if (ct === TAG.END) break;
          const name = str();
          obj[name] = payload(ct);
        }
        return obj;
      }
      case TAG.INT_ARRAY: { const n = dv.getInt32(p, true); p += 4; const a = new Int32Array(n); for (let i = 0; i < n; i++) { a[i] = dv.getInt32(p, true); p += 4; } return a; }
      default: throw new Error('unknown tag ' + t + ' at ' + p);
    }
  }

  const rootType = dv.getInt8(p); p += 1;
  if (rootType !== TAG.COMPOUND) throw new Error('root is not a compound');
  str();
  const root = payload(TAG.COMPOUND);
  return { root, bytesRead: p };
}

// Minimal zip central-directory reader.
export function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('no end-of-central-directory record');
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOff = dv.getUint32(eocd + 16, true);
  const entries = [];
  let p = cdOff;
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad central directory header');
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const comp = dv.getUint32(p + 20, true);
    const raw = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, crc, comp, raw, off });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, cdSize, cdOff, count };
}

export function localPayload(bytes, entry) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(entry.off, true) !== 0x04034b50) throw new Error('bad local header');
  const nameLen = dv.getUint16(entry.off + 26, true);
  const extraLen = dv.getUint16(entry.off + 28, true);
  const start = entry.off + 30 + nameLen + extraLen;
  return bytes.subarray(start, start + entry.comp);
}
