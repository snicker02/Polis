// tools/checks/2zzk-memorial.js — names in the cemetery (landmarks-extra.js: cemetery).
//
// The names typed in, and only those: with none, no memorial and no named stone
// (the defaults empty). With names, the city always has its cemetery, where a lot
// takes it, even a city that would have had none. The memorial: a stone for each
// person (up to three) side by side at the far end of the path, each with a sign
// before it, facing the gate, reading "In loving memory" and the name (a line with
// a / in it laid out as typed, a line of the sign a part); a cherry tree behind
// them, a lantern, flowers, a bench looking at them; reached on foot from the gate.
// The other names on signs before graves' stones, the nearest the gate first, one
// each. A place of its own in Find a landmark and a goto. Raised with a hilly lot.
// Control characters taken out, a line cut at ninety. Every block one of Bedrock's
// own states.

import { readFileSync } from 'node:fs';

export const id = '2zzk';
export const label = '2zzk. names in the cemetery';

export default async function run(ctx) {
  const { check } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { namesOf } = await import('../../engine/landmarks-extra.js');
  const { buildStructures, functionFiles, tileList } = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const L = { furnish: false, villagers: 0, fish: false };
  check('defaults: no names in the cemetery unless typed', DEFAULTS.memorial === '' && DEFAULTS.graveNames === '');
  const NAMES = { memorial: 'Mary\nDon / 1940 - 2020', graveNames: 'Alice\nBob / Beloved father\nCarol' };
  // (256 seed 7 and 256 seed 1 have no cemetery without names; 320 seed 99 has one)
  const cases = [
    ['a city with no cemetery of its own', { size: 256, seed: 7 }],
    ['another', { size: 256, seed: 1 }],
    ['a city with its cemetery', { size: 320, seed: 99 }],
  ];
  const inspect = (r) => {
    const C = r.landmarks.find((Lm) => Lm.kind === 'cemetery');
    if (!C) return { built: false };
    const w = r.world;
    const blk = (x, y, z) => { const i = w.get(x, y, z); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
    const text = (p) => { const d = w.getData(...p); return d && d.id === 'Sign' ? d.tags.FrontText.v.Text.v : null; };
    const out = { built: true, bad: [] };
    const M = C.memorial;
    if (!M) { out.memorial = false; return out; }
    out.memorial = true;
    out.people = M.signs.map((s) => s.name);
    out.texts = M.signs.map((s) => text(s.at));
    // each stone, its sign before it (between it and the gate), facing the gate
    M.stones.forEach((st, i) => {
      const sg = M.signs[i].at;
      if (!/^quartz_(block|pillar)$/.test(blk(...st)) || blk(st[0], st[1] + 1, st[2]) !== 'chiseled_quartz_block') out.bad.push(`stone ${i}: ${blk(...st)}`);
      if (!/standing_sign/.test(blk(...sg))) out.bad.push(`sign ${i}: ${blk(...sg)}`);
      if (Math.abs(sg[0] - st[0]) + Math.abs(sg[2] - st[2]) !== 1) out.bad.push(`sign ${i} not before its stone`);
      const toGate = Math.abs(sg[0] - C.gate[0]) + Math.abs(sg[2] - C.gate[2]) < Math.abs(st[0] - C.gate[0]) + Math.abs(st[2] - C.gate[2]);
      if (!toGate) out.bad.push(`sign ${i} behind its stone`);
    });
    if (blk(...M.tree) !== 'cherry_log') out.bad.push('no cherry tree');
    let leaves = 0; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let y = 3; y <= 6; y++) if (blk(M.tree[0] + a, M.tree[1] + y, M.tree[2] + b) === 'cherry_leaves') leaves++;
    if (leaves < 20) out.bad.push(`${leaves} leaves`);
    if (M.lantern && blk(...M.lantern) !== 'lantern') out.bad.push('no lantern');
    if (M.bench.filter((b) => /oak_stairs/.test(blk(...b))).length !== 2) out.bad.push('no bench');
    if (M.flowers.length < 4 || !M.flowers.every((f) => /tulip|lily/.test(blk(...f)))) out.bad.push('flowers');
    // on foot from the gate to the memorial
    const pass = (b) => b === 'air' || /sign|tulip|lily|flower|poppy|dandelion|orchid|allium|bluet|daisy|cornflower/.test(b);
    const stand = (x, y, z) => pass(blk(x, y, z)) && pass(blk(x, y + 1, z)) && !pass(blk(x, y - 1, z));
    const key = (p) => p.join(','), lo = C.lot;
    let s0 = null; for (let d = -3; d <= 4 && !s0; d++) if (stand(C.gate[0], C.gate[1] + d, C.gate[2])) s0 = [C.gate[0], C.gate[1] + d, C.gate[2]];
    const seen = new Set(s0 ? [key(s0)] : []), q = s0 ? [s0] : [];
    while (q.length && seen.size < 5000) { const [a, b, c] = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) { const n = [a + dx, b + dy, c + dz]; if (n[0] < lo.x0 - 1 || n[0] > lo.x1 + 1 || n[2] < lo.z0 - 1 || n[2] > lo.z1 + 1 || seen.has(key(n)) || !stand(...n)) continue; seen.add(key(n)); q.push(n); } }
    out.reached = seen.has(key(M.stand));
    // the other names
    out.named = C.named.length;
    out.namedOk = C.named.every((n) => /standing_sign/.test(blk(...n.at)) && text(n.at) === n.text && Math.abs(n.at[0] - n.grave[0]) + Math.abs(n.at[2] - n.grave[2]) === 1 && blk(...n.grave) !== 'air');
    out.namedTexts = C.named.map((n) => n.text);
    out.place = r.places.find((P) => P.kind === 'memorial');
    return out;
  };
  const withNames = cases.map(([n, c]) => [n, generateCity({ ...DEFAULTS, ...L, ...c, ...NAMES })]);
  const ts = withNames.map(([n, r]) => [n, r, inspect(r)]);
  const all = (f) => ts.every(([, , t]) => t.built && t.memorial && f(t));
  check('cemetery: with names typed in, always built (even in a city that had none)', ts.every(([, , t]) => t.built), ts.map(([n, , t]) => `${n}: ${t.built ? 'built' : 'none'}`).join(', '));
  check('memorial: a stone for each person side by side, each with its sign before it facing the gate', all((t) => t.bad.filter((b) => /stone|sign/.test(b)).length === 0 && t.people.length === 2), ts.map(([, , t]) => (t.bad || []).join('; ')).filter(Boolean).join(' | '));
  check('memorial: the signs read "In loving memory" and the name, or the lines as typed', all((t) => t.texts[0] === 'In loving memory\nMary' && t.texts[1] === 'Don\n1940 - 2020' && t.people.join('&') === 'Mary&Don'), ts.map(([, , t]) => JSON.stringify(t.texts)).join(' '));
  check('memorial: under a cherry tree, a lantern, flowers, a bench looking at them', all((t) => t.bad.filter((b) => !/stone|sign/.test(b)).length === 0), ts.map(([, , t]) => (t.bad || []).join('; ')).filter(Boolean).join(' | '));
  check('memorial: reached on foot from the cemetery gate', all((t) => t.reached));
  check('gravestones: the other names on signs before stones, one each, nearest the gate first', all((t) => t.named === 3 && t.namedOk && t.namedTexts.join('|') === 'Alice|Bob\nBeloved father|Carol'), ts.map(([, , t]) => `${t.named} ${t.namedOk}`).join(', '));
  {
    const r = withNames[0][1], P = ts[0][2].place;
    const opts = { namespace: 'chk', places: r.places, spawns: r.spawns, centre: r.world.centre, world: r.world };
    const go = functionFiles(tileList(r.world, opts), r.world, opts).find((f) => f.fn === 'chk/goto_memorial');
    check('memorial: a place of its own (Find a landmark, goto_memorial)', !!P && P.name === 'Memorial: Mary & Don' && !!go);
  }
  // only what was typed: no names, no memorial; three at most; control characters out
  {
    const r = generateCity({ ...DEFAULTS, ...L, size: 320, seed: 99 });
    const C = r.landmarks.find((Lm) => Lm.kind === 'cemetery');
    check('cemetery: with no names typed, no memorial and no named stone', !!C && !C.memorial && C.named.length === 0 && !r.places.some((P) => P.kind === 'memorial'));
    const n = namesOf('  A\u0007nne \n\n' + 'x'.repeat(200) + '\nB\nC\nD');
    check('names: blank lines skipped, control characters out, a line cut at ninety', n[0] === 'Anne' && n[1].length === 90 && n.length === 5 && namesOf('a\nb\nc\nd', 3).length === 3);
  }
  // on a hilly lot, raised with it
  {
    const fx = JSON.parse(readFileSync(new URL('./site-1004954.json', import.meta.url), 'utf8'));
    const ground = new Int16Array(Uint8Array.from(Buffer.from(fx.ground, 'base64')).buffer);
    const water = Uint8Array.from(Buffer.from(fx.water, 'base64'));
    const r = generateCity({ ...DEFAULTS, ...fx.settings, ...L, ...NAMES, terrain: { ground, water, baseY: fx.baseY } });
    const t = inspect(r);
    check('memorial: on a fitted city, raised with its lot (every part where it is said to be)', t.built && (!t.memorial || (t.bad.length === 0 && t.reached)) || /cemetery/.test(r.stats.cemeteryMissing || ''),
      t.built ? (t.memorial ? (t.bad.join('; ') || 'ok') : 'no room') : r.stats.cemeteryMissing);
  }
  {
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const bad = new Set();
    for (const st of buildStructures(withNames[0][1].world, {})) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
    }
    check('memorial: every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
  }
}
