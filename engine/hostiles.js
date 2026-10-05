// engine/hostiles.js — hostile mobs for a city, on request.
//
// Off by default. A city always gets its hostiles functions (hostiles,
// hostiles_centered, hostiles_clear), so a player can bring them in later; the
// "Hostile mobs" option also has populate summon them with everything else.
//
// Every kind here is untouched by daylight (no zombies or skeletons, which
// burn), and each style gets a fitting mix: the Nether style its own fauna, a
// medieval town an illager raid, the desert husks. They are summoned with a
// name, which Bedrock keeps (an unnamed hostile despawns once the player is
// away); on Java they carry PersistenceRequired instead, and a tag for clearing.
//
// They stand on the streets, squares and park paths, three blocks of head room
// over each (an enderman is nearly three tall), spaced apart and never by a
// doorway, so a door is never guarded shut.

import { MATERIALS } from './materials.js';
import { USE } from './plan.js';

// kind -> { bedrock id, java id, name }
export const HOSTILE_KINDS = {
  creeper:          { be: 'minecraft:creeper',            java: 'minecraft:creeper',          name: 'Creeper' },
  spider:           { be: 'minecraft:spider',             java: 'minecraft:spider',           name: 'Spider' },
  enderman:         { be: 'minecraft:enderman',           java: 'minecraft:enderman',         name: 'Enderman' },
  witch:            { be: 'minecraft:witch',              java: 'minecraft:witch',            name: 'Witch' },
  pillager:         { be: 'minecraft:pillager',           java: 'minecraft:pillager',         name: 'Pillager' },
  vindicator:       { be: 'minecraft:vindicator',         java: 'minecraft:vindicator',       name: 'Vindicator' },
  evoker:           { be: 'minecraft:evocation_illager',  java: 'minecraft:evoker',           name: 'Evoker' },
  husk:             { be: 'minecraft:husk',               java: 'minecraft:husk',             name: 'Husk' },
  blaze:            { be: 'minecraft:blaze',              java: 'minecraft:blaze',            name: 'Blaze' },
  magma_cube:       { be: 'minecraft:magma_cube',         java: 'minecraft:magma_cube',       name: 'MagmaCube' },
  wither_skeleton:  { be: 'minecraft:wither_skeleton',    java: 'minecraft:wither_skeleton',  name: 'WitherSkeleton' },
  zoglin:           { be: 'minecraft:zoglin',             java: 'minecraft:zoglin',           name: 'Zoglin' },
  zombified_piglin: { be: 'minecraft:zombie_pigman',      java: 'minecraft:zombified_piglin', name: 'Piglin' },
  // the rest the jail holds (jail.js)
  zombie:           { be: 'minecraft:zombie',             java: 'minecraft:zombie',           name: 'Zombie' },
  drowned:          { be: 'minecraft:drowned',            java: 'minecraft:drowned',          name: 'Drowned' },
  zombie_villager:  { be: 'minecraft:zombie_villager_v2', java: 'minecraft:zombie_villager',  name: 'ZombieVillager' },
  skeleton:         { be: 'minecraft:skeleton',           java: 'minecraft:skeleton',         name: 'Skeleton' },
  stray:            { be: 'minecraft:stray',              java: 'minecraft:stray',            name: 'Stray' },
  bogged:           { be: 'minecraft:bogged',             java: 'minecraft:bogged',           name: 'Bogged' },
  cave_spider:      { be: 'minecraft:cave_spider',        java: 'minecraft:cave_spider',      name: 'CaveSpider' },
  endermite:        { be: 'minecraft:endermite',          java: 'minecraft:endermite',        name: 'Endermite' },
  silverfish:       { be: 'minecraft:silverfish',         java: 'minecraft:silverfish',       name: 'Silverfish' },
  slime:            { be: 'minecraft:slime',              java: 'minecraft:slime',            name: 'Slime' },
  phantom:          { be: 'minecraft:phantom',            java: 'minecraft:phantom',          name: 'Phantom' },
  shulker:          { be: 'minecraft:shulker',            java: 'minecraft:shulker',          name: 'Shulker' },
  breeze:           { be: 'minecraft:breeze',             java: 'minecraft:breeze',           name: 'Breeze' },
  creaking:         { be: 'minecraft:creaking',           java: 'minecraft:creaking',         name: 'Creaking' },
  ravager:          { be: 'minecraft:ravager',            java: 'minecraft:ravager',          name: 'Ravager' },
  guardian:         { be: 'minecraft:guardian',           java: 'minecraft:guardian',         name: 'Guardian' },
  ghast:            { be: 'minecraft:ghast',              java: 'minecraft:ghast',            name: 'Ghast' },
};

// what each style brings, with weights
export const HOSTILE_MIX = {
  default:  [['creeper', 3], ['spider', 2], ['enderman', 2], ['witch', 1], ['pillager', 2], ['vindicator', 1]],
  medieval: [['pillager', 4], ['vindicator', 3], ['evoker', 1], ['witch', 1]],
  village:  [['pillager', 4], ['vindicator', 3], ['evoker', 1], ['witch', 1]],
  desert:   [['husk', 4], ['creeper', 2], ['spider', 2], ['witch', 1], ['pillager', 1]],
  nether:   [['wither_skeleton', 3], ['blaze', 2], ['magma_cube', 2], ['zombified_piglin', 2], ['zoglin', 1]],
};
export const mixFor = (style) => HOSTILE_MIX[style] || HOSTILE_MIX.default;

function pick(mix, u) {
  const total = mix.reduce((a, [, w]) => a + w, 0);
  let acc = 0;
  for (const [kind, w] of mix) { acc += w / total; if (u < acc) return kind; }
  return mix[mix.length - 1][0];
}

/**
 * Where hostiles stand. Candidates: street, square and park cells whose ground
 * has three clear blocks over it; spaced `spacing` apart; not within `doorGap`
 * of any building's doorstep.
 */
export function hostileSpawns(world, plan, buildings, rng, opts = {}) {
  const count = opts.count | 0;
  if (count <= 0) return [];
  const mix = mixFor(opts.style);
  const spacing = opts.spacing || 5, doorGap = opts.doorGap || 3;
  const { W, D, use } = plan;
  const solid = (x, y, z) => { const id = world.get(x, y, z); return id !== -1 && !MATERIALS.isPassable(id); };
  const clear = (x, y, z) => { const id = world.get(x, y, z); return id === -1 || MATERIALS.isPassable(id) && !/fence|wall|lantern/.test(MATERIALS.def(id).block); };
  const doors = buildings.map((b) => b.outside);
  const nearDoor = (x, z) => doors.some(([dx, , dz]) => Math.abs(dx - x) <= doorGap && Math.abs(dz - z) <= doorGap);
  const cand = [];
  for (let z = 1; z < D - 1; z++)
    for (let x = 1; x < W - 1; x++) {
      const u = use[z * W + x];
      if (u !== USE.ROAD && u !== USE.PLAZA && u !== USE.PARK && u !== USE.SIDEWALK) continue;
      if (nearDoor(x, z)) continue;
      // the ground here: the highest solid block with three clear over it
      for (let y = (opts.top || 80); y >= (opts.bottom || 0); y--) {
        if (!solid(x, y, z)) continue;
        if (clear(x, y + 1, z) && clear(x, y + 2, z) && clear(x, y + 3, z)) cand.push([x, y + 1, z]);
        break;
      }
    }
  rng.shuffle(cand);
  const out = [];
  for (const [x, y, z] of cand) {
    if (out.length >= count) break;
    if (out.some((p) => Math.max(Math.abs(p.x - x), Math.abs(p.z - z)) < spacing)) continue;
    const kind = pick(mix, rng());
    out.push({ type: kind, x, y, z, name: HOSTILE_KINDS[kind].name });
  }
  return out;
}
