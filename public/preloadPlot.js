const { contextBridge, ipcRenderer } = require('electron')


/** Load bridges between the main and renderer processes when the preload process is first loaded */
process.once("loaded", () => {
  contextBridge.exposeInMainWorld('electronAPI', {
    onSendData: (callback) => ipcRenderer.on('plot-serial-data', (_event, value) => callback(value)),
  });
});