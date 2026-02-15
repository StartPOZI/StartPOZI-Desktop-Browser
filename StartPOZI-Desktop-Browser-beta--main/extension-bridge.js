// extension-simple.js - Простой мост для расширений
const { ipcRenderer } = require('electron');

class ExtensionManager {
    constructor() {
        this.extensions = new Map();
        this.init();
    }

    init() {
        console.log('Extension Manager initialized');

        // Загружаем расширения при инициализации
        this.loadExtensions();

        // Регистрируем глобальные обработчики
        window.addEventListener('DOMContentLoaded', () => {
            this.injectExtensionIcons();
        });
    }

    async loadExtensions() {
        try {
            if (window.electronAPI && window.electronAPI.getPlugins) {
                const plugins = await window.electronAPI.getPlugins();

                plugins.forEach(plugin => {
                    this.registerExtension(plugin.id, plugin.manifest, {
                        enabled: plugin.enabled,
                        hasPopup: plugin.hasPopup,
                        path: plugin.path
                    });
                });

                console.log(`Loaded ${plugins.length} extensions`);
            }
        } catch (error) {
            console.error('Error loading extensions:', error);
        }
    }

    registerExtension(extensionId, manifest, options = {}) {
        const extension = {
            id: extensionId,
            manifest,
            enabled: options.enabled !== false,
            hasPopup: options.hasPopup || false,
            path: options.path || ''
        };

        this.extensions.set(extensionId, extension);
        console.log(`Extension registered: ${manifest.name} (${extensionId})`);

        return extension;
    }

    async openExtensionPopup(extensionId) {
        const extension = this.extensions.get(extensionId);
        if (!extension || !extension.enabled || !extension.hasPopup) {
            return { success: false, message: 'Extension not available' };
        }

        if (window.electronAPI && window.electronAPI.openPluginPopup) {
            return await window.electronAPI.openPluginPopup(extensionId);
        }

        return { success: false, message: 'API not available' };
    }

    injectExtensionIcons() {
        // Эта функция теперь в webview-preload.js
        console.log('Extension icons injection handled by webview-preload.js');
    }

    getExtensions() {
        return Array.from(this.extensions.values()).map(ext => ({
            id: ext.id,
            name: ext.manifest.name,
            enabled: ext.enabled,
            hasPopup: ext.hasPopup
        }));
    }
}

// Создаем глобальный экземпляр
const extensionManager = new ExtensionManager();

// Экспортируем для использования
if (typeof module !== 'undefined') {
    module.exports = extensionManager;
}

// Делаем доступным глобально
window.__extensionManager = extensionManager;
