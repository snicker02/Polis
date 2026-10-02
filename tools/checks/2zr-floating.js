// tools/checks/2zr-floating.js — a city of floating islands.
//
// The main streets are chasms, carried right across to the edge, so the city
// is several islands; each hangs on a rocky underside deeper in the middle than
// at its rim. A chasm is open all the way down; a bridge over it is one deck
// with air under it. No water spills into the void, there are no boats and no
// harbour, nothing is founded on ground that is not there, every building walks
// through and nothing is left dark.

export const id = '2zr';
export const label = '2zr. floating islands';

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MAT } = await import('../../engine/materials.js');
  const { USE_CANAL } = await import('../../engine/water.js');
  const G = 1;

  check('defaults: on the ground unless asked', DEFAULTS.floating === false);
  let ok = true, dark = 0, few = 0, taper = 0, isl = 0, openBad = 0, deckBad = 0, leaks = 0, boats = 0, railed = 0, banks = 0;
  for (const [seed, size, style] of [[7, 192, 'modern'], [12345, 224, 'medieval']]) {
    const r = generateCity({ ...DEFAULTS, seed, size, cityStyle: style, floating: true, pondChance: 1 });
    const w = r.world, { W, D, mask, use } = r.plan, I = r.islands;
    const inCity = (x, z) => x >= 0 && z >= 0 && x < W && z < D && (!mask || mask[z * W + x]);
    const v = verifyAll(w, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked || r.reach.unreached.length) ok = false;
    dark += r.stats.lighting.darkAfter;
    if (I.count < 4) few++;
    isl += I.count;
    boats += r.spawns.filter((s) => s.type === 'boat').length + (r.harbour ? 1 : 0);
    // undersides: the deepest rock under an island's middle is deeper than under its rim
    const depthAt = (x, z) => { let d = 0; for (let y = G - 1; y > G - 40; y--) { if (!w.has(x, y, z)) break; d++; } return d; };
    const byIsland = new Map();
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const c = I.comp[z * W + x]; if (c < 0) continue;
      const rim = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => !inCity(x + dx, z + dz) || I.comp[(z + dz) * W + x + dx] !== c);
      const e = byIsland.get(c) || { rim: 0, rn: 0, max: 0 };
      const d = depthAt(x, z);
      if (rim) { e.rim += d; e.rn++; } else e.max = Math.max(e.max, d);
      byIsland.set(c, e);
    }
    for (const e of byIsland.values()) if (e.rn && e.max > 0 && e.max <= e.rim / e.rn) taper++;
    // chasms and bridges
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      if (!I.band[z * W + x]) continue;
      if (use[z * W + x] === USE_CANAL) { for (let y = G - 30; y <= G; y++) if (w.has(x, y, z)) { openBad++; break; } }
      else { for (let y = G - 30; y < G; y++) if (w.has(x, y, z)) { deckBad++; break; } }
    }
    // banks: a walkway cell beside open chasm carries a railing (or is a crossing)
    for (const c of r.canals) for (let u = c.u0; u <= c.u1; u++) for (const a of [c.ch0 - 1, c.ch1 + 1]) {
      const [x, z] = c.cell(u, a), [mx, mz] = c.cell(u, c.ch0);
      if (!inCity(x, z) || use[mz * W + mx] !== USE_CANAL || !w.has(x, G, z)) continue;
      banks++; if (w.get(x, G + 1, z) === MAT.FENCE) railed++;
    }
    // water: none with nothing under it, none beside the drop
    w.forEach((x, y, z, id) => {
      if (id !== MAT.WATER) return;
      if (w.get(x, y - 1, z) === -1) leaks++;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.get(x + dx, y, z + dz) === -1 && (I.band[(z + dz) * W + x + dx] || !inCity(x + dx, z + dz))) { leaks++; break; }
    });
  }
  check('floating: every building walks through, every floor and door reached; nothing dark', ok && dark === 0, `${dark} dark`);
  check('floating: the chasms cut the city into islands (four or more)', few === 0, `${isl} islands`);
  check('floating: every island hangs deeper in the middle than at its rim', taper === 0, `${taper} that do not`);
  check('floating: a chasm is open all the way down', openBad === 0, `${openBad}`);
  check('floating: a bridge is one deck with air under it', deckBad === 0, `${deckBad}`);
  check('floating: the banks are railed', banks > 50 && railed >= banks * 0.9, `${railed}/${banks}`);
  check('floating: no water spills into the void', leaks === 0, `${leaks}`);
  check('floating: no boats, no harbour', boats === 0, `${boats}`);
  // nothing founded on ground that is not there
  {
    const { foundationFill } = await import('../../engine/export.js');
    const r = generateCity({ ...DEFAULTS, seed: 7, size: 128, floating: true });
    const f = foundationFill(r.world);
    check('floating: the foundation puts nothing under it', [[10, -20, 10], [60, -30, 60], [100, -9, 40]].every(([x, y, z]) => f(x, y, z) === -1));
  }
  // the gaps: wide main streets give wide chasms (more than a crack, one of them wide);
  // and the Streets setting is the player's: a railway, whatever the style
  {
    const { MATERIALS } = await import('../../engine/materials.js');
    let narrow = 0, widest = 0, railsBad = 0;
    for (const [seed, style] of [[7, 'modern'], [21, 'venetian'], [8, 'fortress']]) {
      const r = generateCity({ ...DEFAULTS, seed, size: 192, cityStyle: style, floating: true, transit: 'rails' });
      for (const c of r.canals) { const wdt = c.ch1 - c.ch0 + 1; if (wdt < 3) narrow++; widest = Math.max(widest, wdt); }
      let rails = 0; r.world.forEach((x, y, z, id) => { if (/rail/.test(MATERIALS.def(id).block)) rails++; });
      if (r.cfg.transit !== 'rails' || rails < 100) railsBad++;
    }
    check('floating: the chasms are gaps, not cracks (three or more across, the widest nine)', narrow === 0 && widest >= 9, `${narrow} narrow, widest ${widest}`);
    check('floating: a railway when asked for, whatever the style (Venetian and fortress too)', railsBad === 0, `${railsBad} without`);
  }
  note(`floating: ${isl} islands over two cities`);
}
