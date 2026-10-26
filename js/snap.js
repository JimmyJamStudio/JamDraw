// Snapping: while moving, scaling or drawing, edges and centers click onto the page's edges and center, other shapes'
// edges and centers, and the grid. Holding Ctrl turns it off for that drag. Pink guides show what snapped.
import { S } from './state.js';
import { px, toView } from './view.js';

const TOL = 7; // screen pixels

// Lines to snap to, in drawing units: the page, plus every visible thing that isn't being moved.
function targets(exclude) {
  const xs = [0, S.doc.w / 2, S.doc.w], ys = [0, S.doc.h / 2, S.doc.h];
  for (const l of paper.project.layers) {
    if (!l.visible) continue;
    for (const it of l.children) {
      if (!it.visible || exclude.includes(it)) continue;
      const b = it.bounds;
      xs.push(b.left, b.center.x, b.right);
      ys.push(b.top, b.center.y, b.bottom);
    }
  }
  return { xs, ys };
}

// The smallest nudge that puts one of `own` on a target line (or the grid), if one is close enough.
function axis(own, lines, tol) {
  let best = null;
  const consider = (d, at) => { if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at }; };
  for (const v of own) {
    for (const c of lines) consider(c - v, c);
    if (S.snap.grid) { const c = Math.round(v / S.snap.size) * S.snap.size; consider(c - v, c); }
  }
  return best;
}

// How far to nudge something whose edges / centers are ownXs and ownYs. Also sets S.guides for the overlay.
export function snapDelta(ownXs, ownYs, ev, exclude = []) {
  S.guides = null;
  if (ev.ctrl || (!S.snap.on && !S.snap.grid)) return new paper.Point(0, 0);
  const t = S.snap.on ? targets(exclude) : { xs: [], ys: [] };
  const tol = px(TOL);
  const bx = axis(ownXs, t.xs, tol), by = axis(ownYs, t.ys, tol);
  S.guides = { x: bx && bx.at, y: by && by.at };
  return new paper.Point(bx ? bx.d : 0, by ? by.d : 0);
}
export const snapPoint = (pt, ev, exclude) => pt.add(snapDelta([pt.x], [pt.y], ev, exclude));
export const snapRect = (r, ev, exclude) =>
  snapDelta([r.left, r.center.x, r.right], [r.top, r.center.y, r.bottom], ev, exclude);
export function clearGuides() { S.guides = null; }

// A line between two drawing points, on the overlay; on whole pixels so it's crisp when the view isn't turned.
function line(ctx, ax, ay, bx, by) {
  const p = toView(new paper.Point(ax, ay)), q = toView(new paper.Point(bx, by));
  ctx.moveTo(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5);
  ctx.lineTo(Math.round(q.x) + 0.5, Math.round(q.y) + 0.5);
}

// The grid lines on the page that are on screen (so it turns with a turned view).
export function drawGrid(ctx) {
  if (!S.snap.grid) return;
  const step = S.snap.size;
  if (step * paper.view.zoom < 6) return; // too dense to be useful
  const r = paper.view.bounds.intersect(new paper.Rectangle(0, 0, S.doc.w, S.doc.h)); // empty: the loops don't run
  ctx.strokeStyle = 'rgba(47,140,255,.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.ceil(r.left / step) * step; x <= r.right; x += step) line(ctx, x, r.top, x, r.bottom);
  for (let y = Math.ceil(r.top / step) * step; y <= r.bottom; y += step) line(ctx, r.left, y, r.right, y);
  ctx.stroke();
}

export function drawGuides(ctx) {
  const g = S.guides;
  if (!g) return;
  const r = paper.view.bounds;
  ctx.strokeStyle = '#ff3ea5';
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (g.x != null) line(ctx, g.x, r.top, g.x, r.bottom);
  if (g.y != null) line(ctx, r.left, g.y, r.right, g.y);
  ctx.stroke();
}
