// tools/checks/2zze-factory.js — the factory (factory.js): working redstone.
//
// Built into the world and run there by a small redstone simulator, one source on
// at a time: a lever powers the block it is on, a pressure plate or a detector rail
// the block under it; dust takes power next to a source or a strongly powered
// block at fifteen and loses one a block along its line, and powers the block
// under it; a lamp or a door works next to a source or a strongly powered block,
// or under powered dust. Then: each panel lever lights its own lamp and no other,
// the master switch the whole bench, every pressure plate opens a door, a cart on
// the detector lights both its lamps. The assembly line's water a level deeper
// each block from its source, held in, over a hopper facing into the chest; the
// chimneys smoking; every part reached on foot through the doors. On wide, narrow
// and fitted lots (the siding laid again after the transit's own pass, which on a
// fitted city cleared it). Every block one of Bedrock's own states.

import { readFileSync } from 'node:fs';

export const id = '2zze';
export const label = '2zze. the factory';

let MATERIALS;

function inspectFactory(r) {
  const F = r.landmarks.find((L) => L.kind === 'factory');
  if (!F) return { built: false };
  const w = r.world, fr = F.frame;
  const def = (x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id); };
  const blk = (x, y, z) => { const d = def(x, y, z); return d ? d.block.replace('minecraft:', '') : 'air'; };
  const st = (x, y, z, k) => { const d = def(x, y, z); const v = d && d.states && d.states[k]; return v === undefined ? undefined : (v.value ?? v); };
  const [hx, hz] = fr.at(fr.mid, 5); let lift = 0; for (let d = -3; d <= 8; d++) if (blk(hx, F.door[1] - 1 + d, hz) === 'smooth_stone' && blk(hx, F.door[1] + d, hz) === 'air') { lift = d; break; }
  const L = ([x, y, z]) => [x, y + lift, z];
  const out = { built: true, lift };
  // ---- the redstone simulator: one source on at a time --------------------------------
  const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const key = (p) => p.join(',');
  const SOLID = (b) => !['air', 'water', 'flowing_water'].includes(b) && !/lever|redstone_wire|pressure_plate|rail|door|torch|lantern|sign/.test(b);
  const leverBlock = ([x, y, z]) => { const d = st(x, y, z, 'lever_direction'); if (/^up/.test(d)) return [x, y - 1, z]; if (/^down/.test(d)) return [x, y + 1, z]; return { east: [x - 1, y, z], west: [x + 1, y, z], south: [x, y, z - 1], north: [x, y, z + 1] }[d]; };
  const simulate = (source) => {
    const [x, y, z] = source, b = blk(x, y, z);
    const strong = new Set();
    const sources = new Set([key(source)]);
    if (/lever/.test(b)) { const a = leverBlock(source); if (SOLID(blk(...a))) strong.add(key(a)); }
    else { const under = [x, y - 1, z]; if (SOLID(blk(...under))) strong.add(key(under)); }
    // dust: next to the source or a strongly powered block, 15, falling a step a block along its line
    const dust = new Map(), q = [];
    const powerers = [source, ...[...strong].map((k) => k.split(',').map(Number))];
    for (const p of powerers) for (const [a, bb, c] of N6) { const n = [p[0] + a, p[1] + bb, p[2] + c]; if (blk(...n) === 'redstone_wire' && !dust.has(key(n))) { dust.set(key(n), 15); q.push(n); } }
    while (q.length) { const p = q.shift(), s = dust.get(key(p)); if (s <= 1) continue; for (const [a, , c] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) { const n = [p[0] + a, p[1], p[2] + c]; if (blk(...n) === 'redstone_wire' && !dust.has(key(n))) { dust.set(key(n), s - 1); q.push(n); } } }
    const weak = new Set([...dust.keys()].map((k) => { const [a, bb, c] = k.split(',').map(Number); return key([a, bb - 1, c]); }));
    // a lamp or a door: next to the source or a strongly powered block, or a block dust powers (the one under it)
    const powered = (p) => sources.has(key(p)) || N6.some(([a, bb, c]) => { const n = key([p[0] + a, p[1] + bb, p[2] + c]); return sources.has(n) || strong.has(n); }) || weak.has(key(p));
    return { powered, dust };
  };
  // control room: each panel lever its own lamp, no other
  out.panel = F.panel.every((p, i) => { const s = simulate(L(p.lever)); return blk(...L(p.lever)) === 'lever' && blk(...L(p.lamp)) === 'redstone_lamp' && s.powered(L(p.lamp)) && F.panel.every((q, j) => j === i || !s.powered(L(q.lamp))); });
  // the master switch: the whole bench lit
  { const s = simulate(L(F.master.lever)); out.master = F.bench.every((b) => blk(...L(b.lamp)) === 'redstone_lamp' && blk(...L(b.dust)) === 'redstone_wire' && s.powered(L(b.lamp))); out.benchSignalMin = Math.min(...[...s.dust.values()]); }
  // the doors: every plate opens a door beside it
  out.doors = F.plates.every((p) => { const s = simulate(L(p)); return blk(...L(p)) === 'stone_pressure_plate' && F.doors.some((d) => blk(...L(d)) === 'iron_door' && s.powered(L(d))); });
  // the siding: a cart on the detector lights its lamp underneath and the one beside
  // the shuttle: at both ends a solid stop, and powered rails before it on blocks of redstone
  out.shuttle = F.siding.stops.length === 2 && F.siding.stops.every((p) => SOLID(blk(...L(p))))
    && F.siding.boosters.length === 4 && F.siding.boosters.every((p) => blk(...L(p)) === 'golden_rail' && blk(L(p)[0], L(p)[1] - 1, L(p)[2]) === 'redstone_block');
  // the doors: the facing written as every building's is (a quarter turn on: north
  // is "east"), out to the street; the same facing both; the hinges opposite, on the outer edges
  {
    const CARD = { north: 'east', south: 'west', east: 'south', west: 'north' };
    const [d0, d1] = F.doors.map(L), out0 = st(...d0, 'minecraft:cardinal_direction'), out1 = st(...d1, 'minecraft:cardinal_direction');
    const [bx, bz] = fr.at(fr.mid, 0), [fx, fz] = fr.at(fr.mid, 2), street = bz < fz ? 'north' : bz > fz ? 'south' : bx < fx ? 'west' : 'east';
    const CW = { north: [1, 0], east: [0, 1], south: [-1, 0], west: [0, -1] }[street];
    const along = (d1[0] - d0[0]) * CW[0] + (d1[2] - d0[2]) * CW[1];
    const h0 = st(...d0, 'door_hinge_bit'), h1 = st(...d1, 'door_hinge_bit');
    out.doorFacing = out0 === CARD[street] && out1 === CARD[street] && h0 !== h1 && (along > 0 ? h1 === 1 : h0 === 1);
  }
  { const s = simulate(L(F.siding.detector)); out.siding = blk(...L(F.siding.detector)) === 'detector_rail' && s.powered(L(F.siding.under)) && s.powered(L(F.siding.beside)) && blk(...L(F.siding.under)) === 'redstone_lamp' && blk(...L(F.siding.beside)) === 'redstone_lamp'; }
  // the assembly line: the water a step deeper each block from its source, held in, over the hopper into the chest
  {
    const depths = F.line.map((p) => [blk(...L(p)), st(...L(p), 'liquid_depth')]);
    const stepping = depths.every(([b, d], i) => (i === 0 ? b === 'water' && d === 0 : b === 'flowing_water' && d === i));
    const inLine = new Set(F.line.map((p) => key(L(p))));
    const held = F.line.every((p) => [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]].every(([a, b, c]) => { const n = [L(p)[0] + a, L(p)[1] + b, L(p)[2] + c]; return inLine.has(key(n)) || SOLID(blk(...n)) || blk(...n) === 'hopper'; }));
    const [hx2, hy2, hz2] = L(F.hopper), f = st(hx2, hy2, hz2, 'facing_direction');
    const to = { 2: [0, 0, -1], 3: [0, 0, 1], 4: [-1, 0, 0], 5: [1, 0, 0] }[f] || [0, 0, 0];
    const intoChest = blk(hx2 + to[0], hy2 + to[1], hz2 + to[2]) === 'chest' && key([hx2 + to[0], hy2 + to[1], hz2 + to[2]]) === key(L(F.chest));
    const underEnd = key([hx2, hy2 + 1, hz2]) === key(L(F.line[F.line.length - 1]));
    out.line = { stepping, held, hopper: blk(hx2, hy2, hz2) === 'hopper' && underEnd && intoChest, stations: F.stations.filter((p) => blk(...L(p)) !== 'air').length };
  }
  out.chimneys = F.chimneys.every((p) => blk(...L(p)) === 'campfire');
  // on foot from the street: in through the doors (plates open them), to every part of it
  {
    const pass = (b) => b === 'air' || /sign|lantern|pressure_plate|iron_door|redstone_wire|rail|lever/.test(b);
    const stand = (x, y, z) => pass(blk(x, y, z)) && pass(blk(x, y + 1, z)) && SOLID(blk(x, y - 1, z)) ;
    const s0 = [F.door[0], F.door[1] + lift, F.door[2]], walk = new Set([key(s0)]), q = [s0];
    while (q.length && walk.size < 30000) { const [a, b, c] = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const n = [a + dx, b + dy, c + dz]; if (walk.has(key(n)) || !stand(...n)) continue; walk.add(key(n)); q.push(n); } }
    const reach = (u, v) => { const [x, z] = fr.at(u, v); return walk.has(key([x, F.door[1] + lift, z])); };
    out.wide = F.wide;
    out.reach = { controlRoom: reach(2, fr.FRONT + 4), line: reach(fr.LU + 3, fr.L0 + 2), siding: reach(fr.TU - 1, fr.DET) };
  }
  return out;
}
function inspectWorkshop(r) {
  const K = r.landmarks.find((L) => L.kind === 'workshop'), F = r.landmarks.find((L) => L.kind === 'factory');
  if (!K) return { built: false, factory: !!F };
  const w = r.world, fr = K.frame;
  const def = (x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id); };
  const blk = (x, y, z) => { const d = def(x, y, z); return d ? d.block.replace('minecraft:', '') : 'air'; };
  const st = (x, y, z, k) => { const d = def(x, y, z); const v = d && d.states && d.states[k]; return v === undefined ? undefined : (v.value ?? v); };
  const [hx, hz] = fr.at(2, 8); let lift = 0; for (let d = -3; d <= 8; d++) if (blk(hx, K.door[1] - 1 + d, hz) === 'smooth_stone' && blk(hx, K.door[1] + d, hz) === 'air') { lift = d; break; }
  const L = ([x, y, z]) => [x, y + lift, z];
  const key = (p) => p.join(','), N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const SOLID = (b) => !['air', 'water'].includes(b) && !/lever|button|redstone_wire|pressure_plate|rail|door|torch|lantern|sign|daylight/.test(b);
  // one source on: a lever or button powers the block it is on (here: under it); a
  // sensor is a source; a mechanism works beside a source or a strongly powered block
  const simulate = (src) => {
    const strong = new Set(), under = [src[0], src[1] - 1, src[2]];
    if (SOLID(blk(...under))) strong.add(key(under));
    return (p) => N6.some(([a, b, c]) => { const n = key([p[0] + a, p[1] + b, p[2] + c]); return n === key(src) || strong.has(n); }) || strong.has(key(p));
  };
  const out = { built: true, lift };
  out.smelters = K.smelters.every((s) => blk(...L(s.out)) === 'chest' && blk(...L(s.down)) === 'hopper' && st(...L(s.down), 'facing_direction') === 0
    && /furnace|smoker/.test(blk(...L(s.furnace))) && blk(...L(s.feed)) === 'hopper' && st(...L(s.feed), 'facing_direction') === 0 && blk(...L(s.input)) === 'chest'
    && blk(L(s.input)[0], L(s.input)[1] + 1, L(s.input)[2]) === 'air');
  out.presses = K.presses.every((p) => { const powered = simulate(L(p.control)); return blk(...L(p.piston)) === 'sticky_piston' && st(...L(p.piston), 'facing_direction') === 1 && blk(...L(p.block)) === 'iron_block'
    && blk(L(p.block)[0], L(p.block)[1] + 1, L(p.block)[2]) === 'air' && (p.button ? blk(...L(p.control)) === 'wooden_button' : blk(...L(p.control)) === 'lever') && powered(L(p.piston)); });
  out.notes = K.notes.every((n) => { const powered = simulate(L(n.button)); return blk(...L(n.note)) === 'noteblock' && blk(...L(n.button)) === 'wooden_button' && powered(L(n.note)) && blk(...L(n.under)) !== 'air'; });
  out.sounds = new Set(K.notes.map((n) => blk(...L(n.under)))).size;
  out.nightLights = K.nightLights.every((n) => blk(...L(n.sensor)) === 'daylight_detector_inverted' && blk(...L(n.lamp)) === 'redstone_lamp' && simulate(L(n.sensor))(L(n.lamp)));
  // on foot: to the smelters, the presses, the bench
  const pass = (b) => b === 'air' || /sign|lantern/.test(b);
  // (kept within the workshop's lot: let out on to the pavement, a walk can wander
  // the city's streets and run out of steps before it goes in)
  const inLot = (x, z) => x >= K.lot.x0 && x <= K.lot.x1 && z >= K.lot.z0 && z <= K.lot.z1;
  const stand = (x, y, z) => inLot(x, z) && pass(blk(x, y, z)) && pass(blk(x, y + 1, z)) && SOLID(blk(x, y - 1, z));
  // (from the doorway itself: the pavement outside it may hold a lamp post or a tree)
  const [dx0, dz0] = fr.at(fr.mid, 0), s0 = [dx0, K.door[1] + lift, dz0], walk = new Set([key(s0)]), q = [s0];
  while (q.length && walk.size < 20000) { const [a, b, c] = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const n = [a + dx, b + dy, c + dz]; if (walk.has(key(n)) || !stand(...n)) continue; walk.add(key(n)); q.push(n); } }
  const reach = (u, v) => { const [x, z] = fr.at(u, v); return walk.has(key([x, K.door[1] + lift, z])); };
  out.reach = { smelters: reach(6, fr.D - 3), presses: reach(6, 7), bench: reach(5, 2) };
  if (F) { const mid = (l) => [(l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2]; out.nearFactory = Math.round(Math.hypot(mid(K.lot)[0] - mid(F.lot)[0], mid(K.lot)[1] - mid(F.lot)[1])); }
  return out;
}

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  ({ MATERIALS } = await import('../../engine/materials.js'));
  const { buildStructures, buildMobStructures } = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const L = { furnish: false, villagers: 0, fish: false, factory: true };
  const fx = JSON.parse(readFileSync(new URL('./site-1004954.json', import.meta.url), 'utf8'));
  const ground = new Int16Array(Uint8Array.from(Buffer.from(fx.ground, 'base64')).buffer);
  const water = Uint8Array.from(Buffer.from(fx.water, 'base64'));
  const cities = [
    ['flat 256', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7 })],
    ['flat 320', generateCity({ ...DEFAULTS, ...L, size: 320, seed: 12345 })],
    ["a player's fitted city", generateCity({ ...DEFAULTS, ...fx.settings, ...L, terrain: { ground, water, baseY: fx.baseY } })],
  ];
  check('defaults: no factory unless asked', DEFAULTS.factory === false);
  // a city of small blocks has few big lots: the factory still found one (it had
  // none at fifteen by twenty-two, and a ticked factory was not built)
  {
    const got = [1, 7, 42].map((seed) => !!generateCity({ ...DEFAULTS, ...L, size: 256, seed, minBlock: 10 }).landmarks.find((Lm) => Lm.kind === 'factory'));
    check('factory: built in cities of small blocks too (256 across, blocks from ten)', got.every(Boolean), got.join(', '));
  }
  const ts = cities.map(([n, r]) => [n, r, inspectFactory(r)]);
  check('factory: built when asked, nineteen across, fifteen or thirteen (on smaller lots), flat and fitted', ts.every(([, , t]) => t.built) && new Set(ts.map(([, , t]) => t.wide)).size >= 2, ts.map(([n, , t]) => `${n}: ${t.wide}`).join(', '));
  const all = (f) => ts.every(([, , t]) => t.built && f(t));
  check('factory: each panel lever lights its own lamp and no other (simulated)', all((t) => t.panel));
  check('factory: the master switch lights the whole bench of lamps along its dust (simulated)', all((t) => t.master && t.benchSignalMin >= 1), ts.map(([, , t]) => t.benchSignalMin).join(', '));
  check('factory: every pressure plate opens an iron door beside it (simulated)', all((t) => t.doors));
  check('factory: the doors faced as every building\'s (the cardinal a quarter turn on: they stood a quarter turn out), the hinges on the outer edges', all((t) => t.doorFacing));
  check('factory: the siding shuttles: a stop at each end, two powered rails before it on blocks of redstone (on a fitted city too)', all((t) => t.shuttle));
  check('factory: a cart on the detector rail lights the lamp under it and the one beside (simulated), on a fitted city too', all((t) => t.siding));
  check('factory: the assembly line\'s water a level deeper each block from its source, held in, over a hopper facing into the chest; four workstations', all((t) => t.line.stepping && t.line.held && t.line.hopper && t.line.stations === 4));
  check('factory: both chimneys smoking; the control room, the line and the siding reached on foot through the doors', all((t) => t.chimneys && Object.values(t.reach).every(Boolean)), ts.map(([n, , t]) => `${n}: ${JSON.stringify(t.reach)}`).join('; '));
  // the workshop, beside the factory: its machines (simulated as the factory's)
  {
    const ws = [...ts.map(([n, r]) => [n, inspectWorkshop(r)]), ['small blocks', inspectWorkshop(generateCity({ ...DEFAULTS, ...L, size: 256, seed: 1, minBlock: 10 }))]];
    check('workshop: built with the factory, near it (flat, fitted, small blocks)', ws.every(([, w]) => w.built && w.nearFactory !== undefined && w.nearFactory <= 100), ws.map(([n, w]) => `${n}: ${w.nearFactory}`).join(', '));
    check('workshop: three smelters, each a chest, a hopper down, the furnace, a hopper down, a chest, room to open the top one', ws.every(([, w]) => w.smelters));
    check('workshop: both presses, a sticky piston up with its iron block, worked by its lever and its button (simulated)', ws.every(([, w]) => w.presses));
    check('workshop: ten note blocks on ten different sounding blocks, each played by its button (simulated)', ws.every(([, w]) => w.notes && w.sounds === 10));
    check('workshop: the night lights, each sensor lighting the lamp under it (simulated); every machine reached on foot', ws.every(([, w]) => w.nightLights && Object.values(w.reach).every(Boolean)), ws.map(([n, w]) => `${n}: ${JSON.stringify(w.reach)}`).join('; '));
  }
  {
    const r = cities[1][1];
    const ft = buildMobStructures(r.spawns, { seed: 1 }).filter((t) => t.name.startsWith('m_factory_'));
    const carts = ft.flatMap((t) => decodeNbt(t.data).root.structure.entities).filter((e) => e.identifier === 'minecraft:minecart' && !e.LinksTag);
    check('factory: an empty minecart on the siding, in the factory\'s own structure', carts.length === 1);
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const bad = new Set();
    for (const st of buildStructures(r.world, {})) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
    }
    check('factory: every block one of Bedrock\'s own states (levers, dust, lamps, iron doors, plates, detector rail, hopper, water)', bad.size === 0, [...bad].slice(0, 4).join(', '));
  }
}
