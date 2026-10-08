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
  check('factory: a cart on the detector rail lights the lamp under it and the one beside (simulated), on a fitted city too', all((t) => t.siding));
  check('factory: the assembly line\'s water a level deeper each block from its source, held in, over a hopper facing into the chest; four workstations', all((t) => t.line.stepping && t.line.held && t.line.hopper && t.line.stations === 4));
  check('factory: both chimneys smoking; the control room, the line and the siding reached on foot through the doors', all((t) => t.chimneys && Object.values(t.reach).every(Boolean)), ts.map(([n, , t]) => `${n}: ${JSON.stringify(t.reach)}`).join('; '));
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
