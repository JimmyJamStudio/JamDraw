// How the brush feels: Steady, the magnet, pressure feel, thinnest line and taper, and the More… panel.

// Draws a stroke straight onto the canvas, through drawing points [x, y, pressure?]: { type, ctrl, noUp }.
const stroke = (t, pts, o = {}) => t.app((pts, o) => {
  const { paper } = __jamdraw;
  const el = document.getElementById('overlay'), r = el.getBoundingClientRect();
  const fire = (type, [x, y, p = 0.5], buttons) => {
    const v = paper.view.projectToView(new paper.Point(x, y));
    el.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: o.type || 'pen', isPrimary: true, bubbles: true, button: 0,
      clientX: r.left + v.x, clientY: r.top + v.y, pressure: p, buttons, ctrlKey: !!o.ctrl }));
  };
  if (!o.upOnly) {
    fire('pointerdown', pts[0], 1);
    for (const p of pts.slice(1)) fire('pointermove', p, 1);
  }
  if (!o.noUp) fire('pointerup', pts[pts.length - 1], 0);
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
    // A sketch with one black line along y = 500.
    await app(async () => {
      const c = document.createElement('canvas'); c.width = c.height = 1024;
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1024, 1024); x.fillStyle = '#111'; x.fillRect(0, 497, 1024, 6);
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
