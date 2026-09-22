// engine/entities.js — villagers and golems as real entity NBT, carried inside
// .mcstructure files so they load wherever the blocks load.
//
// /summon only works in chunks the game is simulating (simulation distance,
// 4 chunks by default), so summoning a whole city's population from one spot
// placed only the handful nearest the player. Structures fill every loaded
// chunk, which is why the city itself always appears in full.
//
// The templates are entity records from a structure saved in Bedrock 26.x
// (engine/entity-templates.js). Each villager is reset to a fresh unemployed
// adult ("unskilled"), with no village, trades or inventory, so it claims a
// bed and takes a job from whatever workstation it finds.

import { GOLEM, VILLAGER, CAT, PANDA, CAT_COATS, hydrate } from './entity-templates.js';
import { N } from './blockcore.js';

let uidSeq = 0;
function uniqueId(rng) {
  // negative 48-bit ids, like the game's; Bedrock re-issues ids on load anyway
  const hi = Math.floor(rng() * 0x7fffff) + 1;
  uidSeq = (uidSeq + 1) & 0xffffff;
  return -(BigInt(hi) * 16777216n + BigInt(uidSeq));
}

const floatList = (xs) => ({ t: 9, et: 5, keepEt: true, v: xs.map((x) => ({ t: 5, v: x })) });

// kinds carried in mob structures (everything else is summoned)
export const STRUCTURE_MOBS = new Set(['villager', 'golem', 'cat', 'panda']);
const TEMPLATE = { villager: VILLAGER, golem: GOLEM, cat: CAT, panda: PANDA };

export function makeEntity(kind, x, y, z, rng) {
  const e = hydrate(TEMPLATE[kind]);
  const v = e.v;
  delete v.DwellingUniqueID;                        // never tied to the village it was copied from
  v.Pos = floatList([x + 0.5, y, z + 0.5]);
  v.Rotation = floatList([Math.floor(rng() * 360) - 180, 0]);
  v.UniqueID = N.long(uniqueId(rng));
  delete v.Motion;
  v.FallDistance = { t: 5, v: 0 };
  v.OnGround = { t: 1, v: 1 };
  if (kind === 'cat') {
    // a coat from the ones seen in game, with the Variant the game pairs with it
    const coat = CAT_COATS[Math.floor(rng() * CAT_COATS.length)];
    v.definitions = {
      t: 9, et: 8, keepEt: true,
      v: v.definitions.v.map((d) => (/^\+minecraft:cat_(?!adult|baby|wild)/.test(d.v) ? { t: 8, v: coat.def } : d)),
    };
    v.Variant = { t: 3, v: coat.variant };
  }
  if (kind === 'villager') {
    const skin = Math.floor(rng() * 6);
    v.definitions = {
      t: 9, et: 8, keepEt: true,
      v: v.definitions.v.map((d) => {
        if (d.v === '+nitwit') return { t: 8, v: '+unskilled' };
        if (/^\+villager_skin_\d$/.test(d.v)) return { t: 8, v: `+villager_skin_${skin}` };
        return d;
      }),
    };
    v.SkinID = { t: 3, v: skin };
    v.Variant = { t: 3, v: 0 };                      // 0 = unskilled
    v.MarkVariant = { t: 3, v: 0 };
    v.RewardPlayersOnFirstFounding = { t: 1, v: 0 };
  }
  return e;
}
