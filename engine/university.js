// engine/university.js — the University: a campus beside the city, at the end of a road of its
// own (0.78.0). Like the airport, the theme park and the arena (offsite.js), ground of the
// city's own outside its square, on the west if it can (then the other sides the others leave).
// In its own frame: u along the city's edge (the road arrives at u = 0), v out from the city.
//
// - the gate: two quartz towers and a lintel with the university's name, a plaza inside;
// - the avenue up the middle to the clock tower, across a quad of grass with trees, two
//   fountains and paths to every school's door;
// - eight schools round the quad, four each side, each a hall of its own with its name over
//   its door, furnished for what it teaches:
//     Science (brewing stands, cauldrons, lab benches), Medicine (a ward of beds, a pharmacy,
//     a skeleton), Engineering (anvils, smithing tables, grindstones, blast furnaces, a lit
//     redstone lamp), Agriculture (a greenhouse under glass: crops in watered rows, composters,
//     hay), Law (a courtroom: the judge's bench, the lecterns, the public's benches, books),
//     Arts (looms, easels with canvases, cartography tables), Music (note blocks, a jukebox,
//     bells, a stage), Astronomy (under a glass roof: a telescope, star charts);
// - at the head of the quad the clock tower: forty high, a clock face on each side, a ladder up
//   inside to the belfry and its bell, open arches round it;
// - either side of it the Great Library (bookshelves in stacks, reading desks, an enchanting
//   table among its shelves) and the Great Hall (a lecture theatre: rows of seats rising from
//   a stage with a lectern);
// - behind it all, the sports field: a running track round a pitch with goals;
// - paths round it all, every hall lit inside (lanterns hung under its ceiling), the open
//   ground lit, the roofs lit.

import { MAT, MATERIALS, stairId, WEIRDO, wallSignId, signId, SIGN_FACING, lecternId, loomId, grindstoneId, furnaceId, cropId, bedId, BED_VEC, chestId } from './materials.js';
import { edgeRoute, accessRoad, OUT, NAME, lightGround } from './offsite.js';

export const UNIVERSITY = { L: 150, D: 178 };
export const SCHOOLS = ['Science', 'Medicine', 'Engineering', 'Agriculture', 'Law', 'Arts', 'Music', 'Astronomy'];

export function buildUniversity(world, plan, cfg, ctx) {
  const { signTags } = ctx;
  const U = UNIVERSITY, U0 = -U.L / 2, U1 = U.L / 2 - 1, VD = U.D;
  const sides = ctx.sides || ['west', 'east', 'north', 'south'];
  const route = edgeRoute(plan, world, ctx.GROUND, ctx.elevAt, { sides, avoid: ctx.avoid || [], footprint: [U0, U1, VD] });
  if (!route) return { missing: 'no street leads straight out of the city across open ground for the university\'s road (and its ground clear of the airport, the theme park and the arena)' };
  const acc = accessRoad(world, plan, route, ctx, 'University', MAT.C_GRAY);
  const { at, road } = acc, YA = acc.YA, side = route.side;
  const put = (u, v, y, id) => { const [x, z] = at(u, v); world.set(x, y, z, id); };
  const get = (u, v, y) => { const [x, z] = at(u, v); return world.get(x, y, z); };
  const has = (u, v, y) => { const [x, z] = at(u, v); return world.has(x, y, z); };
  const clear = (u, v, y) => { const [x, z] = at(u, v); world.clear(x, y, z); };
  const pos = (u, v, y) => { const [x, z] = at(u, v); return [x, y, z]; };
  const dirOf = (du, dv) => { const [a, b] = at(0, 0), [c, d] = at(du, dv); return NAME([c - a, d - b]); };
  const mat = (block, color, states = {}, flags = {}) => MATERIALS.add(null, 'minecraft:' + block, color, states, flags);
  const wallSign = (u, v, y, face, text) => { const [x, z] = at(u, v); world.set(x, y, z, wallSignId(face)); world.setData(x, y, z, { id: 'Sign', tags: signTags(text) }); return [x, y, z]; };
  const sign = (u, v, y, face, text) => { const [x, z] = at(u, v); world.set(x, y, z, signId(SIGN_FACING[face])); world.setData(x, y, z, { id: 'Sign', tags: signTags(text) }); return [x, y, z]; };
  const PATH = MAT.WHITE_PATH || MAT.SMOOTH;
  const paved = [];
  const pave = (u, v, id = PATH) => { put(u, v, YA, id); paved.push([u, v]); };
  const lit = [];

  // ---- the ground --------------------------------------------------------------------------------
  for (let u = U0; u <= U1; u++) for (let v = 0; v < VD; v++) {
    for (let y = ctx.GROUND - 2; y < YA; y++) put(u, v, y, MAT.BASE);
    put(u, v, YA, MAT.GRASS);
    for (let y = YA + 1; y <= YA + 50; y++) clear(u, v, y);
  }
  for (let v = 0; v <= 1; v++) for (let u = -1; u <= 1; u++) road.push(pos(u, v, YA));

  // ---- the paths ---------------------------------------------------------------------------------
  for (let v = 0; v <= 8; v++) for (let u = -20; u <= 20; u++) pave(u, v);                  // the plaza inside the gate
  for (let v = 9; v <= 117; v++) for (let u = -2; u <= 2; u++) pave(u, v);                 // the avenue
  const DOORS = [25, 45, 65, 85];
  for (const dv of DOORS) for (let v = dv - 1; v <= dv + 1; v++) for (let u = -37; u <= 37; u++) if (Math.abs(u) > 2) pave(u, v);   // to the schools
  for (let v = 103; v <= 105; v++) for (let u = -72; u <= 72; u++) if (Math.abs(u) > 2) pave(u, v);   // the terrace before the library and the hall
  for (let v = 6; v <= 145; v++) for (const s of [-1, 1]) for (let k = 70; k <= 72; k++) pave(s * k, v);   // round the sides
  for (let v = 4; v <= 8; v++) for (let u = 21; u <= 72; u++) { pave(u, v); pave(-u, v); }
  for (let v = 143; v <= 145; v++) for (let u = -72; u <= 72; u++) pave(u, v);           // along the back

  // ---- the gate ----------------------------------------------------------------------------------
  const inName = NAME([-OUT[side][0], -OUT[side][1]]);
  for (const u of [-5, 5]) for (let du = -1; du <= 1; du++) for (let dv = 1; dv <= 3; dv++) {
    for (let y = YA + 1; y <= YA + 9; y++) put(u + du, dv, y, du === 0 && dv === 2 ? MAT.QUARTZ_PILLAR : MAT.QUARTZ_BRICKS || MAT.SMOOTH_QUARTZ);
    put(u + du, dv, YA + 10, MAT.CHISELED_QUARTZ);
  }
  for (let u = -4; u <= 4; u++) for (let dv = 1; dv <= 3; dv++) { put(u, dv, YA + 7, MAT.SMOOTH_QUARTZ); put(u, dv, YA + 8, MAT.SMOOTH_QUARTZ); }
  const gateSign = wallSign(0, 0, YA + 7, inName, 'The University\nEight schools\nLibrary  Great Hall');
  for (const u of [-5, 5]) { put(u, 2, YA + 11, MAT.LAMP); lit.push(pos(u, 2, YA + 11)); }

  // ---- a hall: walls with windows, a flat roof (lit) or glass, a door, lanterns under the ceiling --
  // b: its box (u0..u1, v0..v1); door: which side faces the path ('u0' | 'u1' | 'v0' | 'v1') and
  // where along it; H: clear inside (the ceiling at YA + H + 1)
  const halls = [];
  const hall = (name, b, door, H, look) => {
    const { wall, trim, floor, glassRoof } = look;
    for (let u = b.u0; u <= b.u1; u++) for (let v = b.v0; v <= b.v1; v++) {
      put(u, v, YA, floor);
      const edgeU = u === b.u0 || u === b.u1, edgeV = v === b.v0 || v === b.v1;
      const corner = edgeU && edgeV;
      if (edgeU || edgeV) {
        const along = edgeU ? v - b.v0 : u - b.u0;
        for (let y = YA + 1; y <= YA + H; y++) put(u, v, y, corner ? trim : wall);
        if (!corner && along % 3 === 1 && H >= 4) for (let y = YA + 2; y <= YA + H - 1; y++) put(u, v, y, MAT.GLASS);
        put(u, v, YA + H + 1, trim);
        put(u, v, YA + H + 2, corner ? MAT.CHISELED_QUARTZ : wall);           // the parapet
      } else put(u, v, YA + H + 1, glassRoof ? MAT.GLASS : wall);
    }
    // the roof lit (a flat one: sea lanterns set in it every six)
    if (!glassRoof) for (let u = b.u0 + 3; u <= b.u1 - 2; u += 6) for (let v = b.v0 + 3; v <= b.v1 - 2; v += 6) { put(u, v, YA + H + 1, MAT.SEA_LANTERN); lit.push(pos(u, v, YA + H + 1)); }
    // the door, three wide, three high; the name over it outside, lights either side
    const out = { u0: [-1, 0], u1: [1, 0], v0: [0, -1], v1: [0, 1] }[door.side];
    const du = out[0] ? 0 : 1, dv = out[0] ? 1 : 0;
    const [cu, cv] = door.side === 'u0' ? [b.u0, door.at] : door.side === 'u1' ? [b.u1, door.at] : door.side === 'v0' ? [door.at, b.v0] : [door.at, b.v1];
    const doorCells = [];
    for (let k = -1; k <= 1; k++) { for (let y = YA + 1; y <= YA + 3; y++) clear(cu + du * k, cv + dv * k, y); doorCells.push(pos(cu + du * k, cv + dv * k, YA + 1)); put(cu + du * k, cv + dv * k, YA, floor); }
    for (const k of [-2, 2]) { put(cu + du * k, cv + dv * k, YA + 3, MAT.SEA_LANTERN); lit.push(pos(cu + du * k, cv + dv * k, YA + 3)); }
    const faceOut = dirOf(out[0], out[1]);
    const nameSign = wallSign(cu + out[0], cv + out[1], YA + 5, faceOut, name.replace(/^(School of) /, '$1\n'));
    // inside: lanterns hung under the ceiling every four
    const inner = { u0: b.u0 + 1, u1: b.u1 - 1, v0: b.v0 + 1, v1: b.v1 - 1 };
    const hung = [];
    for (let u = inner.u0 + 1; u <= inner.u1 - 1; u += 4) for (let v = inner.v0 + 1; v <= inner.v1 - 1; v += 4) {
      if (has(u, v, YA + H)) continue;
      put(u, v, YA + H, MAT.LAMP_HANG); hung.push(pos(u, v, YA + H)); lit.push(pos(u, v, YA + H));
    }
    const H_ = { name, box: b, inner, door: { side: door.side, cells: doorCells, out, at: [cu, cv] }, H, nameSign, hung, ceiling: YA + H + 1,
      inward: dirOf(-out[0], -out[1]), visit: pos(Math.floor((inner.u0 + inner.u1) / 2), Math.floor((inner.v0 + inner.v1) / 2), YA + 1), items: [] };
    halls.push(H_);
    return H_;
  };
  // things along a hall's walls, one cell in, round from the door (none within three of it), in
  // turn from a list; each a material, or a function of the way into the room from that wall
  const alongWalls = (Hl, list, every = 1) => {
    const { inner, door } = Hl;
    const cells = [];
    for (let u = inner.u0; u <= inner.u1; u++) cells.push([u, inner.v0, [0, 1]], [u, inner.v1, [0, -1]]);
    for (let v = inner.v0 + 1; v < inner.v1; v++) cells.push([inner.u0, v, [1, 0]], [inner.u1, v, [-1, 0]]);
    let n = 0;
    for (const [u, v, inn] of cells) {
      const [du, dv] = [u - door.at[0], v - door.at[1]];
      if (Math.abs(du) + Math.abs(dv) <= 4) continue;
      const corner = (u === inner.u0 || u === inner.u1) && (v === inner.v0 || v === inner.v1);
      if (corner || has(u, v, YA + 1)) continue;
      if (n++ % every) continue;
      const it = list[(n - 1) % list.length];
      const id = typeof it === 'function' ? it(dirOf(inn[0], inn[1])) : it;
      if (id == null) continue;
      put(u, v, YA + 1, id); Hl.items.push(pos(u, v, YA + 1));
    }
  };
  // rows across the middle, leaving the walk round the walls and aisles: every third row across
  // the hall from the door, broken every fifth cell
  const rows = (Hl, list, skipEdge = 2) => {
    const { inner, door } = Hl;
    const alongU = door.side === 'u0' || door.side === 'u1';      // the rows run along v when the door is on a u side
    let n = 0;
    for (let u = inner.u0 + skipEdge; u <= inner.u1 - skipEdge; u++) for (let v = inner.v0 + skipEdge; v <= inner.v1 - skipEdge; v++) {
      const a = alongU ? u - inner.u0 : v - inner.v0, c = alongU ? v - inner.v0 : u - inner.u0;
      if (a % 3 !== 0 || c % 5 === 2) continue;
      if (Math.abs(u - door.at[0]) + Math.abs(v - door.at[1]) <= 5 || has(u, v, YA + 1)) continue;
      const it = list[n++ % list.length];
      const id = typeof it === 'function' ? it(Hl.inward) : it;
      put(u, v, YA + 1, id); Hl.items.push(pos(u, v, YA + 1));
    }
  };

  // ---- the eight schools round the quad -----------------------------------------------------------
  const STONE = { wall: MAT.STONEBRICK, trim: MAT.QUARTZ_PILLAR, floor: MAT.POL_DIORITE || MAT.SMOOTH_QUARTZ };
  const BRICK = { wall: MAT.BRICK, trim: MAT.QUARTZ_PILLAR, floor: MAT.OAK };
  const schools = [];
  SCHOOLS.forEach((nm, i) => {
    const left = i < 4, row = i % 4, v0 = 16 + row * 20, v1 = v0 + 18;
    const b = left ? { u0: -68, u1: -38, v0, v1 } : { u0: 38, u1: 68, v0, v1 };
    const look = nm === 'Agriculture' || nm === 'Astronomy' ? { ...STONE, glassRoof: true } : (row % 2 ? BRICK : STONE);
    const Hl = hall('School of ' + nm, b, { side: left ? 'u1' : 'u0', at: DOORS[row] }, 6, look);
    Hl.school = nm;
    schools.push(Hl);
  });
  const S = Object.fromEntries(schools.map((h) => [h.school, h]));
  // Science: a lab
  alongWalls(S.Science, [MAT.BREWING, MAT.CAULDRON, MAT.BREWING, MAT.CRAFTING]);
  rows(S.Science, [MAT.DESK, MAT.DESK, MAT.BREWING, MAT.DESK]);
  // Medicine: a ward of beds along the walls, a pharmacy, a skeleton on a stand
  {
    const Hl = S.Medicine, { inner, door } = Hl, beds = [];
    for (const v of [inner.v0, inner.v1]) for (let u = inner.u0 + 1; u <= inner.u1 - 5; u += 3) {
      if (Math.abs(u - door.at[0]) <= 4) continue;
      const inn = v === inner.v0 ? 1 : -1;
      const foot = pos(u, v + inn, YA + 1), head = pos(u, v, YA + 1);
      const dir = BED_VEC.findIndex(([a, c]) => a === head[0] - foot[0] && c === head[2] - foot[2]);
      world.set(...foot, bedId(dir, false)); world.set(...head, bedId(dir, true));
      world.setData(...foot, { id: 'Bed', bytes: { color: 0 } }); world.setData(...head, { id: 'Bed', bytes: { color: 0 } });
      beds.push({ foot, head }); Hl.items.push(foot, head);
    }
    alongWalls(Hl, [MAT.BREWING, MAT.CAULDRON], 2);
    const [cu, cv] = [Math.floor((inner.u0 + inner.u1) / 2), Math.floor((inner.v0 + inner.v1) / 2)];
    put(cu + 4, cv, YA + 1, MAT.MUSEUM_PLINTH || MAT.SMOOTH_QUARTZ); put(cu + 4, cv, YA + 2, MAT.BONE_Y); put(cu + 4, cv, YA + 3, MAT.BONE_Y);
    Hl.items.push(pos(cu + 4, cv, YA + 1));
    Hl.beds = beds;
  }
  // Engineering: a workshop
  alongWalls(S.Engineering, [MAT.ANVIL, MAT.SMITHING, (f) => grindstoneId(f), (f) => furnaceId('blast', f), MAT.CRAFTING]);
  {
    const Hl = S.Engineering, { inner } = Hl, cu = Math.floor((inner.u0 + inner.u1) / 2), cv = Math.floor((inner.v0 + inner.v1) / 2);
    put(cu, cv, YA + 1, MAT.REDSTONE); put(cu, cv, YA + 2, mat('lit_redstone_lamp', '#e0a050'));
    Hl.items.push(pos(cu, cv, YA + 1));
  }
  // Agriculture: a greenhouse, crops in rows with water between, composters and hay at the walls
  {
    const Hl = S.Agriculture, { inner, door } = Hl, crops = [];
    const kinds = ['wheat', 'carrots', 'potatoes', 'beetroot'];
    for (let u = inner.u0 + 2; u <= inner.u1 - 2; u++) for (let v = inner.v0 + 2; v <= inner.v1 - 2; v++) {
      if (Math.abs(u - door.at[0]) <= 5) continue;                  // the walk in from the door
      const k = (v - inner.v0 - 2) % 4;
      if (k === 3) continue;                                         // a path between the beds
      if (k === 1) { put(u, v, YA, MAT.WATER); continue; }           // water down the middle of each bed
      put(u, v, YA, MAT.FARMLAND); put(u, v, YA + 1, cropId(kinds[Math.floor((v - inner.v0) / 4) % 4], 7)); crops.push(pos(u, v, YA + 1));
    }
    alongWalls(Hl, [MAT.COMPOSTER, MAT.HAY], 2);
    Hl.crops = crops;
  }
  // Law: a courtroom: the judge's bench at the back, lecterns before it, benches for the public
  {
    const Hl = S.Law, { inner, door } = Hl;
    const back = door.side === 'u1' ? inner.u0 : inner.u1, sgn = door.side === 'u1' ? 1 : -1;     // the wall opposite the door; into the room from it
    const cv = Math.floor((inner.v0 + inner.v1) / 2);
    for (let v = cv - 3; v <= cv + 3; v++) { put(back, v, YA + 1, MAT.DARK_PLANKS); put(back + sgn, v, YA + 1, MAT.DESK); Hl.items.push(pos(back, v, YA + 1), pos(back + sgn, v, YA + 1)); }
    for (const dv of [-2, 2]) { put(back + sgn * 4, cv + dv, YA + 1, lecternId(dirOf(-sgn, 0))); Hl.items.push(pos(back + sgn * 4, cv + dv, YA + 1)); }
    for (let k = 7; k <= inner.u1 - inner.u0 - 5; k += 2) for (let v = inner.v0 + 2; v <= inner.v1 - 2; v++) {
      if (Math.abs(v - cv) <= 1) continue;                            // the aisle
      put(back + sgn * k, v, YA + 1, stairId('dark', WEIRDO[dirOf(-sgn, 0)])); Hl.items.push(pos(back + sgn * k, v, YA + 1));
    }
    alongWalls(Hl, [MAT.BOOKSHELF], 1);
  }
  // Arts: looms, easels (a canvas of wool on a post), cartography tables
  {
    const WOOLC = ['red', 'yellow', 'blue', 'lime', 'orange', 'cyan', 'purple', 'white'].map((c) => mat(`${c}_wool`, '#c0c0c0'));
    alongWalls(S.Arts, [(f) => loomId(f), MAT.CARTOGRAPHY, (f) => loomId(f), MAT.CRAFTING]);
    const Hl = S.Arts, { inner, door } = Hl;
    let n = 0;
    for (let u = inner.u0 + 3; u <= inner.u1 - 3; u += 4) for (let v = inner.v0 + 3; v <= inner.v1 - 3; v += 4) {
      if (Math.abs(u - door.at[0]) + Math.abs(v - door.at[1]) <= 5) continue;
      put(u, v, YA + 1, MAT.FENCE); put(u, v, YA + 2, WOOLC[n++ % WOOLC.length]); Hl.items.push(pos(u, v, YA + 1));
    }
  }
  // Music: note blocks round the walls, a stage with a jukebox and bells
  {
    const Hl = S.Music, { inner, door } = Hl;
    const back = door.side === 'u1' ? inner.u0 : inner.u1, sgn = door.side === 'u1' ? 1 : -1;
    const cv = Math.floor((inner.v0 + inner.v1) / 2);
    for (let k = 0; k <= 3; k++) for (let v = inner.v0 + 2; v <= inner.v1 - 2; v++) { put(back + sgn * k, v, YA, MAT.DARK_PLANKS); }
    put(back, cv, YA + 1, mat('jukebox', '#6a4a3a')); Hl.items.push(pos(back, cv, YA + 1));
    for (const dv of [-3, 3]) { put(back, cv + dv, YA + 1, MAT.BELL); Hl.items.push(pos(back, cv + dv, YA + 1)); }
    alongWalls(Hl, [MAT.NOTEBLOCK], 1);
    rows(Hl, [stairId('spruce', WEIRDO[dirOf(-sgn, 0)])], 3);
  }
  // Astronomy: under glass, a telescope on its mount in the middle, star charts round the walls
  {
    const Hl = S.Astronomy, { inner } = Hl, cu = Math.floor((inner.u0 + inner.u1) / 2), cv = Math.floor((inner.v0 + inner.v1) / 2);
    for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) put(cu + du, cv + dv, YA + 1, MAT.SMOOTH_QUARTZ);
    put(cu, cv, YA + 2, MAT.CHAIN || MAT.FENCE); put(cu, cv, YA + 3, MAT.END_ROD); put(cu, cv, YA + 4, MAT.COPPER_BLK || MAT.GOLD);
    Hl.telescope = pos(cu, cv, YA + 4); Hl.items.push(pos(cu, cv, YA + 1));
    alongWalls(Hl, [MAT.CARTOGRAPHY, MAT.BOOKSHELF], 1);
  }

  // ---- the clock tower ---------------------------------------------------------------------------
  const T = { u0: -7, u1: 7, v0: 118, v1: 132, top: 40 };
  const tower = hall('Clock Tower', T, { side: 'v0', at: 0 }, 5, STONE);
  const belfry = YA + 34, clockY = YA + 26;
  for (let u = T.u0; u <= T.u1; u++) for (let v = T.v0; v <= T.v1; v++) {
    const edgeU = u === T.u0 || u === T.u1, edgeV = v === T.v0 || v === T.v1, corner = edgeU && edgeV;
    if (edgeU || edgeV) {
      for (let y = YA + 6; y < belfry; y++) put(u, v, y, corner ? MAT.QUARTZ_PILLAR : MAT.STONEBRICK);
      // the belfry: open arches round it, piers at every third
      const along = edgeU ? v - T.v0 : u - T.u0;
      put(u, v, belfry, MAT.STONEBRICK);
      for (let y = belfry + 1; y <= belfry + 4; y++) {
        if (corner || along % 4 === 0) put(u, v, y, MAT.QUARTZ_PILLAR);
        else if (y === belfry + 1) put(u, v, y, MAT.FENCE);              // a rail round the belfry
        else clear(u, v, y);
      }
      put(u, v, belfry + 5, MAT.SMOOTH_QUARTZ);
    } else {
      put(u, v, YA + 6, MAT.STONEBRICK);                             // the ground floor's ceiling
      put(u, v, belfry, MAT.STONEBRICK);                             // the belfry's floor
      put(u, v, belfry + 5, MAT.SMOOTH_QUARTZ);
    }
  }
  // the spire: a pyramid of deepslate tiles over the belfry, a light at the top
  // (each step's edge a stair, facing out: nothing spawns on a stair)
  for (let k = 0; k <= 7; k++) for (let u = T.u0 + k; u <= T.u1 - k; u++) for (let v = T.v0 + k; v <= T.v1 - k; v++) {
    const y = belfry + 5 + k, eu = u === T.u0 + k ? -1 : u === T.u1 - k ? 1 : 0, ev = v === T.v0 + k ? -1 : v === T.v1 - k ? 1 : 0;
    if (eu || ev) put(u, v, y + (k ? 0 : 1), stairId('deepslate', WEIRDO[dirOf(eu || 0, eu ? 0 : ev)]));
    if (k) { if (!(eu || ev)) put(u, v, y, MAT.DEEPSLATE_TILES); }
  }
  for (let k = 1; k <= 7; k++) for (let u = T.u0 + k; u <= T.u1 - k; u++) for (let v = T.v0 + k; v <= T.v1 - k; v++) if (!has(u, v, belfry + 5 + k)) put(u, v, belfry + 5 + k, MAT.DEEPSLATE_TILES);
  put(0, 125, belfry + 13, MAT.SEA_LANTERN); lit.push(pos(0, 125, belfry + 13));
  // the clock faces: a ring of quartz round a black face, hands at ten past ten, on all four sides
  const faces = [];
  const C = MAT.C_BLACK, Q = MAT.SMOOTH_QUARTZ, G_ = MAT.GOLD;
  for (const [fu, fv, alongU] of [[null, T.v0, true], [null, T.v1, true], [T.u0, null, false], [T.u1, null, false]]) {
    const at0 = (a, y) => alongU ? [a, fv] : [fu, 125 + a];
    for (let a = -4; a <= 4; a++) for (let dy = -4; dy <= 4; dy++) {
      const r = Math.max(Math.abs(a), Math.abs(dy)); if (r > 4) continue;
      const [u, v] = at0(a, dy); put(u, v, clockY + dy, r === 4 ? Q : C);
    }
    for (const [a, dy] of [[0, 0], [-1, 1], [-2, 2], [1, 1], [2, 1], [3, 2]]) { const [u, v] = at0(a, dy); put(u, v, clockY + dy, G_); }
    faces.push(pos(...at0(0, 0), clockY));
  }
  // inside: a ladder up the back wall from the ground floor to the belfry
  const ladder = [];
  const LADDERS = { north: MAT.LADDER_2, south: MAT.LADDER_3, west: MAT.LADDER_4, east: MAT.LADDER_5 };
  const lf = dirOf(0, -1);                                            // the ladder faces the door, on the back wall
  for (let y = YA + 1; y <= belfry; y++) { if (y > YA + 1) { clear(0, T.v1 - 1, y); } put(0, T.v1 - 1, y, LADDERS[lf]); ladder.push(pos(0, T.v1 - 1, y)); }
  for (let y = YA + 6; y <= belfry; y++) for (const du of [-1, 1]) if (!has(du, T.v1 - 1, y)) put(du, T.v1 - 1, y, MAT.STONEBRICK);
  // (the hollow over the ground floor lit: sea lanterns set in its floor, and up its walls)
  for (let u = T.u0 + 2; u <= T.u1 - 2; u += 4) for (let v = T.v0 + 2; v <= T.v1 - 2; v += 4) if (!(u === 0 && v === T.v1 - 1)) { put(u, v, YA + 6, MAT.SEA_LANTERN); lit.push(pos(u, v, YA + 6)); }
  for (let y = YA + 12; y < belfry; y += 6) for (const [u, v] of [[T.u0, 121], [T.u1, 121], [T.u0, 129], [T.u1, 129]]) put(u, v, y, MAT.SEA_LANTERN);
  clear(0, T.v1 - 1, belfry + 1); clear(0, T.v1 - 1, belfry + 2);
  const bell = pos(0, 125, belfry + 1);
  world.set(...bell, MAT.BELL);
  for (const [du, dv] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) { put(du, 125 + dv, belfry + 4, MAT.LAMP_HANG); lit.push(pos(du, 125 + dv, belfry + 4)); }
  tower.ladder = ladder; tower.belfry = pos(0, 125, belfry + 1); tower.bell = bell; tower.faces = faces; tower.top = belfry + 13;

  // ---- the Great Library and the Great Hall ------------------------------------------------------
  const library = hall('Great Library', { u0: -68, u1: -12, v0: 108, v1: 138 }, { side: 'v0', at: -40 }, 9, { wall: MAT.STONEBRICK, trim: MAT.QUARTZ_PILLAR, floor: MAT.DARK_PLANKS });
  for (let v = 106; v <= 107; v++) for (let u = -41; u <= -39; u++) pave(u, v);
  {
    const { inner, door } = library;
    // stacks of shelves three high, in rows across the hall, aisles between
    for (let u = inner.u0 + 3; u <= inner.u1 - 3; u += 4) for (let v = inner.v0 + 6; v <= inner.v1 - 3; v++) {
      if (Math.abs(u - door.at[0]) <= 3 || (v - inner.v0) % 7 === 0) continue;
      if (u >= -45 && u <= -35 && v >= 117 && v <= 127) continue;   // (the enchanting room)
      for (let y = YA + 1; y <= YA + 3; y++) put(u, v, y, MAT.BOOKSHELF);
      library.items.push(pos(u, v, YA + 1));
    }
    // the enchanting room in the middle: a table, shelves round it two out with air between
    const ec = [-40, 122];
    for (let du = -2; du <= 2; du++) for (let dv = -2; dv <= 2; dv++) {
      const r = Math.max(Math.abs(du), Math.abs(dv));
      for (let y = YA + 1; y <= YA + 3; y++) clear(ec[0] + du, ec[1] + dv, y);
      if (r === 2 && !(dv === -2 && Math.abs(du) <= 0)) for (let y = YA + 1; y <= YA + 2; y++) put(ec[0] + du, ec[1] + dv, y, MAT.BOOKSHELF);
    }
    put(ec[0], ec[1], YA + 1, mat('enchanting_table', '#5a2a6a'));
    library.enchanting = pos(ec[0], ec[1], YA + 1);
    // reading desks along the front, lecterns at the ends
    for (let u = inner.u0 + 2; u <= inner.u1 - 2; u += 3) { if (Math.abs(u - door.at[0]) <= 3) continue; put(u, inner.v0 + 2, YA + 1, MAT.DESK); library.items.push(pos(u, inner.v0 + 2, YA + 1)); }
    for (const u of [inner.u0 + 1, inner.u1 - 1]) { put(u, inner.v0 + 4, YA + 1, lecternId(dirOf(0, -1))); library.items.push(pos(u, inner.v0 + 4, YA + 1)); }
  }
  const great = hall('Great Hall', { u0: 12, u1: 68, v0: 108, v1: 138 }, { side: 'v0', at: 40 }, 12, { wall: MAT.BRICK, trim: MAT.QUARTZ_PILLAR, floor: MAT.OAK });
  for (let v = 106; v <= 107; v++) for (let u = 39; u <= 41; u++) pave(u, v);
  {
    // the lecture theatre: a stage at the back, rows of seats rising toward the door, the first
    // a step up from the floor, each a step higher, an aisle up the middle as steps
    const { inner } = great, stageV = inner.v1 - 3;
    for (let u = inner.u0 + 2; u <= inner.u1 - 2; u++) for (let v = stageV; v <= inner.v1; v++) put(u, v, YA + 1, MAT.DARK_PLANKS);
    put(40, stageV, YA + 2, lecternId(dirOf(0, -1))); great.lectern = pos(40, stageV, YA + 2);
    const seats = [];
    const first = stageV - 4, rowsN = 9;
    for (let k = 0; k < rowsN; k++) {
      const v = first - k, top = YA + 1 + k;
      for (let u = inner.u0 + 2; u <= inner.u1 - 2; u++) {
        for (let y = YA + 1; y < top; y++) put(u, v, y, MAT.OAK);
        put(u, v, top, stairId('oak', WEIRDO[dirOf(0, -1)]));
        seats.push(pos(u, v, top));
      }
    }
    // the back of the seating walled off by a rail, so nobody steps off its top row
    for (let u = inner.u0 + 2; u <= inner.u1 - 2; u++) { const v = first - rowsN, y = YA + rowsN; for (let yy = YA + 1; yy <= y; yy++) put(u, v, yy, MAT.OAK); put(u, v, y + 1, MAT.FENCE); }
    great.seats = seats;
  }

  // ---- the quad: grass, trees, two fountains -------------------------------------------------------
  const trees = [], fountains = [];
  for (const fu of [-16, 16]) {
    const fv = 55;
    for (let du = -3; du <= 3; du++) for (let dv = -3; dv <= 3; dv++) {
      const r = Math.max(Math.abs(du), Math.abs(dv));
      put(fu + du, fv + dv, YA, r === 3 ? MAT.SMOOTH_QUARTZ : MAT.SMOOTH_QUARTZ);
      if (r === 3) put(fu + du, fv + dv, YA + 1, MAT.SMOOTH_QUARTZ);
      else if (r >= 1) put(fu + du, fv + dv, YA + 1, MAT.WATER);
    }
    put(fu, fv, YA + 1, MAT.QUARTZ_PILLAR); put(fu, fv, YA + 2, MAT.QUARTZ_PILLAR); put(fu, fv, YA + 3, MAT.SEA_LANTERN); lit.push(pos(fu, fv, YA + 3));
    fountains.push({ centre: pos(fu, fv, YA + 1), water: [] });
    for (let du = -2; du <= 2; du++) for (let dv = -2; dv <= 2; dv++) if (Math.max(Math.abs(du), Math.abs(dv)) >= 1) fountains[fountains.length - 1].water.push(pos(fu + du, fv + dv, YA + 1));
    // a path round it to the cross path
    for (let du = -4; du <= 4; du++) for (const dv of [-4, 4]) pave(fu + du, fv + dv);
    for (const du of [-4, 4]) for (let dv = -3; dv <= 3; dv++) pave(fu + du, fv + dv);
    for (let v = fv - 9; v <= fv - 5; v++) pave(fu, v);
  }
  const isPath = new Set(paved.map(([u, v]) => u + ',' + v));
  for (let u = -30; u <= 30; u += 10) for (let v = 20; v <= 95; v += 10) {
    if (Math.abs(u) <= 6) continue;
    if ([...Array(7)].some((_, a) => [...Array(7)].some((__, c) => isPath.has((u + a - 3) + ',' + (v + c - 3)) || has(u + a - 3, v + c - 3, YA + 1)))) continue;
    for (let y = YA + 1; y <= YA + 4; y++) put(u, v, y, MAT.LOG);
    for (let du = -2; du <= 2; du++) for (let dv = -2; dv <= 2; dv++) for (let y = YA + 4; y <= YA + 6; y++) {
      if (Math.abs(du) + Math.abs(dv) > (y === YA + 6 ? 1 : 3) || (du === 0 && dv === 0 && y < YA + 5)) continue;
      if (!has(u + du, v + dv, y)) put(u + du, v + dv, y, MAT.LEAVES);
    }
    trees.push(pos(u, v, YA + 1));
  }
  // benches along the avenue
  const benches = [];
  for (let v = 14; v <= 100; v += 8) for (const s of [-1, 1]) {
    if (DOORS.some((d) => Math.abs(v - d) <= 2)) continue;
    const u = s * 3;
    if (!has(u, v, YA + 1)) { put(u, v, YA + 1, stairId('oak', WEIRDO[dirOf(-s, 0)])); benches.push(pos(u, v, YA + 1)); }
  }

  // ---- the sports field: a track round a pitch ------------------------------------------------------
  const F = { u0: -60, u1: 60, v0: 148, v1: 174 };
  const TRACK = mat('red_terracotta', '#8f3d2e');
  for (let u = F.u0; u <= F.u1; u++) for (let v = F.v0; v <= F.v1; v++) {
    const e = Math.min(u - F.u0, F.u1 - u, v - F.v0, F.v1 - v);
    put(u, v, YA, e <= 2 ? TRACK : MAT.GRASS);
    if (e > 2 && v === Math.floor((F.v0 + F.v1) / 2)) put(u, v, YA, MAT.C_WHITE);
  }
  for (let v = 146; v <= 147; v++) for (let u = -1; u <= 1; u++) pave(u, v);
  const goals = [];
  for (const gu of [F.u0 + 4, F.u1 - 4]) { const cv = Math.floor((F.v0 + F.v1) / 2); for (let dv = -2; dv <= 2; dv++) { put(gu, cv + dv, YA + 1, MAT.FENCE); if (Math.abs(dv) === 2) put(gu, cv + dv, YA + 2, MAT.FENCE); } goals.push(pos(gu, cv, YA + 1)); }

  // ---- a fence round it all; the open ground lit ----------------------------------------------------
  const fence = [];
  for (let u = U0; u <= U1; u++) for (let v = 0; v < VD; v++) {
    const edge = u === U0 || u === U1 || v === 0 || v === VD - 1;
    if (!edge || (v === 0 && Math.abs(u) <= 20)) continue;
    if (!has(u, v, YA + 1)) { put(u, v, YA + 1, MAT.FENCE); fence.push(pos(u, v, YA + 1)); }
  }
  const cells = [];
  for (let v = 1; v < VD - 1; v++) for (let u = U0 + 1; u < U1; u++) cells.push([u, v]);
  const pathIds = new Set([PATH, TRACK, MAT.SMOOTH_QUARTZ, MAT.C_WHITE]);
  const lamps = lightGround(world, { at }, YA, cells, (u, v, x, z) => {
    const id = world.get(x, YA, z);
    if (world.has(x, YA + 1, z)) return null;
    if (id === MAT.GRASS) return 'soft';
    if (pathIds.has(id)) return 'hard';
    return null;
  }, lit, MAT.FENCE, MAT.SEA_LANTERN);
  void get; void sign;
  const EMITS = /lantern|glowstone|shroomlight|froglight/;
  const real = (p) => { const i = world.get(...p); return i >= 0 && EMITS.test(MATERIALS.def(i).block); };

  const a0 = at(U0, 0), a1 = at(U1, VD - 1);
  const rect = { x0: Math.min(a0[0], a1[0]), x1: Math.max(a0[0], a1[0]), z0: Math.min(a0[1], a1[1]), z1: Math.max(a0[1], a1[1]) };
  const rx = road.map((p) => p[0]), rz = road.map((p) => p[2]);
  const roadRect = { x0: Math.min(...rx), x1: Math.max(...rx), z0: Math.min(...rz), z1: Math.max(...rz) };
  const [vx, vz] = at(0, 4), [lx, lz] = at(0, 12);
  return {
    kind: 'university', lot: rect, roadRect, side, street: acc.street, gate: acc.gate, streetSign: acc.streetSign, ground: YA, rec: null,
    road, gateSign, schools, tower, library, great, halls, trees, fountains, benches, field: { goals }, fence, lamps: [...lit, ...lamps].filter(real),
    visit: [vx, YA + 1, vz], visitLook: [lx, YA + 2, lz],
    frame: { at, pos, U0, U1, VD, YA },
  };
}
