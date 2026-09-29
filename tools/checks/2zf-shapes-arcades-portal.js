// tools/checks/2zf-shapes-arcades-portal.js — shaped towers, Romanesque
// arcades, and the church's Flamboyant portal.
//
// A plate tower may be a twisting square, octagon or hexagon, a tapering
// twist, a round tower or a round one with helical ribs. Each has to earn
// every guarantee a building has (walk-through, closed walls, furnishing, on
// its lot) and be the shape it says it is: the right area, piers at its
// vertices on every floor, a taper that shrinks it but never below the core.
// The square twist must be exactly 0.20's. The arcades and the portal are
// ornament: they must look right and cost nothing (no door blocked, no head
// room taken, every building still verifies).
export const id = '2zf';
export const label = '2zf. shaped towers, Romanesque arcades, Flamboyant portal';

export default async function run(ctx) {
  const { check, note } = ctx;
  const { VoxelWorld } = await import('../../engine/blockcore.js');
  const { MAT, THEMES, MATERIALS } = await import('../../engine/materials.js');
  const { makeShapedTower, SHAPES, inradius } = await import('../../engine/twist.js');
  const { verifyBuilding, verifyAll } = await import('../../engine/verify.js');
  const { furnish } = await import('../../engine/life.js');
  const { makeRng } = await import('../../engine/rng.js');
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const blk = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block; };
  const solid = (w, x, y, z) => { const id = w.get(x, y, z); return id !== -1 && !MATERIALS.isPassable(id); };
  const RMIN = 3 * Math.SQRT2 - 1e-6;

  // ---- every shape on flat ground ---------------------------------------------
  const per = {};
  for (const shape of Object.keys(SHAPES)) {
    const t = per[shape] = { built: 0, ok: 0, furnished: 0, bare: 0, off: 0, area: 0, leaks: 0, piers: 0, taperBad: 0 };
    const sides = SHAPES[shape].sides;
    for (const S of [13, 16, 19, 23]) for (const floors of [6, 11, 17]) for (const face of ['south', 'east', 'north', 'west']) {
      const w = new VoxelWorld({ budget: 3e6 }); const G = 10;
      for (let z = -4; z < S + 4; z++) for (let x = -4; x < S + 4; x++) w.set(x, G, z, MAT.SIDEWALK);
      const rec = makeShapedTower(w, { x0: 0, z0: 0, x1: S - 1, z1: S - 1, floors, pitch: 5, groundY: G, facing: face,
        theme: THEMES.tower[(S + floors) % THEMES.tower.length], useStairs: true, lights: true, shape }, makeRng(S * 97 + floors * 7));
      if (!rec) continue;
      t.built++;
      if (verifyBuilding(w, rec).ok) t.ok++;
      const [cx, cz] = rec.twist.centre;
      rec.plates.forEach((cells, k) => {
        const R = rec.twist.R[k], r = inradius(sides, R);
        for (const key of cells) { const [x, z] = key.split(',').map(Number); if (x < rec.x0 || x > rec.x1 || z < rec.z0 || z > rec.z1) t.off++; }
        // the right area: a regular n-gon n/2·R²·sin(2π/n), a circle π·r², to
        // within what drawing it in cells can cost: about one cell per unit of
        // perimeter (an untilted square snaps to whole rings of cells)
        const ideal = sides ? sides / 2 * R * R * Math.sin(2 * Math.PI / sides) : Math.PI * r * r;
        const perim = sides ? sides * 2 * r * Math.tan(Math.PI / sides) : 2 * Math.PI * r;
        if (Math.abs(cells.size - ideal) > Math.max(0.2 * ideal, perim)) t.area++;
        // piers at every vertex (eight ribs on a circle), turned with the floor
        const n = sides || 8, off = sides ? Math.PI / sides : 0, th = k * rec.twist.step;
        for (let i = 0; i < n; i++) {
          const a = th + off + 2 * Math.PI * i / n, px = cx + R * Math.cos(a), pz = cz + R * Math.sin(a);
          let found = false;
          for (let dz = -2; dz <= 2 && !found; dz++) for (let dx = -2; dx <= 2 && !found; dx++)
            if (w.get(Math.round(px) + dx, rec.floorYs[k] + 2, Math.round(pz) + dz) === rec.theme.trim) found = true;
          if (!found) t.piers++;
        }
        // closed walls on the floor above the ground
        if (k === 1) {
          const y = rec.floorYs[k] + 1, start = [rec.rects[k].x0 + 1, rec.rects[k].z0 + 1];
          const seen = new Set([start.join(',')]), q = [start];
          while (q.length) {
            const [x, z] = q.pop();
            if (!cells.has(x + ',' + z)) { t.leaks++; break; }
            for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nb = [x + a, z + b], key = nb.join(',');
              if (seen.has(key) || solid(w, nb[0], y, nb[1])) continue;
              seen.add(key); q.push(nb);
            }
          }
        }
      });
      // taper: shrinks floor by floor on a lot big enough, never below the core ring
      const Rs = rec.twist.R;
      const rTop = inradius(sides, Rs[Rs.length - 1]);
      if (rTop < RMIN) t.taperBad++;
      if (SHAPES[shape].taper && S >= 16 && !(Rs.every((v, i) => i === 0 || v < Rs[i - 1]))) t.taperBad++;
      if (!SHAPES[shape].taper && Rs.some((v) => v !== Rs[0])) t.taperBad++;
      // furnished: still walks through, and every floor has furniture
      const f = furnish(w, rec, makeRng(S + floors), { useStairs: true });
      if (f.ok && verifyBuilding(w, rec).ok) t.furnished++;
      for (let k = 0; k < rec.floors; k++) {
        let pieces = 0;
        for (const key of rec.plates[k]) {
          const [x, z] = key.split(',').map(Number);
          if (Math.abs(x - cx) <= 2.5 && Math.abs(z - cz) <= 2.5) continue;
          const b = blk(w, x, rec.floorYs[k] + 1, z);
          if (b !== 'air' && !/stairs|door|glass|concrete|quartz|iron_block|smooth|deepslate|terracotta|sandstone|planks|bricks|calcite|lantern/.test(b)) pieces++;
        }
        if (pieces < 3) t.bare++;
      }
    }
  }
  for (const [shape, t] of Object.entries(per)) {
    check(`${shape}: built on every lot from 13 to 23 square`, t.built === 48, String(t.built));
    check(`${shape}: every tower walks through, and still does furnished`, t.ok === t.built && t.furnished === t.built, `${t.ok}/${t.furnished}/${t.built}`);
    check(`${shape}: on its lot, the right area (to within a cell per unit of perimeter), walls closed`, t.off === 0 && t.area === 0 && t.leaks === 0, `${t.off} off, ${t.area} wrong area, ${t.leaks} leaks`);
    check(`${shape}: piers at every vertex of every floor, turning with it`, t.piers === 0, `${t.piers} missing`);
    check(`${shape}: ${SHAPES[shape].taper ? 'tapers floor by floor, never below the core' : 'keeps its size'}`, t.taperBad === 0, `${t.taperBad}`);
    check(`${shape}: every floor furnished`, t.bare === 0, `${t.bare} bare floors`);
  }
  // the square twist is 0.20's, cell for cell
  {
    const w = new VoxelWorld({ budget: 3e6 });
    const rec = makeShapedTower(w, { x0: 0, z0: 0, x1: 20, z1: 20, floors: 9, pitch: 5, groundY: 10, facing: 'south', theme: THEMES.tower[1], useStairs: true, lights: true, shape: 'square-twist' }, makeRng(5));
    const h = 10 / Math.SQRT2, [cx, cz] = rec.twist.centre;
    let diff = 0;
    rec.plates.forEach((cells, k) => {
      const th = k * rec.twist.step, c = Math.cos(th), s = Math.sin(th);
      for (let z = 0; z <= 20; z++) for (let x = 0; x <= 20; x++) {
        const dx = x - cx, dz = z - cz, u = dx * c + dz * s, v = -dx * s + dz * c;
        if ((Math.abs(u) <= h + 1e-6 && Math.abs(v) <= h + 1e-6) !== cells.has(x + ',' + z)) diff++;
      }
    });
    check('square twist: every plate is exactly 0.20\'s turned square', diff === 0, `${diff} cells differ`);
  }

  // ---- shaped towers in cities --------------------------------------------------------
  const seen = {};
  let cityOk = true;
  for (const seed of [1, 2, 3, 5, 7, 11, 12345]) {
    const r = generateCity({ ...DEFAULTS, seed, size: 192, twistChance: 1 });
    const v = verifyAll(r.world, r.buildings);
    if (v.ok !== v.total || r.reach.unreached.length) cityOk = false;
    for (const n of r.stats.shapes) seen[n] = (seen[n] || 0) + 1;
  }
  // (pagodas belong to the East Asian style; 2zh finds them there)
  check('cities: every shape turns up', Object.keys(SHAPES).filter((n) => !SHAPES[n].eaves).every((n) => seen[n] > 0), JSON.stringify(seen));
  check('cities: with shaped towers everywhere, every building verifies and every door is reachable', cityOk);
  const a1 = generateCity({ ...DEFAULTS, seed: 7, size: 192, twistChance: 1 }), a2 = generateCity({ ...DEFAULTS, seed: 7, size: 192, twistChance: 1 });
  check('cities: same seed, same shapes in the same places',
    JSON.stringify(a1.buildings.filter((b) => b.shape).map((b) => [b.x0, b.z0, b.shape])) === JSON.stringify(a2.buildings.filter((b) => b.shape).map((b) => [b.x0, b.z0, b.shape])));

  // ---- Romanesque arcades -------------------------------------------------------------
  let mids = 0, arcaded = 0, bays = 0, bayBad = 0, pierBad = 0, doorBad = 0, billets = 0, billetBad = 0, allOk = true;
  for (const c of [{ seed: 12345, size: 160 }, { seed: 31, size: 160, cityStyle: 'medieval' }, { seed: 4, size: 160, cityStyle: 'desert' }, { seed: 9, size: 192, cityStyle: 'cherry' }]) {
    const r = generateCity({ ...DEFAULTS, ...c });
    const w = r.world;
    const v = verifyAll(w, r.buildings);
    if (v.ok !== v.total || r.reach.unreached.length) allOk = false;
    for (const b of r.buildings.filter((x) => x.style === 'mid' && !x.landmark)) {
      mids++;
      if (!b.arcade) continue;
      arcaded++;
      const th = b.theme, gy = b.groundY, P = b.pitch, archRow = gy + P - 2;
      const o = b.door.out;
      for (const bay of b.arcade.bays) {
        bays++;
        bay.forEach(([x, z], j) => {
          if (w.get(x, gy + 1, z) !== th.wall) bayBad++;
          for (let y = gy + 2; y < archRow; y++) if (w.get(x, y, z) !== th.glass) bayBad++;
          const head = blk(w, x, archRow, z);
          if (j === 1 ? w.get(x, archRow, z) !== th.glass : !/stairs/.test(head)) bayBad++;
          if (b.doorCells.some(([dx, dz]) => Math.abs(dx - x) + Math.abs(dz - z) <= 1)) doorBad++;
        });
        const along = [bay[1][0] - bay[0][0], bay[1][1] - bay[0][1]];
        for (const [px, pz] of [[bay[0][0] - along[0], bay[0][1] - along[1]], [bay[2][0] + along[0], bay[2][1] + along[1]]])
          for (let y = gy + 1; y <= archRow; y++) if (w.get(px, y, pz) !== th.trim) pierBad++;
      }
      billets += b.arcade.billets;
      // the billet course is above anyone's head: a block out, at the first
      // floor's slab (gy + P, at least gy + 5), counted cell by cell there
      const fr = b.rects[0], line = b.facing === 'south' ? fr.z1 + 1 : b.facing === 'north' ? fr.z0 - 1 : b.facing === 'east' ? fr.x1 + 1 : fr.x0 - 1;
      let here = 0;
      for (let a = (o[0] === 0 ? fr.x0 : fr.z0) + 1; a < (o[0] === 0 ? fr.x1 : fr.z1); a++) {
        const x = o[0] === 0 ? a : line, z = o[0] === 0 ? line : a;
        const id = w.get(x, gy + P, z);
        if (id === th.trim || /stairs/.test(blk(w, x, gy + P, z))) here++;
      }
      if (P < 5 || here < b.arcade.billets) billetBad++;
    }
  }
  check('arcades: found on mid-rises', arcaded >= 5 && bays >= 8, `${arcaded}/${mids} mid-rises, ${bays} bays`);
  check('arcades: every bay is a bulkhead, glass, and a round head (stairs, glass crown)', bayBad === 0, `${bayBad} bad cells`);
  check('arcades: a pier either side of every bay', pierBad === 0, `${pierBad} bad`);
  check('arcades: no bay touches a doorway', doorBad === 0, `${doorBad}`);
  check('arcades: a billet course over them', billets > 0 && billetBad === 0, `${billets} billets`);
  check('arcades: with them, every building verifies and every door is reachable', allOk);
  {
    const r = generateCity({ ...DEFAULTS, seed: 12345, size: 160, detail: false });
    check('arcades: with Detail off, none', r.buildings.every((b) => !b.arcade));
    check('arcades: landmarks dress themselves (no arcade on a church, castle or hall)', generateCity({ ...DEFAULTS, seed: 7, size: 192 }).buildings.every((b) => !b.landmark || !b.arcade));
  }

  // ---- the Flamboyant portal ----------------------------------------------------------
  let churches = 0, portalBad = 0, headBad = 0;
  for (const c of [{ seed: 7, size: 192 }, { seed: 12345, size: 192 }, { seed: 31, size: 160, cityStyle: 'medieval', parkChance: 0.45 }, { seed: 5, size: 160, cityStyle: 'desert' }]) {
    const r = generateCity({ ...DEFAULTS, ...c });
    const ch = r.landmarks.find((l) => l.kind === 'church');
    if (!ch) continue;
    churches++;
    const p = ch.gothic.portal;
    if (!p || p.pinnacles !== 2 || p.gable !== 3 || !p.finial || !verifyBuilding(r.world, ch.rec).ok) portalBad++;
    // the doorstep keeps three blocks of head room over it (the step out may be a block up)
    const [dx, dz] = ch.rec.doorCells[0], o = ch.rec.door.out, G = ch.rec.groundY;
    for (let y = G + 1; y <= G + 3; y++) if (solid(r.world, dx + o[0], y, dz + o[1])) headBad++;
  }
  check('portal: every church has two pinnacles, a gable of three and a finial, and still verifies', churches >= 3 && portalBad === 0, `${churches} churches, ${portalBad} bad`);
  check('portal: the doorstep keeps its head room', headBad === 0, `${headBad} blocked`);
  note(`shapes: ${JSON.stringify(seen)} · arcades: ${arcaded}/${mids} mid-rises, ${bays} bays · portals: ${churches}`);
}
