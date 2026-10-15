// tools/checks/2zzu-steam-santorini-cyber.js — the Steampunk, Santorini and Cyberpunk
// styles (styles.js; their dress, stylebits.js).
//
// Each registered, offered in the page and in the Mix styles list. Each built in two
// cities: every building walks through, every floor and door reached, nothing dark.
// - Steampunk: a smoking chimney stack (a campfire on top) on nearly every roof and on
//   the houses' own chimneys; copper pipes down the side walls, none lower than head
//   height; copper roofs left unwaxed (they go green in the game);
// - Santorini: every house's roof flat and white, a blue dome with a lantern on many
//   roofs, bougainvillea over the doorways (kept from decaying), never below head
//   height; a town on hills, low, unless the sliders say otherwise;
// - Cyberpunk: neon round every other floor of every building of two floors and more,
//   blade signs above head height, an antenna with a light on most roofs.
// Mixed with others, each keeps its own dress in its own district. Every block one of
// Bedrock's own states, and in Java one Java has.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zzu';
export const label = '2zzu. Steampunk, Santorini and Cyberpunk';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MATERIALS, MAT } = await import('../../engine/materials.js');
  const { STYLES, STYLE_NAMES } = await import('../../engine/styles.js');
  const { buildStructures } = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const { toJava } = await import('../../engine/java-blocks.js');
  const { loadJavaBlocks } = await import('../check-java-blocks.mjs');
  const blk = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block.replace('minecraft:', ''); };
  // (a building on a hill is lifted after it is built: where a thing it recorded is now)
  const lifted = (w, x, y, z, name) => { for (let d = 0; d <= 14; d++) for (const dd of [d, -d]) if (blk(w, x, y + dd, z) === name) return y + dd; return null; };
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const NEW = ['steampunk', 'santorini', 'cyberpunk'];
  check('styles: Steampunk, Santorini and Cyberpunk registered, offered in the page and in the Mix styles list',
    NEW.every((n) => STYLE_NAMES.includes(n) && new RegExp(`<option value="${n}">`).test(html) && new RegExp(`class="mixStyle" value="${n}"`).test(html)));

  const cities = {};
  for (const st of NEW) cities[st] = [[224, 7], [160, 12345]].map(([size, seed]) => generateCity({ ...DEFAULTS, size, seed, cityStyle: st }));
  const walk = (rs) => rs.every((r) => { const v = verifyAll(r.world, r.buildings); return v.ok === v.total && v.floorsReached === v.floorsChecked && !r.reach.unreached.length && r.stats.lighting.darkAfter === 0; });
  check('all three: every building walks through, every floor and door reached, nothing left dark', NEW.every((st) => walk(cities[st])));

  // ---- Steampunk
  {
    let roofs = 0, stacks = 0, houseFires = 0, houses = 0, pipes = 0, lowPipe = 0, fireBad = 0, copperWaxed = 0;
    for (const r of cities.steampunk) {
      const w = r.world;
      for (const b of r.buildings) {
        if (b.landmark || !b.steam) continue;
        if (b.style === 'house') { houses++; if (b.steam.fires.length) houseFires++; }
        else { roofs++; if (b.steam.chimneys.length) stacks++; }
        for (const [x, y, z] of b.steam.fires) { const yy = lifted(w, x, y, z, 'campfire'); if (yy === null || /air/.test(blk(w, x, yy - 1, z))) fireBad++; }
        pipes += b.steam.pipes;
      }
      w.forEach((x, y, z, id) => {
        const n = MATERIALS.def(id).block;
        if (n === 'minecraft:lightning_rod' && y < 1 + 3 && !/rod/.test(blk(w, x, y + 1, z))) lowPipe++;
        if (/waxed_.*copper|waxed_copper/.test(n) && /cut_copper|copper_block/.test(n)) copperWaxed++;
      });
    }
    check('Steampunk: a smoking chimney stack (a campfire on its top) on nearly every roof, and on the houses\' own chimneys', roofs > 10 && stacks >= roofs * 0.8 && (houses === 0 || houseFires >= houses * 0.5) && fireBad === 0,
      `${stacks}/${roofs} roofs, ${houseFires}/${houses} houses, ${fireBad} bad`);
    check('Steampunk: copper pipes down the side walls, none lower than head height; the copper left unwaxed', pipes > 10 && lowPipe === 0 && copperWaxed === 0, `${pipes} pipes, ${lowPipe} low, ${copperWaxed} waxed`);
  }

  // ---- Santorini
  {
    let houses = 0, flat = 0, white = 0, domes = 0, domeBad = 0, flowers = 0, lowFlower = 0, decay = 0, mids = 0;
    for (const r of cities.santorini) {
      const w = r.world;
      for (const b of r.buildings) {
        if (b.landmark) continue;
        if (b.style === 'house') {
          houses++;
          let stairs = 0; for (let x = b.x0 - 1; x <= b.x1 + 1; x++) for (let z = b.z0 - 1; z <= b.z1 + 1; z++) if (/stairs/.test(blk(w, x, b.roofY + 1, z)) || /stairs/.test(blk(w, x, b.roofY + 2, z))) stairs++;
          if (b.flatRoof && stairs <= 3) flat++;
        } else mids++;
        const t = b.rects[b.floors - 1], mx = Math.floor((t.x0 + t.x1) / 2), mz = Math.floor((t.z0 + t.z1) / 2);
        if (/white_concrete/.test(blk(w, t.x0 + 1, b.roofY, t.z0 + 1)) || /white_concrete/.test(blk(w, mx, b.roofY, mz))) white++;
        if (b.santorini && b.santorini.dome) {
          domes++;
          const d = b.santorini.dome, [cx, cz] = d.centre;
          const yy = lifted(w, cx, d.top, cz, 'lantern');
          if (yy === null || !/blue_concrete/.test(blk(w, cx, yy - 2, cz))) domeBad++;
        }
      }
      w.forEach((x, y, z, id) => {
        const d = MATERIALS.def(id);
        if (d.block !== 'minecraft:azalea_leaves_flowered') return;
        flowers++;
        if (y < 1 + 3) lowFlower++;
        const p = d.states.persistent_bit; if (!p || (p.value ?? p) !== 1) decay++;
      });
    }
    check('Santorini: every house\'s roof flat, the roofs whitewashed', houses > 5 && flat === houses && white >= (houses + mids) * 0.9, `${flat}/${houses} flat, ${white}/${houses + mids} white`);
    check('Santorini: blue domes with a lantern on many roofs', domes >= 8 && domeBad === 0, `${domes} domes, ${domeBad} bad`);
    check('Santorini: bougainvillea over the doorways, kept from decaying, never below head height', flowers > 50 && lowFlower === 0 && decay === 0, `${flowers}, ${lowFlower} low, ${decay} would decay`);
    const plain = generateCity({ ...DEFAULTS, size: 128, seed: 3, cityStyle: 'santorini' });
    const set = generateCity({ ...DEFAULTS, size: 128, seed: 3, cityStyle: 'santorini', hills: 0, maxFloors: 12 });
    check('Santorini: on hills and low by default; the sliders, set, have their way', plain.cfg.hills === 4 && plain.cfg.maxFloors === 5 && set.cfg.hills === 0 && set.cfg.maxFloors === 12);
  }

  // ---- Cyberpunk
  {
    let tall = 0, lit = 0, signs = 0, lowSign = 0, roofs = 0, antennas = 0, antBad = 0;
    for (const r of cities.cyberpunk) {
      const w = r.world;
      for (const b of r.buildings) {
        if (b.landmark || !b.neon) continue;
        if (b.style !== 'house' && b.floors >= 2) { tall++; if (b.neon.neon > 0) lit++; }
        if (b.style !== 'house') { roofs++; if (b.neon.antenna) { antennas++; const a = b.neon.antenna; if (lifted(w, a.at[0], a.top, a.at[1], 'end_rod') === null) antBad++; } }
        if (b.neon.sign) { signs++; if (b.neon.sign.y0 < b.groundY + 3) lowSign++; }
      }
    }
    check('Cyberpunk: neon round every other floor of every building of two floors and more', tall > 10 && lit === tall, `${lit}/${tall}`);
    check('Cyberpunk: blade signs, none lower than head height; an antenna with a light on most roofs', signs > 5 && lowSign === 0 && antennas >= roofs * 0.6 && antBad === 0, `${signs} signs (${lowSign} low), ${antennas}/${roofs} antennas`);
  }

  // ---- mixed with others
  {
    const list = ['modern', 'steampunk', 'santorini', 'cyberpunk', 'venetian'];
    const r = generateCity({ ...DEFAULTS, size: 256, seed: 21, cityStyle: 'modern', mixStyles: true, mixList: list });
    const v = verifyAll(r.world, r.buildings);
    const by = {};
    for (const b of r.buildings) {
      if (b.landmark) continue;
      const lot = r.plan.lots.find((l) => b.x0 >= l.x0 - 1 && b.x1 <= l.x1 + 1 && b.z0 >= l.z0 - 1 && b.z1 <= l.z1 + 1 && l.district);
      if (!lot) continue;
      const S = STYLES[lot.district], k = lot.district;
      by[k] = by[k] || { n: 0, dressed: 0, wrong: 0 };
      by[k].n++;
      if ((S.steam && b.steam) || (S.santorini && b.santorini) || (S.neon && b.neon) || !(S.steam || S.santorini || S.neon)) by[k].dressed++;
      if ((!S.steam && b.steam) || (!S.santorini && b.santorini) || (!S.neon && b.neon)) by[k].wrong++;
    }
    check('mixed: each of the three has buildings in its own districts, each in its own dress and no other', ['steampunk', 'santorini', 'cyberpunk'].every((k) => by[k] && by[k].n > 0 && by[k].dressed === by[k].n) && Object.values(by).every((q) => q.wrong === 0)
      && v.ok === v.total && r.stats.lighting.darkAfter === 0, JSON.stringify(by));
  }

  // ---- Bedrock states, Java blocks
  {
    const states = JSON.parse(readFileSync(join(ROOT, 'tools', 'bedrock-states.json'), 'utf8'))['1.21.60'];
    const java = loadJavaBlocks();
    const bad = new Set(), jbad = new Set();
    for (const st of NEW) for (const s of buildStructures(cities[st][1].world, {})) for (const p of decodeNbt(s.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
      const j = toJava(p.name, Object.fromEntries(Object.entries(p.states).map(([k, v]) => [k, { value: typeof v === 'object' ? v.value : v }])));
      const props = java.get(j.name);
      if (!props) jbad.add(j.name); else for (const [k, v] of Object.entries(j.props)) if (!props.has(k) || !props.get(k).has(String(v))) jbad.add(`${j.name}.${k}=${v}`);
    }
    check('every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
    check('in Java, every block of the three a block Java has, with its own states', jbad.size === 0, [...jbad].slice(0, 6).join(', '));
  }
  note(`styles: ${NEW.map((st) => `${st} ${cities[st].map((r) => r.buildings.length).join('/')} buildings`).join('; ')}`);
}
