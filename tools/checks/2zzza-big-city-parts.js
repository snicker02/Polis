// tools/checks/2zzza-big-city-parts.js — a city too big to keep loaded at once.
//
// A world holds ten ticking areas at most (Bedrock), each of 100 chunks at most. A
// 512 city with its harbour needs twenty of build's squares: build asked for all
// twenty, the game made ten (none, with another city's still on), and populate's
// metro rails, mobs and summons in the rest of the city went nowhere (0.72.0: a
// sunken 512 city's metro left bare). Such a city is now filled in parts
// (export.js: stagePlan, chain):
//
// - on the reporter's own city: populate, populate_centered, metro_rails(_centered)
//   and the jail, zoo and museum functions each run in the game's order (functions
//   called, areas waited for, the marker found) never hold more than ten ticking
//   areas at once, none over 100 chunks however the city sits on the chunk grid;
// - every structure, setblock and summon they make lands inside a ticking area held
//   at that moment, and every one populate should make is made, once (each metro
//   rail, each rail set again, each mob structure, each minecart, boat and fish);
// - a scheduled part runs from the marker, not from where the player has walked to;
// - at the end: the marker gone, the middle of the city still held (four areas),
//   "done" said; build holds those same four;
// - no function file near Bedrock's ten thousand commands; every new command one of
//   the forms the game takes;
// - a small city just as before: no parts, build holding all of it.

export const id = '2zzza';
export const label = '2zzza. a big city filled in parts (ticking areas)';

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const ex = await import('../../engine/export.js');
  const { tileList, buildMobStructures, buildRailStructures, functionFiles, placementGuide, needsStages, undergroundRailLines, railLines, MAX_TICKING_AREAS, STAGE_AREAS } = ex;

  const pack = (r, ns) => {
    const opts = { namespace: ns, prefix: 'c', spawns: r.spawns || [], hostiles: r.hostiles || [], hostilesInPopulate: true,
      inmates: r.inmates || [], zoo: r.zoo || [], stands: r.stands || [], centre: r.world.centre };
    const tiles = tileList(r.world, opts), mobs = buildMobStructures(opts.spawns, opts);
    const fns = functionFiles(tiles, r.world, { ...opts, mobTiles: mobs });
    const guide = placementGuide(tiles, { ...opts, world: r.world, plugs: !!(r.world.airBoxes && r.world.airBoxes.length) });
    const sizes = new Map();
    for (const t of tiles) sizes.set(t.name, t.size);
    for (const t of buildRailStructures(r.world, opts)) sizes.set(t.name, t.size);
    for (const t of mobs) sizes.set(t.name, t.size);
    return { opts, tiles, mobs, fns, guide, sizes };
  };

  // the game, as far as these functions go: ticking areas, the marker, schedule, execute at
  const simulate = (P, ns, starts) => {
    const byFn = new Map(P.fns.map((f) => [f.fn, f.text]));
    const areas = new Map(), queue = [], made = [], errs = [];
    let marker = null, maxAreas = 0, tooBig = 0, outside = 0, said = [];
    const MARK = `${ns}_pop`;
    const off = (t) => (t === '~' ? 0 : Number(t.slice(1)));
    const held = (x, z) => [...areas.values()].some((a) => x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1);
    const worst = (s) => Math.ceil((s - 1) / 16) + 1;     // chunks a span of s blocks can cross
    const exec = (fn, pos, depth = 0) => {
      const text = byFn.get(fn);
      if (text === undefined) { errs.push(`no function ${fn}`); return; }
      if (depth > 50) { errs.push('runaway'); return; }
      for (const l of text.split('\n')) {
        if (!l || l.startsWith('#')) continue;
        let m;
        if ((m = l.match(/^tickingarea add (\S+) \S+ (\S+) (\S+) \S+ (\S+) (\S+)$/))) {
          const [x0, z0, x1, z1] = [m[1], m[2], m[3], m[4]].map(off);
          const a = { x0: pos[0] + Math.min(x0, x1), z0: pos[1] + Math.min(z0, z1), x1: pos[0] + Math.max(x0, x1), z1: pos[1] + Math.max(z0, z1) };
          if (areas.has(m[5])) errs.push(`area ${m[5]} made twice`);
          if (areas.size >= MAX_TICKING_AREAS) errs.push(`an eleventh area (${m[5]}) in ${fn}`);
          const cx = worst(a.x1 - a.x0 + 1), cz = worst(a.z1 - a.z0 + 1);
          if (cx * cz > 100) tooBig++;
          areas.set(m[5], a); maxAreas = Math.max(maxAreas, areas.size);
        } else if ((m = l.match(/^tickingarea remove (\S+)$/))) areas.delete(m[1]);
        else if ((m = l.match(/^schedule on_area_loaded add tickingarea (\S+) (\S+)$/))) {
          if (!areas.has(m[1])) errs.push(`waits on ${m[1]}, never made`);
          queue.push(m[2]);
        } else if ((m = l.match(/^execute at @e\[type=armor_stand,name=(\S+),c=1\] run function (\S+)$/))) {
          if (m[1] !== MARK || !marker) { errs.push(`no marker for ${fn}`); continue; }
          if (!held(marker[0], marker[1])) errs.push('the marker not held loaded');
          exec(m[2], marker, depth + 1);
        } else if ((m = l.match(/^function (\S+)$/))) exec(m[1], pos, depth + 1);
        else if (l === `kill @e[type=armor_stand,name=${MARK}]`) marker = null;
        else if (l === `summon armor_stand ${MARK} ~ ~ ~`) marker = pos.slice();
        else if ((m = l.match(/^structure load [a-z0-9_]+:(\S+) (\S+) \S+ (\S+)$/))) {
          const x = pos[0] + off(m[2]), z = pos[1] + off(m[3]), sz = P.sizes.get(m[1]) || [1, 1, 1];
          if (![[x, z], [x + sz[0] - 1, z], [x, z + sz[2] - 1], [x + sz[0] - 1, z + sz[2] - 1]].every(([a, b]) => held(a, b))) outside++;
          made.push(l.replace(/ \S+ \S+ \S+$/, '') + ` @${x},${z}`);
        } else if (/^(setblock|summon) /.test(l)) {
          const t = l.split(' ').filter((w) => w.startsWith('~')).slice(0, 3);
          const x = pos[0] + off(t[0]), z = pos[1] + off(t[2]);
          if (!held(x, z)) outside++;
          made.push(l.split(' ')[0] === 'setblock' ? `${x},${off(t[1])},${z} ${l.split(' ').slice(4).join(' ')}` : `${l.split(' ')[1]} @${x},${z}`);
        } else if (l.startsWith('say ')) said.push(l);
      }
    };
    // (build first, as in the game, then the function itself; the parts run as their
    // areas load: the player has walked away by then)
    for (const [k, start] of [].concat(starts).entries()) {
      if (k === [].concat(starts).length - 1) { made.length = 0; said = []; outside = 0; }
      exec(`${ns}/${start}`, [0, 0]);
      while (queue.length) exec(queue.shift(), [1000, -1000]);
    }
    return { areas, made, errs, maxAreas, tooBig, outside, marker, said };
  };

  // ---- the reporter's city: seed 236416827, 512, sunken, six styles mixed, trams, metro
  // (the settings file as the page saved it, coerced as the page reads it)
  const saved = { terrainBreaks: true, seed: '236416827', size: '512', cityStyle: 'sunken', mixStyles: true, transit: 'trams', outline: 'square',
    hills: '2', wallHeight: '3', minBlock: '10', blockIrregularity: '1', avenueWidth: '5', streetWidth: '3', downtownRadius: '0.34', zoneNoise: '1.95',
    parkChance: '0.12', lotDowntown: '20', lotSuburb: '10', style: 'mid', theme: '', bw: '15', bd: '13', floors: '6', maxFloors: '8',
    twistChance: '0.25', courtyardChance: '0.3', pitch: '5', stairStyle: 'mixed', setbackEvery: '7', setback: true, roofAccess: true,
    useStairs: true, lights: true, lifts: true, lamps: true, trees: true, markings: true, landmarks: true, canal: true, harbour: true,
    bridges: true, detail: true, streetSigns: true, farmChance: '0.2', pondChance: '0.5', golemsPer10: '10', villagers: '200', furnish: true,
    flowers: true, fish: true, megaliths: true, dome: false, stilts: false, floating: false, cliff: false, underwater: false, underground: true,
    metro: true, jail: true, zoo: true, museum: true, hospital: true, firestation: true, police: true, theatre: true, hotel: true, factory: true,
    park: true, waterpark: true, garden: true, mall: true, watertower: true, petrol: true, skatepark: true, wizard: true, nightclub: true,
    bank: true, sports: true, bouts: true, themepark: true, airport: true, station: true, hostiles: false, hostileCount: '78' };
  const cfg = { ...DEFAULTS, mixList: ['mesoamerican', 'moorish', 'elven', 'endcity', 'dwarven', 'brutalist'] };
  for (const [k, v] of Object.entries(saved)) if (k in DEFAULTS) cfg[k] = typeof DEFAULTS[k] === 'number' ? Number(v) : v;
  const r = generateCity(cfg);
  const ns = 'big';
  const P = pack(r, ns);
  check('big city: over ten of build\'s squares, so filled in parts', needsStages(r.world));
  const fn = (n) => P.fns.find((f) => f.fn === `${ns}/${n}`);

  // build: ten areas at most, none too big
  for (const b of ['build', 'build_centered']) {
    const s = simulate(P, ns, b);
    check(`big city: ${b} holds ${STAGE_AREAS} ticking areas (the middle), none over 100 chunks`, s.errs.length === 0 && s.areas.size === STAGE_AREAS && s.tooBig === 0, `${s.areas.size} areas, ${s.tooBig} too big; ${s.errs[0] || ''}`);
  }

  // populate, both ways
  const cx = r.world.centre[0], cz = r.world.centre[1], wb = r.world.box;
  for (const [name, dx, dz] of [['populate_centered', cx, cz], ['populate', wb.x0, wb.z0]]) {
    const s = simulate(P, ns, [name === 'populate' ? 'build' : 'build_centered', name]);
    check(`big city: ${name} never holds more than ten ticking areas, none over 100 chunks, each waited for before its part runs`,
      s.errs.length === 0 && s.maxAreas <= MAX_TICKING_AREAS && s.tooBig === 0, `${s.maxAreas} at most, ${s.tooBig} too big; ${s.errs.slice(0, 3).join('; ')}`);
    check(`big city: ${name}: everything it makes lands inside a ticking area held at that moment`, s.outside === 0, `${s.outside} outside`);
    // what it should make: every metro rail, every rail set again, every mob structure and _rl, every summon
    const want = [];
    const asSet = (l) => { const t = l.split(' '); return `${off3(t[1], dx)},${t[2] === '~' ? 0 : Number(t[2].slice(1))},${off3(t[3], dz)} ${t.slice(4).join(' ')}`; };
    function off3(t, d) { return (t === '~' ? 0 : Number(t.slice(1))); }
    for (const l of undergroundRailLines(r.world, dx, dz)) want.push(asSet(l));
    for (const l of railLines(r.world, dx, dz)) want.push(asSet(l));
    const sets = s.made.filter((m) => !m.startsWith('structure') && !/^minecraft:|^[a-z_]+ @/.test(m) && /^-?\d/.test(m));
    const setCount = new Map(); for (const m of sets) setCount.set(m, (setCount.get(m) || 0) + 1);
    const wantCount = new Map(); for (const m of want) wantCount.set(m, (wantCount.get(m) || 0) + 1);
    let missing = 0, extra = 0;
    for (const [k, v] of wantCount) if ((setCount.get(k) || 0) !== v) missing++;
    for (const k of setCount.keys()) if (!wantCount.has(k)) extra++;
    const metroN = undergroundRailLines(r.world, dx, dz).length;
    check(`big city: ${name} lays every metro rail (${metroN}) and sets every rail again, each once, nothing else`, metroN > 500 && missing === 0 && extra === 0, `${missing} missing or doubled, ${extra} extra of ${want.length}`);
    const loads = s.made.filter((m) => m.startsWith('structure'));
    const rl = P.tiles.filter((t) => buildRailStructures(r.world, P.opts).some((q) => q.name === t.name + '_rl')).length;
    const mobLoads = loads.filter((m) => /:m_/.test(m) || / m_/.test(m)).length, rlLoads = loads.filter((m) => /_rl /.test(m)).length;
    const distinct = new Set(loads).size === loads.length;
    check(`big city: ${name} loads every mob structure (${P.mobs.length}) and every rail structure (${rl}), each once`, mobLoads === P.mobs.length && rlLoads === rl && distinct && rl > 0, `mobs ${mobLoads}, rails ${rlLoads}, distinct ${distinct}`);
    const sp = (P.opts.spawns || []).filter((p) => ['minecart', 'boat', 'cod', 'salmon', 'tropicalfish'].includes(p.type)).length + P.opts.hostiles.length;
    const sums = s.made.filter((m) => /^minecraft:|^[a-z_:]+ @/.test(m) && !m.startsWith('structure')).length;
    check(`big city: ${name} summons every minecart, boat, fish and hostile mob (${sp}), once`, sums === sp, `${sums} of ${sp}`);
    check(`big city: ${name} ends with the marker gone, the middle held (${STAGE_AREAS} areas, the same as build), "done" said`,
      !s.marker && s.areas.size === STAGE_AREAS && [...s.areas.keys()].every((k) => /_t\d+$/.test(k)) && s.said.some((l) => /: done\./.test(l)), `marker ${!!s.marker}, ${s.areas.size} areas`);
  }

  // metro_rails, jail, zoo, museum on their own
  for (const name of ['metro_rails_centered', 'metro_rails', 'jail_centered', 'zoo_centered', 'museum_centered']) {
    if (!fn(name)) { check(`big city: ${name} present`, false); continue; }
    const s = simulate(P, ns, [name.endsWith('_centered') ? 'build_centered' : 'build', name]);
    check(`big city: ${name} in parts too: ten areas at most, everything inside one held, the marker gone at the end`,
      s.errs.length === 0 && s.maxAreas <= MAX_TICKING_AREAS && s.tooBig === 0 && s.outside === 0 && !s.marker && s.made.length > 0, `${s.made.length} made, ${s.outside} outside, ${s.maxAreas} areas; ${s.errs[0] || ''}`);
  }

  // no function anywhere adds an eleventh area by itself; none long
  const adds = Math.max(...P.fns.map((f) => f.text.split('\n').filter((l) => l.startsWith('tickingarea add')).length));
  const longest = P.fns.map((f) => [f.fn, f.text.split('\n').filter((l) => l && !l.startsWith('#')).length]).sort((a, b) => b[1] - a[1])[0];
  check('big city: no function adds more than ten ticking areas; none near Bedrock\'s ten thousand commands', adds <= MAX_TICKING_AREAS && longest[1] < 9000, `${adds} adds; ${longest[0]} ${longest[1]}`);
  const FORMS = [
    new RegExp(`^schedule on_area_loaded add tickingarea ${ns}_t\\d+ ${ns}/[a-z_0-9]+$`),
    new RegExp(`^execute at @e\\[type=armor_stand,name=${ns}_pop,c=1\\] run function ${ns}/[a-z_0-9]+$`),
    new RegExp(`^kill @e\\[type=armor_stand,name=${ns}_pop\\]$`), new RegExp(`^summon armor_stand ${ns}_pop ~ ~ ~$`),
    new RegExp(`^function ${ns}/[a-z_0-9]+$`), new RegExp(`^tickingarea add ~ ~ ~ ~ ~ ~ ${ns}_m$`)];
  let badForm = null;
  for (const f of P.fns) for (const l of f.text.split('\n'))
    if (/^(schedule|execute at @e\[type=armor_stand,name=big_pop|function |kill @e\[type=armor_stand,name=big_pop|summon armor_stand big_pop|tickingarea add ~ ~ ~)/.test(l) && !FORMS.some((re) => re.test(l))) badForm = badForm || l;
  check('big city: the new commands in the forms the game takes', !badForm, badForm || '');
  check('big city: the guide says it is filled in parts, and how to go on from one', /FILLED IN PARTS/.test(P.guide) && P.guide.includes(`/function ${ns}/populate_centered_part<n>`));
  const parts = P.fns.filter((f) => /\/populate_centered_part\d+$/.test(f.fn)).length;

  // ---- a small city: as it was
  const small = generateCity({ ...DEFAULTS, seed: 5, size: 192, metro: true, jail: true });
  const S = pack(small, 'sml');
  const sb = simulate(S, 'sml', 'build_centered'), sp = simulate(S, 'sml', ['build_centered', 'populate_centered']);
  check('small city: no parts (no schedule, no part functions), build holding all of it, populate everything inside',
    !needsStages(small.world) && !S.fns.some((f) => /schedule|_part\d/.test(f.text + f.fn)) && sb.errs.length === 0 && sb.areas.size <= MAX_TICKING_AREAS && sp.outside === 0 && sp.errs.length === 0,
    `${sb.areas.size} areas, ${sp.outside} outside; ${sp.errs[0] || sb.errs[0] || ''}`);
  note(`the reporter's 512 sunken city: ${parts} parts, ${undergroundRailLines(r.world, cx, cz).length} metro rails, ${P.mobs.length} mob structures`);
}
