// The canvas view: zoom, pan, fit, the page (artboard) and sketch layers under the drawing, and the overlay canvas
// where selection boxes, handles and previews are drawn in screen space.
import { S, clamp, emit, normAngle } from './state.js';

export const stage = document.getElementById('stage');
const paperCanvas = document.getElementById('paper');
export const overlay = document.getElementById('overlay');
const artboard = document.getElementById('artboard');
const sketchImg = document.getElementById('sketch');
const octx = overlay.getContext('2d');
let drawOverlayFn; // set by initView

export function initView(drawFn) {
  drawOverlayFn = drawFn;
  paper.setup(paperCanvas);
  // Tracing paper layers (data.paper) draw a little soft, like lines seen through paper (the fading is their opacity).
  const draw = paper.Layer.prototype.draw;
  paper.Layer.prototype.draw = function (ctx, ...rest) {
    if (!this.data.paper) return draw.call(this, ctx, ...rest);
    ctx.save();
    ctx.filter = `blur(${1.2 * (window.devicePixelRatio || 1)}px)`;
    draw.call(this, ctx, ...rest);
    ctx.restore();
  };
  new ResizeObserver(resize).observe(stage);
  resize();
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  const first = paper.view.viewSize.width < 2;
  paper.view.viewSize = new paper.Size(w, h);
  const dpr = window.devicePixelRatio || 1;
  overlay.width = Math.round(w * dpr);
  overlay.height = Math.round(h * dpr);
  if (first) fit(); else changed();
}

export const px = (n) => n / paper.view.zoom; // screen pixels -> drawing units

export function toProject(clientX, clientY) {
  const r = stage.getBoundingClientRect();
  return paper.view.viewToProject(new paper.Point(clientX - r.left, clientY - r.top));
}
export function toView(pt) { return paper.view.projectToView(pt); }

export function zoomAt(viewPt, factor) {
  const v = paper.view;
  const before = v.viewToProject(viewPt);
  v.zoom = clamp(v.zoom * factor, 0.03, 64);
  const after = v.viewToProject(viewPt);
  v.center = v.center.add(before.subtract(after));
  changed();
}
export function zoomCenter(factor) { zoomAt(new paper.Point(stage.clientWidth / 2, stage.clientHeight / 2), factor); }
export function panBy(dx, dy) {
  // A drag on screen moves the drawing along with it, whichever way the view is turned.
  const v = paper.view;
  v.center = v.center.subtract(v.viewToProject(new paper.Point(dx, dy)).subtract(v.viewToProject(new paper.Point(0, 0))));
  changed();
}
// Turns the view (not the drawing) by `deg` degrees round a screen point (the middle when left out), the way you turn
// paper to draw a curve comfortably.
export function rotateView(deg, viewPt = new paper.Point(stage.clientWidth / 2, stage.clientHeight / 2)) {
  const v = paper.view;
  v.rotate(deg, v.viewToProject(viewPt));
  changed();
}
export const viewAngle = () => normAngle(Math.round(paper.view.rotation * 10) / 10);
export function fit() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  paper.view.rotation = 0;
  paper.view.zoom = Math.min(w / S.doc.w, h / S.doc.h) * 0.88;
  paper.view.center = new paper.Point(S.doc.w / 2, S.doc.h / 2);
  changed();
}

// Keep the HTML layers (page, sketch) lined up with the drawing and redraw the overlay.
export function changed() {
  const m = paper.view.matrix;
  const css = (mm) => `matrix(${mm.a},${mm.b},${mm.c},${mm.d},${mm.tx},${mm.ty})`;
  artboard.style.width = S.doc.w + 'px';
  artboard.style.height = S.doc.h + 'px';
  artboard.style.transform = css(m);
  artboard.classList.toggle('transparent', S.doc.transparent);
  const sk = S.sketch;
  if (sk && sk.src) {
    if (sketchImg.getAttribute('src') !== sk.src) sketchImg.src = sk.src;
    sketchImg.style.display = sk.visible ? 'block' : 'none';
    sketchImg.style.opacity = sk.opacity;
    sketchImg.style.transform = css(m.clone().append(sketchMatrix(sk)));
  } else {
    sketchImg.style.display = 'none';
    sketchImg.removeAttribute('src');
  }
  emit('zoom', paper.view.zoom);
  redrawOverlay();
}

// The sketch's image pixels to drawing units: placed, sized, then turned and flipped about its middle.
export function sketchMatrix(sk) {
  const mid = new paper.Point(sk.w / 2, sk.h / 2);
  return new paper.Matrix().translate(sk.x, sk.y).scale(sk.scale).rotate(sk.angle || 0, mid).scale(sk.flip ? -1 : 1, 1, mid);
}
// The sketch's color under a drawing point, or null off the image, where it's see-through or while it's hidden.
export function sketchColorAt(pt) {
  const sk = S.sketch;
  if (!sk || !sk.visible) return null;
  const p = sketchMatrix(sk).inverseTransform(pt);
  const x = Math.floor(p.x), y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= sk.w || y >= sk.h) return null;
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d');
  ctx.drawImage(sketchImg, x, y, 1, 1, 0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return a < 128 ? null : '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

let pending = false;
export function redrawOverlay() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    const dpr = window.devicePixelRatio || 1;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawOverlayFn(octx);
  });
}

// Drawing helpers for the overlay (screen space).
export const UI_COLOR = '#2f8cff';
export function strokeItemOutline(ctx, item, color = UI_COLOR) {
  const m = paper.view.matrix;
  const dpr = window.devicePixelRatio || 1;
  const paths = [];
  const walk = (it) => {
    if (it instanceof paper.Path) paths.push(it);
    else if (it.children) it.children.forEach(walk);
  };
  walk(item);
  ctx.save();
  ctx.setTransform(m.a * dpr, m.b * dpr, m.c * dpr, m.d * dpr, m.tx * dpr, m.ty * dpr);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1 / paper.view.zoom;
  for (const p of paths) {
    // Paths inside groups carry their own matrix only when applyMatrix is off; pathData is in the item's space.
    const g = p.globalMatrix;
    ctx.save();
    ctx.transform(g.a, g.b, g.c, g.d, g.tx, g.ty);
    ctx.lineWidth = 1 / (paper.view.zoom * Math.sqrt(Math.abs(g.a * g.d - g.b * g.c)) || 1);
    ctx.stroke(new Path2D(p.pathData));
    ctx.restore();
  }
  ctx.restore();
}
// A rectangle in drawing units, outlined on the overlay (a turned view shows it turned).
export function rectPath(ctx, r) {
  const pts = [r.topLeft, r.topRight, r.bottomRight, r.bottomLeft].map(toView);
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}
export function handleBox(ctx, p, size = 8, fill = '#fff', stroke = UI_COLOR) {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
  ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size);
}
export function handleDot(ctx, p, r = 4, fill = '#fff', stroke = UI_COLOR) {
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
