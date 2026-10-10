**TLK PDF** edits PDFs on your own device: text, signatures, form filling, highlights, drawing, white-out, merging, splitting, reordering and rotating pages. This is the offline Windows app; the same app runs in the browser at https://talkdedsec.github.io/tlk-pdf/.

| File | Use |
| --- | --- |
| `tlk-pdf-*-portable.exe` | Single file, no installation. Double-click to run. |
| `tlk-pdf-*-setup.exe` | Installs for the current user with shortcuts, **Open with → TLK PDF** for PDF files, and an uninstaller. |
| `tlk-pdf-*-win-x64.zip` | The unpacked program in a ZIP, used by Scoop. |
| `SHA256SUMS.txt`, `*.sha256` | Checksums. Builds also carry a GitHub attestation: `gh attestation verify <file> --owner Talkdedsec`. |

With [Scoop](https://scoop.sh): `scoop bucket add tlk https://github.com/Talkdedsec/scoop-tlk` then `scoop install tlk/tlk-pdf`.

What changed is in [CHANGELOG.md](https://github.com/Talkdedsec/tlk-pdf/blob/main/CHANGELOG.md). The executables are not code-signed. If Windows SmartScreen shows "Windows protected your PC", choose **More info → Run anyway**.

---

**TLK PDF** PDF'leri kendi cihazında düzenler: yazı, imza, form doldurma, vurgulama, çizim, beyazla kapatma; sayfaları birleştirme, bölme, sıralama ve döndürme. Bu, internetsiz çalışan Windows uygulamasıdır; aynı uygulama tarayıcıda https://talkdedsec.github.io/tlk-pdf/ adresinde çalışır.

`portable.exe` kurulum gerektirmez; `setup.exe` kısayollarla ve PDF dosyaları için **Birlikte aç → TLK PDF** ile kurar. Dosyalar imzalı olmadığı için SmartScreen uyarı verirse **Ek bilgi → Yine de çalıştır**'ı seç.
