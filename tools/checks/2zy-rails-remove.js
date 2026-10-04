// tools/checks/2zy-rails-remove.js — rails set again, and taking a city away.
//
// The game reshapes a rail to the rails beside it as it goes in, and a city goes
// in a tile at a time: a curve at a tile's edge, its neighbour not yet in, turned
// itself straight. populate sets every rail again with its exact shape once the
// city is in, the curves last; rails / rails_centered do it on their own.
// remove / remove_centered take the city away: every non-player entity in its
// room first, then the city back to air above its ground, grass on the ground,
// dirt under it, column by column, inside its outline.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zy';
export const label = '2zy. rails set again, and remove';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const root = ROOT || join(new URL('.', import.meta.url).pathname, '..', '..');
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { buildStructures, buildRemoveStructures, functionFiles, railLines } = await import('../../engine/export.js');
  const { siteGround } = await import('../../engine/worldfile.js');
  const { MATERIALS } = await import('../../engine/materials.js');
  const { decodeNbt } = await import('../nbt-read.js');
  const raw = JSON.parse(readFileSync(join(root, 'tools', 'test-terrain.json'), 'utf8'));
  const terrain = new Map(Object.entries(raw).map(([k, v]) => [k, Int16Array.from(v)]));
  const L = { furnish: false, lightAll: false, fish: false, hostileCount: 0 };
  const fitted = generateCity({ ...DEFAULTS, ...L, size: 192, seed: 447261885, terrain: siteGround(terrain, -160, -192, 192), transit: 'rails', bridges: true });
  const invented = generateCity({ ...DEFAULTS, ...L, size: 160, seed: 7, transit: 'trams', metro: true });

  // rails
  let countBad = 0, orderBad = 0, popBad = 0;
  for (const r of [fitted, invented]) {
    const w = r.world;
    let n = 0; w.forEach((x, y, z, id) => { const b = MATERIALS.def(id).block; if (b === 'minecraft:rail' || b === 'minecraft:golden_rail') n++; });
    const lines = railLines(w, w.box.x0, w.box.z0);
    if (lines.length !== n || n === 0) countBad++;
    const firstCurve = lines.findIndex((l) => /rail_direction"=[6-9]\]/.test(l));
    const lastOther = lines.map((l, i) => (/rail_direction"=[0-5]\]/.test(l) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    if (firstCurve >= 0 && firstCurve < lastOther) orderBad++;
    const fns = functionFiles(buildStructures(w, {}), w, { namespace: 'test', spawns: r.spawns });
    for (const name of ['populate', 'populate_centered']) {
      const t = fns.find((f) => f.fn === 'test/' + name).text.split('\n');
      const firstSet = t.findIndex((l) => l.startsWith('setblock ')), lastSet = t.map((l, i) => (l.startsWith('setblock ') ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      const lastMob = t.map((l, i) => (/^structure load \S+:m_/.test(l) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      const firstCart = t.findIndex((l) => l.startsWith('summon minecraft:minecart')), firstArea = t.findIndex((l) => l.startsWith('tickingarea remove'));
      if (t.filter((l) => l.startsWith('setblock ')).length !== n || firstSet < lastMob || (firstCart >= 0 && lastSet > firstCart) || (firstArea >= 0 && lastSet > firstArea)) popBad++;
    }
    if (!fns.some((f) => f.fn === 'test/rails') || !fns.some((f) => f.fn === 'test/rails_centered')) popBad++;
  }
  check('rails: every rail of the city set again, once each, with its exact shape', countBad === 0, `${countBad}`);
  check('rails: the curves last (their neighbours there when they go in)', orderBad === 0, `${orderBad}`);
  check('rails: populate sets them after the mobs, before the minecarts and before letting the city unload; rails / rails_centered too', popBad === 0, `${popBad}`);

  // remove: built, then taken away, a clean site inside the outline
  let wrong = 0, cityGone = true;
  for (const r of [fitted, invented]) {
    const w = r.world, g = w.cityGround, placed = new Map();
    const put = (st) => { const rt = decodeNbt(st.data).root, bi = rt.structure.block_indices[0], pal = rt.structure.palette.default.block_palette; const sy = rt.size[1], sz = rt.size[2], [ox, oy, oz] = st.offset; for (let i = 0; i < bi.length; i++) { if (bi[i] === -1) continue; const z = i % sz, y = Math.floor(i / sz) % sy, x = Math.floor(i / (sy * sz)); placed.set(`${ox + x},${oy + y},${oz + z}`, pal[bi[i]].name); } };
    for (const st of buildStructures(w, { fillAir: true })) put(st);
    for (const st of buildRemoveStructures(w, { fillAir: true })) put(st);
    for (const [k, n] of placed) {
      const [x, y, z] = k.split(',').map(Number);
      if (!g.inside(x, z)) continue;
      const top = g.at(x, z), want = y > top ? 'minecraft:air' : y === top ? 'minecraft:grass_block' : 'minecraft:dirt';
      if (n !== want) wrong++;
    }
    const fns = functionFiles(buildStructures(w, {}), w, { namespace: 'test', spawns: r.spawns });
    const rc = fns.find((f) => f.fn === 'test/remove_centered');
    if (!rc) { cityGone = false; continue; }
    const t = rc.text.split('\n');
    const kill = t.findIndex((l) => /^kill @e\[type=!player,x=~-?\d*,y=~-?\d*,z=~-?\d*,dx=\d+,dy=\d+,dz=\d+\]$/.test(l)), firstLoad = t.findIndex((l) => /_r /.test(l));
    if (kill < 0 || firstLoad < kill || t.filter((l) => /^structure load \S+_r /.test(l)).length !== buildRemoveStructures(w, {}).length) cityGone = false;
  }
  check('remove: built then taken away, every cell inside the outline air above the city\'s ground, grass on it, dirt under it', wrong === 0, `${wrong} wrong`);
  check('remove / remove_centered: every non-player entity in the city\'s room first, then the city', cityGone);
  note('rails set again by populate; remove leaves a clean site');
}
