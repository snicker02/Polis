// WALK mode: teleport the player along a serpentine grid and wait at each stop until
// the surrounding chunks are loaded. Slower than AREA, but maps held by the player fill in.
import { world } from "@minecraft/server";
import { walkGrid, walkPointAt } from "./geometry.js";
import { isLoadedAt, probeY } from "./chunks.js";
import { runCmd } from "./cmd.js";
import { saveJob } from "./store.js";
import { applyRestore, deferRestore } from "./restore.js";
import { markRect, markY } from "./mark.js";
import { toChunk } from "./geometry.js";

export function findPlayer(job) {
  const ps = world.getAllPlayers();
  return ps.find((p) => p.id === job.playerId) ?? ps.find((p) => p.name === job.playerName);
}

export function defaultWalkY(dim) {
  try { return Math.min(200, dim.heightRange.max - 8); } catch { return 200; }
}

export function finalizeWalk(job) {
  const p = findPlayer(job);
  if (p) applyRestore(p, job.restore);
  else deferRestore(job.restore);
}

export class WalkRunner {
  constructor(job) {
    this.job = job;
    this.dim = world.getDimension(job.dim);
    this.grid = walkGrid(job.rect, job.opts.step);
    this.y = job.opts.y ?? defaultWalkY(this.dim);
    this.py = probeY(this.dim);
    this.markY = markY(this.dim);
    this.state = "move";
    this.error = null;
  }

  start() {
    const p = findPlayer(this.job);
    if (!p) return `${this.job.playerName} is not online`;
    runCmd(p, `gamemode ${this.job.opts.gamemode} @s`);
    return null;
  }

  tp(p) {
    try {
      p.teleport({ x: this.pt.x + 0.5, y: this.y, z: this.pt.z + 0.5 }, { dimension: this.dim });
    } catch { /* retried next tick */ }
  }

  tick(now) {
    const j = this.job;
    const p = findPlayer(j);
    if (!p) { this.error = `${j.playerName} left the world`; return "paused"; }

    if (this.state === "move") {
      if (j.index >= this.grid.total) return "done";
      this.pt = walkPointAt(j.rect, j.opts.step, j.index);
      this.tp(p);
      this.since = now;
      this.state = "wait";
      return "running";
    }

    const el = now - this.since;
    if (j.opts.gamemode !== "spectator") this.tp(p); // creative players fall; hold altitude
    if (el < j.opts.minDwell) return "running";

    const h = Math.floor(j.opts.step / 2);
    const { x, z } = this.pt;
    const ok = [[0, 0], [-h, -h], [h, -h], [-h, h], [h, h]]
      .every(([dx, dz]) => isLoadedAt(this.dim, x + dx, z + dz, this.py));

    if (ok || el >= j.opts.maxDwell) {
      if (ok) j.done++; else j.skipped++;
      // mark this stop's chunks (clipped to the region) so Bedrock saves them
      if (j.opts.mark !== false) {
        const r = j.rect;
        const m = markRect(this.dim,
          Math.max(toChunk(x - h), toChunk(r.x0)), Math.max(toChunk(z - h), toChunk(r.z0)),
          Math.min(toChunk(x + h - 1), toChunk(r.x1)), Math.min(toChunk(z + h - 1), toChunk(r.z1)), this.markY);
        j.marked = (j.marked || 0) + m.ok;
        j.markMissed = (j.markMissed || 0) + m.missed;
      }
      j.index++;
      saveJob(j);
      this.state = "move";
    }
    return "running";
  }

  suspend() { /* leave the player where they are */ }
  cleanup() { finalizeWalk(this.job); }
}
