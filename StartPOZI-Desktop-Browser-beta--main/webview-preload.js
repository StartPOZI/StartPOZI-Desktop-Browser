// webview-preload.js — ФИНАЛЬНАЯ РАБОЧАЯ ВЕРСИЯ ДЕКАБРЬ 2025 (с IPC для Settings)
const { contextBridge, ipcRenderer } = require('electron');

// === Красивые модальные диалоги (alert, confirm, prompt) ===
(function () {
    const createDialog = ({ title = 'Сообщение', message = '', defaultValue = '', type = 'alert' }) => {
        return new Promise(resolve => {
            const isPrompt = type === 'prompt';
            const isConfirm = type === 'confirm';

            const overlay = document.createElement('div');
            overlay.style.cssText = `
            position:fixed; inset:0; background:rgba(0,0,0,0.8);
            backdrop-filter:blur(12px); display:flex; align-items:center;
            justify-content:center; z-index:999999;
            font-family:-apple-system,system-ui,sans-serif;
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
            ${isConfirm || isPrompt ?
                `<button id="dialog-cancel" style="padding:10px 20px; background:#404040; color:#ccc;
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
                        if (e.key === 'Enter' && !e.shiftKey && isPrompt) {
                            e.preventDefault();
                            close(input?.value.trim() || null);
                        }
                        if (e.key === 'Enter' && !e.shiftKey && !isPrompt) {
                            e.preventDefault();
                            close(true);
                        }
                    }, { once: true });

                    (input || okBtn).focus();
                    if (input) input.select();
        });
    };

    window.alert = (msg) => createDialog({ title: 'Сообщение', message: msg });
    window.confirm = (msg) => createDialog({ title: 'Подтверждение', message: msg, type: 'confirm' });
    window.prompt = (msg, def = '') => createDialog({ title: 'Ввод данных', message: msg, defaultValue: def, type: 'prompt' });
})();

// === Открытие ссылок в НОВОЙ ВКЛАДКЕ браузера ===
const openInNewTab = (url) => {
    if (!url) return;
    if (/^(javascript|about|mailto|tel|data):/.test(url)) return;
    ipcRenderer.send('OPEN_URL', url);
};

// Средняя кнопка
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

// window.open()
const originalWindowOpen = window.open;
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

// === Безопасный API для внутренних страниц (Settings.html и др.) ===
contextBridge.exposeInMainWorld('electronAPI', {
    // Открытие ссылки в новой вкладке
    openUrl: (url) => openInNewTab(url),

                                // === ПОИСКОВИК ===
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

                                // === ИСТОРИЯ ===
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

                                // Открытие URL из настроек (например, клик по элементу истории)
                                openUrlFromSettings: (url) => {
                                    ipcRenderer.sendToHost('open-url-from-settings', url);
                                }
});
