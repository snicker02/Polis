// engine/city.js — turns a plan into blocks.

import { VoxelWorld } from './blockcore.js';
import { makeRng, fbm2, clamp } from './rng.js';
import { generatePlan, frontage, USE } from './plan.js';
import { MAT, THEMES } from './materials.js';
import { makeBuilding, OUTWARD } from './building.js';
import { doorId, DIR, MATERIALS } from './materials.js';
import { farm, pond, scatterFlowers, furnish, bedSpawns, placeBell, golemSpawns, ranch, pandaGrove, catSpawns, RANCH_ANIMALS } from './life.js';
import { layTransit, trimOverRails, edgeDistance } from './transit.js';
import { planCanal, buildCanal, USE_CANAL } from './water.js';
import { chooseLandmarks, buildLandmark } from './landmarks.js';
import { planHills, liftBlocks, cutStairs, shiftBuilding, walkCity } from './terrain.js';
import { styleOf, remapTable } from './styles.js';
import { FLOWERS } from './materials.js';

export const DEFAULTS = {
  seed: 12345,
  size: 128,
  focal: [0.5, 0.5],
  downtownRadius: 0.34,
  zoneNoise: 1.0,
  maxFloors: 18,
  pitch: 5,
  minBlock: 16,
  maxDepth: 8,
  avenueWidth: 7,
  streetWidth: 5,
  alleyWidth: 3,
  sidewalk: 2,
  lotDowntown: 20,
  lotSuburb: 10,
  blockIrregularity: 0.8,
  parkChance: 0.12,
  setback: true,
  setbackEvery: 7,
  roofAccess: true,
  useStairs: true,
  stairStyle: 'mixed',
  cityStyle: 'modern',       // modern | desert | snowy | cherry | medieval
  outline: 'organic',        // 'organic' (lobed outline along the street grid) | 'square'
  hills: 2,                  // city blocks raised 0..hills blocks on gentle terraces, with steps
  canal: true,               // a canal through the city, with bridges and a dock
  landmarks: true,           // town hall, clock tower, library, market square near downtown
  transit: 'roads',
  wallHeight: 3,             // perimeter wall, blocks above ground (0 = none)          // 'roads' | 'rails' (railway instead of roads) | 'trams' (rails down the roads)
  farmChance: 0.2,
  ranchChance: 0.1,          // suburban lots that become animal pens
  pandaChance: 0.35,         // parks that get a fenced bamboo grove with pandas
  cats: true,
  pondChance: 0.5,
  furnish: true,
  flowers: true,
  villagers: 60,
  golemsPer10: 3,            // iron golems per 10 villagers
  golemMax: 60,
  lights: true,
  lamps: true,
  trees: true,
  markings: true,
  budget: 4000000,
};

const GROUND = 1;   // surface layer; players walk at GROUND+1

// the style in force while a city is being generated (trees read it)
let STYLE = styleOf('modern');

export function generateCity(cfgIn, onProgress) {
  const cfg = { ...DEFAULTS, ...cfgIn };
  STYLE = styleOf(cfg.cityStyle);
  const rng = makeRng(cfg.seed);
  const plan = generatePlan(cfg, rng);
  const world = new VoxelWorld({ budget: cfg.budget });
  const W = plan.W, D = plan.D;
  // organic cities carry their outline, so the export leaves the land outside it alone
  if (cfg.outline === 'organic') world.cityMask = { W, D, data: plan.mask };
  // the canal takes over one long street before anything is laid on it
  const canal = planCanal(plan, cfg, edgeDistance(plan));
  const at = (x, z) => z * W + x;

  // ---- base + surface ------------------------------------------------------
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      const u = plan.use[at(x, z)];
      if (u === USE.EMPTY && plan.mask && cfg.outline === 'organic') continue;   // outside the city: leave the land alone
      world.set(x, 0, z, MAT.BASE);
      let surf = MAT.GRASS;
      if (u === USE.ROAD) surf = MAT.ASPHALT;
      else if (u === USE.SIDEWALK) surf = MAT.SIDEWALK;
      else if (u === USE.PLAZA) surf = MAT.PATH;
      else if (u === USE.LOT) surf = MAT.GRASS;
      world.set(x, GROUND, z, surf);
    }
  }

  // ---- road markings -------------------------------------------------------
  if (cfg.markings && cfg.transit !== 'rails') {
    for (const c of plan.corridors) {
      if (c.w < 5) continue;
      if (c.axis === 'x') {
        const cz = Math.floor((c.z0 + c.z1) / 2);
        for (let x = Math.max(0, c.x0); x <= Math.min(W - 1, c.x1); x++) {
          if (plan.roadAxis[at(x, cz)] !== 1 || plan.use[at(x, cz)] !== USE.ROAD) continue;   // not past the outline
          if (x % 4 < 2) world.set(x, GROUND, cz, MAT.LINE);
        }
      } else {
        const cx = Math.floor((c.x0 + c.x1) / 2);
        for (let z = Math.max(0, c.z0); z <= Math.min(D - 1, c.z1); z++) {
          if (plan.roadAxis[at(cx, z)] !== 2 || plan.use[at(cx, z)] !== USE.ROAD) continue;
          if (z % 4 < 2) world.set(cx, GROUND, z, MAT.LINE);
        }
      }
    }
    // crosswalk stripes where sidewalk meets a wide road
    for (let z = 1; z < D - 1; z++) {
      for (let x = 1; x < W - 1; x++) {
        if (plan.use[at(x, z)] !== USE.ROAD || plan.roadWidthAt[at(x, z)] < 5) continue;
        const nSide = plan.use[at(x, z - 1)] === USE.SIDEWALK || plan.use[at(x, z + 1)] === USE.SIDEWALK;
        const eSide = plan.use[at(x - 1, z)] === USE.SIDEWALK || plan.use[at(x + 1, z)] === USE.SIDEWALK;
        if (nSide && x % 2 === 0 && plan.roadAxis[at(x, z)] === 2) world.set(x, GROUND, z, MAT.CROSSWALK);
        else if (eSide && z % 2 === 0 && plan.roadAxis[at(x, z)] === 1) world.set(x, GROUND, z, MAT.CROSSWALK);
      }
    }
  }

  // ---- canal -----------------------------------------------------------------
  if (canal) buildCanal(world, plan, canal, GROUND);

  // ---- railways ------------------------------------------------------------
  const transit = layTransit(world, plan, cfg.transit, GROUND);
  const hills = planHills(plan, cfg);                  // needed early: the castle goes on the highest hill
  chooseLandmarks(plan, cfg, hills, canal);
  const landmarks = [];

  // ---- lots ----------------------------------------------------------------
  const buildings = [];
  const farms = [];
  const ranches = [];
  const pandas = [];
  const beds = [];
  const themeRng = rng.fork();
  const lifeRng = rng.fork();
  const penOrder = lifeRng.shuffle(RANCH_ANIMALS.slice());
  // Animal pens are chosen up front, on the lots furthest from downtown:
  // at least four where the lots exist (one of each kind), more in big cities.
  {
    const [fx, fz] = plan.focal;
    const big = (l) => l.x1 - l.x0 + 1 >= 7 && l.z1 - l.z0 + 1 >= 7;
    const far = (l) => -Math.hypot((l.x0 + l.x1) / 2 - fx, (l.z0 + l.z1) / 2 - fz);
    const pool = plan.lots.filter((l) => l.kind === USE.LOT && !l.landmark && big(l));
    const houses = pool.filter((l) => l.style === 'house').sort((a, b) => far(a) - far(b));
    const others = pool.filter((l) => l.style !== 'house').sort((a, b) => far(a) - far(b));
    const want = cfg.ranchChance > 0 ? Math.max(4, Math.round(houses.length * cfg.ranchChance)) : 0;
    const picks = houses.concat(others).slice(0, want);
    picks.forEach((l, i) => { l.pen = penOrder[i % penOrder.length]; });
  }
  for (const lot of plan.lots) {
    if (lot.landmark) {
      const L = buildLandmark(world, lot, frontage(plan, lot).side, cfg, rng, GROUND);
      if (L) {
        landmarks.push(L);
        if (L.rec) {
          buildings.push(L.rec);
          if (cfg.furnish) {
            const f = furnish(world, L.rec, lifeRng);
            L.rec.beds = f.beds; L.rec.furniture = f;
            for (const b of f.beds) beds.push(b);
          } else L.rec.beds = [];
        }
        continue;
      }
    }
    if (lot.kind === USE.PARK) { park(world, lot, rng, cfg, lifeRng, pandas); continue; }
    if (lot.kind === USE.PLAZA) { plaza(world, lot, rng, cfg); continue; }

    if (lot.pen) {
      const rch = ranch(world, lot, frontage(plan, lot).side, lifeRng, GROUND, plan, lot.pen);
      if (rch) { ranches.push(rch); continue; }
    }
    if (lot.style === 'house' && cfg.farmChance > 0 &&
        lot.x1 - lot.x0 + 1 >= 7 && lot.z1 - lot.z0 + 1 >= 7 && lifeRng.chance(cfg.farmChance)) {
      const f = farm(world, lot, frontage(plan, lot).side, lifeRng, GROUND, plan);
      if (f) { farms.push(f); continue; }
    }


    const m = lot.margin;
    const fx0 = lot.x0 + m, fz0 = lot.z0 + m, fx1 = lot.x1 - m, fz1 = lot.z1 - m;
    if (fx1 - fx0 + 1 < 5 || fz1 - fz0 + 1 < 5) { garden(world, lot, rng, cfg); continue; }

    // pave the yard for commercial lots, leave grass for houses
    if (lot.style !== 'house') {
      for (let z = lot.z0; z <= lot.z1; z++)
        for (let x = lot.x0; x <= lot.x1; x++) world.set(x, GROUND, z, MAT.SIDEWALK);
    }

    const front = frontage(plan, lot);
    const theme = themeRng.pick(STYLE.themes[lot.style] || STYLE.themes.mid);
    const rec = makeBuilding(world, {
      x0: fx0, z0: fz0, x1: fx1, z1: fz1,
      floors: lot.floors, pitch: cfg.pitch, groundY: GROUND,
      style: lot.style, facing: front.side, theme,
      roofAccess: cfg.roofAccess, useStairs: cfg.useStairs, stairStyle: cfg.stairStyle, lights: cfg.lights,
      setback: cfg.setback, setbackEvery: cfg.setbackEvery,
    }, rng);

    if (rec) {
      buildings.push(rec);
      if (cfg.furnish) {
        const f = furnish(world, rec, lifeRng);
        rec.beds = f.beds; rec.furniture = f;
        for (const b of f.beds) beds.push(b);
      } else { rec.beds = []; }
      // front path from the door out to the lot edge
      if (lot.style === 'house') {
        const [ox, oz] = OUTWARD[rec.facing];
        let px = rec.door.x + ox, pz = rec.door.z + oz;
        for (let i = 0; i < m + 1 && px >= 0 && pz >= 0 && px < W && pz < D; i++) {
          world.set(px, GROUND, pz, MAT.PATH);
          px += ox; pz += oz;
        }
        if (cfg.trees) yardTrees(world, lot, rec, rng);
        if (cfg.flowers) scatterFlowers(world, lot, 0.05, lifeRng, GROUND);
      }
    } else {
      garden(world, lot, rng, cfg);
    }
    if (onProgress && buildings.length % 32 === 0) onProgress(buildings.length);
  }

  // ---- street furniture ----------------------------------------------------
  if (cfg.lamps) {
    for (let z = 1; z < D - 1; z++) {
      for (let x = 1; x < W - 1; x++) {
        if (plan.use[at(x, z)] !== USE.SIDEWALK) continue;
        const nearRoad = plan.use[at(x + 1, z)] === USE.ROAD || plan.use[at(x - 1, z)] === USE.ROAD ||
                         plan.use[at(x, z + 1)] === USE.ROAD || plan.use[at(x, z - 1)] === USE.ROAD;
        if (!nearRoad) continue;
        if ((x * 7 + z * 11) % 79 !== 0) continue;
        if (world.has(x, GROUND + 1, z)) continue;
        world.column(x, z, GROUND + 1, GROUND + 3, MAT.LAMP_POST);
        world.set(x, GROUND + 4, z, MAT.STREET_LIGHT);
      }
    }
  }

  // ---- hills: lift the blocks onto their terraces, then cut the steps -------
  const elevAt = (x, z) => (x >= 0 && z >= 0 && x < W && z < D ? hills.elev[z * W + x] : 0);
  let stairRuns = [];
  if (hills.H) {
    liftBlocks(world, plan, hills, GROUND);
    for (const rec of buildings) shiftBuilding(rec, elevAt(rec.door.x, rec.door.z));
    for (const rch of ranches) for (const a of rch.animals) a.y += elevAt(a.x, a.z);
    for (const p of pandas) p.y += elevAt(p.x, p.z);
    for (const L of landmarks) {
      if (L.bell) L.bell[1] += elevAt(L.bell[0], L.bell[2]);
      if (L.belfryBell) L.belfryBell[1] += elevAt(L.belfryBell[0], L.belfryBell[2]);
      if (L.faces) for (const f of L.faces) f.centre[1] += elevAt(f.centre[0], f.centre[2]);
      for (const key of ['spireTop', 'lantern']) if (L[key]) L[key][1] += elevAt(L[key][0], L[key][2]);
    }
    if (transit) for (const l of transit.lines) {
      const e = elevAt(l.cells[0][0], l.cells[0][2]);       // alley lines ride up with their block
      if (e) { for (const c of l.cells) c[1] += e; for (const st of l.stations) st[1] += e; l.lifted = e; }
    }
    if (transit) for (const c of transit.carts) c.y += elevAt(c.x, c.z);
    const avoid = buildings.map((b) => [b.outside[0], b.outside[2]])
      .concat(ranches.map((r) => r.gate), farms.map((f) => [(f.x0 + f.x1) >> 1, (f.z0 + f.z1) >> 1]));
    stairRuns = cutStairs(world, plan, hills, GROUND, avoid);
  }

  clearDoorways(world, buildings);
  trimOverRails(world, transit);
  const wall = perimeterWall(world, plan, cfg);

  // ---- the village ---------------------------------------------------------
  // the town hall's bell is the village bell; otherwise one goes in a plaza or park
  const hall = landmarks.find((l) => l.kind === 'townhall' && l.bell);
  const bell = hall ? hall.bell : (cfg.villagers > 0 ? placeBell(world, plan, GROUND, elevAt) : null);
  let spawns = [];
  if (cfg.villagers > 0) {
    const vs = bedSpawns(world, beds);
    lifeRng.shuffle(vs);
    spawns = vs.slice(0, cfg.villagers);
    const golems = Math.min(cfg.golemMax, Math.round(spawns.length * Math.max(0, cfg.golemsPer10) / 10));
    spawns = spawns.concat(golemSpawns(world, plan, buildings, golems, lifeRng, GROUND, elevAt));
    if (cfg.cats) spawns = spawns.concat(catSpawns(world, plan, buildings, Math.min(16, Math.ceil(spawns.length / 5)), lifeRng, GROUND, elevAt));
  }
  for (const p of pandas) spawns.push(p);
  for (const rch of ranches) for (const a of rch.animals) spawns.push(a);

  if (transit) spawns = spawns.concat(transit.carts);
  if (canal && canal.dock) spawns = spawns.concat(canal.dock.boats);

  // ---- city style: restyle the role materials, then snow -----------------------
  applyStyle(world, plan, STYLE, (x, z) => GROUND + elevAt(x, z));

  // ---- can everything be reached from the streets? ---------------------------
  const reached = walkCity(world, plan, GROUND, hills.H + 4);
  const unreached = buildings.filter((b) => !reached.has(`${b.outside[0]},${b.outside[1]},${b.outside[2]}`));
  const reach = { total: buildings.length, reached: buildings.length - unreached.length, unreached };

  const stats = summarise(world, plan, buildings, cfg, { farms, beds, spawns, bell, transit, wall, ranches, landmarks, hills, stairRuns, reach, canal });
  return { world, plan, buildings, cfg, stats, farms, ranches, spawns, bell, transit, wall, landmarks, canal,
    hills, stairRuns, reach, groundAt: (x, z) => GROUND + elevAt(x, z) };
}

// ---- city style ----------------------------------------------------------------
// Swap every role material for the style's own (roads, ground, trees, flowers,
// lamps, wall...), then lay snow on open ground for snowy cities.
function applyStyle(world, plan, style, groundAt) {
  const table = remapTable(style, FLOWERS);
  if (table.size) {
    const changes = [];
    world.forEach((x, y, z, id) => { if (table.has(id)) changes.push([x, y, z, table.get(id)]); });
    for (const [x, y, z, to] of changes) {
      if (to === null) world.clear(x, y, z);
      else { const d = world.getData(x, y, z); world.set(x, y, z, to); if (d) world.setData(x, y, z, d); }
    }
  }
  if (style.cactus) {
    // A cactus breaks if it is not on sand (or cactus), or if anything solid
    // touches its sides. Trees planted later can reach one; plazas are paved.
    // Remove any that would break, repeating so nothing is left floating.
    const SAND = MAT.SAND, CAC = MAT.CACTUS;
    for (let pass = 0; pass < 6; pass++) {
      const bad = [];
      world.forEach((x, y, z, id) => {
        if (id !== CAC) return;
        const below = world.get(x, y - 1, z);
        let broken = below !== SAND && below !== CAC;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = world.get(x + dx, y, z + dz);
          if (n !== -1 && !MATERIALS.isPassable(n)) broken = true;
        }
        if (broken) bad.push([x, y, z]);
      });
      if (!bad.length) break;
      for (const [x, y, z] of bad) world.clear(x, y, z);
    }
  }
  if (style.snow) {
    const { W, D } = plan;
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        const g = groundAt(x, z);
        if (world.get(x, g, z) === MAT.GRASS && !world.has(x, g + 1, z)) world.set(x, g + 1, z, MAT.SNOW_LAYER);
      }
  }
}

// ---- perimeter wall -------------------------------------------------------------
// Keeps surrounding water out. It stands on the city's outermost row (the
// edge of the ring road) from ground level up; below it the city's surface
// and stone base are already solid, so water has no way in at any height up
// to the top of the wall. Each side gets a double wooden door in the middle:
// closed doors block water too, so the gates do not weaken it.
function perimeterWall(world, plan, cfg) {
  const h = Math.max(0, Math.min(12, cfg.wallHeight | 0));
  if (!h) return null;
  const { W, D, mask } = plan;
  const inCity = (x, z) => x >= 0 && z >= 0 && x < W && z < D && mask[z * W + x] === 1;
  // the wall runs on the city's outermost ring: every city cell with a
  // non-city neighbour (including diagonals, so water can never slip past
  // a corner) or on the edge of the plan
  const ring = [];
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      if (!inCity(x, z)) continue;
      let edge = false;
      for (let dz = -1; dz <= 1 && !edge; dz++) for (let dx = -1; dx <= 1 && !edge; dx++) if (!inCity(x + dx, z + dz)) edge = true;
      if (edge) ring.push([x, z]);
    }
  for (const [x, z] of ring) {
    world.set(x, 0, z, MAT.BASE);
    world.set(x, GROUND, z, MAT.WALL_BODY);
    for (let y = GROUND + 1; y <= GROUND + h; y++) world.set(x, y, z, y === GROUND + h ? MAT.WALL_CAP : MAT.WALL_BODY);
    for (let y = GROUND + h + 1; y <= GROUND + h + 3; y++) world.clear(x, y, z);
  }
  if (h < 3) return { height: h, gates: [], ring };      // too low for a doorway: step over it
  // Gates: a double door on each compass side, as near the middle of that
  // side as possible, facing out, hinges on the outer edges. A gate needs two
  // wall cells in a straight line with open land outside and walkable ground
  // (rails are fine) inside.
  const isRing = new Set(ring.map(([x, z]) => x + ',' + z));
  const CLOCKWISE = { north: 'east', east: 'south', south: 'west', west: 'north' };
  const walkIn = (x, z) => {
    const f1 = world.get(x, GROUND + 1, z), f2 = world.get(x, GROUND + 2, z);
    return inCity(x, z) && !isRing.has(x + ',' + z) && world.has(x, GROUND, z) &&
      (f1 === -1 || MATERIALS.isPassable(f1)) && f2 === -1;
  };
  let sx = 0, sz = 0;
  for (const [x, z] of ring) { sx += x; sz += z; }
  const mx = sx / ring.length, mz = sz / ring.length;
  const gates = [];
  for (const face of ['north', 'south', 'west', 'east']) {
    const [ox, oz] = OUTWARD[face];
    const along = (face === 'north' || face === 'south') ? [1, 0] : [0, 1];
    let best = null;
    for (const [x, z] of ring) {
      const x2 = x + along[0], z2 = z + along[1];
      if (!isRing.has(x2 + ',' + z2)) continue;
      const cells = [[x, z], [x2, z2]];
      // open land straight outside both, walkable ground straight inside both
      if (!cells.every(([a, b]) => !inCity(a + ox, b + oz) && walkIn(a - ox, b - oz))) continue;
      const off = face === 'north' || face === 'south' ? Math.abs(x + 0.5 - mx) : Math.abs(z + 0.5 - mz);
      const reach = face === 'north' ? -z : face === 'south' ? z : face === 'west' ? -x : x;   // prefer the outermost
      const score = off - reach * 0.5;
      if (!best || score < best.score) best = { cells, score };
    }
    if (!best) continue;
    const secondIsRight = CLOCKWISE[face] === (along[0] ? 'east' : 'south');
    best.cells.forEach(([x, z], i) => {
      const hinge = (i === 1) === secondIsRight ? 1 : 0;
      world.set(x, GROUND + 1, z, doorId('spruce', DIR[face], false, hinge));
      world.set(x, GROUND + 2, z, doorId('spruce', DIR[face], true, hinge));
    });
    gates.push({ face, cells: best.cells, inside: best.cells.map(([a, b]) => [a - ox, b - oz]) });
  }
  return { height: h, gates, ring };
}

// ---- keep the way in clear --------------------------------------------------
// Street furniture and overhanging foliage are placed after the buildings, so
// a lamp post or a canopy can land in the two cells a player needs to walk
// through the front door. Only decoration is removed - never structure.
const DECOR = new Set([MAT.LEAVES, MAT.SPRUCE_LEAF, MAT.LOG, MAT.SPRUCE_LOG,
  MAT.BARS, MAT.LANTERN]);

function clearDoorways(world, buildings) {
  for (const rec of buildings) {
    const [ox, oz] = OUTWARD[rec.facing];
    const gy = rec.groundY;
    for (let i = 1; i <= 3; i++) {
      const x = rec.door.x + ox * i, z = rec.door.z + oz * i;
      for (let dy = 1; dy <= 2; dy++) {
        const id = world.get(x, gy + dy, z);
        if (id !== -1 && DECOR.has(id)) world.clear(x, gy + dy, z);
      }
      if (i <= 2 && !world.has(x, gy, z)) world.set(x, gy, z, MAT.PATH);
    }
  }
}

// ---- one building on its own plot -----------------------------------------
export function generateSingle(cfgIn) {
  const cfg = { ...DEFAULTS, ...cfgIn };
  const rng = makeRng(cfg.seed);
  const w = cfg.bw, d = cfg.bd;
  const pad = 6;
  const W = w + pad * 2, D = d + pad * 2;
  const world = new VoxelWorld({ budget: cfg.budget });
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    world.set(x, 0, z, MAT.BASE);
    world.set(x, GROUND, z, MAT.GRASS);
  }
  // a strip of pavement on the south edge to arrive from
  for (let z = D - 3; z < D; z++) for (let x = 0; x < W; x++) world.set(x, GROUND, z, MAT.SIDEWALK);

  const theme = cfg.themeName
    ? (styleOf(cfg.cityStyle).themes[cfg.style] || THEMES.mid).find((t) => t.name === cfg.themeName) || rng.pick(styleOf(cfg.cityStyle).themes[cfg.style] || THEMES.mid)
    : rng.pick(styleOf(cfg.cityStyle).themes[cfg.style] || THEMES.mid);

  const rec = makeBuilding(world, {
    x0: pad, z0: pad, x1: pad + w - 1, z1: pad + d - 1,
    floors: cfg.floors, pitch: cfg.pitch, groundY: GROUND,
    style: cfg.style, facing: 'south', theme,
    roofAccess: cfg.roofAccess, useStairs: cfg.useStairs, stairStyle: cfg.stairStyle, lights: cfg.lights,
    setback: cfg.setback, setbackEvery: cfg.setbackEvery,
  }, rng);

  const buildings = rec ? [rec] : [];
  let beds = [];
  if (rec && cfg.furnish) { const f = furnish(world, rec, makeRng(cfg.seed ^ 0x51f3)); rec.beds = f.beds; rec.furniture = f; beds = f.beds; }
  if (rec) {
    const [ox, oz] = OUTWARD[rec.facing];
    let px = rec.door.x + ox, pz = rec.door.z + oz;
    while (px >= 0 && pz >= 0 && px < W && pz < D) { world.set(px, GROUND, pz, MAT.PATH); px += ox; pz += oz; }
  }
  clearDoorways(world, buildings);
  const plan = { W, D, use: new Uint8Array(W * D), lots: [], corridors: [], focal: [W / 2, D / 2], roadAxis: new Uint8Array(W * D) };
  const spawns = cfg.villagers > 0 ? bedSpawns(world, beds).slice(0, cfg.villagers) : [];
  return { world, plan, buildings, cfg, spawns, farms: [], bell: null,
    stats: summarise(world, plan, buildings, cfg, { farms: [], beds, spawns, bell: null }) };
}

// ---- open space ------------------------------------------------------------
function park(world, lot, rng, cfg, lifeRng, pandas) {
  for (let z = lot.z0; z <= lot.z1; z++)
    for (let x = lot.x0; x <= lot.x1; x++) world.set(x, GROUND, z, MAT.GRASS);
  // crossing paths
  const cx = Math.round((lot.x0 + lot.x1) / 2), cz = Math.round((lot.z0 + lot.z1) / 2);
  for (let x = lot.x0; x <= lot.x1; x++) world.set(x, GROUND, cz, MAT.PATH);
  for (let z = lot.z0; z <= lot.z1; z++) world.set(cx, GROUND, z, MAT.PATH);
  const pd = (cfg.pondChance > 0 && rng.chance(cfg.pondChance)) ? pond(world, lot, cx, cz, rng, GROUND) : null;
  let grove = null;
  if (lifeRng && cfg.pandaChance > 0 && lifeRng.chance(cfg.pandaChance)) {
    grove = pandaGrove(world, lot, cx, cz, lifeRng, GROUND, pd);
    if (grove && pandas) for (const p of grove.pandas) pandas.push(p);
  }
  const inGrove = (x, z) => grove && x >= grove.x0 && x <= grove.x1 && z >= grove.z0 && z <= grove.z1;
  // a canopy spreads two blocks: keep trees that far from the grove too
  const nearGrove = (x, z) => grove && x >= grove.x0 - 2 && x <= grove.x1 + 2 && z >= grove.z0 - 2 && z <= grove.z1 + 2;
  if (cfg.trees) {
    for (let z = lot.z0 + 1; z <= lot.z1 - 1; z++) {
      for (let x = lot.x0 + 1; x <= lot.x1 - 1; x++) {
        if (x === cx || z === cz || nearGrove(x, z)) continue;
        if (world.get(x, GROUND, z) !== MAT.GRASS || world.has(x, GROUND + 1, z)) continue;
        if (fbm2(x, z, cfg.seed ^ 0x77e2, 4) > 0.72 && rng.chance(0.45)) tree(world, x, z, rng);
      }
    }
  }
  // lantern posts at the four corners of the crossing
  if (cfg.lamps) {
    for (const [dx, dz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const x = cx + dx, z = cz + dz;
      if (inGrove(x, z) || world.get(x, GROUND, z) !== MAT.GRASS) continue;
      if (world.has(x, GROUND + 1, z) || world.has(x, GROUND + 2, z) || world.has(x, GROUND + 3, z)) continue;
      world.set(x, GROUND + 1, z, MAT.FENCE); world.set(x, GROUND + 2, z, MAT.FENCE); world.set(x, GROUND + 3, z, MAT.LAMP);
    }
  }
  if (cfg.flowers) scatterFlowers(world, lot, 0.07, rng, GROUND);
}

function plaza(world, lot, rng, cfg) {
  for (let z = lot.z0; z <= lot.z1; z++)
    for (let x = lot.x0; x <= lot.x1; x++)
      world.set(x, GROUND, z, ((x + z) & 1) ? MAT.PATH : MAT.QUARTZ);
  const cx = Math.round((lot.x0 + lot.x1) / 2), cz = Math.round((lot.z0 + lot.z1) / 2);
  const w = lot.x1 - lot.x0 + 1, d = lot.z1 - lot.z0 + 1;
  if (w >= 9 && d >= 9) {
    for (let z = cz - 2; z <= cz + 2; z++)
      for (let x = cx - 2; x <= cx + 2; x++) {
        const edge = (x === cx - 2 || x === cx + 2 || z === cz - 2 || z === cz + 2);
        world.set(x, GROUND, z, edge ? MAT.QUARTZ : MAT.WATER);
      }
    world.set(cx, GROUND + 1, cz, MAT.LANTERN);
  }
  for (let z = lot.z0 + 2; z <= lot.z1 - 2; z += 6)
    for (let x = lot.x0 + 2; x <= lot.x1 - 2; x += 6)
      if (Math.abs(x - cx) > 3 || Math.abs(z - cz) > 3) {
        if (cfg.trees && rng.chance(0.5)) tree(world, x, z, rng);
      }
}

function garden(world, lot, rng, cfg) {
  for (let z = lot.z0; z <= lot.z1; z++)
    for (let x = lot.x0; x <= lot.x1; x++) world.set(x, GROUND, z, MAT.GRASS);
  if (!cfg.trees) return;
  const n = rng.int(0, 2);
  for (let i = 0; i < n; i++) {
    const x = rng.int(lot.x0, lot.x1), z = rng.int(lot.z0, lot.z1);
    if (!world.has(x, GROUND + 1, z)) tree(world, x, z, rng);
  }
}

function yardTrees(world, lot, rec, rng) {
  for (let i = 0; i < 3; i++) {
    const x = rng.int(lot.x0, lot.x1), z = rng.int(lot.z0, lot.z1);
    if (x >= rec.x0 - 1 && x <= rec.x1 + 1 && z >= rec.z0 - 1 && z <= rec.z1 + 1) continue;
    if (nearDoorway(rec, x, z)) continue;
    if (world.has(x, GROUND + 1, z)) continue;
    if (rng.chance(0.5)) tree(world, x, z, rng);
  }
}

// A canopy reaches two cells sideways, so keep trunks well off the approach.
function nearDoorway(rec, x, z) {
  const [ox, oz] = OUTWARD[rec.facing];
  for (let i = 0; i <= 4; i++) {
    const px = rec.door.x + ox * i, pz = rec.door.z + oz * i;
    if (Math.abs(x - px) <= 2 && Math.abs(z - pz) <= 2) return true;
  }
  return false;
}

// A cactus: two or three blocks, only where all four sides are open (a cactus
// touching anything breaks on the next block update).
function cactus(world, x, z, rng) {
  const h = rng.int(2, 3);
  for (let y = GROUND + 1; y <= GROUND + h + 1; y++)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (world.has(x + dx, y, z + dz)) return;
  for (let y = GROUND + 1; y <= GROUND + h; y++) world.set(x, y, z, MAT.CACTUS);
}

function tree(world, x, z, rng) {
  if (STYLE.cactus && rng.chance(STYLE.cactus)) return cactus(world, x, z, rng);
  const h = rng.int(4, 6);
  const spruce = rng.chance(0.3);
  const log = spruce ? MAT.SPRUCE_LOG : MAT.LOG;
  const leaf = spruce ? MAT.SPRUCE_LEAF : MAT.LEAVES;
  world.column(x, z, GROUND + 1, GROUND + h, log);
  const top = GROUND + h;
  for (let dy = -2; dy <= 1; dy++) {
    const r = dy <= -1 ? 2 : dy === 0 ? 1 : 0;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        if (dx === 0 && dz === 0 && dy < 1) continue;
        if (Math.abs(dx) === r && Math.abs(dz) === r && r === 2) continue;
        if (!world.has(x + dx, top + dy, z + dz)) world.set(x + dx, top + dy, z + dz, leaf);
      }
  }
}

// ---- stats -----------------------------------------------------------------
function summarise(world, plan, buildings, cfg, life = {}) {
  let floors = 0, tallest = 0, windows = 0, houses = 0, mids = 0, towers = 0;
  for (const b of buildings) {
    floors += b.floors;
    tallest = Math.max(tallest, b.floors);
    windows += b.windows;
    if (b.style === 'house') houses++; else if (b.style === 'tower') towers++; else mids++;
  }
  const bb = world.box;
  return {
    blocks: world.size,
    overflow: world.overflow,
    buildings: buildings.length,
    houses, mids, towers,
    floors, tallest, windows,
    height: bb.empty ? 0 : bb.y1 - bb.y0 + 1,
    footprint: [plan.W, plan.D],
    farms: (life.farms || []).length,
    beds: (life.beds || []).length,
    villagers: (life.spawns || []).filter((p) => p.type === 'villager').length,
    golems: (life.spawns || []).filter((p) => p.type === 'golem').length,
    stations: buildings.reduce((a, b) => a + ((b.furniture && b.furniture.stations) || 0), 0),
    plants: buildings.reduce((a, b) => a + ((b.furniture && b.furniture.plants) || 0), 0),
    bell: !!life.bell,
    railLines: life.transit ? life.transit.stats.lines : 0,
    railBridges: life.transit ? life.transit.stats.bridges : 0,
    carts: (life.spawns || []).filter((p) => p.type === 'minecart').length,
    railLoop: !!(life.transit && life.transit.stats.loop),
    ranches: (life.ranches || []).length,
    landmarks: (life.landmarks || []).map((l) => l.kind),
    canal: life.canal ? `${life.canal.u1 - life.canal.u0 + 1} long · ${life.canal.bridges} bridges` : '',
    dock: !!(life.canal && life.canal.dock),
    art: buildings.reduce((a, b) => a + (b.roomPlans || []).reduce((c, p) => c + ((p && p.art) || 0), 0), 0),
    hillBlocks: life.hills ? life.hills.blocks.filter((b) => b.e > 0).length : 0,
    hillMax: life.hills ? Math.max(0, ...life.hills.blocks.map((b) => b.e)) : 0,
    staircases: (life.stairRuns || []).length,
    reachable: life.reach ? `${life.reach.reached}/${life.reach.total}` : '',
    cats: (life.spawns || []).filter((p) => p.type === 'cat').length,
    pandas: (life.spawns || []).filter((p) => p.type === 'panda').length,
    animals: (life.spawns || []).filter((p) => ['cow', 'sheep', 'pig', 'chicken'].includes(p.type)).length,
    wallHeight: life.wall ? life.wall.height : 0,
    gates: life.wall ? life.wall.gates.length : 0,
  };
}
