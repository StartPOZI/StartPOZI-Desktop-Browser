// settings.js — РАБОЧАЯ ВЕРСИЯ С ИНТЕГРАЦИЕЙ
const { ipcRenderer } = require('electron');

// Утилиты
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const escapeHtml = t => {
    const div = document.createElement('div');
    div.textContent = t || '';
    return div.innerHTML;
};

const formatTime = ts => {
    if (!ts) return '—';
    const d = new Date(ts);
    const diff = Date.now() - ts;
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин. назад`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч. назад`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} дн. назад`;
    return d.toLocaleDateString('ru-RU', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
};

const formatSize = b => {
    if (!b) return '—';
    if (b < 1024) return b + ' Б';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' КБ';
    return (b / 1048576).toFixed(1) + ' МБ';
};

// Открытие ссылки
function openUrl(url) {
    ipcRenderer.send('OPEN_URL', url);
    setTimeout(() => window.close(), 300);
}

// НАВИГАЦИЯ
function activateSection(id) {
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    $(`.nav-item[data-section="${id}"]`)?.classList.add('active');

    $$('.settings-section').forEach(s => s.classList.remove('active'));
    const sec = document.getElementById(`${id}-section`);
    if (sec) {
        sec.classList.add('active');
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// РЕНДЕР СПИСКОВ
function renderHistory() {
    const list = $('#historyList');
    if (!list) return;
    const h = JSON.parse(localStorage.getItem('browserHistory') || '[]');
    if (!h.length) {
        list.innerHTML = '<div class="empty-item">История пуста</div>';
        return;
    }
    list.innerHTML = h.slice(-100).reverse().map(i => `
    <div class="history-item" onclick="openUrl('${i.url}')">
    <div class="history-title">${escapeHtml(i.title || 'Без заголовка')}</div>
    <div class="history-desc">${escapeHtml(i.url)}</div>
    <div class="history-time">${formatTime(i.time)}</div>
    </div>
    `).join('');
}

function renderDownloads() {
    const list = $('#downloadsList');
    if (!list) return;
    const d = JSON.parse(localStorage.getItem('browserDownloads') || '[]');
    if (!d.length) {
        list.innerHTML = '<div class="empty-item">Нет загрузок</div>';
        return;
    }
    list.innerHTML = d.slice(-50).reverse().map(i => `
    <div class="download-item">
    <div class="download-title">${escapeHtml(i.filename || 'Файл')}</div>
    <div class="download-desc">${formatSize(i.size)} • ${formatTime(i.time)}</div>
    </div>
    `).join('');
}

function renderBookmarks() {
    const list = $('#bookmarksList');
    if (!list) return;
    const b = JSON.parse(localStorage.getItem('bookmarks') || '[]');
    if (!b.length) {
        list.innerHTML = '<div class="empty-item">Нет закладок</div>';
        return;
    }
    list.innerHTML = b.map(x => `
    <div class="favorite-item" onclick="openUrl('${x.url}')">
    <div class="favorite-title">${escapeHtml(x.title)}</div>
    <div class="favorite-desc">${escapeHtml(x.url)}</div>
    </div>
    `).join('');
}

// ПОИСКОВИК
function initSearchEngine() {
    const select = $('#searchEngine');
    const preview = $('.search-engine-preview');
    if (!select || !preview) return;

    const engines = {
        startpozi: { name: 'StartPOZI', url: 'https://startpozi.netlify.app/search.html?q=' },
        google:    { name: 'Google',    url: 'https://www.google.com/search?q=' },
        duckduckgo:{ name: 'DuckDuckGo',url: 'https://duckduckgo.com/?q=' }
    };

    let current = localStorage.getItem('searchEngine') || 'startpozi';
    if (!engines[current]) current = 'startpozi';

    select.value = current;
    preview.innerHTML = `<strong>${engines[current].name}</strong><br><code>${engines[current].url}запрос</code>`;

    select.onchange = () => {
        const val = select.value;
        localStorage.setItem('searchEngine', val);
        localStorage.setItem('searchEngineUrl', engines[val].url);
        preview.innerHTML = `<strong>${engines[val].name}</strong><br><code>${engines[val].url}запрос</code>`;
        ipcRenderer.send('update-setting', { id: 'searchEngine', value: val });
    };
}

// ПОИСК ПО СПИСКАМ
function setupSearch() {
    $$('.search-box input').forEach(input => {
        input.oninput = () => {
            const term = input.value.toLowerCase();
            $$('.history-item, .download-item, .favorite-item').forEach(el => {
                const text = el.textContent.toLowerCase();
                el.style.display = term && !text.includes(term) ? 'none' : 'flex';
            });
        };
    });

    $$('.clear-search').forEach(btn => {
        btn.onclick = () => {
            const input = btn.parentNode.querySelector('input');
            input.value = '';
            input.oninput();
        };
    });
}

// ТЕМА
function applyTheme(theme) {
    if (theme === 'system') {
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.body.className = `theme-${theme}`;
    ipcRenderer.send('update-theme', theme);
}

// РАСШИРЕНИЯ
function initExtensions() {
    const list = $('#extensionsList');
    if (!list) return;
    list.innerHTML = '<div class="empty-item">Нет установленных расширений</div>'; // Заглушка
}

// ПРОФИЛЬ
function initProfile() {
    const subscribeBtn = $('#subscribeBtn');
    const unsubscribeBtn = $('#unsubscribeBtn');
    const paymentHistoryBtn = $('#paymentHistoryBtn');
    const profileStatus = $('#profileStatus');
    const changeAvatarBtn = $('#changeAvatarBtn');

    let isSubscribed = localStorage.getItem('zhukPlusSubscribed') === 'true';
    updateSubscriptionStatus(isSubscribed);

    if (subscribeBtn) {
        subscribeBtn.onclick = () => {
            localStorage.setItem('zhukPlusSubscribed', 'true');
            updateSubscriptionStatus(true);
            alert('Подписка оформлена!');
        };
    }

    if (unsubscribeBtn) {
        unsubscribeBtn.onclick = () => {
            localStorage.setItem('zhukPlusSubscribed', 'false');
            updateSubscriptionStatus(false);
            alert('Подписка отменена.');
        };
    }

    if (paymentHistoryBtn) {
        paymentHistoryBtn.onclick = () => {
            alert('История платежей: Нет записей.');
        };
    }

    if (changeAvatarBtn) {
        changeAvatarBtn.onclick = () => {
            alert('Смена аватара в разработке.');
        };
    }

    function updateSubscriptionStatus(subscribed) {
        profileStatus.textContent = subscribed ? 'ZhukPlus Активен' : 'Бесплатный аккаунт';
        subscribeBtn.style.display = subscribed ? 'none' : 'block';
        unsubscribeBtn.style.display = subscribed ? 'block' : 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    $$('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.section;
            if (id) activateSection(id);
        });
    });

    $('#closeSettingsBtn')?.addEventListener('click', () => window.close());

    renderHistory();
    renderDownloads();
    renderBookmarks();
    initSearchEngine();
    setupSearch();
    initExtensions();
    initProfile();

    const savedTheme = localStorage.getItem('themeMode') || 'dark';
    const themeRadio = $(`input[name="themeMode"][value="${savedTheme}"]`);
    if (themeRadio) themeRadio.checked = true;
    applyTheme(savedTheme);

    $$('input[name="themeMode"]').forEach(r => {
        r.addEventListener('change', () => {
            if (r.checked) {
                localStorage.setItem('themeMode', r.value);
                applyTheme(r.value);
            }
        });
    });

    $$('input[type="checkbox"]').forEach(cb => {
        const saved = localStorage.getItem(cb.id);
        if (saved !== null) cb.checked = saved === 'true';
        cb.onchange = () => {
            localStorage.setItem(cb.id, cb.checked);
            ipcRenderer.send('update-setting', { id: cb.id, value: cb.checked });
        };
    });

    activateSection('security');
});
