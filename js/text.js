// Text: words become real vector shapes (opentype.js reads the font, Paper.js holds the outlines), so they export
// cleanly anywhere. A text item stays editable (font, size, spacing...) until it's turned into plain shapes.
import { S, toast } from './state.js';
import { kvGet, kvPut } from './store.js';

export let FONTS = [];
const parsed = new Map();   // id -> opentype.Font
const faces = new Map();    // id -> FontFace promise (for previews in the menus)

export const GROUPS = ['Bubbly', 'Display', 'Handwritten', 'Spooky', 'Fantasy', 'Sans', 'Serif', 'Yours'];
export const fontLabel = (f) => (f ? f.family + (f.weight !== 400 && !f.user ? ` ${weightName(f.weight)}` : '') : 'Font');
function weightName(w) {
  return { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' }[w] || w;
}
export const fontById = (id) => FONTS.find((f) => f.id === id);

export async function loadFontList() {
  try { FONTS = await (await fetch('fonts/fonts.json')).json(); } catch { FONTS = []; }
  try {
    const mine = await kvGet('userfonts');
    if (Array.isArray(mine)) FONTS.push(...mine);
  } catch { /* no saved fonts */ }
}

async function fontBuffer(f) {
  if (f.user) {
    const buf = await kvGet('font:' + f.id);
    if (!buf) throw new Error('missing');
    return buf;
  }
  const res = await fetch('fonts/' + f.file);
  if (!res.ok) throw new Error('missing');
  return res.arrayBuffer();
}

export async function getFont(id) {
  if (parsed.has(id)) return parsed.get(id);
  const f = fontById(id);
  if (!f) throw new Error('That font is not available here');
  const font = opentype.parse(await fontBuffer(f));
  parsed.set(id, font);
  return font;
}

// A CSS face so the font list can show each name in its own font.
export function previewFamily(f) {
  if (!faces.has(f.id)) {
    const p = fontBuffer(f).then((buf) => {
      const face = new FontFace('jd-' + f.id, buf);
      document.fonts.add(face);
      return face.load();
    }).catch(() => null);
    faces.set(f.id, p);
  }
  return `'jd-${f.id}'`;
}

export async function addUserFont(file) {
  const buf = await file.arrayBuffer();
  let font;
  try { font = opentype.parse(buf); } catch {
    throw new Error('That font file could not be read (TTF, OTF and WOFF work; WOFF2 does not)');
  }
  const names = font.names || {};
  const pick = (n) => (n && (n.en || Object.values(n)[0])) || '';
  const family = (pick(names.fullName) || pick(names.fontFamily) || file.name.replace(/\.\w+$/, '')).trim();
  const id = 'user-' + family.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);
  await kvPut('font:' + id, buf);
  const entry = { id, family, weight: 400, group: 'Yours', user: true, license: 'Yours' };
  FONTS.push(entry);
  await kvPut('userfonts', FONTS.filter((f) => f.user));
  parsed.set(id, font);
  return entry;
}

// Outline data for the text, laid out from the top-left of the first line.
export async function textPathData(t) {
  const font = await getFont(t.font);
  const size = t.size;
  const opts = { kerning: true, tracking: t.spacing };
  const scale = size / font.unitsPerEm;
  const asc = font.ascender * scale;
  const lh = size * t.lineHeight;
  const lines = String(t.text).split('\n');
  const widths = lines.map((l) => font.getAdvanceWidth(l, size, opts));
  const maxW = Math.max(0, ...widths);
  let d = '';
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    const x = t.align === 'center' ? (maxW - widths[i]) / 2 : t.align === 'right' ? maxW - widths[i] : 0;
    d += font.getPath(line, x, asc + i * lh, size, opts).toPathData(2) + ' ';
  });
  return { d: d.trim(), width: maxW };
}

export const isText = (it) => !!(it && it.data && it.data.text);

export async function makeText(t) {
  const item = new paper.CompoundPath({ insert: false });
  item.applyMatrix = false; // keeps the layout editable: moves, scales and turns live in item.matrix
  item.data.text = { ...t };
  await setTextData(item, t);
  return item;
}
// Re-lays the text, keeping it anchored where its alignment says (left edge, center or right edge).
export async function setTextData(item, t) {
  const { d, width } = await textPathData(t);
  const oldW = item.data.boxW;
  const anchorX = (w, a) => (a === 'center' ? w / 2 : a === 'right' ? w : 0);
  const before = oldW != null ? item.localToGlobal(new paper.Point(anchorX(oldW, item.data.text.align), 0)) : null;
  item.data.text = { ...t };
  item.data.boxW = width;
  item.pathData = d || 'M0 0';
  if (before) item.translate(before.subtract(item.localToGlobal(new paper.Point(anchorX(width, t.align), 0))));
}

// Plain shapes from here on (needed before cutting, combining or editing points).
export function bake(item) {
  item.applyMatrix = true;
  delete item.data.text;
  delete item.data.boxW;
  return item;
}
export function bakeAll(items) {
  let n = 0;
  const walk = (it) => {
    if (isText(it)) { bake(it); n++; } else if (it.children && !(it instanceof paper.CompoundPath)) it.children.forEach(walk);
  };
  items.forEach(walk);
  if (n) toast(n === 1 ? 'Text turned into shapes' : `${n} texts turned into shapes`);
  return n;
}

export function defaultText() {
  return { text: 'Text', font: S.text.font, size: S.text.size, spacing: S.text.spacing, lineHeight: S.text.lineHeight, align: S.text.align };
}
