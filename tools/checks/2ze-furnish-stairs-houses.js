// tools/checks/2ze-furnish-stairs-houses.js — three fixes from playing a city.
//
//  * Twisting towers were empty: furniture follows a ring inside each floor,
//    and a tower's reference square hugs the stair core, whose surroundings
//    are kept clear. The tower now hands furnish() a ring of its own, just
//    inside each turned floor's walls.
//  * Terrace stairs must face straight in and be entered head on. Flights ran
//    along the kerb (you stepped onto the side of the first stair, which
//    villagers will not climb) because the check for "does this flight climb
//    anything" looked at the wrong cell and threw out every straight flight on
//    a terrace two or three high. Straight flights, then stoops from the road;
//    a flight along the kerb only where nothing straight fits, and then with a
//    street-level notch at its foot.
//  * Small houses get shutters, lintels, sills, window boxes, flower beds, a
//    door hood with a lantern, and a picket fence open at the path.
export const id = '2ze';
export const label = '2ze. furnished twisting towers, head-on stairs, house detail';

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyBuilding, verifyAll } = await import('../../engine/verify.js');
  const { MATERIALS, MAT, FLOWERS } = await import('../../engine/materials.js');
  const blk = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block; };
  const solid = (w, x, y, z) => { const id = w.get(x, y, z); return id !== -1 && !MATERIALS.isPassable(id); };
  const STRUCTURE = /stairs|door|glass|concrete|quartz|iron_block|smooth_stone|deepslate|lantern|terracotta|sandstone|planks|bricks|calcite/;

  // ---- twisting towers, furnished -----------------------------------------------
  let towers = 0, floorsAll = 0, bareFloors = 0, beds = 0, badBed = 0, ringBad = 0, stillOk = 0;
  for (const c of [{ seed: 7, size: 192 }, { seed: 5, size: 160, cityStyle: 'desert' }, { seed: 12, size: 192 }]) {
    const r = generateCity({ ...DEFAULTS, ...c, twistChance: 1 });
    const w = r.world;
    for (const t of r.buildings.filter((b) => b.twist)) {
      towers++;
      if (verifyBuilding(w, t).ok) stillOk++;
      for (let k = 0; k < t.floors; k++) {
        floorsAll++;
        const y = t.floorYs[k] + 1, plate = t.plates[k];
        let pieces = 0;
        for (const key of plate) {
          const [x, z] = key.split(',').map(Number);
          if (x >= t.core.x0 - 1 && x <= t.core.x1 + 1 && z >= t.core.z0 - 1 && z <= t.core.z1 + 1) continue;
          const b = blk(w, x, y, z);
          if (b !== 'air' && !STRUCTURE.test(b)) pieces++;
        }
        if (pieces < 3) bareFloors++;
        // the ring: inside the floor, off the wall, next to it, facing in, and a
        // side only ever runs along one straight stretch
        const ring = t.furnishRing(k);
        const inPlate = (x, z) => plate.has(x + ',' + z);
        const isWall = (x, z) => inPlate(x, z) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !inPlate(x + a, z + b));
        ring.forEach(([x, z, nx, nz, side], i) => {
          if (!inPlate(x, z) || isWall(x, z) || !isWall(x - nx, z - nz) || !inPlate(x + nx, z + nz)) ringBad++;
          const p = ring[i - 1];
          if (p && p[4] === side && (Math.abs(p[0] - x) + Math.abs(p[1] - z) !== 1 || p[2] !== nx || p[3] !== nz)) ringBad++;
        });
      }
      for (const bd of (t.furniture && t.furniture.beds) || []) {
        beds++;
        const [fx, , fz] = bd.foot, [hx, , hz] = bd.head;
        if (Math.abs(fx - hx) + Math.abs(fz - hz) !== 1 || !t.plates[bd.floor].has(fx + ',' + fz) || !t.plates[bd.floor].has(hx + ',' + hz)) badBed++;
      }
    }
  }
  check('towers: twisting towers found to furnish', towers >= 3, String(towers));
  check('towers: every floor of every twisting tower is furnished (3+ pieces)', bareFloors === 0, `${bareFloors}/${floorsAll} bare`);
  check('towers: they have beds, so villagers live there', beds > 0, String(beds));
  check('towers: every bed is two halves side by side, both on the floor', badBed === 0, `${badBed} bad`);
  check('towers: the furnishing ring hugs each turned wall, facing in', ringBad === 0, `${ringBad} bad cells`);
  check('towers: furnished, every tower still walks through', stillOk === towers, `${stillOk}/${towers}`);

  // ---- terrace stairs: straight in, entered head on ---------------------------------
  const kinds = {};
  let runs = 0, entryBad = 0, facingOut = 0, noStairs = 0, unreached = 0, doors = 0, footBlocked = 0;
  for (const seed of [1, 2, 7, 8, 12345, 99]) {
    const r = generateCity({ ...DEFAULTS, seed, size: 160, hills: 3 });
    const w = r.world;
    for (const b of r.hills.blocks) if (b.e && !r.stairRuns.some((s) => s.block === b)) noStairs++;
    unreached += r.reach.unreached.length; doors += r.reach.total;
    for (const run of r.stairRuns) {
      runs++; kinds[run.kind] = (kinds[run.kind] || 0) + 1;
      if (run.kind !== 'along' && (run.dir[0] !== -run.out[0] || run.dir[1] !== -run.out[1])) facingOut++;
      const [x0, z0] = run.cells[0];
      const fx = x0 - run.dir[0], fz = z0 - run.dir[1];
      if (!(solid(w, fx, 1, fz) && !solid(w, fx, 2, fz) && !solid(w, fx, 3, fz))) entryBad++;
      // and the foot joins the rest of the street: some other neighbour a villager
      // can walk to (level, or a block up or down), not only the first step
      const stand = (x, y, z) => solid(w, x, y - 1, z) && !solid(w, x, y, z) && !solid(w, x, y + 1, z);
      const onward = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => {
        const nx = fx + a, nz = fz + b;
        if (nx === x0 && nz === z0) return false;
        return [1, 2, 3].some((y) => stand(nx, y, nz));
      });
      if (!onward) footBlocked++;
    }
  }
  const straightIn = (kinds.straight || 0) + (kinds.stoop || 0);
  check('stairs: at least 98% of flights climb straight in from the street', straightIn >= runs * 0.98, `${straightIn}/${runs} (${JSON.stringify(kinds)})`);
  check('stairs: every straight flight and stoop faces the street', facingOut === 0, `${facingOut}`);
  check('stairs: every flight is entered head on, from standing room at its foot', entryBad === 0, `${entryBad}/${runs}`);
  check('stairs: the foot of every flight joins the rest of the street', footBlocked === 0, `${footBlocked} cut off`);
  check('stairs: every raised block still has a staircase, every door is reachable', noStairs === 0 && unreached === 0, `${noStairs} blocks without, ${unreached}/${doors} doors`);

  // ---- house detail ---------------------------------------------------------------------
  let houses = 0, noShutter = 0, lintelBad = 0, hoodBad = 0, lanternBad = 0, gateLanterns = 0, boxLow = 0, bedOff = 0, fenceOnPath = 0, fenced = 0, fencePosts = 0;
  // (a village too: mostly houses, so the sample stays big whatever else the cities draw)
  const cities = [{ seed: 12345, size: 160 }, { seed: 9, size: 160, cityStyle: 'cherry' }, { seed: 31, size: 160, cityStyle: 'medieval' }, { seed: 4, size: 160, cityStyle: 'desert' }, { seed: 5, size: 160, cityStyle: 'village' }];
  let allOk = true;
  for (const c of cities) {
    const r = generateCity({ ...DEFAULTS, ...c });
    const w = r.world;
    const v = verifyAll(w, r.buildings);
    if (v.ok !== v.total || r.reach.unreached.length) allOk = false;
    for (const h of r.buildings.filter((b) => b.style === 'house' && !b.landmark)) {
      houses++;
      const hd = h.houseDetail;
      if (!hd) { noShutter++; continue; }
      if (hd.shutters === 0 && h.windows > 0) noShutter++;
      if (hd.lintels === 0 && h.windows > 0) lintelBad++;
      // the hood: three stairs a block out, at gy + 4, so the step out of the
      // door keeps its head room even when the way out is a block up
      const [dx, dz] = h.doorCells[0], o = h.door.out;
      if (h.groundY + 4 < h.roofY && hd.hood !== 3) hoodBad++;
      if (solid(w, dx + o[0], h.groundY + 3, dz + o[1])) hoodBad++;
      // gate lanterns stand on fence posts, never where anyone walks
      for (const [x, y, z] of (h.fence && h.fence.lanterns) || []) {
        if (!/lantern/.test(blk(w, x, y, z)) || !/fence/.test(blk(w, x, y - 1, z))) lanternBad++;
      }
      if (h.fence) gateLanterns += h.fence.lanterns.length;
      // window boxes only on upper floors (above the ground floor's ceiling),
      // flower beds only on the yard's grass
      const P = h.pitch;
      for (let y = h.groundY + 1; y < h.roofY; y++)
        for (let z = h.z0 - 1; z <= h.z1 + 1; z++) for (let x = h.x0 - 1; x <= h.x1 + 1; x++) {
          const onEdge = x === h.x0 - 1 || x === h.x1 + 1 || z === h.z0 - 1 || z === h.z1 + 1;
          if (!onEdge) continue;
          const id = w.get(x, y, z);
          if (id === MAT.PLANTER && y < h.groundY + P) boxLow++;
          if (FLOWERS.includes(id) && y === h.groundY + 1 && w.get(x, h.groundY, z) !== MAT.GRASS) bedOff++;
        }
      // the fence: only on the street edge of the lot, never across the path
      if (h.fence) {
        fenced++;
        fencePosts += h.fence.posts;
        for (const [x, z] of h.fence.cells) {
          if (blk(w, x, h.groundY, z) === 'minecraft:sandstone' && /fence/.test(blk(w, x, h.groundY + 1, z))) fenceOnPath++;
        }
      }
    }
  }
  check('houses: found to check', houses >= 10, String(houses));
  check('houses: every house with windows has shutters, lintels and sills', noShutter === 0 && lintelBad === 0, `${noShutter} without shutters, ${lintelBad} without lintels`);
  check('houses: a three-stair hood over every front door, clear of the head room outside it', hoodBad === 0, `${hoodBad} bad`);
  check('houses: lanterns on the gate posts either side of the path', gateLanterns > 0 && lanternBad === 0, `${gateLanterns} lanterns, ${lanternBad} loose`);
  check('houses: window boxes only above the ground floor', boxLow === 0, `${boxLow} low`);
  check('houses: flower beds stand on the yard\'s grass', bedOff === 0, `${bedOff} off grass`);
  check('houses: picket fences, never across the path', fenced > 0 && fencePosts > 0 && fenceOnPath === 0, `${fenced} fenced, ${fencePosts} posts, ${fenceOnPath} on the path`);
  check('houses: with all this, every building verifies and every door is reachable', allOk);
  {
    const r = generateCity({ ...DEFAULTS, seed: 12345, size: 160, detail: false });
    const hs = r.buildings.filter((b) => b.style === 'house' && !b.landmark);
    check('houses: with Detail off, no house detail and no fences', hs.every((h) => !h.houseDetail && !h.fence));
  }
  note(`twisting towers: ${towers} furnished, ${beds} beds · stairs: ${JSON.stringify(kinds)} · houses: ${houses}, ${fencePosts} fence posts`);
}
