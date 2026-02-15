// popup-preload.js - UPDATED VERSION FOR EXTENSION POPUPS

const { ipcRenderer, contextBridge } = require('electron');

console.log('🧩 Popup preload loaded for extension');

// Функция для генерации уникального ID запроса
const generateRequestId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Получаем extensionId
function getExtensionId() {
    try {
        // 1. Из URL параметров
        const url = new URL(window.location.href);
        const params = new URLSearchParams(url.search);
        const extensionId = params.get('extensionId');

        // 2. Из глобальных переменных
        if (!extensionId && window.__EXTENSION_ID__) {
            return window.__EXTENSION_ID__;
        }

        // 3. Из process.argv
        if (!extensionId && process.argv) {
            const arg = process.argv.find(arg => arg.includes('--extension-id='));
            if (arg) {
                return arg.split('=')[1];
            }
        }

        return extensionId || 'unknown-extension';
    } catch (e) {
        console.error('Error getting extensionId:', e);
        return 'unknown-extension';
    }
}

const extensionId = getExtensionId();
console.log('🆔 Extension ID for popup:', extensionId);

// API для взаимодействия с основным процессом
const electronPopupAPI = {
    close: () => {
        console.log('🔒 Closing popup via API');
        ipcRenderer.send('popup:close');
    },

    minimize: () => {
        console.log('📥 Minimizing popup via API');
        ipcRenderer.send('popup:minimize');
    },

    maximize: () => {
        console.log('🔲 Maximizing popup via API');
        ipcRenderer.send('popup:maximize');
    },

    resize: (width, height) => {
        console.log(`📐 Requesting resize to ${width}x${height}`);
        ipcRenderer.send('popup:resize', { width, height });
    },

    sendMessage: (message) => {
        console.log('📤 Sending message:', message);
        ipcRenderer.send('extension:message', message);
    },

    onMessage: (callback) => {
        ipcRenderer.on('extension:response', (event, data) => {
            console.log('📥 Received message:', data);
            callback(data);
        });
    },

    getExtensionInfo: () => {
        return {
            id: extensionId,
            manifest: window.__EXTENSION_MANIFEST__ || {}
        };
    },

    // Для расширений: открыть вкладку
    createTab: (url) => {
        console.log('➕ Creating tab:', url);
        ipcRenderer.send('OPEN_URL', url);
    },

    // ========== ХРАНИЛИЩЕ РАСШИРЕНИЙ ДЛЯ POPUP ==========
    storage: {
        // Получить данные из хранилища
        get: (keys, namespace = 'local') => {
            const requestId = generateRequestId();
            return new Promise((resolve, reject) => {
                ipcRenderer.send('extension-storage-get', {
                    extensionId,
                    keys,
                    namespace,
                    requestId
                });

                const timeout = setTimeout(() => {
                    ipcRenderer.removeAllListeners(`extension-storage-result-${requestId}`);
                    reject(new Error('Timeout'));
                }, 5000);

                ipcRenderer.once(`extension-storage-result-${requestId}`, (event, data) => {
                    clearTimeout(timeout);
                    if (data.success) {
                        resolve(data.result);
                    } else {
                        reject(new Error(data.error || 'Unknown error'));
                    }
                });
            });
        },

        // Сохранить данные в хранилище
        set: (items, namespace = 'local') => {
            const requestId = generateRequestId();
            return new Promise((resolve, reject) => {
                ipcRenderer.send('extension-storage-set', {
                    extensionId,
                    items,
                    namespace,
                    requestId
                });

                const timeout = setTimeout(() => {
                    ipcRenderer.removeAllListeners(`extension-storage-saved-${requestId}`);
                    reject(new Error('Timeout'));
                }, 5000);

                ipcRenderer.once(`extension-storage-saved-${requestId}`, (event, data) => {
                    clearTimeout(timeout);
                    if (data.success) {
                        resolve();
                    } else {
                        reject(new Error(data.error || 'Unknown error'));
                    }
                });
            });
        },

        // Удалить данные из хранилища
        remove: (keys, namespace = 'local') => {
            const requestId = generateRequestId();
            return new Promise((resolve, reject) => {
                ipcRenderer.send('extension-storage-remove', {
                    extensionId,
                    keys,
                    namespace,
                    requestId
                });

                ipcRenderer.once(`extension-storage-removed-${requestId}`, (event, data) => {
                    if (data.success) {
                        resolve();
                    } else {
                        reject(new Error(data.error || 'Unknown error'));
                    }
                });
            });
        },

        // Очистить все данные в namespace
        clear: (namespace = 'local') => {
            const requestId = generateRequestId();
            return new Promise((resolve, reject) => {
                ipcRenderer.send('extension-storage-clear', {
                    extensionId,
                    namespace,
                    requestId
                });

                ipcRenderer.once(`extension-storage-cleared-${requestId}`, (event, data) => {
                    if (data.success) {
                        resolve();
                    } else {
                        reject(new Error(data.error || 'Unknown error'));
                    }
                });
            });
        },

        // Подписаться на изменения в хранилище
        onChanged: (callback) => {
            const handler = (event, data) => {
                // Проверяем, что изменение относится к нашему расширению
                if (data.extensionId === extensionId) {
                    callback(data);
                }
            };
            ipcRenderer.on('extension-storage-changed', handler);
            return () => ipcRenderer.removeListener('extension-storage-changed', handler);
        }
    }
};

// Экспортируем API через contextBridge
try {
    contextBridge.exposeInMainWorld('electronPopupAPI', electronPopupAPI);
    console.log('✅ electronPopupAPI экспортирован через contextBridge');

    // Для совместимости с Chrome API
    contextBridge.exposeInMainWorld('chrome', {
        storage: {
            local: {
                get: (keys, callback) => {
                    electronPopupAPI.storage.get(keys, 'local')
                    .then(result => callback?.(result))
                    .catch(error => {
                        console.error('Chrome storage.get error:', error);
                        callback?.({});
                    });
                },
                set: (items, callback) => {
                    electronPopupAPI.storage.set(items, 'local')
                    .then(() => callback?.())
                    .catch(error => {
                        console.error('Chrome storage.set error:', error);
                        callback?.();
                    });
                },
                remove: (keys, callback) => {
                    electronPopupAPI.storage.remove(keys, 'local')
                    .then(() => callback?.())
                    .catch(error => {
                        console.error('Chrome storage.remove error:', error);
                        callback?.();
                    });
                },
                clear: (callback) => {
                    electronPopupAPI.storage.clear('local')
                    .then(() => callback?.())
                    .catch(error => {
                        console.error('Chrome storage.clear error:', error);
                        callback?.();
                    });
                }
            },
            sync: {
                get: (keys, callback) => {
                    electronPopupAPI.storage.get(keys, 'sync')
                    .then(result => callback?.(result))
                    .catch(error => {
                        console.error('Chrome storage.sync.get error:', error);
                        callback?.({});
                    });
                },
                set: (items, callback) => {
                    electronPopupAPI.storage.set(items, 'sync')
                    .then(() => callback?.())
                    .catch(error => {
                        console.error('Chrome storage.sync.set error:', error);
                        callback?.();
                    });
                }
            }
        },
        runtime: {
            sendMessage: (message, callback) => {
                electronPopupAPI.sendMessage(message);
                callback?.();
            }
        }
    });
    console.log('✅ Chrome API экспортирован для совместимости');
} catch (error) {
    console.error('Ошибка при экспорте API:', error);
    window.electronPopupAPI = electronPopupAPI;
    window.chrome = {
        storage: {
            local: {
                get: (keys, callback) => callback?.({}),
                set: (items, callback) => callback?.(),
                remove: (keys, callback) => callback?.(),
                clear: (callback) => callback?.()
            }
        }
    };
}

// Инициализация при загрузке DOM
window.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOMContentLoaded in popup');
    console.log('🔧 Extension data:', window.__EXTENSION_MANIFEST__);

    // Для extension popup добавляем специальные стили
    const isExtensionPopup = !!extensionId && extensionId !== 'unknown-extension';
    if (isExtensionPopup) {
        const extensionStyles = document.createElement('style');
        extensionStyles.textContent = `
        /* Стили для контента popup */
        body {
            margin: 0;
            padding: 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            background: #0f0f17;
            color: #e0e0e0;
            min-height: 100vh;
            box-sizing: border-box;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        }

        ::-webkit-scrollbar {
            width: 8px;
            height: 8px;
        }

        ::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb {
            background: rgba(10, 132, 255, 0.6);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: rgba(10, 132, 255, 0.8);
        }

        button, input, select, textarea {
            font-family: inherit;
        }
        `;
        document.head.appendChild(extensionStyles);

        // Автоматическое определение размеров для extension popup
        const updateSize = () => {
            const contentHeight = Math.max(
                100,
                document.documentElement.scrollHeight || document.body.scrollHeight
            );
            const contentWidth = Math.max(
                200,
                document.documentElement.scrollWidth || document.body.scrollWidth
            );

            const height = Math.min(800, contentHeight + 72); // + padding + titlebar
            const width = Math.min(800, contentWidth + 32);

            console.log(`📏 Extension popup size: ${width}x${height}`);

            if (window.electronPopupAPI) {
                setTimeout(() => {
                    window.electronPopupAPI.resize(width, height);
                }, 100);
            }
        };

        updateSize();

        // Наблюдатель за изменениями DOM
        const observer = new MutationObserver(() => {
            updateSize();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true
        });

        // Обновляем при загрузке изображений
        document.addEventListener('load', (e) => {
            if (e.target.tagName === 'IMG') {
                setTimeout(updateSize, 200);
            }
        }, true);
    }
});

// Обработка window.close()
window.close = function() {
    console.log('🪟 Window.close() called');
    if (window.electronPopupAPI) {
        window.electronPopupAPI.close();
    }
};

// Обработка клавиши Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        console.log('🔑 Escape key pressed');
        if (window.electronPopupAPI) {
            window.electronPopupAPI.close();
        }
    }
});

// Уведомление о полной загрузке
window.addEventListener('load', () => {
    console.log('🚀 Popup fully loaded');

    // Добавляем анимацию появления
    document.body.style.opacity = '0';
    document.body.style.transition = 'opacity 0.3s ease';

    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);
});
