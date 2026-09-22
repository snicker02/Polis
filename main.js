// main.js — Polis UI.

import { generateCity, generateSingle, DEFAULTS } from './engine/city.js';
import { USE } from './engine/plan.js';
import { verifyAll } from './engine/verify.js';
import { buildMesh } from './engine/mesher.js';
import { Renderer } from './engine/renderer.js';
import { exportPack, exportStructuresZip, tileList, commandList, cityId, exportSalt, POLIS_VERSION } from './engine/export.js';
import { THEMES } from './engine/materials.js';

const VERSION = '0.2.3';
const $ = (id) => document.getElementById(id);

const SLIDERS = {
  size: 0, minBlock: 0, blockIrregularity: 2, avenueWidth: 0, streetWidth: 0,
  downtownRadius: 2, zoneNoise: 2, parkChance: 2, lotDowntown: 0, lotSuburb: 0,
  maxFloors: 0, pitch: 0, setbackEvery: 0, bw: 0, bd: 0, floors: 0, clip: 0,
  farmChance: 2, pondChance: 2, villagers: 0, wallHeight: 0, foundation: 0, clearAbove: 0,
};
const CHECKS = ['setback', 'roofAccess', 'useStairs', 'lights', 'lamps', 'trees', 'markings'];

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
      const mesh = buildMesh(result.world);
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
function exportOpts() {
  return { fillAir: $('fillAir').checked, foundation: Number($('foundation').value) | 0, clearAbove: Number($('clearAbove').value) | 0 };
}
function nsNow() {
  return result ? cityId(result.world, result.cfg.seed, POLIS_VERSION, exportSalt(exportOpts())) : 'polis';
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
    const out = kind === 'mcpack'
      ? await exportPack(result.world, opts)
      : await exportStructuresZip(result.world, opts);
    // same spelling as the city id used in game: polis_<seed>_<hash>_v<version>
    const name = `${cityNs}_v${VERSION}.` + (kind === 'mcpack' ? 'mcpack' : 'zip');
    download(out.data, name);
    toast(`${name} — in game: /function ${cityNs}/build_centered, then populate_centered`);
  } catch (e) {
    console.error(e);
    toast('Export failed: ' + e.message, true);
  } finally {
    $('mcpack').disabled = $('mcstruct').disabled = false;
    busy(false);
  }
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
