// main.js — РАБОЧАЯ ВЕРСИЯ БЕЗ ОШИБОК PRELOAD (декабрь 2025)
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
                          nodeIntegration: true,         // Включаем
                          contextIsolation: false,       // Отключаем — чтобы не было ошибки с contextBridge
                          webviewTag: true,
                          webSecurity: false,
    },
    backgroundColor: '#1e1e1e'
  });

  win.loadFile('index.html');

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();

    setTimeout(() => {
      if (win && !win.isDestroyed()) {
        const startUrl = `file://${path.join(__dirname, 'MainPage', 'index.html')}`;
        win.webContents.send('OPEN_URL', startUrl);
      }
    }, 500);
  });

  // Preload для webview
  win.webContents.on('will-attach-webview', (event, webPreferences) => {
    webPreferences.preload = path.join(__dirname, 'webview-preload.js');
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.webSecurity = false;
  });

  // Перехват popup'ов
  win.webContents.on('did-attach-webview', (event, attachedWebContents) => {
    attachedWebContents.setWindowOpenHandler((details) => {
      win.webContents.send('OPEN_URL', details.url);
      return { action: 'deny' };
    });
  });
}

ipcMain.on('minimize', () => win?.minimize());
ipcMain.on('maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('close', () => win?.close());

ipcMain.on('OPEN_URL', (event, url) => {
  if (win && !win.isDestroyed()) {
    win.webContents.send('OPEN_URL', url);
  }
});

ipcMain.handle('get-browser-history', async () => {
  if (!win || win.isDestroyed()) return [];
  return await win.webContents.executeJavaScript(`JSON.parse(localStorage.getItem('browserHistory') || '[]')`);
});

ipcMain.handle('clear-browser-history', async () => {
  if (!win || win.isDestroyed()) return;
  await win.webContents.executeJavaScript(`localStorage.removeItem('browserHistory')`);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
