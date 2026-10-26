// How the brush feels: Steady, the magnet, pressure feel, thinnest line and taper, and the More… panel.

// Draws a stroke straight onto the canvas, through drawing points [x, y, pressure?]: { type, ctrl, noUp, upOnly,
// moveOnly (carry on a stroke begun with noUp) }.
const stroke = (t, pts, o = {}) => t.app((pts, o) => {
  const { paper } = __jamdraw;
  const el = document.getElementById('overlay'), r = el.getBoundingClientRect();
  const fire = (type, [x, y, p = 0.5], buttons) => {
    const v = paper.view.projectToView(new paper.Point(x, y));
    el.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: o.type || 'pen', isPrimary: true, bubbles: true, button: 0,
      clientX: r.left + v.x, clientY: r.top + v.y, pressure: p, buttons, ctrlKey: !!o.ctrl }));
  };
  if (!o.upOnly && !o.moveOnly) fire('pointerdown', pts[0], 1);
  if (!o.upOnly) for (const p of (o.moveOnly ? pts : pts.slice(1))) fire('pointermove', p, 1);
  if (!o.noUp && !o.moveOnly) fire('pointerup', pts[pts.length - 1], 0);
}, pts, o);

// A wobbly line along y, from x0 to x1: up and down by `amp` every point.
const wobbly = (y, x0, x1, amp, p) => Array.from({ length: Math.round((x1 - x0) / 4) + 1 }, (_, i) => [x0 + i * 4, y + (i % 2 ? amp : -amp), p]);
// The last shape's height, and how far its middle line wanders from its average y (Line mode).
const last = (t) => t.app(() => {
  const c = __jamdraw.paper.project.activeLayer.lastChild;
  const ys = [];
  for (let s = 0; s <= c.length; s += 2) ys.push(c.getPointAt(Math.min(s, c.length)).y);
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
  return { h: c.bounds.height, area: Math.abs(c.area || 0), mean, sd: Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length), end: c.lastSegment && c.lastSegment.point.x };
});

module.exports = (test) => {
  test('brush: steady', async (t) => {
    const { check, app, key, page } = t;
    await key('b');
    await page.click('#options [data-v="line"]');
    await app(() => { __jamdraw.S.brush.size = 3; __jamdraw.S.brush.smooth = 0.5; });
    await stroke(t, wobbly(300, 100, 700, 4));
    const plain = await last(t);
    await page.$$eval('#options input[type="range"]', (els) => { els[1].value = '8'; els[1].dispatchEvent(new Event('input')); });
    check(await app(() => __jamdraw.S.brush.steady) === 8, 'the Steady slider');
    await stroke(t, wobbly(400, 100, 700, 4), { noUp: true });
    await t.wait(50); // the string shows while drawing
    await stroke(t, [[700, 404]], { upOnly: true });
    const steady = await last(t);
    check(steady.sd < plain.sd / 2, `Steady smooths out wobbles (${plain.sd.toFixed(2)} → ${steady.sd.toFixed(2)})`);
    check(Math.abs(steady.end - 700) < 2, 'and the line catches up to where the pen lifted');
  });

  test('brush: pressure feel, thinnest, taper', async (t) => {
    const { check, app, key, page } = t;
    await key('b');
    await app(() => { __jamdraw.S.brush.size = 40; __jamdraw.S.brush.merge = false; });
    const straight = (y, p) => Array.from({ length: 41 }, (_, i) => [100 + i * 15, y, p]);
    const heightAt = async (y) => { await stroke(t, straight(y, 0.5)); return (await last(t)).h; };
    const normal = await heightAt(100);
    await t.button('#options', 'More…');
    check(await app(() => !document.getElementById('more').hidden), 'More… opens the brush settings');
    // (Drawing counts as a tap outside the panel and closes it, so it's opened again for each setting.)
    const more = () => t.button('#options', 'More…');
    await page.click('#more [data-v="soft"]');
    const soft = await heightAt(200);
    await more();
    await page.click('#more [data-v="firm"]');
    const firm = await heightAt(300);
    check(soft > normal + 4 && normal > firm + 4, `Soft needs less pressure for a full line, Firm more (${soft.toFixed(0)}, ${normal.toFixed(0)}, ${firm.toFixed(0)})`);
    await more();
    await page.$$eval('#more input[type="range"]', (els) => { els[1].value = '100'; els[1].dispatchEvent(new Event('input')); });
    const full = await heightAt(400);
    await more();
    await page.$$eval('#more input[type="range"]', (els) => { els[1].value = '10'; els[1].dispatchEvent(new Event('input')); });
    // Mouse strokes have no pressure: even, unless Taper is on.
    await stroke(t, straight(500, 1), { type: 'mouse' });
    const even = await last(t);
    check(Math.abs(full - even.h) < 1.5, 'Thinnest 100%: half pressure draws as wide as a line without pressure');
    await more();
    await t.button('#more', 'Taper ends without pressure');
    await stroke(t, straight(600, 1), { type: 'mouse' });
    const tapered = await last(t);
    check(tapered.area < even.area * 0.9 && Math.abs(tapered.h - 40) < 3, 'Taper thins the ends of strokes without pressure, full width in the middle');
    await page.mouse.click(...t.P(0.05, 0.9));
    check(await app(() => document.getElementById('more').hidden), 'a tap outside closes the panel');
    await t.button('#options', 'More…');
    await page.click('#more input[type="range"]');
    check(await app(() => !document.getElementById('more').hidden), 'but not a tap inside it');
    await app(() => document.activeElement.blur()); // a focused slider keeps the keys for itself
    await key('v');
    check(await app(() => document.getElementById('more').hidden), 'switching tools closes it');
  });

  test('brush: magnet', async (t) => {
    const { check, app, key, page, toastText } = t;
    await key('b');
    await page.click('#options [data-v="line"]');
    await app(() => { __jamdraw.S.brush.size = 3; __jamdraw.S.brush.smooth = 0.5; });
    await page.evaluate(() => [...document.querySelectorAll('#options [aria-pressed]')][2].click());
    check(await app(() => __jamdraw.S.brush.magnet) && await toastText() === 'Load a sketch (Layers › Sketch to trace) for the magnet to follow', 'Magnet without a sketch says what it needs');
    await stroke(t, wobbly(500, 100, 700, 3));
    check(Math.abs((await last(t)).mean - 500) < 1, '(and draws as usual)');
    // A sketch with one black line along y = 500, and a solid black block from y = 900 down.
    await app(async () => {
      const c = document.createElement('canvas'); c.width = c.height = 1024;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1024, 1024); x.fillStyle = '#111'; x.fillRect(0, 497, 1024, 6);
      x.fillRect(0, 900, 1024, 124);
      __jamdraw.S.sketch = { src: c.toDataURL(), x: 0, y: 0, scale: 1, w: 1024, h: 1024, opacity: 0.4, visible: true };
      (await import('/js/view.js')).changed();
      await document.getElementById('sketch').decode();
    });
    await stroke(t, wobbly(508, 100, 700, 3));
    const pulled = await last(t);
    check(Math.abs(pulled.mean - 500) < 4 && pulled.sd < 1.5, `the magnet pulls the line onto the sketch's line (${pulled.mean.toFixed(1)})`);
    await t.button('#options', 'More…');
    await page.$$eval('#more input[type="range"]', (els) => { els[2].value = '100'; els[2].dispatchEvent(new Event('input')); });
    check(await app(() => __jamdraw.S.brush.pull) === 1, 'the Magnet pull slider (under More…)');
    await stroke(t, wobbly(506, 100, 700, 3));
    check(Math.abs((await last(t)).mean - 500) < 1, 'at full pull right onto it');
    await stroke(t, wobbly(506, 100, 700, 3), { ctrl: true });
    check(Math.abs((await last(t)).mean - 506) < 1, 'Ctrl draws freely');
    await stroke(t, wobbly(800, 100, 700, 3));
    check(Math.abs((await last(t)).mean - 800) < 1, 'away from any line nothing pulls');
    await stroke(t, wobbly(908, 100, 700, 3));
    const edge = (await last(t)).mean;
    check(edge > 896 && edge < 908, `next to a solid black patch the line sticks to its edge, not its middle (${edge.toFixed(1)})`);
  });

  test('brush: shape assist', async (t) => {
    const { check, app, key, page, wait } = t;
    // The recognizer on its own: a line, a circle, an ellipse, an arc, and a scribble that's none of them.
    const r = await app(async () => {
      const { recognize } = await import('/js/tools.js');
      let seed = 5;
      const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
      const ring = (rx, ry, from, to) => { const p = []; for (let a = from; a <= to; a += 0.05) p.push({ x: 500 + Math.cos(a) * (rx + rnd() * 6), y: 500 + Math.sin(a) * (ry + rnd() * 6), p: 0.5 }); return p; };
      const kind = (res) => (!res ? 'none' : res.ellipse ? (Math.abs(res.ellipse.radius[0] - res.ellipse.radius[1]) < 0.01 ? 'circle' : 'ellipse') : res.closed ? 'closed' : 'open');
      return {
        line: kind(recognize(Array.from({ length: 50 }, (_, i) => ({ x: 100 + i * 8, y: 100 + i * 2 + rnd() * 6, p: 0.5 })), 6)),
        circle: kind(recognize(ring(200, 190, 0, Math.PI * 2 + 0.05), 6)),
        ellipse: kind(recognize(ring(250, 120, 0, Math.PI * 2 + 0.05), 6)),
        arc: kind(recognize(ring(200, 200, 0, 2), 6)),
        scribble: kind(recognize(Array.from({ length: 60 }, (_, i) => ({ x: 100 + i * 5, y: 100 + (i % 7) * 30, p: 0.5 })), 6)),
        loopy: kind(recognize(Array.from({ length: 80 }, (_, i) => { const a = (i / 79) * Math.PI * 2; return { x: 500 + Math.cos(a) * 200 + Math.cos(a * 5) * 60, y: 500 + Math.sin(a) * 200, p: 0.5 }; }), 6)),
        flatArc: kind(recognize(ring(500, 500, 0, 0.4), 6)), // bends, but too little to call an arc
        tiny: kind(recognize([{ x: 0, y: 0, p: 1 }, { x: 1, y: 1, p: 1 }], 6)),
      };
    });
    check(r.line === 'open' && r.circle === 'circle' && r.ellipse === 'ellipse' && r.arc === 'open', 'it knows a rough line, circle, ellipse and arc ' + JSON.stringify(r));
    check(r.scribble === 'none' && r.loopy === 'none' && r.flatArc === 'none' && r.tiny === 'none', 'and leaves anything else alone');
    // Drawing: hold still at the end and the stroke comes out clean.
    await key('b');
    await app(() => { __jamdraw.S.brush.merge = false; __jamdraw.S.brush.size = 10; });
    const wobblyCircle = (cx, cy, rad) => Array.from({ length: 130 }, (_, i) => { const a = (i / 125) * Math.PI * 2; return [cx + Math.cos(a) * (rad + (i % 2 ? 4 : -4)), cy + Math.sin(a) * (rad + (i % 2 ? 4 : -4)), 0.5]; });
    await stroke(t, wobblyCircle(300, 300, 150), { noUp: true });
    await wait(700);
    await stroke(t, [[300, 300]], { upOnly: true });
    check(await app(() => { const c = __jamdraw.paper.project.activeLayer.lastChild; return c.children && c.children.every((k) => k.segments.length === 4); }), 'holding still turns a rough circle into a clean ring');
    await stroke(t, wobblyCircle(700, 300, 120), { noUp: true });
    await wait(700);
    await stroke(t, [[820, 300], [840, 400], [860, 500]], { moveOnly: true });
    check(await app(() => __jamdraw.paper.project.activeLayer.children.length) === 1, '(still drawing)');
    await stroke(t, [[860, 500]], { upOnly: true });
    check(await app(() => { const c = __jamdraw.paper.project.activeLayer.lastChild; return !(c.children && c.children.every((k) => k.segments.length === 4)); }), 'moving on after the hold carries on freehand');
    await page.click('#options [data-v="line"]');
    await stroke(t, wobblyCircle(500, 750, 150), { noUp: true });
    await wait(700);
    await stroke(t, [[500, 750]], { upOnly: true });
    check(await app(() => { const c = __jamdraw.paper.project.activeLayer.lastChild; return c.closed && c.segments.length === 4 && !!c.strokeColor; }), 'in Line mode it becomes an exact ellipse');
    await t.button('#options', 'More…');
    await t.button('#more', 'Shape assist: hold still to straighten');
    check(await app(() => __jamdraw.S.brush.assist) === false, 'Shape assist can be turned off');
    await stroke(t, wobblyCircle(500, 750, 100), { noUp: true });
    await wait(700);
    await stroke(t, [[500, 750]], { upOnly: true });
    check(await app(() => __jamdraw.paper.project.activeLayer.lastChild.segments.length) > 4, 'and then a held stroke stays as drawn');
  });

  test('brush: the canvas stays put between tools', async (t) => {
    const { check, app, key } = t;
    const tops = [];
    for (const k of ['v', 'a', 'p', 'b', 'e', 'r', 'g', 't', 'i', 'h']) {
      await key(k);
      tops.push(await app(() => document.getElementById('stage').getBoundingClientRect().top));
    }
    check(tops.every((v) => v === tops[0]), 'every tool\'s options fit without a scrollbar, so the canvas doesn\'t jump');
  });
};
