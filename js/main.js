// JamDraw: boot, pointer input (mouse, drawing tablet, phone stylus, fingers) and keyboard shortcuts.
import { S, on, emit } from './state.js';
import { resetHistory, undo, redo } from './history.js';
import { initView, toProject, zoomAt, zoomCenter, panBy, fit, changed, redrawOverlay, overlay, stage } from './view.js';
import { TOOLS, setSelection, deleteNodes } from './tools.js';
import * as A from './actions.js';
import { restoreAutosave, scheduleAutosave, saveFile } from './store.js';
import { buildUI, setTool, act } from './ui.js';
import { loadFontList } from './text.js';
import { initTextUI } from './textui.js';
import { exportDialog } from './export.js';

function drawOverlay(ctx) {
  const t = TOOLS[S.tool];
  if (t.overlay) t.overlay(ctx);
  // Brush and eraser size ring under the pen or mouse.
  if ((S.tool === 'brush' || S.tool === 'eraser') && hover && !active) {
    const size = S.tool === 'brush' ? S.brush.size : S.eraser.size;
    ctx.beginPath();
    ctx.arc(hover.x, hover.y, Math.max(2, (size / 2) * paper.view.zoom), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.8)';
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ---------------------------------------------------------------- pointer input
const touches = new Map();
let gesture = null;   // two-finger pinch / pan
let panning = null;   // { x, y }
let sketchDrag = null;
let active = false;   // a tool stroke is in progress
let hover = null;     // last hover point, screen space
let spaceDown = false;
let lastDown = { t: 0, x: 0, y: 0 };

function makeEv(e, detail = 1) {
  const r = stage.getBoundingClientRect();
  return {
    pt: toProject(e.clientX, e.clientY),
    vp: new paper.Point(e.clientX - r.left, e.clientY - r.top),
    pressure: e.pointerType === 'pen' ? (e.pressure > 0 ? e.pressure : 0.5) : 1,
    shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey,
    pointerType: e.pointerType, detail,
  };
}

function gestureInfo() {
  const [a, b] = [...touches.values()];
  return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
}

overlay.addEventListener('pointerdown', (e) => {
  try { overlay.setPointerCapture(e.pointerId); } catch { /* some devices report pointers that can't be captured */ }
  document.body.classList.remove('sheet-style', 'sheet-layers');
  if (e.pointerType === 'pen') S.sawPen = true;
  const r = stage.getBoundingClientRect();
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    if (touches.size === 2) {
      if (active) { TOOLS[S.tool].cancel(); active = false; }
      panning = null;
      gesture = gestureInfo();
      return;
    }
    if (touches.size > 2) return;
    if (S.sawPen) { panning = { x: e.clientX, y: e.clientY }; return; } // palm rejection
  }
  if (e.button === 1 || spaceDown || S.tool === 'hand' || (e.pointerType === 'pen' && e.button === 5)) {
    panning = { x: e.clientX, y: e.clientY };
    overlay.style.cursor = 'grabbing';
    return;
  }
  if (e.button === 2) return;
  if (S.sketchMove && S.sketch) { sketchDrag = { x: e.clientX, y: e.clientY }; return; }
  const now = performance.now();
  const dbl = now - lastDown.t < 380 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 8;
  lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
  active = true;
  TOOLS[S.tool].down(makeEv(e, dbl ? 2 : 1));
  redrawOverlay();
});

overlay.addEventListener('pointermove', (e) => {
  const r = stage.getBoundingClientRect();
  if (e.pointerType === 'touch' && touches.has(e.pointerId)) {
    touches.set(e.pointerId, { x: e.clientX - r.left, y: e.clientY - r.top });
    if (gesture && touches.size === 2) {
      const g = gestureInfo();
      zoomAt(new paper.Point(g.cx, g.cy), g.d / gesture.d);
      panBy(g.cx - gesture.cx, g.cy - gesture.cy);
      gesture = g;
      return;
    }
  }
  if (panning) {
    panBy(e.clientX - panning.x, e.clientY - panning.y);
    panning = { x: e.clientX, y: e.clientY };
    return;
  }
  if (sketchDrag) {
    S.sketch.x += (e.clientX - sketchDrag.x) / paper.view.zoom;
    S.sketch.y += (e.clientY - sketchDrag.y) / paper.view.zoom;
    sketchDrag = { x: e.clientX, y: e.clientY };
    changed();
    return;
  }
  if (active) {
    const list = (e.getCoalescedEvents ? e.getCoalescedEvents() : []).map((c) => makeEv(c));
    const ev = makeEv(e);
    TOOLS[S.tool].drag(ev, list.length ? list : [ev]);
    return;
  }
  if (e.pointerType !== 'touch') {
    hover = new paper.Point(e.clientX - r.left, e.clientY - r.top);
    const t = TOOLS[S.tool];
    if (t.move && !spaceDown) t.move(makeEv(e));
    if (S.tool === 'brush' || S.tool === 'eraser') redrawOverlay();
  }
});

function endPointer(e) {
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId);
    if (gesture) { if (touches.size < 2) gesture = null; panning = null; return; }
  }
  if (panning) {
    panning = null;
    overlay.style.cursor = spaceDown ? 'grab' : TOOLS[S.tool].cursor;
    return;
  }
  if (sketchDrag) { sketchDrag = null; scheduleAutosave(); return; }
  if (active) {
    active = false;
    if (e.type === 'pointercancel') TOOLS[S.tool].cancel();
    else TOOLS[S.tool].up(makeEv(e));
    redrawOverlay();
  }
}
overlay.addEventListener('pointerup', endPointer);
overlay.addEventListener('pointercancel', endPointer);
overlay.addEventListener('pointerleave', () => { hover = null; redrawOverlay(); });
overlay.addEventListener('contextmenu', (e) => e.preventDefault());

stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = stage.getBoundingClientRect();
  if (e.shiftKey && !e.ctrlKey) { panBy(-e.deltaY, 0); return; }
  const k = e.ctrlKey ? 0.01 : 0.0015;
  zoomAt(new paper.Point(e.clientX - r.left, e.clientY - r.top), Math.exp(-e.deltaY * k));
}, { passive: false });

// ---------------------------------------------------------------- keyboard
const KEY_TOOLS = { v: 'select', a: 'node', p: 'pen', b: 'brush', e: 'eraser', r: 'shape', u: 'shape', t: 'text', i: 'dropper', h: 'hand' };

window.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === ' ') {
    if (!spaceDown) { spaceDown = true; overlay.style.cursor = 'grab'; }
    e.preventDefault();
    return;
  }
  const t = TOOLS[S.tool];
  if (t.key && t.key(e)) { e.preventDefault(); redrawOverlay(); return; }
  let handled = true;
  if (ctrl) {
    if (k === 'z' && e.shiftKey) redo();
    else if (k === 'z') undo();
    else if (k === 'y') redo();
    else if (k === 'c') A.copySel();
    else if (k === 'x') A.cutSel();
    else if (k === 'v') A.paste();
    else if (k === 'd') A.duplicateSel();
    else if (k === 'g' && e.shiftKey) A.ungroupSel();
    else if (k === 'g') A.groupSel();
    else if (k === 'a') { setTool('select'); A.selectAll(); }
    else if (k === 's') saveFile();
    else if (k === 'e') exportDialog();
    else if (k === '[') A.arrange('back');
    else if (k === ']') A.arrange('front');
    else if (k === '=' || k === '+') zoomCenter(1.25);
    else if (k === '-') zoomCenter(0.8);
    else if (k === '0') fit();
    else handled = false;
  } else if (KEY_TOOLS[k] && !e.altKey) setTool(KEY_TOOLS[k]);
  else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (S.tool === 'node' && S.node.segs.size) deleteNodes(); else A.deleteSel();
  } else if (e.key === 'Escape') { setSelection([]); S.node.path = null; S.node.segs.clear(); emit('selection'); }
  else if (k === 'x') act('swap-colors');
  else if (k === '[') A.arrange('backward');
  else if (k === ']') A.arrange('forward');
  else if (k === '0') fit();
  else if (k === '1') { zoomCenter(1 / paper.view.zoom); }
  else if (k === '=' || k === '+') zoomCenter(1.25);
  else if (k === '-') zoomCenter(0.8);
  else if (e.key.startsWith('Arrow') && S.sel.length) {
    const n = (e.shiftKey ? 10 : 1);
    const d = { ArrowLeft: [-n, 0], ArrowRight: [n, 0], ArrowUp: [0, -n], ArrowDown: [0, n] }[e.key];
    S.sel.forEach((it) => it.translate(new paper.Point(d)));
    clearTimeout(nudgeT);
    nudgeT = setTimeout(() => import('./history.js').then((h) => h.commit()), 400);
    redrawOverlay();
  } else handled = false;
  if (handled) e.preventDefault();
});
let nudgeT = 0;
window.addEventListener('keyup', (e) => {
  if (e.key === ' ') { spaceDown = false; overlay.style.cursor = TOOLS[S.tool].cursor; }
});

// ---------------------------------------------------------------- boot
async function boot() {
  initView(drawOverlay);
  await loadFontList();
  const restored = await restoreAutosave();
  if (!restored) {
    if (!paper.project.layers.length) new paper.Layer({ name: 'Layer 1' });
    paper.project.layers[0].name ||= 'Layer 1';
    resetHistory();
    fit();
  }
  buildUI();
  initTextUI();
  on('changed', scheduleAutosave);
  on('changed-soft', scheduleAutosave);
  on('selection', () => { if (S.tool === 'select') A.readSelStyle(); redrawOverlay(); });
  on('history', redrawOverlay);
  emit('sketch');
  emit('changed');
  changed();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  window.__jamdraw = { S, paper, TOOLS, A }; // handy in the browser console
}
boot();
