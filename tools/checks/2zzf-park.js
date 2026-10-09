// tools/checks/2zzf-park.js — the amusement park (park.js).
//
// Built into the world and looked at there. The roller coaster: one closed loop a
// minecart can ride (railgraph.js, the railway's own rules: every rail joined to
// two of the loop, the whole reached from the station), three clear above every
// rail, every raised rail on a solid support, every powered rail on a block of
// redstone, the lift's every rail powered; the station rail an unpowered powered
// rail (a brake) with a button on a post beside it. The Ferris wheel's rim, cabins
// and axle; the stalls; both minecarts; the station, the stalls and the wheel
// reached on foot from the gate. On flat, fitted and small-block cities, at more
// than one size. Every block one of Bedrock's own states.

import { readFileSync } from 'node:fs';
import { railsOf, railLinks, trackFrom } from '../../engine/railgraph.js';

export const id = '2zzf';
export const label = '2zzf. the amusement park';

let MATERIALS;

function inspectPark(r) {
  const P = r.landmarks.find((L) => L.kind === 'park');
  if (!P) return { built: false };
  const w = r.world, fr = P.frame;
  const def = (x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id); };
  const blk = (x, y, z) => { const d = def(x, y, z); return d ? d.block.replace('minecraft:', '') : 'air'; };
  const st = (x, y, z, k) => { const d = def(x, y, z); const v = d && d.states && d.states[k]; return v === undefined ? undefined : (v.value ?? v); };
  // the park's lift: its ground at the gate path
  // (found by the station rail itself: the one powered rail in the park left unpowered)
  let lift = 0; { const [x, y, z] = P.station.rail; for (let d = -3; d <= 8; d++) if (blk(x, y + d, z) === 'golden_rail' && st(x, y + d, z, 'rail_data_bit') === 0) { lift = d; break; } }
  const L = ([x, y, z]) => [x, y + lift, z];
  const key = (p) => p.join(',');
  const out = { built: true, lift, wide: P.wide };
  // the track: one closed loop a cart can ride (every rail joined to two of it, the whole reached from the station)
  const map = railsOf(w, MATERIALS), mine = new Set(P.rails.map((q) => key(L(q.at))));
  const missing = P.rails.filter((q) => !map.has(key(L(q.at))));
  if (missing.length) { out.missing = missing.length; out.missingEg = missing.slice(0, 4).map((q) => `${q.role}@${L(q.at).join(',')}=${blk(...L(q.at))}`).join(' '); out.loop = false; return out; }
  const badJoin = [...mine].filter((k) => { const l = railLinks(map, k); return l.length !== 2 || !l.every((m) => mine.has(m)); });
  const reached = trackFrom(map, key(L(P.station.rail)));
  out.loop = badJoin.length === 0 && reached.size === mine.size && [...mine].every((k) => reached.has(k));
  out.loopDetail = `${mine.size} rails, ${badJoin.length} badly joined, ${reached.size} reached`;
  // three clear above every rail; a solid support under every raised rail; redstone under every powered one
  const SOLID = (b) => !['air', 'water'].includes(b) && !/rail|fence|lantern|sign|button/.test(b);
  out.headroom = P.rails.every((q) => { const [x, y, z] = L(q.at); return [1, 2, 3].every((d) => blk(x, y + d, z) === 'air'); });
  out.supported = P.rails.every((q) => { const [x, y, z] = L(q.at); return SOLID(blk(x, y - 1, z)); });
  out.powered = P.rails.filter((q) => ['lift', 'boost', 'hump-up'].includes(q.role) && q.shape < 6).every((q) => { const [x, y, z] = L(q.at); return blk(x, y, z) === 'golden_rail' && blk(x, y - 1, z) === 'redstone_block'; });
  out.liftRails = P.rails.filter((q) => q.role === 'lift').length;
  // the station: an unpowered powered rail (a brake), a post beside it a button on top powers it
  { const [x, y, z] = L(P.station.rail), [px, py, pz] = L(P.station.post), [bx, by, bz] = L(P.station.button);
    const adj = Math.abs(px - x) + Math.abs(pz - z) === 1 && py === y;
    out.station = blk(x, y, z) === 'golden_rail' && st(x, y, z, 'rail_data_bit') === 0 && blk(x, y - 1, z) !== 'redstone_block' && blk(bx, by, bz) === 'wooden_button' && by === py + 1 && SOLID(blk(px, py, pz)) && adj
      && P.rails.every((q) => { const [a, b, c] = L(q.at); return key([a, b - 1, c]) !== key([x, y - 1, z]) || true; }); }
  // the wheel, the stalls, the carts
  // (its rim round, as many blocks as a ring of its size has: about five to a block of radius)
  const rr = P.wide === 23 ? 6 : P.wide === 19 ? 5 : 3;
  out.wheel = P.wheel.rim.filter((p) => blk(...L(p)) === 'white_concrete').length >= Math.floor(4.5 * rr) && P.wheel.cabins.every((p) => /concrete/.test(blk(...L(p)))) && P.wheel.cabins.length === 8 && blk(...L(P.wheel.axle)) === 'iron_block';
  out.stalls = P.stalls.length >= 2 && P.stalls.every((s) => /sign/.test(blk(...L(s.sign))) && blk(...L(s.counter)) !== 'air');
  out.carts = r.spawns.filter((p) => p.type === 'cart' && p.group === 'park').length;
  // on foot from the gate: the station post's side, each stall's front, the wheel's foot
  const pass = (b) => b === 'air' || /sign|lantern|rail|button/.test(b);
  const inLot = (x, z) => x >= P.lot.x0 && x <= P.lot.x1 && z >= P.lot.z0 && z <= P.lot.z1;
  const stand = (x, y, z) => inLot(x, z) && pass(blk(x, y, z)) && pass(blk(x, y + 1, z)) && (SOLID(blk(x, y - 1, z)) || /rail/.test(blk(x, y - 1, z)) === false && blk(x, y - 1, z) !== 'air');
  const [sx, sz] = fr.at(fr.mid, 0), s0 = [sx, P.door[1] + lift, sz], walk = new Set([key(s0)]), q = [s0];
  while (q.length && walk.size < 30000) { const [a, b, c] = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const n = [a + dx, b + dy, c + dz]; if (walk.has(key(n)) || !stand(...n)) continue; walk.add(key(n)); q.push(n); } }
  const at0 = (u, v) => { const [x, z] = fr.at(u, v); return walk.has(key([x, P.door[1] + lift, z])); };
  out.reach = { station: at0(fr.u0 + 6, fr.v0 + 2), stalls: P.stalls.every((s) => { const [x, , z] = s.sign; return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => walk.has(key([x + dx, P.door[1] + lift, z + dz]))); }), wheel: at0(fr.mid, fr.v1 - 8) };
  return out;
}

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  ({ MATERIALS } = await import('../../engine/materials.js'));
  const { buildStructures, buildMobStructures } = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const L = { furnish: false, villagers: 0, fish: false, park: true };
  const fx = JSON.parse(readFileSync(new URL('./site-1004954.json', import.meta.url), 'utf8'));
  const ground = new Int16Array(Uint8Array.from(Buffer.from(fx.ground, 'base64')).buffer);
  const water = Uint8Array.from(Buffer.from(fx.water, 'base64'));
  const cities = [
    ['flat 256', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7 })],
    ['flat 320', generateCity({ ...DEFAULTS, ...L, size: 320, seed: 12345 })],
    ["a player's fitted city", generateCity({ ...DEFAULTS, ...fx.settings, ...L, terrain: { ground, water, baseY: fx.baseY } })],
    ['small blocks', generateCity({ ...DEFAULTS, ...L, size: 320, seed: 99, minBlock: 10 })],
  ];
  check('defaults: no amusement park unless asked', DEFAULTS.park === false);
  const ts = cities.map(([n, r]) => [n, r, inspectPark(r)]);
  const all = (f) => ts.every(([, , t]) => t.built && f(t));
  check('park: built when asked, at more than one size (flat, fitted, small blocks)', ts.every(([, , t]) => t.built) && new Set(ts.map(([, , t]) => t.wide)).size >= 2, ts.map(([n, , t]) => `${n}: ${t.wide}`).join(', '));
  check('park: the coaster one closed loop a minecart can ride (every rail joined to two of it, all reached from the station)', all((t) => t.loop), ts.map(([n, , t]) => `${n}: ${t.loopDetail || t.missingEg}`).join('; '));
  check('park: three clear above every rail; every raised rail on a solid support', all((t) => t.headroom && t.supported));
  check('park: every powered rail on a block of redstone; the lift hill powered all the way up', all((t) => t.powered && t.liftRails >= 7), ts.map(([n, , t]) => `${n}: ${t.liftRails}`).join(', '));
  check('park: the station rail a brake (an unpowered powered rail), a button on a post beside it to send a cart off', all((t) => t.station));
  check('park: the Ferris wheel (its rim, eight cabins, the axle) and the stalls with their signs', all((t) => t.wheel && t.stalls));
  check('park: two minecarts, one in the station; the station, every stall and the wheel reached on foot from the gate', all((t) => t.carts === 2 && Object.values(t.reach).every(Boolean)), ts.map(([n, , t]) => `${n}: ${JSON.stringify(t.reach)}`).join('; '));
  {
    const r = cities[1][1];
    const pt = buildMobStructures(r.spawns, { seed: 1 }).filter((t) => t.name.startsWith('m_park_'));
    const carts = pt.flatMap((t) => decodeNbt(t.data).root.structure.entities).filter((e) => e.identifier === 'minecraft:minecart');
    check('park: both minecarts in the park\'s own structure', carts.length === 2);
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const bad = new Set();
    for (const st of buildStructures(r.world, {})) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
    }
    check('park: every block one of Bedrock\'s own states (rails, powered rails, the brake, redstone, the wheel)', bad.size === 0, [...bad].slice(0, 4).join(', '));
  }
}
