const { app, BrowserWindow, Tray, Menu, globalShortcut } = require('electron');
const path = require('path');

let mainWindow;
let tray;

// Use the same logo everywhere: packaged app uses dist/logo.png (same as in-app header/favicon); dev uses electron/icon.png
function getIconPath() {
  if (app.isPackaged) {
    return path.join(__dirname, '../dist/logo.png');
  }
  return path.join(__dirname, 'icon.png');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    icon: getIconPath(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true,
    title: 'Spine AI - Radiology Assistant'
  });

  // Load app: when unpackaged (npm run electron:dev) use Vite dev server; when packaged use built files
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Handle window close - minimize to tray instead
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  tray = new Tray(getIconPath());

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Spine AI',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Spine AI - Radiology Assistant');
  tray.setContextMenu(contextMenu);

  // Double-click tray icon to show window
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

function registerShortcuts() {
  // Global shortcut: Ctrl+Shift+S to show window
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerShortcuts();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('will-quit', () => {
    try {
      globalShortcut.unregisterAll();
    } catch (_) {
      // Ignore if app already tearing down
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
