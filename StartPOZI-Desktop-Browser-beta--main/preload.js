// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Полный API для Settings.html
contextBridge.exposeInMainWorld('electronAPI', {
    // История
    getHistory: () => ipcRenderer.invoke('get-browser-history'),
                                clearHistory: () => ipcRenderer.invoke('clear-browser-history'),
                                onHistoryUpdated: (callback) => ipcRenderer.on('history-updated', callback),

                                // Загрузки
                                getDownloads: () => ipcRenderer.invoke('get-browser-downloads'),
                                clearDownloads: () => ipcRenderer.invoke('clear-browser-downloads'),
                                getCurrentDownloadPath: () => ipcRenderer.invoke('get-current-download-path'),
                                setDownloadPath: () => ipcRenderer.invoke('set-download-path'),
                                onDownloadsUpdated: (callback) => ipcRenderer.on('downloads-updated', callback),

                                // Настройки
                                getSearchEngine: () => ipcRenderer.invoke('get-search-engine'),
                                setSearchEngine: (url) => ipcRenderer.send('set-search-engine', url),
                                getSaveTabs: () => ipcRenderer.invoke('get-save-tabs'),
                                setSaveTabs: (isEnabled) => ipcRenderer.send('set-save-tabs', isEnabled),
                                getSaveInternalPages: () => ipcRenderer.invoke('get-save-internal-pages'),
                                setSaveInternalPages: (isEnabled) => ipcRenderer.send('set-save-internal-pages', isEnabled),

                                // Плагины
                                getPlugins: () => ipcRenderer.invoke('get-plugins'),
                                addPlugin: () => ipcRenderer.invoke('add-plugin'),
                                togglePlugin: (pluginId, enabled) => ipcRenderer.invoke('toggle-plugin', pluginId, enabled),
                                removePlugin: (pluginId) => ipcRenderer.invoke('remove-plugin', pluginId),
                                openPluginsFolder: () => ipcRenderer.invoke('open-plugins-folder'),
                                openPluginSettings: (pluginId) => ipcRenderer.invoke('open-plugin-settings', pluginId),
                                savePluginSettings: (pluginId, settings) => ipcRenderer.invoke('save-plugin-settings', pluginId, settings),
                                getPluginSettings: (pluginId) => ipcRenderer.invoke('get-plugin-settings', pluginId),
                                onPluginSettingsUpdated: (callback) => ipcRenderer.on('plugin-settings-updated', callback),

                                // ОЧЕНЬ ВАЖНО: Метод для открытия меню плагина
                                openPluginPopup: (pluginId) => ipcRenderer.invoke('open-plugin-popup', pluginId),

                                // Тема
                                getTheme: () => ipcRenderer.invoke('get-theme'),
                                setTheme: (theme) => ipcRenderer.send('set-theme', theme),
                                onThemeUpdated: (callback) => ipcRenderer.on('theme-updated', callback),

                                // Открыть URL
                                openUrlFromSettings: (url) => ipcRenderer.send('OPEN_URL', url)
});
