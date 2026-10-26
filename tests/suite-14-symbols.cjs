// Symbols: one drawing used in many places; editing one copy changes them all.
module.exports = (test) => {
  test('symbols: make, copy, edit, done, unlink', async (t) => {
    const { check, app, add, key, V, toastText } = t;
    const arrange = (label) => t.button('#arrange', label);
    const layerNames = () => app(() => __jamdraw.paper.project.layers.map((l) => l.name).join());
    const defs = () => app(() => new Set(__jamdraw.paper.project.activeLayer.children.filter((c) => c instanceof paper.SymbolItem).map((c) => c.definition)).size);
    await key('v');
    await arrange('Make symbol');
    check(await toastText() === 'Select something first', 'Make symbol needs a selection');
    await arrange('Edit symbol');
    check(await toastText() === 'Select a symbol first', 'so does Edit symbol');
    await arrange('Unlink');
    check(await toastText() === 'Select a symbol first', 'and Unlink');
    await add({ kind: 'circle', x: 200, y: 200, r: 60 }, { x: 200, y: 230, w: 120, h: 30, fill: '#1d1418' });
    await t.sel(0, 1);
    await arrange('Make symbol');
    check(await app(() => { const c = __jamdraw.paper.project.activeLayer.children; return c.length === 1 && c[0] instanceof paper.SymbolItem && __jamdraw.S.sel[0] === c[0]; })
      && (await toastText()).startsWith('Made "Symbol 1"'), 'the selection becomes one symbol, in its place');
    await t.combo('Control', 'd');
    await app(() => __jamdraw.S.sel[0].translate(new paper.Point(400, 0)));
    await t.combo('Control', 'c');
    await t.combo('Control', 'v');
    check(await defs() === 1 && await app(() => __jamdraw.paper.project.activeLayer.children.length) === 3, 'duplicated and pasted copies are all the same symbol');
    // Double-click a copy: its insides come out on an editing layer; everything else is off limits until Done.
    await t.click(await V(600, 200));
    await t.click(await V(600, 200));
    check(await layerNames() === 'Layer 1,Editing Symbol 1' && await app(() => !document.getElementById('symbar').hidden && __jamdraw.paper.project.activeLayer.children.length === 2),
      'double-clicking a copy edits the symbol, with a bar to finish');
    await t.wait(50); // the rest shows faded
    await t.act('layer-del');
    check(await toastText() === 'Press Done to finish editing the symbol', 'the editing layer can\'t be deleted');
    await app(() => __jamdraw.paper.project.layers[0].activate());
    await key('r');
    await t.drag(await V(700, 700), await V(800, 800), 4);
    check(await toastText() === 'Finish editing the symbol first (Done, at the top)', 'the rest of the drawing waits');
    await app(() => __jamdraw.paper.project.layers[1].activate());
    await t.drag(await V(560, 150), await V(640, 180), 4); // a new part, drawn into the symbol
    // A copy of the symbol inside itself is left out.
    await app(async () => { const s = __jamdraw.paper.project.layers[0].firstChild.clone(); __jamdraw.paper.project.layers[1].addChild(s); });
    await t.act('symbol-done');
    check(await toastText() === 'A symbol can\'t contain itself: that copy was left out', 'a symbol can\'t hold a copy of itself');
    check(await layerNames() === 'Layer 1' && await app(() => {
      const c = __jamdraw.paper.project.activeLayer.children;
      return c.length === 3 && c.every((k) => k.visible && k.definition === c[0].definition) && c[0].definition.item.children.length === 3;
    }), 'Done: every copy shows the new part');
    // Exports draw the copies as ordinary shapes.
    await app(() => { const l = __jamdraw.paper.project.activeLayer; new paper.Group([l.children[2]]); });
    check(await app(async () => { const svg = (await import('/js/export.js')).buildSVG({ area: 'page', format: 'svg', bg: 'none', precision: 2 }).svg; return !svg.includes('<use') && (svg.match(/<(path|circle|rect|ellipse)/g) || []).length >= 9; }),
      'exports draw copies as plain shapes (even inside groups)');
    // The Points tool sends you to Select; Sticker outline goes round a copy.
    await key('a');
    await t.click(await V(200, 200));
    check(await toastText() === 'A symbol\'s points are edited inside it: double-click it with Select', 'points are edited inside the symbol');
    await key('v');
    await t.sel(0);
    const n = await t.count();
    await t.button('#combine', 'Sticker outline');
    check(await t.count() === n + 1, 'a sticker outline goes round a symbol copy');
    await t.sel(1);
    await arrange('Unlink');
    check(await app(() => { const s = __jamdraw.S.sel[0]; return s instanceof paper.Group && s.children.length === 3 && !s.data.symbol; }), 'Unlink makes a copy ordinary shapes again');
    await t.combo('Control', 'z');
    check(await app(() => __jamdraw.paper.project.activeLayer.children[1] instanceof paper.SymbolItem), 'undo links it again');
    await t.sel(1);
    await arrange('Edit symbol');
    check(await layerNames() === 'Layer 1,Editing Symbol 1', 'the Edit symbol button edits the selected copy');
    await t.act('symbol-done');
    // Pasting a copy whose symbol is gone keeps its own.
    await t.sel(1);
    await t.combo('Control', 'c');
    await app(() => __jamdraw.paper.project.activeLayer.removeChildren());
    await t.combo('Control', 'v');
    check(await defs() === 1, 'a copy pasted after the others are gone still works');
  });
};
