// engine/sea.js — a city under the sea: the city on the seabed in a hall of glass,
// the sea all round it and over it, held in by a second wall of glass outside.
//
// THE HALL
// --------
// Its footprint is a rounded rectangle (a superellipse of exponent P) round the city,
// half-axes A and B. Over it the glass stands as a wall Hw high all round, then
// vaults over: over a column at "radius" r (the superellipse's own measure, 1 at the
// footprint's edge) the shell's surface stands at
//     s = G + Hw + c·√(1 − r²),
// so at the edge the shell drops straight to the ground: the wall. Hw and c are the
// pair that keep HEAD blocks of air over every block of the city for the least
// height in all; the vault never flatter than CMIN. The footprint takes in every
// block of the city (the whole plan's ground), widened until a hall fits.
//
// The shell is drawn as the dome's is (dome.js): over each column from one above the
// lowest of its four neighbours' surfaces (a neighbour outside counts as the ground)
// up to its own, so neighbouring columns always meet: sealed. Glass between ribs of
// dark prismarine (a grid every RIB blocks, a course at the foot), sea lanterns
// dotted along the ribs to light the sea outside and the streets inside.
//
// THE SEA
// -------
// RING blocks of sea all round the hall to an outer wall of glass (posts of dark
// prismarine with sea lanterns up them, a rim of prismarine brick), the sea's surface
// DEPTH over the hall's top. On the seabed (sand, gravel and clay): seagrass, kelp,
// coral, sea pickles (their light keeps the seabed lit), the odd broken column of a
// ruin; fish swim in it. The sea is not blocks of the world (a million and more of
// water would swamp it): the world keeps a description of it (world.sea), and each
// export writes the water from that: Bedrock in structures of their own loaded after
// every tile of the city is in, so the hall is whole before any water comes (the
// structure writer: opts.seaAt), Java in pieces placed after the city's.
//
// THE WAY IN
// ----------
// A tunnel of glass at the middle of each side, from a doorway in the hall's wall
// across the sea to a double door in the outer wall: the city's four gates. Each is
// put where the ground inside the doorway is open.
//
// The inside of the hall (and of the tunnels) is told to the exports as the dome's
// is (world.dome.air): written as air, so built in a real ocean the hall is emptied.

import { MAT, MATERIALS, B as BIT, I, S, doorId, DIR } from './materials.js';
import { VoxelWorld } from './blockcore.js';
import { makeRng } from './rng.js';
import { tropicalVariant, FISH_NAMES } from './fish.js';

const MARGIN = 5, HEAD = 4, P = 8, RING = 10, DEPTH = 5, RIB = 16, MINWALL = 8, CMIN_K = 0.12;

const mat = (block, color, states = {}, flags = {}) => MATERIALS.add(null, 'minecraft:' + block, color, states, flags);
const PLANT = { passable: true, flowable: true, transparent: true };
export const SEA_MAT = {
  get DARK() { return mat('dark_prismarine', '#335b4f'); },
  get BRICK() { return MAT.AQUA_WALL; },
  get PRISM() { return mat('prismarine', '#63a39a'); },
  get CLAY() { return MAT.CLAY; },
};

// the superellipse's measure of a column: 1 on the footprint's edge
const measure = (cx, cz, A, B) => (x, z) => Math.pow(Math.pow(Math.abs(x - cx) / A, P) + Math.pow(Math.abs(z - cz) / B, P), 1 / P);

export function seaShape(world, G) {
  const b = world.box;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  const W = b.x1 - b.x0 + 1, D = b.z1 - b.z0 + 1;
  const top = new Int16Array(W * D).fill(-32768);
  world.forEach((x, y, z) => { if (y < G) return; const i = (z - b.z0) * W + (x - b.x0); if (y > top[i]) top[i] = y; });
  const cols = [];                                           // [x, z, height over the ground]
  let maxH = 0;
  for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) {
    const t = top[(z - b.z0) * W + (x - b.x0)];
    if (t === -32768) continue;
    cols.push([x, z, t - G]);
    if (t - G > maxH) maxH = t - G;
  }
  // the best wall and vault for a footprint (null if a block falls outside it)
  const fit = (A, B) => {
    const r = measure(cx, cz, A, B);
    const sq = new Float64Array(cols.length), hs = new Int16Array(cols.length);
    for (let i = 0; i < cols.length; i++) {
      const [x, z, h] = cols[i];
      // (a column's whole cell inside, with half a block to spare)
      const m = Math.max(r(x - 0.5, z - 0.5), r(x + 0.5, z - 0.5), r(x - 0.5, z + 0.5), r(x + 0.5, z + 0.5));
      if (m >= 0.995) return null;
      sq[i] = Math.sqrt(1 - m * m); hs[i] = h;
    }
    const cmin = Math.max(6, CMIN_K * Math.min(A, B));
    let best = null;
    for (let Hw = MINWALL; Hw <= Math.max(MINWALL, maxH + HEAD + 1); Hw++) {
      let c = cmin;
      for (let i = 0; i < cols.length; i++) { const n = (hs[i] + HEAD - Hw) / sq[i]; if (n > c) c = n; }
      const tot = Hw + c;
      if (!best || tot < best.tot - 1e-9) best = { Hw, c: Math.ceil(c), tot: Hw + Math.ceil(c) };
    }
    return best;
  };
  let A = W / 2 + MARGIN, B = D / 2 + MARGIN, f = null;
  for (let i = 0; i < 60 && !(f = fit(A, B)); i++) { A *= 1.03; B *= 1.03; }
  // a little wider can be a good deal lower (the vault rises steeply near its edge)
  let best = { A, B, ...f };
  for (let k = 1; k <= 6; k++) {
    const g = fit(A * (1 + 0.04 * k), B * (1 + 0.04 * k));
    if (g && g.tot + 2 * k < best.tot) best = { A: A * (1 + 0.04 * k), B: B * (1 + 0.04 * k), ...g };
  }
  return { cx, cz, A: best.A, B: best.B, Hw: best.Hw, c: best.c, maxH };
}

export function buildSeaCity(world, G, opts = {}) {
  const sh = opts.shape || seaShape(world, G);
  const { cx, cz, A, B, Hw, c } = sh;
  const rng = makeRng((opts.seed ^ 0x5ea5ea) >>> 0);
  const r = measure(cx, cz, A, B);
  const inFoot = (x, z) => r(x, z) < 1;
  const surf = (x, z) => { const m = r(x, z); return m < 1 ? G + Hw + c * Math.sqrt(1 - m * m) : G; };
  const fx0 = Math.floor(cx - A) - 1, fx1 = Math.ceil(cx + A) + 1, fz0 = Math.floor(cz - B) - 1, fz1 = Math.ceil(cz + B) + 1;
  const FW = fx1 - fx0 + 1, FD = fz1 - fz0 + 1;
  // each column's run of shell: yLo..yHi (none outside the footprint)
  const yLo = new Int16Array(FW * FD).fill(32767), yHi = new Int16Array(FW * FD).fill(-32768);
  const fi = (x, z) => (z - fz0) * FW + (x - fx0);
  let topY = G;
  for (let z = fz0; z <= fz1; z++) for (let x = fx0; x <= fx1; x++) {
    const s = surf(x, z);
    if (s <= G) continue;
    let low = s;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) low = Math.min(low, surf(x + a, z + b));
    const hi = Math.max(G + 1, Math.floor(s));
    yHi[fi(x, z)] = hi;
    yLo[fi(x, z)] = Math.max(G + 1, Math.min(Math.floor(low) + 1, hi));
    if (hi > topY) topY = hi;
  }
  const SEA = topY + DEPTH;                                   // the sea's surface: its top layer of water
  const ox0 = fx0 - RING, ox1 = fx1 + RING, oz0 = fz0 - RING, oz1 = fz1 + RING;
  const info = { cx, cz, A, B, Hw, c, top: topY, sea: SEA, box: { x0: ox0, x1: ox1, z0: oz0, z1: oz1 }, glass: 0, ribs: 0, lights: 0, skipped: 0,
    tunnels: [], outer: 0, kelp: 0, seagrass: 0, coral: 0, pickles: 0, ruins: 0, fish: [], wet: [] };
  const tunnelAir = new Set();
  const K = (x, y, z) => x + ',' + y + ',' + z;
  const interior = (x, y, z) => {
    if (y < G + 1) return false;
    if (x >= fx0 && x <= fx1 && z >= fz0 && z <= fz1) { const i = fi(x, z); if (yHi[i] !== -32768 && y < yLo[i]) return true; }
    return tunnelAir.has(K(x, y, z));
  };
  const DARK = SEA_MAT.DARK, BRICK = SEA_MAT.BRICK, PRISM = SEA_MAT.PRISM;
  // ---- the ground: whole under the hall (the style's ground), the seabed round it
  const BED = [MAT.SAND, MAT.SAND, MAT.SAND, MAT.SAND, MAT.GRAVEL, MAT.CLAY];
  for (let z = oz0; z <= oz1; z++) for (let x = ox0; x <= ox1; x++) {
    for (let y = 0; y < G; y++) if (!world.has(x, y, z)) world.set(x, y, z, MAT.BASE);
    if (world.has(x, G, z)) continue;
    if (inFoot(x, z)) world.set(x, G, z, opts.ground !== undefined ? opts.ground : MAT.GRASS);
    else {
      // patches, not noise: gravel and clay in drifts
      const n = Math.sin(x * 0.21 + Math.sin(z * 0.13) * 2) + Math.cos(z * 0.19 + Math.sin(x * 0.11) * 2);
      world.set(x, G, z, n > 1.2 ? MAT.GRAVEL : n < -1.4 ? MAT.CLAY : BED[Math.floor(rng() * 4)]);
    }
  }
  // ---- the hall's shell
  const beams = new Set(opts.beams || []);
  const shell = info.shell = new Set();
  const mx = Math.round(cx), mz = Math.round(cz);
  for (let z = fz0; z <= fz1; z++) for (let x = fx0; x <= fx1; x++) {
    const i = fi(x, z);
    if (yHi[i] === -32768) continue;
    for (let y = yLo[i]; y <= yHi[i]; y++) {
      if (world.has(x, y, z)) { info.skipped++; continue; }
      shell.add(x + ',' + y + ',' + z);
      if (beams.has(x + ',' + z)) { world.set(x, y, z, MAT.GLASS); info.glass++; continue; }
      const rib = (x - mx) % RIB === 0 || (z - mz) % RIB === 0 || y === G + 1;
      if (rib) {
        // (along the ribs every fifth block; along the foot of the wall every fourth, to light the seabed against it)
        const lamp = y > G + 1 ? (x + y + z) % 5 === 0 : (x + z) % 4 === 0;
        world.set(x, y, z, lamp ? MAT.SEA_LANTERN : DARK);
        if (lamp) info.lights++; else info.ribs++;
      } else { world.set(x, y, z, MAT.GLASS); info.glass++; }
    }
  }
  // ---- the outer wall
  const onOuter = (x, z) => x === ox0 || x === ox1 || z === oz0 || z === oz1;
  for (let z = oz0; z <= oz1; z++) for (let x = ox0; x <= ox1; x++) {
    if (!onOuter(x, z)) continue;
    const along = x === ox0 || x === ox1 ? z - oz0 : x - ox0;
    const corner = (x === ox0 || x === ox1) && (z === oz0 || z === oz1);
    const post = corner || along % 8 === 0;
    world.set(x, G, z, BRICK);
    for (let y = G + 1; y <= SEA + 1; y++) {
      const id = y === SEA + 1 ? BRICK : post ? ((y - G) % 6 === 3 ? MAT.SEA_LANTERN : DARK) : MAT.GLASS;
      world.set(x, y, z, id);
      info.outer++;
    }
  }
  // ---- the tunnels: one a side, a doorway in the hall's wall, a double door in the outer
  const SIDES = [['east', 1, 0], ['west', -1, 0], ['south', 0, 1], ['north', 0, -1]];
  for (const [face, ox, oz] of SIDES) {
    const lx = ox ? 0 : 1, lz = ox ? 1 : 0;
    const at = (k, t) => [mx + ox * k + lx * t, mz + oz * k + lz * t];
    const kOut = face === 'east' ? ox1 - mx : face === 'west' ? mx - ox0 : face === 'south' ? oz1 - mz : mz - oz0;
    const edge = (t) => { let k = 0; while (k < kOut && inFoot(...at(k + 1, t))) k++; return inFoot(...at(k, t)) ? k : -1; };
    const half = Math.floor(0.35 * (ox ? B : A));
    let t0 = null;
    for (let d = 0; d <= half && t0 === null; d++) for (const t of d ? [d, -d] : [0]) {
      if (t0 !== null) break;
      const rows = [t - 1, t, t + 1, t + 2];
      const ks = rows.map(edge);
      if (ks.some((k) => k < 1)) continue;
      // each row's wall a whole column from the ground to the tunnel's roof and over
      if (!rows.every((tt, j) => { const [x, z] = at(ks[j], tt); const i = fi(x, z); return yLo[i] === G + 1 && yHi[i] >= G + 5; })) continue;
      // the doorway opens on to open ground: three in from it clear to head height, a floor under
      const open = [t, t + 1].every((tt) => { const k = edge(tt); for (let d2 = 1; d2 <= 3; d2++) { const [x, z] = at(k - d2, tt); if (!world.has(x, G, z) || MATERIALS.isPassable(world.get(x, G, z))) return false; for (let y = G + 1; y <= G + 3; y++) if (world.has(x, y, z)) return false; } return true; });
      if (open) t0 = t;
    }
    if (t0 === null) continue;
    const rows = [t0 - 1, t0, t0 + 1, t0 + 2];
    const cells = [], doors = [];
    rows.forEach((t, j) => {
      const k0 = edge(t);
      const wallRow = j === 0 || j === 3;
      for (let k = k0 + 1; k < kOut; k++) {
        const [x, z] = at(k, t);
        const ring = (k - k0) % 5 === 0;
        world.set(x, G, z, BRICK);
        if (wallRow) for (let y = G + 1; y <= G + 4; y++) world.set(x, y, z, ring ? BRICK : MAT.GLASS);
        else {
          for (let y = G + 1; y <= G + 3; y++) { world.clear(x, y, z); tunnelAir.add(K(x, y, z)); }
          world.set(x, G + 4, z, ring ? MAT.SEA_LANTERN : MAT.GLASS);
          cells.push([x, G + 1, z]);
        }
      }
      if (!wallRow) {
        // the doorway through the hall's wall
        const [x, z] = at(k0, t);
        for (let y = G + 1; y <= G + 3; y++) { world.clear(x, y, z); tunnelAir.add(K(x, y, z)); }
        // the door in the outer wall
        const [dx, dz] = at(kOut, t);
        const hinge = j === 1 ? 0 : 1;
        world.set(dx, G + 1, dz, doorId('dark', DIR[face], false, hinge));
        world.set(dx, G + 2, dz, doorId('dark', DIR[face], true, hinge));
        doors.push([dx, G + 1, dz]);
      }
    });
    const [ix, iz] = at(edge(t0) - 1, t0);
    info.tunnels.push({ face, out: [ox, oz], doors, cells, inside: [ix, G + 1, iz], outside: [doors[0][0] + ox, G + 1, doors[0][2] + oz] });
  }
  // a ruin or two: broken columns of prismarine in the corners of the sea
  for (const [x, z] of [[ox0 + 4, oz0 + 4], [ox1 - 4, oz1 - 4], [ox0 + 4, oz1 - 4], [ox1 - 4, oz0 + 4]]) {
    if (inFoot(x, z)) continue;
    const h = 3 + Math.floor(rng() * 6);
    for (let y = G + 1; y <= G + h; y++) { if (world.has(x, y, z)) world.clear(x, y, z); world.set(x, y, z, y === G + h ? PRISM : y % 3 === 0 ? DARK : BRICK); }
    info.ruins++;
  }
  // ---- the seabed's life, in the ring between the walls
  const free = (x, z) => !inFoot(x, z) && !onOuter(x, z) && !world.has(x, G + 1, z) && !tunnelAir.has(K(x, G + 1, z));
  const nearTunnel = (x, z) => info.tunnels.some((T) => T.cells.some(([a, , b]) => Math.abs(a - x) <= 2 && Math.abs(b - z) <= 2));
  const wet = (x, y, z) => info.wet.push([x, y, z]);
  const KELP = (age) => mat('kelp', '#2a6a3a', { kelp_age: I(age) }, PLANT);
  const GRASS = mat('seagrass', '#2a8a4a', { sea_grass_type: S('default') }, PLANT);
  const PICKLE = mat('sea_pickle', '#6a9a2a', { cluster_count: I(3), dead_bit: BIT(0) }, PLANT);
  const CORALS = ['tube', 'brain', 'bubble', 'fire', 'horn'];
  const COLOUR = { tube: '#3150c8', brain: '#c45a9a', bubble: '#a030a8', fire: '#b02a2a', horn: '#d0c040' };
  const depth = SEA - G;
  // (a light every six blocks each way, a line of them three in from each outer wall,
  // and every third or so along the foot of the hall's wall)
  const gridX = (x) => (x - ox0) % 6 === 3 || x === ox1 - 3, gridZ = (z) => (z - oz0) % 6 === 3 || z === oz1 - 3;
  for (let z = oz0 + 1; z < oz1; z++) for (let x = ox0 + 1; x < ox1; x++) {
    if (!free(x, z) || nearTunnel(x, z)) continue;
    // the lights first: a sea pickle cluster every six blocks
    const hugs = inFoot(x + 1, z) || inFoot(x - 1, z) || inFoot(x, z + 1) || inFoot(x, z - 1);
    if ((gridX(x) && gridZ(z)) || (hugs && ((x + z) % 3 === 0 || (x - z) % 3 === 0))) { world.set(x, G + 1, z, PICKLE); wet(x, G + 1, z); info.pickles++; continue; }
    const p = rng();
    if (p < 0.05) {
      const h = Math.min(depth - 3, 4 + Math.floor(rng() * 14));
      for (let y = G + 1; y <= G + h; y++) { world.set(x, y, z, KELP(y === G + h ? 25 : 0)); wet(x, y, z); }
      info.kelp++;
    } else if (p < 0.17) { world.set(x, G + 1, z, GRASS); wet(x, G + 1, z); info.seagrass++; }
    else if (p < 0.19 && world.get(x, G, z) === MAT.SAND) {
      // a coral head: a block of coral in the seabed, a coral or a fan on it
      const kind = CORALS[Math.floor(rng() * CORALS.length)];
      world.set(x, G, z, mat(kind + '_coral_block', COLOUR[kind]));
      const on = rng() < 0.5 ? mat(kind + '_coral', COLOUR[kind], {}, PLANT) : mat(kind + '_coral_fan', COLOUR[kind], { coral_fan_direction: I(0) }, PLANT);
      world.set(x, G + 1, z, on); wet(x, G + 1, z);
      info.coral++;
    }
  }
  // ---- fish: in the open water of the ring, at all depths
  const fishCols = [];
  for (let z = oz0 + 2; z < oz1 - 1; z++) for (let x = ox0 + 2; x < ox1 - 1; x++) if (!inFoot(x, z) && !inFoot(x + 1, z) && !inFoot(x - 1, z) && !inFoot(x, z + 1) && !inFoot(x, z - 1) && !nearTunnel(x, z)) fishCols.push([x, z]);
  const want = Math.min(60, Math.round(((ox1 - ox0) + (oz1 - oz0)) / 8));
  for (let n = 0, tries = 0; n < want && tries < want * 20 && fishCols.length; tries++) {
    const [x, z] = fishCols[Math.floor(rng() * fishCols.length)];
    const y = G + 4 + Math.floor(rng() * Math.max(1, depth - 8));
    if (world.has(x, y, z) || interior(x, y, z) || info.fish.some((f) => Math.max(Math.abs(f.x - x), Math.abs(f.z - z), Math.abs(f.y - y)) < 3)) continue;
    const q = rng(), type = q < 0.5 ? 'tropicalfish' : q < 0.8 ? 'cod' : 'salmon';
    const f = { type, x, y, z, water: 'sea', name: FISH_NAMES[type] };
    if (type === 'tropicalfish') f.variant = tropicalVariant({ int: (a, b) => a + Math.floor(rng() * (b - a + 1)) });
    info.fish.push(f); n++;
  }
  // ---- what the exports are told
  const seaAt = (x, y, z) => x > ox0 && x < ox1 && z > oz0 && z < oz1 && y > G && y <= SEA && !interior(x, y, z);
  world.dome = { kind: 'sea', G, air: interior, bounds: { x0: fx0, x1: fx1, z0: fz0, z1: fz1, y0: G + 1, y1: topY } };
  world.sea = { G, S: SEA, box: info.box, at: seaAt };
  info.interior = interior;
  info.inFoot = inFoot;
  info.seaAt = seaAt;
  info.footBox = { x0: fx0, x1: fx1, z0: fz0, z1: fz1 };
  return info;
}
