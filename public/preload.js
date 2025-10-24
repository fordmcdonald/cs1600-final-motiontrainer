const path = require('path')
const { isDeepStrictEqual } = require('node:util')
const { contextBridge, ipcRenderer } = require('electron')

/** Load bridges between the main and renderer processes when the preload process is first loaded */
contextBridge.exposeInMainWorld('electronAPI', {
  onSendData: (callback) => ipcRenderer.on('serial-data', (_event, value) => callback(value)),
  onThresholdPct: (callback) => ipcRenderer.on('threshold-pct', (_event, value) => callback(value)),
  isSendingData: (callback) => ipcRenderer.on('sending-data', (_event) => callback()),
  removeisDataSendingListener: () => ipcRenderer.removeAllListeners("sending-data"),
  removeSendDataListeners: () => ipcRenderer.removeAllListeners('serial-data'),
  removeSendThresholdListeners: () => ipcRenderer.removeAllListeners('threshold-pct'),
  setSettings: (settings, config, saveToFile) => ipcRenderer.send('set-settings', settings, config, saveToFile),
  notifyButtonPress: (currentStage, totalStages) => ipcRenderer.send("increment-stage", currentStage, totalStages),
  fetchSettings: (config) => ipcRenderer.invoke('get-settings', config),
  fetchSerialDevice: () => ipcRenderer.invoke('get-device'),
  fetchCurrentSettings: () => ipcRenderer.invoke('get-current-settings'),
  fetchConfigNames: () => ipcRenderer.invoke("get-config-names"),
  fetchVideoFiles: () => ipcRenderer.invoke('get-videos'),
  setGameTolerance: (game) => ipcRenderer.invoke("set-tolerance", game),
  getPath: (segments) => {
    if (process.env.ELECTRON_START_URL) {
      return path.join(...segments);
    } else {
      return path.join(__dirname, ...segments);
    }
  },
  getFilePath: (filePath) => {
    if (process.env.ELECTRON_START_URL) {
      return `file://${filePath}`
    } else {
      return filePath;
    }
  },
  getUserDataPath: (segments) => {
    if (process.env.ELECTRON_START_URL) {
      return path.join(...segments);
    } else {
      return ipcRenderer.invoke("get-user-data-path", segments);
    }
  },
  isDeepStrictEqual: (obj1, obj2) => {
    return isDeepStrictEqual(obj1, obj2);
  },
  pickConfigFile: () => ipcRenderer.invoke("dialog:openConfig"),
});