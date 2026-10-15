// tools/checks/2zzt-tune-gallery.js — the bandstand's tune (music.js) and the theme
// park's shooting gallery (themepark.js: shootingGallery).
//
// The tune, on bandstands in three cities (hilly, flat, medieval):
// - a tune in each, a different one in each city, the same one again from the same city;
// - every note block with air over it and its instrument's block under it (the melody's
//   from the tune, the bass on oak), its pitch the tune's; no note block beside another
//   or beside the block the tune starts from; every repeater straight between the cell
//   before it in its line and the one after;
// - run (redsim.js): at rest nothing stirs; the button pressed, every note plays once, in
//   order, at the tune's own times, melody and bass together where both play; the lamp
//   over the start lit while the button is in; pressed again, the same again;
// - the button walked to on foot up the step; the stage, roof and lot lit.
// The gallery, in two theme parks:
// - six targets flush with the range's floor, each on a sticky piston, a lamp behind
//   where it rises to;
// - run: at rest nothing stirs; the lever on: every target rises and sinks over and
//   over, up as long as down, a lap of the clock each way, the nearer the middle the
//   sooner; a raised target hit lights its lamp; the lever off: all of it still within
//   three seconds;
// - every block one of Bedrock's own states, and in Java one Java has.

import { readFileSync } from 'node:fs';

export const id = '2zzt';
export const label = '2zzt. the bandstand\'s tune, the shooting gallery';

let MATERIALS;
const key = (p) => p.join(',');
const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  ({ MATERIALS } = await import('../../engine/materials.js'));
  const { composeTune, MELODY_PATH, BASS_PATH } = await import('../../engine/music.js');
  const { makeSim } = await import('./redsim.js');
  const { buildStructures } = await import('../../engine/export.js');
  const { lightMap, spawnSpots } = await import('../../engine/lighting.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const { toJava } = await import('../../engine/java-blocks.js');
  const { loadJavaBlocks } = await import('../check-java-blocks.mjs');
  const lean = { furnish: false, villagers: 0, fish: false };

  // ---- the tune
  const bcities = [
    ['hilly 320', generateCity({ ...DEFAULTS, ...lean, size: 320, seed: 7 })],
    ['flat 288', generateCity({ ...DEFAULTS, ...lean, size: 288, seed: 4, hills: 0 })],
    ['medieval 256', generateCity({ ...DEFAULTS, ...lean, size: 256, seed: 5, cityStyle: 'medieval' })],
  ];
  const results = [];
  for (const [name, r] of bcities) {
    const b = r.landmarks.find((q) => q.kind === 'bandstand');
    if (!b || !b.music) { results.push({ name, built: false }); continue; }
    const w = r.world, m = b.music;
    const raw = (p) => { const i = w.get(...p); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
    let e = 0; for (let d = -3; d <= 12; d++) if (/button/.test(raw([m.button[0], m.button[1] + d, m.button[2]]))) { e = d; break; }
    const L = (p) => [p[0], p[1] + e, p[2]];
    const out = { name, built: true, key: m.key, instrument: m.instrument, melody: m.melody.map((s) => s.note) };
    // the build
    const notes = [...m.melody, ...m.bass].filter((s) => s.note !== null);
    const noteCells = new Set(notes.map((s) => key(L(s.at))));
    const start = L(m.start);
    const melodyUnder = notes.filter((s) => m.melody.includes(s)).map((s) => raw(L(s.under)));
    out.notes = notes.every((s) => raw(L(s.at)) === 'noteblock' && raw([s.at[0], s.at[1] + e + 1, s.at[2]]) === 'air'
      && (w.getData(...L(s.at)) || { bytes: {} }).bytes.note === s.note)
      && m.bass.filter((s) => s.note !== null).every((s) => raw(L(s.under)) === 'oak_planks')
      && melodyUnder.every((u) => u === { bells: 'gold_block', flute: 'clay', chimes: 'packed_ice', xylophone: 'bone_block', pling: 'glowstone', harp: 'moss_block' }[m.instrument]);
    out.apart = notes.every((s) => { const p = L(s.at); return D4.every(([a, c]) => { const n = [p[0] + a, p[1], p[2] + c]; return !noteCells.has(key(n)) && key(n) !== key(start); }); });
    out.straight = [m.melody, m.bass].every((line) => line.every((s, k) => {
      const before = k === 0 ? start : L(line[k - 1].at), rp = L(s.repeater), next = L(s.at);
      return /repeater/.test(raw(rp)) && rp[0] - before[0] === next[0] - rp[0] && rp[2] - before[2] === next[2] - rp[2] && Math.abs(next[0] - rp[0]) + Math.abs(next[2] - rp[2]) === 1;
    }));
    // run it
    const [mx, , mz] = m.stand;
    const sim = makeSim(w, { x0: mx - 5, y0: m.stand[1] + e - 2, z0: mz - 5, x1: mx + 5, y1: m.stand[1] + e + 7, z1: mz + 5 });
    sim.run(40);
    out.still = sim.log.length === 0;
    const play = () => {
      const t0 = sim.t, n0 = sim.log.length;
      sim.press(L(m.button), 30); sim.run(140);
      const got = sim.log.slice(n0);
      const at = (s) => got.filter((q) => q.what === 'note' && key(q.p) === key(L(s.at))).map((q) => q.t - t0);
      const times = (line) => line.map((s) => (s.note === null ? null : at(s)));
      const mel = times(m.melody), bas = times(m.bass);
      let tt = 4;                                         // (the two torches)
      const want = m.delays.map((d) => (tt += 2 * d));
      const okLine = (ts, line) => ts.every((x, k) => (line[k].note === null ? true : x.length === 1 && x[0] === want[k]));
      const lamp = got.filter((q) => /lamp/.test(q.what) && key(q.p) === key(L(m.lamp))).map((q) => q.what);
      const extra = got.filter((q) => q.what === 'note' && !noteCells.has(key(q.p))).length;
      return { ok: okLine(mel, m.melody) && okLine(bas, m.bass) && extra === 0, lamp: lamp.join(',') === 'lamp on,lamp off', first: want[0], last: want[want.length - 1] };
    };
    const p1 = play(), p2 = play();
    out.plays = p1.ok && p2.ok; out.lamp = p1.lamp && p2.lamp; out.seconds = p1.last / 20;
    // the button walked to, up the step
    const pass = (b2) => b2 === 'air' || /button|sign|carpet|torch/.test(b2);
    const stand = (p) => pass(raw(p)) && pass(raw([p[0], p[1] + 1, p[2]])) && !pass(raw([p[0], p[1] - 1, p[2]]));
    const lot = b.lot, step = L(b.step);
    const s0 = [step[0] + (step[0] - mx === 0 ? 0 : Math.sign(step[0] - mx)), step[1], step[2] + (step[2] - mz === 0 ? 0 : Math.sign(step[2] - mz))];
    let st = null; for (const dy of [0, 1, -1]) if (!st && stand([s0[0], s0[1] + dy, s0[2]])) st = [s0[0], s0[1] + dy, s0[2]];
    const seen = new Set(st ? [key(st)] : []), q = st ? [st] : [];
    while (q.length) {
      const p = q.pop();
      for (const [a, c] of D4) for (const dy of [0, 1, -1]) {
        const n = [p[0] + a, p[1] + dy, p[2] + c];
        if (seen.has(key(n)) || n[0] < lot.x0 - 2 || n[0] > lot.x1 + 2 || n[2] < lot.z0 - 2 || n[2] > lot.z1 + 2 || !stand(n)) continue;
        if (dy === 1 && !pass(raw([p[0], p[1] + 2, p[2]]))) continue;
        seen.add(key(n)); q.push(n);
      }
    }
    out.walk = seen.has(key(L(m.button)));
    // lit
    const map = lightMap(w);
    let dark = 0, spots = 0;
    for (const [x, , z, lv] of spawnSpots(w, map, (x, z) => x >= lot.x0 && x <= lot.x1 && z >= lot.z0 && z <= lot.z1)) { spots++; if (lv < 1) dark++; }
    out.lit = dark === 0; out.spots = spots;
    results.push(out);
  }
  const say = () => results.map((o) => JSON.stringify(o)).join(' | ');
  const allB = (f) => results.every((o) => o.built && f(o));
  check('bandstand: a tune on every bandstand; a different one in each city; the same one again from the same seed',
    allB(() => true) && new Set(results.map((o) => o.melody.join())).size === results.length
    && JSON.stringify(composeTune(12345)) === JSON.stringify(composeTune(12345)) && JSON.stringify(composeTune(12345)) !== JSON.stringify(composeTune(54321)), say());
  check('bandstand: every note block with air over it, its instrument under it (the melody\'s, the bass on oak), its pitch the tune\'s; none beside another or beside the start; every repeater straight in its line',
    allB((o) => o.notes && o.apart && o.straight), say());
  check('bandstand, run: at rest nothing stirs; pressed, every note plays once, in order, at the tune\'s times, the bass with the melody; the lamp on while the button is in; pressed again, the same again',
    allB((o) => o.still && o.plays && o.lamp), say());
  check('bandstand: the button walked to up the step; nothing on the lot dark', allB((o) => o.walk && o.lit), say());
  check('bandstand: the lines\' shapes keep twelve steps each, and the bass the melody\'s turned half round',
    MELODY_PATH.length === 12 && BASS_PATH.length === 12 && BASS_PATH.every(([r, n], k) => r[0] === -MELODY_PATH[k][0][0] && n[1] === -MELODY_PATH[k][1][1]));

  // ---- the gallery
  const tcities = [
    ['flat 320', generateCity({ ...DEFAULTS, ...lean, size: 320, seed: 99, hills: 0, themepark: true })],
    ['with the airport', generateCity({ ...DEFAULTS, ...lean, size: 256, seed: 7, airport: true, themepark: true })],
  ];
  const gres = [];
  for (const [name, r] of tcities) {
    const T = r.landmarks.find((q) => q.kind === 'themepark');
    const g = T && T.rides && T.rides.archery && T.rides.archery.gallery;
    if (!g) { gres.push({ name, built: false }); continue; }
    const w = r.world;
    const raw = (p) => { const i = w.get(...p); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
    const out = { name, built: true };
    out.parts = g.modules.length === 6 && g.modules.every((m) => raw(m.target) === 'target' && raw(m.piston) === 'sticky_piston' && raw(m.up) === 'air' && raw(m.lamp) === 'redstone_lamp')
      && g.ring.filter((p) => raw(p) === 'observer').length === g.ring.length - 1 && raw(g.riderRest) === 'observer' && raw(g.lever) === 'lever';
    const all = [...g.ring, g.riderRest, g.piston, g.lever, ...g.feed, ...g.modules.flatMap((m) => [m.bulb, m.comparator, m.block, m.piston, m.target, m.up, m.lamp])];
    const box = { x0: Math.min(...all.map((p) => p[0])) - 1, x1: Math.max(...all.map((p) => p[0])) + 1, y0: Math.min(...all.map((p) => p[1])) - 1, y1: Math.max(...all.map((p) => p[1])) + 2, z0: Math.min(...all.map((p) => p[2])) - 1, z1: Math.max(...all.map((p) => p[2])) + 1 };
    const sim = makeSim(w, box);
    sim.run(40);
    out.still = sim.log.length === 0;
    const t0 = sim.t;
    sim.lever(g.lever, true);
    sim.run(260);
    const lap = g.ring.length * 2;
    const per = g.modules.map((m) => sim.log.filter((q) => key(q.p) === key(m.piston) && /piston/.test(q.what)).map((q) => [q.what, q.t - t0]));
    // each: up and down in turn, a lap apart, at least three times each way
    out.moves = per.every((ev) => ev.length >= 6 && ev.every(([wh], k) => wh === (k % 2 ? 'piston in' : 'piston out')) && ev.slice(1).every(([, tt], k) => tt - ev[k][1] === lap));
    // the nearer the middle (the feed's head), the sooner
    const firstUp = per.map((ev) => (ev[0] ? ev[0][1] : Infinity));
    out.wave = g.modules.every((m, k) => k === 0 || firstUp[k] >= firstUp[k - 1]) && firstUp[firstUp.length - 1] > firstUp[0];
    // a raised target hit: its lamp lights
    const upNow = g.modules.find((m) => sim.part(m.up));
    const nl = sim.log.length;
    out.hit = !!upNow && sim.hit(upNow.up) && (sim.run(4), sim.log.slice(nl).some((q) => q.what === 'lamp on' && key(q.p) === key(upNow.lamp)));
    // the lever off: still within three seconds
    sim.lever(g.lever, false);
    const t1 = sim.t; sim.run(160);
    out.stops = sim.log.filter((q) => q.t > t1 + 60 && /piston|bulb/.test(q.what)).length === 0;
    out.period = lap / 20;
    gres.push(out);
  }
  const sayG = () => gres.map((o) => JSON.stringify(o)).join(' | ');
  const allG = (f) => gres.every((o) => o.built && f(o));
  check('gallery: six targets flush with the range\'s floor on sticky pistons, a lamp behind each; the clock\'s ring, its rider, the lever on the counter', allG((o) => o.parts), sayG());
  check('gallery, run: at rest nothing stirs; the lever on, every target up and down in turn, a lap of the clock each way, the nearer the middle the sooner', allG((o) => o.still && o.moves && o.wave), sayG());
  check('gallery, run: a raised target hit lights its lamp; the lever off, all of it still within three seconds', allG((o) => o.hit && o.stops), sayG());

  // ---- Bedrock states, Java blocks
  {
    const states = JSON.parse(readFileSync(new URL('../bedrock-states.json', import.meta.url), 'utf8'))['1.21.60'];
    const java = loadJavaBlocks();
    const bad = new Set(), jbad = new Set();
    for (const world of [bcities[0][1].world, tcities[0][1].world]) for (const st of buildStructures(world, {})) {
      const root = decodeNbt(st.data).root.structure;
      for (const p of root.palette.default.block_palette) {
        const n = p.name.replace('minecraft:', ''), def = states[n];
        if (!def) { bad.add(n); continue; }
        for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
        if (/noteblock|repeater|comparator|observer|redstone_torch|redstone_lamp|button|lever|piston|copper_bulb|target/.test(n)) {
          const j = toJava(p.name, Object.fromEntries(Object.entries(p.states).map(([k, v]) => [k, { value: typeof v === 'object' ? v.value : v }])), n === 'noteblock' ? { note: 12, instrument: 'bell' } : {});
          const props = java.get(j.name);
          if (!props) jbad.add(j.name); else for (const [k, v] of Object.entries(j.props)) if (!props.has(k) || !props.get(k).has(String(v))) jbad.add(`${j.name}.${k}=${v}`);
        }
      }
    }
    check('every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
    check('in Java, the note blocks (pitch and instrument), repeaters, comparators, observers, torches, lamps, buttons, levers, pistons, bulbs and targets each a block Java has, with its own states', jbad.size === 0, [...jbad].slice(0, 6).join(', '));
  }
  note(`tunes: ${results.map((o) => `${o.name} ${o.key} on the ${o.instrument}, ${o.seconds}s`).join('; ')}; gallery: ${gres.map((o) => `${o.name} ${o.period}s a lap`).join('; ')}`);
}
