// main.js — РАБОЧАЯ ВЕРСИЯ (декабрь 2025 + автосохранение без диалога + смена пути)
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
let downloadPath = app.getPath('downloads');  // По умолчанию

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
                          nodeIntegration: true,
                          contextIsolation: false,
                          webviewTag: true,
                          webSecurity: false
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

  // Глобальная обработка загрузок
  win.webContents.session.on('will-download', (event, item) => {
    const filename = item.getFilename() || 'download';
    const savePath = path.join(downloadPath, filename);

    // Создаём папку, если нет
    if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });

    item.setSavePath(savePath);

    item.on('done', (e, state) => {
      if (state === 'completed') {
        const currentUrl = item.getURLChain()[0] || '';
        win.webContents.send('download-completed', { filename, url: currentUrl });
      }
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

// Новые handlers для смены пути
ipcMain.handle('get-current-download-path', () => downloadPath);

ipcMain.handle('set-download-path', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Выберите папку для загрузок'
  });
  if (!result.canceled) {
    downloadPath = result.filePaths[0];
  }
  return downloadPath;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
