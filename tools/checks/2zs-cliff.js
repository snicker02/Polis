// tools/checks/2zs-cliff.js — a city in tiers up a cliff.
//
// The city climbs in tiers, each eight above the last, an edge always in the
// middle of a street that truly crosses the city (no lot split). Every edge has
// a way up: flights of stairs from the lower street to the upper one, a block a
// step, a landing level with the upper street and a parapet past it. The top of
// each face is railed but where a flight comes up; the face is solid. Every
// building walks through, every door is reached from the bottom tier's streets,
// and nothing is dark.

export const id = '2zs';
export const label = '2zs. a cliff city in tiers';

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MAT, MATERIALS } = await import('../../engine/materials.js');
  const blk = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block; };

  check('defaults: on level ground unless asked', DEFAULTS.cliff === false);
  let ok = true, dark = 0, tiers = 0, flights = 0, unlinked = 0, stepBad = 0, landBad = 0, railBad = 0, faceBad = 0, split = 0, cities = 0;
  for (const [seed, size, style] of [[12345, 256, 'medieval'], [3, 224, 'eastasian']]) {
    const r = generateCity({ ...DEFAULTS, seed, size, cityStyle: style, cliff: true });
    cities++;
    const w = r.world, { W, D, use, mask } = r.plan, cw = r.cliffWays;
    const v = verifyAll(w, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked || r.reach.unreached.length) ok = false;
    dark += r.stats.lighting.darkAfter;
    tiers += cw.edges.length + 1;
    unlinked += cw.unlinked.length;
    flights += cw.flights.length;
    for (const f of cw.flights) {
      // a block a step, from just above the lower street to the upper street's level
      const byX = new Map();
      for (const [x, y] of f.steps) byX.set(x, y);
      [...byX.entries()].sort((a, b) => a[0] - b[0]).forEach(([x, y], i) => { if (y !== f.yl + 1 + i || !/stairs/.test(blk(w, x, y, f.edge - 1))) stepBad++; });
      // the landing level with the upper street, the parapet a block higher past it
      const lx = f.x0 + cw.tier;
      if (!w.has(lx, f.yu, f.edge - 1) || w.has(lx, f.yu + 1, f.edge - 1) || !w.has(lx + 1, f.yu + 1, f.edge - 1)) landBad++;
    }
    for (const zb of cw.edges) {
      const yu = (r.cfg && 1) + r.hills.elev[zb * W + Math.floor(W / 2)];
      const yl = 1 + r.hills.elev[(zb - 1) * W + Math.floor(W / 2)];
      const open = new Set(cw.flights.filter((f) => f.edge === zb).flatMap((f) => [f.x0 + cw.tier - 1, f.x0 + cw.tier]));
      for (let x = 0; x < W; x++) {
        if (mask && !mask[zb * W + x]) continue;
        const u = use[zb * W + x];
        if (u !== 1 && u !== 2) continue;
        // the face under the upper street's first row is solid down to the lower street
        for (let y = yl; y <= yu; y++) if (!w.has(x, y, zb)) { faceBad++; break; }
        // railed but where a flight comes up (or something already stands there)
        if (!open.has(x) && !w.has(x, yu + 1, zb)) railBad++;
      }
    }
    // no lot split: every lot stands on one height
    for (const l of r.plan.lots) {
      const hs = new Set();
      for (let z = l.z0; z <= l.z1; z++) for (let x = l.x0; x <= l.x1; x++) hs.add(r.hills.elev[z * W + x]);
      if (hs.size > 1) split++;
    }
  }
  check('cliff: every building walks through, every door reached from the bottom tier; nothing dark', ok && dark === 0, `${dark} dark`);
  check('cliff: the city climbs in tiers (two or more)', tiers >= cities * 2, `${tiers} tiers over ${cities} cities`);
  check('cliff: every edge has a way up', unlinked === 0 && flights >= cities, `${flights} flights, ${unlinked} edges without`);
  check('cliff: a flight rises a block a step from the lower street to the upper', stepBad === 0, `${stepBad}`);
  check('cliff: a landing level with the upper street, a parapet past it', landBad === 0, `${landBad}`);
  check('cliff: the top of each face railed but where a flight comes up', railBad === 0, `${railBad}`);
  check('cliff: the face is solid from the lower street up to the upper', faceBad === 0, `${faceBad}`);
  check('cliff: no lot split between tiers', split === 0, `${split}`);
  note(`cliff: ${tiers} tiers and ${flights} flights over ${cities} cities`);
}
