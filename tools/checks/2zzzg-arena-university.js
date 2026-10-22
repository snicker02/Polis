// tools/checks/2zzzg-arena-university.js — the Mega Arena and the University (arena.js,
// university.js; 0.78.0).
//
// Built into the world and looked at there, in a city with all four grounds beside it (the
// airport, the theme park, the arena, the university) and in one with the arena and the
// university alone:
// - each outside the city's square, at the end of its own road; the arena east and the
//   university west when those sides are free; no two grounds overlapping;
// - the arena: the cage glass all round from the sand to fourteen up, a glass roof over it, its
//   floor whole; every fighter in it on the sand with room over it: a dozen iron golems and two
//   of each of the hostile mobs; each tagged a fighter, named, with Resistance V saved on it;
//   the repeating command block under the sand giving Resistance again; the whole hall roofed
//   (nothing in it sees the sky); walked on foot from the city's street through the doors and
//   the tunnel to the walkway round the cage, up the seats to the concourse at the top;
// - the university: walked from the street through the gate to every school's door and into it,
//   to the enchanting table in the library, up the Great Hall's seats to the top row, up the
//   clock tower's ladder to the bell, out to the sports field; every school furnished for what it
//   teaches, its name over its door; the enchanting table with its shelves round it; four
//   clock faces;
// - every spot a mob could spawn on, on both grounds, lit;
// - in the pack: a goto to each; the arena's fighters in structures of their own, with an
//   arena_centered function; the guide telling of both;
// - every block one of Bedrock's own states, and in Java one Java has.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zzzg';
export const label = '2zzzg. the Mega Arena and the University';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { ARENA, ARENA_KINDS, ARENA_HUNTERS, ARENA_PREY, ARENA_ANIMALS } = await import('../../engine/arena.js');
  const { SCHOOLS } = await import('../../engine/university.js');
  const { FIGHTER_TAG } = await import('../../engine/landmarks-extra.js');
  const { lightMap, spawnSpots } = await import('../../engine/lighting.js');
  const ex = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const { toJava } = await import('../../engine/java-blocks.js');
  const { loadJavaBlocks } = await import('../check-java-blocks.mjs');

  check('defaults: no arena and no university unless asked', DEFAULTS.arena === false && DEFAULTS.university === false);
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8'), mainJs = readFileSync(join(ROOT, 'main.js'), 'utf8');
  check('offered in the page (and remembered with the settings)', /id="arena"/.test(html) && /id="university"/.test(html) && /'arena', 'university'/.test(mainJs));
  const L = { furnish: false, villagers: 0, fish: false, arena: true, university: true };
  const cities = [
    ['all four grounds', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7, airport: true, themepark: true })],
    ['the two alone, 192', generateCity({ ...DEFAULTS, ...L, size: 192, seed: 3 })],
  ];

  const blkOf = (w) => (x, y, z) => { const i = w.get(x, y, z); return i < 0 ? 'air' : MATERIALS.def(i).block.replace('minecraft:', ''); };
  const pass = (b) => b === 'air' || /sign|button|flower|tulip|poppy|dandelion|short_grass|wheat|carrots|potatoes|beetroot|carpet/.test(b);
  const ladder = (b) => b === 'ladder';
  const floor = (b) => b !== 'air' && !pass(b) && !/fence|bars|water|lava|(?<!sea_)lantern/.test(b);
  // on foot from the city's street over the ground's road, within a box: as a player walks
  const walk = (w, start, box) => {
    const blk = blkOf(w), key = (p) => p.join(',');
    const stand = (x, y, z) => (pass(blk(x, y, z)) || ladder(blk(x, y, z))) && (pass(blk(x, y + 1, z)) || ladder(blk(x, y + 1, z))) && (floor(blk(x, y - 1, z)) || ladder(blk(x, y, z)) || ladder(blk(x, y - 1, z)));
    let s0 = null; for (let d = -2; d <= 4 && !s0; d++) if (stand(start[0], start[1] + d, start[2])) s0 = [start[0], start[1] + d, start[2]];
    const seen = new Set(s0 ? [key(s0)] : []), q = s0 ? [s0] : [];
    while (q.length && seen.size < 600000) {
      const [a, b, c] = q.pop();
      const moves = [];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (const dy of [0, 1, -1]) moves.push([a + dx, b + dy, c + dz]);
      if (ladder(blk(a, b, c)) || ladder(blk(a, b - 1, c))) moves.push([a, b + 1, c], [a, b - 1, c]);
      for (const n of moves) {
        if (seen.has(key(n)) || n[0] < box.x0 || n[0] > box.x1 || n[2] < box.z0 || n[2] > box.z1 || !stand(...n)) continue;
        if (n[1] > b && !ladder(blk(a, b, c)) && !pass(blk(a, b + 2, c)) && !ladder(blk(a, b + 2, c))) continue;
        seen.add(key(n)); q.push(n);
      }
    }
    const near = (p, r = 1, dyMax = 1) => { for (const k of seen) { const [x, y, z] = k.split(',').map(Number); if (Math.abs(x - p[0]) + Math.abs(z - p[2]) <= r && Math.abs(y - p[1]) <= dyMax) return true; } return false; };
    return { seen, near, start: !!s0 };
  };
  const boxOf = (G) => ({ x0: Math.min(G.lot.x0, G.roadRect.x0) - 4, x1: Math.max(G.lot.x1, G.roadRect.x1) + 4, z0: Math.min(G.lot.z0, G.roadRect.z0) - 4, z1: Math.max(G.lot.z1, G.roadRect.z1) + 4 });
  const overlap = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;
  const dark = (r, G) => {
    const map = lightMap(r.world);
    const inLot = (x, z) => x >= G.lot.x0 && x <= G.lot.x1 && z >= G.lot.z0 && z <= G.lot.z1;
    return spawnSpots(r.world, map, inLot).filter((p) => p[3] === 0);
  };

  const res = cities.map(([n, r]) => {
    const A = r.landmarks.find((q) => q.kind === 'arena'), U = r.landmarks.find((q) => q.kind === 'university');
    const { W, D } = r.plan, w = r.world, blk = blkOf(w);
    const out = { n, A: !!A, U: !!U };
    if (!A || !U) return out;
    const outside = (G) => G.lot.x1 < 0 || G.lot.x0 >= W || G.lot.z1 < 0 || G.lot.z0 >= D;
    const grounds = r.landmarks.filter((q) => ['airport', 'themepark', 'arena', 'university'].includes(q.kind));
    out.place = outside(A) && outside(U) && grounds.every((g, i) => grounds.every((h, j) => i >= j || !overlap(g.lot, h.lot)));
    out.sides = `${A.side}/${U.side}`;
    // ---- the arena
    {
      const F = A.frame, YA = F.YA, R = F.R, VC = F.VC;
      const cell = (u, dv, y) => blk(...F.pos(u, VC + dv, y));
      let glass = 0, roof = 0, floorBad = 0;
      for (let u = -ARENA.CAGE; u <= ARENA.CAGE; u++) for (let dv = -ARENA.CAGE; dv <= ARENA.CAGE; dv++) {
        const d = Math.max(Math.abs(u), Math.abs(dv));
        if (d === ARENA.CAGE) for (let y = YA + 1; y <= YA + ARENA.CAGE_H; y++) if (cell(u, dv, y) !== 'glass') glass++;
        if (cell(u, dv, YA + ARENA.CAGE_H + 1) !== 'glass') roof++;
        if (d < ARENA.CAGE && cell(u, dv, YA) === 'air') floorBad++;
      }
      out.cage = { glass, roof, floorBad };
      const fs = r.spawns.filter((p) => p.group === 'arena');
      const inCage = (p) => { const [x0, z0] = F.at(-ARENA.CAGE + 1, VC - ARENA.CAGE + 1), [x1, z1] = F.at(ARENA.CAGE - 1, VC + ARENA.CAGE - 1); return p.x >= Math.min(x0, x1) && p.x <= Math.max(x0, x1) && p.z >= Math.min(z0, z1) && p.z <= Math.max(z0, z1); };
      const room = (p) => [0, 1, 2].every((d) => blk(p.x, p.y + d, p.z) === 'air') && floor(blk(p.x, p.y - 1, p.z));
      const golems = fs.filter((p) => p.type === 'golem').length;
      const kinds = new Map(); for (const p of fs.filter((p) => p.type === 'mob')) kinds.set(p.kind, (kinds.get(p.kind) || 0) + 1);
      out.fighters = { n: fs.length, golems, everyKind: ARENA_KINDS.every((k) => kinds.get(k) === 2), animals: ARENA_ANIMALS.every((k) => kinds.get(k) === 2), inCage: fs.every(inCage), room: fs.every(room), named: fs.every((p) => p.name),
        kept: fs.every((p) => p.tags && p.tags.includes(FIGHTER_TAG) && p.effects && p.effects.some((e) => e.id === 11 && e.amp === 4 && e.ticks >= 1e9)) };
      const cb = w.getData(...A.command);
      out.command = blk(...A.command) === 'repeating_command_block' && !!cb && /effect @e\[tag=polis_fighter\] resistance/.test(cb.tags.Command.v) && cb.tags.LPCommandMode.v === 1 && cb.tags.auto.v === 1;
      // roofed: over every column of the hall something that is not glass, or air, stops the sky
      let open = 0;
      for (let u = -R; u <= R; u++) for (let dv = -R; dv <= R; dv++) {
        let covered = false;
        for (let y = YA + ARENA.CAGE_H + 2; y <= A.top + ARENA.CROWN_H + 2 && !covered; y++) { const b = cell(u, dv, y); if (b !== 'air' && !/glass/.test(b)) covered = true; }
        if (!covered) open++;
      }
      out.roofed = open;
      const wk = walk(w, A.street, boxOf(A));
      const walkway = F.pos(0, VC - ARENA.WALK, YA + 1), concourse = F.pos(0, VC + ARENA.WALK + ARENA.ROWS + 2, YA + ARENA.ROWS + 1);
      const topRow = F.pos(10, VC - (ARENA.WALK + ARENA.ROWS), YA + ARENA.ROWS + 1);
      out.walk = { start: wk.start, walkway: wk.near(walkway, 1), topRow: wk.near(topRow, 1), concourse: wk.near(concourse, 1), far: wk.near(F.pos(0, VC + ARENA.WALK, YA + 1), 1), announcer: wk.near(A.announcer, 2) };
      // the cage can't be walked into
      out.sealed = ![...wk.seen].some((k) => { const [x, y, z] = k.split(',').map(Number); return A.cageFighters.some((f) => f.x === x && f.z === z); });
      out.arenaDark = dark(r, A).length;
    }
    // ---- the university
    {
      const wk = walk(w, U.street, boxOf(U));
      out.uwalk = { start: wk.start };
      for (const h of U.schools) out.uwalk[h.school] = h.door.cells.some((c) => wk.near(c, 0)) && wk.near(h.visit, 3);
      out.uwalk.enchanting = wk.near(U.library.enchanting, 2);
      out.uwalk.hallTop = U.great.seats.some((p) => wk.seen.has([p[0], p[1] + 1, p[2]].join(',')) && p[1] === Math.max(...U.great.seats.map((q) => q[1])));
      out.uwalk.lectern = wk.near(U.great.lectern, 2);
      out.uwalk.bell = wk.near(U.tower.bell, 2);
      out.uwalk.field = U.field.goals.every((g) => wk.near(g, 3));
      const has = (h, re) => { for (let u = h.inner.u0; u <= h.inner.u1; u++) for (let v = h.inner.v0; v <= h.inner.v1; v++) for (let y = U.ground; y <= U.ground + h.H; y++) if (re.test(blk(...U.frame.pos(u, v, y)))) return true; return false; };
      const WANT = { Science: /brewing_stand/, Medicine: /^bed$/, Engineering: /anvil/, Agriculture: /^(wheat|carrots|potatoes|beetroot)$/, Law: /lectern/, Arts: /loom/, Music: /noteblock/, Astronomy: /end_rod/ };
      out.furnished = U.schools.map((h) => [h.school, h.items.length >= 8 && has(h, WANT[h.school]) && /wall_sign/.test(blk(...h.nameSign)) && JSON.stringify(w.getData(...h.nameSign) || {}, (k, v) => (typeof v === 'bigint' ? String(v) : v)).includes(h.school)]).filter(([, ok]) => !ok).map(([n]) => n);
      out.music = has(U.schools.find((h) => h.school === 'Music'), /jukebox/);
      out.astroGlass = (() => { const h = U.schools.find((q) => q.school === 'Astronomy'); return blk(...U.frame.pos(h.inner.u0 + 3, h.inner.v0 + 3, h.ceiling)) === 'glass'; })();
      // crops watered: water within four of every crop
      const ag = U.schools.find((h) => h.school === 'Agriculture');
      out.crops = ag.crops.length >= 40 && ag.crops.every(([x, y, z]) => { for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) if (blk(x + dx, y - 1, z + dz) === 'water') return true; return false; }) && ag.crops.every(([x, y, z]) => blk(x, y - 1, z) === 'farmland');
      const [ex_, ey, ez] = U.library.enchanting;
      let shelves = 0; for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy <= 1; dy++) if (Math.max(Math.abs(dx), Math.abs(dz)) === 2 && blk(ex_ + dx, ey + dy, ez + dz) === 'bookshelf') shelves++;
      let gap = 0; for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) if ((dx || dz) && blk(ex_ + dx, ey + dy, ez + dz) !== 'air') gap++;
      out.enchant = { table: blk(...U.library.enchanting) === 'enchanting_table', shelves, gap };
      out.faces = U.tower.faces.length === 4 && U.tower.faces.every((p) => blk(...p) === 'gold_block' || blk(...p) === 'black_concrete');
      out.uniDark = dark(r, U).length;
    }
    return out;
  });
  const all = (f) => res.every((t) => t.A && t.U && f(t));
  const say = (f) => res.map((t) => `${t.n}: ${JSON.stringify(f(t))}`).join(' | ');
  check('both built beside the city, outside its square, at the end of their own roads; no two grounds overlapping', all((t) => t.place), say((t) => [t.A, t.U, t.place]));
  check('the arena east and the university west (those sides free)', all((t) => t.sides === 'east/west'), say((t) => t.sides));
  check('the arena\'s cage: glass all round from the sand to fourteen up, a glass roof over it, its floor whole', all((t) => t.cage.glass === 0 && t.cage.roof === 0 && t.cage.floorBad === 0), say((t) => t.cage));
  check(`in the cage: ${ARENA.GOLEMS} iron golems, two of each of ${ARENA_KINDS.length} hostile mobs, and two of each hunter (${ARENA_HUNTERS.join(', ')}) and of their prey (${ARENA_PREY.join(', ')}), each on the sand with room over it`, all((t) => t.fighters.golems === ARENA.GOLEMS && t.fighters.everyKind && t.fighters.animals && t.fighters.inCage && t.fighters.room && t.fighters.n === ARENA.GOLEMS + 2 * (ARENA_KINDS.length + ARENA_ANIMALS.length)), say((t) => t.fighters));
  check('every fighter tagged, named (never despawns), with Resistance V saved on it; the repeating command block under the sand giving it again', all((t) => t.fighters.kept && t.fighters.named && t.command), say((t) => [t.fighters.kept, t.command]));
  check('the whole hall roofed: nothing in it sees the sky', all((t) => t.roofed === 0), say((t) => t.roofed));
  check('the arena walked from the city\'s street through the doors and the tunnel to the walkway round the cage (all round it), up the seats to the top row and the concourse; the announcer reached; the cage never walked into', all((t) => Object.values(t.walk).every(Boolean) && t.sealed), say((t) => [t.walk, t.sealed]));
  check('the university walked from the street through the gate into every school, to the enchanting table, up the Great Hall\'s seats to the top row and to its lectern, up the clock tower\'s ladder to the bell, out to the sports field', all((t) => Object.values(t.uwalk).every(Boolean)), say((t) => Object.entries(t.uwalk).filter(([, v]) => !v).map(([k]) => k)));
  check(`every school furnished for what it teaches, its name over its door (${SCHOOLS.join(', ')}); music with a jukebox, astronomy under glass; the crops on farmland, watered`, all((t) => t.furnished.length === 0 && t.music && t.astroGlass && t.crops), say((t) => [t.furnished, t.music, t.astroGlass, t.crops]));
  check('the library\'s enchanting table: shelves round it two out, air between', all((t) => t.enchant.table && t.enchant.shelves >= 15 && t.enchant.gap === 0), say((t) => t.enchant));
  check('the clock tower: a clock face on each side', all((t) => t.faces));
  check('every spot a mob could spawn on lit, on both grounds', all((t) => t.arenaDark === 0 && t.uniDark === 0), say((t) => [t.arenaDark, t.uniDark]));

  // ---- the pack
  {
    const r = cities[1][1];
    const opts = { namespace: 'chk', prefix: 'c', spawns: r.spawns, hostiles: r.hostiles || [], inmates: r.inmates || [], zoo: r.zoo || [], stands: r.stands || [], places: r.places, centre: r.world.centre, world: r.world };
    const tiles = ex.tileList(r.world, opts), mobs = ex.buildMobStructures(r.spawns, { seed: 1 });
    const fns = ex.functionFiles(tiles, r.world, { ...opts, mobTiles: mobs });
    const guide = ex.placementGuide(tiles, { ...opts, plugs: true });
    const arenaMobs = mobs.filter((t) => t.group === 'arena');
    const ents = arenaMobs.flatMap((t) => decodeNbt(t.data).root.structure.entities);
    const resist = ents.filter((e) => JSON.stringify(e, (k, v) => (typeof v === 'bigint' ? String(v) : v)).includes(FIGHTER_TAG)).length;
    check('in the pack: the arena\'s fighters in structures of their own (tagged), an arena_centered function; a goto to each ground; the guide tells of both', arenaMobs.length > 0 && resist === ARENA.GOLEMS + 2 * (ARENA_KINDS.length + ARENA_ANIMALS.length)
      && fns.some((f) => f.fn === 'chk/arena_centered') && fns.some((f) => f.fn === 'chk/goto_arena') && fns.some((f) => f.fn === 'chk/goto_university')
      && /THE MEGA ARENA/.test(guide) && /THE UNIVERSITY/.test(guide), `${arenaMobs.length} structures, ${ents.length} entities, ${resist} tagged`);
  }
  // ---- Bedrock states, Java blocks (the two grounds' blocks)
  {
    const states = JSON.parse(readFileSync(join(ROOT, 'tools', 'bedrock-states.json'), 'utf8'))['1.21.60'];
    const java = loadJavaBlocks();
    const bad = new Set(), jbad = new Set();
    for (const s of ex.buildStructures(cities[1][1].world, {})) for (const p of decodeNbt(s.data).root.structure.palette.default.block_palette) {
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
  note(res.map((t) => `${t.n}: arena ${t.sides}`).join('; '));
}
