// tools/checks/2zg-courtyards-school.js — L- and U-shaped courtyard blocks,
// and the school's lights and bookshelves.
//
// A courtyard block is made of wings, each a whole building, round a court
// that opens onto the street. The wings and the court must partition the
// footprint exactly, every wing must walk through, side wings open onto the
// street and the back wing onto the court, and a path must run from the back
// wing's door to the street. The school is one hall per floor; it must have
// lanterns hung from the ceiling and bookshelves along its side walls, and
// still walk through.
export const id = '2zg';
export const label = '2zg. courtyard blocks, school lights and bookshelves';

export default async function run(ctx) {
  const { check, note } = ctx;
  const { VoxelWorld } = await import('../../engine/blockcore.js');
  const { MAT, THEMES, MATERIALS } = await import('../../engine/materials.js');
  const { makeBuilding } = await import('../../engine/building.js');
  const { courtyardPlan, makeCourtyard, WING_MIN, WING_MAX } = await import('../../engine/courtyard.js');
  const { verifyBuilding, verifyAll } = await import('../../engine/verify.js');
  const { makeRng } = await import('../../engine/rng.js');
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const blk = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block; };
  const solid = (w, x, y, z) => { const id = w.get(x, y, z); return id !== -1 && !MATERIALS.isPassable(id); };
  const OUT = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

  // ---- on flat ground ------------------------------------------------------------
  let joinCount = 0, joinShut = 0, slabGap = 0, endsOpen = 0, parapetLeft = 0, stairBad = 0, slabHole = 0;
  let built = 0, verified = 0, partitionBad = 0, overlap = 0, streetBad = 0, sideDoorBad = 0, backDoorBad = 0, pathBad = 0, flowerBad = 0, lampBad = 0, sameBad = 0;
  const kindsSeen = new Set();
  for (const [W, D] of [[16, 16], [19, 17], [22, 20], [26, 24]]) for (const face of ['south', 'north', 'east', 'west']) for (const kind of ['L', 'U']) for (const mirror of [false, true]) {
    const alongX = face === 'north' || face === 'south';
    const fx0 = 0, fz0 = 0, fx1 = (alongX ? W : D) - 1, fz1 = (alongX ? D : W) - 1;
    const plan = courtyardPlan(fx0, fz0, fx1, fz1, face);
    if (!plan.kinds.includes(kind)) continue;
    if (plan.t < WING_MIN || plan.t > WING_MAX) partitionBad++;
    const w = new VoxelWorld({ budget: 4e6 }); const G = 10;
    for (let z = -3; z <= fz1 + 3; z++) for (let x = -3; x <= fx1 + 3; x++) w.set(x, G, z, MAT.SIDEWALK);
    const rng = makeRng(W * 31 + D + (mirror ? 7 : 0));
    const cy = makeCourtyard(w, { x0: fx0, z0: fz0, x1: fx1, z1: fz1, face, kind, mirror, G,
      building: (p) => makeBuilding(w, { ...p, floors: 4, pitch: 5, groundY: G, style: 'mid', theme: THEMES.mid[W % THEMES.mid.length],
        roofAccess: false, useStairs: true, lights: true, setback: false, setbackEvery: 99 }, rng) }, rng);
    if (!cy) continue;
    built++; kindsSeen.add(kind);
    if (cy.wings.every((b) => verifyBuilding(w, b).ok)) verified++;
    if (cy.wings.length !== (kind === 'U' ? 3 : 2)) partitionBad++;
    // wings + court partition the footprint
    const owner = new Map();
    const claim = (r, tag) => { for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) { const k = x + ',' + z; if (owner.has(k)) overlap++; owner.set(k, tag); } };
    cy.wings.forEach((b, i) => claim(b, 'w' + i));
    claim(cy.court, 'c');
    if (owner.size !== (fx1 - fx0 + 1) * (fz1 - fz0 + 1)) partitionBad++;
    // the court opens onto the street: some court cell lies on the street edge
    const edge = face === 'south' ? (x, z) => z === fz1 : face === 'north' ? (x, z) => z === fz0 : face === 'east' ? (x, z) => x === fx1 : (x, z) => x === fx0;
    let open = false;
    for (let z = cy.court.z0; z <= cy.court.z1; z++) for (let x = cy.court.x0; x <= cy.court.x1; x++) if (edge(x, z)) open = true;
    if (!open) streetBad++;
    // doors: side wings to the street, the back wing to the court
    for (const b of cy.wings) {
      const [ox, , oz] = b.outside;
      if (b.courtyard.role === 'side') { if (b.facing !== face || owner.has(ox + ',' + oz)) sideDoorBad++; }
      else if (owner.get(ox + ',' + oz) !== 'c') backDoorBad++;
    }
    // the path from the back wing's door runs through the court to its street edge
    const back = cy.wings.find((b) => b.courtyard.role === 'back');
    if (!cy.path.length || !edge(...cy.path[cy.path.length - 1]) || cy.path[0][0] !== back.outside[0] || cy.path[0][1] !== back.outside[2]) pathBad++;
    const onPath = new Set(cy.path.map((p) => p.join(',')));
    for (let z = cy.court.z0; z <= cy.court.z1; z++) for (let x = cy.court.x0; x <= cy.court.x1; x++)
      if (onPath.has(x + ',' + z) && w.has(x, G + 1, z)) flowerBad++;
    if (!cy.lamp || !/lantern/.test(blk(w, ...cy.lamp)) || !/fence/.test(blk(w, cy.lamp[0], cy.lamp[1] - 1, cy.lamp[2])) || onPath.has(cy.lamp[0] + ',' + cy.lamp[2])) lampBad++;
    // one stair for the whole block, in the back wing; the others keep every
    // floor, with whole slabs (no stairwell cut through them)
    const withStair = cy.wings.filter((b) => b.core);
    if (withStair.length !== 1 || withStair[0].courtyard.role !== 'back') stairBad++;
    for (const b of cy.wings.filter((x) => !x.core)) {
      if (b.floors !== withStair[0]?.floors) stairBad++;
      for (let k = 1; k < b.floors; k++)
        for (let z = b.z0 + 1; z < b.z1; z++) for (let x = b.x0 + 1; x < b.x1; x++) if (!solid(w, x, b.floorYs[k], z)) slabHole++;
    }
    // one block: one theme, one height
    if (new Set(cy.wings.map((b) => b.themeName)).size !== 1 || new Set(cy.wings.map((b) => b.roofY)).size !== 1) sameBad++;
    // one building inside: every join opened on every floor, floor to ceiling,
    // the two end cells left solid, the slab unbroken under it, the parapet gone
    if (cy.joins.length !== (kind === 'U' ? 2 : 1)) joinCount++;
    for (const j of cy.joins) {
      const a = cy.wings[j.a];
      for (let k = 0; k < a.floors; k++) {
        const sy = a.floorYs[k];
        for (const [[ax, az], [bx, bz]] of j.cells) {
          for (let y = sy + 1; y <= sy + a.pitch - 1; y++) if (w.has(ax, y, az) || w.has(bx, y, bz)) joinShut++;
          if (!solid(w, ax, sy, az) || !solid(w, bx, sy, bz)) slabGap++;
        }
        // the end cells of the join stay wall
        const [[ex0, ez0], [ex1, ez1]] = [j.cells[0][0], j.cells[j.cells.length - 1][0]];
        const step = j.cells.length > 1 ? [Math.sign(ex1 - ex0), Math.sign(ez1 - ez0)] : [0, 0];
        for (const [x, z] of [[ex0 - step[0], ez0 - step[1]], [ex1 + step[0], ez1 + step[1]]]) if (!solid(w, x, sy + 2, z) && !/glass/.test(blk(w, x, sy + 2, z))) endsOpen++;
      }
      for (const [[ax, az], [bx, bz]] of j.cells) for (const [x, z] of [[ax, az], [bx, bz]]) if (w.has(x, a.roofY + 1, z)) parapetLeft++;
    }
  }
  check('courtyards: L and U built on every lot that fits, all four facings, both hands', built >= 40 && kindsSeen.size === 2, `${built} built`);
  check('courtyards: every wing walks through (the side wings up the back wing\'s stair)', verified === built, `${verified}/${built}`);
  check('courtyards: wings and court fill the footprint exactly, without overlap', partitionBad === 0 && overlap === 0, `${partitionBad} bad, ${overlap} overlaps`);
  check('courtyards: the court always opens onto the street', streetBad === 0, `${streetBad}`);
  check('courtyards: side wings open onto the street, the back wing onto the court', sideDoorBad === 0 && backDoorBad === 0, `${sideDoorBad} side, ${backDoorBad} back`);
  check('courtyards: a path from the back wing\'s door to the street, nothing standing on it', pathBad === 0 && flowerBad === 0, `${pathBad} paths, ${flowerBad} blocked`);
  check('courtyards: a lantern post in the court, off the path', lampBad === 0, `${lampBad}`);
  check('courtyards: one block, one theme and one height', sameBad === 0, `${sameBad}`);
  check('courtyards: no wall between wings: every join open on every floor, floor to ceiling', joinCount === 0 && joinShut === 0, `${joinCount} missing joins, ${joinShut} cells still shut`);
  check('courtyards: the floor runs on under every opening, and the join\'s end cells stay solid', slabGap === 0 && endsOpen === 0, `${slabGap} gaps, ${endsOpen} open ends`);
  check('courtyards: no parapet left over a join', parapetLeft === 0, `${parapetLeft}`);
  check('courtyards: one stair for the whole block, in the back wing', stairBad === 0, `${stairBad}`);
  check('courtyards: the stairless wings keep every floor, their slabs whole', slabHole === 0, `${slabHole} holes`);

  // ---- in cities ------------------------------------------------------------------------
  const kinds = {};
  let cityOk = true, courts = 0, blockedJoins = 0;
  // (a U needs a lot 21 across the street face, three wings of seven: most
  // mid-rise lots are 10 to 16, so U blocks are rare at the default lot size;
  // two of these cities have bigger lots, and seed 1 has one at the default)
  for (const c of [{ seed: 12345, size: 192 }, { seed: 31, size: 192, cityStyle: 'medieval' }, { seed: 9, size: 224, cityStyle: 'cherry', lotSuburb: 26, lotDowntown: 24 },
    { seed: 3, size: 192, hills: 3 }, { seed: 5, size: 192, lotSuburb: 26, lotDowntown: 24 }, { seed: 1, size: 192 }]) {
    const r = generateCity({ ...DEFAULTS, ...c, courtyardChance: 1 });
    const v = verifyAll(r.world, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked || r.reach.unreached.length) cityOk = false;
    for (const cy of r.courtyards) {
      courts++; kinds[cy.kind] = (kinds[cy.kind] || 0) + 1;
      // furnished, the way through every join is still clear on every floor
      for (const j of cy.joins) {
        const a = cy.wings[j.a];
        for (let k = 0; k < a.floors; k++) {
          const y = a.floorYs[k] + 1;
          const through = j.cells.some(([[ax, az], [bx, bz]]) => {
            const dx = Math.sign(bx - ax) || 0, dz = Math.sign(bz - az) || 0;
            const line = [[ax - dx, az - dz], [ax, az], [bx, bz], [bx + dx, bz + dz]];
            return line.every(([x, z]) => !solid(r.world, x, y, z) && !solid(r.world, x, y + 1, z) && solid(r.world, x, y - 1, z));
          });
          if (!through) blockedJoins++;
        }
      }
    }
    if (JSON.stringify(r.stats.courtyards) !== JSON.stringify(r.courtyards.map((c2) => c2.kind))) cityOk = false;
  }
  check('cities: L and U courtyard blocks both turn up', kinds.L > 0 && kinds.U > 0, JSON.stringify(kinds));
  check('cities: furnished, you can walk straight through every join on every floor', blockedJoins === 0, `${blockedJoins} floors blocked`);
  check('cities: with courtyards, every building walks through and every door is reached (hills too)', cityOk);
  check('cities: courtyard chance 0 -> none', generateCity({ ...DEFAULTS, seed: 12345, size: 192, courtyardChance: 0 }).courtyards.length === 0);
  const s1 = generateCity({ ...DEFAULTS, seed: 7, size: 192, courtyardChance: 1 }), s2 = generateCity({ ...DEFAULTS, seed: 7, size: 192, courtyardChance: 1 });
  check('cities: same seed, same courtyard blocks', JSON.stringify(s1.courtyards.map((c2) => [c2.kind, c2.court])) === JSON.stringify(s2.courtyards.map((c2) => [c2.kind, c2.court])));

  // ---- the school -----------------------------------------------------------------------
  let schools = 0, dark = 0, bookless = 0, hangBad = 0, shelfWallBad = 0, schoolBad = 0;
  for (const c of [{ seed: 7, size: 192 }, { seed: 12345, size: 192 }, { seed: 3, size: 224 }, { seed: 31, size: 192, cityStyle: 'medieval' }]) {
    const r = generateCity({ ...DEFAULTS, ...c });
    const L = r.landmarks.find((l) => l.kind === 'school');
    if (!L) continue;
    schools++;
    const b = L.rec, w = r.world;
    if (!verifyBuilding(w, b).ok) schoolBad++;
    const o = OUT[b.facing];
    for (let k = 0; k < b.floors; k++) {
      const rr = b.rects[k], sy = b.floorYs[k], cy = sy + b.pitch - 1;
      let lights = 0, stacks = 0;
      for (let z = rr.z0 + 1; z < rr.z1; z++) for (let x = rr.x0 + 1; x < rr.x1; x++) {
        if (/lantern/.test(blk(w, x, cy, z))) {
          lights++;
          if (!solid(w, x, cy + 1, z)) hangBad++;
          if (b.core && x >= b.core.x0 - 1 && x <= b.core.x1 + 1 && z >= b.core.z0 - 1 && z <= b.core.z1 + 1) hangBad++;
        }
        if (/bookshelf/.test(blk(w, x, sy + 1, z)) && /bookshelf/.test(blk(w, x, sy + 2, z))) {
          stacks++;
          // never against the front (door) wall
          if ((o[1] === 1 && z === rr.z1 - 1) || (o[1] === -1 && z === rr.z0 + 1) || (o[0] === 1 && x === rr.x1 - 1) || (o[0] === -1 && x === rr.x0 + 1)) shelfWallBad++;
          // never in front of the board (deepslate behind it)
          for (const [a, c2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (/deepslate/.test(blk(w, x + a, sy + 2, z + c2))) shelfWallBad++;
        }
      }
      if (lights < 2) dark++;
      if (stacks < 2) bookless++;
    }
    if (!b.furniture || !(b.furniture.lights > 0) || !(b.furniture.shelves > 0)) bookless++;
  }
  check('school: found to check', schools >= 3, String(schools));
  check('school: every floor lit (2+ lanterns)', dark === 0, `${dark} dark floors`);
  check('school: lanterns hang from solid ceiling, clear of the stair', hangBad === 0, `${hangBad}`);
  check('school: every floor has bookshelves (2+ stacks, two high)', bookless === 0, `${bookless}`);
  check('school: no shelf against the door wall or in front of the board', shelfWallBad === 0, `${shelfWallBad}`);
  check('school: furnished, it still walks through', schoolBad === 0, `${schoolBad}`);
  note(`courtyards: ${built} on flat ground, ${courts} in cities ${JSON.stringify(kinds)} · schools: ${schools}`);
}
