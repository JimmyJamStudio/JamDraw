// Toolbar, tool options, the side panel (colour, swatches, stroke, arrange, combine, align, layers, sketch),
// the File menu and dialogs.
import { S, on, emit, toast, clamp } from './state.js';
import { commit, undo, redo, canUndo, canRedo } from './history.js';
import { TOOLS, setSelection, deleteNodes, smoothNodes } from './tools.js';
import * as A from './actions.js';
import * as F from './store.js';
import { fit, zoomCenter, changed, redrawOverlay, overlay } from './view.js';
import { exportDialog, quickExport } from './export.js';
import { isText, bakeAll } from './text.js';

const $ = (s) => document.querySelector(s);
const ICON = {
  select: '<path d="M5 3l14 8-6 2-3 6z"/>',
  node: '<path d="M5 3l14 8-6 2-3 6z" fill="currentColor"/><rect x="15" y="15" width="6" height="6" rx="1"/>',
  pen: '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.6 7.6"/><circle cx="11" cy="11" r="2"/>',
  brush: '<path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
  eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  shape: '<rect x="3" y="3" width="10" height="10" rx="1"/><circle cx="16" cy="16" r="5"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  dropper: '<path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4z"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24">${ICON[name]}</svg>`;
const TOOL_LIST = [
  ['select', 'Select, move, scale, rotate (V)'],
  ['node', 'Edit points and curves (A)'],
  ['pen', 'Pen: click corners, drag curves (P)'],
  ['brush', 'Brush, with pen pressure (B)'],
  ['eraser', 'Eraser (E)'],
  ['shape', 'Shapes (R)'],
  ['text', 'Text, with a font library (T)'],
  ['dropper', 'Pick up colors (I)'],
  ['hand', 'Pan (H, or hold Space)'],
];

export function setTool(t) {
  if (S.tool === t) return;
  const cur = TOOLS[S.tool];
  if (cur.finish) cur.finish(); else cur.cancel();
  S.tool = t;
  S.sketchMove = false;
  overlay.style.cursor = TOOLS[t].cursor;
  if (t !== 'node') { S.node.path = null; S.node.segs.clear(); }
  if (t === 'node' && S.sel.length === 1 && S.sel[0] instanceof paper.Path) S.node.path = S.sel[0];
  emit('tool');
  redrawOverlay();
}

function buildToolbar() {
  const bar = $('#toolbar');
  bar.innerHTML = TOOL_LIST.map(([t, title], i) => (i === 8 ? '<div class="sep"></div>' : '')
    + `<button data-tool="${t}" title="${title}" aria-label="${title}">${svg(t)}</button>`).join('');
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tool]');
    if (b) setTool(b.dataset.tool);
  });
  const sync = () => bar.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === S.tool));
  on('tool', sync);
  sync();
}

// --- Tool options strip
function range(label, val, min, max, step, onInput) {
  const id = 'o' + Math.random().toString(36).slice(2, 8);
  return { html: `<label>${label}<input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"><input type="number" id="${id}n" min="${min}" max="${max * 4}" step="${step}" value="${val}"></label>`,
    bind() {
      const r = document.getElementById(id), n = document.getElementById(id + 'n');
      r.oninput = () => { n.value = r.value; onInput(+r.value); };
      n.onchange = () => { r.value = n.value; onInput(+n.value); };
    } };
}
function toggle(label, val, onChange) {
  const id = 'o' + Math.random().toString(36).slice(2, 8);
  return { html: `<button id="${id}" class="txt" aria-pressed="${val}">${label}</button>`,
    bind() { const b = document.getElementById(id); b.onclick = () => { const v = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', v); onChange(v); }; } };
}
function seg(options, val, onChange) {
  const id = 'o' + Math.random().toString(36).slice(2, 8);
  return { html: `<span id="${id}" class="btns" style="flex-wrap:nowrap">${options.map(([v, l]) => `<button class="txt${v === val ? ' on' : ''}" data-v="${v}">${l}</button>`).join('')}</span>`,
    bind() { const el = document.getElementById(id); el.onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); onChange(b.dataset.v); }; } };
}
function btn(label, fn, title = '') {
  const id = 'o' + Math.random().toString(36).slice(2, 8);
  return { html: `<button id="${id}" class="txt" title="${title}">${label}</button>`, bind() { document.getElementById(id).onclick = fn; } };
}
const hint = (t) => ({ html: `<span class="hint">${t}</span>`, bind() {} });

function buildOptions() {
  const el = $('#options');
  const parts = {
    select: () => [btn('Duplicate', A.duplicateSel, 'Ctrl+D'), btn('Delete', A.deleteSel, 'Del'), btn('Group', A.groupSel, 'Ctrl+G'),
      btn('Ungroup', A.ungroupSel, 'Ctrl+Shift+G'), btn('Flip ↔', () => A.flip('h')), btn('Flip ↕', () => A.flip('v')),
      btn('Edit text', () => { const t = S.sel.find(isText); if (t) emit('edit-text', { item: t }); else toast('Select a text first'); }, 'Or double-click the text'),
      btn('Text to shapes', () => { if (bakeAll(S.sel)) commit(); else toast('Select a text first'); }, 'Turn text into plain shapes you can edit point by point'),
      hint('Shift: keep proportions or snap 15° · Alt-drag: copy · drag just outside a corner: rotate')],
    node: () => [btn('Smooth', () => smoothNodes(true)), btn('Corner', () => smoothNodes(false)),
      btn('Delete point', () => S.node.segs.size && deleteNodes()),
      hint('Alt-click a line: add a point · double-click a point: smooth/corner · Alt-drag a handle: break it')],
    pen: () => [btn('Done', () => TOOLS.pen.finish(), 'Enter'),
      hint('Click: corner · drag: curve · click the first point: close · Backspace: undo last point · Shift: 45°')],
    brush: () => [range('Size', S.brush.size, 1, 120, 1, (v) => { S.brush.size = v; }),
      seg([['ink', 'Ink'], ['line', 'Line']], S.brush.mode, (v) => { S.brush.mode = v; }),
      toggle('Pressure', S.brush.pressure, (v) => { S.brush.pressure = v; }),
      toggle('Merge', S.brush.merge, (v) => { S.brush.merge = v; }),
      range('Smooth', S.brush.smooth, 0.5, 8, 0.5, (v) => { S.brush.smooth = v; }),
      hint('Ink: filled strokes in the Fill color; Merge joins touching strokes of the same color into one shape')],
    eraser: () => [range('Size', S.eraser.size, 2, 200, 1, (v) => { S.eraser.size = v; }), hint('Cuts through shapes and lines on the active layer')],
    shape: () => {
      const k = S.shape.kind;
      const out = [seg([['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['polygon', 'Polygon'], ['star', 'Star']], k, (v) => { S.shape.kind = v; buildOptions(); })];
      if (k === 'rect') out.push(range('Corners', S.shape.radius, 0, 200, 1, (v) => { S.shape.radius = v; }));
      if (k === 'polygon') out.push(range('Sides', S.shape.sides, 3, 12, 1, (v) => { S.shape.sides = v; }));
      if (k === 'star') {
        out.push(range('Points', S.shape.points, 3, 16, 1, (v) => { S.shape.points = v; }));
        out.push(range('Inner', S.shape.inner, 0.1, 0.95, 0.05, (v) => { S.shape.inner = v; }));
      }
      out.push(hint('Shift: square · Alt: from the center'));
      return out;
    },
    text: () => [hint('Tap the page to add text, or tap a text to change it · it uses the Fill color · Select › Text to shapes for point editing')],
    dropper: () => [hint('Tap a shape to use its fill, stroke and stroke width')],
    hand: () => [hint('Drag to pan · wheel or pinch to zoom · fingers always pan once a pen has been used')],
  };
  const list = (parts[S.tool] || (() => []))();
  el.innerHTML = list.map((p) => p.html).join('');
  list.forEach((p) => p.bind());
}

// --- Colour, stroke, opacity
function buildStyle() {
  const pick = $('#colorpick'), hex = $('#hex');
  const chips = document.querySelectorAll('[data-chip]');
  const show = () => {
    chips.forEach((c) => {
      const v = S[c.dataset.chip];
      c.classList.toggle('on', c.dataset.chip === S.chip);
      const sw = c.querySelector('.sw');
      sw.style.background = v || '';
      sw.style.backgroundImage = v ? 'none' : '';
    });
    const v = S[S.chip];
    hex.value = v || 'none';
    if (v) pick.value = v.slice(0, 7);
    $('#sw-range').value = S.strokeWidth;
    $('#sw-num').value = S.strokeWidth;
    const op = S.sel.length ? Math.round((S.sel[0].opacity ?? 1) * 100) : 100;
    $('#op-range').value = op;
    $('#op-num').textContent = op + '%';
  };
  chips.forEach((c) => (c.onclick = () => { S.chip = c.dataset.chip; show(); }));
  const live = (v) => {
    S[S.chip] = v;
    const key = S.chip === 'fill' ? 'fillColor' : 'strokeColor';
    const walk = (it) => { if (it.children && !(it instanceof paper.CompoundPath)) it.children.forEach(walk); else if (S.chip === 'fill' || it.strokeWidth) it[key] = v ? new paper.Color(v) : null; };
    S.sel.forEach(walk);
    show();
  };
  pick.oninput = () => live(pick.value);
  pick.onchange = () => { live(pick.value); A.applyStyleToSel(S.chip); };
  hex.onchange = () => {
    let v = hex.value.trim();
    if (/^none$/i.test(v)) v = null;
    else if (/^#?[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(v)) v = (v[0] === '#' ? v : '#' + v).toLowerCase();
    else { toast('Use a hex color like #d22a5a'); show(); return; }
    S[S.chip] = v;
    A.applyStyleToSel(S.chip);
    show();
  };
  const setW = (v, final) => {
    S.strokeWidth = clamp(+v || 0, 0, 400);
    if (final) A.applyStyleToSel('width');
    else S.sel.forEach(function walk(it) { if (it.children && !(it instanceof paper.CompoundPath)) it.children.forEach(walk); else if (it.strokeColor || S.stroke) { it.strokeWidth = S.strokeWidth; if (!it.strokeColor && S.stroke) it.strokeColor = new paper.Color(S.stroke); } });
    show();
  };
  $('#sw-range').oninput = (e) => setW(e.target.value, false);
  $('#sw-range').onchange = (e) => setW(e.target.value, true);
  $('#sw-num').onchange = (e) => setW(e.target.value, true);
  $('#op-range').oninput = (e) => { A.applyOpacity(e.target.value / 100, false); $('#op-num').textContent = e.target.value + '%'; };
  $('#op-range').onchange = (e) => A.applyOpacity(e.target.value / 100, true);
  on('style', show);
  on('selection', show);
  show();
  renderSwatches();
}

function renderSwatches() {
  const el = $('#swatches');
  el.innerHTML = S.swatches.map((c, i) => `<button data-sw="${i}" style="background:${c}" title="${c} (right-click or long-press to remove)"></button>`).join('')
    + '<button class="add" data-sw-add title="Save the current color">+</button>';
  let pressT = 0, longFired = false;
  el.onpointerdown = (e) => {
    const b = e.target.closest('[data-sw]');
    longFired = false;
    if (b) pressT = setTimeout(() => { longFired = true; removeSwatch(+b.dataset.sw); }, 600);
  };
  el.onpointerup = el.onpointerleave = () => clearTimeout(pressT);
  el.onclick = (e) => {
    if (longFired) return;
    if (e.target.closest('[data-sw-add]')) {
      const c = S[S.chip];
      if (!c) return toast('Pick a color first');
      if (!S.swatches.includes(c)) S.swatches.push(c);
      renderSwatches();
      emit('changed');
      return;
    }
    const b = e.target.closest('[data-sw]');
    if (!b) return;
    S[S.chip] = S.swatches[+b.dataset.sw];
    A.applyStyleToSel(S.chip);
    emit('style');
  };
  el.oncontextmenu = (e) => {
    const b = e.target.closest('[data-sw]');
    if (!b) return;
    e.preventDefault();
    removeSwatch(+b.dataset.sw);
  };
}
function removeSwatch(i) {
  if (!confirm(`Remove ${S.swatches[i]} from the swatches?`)) return;
  S.swatches.splice(i, 1);
  renderSwatches();
  emit('changed');
}

function buildPanelButtons() {
  const mk = (sel, list) => {
    const el = $(sel);
    el.innerHTML = list.map(([label, , title]) => `<button class="txt" title="${title || ''}">${label}</button>`).join('');
    [...el.children].forEach((b, i) => (b.onclick = list[i][1]));
  };
  mk('#arrange', [
    ['To front', () => A.arrange('front'), 'Ctrl+]'], ['Forward', () => A.arrange('forward'), ']'],
    ['Backward', () => A.arrange('backward'), '['], ['To back', () => A.arrange('back'), 'Ctrl+['],
    ['Group', A.groupSel, 'Ctrl+G'], ['Ungroup', A.ungroupSel, 'Ctrl+Shift+G'],
  ]);
  mk('#combine', [
    ['Unite', () => A.combine('unite'), 'Join the selected shapes into one'],
    ['Subtract', () => A.combine('subtract'), 'Cut the top shapes out of the bottom one'],
    ['Intersect', () => A.combine('intersect'), 'Keep only where they overlap'],
    ['Exclude', () => A.combine('exclude'), 'Keep only where they do not overlap'],
    ['Outline stroke', A.outlineStroke, 'Turn strokes into filled shapes'],
    ['Sticker outline', A.stickerOutline, 'A solid outline around the selection, underneath (stroke color and width)'],
  ]);
  mk('#align', [
    ['Left', () => A.align('left')], ['Center', () => A.align('hcenter')], ['Right', () => A.align('right')],
    ['Top', () => A.align('top')], ['Middle', () => A.align('vcenter')], ['Bottom', () => A.align('bottom')],
    ['Center on page', () => A.align('page'), 'Center the selection on the page'],
  ]);
}

// --- Layers
function renderLayers() {
  const ul = $('#layers');
  const layers = paper.project.layers.slice().reverse();
  ul.innerHTML = layers.map((l) => `<li data-i="${l.index}" class="${l === paper.project.activeLayer ? 'active' : ''}">
    <button data-l="vis" title="Show or hide" aria-label="Show or hide" class="${l.visible ? '' : 'off'}">${svg('eye')}</button>
    <button data-l="lock" title="Lock or unlock" aria-label="Lock or unlock" class="${l.locked ? '' : 'off'}">${svg('lock')}</button>
    <span class="name" title="Double-click to rename">${(l.name || 'Layer').replace(/</g, '&lt;')}</span></li>`).join('');
}
function buildLayers() {
  const ul = $('#layers');
  ul.onclick = (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const l = paper.project.layers[+li.dataset.i];
    const b = e.target.closest('[data-l]');
    if (b && b.dataset.l === 'vis') { l.visible = !l.visible; dropHidden(); commit(); }
    else if (b && b.dataset.l === 'lock') { l.locked = !l.locked; dropHidden(); commit(); }
    else { l.activate(); emit('layers'); }
  };
  ul.ondblclick = (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    const l = paper.project.layers[+li.dataset.i];
    const name = prompt('Layer name', l.name || '');
    if (name != null) { l.name = name.trim() || l.name; commit(); }
  };
  on('changed', renderLayers);
  on('layers', renderLayers);
  renderLayers();
}
function dropHidden() {
  setSelection(S.sel.filter((it) => it.layer && it.layer.visible && !it.layer.locked));
}
function layerAct(act) {
  const p = paper.project, l = p.activeLayer;
  if (act === 'layer-add') {
    const n = new paper.Layer({ name: 'Layer ' + (p.layers.length + 1) });
    n.insertAbove(l);
    n.activate();
  } else if (act === 'layer-del') {
    if (p.layers.length < 2) return toast('A drawing needs at least one layer');
    if (l.children.length && !confirm(`Delete "${l.name}" and everything on it?`)) return;
    const i = l.index;
    l.remove();
    p.layers[Math.max(0, i - 1)].activate();
    dropHidden();
  } else if (act === 'layer-up') {
    if (l.nextSibling) l.insertAbove(l.nextSibling);
  } else if (act === 'layer-down') {
    if (l.previousSibling) l.insertBelow(l.previousSibling);
  } else if (act === 'layer-move-sel') {
    if (!S.sel.length) return toast('Select something first');
    S.sel.forEach((it) => l.addChild(it));
  }
  commit();
  emit('layers');
}

// --- Sketch to trace
function buildSketch() {
  const sync = () => {
    const sk = S.sketch;
    $('#sketch-toggle').textContent = sk && !sk.visible ? 'Show' : 'Hide';
    $('#sketch-move').classList.toggle('on', S.sketchMove);
    $('#sk-op').value = sk ? Math.round(sk.opacity * 100) : 40;
    $('#sk-scale').value = sk && sk.w ? Math.round((sk.scale * sk.w / S.doc.w) * 100) : 100;
    ['#sketch-toggle', '#sketch-move', '#sk-op', '#sk-scale'].forEach((s) => ($(s).disabled = !sk));
  };
  $('#sk-op').oninput = (e) => { if (S.sketch) { S.sketch.opacity = e.target.value / 100; changed(); emit('changed-soft'); } };
  $('#sk-scale').oninput = (e) => {
    const sk = S.sketch;
    if (!sk || !sk.w) return;
    const cx = sk.x + (sk.w * sk.scale) / 2, cy = sk.y + (sk.h * sk.scale) / 2;
    sk.scale = (e.target.value / 100) * S.doc.w / sk.w;
    sk.x = cx - (sk.w * sk.scale) / 2;
    sk.y = cy - (sk.h * sk.scale) / 2;
    changed();
    emit('changed-soft');
  };
  on('sketch', sync);
  on('tool', sync);
  sync();
}

// --- Menu, dialogs
function openMenu(anchor) {
  const m = $('#menu');
  const r = anchor.getBoundingClientRect();
  m.hidden = false;
  m.style.left = Math.min(r.left, innerWidth - m.offsetWidth - 8) + 'px';
  m.style.top = r.bottom + 6 + 'px';
  const close = (e) => {
    if (e && m.contains(e.target) && !e.target.closest('button')) return;
    m.hidden = true;
    document.removeEventListener('pointerdown', outside, true);
  };
  const outside = (e) => { if (!m.contains(e.target) && e.target !== anchor) close(); };
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
  m.onclick = (e) => { if (e.target.closest('button')) setTimeout(() => close(), 0); };
}

function dialog(html, onOk) {
  const d = $('#dlg'), body = $('#dlg-body');
  body.innerHTML = html;
  d.returnValue = '';
  d.showModal();
  d.onclose = () => { if (d.returnValue === 'ok' && onOk) onOk(body); };
}

function docSettings() {
  const D = S.doc;
  dialog(`<h3 style="margin-top:0">Page</h3>
    <label class="row">Name <input type="text" name="name" value="${(D.name || '').replace(/"/g, '&quot;')}"></label>
    <label class="row">Width <input type="number" name="w" min="16" max="8192" value="${D.w}"> Height <input type="number" name="h" min="16" max="8192" value="${D.h}"></label>
    <div class="btns" id="presets">${[[512, 512], [1024, 1024], [2048, 2048], [1920, 1080], [1080, 1920], [1200, 630]].map(([w, h]) => `<button type="button" class="txt" data-w="${w}" data-h="${h}">${w}×${h}</button>`).join('')}</div>
    <label class="row"><input type="checkbox" name="transparent" ${D.transparent ? 'checked' : ''}> Transparent background</label>
    <menu><button value="cancel">Cancel</button><button value="ok" class="on">Save</button></menu>`, (f) => {
    D.name = f.name.value.trim() || 'Untitled';
    D.w = clamp(Math.round(+f.w.value) || D.w, 16, 8192);
    D.h = clamp(Math.round(+f.h.value) || D.h, 16, 8192);
    D.transparent = f.transparent.checked;
    fit();
    emit('changed');
    emit('doc');
  });
  $('#presets').onclick = (e) => {
    const b = e.target.closest('[data-w]');
    if (!b) return;
    const f = $('#dlg-body');
    f.w.value = b.dataset.w;
    f.h.value = b.dataset.h;
  };
}

function help() {
  const rows = [
    ['V A P B E R T I H', 'Select · Points · Pen · Brush · Eraser · Shapes · Text · Pick color · Pan'],
    ['Double-click text', 'Edit it (Ctrl+Enter: done, Esc: cancel)'],
    ['Ctrl+E', 'Export…'],
    ['Space + drag', 'Pan (also middle mouse button, or two fingers)'],
    ['Wheel / pinch', 'Zoom · 0 fits the page · 1 is 100%'],
    ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
    ['Ctrl+C X V D', 'Copy · cut · paste · duplicate'],
    ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup'],
    ['[ ] / Ctrl+[ ]', 'Backward, forward / to back, to front'],
    ['Arrows', 'Nudge (Shift: 10×)'],
    ['X', 'Swap fill and stroke'],
    ['Del', 'Delete the selection or selected points'],
    ['Enter / Esc', 'Finish a pen path · Esc also deselects'],
  ];
  dialog(`<h3 style="margin-top:0">JamDraw shortcuts</h3><table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
    <p style="color:var(--dim);font-size:13px">Drawing tablets and phone pens: pressure works with the Brush in Ink mode. Once a pen has touched the screen, fingers only pan and zoom, so your palm can rest on it.
    Your drawing saves itself in this browser; use File › Save to keep a copy.</p>
    <menu><button value="ok" class="on">Got it</button></menu>`);
}

function pickFile(accept, fn) {
  const f = $('#file');
  f.value = '';
  f.accept = accept;
  f.onchange = () => { if (f.files[0]) fn(f.files[0]); };
  f.click();
}

export function act(name, el) {
  switch (name) {
    case 'menu': return openMenu(el);
    case 'undo': return undo();
    case 'redo': return redo();
    case 'zoom-in': return zoomCenter(1.25);
    case 'zoom-out': return zoomCenter(0.8);
    case 'fit': return fit();
    case 'help': return help();
    case 'sheet-style': case 'sheet-layers': {
      const cls = name;
      const open = document.body.classList.contains(cls);
      document.body.classList.remove('sheet-style', 'sheet-layers');
      if (!open) document.body.classList.add(cls);
      return;
    }
    case 'swap-colors': { [S.fill, S.stroke] = [S.stroke, S.fill]; A.applyStyleToSel('fill'); A.applyStyleToSel('stroke'); emit('style'); return; }
    case 'color-none': { S[S.chip] = null; A.applyStyleToSel(S.chip); emit('style'); return; }
    case 'new': if (confirm('Start a new drawing? Save first if you want to keep this one.')) F.newDoc(); return;
    case 'open': return pickFile('.jamdraw,.json,.svg,image/svg+xml', F.openFile);
    case 'place': return pickFile('.svg,image/svg+xml', async (f) => setSelection([await F.placeSVG(f)]));
    case 'save': return F.saveFile();
    case 'export': return exportDialog();
    case 'export-svg': return quickExport('svg');
    case 'export-png': return quickExport('png', +el.dataset.size);
    case 'doc-settings': return docSettings();
    case 'layer-add': case 'layer-del': case 'layer-up': case 'layer-down': case 'layer-move-sel': return layerAct(name);
    case 'sketch-load': return pickFile('image/*', F.loadSketch);
    case 'sketch-toggle': if (S.sketch) { S.sketch.visible = !S.sketch.visible; changed(); emit('sketch'); emit('changed-soft'); } return;
    case 'sketch-move': S.sketchMove = !S.sketchMove && !!S.sketch; if (S.sketchMove) toast('Drag to move the sketch; tap Move again when done'); emit('sketch'); return;
    case 'sketch-clear': if (S.sketch && confirm('Remove the sketch?')) { S.sketch = null; S.sketchMove = false; changed(); emit('sketch'); emit('changed-soft'); } return;
  }
}

export function buildUI() {
  buildToolbar();
  buildOptions();
  buildStyle();
  buildPanelButtons();
  buildLayers();
  buildSketch();
  on('tool', buildOptions);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) act(b.dataset.act, b);
  });
  const hist = () => { $('[data-act="undo"]').disabled = !canUndo(); $('[data-act="redo"]').disabled = !canRedo(); };
  on('history', hist);
  hist();
  const docName = () => { $('#docname').textContent = `${S.doc.name} · ${S.doc.w}×${S.doc.h}`; };
  on('doc', docName);
  on('changed', docName);
  docName();
  on('zoom', (z) => { $('#zoomlabel').textContent = Math.round(z * 100) + '%'; });
  overlay.style.cursor = TOOLS[S.tool].cursor;
}
