// webview-preload-popup.js - FIXED VERSION
console.log('=== POPUP PRELOAD LOADED ===');

// Получаем данные расширения из window
const extensionId = window.__EXTENSION_ID__ || 'unknown';
const extensionPath = window.__EXTENSION_PATH__ || '';
const manifest = window.__EXTENSION_MANIFEST__ || { name: 'Extension' };

console.log('[Popup] Extension ID:', extensionId);
console.log('[Popup] Extension Path:', extensionPath);
console.log('[Popup] Manifest:', manifest);

// Функция для получения правильного пути к файлу
function getExtensionURL(path) {
    if (!path) return '';

    // Если путь уже абсолютный, возвращаем как есть
    if (path.match(/^(https?|file|data|blob):/)) {
        return path;
    }

    // Убираем начальный слеш если есть
    const cleanPath = path.startsWith('/') ? path.substring(1) : path;

    // Возвращаем путь с префиксом file://
    return `file://${extensionPath.replace(/\\/g, '/')}/${cleanPath}`;
}

// Эмуляция Chrome API для popup
const chromeAPI = {
    runtime: {
        sendMessage: (message, callback) => {
            console.log('[Popup] chrome.runtime.sendMessage:', message);
            if (callback) setTimeout(() => callback({ success: true }), 0);
        },

        onMessage: {
            addListener: (callback) => {
                console.log('[Popup] chrome.runtime.onMessage.addListener');
                // Реализация обработчика сообщений
                window.addEventListener('message', (event) => {
                    if (event.data && event.data.type === 'runtime-message') {
                        callback(event.data.message, { id: extensionId }, (response) => {
                            // Отправляем ответ обратно
                            if (event.source) {
                                event.source.postMessage({
                                    type: 'runtime-response',
                                    response: response
                                }, '*');
                            }
                        });
                    }
                });
            }
        },

        getManifest: () => {
            return manifest;
        },

        id: extensionId,

        getURL: (path) => {
            console.log('[Popup] chrome.runtime.getURL:', path);
            return getExtensionURL(path);
        }
    },

    storage: {
        local: {
            get: (keys, callback) => {
                console.log('[Popup] chrome.storage.local.get:', keys);
                const result = {};
                const prefix = `ext_${extensionId}_`;

                if (keys === null || keys === undefined) {
                    // Все ключи
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        if (key.startsWith(prefix)) {
                            const cleanKey = key.substring(prefix.length);
                            try {
                                result[cleanKey] = JSON.parse(localStorage.getItem(key));
                            } catch (e) {
                                result[cleanKey] = localStorage.getItem(key);
                            }
                        }
                    }
                } else if (Array.isArray(keys)) {
                    keys.forEach(key => {
                        const value = localStorage.getItem(prefix + key);
                        if (value !== null) {
                            try {
                                result[key] = JSON.parse(value);
                            } catch (e) {
                                result[key] = value;
                            }
                        }
                    });
                }

                if (callback) setTimeout(() => callback(result), 0);
            },

            set: (items, callback) => {
                console.log('[Popup] chrome.storage.local.set:', items);
                const prefix = `ext_${extensionId}_`;
                Object.keys(items).forEach(key => {
                    localStorage.setItem(prefix + key, JSON.stringify(items[key]));
                });
                if (callback) setTimeout(() => callback(), 0);
            }
        }
    },

    tabs: {
        create: (createProperties, callback) => {
            console.log('[Popup] chrome.tabs.create:', createProperties);
            if (createProperties.url) {
                // Используем родительское окно для открытия URL
                if (window.parent && window.parent.electronAPI) {
                    window.parent.electronAPI.openUrl(createProperties.url);
                } else if (window.top && window.top.electronAPI) {
                    window.top.electronAPI.openUrl(createProperties.url);
                }
            }
            if (callback) setTimeout(() => callback({ id: Date.now() }), 0);
        }
    }
};

// Устанавливаем API глобально
window.chrome = chromeAPI;
window.browser = chromeAPI;

// Функция для исправления всех относительных путей на странице
function fixAllRelativePaths() {
    console.log('[Popup] Fixing relative paths...');

    // Исправляем теги с атрибутами src и href
    const elements = document.querySelectorAll('[src], [href], [style]');

    elements.forEach(element => {
        // Исправляем src
        if (element.hasAttribute('src')) {
            const src = element.getAttribute('src');
            if (src && !src.match(/^(https?|data|blob|file):/)) {
                const fixedSrc = getExtensionURL(src);
                element.setAttribute('src', fixedSrc);
                console.log('[Popup] Fixed src:', src, '->', fixedSrc);
            }
        }

        // Исправляем href
        if (element.hasAttribute('href')) {
            const href = element.getAttribute('href');
            if (href && !href.match(/^(https?|data|blob|file):/)) {
                const fixedHref = getExtensionURL(href);
                element.setAttribute('href', fixedHref);
                console.log('[Popup] Fixed href:', href, '->', fixedHref);
            }
        }

        // Исправляем background-image в style
        if (element.hasAttribute('style')) {
            const style = element.getAttribute('style');
            const fixedStyle = style.replace(/url\s*\(\s*['"]?(?!https?:\/\/|data:|blob:|file:)([^'")]+)['"]?\s*\)/gi, (match, url) => {
                const fixedUrl = getExtensionURL(url.trim());
                return `url("${fixedUrl}")`;
            });

    if (style !== fixedStyle) {
        element.setAttribute('style', fixedStyle);
        console.log('[Popup] Fixed style URL');
    }
        }
    });

    // Исправляем inline стили
    const styleElements = document.querySelectorAll('style');
    styleElements.forEach(style => {
        let css = style.textContent;
        const fixedCss = css.replace(/url\s*\(\s*['"]?(?!https?:\/\/|data:|blob:|file:)([^'")]+)['"]?\s*\)/gi, (match, url) => {
            const fixedUrl = getExtensionURL(url.trim());
            return `url("${fixedUrl}")`;
        });

    if (css !== fixedCss) {
        style.textContent = fixedCss;
        console.log('[Popup] Fixed CSS URL');
    }
    });
}

// Простой alert для popup
window.alert = (msg) => {
    console.log('[Popup] Alert:', msg);
    const div = document.createElement('div');
    div.innerHTML = `
    <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;">
    <div style="background:#1e1e1e;padding:20px;border-radius:10px;max-width:400px;">
    <div style="color:white;margin-bottom:15px;">${msg}</div>
    <button onclick="this.parentElement.parentElement.parentElement.remove()" style="background:#007bff;color:white;border:none;padding:8px 16px;border-radius:5px;cursor:pointer;">OK</button>
    </div>
    </div>
    `;
    document.body.appendChild(div);
};

// Инициализация при загрузке
window.addEventListener('DOMContentLoaded', () => {
    console.log('[Popup] DOMContentLoaded');
    console.log('[Popup] Extension ID:', extensionId);
    console.log('[Popup] Manifest:', manifest);

    // Исправляем все относительные пути
    setTimeout(fixAllRelativePaths, 100);

    // Дополнительная проверка после загрузки всех ресурсов
    window.addEventListener('load', () => {
        console.log('[Popup] Window loaded');
        setTimeout(fixAllRelativePaths, 500);
    });

    // Вызываем onload если есть
    setTimeout(() => {
        if (typeof window.onload === 'function') {
            try {
                window.onload();
            } catch (error) {
                console.error('[Popup] Error in window.onload:', error);
            }
        }
    }, 200);
});

console.log('=== POPUP PRELOAD INITIALIZED ===');
