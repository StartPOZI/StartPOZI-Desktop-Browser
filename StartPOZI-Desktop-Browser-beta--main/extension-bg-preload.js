const { ipcRenderer, contextBridge } = require('electron');

const storageAPI = {
    get: ({ extensionId, keys, namespace = 'local', requestId }) => new Promise(resolve => {
        const channel = `extension-storage-result-${requestId}`;
        ipcRenderer.once(channel, (event, result) => resolve(result));
        ipcRenderer.send('extension-storage-get', { extensionId, keys, namespace, requestId });
    }),
    set: ({ extensionId, items, namespace = 'local', requestId }) => new Promise(resolve => {
        const channel = `extension-storage-saved-${requestId}`;
        ipcRenderer.once(channel, (event, result) => resolve(result));
        ipcRenderer.send('extension-storage-set', { extensionId, items, namespace, requestId });
    }),
    remove: ({ extensionId, keys, namespace = 'local' }) => new Promise(resolve => {
        ipcRenderer.send('extension-storage-remove', { extensionId, keys, namespace });
        resolve();
    }),
    clear: ({ extensionId, namespace = 'local' }) => new Promise(resolve => {
        ipcRenderer.send('extension-storage-clear', { extensionId, namespace });
        resolve();
    })
};

contextBridge.exposeInMainWorld('electronStorageAPI', storageAPI);
window.electronStorageAPI = storageAPI;
