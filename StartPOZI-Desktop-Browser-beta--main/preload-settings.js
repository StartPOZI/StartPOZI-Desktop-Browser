// preload-settings.js - полный preload для Settings.html
const { ipcRenderer, contextBridge } = require('electron');

console.log('✅ preload-settings.js загружен для Settings.html');

// Безопасное предоставление API через contextBridge
contextBridge.exposeInMainWorld('electronAPI', {
    // Тестовый метод
    ping: () => {
        console.log('Ping вызван из Settings');
        return ipcRenderer.invoke('ping-settings');
    },

    // История
    getHistory: () => {
        console.log('getHistory вызван из Settings');
        return ipcRenderer.invoke('get-browser-history');
    },

    clearHistory: () => {
        console.log('clearHistory вызван из Settings');
        return ipcRenderer.invoke('clear-browser-history');
    },

    // Загрузки
    getDownloads: () => {
        console.log('getDownloads вызван из Settings');
        return ipcRenderer.invoke('get-browser-downloads');
    },

    clearDownloads: () => {
        console.log('clearDownloads вызван из Settings');
        return ipcRenderer.invoke('clear-browser-downloads');
    },

    getCurrentDownloadPath: () => {
        console.log('getCurrentDownloadPath вызван из Settings');
        return ipcRenderer.invoke('get-current-download-path');
    },

    setDownloadPath: () => {
        console.log('setDownloadPath вызван из Settings');
        return ipcRenderer.invoke('set-download-path');
    },

    // Настройки
    getSearchEngine: () => {
        console.log('getSearchEngine вызван из Settings');
        return ipcRenderer.invoke('get-search-engine');
    },

    setSearchEngine: (url) => {
        console.log('setSearchEngine вызван из Settings:', url);
        return ipcRenderer.invoke('set-search-engine', url);
    },

    getSaveTabs: () => {
        console.log('getSaveTabs вызван из Settings');
        return ipcRenderer.invoke('get-save-tabs');
    },

    setSaveTabs: (isEnabled) => {
        console.log('setSaveTabs вызван из Settings:', isEnabled);
        return ipcRenderer.invoke('set-save-tabs', isEnabled);
    },

    getSaveInternalPages: () => {
        console.log('getSaveInternalPages вызван из Settings');
        return ipcRenderer.invoke('get-save-internal-pages');
    },

    setSaveInternalPages: (isEnabled) => {
        console.log('setSaveInternalPages вызван из Settings:', isEnabled);
        return ipcRenderer.invoke('set-save-internal-pages', isEnabled);
    },

    // Плагины
    getPlugins: () => {
        console.log('getPlugins вызван из Settings');
        return ipcRenderer.invoke('get-plugins');
    },

    togglePlugin: (pluginId, enabled) => {
        console.log('togglePlugin вызван из Settings:', pluginId, enabled);
        return ipcRenderer.invoke('toggle-plugin', pluginId, enabled);
    },

    removePlugin: (pluginId) => {
        console.log('removePlugin вызван из Settings:', pluginId);
        return ipcRenderer.invoke('remove-plugin', pluginId);
    },

    addPlugin: () => {
        console.log('addPlugin вызван из Settings');
        return ipcRenderer.invoke('add-plugin');
    },

    openPluginPopup: (pluginId) => {
        console.log('openPluginPopup вызван из Settings:', pluginId);
        return ipcRenderer.invoke('open-plugin-popup', pluginId);
    },

    closePluginPopup: (pluginId) => {
        console.log('closePluginPopup вызван из Settings:', pluginId);
        return ipcRenderer.invoke('close-plugin-popup', pluginId);
    },

    openPluginsFolder: () => {
        console.log('openPluginsFolder вызван из Settings');
        return ipcRenderer.invoke('open-plugins-folder');
    },

    // Тема
    getTheme: () => {
        console.log('getTheme вызван из Settings');
        return ipcRenderer.invoke('get-theme');
    },

    setTheme: (theme) => {
        console.log('setTheme вызван из Settings:', theme);
        return ipcRenderer.invoke('set-theme', theme);
    },

    // Открыть URL
    openUrlFromSettings: (url) => {
        console.log('openUrlFromSettings вызван из Settings:', url);
        ipcRenderer.send('OPEN_URL', url);
    },

    // Рестарт браузера
    restartBrowser: () => {
        console.log('restartBrowser вызван из Settings');
        return ipcRenderer.invoke('restart-browser');
    },

    // =============== РЕГИСТРАЦИЯ БРАУЗЕРА В СИСТЕМЕ ===============
    registerBrowserInSystem: () => {
        console.log('registerBrowserInSystem вызван из Settings');
        return ipcRenderer.invoke('register-browser-in-system');
    },

    unregisterBrowserFromSystem: () => {
        console.log('unregisterBrowserFromSystem вызван из Settings');
        return ipcRenderer.invoke('unregister-browser-from-system');
    },

    checkSystemRegistration: () => {
        console.log('checkSystemRegistration вызван из Settings');
        return ipcRenderer.invoke('check-system-registration');
    },

    getManualInstructions: () => {
        console.log('getManualInstructions вызван из Settings');
        return ipcRenderer.invoke('get-manual-instructions');
    },

    // Получение информации о платформе
    getPlatformInfo: () => {
        console.log('getPlatformInfo вызван из Settings');
        return ipcRenderer.invoke('get-platform-info');
    },

    // =============== МАСТЕР-ПАРОЛЬ И ОЧИСТКА КЭША ===============
    setMasterPassword: (password) => {
        console.log('setMasterPassword вызван из Settings');
        return ipcRenderer.invoke('set-master-password', password);
    },

    verifyMasterPassword: (password) => {
        console.log('verifyMasterPassword вызван из Settings');
        return ipcRenderer.invoke('verify-master-password', password);
    },

    hasMasterPassword: () => {
        console.log('hasMasterPassword вызван из Settings');
        return ipcRenderer.invoke('has-master-password');
    },

    clearCacheAndData: () => {
        console.log('clearCacheAndData вызван из Settings');
        return ipcRenderer.invoke('clear-cache-and-data');
    },

    // =============== КАСТОМНАЯ ТЕМА ===============
    applyCustomTheme: (css) => {
        console.log('applyCustomTheme вызван из Settings, длина CSS:', css?.length);
        ipcRenderer.send('apply-custom-theme', css);
    },

    // =============== ДОБАВЛЕНО: ОЧИСТКА КАСТОМНОЙ ТЕМЫ ===============
    clearCustomTheme: () => {
        console.log('clearCustomTheme вызван из Settings');
        return ipcRenderer.invoke('clear-custom-theme');
    },

    // =============== МЕНЕДЖЕР ПАРОЛЕЙ ===============
    getPasswords: () => {
        console.log('getPasswords вызван из Settings');
        return new Promise((resolve) => {
            ipcRenderer.send('get-passwords-request');
            const handleResponse = (event, passwords) => {
                ipcRenderer.removeListener('get-passwords-response', handleResponse);
                resolve(passwords || []);
            };
            ipcRenderer.on('get-passwords-response', handleResponse);
            setTimeout(() => {
                ipcRenderer.removeListener('get-passwords-response', handleResponse);
                resolve([]);
            }, 5000);
        });
    },

    addPassword: (site, username, password, notes = '') => {
        console.log('addPassword вызван из Settings:', site, username);
        return new Promise((resolve) => {
            ipcRenderer.send('add-password-request', { site, username, password, notes });
            const handleResponse = (event, result) => {
                ipcRenderer.removeListener('add-password-response', handleResponse);
                resolve(result || { success: false, message: 'Ошибка добавления пароля' });
            };
            ipcRenderer.on('add-password-response', handleResponse);
            setTimeout(() => {
                ipcRenderer.removeListener('add-password-response', handleResponse);
                resolve({ success: false, message: 'Таймаут добавления пароля' });
            }, 5000);
        });
    },

    editPassword: (id, updates) => {
        console.log('editPassword вызван из Settings:', id, updates);
        return new Promise((resolve) => {
            ipcRenderer.send('edit-password-request', { id, updates });
            const handleResponse = (event, result) => {
                ipcRenderer.removeListener('edit-password-response', handleResponse);
                resolve(result || { success: false, message: 'Ошибка редактирования пароля' });
            };
            ipcRenderer.on('edit-password-response', handleResponse);
            setTimeout(() => {
                ipcRenderer.removeListener('edit-password-response', handleResponse);
                resolve({ success: false, message: 'Таймаут редактирования пароля' });
            }, 5000);
        });
    },

    deletePassword: (id) => {
        console.log('deletePassword вызван из Settings:', id);
        return new Promise((resolve) => {
            ipcRenderer.send('delete-password-request', id);
            const handleResponse = (event, result) => {
                ipcRenderer.removeListener('delete-password-response', handleResponse);
                resolve(result || { success: false, message: 'Ошибка удаления пароля' });
            };
            ipcRenderer.on('delete-password-response', handleResponse);
            setTimeout(() => {
                ipcRenderer.removeListener('delete-password-response', handleResponse);
                resolve({ success: false, message: 'Таймаут удаления пароля' });
            }, 5000);
        });
    },

    togglePasswordFavorite: (id, favorite) => {
        console.log('togglePasswordFavorite вызван из Settings:', id, favorite);
        return new Promise((resolve) => {
            ipcRenderer.send('toggle-password-favorite-request', { id, favorite });
            const handleResponse = (event, result) => {
                ipcRenderer.removeListener('toggle-password-favorite-response', handleResponse);
                resolve(result || { success: false, message: 'Ошибка обновления избранного' });
            };
            ipcRenderer.on('toggle-password-favorite-response', handleResponse);
            setTimeout(() => {
                ipcRenderer.removeListener('toggle-password-favorite-response', handleResponse);
                resolve({ success: false, message: 'Таймаут обновления избранного' });
            }, 5000);
        });
    },

    updatePasswordLastUsed: (id) => {
        console.log('updatePasswordLastUsed вызван из Settings:', id);
        return new Promise((resolve) => {
            ipcRenderer.send('update-password-last-used-request', id);
            const handleResponse = (event, result) => {
                ipcRenderer.removeListener('update-password-last-used-response', handleResponse);
                resolve(result || { success: false, message: 'Ошибка обновления времени использования' });
            };
            ipcRenderer.on('update-password-last-used-response', handleResponse);
            setTimeout(() => {
                ipcRenderer.removeListener('update-password-last-used-response', handleResponse);
                resolve({ success: false, message: 'Таймаут обновления времени использования' });
            }, 5000);
        });
    },

    exportPasswords: () => {
        console.log('exportPasswords вызван из Settings');
        return new Promise((resolve) => {
            ipcRenderer.send('export-passwords-request');
            const handleResponse = (event, result) => {
                ipcRenderer.removeListener('export-passwords-response', handleResponse);
                resolve(result || { success: false, message: 'Ошибка экспорта паролей' });
            };
            ipcRenderer.on('export-passwords-response', handleResponse);
            setTimeout(() => {
                ipcRenderer.removeListener('export-passwords-response', handleResponse);
                resolve({ success: false, message: 'Таймаут экспорта паролей' });
            }, 5000);
        });
    },

    importPasswords: () => {
        console.log('importPasswords вызван из Settings');
        return new Promise((resolve) => {
            ipcRenderer.send('import-passwords-request');
            const handleResponse = (event, result) => {
                ipcRenderer.removeListener('import-passwords-response', handleResponse);
                resolve(result || { success: false, message: 'Ошибка импорта паролей' });
            };
            ipcRenderer.on('import-passwords-response', handleResponse);
            setTimeout(() => {
                ipcRenderer.removeListener('import-passwords-response', handleResponse);
                resolve({ success: false, message: 'Таймаут импорта паролей' });
            }, 5000);
        });
    },

    clearAllPasswords: () => {
        console.log('clearAllPasswords вызван из Settings');
        return new Promise((resolve) => {
            ipcRenderer.send('clear-all-passwords-request');
            const handleResponse = (event, result) => {
                ipcRenderer.removeListener('clear-all-passwords-response', handleResponse);
                resolve(result || { success: false, message: 'Ошибка очистки паролей' });
            };
            ipcRenderer.on('clear-all-passwords-response', handleResponse);
            setTimeout(() => {
                ipcRenderer.removeListener('clear-all-passwords-response', handleResponse);
                resolve({ success: false, message: 'Таймаут очистки паролей' });
            }, 5000);
        });
    },

    // =============== СИНХРОННЫЕ МЕТОДЫ ===============
    sendToHost: (channel, data) => {
        ipcRenderer.send(channel, data);
    },

    // =============== СОБЫТИЯ ===============
    onHistoryUpdated: (callback) => {
        console.log('onHistoryUpdated listener установлен');
        const handler = () => callback();
        ipcRenderer.on('history-updated', handler);
        return () => ipcRenderer.removeListener('history-updated', handler);
    },

    onDownloadsUpdated: (callback) => {
        console.log('onDownloadsUpdated listener установлен');
        const handler = () => callback();
        ipcRenderer.on('downloads-updated', handler);
        return () => ipcRenderer.removeListener('downloads-updated', handler);
    },

    onThemeUpdated: (callback) => {
        console.log('onThemeUpdated listener установлен');
        const handler = (event, theme) => callback(theme);
        ipcRenderer.on('theme-updated', handler);
        return () => ipcRenderer.removeListener('theme-updated', handler);
    },

    onRestartRequired: (callback) => {
        console.log('onRestartRequired listener установлен');
        const handler = (event, data) => callback(data);
        ipcRenderer.on('restart-required', handler);
        return () => ipcRenderer.removeListener('restart-required', handler);
    },

    onPasswordsUpdated: (callback) => {
        console.log('onPasswordsUpdated listener установлен');
        const handler = () => callback();
        ipcRenderer.on('passwords-updated', handler);
        return () => ipcRenderer.removeListener('passwords-updated', handler);
    },

    onPluginsUpdated: (callback) => {
        console.log('onPluginsUpdated listener установлен');
        const handler = () => callback();
        ipcRenderer.on('plugins-updated', handler);
        return () => ipcRenderer.removeListener('plugins-updated', handler);
    }
});

console.log('✅ electronAPI доступен в Settings.html');

window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        ipcRenderer.send('settings-loaded');
        console.log('✅ Settings.html DOM полностью загружен');
        window.postMessage({ type: 'preload-ready', message: 'Preload загружен' }, '*');
    }, 100);
});

ipcRenderer.on('show-toast', (event, message) => {
    console.log('Показать toast:', message);
    window.postMessage({
        type: 'show-toast',
        message: message.text || message,
        duration: message.duration || 3000
    }, '*');
});

ipcRenderer.on('update-passwords', (event) => {
    console.log('Обновление списка паролей');
    window.postMessage({ type: 'update-passwords' }, '*');
});
