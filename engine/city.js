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
import { planHarbour, buildHarbour, harbourSidings } from './harbour.js';
import { chooseLandmarks, buildLandmark } from './landmarks.js';
import { planHills, liftBlocks, cutStairs, shiftBuilding, walkCity } from './terrain.js';
import { styleOf, remapTable } from './styles.js';
import { signTags } from './landmarks.js';
import { signId, SIGN_FACING, railId, RAIL } from './materials.js';
import { buildCentre, centreCells, footprint } from './centre.js';
import { PROFESSION_NAMES } from './entities.js';
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
  hills: 2,
  terrain: null,             // ground to fit the city to: { ground, water, baseY } in city coordinates
  terrainCut: 6,             // how far below base level the city will still build
  terrainFill: 10,           // and how far above                  // city blocks raised 0..hills blocks on gentle terraces, with steps
  detail: true,              // relief on the outside of buildings (quoins, eaves, balconies, bays)
  streetSigns: true,         // street names on signs at the junctions
  centreMark: true,          // a gold block and sign marking where build_centered puts you
  canal: true,
  harbour: true,             // a working waterfront on the canal: basin, quay, cranes, warehouses, goods yard               // a canal through the city, with bridges and a dock
  landmarks: true,
  landmarkShare: 0.16,       // at most this share of the city's lots become landmarks           // town hall, clock tower, library, market square near downtown
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
  professionals: 0.7,        // share of villagers that start with a trade (at mixed levels)
  golemsPer10: 3,            // iron golems per 10 villagers
  golemMax: 60,
  lights: true,
  lamps: true,
  trees: true,
  markings: true,
  budget: 9000000,          // room for a 512-block city
};

const GROUND = 1;   // surface layer; players walk at GROUND+1

// the style in force while a city is being generated (trees read it)
let STYLE = styleOf('modern');

let stats_terrain = null;
let stats_unsupported = 0;

export function generateCity(cfgIn, onProgress) {
  stats_terrain = null;
  stats_unsupported = 0;
  const cfg = { ...DEFAULTS, ...cfgIn };
  STYLE = styleOf(cfg.cityStyle);
  // a village is low by nature, so the style says so and the plan obeys; it
  // also works more ground than a town does
  if (STYLE.lowRise) {
    if (cfgIn.lowRise === undefined) cfg.lowRise = true;
    // a village sits on ground that rolls, not on a table
    if (cfg.hills === DEFAULTS.hills) cfg.hills = 3;
    // more ground is worked than in a town — but only if the slider is still
    // where it started, so a deliberate setting is left alone
    if (cfg.farmChance === DEFAULTS.farmChance) cfg.farmChance = 0.45;
    if (cfg.ranchChance === DEFAULTS.ranchChance) cfg.ranchChance = 0.18;
  }
  const rng = makeRng(cfg.seed);
  const plan = generatePlan(cfg, rng);
  const world = new VoxelWorld({ budget: cfg.budget });
  const W = plan.W, D = plan.D;
  // organic cities carry their outline, so the export leaves the land outside it alone
  if (cfg.outline === 'organic' || cfg.terrain) world.cityMask = { W, D, data: plan.mask };
  // the canal takes over one long street before anything is laid on it
  const canal = planCanal(plan, cfg, edgeDistance(plan));
  const harbourPlan = planHarbour(plan, canal, cfg);
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

  const buildings = [];

  // ---- harbour ---------------------------------------------------------------
  const harbour = harbourPlan ? buildHarbour(world, plan, harbourPlan, cfg, rng.fork(), GROUND, buildings) : null;

  // ---- railways ------------------------------------------------------------
  const transit = layTransit(world, plan, cfg.transit, GROUND);
  if (harbour && transit) harbourSidings(world, harbourPlan, harbour, transit, GROUND);
  // Things that must stay dead level tell the ground planner so: on real
  // terrain they are levelled as a unit instead of being pinned to the base.
  if (cfg.terrain) {
    plan.flatGroups = [];
    if (canal) {
      const cells = [];
      for (let u = canal.u0; u <= canal.u1; u++)
        for (let a = canal.a0; a <= canal.a1; a++) {
          const [x, z] = canal.cell(u, a);
          if (x >= 0 && z >= 0 && x < W && z < D) cells.push(z * W + x);
        }
      plan.flatGroups.push(cells);
    }
    if (harbourPlan) plan.flatGroups.push([...harbourPlan.cells].map((k) => {
      const [x, z] = k.split(',').map(Number);
      return z * W + x;
    }));
  }
  const hills = planHills(plan, cfg);                  // needed early: the castle goes on the highest hill
  if (harbourPlan && !hills.rolling) {
    // the waterfront and the block it sits in stay level with the quay
    for (const b of hills.blocks) {
      let touches = false;
      for (let z = b.z0; z <= b.z1 && !touches; z++) for (let x = b.x0; x <= b.x1 && !touches; x++) if (harbourPlan.cells.has(x + ',' + z)) touches = true;
      if (!touches) continue;
      b.e = 0;
      for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) hills.elev[z * W + x] = 0;
    }
    for (const k of harbourPlan.cells) { const [hx, hz] = k.split(',').map(Number); hills.elev[hz * W + hx] = 0; }
  }
  chooseLandmarks(plan, cfg, hills, canal);
  const landmarks = [];

  // ---- lots ----------------------------------------------------------------
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
        // a landmark can be more than one building (the mansion's wings): every
        // one gets furnished, lifted with its terrace and verified like the rest
        for (const wing of L.wings || []) {
          buildings.push(wing);
          if (cfg.furnish) {
            const fw = furnish(world, wing, lifeRng);
            wing.beds = fw.beds; wing.furniture = fw;
            for (const b of fw.beds) beds.push(b);
          } else wing.beds = [];
        }
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
      detail: cfg.detail,
      rustic: !!STYLE.rustic,
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
        if (buildings.some((rec) => nearDoorway(rec, x, z))) continue;   // never in front of a door
        world.column(x, z, GROUND + 1, GROUND + 3, MAT.LAMP_POST);
        world.set(x, GROUND + 4, z, MAT.STREET_LIGHT);
      }
    }
  }

  // Pen animals were placed when the pen was built; a tree in a neighbouring
  // yard can spread its canopy over the fence afterwards. Re-check every
  // animal now the city is finished, and move any that lost its head room.
  for (const rch of ranches) {
    const free = [];
    for (let z = rch.z0 + 1; z <= rch.z1 - 1; z++)
      for (let x = rch.x0 + 1; x <= rch.x1 - 1; x++)
        if (world.has(x, GROUND, z) && !world.has(x, GROUND + 1, z) && !world.has(x, GROUND + 2, z)) free.push([x, z]);
    const used = new Set();
    for (const a of rch.animals) {
      if (!world.has(a.x, GROUND + 1, a.z) && !world.has(a.x, GROUND + 2, a.z)) { used.add(a.x + ',' + a.z); continue; }
      const spot = free.find(([x, z]) => !used.has(x + ',' + z));
      if (spot) { a.x = spot[0]; a.z = spot[1]; used.add(spot.join()); }
    }
    rch.animals = rch.animals.filter((a) => !world.has(a.x, GROUND + 1, a.z) && !world.has(a.x, GROUND + 2, a.z));
  }

  // ---- hills: lift the blocks onto their terraces, then cut the steps -------
  const elevAt = (x, z) => (x >= 0 && z >= 0 && x < W && z < D ? hills.elev[z * W + x] : 0);
  let stairRuns = [];
  if (hills.H) {
    liftBlocks(world, plan, hills, GROUND);
    // The railway was laid on the flat and rode up with the ground, so its
    // records have to ride up too, or carts and stations land at the old
    // height. Then the track is made to climb the steps properly.
    if (transit && hills.rolling) shiftTransit(world, transit, elevAt, GROUND);
    for (const rec of buildings) {
      const e = elevAt(rec.door.x, rec.door.z);
      shiftBuilding(rec, e);
      for (const sf of (rec.furniture && rec.furniture.shops) || []) sf.at[1] += e;   // shop signs ride up too
      for (const pt of (rec.furniture && rec.furniture.paintings) || []) { pt.y += e; pt.pos[1] += e; }
    }
    for (const rch of ranches) for (const a of rch.animals) a.y += elevAt(a.x, a.z);
    for (const p of pandas) p.y += elevAt(p.x, p.z);
    for (const L of landmarks) {
      if (L.bell) L.bell[1] += elevAt(L.bell[0], L.bell[2]);
      if (L.belfryBell) L.belfryBell[1] += elevAt(L.belfryBell[0], L.belfryBell[2]);
      if (L.faces) for (const f of L.faces) f.centre[1] += elevAt(f.centre[0], f.centre[2]);
      // every point a landmark records rides up with the ground under it —
      // single spots and lists of them alike, so nothing is left pointing at
      // where the block used to be
      const lift = (p) => { if (Array.isArray(p) && p.length === 3 && p.every((n) => typeof n === 'number')) p[1] += elevAt(p[0], p[2]); };
      for (const key of ['spireTop', 'lantern', 'cupolaBell', 'nameSign', 'fountain', 'gate', 'step', 'heap']) if (L[key]) lift(L[key]);
      for (const key of ['benches', 'stalls', 'lamps', 'goals', 'lights', 'tunnel', 'posts', 'graves', 'path', 'portico']) {
        if (!Array.isArray(L[key])) continue;
        for (const p of L[key]) lift(p);
      }
    }
    // On invented hills a line sits wholly inside one block, so it rides up as
    // a unit; on real ground every cell has its own height and shiftTransit
    // above has already moved them one by one.
    if (transit && !hills.rolling) {
      for (const l of transit.lines) {
        const e = elevAt(l.cells[0][0], l.cells[0][2]);     // alley lines ride up with their block
        if (e) { for (const c of l.cells) c[1] += e; for (const st of l.stations) st[1] += e; l.lifted = e; }
      }
      for (const c of transit.carts) c.y += elevAt(c.x, c.z);
    }
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
  // ---- street names ----------------------------------------------------------
  const streets = cfg.streetSigns ? streetNameSigns(world, plan, cfg, GROUND, elevAt, rng.fork()) : null;

  const bell = hall ? hall.bell : (cfg.villagers > 0 ? placeBell(world, plan, GROUND, elevAt) : null);
  let spawns = [];
  if (cfg.villagers > 0) {
    const vs = bedSpawns(world, beds);
    lifeRng.shuffle(vs);
    spawns = vs.slice(0, cfg.villagers);
    // most villagers already have a trade, at every level from novice to
    // master; the rest are unemployed and take jobs from the workstations
    const LEVEL_WEIGHTS = [0.3, 0.25, 0.2, 0.15, 0.1];
    for (const p of spawns) {
      if (!lifeRng.chance(cfg.professionals)) continue;
      p.profession = lifeRng.pick(PROFESSION_NAMES);
      let r = lifeRng(), t = 0;
      while (t < 4 && r > LEVEL_WEIGHTS[t]) { r -= LEVEL_WEIGHTS[t]; t++; }
      p.tier = t;
    }
    const golems = Math.min(cfg.golemMax, Math.round(spawns.length * Math.max(0, cfg.golemsPer10) / 10));
    spawns = spawns.concat(golemSpawns(world, plan, buildings, golems, lifeRng, GROUND, elevAt));
    if (cfg.cats) spawns = spawns.concat(catSpawns(world, plan, buildings, Math.min(16, Math.ceil(spawns.length / 5)), lifeRng, GROUND, elevAt));
  }
  for (const p of pandas) spawns.push(p);
  for (const rch of ranches) for (const a of rch.animals) spawns.push(a);

  if (transit) spawns = spawns.concat(transit.carts);
  if (canal && canal.dock) spawns = spawns.concat(canal.dock.boats);
  if (harbour) spawns = spawns.concat(harbour.boats);
  for (const rec of buildings) for (const p of (rec.furniture && rec.furniture.paintings) || []) spawns.push(p);

  // ---- city style: restyle the role materials, then snow -----------------------
  applyStyle(world, plan, STYLE, (x, z) => GROUND + elevAt(x, z));

  // ---- blending the edge into the land ---------------------------------------
  const skirt = cfg.terrain && hills.rolling ? buildSkirt(world, plan, hills, cfg.terrain, GROUND) : 0;

  // ---- facing the cuts into the hillside -------------------------------------
  const cutFaces = cfg.terrain && hills.rolling ? faceCuts(world, plan, hills, cfg.terrain, GROUND) : 0;

  // ---- the centre marker -----------------------------------------------------
  const centre = cfg.centreMark ? markCentre(world, plan, buildings, GROUND, elevAt, spawns) : null;
  if (centre) world.centre = [centre.block[0], centre.block[2]];   // the export centres on it

  // ---- can everything be reached from the streets? ---------------------------
  const reached = walkCity(world, plan, GROUND, hills.H + 4);
  const unreached = buildings.filter((b) => !reached.has(`${b.outside[0]},${b.outside[1]},${b.outside[2]}`));
  const reach = { total: buildings.length, reached: buildings.length - unreached.length, unreached };

  if (cfg.terrain) stats_terrain = { baseY: cfg.terrain.baseY, maxTerrace: Math.max(0, ...hills.blocks.map((b) => b.e)) };
  // Last of all, make sure nothing will fall down or drop off when the city
  // is placed. Gravel and sand fall: a railway bed of gravel across a bridge
  // has nothing under it, so in Java it drops into the water the moment it
  // lands, taking the track with it (and it is fragile on Bedrock too). Track
  // with no support goes the same way, so it is given a footing.
  {
    const FALLING = new Set(['minecraft:gravel', 'minecraft:sand', 'minecraft:red_sand', 'minecraft:suspicious_gravel']);
    const loose = (id) => id === -1 || MATERIALS.isPassable(id);
    // Track needs a whole block under it. Air is the obvious failure, but a
    // dirt path, farmland, a slab or a layer of snow will not hold a rail
    // either — it pops off the moment it is placed. A village's streets are
    // dirt paths, so its trams ran on nothing at all.
    const NO_HOLD = /(grass_path|dirt_path|farmland|snow_layer|_slab|slab$|soul_sand|_fence|fence$)/;
    let propped = 0;
    if (transit) {
      for (const line of transit.lines)
        for (const [x, y, z] of line.cells) {
          const id = world.get(x, y, z);
          if (id < 0 || !/rail/.test(MATERIALS.def(id).block)) continue;
          const below = world.get(x, y - 1, z);
          const weak = below < 0 || loose(below) || NO_HOLD.test(MATERIALS.def(below).block);
          if (!weak) continue;
          if (below >= 0 && /rail/.test(MATERIALS.def(below).block)) continue;   // never pave over track
          world.set(x, y - 1, z, MAT.GRAVEL);                                    // ballast, as under any track
          propped++;
        }
    }
    let swapped = 0;
    for (let pass = 0; pass < 8; pass++) {           // a stack of gravel falls as a stack
      const swap = [];
      world.forEach((x, y, z, id) => {
        if (!FALLING.has(MATERIALS.def(id).block)) return;
        if (!loose(world.get(x, y - 1, z))) return;
        swap.push([x, y, z]);
      });
      if (!swap.length) break;
      for (const [x, y, z] of swap) world.set(x, y, z, MAT.BASE);
      swapped += swap.length;
    }
    stats_unsupported = swapped + propped;
  }

  const shell = cfg.terrain ? terrainShell(plan, cfg.terrain, GROUND, cfg.cityStyle) : null;
  const stats = summarise(world, plan, buildings, cfg, { farms, beds, spawns, bell, transit, wall, ranches, landmarks, hills, stairRuns, reach, canal, centre, streets, harbour, skirt, cutFaces, unsupported: stats_unsupported });
  return { world, plan, buildings, cfg, stats, shell, farms, ranches, spawns, bell, transit, wall, landmarks, canal, centre, streets, harbour, harbourPlan,
    hills, stairRuns, reach, groundAt: (x, z) => GROUND + elevAt(x, z) };
}

// ---- the land around the city, for the preview ---------------------------------
// The city is generated in its own little world, so the preview shows it on a
// bare slab and the first sight of it sitting in real ground is in the game.
// This builds the surrounding land as blocks — surface and a little depth —
// for everything the city does not cover. It is only ever used for the
// preview: the export writes the city itself, never this.
export function terrainShell(plan, terrain, G, style) {
  const { W, D, mask } = plan;
  const out = [];
  const DEPTH = 3;
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (mask[i]) continue;
      const g = terrain.ground[i];
      if (g < -900) continue;                                 // never visited: nothing to show
      const top = G + (g - terrain.baseY);
      const water = g <= 62;
      out.push([x, top, z, water ? MAT.WATER : MAT.GRASS]);
      for (let d = 1; d <= DEPTH; d++) out.push([x, top - d, z, d < 2 ? MAT.DIRT : MAT.BASE]);
    }
  return out;
}

// ---- grading the cuts into the hillside ----------------------------------------
// Where the city is cut into rising ground, the cut is a vertical slice and
// the hill behind it shows as a raw face of dirt. A wall at the bottom only
// covers the first block of it. So the ground outside the city is graded
// instead: it climbs away a block per cell until it meets the real hillside,
// each step topped with the surface the land already has, and a low retaining
// wall at the city's edge holds the first step. Those cells go to the export,
// which clears what stood above them.
function faceCuts(world, plan, hills, terrain, G) {
  const { W, D, mask } = plan;
  const { elev } = hills;
  const faced = new Set();
  const REACH = 14;                                        // how far the grading runs
  // start at the city's edge, wherever the land outside rises above it
  let front = [];
  const level = new Int16Array(W * D).fill(-999);
  for (let z = 1; z < D - 1; z++)
    for (let x = 1; x < W - 1; x++) {
      const i = z * W + x;
      if (!mask[i]) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, j = nz * W + nx;
        if (mask[j] || level[j] > -900) continue;
        const ground = terrain.ground[j];
        if (ground < -900) continue;
        const land = G + (ground - terrain.baseY);
        const surface = G + elev[i];
        if (land < surface + 2) continue;                  // nothing to cut here
        level[j] = surface + 1;                            // the first step up
        front.push(j);
      }
    }
  const wallTop = new Map();
  for (let step = 0; step < REACH && front.length; step++) {
    const next = [];
    for (const i of front) {
      const x = i % W, z = (i - x) / W;
      const ground = terrain.ground[i];
      const land = G + (ground - terrain.baseY);
      const top = level[i];
      if (land <= top) continue;                           // the hillside has come down to meet us
      // cut this column back to the step, and keep the surface it had
      world.set(x, top, z, ground <= 62 ? MAT.WATER : MAT.GRASS);
      for (let y = top - 3; y < top; y++) if (!world.has(x, y, z)) world.set(x, y, z, MAT.DIRT);
      for (let y = top + 1; y <= Math.max(land + 2, top + 4); y++) world.clear(x, y, z);
      mask[i] = 1;
      faced.add(x + ',' + z);
      if (step === 0) wallTop.set(i, top);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, j = nz * W + nx;
        if (nx < 1 || nz < 1 || nx >= W - 1 || nz >= D - 1) continue;
        if (mask[j] || level[j] > -900) continue;
        if (terrain.ground[j] < -900) continue;
        level[j] = top + 1;
        next.push(j);
      }
    }
    front = next;
  }
  // two slopes running out from different edges can meet and disagree; let
  // the higher one come down until the join is a step, not a jump
  const topOf = (x, z) => { for (let y = 60; y > -8; y--) if (world.has(x, y, z)) return y; return -999; };
  for (let pass = 0; pass < 12; pass++) {
    let fixed = 0;
    for (const key of faced) {
      const [x, z] = key.split(',').map(Number);
      const here = topOf(x, z);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!faced.has((x + dx) + ',' + (z + dz))) continue;
        const there = topOf(x + dx, z + dz);
        if (there < -900 || here - there <= 1) continue;
        const want = there + 1;
        const id = world.get(x, here, z);
        // a step keeps a natural surface, never the wall material
        const block = MATERIALS.def(id).block === MATERIALS.def(MAT.RETAIN).block ? MAT.GRASS : id;
        for (let y = want + 1; y <= here; y++) world.clear(x, y, z);
        world.set(x, want, z, block);
        fixed++;
        break;
      }
    }
    if (!fixed) break;
  }

  // a low retaining wall along the city's edge, holding the first step
  for (const [i, top] of wallTop) {
    const x = i % W, z = (i - x) / W;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = (z + dz) * W + (x + dx);
      if (!mask[j] || faced.has((x + dx) + ',' + (z + dz))) continue;
      const surface = G + elev[j];
      for (let y = surface + 1; y < top; y++) world.set(x, y, z, MAT.RETAIN);   // the step keeps its own surface on top
      break;
    }
  }
  world.cutFaces = faced;                                  // the export clears what stood above these
  return faced.size;
}

// ---- blending the edge into the land -------------------------------------------
// The city surface may only step a block at a time, so where it meets a
// falling hillside its edge can stand several blocks proud of the ground — a
// wall around the town. This walks that difference down outside the city, a
// block per cell, until it meets the real ground, and hands those cells to
// the export so they are built along with the city.
function buildSkirt(world, plan, hills, terrain, G) {
  const { W, D, mask } = plan;
  const { elev } = hills;
  const level = new Int16Array(W * D).fill(-999);
  let queue = [];
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const i = z * W + x;
      if (!mask[i]) continue;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
        const j = nz * W + nx;
        if (mask[j] || level[j] >= -900) continue;
        level[j] = elev[i] - 1;
        queue.push(j);
      }
    }
  let built = 0;
  for (let step = 0; step < 12 && queue.length; step++) {
    const next = [];
    for (const i of queue) {
      const x = i % W, z = (i - x) / W;
      const ground = terrain.ground[i];
      const rel = ground < -900 ? 0 : ground - terrain.baseY;    // the real ground, in city heights
      const lv = level[i];
      if (lv <= 0 || lv <= rel) continue;                        // already down to the land
      if (ground > -900 && ground <= 62) continue;               // never out over water
      world.set(x, G + lv, z, MAT.GRASS);
      elev[i] = lv;                                              // the skirt's own height, on the record
      for (let y = Math.max(1, rel + 1); y < G + lv; y++) world.set(x, y, z, MAT.BASE);
      for (let y = G + lv + 1; y <= G + lv + 3; y++) world.clear(x, y, z);
      mask[i] = 1;                                               // the export builds it with the city
      built++;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
        const j = nz * W + nx;
        if (mask[j] || level[j] >= -900) continue;
        level[j] = lv - 1;
        next.push(j);
      }
    }
    queue = next;
  }
  // a skirt cell that ended beside a taller one steps up to within a block of
  // it, so the walk down is even all the way
  for (let pass = 0; pass < 12; pass++) {
    let fixed = 0;
    for (let z = 1; z < D - 1; z++)
      for (let x = 1; x < W - 1; x++) {
        const i = z * W + x;
        if (!mask[i] || level[i] < -900 || elev[i] < 0) continue;
        if (level[i] < -900) continue;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = (z + dz) * W + (x + dx);
          if (!mask[j]) continue;
          if (elev[j] - elev[i] > 1 && level[i] >= -900) {
            const lv2 = elev[j] - 1;
            const ground = terrain.ground[i];
            const rel = ground < -900 ? 0 : ground - terrain.baseY;
            if (lv2 <= rel) continue;
            for (let y = G + elev[i] + 1; y <= G + lv2; y++) world.set(x, y, z, MAT.BASE);
            world.set(x, G + lv2, z, MAT.GRASS);
            for (let y = G + lv2 + 1; y <= G + lv2 + 3; y++) world.clear(x, y, z);
            elev[i] = lv2;
            fixed++;
          }
        }
      }
    if (!fixed) break;
  }
  return built;
}

// ---- the railway on rolling ground ---------------------------------------------
// After the lift, every rail sits at the height of the street it runs along.
// Three things then need doing: move the records (cells, stations, carts) up
// with it, turn the rails where the street steps into climbing rails so a cart
// can ride them, and clear the space above so nothing is in the way.
function shiftTransit(world, transit, elevAt, G) {
  const up = ([x, y, z]) => [x, y + elevAt(x, z), z];
  for (const line of transit.lines) {
    line.cells = line.cells.map((c) => (c.length === 3 ? up(c) : c));
    line.stations = line.stations.map(up);
  }
  transit.carts = transit.lines.map((l) => ({ type: 'minecart', x: l.stations[0][0], y: l.stations[0][1], z: l.stations[0][2] }));

  // A corner has to be a curve, and a rail that climbs has to be straight, so
  // the two cannot be the same block. Where a line turns on a step, the track
  // is levelled through the turn — the corner and the cells either side share
  // a height — and the climb happens on the straight beyond it.
  const railAt = (x, y, z) => { const id = world.get(x, y, z); return id >= 0 && /rail/.test(MATERIALS.def(id).block); };
  const moveRail = (cell, toY) => {
    const [x, y, z] = cell;
    const id = world.get(x, y, z);
    if (id < 0) return;
    // never drop track onto another line: the upper rail would have nothing
    // to sit on, and a support there would block the cart below
    if (railAt(x, toY - 1, z) || railAt(x, toY, z)) return;
    world.clear(x, y, z);
    world.set(x, toY, z, id);
    // a support may never replace track: rails count as passable, so a lower
    // line running under this one would be paved over
    const under = world.get(x, toY - 1, z);
    const isRail = under >= 0 && /rail/.test(MATERIALS.def(under).block);
    if (!isRail && (under === -1 || MATERIALS.isPassable(under))) world.set(x, toY - 1, z, MAT.BASE);
    for (let h = 1; h <= 3; h++) {
      const above = world.get(x, toY + h, z);
      if (above >= 0 && !MATERIALS.isPassable(above)) world.clear(x, toY + h, z);
    }
    cell[1] = toY;
  };
  // Two rules have to hold along a line before the climbing rails go in: a
  // corner is flat with both its neighbours, and no step is taller than one
  // block (a rail can climb one). Levelling a corner can make a two-block
  // step and vice versa, so they are settled together, always downward, so
  // two corners near each other cannot pull one another about for ever.
  const limitSteps = () => {
    let fixed = 0;
    for (const line of transit.lines) {
      const cells = line.cells;
      const at = (i) => (line.loop ? cells[(i + cells.length) % cells.length] : cells[i]);
      for (let i = 0; i < cells.length; i++) {
        const here = cells[i], next = at(i + 1);
        if (!next) continue;
        const drop = here[1] - next[1];
        if (Math.abs(drop) <= 1) continue;
        const high = drop > 0 ? here : next, low = drop > 0 ? next : here;
        moveRail(high, low[1] + 1);
        fixed++;
      }
    }
    return fixed;
  };
  for (let pass = 0; pass < 16; pass++) {
    let levelled = 0;
    for (const line of transit.lines) {
      const cells = line.cells;
      // a loop has no ends: its first and last cells are neighbours
      const at = (i) => (line.loop ? cells[(i + cells.length) % cells.length] : cells[i]);
      for (let i = 0; i < cells.length; i++) {
        const prev = at(i - 1), next = at(i + 1), here = cells[i];
        if (!prev || !next) continue;
        const turns = prev[0] !== next[0] && prev[2] !== next[2];      // the line changes axis here
        if (!turns) continue;
        const y = Math.min(here[1], prev[1], next[1]);
        for (const n of [here, prev, next]) if (n[1] !== y) { moveRail(n, y); levelled++; }
      }
    }
    levelled += limitSteps();
    if (!levelled) break;
  }

  // where the line steps up or down, the lower rail becomes a climbing rail
  for (const line of transit.lines) {
    const cells = line.cells;
    for (let i = 0; i < cells.length; i++) {
      const [x, y, z] = cells[i];
      const id = world.get(x, y, z);
      if (id < 0 || !/rail/.test(MATERIALS.def(id).block)) continue;
      const powered = MATERIALS.def(id).block === 'minecraft:golden_rail';
      const near = (k) => (line.loop ? cells[(k + cells.length) % cells.length] : cells[k]);
      const prev = near(i - 1), next = near(i + 1);
      if (prev && next && prev[0] !== next[0] && prev[2] !== next[2]) continue;   // a corner stays a curve
      let climb = null;
      for (const n of [next, prev]) {
        if (!n || climb) continue;
        const dy = n[1] - y;
        if (dy !== 1) continue;
        const dx = Math.sign(n[0] - x), dz = Math.sign(n[2] - z);
        climb = dx === 1 ? RAIL.UP_E : dx === -1 ? RAIL.UP_W : dz === 1 ? RAIL.UP_S : RAIL.UP_N;
      }
      if (climb === null) continue;
      // a climbing rail must be plain: a powered one needs a block of
      // redstone under it, which would stick out of the side of the step
      world.set(x, y, z, railId(climb));
      if (powered && !world.has(x, y - 1, z)) world.set(x, y - 1, z, MAT.GRAVEL);
    }
  }
  // A block of redstone under a powered rail is meant to be buried in the
  // street. Where the street steps down beside it, it ends up showing, so
  // that booster becomes a plain rail on ordinary ground.
  for (let pass = 0; pass < 2; pass++) for (const line of transit.lines)
    for (const [x, y, z] of line.cells) {
      const below = world.get(x, y - 1, z);
      if (below < 0 || MATERIALS.def(below).block !== 'minecraft:redstone_block') continue;
      let showing = false;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = world.get(x + dx, y - 1, z + dz);
        if (n < 0 || MATERIALS.isPassable(n)) showing = true;
      }
      if (!showing) continue;
      world.set(x, y - 1, z, MAT.GRAVEL);
      const id = world.get(x, y, z);
      if (id >= 0 && MATERIALS.def(id).block === 'minecraft:golden_rail') {
        const dir = MATERIALS.def(id).states.rail_direction.value;
        world.set(x, y, z, railId(dir));
      }
    }

  // headroom: a cart and its rider need two clear blocks, and a step in the
  // street can leave the next column poking into them
  for (const line of transit.lines)
    for (const [x, y, z] of line.cells)
      for (let h = 1; h <= 3; h++) {
        const id = world.get(x, y + h, z);
        if (id >= 0 && !MATERIALS.isPassable(id)) world.clear(x, y + h, z);
      }
}

// ---- street names ------------------------------------------------------------
// Every avenue and street gets a name; each junction of two named streets gets
// a sign on a corner of the pavement, facing the crossing, with both names on
// it. Alleys inside the blocks are left unnamed.
// Named like a real grid: numbered avenues one way, tree-named streets the
// other, so a junction reads "Oak St / First Ave".
const AVENUE_NAMES = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
  'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth',
  'Park', 'Grand', 'Market', 'Union'];
const STREET_NAMES = ['Oak', 'Elm', 'Maple', 'Cedar', 'Birch', 'Willow', 'Aspen', 'Poplar', 'Alder', 'Hazel', 'Linden', 'Rowan',
  'Chestnut', 'Walnut', 'Laurel', 'Juniper', 'Mulberry', 'Sycamore', 'Hawthorn', 'Magnolia', 'Cypress', 'Spruce', 'Beech', 'Holly'];

// names stay unique past the end of the list: Oak St, then N Oak St, S Oak St...
const WRAP = ['', 'N ', 'S ', 'E ', 'W '];
const pick = (pool, i, suffix) => `${WRAP[Math.floor(i / pool.length) % WRAP.length]}${pool[i % pool.length]} ${suffix}`;

function streetNameSigns(world, plan, cfg, G, elevAt, rng) {
  const { W, D, use, mask } = plan;
  let av = 0, st = 0;
  // every street and avenue is named, however narrow; alleys are not.
  // Avenues run one way across the city, streets the other.
  const named = plan.corridors
    .filter((c) => c.kind !== 'alley')
    .sort((p, q) => (p.axis === 'x' ? p.z0 : p.x0) - (q.axis === 'x' ? q.z0 : q.x0))
    .map((c) => ({ ...c, name: c.axis === 'x' ? pick(AVENUE_NAMES, av++, 'Ave') : pick(STREET_NAMES, st++, 'St') }));
  const xs = named.filter((c) => c.axis === 'x'), zs = named.filter((c) => c.axis === 'z');
  // a pavement corner, at whatever height its block sits on
  const free = (x, z) => {
    if (x <= 0 || z <= 0 || x >= W - 1 || z >= D - 1) return false;
    if (mask && !mask[z * W + x]) return false;
    if (use[z * W + x] !== USE.SIDEWALK) return false;
    const g = G + elevAt(x, z);
    return world.has(x, g, z) && !world.has(x, g + 1, z) && !world.has(x, g + 2, z);
  };
  // a sign faces a direction as one of sixteen turns, 0 south, 4 west, 8 north, 12 east
  const dir16 = (fx, fz) => (Math.round(Math.atan2(-fx, fz) / (Math.PI / 8)) + 16) % 16;
  const signs = [];
  for (const a of xs) {
    for (const b of zs) {
      // where they meet: crossing, or (far more often in this grid) one street
      // running into the side of the other
      const oz0 = Math.max(a.z0, b.z0), oz1 = Math.min(a.z1, b.z1);
      if (oz0 > oz1) continue;
      const ox0 = Math.max(a.x0, b.x0), ox1 = Math.min(a.x1, b.x1);
      let x0, x1, z0, z1;
      if (ox0 <= ox1) { x0 = ox0; x1 = ox1; z0 = oz0; z1 = oz1; }                     // crossing
      else if (b.x1 + 1 === a.x0 || b.x0 - 1 === a.x1) { x0 = b.x0; x1 = b.x1; z0 = oz0; z1 = oz1; }   // T-junction
      else continue;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      for (const [cx, cz] of [[x0 - 1, z0 - 1], [x1 + 1, z0 - 1], [x0 - 1, z1 + 1], [x1 + 1, z1 + 1]]) {
        if (!free(cx, cz)) continue;
        const g = G + elevAt(cx, cz);
        world.set(cx, g + 1, cz, signId(dir16(mx - cx, mz - cz)));
        world.setData(cx, g + 1, cz, { id: 'Sign', tags: signTags(`${a.name}\n${b.name}`) });
        signs.push({ at: [cx, g + 1, cz], text: `${a.name} / ${b.name}` });
        break;                                                   // one corner per junction
      }
    }
  }
  return { names: named.map((c) => c.name), signs };
}

// ---- the centre monument ----------------------------------------------------
// Where /function <city>/build_centered puts you: a block of diamond with an
// alcove you stand in, a sign above the entrance and beacons on top whose
// beams reach the sky (from a structure saved in game). It goes as near the
// middle of the city as it can while staying outdoors, on level ground, clear
// of buildings, off the railway and under open sky, entrance to the street.
function markCentre(world, plan, buildings, G, elevAt, spawns = []) {
  const { W, D, use, mask } = plan;
  const wb = world.box;
  const cx0 = Math.floor((wb.x0 + wb.x1 + 1) / 2), cz0 = Math.floor((wb.z0 + wb.z1 + 1) / 2);
  const inBuilding = (x, z) => buildings.some((b) => x >= b.x0 - 1 && x <= b.x1 + 1 && z >= b.z0 - 1 && z <= b.z1 + 1);
  // a plaza or park is the nicest spot, a pavement next, the roadway last —
  // but being near the middle matters more, so both are weighed together
  const PENALTY = { [USE.PLAZA]: 0, [USE.PARK]: 0, [USE.SIDEWALK]: 5, [USE.ROAD]: 11 };
  const OUTDOOR = new Set([USE.ROAD, USE.SIDEWALK, USE.PLAZA, USE.PARK]);
  const taken = new Set(spawns.map((p) => p.x + ',' + p.z));
  const clearCell = (x, z, height) => {
    if (x < 1 || z < 1 || x >= W - 1 || z >= D - 1) return false;
    if (mask && !mask[z * W + x]) return false;
    if (!OUTDOOR.has(use[z * W + x]) || elevAt(x, z) !== 0) return false;
    if (inBuilding(x, z) || taken.has(x + ',' + z)) return false;
    if (!world.has(x, G, z) || world.get(x, G, z) === MAT.WATER) return false;
    for (let y = G + 1; y <= G + height + 12; y++) if (world.has(x, y, z)) return false;   // room, and open sky for the beams
    return true;
  };
  const { height } = centreCells(0);
  // the cell just outside the entrance, for a corner and a rotation
  const probeOf = (r, ox, oz, fw, fd) => (r === 0 ? [ox + 1, oz - 1] : r === 1 ? [ox + fw, oz + 1]
    : r === 2 ? [ox + 1, oz + fd] : [ox - 1, oz + 1]);
  const best = search();
  if (!best) return null;
  const out = buildCentre(world, best.ox, best.oz, G + 1, best.r);
  return { block: [out.stand[0], G, out.stand[2]], stand: out.stand, sign: out.sign, beacons: out.beacons,
    facing: out.facing, rotation: out.rotation, drift: Math.abs(out.stand[0] - cx0) + Math.abs(out.stand[2] - cz0) };

  function search() {
  let best = null, bestScore = Infinity;
  for (let rad = 0; rad <= 40; rad++) {
    if (best && rad > bestScore) break;                       // nothing further out can score better
    for (let dz = -rad; dz <= rad; dz++)
      for (let dx = -rad; dx <= rad; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== rad) continue;
        const ox = cx0 + dx, oz = cz0 + dz;
        for (const r of [0, 1, 2, 3]) {
          const [fw, fd] = footprint(r);
          let ok = true;
          for (let x = ox; x < ox + fw && ok; x++) for (let z = oz; z < oz + fd && ok; z++) if (!clearCell(x, z, height)) ok = false;
          if (!ok) continue;
          const [px, pz] = probeOf(r, ox, oz, fw, fd);           // the entrance must open onto the street
          if (!clearCell(px, pz, 2)) continue;
          const score = rad + (PENALTY[use[oz * W + ox]] || 11);
          if (score < bestScore) { bestScore = score; best = { r, ox, oz }; }
          break;
        }
      }
  }
  return best;
  }
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
    levels: [0, 1, 2, 3, 4].map((t) => (life.spawns || []).filter((p) => p.type === 'villager' && p.tier === t).length),
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
    centre: life.centre ? life.centre.block.join(', ') : '',
    streets: life.streets ? `${life.streets.names.length} named · ${life.streets.signs.length} signs` : '',
    shops: buildings.reduce((a, b) => a + ((b.furniture && b.furniture.shops) || []).length, 0),
    harbour: life.harbour ? `${life.harbour.warehouses.length} warehouses · ${life.harbour.cranes.length} cranes · ${life.harbour.sidings.length} sidings · ${life.harbour.boats.length} boats` : '',
    canal: life.canal ? `${life.canal.u1 - life.canal.u0 + 1} long · ${life.canal.bridges} bridges` : '',
    dock: !!(life.canal && life.canal.dock),
    art: buildings.reduce((a, b) => a + (b.roomPlans || []).reduce((c, p) => c + ((p && p.art) || 0), 0), 0),
    paintings: (life.spawns || []).filter((p) => p.type === 'painting').length,
    propped: life.unsupported ? `${life.unsupported} blocks made safe (they would have fallen)` : '',
    cutFaces: life.cutFaces ? `${life.cutFaces} cells graded up into the hillside` : '',
    skirt: life.skirt ? `${life.skirt} cells stepping down to the land` : '',
    terrain: stats_terrain ? `fitted to the land · base y ${stats_terrain.baseY} · terraces to ${stats_terrain.maxTerrace}` : '',
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
