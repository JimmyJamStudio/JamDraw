// The drawing tools in depth: points, pen, brush, eraser, shapes, eyedropper, and drawing on locked or hidden layers.
module.exports = (test) => {
  test('tools: points (node editing)', async (t) => {
    const { check, app, key, V, add, page, combo, button } = t;
    await add({ kind: 'line', pts: [[100, 300], [300, 300], [500, 300]], stroke: '#000', width: 4 }, { x: 600, y: 600, w: 200, h: 200 });
    await key('a');
    await t.click(await V(200, 300));
    check(await app(() => __jamdraw.S.node.path === __jamdraw.paper.project.activeLayer.firstChild), 'clicking a line picks it for point editing');
    await t.drag(await V(200, 300), await V(220, 330), 5);
    check(await app(() => Math.round(__jamdraw.paper.project.activeLayer.firstChild.firstSegment.point.y)) === 330, 'dragging the line itself moves it');
    await t.click(await V(420, 330), ['Alt']);
    check(await app(() => __jamdraw.paper.project.activeLayer.firstChild.segments.length) === 4, 'Alt-click on the line adds a point');
    // Smooth / corner on the selected point.
    await button('#options', 'Smooth');
    check(await app(() => { const s = [...__jamdraw.S.node.segs][0]; return !s.handleIn.isZero(); }), 'Smooth gives the point curve handles');
    // Drag a handle: the other side follows (smooth), then Alt breaks it.
    const hs = await app(() => { const s = [...__jamdraw.S.node.segs][0]; const h = s.point.add(s.handleOut); return [h.x, h.y]; });
    const hv = await V(...hs);
    await t.drag(hv, [hv[0] + 10, hv[1] - 30], 5);
    const segInfo = await app(() => [...__jamdraw.S.node.segs].map((s) => ({ i: s.index, p: [Math.round(s.point.x), Math.round(s.point.y)], hi: [Math.round(s.handleIn.x), Math.round(s.handleIn.y)], ho: [Math.round(s.handleOut.x), Math.round(s.handleOut.y)] })));
    const smooth = await app(() => { const s = [...__jamdraw.S.node.segs][0]; return Math.abs(s.handleIn.normalize().dot(s.handleOut.normalize()) + 1) < 0.02; });
    check(smooth, 'dragging a handle keeps a smooth point smooth ' + JSON.stringify({ hs, segInfo }));
    const hs2 = await app(() => { const s = [...__jamdraw.S.node.segs][0]; const h = s.point.add(s.handleOut); return [h.x, h.y]; });
    const hv2 = await V(...hs2);
    await t.drag(hv2, [hv2[0] + 40, hv2[1] + 40], 5, ['Alt']);
    check(await app(() => { const s = [...__jamdraw.S.node.segs][0]; return Math.abs(s.handleIn.normalize().dot(s.handleOut.normalize()) + 1) > 0.05; }), 'Alt-drag breaks the handles apart');
    // Hover cursor over a point.
    const p0 = await app(() => { const p = __jamdraw.paper.project.activeLayer.firstChild.firstSegment.point; return [p.x, p.y]; });
    await page.mouse.move(...(await V(...p0)));
    check(await app(() => document.getElementById('overlay').style.cursor) === 'pointer', 'hovering a point shows a pointer');
    await page.mouse.move(...(await V(900, 100)));
    check(await app(() => document.getElementById('overlay').style.cursor) === 'default', 'elsewhere the normal cursor');
    // Shift-click adds, Shift-click again removes.
    await t.click(await V(...p0));
    const p3 = await app(() => { const p = __jamdraw.paper.project.activeLayer.firstChild.lastSegment.point; return [p.x, p.y]; });
    await t.click(await V(...p3), ['Shift']);
    check(await app(() => __jamdraw.S.node.segs.size) === 2, 'Shift-click selects a second point');
    await t.click(await V(...p3), ['Shift']);
    check(await app(() => __jamdraw.S.node.segs.size) === 1, 'Shift-click again lets it go');
    await t.click(await V(...p0));
    check(await app(() => __jamdraw.S.node.segs.size) === 1, 'clicking a selected point keeps it selected');
    // Double-click toggles smooth and corner (on a middle point: the ends of an open line have one side only).
    const mid = await app(() => { const s = __jamdraw.paper.project.activeLayer.firstChild.segments[1]; s.handleIn = null; s.handleOut = null; return [s.point.x, s.point.y]; });
    await t.wait(450);
    await t.click(await V(...mid)); await t.click(await V(...mid));
    check(await app(() => !__jamdraw.paper.project.activeLayer.firstChild.segments[1].handleOut.isZero()), 'double-clicking a corner point smooths it');
    await t.wait(450);
    await t.click(await V(...mid)); await t.click(await V(...mid));
    check(await app(() => __jamdraw.paper.project.activeLayer.firstChild.segments[1].handleOut.isZero()), 'and again makes it a corner');
    await button('#options', 'Corner');
    // Marquee points: drag on empty space around two points.
    await t.drag(await V(50, 250), await V(250, 400), 6);
    check(await app(() => __jamdraw.S.node.segs.size) >= 1, 'a marquee selects the points inside');
    await t.drag(await V(950, 50), await V(1000, 100), 4, ['Shift']);
    check(await app(() => __jamdraw.S.node.segs.size) >= 1, 'a Shift-marquee keeps the points it had');
    // Delete point button and key; down to one point removes the line.
    await button('#options', 'Delete point');
    const left = await app(() => __jamdraw.paper.project.activeLayer.firstChild.segments.length);
    check(left < 4, 'Delete point removes the selected points');
    await app(() => { const p = __jamdraw.paper.project.activeLayer.firstChild; __jamdraw.S.node.segs.clear(); p.segments.slice(1).forEach((s) => __jamdraw.S.node.segs.add(s)); });
    await button('#options', 'Delete point');
    check(await app(() => __jamdraw.S.node.path === null && __jamdraw.paper.project.activeLayer.children.length === 1), 'a line with one point left goes away');
    await button('#options', 'Delete point');
    // Clicking empty space lets go of the path.
    await t.click(await V(700, 700));
    await t.click(await V(950, 950));
    check(await app(() => __jamdraw.S.node.path) === null, 'clicking empty page lets go of the path');
    // Delete key with nothing picked falls through to deleting the selection (nothing).
    await key('Delete');
    // A compound shape: click inside a filled piece picks that piece.
    await app(() => {
      const l = __jamdraw.paper.project.activeLayer;
      const c = new paper.CompoundPath({ children: [new paper.Path.Rectangle([100, 600, 100, 100]), new paper.Path.Rectangle([300, 600, 100, 100])], fillColor: '#123' });
      l.addChild(c);
    });
    await t.click(await V(350, 650));
    const picked = await app(() => { const p = __jamdraw.S.node.path; return p ? { parent: p.parent && p.parent.className, i: p.index, x: Math.round(p.bounds.x) } : null; });
    check(picked && picked.parent === 'CompoundPath' && picked.x === 300, 'clicking inside a compound shape picks the piece you clicked ' + JSON.stringify(picked));
    // Switching to node with one path selected picks it.
    await key('v');
    await t.click(await V(700, 700));
    await key('a');
    check(await app(() => __jamdraw.S.node.path === __jamdraw.paper.project.activeLayer.children[0]), 'switching to Points with one shape selected picks it');
    await combo('Control', 'z');
  });

  test('tools: pen', async (t) => {
    const { check, app, key, V, page } = t;
    await key('p');
    await t.click(await V(100, 100));
    await page.mouse.move(...(await V(300, 150)));
    await t.click(await V(300, 150), ['Shift']);
    check(await app(() => { const s = __jamdraw.paper.project.activeLayer.lastChild.segments; const v = s[1].point.subtract(s[0].point); return Math.abs(v.angle % 45) < 0.01; }), 'Shift keeps the line at 45° steps');
    await t.drag(await V(500, 300), await V(560, 380), 5, ['Alt']);
    check(await app(() => { const s = __jamdraw.paper.project.activeLayer.lastChild.lastSegment; return s.handleIn.isZero() && !s.handleOut.isZero(); }), 'Alt-drag makes a one-sided curve');
    await key('Backspace');
    check(await app(() => __jamdraw.paper.project.activeLayer.lastChild.segments.length) === 2, 'Backspace takes back the last point');
    // Close with a drag on the first point.
    const f = await V(100, 100);
    await t.drag(f, [f[0] + 30, f[1] - 30], 4);
    check(await app(() => { const p = __jamdraw.paper.project.activeLayer.lastChild; return p.closed && !p.firstSegment.handleIn.isZero(); }), 'dragging on the first point closes the shape with a curve');
    await t.click(await V(700, 100));
    await t.drag(await V(800, 100), await V(850, 150), 4);
    await t.drag(await V(700, 100), await V(720, 80), 4, ['Alt']);
    check(await app(() => { const p = __jamdraw.paper.project.activeLayer.lastChild; return p.closed && p.firstSegment.handleOut.isZero(); }), 'Alt while closing curves only the incoming side');
    // Enter finishes; Escape with one point throws it away.
    await t.click(await V(100, 700));
    await t.click(await V(300, 700));
    await key('Enter');
    check(await app(() => __jamdraw.S.sel.length === 1 && !__jamdraw.paper.project.activeLayer.lastChild.closed), 'Enter finishes an open path and selects it');
    const n = await t.count();
    await t.click(await V(500, 700));
    await key('Escape');
    check(await t.count() === n, 'a one-point path is dropped');
    await t.click(await V(500, 800));
    await key('Delete');
    check(await t.count() === n, 'deleting its only point removes it');
    await key('Delete');
    await t.click(await V(600, 800));
    await t.button('#options', 'Done');
    await key('Enter');
    // With no fill and no stroke the pen still draws something visible.
    await app(() => { __jamdraw.S.fill = null; __jamdraw.S.stroke = null; });
    await t.click(await V(100, 900));
    await t.click(await V(300, 900));
    await key('v');
    check(await app(() => !!__jamdraw.paper.project.activeLayer.lastChild.strokeColor), 'with no colors set, the pen uses a dark outline');
    check(await app(() => __jamdraw.TOOLS.pen.path === null), 'switching tools finishes the path');
    await key('p');
    await t.click(await V(600, 900));
    await t.pointer('mouse', [await V(800, 900), await V(820, 920)], { cancel: true });
    check(await app(() => __jamdraw.TOOLS.pen.path === null && !__jamdraw.paper.project.activeLayer.lastChild.closed), 'if the browser cancels the pointer, the path so far is kept');
  });

  test('tools: brush', async (t) => {
    const { check, app, key, V, page, count } = t;
    await key('b');
    await t.click(await V(200, 200));
    check(await app(() => { const c = __jamdraw.paper.project.activeLayer.lastChild; return c && c.segments.length === 4; }), 'a tap with the brush leaves a dot');
    // Merge: a stroke inside a same-colored blob joins it; touching strokes join.
    await t.add({ kind: 'circle', x: 500, y: 500, r: 120, fill: '#d22a5a' });
    const n = await count();
    await t.drag(await V(480, 500), await V(520, 510), 6);
    check(await count() === n, 'a stroke inside a same-colored shape merges into it');
    await page.mouse.move(...(await V(700, 300)));
    check(await app(() => true), 'hovering shows the brush size ring');
    await page.click('#options [aria-pressed]');
    check(await app(() => __jamdraw.S.brush.pressure) === false, 'the Pressure toggle turns pressure off');
    const pts = [];
    for (let i = 0; i <= 12; i++) pts.push([...(await V(100 + i * 20, 800)), i / 12]);
    await t.pointer('pen', pts);
    check(await app(() => Math.round(__jamdraw.paper.project.activeLayer.lastChild.bounds.height)) >= 17, 'with pressure off a pen draws an even line');
    await page.evaluate(() => [...document.querySelectorAll('#options [aria-pressed]')][1].click());
    check(await app(() => __jamdraw.S.brush.merge) === false, 'the Merge toggle');
    const m = await count();
    await t.drag(await V(480, 500), await V(520, 510), 6);
    check(await count() === m + 1, 'without Merge a stroke stays separate');
    // Size and smoothing boxes.
    await page.$eval('#options input[type="number"]', (el) => { el.value = '40'; el.dispatchEvent(new Event('change')); });
    await page.$eval('#options input[type="range"]', (el) => { el.value = '30'; el.dispatchEvent(new Event('input')); });
    check(await app(() => __jamdraw.S.brush.size) === 30, 'the size slider and box set the brush size');
    await page.$$eval('#options input[type="range"]', (els) => { els[1].value = '4'; els[1].dispatchEvent(new Event('input')); });
    check(await app(() => __jamdraw.S.brush.smooth) === 4, 'the smoothing slider');
    // Line mode: a tap still makes a line.
    await page.click('#options [data-v="line"]');
    await t.click(await V(900, 900));
    check(await app(() => { const c = __jamdraw.paper.project.activeLayer.lastChild; return !c.closed && c.segments.length >= 1 && !!c.strokeColor; }), 'a tap in Line mode makes a tiny line');
    await page.evaluate(() => document.querySelector('#options .btns').click());
    check(await app(() => __jamdraw.S.brush.mode) === 'line', 'clicking between the mode buttons changes nothing');
    // Brush colors fall back: no fill uses the stroke; no colors uses dark.
    await page.click('#options [data-v="ink"]');
    await app(() => { __jamdraw.S.fill = null; __jamdraw.S.stroke = '#00ff00'; });
    await t.drag(await V(100, 100), await V(200, 120), 4);
    check(await app(() => __jamdraw.paper.project.activeLayer.lastChild.fillColor.toCSS(true)) === '#00ff00', 'with no fill the brush inks in the stroke color');
    await app(() => { __jamdraw.S.stroke = null; });
    await t.drag(await V(100, 150), await V(200, 170), 4);
    check(await app(() => __jamdraw.paper.project.activeLayer.lastChild.fillColor.toCSS(true)) === '#1d1418', 'with no colors it inks dark');
    await page.click('#options [data-v="line"]');
    await t.drag(await V(100, 200), await V(200, 220), 4);
    check(await app(() => __jamdraw.paper.project.activeLayer.lastChild.strokeColor.toCSS(true)) === '#1d1418', 'Line mode with no colors draws dark');
    await app(() => { __jamdraw.S.fill = '#f2c14e'; });
    await t.drag(await V(100, 250), await V(200, 270), 4);
    check(await app(() => __jamdraw.paper.project.activeLayer.lastChild.strokeColor.toCSS(true)) === '#f2c14e', 'Line mode with only a fill uses it');
    // A cancelled stroke (the browser takes the pointer away) leaves nothing.
    const c0 = await count();
    await t.pointer('mouse', [await V(300, 300), await V(350, 350), await V(400, 380)], { cancel: true });
    check(await count() === c0, 'a cancelled stroke leaves nothing');
    // The outline maker falls back to the raw outline if cleaning it up fails.
    await page.click('#options [data-v="ink"]');
    await app(() => { window.__rc = paper.PathItem.prototype.resolveCrossings; paper.PathItem.prototype.resolveCrossings = () => { throw new Error('x'); }; });
    await t.drag(await V(600, 900), await V(700, 950), 6);
    await app(() => { paper.PathItem.prototype.resolveCrossings = window.__rc; });
    check(await count() === c0 + 1, 'a stroke still lands if its outline can not be cleaned up');
  });

  test('tools: eraser', async (t) => {
    const { check, app, key, V, count, add, page } = t;
    await add({ x: 100, y: 100, w: 300, h: 100 }, { kind: 'line', pts: [[100, 400], [500, 400]], stroke: '#000', width: 6 }, { x: 700, y: 700, w: 10, h: 10 });
    await app(() => { const l = __jamdraw.paper.project.activeLayer; const g = new paper.Group([new paper.Path.Rectangle({ point: [100, 600], size: [100, 100], fillColor: '#00f' })]); l.addChild(g); const h = new paper.Path.Rectangle({ point: [300, 600], size: [100, 100], fillColor: '#0f0' }); h.visible = false; l.addChild(h); });
    await key('e');
    await page.$eval('#options input[type="range"]', (el) => { el.value = '40'; el.dispatchEvent(new Event('input')); });
    await t.drag(await V(250, 50), await V(250, 250), 12);
    check(await app(() => __jamdraw.paper.project.activeLayer.firstChild.className) === 'CompoundPath', 'the eraser cuts a shape in two');
    await t.drag(await V(300, 350), await V(300, 450), 12);
    const line = await app(() => { const it = __jamdraw.paper.project.activeLayer.children[1]; return { type: it.className, pieces: it.children ? it.children.length : 1 }; });
    check(line.pieces === 2, `the eraser cuts a line in two and keeps both ends (${JSON.stringify(line)})`);
    await t.drag(await V(690, 690), await V(720, 720), 6);
    check(await app(() => !__jamdraw.paper.project.activeLayer.children.some((c) => Math.round(c.bounds.x) === 700)), 'erasing all of a small shape removes it');
    await t.drag(await V(150, 580), await V(150, 720), 8);
    check(await app(() => __jamdraw.paper.project.activeLayer.children.find((c) => c.className === 'Group').firstChild.className) === 'CompoundPath', 'the eraser reaches inside groups');
    await t.drag(await V(350, 580), await V(350, 720), 8);
    check(await app(() => __jamdraw.paper.project.activeLayer.lastChild.className) === 'Path', 'hidden things are not erased');
    const n = await count();
    await t.drag(await V(900, 900), await V(950, 950), 4);
    check(await count() === n, 'erasing empty space changes nothing');
    await app(() => { window.__sub = paper.PathItem.prototype.subtract; paper.PathItem.prototype.subtract = () => { throw new Error('x'); }; });
    await t.drag(await V(150, 120), await V(150, 180), 4);
    await app(() => { paper.PathItem.prototype.subtract = window.__sub; });
    check(await count() === n, 'a shape that can not be cut is left alone');
    await page.mouse.move(...(await V(500, 500)));
    await t.pointer('pen', [await V(500, 500), await V(520, 520)], { cancel: true });
  });

  test('tools: shapes, eyedropper, locked and hidden layers', async (t) => {
    const { check, app, key, V, page, count, toastText } = t;
    await key('r');
    await page.$eval('#options input[type="range"]', (el) => { el.value = '20'; el.dispatchEvent(new Event('input')); });
    await t.drag(await V(100, 100), await V(300, 200), 6);
    check(await app(() => __jamdraw.paper.project.activeLayer.lastChild.segments.length) === 8, 'a rectangle with rounded corners');
    await t.drag(await V(400, 100), await V(500, 250), 6, ['Shift']);
    check(await app(() => { const b = __jamdraw.paper.project.activeLayer.lastChild.bounds; return Math.round(b.width) === Math.round(b.height); }), 'Shift draws a square');
    await t.drag(await V(700, 200), await V(750, 230), 6, ['Alt']);
    check(await app(() => { const b = __jamdraw.paper.project.activeLayer.lastChild.bounds; return Math.round(b.center.x) === 700 && Math.round(b.center.y) === 200; }), 'Alt draws from the center');
    await page.click('#options [data-v="ellipse"]');
    await t.drag(await V(100, 400), await V(300, 500), 6);
    check(await app(() => __jamdraw.paper.project.activeLayer.lastChild.segments.length) === 4, 'an ellipse');
    await page.click('#options [data-v="polygon"]');
    await page.$eval('#options input[type="range"]', (el) => { el.value = '5'; el.dispatchEvent(new Event('input')); });
    await t.drag(await V(400, 400), await V(500, 500), 6);
    check(await app(() => __jamdraw.paper.project.activeLayer.lastChild.segments.length) === 5, 'a polygon with the chosen number of sides');
    await page.click('#options [data-v="star"]');
    await page.$$eval('#options input[type="range"]', (els) => { els[0].value = '7'; els[0].dispatchEvent(new Event('input')); els[1].value = '0.3'; els[1].dispatchEvent(new Event('input')); });
    await t.drag(await V(600, 400), await V(700, 500), 6);
    check(await app(() => __jamdraw.paper.project.activeLayer.lastChild.segments.length) === 14, 'a star with the chosen points');
    const n = await count();
    await t.drag(await V(800, 800), await V(800.5, 800.5), 2);
    check(await count() === n, 'a tiny drag makes nothing');
    await app(() => { __jamdraw.S.fill = null; __jamdraw.S.stroke = null; });
    await t.drag(await V(800, 800), await V(900, 900), 4);
    check(await app(() => !!__jamdraw.paper.project.activeLayer.lastChild.strokeColor), 'with no colors a shape gets a dark outline');
    await t.pointer('mouse', [await V(100, 700), await V(200, 800), await V(250, 850)], { cancel: true });
    check(await count() === n + 1, 'a cancelled shape drag leaves nothing');

    // Eyedropper.
    await t.add({ x: 100, y: 900, w: 80, h: 80, fill: '#abcdef', stroke: '#123456', width: 7 }, { x: 300, y: 900, w: 80, h: 80, fill: null, stroke: '#654321', width: 3 });
    await key('i');
    await t.click(await V(140, 940));
    check(await app(() => __jamdraw.S.fill === '#abcdef' && __jamdraw.S.stroke === '#123456' && __jamdraw.S.strokeWidth === 7), 'the eyedropper picks up fill, stroke and width');
    await t.click(await V(300, 900));
    check(await app(() => __jamdraw.S.fill === null && __jamdraw.S.stroke === '#654321'), 'and "no fill"');
    await t.drag(await V(950, 50), await V(960, 60), 2);
    check(await app(() => __jamdraw.S.stroke) === '#654321', 'tapping empty space picks nothing');
    await app(() => { const l = __jamdraw.paper.project.activeLayer; l.lastChild.strokeColor = null; l.lastChild.fillColor = '#999999'; });
    await t.click(await V(340, 940));
    check(await app(() => __jamdraw.S.stroke === null && __jamdraw.S.strokeWidth === 3), 'a shape without a stroke leaves the width alone');

    // Locked and hidden layers.
    await app(() => { __jamdraw.paper.project.activeLayer.locked = true; });
    for (const [k, label] of [['b', 'brush'], ['e', 'eraser'], ['r', 'shapes'], ['p', 'pen'], ['t', 'text']]) {
      await key(k);
      await t.drag(await V(500, 600), await V(550, 650), 4);
      check(await toastText() === 'This layer is locked', `the ${label} says the layer is locked`);
    }
    await app(() => { const l = __jamdraw.paper.project.activeLayer; l.locked = false; l.visible = false; });
    await key('b');
    await t.click(await V(500, 600));
    check(await toastText() === 'This layer is hidden', 'and that a hidden layer is hidden');
    await app(() => { __jamdraw.paper.project.activeLayer.visible = true; });
  });
};
