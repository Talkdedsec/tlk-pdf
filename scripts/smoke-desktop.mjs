// Starts the desktop app with the sample PDF on the command line, as
// "Open with" does, and checks that it opens, renders and saves offline.
import { _electron as electron } from 'playwright-core';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
// No trailing separator: a trailing backslash would escape the closing quote.
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sample = fileURLToPath(new URL('../web/demo/sample.pdf', import.meta.url));
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log((ok ? '  ok   ' : '  FAIL ') + msg); };

const app = await electron.launch({ executablePath: require('electron'), args: [root, sample] });
try {
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));
  await win.waitForFunction(() => window.TLKPDF && window.tlkDesktop, null, { timeout: 20000 });
  await win.evaluate(() => window.TLKPDF.ready);
  check(await win.evaluate(() => typeof window.tlkDesktop.save === 'function'), 'desktop bridge is available');
  await win.waitForFunction(() => window.TLKPDF.doc.pages.length === 2, null, { timeout: 20000 });
  check(true, 'PDF given on the command line opens');
  await win.waitForFunction(() => window.TLKPDF.rendered(), null, { timeout: 20000 });
  check(await win.evaluate(() => document.querySelectorAll('.sheet:not(.loading)').length >= 1), 'pages render offline from app://');
  const size = await win.evaluate(async () => (await window.TLKPDF.build()).length);
  check(size > 10000, `the document saves (${size} bytes)`);
  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await app.close();
}
if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('\ndesktop checks passed');
