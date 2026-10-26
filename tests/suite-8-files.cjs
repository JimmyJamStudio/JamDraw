// Files and saving: save and reopen a .jamdraw, open and place SVGs, bad files, New, and starting with storage that
// doesn't work (blocked, failing database, no service worker).
const fs = require('fs');
const path = require('path');

module.exports = (test) => {
  const pick = async (t, act, file) => {
    const [chooser] = await Promise.all([t.page.waitForFileChooser(), t.act(act)]);
    await chooser.accept([file]);
    await t.wait(400);
  };

  test('files: save, open, place, new', async (t) => {
    const { check, app, add, OUT } = t;
    await add({ x: 100, y: 100, w: 200, h: 200 });
    await t.act('layer-add');
    await add({ kind: 'circle', x: 600, y: 600, r: 100, fill: '#123456' });
    await app(() => { __jamdraw.S.doc.name = 'Round ★ trip'; __jamdraw.S.swatches.push('#010203'); });
    t.clearDownloads();
    await t.combo('Control', 's');
    const files = await t.files();
    const saved = files.find((n) => n.endsWith('.jamdraw'));
    check(saved === 'Round  trip.jamdraw', 'Ctrl+S saves a .jamdraw file named after the drawing: ' + saved);
    await app(() => { __jamdraw.S.doc.name = '★★'; });
    await t.act('save');
    check((await t.files()).includes('drawing.jamdraw'), 'a name with no usable letters saves as drawing.jamdraw');
    await app(() => { __jamdraw.S.doc.name = 'Round ★ trip'; });
    // Wipe the drawing, then open the file back.
    t.nextDialog = false;
    await t.act('new');
    check(await t.total() === 2, 'New asks first (Cancel keeps the drawing)');
    t.nextDialog = true;
    await t.act('new');
    check(await t.total() === 0 && await app(() => __jamdraw.S.doc.name) === 'Untitled', 'New starts an empty drawing');
    await pick(t, 'open', path.join(t.dl, saved));
    check(await t.total() === 2 && await app(() => __jamdraw.paper.project.layers.length === 2 && __jamdraw.S.swatches.includes('#010203') && __jamdraw.S.doc.name === 'Round ★ trip'), 'opening the .jamdraw brings back layers, shapes, swatches and name');

    // SVG with a viewBox, by name.
    const svg1 = path.join(OUT, 'logo.svg');
    fs.writeFileSync(svg1, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect x="10" y="10" width="100" height="80" fill="#f00"/><circle cx="200" cy="150" r="50" fill="#00f"/></svg>');
    await pick(t, 'open', svg1);
    check(await app(() => __jamdraw.S.doc.w === 400 && __jamdraw.S.doc.h === 300 && __jamdraw.S.doc.name === 'logo'), 'opening an SVG uses its viewBox for the page size and its name');
    check(await app(() => __jamdraw.paper.project.activeLayer.children.length) === 1, '(its shapes come in as one group)');
    // SVG without a viewBox, and not named .svg.
    const svg2 = path.join(OUT, 'drawing.txt');
    fs.writeFileSync(svg2, '  <svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="250" height="120" fill="#0f0"/></svg>');
    await pick(t, 'open', svg2);
    check(await app(() => __jamdraw.S.doc.w === 250 && __jamdraw.S.doc.h === 120), 'an SVG without a viewBox is sized to its drawing, whatever the file is called');
    // Bad files.
    const bad = path.join(OUT, 'bad.jamdraw');
    fs.writeFileSync(bad, '{ not json');
    await pick(t, 'open', bad);
    check(await t.toastText() === 'That file could not be read', 'a broken file says so');
    const other = path.join(OUT, 'other.json');
    fs.writeFileSync(other, '{"app":"SomethingElse"}');
    await pick(t, 'open', other);
    check(await t.toastText() === 'That is not a JamDraw file', 'another app\'s file says so');
    // A minimal JamDraw file (from a future or hand-made save): everything falls back to defaults.
    const min = path.join(OUT, 'min.jamdraw');
    fs.writeFileSync(min, '{"app":"JamDraw"}');
    await pick(t, 'open', min);
    check(await app(() => __jamdraw.paper.project.layers.length === 1 && __jamdraw.S.swatches.length > 5 && __jamdraw.S.sketch === null), 'a bare-bones file opens with one layer and the default swatches');
    // A file that can't be read at all.
    await app(() => { window.__FR = FileReader; window.FileReader = class { readAsText() { setTimeout(() => this.onerror()); } }; });
    await pick(t, 'open', min);
    await app(() => { window.FileReader = window.__FR; });
    check(await t.toastText() === 'That file could not be read', 'a file the browser can\'t read says so');
    // Place an SVG: big ones are scaled down to fit, small ones keep their size; both are centered.
    await app(() => Object.assign(__jamdraw.S.doc, { w: 1024, h: 1024 }));
    const big = path.join(OUT, 'big.svg');
    fs.writeFileSync(big, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 1000"><rect width="3000" height="1000" fill="#f0f"/></svg>');
    await pick(t, 'place', big);
    const placed = await app(() => { const b = __jamdraw.S.sel[0].bounds; return [Math.round(b.width), Math.round(b.center.x)]; });
    check(placed[0] <= 820 && placed[1] === 512, 'a big SVG is scaled to fit and centered ' + placed);
    await pick(t, 'place', svg1);
    check(await app(() => Math.round(__jamdraw.S.sel[0].bounds.center.x)) === 512, 'a small one is centered at its size');
  });

  test('files: works offline once loaded', async (t) => {
    const { check, app, page } = t;
    await page.waitForFunction(() => navigator.serviceWorker.controller, { timeout: 10000 }).catch(() => {});
    check(await app(() => !!navigator.serviceWorker.controller), 'the offline cache is installed');
    await t.add({ x: 100, y: 100, w: 100, h: 100 });
    await t.wait(800);
    // Make sure a font has been used (so it's in the cache), then take the server away entirely.
    await t.key('t');
    await t.click(await t.V(600, 600));
    await page.waitForSelector('#textdlg[open] textarea');
    await t.wait(300);
    await page.click('#textdlg [data-tx="done"]');
    await t.wait(800);
    await t.stopServer();
    await t.reload();
    check(await app(() => !!window.__jamdraw && __jamdraw.paper.project.activeLayer.children.length === 2), 'with the server gone the app still opens, with the drawing');
    await t.key('t');
    await t.click(await t.V(300, 300));
    await page.waitForSelector('#textdlg[open] textarea');
    await t.wait(300);
    check(await app(() => __jamdraw.S.sel[0] && __jamdraw.S.sel[0].children.length > 0), 'and text works with a font used before');
    await t.startServer();
  });

  test('files: storage that does not work', async (t) => {
    const { check, app } = t;
    // Blocked IndexedDB: the app still starts, autosave fails quietly.
    t.expectConsoleErrors(4);
    await t.bootWith({ brokenIdb: true });
    check(await app(() => __jamdraw.paper.project.layers.length) === 1, 'with the database blocked the app still starts');
    await t.add({ x: 10, y: 10, w: 10, h: 10 });
    await t.wait(800);
    // Failing transactions.
    await t.bootWith({ brokenTx: true });
    check(await app(() => __jamdraw.paper.project.layers.length) === 1, 'with the database failing the app still starts');
    await t.add({ x: 10, y: 10, w: 10, h: 10 });
    await t.wait(800);
    // localStorage blocked (some private windows): export settings just aren't remembered.
    await t.bootWith({ noStorage: true, swFail: true });
    await t.combo('Control', 'e');
    await t.page.click('#dlg button[value="cancel"]');
    check(await app(() => !document.getElementById('dlg').open), 'with storage blocked the export dialog still works');
    await app(async () => {
      const c = document.createElement('canvas'); c.width = c.height = 20;
      const x = c.getContext('2d'); x.fillStyle = '#c00'; x.fillRect(5, 5, 10, 10);
      __jamdraw.S.sketch = { src: c.toDataURL(), x: 0, y: 0, scale: 10, w: 20, h: 20, opacity: 0.4, visible: true };
      (await import('/js/view.js')).changed();
      await document.getElementById('sketch').decode();
      (await import('/js/trace.js')).traceDialog();
    });
    await t.page.click('#tracedlg [data-x="cancel"]');
    check(await app(() => !document.getElementById('tracedlg').open && __jamdraw.paper.project.layers.length === 1), 'and so does Auto trace');
  });
};
