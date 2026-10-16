// Undo / redo by whole-drawing snapshots: simple and impossible to get out of step.
import { S, emit } from './state.js';

const MAX = 120;
let stack = [];
let index = -1;

function snapshot() {
  const p = paper.project;
  return JSON.stringify({ json: p.exportJSON({ asString: false }), active: p.activeLayer ? p.activeLayer.index : 0 });
}

export function resetHistory() {
  stack = [snapshot()];
  index = 0;
  emit('history');
}

// Call after every finished change.
export function commit() {
  const snap = snapshot();
  if (snap === stack[index]) return;
  stack = stack.slice(0, index + 1);
  stack.push(snap);
  if (stack.length > MAX) stack.shift();
  index = stack.length - 1;
  emit('history');
  emit('changed');
}

function restore(snap) {
  const { json, active } = JSON.parse(snap);
  const p = paper.project;
  p.clear();
  p.importJSON(json);
  p.layers[active].activate();
  S.sel = [];
  S.node.path = null;
  S.node.segs.clear();
  emit('history');
  emit('changed');
  emit('selection');
}

export function undo() { if (index > 0) restore(stack[--index]); }
export function redo() { if (index < stack.length - 1) restore(stack[++index]); }
export const canUndo = () => index > 0;
export const canRedo = () => index < stack.length - 1;
