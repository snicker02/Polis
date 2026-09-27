// tools/combine.js — adds the shards from .validate/ into one result.
//
// The suite is run in pieces now, so no single run prints the number that
// matters. This does: it reads every shard, adds the counts, and reports the
// total the way the old one-shot run used to. It also names any section that
// no shard covered, because a green total over half the suite is worse than
// no total at all.
//
//   node tools/validate.js --group fast
//   node tools/validate.js --group slow --part 1/2
//   node tools/validate.js --group slow --part 2/2
//   node tools/combine.js
//
// Shards older than the newest source file are reported as stale: a count
// from before an edit is not evidence about the code as it stands.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fmt } from './checks/harness.js';
import { SECTIONS } from './checks/registry.js';

const SHARD_DIR = join(ROOT, '.validate');
const RED = '\x1b[31m', GREEN = '\x1b[32m', DIM = '\x1b[2m', BOLD = '\x1b[1m', YELLOW = '\x1b[33m', OFF = '\x1b[0m';

if (!existsSync(SHARD_DIR)) {
  console.error(`no ${SHARD_DIR.replace(ROOT + '/', '')} — run node tools/validate.js --group fast first`);
  process.exit(2);
}

const shards = readdirSync(SHARD_DIR)
  .filter((f) => f.endsWith('.json') && f !== 'times.json')
  .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(SHARD_DIR, f), 'utf8')), mtime: statSync(join(SHARD_DIR, f)).mtimeMs }))
  .sort((a, b) => a.mtime - b.mtime);

if (!shards.length) { console.error('no shards in .validate/'); process.exit(2); }

// newest source file: anything older than this was measured against older code
let newestSrc = 0, newestName = '';
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (!/\.(js|mjs|html|json)$/.test(e.name)) continue;
    const m = statSync(p).mtimeMs;
    if (m > newestSrc) { newestSrc = m; newestName = p.replace(ROOT + '/', ''); }
  }
};
walk(join(ROOT, 'engine'));
walk(join(ROOT, 'tools'));
for (const f of ['main.js', 'index.html', 'package.json']) {
  const p = join(ROOT, f);
  if (existsSync(p)) { const m = statSync(p).mtimeMs; if (m > newestSrc) { newestSrc = m; newestName = f; } }
}

let pass = 0, fail = 0, wall = 0;
const failures = [];
const covered = new Map();
const stale = [];

console.log(`\n${BOLD}shards${OFF}`);
for (const s of shards) {
  pass += s.pass; fail += s.fail; wall += s.wall || 0;
  for (const f of s.failures || []) failures.push(f);
  for (const sec of s.sections || []) {
    if (covered.has(sec.id)) failures.push(`${sec.id} · counted twice (${covered.get(sec.id)} and ${s.file})`);
    covered.set(sec.id, s.file);
  }
  const old = s.mtime < newestSrc;
  if (old) stale.push(s.file);
  const tally = s.fail ? `${RED}${s.fail} failed${OFF}` : `${s.pass} passed`;
  console.log(`   ${s.file.padEnd(18)} ${String(s.sections ? s.sections.length : 0).padStart(2)} sections · ${tally} · ${fmt(s.wall || 0)}${old ? YELLOW + '  stale' + OFF : ''}`);
}

const missing = SECTIONS.filter((s) => !covered.has(s.id));

console.log(`\n${BOLD}combined${OFF}`);
console.log(`   ${covered.size}/${SECTIONS.length} sections · ${fmt(wall)} of machine time`);
if (stale.length) {
  console.log(`   ${YELLOW}${stale.length} shard${stale.length > 1 ? 's' : ''} older than ${newestName} — rerun ${stale.join(', ')}${OFF}`);
}
if (missing.length) {
  console.log(`   ${YELLOW}not run: ${missing.map((m) => m.id).join(', ')}${OFF}`);
}
console.log(`   ${pass} passed, ${fail} failed`);
for (const f of failures) console.log('   ' + RED + '✗' + OFF + ' ' + f);

if (fail || failures.length) process.exit(1);
if (missing.length || stale.length) {
  console.log(`   ${YELLOW}incomplete — not a pass${OFF}`);
  process.exit(1);
}
console.log('   ' + GREEN + 'all checks passed' + OFF);
