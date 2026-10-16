// Export: every format and area, checking the files that land, then the dialog's options and everything that can go
// wrong (nothing selected, an empty drawing, a browser that refuses, the PDF tools not loading, copying blocked).
const fs = require('fs');
const path = require('path');

module.exports = (test) => {
  const openExport = async (t) => {
    await t.combo('Control', 'e');
    await t.page.waitForSelector('dialog#dlg[open]');
  };
  const go = async (t) => {
    await t.page.click('#dlg [data-x="go"]');
    await t.page.waitForFunction(() => !document.getElementById('dlg').open, { timeout: 15000 }).catch(() => {});
  };

  test('export: every format', async (t) => {
    const { check, P, key, drag, page } = t;
    await key('r');
    await drag(P(0.3, 0.3), P(0.6, 0.6));
    await key('v');
    await t.click(P(0.45, 0.45));
    t.clearDownloads();
    for (const [fmt, area] of [['svg', 'page'], ['png', 'trim'], ['jpg', 'page'], ['webp', 'page'], ['pdf', 'page'], ['svg', 'selection']]) {
      await openExport(t);
      await page.click(`#dlg [data-format="${fmt}"]`);
      await page.click(`#dlg [data-area="${area}"]`);
      await go(t);
    }
    const files = await t.files();
    const size = (n) => fs.statSync(path.join(t.dl, n)).size;
    for (const ext of ['svg', 'png', 'jpg', 'webp', 'pdf']) check(files.some((n) => n.endsWith('.' + ext) && size(n) > 200), 'exported ' + ext.toUpperCase());
    check(files.some((n) => n.includes('-selection.svg')), 'exported the selection only');
    const pdf = files.find((n) => n.endsWith('.pdf'));
    check(pdf && fs.readFileSync(path.join(t.dl, pdf)).slice(0, 5).toString() === '%PDF-', 'the PDF is a real PDF');
  });

  test('export: options', async (t) => {
    const { check, app, page, add } = t;
    await add({ x: 100, y: 100, w: 200, h: 100 });
    await app(() => { __jamdraw.paper.project.activeLayer.opacity = 0.5; });
    t.clearDownloads();
    // SVG: background choices, decimals, padding on a trimmed export.
    await openExport(t);
    await page.click('#dlg [data-format="svg"]');
    await page.click('#dlg [data-area="trim"]');
    await page.$eval('#dlg input[name="pad"]', (el) => { el.value = '10'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.click('#dlg [data-bg="color"]');
    await page.$eval('#dlg input[name="bgColor"]', (el) => { el.value = '#00ff00'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.$eval('#dlg input[name="precision"]', (el) => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    check((await page.$eval('#dlg .ex-info', (el) => el.textContent)).startsWith('220 × 120 (vector'), 'the dialog shows the size of what it will export');
    await page.evaluate(() => document.querySelector('#dlg h2').click());
    await go(t);
    let files = await t.files();
    const svg = fs.readFileSync(path.join(t.dl, files.find((n) => n.endsWith('.svg'))), 'utf8');
    check(svg.includes('viewBox="90 90 220 120"') && svg.includes('fill="#00ff00"'), 'trimmed with padding, on a colored background');
    check(svg.includes('opacity="0.5"'), 'a layer\'s opacity carries over');
    check(!/stroke-width="none"|font-size="none"/.test(svg), 'no invalid placeholder attributes');
    // Settings are remembered.
    await openExport(t);
    check(await page.$eval('#dlg [data-area="trim"]', (el) => el.classList.contains('on')), 'the dialog remembers the last settings');
    // PNG at a preset width, transparent; the quality slider only shows for JPG / WebP.
    await page.click('#dlg [data-format="png"]');
    await page.click('#dlg [data-bg="none"]');
    await page.click('#dlg [data-w="256"]');
    check(await page.$eval('#dlg .ex-q', (el) => el.hidden), 'PNG has no quality setting');
    await go(t);
    files = await t.files();
    check(files.includes('Untitled-256.png'), 'a 256 px PNG');
    // JPG on a transparent page gets a white background; a blank width means 1024.
    await app(() => { __jamdraw.S.doc.transparent = true; });
    await openExport(t);
    await page.click('#dlg [data-format="jpg"]');
    check(await page.$eval('#dlg [data-bg="none"]', (el) => el.disabled), 'JPG can not be transparent');
    await page.click('#dlg [data-bg="auto"]');
    await page.$eval('#dlg input[name="quality"]', (el) => { el.value = '50'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    check(await page.$eval('#dlg .ex-qv', (el) => el.textContent) === '50', 'the quality slider shows its value');
    await page.$eval('#dlg input[name="width"]', (el) => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await go(t);
    files = await t.files();
    check(files.some((n) => n.endsWith('.jpg')), 'a JPG with a blank width still exports (at 1024)');
    // Quick exports from the File menu.
    t.clearDownloads();
    await t.act('export-svg');
    await t.act('export-png', '[data-size="1024"]');
    files = await t.files();
    check(files.includes('Untitled.svg') && files.includes('Untitled-1024.png'), 'File › Quick export SVG and PNG');
    await t.act('export');
    check(await app(() => document.getElementById('dlg').open), 'File › Export opens the dialog');
    await page.click('#dlg button[value="cancel"]');
  });

  test('export: when things go wrong', async (t) => {
    const { check, app, page, add } = t;
    // Selection only with nothing selected.
    await openExport(t);
    await page.click('#dlg [data-area="selection"]');
    check(await page.$eval('#dlg .ex-info', (el) => el.textContent) === 'Select something to export, or pick another area', 'Selection only with nothing selected says so');
    await page.click('#dlg [data-x="go"]');
    await t.wait(200);
    check(await t.toastText() === 'Select something to export, or pick another area', 'and Export says it too');
    await page.click('#dlg button[value="cancel"]');
    await openExport(t);
    check(await page.$eval('#dlg [data-area="page"]', (el) => el.classList.contains('on')), 'next time it falls back to the whole page');
    // Trimmed export of an empty drawing.
    await page.click('#dlg [data-area="trim"]');
    await page.click('#dlg [data-format="svg"]');
    check((await page.$eval('#dlg .ex-info', (el) => el.textContent)).startsWith('1 × 1'), 'a trimmed empty drawing is a 1 × 1 image');
    await page.click('#dlg button[value="cancel"]');
    await add({ x: 100, y: 100, w: 200, h: 100 });
    // Copy SVG: allowed, then blocked.
    const ctx = page.browserContext();
    await ctx.overridePermissions(t.ORIGIN, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
    await openExport(t);
    await page.click('#dlg [data-format="svg"]');
    await page.click('#dlg [data-x="copy"]');
    await t.wait(200);
    check(await t.toastText() === 'SVG code copied', 'Copy SVG copies the code');
    check((await app(() => navigator.clipboard.readText())).startsWith('<svg'), '(it really is in the clipboard)');
    await app(() => { window.__wt = navigator.clipboard.writeText; navigator.clipboard.writeText = () => Promise.reject(new Error('blocked')); });
    await page.click('#dlg [data-x="copy"]');
    await t.wait(200);
    await app(() => { navigator.clipboard.writeText = window.__wt; });
    check(await t.toastText() === 'Copying is blocked here; use Export instead', 'blocked copying says so');
    // The browser refuses to make the image (too big), or can't load it.
    await page.click('#dlg [data-format="png"]');
    await app(() => { window.__tb = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = function (cb) { cb(null); }; });
    await page.click('#dlg [data-x="go"]');
    await t.wait(400);
    await app(() => { HTMLCanvasElement.prototype.toBlob = window.__tb; });
    check(await t.toastText() === 'That image is too big for this browser', 'an image too big for the browser says so');
    check(await app(() => document.getElementById('dlg').open && document.querySelector('#dlg [data-x="go"]').textContent === 'Export'), 'the dialog stays open and the button comes back');
    await page.click('#dlg button[value="cancel"]');
    t.expectConsoleErrors(1); // the browser complains about the broken image address
    await app(() => { window.__cu = URL.createObjectURL; URL.createObjectURL = () => 'blob:broken'; });
    await t.act('export-png', '[data-size="1024"]');
    await t.wait(400);
    await app(() => { URL.createObjectURL = window.__cu; });
    check(await t.toastText() === 'Export failed', 'a quick export that fails says so');
    // The PDF tools fail to load once (offline), then load fine.
    // Past the offline cache, which would otherwise serve the files anyway.
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    const block = (req) => (req.url().includes('jspdf') ? req.abort() : req.continue());
    page.on('request', block);
    t.expectConsoleErrors(1);
    await openExport(t);
    await page.click('#dlg [data-format="pdf"]');
    await page.click('#dlg [data-x="go"]');
    await t.wait(600);
    check(await t.toastText() === 'Could not load the PDF tools', 'PDF tools that will not load say so');
    page.off('request', block);
    await page.setRequestInterception(false);
    await page.setBypassServiceWorker(false);
    t.clearDownloads();
    await go(t);
    check((await t.files()).some((n) => n.endsWith('.pdf')), 'and the next try loads them and exports');
    // A wide drawing makes a landscape PDF.
    await app(() => Object.assign(__jamdraw.S.doc, { w: 1600, h: 900 }));
    t.clearDownloads();
    await openExport(t);
    await go(t);
    check((await t.files()).some((n) => n.endsWith('.pdf')), 'a landscape PDF');
  });
};
