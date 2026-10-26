// Symbols: one drawing used in many places (the mascot's cap in every pose). Copies of a symbol are Paper
// SymbolItems sharing a SymbolDefinition; editing it changes them all. While a symbol is being edited its contents
// sit on a layer of their own (data.symbolEdit), placed where the copy being edited is, with every tool working as
// usual; the copy itself is hidden (data.symbolEditing). Both live in the drawing, so undo and autosave keep them.
import { S, emit, toast, zOrder } from './state.js';
import { commit } from './history.js';
import { setSelection } from './tools.js';

export const editLayer = () => paper.project.layers.find((l) => l.data.symbolEdit) || null;
const symbolOf = (def) => def.item.data.symbol;

function everyItem(fn) {
  const walk = (it) => { fn(it); if (it.children) it.children.forEach(walk); };
  paper.project.layers.forEach(walk);
}
function definitions() {
  const out = new Set();
  everyItem((it) => { if (it instanceof paper.SymbolItem) out.add(it.definition); });
  return [...out];
}

// The selection becomes a symbol, in its place.
export function makeSymbol() {
  const items = zOrder(S.sel);
  if (!items.length) return toast('Select something first');
  const mark = new paper.Group({ insert: false });
  mark.insertAbove(items[items.length - 1]);
  const g = new paper.Group({ insert: false });
  g.addChildren(items);
  const center = g.position;
  g.data.symbol = { id: Math.random().toString(36).slice(2, 10), name: `Symbol ${definitions().length + 1}` };
  const copy = new paper.SymbolDefinition(g).place(center);
  mark.replaceWith(copy);
  commit();
  setSelection([copy]);
  toast(`Made "${g.data.symbol.name}": duplicate it for more copies; double-click one to edit them all`);
}

// A copy's drawing as ordinary shapes, where the copy is.
export function expand(copy) {
  const g = copy.definition.item.clone({ insert: false });
  delete g.data.symbol;
  g.transform(copy.matrix);
  g.opacity = copy.opacity;
  return g;
}
// Every copy inside an item (or the item itself) as ordinary shapes: for exports, which then don't depend on the
// other app understanding symbols.
export function expandAll(item) {
  if (item instanceof paper.SymbolItem) return expand(item);
  if (item.children && !(item instanceof paper.CompoundPath)) item.children.slice().forEach((c) => { const e = expandAll(c); if (e !== c) c.replaceWith(e); });
  return item;
}

export function unlinkSymbol() {
  const copies = S.sel.filter((it) => it instanceof paper.SymbolItem);
  if (!copies.length) return toast('Select a symbol first');
  const out = copies.map((c) => { const e = expand(c); c.replaceWith(e); return e; });
  commit();
  setSelection(out);
}

export function editSymbol(copy = S.sel.find((it) => it instanceof paper.SymbolItem)) {
  if (!copy) return toast('Select a symbol first');
  const name = symbolOf(copy.definition).name;
  const prev = paper.project.activeLayer.index;
  const layer = new paper.Layer({ name: `Editing ${name}` }); // on top, and active
  layer.data.symbolEdit = { prev };
  layer.addChildren(expand(copy).removeChildren());
  copy.visible = false;
  copy.data.symbolEditing = true;
  commit();
  setSelection([]);
  emit('layers');
  toast(`Editing "${name}": every copy changes when you press Done`);
}

// Done: what's on the editing layer becomes the symbol, and every copy shows it.
export function finishSymbol() {
  const layer = editLayer();
  let copy = null;
  everyItem((it) => { if (it.data.symbolEditing) copy = it; });
  const def = copy.definition;
  const g = new paper.Group({ insert: false });
  g.addChildren(layer.removeChildren());
  // A symbol can't hold a copy of itself (it would draw forever).
  const loops = [];
  const walk = (it) => { if (it instanceof paper.SymbolItem && it.definition === def) loops.push(it); else if (it.children) it.children.forEach(walk); };
  walk(g);
  loops.forEach((it) => it.remove());
  if (loops.length) toast('A symbol can\'t contain itself: that copy was left out');
  g.transform(copy.matrix.inverted());
  g.data.symbol = symbolOf(def);
  def.setItem(g, true); // not re-centered, so the copies stay put
  copy.visible = true;
  delete copy.data.symbolEditing;
  const prev = paper.project.layers[layer.data.symbolEdit.prev];
  layer.remove();
  prev.activate();
  commit();
  setSelection([copy]);
  emit('layers');
}

// Pasted copies of a symbol in this drawing join it again (pasting makes its own definition otherwise).
export function relink(items) {
  const known = new Map(definitions().filter((d) => !items.some((it) => it instanceof paper.SymbolItem && it.definition === d)).map((d) => [symbolOf(d).id, d]));
  const walk = (it) => {
    if (it instanceof paper.SymbolItem) { const d = known.get(symbolOf(it.definition).id); if (d) it.definition = d; } else if (it.children) it.children.forEach(walk);
  };
  items.forEach(walk);
}
