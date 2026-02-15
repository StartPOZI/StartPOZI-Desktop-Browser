const { ipcRenderer, contextBridge } = require('electron');

const extensionId = process.argv.find(arg => arg.startsWith('--extension-id='))?.split('=')[1] || 'unknown';

const storageAPI = {
    get: (keys, namespace = 'local') => new Promise(resolve => {
        const requestId = `storage-get-${Date.now()}-${Math.random()}`;
        const listener = (event, data) => {
            if (data.requestId === requestId) {
                ipcRenderer.removeListener('extension-storage-result', listener);
                resolve(data.result);
            }
        };
        ipcRenderer.on('extension-storage-result', listener);
        ipcRenderer.send('extension-storage-get', { extensionId, keys, namespace, requestId });
    }),
    set: (items, namespace = 'local') => new Promise(resolve => {
        const requestId = `storage-set-${Date.now()}-${Math.random()}`;
        const listener = (event, data) => {
            if (data.requestId === requestId) {
                ipcRenderer.removeListener('extension-storage-saved', listener);
                resolve();
            }
        };
        ipcRenderer.on('extension-storage-saved', listener);
        ipcRenderer.send('extension-storage-set', { extensionId, items, namespace, requestId });
    }),
    remove: (keys, namespace = 'local') => new Promise(resolve => {
        const requestId = `storage-remove-${Date.now()}-${Math.random()}`;
        ipcRenderer.send('extension-storage-remove', {
            extensionId,
            keys: Array.isArray(keys) ? keys : [keys],
                         namespace,
                         requestId
        });

        // Также подписываемся на подтверждение
        const listener = (event, data) => {
            if (data.requestId === requestId) {
                ipcRenderer.removeListener('extension-storage-removed', listener);
                resolve();
            }
        };
        ipcRenderer.on('extension-storage-removed', listener);
    }),
    clear: (namespace = 'local') => new Promise(resolve => {
        const requestId = `storage-clear-${Date.now()}-${Math.random()}`;
        ipcRenderer.send('extension-storage-clear', {
            extensionId,
            namespace,
            requestId
        });

        // Также подписываемся на подтверждение
        const listener = (event, data) => {
            if (data.requestId === requestId) {
                ipcRenderer.removeListener('extension-storage-cleared', listener);
                resolve();
            }
        };
        ipcRenderer.on('extension-storage-cleared', listener);
    })
};

contextBridge.exposeInMainWorld('electronExtensionAPI', {
    storage: storageAPI,
    getExtensionId: () => extensionId,
                                createTab: url => ipcRenderer.send('OPEN_URL', url),
                                closePopup: () => ipcRenderer.send('popup:close'),
                                sendMessage: message => ipcRenderer.send('extension-message', { extensionId, message }),
                                getInfo: () => ipcRenderer.invoke('get-extension-info', extensionId)
});

window.electronExtensionAPI = { storage: storageAPI };
