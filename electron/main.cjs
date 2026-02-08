const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Use app.isPackaged instead of electron-is-dev package
const isDev = !app.isPackaged;

const windows = new Set();
let backendServer = null;

// Config file for persistent settings (like Firebase credentials)
function getConfigPath() {
  return path.join(app.getPath('userData'), 'synthlabs-config.json');
}

function loadConfig() {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to load config:', e);
  }
  return {};
}

function saveConfig(config) {
  try {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

// Get path to stored service account JSON (in userData folder)
function getServiceAccountPath() {
  return path.join(app.getPath('userData'), 'firebase-service-account.json');
}

function getBackendEntry() {
  // In production, use the bundled server; in dev, use the source
  if (isDev) {
    return path.join(app.getAppPath(), 'server', 'index.js');
  }
  return path.join(app.getAppPath(), 'server-bundle', 'index.cjs');
}

async function startBackend() {
  if (isDev) {
    console.log('Development mode - skipping embedded backend');
    return null;
  }
  if (backendServer) {
    console.log('Backend already running');
    return backendServer;
  }
  try {
    const backendEntry = getBackendEntry();
    console.log('Loading backend from:', backendEntry);

    // Check if file exists
    const fs = require('fs');
    if (!fs.existsSync(backendEntry)) {
      console.error('Backend bundle not found at:', backendEntry);
      return null;
    }

    // The bundled server is CommonJS, so we can require it directly
    const backendModule = require(backendEntry);
    console.log('Backend module loaded, exports:', Object.keys(backendModule));

    if (typeof backendModule.startServer !== 'function') {
      console.error('startServer is not a function:', typeof backendModule.startServer);
      return null;
    }

    const result = await backendModule.startServer();
    backendServer = result?.server || null;
    const port = result?.port || 'unknown';
    console.log(`Backend server started successfully on port ${port}`);

    // Apply saved Firebase credentials if they exist
    const serviceAccountPath = getServiceAccountPath();
    if (fs.existsSync(serviceAccountPath)) {
      try {
        console.log('Applying saved Firebase service account from:', serviceAccountPath);
        const response = await fetch(`http://localhost:${port}/api/admin/service-account-path`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: serviceAccountPath })
        });
        if (response.ok) {
          console.log('Firebase credentials applied successfully');
        } else {
          console.error('Failed to apply Firebase credentials:', await response.text());
        }
      } catch (e) {
        console.error('Failed to apply Firebase credentials:', e);
      }
    }

    return backendServer;
  } catch (error) {
    console.error('Failed to start backend:', error);
    console.error('Stack:', error?.stack);
    return null;
  }
}

function stopBackend() {
  if (!backendServer) return;
  backendServer.close();
  backendServer = null;
}

function createWindow(navigationUrl) {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.cjs')
    },
    icon: path.join(__dirname, '../assets//cpu_app_icon_pack/cpu_app_icon_256.png'),
    backgroundColor: '#020617'
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  window.loadURL(navigationUrl || startUrl);

  if (isDev) {
    window.webContents.openDevTools();
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    const isAppUrl = isDev ? url.startsWith(startUrl) : url.startsWith('file://');
    if (isAppUrl) {
      createWindow(url);
      return { action: 'deny' };
    }

    shell.openExternal(url);
    return { action: 'deny' };
  });

  window.on('closed', () => {
    windows.delete(window);
  });

  windows.add(window);
  return window;
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => createWindow()
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });

    template[1].submenu.push({ type: 'separator' }, { role: 'pasteAndMatchStyle' });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  // Wait for backend to start before opening window
  await startBackend();
  createWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('open-new-window', () => {
  createWindow();
});

// Save Firebase service account JSON to persistent storage
ipcMain.handle('save-firebase-credentials', async (_event, jsonContent) => {
  try {
    const serviceAccountPath = getServiceAccountPath();
    fs.writeFileSync(serviceAccountPath, jsonContent, { encoding: 'utf8', mode: 0o600 });
    console.log('Firebase credentials saved to:', serviceAccountPath);
    return { ok: true, path: serviceAccountPath };
  } catch (e) {
    console.error('Failed to save Firebase credentials:', e);
    return { ok: false, error: String(e) };
  }
});

// Check if Firebase credentials are configured
ipcMain.handle('get-firebase-status', () => {
  const serviceAccountPath = getServiceAccountPath();
  const exists = fs.existsSync(serviceAccountPath);
  return { configured: exists, path: exists ? serviceAccountPath : null };
});

// Get the backend port (useful for the renderer)
ipcMain.handle('get-backend-port', () => {
  if (backendServer) {
    const address = backendServer.address();
    return address?.port || null;
  }
  return null;
});
