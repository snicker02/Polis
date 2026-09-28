// engine/pregen.js — Chunk Pregen, handed out by Polis.
//
// Bedrock only saves a chunk once it has changed since it was generated, so
// ground you have only flown over is usually not in the exported world, and
// Polis sees a hole. Chunk Pregen is a behaviour pack that generates a region
// and marks every chunk so the game keeps it. Polis builds the .mcpack in the
// browser from the embedded copy and gives the exact command for a site.
import { PREGEN_VERSION, PREGEN_TEXT, PREGEN_BINARY } from './pregen-pack.js';
import { makeZip } from './blockcore.js';

export { PREGEN_VERSION };

const enc = new TextEncoder();
function b64(s) {
  if (typeof atob === 'function') { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  return new Uint8Array(Buffer.from(s, 'base64'));
}

// The files of the pack. legacy: the build for Bedrock older than 26.10
// (Script API 2.0.0, /tickingarea); otherwise the current one (2.6.0).
export function pregenFiles(legacy = false) {
  const files = [];
  for (const [name, text] of Object.entries(PREGEN_TEXT)) {
    if (name === 'manifest.legacy.json') continue;
    const body = name === 'manifest.json' && legacy ? PREGEN_TEXT['manifest.legacy.json'] : text;
    files.push({ name, data: enc.encode(body) });
  }
  for (const [name, data] of Object.entries(PREGEN_BINARY)) files.push({ name, data: b64(data) });
  return files;
}

export function pregenFileName(legacy = false) {
  return `chunk-pregen-v${PREGEN_VERSION}${legacy ? '-legacy' : ''}.mcpack`;
}

export function buildPregenPack(legacy = false, opts = {}) {
  return makeZip(pregenFiles(legacy), opts);
}

// A region in blocks, widened by a margin and snapped out to whole chunks.
export function pregenRegion(x0, z0, x1, z1, margin = 16) {
  const lo = (v) => Math.floor((v - margin) / 16) * 16;
  const hi = (v) => Math.floor((v + margin) / 16) * 16 + 15;
  return { x0: lo(Math.min(x0, x1)), z0: lo(Math.min(z0, z1)), x1: hi(Math.max(x0, x1)), z1: hi(Math.max(z0, z1)) };
}

export const siteRegion = (site, margin = 16) =>
  pregenRegion(site.x0, site.z0, site.x0 + site.size - 1, site.z0 + site.size - 1, margin);

// what the map is showing: R chunks either side of the centre chunk
export const viewRegion = (near, R) =>
  pregenRegion((near[0] - R) * 16, (near[1] - R) * 16, (near[0] + R) * 16 - 1, (near[1] + R) * 16 - 1, 0);

export const regionChunks = (r) => ((r.x1 - r.x0 + 1) / 16) * ((r.z1 - r.z0 + 1) / 16);

export function pregenCommand(r) {
  return `/scriptevent pregen:area ${r.x0} ${r.z0} ${r.x1} ${r.z1}`;
}
