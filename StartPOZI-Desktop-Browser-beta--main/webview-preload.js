// webview-preload.js — Полный рабочий код (декабрь 2025)
// Поддержка красивых диалогов alert/confirm/prompt на ЛЮБЫХ сайтах внутри <webview>
// contextIsolation: true → используем contextBridge + инъекцию скрипта

const { contextBridge, ipcRenderer } = require('electron');

// === Красивые модальные диалоги (тот же дизайн, что и в preload.js) ===
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

// Экспонируем кастомные диалоги через contextBridge
contextBridge.exposeInMainWorld('customDialogs', {
    alert: (msg) => createDialog({ title: 'Сообщение', message: msg }),
                                confirm: (msg) => createDialog({ title: 'Подтверждение', message: msg, type: 'confirm' }),
                                prompt: (msg, def = '') => createDialog({ title: 'Ввод данных', message: msg, defaultValue: def, type: 'prompt' })
});

// === Инъекция скрипта: заменяем стандартные alert/confirm/prompt на наши красивые ===
// Работает на любом внешнем сайте внутри <webview>
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

// === Открытие ссылок в новой вкладке (вместо popup) ===
const openInNewTab = (url) => {
    if (!url) return;
    if (/^(javascript|about|mailto|tel|data):/.test(url)) return;
    ipcRenderer.send('OPEN_URL', url);
};

// Средняя кнопка мыши
document.addEventListener('auxclick', e => {
    if (e.button === 1) { // средняя кнопка
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
                                }
});

// === ДОБАВЛЕНИЕ: Полная блокировка WebRTC (чтобы тест не висел бесконечно) ===
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
