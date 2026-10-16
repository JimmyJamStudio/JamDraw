// The text panel: type, pick a font from the library (or load your own), size, spacing, line height, alignment.
// Changes show live on the page; Done keeps them, Cancel puts things back.
import { S, on, toast, setStyle } from './state.js';
import { commit } from './history.js';
import { setSelection } from './tools.js';
import { FONTS, GROUPS, fontById, fontLabel, previewFamily, addUserFont, makeText, setTextData, defaultText } from './text.js';
import { redrawOverlay } from './view.js';

const dlg = document.getElementById('textdlg');
let session = null; // { item, props, isNew, oldProps, oldMatrix }
let group = 'All';
let query = '';
let busy = Promise.resolve();

function schedule() {
  const s = session;
  if (!s) return;
  busy = busy.then(() => setTextData(s.item, s.props)).catch((e) => toast(e.message)).then(redrawOverlay);
}

async function open({ item, at, layer }) {
  if (session) await finish(true);
  let isNew = false;
  if (!item) {
    const props = defaultText();
    try { item = await makeText(props); } catch (e) { toast(e.message); return; }
    setStyle(item, { fill: S.fill || S.stroke || '#1d1418', stroke: null, width: 0 });
    layer.addChild(item);
    item.translate(at.subtract(item.bounds.topLeft));
    isNew = true;
  }
  session = { item, isNew, props: { ...item.data.text }, oldProps: { ...item.data.text }, oldMatrix: item.matrix.clone() };
  setSelection([item]);
  render();
  dlg.show();
  const ta = dlg.querySelector('textarea');
  ta.focus();
  if (isNew) ta.select();
}

async function finish(keep) {
  const s = session;
  if (!s) return;
  session = null;
  dlg.close();
  await busy;
  if (!keep) {
    if (s.isNew) { s.item.remove(); setSelection([]); }
    else { await setTextData(s.item, s.oldProps); s.item.matrix = s.oldMatrix; }
    redrawOverlay();
    return;
  }
  if (!s.props.text.trim()) {
    s.item.remove();
    setSelection([]);
    if (!s.isNew) commit();
    return;
  }
  const { font, size, spacing, lineHeight, align } = s.props;
  Object.assign(S.text, { font, size, spacing, lineHeight, align });
  commit();
  setSelection([s.item]);
}

function render() {
  const p = session.props;
  dlg.innerHTML = `
    <div class="tx-head"><b>Text</b><span class="tx-font">${esc(fontLabel(fontById(p.font)))}</span></div>
    <textarea rows="3" spellcheck="false">${esc(p.text)}</textarea>
    <label class="row">Size <input type="range" data-k="size" min="8" max="600" step="1" value="${p.size}"><input type="number" data-k="size" min="1" max="4000" value="${p.size}"></label>
    <label class="row">Spacing <input type="range" data-k="spacing" min="-150" max="800" step="5" value="${p.spacing}"><input type="number" data-k="spacing" step="5" value="${p.spacing}"></label>
    <label class="row">Lines <input type="range" data-k="lineHeight" min="0.6" max="2.5" step="0.05" value="${p.lineHeight}"><input type="number" data-k="lineHeight" step="0.05" value="${p.lineHeight}"></label>
    <div class="btns tx-align">${['left', 'center', 'right'].map((a) => `<button type="button" class="txt${p.align === a ? ' on' : ''}" data-align="${a}">${a[0].toUpperCase() + a.slice(1)}</button>`).join('')}</div>
    <h2>Font</h2>
    <input type="search" class="tx-search" placeholder="Search ${FONTS.length} fonts" value="${esc(query)}">
    <div class="tx-groups btns">${['All', ...GROUPS.filter((g) => FONTS.some((f) => f.group === g))].map((g) => `<button type="button" class="txt${g === group ? ' on' : ''}" data-group="${g}">${g}</button>`).join('')}</div>
    <div class="tx-list"></div>
    <div class="btns tx-foot">
      <button type="button" class="txt" data-tx="load">Load a font file…</button>
      <button type="button" class="txt" data-tx="cancel">Cancel</button>
      <button type="button" class="txt on" data-tx="done">Done</button>
    </div>
    <p class="tx-note">Every bundled font is free to use, commercial work and logos included (OFL or Apache). Fonts you load stay in this browser.</p>`;
  renderList();
  const ta = dlg.querySelector('textarea');
  ta.oninput = () => { session.props.text = ta.value; schedule(); };
  ta.onkeydown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
  };
  dlg.querySelectorAll('[data-k]').forEach((inp) => {
    inp.oninput = () => {
      const k = inp.dataset.k;
      session.props[k] = +inp.value;
      dlg.querySelectorAll(`[data-k="${k}"]`).forEach((o) => { if (o !== inp) o.value = inp.value; });
      schedule();
    };
  });
  dlg.querySelector('.tx-search').oninput = (e) => { query = e.target.value; renderList(); };
  dlg.onclick = async (e) => {
    const a = e.target.closest('[data-align]');
    if (a) {
      session.props.align = a.dataset.align;
      dlg.querySelectorAll('[data-align]').forEach((b) => b.classList.toggle('on', b === a));
      schedule();
      return;
    }
    const g = e.target.closest('[data-group]');
    if (g) {
      group = g.dataset.group;
      dlg.querySelectorAll('[data-group]').forEach((b) => b.classList.toggle('on', b === g));
      renderList();
      return;
    }
    const f = e.target.closest('[data-font]');
    if (f) {
      session.props.font = f.dataset.font;
      dlg.querySelector('.tx-font').textContent = fontLabel(fontById(f.dataset.font));
      dlg.querySelectorAll('[data-font]').forEach((b) => b.classList.toggle('on', b === f));
      schedule();
      return;
    }
    const t = e.target.closest('[data-tx]');
    if (!t) return;
    if (t.dataset.tx === 'done') finish(true);
    else if (t.dataset.tx === 'cancel') finish(false);
    else if (t.dataset.tx === 'load') loadFont();
  };
}

function renderList() {
  const box = dlg.querySelector('.tx-list');
  const q = query.trim().toLowerCase();
  const list = FONTS.filter((f) => (group === 'All' || f.group === group) && (!q || fontLabel(f).toLowerCase().includes(q)));
  const sample = (session && session.props.text.split('\n')[0].trim().slice(0, 18)) || 'Jimmy Jam';
  box.innerHTML = list.length ? list.map((f) => `<button type="button" data-font="${f.id}" class="${session && f.id === session.props.font ? 'on' : ''}">
      <span class="tx-prev" data-prev="${f.id}">${esc(sample)}</span><small>${esc(fontLabel(f))}</small></button>`).join('')
    : '<p class="tx-note">No fonts match.</p>';
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const el = en.target;
      el.style.fontFamily = previewFamily(fontById(el.dataset.prev)) + ', system-ui';
      io.unobserve(el);
    }
  }, { root: box });
  box.querySelectorAll('[data-prev]').forEach((el) => io.observe(el));
}

function loadFont() {
  const f = document.getElementById('file');
  f.value = '';
  f.accept = '.ttf,.otf,.woff,font/ttf,font/otf,font/woff';
  f.onchange = async () => {
    if (!f.files[0]) return;
    try {
      const entry = await addUserFont(f.files[0]);
      session.props.font = entry.id;
      group = 'Yours';
      render();
      schedule();
      toast(`Added ${entry.family}. Check its license before using it commercially.`);
    } catch (e) { toast(e.message); }
  };
  f.click();
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function initTextUI() {
  on('edit-text', (x) => open(x));
  on('tool', () => { if (session) finish(true); });
}
export const textEditing = () => !!session;
