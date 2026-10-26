// The Position and size boxes (X, Y, W, H, angle and tilt of the selection, in drawing units) and the snapping
// settings. The boxes follow along while you drag; typing a number and pressing Enter (or leaving the box) applies it.
import { S, on, emit, toast, clamp, unionBounds, normAngle } from './state.js';
import { commit } from './history.js';
import { redrawOverlay } from './view.js';

const $ = (id) => document.getElementById(id);
const FIELDS = ['x', 'y', 'w', 'h', 'a', 'tx', 'ty'];
const TILT = { tx: 'tiltX', ty: 'tiltY' };
const round = (v) => Math.round(v * 10) / 10;
const locked = () => $('tf-lock').getAttribute('aria-pressed') === 'true';
const cos = (deg) => Math.cos((deg * Math.PI) / 180);

// The angle (or tilt) shown: the one everything selected shares, else 0 (then a new angle turns them all by that
// much, and a new tilt tilts them all to it).
function shared(key) {
  const a = S.sel.map((it) => it.data[key] || 0);
  return a.every((v) => v === a[0]) ? a[0] : 0;
}
const angle = () => shared('angle');

function show() {
  const has = S.sel.length > 0;
  for (const f of FIELDS) $('tf-' + f).disabled = !has;
  if (!has) { for (const f of FIELDS) $('tf-' + f).value = ''; return; }
  const b = unionBounds(S.sel);
  const vals = { x: b.x, y: b.y, w: b.width, h: b.height, a: angle(), tx: shared('tiltX'), ty: shared('tiltY') };
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
  } else if (TILT[f]) {
    // Tilting in 3D, seen from far away: a shape turned t degrees away from you looks cos(t) as wide (Tilt ↔, turning
    // round its up-down line) or as tall (Tilt ↕). The squash runs along the selection's own axes, which turn with its
    // angle, and each shape remembers its tilt so a new one replaces the old instead of adding to it.
    const t = clamp(v, 0, 85), key = TILT[f], a = angle();
    S.sel.forEach((it) => {
      const k = cos(t) / cos(it.data[key] || 0);
      it.transform(new paper.Matrix().translate(b.center).rotate(a).scale(f === 'tx' ? k : 1, f === 'ty' ? k : 1).rotate(-a).translate(b.center.negate()));
      it.data[key] = t;
    });
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
