// engine/city.js — turns a plan into blocks.

import { VoxelWorld, N } from './blockcore.js';
import { makeRng, fbm2, clamp, hash2 } from './rng.js';
import { makeShapedTower, twistFits } from './twist.js';

// the shapes a shaped tower can take, with their share
const TOWER_SHAPES = [['square-twist', 0.30], ['octagon-twist', 0.15], ['hexagon-twist', 0.15],
  ['taper-twist', 0.15], ['round', 0.12], ['round-helix', 0.13]];
function towerShape(u, shapes = TOWER_SHAPES) {
  let acc = 0;
  for (const [name, share] of shapes) { acc += share; if (u < acc) return name; }
  return shapes[0][0];
}
import { plantBeds } from './building.js';
import { courtyardPlan, makeCourtyard } from './courtyard.js';
import { hostileSpawns } from './hostiles.js';
import { buildDome } from './dome.js';
import { lightUp, TARGET, TARGET_OUT } from './lighting.js';
import { verifyBuilding } from './verify.js';
import { planStyleDistricts } from './districts.js';
import { digUnder, reserveUnder } from './underground.js';
import { megalith } from './megaliths.js';
import { fishSpawns } from './fish.js';
import { generatePlan, frontage, USE } from './plan.js';
import { MAT, THEMES, stairId, WEIRDO } from './materials.js';
import { makeBuilding, OUTWARD } from './building.js';
import { doorId, DIR, MATERIALS } from './materials.js';
import { farm, pond, scatterFlowers, furnish, bedSpawns, placeBell, golemSpawns, ranch, pandaGrove, catSpawns, RANCH_ANIMALS } from './life.js';
import { layTransit, trimOverRails, sweepStrandedRails, edgeDistance } from './transit.js';
import { planCanal, planCanals, buildCanal, USE_CANAL, WATER_HI } from './water.js';
import { planHarbour, buildHarbour, harbourSidings } from './harbour.js';
import { planBridges, buildBridges, bridgeRails } from './bridges.js';
import { chooseLandmarks, buildLandmark } from './landmarks.js';
import { planHills, liftBlocks, cutStairs, shiftBuilding, walkCity } from './terrain.js';
import { styleOf, remapTable, STYLES } from './styles.js';
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
  bridges: true,             // join outlying districts to the city with viaducts
  bridgeMinBlocks: 3,        // a district smaller than this is not worth a bridge
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
  fish: true,                // fish in the ponds, the canal and the harbour basin
  twistChance: 0.25,         // share of downtown towers on square-ish lots built as a shaped tower
                             // (twisting square, octagon or hexagon, tapered twist, round, round with helical ribs)
  megaliths: true,           // Celtic monuments in parks: a menhir, a dolmen or a stone circle
  megalithChance: 0.5,       // share of parks that get one
  courtyardChance: 0.3,      // share of mid-rise lots, where one fits, built as an L or U round a courtyard
  hostiles: false,           // populate also summons hostile mobs (the hostiles functions are always there)
  hostileCount: 24,          // how many: daylight-proof kinds, a mix for the city's style
  dome: false,               // a glass dome over the whole city, sealed all round (invented cities only)
  lightAll: true,            // light every spot a hostile mob could spawn (lighting.js)
  stilts: false,             // the city on stilts over open water (invented cities only)
  floating: false,           // the city on islands floating in the sky, chasms between them (invented cities only)
  cliff: false,              // the city in tiers up a cliff, stairs between them (invented cities only)
  underground: true,         // cellars under houses, a crypt under the cathedral (underground.js)
  mixStyles: false,          // several styles, one to a district (districts.js)
  mixList: ['modern', 'medieval', 'eastasian', 'artdeco'],   // the styles ticked for mixing
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
let STYLE_AT = null;          // (x, z) -> the style there, when a city mixes styles

let stats_terrain = null;
let stats_unsupported = 0;
let stats_freedDoors = 0;

export function generateCity(cfgIn, onProgress) {
  stats_terrain = null;
  stats_unsupported = 0;
  stats_freedDoors = 0;
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
  // a walled fortress town: a curtain wall, narrow streets, small lots, low
  // buildings, no trams; sliders still at their defaults are set for it
  if (STYLE.fortress) {
    cfg.wallHeight = Math.max(cfg.wallHeight | 0, 9);
    // (narrow streets, unless the town floats: then the chasms want them wide)
    if (cfg.streetWidth === DEFAULTS.streetWidth && !cfg.floating) cfg.streetWidth = 3;
    if (cfg.avenueWidth === DEFAULTS.avenueWidth && !cfg.floating) cfg.avenueWidth = 5;
    if (cfg.lotDowntown === DEFAULTS.lotDowntown) cfg.lotDowntown = 16;
    if (cfg.lotSuburb === DEFAULTS.lotSuburb) cfg.lotSuburb = 9;
    if (cfg.maxFloors === DEFAULTS.maxFloors) cfg.maxFloors = 6;
    if (cfg.parkChance === DEFAULTS.parkChance) cfg.parkChance = 0.05;
    // (the Streets setting is the player's: Roads is already the default)
  }
  // a glass city climbs by stairs
  if (STYLE.glass) cfg.useStairs = true;
  // a city on stilts stands over flat water
  if (cfg.stilts && !cfg.terrain) cfg.hills = 0;
  // a cliff city: tiers, so no water across them (canal, harbour), and on the ground
  if (cfg.cliff && !cfg.terrain) { cfg.canal = false; cfg.harbour = false; cfg.stilts = false; cfg.floating = false; }
  if (cfg.terrain) cfg.cliff = false;
  // a floating city: its main streets are chasms between islands; no stilts, no dome
  if (cfg.floating && !cfg.terrain) {
    cfg.canal = true; cfg.stilts = false; cfg.dome = false; cfg.harbour = false;
    // the main streets planned wide, so the chasms between the islands are wide
    if (cfg.avenueWidth === DEFAULTS.avenueWidth) cfg.avenueWidth = 13;
    if (cfg.streetWidth === DEFAULTS.streetWidth) cfg.streetWidth = 9;
  }
  // an Art Deco city: towers step back often, for the wedding-cake silhouette
  if (STYLE.deco) {
    cfg.setbacks = true;
    if (cfg.setbackEvery === DEFAULTS.setbackEvery) cfg.setbackEvery = 4;
  }
  // a Venetian city: canals for main streets, piazzas for open spaces, a flat
  // lagoon, tall floors (room for the pointed windows), no trams
  if (STYLE.venetian) {
    cfg.canal = true;
    cfg.piazzas = true;
    // (the Streets setting is the player's: Roads is already the default)
    if (cfg.hills === DEFAULTS.hills) cfg.hills = 0;
    if (cfg.pitch === DEFAULTS.pitch) cfg.pitch = 6;
    if (cfg.parkChance === DEFAULTS.parkChance) cfg.parkChance = 0.16;
    if (cfg.maxFloors === DEFAULTS.maxFloors) cfg.maxFloors = 6;
  }
  const rng = makeRng(cfg.seed);
  const plan = generatePlan(cfg, rng);
  const world = new VoxelWorld({ budget: cfg.budget });
  const W = plan.W, D = plan.D;
  // organic cities carry their outline, so the export leaves the land outside it alone
  if (cfg.outline === 'organic' || cfg.terrain) world.cityMask = { W, D, data: plan.mask };
  // the canal takes over one long street before anything is laid on it; a
  // Venetian city makes canals of all its main streets
  const floating = !!(cfg.floating && !cfg.terrain);
  const canals = (STYLE.venetian || floating) && cfg.canal ? planCanals(plan, cfg, edgeDistance(plan), 6)
    : [planCanal(plan, cfg, edgeDistance(plan))].filter(Boolean);
  // over a chasm: no dock, and both banks railed whatever the street's width
  // (in a narrow street the chasm is a one-block crack, so each bank keeps a
  // walkway two wide: a railing on its inner row, the outer row to walk)
  if (floating) for (const c of canals) {
    c.noDock = true; c.railed = true; c.chasm = true;
    // A wide street gives a wide chasm: all of it but a walkway two wide on each
    // bank (railed on its inner row); the crossings and footbridges stay decks.
    if (c.w >= 9) {
      const decks = new Set();
      for (const [b0, b1] of c.bridgeSpans) for (let u = b0; u <= b1; u++) decks.add(u);
      for (const [f0, f2] of c.footbridges) for (let u = f0; u <= f2; u++) decks.add(u);
      const n0 = c.a0 + 2, n1 = c.a1 - 2;
      for (let u = c.u0; u <= c.u1; u++) {
        if (decks.has(u)) continue;
        for (let a = n0; a <= n1; a++) {
          const [x, z] = c.cell(u, a);
          if (plan.use[z * plan.W + x] === USE.SIDEWALK) plan.use[z * plan.W + x] = USE_CANAL;
        }
      }
      c.ch0 = n0; c.ch1 = n1;
    }
    if (c.w < 7) {
      const mid = Math.floor((c.ch0 + c.ch1) / 2);
      for (let u = c.u0; u <= c.u1; u++)
        for (const a of [c.ch0, c.ch1]) {
          if (a === mid) continue;
          const [x, z] = c.cell(u, a);
          if (plan.use[z * plan.W + x] === USE_CANAL) plan.use[z * plan.W + x] = USE.SIDEWALK;
        }
      c.ch0 = c.ch1 = mid;
    }
  }
  const canal = canals[0] || null;
  // ---- styles by district: the ticked styles shared out among districts ------
  const mixNames = cfg.mixStyles ? [...new Set((cfg.mixList || []).filter((n) => STYLES[n]))] : [];
  const SD = mixNames.length >= 2 ? planStyleDistricts(plan, cfg, mixNames, cfg.cityStyle) : null;
  STYLE_AT = SD ? (x, z) => styleOf(SD.at(x, z)) : null;
  const lotStyleOf = (lot) => (SD ? styleOf(SD.lotStyle(lot)) : STYLE);
  // (landmarks and parks look it up through cfg; kept out of the config's own fields)
  Object.defineProperty(cfg, 'styleAt', { value: STYLE_AT, enumerable: false, configurable: true, writable: true });
  const harbourPlan = planHarbour(plan, canal, cfg);
  // districts the outline kept but could not join up: give them viaducts
  const bridgeSpans = planBridges(plan, cfg, plan.districts || []);
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
  for (const c of canals) buildCanal(world, plan, c, GROUND);

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
    for (const cn of canals) {
      const cells = [];
      for (let u = cn.u0; u <= cn.u1; u++)
        for (let a = cn.a0; a <= cn.a1; a++) {
          const [x, z] = cn.cell(u, a);
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
  const megaliths = [];
  const ponds = [];
  const courtyards = [];
  const beds = [];
  const themeRng = rng.fork();
  const lifeRng = rng.fork();
  // Every building furnishes from its own stream (0.27): how many draws a room
  // takes depends on what goes in it, and the shared stream goes on to decide
  // farms, trees, cacti and more, so a change to any interior would otherwise
  // move things all over the city. A fork costs the shared stream one draw
  // whatever the building holds, and is well mixed (streams seeded straight
  // from a lot's coordinates were not: rooms came out worse from them).
  const furnRng = () => lifeRng.fork();
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
            const fw = furnish(world, wing, furnRng(wing), { useStairs: cfg.useStairs, paintings: !lotStyleOf(lot).glass });
            wing.beds = fw.beds; wing.furniture = fw;
            for (const b of fw.beds) beds.push(b);
          } else wing.beds = [];
        }
        if (L.rec) {
          buildings.push(L.rec);
          // (the crypt's stairs kept clear before the church is furnished)
          if (cfg.underground && L.kind === 'church') reserveUnder(world, L.rec, (L.rec.pitch || 5) + 1);
          if (cfg.furnish) {
            const f = furnish(world, L.rec, furnRng(L.rec), { useStairs: cfg.useStairs, paintings: !lotStyleOf(lot).glass });
            L.rec.beds = f.beds; L.rec.furniture = f;
            for (const b of f.beds) beds.push(b);
          } else L.rec.beds = [];
        }
        continue;
      }
    }
    if (lot.kind === USE.PARK) { park(world, lot, rng, cfg, lifeRng, pandas, megaliths, ponds); continue; }
    if (lot.kind === USE.PLAZA) { plaza(world, lot, rng, cfg); continue; }

    if (lot.pen) {
      const rch = ranch(world, lot, frontage(plan, lot).side, lifeRng, GROUND, plan, lot.pen);
      if (rch) { ranches.push(rch); lot.island = true; continue; }
    }
    if (lot.style === 'house' && cfg.farmChance > 0 &&
        lot.x1 - lot.x0 + 1 >= 7 && lot.z1 - lot.z0 + 1 >= 7 && lifeRng.chance(cfg.farmChance)) {
      const f = farm(world, lot, frontage(plan, lot).side, lifeRng, GROUND, plan);
      if (f) { farms.push(f); lot.island = true; continue; }
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
    const LS = lotStyleOf(lot);                          // the lot's own style (its district's, when mixed)
    const theme = themeRng.pick(LS.themes[lot.style] || LS.themes.mid);
    // An L or U round a courtyard: decided per lot from a hash, and built (and
    // furnished) from its own random stream. Every wing is a whole building.
    if (cfg.courtyardChance > 0 && lot.style === 'mid') {
      const cp = courtyardPlan(fx0, fz0, fx1, fz1, front.side);
      if (cp.kinds.length && hash2(lot.x0 + 7, lot.z0 + 3, (cfg.seed ^ 0xc0a7) | 0) < cfg.courtyardChance) {
        const crng = makeRng(((lot.x0 * 40503) ^ (lot.z0 * 65599) ^ cfg.seed ^ 0xc0a7) >>> 0);
        // a U needs a lot 21 across (three wings of seven): where one fits, it is usually built
        const kind = cp.kinds.includes('U') && crng.chance(0.7) ? 'U' : 'L';
        const cy = makeCourtyard(world, {
          x0: fx0, z0: fz0, x1: fx1, z1: fz1, face: front.side, kind, mirror: crng.chance(0.5), G: GROUND, flowers: cfg.flowers,
          building: (p) => makeBuilding(world, {
            detail: cfg.detail, arcade: !LS.venetian, eaves: !!LS.eaves, lancets: !!LS.lancets, deco: !!LS.deco, rustic: !!LS.rustic,
            x0: p.x0, z0: p.z0, x1: p.x1, z1: p.z1, noStairs: p.noStairs,
            floors: lot.floors, pitch: cfg.pitch, groundY: GROUND,
            style: 'mid', facing: p.facing, theme,
            roofAccess: cfg.roofAccess, useStairs: cfg.useStairs, stairStyle: cfg.stairStyle, lights: cfg.lights,
            setback: false, setbackEvery: 99,
          }, crng),
        }, crng);
        if (cy) {
          courtyards.push(cy);
          // the stair wing is furnished first: each other wing's rooms are then
          // judged reachable (up that stair, through the openings) as it will stand
          for (const rec of [...cy.wings].sort((a, b) => (b.core ? 1 : 0) - (a.core ? 1 : 0))) {
            buildings.push(rec);
            if (cfg.furnish) {
              const f = furnish(world, rec, crng, { useStairs: cfg.useStairs, paintings: !LS.glass });
              rec.beds = f.beds; rec.furniture = f;
              for (const b of f.beds) beds.push(b);
            } else rec.beds = [];
          }
          continue;
        }
        // a wing would not go up: clear what did and build the lot the usual way
        for (let z = fz0; z <= fz1; z++) for (let x = fx0; x <= fx1; x++) {
          for (let y = GROUND + 1; y <= GROUND + 12 * Math.max(4, cfg.pitch); y++) world.clear(x, y, z);
          world.set(x, GROUND, z, MAT.SIDEWALK);
        }
      }
    }
    // A twisting tower: decided per lot from a hash, and built from its own
    // random stream, so a chance of 0 leaves every city exactly as it was.
    // (a style may have its own tower shapes and share: the East Asian style's pagodas)
    const shapedChance = LS.shapedChance !== undefined ? LS.shapedChance : cfg.twistChance;
    const twisting = shapedChance > 0 && lot.style === 'tower' && !LS.rustic &&
      twistFits(fx0, fz0, fx1, fz1, lot.floors) && hash2(lot.x0, lot.z0, (cfg.seed ^ 0x7157) | 0) < shapedChance;
    const rec = twisting ? makeShapedTower(world, {
      x0: fx0, z0: fz0, x1: fx1, z1: fz1,
      floors: lot.floors, pitch: cfg.pitch, groundY: GROUND,
      facing: front.side, theme, useStairs: cfg.useStairs, lights: cfg.lights,
      shape: towerShape(hash2(lot.z0, lot.x0, (cfg.seed ^ 0x5a9e) | 0), LS.towerShapes),
    }, makeRng(((lot.x0 * 73856093) ^ (lot.z0 * 19349663) ^ cfg.seed ^ 0x7157) >>> 0)) : makeBuilding(world, {
      detail: cfg.detail, arcade: !LS.venetian, eaves: !!LS.eaves, lancets: !!LS.lancets, deco: !!LS.deco,
      rustic: !!LS.rustic,
      x0: fx0, z0: fz0, x1: fx1, z1: fz1,
      floors: lot.floors, pitch: cfg.pitch, groundY: GROUND,
      style: lot.style, facing: front.side, theme,
      roofAccess: cfg.roofAccess, useStairs: cfg.useStairs, stairStyle: cfg.stairStyle, lights: cfg.lights,
      setback: cfg.setback, setbackEvery: cfg.setbackEvery,
    }, rng);

    if (rec) {
      buildings.push(rec);
      // (a cellar's stairs kept clear before the house is furnished)
      if (cfg.underground && rec.style === 'house') reserveUnder(world, rec, 4);
      if (cfg.furnish) {
        const f = furnish(world, rec, furnRng(rec), { useStairs: cfg.useStairs, paintings: !LS.glass });
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
        // then the house's own beds and a picket fence along the front, open
        // where the path runs; last, so the yard above is laid out as before
        if (cfg.detail !== false) {
          plantBeds(world, rec);
          rec.fence = picketFence(world, lot, rec.facing, GROUND);
        }
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
  let cliffWays = null;
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
      // the hearth rides up with its house
      if (rec.furniture && rec.furniture.fireplace) { rec.furniture.fireplace.at[1] += e; rec.furniture.fireplace.jamb[1] += e; }
      for (const l of (rec.fence && rec.fence.lanterns) || []) l[1] += elevAt(l[0], l[2]);   // gate lanterns ride up too
    }
    for (const rch of ranches) for (const a of rch.animals) a.y += elevAt(a.x, a.z);
    for (const p of pandas) p.y += elevAt(p.x, p.z);
    for (const cy of courtyards) if (cy.lamp) cy.lamp[1] += elevAt(cy.lamp[0], cy.lamp[2]);
    // torii and stone lanterns in the parks ride up too
    for (const lot of plan.lots) {
      for (const g of lot.torii || []) g.at[1] += elevAt(g.at[0], g.at[2]);
      for (const l of lot.stoneLanterns || []) l[1] += elevAt(l[0], l[2]);
    }
    // a cliff city: the ways up from each tier to the next
    if (hills.cliff) cliffWays = cliffStairs(world, plan, hills, GROUND);
    // standing stones ride up with their park
    for (const m of megaliths) {
      const e = elevAt((m.x0 + m.x1) >> 1, (m.z0 + m.z1) >> 1);
      for (const st of m.stones) st[1] += e;
      m.topY += e;
    }
    for (const L of landmarks) {
      if (L.bell) L.bell[1] += elevAt(L.bell[0], L.bell[2]);
      if (L.belfryBell) L.belfryBell[1] += elevAt(L.belfryBell[0], L.belfryBell[2]);
      if (L.faces) for (const f of L.faces) f.centre[1] += elevAt(f.centre[0], f.centre[2]);
      // every point a landmark records rides up with the ground under it —
      // single spots and lists of them alike, so nothing is left pointing at
      // where the block used to be
      const lift = (p) => { if (Array.isArray(p) && p.length === 3 && p.every((n) => typeof n === 'number')) p[1] += elevAt(p[0], p[2]); };
      for (const key of ['spireTop', 'lantern', 'cupolaBell', 'nameSign', 'fountain', 'gate', 'step', 'heap']) if (L[key]) lift(L[key]);
      // the Gothic church's own records: the rose window's hub and the flèche tip
      if (L.gothic && L.gothic.rose) lift(L.gothic.rose.centre);
      if (L.fleche && L.spireTop) L.fleche.tipY = L.spireTop[1];
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
  // (a cliff city has no wall yet: built on the base level it would sit buried in
  // the upper tiers, its gates under their streets)
  const wall = hills.cliff ? null : STYLE.fortress ? fortressWall(world, plan, cfg) : perimeterWall(world, plan, cfg);

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
  for (const cn of canals) if (cn.dock) spawns = spawns.concat(cn.dock.boats);
  if (harbour) spawns = spawns.concat(harbour.boats);
  for (const rec of buildings) for (const p of (rec.furniture && rec.furniture.paintings) || []) spawns.push(p);

  // ---- city style: restyle the role materials, then snow -----------------------
  // ---- on stilts: open water under the streets and buildings ----------------
  const stilts = cfg.stilts && !cfg.terrain ? stiltCity(world, plan, buildings, GROUND) : null;
  // ---- floating: chasms through, a rocky underside under every island -------
  const islands = floating ? floatCity(world, plan, canals, GROUND, cfg) : null;
  // ---- underground: cellars under houses, a crypt under the cathedral ---------
  // (none on stilts or in the sky: there is no ground under them to dig)
  const rooms = [];
  if (cfg.underground && !stilts && !islands) {
    const church = landmarks.find((L) => L.kind === 'church');
    if (church && church.rec) { const c = digUnder(world, church.rec, { kind: 'crypt', depth: (church.rec.pitch || 5) + 1 }); if (c) { c.of = 'church'; rooms.push(c); } }
    for (const b of buildings) {
      if (b.style !== 'house' || b.landmark) continue;
      const c = digUnder(world, b, { kind: 'cellar', depth: 4 });     // (a cellar three high: a short flight fits a house)
      if (c) rooms.push(c);
    }
  }
  if (SD) for (const name of SD.names) applyStyle(world, plan, styleOf(name), (x, z) => GROUND + elevAt(x, z), (x, z) => SD.at(x, z) === name);
  else applyStyle(world, plan, STYLE, (x, z) => GROUND + elevAt(x, z));

  // ---- the bridges between districts -----------------------------------------
  const bridges = bridgeSpans.length ? buildBridges(world, plan, bridgeSpans, hills, GROUND, cfg.terrain, buildings, cfg.transit !== 'roads' ? transit : null) : [];
  if (bridges.length && transit && cfg.transit !== 'roads') bridgeRails(world, bridges, transit, GROUND);

  // ---- blending the edge into the land ---------------------------------------
  const skirt = cfg.terrain && hills.rolling ? buildSkirt(world, plan, hills, cfg.terrain, GROUND, buildings) : 0;

  // ---- facing the cuts into the hillside -------------------------------------
  const cutFaces = cfg.terrain && hills.rolling ? faceCuts(world, plan, hills, cfg.terrain, GROUND, buildings) : 0;

  // Last of all — after the viaducts have cut through whatever was at grade,
  // after their spurs have joined what they could, and after the skirt and
  // the face cuts have taken their bites out of the city's edge — any track
  // left leading nowhere is taken up. It has to come last: each of those
  // steps can sever a line, and a sweep run before them would tidy a world
  // that no longer exists.
  if (transit && cfg.transit !== 'roads') sweepStrandedRails(world, transit, GROUND);

  // ---- the centre marker -----------------------------------------------------
  const centre = cfg.centreMark ? markCentre(world, plan, buildings, GROUND, elevAt, spawns, stairRuns) : null;
  if (centre) world.centre = [centre.block[0], centre.block[2]];   // the export centres on it

  // A doorway opens onto the cell in front of it, and that cell's surface has
  // to be at the door's own level. Settling the ground can leave the pavement
  // a block proud of a lot, which walls the door in. Where that happened, the
  // step is taken down.
  {
    let freed = 0;
    for (const rec of buildings) {
      for (const [dx, dz] of rec.doorCells || []) {
        const [ox, oz] = rec.door.out;
        const x = dx + ox, z = dz + oz, y = rec.door.y;
        const id = world.get(x, y, z);
        if (id < 0 || MATERIALS.isPassable(id)) continue;                 // already clear
        if (plan.mask && !plan.mask[z * plan.W + x]) continue;
        const below = world.get(x, y - 1, z);
        world.clear(x, y, z);
        if (below === -1) world.set(x, y - 1, z, id);                     // keep something to stand on
        for (let h = 1; h <= 2; h++) {
          const above = world.get(x, y + h, z);
          if (above >= 0 && !MATERIALS.isPassable(above)) world.clear(x, y + h, z);
        }
        freed++;
      }
    }
    stats_freedDoors = freed;
  }

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

  // ---- ponds get a deep middle: after every lift, so each pond's own surface ----
  // height is known (flat, terraced or rolling ground alike). A pond cell with
  // pond water on at least three sides takes a second layer of water under it
  // and clay under that; the rim stays a one-deep shelf. Fish then live in the bottom
  // layer, under water, where they cannot leap out onto the bank.
  deepenPonds(world, ponds);
  const spawners = cfg.fish ? pondSpawners(world, ponds) : [];

  // ---- fish: last, once no more water will change ----------------------------
  // their own random stream, so a city's blocks and other spawns are the same
  // with fish on or off
  if (cfg.fish) spawns = spawns.concat(fishSpawns(world, makeRng((cfg.seed ^ 0x0f15b0a7) >>> 0)));
  // ---- hostile mobs: kept apart from the spawns, so they only come on request ----
  const hostiles = hostileSpawns(world, plan, buildings, makeRng((cfg.seed ^ 0x40571e) >>> 0),
    { count: cfg.hostileCount, style: cfg.cityStyle, top: GROUND + 90, bottom: GROUND - 4 });
  // ---- the dome: last of all, over everything (not on real ground) ------------
  const dome = cfg.dome && !cfg.terrain
    ? buildDome(world, GROUND, { ground: remapTable(STYLE, FLOWERS).get(MAT.GRASS) ?? MAT.GRASS,
      beams: centre ? centre.beacons.map(([x, , z]) => x + ',' + z) : [] })       // the beacons shine up through it
    : null;
  // ---- no dark corners: light every spot a hostile mob could spawn -----------
  // (last of all, over everything, dome included: see lighting.js)
  let lighting = null;
  if (cfg.lightAll) {
    const { W, D, mask } = plan;
    const inPlan = (x, z) => x >= 0 && z >= 0 && x < W && z < D && (!mask || mask[z * W + x]);
    // (a fitted city's cuts graded up into the hillside stay the natural slope
    // they were graded to be: the wild land round them is the hillside's own)
    const graded = world.cutFaces || null;
    const inCity = (x, z) => inPlan(x, z) && !(graded && graded.has(x + ',' + z));
    const inside = dome ? (x, z) => (x - dome.cx) ** 2 + (z - dome.cz) ** 2 < dome.R * dome.R : inCity;
    const keep = dome ? (x, y, z) => ((x - dome.cx) ** 2 + (z - dome.cz) ** 2) / dome.R ** 2 + ((y - GROUND) / dome.c) ** 2 < 1 : () => true;
    // inside a building (below its roof) a spot wants a properly lit room; outside, any light at all
    // which columns lie inside a building, and between what heights (a grid: asked
    // of every one of a city's spawn spots, scanning the buildings was slow)
    const inLo = new Int16Array(W * D).fill(32767), inHi = new Int16Array(W * D).fill(-32768);
    for (const b of buildings)
      for (let z = Math.max(0, b.z0); z <= Math.min(D - 1, b.z1); z++)
        for (let x = Math.max(0, b.x0); x <= Math.min(W - 1, b.x1); x++) {
          const i = z * W + x;
          inLo[i] = Math.min(inLo[i], b.groundY + 1); inHi[i] = Math.max(inHi[i], b.roofY);
        }
    const indoor = (x, y, z) => x >= 0 && z >= 0 && x < W && z < D && y >= inLo[z * W + x] && y <= inHi[z * W + x];
    const nearStairs = (x, z) => buildings.some((b) => b.core && x >= b.core.x0 - 1 && x <= b.core.x1 + 1 && z >= b.core.z0 - 1 && z <= b.core.z1 + 1);
    lighting = lightUp(world, inside, {
      keep, target: (x, y, z) => (indoor(x, y, z) ? TARGET : TARGET_OUT), noHang: nearStairs,
      groundAt: (x, z) => (inPlan(x, z) ? GROUND + elevAt(x, z) : GROUND),
      // a building's floors and roof are floor, whatever is beside a block
      floorLevel: (x, y, z) => buildings.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && (b.floorYs.includes(y) || y === b.roofY)),
      // the safety net: every building touched must still walk through
      check: (changes) => {
        const undone = [];
        for (const b of buildings) {
          const mine = [];
          changes.forEach(([x, , z], i) => { if (x >= b.x0 - 2 && x <= b.x1 + 2 && z >= b.z0 - 2 && z <= b.z1 + 2) mine.push(i); });
          if (!mine.length) continue;
          if (!verifyBuilding(world, b).ok) {
            // take them out and look again
            for (const i of mine) { const [x, y, z, old] = changes[i]; if (old === -1) world.clear(x, y, z); else world.set(x, y, z, old); }
            if (verifyBuilding(world, b).ok) { for (const i of mine) { const [x, y, z, , id] = changes[i]; world.set(x, y, z, id); } undone.push(...mine); }
            else for (const i of mine) { const [x, y, z, , id] = changes[i]; world.set(x, y, z, id); }
          }
        }
        return undone;
      },
      floorLight: (x, z) => { const S = STYLE_AT ? STYLE_AT(x, z) : STYLE; return S.lightBlock !== undefined ? S.lightBlock : MAT.LANTERN; },
      hang: MAT.LAMP_HANG,
    });
    delete lighting.map; delete lighting.changes;
  }

  const shell = cfg.terrain ? terrainShell(plan, cfg.terrain, GROUND, cfg.cityStyle) : null;
  const stats = summarise(world, plan, buildings, cfg, { farms, beds, spawns, bell, transit, wall, ranches, landmarks, hills, stairRuns, reach, canal, centre, streets, harbour, skirt, cutFaces, bridges, megaliths, ponds, courtyards, hostiles, dome, canals, lighting, styleDistricts: SD, spawners, stilts, islands, cliffWays, rooms, unsupported: stats_unsupported });
  return { world, plan, buildings, cfg, stats, shell, bridges, farms, ranches, spawns, bell, transit, wall, landmarks, canal, centre, streets, harbour, harbourPlan, megaliths, ponds, courtyards, hostiles, dome, canals, lighting, styleDistricts: SD, spawners, stilts, islands, cliffWays, rooms,
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
function faceCuts(world, plan, hills, terrain, G, buildings = []) {
  const { W, D, mask } = plan;
  const { elev } = hills;
  // grading must not wall in a doorway: the buildings are already up
  const doorways = new Set();
  for (const rec of buildings)
    for (const [dx, dz] of rec.doorCells || [])
      for (let ox = -2; ox <= 2; ox++) for (let oz = -2; oz <= 2; oz++) doorways.add((dx + ox) + ',' + (dz + oz));
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
        if (doorways.has(nx + ',' + nz)) continue;         // never in front of a door
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
function buildSkirt(world, plan, hills, terrain, G, buildings = []) {
  const { W, D, mask } = plan;
  const { elev } = hills;
  // the skirt steps down outside the city, and must not bury a doorway
  const doorways = new Set();
  for (const rec of buildings)
    for (const [dx, dz] of rec.doorCells || [])
      for (let ox = -2; ox <= 2; ox++) for (let oz = -2; oz <= 2; oz++) doorways.add((dx + ox) + ',' + (dz + oz));
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
      if (doorways.has(x + ',' + z)) continue;                   // nor in front of a door
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
function markCentre(world, plan, buildings, G, elevAt, spawns = [], stairRuns = []) {
  const { W, D, use, mask } = plan;
  const wb = world.box;
  const cx0 = Math.floor((wb.x0 + wb.x1 + 1) / 2), cz0 = Math.floor((wb.z0 + wb.z1 + 1) / 2);
  // buildings, and the cell round each, as a grid (a big city's search looks at
  // many cells; asking every building about each one was too slow). margin 1
  // keeps a cell clear between the mark and any building; the last resort is 0.
  const near = [new Uint8Array(W * D), new Uint8Array(W * D)];
  for (const b of buildings)
    for (const [m, g] of [[1, near[0]], [0, near[1]]])
      for (let z = Math.max(0, b.z0 - m); z <= Math.min(D - 1, b.z1 + m); z++)
        for (let x = Math.max(0, b.x0 - m); x <= Math.min(W - 1, b.x1 + m); x++) g[z * W + x] = 1;
  let nearGrid = near[0];
  const inBuilding = (x, z) => nearGrid[z * W + x] === 1;
  // a plaza or park is the nicest spot, a pavement next, the roadway last —
  // but being near the middle matters more, so both are weighed together
  const PENALTY = { [USE.PLAZA]: 0, [USE.PARK]: 0, [USE.SIDEWALK]: 5, [USE.ROAD]: 11 };
  const OUTDOOR = new Set([USE.ROAD, USE.SIDEWALK, USE.PLAZA, USE.PARK]);
  const taken = new Set(spawns.map((p) => p.x + ',' + p.z));
  // the street in front of every staircase stays open: its foot and the cell beyond
  for (const run of stairRuns) {
    const [x0, z0] = run.cells[0];
    for (let k = 1; k <= 2; k++) taken.add((x0 - run.dir[0] * k) + ',' + (z0 - run.dir[1] * k));
  }
  const clearCell = (x, z, height) => {
    if (x < 1 || z < 1 || x >= W - 1 || z >= D - 1) return false;
    if (mask && !mask[z * W + x]) return false;
    if (!OUTDOOR.has(use[z * W + x]) || elevAt(x, z) !== 0) return false;
    if (inBuilding(x, z) || taken.has(x + ',' + z)) return false;
    if (!world.has(x, G, z) || world.get(x, G, z) === MAT.WATER) return false;
    // never on a canal's walkway: a bank is only two wide, and the mark would close it
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, nz = z + dz;
      if (nx >= 0 && nz >= 0 && nx < W && nz < D && use[nz * W + nx] === USE_CANAL) return false;
    }
    for (let y = G + 1; y <= G + height + 12; y++) if (world.has(x, y, z)) return false;   // room, and open sky for the beams
    return true;
  };
  const { height } = centreCells(0);
  // the cell just outside the entrance, for a corner and a rotation
  const probeOf = (r, ox, oz, fw, fd) => (r === 0 ? [ox + 1, oz - 1] : r === 1 ? [ox + fw, oz + 1]
    : r === 2 ? [ox + 1, oz + fd] : [ox - 1, oz + 1]);
  // Out as far as it takes: streets stay level across a terraced city, so there
  // is always somewhere; the 40 blocks searched up to 0.30 found nothing in the
  // middle of a big hilly city, which then had no mark to come back to. Failing
  // a cell clear all round, the mark may stand beside a building.
  let best = search();
  if (!best) { nearGrid = near[1]; best = search(); }
  if (!best) return null;
  const out = buildCentre(world, best.ox, best.oz, G + 1, best.r);
  return { block: [out.stand[0], G, out.stand[2]], stand: out.stand, sign: out.sign, beacons: out.beacons,
    facing: out.facing, rotation: out.rotation, drift: Math.abs(out.stand[0] - cx0) + Math.abs(out.stand[2] - cz0) };

  function search() {
  let best = null, bestScore = Infinity;
  const reach = Math.ceil(Math.max(W, D) / 2) + 2;
  for (let rad = 0; rad <= reach; rad++) {
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
// (where(x, z): only these cells, for a city of several styles)
function applyStyle(world, plan, style, groundAt, where = null) {
  const table = remapTable(style, FLOWERS);
  const mine = where || (() => true);
  if (table.size) {
    const changes = [];
    world.forEach((x, y, z, id) => { if (table.has(id) && mine(x, z)) changes.push([x, y, z, table.get(id)]); });
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
    // A desert always has its cacti. They are planted in place of some trees,
    // by chance, so a small city can draw none; if there are too few, some of
    // the dead bushes on open sand become cacti, chosen by where they stand (no
    // random draws, so nothing else in the city moves).
    let cacti = 0;
    const bushes = [];
    world.forEach((x, y, z, id) => {
      if (!mine(x, z)) return;
      if (id === CAC && world.get(x, y - 1, z) !== CAC) cacti++;
      else if (id === MAT.DEADBUSH) bushes.push([x, y, z]);
    });
    const want = Math.max(4, Math.floor(bushes.length / 30));
    if (cacti < want) {
      const open = (x, y, z) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dz]) => { const n = world.get(x + dx, y, z + dz); return n === -1 || (MATERIALS.isPassable(n) && n !== CAC); });
      bushes.sort((p, q) => hash2(p[0], p[2], 0x5ac7) - hash2(q[0], q[2], 0x5ac7));
      for (const [x, y, z] of bushes) {
        if (cacti >= want) break;
        if (world.get(x, y - 1, z) !== SAND || world.has(x, y + 1, z)) continue;
        if (!open(x, y, z) || !open(x, y + 1, z)) continue;
        // no other cactus within a block, so two never touch
        let near = false;
        for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && (world.get(x + dx, y, z + dz) === CAC || world.get(x + dx, y + 1, z + dz) === CAC)) { near = true; break; }
        if (near) continue;
        world.set(x, y, z, CAC);
        world.set(x, y + 1, z, CAC);
        cacti++;
      }
    }
  }
  if (style.snow) {
    const { W, D } = plan;
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        if (!mine(x, z)) continue;
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
// ---- the curtain wall of a walled fortress town ---------------------------------------
// Three thick and at least nine high, on the city's three outermost rings (the
// ring road inside keeps the rest of its width). The top is a walk along the
// whole wall, merlons on its outer edge. Towers stand astride the wall every
// ~22 blocks, projecting two blocks outward: solid to the walk, then a room at
// walk height with a door onto the walk on either side, arrow slits, and a
// crenellated roof. Each gate is a passage through the wall's three rings,
// doors on its outer face, with a gatehouse tower either side; beside each
// gatehouse a flight of steps is cut into the inner face of the wall up to the
// walk, entered from the street at its foot.
function fortressWall(world, plan, cfg) {
  const h = Math.max(9, Math.min(14, cfg.wallHeight | 0));
  const T = 3;
  const { W, D, mask } = plan;
  const inCity = (x, z) => x >= 0 && z >= 0 && x < W && z < D && mask[z * W + x] === 1;
  // depth of every city cell from the edge (0 = the ring), up to T
  const depth = new Map();
  let frontier = [];
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      if (!inCity(x, z)) continue;
      let edge = false;
      for (let dz = -1; dz <= 1 && !edge; dz++) for (let dx = -1; dx <= 1 && !edge; dx++) if (!inCity(x + dx, z + dz)) edge = true;
      if (edge) { depth.set(x + ',' + z, 0); frontier.push([x, z]); }
    }
  for (let d = 1; d <= T; d++) {
    const next = [];
    for (const [x, z] of frontier)
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, nz = z + dz, k = nx + ',' + nz;
        if (!inCity(nx, nz) || depth.has(k)) continue;
        depth.set(k, d); next.push([nx, nz]);
      }
    frontier = next;
  }
  const dAt = (x, z) => depth.get(x + ',' + z);
  const isWall = (x, z) => { const d = dAt(x, z); return d !== undefined && d < T; };
  const ring = [];
  for (const [k, d] of depth) if (d === 0) ring.push(k.split(',').map(Number));
  // the wall itself
  for (const [k, d] of depth) {
    if (d >= T) continue;
    const [x, z] = k.split(',').map(Number);
    world.set(x, 0, z, MAT.BASE);
    for (let y = GROUND; y < GROUND + h; y++) world.set(x, y, z, MAT.WALL_BODY);
    world.set(x, GROUND + h, z, MAT.WALL_CAP);
    for (let y = GROUND + h + 1; y <= GROUND + h + 3; y++) world.clear(x, y, z);
    if (d === 0 && (x + z) % 2 === 0) world.set(x, GROUND + h + 1, z, MAT.WALL_BODY);   // merlons on the outer edge
  }
  // the way out of a ring cell (a single axis where it can be read)
  const outOf = (x, z) => {
    for (const [f, [ox, oz]] of Object.entries(OUTWARD)) {
      const side = [[oz, ox], [-oz, -ox]];
      if (!inCity(x + ox, z + oz) && side.every(([a, b]) => dAt(x + a, z + b) === 0)) return { face: f, out: [ox, oz] };
    }
    return null;
  };
  // ---- gates: a passage through all three rings, doors on the outer face -----
  const walkIn = (x, z) => {
    const f1 = world.get(x, GROUND + 1, z), f2 = world.get(x, GROUND + 2, z);
    return inCity(x, z) && !isWall(x, z) && world.has(x, GROUND, z) && (f1 === -1 || MATERIALS.isPassable(f1)) && f2 === -1;
  };
  let sx = 0, sz = 0;
  for (const [x, z] of ring) { sx += x; sz += z; }
  const mx = sx / ring.length, mz = sz / ring.length;
  const CLOCKWISE = { north: 'east', east: 'south', south: 'west', west: 'north' };
  const gates = [], towers = [], stairs = [];
  const towerCells = (cx, cz, along, out) => {
    const cells = [];
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) cells.push([cx + along[0] * a + out[0] * b, cz + along[1] * a + out[1] * b, a, b]);
    return cells;
  };
  // a tower stands on the wall and beyond it, never on the town inside
  const towerFits = (cx, cz, along, out) => towerCells(cx, cz, along, out).every(([x, z, , b]) => isWall(x, z) || (b <= -1 && !inCity(x, z)));
  const tower = (cx, cz, along, out) => {
    // 5x5 astride the wall, centred on the ring cell: solid to the walk, a room above
    const cells = towerCells(cx, cz, along, out);
    if (!towerFits(cx, cz, along, out)) return null;
    const top = GROUND + h;
    for (const [x, z, a, b] of cells) {
      world.set(x, 0, z, MAT.BASE);
      for (let y = 1; y <= top; y++) world.set(x, y, z, MAT.WALL_BODY);
      const edge = Math.abs(a) === 2 || Math.abs(b) === 2;
      if (edge) for (let y = top + 1; y <= top + 4; y++) world.set(x, y, z, MAT.WALL_BODY);
      world.set(x, top + 5, z, MAT.WALL_CAP);
      if (edge && (a + b) % 2 === 0) world.set(x, top + 6, z, MAT.WALL_BODY); else world.clear(x, top + 6, z);
    }
    for (const [x, z, a, b] of cells) if (!(Math.abs(a) === 2 || Math.abs(b) === 2)) for (let y = top + 1; y <= top + 4; y++) world.clear(x, y, z);
    // arrow slits on the outer face and the two ends
    for (const [a, b] of [[0, -2], [-2, 0], [2, 0]]) world.set(cx + along[0] * a + out[0] * b, top + 2, cz + along[1] * a + out[1] * b, MAT.BARS);
    // Doors onto the walk, one each side, where the walk really meets the
    // tower: the wall may bend near a tower, so each row of the side face is
    // tried (the walk's inner row first) and a door goes only where the cell
    // outside it is walk to stand on. A side the walk does not reach gets an
    // arrow slit, never a door onto air.
    const face = Object.entries(OUTWARD).find(([, v]) => v[0] === along[0] && v[1] === along[1])[0];
    const back = Object.entries(OUTWARD).find(([, v]) => v[0] === -along[0] && v[1] === -along[1])[0];
    const walkable = (x, z) => world.has(x, top, z) && !world.has(x, top + 1, z) && !world.has(x, top + 2, z);
    const doors = [];
    for (const [a, f] of [[2, face], [-2, back]]) {
      const sgn = Math.sign(a);
      let placed = false;
      for (const b of [1, 0, -1]) {
        const x = cx + along[0] * a + out[0] * b, z = cz + along[1] * a + out[1] * b;
        if (!walkable(x + along[0] * sgn, z + along[1] * sgn)) continue;
        world.set(x, top + 1, z, doorId('spruce', DIR[f], false, 0));
        world.set(x, top + 2, z, doorId('spruce', DIR[f], true, 0));
        doors.push({ at: [x, top + 1, z], outside: [x + along[0] * sgn, top + 1, z + along[1] * sgn] });
        placed = true;
        break;
      }
      if (!placed) world.set(cx + along[0] * a + out[0], top + 2, cz + along[1] * a + out[1], MAT.BARS);
    }
    world.set(cx + out[0], top + 4, cz + out[1], MAT.LAMP_HANG);
    const t = { at: [cx, top + 1, cz], along, out, top: top + 6, doors };
    towers.push(t);
    return t;
  };
  for (const face of ['north', 'south', 'west', 'east']) {
    const [ox, oz] = OUTWARD[face];
    const along = (face === 'north' || face === 'south') ? [1, 0] : [0, 1];
    let best = null;
    for (const [x, z] of ring) {
      const o = outOf(x, z);
      if (!o || o.face !== face) continue;
      const x2 = x + along[0], z2 = z + along[1];
      if (dAt(x2, z2) !== 0) continue;
      const pair = [[x, z], [x2, z2]];
      if (!pair.every(([a, b]) => !inCity(a + ox, b + oz) && [1, 2].every((k) => isWall(a - ox * k, b - oz * k)) && walkIn(a - ox * T, b - oz * T))) continue;
      // room for a gatehouse tower either side
      if (![-3, -2, -1, 2, 3, 4].every((k) => dAt(x + along[0] * k, z + along[1] * k) === 0)) continue;
      const inw = [-ox, -oz];
      if (!towerFits(x - along[0] * 3, z - along[1] * 3, along, inw) || !towerFits(x2 + along[0] * 3, z2 + along[1] * 3, along, inw)) continue;
      const off = face === 'north' || face === 'south' ? Math.abs(x + 0.5 - mx) : Math.abs(z + 0.5 - mz);
      if (!best || off < best.off) best = { pair, off };
    }
    if (!best) continue;
    const [[gx, gz], [gx2, gz2]] = best.pair;
    // the passage
    for (const [a, b] of best.pair) for (let k = 0; k < T; k++) for (let y = GROUND + 1; y <= GROUND + 3; y++) world.clear(a - ox * k, y, b - oz * k);
    const secondIsRight = CLOCKWISE[face] === (along[0] ? 'east' : 'south');
    best.pair.forEach(([x, z], i) => {
      const hinge = (i === 1) === secondIsRight ? 1 : 0;
      world.set(x, GROUND + 1, z, doorId('spruce', DIR[face], false, hinge));
      world.set(x, GROUND + 2, z, doorId('spruce', DIR[face], true, hinge));
    });
    // gatehouse: a tower either side
    const inward = [-ox, -oz];
    const tA = tower(gx - along[0] * 3, gz - along[1] * 3, along, inward);
    const tB = tower(gx2 + along[0] * 3, gz2 + along[1] * 3, along, inward);
    gates.push({ face, cells: best.pair, inside: best.pair.map(([a, b]) => [a - ox * T, b - oz * T]), towers: [tA, tB].filter(Boolean) });
    // steps up to the walk, cut into the inner face beyond a gatehouse tower
    // (whichever side has a straight enough stretch of wall)
    const streetSide = ([x, z]) => walkIn(x + inward[0], z + inward[1]);
    let run = null, dirv = null;
    for (const [bx, bz, dv] of [[gx2, gz2, along], [gx, gz, [-along[0], -along[1]]]]) {
      const r2 = [];
      for (let i = 0; i <= h; i++) r2.push([bx + dv[0] * (6 + i) + inward[0] * 2, bz + dv[1] * (6 + i) + inward[1] * 2]);
      if (r2.every(([x, z]) => dAt(x, z) === 2 && streetSide([x, z]))) { run = r2; dirv = dv; break; }
    }
    if (run) {
      // run[h] is the foot, cut to street level; steps climb from run[h-1] back toward the tower
      const [fx, fz] = run[h];
      for (let y = GROUND + 1; y <= GROUND + h; y++) world.clear(fx, y, fz);
      const up = dirv[0] === 1 ? WEIRDO.west : dirv[0] === -1 ? WEIRDO.east : dirv[1] === 1 ? WEIRDO.north : WEIRDO.south;
      const steps = [];
      for (let i = 0; i < h; i++) {
        const [x, z] = run[h - 1 - i];
        world.set(x, GROUND + 1 + i, z, stairId('stonebrick', up));
        for (let y = GROUND + 2 + i; y <= GROUND + h; y++) world.clear(x, y, z);
        steps.push([x, GROUND + 1 + i, z]);
      }
      stairs.push({ gate: face, foot: [fx, GROUND + 1, fz], steps });
    }
  }
  // ---- towers along the wall, every ~22 blocks, clear of the gatehouses ------------
  const taken = towers.map((t) => t.at);
  for (const [x, z] of ring) {
    const o = outOf(x, z);
    if (!o) continue;
    if (taken.some(([a, , b]) => Math.max(Math.abs(a - x), Math.abs(b - z)) < 22)) continue;
    if (gates.some((g) => g.cells.some(([a, b]) => Math.max(Math.abs(a - x), Math.abs(b - z)) < 12))) continue;
    if (stairs.some((st) => st.steps.concat([st.foot]).some(([a, , b]) => Math.max(Math.abs(a - x), Math.abs(b - z)) < 4))) continue;
    const along = o.out[0] === 0 ? [1, 0] : [0, 1];
    const t = tower(x, z, along, [-o.out[0], -o.out[1]]);
    if (t) taken.push(t.at);
  }
  return { height: h, thickness: T, gates, ring, towers, stairs, fortress: true };
}

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
  if (rec && cfg.furnish) { const f = furnish(world, rec, makeRng(cfg.seed ^ 0x51f3), { useStairs: cfg.useStairs, paintings: !styleOf(cfg.cityStyle).glass }); rec.beds = f.beds; rec.furniture = f; beds = f.beds; }
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

// ---- torii and stone lanterns (the East Asian style) --------------------------------
// A torii straddles a park path one block in from the street: two vermilion
// posts two either side of the path, four high; a tie beam (nuki) across the
// top of the posts; over it a black lintel (kasagi) three either side with its
// ends turned up. The lowest beam over the path is four above the ground, so
// the step up onto the path keeps its head room. A gate goes up only where
// every cell it needs is empty. No random draws.
function parkGates(world, lot, cx, cz, G) {
  const gates = [];
  const ends = [[cx, lot.z0 + 1, 1, 0], [cx, lot.z1 - 1, 1, 0], [lot.x0 + 1, cz, 0, 1], [lot.x1 - 1, cz, 0, 1]];
  for (const [px, pz, ax, az] of ends) {
    const at = (u, y) => [px + ax * u, y, pz + az * u];
    const posts = [], beams = [];
    for (const u of [-2, 2]) for (let y = G + 1; y <= G + 4; y++) posts.push(at(u, y));
    for (let u = -1; u <= 1; u++) beams.push(at(u, G + 4));
    const top = [];
    for (let u = -3; u <= 3; u++) top.push([at(u, G + 5), u]);
    const cells = [...posts, ...beams, ...top.map((t) => t[0])];
    if (!cells.every(([x, y, z]) => !world.has(x, y, z))) continue;
    if (![-2, 2].every((u) => { const [x, , z] = at(u, G); return world.get(x, G, z) === MAT.GRASS; })) continue;   // posts on grass, never in the pond
    for (const [x, y, z] of posts) world.set(x, y, z, MAT.C_RED);
    for (const [x, y, z] of beams) world.set(x, y, z, MAT.C_RED);
    for (const [[x, y, z], u] of top) {
      if (Math.abs(u) === 3) world.set(x, y, z, stairId('dark', ax ? (u > 0 ? WEIRDO.east : WEIRDO.west) : (u > 0 ? WEIRDO.south : WEIRDO.north)));
      else world.set(x, y, z, MAT.C_BLACK2);
    }
    gates.push({ at: [px, G, pz], across: [ax, az] });
  }
  return gates;
}

// stone lanterns (toro) on the corners of the path crossing: a stone post, the
// lantern, a carved cap
function stoneLanterns(world, cx, cz, G) {
  const placed = [];
  for (const [dx, dz] of [[2, 2], [-2, -2], [2, -2], [-2, 2]]) {
    const x = cx + dx, z = cz + dz;
    if (world.get(x, G, z) !== MAT.GRASS || [1, 2, 3].some((h) => world.has(x, G + h, z))) continue;
    world.set(x, G + 1, z, MAT.STONEBRICK);
    world.set(x, G + 2, z, MAT.LAMP);
    world.set(x, G + 3, z, MAT.CHISELED_STONE);
    placed.push([x, G + 2, z]);
  }
  return placed;
}

// ---- the ways up a cliff city ---------------------------------------------------------
// At every tier's edge (in the middle of a street that crosses the city), flights
// of stairs climb from the lower street to the upper one along the foot of the
// face: two wide, a step a block, the tier's height in steps, filled under; a
// landing at the top level with the upper street, and a parapet past it so no
// one walks off the end. At least two to an edge, about every 40 blocks where
// the street is clear for the whole run. Along the top of every face a railing,
// but where the flights come up.
function cliffStairs(world, plan, hills, G) {
  const { W, D, use, mask } = plan;
  const { tier, edges } = hills.cliff;
  const inCity = (x, z) => x >= 0 && z >= 0 && x < W && z < D && (!mask || mask[z * W + x]);
  const street = (x, z) => inCity(x, z) && (use[z * W + x] === USE.ROAD || use[z * W + x] === USE.SIDEWALK);
  const flights = [];
  for (const zb of edges) {
    const yl = G + hills.elev[(zb - 1) * W + Math.floor(W / 2)], yu = yl + tier;
    // where a flight fits: steps and landing and parapet on the two rows below the
    // edge, the row the upper street starts on above it
    // (street furniture gives way to a flight: a lamp post, a sign, a flower;
    // track does too, but only if nowhere else will do: every edge has a way up)
    const FURNITURE = /fence|lantern|sign|flower|tulip|poppy|dandelion|allium|orchid|bluet|daisy|cornflower|lily|grass|fern|bush|roots|carpet|torch/;
    const blocks = (x, y, z, allowRail) => {
      const id = world.get(x, y, z);
      if (id === -1) return false;
      const n = MATERIALS.def(id).block;
      if (FURNITURE.test(n) || n === 'minecraft:sea_lantern' || n === 'minecraft:shroomlight') return false;
      if (allowRail && /rail|redstone_block/.test(n)) return false;
      return true;
    };
    const fits = (x0, allowRail) => {
      for (let i = -1; i <= tier + 1; i++) {
        const x = x0 + i;
        if (!street(x, zb - 1) || !street(x, zb - 2) || !street(x, zb)) return false;
        for (const z of [zb - 1, zb - 2]) for (let y = yl + 1; y <= yu + 3; y++) if (blocks(x, y, z, allowRail)) return false;
      }
      return true;
    };
    let here = [];
    for (const allowRail of [false, true]) {
      for (let x0 = 2; x0 < W - tier - 4; x0++) {
        if (here.some((h) => Math.abs(x0 - h) < 40)) continue;
        if (fits(x0, allowRail)) here.push(x0);
      }
      if (here.length === 1) { for (let x0 = W - tier - 5; x0 > here[0] + tier + 4; x0--) if (fits(x0, allowRail)) { here.push(x0); break; } }
      if (here.length) break;
    }
    for (const x0 of here) {
      // clear the street furniture out of the flight's way
      for (let x = x0 - 1; x <= x0 + tier + 1; x++) for (const z of [zb - 1, zb - 2]) for (let y = yl + 1; y <= yu + 3; y++) world.clear(x, y, z);
      const steps = [];
      for (let i = 0; i < tier; i++) {
        const x = x0 + i;
        for (const z of [zb - 1, zb - 2]) {
          for (let y = yl + 1; y < yl + 1 + i; y++) world.set(x, y, z, MAT.RETAIN);
          world.set(x, yl + 1 + i, z, stairId('stonebrick', WEIRDO.east));
          steps.push([x, yl + 1 + i, z]);
        }
      }
      // the landing, level with the upper street, and the parapet past it
      for (const z of [zb - 1, zb - 2]) {
        for (let y = yl + 1; y <= yu; y++) world.set(x0 + tier, y, z, MAT.RETAIN);
        for (let y = yl + 1; y <= yu + 1; y++) world.set(x0 + tier + 1, y, z, MAT.RETAIN);
      }
      flights.push({ edge: zb, x0, foot: [x0 - 1, yl + 1, zb - 1], top: [x0 + tier, yu + 1, zb - 1], steps, yl, yu });
    }
    // the railing along the top of the face, but where a flight comes up
    const open = new Set();
    for (const f of flights) if (f.edge === zb) for (let x = f.x0 + tier - 1; x <= f.x0 + tier; x++) open.add(x);
    for (let x = 0; x < W; x++) {
      if (!street(x, zb) || open.has(x)) continue;
      if (!world.has(x, yu, zb) || world.has(x, yu + 1, zb)) continue;
      world.set(x, yu + 1, zb, MAT.FENCE);
    }
  }
  const unlinked = edges.filter((zb) => !flights.some((f) => f.edge === zb));
  return { flights, edges, tier, unlinked };
}

// ---- a city of floating islands ------------------------------------------------------
// The main streets were planned as canals (planCanals); in a floating city their
// channels are chasms instead: open down to the sky below. What the canal
// machinery built stays (walkways railed on both banks, every crossing street
// on its deck, footbridges between), and the decks are bridges now, a single
// layer with air under it. Every piece of city the chasms leave is an island,
// and hangs on a rocky underside like a mountain turned over: deepest in the
// middle, tapering to its rim (depth 3 at the rim, growing with the distance
// in, a little noise, at most 28), soil at the top and stone below with patches
// of cobble and andesite. A column is always taken deeper than the lowest thing
// standing in it (a pond, a spawner), so nothing hangs over the drop.
function floatCity(world, plan, canals, G, cfg) {
  const { W, D, use, mask } = plan;
  const inCity = (x, z) => x >= 0 && z >= 0 && x < W && z < D && (!mask || mask[z * W + x]);
  // the chasm bands: every channel cell, decks (bridges) included
  const band = new Uint8Array(W * D);
  for (const c of canals)
    for (let u = c.u0; u <= c.u1; u++)
      for (let a = c.ch0; a <= c.ch1; a++) { const [x, z] = c.cell(u, a); if (inCity(x, z)) band[z * W + x] = 1; }
  // A canal stops four short of the city's edge, so the land would wrap round
  // its ends and the city stay one piece: each chasm carries on along its street
  // to the edge both ways. Only through street (never a lot); a crossing street,
  // or track, stays as a deck (a bridge); the banks are railed.
  const isStreet = (x, z) => inCity(x, z) && (use[z * W + x] === USE.ROAD || use[z * W + x] === USE.SIDEWALK);
  const hasRail = (x, z) => { const id = world.get(x, G + 1, z); return id >= 0 && /rail/.test(MATERIALS.def(id).block); };
  for (const c of canals) {
    c.ext = [];
    const mid = Math.floor((c.ch0 + c.ch1) / 2);
    for (const [start, step] of [[c.u0 - 1, -1], [c.u1 + 1, 1]]) {
      for (let u = start; ; u += step) {
        let cells = [];
        for (let a = c.a0; a <= c.a1; a++) cells.push(c.cell(u, a));
        if (!cells.some(([x, z]) => inCity(x, z))) break;                 // past the edge
        if (!cells.every(([x, z]) => !inCity(x, z) || isStreet(x, z))) break;   // a lot: stop
        const [mx, mz] = c.cell(u, mid);
        const [lx, lz] = c.cell(u, c.a0 - 1), [rx, rz] = c.cell(u, c.a1 + 1);
        const crossing = (inCity(mx, mz) && plan.roadAxis[mz * W + mx] === 3) || isStreet(lx, lz) || isStreet(rx, rz);
        let deck = crossing;
        for (let a = c.ch0; a <= c.ch1; a++) { const [x, z] = c.cell(u, a); if (inCity(x, z) && hasRail(x, z)) deck = true; }
        c.ext.push({ u, deck });
        for (let a = c.ch0; a <= c.ch1; a++) {
          const [x, z] = c.cell(u, a);
          if (!inCity(x, z)) continue;
          band[z * W + x] = 1;
          if (!deck) { use[z * W + x] = USE_CANAL; for (let y = G; y <= G + 5; y++) world.clear(x, y, z); }
        }
        if (!deck) for (const a of [c.ch0 - 1, c.ch1 + 1]) {
          const [x, z] = c.cell(u, a);
          if (isStreet(x, z) && !world.has(x, G + 1, z) && world.has(x, G, z)) world.set(x, G + 1, z, MAT.FENCE);
        }
      }
    }
  }
  const SOFT = new Set([MAT.BASE, MAT.CANAL_BED, MAT.DIRT, MAT.CLAY, MAT.WATER, MAT.GRAVEL]);
  const lowY = world.box.y0;
  // the chasms: everything under street level goes (a deck stays, alone)
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      if (!band[z * W + x]) continue;
      for (let y = lowY; y < G; y++) world.clear(x, y, z);
      if (use[z * W + x] === USE_CANAL) for (let y = G; y <= G + 3; y++) { const id = world.get(x, y, z); if (id === MAT.WATER) world.clear(x, y, z); }
    }
  // the islands: what is left, piece by piece
  const comp = new Int32Array(W * D).fill(-1);
  const islands = [];
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const i0 = z * W + x;
      if (!inCity(x, z) || band[i0] || comp[i0] >= 0) continue;
      const id = islands.length, cells = [];
      const q = [i0]; comp[i0] = id;
      while (q.length) {
        const i = q.pop(); cells.push(i);
        const cx = i % W, cz = (i - cx) / W;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, nz = cz + dz, j = nz * W + nx;
          if (!inCity(nx, nz) || band[j] || comp[j] >= 0) continue;
          comp[j] = id; q.push(j);
        }
      }
      islands.push({ id, cells, deepest: 0 });
    }
  // distance in from each island's rim
  const edge = new Int32Array(W * D).fill(-1);
  let frontier = [];
  for (const isl of islands) for (const i of isl.cells) {
    const x = i % W, z = (i - x) / W;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => { const nx = x + dx, nz = z + dz; return !inCity(nx, nz) || comp[nz * W + nx] !== isl.id; })) { edge[i] = 0; frontier.push(i); }
  }
  for (let d = 1; frontier.length; d++) {
    const next = [];
    for (const i of frontier) {
      const x = i % W, z = (i - x) / W;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, j = nz * W + nx;
        if (!inCity(nx, nz) || comp[j] < 0 || edge[j] >= 0) continue;
        edge[j] = d; next.push(j);
      }
    }
    frontier = next;
  }
  // the undersides
  let rock = 0;
  for (const isl of islands)
    for (const i of isl.cells) {
      const x = i % W, z = (i - x) / W;
      const noise = Math.floor(hash2(x, z, (cfg.seed ^ 0x15a7d) | 0) * 3);
      let depth = Math.min(28, 3 + Math.floor(edge[i] * 0.7) + noise);
      // never shallower than what stands in the column (a pond, a spawner): two under it
      let lowest = G;
      for (let y = lowY; y < G; y++) { const id = world.get(x, y, z); if (id !== -1 && !SOFT.has(id)) { lowest = Math.min(lowest, y); break; } }
      for (let y = lowY; y < G; y++) if (world.get(x, y, z) === MAT.WATER) { lowest = Math.min(lowest, y); break; }
      depth = Math.max(depth, G - lowest + 2);
      const bottom = G - depth;
      for (let y = lowY; y < bottom; y++) world.clear(x, y, z);
      for (let y = bottom; y < G; y++) {
        const id = world.get(x, y, z);
        if (id !== -1 && !SOFT.has(id)) continue;          // keep what was built
        if (id === MAT.WATER) continue;                     // a pond's water stays
        const h = hash2(x * 3 + y, z * 5 - y, (cfg.seed ^ 0x2b6f) | 0);
        world.set(x, y, z, y >= G - 2 ? MAT.DIRT : h < 0.12 ? MAT.COBBLE : h < 0.2 ? MAT.ANDESITE : MAT.BASE);
        rock++;
      }
      isl.deepest = Math.max(isl.deepest, depth);
    }
  world.floating = true;
  return { count: islands.length, rock, sizes: islands.map((s) => s.cells.length).sort((a, b) => b - a), deepest: Math.max(0, ...islands.map((s) => s.deepest)), comp, band };
}

// ---- a city on stilts over open water ------------------------------------------------
// Under the streets, squares and buildings the stone gives way to open water:
// a gravel seabed seven down, water up to the canal's own level, then two blocks
// of air under the deck (room for a boat), the deck itself (every street,
// pavement and floor) as it was. Dark timber piles hold it up: every four
// blocks under the streets, at every building's corners and every three blocks
// under it. Parks, farms and ranches stay islands of soil to the seabed, and so
// does any column whose surface is not solid (a fountain's water would fall).
// A canal's channel opens into the water below, the same level, with no pile in
// it. The city's edge stands on a stone seawall (built on land, it keeps the
// water in). A sea lantern in the seabed every eight blocks lights all the water
// (dark open water in an ocean would spawn drowned).
function stiltCity(world, plan, buildings, G) {
  const { W, D, use, mask, lots } = plan;
  const BED = G - 7;
  const inCity = (x, z) => x >= 0 && z >= 0 && x < W && z < D && (!mask || mask[z * W + x]);
  const island = new Uint8Array(W * D);
  for (const l of lots) if (l.kind === USE.PARK || l.island)
    for (let z = l.z0; z <= l.z1; z++) for (let x = l.x0; x <= l.x1; x++) if (inCity(x, z)) island[z * W + x] = 1;
  const under = new Uint8Array(W * D);                     // building footprints: piles every three
  for (const b of buildings)
    for (let z = Math.max(0, b.z0); z <= Math.min(D - 1, b.z1); z++)
      for (let x = Math.max(0, b.x0); x <= Math.min(W - 1, b.x1); x++) {
        const corner = (x === b.x0 || x === b.x1) && (z === b.z0 || z === b.z1);
        const grid = (x - b.x0) % 3 === 0 && (z - b.z0) % 3 === 0;
        if (corner || grid) under[z * W + x] = 1;
      }
  const SOFT = new Set([MAT.BASE, MAT.CANAL_BED, MAT.DIRT, MAT.CLAY]);
  const info = { piles: 0, lanterns: 0, island: 0, open: 0, seawall: 0, BED };
  // each column's kind, for the exports' foundation: the piles go on down into
  // the ground below, islands and seawall stand on solid ground, and under open
  // water nothing is put (1 open, 2 pile, 3 solid)
  const kind = new Uint8Array(W * D);
  world.stiltGrid = { W, D, kind };
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      if (!inCity(x, z)) continue;
      const i = z * W + x;
      let edge = false;
      for (let dz = -1; dz <= 1 && !edge; dz++) for (let dx = -1; dx <= 1; dx++) if (!inCity(x + dx, z + dz)) { edge = true; break; }
      const surf = world.get(x, G, z);
      const canal = use[i] === USE_CANAL;
      const solidTop = surf !== -1 && surf !== MAT.WATER && !MATERIALS.isPassable(surf);
      if (edge) {                                          // the seawall
        for (let y = BED; y < G; y++) if (!world.has(x, y, z) || SOFT.has(world.get(x, y, z))) world.set(x, y, z, MAT.BASE);
        kind[i] = 3; info.seawall++; continue;
      }
      if (island[i] || (!canal && !solidTop)) {            // an island, or a column that must stay solid
        for (let y = BED; y < G; y++) if (!world.has(x, y, z) || SOFT.has(world.get(x, y, z))) world.set(x, y, z, y === BED ? MAT.BASE : MAT.DIRT);
        kind[i] = 3; info.island++; continue;
      }
      // open water: soft fill becomes water up to the canal's level, air above it
      for (let y = BED + 1; y < G; y++) {
        const id = world.get(x, y, z);
        if (id !== -1 && !SOFT.has(id)) continue;          // keep what was built (a dock's steps, the canal's own water)
        if (y <= WATER_HI) world.set(x, y, z, MAT.WATER); else world.clear(x, y, z);
      }
      const pileHere = !canal && (under[i] || (x % 4 === 0 && z % 4 === 0));
      const lamp = x % 8 === 2 && z % 8 === 2 && !pileHere;  // (between the piles, which stand every four from 0)
      world.set(x, BED, z, lamp ? MAT.LANTERN : MAT.GRAVEL);
      if (lamp) info.lanterns++;
      kind[i] = 1;
      if (pileHere) {
        for (let y = BED + 1; y < G; y++) world.set(x, y, z, MAT.DARK_FRAME);
        world.set(x, BED, z, MAT.DARK_FRAME);              // (the pile stands through the seabed: it goes on down with a foundation)
        kind[i] = 2; info.piles++;
      }
      info.open++;
    }
  return info;
}

// ---- a fish spawner on every pond's floor ---------------------------------------------
// Fish summoned once do not last in Bedrock (they despawn when the player is
// away), so each park pond also has a tropical fish spawner set into its floor:
// whenever a player is within 16 blocks it lets out fish (up to four at a time,
// within four blocks of it, none while six are already near). The settings are
// the ones a spawner saved in the game carries (SPAWNER_TAGS). One to a pond,
// two in a big one, on its deepest cells nearest the middle, in place of the
// clay under the water: water stands right over it for the fish to come out into.
export const SPAWNER_TAGS = {
  BlockEntityVersion: N.int(0), Delay: N.short(200),
  DisplayEntityHeight: N.float(1.7999999523162842), DisplayEntityScale: N.float(1), DisplayEntityWidth: N.float(0.800000011920929),
  EntityIdentifier: N.str('minecraft:tropicalfish'),
  MaxNearbyEntities: N.short(6), MaxSpawnDelay: N.short(800), MinSpawnDelay: N.short(200),
  RequiredPlayerRange: N.short(16), SpawnCount: N.short(4), SpawnRange: N.short(4),
};
function pondSpawners(world, ponds) {
  const placed = [];
  for (const pd of ponds) {
    // the pond's surface and depth, cell by cell (as deepenPonds left it)
    const cells = [];
    for (let z = pd.z0; z <= pd.z1; z++)
      for (let x = pd.x0; x <= pd.x1; x++)
        for (let y = GROUND + 40; y >= GROUND - 4; y--) {
          if (world.get(x, y, z) !== MAT.WATER) continue;
          let d = 0;
          while (world.get(x, y - d, z) === MAT.WATER) d++;
          if (world.get(x, y - d, z) === MAT.CLAY) cells.push({ x, z, top: y, floor: y - d, depth: d });
          break;
        }
    if (!cells.length) continue;
    const mx = (pd.x0 + pd.x1) / 2, mz = (pd.z0 + pd.z1) / 2;
    cells.sort((a, b) => b.depth - a.depth || Math.hypot(a.x - mx, a.z - mz) - Math.hypot(b.x - mx, b.z - mz));
    const want = cells.length > 60 ? 2 : 1;
    const mine = [];
    for (const c of cells) {
      if (mine.length >= want) break;
      if (c.depth < 2) continue;
      if (mine.some((m) => Math.max(Math.abs(m.x - c.x), Math.abs(m.z - c.z)) < 6)) continue;
      world.set(c.x, c.floor, c.z, MAT.SPAWNER);
      world.setData(c.x, c.floor, c.z, { id: 'MobSpawner', tags: { ...SPAWNER_TAGS } });
      mine.push(c);
      placed.push([c.x, c.floor, c.z]);
    }
    pd.spawners = mine.map((c) => [c.x, c.floor, c.z]);
  }
  return placed;
}

// ---- deep ponds -------------------------------------------------------------------
// Every pond cell is at least two deep, the edges too, so the banks go straight
// down and there is no shallow margin for a fish to drift into and leap out of
// onto the grass; a cell with pond water on all four sides goes three deep.
// Clay lines the bottom. After every lift, so each pond's own surface height is
// known (flat, terraced or rolling ground alike).
function deepenPonds(world, ponds) {
  let cells = 0;
  const W_ = MAT.WATER;
  for (const pd of ponds) {
    // the pond's water cells, found at whatever height the pond now sits
    const surf = new Map();
    for (let z = pd.z0; z <= pd.z1; z++)
      for (let x = pd.x0; x <= pd.x1; x++)
        for (let y = GROUND - 2; y <= GROUND + 40; y++)
          if (world.get(x, y, z) === W_ && world.get(x, y + 1, z) !== W_) { surf.set(x + ',' + z, y); break; }
    let deep = 0, deeper = 0;
    for (const [key, y] of surf) {
      const [x, z] = key.split(',').map(Number);
      const wet = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => surf.get((x + a) + ',' + (z + b)) === y).length;
      const depth = wet === 4 ? 3 : 2;
      for (let d = 1; d < depth; d++) world.set(x, y - d, z, W_);
      world.set(x, y - depth, z, MAT.CLAY);
      deep++; if (depth === 3) deeper++;
      cells++;
    }
    pd.deep = deep;
    pd.deeper = deeper;
  }
  return cells;
}

// ---- a house's front fence ------------------------------------------------------
// Fence posts along the street edge of the lot on open grass, with the gap
// where the front path crosses it (the path cells are never fenced), so the
// way from the door to the street stays open; a lantern on each gate post.
const FLOWER_SET = new Set(FLOWERS);
function picketFence(world, lot, face, G) {
  const cells = [];
  if (face === 'south' || face === 'north') {
    const z = face === 'south' ? lot.z1 : lot.z0;
    for (let x = lot.x0; x <= lot.x1; x++) cells.push([x, z]);
  } else {
    const x = face === 'east' ? lot.x1 : lot.x0;
    for (let z = lot.z0; z <= lot.z1; z++) cells.push([x, z]);
  }
  let posts = 0, gap = 0;
  const post = new Set();
  for (const [x, z] of cells) {
    const ground = world.get(x, G, z);
    if (ground === MAT.PATH) { gap++; continue; }
    if (ground !== MAT.GRASS || world.has(x, G + 2, z)) continue;
    const on = world.get(x, G + 1, z);
    if (on !== -1 && !FLOWER_SET.has(on)) continue;             // a flower on the line gives way to a post
    world.set(x, G + 1, z, MAT.FENCE);
    post.add(x + ',' + z);
    posts++;
  }
  // gate lanterns: on the posts either side of the path. A post is never stood
  // on, so a lantern there can never take anyone's head room.
  const lanterns = [];
  cells.forEach(([x, z], i) => {
    if (world.get(x, G, z) !== MAT.PATH) return;
    for (const j of [i - 1, i + 1]) {
      const c = cells[j];
      if (!c || !post.has(c.join(',')) || world.has(c[0], G + 2, c[1])) continue;
      world.set(c[0], G + 2, c[1], MAT.LAMP);
      lanterns.push([c[0], G + 2, c[1]]);
    }
  });
  return { posts, gap, cells, lanterns };
}

// ---- open space ------------------------------------------------------------
function park(world, lot, rng, cfg, lifeRng, pandas, megaliths, ponds) {
  for (let z = lot.z0; z <= lot.z1; z++)
    for (let x = lot.x0; x <= lot.x1; x++) world.set(x, GROUND, z, MAT.GRASS);
  // crossing paths
  const cx = Math.round((lot.x0 + lot.x1) / 2), cz = Math.round((lot.z0 + lot.z1) / 2);
  for (let x = lot.x0; x <= lot.x1; x++) world.set(x, GROUND, cz, MAT.PATH);
  for (let z = lot.z0; z <= lot.z1; z++) world.set(cx, GROUND, z, MAT.PATH);
  const pd = (cfg.pondChance > 0 && rng.chance(cfg.pondChance)) ? pond(world, lot, cx, cz, rng, GROUND) : null;
  if (pd && ponds) ponds.push(pd);
  let grove = null;
  if (lifeRng && cfg.pandaChance > 0 && lifeRng.chance(cfg.pandaChance)) {
    grove = pandaGrove(world, lot, cx, cz, lifeRng, GROUND, pd);
    if (grove && pandas) for (const p of grove.pandas) pandas.push(p);
  }
  // a Celtic monument in a free quadrant, from its own random stream so the
  // rest of the park is the same with it or without it
  let stones = null;
  if (cfg.megaliths && cfg.megalithChance > 0) {
    const mr = makeRng(((lot.x0 * 83492791) ^ (lot.z0 * 2654435761) ^ cfg.seed ^ 0x5a17) >>> 0);
    if (mr.chance(cfg.megalithChance)) {
      stones = megalith(world, lot, cx, cz, mr, GROUND, [pd, grove].filter(Boolean));
      if (stones && megaliths) megaliths.push(stones);
    }
  }
  const inGrove = (x, z) => grove && x >= grove.x0 && x <= grove.x1 && z >= grove.z0 && z <= grove.z1;
  // a canopy spreads two blocks: keep trees that far from the grove, and from the stones
  const nearGrove = (x, z) => (grove && x >= grove.x0 - 2 && x <= grove.x1 + 2 && z >= grove.z0 - 2 && z <= grove.z1 + 2) ||
    (stones && x >= stones.x0 - 3 && x <= stones.x1 + 3 && z >= stones.z0 - 3 && z <= stones.z1 + 3);
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
  // East Asian style: a torii where each path meets the street, stone lanterns by the crossing
  if ((cfg.styleAt ? cfg.styleAt((lot.x0 + lot.x1) / 2, (lot.z0 + lot.z1) / 2) : styleOf(cfg.cityStyle)).torii) {
    lot.torii = parkGates(world, lot, cx, cz, GROUND);
    lot.stoneLanterns = stoneLanterns(world, cx, cz, GROUND);
  }
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
  const HERE = STYLE_AT ? STYLE_AT(x, z) : STYLE;
  if (HERE.cactus && rng.chance(HERE.cactus)) return cactus(world, x, z, rng);
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
    bridges: life.bridges && life.bridges.length ? `${life.bridges.length} joining the districts (longest ${Math.max(...life.bridges.map((b) => b.length))} blocks)` : '',
    skirt: life.skirt ? `${life.skirt} cells stepping down to the land` : '',
    terrain: stats_terrain ? `fitted to the land · base y ${stats_terrain.baseY} · terraces to ${stats_terrain.maxTerrace}` : '',
    hillBlocks: life.hills ? life.hills.blocks.filter((b) => b.e > 0).length : 0,
    hillMax: life.hills ? Math.max(0, ...life.hills.blocks.map((b) => b.e)) : 0,
    staircases: (life.stairRuns || []).length,
    reachable: life.reach ? `${life.reach.reached}/${life.reach.total}` : '',
    cats: (life.spawns || []).filter((p) => p.type === 'cat').length,
    pandas: (life.spawns || []).filter((p) => p.type === 'panda').length,
    fish: (life.spawns || []).filter((p) => p.type === 'cod' || p.type === 'salmon' || p.type === 'tropicalfish').length,
    twisted: buildings.filter((b) => b.twist).length,
    shapes: buildings.filter((b) => b.shape).map((b) => b.shape),
    courtyards: (life.courtyards || []).map((c) => c.kind),
    canals: (life.canals || []).length,
    footbridges: (life.canals || []).reduce((n, c) => n + (c.footbridges || []).length, 0),
    hostiles: (life.hostiles || []).length,
    fishSpawners: (life.spawners || []).length,
    underground: (life.rooms || []).length ? { cellars: life.rooms.filter((r) => r.kind === 'cellar').length, crypts: life.rooms.filter((r) => r.kind === 'crypt').length } : null,
    cliff: life.cliffWays ? { tiers: life.cliffWays.edges.length + 1, flights: life.cliffWays.flights.length } : null,
    islands: life.islands ? { count: life.islands.count, deepest: life.islands.deepest, biggest: life.islands.sizes.slice(0, 5) } : null,
    stilts: life.stilts ? { piles: life.stilts.piles, lanterns: life.stilts.lanterns, islands: life.stilts.island, open: life.stilts.open } : null,
    styleDistricts: life.styleDistricts ? life.styleDistricts.counts : null,
    lighting: life.lighting ? { added: life.lighting.hung + life.lighting.flush + life.lighting.standing, hung: life.lighting.hung, flush: life.lighting.flush, standing: life.lighting.standing, darkBefore: life.lighting.before, darkAfter: life.lighting.after } : null,
    dome: life.dome ? { radius: life.dome.R, height: life.dome.c, cells: life.dome.cells, doors: life.dome.doors.length } : null,
    torii: plan.lots.reduce((n, l) => n + ((l.torii && l.torii.length) || 0), 0),
    stoneLanterns: plan.lots.reduce((n, l) => n + ((l.stoneLanterns && l.stoneLanterns.length) || 0), 0),
    pondsDeep: (life.ponds || []).filter((p) => p.deep > 0).length,
    megaliths: (life.megaliths || []).map((m) => m.kind),
    animals: (life.spawns || []).filter((p) => ['cow', 'sheep', 'pig', 'chicken'].includes(p.type)).length,
    wallHeight: life.wall ? life.wall.height : 0,
    gates: life.wall ? life.wall.gates.length : 0,
  };
}
