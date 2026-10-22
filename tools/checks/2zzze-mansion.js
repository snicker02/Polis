// tools/checks/2zzze-mansion.js — the mansion with every big landmark asked for (0.75.4).
//
// The big landmarks asked for (jail, zoo, museum, hospital...) chose their lots first and
// took every lot the mansion fits: it came last and was never built (a report: "what ever
// happened to my mansion?"). Now, with no lot left for it, one of them moves to a free lot it
// fits as well and the mansion takes the lot it leaves; and failing that the mansion makes do
// with a lot fifteen square (the house alone, no wings or garden). Nothing asked for is lost
// to it; in a city too small for everything asked for, they come first.
// - with every big landmark on, a mansion in every city of 256 and 320;
// - and every big landmark still built where it was before (a 384 city, all of them but the
//   three that want the biggest lots);
// - with none asked for, the mansion on the biggest lot out of the middle, as before.

export const id = '2zzze';
export const label = '2zzze. the mansion, with every big landmark asked for';

export default async function run(ctx) {
  const { check } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const BIG = ['jail', 'zoo', 'museum', 'hospital', 'firestation', 'police', 'theatre', 'hotel', 'factory', 'park', 'waterpark', 'garden', 'mall', 'bank', 'watertower', 'petrol', 'skatepark', 'wizard', 'station'];
  const L = { villagers: 0, fish: false, transit: 'trams' };
  const on = (cfg) => { for (const k of BIG) cfg[k] = true; return cfg; };
  const runs = [[256, 1], [256, 3], [320, 2], [320, 4]].map(([size, seed]) => [size, generateCity(on({ ...DEFAULTS, ...L, size, seed }))]);
  check('with every big landmark asked for, a mansion in every city of 256 and 320', runs.every(([, r]) => r.landmarks.some((l) => l.kind === 'mansion')), runs.map(([n, r]) => `${n}: ${r.landmarks.some((l) => l.kind === 'mansion')}`).join(', '));
  {
    const r = generateCity(on({ ...DEFAULTS, ...L, size: 384, seed: 1, outline: 'square', hills: 0 }));
    const have = new Set(r.landmarks.map((l) => l.kind));
    const want = [...BIG, 'aquarium', 'workshop', 'mill', 'lazyriver', 'mansion'];
    const miss = want.filter((k) => !have.has(k));
    check('and every big landmark asked for still built (a square 384 city)', miss.length === 0, miss.join(', '));
  }
  {
    const r = generateCity({ ...DEFAULTS, size: 256, seed: 3, villagers: 0, fish: false });
    const M = r.landmarks.find((l) => l.kind === 'mansion');
    const area = (l) => (l.x1 - l.x0 + 1) * (l.z1 - l.z0 + 1);
    const lots = r.plan.lots.filter((l) => l.landmark === 'mansion' || !l.landmark);
    const bigger = lots.filter((l) => area(l) > area(M.lot) && Math.min(l.x1 - l.x0 + 1, l.z1 - l.z0 + 1) >= 15).length;
    check('with none asked for, the mansion as before: built, on a big lot', !!M && area(M.lot) >= 15 * 20, `${M ? area(M.lot) : 'none'}, ${bigger} bigger lots free`);
  }
}
