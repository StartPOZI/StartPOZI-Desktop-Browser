const { contextBridge, ipcRenderer } = require('electron');

console.log('player-preload.js загружен');
window.addEventListener('error', (e) => {
    console.error('Ошибка в player window:', e.error);
});

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.send('popup:minimize'),
                                maximize: () => ipcRenderer.send('popup:maximize'),
                                close: () => ipcRenderer.send('popup:close'),
                                openExternal: (url) => {
                                    ipcRenderer.send('open-external', url);
                                    // возвращаем resolved promise, чтобы сохранить интерфейс
                                    return Promise.resolve();
                                }
});
