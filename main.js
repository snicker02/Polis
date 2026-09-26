// main.js — Polis UI.

import { generateCity, generateSingle, DEFAULTS } from './engine/city.js';
import { USE } from './engine/plan.js';
import { verifyAll } from './engine/verify.js';
import { buildMesh } from './engine/mesher.js';
import { VoxelWorld } from './engine/blockcore.js';
import { Renderer } from './engine/renderer.js';
import { exportPack, exportStructuresZip, tileList, commandList, cityId, exportSalt, POLIS_VERSION } from './engine/export.js';
import { readWorld, readLevelDat, siteGround, findSites, SEA_LEVEL } from './engine/worldfile.js';
import { javaTiles, javaPackFiles } from './engine/export-java.js';
import { readJavaWorld, readJavaLevelDat, worldKind } from './engine/javaworld.js';
import { exactGround } from './engine/bedrockblocks.js';
import { makeZip } from './engine/blockcore.js';
import { decodeNbt } from './tools/nbt-read.js';
import { THEMES } from './engine/materials.js';

const VERSION = '0.14.0';
const $ = (id) => document.getElementById(id);
const numVal = (id) => Number($(id).value);      // readCfg has its own local num()

const SLIDERS = {
  size: 0, minBlock: 0, blockIrregularity: 2, avenueWidth: 0, streetWidth: 0,
  downtownRadius: 2, zoneNoise: 2, parkChance: 2, lotDowntown: 0, lotSuburb: 0,
  maxFloors: 0, pitch: 0, setbackEvery: 0, bw: 0, bd: 0, floors: 0, clip: 0,
  farmChance: 2, pondChance: 2, villagers: 0, wallHeight: 0, foundation: 0, clearAbove: 0, hills: 0, golemsPer10: 0,
};
const CHECKS = ['setback', 'roofAccess', 'useStairs', 'lights', 'lamps', 'trees', 'markings', 'landmarks', 'canal', 'harbour', 'bridges', 'detail', 'streetSigns'];

let renderer = null;
let result = null;       // { world, plan, buildings, cfg, stats }
let verification = null;
let focal = [0.5, 0.5];
let busyDepth = 0;

// ---- boot -------------------------------------------------------------------
// Browsers cache ES modules aggressively. If index.html, main.js and the
// engine disagree about the version, some files are stale copies and an
// export would silently use old code — so say so and refuse to export.
function staleFiles() {
  const page = document.body.dataset.version;
  if (page === VERSION && POLIS_VERSION === VERSION) return null;
  return `Mixed versions loaded (page ${page || '?'}, app ${VERSION}, engine ${POLIS_VERSION}). ` +
    'Your browser is using cached copies of old files. Hard-refresh the page ' +
    '(Ctrl+Shift+R, or Cmd+Shift+R on a Mac), or serve it with  node tools/serve.js';
}

function boot() {
  const stale = staleFiles();
  if (stale) {
    const b = document.createElement('div');
    b.id = 'staleBanner';
    b.textContent = stale;
    b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99;padding:10px 14px;' +
      'background:#5a1f1f;color:#ffd9d9;font:13px system-ui;border-bottom:1px solid #a33';
    document.body.appendChild(b);
  }
  try {
    renderer = new Renderer($('gl'));
  } catch (e) {
    $('busy').classList.add('show');
    $('busy').textContent = e.message;
    return;
  }

  for (const id of Object.keys(SLIDERS)) {
    const el = $(id);
    if (!el) continue;
    const upd = () => { $(id + '_v').textContent = fmt(el.value, SLIDERS[id]); };
    el.addEventListener('input', () => {
      upd();
      if (id === 'clip') applyClip();
      // a site was measured at whatever size was set when it was picked, and
      // the city is fitted to that square — so moving the size slider has to
      // measure the ground again, about the same centre
      if (id === 'size' && world && world.site) resizeSite();
    });
    upd();
  }

  $('mode').addEventListener('change', () => {
    document.body.className = 'mode-' + $('mode').value;
  });
  $('style').addEventListener('change', fillThemes);
  $('reroll').addEventListener('click', () => {
    $('seed').value = (Math.random() * 1e9) | 0;
    generate();
  });
  $('gen').addEventListener('click', generate);
  $('reset').addEventListener('click', () => { renderer.frameAll(); });
  $('mcpack').addEventListener('click', () => doExport('mcpack'));
  $('mcstruct').addEventListener('click', () => doExport('zip'));
  $('copycmd').addEventListener('click', copyCommands);
  $('edition').addEventListener('change', showEdition);
  $('cityName').addEventListener('input', () => { if (result) { cityNs = nsNow(); refreshCommands(); } });
  showEdition();
  $('worldFile').addEventListener('change', (e) => { if (e.target.files[0]) loadWorld(e.target.files[0]).catch((err) => wstatus('could not read that world: ' + err.message)); });
  $('goCoords').addEventListener('click', goToCoords);
  $('siteCoords').addEventListener('keydown', (e) => { if (e.key === 'Enter') goToCoords(); });
  $('worldMap').addEventListener('click', (e) => { try { pickSite(e); } catch (err) { wstatus('could not read that site: ' + err.message); } });
  $('worldMap').addEventListener('wheel', (e) => {
    if (!world) return;
    e.preventDefault();
    const under = chunkAt(e);                       // keep this spot where it is
    const next = Math.max(0, Math.min(ZOOMS.length - 1, (world.zoom === undefined ? 4 : world.zoom) + (e.deltaY > 0 ? 1 : -1)));
    if (next === world.zoom) return;
    world.zoom = next;
    world.view = under;
    drawWorldMap();
  }, { passive: false });
  // an arrow function, or the click event arrives as the "centred" argument
  // and every click copies the centre
  $('copyTp').addEventListener('click', () => copyTeleport(false));
  $('copyTpCentre').addEventListener('click', () => copyTeleport(true));
  $('useSite').addEventListener('click', () => {
    if (!world || !world.site) return;
    $('clearSite').style.display = 'block';
    generate();
  });
  $('clearSite').addEventListener('click', () => { if (world) world.site = null; $('clearSite').style.display = 'none'; drawWorldMap(); generate(); });
  for (const b of ['baseX', 'baseY', 'baseZ', 'fillAir', 'foundation', 'clearAbove'])
    $(b).addEventListener(b === 'foundation' || b === 'clearAbove' ? 'input' : 'change', () => { if (result) { cityNs = nsNow(); refreshCommands(); } });

  $('map').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    focal = [
      Math.min(0.98, Math.max(0.02, (e.clientX - r.left) / r.width)),
      Math.min(0.98, Math.max(0.02, (e.clientY - r.top) / r.height)),
    ];
    generate();
  });

  fillThemes();
  document.body.className = 'mode-city';
  window.addEventListener('resize', () => renderer.invalidate());
  requestAnimationFrame(loop);
  generate();
}

function fmt(v, dp) {
  const n = Number(v);
  return dp ? n.toFixed(dp) : String(n | 0);
}

function fillThemes() {
  const sel = $('theme');
  const list = THEMES[$('style').value] || THEMES.mid;
  sel.innerHTML = '<option value="">random</option>' +
    list.map((t) => `<option value="${t.name}">${t.name}</option>`).join('');
}

function loop() {
  renderer.render(false);
  requestAnimationFrame(loop);
}

function busy(on) {
  busyDepth += on ? 1 : -1;
  $('busy').classList.toggle('show', busyDepth > 0);
}

function toast(msg, bad) {
  const t = $('toast');
  t.textContent = msg;
  t.style.color = bad ? 'var(--bad)' : 'var(--text)';
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---- config -----------------------------------------------------------------
function readCfg() {
  const cfg = { ...DEFAULTS };
  const num = (id) => Number($(id).value);
  cfg.seed = num('seed') | 0;
  cfg.pitch = num('pitch');
  cfg.setbackEvery = num('setbackEvery');
  cfg.stairStyle = $('stairStyle').value;
  cfg.cityStyle = $('cityStyle').value;
  cfg.golemsPer10 = num('golemsPer10');
  cfg.transit = $('transit').value;
  cfg.furnish = $('furnish').checked;
  cfg.flowers = $('flowers').checked;
  cfg.villagers = num('villagers');
  cfg.farmChance = num('farmChance');
  cfg.pondChance = num('pondChance');
  for (const c of CHECKS) cfg[c] = $(c).checked;
  if ($('mode').value === 'city') {
    cfg.size = num('size');
    cfg.minBlock = num('minBlock');
    cfg.blockIrregularity = num('blockIrregularity');
    cfg.avenueWidth = num('avenueWidth');
    cfg.streetWidth = num('streetWidth');
    cfg.downtownRadius = num('downtownRadius');
    cfg.zoneNoise = num('zoneNoise');
    cfg.parkChance = num('parkChance');
    cfg.lotDowntown = num('lotDowntown');
    cfg.lotSuburb = num('lotSuburb');
    cfg.maxFloors = num('maxFloors');
    cfg.wallHeight = num('wallHeight');
    cfg.outline = $('outline').value;
    if (world && world.site) {
      const g = world.site;
      cfg.terrain = { ground: g.ground, water: g.water, baseY: g.baseY };
      cfg.size = g.size;
    }
    cfg.hills = num('hills');
    cfg.focal = focal.slice();
  } else {
    cfg.bw = num('bw');
    cfg.bd = num('bd');
    cfg.floors = num('floors');
    cfg.style = $('style').value;
    cfg.themeName = $('theme').value || null;
  }
  return cfg;
}

// ---- generate ---------------------------------------------------------------
function generate() {
  busy(true);
  $('gen').disabled = true;
  setTimeout(() => {
    try {
      const cfg = readCfg();
      const t0 = performance.now();
      result = ($('mode').value === 'city') ? generateCity(cfg) : generateSingle(cfg);
      const t1 = performance.now();
      verification = verifyAll(result.world, result.buildings);
      cityNs = nsNow();
      const t2 = performance.now();
      const mesh = buildMesh(previewWorld(result));
      showCentreSpot();
      renderer.setMesh(mesh);
      renderer.frameAll();
      applyClip();
      const t3 = performance.now();
      drawMap();
      showStats(mesh, [t1 - t0, t2 - t1, t3 - t2]);
      refreshCommands();
    } catch (e) {
      console.error(e);
      toast('Generation failed: ' + e.message, true);
    } finally {
      $('gen').disabled = false;
      busy(false);
    }
  }, 16);
}

function applyClip() {
  if (!result) return;
  const bb = result.world.box;
  const t = Number($('clip').value) / 100;
  const span = (bb.y1 - bb.y0 + 1);
  renderer.setClip(t >= 1 ? 1e9 : bb.y0 + span * t);
}

// ---- minimap ----------------------------------------------------------------
const MAP_COL = {
  [USE.EMPTY]: '#141a16',
  [USE.ROAD]: '#33383d',
  [USE.SIDEWALK]: '#5c646a',
  [USE.LOT]: '#2a3a26',
  [USE.PARK]: '#2f5a2c',
  [USE.PLAZA]: '#6b6552',
  6: '#8a7a2a',              // farm
  7: '#6d8a3a',              // animal pen
  8: '#2f6fb3',              // canal
  9: '#6b6259',              // goods yard
};

function drawMap() {
  const cv = $('map');
  if (!result || !result.plan.use.length) { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); return; }
  const { W, D, use } = result.plan;
  cv.width = W; cv.height = D;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(W, D);
  const cache = {};
  for (const k in MAP_COL) {
    const h = MAP_COL[k];
    cache[k] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  }
  for (let i = 0; i < W * D; i++) {
    const c = cache[use[i]] || cache[USE.EMPTY];
    img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1];
    img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // railway: green corridors and the track lines
  if (result.transit) {
    if (result.transit.mode === 'rails') {
      ctx.fillStyle = '#2d4a2a';
      for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) if (use[z * W + x] === USE.ROAD) ctx.fillRect(x, z, 1, 1);
    }
    for (const l of result.transit.lines) {
      ctx.fillStyle = '#c9a54a';
      for (const [x, , z] of l.cells) ctx.fillRect(x, z, 1, 1);
    }
  }
  // building footprints, brightness by height
  const maxF = Math.max(1, result.stats.tallest);
  for (const b of result.buildings) {
    const t = b.floors / maxF;
    const v = Math.round(90 + t * 150);
    ctx.fillStyle = `rgb(${v},${Math.round(v * 0.93)},${Math.round(v * 0.82)})`;
    ctx.fillRect(b.x0, b.z0, b.x1 - b.x0 + 1, b.z1 - b.z0 + 1);
  }
  // landmarks: gold outline round their lots
  if (result.landmarks) {
    ctx.strokeStyle = '#f2cf3e';
    ctx.lineWidth = Math.max(1, W / 160);
    for (const l of result.landmarks) ctx.strokeRect(l.lot.x0 + 0.5, l.lot.z0 + 0.5, l.lot.x1 - l.lot.x0, l.lot.z1 - l.lot.z0);
  }
  // focal marker
  if ($('mode').value === 'city') {
    const fx = focal[0] * W, fz = focal[1] * D;
    ctx.strokeStyle = '#d9a559';
    ctx.lineWidth = Math.max(1, W / 140);
    ctx.beginPath();
    ctx.arc(fx, fz, Math.max(3, W * 0.03), 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fx - 4, fz); ctx.lineTo(fx + 4, fz);
    ctx.moveTo(fx, fz - 4); ctx.lineTo(fx, fz + 4);
    ctx.stroke();
  }
}

// ---- stats ------------------------------------------------------------------
function showStats(mesh, times) {
  const s = result.stats;
  const v = verification;
  const rows = [];
  const line = (k, val, cls) => rows.push(
    `<div class="line"><span>${k}</span><b class="${cls || ''}">${val}</b></div>`);
  line('blocks', s.blocks.toLocaleString());
  line('footprint', `${s.footprint[0]} × ${s.footprint[1]}`);
  line('height', s.height + ' blocks');
  line('buildings', `${s.buildings}`);
  if (s.buildings) line('  houses / mid / tower', `${s.houses} / ${s.mids} / ${s.towers}`);
  line('floors', `${s.floors} (tallest ${s.tallest})`);
  line('windows', s.windows.toLocaleString());
  const kinds = {};
  for (const b of result.buildings) if (b.stairKind) kinds[b.stairKind] = (kinds[b.stairKind] || 0) + 1;
  const kindText = ['switchback', 'wide', 'spiral'].filter((k) => kinds[k]).map((k) => `${kinds[k]} ${k}`).join(' · ');
  if (kindText) line('stairs', kindText);
  if (s.farms !== undefined) {
    line('farms / beds', `${s.farms} / ${s.beds}`);
    line('workstations / plants', `${s.stations} / ${s.plants}`);
    line('villagers / golems', `${s.villagers} / ${s.golems}` + (s.bell ? ' · bell' : ''));
    if (s.hillBlocks) line('hills', `${s.hillBlocks} raised blocks (up to ${s.hillMax}) · ${s.staircases} staircases`);
    if (s.reachable) line('doors reachable from streets', s.reachable, s.reachable.split('/')[0] === s.reachable.split('/')[1] ? 'ok' : 'bad');
    if (s.landmarks && s.landmarks.length) line('landmarks', s.landmarks.map((k) =>
      ({ townhall: 'town hall', clocktower: 'clock tower', library: 'library', market: 'market', church: 'church',
        school: 'school', lighthouse: 'lighthouse', castle: 'castle' }[k])).join(' · '));
    if (s.streets) line('streets named', s.streets);
    if (s.shops) line('shopfronts', String(s.shops));
    if (s.terrain) line('fitted to your world', s.terrain);
    if (world && world.site) {
      const cn = cornerSpot(world.site, result);
      if (cn) line('corner · run build', cn.join(', '));
      const cs = centreSpot(world.site, result);
      if (cs) line('centre · run build_centered', cs.join(', '));
    }
    if (s.centre) line('centre monument', s.centre);
    if (s.canal) line('canal', s.canal + (s.dock ? ' · dock' : ''));
    if (s.harbour) line('harbour', s.harbour);
    if (s.bridges) line('bridges', s.bridges);
    if (s.art) line('art panels', String(s.art));
    if (s.paintings) line('paintings', String(s.paintings));
    if (s.ranches !== undefined) line('pens / farm animals', `${s.ranches} / ${s.animals}`);
    if (s.cats !== undefined) line('cats / pandas', `${s.cats} / ${s.pandas}`);
    if (s.railLines) line('rail lines / bridges / carts', `${s.railLines} / ${s.railBridges} / ${s.carts}` + (s.railLoop ? ' · loop' : ''));
    if (s.wallHeight) line('perimeter wall', `${s.wallHeight} high · ${s.gates} gates`);
  }
  const allOk = v.total > 0 && v.ok === v.total && v.floorsReached === v.floorsChecked;
  line('stairs verified', v.total === 0 ? '—' :
    (allOk ? `✓ ${v.floorsReached}/${v.floorsChecked} floors` : `✗ ${v.ok}/${v.total} buildings`),
    allOk ? 'ok' : (v.total ? 'bad' : ''));
  if (s.overflow) line('over budget', s.overflow.toLocaleString() + ' dropped', 'bad');
  line('preview quads', mesh.quads.toLocaleString());
  line('generate / verify / mesh',
    times.map((t) => Math.round(t) + 'ms').join(' · '));
  $('stats').innerHTML = rows.join('');
}

// ---- export -----------------------------------------------------------------
function base() {
  return [Number($('baseX').value) | 0, Number($('baseY').value) | 0, Number($('baseZ').value) | 0];
}

let exactCommands = [];

// export settings that shape the structure files (and so the city id)
// ---- fitting a city to a real world -----------------------------------------
let world = null;                 // { chunks, info, sites, site }
function wstatus(t) { $('worldStatus').textContent = t; }

async function loadWorld(file) {
  wstatus(`reading ${(file.size / 1048576).toFixed(0)} MB…`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Bedrock keeps its chunks in a LevelDB, Java in Anvil region files; either
  // can be dropped in and the rest of the fitting works the same
  const kind = worldKind(bytes);
  if (!kind) { wstatus('that file does not look like a Minecraft world (no db or region folder inside)'); return; }
  let info = null;
  try { info = kind === 'java' ? readJavaLevelDat(bytes) : readLevelDat(bytes, decodeNbt); } catch {}
  wstatus(`unpacking ${kind === 'java' ? 'Java region files' : 'Bedrock chunks'}… this can take a minute`);
  await new Promise((r) => setTimeout(r, 30));
  const spawn = info ? [Math.floor(info.spawn[0] / 16), Math.floor(info.spawn[2] / 16)] : [0, 0];
  const t0 = Date.now();
  const read = kind === 'java' ? readJavaWorld(bytes) : readWorld(bytes);
  const { chunks } = read;
  if (!chunks.size) { wstatus('no chunks found in that file'); return; }
  // a Bedrock world keeps its blocks; hold on to what is needed to read the
  // ones under a chosen site
  world = { chunks, info, near: spawn, view: spawn, site: null, kind, zip: read.zip || null, index: read.index || null };
  $('coordRow').style.display = 'flex';
  wstatus(`${info ? info.name + ' (' + kind + '): ' : ''}${chunks.size.toLocaleString()} chunks read in ${((Date.now() - t0) / 1000).toFixed(0)}s. `
    + 'Click the map to place the city, or type coordinates to go there.');
  drawWorldMap();
}

// how many chunks the map shows either way, and how big each is drawn: the
// canvas stays about the same size on screen at every zoom
const ZOOMS = [8, 16, 32, 64, 96, 160, 256];
function mapView() {
  const R = ZOOMS[world.zoom === undefined ? 4 : world.zoom];
  const px = Math.max(1, Math.min(12, Math.round(256 / (R * 2))));    // pixels per chunk
  return { R, px, near: world.view || world.near };
}

function drawWorldMap() {
  const c = $('worldMap'), ctx = c.getContext('2d');
  const { chunks } = world;
  const { R, px, near } = mapView();
  c.width = c.height = R * 2 * px;
  const img = ctx.createImageData(R * 2 * px, R * 2 * px);
  let lo = 999, hi = -999;
  for (const h of chunks.values()) for (const y of h) { if (y < -900 || y <= SEA_LEVEL) continue; lo = Math.min(lo, y); hi = Math.max(hi, y); }
  const W = R * 2 * px;
  const put = (cx, cz, r, g, b) => {
    for (let dy = 0; dy < px; dy++)
      for (let dx = 0; dx < px; dx++) {
        const o = ((cz * px + dy) * W + (cx * px + dx)) * 4;
        img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = 255;
      }
  };
  for (let cz = 0; cz < R * 2; cz++)
    for (let cx = 0; cx < R * 2; cx++) {
      const h = chunks.get((near[0] - R + cx) + ',' + (near[1] - R + cz));
      if (!h) { put(cx, cz, 24, 24, 24); continue; }
      let sum = 0, n = 0, water = 0;
      for (const y of h) { if (y < -900) continue; sum += y; n++; if (y <= SEA_LEVEL) water++; }
      const mean = n ? sum / n : 0, t = Math.max(0, Math.min(1, (mean - lo) / Math.max(1, hi - lo)));
      if (water / Math.max(1, n) > 0.5) put(cx, cz, 32, 70 + 60 * t, 150);
      else put(cx, cz, 60 + 150 * t, 110 + 90 * t, 60 + 50 * t);
    }
  ctx.putImageData(img, 0, 0);
  c.style.display = 'block';
  if (world.site) {                                // outline the chosen site
    const size = world.site.size;
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = Math.max(1, px / 2);
    ctx.strokeRect(((world.site.x0 / 16) - (near[0] - R)) * px, ((world.site.z0 / 16) - (near[1] - R)) * px,
      (size / 16) * px, (size / 16) * px);
  }
  $('mapScale').textContent = `showing ${R * 32} blocks across · scroll to zoom`;
}

// "-6926.11 69.00 -10080.98", "-6926, -10080" and the like: the first and
// last numbers are X and Z, so pasting an F3 position works.
export function parseCoords(text) {
  const n = (text.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  if (n.length < 2) return null;
  return [Math.round(n[0]), Math.round(n[n.length - 1])];
}

function goToCoords() {
  if (!world) return;
  const c = parseCoords($('siteCoords').value);
  if (!c) { wstatus('type coordinates like  -6926 69 -10080'); return; }
  world.view = [Math.floor(c[0] / 16), Math.floor(c[1] / 16)];
  drawWorldMap();
  // take the site centred on the point asked for
  const size = numVal('size');
  showSite(groundAtSite(c[0] - (size >> 1), c[1] - (size >> 1), size));
}

// which chunk the pointer is over
function chunkAt(ev) {
  const c = $('worldMap'), rect = c.getBoundingClientRect();
  const { R, px, near } = mapView();
  const cx = Math.floor((ev.clientX - rect.left) / rect.width * c.width / px) + near[0] - R;
  const cz = Math.floor((ev.clientY - rect.top) / rect.height * c.height / px) + near[1] - R;
  return [cx, cz];
}

function pickSite(ev) {
  if (!world) return;
  const [cx, cz] = chunkAt(ev);
  const size = numVal('size');
  showSite(groundAtSite(cx * 16, cz * 16, size));
}

// keep the chosen site centred where it is, at the size now asked for
function resizeSite() {
  const g = world.site;
  const size = numVal('size');
  if (!g || g.size === size) return;
  const cx = g.x0 + (g.size >> 1), cz = g.z0 + (g.size >> 1);
  try { showSite(groundAtSite(cx - (size >> 1), cz - (size >> 1), size)); } catch (err) { wstatus('could not read that site: ' + err.message); }
}

// the ground under a site: from the blocks themselves where they can be read
function groundAtSite(x0, z0, size) {
  let exact = null;
  if (world.kind === 'bedrock' && world.zip && world.index) {
    try { exact = exactGround(world.zip, world.index, x0, z0, size); } catch { exact = null; }
  }
  return siteGround(world.chunks, x0, z0, size, { exact });
}

function showSite(g) {
  world.site = g;
  drawWorldMap();
  const el = $('siteInfo');
  el.style.display = 'block';
  // Unexplored ground is simply left alone, like water or a cliff, so a site
  // only has to be explored enough for a city to fit on what is there.
  const ok = g.coverage >= 0.6 && g.buildableShare >= 0.35;
  const half = g.size >> 1;
  el.innerHTML = `Site ${g.size}×${g.size} · centre <b>${g.x0 + half}, ${g.z0 + half}</b> · ground y ${g.p05}–${g.p95}<br>`
    + `explored ${(g.coverage * 100).toFixed(0)}% · water ${(g.waterShare * 100).toFixed(0)}% · buildable ${(g.buildableShare * 100).toFixed(0)}%`
    + (ok
      ? '<br>Generate, then use either button below: the corner with <b>build</b>, or the centre with <b>build_centered</b>.'
      : `<br><b>${g.coverage < 0.6 ? 'Too little of this is explored' : 'Too little of this is buildable'}</b> — fly over it in game, or try nearby.`);
  $('useSite').style.display = ok ? 'block' : 'none';
  $('copyTp').style.display = 'none';        // both spots depend on the city, so they appear after it is generated
  showCentreSpot();
}

// The preview shows the city standing in the real land when one is loaded:
// the land is added to a copy of the world, so the export is untouched by it.
function previewWorld(res) {
  if (!res.shell || !res.shell.length) return res.world;
  const copy = new VoxelWorld({ budget: res.cfg.budget + res.shell.length + 1000 });
  res.world.forEach((x, y, z, id) => copy.set(x, y, z, id));
  for (const [x, y, z, id] of res.shell) if (!copy.has(x, y, z)) copy.set(x, y, z, id);
  copy.cityMask = res.world.cityMask;
  return copy;
}

// the centre button only appears once the city exists, since it depends on
// where the monument ended up
function showCentreSpot() {
  const site = world && world.site ? world.site : null;
  const centre = site ? centreSpot(site, result) : null;
  const corner = site ? cornerSpot(site, result) : null;
  const btnC = $('copyTpCentre'), btn = $('copyTp');
  btnC.style.display = centre ? 'block' : 'none';
  if (centre) btnC.textContent = `Copy /tp ${centre[0]} ${centre[1]} ${centre[2]}  (centre · build_centered)`;
  btn.style.display = corner ? 'block' : 'none';
  if (corner) btn.textContent = `Copy /tp ${corner[0]} ${corner[1]} ${corner[2]}  (corner · build)`;
}

function exportOpts() {
  const o = { fillAir: $('fillAir').checked, foundation: Number($('foundation').value) | 0, clearAbove: Number($('clearAbove').value) | 0,
    centre: result && result.centre ? [result.centre.block[0], result.centre.block[2]] : undefined };
  // on real ground the foundation has to reach the lowest ground under the
  // city, and the clearance has to cut away the hills above it
  if (world && world.site && result && result.cfg.terrain) {
    const g = world.site;
    o.foundation = Math.max(o.foundation, Math.min(48, g.baseY - g.p05 + 6));
    o.clearAbove = Math.max(o.clearAbove, Math.min(160, g.p95 - g.baseY + 16));
    const cs = centreSpot(g, result), cn = cornerSpot(g, result);
    o.site = { x: cn ? cn[0] : g.x0, y: g.baseY, z: cn ? cn[2] : g.z0, centre: cs || undefined };
    o.terrain = { ground: g.ground, baseY: g.baseY, size: g.size };   // carve and found per column
  }
  return o;
}
// What the city is called. A name typed in is used for the pack's name in
// game, for the file, and for the commands; the city's own id is kept on the
// end of the namespace so two packs of the same name cannot collide.
function cityName() {
  return ($('cityName').value || '').trim();
}
function nameSlug() {
  return cityName().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
}
function nsNow() {
  const id = result ? cityId(result.world, result.cfg.seed, POLIS_VERSION, exportSalt(exportOpts())) : 'polis';
  const slug = nameSlug();
  if (!slug) return id;
  return `${slug}_${id.slice(-4)}`;
}
let cityNs = 'polis';

function refreshCommands() {
  if (!result) return;
  try {
    const tiles = tileList(result.world, { prefix: 'c', ...exportOpts() });
    exactCommands = commandList(tiles, { base: base(), namespace: cityNs });
    $('cmds').value = [
      `# city id ${cityNs} — after importing its pack, stand where you want it:`,
      `/function ${cityNs}/build_centered`,
      `# when the city has finished appearing, from the same spot:`,
      `/function ${cityNs}/populate_centered`,
      '',
      `# or the exact coordinates (${tiles.length} tile${tiles.length === 1 ? '' : 's'}):`,
      ...exactCommands,
    ].join('\n');
  } catch (e) {
    exactCommands = [];
    $('cmds').value = 'error: ' + e.message;
  }
}

// Where the city is placed from. Either spot works: the north-west corner
// with build, or the centre monument's alcove with build_centered — the
// centred build lines the city up on that block.
export function centreSpot(site, res) {
  if (!site || !res || !res.centre) return null;
  const [cx, cy, cz] = res.centre.stand;
  return [site.x0 + cx, site.baseY + (cy - 1), site.z0 + cz];     // city y 1 is the base level
}

// The corner spot is not the corner of the site: the city's blocks start
// wherever its outline begins, which is usually well inside. build lines the
// first block of the city up with the player, so the player must stand at the
// world position of that block, or the whole city lands off the ground it was
// fitted to.
export function cornerSpot(site, res) {
  if (!site || !res) return null;
  const wb = res.world.box;
  return [site.x0 + wb.x0, site.baseY + 1, site.z0 + wb.z0];
}

function copyTeleport(centred = false) {
  if (!world || !world.site) { toast('Choose a site first.', true); return; }
  const g = world.site;
  const spot = centred ? centreSpot(g, result) : null;
  if (centred && !spot) { toast('Generate the city first.', true); return; }
  const corner = cornerSpot(g, result);
  if (!centred && !corner) { toast('Generate the city first.', true); return; }
  const at = centred ? spot : corner;
  const text = `/tp ${at[0]} ${at[1]} ${at[2]}`;
  const done = () => toast(`${text} copied — run it, then /function …/${centred ? 'build_centered' : 'build'}`);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => { fallbackCopy(text); done(); });
  } else { fallbackCopy(text); done(); }
}

function copyCommands() {
  if (!exactCommands.length) { toast('Nothing to copy yet.', true); return; }
  const text = exactCommands.join('\n');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => toast(`${exactCommands.length} /structure commands copied.`))
      .catch(() => fallbackCopy(text));
  } else fallbackCopy(text);
}

function fallbackCopy(text) {
  const t = document.createElement('textarea');
  t.value = text;
  t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.appendChild(t);
  t.select();
  try { document.execCommand('copy'); toast(`${exactCommands.length} /structure commands copied.`); }
  catch (e) { toast('Copy failed — select the text manually.', true); }
  t.remove();
}

// Java needs gzip; the browser has it, and so does node for the headless check
async function gzip(bytes) {
  const cs = new CompressionStream('gzip');
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Java Edition: a datapack of structures placed by a function
async function exportJava() {
  const o = exportOpts();
  const tiles = javaTiles(result.world, {
    prefix: 'city', fillAir: o.fillAir, clearAbove: o.clearAbove, foundation: o.foundation,
    spawns: result.spawns || [],
  });
  for (const t of tiles) t.nbt = await gzip(t.nbt);
  const ns = cityNs.replace(/[^a-z0-9_]/g, '');
  const files = javaPackFiles(tiles, { namespace: ns, description: summaryLine(), name: cityName() });
  // a note in the pack, since a datapack has nowhere else to say this
  files.push({
    name: 'polis-readme.txt',
    text: [
      `Polis v${VERSION} — ${summaryLine()}`,
      '',
      'Put this zip in your world\'s datapacks folder (Edit World -> Open World Folder),',
      'then in game:',
      '',
      '    /reload',
      `    /function ${ns}:build`,
      '',
      'You are the north-west corner: stand where you want that corner of the city,',
      'on the ground, facing anywhere. The city builds around you.',
      '',
      'Java villagers arrive unemployed and take up the lecterns, looms, barrels and',
      'smokers the city provides; the game gives them their trades.',
    ].join('\n'),
  });
  const data = await makeZip(files.map((f) => ({ name: f.name, data: f.data || new TextEncoder().encode(f.text) })));
  return { data, tiles, ns };
}

async function doExport(kind) {
  if (!result) { toast('Generate something first.', true); return; }
  const stale = staleFiles();
  if (stale) { toast('Export blocked: ' + stale, true); return; }
  busy(true);
  $('mcpack').disabled = $('mcstruct').disabled = true;
  try {
    cityNs = nsNow();
    const opts = {
      base: base(), namespace: cityNs, prefix: 'c', ...exportOpts(),
      seed: result.cfg.seed, spawns: result.spawns || [],
      summary: summaryLine(),
      packName: `Polis ${cityNs}`,
      description: `/function ${cityNs}/build_centered then populate_centered · Polis v${VERSION}`,
    };
    if ($('edition').value === 'java') {
      const out = await exportJava();
      const name = `${nameSlug() || cityNs}_java_v${VERSION}.zip`;
      download(out.data, name);
      toast(`${name} — put it in your world's datapacks folder, then /reload and /function ${out.ns}:build`);
    } else {
      const out = kind === 'mcpack'
        ? await exportPack(result.world, { ...opts, packName: cityName() || undefined, description: summaryLine() })
        : await exportStructuresZip(result.world, { ...opts, packName: cityName() || undefined, description: summaryLine() });
      // the name given, or the city id: polis_<seed>_<hash>_v<version>
      const name = `${nameSlug() || cityNs}_v${VERSION}.` + (kind === 'mcpack' ? 'mcpack' : 'zip');
      download(out.data, name);
      toast(`${name} — in game: /function ${cityNs}/build_centered, then populate_centered`);
    }
  } catch (e) {
    console.error(e);
    toast('Export failed: ' + e.message, true);
  } finally {
    $('mcpack').disabled = $('mcstruct').disabled = false;
    busy(false);
  }
}

// the export panel says what it will produce
function showEdition() {
  const java = $('edition').value === 'java';
  $('mcpack').textContent = java ? 'Export Java datapack' : 'Export .mcpack';
  $('mcstruct').style.display = java ? 'none' : '';
  $('copycmd').style.display = java ? 'none' : '';
  $('javaHint').style.display = java ? 'block' : 'none';
}

function summaryLine() {
  const s = result.stats;
  const mode = $('mode').value === 'city' ? `city ${s.footprint[0]}x${s.footprint[1]}` : `single ${result.cfg.style}`;
  return `${mode} · ${s.buildings} building${s.buildings === 1 ? '' : 's'} · ${s.floors} floors · ` +
    `${s.farms || 0} farms · ${s.villagers || 0} villagers · ${s.golems || 0} golems · ` +
    `${s.blocks.toLocaleString()} blocks · air fill ${$('fillAir').checked ? 'on' : 'off'}`;
}

function download(data, name) {
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

boot();
