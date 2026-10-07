// tools/checks/2zzd-civic.js — the police station, the theatre and the hotel (civic.js).
//
// Built into the world and looked at there. The police station: its desks,
// lockers, the holding cell's bars and bed, the hall and office reached from the
// street, and near the jail (the nearest lot that takes it). The theatre: every
// seat, the note blocks in the pit, the curtains whole, and every row's aisle
// reached on foot (the seats rise a block a row, the aisles with them). The hotel:
// its rooms, every bed whole, every room's door reached on foot, up the stairs.
// On flat cities; on a player's fitted city the police station (the theatre and
// the hotel find no lot there beside a jail). Every block one of Bedrock's own.

import { readFileSync } from 'node:fs';

export const id = '2zzd';
export const label = '2zzd. the police station, the theatre and the hotel';

let MATERIALS;

function inspectCivic(r) {
  const w = r.world, out = {};
  const blk = (x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block.replace('minecraft:', ''); };
  const solid = (b) => !['air', 'water', 'lantern', 'short_grass'].includes(b) && !/sign|carpet|rail|ladder|end_rod|bell|fence|bars/.test(b);
  const liftOf = (L) => { const [x, z] = L.frame.at(Math.floor(L.frame.W / 2), 2); for (let d = -3; d <= 8; d++) if (solid(blk(x, L.door[1] - 1 + d, z)) && blk(x, L.door[1] + d, z) === 'air') return d; return 0; };
  const walkFrom = (L, lift) => {
    const [dx0, dy0, dz0] = [L.door[0], L.door[1] + lift, L.door[2]];
    const passable = (b) => b === 'air' || /sign|lantern|stairs|carpet/.test(b);
    const stand = (x, y, z) => { const b = blk(x, y, z), a = blk(x, y + 1, z), u = blk(x, y - 1, z); return passable(b) && (a === 'air' || /lantern|sign/.test(a)) && (solid(u) || /bed|stairs/.test(u)); };
    const walk = new Set([dx0 + ',' + dy0 + ',' + dz0]), q = [[dx0, dy0, dz0]];
    while (q.length && walk.size < 60000) { const [a, b, c] = q.pop(); for (const [ddx, ddz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const x = a + ddx, y = b + dy, z = c + ddz, k = x + ',' + y + ',' + z; if (walk.has(k) || !stand(x, y, z)) continue; if (dy === 1 && blk(a, b + 2, c) !== 'air' && !/lantern/.test(blk(a, b + 2, c))) continue; walk.add(k); q.push([x, y, z]); } }
    return walk;
  };
  const P = r.landmarks.find((L) => L.kind === 'police');
  if (P) {
    const lift = liftOf(P), fr = P.frame, walk = walkFrom(P, lift);
    const reach = (u, v) => { const [x, z] = fr.at(u, v); return walk.has(x + ',' + (P.door[1] + lift) + ',' + z); };
    const J = r.landmarks.find((L) => L.kind === 'jail');
    const mid = (l) => [(l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2];
    out.police = { desks: P.desks.every(([x, z]) => blk(x, P.door[1] + lift, z) === 'oak_slab' || /slab|planks/.test(blk(x, P.door[1] + lift, z))), lockers: P.lockers.length,
      bars: (() => { const [x, z] = fr.at(6, fr.cellV); return blk(x, P.door[1] + lift, z) === 'iron_bars'; })(), bed: P.beds.length,
      rooms: { hall: reach(6, 2), office: reach(6, 8) }, jailDist: J ? Math.round(Math.hypot(mid(P.lot)[0] - mid(J.lot)[0], mid(P.lot)[1] - mid(J.lot)[1])) : null };
  }
  const T = r.landmarks.find((L) => L.kind === 'theatre');
  if (T) {
    const lift = liftOf(T), fr = T.frame, walk = walkFrom(T, lift);
    const G0 = T.door[1] + lift;
    out.theatre = { seats: T.seats.filter(([x, z, y]) => /stairs/.test(blk(x, y + lift, z))).length + ' of ' + T.seats.length,
      pit: T.pit.filter(([x, z, y]) => blk(x, y + lift, z) === 'noteblock').length + ' of ' + T.pit.length,
      curtains: T.curtains.every(([x, z, y]) => blk(x, y + lift, z) === 'red_wool'),
      rows: [...Array(fr.ROWS).keys()].map((k) => { const [x, z] = fr.at(1, fr.ROW0 + k); return walk.has(x + ',' + (G0 + k) + ',' + z); }) };
  }
  const H = r.landmarks.find((L) => L.kind === 'hotel');
  if (H) {
    const lift = liftOf(H), walk = walkFrom(H, lift);
    out.hotel = { rooms: H.rooms.length, beds: H.beds.every((b) => blk(b.foot[0], b.foot[1] + lift, b.foot[2]) === 'bed' && blk(b.head[0], b.head[1] + lift, b.head[2]) === 'bed') ? H.beds.length : 'BROKEN',
      doorsReached: H.rooms.filter((rm) => walk.has(rm.door[0] + ',' + (rm.door[2] + lift) + ',' + rm.door[1])).length + ' of ' + H.rooms.length };
  }
  return out;
}

export default async function run(ctx) {
  const { check } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  ({ MATERIALS } = await import('../../engine/materials.js'));
  const { buildStructures } = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const L = { furnish: false, villagers: 0, fish: false, jail: true, police: true, theatre: true, hotel: true };
  const fx = JSON.parse(readFileSync(new URL('./site-1004954.json', import.meta.url), 'utf8'));
  const ground = new Int16Array(Uint8Array.from(Buffer.from(fx.ground, 'base64')).buffer);
  const water = Uint8Array.from(Buffer.from(fx.water, 'base64'));
  const flat = [generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7 }), generateCity({ ...DEFAULTS, ...L, size: 320, seed: 12345 })];
  const fitted = generateCity({ ...DEFAULTS, ...fx.settings, ...L, terrain: { ground, water, baseY: fx.baseY } });
  check('defaults: no police station, theatre or hotel unless asked', !DEFAULTS.police && !DEFAULTS.theatre && !DEFAULTS.hotel);
  const ts = flat.map(inspectCivic), tf = inspectCivic(fitted);
  const ps = [...ts.map((t) => t.police), tf.police];
  check('police station: built when asked, on flat cities and a fitted one', ps.every(Boolean));
  check('police station: desks, lockers, the holding cell\'s bars and bed; the hall and office reached from the street', ps.every((p) => p && p.desks && p.lockers === 5 && p.bars && p.bed === 1 && p.rooms.hall && p.rooms.office));
  check('police station: next to the jail (within forty blocks of it)', ps.every((p) => p && p.jailDist !== null && p.jailDist <= 40), ps.map((p) => p && p.jailDist).join(', '));
  check('theatre: built when asked, every seat, the note blocks in the pit, the curtains whole', ts.every((t) => t.theatre && /^(\d+) of \1$/.test(t.theatre.seats) && /^(\d+) of \1$/.test(t.theatre.pit) && t.theatre.curtains), ts.map((t) => t.theatre && t.theatre.seats).join(', '));
  check('theatre: every row\'s aisle reached on foot (every seat can be walked to)', ts.every((t) => t.theatre && t.theatre.rows.every(Boolean)));
  check('hotel: built when asked, twenty-four rooms, every bed whole', ts.every((t) => t.hotel && t.hotel.rooms === 24 && t.hotel.beds === 24));
  check('hotel: every room\'s door reached on foot, up the stairs', ts.every((t) => t.hotel && t.hotel.doorsReached === '24 of 24'), ts.map((t) => t.hotel && t.hotel.doorsReached).join(', '));
  {
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const bad = new Set();
    for (const st of buildStructures(flat[0].world, {})) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
    }
    check('police station, theatre, hotel: every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
  }
}
