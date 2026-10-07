// tools/checks/2zzc-services.js — the hospital and the fire station (services.js).
//
// Built into the world and looked at there. The hospital: every bed whole (both
// halves), the pharmacy's brewing stands, the red cross over the door, the
// helipad's H on the roof (a light set into it by the lighting left a hole: the
// lighting keeps off it now), every room reached from the street. The fire
// station: both engines whole, the bell, the pole unbroken from the bays through
// the floor, every ladder rung there, the tower's top a place to step off onto
// inside its railing, the bays and the tower reached from the street; fifteen
// across and twelve. Every block either writes one of Bedrock's own states.

import { readFileSync } from 'node:fs';

export const id = '2zzc';
export const label = '2zzc. the hospital and the fire station';

let MATERIALS;

function inspectServices(r) {
  const w = r.world, out = {};
  const blk = (x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block.replace('minecraft:', ''); };
  const solid = (b) => !['air', 'water', 'lantern', 'short_grass'].includes(b) && !/sign|carpet|rail|ladder|end_rod|bed|bell|fence/.test(b);
  const walkFrom = (L, lift) => {
    const [dx0, dy0, dz0] = [L.door[0], L.door[1] + lift, L.door[2]];
    const stand = (x, y, z) => { const b = blk(x, y, z), a = blk(x, y + 1, z), u = blk(x, y - 1, z); return (b === 'air' || /sign|lantern/.test(b)) && (a === 'air' || /lantern/.test(a)) && (solid(u) || /bed/.test(u)); };
    const walk = new Set([dx0 + ',' + dy0 + ',' + dz0]), q = [[dx0, dy0, dz0]];
    while (q.length && walk.size < 40000) { const [a, b, c] = q.pop(); for (const [ddx, ddz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const x = a + ddx, y = b + dy, z = c + ddz, k = x + ',' + y + ',' + z; if (walk.has(k) || !stand(x, y, z)) continue; walk.add(k); q.push([x, y, z]); } }
    return walk;
  };
  const liftOf = (L, floorBlock, u, v) => { const [x, z] = L.frame.at(u, v); for (let d = -3; d <= 6; d++) if (blk(x, L.door[1] - 1 + d, z) === floorBlock && blk(x, L.door[1] + d, z) === 'air') return d; return 0; };
  const H = r.landmarks.find((L) => L.kind === 'hospital');
  if (H) {
    const lift = liftOf(H, 'light_gray_concrete', 7, 3), fr = H.frame;
    const o = { lift };
    o.beds = H.beds.every((b) => blk(b.foot[0], b.foot[1] + lift, b.foot[2]) === 'bed' && blk(b.head[0], b.head[1] + lift, b.head[2]) === 'bed') ? H.beds.length : 'BROKEN';
    o.stands = H.stands.every(([x, z]) => { const [fx, fz] = [x, z]; return blk(fx, H.door[1] + lift, fz) === 'brewing_stand'; }) ? H.stands.length : 'MISSING';
    o.cross = H.cross.every(([x, z, y]) => blk(x, y + lift, z) === 'red_concrete');
    o.helipad = H.helipad.every(([x, z]) => blk(x, fr.ROOF + lift, z) === 'yellow_concrete') ? H.helipad.length : 'MISSING';
    const walk = walkFrom(H, lift), reach = (u, v) => { const [x, z] = fr.at(u, v); return walk.has(x + ',' + (H.door[1] + lift) + ',' + z); };
    o.rooms = { reception: reach(7, 4), pharmacy: reach(4, 10), emergency: reach(10, 11), ward: reach(7, 18) };
    out.hospital = o;
  }
  const F = r.landmarks.find((L) => L.kind === 'firestation');
  if (F) {
    const fr = F.frame, lift = liftOf(F, 'light_gray_concrete', 7, 11);
    const o = { lift };
    o.engines = F.engines.every((bl) => bl.every(([x, z, y]) => blk(x, y + lift, z) !== 'air')) ? F.engines.length : 'BROKEN';
    o.bell = blk(F.bell[0], F.bell[2] + lift, F.bell[1]) === 'bell';   // (bell is [x, z, y])
    o.pole = F.pole.every(([x, z, y]) => blk(x, y + lift, z) === 'end_rod');
    const ladderOk = (list) => list.every(([x, z, y]) => blk(x, y + lift, z) === 'ladder');
    o.ladders = ladderOk(F.ladders) && ladderOk(F.towerLadder);
    o.beds = F.beds.every((b) => blk(b.foot[0], b.foot[1] + lift, b.foot[2]) === 'bed' && blk(b.head[0], b.head[1] + lift, b.head[2]) === 'bed') ? F.beds.length : 'BROKEN';
    // the tower's top: off the ladder onto the inner ring, standing room inside the railing
    const [tu, tv] = fr.tower, top = fr.TOP + lift;
    o.towerTop = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([du, dv]) => { const [x, z] = fr.at(tu + du, tv + dv); return solid(blk(x, top, z)) && blk(x, top + 1, z) === 'air' && blk(x, top + 2, z) === 'air'; });
    const walk = walkFrom(F, lift), reach = (u, v) => { const [x, z] = fr.at(u, v); return walk.has(x + ',' + (F.door[1] + lift) + ',' + z); };
    o.wide = F.wide;
    o.rooms = { bay1: reach(fr.bays[0][0] + 1, 1), bay2: reach(fr.bays[1][0] + 1, 1), back: reach(fr.c, 11), tower: reach(fr.tower[0], fr.tower[1] - 1) };
    out.firestation = o;
  }
  return out;
}

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  ({ MATERIALS } = await import('../../engine/materials.js'));
  const { buildStructures } = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const L = { furnish: false, villagers: 0, fish: false };
  const fx = JSON.parse(readFileSync(new URL('./site-1004954.json', import.meta.url), 'utf8'));
  const ground = new Int16Array(Uint8Array.from(Buffer.from(fx.ground, 'base64')).buffer);
  const water = Uint8Array.from(Buffer.from(fx.water, 'base64'));
  const cities = [
    ['flat 256', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7, hospital: true, firestation: true })],
    ['flat 320', generateCity({ ...DEFAULTS, ...L, size: 320, seed: 12345, hospital: true, firestation: true })],
    ["a player's fitted city", generateCity({ ...DEFAULTS, ...fx.settings, ...L, hospital: true, firestation: true, terrain: { ground, water, baseY: fx.baseY } })],
  ];
  check('defaults: no hospital or fire station unless asked', DEFAULTS.hospital === false && DEFAULTS.firestation === false);
  const ts = cities.map(([n, r]) => [n, inspectServices(r)]);
  const hs = ts.filter(([, t]) => t.hospital), fs = ts.filter(([, t]) => t.firestation);
  check('hospital: built when asked, on flat cities and a fitted one', hs.length === cities.length, `${hs.length} of ${cities.length}`);
  check('hospital: every bed whole, the pharmacy\'s brewing stands, the red cross over the door', hs.every(([, t]) => typeof t.hospital.beds === 'number' && t.hospital.beds >= 10 && t.hospital.stands === 3 && t.hospital.cross));
  check('hospital: the helipad\'s H whole on the roof (no light set into it)', hs.every(([, t]) => typeof t.hospital.helipad === 'number'), hs.map(([n, t]) => `${n}: ${t.hospital.helipad}`).join(', '));
  check('hospital: every room reached on foot from the street (reception, pharmacy, emergency, ward)', hs.every(([, t]) => Object.values(t.hospital.rooms).every(Boolean)), hs.map(([n, t]) => `${n}: ${JSON.stringify(t.hospital.rooms)}`).join('; '));
  check('fire station: built when asked, fifteen across and twelve (on a narrower lot)', fs.length === cities.length && new Set(fs.map(([, t]) => t.firestation.wide)).size === 2, fs.map(([n, t]) => `${n}: ${t.firestation.wide}`).join(', '));
  check('fire station: both engines whole, the bell, the bunks', fs.every(([, t]) => t.firestation.engines === 2 && t.firestation.bell && t.firestation.beds === 6));
  check('fire station: the pole unbroken through the floor, every ladder rung there, the tower\'s top to step off onto', fs.every(([, t]) => t.firestation.pole && t.firestation.ladders && t.firestation.towerTop));
  check('fire station: both bays and the tower reached on foot from the street', fs.every(([, t]) => Object.values(t.firestation.rooms).every(Boolean)), fs.map(([n, t]) => `${n}: ${JSON.stringify(t.firestation.rooms)}`).join('; '));
  {
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const bad = new Set();
    for (const st of buildStructures(cities[0][1].world, {})) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
    }
    check('hospital and fire station: every block one of Bedrock\'s own states (ladders, end rods, beds, lamps)', bad.size === 0, [...bad].slice(0, 4).join(', '));
  }
  note(`fire stations: ${fs.map(([n, t]) => `${n} ${t.firestation.wide} wide`).join(', ')}`);
}
