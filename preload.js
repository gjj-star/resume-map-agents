const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  onUpdateStatus: (callback) =>
    ipcRenderer.on('update-status', (_event, data) => callback(data)),
  installUpdate: () => ipcRenderer.invoke('install-update'),
});
