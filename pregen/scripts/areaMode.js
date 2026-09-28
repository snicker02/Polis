// AREA mode: force-load the region in batches of ticking areas.
// Backend 1 (preferred): world.tickingAreaManager (@minecraft/server 2.6.0+, Bedrock 26.10+).
//   Uses a per-pack chunk budget, independent of the 10-area /tickingarea limit.
// Backend 2 (legacy): the /tickingarea command (10 areas x 100 chunks per world).
import { world } from "@minecraft/server";
import { chunkRect, tileGrid, tileAt, tileChunkCount } from "./geometry.js";
import { isLoadedAt, probeY } from "./chunks.js";
import { saveJob } from "./store.js";
import { markRect, markY } from "./mark.js";

export const AREA_PREFIX = "pregen_";
export const CMD_MAX_AREAS = 10;
export const CMD_MAX_TILE = 10; // 10x10 = the command's 100-chunk cap

export function errText(e) {
  if (e === undefined || e === null) return "unknown error";
  const msg = e.message ?? String(e);
  return e.reason ? `${msg} (${e.reason})` : msg;
}

export function getManager() {
  try { return world.tickingAreaManager ?? null; } catch { return null; }
}

export function backendName() {
  return getManager() ? "pack ticking areas (Script API)" : "/tickingarea command";
}

class ManagerBackend {
  constructor(dim, tam) {
    this.dim = dim; this.tam = tam; this.gen = 0; this.state = new Map();
    this.label = "the Script API ticking-area manager";
  }
  maxChunks() {
    try { const m = this.tam.maxChunkCount; return Number.isFinite(m) && m > 0 ? m : Infinity; } catch { return Infinity; }
  }
  maxAreas() { return Infinity; }
  maxTileSide() { return 255; }
  beginBatch() { this.gen++; this.state = new Map(); }
  add(k, from, to) {
    const opts = { dimension: this.dim, from, to };
    try {
      if (!this.tam.hasCapacity(opts)) {
        let used = "?", max = "?";
        try { used = this.tam.chunkCount; max = this.tam.maxChunkCount; } catch { /* ignore */ }
        return `no room in this pack's ticking-chunk budget (${used}/${max} in use)`;
      }
    } catch (e) { return errText(e); }
    const g = this.gen;
    try {
      const p = this.tam.createTickingArea(AREA_PREFIX + k, opts);
      this.state.set(k, "pending");
      if (p && typeof p.then === "function") {
        p.then(
          () => { if (g === this.gen) this.state.set(k, "loaded"); },
          (e) => { if (g === this.gen) this.state.set(k, "error"); this.lastError = errText(e); });
      }
    } catch (e) { return errText(e); }
    return null;
  }
  loaded(k) { return this.state.get(k) === "loaded"; }
  remove(k) { try { this.tam.removeTickingArea(AREA_PREFIX + k); } catch { /* not present */ } }
  clear() { this.gen++; this.state = new Map(); try { this.tam.removeAllTickingAreas(); } catch { /* ignore */ } }
}

class CommandBackend {
  constructor(dim) { this.dim = dim; this.label = "/tickingarea"; }
  maxChunks() { return CMD_MAX_AREAS * CMD_MAX_TILE * CMD_MAX_TILE; }
  maxAreas() { return CMD_MAX_AREAS; }
  maxTileSide() { return CMD_MAX_TILE; }
  beginBatch() {}
  add(k, from, to) {
    const cmd = `tickingarea add ${from.x} ${from.y} ${from.z} ${to.x} ${to.y} ${to.z} ${AREA_PREFIX}${k}`;
    try {
      const r = this.dim.runCommand(cmd);
      if ((r?.successCount ?? 0) > 0) return null;
      return `"/${cmd}" reported 0 successes. Usually all 10 world ticking-area slots are taken; ` +
        `check /tickingarea list all-dimensions`;
    } catch (e) {
      return `"/${cmd}" failed: ${errText(e)}`;
    }
  }
  loaded() { return false; } // command gives no load signal; chunk probes decide
  remove(k) { try { this.dim.runCommand(`tickingarea remove ${AREA_PREFIX}${k}`); } catch { /* not present */ } }
  clear() { for (let k = 0; k < CMD_MAX_AREAS; k++) this.remove(k); }
}

export function makeBackend(dim) {
  const tam = getManager();
  return tam ? new ManagerBackend(dim, tam) : new CommandBackend(dim);
}

export function clearAreas(dim) { makeBackend(dim).clear(); }
export function finalizeArea(job) { clearAreas(world.getDimension(job.dim)); }

export class AreaRunner {
  constructor(job) {
    this.job = job;
    this.dim = world.getDimension(job.dim);
    this.backend = makeBackend(this.dim);
    this.c = chunkRect(job.rect);
    this.y = probeY(this.dim);
    this.markY = markY(this.dim);
    const maxC = this.backend.maxChunks();
    this.fitSide = Math.max(1, Math.min(job.opts.tile, this.backend.maxTileSide(), Math.floor(Math.sqrt(maxC))));
    this.budget = Math.min(job.opts.budget ?? 1000, maxC);
    this.error = null;
    this.state = "place";
  }

  start() {
    const j = this.job;
    this.backend.clear();
    // Tile index is only meaningful for one tile size; keep it unless the backend can't fit it.
    if (!j.tileSide) j.tileSide = this.fitSide;
    else if (j.tileSide > this.fitSide) {
      j.tileSide = this.fitSide; j.index = 0; j.done = 0; j.skipped = 0;
      this.notice = "Tile size changed for this backend; progress restarted (already-generated chunks load fast).";
    }
    this.tile = j.tileSide;
    this.grid = tileGrid(this.c, this.tile);
    saveJob(j);
    return null;
  }

  tick(now) {
    const j = this.job;

    if (this.state === "place") {
      if (j.index >= this.grid.total) return "done";
      this.backend.beginBatch();
      this.tiles = [];
      this.batchChunks = 0;
      let firstErr = null;
      for (let k = 0; j.index + k < this.grid.total && k < this.backend.maxAreas(); k++) {
        const t = tileAt(this.c, this.tile, j.index + k);
        const n = tileChunkCount(t);
        if (k > 0 && this.batchChunks + n > this.budget) break;
        const err = this.backend.add(k,
          { x: t.cx0 * 16, y: this.y, z: t.cz0 * 16 },
          { x: t.cx1 * 16 + 15, y: this.y, z: t.cz1 * 16 + 15 });
        if (err) { firstErr = err; break; }
        const probes = [];
        for (let cx = t.cx0; cx <= t.cx1; cx++)
          for (let cz = t.cz0; cz <= t.cz1; cz++) probes.push(cx * 16 + 8, cz * 16 + 8);
        this.tiles.push({ k, n, probes, done: false, t });
        this.batchChunks += n;
      }
      if (!this.tiles.length) {
        this.error = `Couldn't create a ticking area via ${this.backend.label}: ${firstErr}`;
        return "paused";
      }
      this.state = "wait";
      this.since = now;
      this.loadedAt = null;
      return "running";
    }

    // wait: a tile is done when the backend says so or every chunk probe answers
    let open = 0;
    for (const t of this.tiles) {
      if (t.done) continue;
      if (this.backend.loaded(t.k)) { t.done = true; continue; }
      const next = [];
      for (let i = 0; i < t.probes.length; i += 2)
        if (!isLoadedAt(this.dim, t.probes[i], t.probes[i + 1], this.y)) next.push(t.probes[i], t.probes[i + 1]);
      t.probes = next;
      if (next.length) open++; else t.done = true;
    }

    if (!open) {
      if (this.loadedAt === null) this.loadedAt = now;
      if (now - this.loadedAt >= j.opts.settle) this.finishBatch();
    } else if (now - this.since >= j.opts.timeout) {
      this.finishBatch();
    }
    return "running";
  }

  finishBatch() {
    const j = this.job;
    let skipped = 0;
    for (const t of this.tiles) {
      if (!t.done) skipped += t.probes.length / 2;
      // mark while still loaded, so Bedrock saves the chunks instead of dropping them
      if (j.opts.mark !== false) {
        const m = markRect(this.dim, t.t.cx0, t.t.cz0, t.t.cx1, t.t.cz1, this.markY);
        j.marked = (j.marked || 0) + m.ok;
        j.markMissed = (j.markMissed || 0) + m.missed;
      }
      this.backend.remove(t.k);
    }
    j.index += this.tiles.length;
    j.done += this.batchChunks - skipped;
    j.skipped += skipped;
    saveJob(j);
    this.state = "place";
  }

  suspend() { this.backend.clear(); }
  cleanup() { this.backend.clear(); }
}
