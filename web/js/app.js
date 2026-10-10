// TLK PDF: the editor. Wires the page list, the pages, the tools and the
// side panel to the document state in store.js.
import { t, apply as applyI18n, setLang, getLang } from './i18n.js';
import { VERSION } from './version.js';
import {
  doc, sources, change, checkpoint, undo, redo, reset, canUndo, canRedo, isDirty, markClean,
  onChange, emit, pageById, itemsOf, totalRot, source, uid
} from './store.js';
import { viewport, mul, localToUser, viewBounds, boxFromView, moveBy, pointAt, dirs, clamp, ASCENT, LINE, MARKS } from './geometry.js';
import {
  openPdf, openImage, blankPage, drawPage, buildPdf, pdfToPngs, stampsFor, syncFormPreview,
  fieldValue, formKey, Cancelled, forgetPages
} from './pdfio.js';
import { openSignatureDialog, listSignatures, removeSignature } from './signature.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PT = 96 / 72;
const FAM = { sans: 'TLK Sans', serif: 'TLK Serif', mono: 'TLK Mono' };

const ui = {
  tool: 'select',
  zoom: 1,
  sel: null, // { pageId, itemId }
  pageSel: new Set(),
  pageAnchor: null,
  current: null,
  tab: 'tool',
  formVersion: 0,
  autoFit: true,
  signature: null,
  image: null,
  opts: {
    text: { font: 'sans', size: 14, color: '#161B24', bold: false },
    highlight: { color: '#FFD84A', opacity: 0.5 },
    draw: { color: '#2449C9', width: 2, opacity: 1 },
    box: { color: '#C2362F', width: 2, fill: null, opacity: 1 },
    whiteout: { color: '#FFFFFF' },
    mark: { kind: 'check', color: '#1F7A3E', size: 14 },
    date: { fmt: 'long', size: 12, color: '#161B24', font: 'sans' }
  }
};

const PALETTE = {
  text: ['#161B24', '#2449C9', '#C2362F', '#1F7A3E', '#6B7280', '#FFFFFF'],
  highlight: ['#FFD84A', '#7CF29A', '#FF9ECF', '#8FD3FF', '#FFB86B'],
  draw: ['#2449C9', '#161B24', '#C2362F', '#1F7A3E', '#E6A700'],
  box: ['#C2362F', '#2449C9', '#161B24', '#1F7A3E', '#E6A700'],
  whiteout: ['#FFFFFF', '#000000', '#F4F1E8'],
  mark: ['#1F7A3E', '#161B24', '#2449C9', '#C2362F']
};

/* ================================================================ text metrics */

const mctx = document.createElement('canvas').getContext('2d');
function measure(text, size, fam = 'sans', bold = false) {
  mctx.font = `${bold ? 700 : 400} ${size}px "${FAM[fam] || FAM.sans}"`;
  return Math.max(1, ...String(text).split('\n').map((l) => mctx.measureText(l).width));
}
function textBox(it) {
  const lines = it.text.split('\n').length;
  return { w: measure(it.text, it.size, it.font, it.bold) + it.size * 0.05, h: lines * it.size * LINE };
}

/* ================================================================ toasts, busy, dialogs */

function toast(msg, { err = false, action = null, ms = 4200 } = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.run(); el.remove(); };
    el.append(b);
  }
  $('toasts').append(el);
  setTimeout(() => el.remove(), ms);
}

let busyEl = null;
function busy(on, label = '') {
  if (on && !busyEl) {
    busyEl = document.createElement('div');
    busyEl.className = 'busy';
    busyEl.innerHTML = `<div><span class="spin"></span><span>${esc(label)}</span></div>`;
    document.body.append(busyEl);
  } else if (!on && busyEl) { busyEl.remove(); busyEl = null; }
}

function confirmBox(title, body, yes) {
  const dlg = $('dlg-confirm');
  $('confirm-h').textContent = title;
  $('confirm-body').textContent = body;
  $('confirm-yes').textContent = yes;
  return new Promise((resolve) => {
    const done = (v) => { dlg.close(); $('confirm-yes').onclick = $('confirm-no').onclick = null; resolve(v); };
    $('confirm-yes').onclick = () => done(true);
    $('confirm-no').onclick = () => done(false);
    dlg.oncancel = () => resolve(false);
    dlg.showModal();
  });
}

function askPassword(wrong) {
  const dlg = $('dlg-pass');
  $('pass-msg').textContent = t(wrong ? 'pass.wrong' : 'pass.body');
  $('pass-input').value = '';
  return new Promise((resolve) => {
    $('pass-form').onsubmit = (e) => { e.preventDefault(); dlg.close(); resolve($('pass-input').value); };
    $('pass-cancel').onclick = () => { dlg.close(); resolve(null); };
    dlg.oncancel = () => resolve(null);
    dlg.showModal();
    $('pass-input').focus();
  });
}

/* ================================================================ files */

const baseName = () => {
  const first = sources[0]?.name || 'document.pdf';
  return first.replace(/\.(pdf|png|jpe?g|webp)$/i, '');
};
const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isImage = (f) => /^image\/(png|jpeg|webp)$/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name);

async function loadFiles(files) {
  const pages = [];
  for (const f of files) {
    try {
      if (isPdf(f)) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        pages.push(...(await openPdf(f.name, bytes, askPassword)).pages);
      } else if (isImage(f)) {
        pages.push(...(await openImage(f.name, f)).pages);
      } else toast(t('toast.unsupported', { name: f.name }), { err: true });
    } catch (e) {
      if (e instanceof Cancelled) continue;
      console.error(e);
      toast(t('toast.error', { name: f.name, msg: e.message || e }), { err: true, ms: 7000 });
    }
  }
  return pages;
}

async function openFiles(files, { replace = true } = {}) {
  files = [...files];
  if (!files.length) return;
  if (replace && isDirty() && !(await confirmBox(t('confirm.openTitle'), t('confirm.openBody'), t('confirm.openYes')))) return;
  busy(true, t('toast.opening'));
  try {
    if (replace) { reset(); forgetPages(); clearSheets(); }
    const pages = await loadFiles(files);
    if (!pages.length) return;
    if (replace) {
      doc.pages.push(...pages);
      ui.pageSel.clear();
      ui.sel = null;
      emit({ pages: true, items: true, forms: true, history: true });
      ui.autoFit = true;
      requestAnimationFrame(() => fitWidth(true));
    } else {
      insertPages(pages);
      toast(t(pages.length === 1 ? 'toast.added1' : 'toast.added', { n: pages.length }));
    }
  } finally { busy(false); }
}

function insertPages(pages, at = null) {
  const sel = doc.pages.filter((p) => ui.pageSel.has(p.id));
  const pos = at ?? (sel.length ? doc.pages.indexOf(sel[sel.length - 1]) + 1 : doc.pages.length);
  change((d) => d.pages.splice(pos, 0, ...pages), { pages: true, forms: true });
}

async function addFiles(files, at = null) {
  busy(true, t('toast.opening'));
  try {
    const pages = await loadFiles([...files]);
    if (pages.length) { insertPages(pages, at); toast(t(pages.length === 1 ? 'toast.added1' : 'toast.added', { n: pages.length })); }
  } finally { busy(false); }
}

async function openSample() {
  const r = await fetch(new URL('../demo/sample.pdf', import.meta.url));
  const blob = await r.blob();
  await openFiles([new File([blob], getLang() === 'tr' ? 'ornek-form.pdf' : 'sample-form.pdf', { type: 'application/pdf' })]);
}

async function saveBytes(bytes, name, mime = 'application/pdf') {
  if (window.tlkDesktop?.save) {
    const path = await window.tlkDesktop.save(name, bytes);
    return path ? path.split(/[\\/]/).pop() : null;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return name;
}

async function exportPages(list, label) {
  busy(true, t('toast.saving'));
  try {
    commitText();
    const { bytes, rasterised } = await buildPdf(list);
    for (const n of rasterised) toast(t('toast.raster', { name: n }), { ms: 9000 });
    return bytes;
  } catch (e) {
    console.error(e);
    toast(t('toast.saveFailed', { msg: e.message || e }), { err: true, ms: 8000 });
    return null;
  } finally { busy(false); }
}

async function saveAll() {
  if (!doc.pages.length) return;
  const bytes = await exportPages(doc.pages);
  if (!bytes) return;
  const name = await saveBytes(bytes, `${baseName()}-${t('name.edited')}.pdf`);
  if (name) { markClean(); toast(t('toast.saved', { name })); }
}

function selectedPages() {
  const list = doc.pages.filter((p) => ui.pageSel.has(p.id));
  if (!list.length && ui.current) { const p = pageById(ui.current); if (p) return [p]; }
  return list;
}

async function saveSelected() {
  const list = doc.pages.filter((p) => ui.pageSel.has(p.id));
  if (!list.length) return toast(t('toast.noSel'));
  const bytes = await exportPages(list);
  if (!bytes) return;
  const nums = list.map((p) => doc.pages.indexOf(p) + 1);
  const name = await saveBytes(bytes, `${baseName()}-${t('name.pages')}-${nums.length > 3 ? nums[0] + '-' + nums[nums.length - 1] : nums.join('-')}.pdf`);
  if (name) toast(t('toast.saved', { name }));
}

async function saveSplit() {
  if (!doc.pages.length) return;
  busy(true, t('toast.saving'));
  try {
    commitText();
    const files = {};
    const pad = String(doc.pages.length).length;
    for (let i = 0; i < doc.pages.length; i++) {
      const { bytes } = await buildPdf([doc.pages[i]]);
      files[`${baseName()}-${t('name.page')}-${String(i + 1).padStart(Math.max(2, pad), '0')}.pdf`] = bytes;
    }
    const zip = window.fflate.zipSync(files, { level: 0 });
    busy(false);
    const name = await saveBytes(zip, `${baseName()}-${t('name.pages')}.zip`, 'application/zip');
    if (name) toast(t('toast.saved', { name }));
  } catch (e) {
    console.error(e);
    toast(t('toast.saveFailed', { msg: e.message || e }), { err: true });
  } finally { busy(false); }
}

async function saveImages() {
  const bytes = await exportPages(doc.pages);
  if (!bytes) return;
  busy(true, t('toast.saving'));
  try {
    const pngs = await pdfToPngs(bytes, 2);
    const files = {};
    const pad = Math.max(2, String(pngs.length).length);
    pngs.forEach((b, i) => { files[`${baseName()}-${String(i + 1).padStart(pad, '0')}.png`] = b; });
    const zip = window.fflate.zipSync(files, { level: 0 });
    busy(false);
    const name = await saveBytes(zip, `${baseName()}-png.zip`, 'application/zip');
    if (name) toast(t('toast.saved', { name }));
  } finally { busy(false); }
}

/* ================================================================ sheets (the pages in the middle) */

const sheets = new Map(); // pageId -> { el, canvas, svg, task, key, visible }
const stage = $('stage');
const sheetsEl = $('sheets');
const cssScale = () => ui.zoom * PT;

const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const s = sheets.get(e.target.dataset.id);
    if (s) s.visible = e.isIntersecting;
  }
  scheduleRender();
}, { root: stage, rootMargin: '800px 0px' });

function clearSheets() {
  for (const s of sheets.values()) { s.task?.cancel(); io.unobserve(s.el); s.el.remove(); }
  sheets.clear();
}

function vpOf(p, scale = cssScale()) { return viewport(p.view, scale, totalRot(p)); }

function syncSheets() {
  const ids = new Set(doc.pages.map((p) => p.id));
  for (const [id, s] of sheets) if (!ids.has(id)) { s.task?.cancel(); io.unobserve(s.el); s.el.remove(); sheets.delete(id); }
  doc.pages.forEach((p, i) => {
    let s = sheets.get(p.id);
    if (!s) {
      const el = document.createElement('div');
      el.className = 'sheet loading';
      el.dataset.id = p.id;
      el.innerHTML = `<span class="pno"></span><canvas class="paper"></canvas><svg class="overlay" xmlns="http://www.w3.org/2000/svg"></svg>`;
      s = { el, canvas: el.querySelector('canvas'), svg: el.querySelector('svg'), task: null, key: '', visible: false };
      sheets.set(p.id, s);
      io.observe(el);
    }
    const vp = vpOf(p);
    s.el.style.width = vp.width + 'px';
    s.el.style.height = vp.height + 'px';
    s.el.querySelector('.pno').textContent = i + 1;
    if (sheetsEl.children[i] !== s.el) sheetsEl.insertBefore(s.el, sheetsEl.children[i] || null);
    drawOverlay(p.id);
  });
  scheduleRender();
}

let renderPending = false;
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; renderVisible(); });
}

let running = 0;
function renderVisible() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const p of doc.pages) {
    const s = sheets.get(p.id);
    if (!s) continue;
    if (!s.visible) {
      // Free the pixels of pages far off screen; they render again on return.
      if (s.key && s.canvas.width) { s.task?.cancel(); s.task = null; s.canvas.width = 0; s.key = ''; s.el.classList.add('loading'); }
      continue;
    }
    let scale = cssScale() * dpr;
    const vp = viewport(p.view, scale, totalRot(p));
    const px = vp.width * vp.height;
    if (px > 24e6) scale *= Math.sqrt(24e6 / px);
    const key = `${scale.toFixed(4)}|${totalRot(p)}|${ui.formVersion}`;
    if (s.key === key || running >= 3) continue;
    s.task?.cancel();
    s.key = key;
    running++;
    const canvas = document.createElement('canvas');
    const task = drawPage(p, canvas, scale);
    s.task = task;
    task.promise.then(() => {
      if (s.task !== task) return;
      canvas.className = 'paper';
      s.canvas.replaceWith(canvas);
      s.canvas = canvas;
      s.el.classList.remove('loading');
    }).catch((e) => {
      if (e?.name !== 'RenderingCancelledException') console.warn(e);
      if (s.task === task) s.key = '';
    }).finally(() => { running--; scheduleRender(); });
  }
}

/* ---------------------------------------------------------------- overlay */

const drag = { mode: null }; // live gesture state
const preview = new Map(); // itemId -> temporary item while dragging

function matrixAttr(m) { return `matrix(${m.map((v) => +v.toFixed(5)).join(' ')})`; }

function itemSvg(it, vp, stamp = false) {
  const op = it.opacity ?? 1;
  const cls = stamp ? 'stamp' : 'it';
  const id = stamp ? '' : ` data-id="${it.id}"`;
  if (it.type === 'ink') {
    const d = it.pts.map((p, k) => { const [x, y] = vp.toView(p[0], p[1]); return `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(' ') + (it.pts.length === 1 ? ' l0.01 0' : '');
    const w = it.width * vp.scale;
    return `<g class="${cls}"${id}><path d="${d}" fill="none" stroke="${it.color}" stroke-opacity="${op}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="${d}" fill="none" stroke="transparent" stroke-width="${Math.max(w, 12)}" pointer-events="stroke"/></g>`;
  }
  const m = matrixAttr(mul(vp.transform, localToUser(it)));
  let body = '';
  if (it.type === 'text') {
    const lines = it.text.split('\n').map((l, k) => `<tspan x="0" y="${it.size * (ASCENT + k * LINE)}">${esc(l) || ' '}</tspan>`).join('');
    body = `<text font-family="${FAM[it.font] || FAM.sans}" font-weight="${it.bold ? 700 : 400}" font-size="${it.size}" fill="${it.color}" fill-opacity="${op}" style="white-space:pre">${lines}</text>`
      + (stamp ? '' : `<rect width="${it.w}" height="${it.h}" fill="transparent"/>`);
  } else if (it.type === 'highlight') {
    body = `<rect width="${it.w}" height="${it.h}" fill="${it.color}" fill-opacity="${op}" style="mix-blend-mode:multiply"/>`;
  } else if (it.type === 'whiteout') {
    body = `<rect width="${it.w}" height="${it.h}" fill="${it.color || '#fff'}"/>`;
  } else if (it.type === 'box') {
    body = `<rect x="${it.width / 2}" y="${it.width / 2}" width="${Math.max(0, it.w - it.width)}" height="${Math.max(0, it.h - it.width)}" fill="${it.fill || 'transparent'}" fill-opacity="${it.fill ? op : 0}" stroke="${it.color}" stroke-opacity="${op}" stroke-width="${it.width}"/>`;
  } else if (it.type === 'image') {
    body = `<image href="${it.src}" width="${it.w}" height="${it.h}" preserveAspectRatio="none" opacity="${op}"/>`;
  } else if (it.type === 'mark') {
    if (it.kind === 'dot') body = `<circle cx="${it.w / 2}" cy="${it.h / 2}" r="${Math.min(it.w, it.h) * 0.32}" fill="${it.color}"/>`;
    else body = MARKS[it.kind].map((s) => `<path d="${s.map(([x, y], k) => `${k ? 'L' : 'M'}${x * it.w} ${y * it.h}`).join(' ')}" fill="none" stroke="${it.color}" stroke-width="${Math.max(1, it.w * 0.11)}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
    body += `<rect width="${it.w}" height="${it.h}" fill="transparent"/>`;
  }
  return `<g class="${cls}"${id} transform="${m}">${body}</g>`;
}

function drawOverlay(pageId) {
  const s = sheets.get(pageId);
  const p = pageById(pageId);
  if (!s || !p) return;
  const vp = vpOf(p);
  const n = doc.pages.indexOf(p) + 1;
  let html = '';
  for (const st of stampsFor(p, n, doc.pages.length, measure)) html += itemSvg(st, vp, true);
  for (const raw of itemsOf(pageId)) {
    if (editing && editing.itemId === raw.id) continue;
    html += itemSvg(preview.get(raw.id) || raw, vp);
  }
  if (ui.sel?.pageId === pageId) {
    const it = preview.get(ui.sel.itemId) || itemsOf(pageId).find((x) => x.id === ui.sel.itemId);
    if (it) {
      const b = viewBounds(it, vp);
      html += `<rect class="selbox" x="${b.x - 3}" y="${b.y - 3}" width="${b.w + 6}" height="${b.h + 6}"/>`;
      if (it.type !== 'ink') html += `<rect class="handle" data-handle="se" x="${b.x + b.w - 3}" y="${b.y + b.h - 3}" width="10" height="10" rx="2"/>`;
    }
  }
  if (drag.mode === 'rect' && drag.pageId === pageId) {
    const { x, y, w, h } = rectOf(drag);
    html += `<rect class="ghost" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  }
  if (drag.mode === 'ink' && drag.pageId === pageId && drag.pts.length) {
    const o = ui.opts.draw;
    html += `<path d="${drag.pts.map(([x, y], k) => `${k ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')}" fill="none" stroke="${o.color}" stroke-opacity="${o.opacity}" stroke-width="${o.width * vp.scale}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  s.svg.innerHTML = html;
}

function drawAllOverlays() { for (const p of doc.pages) drawOverlay(p.id); }

const rectOf = (d) => ({ x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0) });

function sheetPoint(e, s) {
  const r = s.el.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}

function findItem(pageId, id) { return itemsOf(pageId).find((x) => x.id === id); }

function select(pageId, itemId) {
  const prev = ui.sel?.pageId;
  ui.sel = itemId ? { pageId, itemId } : null;
  if (prev && prev !== pageId) drawOverlay(prev);
  if (pageId) drawOverlay(pageId);
  renderSide();
}

function addItem(pageId, it, { selectIt = false } = {}) {
  it.id = uid('i');
  change((d) => { (d.items[pageId] ||= []).push(it); }, { items: true });
  if (selectIt) select(pageId, it.id);
  return it;
}

function updateItem(pageId, itemId, fn, history = true) {
  const apply = (d) => { const it = (d.items[pageId] || []).find((x) => x.id === itemId); if (it) fn(it); };
  if (history) change(apply, { items: true });
  else { apply(doc); emit({ items: true }); }
}

function deleteItem(pageId, itemId) {
  change((d) => { d.items[pageId] = (d.items[pageId] || []).filter((x) => x.id !== itemId); }, { items: true });
  if (ui.sel?.itemId === itemId) select(null, null);
}

stage.addEventListener('pointerdown', (e) => {
  const sheetEl = e.target.closest('.sheet');
  if (!sheetEl || e.button > 0) return;
  if (editing && !e.target.closest('.text-editor')) { commitText(); if (ui.tool === 'text') return; }
  if (e.target.closest('.text-editor')) return;
  const pageId = sheetEl.dataset.id;
  const s = sheets.get(pageId);
  const p = pageById(pageId);
  const vp = vpOf(p);
  const [x, y] = sheetPoint(e, s);
  setCurrent(pageId);
  const hit = e.target.closest('.it[data-id]');
  const handle = e.target.closest('[data-handle]');
  const tool = ui.tool;

  if (tool === 'select' || (hit && tool !== 'text' && tool !== 'draw' && !['highlight', 'box', 'whiteout'].includes(tool))) {
    if (handle && ui.sel?.pageId === pageId) {
      const it = findItem(pageId, ui.sel.itemId);
      Object.assign(drag, { mode: 'resize', pageId, itemId: it.id, orig: structuredClone(it), x0: x, y0: y, vp, shift: e.shiftKey });
    } else if (hit) {
      const id = hit.dataset.id;
      select(pageId, id);
      const it = findItem(pageId, id);
      Object.assign(drag, { mode: 'move', pageId, itemId: id, orig: structuredClone(it), x0: x, y0: y, vp, moved: false });
      if (e.detail === 2 && it.type === 'text') { drag.mode = null; startText(pageId, it); return; }
    } else {
      select(null, null);
      return;
    }
    s.svg.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }

  if (tool === 'text') {
    const it = hit ? findItem(pageId, hit.dataset.id) : null;
    if (it?.type === 'text') startText(pageId, it);
    else startText(pageId, null, x, y);
    e.preventDefault();
    return;
  }
  if (tool === 'highlight' || tool === 'box' || tool === 'whiteout') {
    Object.assign(drag, { mode: 'rect', pageId, x0: x, y0: y, x1: x, y1: y, vp });
  } else if (tool === 'draw') {
    Object.assign(drag, { mode: 'ink', pageId, pts: [[x, y]], vp });
    drawOverlay(pageId);
  } else if (tool === 'signature') {
    if (!ui.signature) { newSignature(); return; }
    placeImage(pageId, vp, x, y, ui.signature, 150);
    return;
  } else if (tool === 'image') {
    if (!ui.image) { $('file-image').click(); return; }
    placeImage(pageId, vp, x, y, ui.image.src, 220);
    ui.image = null;
    setTool('select');
    return;
  } else if (tool === 'mark') {
    const o = ui.opts.mark;
    const sz = o.size * vp.scale;
    addItem(pageId, boxFromView(vp, x - sz / 2, y - sz / 2, sz, sz, { type: 'mark', kind: o.kind, color: o.color }));
    return;
  } else if (tool === 'date') {
    const o = ui.opts.date;
    const text = formatDate(o.fmt);
    const it = { type: 'text', text, size: o.size, font: o.font, bold: false, color: o.color };
    const { w, h } = textBox(it);
    addItem(pageId, boxFromView(vp, x, y - h * vp.scale * 0.6, w * vp.scale, h * vp.scale, it));
    return;
  } else return;
  s.svg.setPointerCapture(e.pointerId);
  e.preventDefault();
});

stage.addEventListener('pointermove', (e) => {
  if (!drag.mode) return;
  const s = sheets.get(drag.pageId);
  if (!s) return;
  const [x, y] = sheetPoint(e, s);
  if (drag.mode === 'rect') { drag.x1 = x; drag.y1 = y; drawOverlay(drag.pageId); }
  else if (drag.mode === 'ink') {
    const last = drag.pts[drag.pts.length - 1];
    if (Math.hypot(x - last[0], y - last[1]) >= 1.5) { drag.pts.push([x, y]); drawOverlay(drag.pageId); }
  } else if (drag.mode === 'move') {
    const dx = x - drag.x0, dy = y - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    const it = structuredClone(drag.orig);
    moveBy(it, drag.vp, dx, dy);
    preview.set(it.id, it);
    drawOverlay(drag.pageId);
  } else if (drag.mode === 'resize') {
    preview.set(drag.itemId, resized(drag.orig, drag.vp, x - drag.x0, y - drag.y0, e.shiftKey));
    drawOverlay(drag.pageId);
  }
});

function endDrag() {
  const d = { ...drag };
  drag.mode = null;
  if (!d.mode) return;
  const vp = d.vp;
  if (d.mode === 'rect') {
    const { x, y, w, h } = rectOf(d);
    if (w >= 4 && h >= 4) {
      const o = ui.opts[ui.tool];
      const extra = ui.tool === 'highlight' ? { type: 'highlight', color: o.color, opacity: o.opacity }
        : ui.tool === 'box' ? { type: 'box', color: o.color, width: o.width, fill: o.fill, opacity: o.opacity }
          : { type: 'whiteout', color: o.color };
      addItem(d.pageId, boxFromView(vp, x, y, w, h, extra));
    } else drawOverlay(d.pageId);
  } else if (d.mode === 'ink') {
    const o = ui.opts.draw;
    const pts = d.pts.map(([x, y]) => vp.toUser(x, y).map((v) => +v.toFixed(2)));
    addItem(d.pageId, { type: 'ink', pts, color: o.color, width: o.width, opacity: o.opacity });
  } else if (d.mode === 'move' || d.mode === 'resize') {
    const it = preview.get(d.itemId);
    preview.delete(d.itemId);
    if (it && (d.mode === 'resize' || d.moved)) updateItem(d.pageId, d.itemId, (x) => Object.assign(x, it));
    else drawOverlay(d.pageId);
  }
}
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

// Resizes from the bottom-right corner in the item's own axes.
function resized(orig, vp, dx, dy, free) {
  const it = structuredClone(orig);
  const [ax, ay] = vp.toUser(0, 0);
  const [bx, by] = vp.toUser(dx, dy);
  const du = [bx - ax, by - ay];
  const { u, v } = dirs(it.rot || 0);
  let ds = du[0] * u[0] + du[1] * u[1];
  let dt = -(du[0] * v[0] + du[1] * v[1]);
  const topLeft = pointAt(orig, 0, 0);
  if (it.type === 'text') {
    const k = clamp((orig.w + ds) / orig.w, 0.2, 20);
    it.size = clamp(+(orig.size * k).toFixed(1), 4, 400);
    Object.assign(it, textBox(it));
  } else {
    let w = Math.max(4, orig.w + ds);
    let h = Math.max(4, orig.h + dt);
    if ((it.type === 'image' || it.type === 'mark') && !free) { const k = Math.max(w / orig.w, h / orig.h); w = orig.w * k; h = orig.h * k; }
    it.w = w; it.h = h;
  }
  it.x = topLeft[0] - it.h * v[0];
  it.y = topLeft[1] - it.h * v[1];
  return it;
}

function placeImage(pageId, vp, x, y, src, maxW) {
  const img = new Image();
  img.onload = () => {
    const ratio = img.naturalHeight / img.naturalWidth;
    const w = maxW * vp.scale;
    const h = w * ratio;
    const it = addItem(pageId, boxFromView(vp, x - w / 2, y - h / 2, w, h, { type: 'image', src }));
    select(pageId, it.id);
    if (ui.tool === 'signature') setTool('select');
  };
  img.src = src;
}

function formatDate(fmt) {
  const d = new Date();
  const loc = getLang() === 'tr' ? 'tr-TR' : 'en-GB';
  if (fmt === 'iso') return d.toISOString().slice(0, 10);
  if (fmt === 'short') return d.toLocaleDateString(loc);
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
}

/* ---------------------------------------------------------------- text editing */

let editing = null; // { pageId, itemId | null, ta, vp, x, y, opts }

function startText(pageId, item, x, y) {
  commitText();
  const s = sheets.get(pageId);
  const p = pageById(pageId);
  const vp = vpOf(p);
  const o = item ? { font: item.font, size: item.size, color: item.color, bold: item.bold } : { ...ui.opts.text };
  let left = x, top = y;
  if (item) {
    const b = viewBounds(item, vp);
    left = b.x; top = b.y;
  }
  const ta = document.createElement('textarea');
  ta.className = 'text-editor';
  ta.spellcheck = false;
  ta.value = item ? item.text : '';
  Object.assign(ta.style, {
    left: left + 'px', top: top + 'px',
    font: `${o.bold ? 700 : 400} ${o.size * vp.scale}px "${FAM[o.font]}"`,
    color: o.color, lineHeight: String(LINE)
  });
  s.el.append(ta);
  editing = { pageId, itemId: item?.id || null, ta, vp, left, top, opts: o, item };
  const fit = () => {
    ta.style.width = '0px';
    ta.style.height = '0px';
    ta.style.width = Math.max(40, ta.scrollWidth + 8) + 'px';
    ta.style.height = ta.scrollHeight + 'px';
  };
  ta.addEventListener('input', fit);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); commitText(); }
    e.stopPropagation();
  });
  ta.addEventListener('blur', () => setTimeout(() => { if (editing?.ta === ta) commitText(); }, 0));
  fit();
  if (item) drawOverlay(pageId);
  ta.focus();
  if (item) ta.select();
}

function commitText() {
  if (!editing) return;
  const { pageId, itemId, ta, vp, left, top, opts, item } = editing;
  editing = null;
  ta.remove();
  const text = ta.value.replace(/\s+$/g, '');
  if (!text) {
    if (itemId) deleteItem(pageId, itemId); else drawOverlay(pageId);
    return;
  }
  const base = { type: 'text', text, font: opts.font, size: opts.size, bold: opts.bold, color: opts.color, opacity: item?.opacity ?? 1 };
  const { w, h } = textBox(base);
  if (item) {
    if (item.text === text) { drawOverlay(pageId); return; }
    const tl = pointAt(item, 0, 0);
    const { v } = dirs(item.rot);
    updateItem(pageId, itemId, (x) => Object.assign(x, base, { w, h, x: tl[0] - h * v[0], y: tl[1] - h * v[1] }));
  } else {
    addItem(pageId, boxFromView(vp, left, top, w * vp.scale, h * vp.scale, base));
  }
}

/* ================================================================ thumbnails */

const thumbsEl = $('thumbs');
const thumbs = new Map(); // pageId -> { el, key, task }
const tio = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const th = thumbs.get(e.target.dataset.id);
    if (th) th.visible = e.isIntersecting;
  }
  renderThumbs();
}, { root: thumbsEl, rootMargin: '400px 0px' });

function syncThumbs() {
  const ids = new Set(doc.pages.map((p) => p.id));
  for (const [id, th] of thumbs) if (!ids.has(id)) { th.task?.cancel(); tio.unobserve(th.el); th.el.remove(); thumbs.delete(id); }
  doc.pages.forEach((p, i) => {
    let th = thumbs.get(p.id);
    if (!th) {
      const el = document.createElement('div');
      el.className = 'thumb';
      el.dataset.id = p.id;
      el.draggable = true;
      el.setAttribute('role', 'option');
      el.innerHTML = `<div class="ph"></div><span class="n"></span>`;
      th = { el, key: '', task: null, visible: false };
      thumbs.set(p.id, th);
      tio.observe(el);
    }
    const W = 132;
    const vp = viewport(p.view, 1, totalRot(p));
    const h = Math.round((W * vp.height) / vp.width);
    const ph = th.el.firstElementChild;
    ph.style.width = W + 'px';
    ph.style.height = h + 'px';
    th.el.querySelector('.n').textContent = i + 1;
    th.el.setAttribute('aria-label', t('pages.page', { n: i + 1 }));
    th.el.classList.toggle('sel', ui.pageSel.has(p.id));
    th.el.setAttribute('aria-selected', ui.pageSel.has(p.id));
    th.el.classList.toggle('current', ui.current === p.id);
    if (thumbsEl.children[i] !== th.el) thumbsEl.insertBefore(th.el, thumbsEl.children[i] || null);
  });
  $('page-count').textContent = doc.pages.length || '';
  renderThumbs();
}

function renderThumbs() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (const p of doc.pages) {
    const th = thumbs.get(p.id);
    if (!th?.visible) continue;
    const vp = viewport(p.view, 1, totalRot(p));
    const scale = (132 * dpr) / vp.width;
    const key = `${totalRot(p)}|${ui.formVersion}`;
    if (th.key === key) continue;
    th.key = key;
    th.task?.cancel();
    const canvas = document.createElement('canvas');
    const task = drawPage(p, canvas, scale);
    th.task = task;
    task.promise.then(() => {
      if (th.task !== task) return;
      canvas.style.width = '132px';
      canvas.style.height = Math.round((132 * vp.height) / vp.width) + 'px';
      th.el.firstElementChild.replaceWith(canvas);
    }).catch(() => { if (th.task === task) th.key = ''; });
  }
}

thumbsEl.addEventListener('click', (e) => {
  const el = e.target.closest('.thumb');
  if (!el) return;
  const id = el.dataset.id;
  if (e.shiftKey && ui.pageAnchor) {
    const a = doc.pages.findIndex((p) => p.id === ui.pageAnchor);
    const b = doc.pages.findIndex((p) => p.id === id);
    if (!e.ctrlKey && !e.metaKey) ui.pageSel.clear();
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) ui.pageSel.add(doc.pages[i].id);
  } else if (e.ctrlKey || e.metaKey) {
    ui.pageSel.has(id) ? ui.pageSel.delete(id) : ui.pageSel.add(id);
    ui.pageAnchor = id;
  } else {
    ui.pageSel.clear();
    ui.pageSel.add(id);
    ui.pageAnchor = id;
  }
  scrollToPage(id);
  syncThumbs();
  updateButtons();
});

let dragIds = null;
thumbsEl.addEventListener('dragstart', (e) => {
  const el = e.target.closest('.thumb');
  if (!el) return;
  if (!ui.pageSel.has(el.dataset.id)) { ui.pageSel.clear(); ui.pageSel.add(el.dataset.id); syncThumbs(); }
  dragIds = doc.pages.filter((p) => ui.pageSel.has(p.id)).map((p) => p.id);
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'tlk-pages');
});
function dropTarget(e) {
  const el = e.target.closest('.thumb');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { el, after: e.clientY > r.top + r.height / 2 };
}
function clearDropMarks() { thumbsEl.querySelectorAll('.drop-before,.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after')); }
thumbsEl.addEventListener('dragover', (e) => {
  if (!dragIds && !e.dataTransfer.types.includes('Files')) return;
  e.preventDefault();
  e.stopPropagation();
  clearDropMarks();
  const tgt = dropTarget(e);
  if (tgt) tgt.el.classList.add(tgt.after ? 'drop-after' : 'drop-before');
});
thumbsEl.addEventListener('dragleave', (e) => { if (!thumbsEl.contains(e.relatedTarget)) clearDropMarks(); });
thumbsEl.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  clearDropMarks();
  const tgt = dropTarget(e);
  let at = doc.pages.length;
  if (tgt) at = doc.pages.findIndex((p) => p.id === tgt.el.dataset.id) + (tgt.after ? 1 : 0);
  if (e.dataTransfer.files.length && !dragIds) { addFiles(e.dataTransfer.files, at); return; }
  if (!dragIds) return;
  const ids = dragIds;
  dragIds = null;
  change((d) => {
    const moving = d.pages.filter((p) => ids.includes(p.id));
    const before = d.pages.slice(0, at).filter((p) => !ids.includes(p.id)).length;
    const rest = d.pages.filter((p) => !ids.includes(p.id));
    rest.splice(before, 0, ...moving);
    d.pages = rest;
  }, { pages: true });
});
thumbsEl.addEventListener('dragend', () => { dragIds = null; clearDropMarks(); });

function pageAction(act) {
  const list = selectedPages();
  if (!list.length) return toast(t('toast.noSel'));
  const ids = new Set(list.map((p) => p.id));
  if (act === 'rl' || act === 'rr') {
    change((d) => d.pages.forEach((p) => { if (ids.has(p.id)) p.rot = (p.rot + (act === 'rr' ? 90 : 270)) % 360; }), { pages: true });
  } else if (act === 'del') {
    const n = list.length;
    change((d) => { d.pages = d.pages.filter((p) => !ids.has(p.id)); for (const id of ids) delete d.items[id]; }, { pages: true });
    ui.pageSel.clear();
    if (ui.sel && ids.has(ui.sel.pageId)) ui.sel = null;
    toast(t(n === 1 ? 'toast.deleted1' : 'toast.deleted', { n }), { action: { label: t('toast.undo'), run: () => undo() } });
  } else if (act === 'dup') {
    change((d) => {
      const out = [];
      for (const p of d.pages) {
        out.push(p);
        if (ids.has(p.id)) {
          const c = { ...structuredClone(p), id: uid('p') };
          d.items[c.id] = structuredClone(d.items[p.id] || []).map((it) => ({ ...it, id: uid('i') }));
          out.push(c);
        }
      }
      d.pages = out;
    }, { pages: true });
  } else if (act === 'blank') {
    const last = list[list.length - 1];
    const at = doc.pages.indexOf(last) + 1;
    change((d) => d.pages.splice(at, 0, blankPage(last)), { pages: true });
  } else if (act === 'extract') saveSelected();
}
document.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => pageAction(b.dataset.page)));

function scrollToPage(id) {
  const s = sheets.get(id);
  if (s) stage.scrollTo({ top: s.el.offsetTop - 20, behavior: 'smooth' });
  setCurrent(id);
}

function setCurrent(id) {
  if (ui.current === id) return;
  ui.current = id;
  for (const [pid, th] of thumbs) th.el.classList.toggle('current', pid === id);
  thumbs.get(id)?.el.scrollIntoView({ block: 'nearest' });
}

stage.addEventListener('scroll', () => {
  const top = stage.getBoundingClientRect().top + 80;
  let best = null;
  for (const p of doc.pages) {
    const s = sheets.get(p.id);
    if (!s) continue;
    const r = s.el.getBoundingClientRect();
    if (r.top <= top) best = p.id; else { best ||= p.id; break; }
  }
  if (best) setCurrent(best);
}, { passive: true });

/* ================================================================ zoom */

function setZoom(z, keepCenter = true) {
  z = clamp(Math.round(z * 100) / 100, 0.25, 5);
  if (z === ui.zoom) return;
  const ratio = (stage.scrollTop + stage.clientHeight / 2) / Math.max(1, stage.scrollHeight);
  ui.zoom = z;
  $('b-zoom').textContent = Math.round(z * 100) + '%';
  commitText();
  syncSheets();
  if (keepCenter) stage.scrollTop = ratio * stage.scrollHeight - stage.clientHeight / 2;
}
function fitWidth(first = false) {
  if (!doc.pages.length) return;
  const widest = Math.max(...doc.pages.map((p) => viewport(p.view, 1, totalRot(p)).width));
  const avail = stage.clientWidth - (window.innerWidth < 860 ? 32 : 110);
  let z = avail / (widest * PT);
  if (first) z = Math.min(z, 1.5);
  setZoom(z, !first);
}
// Manual zoom turns off automatic fitting on window resize.
const zoomBy = (z) => { ui.autoFit = false; setZoom(z); };
$('b-zin').onclick = () => zoomBy(ui.zoom * 1.2);
$('b-zout').onclick = () => zoomBy(ui.zoom / 1.2);
$('b-zoom').onclick = () => zoomBy(1);
$('b-fit').onclick = () => { ui.autoFit = true; fitWidth(); };
stage.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  zoomBy(ui.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
}, { passive: false });

/* ================================================================ tools */

function setTool(tool) {
  commitText();
  ui.tool = tool;
  stage.dataset.tool = tool;
  document.querySelectorAll('.tool').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === tool));
  if (tool !== 'select' && ui.sel) select(null, null);
  ui.tab = 'tool';
  renderSide();
  if (tool === 'signature' && !ui.signature) {
    const saved = listSignatures();
    if (saved.length) ui.signature = saved[0];
  }
}
$('tools').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tool]');
  if (!b) return;
  setTool(b.dataset.tool);
  if (b.dataset.tool === 'image' && !ui.image) $('file-image').click();
});

$('file-image').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  ui.image = { src: await imageToDataUrl(f) };
  setTool('image');
  toast(t('img.ready'));
});

async function imageToDataUrl(file, max = 2400) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const png = file.type === 'image/png' || file.type === 'image/webp';
  return c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.92);
}

async function newSignature() {
  const url = await openSignatureDialog();
  if (url) { ui.signature = url; setTool('signature'); }
  else renderSide();
}

/* ================================================================ side panel */

function swatches(colors, value, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'swatches';
  const all = colors.includes(value?.toUpperCase?.()) || !value ? colors : [...colors, value];
  for (const c of all) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.background = c;
    b.title = c;
    b.setAttribute('aria-label', c);
    b.setAttribute('aria-pressed', String(c.toUpperCase() === String(value).toUpperCase()));
    b.onclick = () => onPick(c);
    wrap.append(b);
  }
  const custom = document.createElement('label');
  custom.className = 'swatch custom';
  custom.title = t('opt.custom');
  custom.innerHTML = `<input type="color" value="${/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}" aria-label="${esc(t('opt.custom'))}">`;
  custom.querySelector('input').addEventListener('change', (e) => onPick(e.target.value.toUpperCase()));
  wrap.append(custom);
  return wrap;
}

function field(label, control, out) {
  const f = document.createElement('div');
  f.className = 'field';
  const l = document.createElement(out !== undefined ? 'label' : 'span');
  l.className = out !== undefined ? '' : 'lbl';
  l.innerHTML = `<span>${esc(label)}</span>${out !== undefined ? `<output>${esc(out)}</output>` : ''}`;
  f.append(l, control);
  return f;
}

function seg(options, value, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'seg';
  for (const [v, label] of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(v === value));
    b.onclick = () => onPick(v);
    wrap.append(b);
  }
  return wrap;
}

function slider(min, max, step, value, onInput, fmt = (v) => v) {
  const inp = document.createElement('input');
  inp.type = 'range';
  inp.min = min; inp.max = max; inp.step = step; inp.value = value;
  let started = false;
  inp.addEventListener('input', () => {
    onInput(+inp.value, started);
    started = true;
    const out = inp.closest('.field')?.querySelector('output');
    if (out) out.textContent = fmt(+inp.value);
  });
  inp.addEventListener('change', () => { started = false; });
  return inp;
}

// Edits either the selected item or the options of the current tool.
function propEditor(kind, target, isItem) {
  const frag = document.createDocumentFragment();
  const set = (patch, live = false, started = false) => {
    if (isItem) {
      if (live) {
        if (!started) checkpoint();
        Object.assign(target, patch);
        if (target.type === 'text') { const tl = pointAt(target, 0, 0); Object.assign(target, textBox(target)); const { v } = dirs(target.rot); target.x = tl[0] - target.h * v[0]; target.y = tl[1] - target.h * v[1]; }
        emit({ items: true, history: true, keepSide: true });
      } else {
        updateItem(ui.sel.pageId, ui.sel.itemId, (x) => {
          const tl = pointAt(x, 0, 0);
          Object.assign(x, patch);
          if (x.type === 'text') { Object.assign(x, textBox(x)); const { v } = dirs(x.rot); x.x = tl[0] - x.h * v[0]; x.y = tl[1] - x.h * v[1]; }
        });
      }
    } else {
      Object.assign(target, patch);
      if (!live) renderSide();
    }
  };
  if (kind === 'text' || kind === 'date') {
    frag.append(field(t('opt.font'), seg([['sans', t('opt.sans')], ['serif', t('opt.serif')], ['mono', t('opt.mono')]], target.font, (v) => set({ font: v }))));
    const sz = field(t('opt.size'), slider(6, 96, 1, target.size, (v, s) => set({ size: v }, true, s), (v) => v + ' pt'), target.size + ' pt');
    frag.append(sz);
    if (kind === 'text') {
      const b = document.createElement('label');
      b.className = 'switch';
      b.innerHTML = `<input type="checkbox" ${target.bold ? 'checked' : ''}><span>${esc(t('opt.bold'))}</span>`;
      b.querySelector('input').onchange = (e) => set({ bold: e.target.checked });
      frag.append(b);
    }
    frag.append(field(t('opt.color'), swatches(PALETTE.text, target.color, (c) => set({ color: c }))));
    if (kind === 'date' && !isItem) {
      frag.append(field(t('opt.dateFmt'), seg([['long', formatDate('long')], ['short', formatDate('short')], ['iso', formatDate('iso')]], target.fmt, (v) => set({ fmt: v }))));
    }
  } else if (kind === 'highlight') {
    frag.append(field(t('opt.color'), swatches(PALETTE.highlight, target.color, (c) => set({ color: c }))));
    frag.append(field(t('opt.opacity'), slider(0.15, 1, 0.05, target.opacity, (v, s) => set({ opacity: v }, true, s), (v) => Math.round(v * 100) + '%'), Math.round(target.opacity * 100) + '%'));
  } else if (kind === 'draw' || kind === 'ink') {
    frag.append(field(t('opt.color'), swatches(PALETTE.draw, target.color, (c) => set({ color: c }))));
    frag.append(field(t('opt.width'), slider(0.5, 16, 0.5, target.width, (v, s) => set({ width: v }, true, s), (v) => v + ' pt'), target.width + ' pt'));
    frag.append(field(t('opt.opacity'), slider(0.1, 1, 0.05, target.opacity ?? 1, (v, s) => set({ opacity: v }, true, s), (v) => Math.round(v * 100) + '%'), Math.round((target.opacity ?? 1) * 100) + '%'));
  } else if (kind === 'box') {
    frag.append(field(t('opt.color'), swatches(PALETTE.box, target.color, (c) => set({ color: c }))));
    frag.append(field(t('opt.width'), slider(0.5, 12, 0.5, target.width, (v, s) => set({ width: v }, true, s), (v) => v + ' pt'), target.width + ' pt'));
    const fillWrap = document.createElement('div');
    fillWrap.className = 'swatches';
    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'btn line';
    none.style.height = '26px';
    none.textContent = t('opt.none');
    none.setAttribute('aria-pressed', String(!target.fill));
    none.onclick = () => set({ fill: null });
    fillWrap.append(none, ...swatches(['#FFFFFF', '#FFF4C2', '#E2E8FB', '#FDE2E0'], target.fill, (c) => set({ fill: c })).children);
    frag.append(field(t('opt.fill'), fillWrap));
  } else if (kind === 'whiteout') {
    frag.append(field(t('opt.color'), swatches(PALETTE.whiteout, target.color, (c) => set({ color: c }))));
  } else if (kind === 'mark') {
    frag.append(field(t('opt.kind'), seg([['check', t('opt.check')], ['cross', t('opt.cross')], ['dot', t('opt.dot')]], target.kind, (v) => set({ kind: v }))));
    frag.append(field(t('opt.color'), swatches(PALETTE.mark, target.color, (c) => set({ color: c }))));
    if (!isItem) frag.append(field(t('opt.size'), slider(6, 48, 1, target.size, (v) => set({ size: v }, true), (v) => v + ' pt'), target.size + ' pt'));
  } else if (kind === 'image') {
    frag.append(field(t('opt.opacity'), slider(0.1, 1, 0.05, target.opacity ?? 1, (v, s) => set({ opacity: v }, true, s), (v) => Math.round(v * 100) + '%'), Math.round((target.opacity ?? 1) * 100) + '%'));
  }
  return frag;
}

function renderToolPanel() {
  const panel = $('p-tool');
  panel.innerHTML = '';
  const sel = ui.sel ? findItem(ui.sel.pageId, ui.sel.itemId) : null;
  if (sel) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h3>${esc(t('sel.title'))}</h3>`;
    const kind = sel.type === 'ink' ? 'ink' : sel.type;
    card.append(propEditor(kind, sel, true));
    const acts = document.createElement('div');
    acts.className = 'sel-actions';
    const mk = (label, fn, cls = 'btn line') => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.onclick = fn; acts.append(b); };
    if (sel.type === 'text') mk(t('sel.edit'), () => startText(ui.sel.pageId, sel));
    mk(t('sel.dup'), duplicateSelected);
    mk(t('sel.front'), () => change((d) => { const arr = d.items[ui.sel.pageId]; const i = arr.findIndex((x) => x.id === sel.id); arr.push(...arr.splice(i, 1)); }, { items: true }));
    mk(t('sel.delete'), () => deleteItem(ui.sel.pageId, sel.id), 'btn line danger');
    card.append(acts);
    panel.append(card);
    return;
  }
  const tool = ui.tool;
  const p = document.createElement('p');
  p.className = 'hint';
  p.textContent = t('help.' + tool);
  panel.append(p);
  if (tool === 'signature') {
    const saved = listSignatures();
    const box = document.createElement('div');
    box.className = 'field';
    box.innerHTML = `<span class="lbl">${esc(t('sign.saved'))}</span>`;
    const list = document.createElement('div');
    list.className = 'sig-list';
    if (!saved.length && !ui.signature) list.innerHTML = `<p class="hint">${esc(t('sign.none'))}</p>`;
    const shown = ui.signature && !saved.includes(ui.signature) ? [ui.signature, ...saved] : saved;
    for (const url of shown) {
      const it = document.createElement('div');
      it.className = 'sig-item';
      it.setAttribute('role', 'button');
      it.tabIndex = 0;
      it.setAttribute('aria-pressed', String(url === ui.signature));
      it.innerHTML = `<img src="${url}" alt=""><button type="button" class="x" aria-label="${esc(t('sign.remove'))}" title="${esc(t('sign.remove'))}"><svg class="i"><use href="#i-x"/></svg></button>`;
      it.onclick = (e) => {
        if (e.target.closest('.x')) { removeSignature(url); if (ui.signature === url) ui.signature = null; renderSide(); return; }
        ui.signature = url; renderSide();
      };
      list.append(it);
    }
    box.append(list);
    panel.append(box);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn line';
    b.innerHTML = `<svg class="i"><use href="#i-sign"/></svg>${esc(t('sign.new'))}`;
    b.onclick = newSignature;
    panel.append(b);
    return;
  }
  if (tool === 'image') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn line';
    b.innerHTML = `<svg class="i"><use href="#i-image"/></svg>${esc(t('img.choose'))}`;
    b.onclick = () => $('file-image').click();
    panel.append(b);
    if (ui.image) { const img = document.createElement('img'); img.src = ui.image.src; img.style.maxWidth = '100%'; img.style.border = '1px solid var(--line)'; img.style.borderRadius = '6px'; panel.append(img); }
    return;
  }
  if (tool === 'select') return;
  panel.append(propEditor(tool, ui.opts[tool], false));
}

function duplicateSelected() {
  if (!ui.sel) return;
  const it = structuredClone(findItem(ui.sel.pageId, ui.sel.itemId));
  const p = pageById(ui.sel.pageId);
  moveBy(it, vpOf(p, 1), 12, 12);
  addItem(ui.sel.pageId, it, { selectIt: true });
}

function renderFormsPanel() {
  const panel = $('p-forms');
  panel.innerHTML = '';
  const withFields = sources.filter((s) => s.fields && doc.pages.some((p) => p.src === s.id));
  let count = 0;
  for (const s of withFields) count += Object.keys(s.fields).length;
  const badge = $('forms-badge');
  badge.hidden = !count;
  badge.textContent = count;
  if (!count) { panel.innerHTML = `<p class="hint">${esc(t('forms.none'))}</p>`; return; }
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = t('forms.hint');
  panel.append(hint);
  for (const s of withFields) {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h3><span>${esc(s.name)}</span><span class="fname">${esc(t('forms.fields', { n: Object.keys(s.fields).length }))}</span></h3>`;
    const list = document.createElement('div');
    list.className = 'form-list';
    for (const [name, widgets] of Object.entries(s.fields)) {
      const w = widgets[0];
      const val = fieldValue(s, name);
      const label = name.split('.').pop().replace(/[_]+/g, ' ');
      const id = 'f-' + s.id + '-' + name.replace(/[^a-z0-9]/gi, '_');
      let control;
      if (w.type === 'checkbox') {
        control = document.createElement('label');
        control.className = 'chk';
        control.innerHTML = `<input type="checkbox" id="${esc(id)}" ${val ? 'checked' : ''}><span>${esc(label)}</span>`;
        control.querySelector('input').onchange = (e) => setForm(s, name, e.target.checked, false);
        list.append(control);
        continue;
      }
      if (w.type === 'radiobutton') {
        control = document.createElement('select');
        control.className = 'inp';
        control.innerHTML = `<option value="">—</option>` + widgets.map((x) => `<option value="${esc(x.exportValues)}" ${x.exportValues === val ? 'selected' : ''}>${esc(x.exportValues)}</option>`).join('');
        control.onchange = (e) => setForm(s, name, e.target.value, false);
      } else if (w.type === 'combobox' || w.type === 'listbox') {
        control = document.createElement('select');
        control.className = 'inp';
        control.innerHTML = `<option value="">—</option>` + (w.items || []).map((o) => `<option value="${esc(o.exportValue)}" ${o.exportValue === val ? 'selected' : ''}>${esc(o.displayValue)}</option>`).join('');
        control.onchange = (e) => setForm(s, name, e.target.value, false);
      } else {
        control = document.createElement(w.multiline ? 'textarea' : 'input');
        control.className = 'inp';
        if (w.password) control.type = 'password';
        if (w.charLimit) control.maxLength = w.charLimit;
        control.value = val ?? '';
        let started = false;
        control.oninput = (e) => { setForm(s, name, e.target.value, true, started); started = true; };
        control.onchange = () => { started = false; };
      }
      control.id = id;
      const f = document.createElement('div');
      f.className = 'field';
      f.innerHTML = `<label for="${esc(id)}">${esc(label)}</label>`;
      f.append(control);
      list.append(f);
    }
    card.append(list);
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn line';
    reset.textContent = t('forms.reset');
    reset.onclick = async () => {
      if (!(await confirmBox(t('confirm.resetTitle'), t('confirm.resetBody'), t('confirm.resetYes')))) return;
      change((d) => { for (const k of Object.keys(d.forms)) if (k.startsWith(s.id + '|')) delete d.forms[k]; }, { forms: true });
      renderFormsPanel();
    };
    card.append(reset);
    panel.append(card);
  }
}

function setForm(s, name, value, live, started = false) {
  if (live) { if (!started) checkpoint(); doc.forms[formKey(s.id, name)] = value; emit({ forms: true, history: true, keepSide: true }); }
  else change((d) => { d.forms[formKey(s.id, name)] = value; }, { forms: true, keepSide: true });
}

function renderDocPanel() {
  const panel = $('p-doc');
  panel.innerHTML = '';
  const stats = document.createElement('p');
  stats.className = 'hint';
  stats.textContent = t('doc.stats', { n: doc.pages.length, f: new Set(doc.pages.map((p) => p.src).filter(Boolean)).size });
  panel.append(stats);

  const live = (fn) => { let started = false; return (e) => { if (!started) { checkpoint(); started = true; } fn(e); emit({ items: true, history: true, keepSide: true }); }; };

  // Details
  const info = document.createElement('div');
  info.className = 'card';
  info.innerHTML = `<h3>${esc(t('doc.info'))}</h3>`;
  for (const k of ['title', 'author', 'subject', 'keywords']) {
    const inp = document.createElement('input');
    inp.className = 'inp';
    inp.id = 'meta-' + k;
    inp.value = doc.meta[k];
    inp.oninput = live((e) => { doc.meta[k] = e.target.value; });
    const f = document.createElement('div');
    f.className = 'field';
    f.innerHTML = `<label for="meta-${k}">${esc(t('doc.' + k))}</label>`;
    f.append(inp);
    info.append(f);
  }
  panel.append(info);

  // Page numbers
  const nb = doc.numbers;
  const num = document.createElement('div');
  num.className = 'card';
  num.innerHTML = `<h3><span>${esc(t('doc.numbers'))}</span><label class="switch"><input type="checkbox" id="nb-on" ${nb.on ? 'checked' : ''}><span class="sr">${esc(t('doc.numbers'))}</span></label></h3>`;
  num.querySelector('#nb-on').onchange = (e) => change((d) => { d.numbers.on = e.target.checked; }, { items: true });
  if (nb.on) {
    const pos = document.createElement('select');
    pos.className = 'inp';
    pos.id = 'nb-pos';
    pos.innerHTML = ['tl', 'tc', 'tr', 'bl', 'bc', 'br'].map((p) => `<option value="${p}" ${p === nb.pos ? 'selected' : ''}>${esc(t('pos.' + p))}</option>`).join('');
    pos.onchange = (e) => change((d) => { d.numbers.pos = e.target.value; }, { items: true });
    num.append(field(t('doc.position'), pos));
    const row = document.createElement('div');
    row.className = 'row2';
    const fmt = document.createElement('select');
    fmt.className = 'inp';
    fmt.id = 'nb-fmt';
    const fmts = ['{n}', '{n} / {total}', getLang() === 'tr' ? 'Sayfa {n}' : 'Page {n}', getLang() === 'tr' ? 'Sayfa {n} / {total}' : 'Page {n} of {total}', '- {n} -'];
    fmt.innerHTML = fmts.map((f) => `<option ${f === nb.fmt ? 'selected' : ''}>${esc(f)}</option>`).join('');
    fmt.onchange = (e) => change((d) => { d.numbers.fmt = e.target.value; }, { items: true });
    const start = document.createElement('input');
    start.className = 'inp';
    start.type = 'number';
    start.min = 1;
    start.id = 'nb-start';
    start.value = nb.start;
    start.onchange = (e) => change((d) => { d.numbers.start = Math.max(1, parseInt(e.target.value, 10) || 1); }, { items: true });
    row.append(field(t('doc.format'), fmt), field(t('doc.start'), start));
    num.append(row);
    num.append(field(t('opt.size'), slider(6, 24, 1, nb.size, (v, s) => { if (!s) checkpoint(); doc.numbers.size = v; emit({ items: true, history: true, keepSide: true }); }, (v) => v + ' pt'), nb.size + ' pt'));
  }
  panel.append(num);

  // Watermark
  const wm = doc.watermark;
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<h3><span>${esc(t('doc.watermark'))}</span><label class="switch"><input type="checkbox" id="wm-on" ${wm.on ? 'checked' : ''}><span class="sr">${esc(t('doc.watermark'))}</span></label></h3>`;
  card.querySelector('#wm-on').onchange = (e) => change((d) => { d.watermark.on = e.target.checked; if (!d.watermark.text) d.watermark.text = t('doc.wmPh'); }, { items: true });
  if (wm.on) {
    const txt = document.createElement('input');
    txt.className = 'inp';
    txt.id = 'wm-text';
    txt.value = wm.text;
    txt.placeholder = t('doc.wmPh');
    txt.oninput = live((e) => { doc.watermark.text = e.target.value; });
    card.append(field(t('doc.wmText'), txt));
    const sl = (key, min, max, step, fmt) => field(t(key === 'size' ? 'opt.size' : key === 'opacity' ? 'opt.opacity' : 'doc.angle'),
      slider(min, max, step, wm[key], (v, s) => { if (!s) checkpoint(); doc.watermark[key] = v; emit({ items: true, history: true, keepSide: true }); }, fmt), fmt(wm[key]));
    card.append(sl('size', 16, 140, 1, (v) => v + ' pt'), sl('opacity', 0.05, 0.6, 0.01, (v) => Math.round(v * 100) + '%'), sl('angle', -90, 90, 5, (v) => v + '°'));
    card.append(field(t('opt.color'), swatches(['#C2362F', '#161B24', '#2449C9', '#6B7280'], wm.color, (c) => change((d) => { d.watermark.color = c; }, { items: true }))));
  }
  panel.append(card);
}

function renderSide() {
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === ui.tab)));
  $('p-tool').hidden = ui.tab !== 'tool';
  $('p-forms').hidden = ui.tab !== 'forms';
  $('p-doc').hidden = ui.tab !== 'doc';
  renderToolPanel();
  renderFormsPanel();
  renderDocPanel();
}
document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  ui.tab = b.dataset.tab;
  renderSide();
});

/* ================================================================ state changes */

function updateButtons() {
  const has = doc.pages.length > 0;
  $('b-undo').disabled = !canUndo();
  $('b-redo').disabled = !canRedo();
  $('b-save').disabled = !has;
  $('b-save-menu').disabled = !has;
  $('b-add').disabled = !has;
  document.querySelectorAll('[data-page]').forEach((b) => { b.disabled = !has; });
  $('empty').hidden = has;
  const dn = $('docname');
  dn.textContent = has ? (sources.length > 1 ? `${sources[0].name} +${sources.length - 1}` : sources[0]?.name || '') : '';
  dn.classList.toggle('dirty', isDirty());
}

let formTimer = 0;
onChange((what) => {
  if (what.reset) { clearSheets(); for (const th of thumbs.values()) th.el.remove(); thumbs.clear(); ui.sel = null; ui.pageSel.clear(); }
  if (what.pages) {
    for (const id of [...ui.pageSel]) if (!pageById(id)) ui.pageSel.delete(id);
    if (ui.sel && !pageById(ui.sel.pageId)) ui.sel = null;
    syncSheets();
    syncThumbs();
  } else if (what.items) drawAllOverlays();
  if (ui.sel && !findItem(ui.sel.pageId, ui.sel.itemId)) ui.sel = null;
  if (what.forms) {
    syncFormPreview();
    clearTimeout(formTimer);
    formTimer = setTimeout(() => { ui.formVersion++; scheduleRender(); renderThumbs(); }, 120);
  }
  if (!what.keepSide) renderSide();
  updateButtons();
});

/* ================================================================ topbar */

$('b-open').onclick = () => $('file-open').click();
$('e-open').onclick = () => $('file-open').click();
$('e-sample').onclick = openSample;
$('b-add').onclick = () => $('file-add').click();
$('file-open').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; openFiles(f); };
$('file-add').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; addFiles(f); };
$('b-undo').onclick = () => { commitText(); undo(); };
$('b-redo').onclick = () => { commitText(); redo(); };
$('b-save').onclick = saveAll;
const menu = $('save-menu');
$('b-save-menu').onclick = (e) => {
  e.stopPropagation();
  menu.hidden = !menu.hidden;
  $('b-save-menu').setAttribute('aria-expanded', String(!menu.hidden));
  if (!menu.hidden) menu.querySelector('button').focus();
};
document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('.menu-wrap')) { menu.hidden = true; $('b-save-menu').setAttribute('aria-expanded', 'false'); } });
menu.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  menu.hidden = true;
  ({ save: saveAll, extract: saveSelected, split: saveSplit, images: saveImages })[b.dataset.act]();
});
$('b-lang').onclick = () => { setLang(getLang() === 'tr' ? 'en' : 'tr'); refreshLang(); };
function refreshLang() {
  $('b-lang').textContent = getLang() === 'tr' ? 'EN' : 'TR';
  applyI18n();
  syncThumbs();
  renderSide();
  updateButtons();
}

function theme() {
  let v = null;
  try { v = localStorage.getItem('tlk-pdf-theme'); } catch { /* ignore */ }
  return v;
}
function applyTheme(v) {
  if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme;
  const dark = v ? v === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  $('b-theme').innerHTML = `<svg class="i"><use href="#i-${dark ? 'sun' : 'moon'}"/></svg>`;
}
$('b-theme').onclick = () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const v = dark ? 'light' : 'dark';
  try { localStorage.setItem('tlk-pdf-theme', v); } catch { /* ignore */ }
  applyTheme(v);
};

const app = $('app');
$('b-pages').onclick = () => { app.classList.toggle('show-pages'); app.classList.remove('show-side'); };
$('b-side').onclick = () => { app.classList.toggle('show-side'); app.classList.remove('show-pages'); };

function showHelp() {
  const rows = [
    ['Ctrl O', t('k.open')], ['Ctrl S', t('k.save')], ['Ctrl Z · Ctrl Y', t('k.undo')],
    ['V T H P R W S I K D', t('k.tools')], ['Delete', t('k.delete')], ['← ↑ → ↓', t('k.nudge')], ['Ctrl D', t('k.dup')],
    ['Ctrl + · Ctrl − · Ctrl 0', t('k.zoom')], ['Esc', t('k.escape')], ['', t('k.pages')]
  ];
  $('help-keys').innerHTML = rows.map(([k, v]) => `<span>${k.split(' · ').map((x) => x ? `<kbd>${esc(x)}</kbd>` : '').join(' ')}</span><span>${esc(v)}</span>`).join('');
  $('help-version').textContent = t('help.version', { v: VERSION });
  $('dlg-help').showModal();
}
$('b-help').onclick = showHelp;
$('help-close').onclick = () => $('dlg-help').close();

/* ================================================================ keyboard, drop, paste */

const TOOL_KEYS = { v: 'select', t: 'text', h: 'highlight', p: 'draw', r: 'box', w: 'whiteout', s: 'signature', i: 'image', k: 'mark', d: 'date' };
document.addEventListener('keydown', (e) => {
  // Letter shortcuts stay active on checkboxes, sliders and buttons.
  const typing = e.target.closest('textarea, select, [contenteditable], input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"])');
  const mod = e.ctrlKey || e.metaKey;
  if (document.querySelector('dialog[open]')) return;
  if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); $('file-open').click(); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (doc.pages.length) saveAll(); return; }
  if (typing) return;
  if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && (e.key === '+' || e.key === '=')) { e.preventDefault(); zoomBy(ui.zoom * 1.2); return; }
  if (mod && e.key === '-') { e.preventDefault(); zoomBy(ui.zoom / 1.2); return; }
  if (mod && e.key === '0') { e.preventDefault(); zoomBy(1); return; }
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelected(); return; }
  if (e.key === 'Escape') { if (ui.sel) select(null, null); else setTool('select'); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (ui.sel) { e.preventDefault(); deleteItem(ui.sel.pageId, ui.sel.itemId); }
    else if (document.activeElement === thumbsEl || thumbsEl.contains(document.activeElement)) { e.preventDefault(); pageAction('del'); }
    return;
  }
  if (ui.sel && e.key.startsWith('Arrow')) {
    e.preventDefault();
    const st = (e.shiftKey ? 10 : 1) * cssScale();
    const [dx, dy] = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
    const p = pageById(ui.sel.pageId);
    updateItem(ui.sel.pageId, ui.sel.itemId, (it) => moveBy(it, vpOf(p), dx, dy));
    return;
  }
  if (!mod && !e.altKey && TOOL_KEYS[e.key.toLowerCase()] && doc.pages.length) {
    setTool(TOOL_KEYS[e.key.toLowerCase()]);
    if (ui.tool === 'image' && !ui.image) $('file-image').click();
  }
});

const drop = $('drop');
window.addEventListener('dragover', (e) => {
  if (!e.dataTransfer.types.includes('Files')) return;
  e.preventDefault();
  drop.classList.add('over');
});
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.classList.remove('over'); });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  const files = [...e.dataTransfer.files];
  if (!files.length) return;
  if (doc.pages.length) addFiles(files); else openFiles(files);
});

document.addEventListener('paste', async (e) => {
  if (e.target.closest('input, textarea') || !doc.pages.length) return;
  const f = [...(e.clipboardData?.files || [])].find((x) => /^image\//.test(x.type));
  if (!f) return;
  e.preventDefault();
  const pageId = ui.current || doc.pages[0].id;
  const p = pageById(pageId);
  const vp = vpOf(p);
  const s = sheets.get(pageId);
  const r = s.el.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  const y = clamp(sr.top + sr.height / 2 - r.top, 40, vp.height - 40);
  placeImage(pageId, vp, vp.width / 2, y, await imageToDataUrl(f), 260);
});

window.addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });
let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (ui.autoFit) fitWidth(true); scheduleRender(); }, 150);
});

/* ================================================================ desktop, offline, updates */

if (window.tlkDesktop) {
  window.tlkDesktop.onOpen?.(async ({ name, bytes }) => {
    const file = new File([bytes], name, { type: name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '' });
    await openFiles([file]);
  });
  checkUpdate();
} else if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function checkUpdate() {
  try {
    const last = +localStorage.getItem('tlk-pdf-update-check') || 0;
    if (Date.now() - last < 864e5) return;
    localStorage.setItem('tlk-pdf-update-check', String(Date.now()));
    const r = await fetch('https://api.github.com/repos/Talkdedsec/tlk-pdf/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return;
    const rel = await r.json();
    const latest = String(rel.tag_name || '').replace(/^v/, '');
    const newer = latest.split('.').map(Number).some((n, i, a) => {
      const cur = VERSION.split('.').map(Number);
      for (let k = 0; k < 3; k++) { if ((a[k] || 0) !== (cur[k] || 0)) return (a[k] || 0) > (cur[k] || 0); }
      return false;
    });
    if (newer) toast(t('toast.update', { v: latest }), { ms: 15000, action: { label: t('toast.download'), run: () => window.open(rel.html_url, '_blank') } });
  } catch { /* offline */ }
}

/* ================================================================ start */

async function start() {
  applyTheme(theme());
  applyI18n();
  refreshLang();
  $('b-zoom').textContent = '100%';
  renderSide();
  updateButtons();
  await Promise.all(['400', '700'].flatMap((w) => Object.values(FAM).map((f) => document.fonts.load(`${w} 16px "${f}"`).catch(() => {}))));
  if (location.hash === '#sample') await openSample();
}

// Test and automation hooks.
window.TLKPDF = {
  version: VERSION,
  doc, ui, sources,
  ready: start(),
  open: (name, bytes, type = 'application/pdf') => openFiles([new File([bytes], name, { type })]),
  add: (name, bytes, type = 'application/pdf') => addFiles([new File([bytes], name, { type })]),
  build: async (ids) => (await buildPdf(ids ? doc.pages.filter((p) => ids.includes(p.id)) : doc.pages)).bytes,
  addItem: (pageIndex, it) => addItem(doc.pages[pageIndex].id, it),
  setTool, setZoom, pageAction, undo, redo,
  fill: (name, value) => { const s = sources.find((x) => x.fields?.[name]); if (s) setForm(s, name, value, false); },
  tab: (name) => { ui.tab = name; renderSide(); },
  rendered: () => doc.pages.every((p) => !sheets.get(p.id)?.visible || !sheets.get(p.id).el.classList.contains('loading')),
  measure
};
