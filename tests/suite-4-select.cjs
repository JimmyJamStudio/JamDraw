// The Select tool in detail: shift-click, Alt-drag copies, marquee, every handle, Shift on scale and rotate, hover
// cursors, locked and hidden things, and the shortcuts that work on a selection.
module.exports = (test) => {
  test('select: clicks, marquee, copies', async (t) => {
    const { check, app, key, V, add } = t;
    await add({ x: 100, y: 100, w: 200, h: 200 }, { x: 500, y: 100, w: 200, h: 200 }, { x: 300, y: 600, w: 150, h: 150 });
    await key('v');
    await t.click(await V(200, 200));
    await t.click(await V(600, 200), ['Shift']);
    check(await app(() => __jamdraw.S.sel.length) === 2, 'Shift-click adds to the selection');
    await t.click(await V(600, 200), ['Shift']);
    check(await app(() => __jamdraw.S.sel.length) === 1, 'Shift-click on a selected thing takes it out');
    await t.click(await V(900, 900));
    check(await app(() => __jamdraw.S.sel.length) === 0, 'clicking empty page clears the selection');
    await t.drag(await V(50, 50), await V(750, 350));
    check(await app(() => __jamdraw.S.sel.length) === 2, 'a marquee selects what it touches');
    await t.drag(await V(280, 580), await V(320, 620), 6, ['Shift']);
    check(await app(() => __jamdraw.S.sel.length) === 3, 'Shift-marquee adds to the selection');
    await t.click(await V(900, 900));
    await t.drag(await V(900, 900), await V(901, 901), 2);
    check(await app(() => __jamdraw.S.sel.length) === 0, 'a tiny marquee is just a click');
    await t.click(await V(200, 200));
    const n = await t.count();
    await t.drag(await V(200, 200), await V(250, 260), 8, ['Alt']);
    check(await t.count() === n + 1, 'Alt-drag leaves a copy behind');
    await key('Escape');
    check(await app(() => __jamdraw.S.sel.length) === 0, 'Esc deselects');
  });

  test('select: handles, Shift, cursors', async (t) => {
    const { check, app, key, V, add, page } = t;
    await add({ x: 300, y: 300, w: 200, h: 100 });
    await key('v');
    await t.click(await V(400, 350));
    const b = () => app(() => { const r = __jamdraw.S.sel[0].bounds; return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
    // Right edge: only width changes.
    await t.drag(await V(500, 350), await V(600, 380));
    let r = await b();
    check(r.w === 300 && r.h === 100, `the right-edge handle changes only the width (${JSON.stringify(r)})`);
    // Bottom edge with Shift: both change, proportionally.
    await t.drag(await V(r.x + r.w / 2, r.y + r.h), await V(r.x + r.w / 2, r.y + 200), 8, ['Shift']);
    r = await b();
    check(Math.abs(r.w / r.h - 3) < 0.05, `Shift on an edge handle keeps the proportions (${JSON.stringify(r)})`);
    // Corner with Shift.
    await t.drag(await V(r.x + r.w, r.y + r.h), await V(r.x + r.w + 90, r.y + r.h + 10), 8, ['Shift']);
    r = await b();
    check(Math.abs(r.w / r.h - 3) < 0.05, 'Shift on a corner keeps the proportions');
    // Drag a corner right through the opposite one: flips without collapsing.
    await t.drag(await V(r.x + r.w, r.y + r.h), await V(r.x - 50, r.y - 50), 10);
    r = await b();
    check(r.w > 10 && r.h > 10, 'dragging a corner past the opposite one flips it instead of collapsing');
    await t.drag(await V(r.x + r.w, r.y + r.h), await V(r.x + r.w, r.y + r.h), 1);
    // Rotate with Shift snaps to 15 degrees.
    const before = await app(() => __jamdraw.S.sel[0].firstSegment.point.subtract(__jamdraw.S.sel[0].bounds.center).angle);
    const tl = await V(r.x, r.y);
    await t.drag([tl[0] - 18, tl[1] - 18], [tl[0] + 25, tl[1] - 45], 10, ['Shift']);
    const after = await app(() => __jamdraw.S.sel[0].firstSegment.point.subtract(__jamdraw.S.sel[0].bounds.center).angle);
    const turned = ((after - before) % 360 + 360) % 360;
    check(Math.abs(turned / 15 - Math.round(turned / 15)) < 0.01 && turned > 1, `Shift-rotate snaps to 15° (${turned.toFixed(2)}°)`);
    // Hover cursors.
    r = await b();
    await page.mouse.move(...(await V(r.x + r.w / 2, r.y)));
    check(await app(() => document.getElementById('overlay').style.cursor) === 'ns-resize', 'hovering an edge handle shows a resize cursor');
    const c = await V(r.x, r.y);
    await page.mouse.move(c[0] - 18, c[1] - 18);
    check(await app(() => document.getElementById('overlay').style.cursor) === 'grab', 'just outside a corner shows the rotate cursor');
    await page.mouse.move(...(await V(r.x + r.w / 2, r.y + r.h / 2)));
    check(await app(() => document.getElementById('overlay').style.cursor) === 'default', 'inside shows the normal cursor');
  });

  test('select: keys and locked or hidden things', async (t) => {
    const { check, app, key, V, add, combo } = t;
    await add({ x: 100, y: 100, w: 100, h: 100 });
    await key('v');
    await t.click(await V(150, 150));
    const x0 = await app(() => __jamdraw.S.sel[0].bounds.x);
    await key('ArrowRight');
    await key('ArrowDown');
    await t.page.keyboard.down('Shift'); await key('ArrowLeft'); await key('ArrowUp'); await t.page.keyboard.up('Shift');
    check(await app(() => __jamdraw.S.sel[0].bounds.x) === x0 - 9, 'arrows nudge by 1, Shift+arrows by 10');
    await t.wait(500);
    await combo('Control', 'z');
    check(await app(() => __jamdraw.paper.project.activeLayer.firstChild.bounds.x) === x0, 'a run of nudges undoes in one step');
    await key('Delete');
    check(await t.count() === 1, 'Delete with nothing selected does nothing');
    await t.click(await V(150, 150));
    await key('Backspace');
    check(await t.count() === 0, 'Backspace deletes the selection');
    await combo('Control', 'z');
    await app(() => { __jamdraw.paper.project.activeLayer.firstChild.locked = true; });
    await t.click(await V(150, 150));
    check(await app(() => __jamdraw.S.sel.length) === 0, 'locked things can not be picked');
    await t.drag(await V(50, 50), await V(300, 300));
    check(await app(() => __jamdraw.S.sel.length) === 0, 'or marqueed');
    await app(() => { const it = __jamdraw.paper.project.activeLayer.firstChild; it.locked = false; it.layer.locked = true; });
    await t.drag(await V(50, 50), await V(300, 300));
    check(await app(() => __jamdraw.S.sel.length) === 0, 'nothing on a locked layer can be marqueed');
    await app(() => { __jamdraw.paper.project.activeLayer.locked = false; });
    await combo('Control', 'a');
    check(await app(() => __jamdraw.S.sel.length) === 1, 'Ctrl+A selects everything on the layer');
    await app(() => { __jamdraw.paper.project.activeLayer.locked = true; __jamdraw.setSel([]); });
    await combo('Control', 'a');
    check(await app(() => __jamdraw.S.sel.length) === 0, 'Ctrl+A on a locked layer selects nothing');
  });
};
