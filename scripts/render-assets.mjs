// Renders the icons, the README screenshots and the social banner from the
// real app. Run after changing the interface: npm run assets
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { open } from './browser.mjs';

const root = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
await mkdir(root('docs'), { recursive: true });
await mkdir(root('build'), { recursive: true });

const svg = await readFile(root('web/icons/icon.svg'), 'utf8');

// Icons: PNG at every size, plus a Windows .ico that holds PNG frames.
{
  const { page, close } = await open({ width: 512, height: 512 });
  const pngs = {};
  for (const size of [16, 24, 32, 48, 64, 128, 192, 256, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    pngs[size] = await page.screenshot({ omitBackground: true });
  }
  await writeFile(root('web/icons/icon-192.png'), pngs[192]);
  await writeFile(root('web/icons/icon-512.png'), pngs[512]);
  await writeFile(root('build/icon.png'), pngs[512]);
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const head = Buffer.alloc(6 + sizes.length * 16);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    head.writeUInt8(s >= 256 ? 0 : s, e);
    head.writeUInt8(s >= 256 ? 0 : s, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(pngs[s].length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += pngs[s].length;
  });
  await writeFile(root('build/icon.ico'), Buffer.concat([head, ...sizes.map((s) => pngs[s])]));
  await close();
}

// A filled-in, marked-up sample, the way someone would actually use it.
async function stage(page, lang) {
  const tr = lang === 'tr';
  await page.evaluate(() => window.TLKPDF.ready);
  await page.click('#e-sample');
  await page.waitForFunction(() => window.TLKPDF.doc.pages.length === 2);
  await page.evaluate(async (tr) => {
    const T = window.TLKPDF;
    const vals = tr
      ? { 'Full name': 'Ayşe Yılmaz', 'Date of birth': '14.03.1994', Email: 'ayse@ornek.com.tr', Phone: '+90 532 555 01 23', Address: 'Bağdat Caddesi 210/4\nKadıköy, İstanbul', Country: 'Türkiye', Plan: 'Yearly', Newsletter: true }
      : { 'Full name': 'Ada Lovelace', 'Date of birth': '10/12/1990', Email: 'ada@example.org', Phone: '+44 20 7946 0958', Address: '12 Analytical Row\nLondon NW1', Country: 'United Kingdom', Plan: 'Yearly', Newsletter: true };
    for (const [k, v] of Object.entries(vals)) T.fill(k, v);
    const H = 841.89;
    T.addItem(0, { type: 'highlight', x: 54, y: H - 138, w: 300, h: 15, rot: 0, color: '#FFD84A', opacity: 0.55 });
    const note = tr ? 'Kimlik görüldü, dosyaya hazır' : 'ID checked, ready to file';
    const size = 11;
    const w = T.measure(note, size, 'sans', true);
    T.addItem(0, { type: 'text', text: note, x: 352, y: H - 207, w, h: size * 1.3, rot: 0, size, font: 'sans', bold: true, color: '#2449C9' });
    T.addItem(0, { type: 'box', x: 346, y: H - 211, w: w + 12, h: size * 1.3 + 8, rot: 0, color: '#2449C9', width: 1.2, fill: null, opacity: 1 });
    T.addItem(0, { type: 'mark', kind: 'check', x: 60, y: 112, w: 14, h: 14, rot: 0, color: '#1F7A3E' });
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 260;
    const g = c.getContext('2d');
    g.fillStyle = '#1E3A8A';
    g.font = '170px "TLK Script"';
    g.textBaseline = 'middle';
    g.fillText(tr ? 'Ayşe Y.' : 'A. Lovelace', 20, 130);
    T.addItem(0, { type: 'image', src: c.toDataURL('image/png'), x: 440, y: 98, w: 92, h: 26.6, rot: 0 });
    T.doc.numbers.on = true;
    T.tab('forms');
  }, tr);
  await page.waitForTimeout(400);
  await page.evaluate(() => window.TLKPDF.setZoom(1.02));
  await page.evaluate(() => { document.getElementById('stage').scrollTop = 0; });
  await page.waitForFunction(() => window.TLKPDF.rendered());
  await page.waitForTimeout(700);
}

for (const [lang, scheme, file] of [['en', 'light', 'docs/screenshot.png'], ['en', 'dark', 'docs/screenshot-dark.png'], ['tr', 'light', 'docs/screenshot-tr.png']]) {
  const { page, url, close } = await open({ width: 1440, height: 900, lang, scheme });
  await page.goto(url);
  await stage(page, lang);
  await page.screenshot({ path: root(file) });
  await close();
}

// Signing page 2: a saved signature on the line and today's date.
{
  const { page, url, close } = await open({ width: 1440, height: 900, lang: 'en', scheme: 'light' });
  await page.goto(url);
  await stage(page, 'en');
  await page.evaluate(async () => {
    const T = window.TLKPDF;
    const pg = await T.sources[0].pdf.getPage(2);
    const label = (await pg.getTextContent()).items.find((i) => i.str === 'SIGNATURE');
    const y = label.transform[5] + 18;
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 260;
    const g = c.getContext('2d');
    g.fillStyle = '#1E3A8A';
    g.font = '170px "TLK Script"';
    g.textBaseline = 'middle';
    g.fillText('A. Lovelace', 20, 130);
    const url = c.toDataURL('image/png');
    localStorage.setItem('tlk-pdf-signatures', JSON.stringify([url]));
    T.addItem(1, { type: 'image', src: url, x: 66, y, w: 170, h: 49, rot: 0 });
    const d = 'October 10, 2026';
    T.addItem(1, { type: 'text', text: d, x: 390, y: y + 2, w: T.measure(d, 12, 'sans', false), h: 15.6, rot: 0, size: 12, font: 'sans', bold: false, color: '#161B24' });
    T.setTool('signature');
    const sheet = document.querySelectorAll('.sheet')[1];
    document.getElementById('stage').scrollTop = sheet.offsetTop + sheet.offsetHeight - 860;
  });
  await page.waitForFunction(() => window.TLKPDF.rendered());
  await page.waitForTimeout(800);
  await page.screenshot({ path: root('docs/screenshot-sign.png') });
  await close();
}

// Social banner (1280 × 640): the real editor next to the name.
{
  const b64 = async (p) => (await readFile(root(p))).toString('base64');
  const shot = await b64('docs/screenshot.png');
  const bold = await b64('web/fonts/IBMPlexSans-Bold.woff');
  const reg = await b64('web/fonts/IBMPlexSans-Regular.woff');
  const { page, close } = await open({ width: 1280, height: 640 });
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: P; src: url(data:font/woff;base64,${bold}); font-weight: 700; }
    @font-face { font-family: P; src: url(data:font/woff;base64,${reg}); font-weight: 400; }
    * { box-sizing: border-box; }
    body { margin: 0; width: 1280px; height: 640px; overflow: hidden; background: #2449C9; font-family: P; color: #fff; position: relative; }
    .grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px); background-size: 32px 32px; }
    .left { position: absolute; left: 72px; top: 92px; width: 480px; }
    .logo { display: flex; align-items: center; gap: 18px; }
    .logo svg { width: 76px; height: 76px; filter: drop-shadow(0 6px 16px rgba(0,0,0,.25)); }
    h1 { font-size: 70px; line-height: 1; margin: 0; letter-spacing: -.02em; }
    p.tag { font-size: 31px; line-height: 1.25; margin: 34px 0 0; font-weight: 700; }
    p.sub { font-size: 20px; line-height: 1.5; margin: 18px 0 0; color: #D9E1FB; font-weight: 400; }
    .chips { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 34px; }
    .chips span { font-size: 16px; border: 1.5px solid rgba(255,255,255,.55); border-radius: 20px; padding: 5px 14px; }
    .shot { position: absolute; left: 600px; top: 70px; width: 900px; border-radius: 12px; box-shadow: 0 30px 70px rgba(5,12,40,.45); border: 1px solid rgba(255,255,255,.4); }
    .url { position: absolute; left: 72px; bottom: 56px; font-size: 17px; color: #C9D4F6; }
  </style></head><body><div class="grid"></div>
    <div class="left"><div class="logo">${svg}<h1>TLK PDF</h1></div>
    <p class="tag">Edit PDFs on your own device.</p>
    <p class="sub">Text, signatures, forms, highlights, merge and split. In the browser or as a Windows app.</p>
    <div class="chips"><span>Free</span><span>Open source</span><span>Nothing uploaded</span><span>English · Türkçe</span></div></div>
    <img class="shot" src="data:image/png;base64,${shot}">
    <div class="url">github.com/Talkdedsec/tlk-pdf</div>
  </body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: root('web/icons/og.png') });
  await close();
}
console.log('icons, screenshots and banner written');
