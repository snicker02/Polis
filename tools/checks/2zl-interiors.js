// tools/checks/2zl-interiors.js — interiors that follow the building.
//
// Houses: a lit hearth under the chimney with a brick jamb and brick over it,
// and a chimney breast up through the floors above. Kitchens: an unbroken
// counter along a wall (stove, worktop, sink, worktop). Rooms with space: a
// dining table with a chair at each end facing it. Upper floors: a banister
// along the stairwell's edge, never in front of a step. Shops: fitted out for
// what their sign says (a bakery bakes, a smithy has its anvil). And none of it
// costs a floor or a room: every building still walks through.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zl';
export const label = '2zl. interiors';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MATERIALS, MAT } = await import('../../engine/materials.js');
  const { toJava } = await import('../../engine/java-blocks.js');
  const blk = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block.replace('minecraft:', ''); };

  // the new blocks are Bedrock's own and convert to Java
  const states = JSON.parse(readFileSync(join(ROOT, 'tools', 'bedrock-states.json'), 'utf8'))['1.21.60'];
  const newOnes = [MAT.ANVIL, MAT.CAKE, MAT.HEARTH];
  check('blocks: anvil, cake and hearth are real Bedrock blocks with real states, and convert to Java',
    newOnes.every((id) => { const d = MATERIALS.def(id), st = states[d.block.replace('minecraft:', '')]; return st && Object.keys(d.states || {}).every((k) => k in st); }) &&
    newOnes.every((id) => { const d = MATERIALS.def(id); const j = toJava(d.block, d.states); return /anvil|cake|campfire/.test(j.name); }));

  let ok = true, houses = 0, fires = 0, fireBad = 0, breastBad = 0, counters = 0, counterBad = 0, tables = 0, tableBad = 0;
  let rails = 0, railBad = 0, shops = 0, shopHit = 0; const missed = {};
  const SIGNATURE = {
    'Bakery': /cake|hay_block|smoker/, 'Butcher': /smoker/, 'Grocer': /barrel|composter/, 'Florist': /grass_block|flower|tulip|azalea|dandelion|poppy|allium|orchid|bluet|daisy|cornflower|lily/,
    'Tailor': /loom/, 'Bookshop': /bookshelf|lectern/, 'Apothecary': /brewing_stand|cauldron/, 'Cobbler': /crafting_table|loom/,
    'Tea House': /slab/, 'Cafe': /slab/, 'Barber': /slab|cauldron/, 'Toy Shop': /chest/, 'Fishmonger': /barrel|smoker|cauldron/,
    'Hardware': /grindstone|stonecutter|anvil/, 'Sweet Shop': /cake/, 'Cheesemonger': /barrel/, 'Smithy': /anvil|blast_furnace|smithing_table/,
  };
  for (const [st, seed] of [['modern', 7], ['medieval', 31], ['village', 5], ['venetian', 12345], ['modern', 99]]) {
    const r = generateCity({ ...DEFAULTS, seed, size: 192, cityStyle: st });
    const w = r.world;
    const v = verifyAll(w, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked || r.reach.unreached.length) ok = false;
    for (const b of r.buildings) {
      const f = b.furniture || {};
      // ---- the hearth
      if (b.style === 'house' && !b.landmark) {
        houses++;
        if (f.fireplace) {
          fires++;
          const [x, y, z] = f.fireplace.at, [jx, jy, jz] = f.fireplace.jamb;
          if (!/campfire/.test(blk(w, x, y, z)) || !/brick_block/.test(blk(w, jx, jy, jz)) || !/brick_block/.test(blk(w, jx, jy + 1, jz)) || !/brick_block/.test(blk(w, x, y + 1, z))) fireBad++;
          // the breast: brick in the chimney's corner on the floor above
          if (b.floors >= 2) {
            const sy = b.floorYs[1];
            let brick = 0;
            for (let yy = sy + 1; yy <= sy + b.pitch - 1; yy++) if (/brick_block/.test(blk(w, x, yy, z))) brick++;
            if (!brick) breastBad++;
          }
        }
      }
      // ---- rooms: counters, tables, shops
      for (const rm of f.rooms || []) {
        const sy = b.floorYs[rm.floor], y = sy + 1;
        const cells = [];
        for (let zz = rm.z0; zz <= rm.z1; zz++) for (let xx = rm.x0; xx <= rm.x1; xx++) cells.push([xx, zz]);
        if (rm.shopName) {
          shops++;
          const sig = SIGNATURE[rm.shopName];
          if (sig && cells.some(([xx, zz]) => sig.test(blk(w, xx, y, zz)) || sig.test(blk(w, xx, y + 1, zz)))) shopHit++;
          else missed[rm.shopName] = (missed[rm.shopName] || 0) + 1;
        }
      }
      counters += f.counters || 0;
      tables += f.tables || 0;
      rails += f.banisters || 0;
    }
    // counters: a stove and a sink in the same room, the sink beside a worktop
    for (const b of r.buildings) {
      const f = b.furniture || {};
      if (!f.counters) continue;
      let found = 0;
      for (const rm of f.rooms || []) {
        if (rm.type !== 'kitchen' && rm.type !== 'apartment') continue;
        const y = b.floorYs[rm.floor] + 1;
        let stove = false, sink = false;
        for (let zz = rm.z0; zz <= rm.z1; zz++) for (let xx = rm.x0; xx <= rm.x1; xx++) {
          const n = blk(w, xx, y, zz);
          if (/smoker/.test(n)) stove = true;
          if (/cauldron/.test(n) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => /slab/.test(blk(w, xx + a, y, zz + c)))) sink = true;
        }
        if (stove && sink) found++;
      }
      if (found < f.counters) counterBad++;
    }
    // tables (one or two cells) with a chair at each end, the two chairs facing
    // opposite ways (each with its back to the room, facing the table)
    w.forEach((x, y, z, id) => {
      if (id !== MAT.DESK) return;
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        for (const len of [1, 2]) {
          if (len === 2 && w.get(x + dx, y, z + dz) !== MAT.DESK) continue;
          if (len === 1 && w.get(x + dx, y, z + dz) === MAT.DESK) continue;
          if (w.get(x - dx, y, z - dz) === MAT.DESK) continue;               // not the table's first cell
          const a = blk(w, x - dx, y, z - dz), c = blk(w, x + len * dx, y, z + len * dz);
          if (!/stairs/.test(a) || !/stairs/.test(c)) continue;
          const da = MATERIALS.def(w.get(x - dx, y, z - dz)), dc = MATERIALS.def(w.get(x + len * dx, y, z + len * dz));
          if (JSON.stringify(da.states) === JSON.stringify(dc.states)) tableBad++;
        }
      }
    });
    // banisters: never in front of a step (a step level with the floor, or the first step up)
    for (const b of r.buildings) {
      if (!b.furniture || !b.furniture.banisters || !b.core) continue;
      for (let k = 1; k < b.floors; k++) {
        const sy = b.floorYs[k], y = sy + 1;
        for (let z = b.core.z0 - 1; z <= b.core.z1 + 1; z++) for (let x = b.core.x0 - 1; x <= b.core.x1 + 1; x++) {
          if (!/fence/.test(blk(w, x, y, z))) continue;
          if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => /_stairs$/.test(blk(w, x + a, sy, z + c)) || /_stairs$/.test(blk(w, x + a, y, z + c)))) railBad++;
        }
      }
    }
  }
  check('interiors: every building still walks through, every floor and door reached', ok);
  check('hearth: most houses have a lit fire under the chimney, a brick jamb beside it and brick over it', fires >= houses * 0.5 && fireBad === 0, `${fires}/${houses} houses, ${fireBad} bad`);
  check('hearth: a chimney breast rises through the floor above', breastBad === 0, `${breastBad} without`);
  check('kitchens: an unbroken counter along a wall, a stove and a sink beside a worktop', counters > 50 && counterBad === 0, `${counters} counters, ${counterBad} incomplete`);
  check('dining tables: a table (one or two cells), a chair drawn up at each end facing it', tables > 5 && tableBad === 0, `${tables} tables, ${tableBad} bad`);
  check('banisters: a rail along the stairwell on upper floors, never in front of a step', rails > 500 && railBad === 0, `${rails} rail cells, ${railBad} in front of a step`);
  check('shops: fitted out for what their sign says', shops > 20 && shopHit >= shops * 0.9, `${shopHit}/${shops} match${Object.keys(missed).length ? ' (missed: ' + JSON.stringify(missed) + ')' : ''}`);
  note(`interiors: ${fires} hearths in ${houses} houses, ${counters} counters, ${tables} tables, ${rails} banister cells, ${shopHit}/${shops} shops true to their signs`);
}
