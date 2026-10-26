// Saving: autosave in the browser (IndexedDB), .jamdraw files, SVG and PNG export, opening and placing SVGs.
import { S, emit, toast, DEFAULT_SWATCHES, fileName } from './state.js';
import { resetHistory, commit } from './history.js';
import { fit, changed } from './view.js';

const DB = 'jamdraw', STORE = 'kv', KEY = 'current';
let dbp = null;
function db() {
  dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
export async function kvPut(key, val) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(val, key);
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}
export async function kvGet(key) {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export function serialize() {
  return {
    app: 'JamDraw', version: 1,
    doc: S.doc, swatches: S.swatches, sketch: S.sketch,
    style: { fill: S.fill, stroke: S.stroke, strokeWidth: S.strokeWidth },
    snap: S.snap,
    active: paper.project.activeLayer.index,
    project: paper.project.exportJSON({ asString: false }),
  };
}
function load(data) {
  const p = paper.project;
  p.clear();
  if (data.project) p.importJSON(data.project);
  if (!p.layers.length) new paper.Layer({ name: 'Layer 1' });
  (p.layers[data.active] || p.layers[p.layers.length - 1]).activate();
  Object.assign(S.doc, data.doc || {});
  S.swatches = data.swatches && data.swatches.length ? data.swatches : DEFAULT_SWATCHES.slice();
  S.sketch = data.sketch || null;
  if (data.style) Object.assign(S, data.style);
  if (data.snap) Object.assign(S.snap, data.snap);
  S.sel = [];
  S.node.path = null;
  S.node.segs.clear();
  resetHistory();
  fit();
  emit('changed');
  emit('style');
  emit('selection');
}

let saveTimer = 0;
export function scheduleAutosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => kvPut(KEY, serialize()).catch((e) => console.warn('autosave failed', e)), 600);
}
export async function restoreAutosave() {
  try {
    const data = await kvGet(KEY);
    if (data && data.app === 'JamDraw') { load(data); return true; }
  } catch (e) { console.warn('restore failed', e); }
  return false;
}

export function newDoc() {
  load({ doc: { name: 'Untitled', w: S.doc.w, h: S.doc.h, transparent: S.doc.transparent }, swatches: S.swatches, project: null });
  scheduleAutosave();
}

export function saveFile() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(serialize())], { type: 'application/json' }));
  a.download = fileName() + '.jamdraw';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function readFile(file, as = 'text') {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    as === 'url' ? r.readAsDataURL(file) : r.readAsText(file);
  });
}

export async function openFile(file) {
  const text = await readFile(file);
  if (/\.svg$/i.test(file.name) || text.trimStart().startsWith('<')) {
    newDoc();
    const item = paper.project.activeLayer.importSVG(text, { expandShapes: true, insert: true });
    const m = text.match(/viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/);
    if (m) { S.doc.w = Math.round(+m[1]); S.doc.h = Math.round(+m[2]); }
    else { S.doc.w = Math.ceil(item.bounds.right); S.doc.h = Math.ceil(item.bounds.bottom); }
    S.doc.name = file.name.replace(/\.svg$/i, '');
    resetHistory();
    fit();
    emit('changed');
    return;
  }
  let data;
  try { data = JSON.parse(text); } catch { toast('That file could not be read'); return; }
  if (data.app !== 'JamDraw') { toast('That is not a JamDraw file'); return; }
  load(data);
  scheduleAutosave();
}

export async function placeSVG(file) {
  const text = await readFile(file);
  const item = paper.project.activeLayer.importSVG(text, { expandShapes: true, insert: true });
  const page = new paper.Rectangle(0, 0, S.doc.w, S.doc.h);
  if (item.bounds.width > page.width || item.bounds.height > page.height) item.fitBounds(page.scale(0.8));
  item.position = page.center;
  commit();
  return item;
}

// The sketch's main colors, busiest first. Counts a small copy's pixels in coarse color boxes, leaving out pixels on
// an edge between two colors (the blends there aren't colors anyone picked), then takes each busy box's average
// color unless it's close to one already taken; small boxes only count when their color stands out (a green leaf).
export function sketchColors(max = 10) {
  const img = document.getElementById('sketch');
  const k = Math.min(1, 256 / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  const W = (c.width = Math.max(2, Math.round(img.naturalWidth * k)));
  c.height = Math.max(2, Math.round(img.naturalHeight * k));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const box = (i) => ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
  const boxes = new Map();
  let total = 0;
  for (let i = 0; i < d.length - W * 4; i += 4) {
    const key = box(i);
    if (d[i + 3] < 128 || box(i + 4) !== key || box(i + W * 4) !== key) continue;
    if (!boxes.has(key)) boxes.set(key, { n: 0, r: 0, g: 0, b: 0 });
    const b = boxes.get(key);
    b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
    total++;
  }
  const out = [];
  const dist = (rgb) => Math.min(...out.map((o) => Math.hypot(o[0] - rgb[0], o[1] - rgb[1], o[2] - rgb[2])));
  for (const b of [...boxes.values()].sort((p, q) => q.n - p.n)) {
    if (out.length === max || b.n < 4) break;
    const rgb = [b.r / b.n, b.g / b.n, b.b / b.n];
    if (dist(rgb) >= (b.n >= total * 0.002 ? 20 : 80)) out.push(rgb);
  }
  return out.map((rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join(''));
}

export async function loadSketch(file) {
  const src = await readFile(file, 'url');
  const img = new Image();
  img.onload = () => {
    const k = Math.min(S.doc.w / img.naturalWidth, S.doc.h / img.naturalHeight);
    S.sketch = {
      src, opacity: 0.4, visible: true, scale: k,
      x: (S.doc.w - img.naturalWidth * k) / 2, y: (S.doc.h - img.naturalHeight * k) / 2,
      w: img.naturalWidth, h: img.naturalHeight,
    };
    changed();
    emit('sketch');
    scheduleAutosave();
  };
  img.src = src;
}
