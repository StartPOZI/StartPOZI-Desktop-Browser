const { app, BrowserWindow, ipcMain } = require('electron');
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
                          allowRunningInsecureContent: true
    },
    backgroundColor: '#1e1e1e'
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  // win.webContents.openDevTools({ mode: 'detach' }); // Раскомментируй, если нужно отладка

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();

    setTimeout(() => {
      const startUrl = `file://${path.join(__dirname, 'MainPage', 'index.html')}`;
      win.webContents.send('OPEN_URL', startUrl);
    }, 300);
  });
}

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
