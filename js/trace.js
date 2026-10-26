// From pixels to vector shapes: the outlines of a pixel mask as smooth paths. Used by the fill bucket (the area you
// tap, worked out on a picture of the drawing) and Auto trace (the sketch, color by color, onto a new layer).
import { S, toast, emit, topItem } from './state.js';
import { commit } from './history.js';
import { exportItems } from './export.js';
import { sketchMatrix } from './view.js';
import { sketchColors } from './store.js';

// Grows a mask (1 = in) by `steps` pixels, only into pixels `into` allows (any when missing). Steps go to the four
// neighbours, every other one to the diagonal ones too, so it grows roughly round (an octagon) rather than a diamond.
export function grow(mask, w, h, steps, into) {
  const n = mask.length;
  let front = [];
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const x = i % w;
    if ((x > 0 && !mask[i - 1]) || (x < w - 1 && !mask[i + 1]) || (i >= w && !mask[i - w]) || (i < n - w && !mask[i + w])) front.push(i);
  }
  const add = (j, out) => { if (!mask[j] && (!into || into[j])) { mask[j] = 1; out.push(j); } };
  for (let s = 0; s < steps && front.length; s++) {
    const next = [];
    for (const i of front) {
      const x = i % w, up = i >= w, down = i < n - w;
      if (x > 0) add(i - 1, next);
      if (x < w - 1) add(i + 1, next);
      if (up) add(i - w, next);
      if (down) add(i + w, next);
      if (s % 2) {
        if (up && x > 0) add(i - w - 1, next);
        if (up && x < w - 1) add(i - w + 1, next);
        if (down && x > 0) add(i + w - 1, next);
        if (down && x < w - 1) add(i + w + 1, next);
      }
    }
    front = next;
  }
  return mask;
}

// The outlines of a mask, walking the pixel edges with the inside on the right: outsides come out clockwise and holes
// the other way round, so they fill correctly. Where two pixels touch only at a corner the walk turns right, keeping
// them apart. Each outline is the list of its edges as [x, y, direction], (x, y) being the pixel corner it starts at.
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1]; // east, south, west, north (y goes down)
export function outlines(mask, w, h) {
  const W = w + 1;
  const dirs = new Int8Array(W * (h + 1) * 2).fill(-1); // up to two edges leave each pixel corner
  const used = new Uint8Array(dirs.length);
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const put = (x, y, d) => { const v = (y * W + x) * 2; dirs[dirs[v] < 0 ? v : v + 1] = d; };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (!inside(x, y - 1)) put(x, y, 0);
      if (!inside(x + 1, y)) put(x + 1, y, 1);
      if (!inside(x, y + 1)) put(x + 1, y + 1, 2);
      if (!inside(x - 1, y)) put(x, y + 1, 3);
    }
  }
  const loops = [];
  for (let start = 0; start < dirs.length; start++) {
    if (dirs[start] < 0 || used[start]) continue;
    const vs = [], ds = [];
    let slot = start;
    for (;;) {
      used[slot] = 1;
      const v = slot >> 1, d = dirs[slot];
      vs.push(v);
      ds.push(d);
      const a = (v + DX[d] + DY[d] * W) * 2;
      slot = dirs[a + 1] < 0 || dirs[a] === ((d + 1) & 3) ? a : a + 1;
      if (slot === start) break;
    }
    loops.push(vs.map((v, i) => [v % W, Math.floor(v / W), ds[i]]));
  }
  return loops;
}

function area(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return a / 2;
}

// One closed outline (its edges, see outlines) as curves within `tol` pixels. Corners (pixel corners where it turns
// sharply over a few edges, so pixel steps don't count) stay sharp, and each run between two corners is fitted on
// its own through the edges' midpoints, smoothed a little; that also keeps small loops from collapsing the way
// fitting a whole loop at once can. A loop with no corners is split in four and joined smoothly.
function fitLoop(edges, tol) {
  const n = edges.length, K = Math.max(1, Math.min(3, Math.floor(n / 4)));
  const mids = edges.map(([x, y, d]) => [x + DX[d] / 2, y + DY[d] / 2]);
  const mid = (i) => mids[(i + n) % n];
  const turns = edges.map(([x, y], i) => {
    const a = mid(i - K), b = mid(i + K - 1);
    const t = Math.abs(Math.atan2(b[1] - y, b[0] - x) - Math.atan2(y - a[1], x - a[0]));
    return t > Math.PI ? 2 * Math.PI - t : t;
  });
  const cuts = turns.map((t, i) => i).filter((i) => {
    if (turns[i] < 1.2) return false;
    for (let j = 1; j <= K; j++) if (turns[(i - j + n) % n] >= turns[i] || turns[(i + j) % n] > turns[i]) return false;
    return true;
  });
  const corner = new Set(cuts);
  const soft = mids.map((p, i) => {
    if (corner.has(i) || corner.has((i + 1) % n)) return p; // don't round a corner off
    const a = mid(i - 1), b = mid(i + 1);
    return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4];
  });
  // Too few corners to cut the loop into runs: cut it at evenly spread pixel corners too.
  if (!cuts.length) cuts.push(0, n >> 2, n >> 1, (3 * n) >> 2);
  else if (cuts.length === 1) cuts.push(cuts[0] + (n >> 1)); // half way round (indexes wrap below)
  const path = new paper.Path({ closed: true, insert: false });
  const joins = [[0, cuts[0]]]; // [the path's segment, the cut] where runs meet
  cuts.forEach((c, k) => {
    const end = k + 1 < cuts.length ? cuts[k + 1] : cuts[0] + n;
    // From pixel corner to pixel corner, through the midpoints of the edges between.
    const pts = [edges[c].slice(0, 2), ...Array.from({ length: end - c }, (_, i) => soft[(c + i) % n]), edges[end % n].slice(0, 2)];
    const run = new paper.Path({ segments: pts, insert: false });
    run.simplify(tol);
    const segs = run.segments;
    if (k === 0) path.add(new paper.Segment(segs[0].point, null, segs[0].handleOut));
    else { path.lastSegment.handleOut = segs[0].handleOut; joins.push([path.segments.length - 1, c]); }
    for (const s of segs.slice(1)) path.add(new paper.Segment(s.point, s.handleIn, s.handleOut));
  });
  // The last run ends where the first began: fold its end onto the first point.
  path.firstSegment.handleIn = path.lastSegment.handleIn;
  path.lastSegment.remove();
  // Where a run was cut somewhere that isn't a corner, line the two handles up so the join doesn't show.
  for (const [i, c] of joins) {
    const s = path.segments[i];
    if (corner.has(c) || s.handleIn.isZero() || s.handleOut.isZero()) continue;
    const d = s.handleOut.normalize().subtract(s.handleIn.normalize()).normalize();
    s.handleIn = d.multiply(-s.handleIn.length);
    s.handleOut = d.multiply(s.handleOut.length);
  }
  return path;
}

// A mask's outlines as one shape, in pixel units, fitted to curves within `smooth` pixels, leaving out pieces and
// holes smaller than `speck` square pixels. Null when nothing is left.
export function traceMask(mask, w, h, { smooth = 1, speck = 1 } = {}) {
  const paths = [];
  for (const edges of outlines(mask, w, h)) {
    if (Math.abs(area(edges)) < Math.max(1, speck)) continue;
    paths.push(fitLoop(edges, smooth));
  }
  if (!paths.length) return null;
  return paths.length === 1 ? paths[0] : new paper.CompoundPath({ children: paths, insert: false });
}

// ---------------------------------------------------------------- Fill bucket
// The area to fill around pixel `seed` of a picture: pixels like the seed one, with gaps in the lines narrower than
// about twice `gap` pixels closed, then grown back to the lines and `tuck` pixels on (under them, and into any
// corner the growing back missed) so no seam shows.
// Returns the mask, or 'line' (tapped on or right next to a line) or 'open' (the area runs out of the picture).
export function areaAt(d, w, h, seed, gap, tuck) {
  const n = w * h, s = seed * 4;
  const like = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    like[i] = Math.abs(d[p] - d[s]) + Math.abs(d[p + 1] - d[s + 1]) + Math.abs(d[p + 2] - d[s + 2]) + Math.abs(d[p + 3] - d[s + 3]) <= 96 ? 1 : 0;
  }
  const walls = grow(like.map((v) => 1 - v), w, h, gap);
  if (walls[seed]) return 'line';
  const out = new Uint8Array(n);
  const stack = [seed];
  out[seed] = 1;
  while (stack.length) {
    const i = stack.pop(), x = i % w;
    if (x === 0 || x === w - 1 || i < w || i >= n - w) return 'open';
    for (const j of [i - 1, i + 1, i - w, i + w]) if (!out[j] && !walls[j]) { out[j] = 1; stack.push(j); }
  }
  grow(out, w, h, gap, like);
  return grow(out, w, h, tuck, walls);
}

// Fills the area around a drawing point with the Fill color, on `layer`: above the shape you tapped if it's on that
// layer, otherwise at the bottom of it, under the lines.
export function fillAt(pt, layer, gapPx) {
  const g = exportItems('page');
  const margin = 8 / paper.view.zoom;
  const box = (g.children.length ? g.strokeBounds.unite(pageRect()) : pageRect()).expand(margin * 2);
  if (!box.contains(pt)) return toast('Tap inside an area closed by lines');
  g.addChild(new paper.Path.Rectangle({ rectangle: box, insert: false })); // makes the picture cover the whole box
  // Pixels per drawing unit: as fine as about 4 million pixels allow, up to 4.
  const k = Math.min(4, Math.sqrt(4e6 / (box.width * box.height)));
  const raster = g.rasterize(72 * k, false);
  const w = raster.width, h = raster.height, tl = raster.bounds.topLeft;
  const x = Math.floor((pt.x - tl.x) * k), y = Math.floor((pt.y - tl.y) * k);
  const mask = areaAt(raster.getImageData().data, w, h, y * w + x, Math.round(gapPx * k / paper.view.zoom), Math.ceil(1.5 * k));
  if (mask === 'line') return toast('Tap inside an area, a little away from the lines');
  if (mask === 'open') return toast('That area isn\'t closed: look for a gap in its lines, or make Close gaps bigger');
  const shape = traceMask(mask, w, h, { smooth: 0.8, speck: 4 });
  shape.transform(new paper.Matrix().translate(tl).scale(1 / k));
  shape.fillColor = new paper.Color(S.fill || '#1d1418');
  shape.strokeColor = null;
  const res = paper.project.hitTest(pt, { fill: true, tolerance: 0, match: (r) => topItem(r.item).layer === layer });
  if (res) shape.insertAbove(topItem(res.item));
  else layer.insertChild(0, shape);
  commit();
  emit('changed');
  return shape;
}
const pageRect = () => new paper.Rectangle(0, 0, S.doc.w, S.doc.h);

// ---------------------------------------------------------------- Auto trace
// The sketch as shapes, bottom first, lined up over it. Colors: one shape per main color (biggest at the bottom, each
// tucked a pixel under the colors above it so no seams show); the background (the color most of the edge has) can
// be left out. Ink: one shape of everything darker than `dark`, in its average color.
export function traceSketch(o) {
  const sk = S.sketch;
  const k = Math.min(1, o.detail / Math.max(sk.w, sk.h));
  const w = Math.max(2, Math.round(sk.w * k)), h = Math.max(2, Math.round(sk.h * k)), n = w * h;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(document.getElementById('sketch'), 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const place = sketchMatrix(sk).scale(sk.w / w, sk.h / h);
  const shape = (mask, color) => {
    const it = traceMask(mask, w, h, o);
    if (it) { it.transform(place); it.fillColor = color; }
    return it;
  };
  if (o.mode === 'ink') {
    const mask = new Uint8Array(n), sum = [0, 0, 0];
    let m = 0;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      if (d[p + 3] < 128 || 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2] >= o.dark) continue;
      mask[i] = 1; sum[0] += d[p]; sum[1] += d[p + 1]; sum[2] += d[p + 2]; m++;
    }
    const it = m && shape(mask, new paper.Color(sum[0] / m / 255, sum[1] / m / 255, sum[2] / m / 255));
    return it ? [it] : [];
  }
  const pal = sketchColors(o.colors).map((hex) => new paper.Color(hex));
  const rgb = pal.map((p) => [p.red * 255, p.green * 255, p.blue * 255]);
  const label = new Int8Array(n).fill(-1), count = pal.map(() => 0), edge = pal.map(() => 0);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (d[p + 3] < 128) continue;
    let best = 0, bestD = Infinity;
    rgb.forEach(([r, g, b], j) => {
      const dd = (d[p] - r) ** 2 + (d[p + 1] - g) ** 2 + (d[p + 2] - b) ** 2;
      if (dd < bestD) { bestD = dd; best = j; }
    });
    label[i] = best;
    count[best]++;
    const x = i % w;
    if (x === 0 || x === w - 1 || i < w || i >= n - w) edge[best]++;
  }
  let order = pal.map((_, j) => j).filter((j) => count[j]).sort((a, b) => count[b] - count[a]);
  const bg = Math.max(...edge) > 0 ? edge.indexOf(Math.max(...edge)) : -1;
  if (o.skipBg) order = order.filter((j) => j !== bg);
  const above = new Uint8Array(n), out = [];
  for (const j of order.reverse()) {
    const mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (label[i] === j) mask[i] = 1;
    grow(mask, w, h, 1, above);
    const it = shape(mask, pal[j]);
    for (let i = 0; i < n; i++) if (mask[i]) above[i] = 1;
    if (it) out.unshift(it);
  }
  return out;
}

const KEY = 'jamdraw.trace';
const topts = { mode: 'color', colors: 10, skipBg: true, dark: 128, detail: 1024, smooth: 1.5, speck: 16 };
try { Object.assign(topts, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* private window */ }

// The Auto trace panel: a live preview on a new layer, kept with Trace or taken away with Cancel (or Esc).
export function traceDialog() {
  const d = document.getElementById('tracedlg');
  const radio = (name, map) => Object.entries(map).map(([v, l]) => `<button type="button" class="txt${String(topts[name]) === v ? ' on' : ''}" data-${name}="${v}">${l}</button>`).join('');
  const slider = (name, label, min, max, step) => `<label class="row tr-${name}">${label} <input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${topts[name]}"><span data-v="${name}">${topts[name]}</span></label>`;
  d.innerHTML = `<h3 style="margin-top:0">Auto trace</h3>
    <div class="btns">${radio('mode', { color: 'Colors', ink: 'Ink only' })}</div>
    ${slider('colors', 'Colors', 2, 16, 1)}
    <label class="row tr-skipBg"><input type="checkbox" name="skipBg"${topts.skipBg ? ' checked' : ''}> Leave out the background</label>
    ${slider('dark', 'Darker than', 10, 245, 1)}
    <h2>Detail</h2><div class="btns">${radio('detail', { 512: 'Low', 1024: 'Medium', 2048: 'High' })}</div>
    ${slider('smooth', 'Smooth', 0.3, 4, 0.1)}
    ${slider('speck', 'Ignore specks', 1, 400, 1)}
    <p class="tr-info tx-note"></p>
    <menu><button type="button" class="txt" data-x="cancel">Cancel</button><button type="button" class="on" data-x="keep">Trace</button></menu>`;
  const prev = paper.project.activeLayer;
  const layer = new paper.Layer({ name: 'Trace' }); // new layers go on top and become the active one
  prev.activate();
  let kept = false, timer = 0;
  const info = (t) => { d.querySelector('.tr-info').textContent = t; };
  const run = () => {
    layer.removeChildren();
    const items = traceSketch(topts);
    layer.addChildren(items);
    const pieces = items.reduce((a, it) => a + (it.children ? it.children.length : 1), 0);
    info(items.length ? `${items.length} color${items.length === 1 ? '' : 's'} · ${pieces} piece${pieces === 1 ? '' : 's'}` : 'Nothing to trace with these settings');
  };
  const later = () => { info('Tracing…'); clearTimeout(timer); timer = setTimeout(run, 150); };
  const sync = () => {
    d.querySelector('.tr-colors').hidden = d.querySelector('.tr-skipBg').hidden = topts.mode !== 'color';
    d.querySelector('.tr-dark').hidden = topts.mode !== 'ink';
  };
  d.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.x === 'cancel') return d.close();
    if (b.dataset.x === 'keep') {
      clearTimeout(timer);
      run();
      if (!layer.children.length) return toast('Nothing to trace with these settings');
      kept = true;
      d.close();
      layer.activate();
      commit();
      emit('layers');
      return toast('Traced onto the new layer "Trace"');
    }
    for (const k of ['mode', 'detail']) {
      if (!b.dataset[k]) continue;
      topts[k] = k === 'detail' ? +b.dataset[k] : b.dataset[k];
      d.querySelectorAll(`[data-${k}]`).forEach((x) => x.classList.toggle('on', x === b));
    }
    sync();
    later();
  };
  d.oninput = (e) => {
    const t = e.target; // every input in the panel has a name
    topts[t.name] = t.type === 'checkbox' ? t.checked : +t.value;
    const v = d.querySelector(`[data-v="${t.name}"]`);
    if (v) v.textContent = t.value;
    later();
  };
  d.onclose = () => {
    clearTimeout(timer);
    if (!kept) layer.remove();
    try { localStorage.setItem(KEY, JSON.stringify(topts)); } catch { /* fine */ }
    emit('layers');
  };
  sync();
  d.showModal();
  run();
}
