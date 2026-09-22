// engine/city.js — turns a plan into blocks.

import { VoxelWorld } from './blockcore.js';
import { makeRng, fbm2, clamp } from './rng.js';
import { generatePlan, frontage, USE } from './plan.js';
import { MAT, THEMES } from './materials.js';
import { makeBuilding, OUTWARD } from './building.js';
import { doorId, DIR, MATERIALS } from './materials.js';
import { farm, pond, scatterFlowers, furnish, bedSpawns, placeBell, golemSpawns } from './life.js';
import { layTransit, trimOverRails } from './transit.js';

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
  transit: 'roads',
  wallHeight: 3,             // perimeter wall, blocks above ground (0 = none)          // 'roads' | 'rails' (railway instead of roads) | 'trams' (rails down the roads)
  farmChance: 0.2,
  pondChance: 0.5,
  furnish: true,
  flowers: true,
  villagers: 60,
  villagersPerGolem: 8,
  golemMax: 12,
  lights: true,
  lamps: true,
  trees: true,
  markings: true,
  budget: 4000000,
};

const GROUND = 1;   // surface layer; players walk at GROUND+1

export function generateCity(cfgIn, onProgress) {
  const cfg = { ...DEFAULTS, ...cfgIn };
  const rng = makeRng(cfg.seed);
  const plan = generatePlan(cfg, rng);
  const world = new VoxelWorld({ budget: cfg.budget });
  const W = plan.W, D = plan.D;
  const at = (x, z) => z * W + x;

  // ---- base + surface ------------------------------------------------------
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      const u = plan.use[at(x, z)];
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
          if (plan.roadAxis[at(x, cz)] !== 1) continue;
          if (x % 4 < 2) world.set(x, GROUND, cz, MAT.LINE);
        }
      } else {
        const cx = Math.floor((c.x0 + c.x1) / 2);
        for (let z = Math.max(0, c.z0); z <= Math.min(D - 1, c.z1); z++) {
          if (plan.roadAxis[at(cx, z)] !== 2) continue;
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

  // ---- railways ------------------------------------------------------------
  const transit = layTransit(world, plan, cfg.transit, GROUND);

  // ---- lots ----------------------------------------------------------------
  const buildings = [];
  const farms = [];
  const beds = [];
  const themeRng = rng.fork();
  const lifeRng = rng.fork();
  for (const lot of plan.lots) {
    if (lot.kind === USE.PARK) { park(world, lot, rng, cfg); continue; }
    if (lot.kind === USE.PLAZA) { plaza(world, lot, rng, cfg); continue; }

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
    const theme = themeRng.pick(THEMES[lot.style] || THEMES.mid);
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
        world.column(x, z, GROUND + 1, GROUND + 3, MAT.BARS);
        world.set(x, GROUND + 4, z, MAT.LANTERN);
      }
    }
  }

  clearDoorways(world, buildings);
  trimOverRails(world, transit);
  const wall = perimeterWall(world, plan, cfg);

  // ---- the village ---------------------------------------------------------
  const bell = cfg.villagers > 0 ? placeBell(world, plan, GROUND) : null;
  let spawns = [];
  if (cfg.villagers > 0) {
    const vs = bedSpawns(world, beds);
    lifeRng.shuffle(vs);
    spawns = vs.slice(0, cfg.villagers);
    const golems = Math.min(cfg.golemMax, Math.ceil(spawns.length / Math.max(1, cfg.villagersPerGolem)));
    spawns = spawns.concat(golemSpawns(world, plan, buildings, golems, lifeRng, GROUND));
  }

  if (transit) spawns = spawns.concat(transit.carts);

  const stats = summarise(world, plan, buildings, cfg, { farms, beds, spawns, bell, transit, wall });
  return { world, plan, buildings, cfg, stats, farms, spawns, bell, transit, wall };
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
  const { W, D } = plan;
  const ring = [];
  for (let x = 0; x < W; x++) { ring.push([x, 0]); ring.push([x, D - 1]); }
  for (let z = 1; z < D - 1; z++) { ring.push([0, z]); ring.push([W - 1, z]); }
  for (const [x, z] of ring) {
    world.set(x, GROUND, z, MAT.STONEBRICK);
    for (let y = GROUND + 1; y <= GROUND + h; y++) world.set(x, y, z, y === GROUND + h ? MAT.SMOOTH : MAT.STONEBRICK);
  }
  if (h < 3) return { height: h, gates: [] };      // too low for a doorway: step over it
  // Gates: a double door near the middle of each side, facing out, hinges on
  // the outer edges. The way in only has to be walkable: rails are fine to
  // step onto (on a narrow ring road the loop track runs right behind the
  // wall). If the middle is blocked (a buffer, a lamp) the gate slides along
  // the wall to the nearest spot that is clear.
  const CLOCKWISE = { north: 'east', east: 'south', south: 'west', west: 'north' };
  const walkIn = (x, z) => {
    const f1 = world.get(x, GROUND + 1, z), f2 = world.get(x, GROUND + 2, z);
    return world.has(x, GROUND, z) && (f1 === -1 || MATERIALS.isPassable(f1)) && f2 === -1;
  };
  const sides = [
    { face: 'north', len: W, cell: (i) => [i, 0], along: 'east' },
    { face: 'south', len: W, cell: (i) => [i, D - 1], along: 'east' },
    { face: 'west', len: D, cell: (i) => [0, i], along: 'south' },
    { face: 'east', len: D, cell: (i) => [W - 1, i], along: 'south' },
  ];
  const gates = [];
  for (const g of sides) {
    const [ox, oz] = OUTWARD[g.face];
    const mid = Math.floor(g.len / 2) - 1;
    let placed = null;
    for (let d = 0; d < g.len / 2 && !placed; d++) {
      for (const i of d === 0 ? [mid] : [mid - d, mid + d]) {
        if (i < 2 || i + 1 > g.len - 3) continue;          // keep clear of the corners
        const cells = [g.cell(i), g.cell(i + 1)];
        const inside = cells.map(([x, z]) => [x - ox, z - oz]);
        if (inside.every(([x, z]) => walkIn(x, z))) { placed = { cells, inside }; break; }
      }
    }
    if (!placed) continue;
    const secondIsRight = CLOCKWISE[g.face] === g.along;
    placed.cells.forEach(([x, z], i) => {
      const hinge = (i === 1) === secondIsRight ? 1 : 0;
      world.set(x, GROUND + 1, z, doorId('spruce', DIR[g.face], false, hinge));
      world.set(x, GROUND + 2, z, doorId('spruce', DIR[g.face], true, hinge));
    });
    gates.push({ face: g.face, cells: placed.cells, inside: placed.inside });
  }
  return { height: h, gates };
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
    ? (THEMES[cfg.style] || THEMES.mid).find((t) => t.name === cfg.themeName) || rng.pick(THEMES[cfg.style] || THEMES.mid)
    : rng.pick(THEMES[cfg.style] || THEMES.mid);

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
function park(world, lot, rng, cfg) {
  for (let z = lot.z0; z <= lot.z1; z++)
    for (let x = lot.x0; x <= lot.x1; x++) world.set(x, GROUND, z, MAT.GRASS);
  // crossing paths
  const cx = Math.round((lot.x0 + lot.x1) / 2), cz = Math.round((lot.z0 + lot.z1) / 2);
  for (let x = lot.x0; x <= lot.x1; x++) world.set(x, GROUND, cz, MAT.PATH);
  for (let z = lot.z0; z <= lot.z1; z++) world.set(cx, GROUND, z, MAT.PATH);
  if (cfg.pondChance > 0 && rng.chance(cfg.pondChance)) pond(world, lot, cx, cz, rng, GROUND);
  if (cfg.trees) {
    for (let z = lot.z0 + 1; z <= lot.z1 - 1; z++) {
      for (let x = lot.x0 + 1; x <= lot.x1 - 1; x++) {
        if (x === cx || z === cz) continue;
        if (world.get(x, GROUND, z) !== MAT.GRASS || world.has(x, GROUND + 1, z)) continue;
        if (fbm2(x, z, cfg.seed ^ 0x77e2, 4) > 0.72 && rng.chance(0.45)) tree(world, x, z, rng);
      }
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

function tree(world, x, z, rng) {
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
    wallHeight: life.wall ? life.wall.height : 0,
    gates: life.wall ? life.wall.gates.length : 0,
  };
}
