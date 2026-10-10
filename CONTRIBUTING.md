# Contributing

Bug reports, ideas and fixes are welcome. Report vulnerabilities [privately](SECURITY.md) instead of in an issue.

## Setup

- Node.js 24
- Edge or Chrome for the tests (set `BROWSER_PATH` for another Chromium-based browser)

```sh
npm ci
npm run serve          # http://127.0.0.1:5180
npm test               # end-to-end checks in a real browser
npm run test:desktop   # the Windows app with a PDF on the command line
npm start              # run the Windows app from source
```

The web app has no build step: edit the files in `web/` and reload.

## How the code is organised

| File | Role |
| --- | --- |
| `web/js/store.js` | Document state and the undo history. Every change goes through `change()` |
| `web/js/geometry.js` | Page coordinates. Items are stored in PDF points, so zoom and rotation never change them |
| `web/js/pdfio.js` | Opening with pdf.js, drawing pages, form fields, and writing the result with pdf-lib |
| `web/js/app.js` | The interface: page list, pages, tools, side panel, saving, shortcuts |
| `web/js/signature.js` | The signature dialog |
| `web/js/i18n.js` | English and Turkish text. Add every new string in both languages |
| `desktop/` | Electron shell: `app://` scheme, Open with, Save dialog |

## Before you open a pull request

- `npm test` passes, and `npm run test:desktop` if you touched `desktop/`.
- New interface text exists in English and Turkish.
- User-visible changes are listed in `CHANGELOG.md`.
- If you changed a dependency version, run `npm run vendor` and commit the files it updates.
- If the interface changed visibly, run `npm run assets` to refresh the screenshots.

## Releases

1. Update the version in `package.json`, `web/js/version.js` and the cache name in `web/sw.js` (the test checks they match).
2. Add the section to `CHANGELOG.md`.
3. Tag and push: `git tag v1.2.3 && git push origin v1.2.3`. The release workflow builds the Windows files and publishes the release; the website updates from `main`.
