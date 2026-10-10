// tools/checks/2zza-zoo.js — the zoo and the aquarium (zoo.js): every land animal
// penned, every fish in its tank, none getting out.
//
// Built into the world and looked at there: each pen fenced three solid high all
// round (nothing on its feet clears that); the aviary closed to a flyer (glass
// over it); every tank closed to its fish, and the fish in water; all 22 named
// tropical fish in the reef; a sign at every pen. The pack: populate summons every
// animal and fish (kept fish by the pack's event, a tropical one as its variety),
// and the pack's tropical fish carries a keep event for each of the 22.

import { readFileSync } from 'node:fs';

export const id = '2zza';
export const label = '2zza. the zoo and the aquarium';

let MATERIALS;

function inspectZoo(r) {
  const w = r.world, out = { zoo: false, aquarium: false, problems: [] };
  const blk = (x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block.replace('minecraft:', ''); };
  const solid = (b) => !['air', 'water', 'lantern', 'short_grass'].includes(b) && !/sign|flower|tulip|poppy/.test(b);
  const Z = r.landmarks.find((L) => L.kind === 'zoo'), A = r.landmarks.find((L) => L.kind === 'aquarium');
  if (Z) {
    out.zoo = true;
    const fr = Z.frame;
    // the zoo's real ground: the gravel of the path
    const [px, pz] = fr.at((fr.pathU || [6, 7, 8])[1], 5); let G = null; for (let y = -8; y < 40; y++) if (blk(px, y, pz) === 'gravel' && blk(px, y + 1, pz) === 'air') { G = y; break; }
    out.zooG = G;
    for (const pen of Z.pens) {
      // the ring round the pen: three solid high all round
      let gaps = 0;
      for (let v = pen.v[0] - 1; v <= pen.v[1] + 1; v++) for (let u = pen.u[0] - 1; u <= pen.u[1] + 1; u++) {
        if (v >= pen.v[0] && v <= pen.v[1] && u >= pen.u[0] && u <= pen.u[1]) continue;
        const [x, z] = fr.at(u, v);
        for (let y = G + 1; y <= G + 3; y++) if (!solid(blk(x, y, z))) gaps++;
      }
      if (gaps) out.problems.push(`pen ${pen.name}: ${gaps} gaps in its fence`);
      if (pen.name === 'Pond') {
        // frogs jump: the pond roofed, closed to one jumping
        const m = Z.animals.find((a) => a.type === 'frog');
        if (m) { const sp = fill(w, blk, Math.floor(m.x), m.y, Math.floor(m.z), (b) => b === 'air' || b === 'short_grass' || b === 'water'); if (sp.size >= 3000) out.problems.push(`pond: open above (${sp.size})`); }
      }
      if (pen.name === 'Goats') {
        // goats jump: the pen roofed, closed to one jumping
        const m = Z.animals.find((a) => a.type === 'goat');
        const sp = fill(w, blk, Math.floor(m.x), m.y, Math.floor(m.z), (b) => b === 'air' || b === 'short_grass');
        if (sp.size >= 3000) out.problems.push(`goats: their pen is open above (${sp.size})`);
      }
      if (pen.name === 'Aviary') {
        // a flyer's space: closed
        const m = Z.animals.find((a) => a.type === 'bee');
        const sp = fill(w, blk, Math.floor(m.x), m.y, Math.floor(m.z), (b) => b === 'air' || b === 'short_grass');   // (not grass blocks: the ground)
        if (sp.size >= 3000) out.problems.push(`aviary: a bee's space is open (${sp.size})`);
        out.aviary = sp.size;
      }
    }
    // every animal's body inside its pen with room: half its width and a tenth
    // clear of the fence on every side (one set against a fence is pushed out of it)
    out.tight = [];
    for (const a of Z.animals) {
      const pen = Z.pens[a.pen], h = (inspectZoo.widths[a.type] || 0.6) / 2 + 0.1;
      const xs = [], zs = []; for (const u of pen.u) for (const v of pen.v) { const [x, z] = fr.at(u, v); xs.push(x, x + 1); zs.push(z, z + 1); }
      if (a.x - h < Math.min(...xs) || a.x + h > Math.max(...xs) || a.z - h < Math.min(...zs) || a.z + h > Math.max(...zs)) out.tight.push(`${a.type} in ${pen.name}`);
    }
    out.animals = Z.animals.length; out.animalKinds = new Set(Z.animals.map((a) => a.type)).size;
    // animals on their feet: in air (or water) over ground
    out.animalsBad = Z.animals.filter((a) => solid(blk(Math.floor(a.x), a.y, Math.floor(a.z)))).map((a) => a.type);
    out.penCount = Z.pens.length;
    const pu = fr.pathU || [6, 7, 8];
    out.zooSigns = Z.pens.filter((p) => { const [x, z] = fr.at(p.side === 0 ? pu[0] : pu[2], p.v[0] + 1); return /sign/.test(blk(x, G + 1, z)); }).length;
  }
  if (A) {
    out.aquarium = true;
    const fr = A.frame;
    for (const t of A.tanks) {
      const m = A.fish.find((f) => f.tank === A.tanks.indexOf(t));
      const sp = fill(w, blk, Math.floor(m.x), m.y, Math.floor(m.z), (b) => b === 'water' || b === 'air');
      if (sp.size >= 3000) out.problems.push(`tank ${t.name}: open (${sp.size})`);
      // in water
      if (blk(Math.floor(m.x), m.y, Math.floor(m.z)) !== 'water') out.problems.push(`tank ${t.name}: its fish not in water (${blk(Math.floor(m.x), m.y, Math.floor(m.z))})`);
    }
    out.fish = A.fish.length; out.varieties = new Set(A.fish.filter((f) => f.variety).map((f) => f.variety)).size;
    out.fishDry = A.fish.filter((f) => blk(Math.floor(f.x), f.y, Math.floor(f.z)) !== 'water').map((f) => f.variety || f.type);
  }
  return out;
}
function fill(w, blk, x, y, z, open, limit = 3000) {
  const seen = new Set([x + ',' + y + ',' + z]), q = [[x, y, z]];
  while (q.length && seen.size < limit) { const [a, b, c] = q.pop(); for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) { const k = (a + dx) + ',' + (b + dy) + ',' + (c + dz); if (seen.has(k) || !open(blk(a + dx, b + dy, c + dz))) continue; seen.add(k); q.push([a + dx, b + dy, c + dz]); } }
  return seen;
}

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  ({ MATERIALS } = await import('../../engine/materials.js'));
  const { buildStructures, functionFiles, fishEntityFiles } = await import('../../engine/export.js');
  const { TROPICAL_VARIETIES, ZOO_PENS, ANIMAL_WIDTH } = await import('../../engine/zoo.js');
  inspectZoo.widths = ANIMAL_WIDTH;
  const L = { furnish: false, villagers: 0, fish: false };
  const fx = JSON.parse(readFileSync(new URL('./site-1004954.json', import.meta.url), 'utf8'));
  const ground = new Int16Array(Uint8Array.from(Buffer.from(fx.ground, 'base64')).buffer);
  const water = Uint8Array.from(Buffer.from(fx.water, 'base64'));
  const cities = [
    ['flat 256', generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7, zoo: true })],
    ['flat 320', generateCity({ ...DEFAULTS, ...L, size: 320, seed: 12345, zoo: true })],
    ["a player's fitted city", generateCity({ ...DEFAULTS, ...fx.settings, ...L, zoo: true, terrain: { ground, water, baseY: fx.baseY } })],
  ];
  check('defaults: no zoo unless asked', DEFAULTS.zoo === false);
  const animalKinds = new Set(ZOO_PENS.flatMap((p) => p.kinds)).size;
  let zoos = 0, aquas = 0, problems = [], kindsAll = 0, varietiesAll = 0, dry = 0, unfooted = 0, signs = 0, tight = [], widths = [];
  for (const [name, r] of cities) {
    const t = inspectZoo(r);
    if (t.zoo) { tight.push(...t.tight.map((q) => `${name}: ${q}`)); widths.push(r.landmarks.find((L) => L.kind === 'zoo').wide); zoos++; if (t.animalKinds === animalKinds) kindsAll++; unfooted += t.animalsBad.length; if (t.zooSigns === t.penCount) signs++; }
    if (t.aquarium) { aquas++; if (t.varieties === 22) varietiesAll++; dry += t.fishDry.length; }
    problems.push(...t.problems.map((p) => `${name}: ${p}`));
  }
  check('zoo: built when asked, on flat cities and on a fitted one', zoos === cities.length, `${zoos} of ${cities.length}`);
  check('aquarium: built when asked, on flat cities and on a fitted one', aquas === cities.length, `${aquas} of ${cities.length}`);
  check('zoo: every land animal in it, each on its feet', kindsAll === zoos && unfooted === 0, `${kindsAll} of ${zoos}, ${unfooted} not on their feet`);
  check('zoo and aquarium: no animal or fish can get out (pens fenced three high, aviary and tanks closed)', problems.length === 0, problems.slice(0, 3).join('; '));
  check('aquarium: every fish in water, all 22 named tropical fish in the reef', varietiesAll === aquas && dry === 0, `${varietiesAll} of ${aquas}, ${dry} dry`);
  check('zoo: a sign at every pen', signs === zoos, `${signs} of ${zoos}`);
  check('zoo: every animal fits its pen with room, clear of the fence (none starts inside one)', tight.length === 0, tight.slice(0, 3).join('; '));
  note(`zoo widths: ${widths.join(', ')} (pens ${widths.map((w) => (w - 7) / 2).join(', ')} deep)`);
  // the aquarium's tanks: four deep, six long, water four deep where the lot
  // allows (squid were cramped in two by four by three)
  {
    const as = cities.map(([, r]) => r.landmarks.find((L) => L.kind === 'aquarium')).filter(Boolean);
    const bigOnes = as.filter((A) => A.big);
    const roomy = bigOnes.every((A) => A.tanks.filter((t) => !t.reef).every((t) => t.u[1] - t.u[0] + 1 >= 4 && t.v[1] - t.v[0] + 1 >= 6 && t.water >= 4));
    check('aquarium: where the lot allows, tanks four deep, six long, water four deep', bigOnes.length >= 1 && roomy, `${bigOnes.length} big of ${as.length}`);
  }
  // the farm and the drylands the big pens (two rows long) in every zoo, deep
  // lot or not (on a shallower one, horses join the drylands, bears share)
  {
    const zs = cities.map(([, r]) => r.landmarks.find((L) => L.kind === 'zoo')).filter(Boolean);
    const bigOk = zs.every((Z) => ['Farm', 'Drylands'].every((n) => { const p = Z.pens.find((q) => q.name === n); return p && p.v[1] - p.v[0] + 1 === 7; }));
    const every = zs.every((Z) => new Set(Z.animals.map((a) => a.type)).size === animalKinds);
    check('zoo: the farm and the drylands are the big pens (four by seven) in every zoo, every animal still in it', zs.length >= 2 && bigOk && every, `${zs.length} zoos, big ${bigOk}, all animals ${every}`);
  }
  {
    const r = cities[0][1], w = r.world;
    const fns = functionFiles(buildStructures(w, {}), w, { namespace: 'test', spawns: r.spawns, zoo: r.zoo });
    const pf = fns.find((f) => /(^|\/)populate\.mcfunction$/.test(f.name));
    const text = pf ? (pf.text || pf.data || '') : '';
    const lines = text.split('\n');
    // every animal and fish in the zoo's own structure tiles, as the game saves it
    // (summoned by command they kept failing to appear): its kind, kept, at its
    // place, a tropical fish carrying its variety's own groups; and populate loads them
    const { buildMobStructures } = await import('../../engine/export.js');
    const { decodeNbt } = await import('../nbt-read.js');
    const { startingGroups } = await import('../../engine/mob-nbt.js');
    const zooTiles = buildMobStructures(r.spawns, { seed: 1 }).filter((t) => t.name.startsWith('m_zoo_'));
    const zooEnts = zooTiles.flatMap((t) => decodeNbt(t.data).root.structure.entities);
    const zl = r.zoo.filter((p) => zooEnts.some((e) => e.identifier === 'minecraft:' + p.type && e.Persistent === 1 && e.definitions.includes('+polis:kept')
      && Math.floor(e.Pos[0]) === Math.floor(p.x) && Math.floor(e.Pos[2]) === Math.floor(p.z)
      && (!p.variety || [...startingGroups('tropicalfish', 'minecraft:become_' + p.variety)].every((g) => e.definitions.includes('+' + g)))));
    const loaded = zooTiles.every((t) => lines.some((l) => l.startsWith('structure load ') && l.includes(':' + t.name + ' ')));
    check('zoo and aquarium: every animal and fish in the zoo\'s own structures, as the game saves it (a tropical fish as its variety), loaded by populate', zl.length === r.zoo.length && r.zoo.length > 0 && loaded, `${zl.length} of ${r.zoo.length}, loaded ${loaded}`);
    // the zoo and the jail on their own, and the city's ticking areas again: a
    // summon reaches only loaded chunks, and a world holds ten ticking areas
    {
      const both = generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7, zoo: true, jail: true });
      // (with the mob structures handed in as exportPack hands them: their groups kept)
      const { buildMobStructures: bms } = await import('../../engine/export.js');
      const f2 = functionFiles(buildStructures(both.world, {}), both.world, { namespace: 'test', spawns: both.spawns, zoo: both.zoo, inmates: both.inmates, mobTiles: bms(both.spawns, {}) });
      const get = (n) => f2.find((f) => f.fn === 'test/' + n);
      const names = ['zoo', 'zoo_centered', 'jail', 'jail_centered', 'areas', 'areas_centered'];
      const have = names.filter((n) => get(n));
      // (each loads its own landmark's structure tiles, every one of them)
      const { mobTiles } = await import('../../engine/export.js');
      const tilesOf = (g) => mobTiles(both.spawns).filter((t) => t.group === g).map((t) => t.name);
      const loadsAll = (fn, g) => { const f = get(fn); const names = tilesOf(g); return !!f && names.length > 0 && names.every((n) => f.text.includes(':' + n + ' ')) && f.text.split('\n').filter((l) => l.startsWith('structure load')).length === names.length; };
      const zooAll = loadsAll('zoo', 'zoo'), jailAll = loadsAll('jail', 'jail');
      const b = get('build').text.split('\n');
      const tidy = b.filter((l) => l.startsWith('tickingarea add')).every((l) => { const name = l.split(' ').pop(); const ia = b.indexOf(l), ir = b.indexOf('tickingarea remove ' + name); return ir >= 0 && ir < ia; });
      // populate keeps the city loaded: its ticking areas made before any summon and
      // left on (taken off at its end, a later run, or jail, zoo or museum, found the
      // far side unloaded and summoned nothing there); release takes them off
      {
        // (populate touches no ticking area at all: build's hold the city while it
        // runs; taken off at its start, even to be made again, the far side was
        // unloaded the moment every summon ran, and only the villagers came)
        const touches = ['populate', 'populate_centered'].some((n) => get(n).text.split('\n').some((l) => l.startsWith('tickingarea')));
        const names = b.filter((l) => l.startsWith('tickingarea add')).map((l) => l.split(' ').pop());
        const rel = get('release'), relC = get('release_centered');
        const relAll = names.length > 0 && rel && relC && names.every((n) => rel.text.includes('tickingarea remove ' + n) && relC.text.includes('tickingarea remove ' + n));
        check('populate leaves the ticking areas build made alone (no tickingarea command in it); release (and release_centered) take every one off', !touches && relAll, `populate touches them ${touches}, release ${!!relAll}`);
      }
      check('zoo and jail: their own functions (zoo, jail, and areas to keep the city loaded), each summoning all of them; build clears its ticking areas before it makes them', have.length === names.length && zooAll && jailAll && tidy, `${have.length} of ${names.length}, zoo ${!!zooAll}, jail ${!!jailAll}, tidy ${tidy}`);
    }
    // Kept: every jail, zoo and aquarium summon with the pack's polis:keep (a name
    // from /summon did not keep them: away from a player they despawned), and the
    // pack carrying, for every mob summoned, the game's own definition with only
    // the keep group (persistent) and event (the game's own spawn event, then keep)
    {
      const { mobEntityFiles, exportPack } = await import('../../engine/export.js');
      const { readZipEntries } = await import('../../engine/worldfile.js');
      const { VANILLA_MOBS } = await import('../../engine/mob-entities.js');
      const both = generateCity({ ...DEFAULTS, ...L, size: 256, seed: 7, zoo: true, jail: true });
      const f3 = functionFiles(buildStructures(both.world, {}), both.world, { namespace: 'test', spawns: both.spawns, zoo: both.zoo, inmates: both.inmates });
      // (the mobs in the jail's and zoo's structures, every one of them carrying +polis:kept)
      const { buildMobStructures: bms } = await import('../../engine/export.js');
      const { decodeNbt: dn } = await import('../nbt-read.js');
      const landEnts = bms(both.spawns, { seed: 1 }).filter((t) => /^m_(zoo|jail)_/.test(t.name)).flatMap((t) => dn(t.data).root.structure.entities).filter((e) => e.identifier !== 'minecraft:minecart');
      const zl = landEnts.map((e) => `summon ${e.identifier}`);
      const unkept = landEnts.filter((e) => !e.definitions.includes('+polis:kept') && !(e.identifier === 'minecraft:enderman'));
      const mobs = mobEntityFiles();
      const kinds = new Set(zl.map((l) => l.split(' ')[1].replace('minecraft:', '')));
      const fishKinds = new Set(['cod', 'salmon', 'tropicalfish']);
      const missingDef = [...kinds].filter((k) => !fishKinds.has(k) && !mobs.some((f) => f.name === `entities/${k}.json`));
      let exact = true;
      for (const f of mobs) {
        const k = f.name.replace('entities/', '').replace('.json', ''), d = JSON.parse(f.data), e = d['minecraft:entity'];
        const kept = e.component_groups['polis:kept'], ev = e.events['polis:keep'];
        if (!kept || !kept['minecraft:persistent'] || !ev) { exact = false; continue; }
        const game = VANILLA_MOBS[k]['minecraft:entity'];
        const gs = (game.events || {})['minecraft:entity_spawned'];
        if (gs && !(ev.sequence && JSON.stringify(ev.sequence[0]) === JSON.stringify(gs))) exact = false;
        delete e.component_groups['polis:kept']; delete e.events['polis:keep'];
        // (a section the game's file had empty or null, and only ours in it, back as it was)
        if (Object.keys(e.component_groups).length === 0 && !(game.component_groups && Object.keys(game.component_groups).length)) e.component_groups = game.component_groups;
        if (Object.keys(e.events).length === 0 && !(game.events && Object.keys(game.events).length)) e.events = game.events;
        if (JSON.stringify(d) !== JSON.stringify(VANILLA_MOBS[k])) exact = false;
      }
      check('zoo and jail: every mob kept (+polis:kept), the pack carrying each mob\'s own definition with only the keep added', unkept.length === 0 && missingDef.length === 0 && exact, `${unkept.length} unkept, missing ${missingDef.join(',')}, exact ${exact}`);
      // and the pack itself: the mobs' and the fish's definitions in it when there is a jail, zoo or aquarium
      const pk = await exportPack(both.world, { namespace: 'test', name: 'test', spawns: [], zoo: both.zoo, inmates: both.inmates });
      const names = new Set(readZipEntries(pk.data).entries.map((e) => e.name.replace(/^.*?entities\//, 'entities/')));
      check('pack: carries the mobs\' and the fish\'s definitions when the city has a jail, zoo or aquarium (even with no pond fish)', names.has('entities/goat.json') && names.has('entities/tropicalfish.json') && names.has('entities/zombie.json'), [...names].filter((n) => n.startsWith('entities/')).length + ' entity files');
    }
    const tf = JSON.parse(fishEntityFiles().find((f) => /tropicalfish/.test(f.name)).data);
    const ev = tf['minecraft:entity'].events;
    check('pack: the tropical fish carries a keep event for each of the 22 named ones', TROPICAL_VARIETIES.every((v) => ev['polis:keep_' + v] && ev['polis:keep_' + v].add.component_groups.includes('polis:kept')));
    note(`zoo: ${r.zoo.filter((p) => !p.tank && p.tank !== 0).length} animals; aquarium: ${r.zoo.filter((p) => p.tank !== undefined).length} fish and others`);
  }
}
