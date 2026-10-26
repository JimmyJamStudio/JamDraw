// Text: creating, fonts, editing, cancelling, anchoring, turning into shapes, your own fonts.
module.exports = (test) => {
  test('text: new text lands where you tap', async (t) => {
    const { check, key, app, page, wait } = t;
    await key('t');
    for (const [align, side, y] of [['center', 'center', 200], ['left', 'leftCenter', 450], ['right', 'rightCenter', 700]]) {
      await app((a) => { __jamdraw.S.text.align = a; }, align);
      await t.click(await t.V(500, y));
      await page.waitForSelector('#textdlg[open] textarea');
      await wait(300);
      const p = await app((side) => { const b = __jamdraw.S.sel[0].bounds[side]; return [b.x, b.y]; }, side);
      check(Math.hypot(p[0] - 500, p[1] - y) < 3, `${align} aligned text is anchored by its ${side} where you tap`);
      await page.click('#textdlg [data-tx="done"]');
    }
  });

  test('text: create, fonts, edit, cancel', async (t) => {
    const { check, P, key, app, combo, page, wait } = t;
    await key('t');
    await t.click(P(0.3, 0.15));
    await page.waitForSelector('#textdlg[open] textarea');
    await combo('Control', 'a');
    await page.keyboard.type('Jimmy Jam');
    await wait(400);
    const tx = await app(() => { const s = __jamdraw.S.sel[0]; return s && { text: s.data.text && s.data.text.text, kids: s.children.length, w: Math.round(s.bounds.width) }; });
    check(tx && tx.text === 'Jimmy Jam' && tx.kids > 5, 'the text tool makes live vector text ' + JSON.stringify(tx));
    const nFonts = await page.$$eval('#textdlg [data-font]', (b) => b.length);
    check(nFonts > 70, nFonts + ' fonts listed');
    await page.click('#textdlg [data-group="Fantasy"]');
    check(await page.$$eval('#textdlg [data-font]', (b) => b.length) < nFonts, 'a group filters the list');
    await page.click('#textdlg [data-font="cinzel-700"]');
    await wait(400);
    const tx2 = await app(() => { const s = __jamdraw.S.sel[0]; return { font: s.data.text.font, w: Math.round(s.bounds.width) }; });
    check(tx2.font === 'cinzel-700' && tx2.w !== tx.w, 'switching font re-lays the text ' + JSON.stringify(tx2));
    await wait(300);
    check(await page.$$eval('#textdlg [data-prev]', (els) => els.filter((e) => e.style.fontFamily.includes('jd-')).length) > 3, 'font previews are drawn in their own fonts');
    await page.click('#textdlg [data-tx="done"]');
    check(await app(() => !document.getElementById('textdlg').open), 'Done closes the text panel');
    check(await app(() => __jamdraw.S.text.font === 'cinzel-700'), 'the next text uses the last font');

    await key('v');
    const br = await t.V(...(await app(() => { const b = __jamdraw.S.sel[0].bounds.bottomRight; return [b.x, b.y]; })));
    await t.drag(br, [br[0] + 50, br[1] + 30]);
    const c = await t.V(...(await app(() => { const b = __jamdraw.S.sel[0].bounds.center; return [b.x, b.y]; })));
    await t.click(c);
    await t.click(c, [], { clickCount: 2 });
    await page.waitForSelector('#textdlg[open] textarea', { timeout: 3000 }).catch(() => {});
    check(await app(() => document.getElementById('textdlg').open), 'double-clicking a text opens it');
    await page.focus('#textdlg textarea');
    await page.keyboard.type('!!!');
    await wait(300);
    await key('Escape');
    await wait(300);
    check(await app(() => __jamdraw.S.sel[0].data.text.text === 'Jimmy Jam'), 'Esc cancels the edit');
    await t.button('#options', 'Text to shapes');
    check(await app(() => !__jamdraw.S.sel[0].data.text && __jamdraw.S.sel[0].children.length > 5), 'Text to shapes keeps the letters as plain shapes');
    const ok = await app(async () => {
      const m = await import('/js/text.js');
      const buf = await (await fetch('fonts/bangers-400.woff')).arrayBuffer();
      const e = await m.addUserFont(new File([buf], 'MyFont.woff'));
      return e.user && m.FONTS.includes(e);
    });
    check(ok, 'loading your own font file works');
  });

  test('text: settings, lines, alignment, search', async (t) => {
    const { check, P, key, app, page, wait, V } = t;
    await key('t');
    await t.click(await V(100, 100));
    await page.waitForSelector('#textdlg[open] textarea');
    await page.keyboard.type('Wide line here');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('A&<"b>');
    await wait(300);
    check(await app(() => __jamdraw.S.sel[0].data.text.text) === 'Wide line here\n\nA&<"b>', 'several lines, a blank one, and characters like & < " > are kept');
    check(await app(() => document.querySelector('#textdlg .tx-prev').textContent) === 'Wide line here', 'the font list previews the first line');
    const setK = (k, v, kind = 'input[type="range"]') => page.$eval(`#textdlg ${kind}[data-k="${k}"]`, (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); }, v);
    await setK('size', '60');
    await setK('spacing', '200', 'input[type="number"]');
    await setK('lineHeight', '2');
    await wait(300);
    check(await app(() => { const d = __jamdraw.S.sel[0].data.text; return d.size === 60 && d.spacing === 200 && d.lineHeight === 2; }), 'size, spacing and line height');
    check(await page.$eval('#textdlg input[type="range"][data-k="spacing"]', (el) => el.value) === '200', 'a number box moves its slider too');
    const right = () => app(() => Math.round(__jamdraw.S.sel[0].localToGlobal(new paper.Point(__jamdraw.S.sel[0].data.boxW, 0)).x));
    await page.click('#textdlg [data-align="right"]');
    await wait(300);
    const r0 = await right();
    await page.focus('#textdlg textarea');
    await page.keyboard.type(' longer');
    await wait(300);
    check(Math.abs((await right()) - r0) <= 1, 'right-aligned text stays anchored at its right edge as it grows');
    await page.click('#textdlg [data-align="left"]');
    await wait(200);
    const left0 = await app(() => Math.round(__jamdraw.S.sel[0].localToGlobal(new paper.Point(0, 0)).x));
    await page.focus('#textdlg textarea');
    await page.keyboard.type('!');
    await wait(200);
    check(await app(() => Math.round(__jamdraw.S.sel[0].localToGlobal(new paper.Point(0, 0)).x)) === left0, 'left-aligned text stays anchored at its left edge');
    await page.type('#textdlg .tx-search', 'cinz');
    check((await page.$$eval('#textdlg [data-font]', (b) => b.map((x) => x.textContent).join())).includes('Cinzel') && (await page.$$eval('#textdlg [data-font]', (b) => b.length)) === 3, 'search finds fonts by name');
    await page.type('#textdlg .tx-search', 'zzz');
    check(await page.$eval('#textdlg .tx-list', (el) => el.textContent.trim()) === 'No fonts match.', 'and says when nothing matches');
    await page.$eval('#textdlg .tx-search', (el) => { el.value = ''; el.dispatchEvent(new Event('input')); });
    await page.evaluate(() => document.querySelector('#textdlg .tx-note').click());
    await page.focus('#textdlg textarea');
    await t.combo('Control', 'Enter');
    await wait(200);
    check(await app(() => !document.getElementById('textdlg').open && __jamdraw.S.text.align === 'left' && __jamdraw.S.text.size === 60), 'Ctrl+Enter finishes and the settings are remembered for the next text');
    await key('v');
    await t.sel(0);
    await t.button('#options', 'Edit text');
    await page.waitForSelector('#textdlg[open] textarea');
    check((await page.$eval('#textdlg textarea', (el) => el.value)).endsWith('A&<"b> longer!'), 'reopening shows the text exactly, special characters and all');
    await page.click('#textdlg [data-tx="cancel"]');
  });

  test('text: open, cancel, empty, switching', async (t) => {
    const { check, key, app, page, wait, V, count } = t;
    await key('t');
    await t.click(await V(100, 100));
    await page.waitForSelector('#textdlg[open] textarea');
    await page.click('#textdlg [data-tx="cancel"]');
    await wait(200);
    check(await count() === 0, 'Cancel on a new text removes it');
    await t.click(await V(100, 100));
    await page.waitForSelector('#textdlg[open] textarea');
    await page.keyboard.press('Backspace');
    await page.click('#textdlg [data-tx="done"]');
    await wait(200);
    check(await count() === 0, 'Done on an empty new text removes it ' + JSON.stringify(await t.items()));
    await t.click(await V(100, 100));
    await page.waitForSelector('#textdlg[open] textarea');
    await page.click('#textdlg [data-tx="done"]');
    await wait(200);
    // Tapping the text with the text tool opens it; tapping elsewhere finishes it and starts another.
    const c = await app(() => { const b = __jamdraw.paper.project.activeLayer.firstChild.bounds.center; return [b.x, b.y]; });
    await t.click(await V(...c));
    await page.waitForSelector('#textdlg[open] textarea');
    check(await app(() => __jamdraw.S.sel[0] === __jamdraw.paper.project.activeLayer.firstChild), 'tapping a text with the text tool opens it');
    await t.click(await V(600, 600));
    await wait(400);
    check(await count() === 2 && await app(() => document.getElementById('textdlg').open), 'tapping elsewhere keeps the first and starts a new one');
    await key('Escape');
    await page.focus('#textdlg textarea');
    await key('Escape');
    await wait(200);
    // Edit an existing text down to nothing: it goes away (one undo step).
    await t.click(await V(...c));
    await page.waitForSelector('#textdlg[open] textarea');
    await page.$eval('#textdlg textarea', (el) => { el.value = '   '; el.dispatchEvent(new Event('input')); });
    await page.click('#textdlg [data-tx="done"]');
    await wait(200);
    check(await count() === 0, 'emptying an existing text removes it');
    await t.combo('Control', 'z');
    check(await count() === 1, 'and undo brings it back');
    // The Edit text button, and switching tools while editing.
    await key('v');
    await t.sel();
    await t.button('#options', 'Edit text');
    check(await t.toastText() === 'Select a text first', 'Edit text needs a text selected');
    await t.button('#options', 'Text to shapes');
    check(await t.toastText() === 'Select a text first', 'so does Text to shapes');
    await t.sel(0);
    await t.button('#options', 'Edit text');
    await page.waitForSelector('#textdlg[open] textarea');
    await key('b');
    await page.evaluate(() => document.activeElement.blur());
    await key('b');
    await wait(200);
    check(await app(() => !document.getElementById('textdlg').open && __jamdraw.S.tool === 'brush'), 'switching tools finishes the edit');
    // A text whose font is gone shows "Font" and still opens.
    await app(() => { __jamdraw.paper.project.activeLayer.firstChild.data.text.font = 'gone'; });
    await key('v');
    await t.sel(0);
    await t.button('#options', 'Edit text');
    await page.waitForSelector('#textdlg[open] textarea');
    check(await page.$eval('#textdlg .tx-font', (el) => el.textContent) === 'Font', 'a text whose font is gone still opens');
    await page.focus('#textdlg textarea');
    await page.keyboard.type('x');
    await wait(300);
    check(await t.toastText() === 'That font is not available here', 'and says so when it can not be re-laid');
    await page.click('#textdlg [data-tx="cancel"]');
    await wait(200);
  });

  test('text: fonts that fail, your own fonts', async (t) => {
    const { check, key, app, page, wait, V, OUT } = t;
    // A missing font file and a missing saved font.
    await app(async () => {
      const m = await import('/js/text.js');
      m.FONTS.push({ id: 'ghost', family: 'Ghost', weight: 400, group: 'Sans', file: 'ghost.woff', license: 'OFL-1.1' });
      m.FONTS.push({ id: 'lost', family: 'Lost', weight: 400, group: 'Yours', user: true });
    });
    await key('t');
    await t.click(await V(100, 100));
    await page.waitForSelector('#textdlg[open] textarea');
    await page.click('#textdlg [data-group="Sans"]');
    t.expectConsoleErrors(2);
    await page.$eval('#textdlg [data-font="ghost"]', (el) => el.scrollIntoView());
    await page.click('#textdlg [data-font="ghost"]');
    await wait(400);
    check(await t.toastText() === 'missing', 'a font file that is missing says so');
    await page.click('#textdlg [data-group="Yours"]');
    await page.click('#textdlg [data-font="lost"]');
    await wait(400);
    check(await t.toastText() === 'missing', 'a saved font that is gone says so');
    await page.click('#textdlg [data-group="All"]');
    // Load a font through the file picker, then a file that isn't a font.
    const woff = path.join(OUT, 'MyFont.woff');
    fs.copyFileSync(path.join(__dirname, '..', 'fonts', 'bangers-400.woff'), woff);
    let [chooser] = await Promise.all([page.waitForFileChooser(), page.click('#textdlg [data-tx="load"]')]);
    await chooser.accept([woff]);
    await wait(600);
    check((await t.toastText()).startsWith('Added Bangers'), 'Load a font file adds it and picks it');
    check(await app(() => __jamdraw.S.sel[0].data.text.font.startsWith('user-bangers')), '(the text now uses it)');
    const notFont = path.join(OUT, 'notafont.woff');
    fs.writeFileSync(notFont, 'hello');
    [chooser] = await Promise.all([page.waitForFileChooser(), page.click('#textdlg [data-tx="load"]')]);
    await chooser.accept([notFont]);
    await wait(400);
    check((await t.toastText()).startsWith('That font file could not be read'), 'a file that is not a font says so');
    await page.evaluate(() => { const f = document.getElementById('file'); f.value = ''; f.dispatchEvent(new Event('change')); });
    await page.click('#textdlg [data-tx="done"]');
    await wait(200);
    await t.wait(700);
    // Saved fonts come back after a reload.
    await t.reload();
    check(await app(async () => (await import('/js/text.js')).FONTS.some((f) => f.user && f.family.startsWith('Bangers'))), 'your fonts are still there after a reload');
    // Odd font name tables.
    const names = await app(async () => {
      const m = await import('/js/text.js');
      const real = opentype.parse;
      const out = [];
      for (const names of [{ fullName: { de: 'Schrift' } }, { fontFamily: { en: 'Fam' } }, undefined]) {
        opentype.parse = () => ({ names });
        out.push((await m.addUserFont(new File(['x'], 'From File.otf'))).family);
      }
      opentype.parse = real;
      return out.join(',');
    });
    check(names === 'Schrift,Fam,From File', 'font names fall back to any language, then the family, then the file name: ' + names);
    check(await app(async () => { const m = await import('/js/text.js'); return [m.fontLabel({ family: 'X', weight: 700 }), m.fontLabel({ family: 'X', weight: 450 }), m.fontLabel(undefined), m.fontLabel({ family: 'Y', weight: 700, user: true })].join(','); }) === 'X Bold,X 450,Font,Y', 'font labels name the weight');
    // Starting a text with a font that is gone.
    await app(() => { __jamdraw.S.text.font = 'gone'; });
    await key('t');
    await t.click(await V(500, 500));
    await wait(300);
    check(await t.toastText() === 'That font is not available here', 'a new text with a missing font says so');
  });

  test('text: other tools turn text into shapes', async (t) => {
    const { check, key, app, page, wait, V } = t;
    const makeText = async (x, y) => {
      await key('t');
      await t.click(await V(x, y));
      await page.waitForSelector('#textdlg[open] textarea');
      await page.keyboard.type('Jam');
      await wait(200);
      await page.click('#textdlg [data-tx="done"]');
      await wait(200);
      return app(() => { const b = __jamdraw.S.sel[0].bounds; return [b.center.x, b.center.y]; });
    };
    const a = await makeText(100, 100);
    await key('a');
    await t.click(await V(...a));
    check(await app(() => !__jamdraw.paper.project.activeLayer.firstChild.data.text), 'point editing a text turns it into shapes');
    const b = await makeText(100, 400);
    await key('e');
    await t.drag(await V(b[0] - 100, b[1]), await V(b[0] + 100, b[1]), 8);
    check(await app(() => !__jamdraw.paper.project.activeLayer.children[1].data.text), 'erasing a text turns it into shapes');
    const c = await makeText(100, 700);
    await key('v');
    await t.sel(-1);
    await t.button('#combine', 'Sticker outline');
    check(await app(() => !!__jamdraw.paper.project.activeLayer.lastChild.data.text), 'a sticker outline leaves the text editable');
    await t.add({ x: c[0] - 50, y: c[1] - 50, w: 100, h: 100 });
    await t.sel(-2, -1);
    await t.button('#combine', 'Unite');
    check(await t.toastText() === 'Text turned into shapes', 'combining a text turns it into shapes, and says so');
    await makeText(600, 100);
    await makeText(600, 300);
    await key('v');
    await t.sel(-2, -1);
    await t.button('#combine', 'Unite');
    check(await t.toastText() === '2 texts turned into shapes', 'several texts at once');
    void P;
  });
};
const fs = require('fs');
const path = require('path');
const P = null;
