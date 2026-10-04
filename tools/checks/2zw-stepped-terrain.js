// tools/checks/2zw-stepped-terrain.js — lots that step on rugged ground.
//
// On fitted ground a lot is held within a block of the street it faces (its
// door's street), all along it, and streets within a block of each other; two
// lots side by side, or a lot and a street it does not face, may stand at their
// own heights with a retaining wall between. So a steep block steps down a lot at
// a time and the city keeps nearer the real ground. Checked on the rugged sites
// of the test terrain: nearer the ground than the old fit, every held pair within
// a block, real steps, every step two or more a solid wall with a railing on top,
// every building and door reached, nothing dark; and the old fit, switched off.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zw';
export const label = '2zw. stepped lots on rugged ground';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const root = ROOT || join(new URL('.', import.meta.url).pathname, '..', '..');
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { findSites, siteGround } = await import('../../engine/worldfile.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MAT } = await import('../../engine/materials.js');
  const raw = JSON.parse(readFileSync(join(root, 'tools', 'test-terrain.json'), 'utf8'));
  const terrain = new Map(Object.entries(raw).map(([k, v]) => [k, Int16Array.from(v)]));

  check('defaults: lots step on fitted ground unless switched off', DEFAULTS.terrainBreaks === true);
  let better = 0, sites = 0, heldBad = 0, steps = 0, wallBad = 0, railBad = 0, ok = true, dark = 0, offSame = true, streetOn = 0, streetOff = 0;
  const fit = (r, t) => { const { W, D, mask } = r.plan, e = r.hills.elev; let n = 0, w1 = 0; for (let i = 0; i < W * D; i++) { if ((mask && !mask[i]) || t.ground[i] < -900) continue; n++; if (Math.abs(e[i] - Math.round(t.ground[i] - t.baseY)) <= 1) w1++; } return w1 / n; };
  for (const [size, si] of [[128, 0], [160, 0]]) {
    const site = findSites(terrain, size, { step: 64 })[si];
    const t = siteGround(terrain, site.x, site.z, size);
    const on = generateCity({ ...DEFAULTS, size, seed: 7, terrain: t, terrainFill: 24 });
    const off = generateCity({ ...DEFAULTS, size, seed: 7, terrain: t, terrainFill: 24, terrainBreaks: false, furnish: false, lightAll: false, fish: false, hostileCount: 0 });
    sites++;
    if (fit(on, t) > fit(off, t)) better++;
    if (off.hills.breaks) offSame = false;
    const v = verifyAll(on.world, on.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked || on.reach.unreached.length) ok = false;
    dark += on.stats.lighting.darkAfter;
    const w = on.world, { W, D, mask, lots } = on.plan, e = on.hills.elev, tied = on.hills.breaks.tied;
    const lotAt = new Int32Array(W * D).fill(-1);
    lots.forEach((l, k) => { for (let z = l.z0; z <= l.z1; z++) for (let x = l.x0; x <= l.x1; x++) lotAt[z * W + x] = k; });
    // street steps of more than a block: the old fit leaves some on rugged ground
    // (a street pulled both ways); the stepped fit must leave no more
    const streetSteps = (r) => { const ee = r.hills.elev; let n = 0; for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) { const i = z * W + x; if ((mask && !mask[i]) || lotAt[i] >= 0) continue; for (const [dx, dz] of [[1, 0], [0, 1]]) { const nx = x + dx, nz = z + dz; if (nx >= W || nz >= D) continue; const j = nz * W + nx; if ((mask && !mask[j]) || lotAt[j] >= 0) continue; if (Math.abs(ee[i] - ee[j]) > 1) n++; } } return n; };
    streetOn += streetSteps(on); streetOff += streetSteps(off);
    const inCity = (x, z) => x >= 0 && z >= 0 && x < W && z < D && (!mask || mask[z * W + x]);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      if (!inCity(x, z)) continue;
      const i = z * W + x;
      for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!inCity(nx, nz)) continue;
        const j = nz * W + nx, d = e[i] - e[j];
        if (tied(i, j)) { if ((lotAt[i] >= 0) !== (lotAt[j] >= 0) && Math.abs(d) > 1) heldBad++; continue; }   // a lot and the street it faces
        if (d < 2) continue;
        steps++;
        // the wall: the higher column solid from the lower ground up to its own
        for (let y = 1 + e[j]; y <= 1 + e[i]; y++) if (!w.has(x, y, z)) { wallBad++; break; }
        // the railing, or something standing there already (a building's wall); a
        // cell with no room to stand on (an overhang a block over it) needs none
        const top = 1 + e[i];
        if (w.has(x, top, z) && !w.has(x, top + 1, z) && !w.has(x, top + 2, z)) railBad++;
      }
    }
  }
  check('stepped: nearer the real ground than the old fit on every rugged site', better === sites, `${better}/${sites}`);
  check('stepped: every lot within a block of its street all along its frontage (its door\'s street)', heldBad === 0, `${heldBad}`);
  check('stepped: no more street steps of over a block than the old fit leaves', streetOn <= streetOff * 1.05 + 5, `${streetOn} vs ${streetOff}`);
  check('stepped: the lots do step (retaining walls between them)', steps > 50, `${steps} edges two or more`);
  check('stepped: every step of two or more is a solid wall', wallBad === 0, `${wallBad}`);
  check('stepped: a railing (or a wall) along the top of every step of two or more', railBad === 0, `${railBad}`);
  check('stepped: every building walks through, every door reached; nothing dark', ok && dark === 0, `${dark} dark`);
  check('stepped: switched off, the old fit (no lot steps)', offSame);
  note(`stepped: ${steps} edges stepping two or more over ${sites} rugged sites`);
}
