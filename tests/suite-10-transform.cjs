// Position and size boxes, angles, and snapping (page, shapes, grid, Ctrl to place freely) for every tool that snaps.
module.exports = (test) => {
  const field = (t, f, v) => t.page.$eval('#tf-' + f, (el, v) => { el.value = v; el.dispatchEvent(new Event('change')); }, String(v));
  const bounds = (t, i = 0) => t.app((i) => { const b = __jamdraw.paper.project.activeLayer.children.at(i).bounds; return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10); }, i);
  const shown = (t) => t.app(() => ['x', 'y', 'w', 'h', 'a'].map((f) => document.getElementById('tf-' + f).value).join(','));

  test('transform: position and size boxes', async (t) => {
    const { check, app, add, page, key } = t;
    check(await app(() => document.getElementById('tf-x').disabled && document.getElementById('tf-x').value === ''), 'the boxes are empty and off with nothing selected');
    await add({ x: 100, y: 100, w: 200, h: 100 });
    await key('v');
    await t.sel(0);
    check(await shown(t) === '100,100,200,100,0', 'they show the selection: ' + await shown(t));
    await field(t, 'x', 300);
    await field(t, 'y', 50);
    check((await bounds(t)).join() === '300,50,200,100', 'X and Y move it');
    await field(t, 'w', 400);
    check((await bounds(t)).join() === '300,50,400,200', 'W with the lock on keeps the proportions');
    await page.click('#tf-lock');
    check(await app(() => document.getElementById('tf-lock').getAttribute('aria-pressed')) === 'false', 'the lock button turns it off');
    await field(t, 'w', 100);
    await field(t, 'h', 50);
    check((await bounds(t)).join() === '300,50,100,50', 'with the lock off W and H change on their own');
    await page.click('#tf-lock');
    await field(t, 'w', '');
    check((await bounds(t)).join() === '300,50,100,50' && (await shown(t)).startsWith('300,50,100,50'), 'a blank box changes nothing and shows the value again');
    await field(t, 'w', 0);
    check(await t.toastText() === 'Use a size above 0', 'a size of 0 says so');
    // Angle: type it, turn with the handle (Shift: 15° steps), flip mirrors it.
    await field(t, 'a', 30);
    check((await shown(t)).endsWith(',30') && await app(() => Math.round(__jamdraw.paper.project.activeLayer.firstChild.firstSegment.point.subtract(__jamdraw.paper.project.activeLayer.firstChild.bounds.center).angle)) !== 0, 'the angle box turns it');
    const tl = await app(() => { const b = __jamdraw.S.sel[0].bounds; return [b.x, b.y]; });
    const c = await t.V(...tl);
    await t.drag([c[0] - 18, c[1] - 18], [c[0] - 18, c[1] - 60], 8, ['Shift']);
    const a2 = +(await app(() => document.getElementById('tf-a').value));
    check(Math.abs(a2 / 15 - Math.round(a2 / 15)) < 0.01 && a2 !== 30, 'turning with the handle updates the angle: ' + a2);
    await t.button('#options', 'Flip ↔');
    check(+(await app(() => document.getElementById('tf-a').value)) === -a2, 'flipping mirrors the angle');
    await field(t, 'a', 190);
    check(+(await app(() => document.getElementById('tf-a').value)) === -170, 'angles stay between -180 and 180');
    // Several things: a shared angle, or 0 when they differ.
    await add({ x: 600, y: 600, w: 100, h: 100 });
    await t.sel(0, 1);
    check((await shown(t)).endsWith(',0'), 'things at different angles show 0');
    await field(t, 'a', 10);
    check(await app(() => __jamdraw.paper.project.activeLayer.children.map((c) => Math.round(c.data.angle)).join()) === '-160,10', 'and a new angle turns each by that much');
    // A straight line has no height to scale.
    await add({ kind: 'line', pts: [[100, 800], [400, 800]], stroke: '#000', width: 4 });
    await t.sel(-1);
    await field(t, 'h', 20);
    check(await t.toastText() === 'That has no height to scale (a straight line)', 'a flat line has no height to scale');
    await add({ kind: 'line', pts: [[900, 100], [900, 400]], stroke: '#000', width: 4 });
    await t.sel(-1);
    await field(t, 'w', 20);
    check(await t.toastText() === 'That has no width to scale (a straight line)', 'an upright line has no width');
    await field(t, 'h', 150);
    check((await bounds(t, -1))[3] === 150, 'but its height scales');
    // The boxes follow a drag live, and don't change under someone typing.
    await t.sel(0);
    const p = await t.V(...(await app(() => { const b = __jamdraw.S.sel[0].bounds.center; return [b.x, b.y]; })));
    await page.mouse.move(...p);
    await page.mouse.down();
    await page.mouse.move(p[0] + 40, p[1] + 25, { steps: 5 });
    const mid = await app(() => document.getElementById('tf-x').value);
    await page.mouse.up();
    check(mid === await app(() => document.getElementById('tf-x').value) && mid !== '', 'the boxes follow along while dragging');
    await page.focus('#tf-x');
    await page.$eval('#tf-x', (el) => { el.value = '12345'; });
    await t.act('zoom-in');
    await t.wait(50);
    check(await app(() => document.getElementById('tf-x').value) === '12345', 'a box being typed in is left alone');
    await page.$eval('#tf-x', (el) => { el.value = ''; el.dispatchEvent(new Event('change')); });
  });

  test('snap: moving, page, shapes, grid, Ctrl', async (t) => {
    const { check, app, add, page, key, V } = t;
    await add({ x: 100, y: 100, w: 100, h: 100 }, { x: 400, y: 400, w: 100, h: 100 });
    await key('v');
    // Move B so its left edge lands near A's right edge (200): it snaps exactly, with a guide while dragging.
    const from = await V(450, 450);
    const to = await V(450 - 196, 450 - 3.5);
    await page.mouse.move(...from);
    await page.mouse.down();
    await page.mouse.move(...to, { steps: 6 });
    const guides = await app(() => __jamdraw.S.guides && [__jamdraw.S.guides.x, __jamdraw.S.guides.y]);
    await page.mouse.up();
    const b = await bounds(t, 1);
    check(b[0] === 200, `an edge snaps onto another shape's edge (left ${b[0]})`);
    check(guides && guides[0] === 200, 'a pink guide shows while it snaps');
    check(await app(() => __jamdraw.S.guides) === null, 'and goes when you let go');
    // Hold Ctrl: no snapping.
    await t.drag(await V(250, 446), await V(254, 470), 6, ['Control']);
    check((await bounds(t, 1))[0] !== 200, 'holding Ctrl places it freely');
    // Page center.
    const bb = await bounds(t, 1);
    const cx = bb[0] + bb[2] / 2, cy = bb[1] + bb[3] / 2;
    await t.drag(await V(cx, cy), await V(512 + 3, 300), 8);
    check((await bounds(t, 1))[0] + 50 === 512, 'a center snaps to the page center');
    // Snap off: nothing snaps; grid on: only the grid.
    await page.click('#snap-on');
    check(await app(() => __jamdraw.S.snap.on) === false, 'the Snap box turns it off');
    let c = await bounds(t, 1);
    await t.drag(await V(c[0] + 50, c[1] + 50), await V(205 + 50, c[1] + 50), 6);
    check(Math.abs((await bounds(t, 1))[0] - 200) > 2, 'with snapping off an edge near another shape stays where you put it');
    await page.click('#grid-on');
    await page.$eval('#grid-size', (el) => { el.value = '50'; el.dispatchEvent(new Event('change')); });
    c = await bounds(t, 1);
    await t.drag(await V(c[0] + 50, c[1] + 50), await V(c[0] + 50 + (303 - c[0]), c[1] + 50 + (202 - c[1])), 8);
    const g = await bounds(t, 1);
    check(g[0] === 300 && g[1] === 200, 'with the grid on, edges snap to it: ' + g.slice(0, 2));
    // Grid size limits.
    await page.$eval('#grid-size', (el) => { el.value = 'abc'; el.dispatchEvent(new Event('change')); });
    check(await app(() => __jamdraw.S.snap.size) === 50, 'a nonsense grid size is ignored');
    await page.$eval('#grid-size', (el) => { el.value = '5000'; el.dispatchEvent(new Event('change')); });
    check(await app(() => __jamdraw.S.snap.size) === 1024, 'grid sizes stop at 1024');
    await page.$eval('#grid-size', (el) => { el.value = '1'; el.dispatchEvent(new Event('change')); });
    check(await app(() => __jamdraw.S.snap.size) === 2, 'and start at 2 (too fine to draw at this zoom)');
    await page.$eval('#grid-size', (el) => { el.value = '50'; el.dispatchEvent(new Event('change')); });
    for (let i = 0; i < 6; i++) await t.act('zoom-in');
    await t.wait(50);
    await page.screenshot({ path: require('path').join(t.OUT, 'grid-zoomed.png') });
    await key('0');
    // Settings are saved with the drawing.
    await t.wait(800);
    await t.reload();
    check(await app(() => !__jamdraw.S.snap.on && __jamdraw.S.snap.grid && __jamdraw.S.snap.size === 50 && document.getElementById('grid-on').checked), 'snap settings are saved with the drawing');
  });

  test('snap: shapes, pen, points, handles', async (t) => {
    const { check, app, add, page, key, V } = t;
    await page.click('#grid-on'); // grid of 32 on, plus page and shapes
    await key('r');
    await t.drag(await V(97, 101), await V(255, 158), 8);
    check((await bounds(t, -1)).join() === '96,96,160,64', 'a new shape snaps its corners to the grid: ' + (await bounds(t, -1)));
    await key('p');
    await t.click(await V(318, 323));
    await t.click(await V(450, 452));
    await key('Enter');
    check(await app(() => { const s = __jamdraw.paper.project.activeLayer.lastChild.segments; return [s[0].point.x, s[0].point.y, s[1].point.x, s[1].point.y].map(Math.round).join(); }) === '320,320,448,448', 'pen points snap to the grid');
    await page.click('#grid-on');
    // Points: drag the line's end near the rectangle's right edge (256).
    await key('a');
    await t.click(await V(384, 384));
    const end = await V(448, 448);
    await t.drag(end, (await V(259, 448)), 8);
    check(await app(() => Math.round(__jamdraw.paper.project.activeLayer.lastChild.lastSegment.point.x * 10) / 10) === 256, 'a dragged point snaps to another shape\'s edge');
    // Drag the whole path: its bounds snap.
    const mid = await V(288, 384);
    await t.drag(mid, await V(288 + 3, 384 - 64 + 2), 8);
    check(await app(() => Math.round(__jamdraw.paper.project.activeLayer.lastChild.bounds.left * 10) / 10) === 256, 'dragging a whole path snaps its edges too');
    // Scale handle: drag the rectangle's right handle near the page center (512).
    await key('v');
    await t.sel(0);
    const rh = await V(256, 128);
    await t.drag(rh, await V(509, 128), 8);
    check((await bounds(t, 0))[0] + (await bounds(t, 0))[2] === 512, 'a scale handle snaps (to the page center)');
    // Only one direction snapping shows only that guide.
    await add({ x: 700, y: 900, w: 50, h: 50 });
    await t.sel(-1);
    await page.mouse.move(...(await V(725, 925)));
    await page.mouse.down();
    await page.mouse.move(...(await V(725 - 185, 925 - 3)), { steps: 4 }); // left edge near the page center (512)
    const gd = await app(() => __jamdraw.S.guides && [__jamdraw.S.guides.x, __jamdraw.S.guides.y]);
    await page.mouse.up();
    check(gd && (gd[0] == null) !== (gd[1] == null), 'snapping one way shows one guide: ' + JSON.stringify(gd));
    // A cancelled drag clears guides.
    await t.pointer('mouse', [await V(725, 925), await V(740, 925), await V(745, 925)], { cancel: true });
    check(await app(() => __jamdraw.S.guides) === null, 'a cancelled drag clears the guides');
  });
};
