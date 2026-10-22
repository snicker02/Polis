// engine/arena.js — the Mega Arena: a covered arena beside the city, at the end of a road of
// its own (0.78.0). Like the airport and the theme park (offsite.js), ground of the city's own
// outside its square, on the east if it can (then the other sides the airport and the theme
// park leave). In its own frame: u along the city's edge (the road arrives at u = 0), v out.
//
// - a forecourt before it: paving, lamps, the road up to the doors;
// - the hall: a square 111 across, its outer wall of deepslate tiles 35 high with tall windows
//   and quartz piers, a roof over all of it and a raised crown in the middle, its sides glass
//   (clerestory), lights set in the roof;
// - the way in: doors five wide in the front wall, a tunnel under the stands to the floor;
// - round the floor, a walkway four wide; round that the stands, twenty-five rows of seats
//   rising one a row (stairs facing in, walked up like a staircase), lights at their corners;
//   a concourse behind the top row, under the roof;
// - in the middle, the cage: forty-one across, glass all round from the floor to a glass roof
//   fourteen clear over its sand. In it, every hostile mob that can be held in a glass cage
//   among other mobs, two of each, and a dozen iron golems to take them on. Every fighter comes
//   tagged a fighter, named (a named mob never despawns), with Resistance V for as long as an
//   effect lasts (in Bedrock, no damage at all), saved on the mob; a silent repeating command
//   block under the sand gives it again every two seconds. So the bouts go on and no one dies.
//   The roof over all of it: a zombie or a skeleton never sees the sky.
//
// Who is not in the cage, and why (said in the guide):
// - creeper: it explodes by a player, through the glass, and breaks the cage;
// - ghast, guardian, elder guardian: they fly or swim, and need room or water the cage has not;
// - enderman, shulker: they teleport, out of any cage;
// - evoker (and its vexes, which pass through walls), Wither, Warden (its sonic boom passes
//   through walls), Ender Dragon: no cage holds them, or the crowd is not safe from them;
// - phantom: it flies over the others and fights nobody but players;
// - piglin, piglin brute, hoglin: they turn into other mobs in the Overworld;
// - creaking: it only moves when no one is looking, which in an arena is never.

import { MAT, MATERIALS, I as INT, B as BYTE, stairId, WEIRDO, signId, SIGN_FACING, wallSignId } from './materials.js';
import { edgeRoute, accessRoad, OUT, NAME, lightGround } from './offsite.js';
import { commandBlock } from './airport.js';
import { FIGHTER_TAG } from './landmarks-extra.js';

export const ARENA = { L: 120, D: 126, VC: 68, HALF: 55, CAGE: 21, CAGE_H: 14, WALK: 25, ROWS: 25, ROOF: 35, CROWN: 30, CROWN_H: 3, GOLEMS: 12 };
// the cage's fighters: two of each (and the golems)
export const ARENA_KINDS = ['zombie', 'husk', 'drowned', 'zombie_villager', 'skeleton', 'stray', 'bogged', 'wither_skeleton', 'spider', 'cave_spider',
  'silverfish', 'endermite', 'witch', 'slime', 'magma_cube', 'blaze', 'breeze', 'pillager', 'vindicator', 'ravager', 'zoglin'];
export const ARENA_LEFT_OUT = { creeper: 'it would blow the cage open', ghast: 'it flies, too big for any cage', guardian: 'it needs water', elder_guardian: 'it needs water, and its curse reaches the crowd',
  enderman: 'it teleports out', shulker: 'it teleports out', evoker: 'its vexes pass through walls', vex: 'it passes through walls', wither: 'no cage holds it', warden: 'its sonic boom passes through walls',
  ender_dragon: 'no cage holds it', phantom: 'it fights nobody but players', piglin: 'it turns into a zombified piglin in the Overworld', piglin_brute: 'it turns into a zombified piglin in the Overworld',
  hoglin: 'it turns into a zoglin in the Overworld (a zoglin is in)', creaking: 'it only moves when no one is looking' };
const cap = (s) => s.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

export function buildArena(world, plan, cfg, ctx) {
  const { signTags } = ctx;
  const A = ARENA, U0 = -A.L / 2, U1 = A.L / 2 - 1, VD = A.D, VC = A.VC;
  const sides = ctx.sides || ['east', 'west', 'south', 'north'];
  const route = edgeRoute(plan, world, ctx.GROUND, ctx.elevAt, { sides, avoid: ctx.avoid || [], footprint: [U0, U1, VD] });
  if (!route) return { missing: 'no street leads straight out of the city across open ground for the arena\'s road (and its ground clear of the airport and the theme park)' };
  const acc = accessRoad(world, plan, route, ctx, 'Mega Arena', MAT.C_GRAY);
  const { at, road } = acc, YA = acc.YA, side = route.side;
  const inName = NAME([-OUT[side][0], -OUT[side][1]]);
  const put = (u, v, y, id) => { const [x, z] = at(u, v); world.set(x, y, z, id); };
  const clear = (u, v, y) => { const [x, z] = at(u, v); world.clear(x, y, z); };
  const pos = (u, v, y) => { const [x, z] = at(u, v); return [x, y, z]; };
  const dirOf = (du, dv) => { const [a, b] = at(0, 0), [c, d] = at(du, dv); return NAME([c - a, d - b]); };
  const wallSign = (u, v, y, face, text) => { const [x, z] = at(u, v); world.set(x, y, z, wallSignId(face)); world.setData(x, y, z, { id: 'Sign', tags: signTags(text) }); return [x, y, z]; };
  const sign = (u, v, y, face, text) => { const [x, z] = at(u, v); world.set(x, y, z, signId(SIGN_FACING[face])); world.setData(x, y, z, { id: 'Sign', tags: signTags(text) }); return [x, y, z]; };
  const WALL = MAT.DEEPSLATE_TILES, FILL = MAT.PB_BRICKS, FLOOR = MAT.PB_BRICKS, TRIM = MAT.QUARTZ_PILLAR;
  const ring = (u, v) => Math.max(Math.abs(u), Math.abs(v - VC));
  const R = A.HALF, TOP = YA + A.ROOF;

  // ---- the ground ------------------------------------------------------------------------------
  for (let u = U0; u <= U1; u++) for (let v = 0; v < VD; v++) {
    for (let y = ctx.GROUND - 2; y < YA; y++) put(u, v, y, MAT.BASE);
    put(u, v, YA, MAT.GRASS);
    for (let y = YA + 1; y <= TOP + A.CROWN_H + 6; y++) clear(u, v, y);
  }
  // the forecourt: paved from the road to the doors, lamps along it
  const paved = [];
  for (let v = 0; v < VC - R; v++) for (let u = -24; u <= 24; u++) { put(u, v, YA, Math.abs(u) <= 2 ? MAT.C_GRAY : MAT.SMOOTH); paved.push([u, v]); }
  for (let v = 0; v <= 1; v++) for (let u = -1; u <= 1; u++) road.push(pos(u, v, YA));
  const lamps = [];
  for (const u of [-8, 8]) for (const v of [2, 7]) { for (let y = YA + 1; y <= YA + 3; y++) put(u, v, y, MAT.FENCE); put(u, v, YA + 4, MAT.LAMP); lamps.push(pos(u, v, YA + 4)); }

  // ---- the hall ----------------------------------------------------------------------------------
  const stairs = [], corners = [], cageGlass = [], cageRoof = [], walk = [], concourse = [];
  const S0 = A.WALK + 1, S1 = A.WALK + A.ROWS;                   // the stands' rings
  for (let u = -R; u <= R; u++) for (let v = VC - R; v <= VC + R; v++) {
    const d = ring(u, v), du = u, dv = v - VC;
    put(u, v, YA, FLOOR);
    if (d <= A.CAGE - 1) put(u, v, YA, MAT.SAND);                 // the cage's floor
    if (d === A.CAGE) { for (let y = YA + 1; y <= YA + A.CAGE_H; y++) put(u, v, y, MAT.GLASS); cageGlass.push(pos(u, v, YA + 1)); }
    if (d <= A.CAGE) { put(u, v, YA + A.CAGE_H + 1, MAT.GLASS); cageRoof.push(pos(u, v, YA + A.CAGE_H + 1)); }
    if (d > A.CAGE && d <= A.WALK) walk.push(pos(u, v, YA + 1));
    if (d >= S0 && d <= S1) {
      const k = d - S0, top = YA + 1 + k;
      for (let y = YA + 1; y < top; y++) put(u, v, y, FILL);
      if (Math.abs(du) === Math.abs(dv)) { put(u, v, top, MAT.SEA_LANTERN); corners.push(pos(u, v, top)); }
      else {
        // a seat facing in: the way in is toward the cage, along the side's own axis
        const inward = Math.abs(du) > Math.abs(dv) ? dirOf(-Math.sign(du), 0) : dirOf(0, -Math.sign(dv));
        put(u, v, top, stairId('pbbrick', WEIRDO[inward])); stairs.push(pos(u, v, top));
      }
    }
    if (d > S1 && d < R) {                                         // the concourse behind the top row
      for (let y = YA + 1; y < YA + 1 + A.ROWS; y++) put(u, v, y, FILL);
      put(u, v, YA + A.ROWS, FLOOR); concourse.push(pos(u, v, YA + A.ROWS + 1));
    }
    if (d === R) {                                                 // the outer wall
      for (let y = YA + 1; y < TOP; y++) put(u, v, y, WALL);
      const along = Math.abs(du) === R ? dv : du;
      if (Math.abs(du) !== Math.abs(dv) && ((along % 8) + 8) % 8 === 0) for (let y = YA + 1; y < TOP; y++) put(u, v, y, TRIM);
      else if (Math.abs(du) !== Math.abs(dv) && ((along % 4) + 4) % 4 === 2) for (let y = YA + A.ROWS + 3; y <= YA + A.ROWS + 7; y++) put(u, v, y, MAT.GLASS);
      if (Math.abs(du) === Math.abs(dv)) for (let y = YA + 1; y < TOP; y++) put(u, v, y, TRIM);
      for (const y of [YA + 12, TOP - 1]) if (Math.abs(du) !== Math.abs(dv) && ((along % 8) + 8) % 8) put(u, v, y, MAT.SMOOTH_QUARTZ);
    }
    // the roof, the crown in the middle (its sides glass, quartz at every fourth)
    put(u, v, TOP, WALL);
    if (d === A.CROWN) for (let y = TOP + 1; y <= TOP + A.CROWN_H; y++) put(u, v, y, (((Math.abs(du) === A.CROWN ? dv : du) % 4) + 4) % 4 === 0 || Math.abs(du) === Math.abs(dv) ? TRIM : MAT.GLASS);
    if (d <= A.CROWN) { put(u, v, TOP + A.CROWN_H + 1, WALL); if (d < A.CROWN) clear(u, v, TOP); }
  }
  // the roof lit, inside and out: sea lanterns set in it every eight (and in the crown's)
  const roofLights = [];
  for (let u = -R + 4; u <= R - 4; u += 8) for (let v = VC - R + 4; v <= VC + R - 4; v += 8) {
    const d = ring(u, v);
    if (d < A.CROWN) { put(u, v, TOP + A.CROWN_H + 1, MAT.SEA_LANTERN); roofLights.push(pos(u, v, TOP + A.CROWN_H + 1)); }
    else if (d !== A.CROWN) { put(u, v, TOP, MAT.SEA_LANTERN); roofLights.push(pos(u, v, TOP)); }
  }
  // lights set flush in the floors: the cage's sand, the walkway, the concourse (every six)
  const floorLights = [];
  for (let u = -R; u <= R; u++) for (let v = VC - R; v <= VC + R; v++) {
    const d = ring(u, v), du = u, dv = v - VC;
    if (((du % 6) + 6) % 6 || ((dv % 6) + 6) % 6) continue;
    if (d <= A.CAGE - 2 && (du || dv)) { put(u, v, YA, MAT.SEA_LANTERN); floorLights.push(pos(u, v, YA)); }
  }
  for (let u = -R; u <= R; u++) for (let v = VC - R; v <= VC + R; v++) {
    const d = ring(u, v), du = u, dv = v - VC;
    if ((Math.abs(du) + Math.abs(dv)) % 6) continue;
    if (d > A.CAGE && d <= A.WALK) { put(u, v, YA, MAT.SEA_LANTERN); floorLights.push(pos(u, v, YA)); }
    if (d > S1 && d < R) { put(u, v, YA + A.ROWS, MAT.SEA_LANTERN); floorLights.push(pos(u, v, YA + A.ROWS)); }
  }

  // ---- the way in: doors in the front wall, a tunnel under the stands to the walkway -------------
  const tunnel = [];
  const vWall = VC - R, vIn = VC - S0;                             // the wall's row; the first row of seats
  for (let v = vWall; v <= vIn; v++) for (let u = -2; u <= 2; u++) {
    put(u, v, YA, FLOOR);
    for (let y = YA + 1; y <= YA + 4; y++) clear(u, v, y);
    const d = ring(u, v);
    if (d > S0 + 4 || v === vWall) put(u, v, YA + 5, FILL);          // its ceiling (where the stands are over it)
    tunnel.push(pos(u, v, YA + 1));
  }
  for (let v = vWall + 2; v <= vIn - 6; v += 4) { put(0, v, YA + 5, MAT.SEA_LANTERN); floorLights.push(pos(0, v, YA + 5)); }
  // the seats either side of the tunnel's open end stepped down to it (none left hanging)
  for (let v = vIn - 4; v <= vIn; v++) for (const u of [-2, -1, 0, 1, 2]) for (let y = YA + 5; y <= YA + 6; y++) if (ring(u, v) <= S0 + 4) clear(u, v, y);
  // over the doors: the name, lamps either side
  const nameSign = wallSign(0, vWall - 1, YA + 6, inName, 'The Mega Arena\nEvery mob\nfights forever');
  for (const u of [-3, 3]) { put(u, vWall, YA + 5, MAT.SEA_LANTERN); lamps.push(pos(u, vWall, YA + 5)); }
  for (let v = 0; v < vWall; v++) for (let u = -2; u <= 2; u++) put(u, v, YA, MAT.C_GRAY);

  // ---- the fighters ------------------------------------------------------------------------------
  const fighters = [];
  const spots = [];
  for (let du = -16; du <= 16; du += 4) for (let dv = -16; dv <= 16; dv += 4) spots.push([du, dv]);
  spots.sort((p, q) => (Math.abs(p[0]) + Math.abs(p[1])) - (Math.abs(q[0]) + Math.abs(q[1])) || p[0] - q[0] || p[1] - q[1]);
  let s = 0;
  const free = (k) => { const [du, dv] = spots[k % spots.length]; return [du + (k >= spots.length ? 2 : 0), dv]; };
  for (let g = 0; g < A.GOLEMS; g++) { const [du, dv] = free(s++); const [x, y, z] = pos(du, VC + dv, YA + 1); fighters.push({ type: 'golem', x, y, z, name: 'Champion' }); }
  for (const kind of ARENA_KINDS) for (let n = 0; n < 2; n++) { const [du, dv] = free(s++); const [x, y, z] = pos(du, VC + dv, YA + 1); fighters.push({ type: 'mob', kind, x, y, z, name: cap(kind) }); }
  // the backstop: a repeating command block under the middle of the sand, silent
  const REPEAT = MATERIALS.add(null, 'minecraft:repeating_command_block', '#6b4fa0', { conditional_bit: BYTE(0), facing_direction: INT(1) });
  const command = pos(0, VC, YA);
  world.set(...command, REPEAT);
  world.setData(...command, commandBlock(`effect @e[tag=${FIGHTER_TAG}] resistance 6 4 true`, { mode: 'repeat', delay: 40 }));
  // the announcer, on the walkway where the tunnel comes out
  const announcer = sign(4, vIn + 1, YA + 1, dirOf(0, -1), 'Tonight: every mob\nv twelve golems\nNo one gets hurt');

  // ---- outside: a fence round the ground, its grass and forecourt lit ------------------------------
  const fence = [];
  for (let u = U0; u <= U1; u++) for (let v = 0; v < VD; v++) {
    const edge = u === U0 || u === U1 || v === 0 || v === VD - 1;
    if (!edge || (v === 0 && Math.abs(u) <= 2) || ring(u, v) <= R) continue;
    put(u, v, YA + 1, MAT.FENCE); fence.push(pos(u, v, YA + 1));
  }
  const lit = [...lamps, ...roofLights, ...floorLights, ...corners];
  const cells = [];
  for (let v = 1; v < VD - 1; v++) for (let u = U0 + 1; u < U1; u++) if (ring(u, v) > R) cells.push([u, v]);
  const more = lightGround(world, { at }, YA, cells, (u, v, x, z) => {
    const id = world.get(x, YA, z);
    if (id === MAT.GRASS) return 'soft';
    if ((id === MAT.SMOOTH || id === MAT.C_GRAY) && !world.has(x, YA + 1, z)) return 'hard';
    return null;
  }, lit, MAT.FENCE, MAT.SEA_LANTERN);

  const a0 = at(U0, 0), a1 = at(U1, VD - 1);
  const rect = { x0: Math.min(a0[0], a1[0]), x1: Math.max(a0[0], a1[0]), z0: Math.min(a0[1], a1[1]), z1: Math.max(a0[1], a1[1]) };
  const rx = road.map((p) => p[0]), rz = road.map((p) => p[2]);
  const roadRect = { x0: Math.min(...rx), x1: Math.max(...rx), z0: Math.min(...rz), z1: Math.max(...rz) };
  const [vx, vz] = at(0, 3), [lx, lz] = at(0, vWall);
  return {
    kind: 'arena', lot: rect, roadRect, side, street: acc.street, gate: acc.gate, streetSign: acc.streetSign, ground: YA, rec: null,
    road, cageFighters: fighters, command, announcer, nameSign, tunnel, walk, stairs, corners, concourse, cageGlass, cageRoof, fence,
    lamps: [...lit, ...more], visit: [vx, YA + 1, vz], visitLook: [lx, YA + 3, lz],
    centre: pos(0, VC, YA + 1), top: TOP,
    frame: { at, pos, U0, U1, VD, VC, YA, R },
  };
}
