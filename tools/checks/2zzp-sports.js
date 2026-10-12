// tools/checks/2zzp-sports.js — the sports centre (sports.js).
//
// Built into the world and looked at there, at both its sizes (twenty-one by
// twenty-seven, seventeen by twenty-three), on flat and hilly cities:
// - the court marked in coloured concrete (blue, an orange key, white lines, three
//   colours and more), the same at both ends, its boundary all line, a hoop over each end;
// - the climbing wall: each ladder unbroken from the floor to the platform, on the wall,
//   each tower of scaffolding unbroken on hay; hay under the whole foot of the wall;
//   holds of four colours and more; the platform level with the parkour room's floor;
// - the pool lane: two deep, every block of it still water, held in, fifteen long and more;
// - the parkour course: every jump one a player can make (up a block over a gap of one
//   at most, level or down over two), two clear over every block of it and the top of
//   every jump under the roof; from the floor at the doorway to the finishing platform;
// - walked on foot from the street: the court, the pool's deck, the foot of the climbing
//   wall, up a ladder onto the platform, through the doorway into the parkour room, down
//   the ladder to the lobby, up the ladder to the roof;
// - the running track: both lanes closed loops round the roof, room to run on every
//   block, the railing round it;
// - lit: inside, every spot a mob could stand at 8 and more; on the roof, every one lit;
// - every block one of Bedrock's own states, and in Java one Java has.

import { readFileSync } from 'node:fs';

export const id = '2zzp';
export const label = '2zzp. the sports centre';

let MATERIALS;
const key = (p) => p.join(',');

function inspect(r) {
  const S = r.landmarks.find((L) => L.kind === 'sports');
  if (!S) return { built: false };
  const w = r.world, F = S.frame;
  const raw = (x, y, z) => { const i = w.get(x, y, z); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
  // (lifted on a hill after it was built: find its floor again)
  const [hx, hz] = F.at(Math.floor(F.W / 2), 1);
  let lift = 0; for (let d = -3; d <= 12; d++) if (raw(hx, S.door[1] - 1 + d, hz) === 'oak_planks' && raw(hx, S.door[1] + d, hz) === 'air') { lift = d; break; }
  const L = (p) => [p[0], p[1] + lift, p[2]];
  const blk = (p) => raw(...p);
  const G = S.door[1] - 1 + lift, TOP = F.TOP + lift, UP = F.UP + lift;
  const out = { built: true, size: `${S.wide}x${S.deep}`, lift };
  const at = (u, v, y) => { const [x, z] = F.at(u, v); return [x, y, z]; };

  // ---- the court ------------------------------------------------------------------------------
  {
    const colours = new Set(), mirror = [];
    let edgeOk = true;
    const asLine = (b) => (b === 'sea_lantern' ? 'white_concrete' : b);
    for (let v = 5; v <= F.CV1; v++) for (let u = 1; u <= F.CU1; u++) {
      const b = asLine(blk(at(u, v, G))); colours.add(b);
      const m = asLine(blk(at(u, 5 + F.CV1 - v, G)));
      if (b !== m) mirror.push(`${u},${v}`);
      if ((u === 1 || u === F.CU1 || v === 5 || v === F.CV1) && b !== 'white_concrete') edgeOk = false;
    }
    const concrete = [...colours].filter((c) => /_concrete$/.test(c));
    out.court = { colours: concrete.length, onlyConcrete: concrete.length === colours.size, mirror: mirror.length, edgeOk,
      hoops: S.court.hoops.map(L).every((p) => blk(p) === 'cauldron') && S.court.hoops.length === 2 };
  }

  // ---- the climbing wall ---------------------------------------------------------------------------
  {
    const C = S.climb, why = [];
    for (const col of C.ladders.map((c) => c.map(L))) {
      if (col[0][1] !== G + 1 || col[col.length - 1][1] !== UP + 1 || !col.every((p, i) => blk(p) === 'ladder' && (i === 0 || p[1] === col[i - 1][1] + 1))) why.push('ladder broken');
      // on the wall: the block behind it (the way it faces, back) solid
      const f = MATERIALS.def(w.get(...col[0])).states.facing_direction.value, d = { 2: [0, 0, -1], 3: [0, 0, 1], 4: [-1, 0, 0], 5: [1, 0, 0] }[f];
      if (!col.every((p) => !/air|glass/.test(blk([p[0] - d[0], p[1], p[2] - d[2]])))) why.push('ladder off the wall');
    }
    for (const col of C.scaffolds.map((c) => c.map(L))) {
      if (!col.every((p, i) => blk(p) === 'scaffolding' && (i === 0 || p[1] === col[i - 1][1] + 1)) || col[col.length - 1][1] !== UP || blk([col[0][0], col[0][1] - 1, col[0][2]]) !== 'hay_block') why.push('scaffolding');
    }
    if (!C.hay.map(L).every((p) => blk(p) === 'hay_block')) why.push('hay');
    const holdColours = new Set(C.holds.map(L).map(blk));
    if (C.holds.length < 10 || [...holdColours].filter((b) => /concrete/.test(b)).length < 4) why.push(`holds ${C.holds.length}, ${holdColours.size} kinds`);
    if (!C.platform.map(L).every((p) => blk(p) === 'oak_planks' && p[1] === UP)) why.push('platform');
    out.climb = why;
  }

  // ---- the pool lane ---------------------------------------------------------------------------------
  {
    const water = S.pool.water.map(L), set = new Set(water.map(key));
    const still = water.every((p) => blk(p) === 'water');
    const held = water.every((p) => [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]].every(([a, b, c]) => { const n = [p[0] + a, p[1] + b, p[2] + c]; return set.has(key(n)) || !/^(air|water)$/.test(blk(n)); }));
    const depth = new Set(water.map((p) => p[1])).size;
    out.pool = { still, held, depth, length: water.length / depth / 3 };
  }

  // ---- the parkour course --------------------------------------------------------------------------------
  {
    const why = [];
    // a jump from a to b (u, v in the frame, h the block's height over the floor; 0 the floor)
    const can = (a, b) => {
      const dh = b.h - a.h, dist = Math.hypot(b.u - a.u, b.v - a.v);
      if (dh > 1) return false;
      return dh === 1 ? dist <= 2.3 : dist <= 3.2;
    };
    const course = [{ u: F.A0, v: F.D - 3, h: 0 }, ...S.stones.map((s) => ({ u: s.u, v: s.v, h: s.h }))];
    const fin = S.finish.map(L);
    // the finishing platform: its nearest cell to the last block, one up
    const last = course[course.length - 1];
    const fv = Math.max(...S.finish.map((p) => { for (let v = 0; v < F.D; v++) for (let u = 0; u < F.W; u++) { const [x, z] = F.at(u, v); if (x === p[0] && z === p[2]) return v; } return -1; }));
    course.push({ u: last.u, v: fv, h: 1 });
    for (let i = 1; i < course.length; i++) if (!can(course[i - 1], course[i])) why.push(`jump ${i - 1}->${i}: ${JSON.stringify(course[i - 1])} to ${JSON.stringify(course[i])}`);
    for (const s of S.stones) {
      const top = L(s.top);
      if (top[1] !== UP + s.h || /air/.test(blk(top))) why.push('stone missing');
      if (blk([top[0], top[1] + 1, top[2]]) !== 'air' || blk([top[0], top[1] + 2, top[2]]) !== 'air') why.push('no room over a stone');
      // the top of a jump (feet 1.25 up, a head 1.8 tall) under the roof
      if (top[1] + 1 + 1.25 + 1.8 > TOP) why.push('a jump meets the roof');
    }
    if (!fin.length || !fin.every((p) => p[1] === UP + 1 && !/air/.test(blk(p)))) why.push('finishing platform');
    out.parkour = why; out.jumps = S.stones.length;
  }

  // ---- on foot ----------------------------------------------------------------------------------------------
  {
    const pass = (b) => b === 'air' || /sign|lantern|button/.test(b);
    const climbable = (b) => b === 'ladder' || b === 'scaffolding';
    const solid = (b) => !pass(b) && !climbable(b) && !/water|fence|cauldron/.test(b);
    const stand = (x, y, z) => (pass(raw(x, y, z)) || climbable(raw(x, y, z))) && (pass(raw(x, y + 1, z)) || climbable(raw(x, y + 1, z)))
      && (solid(raw(x, y - 1, z)) || climbable(raw(x, y, z)) || climbable(raw(x, y - 1, z)));
    const lo = { x0: S.lot.x0 - 3, x1: S.lot.x1 + 3, z0: S.lot.z0 - 3, z1: S.lot.z1 + 3 };
    const s0 = [S.door[0], S.door[1] + lift, S.door[2]];
    let start = null; for (let d = 0; d <= 3 && !start; d++) for (const dd of [d, -d]) if (!start && stand(s0[0], s0[1] + dd, s0[2])) start = [s0[0], s0[1] + dd, s0[2]];
    const seen = new Set(start ? [key(start)] : []), q = start ? [start] : [];
    while (q.length && seen.size < 200000) {
      const [a, b, c] = q.pop();
      const moves = [];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) moves.push([a + dx, b + dy, c + dz]);
      if (climbable(raw(a, b, c)) || climbable(raw(a, b - 1, c))) moves.push([a, b + 1, c], [a, b - 1, c]);
      for (const n of moves) {
        if (seen.has(key(n)) || n[0] < lo.x0 || n[0] > lo.x1 || n[2] < lo.z0 || n[2] > lo.z1 || !stand(...n)) continue;
        if (n[1] > b && !climbable(raw(a, b, c)) && !pass(raw(a, b + 2, c))) continue;
        seen.add(key(n)); q.push(n);
      }
    }
    const reach = (u, v, y) => seen.has(key(at(u, v, y)));
    const anyAt = (cells, y) => cells.some(([u, v]) => reach(u, v, y));
    out.walk = {
      start: !!start,
      court: reach(Math.round(F.cu), Math.round(F.cv), G + 1),
      poolDeck: reach(F.PU0, 10, G + 2),
      wallFoot: reach(3, F.D - 4, G + 1),
      platform: reach(3, F.D - 3, UP + 1),
      parkourRoom: reach(F.A0, F.D - 3, UP + 1),
      lobbyLadder: reach(F.A1, 2, G + 1) && reach(F.A1, 2, UP),
      roof: anyAt([[2, 2], [1, 1], [F.A0 - 1, F.RV]], TOP + 1),
    };
  }

  // ---- the running track ----------------------------------------------------------------------------------
  {
    const lanes = S.track.lanes.map((ln) => ln.map(L));
    const loops = lanes.map((ln) => {
      const set = new Set(ln.map(key));
      const twoEach = ln.every((p) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, c]) => set.has(key([p[0] + a, p[1], p[2] + c]))).length === 2);
      // one loop: walked round from the first, back to it, every block on the way
      const seen = new Set([key(ln[0])]); let cur = ln[0];
      for (;;) { const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, c]) => [cur[0] + a, cur[1], cur[2] + c]).find((p) => set.has(key(p)) && !seen.has(key(p))); if (!n) break; seen.add(key(n)); cur = n; }
      const room = ln.every((p) => blk([p[0], p[1] + 1, p[2]]) === 'air' && blk([p[0], p[1] + 2, p[2]]) === 'air');
      return twoEach && seen.size === ln.length && room;
    });
    const rail = S.track.rail.map(L).every((p) => blk(p) === 'oak_fence');
    out.track = { loops, rail, length: lanes[0].length };
  }
  out.inside = new Set(); for (let v = 1; v < F.D - 1; v++) for (let u = 1; u < F.W - 1; u++) out.inside.add(F.at(u, v).join(','));
  out.roofSet = new Set(); for (let v = 0; v < F.D; v++) for (let u = 0; u < F.W; u++) out.roofSet.add(F.at(u, v).join(','));
  out.G = G; out.TOP = TOP;
  return out;
}

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  ({ MATERIALS } = await import('../../engine/materials.js'));
  const { buildStructures } = await import('../../engine/export.js');
  const { lightMap, spawnSpots, TARGET } = await import('../../engine/lighting.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const { toJava } = await import('../../engine/java-blocks.js');
  const { loadJavaBlocks } = await import('../check-java-blocks.mjs');
  const Lf = { furnish: false, villagers: 0, fish: false, sports: true };
  check('defaults: no sports centre unless asked', DEFAULTS.sports === false);
  const cities = [
    ['flat 256 (the smaller)', generateCity({ ...DEFAULTS, ...Lf, size: 256, seed: 7, hills: 0 })],
    ['flat 320 (the bigger)', generateCity({ ...DEFAULTS, ...Lf, size: 320, seed: 2, hills: 0 })],
    ['hilly 256', generateCity({ ...DEFAULTS, ...Lf, size: 256, seed: 7 })],
  ];
  const ts = cities.map(([n, r]) => [n, r, inspect(r)]);
  const all = (f) => ts.every(([, , t]) => t.built && f(t));
  check('sports centre: built at both sizes (21 by 27 where the lot takes it, 17 by 23), flat and hilly', all(() => true) && new Set(ts.map(([, , t]) => t.size)).size === 2, ts.map(([n, r, t]) => `${n}: ${t.built ? t.size : r.stats.sportsMissing}`).join(', '));
  check('sports centre: the court marked in coloured concrete, three colours and more, the same at both ends, its boundary all line, a hoop over each end', all((t) => t.court.colours >= 3 && t.court.onlyConcrete && t.court.mirror === 0 && t.court.edgeOk && t.court.hoops), ts.map(([n, , t]) => `${n}: ${JSON.stringify(t.court)}`).join(' | '));
  check('sports centre: the climbing wall: ladders unbroken floor to platform on the wall, scaffolding unbroken on hay, hay all along its foot, holds of four colours and more, the platform level with the parkour room', all((t) => t.climb.length === 0), ts.map(([n, , t]) => `${n}: ${(t.climb || []).join('; ')}`).join(' | '));
  check('sports centre: the pool lane two deep, still water held in, fifteen long and more', all((t) => t.pool.still && t.pool.held && t.pool.depth === 2 && t.pool.length >= 15), ts.map(([n, , t]) => `${n}: ${JSON.stringify(t.pool)}`).join(' | '));
  check('sports centre: the parkour course: every jump one a player can make, room over every block, no jump meeting the roof, from the doorway to the finishing platform', all((t) => t.parkour.length === 0 && t.jumps >= 5), ts.map(([n, , t]) => `${n}: ${t.jumps} jumps ${(t.parkour || []).slice(0, 2).join('; ')}`).join(' | '));
  check('sports centre: walked from the street: the court, the pool deck, the climbing wall, up a ladder to the platform, into the parkour room, down to the lobby, up to the roof', all((t) => Object.values(t.walk).every(Boolean)), ts.map(([n, , t]) => `${n}: ${JSON.stringify(t.walk)}`).join(' | '));
  check('sports centre: the running track: both lanes closed loops round the roof, room to run on every block, a railing round it', all((t) => t.track.loops.every(Boolean) && t.track.rail && t.track.length >= 60), ts.map(([n, , t]) => `${n}: ${JSON.stringify(t.track)}`).join(' | '));
  {
    let dim = 0, darkRoof = 0, spots = 0;
    for (const [, r, t] of ts) {
      if (!t.built) continue;
      const map = lightMap(r.world);
      for (const [x, y, z, lv] of spawnSpots(r.world, map, (x, z) => t.roofSet.has(x + ',' + z))) {
        if (y > t.G && y < t.TOP && t.inside.has(x + ',' + z)) { spots++; if (lv < TARGET) dim++; }
        else if (y > t.TOP) { spots++; if (lv < 1) darkRoof++; }
      }
    }
    check(`sports centre: lit: inside every spot a mob could stand at ${TARGET} and more, on the roof every one lit`, dim === 0 && darkRoof === 0 && spots > 300, `${dim} dim inside, ${darkRoof} dark on the roof, of ${spots}`);
  }
  {
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const java = loadJavaBlocks();
    const bad = new Set(), jbad = new Set();
    for (const [, r] of ts.slice(0, 2)) for (const st of buildStructures(r.world, {})) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
      if (/scaffolding|ladder|hay|cauldron|quartz_slab|concrete|terracotta|sea_lantern/.test(n)) {
        const j = toJava(p.name, Object.fromEntries(Object.entries(p.states).map(([k, v]) => [k, { value: typeof v === 'object' ? v.value : v }])));
        const props = java.get(j.name);
        if (!props) jbad.add(j.name); else for (const [k, v] of Object.entries(j.props)) if (!props.has(k) || !props.get(k).has(String(v))) jbad.add(`${j.name}.${k}=${v}`);
      }
    }
    check('sports centre: every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
    check('sports centre: in Java, its scaffolding, ladders, hay, slabs and concrete each a block Java has, with its own states', jbad.size === 0, [...jbad].slice(0, 4).join(', '));
  }
  note(`sports centre: ${ts.map(([n, , t]) => `${n} ${t.built ? t.size : 'none'}, ${t.jumps || 0} jumps, track ${t.track ? t.track.length : 0}`).join('; ')}`);
}
