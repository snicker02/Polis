// tools/checks/2zb-chunk-pregen.js — the Chunk Pregen pack that Polis hands out.
//
// Bedrock only saves chunks that changed since generation, so explored-looking
// ground is often missing from an export. Polis embeds the Chunk Pregen
// behaviour pack (pregen/ -> engine/pregen-pack.js), builds the .mcpack in the
// browser and gives the /scriptevent command for a site. This checks the
// embedded copy is current, both builds are well-formed, every script parses
// and resolves its imports, and the commands cover what they claim to.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const id = '2zb';
export const label = '2zb. Chunk Pregen pack (embedded)';

export default async function run(ctx) {
  const { check, note, ROOT, deflateRaw } = ctx;
  const { collectPregen, renderModule } = await import('../embed-pregen.js');
  const P = await import('../../engine/pregen.js');
  const { readZipEntries } = await import('../../engine/worldfile.js');

  // the embedded module is exactly what the generator makes from pregen/
  const expected = renderModule(collectPregen());
  const actual = fs.readFileSync(path.join(ROOT, 'engine', 'pregen-pack.js'), 'utf8');
  check('engine/pregen-pack.js matches pregen/ (run node tools/embed-pregen.js after editing it)', actual === expected);

  for (const legacy of [false, true]) {
    const tag = legacy ? 'legacy' : 'current';
    const files = P.pregenFiles(legacy);
    const byName = new Map(files.map((f) => [f.name, f.data]));
    const man = JSON.parse(new TextDecoder().decode(byName.get('manifest.json')));
    const dep = man.dependencies.find((d) => d.module_name === '@minecraft/server');
    check(`${tag}: manifest targets Script API ${legacy ? '2.0.0' : '2.6.0'}`, dep && dep.version === (legacy ? '2.0.0' : '2.6.0'), dep && dep.version);
    check(`${tag}: pack version matches PREGEN_VERSION ${P.PREGEN_VERSION}`, man.header.version.join('.') === P.PREGEN_VERSION);
    check(`${tag}: no stray legacy manifest inside the pack`, !byName.has('manifest.legacy.json'));
    const entry = man.modules.find((m) => m.type === 'script').entry;
    check(`${tag}: script entry ${entry} is in the pack`, byName.has(entry));
    const png = byName.get('pack_icon.png');
    check(`${tag}: pack icon is a PNG`, png && png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47);

    // zip round trip with Polis's own reader
    const zip = await P.buildPregenPack(legacy, { deflateRaw });
    const z = readZipEntries(zip);
    const same = z.entries.length === files.length && z.entries.every((e) => {
      const want = byName.get(e.name), got = z.read(e);
      return want && want.length === got.length && want.every((b, i) => b === got[i]);
    });
    check(`${tag}: .mcpack unzips to the same ${files.length} files`, same);
    check(`${tag}: file name carries the version`, P.pregenFileName(legacy) === `chunk-pregen-v${P.PREGEN_VERSION}${legacy ? '-legacy' : ''}.mcpack`);

    // every script parses, and every relative import points at a file in the pack
    if (!legacy) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pregen-'));
      let bad = [], missing = [];
      for (const [name, data] of byName) {
        if (!name.endsWith('.js')) continue;
        const p = path.join(dir, name);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, data);
        const src = new TextDecoder().decode(data);
        for (const m of src.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(name), m[1]));
          if (!byName.has(target)) missing.push(`${name} -> ${m[1]}`);
        }
      }
      for (const name of byName.keys()) {
        if (!name.endsWith('.js')) continue;
        const r = spawnSync(process.execPath, ['--check', path.join(dir, name)], { encoding: 'utf8' });
        if (r.status !== 0) bad.push(name);
      }
      fs.rmSync(dir, { recursive: true, force: true });
      const nScripts = [...byName.keys()].filter((n) => n.endsWith('.js')).length;
      check(`every pack script parses (${nScripts})`, bad.length === 0, bad.join(', '));
      check('every relative import resolves inside the pack', missing.length === 0, missing.join(', '));
      const areaSrc = new TextDecoder().decode(byName.get('scripts/areaMode.js'));
      check('the pack marks chunks so Bedrock saves them', /markRect/.test(areaSrc));
    }
  }

  // commands: whole chunks, cover the site plus margin, and in the pack's syntax
  const site = { x0: -562613, z0: -192139, size: 160 };
  const r = P.siteRegion(site);
  const aligned = [r.x0, r.z0].every((v) => ((v % 16) + 16) % 16 === 0) && [r.x1, r.z1].every((v) => ((v % 16) + 16) % 16 === 15);
  check('site region snaps to whole chunks', aligned, JSON.stringify(r));
  check('site region covers the site plus a 16-block margin',
    r.x0 <= site.x0 - 16 && r.z0 <= site.z0 - 16 && r.x1 >= site.x0 + site.size - 1 + 16 && r.z1 >= site.z0 + site.size - 1 + 16, JSON.stringify(r));
  check('site region is no bigger than one chunk of slack per side', P.regionChunks(r) <= Math.pow(160 / 16 + 4, 2), String(P.regionChunks(r)));
  const cmd = P.pregenCommand(r);
  check('command is the pack\'s area syntax', /^\/scriptevent pregen:area -?\d+ -?\d+ -?\d+ -?\d+$/.test(cmd), cmd);
  const v = P.viewRegion([-35163, -12009], 16);
  check('map-view region is exactly the chunks shown', P.regionChunks(v) === 32 * 32 && v.x0 === (-35163 - 16) * 16 && v.z1 === (-12009 + 16) * 16 - 1, JSON.stringify(v));

  // the page has every control the pregen code uses
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const ids = ['pregenBox', 'pregenDl', 'pregenDlLegacy', 'pregenSite', 'pregenView'];
  check('index.html has the pregen panel controls', ids.every((i) => html.includes(`id="${i}"`)), ids.filter((i) => !html.includes(`id="${i}"`)).join(','));
  // the real app, booted against a stub browser with a Bedrock world loaded
  const { runUiCheck } = await import('../ui-check.mjs');
  const { makeBedrockWorld } = await import('../make-bedrock-world.mjs');
  const worldPath = path.join(os.tmpdir(), `polis-bedrock-${process.pid}.mcworld`);
  fs.writeFileSync(worldPath, makeBedrockWorld());
  let ui = null;
  try { ui = await runUiCheck(worldPath); } catch (e) { ui = { problems: [String(e)] }; }
  try { fs.unlinkSync(worldPath); } catch { /* scratch */ }
  check('app: a Bedrock world loads and boots with no errors', ui && ui.problems.length === 0 && /1,024 chunks read/.test(ui.status || ''), (ui.problems || []).join('; ') || ui.status);
  const pg = ui.pregen || {};
  check('app: the pregen panel shows for a Bedrock world', pg.shown === true);
  check('app: with a site chosen, the site command button shows its chunk count', pg.siteShown && /this site \(\d+ chunks\)/.test(pg.siteLabel || ''), pg.siteLabel);
  check('app: the map-view button shows its chunk count', /map view \([\d,]+ chunks\)/.test(pg.viewLabel || ''), pg.viewLabel);
  const [siteCmd, viewCmd] = pg.copied || [];
  check('app: the site button copies a pregen:area command', /^\/scriptevent pregen:area -?\d+ -?\d+ -?\d+ -?\d+$/.test(siteCmd || ''), siteCmd);
  check('app: the map-view button copies a different, larger command', /^\/scriptevent pregen:area/.test(viewCmd || '') && viewCmd !== siteCmd, viewCmd);
  const dls = pg.downloads || [];
  const mans = dls.map((d) => { try { const z = readZipEntries(d); const e = z.entries.find((x) => x.name === 'manifest.json'); return JSON.parse(new TextDecoder().decode(z.read(e))); } catch { return null; } });
  check('app: both download buttons produce an .mcpack', dls.length === 2 && mans.every(Boolean), `${dls.length} files`);
  check('app: one is the current build and one the legacy build',
    mans.length === 2 && mans.every(Boolean) && mans.map((m) => m.dependencies[0].version).sort().join(',') === '2.0.0,2.6.0');

  // a Java world: the panel stays hidden (the pack is Bedrock-only)
  const { makeRegion, makeLevelDat } = await import('../make-java-world.mjs');
  const { makeZip } = await import('../../engine/blockcore.js');
  const jzip = await makeZip([
    { name: 'level.dat', data: new Uint8Array(makeLevelDat('J', [0, 70, 0])) },
    { name: 'region/r.0.0.mca', data: new Uint8Array(makeRegion(0, 0, () => 66)) },
  ], { deflateRaw });
  const jPath = path.join(os.tmpdir(), `polis-java-${process.pid}.zip`);
  fs.writeFileSync(jPath, Buffer.from(jzip));
  let uj = null;
  try { uj = await runUiCheck(jPath); } catch (e) { uj = { problems: [String(e)] }; }
  try { fs.unlinkSync(jPath); } catch { /* scratch */ }
  check('app: the pregen panel stays hidden for a Java world', uj && uj.pregen && uj.pregen.shown === false, JSON.stringify(uj && uj.pregen));

  // a world whose LevelDB is all in the log is still recognised as Bedrock
  const { worldKind } = await import('../../engine/javaworld.js');
  const { writeLog, writeZip, chunkKey, data3d } = await import('../make-bedrock-world.mjs');
  const logOnly = writeZip([['db/000003.log', writeLog([{ seq: 1, ops: [[chunkKey(0, 0, 43), data3d(70)]] }])]]);
  check('a world with only a LevelDB log is recognised as Bedrock', worldKind(logOnly) === 'bedrock');
  note(`Chunk Pregen v${P.PREGEN_VERSION} embedded; site command ${cmd}`);
}
