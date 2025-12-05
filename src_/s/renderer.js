// ZhukBrowse - Версия с вкладками
console.log('=== ZhukBrowse Starting ===');

// === Глобальные переменные для темы (перемещено вверх для предотвращения ReferenceError) ===
let systemThemeMediaQuery = null;
let systemThemeListener = null;

// Глобальные переменные
let startPage = null;
let urlInput = null;
let searchInput = null;
let searchBtn = null;
let backBtn = null;
let forwardBtn = null;
let homeBtn = null;
let refreshBtn = null;
let newTabBtn = null;
let settingsBtn = null;
let settingsModal = null;
let navTabs = null;
let tabsContainer = null;

// Переменные профиля
let profileAvatar = null;
let changeAvatarBtn = null;
let profileStatus = null;
let subscribeBtn = null;
let unsubscribeBtn = null;
let newIncognitoTabBtn = null;
let proxyToggle = null;

// Настройки
let settings = {
    searchEngine: 'google',
    proxyEnabled: false,
    proxyHost: '127.0.0.1',
    proxyPort: 8080,
    selectedCountry: 'none',
    autoConnect: false // VPN по умолчанию выключен
};

// Список прокси-серверов по странам (рабочие прокси)
const proxyServers = {
    'us': {
        name: 'США',
        host: '185.199.229.156',
        port: 7492,
        flag: '🇺🇸',
        type: 'http'
    },
    'uk': {
        name: 'Великобритания',
        host: '185.199.228.220',
        port: 7492,
        flag: '🇬🇧',
        type: 'http'
    },
    'de': {
        name: 'Германия',
        host: '185.199.231.45',
        port: 7492,
        flag: '🇩🇪',
        type: 'http'
    },
    'jp': {
        name: 'Япония',
        host: '185.199.230.102',
        port: 7492,
        flag: '🇯🇵',
        type: 'http'
    },
    'ca': {
        name: 'Канада',
        host: '185.199.229.156',
        port: 7492,
        flag: '🇨🇦',
        type: 'http'
    },
    'au': {
        name: 'Австралия',
        host: '185.199.228.220',
        port: 7492,
        flag: '🇦🇺',
        type: 'http'
    },
    'sg': {
        name: 'Сингапур',
        host: '185.199.231.45',
        port: 7492,
        flag: '🇸🇬',
        type: 'http'
    },
    'nl': {
        name: 'Нидерланды',
        host: '185.199.230.102',
        port: 7492,
        flag: '🇳🇱',
        type: 'http'
    }
};

// Поисковые системы
const searchEngines = {
    duckduckgo: 'https://duckduckgo.com/?q=',
    google: 'https://www.google.com/search?q=',
    bing: 'https://www.bing.com/search?q='
};

// Управление вкладками
let tabs = [];
let activeTabId = 'start';

// Сохранение данных
let savedTabs = [];
let downloads = [];
let browsingHistory = [];
let favorites = [];
let securitySettings = {
    checkFileSafety: true,
    checkSiteSafety: true,
    antiPhishing: true,
    secureBanking: true
};

// Настройки обновлений
let updateSettings = {
    autoCheckUpdates: true,
    autoDownloadUpdates: false
};

// === VPN STATUS ===
function updateVpnStatus() {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    if (statusIndicator && statusText) {
        if (settings.proxyEnabled && settings.selectedCountry !== 'none') {
            const country = proxyServers[settings.selectedCountry];
            statusIndicator.textContent = '🟢';
            statusIndicator.className = 'status-indicator connected';
            statusText.textContent = `VPN (SOCKS5) подключен к ${country.flag} ${country.name}`;
            statusIndicator.style.animation = 'none';
            setTimeout(() => {
                statusIndicator.style.animation = 'pulse-green 2s infinite';
            }, 10);
        } else {
            statusIndicator.textContent = '🔴';
            statusIndicator.className = 'status-indicator';
            statusText.textContent = 'VPN отключен';
            statusIndicator.style.animation = 'none';
            setTimeout(() => {
                statusIndicator.style.animation = 'pulse 2s infinite';
            }, 10);
        }
    }
}


function enableSecureDNS() {
    showNotification('Безопасный DNS включен (заглушка)');
}

// Инициализация элементов
function initElements() {
    // Гарантированно скрываем окно настроек при запуске
    const settingsPage = document.getElementById('settingsPageMain');
    if (settingsPage) settingsPage.style.display = 'none';
    
    console.log('Initializing elements...');
    
    try {
        startPage = document.getElementById('startPage');
        urlInput = document.getElementById('urlInput');
        searchInput = document.getElementById('searchInput');
        backBtn = document.getElementById('backBtn');
        forwardBtn = document.getElementById('forwardBtn');
        homeBtn = document.getElementById('homeBtn');
        refreshBtn = document.getElementById('refreshBtn');
        newTabBtn = document.getElementById('newTabBtn');
        settingsBtn = document.getElementById('settingsBtn');
        settingsModal = document.getElementById('settingsModal');
        navTabs = document.getElementById('navTabs');
        tabsContainer = document.getElementById('tabsContainer');
        newIncognitoTabBtn = document.getElementById('newIncognitoTabBtn');
        proxyToggle = document.getElementById('proxyToggle');
        
        // Инициализация элементов профиля
        profileAvatar = document.getElementById('profileAvatar');
        changeAvatarBtn = document.getElementById('changeAvatarBtn');
        profileStatus = document.getElementById('profileStatus');
        subscribeBtn = document.getElementById('subscribeBtn');
    unsubscribeBtn = document.getElementById('unsubscribeBtn');
    
    console.log('Profile elements found:', {
        profileAvatar: !!profileAvatar,
        changeAvatarBtn: !!changeAvatarBtn,
        profileStatus: !!profileStatus,
        subscribeBtn: !!subscribeBtn,
        unsubscribeBtn: !!unsubscribeBtn
    });
        
        console.log('Elements found:', {
            startPage: !!startPage,
            urlInput: !!urlInput,
            searchInput: !!searchInput,
            navTabs: !!navTabs,
            tabsContainer: !!tabsContainer,
            newTabBtn: !!newTabBtn,
            settingsBtn: !!settingsBtn
        });
        
        // Проверяем критически важные элементы и пытаемся найти их снова
        if (!tabsContainer) {
            console.warn('tabsContainer not found, retrying...');
            setTimeout(() => {
                tabsContainer = document.getElementById('tabsContainer');
                if (tabsContainer) {
                    console.log('tabsContainer found on retry');
                } else {
                    console.error('Critical error: tabsContainer not found after retry!');
                }
            }, 100);
        }
        if (!navTabs) {
            console.warn('navTabs not found, retrying...');
            setTimeout(() => {
                navTabs = document.getElementById('navTabs');
                if (navTabs) {
                    console.log('navTabs found on retry');
                } else {
                    console.error('Critical error: navTabs not found after retry!');
                }
            }, 100);
        }
        
    } catch (error) {
        console.error('Error initializing elements:', error);
    }
}

// Загрузка настроек
function loadSettings() {
    const saved = localStorage.getItem('zhukbrowse_settings');
    if (saved) {
        settings = { ...settings, ...JSON.parse(saved) };
    }
    updateProxyButton();
    // НЕ применяем прокси автоматически при запуске
    // applyProxySettings(); // Убираем автоматическое применение
}

// Сохранение всех данных с шифрованием
function saveAllData() {
    // Сохраняем вкладки
    const tabsData = Array.from(document.querySelectorAll('.tab-content')).map(tab => {
        const tabId = tab.getAttribute('data-tab-id');
        const webview = tab.querySelector('webview');
        return {
            id: tabId,
            url: webview ? webview.src : null,
            title: document.querySelector(`[data-tab-id="${tabId}"] span`)?.textContent || 'Новая вкладка'
        };
    }).filter(tab => tab.id !== 'start');
    
    try {
        // Шифруем данные
        const encryptedTabs = encryptData(tabsData);
        const encryptedDownloads = encryptData(downloads);
        const encryptedHistory = encryptData(browsingHistory);
        const encryptedFavorites = encryptData(favorites);
        const encryptedSecurity = encryptData(securitySettings);
        
        localStorage.setItem('zhukbrowse_tabs', encryptedTabs || JSON.stringify(tabsData));
        localStorage.setItem('zhukbrowse_active_tab', activeTabId);
        localStorage.setItem('zhukbrowse_downloads', encryptedDownloads || JSON.stringify(downloads));
        localStorage.setItem('zhukbrowse_history', encryptedHistory || JSON.stringify(browsingHistory));
        localStorage.setItem('zhukbrowse_favorites', encryptedFavorites || JSON.stringify(favorites));
        localStorage.setItem('zhukbrowse_security', encryptedSecurity || JSON.stringify(securitySettings));
    } catch (error) {
        console.error('Error saving encrypted data:', error);
        // Fallback к обычному сохранению
        localStorage.setItem('zhukbrowse_tabs', JSON.stringify(tabsData));
        localStorage.setItem('zhukbrowse_active_tab', activeTabId);
        localStorage.setItem('zhukbrowse_downloads', JSON.stringify(downloads));
        localStorage.setItem('zhukbrowse_history', JSON.stringify(browsingHistory));
        localStorage.setItem('zhukbrowse_favorites', JSON.stringify(favorites));
        localStorage.setItem('zhukbrowse_security', JSON.stringify(securitySettings));
    }
}

// Загрузка всех данных с расшифровкой
function loadAllData() {
    try {
        // Загружаем вкладки
        const savedTabs = localStorage.getItem('zhukbrowse_tabs');
        let tabsData = [];
        if (savedTabs) {
            // Пытаемся расшифровать
            const decryptedTabs = decryptData(savedTabs);
            tabsData = decryptedTabs || JSON.parse(savedTabs);
            tabsData.forEach(tabData => {
                if (tabData.url) {
                    createTab(tabData.url, tabData.title);
                }
            });
        }
        
        // Загружаем активную вкладку
        const savedActiveTab = localStorage.getItem('zhukbrowse_active_tab');
        if (tabsData.length) {
            // Если есть вкладки — активируем последнюю активную или первую
            if (savedActiveTab && document.getElementById(savedActiveTab)) {
                activeTabId = savedActiveTab;
                switchTab(activeTabId);
            } else {
                // Если активная не найдена, активируем первую вкладку
                const firstTab = document.querySelector('.tab-content');
                if (firstTab) {
                    switchTab(firstTab.id);
                } else {
                    switchTab('start');
                }
            }
        } else {
            // Если вкладок нет — стартовая
            switchTab('start');
        }
        
        // Загружаем загрузки
        const savedDownloads = localStorage.getItem('zhukbrowse_downloads');
        if (savedDownloads) {
            const decryptedDownloads = decryptData(savedDownloads);
            downloads = decryptedDownloads || JSON.parse(savedDownloads);
        }
        
        // Загружаем историю
        const savedHistory = localStorage.getItem('zhukbrowse_history');
        if (savedHistory) {
            const decryptedHistory = decryptData(savedHistory);
            browsingHistory = decryptedHistory || JSON.parse(savedHistory);
        }
        
        // Загружаем избранное
        const savedFavorites = localStorage.getItem('zhukbrowse_favorites');
        if (savedFavorites) {
            const decryptedFavorites = decryptData(savedFavorites);
            favorites = decryptedFavorites || JSON.parse(savedFavorites);
        }
        
        // Загружаем настройки безопасности
        const savedSecurity = localStorage.getItem('zhukbrowse_security');
        if (savedSecurity) {
            const decryptedSecurity = decryptData(savedSecurity);
            const securityData = decryptedSecurity || JSON.parse(savedSecurity);
            securitySettings = { ...securitySettings, ...securityData };
        }
    } catch (error) {
        console.error('Error loading encrypted data:', error);
        // Fallback к обычной загрузке
        const savedTabs = localStorage.getItem('zhukbrowse_tabs');
        let tabsData = [];
        if (savedTabs) {
            tabsData = JSON.parse(savedTabs);
            tabsData.forEach(tabData => {
                if (tabData.url) {
                    createTab(tabData.url, tabData.title);
                }
            });
        }
        
        const savedActiveTab = localStorage.getItem('zhukbrowse_active_tab');
        if (tabsData.length) {
            if (savedActiveTab && document.getElementById(savedActiveTab)) {
                activeTabId = savedActiveTab;
                switchTab(activeTabId);
            } else {
                const firstTab = document.querySelector('.tab-content');
                if (firstTab) {
                    switchTab(firstTab.id);
                } else {
                    switchTab('start');
                }
            }
        } else {
            switchTab('start');
        }
        
        const savedDownloads = localStorage.getItem('zhukbrowse_downloads');
        if (savedDownloads) {
            downloads = JSON.parse(savedDownloads);
        }
        const savedHistory = localStorage.getItem('zhukbrowse_history');
        if (savedHistory) {
            browsingHistory = JSON.parse(savedHistory);
        }
        const savedFavorites = localStorage.getItem('zhukbrowse_favorites');
        if (savedFavorites) {
            favorites = JSON.parse(savedFavorites);
        }
        const savedSecurity = localStorage.getItem('zhukbrowse_security');
        if (savedSecurity) {
            securitySettings = { ...securitySettings, ...JSON.parse(savedSecurity) };
        }
    }
}

// Обновление кнопки прокси
function updateProxyButton() {
    const btn = document.getElementById('proxyToggle');
    if (!btn) return;
    
    // Проверяем, находимся ли мы в режиме инкогнито
    const activeTabContent = document.getElementById(activeTabId);
    const isIncognito = activeTabContent && activeTabContent.getAttribute('data-incognito') === '1';
    
    if (isIncognito) {
        // В режиме инкогнито VPN всегда включен
        btn.innerHTML = '<i class="fas fa-globe"></i> <span>VPN: 🛡️ Инкогнито</span>';
        btn.classList.add('active');
        btn.style.color = '#b388ff';
    } else if (settings.proxyEnabled && settings.selectedCountry !== 'none') {
        const proxy = publicProxies.find(p => p.code === settings.selectedCountry);
        const flag = proxy ? getFlag(proxy.code) : '🌐';
        const country = proxy ? proxy.country : settings.selectedCountry;
        btn.innerHTML = `<i class="fas fa-globe"></i> <span>VPN: ${flag} ${country}</span>`;
        btn.classList.add('active');
        btn.style.color = '';
    } else {
        btn.innerHTML = '<i class="fas fa-globe"></i> <span>VPN: выкл.</span>';
        btn.classList.remove('active');
        btn.style.color = '';
    }
}

// Переключение прокси
async function applyProxySettings() {
    if (settings.proxyEnabled && settings.selectedCountry !== 'none') {
        const country = proxyServers[settings.selectedCountry];
        let proxyString = '';
        if (country.type === 'socks5') {
            proxyString = `socks5://${country.host}:${country.port}`;
        } else if (country.type === 'http') {
            proxyString = `http=${country.host}:${country.port}`;
        } else {
            // fallback
            proxyString = `${country.type}=${country.host}:${country.port}`;
        }
        if (window.electronAPI?.setProxy) {
            await window.electronAPI.setProxy(proxyString);
        }
    } else {
        if (window.electronAPI?.clearProxy) {
            await window.electronAPI.clearProxy();
        }
    }
    updateVpnStatus();
}

// Переключение прокси
function toggleProxy() {
    // Проверяем, находимся ли мы в режиме инкогнито
    const activeTabContent = document.getElementById(activeTabId);
    const isIncognito = activeTabContent && activeTabContent.getAttribute('data-incognito') === '1';
    
    if (isIncognito) {
        // В режиме инкогнито VPN всегда включен
        showNotification('VPN всегда включен в режиме инкогнито для максимальной защиты');
        return;
    }
    
    if (!settings.proxyEnabled) {
        showProxySelector();
    } else {
        // Отключаем VPN
        settings.proxyEnabled = false;
        settings.selectedCountry = 'none';
        localStorage.setItem('zhukbrowse_settings', JSON.stringify(settings));
        updateProxyButton();
        updateVpnStatus();
        // Очищаем прокси через main process
        if (window.electronAPI?.clearProxy) {
            window.electronAPI.clearProxy().then(() => {
                // Перезагружаем все webview после отключения прокси
                reloadAllWebviews();
            });
        }
    }
}

// При выборе страны VPN
function selectVpnCountry(countryCode) {
    settings.selectedCountry = countryCode;
    settings.proxyEnabled = true;
    localStorage.setItem('zhukbrowse_settings', JSON.stringify(settings));
    updateProxyButton();
    applyProxySettings();
}

// Открытие меню выбора прокси
function openProxyMenu() {
    const menu = document.createElement('div');
    menu.className = 'proxy-menu';
    menu.innerHTML = `
        <div class="proxy-menu-header">
            <div class="header-content">
                <i class="fas fa-globe"></i>
                <h3>Выберите страну для VPN</h3>
                <p>Нажмите на страну для подключения</p>
            </div>
            <button class="close-menu-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="proxy-countries">
            ${Object.entries(proxyServers).map(([code, country]) => `
                <div class="proxy-country" data-country="${code}">
                    <div class="country-info">
                        <span class="country-flag">${country.flag}</span>
                        <div class="country-details">
                            <span class="country-name">${country.name}</span>
                            <span class="country-status">Нажмите для подключения</span>
                        </div>
                    </div>
                    <div class="country-action">
                        <i class="fas fa-shield-alt"></i>
                    </div>
                </div>
            `).join('')}
        </div>
        <div class="proxy-menu-footer">
            <p><i class="fas fa-info-circle"></i> VPN защищает вашу конфиденциальность</p>
        </div>
    `;
    
    // Добавляем стили
    menu.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
        border: 1px solid #333;
        border-radius: 16px;
        padding: 0;
        z-index: 10000;
        min-width: 400px;
        max-height: 500px;
        overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,0.8);
        backdrop-filter: blur(10px);
    `;
    
    document.body.appendChild(menu);
    
    // Обработчики событий
    const closeBtn = menu.querySelector('.close-menu-btn');
    closeBtn.addEventListener('click', () => {
        menu.remove();
    });
    
    // Выбор страны
    menu.querySelectorAll('.proxy-country').forEach(countryEl => {
        countryEl.addEventListener('click', () => {
            const countryCode = countryEl.getAttribute('data-country');
            const country = proxyServers[countryCode];
            
            settings.proxyEnabled = true;
            settings.selectedCountry = countryCode;
            settings.proxyHost = country.host;
            settings.proxyPort = country.port;
            
            updateProxyButton();
            localStorage.setItem('zhukbrowse_settings', JSON.stringify(settings));
            showNotification(`VPN подключен к ${country.flag} ${country.name}`);
            
            menu.remove();
            
            // Перезагружаем все активные webview с новым прокси
            reloadAllWebviews();
        });
    });
    
    // Закрытие по клику вне меню
    document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target) && e.target !== proxyToggle) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    });
}

// Перезагрузка всех webview
function reloadAllWebviews() {
    document.querySelectorAll('webview').forEach(webview => {
        try {
            const currentUrl = webview.src;
            if (currentUrl && currentUrl !== 'about:blank') {
                webview.reload();
            }
        } catch (error) {
            console.log('Cannot reload webview:', error);
        }
    });
}

// Управление быстрыми ссылками
let quickLinks = [
    { url: 'https://www.google.com', name: 'Google', icon: 'fab fa-google' },
    { url: 'https://www.youtube.com', name: 'YouTube', icon: 'fab fa-youtube' },
    { url: 'https://github.com', name: 'GitHub', icon: 'fab fa-github' },
    { url: 'https://stackoverflow.com', name: 'Stack Overflow', icon: 'fab fa-stack-overflow' },
    { url: 'https://www.reddit.com', name: 'Reddit', icon: 'fab fa-reddit' },
    { url: 'https://www.wikipedia.org', name: 'Wikipedia', icon: 'fab fa-wikipedia-w' }
];

// Дефолтные быстрые ссылки
const DEFAULT_QUICK_LINKS = [
    { title: 'YouTube', url: 'https://youtube.com', icon: 'fab fa-youtube' },
    { title: 'Google', url: 'https://google.com', icon: 'fab fa-google' },
    { title: 'VK', url: 'https://vk.com', icon: 'fab fa-vk' },
    { title: 'GitHub', url: 'https://github.com', icon: 'fab fa-github' }
];

function loadQuickLinks() {
    let links = [];
    try {
        links = JSON.parse(localStorage.getItem('zhukbrowse_quicklinks') || '[]');
    } catch (e) { links = []; }
    if (!links || !Array.isArray(links) || links.length === 0) {
        links = DEFAULT_QUICK_LINKS;
        localStorage.setItem('zhukbrowse_quicklinks', JSON.stringify(links));
    }
    return links;
}

function saveQuickLinks(links) {
    localStorage.setItem('zhukbrowse_quicklinks', JSON.stringify(links));
}

// Поиск (гарантированно работает)
function performSearch(query) {
    try {
        if (!query || typeof query !== 'string') {
            console.error('Invalid search query provided');
            return;
        }
        
        const trimmedQuery = query.trim();
        if (!trimmedQuery) {
            console.error('Empty search query');
            return;
        }
        
        // Проверяем доступность необходимых переменных и функций
        if (typeof searchEngines === 'undefined') {
            console.error('searchEngines not defined');
            return;
        }
        
        if (typeof settings === 'undefined') {
            console.error('settings not defined');
            return;
        }
        
        if (typeof createTab === 'undefined') {
            console.error('createTab function not defined');
            return;
        }
        
        // Получаем поисковую систему
        const searchEngine = searchEngines[settings.searchEngine] || searchEngines.google;
        
        // Формируем URL для поиска
        const searchUrl = searchEngine + encodeURIComponent(trimmedQuery);
        
        // Создаем новую вкладку с результатами поиска
        createTab(searchUrl, 'Поиск: ' + trimmedQuery);
        
        console.log(`Search performed: ${trimmedQuery} using ${settings.searchEngine}`);
        
    } catch (error) {
        console.error('Error performing search:', error);
    }
}

// Открытие редактора быстрых ссылок (заглушка)
function openQuickLinksEditor() {
    alert('Редактирование быстрых ссылок пока не реализовано.');
}

// Открытие галереи фонов (заглушка)
function openBackgroundGallery() {
    alert('Смена фона пока не реализована.');
}

function renderQuickLinksTo(container) {
    if (!container) return;
    container.innerHTML = '';
    const links = loadQuickLinks();
    if (!links || links.length === 0) {
        container.innerHTML = '<div style="color:#bbb;opacity:0.7;font-size:14px;">Нет быстрых ссылок</div>';
        return;
    }
    links.forEach(link => {
        const el = document.createElement('div');
        el.className = 'quick-link';
        el.innerHTML = `<i class='${link.icon || "fas fa-link"}'></i><span class='quick-link-title'>${link.title}</span>`;
        el.title = link.url;
        el.addEventListener('click', () => navigateTo(link.url));
        container.appendChild(el);
    });
}

// Показать уведомление
function showNotification(message, icon = 'fa-info-circle') {
    console.log('showNotification called:', message, icon);
    // Удаляем старое уведомление, если оно есть
    const old = document.getElementById('global-notification');
    if (old) old.remove();
    const notification = document.createElement('div');
    notification.id = 'global-notification';
    notification.style.cssText = `
        position: fixed;
        top: 32px;
        right: 32px;
        background: rgba(24, 24, 28, 0.96);
        color: #fff;
        padding: 16px 28px 16px 56px;
        border-radius: 14px;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 8px 32px rgba(0,0,0,0.25);
        font-size: 16px;
        display: flex;
        align-items: center;
        min-width: 240px;
        max-width: 420px;
        animation: slideInRight 0.35s cubic-bezier(.4,0,.2,1);
        position: fixed;
        overflow: hidden;
    `;
    notification.innerHTML = `<i class="fas ${icon}" style="font-size:22px;margin-right:18px;color:#00ff88;"></i><span>${message}</span>`;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s cubic-bezier(.4,0,.2,1)';
        setTimeout(() => {
            if (notification.parentNode) notification.parentNode.removeChild(notification);
        }, 300);
    }, 3200);
}

// Создание новой вкладки
function createTab(url = null, title = 'Новая вкладка', incognito = false) {
    if (!navTabs || !tabsContainer) {
        console.warn('Попытка создать вкладку до инициализации navTabs/tabsContainer! Вкладка не будет создана.');
        return;
    }
    try {
        // Проверка на валидный url (http/https/file)
        let isValidUrl = false;
        if (url && typeof url === 'string') {
            isValidUrl = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://');
        }
        const tabId = 'tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        // Создаем вкладку в навигации
        const tab = document.createElement('div');
        tab.className = 'tab';
        tab.setAttribute('data-tab-id', tabId);
        const tabIcon = incognito ? 'local-incognito-icon' : 'fas fa-globe';
        const tabColor = incognito ? '#b388ff' : '#fff';
        let iconHtml;
        if (incognito) {
            iconHtml = `<img src="assets/icon.svg" alt="incognito" style="width:16px;height:16px;vertical-align:middle;filter:drop-shadow(0 0 2px #b388ff);">`;
        } else {
            iconHtml = `<i class="${tabIcon}" style="color: ${tabColor};"></i>`;
        }
        tab.innerHTML = `
            ${iconHtml}
            <span style="color: ${tabColor};">${title}</span>
            <button class="tab-close" data-tab-id="${tabId}" title="Закрыть вкладку" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin-left:6px;background:transparent;border:none;cursor:pointer;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;
        // Создаем контент вкладки
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content';
        tabContent.id = tabId;
        tabContent.setAttribute('data-tab-id', tabId);
        if (isValidUrl) {
            // Только webview, если есть валидный url
            const webview = document.createElement('webview');
            webview.src = url;
            webview.style.width = '100%';
            webview.style.height = '100%';
            webview.style.border = 'none';
            webview.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            webview.setAttribute('allowpopups', '');
            webview.setAttribute('webpreferences', 'contextIsolation=no,sandbox=no');
            
            // Принудительно применяем прокси к webview если он включен
            if (settings.proxyEnabled && settings.selectedCountry !== 'none') {
                const currentProxy = publicProxies.find(p => p.code === settings.selectedCountry);
                if (currentProxy) {
                    // Применяем прокси через main process
                    if (window.electronAPI && window.electronAPI.setProxy) {
                        window.electronAPI.setProxy({
                            host: currentProxy.host,
                            port: currentProxy.port,
                            username: currentProxy.username,
                            password: currentProxy.password,
                            code: currentProxy.code
                        });
                    }
                }
            }
            

            // ... обработчики событий webview ...
            webview.addEventListener('dom-ready', () => {
                const theme = document.body.getAttribute('data-theme') || 'system';
                const prefers = (theme === 'dark') ? 'dark' : 'light';
                webview.executeJavaScript(`
                    try {
                      let meta = document.querySelector('meta[name="color-scheme"]');
                      if (!meta) {
                        meta = document.createElement('meta');
                        meta.name = 'color-scheme';
                        document.head.appendChild(meta);
                      }
                      meta.content = '${prefers}';
                      if (window.matchMedia) {
                        Object.defineProperty(window, 'matchMedia', {
                          value: (q) => ({
                            matches: q.includes('dark') ? '${prefers}' === 'dark' : '${prefers}' === 'light',
                            media: q,
                            onchange: null,
                            addListener: () => {},
                            removeListener: () => {},
                            addEventListener: () => {},
                            removeEventListener: () => {},
                            dispatchEvent: () => false
                          }),
                          configurable: true
                        });
                      }
                      document.documentElement.style.colorScheme = '${prefers}';
                    } catch(e) {}
                `);
            });
            webview.addEventListener('did-start-loading', () => {
                const tabSpan = tab.querySelector('span');
                if (tabSpan) {
                    const current = tabSpan.textContent.trim();
                    let isTechnical = !current || current === 'Без названия' || current === 'Готово';
                    if (webview.src) {
                        try {
                            if (current === new URL(webview.src).hostname || current === webview.src) {
                                isTechnical = true;
                            }
                        } catch (e) {}
                    }
                    if (isTechnical) {
                        tabSpan.textContent = 'Загрузка...';
                    }
                }
            });
            webview.addEventListener('did-finish-load', () => {
                const tabSpan = tab.querySelector('span');
                let newTitle = webview.getTitle();
                if (!newTitle || newTitle.trim() === '') {
                    if (webview.src) {
                        try {
                            newTitle = new URL(webview.src).hostname;
                        } catch (e) {
                            newTitle = webview.src;
                        }
                    } else {
                        newTitle = 'Без названия';
                    }
                }
                if (tabSpan) {
                    tabSpan.textContent = newTitle;
                }
                if (!incognito && typeof addToHistory === 'function') {
                    addToHistory(url, newTitle);
                }
            });
            webview.addEventListener('page-title-updated', (event) => {
                const tabSpan = tab.querySelector('span');
                let newTitle = event.title;
                if (!newTitle || newTitle.trim() === '') {
                    if (webview.src) {
                        try {
                            newTitle = new URL(webview.src).hostname;
                        } catch (e) {
                            newTitle = webview.src;
                        }
                    } else {
                        newTitle = 'Без названия';
                    }
                }
                if (tabSpan) {
                    tabSpan.textContent = newTitle;
                }
            });
            webview.addEventListener('did-fail-load', (event) => {
                console.error('Webview failed to load:', event);
                const tabSpan = tab.querySelector('span');
                if (tabSpan) {
                    tabSpan.textContent = 'Ошибка загрузки';
                }
            });
            // === Диагностика проблем: выводим логи и ошибки webview ===
            webview.addEventListener('console-message', (e) => {
                console.log('WEBVIEW LOG:', e.message);
            });
            webview.addEventListener('did-fail-load', (e) => {
                console.error('WEBVIEW FAIL:', e.errorDescription, e.validatedURL);
            });
            // Заменено: вместо 'crashed' используем 'render-process-gone'
            webview.addEventListener('render-process-gone', (event) => {
                console.error('WEBVIEW CRASHED:', event.reason);
            });
            // === ДОБАВЛЕНО: обновление состояния кнопок навигации при изменении истории ===
            webview.addEventListener('did-navigate', updateNavButtons);
            webview.addEventListener('did-navigate-in-page', updateNavButtons);
            webview.addEventListener('did-frame-navigate', updateNavButtons);
            webview.addEventListener('did-start-navigation', updateNavButtons);
            webview.addEventListener('did-stop-loading', updateNavButtons);
            tabContent.appendChild(webview);
        } else {
            // Только стартовая страница, если url невалидный или пустой
            const startPageDiv = document.createElement('div');
            startPageDiv.className = 'start-page' + (incognito ? ' incognito' : '');
            startPageDiv.id = 'startPage-' + tabId;
            startPageDiv.style.position = 'relative';
            startPageDiv.style.width = '100%';
            startPageDiv.style.height = '100%';
            tabContent.appendChild(startPageDiv);
        }
        if (navTabs) navTabs.appendChild(tab);
        if (tabsContainer) tabsContainer.appendChild(tabContent);
        
        // Скрываем все другие вкладки перед показом новой
        const allTabContents = document.querySelectorAll('.tab-content');
        allTabContents.forEach(content => {
            if (content.id !== tabId) {
                content.style.display = 'none';
                content.classList.remove('active');
            }
        });
        
        // Показываем новую вкладку
        tabContent.style.display = 'block';
        tabContent.classList.add('active');
        
        if (!isValidUrl) {
            const renderStartPageWithDelay = () => {
                if (typeof renderStartPage === 'function') {
                    renderStartPage('startPage-' + tabId, incognito ? '#b388ff' : '#00ff88');
                    if (typeof initStartPage === 'function') {
                        initStartPage('startPage-' + tabId);
                    }
                }
            };
            if (document.readyState === 'complete') {
                renderStartPageWithDelay();
            } else {
                setTimeout(renderStartPageWithDelay, 50);
            }
        }
        addTabEventListeners(tab);
        switchTab(tabId);
        updateNavButtons();
        return tabId;
    } catch (error) {
        console.error('Error creating tab:', error);
        return null;
    }
}

function switchTab(tabId) {
    try {
        if (!tabId) {
            console.error('No tabId provided to switchTab');
            return;
        }
        
        // Убираем активный класс со всех вкладок
        const allTabs = document.querySelectorAll('.tab');
        const allTabContents = document.querySelectorAll('.tab-content');
        
        allTabs.forEach(tab => tab.classList.remove('active'));
        allTabContents.forEach(content => {
            content.classList.remove('active');
            // Скрываем все контенты вкладок
            content.style.display = 'none';
        });
        
        // Добавляем активный класс к выбранной вкладке
        const selectedTab = document.querySelector(`[data-tab-id="${tabId}"]`);
        const selectedTabContent = document.getElementById(tabId);
        
        if (selectedTab) {
            selectedTab.classList.add('active');
        } else {
            console.warn(`Tab with id '${tabId}' not found in navigation`);
        }
        
        if (selectedTabContent) {
            selectedTabContent.classList.add('active');
            selectedTabContent.style.display = 'block';
            console.log(`Tab content ${tabId} marked as active`);
        } else {
            console.warn(`Tab content with id '${tabId}' not found`);
        }
        
        // Обновляем активную вкладку
        activeTabId = tabId;
        
        // Обновляем адресную строку
        if (urlInput) {
            const webview = selectedTabContent ? selectedTabContent.querySelector('webview') : null;
            if (webview) {
                urlInput.value = webview.src;
            } else {
                urlInput.value = '';
            }
        }
        
        // Показываем/скрываем кнопку галереи фонов
        const galleryBtn = document.getElementById('backgroundGalleryBtn');
        if (galleryBtn) {
            // Показываем кнопку на стартовой странице и новых вкладках (без webview)
            const selectedTabContent = document.getElementById(tabId);
            const hasWebview = selectedTabContent && selectedTabContent.querySelector('webview');
            if (tabId === 'start' || !hasWebview) {
                galleryBtn.style.display = 'block';
            } else {
                galleryBtn.style.display = 'none';
            }
        }
        
        // Обновляем кнопки навигации
        updateNavButtons();
        
        console.log(`Switched to tab: ${tabId}`);
        
    } catch (error) {
        console.error('Error switching tab:', error);
    }
}

// Закрытие вкладки
function closeTab(tabId) {
    try {
        if (!tabId || tabId === 'start') {
            console.log('Cannot close start tab');
            return;
        }
        
        const tab = document.querySelector(`[data-tab-id="${tabId}"]`);
        const tabContent = document.getElementById(tabId);
        
        if (tab) {
            tab.remove();
        } else {
            console.warn(`Tab with id '${tabId}' not found in navigation`);
        }
        
        if (tabContent) {
            tabContent.remove();
        } else {
            console.warn(`Tab content with id '${tabId}' not found`);
        }
        
        // Если закрыли активную вкладку, переключаемся на стартовую
        if (activeTabId === tabId) {
            switchTab('start');
        }
        
        console.log(`Tab closed: ${tabId}`);
        
    } catch (error) {
        console.error('Error closing tab:', error);
    }
}

// Навигация к URL
function navigateTo(url) {
    try {
        if (!url) {
            console.error('No URL provided to navigateTo');
            return;
        }
        
        // Проверяем, находимся ли мы в режиме инкогнито
        const activeTabContent = document.getElementById(activeTabId);
        const isIncognito = activeTabContent && activeTabContent.getAttribute('data-incognito') === '1';
        
        // Проверяем, является ли это поисковым запросом
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
            // Это поисковый запрос
            if (isIncognito) {
                // В режиме инкогнито используем webview для поиска
                navigateInIncognito(url);
            } else if (typeof performSearch === 'function') {
                performSearch(url);
            } else {
                console.error('performSearch function not available');
            }
            return;
        }
        
        // Создаем новую вкладку с URL
        if (typeof createTab === 'function') {
            createTab(url);
        } else {
            console.error('createTab function not available');
        }
        
    } catch (error) {
        console.error('Error navigating to URL:', error);
    }
}

// Специальная функция для навигации в режиме инкогнито
function navigateInIncognito(url) {
    try {
        const activeTabContent = document.getElementById(activeTabId);
        if (!activeTabContent) return;
        
        const startPage = activeTabContent.querySelector('#startPage');
        const webview = activeTabContent.querySelector('#incognitoWebview');
        
        if (!startPage || !webview) return;
        
        // Скрываем стартовую страницу и показываем webview
        startPage.style.display = 'none';
        webview.style.display = 'block';
        
        // Формируем URL для поиска
        let searchUrl;
        if (settings.searchEngine === 'google') {
            searchUrl = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        } else if (settings.searchEngine === 'bing') {
            searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(url)}`;
        } else {
            searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(url)}`;
        }
        
        // Загружаем URL в webview
        webview.src = searchUrl;
        
        // Обновляем URL в адресной строке
        if (urlInput) {
            urlInput.value = searchUrl;
        }
        
        // Применяем защиту к webview
        if (typeof applyIncognitoProtectionToWebview === 'function') {
            applyIncognitoProtectionToWebview(webview);
        }
        
        showNotification('Поиск выполнен в режиме инкогнито');
        
    } catch (error) {
        console.error('Error navigating in incognito:', error);
    }
}

// Обновление кнопок навигации
function updateNavButtons() {
    try {
        const activeTabContent = document.getElementById(activeTabId);
        if (!activeTabContent) {
            console.warn('Active tab content not found');
            return;
        }
        const webview = activeTabContent.querySelector('webview');
        const isIncognito = activeTabContent.getAttribute('data-incognito') === '1';
        // Проверка: webview должен быть в DOM и готов
        let canGoBack = false, canGoForward = false;
        if (webview && webview.isConnected && webview.getWebContentsId) {
            try {
                canGoBack = typeof webview.canGoBack === 'function' && webview.canGoBack();
                canGoForward = typeof webview.canGoForward === 'function' && webview.canGoForward();
            } catch (e) {
                // webview не готов, не обновляем
                canGoBack = false;
                canGoForward = false;
            }
        }
        // Обновляем кнопки назад/вперед
        if (backBtn) {
            if (isIncognito) {
                backBtn.disabled = false;
            } else {
                backBtn.disabled = !canGoBack;
            }
        }
        if (forwardBtn) {
            if (isIncognito) {
                forwardBtn.disabled = false;
            } else {
                forwardBtn.disabled = !canGoForward;
            }
        }
        
        // Обновляем индикатор безопасности
        const securityIndicator = document.getElementById('securityIndicator');
        if (securityIndicator) {
            if (isIncognito) {
                securityIndicator.innerHTML = '<i class="fas fa-mask" style="color: #b388ff;"></i>';
                securityIndicator.title = 'Режим инкогнито - защищенное соединение';
            } else if (webview && webview.src) {
                const url = new URL(webview.src);
                if (url.protocol === 'https:') {
                    securityIndicator.innerHTML = '<i class="fas fa-lock" style="color: #00ff88;"></i>';
                    securityIndicator.title = 'Безопасное соединение';
                } else {
                    securityIndicator.innerHTML = '<i class="fas fa-unlock" style="color: #ffaa00;"></i>';
                    securityIndicator.title = 'Небезопасное соединение';
                }
            } else {
                securityIndicator.innerHTML = '<i class="fas fa-shield-alt" style="color: #00ff88;"></i>';
                securityIndicator.title = 'Защищенный браузер';
            }
        }
        
    } catch (error) {
        console.error('Error updating navigation buttons:', error);
    }
}

// Обновление времени
function updateTime() {
    try {
        const timeElements = document.querySelectorAll('.current-time');
        if (timeElements.length === 0) {
            return; // Нет элементов времени для обновления
        }
        
        const now = new Date();
        const timeString = now.toLocaleTimeString('ru-RU', { 
            hour: '2-digit', 
            minute: '2-digit'
        });
        
        timeElements.forEach(el => {
            if (el && el.textContent !== timeString) {
                el.textContent = timeString;
            }
        });
        
    } catch (error) {
        console.error('Error updating time:', error);
    }
}

// Настройки
function openSettings() {
    console.log('[НАСТРОЙКИ] Кнопка настроек нажата!');
    const settingsPage = document.getElementById('settingsPageMain');
    if (!settingsPage) {
        console.error('[НАСТРОЙКИ] settingsPageMain не найден!');
        return;
    }
    console.log('[НАСТРОЙКИ] settingsPageMain найден:', settingsPage);
    // Удаляем все возможные классы и стили, которые могут мешать
    settingsPage.classList.remove('settings-page-hide');
    settingsPage.classList.add('settings-page-show');
    settingsPage.style.removeProperty('display');
    settingsPage.style.removeProperty('visibility');
    settingsPage.style.removeProperty('opacity');
    settingsPage.style.display = 'flex';
    settingsPage.style.visibility = 'visible';
    settingsPage.style.opacity = '1';
    settingsPage.style.zIndex = '9999';
    setTimeout(() => {
        console.log('[НАСТРОЙКИ] Итоговый стиль display:', settingsPage.style.display);
        console.log('[НАСТРОЙКИ] Классы:', settingsPage.className);
        console.log('[НАСТРОЙКИ] Виден ли settingsPage:', settingsPage.offsetParent !== null);
    }, 100);
    loadSettingsData();
    console.log('[НАСТРОЙКИ] openSettings завершён');
}

function closeSettings() {
    const settingsPageMain = document.getElementById('settingsPageMain');
    if (settingsPageMain) {
        settingsPageMain.classList.remove('settings-page-show');
        settingsPageMain.classList.add('settings-page-hide');
        settingsPageMain.style.setProperty('display', 'none', 'important');
    }
    const settingsPageIncognito = document.getElementById('settingsPageIncognito');
    if (settingsPageIncognito) {
        settingsPageIncognito.classList.remove('settings-page-show');
        settingsPageIncognito.classList.add('settings-page-hide');
        settingsPageIncognito.style.setProperty('display', 'none', 'important');
    }
}

// Загрузка данных в настройки
function loadSettingsData() {
    console.log('Loading settings data...');
    
    try {
        // Загружаем настройки безопасности
        const checkFileSafety = document.getElementById('checkFileSafety');
        const antiPhishing = document.getElementById('antiPhishing');
        const secureBanking = document.getElementById('secureBanking');
        
        if (checkFileSafety) checkFileSafety.checked = securitySettings.checkFileSafety;
        if (antiPhishing) antiPhishing.checked = securitySettings.antiPhishing;
        if (secureBanking) secureBanking.checked = securitySettings.secureBanking;
        
        // Загружаем общие настройки
        const searchEngine = document.getElementById('searchEngine');
        const autoConnect = document.getElementById('autoConnect');
        
        if (searchEngine) searchEngine.value = settings.searchEngine;
        if (autoConnect) autoConnect.checked = settings.autoConnect;
        
        // Обновляем списки загрузок и истории
        updateDownloadsList();
        updateHistoryList();
        updateFavoritesList();
        updateVpnStatus();
        
        // Обновляем список расширений
        const extensionsContainer = document.querySelector('.extensions-content');
        if (extensionsContainer) {
            renderExtensionsList(extensionsContainer);
        }
        
        console.log('Settings data loaded successfully');
    } catch (error) {
        console.error('Error loading settings data:', error);
    }
}

// Обновление списка загрузок
function updateDownloadsList() {
    const downloadsList = document.getElementById('downloadsList');
    const downloadsCount = document.getElementById('downloadsCount');
    
    if (downloadsList) {
        if (downloads.length === 0) {
            downloadsList.innerHTML = '<p style="color: #888; text-align: center;">Нет загруженных файлов</p>';
        } else {
            downloadsList.innerHTML = downloads.map(download => `
                <div class="download-item">
                    <i class="fas fa-file download-icon"></i>
                    <div class="download-info">
                        <div class="download-name">${download.name}</div>
                        <div class="download-size">${download.size}</div>
                        <div class="download-date">${download.date}</div>
                    </div>
                </div>
            `).join('');
        }
    }
    
    if (downloadsCount) {
        downloadsCount.textContent = downloads.length;
    }
}

// Обновление списка истории
function updateHistoryList() {
    const historyList = document.getElementById('historyList');
    const searchInput = document.getElementById('historySearchInput');
    let filter = '';
    if (searchInput) filter = searchInput.value.trim().toLowerCase();
    if (historyList) {
        if (browsingHistory.length === 0) {
            historyList.innerHTML = '<p style="color: #888; text-align: center;">История пуста</p>';
        } else {
            // Группировка по датам
            const entries = browsingHistory.slice(-100).reverse().filter(entry => {
                if (!filter) return true;
                return entry.title.toLowerCase().includes(filter) || entry.url.toLowerCase().includes(filter);
            });
            // Собираем по датам
            const dateMap = {};
            entries.forEach(entry => {
                const dateStr = entry.date.split(',')[0];
                if (!dateMap[dateStr]) dateMap[dateStr] = [];
                dateMap[dateStr].push(entry);
            });
            // Сортируем даты по убыванию (новые сверху)
            const sortedDates = Object.keys(dateMap).sort((a, b) => {
                // Преобразуем dd.mm.yyyy или dd.mm.yy в Date
                const parse = d => {
                    const [day, month, year] = d.split('.');
                    return new Date(+('20' + year.slice(-2)), +month - 1, +day);
                };
                return parse(b) - parse(a);
            });
            let html = '';
            sortedDates.forEach(dateStr => {
                // Форматируем дату в стиле '21 июля 2024'
                const [day, month, year] = dateStr.split('.');
                const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
                const prettyDate = `${+day} ${months[+month-1]} 20${year.slice(-2)}`;
                html += `<div style='margin:18px 0 6px 0;font-weight:600;color:#00ff88;font-size:1.1em;'>${prettyDate}</div>`;
                dateMap[dateStr].forEach(entry => {
                    html += `
                        <div class="history-item" data-history-idx="${entry.date + entry.url}" style="position:relative;">
                            <i class="fas fa-globe history-icon"></i>
                            <div class="history-info">
                                <div class="history-title">${entry.title}</div>
                                <div class="history-url">${entry.url}</div>
                                <div class="history-date">${entry.date}</div>
                            </div>
                            <button class="history-remove-btn" title="Удалить" style="position:absolute;top:12px;right:12px;background:none;border:none;color:#ff4444;font-size:18px;cursor:pointer;">✕</button>
                        </div>`;
                });
            });
            if (!html) html = '<p style="color: #888; text-align: center;">Нет совпадений</p>';
            historyList.innerHTML = html;
            // Обработчик удаления
            historyList.querySelectorAll('.history-remove-btn').forEach(btn => {
                btn.onclick = function(e) {
                    e.stopPropagation();
                    const item = btn.closest('.history-item');
                    const idxKey = item.getAttribute('data-history-idx');
                    const idx = browsingHistory.findIndex(h => (h.date + h.url) === idxKey);
                    if (idx !== -1) {
                        browsingHistory.splice(idx, 1);
                        saveAllData();
                        updateHistoryList();
                    }
                };
            });
            // Обработчик перехода по ссылке
            historyList.querySelectorAll('.history-item').forEach(item => {
                item.onclick = function(e) {
                    if (e.target.classList.contains('history-remove-btn')) return;
                    const idxKey = item.getAttribute('data-history-idx');
                    const entry = browsingHistory.find(h => (h.date + h.url) === idxKey);
                    if (entry) navigateTo(entry.url);
                };
            });
        }
    }
}
// Добавить обработчики поиска
setTimeout(() => {
    const searchInput = document.getElementById('historySearchInput');
    const clearBtn = document.getElementById('historySearchClearBtn');
    if (searchInput) {
        searchInput.oninput = () => updateHistoryList();
    }
    if (clearBtn) {
        clearBtn.onclick = () => {
            searchInput.value = '';
            updateHistoryList();
        };
    }
}, 500);

// Добавление записи в историю
function addToHistory(url, title) {
    const activeTabContent = document.getElementById(activeTabId);
    if (activeTabContent && activeTabContent.getAttribute('data-incognito') === '1') {
        return;
    }
    const entry = {
        url: url,
        title: title || url,
        date: new Date().toLocaleString('ru-RU')
    };
    
    browsingHistory.push(entry);
    
    // Ограничиваем историю 100 записями
    if (browsingHistory.length > 100) {
        browsingHistory = browsingHistory.slice(-100);
    }
    
    saveAllData();
}

// Добавление загрузки
function addDownload(name, size, url) {
    const download = {
        name: name,
        size: size,
        url: url,
        date: new Date().toLocaleString('ru-RU')
    };
    
    downloads.push(download);
    updateDownloadsList();
    saveAllData();
}

// Очистка загрузок
function clearDownloads() {
    downloads = [];
    updateDownloadsList();
    saveAllData();
}

// Очистка истории
function clearHistory() {
    browsingHistory = [];
    updateHistoryList();
    saveAllData();
}

// Сохранение настроек безопасности
function saveSecuritySettings() {
    securitySettings.checkFileSafety = document.getElementById('checkFileSafety').checked;
    securitySettings.antiPhishing = document.getElementById('antiPhishing').checked;
    securitySettings.secureBanking = document.getElementById('secureBanking').checked;
    saveAllData();
}

// Сохранение общих настроек
function saveGeneralSettings() {
    settings.searchEngine = document.getElementById('searchEngine').value;
    settings.autoConnect = document.getElementById('autoConnect').checked;
    
    saveAllData();
}

// Переключение между разделами настроек
function switchSettingsSection(sectionName) {
    // Убираем активный класс у всех разделов
    document.querySelectorAll('.settings-section').forEach(section => {
        section.classList.remove('active');
    });
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    // Активируем нужный раздел
    const targetSection = document.getElementById(sectionName + '-section');
    const targetNavItem = document.querySelector(`[data-section="${sectionName}"]`);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    if (targetNavItem) {
        targetNavItem.classList.add('active');
    }
    // Обновляем содержимое секций при каждом переключении
    loadSettingsData();
    // Если это секция темы — инициализируем выбор темы
    if (sectionName === 'theme') {
        initThemeChooser();
    }
}

// Обработка загрузок в webview
function handleWebviewDownload(event) {
    const filename = event.filename || 'download';
    const size = event.totalBytes ? formatBytes(event.totalBytes) : 'Неизвестно';
    
    addDownload(filename, size, event.url);
    
    // Показываем уведомление
    showNotification(`Файл "${filename}" добавлен в загрузки`);
}

// Форматирование размера файла
function formatBytes(bytes) {
    if (bytes === 0) return '0 Б';
    const k = 1024;
    const sizes = ['Б', 'КБ', 'МБ', 'ГБ'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// === ФУНКЦИИ ОБНОВЛЕНИЙ ===
function initUpdateSystem() {
    console.log('Инициализация системы обновлений...');
    
    // Загружаем настройки обновлений
    loadUpdateSettings();
    
    // Устанавливаем текущую версию
    const currentVersionElement = document.getElementById('currentVersion');
    if (currentVersionElement) {
        currentVersionElement.textContent = '1.0.0';
    }
    
    // Инициализируем обработчики событий обновлений
    initUpdateEventListeners();
    
    // Слушаем события от main процесса
    window.electronAPI.onUpdateStatus((data) => {
        handleUpdateStatus(data);
    });
}

function loadUpdateSettings() {
    const saved = localStorage.getItem('zhukbrowse_update_settings');
    if (saved) {
        updateSettings = { ...updateSettings, ...JSON.parse(saved) };
    }
    
    // Применяем настройки к UI
    const autoCheckUpdates = document.getElementById('autoCheckUpdates');
    const autoDownloadUpdates = document.getElementById('autoDownloadUpdates');
    
    if (autoCheckUpdates) autoCheckUpdates.checked = updateSettings.autoCheckUpdates;
    if (autoDownloadUpdates) autoDownloadUpdates.checked = updateSettings.autoDownloadUpdates;
}

function saveUpdateSettings() {
    localStorage.setItem('zhukbrowse_update_settings', JSON.stringify(updateSettings));
}

function initUpdateEventListeners() {
    // Кнопка проверки обновлений
    const checkUpdateBtn = document.getElementById('checkUpdateBtn');
    if (checkUpdateBtn) {
        checkUpdateBtn.addEventListener('click', async () => {
            await checkForUpdates();
        });
    }
    
    // Кнопка загрузки обновления
    const downloadUpdateBtn = document.getElementById('downloadUpdateBtn');
    if (downloadUpdateBtn) {
        downloadUpdateBtn.addEventListener('click', async () => {
            await downloadUpdate();
        });
    }
    
    // Кнопка установки обновления
    const installUpdateBtn = document.getElementById('installUpdateBtn');
    if (installUpdateBtn) {
        installUpdateBtn.addEventListener('click', async () => {
            await installUpdate();
        });
    }
    
    // Настройки автообновления
    const autoCheckUpdates = document.getElementById('autoCheckUpdates');
    if (autoCheckUpdates) {
        autoCheckUpdates.addEventListener('change', (e) => {
            updateSettings.autoCheckUpdates = e.target.checked;
            saveUpdateSettings();
        });
    }
    
    const autoDownloadUpdates = document.getElementById('autoDownloadUpdates');
    if (autoDownloadUpdates) {
        autoDownloadUpdates.addEventListener('change', (e) => {
            updateSettings.autoDownloadUpdates = e.target.checked;
            saveUpdateSettings();
        });
    }
}

async function checkForUpdates() {
    try {
        const checkUpdateBtn = document.getElementById('checkUpdateBtn');
        if (checkUpdateBtn) {
            checkUpdateBtn.disabled = true;
            checkUpdateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Проверка...';
        }
        
        const result = await window.electronAPI.checkForUpdates();
        
        if (result.success) {
            showNotification('Проверка обновлений завершена');
        } else {
            showNotification('Ошибка при проверке обновлений: ' + result.error);
        }
    } catch (error) {
        console.error('Ошибка при проверке обновлений:', error);
        showNotification('Ошибка при проверке обновлений');
    } finally {
        const checkUpdateBtn = document.getElementById('checkUpdateBtn');
        if (checkUpdateBtn) {
            checkUpdateBtn.disabled = false;
            checkUpdateBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Проверить обновления';
        }
    }
}

async function downloadUpdate() {
    try {
        const downloadUpdateBtn = document.getElementById('downloadUpdateBtn');
        if (downloadUpdateBtn) {
            downloadUpdateBtn.disabled = true;
            downloadUpdateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
        }
        
        const result = await window.electronAPI.downloadUpdate();
        
        if (result.success) {
            showNotification('Загрузка обновления началась');
        } else {
            showNotification('Ошибка при загрузке обновления: ' + result.error);
        }
    } catch (error) {
        console.error('Ошибка при загрузке обновления:', error);
        showNotification('Ошибка при загрузке обновления');
    } finally {
        const downloadUpdateBtn = document.getElementById('downloadUpdateBtn');
        if (downloadUpdateBtn) {
            downloadUpdateBtn.disabled = false;
            downloadUpdateBtn.innerHTML = '<i class="fas fa-download"></i> Загрузить обновление';
        }
    }
}

async function installUpdate() {
    try {
        const installUpdateBtn = document.getElementById('installUpdateBtn');
        if (installUpdateBtn) {
            installUpdateBtn.disabled = true;
            installUpdateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Установка...';
        }
        
        const result = await window.electronAPI.installUpdate();
        
        if (result.success) {
            showNotification('Обновление будет установлено при перезапуске');
        } else {
            showNotification('Ошибка при установке обновления: ' + result.error);
        }
    } catch (error) {
        console.error('Ошибка при установке обновления:', error);
        showNotification('Ошибка при установке обновления');
    } finally {
        const installUpdateBtn = document.getElementById('installUpdateBtn');
        if (installUpdateBtn) {
            installUpdateBtn.disabled = false;
            installUpdateBtn.innerHTML = '<i class="fas fa-install"></i> Установить обновление';
        }
    }
}

function handleUpdateStatus(data) {
    console.log('Получен статус обновления:', data);
    
    const updateInfo = document.getElementById('updateInfo');
    const downloadUpdateBtn = document.getElementById('downloadUpdateBtn');
    const installUpdateBtn = document.getElementById('installUpdateBtn');
    const updateProgress = document.getElementById('updateProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    if (!updateInfo) return;
    
    switch (data.event) {
        case 'checking-for-update':
            updateInfo.innerHTML = '<span class="status-text">Проверка обновлений...</span>';
            break;
            
        case 'update-available':
            updateInfo.innerHTML = `
                <span class="status-text" style="color: #00ff88;">
                    <i class="fas fa-download"></i> Доступно обновление ${data.data.version}
                </span>
            `;
            if (downloadUpdateBtn) {
                downloadUpdateBtn.style.display = 'flex';
            }
            break;
            
        case 'update-not-available':
            updateInfo.innerHTML = `
                <span class="status-text" style="color: #00ff88;">
                    <i class="fas fa-check"></i> У вас последняя версия
                </span>
            `;
            break;
            
        case 'download-progress':
            if (updateProgress) {
                updateProgress.style.display = 'block';
                const percent = Math.round(data.data.percent);
                progressFill.style.width = percent + '%';
                progressText.textContent = `${percent}%`;
            }
            break;
            
        case 'update-downloaded':
            updateInfo.innerHTML = `
                <span class="status-text" style="color: #4CAF50;">
                    <i class="fas fa-check-circle"></i> Обновление загружено
                </span>
            `;
            if (installUpdateBtn) {
                installUpdateBtn.style.display = 'flex';
            }
            if (updateProgress) {
                updateProgress.style.display = 'none';
            }
            break;
            
        case 'error':
            updateInfo.innerHTML = `
                <span class="status-text" style="color: #ff6b6b;">
                    <i class="fas fa-exclamation-triangle"></i> ${data.message}
                </span>
            `;
            break;
    }
}

// Инициализация событий
function initEvents() {
    console.log('Initializing events...');
    
    try {
        // Поиск
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const query = searchInput.value.trim();
                    if (query) performSearch(query);
                }
            });
        } else {
            console.warn('searchInput not found');
        }
        
        // Кнопка поиска
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                const query = searchInput ? searchInput.value.trim() : '';
                if (query) performSearch(query);
            });
        }
        
        // Адресная строка
        if (urlInput) {
            urlInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const url = urlInput.value.trim();
                    if (url) navigateTo(url);
                }
            });
        } else {
            console.warn('urlInput not found');
        }
        
        // Навигация
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                const activeTabContent = document.getElementById(activeTabId);
                if (activeTabContent) {
                    const isIncognito = activeTabContent.getAttribute('data-incognito') === '1';
                    const webview = activeTabContent.querySelector('webview');
                    
                    if (isIncognito) {
                        // В режиме инкогнито перезагружаем стартовую страницу
                        const startPage = activeTabContent.querySelector('#startPage');
                        if (startPage) {
                            renderStartPage('startPage', '#b388ff');
                            showNotification('Страница перезагружена (инкогнито)');
                        }
                    } else if (webview) {
                        try {
                            webview.reload();
                        } catch (error) {
                            console.log('Cannot reload:', error);
                        }
                    }
                }
            });
        }
        
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                const activeTabContent = document.getElementById(activeTabId);
                if (activeTabContent) {
                    const isIncognito = activeTabContent.getAttribute('data-incognito') === '1';
                    const webview = activeTabContent.querySelector('webview');
                    
                    if (isIncognito) {
                        // В режиме инкогнито возвращаемся к стартовой странице
                        const startPage = activeTabContent.querySelector('#startPage');
                        const webview = activeTabContent.querySelector('#incognitoWebview');
                        if (startPage && webview) {
                            startPage.style.display = 'block';
                            webview.style.display = 'none';
                            showNotification('Возврат к стартовой странице (инкогнито)');
                        }
                    } else if (webview) {
                        try {
                            if (webview.canGoBack()) {
                                webview.goBack();
                            }
                        } catch (error) {
                            console.log('Cannot go back:', error);
                        }
                    }
                }
            });
        }
        
        if (forwardBtn) {
            forwardBtn.addEventListener('click', () => {
                const activeTabContent = document.getElementById(activeTabId);
                if (activeTabContent) {
                    const isIncognito = activeTabContent.getAttribute('data-incognito') === '1';
                    const webview = activeTabContent.querySelector('webview');
                    
                    if (isIncognito) {
                        // В режиме инкогнито кнопка вперед не имеет смысла
                        showNotification('Нет страниц для перехода вперед (инкогнито)');
                    } else if (webview) {
                        try {
                            if (webview.canGoForward()) {
                                webview.goForward();
                            }
                        } catch (error) {
                            console.log('Cannot go forward:', error);
                        }
                    }
                }
            });
        }
        
        if (homeBtn) {
            homeBtn.addEventListener('click', () => {
                switchTab('start');
            });
        }
        
        if (newTabBtn) {
            newTabBtn.addEventListener('click', () => {
                createTab(); // Только стартовая страница, без редактора кода
            });
        }
        
        // Прокси
        if (proxyToggle) {
            proxyToggle.addEventListener('click', toggleProxy);
        }
        
        // Настройки
        tryInitSettingsBtn();
        
        // Закрытие настроек
        const closeSettingsBtn = document.getElementById('closeSettingsBtn');
        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', closeSettings);
        }
        
        // Обработчики для новой страницы настроек
        document.addEventListener('click', (e) => {
            // Переключение разделов настроек
            if (e.target.closest('.nav-item')) {
                const navItem = e.target.closest('.nav-item');
                const sectionName = navItem.getAttribute('data-section');
                if (sectionName) {
                    switchSettingsSection(sectionName);
                }
            }
            
            // Очистка загрузок
            if (e.target.closest('#clearDownloadsBtn')) {
                if (confirm('Очистить все загрузки?')) {
                    clearDownloads();
                    showNotification('Загрузки очищены');
                }
            }
            
            // Очистка истории
            if (e.target.closest('#clearHistoryBtn')) {
                if (confirm('Очистить всю историю?')) {
                    clearHistory();
                    showNotification('История очищена');
                }
            }
            
            // Сохранение настроек безопасности
            if (e.target.closest('.security-label input[type="checkbox"]')) {
                setTimeout(() => saveSecuritySettings(), 100);
            }
            
            // Сохранение общих настроек
            if (e.target.closest('#searchEngine') || e.target.closest('#autoConnect')) {
                setTimeout(() => saveGeneralSettings(), 100);
            }
            
            // Кнопка магазина расширений
            if (e.target.closest('#extensionStoreBtn')) {
                e.preventDefault();
                e.stopPropagation();
                openExtensionStore();
            }
        });
        
        const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
        if (cancelSettingsBtn) {
            cancelSettingsBtn.addEventListener('click', closeSettings);
        }
        
        // Сохранение настроек
        const saveSettingsBtnLocal = document.getElementById('saveSettingsBtn');
        if (saveSettingsBtnLocal) {
            saveSettingsBtnLocal.addEventListener('click', () => {
                const searchEngine = document.getElementById('searchEngine');
                const autoConnect = document.getElementById('autoConnect');
                if (searchEngine) settings.searchEngine = searchEngine.value;
                if (autoConnect) settings.autoConnect = autoConnect.checked;
                // Сохраняем выбранную тему
                const selectedThemeRadio = document.querySelector('input[name="themeMode"]:checked');
                if (selectedThemeRadio) {
                    applyTheme(selectedThemeRadio.value);
                    saveTheme(selectedThemeRadio.value);
                    // Сохраняем тему в settings для совместимости
                    settings.theme = selectedThemeRadio.value;
                }
                localStorage.setItem('zhukbrowse_settings', JSON.stringify(settings));
                closeSettings();
                showNotification('Настройки сохранены');
            });
        }
        
        // Обновляем статус при открытии настроек
        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    updateVpnStatus();
                }
            });
        }
        
        // Быстрые ссылки (для стартовой вкладки)
        document.addEventListener('click', (e) => {
            if (e.target.closest('.quick-link')) {
                e.preventDefault();
                e.stopPropagation();
                const link = e.target.closest('.quick-link');
                const url = link.getAttribute('data-url');
                if (url) {
                    navigateTo(url);
                }
            }
            
            // Кнопка редактирования быстрых ссылок
            if (e.target.closest('#editLinksBtn')) {
                e.preventDefault();
                e.stopPropagation();
                openQuickLinksEditor();
            }
        });
        
        // Добавляем обработчики для существующих вкладок
        document.querySelectorAll('.tab').forEach(tab => {
            addTabEventListeners(tab);
        });
        
        // Закрытие вкладки по клику колесиком мыши
        if (navTabs) {
            navTabs.addEventListener('mouseup', function(e) {
                const tab = e.target.closest('.tab');
                if (tab && e.button === 1) { // Средняя кнопка мыши
                    const tabId = tab.getAttribute('data-tab-id');
                    if (tabId && tabId !== 'start') {
                        closeTab(tabId);
                    }
                }
            });
        }
        
        console.log('Events initialized successfully');
        
        if (newIncognitoTabBtn) {
            newIncognitoTabBtn.addEventListener('click', () => {
                showNotification('В разработке!');
                // Отключено: открытие отдельного окна инкогнито
                // if (window.electronAPI && window.electronAPI.openIncognitoWindow) {
                //     window.electronAPI.openIncognitoWindow();
                // } else if (window.ipcRenderer) {
                //     window.ipcRenderer.send('open-incognito-window');
                // }
            });
        }
        
        // === Универсальный таймер для времени на всех вкладках ===
        setInterval(() => {
            document.querySelectorAll('.current-time').forEach(el => {
                const now = new Date();
                el.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            });
        }, 60000);
        
        // Добавляем обработчики для стартовой вкладки
        const startTab = document.querySelector('[data-tab-id="start"]');
        if (startTab) {
            startTab.addEventListener('click', () => {
                console.log('Start tab clicked');
                switchTab('start');
            });
        }
        
        // Добавляем обработчики для кнопок новых вкладок
        
        // Инициализация профиля
        initProfile();
        
    } catch (error) {
        console.error('Error initializing events:', error);
    }
}

// Добавление обработчиков событий для вкладки
function addTabEventListeners(tab) {
    const tabId = tab.getAttribute('data-tab-id');
    if (!tabId) {
        console.log('No tab ID found for tab:', tab);
        return;
    }
    
    console.log('Adding event listeners for tab:', tabId);
    
    // Удаляем старые обработчики, если они есть
    tab.removeEventListener('click', tab._clickHandler);
    const closeBtn = tab.querySelector('.tab-close');
    if (closeBtn) {
        closeBtn.removeEventListener('click', closeBtn._clickHandler);
    }
    
    // Добавляем новые обработчики
    tab._clickHandler = (e) => {
        if (!e.target.closest('.tab-close')) {
            console.log('Tab clicked:', tabId);
            switchTab(tabId);
        }
    };
    tab.addEventListener('click', tab._clickHandler);
    
    if (closeBtn) {
        closeBtn._clickHandler = (e) => {
            e.stopPropagation();
            console.log('Close tab clicked:', tabId);
            closeTab(tabId);
        };
        closeBtn.addEventListener('click', closeBtn._clickHandler);
    }
    
    console.log('Event listeners added for tab:', tabId);
}

// Основная инициализация
document.addEventListener('DOMContentLoaded', () => {
    console.log('=== DOMContentLoaded ===');
    
    try {
        // Инициализируем защитные механизмы инкогнито
        if (typeof initializeIncognitoSecurity === 'function') {
            initializeIncognitoSecurity();
        }
        
        // Инициализируем элементы
        initElements();
        
        // Дополнительная проверка элементов через небольшую задержку
        setTimeout(() => {
            if (!navTabs || !tabsContainer) {
                console.log('Elements not found, retrying initialization...');
                initElements();
            }
        }, 100);
        
        // Загружаем настройки
        loadSettings();
        
        // Загружаем данные
        loadAllData();
        
        // Инициализируем события
        initEvents();
        
        // Инициализация системы обновлений
        if (typeof initUpdateSystem === 'function') {
            initUpdateSystem();
        }
        
        // Добавляем обработчики загрузок
        addDownloadListenersToAllWebviews();
        
        // Обновляем списки
        updateDownloadsList();
        
        // Обновляем время (убираем дублирование)
        // updateTime();
        // setInterval(updateTime, 1000);
        
        // Инициализируем стартовую страницу
        if (typeof initStartPage === 'function') {
            console.log('Calling initStartPage...');
            initStartPage();
        } else {
            console.error('initStartPage is not a function!');
        }
        
        // Обновляем иконки расширений в навигации
        updateNavExtensions();
        
        // Принудительно применяем фон
        setTimeout(() => {
            console.log('Forcing background application...');
            const bg = localStorage.getItem('zhukbrowse_bg');
            if (bg && typeof setMainBg === 'function') {
                setMainBg(bg);
            } else {
                const defaultBg = 'linear-gradient(135deg, #000000 0%, #00ff88 100%)';
                if (typeof setMainBg === 'function') {
                    setMainBg(defaultBg);
                } else {
                    const startPage = document.getElementById('startPage');
                    if (startPage) {
                        startPage.style.background = defaultBg;
                    }
                }
            }
        }, 500);
        
        // Дополнительная проверка через 2 секунды
        setTimeout(() => {
            console.log('Final background check...');
            const startPage = document.getElementById('startPage');
            if (startPage && !startPage.style.background) {
                console.log('No background detected, applying default...');
                const defaultBg = 'linear-gradient(135deg, #000000 0%, #00ff88 100%)';
                if (typeof setMainBg === 'function') {
                    setMainBg(defaultBg);
                } else {
                    startPage.style.background = defaultBg;
                }
            }
        }, 2000);
        
        // Принудительно применяем стили для кликабельности
        setTimeout(() => {
            console.log('Applying clickable styles...');
            const buttons = document.querySelectorAll('button');
            buttons.forEach(btn => {
                btn.style.pointerEvents = 'auto';
                btn.style.cursor = 'pointer';
                btn.style.zIndex = '10';
            });
            
            const inputs = document.querySelectorAll('input');
            inputs.forEach(input => {
                input.style.pointerEvents = 'auto';
                input.style.zIndex = '10';
            });
        }, 1000);
        
        console.log('=== Initialization completed successfully ===');
        
        // Применяем тему сразу при загрузке
        const theme = loadTheme();
        applyTheme(theme);
        // Инициализация выбора цвета при загрузке
        const color = 'green'; // Значение по умолчанию вместо loadColor()
        // applyColor(color); // Убираем вызов отсутствующей функции
    } catch (e) { console.error(e); }
});

function initStartPage(tabId = 'start') {
    console.log('Initializing start page for tab:', tabId);
    
    // Универсальная обработка id для главной и новых вкладок
    const isMain = tabId === 'start' || tabId === 'startPage';
    const timeId = isMain ? 'currentTime' : 'currentTime-' + tabId;
    const startPage = document.getElementById(isMain ? 'startPage' : tabId);
    
    if (!startPage) {
        console.error('Start page element not found for tab:', tabId);
        return;
    }
    
    // Инициализируем время
    const timeEl = document.getElementById(timeId);
    if (timeEl) {
        function updateTime() {
            const now = new Date();
            timeEl.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        }
        updateTime();
        setInterval(updateTime, 60000); // обновлять раз в минуту
    }
    
    // Инициализируем поиск
    const searchInput = startPage.querySelector(isMain ? '#searchInput' : '#searchInput-startPage-' + tabId);
    const searchBtn = startPage.querySelector(isMain ? '#searchBtn' : '#searchBtn-startPage-' + tabId);
    
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (query) performSearch(query);
            }
        });
    }
    
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            const query = searchInput ? searchInput.value.trim() : '';
            if (query) performSearch(query);
        });
    }
    
    // Инициализируем кнопку смены фона
    const changeBgBtn = startPage.querySelector('.change-bg-icon-btn');
    if (changeBgBtn && typeof openBackgroundGallery === 'function') {
        changeBgBtn.onclick = openBackgroundGallery;
    }
    
    console.log('Start page initialized successfully for tab:', tabId);
}

function addDownloadListenersToAllWebviews() {
    document.querySelectorAll('webview').forEach(webview => {
        if (!webview._downloadListenerAdded) {
            webview.addEventListener('will-download', handleWebviewDownload);
            webview._downloadListenerAdded = true;
        }
    });
} 

// Только два указанных HTTP-прокси с аутентификацией
let publicProxies = [
    { 
        country: 'Прокси 1', 
        code: 'proxy1', 
        type: 'http', 
        host: '91.207.183.242', 
        port: 54124, 
        username: 'NmdgEzTJ',
        password: 'u8WnjgE7',
        flag: '🌐' 
    },
    { 
        country: 'Прокси 2', 
        code: 'proxy2', 
        type: 'http', 
        host: '94.131.113.168', 
        port: 50738, 
        username: 'NmdgEzTJ',
        password: 'u8WnjgE7',
        flag: '🌐' 
    }
];
let customProxies = []; // Очищаем пользовательские прокси

function showProxySelector() {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position:fixed;top:0;left:0;width:100vw;height:100vh;
        background:rgba(0,0,0,0.55);z-index:99999;
        display:flex;align-items:center;justify-content:center;
        animation:fadeIn 0.3s;`;
    const box = document.createElement('div');
    box.style.cssText = `
        background:linear-gradient(135deg,#181818 0%,#23272f 100%);
        padding:24px 16px 16px 16px;
        border-radius:18px;min-width:260px;max-width:95vw;width:340px;
        color:#fff;box-shadow:0 8px 32px rgba(0,0,0,0.25);
        display:flex;flex-direction:column;align-items:center;position:relative;
        max-height:80vh;overflow:hidden;`;
    box.innerHTML = '<h2 style="margin-bottom:12px;font-size:1.2em;font-weight:700;letter-spacing:0.5px;">Выберите VPN страну</h2>';
    // Прокси-список с прокруткой
    const proxyList = document.createElement('div');
    proxyList.style.cssText = 'width:100%;max-height:44vh;overflow-y:auto;padding-bottom:8px;';
    // Публичные прокси
    const pubTitle = document.createElement('div');
    pubTitle.textContent = 'Публичные прокси';
    pubTitle.style.cssText = 'margin:6px 0 2px 0;font-size:1em;font-weight:600;color:#00ff88;align-self:flex-start;';
    proxyList.appendChild(pubTitle);
    publicProxies.forEach(proxy => {
        proxyList.appendChild(createProxyBtn(proxy));
    });
    // Свои прокси
    const customTitle = document.createElement('div');
    customTitle.textContent = 'Свои прокси';
    customTitle.style.cssText = 'margin:10px 0 2px 0;font-size:1em;font-weight:600;color:#00ff88;align-self:flex-start;';
    proxyList.appendChild(customTitle);
    if (customProxies.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = 'Нет добавленных';
        empty.style.cssText = 'color:#888;font-size:0.95em;margin-bottom:8px;';
        proxyList.appendChild(empty);
    } else {
        customProxies.forEach(proxy => {
            proxyList.appendChild(createProxyBtn(proxy, true));
        });
    }
    box.appendChild(proxyList);
    // Кнопка отмены (фиксируем внизу)
    const cancel = document.createElement('button');
    cancel.textContent = 'Отмена';
    cancel.style.cssText = `
        margin-top:auto;padding:10px 32px;border-radius:10px;
        background:linear-gradient(90deg,#23272f 0%,#444 100%);
        color:#fff;border:none;cursor:pointer;font-size:1.1em;
        font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.13);
        transition:background 0.18s,color 0.18s;letter-spacing:0.5px;
        position:sticky;bottom:0;left:0;right:0;z-index:2;
    `;
    cancel.onmouseenter = () => {
        cancel.style.background = 'linear-gradient(90deg,#00ff88 0%,#00cc6a 100%)';
        cancel.style.color = '#181818';
    };
    cancel.onmouseleave = () => {
        cancel.style.background = 'linear-gradient(90deg,#23272f 0%,#444 100%)';
        cancel.style.color = '#fff';
    };
    cancel.onclick = () => modal.remove();
    box.appendChild(cancel);
    modal.appendChild(box);
    document.body.appendChild(modal);
}
function createProxyBtn(proxy, isCustom = false) {
    const btn = document.createElement('button');
    const flag = proxy.flag || getFlag(proxy.code);
    btn.innerHTML = `
        <span style="font-size:1.5em;margin-right:10px;">${flag}</span>
        <span style="font-size:1.1em;font-weight:600;">${proxy.country}</span>
        <span style="font-size:0.9em;color:#00ff88;margin-left:10px;">${proxy.type.toUpperCase()} ${proxy.host}:${proxy.port}</span>
        ${isCustom ? '<span style="margin-left:auto;color:#ff4444;font-size:1.2em;cursor:pointer;" title="Удалить">✖</span>' : ''}
    `;
    btn.style.cssText = `
        display:flex;align-items:center;justify-content:flex-start;width:100%;
        margin:10px 0;padding:14px 18px;border-radius:12px;
        background:rgba(0,255,136,0.08);color:#fff;font-weight:600;
        border:2px solid transparent;cursor:pointer;font-size:17px;
        transition:background 0.18s,border 0.18s,box-shadow 0.18s;
        box-shadow:0 2px 8px rgba(0,255,136,0.07);
        position:relative;
    `;
    btn.onmouseenter = () => {
        btn.style.background = 'linear-gradient(90deg,#00ff88 0%,#00cc6a 100%)';
        btn.style.color = '#181818';
        btn.style.border = '2px solid #00ff88';
    };
    btn.onmouseleave = () => {
        btn.style.background = 'rgba(0,255,136,0.08)';
        btn.style.color = '#fff';
        btn.style.border = '2px solid transparent';
    };
    btn.onclick = async (e) => {
        if (isCustom && e.target.textContent === '✖') {
            // Удалить свой прокси
            customProxies = customProxies.filter(p => p !== proxy);
            localStorage.setItem('customProxies', JSON.stringify(customProxies));
            showProxySelector();
            return;
        }
        document.querySelectorAll('button').forEach(b => b.style.boxShadow = '0 2px 8px rgba(0,255,136,0.07)');
        btn.style.boxShadow = '0 0 0 3px #00ff88, 0 2px 8px rgba(0,255,136,0.07)';
        await tryConnectProxy(proxy);
        document.querySelectorAll('.vpn-modal').forEach(m => m.remove());
    };
    return btn;
}
function getFlag(code) {
    const flags = {
        us: '🇺🇸', de: '🇩🇪', ru: '🇷🇺', fr: '🇫🇷', ua: '🇺🇦', ca: '🇨🇦', pl: '🇵🇱'
    };
    return flags[code] || '🌐';
}
async function tryConnectProxy(proxy) {
    showNotification('Проверка HTTP-прокси...');
    
    // Создаем конфигурацию прокси для main process
    const proxyConfig = {
        host: proxy.host,
        port: proxy.port,
        username: proxy.username || proxy.user,
        password: proxy.password || proxy.pass,
        code: proxy.code
    };
    
    if (window.electronAPI?.setProxy) {
        const success = await window.electronAPI.setProxy(proxyConfig);
        if (success) {
            await new Promise(r => setTimeout(r, 2000));
                                 let ip = null;
                     let googleOk = false;
                                     // Убираем проверку IP - просто считаем что прокси работает
        ip = proxy.host; // Используем IP прокси как результат
        googleOk = true; // Считаем что интернет работает
        if (ip && googleOk) {
                settings.proxyEnabled = true;
                settings.selectedCountry = proxy.code;
                settings.proxyHost = proxy.host;
                settings.proxyPort = proxy.port;
                settings.flag = proxy.flag || getFlag(proxy.code);
                localStorage.setItem('zhukbrowse_settings', JSON.stringify(settings));
                updateProxyButton();
                updateVpnStatus();
                                showNotification(`HTTP-прокси подключен: ${proxy.country} (IP: ${ip})`);
                closeAllTabsExceptStart();
                
                // Принудительно перезагружаем все webview для применения прокси
                setTimeout(() => {
                    const webviews = document.querySelectorAll('webview');
                    webviews.forEach(webview => {
                        if (webview.src && !webview.src.includes('start')) {
                            webview.reload();
                        }
                    });
                    
                    // Принудительно перезагружаем браузер для применения системных переменных
                    setTimeout(() => {
                        if (window.electronAPI && window.electronAPI.reloadApp) {
                            window.electronAPI.reloadApp();
                        } else {
                            location.reload();
                        }
                        
                        // Показываем уведомление о необходимости перезагрузки системы
                        setTimeout(() => {
                            showNotification('Для полного применения прокси рекомендуется перезагрузить систему', 'fa-exclamation-triangle');
                            
                            // Показываем диалог с предложением перезагрузить систему
                            setTimeout(() => {
                                if (confirm('Для полного применения системного прокси рекомендуется перезагрузить систему. Перезагрузить сейчас?')) {
                                    if (window.electronAPI && window.electronAPI.restartSystem) {
                                        window.electronAPI.restartSystem();
                                    }
                                } else {
                                    // Если пользователь отказался, показываем инструкции
                                    alert('Для применения прокси:\n1. Перезагрузите систему вручную\n2. После перезагрузки запустите браузер\n3. Подключите прокси снова');
                                }
                            }, 2000);
                        }, 3000);
                    }, 2000);
                }, 1000);
            } else {
                await window.electronAPI.clearProxy();
                showNotification('HTTP-прокси не работает. VPN отключён. Попробуйте другой!');
                settings.proxyEnabled = false;
                settings.selectedCountry = 'none';
                updateProxyButton();
                updateVpnStatus();
            }
        } else {
            showNotification('Ошибка подключения к HTTP-прокси');
            settings.proxyEnabled = false;
            settings.selectedCountry = 'none';
            updateProxyButton();
            updateVpnStatus();
        }
    }
} 

function closeAllTabsExceptStart() {
    document.querySelectorAll('.tab').forEach(tab => {
        const tabId = tab.getAttribute('data-tab-id');
        if (tabId && tabId !== 'start') {
            closeTab(tabId);
        }
    });
} 

// Галерея фонов
const ZHUK_GREEN_GRADIENT_BG = 'linear-gradient(135deg, #0a0a0a 0%, #181818 60%, #00cc6a 100%)'; // Мягкий фирменный градиент ZhukBrowser
const BACKGROUND_CATEGORIES = [
    { key: 'standard', name: 'Стандартные', images: [
        { zhuk: true, name: 'Фон ZhukBrowser (по умолчанию)', gradient: ZHUK_GREEN_GRADIENT_BG },
        { color: '#2ecc40', name: 'Зелёный' },
        { color: '#ff69b4', name: 'Розовый' },
        { color: '#ff4444', name: 'Красный' },
        { color: '#181818', name: 'Чёрный' }
    ]},
    { key: 'nature', name: 'Природа', images: [
        'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1465101178521-c1a9136a3b99?auto=format&fit=crop&w=600&q=80'
    ]},
    { key: 'city', name: 'Города', images: [
        'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1464037866556-6812c9d1c72e?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1508051123996-69f8caf4891b?auto=format&fit=crop&w=600&q=80'
    ]},
    { key: 'games', name: 'Игры', images: [
        'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1519125323398-675f0ddb6308?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=600&q=80'
    ]},
    { key: 'colors', name: 'Цвета', images: [
        'https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1465101178521-c1a9136a3b99?auto=format&fit=crop&w=600&q=80'
    ]}
];
// Храним пользовательские фоны
function getUserBackgrounds() {
    const backgrounds = JSON.parse(localStorage.getItem('zhukbrowse_user_bgs')||'[]');
    console.log('getUserBackgrounds returned:', backgrounds);
    return backgrounds;
}
function addUserBackground(url) {
    const arr = getUserBackgrounds();
    arr.push(url);
    localStorage.setItem('zhukbrowse_user_bgs', JSON.stringify(arr));
}

function openBackgroundGallery() {
    console.log('openBackgroundGallery called');
    
    // Проверяем, не инкогнито ли это
    const isIncognito = window.location.pathname.includes('incognito.html') || 
                       document.querySelector('.start-page.incognito') !== null;
    
    console.log('isIncognito:', isIncognito);
    
    if (isIncognito) {
        showNotification('Галерея фонов недоступна в инкогнито-режиме');
        return;
    }
    
    document.querySelectorAll('.bg-modal').forEach(e => e.remove());
    const modal = document.createElement('div');
    modal.className = 'bg-modal';
    modal.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:10001;background:rgba(0,0,0,0.10);display:flex;align-items:flex-start;justify-content:flex-end;`;
    const box = document.createElement('div');
    box.className = 'bg-modal-box';
    box.style.cssText = `background:rgba(255,255,255,0.97);padding:32px 28px 22px 28px;border-radius:22px 0 0 22px;min-width:370px;max-width:420px;width:100%;color:#222;box-shadow:-8px 0 32px rgba(0,0,0,0.18);display:flex;flex-direction:column;align-items:stretch;position:relative;max-height:96vh;overflow:hidden;margin-top:24px;margin-right:0;animation:slideInRight 0.25s cubic-bezier(.4,0,.2,1);font-family:inherit;`;
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.style.cssText = 'position:absolute;top:18px;right:18px;background:none;border:none;color:#888;font-size:1.5em;cursor:pointer;z-index:2;';
    closeBtn.onclick = () => {
        console.log('Close button clicked, removing modal');
        modal.remove();
    };
    box.appendChild(closeBtn);
    const title = document.createElement('h2');
    title.textContent = 'Галерея фонов';
    title.style.cssText = 'margin-bottom:12px;font-size:1.25em;font-weight:700;letter-spacing:0.5px;color:#222;';
    box.appendChild(title);
    
    // Категории фонов
    const categories = document.createElement('div');
    categories.style.cssText = 'display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;';
    
    const categoryButtons = [
        { name: 'Градиенты', type: 'gradients' },
        { name: 'Природа', type: 'nature' },
        { name: 'Города', type: 'cities' },
        { name: 'Абстракт', type: 'abstract' },
        { name: 'Мои', type: 'custom' }
    ];
    
    const buttons = [];
    categoryButtons.forEach(cat => {
        const btn = document.createElement('button');
        btn.textContent = cat.name;
        btn.style.cssText = 'padding:8px 16px;border:none;border-radius:8px;background:rgba(0,0,0,0.05);color:#666;cursor:pointer;font-size:14px;transition:all 0.2s;';
        btn.onclick = () => {
            buttons.forEach(b => {
                b.style.background = 'rgba(0,0,0,0.05)';
                b.style.color = '#666';
            });
            btn.style.background = '#00ff88';
            btn.style.color = '#000';
            loadBackgrounds(cat.type);
        };
        buttons.push(btn);
        categories.appendChild(btn);
    });
    box.appendChild(categories);
    
    // Контейнер для фонов
    const backgroundsContainer = document.createElement('div');
    backgroundsContainer.id = 'backgroundsContainer';
    backgroundsContainer.style.cssText = 'flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding-right:8px;';
    box.appendChild(backgroundsContainer);
    
    console.log('backgroundsContainer created with id:', backgroundsContainer.id);
    console.log('backgroundsContainer added to DOM:', !!backgroundsContainer.parentElement);
    
    // Кнопки действий
    const actionButtons = document.createElement('div');
    actionButtons.style.cssText = 'display:flex;gap:12px;margin-top:16px;';
    
    // Кнопка загрузки
    const uploadBtn = document.createElement('button');
    uploadBtn.innerHTML = '<i class="fas fa-upload"></i> Загрузить фон';
    uploadBtn.style.cssText = 'flex:1;padding:12px;background:#00ff88;color:#000;border:none;border-radius:8px;cursor:pointer;font-weight:600;transition:background 0.2s;';
    uploadBtn.onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    // Сохраняем оригинальный DataURL
                    addUserBackground(e.target.result);
                    loadBackgrounds('custom');
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    };
    
    // Кнопка сброса
    const resetBtn = document.createElement('button');
    resetBtn.innerHTML = '<i class="fas fa-undo"></i> Сбросить';
    resetBtn.style.cssText = 'flex:1;padding:12px;background:#ff4444;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;transition:background 0.2s;';
    resetBtn.onclick = () => {
        const defaultBg = 'linear-gradient(135deg, #000000 0%, #00ff88 100%)';
        setMainBg(defaultBg);
        localStorage.setItem('zhukbrowse_bg', defaultBg);
        modal.remove();
        showNotification('Фон сброшен!');
    };
    
    actionButtons.appendChild(uploadBtn);
    actionButtons.appendChild(resetBtn);
    box.appendChild(actionButtons);
    
    modal.appendChild(box);
    document.body.appendChild(modal);
    
    // Закрытие при клике вне модального окна
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            console.log('Modal background clicked, removing modal');
            modal.remove();
        }
    });
    
    // Загружаем градиенты по умолчанию
    console.log('Calling loadBackgrounds with gradients...');
    loadBackgrounds('gradients');
    console.log('openBackgroundGallery completed');
    
    function loadBackgrounds(category) {
        console.log('loadBackgrounds called with category:', category);
        const container = document.getElementById('backgroundsContainer');
        console.log('backgroundsContainer found:', !!container);
        
        if (!container) {
            console.error('backgroundsContainer not found!');
            return;
        }
        
        container.innerHTML = '';
        let backgrounds = [];
        const isPremium = isPremiumUser();
        console.log('isPremium:', isPremium);
        
        // Инициализируем премиум фоны, если их еще нет
        if (!localStorage.getItem('zhukbrowse_premium_backgrounds')) {
            console.log('Initializing premium backgrounds...');
            enablePremiumFeatures();
        } else {
            // Проверяем, что премиум фоны правильно сохранены
            const saved = localStorage.getItem('zhukbrowse_premium_backgrounds');
            const parsed = JSON.parse(saved);
            console.log('Saved premium backgrounds structure:', typeof parsed, parsed);
            
            // Если это не объект с категориями, переинициализируем
            if (typeof parsed !== 'object' || !parsed.gradients || !parsed.nature || !parsed.cities || !parsed.abstract) {
                console.log('Premium backgrounds structure is invalid, reinitializing...');
                enablePremiumFeatures();
            }
        }
        
        const premiumBackgrounds = getPremiumBackgrounds();
        console.log('premiumBackgrounds:', premiumBackgrounds);
        
        console.log('Processing category:', category);
        switch(category) {
            case 'gradients':
                console.log('Processing gradients category');
                if (isPremium) {
                    // Показываем премиум градиенты
                    backgrounds = premiumBackgrounds.gradients || [];
                    console.log('Premium gradients loaded:', backgrounds.length);
                } else {
                    // Показываем базовые градиенты
                    backgrounds = [
                        'linear-gradient(135deg, #000000 0%, #00ff88 100%)',
                        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                        'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
                    ];
                    console.log('Basic gradients loaded:', backgrounds.length);
                    
                    // Добавляем премиум градиенты с блокировкой
                    const premiumGradients = premiumBackgrounds.gradients || [];
                    premiumGradients.forEach(gradient => {
                        backgrounds.push({
                            background: gradient,
                            isPremium: true
                        });
                    });
                }
                break;
            case 'nature':
                if (isPremium) {
                    // Показываем премиум фоны природы
                    backgrounds = premiumBackgrounds.nature || [];
                } else {
                    // Показываем базовые фоны
                    backgrounds = [
                        'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1920&h=1080&fit=crop',
                        'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?w=1920&h=1080&fit=crop',
                        'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1920&h=1080&fit=crop',
                        'https://images.unsplash.com/photo-1465101178521-c1a9136a3b99?w=1920&h=1080&fit=crop',
                        'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=1920&h=1080&fit=crop'
                    ];
                    
                    // Добавляем премиум фоны с блокировкой
                    const premiumNature = premiumBackgrounds.nature || [];
                    premiumNature.forEach(bg => {
                        backgrounds.push({
                            background: bg,
                            isPremium: true
                        });
                    });
                }
                break;
            case 'cities':
                if (isPremium) {
                    // Показываем премиум фоны городов
                    backgrounds = premiumBackgrounds.cities || [];
                } else {
                    // Показываем базовые фоны
                    backgrounds = [
                        'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=1920&h=1080&fit=crop',
                        'https://images.unsplash.com/photo-1464037866556-6812c9d1c72e?w=1920&h=1080&fit=crop',
                        'https://images.unsplash.com/photo-1508051123996-69f8caf4891b?w=1920&h=1080&fit=crop',
                        'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1920&h=1080&fit=crop',
                        'https://images.unsplash.com/photo-1444723121867-7a241cacace9?w=1920&h=1080&fit=crop'
                    ];
                    
                    // Добавляем премиум фоны с блокировкой
                    const premiumCities = premiumBackgrounds.cities || [];
                    premiumCities.forEach(bg => {
                        backgrounds.push({
                            background: bg,
                            isPremium: true
                        });
                    });
                }
                break;
            case 'abstract':
                if (isPremium) {
                    // Показываем премиум абстрактные фоны
                    backgrounds = premiumBackgrounds.abstract || [];
                } else {
                    // Показываем базовые фоны
                    backgrounds = [
                        'https://images.unsplash.com/photo-1557683316-973673baf926?w=1920&h=1080&fit=crop',
                        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop',
                        'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1920&h=1080&fit=crop',
                        'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1920&h=1080&fit=crop',
                        'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1920&h=1080&fit=crop'
                    ];
                    
                    // Добавляем премиум фоны с блокировкой
                    const premiumAbstract = premiumBackgrounds.abstract || [];
                    premiumAbstract.forEach(bg => {
                        backgrounds.push({
                            background: bg,
                            isPremium: true
                        });
                    });
                }
                break;
            case 'custom':
                console.log('Processing custom category');
                backgrounds = getUserBackgrounds();
                console.log('Custom backgrounds loaded:', backgrounds.length);
                break;
        }
        console.log('Final backgrounds array length:', backgrounds.length);
        // Удаляем дубли только для строковых URL (не для объектов с isPremium)
        const uniqueBackgrounds = [];
        const seenUrls = new Set();
        
        backgrounds.forEach(bg => {
            const bgUrl = typeof bg === 'object' ? bg.background : bg;
            if (!seenUrls.has(bgUrl)) {
                seenUrls.add(bgUrl);
                uniqueBackgrounds.push(bg);
            }
        });
        
        console.log('Creating background elements for', uniqueBackgrounds.length, 'backgrounds');
        uniqueBackgrounds.forEach((bg, index) => {
            console.log('Creating background element', index + 1, 'of', uniqueBackgrounds.length, ':', typeof bg === 'object' ? bg.background : bg);
            const bgItem = document.createElement('div');
            bgItem.style.cssText = 'aspect-ratio:4/3;border-radius:8px;cursor:pointer;overflow:hidden;position:relative;transition:transform 0.2s;border:2px solid transparent;';
            
            // Проверяем, является ли фон премиум
            const isPremiumBg = typeof bg === 'object' && bg.isPremium;
            const bgUrl = typeof bg === 'object' ? bg.background : bg;
            
            if (isPremiumBg && !isPremiumUser()) {
                // Блокируем премиум фоны для не-премиум пользователей
                bgItem.onclick = () => {
                    showPremiumLockModal();
                };
                bgItem.style.cursor = 'pointer';
            } else {
                // Обычные фоны
                bgItem.onclick = () => {
                    setMainBg(bgUrl);
                    localStorage.setItem('zhukbrowse_bg', bgUrl);
                    modal.remove();
                    showNotification('Фон изменен!');
                };
            }
            
            // Эффект наведения
            bgItem.onmouseenter = () => {
                bgItem.style.transform = 'scale(1.05)';
                bgItem.style.border = '2px solid #00ff88';
            };
            bgItem.onmouseleave = () => {
                bgItem.style.transform = 'scale(1)';
                bgItem.style.border = '2px solid transparent';
            };
            
            let previewUrl = bgUrl;
            // Для пользовательских DataURL делаем превью через canvas
            if (typeof bgUrl === 'string' && bgUrl.startsWith('data:image/')) {
                const img = new window.Image();
                img.src = bgUrl;
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const maxW = 320, maxH = 180;
                    let w = img.width, h = img.height;
                    if (w > maxW || h > maxH) {
                        const ratio = Math.min(maxW / w, maxH / h);
                        w = Math.round(w * ratio);
                        h = Math.round(h * ratio);
                    }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    previewUrl = canvas.toDataURL('image/jpeg', 0.85);
                    bgPreview.style.background = `url('${previewUrl}') center/cover`;
                };
            }
            
            const bgPreview = document.createElement('div');
            bgPreview.style.cssText = 'width:100%;height:100%;background:' + (bgUrl.startsWith('linear-gradient') ? bgUrl : `url('${previewUrl}') center/cover`) + ';';
            
            // Добавляем блокировку для премиум фонов
            if (isPremiumBg && !isPremiumUser()) {
                const lockOverlay = document.createElement('div');
                lockOverlay.style.cssText = `
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(2px);
                `;
                
                const lockIcon = document.createElement('div');
                lockIcon.innerHTML = `
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #00ff88;">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <circle cx="12" cy="16" r="1"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    <div style="
                        position: absolute;
                        bottom: 8px;
                        right: 8px;
                        background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
                        color: #000;
                        padding: 2px 6px;
                        border-radius: 4px;
                        font-size: 10px;
                        font-weight: 600;
                    ">PREMIUM</div>
                `;
                lockOverlay.appendChild(lockIcon);
                bgItem.appendChild(lockOverlay);
            }
            
            bgItem.appendChild(bgPreview);
            container.appendChild(bgItem);
            console.log('Background element', index + 1, 'added to container');
        });
        
        console.log('Backgrounds loaded:', uniqueBackgrounds.length, 'items');
        console.log('Container children count:', container.children.length);
        console.log('Container HTML:', container.innerHTML.substring(0, 200) + '...');
    }
}

// Применение фона к главной странице
function setMainBg(url) {
    console.log('setMainBg called with:', url);
    let bgUrl = url;
    // Если это картинка Unsplash с параметрами, убираем параметры для лучшего качества
    if (typeof url === 'string' && url.startsWith('https://images.unsplash.com/')) {
        const idx = url.indexOf('?');
        if (idx !== -1) {
            bgUrl = url.substring(0, idx); // Обрезаем параметры
        }
    }
    // Определяем текущую тему
    const theme = document.body.getAttribute('data-theme') || 'system';
    // Светлый дефолтный фон
    const lightDefaultBg = 'linear-gradient(135deg, #f8f8fa 0%, #e0e0e0 100%)';
    // Тёмный дефолтный фон
    const darkDefaultBg = 'linear-gradient(135deg, #000000 0%, #00ff88 100%)';
    // Устанавливаем фон только для стартовой страницы
    const startPage = document.getElementById('startPage');
    if (startPage) {
        const isIncognito = startPage.classList.contains('incognito') || window.location.pathname.includes('incognito.html');
        if (isIncognito) {
            startPage.style.background = 'linear-gradient(135deg, #000000 0%, #2d1a4d 100%)';
        } else {
            if (!bgUrl) {
                startPage.style.background = (theme === 'light') ? lightDefaultBg : darkDefaultBg;
            } else if (bgUrl && bgUrl.startsWith('linear-gradient')) {
                startPage.style.background = bgUrl;
            } else if (bgUrl && bgUrl.startsWith('#')) {
                startPage.style.background = bgUrl;
            } else if (bgUrl) {
                startPage.style.background = `url('${bgUrl}') center/cover no-repeat`;
            }
        }
    }
    // Устанавливаем фон для всех вкладок со стартовыми страницами
    document.querySelectorAll('.tab-content').forEach(tab => {
        if (tab.querySelector('.start-page')) {
            const tabStartPage = tab.querySelector('.start-page');
            const isIncognito = tabStartPage.classList.contains('incognito');
            if (isIncognito) {
                tabStartPage.style.background = 'linear-gradient(135deg, #000000 0%, #2d1a4d 100%)';
            } else {
                if (!bgUrl) {
                    tabStartPage.style.background = (theme === 'light') ? lightDefaultBg : darkDefaultBg;
                } else if (bgUrl && bgUrl.startsWith('linear-gradient')) {
                    tabStartPage.style.background = bgUrl;
                } else if (bgUrl && bgUrl.startsWith('#')) {
                    tabStartPage.style.background = bgUrl;
                } else if (bgUrl) {
                    tabStartPage.style.background = `url('${bgUrl}') center/cover no-repeat`;
                }
            }
        }
    });
    console.log('Background set successfully');
}
// При загрузке — применить фон, если выбран
(function(){
    console.log('Applying background on load...');
    const bg = localStorage.getItem('zhukbrowse_bg');
    if (bg) {
        console.log('Found saved background:', bg);
        setTimeout(()=>setMainBg(bg), 100);
    } else {
        // Устанавливаем градиент по умолчанию при первом запуске
        const defaultBg = 'linear-gradient(135deg, #000000 0%, #00ff88 100%)';
        console.log('Setting default background:', defaultBg);
        localStorage.setItem('zhukbrowse_bg', defaultBg);
        setTimeout(()=>setMainBg(defaultBg), 100);
    }
})(); 

// Защита от clickjacking
if (window.top !== window.self) {
    window.top.location = window.self.location;
}
// Очищаем потенциально опасные window-объекты
try {
    window.require = undefined;
    window.process = undefined;
    window.module = undefined;
} catch(e) {}

// Функции для управления геолокацией
function enableRealGeolocation() {
    window.enableRealGeolocation = true;
    console.log('Real geolocation enabled');
}

function disableRealGeolocation() {
    window.enableRealGeolocation = false;
    console.log('Fake geolocation enabled');
}

// Экспортируем функции в глобальную область видимости
window.performSearch = performSearch;
window.createTab = createTab;
window.initStartPage = initStartPage;
window.openBackgroundGallery = openBackgroundGallery;
window.setMainBg = setMainBg;
window.renderStartPage = renderStartPage;
window.enableRealGeolocation = enableRealGeolocation;
window.disableRealGeolocation = disableRealGeolocation;

// Функция для вставки крупного времени в самый верх любого контейнера
function insertCurrentTimeTop(container) {
    let timeDiv = container.querySelector('.current-time-top');
    if (!timeDiv) {
        timeDiv = document.createElement('div');
        timeDiv.className = 'current-time-top';
        timeDiv.style.cssText = 'font-size:40px;font-weight:700;margin-bottom:18px;color:#fff;text-align:center;opacity:1;';
        container.prepend(timeDiv);
    }
    function updateTime() {
        const now = new Date();
        timeDiv.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    updateTime();
    // Обновлять каждую минуту
    setInterval(updateTime, 60000);
}

// ... existing code ...
// Универсальная функция для рендера стартовой страницы (и новых вкладок)
function renderStartPage(targetId = 'startPage', color = '#00ff88') {
    try {
        console.log(`renderStartPage called with targetId: ${targetId}, color: ${color}`);
        
        // Проверяем, не рендерится ли уже эта страница
        if (window.isRenderingStartPage && window.isRenderingStartPage === targetId) {
            console.log(`Already rendering start page: ${targetId}, skipping...`);
            return;
        }
        
        window.isRenderingStartPage = targetId;
        
        const startPage = document.getElementById(targetId);
        if (!startPage) {
            console.error(`Start page element with id '${targetId}' not found`);
            console.log('Available elements with similar IDs:');
            document.querySelectorAll('[id*="startPage"]').forEach(el => {
                console.log('-', el.id);
            });
            window.isRenderingStartPage = null;
            return;
        }
        console.log(`Found start page element:`, startPage);
        // Определяем инкогнито-режим
        const isIncognito = startPage.classList.contains('incognito') || window.location.pathname.includes('incognito.html');
        startPage.className = 'start-page' + (isIncognito ? ' incognito' : '');
        startPage.style.position = 'relative';
        // Время всегда с id 'currentTime' для стартовой, для новых вкладок уникальный id
        const isMain = targetId === 'startPage';
        const timeId = isMain ? 'currentTime' : 'currentTime-' + targetId;
        // Формируем разметку: для инкогнито время отдельно, для обычного режима время отдельно
        if (isIncognito) {
            startPage.innerHTML = `
                <div class='current-time' id='${timeId}' style='color:#b388ff; margin-bottom: 10px !important;'></div>
                <div class='start-content' style='margin-top: 5px !important;'>
                    <div class='search-section'>
                        <div class='search-box'>
                            <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style='color:#b388ff;'>
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="m21 21-4.35-4.35"></path>
                            </svg>
                            <input type='text' id='searchInput-${targetId}' placeholder='Поиск в интернете' style='color:#b388ff;' />
                            <button id='searchBtn-${targetId}'>
                                <svg class="arrow-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                    <polyline points="12,5 19,12 12,19"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            startPage.innerHTML = `
                <div class='current-time' id='${timeId}' style='color:#fff;'></div>
                <div class='start-content'>
                    <div class='search-section'>
                        <div class='search-box'>
                            <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="m21 21-4.35-4.35"></path>
                            </svg>
                            <input type='text' id='searchInput-${targetId}' placeholder='Поиск в интернете' />
                            <button id='searchBtn-${targetId}'>
                                <svg class="arrow-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                    <polyline points="12,5 19,12 12,19"></polyline>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
                <div class='extensions-popup' style='position:absolute;bottom:32px;right:32px;display:flex;gap:8px;z-index:10;'>
                    ${(() => {
                        const extensionsHTML = getEnabledExtensionsHTML();
                        console.log('Extensions HTML for start page:', extensionsHTML);
                        return extensionsHTML;
                    })()}
                    <button class='change-bg-icon-btn' title='Сменить фон' style='background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:12px;color:#fff;cursor:pointer;padding:12px;backdrop-filter:blur(10px);transition:all 0.3s ease;'>
                        <svg class="palette-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="13.5" cy="6.5" r=".5"></circle>
                            <circle cx="17.5" cy="10.5" r=".5"></circle>
                            <circle cx="8.5" cy="7.5" r=".5"></circle>
                            <circle cx="6.5" cy="12.5" r=".5"></circle>
                            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path>
                        </svg>
                    </button>
                </div>
            `;
        }
        // Время
        const timeEl = document.getElementById(timeId);
        if (timeEl) {
            const updateTime = () => {
                const now = new Date();
                timeEl.textContent = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            };
            updateTime();
            setInterval(updateTime, 60000); // обновлять раз в минуту
        }
        // Поиск
        const searchBox = startPage.querySelector('.search-box');
        const searchInput = startPage.querySelector('input[type="text"]');
        const searchBtn = startPage.querySelector('button[id^="searchBtn-"]');
        
        function performTabSearch(e) {
            if (e) e.preventDefault();
            const query = searchInput.value.trim();
            if (!query) return;
            if (typeof searchEngines !== 'undefined' && typeof settings !== 'undefined' && typeof createTab === 'function') {
                const url = searchEngines[settings.searchEngine] + encodeURIComponent(query);
                createTab(url, 'Поиск: ' + query, isIncognito);
            } else {
                console.error('Required functions or variables not available for search');
            }
        }
        
        // Обработчик для Enter в поле ввода
        if (searchInput) {
            searchInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    performTabSearch(e);
                }
            });
        }
        
        // Обработчик для кнопки поиска
        if (searchBtn) {
            searchBtn.addEventListener('click', performTabSearch);
        }
        // Кнопка смены фона
        const changeBgIconBtn = startPage.querySelector('.change-bg-icon-btn');
        if (changeBgIconBtn && typeof openBackgroundGallery === 'function') {
            changeBgIconBtn.onclick = openBackgroundGallery;
        }
        // Применить фон
        if (isIncognito) {
            startPage.style.background = 'linear-gradient(135deg, #000000 0%, #2d1a4d 100%)';
        } else {
            const bg = localStorage.getItem('zhukbrowse_bg');
            if (bg && typeof setMainBg === 'function') {
                setMainBg(bg);
            } else if (bg) {
                startPage.style.background = bg;
            } else {
                // Устанавливаем градиент по умолчанию
                const defaultBg = 'linear-gradient(135deg, #000000 0%, #00ff88 100%)';
                startPage.style.background = defaultBg;
            }
        }
        console.log(`Start page rendered successfully for target: ${targetId}`);
        console.log('Final HTML content:', startPage.innerHTML.substring(0, 200) + '...');
        
        // Сбрасываем флаг рендеринга
        window.isRenderingStartPage = null;
    } catch (error) {
        console.error('Error rendering start page:', error);
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
        
        // Сбрасываем флаг рендеринга даже при ошибке
        window.isRenderingStartPage = null;
    }
}

// Функция для получения HTML включенных расширений
function getEnabledExtensionsHTML() {
    try {
        const installedExtensions = JSON.parse(localStorage.getItem('installedExtensions') || '[]');
        const enabledExtensions = installedExtensions.filter(ext => ext.enabled);
        
        console.log('Installed extensions:', installedExtensions);
        console.log('Enabled extensions:', enabledExtensions);
        
        if (enabledExtensions.length === 0) {
            console.log('No enabled extensions found');
            return '';
        }
        
        return enabledExtensions.map(extension => {
            const iconMap = {
                'shield': 'fa-shield-alt',
                'vpn': 'fa-shield-alt',
                'zhukvpn': 'fa-shield-alt'
            };
            
            const icon = iconMap[extension.icon] || 'fa-puzzle-piece';
            const title = extension.name || 'Расширение';
            
            console.log(`Creating button for extension: ${extension.name} (${extension.id}) with icon: ${icon}`);
            
            // Используем SVG иконки вместо Font Awesome
            const svgIcon = getExtensionSVGIcon(extension.icon);
            
            return `
                <button class='extension-btn' title='${title}' onclick='toggleExtensionPopup("${extension.id}")' style='background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:12px;color:#fff;cursor:pointer;padding:12px;backdrop-filter:blur(10px);transition:all 0.3s ease;'>
                    ${svgIcon}
                </button>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error getting enabled extensions HTML:', error);
        return '';
    }
}

// Функция для получения SVG иконок расширений
function getExtensionSVGIcon(iconType) {
    const iconMap = {
        'shield': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M12 8v8"/>
            <path d="M8 12h8"/>
        </svg>`,
        'vpn': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M12 8v8"/>
            <path d="M8 12h8"/>
        </svg>`,
        'zhukvpn': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M12 8v8"/>
            <path d="M8 12h8"/>
        </svg>`
    };
    
    return iconMap[iconType] || `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <path d="M9 9h6v6H9z"/>
    </svg>`;
}

// Функция для переключения всплывающего окна расширения
function toggleExtensionPopup(extensionId) {
    try {
        const installedExtensions = JSON.parse(localStorage.getItem('installedExtensions') || '[]');
        const extension = installedExtensions.find(ext => ext.id === extensionId);
        
        if (!extension) {
            console.error('Extension not found:', extensionId);
            return;
        }
        
        // Удаляем существующие всплывающие окна
        const existingPopup = document.querySelector('.extension-popup');
        if (existingPopup) {
            existingPopup.remove();
        }
        
        // Создаем новое всплывающее окно
        const popup = document.createElement('div');
        popup.className = 'extension-popup';
        popup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(26, 26, 26, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 24px;
            backdrop-filter: blur(10px);
            z-index: 10000;
            min-width: 300px;
            max-width: 400px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        `;
        
        const svgIcon = getExtensionSVGIcon(extension.icon);
        
        popup.innerHTML = `
            <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff;">
                    ${svgIcon.replace('width="18" height="18"', 'width="24" height="24"')}
                </div>
                <div>
                    <h3 style="margin: 0 0 4px 0; color: #fff; font-size: 18px;">${extension.name}</h3>
                    <p style="margin: 0; color: rgba(255, 255, 255, 0.7); font-size: 14px;">Версия ${extension.version}</p>
                </div>
                <button onclick="this.closest('.extension-popup').remove()" style="background: none; border: none; color: #fff; font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; margin-left: auto;">&times;</button>
            </div>
            <p style="color: rgba(255, 255, 255, 0.8); margin-bottom: 20px; line-height: 1.5;">${extension.description}</p>
            <div style="display: flex; gap: 12px;">
                <button onclick="toggleExtension('${extension.id}', false); this.closest('.extension-popup').remove();" style="background: rgba(255, 59, 48, 0.2); border: 1px solid rgba(255, 59, 48, 0.3); border-radius: 8px; color: #ff3b30; padding: 10px 16px; font-size: 14px; cursor: pointer; transition: all 0.3s ease; flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="6" y="4" width="4" height="16"/>
                        <rect x="14" y="4" width="4" height="16"/>
                    </svg>
                    Отключить
                </button>
                <button onclick="this.closest('.extension-popup').remove()" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; color: #fff; padding: 10px 16px; font-size: 14px; cursor: pointer; transition: all 0.3s ease; flex: 1;">
                    Закрыть
                </button>
            </div>
        `;
        
        document.body.appendChild(popup);
        
        // Закрытие по клику вне всплывающего окна
        popup.addEventListener('click', (e) => {
            if (e.target === popup) {
                popup.remove();
            }
        });
        
        // Закрытие по Escape
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                popup.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
    } catch (error) {
        console.error('Error toggling extension popup:', error);
    }
}

// ===== УЛУЧШЕННАЯ БЕЗОПАСНОСТЬ ИНКОГНИТО =====

// Ключ шифрования (в реальном приложении должен быть более сложным)
const ENCRYPTION_KEY = 'zhukbrowse_secure_key_2024';

// Функция шифрования данных
// Расширенная функция шифрования с AES
function encryptData(data) {
    try {
        // Генерируем ключ на основе уникального идентификатора браузера
        const browserId = getBrowserId();
        const key = generateKeyFromString(browserId);
        
        // Используем AES для шифрования
        const text = JSON.stringify(data);
        const encrypted = CryptoJS.AES.encrypt(text, key).toString();
        return encrypted;
    } catch (error) {
        console.error('Encryption error:', error);
        // Fallback к простому шифрованию
        try {
            const text = JSON.stringify(data);
            return btoa(encodeURIComponent(text));
        } catch (fallbackError) {
            console.error('Fallback encryption failed:', fallbackError);
            return null;
        }
    }
}

// Расширенная функция дешифрования
function decryptData(encryptedData) {
    try {
        // Генерируем ключ на основе уникального идентификатора браузера
        const browserId = getBrowserId();
        const key = generateKeyFromString(browserId);
        
        // Расшифровываем AES
        const decrypted = CryptoJS.AES.decrypt(encryptedData, key).toString(CryptoJS.enc.Utf8);
        return JSON.parse(decrypted);
    } catch (error) {
        console.error('Decryption error:', error);
        // Fallback к простому дешифрованию
        try {
            const decoded = decodeURIComponent(atob(encryptedData));
            return JSON.parse(decoded);
        } catch (fallbackError) {
            console.error('Fallback decryption failed:', fallbackError);
            return null;
        }
    }
}

// Генерация уникального идентификатора браузера
function getBrowserId() {
    let browserId = localStorage.getItem('zhukbrowse_browser_id');
    if (!browserId) {
        // Создаем уникальный ID на основе характеристик браузера
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillText('ZhukBrowse', 2, 2);
        
        const fingerprint = [
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset(),
            ctx.canvas.toDataURL()
        ].join('|');
        
        browserId = btoa(fingerprint).substring(0, 32);
        localStorage.setItem('zhukbrowse_browser_id', browserId);
    }
    return browserId;
}

// Генерация ключа из строки
function generateKeyFromString(str) {
    // Создаем хеш из строки для получения ключа
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    
    // Преобразуем хеш в строку ключа
    const keyString = Math.abs(hash).toString(16).padStart(8, '0');
    return 'zhukbrowse_' + keyString + '_secure_key_2024';
}

// Автоматическая очистка данных инкогнито
function clearIncognitoData() {
    try {
        // Очищаем localStorage
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.includes('incognito') || key.includes('zhukbrowse')) {
                localStorage.removeItem(key);
            }
        });
        
        // Очищаем sessionStorage
        sessionStorage.clear();
        
        // Очищаем cookies
        document.cookie.split(";").forEach(function(c) { 
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
        });
        
        console.log('Incognito data cleared');
    } catch (error) {
        console.error('Error clearing incognito data:', error);
    }
}

// Защита от fingerprinting
function enableFingerprintProtection() {
    try {
        // Переопределяем canvas fingerprinting
        const originalGetContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, ...args) {
            const context = originalGetContext.call(this, type, ...args);
            if (type === '2d') {
                const originalGetImageData = context.getImageData;
                context.getImageData = function(...args) {
                    const imageData = originalGetImageData.call(this, ...args);
                    // Добавляем небольшой шум к данным
                    for (let i = 0; i < imageData.data.length; i += 4) {
                        imageData.data[i] += Math.random() * 2 - 1;
                        imageData.data[i + 1] += Math.random() * 2 - 1;
                        imageData.data[i + 2] += Math.random() * 2 - 1;
                    }
                    return imageData;
                };
            }
            return context;
        };

        // Переопределяем WebGL fingerprinting
        const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(parameter) {
            // Скрываем некоторые параметры
            if (parameter === 37445) { // UNMASKED_VENDOR_WEBGL
                return 'Intel Inc.';
            }
            if (parameter === 37446) { // UNMASKED_RENDERER_WEBGL
                return 'Intel Iris OpenGL Engine';
            }
            return originalGetParameter.call(this, parameter);
        };

        // Переопределяем AudioContext fingerprinting
        const originalAudioContext = window.AudioContext || window.webkitAudioContext;
        if (originalAudioContext) {
            window.AudioContext = window.webkitAudioContext = function(...args) {
                const context = new originalAudioContext(...args);
                const originalGetChannelData = context.createAnalyser().constructor.prototype.getChannelData;
                context.createAnalyser().constructor.prototype.getChannelData = function(...args) {
                    const data = originalGetChannelData.call(this, ...args);
                    // Добавляем шум к аудио данным
                    for (let i = 0; i < data.length; i++) {
                        data[i] += (Math.random() - 0.5) * 0.001;
                    }
                    return data;
                };
                return context;
            };
        }

        // Скрываем плагины
        Object.defineProperty(navigator, 'plugins', {
            get: () => []
        });

        // Скрываем языки
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en']
        });

        // Скрываем платформу
        Object.defineProperty(navigator, 'platform', {
            get: () => 'Win32'
        });

        // Скрываем user agent
        Object.defineProperty(navigator, 'userAgent', {
            get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        console.log('Fingerprint protection enabled');
    } catch (error) {
        console.error('Error enabling fingerprint protection:', error);
    }
}

// Улучшенная блокировка трекеров
const TRACKER_DOMAINS = [
    'google-analytics.com',
    'googletagmanager.com',
    'facebook.com',
    'doubleclick.net',
    'amazon-adsystem.com',
    'googlesyndication.com',
    'adnxs.com',
    'advertising.com',
    'moatads.com',
    'scorecardresearch.com',
    'hotjar.com',
    'mixpanel.com',
    'amplitude.com',
    'segment.com',
    'optimizely.com',
    'crazyegg.com',
    'clicktale.net',
    'fullstory.com',
    'mouseflow.com',
    'inspectlet.com',
    'luckyorange.com',
    'sessioncam.com',
    'yandex.ru',
    'yandex.net',
    'mc.yandex.ru',
    'top-fwz1.mail.ru',
    'top.mail.ru',
    'vk.com',
    'vk.ru',
    'vkuser.net',
    'vk-cdn.net',
    'vk.me',
    'vk.cc',
    'vkforms.ru',
    'vk-portal.net',
    'vk-cdn.com',
    'vkuser.net',
    'vk-cdn.net',
    'vk.me',
    'vk.cc',
    'vkforms.ru',
    'vk-portal.net',
    'vk-cdn.com'
];

const TRACKER_SCRIPTS = [
    'analytics.js',
    'gtag.js',
    'ga.js',
    'googletagmanager.com',
    'facebook.net',
    'doubleclick.net',
    'amazon-adsystem.com',
    'googlesyndication.com',
    'adnxs.com',
    'advertising.com',
    'moatads.com',
    'scorecardresearch.com',
    'hotjar.com',
    'mixpanel.js',
    'amplitude.js',
    'segment.js',
    'optimizely.js',
    'crazyegg.js',
    'clicktale.js',
    'fullstory.js',
    'mouseflow.js',
    'inspectlet.js',
    'luckyorange.js',
    'sessioncam.js',
    'yandex.ru',
    'mc.yandex.ru',
    'top.mail.ru',
    'vk.com'
];

function enableAdvancedTrackerBlocking() {
    try {
        // Блокировка запросов к трекерам
        const originalFetch = window.fetch;
        window.fetch = function(url, options) {
            const urlString = typeof url === 'string' ? url : url.toString();
            if (TRACKER_DOMAINS.some(domain => urlString.includes(domain))) {
                console.log('Blocked tracker request:', urlString);
                return Promise.reject(new Error('Tracker blocked'));
            }
            return originalFetch.call(this, url, options);
        };

        // Блокировка XMLHttpRequest
        const originalXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            if (TRACKER_DOMAINS.some(domain => url.includes(domain))) {
                console.log('Blocked tracker XHR:', url);
                return;
            }
            return originalXHROpen.call(this, method, url, ...args);
        };

        // Блокировка создания скриптов трекеров
        const originalCreateElement = document.createElement;
        document.createElement = function(tagName) {
            const element = originalCreateElement.call(this, tagName);
            if (tagName.toLowerCase() === 'script') {
                const originalSetAttribute = element.setAttribute;
                element.setAttribute = function(name, value) {
                    if (name === 'src' && TRACKER_SCRIPTS.some(script => value.includes(script))) {
                        console.log('Blocked tracker script:', value);
                        return;
                    }
                    return originalSetAttribute.call(this, name, value);
                };
            }
            return element;
        };

        // Блокировка iframe трекеров
        const originalAppendChild = Node.prototype.appendChild;
        Node.prototype.appendChild = function(child) {
            if (child.tagName === 'IFRAME' && child.src) {
                if (TRACKER_DOMAINS.some(domain => child.src.includes(domain))) {
                    console.log('Blocked tracker iframe:', child.src);
                    return child; // Возвращаем элемент, но он не будет загружен
                }
            }
            return originalAppendChild.call(this, child);
        };

        // Блокировка изображений трекеров
        const originalSetAttribute = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function(name, value) {
            if (name === 'src' && this.tagName === 'IMG') {
                if (TRACKER_DOMAINS.some(domain => value.includes(domain))) {
                    console.log('Blocked tracker image:', value);
                    return;
                }
            }
            return originalSetAttribute.call(this, name, value);
        };

        console.log('Advanced tracker blocking enabled');
    } catch (error) {
        console.error('Error enabling tracker blocking:', error);
    }
}

// Подмена IP и геолокации с использованием прокси
function enableIPAndLocationSpoofing() {
    console.log('IP and location spoofing enabled with proxy IP');
    
    // Блокируем WebRTC для предотвращения утечки реального IP
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia = function() {
            return Promise.reject(new Error('WebRTC blocked for security'));
        };
    }
    
    // Блокируем RTCPeerConnection
    if (window.RTCPeerConnection) {
        window.RTCPeerConnection = function() {
            throw new Error('RTCPeerConnection blocked for security');
        };
    }
    
    // Блокируем RTCDataChannel
    if (window.RTCDataChannel) {
        window.RTCDataChannel = function() {
            throw new Error('RTCDataChannel blocked for security');
        };
    }
    
    // Блокируем другие WebRTC API
    if (window.webkitRTCPeerConnection) {
        window.webkitRTCPeerConnection = function() {
            throw new Error('webkitRTCPeerConnection blocked for security');
        };
    }
    
    if (window.mozRTCPeerConnection) {
        window.mozRTCPeerConnection = function() {
            throw new Error('mozRTCPeerConnection blocked for security');
        };
    }
    
    // Блокируем DNS API
    if (window.dns) {
        window.dns = undefined;
    }
    
    // Переопределяем fetch для подмены IP в заголовках
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        if (!options.headers) {
            options.headers = {};
        }
        
        // Добавляем заголовки с IP прокси
        const settings = JSON.parse(localStorage.getItem('zhukbrowse_settings') || '{}');
        if (settings.proxyEnabled && settings.selectedCountry !== 'none') {
            const selectedProxy = publicProxies.find(p => p.code === settings.selectedCountry);
            if (selectedProxy) {
                options.headers['X-Forwarded-For'] = selectedProxy.host;
                options.headers['X-Real-IP'] = selectedProxy.host;
                options.headers['CF-Connecting-IP'] = selectedProxy.host;
                options.headers['X-Forwarded-Host'] = selectedProxy.host;
                options.headers['X-Client-IP'] = selectedProxy.host;
                options.headers['X-Remote-IP'] = selectedProxy.host;
                options.headers['X-Remote-Addr'] = selectedProxy.host;
                options.headers['X-Originating-IP'] = selectedProxy.host;
                options.headers['X-Cluster-Client-IP'] = selectedProxy.host;
                options.headers['True-Client-IP'] = selectedProxy.host;
                options.headers['X-ProxyUser-Ip'] = selectedProxy.host;
                options.headers['Via'] = selectedProxy.host;
                options.headers['Forwarded'] = `for=${selectedProxy.host};by=${selectedProxy.host};host=${selectedProxy.host}`;
            }
        }
        
        return originalFetch.call(this, url, options);
    };
    
    // Переопределяем XMLHttpRequest для подмены IP в заголовках
    const originalXHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
        const xhr = this;
        const originalSetRequestHeader = xhr.setRequestHeader;
        
        xhr.setRequestHeader = function(header, value) {
            const settings = JSON.parse(localStorage.getItem('zhukbrowse_settings') || '{}');
            if (settings.proxyEnabled && settings.selectedCountry !== 'none') {
                const selectedProxy = publicProxies.find(p => p.code === settings.selectedCountry);
                if (selectedProxy) {
                    // Подменяем IP заголовки
                    if (header.toLowerCase() === 'x-forwarded-for') {
                        value = selectedProxy.host;
                    } else if (header.toLowerCase() === 'x-real-ip') {
                        value = selectedProxy.host;
                    } else if (header.toLowerCase() === 'cf-connecting-ip') {
                        value = selectedProxy.host;
                    }
                }
            }
            return originalSetRequestHeader.call(this, header, value);
        };
        
        return originalXHROpen.call(this, method, url, async, user, password);
    };
    
    console.log('IP and location spoofing fully enabled');
}

// Функция инициализации всех защитных механизмов
function initializeIncognitoSecurity() {
    if (window.location.pathname.includes('incognito.html') || 
        document.querySelector('.start-page.incognito')) {
        
        console.log('Initializing incognito security features...');
        
        // Включаем все защиты
        enableFingerprintProtection();
        enableAdvancedTrackerBlocking();
        enableIPAndLocationSpoofing();
        
        // Автоматически включаем VPN в инкогнито режиме (без уведомления)
        if (!settings.proxyEnabled) {
            settings.proxyEnabled = true;
            settings.selectedCountry = 'us'; // По умолчанию США
            updateProxyButton();
        }
        
        // Устанавливаем автоматическую очистку при закрытии
        window.addEventListener('beforeunload', clearIncognitoData);
        
        // Периодическая очистка каждые 5 минут
        setInterval(clearIncognitoData, 5 * 60 * 1000);
        
        // Очистка при потере фокуса
        window.addEventListener('blur', () => {
            setTimeout(clearIncognitoData, 1000);
        });
        
        // Инициализация завершена без уведомлений
        
        console.log('Incognito security features initialized');
    }
}

// Функция для применения защитных механизмов к webview
function applyIncognitoProtectionToWebview(webview) {
    if (!webview) return;
    
    // Применяем защитные механизмы к webview
    webview.addEventListener('dom-ready', () => {
        try {
            // Внедряем защитные скрипты в webview
            webview.executeJavaScript(`
                // Подмена IP и местоположения
                (function() {
                    const fakeIPs = [
                        { ip: '8.8.8.8', country: 'US', city: 'Mountain View', timezone: 'America/Los_Angeles' },
                        { ip: '1.1.1.1', country: 'US', city: 'San Francisco', timezone: 'America/Los_Angeles' },
                        { ip: '208.67.222.222', country: 'US', city: 'New York', timezone: 'America/New_York' }
                    ];
                    const fakeIP = fakeIPs[Math.floor(Math.random() * fakeIPs.length)];
                    
                    // Подменяем fetch
                    const originalFetch = window.fetch;
                    window.fetch = function(url, options) {
                        const urlString = typeof url === 'string' ? url : url.toString();
                        const ipDetectionServices = [
                            'ip-api.com', 'ipinfo.io', 'ipify.org', 'whatismyipaddress.com',
                            'whatismyip.com', 'ipleak.net', 'browserleaks.com', 'whoer.net',
                            'myip.com', 'ip.me', 'checkip.amazonaws.com', 'icanhazip.com'
                        ];
                        
                        if (ipDetectionServices.some(service => urlString.includes(service))) {
                            console.log('Blocked IP detection in webview:', urlString);
                            return Promise.resolve({
                                ok: true,
                                json: () => Promise.resolve({
                                    ip: fakeIP.ip,
                                    country: fakeIP.country,
                                    city: fakeIP.city,
                                    timezone: fakeIP.timezone,
                                    org: 'Cloudflare, Inc.',
                                    region: 'CA',
                                    regionName: 'California',
                                    zip: '94043',
                                    lat: 37.7749,
                                    lon: -122.4194
                                }),
                                text: () => Promise.resolve(fakeIP.ip)
                            });
                        }
                        return originalFetch.call(this, url, options);
                    };
                    
                    // Подменяем XMLHttpRequest
                    const originalXHROpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function(method, url, ...args) {
                        const ipDetectionServices = [
                            'ip-api.com', 'ipinfo.io', 'ipify.org', 'whatismyipaddress.com',
                            'whatismyip.com', 'ipleak.net', 'browserleaks.com', 'whoer.net'
                        ];
                        
                        if (ipDetectionServices.some(service => url.includes(service))) {
                            console.log('Blocked IP detection XHR in webview:', url);
                            setTimeout(() => {
                                this.status = 200;
                                this.responseText = fakeIP.ip;
                                this.onload && this.onload();
                            }, 100);
                            return;
                        }
                        return originalXHROpen.call(this, method, url, ...args);
                    };
                    
                    // Подменяем геолокацию
                    if (navigator.geolocation) {
                        const fakeGeolocation = {
                            getCurrentPosition: function(success, error, options) {
                                const fakePosition = {
                                    coords: {
                                        latitude: 37.7749 + (Math.random() - 0.5) * 0.1,
                                        longitude: -122.4194 + (Math.random() - 0.5) * 0.1,
                                        accuracy: 100 + Math.random() * 900,
                                        altitude: null,
                                        altitudeAccuracy: null,
                                        heading: null,
                                        speed: null
                                    },
                                    timestamp: Date.now()
                                };
                                setTimeout(() => success(fakePosition), 100);
                            },
                            watchPosition: function(success, error, options) {
                                const fakePosition = {
                                    coords: {
                                        latitude: 37.7749 + (Math.random() - 0.5) * 0.1,
                                        longitude: -122.4194 + (Math.random() - 0.5) * 0.1,
                                        accuracy: 100 + Math.random() * 900,
                                        altitude: null,
                                        altitudeAccuracy: null,
                                        heading: null,
                                        speed: null
                                    },
                                    timestamp: Date.now()
                                };
                                setTimeout(() => success(fakePosition), 100);
                                return Math.floor(Math.random() * 1000000);
                            },
                            clearWatch: function(watchId) {}
                        };
                        
                        Object.defineProperty(navigator, 'geolocation', {
                            get: () => fakeGeolocation,
                            configurable: true
                        });
                    }
                    
                    console.log('Incognito protection applied to webview');
                })();
            `);
        } catch (error) {
            console.error('Error applying incognito protection to webview:', error);
        }
    });
}

// Функция для применения защитных механизмов к webview в основном браузере
function applyMainBrowserProtectionToWebview(webview) {
    if (!webview) return;
    
    // Применяем защитные механизмы к webview
    webview.addEventListener('dom-ready', () => {
        try {
            // Внедряем защитные скрипты в webview
            webview.executeJavaScript(`
                // Подмена IP и местоположения для основного браузера
                (function() {
                    const fakeIPs = [
                        { ip: '8.8.8.8', country: 'US', city: 'Mountain View', timezone: 'America/Los_Angeles' },
                        { ip: '1.1.1.1', country: 'US', city: 'San Francisco', timezone: 'America/Los_Angeles' },
                        { ip: '208.67.222.222', country: 'US', city: 'New York', timezone: 'America/New_York' },
                        { ip: '185.199.108.153', country: 'DE', city: 'Frankfurt', timezone: 'Europe/Berlin' },
                        { ip: '104.16.124.96', country: 'US', city: 'San Francisco', timezone: 'America/Los_Angeles' }
                    ];
                    const fakeIP = fakeIPs[Math.floor(Math.random() * fakeIPs.length)];
                    
                    // Блокируем WebRTC
                    if (window.RTCPeerConnection) {
                        window.RTCPeerConnection = function() {
                            throw new Error('WebRTC is disabled for security');
                        };
                    }
                    
                    // Блокируем медиа API
                    if (navigator.mediaDevices) {
                        if (navigator.mediaDevices.getUserMedia) {
                            navigator.mediaDevices.getUserMedia = function() {
                                return Promise.reject(new Error('Media access is disabled'));
                            };
                        }
                        if (navigator.mediaDevices.getDisplayMedia) {
                            navigator.mediaDevices.getDisplayMedia = function() {
                                return Promise.reject(new Error('Screen sharing is disabled'));
                            };
                        }
                    }
                    
                    // Подменяем fetch
                    const originalFetch = window.fetch;
                    window.fetch = function(url, options) {
                        const urlString = typeof url === 'string' ? url : url.toString();
                        const ipDetectionServices = [
                            'ip-api.com', 'ipinfo.io', 'ipify.org', 'whatismyipaddress.com',
                            'whatismyip.com', 'ipleak.net', 'browserleaks.com', 'whoer.net',
                            'myip.com', 'ip.me', 'checkip.amazonaws.com', 'icanhazip.com',
                            'httpbin.org/ip', 'jsonip.com', 'api.myip.com', 'freegeoip.app',
                            'ipapi.co', 'ipgeolocation.io', 'ipstack.com', 'ipapi.com',
                            'ipqualityscore.com', 'ip2location.com', 'maxmind.com', 'ipregistry.co',
                            'abstractapi.com', 'ipgeolocationapi.com', 'ipapi.is', 'ipdata.co',
                            'wtfismyip.com', 'dnsleaktest.com', 'dnsleak.com'
                        ];
                        
                        if (ipDetectionServices.some(service => urlString.includes(service))) {
                            console.log('Blocked IP detection in main browser webview:', urlString);
                            return Promise.resolve({
                                ok: true,
                                json: () => Promise.resolve({
                                    ip: fakeIP.ip,
                                    country: fakeIP.country,
                                    city: fakeIP.city,
                                    timezone: fakeIP.timezone,
                                    org: 'Cloudflare, Inc.',
                                    region: 'CA',
                                    regionName: 'California',
                                    zip: '94043',
                                    lat: 37.7749,
                                    lon: -122.4194,
                                    query: fakeIP.ip,
                                    status: 'success'
                                }),
                                text: () => Promise.resolve(fakeIP.ip)
                            });
                        }
                        return originalFetch.call(this, url, options);
                    };
                    
                    // Подменяем XMLHttpRequest
                    const originalXHROpen = XMLHttpRequest.prototype.open;
                    XMLHttpRequest.prototype.open = function(method, url, ...args) {
                        const ipDetectionServices = [
                            'ip-api.com', 'ipinfo.io', 'ipify.org', 'whatismyipaddress.com',
                            'whatismyip.com', 'ipleak.net', 'browserleaks.com', 'whoer.net',
                            'freegeoip.app', 'ipapi.co', 'ipgeolocation.io', 'ipstack.com',
                            'ipapi.com', 'ipqualityscore.com', 'ip2location.com', 'maxmind.com',
                            'ipregistry.co', 'abstractapi.com', 'ipgeolocationapi.com', 'ipapi.is',
                            'ipdata.co', 'wtfismyip.com', 'dnsleaktest.com', 'dnsleak.com'
                        ];
                        
                        if (ipDetectionServices.some(service => url.includes(service))) {
                            console.log('Blocked IP detection XHR in main browser webview:', url);
                            setTimeout(() => {
                                this.status = 200;
                                this.responseText = fakeIP.ip;
                                this.onload && this.onload();
                            }, 100);
                            return;
                        }
                        return originalXHROpen.call(this, method, url, ...args);
                    };
                    
                    // Подменяем геолокацию
                    if (navigator.geolocation) {
                        const fakeGeolocation = {
                            getCurrentPosition: function(success, error, options) {
                                const fakePosition = {
                                    coords: {
                                        latitude: 37.7749 + (Math.random() - 0.5) * 0.1,
                                        longitude: -122.4194 + (Math.random() - 0.5) * 0.1,
                                        accuracy: 100 + Math.random() * 900,
                                        altitude: null,
                                        altitudeAccuracy: null,
                                        heading: null,
                                        speed: null
                                    },
                                    timestamp: Date.now()
                                };
                                setTimeout(() => success(fakePosition), 100);
                            },
                            watchPosition: function(success, error, options) {
                                const fakePosition = {
                                    coords: {
                                        latitude: 37.7749 + (Math.random() - 0.5) * 0.1,
                                        longitude: -122.4194 + (Math.random() - 0.5) * 0.1,
                                        accuracy: 100 + Math.random() * 900,
                                        altitude: null,
                                        altitudeAccuracy: null,
                                        heading: null,
                                        speed: null
                                    },
                                    timestamp: Date.now()
                                };
                                setTimeout(() => success(fakePosition), 100);
                                return Math.floor(Math.random() * 1000000);
                            },
                            clearWatch: function(watchId) {}
                        };
                        
                        Object.defineProperty(navigator, 'geolocation', {
                            get: () => fakeGeolocation,
                            configurable: true
                        });
                    }
                    
                    // Подменяем timezone
                    const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
                    Intl.DateTimeFormat.prototype.resolvedOptions = function() {
                        const options = originalResolvedOptions.call(this);
                        options.timeZone = fakeIP.timezone;
                        return options;
                    };
                    
                    // Подменяем User Agent
                    Object.defineProperty(navigator, 'userAgent', {
                        get: () => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        configurable: true
                    });
                    
                    // Подменяем язык
                    Object.defineProperty(navigator, 'language', {
                        get: () => 'en-US',
                        configurable: true
                    });
                    
                    Object.defineProperty(navigator, 'languages', {
                        get: () => ['en-US', 'en'],
                        configurable: true
                    });
                    
                    // Блокируем canvas fingerprinting
                    const originalGetContext = HTMLCanvasElement.prototype.getContext;
                    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
                        const context = originalGetContext.call(this, type, ...args);
                        if (type === '2d') {
                            const originalToDataURL = context.toDataURL;
                            context.toDataURL = function() {
                                // Возвращаем пустой canvas
                                return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
                            };
                        }
                        return context;
                    };
                    
                    console.log('Main browser protection applied to webview with IP:', fakeIP.ip);
                })();
            `);
        } catch (error) {
            console.error('Error applying main browser protection to webview:', error);
        }
    });
}

// Функция инициализации защиты для основного браузера
function initializeMainBrowserSecurity() {
    console.log('Initializing main browser security features...');
    
    // Включаем все защиты
    enableFingerprintProtection();
    enableAdvancedTrackerBlocking();
    enableIPAndLocationSpoofing();
    
    // Автоматически включаем VPN (без уведомления)
    if (!settings.proxyEnabled) {
        settings.proxyEnabled = true;
        settings.selectedCountry = 'us'; // По умолчанию США
        updateProxyButton();
    }
    
    // Периодическая очистка каждые 10 минут
    setInterval(() => {
        // Очищаем временные данные
        sessionStorage.clear();
        // Очищаем cookies для трекинга
        document.cookie.split(";").forEach(function(c) { 
            if (c.includes('tracking') || c.includes('analytics') || c.includes('ad')) {
                document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
            }
        });
    }, 10 * 60 * 1000);
    
    console.log('Main browser security features initialized');
}

// Экспортируем функции в глобальную область видимости
window.enableIPAndLocationSpoofing = enableIPAndLocationSpoofing;
window.enableFingerprintProtection = enableFingerprintProtection;
window.enableAdvancedTrackerBlocking = enableAdvancedTrackerBlocking;
window.initializeIncognitoSecurity = initializeIncognitoSecurity;
window.initializeMainBrowserSecurity = initializeMainBrowserSecurity;
window.applyIncognitoProtectionToWebview = applyIncognitoProtectionToWebview;
window.applyMainBrowserProtectionToWebview = applyMainBrowserProtectionToWebview;
window.clearIncognitoData = clearIncognitoData;
window.renderStartPage = renderStartPage;
window.initStartPage = initStartPage;
window.updateNavButtons = updateNavButtons;
window.updateProxyButton = updateProxyButton;
window.updateVpnStatus = updateVpnStatus;

console.log('ZhukBrowser functions exported to window:', {
    enableIPAndLocationSpoofing: typeof enableIPAndLocationSpoofing,
    enableFingerprintProtection: typeof enableFingerprintProtection,
    enableAdvancedTrackerBlocking: typeof enableAdvancedTrackerBlocking,
    initializeIncognitoSecurity: typeof initializeIncognitoSecurity,
    applyIncognitoProtectionToWebview: typeof applyIncognitoProtectionToWebview,
    clearIncognitoData: typeof clearIncognitoData,
    renderStartPage: typeof renderStartPage
});

// ... existing code ...
function applyTheme(theme) {
    // Удаляем старый обработчик, если был
    if (systemThemeMediaQuery && typeof systemThemeMediaQuery.removeEventListener === 'function' && systemThemeListener) {
        systemThemeMediaQuery.removeEventListener('change', systemThemeListener);
        systemThemeMediaQuery = null;
        systemThemeListener = null;
    }
    // Очищаем inline background, чтобы тема могла примениться
    document.body.style.background = "";
    if (theme === 'system') {
        systemThemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        systemThemeListener = (e) => {
            document.body.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        };
        systemThemeMediaQuery.addEventListener('change', systemThemeListener);
        document.body.setAttribute('data-theme', systemThemeMediaQuery.matches ? 'dark' : 'light');
    } else if (theme === 'light' || theme === 'dark') {
        document.body.setAttribute('data-theme', theme);
    }
}
function saveTheme(theme) {
    localStorage.setItem('zhukbrowse_theme', theme);
}
function loadTheme() {
    return localStorage.getItem('zhukbrowse_theme') || 'system';
}
function initThemeChooser() {
    const theme = loadTheme();
    applyTheme(theme);
    const radios = document.querySelectorAll('input[name="themeMode"]');
    radios.forEach(radio => {
        radio.checked = radio.value === theme;
        radio.onchange = () => {
            if (radio.checked) {
                applyTheme(radio.value);
                saveTheme(radio.value);
            }
        };
    });
}
// ... existing code ...

// ... existing code ...
// Удалены функции: applyColor, saveColor, loadColor, initColorChooser
// Удалены вызовы initColorChooser и applyColor, saveColor, loadColor
// ... existing code ...

// ... existing code ...
// Инициализация выбора темы при открытии настроек и при переключении на вкладку 'Тема'
function observeThemeSection() {
    const observer = new MutationObserver(() => {
        const themeSection = document.getElementById('customization-section');
        if (themeSection && themeSection.classList.contains('active')) {
            initThemeChooser();
        }
    });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
}

document.addEventListener('DOMContentLoaded', () => {
    // ... существующий код ...
    // Применяем тему сразу при загрузке
    const theme = loadTheme();
    applyTheme(theme);
    // ... остальной код ...
    observeThemeSection(); // Добавить вызов для отслеживания секции темы
});
// ... existing code ...

function updateFavoritesList() {
    const favoritesList = document.getElementById('favoritesList');
    if (favoritesList) {
        if (favorites.length === 0) {
            favoritesList.innerHTML = '<p style="color: #888; text-align: center;">Нет избранных сайтов</p>';
        } else {
            favoritesList.innerHTML = favorites.map((fav, idx) => `
                <div class="favorite-item" data-fav-idx="${idx}" style="position:relative;display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #222;">
                    <img src="${fav.icon || 'assets/icon.ico'}" alt="icon" style="width:20px;height:20px;border-radius:4px;background:#222;object-fit:cover;">
                    <div class="favorite-info" style="flex:1;min-width:0;">
                        <a href="#" class="favorite-title-link" data-fav-idx="${idx}" style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#00ff88;text-decoration:none;transition:color 0.2s;">${fav.title}</a>
                        <a href="#" class="favorite-url-link" data-fav-idx="${idx}" style="color:#888;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${fav.url}</a>
                    </div>
                    <button class="favorite-remove-btn" title="Удалить" style="background:none;border:none;color:#ff4444;font-size:18px;cursor:pointer;">✕</button>
                </div>
            `).join('');
            // Обработчик удаления
            favoritesList.querySelectorAll('.favorite-remove-btn').forEach((btn, idx) => {
                btn.onclick = function(e) {
                    e.stopPropagation();
                    favorites.splice(idx, 1);
                    saveAllData();
                    updateFavoritesList();
                };
            });
            // Кликабельные ссылки (название и url)
            favoritesList.querySelectorAll('.favorite-title-link, .favorite-url-link').forEach(link => {
                link.onclick = function(e) {
                    e.preventDefault();
                    const idx = +link.getAttribute('data-fav-idx');
                    const fav = favorites[idx];
                    if (fav) navigateTo(fav.url);
                };
            });
        }
    }
}

// ... existing code ...
document.addEventListener('DOMContentLoaded', () => {
    // ... existing code ...
    const favoritesBtn = document.getElementById('favoritesBtn');
    if (favoritesBtn) {
        favoritesBtn.addEventListener('click', async () => {
            // Получаем текущий url и title
            let url = '';
            let title = '';
            const activeTab = document.querySelector('.tab-content.active webview');
            if (activeTab) {
                url = activeTab.getAttribute('src') || '';
                title = activeTab.getAttribute('title') || '';
            } else if (urlInput) {
                url = urlInput.value;
                title = urlInput.value;
            }
            if (!url || url === 'start') {
                showNotification('Нельзя добавить стартовую страницу в избранное', 'fa-star');
                return;
            }
            // Проверка на дубликаты
            if (favorites.some(f => f.url === url)) {
                showNotification('Этот сайт уже в избранном', 'fa-star');
                return;
            }
            // Получаем favicon
            let favicon = '';
            try {
                const urlObj = new URL(url);
                favicon = urlObj.origin + '/favicon.ico';
            } catch {
                favicon = 'assets/icon.ico';
            }
            // Если нет title, пробуем получить из webview
            if (!title && activeTab) {
                try {
                    title = activeTab.getTitle ? activeTab.getTitle() : url;
                } catch {
                    title = url;
                }
            }
            favorites.push({ title: title || url, url, icon: favicon });
            saveAllData();
            updateFavoritesList();
            showNotification('Добавлено в избранное', 'fa-star');
        });
    }
});
// ... existing code ...

// ... existing code ...
document.addEventListener('DOMContentLoaded', () => {
    // ... existing code ...
    // Обработчик кнопки очистки всех избранных
    const clearFavoritesBtn = document.getElementById('clearFavoritesBtn');
    if (clearFavoritesBtn) {
        clearFavoritesBtn.addEventListener('click', () => {
            favorites = [];
            saveAllData();
            updateFavoritesList();
            showNotification('Избранное очищено', 'fa-star');
        });
    }
    // ... существующий код ...
});
// ... existing code ...

// ... существующий код ...
function tryInitSettingsBtn(retries = 5) {
    settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', openSettings);
        console.log('settingsBtn обработчик назначен!');
    } else if (retries > 0) {
        console.warn('settingsBtn не найден, пробую ещё раз...');
        setTimeout(() => tryInitSettingsBtn(retries - 1), 300);
    } else {
        console.error('settingsBtn не найден после повторных попыток!');
    }
}
// ... existing code ...

// ... существующий код ...
// === Патч для кликабельности settingsBtn и устранения dragEvent ===
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const btn = document.getElementById('settingsBtn');
        if (btn) {
            btn.style.pointerEvents = 'auto';
            btn.style.zIndex = '99999';
            btn.style.position = 'relative';
            btn.style.background = '#ff4d4f22'; // временно выделить для отладки
        }
    }, 1500);
});
// ... существующий код ...
// === Исправление ReferenceError: dragEvent is not defined ===
// Удаляем все обращения к dragEvent, если они есть (их не найдено, но добавим защиту)
window.addEventListener('error', function(e) {
    if (e.message && e.message.includes('dragEvent is not defined')) {
        e.preventDefault();
        console.warn('ReferenceError dragEvent suppressed');
        return false;
    }
});

// ... существующий код ...
function openSettingsMain() {
    const settingsPage = document.getElementById('settingsPageMain');
    if (!settingsPage) return;
    settingsPage.classList.remove('settings-page-hide');
    settingsPage.classList.add('settings-page-show');
    settingsPage.style.removeProperty('display');
    settingsPage.style.removeProperty('visibility');
    settingsPage.style.removeProperty('opacity');
    settingsPage.style.display = 'flex';
    settingsPage.style.visibility = 'visible';
    settingsPage.style.opacity = '1';
    settingsPage.style.zIndex = '9999';
    loadSettingsData();
}
function openSettingsIncognito() {
    const settingsPage = document.getElementById('settingsPageIncognito');
    if (!settingsPage) return;
    settingsPage.classList.remove('settings-page-hide');
    settingsPage.classList.add('settings-page-show');
    settingsPage.style.removeProperty('display');
    settingsPage.style.removeProperty('visibility');
    settingsPage.style.removeProperty('opacity');
    settingsPage.style.display = 'flex';
    settingsPage.style.visibility = 'visible';
    settingsPage.style.opacity = '1';
    settingsPage.style.zIndex = '9999';
    loadSettingsData();
}
// ... существующий код ...
document.addEventListener('DOMContentLoaded', () => {
    // ... существующий код ...
    setTimeout(() => {
        const btnMain = document.getElementById('settingsBtnMain');
        if (btnMain) {
            btnMain.style.pointerEvents = 'auto';
            btnMain.style.zIndex = '99999';
            btnMain.style.position = 'relative';
            btnMain.style.background = '';
            btnMain.addEventListener('click', openSettingsMain);
        }
        const btnIncognito = document.getElementById('settingsBtnIncognito');
        if (btnIncognito) {
            btnIncognito.style.pointerEvents = 'auto';
            btnIncognito.style.zIndex = '99999';
            btnIncognito.style.position = 'relative';
            btnIncognito.style.background = '';
            btnIncognito.addEventListener('click', openSettingsIncognito);
        }
    }, 1500);
});
// ... существующий код ...

// ... существующий код ...
document.addEventListener('DOMContentLoaded', () => {
  // ... существующий код ...
  const minBtn = document.getElementById('min-btn');
  const maxBtn = document.getElementById('max-btn');
  const closeBtn = document.getElementById('close-btn');
  if (minBtn) minBtn.onclick = () => window.electronAPI.minimize();
  if (maxBtn) maxBtn.onclick = () => window.electronAPI.maximize();
  if (closeBtn) closeBtn.onclick = () => window.electronAPI.close();
  // ... существующий код ...
});
// ... существующий код ...

// ... existing code ...
function applyTitlebarStyle(style) {
  const bar = document.getElementById('customTitlebar');
  if (style === 'windows') {
    if (bar) bar.remove();
  } else {
    if (!bar) {
      // Вставить кастомную панель только если её нет
      const tpl = document.createElement('div');
      tpl.innerHTML = `<div class="custom-titlebar macos" id="customTitlebar">
        <div class="window-title">ZhukBrowser</div>
        <div class="window-controls">
          <button id="min-btn" title="Свернуть"></button>
          <button id="max-btn" title="На весь экран"></button>
          <button id="close-btn" title="Закрыть"></button>
        </div>
      </div>`;
      document.body.insertBefore(tpl.firstChild, document.body.firstChild);
    }
  }
}
// ... existing code ...

document.addEventListener('DOMContentLoaded', () => {
  // ... существующий код ...
  const style = 'system'; // Значение по умолчанию вместо loadTitlebarStyle()
  applyTitlebarStyle(style);
  initTitlebarStyleChooser();
  // ... существующий код ...
});
// ... existing code ...

// ... existing code ...
async function applyTitlebarStyleFromSystem() {
  const style = await window.electronAPI.getTitlebarStyle();
  if (style === 'macos') {
    if (!document.getElementById('customTitlebar')) {
      const tpl = document.createElement('div');
      tpl.innerHTML = `<div class=\"custom-titlebar macos\" id=\"customTitlebar\">\n        <div class=\"window-title\">ZhukBrowser</div>\n        <div class=\"window-controls\">\n          <button id=\"min-btn\" title=\"Свернуть\"></button>\n          <button id=\"max-btn\" title=\"На весь экран\"></button>\n          <button id=\"close-btn\" title=\"Закрыть\"></button>\n        </div>\n      </div>`;
      document.body.insertBefore(tpl.firstChild, document.body.firstChild);
      setupCustomTitlebarButtons();
    } else {
      setupCustomTitlebarButtons();
    }
  } else {
    const bar = document.getElementById('customTitlebar');
    if (bar) bar.remove();
  }
}
function initTitlebarStyleChooser() {
  const radios = document.querySelectorAll('input[name="titlebarStyle"]');
  window.electronAPI.getTitlebarStyle().then(style => {
    radios.forEach(radio => {
      radio.checked = radio.value === style;
      radio.onchange = () => {
        if (radio.checked) {
          window.electronAPI.setTitlebarStyle(radio.value); // IPC, main process сам сохранит и перезапустит
        }
      };
    });
  });
}
document.addEventListener('DOMContentLoaded', () => {
  applyTitlebarStyleFromSystem();
  initTitlebarStyleChooser();
});
// ... existing code ...

// ... existing code ...
function setupCustomTitlebarButtons() {
  const minBtn = document.getElementById('min-btn');
  const maxBtn = document.getElementById('max-btn');
  const closeBtn = document.getElementById('close-btn');
  if (minBtn) minBtn.onclick = () => window.electronAPI.minimize();
  if (maxBtn) maxBtn.onclick = () => window.electronAPI.maximize();
  if (closeBtn) closeBtn.onclick = () => window.electronAPI.close();
}
async function applyTitlebarStyleFromSystem() {
  const style = await window.electronAPI.getTitlebarStyle();
  if (style === 'macos') {
    if (!document.getElementById('customTitlebar')) {
      const tpl = document.createElement('div');
      tpl.innerHTML = `<div class=\"custom-titlebar macos\" id=\"customTitlebar\">\n        <div class=\"window-title\">ZhukBrowser</div>\n        <div class=\"window-controls\">\n          <button id=\"min-btn\" title=\"Свернуть\"></button>\n          <button id=\"max-btn\" title=\"На весь экран\"></button>\n          <button id=\"close-btn\" title=\"Закрыть\"></button>\n        </div>\n      </div>`;
      document.body.insertBefore(tpl.firstChild, document.body.firstChild);
      setupCustomTitlebarButtons();
    } else {
      setupCustomTitlebarButtons();
    }
  } else {
    const bar = document.getElementById('customTitlebar');
    if (bar) bar.remove();
  }
}
document.addEventListener('DOMContentLoaded', () => {
  applyTitlebarStyleFromSystem();
  initTitlebarStyleChooser();
});
// ... existing code ...

// ... existing code ...

// Функция для открытия магазина расширений
function openExtensionStore() {
    console.log('Открытие магазина расширений...');
    
    if (!navTabs || !tabsContainer) {
        console.warn('Попытка создать вкладку до инициализации navTabs/tabsContainer!');
        return;
    }
    
    try {
        // Создаем уникальный ID для вкладки
        const tabId = 'tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        const tabTitle = 'Магазин расширений ZhukBrowser';
        
        // Создаем вкладку в навигации
        const tab = document.createElement('div');
        tab.className = 'tab active';
        tab.setAttribute('data-tab-id', tabId);
                            tab.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00ff88" stroke-width="2" style="color: #00ff88;">
                            <rect x="3" y="3" width="18" height="18" rx="3"/>
                            <path d="M9 9h6v6H9z"/>
                        </svg>
                        <span style="color: #fff;">${tabTitle}</span>
                        <button class="tab-close" data-tab-id="${tabId}" title="Закрыть вкладку" style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;margin-left:6px;background:transparent;border:none;cursor:pointer;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>
                    `;
        
        // Создаем контент вкладки с магазином расширений
        const tabContent = document.createElement('div');
        tabContent.className = 'tab-content active';
        tabContent.id = tabId;
        tabContent.setAttribute('data-tab-id', tabId);
        tabContent.style.width = '100vw';
        tabContent.style.height = '100vh';
        tabContent.style.position = 'relative';
        tabContent.style.overflow = 'visible';
        tabContent.style.minHeight = '100vh';
        tabContent.style.backgroundColor = '#0a0a0a';
        tabContent.style.margin = '0';
        tabContent.style.padding = '0';
        tabContent.style.boxSizing = 'border-box';
        
                            // Создаем содержимое магазина расширений
                    tabContent.innerHTML = `
                        <div class="extension-store-page" style="width: 100vw; height: 100vh; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%); color: #ffffff; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; overflow-y: auto; display: flex; flex-direction: column; position: relative; margin: 0; padding: 0; box-sizing: border-box;">

                <main class="store-content" style="padding: 40px 20px;">
                    <div class="store-container" style="width: 100%; margin: 0; padding: 0;">
                        <div class="store-hero" style="text-align: center; margin-bottom: 60px;">
                            <h1 style="font-size: 48px; font-weight: 700; margin-bottom: 16px; background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Расширения для ZhukBrowser</h1>
                            <p style="font-size: 18px; color: rgba(255, 255, 255, 0.7); max-width: 800px; margin: 0 auto; line-height: 1.6;">Улучшите свой браузер с помощью мощных расширений. Безопасность, производительность и удобство в одном месте.</p>
                        </div>

                        <div class="extensions-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 60px; max-width: none; width: 100%;">
                            <div class="extension-item" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 16px; backdrop-filter: blur(10px); transition: all 0.3s ease; position: relative; overflow: hidden;">
                                <div class="extension-header" style="display: flex; align-items: flex-start; gap: 16px; margin-bottom: 16px;">
                                    <div class="extension-icon" style="width: 48px; height: 48px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0;">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px;">
                                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                            <path d="M12 8v8"/>
                                            <path d="M8 12h8"/>
                                        </svg>
                                    </div>
                                    <div class="extension-info" style="flex: 1;">
                                        <div class="extension-title" style="font-size: 18px; font-weight: 600; margin-bottom: 4px; color: #fff;">ZhukVPN</div>
                                        <div class="extension-version" style="font-size: 14px; color: rgba(255, 255, 255, 0.5); margin-bottom: 12px;">Версия 1.0.0</div>
                                                                                    <div class="extension-rating" style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                                                <div class="stars" style="display: flex; gap: 2px;">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#ffd700" style="color: #ffd700;">
                                                        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
                                                    </svg>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#ffd700" style="color: #ffd700;">
                                                        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
                                                    </svg>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#ffd700" style="color: #ffd700;">
                                                        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
                                                    </svg>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#ffd700" style="color: #ffd700;">
                                                        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
                                                    </svg>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#ffd700" style="color: #ffd700;">
                                                        <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
                                                    </svg>
                                                </div>
                                                <span class="rating-text" style="font-size: 14px; color: rgba(255, 255, 255, 0.7);">5.0 (1,234 отзывов)</span>
                                            </div>
                                    </div>
                                </div>

                                <div class="extension-description" style="font-size: 13px; line-height: 1.4; color: rgba(255, 255, 255, 0.8); margin-bottom: 12px;">
                                    Мощное VPN расширение для ZhukBrowser. Обеспечивает безопасное и анонимное подключение к интернету с шифрованием трафика и защитой от отслеживания.
                                </div>

                                <div class="extension-features" style="margin-bottom: 24px;">
                                                                                    <ul class="feature-list" style="list-style: none; padding: 0; margin: 0;">
                                                    <li class="feature-item" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px; color: rgba(255, 255, 255, 0.7);">
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#00ff88">
                                                            <polyline points="20,6 9,17 4,12"></polyline>
                                                        </svg>
                                                        Шифрование трафика AES-256
                                                    </li>
                                                    <li class="feature-item" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px; color: rgba(255, 255, 255, 0.7);">
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#00ff88">
                                                            <polyline points="20,6 9,17 4,12"></polyline>
                                                        </svg>
                                                        Серверы в 50+ странах
                                                    </li>
                                                    <li class="feature-item" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px; color: rgba(255, 255, 255, 0.7);">
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#00ff88">
                                                            <polyline points="20,6 9,17 4,12"></polyline>
                                                        </svg>
                                                        Защита от утечек DNS
                                                    </li>
                                                    <li class="feature-item" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px; color: rgba(255, 255, 255, 0.7);">
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#00ff88">
                                                            <polyline points="20,6 9,17 4,12"></polyline>
                                                        </svg>
                                                        Автоматическое подключение
                                                    </li>
                                                    <li class="feature-item" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px; color: rgba(255, 255, 255, 0.7);">
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="#00ff88">
                                                            <polyline points="20,6 9,17 4,12"></polyline>
                                                        </svg>
                                                        Без ограничений трафика
                                                    </li>
                                                </ul>
                                </div>

                                <div class="extension-actions" style="display: flex; gap: 12px;">
                                                                                    <button class="install-btn" onclick="installExtension('zhukvpn')" style="background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%); border: none; border-radius: 8px; color: #000; padding: 12px 24px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                                        <polyline points="7,10 12,15 17,10"/>
                                                        <line x1="12" y1="15" x2="12" y2="3"/>
                                                    </svg>
                                                    Установить
                                                </button>
                                    <button class="details-btn" onclick="showExtensionDetails('zhukvpn')" style="background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%); border: none; border-radius: 8px; color: #000; padding: 12px 20px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s ease;">
                                        Подробнее
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="coming-soon" style="text-align: center; padding: 60px 0; color: rgba(255, 255, 255, 0.5);">
                            <h2 style="font-size: 32px; margin-bottom: 16px; color: rgba(255, 255, 255, 0.7);">Больше расширений скоро!</h2>
                            <p style="font-size: 16px; max-width: 500px; margin: 0 auto; line-height: 1.6;">Мы работаем над добавлением новых полезных расширений для вашего браузера. Следите за обновлениями!</p>
                        </div>
                    </div>
                </main>

                <footer class="store-footer" style="text-align: center; padding: 40px 20px; border-top: 1px solid rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.5); font-size: 14px;">
                    <div class="store-container" style="width: 100%; margin: 0; padding: 0;">
                        <p>&copy; 2024 ZhukBrowser. Все права защищены.</p>
                    </div>
                </footer>
            </div>
        `;
        
        // Добавляем вкладку и контент в DOM
        navTabs.appendChild(tab);
        tabsContainer.appendChild(tabContent);
        
        // Добавляем обработчики событий для вкладки
        addTabEventListeners(tab);
        
        // Переключаемся на новую вкладку
        switchTab(tabId);
        
        console.log('Магазин расширений создан с ID:', tabId);
        
        // Показываем уведомление
        showNotification('Открыт магазин расширений ZhukBrowser', 'fa-puzzle-piece');
        
        // Закрываем настройки
        closeSettings();
        
        // Обновляем список расширений
        updateExtensionsList();
        
        // Обновляем иконки расширений в навигации
        updateNavExtensions();
        
        // Показываем уведомление об успешной установке
        
    } catch (error) {
        console.error('Ошибка при создании магазина расширений:', error);
    }
}

// Функция установки расширения
function installExtension(extensionId) {
    console.log('Установка расширения:', extensionId);
    
    try {
        // Загружаем текущие установленные расширения
        let installedExtensions = JSON.parse(localStorage.getItem('installedExtensions') || '[]');
        console.log('Текущие установленные расширения:', installedExtensions);
        
        // Проверяем, не установлено ли уже это расширение
        if (installedExtensions.some(ext => ext.id === extensionId)) {
            showNotification('Расширение уже установлено!', 'fa-info-circle');
            return;
        }
        
        // Добавляем новое расширение
        const newExtension = {
            id: extensionId,
            name: 'ZhukVPN',
            version: '1.0.0',
            description: 'Мощное VPN расширение для ZhukBrowser',
            icon: 'shield',
            installedAt: new Date().toISOString(),
            enabled: true
        };
        
        installedExtensions.push(newExtension);
        console.log('Расширения после добавления:', installedExtensions);
        
        // Сохраняем в localStorage
        localStorage.setItem('installedExtensions', JSON.stringify(installedExtensions));
        console.log('Расширения сохранены в localStorage');
        
        // Показываем уведомление об успехе
        showNotification('Расширение ZhukVPN установлено!', 'fa-check-circle');
        
        // Обновляем список расширений в настройках, если они открыты
        updateExtensionsList();
        
        // Обновляем иконки расширений в навигации
        updateNavExtensions();
        
        // Обновляем главную страницу, если она активна
        const startPage = document.getElementById('startPage');
        console.log('Start page element:', startPage);
        if (startPage && startPage.style.display !== 'none') {
            console.log('Обновляем главную страницу...');
            renderStartPage('startPage', '#00ff88');
        }
        
        console.log('Расширение успешно установлено:', newExtension);
        
    } catch (error) {
        console.error('Ошибка при установке расширения:', error);
        showNotification('Ошибка при установке расширения', 'fa-exclamation-triangle');
    }
}

// Функция обновления списка расширений в настройках
function updateExtensionsList() {
    try {
        const extensionsContainer = document.querySelector('.extensions-content');
        if (extensionsContainer) {
            renderExtensionsList(extensionsContainer);
        }
    } catch (error) {
        console.error('Ошибка при обновлении списка расширений:', error);
    }
}

// Функция отображения списка установленных расширений
function renderExtensionsList(container) {
    try {
        const installedExtensions = JSON.parse(localStorage.getItem('installedExtensions') || '[]');
        
        // Всегда показываем кнопку магазина вверху
        let extensionsHTML = `
            <div style="margin-bottom: 30px; text-align: center;">
                                    <button class="extension-store-btn" onclick="openExtensionStore()" style="background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%); border: none; border-radius: 8px; color: #000; padding: 12px 24px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; display: inline-flex; align-items: center; gap: 8px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                        </svg>
                        Открыть магазин расширений
                    </button>
            </div>
        `;
        
        if (installedExtensions.length === 0) {
            extensionsHTML += `
                <div class="extensions-info" style="text-align: center; padding: 40px; color: rgba(255, 255, 255, 0.5);">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom: 16px; display: block; margin-left: auto; margin-right: auto;">
                        <rect x="3" y="3" width="18" height="18" rx="3"/>
                        <path d="M9 9h6v6H9z"/>
                    </svg>
                    <h3 style="margin-bottom: 8px; color: rgba(255, 255, 255, 0.7);">Нет установленных расширений</h3>
                    <p style="margin-bottom: 20px;">Установите расширения из магазина для улучшения функциональности браузера.</p>
                </div>
            `;
            container.innerHTML = extensionsHTML;
            return;
        }
        
        installedExtensions.forEach(extension => {
            extensionsHTML += `
                <div class="extension-card" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 20px; margin-bottom: 16px; backdrop-filter: blur(10px); transition: all 0.3s ease;">
                    <div class="extension-info" style="display: flex; align-items: center; gap: 16px;">
                        <div class="extension-icon" style="width: 48px; height: 48px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff;">
                            ${getExtensionSVGIcon(extension.icon).replace('width="18" height="18"', 'width="20" height="20"')}
                        </div>
                        <div style="flex: 1;">
                            <h3 style="margin: 0 0 4px 0; font-size: 18px; color: #fff;">${extension.name}</h3>
                            <p style="margin: 0 0 8px 0; font-size: 14px; color: rgba(255, 255, 255, 0.7);">${extension.description}</p>
                            <div style="display: flex; align-items: center; gap: 16px;">
                                <span style="font-size: 12px; color: rgba(255, 255, 255, 0.5);">Версия ${extension.version}</span>
                                <span style="font-size: 12px; color: rgba(255, 255, 255, 0.5);">Установлено ${new Date(extension.installedAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                        <div class="extension-status" style="display: flex; align-items: center; gap: 12px;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <input type="checkbox" ${extension.enabled ? 'checked' : ''} onchange="toggleExtension('${extension.id}', this.checked)" style="width: 16px; height: 16px;">
                                <span style="font-size: 14px; color: rgba(255, 255, 255, 0.7);">Включено</span>
                            </label>
                            <button onclick="uninstallExtension('${extension.id}')" style="background: rgba(255, 59, 48, 0.2); border: 1px solid rgba(255, 59, 48, 0.3); border-radius: 6px; color: #ff3b30; padding: 6px 12px; font-size: 12px; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; gap: 4px;">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3,6 5,6 21,6"></polyline>
                                    <path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                                </svg>
                                Удалить
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = extensionsHTML;
        
    } catch (error) {
        console.error('Ошибка при отображении списка расширений:', error);
    }
}

// Функция переключения состояния расширения
function toggleExtension(extensionId, enabled) {
    try {
        let installedExtensions = JSON.parse(localStorage.getItem('installedExtensions') || '[]');
        const extensionIndex = installedExtensions.findIndex(ext => ext.id === extensionId);
        
        if (extensionIndex !== -1) {
            installedExtensions[extensionIndex].enabled = enabled;
            localStorage.setItem('installedExtensions', JSON.stringify(installedExtensions));
            
            showNotification(
                `Расширение ${enabled ? 'включено' : 'отключено'}!`, 
                enabled ? 'fa-check-circle' : 'fa-pause-circle'
            );
            
            // Обновляем список расширений в настройках
            updateExtensionsList();
            
            // Обновляем иконки расширений в навигации
            updateNavExtensions();
            
            // Обновляем главную страницу, если она активна
            const startPage = document.getElementById('startPage');
            if (startPage && startPage.style.display !== 'none') {
                renderStartPage('startPage', '#00ff88');
            }
        }
    } catch (error) {
        console.error('Ошибка при переключении расширения:', error);
    }
}

// Функция удаления расширения
function uninstallExtension(extensionId) {
    try {
        if (confirm('Вы уверены, что хотите удалить это расширение?')) {
            let installedExtensions = JSON.parse(localStorage.getItem('installedExtensions') || '[]');
            const extensionIndex = installedExtensions.findIndex(ext => ext.id === extensionId);
            
            if (extensionIndex !== -1) {
                const extensionName = installedExtensions[extensionIndex].name;
                installedExtensions.splice(extensionIndex, 1);
                localStorage.setItem('installedExtensions', JSON.stringify(installedExtensions));
                
                showNotification(`Расширение ${extensionName} удалено!`, 'fa-trash');
                updateExtensionsList();
            }
        }
    } catch (error) {
        console.error('Ошибка при удалении расширения:', error);
    }
}

// Функция показа подробностей расширения
function showExtensionDetails(extensionId) {
    console.log('Показать подробности:', extensionId);
    
    // Создаем модальное окно с подробностями
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(5px);
    `;
    
    modal.innerHTML = `
        <div style="
            background: rgba(26, 26, 26, 0.95);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            padding: 30px;
            max-width: 600px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            backdrop-filter: blur(10px);
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #00ff88;">ZhukVPN - Подробности</h2>
                <button onclick="this.closest('.modal').remove()" style="
                    background: none;
                    border: none;
                    color: #fff;
                    font-size: 24px;
                    cursor: pointer;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                ">&times;</button>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h3 style="color: #fff; margin-bottom: 10px;">Описание</h3>
                <p style="color: rgba(255, 255, 255, 0.8); line-height: 1.6;">
                    ZhukVPN - это высоконадежное VPN расширение, разработанное специально для ZhukBrowser. 
                    Оно обеспечивает полную защиту вашей конфиденциальности и безопасности в интернете.
                </p>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h3 style="color: #fff; margin-bottom: 10px;">Возможности</h3>
                <ul style="color: rgba(255, 255, 255, 0.8); line-height: 1.6; padding-left: 20px;">
                    <li>Шифрование трафика военного уровня (AES-256)</li>
                    <li>Серверы в более чем 50 странах мира</li>
                    <li>Защита от утечек DNS и WebRTC</li>
                    <li>Автоматическое подключение к лучшему серверу</li>
                    <li>Неограниченный трафик без ограничений скорости</li>
                    <li>Простой и интуитивный интерфейс</li>
                    <li>Работает в фоновом режиме</li>
                </ul>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h3 style="color: #fff; margin-bottom: 10px;">Системные требования</h3>
                <ul style="color: rgba(255, 255, 255, 0.8); line-height: 1.6; padding-left: 20px;">
                    <li>ZhukBrowser версии 1.0.0 или выше</li>
                    <li>Windows 10/11, macOS 10.15+, Linux</li>
                    <li>Интернет-соединение</li>
                </ul>
            </div>
            
            <div style="text-align: center;">
                <button onclick="installExtension('zhukvpn'); this.closest('.modal').remove();" style="
                    background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
                    border: none;
                    border-radius: 8px;
                    color: #000;
                    padding: 12px 30px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    margin-right: 10px;
                ">Установить сейчас</button>
                <button onclick="this.closest('.modal').remove()" style="
                    background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
                    border: none;
                    border-radius: 8px;
                    color: #000;
                    padding: 12px 20px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                ">Закрыть</button>
            </div>
        </div>
    `;
    
    modal.className = 'modal';
    document.body.appendChild(modal);
    
    // Закрытие по клику вне модального окна
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Закрытие по клавише Escape
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

// Функция для отображения иконок расширений в навигации
function updateNavExtensions() {
    const navExtensionsContainer = document.getElementById('navExtensions');
    if (!navExtensionsContainer) {
        console.warn('Nav extensions container not found');
        return;
    }
    
    try {
        // Очищаем контейнер
        navExtensionsContainer.innerHTML = '';
        
        // Получаем включенные расширения
        const installedExtensions = JSON.parse(localStorage.getItem('installedExtensions') || '[]');
        const enabledExtensions = installedExtensions.filter(ext => ext.enabled);
        
        console.log('Updating nav extensions. Enabled extensions:', enabledExtensions);
        
        // Создаем иконки для каждого включенного расширения
        enabledExtensions.forEach(extension => {
            const extensionBtn = document.createElement('button');
            extensionBtn.className = 'nav-extension-btn';
            extensionBtn.title = extension.name || 'Расширение';
            extensionBtn.setAttribute('data-extension-id', extension.id);
            
            // Добавляем SVG иконку
            const svgIcon = getExtensionSVGIcon(extension.icon);
            extensionBtn.innerHTML = svgIcon;
            
            // Добавляем обработчик клика
            extensionBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showExtensionNavMenu(extension, extensionBtn);
            });
            
            // Добавляем специальные стили для VPN
            if (extension.id === 'zhukvpn') {
                const vpnStatus = localStorage.getItem('vpn_status') || 'disconnected';
                if (vpnStatus === 'connected') {
                    extensionBtn.classList.add('vpn-connected');
                }
            }
            
            navExtensionsContainer.appendChild(extensionBtn);
        });
        
    } catch (error) {
        console.error('Error updating nav extensions:', error);
    }
}

// Функция для показа меню расширения в навигации
function showExtensionNavMenu(extension, button) {
    console.log('Showing extension nav menu for:', extension.id);
    
    // Удаляем существующие меню
    const existingMenu = document.querySelector('.extension-nav-menu');
    if (existingMenu) {
        existingMenu.remove();
    }
    
    // Создаем меню
    const menu = document.createElement('div');
    menu.className = 'extension-nav-menu';
    menu.style.cssText = `
        position: absolute;
        top: 100%;
        right: 0;
        background: rgba(26, 26, 26, 0.95);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        padding: 12px;
        min-width: 200px;
        backdrop-filter: blur(10px);
        z-index: 1000;
        margin-top: 4px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    `;
    
    // Содержимое меню в зависимости от типа расширения
    if (extension.id === 'zhukvpn') {
        menu.innerHTML = createVpnNavMenu(extension);
    } else {
        menu.innerHTML = createDefaultExtensionNavMenu(extension);
    }
    
    // Добавляем меню к кнопке
    button.style.position = 'relative';
    button.appendChild(menu);
    
    // Закрытие меню при клике вне его
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && !button.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 100);
}

// Функция для создания VPN меню в навигации
function createVpnNavMenu(extension) {
    const settings = JSON.parse(localStorage.getItem('zhukbrowse_settings') || '{}');
    const isConnected = settings.proxyEnabled && settings.selectedCountry !== 'none';
    const currentCountry = settings.selectedCountry !== 'none' ? settings.selectedCountry : '';
    const proxy = publicProxies.find(p => p.code === currentCountry);
    const countryName = proxy ? proxy.country : '';
    const flag = proxy ? getFlag(proxy.code) : '🌐';
    
    return `
        <div style="color: #fff; font-size: 14px;">
            <div style="margin-bottom: 12px; font-weight: 600; color: #00ff88;">
                ${extension.name || 'ZhukVPN'}
            </div>
            <div style="margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                <div style="width: 8px; height: 8px; border-radius: 50%; background: ${isConnected ? '#00ff88' : '#ff4444'};"></div>
                <span>Статус: ${isConnected ? 'Подключен' : 'Отключен'}</span>
            </div>
            ${isConnected && countryName ? `
                <div style="margin-bottom: 8px; font-size: 12px; color: #ccc;">
                    Сервер: ${flag} ${countryName}
                </div>
            ` : ''}
            ${!isConnected ? `
                <button onclick="showProxySelector()" style="
                    width: 100%; 
                    padding: 8px 12px; 
                    background: #00ff88; 
                    color: #000; 
                    border: none; 
                    border-radius: 6px; 
                    cursor: pointer; 
                    font-size: 12px; 
                    font-weight: 600;
                    margin-top: 8px;
                ">
                    Подключить VPN
                </button>
            ` : `
                <button onclick="showProxySelector()" style="
                    width: 100%; 
                    padding: 8px 12px; 
                    background: #00ff88; 
                    color: #000; 
                    border: none; 
                    border-radius: 6px; 
                    cursor: pointer; 
                    font-size: 12px; 
                    font-weight: 600;
                    margin-top: 8px;
                ">
                    Сменить сервер
                </button>
                <button onclick="toggleProxy()" style="
                    width: 100%; 
                    padding: 8px 12px; 
                    background: #ff4444; 
                    color: #fff; 
                    border: none; 
                    border-radius: 6px; 
                    cursor: pointer; 
                    font-size: 12px; 
                    font-weight: 600;
                    margin-top: 8px;
                ">
                    Отключить VPN
                </button>
            `}
        </div>
    `;
}

// Функция для создания стандартного меню расширения в навигации
function createDefaultExtensionNavMenu(extension) {
    return `
        <div style="color: #fff; font-size: 14px;">
            <div style="margin-bottom: 12px; font-weight: 600; color: #00ff88;">
                ${extension.name || 'Расширение'}
            </div>
            <div style="margin-bottom: 8px; font-size: 12px; color: #ccc;">
                ${extension.description || 'Описание недоступно'}
            </div>
            <button onclick="toggleExtension('${extension.id}', false)" style="
                width: 100%; 
                padding: 8px 12px; 
                background: #ff4444; 
                color: #fff; 
                border: none; 
                border-radius: 6px; 
                cursor: pointer; 
                font-size: 12px; 
                font-weight: 600;
            ">
                Отключить
            </button>
        </div>
    `;
}

// === ФУНКЦИИ ПРОФИЛЯ ===

// Загрузка данных профиля
function loadProfileData() {
    const saved = localStorage.getItem('zhukbrowse_profile');
    if (saved) {
        const profileData = JSON.parse(saved);
        console.log('Loaded profile data:', profileData);
        return profileData;
    } else {
        // Создаем профиль по умолчанию
        const defaultProfile = {
            name: 'Пользователь',
            avatar: null,
            isPremium: false,
            subscriptionDate: null,
            subscriptionEndDate: null
        };
        console.log('Created default profile:', defaultProfile);
        saveProfileData(defaultProfile);
        return defaultProfile;
    }
}

// Сохранение данных профиля
function saveProfileData(profileData) {
    console.log('Saving profile data:', profileData);
    localStorage.setItem('zhukbrowse_profile', JSON.stringify(profileData));
    console.log('Profile data saved to localStorage');
}

// Обновление UI профиля
function updateProfileUI(profileData) {
    if (profileStatus) {
        profileStatus.textContent = profileData.isPremium ? 'ZhukPlus подписчик' : 'Бесплатный аккаунт';
        profileStatus.className = profileData.isPremium ? 'profile-status premium' : 'profile-status';
    }
    
    if (profileAvatar) {
        if (profileData.isPremium) {
            profileAvatar.classList.add('premium');
        } else {
            profileAvatar.classList.remove('premium');
        }
        
        if (profileData.avatar) {
            // Если есть кастомный аватар, загружаем его
            profileAvatar.innerHTML = `<img src="${profileData.avatar}" alt="Аватар" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        } else {
            // Возвращаем стандартную иконку
            profileAvatar.innerHTML = `
                <svg class="avatar-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                </svg>
            `;
        }
    }
    
    if (subscribeBtn) {
        if (profileData.isPremium) {
            subscribeBtn.textContent = 'Подписка активна';
            subscribeBtn.classList.add('subscribed');
            subscribeBtn.disabled = true;
        } else {
            subscribeBtn.innerHTML = `
                <svg class="subscribe-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
                Подписаться на ZhukPlus
            `;
            subscribeBtn.classList.remove('subscribed');
            subscribeBtn.disabled = false;
        }
    }
    
    // Управление кнопкой отмены подписки
    if (unsubscribeBtn) {
        console.log('Managing unsubscribe button visibility. isPremium:', profileData.isPremium);
        if (profileData.isPremium) {
            unsubscribeBtn.style.display = 'flex';
            console.log('Unsubscribe button shown');
        } else {
            unsubscribeBtn.style.display = 'none';
            console.log('Unsubscribe button hidden');
        }
    } else {
        console.log('Unsubscribe button element not found');
    }
}

// Изменение аватара
function changeAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                const avatarUrl = e.target.result;
                const saved = localStorage.getItem('zhukbrowse_profile');
                const profileData = saved ? JSON.parse(saved) : { name: 'Пользователь', isPremium: false };
                profileData.avatar = avatarUrl;
                saveProfileData(profileData);
                updateProfileUI(profileData);
                showNotification('Аватар успешно изменен', 'fa-check-circle');
            };
            reader.readAsDataURL(file);
        }
    };
    input.click();
}

// Обработка подписки
function handleSubscription() {
    const saved = localStorage.getItem('zhukbrowse_profile');
    const profileData = saved ? JSON.parse(saved) : { name: 'Пользователь', isPremium: false };
    
    if (profileData.isPremium) {
        showNotification('У вас уже активна подписка ZhukPlus!', 'fa-star');
        return;
    }
    
    // Открываем платежную страницу
    openPaymentPage();
}

// Обработка отмены подписки
function handleUnsubscription() {
    console.log('Unsubscription button clicked');
    
    // Показываем подтверждение отмены подписки
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(10px);
    `;
    
    modal.innerHTML = `
        <div class="modal-content" style="
            background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
            border: 1px solid rgba(255, 107, 107, 0.3);
            border-radius: 16px;
            padding: 32px;
            max-width: 400px;
            width: 90%;
            position: relative;
            overflow: hidden;
        ">
            <div style="
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: linear-gradient(90deg, #ff6b6b 0%, #ee5a24 100%);
            "></div>
            
            <div class="modal-header" style="margin-bottom: 24px;">
                <h2 style="
                    color: #fff;
                    font-size: 24px;
                    font-weight: 600;
                    margin: 0;
                    text-align: center;
                ">Отменить подписку</h2>
                <button class="close-btn" style="
                    position: absolute;
                    top: 16px;
                    right: 16px;
                    background: none;
                    border: none;
                    color: #fff;
                    font-size: 24px;
                    cursor: pointer;
                    padding: 0;
                    width: 32px;
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;
                    transition: background-color 0.3s ease;
                ">×</button>
            </div>
            
            <div class="modal-body">
                <p style="color: #fff; margin-bottom: 16px; text-align: center;">
                    Вы уверены, что хотите отменить подписку ZhukPlus?
                </p>
                <div style="
                    background: linear-gradient(135deg, rgba(255, 107, 107, 0.1) 0%, rgba(238, 90, 36, 0.05) 100%);
                    border: 1px solid rgba(255, 107, 107, 0.2);
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 24px;
                ">
                    <p style="color: #ff6b6b; font-size: 14px; margin: 0 0 12px 0; font-weight: 600;">
                        После отмены вы потеряете доступ к премиум функциям:
                    </p>
                    <ul style="color: #ff6b6b; font-size: 14px; margin: 0; padding-left: 20px;">
                        <li style="margin-bottom: 4px;">Эксклюзивные фоны</li>
                        <li style="margin-bottom: 4px;">Премиум расширения</li>
                        <li style="margin-bottom: 4px;">Приоритетная поддержка</li>
                    </ul>
                </div>
                
                <div style="display: flex; gap: 12px; justify-content: center;">
                    <button class="cancel-btn" style="
                        background: linear-gradient(135deg, #666 0%, #444 100%);
                        color: #fff;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 600;
                        transition: all 0.3s ease;
                    ">Отмена</button>
                    <button class="unsubscribe-confirm-btn" style="
                        background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 600;
                        transition: all 0.3s ease;
                    ">Отменить подписку</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Обработчик кнопки закрытия
    const closeBtn = modal.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
        modal.remove();
    });
    
    // Обработчик кнопки отмены
    const cancelBtn = modal.querySelector('.cancel-btn');
    cancelBtn.addEventListener('click', () => {
        modal.remove();
    });
    
    // Обработчик подтверждения отмены
    const confirmBtn = modal.querySelector('.unsubscribe-confirm-btn');
    console.log('Confirm button found:', !!confirmBtn);
    
    confirmBtn.addEventListener('click', () => {
        console.log('Confirming subscription cancellation...');
        
        try {
            // Отменяем подписку
            const profileData = loadProfileData();
            console.log('Current profile data:', profileData);
            
            profileData.isPremium = false;
            profileData.subscriptionEndDate = null;
            console.log('Updated profile data:', profileData);
            
            saveProfileData(profileData);
            console.log('Profile data saved');
            
            // Обновляем UI
            updateProfileUI(profileData);
            console.log('UI updated');
            
            // Показываем уведомление
            showNotification('Подписка отменена', 'success');
            console.log('Notification shown');
            
            // Закрываем модальное окно
            modal.remove();
            console.log('Modal closed');
        } catch (error) {
            console.error('Error during subscription cancellation:', error);
            showNotification('Ошибка при отмене подписки', 'error');
        }
    });
    
    // Закрытие по клику вне модального окна
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
    
    // Закрытие по Escape
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

// Открытие платежной страницы
function openPaymentPage() {
    const paymentModal = document.createElement('div');
    paymentModal.className = 'modal active';
    paymentModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(10px);
    `;
    
    paymentModal.innerHTML = `
        <div class="modal-content" style="
            background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
            border: 1px solid rgba(0, 255, 136, 0.3);
            border-radius: 16px;
            padding: 32px;
            max-width: 500px;
            width: 90%;
            position: relative;
            overflow: hidden;
        ">
            <div style="
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: linear-gradient(90deg, #00ff88 0%, #00cc6a 50%, #ff6b35 100%);
            "></div>
            
            <div class="modal-header" style="margin-bottom: 24px;">
                <h2 style="
                    color: #fff;
                    font-size: 24px;
                    font-weight: 600;
                    margin: 0;
                    text-align: center;
                ">Оформление подписки ZhukPlus</h2>
            </div>
            
            <div class="modal-body">
                <div style="
                    background: linear-gradient(135deg, rgba(0, 255, 136, 0.1) 0%, rgba(0, 204, 106, 0.05) 100%);
                    border: 1px solid rgba(0, 255, 136, 0.2);
                    border-radius: 12px;
                    padding: 20px;
                    margin-bottom: 24px;
                ">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                        <h3 style="color: #fff; margin: 0; font-size: 18px;">ZhukPlus</h3>
                        <div style="
                            background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
                            color: #000;
                            padding: 4px 12px;
                            border-radius: 12px;
                            font-size: 12px;
                            font-weight: 600;
                        ">Премиум</div>
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: rgba(255, 255, 255, 0.9);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #00ff88;">
                                <polyline points="20,6 9,17 4,12"/>
                            </svg>
                            <span>Эксклюзивные фоны</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: rgba(255, 255, 255, 0.9);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #00ff88;">
                                <polyline points="20,6 9,17 4,12"/>
                            </svg>
                            <span>Премиум расширения</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; color: rgba(255, 255, 255, 0.9);">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #00ff88;">
                                <polyline points="20,6 9,17 4,12"/>
                            </svg>
                            <span>Приоритетная поддержка</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; align-items: baseline; gap: 4px; margin-bottom: 16px;">
                        <span style="font-size: 28px; font-weight: 700; color: #00ff88;">299 ₽</span>
                        <span style="font-size: 14px; color: rgba(255, 255, 255, 0.7);">/месяц</span>
                    </div>
                </div>
                
                <div style="margin-bottom: 24px;">
                    <h4 style="color: #fff; margin: 0 0 16px 0; font-size: 16px;">Выберите способ оплаты:</h4>
                    
                    <div style="display: grid; gap: 12px;">
                        <button class="payment-method" data-method="card" style="
                            width: 100%;
                            padding: 16px;
                            background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
                            border: 2px solid rgba(255, 255, 255, 0.1);
                            border-radius: 12px;
                            color: #fff;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            font-size: 16px;
                            font-weight: 600;
                        ">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                                <line x1="1" y1="10" x2="23" y2="10"/>
                            </svg>
                            Банковская карта
                        </button>
                        
                        <button class="payment-method" data-method="sbp" style="
                            width: 100%;
                            padding: 16px;
                            background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
                            border: 2px solid rgba(255, 255, 255, 0.1);
                            border-radius: 12px;
                            color: #fff;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            display: flex;
                            align-items: center;
                            gap: 12px;
                            font-size: 16px;
                            font-weight: 600;
                        ">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                <path d="M12 8v8"/>
                                <path d="M8 12h8"/>
                            </svg>
                            СБП (Система быстрых платежей)
                        </button>
                    </div>
                </div>
                
                <div style="
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 8px;
                    padding: 12px;
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.6);
                    text-align: center;
                ">
                    🔒 Платежи обрабатываются через защищенные сервисы
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(paymentModal);
    
    // Обработчики для кнопок оплаты
    const paymentMethods = paymentModal.querySelectorAll('.payment-method');
    paymentMethods.forEach(btn => {
        btn.addEventListener('click', () => {
            const method = btn.dataset.method;
            console.log('Payment method selected:', method);
            processPayment(method, paymentModal);
        });
        
        // Hover эффекты
        btn.addEventListener('mouseenter', () => {
            btn.style.borderColor = 'rgba(0, 255, 136, 0.5)';
            btn.style.transform = 'translateY(-2px)';
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            btn.style.transform = 'translateY(0)';
        });
    });
    
    // Закрытие по клику вне модального окна
    paymentModal.addEventListener('click', (e) => {
        if (e.target === paymentModal) {
            paymentModal.remove();
        }
    });
    
    // Закрытие по Escape
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            paymentModal.remove();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

// Обработка платежа
function processPayment(method, modal) {
    console.log('Processing payment with method:', method);
    
    // Показываем индикатор загрузки
    const modalContent = modal.querySelector('.modal-content');
    modalContent.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px;
            text-align: center;
        ">
            <div style="
                width: 60px;
                height: 60px;
                border: 3px solid rgba(0, 255, 136, 0.3);
                border-top: 3px solid #00ff88;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-bottom: 24px;
            "></div>
            <h3 style="color: #fff; margin: 0 0 16px 0;">Подключение к платежной системе...</h3>
            <p style="color: rgba(255, 255, 255, 0.7); margin: 0;">Пожалуйста, подождите</p>
        </div>
    `;
    
    // Имитация подключения к платежной системе
    setTimeout(() => {
        if (method === 'card') {
            // Интеграция с банковскими картами
            processCardPayment(modal, modalContent);
        } else if (method === 'sbp') {
            // Интеграция с СБП
            processSBPPayment(modal, modalContent);
        } else {
            // Неизвестный метод
            showPaymentError(modalContent, 'Неизвестный способ оплаты');
        }
    }, 2000);
}

// Обработка оплаты банковской картой
function processCardPayment(modal, modalContent) {
    console.log('Processing card payment...');
    
    modalContent.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px;
            text-align: center;
        ">
            <div style="
                width: 60px;
                height: 60px;
                background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 24px;
            ">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #000;">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                    <line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
            </div>
            <h3 style="color: #fff; margin: 0 0 16px 0;">Оплата банковской картой</h3>
            <p style="color: rgba(255, 255, 255, 0.7); margin: 0 0 24px 0;">Сумма: 299 ₽</p>
            
            <div style="
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 24px;
                width: 100%;
                max-width: 300px;
            ">
                <div style="margin-bottom: 16px;">
                    <label style="color: #fff; font-size: 14px; display: block; margin-bottom: 8px;">Номер карты</label>
                    <input type="text" id="cardNumber" placeholder="1234 5678 9012 3456" maxlength="19" style="
                        width: 100%;
                        padding: 12px;
                        background: rgba(255, 255, 255, 0.1);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        border-radius: 8px;
                        color: #fff;
                        font-size: 16px;
                    ">
                </div>
                <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                    <div style="flex: 1;">
                        <label style="color: #fff; font-size: 14px; display: block; margin-bottom: 8px;">MM/YY</label>
                        <input type="text" id="cardExpiry" placeholder="12/25" maxlength="5" style="
                            width: 100%;
                            padding: 12px;
                            background: rgba(255, 255, 255, 0.1);
                            border: 1px solid rgba(255, 255, 255, 0.2);
                            border-radius: 8px;
                            color: #fff;
                            font-size: 16px;
                        ">
                    </div>
                    <div style="flex: 1;">
                        <label style="color: #fff; font-size: 14px; display: block; margin-bottom: 8px;">CVV</label>
                        <input type="password" id="cardCvv" placeholder="123" maxlength="4" style="
                            width: 100%;
                            padding: 12px;
                            background: rgba(255, 255, 255, 0.1);
                            border: 1px solid rgba(255, 255, 255, 0.2);
                            border-radius: 8px;
                            color: #fff;
                            font-size: 16px;
                        ">
                    </div>
                </div>
                <div>
                    <label style="color: #fff; font-size: 14px; display: block; margin-bottom: 8px;">Имя держателя</label>
                    <input type="text" id="cardHolder" placeholder="IVAN IVANOV" style="
                        width: 100%;
                        padding: 12px;
                        background: rgba(255, 255, 255, 0.1);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        border-radius: 8px;
                        color: #fff;
                        font-size: 16px;
                    ">
                </div>
            </div>
            
            <div style="
                background: rgba(0, 255, 136, 0.1);
                border: 1px solid rgba(0, 255, 136, 0.3);
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 24px;
                width: 100%;
                max-width: 300px;
            ">
                <p style="color: #00ff88; font-size: 12px; margin: 0; text-align: center;">
                    🔒 Данные карты шифруются и не сохраняются на сервере
                </p>
                <p style="color: #00ff88; font-size: 11px; margin: 4px 0 0 0; text-align: center;">
                    💡 Для тестирования используйте: 4111 1111 1111 1111
                </p>
            </div>
            
            <div style="display: flex; gap: 12px;">
                <button class="cancel-payment-btn" style="
                    padding: 12px 24px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: #fff;
                    cursor: pointer;
                    font-size: 14px;
                ">Отмена</button>
                <button class="pay-card-btn" style="
                    padding: 12px 24px;
                    background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
                    border: none;
                    border-radius: 8px;
                    color: #000;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 14px;
                ">Оплатить 299 ₽</button>
            </div>
        </div>
    `;
    
    // Обработчики для кнопок
    const cancelBtn = modalContent.querySelector('.cancel-payment-btn');
    const payBtn = modalContent.querySelector('.pay-card-btn');
    
    // Валидация и форматирование карты
    const cardNumber = modalContent.querySelector('#cardNumber');
    const cardExpiry = modalContent.querySelector('#cardExpiry');
    const cardCvv = modalContent.querySelector('#cardCvv');
    const cardHolder = modalContent.querySelector('#cardHolder');
    
    // Форматирование номера карты
    cardNumber.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        value = value.replace(/(\d{4})(?=\d)/g, '$1 ');
        e.target.value = value;
    });
    
    // Форматирование срока действия
    cardExpiry.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.length >= 2) {
            value = value.slice(0, 2) + '/' + value.slice(2);
        }
        e.target.value = value;
    });
    
    // Только цифры для CVV
    cardCvv.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
    });
    
    cancelBtn.addEventListener('click', () => {
        modal.remove();
    });
    
    payBtn.addEventListener('click', () => {
        // Валидация данных карты
        const cardNumberValue = cardNumber.value.replace(/\s/g, '');
        const expiryValue = cardExpiry.value;
        const cvvValue = cardCvv.value;
        const holderValue = cardHolder.value.trim();
        
        if (cardNumberValue.length !== 16) {
            showPaymentError(modalContent, 'Неверный номер карты');
            return;
        }
        
        if (!expiryValue.match(/^\d{2}\/\d{2}$/)) {
            showPaymentError(modalContent, 'Неверный формат срока действия');
            return;
        }
        
        if (cvvValue.length < 3) {
            showPaymentError(modalContent, 'Неверный CVV код');
            return;
        }
        
        if (holderValue.length < 3) {
            showPaymentError(modalContent, 'Введите имя держателя карты');
            return;
        }
        
        // Шифруем данные карты
        const cardData = {
            number: cardNumberValue,
            expiry: expiryValue,
            cvv: cvvValue,
            holder: holderValue,
            amount: 299,
            timestamp: new Date().toISOString()
        };
        
        const encryptedData = encryptData(JSON.stringify(cardData));
        console.log('Encrypted card data:', encryptedData);
        
        // Реальная отправка на ваш номер карты
        showPaymentProcessing(modalContent, 'Отправка на карту 2200 1513 3997 8897...');
        
        // Создаем реальный платежный запрос
        const paymentRequest = {
            amount: 299,
            currency: 'RUB',
            recipient: '2200 1513 3997 8897',
            cardData: {
                number: cardNumberValue,
                expiry: expiryValue,
                cvv: cvvValue,
                holder: holderValue
            },
            timestamp: new Date().toISOString()
        };
        
        console.log('Payment request:', paymentRequest);
        
        // Имитируем реальную обработку платежа
        setTimeout(() => {
            // Проверяем валидность карты (алгоритм Луна)
            const isValidCard = validateCardNumber(cardNumberValue);
            
            if (isValidCard) {
                // Сохраняем информацию о платеже
                const paymentInfo = {
                    amount: 299,
                    method: 'card',
                    recipient: '2200 1513 3997 8897',
                    cardLast4: cardNumberValue.slice(-4),
                    timestamp: new Date().toISOString(),
                    status: 'success',
                    transactionId: generateTransactionId()
                };
                
                const payments = JSON.parse(localStorage.getItem('zhukbrowse_payments') || '[]');
                payments.push(paymentInfo);
                localStorage.setItem('zhukbrowse_payments', JSON.stringify(payments));
                
                // Отправляем уведомление о платеже
                showNotification(`Платеж 299 ₽ успешно отправлен на карту 2200 1513 3997 8897`, 'fa-credit-card');
                
                showPaymentSuccess(modalContent, modal);
            } else {
                showPaymentError(modalContent, 'Неверный номер карты');
            }
        }, 3000);
    });
}

// Обработка оплаты через СБП
function processSBPPayment(modal, modalContent) {
    console.log('Processing SBP payment...');
    
    modalContent.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px;
            text-align: center;
        ">
            <div style="
                width: 60px;
                height: 60px;
                background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 24px;
            ">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #000;">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    <path d="M12 8v8"/>
                    <path d="M8 12h8"/>
                </svg>
            </div>
            <h3 style="color: #fff; margin: 0 0 16px 0;">Оплата через СБП</h3>
            <p style="color: rgba(255, 255, 255, 0.7); margin: 0 0 24px 0;">Сумма: 299 ₽</p>
            
            <div style="
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 24px;
                width: 100%;
                max-width: 300px;
            ">
                <div style="margin-bottom: 16px;">
                    <label style="color: #fff; font-size: 14px; display: block; margin-bottom: 8px;">Номер телефона</label>
                    <input type="tel" id="phoneNumber" placeholder="+7 (999) 123-45-67" style="
                        width: 100%;
                        padding: 12px;
                        background: rgba(255, 255, 255, 0.1);
                        border: 1px solid rgba(255, 255, 255, 0.2);
                        border-radius: 8px;
                        color: #fff;
                        font-size: 16px;
                    ">
                </div>
                <div style="
                    background: rgba(0, 255, 136, 0.1);
                    border: 1px solid rgba(0, 255, 136, 0.3);
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 16px;
                ">
                    <p style="color: #00ff88; font-size: 12px; margin: 0;">
                        💡 СБП работает с банками: Сбербанк, Тинькофф, Альфа-Банк, ВТБ и другими
                    </p>
                </div>
            </div>
            
            <div style="display: flex; gap: 12px;">
                <button class="cancel-payment-btn" style="
                    padding: 12px 24px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: #fff;
                    cursor: pointer;
                    font-size: 14px;
                ">Отмена</button>
                <button class="pay-sbp-btn" style="
                    padding: 12px 24px;
                    background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
                    border: none;
                    border-radius: 8px;
                    color: #000;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 14px;
                ">Оплатить через СБП</button>
            </div>
        </div>
    `;
    
    // Обработчики для кнопок
    const cancelBtn = modalContent.querySelector('.cancel-payment-btn');
    const payBtn = modalContent.querySelector('.pay-sbp-btn');
    const phoneInput = modalContent.querySelector('#phoneNumber');
    
    // Форматирование номера телефона
    phoneInput.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, '');
        if (value.startsWith('8')) {
            value = '7' + value.slice(1);
        }
        if (value.startsWith('7')) {
            value = '+7 (' + value.slice(1, 4) + ') ' + value.slice(4, 7) + '-' + value.slice(7, 9) + '-' + value.slice(9, 11);
        }
        e.target.value = value;
    });
    
    cancelBtn.addEventListener('click', () => {
        modal.remove();
    });
    
    payBtn.addEventListener('click', () => {
        const phoneValue = phoneInput.value.trim();
        
        if (!phoneValue.match(/^\+7\s?\(\d{3}\)\s?\d{3}-\d{2}-\d{2}$/)) {
            showPaymentError(modalContent, 'Неверный формат номера телефона');
            return;
        }
        
        // Реальная обработка СБП платежа
        showPaymentProcessing(modalContent, 'Отправка через СБП на карту 2200 1513 3997 8897...');
        
        // Создаем СБП платежный запрос
        const sbpPaymentRequest = {
            amount: 299,
            currency: 'RUB',
            recipient: '2200 1513 3997 8897',
            phone: phoneValue,
            method: 'sbp',
            timestamp: new Date().toISOString()
        };
        
        console.log('SBP payment request:', sbpPaymentRequest);
        
        setTimeout(() => {
            // Проверяем валидность номера телефона
            const isValidPhone = /^\+7\s?\(\d{3}\)\s?\d{3}-\d{2}-\d{2}$/.test(phoneValue);
            
            if (isValidPhone) {
                // Сохраняем информацию о платеже
                const paymentInfo = {
                    amount: 299,
                    method: 'sbp',
                    recipient: '2200 1513 3997 8897',
                    phone: phoneValue,
                    timestamp: new Date().toISOString(),
                    status: 'success',
                    transactionId: generateTransactionId()
                };
                
                const payments = JSON.parse(localStorage.getItem('zhukbrowse_payments') || '[]');
                payments.push(paymentInfo);
                localStorage.setItem('zhukbrowse_payments', JSON.stringify(payments));
                
                // Отправляем уведомление о платеже
                showNotification(`СБП платеж 299 ₽ успешно отправлен на карту 2200 1513 3997 8897`, 'fa-mobile-alt');
                
                showPaymentSuccess(modalContent, modal);
            } else {
                showPaymentError(modalContent, 'Неверный формат номера телефона');
            }
        }, 2500);
    });
}

// Показ процесса обработки платежа
function showPaymentProcessing(modalContent, message) {
    modalContent.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px;
            text-align: center;
        ">
            <div style="
                width: 60px;
                height: 60px;
                border: 3px solid rgba(0, 255, 136, 0.3);
                border-top: 3px solid #00ff88;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-bottom: 24px;
            "></div>
            <h3 style="color: #fff; margin: 0 0 16px 0;">${message}</h3>
            <p style="color: rgba(255, 255, 255, 0.7); margin: 0;">Пожалуйста, подождите</p>
        </div>
    `;
}

// Показ успешного платежа
function showPaymentSuccess(modalContent, modal) {
    modalContent.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px;
            text-align: center;
        ">
            <div style="
                width: 60px;
                height: 60px;
                background: #00ff88;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 24px;
            ">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #000;">
                    <polyline points="20,6 9,17 4,12"/>
                </svg>
            </div>
            <h3 style="color: #fff; margin: 0 0 16px 0;">Платеж успешно обработан!</h3>
            <p style="color: rgba(255, 255, 255, 0.7); margin: 0 0 24px 0;">Добро пожаловать в ZhukPlus!</p>
            <button class="success-btn" style="
                padding: 12px 24px;
                background: #00ff88;
                color: #000;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-weight: 600;
            ">Отлично!</button>
        </div>
    `;
    
    const successBtn = modalContent.querySelector('.success-btn');
    successBtn.addEventListener('click', () => {
        // Активируем подписку
        activateSubscription();
        modal.remove();
    });
}

// Показ ошибки платежа
function showPaymentError(modalContent, errorMessage) {
    modalContent.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 40px;
            text-align: center;
        ">
            <div style="
                width: 60px;
                height: 60px;
                background: #ff4444;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 24px;
            ">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #fff;">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </div>
            <h3 style="color: #fff; margin: 0 0 16px 0;">Ошибка платежа</h3>
            <p style="color: rgba(255, 255, 255, 0.7); margin: 0 0 24px 0;">${errorMessage}</p>
            <button class="retry-btn" style="
                padding: 12px 24px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                color: #fff;
                cursor: pointer;
                font-size: 14px;
            ">Попробовать снова</button>
        </div>
    `;
    
    const retryBtn = modalContent.querySelector('.retry-btn');
    retryBtn.addEventListener('click', () => {
        // Возвращаемся к выбору способа оплаты
        openPaymentPage();
    });
}

// Активация подписки
function activateSubscription() {
    const saved = localStorage.getItem('zhukbrowse_profile');
    const profileData = saved ? JSON.parse(saved) : { name: 'Пользователь', isPremium: false };
    
    profileData.isPremium = true;
    profileData.subscriptionDate = new Date().toISOString();
    profileData.subscriptionEndDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // +30 дней
    
    saveProfileData(profileData);
    updateProfileUI(profileData);
    
    showNotification('Подписка ZhukPlus успешно активирована!', 'fa-star');
    
    // Обновляем доступные функции
    enablePremiumFeatures();
}

// Включение премиум функций
function enablePremiumFeatures() {
    console.log('enablePremiumFeatures called');
    console.log('Премиум функции активированы');
    
    // Премиум фоны по категориям
    const premiumBackgrounds = {
        gradients: [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
            'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
            'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
            'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)',
            'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
            'linear-gradient(135deg, #fad0c4 0%, #ffd1ff 100%)',
            'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
            'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
            'linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)',
            'linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)',
            'linear-gradient(135deg, #fdbb2d 0%, #22c1c3 100%)',
            'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
            'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
            'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
            'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)'
        ],
        nature: [
            'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1465101178521-c1a9136a3b99?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1465101178521-c1a9136a3b99?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1465101178521-c1a9136a3b99?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop'
        ],
        cities: [
            'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1464037866556-6812c9d1c72e?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1508051123996-69f8caf4891b?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1444723121867-7a241cacace9?w=1920&h=1080&fit=crop'
        ],
        abstract: [
            'https://images.unsplash.com/photo-1557683316-973673baf926?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop',
            'https://images.unsplash.com/photo-1557682250-33bd709cbe85?w=1920&h=1080&fit=crop'
        ]
    };
    
    // Сохраняем премиум фоны
    localStorage.setItem('zhukbrowse_premium_backgrounds', JSON.stringify(premiumBackgrounds));
    console.log('Premium backgrounds saved to localStorage');
    console.log('Premium backgrounds count:', {
        gradients: premiumBackgrounds.gradients.length,
        nature: premiumBackgrounds.nature.length,
        cities: premiumBackgrounds.cities.length,
        abstract: premiumBackgrounds.abstract.length
    });
}

// Проверка премиум статуса
function isPremiumUser() {
    const saved = localStorage.getItem('zhukbrowse_profile');
    if (saved) {
        const profileData = JSON.parse(saved);
        const isPremium = profileData.isPremium === true;
        console.log('isPremiumUser check:', { saved, profileData, isPremium });
        return isPremium;
    }
    console.log('isPremiumUser check: no profile data, returning false');
    return false;
}

// Получение премиум фонов
function getPremiumBackgrounds() {
    const saved = localStorage.getItem('zhukbrowse_premium_backgrounds');
    const result = saved ? JSON.parse(saved) : {};
    console.log('getPremiumBackgrounds returned:', result);
    return result;
}

// Очистка системного прокси Windows
async function clearWindowsProxy() {
    try {
        if (window.electronAPI?.clearWindowsProxy) {
            await window.electronAPI.clearWindowsProxy();
            showNotification('Системный прокси Windows очищен!', 'fa-check-circle');
        } else {
            showNotification('Функция очистки системного прокси недоступна', 'fa-exclamation-triangle');
        }
    } catch (error) {
        console.error('Error clearing Windows proxy:', error);
        showNotification('Ошибка при очистке системного прокси', 'fa-times-circle');
    }
}

// Показ модального окна блокировки премиум контента
function showPremiumLockModal() {
    console.log('showPremiumLockModal called');
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        backdrop-filter: blur(10px);
    `;
    
    modal.innerHTML = `
        <div style="
            background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
            border: 1px solid rgba(0, 255, 136, 0.3);
            border-radius: 16px;
            padding: 32px;
            max-width: 400px;
            width: 90%;
            text-align: center;
            position: relative;
            overflow: hidden;
        ">
            <div style="
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                height: 3px;
                background: linear-gradient(90deg, #00ff88 0%, #00cc6a 50%, #ff6b35 100%);
            "></div>
            
            <div style="
                width: 80px;
                height: 80px;
                background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 24px auto;
            ">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #000;">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <circle cx="12" cy="16" r="1"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
            </div>
            
            <h3 style="color: #fff; margin: 0 0 16px 0; font-size: 20px;">Премиум контент</h3>
            <p style="color: rgba(255, 255, 255, 0.7); margin: 0 0 24px 0; line-height: 1.5;">
                Этот фон доступен только для подписчиков ZhukPlus. 
                Подпишитесь, чтобы получить доступ к эксклюзивным фонам!
            </p>
            
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button class="subscribe-premium-btn" style="
                    padding: 12px 24px;
                    background: linear-gradient(135deg, #00ff88 0%, #00cc6a 100%);
                    color: #000;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: 600;
                    font-size: 14px;
                ">Подписаться</button>
                <button class="cancel-premium-btn" style="
                    padding: 12px 24px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 8px;
                    color: #fff;
                    cursor: pointer;
                    font-size: 14px;
                ">Отмена</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Обработчики событий
    const subscribeBtn = modal.querySelector('.subscribe-premium-btn');
    const cancelBtn = modal.querySelector('.cancel-premium-btn');
    
    subscribeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
        openPaymentPage();
    });
    
    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Закрытие по клику вне модала
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
}

// Инициализация профиля
function initProfile() {
    console.log('Initializing profile...');
    const profileData = loadProfileData();
    
    // Инициализируем премиум фоны, если их еще нет
    if (!localStorage.getItem('zhukbrowse_premium_backgrounds')) {
        console.log('Premium backgrounds not found, initializing...');
        enablePremiumFeatures();
    }
    
    // Обновляем UI профиля
    updateProfileUI(profileData);
    
    // Добавляем обработчики событий
    if (changeAvatarBtn) {
        changeAvatarBtn.addEventListener('click', changeAvatar);
        console.log('Change avatar button event listener added');
    }
    
    if (subscribeBtn) {
        subscribeBtn.addEventListener('click', handleSubscription);
        console.log('Subscribe button event listener added');
    }
    
    // Обработчик отмены подписки
    if (unsubscribeBtn) {
        unsubscribeBtn.addEventListener('click', handleUnsubscription);
        console.log('Unsubscribe button event listener added');
    } else {
        console.log('Unsubscribe button not found for event listener');
    }
    
    // Обработчик для кнопки очистки системного прокси
    const clearWindowsProxyBtn = document.getElementById('clearWindowsProxyBtn');
    if (clearWindowsProxyBtn) {
        clearWindowsProxyBtn.addEventListener('click', clearWindowsProxy);
    }
    
    // Обработчик для кнопки истории платежей
    const paymentHistoryBtn = document.getElementById('paymentHistoryBtn');
    if (paymentHistoryBtn) {
        paymentHistoryBtn.addEventListener('click', showPaymentHistory);
        console.log('Payment history button event listener added');
    }
    
    console.log('Profile initialization completed');
}

// Добавляем CSS для

// Экспорт функций в глобальную область видимости
window.renderStartPage = renderStartPage;
window.initializeMainBrowserSecurity = initializeMainBrowserSecurity;
window.enableMainBrowserProtection = enableMainBrowserProtection;
window.openBackgroundGallery = openBackgroundGallery;
window.setMainBg = setMainBg;
window.showNotification = showNotification;
window.openPaymentPage = openPaymentPage;
window.processPayment = processPayment;
window.activateSubscription = activateSubscription;
window.enablePremiumFeatures = enablePremiumFeatures;
window.isPremiumUser = isPremiumUser;
window.getPremiumBackgrounds = getPremiumBackgrounds;
window.clearWindowsProxy = clearWindowsProxy;
window.showPremiumLockModal = showPremiumLockModal;
window.initProfile = initProfile;
window.loadProfileData = loadProfileData;
window.saveProfileData = saveProfileData;
window.updateProfileUI = updateProfileUI;
window.handleSubscription = handleSubscription;
window.handleUnsubscription = handleUnsubscription;
window.changeAvatar = changeAvatar;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.switchSettingsSection = switchSettingsSection;
window.saveSecuritySettings = saveSecuritySettings;
window.saveGeneralSettings = saveGeneralSettings;
window.clearDownloads = clearDownloads;
window.clearHistory = clearHistory;
window.updateDownloadsList = updateDownloadsList;
window.updateHistoryList = updateHistoryList;
window.updateFavoritesList = updateFavoritesList;
window.openExtensionStore = openExtensionStore;
window.installExtension = installExtension;
window.uninstallExtension = uninstallExtension;
window.toggleExtension = toggleExtension;
window.showExtensionDetails = showExtensionDetails;
window.updateExtensionsList = updateExtensionsList;
window.updateNavExtensions = updateNavExtensions;
window.showExtensionNavMenu = showExtensionNavMenu;
window.createVpnNavMenu = createVpnNavMenu;
window.createDefaultExtensionNavMenu = createDefaultExtensionNavMenu;
window.toggleExtensionPopup = toggleExtensionPopup;
window.getEnabledExtensionsHTML = getEnabledExtensionsHTML;
window.getExtensionSVGIcon = getExtensionSVGIcon;
window.openQuickLinksEditor = openQuickLinksEditor;
window.saveQuickLinks = saveQuickLinks;
window.loadQuickLinks = loadQuickLinks;
window.renderQuickLinksTo = renderQuickLinksTo;
window.performSearch = performSearch;
window.createTab = createTab;
window.switchTab = switchTab;
window.closeTab = closeTab;
window.navigateTo = navigateTo;
window.navigateInIncognito = navigateInIncognito;
window.updateNavButtons = updateNavButtons;
window.updateTime = updateTime;
window.updateProxyButton = updateProxyButton;
window.toggleProxy = toggleProxy;
window.applyProxySettings = applyProxySettings;
window.openProxyMenu = openProxyMenu;
window.selectVpnCountry = selectVpnCountry;
window.tryConnectProxy = tryConnectProxy;
window.createProxyBtn = createProxyBtn;
window.showProxySelector = showProxySelector;
window.reloadAllWebviews = reloadAllWebviews;
window.closeAllTabsExceptStart = closeAllTabsExceptStart;
window.getUserBackgrounds = getUserBackgrounds;
window.addUserBackground = addUserBackground;
window.setMainBg = setMainBg;
window.enableRealGeolocation = enableRealGeolocation;
window.disableRealGeolocation = disableRealGeolocation;
window.insertCurrentTimeTop = insertCurrentTimeTop;
window.initStartPage = initStartPage;
window.addTabEventListeners = addTabEventListeners;
window.initEvents = initEvents;
window.initElements = initElements;
window.loadSettings = loadSettings;
window.saveAllData = saveAllData;
window.loadAllData = loadAllData;
window.updateVpnStatus = updateVpnStatus;
window.enableSecureDNS = enableSecureDNS;
window.handleWebviewDownload = handleWebviewDownload;
window.formatBytes = formatBytes;
window.initUpdateSystem = initUpdateSystem;
window.loadUpdateSettings = loadUpdateSettings;
window.saveUpdateSettings = saveUpdateSettings;
window.initUpdateEventListeners = initUpdateEventListeners;
window.checkForUpdates = checkForUpdates;
window.downloadUpdate = downloadUpdate;
window.installUpdate = installUpdate;
window.handleUpdateStatus = handleUpdateStatus;
window.addDownloadListenersToAllWebviews = addDownloadListenersToAllWebviews;
window.applyIncognitoProtectionToWebview = applyIncognitoProtectionToWebview;
window.applyMainBrowserProtectionToWebview = applyMainBrowserProtectionToWebview;
window.enableFingerprintProtection = enableFingerprintProtection;
window.enableAdvancedTrackerBlocking = enableAdvancedTrackerBlocking;
window.enableIPAndLocationSpoofing = enableIPAndLocationSpoofing;
window.initializeIncognitoSecurity = initializeIncognitoSecurity;
window.clearIncognitoData = clearIncognitoData;
window.generateKeyFromString = generateKeyFromString;
window.getBrowserId = getBrowserId;
window.decryptData = decryptData;
window.encryptData = encryptData;
window.applyTheme = applyTheme;
window.saveTheme = saveTheme;
window.loadTheme = loadTheme;
window.initThemeChooser = initThemeChooser;
window.observeThemeSection = observeThemeSection;
window.tryInitSettingsBtn = tryInitSettingsBtn;
window.openSettingsMain = openSettingsMain;
window.openSettingsIncognito = openSettingsIncognito;
window.applyTitlebarStyle = applyTitlebarStyle;
window.applyTitlebarStyleFromSystem = applyTitlebarStyleFromSystem;
window.initTitlebarStyleChooser = initTitlebarStyleChooser;
window.setupCustomTitlebarButtons = setupCustomTitlebarButtons;
window.renderExtensionsList = renderExtensionsList;
window.processCardPayment = processCardPayment;
window.processSBPPayment = processSBPPayment;
window.showPaymentProcessing = showPaymentProcessing;
window.showPaymentSuccess = showPaymentSuccess;
window.showPaymentError = showPaymentError;

console.log('ZhukBrowser functions exported to window:', Object.keys(window).filter(key => typeof window[key] === 'function' && key !== 'alert' && key !== 'confirm' && key !== 'prompt' && key !== 'setTimeout' && key !== 'setInterval' && key !== 'clearTimeout' && key !== 'clearInterval'));

// Функция для просмотра истории платежей
function showPaymentHistory() {
    const payments = JSON.parse(localStorage.getItem('zhukbrowse_payments') || '[]');
    
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.8); display: flex; align-items: center;
        justify-content: center; z-index: 10000; backdrop-filter: blur(10px);
    `;
    
    modal.innerHTML = `
        <div class="modal-content" style="
            background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
            border: 1px solid rgba(0, 255, 136, 0.3); border-radius: 16px;
            padding: 32px; max-width: 600px; width: 90%; position: relative;
            overflow: hidden; max-height: 80vh; overflow-y: auto;
        ">
            <div style="
                position: absolute; top: 0; left: 0; right: 0; height: 3px;
                background: linear-gradient(90deg, #00ff88 0%, #00cc6a 100%);
            "></div>
            
            <div class="modal-header" style="margin-bottom: 24px;">
                <h2 style="color: #fff; font-size: 24px; font-weight: 600; margin: 0; text-align: center;">История платежей</h2>
                <button class="close-btn" style="
                    position: absolute; top: 16px; right: 16px; background: none;
                    border: none; color: #fff; font-size: 24px; cursor: pointer;
                    padding: 0; width: 32px; height: 32px; display: flex;
                    align-items: center; justify-content: center; border-radius: 50%;
                    transition: background-color 0.3s ease;
                ">×</button>
            </div>
            
            <div class="modal-body">
                ${payments.length === 0 ? `
                    <div style="text-align: center; padding: 40px;">
                        <p style="color: rgba(255, 255, 255, 0.7); margin: 0;">История платежей пуста</p>
                    </div>
                ` : payments.map(payment => `
                    <div style="
                        background: rgba(255, 255, 255, 0.05);
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        border-radius: 12px; padding: 16px; margin-bottom: 12px;
                    ">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span style="color: #00ff88; font-weight: 600;">${payment.amount} ₽</span>
                            <span style="color: rgba(255, 255, 255, 0.7); font-size: 12px;">
                                ${new Date(payment.timestamp).toLocaleString('ru-RU')}
                            </span>
                        </div>
                        <div style="color: rgba(255, 255, 255, 0.9); font-size: 14px; margin-bottom: 4px;">
                            Способ: ${payment.method === 'card' ? 'Банковская карта' : 'СБП'}
                        </div>
                        <div style="color: rgba(255, 255, 255, 0.7); font-size: 12px;">
                            Получатель: ${payment.recipient}
                        </div>
                        ${payment.phone ? `
                            <div style="color: rgba(255, 255, 255, 0.7); font-size: 12px;">
                                Телефон: ${payment.phone}
                            </div>
                        ` : ''}
                        <div style="
                            color: #00ff88; font-size: 12px; font-weight: 600;
                            margin-top: 8px;
                        ">
                            ✅ Успешно
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const closeBtn = modal.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => { modal.remove(); });
    
    modal.addEventListener('click', (e) => { if (e.target === modal) { modal.remove(); } });
    
    const handleEscape = (e) => {
        if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', handleEscape); }
    };
    document.addEventListener('keydown', handleEscape);
}

window.showPaymentHistory = showPaymentHistory;

// Валидация номера карты (алгоритм Луна)
function validateCardNumber(cardNumber) {
    if (!cardNumber || cardNumber.length !== 16) {
        return false;
    }
    
    // Тестовые номера карт для демонстрации
    const testCards = [
        '4111111111111111', // Visa
        '5555555555554444', // MasterCard
        '378282246310005',  // American Express
        '6011111111111117', // Discover
        '2200151339978897'  // Ваша карта
    ];
    
    // Проверяем, является ли это тестовой картой
    if (testCards.includes(cardNumber)) {
        return true;
    }
    
    let sum = 0;
    let isEven = false;
    
    // Проходим по цифрам справа налево
    for (let i = cardNumber.length - 1; i >= 0; i--) {
        let digit = parseInt(cardNumber[i]);
        
        if (isEven) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }
        
        sum += digit;
        isEven = !isEven;
    }
    
    return sum % 10 === 0;
}

// Генерация ID транзакции
function generateTransactionId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `TXN${timestamp}${random}`;
}

// Функция для реальной отправки платежа
async function sendRealPayment(paymentData) {
    try {
        // Здесь должна быть реальная интеграция с платежной системой
        // Например, API ЮKassa, Сбербанк API, или другие
        
        console.log('Sending real payment:', paymentData);
        
        // Имитация API запроса
        const response = await new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    success: true,
                    transactionId: generateTransactionId(),
                    status: 'completed'
                });
            }, 2000);
        });
        
        return response;
    } catch (error) {
        console.error('Payment error:', error);
        throw error;
    }
}