// webview-preload.js - УНИВЕРСАЛЬНЫЙ для всех webview
const { ipcRenderer } = require('electron');

console.log('✅ webview-preload.js загружен для текущей страницы');

// =============== ДОБАВЛЕНО: Отключаем предзагрузку YouTube ===============
// Отключаем предзагрузку YouTube
if (window.location.hostname.includes('youtube.com')) {
    // Запрещаем предзагрузку видео
    const originalSetAttribute = HTMLVideoElement.prototype.setAttribute;
    HTMLVideoElement.prototype.setAttribute = function(name, value) {
        if (name === 'preload' && value === 'auto') {
            value = 'metadata'; // Только метаданные, не весь видеофайл
        }
        return originalSetAttribute.call(this, name, value);
    };

    // Для YouTube iframe
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.tagName === 'IFRAME' && node.src?.includes('youtube.com')) {
                        // Добавляем параметр для отключения буферизации
                        const src = new URL(node.src);
                        src.searchParams.set('rel', '0');
                        src.searchParams.set('modestbranding', '1');
                        node.src = src.toString();
                    }
                });
            }
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// =============== БЕЛЫЙ СПИСОК ВНУТРЕННИХ СТРАНИЦ ===============

// Расширенный белый список для внутренних страниц
const WHITELIST_PATTERNS = [
    /MainPage\/index\.html/i,
/MainPage\//i,
/Settings\.html/i,
/about:/i,
/file:\/\//i,
/localhost/i,
/127\.0\.0\.1/i,
/0\.0\.0\.0/i,
/internal-/i,
/chrome-extension:/i,
// Добавьте сюда другие внутренние страницы по мере необходимости
];

// Проверяем, находится ли URL в белом списке
function isWhitelisted(url) {
    if (!url) return false;

    // Проверяем по паттернам белого списка
    for (const pattern of WHITELIST_PATTERNS) {
        if (pattern.test(url)) {
            console.log('✅ URL в белом списке:', url.substring(0, 100));
            return true;
        }
    }

    return false;
}

// =============== ЗАЩИТА ОТ FINGERPRINTING ===============
(function() {
    // Подмена canvas
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type, encoderOptions) {
        // Добавляем случайный шум (очень лёгкий, чтобы не влиять на восприятие)
        const ctx = this.getContext('2d');
        const imageData = ctx.getImageData(0, 0, this.width, this.height);
        for (let i = 0; i < imageData.data.length; i += 40) { // каждый 10-й пиксель
            imageData.data[i] = imageData.data[i] ^ 1; // инвертируем младший бит
        }
        ctx.putImageData(imageData, 0, 0);
        return originalToDataURL.call(this, type, encoderOptions);
    };

    // Подмена WebGL fingerprinting
    if (window.WebGLRenderingContext) {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function(pname) {
            if (pname === 37445) { // UNMASKED_VENDOR_WEBGL
                return "Intel Inc.";
            }
            if (pname === 37446) { // UNMASKED_RENDERER_WEBGL
                return "Intel Iris OpenGL Engine";
            }
            return getParameter.call(this, pname);
        };
    }

    // Подмена AudioContext fingerprinting
    if (window.AudioContext) {
        const originalGetChannelData = AudioBuffer.prototype.getChannelData;
        AudioBuffer.prototype.getChannelData = function(channel) {
            const data = originalGetChannelData.call(this, channel);
            // Добавляем небольшой шум в аудиоданные
            for (let i = 0; i < data.length; i += 100) {
                data[i] += 0.000001 * (Math.random() - 0.5);
            }
            return data;
        };
    }
})();

// =============== QRAutoScanner (только для статических изображений) ===============
class QRAutoScanner {
    constructor() {
        this.isActive = false;
        this.scanInterval = null;
        this.foundQRCodes = new Map();
        this.scannerOverlay = null;
        this.MIN_QR_SIZE = 50;
        this.SCAN_INTERVAL = 2000;
        this.DEBOUNCE_TIME = 10000;

        console.log('🔍 QR-сканер создан (только для статических изображений)');
    }

    // Простая функция для теста без jsQR
    simpleQRTest(element) {
        // Простая эвристика: ищем элементы с QR в названии
        const text = (element.alt || element.title || element.src || '').toLowerCase();
        return text.includes('qr') || text.includes('qrcode') || text.includes('код');
    }

    startAutoScan() {
        if (this.isActive) return;

        console.log('🔍 Запуск QR-сканера (только статические изображения)');
        this.isActive = true;

        // Создаем оверлей
        this.createScannerOverlay();

        // Сканируем
        this.scanPageForQRCodes();

        // Устанавливаем интервал
        this.scanInterval = setInterval(() => {
            this.scanPageForQRCodes();
        }, this.SCAN_INTERVAL);
    }

    stopAutoScan() {
        if (!this.isActive) return;

        console.log('⏹️ Остановка QR-сканера');
        this.isActive = false;

        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }

        // Удаляем оверлей
        this.removeScannerOverlay();

        // Очищаем данные
        this.foundQRCodes.clear();
    }

    createScannerOverlay() {
        if (this.scannerOverlay) return;

        this.scannerOverlay = document.createElement('div');
        this.scannerOverlay.id = 'qr-scanner-overlay-container';
        this.scannerOverlay.className = 'scanner-container';
        this.scannerOverlay.setAttribute('data-scanner', 'qr');

        this.scannerOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 2147483646;
        overflow: hidden;
        `;

        document.body.appendChild(this.scannerOverlay);
        console.log('✅ Контейнер оверлея создан');
    }

    removeScannerOverlay() {
        if (this.scannerOverlay && this.scannerOverlay.parentNode) {
            this.scannerOverlay.remove();
            this.scannerOverlay = null;
        }
    }

    scanPageForQRCodes() {
        if (!this.isActive) return;

        console.log('🔍 Сканирование страницы для статических QR-кодов...');

        // Ищем все изображения
        const images = document.querySelectorAll('img, image, canvas, [class*="qr"], [class*="qrcode"]');
        console.log(`Найдено ${images.length} потенциальных элементов`);

        images.forEach((img, index) => {
            setTimeout(() => {
                this.checkElementForQR(img);
            }, index * 100); // Постепенная проверка для производительности
        });
    }

    checkElementForQR(element) {
        const elementKey = `${element.tagName}-${element.src || element.id || element.className}`;

        // Проверяем дебаунсинг
        if (this.foundQRCodes.has(elementKey)) {
            const lastScan = this.foundQRCodes.get(elementKey).lastScan;
            if (Date.now() - lastScan < this.DEBOUNCE_TIME) {
                return;
            }
        }

        // Проверяем размер
        const rect = element.getBoundingClientRect();
        if (!rect || rect.width < this.MIN_QR_SIZE || rect.height < this.MIN_QR_SIZE) {
            return;
        }

        // Простая проверка на QR
        if (this.simpleQRTest(element)) {
            this.processQRCode(element, elementKey);
        }
    }

    processQRCode(element, elementKey) {
        console.log('✅ Обнаружен потенциальный статический QR-код:', element);

        // Извлекаем URL или данные
        const url = this.extractDataFromElement(element);

        // Сохраняем информацию
        const qrData = {
            element: element,
            elementKey: elementKey,
            url: url,
            rect: this.getAbsolutePosition(element),
            firstFound: Date.now(),
            lastScan: Date.now(),
            overlay: null
        };

        this.foundQRCodes.set(elementKey, qrData);

        // Показываем оверлей
        this.showQRCodeOverlay(qrData);
    }

    extractDataFromElement(element) {
        // Проверяем различные источники
        const sources = [
            element.getAttribute('data-url'),
            element.getAttribute('data-href'),
            element.getAttribute('data-link'),
            element.src,
            element.href,
            element.getAttribute('href'),
            element.getAttribute('data-src'),
            element.alt || '',
            element.title || ''
        ];

        // Ищем первый валидный URL
        for (const source of sources) {
            if (source && this.isValidURL(source)) {
                return source;
            }
        }

        // Если URL не найден, возвращаем пустую строку
        return '';
    }

    isValidURL(string) {
        if (!string) return false;

        try {
            const url = new URL(string);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch (_) {
            return false;
        }
    }

    getAbsolutePosition(element) {
        if (!element || !element.getBoundingClientRect) {
            return { top: 0, left: 0, width: 0, height: 0 };
        }

        const rect = element.getBoundingClientRect();

        return {
            top: rect.top + window.pageYOffset,
            left: rect.left + window.pageXOffset,
            width: rect.width,
            height: rect.height,
            clientTop: rect.top,
            clientLeft: rect.left
        };
    }

    showQRCodeOverlay(qrData) {
        if (!this.scannerOverlay || !qrData.rect) {
            console.log('Невозможно показать оверлей: нет контейнера или координат');
            return;
        }

        try {
            const element = qrData.element;
            const rect = qrData.rect;

            // Удаляем старый оверлей для этого элемента
            const existingOverlay = this.scannerOverlay.querySelector(
                `[data-qr-id="${qrData.elementKey}"]`
            );
            if (existingOverlay) {
                existingOverlay.remove();
            }

            // Создаем новый оверлей
            const overlay = document.createElement('div');
            overlay.className = 'qr-code-highlight scanner-element';
            overlay.setAttribute('data-qr-id', qrData.elementKey);
            overlay.setAttribute('data-scanner', 'qr');

            // Используем FIXED позиционирование
            overlay.style.cssText = `
            position: fixed !important;
            top: ${rect.clientTop}px !important;
            left: ${rect.clientLeft}px !important;
            width: ${rect.width}px !important;
            height: ${rect.height}px !important;
            border: 3px solid #0a84ff !important;
            border-radius: 8px !important;
            pointer-events: none !important;
            z-index: 2147483647 !important;
            box-shadow: 0 0 20px rgba(10, 132, 255, 0.5) !important;
            animation: qr-pulse 2s infinite !important;
            box-sizing: border-box !important;
            transform: translateZ(0);
            `;

            // Добавляем стили анимации
            this.addPulseAnimation();

            // Создаем элемент с ссылкой
            if (qrData.url) {
                const linkOverlay = this.createLinkOverlay(qrData);
                overlay.appendChild(linkOverlay);
            }

            // Добавляем оверлей в контейнер
            this.scannerOverlay.appendChild(overlay);

            // Сохраняем ссылку на оверлей
            qrData.overlay = overlay;

            // Настраиваем автоудаление
            this.setupOverlayAutoRemove(overlay, qrData);

        } catch (error) {
            console.error('Ошибка создания оверлея:', error);
        }
    }

    createLinkOverlay(qrData) {
        const linkOverlay = document.createElement('div');
        linkOverlay.className = 'qr-link-overlay scanner-element';
        linkOverlay.setAttribute('data-scanner', 'qr');

        const displayText = this.truncateUrl(qrData.url, 30);

        linkOverlay.style.cssText = `
        position: absolute !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        background: rgba(10, 132, 255, 0.95) !important;
        color: white !important;
        padding: 8px 16px !important;
        border-radius: 12px !important;
        font-size: 14px !important;
        font-weight: bold !important;
        max-width: 90% !important;
        text-align: center !important;
        pointer-events: auto !important;
        cursor: pointer !important;
        z-index: 2147483647 !important;
        backdrop-filter: blur(10px) !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3) !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        font-family: Arial, sans-serif !important;
        `;

        linkOverlay.textContent = displayText;
        linkOverlay.title = qrData.url;

        // Обработчик клика
        linkOverlay.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (qrData.url && this.isValidURL(qrData.url)) {
                console.log('Клик по QR-ссылке:', qrData.url);
                if (window.electronAPI && window.electronAPI.openUrl) {
                    window.electronAPI.openUrl(qrData.url);
                }
            }
        };

        return linkOverlay;
    }

    truncateUrl(url, maxLength) {
        if (!url) return 'QR Code';
        if (url.length <= maxLength) return url;

        return url.substring(0, maxLength - 3) + '...';
    }

    setupOverlayAutoRemove(overlay, qrData) {
        setTimeout(() => {
            if (overlay.parentNode === this.scannerOverlay) {
                overlay.remove();
                this.foundQRCodes.delete(qrData.elementKey);
            }
        }, 15000);
    }

    addPulseAnimation() {
        if (document.getElementById('qr-pulse-animation')) return;

        const style = document.createElement('style');
        style.id = 'qr-pulse-animation';
        style.textContent = `
        @keyframes qr-pulse {
            0% {
                box-shadow: 0 0 0 0 rgba(10, 132, 255, 0.7);
            }
            70% {
                box-shadow: 0 0 0 10px rgba(10, 132, 255, 0);
            }
            100% {
                box-shadow: 0 0 0 0 rgba(10, 132, 255, 0);
            }
        }

        .qr-code-highlight:hover {
            border-color: #64d2ff !important;
            box-shadow: 0 0 30px rgba(100, 210, 255, 0.7) !important;
        }

        .qr-link-overlay:hover {
            background: rgba(100, 210, 255, 0.95) !important;
            transform: translate(-50%, -50%) scale(1.05) !important;
        }
        `;

        document.head.appendChild(style);
    }

    getStats() {
        return {
            isActive: this.isActive,
            foundCodes: this.foundQRCodes.size,
            lastScan: Date.now()
        };
    }
}

// =============== ИСПРАВЛЕННЫЙ БЛОКИРОВЩИК С ПОЛНЫМИ ИСКЛЮЧЕНИЯМИ ДЛЯ СКАНЕРОВ ===============

class SecurityBlocker {
    constructor() {
        this.blockedCount = 0;
        this.blockedItems = new Set();
        this.securitySettings = {};
        this.isWhitelisted = false;

        // ПОЛНЫЙ СПИСОК ИСКЛЮЧЕНИЙ ДЛЯ ВСЕХ СКАНЕРОВ
        this.SCANNER_EXCEPTIONS = [
            // QR-сканер страниц
            'scanner-element', 'scanner-container', 'qr-scanner',
            'qr-code-highlight', 'qr-link-overlay', 'temp-extension-icons',
            'temp-extension-icon',

            // Общие классы
            'qr-pulse-animation'
        ];

        // Паттерны CSS-свойств сканеров
        this.SCANNER_CSS_PATTERNS = [
            /border.*#0a84ff/, /border.*#FC3F1D/,
            /z-index.*214748364[0-7]/, /animation.*qr/
        ];

        // Проверяем белый список сразу при создании
        this.checkWhitelist();

        // Если страница в белом списке, выходим из конструктора
        if (this.isWhitelisted) {
            console.log('✅ Страница в белом списке - блокировка отключена');
            return;
        }

        // Исключения для популярных сайтов
        this.siteExceptions = {
            'youtube.com': {
                skipElementBlocking: true,
                allowedSelectors: [
                    '[id*="avatar"]', '[class*="avatar"]',
                    '[id*="preview"]', '[class*="preview"]',
                    '[id*="thumbnail"]', '[class*="thumbnail"]',
                    '[id*="img"]', '[class*="img"]',
                    '[id*="image"]', '[class*="image"]',
                    // Добавляем исключения для сканеров
                    '.scanner-element', '.scanner-container',
                    '[data-scanner]'
                ]
            },
            'twitch.tv': {
                skipElementBlocking: true
            },
            'vimeo.com': {
                skipElementBlocking: true
            }
        };

        // Паттерны для блокировки (упрощенные)
        this.trackerPatterns = [];
        this.adPatterns = [];
        this.minerPatterns = [];

        this.initializePatterns();
        console.log('🛡️ Блокировщик инициализирован с исключениями для сканеров');
    }

    checkWhitelist() {
        const currentUrl = window.location.href;
        this.isWhitelisted = isWhitelisted(currentUrl);
        return this.isWhitelisted;
    }

    // УЛУЧШЕННАЯ проверка, является ли элемент частью наших сканеров
    isScannerElement(element) {
        if (!element || !element.style) return false;

        // 1. Проверяем классы
        const className = element.className?.toString() || '';
        for (const exception of this.SCANNER_EXCEPTIONS) {
            if (className.includes(exception)) {
                return true;
            }
        }

        // 2. Проверяем data-атрибуты
        if (element.hasAttribute('data-scanner') ||
            element.hasAttribute('data-qr-id')) {
            return true;
            }

            // 3. Проверяем ID
            const id = element.id || '';
        for (const exception of this.SCANNER_EXCEPTIONS) {
            if (id.includes(exception)) {
                return true;
            }
        }

        // 4. Проверяем тег и стили (специфичные для сканеров)
        const style = element.style.cssText || '';
        const computedStyle = window.getComputedStyle ? window.getComputedStyle(element) : null;

        if (computedStyle) {
            // Проверяем высокий z-index (характерно для оверлеев)
            const zIndex = parseInt(computedStyle.zIndex);
            if (zIndex > 1000000 && zIndex < 2147483648) {
                return true;
            }

            // Проверяем фиксированное позиционирование + специфичные цвета границ
            if (computedStyle.position === 'fixed' || computedStyle.position === 'absolute') {
                const border = computedStyle.border || '';
                if (border.includes('#0a84ff') || border.includes('#FC3F1D')) {
                    return true;
                }
            }
        }

        // 5. Проверяем наличие анимаций QR
        const animation = computedStyle?.animation || '';
        if (animation.includes('qr') || animation.includes('pulse')) {
            return true;
        }

        return false;
    }

    // Проверяем, что элемент ОДНОЗНАЧНО реклама (а не сканер)
    isDefinitelyAd(element) {
        // СНАЧАЛА проверяем, не является ли элемент частью наших сканеров
        if (this.isScannerElement(element)) {
            console.log('✅ Пропускаем элемент сканера:', element);
            return false;
        }

        const className = element.className?.toLowerCase() || '';
        const id = element.id?.toLowerCase() || '';
        const src = element.src?.toLowerCase() || '';

        // Элементы, которые НЕ являются рекламой (даже если выглядят похоже)
        const nonAdIndicators = [
            'avatar', 'thumbnail', 'preview', 'image', 'img', 'photo',
            'logo', 'icon', 'button', 'menu', 'nav', 'header', 'footer',
            'player', 'video', 'audio', 'canvas', 'qr', 'scanner'
        ];

        for (const indicator of nonAdIndicators) {
            if (className.includes(indicator) || id.includes(indicator)) {
                return false;
            }
        }

        // Проверяем размеры (мелкие элементы вряд ли QR-коды)
        const rect = element.getBoundingClientRect();
        if (rect && (rect.width < 50 || rect.height < 50)) {
            return false;
        }

        return true;
    }

    initializePatterns() {
        if (this.isWhitelisted) return;

        console.log('🛡️ Инициализация паттернов блокировки (с исключениями для сканеров)');

        // Только самые явные паттерны трекеров
        this.trackerPatterns = [
            /doubleclick\.net/i,
            /google-analytics\.com\/collect/i,
            /googletagmanager\.com\/gtm\.js/i,
            /facebook\.com\/tr/i
        ];

        // Только самые явные паттерны рекламы
        this.adPatterns = [
            /pagead2\.googlesyndication\.com/i,
            /ads\.amazon-adsystem\.com/i,
            /ad\.doubleclick\.net/i
        ];

        // Паттерны майнеров
        this.minerPatterns = [
            /coinhive\.com\/lib\/coinhive\.min\.js/i,
            /cryptoloot\.pro\/lib\/cryptoloot\.min\.js/i
        ];
    }

    setSecuritySettings(settings) {
        if (this.isWhitelisted) {
            console.log('✅ Страница в белом списке - настройки безопасности игнорируются');
            return;
        }

        this.securitySettings = settings;
        console.log('🔐 Настройки безопасности получены (с исключениями для сканеров):', settings);
        this.applyBlocking();
    }

    applyBlocking() {
        if (this.isWhitelisted) {
            console.log('🛡️ Страница в белом списке - блокировки не применяются');
            return;
        }

        if (!this.securitySettings) return;

        console.log('🛡️ Применение "умных" блокировок (сканеры защищены)...');

        const currentHostname = window.location.hostname;
        const siteException = this.getSiteException(currentHostname);

        // Блокировка трекеров (только сетевые запросы)
        if (this.securitySettings.blockTrackers) {
            this.blockTrackers();
        }

        // Блокировка рекламы (с усиленной проверкой на сканеры)
        if (this.securitySettings.blockAds) {
            if (!siteException?.skipElementBlocking) {
                this.blockAdElementsSafely();
            }
            this.blockAdRequests();
        }

        // Блокировка майнеров
        if (this.securitySettings.blockMiners) {
            this.blockMiners();
        }
    }

    getSiteException(hostname) {
        for (const [domain, exception] of Object.entries(this.siteExceptions)) {
            if (hostname.includes(domain)) {
                console.log(`✅ Применено исключение для сайта: ${domain}`);
                return exception;
            }
        }
        return null;
    }

    // Безопасная блокировка элементов рекламы
    blockAdElementsSafely() {
        const currentHostname = window.location.hostname;
        const siteException = this.getSiteException(currentHostname);

        if (siteException?.skipElementBlocking) {
            console.log(`✅ Пропускаем блокировку элементов для ${currentHostname}`);
            return;
        }

        // ТОЛЬКО самые явные рекламные селекторы
        const adSelectors = [
            'ins.adsbygoogle',
            'iframe[src*="adsbygoogle"]',
            'iframe[src*="/ads/"]',
            'iframe[src*="/banner/"]',
            'iframe[src*="doubleclick.net"]'
        ];

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        this.checkAndBlockAdElementSafely(node, adSelectors);
                    }
                });
            });
        });

        // Сначала блокируем существующие элементы
        adSelectors.forEach((selector) => {
            try {
                document.querySelectorAll(selector).forEach((element) => {
                    if (this.isDefinitelyAd(element)) {
                        this.blockElementSafely(element);
                    }
                });
            } catch (e) {
                console.error('Error querying selector:', e);
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        console.log('🛡️ Умная блокировка рекламных элементов активирована (сканеры защищены)');
    }

    checkAndBlockAdElementSafely(element, adSelectors) {
        // СНАЧАЛА проверяем, не является ли элемент частью наших сканеров
        if (this.isScannerElement(element)) {
            console.log('✅ Пропускаем элемента сканера:', element);
            return;
        }

        for (const selector of adSelectors) {
            if (element.matches && element.matches(selector)) {
                if (this.isDefinitelyAd(element)) {
                    this.blockElementSafely(element);
                    return;
                }
            }
        }

        if (element.querySelectorAll) {
            adSelectors.forEach((selector) => {
                try {
                    element.querySelectorAll(selector).forEach((child) => {
                        if (this.isDefinitelyAd(child) && !this.isScannerElement(child)) {
                            this.blockElementSafely(child);
                        }
                    });
                } catch (e) {
                    // Игнорируем ошибки селекторов
                }
            });
        }
    }

    blockElementSafely(element) {
        // СНАЧАЛА проверяем, не является ли элемент частью наших сканеров
        if (this.isScannerElement(element)) {
            console.log('✅ Пропускаем блокировку элемента сканера:', element);
            return;
        }

        try {
            element.style.display = 'none';
            element.style.visibility = 'hidden';
            element.style.opacity = '0';
            element.style.position = 'absolute';
            element.style.left = '-9999px';

            element.setAttribute('data-ad-blocked', 'true');

            const src = element.src || element.href || element.id || element.className;
            this.reportBlocked('ad', src);
        } catch (e) {
            console.error('Error blocking element:', e);
        }
    }

    blockTrackers() {
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const url = args[0];
            if (typeof url === 'string') {
                if (this.shouldBlock(url, 'tracker')) {
                    this.reportBlocked('tracker', url);
                    return Promise.reject(new Error('Блокировано: трекер'));
                }
            }
            return originalFetch.apply(this, args);
        }.bind(this);

        const originalXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            if (typeof url === 'string') {
                if (this.shouldBlock(url, 'tracker')) {
                    this.reportBlocked('tracker', url);
                    throw new Error('Блокировано: трекер');
                }
            }
            return originalXHROpen.apply(this, [method, url, ...args]);
        }.bind(this);
    }

    blockAdRequests() {
        const originalImageSrc = Object.getOwnPropertyDescriptor(Image.prototype, 'src');
        Object.defineProperty(Image.prototype, 'src', {
            set: function(value) {
                if (typeof value === 'string' && this.shouldBlock(value, 'ad')) {
                    this.reportBlocked('ad', value);
                    return;
                }
                return originalImageSrc.set.call(this, value);
            }.bind(this),
                              get: originalImageSrc.get
        });
    }

    blockMiners() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && node.tagName === 'SCRIPT') {
                        const src = node.src;
                        if (src) {
                            this.minerPatterns.forEach((pattern) => {
                                if (pattern.test(src)) {
                                    node.remove();
                                    this.reportBlocked('miner', src);
                                }
                            });
                        }
                    }
                });
            });
        });

        observer.observe(document.head, {
            childList: true,
            subtree: true
        });
    }

    shouldBlock(url, type) {
        if (this.isWhitelisted) return false;
        if (!url || typeof url !== 'string') return false;

        const patterns = {
            tracker: this.trackerPatterns,
            ad: this.adPatterns,
            miner: this.minerPatterns
        }[type];

        if (!patterns) return false;

        return patterns.some(pattern => pattern.test(url));
    }

    reportBlocked(type, resource) {
        if (this.isWhitelisted) return;

        this.blockedCount++;
        this.blockedItems.add(resource);

        try {
            ipcRenderer.sendToHost('security-blocked', {
                type: type,
                resource: resource,
                timestamp: Date.now(),
                                   isWhitelisted: this.isWhitelisted
            });
        } catch (error) {
            console.error('Ошибка отправки сообщения о блокировке:', error);
        }

        console.log(`🚫 Заблокировано (${type}): ${resource ? resource.substring(0, 100) : 'unknown'}`);
    }

    getStats() {
        return {
            blockedCount: this.blockedCount,
            blockedItems: Array.from(this.blockedItems).slice(0, 10),
            isWhitelisted: this.isWhitelisted,
            scannerExceptions: this.SCANNER_EXCEPTIONS
        };
    }
}

// Создаем экземпляр блокировщика
const securityBlocker = new SecurityBlocker();

// Экспортируем API для использования извне
window.qrScannerAPI = {
    start: () => qrAutoScanner.startAutoScan(),
    stop: () => qrAutoScanner.stopAutoScan(),
    getStats: () => qrAutoScanner.getStats()
};

// =============== ИНИЦИАЛИЗАЦИЯ И ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ===============
console.log('🔄 Создание экземпляра сканера...');

// Создаем экземпляр сканера (только для статических изображений)
const qrAutoScanner = new QRAutoScanner();

// Делаем его глобально доступным
window.qrAutoScanner = qrAutoScanner;
window.QRAutoScanner = QRAutoScanner; // Экспортируем класс

console.log('✅ Сканер создан и доступен глобально');

// Простая функция теста
window.testBasicScanners = function() {
    console.log('🧪 Базовый тест сканера:');
    console.log('- qrAutoScanner:', window.qrAutoScanner ? '✅ OK' : '❌ Нет');

    // Тестовый запуск
    window.qrAutoScanner.startAutoScan();

    console.log('✅ Сканер запущен в тестовом режиме');
};

// =============== ОСНОВНАЯ ИНИЦИАЛИЗАЦИЯ ===============

// Функция для проверки, является ли страница MainPage
function isMainPage() {
    const url = window.location.href;
    return isWhitelisted(url) && (url.includes('MainPage/index.html') || url.includes('MainPage/'));
}

// =============== ОСНОВНАЯ ОБРАБОТКА КОНТЕКСТНОГО МЕНЮ ===============

document.addEventListener('contextmenu', (e) => {
    const url = window.location.href;

    if (isWhitelisted(url)) {
        console.log('✅ Контекстное меню разрешено для внутренней страницы');
        return;
    }

    e.preventDefault();
    e.stopPropagation();

    const target = e.target;
    const selectedText = window.getSelection().toString().trim();

    let contextType = 'page';
    let contextData = {};

    const link = target.closest('a[href]');
    if (link) {
        contextType = 'link';
        contextData = {
            url: link.href,
            text: link.textContent || link.innerText,
            title: link.title || link.getAttribute('title') || ''
        };
    }
    else if (target.tagName === 'IMG') {
        contextType = 'image';
        contextData = {
            src: target.src,
            alt: target.alt || '',
            title: target.title || ''
        };
    }
    else if (selectedText) {
        contextType = 'selection';
        contextData = {
            text: selectedText,
            length: selectedText.length
        };
    }
    else if (target.isContentEditable ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA') {
        contextType = 'editable';
        }

        console.log(`🖱️ Контекстное меню в webview: ${contextType}`, contextData);

    ipcRenderer.sendToHost('webview-contextmenu', {
        type: contextType,
        data: contextData,
        x: e.clientX,
        y: e.clientY,
        isWhitelisted: isWhitelisted(url)
    });
}, true);

// =============== ПРОСТЫЕ ДИАЛОГИ ===============

window.alert = (msg) => {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.8);
        display: flex; align-items: center; justify-content: center; z-index: 999999;
        `;

        overlay.innerHTML = `
        <div style="background:#1e1e1e; border-radius:16px; width:400px; padding:24px;">
        <h3 style="margin:0 0 12px; color:white;">Сообщение</h3>
        <p style="margin:0 0 20px; color:#ccc;">${msg}</p>
        <button id="dialog-ok" style="padding:10px 20px; background:#0a84ff; color:white;
        border:none; border-radius:12px; float:right;">OK</button>
        </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#dialog-ok').onclick = () => {
            overlay.remove();
            resolve();
        };
    });
};

window.confirm = (msg) => {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.8);
        display: flex; align-items: center; justify-content: center; z-index: 999999;
        `;

        overlay.innerHTML = `
        <div style="background:#1e1e1e; border-radius:16px; width:400px; padding:24px;">
        <h3 style="margin:0 0 12px; color:white;">Подтверждение</h3>
        <p style="margin:0 0 20px; color:#ccc;">${msg}</p>
        <div style="display:flex; justify-content:flex-end; gap:12px;">
        <button id="dialog-cancel" style="padding:10px 20px; background:#404040; color:#ccc;
        border:none; border-radius:12px;">Отмена</button>
        <button id="dialog-ok" style="padding:10px 20px; background:#0a84ff; color:white;
        border:none; border-radius:12px;">OK</button>
        </div>
        </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('#dialog-cancel').onclick = () => {
            overlay.remove();
            resolve(false);
        };

        overlay.querySelector('#dialog-ok').onclick = () => {
            overlay.remove();
            resolve(true);
        };
    });
};

window.prompt = (msg, defaultValue = '') => {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.8);
        display: flex; align-items: center; justify-content: center; z-index: 999999;
        `;

        overlay.innerHTML = `
        <div style="background:#1e1e1e; border-radius:16px; width:400px; padding:24px;">
        <h3 style="margin:0 0 12px; color:white;">Ввод данных</h3>
        <p style="margin:0 0 10px; color:#ccc;">${msg}</p>
        <input id="dialog-input" type="text" value="${defaultValue}"
        style="width:100%; padding:12px; background:#2d2d2d; border:1px solid #444;
        border-radius:12px; color:white; font-size:15px; margin-bottom:20px;">
        <div style="display:flex; justify-content:flex-end; gap:12px;">
        <button id="dialog-cancel" style="padding:10px 20px; background:#404040; color:#ccc;
        border:none; border-radius:12px;">Отмена</button>
        <button id="dialog-ok" style="padding:10px 20px; background:#0a84ff; color:white;
        border:none; border-radius:12px;">OK</button>
        </div>
        </div>
        `;

        document.body.appendChild(overlay);

        const input = overlay.querySelector('#dialog-input');
        input.focus();
        input.select();

        overlay.querySelector('#dialog-cancel').onclick = () => {
            overlay.remove();
            resolve(null);
        };

        overlay.querySelector('#dialog-ok').onclick = () => {
            const value = input.value.trim();
            overlay.remove();
            resolve(value || null);
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const value = input.value.trim();
                overlay.remove();
                resolve(value || null);
            } else if (e.key === 'Escape') {
                overlay.remove();
                resolve(null);
            }
        });
    });
};

// =============== ОТКРЫТИЕ ССЫЛОК В НОВОЙ ВКЛАДКЕ ===============

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

// =============== API для страниц ===============

window.electronAPI = {
    openUrl: (url) => openInNewTab(url),

    // QR Scanner API (только для статических изображений)
    startQRScanner: () => {
        qrAutoScanner.startAutoScan();
        return { success: true, message: 'QR сканер запущен' };
    },

    stopQRScanner: () => {
        qrAutoScanner.stopAutoScan();
        return { success: true, message: 'QR сканер остановлен' };
    },

    getQRScannerStatus: () => {
        return qrAutoScanner.getStats();
    },

    scanForQRCodes: () => {
        qrAutoScanner.scanPageForQRCodes();
        return qrAutoScanner.getStats();
    },

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

    openUrlFromSettings: (url) => {
        ipcRenderer.sendToHost('open-url-from-settings', url);
    },

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

    sendToHost: (channel, data) => {
        ipcRenderer.sendToHost(channel, data);
    },

    getCurrentPageInfo: () => {
        return {
            url: window.location.href,
            title: document.title,
            referrer: document.referrer,
            isWhitelisted: isWhitelisted(window.location.href)
        };
    },

    reloadPage: () => {
        window.location.reload();
    },

    showExtensionIcons: () => {
        return new Promise(resolve => {
            ipcRenderer.invoke('get-plugins').then(plugins => {
                const enabledPlugins = plugins.filter(p => p.enabled);

                if (enabledPlugins.length > 0) {
                    const container = document.createElement('div');
                    container.id = 'temp-extension-icons';
                    container.className = 'scanner-container';
                    container.setAttribute('data-scanner', 'extensions');
                    container.style.cssText = `
                    position: fixed;
                    top: 100px;
                    right: 20px;
                    z-index: 9999;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    background: rgba(0,0,0,0.8);
                    padding: 10px;
                    border-radius: 10px;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.1);
                    `;

                    enabledPlugins.forEach(plugin => {
                        if (plugin.hasPopup) {
                            const icon = document.createElement('div');
                            icon.className = 'temp-extension-icon scanner-element';
                            icon.setAttribute('data-scanner', 'extensions');
                            icon.title = plugin.name;
                            icon.style.cssText = `
                            width: 32px;
                            height: 32px;
                            background: #0a84ff;
                            border-radius: 6px;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: white;
                            font-weight: bold;
                            font-size: 12px;
                            transition: transform 0.2s;
                            `;
                            icon.textContent = plugin.name.charAt(0);

                            icon.onmouseover = () => {
                                icon.style.transform = 'scale(1.1)';
                                icon.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                            };

                            icon.onmouseout = () => {
                                icon.style.transform = 'scale(1)';
                                icon.style.boxShadow = 'none';
                            };

                            icon.onclick = async () => {
                                const result = await window.electronAPI.openPluginPopup(plugin.id);
                                if (result.success) {
                                    window.electronAPI.sendToHost('show-extension-popup', result);
                                }
                            };

                            container.appendChild(icon);
                        }
                    });

                    document.body.appendChild(container);

                    setTimeout(() => {
                        if (container.parentNode) {
                            container.remove();
                        }
                    }, 10000);
                }

                resolve(enabledPlugins);
            });
        });
    },

    // Новая функция для тестирования сканеров
    testScanners: () => window.testBasicScanners()
};

// =============== БЛОКИРОВКА WebRTC (только для внешних страниц) ===============

window.addEventListener('DOMContentLoaded', () => {
    const url = window.location.href;

    if (!isWhitelisted(url)) {
        if (window.RTCPeerConnection) delete window.RTCPeerConnection;
        if (window.webkitRTCPeerConnection) delete window.webkitRTCPeerConnection;
        if (window.mozRTCPeerConnection) delete window.mozRTCPeerConnection;

        if (navigator.mediaDevices) {
            Object.defineProperty(navigator, 'mediaDevices', {
                value: undefined,
                writable: false
            });
        }

        const blockGetUserMedia = () => {
            throw new Error('WebRTC is disabled for privacy');
        };

        if (navigator.getUserMedia) navigator.getUserMedia = blockGetUserMedia;
        if (navigator.webkitGetUserMedia) navigator.webkitGetUserMedia = blockGetUserMedia;
        if (navigator.mozGetUserMedia) navigator.mozGetUserMedia = blockGetUserMedia;
    }

    window.openExtensionPopup = async (extensionId) => {
        if (window.electronAPI && window.electronAPI.openExtensionPopup) {
            const result = await window.electronAPI.openExtensionPopup(extensionId);
            if (result.success) {
                console.log('Extension popup opened from webview');
            }
            return result;
        }
        return { success: false, message: 'API not available' };
    };

    window.closeExtensionPopup = (extensionId) => {
        if (window.electronAPI && window.electronAPI.closeExtensionPopup) {
            return window.electronAPI.closeExtensionPopup(extensionId);
        }
        return false;
    };

    window.getExtensions = async () => {
        if (window.electronAPI && window.electronAPI.getPlugins) {
            return await window.electronAPI.getPlugins();
        }
        return [];
    };

    window.addEventListener('message', (event) => {
        if (event.data.type === 'extension:tabs-create') {
            const url = event.data.data.url;
            if (url && window.electronAPI && window.electronAPI.openUrl) {
                window.electronAPI.openUrl(url);
            }
        }
    });

    console.log('✅ WebView полностью загружен. Белый список:', isWhitelisted(url));
});

// =============== ОБРАБОТЧИК НАСТРОЕК БЕЗОПАСНОСТИ ===============

ipcRenderer.on('security-settings', (event, settings) => {
    const url = window.location.href;
    console.log('🔐 Получены настройки безопасности для:', url.substring(0, 100));

    if (isWhitelisted(url)) {
        console.log('✅ Страница в белом списке - настройки безопасности игнорируются');
        return;
    }

    securityBlocker.setSecuritySettings(settings);
});

document.addEventListener('DOMContentLoaded', () => {
    const url = window.location.href;

    if (isWhitelisted(url)) {
        console.log('✅ Внутренняя страница - блокировка не инициализируется');
        return;
    }

    console.log('🛡️ Инициализация блокировщика безопасности для внешней страницы...');

    setInterval(() => {
        securityBlocker.applyBlocking();
    }, 10000);
});

// =============== АВТОМАТИЧЕСКИЙ ЗАПУСК НА ВНЕШНИХ СТРАНИЦАХ ===============
// Автоматический запуск на внешних страницах
window.addEventListener('DOMContentLoaded', () => {
    const url = window.location.href;

    if (isWhitelisted(url)) {
        console.log('✅ Внутренняя страница - сканеры отключены');
        return;
    }

    console.log('🎯 Внешняя страница: запуск сканера через 5 секунд...');

    setTimeout(() => {
        // Запускаем сканер (только для статических изображений)
        qrAutoScanner.startAutoScan();

        console.log('✅ Сканер запущен автоматически');

        // Тестовая команда для проверки
        console.log('🧪 Для проверки введите в консоли: testBasicScanners()');
    }, 5000);
});

console.log('🧩 Webview Preload: Все системы загружены корректно');
