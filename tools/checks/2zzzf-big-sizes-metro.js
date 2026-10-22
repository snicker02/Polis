// tools/checks/2zzzf-big-sizes-metro.js — cities up to 1024 across, the metro near the middle (0.76.0; 1024 in 0.77.0).
//
// - the page's size slider goes to 1024; a city past 512 gets room for its blocks (its budget
//   grows with its ground), a smaller one the budget it always had;
// - the metro within METRO_REACH of the city's middle, however big the city: no tunnel, hall
//   or stair of it further out;
// - a city filled in parts: the four areas held loaded at the end of populate (and by build)
//   lie round the metro, and every block of the metro is under them; none over 100 chunks.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zzzf';
export const label = '2zzzf. bigger cities, the metro near the middle';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { METRO_REACH } = await import('../../engine/metro.js');
  const { stagePlan, needsStages, HOME_SQ } = await import('../../engine/export.js');
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const m = /id="size"[^>]*max="(\d+)"/.exec(html) || /max="(\d+)"[^>]*id="size"/.exec(html);
  check('the size slider goes to 1024', !!m && m[1] === '1024', m ? m[1] : 'no slider');

  const small = generateCity({ ...DEFAULTS, size: 96, seed: 3 });
  check('a small city: the budget it always had', small.world.budget === DEFAULTS.budget, `${small.world.budget}`);

  const r = generateCity({ ...DEFAULTS, size: 1024, seed: 11, metro: true, airport: true, themepark: true, mixStyles: true });
  check('a 1024 city with an airport and a theme park: room for its blocks, none dropped, none off the edge of the world\'s grid', r.world.budget > DEFAULTS.budget && !r.world.overflow && !r.world.outside, `${r.world.budget}, ${r.world.overflow} over, ${r.world.outside || 0} outside`);
  const W = r.plan.W, D = r.plan.D, MX = Math.floor(W / 2), MZ = Math.floor(D / 2);
  const mboxes = (r.world.airBoxes || []).filter((b) => b.metro);
  let far = 0;
  for (const b of mboxes) if (Math.max(Math.abs(b.x0 - MX), Math.abs(b.x1 - MX), Math.abs(b.z0 - MZ), Math.abs(b.z1 - MZ)) > METRO_REACH + 8) far++;
  check(`the metro within ${METRO_REACH} of the middle (its halls a few blocks more), with lines and a loop`,
    r.metro && r.metro.lines.length >= 2 && r.metro.lines.some((l) => l.ring) && far === 0, `${r.metro ? r.metro.lines.length : 0} lines, ${far} of ${mboxes.length} rooms further out`);
  check('the city is filled in parts', needsStages(r.world));
  const P = stagePlan(r.world, 'big');
  const inHome = (x, z) => P.home.some((a) => x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1);
  let out = 0;
  for (const b of mboxes) for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) if (!inHome(x, z)) out++;
  const worst = (s) => Math.ceil((s - 1) / 16) + 1;
  const big = P.home.filter((a) => worst(a.x1 - a.x0 + 1) * worst(a.z1 - a.z0 + 1) > 100).length;
  check('the four areas held loaded lie over the whole metro; none over 100 chunks', P.home.length === 4 && out === 0 && big === 0 && HOME_SQ * 2 >= 2 * METRO_REACH + 16,
    `${P.home.length} areas, ${out} corners outside, ${big} too big`);
  note(`1024 city: ${r.plan.W} x ${r.plan.D}, ${r.metro.lines.length} lines, ${r.world.cells.size} blocks, box ${JSON.stringify(r.world.box)}, metro ${r.world.metroBox.x1 - r.world.metroBox.x0 + 1} x ${r.world.metroBox.z1 - r.world.metroBox.z0 + 1}`);
}
