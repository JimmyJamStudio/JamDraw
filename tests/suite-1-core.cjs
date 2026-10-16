// The main path through every tool: shapes, select, brush (mouse and pen), pen tool, points, undo, combine, outlines,
// eraser, groups, layers, autosave.
module.exports = (test) => {
  test('core: draw, select, edit, combine', async (t) => {
    const { check, P, drag, key, combo, app, count, button } = t;
    check(await count() === 0, 'starts empty');
    await key('r');
    await drag(P(0.3, 0.3), P(0.5, 0.5));
    check(await count() === 1, 'rectangle drawn');
    await t.page.click('#options [data-v="star"]');
    await drag(P(0.45, 0.45), P(0.65, 0.65));
    check(await count() === 2, 'star drawn');

    await key('v');
    await t.click(P(0.4, 0.4));
    check(await app(() => __jamdraw.S.sel.length) === 1, 'click selects the rectangle');
    const before = await app(() => __jamdraw.S.sel[0].bounds.width);
    const br = await app(() => { const b = __jamdraw.S.sel[0].bounds.bottomRight; return [b.x, b.y]; });
    const a = await t.V(...br);
    await drag(a, [a[0] + 60, a[1] + 60]);
    const after = await app(() => __jamdraw.S.sel[0].bounds.width);
    check(after > before + 20, `scale handle grows it (${before.toFixed(0)} -> ${after.toFixed(0)})`);
    await drag(P(0.4, 0.4), P(0.38, 0.36));
    const tl = await t.V(...(await app(() => { const b = __jamdraw.S.sel[0].bounds.topLeft; return [b.x, b.y]; })));
    await drag([tl[0] - 16, tl[1] - 16], [tl[0] + 40, tl[1] - 60]);
    check(await app(() => { const s = __jamdraw.S.sel[0].segments; return s[0].point.y !== s[1].point.y && s[0].point.x !== s[1].point.x; }), 'rotate handle rotates');

    await key('b');
    await drag(P(0.15, 0.7), P(0.35, 0.8), 25);
    check(await count() === 3, 'brush stroke (mouse) made a shape');
    const pts = [];
    const [x0, y0] = P(0.55, 0.75), [x1, y1] = P(0.85, 0.7);
    for (let i = 0; i <= 30; i++) { const k = i / 30; pts.push([x0 + (x1 - x0) * k, y0 + (y1 - y0) * k + Math.sin(k * 6) * 20, i ? Math.sin(k * Math.PI) : 0.1]); }
    await t.pointer('pen', pts);
    check(await count() === 4, 'pen pressure stroke made a shape');
    check(await app(() => __jamdraw.S.sawPen), 'using a pen turns on palm rejection');
    await t.page.click('#options [data-v="line"]');
    await drag(P(0.15, 0.15), P(0.3, 0.2), 15);
    const line = await app(() => { const c = __jamdraw.paper.project.activeLayer.lastChild; return { closed: c.closed, stroke: !!c.strokeColor }; });
    check(line.stroke && !line.closed, 'line mode makes an open stroked path');

    await key('p');
    await t.click(P(0.7, 0.2));
    await drag(P(0.85, 0.25), P(0.9, 0.35), 5);
    await t.click(P(0.75, 0.4));
    await t.click(P(0.7, 0.2));
    const pen = await app(() => { const c = __jamdraw.paper.project.activeLayer.lastChild; return { closed: c.closed, n: c.segments.length, curved: !c.segments[1].handleOut.isZero() }; });
    check(pen.closed && pen.n === 3 && pen.curved, `pen path: closed, 3 points, a curve (${JSON.stringify(pen)})`);

    await key('a');
    const sp = await app(() => { const c = __jamdraw.paper.project.activeLayer.lastChild; __jamdraw.S.node.path = c; const p = c.segments[2].point; return [p.x, p.y]; });
    const sv = await t.V(...sp);
    await drag(sv, [sv[0] - 30, sv[1] + 20], 6);
    check(await app(() => __jamdraw.S.node.segs.size) === 1, 'points tool selects and drags a point');
    await key('Delete');
    check(await app(() => __jamdraw.paper.project.activeLayer.lastChild.segments.length) === 2, 'Delete removes the selected point');
    await combo('Control', 'z');
    check(await app(() => __jamdraw.paper.project.activeLayer.lastChild.segments.length) === 3, 'undo brings the point back');

    await key('v');
    await t.sel(0, 1);
    await button('#combine', 'Unite');
    check(await app(() => __jamdraw.S.sel.length) === 1, 'unite leaves one shape');
    const n0 = await count();
    await button('#combine', 'Sticker outline');
    check(await count() === n0 + 1, 'sticker outline adds a shape underneath');
    await app(() => { const l = __jamdraw.paper.project.activeLayer; __jamdraw.setSel([l.children.find((c) => !c.closed && c.strokeColor)]); });
    await button('#combine', 'Outline stroke');
    check(await app(() => { const s = __jamdraw.S.sel[0]; return !!s.fillColor && !s.strokeColor; }), 'outline stroke turns the line into a filled shape');

    await key('v');
    await combo('Control', 'a');
    await combo('Control', 'g');
    check(await count() === 1, 'select all + group makes one group');
    await combo('Control', 'Shift', 'g');
    check(await count() > 1, 'ungroup');
    await t.act('layer-add');
    check(await app(() => __jamdraw.paper.project.layers.length) === 2, 'add layer');

    const total = await t.total();
    await t.wait(900);
    await t.reload();
    check(await t.total() === total, `autosave brings the drawing back after a reload (${total} items)`);
    await t.page.screenshot({ path: require('path').join(t.OUT, 'core.png') });
  });
};
