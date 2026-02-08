const { contextBridge, clipboard } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Clipboard operations for PowerScribe integration
  copyToClipboard: (text) => {
    clipboard.writeText(text);
    return true;
  },

  // Check if running in Electron
  isElectron: true,

  // Platform info
  platform: process.platform
});
