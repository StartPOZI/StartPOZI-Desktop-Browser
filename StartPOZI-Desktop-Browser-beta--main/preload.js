// preload.js — для основного окна (renderer process)
const { ipcRenderer } = require('electron');

// Красивые диалоги
(function () {
    const createDialog = ({ title = 'Сообщение', message = '', defaultValue = '', type = 'alert' }) => {
        return new Promise(resolve => {
            const isPrompt = type === 'prompt';
            const isConfirm = type === 'confirm';

            const overlay = document.createElement('div');
            overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.75);
            backdrop-filter: blur(12px); display: flex; align-items: center;
            justify-content: center; z-index: 999999;
            font-family: -apple-system, system-ui, sans-serif;
            `;

            overlay.innerHTML = `
            <div style="background:#1e1e1e; border-radius:16px; width:460px; max-width:92vw;
            box-shadow:0 20px 60px rgba(0,0,0,0.8); border:1px solid #333; overflow:hidden;">
            <div style="padding:24px 32px 16px;">
            <h3 style="margin:0 0 12px; color:white; font-size:18px; font-weight:600;">${title}</h3>
            <p style="margin:0 0 20px; color:#ccc; font-size:15px; line-height:1.5;">${message}</p>
            ${isPrompt ? `<input id="dialog-input" type="text" value="${defaultValue}"
            style="width:100%; padding:12px 16px; background:#2d2d2d; border:1px solid #444;
            border-radius:12px; color:white; font-size:15px;">` : ''}
            </div>
            <div style="display:flex; justify-content:flex-end; gap:12px; padding:0 32px 28px;">
            ${isConfirm || isPrompt ? `
                <button id="dialog-cancel" style="min-width:100px; padding:10px 20px; background:#404040;
                color:#ddd; border:none; border-radius:12px; font-size:14px;">Отмена</button>` : ''}
                <button id="dialog-ok" style="min-width:100px; padding:10px 20px; background:#0a84ff;
                color:white; border:none; border-radius:12px; font-size:14px;">ОК</button>
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
                    if (isPrompt) close(input?.value.trim() || null);
                    else close(true);
                });

                    overlay.addEventListener('click', e => e.target === overlay && close(false));

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

    window.alert = msg => createDialog({ title: 'Сообщение', message: msg });
    window.confirm = msg => createDialog({ title: 'Подтверждение', message: msg, type: 'confirm' });
    window.prompt = (msg, def = '') => createDialog({ title: 'Ввод данных', message: msg, defaultValue: def, type: 'prompt' });
})();
