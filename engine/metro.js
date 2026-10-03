// engine/metro.js — a metro under the main streets.
//
// A line runs under the longest main street each way (east-west, north-south),
// along its middle, at least 64 long: a tunnel three wide and three high, walls,
// roof and floor of stone brick, track down the middle with a powered rail every
// eight on a hidden redstone block, a stop block at each end. The second line
// runs five deeper and passes under the first (track cannot cross on the level).
//
// Stations at both ends and about every 48 between: a hall nine wide, nine long
// and four high, lanterns hung down both sides, a minecart waiting on the track.
// From each station a straight flight of stairs climbs to the pavement of the
// street above, on a row clear of the tram track, and comes out through an
// opening railed on its sides. A flight that would come out by a building's door
// is tried on the street's other side, and left out if neither will do (the hall
// still stands). Torches light the tunnel walls: the lighting pass would put
// floor lights under the track, where the redstone is.
//
// Nothing is dug where something is built already (a cellar, the crypt, a
// canal): the room has to be soft fill or empty. Every tunnel, hall and stair is
// listed on the world as air (the ground in the game is the world's own).

import { MAT, MATERIALS, stairId, WEIRDO, railId, poweredRailId, RAIL } from './materials.js';
import { USE } from './plan.js';

const SOFT = new Set([MAT.BASE, MAT.DIRT, MAT.RETAIN, MAT.CLAY, MAT.GRAVEL, MAT.CANAL_BED]);

export function buildMetro(world, plan, cfg, G, opts = {}) {
  const { W, D, use, mask, corridors } = plan;
  const inCity = (x, z) => x >= 0 && z >= 0 && x < W && z < D && (!mask || mask[z * W + x]);
  const isStreet = (x, z) => inCity(x, z) && (use[z * W + x] === USE.ROAD || use[z * W + x] === USE.SIDEWALK);
  const rooms = world.airBoxes || [];
  const inRoom = (x, y, z) => rooms.some((b) => x >= b.x0 - 1 && x <= b.x1 + 1 && z >= b.z0 - 1 && z <= b.z1 + 1 && y >= b.y0 - 1 && y <= b.y1 + 1);
  const free = (x, y, z) => { const id = world.get(x, y, z); return (id === -1 || SOFT.has(id)) && !inRoom(x, y, z); };
  const boxes = [];
  const lines = [];
  const doors = [];
  for (const b of opts.buildings || []) for (const d of b.doorCells || []) doors.push(d);
  const byDoor = (x, z) => doors.some(([dx, dz]) => Math.abs(dx - x) <= 1 && Math.abs(dz - z) <= 1);
  // (street furniture gives way to a stair's opening: a lamp post, a sign, a flower)
  const FURNITURE = /fence|lantern|sign|flower|tulip|poppy|dandelion|allium|orchid|bluet|daisy|cornflower|lily|grass|fern|bush|carpet|torch/;
  const clearAbove = (x, z) => { for (let y = G + 1; y <= G + 3; y++) { const id = world.get(x, y, z); if (id === -1) continue; if (!FURNITURE.test(MATERIALS.def(id).block) && MATERIALS.def(id).block !== 'minecraft:sea_lantern') return false; } return true; };

  // the longest main street each way, long enough, not a canal's
  const pick = (axis) => {
    let best = null;
    for (const c of corridors || []) {
      if (c.axis !== axis || c.w < 5) continue;
      const len = axis === 'x' ? c.x1 - c.x0 + 1 : c.z1 - c.z0 + 1;
      if (len < 64) continue;
      const a = axis === 'x' ? Math.floor((c.z0 + c.z1) / 2) : Math.floor((c.x0 + c.x1) / 2);
      const u0 = axis === 'x' ? c.x0 : c.z0, u1 = axis === 'x' ? c.x1 : c.z1;
      // its middle has to be street all along (no canal down it)
      let ok = 0, all = 0;
      for (let u = u0; u <= u1; u++) { const [x, z] = axis === 'x' ? [u, a] : [a, u]; if (!inCity(x, z)) continue; all++; if (isStreet(x, z)) ok++; }
      if (all < 64 || ok < all) continue;
      if (!best || len > best.len) best = { c, axis, a, u0, u1, len };
    }
    return best;
  };
  const picks = [pick('x'), pick('z')].filter(Boolean);
  picks.forEach((p, li) => {
    const F = G - 9 - li * 5;                               // the tunnel's floor
    const cell = (u, a) => (p.axis === 'x' ? [u, a] : [a, u]);
    // the line's ends: inside the city, four in from the street's ends
    let u0 = p.u0 + 4, u1 = p.u1 - 4;
    while (u0 < u1 && !inCity(...cell(u0, p.a))) u0++;
    while (u1 > u0 && !inCity(...cell(u1, p.a))) u1--;
    if (u1 - u0 < 48) return;
    // the tunnel's room must be free
    for (let u = u0 - 1; u <= u1 + 1; u++) for (let da = -2; da <= 2; da++) for (let y = F; y <= F + 4; y++) {
      const [x, z] = cell(u, p.a + da); if (!free(x, y, z)) return;
    }
    // the stations along it: both ends and about every 48
    const at = [u0 + 4];
    for (let u = u0 + 52; u < u1 - 30; u += 48) at.push(u);
    at.push(u1 - 4);
    const stations = [];
    for (const s of at) {
      let ok = true;
      for (let u = s - 4; u <= s + 4 && ok; u++) for (let da = -5; da <= 5 && ok; da++) for (let y = F; y <= F + 5; y++) { const [x, z] = cell(u, p.a + da); if (!free(x, y, z)) { ok = false; break; } }
      if (ok) stations.push({ u: s });
    }
    if (stations.length < 2) return;
    const climbUp = { 1: p.axis === 'x' ? WEIRDO.east : WEIRDO.south, [-1]: p.axis === 'x' ? WEIRDO.west : WEIRDO.north };
    // dig the tunnel
    for (let u = u0 - 1; u <= u1 + 1; u++)
      for (let da = -2; da <= 2; da++) {
        const [x, z] = cell(u, p.a + da);
        const wall = Math.abs(da) === 2 || u === u0 - 1 || u === u1 + 1;
        world.set(x, F, z, MAT.STONEBRICK);
        world.set(x, F + 4, z, MAT.STONEBRICK);
        for (let y = F + 1; y <= F + 3; y++) { if (wall) world.set(x, y, z, MAT.STONEBRICK); else world.clear(x, y, z); }
      }
    const [ax0, az0] = cell(u0, p.a - 1), [ax1, az1] = cell(u1, p.a + 1);
    boxes.push({ x0: Math.min(ax0, ax1), x1: Math.max(ax0, ax1), y0: F + 1, y1: F + 3, z0: Math.min(az0, az1), z1: Math.max(az0, az1) });
    // the stations' halls
    const carts = [];
    for (const st of stations) {
      for (let u = st.u - 5; u <= st.u + 5; u++)
        for (let da = -5; da <= 5; da++) {
          const [x, z] = cell(u, p.a + da);
          const wall = Math.abs(da) === 5 || Math.abs(u - st.u) === 5;
          if (Math.abs(da) <= 2 && u >= u0 && u <= u1) {
            // the hall's end walls stop at the tunnel, which runs on through them
            // (they stood across the track, and a cart would have hit them)
            if (Math.abs(u - st.u) === 5) continue;
            world.clear(x, F + 4, z); world.set(x, F + 5, z, MAT.STONEBRICK); continue;   // over the tunnel: its roof raised to the hall's
          }
          if (Math.abs(da) <= 2 && (u < u0 || u > u1)) continue;
          world.set(x, F, z, MAT.STONEBRICK);
          world.set(x, F + 5, z, MAT.STONEBRICK);
          for (let y = F + 1; y <= F + 4; y++) { if (wall) world.set(x, y, z, MAT.STONEBRICK); else world.clear(x, y, z); }
        }
      // (the tunnel's own side walls run on through the hall: open them)
      for (let u = st.u - 4; u <= st.u + 4; u++) for (const da of [-2, 2]) {
        if (u < u0 || u > u1) continue;
        const [x, z] = cell(u, p.a + da); for (let y = F + 1; y <= F + 4; y++) world.clear(x, y, z);
      }
      const [hx0, hz0] = cell(st.u - 4, p.a - 4), [hx1, hz1] = cell(st.u + 4, p.a + 4);
      boxes.push({ x0: Math.min(hx0, hx1), x1: Math.max(hx0, hx1), y0: F + 1, y1: F + 4, z0: Math.min(hz0, hz1), z1: Math.max(hz0, hz1) });
      // lanterns hung down both sides
      for (let u = st.u - 3; u <= st.u + 3; u += 3) for (const da of [-3, 3]) { const [x, z] = cell(u, p.a + da); world.set(x, F + 4, z, MAT.LAMP_HANG); }
      carts.push(cell(st.u, p.a));
    }
    // the track: a powered rail every eight on a redstone block, stop blocks at the ends
    const dir = p.axis === 'x' ? RAIL.EW : RAIL.NS;
    for (let u = u0; u <= u1; u++) {
      const [x, z] = cell(u, p.a);
      const boost = (u - u0) % 8 === 4;
      if (boost) world.set(x, F, z, MAT.REDSTONE);
      world.set(x, F + 1, z, boost ? poweredRailId(dir) : railId(dir));
    }
    // torches along the tunnel walls, every six, either side in turn (not in a hall)
    const inHall = (u) => stations.some((st) => Math.abs(u - st.u) <= 5);
    const T = { x: [MAT.TORCH_S, MAT.TORCH_N], z: [MAT.TORCH_E, MAT.TORCH_W] }[p.axis];
    let torches = 0;
    for (let u = u0 + 2, k = 0; u <= u1 - 2; u += 6, k++) {
      if (inHall(u)) continue;
      const side = k % 2 ? 1 : -1;
      const [x, z] = cell(u, p.a + side);
      world.set(x, F + 2, z, side < 0 ? T[0] : T[1]);
      torches++;
    }
    // the stairs up: from the hall to the pavement, a step a block. A straight
    // flight first; failing that a switchback (half the way up, a landing, back
    // the other way on the next row over), which comes out by its own station.
    const rise = G - F;
    let flights = 0;
    const plans = (st) => {
      const out = [];
      for (const side of [1, -1]) for (const ud of [1, -1]) {
        for (const da of [3, 2, 4]) {                           // straight
          const as = p.a + side * da, start = st.u + ud * 3;
          const steps = [];
          for (let i = 1; i <= rise; i++) steps.push({ u: start + ud * (i - 1), a: as, y: F + i, dir: ud });
          out.push({ steps, landing: [], exit: { u: start + ud * rise, a: as }, foot: { u: start - ud, a: as } });
        }
      }
      for (const side of [1, -1]) for (const ud of [1, -1]) {
        for (const da of [2, 1, 3]) {                           // switchback
          const as = p.a + side * da, bs = as + side, start = st.u + ud * 1;
          const h1 = Math.floor(rise / 2), h2 = rise - h1;
          const steps = [];
          for (let i = 1; i <= h1; i++) steps.push({ u: start + ud * (i - 1), a: as, y: F + i, dir: ud });
          const uL = start + ud * h1;
          for (let j = 1; j <= h2; j++) steps.push({ u: uL - ud * j, a: bs, y: F + h1 + j, dir: -ud });
          out.push({ steps, landing: [{ u: uL, a: as, y: F + h1 }, { u: uL, a: bs, y: F + h1 }], exit: { u: uL - ud * (h2 + 1), a: bs }, foot: { u: start - ud, a: as } });
        }
      }
      return out;
    };
    const hallHas = (st, u, a) => Math.abs(u - st.u) <= 5 && Math.abs(a - p.a) <= 5;
    for (const st of stations) {
      for (const pl of plans(st)) {
        const [ex, ez] = cell(pl.exit.u, pl.exit.a);
        if (!isStreet(ex, ez) || !clearAbove(ex, ez) || byDoor(ex, ez)) continue;
        if (pl.steps.some((q) => Math.abs(q.a - p.a) >= 5 && hallHas(st, q.u, q.a))) continue;   // not through the hall's side walls
        let ok = true;
        for (const q of [...pl.steps, ...pl.landing]) {
          const [x, z] = cell(q.u, q.a);
          if (!hallHas(st, q.u, q.a)) for (let yy = F; yy <= Math.min(G - 1, q.y + 3); yy++) if (!free(x, yy, z)) { ok = false; break; }
          if (!ok) break;
          if (q.y + 3 >= G && (!isStreet(x, z) || byDoor(x, z) || !clearAbove(x, z))) { ok = false; break; }
        }
        if (!ok) continue;
        // build it: the street furniture over the opening and the exit cleared away
        const all = [...pl.steps, ...pl.landing];
        const cellsOf = new Set(all.map((q) => q.u + ',' + q.a));
        for (const q of all) if (q.y + 3 >= G) { const [x, z] = cell(q.u, q.a); for (let yy = G + 1; yy <= G + 3; yy++) world.clear(x, yy, z); }
        for (let yy = G + 1; yy <= G + 3; yy++) world.clear(ex, yy, ez);
        const opening = [];
        for (const q of all) {
          const [x, z] = cell(q.u, q.a);
          for (let yy = F + 1; yy < q.y; yy++) world.set(x, yy, z, MAT.STONEBRICK);
          world.set(x, q.y, z, q.dir ? stairId('stonebrick', climbUp[q.dir]) : MAT.STONEBRICK);
          const top = Math.min(G + 3, q.y + 3);
          for (let yy = q.y + 1; yy <= top; yy++) world.clear(x, yy, z);
          if (q.y + 1 <= G && G <= top) opening.push([x, z]);
          boxes.push({ x0: x, x1: x, z0: z, z1: z, y0: q.y + 1, y1: Math.min(G - 1, q.y + 3) });
        }
        // the shaft's walls, where it runs outside the hall (not between its own cells)
        for (const q of all) {
          if (hallHas(st, q.u, q.a)) continue;
          for (const [du, dA] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nu = q.u + du, na = q.a + dA;
            if (cellsOf.has(nu + ',' + na) || (nu === pl.exit.u && na === pl.exit.a) || hallHas(st, nu, na)) continue;
            const [wx, wz] = cell(nu, na);
            for (let yy = q.y; yy <= Math.min(G - 1, q.y + 3); yy++) if (!world.has(wx, yy, wz) || SOFT.has(world.get(wx, yy, wz))) world.set(wx, yy, wz, MAT.STONEBRICK);
          }
        }
        // the opening railed round, the way out open
        const openSet = new Set(opening.map(([x, z]) => x + ',' + z));
        for (const [x, z] of opening) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz;
          if (openSet.has(nx + ',' + nz) || (nx === ex && nz === ez)) continue;
          // (never on the flight itself: its top step is level with the street, the way out)
          if (all.some((q) => { const [qx, qz] = cell(q.u, q.a); return qx === nx && qz === nz; })) continue;
          if (!isStreet(nx, nz) || !world.has(nx, G, nz) || world.has(nx, G + 1, nz)) continue;
          world.set(nx, G + 1, nz, MAT.FENCE);
        }
        const [fx, fz] = cell(pl.foot.u, pl.foot.a);
        st.stairs = { kind: pl.landing.length ? 'switchback' : 'straight', foot: [fx, F + 1, fz], exit: [ex, G + 1, ez], steps: pl.steps.map((q) => [...cell(q.u, q.a), q.y]), landing: pl.landing.map((q) => [...cell(q.u, q.a), q.y]) };
        flights++;
        break;
      }
    }
    lines.push({ axis: p.axis, a: p.a, u0, u1, F, stations: stations.map((st) => ({ at: cell(st.u, p.a), stairs: st.stairs || null })), carts: carts.map(([x, z]) => ({ type: 'minecart', x, y: F + 1, z })), torches, flights, cell });
  });
  if (boxes.length) (world.airBoxes || (world.airBoxes = [])).push(...boxes);
  return { lines, carts: lines.flatMap((l) => l.carts) };
}
