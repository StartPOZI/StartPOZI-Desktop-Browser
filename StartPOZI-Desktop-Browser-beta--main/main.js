// main.js — окончательный, железобетонный, без падений
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
                          nodeIntegration: true,
                          contextIsolation: false,
                          webviewTag: true,
                          webSecurity: false,
    },
    backgroundColor: '#1e1e1e'
  });

  win.loadFile('index.html');

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();

    // Безопасная отправка стартовой страницы
    setTimeout(() => {
      if (win && !win.isDestroyed()) {
        const startPagePath = path.join(__dirname, 'MainPage', 'index.html');
        const startUrl = `file://${startPagePath}`;
        win.webContents.send('OPEN_URL', startUrl);
      }
    }, 500);
  });

  // Правильный preload для webview
  win.webContents.on('will-attach-webview', (event, webPreferences) => {
    webPreferences.preload = path.join(__dirname, 'webview-preload.js');
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.webSecurity = false;
  });
}

// Управление окном
ipcMain.on('minimize', () => win?.minimize());
ipcMain.on('maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('close', () => win?.close());

// Открытие ссылок
ipcMain.on('OPEN_URL', (e, url) => {
  if (win && !win.isDestroyed()) {
    win.webContents.send('OPEN_URL', url);
  }
});

// Применение темы и настроек
ipcMain.on('update-theme', (e, theme) => {
  if (win && !win.isDestroyed()) win.webContents.send('apply-theme', theme);
});
ipcMain.on('update-setting', (e, setting) => {
  if (win & !win.isDestroyed()) win.webContents.send('apply-setting', setting);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
