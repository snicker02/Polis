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
    const w = r.world, B = S.bouts, P = S.pitch;
    const blk = (x, y, z) => { const i = w.get(x, y, z); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
    const out = { built: true, bad: [] };
    const G = S.fighters[0].y - 1;
    const onPitch = (x, z) => x >= P.x0 && x <= P.x1 && z >= P.z0 && z <= P.z1;
    // the fighters on the pitch, room over them (a golem stands near three high)
    const kinds = S.fighters.map((f) => f.type === 'golem' ? 'golem' : f.kind).sort().join('+');
    if (kinds !== 'golem+golem+husk+vindicator') out.bad.push(`fighters ${kinds}`);
    for (const f of S.fighters) if (!onPitch(f.x, f.z) || ![0, 1, 2].every((d) => blk(f.x, f.y + d, f.z) === 'air') || blk(f.x, f.y - 1, f.z) === 'air') out.bad.push(`${f.kind || f.type} not standing on the pitch`);
    // walled four high all round: every cell round the pitch solid from G+1 to G+4
    for (let x = P.x0 - 1; x <= P.x1 + 1; x++) for (let z = P.z0 - 1; z <= P.z1 + 1; z++) {
      if (onPitch(x, z)) continue;
      if (![1, 2, 3, 4].every((d) => blk(x, G + d, z) !== 'air')) { out.bad.push(`the wall low at ${x},${z}`); break; }
    }
    // sealed: as a mob walks (a step, a jump of one with room over it), nothing off the pitch
    const clear = (b) => b === 'air' || /sign|lantern|flower|tulip|grass$/.test(b) && !/grass_block/.test(b);
    const key = (p) => p.join(','), seen = new Set(), q = [];
    for (const f of S.fighters) { seen.add(key([f.x, f.y, f.z])); q.push([f.x, f.y, f.z]); }
    while (q.length && seen.size < 5000) {
      const [x, y, z] = q.pop();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, opts = [];
        if (clear(blk(nx, y, nz)) && clear(blk(nx, y + 1, nz))) opts.push([nx, clear(blk(nx, y - 1, nz)) ? y - 1 : y, nz]);
        if (!clear(blk(nx, y, nz)) && clear(blk(nx, y + 1, nz)) && clear(blk(nx, y + 2, nz)) && clear(blk(x, y + 2, z))) opts.push([nx, y + 1, nz]);
        for (const n of opts) if (!seen.has(key(n))) { seen.add(key(n)); q.push(n); }
      }
    }
    const off = [...seen].find((k) => { const [x, , z] = k.split(',').map(Number); return !onPitch(x, z); });
    if (off) out.bad.push(`a fighter walks off the pitch to ${off}`);
    // one command block in the stadium: the silent backstop under the pitch, repeating
    // every two seconds, reporting nothing
    let cmds = 0;
    for (let x = S.lot.x0; x <= S.lot.x1; x++) for (let z = S.lot.z0; z <= S.lot.z1; z++) for (let y = G - 3; y <= G + 14; y++) if (/command_block/.test(blk(x, y, z))) cmds++;
    const cb = B.command && w.getData(...B.command), t = cb && cb.tags;
    out.commands = cmds === 1 && blk(...B.command) === 'repeating_command_block' && !!t && t.TrackOutput.v === 0 && t.TickDelay.v >= 40 && t.auto.v === 1
      && new RegExp(`^effect @e\\[tag=${FIGHTER_TAG}\\] resistance \\d+ 4 true$`).test(t.Command.v);
    // a fan from the street up the stair into the stands, never onto the pitch
    const pass = (b) => b === 'air' || /sign|flower|torch|lantern/.test(b);
    const stand = (x, y, z) => pass(blk(x, y, z)) && pass(blk(x, y + 1, z)) && !pass(blk(x, y - 1, z)) && !/fence|glass|bars/.test(blk(x, y - 1, z));
    const [Fx, Fz] = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }[S.face || 'south'] || [0, 1];
    const foot = B.stair[0], sx = foot[0] + Fx, sz = foot[2] + Fz;
    const walk = new Set(), wq = [];
    for (let d = -2; d <= 3; d++) if (stand(sx, foot[1] + d, sz)) { walk.add(key([sx, foot[1] + d, sz])); wq.push([sx, foot[1] + d, sz]); break; }
    const lo = S.lot;
    while (wq.length && walk.size < 20000) { const [a, b, c] = wq.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const n = [a + dx, b + dy, c + dz]; if (n[0] < lo.x0 - 1 || n[0] > lo.x1 + 1 || n[2] < lo.z0 - 1 || n[2] > lo.z1 + 1 || walk.has(key(n)) || !stand(...n)) continue; if (dy === 1 && !pass(blk(a, b + 2, c))) continue; walk.add(key(n)); wq.push(n); } }
    out.fansStart = walk.size > 0;
    out.stands = [...walk].some((k) => { const [x, y, z] = k.split(',').map(Number); return y >= G + 5 && /stairs/.test(blk(x, y - 1, z)) && Math.max(Math.abs(x - (P.x0 + P.x1) / 2) - (P.x1 - P.x0) / 2, Math.abs(z - (P.z0 + P.z1) / 2) - (P.z1 - P.z0) / 2) <= 1.5; });
    out.fansOnPitch = [...walk].some((k) => { const [x, y, z] = k.split(',').map(Number); return onPitch(x, z) && y <= G + 2; });
    const sign = B.announcer && w.getData(...B.announcer);
    out.announcer = !!sign && /Vindicator/.test(sign.tags.FrontText.v.Text.v) && /Husk/.test(sign.tags.FrontText.v.Text.v);
    return out;
  };
  const ts = cities.map(([n, r]) => [n, r, inspect(r)]);
  const all = (f) => ts.every(([, , t]) => t.built && f(t));
  check('bouts: the stadium built with them, even in a city that had no stadium', ts.every(([, , t]) => t.built) && !without.landmarks.some((q) => q.kind === 'stadium'), ts.map(([n, , t]) => `${n}: ${t.built}`).join(', '));
  check('bouts: two golems, a vindicator and a husk on the pitch, walled four high all round, sealed (nothing walks, jumps or is thrown off it)', all((t) => t.bad.length === 0), ts.map(([n, , t]) => (t.bad || []).slice(0, 2).join('; ')).filter(Boolean).join(' | '));
  check('bouts: one command block, silent (no output, every two seconds), giving the fighters Resistance V again', all((t) => t.commands));
  {
    const r = cities[0][1];
    const opts = { namespace: 'chk', spawns: r.spawns, centre: r.world.centre, places: r.places };
    const fns = functionFiles(tileList(r.world, opts), r.world, opts);
    const quiet = ['build', 'build_centered'].every((n) => { const f = fns.find((q) => q.fn === 'chk/' + n); return !!f && f.text.split('\n').includes('gamerule commandblockoutput false'); });
    const plain = generateCity({ ...DEFAULTS, furnish: false, villagers: 0, fish: false, size: 160, seed: 3 });
    const pf = functionFiles(tileList(plain.world, {}), plain.world, { namespace: 'chk' }).find((q) => q.fn === 'chk/build');
    check('bouts: build turns the game\'s command block chat off (only where the city has a command block)', quiet && !pf.text.includes('commandblockoutput'));
  }
  check('bouts: a fan walks from the street up the stair into the stands round the pitch, and not onto the pitch', all((t) => t.fansStart && t.stands && !t.fansOnPitch), ts.map(([n, , t]) => `${n}: ${t.fansStart}/${t.stands}/${t.fansOnPitch}`).join(', '));
  check('bouts: an announcer\'s sign naming the bouts', all((t) => t.announcer));
  {
    const r = cities[0][1], bad = [];
    const tiles = buildMobStructures(r.spawns, {}).filter((t) => t.group === 'stadium');
    const ents = tiles.flatMap((t) => decodeNbt(t.data).root.structure.entities);
    for (const e of ents) {
      if (!(e.Tags || []).includes(FIGHTER_TAG)) bad.push(`${e.identifier}: no tag`);
      if (!(e.ActiveEffects || []).some((f) => f.Id === 11 && f.Amplifier === 4 && f.Duration >= 1e9)) bad.push(`${e.identifier}: no lasting Resistance V`);
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
    // without them: the tunnel onto the pitch, and from it a step up into the stands
    const w = r.world, blk = (x, y, z) => { const i = w.get(x, y, z); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
    const pass = (b) => b === 'air' || /sign|flower|torch|lantern/.test(b);
    const stand = (x, y, z) => pass(blk(x, y, z)) && pass(blk(x, y + 1, z)) && !pass(blk(x, y - 1, z)) && !/fence|glass|bars/.test(blk(x, y - 1, z));
    const key = (p) => p.join(','), seen = new Set(), q = [];
    const t0 = S.tunnel[S.tunnel.length - 1];
    for (let d = -1; d <= 1; d++) if (stand(t0[0], t0[1] + d, t0[2])) { seen.add(key([t0[0], t0[1] + d, t0[2]])); q.push([t0[0], t0[1] + d, t0[2]]); break; }
    while (q.length && seen.size < 20000) { const [a, b, c] = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const n = [a + dx, b + dy, c + dz]; if (n[0] < S.lot.x0 || n[0] > S.lot.x1 || n[2] < S.lot.z0 || n[2] > S.lot.z1 || seen.has(key(n)) || !stand(...n)) continue; seen.add(key(n)); q.push(n); } }
    const G0 = t0[1] - 1;
    const upIn = [...seen].some((k) => { const [x, y, z] = k.split(',').map(Number); return y >= G0 + 3 && /stairs/.test(blk(x, y - 1, z)); });
    check('stadium (without bouts): as it was, no fighters; from the tunnel a step up into the stands', !!S && !S.bouts && !r.spawns.some((p) => p.group === 'stadium') && S.steps.length === 2 && upIn);
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
