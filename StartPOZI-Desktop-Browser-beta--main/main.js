// main.js — ФИНАЛЬНАЯ РАБОЧАЯ ВЕРСЯ 2025 года
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

let win;

app.disableHardwareAcceleration();

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
                          webSecurity: false,
                          allowRunningInsecureContent: true,
    },
    backgroundColor: '#1e1e1e'
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();

    setTimeout(() => {
      const startUrl = `file://${path.join(__dirname, 'MainPage', 'index.html')}`;
      win.webContents.send('OPEN_URL', startUrl);
    }, 300);
  });

  // КЛЮЧЕВОЙ МОМЕНТ: ловим событие создания <webview>
  win.webContents.on('did-attach-webview', (event, webContents) => {
    // Это срабатывает каждый раз, когда создаётся новый <webview> (то есть новая вкладка)

    // 1. Отменяем открытие новых окон (включая клик колёсиком!)
    webContents.on('new-window', (e, url, frameName, disposition, options) => {
      e.preventDefault();

      // Если это клик колёсиком или target="_blank" — открываем в новой вкладке внутри нашего браузера
      if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('file:')) {
        win.webContents.send('OPEN_URL', url);
      } else {
        // mailto:, tg:, steam: и т.п. — в системе
        shell.openExternal(url).catch(() => {});
      }
    });

    // 2. Дополнительно блокируем popup-ы, если сайт пытается открыть окно сам
    webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http')) {
        win.webContents.send('OPEN_URL', url);
      } else {
        shell.openExternal(url);
      }
      return { action: 'deny' }; // полностью блокируем создание окна
    });
  });
}

// Остальные ipc без изменений
ipcMain.on('minimize', () => win?.minimize());
ipcMain.on('maximize', () => {
  if (win?.isMaximized()) win.unmaximize();
  else win?.maximize();
});
ipcMain.on('close', () => win?.close());

ipcMain.on('OPEN_URL', (event, url) => {
  const safeUrl = url || `file://${path.join(__dirname, 'MainPage', 'index.html')}`;
  win?.webContents.send('OPEN_URL', safeUrl);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
