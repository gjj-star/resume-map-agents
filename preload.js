const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  getAuthToken: () => ipcRenderer.invoke('get-auth-token'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  onUpdateStatus: (callback) =>
    ipcRenderer.on('update-status', (_event, data) => callback(data)),
  installUpdate: () => ipcRenderer.invoke('install-update'),
});
