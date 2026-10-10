// Desktop shell. Serves the same web app from a private app:// scheme so it
// behaves exactly like the hosted version, fully offline. Adds what a browser
// cannot do: open a PDF passed on the command line or with "Open with", and
// save through the system's Save dialog.
'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, session, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const WEB_ROOT = path.join(__dirname, '..', 'web');
const ORIGIN = 'app://tlk-pdf';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let pending = [];
let lastDir = app.getPath('documents');

const pdfArgs = (argv) => argv.slice(1).filter((a) => /\.(pdf|png|jpe?g|webp)$/i.test(a) && !a.startsWith('--'));

async function sendFile(file) {
  try {
    const bytes = await fs.readFile(file);
    lastDir = path.dirname(file);
    win.webContents.send('open-file', { name: path.basename(file), bytes });
  } catch (e) {
    dialog.showErrorBox('TLK PDF', `${file}\n\n${e.message}`);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#E7EAF0',
    title: 'TLK PDF',
    icon: path.join(WEB_ROOT, 'icons', 'icon-512.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-finish-load', () => {
    for (const f of pending) sendFile(f);
    pending = [];
  });

  // Links to the web open in the default browser; the app never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN + '/')) {
      event.preventDefault();
      if (/^https:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  win.loadURL(ORIGIN + '/index.html');
}

app.on('second-instance', (_e, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  for (const f of pdfArgs(argv)) sendFile(f);
});

ipcMain.handle('save-file', async (_e, { name, bytes }) => {
  const ext = path.extname(name).slice(1).toLowerCase() || 'pdf';
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: path.join(lastDir, name),
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
  });
  if (canceled || !filePath) return null;
  await fs.writeFile(filePath, Buffer.from(bytes));
  lastDir = path.dirname(filePath);
  return filePath;
});

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url);
    const file = path.normalize(path.join(WEB_ROOT, decodeURIComponent(pathname)));
    if (!file.startsWith(WEB_ROOT + path.sep)) return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  // The app needs no camera, microphone or location.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const fromApp = (details.requestingUrl || '').startsWith(ORIGIN + '/');
    callback(fromApp && permission === 'clipboard-sanitized-write');
  });

  Menu.setApplicationMenu(null);
  pending = pdfArgs(process.argv);
  createWindow();
});

app.on('window-all-closed', () => app.quit());
