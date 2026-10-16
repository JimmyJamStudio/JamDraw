// The Position and size boxes (X, Y, W, H and angle of the selection, in drawing units) and the snapping settings.
// The boxes follow along while you drag; typing a number and pressing Enter (or leaving the box) applies it.
import { S, on, emit, toast, clamp, unionBounds, normAngle } from './state.js';
import { commit } from './history.js';
import { redrawOverlay } from './view.js';

const $ = (id) => document.getElementById(id);
const FIELDS = ['x', 'y', 'w', 'h', 'a'];
const round = (v) => Math.round(v * 10) / 10;
const locked = () => $('tf-lock').getAttribute('aria-pressed') === 'true';

// The angle shown: the one everything selected shares, else 0 (then a new angle turns them all by that much).
function angle() {
  const a = S.sel.map((it) => it.data.angle || 0);
  return a.every((v) => v === a[0]) ? a[0] : 0;
}

function show() {
  const has = S.sel.length > 0;
  for (const f of FIELDS) $('tf-' + f).disabled = !has;
  if (!has) { for (const f of FIELDS) $('tf-' + f).value = ''; return; }
  const b = unionBounds(S.sel);
  const vals = { x: b.x, y: b.y, w: b.width, h: b.height, a: angle() };
  for (const f of FIELDS) {
    const el = $('tf-' + f);
    if (document.activeElement !== el) el.value = round(vals[f]); // don't fight someone typing
  }
}

function apply(f, v) {
  const b = unionBounds(S.sel);
  if (f === 'x') S.sel.forEach((it) => it.translate(new paper.Point(v - b.x, 0)));
  else if (f === 'y') S.sel.forEach((it) => it.translate(new paper.Point(0, v - b.y)));
  else if (f === 'a') {
    const d = v - angle();
    S.sel.forEach((it) => { it.rotate(d, b.center); it.data.angle = normAngle((it.data.angle || 0) + d); });
  } else {
    const size = f === 'w' ? b.width : b.height;
    if (!size) { toast(`That has no ${f === 'w' ? 'width' : 'height'} to scale (a straight line)`); return; }
    if (!(v > 0)) { toast('Use a size above 0'); return; }
    const k = v / size;
    S.sel.forEach((it) => it.scale(f === 'w' || locked() ? k : 1, f === 'h' || locked() ? k : 1, b.topLeft));
  }
  commit();
  redrawOverlay();
}

export function buildTransform() {
  for (const f of FIELDS) {
    const el = $('tf-' + f);
    el.onchange = () => {
      if (el.value.trim() !== '') apply(f, +el.value);
      el.blur();
      show();
    };
  }
  $('tf-lock').onclick = () => $('tf-lock').setAttribute('aria-pressed', String(!locked()));
  const sync = () => {
    $('snap-on').checked = S.snap.on;
    $('grid-on').checked = S.snap.grid;
    $('grid-size').value = S.snap.size;
  };
  $('snap-on').onchange = (e) => { S.snap.on = e.target.checked; emit('changed-soft'); };
  $('grid-on').onchange = (e) => { S.snap.grid = e.target.checked; redrawOverlay(); emit('changed-soft'); };
  $('grid-size').onchange = (e) => {
    S.snap.size = clamp(Math.round(+e.target.value) || S.snap.size, 2, 1024);
    sync();
    redrawOverlay();
    emit('changed-soft');
  };
  on('selection', show);
  on('frame', show);
  on('changed', sync);
  sync();
  show();
}
