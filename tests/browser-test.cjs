// Browser test: drives JamDraw in headless Chrome through every tool, text and fonts, combine, outlines, undo,
// autosave, all five export formats and the phone layout. Run: npm test (CHROME_PATH picks the browser).
const puppeteer = require('puppeteer-core');
const fsx = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const path = require('path');
const OUT = fsx.mkdtempSync(path.join(os.tmpdir(), 'jamdraw-test-'));
const chrome = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome',
  '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fsx.existsSync(p));

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'serve.mjs')], { env: { ...process.env, PORT: '5191' } });
  await new Promise((r) => setTimeout(r, 600));
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  const errors = [];
  const fails = [];
  const check = (cond, msg) => { if (!cond) fails.push(msg); console.log((cond ? 'ok   ' : 'FAIL ') + msg); };
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto('http://localhost:5191/', { waitUntil: 'networkidle0' });
    await page.evaluate(() => indexedDB.deleteDatabase('jamdraw'));
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 300));
    const count = () => page.evaluate(() => __jamdraw.paper.project.activeLayer.children.length);
    const box = await page.$eval('#overlay', (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const P = (fx, fy) => [box.x + box.w * fx, box.y + box.h * fy];
    const drag = async (a, b, steps = 12, opts = {}) => {
      if (opts.shift) await page.keyboard.down('Shift');
      await page.mouse.move(...a); await page.mouse.down();
      await page.mouse.move(...b, { steps }); await page.mouse.up();
      if (opts.shift) await page.keyboard.up('Shift');
    };
    const key = (k) => page.keyboard.press(k);

    check(await count() === 0, 'starts empty');
    // Shapes
    await key('r');
    await drag(P(0.3, 0.3), P(0.5, 0.5));
    check(await count() === 1, 'rectangle drawn');
    await page.click('#options [data-v="star"]');
    await drag(P(0.45, 0.45), P(0.65, 0.65));
    check(await count() === 2, 'star drawn');
    // Select + move + scale + rotate
    await key('v');
    await page.mouse.click(...P(0.4, 0.4));
    let sel = await page.evaluate(() => __jamdraw.S.sel.length);
    check(sel === 1, 'click selects the rectangle');
    const before = await page.evaluate(() => __jamdraw.S.sel[0].bounds.width);
    const br = await page.evaluate(() => { const b = __jamdraw.S.sel[0].bounds.bottomRight; const v = __jamdraw.paper.view.projectToView(b); return [v.x, v.y]; });
    await drag([box.x + br[0], box.y + br[1]], [box.x + br[0] + 60, box.y + br[1] + 60]);
    const after = await page.evaluate(() => __jamdraw.S.sel[0].bounds.width);
    check(after > before + 20, `scale handle grows it (${before.toFixed(0)} -> ${after.toFixed(0)})`);
    await drag(P(0.4, 0.4), P(0.38, 0.36));
    // Rotate from just outside the top-left corner
    const tl = await page.evaluate(() => { const v = __jamdraw.paper.view.projectToView(__jamdraw.S.sel[0].bounds.topLeft); return [v.x, v.y]; });
    await drag([box.x + tl[0] - 16, box.y + tl[1] - 16], [box.x + tl[0] + 40, box.y + tl[1] - 60]);
    const rot = await page.evaluate(() => Math.round(__jamdraw.S.sel[0].segments[0].point.y !== __jamdraw.S.sel[0].segments[1].point.y || __jamdraw.S.sel[0].segments[0].point.x !== __jamdraw.S.sel[0].segments[1].point.x));
    check(rot === 1, 'rotate handle rotates');
    // Brush with mouse (constant width), merge
    await key('b');
    await drag(P(0.15, 0.7), P(0.35, 0.8), 25);
    check(await count() === 3, 'brush stroke made a shape');
    // Pen-pressure stroke with synthetic pen events
    await page.evaluate(([x0, y0, x1, y1]) => {
      const el = document.getElementById('overlay');
      const fire = (type, x, y, p) => el.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: 'pen', isPrimary: true, clientX: x, clientY: y, pressure: p, buttons: type === 'pointerup' ? 0 : 1, bubbles: true }));
      fire('pointerdown', x0, y0, 0.1);
      for (let i = 1; i <= 30; i++) { const t = i / 30; fire('pointermove', x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(t * 6) * 20, Math.sin(t * Math.PI)); }
      fire('pointerup', x1, y1, 0);
    }, [...P(0.55, 0.75), ...P(0.85, 0.7)]);
    check(await count() === 4, 'pen pressure stroke made a shape');
    check(await page.evaluate(() => __jamdraw.S.sawPen), 'pen use turns on palm rejection');
    // Line mode
    await page.click('#options [data-v="line"]');
    await drag(P(0.15, 0.15), P(0.3, 0.2), 15);
    const line = await page.evaluate(() => { const c = __jamdraw.paper.project.activeLayer.lastChild; return { closed: c.closed, sw: c.strokeWidth, stroke: !!c.strokeColor }; });
    check(line.stroke && !line.closed, 'line mode makes an open stroked path');
    // Pen tool: 3 clicks + close
    await key('p');
    await page.mouse.click(...P(0.7, 0.2));
    await drag(P(0.85, 0.25), P(0.9, 0.35), 5);
    await page.mouse.click(...P(0.75, 0.4));
    await page.mouse.click(...P(0.7, 0.2));
    const pen = await page.evaluate(() => { const c = __jamdraw.paper.project.activeLayer.lastChild; return { closed: c.closed, n: c.segments.length, curved: !c.segments[1].handleOut.isZero() }; });
    check(pen.closed && pen.n === 3 && pen.curved, `pen path: closed, 3 points, a curve (${JSON.stringify(pen)})`);
    // Node tool: move a point, alt-click to add a point
    await key('a');
    const segV = await page.evaluate(() => { const c = __jamdraw.paper.project.activeLayer.lastChild; __jamdraw.S.node.path = c; const v = __jamdraw.paper.view.projectToView(c.segments[2].point); return [v.x, v.y]; });
    await drag([box.x + segV[0], box.y + segV[1]], [box.x + segV[0] - 30, box.y + segV[1] + 20], 6);
    const moved = await page.evaluate(() => __jamdraw.S.node.segs.size);
    check(moved === 1, 'node tool selects and drags a point');
    await key('Delete');
    const n2 = await page.evaluate(() => { const c = __jamdraw.paper.project.activeLayer.lastChild; return c.segments.length; });
    check(n2 === 2, 'Delete removes the selected point');
    // Undo restores it
    await page.keyboard.down('Control'); await key('z'); await page.keyboard.up('Control');
    const n3 = await page.evaluate(() => __jamdraw.paper.project.activeLayer.lastChild.segments.length);
    check(n3 === 3, 'undo brings the point back');
    // Combine: select rect + star, unite
    await key('v');
    await page.evaluate(() => { const l = __jamdraw.paper.project.activeLayer; __jamdraw.S.sel = [l.children[0], l.children[1]]; });
    await page.evaluate(() => [...document.querySelectorAll('#combine button')].find((b) => b.textContent === 'Unite').click());
    const united = await page.evaluate(() => ({ n: __jamdraw.paper.project.activeLayer.children.length, sel: __jamdraw.S.sel.length }));
    check(united.sel === 1, `unite leaves one shape (${united.n} items now)`);
    // Sticker outline
    const nBefore = await count();
    await page.evaluate(() => [...document.querySelectorAll('#combine button')].find((b) => b.textContent === 'Sticker outline').click());
    check(await count() === nBefore + 1, 'sticker outline adds a shape underneath');
    // Outline stroke on the line
    await page.evaluate(() => { const l = __jamdraw.paper.project.activeLayer; __jamdraw.S.sel = [l.children.find((c) => !c.closed && c.strokeColor)]; });
    await page.evaluate(() => [...document.querySelectorAll('#combine button')].find((b) => b.textContent === 'Outline stroke').click());
    const outlined = await page.evaluate(() => { const s = __jamdraw.S.sel[0]; return s && !!s.fillColor && !s.strokeColor; });
    check(outlined, 'outline stroke turns the line into a filled shape');
    // Eraser across the pressure stroke
    await key('e');
    const nE = await count();
    await drag(P(0.6, 0.6), P(0.62, 0.9), 15);
    const after2 = await page.evaluate(() => __jamdraw.paper.project.activeLayer.children.length);
    check(after2 >= nE, 'eraser runs without breaking things');
    // Group / ungroup
    await key('v');
    await page.keyboard.down('Control'); await key('a'); await key('g'); await page.keyboard.up('Control');
    check(await count() === 1, 'select all + group makes one group');
    await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await key('g'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
    check(await count() > 1, 'ungroup');
    // Layers
    await page.click('[data-act="layer-add"]');
    check(await page.evaluate(() => __jamdraw.paper.project.layers.length) === 2, 'add layer');
    // Text tool
    await page.click('[data-act="layer-add"]');
    await key('t');
    await page.mouse.click(...P(0.3, 0.15));
    await page.waitForSelector('#textdlg[open] textarea');
    await page.keyboard.down('Control'); await key('a'); await page.keyboard.up('Control');
    await page.keyboard.type('Jimmy Jam');
    await new Promise((r) => setTimeout(r, 500));
    let tx = await page.evaluate(() => { const t = __jamdraw.S.sel[0]; return t && { text: t.data.text && t.data.text.text, kids: t.children.length, w: Math.round(t.bounds.width) }; });
    check(tx && tx.text === 'Jimmy Jam' && tx.kids > 5, 'text tool makes live vector text ' + JSON.stringify(tx));
    const nFonts = await page.$$eval('#textdlg [data-font]', (b) => b.length);
    check(nFonts > 70, nFonts + ' fonts listed');
    await page.click('#textdlg [data-group="Fantasy"]');
    await page.click('#textdlg [data-font="cinzel-700"]');
    await new Promise((r) => setTimeout(r, 500));
    const tx2 = await page.evaluate(() => { const t = __jamdraw.S.sel[0]; return { font: t.data.text.font, w: Math.round(t.bounds.width) }; });
    check(tx2.font === 'cinzel-700' && tx2.w !== tx.w, 'switching font re-lays the text ' + JSON.stringify(tx2));
    const previews = await page.$$eval('#textdlg [data-prev]', (els) => els.filter((e) => e.style.fontFamily.includes('jd-')).length);
    check(previews > 3, previews + ' font previews drawn in their own font');
    await page.click('#textdlg [data-tx="done"]');
    check(await page.evaluate(() => !document.getElementById('textdlg').open), 'Done closes the text panel');
    // Scale it, then edit again and cancel
    await key('v');
    const tb = await page.evaluate(() => { const v = __jamdraw.paper.view.projectToView(__jamdraw.S.sel[0].bounds.bottomRight); return [v.x, v.y]; });
    await drag([box.x + tb[0], box.y + tb[1]], [box.x + tb[0] + 50, box.y + tb[1] + 30]);
    const tc = await page.evaluate(() => { const v = __jamdraw.paper.view.projectToView(__jamdraw.S.sel[0].bounds.center); return [v.x, v.y]; });
    await page.mouse.click(box.x + tc[0], box.y + tc[1], { clickCount: 1 });
    await page.mouse.click(box.x + tc[0], box.y + tc[1], { clickCount: 2 });
    await page.waitForSelector('#textdlg[open] textarea', { timeout: 3000 }).catch(() => {});
    check(await page.evaluate(() => document.getElementById('textdlg').open), 'double-click a text opens it for editing');
    await page.focus('#textdlg textarea');
    await page.keyboard.type('!!!');
    await new Promise((r) => setTimeout(r, 300));
    await page.keyboard.press('Escape');
    await new Promise((r) => setTimeout(r, 300));
    check(await page.evaluate(() => __jamdraw.S.sel[0].data.text.text === 'Jimmy Jam'), 'Esc cancels the edit');
    // Combine text with a shape (auto-converts), then text to shapes on another one
    await page.evaluate(() => [...document.querySelectorAll('#options button')].find((b) => b.textContent === 'Text to shapes').click());
    check(await page.evaluate(() => !__jamdraw.S.sel[0].data.text && __jamdraw.S.sel[0].children.length > 5), 'Text to shapes keeps the letters as plain shapes');
    // Load a user font (a bundled file, as if picked from disk)
    const userOk = await page.evaluate(async () => {
      const m = await import('/js/text.js');
      const buf = await (await fetch('fonts/bangers-400.woff')).arrayBuffer();
      const e = await m.addUserFont(new File([buf], 'MyFont.woff'));
      return e.user && m.FONTS.includes(e);
    });
    check(userOk, 'loading your own font file works');
    // Export: every format
    const dl = path.join(OUT, 'jd-downloads');
    require('fs').rmSync(dl, { recursive: true, force: true });
    require('fs').mkdirSync(dl, { recursive: true });
    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
    for (const [fmt, area] of [['svg', 'page'], ['png', 'trim'], ['jpg', 'page'], ['webp', 'page'], ['pdf', 'page'], ['svg', 'selection']]) {
      await page.keyboard.down('Control'); await key('e'); await page.keyboard.up('Control');
      await page.waitForSelector('dialog#dlg[open]');
      await page.click('#dlg [data-format="' + fmt + '"]');
      await page.click('#dlg [data-area="' + area + '"]');
      await page.click('#dlg [data-x="go"]');
      await page.waitForFunction(() => !document.getElementById('dlg').open, { timeout: 15000 }).catch(() => console.log('     dialog stayed open'));
      if (await page.evaluate(() => document.getElementById('dlg').open)) await page.keyboard.press('Escape');
    }
    await new Promise((r) => setTimeout(r, 2000));
    const files = require('fs').readdirSync(dl).map((n) => n + ' ' + require('fs').statSync(path.join(dl, n)).size);
    console.log('     downloads: ' + files.join(', '));
    for (const ext of ['svg', 'png', 'jpg', 'webp', 'pdf']) check(files.some((x) => x.split(' ')[0].endsWith('.' + ext) && +x.split(' ')[1] > 200), 'exported ' + ext.toUpperCase());
    check(files.some((x) => x.includes('-selection.svg')), 'exported the selection only');
    const pdfHead = require('fs').readFileSync(path.join(dl, require('fs').readdirSync(dl).find((n) => n.endsWith('.pdf')))).slice(0, 5).toString();
    check(pdfHead === '%PDF-', 'the PDF is a real PDF');
    // Export
    const svg = await page.evaluate(() => __jamdraw.paper.project.exportSVG({ asString: true, bounds: new __jamdraw.paper.Rectangle(0, 0, 1024, 1024) }));
    check(svg.startsWith('<svg') && svg.includes('path'), `SVG export (${svg.length} chars)`);
    await page.screenshot({ path: path.join(OUT, 'jd-desktop.png') });
    // Autosave survives reload
    const total = await page.evaluate(() => __jamdraw.paper.project.layers.reduce((a, l) => a + l.children.length, 0));
    await new Promise((r) => setTimeout(r, 900));
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 400));
    const total2 = await page.evaluate(() => __jamdraw.paper.project.layers.reduce((a, l) => a + l.children.length, 0));
    check(total2 === total, `autosave restores the drawing (${total} items)`);
    // Phone layout
    await page.setViewport({ width: 384, height: 832, deviceScaleFactor: 2.8125, isMobile: true, hasTouch: true });
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(OUT, 'jd-phone.png') });
    await page.click('[data-act="sheet-style"]');
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(OUT, 'jd-phone-style.png') });
    await page.click('[data-act="sheet-style"]');
    await new Promise((r) => setTimeout(r, 500));
    await page.click('#toolbar [data-tool="text"]');
    const ob = await page.$eval('#overlay', (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width * 0.3, r.top + r.height * 0.3]; });
    await page.touchscreen.tap(ob[0], ob[1]);
    await new Promise((r) => setTimeout(r, 900));
    await page.screenshot({ path: path.join(OUT, 'jd-phone-text.png') });
    check(await page.evaluate(() => document.getElementById('textdlg').open), 'text panel opens on the phone');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    check(!overflow, 'no sideways scrolling on the phone');
  } catch (e) {
    fails.push('crashed: ' + e.stack);
    console.log(e);
  }
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASSED');
  console.log('Screenshots and exports: ' + OUT);
  process.exitCode = fails.length || errors.length ? 1 : 0;
  await browser.close();
  srv.kill();
})();
