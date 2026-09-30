// tools/checks/2zn-lighting.js — no dark corners.
//
// Since 1.18 (both editions) an Overworld hostile mob spawns only where block
// light is 0, on an opaque surface with two cells of room above. The light of
// the finished city is worked out afresh: no such spot anywhere in the city (or
// under its dome) is left at 0, and every spot inside a building reaches 8, a
// properly lit room. The lights added never take head room (a hung lantern has
// three clear under it) or trip anyone (a flush light is level with the floor),
// and every building still walks through.

export const id = '2zn';
export const label = '2zn. lighting: no dark corners';

export default async function run(ctx) {
  const { check, note } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const { verifyAll } = await import('../../engine/verify.js');
  const { MATERIALS, MAT } = await import('../../engine/materials.js');
  const { lightMap, spawnSpots, TARGET } = await import('../../engine/lighting.js');

  check('defaults: every city is lit', DEFAULTS.lightAll === true);
  let ok = true, cities = 0, spots = 0, darkOut = 0, darkIn = 0, added = 0, hangBad = 0, flushBad = 0;
  for (const [st, seed, extra] of [['modern', 7, {}], ['medieval', 31, {}], ['village', 5, {}], ['glass', 3, { dome: true }], ['fortress', 99, {}], ['nether', 12345, {}]]) {
    const before = generateCity({ ...DEFAULTS, seed, size: 160, cityStyle: st, ...extra, lightAll: false });
    const r = generateCity({ ...DEFAULTS, seed, size: 160, cityStyle: st, ...extra });
    cities++;
    const w = r.world;
    const v = verifyAll(w, r.buildings);
    if (v.ok !== v.total || v.floorsReached !== v.floorsChecked || r.reach.unreached.length) ok = false;
    added += r.stats.lighting.added;
    // the light afresh, on the finished world
    const map = lightMap(w);
    const { W, D, mask } = r.plan, d = r.dome;
    const inside = d ? (x, z) => (x - d.cx) ** 2 + (z - d.cz) ** 2 < d.R * d.R : (x, z) => x >= 0 && z >= 0 && x < W && z < D && (!mask || mask[z * W + x]);
    const inDome = (x, y, z) => !d || ((x - d.cx) ** 2 + (z - d.cz) ** 2) / d.R ** 2 + ((y - 1) / d.c) ** 2 < 1;
    const indoor = (x, y, z) => r.buildings.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && y > b.groundY && y <= b.roofY);
    for (const [x, y, z, L] of spawnSpots(w, map, inside)) {
      if (!inDome(x, y, z)) continue;
      spots++;
      if (L === 0) darkOut++;
      else if (L < TARGET && indoor(x, y, z)) darkIn++;
    }
    // the new lights: where the unlit city had none
    const was = before.world;
    w.forEach((x, y, z, id) => {
      if (was.get(x, y, z) === id) return;
      if (id === MAT.LAMP_HANG) {
        // three clear under a hung lantern (nobody's head room), a ceiling over it
        for (let h = 1; h <= 3; h++) if (w.has(x, y - h, z)) { hangBad++; break; }
        if (!w.has(x, y + 1, z)) hangBad++;
      } else if (id === MAT.LANTERN || id === MAT.SHROOMLIGHT) {
        // a flush light: it took the place of a floor block, with room to stand on it
        if (was.get(x, y, z) === -1 || w.has(x, y + 1, z) && !MATERIALS.isPassable(w.get(x, y + 1, z))) flushBad++;
      }
    });
  }
  check('lit: every building still walks through, every floor and door reached', ok);
  check('lit: no spot anywhere in the city (or under its dome) where a hostile mob could spawn', spots > 50000 && darkOut === 0, `${darkOut} dark of ${spots} spots`);
  check(`lit: every spot inside a building at light ${TARGET} or more (a properly lit room)`, darkIn === 0, `${darkIn} dim`);
  check('lights: a hung lantern has a ceiling over it and three clear under it', hangBad === 0, `${hangBad}`);
  check('lights: a flush light is set into the floor, with room to stand on it', flushBad === 0, `${flushBad}`);
  const off = generateCity({ ...DEFAULTS, seed: 7, size: 160, lightAll: false });
  check('lights: none added when lighting is off', off.stats.lighting === null);
  note(`lighting: ${added} lights across ${cities} cities, ${spots} spawn spots checked, none dark`);
}
