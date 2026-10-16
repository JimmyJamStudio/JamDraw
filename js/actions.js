// Things you do to the selection: delete, duplicate, copy/paste, group, arrange, flip, align, combine shapes,
// outline a stroke, add a sticker outline, and apply colours.
import { S, emit, toast, zOrder, unionBounds, colorHex } from './state.js';
import { commit } from './history.js';
import { setSelection } from './tools.js';
import { redrawOverlay } from './view.js';

const isShape = (it) => it instanceof paper.Path || it instanceof paper.CompoundPath;
let clipboard = null;

function need(n = 1) {
  if (S.sel.length >= n) return true;
  toast(n === 1 ? 'Select something first' : `Select ${n} or more shapes`);
  return false;
}
function done(sel) {
  commit();
  setSelection(sel ?? S.sel.filter((i) => i.parent));
}

export function deleteSel() {
  if (!S.sel.length) return;
  S.sel.forEach((it) => it.remove());
  done([]);
}
export function duplicateSel() {
  if (!need()) return;
  const off = 10 / paper.view.zoom;
  done(zOrder(S.sel).map((it) => it.clone().translate(new paper.Point(off, off))));
}
export function copySel() {
  if (!need()) return false;
  clipboard = zOrder(S.sel).map((it) => it.exportJSON({ asString: true }));
  toast(`Copied ${clipboard.length}`);
  return true;
}
export function cutSel() { if (copySel()) deleteSel(); }
export function paste() {
  if (!clipboard) return;
  const layer = paper.project.activeLayer;
  const off = 12 / paper.view.zoom;
  const items = clipboard.map((j) => {
    const it = paper.project.importJSON(j);
    if (it.parent !== layer) layer.addChild(it);
    return it.translate(new paper.Point(off, off));
  });
  done(items);
}
export function selectAll() {
  const l = paper.project.activeLayer;
  if (l && l.visible && !l.locked) setSelection(l.children.filter((c) => c.visible && !c.locked));
}

export function groupSel() {
  if (!need(2)) return;
  const items = zOrder(S.sel);
  const g = new paper.Group();
  g.insertAbove(items[items.length - 1]);
  g.addChildren(items);
  done([g]);
}
export function ungroupSel() {
  const out = [];
  for (const it of S.sel) {
    if (it instanceof paper.Group && !(it instanceof paper.Layer)) {
      const kids = it.removeChildren();
      for (const k of kids) { k.insertBelow(it); out.push(k); }
      it.remove();
    } else out.push(it);
  }
  done(out);
}

export function arrange(how) {
  if (!need()) return;
  const items = zOrder(S.sel);
  if (how === 'front') items.forEach((it) => it.bringToFront());
  else if (how === 'back') items.slice().reverse().forEach((it) => it.sendToBack());
  else if (how === 'forward') items.slice().reverse().forEach((it) => { if (it.nextSibling && !S.sel.includes(it.nextSibling)) it.insertAbove(it.nextSibling); });
  else if (how === 'backward') items.forEach((it) => { if (it.previousSibling && !S.sel.includes(it.previousSibling)) it.insertBelow(it.previousSibling); });
  done();
}

export function flip(axis) {
  if (!need()) return;
  const c = unionBounds(S.sel).center;
  S.sel.forEach((it) => it.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1, c));
  done();
}

// Align to each other, or to the page when one thing is selected.
export function align(how) {
  if (!need()) return;
  const page = new paper.Rectangle(0, 0, S.doc.w, S.doc.h);
  const ref = S.sel.length > 1 ? unionBounds(S.sel) : page;
  for (const it of S.sel) {
    const b = it.bounds;
    let dx = 0, dy = 0;
    if (how === 'left') dx = ref.left - b.left;
    if (how === 'hcenter') dx = ref.center.x - b.center.x;
    if (how === 'right') dx = ref.right - b.right;
    if (how === 'top') dy = ref.top - b.top;
    if (how === 'vcenter') dy = ref.center.y - b.center.y;
    if (how === 'bottom') dy = ref.bottom - b.bottom;
    if (how === 'page') { dx = page.center.x - b.center.x; dy = page.center.y - b.center.y; }
    it.translate(new paper.Point(dx, dy));
  }
  if (how === 'page' && S.sel.length > 1) {
    // Centre the whole selection as one block instead.
    const u = unionBounds(S.sel);
    const d = page.center.subtract(u.center);
    S.sel.forEach((it) => it.translate(d));
  }
  done();
}

// Combine shapes (bottom-most keeps its colours).
export function combine(op) {
  const items = zOrder(S.sel).filter(isShape);
  if (items.length < 2) { toast('Select 2 or more shapes (ungroup groups first)'); return; }
  let res;
  try {
    if (op === 'subtract') {
      res = items[0];
      for (const it of items.slice(1)) res = res.subtract(it, { insert: false });
    } else {
      res = items[0];
      for (const it of items.slice(1)) res = res[op](it, { insert: false });
    }
  } catch (e) {
    toast('Those shapes could not be combined');
    return;
  }
  res.insertAbove(items[items.length - 1]);
  items.forEach((it) => it.remove());
  done([res]);
}

// Turn strokes into filled shapes, so they can be combined and edited like anything else.
export function outlineStroke() {
  if (!need()) return;
  const out = [];
  let any = false;
  for (const it of zOrder(S.sel)) {
    if (!isShape(it) || !it.strokeColor || !it.strokeWidth) { out.push(it); continue; }
    let o;
    try {
      o = paperjsOffset.offsetStroke(it, it.strokeWidth / 2, { join: it.strokeJoin === 'miter' ? 'miter' : 'round', cap: it.strokeCap === 'butt' ? 'butt' : 'round', insert: false });
    } catch { out.push(it); continue; }
    o.fillColor = it.strokeColor.clone();
    o.strokeColor = null;
    o.insertAbove(it);
    out.push(o);
    any = true;
    if (it.fillColor) { it.strokeColor = null; out.push(it); } else it.remove();
  }
  if (!any) { toast('Nothing selected has a stroke'); return; }
  done(out);
}

// A sticker outline: one solid shape around everything selected, placed underneath (stroke colour, stroke width).
export function stickerOutline() {
  const items = zOrder(S.sel);
  if (!items.length) { toast('Select something first'); return; }
  const shapes = [];
  const collect = (it) => {
    if (isShape(it)) {
      let s = it.clone({ insert: false });
      if (it.strokeColor && it.strokeWidth && !it.closed) {
        try { s = paperjsOffset.offsetStroke(it, it.strokeWidth / 2, { join: 'round', cap: 'round', insert: false }); } catch {}
      }
      shapes.push(s);
    } else if (it.children) it.children.forEach(collect);
  };
  items.forEach(collect);
  if (!shapes.length) { toast('Nothing to outline'); return; }
  let u = shapes[0];
  try {
    for (const s of shapes.slice(1)) u = u.unite(s, { insert: false });
    const width = Math.max(1, S.strokeWidth);
    const o = paperjsOffset.offset(u, width, { join: 'round', insert: false });
    o.fillColor = new paper.Color(S.stroke || '#1d1418');
    o.strokeColor = null;
    o.insertBelow(items[0]);
    done([o, ...items]);
    toast('Outline added underneath (stroke color, stroke width)');
  } catch (e) {
    console.error(e);
    toast('Could not build the outline for that selection');
  }
}

// Colours and stroke for the selection.
function eachShape(fn) {
  const walk = (it) => {
    if (isShape(it) || it instanceof paper.PointText) fn(it);
    else if (it.children) it.children.forEach(walk);
  };
  S.sel.forEach(walk);
}
export function applyStyleToSel(what) {
  if (!S.sel.length) return;
  eachShape((it) => {
    if (what === 'fill') it.fillColor = S.fill ? new paper.Color(S.fill) : null;
    if (what === 'stroke') it.strokeColor = S.stroke && S.strokeWidth > 0 ? new paper.Color(S.stroke) : null;
    if (what === 'width') {
      it.strokeWidth = S.strokeWidth;
      if (S.strokeWidth > 0 && !it.strokeColor && S.stroke) it.strokeColor = new paper.Color(S.stroke);
    }
  });
  commit();
  redrawOverlay();
}
export function applyOpacity(v, final) {
  S.sel.forEach((it) => { it.opacity = v; });
  if (final) commit();
}
// Show the first selected shape's colours in the panel.
export function readSelStyle() {
  let first = null;
  const walk = (it) => { if (!first && isShape(it)) first = it; else if (!first && it.children) it.children.forEach(walk); };
  S.sel.forEach(walk);
  if (!first) return false;
  S.fill = colorHex(first.fillColor);
  S.stroke = colorHex(first.strokeColor);
  if (first.strokeColor) S.strokeWidth = first.strokeWidth;
  emit('style');
  return true;
}
