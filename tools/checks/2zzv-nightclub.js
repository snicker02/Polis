// tools/checks/2zzv-nightclub.js — the nightclub (club.js): a dance floor, a bar, and a
// jukebox panel of six buttons, each playing a song of note blocks from the floors above.
//
// - offered in the page, off by default; built where asked in two cities;
// - six songs, six genres, six titles, no word of a title in another; every song at
//   least seventy steps and fifteen seconds; a song from a seed the same again, another
//   seed another song;
// - every note block with air over it and its instrument's block under it (the melody's
//   by its genre, the rhythm's by its part: the bass on planks, the kick on stone, the
//   snare on sand on a solid block, the hat on glass), its pitch the song's; no note block
//   beside another; every repeater straight between the cell before it and the one after;
// - run (redsim.js): at rest nothing stirs; each button plays its own song and no other
//   note: every note once, at the song's own times, melody and rhythm together; its lamp
//   lit while the button is in; pressed again, the same again;
// - the panel walked to on foot from the street through the doors; nothing on the lot
//   dark, the machine floors over the club included;
// - a jukebox and a chest of every disc; barrels behind the bar;
// - every block one of Bedrock's own states, and in Java one Java has.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zzv';
export const label = '2zzv. the nightclub';

const key = (p) => p.join(',');
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { composeSong, SONGS } = await import('../../engine/club.js');
  const { makeSim } = await import('./redsim.js');
  const { buildStructures } = await import('../../engine/export.js');
  const { lightMap, spawnSpots } = await import('../../engine/lighting.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const { toJava } = await import('../../engine/java-blocks.js');
  const { loadJavaBlocks } = await import('../check-java-blocks.mjs');
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  check('nightclub: offered in the page, off by default', /<input type="checkbox" id="nightclub">/.test(html) && DEFAULTS.nightclub === false);

  const MEL_UNDER = { bells: 'gold_block', flute: 'clay', chimes: 'packed_ice', xylophone: 'bone_block', 'iron xylophone': 'iron_block', pling: 'glowstone',
    bit: 'emerald_block', banjo: 'hay_block', 'cow bell': 'soul_sand', harp: 'moss_block', guitar: 'white_wool' };
  const RHY_UNDER = { bass: 'oak_planks', kick: 'stone', snare: 'sand', hat: 'glass' };
  const cities = [
    ['hilly 224', generateCity({ ...DEFAULTS, size: 224, seed: 7, nightclub: true })],
    ['flat 192', generateCity({ ...DEFAULTS, size: 192, seed: 3, hills: 0, nightclub: true })],
  ];
  const results = [];
  for (const [name, r] of cities) {
    const c = r.landmarks.find((q) => q.kind === 'nightclub');
    if (!c) { results.push({ name, built: false }); continue; }
    const w = r.world;
    const raw = (p) => { const i = w.get(...p); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
    const s0 = c.songs[0];
    let e = 0; for (let d = -3; d <= 14; d++) if (/button/.test(raw([s0.button[0], s0.button[1] + d, s0.button[2]]))) { e = d; break; }
    const L = (p) => [p[0], p[1] + e, p[2]];
    const v = verifyAll(w, r.buildings);
    const out = { name, built: true, walks: v.ok === v.total && !r.reach.unreached.length && r.stats.lighting.darkAfter === 0,
      songs: c.songs.map((s) => `${s.title} (${s.genre}, ${s.melody.length} steps, ${s.seconds}s)`) };
    // the songs
    const titles = c.songs.map((s) => s.title), words = titles.flatMap((t) => t.split(' '));
    out.distinct = c.songs.length === SONGS && new Set(c.songs.map((s) => s.genre)).size === SONGS && new Set(words).size === words.length;
    out.long = c.songs.every((s) => s.melody.length >= 70 && s.seconds >= 15);
    // the build
    const allNotes = new Set();
    for (const s of c.songs) for (const st of [...s.melody, ...s.rhythm]) if (st.note !== null) allNotes.add(key(L(st.at)));
    let notesOk = true, apart = true, straight = true;
    const bad = [];
    for (const s of c.songs) {
      for (const [line, which] of [[s.melody, 'melody'], [s.rhythm, 'rhythm']]) {
        line.forEach((st, k) => {
          const at = L(st.at), under = L(st.under);
          if (st.note === null) { if (raw(at) === 'noteblock') { notesOk = false; bad.push('rest ' + key(at)); } }
          else {
            const want = which === 'melody' ? MEL_UNDER[s.instrument] : RHY_UNDER[st.part];
            const d = w.getData(...at) || { bytes: {} };
            if (raw(at) !== 'noteblock' || raw([at[0], at[1] + 1, at[2]]) !== 'air' || raw(under) !== want || d.bytes.note !== st.note || st.note < 0 || st.note > 24
              || (want === 'sand' && raw([under[0], under[1] - 1, under[2]]) === 'air')) { notesOk = false; bad.push(`${which} ${k} ${raw(at)} on ${raw(under)} want ${want}`); }
            for (const [a, b2, cc] of D6) if (allNotes.has(key([at[0] + a, at[1] + b2, at[2] + cc]))) { apart = false; bad.push('touch ' + key(at)); }
          }
          const before = k === 0 ? L(which === 'melody' ? s.start : s.start2) : L(line[k - 1].at), rp = L(st.repeater);
          if (!/repeater/.test(raw(rp)) || rp[0] - before[0] !== at[0] - rp[0] || rp[2] - before[2] !== at[2] - rp[2] || Math.abs(at[0] - rp[0]) + Math.abs(at[2] - rp[2]) !== 1 || rp[1] !== at[1]) { straight = false; bad.push('bent ' + key(rp)); }
        });
      }
    }
    Object.assign(out, { notesOk, apart, straight, bad: bad.slice(0, 3) });
    // run it
    const xs = [], zs = [];
    for (const s of c.songs) for (const st of [...s.melody, ...s.rhythm]) { xs.push(st.at[0]); zs.push(st.at[2]); }
    for (const s of c.songs) { xs.push(s.button[0]); zs.push(s.button[2]); }
    const box = { x0: Math.min(...xs) - 2, x1: Math.max(...xs) + 2, z0: Math.min(...zs) - 2, z1: Math.max(...zs) + 2, y0: L(s0.button)[1] - 2, y1: L(c.songs[SONGS - 1].start2)[1] + 2 };
    const sim = makeSim(w, box);
    sim.run(60);
    out.still = sim.log.length === 0;
    const play = (s) => {
      const t0 = sim.t, n0 = sim.log.length;
      sim.press(L(s.button), 20);
      const total = s.torches.length * 2 + 4 + s.delays.reduce((a, b) => a + b, 0) * 2 + 20;
      sim.run(total + 60);
      const got = sim.log.slice(n0);
      const mine = new Set([...s.melody, ...s.rhythm].filter((st) => st.note !== null).map((st) => key(L(st.at))));
      const times = (st) => got.filter((q) => q.what === 'note' && key(q.p) === key(L(st.at))).map((q) => q.t - t0);
      // the melody's start is reached through the torches below it; the rhythm's two more torches up, its first repeater two shorter
      let tt = 2 * (s.torches.length - 2);
      const want = s.delays.map((d) => (tt += 2 * d));
      want[0] += 0;                                     // (the melody's first repeater: two more; the rhythm's start: two torches later)
      const okLine = (line) => line.every((st, k) => (st.note === null ? true : (() => { const x = times(st); return x.length === 1 && x[0] === want[k] + 4; })()));
      const extra = got.filter((q) => q.what === 'note' && !mine.has(key(q.p))).length;
      const lamp = got.filter((q) => /lamp/.test(q.what) && key(q.p) === key(L(s.lamp))).map((q) => q.what).join(',');
      const firstMel = times(s.melody.find((st) => st.note !== null)), firstRhy = times(s.rhythm.find((st) => st.note !== null));
      return { ok: okLine(s.melody) && okLine(s.rhythm) && extra === 0, lamp: lamp === 'lamp on,lamp off', extra, end: want[want.length - 1] + 4, firstMel, firstRhy };
    };
    const runs = c.songs.map((s) => play(s));
    const again = play(c.songs[0]);
    out.plays = runs.every((q) => q.ok) && again.ok;
    out.lamps = runs.every((q) => q.lamp);
    out.runs = runs.map((q) => `${q.ok ? 'ok' : 'BAD'} ${q.extra} extra, ${q.firstMel}/${q.firstRhy}, ${q.end / 20}s`);
    // walked to: from the street through the doors to the cell before each button
    const pass = (b2) => b2 === 'air' || /button|sign|carpet|torch|door|lantern/.test(b2);
    const stand = (p) => pass(raw(p)) && pass(raw([p[0], p[1] + 1, p[2]])) && !pass(raw([p[0], p[1] - 1, p[2]]));
    const lot = c.lot, door = L(c.door);
    let st = null; for (const dy of [0, 1, -1, 2, -2]) if (!st && stand([door[0], door[1] + dy, door[2]])) st = [door[0], door[1] + dy, door[2]];
    const seen = new Set(st ? [key(st)] : []), q = st ? [st] : [];
    while (q.length) {
      const p = q.pop();
      for (const [a, cc] of D4) for (const dy of [0, 1, -1]) {
        const n = [p[0] + a, p[1] + dy, p[2] + cc];
        if (seen.has(key(n)) || n[0] < lot.x0 - 2 || n[0] > lot.x1 + 2 || n[2] < lot.z0 - 2 || n[2] > lot.z1 + 2 || n[1] > L(s0.button)[1] + 2 || !stand(n)) continue;
        if (dy === 1 && !pass(raw([p[0], p[1] + 2, p[2]]))) continue;
        if (dy === -1 && !pass(raw([n[0], n[1] + 2, n[2]]))) continue;
        seen.add(key(n)); q.push(n);
      }
    }
    // (the cell in front of a button: a step out from it the way it faces, on the floor)
    const before = (s) => { const b = L(s.button), t = L(s.stand); return [2 * b[0] - t[0], b[1] - 1, 2 * b[2] - t[2]]; };
    out.walk = !!st && c.songs.every((s) => seen.has(key(before(s))));
    // lit, the machine floors included
    const map = lightMap(w);
    let dark = 0, spots = 0;
    for (const [x, , z, lv] of spawnSpots(w, map, (x, z) => x >= lot.x0 && x <= lot.x1 && z >= lot.z0 && z <= lot.z1)) { spots++; if (lv < 1) dark++; }
    out.lit = dark === 0; out.spots = spots;
    // the jukebox, the discs, the bar
    const discs = (w.getData(...L(c.discs)) || {}).tags;
    out.bar = raw(L(c.jukebox)) === 'jukebox' && raw(L(c.discs)) === 'chest' && discs && discs.Items && discs.Items.v.length === 12 && c.barrels.every((p) => raw(L(p)) === 'barrel');
    results.push(out);
  }
  const say = () => results.map((o) => JSON.stringify(o)).join(' | ');
  const all = (f) => results.every((o) => o.built && f(o));
  check('nightclub: built where asked, in both cities; every building there walks through, nothing dark', all((o) => o.walks), say());
  check('nightclub: six songs, six genres, six titles with no word shared; every song seventy steps and fifteen seconds or more; the same seed the same song, another another',
    all((o) => o.distinct && o.long) && JSON.stringify(composeSong(5, 76)) === JSON.stringify(composeSong(5, 76)) && JSON.stringify(composeSong(5, 76)) !== JSON.stringify(composeSong(6, 76))
    && new Set(results.map((o) => o.songs.join())).size === results.length, say());
  check('nightclub: every note block with air over it and its instrument under it (the snare\'s sand on a block), its pitch the song\'s; none beside another; every repeater straight in its line',
    all((o) => o.notesOk && o.apart && o.straight), say());
  check('nightclub, run: at rest nothing stirs; each button plays its own song, every note once at its time, melody and rhythm together, no other song\'s note; its lamp lit while it is in; again, the same again',
    all((o) => o.still && o.plays && o.lamps), say());
  check('nightclub: the panel walked to from the street through the doors; nothing on the lot dark, the floors over the club included', all((o) => o.walk && o.lit), say());
  check('nightclub: a jukebox and a chest of every disc at the booth; barrels of drinks behind the bar', all((o) => o.bar), say());

  // ---- Bedrock states, Java blocks
  {
    const states = JSON.parse(readFileSync(join(ROOT, 'tools', 'bedrock-states.json'), 'utf8'))['1.21.60'];
    const java = loadJavaBlocks();
    const bad = new Set(), jbad = new Set();
    for (const st of buildStructures(cities[0][1].world, {})) for (const p of decodeNbt(st.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
      const j = toJava(p.name, Object.fromEntries(Object.entries(p.states).map(([k, v]) => [k, { value: typeof v === 'object' ? v.value : v }])), n === 'noteblock' ? { note: 12, instrument: 'basedrum' } : {});
      const props = java.get(j.name);
      if (!props) jbad.add(j.name); else for (const [k, v] of Object.entries(j.props)) if (!props.has(k) || !props.get(k).has(String(v))) jbad.add(`${j.name}.${k}=${v}`);
    }
    check('every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
    check('in Java, every block a block Java has, with its own states', jbad.size === 0, [...jbad].slice(0, 6).join(', '));
  }
  note(`nightclub: ${results.map((o) => `${o.name}: ${(o.songs || []).join('; ')}`).join(' | ')}`);
}
