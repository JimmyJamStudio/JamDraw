// Brush strokes as shapes: the outline of a line whose width follows the pen, and editable ink, the middle line and
// widths an Ink stroke keeps so the Points tool can reshape it.
import { S } from './state.js';
import { px } from './view.js';

// How pressure turns into width: Soft needs a lighter touch for a full line, Firm a heavier one.
export const FEEL = { soft: (p) => p ** 0.6, normal: (p) => p, firm: (p) => p ** 1.6 };
// A line's half width at weight p (0 to 1): from `thin` of the full width up to all of it; even when thin is null.
export const radius = (size, thin, p) => (size / 2) * (thin == null ? 1 : thin + (1 - thin) * p);
// Strokes without pressure can still taper: weight builds up over the first few widths and fades over the last.
export function taper(pts, size) {
  const d = along(pts), len = d[d.length - 1], T = size * 4;
  pts.forEach((q, i) => { q.p = Math.min(1, d[i] / T, (len - d[i]) / T); });
}
// How far along a list of points each one is.
function along(pts) {
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return d;
}

// Turns sampled pen points into a filled outline: the line's width follows the weights (see radius), then it's
// fitted to curves.
export function strokeOutline(pts, size, thin) {
  const minD = Math.max(px(1.2), size * 0.02);
  const raw = [];
  for (const p of pts) {
    const last = raw[raw.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= minD) raw.push({ ...p });
  }
  const rad = (p) => radius(size, thin, p);
  if (raw.length < 3) {
    const p = raw[0];
    return new paper.Path.Circle({ center: [p.x, p.y], radius: Math.max(0.5, rad(p.p)), insert: false });
  }
  // Smooth positions and pressure a little (pens are jittery).
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < raw.length - 1; i++) {
      const a = raw[i - 1], b = raw[i], c = raw[i + 1];
      b.x = (a.x + 2 * b.x + c.x) / 4;
      b.y = (a.y + 2 * b.y + c.y) / 4;
      b.p = (a.p + 2 * b.p + c.p) / 4;
    }
  }
  const n = raw.length;
  const L = [], R = [];
  const tangent = (i) => {
    const a = raw[Math.max(0, i - 1)], b = raw[Math.min(n - 1, i + 1)];
    const v = new paper.Point(b.x - a.x, b.y - a.y);
    return v.isZero() ? new paper.Point(1, 0) : v.normalize();
  };
  for (let i = 0; i < n; i++) {
    const t = tangent(i), nrm = new paper.Point(-t.y, t.x), r = rad(raw[i].p);
    const c = new paper.Point(raw[i].x, raw[i].y);
    L.push(c.add(nrm.multiply(r)));
    R.push(c.subtract(nrm.multiply(r)));
  }
  const path = new paper.Path({ insert: false });
  L.forEach((p) => path.add(p));
  const tEnd = tangent(n - 1), cEnd = new paper.Point(raw[n - 1].x, raw[n - 1].y);
  path.arcTo(cEnd.add(tEnd.multiply(rad(raw[n - 1].p))), R[n - 1]);
  for (let i = n - 2; i >= 0; i--) path.add(R[i]);
  const t0 = tangent(0), c0 = new paper.Point(raw[0].x, raw[0].y);
  path.arcTo(c0.subtract(t0.multiply(rad(raw[0].p))), L[0]);
  path.closed = true;
  path.simplify(Math.max(0.15, px(S.brush.smooth)));
  try {
    const clean = path.resolveCrossings().reorient(true, true);
    return clean;
  } catch {
    return path;
  }
}

// ---------------------------------------------------------------- Editable ink
// An Ink stroke keeps data.ink = { spine, r }: its middle line (Paper segments as [x, y, in x, in y, out x, out y])
// and its half width at evenly spaced stops along it, both in the stroke's own coordinates. Like text, the stroke
// keeps its moves, turns and sizes in its matrix (applyMatrix off), so they never put the two out of step.
const STOPS = 32;
const r2 = (v) => Math.round(v * 100) / 100;
export const isInk = (it) => !!(it && it.data && it.data.ink);

// Makes a just-drawn outline editable ink: pts are the stroke's points with their weights, as drawn. A dot (a tap)
// has no line to edit and stays as it is.
export function makeInk(shape, pts, size, thin) {
  // Smoothed before it's fitted to curves: the fitting takes its end directions from neighbouring points, and pen
  // jitter would make it keep every point.
  const line = [];
  for (const q of pts) if (!line.length || Math.hypot(q.x - line[line.length - 1][0], q.y - line[line.length - 1][1]) >= px(2)) line.push([q.x, q.y]);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 1; i < line.length - 1; i++) line[i] = [0, 1].map((k) => (line[i - 1][k] + 2 * line[i][k] + line[i + 1][k]) / 4);
  }
  const spine = new paper.Path({ segments: line, insert: false });
  spine.simplify(Math.max(0.5, px(2.5)));
  if (spine.length < px(4)) return shape;
  const d = along(pts), len = d[d.length - 1];
  const r = Array.from({ length: STOPS }, (_, k) => {
    const want = (len * k) / (STOPS - 1);
    const i = Math.max(0, d.findIndex((v) => v >= want));
    return r2(radius(size, thin, pts[i].p));
  });
  shape.applyMatrix = false;
  shape.data.ink = { spine: spine.segments.map((s) => [s.point.x, s.point.y, s.handleIn.x, s.handleIn.y, s.handleOut.x, s.handleOut.y].map(r2)), r };
  return shape;
}

// The stroke's middle line in drawing coordinates, for the Points tool to edit (not part of the drawing itself).
export function spineOf(item) {
  const spine = new paper.Path({ segments: item.data.ink.spine.map(([x, y, ix, iy, ox, oy]) => [[x, y], [ix, iy], [ox, oy]]), insert: false });
  spine.transform(item.matrix);
  spine.data.inkOf = item;
  return spine;
}

// Rebuilds an ink stroke around its edited middle line, with the same widths along it; the new stroke takes the old
// one's place, look and matrix. Returns it.
export function rebuildInk(spine) {
  const item = spine.data.inkOf;
  const local = spine.clone({ insert: false });
  local.transform(item.matrix.inverted());
  const ink = { spine: local.segments.map((s) => [s.point.x, s.point.y, s.handleIn.x, s.handleIn.y, s.handleOut.x, s.handleOut.y].map(r2)), r: item.data.ink.r };
  const len = local.length, n = Math.max(12, Math.min(600, Math.ceil(len / 2)));
  const big = Math.max(...ink.r, 0.01);
  const pts = Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, at = t * (STOPS - 1), k = Math.min(STOPS - 2, Math.floor(at));
    const p = local.getPointAt(len * t);
    return { x: p.x, y: p.y, p: (ink.r[k] + (ink.r[k + 1] - ink.r[k]) * (at - k)) / big };
  });
  const fresh = strokeOutline(pts, big * 2, 0);
  fresh.applyMatrix = false;
  fresh.matrix = item.matrix;
  fresh.style = item.style;
  fresh.opacity = item.opacity;
  fresh.data = { ...JSON.parse(JSON.stringify(item.data)), ink };
  fresh.insertAbove(item);
  item.remove();
  spine.data.inkOf = fresh;
  return fresh;
}
