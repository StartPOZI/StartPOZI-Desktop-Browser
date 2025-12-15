// main.js — ПОЛНЫЙ КОД (Логика загрузок + IPC)
const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
let downloadPath = app.getPath('downloads');
let activeDownloadItems = new Map(); // id -> DownloadItem

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

  // Настройка webview
  win.webContents.on('will-attach-webview', (event, webPreferences) => {
    webPreferences.preload = path.join(__dirname, 'webview-preload.js');
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.webSecurity = false;
  });

  // Перехват popup окон
  win.webContents.on('did-attach-webview', (event, attachedWebContents) => {
    attachedWebContents.setWindowOpenHandler((details) => {
      win.webContents.send('OPEN_URL', details.url);
      return { action: 'deny' };
    });
  });

  // === ОБРАБОТКА ЗАГРУЗОК ===
  win.webContents.session.on('will-download', handleDownload);
  session.fromPartition('persist:webview').on('will-download', handleDownload);
}

function handleDownload(event, item) {
  const filename = item.getFilename() || 'download';
  if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });
  const savePath = path.join(downloadPath, filename);
  const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);

  item.setSavePath(savePath);
  activeDownloadItems.set(id, item);

  // Отправляем начало загрузки с информацией о размере
  win.webContents.send('download-started', {
    id,
    filename,
    totalBytes: item.getTotalBytes()
  });

  item.on('updated', (event, state) => {
    win.webContents.send('download-state', { id, state });

    if (state === 'progressing') {
      const received = item.getReceivedBytes();
      const total = item.getTotalBytes();

      if (total > 0) {
        const progress = Math.min(100, (received / total) * 100);
        // Отправляем подробную информацию о прогрессе
        win.webContents.send('download-progress', {
          id,
          progress,
          receivedBytes: received,
          totalBytes: total
        });
      }
    }
  });

  item.on('done', (event, state) => {
    win.webContents.send('download-state', { id, state });
    activeDownloadItems.delete(id);

    if (state === 'completed') {
      const currentUrl = item.getURLChain()[0] || '';

      win.webContents.send('download-completed', {
        id,
        filename,
        url: currentUrl,
        totalBytes: item.getTotalBytes(),
                           fullPath: savePath,
                           time: Date.now()
      });
    }
  });
}

// === IPC ОБРАБОТЧИКИ ===

ipcMain.on('minimize', () => win?.minimize());
ipcMain.on('maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('close', () => win?.close());

ipcMain.on('OPEN_URL', (event, url) => {
  if (win && !win.isDestroyed()) win.webContents.send('OPEN_URL', url);
});

// Отмена загрузки
ipcMain.on('cancel-download', (event, id) => {
  const item = activeDownloadItems.get(id);
  if (item) {
    item.cancel();
    activeDownloadItems.delete(id);
  }
});

// Открытие папки с загрузкой
ipcMain.on('open-folder', (event, filePath) => {
  if (fs.existsSync(filePath)) {
    const folderPath = path.dirname(filePath);
    shell.openPath(folderPath).catch(err => {
      console.error('Ошибка при открытии папки:', err);
    });
  } else {
    shell.openPath(downloadPath).catch(err => {
      console.error('Ошибка при открытии папки загрузок:', err);
    });
  }
});

// --- Работа с Историей ---
ipcMain.handle('get-browser-history', async () => {
  if (!win || win.isDestroyed()) return [];
  return await win.webContents.executeJavaScript(`JSON.parse(localStorage.getItem('browserHistory') || '[]')`);
});

ipcMain.handle('clear-browser-history', async () => {
  if (!win || win.isDestroyed()) return;
  await win.webContents.executeJavaScript(`localStorage.removeItem('browserHistory')`);
  win.webContents.send('history-updated');
});

// --- Работа с Загрузками ---
ipcMain.handle('get-browser-downloads', async () => {
  if (!win || win.isDestroyed()) return [];
  return await win.webContents.executeJavaScript(`JSON.parse(localStorage.getItem('browserDownloads') || '[]')`);
});

ipcMain.handle('clear-browser-downloads', async () => {
  if (!win || win.isDestroyed()) return;
  await win.webContents.executeJavaScript(`localStorage.removeItem('browserDownloads')`);
  win.webContents.send('downloads-updated');
});

// --- Путь загрузки ---
ipcMain.handle('get-current-download-path', () => downloadPath);

ipcMain.handle('set-download-path', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Выберите папку для загрузок',
    defaultPath: downloadPath
  });
  if (!result.canceled && result.filePaths.length > 0) {
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
