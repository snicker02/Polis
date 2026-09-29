// tools/checks/2zj-fortress-dome.js — the walled fortress town and the dome.
//
// Fortress: a curtain wall three thick and at least nine high on the three
// outermost rings (never over a building), a walk along its top with merlons,
// towers standing out from it with rooms and doors onto the walk, a gatehouse
// at every gate with a passage right through, steps up to the walk, the keep
// at the heart of the town and the market square near it.
// Dome: sealed (air cannot get from outside to inside block by block), clear
// of every block in the city by three, standing on whole ground, with doors you
// can walk through. And the voxel store now keeps blocks west and north of the
// plan's edge, where a dome and a fortress's towers reach.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zj';
export const label = '2zj. walled fortress town, dome';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MATERIALS, MAT } = await import('../../engine/materials.js');
  const { VoxelWorld } = await import('../../engine/blockcore.js');
  const { STYLE_NAMES } = await import('../../engine/styles.js');
  const blk = (w, x, y, z) => { const id = w.get(x, y, z); return id < 0 ? 'air' : MATERIALS.def(id).block; };
  const solid = (w, x, y, z) => { const id = w.get(x, y, z); return id !== -1 && !MATERIALS.isPassable(id); };
  const G = 1;

  // ---- the voxel store west and north of the plan -----------------------------
  {
    const w = new VoxelWorld({ budget: 1000 });
    const pts = [[-1, 5, -1], [-512, -64, -512], [1535, 959, 1535], [-20, 30, 400], [0, 0, 0]];
    for (const [x, y, z] of pts) w.set(x, y, z, 7);
    const back = []; w.forEach((x, y, z) => back.push([x, y, z].join(',')));
    check('voxels: blocks west and north of the plan are kept, and come back where they were',
      pts.every(([x, y, z]) => w.get(x, y, z) === 7) && JSON.stringify(back) === JSON.stringify(pts.map((p) => p.join(','))) && w.box.x0 === -512);
  }

  // ---- the fortress ---------------------------------------------------------------------
  check('fortress: a style of its own, offered in the page', STYLE_NAMES.includes('fortress') && /value="fortress"/.test(readFileSync(join(ROOT, 'index.html'), 'utf8')));
  let cities = 0, cityOk = true, thin = 0, buried = 0, walkGap = 0, merlons = 0, gates = 0, passBad = 0, gatehouseBad = 0;
  let towers = 0, towerBad = 0, outward = 0, flights = 0, flightBad = 0, keepFar = 0, marketFar = 0, oversize = 0;
  for (const [seed, size] of [[7, 160], [12345, 224], [99, 160]]) {
    const r = generateCity({ ...DEFAULTS, seed, size, cityStyle: 'fortress' });
    cities++;
    const w = r.world, wall = r.wall, h = wall.height, { W, D, mask } = r.plan;
    const v = verifyAll(w, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked || r.reach.unreached.length) cityOk = false;
    if (h < 9 || wall.thickness !== 3 || r.cfg.transit !== 'roads') thin++;
    if (Math.max(...r.buildings.filter((b) => !b.landmark).map((b) => b.floors)) > 6) oversize++;
    // depth of each city cell from the edge
    const inCity = (x, z) => x >= 0 && z >= 0 && x < W && z < D && mask[z * W + x] === 1;
    const depth = new Map(); let fr = [];
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      if (!inCity(x, z)) continue;
      let e = false; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (!inCity(x + a, z + b)) e = true;
      if (e) { depth.set(x + ',' + z, 0); fr.push([x, z]); }
    }
    for (let d = 1; d <= 3; d++) { const nx = []; for (const [x, z] of fr) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const k = (x + a) + ',' + (z + b); if (inCity(x + a, z + b) && !depth.has(k)) { depth.set(k, d); nx.push([x + a, z + b]); } } fr = nx; }
    const gateCells = new Set(); for (const g of wall.gates) for (const [a, b] of g.cells) for (let k = 0; k < 3; k++) { const o = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }[g.face]; gateCells.add((a - o[0] * k) + ',' + (b - o[1] * k)); }
    const stairCells = new Set(); for (const st of wall.stairs) { for (const [x, , z] of st.steps) stairCells.add(x + ',' + z); stairCells.add(st.foot[0] + ',' + st.foot[2]); }
    const towerCells = new Set(); for (const t of wall.towers) for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) towerCells.add((t.at[0] + t.along[0] * a + t.out[0] * b) + ',' + (t.at[2] + t.along[1] * a + t.out[1] * b));
    for (const [k, d] of depth) {
      if (d >= 3) continue;
      const [x, z] = k.split(',').map(Number);
      if (gateCells.has(k) || stairCells.has(k) || towerCells.has(k)) continue;
      for (let y = G; y < G + h; y++) if (!solid(w, x, y, z)) { thin++; break; }
      if (!solid(w, x, G + h, z) || solid(w, x, G + h + 2, z)) walkGap++;
      if (d === 0 && solid(w, x, G + h + 1, z)) merlons++;
    }
    for (const b of r.buildings) for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) { const d = depth.get(x + ',' + z); if (d !== undefined && d < 3) buried++; }
    // gates: a passage through all three rings, doors on the outer face, two gatehouse towers
    for (const g of wall.gates) {
      gates++;
      const o = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] }[g.face];
      for (const [a, b] of g.cells) {
        if (!/door/.test(blk(w, a, G + 1, b))) passBad++;
        for (let k = 1; k < 3; k++) for (let y = G + 1; y <= G + 3; y++) if (solid(w, a - o[0] * k, y, b - o[1] * k)) passBad++;
        const [ix, iz] = [a - o[0] * 3, b - o[1] * 3];
        if (!solid(w, ix, G, iz) || solid(w, ix, G + 1, iz) || solid(w, ix, G + 2, iz)) passBad++;
        if (solid(w, a + o[0], G + 1, b + o[1]) || solid(w, a + o[0], G + 2, b + o[1])) passBad++;
      }
      if (g.towers.length !== 2) gatehouseBad++;
    }
    // towers: a room at walk height, doors onto the walk either side, the outward part standing
    for (const t of wall.towers) {
      towers++;
      const [cx, ty, cz] = t.at, top = G + h;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let y = top + 1; y <= top + 2; y++) {
        const x = cx + t.along[0] * a + t.out[0] * b, z = cz + t.along[1] * a + t.out[1] * b;
        if (solid(w, x, y, z) && !/lantern|iron_bars/.test(blk(w, x, y, z))) towerBad++;
      }
      for (const a of [2, -2]) {
        const x = cx + t.along[0] * a + t.out[0], z = cz + t.along[1] * a + t.out[1];
        if (!/door/.test(blk(w, x, top + 1, z))) towerBad++;
      }
      const ox = cx - t.out[0] * 2, oz = cz - t.out[1] * 2;         // the outermost row, beyond the wall's face
      if (solid(w, ox, top, oz) && solid(w, ox, G + 1, oz)) outward++;
    }
    // steps to the walk: one block a step, head room over each, the top at the walk
    for (const st of wall.stairs) {
      flights++;
      st.steps.forEach(([x, y, z], i) => {
        if (!/stairs/.test(blk(w, x, y, z)) || y !== G + 1 + i) flightBad++;
        for (let hy = 1; hy <= 2; hy++) if (solid(w, x, y + hy, z)) flightBad++;
      });
      const [fx, fy, fz] = st.foot;
      if (!solid(w, fx, fy - 1, fz) || solid(w, fx, fy, fz) || solid(w, fx, fy + 1, fz)) flightBad++;
      if (st.steps[st.steps.length - 1][1] !== G + h) flightBad++;
    }
    // the keep at the heart, the market near it
    const [fx, fz] = r.plan.focal;
    const dist = (L) => (L ? Math.hypot((L.lot.x0 + L.lot.x1) / 2 - fx, (L.lot.z0 + L.lot.z1) / 2 - fz) : Infinity);
    if (dist(r.landmarks.find((l) => l.kind === 'castle')) > 18) keepFar++;
    if (dist(r.landmarks.find((l) => l.kind === 'market')) > 30) marketFar++;
  }
  check('fortress: every building walks through and every door is reached', cityOk);
  check('fortress: the wall is three thick, nine high or more, solid, and the town low with no trams', thin === 0 && oversize === 0, `${thin} thin, ${oversize} too tall`);
  check('fortress: no building under the wall', buried === 0, `${buried} cells`);
  check('fortress: a walk along the whole top, merlons on its outer edge', walkGap === 0 && merlons > 100, `${walkGap} gaps, ${merlons} merlons`);
  check('fortress: a gate on each side, a passage right through, doors on the outer face', gates === 4 * cities && passBad === 0, `${gates} gates, ${passBad} bad`);
  check('fortress: a gatehouse tower either side of every gate', gatehouseBad === 0, `${gatehouseBad}`);
  check('fortress: towers along the wall, each a room with doors onto the walk', towers >= 15 * cities && towerBad === 0, `${towers} towers, ${towerBad} bad`);
  check('fortress: towers stand out from the wall\'s face (their outer part is really built)', outward === towers, `${outward}/${towers}`);
  check('fortress: steps up to the walk, a block a step, head room, from a foot at street level', flights >= cities && flightBad === 0, `${flights} flights, ${flightBad} bad`);
  check('fortress: the keep at the heart of the town, the market square near it', keepFar === 0 && marketFar === 0, `${keepFar} keeps far, ${marketFar} markets far`);

  // ---- the dome -----------------------------------------------------------------------
  check('dome: off by default', DEFAULTS.dome === false);
  let domes = 0, leaks = 0, tight = 0, skipped = 0, groundHoles = 0, doorBad = 0, ribless = 0, crown = 0, notNylium = 0;
  for (const c of [{ seed: 7, size: 160 }, { seed: 3, size: 160, cityStyle: 'fortress' }, { seed: 5, size: 128, cityStyle: 'nether' }]) {
    const r = generateCity({ ...DEFAULTS, ...c, dome: true });
    const d = r.dome, w = r.world;
    domes++;
    const v = verifyAll(w, r.buildings);
    if (v.ok !== v.total || r.reach.unreached.length) leaks += 1000;
    skipped += d.skipped;
    if (d.ribs === 0) ribless++;
    // sealed: flood the air from outside, block to block, doors counting as walls
    const x0 = Math.floor(d.cx - d.R) - 3, x1 = Math.ceil(d.cx + d.R) + 3, z0 = Math.floor(d.cz - d.R) - 3, z1 = Math.ceil(d.cz + d.R) + 3, y0 = G + 1, y1 = G + d.c + 3;
    const nX = x1 - x0 + 1, nZ = z1 - z0 + 1;
    const seen = new Uint8Array(nX * nZ * (y1 - y0 + 1));
    const key = (x, y, z) => ((y - y0) * nZ + (z - z0)) * nX + (x - x0);
    const F = (x, y, z) => ((x - d.cx) ** 2 + (z - d.cz) ** 2) / d.R ** 2 + ((y - G) / d.c) ** 2;
    const q = [[x0, y1, z0]]; seen[key(x0, y1, z0)] = 1;
    while (q.length) {
      const [x, y, z] = q.pop();
      if (F(x, y, z) < 0.85) { leaks++; break; }
      for (const [a, b, e] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const nx = x + a, ny = y + b, nz = z + e;
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || nz < z0 || nz > z1) continue;
        const k = key(nx, ny, nz); if (seen[k] || w.get(nx, ny, nz) !== -1) continue;
        seen[k] = 1; q.push([nx, ny, nz]);
      }
    }
    // clear of every block by three: each column's top block (not the dome's own) three under the surface
    const domeIds = new Set([MAT.GLASS, MAT.QUARTZ, MAT.GLOWSTONE]);
    const tops = new Map();
    w.forEach((x, y, z, id) => { if (y > G && !domeIds.has(id) && !/door/.test(MATERIALS.def(id).block)) { const k = x + ',' + z; if (!(tops.get(k) >= y)) tops.set(k, y); } });
    for (const [k, y] of tops) { const [x, z] = k.split(',').map(Number); if (F(x, y + 3, z) > 1 + 1e-9) tight++; }
    // whole ground under the dome
    for (let z = Math.floor(d.cz - d.R) + 2; z <= Math.ceil(d.cz + d.R) - 2; z++) for (let x = Math.floor(d.cx - d.R) + 2; x <= Math.ceil(d.cx + d.R) - 2; x++)
      if ((x - d.cx) ** 2 + (z - d.cz) ** 2 < (d.R - 2) ** 2 && !w.has(x, G, z)) groundHoles++;
    // doors: four, each with standing room outside and inside
    if (d.doors.length !== 4) doorBad++;
    for (const dr of d.doors) for (const [x, z] of dr.cells) {
      const [ox, oz] = dr.out;
      if (!/door/.test(blk(w, x, G + 1, z)) || !solid(w, x, G + 3, z)) doorBad++;
      for (const s of [1, -1]) { const nx = x + ox * s, nz = z + oz * s; if (!solid(w, nx, G, nz) || solid(w, nx, G + 1, nz) || solid(w, nx, G + 2, nz)) doorBad++; }
    }
    let glow = 0; w.forEach((x, y, z, id) => { if (id === MAT.GLOWSTONE && y === d.top - 0 || (id === MAT.GLOWSTONE && y >= G + d.c - 1)) glow++; });
    if (glow > 0) crown++;
    if (c.cityStyle === 'nether') {
      // the ground laid under the dome is the style's own (nylium, not grass)
      const [ex, ez] = [Math.round(d.cx + d.R - 2), Math.round(d.cz)];
      if (!/crimson_nylium|blackstone/.test(blk(w, ex, G, ez))) notNylium++;
    }
  }
  check('dome: sealed: nothing gets from outside to inside block by block (doors shut)', leaks === 0, `${leaks}`);
  check('dome: every block in the city has three clear under it', tight === 0, `${tight} columns too tight`);
  check('dome: built only into empty air, never over a block', skipped === 0, `${skipped}`);
  check('dome: whole ground under it', groundHoles === 0, `${groundHoles} holes`);
  check('dome: four doors, each walkable in and out', doorBad === 0, `${doorBad}`);
  check('dome: ribs of quartz and a glowstone crown', ribless === 0 && crown === domes, `${ribless} ribless, ${crown}/${domes} crowns`);
  check('dome: the ground laid under it is the style\'s own', notNylium === 0, `${notNylium}`);
  const off = generateCity({ ...DEFAULTS, seed: 7, size: 160 });
  check('dome: none unless asked for', off.dome === null);
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8'), main = readFileSync(join(ROOT, 'main.js'), 'utf8');
  check('page: a Glass dome checkbox, unchecked, read into the config', /<input type="checkbox" id="dome">/.test(html) && /const CHECKS = \[[^\]]*'dome'/.test(main));
  note(`fortress: ${gates} gates, ${towers} towers, ${flights} wall stairs over ${cities} towns · domes: ${domes}`);
}
