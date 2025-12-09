// main.js — ФИНАЛЬНАЯ ВЕРСИЯ С PRELOAD ДЛЯ WEBVIEW 2025
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
      preload: path.join(__dirname, 'preload.js'), // это для основного окна, оставляем
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

  // === УСТАНОВКА PRELOAD ДЛЯ КАЖДОГО WEBVIEW ===
  win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    // Устанавливаем preload-скрипт для webview — здесь переопределим диалоги
    webPreferences.preload = path.join(__dirname, 'webview-preload.js');

    // Обеспечиваем те же настройки, что и в основном окне (на всякий случай)
    webPreferences.nodeIntegration = true;
    webPreferences.contextIsolation = false;
    webPreferences.webSecurity = false;
    webPreferences.allowRunningInsecureContent = true;
  });

  // === БЕЗОПАСНОЕ ОТКРЫТИЕ ССЫЛОК В НОВЫХ ВКЛАДКАХ ===
  win.webContents.on('did-attach-webview', (event, webContents) => {
    // Блокируем настоящие попапы и открываем ссылки внутри нашего браузера
    webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('file:')) {
        win.webContents.send('OPEN_URL', url);
      } else {
        shell.openExternal(url).catch(() => {});
      }
      return { action: 'deny' };
    });

    // Дополнительно ловим клик колёсиком и target="_blank"
    webContents.on('new-window', (e, url) => {
      e.preventDefault();
      if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('file:')) {
        win.webContents.send('OPEN_URL', url);
      } else {
        shell.openExternal(url).catch(() => {});
      }
    });
  });
}

// === Управление окном ===
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
