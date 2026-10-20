// engine/signature.js — the signature pieces of three styles (0.74.2), built over the city
// once it stands (city.js), in the style the city is built in:
//
// - Classical / Roman: an aqueduct along each canal, high over the water: a row of piers
//   standing in the middle of the channel, arches between them, a deck three wide carrying a
//   trough of water between low walls. Only where the air over the canal is clear (never
//   through a bridge's lamps, a crane or a tower); piers only in open water, never on a
//   bridge's deck; boats pass either side of a pier.
// - Nordic / Viking: longships moored in the harbour's basin: a hull eleven long, a keel and
//   a deck of planks, its sides lined with round shields (wool, red, yellow and white in
//   turn), a dragon's head curling up at the prow and a tail at the stern, a mast with a
//   striped sail across it. Clear of the moored boats and the cranes.
//
// (The Wild West's railroad and wooden water tower: city.js turns the railway and the water
// tower on for it, townbits.js builds the tower in wood.)

import { MAT, stairId, WEIRDO, WOOLS } from './materials.js';
import { USE_CANAL, WATER_LO, WATER_HI } from './water.js';

const DIRNAME = (dx, dz) => (dx > 0 ? 'east' : dx < 0 ? 'west' : dz > 0 ? 'south' : 'north');

// ---- the aqueduct ------------------------------------------------------------------------
export const AQUEDUCT = { rise: 8, every: 6, minRun: 13 };
export function buildAqueduct(world, plan, cn, G) {
  const { W, use } = plan;
  const Y = G + AQUEDUCT.rise;                               // the deck
  const mid = cn.ch0 + 1, A = [cn.ch0, mid, cn.ch1];
  const at = (u, a) => cn.cell(u, a);
  const open = (u) => { const [x, z] = at(u, mid); return use[z * W + x] === USE_CANAL; };
  // clear over the canal from four over its streets to two over the trough's walls
  const clearAt = (u) => A.every((a) => { const [x, z] = at(u, a); for (let y = G + 4; y <= Y + 3; y++) if (world.has(x, y, z)) return false; return true; });
  // a pier's column: open water down to the bed, nothing over it up to the deck
  const pierOk = (u) => { if (!open(u) || !clearAt(u)) return false; const [x, z] = at(u, mid); for (let y = WATER_HI + 1; y < G + 4; y++) if (world.has(x, y, z)) return false; return true; };
  const runs = [];
  let s = null;
  for (let u = cn.u0; u <= cn.u1 + 1; u++) {
    const ok = u <= cn.u1 && clearAt(u);
    if (ok && s === null) s = u;
    if (!ok && s !== null) { runs.push([s, u - 1]); s = null; }
  }
  const out = { runs: [], piers: [], deck: 0, water: 0 };
  for (let [u0, u1] of runs) {
    // its ends on piers: moved in to the nearest place a pier can stand
    while (u0 <= u1 && !pierOk(u0)) u0++;
    while (u1 >= u0 && !pierOk(u1)) u1--;
    if (u1 - u0 + 1 < AQUEDUCT.minRun) continue;
    // the piers: every six (or the nearest open water to it), the two ends always
    const piers = [u0];
    for (let u = u0 + AQUEDUCT.every; u < u1 - 2; u += AQUEDUCT.every) {
      const near = [0, 1, -1, 2, -2].map((d) => u + d).find((q) => q > piers[piers.length - 1] + 2 && q < u1 - 2 && pierOk(q));
      if (near !== undefined) { piers.push(near); u = near; }
    }
    piers.push(u1);
    // a span longer than ten has no pier where it needs one: that stretch left out
    let ok = true;
    for (let i = 1; i < piers.length; i++) if (piers[i] - piers[i - 1] > 10) ok = false;
    if (!ok) continue;
    for (const u of piers) {
      const [x, z] = at(u, mid);
      for (let y = WATER_LO; y < Y; y++) world.set(x, y, z, MAT.POL_DIORITE);
      out.piers.push([x, z]);
      // the arch's springing: a block out from the pier either way under the deck, across it
      for (const du of [-1, 1]) if (u + du >= u0 && u + du <= u1) for (const a of A) { const [ax, az] = at(u + du, a); if (!world.has(ax, Y - 1, az)) world.set(ax, Y - 1, az, MAT.QUARTZ_BRICKS); }
    }
    for (let u = u0; u <= u1; u++) for (const a of A) {
      const [x, z] = at(u, a);
      world.set(x, Y, z, MAT.SMOOTH_QUARTZ); out.deck++;
      const end = u === u0 || u === u1;
      if (a !== mid || end) world.set(x, Y + 1, z, MAT.QUARTZ_BRICKS);
      else { world.set(x, Y + 1, z, MAT.WATER); out.water++; }
    }
    out.runs.push({ u0, u1, piers: piers.length });
  }
  return out.runs.length ? out : null;
}

// ---- the longships --------------------------------------------------------------------------
export const LONGSHIP = { L: [11, 9] };
export function buildLongships(world, h, built, max = 2) {
  if (!h || !built || h.basin < 3) return [];
  const Wt = WATER_HI;
  const kc = Math.min(h.basin - 1, Math.max(2, Math.ceil(h.basin / 2)));   // its keel's row across the basin
  const cellAt = (u, k) => h.cell(u, h.aAt(k));
  const SW = h.basin >= 5 ? 2 : 1;                           // the sail's reach either side of the mast (inside the basin)
  // the cells it takes: the hull three across, the sail across the basin, from the keel to the
  // masthead (a moored boat where it lies is moved off: the ship takes its berth)
  const fits = (s, L) => {
    for (let u = s; u < s + L; u++) for (let k = kc - SW; k <= kc + SW; k++) {
      if (k < 1 || k > h.basin) return false;
      const [x, z] = cellAt(u, k);
      if (Math.abs(k - kc) <= 1 && world.get(x, Wt, z) !== MAT.WATER) return false;
      for (let y = Wt + 1; y <= Wt + 9; y++) if (world.has(x, y, z)) return false;
    }
    return true;
  };
  const ships = [];
  const SHIELDS = [WOOLS[0], WOOLS[1], WOOLS[3]];
  for (const L of LONGSHIP.L) for (let s = h.u0; s + L - 1 <= h.u1 && ships.length < max; s++) {
    if (!fits(s, L)) continue;
    const put = (u, k, y, id) => { const [x, z] = cellAt(u, k); world.set(x, y, z, id); };
    const mu = s + Math.floor(L / 2);
    for (let u = s + 1; u <= s + L - 2; u++) {
      put(u, kc, Wt - 1, MAT.DARK_PLANKS);                           // the keel
      put(u, kc, Wt, u >= s + 2 && u <= s + L - 3 ? MAT.SPRUCE : MAT.DARK_PLANKS);   // the deck
      for (const k of [kc - 1, kc + 1]) {
        put(u, k, Wt, MAT.DARK_PLANKS);
        put(u, k, Wt + 1, (u - s) % 2 === 0 ? SHIELDS[((u - s) / 2) % 3] : MAT.DARK_PLANKS);
      }
    }
    // the prow and the stern: a neck curling up, a dragon's head (a stair turned out) at the
    // prow, a tail at the stern
    const [ax, az] = cellAt(s, kc), [bx, bz] = cellAt(s + 1, kc);
    const back = DIRNAME(ax - bx, az - bz), fore = DIRNAME(bx - ax, bz - az);
    for (const [u, dir, tall] of [[s, back, 3], [s + L - 1, fore, 2]]) {
      put(u, kc, Wt, MAT.DARK_PLANKS); put(u, kc, Wt + 1, MAT.DARK_PLANKS);
      for (let y = Wt + 2; y < Wt + 1 + tall; y++) put(u, kc, y, MAT.DARK_FENCE);
      put(u, kc, Wt + 1 + tall, stairId('dark', WEIRDO[dir]));
    }
    // the mast and its sail, striped red and white, across the ship
    for (let y = Wt + 1; y <= Wt + 8; y++) put(mu, kc, y, MAT.STRIP_SPRUCE);
    for (let k = kc - SW; k <= kc + SW; k++) if (k !== kc) for (let y = Wt + 3; y <= Wt + 7; y++) put(mu, k, y, (k + 8) % 2 === 0 ? WOOLS[0] : WOOLS[3]);
    // the boats moored where it lies moved off (left out)
    const cells = [];
    for (let u = s - 1; u <= s + L; u++) for (let k = kc - SW - 1; k <= kc + SW + 1; k++) cells.push(cellAt(u, k));
    const inShip = (b) => cells.some(([x, z]) => Math.floor(b.x) === x && Math.floor(b.z) === z);
    const before = built.boats.length;
    const moved = built.boats.filter((b) => inShip(b));
    built.boats = built.boats.filter((b) => !inShip(b));
    // (each to the nearest open water in the basin, clear of the ship and of the other boats)
    for (const b of moved) {
      let best = null;
      for (let u = h.u0; u <= h.u1; u++) for (let k = 1; k <= h.basin; k++) {
        const [x, z] = cellAt(u, k);
        if (world.get(x, Wt, z) !== MAT.WATER || world.has(x, Wt + 1, z) || world.has(x, Wt + 2, z)) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, c]) => world.get(x + a, Wt, z + c) !== MAT.WATER)) continue;
        if (built.boats.some((o) => Math.abs(Math.floor(o.x) - x) <= 2 && Math.abs(Math.floor(o.z) - z) <= 2)) continue;
        const d = Math.abs(x - b.x) + Math.abs(z - b.z);
        if (!best || d < best.d) best = { x, z, d };
      }
      if (best) built.boats.push({ ...b, x: best.x + (b.x % 1), z: best.z + (b.z % 1) });
    }
    const [cx, cz] = cellAt(mu, kc);
    ships.push({ at: [cx, Wt, cz], L, u0: s, u1: s + L - 1, kc, prow: cellAt(s, kc), stern: cellAt(s + L - 1, kc), boatsMoved: moved.length, boatsLost: before - built.boats.length });
    s += L + 1;
  }
  return ships;
}
