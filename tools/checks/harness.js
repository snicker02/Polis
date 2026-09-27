// tools/checks/harness.js — the bookkeeping the section modules share.
//
// One monolithic validate.js used to hold both the checks and the counters.
// The counters live here now, so a run can cover any subset of the sections
// and still report honestly: every run writes a shard (counts, failures and
// per-section times) and tools/combine.js adds the shards up. A section is
// timed and its time printed the moment it finishes, so a slow one is
// obvious while the run is still going rather than after it.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import zlib from 'node:zlib';

import { MATERIALS } from '../../engine/materials.js';
import { makeFixtures } from './fixtures.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const BOLD = '\x1b[1m', DIM = '\x1b[2m', RED = '\x1b[31m', GREEN = '\x1b[32m', OFF = '\x1b[0m';

export function makeHarness() {
  let pass = 0, fail = 0;
  const failures = [];
  const times = [];
  const sections = [];

  // block names a player or mob can stand inside (doors, flowers, crops,
  // rails, carpet): taken from the registry, so a new plant can never be
  // missed
  const WALK_THROUGH = new Set();
  function refreshWalkThrough() {
    for (let i = 0; i < MATERIALS.length; i++) if (MATERIALS.def(i).passable) WALK_THROUGH.add(MATERIALS.def(i).block);
  }

  let current = null;

  function check(name, cond, detail) {
    if (cond) { pass++; if (current) current.pass++; return true; }
    fail++;
    if (current) current.fail++;
    failures.push((current ? current.id + ' · ' : '') + name + (detail ? ' — ' + detail : ''));
    return false;
  }
  function note(s) { console.log('   ' + s); }

  const ctx = {
    check,
    note,
    ROOT,
    deflateRaw: (b) => new Uint8Array(zlib.deflateRawSync(Buffer.from(b))),
    WALK_THROUGH,
    refreshWalkThrough,
    fx: makeFixtures(),
  };

  // Runs one section module: prints its heading, times it, and prints the
  // time with the section's own tally as soon as it is done.
  async function runSection(mod) {
    current = { id: mod.id, label: mod.label, pass: 0, fail: 0 };
    sections.push(current);
    console.log('\n' + BOLD + mod.label + OFF);
    const t0 = Date.now();
    let error = null;
    try {
      await mod.default(ctx);
    } catch (e) {
      error = e;
      fail++;
      current.fail++;
      failures.push(mod.id + ' · section threw — ' + (e && e.stack ? e.stack.split('\n')[0] : String(e)));
    }
    const ms = Date.now() - t0;
    current.ms = ms;
    times.push({ id: mod.id, label: mod.label, ms });
    const tally = current.fail ? `${RED}${current.fail} failed${OFF}` : `${current.pass} passed`;
    console.log(`   ${DIM}${fmt(ms)} · ${tally}${OFF}`);
    if (error) console.log('   ' + RED + (error.stack || error) + OFF);
    current = null;
    return ms;
  }

  function summary() { return { pass, fail, failures, times, sections }; }

  return { ctx, runSection, summary };
}

export function fmt(ms) {
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  const m = Math.floor(ms / 60000);
  return m + 'm' + String(Math.round((ms - m * 60000) / 1000)).padStart(2, '0') + 's';
}

// Prints the tail every runner ends with. Returns the exit code.
export function report(title, { pass, fail, failures, times }) {
  console.log('\n' + BOLD + title + OFF);
  const slow = times.slice().sort((a, b) => b.ms - a.ms).slice(0, 5);
  if (slow.length) console.log('   ' + DIM + 'slowest: ' + slow.map((t) => `${t.id} ${fmt(t.ms)}`).join(' · ') + OFF);
  console.log(`   ${pass} passed, ${fail} failed`);
  if (fail) {
    for (const f of failures) console.log('   ' + RED + '✗' + OFF + ' ' + f);
    return 1;
  }
  console.log('   ' + GREEN + 'all checks passed' + OFF);
  return 0;
}

export function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
