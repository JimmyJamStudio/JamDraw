// Saving: autosave in the browser (IndexedDB), .jamdraw files, SVG and PNG export, opening and placing SVGs.
import { S, emit, toast, DEFAULT_SWATCHES } from './state.js';
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
async function put(key, val) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(val, key);
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}
async function get(key) {
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
    active: paper.project.activeLayer ? paper.project.activeLayer.index : 0,
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
  saveTimer = setTimeout(() => put(KEY, serialize()).catch((e) => console.warn('autosave failed', e)), 600);
}
export async function restoreAutosave() {
  try {
    const data = await get(KEY);
    if (data && data.app === 'JamDraw') { load(data); return true; }
  } catch (e) { console.warn('restore failed', e); }
  return false;
}

export function newDoc() {
  load({ doc: { name: 'Untitled', w: S.doc.w, h: S.doc.h, transparent: S.doc.transparent }, swatches: S.swatches, project: null });
  scheduleAutosave();
}

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const safeName = () => (S.doc.name || 'drawing').replace(/[^\w\- ]+/g, '').trim() || 'drawing';

export function saveFile() {
  download(safeName() + '.jamdraw', new Blob([JSON.stringify(serialize())], { type: 'application/json' }));
}

// SVG of the page area only (Paper writes hidden layers as visibility="hidden").
export function svgString() {
  let svg = paper.project.exportSVG({ asString: true, bounds: new paper.Rectangle(0, 0, S.doc.w, S.doc.h), precision: 3 });
  if (!S.doc.transparent) svg = svg.replace(/(<svg[^>]*>)/, `$1<rect width="${S.doc.w}" height="${S.doc.h}" fill="#ffffff"/>`);
  return svg;
}
export function exportSVG() {
  download(safeName() + '.svg', new Blob([svgString()], { type: 'image/svg+xml' }));
}
export function exportPNG(size) {
  const svg = svgString();
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  img.onload = () => {
    const k = size / Math.max(S.doc.w, S.doc.h);
    const c = document.createElement('canvas');
    c.width = Math.round(S.doc.w * k);
    c.height = Math.round(S.doc.h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    c.toBlob((b) => download(`${safeName()}-${size}.png`, b), 'image/png');
  };
  img.onerror = () => toast('PNG export failed');
  img.src = url;
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
