// tools/checks/2zzm-bouts.js — exhibition bouts in the stadium (landmarks-extra.js).
//
// With bouts asked for, the stadium is always built (where a lot takes it), even in
// a city that would have had none. On its pitch, two pits walled and roofed in glass,
// each with an iron golem and its challenger (a vindicator, a husk), standing in
// it; a pit three high inside (a golem fits) and sealed: walked as a mob walks, a
// step or a jump of one, nothing leaves its pit (the roof keeps in what a golem
// throws). A walk of a block at least round the pits: from the players' tunnel a fan
// reaches the stands. In the pack: the fighters in the stadium's own structures,
// each tagged polis_fighter with Resistance V, kept; a stadium function to bring
// them again; under the pits a repeating command block, always active, giving every
// polis_fighter Resistance V again and again. An announcer's sign naming the bouts.
// Without bouts, no pits. Every block one of Bedrock's own states.

import { readFileSync } from 'node:fs';

export const id = '2zzm';
export const label = '2zzm. exhibition bouts in the stadium';

export default async function run(ctx) {
  const { check } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { buildStructures, buildMobStructures, functionFiles, tileList } = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const { FIGHTER_TAG } = await import('../../engine/landmarks-extra.js');
  const L = { furnish: false, villagers: 0, fish: false, bouts: true };
  check('defaults: no bouts unless asked', DEFAULTS.bouts === false);
  // (192 seed 11 has no stadium of its own without them)
  const without = generateCity({ ...DEFAULTS, furnish: false, villagers: 0, fish: false, size: 192, seed: 11 });
  const cities = [
    ['a city with no stadium of its own', generateCity({ ...DEFAULTS, ...L, size: 192, seed: 11 })],
    ['256', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7 })],
    ['hilly', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 3, hills: 2 })],
    ['320', generateCity({ ...DEFAULTS, ...L, size: 320, seed: 99 })],
  ];
  const inspect = (r) => {
    const S = r.landmarks.find((q) => q.kind === 'stadium');
    if (!S || !S.bouts) return { built: false };
    const w = r.world, B = S.bouts;
    const blk = (x, y, z) => { const i = w.get(x, y, z); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
    const out = { built: true, bad: [] };
    const G = S.fighters[0].y - 1;
    // each pit: three clear inside, glass walls and roof, its two fighters in it
    B.pits.forEach((pit, i) => {
      const cells = new Set(pit.cells.map(([x, z]) => x + ',' + z));
      for (const [x, z] of pit.cells) {
        if (![1, 2, 3].every((d) => blk(x, G + d, z) === 'air')) out.bad.push(`pit ${i}: not clear inside at ${x},${z}`);
        if (blk(x, G + 4, z) !== 'glass') out.bad.push(`pit ${i}: no roof at ${x},${z}`);
        if (blk(x, G, z) === 'air') out.bad.push(`pit ${i}: no floor`);
      }
      const inPit = S.fighters.filter((f) => cells.has(f.x + ',' + f.z) && f.y === G + 1);
      const kinds = inPit.map((f) => f.type === 'golem' ? 'golem' : f.kind).sort().join('+');
      if (inPit.length !== 2 || !/^(golem\+vindicator|golem\+husk)$/.test(kinds)) out.bad.push(`pit ${i}: ${kinds}`);
      // sealed: as a mob walks (a step, a jump of one with room over it), nothing out
      const clear = (b) => b === 'air' || /sign|lantern/.test(b);
      const key = (p) => p.join(','), seen = new Set(), q = [];
      for (const f of inPit) { seen.add(key([f.x, f.y, f.z])); q.push([f.x, f.y, f.z]); }
      while (q.length && seen.size < 500) {
        const [x, y, z] = q.pop();
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          const opts = [];
          if (clear(blk(nx, y, nz)) && clear(blk(nx, y + 1, nz))) opts.push([nx, clear(blk(nx, y - 1, nz)) ? y - 1 : y, nz]);
          if (!clear(blk(nx, y, nz)) && clear(blk(nx, y + 1, nz)) && clear(blk(nx, y + 2, nz)) && clear(blk(x, y + 2, z))) opts.push([nx, y + 1, nz]);
          for (const n of opts) if (!seen.has(key(n))) { seen.add(key(n)); q.push(n); }
        }
      }
      const out2 = [...seen].filter((k) => { const [x, , z] = k.split(',').map(Number); return !cells.has(x + ',' + z); });
      if (out2.length) out.bad.push(`pit ${i}: a fighter walks out to ${out2[0]}`);
    });
    // the command block: repeating, always on, the effect for every fighter
    const cb = w.getData(...B.command), t = cb && cb.tags;
    out.command = blk(...B.command) === 'repeating_command_block' && !!t && t.LPCommandMode.v === 1 && t.auto.v === 1
      && new RegExp(`^effect @e\\[tag=${FIGHTER_TAG}\\] resistance \\d+ 4 true$`).test(t.Command.v);
    // a fan from the tunnel round the pits to the stands
    const pass = (b) => b === 'air' || /sign|flower|torch|lantern/.test(b);
    const stand = (x, y, z) => pass(blk(x, y, z)) && pass(blk(x, y + 1, z)) && !pass(blk(x, y - 1, z)) && !/fence|glass|bars/.test(blk(x, y - 1, z));
    const [tx, ty, tz] = S.tunnel[S.tunnel.length - 1];
    const key = (p) => p.join(','), seen = new Set(), q = [];
    for (let d = -1; d <= 1; d++) if (stand(tx, ty + d, tz)) { seen.add(key([tx, ty + d, tz])); q.push([tx, ty + d, tz]); break; }
    while (q.length && seen.size < 20000) { const [a, b, c] = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const n = [a + dx, b + dy, c + dz]; if (n[0] < S.lot.x0 || n[0] > S.lot.x1 || n[2] < S.lot.z0 || n[2] > S.lot.z1 || seen.has(key(n)) || !stand(...n)) continue; seen.add(key(n)); q.push(n); } }
    out.stands = [...seen].some((k) => { const [x, y, z] = k.split(',').map(Number); return y >= G + 3 && /stairs/.test(blk(x, y, z)) === false && /stairs/.test(blk(x, y - 1, z)); });
    out.walkAround = [...seen].filter((k) => { const [, y] = k.split(',').map(Number); return y === G + 1; }).length >= 20;
    const sign = B.announcer && w.getData(...B.announcer);
    out.announcer = !!sign && /Vindicator/.test(sign.tags.FrontText.v.Text.v) && /Husk/.test(sign.tags.FrontText.v.Text.v);
    return out;
  };
  const ts = cities.map(([n, r]) => [n, r, inspect(r)]);
  const all = (f) => ts.every(([, , t]) => t.built && f(t));
  check('bouts: the stadium built with its pits, even in a city that had no stadium', ts.every(([, , t]) => t.built) && !without.landmarks.some((q) => q.kind === 'stadium'), ts.map(([n, , t]) => `${n}: ${t.built}`).join(', '));
  check('bouts: two glass pits, three clear inside, roofed, each a golem and its challenger (a vindicator, a husk), sealed (nothing walks or jumps out)', all((t) => t.bad.length === 0), ts.map(([n, , t]) => (t.bad || []).slice(0, 2).join('; ')).filter(Boolean).join(' | '));
  check('bouts: under the pits a repeating command block, always on, giving every fighter Resistance V', all((t) => t.command));
  check('bouts: from the tunnel a fan walks round the pits and up into the stands', all((t) => t.walkAround && t.stands));
  check('bouts: an announcer\'s sign naming the bouts', all((t) => t.announcer));
  {
    const r = cities[0][1], bad = [];
    const tiles = buildMobStructures(r.spawns, {}).filter((t) => t.group === 'stadium');
    const ents = tiles.flatMap((t) => decodeNbt(t.data).root.structure.entities);
    for (const e of ents) {
      if (!(e.Tags || []).includes(FIGHTER_TAG)) bad.push(`${e.identifier}: no tag`);
      if (!(e.ActiveEffects || []).some((f) => f.Id === 11 && f.Amplifier === 4 && f.Duration > 1200)) bad.push(`${e.identifier}: no Resistance V`);
      if (e.Persistent !== 1) bad.push(`${e.identifier}: not kept`);
    }
    const kinds = ents.map((e) => e.identifier).sort().join(',');
    const opts = { namespace: 'chk', spawns: r.spawns, centre: r.world.centre, places: r.places };
    const fn = functionFiles(tileList(r.world, opts), r.world, { ...opts, mobTiles: buildMobStructures(r.spawns, {}) }).find((f) => f.fn === 'chk/stadium_centered');
    check('bouts: the fighters in the stadium\'s own structures, each tagged, with Resistance V, kept; a stadium function to bring them again',
      bad.length === 0 && kinds === 'minecraft:husk,minecraft:iron_golem,minecraft:iron_golem,minecraft:vindicator' && !!fn, bad.slice(0, 3).join('; ') || kinds);
  }
  {
    const r = generateCity({ ...DEFAULTS, ...L, size: 256, seed: 1, minBlock: 10 });
    check('bouts: with no lot big enough for the stadium, the summary says so', !r.landmarks.some((q) => q.kind === 'stadium') && /17 by 21/.test(r.stats.boutsMissing || ''), r.stats.boutsMissing || 'built');
  }
  {
    const r = generateCity({ ...DEFAULTS, furnish: false, villagers: 0, fish: false, size: 320, seed: 99 });
    const S = r.landmarks.find((q) => q.kind === 'stadium');
    check('bouts: without them, the stadium as it was (no pits, no fighters)', !!S && !S.bouts && !r.spawns.some((p) => p.group === 'stadium'));
  }
  {
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const bad = new Set();
    for (const st of buildStructures(cities[0][1].world, {})) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
    }
    check('bouts: every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
  }
}
