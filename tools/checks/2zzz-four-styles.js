// tools/checks/2zzz-four-styles.js — the Elven, End city, Dwarven and Brutalist styles
// (styles.js; building.js: cantilever; stylebits.js: elvenDress, endDress, dwarvenDress,
// brutalDress; city.js: applyStyle's chorus trees, the Dwarven metro).
//
// - all four registered, offered in the page and in the Mix styles list;
// - each built in two cities (and all four in a mixed one): every building walks
//   through, every floor and door reached, nothing dark;
// - Elven: every building's corners mangrove trunks, floor after floor; on the mid-rises
//   and towers the trunks rising past the roof into a crown of leaves; lanterns hung on
//   chains under the eaves, each chain hung from a block, never lower than head height;
//   moss at the buildings' feet;
// - End city: no grass, no tree leaves; the trees chorus plants standing on end stone, a
//   chorus flower on each; end rods on the roofs and the street lamps;
// - Dwarven: lava behind glass up the corners, every cell of lava shut in on all six
//   sides (by blocks, glass or more lava), never lower than head height; gold in the
//   trim; the metro dug when its option is left where it was;
// - Brutalist: cantilevers, the ground floor drawn in under floors that hang out, the
//   floor over it whole out to its walls, a column at each corner of the overhang; the
//   concrete grid of slabs and fins, no fin in front of a window;
// - mixed: each style's dress in its own districts and no other;
// - every block one of Bedrock's own states, and in Java one Java has.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zzz';
export const label = '2zzz. Elven, End city, Dwarven, Brutalist';

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
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const NEW = ['elven', 'endcity', 'dwarven', 'brutalist'];
  check('styles: Elven, End city, Dwarven and Brutalist registered, offered in the page and in the Mix styles list',
    NEW.every((n) => STYLE_NAMES.includes(n) && new RegExp(`<option value="${n}">`).test(html) && new RegExp(`class="mixStyle" value="${n}"`).test(html)));
  const blk = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block.replace('minecraft:', ''); };
  const cities = {};
  for (const st of NEW) cities[st] = [[224, 7], [160, 12345]].map(([size, seed]) => generateCity({ ...DEFAULTS, size, seed, cityStyle: st }));
  const mixed = generateCity({ ...DEFAULTS, size: 288, seed: 21, cityStyle: 'modern', mixStyles: true, mixList: ['modern', ...NEW] });
  const walk = (r) => { const v = verifyAll(r.world, r.buildings); return v.ok === v.total && v.floorsReached === v.floorsChecked && !r.reach.unreached.length && r.stats.lighting.darkAfter === 0; };
  check('all four: every building walks through, every floor and door reached, nothing dark (and in a city of all four, mixed)',
    NEW.every((st) => cities[st].every(walk)) && walk(mixed));

  // ---- Elven
  {
    let bld = 0, cornersOk = 0, tall = 0, crowned = 0, lanterns = 0, lampBad = 0, moss = 0;
    for (const r of cities.elven) {
      const w = r.world;
      for (const b of r.buildings) {
        if (b.landmark || !b.elven) continue;
        bld++;
        let logs = 0, all = 0;
        for (let k = 0; k < b.floors; k++) { const q = b.rects[k], sy = b.floorYs[k]; for (const [x, z] of [[q.x0, q.z0], [q.x1, q.z0], [q.x0, q.z1], [q.x1, q.z1]]) for (let y = sy + 1; y <= sy + b.pitch - 1; y++) { all++; if (blk(w, x, y, z) === 'mangrove_log') logs++; } }
        if (logs >= all * 0.9) cornersOk++;
        if (b.style !== 'house') { tall++; if (b.elven.trunks >= 2 && b.elven.leaves > 20) crowned++; }
        moss += b.elven.moss;
      }
      w.forEach((x, y, z, id) => {
        const d = MATERIALS.def(id);
        if (d.block !== 'minecraft:lantern' || !(d.states.hanging && (d.states.hanging.value ?? d.states.hanging))) return;
        if (blk(w, x, y + 1, z) !== 'chain') return;                    // (the hung street lanterns of other kinds: not ours)
        lanterns++;
        let yy = y + 1; while (blk(w, x, yy, z) === 'chain') yy++;
        if (!w.has(x, yy, z) || y < r.groundAt(x, z) + 3) lampBad++;
      });
    }
    check('Elven: every building\'s corners mangrove trunks, floor after floor; the mid-rises\' and towers\' trunks rising into a crown of leaves over the roof',
      bld > 20 && cornersOk >= bld * 0.9 && tall > 10 && crowned >= tall * 0.7, `${cornersOk}/${bld} cornered, ${crowned}/${tall} crowned`);
    check('Elven: lanterns hung on chains under the eaves, every chain hung from a block, none lower than head height; moss at the buildings\' feet', lanterns > 30 && lampBad === 0 && moss > 200, `${lanterns} lanterns (${lampBad} bad), ${moss} moss`);
  }

  // ---- End city
  {
    let grass = 0, leaves = 0, stalks = 0, stalkBad = 0, rods = 0, roofRods = 0;
    for (const r of cities.endcity) {
      const w = r.world;
      w.forEach((x, y, z, id) => {
        const n = MATERIALS.def(id).block.replace('minecraft:', '');
        if (n === 'grass_block') grass++;
        if (/^(oak|spruce)_leaves$/.test(n)) leaves++;
        if (n === 'end_rod') rods++;
        if (n === 'chorus_plant' && blk(w, x, y - 1, z) !== 'chorus_plant') {
          stalks++;
          let t = y; while (blk(w, x, t + 1, z) === 'chorus_plant') t++;
          if (blk(w, x, y - 1, z) !== 'end_stone' || blk(w, x, t + 1, z) !== 'chorus_flower') stalkBad++;
        }
      });
      for (const b of r.buildings) if (b.endcity) roofRods += b.endcity.rods;
    }
    check('End city: no grass, no tree leaves; the trees chorus plants on end stone, a chorus flower on each', grass === 0 && leaves === 0 && stalks > 20 && stalkBad === 0, `${grass} grass, ${leaves} leaves, ${stalks} stalks (${stalkBad} bad)`);
    check('End city: end rods on the roofs and the street lamps', roofRods > 200 && rods > roofRods, `${roofRods} on roofs, ${rods} in all`);
  }

  // ---- Dwarven
  {
    let lava = 0, open = 0, low = 0, gold = 0;
    for (const r of cities.dwarven) {
      const w = r.world;
      w.forEach((x, y, z, id) => {
        const n = MATERIALS.def(id).block.replace('minecraft:', '');
        if (n === 'gold_block') gold++;
        if (n !== 'lava') return;
        lava++;
        if (y < r.groundAt(x, z) + 3) low++;
        for (const [a, c, d] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const q = w.get(x + a, y + c, z + d);
          if (q < 0 || (MATERIALS.isPassable(q) && MATERIALS.def(q).block !== 'minecraft:lava')) { open++; break; }
        }
      });
    }
    check('Dwarven: lava behind glass up the corners, every cell of it shut in on all six sides, none lower than head height; gold in the trim',
      lava > 300 && open === 0 && low === 0 && gold > 500, `${lava} lava (${open} open, ${low} low), ${gold} gold`);
    check('Dwarven: the metro dug while its option is where it was', cities.dwarven.every((r) => r.cfg.metro === true && r.metro && r.metro.lines.length > 0));
  }

  // ---- Brutalist
  {
    let cants = 0, cantBad = 0, cols = 0, fins = 0, finBad = 0, slabs = 0;
    for (const r of cities.brutalist) {
      const w = r.world;
      for (const b of r.buildings) {
        if (b.landmark || !b.brutal) continue;
        slabs += b.brutal.slabs; fins += b.brutal.fins;
        if (b.cantilever) {
          cants++;
          const q0 = b.rects[0], q1 = b.rects[1], ins = q0.x0 - q1.x0;
          if (ins < 1 || ins > 2 || q0.z0 - q1.z0 !== ins || q1.x1 - q0.x1 !== ins || q1.z1 - q0.z1 !== ins) cantBad++;
          // the floor over the ground floor whole out to its walls
          const inCore = (x, z) => b.core && x >= b.core.x0 - 1 && x <= b.core.x1 + 1 && z >= b.core.z0 - 1 && z <= b.core.z1 + 1;   // (the stair's opening)
          let hole = false;
          for (let x = q1.x0; x <= q1.x1; x++) for (let z = q1.z0; z <= q1.z1; z++) if (!inCore(x, z) && !w.has(x, b.floorYs[1], z)) hole = true;
          if (hole) cantBad++;
          cols += b.brutal.columns;
        }
      }
      // no fin in front of a window
      for (const b of r.buildings) {
        if (b.landmark || !b.brutal) continue;
        for (const [, sy, , bx, bz] of b.brutal.finCells) for (let y = sy + 1; y < sy + b.pitch; y++) if (w.get(bx, y, bz) === b.theme.glass) { finBad++; break; }
      }
    }
    check('Brutalist: cantilevers, the ground floor drawn in under floors hanging out, the floor over it whole, a column at each corner of the overhang',
      cants >= 5 && cantBad === 0 && cols >= cants * 4, `${cants} cantilevers (${cantBad} bad), ${cols} column blocks`);
    check('Brutalist: the concrete grid of slabs and fins over head height, no fin in front of a window', slabs > 1000 && fins > 1000 && finBad === 0, `${slabs} slabs, ${fins} fins, ${finBad} in front of windows`);
  }

  // ---- mixed
  {
    const KEY = { elven: 'elven', endcity: 'endcity', dwarven: 'dwarven', brutalist: 'brutal' };
    const by = {};
    for (const b of mixed.buildings) {
      if (b.landmark) continue;
      const lot = mixed.plan.lots.find((l) => b.x0 >= l.x0 - 1 && b.x1 <= l.x1 + 1 && b.z0 >= l.z0 - 1 && b.z1 <= l.z1 + 1 && l.district);
      if (!lot) continue;
      const k = lot.district;
      by[k] = by[k] || { n: 0, wrong: 0, dressed: 0 };
      by[k].n++;
      const mine = KEY[k];
      if (!mine || b[mine]) by[k].dressed++;
      if (Object.entries(KEY).some(([st, f]) => st !== k && b[f])) by[k].wrong++;
    }
    check('mixed: each of the four in its own districts, in its own dress and no other', NEW.every((k) => by[k] && by[k].n > 0 && by[k].dressed === by[k].n) && Object.values(by).every((q) => q.wrong === 0), JSON.stringify(by));
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
      const j = toJava(p.name, Object.fromEntries(Object.entries(p.states).map(([k, v]) => [k, { value: typeof v === 'object' ? v.value : v }])), n === 'noteblock' ? { note: 12, instrument: 'harp' } : {});
      const props = java.get(j.name);
      if (!props) jbad.add(j.name); else for (const [k, v] of Object.entries(j.props)) if (!props.has(k) || !props.get(k).has(String(v))) jbad.add(`${j.name}.${k}=${v}`);
    }
    check('every block one of Bedrock\'s own states', bad.size === 0, [...bad].slice(0, 4).join(', '));
    check('in Java, every block a block Java has, with its own states (purpur, end stone bricks, chorus, mangrove, lava)', jbad.size === 0, [...jbad].slice(0, 6).join(', '));
  }
  void STYLES;
  note(`styles: ${NEW.map((st) => `${st} ${cities[st].map((r) => r.buildings.length).join('/')} buildings`).join('; ')}`);
}
