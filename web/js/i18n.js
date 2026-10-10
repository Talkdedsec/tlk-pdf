// Interface text in English and Turkish.
const EN = {
  'top.open': 'Open', 'top.add': 'Add pages', 'top.undo': 'Undo (Ctrl+Z)', 'top.redo': 'Redo (Ctrl+Y)',
  'top.zoomOut': 'Zoom out (Ctrl+−)', 'top.zoomIn': 'Zoom in (Ctrl++)', 'top.zoomReset': 'Actual size (Ctrl+0)', 'top.fit': 'Fit width',
  'top.lang': 'Türkçe', 'top.theme': 'Light or dark', 'top.help': 'Shortcuts and about', 'top.save': 'Save PDF', 'top.more': 'More ways to save',
  'menu.save': 'Save PDF', 'menu.saveHint': 'All pages with your changes',
  'menu.extract': 'Save selected pages', 'menu.extractHint': 'Only the pages selected on the left',
  'menu.split': 'Split into single pages', 'menu.splitHint': 'One PDF per page, in a ZIP file',
  'menu.images': 'Save pages as images', 'menu.imagesHint': 'PNG files in a ZIP',
  'pages.title': 'Pages', 'pages.rotL': 'Rotate left', 'pages.rotR': 'Rotate right', 'pages.dup': 'Duplicate',
  'pages.blank': 'Insert blank page', 'pages.extract': 'Save selected pages', 'pages.del': 'Delete pages (Delete)',
  'pages.page': 'Page {n}', 'pages.count': '{n}',
  'tool.select': 'Select and move (V)', 'tool.text': 'Text (T)', 'tool.highlight': 'Highlight (H)', 'tool.draw': 'Draw (P)',
  'tool.box': 'Rectangle (R)', 'tool.whiteout': 'White-out (W)', 'tool.signature': 'Signature (S)', 'tool.image': 'Image (I)',
  'tool.mark': 'Tick, cross or dot (K)', 'tool.date': 'Today’s date (D)',
  'empty.title': 'Drop a PDF here', 'empty.body': 'Add text, sign, fill in forms, highlight, merge, split, reorder and rotate pages. Images become PDF pages too.',
  'empty.open': 'Choose files', 'empty.sample': 'Try the sample form',
  'empty.f1': 'Nothing is uploaded', 'empty.f2': 'No account, no watermark', 'empty.f3': 'Works offline', 'empty.f4': 'Open source',
  'side.tool': 'Tool', 'side.forms': 'Form', 'side.doc': 'Document', 'side.title': 'Settings panel',
  'opt.font': 'Font', 'opt.sans': 'Sans', 'opt.serif': 'Serif', 'opt.mono': 'Mono', 'opt.bold': 'Bold', 'opt.size': 'Size',
  'opt.color': 'Colour', 'opt.custom': 'Custom colour', 'opt.opacity': 'Opacity', 'opt.width': 'Line width', 'opt.fill': 'Fill',
  'opt.none': 'None', 'opt.kind': 'Mark', 'opt.check': 'Tick', 'opt.cross': 'Cross', 'opt.dot': 'Dot', 'opt.dateFmt': 'Format',
  'opt.text': 'Text',
  'help.select': 'Click an item to select it, drag to move it, drag the corner to resize. Double-click text to edit it. Delete removes it.',
  'help.text': 'Click on the page where the text should start. Press Esc or click outside to finish; Enter starts a new line.',
  'help.highlight': 'Drag over the text to highlight.', 'help.draw': 'Draw freely with the mouse, a pen or a finger.',
  'help.box': 'Drag to draw a rectangle.', 'help.whiteout': 'Drag over anything you want to cover with white. The original content stays in the file underneath.',
  'help.signature': 'Pick a signature, then click on the page to place it.', 'help.image': 'Choose a picture, then click on the page to place it.',
  'help.mark': 'Click to place a mark, for example in a tick box.', 'help.date': 'Click to place today’s date.',
  'sel.title': 'Selected item', 'sel.delete': 'Delete', 'sel.dup': 'Duplicate', 'sel.front': 'Bring to front', 'sel.edit': 'Edit text',
  'sign.title': 'New signature', 'sign.draw': 'Draw', 'sign.type': 'Type', 'sign.upload': 'Image', 'sign.drawHint': 'Sign with your mouse, finger or pen.',
  'sign.typePh': 'Your name', 'sign.uploadHint': 'A photo or scan of your signature. A white background is removed automatically.',
  'sign.color': 'Ink', 'sign.keep': 'Remember on this device', 'sign.clear': 'Clear', 'sign.use': 'Use signature', 'sign.padLabel': 'Signature pad',
  'sign.saved': 'Your signatures', 'sign.new': 'New signature', 'sign.none': 'No signature yet.', 'sign.remove': 'Remove signature',
  'sign.empty': 'Draw, type or choose a signature first.',
  'img.choose': 'Choose a picture', 'img.ready': 'Click on the page to place the picture.',
  'forms.none': 'This document has no form fields.', 'forms.hint': 'Values appear on the page as you type. Saving keeps the fields fillable when the file is saved as a whole; otherwise they are written into the page.',
  'forms.fields': '{n} fields', 'forms.reset': 'Reset form',
  'doc.info': 'Document details', 'doc.title': 'Title', 'doc.author': 'Author', 'doc.subject': 'Subject', 'doc.keywords': 'Keywords',
  'doc.numbers': 'Page numbers', 'doc.position': 'Position', 'doc.format': 'Format', 'doc.start': 'Start at',
  'doc.watermark': 'Watermark', 'doc.wmText': 'Text', 'doc.wmPh': 'CONFIDENTIAL', 'doc.angle': 'Angle',
  'doc.stats': 'Pages: {n} · Files: {f}', 'pos.tl': 'Top left', 'pos.tc': 'Top centre', 'pos.tr': 'Top right', 'pos.bl': 'Bottom left', 'pos.bc': 'Bottom centre', 'pos.br': 'Bottom right',
  'pass.title': 'This PDF is password protected', 'pass.body': 'Enter the password to open it.', 'pass.wrong': 'That password is not right. Try again.', 'pass.open': 'Open',
  'common.cancel': 'Cancel', 'common.close': 'Close', 'common.ok': 'OK',
  'confirm.openTitle': 'Open another file?', 'confirm.openBody': 'Your unsaved changes to this document will be lost.', 'confirm.openYes': 'Discard and open',
  'confirm.resetTitle': 'Reset the form?', 'confirm.resetBody': 'Every field goes back to the value it had in the file.', 'confirm.resetYes': 'Reset',
  'help.title': 'Keyboard shortcuts', 'help.about': 'TLK PDF is free and open source.', 'help.version': 'Version {v}',
  'k.open': 'Open files', 'k.save': 'Save PDF', 'k.undo': 'Undo / redo', 'k.tools': 'Tools', 'k.delete': 'Delete the selected item or pages',
  'k.nudge': 'Move the selected item (Shift: 10×)', 'k.zoom': 'Zoom in, out, actual size', 'k.escape': 'Back to Select, finish text', 'k.dup': 'Duplicate the selected item',
  'k.pages': 'Select pages: click, Ctrl+click, Shift+click; drag to reorder',
  'toast.saved': 'Saved {name}', 'toast.added': 'Added {n} pages', 'toast.added1': 'Added 1 page', 'toast.deleted1': 'Deleted 1 page', 'toast.unsupported': '{name} is not a PDF or image', 'toast.error': 'Could not open {name}: {msg}',
  'toast.noSel': 'Select one or more pages on the left first.', 'toast.raster': 'Protected file: pages of {name} were saved as images, so their text cannot be selected.',
  'toast.saving': 'Saving…', 'toast.opening': 'Opening…', 'toast.saveFailed': 'Saving failed: {msg}', 'toast.undo': 'Undo', 'toast.deleted': 'Deleted {n} pages',
  'toast.update': 'TLK PDF {v} is available.', 'toast.download': 'Download',
  'name.edited': 'edited', 'name.pages': 'pages', 'name.page': 'page'
};

const TR = {
  'top.open': 'Aç', 'top.add': 'Sayfa ekle', 'top.undo': 'Geri al (Ctrl+Z)', 'top.redo': 'Yinele (Ctrl+Y)',
  'top.zoomOut': 'Uzaklaştır (Ctrl+−)', 'top.zoomIn': 'Yakınlaştır (Ctrl++)', 'top.zoomReset': 'Gerçek boyut (Ctrl+0)', 'top.fit': 'Genişliğe sığdır',
  'top.lang': 'English', 'top.theme': 'Açık ya da koyu', 'top.help': 'Kısayollar ve hakkında', 'top.save': 'PDF olarak kaydet', 'top.more': 'Diğer kaydetme yolları',
  'menu.save': 'PDF olarak kaydet', 'menu.saveHint': 'Değişikliklerinle birlikte tüm sayfalar',
  'menu.extract': 'Seçili sayfaları kaydet', 'menu.extractHint': 'Yalnızca soldan seçtiğin sayfalar',
  'menu.split': 'Tek tek sayfalara böl', 'menu.splitHint': 'Her sayfa ayrı PDF, ZIP dosyasında',
  'menu.images': 'Sayfaları resim olarak kaydet', 'menu.imagesHint': 'ZIP içinde PNG dosyaları',
  'pages.title': 'Sayfalar', 'pages.rotL': 'Sola döndür', 'pages.rotR': 'Sağa döndür', 'pages.dup': 'Çoğalt',
  'pages.blank': 'Boş sayfa ekle', 'pages.extract': 'Seçili sayfaları kaydet', 'pages.del': 'Sayfaları sil (Delete)',
  'pages.page': 'Sayfa {n}', 'pages.count': '{n}',
  'tool.select': 'Seç ve taşı (V)', 'tool.text': 'Yazı (T)', 'tool.highlight': 'Vurgula (H)', 'tool.draw': 'Çiz (P)',
  'tool.box': 'Dikdörtgen (R)', 'tool.whiteout': 'Beyazla kapat (W)', 'tool.signature': 'İmza (S)', 'tool.image': 'Resim (I)',
  'tool.mark': 'Tik, çarpı ya da nokta (K)', 'tool.date': 'Bugünün tarihi (D)',
  'empty.title': 'PDF dosyasını buraya bırak', 'empty.body': 'Yazı ekle, imzala, form doldur, vurgula; sayfaları birleştir, böl, sırala ve döndür. Resimler de PDF sayfası olur.',
  'empty.open': 'Dosya seç', 'empty.sample': 'Örnek formla dene',
  'empty.f1': 'Hiçbir şey yüklenmez', 'empty.f2': 'Hesap yok, filigran yok', 'empty.f3': 'İnternetsiz çalışır', 'empty.f4': 'Açık kaynak',
  'side.tool': 'Araç', 'side.forms': 'Form', 'side.doc': 'Belge', 'side.title': 'Ayar paneli',
  'opt.font': 'Yazı tipi', 'opt.sans': 'Sans', 'opt.serif': 'Serif', 'opt.mono': 'Mono', 'opt.bold': 'Kalın', 'opt.size': 'Boyut',
  'opt.color': 'Renk', 'opt.custom': 'Özel renk', 'opt.opacity': 'Saydamlık', 'opt.width': 'Çizgi kalınlığı', 'opt.fill': 'Dolgu',
  'opt.none': 'Yok', 'opt.kind': 'İşaret', 'opt.check': 'Tik', 'opt.cross': 'Çarpı', 'opt.dot': 'Nokta', 'opt.dateFmt': 'Biçim',
  'opt.text': 'Yazı',
  'help.select': 'Bir öğeye tıklayıp seç, sürükleyip taşı, köşesinden çekip boyutlandır. Yazıyı düzenlemek için çift tıkla. Delete siler.',
  'help.text': 'Yazının başlayacağı yere tıkla. Bitirmek için Esc’ye bas ya da dışarı tıkla; Enter yeni satır açar.',
  'help.highlight': 'Vurgulamak için yazının üzerinden sürükle.', 'help.draw': 'Fare, kalem ya da parmakla serbestçe çiz.',
  'help.box': 'Dikdörtgen çizmek için sürükle.', 'help.whiteout': 'Beyazla kapatmak istediğin yerin üzerinden sürükle. Asıl içerik dosyada altta kalır.',
  'help.signature': 'Bir imza seç, sonra sayfada yerleştireceğin yere tıkla.', 'help.image': 'Bir resim seç, sonra sayfada yerleştireceğin yere tıkla.',
  'help.mark': 'İşaret koymak için tıkla, örneğin bir onay kutusuna.', 'help.date': 'Bugünün tarihini koymak için tıkla.',
  'sel.title': 'Seçili öğe', 'sel.delete': 'Sil', 'sel.dup': 'Çoğalt', 'sel.front': 'En öne getir', 'sel.edit': 'Yazıyı düzenle',
  'sign.title': 'Yeni imza', 'sign.draw': 'Çiz', 'sign.type': 'Yaz', 'sign.upload': 'Resim', 'sign.drawHint': 'Fare, parmak ya da kalemle imzala.',
  'sign.typePh': 'Adın', 'sign.uploadHint': 'İmzanın fotoğrafı ya da taraması. Beyaz arka plan otomatik silinir.',
  'sign.color': 'Mürekkep', 'sign.keep': 'Bu cihazda hatırla', 'sign.clear': 'Temizle', 'sign.use': 'İmzayı kullan', 'sign.padLabel': 'İmza alanı',
  'sign.saved': 'İmzaların', 'sign.new': 'Yeni imza', 'sign.none': 'Henüz imza yok.', 'sign.remove': 'İmzayı kaldır',
  'sign.empty': 'Önce bir imza çiz, yaz ya da seç.',
  'img.choose': 'Resim seç', 'img.ready': 'Resmi yerleştirmek için sayfaya tıkla.',
  'forms.none': 'Bu belgede form alanı yok.', 'forms.hint': 'Yazdıkların sayfada hemen görünür. Dosyanın tamamı kaydedilirse alanlar doldurulabilir kalır; aksi halde sayfaya işlenir.',
  'forms.fields': '{n} alan', 'forms.reset': 'Formu sıfırla',
  'doc.info': 'Belge bilgileri', 'doc.title': 'Başlık', 'doc.author': 'Yazar', 'doc.subject': 'Konu', 'doc.keywords': 'Anahtar kelimeler',
  'doc.numbers': 'Sayfa numaraları', 'doc.position': 'Konum', 'doc.format': 'Biçim', 'doc.start': 'Başlangıç',
  'doc.watermark': 'Filigran', 'doc.wmText': 'Yazı', 'doc.wmPh': 'GİZLİ', 'doc.angle': 'Açı',
  'doc.stats': 'Sayfa: {n} · Dosya: {f}', 'pos.tl': 'Sol üst', 'pos.tc': 'Üst orta', 'pos.tr': 'Sağ üst', 'pos.bl': 'Sol alt', 'pos.bc': 'Alt orta', 'pos.br': 'Sağ alt',
  'pass.title': 'Bu PDF parolalı', 'pass.body': 'Açmak için parolayı gir.', 'pass.wrong': 'Parola yanlış. Tekrar dene.', 'pass.open': 'Aç',
  'common.cancel': 'Vazgeç', 'common.close': 'Kapat', 'common.ok': 'Tamam',
  'confirm.openTitle': 'Başka bir dosya açılsın mı?', 'confirm.openBody': 'Bu belgedeki kaydedilmemiş değişikliklerin kaybolur.', 'confirm.openYes': 'Vazgeç ve aç',
  'confirm.resetTitle': 'Form sıfırlansın mı?', 'confirm.resetBody': 'Her alan dosyadaki ilk değerine döner.', 'confirm.resetYes': 'Sıfırla',
  'help.title': 'Klavye kısayolları', 'help.about': 'TLK PDF ücretsiz ve açık kaynaktır.', 'help.version': 'Sürüm {v}',
  'k.open': 'Dosya aç', 'k.save': 'PDF olarak kaydet', 'k.undo': 'Geri al / yinele', 'k.tools': 'Araçlar', 'k.delete': 'Seçili öğeyi ya da sayfaları sil',
  'k.nudge': 'Seçili öğeyi kaydır (Shift: 10×)', 'k.zoom': 'Yakınlaştır, uzaklaştır, gerçek boyut', 'k.escape': 'Seç aracına dön, yazıyı bitir', 'k.dup': 'Seçili öğeyi çoğalt',
  'k.pages': 'Sayfa seç: tıkla, Ctrl+tıkla, Shift+tıkla; sıralamak için sürükle',
  'toast.saved': '{name} kaydedildi', 'toast.added': '{n} sayfa eklendi', 'toast.added1': '1 sayfa eklendi', 'toast.deleted1': '1 sayfa silindi', 'toast.unsupported': '{name} PDF ya da resim değil', 'toast.error': '{name} açılamadı: {msg}',
  'toast.noSel': 'Önce soldan bir ya da daha fazla sayfa seç.', 'toast.raster': 'Korumalı dosya: {name} sayfaları resim olarak kaydedildi, yazıları seçilemez.',
  'toast.saving': 'Kaydediliyor…', 'toast.opening': 'Açılıyor…', 'toast.saveFailed': 'Kaydedilemedi: {msg}', 'toast.undo': 'Geri al', 'toast.deleted': '{n} sayfa silindi',
  'toast.update': 'TLK PDF {v} çıktı.', 'toast.download': 'İndir',
  'name.edited': 'duzenlendi', 'name.pages': 'sayfalar', 'name.page': 'sayfa'
};

const DICT = { en: EN, tr: TR };
let lang = 'en';
try { lang = localStorage.getItem('tlk-pdf-lang') || ''; } catch { /* storage blocked */ }
if (!DICT[lang]) lang = (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en';

export const getLang = () => lang;
export function t(key, vars) {
  let s = DICT[lang][key] ?? EN[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
export function setLang(l) {
  lang = DICT[l] ? l : 'en';
  try { localStorage.setItem('tlk-pdf-lang', lang); } catch { /* ignore */ }
  apply();
}
export function apply(root = document) {
  document.documentElement.lang = lang;
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); el.setAttribute('aria-label', el.title); });
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
}
export const KEYS = { EN, TR };
