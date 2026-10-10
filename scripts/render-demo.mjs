// Records the README demo from the real app: open the sample, fill in the
// form, highlight, add a note, sign and save. Writes docs/demo.{mp4,gif}
// and docs/demo-poster.jpg in English, docs/demo-tr.* in Turkish.
// Needs ffmpeg on PATH. Usage: node scripts/render-demo.mjs [en|tr]
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { serve } from './serve.mjs';

const root = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
const W = 1280, H = 800;
const lang = process.argv[2] === 'tr' ? 'tr' : 'en';
const suffix = lang === 'tr' ? '-tr' : '';
const say = lang === 'tr' ? { name: 'Ayşe Yılmaz', mail: 'ayse@ornek.com.tr', note: 'Kimlik görüldü, dosyaya hazır', sign: 'Ayşe Y.' } : { name: 'Ada Lovelace', mail: 'ada@example.org', note: 'ID checked, ready to file', sign: 'A. Lovelace' };
const exe = process.env.BROWSER_PATH || [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome'
].find((p) => existsSync(p));

const server = await serve(0);
const url = `http://127.0.0.1:${server.address().port}/`;
const dir = await mkdtemp(join(tmpdir(), 'tlk-pdf-demo-'));
const browser = await chromium.launch({ executablePath: exe, headless: true });
const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir, size: { width: W, height: H } }, colorScheme: 'light', locale: lang === 'tr' ? 'tr-TR' : 'en-US' });
const page = await context.newPage();

// Headless browsers draw no pointer, so the demo draws its own.
await page.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 3.5 19 11l-6.2 1.7-3 6Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 99999, pointerEvents: 'none', transform: 'translate(-4px,-3px)', transition: 'none' });
    document.body.append(c);
    const ring = document.createElement('div');
    Object.assign(ring.style, { position: 'fixed', width: '34px', height: '34px', margin: '-17px 0 0 -17px', borderRadius: '50%', border: '3px solid rgba(36,73,201,.55)', zIndex: 99998, pointerEvents: 'none', opacity: '0', transition: 'opacity .35s, transform .35s', transform: 'scale(.5)' });
    document.body.append(ring);
    addEventListener('pointermove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('pointerdown', (e) => {
      Object.assign(ring.style, { left: e.clientX + 'px', top: e.clientY + 'px', transition: 'none', opacity: '1', transform: 'scale(.5)' });
      requestAnimationFrame(() => Object.assign(ring.style, { transition: 'opacity .45s, transform .45s', opacity: '0', transform: 'scale(1.3)' }));
    }, true);
  });
});

const pause = (ms) => page.waitForTimeout(ms);
let mx = W / 2, my = H / 2;
async function moveTo(x, y, steps = 18) { await page.mouse.move(x, y, { steps }); mx = x; my = y; }
async function clickAt(x, y) { await moveTo(x, y); await pause(120); await page.mouse.click(x, y); }
async function clickEl(sel) { const b = await page.locator(sel).first().boundingBox(); await clickAt(b.x + b.width / 2, b.y + b.height / 2); }

await page.goto(url);
await page.evaluate(() => window.TLKPDF.ready);
await page.evaluate(async (text) => {
  // A signature saved earlier on this device.
  localStorage.setItem('tlk-pdf-lang', document.documentElement.lang);
  await document.fonts.load('170px "TLK Script"');
  const c = document.createElement('canvas');
  c.width = 900; c.height = 260;
  const g = c.getContext('2d');
  g.fillStyle = '#1E3A8A';
  g.font = '170px "TLK Script"';
  g.textBaseline = 'middle';
  g.fillText(text, 20, 130);
  localStorage.setItem('tlk-pdf-signatures', JSON.stringify([c.toDataURL('image/png')]));
}, say.sign);
await page.mouse.move(mx, my);
await pause(900);

await clickEl('#e-sample');
await page.waitForFunction(() => window.TLKPDF.doc.pages.length === 2);
await page.waitForFunction(() => window.TLKPDF.rendered());
await pause(700);

// Fill in the form from the side panel.
await clickEl('#tab-forms');
await pause(300);
const inputs = page.locator('#p-forms input.inp');
await clickEl('#p-forms input.inp >> nth=0');
await page.keyboard.type(say.name, { delay: 55 });
await clickEl('#p-forms input.inp >> nth=2');
await page.keyboard.type(say.mail, { delay: 40 });
void inputs;
await clickEl('#p-forms select >> nth=1');
await page.locator('#p-forms select').nth(1).selectOption('Yearly');
await clickEl('#p-forms input[type="checkbox"]');
await pause(600);

// Highlight the instruction line.
const sheet = await page.locator('.sheet').first().boundingBox();
const s = sheet.width / 595.28;
await page.keyboard.press('h');
await moveTo(sheet.x + 54 * s, sheet.y + 128 * s);
await page.mouse.down();
await moveTo(sheet.x + 354 * s, sheet.y + 140 * s, 30);
await page.mouse.up();
await pause(500);

// A note in blue.
await clickEl('.tool[data-tool="text"]');
await clickEl('#p-tool .swatch[title="#2449C9"]');
await clickAt(sheet.x + 352 * s, sheet.y + 190 * s);
await page.keyboard.type(say.note, { delay: 45 });
await page.keyboard.press('Escape');
await pause(500);

// Sign page 2.
await clickEl('.tool[data-tool="signature"]');
await pause(400);
await page.evaluate(() => {
  const st = document.getElementById('stage');
  const sh = document.querySelectorAll('.sheet')[1];
  st.scrollTo({ top: sh.offsetTop + sh.offsetHeight - 760, behavior: 'smooth' });
});
await pause(1100);
const line = await page.evaluate(async () => {
  const pg = await window.TLKPDF.sources[0].pdf.getPage(2);
  const label = (await pg.getTextContent()).items.find((i) => i.str === 'SIGNATURE');
  return label.transform[5];
});
const sheet2 = await page.locator('.sheet').nth(1).boundingBox();
await clickAt(sheet2.x + 150 * s, sheet2.y + (841.89 - line - 38) * s);
await pause(700);
await page.keyboard.press('Escape');
await pause(300);

// Save.
await clickEl('#b-save');
await pause(1800);
await moveTo(W / 2 + 120, H / 2 + 80, 25);
await pause(900);

const video = page.video();
await context.close();
await browser.close();
server.close();

const webm = await video.path();
const mp4 = root(`docs/demo${suffix}.mp4`);
const gif = root(`docs/demo${suffix}.gif`);
// Trim the white frames before the app has loaded.
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '0.4', '-i', webm, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-vf', 'fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', gif]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', '-1.2', '-i', mp4, '-frames:v', '1', '-q:v', '3', root(`docs/demo${suffix}-poster.jpg`)]);
await rm(dir, { recursive: true, force: true });
console.log(`docs/demo${suffix}.mp4, .gif and -poster.jpg written`, (await readdir(root('docs'))).join(', '));
