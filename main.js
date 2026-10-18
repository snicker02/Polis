// main.js — Polis UI.

import { generateCity, generateSingle, DEFAULTS } from './engine/city.js';
import { collectSettings, applySettings } from './engine/settings.js';
import { USE } from './engine/plan.js';
import { verifyAll } from './engine/verify.js';
import { buildMesh } from './engine/mesher.js';
import { VoxelWorld } from './engine/blockcore.js';
import { Renderer } from './engine/renderer.js';
import { exportPack, exportStructuresZip, tileList, commandList, cityId, exportSalt, POLIS_VERSION, placeOffsets, GROUND_DROP } from './engine/export.js';
import { readWorld, readLevelDat, siteGround, findSites, SEA_LEVEL, worldReport } from './engine/worldfile.js';
import { javaTiles, javaPackFiles } from './engine/export-java.js';
import { readJavaWorld, readJavaLevelDat, worldKind } from './engine/javaworld.js';
import { exactGround, rebuildHeights } from './engine/bedrockblocks.js';
import { makeZip } from './engine/blockcore.js';
import { buildPregenPack, pregenFileName, siteRegion, viewRegion, pregenCommand, regionChunks } from './engine/pregen.js';
import { decodeNbt } from './tools/nbt-read.js';
import { THEMES, MAT } from './engine/materials.js';

const VERSION = '0.69.0';
const $ = (id) => document.getElementById(id);
const numVal = (id) => Number($(id).value);      // readCfg has its own local num()

const SLIDERS = {
  size: 0, minBlock: 0, blockIrregularity: 2, avenueWidth: 0, streetWidth: 0,
  downtownRadius: 2, zoneNoise: 2, parkChance: 2, lotDowntown: 0, lotSuburb: 0,
  maxFloors: 0, pitch: 0, setbackEvery: 0, bw: 0, bd: 0, floors: 0, clip: 0,
  farmChance: 2, pondChance: 2, twistChance: 2, courtyardChance: 2, hostileCount: 0, villagers: 0, wallHeight: 0, foundation: 0, clearAbove: 0, hills: 0, golemsPer10: 0,
};
const CHECKS = ['setback', 'roofAccess', 'useStairs', 'lights', 'lamps', 'trees', 'markings', 'landmarks', 'canal', 'harbour', 'bridges', 'detail', 'streetSigns', 'fish', 'megaliths', 'hostiles', 'dome', 'stilts', 'floating', 'cliff', 'underground', 'metro', 'terrainBreaks', 'jail', 'zoo', 'museum', 'hospital', 'firestation', 'police', 'theatre', 'hotel', 'factory', 'park', 'waterpark', 'garden', 'station', 'mall', 'airport', 'bouts', 'themepark', 'sports', 'bank', 'watertower', 'petrol', 'skatepark', 'wizard', 'nightclub', 'lifts', 'underwater'];

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
  initFind();
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
  $('clearSite').addEventListener('click', () => { if (world) world.site = null; $('clearSite').style.display = 'none'; markFitted(); drawWorldMap(); generate(); });
  $('pregenDl').addEventListener('click', () => downloadPregen(false));
  $('pregenDlLegacy').addEventListener('click', (e) => { e.preventDefault(); downloadPregen(true); });
  $('pregenSite').addEventListener('click', () => copyPregen('site'));
  $('pregenView').addEventListener('click', () => copyPregen('view'));
  for (const b of ['baseX', 'baseY', 'baseZ', 'fillAir', 'foundation', 'clearAbove'])
    $(b).addEventListener(b === 'foundation' || b === 'clearAbove' ? 'input' : 'change', () => { if (result) { cityNs = nsNow(); refreshCommands(); } });

  $('map').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    // (the plan may show the airport beside the city: the click is put back into the city's own square)
    const X = mapExt, W = result && result.plan ? result.plan.W : 1, D = result && result.plan ? result.plan.D : 1;
    const px = X ? X.x0 + (e.clientX - r.left) / r.width * (X.x1 - X.x0 + 1) : null, pz = X ? X.z0 + (e.clientY - r.top) / r.height * (X.z1 - X.z0 + 1) : null;
    focal = [
      Math.min(0.98, Math.max(0.02, X ? px / W : (e.clientX - r.left) / r.width)),
      Math.min(0.98, Math.max(0.02, X ? pz / D : (e.clientY - r.top) / r.height)),
    ];
    generate();
  });

  fillThemes();
  document.body.className = 'mode-city';
  window.addEventListener('resize', () => renderer.invalidate());
  // settings: save, load, reset, and the last ones remembered
  $('saveSettings').addEventListener('click', saveSettingsFile);
  $('loadSettings').addEventListener('click', () => $('settingsFile').click());
  $('settingsFile').addEventListener('change', (e) => { if (e.target.files[0]) loadSettingsFile(e.target.files[0]); e.target.value = ''; });
  $('resetSettings').addEventListener('click', () => { try { localStorage.removeItem(SETTINGS_KEY); } catch (e) { /* off */ } location.reload(); });
  let rememberTimer = null;
  const later = () => { clearTimeout(rememberTimer); rememberTimer = setTimeout(rememberSettings, 300); };
  document.addEventListener('change', later);
  document.addEventListener('input', later);
  restoreRemembered();
  document.body.className = 'mode-' + $('mode').value;
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
  cfg.mixStyles = $('mixStyles').checked;
  cfg.mixList = [...document.querySelectorAll('.mixStyle')].filter((e) => e.checked).map((e) => e.value);
  cfg.golemsPer10 = num('golemsPer10');
  cfg.transit = $('transit').value;
  cfg.furnish = $('furnish').checked;
  cfg.flowers = $('flowers').checked;
  cfg.villagers = num('villagers');
  cfg.farmChance = num('farmChance');
  cfg.pondChance = num('pondChance');
  cfg.twistChance = num('twistChance');
  cfg.courtyardChance = num('courtyardChance');
  cfg.hostileCount = num('hostileCount');
  cfg.memorial = $('memorial').value;
  cfg.graveNames = $('graveNames').value;
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
// ---- saving and loading settings ----------------------------------------------
// Save downloads every setting as a file; Load puts them all back; the page also
// remembers the last settings in the browser and starts from them. While they are
// being put back, generate waits, and runs once at the end.
const SETTINGS_KEY = 'polis.settings';
let applyingSettings = false;
const controlsNow = () => [...document.querySelectorAll('input, select, textarea')];
const settingsNote = (msg) => { const n = $('settingsNote'); if (n) n.textContent = msg || ''; };
function settingsNow() { return collectSettings(controlsNow(), { version: VERSION, focal }); }
function rememberSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsNow())); } catch (e) { /* storage may be off: nothing to remember into */ } }
function putSettingsBack(data, { quiet } = {}) {
  applyingSettings = true;
  let res;
  try {
    res = applySettings(data, controlsNow(), {
      version: VERSION,
      changed: (el) => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); },
    });
  } finally { applyingSettings = false; }
  if (res.focal) focal = res.focal;
  if (!quiet) settingsNote(['settings loaded', res.note, res.unknown.length ? `(${res.unknown.length} not in this version: ${res.unknown.slice(0, 4).join(', ')})` : ''].filter(Boolean).join(' · '));
  return res;
}
function saveSettingsFile() {
  const data = settingsNow();
  const name = `polis-settings-${(data.settings.cityStyle || 'city')}-${data.settings.seed || 'seed'}-v${VERSION}.json`;
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  settingsNote('settings saved as ' + name);
}
function loadSettingsFile(file) {
  const r = new FileReader();
  r.onload = () => {
    try { putSettingsBack(JSON.parse(r.result)); rememberSettings(); generate(); }
    catch (e) { settingsNote('could not load those settings: ' + e.message); }
  };
  r.readAsText(file);
}
function restoreRemembered() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) putSettingsBack(JSON.parse(raw), { quiet: true });
  } catch (e) { /* nothing remembered, or storage off */ }
}

// A city fitted to the world follows its ground: no dome, no stilts, no floating
// islands, no cliff tiers. The page says so beside those options, and in the
// summary for any that were ticked.
const NOT_FITTED = { dome: 'glass dome', stilts: 'stilts', floating: 'floating islands', cliff: 'cliff tiers', underwater: 'under the sea' };
function markFitted() { document.body.classList.toggle('fitted', !!(world && world.site)); }

function generate() {
  markFitted();
  if (applyingSettings) return;
  rememberSettings();                                         // (the downtown's place changes by a click on the map)
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
      refreshFind();
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

// the plan's extent on the map: the city's square, and the airport beside it if there is one
let mapExt = null;
function drawMap() {
  const cv = $('map');
  if (!result || !result.plan.use.length) { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); mapExt = null; return; }
  const { W, D, use } = result.plan;
  const air = (result.landmarks || []).find((l) => l.kind === 'airport');
  const fun = (result.landmarks || []).find((l) => l.kind === 'themepark');
  mapExt = { x0: 0, z0: 0, x1: W - 1, z1: D - 1 };
  for (const o of [air, fun]) if (o) mapExt = { x0: Math.min(mapExt.x0, o.lot.x0), z0: Math.min(mapExt.z0, o.lot.z0), x1: Math.max(mapExt.x1, o.lot.x1), z1: Math.max(mapExt.z1, o.lot.z1) };
  cv.width = mapExt.x1 - mapExt.x0 + 1; cv.height = mapExt.z1 - mapExt.z0 + 1;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0b0d10'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.translate(-mapExt.x0, -mapExt.z0);
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
  ctx.putImageData(img, -mapExt.x0, -mapExt.z0);
  // the airport: its grass, the apron, the terminal and the runway
  if (air) {
    const F = air.frame;
    const rect = (u0, v0, u1, v1, col) => {
      const a = F.at(u0, v0), b = F.at(u1, v1);
      ctx.fillStyle = col; ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]) + 1, Math.abs(a[1] - b[1]) + 1);
    };
    rect(F.U0, 0, F.U1, F.VD - 1, '#3f6b33');
    rect(F.U0 + 2, F.AP.v0, F.U1 - 2, F.AP.v1, '#8c9294');
    rect(F.U0 + 2, F.TX.v0, F.U1 - 2, F.TX.v1, '#5c6063');
    rect(air.runway.u0, air.runway.v0, air.runway.u1, air.runway.v1, '#1b1d20');
    rect(F.T.u0, F.T.v0, F.T.u1, F.T.v1, '#e4e6e6');
    rect(F.TW.u0, F.TW.v0, F.TW.u1, F.TW.v1, '#3a9ad0');
    ctx.fillStyle = '#5c6063'; for (const [x, , z] of air.road) ctx.fillRect(x, z, 1, 1);
  }
  // the theme park: its grass, the coaster's loop, the wheel, the tower, the carousel
  if (fun) {
    ctx.fillStyle = '#4a7a3a'; ctx.fillRect(fun.lot.x0, fun.lot.z0, fun.lot.x1 - fun.lot.x0 + 1, fun.lot.z1 - fun.lot.z0 + 1);
    ctx.fillStyle = '#b5652a'; for (const [x, z] of fun.map.loop) ctx.fillRect(x, z, 1, 1);
    const [a, b] = fun.map.wheel; ctx.fillStyle = '#e4e6e6'; ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]) + 1, Math.abs(a[1] - b[1]) + 1);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(fun.map.tower[0] - 2, fun.map.tower[1] - 2, 5, 5);
    ctx.fillStyle = '#f2cf3e'; ctx.beginPath(); ctx.arc(fun.map.carousel[0] + 0.5, fun.map.carousel[1] + 0.5, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5c6063'; for (const [x, , z] of fun.road) ctx.fillRect(x, z, 1, 1);
  }
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
  // the landmark picked in Find a landmark: a bright outline and a mark where to stand
  const found = foundPlace();
  if (found) {
    const lot = found.lot;
    ctx.strokeStyle = '#3ee0f2';
    ctx.lineWidth = Math.max(2, W / 70);
    if (lot) ctx.strokeRect(lot.x0 - 1.5, lot.z0 - 1.5, lot.x1 - lot.x0 + 3, lot.z1 - lot.z0 + 3);
    ctx.beginPath();
    ctx.arc(found.at[0] + 0.5, found.at[2] + 0.5, Math.max(3, W * 0.03), 0, Math.PI * 2);
    ctx.stroke();
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

// ---- find a landmark ---------------------------------------------------------
// Every landmark of the city, where it is from the build spot, and (given where you
// stood to build it) its exact coordinates in your world and a /tp to it. A city
// fitted to your world already knows where it is.
const FIND_KEY = 'polis-find-spot';
function findPlaces() {
  if (!result || !result.places || !result.places.length) return [];
  return placeOffsets(result.world, { places: result.places, centre: exportOpts().centre });
}
function foundPlace() {
  const id = $('findSel') && $('findSel').value;
  return id ? findPlaces().find((P) => P.id === id) || null : null;
}
function fittedSite() { return world && world.site && result && result.cfg.terrain ? world.site : null; }
function findSpot() {
  const v = ['findX', 'findY', 'findZ'].map((id) => $(id).value.trim());
  if (v.some((s) => s === '' || !Number.isFinite(Number(s)))) return null;
  return v.map((s) => Math.floor(Number(s)));
}
// a city point [x, y, z] in your world's coordinates, or null without a spot to start from
function findAbs(p) {
  const site = fittedSite();
  if (site) return [site.x0 + p[0], site.baseY + p[1] - 1, site.z0 + p[2]];
  const s = findSpot();
  if (!s) return null;
  const wb = result.world.box, c = exportOpts().centre || result.world.centre;
  const [ox, oz] = $('findFrom').value === 'corner' ? [wb.x0, wb.z0] : [c[0], c[1]];
  return [s[0] + p[0] - ox, s[1] + p[1] - GROUND_DROP, s[2] + p[2] - oz];
}
function tpOf(P) {
  const a = findAbs(P.at), l = findAbs(P.look);
  if (a) return `/tp @s ${a.join(' ')} facing ${l.join(' ')}`;
  if ($('findFrom').value === 'corner') return null;
  const r = (n) => `~${n || ''}`;
  return `/tp @s ${r(P.rel[0])} ${r(P.rel[1])} ${r(P.rel[2])}`;
}
function refreshFind() {
  const sel = $('findSel'), ps = findPlaces(), keep = sel.value;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  sel.innerHTML = ps.length
    ? '<option value="">— pick a landmark —</option>' + ps.slice().sort((p, q) => p.name.localeCompare(q.name)).map((P) => `<option value="${P.id}">${esc(P.name)}</option>`).join('')
    : `<option value="">${result ? '(no landmarks in this city)' : '(generate a city first)'}</option>`;
  if (ps.some((P) => P.id === keep)) sel.value = keep;
  const site = fittedSite();
  for (const id of ['findFrom', 'findX', 'findY', 'findZ']) $(id).disabled = !!site;
  $('findSpotLabel').textContent = site ? 'Fitted to your world: coordinates are exact' : ($('findFrom').value === 'corner' ? 'Where you stood for build: X / Y / Z' : 'Where you stood for build_centered: X / Y / Z');
  updateFind();
}
function updateFind() {
  const P = foundPlace(), ps = findPlaces();
  $('findAll').disabled = !ps.length;
  $('findCopy').disabled = $('findShow').disabled = !P;
  if (!P) { $('findOut').textContent = ps.length ? `${ps.length} landmarks. Pick one to see where it is.` : ''; return; }
  const a = findAbs(P.at), tp = tpOf(P);
  const from = fittedSite() ? 'the city centre' : $('findFrom').value === 'corner' ? 'the build spot' : 'the build_centered spot';
  const lines = [`${P.name}: ${P.words} of ${fittedSite() ? 'the centre monument' : from}.`];
  if (a) lines.push(`Stand at X ${a[0]}, Y ${a[1]}, Z ${a[2]} (the street before its front).`);
  else lines.push('Type where you stood when you built the city for its exact coordinates.');
  if (tp) lines.push(tp + (a ? '' : '   (run from the build_centered spot)'));
  $('findOut').textContent = lines.join('\n');
  $('findOut').style.whiteSpace = 'pre-wrap';
}
// the 3D view over the landmark's lot, from high enough to see it whole
function showFound() {
  const P = foundPlace();
  if (!P) return;
  const l = P.lot || { x0: P.at[0], x1: P.at[0], z0: P.at[2], z1: P.at[2] };
  const span = Math.max(l.x1 - l.x0, l.z1 - l.z0) + 1;
  renderer.focus((l.x0 + l.x1 + 1) / 2, P.at[1] + 4, (l.z0 + l.z1 + 1) / 2, Math.max(70, span * 3.2));
}
function initFind() {
  try { const s = JSON.parse(localStorage.getItem(FIND_KEY) || 'null'); if (s) { $('findX').value = s.x ?? ''; $('findY').value = s.y ?? ''; $('findZ').value = s.z ?? ''; if (s.from) $('findFrom').value = s.from; } } catch (e) { /* storage off */ }
  const save = () => { try { localStorage.setItem(FIND_KEY, JSON.stringify({ x: $('findX').value, y: $('findY').value, z: $('findZ').value, from: $('findFrom').value })); } catch (e) { /* storage off */ } };
  $('findSel').addEventListener('change', () => { updateFind(); drawMap(); showFound(); });
  $('findFrom').addEventListener('change', () => { save(); refreshFind(); });
  for (const id of ['findX', 'findY', 'findZ']) $(id).addEventListener('input', () => { save(); updateFind(); });
  // (a whole F3 line pasted into X fills all three)
  $('findX').addEventListener('paste', (e) => {
    const t = (e.clipboardData || window.clipboardData).getData('text');
    const n = (t.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    if (n.length >= 3) { e.preventDefault(); $('findX').value = n[0]; $('findY').value = n[1]; $('findZ').value = n[2]; save(); updateFind(); }
  });
  $('findCopy').addEventListener('click', () => { const P = foundPlace(); const tp = P && tpOf(P); if (tp) copyText(tp, `Copied the /tp to the ${P.name}`); });
  $('findShow').addEventListener('click', showFound);
  $('findAll').addEventListener('click', () => {
    const ps = findPlaces().slice().sort((p, q) => p.name.localeCompare(q.name));
    const text = ps.map((P) => { const a = findAbs(P.at); return `${P.name}: ${P.words}${a ? `   X ${a[0]} Y ${a[1]} Z ${a[2]}` : ''}   ${tpOf(P) || ''}`; }).join('\n');
    copyText(text, `Copied ${ps.length} landmarks`);
  });
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
  const lifts = result.buildings.filter((b) => b.lift).length;
  if (lifts) line('bubble lifts', `${lifts} (soul sand up, magma down, beside the stairs)`);
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
    if (s.fish) line('fish', String(s.fish));
    if (s.twisted) line('shaped towers', (() => { const c = {}; for (const n of s.shapes || []) c[n] = (c[n] || 0) + 1; return Object.entries(c).map(([k, v]) => `${v} ${k.replace('-', ' ')}`).join(', '); })());
    if (s.courtyards && s.courtyards.length) line('courtyard blocks', s.courtyards.join(', '));
    if (s.styleDistricts) line('districts', Object.entries(s.styleDistricts).map(([k, v]) => `${k} ${v}`).join(', '));
    if (world && world.site) {
      const skipped = Object.keys(NOT_FITTED).filter((id) => $(id) && $(id).checked).map((id) => NOT_FITTED[id]);
      if (skipped.length) line('not on fitted ground', `${skipped.join(', ')}: a fitted city follows your world's own ground`);
    }
    for (const [k, label] of [['police', 'police station'], ['theatre', 'theatre'], ['hotel', 'hotel'], ['factory', 'factory'], ['workshop', 'workshop'], ['mill', 'mill'], ['park', 'amusement park'], ['waterpark', 'water park'], ['lazyriver', 'lazy river'], ['garden', 'botanical garden'], ['station', 'station'], ['mall', 'shopping mall'], ['sports', 'sports centre'], ['bank', 'bank'], ['watertower', 'water tower'], ['petrol', 'petrol station'], ['skatepark', 'skate park'], ['wizard', "wizard's tower"], ['nightclub', 'nightclub'], ['bandstand', 'bandstand'], ['airport', 'airport'], ['bouts', 'stadium bouts'], ['themepark', 'theme park']]) {
      if (s[k + 'Missing']) line(label, s[k + 'Missing']);
      if (s[k]) line(label, s[k]);
    }
    // where the asked-for landmarks are, from the build_centered spot (in the pack:
    // /function <city>/goto_<name>, and the guide lists every one)
    if (result.places && result.places.length) {
      const asked = new Set(['jail', 'zoo', 'aquarium', 'museum', 'hospital', 'firestation', 'police', 'theatre', 'hotel', 'factory', 'workshop', 'mill', 'park', 'waterpark', 'lazyriver', 'garden', 'station', 'mall', 'sports', 'bank', 'watertower', 'petrol', 'skatepark', 'wizard', 'nightclub', 'airport', 'themepark', 'memorial']);
      const ps = placeOffsets(result.world, { places: result.places.filter((P) => asked.has(P.kind)) });
      if (ps.length) line('where (from the centre)', ps.map((P) => `${P.name}: ${P.words}`).join(' · ') + ' — in the game, /function <city>/goto_<name>');
    }
    if (s.cemeteryMissing) line('cemetery', s.cemeteryMissing);
    if (s.cemetery) line('cemetery', s.cemetery);
    if (s.hospitalMissing) line('hospital', s.hospitalMissing);
    if (s.hospital) line('hospital', `${s.hospital.beds} beds, a pharmacy of ${s.hospital.stands} brewing stands, a helipad`);
    if (s.firestationMissing) line('fire station', s.firestationMissing);
    if (s.firestation) line('fire station', `${s.firestation.engines} fire engines, ${s.firestation.beds} bunks, a pole and a lookout tower`);
    if (s.museumMissing) line('museum', s.museumMissing);
    if (s.museum) line('museum', `${s.museum.relics} relics, ${s.museum.minerals} minerals, a skeleton of ${s.museum.bones} bones, ${s.museum.paintings} paintings, ${s.museum.armour} suits of armour`);
    if (s.zooMissing) line('zoo', s.zooMissing);
    if (s.jailMissing) line('jail', s.jailMissing);
    if (s.zoo) line('zoo and aquarium', `${s.zoo.animals} animals and ${s.zoo.fish} fish, ${s.zoo.kinds} kinds`);
    if (s.jail) line('jail', `${s.jail.inmates} inmates, ${s.jail.kinds} kinds of hostile mob`);
    if (s.metro) line('metro', `${s.metro.lines} line${s.metro.lines > 1 ? 's' : ''}, ${s.metro.stations} stations, ${s.metro.flights} flights of stairs up`);
    if (s.underground) line('underground', `${s.underground.cellars} cellars${s.underground.crypts ? ', a crypt under the cathedral' : ''}`);
    if (s.cliff) line('cliff', `${s.cliff.tiers} tiers, ${s.cliff.flights} flights of stairs between them`);
    if (s.islands) line('floating islands', `${s.islands.count} islands, the deepest underside ${s.islands.deepest} blocks`);
    if (s.stilts) line('stilts', `${s.stilts.piles} piles over ${s.stilts.open} columns of open water, ${s.stilts.lanterns} seabed lanterns`);
    if (s.fishSpawners) line('fish spawners', `${s.fishSpawners} in the park ponds`);
    if (s.lighting) line('lighting', `${s.lighting.added} lights (${s.lighting.hung} hung, ${s.lighting.flush} in the floor, ${s.lighting.standing} standing) · ${s.lighting.darkAfter} dark spots left of ${s.lighting.darkBefore}`);
    if (s.flood) line('sunken', `the sea ${s.flood.surface} up over ${s.flood.columns.toLocaleString()} columns · a glass wall of ${s.flood.wall.toLocaleString()}, ${s.flood.doors} doors · ${s.flood.conduits} conduit${s.flood.conduits === 1 ? '' : 's'} · ${s.flood.kelp} kelp, ${s.flood.seagrass} seagrass, ${s.flood.coral} coral · ${s.flood.life} sea creatures, ${s.flood.fish} fish${s.flood.drowned ? `, ${s.flood.drowned} drowned` : ''}`);
    if (s.floodDry) line('sunken', s.floodDry);
    if (s.sea) line('under the sea', `a hall ${s.sea.wide} by ${s.sea.deep}, walls ${s.sea.wall} high, ${s.sea.top} to its top, the sea's surface ${s.sea.surface} up · ${s.sea.glass.toLocaleString()} glass, ${s.sea.ribs.toLocaleString()} ribs · ${s.sea.tunnels} tunnels out · ${s.sea.kelp} kelp, ${s.sea.seagrass} seagrass, ${s.sea.coral} coral, ${s.sea.pickles} sea pickles, ${s.sea.fish} fish`);
    if (s.dome) line('dome', `radius ${s.dome.radius}, ${s.dome.height} high, ${s.dome.cells.toLocaleString()} blocks, ${s.dome.doors} doors`);
    if (s.hostiles) line('hostile mobs', `${s.hostiles}${result && result.cfg.hostiles ? ' (summoned by populate)' : ' (via /function …/hostiles)'}`);
    if (s.megaliths && s.megaliths.length) line('standing stones', s.megaliths.join(', '));
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
  const st = read.stats || null;
  // chunks that have blocks but no heightmap record: work the heights out
  // from the blocks, so they show and can be built on
  let rebuilt = 0;
  if (st && st.blocksOnly && st.blocksOnly.length) {
    wstatus(`${st.blocksOnly.length.toLocaleString()} chunks have blocks but no heightmap; reading their blocks…`);
    await new Promise((r) => setTimeout(r, 30));
    const hs = rebuildHeights(read.zip, read.index, st.blocksOnly);
    for (const [name, h] of hs) { chunks.set(name, h); rebuilt++; }
  }
  if (!chunks.size) { wstatus('no chunks found in that file'); return; }
  // a Bedrock world keeps its blocks; hold on to what is needed to read the
  // ones under a chosen site
  const bare = new Set(st && st.bare ? st.bare : []);
  if (st && st.blocksOnly) for (const n of st.blocksOnly) if (!chunks.has(n)) bare.add(n);
  world = { chunks, info, near: spawn, view: spawn, site: null, kind, zip: read.zip || null, index: read.index || null, bare };
  $('coordRow').style.display = 'flex';
  wstatus(`${info ? info.name + ' (' + kind + '): ' : ''}${chunks.size.toLocaleString()} chunks read in ${((Date.now() - t0) / 1000).toFixed(0)}s`
    + (st ? worldReport(st, rebuilt, bare, read.census) : '') + '. Click the map to place the city, or type coordinates to go there.');
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
      if (!h) {
        const name = (near[0] - R + cx) + ',' + (near[1] - R + cz);
        if (world.bare && world.bare.has(name)) put(cx, cz, 110, 36, 36);   // records, no terrain
        else put(cx, cz, 24, 24, 24);                                      // not in the world
        continue;
      }
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
  updatePregen();
  $('mapScale').textContent = `showing ${R * 32} blocks across · scroll to zoom`
    + (world.bare && world.bare.size ? ' · red: chunk has records but no terrain' : '');
}

// ---- Chunk Pregen ---------------------------------------------------------
// The pregen panel: shown for Bedrock worlds, with a command for the chosen
// site (plus a margin) and one for everything the map is showing.
function pregenTargets() {
  const { R, near } = mapView();
  return {
    site: world.site ? siteRegion(world.site) : null,
    view: viewRegion(near, R),
  };
}

function updatePregen() {
  const box = $('pregenBox');
  if (!world || world.kind !== 'bedrock') { box.style.display = 'none'; return; }
  box.style.display = 'block';
  const t = pregenTargets();
  const bs = $('pregenSite');
  bs.style.display = t.site ? 'block' : 'none';
  if (t.site) bs.textContent = `Copy command for this site (${regionChunks(t.site).toLocaleString()} chunks)`;
  $('pregenView').textContent = `Copy command for the map view (${regionChunks(t.view).toLocaleString()} chunks)`;
  box.classList.toggle('urgent', !!(world.site && world.site.coverage < 0.6));
}

function copyText(text, msg) {
  const done = () => toast(msg);
  const fallback = () => {
    const t = document.createElement('textarea');
    t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    t.remove();
    if (ok) done(); else toast('Copy failed: ' + text, true);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(fallback);
  else fallback();
}

function copyPregen(which) {
  if (!world) return;
  const r = pregenTargets()[which];
  if (!r) { toast('Choose a site first.', true); return; }
  copyText(pregenCommand(r), `Copied: paste it into chat in your world (${regionChunks(r).toLocaleString()} chunks)`);
}

async function downloadPregen(legacy) {
  try {
    const data = await buildPregenPack(legacy);
    download(data, pregenFileName(legacy));
    toast(`${pregenFileName(legacy)}: open it to add it to Minecraft`);
  } catch (err) {
    toast('Could not build the pack: ' + err.message, true);
  }
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
  markFitted();
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
      : g.coverage < 0.6
        ? '<br><b>Too little of this is explored</b>: fill it in with Chunk Pregen below, or try nearby.'
        : '<br><b>Too little of this is buildable</b>: try nearby.');
  $('useSite').style.display = ok ? 'block' : 'none';
  $('copyTp').style.display = 'none';        // both spots depend on the city, so they appear after it is generated
  showCentreSpot();
}

// The preview shows the city standing in the real land when one is loaded:
// the land is added to a copy of the world, so the export is untouched by it.
function previewWorld(res) {
  if (res.world.sea) return seaPreview(res);
  if (!res.shell || !res.shell.length) return res.world;
  const copy = new VoxelWorld({ budget: res.cfg.budget + res.shell.length + 1000 });
  res.world.forEach((x, y, z, id) => copy.set(x, y, z, id));
  for (const [x, y, z, id] of res.shell) if (!copy.has(x, y, z)) copy.set(x, y, z, id);
  copy.cityMask = res.world.cityMask;
  return copy;
}

// the sea round a hall under it is not blocks of the world (the exports write it):
// the preview shows its surface (the cutaway slider looks in under it)
function seaPreview(res) {
  const sea = res.world.sea, b = sea.box;
  const copy = new VoxelWorld({ budget: res.cfg.budget + (b.x1 - b.x0 + 1) * (b.z1 - b.z0 + 1) + 1000 });
  res.world.forEach((x, y, z, id) => copy.set(x, y, z, id));
  const put = (x, y, z) => { if (!copy.has(x, y, z) && sea.at(x, y, z)) copy.set(x, y, z, MAT.WATER); };
  for (let x = b.x0 + 1; x < b.x1; x++) for (let z = b.z0 + 1; z < b.z1; z++) put(x, sea.S, z);
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
  const files = javaPackFiles(tiles, { namespace: ns, description: summaryLine(), name: cityName(),
    hostiles: result.hostiles || [], box: result.world.box });
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
      hostiles: result.hostiles || [], hostilesInPopulate: !!result.cfg.hostiles, inmates: result.inmates || [], zoo: result.zoo || [], stands: result.stands || [], places: result.places || [],
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
