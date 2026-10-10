// Document state and undo history. Sources (the opened files) never change;
// everything the user edits lives in `doc`, which is snapshotted for undo.

let seq = 0;
export const uid = (p = 'x') => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const sources = []; // { id, kind: 'pdf' | 'image', name, bytes, pdf, fields, encrypted, img }

export const doc = emptyDoc();

function emptyDoc() {
  return {
    pages: [], // { id, src (source id or null), index, view: [x0,y0,x1,y1], base, rot }
    items: {}, // pageId -> item[]
    forms: {}, // `${srcId}|${fieldName}` -> value
    meta: { title: '', author: '', subject: '', keywords: '' },
    numbers: { on: false, pos: 'bc', fmt: '{n} / {total}', size: 10, start: 1, color: '#333333' },
    watermark: { on: false, text: '', size: 54, opacity: 0.15, angle: 45, color: '#C2362F' }
  };
}

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
export function emit(what = {}) { for (const fn of listeners) fn(what); }

const undoStack = [];
const redoStack = [];
const LIMIT = 150;
let dirty = false;

const snap = () => structuredClone(doc);
function restore(s) { for (const k of Object.keys(doc)) delete doc[k]; Object.assign(doc, s); }

// Every change goes through here so it can be undone.
export function change(fn, what = { pages: true, items: true }) {
  undoStack.push(snap());
  if (undoStack.length > LIMIT) undoStack.shift();
  redoStack.length = 0;
  fn(doc);
  dirty = true;
  emit({ ...what, history: true });
}

// Saves an undo point before a series of small edits (a slider drag, typing
// into a field) that then mutate `doc` directly.
export function checkpoint() {
  undoStack.push(snap());
  if (undoStack.length > LIMIT) undoStack.shift();
  redoStack.length = 0;
  dirty = true;
}

export const canUndo = () => undoStack.length > 0;
export const canRedo = () => redoStack.length > 0;
export const isDirty = () => dirty && doc.pages.length > 0;
export const markClean = () => { dirty = false; emit({ history: true }); };

export function undo() {
  if (!undoStack.length) return false;
  redoStack.push(snap());
  restore(undoStack.pop());
  dirty = true;
  emit({ pages: true, items: true, forms: true, history: true, undo: true });
  return true;
}

export function redo() {
  if (!redoStack.length) return false;
  undoStack.push(snap());
  restore(redoStack.pop());
  dirty = true;
  emit({ pages: true, items: true, forms: true, history: true, undo: true });
  return true;
}

export function reset() {
  for (const s of sources) s.pdf?.loadingTask?.destroy?.();
  sources.length = 0;
  restore(emptyDoc());
  undoStack.length = 0;
  redoStack.length = 0;
  dirty = false;
  emit({ pages: true, items: true, forms: true, history: true, reset: true });
}

export const source = (id) => sources.find((s) => s.id === id);
export const pageById = (id) => doc.pages.find((p) => p.id === id);
export const itemsOf = (pageId) => doc.items[pageId] || [];
export const totalRot = (p) => (((p.base + p.rot) % 360) + 360) % 360;
