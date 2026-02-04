const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  openNewWindow: () => ipcRenderer.invoke('open-new-window'),
  saveFirebaseCredentials: (jsonContent) => ipcRenderer.invoke('save-firebase-credentials', jsonContent),
  getFirebaseStatus: () => ipcRenderer.invoke('get-firebase-status'),
  getBackendPort: () => ipcRenderer.invoke('get-backend-port'),
  platform: process.platform
});
