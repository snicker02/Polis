// tools/checks/2zi-hostile-mobs.js — hostile mobs, on request.
//
// Off by default: populate brings none unless the option is on, while the
// hostiles functions are always in the pack for a player who wants them later.
// Only kinds daylight leaves alone, a mix for each style, standing where a mob
// can stand (streets, squares, parks, three clear over the ground), spaced out,
// never by a doorstep and never inside a building. Turning them on or off
// changes nothing else about a city.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zi';
export const label = '2zi. hostile mobs';

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { HOSTILE_KINDS, HOSTILE_MIX, mixFor } = await import('../../engine/hostiles.js');
  const { exportPack, cityId } = await import('../../engine/export.js');
  const { javaTiles, javaPackFiles } = await import('../../engine/export-java.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { USE } = await import('../../engine/plan.js');
  const solid = (w, x, y, z) => { const id = w.get(x, y, z); return id !== -1 && !MATERIALS.isPassable(id); };

  check('defaults: populate brings no hostile mobs unless asked; 24 ready for the functions', DEFAULTS.hostiles === false && DEFAULTS.hostileCount === 24);
  // only kinds daylight leaves alone
  const BURN = new Set(['zombie', 'skeleton', 'stray', 'drowned', 'phantom', 'zombie_villager']);
  const allKinds = new Set(Object.values(HOSTILE_MIX).flatMap((m) => m.map(([k]) => k)));
  check('kinds: every kind in every mix is untouched by daylight, and known to both editions',
    [...allKinds].every((k) => !BURN.has(k) && HOSTILE_KINDS[k] && HOSTILE_KINDS[k].be && HOSTILE_KINDS[k].java && /^[A-Za-z]+$/.test(HOSTILE_KINDS[k].name)));

  // ---- placement, in cities of several styles ------------------------------------
  let placed = 0, wrongUse = 0, noStand = 0, crowded = 0, byDoor = 0, inside = 0, offMix = 0, allSame = true;
  const byStyle = {};
  for (const [st, seed] of [['modern', 7], ['medieval', 31], ['desert', 4], ['nether', 12345], ['eastasian', 3]]) {
    const r = generateCity({ ...DEFAULTS, seed, size: 160, cityStyle: st });
    const w = r.world, { W, use } = r.plan;
    const mix = new Set(mixFor(st).map(([k]) => k));
    byStyle[st] = {};
    for (const h of r.hostiles) {
      placed++;
      byStyle[st][h.type] = (byStyle[st][h.type] || 0) + 1;
      if (!mix.has(h.type)) offMix++;
      const u = use[h.z * W + h.x];
      if (![USE.ROAD, USE.PLAZA, USE.PARK, USE.SIDEWALK].includes(u)) wrongUse++;
      if (!solid(w, h.x, h.y - 1, h.z) || [0, 1, 2].some((d) => solid(w, h.x, h.y + d, h.z))) noStand++;
      if (r.hostiles.some((o) => o !== h && Math.max(Math.abs(o.x - h.x), Math.abs(o.z - h.z)) < 5)) crowded++;
      if (r.buildings.some((b) => Math.abs(b.outside[0] - h.x) <= 3 && Math.abs(b.outside[2] - h.z) <= 3)) byDoor++;
      if (r.buildings.some((b) => h.x >= b.x0 && h.x <= b.x1 && h.z >= b.z0 && h.z <= b.z1)) inside++;
    }
    if (st === 'modern') {
      // turning them off, or changing how many, changes nothing else
      const off = generateCity({ ...DEFAULTS, seed, size: 160, cityStyle: st, hostileCount: 0 });
      const blocks = (c) => { const a = []; c.world.forEach((x, y, z, id) => a.push(x, y, z, id)); return a.join(','); };
      allSame = off.hostiles.length === 0 && blocks(off) === blocks(r) && JSON.stringify(off.spawns) === JSON.stringify(r.spawns);
      const again = generateCity({ ...DEFAULTS, seed, size: 160, cityStyle: st });
      check('placement: same seed, same mobs in the same places', JSON.stringify(again.hostiles) === JSON.stringify(r.hostiles));
      check('stats: count them', r.stats.hostiles === r.hostiles.length);
    }
  }
  check('placement: 24 in each city', placed === 24 * 5, String(placed));
  check('placement: each style its own mix (Nether fauna, an illager raid, desert husks)', offMix === 0 &&
    Object.keys(byStyle.nether).every((k) => ['wither_skeleton', 'blaze', 'magma_cube', 'zombified_piglin', 'zoglin'].includes(k)) &&
    Object.keys(byStyle.medieval).every((k) => ['pillager', 'vindicator', 'evoker', 'witch'].includes(k)) && byStyle.desert.husk > 0, JSON.stringify(byStyle));
  check('placement: on streets, squares, parks and pavements only', wrongUse === 0, `${wrongUse}`);
  check('placement: on solid ground with three clear blocks over it', noStand === 0, `${noStand}`);
  check('placement: at least five apart', crowded === 0, `${crowded}`);
  check('placement: never within three of a doorstep, never inside a building', byDoor === 0 && inside === 0, `${byDoor} by doors, ${inside} inside`);
  check('placement: off (or any number) changes no block and no other mob', allSame);

  // ---- the Bedrock pack --------------------------------------------------------------
  const r = generateCity({ ...DEFAULTS, seed: 7, size: 160 });
  const pack = async (inPop) => exportPack(r.world, { namespace: cityId(r.world, 7), spawns: r.spawns, hostiles: r.hostiles, hostilesInPopulate: inPop, deflateRaw });
  const fn = (out, n) => out.functions.find((x) => x.name.endsWith('/' + n + '.mcfunction'));
  const summonRe = /^summon minecraft:[a-z_]+ [A-Za-z]+ ~-?\d* ~-?\d* ~-?\d*$/;
  const hostileLines = (t) => t.split('\n').filter((l) => /^summon /.test(l) && Object.values(HOSTILE_KINDS).some((k) => l.startsWith(`summon ${k.be} ${k.name} `)));
  const offPack = await pack(false), onPack = await pack(true);
  check('bedrock: by default populate summons no hostile mob', hostileLines(fn(offPack, 'populate').text).length === 0 && hostileLines(fn(offPack, 'populate_centered').text).length === 0);
  check('bedrock: with the option on, populate summons every one (while its ticking areas hold the city)',
    hostileLines(fn(onPack, 'populate_centered').text).length === r.hostiles.length &&
    fn(onPack, 'populate_centered').text.indexOf('summon ') < fn(onPack, 'populate_centered').text.indexOf('tickingarea remove'));
  const hc = fn(offPack, 'hostiles_centered'), hh = fn(offPack, 'hostiles'), clr = fn(offPack, 'hostiles_clear');
  check('bedrock: hostiles and hostiles_centered are in the pack either way, each summoning every mob by name',
    hc && hh && hostileLines(hc.text).length === r.hostiles.length && hostileLines(hh.text).length === r.hostiles.length &&
    hostileLines(hc.text).every((l) => summonRe.test(l)));
  const kinds = [...new Set(r.hostiles.map((h) => h.type))];
  check('bedrock: hostiles_clear removes each kind by its name, and only those',
    clr && kinds.every((k) => clr.text.includes(`kill @e[type=${HOSTILE_KINDS[k].be},name=${HOSTILE_KINDS[k].name}]`)) &&
    clr.text.split('\n').filter((l) => l.startsWith('kill')).length === kinds.length);
  check('bedrock: the player is warned (block damage, villagers, Peaceful)', /mobgriefing/.test(hc.text) && /villagers/.test(hc.text) && /Peaceful/.test(hc.text));
  const none = generateCity({ ...DEFAULTS, seed: 7, size: 160, hostileCount: 0 });
  const nonePack = await exportPack(none.world, { namespace: cityId(none.world, 7), spawns: none.spawns, hostiles: none.hostiles, deflateRaw });
  check('bedrock: with none asked for, no hostiles functions', !fn(nonePack, 'hostiles') && !fn(nonePack, 'hostiles_clear'));

  // ---- the Java datapack ----------------------------------------------------------------
  const tiles = javaTiles(r.world, { prefix: 'city', spawns: r.spawns });
  const jf = javaPackFiles(tiles, { namespace: 'polis', hostiles: r.hostiles, box: r.world.box });
  const jh = jf.find((f) => /function\/hostiles\.mcfunction$/.test(f.name)), jc = jf.find((f) => /function\/hostiles_clear\.mcfunction$/.test(f.name));
  const jl = jh ? jh.text.split('\n') : [];
  const jsum = jl.filter((l) => l.startsWith('summon '));
  check('java: hostiles forceloads the ground, summons each kept and tagged, then releases it',
    jsum.length === r.hostiles.length && jsum.every((l) => /^summon minecraft:[a-z_]+ ~-?\d+ ~-?\d+ ~-?\d+ \{PersistenceRequired:1b,Tags:\["polis_hostile"\]\}$/.test(l)) &&
    jl.findIndex((l) => l.startsWith('forceload add')) < jl.findIndex((l) => l.startsWith('summon')) &&
    jl.findIndex((l) => l.startsWith('forceload remove')) > jl.lastIndexOf(jsum[jsum.length - 1]));
  check('java: hostiles_clear removes only the tagged', jc && /kill @e\[tag=polis_hostile\]/.test(jc.text));

  // ---- the page ------------------------------------------------------------------------
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8'), main = readFileSync(join(ROOT, 'main.js'), 'utf8');
  check('page: the option is a checkbox, unchecked, with a count slider, both read into the config',
    /<input type="checkbox" id="hostiles">/.test(html) && /id="hostileCount"/.test(html) &&
    /const CHECKS = \[[^\]]*'hostiles'/.test(main) && /cfg\.hostileCount = num\('hostileCount'\)/.test(main) && /hostilesInPopulate: !!result\.cfg\.hostiles/.test(main));
  // the sidebar's layout: no slider row inside a checkbox grid (it was squeezed
  // into half a column), and the grid's columns may shrink to the panel (a 1fr
  // column cannot go narrower than its longest word, which pushed the whole
  // panel wider and cut off the slider values)
  const grids = [...html.matchAll(/<div class="checks">([\s\S]*?)<\/div>\s*(?=<div class="(?:row|hint)|<\/fieldset>)/g)].map((m) => m[1]);
  check('page: no slider row inside a checkbox grid', grids.length >= 2 && grids.every((g) => !/class="row/.test(g)), `${grids.length} grids`);
  check('page: checkbox grid columns can shrink to the panel', /\.checks \{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(html));
  note(`hostiles: ${placed} placed across 5 styles · ${JSON.stringify(byStyle.nether)}`);
}
