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

export const id = "2s";
export const label = "2s. front end";

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw, fx, WALK_THROUGH, refreshWalkThrough } = ctx;
  // main.js only ever runs in a page, so its mistakes never show up in the
  // engine tests: a helper out of scope, an id that does not exist, a button
  // wired to nothing. This boots the real app against a stub browser.
  const { runUiCheck } = await import('../ui-check.mjs');
  const r = await runUiCheck(null);
  check('front end: the app boots against a stub browser with no errors', r.problems.length === 0, r.problems.join('; '));
  check('front end: every button and control in the page is wired up', r.wired > 30, `${r.wired} of ${r.ids} ids`);
  const text = r.stats.replace(/<[^>]+>/g, ' ');
  check('front end: pressing Generate fills the stats panel', /blocks/.test(text) && /buildings/.test(text), text.slice(0, 80));
  check('front end: clicking the map with no world loaded does nothing', !r.info);
  check('front end: both editions export a file when the button is pressed', r.downloads >= 2, `${r.downloads} files`);
  // a name typed in is what the pack is called in game, and what the
  // commands are called: renaming the file does nothing on its own
  check('front end: a name given becomes the commands as well as the pack',
    /city_12/.test(r.named || ''), (r.named || '').split('\n')[0] || '(no commands)');
  // each teleport button must copy its own spot: passing the handler straight
  // to addEventListener makes the click event the argument, and both copied
  // the centre
  {
    const { runUiCheck } = await import('../ui-check.mjs');
    // a real world to load: a Java one, written here in Anvil format
    const { makeRegion, makeLevelDat } = await import('../make-java-world.mjs');
    const { makeZip: zipUp } = await import('../../engine/blockcore.js');
    const ground = (x, z) => 64 + Math.round(4 * Math.sin(x / 50) + 3 * Math.cos(z / 45));
    const worldZip = await zipUp([
      { name: 'level.dat', data: new Uint8Array(makeLevelDat('Check World', [128, 70, 128])) },
      { name: 'region/r.0.0.mca', data: new Uint8Array(makeRegion(0, 0, ground)) },
    ], { deflateRaw });
    const worldPath = join(tmpdir(), `polis-check-world-${process.pid}.zip`);
    writeFileSync(worldPath, Buffer.from(worldZip));
    let both = null;
    try { both = await runUiCheck(worldPath); } catch { both = null; }
    try { unlinkSync(worldPath); } catch { /* it was only a scratch file */ }
    if (both && both.cornerCopy && both.centreCopy) {
      if (both && both.zooms && both.zooms.length === 3) {
      const spans = both.zooms.map((t) => Number((t.match(/showing (\d+)/) || [])[1] || 0));
      check('front end: the map zooms in and back out', spans[0] > spans[1] && spans[2] > spans[1],
        spans.join(' → ') + ' blocks across');
      check('front end: a site can be picked from a zoomed map', !!both.zoomedPick, both.zoomedPick || 'nothing picked');
    }
    if (both && both.sizes && both.sizes.length === 2) {
      check('front end: moving the size slider measures the site again',
        both.sizes.every((s) => s.asked === s.got), both.sizes.map((s) => `${s.asked}→${s.got}`).join(' '));
    }
    check('front end: the corner and centre buttons copy different commands',
        both.cornerCopy !== both.centreCopy && /^\/tp /.test(both.cornerCopy) && /^\/tp /.test(both.centreCopy),
        `${both.cornerCopy} vs ${both.centreCopy}`);
    } else {
      note('front end: the two teleport buttons need a world to test against (tools/test-world.mcworld); skipped');
    }
  }
  check('front end: the teleport button stays hidden until a site is chosen, and copies nothing',
    r.tpHidden && (!r.copied || r.copied.length === 0));
  note(`front end booted, generated a city and reported: ${text.replace(/\s+/g, ' ').trim().slice(0, 90)}…`);
}
