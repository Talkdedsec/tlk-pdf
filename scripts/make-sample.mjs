// Generates web/demo/sample.pdf: a two-page application form with fillable
// fields, used by "Try the sample form" and by the tests.
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
const doc = await PDFDocument.create();
doc.registerFontkit(fontkit);
const reg = await doc.embedFont(await readFile(root('web/fonts/IBMPlexSans-Regular.woff')), { subset: true });
const bold = await doc.embedFont(await readFile(root('web/fonts/IBMPlexSans-Bold.woff')), { subset: true });
const serif = await doc.embedFont(await readFile(root('web/fonts/IBMPlexSerif-Regular.woff')), { subset: true });
const helv = await doc.embedFont(StandardFonts.Helvetica);
doc.setTitle('Northwind Library membership application');
doc.setAuthor('Northwind Public Library');
doc.setCreator('TLK PDF sample generator');
doc.setProducer('TLK PDF');

const ink = rgb(0.09, 0.11, 0.15);
const muted = rgb(0.38, 0.42, 0.49);
const rule = rgb(0.8, 0.83, 0.88);
const blue = rgb(0.14, 0.29, 0.79);
const W = 595.28, H = 841.89, M = 56;

const form = doc.getForm();

function header(page, n) {
  page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: blue });
  page.drawText('NORTHWIND PUBLIC LIBRARY', { x: M, y: H - 52, size: 9, font: bold, color: blue });
  page.drawText(`Form NL-12 · page ${n} of 2`, { x: W - M - reg.widthOfTextAtSize(`Form NL-12 · page ${n} of 2`, 9), y: H - 52, size: 9, font: reg, color: muted });
  page.drawLine({ start: { x: M, y: H - 62 }, end: { x: W - M, y: H - 62 }, thickness: 0.6, color: rule });
}

function label(page, text, x, y) { page.drawText(text, { x, y, size: 8.5, font: bold, color: muted }); }

function textField(page, name, x, y, w, h = 22, opts = {}) {
  const f = form.createTextField(name);
  if (opts.multiline) f.enableMultiline();
  f.addToPage(page, { x, y, width: w, height: h, borderColor: rule, borderWidth: 0.8, backgroundColor: rgb(0.975, 0.98, 0.99), font: helv });
  f.setFontSize(opts.size || 10);
  return f;
}

/* page 1 */
const p1 = doc.addPage([W, H]);
header(p1, 1);
p1.drawText('Membership application', { x: M, y: H - 110, size: 26, font: bold, color: ink });
p1.drawText('Fill in the form, tick the plan you want and sign on page 2.', { x: M, y: H - 134, size: 11, font: reg, color: muted });
p1.drawText('Bring the signed form and a photo ID to any branch.', { x: M, y: H - 150, size: 11, font: reg, color: muted });

let y = H - 200;
p1.drawText('1  About you', { x: M, y, size: 13, font: bold, color: ink });
y -= 30;
label(p1, 'FULL NAME', M, y); label(p1, 'DATE OF BIRTH', M + 330, y);
textField(p1, 'Full name', M, y - 28, 310); textField(p1, 'Date of birth', M + 330, y - 28, 153);
y -= 62;
label(p1, 'EMAIL', M, y); label(p1, 'PHONE', M + 330, y);
textField(p1, 'Email', M, y - 28, 310); textField(p1, 'Phone', M + 330, y - 28, 153);
y -= 62;
label(p1, 'HOME ADDRESS', M, y);
textField(p1, 'Address', M, y - 58, W - 2 * M, 52, { multiline: true });
y -= 92;
label(p1, 'COUNTRY', M, y);
const country = form.createDropdown('Country');
country.addOptions(['Türkiye', 'Germany', 'United Kingdom', 'United States', 'Netherlands', 'Other']);
country.addToPage(p1, { x: M, y: y - 28, width: 200, height: 22, borderColor: rule, borderWidth: 0.8, backgroundColor: rgb(0.975, 0.98, 0.99), font: helv });
country.setFontSize(10);

y -= 80;
p1.drawText('2  Plan', { x: M, y, size: 13, font: bold, color: ink });
y -= 32;
const plan = form.createRadioGroup('Plan');
const plans = [['Monthly', 'Monthly · 4 books at a time · €3 a month'], ['Yearly', 'Yearly · 8 books at a time · €30 a year'], ['Student', 'Student · 6 books at a time · free with a student card']];
for (const [v, text] of plans) {
  plan.addOptionToPage(v, p1, { x: M, y: y - 3, width: 13, height: 13, borderColor: ink, borderWidth: 0.8 });
  p1.drawText(text, { x: M + 22, y, size: 11, font: reg, color: ink });
  y -= 24;
}
y -= 14;
const news = form.createCheckBox('Newsletter');
news.addToPage(p1, { x: M, y: y - 3, width: 13, height: 13, borderColor: ink, borderWidth: 0.8 });
p1.drawText('Send me the monthly newsletter about events and new arrivals.', { x: M + 22, y, size: 11, font: reg, color: ink });

y -= 60;
p1.drawRectangle({ x: M, y: y - 64, width: W - 2 * M, height: 78, color: rgb(0.95, 0.96, 0.99), borderColor: rule, borderWidth: 0.6 });
p1.drawText('For library use', { x: M + 14, y: y - 4, size: 10, font: bold, color: muted });
p1.drawText('Card number  ____________________      Branch  ______________      Checked by  ______', { x: M + 14, y: y - 30, size: 10, font: reg, color: muted });
p1.drawText('Highlight anything missing and initial here before filing.', { x: M + 14, y: y - 50, size: 10, font: reg, color: muted });

/* page 2 */
const p2 = doc.addPage([W, H]);
header(p2, 2);
p2.drawText('Terms of membership', { x: M, y: H - 110, size: 22, font: bold, color: ink });
const terms = [
  'Your card is personal. Tell us straight away if you lose it, and we will block it and issue a new one.',
  'Loans last three weeks. You can renew an item twice, online or at any branch, unless someone has reserved it.',
  'Late returns cost €0.20 a day per item, up to the price of the item. Children’s books never have late fees.',
  'Treat items with care. If an item is lost or damaged beyond repair, we ask you to pay for a replacement.',
  'We keep your name, contact details and current loans for as long as you are a member, and delete your loan history after 30 days.',
  'You can cancel at any time. Monthly plans stop at the end of the current month; yearly plans are not refunded.'
];
y = H - 150;
terms.forEach((tx, i) => {
  p2.drawText(String(i + 1).padStart(2, '0'), { x: M, y, size: 10, font: bold, color: blue });
  const words = tx.split(' ');
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (serif.widthOfTextAtSize(next, 11.5) > W - 2 * M - 30) {
      p2.drawText(line, { x: M + 30, y, size: 11.5, font: serif, color: ink });
      y -= 17;
      line = w;
    } else line = next;
  }
  p2.drawText(line, { x: M + 30, y, size: 11.5, font: serif, color: ink });
  y -= 30;
});
y -= 10;
p2.drawText('3  Sign', { x: M, y, size: 13, font: bold, color: ink });
y -= 26;
p2.drawText('By signing you confirm that the details on page 1 are correct and that you accept these terms.', { x: M, y, size: 10.5, font: reg, color: muted });
y -= 80;
p2.drawLine({ start: { x: M, y }, end: { x: M + 280, y }, thickness: 0.8, color: ink });
p2.drawLine({ start: { x: M + 330, y }, end: { x: W - M, y }, thickness: 0.8, color: ink });
label(p2, 'SIGNATURE', M, y - 16);
label(p2, 'DATE', M + 330, y - 16);
p2.drawText('Northwind Public Library · 14 Harbour Street · This is a sample document for TLK PDF.', { x: M, y: 40, size: 8.5, font: reg, color: muted });

await mkdir(root('web/demo'), { recursive: true });
await writeFile(root('web/demo/sample.pdf'), await doc.save());
console.log('web/demo/sample.pdf written');
