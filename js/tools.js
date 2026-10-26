// The drawing tools. Each gets pointer events in drawing coordinates (ev.pt) and screen coordinates (ev.vp),
// with pen pressure in ev.pressure (1 for a mouse), and may draw hints on the overlay.
import { S, emit, toast, isEditable, topItem, editableLayer, unionBounds, setStyle, normAngle } from './state.js';
import { commit } from './history.js';
import { px, toView, redrawOverlay, strokeItemOutline, handleBox, handleDot, overlay, UI_COLOR, sketchColorAt, rectPath } from './view.js';
import { isText, bake, bakeAll } from './text.js';
import { snapPoint, snapRect, clearGuides } from './snap.js';
import { fillAt, sketchInk, magnetPoint } from './trace.js';
import { FEEL, radius, taper, strokeOutline, makeInk, isInk, spineOf, rebuildInk } from './ink.js';

export function setSelection(items) {
  S.sel = items.filter(Boolean);
  emit('selection');
  redrawOverlay();
}

function hitItem(pt) {
  return paper.project.hitTest(pt, {
    fill: true, stroke: true, segments: true, curves: true, tolerance: px(6),
    match: (r) => isEditable(r.item),
  });
}

function activeLayer() {
  let l = paper.project.activeLayer;
  if (!editableLayer(l)) {
    toast(l && l.locked ? 'This layer is locked' : 'This layer is hidden');
    return null;
  }
  return l;
}

function allEditableTopItems() {
  const out = [];
  for (const l of paper.project.layers) {
    if (!editableLayer(l)) continue;
    for (const c of l.children) if (c.visible && !c.locked) out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------- Select (move, scale, rotate)
const HANDLES = ['topLeft', 'topCenter', 'topRight', 'rightCenter', 'bottomRight', 'bottomCenter', 'bottomLeft', 'leftCenter'];
const CURSORS = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'];

function selBounds() { return S.sel.length ? unionBounds(S.sel) : null; }

function handleAt(vp) {
  const b = selBounds();
  if (!b) return null;
  for (let i = 0; i < 8; i++) {
    const h = toView(b[HANDLES[i]]);
    if (h.getDistance(vp) <= 10) return { kind: 'scale', i };
  }
  const inside = b.contains(paper.view.viewToProject(vp));
  for (const i of [0, 2, 4, 6]) {
    const h = toView(b[HANDLES[i]]);
    const d = h.getDistance(vp);
    if (d > 10 && d < 30 && !inside) return { kind: 'rotate', i };
  }
  return null;
}

const select = {
  cursor: 'default',
  down(ev) {
    this.mode = null;
    this.start = ev.pt;
    this.b0 = null;
    this.moved = new paper.Point(0, 0);
    this.changed = false;
    const h = handleAt(ev.vp);
    if (h) {
      const b = selBounds();
      if (h.kind === 'scale') {
        this.mode = 'scale';
        this.hi = h.i;
        this.anchor = b[HANDLES[(h.i + 4) % 8]];
        this.from = b[HANDLES[h.i]];
        this.applied = { x: 1, y: 1 };
      } else {
        this.mode = 'rotate';
        this.center = b.center;
        this.a0 = ev.pt.subtract(b.center).angle;
        this.applied = 0;
      }
      return;
    }
    const res = hitItem(ev.pt);
    const item = res && topItem(res.item);
    if (item && ev.detail >= 2 && isText(item)) { setSelection([item]); emit('edit-text', { item }); return; }
    if (item) {
      if (ev.shift) {
        setSelection(S.sel.includes(item) ? S.sel.filter((i) => i !== item) : [...S.sel, item]);
        if (!S.sel.includes(item)) return;
      } else if (!S.sel.includes(item)) setSelection([item]);
      this.mode = 'move';
      this.dup = ev.alt;
      return;
    }
    if (!ev.shift) setSelection([]);
    this.mode = 'marquee';
    this.rect = null;
  },
  drag(ev) {
    const pt = ev.pt;
    if (this.mode === 'move') {
      if (this.dup) {
        setSelection(S.sel.map((it) => it.clone()));
        this.dup = false;
      }
      // Move by the total drag, nudged so an edge or center snaps; translate only the difference from last time.
      this.b0 ||= selBounds();
      const want = pt.subtract(this.start);
      const total = want.add(snapRect(new paper.Rectangle(this.b0.point.add(want), this.b0.size), ev, S.sel));
      S.sel.forEach((it) => it.translate(total.subtract(this.moved)));
      this.moved = total;
      this.changed = true;
    } else if (this.mode === 'scale') {
      const i = this.hi, a = this.anchor, f = this.from;
      const pt = snapPoint(ev.pt, ev, S.sel);
      const xAxis = i !== 1 && i !== 5, yAxis = i !== 3 && i !== 7;
      let sx = xAxis && Math.abs(f.x - a.x) > 1e-6 ? (pt.x - a.x) / (f.x - a.x) : 1;
      let sy = yAxis && Math.abs(f.y - a.y) > 1e-6 ? (pt.y - a.y) / (f.y - a.y) : 1;
      if (ev.shift) {
        const s = !xAxis ? sy : !yAxis ? sx : Math.abs(sx) > Math.abs(sy) ? sx : sy;
        sx = sy = s;
      }
      const fix = (v) => (Math.abs(v) < 0.01 ? (v < 0 ? -0.01 : 0.01) : v);
      sx = fix(sx); sy = fix(sy);
      const rx = sx / this.applied.x, ry = sy / this.applied.y;
      S.sel.forEach((it) => it.scale(rx, ry, a));
      this.applied = { x: sx, y: sy };
      this.changed = true;
    } else if (this.mode === 'rotate') {
      let ang = pt.subtract(this.center).angle - this.a0;
      if (ev.shift) ang = Math.round(ang / 15) * 15;
      const d = ang - this.applied;
      S.sel.forEach((it) => it.rotate(d, this.center));
      this.applied = ang;
      this.changed = true;
    } else if (this.mode === 'marquee') {
      this.rect = new paper.Rectangle(this.start, pt);
    }
    redrawOverlay();
  },
  up(ev) {
    clearGuides();
    if (this.mode === 'rotate') S.sel.forEach((it) => { it.data.angle = normAngle((it.data.angle || 0) + this.applied); });
    if (this.mode === 'marquee' && this.rect && (this.rect.width > px(3) || this.rect.height > px(3))) {
      const r = this.rect;
      const hits = allEditableTopItems().filter((it) => r.intersects(it.bounds));
      setSelection(ev.shift ? [...new Set([...S.sel, ...hits])] : hits);
    }
    this.rect = null;
    if (this.changed) { commit(); emit('selection'); }
    this.mode = null;
    redrawOverlay();
  },
  move(ev) {
    const h = handleAt(ev.vp);
    overlay.style.cursor = h ? (h.kind === 'scale' ? CURSORS[h.i] : 'grab') : 'default';
  },
  cancel() { this.mode = null; this.rect = null; clearGuides(); },
  overlay(ctx) {
    for (const it of S.sel) strokeItemOutline(ctx, it);
    const b = selBounds();
    if (b) {
      ctx.strokeStyle = UI_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      rectPath(ctx, b);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const h of HANDLES) handleBox(ctx, toView(b[h]));
    }
    if (this.rect) {
      rectPath(ctx, this.rect);
      ctx.fillStyle = 'rgba(47,140,255,.12)';
      ctx.fill();
      ctx.strokeStyle = UI_COLOR;
      ctx.stroke();
    }
  },
};

// ---------------------------------------------------------------- Direct select (edit points and curve handles)
function pathFromHit(res, pt) {
  if (!res) return null;
  if (res.location && res.location.path) return res.location.path;
  if (res.segment) return res.segment.path;
  const it = res.item; // a fill hit: hit tests only return paths and compound paths here
  if (it instanceof paper.CompoundPath) return it.children.find((c) => c.contains(pt)) || it.children[0];
  return it;
}

// The path being edited is in the drawing, or it's an ink stroke's middle line (see ink.js), which isn't.
const alive = (p) => !!p && !!(p.parent || (p.data.inkOf && p.data.inkOf.parent));
const owner = (p) => topItem(p.data.inkOf || p);
// After a change to an ink stroke's middle line, the stroke is rebuilt around it (and replaces itself).
function touched() {
  const p = S.node.path;
  if (!p || !p.data.inkOf) return;
  const old = p.data.inkOf, fresh = rebuildInk(p);
  S.sel = S.sel.map((it) => (it === old ? fresh : it));
}

function nodeHandleAt(vp) {
  const path = S.node.path;
  if (!alive(path)) return null;
  const segs = path.segments;
  for (const seg of segs) {
    if (!showsHandles(seg)) continue;
    for (const which of ['handleIn', 'handleOut']) {
      if (seg[which].isZero()) continue;
      const hp = toView(seg.point.add(seg[which]));
      if (hp.getDistance(vp) <= 8) return { seg, which };
    }
  }
  for (const seg of segs) if (toView(seg.point).getDistance(vp) <= 8) return { seg, which: 'point' };
  return null;
}
function showsHandles(seg) {
  const sel = S.node.segs;
  return sel.has(seg) || (seg.previous && sel.has(seg.previous)) || (seg.next && sel.has(seg.next));
}

const node = {
  cursor: 'default',
  down(ev) {
    this.mode = null;
    this.p0 = ev.pt;
    this.changed = false;
    const h = nodeHandleAt(ev.vp);
    if (h) {
      if (h.which === 'point') {
        const segs = S.node.segs;
        if (ev.shift) segs.has(h.seg) ? segs.delete(h.seg) : segs.add(h.seg);
        else if (!segs.has(h.seg)) { segs.clear(); segs.add(h.seg); }
        if (ev.detail >= 2) { toggleSmooth(h.seg); touched(); commit(); }
        this.mode = 'points';
        // The point under the pointer leads (and snaps); the other selected points keep their distance to it.
        this.lead = h.seg.point.clone();
        this.starts = new Map([...segs].map((s) => [s, s.point.clone()]));
      } else {
        this.mode = 'handle';
        this.h = h;
        this.free = ev.alt;
      }
      emit('selection');
      redrawOverlay();
      return;
    }
    const res = hitItem(ev.pt);
    let path = pathFromHit(res, ev.pt);
    const ink = res && [res.item, res.item.parent].find(isInk);
    if (ink) {
      const editing = S.node.path && S.node.path.data.inkOf === ink;
      if (editing && ev.alt) { // Alt-click: a new point on the middle line
        const seg = S.node.path.divideAt(S.node.path.getNearestLocation(ev.pt));
        S.node.segs.clear();
        S.node.segs.add(seg);
        touched();
        commit();
        redrawOverlay();
        return;
      }
      path = editing ? S.node.path : spineOf(ink);
    }
    if (path && path.parent && isText(path.parent)) {
      const host = path.parent, at = host.children.indexOf(path);
      bakeAll([host]);
      commit();
      path = host.children[at] || host.children[0];
    }
    if (path && ev.alt && path === S.node.path && res.location) {
      const seg = path.divideAt(path.getNearestLocation(ev.pt));
      S.node.segs.clear();
      if (seg) S.node.segs.add(seg);
      commit();
      redrawOverlay();
      return;
    }
    if (path) {
      if (path !== S.node.path) { S.node.path = path; S.node.segs.clear(); }
      this.mode = 'path';
      this.b0 = path.bounds;
      this.moved = new paper.Point(0, 0);
      emit('selection');
      redrawOverlay();
      return;
    }
    if (!ev.shift) S.node.segs.clear();
    this.mode = 'marquee';
    this.start = ev.pt;
    this.rect = null;
    emit('selection');
    redrawOverlay();
  },
  drag(ev) {
    const want = ev.pt.subtract(this.p0);
    if (this.mode === 'points') {
      const d = snapPoint(this.lead.add(want), ev, [owner(S.node.path)]).subtract(this.lead);
      for (const [s, p] of this.starts) s.point = p.add(d);
      this.changed = true;
    } else if (this.mode === 'path') {
      const total = want.add(snapRect(new paper.Rectangle(this.b0.point.add(want), this.b0.size), ev, [owner(S.node.path)]));
      S.node.path.translate(total.subtract(this.moved));
      this.moved = total;
      this.changed = true;
    } else if (this.mode === 'handle') {
      const { seg, which } = this.h;
      const other = which === 'handleIn' ? 'handleOut' : 'handleIn';
      const v = ev.pt.subtract(seg.point);
      const was = seg[which].clone(); // a copy: Paper's handle objects are live and would already show the new value
      seg[which] = v;
      // Keep smooth points smooth unless Alt breaks them apart.
      if (!this.free && !seg[other].isZero() && Math.abs(was.normalize().dot(seg[other].normalize()) + 1) < 0.02) {
        seg[other] = v.normalize(-seg[other].length);
      }
      this.changed = true;
    } else if (this.mode === 'marquee') {
      this.rect = new paper.Rectangle(this.start, ev.pt);
    }
    if (this.changed) touched();
    redrawOverlay();
  },
  up() {
    clearGuides();
    if (this.mode === 'marquee' && this.rect && S.node.path) {
      for (const s of S.node.path.segments) if (this.rect.contains(s.point)) S.node.segs.add(s);
      emit('selection');
    } else if (this.mode === 'marquee' && !this.rect) {
      S.node.path = null;
      emit('selection');
    }
    this.rect = null;
    if (this.changed) commit();
    this.mode = null;
    redrawOverlay();
  },
  move(ev) {
    overlay.style.cursor = nodeHandleAt(ev.vp) ? 'pointer' : 'default';
  },
  cancel() { this.mode = null; this.rect = null; },
  key(e) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.node.path && S.node.segs.size) {
      deleteNodes();
      return true;
    }
    return false;
  },
  overlay(ctx) {
    const path = S.node.path;
    if (alive(path)) {
      strokeItemOutline(ctx, path);
      for (const seg of path.segments) {
        if (!showsHandles(seg)) continue;
        const p = toView(seg.point);
        for (const which of ['handleIn', 'handleOut']) {
          if (seg[which].isZero()) continue;
          const hp = toView(seg.point.add(seg[which]));
          ctx.strokeStyle = UI_COLOR;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(hp.x, hp.y); ctx.stroke();
          handleDot(ctx, hp, 3.5);
        }
      }
      for (const seg of path.segments) {
        const on = S.node.segs.has(seg);
        handleBox(ctx, toView(seg.point), 7, on ? UI_COLOR : '#fff');
      }
    }
    if (this.rect) {
      rectPath(ctx, this.rect);
      ctx.strokeStyle = UI_COLOR;
      ctx.stroke();
    }
  },
};

function toggleSmooth(seg) {
  if (seg.handleIn.isZero() && seg.handleOut.isZero()) seg.smooth({ type: 'catmull-rom' });
  else { seg.handleIn = null; seg.handleOut = null; }
}
export function deleteNodes() {
  const path = S.node.path;
  const segs = [...S.node.segs].sort((a, b) => b.index - a.index);
  for (const s of segs) s.remove();
  S.node.segs.clear();
  if (path.segments.length < 2) {
    (path.data.inkOf || path).remove(); // an ink stroke with no line left goes too
    S.node.path = null;
  } else touched();
  commit();
  emit('selection');
  redrawOverlay();
}
export function smoothNodes(on) {
  for (const s of S.node.segs) {
    if (on) s.smooth({ type: 'catmull-rom' });
    else { s.handleIn = null; s.handleOut = null; }
  }
  touched();
  commit();
  redrawOverlay();
}

// ---------------------------------------------------------------- Pen (click for corners, drag for curves)
const pen = {
  cursor: 'crosshair',
  path: null,
  down(ev) {
    const layer = this.path ? null : activeLayer();
    if (!this.path) {
      if (!layer) return;
      this.path = new paper.Path();
      layer.addChild(this.path);
      setStyle(this.path);
      if (!S.fill && !S.stroke) setStyle(this.path, { stroke: '#1d1418', width: 2 });
    }
    let pt = ev.pt;
    const segs = this.path.segments;
    if (segs.length > 1 && toView(segs[0].point).getDistance(ev.vp) <= 9) {
      this.path.closed = true;
      this.closing = true;
      this.seg = segs[0];
      return;
    }
    if (ev.shift && segs.length) pt = snap45(segs[segs.length - 1].point, pt);
    else pt = snapPoint(pt, ev, [this.path]);
    this.seg = this.path.add(pt);
  },
  drag(ev) {
    if (!this.seg) return;
    const v = ev.pt.subtract(this.seg.point);
    if (this.closing) {
      this.seg.handleIn = v.multiply(-1);
      if (!ev.alt) this.seg.handleOut = v;
    } else {
      this.seg.handleOut = v;
      if (!ev.alt) this.seg.handleIn = v.multiply(-1);
    }
    redrawOverlay();
  },
  up() {
    clearGuides();
    if (this.closing) { this.closing = false; this.finish(); }
    this.seg = null;
    redrawOverlay();
  },
  move(ev) { this.cursorPt = ev.pt; redrawOverlay(); },
  key(e) {
    if (e.key === 'Enter' || e.key === 'Escape') { this.finish(); return true; }
    if ((e.key === 'Backspace' || e.key === 'Delete') && this.path) {
      this.path.lastSegment && this.path.lastSegment.remove();
      if (!this.path.segments.length) { this.path.remove(); this.path = null; }
      redrawOverlay();
      return true;
    }
    return false;
  },
  finish() {
    const p = this.path;
    this.path = null;
    this.seg = null;
    if (!p) return;
    if (p.segments.length < 2) { p.remove(); redrawOverlay(); return; }
    commit();
    setSelection([p]);
  },
  cancel() { this.finish(); },
  overlay(ctx) {
    const p = this.path;
    if (!p) return;
    strokeItemOutline(ctx, p);
    for (const s of p.segments) handleBox(ctx, toView(s.point), 6);
    const last = p.lastSegment;
    if (last && this.cursorPt && !this.seg) {
      const a = toView(last.point), b = toView(this.cursorPt), h = toView(last.point.add(last.handleOut));
      ctx.strokeStyle = UI_COLOR;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.quadraticCurveTo(h.x, h.y, b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (p.segments.length > 1) handleDot(ctx, toView(p.firstSegment.point), 6, '#fff', '#ff5c8a');
  },
};
function snap45(from, to) {
  const v = to.subtract(from);
  const ang = Math.round(v.angle / 45) * 45;
  return from.add(new paper.Point({ angle: ang, length: v.length }));
}

// ---------------------------------------------------------------- Brush (pressure ink), Eraser
function sameColor(a, b) { return !!a && !!b && a.toCSS(true) === b.toCSS(true) && (a.alpha ?? 1) === (b.alpha ?? 1); }
function overlaps(a, b) {
  if (!a.bounds.intersects(b.bounds)) return false;
  if (a.intersects(b)) return true;
  const pa = a.firstSegment && a.firstSegment.point, pb = b.firstSegment && b.firstSegment.point;
  return (pb && a.contains(pb)) || (pa && b.contains(pa));
}

// The stroke so far, drawn on the overlay; rad(p) is the half width at a point's pressure.
function pointsOverlay(ctx, pts, rad, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  const z = paper.view.zoom;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[i - 1] || p;
    const r = rad(p.p) * z;
    const a = toView(new paper.Point(q.x, q.y)), b = toView(new paper.Point(p.x, p.y));
    ctx.lineWidth = r * 2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
}

// Shape assist: a stroke that's nearly a straight line, an ellipse (a circle when nearly round) or a circular arc,
// as clean points of that shape at the stroke's average pressure; null when it isn't close to any of them. `tol` is
// how far (drawing units) a stroke may wander from the shape at least.
export function recognize(pts, tol) {
  const n = pts.length;
  if (n < 3) return null;
  const P = pts.map((q) => new paper.Point(q.x, q.y)), a = P[0], b = P[n - 1];
  const p = pts.reduce((s, q) => s + q.p, 0) / n;
  const dots = (list, closed) => ({ pts: list.map((q) => ({ x: q.x, y: q.y, p })), closed });
  const len = P.reduce((s, q, i) => s + (i ? q.getDistance(P[i - 1]) : 0), 0);
  const steps = (l) => Math.max(8, Math.ceil(l / Math.max(tol / 2, 1)));
  // A line: every point near the line from the first to the last.
  const ab = b.subtract(a), L = ab.length;
  if (L > tol * 4 && P.every((q) => Math.abs(ab.cross(q.subtract(a))) / L < Math.max(tol, L * 0.04))) {
    return dots(Array.from({ length: steps(L) + 1 }, (_, i) => a.add(ab.multiply(i / steps(L)))), false);
  }
  // An ellipse: a loop (it ends near where it began), as wide each way as its points spread.
  const c = P.reduce((s, q) => s.add(q), new paper.Point(0, 0)).divide(n);
  if (a.getDistance(b) < len * 0.15) {
    let xx = 0, yy = 0, xy = 0;
    for (const q of P) { const d = q.subtract(c); xx += d.x * d.x; yy += d.y * d.y; xy += d.x * d.y; }
    const th = Math.atan2(2 * xy, xx - yy) / 2, u = new paper.Point(Math.cos(th), Math.sin(th)), v = new paper.Point(-u.y, u.x);
    let rx = Math.sqrt((2 * P.reduce((s, q) => s + q.subtract(c).dot(u) ** 2, 0)) / n);
    let ry = Math.sqrt((2 * P.reduce((s, q) => s + q.subtract(c).dot(v) ** 2, 0)) / n);
    if (Math.abs(rx - ry) < 0.12 * Math.max(rx, ry)) rx = ry = (rx + ry) / 2; // nearly round: a circle
    const off = (q) => { const d = q.subtract(c); return Math.abs(Math.hypot(d.dot(u) / rx, d.dot(v) / ry) - 1) * Math.min(rx, ry); };
    if (P.reduce((s, q) => s + off(q), 0) / n < Math.max(tol, 0.06 * Math.min(rx, ry))) {
      const k = steps(len);
      const out = dots(Array.from({ length: k + 1 }, (_, i) => { const t = (2 * Math.PI * i) / k; return c.add(u.multiply(rx * Math.cos(t))).add(v.multiply(ry * Math.sin(t))); }), true);
      out.ellipse = { center: c, radius: [rx, ry], angle: (th * 180) / Math.PI }; // for an exact one in Line mode
      return out;
    }
    return null;
  }
  // An arc: the circle through the points (least squares), if they stay near it and it bends enough to be one.
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0;
  for (const q of P) { const z = q.x * q.x + q.y * q.y; sx += q.x; sy += q.y; sxx += q.x * q.x; syy += q.y * q.y; sxy += q.x * q.y; sz += z; sxz += q.x * z; syz += q.y * z; }
  const m = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]], r = [-sxz, -syz, -sz];
  const det = (M) => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  const D = det(m), col = (j) => m.map((row, i) => row.map((v2, k) => (k === j ? r[i] : v2)));
  const [A, B, C] = [0, 1, 2].map((j) => det(col(j)) / D);
  const o = new paper.Point(-A / 2, -B / 2), R = Math.sqrt(o.x * o.x + o.y * o.y - C);
  const a0 = a.subtract(o).angle, sweep = normAngle(P[n >> 1].subtract(o).angle - a0) + normAngle(b.subtract(o).angle - P[n >> 1].subtract(o).angle);
  if (!(R > tol * 2) || Math.abs(sweep) < 30 || P.some((q) => Math.abs(q.getDistance(o) - R) > Math.max(tol, R * 0.06))) return null;
  const k = steps(len);
  return dots(Array.from({ length: k + 1 }, (_, i) => o.add(new paper.Point({ angle: a0 + (sweep * i) / k, length: R }))), false);
}

// Steady: the line follows the pointer on a string `steady` × 3 screen pixels long, so wobbles shorter than the
// string never reach it; on lifting, the line catches up to where the pointer is. Magnet: with a sketch loaded,
// every point is pulled toward the sketch line under it first (hold Ctrl to draw freely).
const brush = {
  cursor: 'crosshair',
  pts: [],
  down(ev) {
    this.layer = activeLayer();
    if (!this.layer) return;
    this.pressure = S.brush.pressure && ev.pointerType === 'pen';
    this.ink = S.brush.magnet ? sketchInk() : null;
    this.lead = this.raw = this.still = this.pull(ev);
    this.pts = [{ x: this.lead.x, y: this.lead.y, p: ev.pressure }];
    this.assist = null;
  },
  // Holding still for a moment at the end of a stroke (Shape assist): it becomes a clean line, ellipse or arc if
  // it's close to one, shown before you lift; moving on carries on drawing freehand.
  hold() {
    clearTimeout(this.timer);
    if (!S.brush.assist) return;
    this.timer = setTimeout(() => { // (up to where the pen is, past a Steady string)
      this.assist = recognize([...this.pts, { x: this.raw.x, y: this.raw.y, p: this.pts[this.pts.length - 1].p }], px(6));
      redrawOverlay();
    }, 550);
  },
  pull(e) { return this.ink && !e.ctrl ? magnetPoint(e.pt, this.ink, px(14), S.brush.pull) : e.pt; },
  drag(ev, list) {
    if (!this.layer) return;
    const string = px(S.brush.steady * 3);
    for (const e of list) {
      this.raw = this.pull(e);
      const d = this.raw.subtract(this.lead), len = d.length;
      if (len <= string) continue;
      this.lead = this.raw.subtract(d.multiply(string / len));
      this.pts.push({ x: this.lead.x, y: this.lead.y, p: e.pressure });
    }
    if (this.raw.getDistance(this.still) > px(4)) { this.still = this.raw; this.assist = null; this.hold(); }
    redrawOverlay();
  },
  up() {
    if (!this.layer) return;
    clearTimeout(this.timer);
    let pts = this.pts;
    const tail = this.raw.subtract(this.lead), steps = Math.ceil(tail.length / px(2)), lastP = pts[pts.length - 1].p;
    for (let i = 1; i <= steps; i++) { const q = this.lead.add(tail.multiply(i / steps)); pts.push({ x: q.x, y: q.y, p: lastP }); }
    const assist = this.assist;
    if (assist) pts = assist.pts;
    this.pts = [];
    this.assist = null;
    const b = S.brush;
    if (b.mode === 'line') {
      let path;
      if (assist && assist.ellipse) {
        const e = assist.ellipse;
        path = new paper.Path.Ellipse({ center: e.center, radius: e.radius, insert: false }).rotate(e.angle, e.center);
      } else {
        path = new paper.Path({ insert: false });
        pts.forEach((p) => path.add(new paper.Point(p.x, p.y)));
        if (path.segments.length < 2) path.add(path.firstSegment.point.add(new paper.Point(0.01, 0)));
        path.simplify(Math.max(0.15, px(b.smooth)));
      }
      setStyle(path, { fill: null, stroke: S.stroke || S.fill || '#1d1418', width: b.size });
      this.layer.addChild(path);
    } else {
      const ink = S.fill || S.stroke || '#1d1418';
      let shape, thin = null;
      if (assist && assist.ellipse) {
        // An exact ring, as wide as the stroke at its average pressure (no seam where the stroke began and ended).
        const e = assist.ellipse, w = this.pressure ? radius(b.size, b.thin, FEEL[b.feel](pts[0].p)) : b.size / 2;
        const ring = (d) => new paper.Path.Ellipse({ center: e.center, radius: e.radius.map((r) => Math.max(0.1, r + d)), insert: false }).rotate(e.angle, e.center);
        shape = ring(w).subtract(ring(-w), { insert: false });
      } else {
        if (this.pressure) { thin = b.thin; pts.forEach((q) => { q.p = FEEL[b.feel](q.p); }); }
        else if (b.taper) { thin = b.thin; taper(pts, b.size); }
        shape = strokeOutline(pts, b.size, thin);
      }
      const color = new paper.Color(ink);
      const others = b.merge ? this.layer.children.filter((c) => (c instanceof paper.Path || c instanceof paper.CompoundPath)
        && !isText(c) && c.closed !== false && !c.strokeColor && sameColor(c.fillColor, color) && c.visible && !c.locked && overlaps(shape, c)) : [];
      for (const o of others) shape = shape.unite(o, { insert: false });
      setStyle(shape, { fill: ink, stroke: null, width: 0 });
      // A merged stroke takes the place of the topmost shape it joined, so it doesn't jump in front of everything else.
      if (others.length) {
        shape.insertAbove(others[others.length - 1]);
        others.forEach((o) => o.remove());
      } else {
        // On its own (not merged, not an assisted ring) it stays editable ink: the Points tool reshapes its middle line.
        if (!(assist && assist.ellipse)) makeInk(shape, pts, b.size, thin);
        this.layer.addChild(shape);
      }
    }
    this.layer = null;
    commit();
    redrawOverlay();
  },
  cancel() { clearTimeout(this.timer); this.pts = []; this.assist = null; this.layer = null; redrawOverlay(); },
  overlay(ctx) {
    if (!this.pts.length) return;
    const b = S.brush;
    const color = b.mode === 'line' ? (S.stroke || S.fill || '#1d1418') : (S.fill || S.stroke || '#1d1418');
    const thin = this.pressure && b.mode !== 'line' ? b.thin : null;
    pointsOverlay(ctx, this.assist ? this.assist.pts : this.pts, (p) => radius(b.size, thin, thin == null ? 1 : FEEL[b.feel](p)), color);
    if (b.steady) { // the string, from the line to the pointer
      const a = toView(this.lead), c = toView(this.raw);
      ctx.strokeStyle = UI_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      handleDot(ctx, a, 3);
    }
  },
};

function erasable(layer) {
  const out = [];
  const walk = (it) => {
    if (!it.visible || it.locked) return;
    if (it instanceof paper.Path || it instanceof paper.CompoundPath) out.push(it);
    else if (it.children && !(it instanceof paper.CompoundPath)) it.children.forEach(walk);
  };
  layer.children.forEach(walk);
  return out;
}

const eraser = {
  cursor: 'cell',
  pts: [],
  down(ev) {
    this.layer = activeLayer();
    if (!this.layer) return;
    this.pts = [{ x: ev.pt.x, y: ev.pt.y, p: ev.pressure }];
    this.pressure = S.brush.pressure && ev.pointerType === 'pen';
  },
  drag(ev, list) {
    if (!this.layer) return;
    for (const e of list) this.pts.push({ x: e.pt.x, y: e.pt.y, p: e.pressure });
    redrawOverlay();
  },
  up() {
    if (!this.layer) return;
    const cut = strokeOutline(this.pts, S.eraser.size, this.pressure ? 0.12 : null);
    this.pts = [];
    let changed = false;
    for (const it of erasable(this.layer)) {
      if (!it.bounds.intersects(cut.bounds)) continue;
      if (isText(it) || isInk(it)) bake(it);
      // Lines need trace: false, or Paper.js returns nothing and the whole line would vanish.
      const line = it instanceof paper.CompoundPath ? it.children.every((c) => !c.closed) : !it.closed;
      let r;
      try { r = it.subtract(cut, { insert: false, trace: !line }); } catch { continue; }
      // Gone, or (for a shape) nothing left with any area. Lines have no area, so only emptiness counts.
      if (r.isEmpty() || (!line && Math.abs(r.area) < 1e-3)) it.remove();
      else it.replaceWith(r);
      changed = true;
    }
    this.layer = null;
    S.sel = S.sel.filter((i) => i.parent);
    if (changed) commit();
    redrawOverlay();
  },
  cancel() { this.pts = []; this.layer = null; redrawOverlay(); },
  overlay(ctx) {
    if (this.pts.length) pointsOverlay(ctx, this.pts, (p) => radius(S.eraser.size, this.pressure ? 0.12 : null, p), 'rgba(255,92,138,.45)');
  },
};

// ---------------------------------------------------------------- Shapes
export function makeShape(kind, rect) {
  const sh = S.shape;
  let p;
  if (kind === 'rect') p = new paper.Path.Rectangle({ rectangle: rect, radius: Math.min(sh.radius, rect.width / 2, rect.height / 2), insert: false });
  else if (kind === 'ellipse') p = new paper.Path.Ellipse({ rectangle: rect, insert: false });
  else if (kind === 'polygon') p = new paper.Path.RegularPolygon({ center: [0, 0], sides: sh.sides, radius: 100, insert: false });
  else p = new paper.Path.Star({ center: [0, 0], points: sh.points, radius1: 100, radius2: 100 * sh.inner, insert: false });
  if (kind === 'polygon' || kind === 'star') p.bounds = rect;
  return p;
}
const shape = {
  cursor: 'crosshair',
  down(ev) {
    this.layer = activeLayer();
    this.start = snapPoint(ev.pt, ev, []);
    this.item = null;
  },
  drag(ev) {
    if (!this.layer) return;
    let a = this.start, b = snapPoint(ev.pt, ev, [this.item]);
    let w = b.x - a.x, h = b.y - a.y;
    if (ev.shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
    let rect = ev.alt ? new paper.Rectangle(a.subtract([w, h]), a.add([w, h])) : new paper.Rectangle(a, a.add([w, h]));
    if (rect.width < px(2) || rect.height < px(2)) return;
    if (this.item) this.item.remove();
    this.item = makeShape(S.shape.kind, rect);
    setStyle(this.item);
    if (!S.fill && !S.stroke) setStyle(this.item, { stroke: '#1d1418', width: 2 });
    this.layer.addChild(this.item);
    redrawOverlay();
  },
  up() {
    clearGuides();
    if (this.item) { commit(); setSelection([this.item]); }
    this.item = null;
    this.layer = null;
  },
  cancel() { if (this.item) this.item.remove(); this.item = null; },
  overlay(ctx) { if (this.item) strokeItemOutline(ctx, this.item); },
};

// ---------------------------------------------------------------- Eyedropper
const dropper = {
  cursor: 'copy',
  down(ev) {
    const res = paper.project.hitTest(ev.pt, { fill: true, stroke: true, tolerance: px(4) });
    if (!res) {
      // Off the shapes, pick the sketch's color into Fill or Stroke (whichever the color panel is on).
      const c = sketchColorAt(ev.pt);
      if (!c) return;
      S[S.chip] = c;
      emit('style');
      toast(`Picked ${c} from the sketch`);
      return;
    }
    const it = res.item;
    S.fill = it.fillColor ? it.fillColor.toCSS(true) : null;
    S.stroke = it.strokeColor ? it.strokeColor.toCSS(true) : null;
    if (it.strokeColor) S.strokeWidth = it.strokeWidth;
    emit('style');
    toast('Picked up its colors');
  },
  drag() {}, up() {}, cancel() {},
};

// ---------------------------------------------------------------- Fill bucket (the work is in trace.js)
const bucket = {
  cursor: 'crosshair',
  down(ev) {
    const layer = activeLayer();
    if (layer) fillAt(ev.pt, layer, S.bucket.gap);
  },
  drag() {}, up() {}, cancel() {},
};

// ---------------------------------------------------------------- Text (the editor lives in textui.js)
const text = {
  cursor: 'text',
  down(ev) {
    const res = hitItem(ev.pt);
    const item = res && topItem(res.item);
    if (item && isText(item)) { setSelection([item]); emit('edit-text', { item }); return; }
    const layer = activeLayer();
    if (layer) emit('edit-text', { at: ev.pt, layer });
  },
  drag() {}, up() {}, cancel() {},
};

const hand = { cursor: 'grab', cancel() {} }; // main.js pans while the hand tool is on

export const TOOLS = { select, node, pen, brush, eraser, shape, bucket, text, dropper, hand };
