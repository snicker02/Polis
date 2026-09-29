// tools/checks/2zm-glass.js — the Glass city.
//
// Walls of stained glass (a colour for each kind of building), glass floors to
// see through, clear windows framed in quartz, glass streets, quartz pavements,
// trees of quartz and green glass, glass-pane lamp posts under sea lanterns.
// Stairs only and no paintings: nothing that needs a solid wall to hang on.
// Every building still walks through.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zm';
export const label = '2zm. Glass city';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MATERIALS, MAT } = await import('../../engine/materials.js');
  const { STYLES, STYLE_NAMES } = await import('../../engine/styles.js');
  const blk = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block.replace('minecraft:', ''); };
  const states = JSON.parse(readFileSync(join(ROOT, 'tools', 'bedrock-states.json'), 'utf8'))['1.21.60'];

  check('style: Glass is registered and offered in the page', STYLE_NAMES.includes('glass') && /value="glass"/.test(readFileSync(join(ROOT, 'index.html'), 'utf8')));
  const sg = ['SG_LIGHT_BLUE', 'SG_CYAN', 'SG_MAGENTA', 'SG_PINK', 'SG_LIME', 'SG_ORANGE', 'SG_LIGHT_GRAY', 'SG_GRAY', 'SG_WHITE'];
  check('blocks: every stained glass colour is a real Bedrock block, and see-through',
    sg.every((k) => MAT[k] !== undefined && states[MATERIALS.def(MAT[k]).block.replace('minecraft:', '')] && MATERIALS.def(MAT[k]).transparent));
  // every theme's walls and floors are glass
  const themes = Object.values(STYLES.glass.themes).flat();
  check('themes: every building\'s walls and floors are glass, its trim quartz',
    themes.every((t) => /glass/.test(MATERIALS.def(t.wall).block) && /glass/.test(MATERIALS.def(t.floor).block) && /quartz/.test(MATERIALS.def(t.trim).block)));

  let ok = true, wall = 0, glassWall = 0, floors = 0, glassFloors = 0, paintings = 0, ladders = 0, colours = new Set();
  let leaves = 0, glassLeaves = 0, organic = 0, lampPosts = 0, streets = 0, glassStreets = 0;
  for (const [seed, size] of [[7, 192], [3, 224]]) {
    const r = generateCity({ ...DEFAULTS, seed, size, cityStyle: 'glass' });
    const w = r.world;
    const v = verifyAll(w, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked || r.reach.unreached.length) ok = false;
    paintings += r.spawns.filter((s) => s.type === 'painting').length;
    for (const b of r.buildings) {
      if (b.landmark) continue;
      colours.add(blk(w, b.rects[0].x0 + 1, b.groundY + 2, b.rects[0].z0));
      const r0 = b.rects[0], y = b.groundY + 2;
      for (let x = r0.x0; x <= r0.x1; x++) for (const z of [r0.z0, r0.z1]) {
        const n = blk(w, x, y, z); if (n === 'air') continue;
        wall++; if (/glass/.test(n)) glassWall++;
      }
      // the floor of each upper storey, in the middle of the building
      for (let k = 1; k < b.floors; k++) {
        const rk = b.rects[k], sy = b.floorYs[k];
        const n = blk(w, Math.floor((rk.x0 + rk.x1) / 2) + 1, sy, rk.z0 + 1);
        floors++; if (/glass/.test(n)) glassFloors++;
      }
    }
    w.forEach((x, y, z, id) => {
      const n = MATERIALS.def(id).block;
      if (/ladder/.test(n)) ladders++;
      if (/_leaves$/.test(n)) organic++;
    });
    // trees: canopies of glass on quartz trunks; streets of glass; lamp posts of panes
    for (const l of r.plan.lots) {
      if (l.kind !== 4) continue;                     // parks
      for (let z = l.z0; z <= l.z1; z++) for (let x = l.x0; x <= l.x1; x++) for (let y = 3; y < 12; y++) {
        const n = blk(w, x, y, z);
        if (/lime_stained_glass|green_stained_glass/.test(n) && /quartz|stained_glass/.test(blk(w, x, y - 1, z))) glassLeaves++;
      }
    }
    const { W, D, use } = r.plan;
    for (let z = 0; z < D; z += 3) for (let x = 0; x < W; x += 3) {
      if (use[z * W + x] !== 1) continue;             // road
      streets++; if (/stained_glass/.test(blk(w, x, 1, z))) glassStreets++;
    }
    w.forEach((x, y, z, id) => { if (/glass_pane/.test(MATERIALS.def(id).block) && /sea_lantern/.test(blk(w, x, y + 1, z))) lampPosts++; });
  }
  check('glass city: every building walks through, every floor and door reached', ok);
  check('walls: mostly glass at street height (the rest quartz trim and doors)', glassWall >= wall * 0.6, `${glassWall}/${wall}`);
  check('floors: glass, to see through the whole building', floors > 20 && glassFloors >= floors * 0.9, `${glassFloors}/${floors}`);
  check('a rainbow: buildings in many colours of glass', colours.size >= 6, `${colours.size} colours`);
  check('nothing that needs a solid wall: no paintings, no ladders', paintings === 0 && ladders === 0, `${paintings} paintings, ${ladders} ladders`);
  check('trees of quartz and green glass: no leaves anywhere', organic === 0 && glassLeaves > 0, `${glassLeaves} glass leaves, ${organic} real leaves`);
  check('streets of glass, lamp posts of glass panes under sea lanterns', glassStreets >= streets * 0.8 && lampPosts > 10, `${glassStreets}/${streets} glass, ${lampPosts} lamp posts`);
  note(`glass: ${colours.size} wall colours, ${(100 * glassWall / wall).toFixed(0)}% glass walls, ${lampPosts} lamp posts`);
}
