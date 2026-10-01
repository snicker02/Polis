import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import zlib from 'node:zlib';

import { generateCity, generateSingle, DEFAULTS } from '../../engine/city.js';
import { USE } from '../../engine/plan.js';
import { verifyAll, verifyBuilding } from '../../engine/verify.js';
import { MATERIALS, THEMES, DOOR_KINDS, doorId, MAT, BED_VEC, stairId, cropId, CROP_KINDS, bedId, furnaceId, railId, poweredRailId,
  gateId, chestId, lecternId, smokerId, stonecutterId, pumpkinId, loomId, grindstoneId, bambooId, FLOWERS } from '../../engine/materials.js';
import { BLOCK_VERSION } from '../../engine/blockcore.js';
import { VoxelWorld, splitWorld, buildMcPack } from '../../engine/blockcore.js';
import { buildStructures, placementGuide, CHUNK, exportPack, tileList, functionFiles, GROUND_DROP, cityId, exportSalt, POLIS_VERSION, SUMMON_IDS } from '../../engine/export.js';
import { buildMesh, MAX_QUADS, STRIDE } from '../../engine/mesher.js';
import { decodeNbt, readZip, localPayload } from '../nbt-read.js';
import { decodeTyped } from '../nbt-typed.js';
import { walkCity } from '../../engine/terrain.js';
import { CLOCK_FACE, LANDMARK_NAMES } from '../../engine/landmarks.js';
import { STYLES, remapTable } from '../../engine/styles.js';
import { CAT_COATS, SHEEP_COATS, PAINTING_MOTIFS } from '../../engine/entity-templates.js';

export const id = "6e";
export const label = "6e. versions";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
  const mainV = (readFileSync(join(ROOT, 'main.js'), 'utf8').match(/const VERSION = '([^']+)'/) || [])[1];
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const pageV = (html.match(/data-version="([^"]+)"/) || [])[1];
  const scriptV = (html.match(/main\.js\?v=([\w.]+)/) || [])[1];
  const readmeV = (readFileSync(join(ROOT, 'README.md'), 'utf8').match(/^# Polis v([\w.]+)/m) || [])[1];
  check('versions: package, main.js, engine, page, script tag and README agree',
    [mainV, POLIS_VERSION, pageV, scriptV, readmeV].every((v) => v === pkg),
    `package ${pkg} · main ${mainV} · engine ${POLIS_VERSION} · page ${pageV} · script ${scriptV} · readme ${readmeV}`);
  const r = generateCity({ ...DEFAULTS, size: 96, seed: 12345 });
  check('city id: the same city from two Polis versions gets two ids',
    cityId(r.world, 12345, '0.1.5') !== cityId(r.world, 12345, '0.1.6'));
  check('city id: stable within a version', cityId(r.world, 12345) === cityId(r.world, 12345));
  const out = await exportPack(r.world, { namespace: cityId(r.world, 12345), spawns: r.spawns, deflateRaw });
  check('guide: names all four functions and the Polis version',
    /build_centered/.test(out.guide) && /populate_centered/.test(out.guide) && out.guide.includes(`Polis v${POLIS_VERSION}`));

  // every command in every function is one of the three forms we emit
  const FORMS = [/^structure load [a-z0-9_]+:[a-z0-9_]+ ~-?\d* ~-?\d* ~-?\d*$/,
    /^summon minecraft:(minecart|boat) ~-?\d* ~-?\d* ~-?\d*$/, /^say [^\n]+$/,
    /^summon minecraft:(cod|salmon|tropicalfish) ~-?\d* ~-?\d* ~-?\d* 0 0 polis:keep (Cod|Salmon|Koi)$/,   // kept by the pack's polis:keep event
    /^summon minecraft:(creeper|spider|enderman|witch|pillager|vindicator|evocation_illager|husk|blaze|magma_cube|wither_skeleton|zoglin|zombie_pigman) [A-Za-z]+ ~-?\d* ~-?\d* ~-?\d*$/,   // hostiles, named
    /^kill @e\[type=minecraft:[a-z_]+,name=[A-Za-z]+\]$/,
    // the centre marker: build_centered places it, the other centred functions run from it
    /^kill @e\[type=armor_stand,name=[a-z0-9_]+_centre\]$/,
    /^summon armor_stand [a-z0-9_]+_centre ~ ~ ~$/,
    /^execute at @e\[type=armor_stand,name=[a-z0-9_]+_centre,c=1\] run function [a-z0-9_]+\/[a-z_]+_at_mark$/,
    /^execute unless entity @e\[type=armor_stand,name=[a-z0-9_]+_centre\] run say Polis: .+$/,
    /^tickingarea add ~-?\d* ~-?\d* ~-?\d* ~-?\d* ~-?\d* ~-?\d* [a-z0-9_]+$/, /^tickingarea remove [a-z0-9_]+$/];
  let badCmd = null;
  for (const f of out.functions) for (const l of f.text.split('\n')) {
    if (!l || l.startsWith('#')) continue;
    if (!FORMS.some((re) => re.test(l))) badCmd = badCmd || `${f.name}: ${l}`;
  }
  check('functions: every command is a known-good form (a bad line makes Bedrock drop the whole function)', !badCmd, badCmd);

  // the no-cache dev server really sends no-store
  const { spawn } = await import('node:child_process');
  const port = 18000 + Math.floor(Math.random() * 1000);
  const srv = spawn(process.execPath, [join(ROOT, 'tools/serve.js'), String(port)], { stdio: 'ignore' });
  let hdr = null, body = '';
  for (let i = 0; i < 40 && !hdr; i++) {
    await new Promise((res) => setTimeout(res, 100));
    try { const r2 = await fetch(`http://localhost:${port}/`); hdr = r2.headers.get('cache-control'); body = await r2.text(); } catch { /* not up yet */ }
  }
  srv.kill();
  check('serve.js: serves index.html with caching off', hdr === 'no-store' && body.includes('data-version'), String(hdr));
}
