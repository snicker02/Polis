// tools/checks/fixtures.js — the expensive things the checks share.
//
// Generating a city is the whole cost of the suite; the checks themselves are
// almost free. The old monolith regenerated the same city over and over —
// the bridge section alone built the same six fitted cities seven times — so
// the run took minutes to assert things it had already computed.
//
// Everything costly now comes from here, memoised by an explicit key. The key
// is explicit rather than a hash of the config so that sharing is always a
// deliberate decision you can read: two callers share a city only when they
// ask for the same name.
//
// Nothing in the suite writes to a generated world (checks only read), so
// handing the same object to several sections is safe. If a check ever needs
// to modify one, it must take a fresh city of its own.
//
// The memo lives inside one process. Sections that share a fixture therefore
// belong in the same run — see registry.js, where each section declares what
// it uses and the runner groups accordingly.

import { readFileSync } from 'node:fs';
import { generateCity, DEFAULTS } from '../../engine/city.js';

// The ten configurations section 1 sweeps. Sections 3, 4 and 7 want the
// largest of them, so the list lives here rather than inside section 1.
export const CITY_CASES = [
  { size: 96, seed: 1 },
  { size: 128, seed: 2, blockIrregularity: 0.2 },
  { size: 160, seed: 3, pitch: 4 },
  { size: 160, seed: 4, pitch: 7, maxFloors: 28 },
  { size: 192, seed: 5, minBlock: 22, lotDowntown: 26 },
  { size: 192, seed: 6, useStairs: false },
  { size: 224, seed: 7, downtownRadius: 0.6, parkChance: 0.25 },
  { size: 128, seed: 8, trees: false, lamps: false, markings: false, lights: false },
  { size: 128, seed: 9, roofAccess: false, setback: false },
  { size: 160, seed: 10, focal: [0.2, 0.8] },
];

export function makeFixtures() {
  const memo = new Map();
  const hits = { made: 0, reused: 0 };

  const once = (key, make) => {
    if (memo.has(key)) { hits.reused++; return memo.get(key); }
    hits.made++;
    const v = make();
    memo.set(key, v);
    return v;
  };

  // ---- cities from the fixed sweep -----------------------------------------
  const cityCases = () => once('city-cases', () => {
    const out = [];
    for (const c of CITY_CASES) {
      const cfg = { ...DEFAULTS, ...c };
      const t0 = Date.now();
      const r = generateCity(cfg);
      out.push({ cfg, r, gen: Date.now() - t0 });
    }
    return out;
  });

  const biggestCity = () => once('biggest', () => {
    let best = null;
    for (const { r } of cityCases()) if (!best || r.stats.blocks > best.stats.blocks) best = r;
    return best;
  });

  // ---- the saved patch of real Bedrock terrain -----------------------------
  const terrain = () => once('terrain', () => {
    const raw = JSON.parse(readFileSync(new URL('../test-terrain.json', import.meta.url), 'utf8'));
    return new Map(Object.entries(raw).map(([k, v]) => [k, Int16Array.from(v)]));
  });

  const worldfile = () => once('worldfile', () => import('../../engine/worldfile.js'));

  // findSites is not free either, and every fitted-ground section wants the
  // same list.
  const sites = async (size, step = 64) => {
    const key = `sites:${size}:${step}`;
    if (memo.has(key)) { hits.reused++; return memo.get(key); }
    hits.made++;
    const { findSites } = await worldfile();
    const v = findSites(terrain(), size, { step });
    memo.set(key, v);
    return v;
  };

  const siteGround = async (size, i) => {
    const key = `ground:${size}:${i}`;
    if (memo.has(key)) { hits.reused++; return memo.get(key); }
    hits.made++;
    const { siteGround: cut } = await worldfile();
    const list = await sites(size);
    const s = list[i];
    const v = cut(terrain(), s.x, s.z, size);
    memo.set(key, v);
    return v;
  };

  // ---- a city, built once per name -----------------------------------------
  // city('fitted:160:7:0', () => ({ ...DEFAULTS, ... }))
  const city = (key, makeCfg) => once('city:' + key, () => generateCity(makeCfg()));

  // A city fitted to site `i` of the saved terrain. The name carries every
  // input that changes the result, so two callers asking for the same city
  // get the same one and two asking for different ones never collide.
  const fitted = async (size, i, opts = {}) => {
    const { seed = 7, transit = 'rails', ...rest } = opts;
    const tags = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join(',');
    const key = `fitted:${size}:${i}:${seed}:${transit}${tags ? ':' + tags : ''}`;
    if (memo.has(key)) { hits.reused++; return memo.get(key); }
    hits.made++;
    const site = await siteGround(size, i);
    const v = { site, r: generateCity({ ...DEFAULTS, size, seed, terrain: site, transit, ...rest }) };
    memo.set(key, v);
    return v;
  };

  return { cityCases, biggestCity, terrain, worldfile, sites, siteGround, city, fitted, stats: () => ({ ...hits }) };
}
