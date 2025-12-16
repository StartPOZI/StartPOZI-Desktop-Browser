// main.js — ПОЛНЫЙ РАБОЧИЙ КОД (сессия сохраняется без ошибки)
const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
let downloadsWin = null;
let downloadPath = app.getPath('downloads');
let activeDownloadItems = new Map();

async function createWindow() {
  const isDev = (await import('electron-is-dev')).default;

  if (isDev) {
    app.setPath('userData', path.join(app.getPath('appData'), 'StartPOZI-Dev'));
  }

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
  });

  win.webContents.on('will-attach-webview', (event, webPreferences) => {
    webPreferences.preload = path.join(__dirname, 'webview-preload.js');
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.webSecurity = false;
  });

  win.webContents.on('did-attach-webview', (event, attachedWebContents) => {
    attachedWebContents.setWindowOpenHandler((details) => {
      win.webContents.send('OPEN_URL', details.url);
      return { action: 'deny' };
    });
  });

  win.webContents.session.on('will-download', handleDownload);
  session.fromPartition('persist:webview').on('will-download', handleDownload);
}

function createDownloadsWindow() {
  if (downloadsWin) {
    downloadsWin.focus();
    return;
  }

  downloadsWin = new BrowserWindow({
    width: 420,
    height: 520,
    frame: false,
    resizable: false,
    show: false,
    parent: win,
    modal: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
                                   nodeIntegration: true,
                                   contextIsolation: false
    },
    backgroundColor: '#1e1e28'
  });

  downloadsWin.loadFile('downloads_popup.html');

  downloadsWin.once('ready-to-show', () => downloadsWin.show());

  downloadsWin.on('closed', () => {
    downloadsWin = null;
  });
}

function handleDownload(event, item) {
  const filename = item.getFilename() || 'download';
  if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });
  const savePath = path.join(downloadPath, filename);
  const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);

  item.setSavePath(savePath);
  activeDownloadItems.set(id, item);

  win.webContents.send('download-started', { id, filename, totalBytes: item.getTotalBytes() });

  item.on('updated', () => {
    win.webContents.send('download-progress', {
      id,
      receivedBytes: item.getReceivedBytes(),
                         totalBytes: item.getTotalBytes()
    });
  });

  item.on('done', (e, state) => {
    win.webContents.send('download-state', { id, state });
    activeDownloadItems.delete(id);

    if (state === 'completed') {
      win.webContents.send('download-completed', {
        id,
        filename,
        url: item.getURLChain()[0] || '',
                           totalBytes: item.getTotalBytes(),
                           fullPath: savePath,
                           time: Date.now()
      });
    }
  });
}

ipcMain.on('minimize', () => win?.minimize());
ipcMain.on('maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('close', () => {
  if (win && !win.isDestroyed()) {
    win.webContents.send('save-tabs');
    win.close();
  }
});

ipcMain.on('show-downloads-popup', () => createDownloadsWindow());
ipcMain.on('close-downloads-window', () => downloadsWin?.close());

ipcMain.on('OPEN_URL', (e, url) => win?.webContents.send('OPEN_URL', url));

ipcMain.on('cancel-download', (e, id) => {
  const item = activeDownloadItems.get(id);
  if (item) item.cancel();
});

ipcMain.on('open-folder', (e, filePath) => {
  shell.openPath(fs.existsSync(filePath) ? path.dirname(filePath) : downloadPath);
});

ipcMain.handle('get-browser-history', async () => JSON.parse(await win.webContents.executeJavaScript(`localStorage.getItem('browserHistory') || '[]'`)));
ipcMain.handle('clear-browser-history', async () => {
  await win.webContents.executeJavaScript(`localStorage.removeItem('browserHistory')`);
  win.webContents.send('history-updated');
});

ipcMain.handle('get-browser-downloads', async () => JSON.parse(await win.webContents.executeJavaScript(`localStorage.getItem('browserDownloads') || '[]'`)));
ipcMain.handle('clear-browser-downloads', async () => {
  await win.webContents.executeJavaScript(`localStorage.removeItem('browserDownloads')`);
  win.webContents.send('downloads-updated');
});

ipcMain.handle('get-current-download-path', () => downloadPath);
ipcMain.handle('set-download-path', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: downloadPath });
  if (!canceled && filePaths[0]) downloadPath = filePaths[0];
  return downloadPath;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  if (win && !win.isDestroyed()) {
    win.webContents.send('save-tabs');
  }
});
