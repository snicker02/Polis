// tools/checks/2zzg-waterpark.js — the water park (waterpark.js).
//
// Built into the world and looked at there. Held in: every block of water in the
// park (the pools, the bubble column, the waterfall) has water or a solid block on
// its four sides and under it, so none can run out on to the street. The lift: soul
// sand, a bubble column all the way up, the tube closed round it, the platform to
// step out on. The boat slide: blue ice the whole way, each block a face step from
// the last, down at most one, never at a turn, walled with glass, clear above, from
// the platform's height down level with the splash pool. The pools at their depths,
// the waterfall, the chest of boats; the deck reached from the street up the steps.
// On flat, fitted and small-block cities, at both sizes. Every block one of
// Bedrock's own states.

import { readFileSync } from 'node:fs';

export const id = '2zzg';
export const label = '2zzg. the water park';

let MATERIALS;

function inspectWaterPark(r) {
  const P = r.landmarks.find((L) => L.kind === 'waterpark');
  if (!P) return { built: false };
  const w = r.world, fr = P.frame;
  const blk = (x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block.replace('minecraft:', ''); };
  let lift = 0; { const [x, y, z] = P.lift.sand; for (let d = -3; d <= 8; d++) if (blk(x, y + d, z) === 'soul_sand') { lift = d; break; } }
  const L = ([x, y, z]) => [x, y + lift, z];
  const key = (p) => p.join(',');
  const WET = (b) => b === 'water' || b === 'flowing_water' || b === 'bubble_column';
  const SOLID = (b) => b !== 'air' && !WET(b) && !/^(soul_)?lantern$|fence|sign|button|rail|carpet|torch|ladder/.test(b);   // (a sea lantern is solid; a hanging lantern is not)
  const out = { built: true, lift, wide: P.wide };
  // held in: every wet block in the park has water or a solid block on all four sides and under it
  let leaks = 0, wet = 0; const eg = [];
  for (let x = P.lot.x0 - 1; x <= P.lot.x1 + 1; x++) for (let z = P.lot.z0 - 1; z <= P.lot.z1 + 1; z++) for (let y = fr.DECK - 4 + lift; y <= fr.TOP + 3 + lift; y++) {
    if (!WET(blk(x, y, z))) continue; wet++;
    for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) { const n = blk(x + a, y + b, z + c); if (!WET(n) && !SOLID(n)) { leaks++; if (eg.length < 3) eg.push(`${x},${y},${z}->${n}`); } }
  }
  out.held = leaks === 0 && wet > 50; out.wet = wet; out.leakEg = eg.join(' ');
  // the lift: soul sand, then bubble column all the way, glass round it, the platform to step out on
  out.liftOk = blk(...L(P.lift.sand)) === 'soul_sand' && P.lift.column.every((p) => blk(...L(p)) === 'bubble_column')
    && (() => { const top = L(P.lift.column[P.lift.column.length - 1]); return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, c]) => SOLID(blk(top[0] + a, top[1], top[2] + c))) && blk(top[0], top[1] + 1, top[2]) === 'air'; })();
  // the slide: ice the whole way, a face step each cell, down at most one, never at a corner, walled, clear above; level with the pool at its end
  {
    const S = P.slide.map((s) => L(s.floor));
    const okSteps = S.every((p, i) => i === 0 || (Math.abs(p[0] - S[i - 1][0]) + Math.abs(p[2] - S[i - 1][2]) === 1 && (p[1] === S[i - 1][1] || p[1] === S[i - 1][1] - 1)));
    const dirs = S.map((p, i) => (i === 0 ? null : [p[0] - S[i - 1][0], p[2] - S[i - 1][2]]));
    const turn = (i) => i > 0 && i < S.length - 1 && (dirs[i][0] !== dirs[i + 1][0] || dirs[i][1] !== dirs[i + 1][1]);
    const noDropAtTurn = S.every((p, i) => i === 0 || p[1] === S[i - 1][1] || (!turn(i) && !turn(i - 1)));
    const ice = S.every((p) => blk(...p) === 'blue_ice');
    const clear = S.every(([x, y, z]) => blk(x, y + 1, z) === 'air' && blk(x, y + 2, z) === 'air');
    const onRoute = new Set(S.map(([x, , z]) => x + ',' + z));
    const walled = S.every(([x, y, z], i) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, c]) => { const k = (x + a) + ',' + (z + c); if (onRoute.has(k)) return true; const n = blk(x + a, y + 1, z + c); return n === 'glass' || (i === 0 || i === S.length - 1); }));
    const last = S[S.length - 1], first = S[0];
    const intoPool = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => WET(blk(last[0] + a, last[1], last[2] + c))) && last[1] === fr.DECK + lift;
    const fromTop = first[1] === fr.TOP + lift;
    out.slide = { okSteps, noDropAtTurn, ice, clear, walled, intoPool, fromTop, length: S.length };
  }
  out.chest = blk(...L(P.chest)) === 'chest';
  out.pools = ['big', 'splash', 'kids'].every((k) => { const pl = P.pools[k], [u, v] = pl.cells[0], [x, z] = fr.at(u, v); return [...Array(pl.depth).keys()].every((d) => blk(x, fr.DECK - d + lift, z) === 'water') && SOLID(blk(x, fr.DECK - pl.depth + lift, z)); });
  out.falls = P.falls.every((p) => WET(blk(...L(p))));
  // on foot: up the steps from the street to the deck
  const pass = (b) => b === 'air' || /sign|lantern/.test(b);
  const inLot = (x, z) => x >= P.lot.x0 - 1 && x <= P.lot.x1 + 1 && z >= P.lot.z0 - 1 && z <= P.lot.z1 + 1;
  const stand = (x, y, z) => inLot(x, z) && pass(blk(x, y, z)) && pass(blk(x, y + 1, z)) && SOLID(blk(x, y - 1, z));
  const s0 = [P.door[0], P.door[1] + lift, P.door[2]], walk = new Set([key(s0)]), q = [s0];
  while (q.length && walk.size < 30000) { const [a, b, c] = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const n = [a + dx, b + dy, c + dz]; if (walk.has(key(n)) || !stand(...n)) continue; walk.add(key(n)); q.push(n); } }
  const [mx, mz] = fr.at(fr.mid, 10);
  out.reachDeck = walk.has(key([mx, fr.DECK + 1 + lift, mz]));
  return out;
}

function inspectLazyRiver(r) {
  const P = r.landmarks.find((L) => L.kind === 'lazyriver'), WP = r.landmarks.find((L) => L.kind === 'waterpark');
  if (!P) return { built: false, waterpark: !!WP };
  const w = r.world, fr = P.frame;
  const def = (x, y, z) => { const id = w.get(x, y, z); return id < 0 ? null : MATERIALS.def(id); };
  const blk = (x, y, z) => { const d = def(x, y, z); return d ? d.block.replace('minecraft:', '') : 'air'; };
  const depth = (x, y, z) => { const d = def(x, y, z); const v = d && d.states && d.states.liquid_depth; return v === undefined ? null : (v.value ?? v); };
  let lift = 0; { const [x, y, z] = P.lift.sand[0]; for (let d = -3; d <= 8; d++) if (blk(x, y + d, z) === 'soul_sand') { lift = d; break; } }
  const L = ([x, y, z]) => [x, y + lift, z];
  const key = (p) => p.join(',');
  const WET = (b) => b === 'water' || b === 'flowing_water' || b === 'bubble_column';
  const SOLID = (b) => b !== 'air' && !WET(b) && !/^(soul_)?lantern$|fence|sign|button|rail|carpet|torch|ladder/.test(b);
  const out = { built: true, lift };
  // held in
  let leaks = 0, wet = 0; const eg = [];
  for (let x = P.lot.x0 - 1; x <= P.lot.x1 + 1; x++) for (let z = P.lot.z0 - 1; z <= P.lot.z1 + 1; z++) for (let y = fr.DECK - 6 + lift; y <= fr.DECK + 3 + lift; y++) {
    if (!WET(blk(x, y, z))) continue; wet++;
    // (water running on into open air is held if that air is over the river: the
    // step at a run's end, where it falls into the next run, a block lower)
    const overRiver = (nx, ny, nz) => { for (let d = 1; d <= 3; d++) { const b = blk(nx, ny - d, nz); if (WET(b)) return true; if (SOLID(b)) return false; } return false; };
    for (const [a, b, c] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) { const n = blk(x + a, y + b, z + c); if (!WET(n) && !SOLID(n) && !(b === 0 && n === 'air' && overRiver(x + a, y, z + c))) { leaks++; if (eg.length < 3) eg.push(`${x},${y},${z}->${n}`); } }
  }
  out.held = leaks === 0 && wet > 40; out.wet = wet; out.leakEg = eg.join(' ');
  // each run: a source at its head, a level more each block down it (seven at most), open above; a step lower than the last
  out.runs = P.runs.every((run, k) => run.cells.every((pair, s) => pair.every((p) => { const q = L(p); return (s === 0 ? blk(...q) === 'water' : blk(...q) === 'flowing_water') && depth(...q) === s && s <= 7 && blk(q[0], q[1] + 1, q[2]) === 'air'; }))
    && (k === 0 || run.level === P.runs[k - 1].level - 1));
  const touch = (A, B) => A.some((a) => B.some((b) => Math.abs(a[0] - b[0]) + Math.abs(a[2] - b[2]) === 1));
  out.steps = P.runs.every((run, k) => k === 0 || (touch(P.runs[k - 1].cells[P.runs[k - 1].cells.length - 1], run.cells[0])));
  // the loop closed: the last run's end into the lift's foot, the lift all bubbles over soul sand, its top beside the first run's head
  const col = P.lift.column.map(L), lowest = Math.min(...col.map((p) => p[1])), highest = Math.max(...col.map((p) => p[1]));
  const lastRun = P.runs[P.runs.length - 1], firstRun = P.runs[0];
  out.liftOk = col.every((p) => blk(...p) === 'bubble_column') && P.lift.sand.every((p) => blk(...L(p)) === 'soul_sand')
    && highest - lowest === 3 && lowest === L(lastRun.cells[0][0])[1] && highest === L(firstRun.cells[0][0])[1]
    && touch(lastRun.cells[lastRun.cells.length - 1].map(L), col.filter((p) => p[1] === lowest))
    && touch(firstRun.cells[0].map(L), col.filter((p) => p[1] === highest));
  // the first run flush with the deck (jump in); the deck reached from the street
  out.flush = firstRun.level === fr.DECK;
  const pass = (b) => b === 'air' || /sign|lantern/.test(b);
  const inLot = (x, z) => x >= P.lot.x0 - 1 && x <= P.lot.x1 + 1 && z >= P.lot.z0 - 1 && z <= P.lot.z1 + 1;
  const stand = (x, y, z) => inLot(x, z) && pass(blk(x, y, z)) && pass(blk(x, y + 1, z)) && SOLID(blk(x, y - 1, z));
  const s0 = [P.door[0], P.door[1] + lift, P.door[2]], walk = new Set([key(s0)]), q = [s0];
  while (q.length && walk.size < 20000) { const [a, b, c] = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const n = [a + dx, b + dy, c + dz]; if (walk.has(key(n)) || !stand(...n)) continue; walk.add(key(n)); q.push(n); } }
  // (in from the front deck, along the first run: some block of it beside deck one can stand on)
  out.reach = firstRun.cells.some((pair) => pair.some((p) => { const q = L(p); return [[0, -1], [0, 1], [1, 0], [-1, 0]].some(([dx, dz]) => walk.has(key([q[0] + dx, fr.DECK + 1 + lift, q[2] + dz]))); }));
  if (WP) { const mid = (l) => [(l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2]; out.nearPark = Math.round(Math.hypot(mid(P.lot)[0] - mid(WP.lot)[0], mid(P.lot)[1] - mid(WP.lot)[1])); }
  return out;
}

export default async function run(ctx) {
  const { check } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  ({ MATERIALS } = await import('../../engine/materials.js'));
  const { buildStructures } = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const L = { furnish: false, villagers: 0, fish: false, waterpark: true };
  const fx = JSON.parse(readFileSync(new URL('./site-1004954.json', import.meta.url), 'utf8'));
  const ground = new Int16Array(Uint8Array.from(Buffer.from(fx.ground, 'base64')).buffer);
  const water = Uint8Array.from(Buffer.from(fx.water, 'base64'));
  const cities = [
    ['flat 256', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7 })],
    ['flat 320', generateCity({ ...DEFAULTS, ...L, size: 320, seed: 12345 })],
    ["a player's fitted city", generateCity({ ...DEFAULTS, ...fx.settings, ...L, terrain: { ground, water, baseY: fx.baseY } })],
    ['small blocks', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 1, minBlock: 10 })],
  ];
  check('defaults: no water park unless asked', DEFAULTS.waterpark === false);
  const ts = cities.map(([n, r]) => [n, inspectWaterPark(r)]);
  const all = (f) => ts.every(([, t]) => t.built && f(t));
  check('water park: built when asked, at both sizes (flat, fitted, small blocks)', ts.every(([, t]) => t.built) && new Set(ts.map(([, t]) => t.wide)).size === 2, ts.map(([n, t]) => `${n}: ${t.wide}`).join(', '));
  check('water park: every block of water held in (water or a solid block on its four sides and under it)', all((t) => t.held), ts.map(([n, t]) => `${n}: ${t.wet} wet ${t.leakEg}`).join('; '));
  check('water park: the lift, soul sand and a bubble column all the way up, the tube closed, the platform to step out on', all((t) => t.liftOk));
  check('water park: the boat slide blue ice, a face step a block, down at most one and never at a turn, walled, clear above', all((t) => t.slide.ice && t.slide.okSteps && t.slide.noDropAtTurn && t.slide.walled && t.slide.clear));
  check('water park: the slide from the platform\'s height down level with the splash pool', all((t) => t.slide.fromTop && t.slide.intoPool));
  check('water park: the pools at their depths, the waterfall, the chest of boats; the deck reached up the steps', all((t) => t.pools && t.falls && t.chest && t.reachDeck));
  // the lazy river, beside the water park
  {
    const lr = cities.map(([n, r]) => [n, inspectLazyRiver(r)]);
    const ok = (f) => lr.every(([, t]) => t.built && f(t));
    check('lazy river: built with the water park, near it (flat, fitted, small blocks)', ok((t) => t.nearPark !== undefined && t.nearPark <= 100), lr.map(([n, t]) => `${n}: ${t.nearPark}`).join(', '));
    check('lazy river: every block of water held in (a run\'s end falling on into the next, a block lower, is held)', ok((t) => t.held), lr.map(([n, t]) => `${n}: ${t.wet} ${t.leakEg}`).join('; '));
    check('lazy river: four runs, each a source at its head and a level more each block down it, open above, each a step lower than the last and touching it', ok((t) => t.runs && t.steps));
    check('lazy river: the loop closed, the last run into a bubble column over soul sand three high, its top at the first run\'s head', ok((t) => t.liftOk));
    check('lazy river: the first run level with the deck, jumped into from it; the deck reached up the steps', ok((t) => t.flush && t.reach));
  }
  {
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const bad = new Set();
    for (const st of buildStructures(cities[1][1].world, {})) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
    }
    check('water park: every block one of Bedrock\'s own states (bubble column, soul sand, blue ice, falling water)', bad.size === 0, [...bad].slice(0, 4).join(', '));
  }
}
