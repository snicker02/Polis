// tools/checks/2zzo-mill.js — the mill (factory.js: mill): a sugar cane farm, an
// observer clock, an item sorter.
//
// Built with the factory, into the world, and each machine followed through block by
// block the way Bedrock's redstone works, its facings read the way Bedrock writes them
// (a piston's sideways facings south 2, north 3, east 4, west 5; an observer's facing
// the way it watches, its pulse out of its back; a repeater's or comparator's
// direction from its output to its input; a wall torch naming the side its block is
// on: Mojang's own Java-to-Bedrock table, below, says so):
//
// - the sorter: each filter's comparator signal from what is in it (41 of its item
//   and four named sticks: 2), and with one more (3); along its three dust, the third
//   powering the block behind the repeater, the repeater the torch's block, the torch
//   out, the block over it unpowered, the hopper beside it unlocked: locked at 2,
//   unlocked at 3. The filter never locked, never emptying itself (it points into its
//   comparator), under the line; the line hopper to hopper into the barrel at its end,
//   the chest at its head over the first; no column's dust reaching another's.
// - the farm: every cane on dirt beside water, room to grow three high; each piston
//   facing its cane's second block, the observer on it watching the third, its pulse
//   into dust powering the block beside the piston; no observer watching a cell a
//   piston head goes into (it would set itself off for ever); the stalk pushed out
//   over the stream; the stream a step shallower each block, held in, over the hopper
//   into the barrel.
// - the clock: the lever on its console beside the sticky piston; up, the rider
//   observer in line with the fixed one, each watching the other; down, out of line,
//   watching a block that never changes; the lamp and the note block (air over it) on
//   their backs.
// Reached on foot; lit (every spot a mob could stand at light 8 or more); every block
// one of Bedrock's own states; in Java, every one of its blocks as Mojang's table has
// it. On flat and fitted cities.

import { readFileSync } from 'node:fs';

export const id = '2zzo';
export const label = '2zzo. the mill';

let MATERIALS;

// Mojang's Java-to-Bedrock block table (as minecraft-data carries it, 1.21.80), for
// the blocks the mill uses: bedrock state -> java state
const MOJANG = [
  [['minecraft:observer', { 'minecraft:facing_direction': 'north', powered_bit: 0 }], 'minecraft:observer[facing=north,powered=false]'],
  [['minecraft:piston', { facing_direction: 3 }], 'minecraft:piston[extended=false,facing=north]'],
  [['minecraft:piston', { facing_direction: 4 }], 'minecraft:piston[extended=false,facing=east]'],
  [['minecraft:sticky_piston', { facing_direction: 1 }], 'minecraft:sticky_piston[extended=false,facing=up]'],
  [['minecraft:unpowered_repeater', { 'minecraft:cardinal_direction': 'north', repeater_delay: 0 }], 'minecraft:repeater[delay=1,facing=north,locked=false,powered=false]'],
  [['minecraft:unpowered_comparator', { 'minecraft:cardinal_direction': 'north', output_lit_bit: 0, output_subtract_bit: 0 }], 'minecraft:comparator[facing=north,mode=compare,powered=false]'],
  [['minecraft:redstone_torch', { torch_facing_direction: 'south' }], 'minecraft:redstone_wall_torch[facing=north,lit=true]'],
  [['minecraft:hopper', { facing_direction: 2, toggle_bit: 0 }], 'minecraft:hopper[enabled=true,facing=north]'],
  [['minecraft:barrel', { facing_direction: 2, open_bit: 0 }], 'minecraft:barrel[facing=north,open=false]'],
  [['minecraft:reeds', { age: 0 }], 'minecraft:sugar_cane[age=0]'],
];

const DIRV = { north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] };
const F6 = ['down', 'up', 'north', 'south', 'west', 'east'];            // the usual facing_direction
const PF6 = ['down', 'up', 'south', 'north', 'east', 'west'];           // a piston's
const add = (p, d) => [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
const neg = (d) => [-d[0], -d[1], -d[2]];
const key = (p) => p.join(',');
const N6 = Object.values(DIRV);
const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) === 1;
// a container's comparator signal, as the game works it (a stackable item 1/64 of a slot)
const signal = (counts, slots = 5) => { const full = counts.reduce((s, c) => s + c / 64, 0); return full === 0 ? 0 : Math.floor(1 + (full / slots) * 14); };

function inspect(r) {
  const M = r.landmarks.find((L) => L.kind === 'mill');
  if (!M) return { built: false, factory: !!r.landmarks.find((L) => L.kind === 'factory') };
  const w = r.world, fr = M.frame;
  const def = (p) => { const id = w.get(...p); return id < 0 ? null : MATERIALS.def(id); };
  const raw = (x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block.replace('minecraft:', ''); };
  const [hx, hz] = fr.at(6, 1); let lift = 0; for (let d = -3; d <= 8; d++) if (raw(hx, M.door[1] - 1 + d, hz) === 'smooth_stone' && raw(hx, M.door[1] + d, hz) === 'air') { lift = d; break; }
  const L = (p) => [p[0], p[1] + lift, p[2]];
  const blk = (p) => { const d = def(p); return d ? d.block.replace('minecraft:', '') : 'air'; };
  const st = (p, k) => { const d = def(p); const v = d && d.states && d.states[k]; return v === undefined ? undefined : (v.value ?? v); };
  const CONDUCT = (b) => !/^(air|water|flowing_water|glass|hopper|observer|piston|sticky_piston|redstone_wire|redstone_torch|unlit_redstone_torch|lever|unpowered_comparator|powered_comparator|unpowered_repeater|powered_repeater|chest|barrel|reeds|standing_sign|lantern)$/.test(b);
  const out = { built: true, lift };
  // ---- dust: levels from where it is first powered, along its connections ------------------
  // (a dust connects to dust beside it, one up where nothing conducting is over it, one
  // down where nothing conducting is over the lower; a step along costs one)
  const spreadDust = (seeds) => {
    const lv = new Map(), q = [];
    for (const [p, s] of seeds) if (blk(p) === 'redstone_wire' && (lv.get(key(p)) || 0) < s) { lv.set(key(p), s); q.push(p); }
    while (q.length) {
      const p = q.shift(), s = lv.get(key(p));
      if (s <= 1) continue;
      for (const d of [DIRV.north, DIRV.south, DIRV.east, DIRV.west]) {
        const n = add(p, d), cands = [n];
        if (!CONDUCT(blk(add(p, DIRV.up)))) cands.push(add(n, DIRV.up));
        if (!CONDUCT(blk(n))) cands.push(add(n, DIRV.down));
        for (const c of cands) if (blk(c) === 'redstone_wire' && (lv.get(key(c)) || 0) < s - 1) { lv.set(key(c), s - 1); q.push(c); }
      }
    }
    return lv;
  };
  const underDust = (lv) => new Set([...lv.keys()].map((k) => key(add(k.split(',').map(Number), DIRV.down))));
  const observerFace = (p) => DIRV[st(p, 'minecraft:facing_direction')];
  const pistonFace = (p) => DIRV[PF6[st(p, 'facing_direction')]];
  const hopperOut = (p) => DIRV[F6[st(p, 'facing_direction')]];
  const toInput = (p) => DIRV[st(p, 'minecraft:cardinal_direction')];
  const torchBlock = (p) => { const f = st(p, 'torch_facing_direction'); return f === 'top' ? add(p, DIRV.down) : add(p, DIRV[f]); };

  // ---- the sorter ---------------------------------------------------------------------------------
  const S = M.sorter, cols = S.columns.map((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Array.isArray(v) && Array.isArray(v[0]) ? v.map(L) : Array.isArray(v) ? L(v) : v])));
  const line = S.line.map(L);
  out.line = line.every((p, i) => blk(p) === 'hopper' && (i < line.length - 1 ? key(add(p, hopperOut(p))) === key(line[i + 1]) : st(p, 'facing_direction') === 0 && key(add(p, DIRV.down)) === key(L(S.overflow)) && blk(L(S.overflow)) === 'barrel'))
    && blk(L(S.input)) === 'chest' && key(add(L(S.input), DIRV.down)) === key(line[0]);
  out.columns = cols.map((c) => {
    const why = [];
    const items = (w.getData(...c.filter) || { tags: {} }).tags.Items;
    const list = items ? items.v.map((it) => ({ name: it.v.Name.v, count: it.v.Count.v, slot: it.v.Slot.v, custom: it.v.tag ? it.v.tag.v.display.v.Name.v : null })) : [];
    const mine = list.find((i) => i.slot === 0), named = list.filter((i) => i.slot > 0 && i.custom);
    if (!mine || mine.name !== c.item || mine.count !== 41 || named.length !== 4 || new Set(list.map((i) => i.slot)).size !== 5) why.push('filter contents');
    const rest = signal(list.map((i) => i.count)), more = signal(list.map((i) => i.count + (i.slot === 0 ? 1 : 0)));
    // the parts, where each must be
    if (blk(c.filter) !== 'hopper' || key(add(c.filter, DIRV.up)) !== key(c.line)) why.push('filter not under the line');
    if (key(add(c.filter, hopperOut(c.filter))) !== key(c.comparator) || !/comparator/.test(blk(c.comparator))) why.push('filter not pointing into its comparator');
    if (key(add(c.comparator, toInput(c.comparator))) !== key(c.filter)) why.push('comparator not reading the filter');
    if (key(add(c.filter, DIRV.down)) !== key(c.locked) || blk(c.locked) !== 'hopper' || key(add(c.locked, hopperOut(c.locked))) !== key(c.chest) || blk(c.chest) !== 'chest') why.push('locked hopper not under the filter into the chest');
    if (!/redstone_torch/.test(blk(c.torch)) || key(torchBlock(c.torch)) !== key(c.torchBlock) || !CONDUCT(blk(c.torchBlock))) why.push('torch not on its block');
    if (key(add(c.torch, DIRV.up)) !== key(c.lockBlock) || !CONDUCT(blk(c.lockBlock)) || !near(c.lockBlock, c.locked)) why.push('lock block');
    if (!/repeater/.test(blk(c.repeater)) || key(add(c.repeater, toInput(c.repeater))) !== key(c.repeaterIn) || key(add(c.repeater, neg(toInput(c.repeater)))) !== key(c.torchBlock) || !CONDUCT(blk(c.repeaterIn))) why.push('repeater');
    // the filter must pull from the line: nothing powered beside it, whatever the state
    if (near(c.lockBlock, c.filter) || near(c.torch, c.filter)) why.push('filter beside the lock');
    // followed through at a signal s: is the hopper under the filter locked?
    const lockedAt = (s) => {
      const front = add(c.comparator, neg(toInput(c.comparator)));
      const lv = spreadDust([[front, s]]);
      // (no column's dust reaching another's, none reaching the clock's)
      const others = cols.filter((o) => o !== c).flatMap((o) => o.dust).some((p) => lv.has(key(p)));
      if (others) why.push('dust reaches another column');
      const weak = underDust(lv);
      const repeaterOn = weak.has(key(c.repeaterIn));
      const torchOn = !repeaterOn;                                   // the repeater powers the torch's block
      const lockPowered = torchOn;                                   // the torch powers the block over it
      return lockPowered && near(c.lockBlock, c.locked);
    };
    const atRest = lockedAt(rest), atMore = lockedAt(more);
    // and the dust's own chain: the comparator's front the first, the third on the repeater's block
    if (key(add(c.comparator, neg(toInput(c.comparator)))) !== key(c.dust[0]) || key(add(c.dust[2], DIRV.down)) !== key(c.repeaterIn)) why.push('dust chain');
    return { item: c.item, rest, more, lockedAtRest: atRest, unlockedAtMore: !atMore, why };
  });
  // the line never locked: nothing powered beside any hopper of it (the lock blocks, the torches)
  const lockCells = new Set(cols.flatMap((c) => [key(c.lockBlock), key(c.torch), key(c.torchBlock)]));
  out.lineFree = line.every((p) => N6.every((d) => !lockCells.has(key(add(p, d)))));

  // ---- the farm --------------------------------------------------------------------------------
  const Fm = M.farm;
  const canes = Fm.canes.map((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, L(v)])));
  const pistons = Fm.pistons.map(L), observers = Fm.observers.map(L), water = Fm.water.map(L);
  const waterSet = new Set(water.map(key));
  out.canes = canes.every((c) => blk(c.base) === 'reeds' && blk(c.dirt) === 'dirt' && [DIRV.north, DIRV.south, DIRV.east, DIRV.west].some((d) => waterSet.has(key(add(c.dirt, d))))
    && blk(c.second) === 'air' && blk(c.third) === 'air');
  const heads = pistons.map((p) => add(p, pistonFace(p)));
  const watched = observers.map((o) => add(o, observerFace(o)));
  out.aim = canes.every((c, i) => /^piston$/.test(blk(pistons[i])) && key(heads[i]) === key(c.second) && blk(observers[i]) === 'observer' && key(watched[i]) === key(c.third));
  // no observer watching where a piston head goes, or a piston itself: else it sets itself off for ever
  const headSet = new Set([...heads, ...pistons].map(key));
  out.noLoop = watched.every((p) => !headSet.has(key(p)));
  // each observer's pulse: into the dust behind it, the dust powering the blocks it lies on;
  // every piston beside one of those
  out.fires = observers.map((o) => {
    const back = add(o, neg(observerFace(o)));
    const lv = spreadDust([[back, 15]]), weak = underDust(lv);
    return pistons.filter((p) => N6.some((d) => weak.has(key(add(p, d))) && CONDUCT(blk(add(p, d))))).length;
  });
  // the stalk pushed out over the stream: one on from the head, down to the water
  out.overStream = heads.every((hd, i) => { let p = add(hd, pistonFace(pistons[i])); for (let k = 0; k < 6 && blk(p) === 'air'; k++) p = add(p, DIRV.down); return waterSet.has(key(p)); });
  {
    const steps = water.every((p, i) => (i === 0 ? blk(p) === 'water' && st(p, 'liquid_depth') === 0 : blk(p) === 'flowing_water' && st(p, 'liquid_depth') === i && near(p, water[i - 1])));
    const held = water.every((p) => [DIRV.north, DIRV.south, DIRV.east, DIRV.west, DIRV.down].every((d) => { const n = add(p, d), b = blk(n); return waterSet.has(key(n)) || b === 'hopper' || (b !== 'air' && b !== 'reeds' && CONDUCT(b)) || b === 'glass'; }));
    const hp = L(Fm.hopper), end = water[water.length - 1];
    const intoBarrel = blk(hp) === 'hopper' && key(add(hp, DIRV.up)) === key(end) && key(add(hp, hopperOut(hp))) === key(L(Fm.barrel)) && blk(L(Fm.barrel)) === 'barrel';
    out.stream = { steps, held, intoBarrel, length: water.length };
  }

  // ---- the clock ------------------------------------------------------------------------------------
  {
    const C = Object.fromEntries(Object.entries(M.clock).map(([k, v]) => [k, L(v)]));
    const why = [];
    if (blk(C.lever) !== 'lever' || !/^up/.test(st(C.lever, 'lever_direction')) || key(add(C.lever, DIRV.down)) !== key(C.console) || !CONDUCT(blk(C.console))) why.push('lever on its console');
    if (blk(C.piston) !== 'sticky_piston' || PF6[st(C.piston, 'facing_direction')] !== 'up' || !near(C.console, C.piston)) why.push('piston beside the console, facing up');
    if (key(add(C.piston, DIRV.up)) !== key(C.rider) || blk(C.rider) !== 'observer' || key(add(C.rider, DIRV.up)) !== key(C.inLine) || blk(C.inLine) !== 'air') why.push('rider over the piston, room over it');
    // up: the rider at inLine (its facing unchanged), the two watching each other
    const rf = observerFace(C.rider), ff = observerFace(C.fixed);
    if (blk(C.fixed) !== 'observer' || key(add(C.fixed, ff)) !== key(C.inLine) || key(add(C.inLine, rf)) !== key(C.fixed)) why.push('not watching each other in line');
    // down: the rider watching a block that never changes; the fixed one watching the empty cell
    const restWatch = add(C.rider, rf);
    if (!CONDUCT(blk(restWatch)) || blk(restWatch) === 'air') why.push('rider at rest watching something that changes');
    // their backs: the lamp, the note block with air over it
    if (key(add(C.fixed, neg(ff))) !== key(C.lamp) || blk(C.lamp) !== 'redstone_lamp') why.push('lamp');
    if (key(add(C.inLine, neg(rf))) !== key(C.note) || blk(C.note) !== 'noteblock' || blk(add(C.note, DIRV.up)) !== 'air' || blk(add(C.note, DIRV.down)) === 'air') why.push('note block');
    // nothing else powering the piston: only the console beside it conducts, and only the lever powers that
    if (N6.some((d) => { const n = add(C.piston, d); return key(n) !== key(C.console) && /redstone|lever|torch|observer/.test(blk(n)) && key(n) !== key(C.rider); })) why.push('something else beside the piston');
    out.clock = why;
  }

  // ---- on foot ------------------------------------------------------------------------------------------
  {
    const pass = (b) => b === 'air' || /sign|lantern/.test(b);
    const inLot = (x, z) => x >= M.lot.x0 && x <= M.lot.x1 && z >= M.lot.z0 && z <= M.lot.z1;
    const stand = (x, y, z) => inLot(x, z) && pass(raw(x, y, z)) && pass(raw(x, y + 1, z)) && CONDUCT(raw(x, y - 1, z)) && raw(x, y - 1, z) !== 'air';
    const [dx0, dz0] = fr.at(fr.mid, 0), s0 = [dx0, M.door[1] + lift, dz0], walk = new Set([key(s0)]), q = [s0];
    while (q.length && walk.size < 20000) { const [a, b, c] = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const n = [a + dx, b + dy, c + dz]; if (walk.has(key(n)) || !stand(...n)) continue; walk.add(key(n)); q.push(n); } }
    const cells = [...walk].map((k) => k.split(',').map(Number));
    const reachOf = (p, r = 4.5) => cells.some(([x, y, z]) => Math.hypot(x + 0.5 - (p[0] + 0.5), y + 1.6 - (p[1] + 0.5), z + 0.5 - (p[2] + 0.5)) <= r);
    out.reach = { chests: cols.every((c) => reachOf(c.chest)), input: reachOf(L(S.input)), overflow: reachOf(L(S.overflow)), lever: reachOf(L(M.clock.lever)), barrel: reachOf(L(Fm.barrel)) };
  }
  // ---- lit: the hall inside, floor to ceiling ---------------------------------------------------------------
  out.inside = new Set();
  for (let v = 1; v < fr.D - 1; v++) for (let u = 1; u < fr.W - 1; u++) out.inside.add(fr.at(u, v).join(','));
  out.yIn = [M.door[1] + lift, M.door[1] + lift + fr.H - 1];
  return out;
}

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  ({ MATERIALS } = await import('../../engine/materials.js'));
  const { buildStructures } = await import('../../engine/export.js');
  const { lightMap, spawnSpots, TARGET } = await import('../../engine/lighting.js');
  const { toJava } = await import('../../engine/java-blocks.js');
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
  const ts = cities.map(([n, r]) => [n, r, inspect(r)]);
  const all = (f) => ts.every(([, , t]) => t.built && f(t));
  check('mill: built with the factory, near it, on flat and fitted cities', ts.every(([, , t]) => t.built), ts.map(([n, r, t]) => `${n}: ${t.built ? 'built' : r.stats.millMissing || 'none'}`).join(', '));
  {
    // the summary says why when there is no lot for it
    const small = [1, 7, 42].map((seed) => generateCity({ ...DEFAULTS, ...L, size: 256, seed, minBlock: 10 }));
    note(`mill in small-block cities: ${small.map((r) => (r.landmarks.some((q) => q.kind === 'mill') ? 'built' : 'none')).join(', ')}`);
    check('mill: where no lot takes it, the summary says so', small.every((r) => r.landmarks.some((q) => q.kind === 'mill') || /no lot big enough for the mill/.test(r.stats.millMissing || '')));
  }
  check('mill: the sorter\'s line hopper to hopper, the chest at its head over the first, the last down into the barrel', all((t) => t.line && t.lineFree));
  check('mill: each filter holds 41 of its item and four named sticks (its comparator reads 2; one more, 3)', all((t) => t.columns.length === 4 && t.columns.every((c) => !c.why.includes('filter contents') && c.rest === 2 && c.more === 3)),
    ts.map(([n, , t]) => (t.columns || []).map((c) => `${c.item.replace('minecraft:', '')} ${c.rest}/${c.more}`).join(' ')).join(' | '));
  check('mill: each sorter column followed through: locked at 2, unlocked at 3; its parts where they must be; no dust reaching another column', all((t) => t.columns.every((c) => c.lockedAtRest && c.unlockedAtMore && c.why.length === 0)),
    ts.flatMap(([n, , t]) => (t.columns || []).filter((c) => !(c.lockedAtRest && c.unlockedAtMore && !c.why.length)).map((c) => `${n} ${c.item}: rest ${c.lockedAtRest} more ${c.unlockedAtMore} ${c.why.join('; ')}`)).slice(0, 3).join(' | '));
  check('mill: every cane on dirt beside water, room to grow three high', all((t) => t.canes));
  check('mill: each piston facing its cane\'s second block, the observer on it watching the third', all((t) => t.aim));
  check('mill: no observer watching a cell a piston head goes into (it would set itself off for ever)', all((t) => t.noLoop));
  check('mill: each observer\'s pulse, along the dust behind it, fires every piston', all((t) => t.fires.every((n) => n === t.fires.length)), ts.map(([n, , t]) => `${n}: ${(t.fires || []).join(',')}`).join(' | '));
  check('mill: the stalk pushed out over the stream; the stream a step shallower each block, held in, over the hopper into the barrel', all((t) => t.overStream && t.stream.steps && t.stream.held && t.stream.intoBarrel && t.stream.length <= 8), ts.map(([n, , t]) => `${n}: ${JSON.stringify(t.stream)}`).join(' | '));
  check('mill: the observer clock: lever on its console beside the sticky piston; up, the two observers watching each other; down, out of line; the lamp and the note block on their backs', all((t) => t.clock.length === 0), ts.map(([n, , t]) => `${n}: ${(t.clock || []).join('; ')}`).join(' | '));
  check('mill: reached on foot: every sorter chest, the chest at the head, the barrel at the end, the clock\'s lever, the farm\'s barrel', all((t) => Object.values(t.reach).every(Boolean)), ts.map(([n, , t]) => `${n}: ${JSON.stringify(t.reach)}`).join(' | '));
  {
    let dark = 0, spots = 0;
    for (const [, r, t] of ts) {
      if (!t.built) continue;
      const map = lightMap(r.world);
      for (const [, y, , lv] of spawnSpots(r.world, map, (x, z) => t.inside.has(x + ',' + z))) { if (y < t.yIn[0] || y > t.yIn[1]) continue; spots++; if (lv < TARGET) dark++; }
    }
    check(`mill: lit inside, every spot a mob could stand at light ${TARGET} or more`, dark === 0 && spots > 60, `${dark} dim of ${spots}`);
  }
  {
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const bad = new Set();
    for (const st of buildStructures(cities[1][1].world, {})) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
    }
    check('mill: every block one of Bedrock\'s own states (observers, pistons, comparators, repeaters, torches, hoppers, cane)', bad.size === 0, [...bad].slice(0, 4).join(', '));
  }
  {
    const wrong = MOJANG.filter(([[b, s], want]) => {
      const j = toJava(b, Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { value: v }])));
      const got = `${j.name}[${Object.entries(j.props).sort(([a], [b2]) => (a < b2 ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join(',')}]`;
      return got !== want;
    });
    check('mill: in Java, its blocks as Mojang\'s own table has them (a piston\'s facing, a wall torch\'s, a repeater\'s and comparator\'s, an observer\'s)', wrong.length === 0, wrong.map(([[b], w2]) => `${b} -> ${w2}`).join('; '));
  }
}
