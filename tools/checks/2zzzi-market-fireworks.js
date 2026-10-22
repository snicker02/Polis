// tools/checks/2zzzi-market-fireworks.js — the farmers' market at work and the fireworks over the
// town square (market.js, fireworks.js; 0.80.0).
//
// In three cities (one on hills, its lots riding up):
// - the market: a wandering trader in each stall, on the floor with room over it, its stall
//   closed round it a block high (the counter before it, goods on the other sides, posts at the
//   corners) under the cloth roof two over its head, so it cannot climb out; the customer's place
//   before the counter, open, two from the trader; the stall's name on a sign there;
// - each trader kept (+polis:kept), with its stall's group and not the wild one; in the pack the
//   trader's definition is the game's own with only the documented changes (its llamas and its
//   despawn timer in polis:wild, which the spawn event gives; a group per stall naming its trade
//   table, with resupply), every table in the pack, every trade emeralds for goods or goods for
//   emeralds; a market_centered function; the guide telling of it; in Java, the offers written on
//   each trader and no despawning;
// - the fireworks: five dispensers facing up round an empty cell on the fountain's column (four
//   sides and the top), each with nine stacks of rockets, every stack a burst; the cell closed in
//   (the column under it); the lever on the town hall's front wall (a wall behind it), a sign by
//   it; under the fountain a repeating command block whose command looks at that very lever and
//   sets redstone in that very cell, the chain block it faces taking it away four ticks later;
//   the town square there whenever fireworks are asked for; the guide telling of it;
// - every block one of Bedrock's own states, and in Java one Java has.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zzzi';
export const label = '2zzzi. the farmers\' market and the fireworks';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { STALLS, tradeFiles, traderDef, stallGroup } = await import('../../engine/market.js');
  const { VANILLA_MOBS } = await import('../../engine/mob-entities.js');
  const { FIREWORKS } = await import('../../engine/fireworks.js');
  const ex = await import('../../engine/export.js');
  const { javaEntity } = await import('../../engine/java-entities.js');
  const { J } = await import('../../engine/export-java.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const { toJava } = await import('../../engine/java-blocks.js');
  const { loadJavaBlocks } = await import('../check-java-blocks.mjs');

  check('defaults: no farmers\' market traders and no fireworks unless asked', DEFAULTS.farmersMarket === false && DEFAULTS.fireworks === false);
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8'), mainJs = readFileSync(join(ROOT, 'main.js'), 'utf8');
  check('offered in the page (and remembered with the settings)', /id="farmersMarket"/.test(html) && /id="fireworks"/.test(html) && /'farmersMarket', 'fireworks'/.test(mainJs));

  const L = { furnish: false, villagers: 0, fish: false, farmersMarket: true, fireworks: true };
  const cities = [
    ['192', generateCity({ ...DEFAULTS, ...L, size: 192, seed: 7 })],
    ['256 on hills', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 11, hills: 3 })],
    ['160 medieval', generateCity({ ...DEFAULTS, ...L, size: 160, seed: 3, cityStyle: 'medieval' })],
  ];
  const blkOf = (w) => (x, y, z) => { const i = w.get(x, y, z); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
  const statesOf = (w) => (x, y, z) => { const i = w.get(x, y, z); return i < 0 ? {} : MATERIALS.def(i).states; };
  const sv = (v) => (v && typeof v === 'object' ? v.value : v);
  const res = cities.map(([n, r]) => {
    const w = r.world, blk = blkOf(w), st = statesOf(w), out = { n };
    // ---- the market
    const MK = r.landmarks.find((q) => q.kind === 'market');
    const tr = r.spawns.filter((p) => p.group === 'market');
    out.traders = tr.length;
    const bad = [];
    for (const t of tr) {
      const { x, y, z } = t;
      if (blk(x, y, z) !== 'air' || blk(x, y + 1, z) !== 'air' || blk(x, y - 1, z) === 'air') bad.push('room');
      // the stall round it: each side a block (no gap), the corners posts; the roof over all nine
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const b = blk(x + dx, y, z + dz); if (b === 'air' || /flower|sign|carpet/.test(b)) bad.push('side open'); }
      for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (blk(x + dx, y, z + dz) !== 'oak_fence' || blk(x + dx, y + 1, z + dz) !== 'oak_fence') bad.push('post');
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (blk(x + dx, y + 2, z + dz) === 'air') bad.push('roof');
      const [sx, sy, sz] = t.stand, [cx, cy, cz] = t.counter;
      if (!/^(air|standing_sign)$/.test(blk(sx, sy, sz)) || blk(sx, sy + 1, sz) !== 'air' || blk(sx, sy - 1, sz) === 'air') bad.push('customer\'s place');      // (a sign is walked through)
      if (Math.abs(sx - x) + Math.abs(sz - z) !== 2 || Math.abs(cx - x) + Math.abs(cz - z) !== 1 || blk(cx, cy, cz) !== 'oak_planks') bad.push('counter');
      if (!t.sign || !/standing_sign/.test(blk(...t.sign)) || !JSON.stringify(w.getData(...t.sign) || {}, (k, v) => (typeof v === 'bigint' ? String(v) : v)).includes(t.name.split(' ')[0])) bad.push('sign');
      if (t.kind !== 'wandering_trader' || !t.groups.includes(stallGroup(t.stall)) || !t.name) bad.push('trader');
    }
    out.marketBad = [...new Set(bad)];
    out.stallsAll = MK && MK.stalls.length === tr.length;
    // ---- the fireworks
    const F = r.fireworks;
    out.fw = !!F;
    if (F) {
      const why = [];
      const [px, py, pz] = F.pulse;
      if (blk(px, py, pz) !== 'air' || blk(px, py - 1, pz) === 'air') why.push('pulse cell');
      for (const d of F.dispensers) {
        if (blk(...d) !== 'dispenser' || sv(st(...d).facing_direction) !== 1) why.push('dispenser');
        if (Math.abs(d[0] - px) + Math.abs(d[1] - py) + Math.abs(d[2] - pz) !== 1) why.push('not by the cell');
        if (blk(d[0], d[1] + 1, d[2]) !== 'air' && !(d[1] === py && d[0] === px && d[2] === pz)) { if (!(d[0] === px && d[2] === pz)) why.push('nothing over it'); }
        const items = (w.getData(...d) || { tags: { Items: { v: [] } } }).tags.Items.v;
        if (items.length !== 9 || !items.every((it) => it.v.Name.v === 'minecraft:firework_rocket' && it.v.Count.v === 64 && it.v.tag.v.Fireworks.v.Explosions.v.length === 1)) why.push('rockets');
      }
      if (F.dispensers.length !== 5) why.push('five');
      // the lever: on a wall, facing out from it
      const [lx, ly, lz] = F.lever, ld = sv(st(lx, ly, lz).lever_direction);
      const back = { north: [0, 1], south: [0, -1], east: [-1, 0], west: [1, 0] }[ld];
      if (blk(lx, ly, lz) !== 'lever' || !back || blk(lx + back[0], ly, lz + back[1]) === 'air' || sv(st(lx, ly, lz).open_bit) !== 0) why.push('lever');
      if (!F.sign || !/wall_sign/.test(blk(...F.sign))) why.push('sign');
      // the clock: its command names the lever and the cell, from where the block stands
      const [C, C2] = F.clock;
      const d1 = w.getData(...C), d2 = w.getData(...C2);
      const off = (s) => s.split(' ').map((t) => (t === '~' ? 0 : Number(t.slice(1))));
      const m1 = d1 && d1.tags.Command.v.match(/^execute if block (\S+ \S+ \S+) lever \["open_bit"=true\] run setblock (\S+ \S+ \S+) redstone_block$/);
      const m2 = d2 && d2.tags.Command.v.match(/^setblock (\S+ \S+ \S+) air$/);
      const at = (base, o) => [base[0] + o[0], base[1] + o[1], base[2] + o[2]];
      if (!m1 || at(C, off(m1[1])).join() !== F.lever.join() || at(C, off(m1[2])).join() !== F.pulse.join()) why.push('on command');
      if (!m2 || at(C2, off(m2[1])).join() !== F.pulse.join()) why.push('off command');
      if (blk(...C) !== 'repeating_command_block' || d1.tags.TickDelay.v !== FIREWORKS.EVERY || d1.tags.auto.v !== 1) why.push('repeating block');
      const FACE = { 2: [0, -1], 3: [0, 1], 4: [-1, 0], 5: [1, 0] }, f = FACE[sv(st(...C).facing_direction)];
      if (blk(...C2) !== 'chain_command_block' || !f || C[0] + f[0] !== C2[0] || C[2] + f[1] !== C2[2] || d2.tags.TickDelay.v !== FIREWORKS.PULSE || d2.tags.LPCommandMode.v !== 2) why.push('chain block');
      out.fwBad = why;
    }
    return out;
  });
  const all = (f) => res.every(f);
  const say = (f) => res.map((t) => `${t.n}: ${JSON.stringify(f(t))}`).join(' | ');
  check('the farmers\' market: a wandering trader in every stall (four and more)', all((t) => t.traders >= 4 && t.stallsAll), say((t) => t.traders));
  check('each trader in its stall with room over it, closed round a block high under the cloth roof (no way to climb out), the counter before it, the customer\'s place open two from it, the stall\'s name on a sign there', all((t) => t.marketBad.length === 0), say((t) => t.marketBad));
  check('the fireworks: the town square there whenever they are asked for; five dispensers facing up round an empty cell on the fountain\'s column, nine stacks of rockets in each, every stack a burst', all((t) => t.fw && !(t.fwBad || []).some((q) => /pulse|dispenser|by the cell|rockets|five|nothing/.test(q))), say((t) => t.fwBad || 'none'));
  check('the lever on the town hall\'s front wall, off, a sign by it; the clock under the fountain: its command looks at that lever and sets redstone in that cell, the chain block it faces takes it away four ticks later', all((t) => t.fw && t.fwBad.length === 0), say((t) => t.fwBad));

  // ---- the pack: the trader's definition, the tables, the functions, the guide; Java
  {
    const r = cities[0][1];
    const mobs = ex.buildMobStructures(r.spawns, { seed: 1 });
    const ents = mobs.filter((t) => t.group === 'market').flatMap((t) => decodeNbt(t.data).root.structure.entities);
    const entOk = ents.length === r.spawns.filter((p) => p.group === 'market').length && ents.every((e) => e.identifier === 'minecraft:wandering_trader' && e.definitions.includes('+polis:kept')
      && e.definitions.some((d) => /^\+polis:stall_/.test(d)) && !e.definitions.includes('+polis:wild'));
    check('in the structures: each trader the game\'s wandering trader, kept, with its stall\'s group and not the wild one', entOk, `${ents.length} traders`);
    const file = ex.mobEntityFiles().find((f) => f.name === 'entities/wandering_trader.json');
    const d = JSON.parse(file.data), e = d['minecraft:entity'], van = VANILLA_MOBS.wandering_trader['minecraft:entity'];
    const wild = e.component_groups['polis:wild'];
    let same = !!wild && JSON.stringify(wild['minecraft:spawn_entity']) === JSON.stringify(van.components['minecraft:spawn_entity']) && JSON.stringify(wild['minecraft:timer']) === JSON.stringify(van.components['minecraft:timer'])
      && !e.components['minecraft:spawn_entity'] && !e.components['minecraft:timer'] && JSON.stringify(e.events['minecraft:entity_spawned']) === JSON.stringify({ add: { component_groups: ['polis:wild'] } });
    const tables = tradeFiles();
    for (const s of STALLS) {
      const g = e.component_groups[stallGroup(s.id)];
      if (!g || g['minecraft:economy_trade_table'].table !== `trading/polis_market/${s.id}.json` || !g['minecraft:trade_resupply'] || !tables.some((t) => t.name === g['minecraft:economy_trade_table'].table)) same = false;
    }
    // (the rest as the game has it: put back what we moved, take off what we added)
    const back = JSON.parse(file.data), be = back['minecraft:entity'];
    Object.assign(be.components, be.component_groups['polis:wild']);
    for (const k of ['polis:wild', 'polis:kept', ...STALLS.map((s) => stallGroup(s.id))]) delete be.component_groups[k];
    delete be.events['minecraft:entity_spawned']; delete be.events['polis:keep'];
    const sortKeys = (o) => (Array.isArray(o) ? o.map(sortKeys) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])])) : o);
    same = same && JSON.stringify(sortKeys(back)) === JSON.stringify(sortKeys(VANILLA_MOBS.wandering_trader)) && !!e.component_groups['polis:kept'];
    check('the trader\'s definition in the pack: the game\'s own, its llamas and despawn timer moved into polis:wild (given by its spawn event), a group per stall naming its table (in the pack) with resupply, kept; nothing else changed', same);
    const tradesOk = tables.length === STALLS.length && tables.every((t) => { const j = JSON.parse(t.data), tr = j.tiers[0].groups[0].trades; return tr.length >= 5 && tr.every((q) => q.max_uses > 0 && q.wants.length === 1 && q.gives.length === 1 && /^minecraft:[a-z_]+$/.test(q.wants[0].item) && /^minecraft:[a-z_]+$/.test(q.gives[0].item) && (q.wants[0].item === 'minecraft:emerald') !== (q.gives[0].item === 'minecraft:emerald')); });
    check('every stall\'s table: five trades and more, each emeralds for goods or goods for emeralds', tradesOk);
    const opts = { namespace: 'chk', prefix: 'c', spawns: r.spawns, places: r.places, centre: r.world.centre, world: r.world };
    const fns = ex.functionFiles(ex.tileList(r.world, opts), r.world, { ...opts, mobTiles: mobs });
    const guide = ex.placementGuide(ex.tileList(r.world, opts), { ...opts });
    const pk = await ex.exportPack(r.world, { namespace: 'chk', name: 'chk', spawns: r.spawns, places: r.places, deflateRaw: ctx.deflateRaw });
    const { readZipEntries } = await import('../../engine/worldfile.js');
    const names = readZipEntries(pk.data).entries.map((q) => q.name);
    check('the pack: the trader\'s definition and every stall\'s table in it; a market_centered function; the guide telling of the market and the fireworks',
      names.some((q) => /entities\/wandering_trader\.json$/.test(q)) && STALLS.every((s) => names.some((q) => q.endsWith(`trading/polis_market/${s.id}.json`)))
      && fns.some((f) => f.fn === 'chk/market_centered') && /THE FARMERS' MARKET/.test(guide) && /FIREWORKS:/.test(guide), `${names.filter((q) => /trading\//.test(q)).length} tables`);
    const t0 = r.spawns.find((p) => p.group === 'market'), s0 = STALLS.find((s) => s.id === t0.stall);
    const je = javaEntity(t0, J);
    check('in Java: each trader a wandering trader with its stall\'s offers written on it, never despawning', !!je && je.id === 'minecraft:wandering_trader' && je.nbt.DespawnDelay[1] === 0
      && je.nbt.Offers[1].Recipes[1].items.length === s0.sells.length + s0.buys.length);
  }
  // ---- Bedrock states, Java blocks
  {
    const states = JSON.parse(readFileSync(join(ROOT, 'tools', 'bedrock-states.json'), 'utf8'))['1.21.60'];
    const java = loadJavaBlocks();
    const bad = new Set(), jbad = new Set();
    for (const s of ex.buildStructures(cities[0][1].world, {})) for (const p of decodeNbt(s.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
      const j = toJava(p.name, Object.fromEntries(Object.entries(p.states).map(([k, v]) => [k, { value: typeof v === 'object' ? v.value : v }])), n === 'noteblock' ? { note: 12, instrument: 'harp' } : {});
      const props = java.get(j.name);
      if (!props) jbad.add(j.name); else for (const [k, v] of Object.entries(j.props)) if (!props.has(k) || !props.get(k).has(String(v))) jbad.add(`${j.name}.${k}=${v}`);
    }
    check('every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
    check('in Java, every block a block Java has, with its own states', jbad.size === 0, [...jbad].slice(0, 6).join(', '));
  }
  note(res.map((t) => `${t.n}: ${t.traders} traders, fireworks ${t.fw}`).join('; '));
}
