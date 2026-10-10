// The only bridge between the web app and the desktop: receive files opened
// with the program, and save through the system dialog.
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tlkDesktop', {
  onOpen: (fn) => ipcRenderer.on('open-file', (_e, file) => fn({ name: file.name, bytes: new Uint8Array(file.bytes) })),
  save: (name, bytes) => ipcRenderer.invoke('save-file', { name, bytes })
});
