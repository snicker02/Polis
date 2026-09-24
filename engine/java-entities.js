// engine/java-entities.js — the city's living things, written for Java.
//
// The Bedrock side copies real entities out of structures saved in game,
// because Bedrock's villager trade data is awkward to synthesise. Java needs
// none of that: its entity NBT is small and readable, so these are written
// from scratch.
//
// One deliberate difference. On Bedrock a villager arrives already levelled,
// with the trades captured from a real one. Writing believable Offers for
// every profession and level in Java would mean inventing Mojang's whole
// trade table, and a villager given a profession with no Offers ends up with
// nothing to trade at all. So on Java the villagers arrive unemployed, and
// take up the lecterns, looms, barrels, smokers and the rest that the city
// already puts in its buildings — the game then gives them proper trades and
// they level up by being traded with.

const PAINTING_VARIANT = {
  SkullAndRoses: 'skull_and_roses', BurningSkull: 'burning_skull', Kebab: 'kebab', Aztec: 'aztec',
  Pointer: 'pointer', Match: 'match', Graham: 'graham', Wasteland: 'wasteland',
  prairie_ride: 'prairie_ride', Courbet: 'courbet', Pool: 'pool', Sea: 'sea', Sunset: 'sunset',
  Creebet: 'creebet', Wanderer: 'wanderer', Bust: 'bust', Stage: 'stage', Void: 'void',
  Wither: 'wither', Fighters: 'fighters', Pigscene: 'pigscene', Skeleton: 'skeleton',
  DonkeyKong: 'donkey_kong', Alban: 'alban', Aztec2: 'aztec2', Bomb: 'bomb', Plant: 'plant',
};

// Bedrock's cat coats and Java's cat variants, in the same order the
// templates record them.
const CAT_VARIANT = ['tabby', 'black', 'red', 'siamese', 'british_shorthair', 'calico', 'persian', 'ragdoll', 'white', 'jellie'];

// a painting's Direction is the way it faces: 0 south, 1 west, 2 north, 3 east
const PAINTING_FACING = { 0: 0, 1: 1, 2: 2, 3: 3 };

// Returns { id, nbt } where nbt is a plain object of [type, value] pairs, or
// null for anything Java should not be given.
export function javaEntity(spawn, J) {
  const t = spawn.type;
  if (t === 'villager') {
    // unemployed on purpose: see the note at the top
    return {
      id: 'minecraft:villager',
      nbt: {
        VillagerData: J.comp({
          type: J.str('minecraft:plains'),
          profession: J.str('minecraft:none'),
          level: J.int(1),
        }),
        PersistenceRequired: J.byte(1),
      },
    };
  }
  if (t === 'golem') return { id: 'minecraft:iron_golem', nbt: { PlayerCreated: J.byte(1), PersistenceRequired: J.byte(1) } };
  if (t === 'cat') {
    return {
      id: 'minecraft:cat',
      nbt: { variant: J.str('minecraft:' + (CAT_VARIANT[spawn.coat || 0] || 'tabby')), PersistenceRequired: J.byte(1) },
    };
  }
  if (t === 'panda') {
    return {
      id: 'minecraft:panda',
      nbt: { MainGene: J.str('normal'), HiddenGene: J.str('normal'), PersistenceRequired: J.byte(1) },
    };
  }
  if (t === 'cow' || t === 'pig' || t === 'chicken') return { id: 'minecraft:' + t, nbt: { PersistenceRequired: J.byte(1) } };
  if (t === 'sheep') return { id: 'minecraft:sheep', nbt: { Color: J.byte(spawn.coat === 1 ? 8 : 0), PersistenceRequired: J.byte(1) } };
  if (t === 'minecart') return { id: 'minecraft:minecart', nbt: {} };
  if (t === 'boat') return { id: 'minecraft:oak_boat', nbt: {} };
  if (t === 'painting') {
    const variant = PAINTING_VARIANT[spawn.motif];
    if (!variant) return null;
    return {
      id: 'minecraft:painting',
      nbt: { variant: J.str('minecraft:' + variant), facing: J.byte(PAINTING_FACING[spawn.direction] ?? 2) },
    };
  }
  return null;
}

// Where an entity stands, in the structure's own coordinates. Mobs stand in
// the middle of their block; a painting keeps the exact centre it was given.
export function javaEntityPos(spawn, box) {
  if (spawn.type === 'painting' && spawn.pos) {
    return [spawn.pos[0] - box.x0, spawn.pos[1] - box.y0, spawn.pos[2] - box.z0];
  }
  // A boat rides on the surface: given the block of water it sits in, it has
  // to go a block higher or it starts underneath the water and cannot be
  // boarded.
  const lift = spawn.type === 'boat' ? 1 : 0;
  return [spawn.x - box.x0 + 0.5, spawn.y - box.y0 + lift, spawn.z - box.z0 + 0.5];
}
