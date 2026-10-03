// tools/validate.js — headless checks.
//
//   node tools/validate.js                      every section (what it always did)
//   node tools/validate.js --group fast         the sections that finish quickly
//   node tools/validate.js --group slow         the ones that build cities on real ground
//   node tools/validate.js --group slow --part 1/3
//   node tools/validate.js --only 2z,3          named sections
//   node tools/validate.js --list               what there is and how long it took last time
//
// Every run writes a shard under .validate/ holding its counts, its failures
// and its per-section times. `node tools/combine.js` adds the shards up and
// reports the total, so running the suite in pieces gives the same number as
// running it whole. The times are kept and reused to balance --part.
//
// The checks themselves are in tools/checks/, one file per section, listed in
// tools/checks/registry.js. They cover: plan/street legality, door access,
// per-floor reachability, block budget, chunk split coverage, .mcstructure
// NBT round-trip, .mcpack zip round-trip, palette well-formedness,
// greedy-mesher face-area conservation, and a structural lint of the WebGL
// shaders (no glslangValidator here, so the lint checks the things that
// actually break: stage interface mismatches, undeclared identifiers,
// unbalanced blocks, uniform lookup coverage).

import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeHarness, report, fmt, ROOT } from './checks/harness.js';
import { SECTIONS, select, part, splitFixtures } from './checks/registry.js';

const SHARD_DIR = join(ROOT, '.validate');
// (kept with the checks, not in .validate/: that folder is cleared before a
// release is packaged, which used to throw every measurement away)
const TIMES_FILE = join(ROOT, 'tools', 'checks', 'times.json');
const PLAN_FILE = join(SHARD_DIR, 'plan.json');

function parseArgs(argv) {
  const out = { group: 'all', only: null, skip: null, part: null, out: null, list: false, quiet: false, plan: null, batch: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => (argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : argv[++i]);
    if (a === '--list') out.list = true;
    else if (a.startsWith('--group')) out.group = val();
    else if (a.startsWith('--only')) out.only = val().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--skip')) out.skip = val().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--part')) out.part = val();
    else if (a.startsWith('--plan')) out.plan = argv[i].includes('=') ? Number(val()) : (argv[i + 1] && /^\d+$/.test(argv[i + 1]) ? Number(argv[++i]) : 240);
    else if (a.startsWith('--batch')) out.batch = Number(val());
    else if (a.startsWith('--out')) out.out = val();
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--help' || a === '-h') { usage(); process.exit(0); }
    else { console.error('unknown argument: ' + a); usage(); process.exit(2); }
  }
  return out;
}

function usage() {
  console.log(`usage: node tools/validate.js [--group fast|slow|all] [--part k/n] [--only ids] [--skip ids] [--out file]

  --group   which set of sections to run (default: all)
  --plan    [seconds] pack the selected sections into batches that each fit the
            budget (default 240), from the measured times; saves .validate/plan.json
  --batch   run batch k of the saved plan (times measured meanwhile do not move it)
  --part    run only part k of n, balanced by the last run's times
  --only    comma-separated section ids, e.g. --only 2z,3
  --skip    comma-separated section ids to leave out
  --out     where to write this run's shard (default: .validate/<group>[-k-of-n].json)
  --list    print the sections, their group and their last measured time`);
}

function loadTimes() {
  if (!existsSync(TIMES_FILE)) return {};
  try { return JSON.parse(readFileSync(TIMES_FILE, 'utf8')); } catch { return {}; }
}

// Every run writes its sections' times, merged into what is known, except a
// --part run: --part balances its split from these numbers at the moment it is
// run, so rewriting them between part 1 and part 2 would move the boundary.
// --plan avoids that altogether: the batches are worked out once and saved, so
// the times can go on being measured (by --batch, --only, any run) without
// moving anything until the next --plan.
function saveTimes(times) {
  if (args.part) return;
  const known = loadTimes();
  for (const t of times) known[t.id] = t.ms;
  writeFileSync(TIMES_FILE, JSON.stringify(Object.fromEntries(Object.entries(known).sort()), null, 2) + '\n');
}

const args = parseArgs(process.argv.slice(2));

if (args.list) {
  const known = loadTimes();
  const total = { fast: 0, slow: 0 };
  for (const s of SECTIONS) {
    const ms = known[s.id];
    total[s.group] = (total[s.group] || 0) + (ms || 0);
    console.log(`  ${s.id.padEnd(3)} ${s.group.padEnd(5)} ${(ms ? fmt(ms) : '—').padStart(7)}  ${s.file}`);
  }
  console.log(`\n  fast ${fmt(total.fast)} · slow ${fmt(total.slow)} · all ${fmt(total.fast + total.slow)}`);
  process.exit(0);
}

// --plan: first-fit decreasing into batches under the budget; a section with no
// time yet counts as 30 seconds, one bigger than the budget gets a batch to itself
if (args.plan) {
  const budget = args.plan * 1000, known = loadTimes();
  const chosen = select(args).map((s) => ({ id: s.id, ms: known[s.id] || 30000 }));
  chosen.sort((a, b) => b.ms - a.ms);
  const batches = [];
  for (const s of chosen) {
    const fit = batches.find((b) => b.ms + s.ms <= budget);
    if (fit) { fit.ids.push(s.id); fit.ms += s.ms; } else batches.push({ ids: [s.id], ms: s.ms });
  }
  mkdirSync(SHARD_DIR, { recursive: true });
  writeFileSync(PLAN_FILE, JSON.stringify({ group: args.group, budget: args.plan, batches, at: new Date().toISOString() }, null, 2) + '\n');
  batches.forEach((b, i) => console.log(`  batch ${i + 1}: ${fmt(b.ms).padStart(7)}  ${b.ids.join(' ')}`));
  console.log(`\n  ${batches.length} batches of at most ${args.plan}s · run each: node tools/validate.js --batch k · then: node tools/combine.js`);
  process.exit(0);
}

let list = select(args);
let partTag = '';
if (args.batch) {
  if (!existsSync(PLAN_FILE)) { console.error('no saved plan: run node tools/validate.js --plan first'); process.exit(2); }
  const plan = JSON.parse(readFileSync(PLAN_FILE, 'utf8'));
  const b = plan.batches[args.batch - 1];
  if (!b) { console.error(`the plan has ${plan.batches.length} batches`); process.exit(2); }
  list = SECTIONS.filter((s) => b.ids.includes(s.id));
  partTag = `-batch-${args.batch}`;
}
if (args.part) {
  const [k, n] = args.part.split('/').map(Number);
  if (!k || !n || k < 1 || k > n) { console.error('--part wants k/n, e.g. --part 1/3'); process.exit(2); }
  list = part(list, k, n, loadTimes());
  partTag = `-${k}-of-${n}`;
}

if (!list.length) { console.error('nothing selected'); process.exit(2); }

const label = args.batch ? 'batch ' + args.batch : args.only ? 'only ' + args.only.join(',') : args.group;
console.log(`\x1b[2mpolis validate · ${label}${partTag ? ' · part ' + args.part : ''} · ${list.length} of ${SECTIONS.length} sections\x1b[0m`);

const split = splitFixtures(list);
for (const [fixture, where] of split)
  console.log(`\x1b[33m   note: ${fixture} is shared with ${where.out.join(', ')}, which this run leaves out — it will be built twice\x1b[0m`);

const { ctx, runSection, summary } = makeHarness();
const started = Date.now();

for (const s of list) {
  const mod = await import('./checks/' + s.file);
  await runSection({ id: s.id, label: mod.label, default: mod.default });
}

const sum = summary();
const wall = Date.now() - started;
const fixtures = ctx.fx.stats();

const outPath = args.out ? (args.out.startsWith('/') ? args.out : join(ROOT, args.out))
  : join(SHARD_DIR, `${args.batch ? 'plan' : args.only ? 'only' : args.group}${partTag}.json`);
mkdirSync(SHARD_DIR, { recursive: true });
writeFileSync(outPath, JSON.stringify({
  group: args.group, part: args.part || null, only: args.only || null,
  sections: sum.sections, pass: sum.pass, fail: sum.fail, failures: sum.failures,
  times: sum.times, wall, fixtures, at: new Date().toISOString(),
}, null, 2) + '\n');
saveTimes(sum.times);

console.log(`\n\x1b[2m   ${fmt(wall)} total · fixtures ${fixtures.made} built, ${fixtures.reused} reused · shard ${outPath.replace(ROOT + '/', '')}\x1b[0m`);
const code = report(args.group === 'all' && !args.only ? 'result' : `result · ${label}${partTag}`, sum);
if (args.group !== 'all' || args.only) console.log('   \x1b[2mrun the other groups, then: node tools/combine.js\x1b[0m');
process.exit(code);
