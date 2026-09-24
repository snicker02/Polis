// tools/ui-check.mjs — run the app's front end without a browser.
//
// main.js only ever runs in a page, so a mistake there (a helper that is not
// in scope, an id that does not exist, a listener wired to nothing) never
// shows up in the validator. This gives the module just enough of a browser
// to boot: elements for every id in index.html, a canvas that records what it
// is asked to draw, and a WebGL context that accepts anything. Then it plays
// the interactions: load a world, click the map, use the site, generate.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const listeners = new Map();          // id -> { event: handler }
const elements = new Map();

function makeElement(id, tag = 'div') {
  const el = {
    id, tagName: tag, value: '', textContent: '', innerHTML: '', checked: true, files: [],
    style: new Proxy({}, { get: (t, k) => t[k] ?? '', set: (t, k, v) => { t[k] = v; return true; } }),
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    dataset: {}, children: [], width: 300, height: 300,
    appendChild(c) { this.children.push(c); return c; },
    removeChild() {}, remove() {}, insertBefore(c) { this.children.push(c); return c; },
    setAttribute() {}, getAttribute: () => null, focus() {}, click() {}, select() {}, setSelectionRange() {}, blur() {},
    addEventListener(ev, fn) { if (!listeners.has(id)) listeners.set(id, {}); listeners.get(id)[ev] = fn; },
    removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: el.width, height: el.height, right: el.width, bottom: el.height }),
    getContext: (kind) => (kind === '2d' ? ctx2d(el) : mockGL()),
    toBlob(cb) { cb(new Blob([])); },
    querySelector: () => null, querySelectorAll: () => [],
  };
  return el;
}

function ctx2d(el) {
  return {
    canvas: el, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', globalAlpha: 1,
    fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
    arc() {}, save() {}, restore() {}, translate() {}, scale() {}, rotate() {}, drawImage() {}, fillText() {},
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {}, getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    measureText: () => ({ width: 10 }),
  };
}

function mockGL() {
  const gl = new Proxy({}, {
    get: (t, k) => {
      if (k in t) return t[k];
      if (typeof k === 'string' && k.toUpperCase() === k) return 1;         // enum constants
      return (...a) => {
        if (/^create/.test(k)) return {};
        if (k === 'getShaderParameter' || k === 'getProgramParameter') return true;
        if (k === 'getUniformLocation') return {};
        if (k === 'getAttribLocation') return 0;
        if (k === 'getExtension') return null;
        return undefined;
      };
    },
  });
  return gl;
}

export async function runUiCheck(worldFile) {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  for (const id of ids) elements.set(id, makeElement(id, /canvas/i.test(id) ? 'canvas' : 'div'));
  // give the controls the values the page ships with, so the app sees real
  // numbers rather than empty strings
  for (const tag of html.matchAll(/<input[^>]*>/g)) {
    const id = (tag[0].match(/id="([^"]+)"/) || [])[1];
    if (!id || !elements.has(id)) continue;
    const v = (tag[0].match(/value="([^"]*)"/) || [])[1];
    if (v !== undefined) elements.get(id).value = v;
    elements.get(id).checked = /checked/.test(tag[0]);
  }
  for (const sel of html.matchAll(/<select[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const id = sel[1];
    if (!elements.has(id)) continue;
    const opts = [...sel[2].matchAll(/<option value="([^"]+)"([^>]*)>/g)];
    const chosen = opts.find((o) => /selected/.test(o[2])) || opts[0];
    if (chosen) elements.get(id).value = chosen[1];
  }

  // the page carries its version on <body data-version="…">, which the app
  // checks before exporting
  const pageVersion = (html.match(/data-version="([^"]+)"/) || [])[1] || '';
  const body = makeElement('body');
  body.dataset.version = pageVersion;
  const doc = {
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => makeElement('created-' + tag, tag),
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, body, documentElement: makeElement('html'),
    execCommand: () => true,
    createElementNS: (ns, tag) => makeElement('created-' + tag, tag),
  };
  const problems = [];
  globalThis.document = doc;
  globalThis.window = { addEventListener() {}, devicePixelRatio: 1, requestAnimationFrame: () => 0, location: { href: '', search: '' },
    matchMedia: () => ({ matches: false, addEventListener() {} }), URL: { createObjectURL: () => 'blob:', revokeObjectURL() {} } };
  const copied = [];
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'node', clipboard: { writeText: async (t) => { copied.push(t); } } }, configurable: true });
  } catch {}
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.Blob = globalThis.Blob || class { constructor(parts = []) { this.parts = parts; this.size = 0; } };
  // leave the real URL alone (node needs it); the app uses window.URL for blobs
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = () => 'blob:stub';
    globalThis.URL.revokeObjectURL = () => {};
  }
  globalThis.alert = (m) => problems.push('alert: ' + m);
  globalThis.onerror = (m) => problems.push('error: ' + m);

  await import(join(root, 'main.js') + '?ui=' + Date.now());

  const fire = (id, event, arg) => {
    const l = listeners.get(id);
    if (!l || !l[event]) { problems.push(`no ${event} handler on #${id}`); return; }
    return l[event](arg);
  };

  // The app defers work with timers, which can fire after we are done, so the
  // stub browser stays in place rather than being torn down under them.
  const cleanup = () => {};
  // with no world given, just exercise the rest of the front end
  if (!worldFile) {
    fire('worldMap', 'click', { clientX: 96, clientY: 96 });           // must be harmless with nothing loaded
    for (const id of ['gen', 'reroll']) if (listeners.has(id)) fire(id, 'click');
    await new Promise((r) => setTimeout(r, 400));          // generation may be deferred a frame
    // and the exports, both editions: they must not throw
    const downloads = [];
    globalThis.URL.createObjectURL = (blob) => { downloads.push(blob); return 'blob:stub'; };
    for (const edition of ['bedrock', 'java']) {
      elements.get('edition').value = edition;
      fire('edition', 'change');
      fire('mcpack', 'click');
      await new Promise((r) => setTimeout(r, 2500));
    }
    const said = (elements.get('toast') || {}).textContent || '';
    problems.push(...(downloads.length >= 2 ? [] : [`only ${downloads.length} exports produced a file; the app said: ${said}`]));
    // with nothing chosen, the teleport button must be hidden and harmless
    fire('copyTp', 'click');
    const out = { problems, status: elements.get('worldStatus').textContent, info: elements.get('siteInfo').innerHTML,
      offered: false, tpHidden: elements.get('copyTp').style.display !== 'block', copied, downloads: downloads.length,
      cornerCopy: null, centreCopy: null,
      ids: ids.length, wired: listeners.size, stats: (elements.get('stats') || {}).innerHTML || '' };
    cleanup();
    return out;
  }

  // load a world, as the file input would
  const bytes = readFileSync(worldFile);
  const file = { name: 'test.mcworld', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  elements.get('worldFile').files = [file];
  await fire('worldFile', 'change', { target: { files: [file] } });
  await new Promise((r) => setTimeout(r, 50));
  const status = elements.get('worldStatus').textContent;

  // type coordinates, as if pasted from the game's F3 screen
  const spawn = [-32, 69, -32];
  elements.get('siteCoords').value = `${spawn[0]}.11 ${spawn[1]}.00 ${spawn[2]}.98`;
  fire('goCoords', 'click');
  const typed = elements.get('siteInfo').innerHTML;

  // click the middle of the map, then take the site
  fire('worldMap', 'click', { clientX: 96, clientY: 96 });
  const info = elements.get('siteInfo').innerHTML;
  const offered = elements.get('useSite').style.display === 'block';
  if (offered) fire('useSite', 'click');                   // generate, so both spots exist
  await new Promise((r) => setTimeout(r, 300));
  const tpLabel = elements.get('copyTp').textContent;
  const tpCentreLabel = elements.get('copyTpCentre').textContent;
  copied.length = 0;
  fire('copyTp', 'click');
  fire('copyTpCentre', 'click');
  const [cornerCopy, centreCopy] = copied;

  const result = { problems, status, info, typed, offered, tpLabel, tpCentreLabel, cornerCopy, centreCopy, copied, ids: ids.length, wired: listeners.size,
    stats: (elements.get('stats') || {}).innerHTML || '' };
  cleanup();
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('ui-check.mjs')) {
  const r = await runUiCheck(process.argv[2]);
  console.log('ids in the page:', r.ids, '· elements wired up:', r.wired);
  console.log('after loading the world:', r.status);
  console.log('after typing coordinates:', (r.typed || '(nothing)').replace(/<[^>]+>/g, ''));
  console.log('after clicking the map:', (r.info || '(nothing)').replace(/<[^>]+>/g, ''));
  console.log('site offered:', r.offered, '| teleport button:', r.tpLabel || '(none)');
  console.log('corner button:', r.tpLabel || '(none)', '=> copied', r.cornerCopy || '(nothing)');
  console.log('centre button:', r.tpCentreLabel || '(none)', '=> copied', r.centreCopy || '(nothing)');
  console.log('exports produced:', r.downloads === undefined ? 'n/a' : r.downloads);
  console.log('problems:', r.problems.length ? r.problems : 'none');
  if (r.stats) console.log('stats panel:', r.stats.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300));
}
