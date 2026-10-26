// The drawing tools. Each gets pointer events in drawing coordinates (ev.pt) and screen coordinates (ev.vp),
// with pen pressure in ev.pressure (1 for a mouse), and may draw hints on the overlay.
import { S, emit, toast, isEditable, topItem, editableLayer, unionBounds, setStyle, normAngle } from './state.js';
import { commit } from './history.js';
import { px, toView, redrawOverlay, strokeItemOutline, handleBox, handleDot, overlay, UI_COLOR, sketchColorAt } from './view.js';
import { isText, bake, bakeAll } from './text.js';
import { snapPoint, snapRect, clearGuides } from './snap.js';
import { fillAt } from './trace.js';

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
  const vb = new paper.Rectangle(toView(b.topLeft), toView(b.bottomRight));
  for (const i of [0, 2, 4, 6]) {
    const h = toView(b[HANDLES[i]]);
    const d = h.getDistance(vp);
    if (d > 10 && d < 30 && !vb.contains(vp)) return { kind: 'rotate', i };
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
      const tl = toView(b.topLeft), br = toView(b.bottomRight);
      ctx.strokeStyle = UI_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
      ctx.setLineDash([]);
      for (const h of HANDLES) handleBox(ctx, toView(b[h]));
    }
    if (this.rect) {
      const a = toView(this.rect.topLeft), c = toView(this.rect.bottomRight);
      ctx.fillStyle = 'rgba(47,140,255,.12)';
      ctx.fillRect(a.x, a.y, c.x - a.x, c.y - a.y);
      ctx.strokeStyle = UI_COLOR;
      ctx.strokeRect(a.x, a.y, c.x - a.x, c.y - a.y);
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

function nodeHandleAt(vp) {
  const path = S.node.path;
  if (!path || !path.parent) return null;
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
        if (ev.detail >= 2) { toggleSmooth(h.seg); commit(); }
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
      const d = snapPoint(this.lead.add(want), ev, [topItem(S.node.path)]).subtract(this.lead);
      for (const [s, p] of this.starts) s.point = p.add(d);
      this.changed = true;
    } else if (this.mode === 'path') {
      const total = want.add(snapRect(new paper.Rectangle(this.b0.point.add(want), this.b0.size), ev, [topItem(S.node.path)]));
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
    if (path && path.parent) {
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
      const a = toView(this.rect.topLeft), c = toView(this.rect.bottomRight);
      ctx.strokeStyle = UI_COLOR;
      ctx.strokeRect(a.x, a.y, c.x - a.x, c.y - a.y);
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
    path.remove();
    S.node.path = null;
  }
  commit();
  emit('selection');
  redrawOverlay();
}
export function smoothNodes(on) {
  for (const s of S.node.segs) {
    if (on) s.smooth({ type: 'catmull-rom' });
    else { s.handleIn = null; s.handleOut = null; }
  }
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
// Turns sampled pen points into a filled outline: the line's width follows the pressure, then it's fitted to curves.
export function strokeOutline(pts, size, usePressure) {
  const minD = Math.max(px(1.2), size * 0.02);
  const raw = [];
  for (const p of pts) {
    const last = raw[raw.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= minD) raw.push({ ...p });
  }
  const rad = (p) => (size / 2) * (usePressure ? 0.12 + 0.88 * p : 1);
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

function sameColor(a, b) { return !!a && !!b && a.toCSS(true) === b.toCSS(true) && (a.alpha ?? 1) === (b.alpha ?? 1); }
function overlaps(a, b) {
  if (!a.bounds.intersects(b.bounds)) return false;
  if (a.intersects(b)) return true;
  const pa = a.firstSegment && a.firstSegment.point, pb = b.firstSegment && b.firstSegment.point;
  return (pb && a.contains(pb)) || (pa && b.contains(pa));
}

function pointsOverlay(ctx, pts, size, usePressure, color) {
  if (!pts.length) return;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  const z = paper.view.zoom;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[i - 1] || p;
    const r = (size / 2) * (usePressure ? 0.12 + 0.88 * p.p : 1) * z;
    const a = toView(new paper.Point(q.x, q.y)), b = toView(new paper.Point(p.x, p.y));
    ctx.lineWidth = r * 2;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
}

const brush = {
  cursor: 'crosshair',
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
    const pts = this.pts;
    this.pts = [];
    const b = S.brush;
    if (b.mode === 'line') {
      const path = new paper.Path({ insert: false });
      pts.forEach((p) => path.add(new paper.Point(p.x, p.y)));
      if (path.segments.length < 2) path.add(path.firstSegment.point.add(new paper.Point(0.01, 0)));
      path.simplify(Math.max(0.15, px(b.smooth)));
      setStyle(path, { fill: null, stroke: S.stroke || S.fill || '#1d1418', width: b.size });
      this.layer.addChild(path);
    } else {
      const ink = S.fill || S.stroke || '#1d1418';
      let shape = strokeOutline(pts, b.size, this.pressure);
      const color = new paper.Color(ink);
      const others = b.merge ? this.layer.children.filter((c) => (c instanceof paper.Path || c instanceof paper.CompoundPath)
        && !isText(c) && c.closed !== false && !c.strokeColor && sameColor(c.fillColor, color) && c.visible && !c.locked && overlaps(shape, c)) : [];
      for (const o of others) shape = shape.unite(o, { insert: false });
      setStyle(shape, { fill: ink, stroke: null, width: 0 });
      // A merged stroke takes the place of the topmost shape it joined, so it doesn't jump in front of everything else.
      if (others.length) {
        shape.insertAbove(others[others.length - 1]);
        others.forEach((o) => o.remove());
      } else this.layer.addChild(shape);
    }
    this.layer = null;
    commit();
    redrawOverlay();
  },
  cancel() { this.pts = []; this.layer = null; redrawOverlay(); },
  overlay(ctx) {
    if (!this.pts.length) return;
    const b = S.brush;
    const color = b.mode === 'line' ? (S.stroke || S.fill || '#1d1418') : (S.fill || S.stroke || '#1d1418');
    pointsOverlay(ctx, this.pts, b.size, this.pressure && b.mode !== 'line', color);
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
    const cut = strokeOutline(this.pts, S.eraser.size, this.pressure);
    this.pts = [];
    let changed = false;
    for (const it of erasable(this.layer)) {
      if (!it.bounds.intersects(cut.bounds)) continue;
      if (isText(it)) bake(it);
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
    if (this.pts.length) pointsOverlay(ctx, this.pts, S.eraser.size, this.pressure, 'rgba(255,92,138,.45)');
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
