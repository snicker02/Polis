// engine/findboard.js — "Find a landmark" in the game (0.81.0): a board by the centre monument,
// a sign for every landmark with a button under it that takes you there.
//
// (0.82.0) Joined to the monument where it can be: a wall running on from one of its sides, in
// line with it, two faces where there is room before both, one where the other side is against
// a building (never across a door, the monument's alcove kept clear). Failing that:
// a wall two thick, standing near the monument on open ground (a square, a park, a pavement;
// never a street's roadway), with signs on both faces: on each, three rows of a sign over a
// button. The sign names the landmark and its function (goto_<name>, for /function <city>/
// goto_<name> from anywhere); the button, on a command block in the wall, runs that very function
// for the player who pressed it (the goto functions find the city's centre marker in the
// monument's alcove, beside the board). The first sign on the front says what the board is.
// Sea lanterns along its top. Command blocks must be on.

import { MAT, MATERIALS, I as INT, B as BYTE, wallSignId, signId, SIGN_FACING } from './materials.js';
import { commandBlock } from './airport.js';
import { USE } from './plan.js';

export const BOARD = { ROWS: 3, REACH: 90 };
const FACING = { north: 2, south: 3, west: 4, east: 5 };
const button = (face) => MATERIALS.add(null, 'minecraft:stone_button', '#8a8a8a', { button_pressed_bit: BYTE(0), facing_direction: INT(FACING[face]) }, { passable: true, transparent: true });
const impulse = () => MATERIALS.add(null, 'minecraft:command_block', '#b07a4e', { conditional_bit: BYTE(0), facing_direction: INT(1) });
const nm = (v) => (v[0] > 0 ? 'east' : v[0] < 0 ? 'west' : v[1] > 0 ? 'south' : 'north');
const clean = (t) => String(t).replace(/[^A-Za-z0-9 &'.-]/g, '');

export function buildFindBoard(world, plan, centre, places, ctx) {
  const { GROUND, elevAt, signTags } = ctx;
  const list = places.filter((P) => P && P.id);
  if (!centre || !list.length) return { missing: !centre ? 'no centre monument' : 'no landmarks to list' };
  const N = list.length + 1;                                         // (and the title)
  const { W, D, use, mask } = plan;
  const [cx, , cz] = centre.stand;
  const g0 = GROUND + elevAt(cx, cz);
  const OK_BOARD = new Set([USE.PLAZA, USE.PARK, USE.SIDEWALK]);
  const OK_STAND = new Set([USE.PLAZA, USE.PARK, USE.SIDEWALK, USE.ROAD]);
  const inPlan = (x, z) => x >= 1 && z >= 1 && x < W - 1 && z < D - 1 && (!mask || mask[z * W + x]);
  const ground = (x, z) => GROUND + elevAt(x, z) === g0 && world.has(x, g0, z) && !/water/.test(MATERIALS.def(world.get(x, g0, z)).block);
  const cellOk = (x, z, kinds) => inPlan(x, z) && kinds.has(use[z * W + x]) && ground(x, z)
    && [...Array(8)].every((_, k) => !world.has(x, g0 + 1 + k, z));
  // ---- (0.82.0) first, joined to the monument itself: a wall running on from one of its sides,
  // in line with it, signs on both faces where there is room before both, on one face where the
  // other is against a building (never across a door) ----------------------------------------
  const mono = { x0: cx, x1: cx, z0: cz, z1: cz };
  for (let dx = -4; dx <= 4; dx++) for (let dz = -4; dz <= 4; dz++) for (let dy = 1; dy <= 4; dy++) {
    const i = world.get(cx + dx, g0 + dy, cz + dz);
    if (i >= 0 && /diamond_block|beacon/.test(MATERIALS.def(i).block)) { mono.x0 = Math.min(mono.x0, cx + dx); mono.x1 = Math.max(mono.x1, cx + dx); mono.z0 = Math.min(mono.z0, cz + dz); mono.z1 = Math.max(mono.z1, cz + dz); }
  }
  const FV = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[centre.facing] || [0, 1];
  const entrance = [cx + FV[0], cz + FV[1]];
  const inMono = (x, z) => x >= mono.x0 - 0 && x <= mono.x1 && z >= mono.z0 && z <= mono.z1;
  const kept = (x, z) => !inMono(x, z) && !(x === entrance[0] && z === entrance[1]) && !(x === cx && z === cz);
  const boardOk = (x, z) => kept(x, z) && cellOk(x, z, OK_BOARD) && ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => [1, 2].some((dy) => { const i = world.get(x + a, g0 + dy, z + b); return i >= 0 && /door/.test(MATERIALS.def(i).block); }));
  const standOk = (x, z) => kept(x, z) && inPlan(x, z) && OK_STAND.has(use[z * W + x]) && ground(x, z) && !world.has(x, g0 + 1, z) && !world.has(x, g0 + 2, z);
  let best = null;
  const tryLayout = (cell, faces, K) => {
    for (let a = 0; a < K; a++) {
      for (const f of faces) { const [x, z] = cell(a, f.t); if (!boardOk(x, z)) return false; const [sx, sz] = [x + f.out[0], z + f.out[1]]; if (!standOk(sx, sz)) return false; }
    }
    return true;
  };
  for (const two of [true, false]) {
    const K = Math.ceil(N / ((two ? 2 : 1) * BOARD.ROWS));
    for (const along of [[1, 0], [0, 1]]) for (const sgn of [1, -1]) {
      if (best) break;
      const thick = [along[1], along[0]];
      const a0 = along[0] ? (sgn > 0 ? mono.x1 + 1 : mono.x0 - 1) : (sgn > 0 ? mono.z1 + 1 : mono.z0 - 1);
      const pLo = along[0] ? mono.z0 : mono.x0, pHi = along[0] ? mono.z1 : mono.x1;
      for (let p = (two ? pLo - 1 : pLo); p <= pHi && !best; p++) {
        const cell = (a, t) => along[0] ? [a0 + sgn * a, p + t] : [p + t, a0 + sgn * a];
        const layouts = two ? [[{ t: 0, out: [-thick[0], -thick[1]] }, { t: 1, out: thick }]] : [[{ t: 0, out: thick }], [{ t: 0, out: [-thick[0], -thick[1]] }]];
        for (const faces of layouts) if (!best && tryLayout(cell, faces, K)) best = { cell, faces, K, joined: true };
      }
    }
    if (best) break;
  }
  // ---- failing that, as before: two thick on open ground, as near the monument as it can be
  if (!best) {
    const K = Math.ceil(N / (2 * BOARD.ROWS));
    for (let r = 3; r <= BOARD.REACH && !best; r++) {
      for (let dz = -r; dz <= r && !best; dz++) for (let dx = -r; dx <= r && !best; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        for (const along of [[1, 0], [0, 1]]) {
          const thick = [along[1], along[0]];
          const x0 = cx + dx, z0 = cz + dz;
          const cell = (a, t) => [x0 + along[0] * a + thick[0] * t, z0 + along[1] * a + thick[1] * t];
          let ok = true;
          for (let a = 0; a < K && ok; a++) for (let t = -1; t <= 2 && ok; t++) {
            const [x, z] = cell(a, t);
            if (!cellOk(x, z, t === 0 || t === 1 ? OK_BOARD : OK_STAND)) ok = false;
            if (Math.abs(x - cx) <= 3 && Math.abs(z - cz) <= 4) ok = false;              // (clear of the monument)
          }
          if (ok) { best = { cell, faces: [{ t: 0, out: [-thick[0], -thick[1]] }, { t: 1, out: thick }], K, joined: false }; break; }
        }
      }
    }
  }
  if (!best) return { missing: 'no open ground near the centre monument for the board' };
  const { cell, faces, K } = best;
  const entries = [];
  const slots = [];
  for (const f of faces) for (let row = BOARD.ROWS - 1; row >= 0; row--) for (let a = 0; a < K; a++) slots.push({ f, row, a });
  // the wall: quartz where the signs hang, command blocks where the buttons are; lanterns on top
  for (let a = 0; a < K; a++) for (const f of faces) {
    const [x, z] = cell(a, f.t);
    for (let row = 0; row < BOARD.ROWS; row++) { world.set(x, g0 + 1 + 2 * row, z, MAT.STONEBRICK); world.set(x, g0 + 2 + 2 * row, z, MAT.SMOOTH_QUARTZ); }
    world.set(x, g0 + 1 + 2 * BOARD.ROWS, z, MAT.SEA_LANTERN);
  }
  const put = (f, row, a, P, title) => {
    const [x, z] = cell(a, f.t), ox = x + f.out[0], oz = z + f.out[1];
    const sy = g0 + 2 + 2 * row, by = g0 + 1 + 2 * row;
    world.set(ox, sy, oz, wallSignId(nm(f.out)));
    world.setData(ox, sy, oz, { id: 'Sign', tags: signTags(title || `${clean(P.name).slice(0, 30)}\npress below, or\n/function\ngoto_${P.id}`) });
    if (title) return { sign: [ox, sy, oz] };
    world.set(x, by, z, impulse());
    world.setData(x, by, z, commandBlock(`execute as @p[r=6] run function {ns}/goto_${P.id}`));
    world.set(ox, by, oz, button(nm(f.out)));
    return { id: P.id, name: P.name, sign: [ox, sy, oz], button: [ox, by, oz], command: [x, by, z] };
  };
  const title = slots.shift();
  const titleSign = put(title.f, title.row, title.a, null, 'Find a landmark\npress a button:\nit takes you\nthere');
  list.forEach((P, i) => { const s = slots[i]; if (s) entries.push(put(s.f, s.row, s.a, P)); });
  const [ax, az] = cell(0, 0), [bx, bz] = cell(K - 1, faces.length - 1);
  const rect = { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) };
  // (0.81.1) where to stand before it (its title's face), for goto_findboard; and, where the
  // ground round the monument is built up and the board stands further off, a sign by the
  // monument saying which way it is
  const tf = title.f, [tx, tz] = cell(title.a, tf.t);
  const visit = [tx + tf.out[0] * 2, g0 + 1, tz + tf.out[1] * 2], look = [tx, g0 + 2, tz];
  const ddx = tx - cx, ddz = tz - cz;
  const words = [ddz ? `${Math.abs(ddz)} ${ddz < 0 ? 'north' : 'south'}` : '', ddx ? `${Math.abs(ddx)} ${ddx < 0 ? 'west' : 'east'}` : ''].filter(Boolean).join(', ');
  let pointer = null;
  if (Math.abs(ddx) + Math.abs(ddz) > 8) {
    const [mx, , mz] = centre.stand;
    for (let r = 2; r <= 5 && !pointer; r++) for (let dz = -r; dz <= r && !pointer; dz++) for (let dx = -r; dx <= r && !pointer; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      const x = mx + dx, z = mz + dz;
      if (x < 1 || z < 1 || x >= W - 1 || z >= D - 1 || GROUND + elevAt(x, z) !== g0 || !world.has(x, g0, z) || world.has(x, g0 + 1, z) || world.has(x, g0 + 2, z)) continue;
      if (/water/.test(MATERIALS.def(world.get(x, g0, z)).block)) continue;
      world.set(x, g0 + 1, z, signId(SIGN_FACING[centre.facing] ?? SIGN_FACING.south));
      world.setData(x, g0 + 1, z, { id: 'Sign', tags: signTags(`Find a landmark:\nthe board is\n${words}\nor goto_findboard`) });
      pointer = [x, g0 + 1, z];
    }
  }
  return { entries, title: titleSign, rect, ground: g0, K, faces: faces.length, joined: best.joined, visit, look, words, pointer };
}
