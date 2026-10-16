// JamDraw's test runner: starts the local server and headless Chrome, runs every suite in tests/suite-*.cjs (each from a
// fresh drawing), then reports code coverage for js/*.js, with the lines that never ran.
//   npm test                    run everything
//   npm test -- --only=text     only suites whose name contains "text"
//   npm test -- --min=100       fail if any file's coverage is under 100%
// CHROME_PATH picks the browser. Screenshots and exported files go to a temp folder (printed at the end).
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
const min = +((args.find((a) => a.startsWith('--min=')) || '').slice(6) || 0);
const PORT = 5191;
const ORIGIN = `http://localhost:${PORT}`;
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'jamdraw-test-'));
const chrome = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome',
  '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));

const suites = [];
const test = (name, fn) => suites.push({ name, fn });
for (const f of fs.readdirSync(__dirname).filter((n) => /^suite-.*\.cjs$/.test(n)).sort()) require(path.join(__dirname, f))(test);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  let srv = null;
  const startServer = async () => { srv = spawn(process.execPath, [path.join(__dirname, '..', 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) } }); await wait(600); };
  const stopServer = async () => { srv.kill(); await wait(300); };
  await startServer();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  const fails = [];
  let expectErrors = 0;
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    if (expectErrors > 0) { expectErrors--; return; }
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  page.on('dialog', (d) => (ctx.nextDialog === false ? d.dismiss() : d.accept(typeof ctx.nextDialog === 'string' ? ctx.nextDialog : undefined)));
  await page.setViewport({ width: 1280, height: 800 });
  // Lets a suite start the app with something broken (ctx.bootWith): storage blocked, the database failing...
  await page.evaluateOnNewDocument(() => {
    let f = {};
    try { f = JSON.parse(sessionStorage.getItem('jd-test-boot') || '{}'); } catch { /* none */ }
    const later = (fn) => setTimeout(fn, 5);
    if (f.brokenIdb) indexedDB.open = () => { const r = {}; later(() => { r.error = new Error('blocked'); r.onerror(); }); return r; };
    if (f.brokenTx) {
      indexedDB.open = () => {
        const r = {};
        later(() => {
          r.result = { transaction() {
            const t = { objectStore: () => ({
              put() { later(() => { t.error = new Error('full'); t.onerror(); }); },
              get() { const q = {}; later(() => { q.error = new Error('broken'); q.onerror(); }); return q; },
            }) };
            return t;
          } };
          r.onsuccess();
        });
        return r;
      };
    }
    if (f.noStorage) Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
    if (f.swFail) navigator.serviceWorker.register = () => Promise.reject(new Error('no'));
  });
  const dl = path.join(OUT, 'downloads');
  fs.mkdirSync(dl, { recursive: true });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dl });
  // Block coverage straight from V8. Chrome forgets a page's counts when it reloads, so snapshot before every reload.
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  const covered = {}; // file name -> Uint8Array of the bytes that ran
  async function snapCoverage() {
    const { result } = await cdp.send('Profiler.takePreciseCoverage');
    for (const sc of result) {
      const m = sc.url.match(/\/js\/([\w-]+\.js)$/);
      if (!m) continue;
      // V8 counts positions in UTF-16 characters, so measure the text, not the bytes on disk.
      const len = fs.readFileSync(path.join(__dirname, '..', 'js', m[1]), 'utf8').length;
      const mask = new Uint8Array(len);
      // Outer ranges first, inner ones after, so a block that never ran overwrites its function's count.
      const rs = sc.functions.flatMap((fn) => fn.ranges).sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
      for (const r of rs) mask.fill(r.count > 0 ? 1 : 0, r.startOffset, Math.min(r.endOffset, len));
      const acc = (covered[m[1]] ||= new Uint8Array(len));
      for (let i = 0; i < len; i++) if (mask[i]) acc[i] = 1;
    }
  }

  // ---------------------------------------------------------------- helpers every suite gets
  const ctx = {
    page, OUT, dl, wait, ORIGIN,
    nextDialog: true, // confirm()/prompt() answer: true = OK, false = Cancel, a string = prompt text
    check(cond, msg) { if (!cond) fails.push(`[${ctx.suite}] ${msg}`); console.log((cond ? '  ok   ' : '  FAIL ') + msg); },
    expectConsoleErrors(n) { expectErrors += n; },
    async fresh(viewport = { width: 1280, height: 800 }) {
      await page.setViewport(viewport);
      if (!page.url().startsWith(ORIGIN)) await page.goto(ORIGIN + '/', { waitUntil: 'networkidle0' });
      await page.evaluate(() => { sessionStorage.removeItem('jd-test-boot'); try { localStorage.clear(); } catch {} indexedDB.deleteDatabase('jamdraw'); });
      await snapCoverage();
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForFunction(() => window.__jamdraw && document.querySelector('#toolbar button'));
      await wait(150);
      ctx.box = await page.$eval('#overlay', (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
      ctx.nextDialog = true;
    },
    async reload() {
      await snapCoverage();
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForFunction(() => window.__jamdraw && document.querySelector('#toolbar button'));
      await wait(200);
    },
    snapCoverage,
    startServer, stopServer, // to test working offline for real
    // Reload with something broken (see the evaluateOnNewDocument hook above).
    async bootWith(flags) {
      await page.evaluate((f) => sessionStorage.setItem('jd-test-boot', JSON.stringify(f)), flags);
      await ctx.reload();
    },
    // Quick shapes on the active layer, in drawing coordinates: { x, y, w, h } rectangles, { kind: 'circle', x, y, r },
    // { kind: 'line', pts: [[x, y], ...] }; fill / stroke / width optional. Commits one undo step.
    add: (...specs) => page.evaluate(async (specs) => {
      const { paper } = window.__jamdraw;
      const l = paper.project.activeLayer;
      for (const s of specs) {
        const p = s.kind === 'circle' ? new paper.Path.Circle({ center: [s.x, s.y], radius: s.r })
          : s.kind === 'line' ? new paper.Path({ segments: s.pts })
          : new paper.Path.Rectangle({ point: [s.x, s.y], size: [s.w, s.h] });
        p.fillColor = s.fill === undefined ? (s.kind === 'line' ? null : '#d22a5a') : s.fill;
        p.strokeColor = s.stroke || null;
        p.strokeWidth = s.width || 0;
        l.addChild(p);
      }
      (await import('/js/history.js')).commit();
    }, specs),
    toastText: () => page.evaluate(() => document.getElementById('toast').textContent),
    // Bottom-to-top list of the active layer's items: class name and rounded bounds.
    items: () => page.evaluate(() => __jamdraw.paper.project.activeLayer.children.map((c) => ({
      type: c.className, x: Math.round(c.bounds.x), y: Math.round(c.bounds.y), w: Math.round(c.bounds.width), h: Math.round(c.bounds.height),
    }))),
    P(fx, fy) { const b = ctx.box; return [b.x + b.w * fx, b.y + b.h * fy]; },
    // Screen point of a drawing point.
    async V(x, y) { const v = await page.evaluate((x, y) => { const p = __jamdraw.paper.view.projectToView(new __jamdraw.paper.Point(x, y)); return [p.x, p.y]; }, x, y); return [ctx.box.x + v[0], ctx.box.y + v[1]]; },
    async drag(a, b, steps = 12, mods = []) {
      for (const m of mods) await page.keyboard.down(m);
      await page.mouse.move(...a); await page.mouse.down();
      await page.mouse.move(...b, { steps }); await page.mouse.up();
      for (const m of mods.slice().reverse()) await page.keyboard.up(m);
    },
    async click(a, mods = [], opts = {}) {
      for (const m of mods) await page.keyboard.down(m);
      await page.mouse.click(...a, opts);
      for (const m of mods.slice().reverse()) await page.keyboard.up(m);
    },
    key: (k) => page.keyboard.press(k),
    async combo(...keys) {
      const last = keys.pop();
      for (const k of keys) await page.keyboard.down(k);
      await page.keyboard.press(last);
      for (const k of keys.reverse()) await page.keyboard.up(k);
    },
    app: (fn, ...a) => page.evaluate(fn, ...a),
    count: () => page.evaluate(() => __jamdraw.paper.project.activeLayer.children.length),
    total: () => page.evaluate(() => __jamdraw.paper.project.layers.reduce((a, l) => a + l.children.length, 0)),
    // Click a button by its text inside a container.
    async button(sel, text) {
      const ok = await page.evaluate((sel, text) => {
        const b = [...document.querySelectorAll(sel + ' button')].find((x) => x.textContent.trim() === text);
        if (b) b.click();
        return !!b;
      }, sel, text);
      if (!ok) throw new Error(`no button "${text}" in ${sel}`);
      await wait(30);
    },
    act: (name, extra = '') => page.evaluate((name, extra) => document.querySelector(`[data-act="${name}"]${extra}`).click(), name, extra),
    // Select items by index in the active layer (bottom = 0).
    sel: (...idx) => page.evaluate((idx) => { const l = __jamdraw.paper.project.activeLayer; __jamdraw.setSel(idx.map((i) => l.children[i < 0 ? l.children.length + i : i])); }, idx),
    // Pen / touch events straight onto the canvas.
    async pointer(type, points, opts = {}) {
      await page.evaluate((type, points, opts) => {
        const el = document.getElementById('overlay');
        const base = { pointerId: opts.id || 7, pointerType: type, isPrimary: true, bubbles: true, button: opts.button ?? 0 };
        const fire = (t, [x, y, p = 0.5], buttons) => el.dispatchEvent(new PointerEvent(t, { ...base, clientX: x, clientY: y, pressure: p, buttons }));
        fire('pointerdown', points[0], opts.buttons ?? 1);
        for (const pt of points.slice(1, -1)) fire('pointermove', pt, opts.buttons ?? 1);
        if (!opts.noUp) fire(opts.cancel ? 'pointercancel' : 'pointerup', points[points.length - 1], 0);
      }, type, points, opts);
      await wait(30);
    },
    async files() { await wait(1200); return fs.readdirSync(dl).filter((n) => !n.endsWith('.crdownload')); },
    clearDownloads() { for (const n of fs.readdirSync(dl)) fs.rmSync(path.join(dl, n), { force: true }); },
  };

  for (const s of suites) {
    if (only && !s.name.includes(only)) continue;
    ctx.suite = s.name;
    console.log(`\n${s.name}`);
    try {
      await ctx.fresh();
      await s.fn(ctx);
    } catch (e) {
      fails.push(`[${s.name}] crashed: ${e.stack}`);
      console.log('  CRASH ' + e.stack);
      await page.screenshot({ path: path.join(OUT, `crash-${s.name.replace(/\W+/g, '-')}.png`) }).catch(() => {});
    }
  }

  // ---------------------------------------------------------------- coverage
  await snapCoverage();
  const files = {};
  for (const [name, used] of Object.entries(covered)) files[name] = { text: fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8'), used };
  const all = fs.readdirSync(path.join(__dirname, '..', 'js')).filter((n) => n.endsWith('.js'));
  console.log('\nCoverage (js/):');
  let worst = 100;
  const report = [];
  for (const name of all) {
    const f = files[name];
    if (!f) { console.log(`  ${name.padEnd(12)}   0.0%  (never loaded)`); worst = 0; continue; }
    // Count code characters only (not whitespace or comments) and list lines with code that never ran.
    const code = codeMask(f.text);
    let tot = 0, hit = 0;
    for (let i = 0; i < f.text.length; i++) if (code[i]) { tot++; if (f.used[i]) hit++; }
    const pct = tot ? (100 * hit) / tot : 100;
    worst = Math.min(worst, pct);
    const lines = [];
    let ln = 1, lineMiss = false;
    for (let i = 0; i <= f.text.length; i++) {
      if (i === f.text.length || f.text[i] === '\n') { if (lineMiss) lines.push(ln); ln++; lineMiss = false; continue; }
      if (code[i] && !f.used[i]) lineMiss = true;
    }
    console.log(`  ${name.padEnd(12)} ${pct.toFixed(1).padStart(5)}%` + (lines.length ? `  lines not run: ${ranges(lines)}` : ''));
    // With only a few gaps left, show exactly which code never ran.
    if (lines.length && lines.length <= 8) {
      let i = 0;
      while (i < f.text.length) {
        if (code[i] && !f.used[i]) {
          let j = i;
          while (j < f.text.length && !(code[j] && f.used[j])) j++;
          const ln = f.text.slice(0, i).split('\n').length;
          console.log(`      ${String(ln).padStart(4)}: ${f.text.slice(i, j).replace(/\s+/g, ' ').trim().slice(0, 110)}`);
          i = j;
        } else i++;
      }
    }
    report.push({ name, pct, lines });
  }
  fs.writeFileSync(path.join(OUT, 'coverage.json'), JSON.stringify(report, null, 1));

  console.log(errors.length ? '\nPAGE ERRORS:\n' + errors.join('\n') : '\nno page errors');
  if (min && worst < min) fails.push(`coverage under ${min}% (lowest ${worst.toFixed(1)}%)`);
  console.log(fails.length ? `${fails.length} FAILED:\n` + fails.map((f) => '  ' + f.split('\n')[0]).join('\n') : 'ALL PASSED');
  console.log('Screenshots, exports, coverage.json: ' + OUT);
  process.exitCode = fails.length || errors.length ? 1 : 0;
  await browser.close();
  srv.kill();
})();

// 1 for characters that are code (not whitespace, not inside comments).
function codeMask(t) {
  const m = new Uint8Array(t.length);
  let i = 0, str = null;
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (str) {
      m[i] = 1;
      if (c === '\\') { m[i + 1] = 1; i += 2; continue; }
      if (c === str) str = null;
      i++;
      continue;
    }
    if (c === '/' && n === '/') { while (i < t.length && t[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < t.length && !(t[i] === '*' && t[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') str = c;
    if (!/\s/.test(c)) m[i] = 1;
    i++;
  }
  return m;
}
function ranges(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let j = i;
    while (j + 1 < lines.length && lines[j + 1] === lines[j] + 1) j++;
    out.push(i === j ? `${lines[i]}` : `${lines[i]}-${lines[j]}`);
    i = j;
  }
  return out.join(', ');
}
