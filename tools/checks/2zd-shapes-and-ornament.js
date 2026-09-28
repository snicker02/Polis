// tools/checks/2zd-shapes-and-ornament.js — twisting towers, the Gothic
// church, and the Celtic monuments in the parks.
//
// A twisting tower is a new shape, so it has to earn the same guarantees as
// every other building: a player gets in and up to every floor, the walls are
// closed, the steps rise one block at a time with head room, and every plate
// stays on its lot. The Gothic ornament must not cost the church anything it
// had (it still verifies; with Detail off it is the old church), and the
// monuments stand on grass, off the paths, clear of the pond and the grove.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zd';
export const label = '2zd. twisting towers, Gothic church, standing stones';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { VoxelWorld } = await import('../../engine/blockcore.js');
  const { MAT, THEMES, MATERIALS, STAINED } = await import('../../engine/materials.js');
  const { makeTwistedTower, twistFits, TWIST_MIN_SIDE } = await import('../../engine/twist.js');
  const { verifyBuilding, verifyAll } = await import('../../engine/verify.js');
  const { makeRng } = await import('../../engine/rng.js');
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { megalith } = await import('../../engine/megaliths.js');
  const blockOf = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block; };
  const solid = (w, x, y, z) => { const id = w.get(x, y, z); return id !== -1 && !MATERIALS.isPassable(id); };

  // ---- twisting towers on flat ground ---------------------------------------
  let built = 0, verified = 0, plateOut = 0, thin = 0, turnBad = 0, overlapBad = 0, stepBad = 0, headBad = 0, leaks = 0, piersMissing = 0;
  for (const S of [13, 15, 18, 21, 25]) for (const floors of [6, 9, 14, 22]) for (const face of ['south', 'north', 'east', 'west']) for (const seed of [1, 2]) {
    const w = new VoxelWorld({ budget: 3e6 });
    const G = 10, D = S + (seed === 2 ? 3 : 0);
    for (let z = -4; z < D + 4; z++) for (let x = -4; x < S + 4; x++) w.set(x, G, z, MAT.SIDEWALK);
    const rec = makeTwistedTower(w, { x0: 0, z0: 0, x1: S - 1, z1: D - 1, floors, pitch: 5, groundY: G, facing: face,
      theme: THEMES.tower[seed % THEMES.tower.length], useStairs: seed === 1, lights: true }, makeRng(seed * 131 + S * 7 + floors));
    if (!rec) continue;
    built++;
    if (verifyBuilding(w, rec).ok) verified++;
    // plates: on the lot square, full size, turning steadily
    const h = rec.twist.h, area = (2 * h) * (2 * h);
    rec.plates.forEach((cells, k) => {
      for (const key of cells) { const [x, z] = key.split(',').map(Number); if (x < rec.x0 || x > rec.x1 || z < rec.z0 || z > rec.z1) plateOut++; }
      if (cells.size < 0.8 * area) thin++;
      if (k > 0) {
        const prev = rec.plates[k - 1];
        let both = 0; for (const c of cells) if (prev.has(c)) both++;
        if (both < 0.8 * Math.min(cells.size, prev.size)) overlapBad++;
      }
    });
    // A square turned 90° lands on itself, so the top of a 90° tower matches its
    // base: the turn shows most on the floor nearest 45°, which must differ
    // clearly from the ground floor.
    const deg = Math.abs(rec.twist.total) * 180 / Math.PI;
    let k45 = 0;
    for (let k = 0; k < rec.floors; k++) if (Math.abs(Math.abs(k * rec.twist.step) - Math.PI / 4) < Math.abs(Math.abs(k45 * rec.twist.step) - Math.PI / 4)) k45 = k;
    const first = rec.plates[0], mid = rec.plates[k45];
    let diff = 0; for (const c of mid) if (!first.has(c)) diff++;
    if (deg < 59.9 || deg > 90.1 || diff < 0.1 * mid.size) turnBad++;
    // steps: one per block of height, each next to the one before
    const steps = [];
    for (let y = G + 1; y <= rec.floorYs[rec.floors - 1]; y++) {
      const t = y - (G + 1), c = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]][t % 8];
      steps.push([rec.core.x0 + c[0], y, rec.core.z0 + c[1]]);
    }
    for (let i = 0; i < steps.length; i++) {
      const [x, y, z] = steps[i];
      if (!solid(w, x, y, z)) stepBad++;
      if (i > 0) { const [px, py, pz] = steps[i - 1]; if (py !== y - 1 || Math.abs(px - x) + Math.abs(pz - z) > 1) stepBad++; }
      for (let hy = 1; hy <= 3; hy++) if (solid(w, x, y + hy, z) && !steps.some((s) => s[0] === x && s[1] === y + hy && s[2] === z)) headBad++;
    }
    // closed walls: from inside an upper floor, feet level, never out past the plate
    for (const k of [1, rec.floors - 1]) {
      const y = rec.floorYs[k] + 1;
      const start = [rec.rects[k].x0 + 1, rec.rects[k].z0 + 1];
      const seen = new Set([start.join(',')]), q = [start];
      while (q.length) {
        const [x, z] = q.pop();
        if (!rec.plates[k].has(x + ',' + z)) { leaks++; break; }
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = [x + a, z + b], key = n.join(',');
          if (seen.has(key) || solid(w, n[0], y, n[1])) continue;
          seen.add(key); q.push(n);
        }
      }
    }
    // the corner piers trace the turn: every floor has trim at all four corners
    for (let k = 0; k < rec.floors; k++) {
      const th = k * rec.twist.step, [cx, cz] = rec.twist.centre;
      for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const px = cx + (a * h) * Math.cos(th) - (b * h) * Math.sin(th), pz = cz + (a * h) * Math.sin(th) + (b * h) * Math.cos(th);
        let found = false;
        for (let dz = -2; dz <= 2 && !found; dz++) for (let dx = -2; dx <= 2 && !found; dx++)
          if (w.get(Math.round(px) + dx, rec.floorYs[k] + 2, Math.round(pz) + dz) === rec.theme.trim) found = true;
        if (!found) piersMissing++;
      }
    }
  }
  check('twist: towers built on every lot from 13 to 25 square, 6 to 22 floors', built === 160, String(built));
  check('twist: every floor of every tower reached by the walk-through', verified === built, `${verified}/${built}`);
  check('twist: every plate stays on its lot', plateOut === 0, `${plateOut} cells off the lot`);
  check('twist: every plate is full size (at least 80% of (2h)²)', thin === 0, `${thin} thin plates`);
  check('twist: total turn 60–90°, and the floor nearest 45° clearly turned from the ground floor', turnBad === 0, `${turnBad} towers`);
  check('twist: each floor overlaps the one below by at least 80%', overlapBad === 0, `${overlapBad} floors`);
  check('twist: steps rise one block at a time, each beside the last', stepBad === 0, `${stepBad} bad steps`);
  check('twist: three blocks of head room over every step', headBad === 0, `${headBad} blocked`);
  check('twist: the walls are closed (no way out of a floor but the stair)', leaks === 0, `${leaks} leaks`);
  check('twist: the corner piers follow the turn, floor by floor', piersMissing === 0, `${piersMissing} missing`);
  check('twist: too small a lot is refused, not squeezed', !twistFits(0, 0, TWIST_MIN_SIDE - 2, 20, 10) && !twistFits(0, 0, 20, 20, 3) && twistFits(0, 0, 20, 20, 8));

  // ---- twisting towers in cities -----------------------------------------------
  const cities = [
    { seed: 7, size: 192, twistChance: 1 },
    { seed: 5, size: 160, cityStyle: 'desert', twistChance: 1 },
    { seed: 12345, size: 192 },
    { seed: 31, size: 160, parkChance: 0.45, cityStyle: 'medieval', twistChance: 1 },
  ];
  const made = cities.map((c) => ({ c, r: generateCity({ ...DEFAULTS, ...c }) }));
  let twisted = 0, allOk = true;
  for (const { c, r } of made) {
    const v = verifyAll(r.world, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked) allOk = false;
    twisted += r.buildings.filter((b) => b.twist).length;
    check(`city ${c.seed}: stats count the twisting towers`, r.stats.twisted === r.buildings.filter((b) => b.twist).length);
  }
  check('cities: twisting towers appear', twisted > 0, String(twisted));
  check('cities: every building (twisting or not) verifies', allOk);
  check('cities: a medieval city never twists', made[3].r.buildings.every((b) => !b.twist));
  const none = generateCity({ ...DEFAULTS, seed: 7, size: 192, twistChance: 0 });
  check('cities: twist chance 0 -> none', none.buildings.every((b) => !b.twist));
  const again = generateCity({ ...DEFAULTS, seed: 7, size: 192, twistChance: 1 });
  check('cities: same seed, same twisting towers',
    JSON.stringify(again.buildings.filter((b) => b.twist).map((b) => [b.x0, b.z0, b.twist.total])) ===
    JSON.stringify(made[0].r.buildings.filter((b) => b.twist).map((b) => [b.x0, b.z0, b.twist.total])));

  // ---- the Gothic church ---------------------------------------------------------
  let churches = 0;
  for (const { c, r } of made) {
    const ch = r.landmarks.find((l) => l.kind === 'church');
    if (!ch) continue;
    churches++;
    const w = r.world, g = ch.gothic, f = ch.fleche;
    check(`church ${c.seed}: still verifies (door, hall, head room)`, verifyBuilding(w, ch.rec).ok);
    check(`church ${c.seed}: a rose window of radius 3+ with glass and tracery`, g.rose && g.rose.R >= 3 && g.rose.glass >= 12 && g.rose.stone >= 8, JSON.stringify(g.rose));
    // the rose lies in the facade plane: its centre cell is carved stone, the cells round it glass
    const [rx, ry, rz] = g.rose.centre;
    const ring = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, b]) => ch.rec.facing === 'north' || ch.rec.facing === 'south' ? blockOf(w, rx + a, ry + b, rz) : blockOf(w, rx, ry + b, rz + a));
    check(`church ${c.seed}: the rose is glass round a carved hub`, !/glass/.test(blockOf(w, rx, ry, rz)) && ring.some((b) => /glass/.test(b)), ring.join(' '));
    // lancets: vertical glass runs at least 5 tall on the side walls
    const R0 = ch.rec.rects[0];
    let tall = 0;
    for (const [x, z] of [...Array(R0.z1 - R0.z0 + 1).keys()].flatMap((i) => [[R0.x0, R0.z0 + i], [R0.x1, R0.z0 + i]])
      .concat([...Array(R0.x1 - R0.x0 + 1).keys()].flatMap((i) => [[R0.x0 + i, R0.z0], [R0.x0 + i, R0.z1]]))) {
      let run = 0, best = 0;
      for (let y = ch.rec.groundY + 1; y < ch.rec.roofY; y++) { if (/glass/.test(blockOf(w, x, y, z))) { run++; best = Math.max(best, run); } else run = 0; }
      if (best >= 5) tall++;
    }
    check(`church ${c.seed}: tall lancet windows (at least 6 lights 5+ high)`, g.lancets >= 6 && tall >= 6, `${g.lancets} placed, ${tall} tall`);
    check(`church ${c.seed}: buttresses with pinnacles, corbels and gargoyles`, g.buttresses >= 2 && g.pinnacles === g.buttresses && g.corbels >= 6 && g.gargoyles >= 2, JSON.stringify(g));
    check(`church ${c.seed}: the flèche rises well above the belfry, crocketed, with corner pinnacles`,
      f.tipY >= ch.belfryBell[1] + 10 && f.crockets >= 8 && f.pinnacles === 4 && ch.spireTop[1] === f.tipY, JSON.stringify(f));
    // every pinnacle top is a lightning-rod finial
    let rods = 0;
    w.forEach((x, y, z, id) => { if (MATERIALS.def(id).block === 'minecraft:lightning_rod' && x >= ch.lot.x0 - 1 && x <= ch.lot.x1 + 1 && z >= ch.lot.z0 - 1 && z <= ch.lot.z1 + 1) rods++; });
    check(`church ${c.seed}: pinnacles end in finials`, rods >= g.pinnacles + 4, `${rods} finials`);
  }
  check('cities: churches found to check', churches >= 2, String(churches));
  {
    const plain = generateCity({ ...DEFAULTS, seed: 7, size: 192, detail: false });
    const ch = plain.landmarks.find((l) => l.kind === 'church');
    check('church: with Detail off it is the plain church (no Gothic dress, the old spire)', ch && !ch.gothic && !ch.fleche && ch.spireTop[1] === ch.belfryBell[1] + 8);
  }

  // ---- standing stones -------------------------------------------------------------
  const kinds = new Set();
  let onGrass = 0, offGrass = 0, onPath = 0, capBad = 0, chamberBad = 0, circleBad = 0, avoidBad = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const w = new VoxelWorld({ budget: 200000 });
    const G = 10, lot = { x0: 0, z0: 0, x1: 22, z1: 22 }, cx = 11, cz = 11;
    for (let z = 0; z <= 22; z++) for (let x = 0; x <= 22; x++) w.set(x, G, z, x === cx || z === cz ? MAT.PATH : MAT.GRASS);
    const avoid = seed % 3 === 0 ? [{ x0: 1, z0: 1, x1: 9, z1: 9 }] : [];
    const m = megalith(w, lot, cx, cz, makeRng(seed), G, avoid);
    if (!m) continue;
    kinds.add(m.kind);
    if (avoid.length && m.x0 <= 9 && m.z0 <= 9) avoidBad++;
    const feet = new Map();
    for (const [x, y, z] of m.stones) { const k = x + ',' + z; feet.set(k, Math.min(feet.get(k) ?? 1e9, y)); }
    for (const [k, y] of feet) {
      const [x, z] = k.split(',').map(Number);
      if (y !== G + 1) continue;                                  // capstone cells are carried, not standing
      if (w.get(x, G, z) === MAT.GRASS) onGrass++; else offGrass++;
      if (x === cx || z === cz) onPath++;
    }
    if (m.kind === 'dolmen') {
      for (const [x, z] of [[m.x0, m.z0], [m.x1, m.z0], [m.x0, m.z1], [m.x1, m.z1]])
        if (!solid(w, x, G + 1, z) || !solid(w, x, G + 2, z) || !solid(w, x, G + 3, z)) capBad++;
      // a chamber: some cell inside has two blocks of head room under the capstone
      let room = false;
      for (let z = m.z0 + 1; z < m.z1; z++) for (let x = m.x0 + 1; x < m.x1; x++) if (!solid(w, x, G + 1, z) && !solid(w, x, G + 2, z)) room = true;
      if (!room) chamberBad++;
    }
    if (m.kind === 'cromlech') {
      const mx = (m.x0 + m.x1) / 2, mz = (m.z0 + m.z1) / 2;
      const standing = [...feet.keys()].map((k) => k.split(',').map(Number));
      if (standing.length !== 8 || standing.some(([x, z]) => Math.abs(Math.hypot(x - mx, z - mz) - 3) > 0.9)) circleBad++;
    }
  }
  check('stones: menhir, dolmen and stone circle all occur', kinds.size === 3, [...kinds].join(','));
  check('stones: every stone stands on grass, none on a path', offGrass === 0 && onPath === 0 && onGrass > 0, `${offGrass} off grass, ${onPath} on a path`);
  check('stones: a dolmen\'s capstone rests on its four uprights', capBad === 0, `${capBad} unsupported`);
  check('stones: a dolmen has a chamber you can walk into', chamberBad === 0, `${chamberBad} without`);
  check('stones: a stone circle is eight stones on a radius of 3', circleBad === 0, `${circleBad} bad circles`);
  check('stones: a quadrant already taken (pond, grove) is left alone', avoidBad === 0, `${avoidBad} overlaps`);
  // in a city: in parks, never in the pond, trees never overwrite them
  const med = made[3].r;
  let placed = 0, overwritten = 0;
  for (const m of med.megaliths) for (const [x, y, z] of m.stones) { placed++; if (!/stone|cobble|andesite/.test(blockOf(med.world, x, y, z))) overwritten++; }
  check('stones: placed in city parks, and still standing after trees and flowers', placed > 0 && overwritten === 0, `${placed} stones, ${overwritten} overwritten`);
  check('stones: stats list them', JSON.stringify(med.stats.megaliths) === JSON.stringify(med.megaliths.map((m) => m.kind)));
  const bare = generateCity({ ...DEFAULTS, seed: 31, size: 160, parkChance: 0.45, cityStyle: 'medieval', megaliths: false });
  check('stones: switched off -> none', bare.megaliths.length === 0);

  // ---- the page -----------------------------------------------------------------------
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const main = readFileSync(join(ROOT, 'main.js'), 'utf8');
  check('page: a Twisting towers slider read into the config', /id="twistChance"/.test(html) && /cfg\.twistChance = num\('twistChance'\)/.test(main) && /twistChance: 2/.test(main));
  check('page: a Standing stones checkbox read into the config', /id="megaliths"/.test(html) && /const CHECKS = \[[^\]]*'megaliths'/.test(main));
  note(`twisting towers: ${built} on flat ground, ${twisted} in cities · churches: ${churches} · stones: ${[...kinds].join(', ')}`);
}
