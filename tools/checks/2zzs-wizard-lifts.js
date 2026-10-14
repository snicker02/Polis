// tools/checks/2zzs-wizard-lifts.js — the wizard's tower (wizard.js) and the bubble
// lifts in the tall towers (building.js).
//
// The wizard's tower, built into the world and looked at there, flat and hilly:
// - the enchanting table with bookshelves round it counted the way the game counts
//   them (two away, level with it or one up, the cell between empty): fifteen, the
//   most it takes;
// - three brewing stands with blaze powder in them, chests of ingredients, cauldrons
//   of water, lava and powder snow, a great cauldron over a fire, an anvil;
// - the ladder unbroken from the ground to the top floor, every rung on the wall;
//   walked on foot from the street up to every floor, to the table, the stands and
//   the wizard's room;
// - the roof closed: from inside the top room nothing open leads out; every top of
//   it a stair (or the end rod);
// - every spot a mob could stand lit (inside to 8).
// The lifts, in cities furnished as they come:
// - every tall tower whose stairs run in flights has one;
// - soul sand under the up shaft, magma under the down; a bubble column in each all
//   the way to the top floor, each the right way; every side of the water a wall,
//   the other shaft, or a door on a floor (the water held in);
// - on every floor both doors there, open, and walked to on foot from the street;
//   over the up shaft at the top, room to come out;
// - off when asked: no lift anywhere.
// Every block one of Bedrock's own states, and in Java one Java has.

import { readFileSync } from 'node:fs';

export const id = '2zzs';
export const label = '2zzs. the wizard\'s tower, the bubble lifts';

let MATERIALS;
const key = (p) => p.join(',');
const H4 = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
const add = (p, d) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
const FD = { 2: [0, 0, -1], 3: [0, 0, 1], 4: [-1, 0, 0], 5: [1, 0, 0] };

function inspectWizard(r) {
  const T = r.landmarks.find((q) => q.kind === 'wizard');
  if (!T) return { built: false };
  const w = r.world, F = T.frame, out = { built: true };
  const raw = (p) => { const i = w.get(...p); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
  const st = (p, k) => { const i = w.get(...p); const d = i < 0 ? null : MATERIALS.def(i); const v = d ? d.states[k] : undefined; return v === undefined || v === null ? undefined : (v.value ?? v); };
  // (lifted on a hill after it was built: how far)
  let lift = 0; for (let d = -2; d <= 12; d++) if (raw([T.table[0], T.table[1] + d, T.table[2]]) === 'enchanting_table') { lift = d; break; }
  const L = (p) => [p[0], p[1] + lift, p[2]];
  const at = (u, v, y) => { const [x, z] = F.at(u, v); return [x, y + lift, z]; };
  const c = F.c, fy = F.floorY;
  // the enchanting table, counted as the game counts its shelves
  const t = L(T.table);
  let power = 0;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2) continue;
    for (const dy of [0, 1]) {
      if (raw([t[0] + dx, t[1] + dy, t[2] + dz]) !== 'bookshelf') continue;
      if (raw([t[0] + Math.trunc(dx / 2), t[1] + dy, t[2] + Math.trunc(dz / 2)]) !== 'air') continue;
      power++;
    }
  }
  out.table = raw(t) === 'enchanting_table';
  out.power = power;
  // brewing, cauldrons, the anvil, the chests
  const items = (p) => { const d = w.getData(...p); return d && d.tags && d.tags.Items ? d.tags.Items.v.map((it) => it.v.Name.v.replace('minecraft:', '')) : []; };
  out.brewing = T.brewing.length === 3 && T.brewing.map(L).every((p) => raw(p) === 'brewing_stand' && items(p).includes('blaze_powder'));
  const all = T.chests.map(L).flatMap(items);
  out.ingredients = ['nether_wart', 'blaze_powder', 'glass_bottle', 'redstone', 'glowstone_dust', 'gunpowder', 'fermented_spider_eye', 'sugar', 'lapis_lazuli', 'experience_bottle'].every((n) => all.includes(n));
  const liquids = new Set(T.cauldrons.map(L).filter((p) => raw(p) === 'cauldron' && st(p, 'fill_level') === 6).map((p) => st(p, 'cauldron_liquid')));
  out.cauldrons = ['water', 'lava', 'powder_snow'].every((q) => liquids.has(q)) && /campfire/.test(raw(add(L(T.cauldrons[0]), [0, -1, 0])));
  out.anvil = raw(L(T.anvil)) === 'anvil';
  // the ladder
  out.ladder = T.ladder.map(L).every((p, i, a) => raw(p) === 'ladder' && (i === 0 || p[1] === a[i - 1][1] + 1) && (() => { const d = FD[st(p, 'facing_direction')]; return !!d && !/air|ladder|glass/.test(raw([p[0] - d[0], p[1], p[2] - d[2]])); })())
    && L(T.ladder[T.ladder.length - 1])[1] === fy[3] + lift;
  // walked on foot from the street
  const pass = (b) => b === 'air' || /door|sign|carpet|allium|button/.test(b);
  const climb = (b) => b === 'ladder';
  const floor = (b) => !pass(b) && !climb(b) && !/water|fence|bars|bubble/.test(b);
  const stand = (p) => (pass(raw(p)) || climb(raw(p))) && (pass(raw(add(p, [0, 1, 0]))) || climb(raw(add(p, [0, 1, 0])))) && (floor(raw(add(p, [0, -1, 0]))) || climb(raw(p)) || climb(raw(add(p, [0, -1, 0]))));
  const lot = T.lot;
  let s0 = null; const d0 = L(T.door); for (let d = 0; d <= 3 && !s0; d++) for (const dd of [d, -d]) if (!s0 && stand([d0[0], d0[1] + dd, d0[2]])) s0 = [d0[0], d0[1] + dd, d0[2]];
  const seen = new Set(s0 ? [key(s0)] : []), q = s0 ? [s0] : [];
  while (q.length) {
    const p = q.pop(), moves = [];
    for (const d of H4) for (const dy of [0, 1, -1]) moves.push(add(add(p, d), [0, dy, 0]));
    if (climb(raw(p)) || climb(raw(add(p, [0, -1, 0])))) moves.push(add(p, [0, 1, 0]), add(p, [0, -1, 0]));
    for (const n of moves) {
      if (seen.has(key(n)) || n[0] < lot.x0 - 2 || n[0] > lot.x1 + 2 || n[2] < lot.z0 - 2 || n[2] > lot.z1 + 2 || !stand(n)) continue;
      if (n[1] > p[1] && !climb(raw(p)) && !pass(raw(add(p, [0, 2, 0])))) continue;
      seen.add(key(n)); q.push(n);
    }
  }
  out.walk = {
    ground: seen.has(key(at(c, c - 4, fy[0] + 1))),
    lab: seen.has(key(at(c, c - 3, fy[1] + 1))),
    table: seen.has(key(at(c, c + 1, fy[2] + 1))),
    anvil: seen.has(key(at(c + 3, c + 2, fy[2] + 1))),
    room: seen.has(key(at(c, c, fy[3] + 1))),
  };
  // the roof closed: nothing open from inside the top room leads out of the tower
  {
    const box = (p) => p[0] >= lot.x0 - 1 && p[0] <= lot.x1 + 1 && p[2] >= lot.z0 - 1 && p[2] <= lot.z1 + 1 && p[1] > fy[3] + lift && p[1] <= F.TOP + F.PEAK + 3 + lift;
    const open = (p) => /^(air|soul_lantern|lantern)$/.test(raw(p));
    const s = at(c, c, fy[3] + 3), seen2 = new Set([key(s)]), q2 = [s];
    let leak = null;
    while (q2.length && !leak) {
      const p = q2.pop();
      const [x, , z] = p;
      // (outside the wall: out of the tower)
      const uv = (() => { for (let u = 0; u < 15; u++) for (let v = 0; v < 15; v++) { const [a, b] = F.at(u, v); if (a === x && b === z) return [u, v]; } return null; })();
      if (!uv || (uv[0] - c) ** 2 + (uv[1] - c) ** 2 > 42) { leak = p; break; }
      for (const d of [...H4, [0, 1, 0], [0, -1, 0]]) { const n = add(p, d); if (!seen2.has(key(n)) && box(n) && open(n)) { seen2.add(key(n)); q2.push(n); } }
    }
    out.closed = !leak && seen2.size > 50;
    out.roofTops = T.roof.map(L).every((p) => /purpur_stairs/.test(raw(p)) || (raw(p) === 'purpur_block' && raw(add(p, [0, 1, 0])) === 'end_rod'))
      && T.roof.map(L).every((p) => raw(add(p, [0, 1, 0])) === 'air' || raw(add(p, [0, 1, 0])) === 'end_rod');
  }
  return out;
}

function inspectLifts(r) {
  const w = r.world;
  const raw = (x, y, z) => { const i = w.get(x, y, z); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
  const st = (x, y, z, k) => { const i = w.get(x, y, z); const d = i < 0 ? null : MATERIALS.def(i); const v = d ? d.states[k] : undefined; return v === undefined || v === null ? undefined : (v.value ?? v); };
  const solid = (x, y, z) => { const i = w.get(x, y, z); return i >= 0 && !MATERIALS.isPassable(i); };
  const tall = r.buildings.filter((b) => b.style === 'tower' && b.floors >= 6 && b.core);
  const flights = tall.filter((b) => b.stairKind !== 'spiral');
  const lifts = r.buildings.filter((b) => b.lift);
  const out = { tall: tall.length, flights: flights.length, lifts: lifts.length, flightsWithout: flights.filter((b) => !b.lift).length, base: 0, columns: 0, held: 0, doors: 0, reached: 0, top: 0, bad: [] };
  for (const b of lifts) {
    const Lf = b.lift;
    // (lifted on a hill after it was built: how far, from the soul sand)
    let e = 0; for (let d = -2; d <= 12; d++) if (raw(Lf.up[0], Lf.y0 + d, Lf.up[1]) === 'soul_sand') { e = d; break; }
    const y0 = Lf.y0 + e, y1 = Lf.y1 + e, floors = Lf.floors.map((y) => y + e);
    const [ux, uz] = Lf.up, [dx, dz] = Lf.down;
    if (raw(ux, y0, uz) === 'soul_sand' && raw(dx, y0, dz) === 'magma') out.base++;
    else out.bad.push(`base ${b.x0},${b.z0}`);
    let col = true;
    for (let y = y0 + 1; y <= y1; y++) {
      if (raw(ux, y, uz) !== 'bubble_column' || st(ux, y, uz, 'drag_down') !== 0) col = false;
      if (raw(dx, y, dz) !== 'bubble_column' || st(dx, y, dz, 'drag_down') !== 1) col = false;
    }
    if (col) out.columns++; else out.bad.push(`column ${b.x0},${b.z0}`);
    // held in: every side of the water a solid block, the other shaft, or a door
    let held = true;
    for (const [x, z] of [Lf.up, Lf.down]) for (let y = y0 + 1; y <= y1; y++) for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = raw(x + a, y, z + c);
      if (n === 'bubble_column' || /door/.test(n) || solid(x + a, y, z + c)) continue;
      held = false; if (out.bad.length < 6) out.bad.push(`leak ${x + a},${y},${z + c} ${n}`);
    }
    if (held) out.held++;
    // the doors on every floor, open, and walked to from the street
    let doors = true;
    for (const sy of floors) for (const [x, z] of Lf.doors) {
      if (!/door/.test(raw(x, sy + 1, z)) || !/door/.test(raw(x, sy + 2, z)) || st(x, sy + 1, z, 'open_bit') !== 1) doors = false;
    }
    if (doors) out.doors++; else out.bad.push(`doors ${b.x0},${b.z0}`);
    const pass = (x, y, z) => { const i = w.get(x, y, z); return i < 0 || MATERIALS.isPassable(i); };
    const stands = (x, y, z) => x >= b.x0 - 2 && x <= b.x1 + 2 && z >= b.z0 - 2 && z <= b.z1 + 2 && y >= y0 - 1 && y <= y1 + 8
      && pass(x, y, z) && pass(x, y + 1, z) && solid(x, y - 1, z) && raw(x, y - 1, z) !== 'bubble_column';
    const [sx, sy0, sz] = b.outside;
    let start = null;
    for (const dy of [0, 1, -1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) if (!start && stands(sx, sy0 + dy, sz)) start = [sx, sy0 + dy, sz];
    const seen = new Set(start ? [start.join()] : []), q = start ? [start] : [];
    while (q.length) {
      const [x, y, z] = q.pop();
      for (const [a, c] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const d of [0, 1, -1]) {
        if (d === 1 && !pass(x, y + 2, z)) continue;
        const n = [x + a, y + d, z + c];
        if (seen.has(n.join()) || !stands(...n)) continue;
        seen.add(n.join()); q.push(n);
      }
    }
    if (floors.every((sy) => Lf.doors.every(([x, z]) => seen.has([x, sy + 1, z].join())))) out.reached++;
    else out.bad.push(`reach ${b.x0},${b.z0}: ${floors.filter((sy) => !Lf.doors.every(([x, z]) => seen.has([x, sy + 1, z].join()))).map((y) => y - y0).join(' ')}`);
    // the top: room over the up shaft to come out into
    if (raw(ux, y1 + 1, uz) === 'air' && raw(ux, y1 + 2, uz) === 'air') out.top++;
    else out.bad.push(`top ${b.x0},${b.z0}`);
  }
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
  const { inTower } = await import('../../engine/wizard.js');
  check('defaults: no wizard\'s tower unless asked; lifts on', !DEFAULTS.wizard && DEFAULTS.lifts === true);
  const Lt = { furnish: false, villagers: 0, fish: false, wizard: true };
  const wcities = [
    ['flat 320', generateCity({ ...DEFAULTS, ...Lt, size: 320, seed: 7, hills: 0 })],
    ['flat 256', generateCity({ ...DEFAULTS, ...Lt, size: 256, seed: 2, hills: 0 })],
    ['hilly 320', generateCity({ ...DEFAULTS, ...Lt, size: 320, seed: 7 })],
  ];
  const ws = wcities.map(([n, r]) => [n, r, inspectWizard(r)]);
  const allW = (f) => ws.every(([, , t]) => t.built && f(t));
  const sayW = () => ws.map(([n, , t]) => `${n}: ${JSON.stringify(t)}`).join(' | ');
  check('wizard\'s tower built when asked, flat and hilly', allW(() => true), ws.map(([n, r]) => `${n}: ${r.stats.wizardMissing || 'built'}`).join(' | '));
  check('wizard\'s tower: the enchanting table with fifteen bookshelves counted the way the game counts them (two away, level or one up, the cell between empty)', allW((t) => t.table && t.power >= 15), sayW());
  check('wizard\'s tower: three brewing stands with blaze powder; chests of every ingredient, lapis and bottles o\' enchanting; cauldrons of water, lava and powder snow, the great one over a fire; an anvil', allW((t) => t.brewing && t.ingredients && t.cauldrons && t.anvil), sayW());
  check('wizard\'s tower: the ladder unbroken from the ground to the top floor, every rung on the wall', allW((t) => t.ladder), sayW());
  check('wizard\'s tower: walked on foot from the street to the cauldrons, the brewing stands, beside the enchanting table, the anvil and the wizard\'s room', allW((t) => Object.values(t.walk).every(Boolean)), sayW());
  check('wizard\'s tower: the roof closed (nothing open from inside the top room leads out); every top of it a stair, or the end rod on its point', allW((t) => t.closed && t.roofTops), sayW());
  {
    let dark = 0, dim = 0, spots = 0;
    for (const [, r] of wcities) {
      const map = lightMap(r.world);
      const T = r.landmarks.find((q) => q.kind === 'wizard'); if (!T) continue;
      const lot = T.lot, inside = new Set();
      for (let u = 0; u < 15; u++) for (let v = 0; v < 15; v++) if (inTower(u - T.frame.c, v - T.frame.c)) inside.add(T.frame.at(u, v).join(','));
      for (const [x, , z, lv] of spawnSpots(r.world, map, (x, z) => x >= lot.x0 && x <= lot.x1 && z >= lot.z0 && z <= lot.z1)) {
        spots++;
        if (lv < 1) dark++;
        else if (inside.has(x + ',' + z) && lv < TARGET) dim++;
      }
    }
    check(`wizard's tower lit: no spot a mob could stand on dark, inside at ${TARGET} and more`, dark === 0 && dim === 0 && spots > 100, `${dark} dark, ${dim} dim inside, of ${spots}`);
  }

  // ---- the lifts, in cities as they come (furnished, villagers and all)
  const lcities = [
    ['256 seed 1', generateCity({ ...DEFAULTS, size: 256, seed: 1 })],
    ['320 seed 7', generateCity({ ...DEFAULTS, size: 320, seed: 7 })],
    ['192 seed 5 flat', generateCity({ ...DEFAULTS, size: 192, seed: 5, hills: 0 })],
  ];
  const ls = lcities.map(([n, r]) => [n, r, inspectLifts(r)]);
  const sayL = () => ls.map(([n, , t]) => `${n}: ${JSON.stringify(t)}`).join(' | ');
  const sum = (k) => ls.reduce((a, [, , t]) => a + t[k], 0);
  check('lifts: every tall tower whose stairs run in flights has one (and there are lifts in every city)', ls.every(([, , t]) => t.flightsWithout === 0 && t.lifts > 0), sayL());
  check('lifts: soul sand under the up shaft, magma under the down; a bubble column in each to the top floor, rising in one and sinking in the other', sum('base') === sum('lifts') && sum('columns') === sum('lifts'), sayL());
  check('lifts: the water held in (every side of it a block, the other shaft or a door)', sum('held') === sum('lifts'), sayL());
  check('lifts: on every floor a door into each shaft, open, both walked to on foot from the street; room over the up shaft at the top to come out', sum('doors') === sum('lifts') && sum('reached') === sum('lifts') && sum('top') === sum('lifts'), sayL());
  {
    const r = generateCity({ ...DEFAULTS, size: 192, seed: 5, lifts: false });
    let n = 0; r.world.forEach((x, y, z, i) => { if (/bubble_column/.test(MATERIALS.def(i).block)) n++; });
    check('lifts: off when asked, no bubble column in any tower', r.buildings.every((b) => !b.lift) && n === 0, `${n} bubble blocks`);
  }
  {
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const java = loadJavaBlocks();
    const bad = new Set(), jbad = new Set();
    for (const world of [wcities[1][1].world, lcities[2][1].world]) for (const st of buildStructures(world, {})) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
      if (/enchanting|brewing|cauldron|purpur|end_rod|campfire|grindstone|anvil|ender_chest|bubble|soul_sand|magma|_door$|ladder|bookshelf/.test(n)) {
        const j = toJava(p.name, Object.fromEntries(Object.entries(p.states).map(([k, v]) => [k, { value: typeof v === 'object' ? v.value : v }])));
        const props = java.get(j.name);
        if (!props) jbad.add(j.name); else for (const [k, v] of Object.entries(j.props)) if (!props.has(k) || !props.get(k).has(String(v))) jbad.add(`${j.name}.${k}=${v}`);
      }
    }
    check('every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
    check('in Java, the table, stands, cauldrons (water, lava, powder snow), the roof, the bubble columns (drag), soul sand, magma, the open doors each a block Java has, with its own states', jbad.size === 0, [...jbad].slice(0, 4).join(', '));
  }
  note(`lifts: ${ls.map(([n, , t]) => `${n} ${t.lifts} of ${t.tall} tall towers (${t.flights} in flights)`).join('; ')}`);
}
