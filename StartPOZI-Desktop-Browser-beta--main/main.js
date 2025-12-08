const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
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
                                 allowRunningInsecureContent: true
    },
    backgroundColor: '#1e1e1e'
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();

    // Создаём первую вкладку
    mainWindow.webContents.send('OPEN_URL', `file://${path.join(__dirname, 'MainPage', 'index.html')}`);
  });
}

// Кнопки окна
ipcMain.on('minimize', () => mainWindow.minimize());
ipcMain.on('maximize', () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on('close', () => mainWindow.close());

// ОТКРЫТИЕ НОВОЙ ВКЛАДКИ — ИЗ ЛЮБОГО МЕСТА (preload, renderer, MainPage)
ipcMain.on('OPEN_URL', (e, url) => {
  mainWindow?.webContents.send('OPEN_URL', url);
});

app.whenReady().then(createWindow);
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
