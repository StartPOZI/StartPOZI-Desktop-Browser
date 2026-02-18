// ==================== preload-main.js (полный файл с исправлениями) ====================

const { ipcRenderer, contextBridge } = require('electron');
console.log('✅ preload-main.js загружен');

// [НОВОЕ] Проверяем аргументы командной строки на наличие флага инкогнито
const isIncognito = process.argv.includes('--incognito');

// Получаем информацию о режиме контекстной изоляции
const isContextIsolated = process.contextIsolated;

// Функция для генерации уникального ID запроса
const generateRequestId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Белый список каналов для invoke (вызовы с возвратом результата)
const validInvokeChannels = [
    'get-plugins',
'add-plugin',
'toggle-plugin',
'save-extension-state',
'load-extension-states',
'remove-plugin',
'open-plugin-popup',
'close-plugin-popup',
'get-extension-info',
'open-plugins-folder',
'get-browser-actions',
'extension-storage-info',
'extension-storage-backup',
'load-extension-data',
'restart-browser',
'get-browser-history',
'clear-browser-history',
'get-browser-downloads',
'clear-browser-downloads',
'get-current-download-path',
'set-download-path',
'get-save-tabs',
'set-save-tabs',
'get-save-internal-pages',
'set-save-internal-pages',
'get-search-engine',
'set-search-engine',
'get-theme',
'set-theme',
'get-passwords-ipc',
'add-password-ipc',
'delete-password-ipc',
'ping-settings',
'test-settings-api',
'get-platform-info',
'register-browser-in-system',
'unregister-browser-from-system',
'check-system-registration',
'get-manual-instructions',
'extension-storage-get',
'extension-storage-set',
'extension-storage-remove',
'extension-storage-clear',
'save-extension-data',
'load-extension-data',
'save-extension-file',
'load-extension-file',
'save-extensions-backup',
'delete-extension-data',
// НОВЫЕ КАНАЛЫ
'create-incognito-window',
'clear-cache-and-data',
'detach-video',
'detach-youtube-video',
'set-master-password',
'verify-master-password',
'has-master-password',
'get-custom-theme',
// [ДОБАВЛЕНО] Канал для удаления кастомной темы
'clear-custom-theme',
'open-player-window'
];

// Создаем безопасный API для рендерера
const electronAPI = {
    // ========== БАЗОВЫЕ IPC МЕТОДЫ ==========
    send: (channel, ...args) => {
        const validChannels = [
            'minimize', 'maximize', 'close', 'save-tabs', 'OPEN_URL',
            'extension-storage-get', 'extension-storage-set',
            'extension-storage-delete', 'extension-storage-clear',
            'on-passwords-updated', 'extensions-updated',
            'extension-state-changed', 'extension-settings-save',
            'page-saved', 'security-blocked', 'extension-data-saved',
            'extension-data-loaded', 'extension-storage-error',
            'show-downloads-popup', 'close-downloads-window',
            'cancel-download', 'open-folder',
            'get-passwords-request', 'add-password-request',
            'edit-password-request', 'delete-password-request',
            'toggle-password-favorite-request', 'update-password-last-used-request',
            'clear-all-passwords-request', 'export-passwords-request',
            'import-passwords-request', 'get-passwords-request-sync',
            'settings-loaded', 'restart-required', 'tabs-saved',
            'popup:minimize', 'popup:maximize', 'popup:close', 'popup:resize',
            'extension-action-clicked'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, ...args);
        } else {
            console.warn(`Invalid send channel: ${channel}`);
        }
    },

    on: (channel, callback) => {
        const validChannels = [
            'extension-storage-changed',
            'passwords-updated',
            'download-started', 'download-progress', 'download-state',
            'download-completed', 'downloads-updated', 'OPEN_URL',
            'save-tabs', 'restart-required', 'extensions-loaded',
            'extensions-updated', 'extension-state-changed',
            'extension-settings-save', 'page-saved', 'security-blocked',
            'extension-data-saved', 'extension-data-loaded',
            'extension-storage-error', 'theme-updated', 'history-updated',
            'get-passwords-response', 'add-password-response',
            'edit-password-response', 'delete-password-response',
            'toggle-password-favorite-response', 'update-password-last-used-response',
            'clear-all-passwords-response', 'export-passwords-response',
            'import-passwords-response', 'extension-storage-result',
            'extension-storage-saved', 'extension-storage-removed',
            'extension-storage-cleared',
            'apply-custom-theme',
            // [ДОБАВЛЕНО] Канал для удаления кастомной темы
            'clear-custom-theme'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (_, ...args) => callback(...args));
        } else {
            console.warn(`Invalid on channel: ${channel}`);
        }
    },

    once: (channel, callback) => {
        const validChannels = [
            'extension-storage-changed',
            'passwords-updated',
            'download-started', 'download-progress', 'download-state',
            'download-completed', 'downloads-updated', 'OPEN_URL',
            'save-tabs', 'restart-required', 'extensions-loaded',
            'extensions-updated', 'extension-state-changed',
            'extension-settings-save', 'page-saved', 'security-blocked',
            'extension-data-saved', 'extension-data-loaded',
            'extension-storage-error', 'theme-updated', 'history-updated',
            'get-passwords-response', 'add-password-response',
            'edit-password-response', 'delete-password-response',
            'toggle-password-favorite-response', 'update-password-last-used-response',
            'clear-all-passwords-response', 'export-passwords-response',
            'import-passwords-response', 'extension-storage-result',
            'extension-storage-saved', 'extension-storage-removed',
            'extension-storage-cleared',
            'apply-custom-theme',
            // [ДОБАВЛЕНО] Канал для удаления кастомной темы
            'clear-custom-theme'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.once(channel, (_, ...args) => callback(...args));
        } else {
            console.warn(`Invalid once channel: ${channel}`);
        }
    },

    removeListener: (channel, callback) => {
        const validChannels = [
            'extension-storage-changed',
            'passwords-updated',
            'download-started', 'download-progress', 'download-state',
            'download-completed', 'downloads-updated', 'OPEN_URL',
            'save-tabs', 'restart-required', 'extensions-loaded',
            'extensions-updated', 'extension-state-changed',
            'extension-settings-save', 'page-saved', 'security-blocked',
            'extension-data-saved', 'extension-data-loaded',
            'extension-storage-error', 'theme-updated', 'history-updated',
            'get-passwords-response', 'add-password-response',
            'edit-password-response', 'delete-password-response',
            'toggle-password-favorite-response', 'update-password-last-used-response',
            'clear-all-passwords-response', 'export-passwords-response',
            'import-passwords-response', 'extension-storage-result',
            'extension-storage-saved', 'extension-storage-removed',
            'extension-storage-cleared',
            'apply-custom-theme',
            // [ДОБАВЛЕНО] Канал для удаления кастомной темы
            'clear-custom-theme'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.removeListener(channel, callback);
        } else {
            console.warn(`Invalid removeListener channel: ${channel}`);
        }
    },

    // ========== УНИВЕРСАЛЬНЫЙ INVoke МЕТОД ==========
    invoke: async (channel, ...args) => {
        if (!validInvokeChannels.includes(channel)) {
            console.warn(`Invalid invoke channel: ${channel}`);
            throw new Error(`Invalid channel: ${channel}`);
        }

        // Специальная обработка для каналов, где в renderer передаётся объект,
        // а main ожидает простые аргументы
        if (channel === 'load-extension-data' && args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
            // В renderer вызывают: invoke('load-extension-data', { extensionId, dataType })
            // main ожидает только extensionId как строку
            const { extensionId } = args[0];
            if (extensionId) {
                return await ipcRenderer.invoke(channel, extensionId);
            }
        }

        // Для остальных случаев просто передаём аргументы
        return await ipcRenderer.invoke(channel, ...args);
    },

    // ========== ДОПОЛНИТЕЛЬНЫЕ МЕТОДЫ ==========
    ping: () => 'pong',
    testAPI: () => {
        console.log('✅ API работает');
        return { success: true, timestamp: Date.now() };
    },

    // ========== МЕТОДЫ ДЛЯ РАБОТЫ С ПЛАТФОРМОЙ ==========
    getPlatformInfo: async () => {
        return await ipcRenderer.invoke('get-platform-info');
    },

    // ========== МЕТОДЫ ДЛЯ РАБОТЫ С РАСШИРЕНИЯМИ ==========
    getPlugins: async () => {
        return await ipcRenderer.invoke('get-plugins');
    },
    addPlugin: async () => {
        return await ipcRenderer.invoke('add-plugin');
    },
    togglePlugin: async (pluginId, enabled) => {
        return await ipcRenderer.invoke('toggle-plugin', pluginId, enabled);
    },
    saveExtensionState: async (extensionId, enabled) => {
        return await ipcRenderer.invoke('save-extension-state', extensionId, enabled);
    },
    loadExtensionStates: async () => {
        return await ipcRenderer.invoke('load-extension-states');
    },
    removePlugin: async (pluginId) => {
        return await ipcRenderer.invoke('remove-plugin', pluginId);
    },
    openPluginPopup: async (pluginId, anchorRect) => {
        return await ipcRenderer.invoke('open-plugin-popup', pluginId, anchorRect);
    },
    closePluginPopup: async (pluginId) => {
        return await ipcRenderer.invoke('close-plugin-popup', pluginId);
    },
    getExtensionInfo: async (pluginId) => {
        return await ipcRenderer.invoke('get-extension-info', pluginId);
    },
    openPluginsFolder: async () => {
        return await ipcRenderer.invoke('open-plugins-folder');
    },
    getBrowserActions: async () => {
        return await ipcRenderer.invoke('get-browser-actions');
    },
    extensionStorageInfo: async (extensionId) => {
        return await ipcRenderer.invoke('extension-storage-info', extensionId);
    },
    extensionStorageBackup: async (extensionId) => {
        return await ipcRenderer.invoke('extension-storage-backup', extensionId);
    },
    loadExtensionData: async (extensionId) => {
        return await ipcRenderer.invoke('load-extension-data', extensionId);
    },


    // ========== МЕТОДЫ ДЛЯ УПРАВЛЕНИЯ БРАУЗЕРОМ ==========
    restartBrowser: async () => {
        return await ipcRenderer.invoke('restart-browser');
    },

    // ========== МЕТОДЫ ДЛЯ РАБОТЫ С ИСТОРИЕЙ ==========
    getBrowserHistory: async () => {
        return await ipcRenderer.invoke('get-browser-history');
    },
    clearBrowserHistory: async () => {
        return await ipcRenderer.invoke('clear-browser-history');
    },

    // ========== МЕТОДЫ ДЛЯ РАБОТЫ С ЗАГРУЗКАМИ ==========
    getBrowserDownloads: async () => {
        return await ipcRenderer.invoke('get-browser-downloads');
    },
    clearBrowserDownloads: async () => {
        return await ipcRenderer.invoke('clear-browser-downloads');
    },
    getCurrentDownloadPath: async () => {
        return await ipcRenderer.invoke('get-current-download-path');
    },
    setDownloadPath: async () => {
        return await ipcRenderer.invoke('set-download-path');
    },
    showDownloadsPopup: () => {
        ipcRenderer.send('show-downloads-popup');
    },
    closeDownloadsWindow: () => {
        ipcRenderer.send('close-downloads-window');
    },
    cancelDownload: (id) => {
        ipcRenderer.send('cancel-download', id);
    },
    openFolder: (filePath) => {
        ipcRenderer.send('open-folder', filePath);
    },

    // ========== МЕТОДЫ ДЛЯ НАСТРОЕК ==========
    getSaveTabs: async () => {
        return await ipcRenderer.invoke('get-save-tabs');
    },
    setSaveTabs: async (isEnabled) => {
        return await ipcRenderer.invoke('set-save-tabs', isEnabled);
    },
    getSaveInternalPages: async () => {
        return await ipcRenderer.invoke('get-save-internal-pages');
    },
    setSaveInternalPages: async (isEnabled) => {
        return await ipcRenderer.invoke('set-save-internal-pages', isEnabled);
    },
    getSearchEngine: async () => {
        return await ipcRenderer.invoke('get-search-engine');
    },
    setSearchEngine: async (url) => {
        return await ipcRenderer.invoke('set-search-engine', url);
    },
    getTheme: async () => {
        return await ipcRenderer.invoke('get-theme');
    },
    setTheme: async (theme) => {
        return await ipcRenderer.invoke('set-theme', theme);
    },

    // ========== МЕТОДЫ ДЛЯ РАБОТЫ С ПАРОЛЯМИ ==========
    getPasswords: async () => {
        return await ipcRenderer.invoke('get-passwords-ipc');
    },
    addPassword: async (data) => {
        return await ipcRenderer.invoke('add-password-ipc', data);
    },
    deletePassword: async (id) => {
        return await ipcRenderer.invoke('delete-password-ipc', id);
    },
    // Методы для работы с паролями через события (для совместимости)
    getPasswordsRequest: (callback) => {
        ipcRenderer.once('get-passwords-response', (_, passwords) => {
            callback(passwords);
        });
        ipcRenderer.send('get-passwords-request');
    },
    addPasswordRequest: (passwordData, callback) => {
        ipcRenderer.once('add-password-response', (_, response) => {
            callback(response);
        });
        ipcRenderer.send('add-password-request', passwordData);
    },
    editPasswordRequest: (id, updates, callback) => {
        ipcRenderer.once('edit-password-response', (_, response) => {
            callback(response);
        });
        ipcRenderer.send('edit-password-request', { id, updates });
    },
    deletePasswordRequest: (id, callback) => {
        ipcRenderer.once('delete-password-response', (_, response) => {
            callback(response);
        });
        ipcRenderer.send('delete-password-request', id);
    },
    togglePasswordFavoriteRequest: (id, favorite, callback) => {
        ipcRenderer.once('toggle-password-favorite-response', (_, response) => {
            callback(response);
        });
        ipcRenderer.send('toggle-password-favorite-request', { id, favorite });
    },
    updatePasswordLastUsedRequest: (id, callback) => {
        ipcRenderer.once('update-password-last-used-response', (_, response) => {
            callback(response);
        });
        ipcRenderer.send('update-password-last-used-request', id);
    },
    clearAllPasswordsRequest: (callback) => {
        ipcRenderer.once('clear-all-passwords-response', (_, response) => {
            callback(response);
        });
        ipcRenderer.send('clear-all-passwords-request');
    },
    exportPasswordsRequest: (callback) => {
        ipcRenderer.once('export-passwords-response', (_, response) => {
            callback(response);
        });
        ipcRenderer.send('export-passwords-request');
    },
    importPasswordsRequest: (callback) => {
        ipcRenderer.once('import-passwords-response', (_, response) => {
            callback(response);
        });
        ipcRenderer.send('import-passwords-request');
    },

    // ========== СПЕЦИАЛЬНЫЕ МЕТОДЫ ДЛЯ СОБЫТИЙ ЗАГРУЗОК ==========
    onDownloadStarted: (callback) => {
        ipcRenderer.on('download-started', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('download-started', callback);
    },
    onDownloadProgress: (callback) => {
        ipcRenderer.on('download-progress', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('download-progress', callback);
    },
    onDownloadState: (callback) => {
        ipcRenderer.on('download-state', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('download-state', callback);
    },
    onDownloadCompleted: (callback) => {
        ipcRenderer.on('download-completed', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('download-completed', callback);
    },
    onDownloadsUpdated: (callback) => {
        ipcRenderer.on('downloads-updated', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('downloads-updated', callback);
    },

    // ========== МЕТОД ДЛЯ СОБЫТИЙ ПАРОЛЕЙ ==========
    onPasswordsUpdated: (callback) => {
        ipcRenderer.on('passwords-updated', (_, data) => callback(data));
        return () => ipcRenderer.removeListener('passwords-updated', callback);
    },

    // ========== МЕТОДЫ ДЛЯ НАСТРОЕК (ДОПОЛНИТЕЛЬНЫЕ) ==========
    pingSettings: async () => {
        return await ipcRenderer.invoke('ping-settings');
    },
    testSettingsAPI: async () => {
        return await ipcRenderer.invoke('test-settings-api');
    },


    // =========== PiP ==========

    openPlayerWindow: async (videoId, title) => {
        return await ipcRenderer.invoke('open-player-window', videoId, title);
    },

    detachYoutubeVideo: async (videoId, title) => {
        return await ipcRenderer.invoke('detach-youtube-video', videoId, title);
    },

    openExternalUrl: async (url) => {
        return await ipcRenderer.invoke('open-external', url);
    },

    // ========== НОВЫЕ МЕТОДЫ (инкогнито, очистка кэша, видео, мастер-пароль) ==========
    createIncognitoWindow: async () => {
        return await ipcRenderer.invoke('create-incognito-window');
    },
    clearCacheAndData: async () => {
        return await ipcRenderer.invoke('clear-cache-and-data');
    },
    detachVideo: async (videoUrl, title) => {
        return await ipcRenderer.invoke('detach-video', videoUrl, title);
    },
    setMasterPassword: async (password) => {
        return await ipcRenderer.invoke('set-master-password', password);
    },
    verifyMasterPassword: async (password) => {
        return await ipcRenderer.invoke('verify-master-password', password);
    },
    hasMasterPassword: async () => {
        return await ipcRenderer.invoke('has-master-password');
    },
    // Метод для получения кастомной темы
    getCustomTheme: async () => {
        return await ipcRenderer.invoke('get-custom-theme');
    },
    // [ДОБАВЛЕНО] Метод для удаления кастомной темы
    clearCustomTheme: async () => {
        return await ipcRenderer.invoke('clear-custom-theme');
    }
};

// Экспонируем API в глобальную область
try {
    if (isContextIsolated && contextBridge) {
        contextBridge.exposeInMainWorld('electronAPI', electronAPI);
        console.log('✅ electronAPI экспортирован через contextBridge');
    } else {
        window.electronAPI = electronAPI;
        console.log('✅ electronAPI установлен напрямую');
    }
} catch (error) {
    console.error('Ошибка при экспорте electronAPI:', error);
    window.electronAPI = electronAPI;
}

// [НОВОЕ] Экспонируем флаг инкогнито
try {
    if (isContextIsolated && contextBridge) {
        contextBridge.exposeInMainWorld('__isIncognito', isIncognito);
    } else {
        window.__isIncognito = isIncognito;
    }
} catch (error) {
    console.error('Ошибка при экспорте isIncognito:', error);
}

// Также экспонируем отдельный API для расширений (для совместимости)
try {
    if (isContextIsolated && contextBridge) {
        contextBridge.exposeInMainWorld('extensionStorageAPI', {
            get: async (key) => {
                const response = await ipcRenderer.invoke('extension-storage-get', key);
                return response.data;
            },
            set: async (key, value) => {
                await ipcRenderer.invoke('extension-storage-set', key, value);
            },
            delete: async (key) => {
                await ipcRenderer.invoke('extension-storage-delete', key);
            },
            clear: async () => {
                await ipcRenderer.invoke('extension-storage-clear');
            }
        });
        console.log('✅ extensionStorageAPI экспортирован через contextBridge');
    } else {
        window.extensionStorageAPI = {
            get: async (key) => {
                const response = await ipcRenderer.invoke('extension-storage-get', key);
                return response.data;
            },
            set: async (key, value) => {
                await ipcRenderer.invoke('extension-storage-set', key, value);
            },
            delete: async (key) => {
                await ipcRenderer.invoke('extension-storage-delete', key);
            },
            clear: async () => {
                await ipcRenderer.invoke('extension-storage-clear');
            }
        };
        console.log('✅ extensionStorageAPI установлен напрямую');
    }
} catch (error) {
    console.error('Ошибка при экспорте extensionStorageAPI:', error);
}

// Экспонируем методы для регистрации браузера в системе
try {
    if (isContextIsolated && contextBridge) {
        contextBridge.exposeInMainWorld('systemRegistryAPI', {
            registerBrowser: async () => {
                const response = await ipcRenderer.invoke('register-browser-in-system');
                return response;
            },
            unregisterBrowser: async () => {
                const response = await ipcRenderer.invoke('unregister-browser-from-system');
                return response;
            },
            checkRegistration: async () => {
                const response = await ipcRenderer.invoke('check-system-registration');
                return response;
            },
            getManualInstructions: async () => {
                const response = await ipcRenderer.invoke('get-manual-instructions');
                return response;
            }
        });
        console.log('✅ systemRegistryAPI экспортирован через contextBridge');
    } else {
        window.systemRegistryAPI = {
            registerBrowser: async () => {
                const response = await ipcRenderer.invoke('register-browser-in-system');
                return response;
            },
            unregisterBrowser: async () => {
                const response = await ipcRenderer.invoke('unregister-browser-from-system');
                return response;
            },
            checkRegistration: async () => {
                const response = await ipcRenderer.invoke('check-system-registration');
                return response;
            },
            getManualInstructions: async () => {
                const response = await ipcRenderer.invoke('get-manual-instructions');
                return response;
            }
        };
        console.log('✅ systemRegistryAPI установлен напрямую');
    }
} catch (error) {
    console.error('Ошибка при экспорте systemRegistryAPI:', error);
}

// Экспонируем методы для работы с паролями
try {
    if (isContextIsolated && contextBridge) {
        contextBridge.exposeInMainWorld('passwordsAPI', {
            onUpdated: (callback) => {
                ipcRenderer.on('passwords-updated', () => callback());
                return () => ipcRenderer.removeListener('passwords-updated', () => callback());
            }
        });
        console.log('✅ passwordsAPI экспортирован через contextBridge');
    } else {
        window.passwordsAPI = {
            onUpdated: (callback) => {
                ipcRenderer.on('passwords-updated', () => callback());
                return () => ipcRenderer.removeListener('passwords-updated', () => callback());
            }
        };
        console.log('✅ passwordsAPI установлен напрямую');
    }
} catch (error) {
    console.error('Ошибка при экспорте passwordsAPI:', error);
}

// Отладочные сообщения и диагностика
window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, проверяем electronAPI...');
    if (window.electronAPI) {
        console.log('✅ electronAPI доступен. Методы:', Object.keys(window.electronAPI));
        window.electronAPI.testAPI();
    } else {
        console.error('❌ electronAPI НЕ доступен в DOM!');
    }
    // Проверяем extensionStorageAPI
    if (window.extensionStorageAPI) {
        console.log('✅ extensionStorageAPI доступен');
    }
    // Проверяем systemRegistryAPI
    if (window.systemRegistryAPI) {
        console.log('✅ systemRegistryAPI доступен');
    }
    // Проверяем passwordsAPI
    if (window.passwordsAPI) {
        console.log('✅ passwordsAPI доступен');
    }
    console.log('🕵️ Режим инкогнито:', window.__isIncognito ? 'ДА' : 'НЕТ');
});

window.__startpozi_debug = {
    preloadLoaded: true,
    contextIsolated: isContextIsolated,
    timestamp: Date.now()
};
console.log('=== preload-main.js завершил инициализацию ===');
