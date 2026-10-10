// Signature dialog: draw, type or upload a signature. The result is a
// trimmed PNG with a transparent background. Saved signatures stay in this
// browser's local storage only.
import { t } from './i18n.js';

const KEY = 'tlk-pdf-signatures';
const INKS = ['#111827', '#1E3A8A', '#2449C9'];

export function listSignatures() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]').filter((s) => typeof s === 'string'); } catch { return []; }
}
function store(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 8))); } catch { /* storage full or blocked */ }
}
export function removeSignature(url) { store(listSignatures().filter((s) => s !== url)); }
function keep(url) { store([url, ...listSignatures().filter((s) => s !== url)]); }

// Crops to the inked area; optionally turns a light background transparent.
function trim(canvas, knockOutWhite = false) {
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const { width: w, height: h } = canvas;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (knockOutWhite) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        // Fade out paper: full transparency above 215, full ink below 140.
        const a = lum >= 215 ? 0 : lum <= 140 ? 255 : Math.round(((215 - lum) / 75) * 255);
        d[i + 3] = Math.min(d[i + 3], a);
      }
      if (d[i + 3] > 12) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return null;
  if (knockOutWhite) g.putImageData(img, 0, 0);
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

let wired = false;
let state = null;

function wire() {
  if (wired) return;
  wired = true;
  const dlg = document.getElementById('dlg-sign');
  const pad = document.getElementById('sign-pad');
  const g = pad.getContext('2d');
  const colors = document.getElementById('sign-colors');
  colors.innerHTML = INKS.map((c, i) => `<button type="button" class="swatch" style="background:${c}" data-c="${c}" aria-pressed="${i === 0}" aria-label="${c}"></button>`).join('');
  colors.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    state.ink = b.dataset.c;
    colors.querySelectorAll('[data-c]').forEach((x) => x.setAttribute('aria-pressed', x === b));
    if (state.mode === 'type') renderTyped();
  });

  const modeSeg = document.getElementById('sign-mode');
  modeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) setMode(b.dataset.mode);
  });

  // Drawing with smoothed strokes; pressure changes the width on pens.
  let last = null;
  const pos = (e) => {
    const r = pad.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * pad.width, ((e.clientY - r.top) / r.height) * pad.height];
  };
  pad.addEventListener('pointerdown', (e) => {
    pad.setPointerCapture(e.pointerId);
    last = { p: pos(e), mid: pos(e) };
    state.drawn = true;
    g.fillStyle = state.ink;
    g.beginPath();
    g.arc(last.p[0], last.p[1], 2.4, 0, Math.PI * 2);
    g.fill();
  });
  pad.addEventListener('pointermove', (e) => {
    if (!last) return;
    const p = pos(e);
    const mid = [(last.p[0] + p[0]) / 2, (last.p[1] + p[1]) / 2];
    g.strokeStyle = state.ink;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = e.pointerType === 'pen' && e.pressure ? 2 + e.pressure * 5 : 4.6;
    g.beginPath();
    g.moveTo(last.mid[0], last.mid[1]);
    g.quadraticCurveTo(last.p[0], last.p[1], mid[0], mid[1]);
    g.stroke();
    last = { p, mid };
  });
  const end = () => { last = null; };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);

  const typed = document.getElementById('sign-text');
  typed.addEventListener('input', renderTyped);

  document.getElementById('sign-file').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const bmp = await createImageBitmap(f);
    const c = document.createElement('canvas');
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    state.upload = trim(c, true);
  });

  document.getElementById('sign-clear').addEventListener('click', () => {
    g.clearRect(0, 0, pad.width, pad.height);
    state.drawn = false;
    typed.value = '';
    state.upload = null;
    document.getElementById('sign-file').value = '';
  });
  document.getElementById('sign-cancel').addEventListener('click', () => { dlg.close(); state.resolve(null); });
  dlg.addEventListener('cancel', () => state.resolve(null));
  document.getElementById('sign-ok').addEventListener('click', () => {
    let url = null;
    if (state.mode === 'draw' && state.drawn) url = trim(pad);
    else if (state.mode === 'type' && typed.value.trim()) url = trim(renderTyped(true));
    else if (state.mode === 'upload') url = state.upload;
    if (!url) {
      alertInline(t('sign.empty'));
      return;
    }
    if (document.getElementById('sign-keep').checked) keep(url);
    dlg.close();
    state.resolve(url);
  });

  function setMode(m) {
    state.mode = m;
    modeSeg.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === m));
    document.getElementById('sign-draw').hidden = m !== 'draw';
    document.getElementById('sign-type').hidden = m !== 'type';
    document.getElementById('sign-upload').hidden = m !== 'upload';
    if (m === 'type') typed.focus();
  }
  state = { setMode };

  function renderTyped(forExport) {
    const c = document.createElement('canvas');
    c.width = 1400;
    c.height = 300;
    const cg = c.getContext('2d');
    cg.fillStyle = state.ink;
    cg.font = '150px "TLK Script", cursive';
    cg.textBaseline = 'middle';
    cg.fillText(typed.value.trim(), 30, 150, 1340);
    typed.style.color = state.ink;
    return forExport ? c : null;
  }

  function alertInline(msg) {
    const id = 'sign-msg';
    let p = document.getElementById(id);
    if (!p) {
      p = document.createElement('p');
      p.id = id;
      p.className = 'hint';
      p.style.color = 'var(--danger)';
      document.querySelector('#sign-form .acts').before(p);
    }
    p.textContent = msg;
  }
}

export function openSignatureDialog() {
  wire();
  const dlg = document.getElementById('dlg-sign');
  const setMode = state.setMode;
  return new Promise((resolve) => {
    state = { ...state, setMode, resolve, mode: 'draw', ink: INKS[0], drawn: false, upload: null };
    document.getElementById('sign-pad').getContext('2d').clearRect(0, 0, 1000, 380);
    document.getElementById('sign-text').value = '';
    document.getElementById('sign-file').value = '';
    document.getElementById('sign-msg')?.remove();
    document.querySelectorAll('#sign-colors [data-c]').forEach((x, i) => x.setAttribute('aria-pressed', i === 0));
    setMode('draw');
    dlg.showModal();
  });
}
