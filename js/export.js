// Export: SVG, PNG, JPG, WebP and PDF, of the whole page, just the selection, or the drawing trimmed to its edges,
// at any size, with or without a background. Settings are remembered between exports.
import { S, toast, zOrder, fileName } from './state.js';

const KEY = 'jamdraw.export';
const FORMATS = { svg: 'SVG', png: 'PNG', jpg: 'JPG', webp: 'WebP', pdf: 'PDF' };
const AREAS = { page: 'Whole page', trim: 'Trimmed to the drawing', selection: 'Selection only' };
let opts = { format: 'svg', area: 'page', width: 1024, bg: 'auto', bgColor: '#ffffff', pad: 0, quality: 92, precision: 2 };
try { Object.assign(opts, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* private window */ }
const remember = () => { try { localStorage.setItem(KEY, JSON.stringify(opts)); } catch { /* fine */ } };

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// The items to export, as clones (hidden layers and items left out).
function exportItems(area) {
  const src = area === 'selection' ? zOrder(S.sel) : paper.project.layers.filter((l) => l.visible).flatMap((l) => l.children.filter((c) => c.visible));
  const g = new paper.Group({ insert: false });
  for (const it of src) {
    const k = it.clone({ insert: false });
    k.opacity *= it.layer.opacity; // the layer's own opacity carries over
    g.addChild(k);
  }
  return g;
}
function areaRect(area, g, pad) {
  if (area === 'page') return new paper.Rectangle(0, 0, S.doc.w, S.doc.h);
  const b = g.children.length ? g.strokeBounds : new paper.Rectangle(0, 0, 1, 1);
  return b.expand(pad * 2);
}
const transparent = (o) => (o.bg === 'auto' ? S.doc.transparent : o.bg === 'none') && o.format !== 'jpg';

export function buildSVG(o = opts) {
  if (o.area === 'selection' && !S.sel.length) throw new Error('Select something to export, or pick another area');
  const g = exportItems(o.area);
  const r = areaRect(o.area, g, +o.pad || 0);
  const node = g.exportSVG({ asString: false, precision: +o.precision || 2 });
  const body = new XMLSerializer().serializeToString(node).replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, '')
    // Paper writes placeholder attributes on groups (stroke-width="none", font-size="none"...). They aren't valid
    // SVG, add nothing, and stroke-width="none" breaks PDF conversion.
    .replace(/ (stroke-width|stroke-linecap|stroke-linejoin|font-family|font-weight|font-size|text-anchor)="none"/g, '')
    .replace(/ stroke-dasharray=""/g, '')
    .replace(/ (mix-blend-mode="normal"|style="mix-blend-mode: normal")/g, '');
  const n = (v) => +v.toFixed(3);
  const bg = transparent(o) ? '' : `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}" fill="${o.bg === 'color' ? o.bgColor : '#ffffff'}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${n(r.width)}" height="${n(r.height)}" viewBox="${n(r.x)} ${n(r.y)} ${n(r.width)} ${n(r.height)}">`
    + `${o.format === 'pdf' ? '' : `<title>${S.doc.name.replace(/[<&]/g, '')}</title>`}${bg}${body}</svg>`;
  return { svg, w: r.width, h: r.height };
}

function rasterize({ svg, w, h }, width, type, quality, fill) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(width));
      c.height = Math.max(1, Math.round((width * h) / w));
      const ctx = c.getContext('2d');
      if (fill) { ctx.fillStyle = fill; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? res(b) : rej(new Error('That image is too big for this browser'))), type, quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Export failed')); };
    img.src = url;
  });
}

let pdfLibs = null;
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = res;
    s.onerror = () => rej(new Error('Could not load the PDF tools'));
    document.head.appendChild(s);
  });
}
async function pdfBlob({ svg, w, h }) {
  // If loading fails (offline before they were cached), forget it so the next try loads them again.
  pdfLibs ||= loadScript('vendor/jspdf.umd.min.js').then(() => loadScript('vendor/svg2pdf.umd.min.js')).catch((e) => { pdfLibs = null; throw e; });
  await pdfLibs;
  const el = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-99999px;top:0';
  holder.appendChild(document.importNode(el, true));
  document.body.appendChild(holder);
  try {
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: [w, h], orientation: w > h ? 'landscape' : 'portrait', compress: true });
    doc.setProperties({ title: S.doc.name, creator: 'JamDraw' });
    await doc.svg(holder.firstChild, { x: 0, y: 0, width: w, height: h });
    return doc.output('blob');
  } finally {
    holder.remove();
  }
}

export async function runExport(o = opts) {
  const built = buildSVG(o);
  const name = fileName() + (o.area === 'selection' ? '-selection' : '');
  if (o.format === 'svg') return download(name + '.svg', new Blob([built.svg], { type: 'image/svg+xml' }));
  // Saved as a plain download: Chrome would otherwise open a PDF in its viewer instead of saving it.
  if (o.format === 'pdf') return download(name + '.pdf', new Blob([await pdfBlob(built)], { type: 'application/octet-stream' }));
  const type = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[o.format];
  const fill = o.format === 'jpg' && transparent({ ...o, format: 'png' }) ? '#ffffff' : null;
  const blob = await rasterize(built, +o.width || 1024, type, (+o.quality || 92) / 100, fill);
  download(`${name}-${Math.round(+o.width)}.${o.format}`, blob);
}

// Quick menu entries reuse the dialog's other settings.
export function quickExport(format, width) {
  runExport({ ...opts, format, width: width || opts.width, area: 'page' }).catch((e) => toast(e.message));
}

export function exportDialog() {
  const d = document.getElementById('dlg'), f = document.getElementById('dlg-body');
  if (opts.area === 'selection' && !S.sel.length) opts.area = 'page';
  const radio = (name, map) => Object.entries(map).map(([v, l]) => `<button type="button" class="txt${opts[name] === v ? ' on' : ''}" data-${name}="${v}">${l}</button>`).join('');
  f.innerHTML = `<h3 style="margin-top:0">Export</h3>
    <div class="btns" data-group="format">${radio('format', FORMATS)}</div>
    <h2>What</h2><div class="btns" data-group="area">${radio('area', AREAS)}</div>
    <label class="row ex-pad">Padding <input type="number" name="pad" min="0" max="2000" value="${opts.pad}"> px around it</label>
    <div class="ex-raster">
      <h2>Size</h2>
      <label class="row">Width <input type="number" name="width" min="16" max="16384" value="${opts.width}"> px <span class="ex-dims"></span></label>
      <div class="btns">${[256, 512, 1024, 2048, 4096].map((w) => `<button type="button" class="txt" data-w="${w}">${w}</button>`).join('')}</div>
      <label class="row ex-q">Quality <input type="range" name="quality" min="40" max="100" value="${opts.quality}"><span class="ex-qv">${opts.quality}</span></label>
    </div>
    <div class="ex-bg"><h2>Background</h2>
      <div class="btns">${radio('bg', { auto: 'Same as page', none: 'Transparent', white: 'White', color: 'Color' })}</div>
      <label class="row ex-bgc">Color <input type="color" name="bgColor" value="${opts.bgColor}"></label></div>
    <div class="ex-svg"><h2>SVG detail</h2><label class="row">Decimals <input type="number" name="precision" min="0" max="5" value="${opts.precision}"> (fewer = smaller file)</label></div>
    <p class="ex-info tx-note"></p>
    <menu><button type="button" class="txt" data-x="copy">Copy SVG</button><button value="cancel">Close</button><button type="button" class="on" data-x="go">Export</button></menu>`;
  const sync = () => {
    const raster = ['png', 'jpg', 'webp'].includes(opts.format);
    f.querySelector('.ex-raster').hidden = !raster;
    f.querySelector('.ex-q').hidden = opts.format === 'png';
    f.querySelector('.ex-pad').hidden = opts.area === 'page';
    f.querySelector('.ex-bgc').hidden = opts.bg !== 'color';
    f.querySelector('.ex-svg').hidden = opts.format !== 'svg';
    f.querySelector('[data-x="copy"]').hidden = opts.format !== 'svg';
    f.querySelector('.ex-bg').querySelector('[data-bg="none"]').disabled = opts.format === 'jpg';
    let info = '';
    try {
      const b = buildSVG(opts);
      const h = Math.round((opts.width * b.h) / b.w);
      f.querySelector('.ex-dims').textContent = `× ${h}`;
      info = raster ? `${Math.round(opts.width)} × ${h} pixels` : `${Math.round(b.w)} × ${Math.round(b.h)} (vector, sharp at any size)`;
      if (opts.format === 'svg') info += ` · about ${Math.max(1, Math.round(b.svg.length / 1024))} KB`;
    } catch (e) { info = e.message; }
    if (opts.format === 'jpg') info += ' · JPG has no transparency';
    f.querySelector('.ex-info').textContent = info;
  };
  f.onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    for (const k of ['format', 'area', 'bg']) {
      if (b.dataset[k]) {
        opts[k] = b.dataset[k];
        f.querySelectorAll(`[data-${k}]`).forEach((x) => x.classList.toggle('on', x === b));
      }
    }
    if (b.dataset.w) { opts.width = +b.dataset.w; f.width.value = b.dataset.w; }
    if (b.dataset.x === 'go') {
      const token = (d.jdToken = {});
      b.disabled = true;
      b.textContent = 'Exporting…';
      try {
        await runExport(opts);
        remember();
        if (d.jdToken === token) d.close(); // only close the dialog this export came from
      } catch (err) { toast(err.message); }
      b.disabled = false;
      b.textContent = 'Export';
      return;
    }
    if (b.dataset.x === 'copy') {
      try { await navigator.clipboard.writeText(buildSVG(opts).svg); toast('SVG code copied'); } catch { toast('Copying is blocked here; use Export instead'); }
      return;
    }
    sync();
  };
  f.oninput = (e) => {
    const t = e.target; // every input in the dialog has a name
    opts[t.name] = t.type === 'number' || t.type === 'range' ? +t.value : t.value;
    if (t.name === 'quality') f.querySelector('.ex-qv').textContent = t.value;
    sync();
  };
  d.onclose = () => remember();
  d.jdToken = null;
  sync();
  d.showModal();
}
