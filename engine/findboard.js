// engine/findboard.js — "Find a landmark" in the game (0.81.0): a board by the centre monument,
// a sign for every landmark with a button under it that takes you there.
//
// A wall two thick, standing near the monument on open ground (a square, a park, a pavement;
// never a street's roadway), with signs on both faces: on each, three rows of a sign over a
// button. The sign names the landmark and its function (goto_<name>, for /function <city>/
// goto_<name> from anywhere); the button, on a command block in the wall, runs that very function
// for the player who pressed it (the goto functions find the city's centre marker in the
// monument's alcove, beside the board). The first sign on the front says what the board is.
// Sea lanterns along its top. Command blocks must be on.

import { MAT, MATERIALS, I as INT, B as BYTE, wallSignId } from './materials.js';
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
  const K = Math.ceil((list.length + 1) / (2 * BOARD.ROWS));
  const { W, D, use, mask } = plan;
  const [cx, , cz] = centre.stand;
  const g0 = GROUND + elevAt(cx, cz);
  const OK_BOARD = new Set([USE.PLAZA, USE.PARK, USE.SIDEWALK]);
  const OK_STAND = new Set([USE.PLAZA, USE.PARK, USE.SIDEWALK, USE.ROAD]);
  const cellOk = (x, z, kinds) => x >= 1 && z >= 1 && x < W - 1 && z < D - 1 && (!mask || mask[z * W + x]) && kinds.has(use[z * W + x])
    && GROUND + elevAt(x, z) === g0 && world.has(x, g0, z) && !/water/.test(MATERIALS.def(world.get(x, g0, z)).block)
    && [...Array(8)].every((_, k) => !world.has(x, g0 + 1 + k, z));
  // a place for it: K along, two thick, a row free each side to stand in; nearest the monument
  let best = null;
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
        if (ok) { best = { cell, along, thick }; break; }
      }
    }
  }
  if (!best) return { missing: 'no open ground near the centre monument for the board' };
  const { cell, thick } = best;
  // its two faces: t = 0 faces -thick, t = 1 faces +thick
  const faces = [{ t: 0, out: [-thick[0], -thick[1]] }, { t: 1, out: thick }];
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
  const [ax, az] = cell(0, 0), [bx, bz] = cell(K - 1, 1);
  return { entries, title: titleSign, rect: { x0: Math.min(ax, bx), x1: Math.max(ax, bx), z0: Math.min(az, bz), z1: Math.max(az, bz) }, ground: g0, K };
}
