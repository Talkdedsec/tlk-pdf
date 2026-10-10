// End-to-end checks in a real browser: opening, every tool, forms, page
// operations, undo, every way of saving, and the saved files themselves.
import { readFile, mkdir } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { unzipSync } from 'fflate';
import { open } from './browser.mjs';

const ROOT = new URL('..', import.meta.url);
const shots = process.env.SHOT_DIR;
const pkg = JSON.parse(await readFile(new URL('package.json', ROOT), 'utf8'));
const webVersion = /VERSION = '([^']+)'/.exec(await readFile(new URL('web/js/version.js', ROOT), 'utf8'))[1];
const swVersion = /tlk-pdf-([\d.]+)'/.exec(await readFile(new URL('web/sw.js', ROOT), 'utf8'))[1];
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log((ok ? '  ok   ' : '  FAIL ') + msg); };

async function pdfText(bytes) {
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, verbosity: 0 });
  const d = await task.promise;
  const out = [];
  for (let i = 1; i <= d.numPages; i++) out.push((await (await d.getPage(i)).getTextContent()).items.map((x) => x.str).join(' '));
  await task.destroy();
  return out;
}
const settle = (page, ms = 300) => page.waitForTimeout(ms);
async function rendered(page) { await page.waitForFunction(() => window.TLKPDF.rendered(), null, { timeout: 15000 }); }
async function sheetBox(page, i) { return page.locator('.sheet').nth(i).boundingBox(); }
async function build(page) { return Buffer.from(await page.evaluate(async () => Array.from(await window.TLKPDF.build()))); }
async function download(page, click) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  const path = await dl.path();
  return { name: dl.suggestedFilename(), bytes: await readFile(path) };
}

const { page, errors, url, close } = await open();
try {
  await page.goto(url);
  await page.evaluate(() => window.TLKPDF.ready);
  check(pkg.version === webVersion && pkg.version === swVersion, `version ${pkg.version} matches web (${webVersion}) and offline cache (${swVersion})`);
  check(await page.locator('#empty').isVisible(), 'empty state is shown');
  if (shots) { await mkdir(shots, { recursive: true }); await page.screenshot({ path: `${shots}/01-empty.png` }); }

  /* open the sample */
  await page.click('#e-sample');
  await page.waitForFunction(() => window.TLKPDF.doc.pages.length === 2);
  await rendered(page);
  check(await page.locator('.sheet').count() === 2, 'sample opens with 2 pages');
  check(await page.locator('.thumb').count() === 2, 'page list shows 2 thumbnails');
  await page.waitForFunction(() => document.querySelector('.sheet canvas.paper')?.width > 400, null, { timeout: 15000 });
  const lit = await page.evaluate(() => {
    const c = document.querySelector('.sheet canvas.paper');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 40) if (d[i] < 120) dark++;
    return { w: c.width, dark };
  });
  check(lit.w > 400 && lit.dark > 200, `first page is drawn (${lit.w}px wide, ${lit.dark} dark samples)`);

  /* forms */
  await page.click('#tab-forms');
  check(await page.locator('#forms-badge').textContent() === '8', 'form tab finds 8 fields');
  const nameField = page.locator('#p-forms input.inp').first();
  await nameField.fill('Ayşe Yılmaz Çağrı');
  await page.locator('#p-forms select').nth(0).selectOption('Türkiye');
  await page.locator('#p-forms select').nth(1).selectOption('Yearly');
  await page.locator('#p-forms input[type="checkbox"]').check();
  await settle(page, 500);
  const forms = await page.evaluate(() => window.TLKPDF.doc.forms);
  check(Object.values(forms).includes('Ayşe Yılmaz Çağrı') && Object.values(forms).includes('Yearly') && Object.values(forms).includes(true), 'form values are stored');

  /* text tool */
  const b0 = await sheetBox(page, 0);
  await page.keyboard.press('t');
  await page.mouse.click(b0.x + 80, b0.y + 560);
  await page.waitForSelector('.text-editor');
  await page.keyboard.type('Şükrü İğdır test');
  await page.keyboard.press('Escape');
  await settle(page);
  let items = await page.evaluate(() => Object.values(window.TLKPDF.doc.items).flat());
  check(items.some((x) => x.type === 'text' && x.text === 'Şükrü İğdır test'), 'text tool adds Turkish text');

  /* highlight, box, white-out, draw */
  const drag = async (tool, x0, y0, x1, y1) => {
    await page.keyboard.press(tool);
    await page.mouse.move(b0.x + x0, b0.y + y0);
    await page.mouse.down();
    await page.mouse.move(b0.x + (x0 + x1) / 2, b0.y + (y0 + y1) / 2, { steps: 4 });
    await page.mouse.move(b0.x + x1, b0.y + y1, { steps: 4 });
    await page.mouse.up();
    await settle(page, 150);
  };
  await drag('h', 70, 160, 330, 182);
  await drag('r', 60, 420, 300, 470);
  await drag('w', 400, 600, 480, 630);
  await drag('p', 300, 700, 420, 740);
  await page.keyboard.press('k');
  await page.mouse.click(b0.x + 66, b0.y + 525);
  await page.keyboard.press('d');
  await page.mouse.click(b0.x + 380, b0.y + 525);
  items = await page.evaluate(() => Object.values(window.TLKPDF.doc.items).flat().map((x) => x.type));
  for (const tp of ['highlight', 'box', 'whiteout', 'ink', 'mark']) check(items.includes(tp), `${tp} tool adds an item`);
  check(items.filter((x) => x === 'text').length === 2, 'date tool adds a date');

  /* select, move, resize, delete, undo */
  await page.keyboard.press('v');
  const before = await page.evaluate(() => structuredClone(Object.values(window.TLKPDF.doc.items).flat().find((x) => x.type === 'box')));
  const boxEl = page.locator('.overlay g.it').nth(2);
  const bb = await boxEl.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2 + 40, bb.y + 32, { steps: 5 });
  await page.mouse.up();
  await settle(page);
  const after = await page.evaluate((id) => Object.values(window.TLKPDF.doc.items).flat().find((x) => x.id === id), before.id);
  check(Math.abs(after.x - before.x - 30) < 3 && Math.abs(after.y - before.y + 22.5) < 3, `selected box moves by 30, -22.5 pt (${(after.x - before.x).toFixed(1)}, ${(after.y - before.y).toFixed(1)})`);
  const handle = await page.locator('.overlay .handle').boundingBox();
  await page.mouse.move(handle.x + 4, handle.y + 4);
  await page.mouse.down();
  await page.mouse.move(handle.x + 44, handle.y + 24, { steps: 4 });
  await page.mouse.up();
  await settle(page);
  const resized = await page.evaluate((id) => Object.values(window.TLKPDF.doc.items).flat().find((x) => x.id === id), before.id);
  check(Math.abs(resized.w - before.w - 30) < 3 && Math.abs(resized.h - before.h - 15) < 3, `corner handle resizes the box (+${(resized.w - before.w).toFixed(1)} × +${(resized.h - before.h).toFixed(1)} pt)`);
  await page.keyboard.press('Delete');
  const countAfterDelete = await page.evaluate(() => Object.values(window.TLKPDF.doc.items).flat().length);
  await page.keyboard.press('Control+z');
  const countAfterUndo = await page.evaluate(() => Object.values(window.TLKPDF.doc.items).flat().length);
  check(countAfterUndo === countAfterDelete + 1, 'Delete removes the item and Ctrl+Z brings it back');

  /* signature: draw in the dialog, then place */
  await page.keyboard.press('Escape');
  await page.keyboard.press('s');
  const b1 = await sheetBox(page, 1);
  await page.locator('.sheet').nth(1).scrollIntoViewIfNeeded();
  const b1b = await sheetBox(page, 1);
  const sigY = Math.min(b1b.y + b1b.height - 160, 860);
  await page.mouse.click(b1b.x + 160, sigY);
  await page.waitForSelector('#dlg-sign[open]');
  const pad = await page.locator('#sign-pad').boundingBox();
  await page.mouse.move(pad.x + 40, pad.y + 120);
  await page.mouse.down();
  for (let i = 0; i <= 24; i++) await page.mouse.move(pad.x + 40 + i * 16, pad.y + 110 + Math.sin(i / 2) * 40);
  await page.mouse.up();
  if (shots) await page.screenshot({ path: `${shots}/02-signature.png` });
  await page.click('#sign-ok');
  await page.waitForSelector('#dlg-sign', { state: 'hidden' });
  await page.mouse.click(b1b.x + 160, sigY);
  await settle(page, 500);
  items = await page.evaluate(() => Object.values(window.TLKPDF.doc.items).flat());
  check(items.some((x) => x.type === 'image' && x.src.startsWith('data:image/png')), 'signature is drawn and placed');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('tlk-pdf-signatures') || '[]').length) === 1, 'signature is remembered on this device');
  void b1;

  /* page operations */
  await page.locator('.thumb').first().click();
  await page.click('[data-page="rr"]');
  check(await page.evaluate(() => window.TLKPDF.doc.pages[0].rot) === 90, 'rotate right turns page 1 by 90°');
  await page.click('[data-page="dup"]');
  check(await page.evaluate(() => window.TLKPDF.doc.pages.length) === 3, 'duplicate adds a page');
  await page.keyboard.press('Control+z');
  check(await page.evaluate(() => window.TLKPDF.doc.pages.length) === 2, 'undo removes the duplicate');
  await rendered(page);
  if (shots) await page.screenshot({ path: `${shots}/03-edited.png` });

  /* save: the original file is edited in place, so fields stay fillable */
  let bytes = await build(page);
  let pdf = await PDFDocument.load(bytes);
  check(pdf.getPageCount() === 2, 'saved file has 2 pages');
  check(pdf.getPage(0).getRotation().angle === 90, 'saved page 1 is rotated 90°');
  const f = pdf.getForm();
  check(f.getTextField('Full name').getText() === 'Ayşe Yılmaz Çağrı', 'form field keeps the Turkish value and stays fillable');
  check(f.getRadioGroup('Plan').getSelected() === 'Yearly' && f.getCheckBox('Newsletter').isChecked() && f.getDropdown('Country').getSelected()[0] === 'Türkiye', 'radio, checkbox and dropdown values are saved');
  let text = await pdfText(bytes);
  check(text[0].includes('Şükrü İğdır test'), 'added text is real, searchable text in the saved file');

  /* copy mode: a blank page forces a rebuilt file with flattened fields */
  await page.locator('.thumb').nth(1).click();
  await page.click('[data-page="blank"]');
  await page.evaluate(() => { const d = window.TLKPDF.doc; d.numbers.on = true; d.watermark.on = true; d.watermark.text = 'TASLAK'; });
  bytes = await build(page);
  pdf = await PDFDocument.load(bytes);
  text = await pdfText(bytes);
  check(pdf.getPageCount() === 3, 'blank page is inserted (3 pages)');
  check(pdf.getForm().getFields().length === 0 && text[0].includes('Ayşe Yılmaz Çağrı'), 'rebuilt file has flattened fields with the typed values');
  check(text[2].includes('3 / 3') && text[1].includes('TASLAK'), 'page numbers and watermark are written');

  /* real downloads */
  const saved = await download(page, () => page.click('#b-save'));
  check(/-edited\.pdf$/.test(saved.name) && saved.bytes.subarray(0, 5).toString() === '%PDF-', `Save downloads ${saved.name}`);
  await page.click('#b-save-menu');
  const split = await download(page, () => page.click('[data-act="split"]'));
  const files = Object.keys(unzipSync(new Uint8Array(split.bytes)));
  check(files.length === 3 && files.every((n) => n.endsWith('.pdf')), `split gives a ZIP of 3 PDFs (${split.name})`);
  await page.click('#b-save-menu');
  const imgs = await download(page, () => page.click('[data-act="images"]'));
  const pngs = Object.values(unzipSync(new Uint8Array(imgs.bytes)));
  check(pngs.length === 3 && pngs.every((b) => b[1] === 0x50 && b[2] === 0x4e), 'pages as images gives 3 PNG files');

  /* add an image as a page */
  const png = await page.evaluate(async () => {
    const c = new OffscreenCanvas(400, 300);
    const g = c.getContext('2d');
    g.fillStyle = '#2449C9'; g.fillRect(0, 0, 400, 300);
    g.fillStyle = '#fff'; g.fillRect(40, 40, 120, 80);
    return Array.from(new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer()));
  });
  await page.evaluate((b) => window.TLKPDF.add('photo.png', new Uint8Array(b), 'image/png'), png);
  await page.waitForFunction(() => window.TLKPDF.doc.pages.length === 4);
  bytes = await build(page);
  pdf = await PDFDocument.load(bytes);
  check(pdf.getPageCount() === 4 && pdf.getPages().some((pg) => Math.abs(pg.getHeight() / pg.getWidth() - 0.75) < 0.01), 'an image becomes a page with its own proportions');

  /* language */
  await page.click('#b-lang');
  check((await page.locator('#b-save span').textContent()) === 'PDF olarak kaydet', 'interface switches to Turkish');
  await page.click('#b-lang');

  /* reopening asks before discarding changes */
  await page.evaluate(() => { document.getElementById('file-open').click = () => {}; });
  const sample = await readFile(new URL('web/demo/sample.pdf', ROOT));
  const opening = page.evaluate((b) => window.TLKPDF.open('again.pdf', new Uint8Array(b)), Array.from(sample));
  await page.waitForSelector('#dlg-confirm[open]');
  await page.click('#confirm-yes');
  await opening;
  check(await page.evaluate(() => window.TLKPDF.doc.pages.length === 2 && Object.keys(window.TLKPDF.doc.items).length === 0), 'opening another file asks first, then starts clean');

  /* dark theme and narrow screen render without errors */
  await page.click('#b-theme');
  await page.setViewportSize({ width: 390, height: 800 });
  await settle(page, 400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, 'no horizontal page scroll at phone width');
  if (shots) await page.screenshot({ path: `${shots}/04-phone-dark.png` });

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await close();
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
