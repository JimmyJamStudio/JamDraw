// Shared state, a tiny event bus and small helpers used by every module.

export const DEFAULT_SWATCHES = [
  '#1d1418', '#ffffff', '#fbf3e4', '#d22a5a', '#8f1238', '#f05a7e',
  '#ffb3c6', '#f2c14e', '#6b3f1f', '#d9a066', '#4a4a4a', '#9a9a9a',
];

export const S = {
  tool: 'select',
  fill: '#d22a5a',          // null = no fill
  stroke: '#1d1418',        // null = no stroke
  strokeWidth: 8,
  chip: 'fill',             // which colour the swatches and picker edit
  brush: { size: 18, pressure: true, mode: 'ink', merge: true, smooth: 2 },
  eraser: { size: 24 },
  bucket: { gap: 3 },       // fill bucket: close gaps in lines this many screen pixels wide
  text: { font: 'lilita-one-400', size: 140, spacing: 0, lineHeight: 1.1, align: 'center' },
  shape: { kind: 'rect', radius: 0, sides: 6, points: 5, inner: 0.5 },
  doc: { name: 'Untitled', w: 1024, h: 1024, transparent: false },
  swatches: DEFAULT_SWATCHES.slice(),
  sketch: null,             // { src, x, y, scale, opacity, visible, angle, flip }
  sketchMove: false,
  snap: { on: true, grid: false, size: 32 }, // snap to the page and shapes; the grid, and its spacing
  guides: null,             // what just snapped: { x, y } in drawing units, for the overlay
  sawPen: false,            // after a pen touches the screen, fingers only pan and zoom
  sel: [],                  // selected top-level items (select tool)
  node: { path: null, segs: new Set() }, // direct-select tool
};

const handlers = {};
export function on(name, fn) { (handlers[name] ||= []).push(fn); }
export function emit(name, data) { (handlers[name] || []).forEach((fn) => fn(data)); }

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// An angle in degrees, between -180 and 180.
export const normAngle = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

let toastTimer = 0;
export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// Layers the user can draw on and items they can pick.
export function editableLayer(layer) { return layer && layer.visible && !layer.locked; }
export function topItem(item) {
  while (item && item.parent && !(item.parent instanceof paper.Layer)) item = item.parent;
  return item;
}
export function isEditable(item) {
  const top = topItem(item);
  return !!top && top.visible && !top.locked && editableLayer(top.layer);
}
export function zOrder(items) {
  // Bottom first: compare by layer index, then by index path inside the layer.
  const key = (it) => {
    const path = [];
    for (let n = it; !(n instanceof paper.Layer); n = n.parent) path.unshift(n.index);
    path.unshift(it.layer.index);
    return path;
  };
  return items.slice().sort((a, b) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      const d = (ka[i] ?? -1) - (kb[i] ?? -1);
      if (d) return d;
    }
    return 0;
  });
}
export function unionBounds(items) {
  let r = null;
  for (const it of items) r = r ? r.unite(it.bounds) : it.bounds.clone();
  return r;
}
export function setStyle(item, { fill = S.fill, stroke = S.stroke, width = S.strokeWidth } = {}) {
  item.fillColor = fill ? new paper.Color(fill) : null;
  item.strokeColor = stroke && width > 0 ? new paper.Color(stroke) : null;
  item.strokeWidth = width;
  item.strokeJoin = 'round';
  item.strokeCap = 'round';
}
// A file name from the drawing's name: letters, digits, spaces and dashes ("drawing" if nothing is left).
export const fileName = () => S.doc.name.replace(/[^\w\- ]+/g, '').trim() || 'drawing';

export function colorHex(c) {
  if (!c) return null;
  const a = c.alpha ?? 1;
  return a < 1 ? c.toCSS(true) + Math.round(a * 255).toString(16).padStart(2, '0') : c.toCSS(true);
}
