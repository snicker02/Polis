// engine/market.js — the farmers' market at work (0.80.0): a wandering trader in each of the
// market's stalls, each stall with its own set trades.
//
// The market (landmarks.js: market) is a square of stalls, three by three each, posts at the
// corners and a cloth roof three over the ground. A working stall: the trader in the middle, a
// counter on the side facing the way in and its goods on the other three sides, a block high.
// Under the roof a trader cannot climb onto any of them (it would need two clear over the block,
// and the roof leaves one), so it stays in its stall; the player trades with it over the counter.
//
// The traders are the game's own wandering trader (mob-entities.js), carried in the pack with
// (export.js: mobEntityFiles):
// - polis:kept (persistent, no despawning), as every mob Polis keeps;
// - a group for each stall, polis:stall_<id>: that stall's trade table (trading/polis_market/
//   <id>.json in the pack) in place of the trader's own, and a resupply, so its trades come back
//   (a wandering trader's otherwise never do);
// - the trader's two llamas and its despawn timer moved from its components into a group,
//   polis:wild, that the game's spawn event gives a wild trader: one the game spawns, or one
//   summoned, is the trader it always was; one loaded in a stall has neither.
// In Java (java-entities.js) each comes with its offers written on it, and no despawn delay.

export const STALLS = [
  { id: 'greengrocer', name: 'Greengrocer', goods: ['melon', 'pumpkin', 'hay'],
    sells: [['carrot', 12], ['potato', 12], ['beetroot', 12], ['apple', 6], ['melon_slice', 16], ['pumpkin', 3], ['sweet_berries', 16], ['glow_berries', 8]],
    buys: [['wheat', 20], ['carrot', 22], ['potato', 26]] },
  { id: 'baker', name: 'Baker', goods: ['hay', 'barrel', 'hay'],
    sells: [['bread', 6], ['cookie', 16], ['pumpkin_pie', 4], ['cake', 1, 3], ['honey_bottle', 2, 2], ['sugar', 16]],
    buys: [['wheat', 20], ['pumpkin', 6]] },
  { id: 'butcher', name: 'Butcher & Dairy', goods: ['barrel', 'smoker', 'barrel'],
    sells: [['cooked_beef', 6], ['cooked_porkchop', 6], ['cooked_chicken', 8], ['cooked_mutton', 6], ['egg', 16], ['rabbit_stew', 1]],
    buys: [['beef', 10], ['porkchop', 10], ['chicken', 12]] },
  { id: 'fishmonger', name: 'Fishmonger', goods: ['barrel', 'ice', 'barrel'],
    sells: [['cod', 8], ['salmon', 6], ['cooked_cod', 6], ['cooked_salmon', 6], ['tropical_fish', 4], ['kelp', 16], ['dried_kelp_block', 2]],
    buys: [['cod', 15], ['salmon', 13]] },
  { id: 'florist', name: 'Florist', goods: ['flowers', 'flowers', 'flowers'],
    sells: [['poppy', 8], ['dandelion', 8], ['cornflower', 8], ['allium', 6], ['blue_orchid', 6], ['oxeye_daisy', 8], ['azure_bluet', 8],
      ['lily_of_the_valley', 6], ['red_tulip', 6], ['pink_tulip', 6], ['sunflower', 4], ['lilac', 4], ['peony', 4], ['rose_bush', 4]],
    buys: [] },
  { id: 'seeds', name: 'Seeds & Saplings', goods: ['composter', 'hay', 'composter'],
    sells: [['wheat_seeds', 16], ['melon_seeds', 8], ['pumpkin_seeds', 8], ['beetroot_seeds', 16], ['oak_sapling', 4], ['birch_sapling', 4],
      ['cherry_sapling', 2], ['torchflower_seeds', 1, 4], ['pitcher_pod', 1, 4]],
    buys: [] },
  { id: 'honey', name: 'Honey & Candles', goods: ['honey', 'barrel', 'honey'],
    sells: [['honeycomb', 6], ['honey_bottle', 3], ['honey_block', 1], ['candle', 4], ['beehive', 1, 6]],
    buys: [['honeycomb', 10]] },
  { id: 'forager', name: 'Mushrooms & Moss', goods: ['moss', 'barrel', 'moss'],
    sells: [['brown_mushroom', 8], ['red_mushroom', 8], ['moss_block', 4], ['glow_lichen', 8], ['vine', 8], ['bamboo', 12], ['cactus', 4]],
    buys: [] },
];

// a stall's trades as the game's trade table wants them (emeralds for goods; goods for emeralds)
export function tradeTable(st) {
  const sells = st.sells.map(([item, n, price]) => ({ wants: [{ item: 'minecraft:emerald', quantity: price || 1 }], gives: [{ item: 'minecraft:' + item, quantity: n }], max_uses: 16, trader_exp: 1, reward_exp: true }));
  const buys = st.buys.map(([item, n]) => ({ wants: [{ item: 'minecraft:' + item, quantity: n }], gives: [{ item: 'minecraft:emerald', quantity: 1 }], max_uses: 16, trader_exp: 1, reward_exp: true }));
  const trades = [...sells, ...buys];
  return { tiers: [{ total_exp_required: 0, groups: [{ num_to_select: trades.length, trades }] }] };
}
export function tradeFiles() {
  return STALLS.map((st) => ({ name: `trading/polis_market/${st.id}.json`, data: JSON.stringify(tradeTable(st), null, 2) }));
}
export const stallGroup = (id) => 'polis:stall_' + id;

// The wandering trader's definition for the pack: the game's own (given), changed as above.
export function traderDef(vanilla) {
  const d = JSON.parse(JSON.stringify(vanilla));
  const e = d['minecraft:entity'];
  const wild = {};
  for (const k of ['minecraft:spawn_entity', 'minecraft:timer']) if (e.components[k]) { wild[k] = e.components[k]; delete e.components[k]; }
  e.component_groups = { ...(e.component_groups || {}), 'polis:wild': wild };
  for (const st of STALLS) {
    e.component_groups[stallGroup(st.id)] = {
      'minecraft:economy_trade_table': { display_name: st.name, new_screen: true, table: `trading/polis_market/${st.id}.json` },
      'minecraft:trade_resupply': {},
    };
  }
  e.events = { ...(e.events || {}), 'minecraft:entity_spawned': { add: { component_groups: ['polis:wild'] } } };
  return d;
}
