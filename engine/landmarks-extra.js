// engine/landmarks-extra.js — five more landmarks.
//
// They follow the same shape as the rest: given a lot, which way it faces,
// and the city's style palette, they build and hand back a record. The main
// landmarks file registers them.
//
//   townsquare  a paved square: fountain, benches, market stalls, lamps
//   stadium     a pitch in a bowl of terraced seating, with floodlights
//   cemetery    walled ground, headstones in rows, a path and a lych gate
//   allotments  fenced plots with crops, water channels, sheds and compost
//   bandstand   a small raised stage with a roof, for a park or a small lot

import { MAT, FLOWERS, stairId, WEIRDO, DIR, cropId, CROP_KINDS, signId, SIGN_FACING, WOOLS } from './materials.js';
import { styleOf } from './styles.js';
import { OUTWARD } from './building.js';
import { commandBlock } from './airport.js';
import { MATERIALS, I as INT, B as BYTE } from './materials.js';
import { buildTune } from './music.js';
import { signTags } from './landmarks.js';

const right = (face) => { const [fx, fz] = OUTWARD[face]; return [fz, -fx]; };

function pave(world, lot, G, pick) {
  for (let z = lot.z0; z <= lot.z1; z++)
    for (let x = lot.x0; x <= lot.x1; x++) {
      world.set(x, G, z, pick(x, z));
      for (let y = G + 1; y <= G + 6; y++) world.clear(x, y, z);
    }
}

// ---- town square ---------------------------------------------------------
// A place to stand about in: a fountain in the middle, benches facing it,
// stalls down one side, lamps at the corners and flowers in the beds.
export function townSquare(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, (x, z) => ((x + z) & 1 ? LP.market[0] : LP.market[1]));
  const I = { x0: lot.x0 + 1, z0: lot.z0 + 1, x1: lot.x1 - 1, z1: lot.z1 - 1 };
  const mx = Math.floor((I.x0 + I.x1) / 2), mz = Math.floor((I.z0 + I.z1) / 2);

  // the fountain: a raised basin of water with a spout in the middle
  const fountain = [mx, G, mz];
  for (let dz = -2; dz <= 2; dz++)
    for (let dx = -2; dx <= 2; dx++) {
      const x = mx + dx, z = mz + dz, d = Math.abs(dx) + Math.abs(dz);
      if (d > 3) continue;
      if (d <= 1) {
        world.set(x, G, z, LP.wellRim);
        world.set(x, G + 1, z, MAT.WATER);
      } else {
        world.set(x, G + 1, z, LP.wellRim);
      }
    }
  // a spout of open water up here would run off the pillar, so it is a
  // lantern on a plinth instead
  world.set(mx, G + 2, mz, LP.wellRim);
  world.set(mx, G + 3, mz, MAT.LAMP);

  // benches facing the fountain, on all four sides
  const benches = [];
  for (const [dx, dz, dir] of [[0, -4, WEIRDO.south], [0, 4, WEIRDO.north], [-4, 0, WEIRDO.east], [4, 0, WEIRDO.west]]) {
    for (let k = -1; k <= 1; k++) {
      const x = mx + dx + (dz ? k : 0), z = mz + dz + (dx ? k : 0);
      if (x <= I.x0 || x >= I.x1 || z <= I.z0 || z >= I.z1) continue;
      if (world.has(x, G + 1, z)) continue;
      world.set(x, G + 1, z, stairId(LP.hallStair, dir));
      benches.push([x, G + 1, z]);
    }
  }

  // stalls along the edge away from the street, with cloth roofs
  const [Fx, Fz] = OUTWARD[face], [Rx, Rz] = right(face);
  const stalls = [];
  const backX = Math.round((I.x0 + I.x1) / 2 - Fx * (Math.min(I.x1 - I.x0, I.z1 - I.z0) / 2 - 1));
  const backZ = Math.round((I.z0 + I.z1) / 2 - Fz * (Math.min(I.x1 - I.x0, I.z1 - I.z0) / 2 - 1));
  for (let k = -3; k <= 3; k += 3) {
    const sx = backX + Rx * k, sz = backZ + Rz * k;
    if (sx <= I.x0 || sx >= I.x1 || sz <= I.z0 || sz >= I.z1) continue;
    const cloth = WOOLS[rng.int(0, WOOLS.length - 1)];
    for (const [ox, oz] of [[0, 0], [Rx, Rz]]) {
      const x = sx + ox, z = sz + oz;
      world.set(x, G + 1, z, MAT.FENCE);
      world.set(x, G + 2, z, MAT.FENCE);
      world.set(x, G + 3, z, cloth);
      world.set(x - Fx, G + 3, z - Fz, cloth);
    }
    world.set(sx - Fx, G + 1, sz - Fz, MAT.DESK);         // the counter
    stalls.push([sx, G + 1, sz]);
  }

  // lamps at the corners, flowers in the beds between them
  const lamps = [];
  for (const [cx, cz] of [[I.x0, I.z0], [I.x1, I.z0], [I.x0, I.z1], [I.x1, I.z1]]) {
    world.set(cx, G + 1, cz, MAT.FENCE);
    world.set(cx, G + 2, cz, MAT.FENCE);
    world.set(cx, G + 3, cz, MAT.LAMP);
    lamps.push([cx, G + 3, cz]);
  }
  for (let z = I.z0; z <= I.z1; z++)
    for (let x = I.x0; x <= I.x1; x++) {
      if (world.has(x, G + 1, z)) continue;
      if (Math.abs(x - mx) + Math.abs(z - mz) < 5) continue;
      if (rng.chance(0.06)) { world.set(x, G, z, MAT.GRASS); world.set(x, G + 1, z, rng.pick(FLOWERS)); }
    }
  return { kind: 'townsquare', lot, fountain, benches, stalls, lamps, rec: null, topY: G + 4 };
}

// ---- stadium -------------------------------------------------------------
// A pitch in a bowl: three rows of terraced seating round a grass field, with
// floodlights at the corners and a gap for the players to come out, and a step up
// into the stands at the middle of each side.
//
// With exhibition bouts (cfg.bouts): the fighters loose on the pitch, two iron
// golems against a vindicator and a husk, fighting on and never dying. The stands
// stand two higher, so the pitch is walled four high all round (nothing jumps it or
// is thrown over it), and nothing leads off the pitch: no steps, and the tunnel
// becomes a stair from the street up into the stands instead. Every fighter comes
// with Resistance V (in Bedrock, no damage at all) for as long as an effect can last
// (export.js: saved on the mob itself; no command block, so nothing in the chat).
// An announcer's sign at the foot of the stair.
//
// The pitch is a glass cage as well (0.73.0): an iron golem's swing flings its foe
// high, and a challenger thrown over the four-high wall got away into the stands.
// Glass up the pitch's own edge from the grass to a glass roof eight clear over
// it, so nothing thrown, jumped or climbed leaves it, and the fans still see in.
// Four bouts, one to each quarter of the pitch.
export const BOUTS = [{ challenger: 'vindicator', name: 'Golem v Vindicator' }, { challenger: 'husk', name: 'Golem v Husk' },
  { challenger: 'ravager', name: 'Golem v Ravager' }, { challenger: 'zoglin', name: 'Golem v Zoglin' }];
export const CAGE = 8;                                       // clear inside the glass, from the grass up
export const FIGHTER_TAG = 'polis_fighter';
export function stadium(world, lot, face, cfg, rng, G, signTags = null) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, () => LP.hallFloor);
  const I = { x0: lot.x0 + 1, z0: lot.z0 + 1, x1: lot.x1 - 1, z1: lot.z1 - 1 };
  const rows = 3;
  const P = { x0: I.x0 + rows, z0: I.z0 + rows, x1: I.x1 - rows, z1: I.z1 - rows };
  const bouting = !!(cfg.bouts && signTags && P.x1 - P.x0 >= 6 && P.z1 - P.z0 >= 6);
  const lift = bouting ? 2 : 0;                            // (the stands two higher round an arena)
  // the terracing: each ring one block higher than the last
  for (let r = 0; r < rows; r++) {
    const R = { x0: I.x0 + r, z0: I.z0 + r, x1: I.x1 - r, z1: I.z1 - r };
    for (let z = R.z0; z <= R.z1; z++)
      for (let x = R.x0; x <= R.x1; x++) {
        if (x !== R.x0 && x !== R.x1 && z !== R.z0 && z !== R.z1) continue;
        for (let y = G + 1; y <= G + (rows - r) + lift; y++) world.set(x, y, z, LP.hallWall);
        // seats: a step of stairs facing in
        const dir = x === R.x0 ? WEIRDO.east : x === R.x1 ? WEIRDO.west : z === R.z0 ? WEIRDO.south : WEIRDO.north;
        world.set(x, G + (rows - r) + lift + 1, z, stairId(LP.hallStair, dir));
      }
  }
  // the pitch
  for (let z = P.z0; z <= P.z1; z++)
    for (let x = P.x0; x <= P.x1; x++) {
      world.set(x, G, z, MAT.GRASS);
      for (let y = G + 1; y <= G + 6 + lift; y++) world.clear(x, y, z);
    }
  // the halfway line and the goals
  const mz = Math.floor((P.z0 + P.z1) / 2);
  for (let x = P.x0; x <= P.x1; x++) world.set(x, G, mz, MAT.C_WHITE);
  const goals = [];
  for (const z of [P.z0, P.z1]) {
    const gx = Math.floor((P.x0 + P.x1) / 2);
    for (let dx = -1; dx <= 1; dx++) {
      world.set(gx + dx, G + 1, z, MAT.FENCE);
      world.set(gx + dx, G + 2, z, MAT.FENCE);
    }
    goals.push([gx, G + 2, z]);
  }
  // floodlights at the corners
  const lights = [];
  for (const [cx, cz] of [[I.x0, I.z0], [I.x1, I.z0], [I.x0, I.z1], [I.x1, I.z1]]) {
    for (let y = G + 1; y <= G + 7 + lift; y++) world.set(cx, y, cz, LP.hallColumn);
    world.set(cx, G + 8 + lift, cz, MAT.GLOWSTONE);
    lights.push([cx, G + 8 + lift, cz]);
  }
  const [Fx, Fz] = OUTWARD[face];
  // (the outer ring's cell on the street side, exactly: the line in from it crosses
  // the rings one by one whichever way the lot's width falls)
  const ex = Fx > 0 ? I.x1 : Fx < 0 ? I.x0 : Math.floor((I.x0 + I.x1) / 2);
  const ez = Fz > 0 ? I.z1 : Fz < 0 ? I.z0 : Math.floor((I.z0 + I.z1) / 2);
  const tunnel = [], steps = [];
  let bouts = null;
  if (!bouting) {
    // the way in, through the terracing on the street side
    for (let k = 0; k <= rows; k++) {
      const x = ex - Fx * k, z = ez - Fz * k;
      for (let y = G + 1; y <= G + 3; y++) world.clear(x, y, z);
      world.set(x, G, z, LP.hallFloor);
      tunnel.push([x, G + 1, z]);
    }
    // steps up into the stands from the pitch, at the middle of each side the goals are
    // not on (the first row of seats stands a block and a half over the pitch)
    for (const [x, z, d] of [[P.x0, mz, WEIRDO.west], [P.x1, mz, WEIRDO.east]]) {
      if (world.has(x, G + 1, z)) continue;
      world.set(x, G + 1, z, stairId(LP.hallStair, d)); steps.push([x, G + 1, z]);
    }
  } else {
    // the way in for the fans: a stair from the street up through the outer rows onto
    // the inner row's seats (the inner row stays: the pitch walled all round). Its foot
    // at the lot's edge, a step a block, two clear over every step.
    const up = [], innerSeat = G + 1 + lift + 1;          // the inner ring's seat block
    // from the lot's edge (k = -1) in through the outer rings: each a step higher, the
    // last one a step below the inner ring's seat
    for (let k = -1; k <= rows - 2; k++) {
      const x = ex - Fx * k, z = ez - Fz * k;
      const h = G + 1 + (k + 1);                          // this step's block
      for (let y = G + 1; y < h; y++) world.set(x, y, z, LP.hallWall);
      world.set(x, h, z, stairId(LP.hallStair, WEIRDO[nameOfDir(-Fx, -Fz)]));
      for (let y = h + 1; y <= h + 3; y++) world.clear(x, y, z);
      up.push([x, h, z]);
    }
    // the last steps up, along the inner ring's own row if the stair has not reached it
    let top = up[up.length - 1][1];
    // (the inner ring: wall up to innerSeat - 1, its seat at innerSeat: from the last step
    // the climb is innerSeat - top; more than one needs a step more: the inner ring's
    // cell kept walled, a step set on the outer ring's cell beside the line instead)
    if (innerSeat - top > 1) {
      const [Rx, Rz] = right(face);
      // a second flight along the outer ring (rows - 2), turning to one side
      let cx = ex - Fx * (rows - 2), cz = ez - Fz * (rows - 2), h = top;
      for (let s = 1; h < innerSeat - 1; s++) {
        cx += Rx; cz += Rz; h++;
        for (let y = G + 1; y < h; y++) world.set(cx, y, cz, LP.hallWall);
        world.set(cx, h, cz, stairId(LP.hallStair, WEIRDO[nameOfDir(Rx, Rz)]));
        for (let y = h + 1; y <= h + 3; y++) world.clear(cx, y, cz);
        up.push([cx, h, cz]);
      }
      top = h;
    }
    tunnel.push(...up.map(([x, y, z]) => [x, y + 1, z]));
    // the cage: glass up the pitch's edge (round the goals, whose fences stand in it)
    // and a glass roof over the whole pitch
    for (let z = P.z0; z <= P.z1; z++)
      for (let x = P.x0; x <= P.x1; x++) {
        const edge = x === P.x0 || x === P.x1 || z === P.z0 || z === P.z1;
        if (edge) for (let y = G + 1; y <= G + CAGE; y++) if (!world.has(x, y, z)) world.set(x, y, z, MAT.GLASS);
        world.set(x, G + CAGE + 1, z, MAT.GLASS);
      }
    // the fighters: a golem and its challenger in each quarter of the pitch
    const fighters = [];
    const cxp = Math.floor((P.x0 + P.x1) / 2);
    const halves = [[P.z0 + 1, mz - 1], [mz + 1, P.z1 - 1]];
    const sides = [[P.x0 + 1, cxp - 1], [cxp + 1, P.x1 - 1]];
    BOUTS.forEach((bout, i) => {
      const [z0, z1] = halves[i >> 1], [x0, x1] = sides[i & 1];
      const zm = Math.floor((z0 + z1) / 2);
      fighters.push({ type: 'golem', x: x0, y: G + 1, z: zm, name: 'Champion', bout: i });
      fighters.push({ type: 'mob', kind: bout.challenger, x: x1, y: G + 1, z: x1 === x0 ? Math.min(z1, zm + 1) : zm, name: 'Challenger', bout: i });
    });
    // the announcer, at the stair's foot on the street
    const [fx0, , fz0] = up[0];
    const [Rx, Rz] = right(face);
    let announcer = null;
    for (const s2 of [2, -2, 3, -3]) {
      const x = fx0 + Rx * s2, z = fz0 + Rz * s2;
      if (world.has(x, G + 1, z)) continue;
      world.set(x, G + 1, z, signId(SIGN_FACING[face])); world.setData(x, G + 1, z, { id: 'Sign', tags: signTags('Tonight: Golems v\n' + BOUTS.map((b) => b.challenger[0].toUpperCase() + b.challenger.slice(1)).join(', ') + '\nNo one gets hurt') });
      announcer = [x, G + 1, z];
      break;
    }
    // a backstop for the Resistance saved on each fighter: under the middle of the pitch a
    // repeating command block gives every fighter it again every two seconds, silent (it
    // reports nothing; the pack's build turns the game's command block chat off)
    const REPEAT = MATERIALS.add(null, 'minecraft:repeating_command_block', '#6b4fa0', { conditional_bit: BYTE(0), facing_direction: INT(1) });
    const kx = Math.floor((P.x0 + P.x1) / 2), kz = mz + 1;
    world.set(kx, G, kz, REPEAT);
    world.setData(kx, G, kz, commandBlock(`effect @e[tag=${FIGHTER_TAG}] resistance 6 4 true`, { mode: 'repeat', delay: 40 }));
    bouts = { fighters, stair: up, announcer, wall: G + rows + lift, cage: G + CAGE + 1, command: [kx, G, kz] };
  }
  return { kind: 'stadium', lot, pitch: P, goals, lights, tunnel, steps, rec: null, topY: G + 9 + lift, bouts, fighters: bouts ? bouts.fighters : [] };
}
const nameOfDir = (dx, dz) => (dx > 0 ? 'east' : dx < 0 ? 'west' : dz > 0 ? 'south' : 'north');

// ---- cemetery ------------------------------------------------------------
// Walled ground with rows of headstones, a path up the middle and a gate.
// The names typed in for the cemetery (cfg.memorial, cfg.graveNames): one person a
// line; a ' / ' in a line starts a new line on the stone's sign. Only what was typed.
export function namesOf(text, max = 64) {
  return String(text || '').split(/\r?\n/).map((l) => l.replace(/[\u0000-\u001f\u007f]/g, '').trim()).filter(Boolean).slice(0, max)
    .map((l) => l.slice(0, 90));
}
export const signLines = (entry) => entry.split(/\s*\/\s*/).filter(Boolean).slice(0, 4).join('\n');

export function cemetery(world, lot, face, cfg, rng, G, signTags = null) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, () => MAT.GRASS);
  const I = { x0: lot.x0 + 1, z0: lot.z0 + 1, x1: lot.x1 - 1, z1: lot.z1 - 1 };
  // the wall, with a gap for the gate on the street side
  const [Fx, Fz] = OUTWARD[face];
  const gateX = Math.floor((I.x0 + I.x1) / 2) + Fx * Math.floor((I.x1 - I.x0) / 2);
  const gateZ = Math.floor((I.z0 + I.z1) / 2) + Fz * Math.floor((I.z1 - I.z0) / 2);
  for (let z = I.z0; z <= I.z1; z++)
    for (let x = I.x0; x <= I.x1; x++) {
      if (x !== I.x0 && x !== I.x1 && z !== I.z0 && z !== I.z1) continue;
      if (Math.abs(x - gateX) + Math.abs(z - gateZ) <= 1) continue;      // the gateway
      world.set(x, G + 1, z, LP.hallWall);
      world.set(x, G + 2, z, LP.hallColumn);
    }
  // the lych gate: two posts and a roof over the gap
  const gate = [gateX, G + 1, gateZ];
  const [Rx, Rz] = right(face);
  for (const s of [-2, 2]) {
    const x = gateX + Rx * s, z = gateZ + Rz * s;
    for (let y = G + 1; y <= G + 3; y++) world.set(x, y, z, LP.hallColumn);
  }
  for (let s = -2; s <= 2; s++) world.set(gateX + Rx * s, G + 4, gateZ + Rz * s, LP.hallWall);

  // a path from the gate, and headstones in rows either side
  const path = [];
  const steps = Math.max(Math.abs(I.x1 - I.x0), Math.abs(I.z1 - I.z0)) - 2;
  for (let k = 0; k <= steps; k++) {
    const x = gateX - Fx * k, z = gateZ - Fz * k;
    if (x < I.x0 || x > I.x1 || z < I.z0 || z > I.z1) break;
    world.set(x, G, z, MAT.PATH);
    path.push([x, G, z]);
  }
  const graves = [];
  for (let z = I.z0 + 2; z <= I.z1 - 1; z += 2)
    for (let x = I.x0 + 2; x <= I.x1 - 1; x += 2) {
      if (world.has(x, G + 1, z) || world.get(x, G, z) === MAT.PATH) continue;
      const onPath = path.some(([px, , pz]) => Math.abs(px - x) + Math.abs(pz - z) <= 1);
      if (onPath) continue;
      world.set(x, G + 1, z, rng.chance(0.25) ? LP.hallColumn : LP.hallWall);   // a stone, or a taller marker
      if (rng.chance(0.25)) world.set(x, G + 2, z, LP.hallWall);
      if (rng.chance(0.3)) world.set(x + 1 <= I.x1 ? x + 1 : x - 1, G + 1, z, rng.pick(FLOWERS));
      graves.push([x, G + 1, z]);
    }
  const sign = (x, y, z, text) => { world.set(x, y, z, signId(SIGN_FACING[face])); world.setData(x, y, z, { id: 'Sign', tags: signTags(text) }); };

  // ---- the memorial: the people named for it side by side at the far end of the
  // path, under a cherry tree, a lantern between them, flowers round, a bench to sit
  // and look at them. A cell by how far it is from the far wall (k) and how far to
  // one side of the path (s).
  const people = signTags ? namesOf(cfg.memorial, 3) : [];
  let memorial = null;
  const cell = (k, s2) => Fx ? [(Fx > 0 ? I.x0 : I.x1) + Fx * k, gateZ + Rz * s2] : [gateX + Rx * s2, (Fz > 0 ? I.z0 : I.z1) + Fz * k];
  const inside = (x, z) => x > I.x0 && x < I.x1 && z > I.z0 && z < I.z1;
  if (people.length && [[1, -3], [1, 3], [6, -3], [6, 3]].every(([k, s2]) => inside(...cell(k, s2)))) {
    // the ground cleared (the graves there moved off), grass but for the path's last stretch
    for (let k = 1; k <= 6; k++) for (let s2 = -3; s2 <= 3; s2++) {
      const [x, z] = cell(k, s2);
      for (let y = G + 1; y <= G + 3; y++) world.clear(x, y, z);
      world.set(x, G, z, s2 === 0 && k >= 3 ? MAT.PATH : MAT.GRASS);
      const gi = graves.findIndex((g) => g[0] === x && g[2] === z);
      if (gi >= 0) graves.splice(gi, 1);
    }
    const at = people.length === 1 ? [0] : people.length === 2 ? [-1, 1] : [-2, 0, 2];
    const stones = [], signs = [];
    people.forEach((who, i) => {
      const [x, z] = cell(2, at[i]);
      world.set(x, G + 1, z, MAT.QUARTZ_PILLAR); world.set(x, G + 2, z, MAT.CHISELED_QUARTZ);
      stones.push([x, G + 1, z]);
      const [sx, sz] = cell(3, at[i]);
      const lines = who.includes('/') ? signLines(who) : 'In loving memory\n' + who;
      sign(sx, G + 1, sz, lines); signs.push({ at: [sx, G + 1, sz], text: lines, name: who.split('/')[0].trim() });
    });
    // the cherry tree behind them
    const [tx, tz] = cell(1, 0);
    for (let y = G + 1; y <= G + 4; y++) world.set(tx, y, tz, MAT.CHERRY_LOG);
    for (let y = G + 4; y <= G + 6; y++) for (let a2 = -2; a2 <= 2; a2++) for (let b2 = -2; b2 <= 2; b2++) {
      const r = Math.abs(a2) + Math.abs(b2) + (y === G + 6 ? 1 : 0);
      if (r > 3 || (a2 === 0 && b2 === 0 && y === G + 4)) continue;
      if (!world.has(tx + a2, y, tz + b2)) world.set(tx + a2, y, tz + b2, MAT.CHERRY_LEAF);
    }
    // a lantern between them (or beside one alone), flowers round them
    const lampS = people.length === 2 ? 0 : people.length === 1 ? 2 : null;
    let lantern = null;
    if (lampS !== null) { const [lx, lz] = cell(2, lampS); world.set(lx, G + 1, lz, MAT.LAMP); lantern = [lx, G + 1, lz]; }
    const flowers = [];
    for (const [k, s2, f] of [[2, -3, MAT.TULIP_PINK], [2, 3, MAT.TULIP_PINK], [3, -2, MAT.LILY_VALLEY], [3, 2, MAT.LILY_VALLEY], [1, -2, MAT.LILY_VALLEY], [1, 2, MAT.LILY_VALLEY], [3, -3, MAT.TULIP_PINK], [3, 3, MAT.TULIP_PINK]]) {
      const [x, z] = cell(k, s2);
      if (!world.has(x, G + 1, z)) { world.set(x, G + 1, z, f); flowers.push([x, G + 1, z]); }
    }
    // the bench, either side of the path, looking at them
    const bench = [];
    for (const s2 of [-1, 1]) { const [x, z] = cell(5, s2); world.set(x, G + 1, z, stairId('oak', WEIRDO[face])); bench.push([x, G + 1, z]); }
    const [ax, az] = cell(4, 0), [mx, mz] = cell(2, 0);
    memorial = { people, stones, signs, tree: [tx, G + 1, tz], lantern, flowers, bench, stand: [ax, G + 1, az], look: [mx, G + 2, mz] };
  }

  // ---- names on the other gravestones: a sign before each stone, on its gate side,
  // the graves nearest the gate first
  const named = [];
  const names = signTags ? namesOf(cfg.graveNames) : [];
  if (names.length) {
    const order = graves.slice().sort((p, q) => (Math.abs(p[0] - gateX) + Math.abs(p[2] - gateZ)) - (Math.abs(q[0] - gateX) + Math.abs(q[2] - gateZ)));
    for (const g of order) {
      if (named.length >= names.length) break;
      const x = g[0] + Fx, z = g[2] + Fz;
      if (!inside(x, z) || world.get(x, G, z) === MAT.PATH) continue;
      if (world.has(x, G + 1, z)) { if (FLOWERS.includes(world.get(x, G + 1, z))) world.clear(x, G + 1, z); else continue; }
      if (world.has(x, G + 2, z)) continue;
      const text = signLines(names[named.length]);
      sign(x, G + 1, z, text);
      named.push({ grave: g, at: [x, G + 1, z], text });
    }
  }
  return { kind: 'cemetery', lot, gate, graves, path, rec: null, topY: G + 5, memorial, named };
}

// ---- allotments ----------------------------------------------------------
// Fenced plots of vegetables with water channels between them, a shed or two
// and a compost heap.
export function allotments(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, () => MAT.GRASS);
  const I = { x0: lot.x0 + 1, z0: lot.z0 + 1, x1: lot.x1 - 1, z1: lot.z1 - 1 };
  const plots = [];
  const PLOT = 5;
  for (let z = I.z0; z + PLOT - 1 <= I.z1; z += PLOT + 1)
    for (let x = I.x0; x + PLOT - 1 <= I.x1; x += PLOT + 1) {
      const P = { x0: x, z0: z, x1: x + PLOT - 1, z1: z + PLOT - 1 };
      const crop = CROP_KINDS[rng.int(0, CROP_KINDS.length - 1)];
      // a channel of water down the middle keeps the soil watered
      const wz = P.z0 + Math.floor(PLOT / 2);
      for (let px = P.x0; px <= P.x1; px++)
        for (let pz = P.z0; pz <= P.z1; pz++) {
          if (pz === wz) { world.set(px, G, pz, MAT.WATER); continue; }
          world.set(px, G, pz, MAT.FARMLAND);
          world.set(px, G + 1, pz, cropId(crop, rng.int(4, 7)));
        }
      // a low fence round the plot, open at one corner
      for (let px = P.x0 - 1; px <= P.x1 + 1; px++)
        for (let pz = P.z0 - 1; pz <= P.z1 + 1; pz++) {
          if (px !== P.x0 - 1 && px !== P.x1 + 1 && pz !== P.z0 - 1 && pz !== P.z1 + 1) continue;
          if (px < I.x0 || px > I.x1 || pz < I.z0 || pz > I.z1) continue;
          if (px === P.x0 && pz === P.z0 - 1) continue;                 // the way in
          if (!world.has(px, G + 1, pz)) world.set(px, G + 1, pz, MAT.FENCE);
        }
      plots.push(P);
    }
  // a shed and a compost heap on the spare ground
  const sheds = [];
  const sx = I.x1 - 2, sz = I.z1 - 2;
  if (sx > I.x0 && sz > I.z0) {
    for (let dz = 0; dz <= 1; dz++)
      for (let dx = 0; dx <= 1; dx++) {
        for (let y = G + 1; y <= G + 2; y++) world.set(sx + dx, y, sz + dz, LP.hallWall);
        world.set(sx + dx, G + 3, sz + dz, stairId(LP.hallStair, dx ? WEIRDO.west : WEIRDO.east));
      }
    world.clear(sx, G + 1, sz);                                          // a doorway
    sheds.push([sx, G + 1, sz]);
  }
  const heap = [I.x0 + 1, G + 1, I.z1 - 1];
  if (!world.has(heap[0], heap[1], heap[2])) world.set(heap[0], heap[1], heap[2], MAT.COMPOSTER);
  return { kind: 'allotments', lot, plots, sheds, heap, rec: null, topY: G + 4 };
}

// ---- bandstand -----------------------------------------------------------
// A small raised stage with a roof on posts, in the middle of its lot; a square roof
// over the whole lot carries the tune (music.js): press the button on the stand in the
// middle of the stage and a melody and its bass play from the roof.
export function bandstand(world, lot, face, cfg, rng, G) {
  const LP = styleOf(cfg.cityStyle).landmark;
  pave(world, lot, G, (x, z) => ((x + z) & 1 ? MAT.GRASS : MAT.PATH));
  const mx = Math.floor((lot.x0 + lot.x1) / 2), mz = Math.floor((lot.z0 + lot.z1) / 2);
  const R = 3;
  for (let dz = -R; dz <= R; dz++)
    for (let dx = -R; dx <= R; dx++) {
      if (Math.abs(dx) + Math.abs(dz) > R + 1) continue;
      world.set(mx + dx, G + 1, mz + dz, LP.hallFloor);
    }
  const posts = [];
  for (const [dx, dz] of [[-R, 0], [R, 0], [0, -R], [0, R], [-2, -2], [2, -2], [-2, 2], [2, 2]]) {
    for (let y = G + 2; y <= G + 4; y++) world.set(mx + dx, y, mz + dz, LP.hallColumn);
    posts.push([mx + dx, G + 4, mz + dz]);
  }
  // the roof: square, nine by nine (the tune's lines need the room); solid, for the
  // repeaters to stand on (a style whose hall walls are glass gets quartz)
  const glassy = MATERIALS.def(LP.hallWall).transparent;
  const roof = glassy ? MAT.SMOOTH_QUARTZ : LP.hallWall;
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) world.set(mx + dx, G + 5, mz + dz, roof);
  // steps up on the street side
  const [Fx, Fz] = OUTWARD[face];
  const step = [mx + Fx * (R + 1), G + 1, mz + Fz * (R + 1)];
  world.set(step[0], step[1], step[2], stairId(LP.hallStair, Fx === 1 ? WEIRDO.west : Fx === -1 ? WEIRDO.east : Fz === 1 ? WEIRDO.north : WEIRDO.south));
  // the tune, from the city's seed and where the bandstand stands
  const seed = ((cfg.seed | 0) * 2654435761 ^ (mx * 73856093) ^ (mz * 19349663) ^ 0x7a9e) >>> 0;
  const music = buildTune(world, mx, mz, G, [Fx, Fz], { stand: MAT.SMOOTH_QUARTZ, roof, rest: MAT.SMOOTH_QUARTZ }, seed);
  // a sign beside the step
  const [rx, rz] = right(face);
  const signAt = [step[0] + rx, G + 1, step[2] + rz];
  world.set(signAt[0], signAt[1], signAt[2], signId(SIGN_FACING[face]));
  world.setData(signAt[0], signAt[1], signAt[2], { id: 'Sign', tags: signTags(`Bandstand\npress the button\non the stand: a tune\nin ${music.key} on the ${music.instrument}`) });
  return { kind: 'bandstand', lot, posts, step, music, sign: signAt, rec: null, topY: G + 8 };
}
