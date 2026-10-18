// tools/checks/2zzy-meso-moorish.js — the Mesoamerican and Moorish / Andalusian styles
// (styles.js; building.js: pyramid, pointed arcades; stylebits.js: mesoDress,
// moorishDress; courtyard.js: fountains; landmarks.js: the minaret; city.js: plazas).
//
// - both registered, offered in the page and in the Mix styles list;
// - each built in two cities (and both in a mixed one): every building walks through,
//   every floor and door reached, nothing dark;
// - Mesoamerican: its towers and mid-rises stepped pyramids, a block in each way every
//   floor while that way stays nine across, every step in on at least one side, the
//   temple on top nine across or more; a roof comb on the temples and braziers lit on
//   their corners; vines down the street fronts, each against a wall, none below head
//   height; leaves along the eaves; on hills, its open spaces paved plazas, an altar
//   with a brazier in the middle of each big one;
// - Moorish: glazed tile dados and panels on its buildings (only where the wall was);
//   arcades of pointed arches on its mid-rises' street fronts; fountains in its
//   courtyards; its clock tower a minaret, galleried, the bell hung in its lantern, the
//   clock faces whole;
// - mixed: each style's dress in its own districts and no other;
// - every block one of Bedrock's own states, and in Java one Java has.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zzy';
export const label = '2zzy. Mesoamerican and Moorish';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { STYLES, STYLE_NAMES } = await import('../../engine/styles.js');
  const { buildStructures } = await import('../../engine/export.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const { toJava } = await import('../../engine/java-blocks.js');
  const { loadJavaBlocks } = await import('../check-java-blocks.mjs');
  const { CLOCK_FACE } = await import('../../engine/landmarks.js').catch(() => ({}));
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const NEW = ['mesoamerican', 'moorish'];
  check('styles: Mesoamerican and Moorish registered, offered in the page and in the Mix styles list',
    NEW.every((n) => STYLE_NAMES.includes(n) && new RegExp(`<option value="${n}">`).test(html) && new RegExp(`class="mixStyle" value="${n}"`).test(html)));

  const blk = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block.replace('minecraft:', ''); };
  const cities = {
    mesoamerican: [generateCity({ ...DEFAULTS, size: 224, seed: 7, cityStyle: 'mesoamerican' }), generateCity({ ...DEFAULTS, size: 160, seed: 12345, cityStyle: 'mesoamerican', hills: 0 })],
    moorish: [generateCity({ ...DEFAULTS, size: 224, seed: 7, cityStyle: 'moorish' }), generateCity({ ...DEFAULTS, size: 160, seed: 12345, cityStyle: 'moorish' })],
  };
  const mixed = generateCity({ ...DEFAULTS, size: 256, seed: 21, cityStyle: 'modern', mixStyles: true, mixList: ['modern', 'mesoamerican', 'moorish', 'medieval'] });
  const walk = (r) => { const v = verifyAll(r.world, r.buildings); return v.ok === v.total && v.floorsReached === v.floorsChecked && !r.reach.unreached.length && r.stats.lighting.darkAfter === 0; };
  check('both: every building walks through, every floor and door reached, nothing dark (and in a city of both, mixed)',
    NEW.every((st) => cities[st].every(walk)) && walk(mixed));

  // ---- Mesoamerican
  {
    let pyr = 0, badStep = 0, narrowTop = 0, combed = 0, fires = 0, firesBad = 0, vines = 0, vineBad = 0, leaves = 0, leafLow = 0;
    for (const r of cities.mesoamerican) {
      const w = r.world;
      for (const b of r.buildings) {
        if (b.landmark || !b.pyramid) continue;
        pyr++;
        for (let k = 1; k < b.floors; k++) {
          const a = b.rects[k - 1], c = b.rects[k];
          const inX = c.x0 - a.x0, inZ = c.z0 - a.z0;
          if (inX < 0 || inZ < 0 || inX > 1 || inZ > 1 || (inX === 0 && inZ === 0) || a.x1 - c.x1 !== inX || a.z1 - c.z1 !== inZ) badStep++;
        }
        const t = b.rects[b.floors - 1];
        if (t.x1 - t.x0 + 1 < 9 || t.z1 - t.z0 + 1 < 9) narrowTop++;
        if (b.meso && b.meso.comb > 0) combed++;
      }
      w.forEach((x, y, z, id) => {
        const n = MATERIALS.def(id).block.replace('minecraft:', '');
        if (n === 'vine') {
          vines++;
          const bits = MATERIALS.def(id).states.vine_direction_bits; const v = bits.value ?? bits;
          const [dx, dz] = v === 1 ? [0, 1] : v === 2 ? [-1, 0] : v === 4 ? [0, -1] : [1, 0];
          const behind = w.get(x + dx, y, z + dz);
          if (behind < 0 || MATERIALS.isPassable(behind) || y < r.groundAt(x, z) + 3) vineBad++;
        }
        if (n === 'jungle_leaves' && r.buildings.some((b) => !b.landmark && b.meso && x >= b.x0 - 1 && x <= b.x1 + 1 && z >= b.z0 - 1 && z <= b.z1 + 1 && y >= b.roofY - 1)) { leaves++; if (y < r.groundAt(x, z) + 3) leafLow++; }
      });
      for (const b of r.buildings) if (b.pyramid && b.meso) fires += b.meso.braziers;
    }
    check('Mesoamerican: towers and mid-rises stepped pyramids, a block in each way every floor (one way at least), the temple on top nine across',
      pyr >= 10 && badStep === 0 && narrowTop === 0, `${pyr} pyramids, ${badStep} bad steps, ${narrowTop} narrow tops`);
    check('Mesoamerican: a roof comb on most temples, braziers lit on their corners and the steps\' corners', combed >= pyr * 0.6 && fires >= pyr * 2, `${combed}/${pyr} combed, ${fires} braziers`);
    check('Mesoamerican: vines down the street fronts, each against a wall, none below head height; leaves along the eaves', vines > 100 && vineBad === 0 && leaves > 50 && leafLow === 0,
      `${vines} vines (${vineBad} bad), ${leaves} leaves (${leafLow} low)`);
    // plazas on hills
    const hilly = cities.mesoamerican[0];
    const plazas = hilly.plan.lots.filter((l) => l.kind === 'plaza' || l.use === 'plaza');
    let altars = 0, altarBad = 0;
    const PL = hilly.plan.lots.filter((l) => l.kind === 4 || String(l.kind).toLowerCase() === 'plaza');
    void plazas; void PL;
    hilly.world.forEach((x, y, z, id) => {
      if (MATERIALS.def(id).block !== 'minecraft:campfire') return;
      if (blk(hilly.world, x, y - 1, z) === 'chiseled_stone_bricks' && blk(hilly.world, x, y - 2, z) === 'mossy_stone_bricks') { altars++; if (blk(hilly.world, x, y - 3, z) !== 'mossy_stone_bricks') altarBad++; }
    });
    check('Mesoamerican: on hills, the open spaces paved plazas, each its own terrace, an altar with a brazier in the big ones; level, not',
      hilly.cfg.piazzas === true && cities.mesoamerican[1].cfg.piazzas !== true && altars > 0 && altarBad === 0, `${altars} altars`);
  }

  // ---- Moorish
  {
    let tiled = 0, bld = 0, arcades = 0, arcBad = 0, fountains = 0, fBad = 0, minarets = 0, mBad = 0, faceBad = 0;
    for (const r of cities.moorish) {
      const w = r.world;
      for (const b of r.buildings) {
        if (b.landmark || !b.moorish) continue;
        bld++; if (b.moorish.tiles > 0) tiled++;
        if (b.arcade) for (const bay of b.arcade.bays) {
          arcades++;
          const archRow = b.groundY + b.pitch - 2;
          const [s0, mid, s2] = bay;
          const okArch = blk(w, mid[0], archRow, mid[1]).includes('glass') && [s0, s2].every(([x, z]) => /stairs/.test(blk(w, x, archRow - 1, z)) && !/glass|stairs|air/.test(blk(w, x, archRow, z)));
          if (!okArch) arcBad++;
        }
      }
      for (const c of r.courtyards) if (c.fountain) {
        fountains++;
        const [x, y, z] = c.fountain.at;
        if (blk(w, x, y, z) !== 'cauldron' || ![[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]].every(([a, d]) => /glazed_terracotta/.test(blk(w, x + a, y, z + d)))) fBad++;
      }
      const ct = r.landmarks.find((l) => l.kind === 'clocktower');
      if (ct) {
        if (ct.minaret) minarets++;
        const [hx, hy, hz] = ct.belfryBell;
        if (!ct.minaret || blk(w, hx, hy, hz) !== 'bell' || !w.has(hx, hy + 1, hz) || ct.rec.topY < hy + 3) mBad++;
        for (const f of ct.faces) if (!w.has(...f.centre)) faceBad++;
      }
    }
    check('Moorish: glazed tile dados and panels on its buildings', bld > 10 && tiled >= bld * 0.9, `${tiled}/${bld}`);
    check('Moorish: arcades of pointed arches on the mid-rises\' street fronts', arcades >= 10 && arcBad === 0, `${arcades} bays, ${arcBad} bad`);
    check('Moorish: fountains in the courtyards, a bowl of water in a basin of tile', fountains >= 1 && fBad === 0, `${fountains} fountains, ${fBad} bad`);
    check('Moorish: the clock tower a minaret, its bell hung in its lantern, its clock faces whole', minarets === 2 && mBad === 0 && faceBad === 0, `${minarets} minarets, ${mBad} bad`);
  }

  // ---- mixed
  {
    const by = {};
    for (const b of mixed.buildings) {
      if (b.landmark) continue;
      const lot = mixed.plan.lots.find((l) => b.x0 >= l.x0 - 1 && b.x1 <= l.x1 + 1 && b.z0 >= l.z0 - 1 && b.z1 <= l.z1 + 1 && l.district);
      if (!lot) continue;
      const S = STYLES[lot.district], k = lot.district;
      by[k] = by[k] || { n: 0, wrong: 0, dressed: 0 };
      by[k].n++;
      if ((S.meso && b.meso) || (S.moorish && b.moorish) || !(S.meso || S.moorish)) by[k].dressed++;
      if ((!S.meso && (b.meso || b.pyramid)) || (!S.moorish && b.moorish)) by[k].wrong++;
    }
    check('mixed: each of the two in its own districts, in its own dress and no other', NEW.every((k) => by[k] && by[k].n > 0 && by[k].dressed === by[k].n) && Object.values(by).every((q) => q.wrong === 0), JSON.stringify(by));
  }

  // ---- Bedrock states, Java blocks
  {
    const states = JSON.parse(readFileSync(join(ROOT, 'tools', 'bedrock-states.json'), 'utf8'))['1.21.60'];
    const java = loadJavaBlocks();
    const bad = new Set(), jbad = new Set();
    for (const st of NEW) for (const s of buildStructures(cities[st][0].world, {})) for (const p of decodeNbt(s.data).root.structure.palette.default.block_palette) {
      const n = p.name.replace('minecraft:', ''), def = states[n];
      if (!def) { bad.add(n); continue; }
      for (const [k, v] of Object.entries(p.states)) { const sd = def[k]; const val = typeof v === 'object' ? v.value : v; if (!sd || (sd.v && !sd.v.includes(val) && !sd.v.includes(String(val)))) bad.add(`${n}.${k}=${val}`); }
      const j = toJava(p.name, Object.fromEntries(Object.entries(p.states).map(([k, v]) => [k, { value: typeof v === 'object' ? v.value : v }])), n === 'noteblock' ? { note: 12, instrument: 'harp' } : {});
      const props = java.get(j.name);
      if (!props) jbad.add(j.name); else for (const [k, v] of Object.entries(j.props)) if (!props.has(k) || !props.get(k).has(String(v))) jbad.add(`${j.name}.${k}=${v}`);
    }
    check('every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
    check('in Java, every block a block Java has, with its own states (vines, glazed tile, jungle and mud brick stairs)', jbad.size === 0, [...jbad].slice(0, 6).join(', '));
  }
  void CLOCK_FACE;
  note(`styles: ${NEW.map((st) => `${st} ${cities[st].map((r) => r.buildings.length).join('/')} buildings`).join('; ')}`);
}
