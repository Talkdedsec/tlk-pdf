// Reading, rendering and writing PDFs. pdf.js draws pages and reads form
// fields; pdf-lib writes the result. Both run entirely in the browser.
import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';
import { doc, sources, source, itemsOf, totalRot, uid } from './store.js';
import { ASCENT, LINE, pointAt, dirs, viewport, hexToRgb01, MARKS } from './geometry.js';

const VENDOR = new URL('../vendor/pdfjs/', import.meta.url).href;
pdfjs.GlobalWorkerOptions.workerSrc = VENDOR + 'pdf.worker.min.mjs';
export { pdfjs };

const A4 = [595.28, 841.89];

export class Cancelled extends Error { constructor() { super('cancelled'); this.name = 'Cancelled'; } }

/* ------------------------------------------------------------------ open */

export async function openPdf(name, bytes, askPassword) {
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    cMapUrl: VENDOR + 'cmaps/',
    standardFontDataUrl: VENDOR + 'standard_fonts/',
    wasmUrl: VENDOR + 'wasm/',
    iccUrl: VENDOR + 'iccs/',
    isEvalSupported: false,
    enableXfa: false
  });
  let cancelled = false;
  let protectedByPassword = false;
  task.onPassword = (update, reason) => {
    protectedByPassword = true;
    askPassword(reason === pdfjs.PasswordResponses.INCORRECT_PASSWORD).then((pw) => {
      if (pw == null) { cancelled = true; task.destroy(); } else update(pw);
    });
  };
  let pdf;
  try {
    pdf = await task.promise;
  } catch (e) {
    if (cancelled) throw new Cancelled();
    throw e;
  }
  const src = { id: uid('s'), kind: 'pdf', name, bytes, pdf, fields: null, protectedByPassword };
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i);
    pages.push({ id: uid('p'), src: src.id, index: i - 1, view: [...pg.view], base: pg.rotate || 0, rot: 0 });
  }
  try {
    src.fields = await readFields(pdf);
  } catch (e) { console.warn('form fields', e); }
  sources.push(src);
  return { src, pages };
}

// Form fields, read from the widget annotations of every page.
async function readFields(pdf) {
  const { info } = await pdf.getMetadata().catch(() => ({ info: {} }));
  if (!info?.IsAcroFormPresent) return null;
  const out = {};
  for (let i = 1; i <= pdf.numPages; i++) {
    const anns = await (await pdf.getPage(i)).getAnnotations({ intent: 'display' });
    for (const a of anns) {
      if (a.annotationType !== pdfjs.AnnotationType.WIDGET || !a.fieldName || a.hidden || a.pushButton) continue;
      let type;
      if (a.fieldType === 'Tx') type = 'text';
      else if (a.fieldType === 'Btn') type = a.checkBox ? 'checkbox' : a.radioButton ? 'radiobutton' : null;
      else if (a.fieldType === 'Ch') type = a.combo ? 'combobox' : 'listbox';
      if (!type) continue;
      const value = Array.isArray(a.fieldValue) ? a.fieldValue[0] ?? '' : a.fieldValue ?? '';
      (out[a.fieldName] ||= []).push({
        id: a.id, type, value, page: i - 1, readOnly: !!a.readOnly,
        exportValues: a.buttonValue ?? a.exportValue ?? null,
        items: a.options || [], multiline: !!a.multiLine, password: !!a.password, charLimit: a.maxLen || 0,
        rect: a.rect, size: a.defaultAppearanceData?.fontSize || 0, align: a.textAlignment || 0
      });
    }
  }
  return Object.keys(out).length ? out : null;
}

export async function openImage(name, file) {
  let blob = file;
  let mime = file.type;
  const bmp = await createImageBitmap(file);
  if (mime !== 'image/png' && mime !== 'image/jpeg') {
    // pdf-lib embeds PNG and JPEG only; convert anything else to PNG.
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, 0, 0);
    blob = await c.convertToBlob({ type: 'image/png' });
    mime = 'image/png';
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const w = A4[0];
  const h = Math.round((w * bmp.height) / bmp.width * 100) / 100;
  const src = { id: uid('s'), kind: 'image', name, bytes, mime, bmp, iw: bmp.width, ih: bmp.height };
  sources.push(src);
  return { src, pages: [{ id: uid('p'), src: src.id, index: 0, view: [0, 0, w, h], base: 0, rot: 0 }] };
}

// A blank page the size of `like` (shown the same way round), or A4.
export function blankPage(like) {
  const view = like ? [0, 0, like.view[2] - like.view[0], like.view[3] - like.view[1]] : [0, 0, ...A4];
  return { id: uid('p'), src: null, index: 0, view, base: 0, rot: like ? totalRot(like) : 0 };
}

/* ---------------------------------------------------------------- render */

const pageCache = new Map();
async function pdfPage(src, index) {
  const key = src.id + ':' + index;
  if (!pageCache.has(key)) pageCache.set(key, src.pdf.getPage(index + 1));
  return pageCache.get(key);
}
export const forgetPages = () => pageCache.clear();

// Draws a page (without placed items) into a canvas at `scale` device pixels
// per point. Returns an object with cancel() and a promise.
export function drawPage(p, canvas, scale) {
  const src = p.src ? source(p.src) : null;
  const vp = viewport(p.view, scale, totalRot(p));
  const w = Math.max(1, Math.round(vp.width));
  const h = Math.max(1, Math.round(vp.height));
  if (src?.kind === 'pdf') {
    let task = null;
    let stop = false;
    const promise = (async () => {
      const pg = await pdfPage(src, p.index);
      if (stop) return;
      const v = pg.getViewport({ scale, rotation: totalRot(p) });
      canvas.width = Math.round(v.width);
      canvas.height = Math.round(v.height);
      task = pg.render({ canvas, viewport: v, annotationMode: pdfjs.AnnotationMode.ENABLE_STORAGE });
      await task.promise;
    })();
    return { promise, cancel: () => { stop = true; task?.cancel(); } };
  }
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  if (src?.kind === 'image') {
    g.save();
    const [a, b, c, d, e, f] = vp.transform;
    g.setTransform(a, b, c, d, e, f);
    // Image fills the whole view box; flip because user space points up.
    g.translate(p.view[0], p.view[3]);
    g.scale(1, -1);
    g.drawImage(src.bmp, 0, 0, p.view[2] - p.view[0], p.view[3] - p.view[1]);
    g.restore();
  }
  return { promise: Promise.resolve(), cancel() {} };
}

/* ----------------------------------------------------------------- forms */

export function formKey(srcId, name) { return srcId + '|' + name; }

export function fieldValue(src, name) {
  const key = formKey(src.id, name);
  if (key in doc.forms) return doc.forms[key];
  const w = src.fields[name];
  const t = w[0].type;
  if (t === 'checkbox') return w.some((x) => x.value && x.value !== 'Off' && x.value === x.exportValues);
  if (t === 'radiobutton') return (w.find((x) => x.value && x.value !== 'Off' && x.value === x.exportValues) || {}).exportValues || '';
  const v = w[0].value;
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

// Mirrors edited form values into pdf.js so rendered pages show them.
// Fields the user has not touched keep the appearance stored in the file.
// Edited text fields and drop-downs are blanked here and drawn by the editor
// instead (see formStamps), in the font the saved file will use: pdf.js
// switches to an oversized fallback when the field's own font cannot encode
// letters such as ş, ğ or ı.
// Letters outside Latin-1 are the ones a standard PDF font cannot encode.
const needsOwnFont = (t) => /[^\u0000-\u00ff]/.test(String(t ?? ''));
const choiceLabel = (w, v) => (w.items.find((o) => o.exportValue === v) || {}).displayValue ?? v;
const drawnByEditor = (w, v) => w.type === 'text' || (w.type === 'combobox' && needsOwnFont(choiceLabel(w, v)));

export function syncFormPreview() {
  for (const src of sources) {
    if (!src.fields) continue;
    const store = src.pdf.annotationStorage;
    for (const [name, widgets] of Object.entries(src.fields)) {
      const edited = formKey(src.id, name) in doc.forms;
      const v = fieldValue(src, name);
      for (const w of widgets) {
        if (!edited) { store.remove?.(w.id); continue; }
        if (w.type === 'checkbox') store.setValue(w.id, { value: !!v });
        else if (w.type === 'radiobutton') store.setValue(w.id, { value: v === w.exportValues });
        else if (w.type === 'combobox') store.setValue(w.id, { value: drawnByEditor(w, v) || !v ? [] : [v] });
        else if (w.type === 'listbox') store.setValue(w.id, { value: v ? [v] : [] });
        else store.setValue(w.id, { value: '' });
      }
    }
  }
}

// Text for the edited text fields and drop-downs on page `p`, laid out the
// way pdf-lib writes field appearances: 2 pt padding, one line centred
// vertically, several lines from the top.
export function formStamps(p, measure) {
  const src = p.src ? source(p.src) : null;
  if (!src?.fields) return [];
  const out = [];
  for (const [name, widgets] of Object.entries(src.fields)) {
    if (!(formKey(src.id, name) in doc.forms)) continue;
    let text = fieldValue(src, name);
    for (const w of widgets) {
      if (w.page !== p.index || !drawnByEditor(w, text) || !w.rect) continue;
      if (w.type === 'combobox') text = choiceLabel(w, text);
      text = String(text ?? '');
      if (w.password) text = '•'.repeat(text.length);
      if (!text) continue;
      const [x0, y0, x1, y1] = w.rect;
      const rw = x1 - x0, rh = y1 - y0;
      const lines = w.multiline ? text.split('\n') : [text.replace(/\n/g, ' ')];
      const size = w.size || Math.max(4, Math.min(12, (w.multiline ? 12 : (rh - 4) * 0.72)));
      const tw = measure(lines.join('\n'), size, 'sans', false);
      const h = lines.length * size * LINE;
      let x = x0 + 2;
      if (!w.multiline && w.align === 1) x = x0 + (rw - tw) / 2;
      else if (!w.multiline && w.align === 2) x = x1 - 2 - tw;
      const y = w.multiline ? y1 - 2 - h + size * 0.15 : (y0 + y1) / 2 - size * 0.65;
      out.push({ type: 'text', stamp: true, text: lines.join('\n'), x, y, w: tw, h, rot: 0, size, font: 'sans', bold: false, color: '#000000', opacity: 1 });
    }
  }
  return out;
}

/* ---------------------------------------------------------------- stamps */

// Page numbers and the watermark are not stored per page; they are computed
// for every page from the document settings, the same way for the editor and
// for the saved file. `measure(text, size)` returns a width in points.
export function stampsFor(p, n, total, measure) {
  const out = [];
  const vp = viewport(p.view, 1, totalRot(p));
  const R = vp.rotation;
  const wm = doc.watermark;
  if (wm.on && wm.text.trim()) {
    const text = wm.text.trim();
    const size = wm.size;
    const w = measure(text, size, 'sans', true);
    const h = size * LINE;
    const rot = R + wm.angle;
    const { u, v } = dirs(rot);
    const [cx, cy] = vp.toUser(vp.width / 2, vp.height / 2);
    const x = cx - (w / 2) * u[0] - (h / 2) * v[0];
    const y = cy - (w / 2) * u[1] - (h / 2) * v[1];
    out.push({ type: 'text', stamp: true, text, x, y, w, h, rot, size, font: 'sans', bold: true, color: wm.color, opacity: wm.opacity });
  }
  const nb = doc.numbers;
  if (nb.on) {
    const text = nb.fmt.replace('{n}', String(n + nb.start - 1)).replace('{total}', String(total + nb.start - 1));
    const size = nb.size;
    const w = measure(text, size, 'sans', false);
    const h = size * LINE;
    const m = 28;
    const pos = nb.pos;
    let vx = pos[1] === 'l' ? m : pos[1] === 'r' ? vp.width - m - w : (vp.width - w) / 2;
    let vy = pos[0] === 't' ? m + h : vp.height - m + size * 0.3;
    const [x, y] = vp.toUser(vx, vy);
    out.push({ type: 'text', stamp: true, text, x, y, w, h, rot: R, size, font: 'sans', bold: false, color: nb.color, opacity: 1 });
  }
  return out;
}

/* ----------------------------------------------------------------- fonts */

const FONT_FILES = {
  'sans/0': 'IBMPlexSans-Regular', 'sans/1': 'IBMPlexSans-Bold',
  'serif/0': 'IBMPlexSerif-Regular', 'serif/1': 'IBMPlexSerif-Bold',
  'mono/0': 'IBMPlexMono-Regular', 'mono/1': 'IBMPlexMono-Bold'
};
const fontBytes = new Map();
async function loadFontBytes(key) {
  if (!fontBytes.has(key)) {
    const url = new URL(`../fonts/${FONT_FILES[key]}.woff`, import.meta.url);
    fontBytes.set(key, fetch(url).then((r) => r.arrayBuffer()));
  }
  return fontBytes.get(key);
}

/* ----------------------------------------------------------------- write */

const dataUrlBytes = (url) => Uint8Array.from(atob(url.slice(url.indexOf(',') + 1)), (c) => c.charCodeAt(0));

async function renderToJpeg(p, scale) {
  const canvas = document.createElement('canvas');
  const src = source(p.src);
  const pg = await pdfPage(src, p.index);
  const v = pg.getViewport({ scale, rotation: 0 });
  canvas.width = Math.round(v.width);
  canvas.height = Math.round(v.height);
  await pg.render({ canvas, viewport: v, annotationMode: pdfjs.AnnotationMode.ENABLE_STORAGE }).promise;
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  return new Uint8Array(await blob.arrayBuffer());
}

// Builds a PDF from `list` (page entries, in order). Returns
// { bytes, rasterised: [source names] }.
export async function buildPdf(list, { progress = () => {} } = {}) {
  const L = window.PDFLib;
  const { PDFDocument, rgb, degrees, BlendMode, LineCapStyle } = L;
  const used = [...new Set(list.map((p) => p.src).filter(Boolean))].map(source);
  const pdfSrcs = used.filter((s) => s.kind === 'pdf');

  // Load every PDF source with pdf-lib. Encrypted files cannot be rewritten,
  // so their pages are copied as images instead.
  const libs = new Map();
  const rasterised = [];
  for (const s of pdfSrcs) {
    try {
      libs.set(s.id, await PDFDocument.load(s.bytes, { updateMetadata: false }));
    } catch {
      rasterised.push(s.name);
    }
  }

  const only = pdfSrcs.length === 1 && used.length === 1 && libs.has(pdfSrcs[0].id) ? pdfSrcs[0] : null;
  const inPlace = only && list.every((p, i) => p.src === only.id && (i === 0 || p.index > list[i - 1].index));

  // Form values. Copying pages loses interactive fields, so they are flattened
  // unless the original file is edited in place.
  for (const [id, lib] of libs) {
    const s = source(id);
    if (!s.fields) continue;
    const changed = Object.keys(doc.forms).some((k) => k.startsWith(id + '|'));
    let form;
    try { form = lib.getForm(); } catch { continue; }
    if (changed) {
      lib.registerFontkit(window.fontkit);
      // Fields that stay fillable get the whole font, so other programs can
      // type any letter into them later; flattened fields only need a subset.
      const font = await lib.embedFont(await loadFontBytes('sans/0'), { subset: !inPlace });
      for (const [key, val] of Object.entries(doc.forms)) {
        if (!key.startsWith(id + '|')) continue;
        const name = key.slice(id.length + 1);
        let f;
        try { f = form.getField(name); } catch { continue; }
        try {
          if (f instanceof L.PDFTextField) f.setText(String(val ?? ''));
          else if (f instanceof L.PDFCheckBox) val ? f.check() : f.uncheck();
          else if (f instanceof L.PDFRadioGroup) { if (val) f.select(String(val)); else f.clear(); }
          else if (f instanceof L.PDFDropdown || f instanceof L.PDFOptionList) {
            if (!val) f.clear();
            else {
              const item = (s.fields[name]?.[0]?.items || []).find((o) => o.exportValue === val);
              try { f.select(String(val)); } catch { if (item) f.select(item.displayValue); }
            }
          }
        } catch (e) { console.warn('form field', name, e); }
      }
      try { form.updateFieldAppearances(font); } catch (e) { console.warn('appearances', e); }
    }
    if (!inPlace) {
      try { form.flatten({ updateFieldAppearances: false }); } catch (e) { console.warn('flatten', e); }
    }
  }

  let out;
  const placed = []; // [PDFPage, page entry]
  if (inPlace) {
    out = libs.get(only.id);
    // Take the page objects first: pdf-lib's page list is not refreshed
    // after removePage().
    const all = out.getPages();
    list.forEach((p) => placed.push([all[p.index], p]));
    const keep = new Set(list.map((p) => p.index));
    for (let i = all.length - 1; i >= 0; i--) if (!keep.has(i)) out.removePage(i);
  } else {
    out = await PDFDocument.create();
    const firstCopy = new Map();
    for (const [id, lib] of libs) {
      const idx = [...new Set(list.filter((p) => p.src === id).map((p) => p.index))];
      const copies = await out.copyPages(lib, idx);
      idx.forEach((ix, k) => firstCopy.set(id + ':' + ix, copies[k]));
    }
    const images = new Map();
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const s = p.src ? source(p.src) : null;
      const [x0, y0, x1, y1] = p.view;
      let pg;
      if (s?.kind === 'pdf' && libs.has(s.id)) {
        const key = s.id + ':' + p.index;
        if (firstCopy.has(key)) { pg = firstCopy.get(key); firstCopy.delete(key); }
        else [pg] = await out.copyPages(libs.get(s.id), [p.index]);
        out.addPage(pg);
      } else if (s?.kind === 'pdf') {
        pg = out.addPage([x1 - x0, y1 - y0]);
        pg.setMediaBox(x0, y0, x1 - x0, y1 - y0);
        const img = await out.embedJpg(await renderToJpeg(p, 2));
        pg.drawImage(img, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
      } else if (s?.kind === 'image') {
        pg = out.addPage([x1 - x0, y1 - y0]);
        if (!images.has(s.id)) images.set(s.id, s.mime === 'image/png' ? await out.embedPng(s.bytes) : await out.embedJpg(s.bytes));
        pg.drawImage(images.get(s.id), { x: 0, y: 0, width: x1 - x0, height: y1 - y0 });
      } else {
        pg = out.addPage([x1 - x0, y1 - y0]);
      }
      placed.push([pg, p]);
      progress(i / list.length / 2);
    }
  }

  out.registerFontkit(window.fontkit);
  const fonts = new Map();
  const font = async (fam, bold) => {
    const key = `${fam || 'sans'}/${bold ? 1 : 0}`;
    if (!fonts.has(key)) fonts.set(key, out.embedFont(await loadFontBytes(key), { subset: true }));
    return fonts.get(key);
  };
  const imgCache = new Map();
  const image = async (url) => {
    if (!imgCache.has(url)) {
      const bytes = dataUrlBytes(url);
      imgCache.set(url, url.startsWith('data:image/png') ? out.embedPng(bytes) : out.embedJpg(bytes));
    }
    return imgCache.get(url);
  };
  // Widths for page numbers and watermark come from the real font.
  const fontObjs = { 'sans/0': await font('sans', false), 'sans/1': await font('sans', true) };
  const measure = (text, size, fam, bold) => fontObjs[`sans/${bold ? 1 : 0}`].widthOfTextAtSize(text, size);

  const color = (hex) => rgb(...hexToRgb01(hex || '#000000'));
  const total = list.length;
  for (let i = 0; i < placed.length; i++) {
    const [pg, p] = placed[i];
    pg.setRotation(degrees(totalRot(p)));
    const items = [...itemsOf(p.id), ...stampsFor(p, i + 1, total, measure)];
    for (const it of items) {
      const op = it.opacity ?? 1;
      if (it.type === 'text') {
        const f = await font(it.font, it.bold);
        it.text.split('\n').forEach((line, k) => {
          if (!line) return;
          const [x, y] = pointAt(it, 0, it.size * (ASCENT + k * LINE));
          pg.drawText(line, { x, y, size: it.size, font: f, color: color(it.color), opacity: op, rotate: degrees(it.rot) });
        });
      } else if (it.type === 'highlight') {
        pg.drawRectangle({ x: it.x, y: it.y, width: it.w, height: it.h, rotate: degrees(it.rot), color: color(it.color), opacity: op, blendMode: BlendMode.Multiply });
      } else if (it.type === 'whiteout') {
        pg.drawRectangle({ x: it.x, y: it.y, width: it.w, height: it.h, rotate: degrees(it.rot), color: color(it.color || '#ffffff'), opacity: 1 });
      } else if (it.type === 'box') {
        const o = { x: it.x, y: it.y, width: it.w, height: it.h, rotate: degrees(it.rot), borderColor: color(it.color), borderWidth: it.width, borderOpacity: op };
        if (it.fill) { o.color = color(it.fill); o.opacity = op; }
        pg.drawRectangle(o);
      } else if (it.type === 'image') {
        pg.drawImage(await image(it.src), { x: it.x, y: it.y, width: it.w, height: it.h, rotate: degrees(it.rot), opacity: op });
      } else if (it.type === 'ink') {
        const d = it.pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(2)} ${(-y).toFixed(2)}`).join(' ');
        pg.drawSvgPath(it.pts.length === 1 ? d + ` L${(it.pts[0][0] + 0.01).toFixed(2)} ${(-it.pts[0][1]).toFixed(2)}` : d, {
          x: 0, y: 0, borderColor: color(it.color), borderWidth: it.width, borderOpacity: op, borderLineCap: LineCapStyle.Round
        });
      } else if (it.type === 'mark') {
        if (it.kind === 'dot') {
          const [x, y] = pointAt(it, it.w / 2, it.h / 2);
          pg.drawCircle({ x, y, size: Math.min(it.w, it.h) * 0.32, color: color(it.color), opacity: op });
        } else {
          for (const stroke of MARKS[it.kind]) {
            const d = stroke.map(([sx, sy], k) => {
              const [x, y] = pointAt(it, sx * it.w, sy * it.h);
              return `${k ? 'L' : 'M'}${x.toFixed(2)} ${(-y).toFixed(2)}`;
            }).join(' ');
            pg.drawSvgPath(d, { x: 0, y: 0, borderColor: color(it.color), borderWidth: Math.max(1, it.w * 0.11), borderOpacity: op, borderLineCap: LineCapStyle.Round });
          }
        }
      }
    }
    progress(0.5 + i / placed.length / 2);
  }

  const m = doc.meta;
  if (m.title) out.setTitle(m.title);
  if (m.author) out.setAuthor(m.author);
  if (m.subject) out.setSubject(m.subject);
  if (m.keywords) out.setKeywords(m.keywords.split(',').map((s) => s.trim()).filter(Boolean));
  out.setProducer('TLK PDF');
  out.setModificationDate(new Date());
  const bytes = await out.save({ useObjectStreams: true });
  return { bytes, rasterised };
}

// Renders a finished PDF to PNG files, one per page.
export async function pdfToPngs(bytes, scale = 2) {
  const task = pdfjs.getDocument({ data: bytes.slice(), cMapUrl: VENDOR + 'cmaps/', standardFontDataUrl: VENDOR + 'standard_fonts/', wasmUrl: VENDOR + 'wasm/', iccUrl: VENDOR + 'iccs/' });
  const pdf = await task.promise;
  const files = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i);
    const v = pg.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.width);
    canvas.height = Math.round(v.height);
    await pg.render({ canvas, viewport: v }).promise;
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    files.push(new Uint8Array(await blob.arrayBuffer()));
  }
  await task.destroy();
  return files;
}
