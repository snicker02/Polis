// tools/checks/2zo-style-districts.js — a city of several styles.
//
// With "Mix styles by district" on and two or more styles ticked, the city is
// shared out among districts, each built in one style: every ticked style gets
// buildings; each building is built whole in its own district's style (its
// theme one of that style's, its dress the style's own); the streets and
// ground are restyled district by district; lighting still leaves no dark
// spot. Off, or with fewer than two ticked, the city is exactly the city of its
// one style.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zo';
export const label = '2zo. styles by district';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { STYLES, STYLE_NAMES } = await import('../../engine/styles.js');
  const blk = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block.replace('minecraft:', ''); };

  check('defaults: one style unless asked; a mix ready to tick', DEFAULTS.mixStyles === false && Array.isArray(DEFAULTS.mixList) && DEFAULTS.mixList.length >= 2);
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8'), main = readFileSync(join(ROOT, 'main.js'), 'utf8');
  const boxes = [...html.matchAll(/class="mixStyle" value="(\w+)"/g)].map((m) => m[1]);
  check('page: a Mix styles box, and a box for every style, read into the config',
    /<input type="checkbox" id="mixStyles">/.test(html) && boxes.length === STYLE_NAMES.length && STYLE_NAMES.every((n) => boxes.includes(n)) &&
    /cfg\.mixStyles = \$\('mixStyles'\)\.checked/.test(main) && /cfg\.mixList = \[\.\.\.document\.querySelectorAll\('\.mixStyle'\)\]/.test(main));

  let ok = true, missing = 0, themeBad = 0, split = 0, darkLeft = 0, eaveless = 0, crownless = 0, lancetless = 0, glassStreet = 0, glassCells = 0, nylium = 0, netherCells = 0;
  const seen = new Set();
  for (const [size, seed, list, base] of [[256, 7, ['modern', 'medieval', 'eastasian', 'artdeco'], 'modern'], [224, 12345, ['glass', 'nether', 'venetian', 'cherry', 'desert'], 'glass']]) {
    const r = generateCity({ ...DEFAULTS, size, seed, cityStyle: base, mixStyles: true, mixList: list });
    const w = r.world, SD = r.styleDistricts;
    const v = verifyAll(w, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked || r.reach.unreached.length) ok = false;
    darkLeft += r.stats.lighting.darkAfter;
    // every ticked style has buildings
    const lotsBy = {};
    for (const l of r.plan.lots) if (l.district) lotsBy[l.district] = (lotsBy[l.district] || 0) + 1;
    for (const n of list) { if (!lotsBy[n]) missing++; seen.add(n); }
    // each building whole in its own district's style
    for (const b of r.buildings) {
      if (b.landmark) continue;
      const lot = r.plan.lots.find((l) => b.x0 >= l.x0 - 1 && b.x1 <= l.x1 + 1 && b.z0 >= l.z0 - 1 && b.z1 <= l.z1 + 1 && l.district);
      if (!lot) continue;
      const S = STYLES[lot.district];
      if (!Object.values(S.themes).flat().some((t) => t.name === b.themeName)) themeBad++;
      // never split: every cell of the lot is its district
      for (let z = lot.z0; z <= lot.z1; z++) for (let x = lot.x0; x <= lot.x1; x++) if (SD.at(x, z) !== lot.district) { split++; break; }
      // the style's own dress
      if (S.eaves && b.floors >= 2 && !(b.shape || '').startsWith('pagoda') && (!b.eaves || !b.eaves.skirts)) eaveless++;
      if (S.deco && b.style === 'tower' && !(b.deco && b.deco.crown)) crownless++;
      if (S.lancets && b.style !== 'tower' && !b.lancets) lancetless++;
    }
    // the ground restyled district by district: glass streets, nylium lawns
    const { W, D, use } = r.plan;
    for (let z = 0; z < D; z += 2) for (let x = 0; x < W; x += 2) {
      const d = SD.at(x, z), u = use[z * W + x];
      if (d === 'glass' && u === 1) { glassCells++; if (/stained_glass/.test(blk(w, x, 1, z))) glassStreet++; }
      if (d === 'nether' && u === 4) { netherCells++; if (/nylium|shroomlight|sea_lantern/.test(blk(w, x, 1, z))) nylium++; }
    }
  }
  check('mixed: every building walks through, every floor and door reached', ok);
  check('mixed: every ticked style gets buildings', missing === 0, `${missing} styles without`);
  check('mixed: each building built from its own district\'s themes', themeBad === 0, `${themeBad} from another style`);
  check('mixed: no building split between districts', split === 0, `${split}`);
  check('mixed: each district dresses its buildings its own way (eaves, Deco crowns, pointed windows)', eaveless === 0 && crownless === 0 && lancetless === 0, `${eaveless} without eaves, ${crownless} without crowns, ${lancetless} without pointed windows`);
  check('mixed: streets and ground restyled district by district (glass streets, nylium parks)',
    glassCells > 0 && glassStreet >= glassCells * 0.8 && (netherCells === 0 || nylium >= netherCells * 0.6), `${glassStreet}/${glassCells} glass streets, ${nylium}/${netherCells} nylium`);
  check('mixed: lighting still leaves no dark spot', darkLeft === 0, `${darkLeft}`);
  // off, or only one ticked: the one-style city, block for block
  const blocks = (c) => { const a = []; c.world.forEach((x, y, z, id) => a.push(x, y, z, id)); return a.join(','); };
  const plain = generateCity({ ...DEFAULTS, seed: 7, size: 128 });
  const off = generateCity({ ...DEFAULTS, seed: 7, size: 128, mixStyles: false, mixList: ['glass', 'nether'] });
  const one = generateCity({ ...DEFAULTS, seed: 7, size: 128, mixStyles: true, mixList: ['glass'] });
  check('off, or one style ticked: exactly the one-style city', blocks(off) === blocks(plain) && blocks(one) === blocks(plain) && !plain.styleDistricts);
  note(`districts: ${[...seen].join(', ')}`);
}
