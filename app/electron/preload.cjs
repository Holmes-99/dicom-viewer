// The only thing the page gets from the desktop shell: window.viewer. No Node, no paths, no file system.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('viewer', {
  desktop: true,
  platform: process.platform,
  version: () => ipcRenderer.invoke('viewer:version'),
  /**
   * Files handed to the app from outside: double-click, "Open with", drag onto the Dock or taskbar icon,
   * a second launch, the disc launcher. The callback gets `{ token, name, size }[]`; bytes are at
   * app://viewer/@file/{token}. Call once; files that arrived before the page was ready come first.
   */
  /** patient disc folder (D3): what can be added, then pick a folder, write each file, finish */
  disc: {
    caps: () => ipcRenderer.invoke('disc:caps'),
    begin: () => ipcRenderer.invoke('disc:begin'),
    file: (id, parts, bytes) => ipcRenderer.invoke('disc:file', id, parts, bytes),
    finish: (id, withViewer) => ipcRenderer.invoke('disc:finish', id, withViewer),
  },
  onOpenRequest(cb) {
    ipcRenderer.on('open-request', (_e, list) => cb(list))
    ipcRenderer.invoke('viewer:ready').then((list) => { if (list.length) cb(list) })
  },
})
