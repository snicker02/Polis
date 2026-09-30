// engine/dome.js — a glass dome over the whole city, sealed all round.
//
// GEOMETRY
// --------
// The dome is half an ellipsoid of revolution standing on the ground (y = G),
// centred on the city: horizontal radius R, height c. A point at horizontal
// distance r and height t above the ground is inside when
//     r²/R² + t²/c² <= 1.
// R clears every block in the city by a margin; c is the least height that
// keeps three blocks of air over every block inside: a block at (r, h) needs
//     c >= (h + 3) / √(1 - r²/R²),
// and c is never flatter than 0.45·R, so it reads as a dome.
//
// Drawing it without gaps: over each column the surface stands at
//     s(r) = c·√(1 - r²/R²),
// and the column's shell runs from one above the lowest of its four
// neighbours' surfaces (a neighbour outside the dome counts as the ground) up
// to s itself, and always holds at least the cell at s. Every step in height between neighbouring columns is filled, so
// the shell is closed to anything moving block to block: sealed.
//
// Glass between ribs: twelve meridians from the base to the crown, a ring
// every sixteen blocks up, a course at the base, glowstone at the crown. The
// ground under the whole dome is made whole (a lawn wherever it was missing),
// and a double door opens at each compass point.
//
// Real ground outside the city is not flat, so the dome is for invented cities.

import { MAT, doorId, DIR } from './materials.js';

const MARGIN = 4, HEAD = 3, RIBS = 12, RING = 16, FLAT = 0.45;

export function domeShape(world, G) {
  // centre and extent from the blocks themselves
  const b = world.box;
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  let rMax = 0;
  const cols = new Map();                                  // "x,z" -> highest block y
  world.forEach((x, y, z) => {
    const r = Math.hypot(x - cx, z - cz);
    if (r > rMax) rMax = r;
    if (y > G) { const k = x + ',' + z, t = cols.get(k); if (t === undefined || y > t) cols.set(k, y); }
  });
  let R = Math.ceil(rMax + MARGIN);
  const need = (R) => {
    let c = FLAT * R;
    for (const [k, y] of cols) {
      const [x, z] = k.split(',').map(Number);
      const q = 1 - (Math.hypot(x - cx, z - cz) / R) ** 2;
      if (q <= 0) return Infinity;
      c = Math.max(c, (y - G + HEAD) / Math.sqrt(q));
    }
    return c;
  };
  let c = need(R);
  for (let i = 0; i < 20 && c > 3.2 * R; i++) { R = Math.ceil(R * 1.08); c = need(R); }   // a wider dome stays lower
  return { cx, cz, R, c: Math.ceil(c) };
}

export function buildDome(world, G, opts = {}) {
  const { cx, cz, R, c } = opts.shape || domeShape(world, G);
  const surf = (x, z) => {
    const q = 1 - ((x - cx) ** 2 + (z - cz) ** 2) / (R * R);
    return q > 0 ? G + c * Math.sqrt(q) : G;
  };
  const x0 = Math.floor(cx - R) - 1, x1 = Math.ceil(cx + R) + 1, z0 = Math.floor(cz - R) - 1, z1 = Math.ceil(cz + R) + 1;
  const info = { cx, cz, R, c, glass: 0, ribs: 0, ground: 0, skipped: 0, doors: [], top: G + c };
  // the world remembers its dome, so the exports can write air through all of
  // the inside of it (see domeAir): built under water, loading it then drives
  // the water out, while outside the shell nothing is touched
  world.dome = { cx, cz, R, c, G };
  // the ground: whole under the dome
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (z - cz) ** 2 > (R + 1) ** 2) continue;
      if (!world.has(x, G, z)) {
        world.set(x, G, z, opts.ground !== undefined ? opts.ground : MAT.GRASS);   // the style's own ground
        for (let y = 0; y < G; y++) if (!world.has(x, y, z)) world.set(x, y, z, MAT.BASE);
        info.ground++;
      }
    }
  // the shell
  const shell = [];
  for (let z = z0; z <= z1; z++)
    for (let x = x0; x <= x1; x++) {
      const s = surf(x, z);
      if (s <= G) continue;                                 // outside
      let low = s;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) low = Math.min(low, surf(x + a, z + b));
      // (never empty: the column always keeps its own surface cell, even when
      // its neighbours' surfaces lie within the same block as its own)
      const yHi = Math.max(G + 1, Math.floor(s));
      const yLo = Math.max(G + 1, Math.min(Math.floor(low) + 1, yHi));
      for (let y = yLo; y <= yHi; y++) shell.push([x, y, z]);
    }
  // The centre mark's beacons shine up through the dome: where a beacon's column
  // meets the shell it is plain glass (a beam passes through glass), never a
  // quartz rib or the glowstone crown. Glass seals as well as quartz does.
  const beams = new Set(opts.beams || []);
  info.beamCells = 0;
  let topCell = null;
  for (const [x, y, z] of shell) {
    if (world.has(x, y, z)) { info.skipped++; continue; }
    if (beams.has(x + ',' + z)) { world.set(x, y, z, MAT.GLASS); info.glass++; info.beamCells++; continue; }
    const rx = Math.hypot(x - cx, z - cz);
    const ang = Math.atan2(z - cz, x - cx);
    const k = Math.round(ang / (2 * Math.PI / RIBS));
    const onMeridian = rx * Math.abs(ang - k * 2 * Math.PI / RIBS) < 0.6;
    const onRing = y === G + 1 || (y - G) % RING === 0;
    const rib = onMeridian || onRing;
    world.set(x, y, z, rib ? MAT.QUARTZ : MAT.GLASS);
    if (rib) info.ribs++; else info.glass++;
    if (!topCell || y > topCell[1]) topCell = [x, y, z];
  }
  if (topCell) world.set(topCell[0], topCell[1], topCell[2], MAT.GLOWSTONE);
  info.cells = shell.length - info.skipped;
  // doors: a double door at each compass point, in the base of the shell. A
  // door goes in a column whose shell runs unbroken from the ground to at least
  // three up, so the door and the shell over it still seal the column; any stub
  // of shell in the column just outside it (the outer column's lowest cells)
  // is cleared to give the doorway room, which leaves the seal where it was.
  const range = (x, z) => {
    const s = surf(x, z);
    if (s <= G) return null;
    let low = s;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) low = Math.min(low, surf(x + a, z + b));
    const yHi = Math.max(G + 1, Math.floor(s));
    return [Math.max(G + 1, Math.min(Math.floor(low) + 1, yHi)), yHi];
  };
  const doorable = (x, z) => { const r = range(x, z); return r && r[0] === G + 1 && r[1] >= G + 3; };
  const mx = Math.round(cx), mz = Math.round(cz);
  for (const [face, dx, dz] of [['east', 1, 0], ['west', -1, 0], ['south', 0, 1], ['north', 0, -1]]) {
    let at = null;
    for (let k = Math.ceil(R) + 1; k >= 0; k--) {
      const x = mx + dx * k, z = mz + dz * k;
      if (doorable(x, z)) { at = [x, z]; break; }
    }
    if (!at) continue;
    const side = dx ? [0, 1] : [1, 0];
    const cells = [at];
    const second = [at[0] + side[0], at[1] + side[1]];
    if (doorable(...second)) cells.push(second);
    cells.forEach(([x, z], i) => {
      world.set(x, G + 1, z, doorId('dark', DIR[face], false, cells.length === 2 ? i : 0));
      world.set(x, G + 2, z, doorId('dark', DIR[face], true, cells.length === 2 ? i : 0));
      for (let y = G + 1; y <= G + 2; y++) {
        const id = world.get(x + dx, y, z + dz);
        if (id === MAT.GLASS || id === MAT.QUARTZ) world.clear(x + dx, y, z + dz);
      }
    });
    info.doors.push({ face, cells, out: [dx, dz] });
  }
  return info;
}

// Is (x, y, z) inside the dome's air: above the ground and within the shell?
// The exports write real air (not "leave alone") into every empty cell for
// which this holds, so a city domed under water or in a hillside is emptied
// inside and the world outside the shell is left exactly as it was.
export function domeAir(d) {
  return (x, y, z) => y >= d.G + 1 && ((x - d.cx) ** 2 + (z - d.cz) ** 2) / (d.R * d.R) + ((y - d.G) / d.c) ** 2 <= 1;
}
