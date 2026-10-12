// tools/checks/2zzn-themepark.js — the theme park (themepark.js).
//
// Built into the world and looked at there: beside the city, outside its square, on
// the side opposite the airport when there is one (and never on it); its road through
// the wall from the city's own street. The roller coaster followed as a cart follows
// it (railgraph.js): one closed loop, every rail joined to two others; its lift hill
// twenty and more high; every climbing rail powered, a block of redstone under it;
// the station rail a brake with a button on a post beside it; a block under every
// raised rail, three clear over every rail; the carts on rails. Walked on foot from
// the street through the gate to the coaster's button, the big wheel, the foot of the
// drop tower's ladder, the carousel; up the ladder onto the tower's platform; out of
// its pool by the doorway and the steps. The pool three deep, its water held in, the
// shaft open over it from the platform down. The big wheel whole. Every piece of open
// ground lit. In the pack, its ground founded and cleared like the city's own; a goto
// to its gate. Not on a fitted city; every block one of Bedrock's own states.

import { readFileSync } from 'node:fs';

export const id = '2zzn';
export const label = '2zzn. the theme park';

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { railsOf, trackFrom, railLinks, RISE } = await import('../../engine/railgraph.js');
  const { buildStructures, cityInside, foundationFill, functionFiles, tileList } = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const L = { furnish: false, villagers: 0, fish: false, themepark: true };
  check('defaults: no theme park unless asked', DEFAULTS.themepark === false);
  const cities = [
    ['with the airport', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7, airport: true })],
    ['flat 320', generateCity({ ...DEFAULTS, ...L, size: 320, seed: 99, hills: 0 })],
    ['a square city with the airport', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7, outline: 'square', airport: true })],
  ];
  const inspect = (r) => {
    const T = r.landmarks.find((q) => q.kind === 'themepark');
    if (!T) return { built: false };
    const A = r.landmarks.find((q) => q.kind === 'airport');
    const w = r.world, F = T.frame, YA = T.ground, { W, D } = r.plan;
    const blk = (x, y, z) => { const i = w.get(x, y, z); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
    const out = { built: true, side: T.side, bad: [] };
    out.outside = T.lot.x1 < 0 || T.lot.x0 >= W || T.lot.z1 < 0 || T.lot.z0 >= D;
    const OPP = { north: 'south', south: 'north', west: 'east', east: 'west' };
    out.awayFromAirport = !A || (T.side === OPP[A.side] && !(T.lot.x0 <= A.lot.x1 && A.lot.x0 <= T.lot.x1 && T.lot.z0 <= A.lot.z1 && A.lot.z0 <= T.lot.z1));
    // the coaster as a cart follows it
    const rails = railsOf(w, MATERIALS);
    const C = T.coaster, keys = C.rails.map((p) => p.at.join(','));
    const track = trackFrom(rails, C.station.rail.join(','));
    out.loop = keys.every((k) => track.has(k)) && keys.every((k) => railLinks(rails, k).length === 2);
    out.lift = Math.max(...C.rails.map((p) => p.at[1] - YA));
    for (let i = 0; i < C.rails.length; i++) {
      const p = C.rails[i], q = C.rails[(i + 1) % C.rails.length], [x, y, z] = p.at;
      const b = blk(x, y, z);
      if (q.at[1] > y) {                                    // a climb: powered, redstone under
        if (b !== 'golden_rail' || blk(x, y - 1, z) !== 'redstone_block') { out.bad.push(`climb at ${i}: ${b} on ${blk(x, y - 1, z)}`); }
      }
      if (y > YA + 1 && blk(x, y - 1, z) === 'air') out.bad.push(`rail ${i} on air`);
      if (![1, 2, 3].every((d) => blk(x, y + d, z) === 'air')) out.bad.push(`rail ${i}: no room over it (${blk(x, y + 1, z)}, ${blk(x, y + 2, z)}, ${blk(x, y + 3, z)})`);
    }
    const st = C.station;
    out.station = blk(...st.rail) === 'golden_rail' && /button/.test(blk(...st.button)) && Math.abs(st.button[0] - st.rail[0]) + Math.abs(st.button[2] - st.rail[2]) === 1;
    out.carts = C.carts.every((c) => /rail/.test(blk(...c)));
    // on foot: from the street, two tall, a step of one, up a ladder
    const pass = (b) => b === 'air' || /sign|button|flower|tulip|lily|poppy|dandelion|short_grass/.test(b);
    const ladder = (b) => b === 'ladder';
    const floor = (b) => b !== 'air' && !pass(b) && !/fence|bars|water|lava/.test(b);
    const wet = (b) => b === 'water';
    const stand = (x, y, z) => (pass(blk(x, y, z)) || ladder(blk(x, y, z)) || /rail/.test(blk(x, y, z))) && (pass(blk(x, y + 1, z)) || ladder(blk(x, y + 1, z))) && (floor(blk(x, y - 1, z)) || /rail/.test(blk(x, y, z)) || ladder(blk(x, y, z)) || ladder(blk(x, y - 1, z)));
    const key = (p) => p.join(',');
    const [sx, sy, sz] = T.street;
    let s0 = null; for (let d = -2; d <= 4 && !s0; d++) if (stand(sx, sy + d, sz)) s0 = [sx, sy + d, sz];
    const seen = new Set(s0 ? [key(s0)] : []), q = s0 ? [s0] : [];
    const lo = { x0: Math.min(T.lot.x0, T.roadRect.x0) - 4, x1: Math.max(T.lot.x1, T.roadRect.x1) + 4, z0: Math.min(T.lot.z0, T.roadRect.z0) - 4, z1: Math.max(T.lot.z1, T.roadRect.z1) + 4 };
    while (q.length && seen.size < 300000) {
      const [a, b, c] = q.pop();
      const moves = [];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) moves.push([a + dx, b + dy, c + dz]);
      if (ladder(blk(a, b, c)) || ladder(blk(a, b - 1, c))) moves.push([a, b + 1, c], [a, b - 1, c]);
      for (const n of moves) {
        if (seen.has(key(n)) || n[0] < lo.x0 || n[0] > lo.x1 || n[2] < lo.z0 || n[2] > lo.z1 || !stand(...n)) continue;
        if (n[1] > b && !ladder(blk(a, b, c)) && !pass(blk(a, b + 2, c)) && !ladder(blk(a, b + 2, c))) continue;
        seen.add(key(n)); q.push(n);
      }
    }
    const near = (p, r = 1) => [...seen].some((k) => { const [x, y, z] = k.split(',').map(Number); return Math.abs(x - p[0]) + Math.abs(z - p[2]) <= r && Math.abs(y - p[1]) <= 1; });
    out.walk = { start: !!s0, button: near(T.coaster.station.button, 1), wheel: near(T.wheel.legs[0][0], 3), ladderFoot: near(T.tower.ladder[0], 1),
      carousel: near(T.carousel.centre, 5), towerTop: seen.has(key(T.tower.top)) || near(T.tower.top, 1) };
    // the pool: three deep, held in; the shaft open over it; the way out
    const W2 = new Set(T.tower.water.map(key));
    let leaks = 0;
    for (const p of T.tower.water) { if (blk(...p) !== 'water') leaks++; for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) { const n = [p[0] + dx, p[1] + dy, p[2] + dz]; if (!W2.has(key(n)) && !floor(blk(...n))) leaks++; } }
    const depth = new Set(T.tower.water.map((p) => p[1])).size;
    const shaftOpen = T.tower.water.filter((p) => p[1] === YA + 3).every(([x, , z]) => { for (let y = YA + 4; y <= YA + T.tower.height; y++) if (blk(x, y, z) !== 'air') return false; return true; });
    const [dx0, dy0, dz0] = T.tower.door;
    const exit = blk(dx0, dy0, dz0) === 'air' && blk(dx0, dy0 + 1, dz0) === 'air' && floor(blk(dx0, dy0 - 1, dz0)) && T.tower.steps.every((p) => /stairs/.test(blk(...p)));
    out.pool = { leaks, depth, shaftOpen, exit };
    // the wheel whole
    out.wheel = T.wheel.rim.every((p) => blk(...p) !== 'air') && T.wheel.cabins.length === 12 && T.wheel.cabins.every((c) => c.every((p) => blk(...p) !== 'air'));
    // the coaster's turns and where it passes under itself
    const rs = C.rails;
    out.turns = rs.filter((p, i) => { const a = rs[(i - 1 + rs.length) % rs.length].at, b = p.at, c = rs[(i + 1) % rs.length].at; return (b[0] - a[0]) * (c[2] - b[2]) - (b[2] - a[2]) * (c[0] - b[0]) !== 0; }).length;
    const colsH = new Map(); for (const p of rs) { const k = p.at[0] + ',' + p.at[2]; colsH.set(k, (colsH.get(k) || 0) + 1); }
    out.under = [...colsH.values()].filter((n) => n > 1).length;
    // lit
    const lights = T.lamps;
    let dark = 0;
    for (let v = 1; v < F.VD - 1; v++) for (let u = F.U0 + 1; u < F.U1; u++) {
      const [x, z] = F.at(u, v), b = blk(x, YA, z);
      if (b !== 'grass_block' && b !== 'gravel') continue;
      if (blk(x, YA + 1, z) !== 'air') continue;
      if (!lights.some(([a, bb, c]) => Math.abs(a - x) + Math.abs(bb - YA - 1) + Math.abs(c - z) <= 12)) dark++;
    }
    out.dark = dark;
    const inside = cityInside(w), fill = foundationFill(w);
    const [mx, mz] = F.at(0, 40);
    out.pack = !!inside && inside(mx, mz) && inside(T.road[0][0], T.road[0][2]) && fill(mx, YA - 3, mz) !== -1 && !inside(...F.at(0, F.VD + 5));
    out.place = r.places.find((P) => P.kind === 'themepark');
    void RISE;
    return out;
  };
  const ts = cities.map(([n, r]) => [n, r, inspect(r)]);
  const all = (f) => ts.every(([, , t]) => t.built && f(t));
  check('theme park: built beside the city (outside its square), opposite the airport where there is one', all((t) => t.outside && t.awayFromAirport), ts.map(([n, , t]) => `${n}: ${t.built ? t.side : 'none'}`).join(', '));
  check('theme park: the coaster one closed loop as a cart follows it, every rail joined to two', all((t) => t.loop));
  check('theme park: the coaster\'s lift hill twenty and more high', all((t) => t.lift >= 20), ts.map(([n, , t]) => `${n}: ${t.lift}`).join(', '));
  check('theme park: every climb powered on redstone, every raised rail on a block, three clear over every rail', all((t) => t.bad.length === 0), ts.map(([n, , t]) => (t.bad || []).slice(0, 3).join('; ')).filter(Boolean).join(' | '));
  check('theme park: the station a brake rail with its button beside it; the carts on rails', all((t) => t.station && t.carts));
  check('theme park: walked from the city\'s street through the gate to the coaster\'s button, the big wheel, the drop tower\'s ladder, the carousel', all((t) => Object.entries(t.walk).filter(([k]) => k !== 'towerTop').every(([, v]) => v)), ts.map(([n, , t]) => `${n}: ${JSON.stringify(t.walk)}`).join(' | '));
  check('theme park: up the drop tower\'s ladder onto its platform', all((t) => t.walk.towerTop));
  check('theme park: the drop tower\'s pool three deep and held in, the shaft open over it, a way out over the water and down', all((t) => t.pool.leaks === 0 && t.pool.depth === 3 && t.pool.shaftOpen && t.pool.exit), ts.map(([n, , t]) => `${n}: ${JSON.stringify(t.pool)}`).join(' | '));
  check('theme park: the big wheel whole, twelve cabins', all((t) => t.wheel));
  check('theme park: the coaster winds round the park (a dozen turns and more) and passes under itself (the helix)', all((t) => t.turns >= 12 && t.under >= 10), ts.map(([n, , t]) => `${n}: ${t.turns} turns, ${t.under} under`).join(', '));
  {
    // the wheel turns: forty-eight frames, a whole turn, the first the wheel as built, each a step round, the
    // last back to the first a step like any other; a clock of command blocks, in order,
    // loading them; in the pack the frames as structures and the clock naming them
    const r = cities[1][1], T = r.landmarks.find((q) => q.kind === 'themepark'), w = r.world;
    const { ferrisWheel } = await import('../../engine/park.js');
    const { WHEEL_FRAMES, WHEEL_PERIOD, WHEEL_COLOURS } = await import('../../engine/themepark.js');
    const anims = (w.anims || []).filter((a) => /^wheel_f\d+$/.test(a.name));
    const sig = (cells) => [...cells.entries()].filter(([k]) => Number(k.split(',')[1]) >= anims[0].box.y0).map(([k, id]) => k + '=' + id).sort().join(';');
    const asBuilt = new Map(); for (const k of anims[0].cells.keys()) { const [x, y, z] = k.split(',').map(Number); asBuilt.set(k, w.get(x, y, z)); }
    const F = T.frame, wu = -26, wv = 44, wr = 12, wy = T.ground + wr + 3;
    // (frame to frame a step round: as many blocks changed from the last frame back to the
    // first as between any two; no jump where the turn starts again)
    const diff = (p, q) => { let n = 0; const keys = new Set([...p.keys(), ...q.keys()]); for (const k of keys) if (p.get(k) !== q.get(k)) n++; return n; };
    const steps = anims.map((a, f) => diff(a.cells, anims[(f + 1) % anims.length].cells));
    const distinct = new Set(anims.map((a) => sig(a.cells))).size;
    const whole = Math.abs(WHEEL_FRAMES * (WHEEL_PERIOD / WHEEL_FRAMES) - 2 * Math.PI) < 1e-9;
    const frames = anims.length === WHEEL_FRAMES && sig(anims[0].cells) === sig(asBuilt) && whole
      && steps[steps.length - 1] <= Math.max(...steps.slice(0, -1)) && Math.min(...steps) > 0;
    const clock = T.wheel.turning.clock;
    const blk = (p) => MATERIALS.def(w.get(...p)).block.replace('minecraft:', '');
    const inLine = clock.every((c, k) => k === 0 || Math.abs(c.at[0] - clock[k - 1].at[0]) + Math.abs(c.at[2] - clock[k - 1].at[2]) === 1 && c.at[1] === clock[0].at[1]);
    const kinds = clock.map((c) => blk(c.at)).join(',');
    const wantKinds = ['repeating_command_block', ...Array(WHEEL_FRAMES + 1).fill('chain_command_block')].join(',');
    const data0 = w.getData(...clock[0].at);
    const lands = clock.slice(2).every((c, f) => { const m = c.cmd.match(/structure load \{ns\}:wheel_f(\d+) ~(-?\d+) ~(-?\d+) ~(-?\d+)$/); return !!m && Number(m[1]) === f && c.at[0] + Number(m[2]) === anims[0].box.x0 && c.at[1] + Number(m[3]) === anims[0].box.y0 && c.at[2] + Number(m[4]) === anims[0].box.z0; });
    check('theme park: the big wheel turns: forty-eight frames, a whole turn, the first as built, each a step round, no jump from the last back to the first', frames, `${anims.length} frames, ${distinct} distinct, steps ${Math.min(...steps)}..${Math.max(...steps)}, last ${steps[steps.length - 1]}`);
    check('theme park: the wheel\'s clock: a repeating block, then chain blocks in a line, silent; each frame loaded into its own place', inLine && kinds === wantKinds
      && data0.tags.TrackOutput.v === 0 && data0.tags.TickDelay.v >= 10 && lands, kinds);
    const { buildAnimStructures, exportPack } = await import('../../engine/export.js');
    const { deflateRaw } = ctx;
    const pack = await exportPack(w, { namespace: 'chk', spawns: r.spawns, places: r.places, deflateRaw });
    const named = pack.structures.filter((st) => /^wheel_f\d+$/.test(st.name));
    const box = anims[0].box, vol = (box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1) * (box.z1 - box.z0 + 1);
    const full = buildAnimStructures(w, {}).every((st) => { const root = decodeNbt(st.data).root; return root.structure.block_indices[0].every((i) => i >= 0) && root.structure.block_indices[0].length === vol; });
    let cmdsNamed = 0;
    for (const st of pack.structures) { const pd = decodeNbt(st.data).root.structure.palette.default.block_position_data || {}; for (const v of Object.values(pd)) { const c = v.block_entity_data && v.block_entity_data.Command; if (c && /structure load chk:wheel_f\d+ /.test(c)) cmdsNamed++; } }
    const bc = pack.functions.find((f) => f.fn === 'chk/build_centered');
    check('theme park: in the pack, the forty-eight frames (every cell written, air between), the clock naming them by the pack\'s own name, build making its counter', named.length === WHEEL_FRAMES && full && cmdsNamed === WHEEL_FRAMES && bc.text.includes('scoreboard objectives add polis_fun dummy'), `${named.length} frames, ${cmdsNamed} named, full ${full}`);
  }
  check('theme park: every piece of its open ground lit', all((t) => t.dark === 0), ts.map(([n, , t]) => `${n}: ${t.dark}`).join(', '));
  check('theme park: in the pack, its ground founded and cleared like the city\'s own (and no more)', all((t) => t.pack));
  {
    const r = cities[1][1];
    const opts = { namespace: 'chk', places: r.places, spawns: r.spawns, centre: r.world.centre, world: r.world };
    const go = functionFiles(tileList(r.world, opts), r.world, opts).find((f) => f.fn === 'chk/goto_themepark');
    check('theme park: a place in Find a landmark, a goto to its gate', !!ts[1][2].place && !!go);
  }
  {
    const fx = JSON.parse(readFileSync(new URL('./site-1004954.json', import.meta.url), 'utf8'));
    const ground = new Int16Array(Uint8Array.from(Buffer.from(fx.ground, 'base64')).buffer);
    const water = Uint8Array.from(Buffer.from(fx.water, 'base64'));
    const f = generateCity({ ...DEFAULTS, ...fx.settings, ...L, terrain: { ground, water, baseY: fx.baseY } });
    check('theme park: not on a fitted city, and the summary says why', !f.landmarks.some((q) => q.kind === 'themepark') && /fitted/.test(f.stats.themeparkMissing || ''));
  }
  {
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const bad = new Set();
    for (const st of buildStructures(cities[1][1].world, { fillAir: true })) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
    }
    check('theme park: every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
  }
  note(`theme park: ${ts.map(([n, , t]) => t.built ? `${n} to the ${t.side}, lift ${t.lift}` : `${n} none`).join('; ')}`);
}
