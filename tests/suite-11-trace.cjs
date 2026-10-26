// From pixels to shapes: the outline engine, the fill bucket and Auto trace.
const fs = require('fs');
const path = require('path');

// Loads a picture the page draws itself (fn gets a 2D context) as the sketch.
async function loadSketch(t, name, w, h, draw) {
  const b64 = await t.app((w, h, src) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    new Function('x', src)(c.getContext('2d'));
    return c.toDataURL('image/png').split(',')[1];
  }, w, h, draw);
  const file = path.join(t.OUT, name);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  t.nextDialog = true;
  const [chooser] = await Promise.all([t.page.waitForFileChooser(), t.act('sketch-load')]);
  await chooser.accept([file]);
  await t.page.waitForFunction((w) => __jamdraw.S.sketch && __jamdraw.S.sketch.w === w && document.getElementById('sketch').complete, {}, w);
  await t.wait(100);
}

module.exports = (test) => {
  test('trace: outlines of pixels', async (t) => {
    const { check, app } = t;
    const r = await app(async () => {
      const T = await import('/js/trace.js');
      const w = 12, h = 10, m = new Uint8Array(w * h);
      const set = (x0, y0, x1, y1, v = 1) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * w + x] = v; };
      set(0, 0, 8, 8); set(2, 2, 6, 6, 0); // a square with a square hole, against two edges
      set(9, 8, 10, 9); set(10, 9, 11, 10); // two pixels touching only at a corner
      const loops = T.outlines(m, w, h);
      const ring = T.traceMask(m, w, h, { smooth: 0.5, speck: 2 });
      const all = T.traceMask(m, w, h);
      const none = T.traceMask(new Uint8Array(4), 2, 2);
      // A teardrop: one sharp corner (its tip) and a round end.
      const D = 100, drop = new Uint8Array(D * D);
      for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) { const dx = x - 50, dy = y - 60; if (dx * dx + dy * dy < 900 || (y > 10 && y <= 60 && Math.abs(dx) < (y - 10) * 0.6)) drop[y * D + x] = 1; }
      const tear = T.traceMask(drop, D, D, { smooth: 1, speck: 1 });
      const tearArea = drop.reduce((a, v) => a + v, 0);
      const g = new Uint8Array(25); g[12] = 1;
      const grown = T.grow(g.slice(), 5, 5, 2).reduce((a, v) => a + v, 0);
      const fenced = T.grow(g.slice(), 5, 5, 2, Uint8Array.from({ length: 25 }, (_, i) => (i % 5 === 2 ? 1 : 0))).reduce((a, v) => a + v, 0);
      return { loops: loops.length, kids: ring.children.length, areas: ring.children.map((c) => Math.round(c.area)), all: all.className, none, grown, fenced,
        tear: Math.abs(tear.area / tearArea - 1), tip: Math.round(tear.bounds.top) };
    });
    check(r.tear < 0.02 && r.tip <= 12, 'a teardrop keeps its size and its sharp tip');
    check(r.loops === 4, 'outlines: the outside, the hole, and two pixels touching at a corner kept apart');
    check(r.kids === 2 && r.areas[0] > 50 && r.areas[1] < -10, 'a shape with a hole comes out with the hole cut out (specks left out)');
    check(r.all === 'CompoundPath' && r.none === null, 'the same with the default settings; nothing in, nothing out');
    check(r.grown === 21 && r.fenced === 5, 'growing goes round (an octagon) and only where it may');
  });

  test('trace: fill bucket', async (t) => {
    const { check, app, key, V, count, toastText, page } = t;
    await key('g');
    check(await app(() => __jamdraw.S.tool) === 'bucket', 'G picks the fill bucket');
    await t.click(await V(500, 500));
    check(await toastText() === 'That area isn\'t closed: look for a gap in its lines, or make Close gaps bigger', 'on an empty page there is nothing closed to fill');
    await t.drag(await V(-150, 500), await V(-140, 510), 2);
    check(await toastText() === 'Tap inside an area closed by lines' && await count() === 0, 'nor off the page (dragging fills nothing more)');
    await t.add({ kind: 'circle', x: 300, y: 300, r: 150, fill: null, stroke: '#1d1418', width: 10 });
    await t.click(await V(300, 300));
    const f = await app(() => { const l = __jamdraw.paper.project.activeLayer; const c = l.firstChild; return { n: l.children.length, fill: c.fillColor.toCSS(true), w: Math.round(c.bounds.width), stroke: !!c.strokeColor }; });
    check(f.n === 2 && f.fill === '#d22a5a' && !f.stroke && Math.abs(f.w - 293) < 6, 'tapping inside a ring fills it with the Fill color, under the ring, tucked under the line');
    await app(() => { __jamdraw.S.fill = null; });
    await t.click(await V(300, 300));
    check(await app(() => { const l = __jamdraw.paper.project.activeLayer; return l.children[1].fillColor.toCSS(true) === '#1d1418' && !!l.lastChild.strokeColor; }), 'filling a fill again goes just above it (dark when there is no Fill color)');
    await app(() => { __jamdraw.S.fill = '#0151b4'; });
    await t.click(await V(800, 800));
    check(await toastText() === 'That area isn\'t closed: look for a gap in its lines, or make Close gaps bigger', 'outside the ring the area is open');
    // A ring with a gap: closed only with a bigger Close gaps.
    const pts = [];
    for (let a = 0.1; a < Math.PI * 2 - 0.05; a += 0.05) pts.push([700 + Math.cos(a) * 120, 700 + Math.sin(a) * 120]);
    await t.add({ kind: 'line', pts, stroke: '#1d1418', width: 10 });
    const n = await count();
    await t.click(await V(700, 700));
    check(await count() === n, 'a gap lets the fill out');
    await page.$eval('#options input[type="range"]', (el) => { el.value = '12'; el.dispatchEvent(new Event('input')); });
    check(await app(() => __jamdraw.S.bucket.gap) === 12, 'the Close gaps slider');
    await t.click(await V(700, 700));
    check(await count() === n + 1 && await app(() => __jamdraw.paper.project.activeLayer.firstChild.fillColor.toCSS(true)) === '#0151b4', 'with Close gaps the gap is bridged');
    await t.click(await V(450, 300));
    check(await toastText() === 'Tap inside an area, a little away from the lines', 'tapping on a line says so');
    await app(() => { __jamdraw.paper.project.activeLayer.locked = true; });
    await t.click(await V(300, 300));
    check(await toastText() === 'This layer is locked' && await count() === n + 1, 'nothing is filled on a locked layer');
    await key('v');
    check(await app(() => __jamdraw.S.tool) === 'select', 'and on to another tool');
  });

  test('trace: auto trace', async (t) => {
    const { check, app, page, wait, toastText } = t;
    check(await app(() => document.getElementById('sketch-trace').disabled), 'Auto trace is off until there is a sketch');
    // Cream paper, a red and a blue square, a dark grey ring, and a green speck too small to keep.
    await loadSketch(t, 'trace.png', 200, 150, `
      x.fillStyle = '#fff4e0'; x.fillRect(0, 0, 200, 150);
      x.fillStyle = '#e01020'; x.fillRect(20, 20, 60, 60);
      x.fillStyle = '#1040c0'; x.fillRect(110, 20, 60, 60);
      x.strokeStyle = '#222222'; x.lineWidth = 6; x.beginPath(); x.arc(100, 115, 20, 0, Math.PI * 2); x.stroke();
      x.fillStyle = '#00c000'; x.fillRect(190, 140, 3, 3);`);
    const layer = () => app(() => { const l = __jamdraw.paper.project.layers.find((x) => x.name === 'Trace'); return l ? l.children.map((c) => c.fillColor.toCSS(true)) : null; });
    const info = () => app(() => document.querySelector('#tracedlg .tr-info').textContent);
    await t.act('sketch-trace');
    check(await app(() => document.getElementById('tracedlg').open && __jamdraw.paper.project.activeLayer.name === 'Layer 1'), 'Auto trace opens with a preview on a new layer, keeping the active one');
    const cols = await layer();
    check(cols.length === 3 && cols[2] === '#222222', 'one shape per color, the paper left out and the speck dropped, smallest on top');
    check(await info() === '3 colors · 4 pieces', 'it says how many colors and pieces');
    await t.key('b');
    check(await app(() => __jamdraw.S.tool) === 'select', 'shortcuts wait while it is open');
    await page.click('#tracedlg [name="skipBg"]');
    await wait(400);
    check((await layer()).length === 4, 'the paper can be kept too');
    await page.click('#tracedlg .tr-info');
    await page.click('#tracedlg [data-detail="512"]');
    await page.$eval('#tracedlg [name="smooth"]', (el) => { el.value = '3'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await wait(400);
    check((await layer()).length === 4 && await app(() => document.querySelector('#tracedlg [data-v="smooth"]').textContent) === '3', 'detail and smoothing');
    await page.click('#tracedlg [data-mode="ink"]');
    await wait(400);
    check((await layer()).length === 1 && await app(() => document.querySelector('#tracedlg .tr-colors').hidden), 'Ink only: one shape of everything dark');
    await page.$eval('#tracedlg [name="dark"]', (el) => { el.value = '20'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await wait(400);
    check(await info() === 'Nothing to trace with these settings', 'too dark a setting finds nothing');
    await page.click('#tracedlg [data-x="keep"]');
    check(await toastText() === 'Nothing to trace with these settings' && await app(() => document.getElementById('tracedlg').open), 'and there is nothing to keep');
    await t.key('Escape');
    await wait(100); // a dialog's close event comes a moment after it closes
    check(await layer() === null && await app(() => !document.getElementById('tracedlg').open && __jamdraw.paper.project.activeLayer.name === 'Layer 1'), 'Esc takes the preview away');
    await t.act('sketch-trace');
    await page.click('#tracedlg [data-mode="color"]');
    await wait(400);
    await page.click('#tracedlg [data-x="keep"]');
    check((await layer()).length === 4 && await app(() => __jamdraw.paper.project.activeLayer.name === 'Trace') && await toastText() === 'Traced onto the new layer "Trace"', 'Trace keeps it, settings remembered, on the new layer');
    await t.combo('Control', 'z');
    check(await layer() === null, 'and undo takes it back');
    // A cut-out picture (see-through edges) has no background to leave out.
    await loadSketch(t, 'cutout.png', 100, 100, `x.fillStyle = '#e01020'; x.fillRect(20, 20, 60, 60);`);
    await t.act('sketch-trace');
    check(await info() === '1 color · 1 piece', 'a cut-out traces as it is');
    await page.click('#tracedlg [data-x="cancel"]');
  });
};
