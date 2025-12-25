// webview-preload.js — с API для управления настройками плагинов
const { contextBridge, ipcRenderer } = require('electron');

// === Красивые модальные диалоги ===
const createDialog = ({ title = 'Сообщение', message = '', defaultValue = '', type = 'alert' }) => {
    return new Promise(resolve => {
        const isPrompt = type === 'prompt';
        const isConfirm = type === 'confirm';

        const overlay = document.createElement('div');
        overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.8);
        backdrop-filter: blur(12px); display: flex; align-items: center;
        justify-content: center; z-index: 999999;
        font-family: -apple-system, system-ui, sans-serif;
        `;

        overlay.innerHTML = `
        <div style="background:#1e1e1e; border-radius:16px; width:460px; max-width:92vw;
        box-shadow:0 20px 60px rgba(0,0,0,0.8); padding:24px 32px;">
        <h3 style="margin:0 0 12px; color:white; font-size:18px; font-weight:600;">${title}</h3>
        <p style="margin:0 0 20px; color:#ccc; font-size:15px; line-height:1.5;">${message}</p>
        ${isPrompt ? `<input id="dialog-input" type="text" value="${defaultValue}"
        style="width:100%; padding:12px; background:#2d2d2d; border:1px solid #444;
        border-radius:12px; color:white; font-size:15px;">` : ''}
        <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:20px;">
        ${isConfirm || isPrompt ? `
            <button id="dialog-cancel" style="padding:10px 20px; background:#404040; color:#ccc;
            border:none; border-radius:12px; font-size:14px;">Отмена</button>` : ''}
            <button id="dialog-ok" style="padding:10px 20px; background:#0a84ff; color:white;
            border:none; border-radius:12px; font-size:14px;">ОК</button>
            </div>
            </div>
            `;

            document.body.appendChild(overlay);

            const input = overlay.querySelector('#dialog-input');
            const cancelBtn = overlay.querySelector('#dialog-cancel');
            const okBtn = overlay.querySelector('#dialog-ok');

            const close = (value) => {
                overlay.remove();
                resolve(value);
            };

            cancelBtn?.addEventListener('click', () => close(false));
            okBtn.addEventListener('click', () => {
                if (isPrompt) {
                    close(input?.value.trim() || null);
                } else {
                    close(true);
                }
            });

            overlay.addEventListener('click', e => {
                if (e.target === overlay) close(false);
            });

                document.addEventListener('keydown', e => {
                    if (e.key === 'Escape') close(false);
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (isPrompt) close(input?.value.trim() || null);
                        else close(true);
                    }
                }, { once: true });

                (input || okBtn).focus();
                if (input) input.select();
    });
};

// Экспонируем кастомные диалоги
contextBridge.exposeInMainWorld('customDialogs', {
    alert: (msg) => createDialog({ title: 'Сообщение', message: msg }),
                                confirm: (msg) => createDialog({ title: 'Подтверждение', message: msg, type: 'confirm' }),
                                prompt: (msg, def = '') => createDialog({ title: 'Ввод данных', message: msg, defaultValue: def, type: 'prompt' })
});

// === Инъекция скрипта ===
window.addEventListener('DOMContentLoaded', () => {
    const script = document.createElement('script');
    script.textContent = `
    (function() {
        if (window.customDialogs) {
            window.alert   = window.customDialogs.alert;
            window.confirm = window.customDialogs.confirm;
            window.prompt  = window.customDialogs.prompt;
        }
    })();
    `;
    (document.head || document.documentElement).appendChild(script);
});

// === Открытие ссылок в новой вкладке ===
const openInNewTab = (url) => {
    if (!url) return;
    if (/^(javascript|about|mailto|tel|data):/.test(url)) return;
    ipcRenderer.send('OPEN_URL', url);
};

// Средняя кнопка мыши
document.addEventListener('auxclick', e => {
    if (e.button === 1) {
        const link = e.target.closest('a[href]');
        if (link?.href) {
            e.preventDefault();
            openInNewTab(link.href);
        }
    }
}, true);

// Ctrl/Cmd + клик
document.addEventListener('click', e => {
    if (e.ctrlKey || e.metaKey) {
        const link = e.target.closest('a[href]');
        if (link?.href) {
            e.preventDefault();
            openInNewTab(link.href);
        }
    }
}, true);

// target="_blank"
document.addEventListener('click', e => {
    const link = e.target.closest('a[target="_blank"]');
    if (link?.href) {
        e.preventDefault();
        openInNewTab(link.href);
    }
}, true);

// Перехват window.open
const originalOpen = window.open;
window.open = (url, target = '_blank', features) => {
    if (url) openInNewTab(url);
    return {
        closed: false,
        close: () => {},
        focus: () => {},
        blur: () => {},
        opener: window,
        location: { href: url || '' }
    };
};

// === API для внутренних страниц (Settings.html и т.д.) ===
contextBridge.exposeInMainWorld('electronAPI', {
    openUrl: (url) => openInNewTab(url),

                                // Путь загрузок
                                getCurrentDownloadPath: () => {
                                    return new Promise(resolve => {
                                        ipcRenderer.sendToHost('get-current-download-path');
                                        ipcRenderer.once('current-download-path-data', (_, path) => resolve(path));
                                    });
                                },

                                setDownloadPath: () => {
                                    return new Promise(resolve => {
                                        ipcRenderer.sendToHost('set-download-path');
                                        ipcRenderer.once('download-path-updated', (_, newPath) => resolve(newPath));
                                    });
                                },

                                // Поисковая система
                                getSearchEngine: () => {
                                    return new Promise(resolve => {
                                        const responseChannel = `search-engine-response-${Date.now()}`;
                                        ipcRenderer.once(responseChannel, (_, url) => resolve(url));
                                        ipcRenderer.sendToHost('get-search-engine', responseChannel);
                                    });
                                },

                                setSearchEngine: (url) => {
                                    ipcRenderer.sendToHost('set-search-engine', url);
                                },

                                // saveTabs
                                getSaveTabs: () => {
                                    return new Promise(resolve => {
                                        const responseChannel = `save-tabs-response-${Date.now()}`;
                                        ipcRenderer.once(responseChannel, (_, val) => resolve(val));
                                        ipcRenderer.sendToHost('get-save-tabs', responseChannel);
                                    });
                                },

                                setSaveTabs: (isEnabled) => {
                                    ipcRenderer.sendToHost('set-save-tabs', isEnabled);
                                },

                                // saveInternalPages
                                getSaveInternalPages: () => {
                                    return new Promise(resolve => {
                                        const responseChannel = `save-internal-pages-response-${Date.now()}`;
                                        ipcRenderer.once(responseChannel, (_, val) => resolve(val));
                                        ipcRenderer.sendToHost('get-save-internal-pages', responseChannel);
                                    });
                                },

                                setSaveInternalPages: (isEnabled) => {
                                    ipcRenderer.sendToHost('set-save-internal-pages', isEnabled);
                                },

                                // История
                                getHistory: () => {
                                    return new Promise(resolve => {
                                        ipcRenderer.sendToHost('get-history');
                                        ipcRenderer.once('history-data', (_, history) => resolve(history));
                                    });
                                },

                                clearHistory: () => {
                                    ipcRenderer.sendToHost('clear-history');
                                },

                                onHistoryUpdated: (callback) => {
                                    ipcRenderer.on('history-updated', () => callback());
                                },

                                // Загрузки
                                getDownloads: () => {
                                    return new Promise(resolve => {
                                        ipcRenderer.sendToHost('get-downloads');
                                        ipcRenderer.once('downloads-data', (_, downloads) => resolve(downloads));
                                    });
                                },

                                clearDownloads: () => {
                                    ipcRenderer.sendToHost('clear-downloads');
                                },

                                onDownloadsUpdated: (callback) => {
                                    ipcRenderer.on('downloads-updated', () => callback());
                                },

                                // Открытие URL из настроек
                                openUrlFromSettings: (url) => {
                                    ipcRenderer.sendToHost('open-url-from-settings', url);
                                },

                                // Тема
                                getTheme: () => {
                                    return new Promise(resolve => {
                                        const responseChannel = `theme-response-${Date.now()}`;
                                        ipcRenderer.once(responseChannel, (_, val) => resolve(val));
                                        ipcRenderer.sendToHost('get-theme', responseChannel);
                                    });
                                },

                                setTheme: (val) => {
                                    ipcRenderer.sendToHost('set-theme', val);
                                },

                                onThemeUpdated: (callback) => {
                                    ipcRenderer.on('theme-updated', (_, theme) => callback(theme));
                                },

                                // =============== API для плагинов ===============
                                getPlugins: () => {
                                    return new Promise(resolve => {
                                        ipcRenderer.invoke('get-plugins').then(plugins => {
                                            resolve(plugins);
                                        }).catch(error => {
                                            console.error('Ошибка получения плагинов:', error);
                                            resolve([]);
                                        });
                                    });
                                },

                                addPlugin: () => {
                                    return new Promise(resolve => {
                                        ipcRenderer.invoke('add-plugin').then(result => {
                                            resolve(result);
                                        }).catch(error => {
                                            console.error('Ошибка добавления плагина:', error);
                                            resolve({ success: false, message: error.message });
                                        });
                                    });
                                },

                                togglePlugin: (pluginId, enabled) => {
                                    return new Promise(resolve => {
                                        ipcRenderer.invoke('toggle-plugin', pluginId, enabled).then(result => {
                                            resolve(result);
                                        }).catch(error => {
                                            console.error('Ошибка переключения плагина:', error);
                                            resolve({ success: false, message: error.message });
                                        });
                                    });
                                },

                                removePlugin: (pluginId) => {
                                    return new Promise(resolve => {
                                        ipcRenderer.invoke('remove-plugin', pluginId).then(result => {
                                            resolve(result);
                                        }).catch(error => {
                                            console.error('Ошибка удаления плагина:', error);
                                            resolve({ success: false, message: error.message });
                                        });
                                    });
                                },

                                openPluginsFolder: () => {
                                    return new Promise(resolve => {
                                        ipcRenderer.invoke('open-plugins-folder').then(result => {
                                            resolve(result);
                                        }).catch(error => {
                                            console.error('Ошибка открытия папки плагинов:', error);
                                            resolve({ success: false, message: error.message });
                                        });
                                    });
                                },

                                // Настройки плагинов
                                openPluginSettings: (pluginId) => {
                                    return new Promise(resolve => {
                                        ipcRenderer.invoke('open-plugin-settings', pluginId).then(result => {
                                            resolve(result);
                                        }).catch(error => {
                                            console.error('Ошибка открытия настроек плагина:', error);
                                            resolve({ success: false, message: error.message });
                                        });
                                    });
                                },

                                getPluginSettings: (pluginId) => {
                                    return new Promise(resolve => {
                                        ipcRenderer.invoke('get-plugin-settings', pluginId).then(result => {
                                            resolve(result);
                                        }).catch(error => {
                                            console.error('Ошибка получения настроек плагина:', error);
                                            resolve({ success: false, message: error.message });
                                        });
                                    });
                                },

                                savePluginSettings: (pluginId, settings) => {
                                    return new Promise(resolve => {
                                        ipcRenderer.invoke('save-plugin-settings', pluginId, settings).then(result => {
                                            resolve(result);
                                        }).catch(error => {
                                            console.error('Ошибка сохранения настроек плагина:', error);
                                            resolve({ success: false, message: error.message });
                                        });
                                    });
                                },

                                onPluginSettingsUpdated: (callback) => {
                                    ipcRenderer.on('plugin-settings-updated', (_, data) => callback(data));
                                },

                                // ОТКРЫТЬ МЕНЮ РАСШИРЕНИЯ (POPUP)
                                openPluginPopup: (pluginId) => {
                                    return new Promise(resolve => {
                                        ipcRenderer.invoke('open-plugin-popup', pluginId).then(result => {
                                            resolve(result);
                                        }).catch(error => {
                                            console.error('Ошибка открытия меню расширения:', error);
                                            resolve({ success: false, message: error.message });
                                        });
                                    });
                                },

                                // ОТПРАВИТЬ СООБЩЕНИЕ В РОДИТЕЛЬСКОЕ ОКНО (renderer.js)
                                sendToHost: (channel, data) => {
                                    ipcRenderer.sendToHost(channel, data);
                                },

                                // ПОЛУЧИТЬ ИНФОРМАЦИЮ О ТЕКУЩЕЙ СТРАНИЦЕ
                                getCurrentPageInfo: () => {
                                    return {
                                        url: window.location.href,
                                        title: document.title,
                                        referrer: document.referrer
                                    };
                                },

                                // ПЕРЕЗАГРУЗИТЬ СТРАНИЦУ
                                reloadPage: () => {
                                    window.location.reload();
                                }
});

// === ДОБАВЛЕНИЕ: Полная блокировка WebRTC ===
window.addEventListener('DOMContentLoaded', () => {
    // Удаляем RTCPeerConnection полностью
    if (window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection) {
        delete window.RTCPeerConnection;
        delete window.webkitRTCPeerConnection;
        delete window.mozRTCPeerConnection;
    }

    // Блокируем mediaDevices
    if (navigator.mediaDevices) {
        Object.defineProperty(navigator, 'mediaDevices', {
            value: undefined,
            writable: false
        });
    }

    // Переопределяем getUserMedia на всех префиксах
    const blockGetUserMedia = () => {
        throw new Error('WebRTC is disabled for privacy');
    };

    if (navigator.getUserMedia) navigator.getUserMedia = blockGetUserMedia;
    if (navigator.webkitGetUserMedia) navigator.webkitGetUserMedia = blockGetUserMedia;
    if (navigator.mozGetUserMedia) navigator.mozGetUserMedia = blockGetUserMedia;
});

// === ДОБАВЛЕНИЕ: Поддержка расширений в webview ===
window.addEventListener('DOMContentLoaded', () => {
    // Создаем контейнер для иконок расширений
    const extensionIconsContainer = document.createElement('div');
    extensionIconsContainer.id = 'extension-icons-container';
    extensionIconsContainer.style.cssText = `
    position: fixed;
    top: 100px;
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 300px;
    overflow-y: auto;
    `;

    document.body.appendChild(extensionIconsContainer);

    // Функция для добавления иконки расширения
    function addExtensionIcon(pluginId, iconUrl, pluginName, hasPopup) {
        const icon = document.createElement('div');
        icon.className = 'extension-icon';
        icon.dataset.id = pluginId;
        icon.title = pluginName;
        icon.style.cssText = `
        width: 32px;
        height: 32px;
        background-image: url('${iconUrl}');
        background-size: contain;
        background-repeat: no-repeat;
        background-position: center;
        border-radius: 6px;
        cursor: pointer;
        border: 1px solid rgba(255,255,255,0.1);
        transition: all 0.2s;
        `;

        icon.onmouseover = () => {
            icon.style.transform = 'scale(1.1)';
            icon.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        };

        icon.onmouseout = () => {
            icon.style.transform = 'scale(1)';
            icon.style.boxShadow = 'none';
        };

        icon.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (hasPopup) {
                try {
                    const result = await window.electronAPI.openPluginPopup(pluginId);
                    if (result.success) {
                        // Отправляем данные в родительское окно для отображения popup
                        window.electronAPI.sendToHost('show-extension-popup', result);
                    }
                } catch (error) {
                    console.error('Ошибка открытия меню расширения:', error);
                }
            }
        };

        extensionIconsContainer.appendChild(icon);
    }

    // Загружаем расширения и добавляем их иконки
    setTimeout(async () => {
        try {
            if (window.electronAPI && window.electronAPI.getPlugins) {
                const plugins = await window.electronAPI.getPlugins();

                plugins.forEach(plugin => {
                    if (plugin.enabled) {
                        // Ищем иконку расширения
                        let iconUrl = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="%230a84ff" stroke-width="2"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>';

                        // Проверяем наличие иконки в манифесте
                        if (plugin.manifest) {
                            if (plugin.manifest.browser_action && plugin.manifest.browser_action.default_icon) {
                                const iconPath = typeof plugin.manifest.browser_action.default_icon === 'string'
                                ? plugin.manifest.browser_action.default_icon
                                : plugin.manifest.browser_action.default_icon['32'] ||
                                plugin.manifest.browser_action.default_icon['16'] ||
                                Object.values(plugin.manifest.browser_action.default_icon)[0];

                                if (iconPath) {
                                    const fullPath = plugin.path + '/' + iconPath;
                                    iconUrl = `file://${fullPath.replace(/\\/g, '/')}`;
                                }
                            } else if (plugin.manifest.icons) {
                                const iconPath = plugin.manifest.icons['32'] ||
                                plugin.manifest.icons['16'] ||
                                Object.values(plugin.manifest.icons)[0];

                                if (iconPath) {
                                    const fullPath = plugin.path + '/' + iconPath;
                                    iconUrl = `file://${fullPath.replace(/\\/g, '/')}`;
                                }
                            }
                        }

                        // Добавляем иконку в интерфейс
                        addExtensionIcon(plugin.id, iconUrl, plugin.name, plugin.hasPopup);
                    }
                });
            }
        } catch (error) {
            console.error('Ошибка загрузки расширений:', error);
        }
    }, 1000);
});

// === ДОБАВЛЕНИЕ: CSS для иконок расширений ===
const style = document.createElement('style');
style.textContent = `
.extension-icon {
    position: relative;
}

.extension-icon.has-popup::after {
    content: '▶';
    position: absolute;
    bottom: -2px;
    right: -2px;
    background: #9c27b0;
    color: white;
    font-size: 8px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
}

.extension-icon:hover::before {
    content: attr(title);
    position: absolute;
    top: -30px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.8);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
    z-index: 10000;
}
`;
document.head.appendChild(style);
