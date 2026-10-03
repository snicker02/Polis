// tools/checks/2zp-centre.js — finding the middle again.
//
// The centre mark (diamond monument, beacons) is always placed, even in the
// middle of a big, hilly, mixed city: the search goes out as far as it takes
// (streets stay level across a terraced city). And build_centered leaves an
// armor stand on its spot, so populate_centered and the other centred
// functions run from that spot wherever the player stands: moving between the
// two can no longer put the villagers, animals and fish in the wrong places.

export const id = '2zp';
export const label = '2zp. the centre mark and its marker';

export default async function run(ctx) {
  const { check, note, deflateRaw } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { exportPack, cityId, centreAnchor } = await import('../../engine/export.js');
  const { STYLE_NAMES } = await import('../../engine/styles.js');
  const { LIGHT } = await import('./harness.js');

  // ---- the mark, in big cities
  let found = 0, cities = 0, far = 0;
  const drifts = [];
  for (const [size, seed, mix, hills] of [[512, 931927914, true, undefined], [384, 12345, true, 3], [320, 99, false, 4], [256, 3, true, 4]]) {
    const cfg = { ...DEFAULTS, ...LIGHT, size, seed, ...(hills !== undefined ? { hills } : {}) };   // (the mark: outdoors, built light)
    if (mix) Object.assign(cfg, { mixStyles: true, mixList: STYLE_NAMES, cityStyle: 'village' });
    const r = generateCity(cfg);
    cities++;
    if (r.centre) { found++; drifts.push(r.centre.drift); if (r.centre.drift > size / 4) far++; }
  }
  check('centre mark: placed in every city, big, hilly and mixed ones too', found === cities, `${found}/${cities}`);
  check('centre mark: near the middle (within a quarter of the city)', far === 0, `drifts ${drifts.join(', ')}`);

  // ---- the marker and the centred functions
  const r = generateCity({ ...DEFAULTS, seed: 7, size: 160, hostileCount: 12 });
  const ns = cityId(r.world, 7), anchor = centreAnchor(ns);
  const out = await exportPack(r.world, { namespace: ns, spawns: r.spawns, hostiles: r.hostiles, deflateRaw });
  const fn = (n) => out.functions.find((f) => f.fn === `${ns}/${n}`);
  const bc = fn('build_centered').text.split('\n').filter(Boolean);
  const killAt = bc.indexOf(`kill @e[type=armor_stand,name=${anchor}]`), sumAt = bc.indexOf(`summon armor_stand ${anchor} ~ ~ ~`);
  const lastLoad = bc.map((l, i) => (l.startsWith('structure load') ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  check('build_centered: marks its spot last (the old marker taken away, a new one at your feet, after the city)', killAt > lastLoad && sumAt === killAt + 1);
  check('build (the corner version): no marker', !/armor_stand/.test(fn('build').text));
  // the centred functions run from where you stand, as they always did (their
  // work in them, untouched); each has an optional <name>_from_mark beside it
  const centred = out.functions.filter((f) => f.fn.endsWith('_centered') && f.fn !== `${ns}/build_centered`);
  let workOk = true, extraOk = true;
  for (const f of centred) {
    const base = f.fn.slice(ns.length + 1, -'_centered'.length);
    if (!/^(structure load|summon) /m.test(f.text) || /execute at/.test(f.text)) workOk = false;
    const fm = fn(`${base}_from_mark`);
    if (!fm || !fm.text.includes(`execute at @e[type=armor_stand,name=${anchor},c=1] run function ${ns}/${base}_centered`)) extraOk = false;
  }
  check('centred functions: run from where you stand, their work in them as before', centred.length >= 3 && workOk, `${centred.length} functions`);
  check('centred functions: each has an optional _from_mark that runs it from the marker', extraOk);
  check('guide: how to go back to the marker', out.guide.includes(`/tp @s @e[type=armor_stand,name=${anchor},c=1]`));
  note(`centre mark drifts ${drifts.join(', ')} in ${cities} big cities; ${centred.length} centred functions, each with a _from_mark`);
}
