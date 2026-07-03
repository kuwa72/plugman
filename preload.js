const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  scanPlugins: (forceRefresh) => ipcRenderer.invoke('scan-plugins', forceRefresh),
  analyzePlugin: (pluginPath, pluginName, forceNativeScan) => ipcRenderer.invoke('analyze-plugin', pluginPath, pluginName, forceNativeScan),
  deletePlugin: (pluginPath) => ipcRenderer.invoke('delete-plugin', pluginPath),
  openFolder: (pluginPath) => ipcRenderer.invoke('open-folder', pluginPath),
  getUninstallInfo: (pluginPath, developer) => ipcRenderer.invoke('get-uninstall-info', pluginPath, developer),
  runExecutable: (exePath) => ipcRenderer.invoke('run-executable', exePath),
  openWindowsApps: () => ipcRenderer.invoke('open-windows-apps'),
  sendChatMessage: (message, pluginsList) => ipcRenderer.invoke('send-chat-message', message, pluginsList)
});
