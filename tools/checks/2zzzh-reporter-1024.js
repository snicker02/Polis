// tools/checks/2zzzh-reporter-1024.js — the reporter's first 1024 city (0.79.0): seed 451601642,
// square, Overgrown ruins with every style mixed, rails, every landmark and option on, all four
// grounds beside it, a bridge coming in from another city to the south, 1000 villagers asked.
//
// - the metro: its cross lines find no avenue near the middle all street, so it is the loop alone;
//   its stations come up the streets that cross over it (0.78.0 had none: the flights only ran
//   along the line, coming up under buildings). Every station has its stairs;
// - the four grounds all built, none on the south (the other city stands there): the theme park,
//   whose home is the south, shares a side with another ground rather than pushing one off its
//   own; the arena east and the university west kept; no two overlapping;
// - a thousand villagers asked: a thousand (near enough: one to a bed), and with ten golems to
//   every ten villagers, near a thousand iron golems (no longer capped at sixty);
// - the page's villager slider goes to 1000.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const id = '2zzzh';
export const label = '2zzzh. the reporter\'s 1024 city: metro stairs, the grounds\' sides, villagers';

export default async function run(ctx) {
  const { check, note, ROOT } = ctx;
  const { generateCity, DEFAULTS } = await import('../../engine/city.js');
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const m = /id="villagers"[^>]*max="(\d+)"/.exec(html);
  check('the villager slider goes to 1000', !!m && m[1] === '1000', m ? m[1] : 'none');

  const saved = { terrainBreaks: true, seed: '451601642', size: '1024', cityStyle: 'ruins', mixStyles: true, transit: 'rails', outline: 'square', hills: '0',
    wallHeight: '3', minBlock: '10', blockIrregularity: '1', avenueWidth: '5', streetWidth: '3', downtownRadius: '0.38', zoneNoise: '2', parkChance: '0.12',
    lotDowntown: '20', lotSuburb: '10', twistChance: '0.25', courtyardChance: '0.3', pitch: '5', stairStyle: 'wide', setbackEvery: '7', maxFloors: '9',
    setback: true, roofAccess: true, useStairs: true, lights: true, lifts: true, lamps: true, trees: true, markings: true, landmarks: true, canal: true,
    harbour: true, bridges: true, detail: true, streetSigns: true, farmChance: '0.2', pondChance: '0.5', golemsPer10: '10', villagers: '1000', furnish: true,
    flowers: true, fish: true, megaliths: true, underground: true, metro: true, jail: true, zoo: true, museum: true, hospital: true, firestation: true,
    police: true, theatre: true, hotel: true, factory: true, park: true, waterpark: true, garden: true, mall: true, watertower: true, petrol: true,
    skatepark: true, wizard: true, nightclub: true, bank: true, sports: true, bouts: true, themepark: true, arena: true, university: true, airport: true,
    station: true, memorial: 'Don 1930-2023\nMary 1935-2026' };
  const cfg = { ...DEFAULTS };
  for (const [k, v] of Object.entries(saved)) if (k in DEFAULTS) cfg[k] = typeof DEFAULTS[k] === 'number' ? Number(v) : v;
  cfg.seed = 451601642;
  cfg.mixList = ['modern', 'desert', 'snowy', 'cherry', 'medieval', 'village', 'nether', 'eastasian', 'fortress', 'venetian', 'artdeco', 'glass', 'steampunk',
    'santorini', 'cyberpunk', 'sunken', 'mesoamerican', 'moorish', 'elven', 'endcity', 'dwarven', 'brutalist', 'classical', 'gothic', 'nordic', 'byzantine',
    'western', 'victorian', 'googie', 'copper', 'mushroom', 'icepalace', 'crystal', 'ruins'];
  cfg.joinTo = { side: 'north', end: [0, 0, 0], name: 'Crystal', ctag: 'crystal', ns: 'crystal_e9ed' };      // its north bridge: this city to the north of it
  const r = generateCity(cfg);

  const M = r.metro, st = M ? M.lines.flatMap((l) => l.stations) : [];
  check('the metro: a loop round the middle, its stations up the streets crossing over it, every one with its stairs (eight and more)',
    !!M && M.lines.some((l) => l.ring) && st.length >= 8 && st.every((s) => s.stairs) && M.lines.every((l) => l.flights >= l.stations.length),
    `${M ? M.lines.length : 0} lines, ${st.length} stations, ${st.filter((s) => s.stairs).length} with stairs`);
  const G = Object.fromEntries(['airport', 'themepark', 'arena', 'university'].map((k) => [k, r.landmarks.find((q) => q.kind === k)]));
  const all = Object.values(G).every(Boolean);
  const overlap = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.z0 <= b.z1 && b.z0 <= a.z1;
  const gs = Object.values(G).filter(Boolean);
  check('the four grounds all built, none on the south (the bridge comes in there, the other city beyond it), no two overlapping',
    all && gs.every((g) => g.side !== 'south') && gs.every((g, i) => gs.every((h, j) => i >= j || !overlap(g.lot, h.lot))) && r.joinFrom && r.joinFrom.side === 'south',
    gs.map((g) => `${g.kind} ${g.side}`).join(', '));
  check('the theme park shares a side with another ground; the airport north, the arena east and the university west kept',
    all && G.airport.side === 'north' && G.arena.side === 'east' && G.university.side === 'west' && gs.some((g) => g !== G.themepark && g.side === G.themepark.side),
    gs.map((g) => `${g.kind} ${g.side}`).join(', '));
  const vill = r.spawns.filter((p) => p.type === 'villager' && !p.group).length, golems = r.spawns.filter((p) => p.type === 'golem' && !p.group).length;
  check('a thousand villagers asked, a thousand in the city (near enough); ten golems to ten villagers, near a thousand iron golems', vill >= 950 && golems >= 900, `${vill} villagers, ${golems} golems`);
  note(`reporter's 1024: ${st.length} stations; ${gs.map((g) => `${g.kind} ${g.side}`).join(', ')}; ${vill} villagers, ${golems} golems`);
}
