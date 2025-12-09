// webview-preload.js — АСИНХРОННОЕ переопределение диалогов ДО загрузки страницы

(function() {
    // Сама функция диалога — асинхронная, с Promise
    const showDialog = ({title='Подтвердите действие', message='', defaultValue='', showInput=false}) => {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;z-index:999999;font-family:-apple-system,system-ui,sans-serif;';
            overlay.innerHTML = `
            <div style="background:#1e1e1e;border-radius:16px;width:460px;max-width:92vw;box-shadow:0 20px 60px #000;border:1px solid #333">
            <div style="padding:24px 32px 16px">
            <h3 style="margin:0 0 8px;color:white;font-size:18px;font-weight:600">${title}</h3>
            <p style="margin:0 0 20px;color:#aaa;font-size:15px">${message}</p>
            <input id="inp" type="text" value="${defaultValue}" style="display:${showInput?'block':'none'};width:100%;padding:12px 16px;background:#2d2d2d;border:1px solid #444;border-radius:12px;color:white;font-size:15px">
            </div>
            <div style="display:flex;justify-content:flex-end;gap:12px;padding:0 32px 28px">
            <button id="c" style="display:${showInput||title!=='Сообщение'?'block':'none'};min-width:100px;padding:10px 20px;border:none;border-radius:12px;background:#404040;color:#ddd;font-size:14px">Отмена</button>
            <button id="o" style="min-width:100px;padding:10px 20px;border:none;border-radius:12px;background:#0a84ff;color:white;font-size:14px">ОК</button>
            </div>
            </div>
            `;
            document.body.appendChild(overlay);
            const input = overlay.querySelector('#inp');
            const cancel = overlay.querySelector('#c');
            const ok = overlay.querySelector('#o');
            const close = v => { overlay.remove(); resolve(v); };
            cancel.onclick = () => close(null);
            ok.onclick = () => close(showInput ? input.value.trim() || null : true);
            overlay.onclick = e => e.target === overlay && close(null);
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape') close(null);
                if (e.key === 'Enter' && showInput) close(input.value.trim() || null);
            }, {once: true});
                (showInput ? input : ok).focus();
                if (showInput) input.select();
        });
    };

    // Переопределяем глобальные функции АСИНХРОННО (возвращают Promise)
    window.alert = async (msg) => await showDialog({title:'Сообщение', message:msg});
    window.confirm = async (msg) => await showDialog({title:'Подтверждение', message:msg});
    window.prompt = async (msg, def='') => await showDialog({
        title:'Подтвердите действие',
        message:msg,
        defaultValue:def,
            showInput:true
    });
})();
