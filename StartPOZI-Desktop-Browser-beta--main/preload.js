// preload.js - для Settings.html
const { ipcRenderer, contextBridge } = require('electron');

console.log('✅ preload.js загружен для Settings.html');

// Список разрешенных каналов для безопасности
const ALLOWED_SEND_CHANNELS = [
    'open-url-from-settings',
'show-extension-popup',
'extension:message'
];

const ALLOWED_INVOKE_CHANNELS = [
    'test-settings-api',
'get-browser-history',
'clear-browser-history',
'get-browser-downloads',
'clear-browser-downloads',
'get-current-download-path',
'set-download-path',
'get-search-engine',
'set-search-engine',
'get-save-tabs',
'set-save-tabs',
'get-save-internal-pages',
'set-save-internal-pages',
'get-plugins',
'add-plugin',
'toggle-plugin',
'remove-plugin',
'open-plugins-folder',
'open-plugin-popup',
'get-theme',
'set-theme',
'restart-browser',
'ping-settings',
// Методы для менеджера паролей
'get-passwords',
'add-password',
'edit-password',
'delete-password',
'toggle-password-favorite',
'update-password-last-used',
'export-passwords',
'import-passwords',
'clear-all-passwords',
// Методы для системной интеграции
'get-platform-info',
'register-browser-in-system',
'unregister-browser-from-system',
'check-system-registration',
'get-manual-instructions'
];

const ALLOWED_ON_CHANNELS = [
    'history-updated',
'downloads-updated',
'theme-updated',
'restart-required',
'passwords-updated'
];

// Безопасное предоставление API через contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
    // Основные методы IPC
    send: (channel, ...args) => {
        if (ALLOWED_SEND_CHANNELS.includes(channel)) {
            ipcRenderer.send(channel, ...args);
        } else {
            console.warn(`Попытка отправки по запрещенному каналу: ${channel}`);
        }
    },

    sendToHost: (channel, ...args) => {
        if (ALLOWED_SEND_CHANNELS.includes(channel)) {
            ipcRenderer.sendToHost(channel, ...args);
        } else {
            console.warn(`Попытка отправки по запрещенному каналу sendToHost: ${channel}`);
        }
    },

    invoke: async (channel, ...args) => {
        if (ALLOWED_INVOKE_CHANNELS.includes(channel)) {
            try {
                return await ipcRenderer.invoke(channel, ...args);
            } catch (error) {
                console.error(`Ошибка при вызове ${channel}:`, error);
                return {
                    success: false,
                    message: `Ошибка API: ${error.message || 'Неизвестная ошибка'}`
                };
            }
        } else {
            console.warn(`Попытка вызова по запрещенному каналу: ${channel}`);
            return {
                success: false,
                message: `Запрещенный канал: ${channel}`
            };
        }
    },

    on: (channel, callback) => {
        if (ALLOWED_ON_CHANNELS.includes(channel)) {
            const subscription = (event, ...args) => callback(...args);
            ipcRenderer.on(channel, subscription);

            // Возвращаем функцию для отписки
            return () => {
                ipcRenderer.removeListener(channel, subscription);
            };
        } else {
            console.warn(`Попытка подписки на запрещенный канал: ${channel}`);
        }
    },

    removeListener: (channel, callback) => {
        if (ALLOWED_ON_CHANNELS.includes(channel)) {
            ipcRenderer.removeListener(channel, callback);
        }
    },

    removeAllListeners: (channel) => {
        if (ALLOWED_ON_CHANNELS.includes(channel)) {
            ipcRenderer.removeAllListeners(channel);
        }
    },

    // Удобные методы для Settings.html
    // История
    getHistory: () => ipcRenderer.invoke('get-browser-history'),
                                clearHistory: () => ipcRenderer.invoke('clear-browser-history'),

                                // Загрузки
                                getDownloads: () => ipcRenderer.invoke('get-browser-downloads'),
                                clearDownloads: () => ipcRenderer.invoke('clear-browser-downloads'),
                                getCurrentDownloadPath: () => ipcRenderer.invoke('get-current-download-path'),
                                setDownloadPath: () => ipcRenderer.invoke('set-download-path'),

                                // Настройки
                                getSearchEngine: () => ipcRenderer.invoke('get-search-engine'),
                                setSearchEngine: (url) => ipcRenderer.invoke('set-search-engine', url),
                                getSaveTabs: () => ipcRenderer.invoke('get-save-tabs'),
                                setSaveTabs: (isEnabled) => ipcRenderer.invoke('set-save-tabs', isEnabled),
                                getSaveInternalPages: () => ipcRenderer.invoke('get-save-internal-pages'),
                                setSaveInternalPages: (isEnabled) => ipcRenderer.invoke('set-save-internal-pages', isEnabled),

                                // Плагины
                                getPlugins: () => ipcRenderer.invoke('get-plugins'),
                                addPlugin: () => ipcRenderer.invoke('add-plugin'),
                                togglePlugin: (pluginId, enabled) => ipcRenderer.invoke('toggle-plugin', pluginId, enabled),
                                removePlugin: (pluginId) => ipcRenderer.invoke('remove-plugin', pluginId),
                                openPluginsFolder: () => ipcRenderer.invoke('open-plugins-folder'),

                                // Ключевой метод для открытия popup расширений
                                openPluginPopup: (pluginId) => ipcRenderer.invoke('open-plugin-popup', pluginId),

                                // Тема
                                getTheme: () => ipcRenderer.invoke('get-theme'),
                                setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),

                                // Открыть URL в новой вкладке
                                openUrlFromSettings: (url) => {
                                    ipcRenderer.sendToHost('open-url-from-settings', url);
                                },

                                // Рестарт браузера
                                restartBrowser: () => ipcRenderer.invoke('restart-browser'),

                                // Менеджер паролей
                                getPasswords: () => ipcRenderer.invoke('get-passwords'),
                                addPassword: (site, username, password, notes) => ipcRenderer.invoke('add-password', site, username, password, notes),
                                editPassword: (id, data) => ipcRenderer.invoke('edit-password', id, data),
                                deletePassword: (id) => ipcRenderer.invoke('delete-password', id),
                                togglePasswordFavorite: (id, favorite) => ipcRenderer.invoke('toggle-password-favorite', id, favorite),
                                updatePasswordLastUsed: (id) => ipcRenderer.invoke('update-password-last-used', id),
                                exportPasswords: () => ipcRenderer.invoke('export-passwords'),
                                importPasswords: () => ipcRenderer.invoke('import-passwords'),
                                clearAllPasswords: () => ipcRenderer.invoke('clear-all-passwords'),

                                // Системная интеграция
                                getPlatformInfo: () => ipcRenderer.invoke('get-platform-info'),
                                registerBrowserInSystem: () => ipcRenderer.invoke('register-browser-in-system'),
                                unregisterBrowserFromSystem: () => ipcRenderer.invoke('unregister-browser-from-system'),
                                checkSystemRegistration: () => ipcRenderer.invoke('check-system-registration'),
                                getManualInstructions: () => ipcRenderer.invoke('get-manual-instructions'),

                                // События с удобными обертками
                                onHistoryUpdated: (callback) => {
                                    const subscription = () => callback();
                                    ipcRenderer.on('history-updated', subscription);
                                    return () => ipcRenderer.removeListener('history-updated', subscription);
                                },

                                onDownloadsUpdated: (callback) => {
                                    const subscription = () => callback();
                                    ipcRenderer.on('downloads-updated', subscription);
                                    return () => ipcRenderer.removeListener('downloads-updated', subscription);
                                },

                                onThemeUpdated: (callback) => {
                                    const subscription = (event, theme) => callback(theme);
                                    ipcRenderer.on('theme-updated', subscription);
                                    return () => ipcRenderer.removeListener('theme-updated', subscription);
                                },

                                onRestartRequired: (callback) => {
                                    const subscription = (event, data) => callback(data);
                                    ipcRenderer.on('restart-required', subscription);
                                    return () => ipcRenderer.removeListener('restart-required', subscription);
                                },

                                onPasswordsUpdated: (callback) => {
                                    const subscription = () => callback();
                                    ipcRenderer.on('passwords-updated', subscription);
                                    return () => ipcRenderer.removeListener('passwords-updated', subscription);
                                },

                                // Тестовый метод
                                testAPI: () => ipcRenderer.invoke('test-settings-api')
});

// Тест API при загрузке
setTimeout(() => {
    ipcRenderer.invoke('test-settings-api')
    .then(result => {
        console.log('✅ Settings API тест пройден:', result);
    })
    .catch(error => {
        console.error('❌ Settings API ошибка:', error);
    });
}, 1000);

console.log('✅ electronAPI доступен в Settings.html');
