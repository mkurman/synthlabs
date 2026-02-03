const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openNewWindow: () => ipcRenderer.invoke('open-new-window'),
  platform: process.platform
});
