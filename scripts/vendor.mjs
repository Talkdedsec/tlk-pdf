// Copies the third-party browser files the app needs from node_modules into
// web/vendor and web/fonts. The copies are committed, so the web app has no
// build step and works offline. Run after changing a dependency version.
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = (p) => fileURLToPath(new URL('../' + p, import.meta.url));
const nm = (p) => root('node_modules/' + p);

await rm(root('web/vendor'), { recursive: true, force: true });
await mkdir(root('web/vendor/pdfjs'), { recursive: true });

for (const f of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
  await cp(nm('pdfjs-dist/build/' + f), root('web/vendor/pdfjs/' + f));
}
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  await cp(nm('pdfjs-dist/' + dir), root('web/vendor/pdfjs/' + dir), { recursive: true });
}
await cp(nm('pdfjs-dist/LICENSE'), root('web/vendor/pdfjs/LICENSE'));
await cp(nm('pdf-lib/dist/pdf-lib.min.js'), root('web/vendor/pdf-lib.min.js'));
await cp(nm('pdf-lib/LICENSE.md'), root('web/vendor/pdf-lib.LICENSE.md'));
await cp(nm('@pdf-lib/fontkit/dist/fontkit.umd.min.js'), root('web/vendor/fontkit.umd.min.js'));
// @pdf-lib/fontkit ships without a licence file; its package.json declares MIT.
await writeFile(root('web/vendor/fontkit.LICENSE'), 'MIT License. @pdf-lib/fontkit, a fork of fontkit by Devon Govett.\nhttps://github.com/Hopding/fontkit\n');
await cp(nm('fflate/umd/index.js'), root('web/vendor/fflate.min.js'));
await cp(nm('fflate/LICENSE'), root('web/vendor/fflate.LICENSE'));

// Fonts: IBM Plex for the interface and for text placed into PDFs (full
// WOFF files, so every Latin, Turkish and Cyrillic letter is available),
// Caveat for typed signatures.
await rm(root('web/fonts'), { recursive: true, force: true });
await mkdir(root('web/fonts'), { recursive: true });
const plex = [
  ['plex-sans', 'IBMPlexSans-Regular'], ['plex-sans', 'IBMPlexSans-Medium'], ['plex-sans', 'IBMPlexSans-SemiBold'],
  ['plex-sans', 'IBMPlexSans-Bold'], ['plex-serif', 'IBMPlexSerif-Regular'], ['plex-serif', 'IBMPlexSerif-Bold'],
  ['plex-mono', 'IBMPlexMono-Regular'], ['plex-mono', 'IBMPlexMono-Bold']
];
for (const [pkg, name] of plex) {
  await cp(nm(`@ibm/${pkg}/fonts/complete/woff/${name}.woff`), root(`web/fonts/${name}.woff`));
}
await cp(nm('@ibm/plex-sans/LICENSE.txt'), root('web/fonts/IBM-Plex-OFL.txt'));
for (const sub of ['latin', 'latin-ext']) {
  await cp(nm(`@fontsource/caveat/files/caveat-${sub}-400-normal.woff2`), root(`web/fonts/caveat-${sub}.woff2`));
}
await cp(nm('@fontsource/caveat/LICENSE'), root('web/fonts/Caveat-OFL.txt'));

const versions = {};
for (const p of ['pdfjs-dist', 'pdf-lib', '@pdf-lib/fontkit', 'fflate', '@ibm/plex-sans', '@ibm/plex-serif', '@ibm/plex-mono', '@fontsource/caveat']) {
  versions[p] = JSON.parse(await readFile(nm(p + '/package.json'), 'utf8')).version;
}
await writeFile(root('web/vendor/VERSIONS.json'), JSON.stringify(versions, null, 2) + '\n');
console.log('vendored', versions);
