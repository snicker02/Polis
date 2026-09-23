// tools/extract-templates.js — lift entity templates out of a structure saved
// in game, and write them to engine/entity-templates.js.
//   node tools/extract-templates.js <villagers.mcstructure> <farm_animals.mcstructure>
// The shipped templates came from a Bedrock 26.x world (InventoryVersion 1.26.45).
import { readFileSync, writeFileSync } from 'node:fs';
import { decodeTyped } from './nbt-typed.js';

// every file given contributes its entities (villager/golem/cat/panda file,
// farm animal file, ...)
const files = process.argv.slice(2);
const ents = files.flatMap((f) => decodeTyped(new Uint8Array(readFileSync(f))).v.structure.v.entities.v);
const id = (e) => e.v.identifier.v;
const defs = (e) => (e.v.definitions ? e.v.definitions.v.map((d) => d.v) : []);
const health = (e) => e.v.Attributes.v.find((a) => a.v.Name.v === 'minecraft:health').v;

const golem = ents.find((e) => id(e) === 'minecraft:iron_golem' && health(e).Current.v === health(e).Base.v &&
  e.v.canPickupItems && e.v.canPickupItems.v === 0);
const villager = ents.find((e) => id(e) === 'minecraft:villager_v2' && defs(e).includes('+nitwit') && defs(e).includes('+adult'));
// a plain adult wild cat (no baby groups), and a plain "normal" panda
const cat = ents.find((e) => id(e) === 'minecraft:cat' && defs(e).length === 4 && defs(e).includes('+minecraft:cat_adult') &&
  defs(e).includes('+minecraft:cat_wild') && e.v.IsTamed.v === 0);
const panda = ents.find((e) => id(e) === 'minecraft:panda' && defs(e).join() === '+minecraft:panda,+minecraft:panda_adult' && e.v.Variant.v === 0);
// every coat seen in the file: its component group and the Variant number the game pairs with it
const coats = [];
for (const e of ents.filter((x) => id(x) === 'minecraft:cat')) {
  const d = defs(e).find((x) => /^\+minecraft:cat_(?!adult|baby|wild)/.test(x));
  if (d && !coats.some((c) => c.def === d)) coats.push({ def: d, variant: e.v.Variant.v });
}
// farm animals: healthy adults, no owner, no leash
const adultWith = (ident, group) => ents.find((e) => id(e) === ident && defs(e).includes(group) &&
  health(e).Current.v === health(e).Base.v && e.v.IsBaby.v === 0);
const cow = adultWith('minecraft:cow', '+minecraft:cow_adult');
const pig = adultWith('minecraft:pig', '+minecraft:pig_adult');
const chicken = adultWith('minecraft:chicken', '+minecraft:chicken_adult');
const sheep = adultWith('minecraft:sheep', '+minecraft:sheep_adult');
// every sheep coat seen: its component group and the Color byte the game pairs with it
const sheepCoats = [];
for (const e of ents.filter((x) => id(x) === 'minecraft:sheep')) {
  const d = defs(e).find((x) => /^\+minecraft:sheep_(?!adult|baby|sheared|dyeable)/.test(x));
  if (d && !sheepCoats.some((c) => c.def === d)) sheepCoats.push({ def: d, color: e.v.Color.v });
}
// Paintings: one entity as the template, plus the motifs seen and their sizes.
// A painting's Pos is its centre, so an even width or height puts that centre
// on a block boundary — which cross-checks the size table below.
const PAINTING_SIZE = {
  Kebab: [1, 1], Aztec: [1, 1], Alban: [1, 1], Aztec2: [1, 1], Bomb: [1, 1], Plant: [1, 1], Wasteland: [1, 1],
  Pool: [2, 1], Courbet: [2, 1], Sea: [2, 1], Sunset: [2, 1], Creebet: [2, 1],
  Wanderer: [1, 2], Graham: [1, 2], prairie_ride: [1, 2],
  Match: [2, 2], Bust: [2, 2], Stage: [2, 2], Void: [2, 2], SkullAndRoses: [2, 2], Wither: [2, 2],
  Fighters: [4, 2], Pointer: [4, 4], Pigscene: [4, 4], BurningSkull: [4, 4], Skeleton: [4, 3], DonkeyKong: [4, 3],
};
const paintings = ents.filter((e) => id(e) === 'minecraft:painting');
const motifs = [];
for (const e of paintings) {
  const motif = e.v.Motif.v, size = PAINTING_SIZE[motif];
  if (!size) { console.log('  (skipping unknown motif ' + motif + ')'); continue; }
  const [px, py] = [e.v.Pos.v[0].v, e.v.Pos.v[1].v];
  const evenW = Math.abs(px % 1) < 1e-6, evenH = Math.abs(py % 1) < 1e-6;
  if (evenW !== (size[0] % 2 === 0) || evenH !== (size[1] % 2 === 0)) throw new Error('painting size mismatch for ' + motif);
  if (!motifs.some((m) => m.motif === motif)) motifs.push({ motif, w: size[0], h: size[1] });
}

// professional villagers: one adult per profession, with the whole trade table
// (every profession's Offers already hold the trades for all five levels)
const profs = {};
for (const e of ents.filter((x) => id(x) === 'minecraft:villager_v2' && x.v.Offers && defs(x).includes('+adult'))) {
  const path = e.v.TradeTablePath && e.v.TradeTablePath.v;
  if (!path) continue;
  const name = path.split('/').pop().replace('_trades.json', '');
  if (!profs[name] || (profs[name].v.TradeTier.v > 0 && e.v.TradeTier.v === 0)) profs[name] = e;
}
const tierExp = (() => {
  const any = Object.values(profs)[0];
  return any ? any.v.Offers.v.TierExpRequirements.v.map((c) => Object.values(c.v)[0].v) : [0, 10, 70, 150, 250];
})();
if (!golem || !villager || !cat || !panda) throw new Error('templates not found');
if (files.length > 1 && (!cow || !pig || !chicken || !sheep)) throw new Error('farm animal templates not found');

const ser = (t) => {
  if (t.t === 4) return `{t:4,v:${JSON.stringify(t.v.toString())}}`;
  if (t.t === 10) return `{t:10,v:{${Object.entries(t.v).map(([k, c]) => `${JSON.stringify(k)}:${ser(c)}`).join(',')}}}`;
  if (t.t === 9) return `{t:9,et:${t.et},keepEt:true,v:[${t.v.map(ser).join(',')}]}`;
  return `{t:${t.t},v:${JSON.stringify(t.v)}}`;
};
const out = `// engine/entity-templates.js — GENERATED by tools/extract-templates.js from a
// structure saved in Bedrock (InventoryVersion ${villager.v.InventoryVersion ? villager.v.InventoryVersion.v : '?'}). Real entity NBT from the game,
// so every field is one Bedrock itself writes. Do not edit by hand.
// Longs are stored as strings and turned into BigInt by hydrate().
export const GOLEM = ${ser(golem)};
export const VILLAGER = ${ser(villager)};
export const CAT = ${ser(cat)};
export const PANDA = ${ser(panda)};
export const CAT_COATS = ${JSON.stringify(coats)};
export const COW = ${cow ? ser(cow) : 'null'};
export const PIG = ${pig ? ser(pig) : 'null'};
export const CHICKEN = ${chicken ? ser(chicken) : 'null'};
export const SHEEP = ${sheep ? ser(sheep) : 'null'};
export const SHEEP_COATS = ${JSON.stringify(sheepCoats)};
export const PAINTING = ${paintings.length ? ser(paintings[0]) : 'null'};
export const PAINTING_MOTIFS = ${JSON.stringify(motifs)};
export const PROFESSIONS = {${Object.entries(profs).map(([k, e]) => `${JSON.stringify(k)}:${ser(e)}`).join(',')}};
export const TIER_EXP = ${JSON.stringify(tierExp)};
export function hydrate(t) {
  if (t.t === 4) return { t: 4, v: BigInt(t.v) };
  if (t.t === 10) { const v = {}; for (const k of Object.keys(t.v)) v[k] = hydrate(t.v[k]); return { t: 10, v }; }
  if (t.t === 9) return { t: 9, et: t.et, keepEt: true, v: t.v.map(hydrate) };
  return { t: t.t, v: Array.isArray(t.v) ? t.v.slice() : t.v };
}
`;
writeFileSync(new URL('../engine/entity-templates.js', import.meta.url), out);
console.log('golem', Object.keys(golem.v).length, 'keys · villager', Object.keys(villager.v).length,
  '· cat', Object.keys(cat.v).length, defs(cat).join(' '), '· panda', defs(panda).join(' '), '· coats', JSON.stringify(coats));
console.log('paintings:', motifs.map((m) => `${m.motif} ${m.w}x${m.h}`).join(', ') || 'none');
console.log('professions:', Object.keys(profs).join(' '), '· tier experience', JSON.stringify(tierExp));
console.log('farm:', [cow, pig, chicken, sheep].map((e) => e ? id(e) + ' [' + defs(e).join(' ') + ']' : 'missing').join('\n      '),
  '\nsheep coats', JSON.stringify(sheepCoats));
