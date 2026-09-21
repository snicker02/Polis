// tools/nbt-typed.js — little-endian NBT reader that keeps every tag's type,
// in exactly the { t, v } shape engine/blockcore.js writes. Used to lift
// entity templates out of structures saved in game, and by the validator.
export function decodeTyped(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  let p = 0;
  const str = () => { const n = dv.getUint16(p, true); p += 2; const s = dec.decode(bytes.subarray(p, p + n)); p += n; return s; };
  function payload(t) {
    switch (t) {
      case 1: { const v = dv.getInt8(p); p += 1; return { t, v }; }
      case 2: { const v = dv.getInt16(p, true); p += 2; return { t, v }; }
      case 3: { const v = dv.getInt32(p, true); p += 4; return { t, v }; }
      case 4: { const v = dv.getBigInt64(p, true); p += 8; return { t, v }; }
      case 5: { const v = dv.getFloat32(p, true); p += 4; return { t, v }; }
      case 6: { const v = dv.getFloat64(p, true); p += 8; return { t, v }; }
      case 7: { const n = dv.getInt32(p, true); p += 4; const v = Array.from(bytes.subarray(p, p + n), (b) => (b << 24) >> 24); p += n; return { t, v }; }
      case 8: return { t, v: str() };
      case 9: {
        const et = dv.getInt8(p); p += 1; const n = dv.getInt32(p, true); p += 4;
        const v = []; for (let i = 0; i < n; i++) v.push(payload(et));
        return { t, et, v, keepEt: true };
      }
      case 10: {
        const v = {};
        for (;;) { const ct = dv.getInt8(p); p += 1; if (ct === 0) break; const k = str(); v[k] = payload(ct); }
        return { t, v };
      }
      case 11: { const n = dv.getInt32(p, true); p += 4; const v = []; for (let i = 0; i < n; i++) { v.push(dv.getInt32(p, true)); p += 4; } return { t, v }; }
      default: throw new Error('tag ' + t + ' at ' + p);
    }
  }
  const t = dv.getInt8(p); p += 1; str();
  return payload(t);
}
