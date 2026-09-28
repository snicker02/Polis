// Owns the single active job: start/pause/resume/stop, per-tick driving, progress display.
import { world } from "@minecraft/server";
import { AreaRunner, clearAreas, finalizeArea, backendName } from "./areaMode.js";
import { WalkRunner, finalizeWalk } from "./walkMode.js";
import { loadJob, saveJob } from "./store.js";
import { say, actionBar, fmtDuration } from "./log.js";

export const TICK_INTERVAL = 5;
const BAR_EVERY = 20;

let job = null;
let active = null;
let rate = null;
let lastBar = -Infinity;

const unit = (j) => (j.mode === "area" ? "chunks" : "stops");
const processed = (j) => j.done + j.skipped;
const pct = (j) => (j.total ? Math.floor((processed(j) / j.total) * 100) : 100);
const dimName = (id) => id.replace("minecraft:", "").replace("the_end", "end");

export function getJob() { return job; }

export function init() {
  job = loadJob();
  if (!job) return;
  if (!job.paused) {
    job.paused = true;
    job.pauseReason = "the world was closed";
    saveJob(job);
  }
  if (job.mode === "area") {
    try { clearAreas(world.getDimension(job.dim)); } catch { /* ignore */ }
  }
}

function rateInfo(now) {
  if (!rate || now - rate.t <= 0) return { perSec: NaN, eta: NaN };
  const perSec = (processed(job) - rate.d) / ((now - rate.t) / 20);
  return { perSec, eta: perSec > 0 ? (job.total - processed(job)) / perSec : NaN };
}

export function statusText(now, withPause = true) {
  if (!job) return "No pregen job.";
  const j = job;
  let s = `${j.mode} in ${dimName(j.dim)}: ${processed(j)}/${j.total} ${unit(j)} (${pct(j)}%)`;
  if (j.skipped) s += `, ${j.skipped} timed out`;
  if (j.opts.mark !== false && j.marked) s += `, ${j.marked} marked`;
  s += `, active ${fmtDuration(j.activeTicks / 20)}`;
  if (j.paused) { if (withPause) s += `. §ePaused§r (${j.pauseReason})`; }
  else if (now !== undefined) {
    const r = rateInfo(now);
    if (Number.isFinite(r.perSec)) s += `. ${r.perSec.toFixed(1)} ${unit(j)}/s, ETA ${fmtDuration(r.eta)}`;
  }
  return s;
}

function startMessage(j) {
  const r = j.rect;
  const region = `${r.x0},${r.z0} → ${r.x1},${r.z1} in ${dimName(j.dim)}`;
  if (j.mode === "area") {
    return `Area pregen: ${j.total} chunks (${region}) using ${backendName()}. Progress on the action bar.`;
  }
  return `Walk pregen: ${j.total} stops every ${j.opts.step} blocks (${region}) in ${j.opts.gamemode}. ` +
    `You'll be returned to your start point when it finishes or you stop it.`;
}

export function start(newJob, player) {
  if (job) stop({ silent: true });
  job = newJob;
  saveJob(job);
  say(startMessage(job), player);
  resume(player, true);
}

export function resume(player, fresh = false) {
  if (!job) { say("No job to resume.", player); return; }
  if (!job.paused && active) { say("Already running.", player); return; }
  const r = job.mode === "area" ? new AreaRunner(job) : new WalkRunner(job);
  const err = r.start();
  if (err) {
    job.paused = true;
    job.pauseReason = err;
    saveJob(job);
    say(`§c${err}`, player);
    return;
  }
  if (r.notice) say(r.notice, player);
  active = r;
  job.paused = false;
  job.pauseReason = null;
  saveJob(job);
  rate = null;
  if (!fresh) say(`Resumed. ${statusText()}`, player);
}

export function pause(reason, player) {
  if (!job) { say("No job running.", player); return; }
  if (job.paused) { say("Already paused.", player); return; }
  try { active?.suspend(); } catch { /* ignore */ }
  active = null;
  job.paused = true;
  job.pauseReason = reason;
  saveJob(job);
  say(`§ePaused:§r ${reason}\nProgress: ${statusText(undefined, false)}. /scriptevent pregen:resume to continue.`, player);
}

export function stop({ silent = false, player } = {}) {
  if (!job) { if (!silent) say("No job to stop.", player); return; }
  const j = job;
  try {
    if (active) active.cleanup();
    else if (j.mode === "area") finalizeArea(j);
    else finalizeWalk(j);
  } catch { /* ignore */ }
  active = null;
  job = null;
  saveJob(null);
  if (!silent) say(`Stopped at ${processed(j)}/${j.total} ${unit(j)}. Ticking areas removed${j.mode === "walk" ? ", player restored" : ""}.`, player);
}

function finish() {
  const j = job;
  try { active.cleanup(); } catch { /* ignore */ }
  active = null;
  job = null;
  saveJob(null);
  let msg = `§aDone.§r ${j.done} ${unit(j)} completed in ${fmtDuration(j.activeTicks / 20)}`;
  if (j.opts.mark !== false) {
    msg += `, ${j.marked || 0} chunks marked so Bedrock saves them`;
    if (j.markMissed) msg += ` (${j.markMissed} could not be marked)`;
  }
  if (j.skipped) {
    msg += `, ${j.skipped} timed out`;
    if (j.mode === "walk") msg += " (raise render distance or lower step=)";
    else msg += " (rerun the same region to catch them; loaded chunks go fast)";
  }
  say(msg + ".");
  actionBar("§aPregen complete");
}

export function tick(now) {
  if (!job || job.paused || !active) return;
  job.activeTicks += TICK_INTERVAL;
  if (!rate) rate = { t: now, d: processed(job) };

  let result;
  try {
    result = active.tick(now);
  } catch (e) {
    active.error = `script error: ${e}`;
    result = "paused";
  }

  if (result === "done") finish();
  else if (result === "paused") pause(active?.error ?? "stopped");
  else if (now - lastBar >= BAR_EVERY) {
    lastBar = now;
    const r = rateInfo(now);
    const rs = Number.isFinite(r.perSec) ? ` · ${r.perSec.toFixed(1)}/s · ETA ${fmtDuration(r.eta)}` : "";
    actionBar(`§bPregen§r ${pct(job)}% · ${processed(job)}/${job.total} ${unit(job)}${rs}`);
  }
}

export function notifySpawn(player) {
  if (job && job.paused) {
    say(`A pregen job is paused at ${pct(job)}% (${job.pauseReason}). ` +
      `/scriptevent pregen:resume or pregen:stop`, player);
  }
}
