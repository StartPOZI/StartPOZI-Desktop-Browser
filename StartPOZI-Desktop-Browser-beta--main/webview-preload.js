// webview-preload.js — РАБОЧАЯ ВЕРСИЯ 2025 (всё работает: средняя кнопка, Ctrl+клик, target="_blank")
const { ipcRenderer } = require('electron');

(() => {
    // Переопределяем alert/confirm/prompt — красиво и без ошибок
    const showDialog = ({ title = 'Сообщение, message, defaultValue = , showInput = false }) => {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;z-index:999999;';
        overlay.innerHTML = `
        <div style="background:#1e1e1e;border-radius:16px;width:460px;max-width:92vw;box-shadow:0 20px 60px #000;padding:24px 32px;">
        <h3 style="margin:0 0 12px;color:white;font-size:18px;">${title}</h3>
        <p style="margin:0 0 20px;color:#ccc;">${message}</p>
        ${showInput ? `<input id="inp" value="${defaultValue}" style="width:100%;padding:12px;background:#2d2d2d;border:1px solid #444;border-radius:12px;color:white;">` : ''}
        <div style="display:flex;justify-content:flex-end;gap:12px;margin-top:20px;">
        ${showInput ? '<button id="cancel" style="padding:10px 20px;background:#404040;color:#ccc;border:none;border-radius:12px;">Отмена</button>' : ''}
        <button id="ok" style="padding:10px 20px;background:#0a84ff;color:white;border:none;border-radius:12px;">ОК</button>
        </div>
        </div>`;
        document.body.appendChild(overlay);

        const ok = overlay.querySelector('#ok');
        const cancel = overlay.querySelector('#cancel');
        const input = overlay.querySelector('#inp');

        const close = v => { overlay.remove(); resolve(v); };

        cancel?.addEventListener('click', () => close(null));
        ok.addEventListener('click', () => close(showInput ? (input?.value.trim() || null) : true));
        overlay.addEventListener('click', e => e.target === overlay && close(null));
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') close(null);
            if (e.key === 'Enter' && showInput) close(input?.value.trim() || null);
        }, { once: true });

            (showInput ? input : ok)?.focus();
            if (showInput) input?.select();
    });
    };

    window.alert = msg => showDialog({ title: 'Сообщение', message: msg });
    window.confirm = msg => showDialog({ title: 'Подтверждение', message: msg });
    window.prompt = (msg, def) => showDialog({ title: 'Ввод', message: msg, defaultValue: def, showInput: true });

    // === ОТКРЫТИЕ В НОВОЙ ВКЛАДКЕ (всё работает) ===
    const openInNewTab = url => {
        if (url && !url.startsWith('javascript:') && !url.startsWith('mailto:') && !url.startsWith('tel:')) {
            ipcRenderer.send('OPEN_URL', url);
        }
    };

    // Средняя кнопка мыши
    document.addEventListener('auxclick', e => {
        if (e.button === 1) { // средняя кнопка
            const a = e.target.closest('a[href]');
            if (a) {
                e.preventDefault();
                openInNewTab(a.href);
            }
        }
    }, true);

    // Ctrl+клик и Cmd+клик
    document.addEventListener('click', e => {
        if (e.ctrlKey || e.metaKey) {
            const a = e.target.closest('a[href]');
            if (a) {
                e.preventDefault();
                openInNewTab(a.href);
            }
        }
    }, true);

    // target="_blank" — тоже в новую вкладку
    document.addEventListener('click', e => {
        const a = e.target.closest('a[target="_blank"]');
        if (a && a.href) {
            e.preventDefault();
            openInNewTab(a.href);
        }
    }, true);

    // window.open — тоже в новую вкладку
    const originalOpen = window.open;
    window.open = (url, target, features) => {
        if (url) openInNewTab(url);
        return { closed: false, close: () => {}, focus: () => {} }; // фейковое окно
    };
})();
