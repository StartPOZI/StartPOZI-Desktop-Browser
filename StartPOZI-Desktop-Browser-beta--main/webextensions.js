const { BrowserWindow, ipcMain, session, dialog, app, screen, webContents } = require('electron');
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const AdmZip = require('adm-zip');
const Store = require('electron-store');

class WebExtensionsAPI {
    constructor(options = {}) {
        this.extensions = new Map();
        this.activePopups = new Map();
        this.contentScripts = new Map();
        this.browserActions = new Map();
        this.pageActions = new Map();
        this.storageListeners = new Map();

        this.EXTENSIONS_PATH = options.extensionsPath || path.join(app.getPath('userData'), 'extensions');
        this.TEMP_PATH = path.join(app.getPath('userData'), 'temp_extensions');
        this.SYSTEM_EXTENSIONS_PATH = options.systemExtensionsPath || path.join(__dirname, 'extensions');
        this.EXTENSIONS_DATA_PATH = path.join(app.getPath('userData'), 'extensions_data');

        [this.EXTENSIONS_PATH, this.TEMP_PATH, this.EXTENSIONS_DATA_PATH].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });

        // Проверяем electron-store
        try {
            const Store = require('electron-store');
            const testStore = new Store({ name: 'test_store', defaults: { test: 'value' } });
            console.log('✅ electron-store 8.2 initialized successfully');
            console.log('📁 Store paths will be in:', app.getPath('userData'));
        } catch (error) {
            console.error('❌ Failed to initialize electron-store:', error);
        }

        console.log('🚀 WebExtensionsAPI initialized with electron-store 8.2');

        // Установка обновлений расширений
        this.setupExtensionUpdates();

        // Универсальное хранилище настраивается в main.js, здесь ничего не регистрируем
    }

    /**
     * Настраивает отправку обновлений расширений в renderer
     */
    setupExtensionUpdates() {
        // Монтируем отправку событий к методам класса
        const originalToggleExtension = this.toggleExtension.bind(this);
        const originalRegisterExtension = this.registerExtension.bind(this);
        const originalRemoveExtension = this.removeExtension.bind(this);

        this.toggleExtension = (extensionId, enabled) => {
            const result = originalToggleExtension(extensionId, enabled);
            if (result) {
                this.sendExtensionStateChanged(extensionId, enabled);
                this.sendExtensionsUpdated();
            }
            return result;
        };

        this.registerExtension = async (extensionPath, manifest, isSystem = false) => {
            const extensionId = await originalRegisterExtension(extensionPath, manifest, isSystem);
            this.sendExtensionsUpdated();
            return extensionId;
        };

        this.removeExtension = (extensionId) => {
            const result = originalRemoveExtension(extensionId);
            if (result) {
                this.sendExtensionsUpdated();
            }
            return result;
        };

        console.log('✅ Extension updates system setup');
    }

    async loadAllExtensions() {
        console.log('\n📂 Loading all extensions...');

        const systemExtPath = this.SYSTEM_EXTENSIONS_PATH;
        if (fs.existsSync(systemExtPath)) {
            await this.loadExtensionsFromDir(systemExtPath, true);
        }

        await this.loadExtensionsFromDir(this.EXTENSIONS_PATH, false);

        console.log(`✅ Total extensions loaded: ${this.extensions.size}`);

        return Array.from(this.extensions.values());
    }

    async loadExtensionsFromDir(dirPath, isSystem = false) {
        if (!fs.existsSync(dirPath)) return;

        const items = fs.readdirSync(dirPath, { withFileTypes: true });
        const extensionDirs = items.filter(item => item.isDirectory()).map(item => item.name);

        for (const dirName of extensionDirs) {
            const extPath = path.join(dirPath, dirName);
            const manifestPath = path.join(extPath, 'manifest.json');

            if (fs.existsSync(manifestPath)) {
                try {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                    await this.registerExtension(extPath, manifest, isSystem);
                } catch (e) {
                    console.error(`Error loading extension ${dirName}:`, e.message);
                }
            }
        }
    }

    async registerExtension(extensionPath, manifest, isSystem = false) {
        const extensionId = this.generateExtensionId(manifest, isSystem);

        // Загружаем локализации если есть
        let locales = {};
        if (manifest.default_locale) {
            const localePath = path.join(extensionPath, '_locales', manifest.default_locale, 'messages.json');
            if (fs.existsSync(localePath)) {
                try {
                    locales = JSON.parse(fs.readFileSync(localePath, 'utf8'));
                    console.log(`🌐 Loaded locales for ${manifest.default_locale}`);
                } catch (e) {
                    console.error(`Error loading locales for ${manifest.default_locale}:`, e.message);
                }
            }
        }

        // Читаем сохраненные настройки для этого расширения
        const settingsPath = path.join(app.getPath('userData'), 'extensions_settings', `${extensionId}.json`);
        let enabled = true;

        // Создаем директорию для настроек если не существует
        const settingsDir = path.dirname(settingsPath);
        if (!fs.existsSync(settingsDir)) {
            fs.mkdirSync(settingsDir, { recursive: true });
        }

        if (fs.existsSync(settingsPath)) {
            try {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                enabled = settings.enabled !== false;
                console.log(`📖 Loaded state for ${extensionId}: ${enabled ? 'enabled' : 'disabled'}`);
            } catch (e) {
                console.error(`Error reading settings for ${extensionId}:`, e.message);
            }
        } else {
            // Создаем файл настроек с состоянием по умолчанию
            const defaultSettings = {
                enabled: true,
                created: new Date().toISOString(),
                name: manifest.name,
                version: manifest.version
            };
            try {
                fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2), 'utf8');
                console.log(`📝 Created settings file for ${extensionId} (default: enabled)`);
            } catch (e) {
                console.error(`Error creating settings for ${extensionId}:`, e.message);
            }
        }

        const extension = {
            id: extensionId,
            path: extensionPath.replace(/\\/g, '/'),
            manifest: manifest,
            locales: locales,
            enabled: enabled,
            version: manifest.version || '1.0',
            name: manifest.name || 'Unknown Extension',
            description: manifest.description || '',
            author: manifest.author || '',
            homepage: manifest.homepage_url || '',
            browserAction: manifest.browser_action || manifest.action || {},
            pageAction: manifest.page_action || {},
            icons: this.getExtensionIcons(extensionPath, manifest),
            permissions: manifest.permissions || [],
            contentScripts: manifest.content_scripts || [],
            background: manifest.background || {},
            hasPopup: false,
            popupPath: null,
            popupHTML: null,
            browserStyle: manifest.browser_style || manifest.browser_action?.browser_style || false,
            isSystem: isSystem
        };

        // Проверяем наличие popup
        const popupFile = manifest.browser_action?.default_popup ||
        manifest.action?.default_popup ||
        manifest.page_action?.default_popup;

        if (popupFile) {
            const popupPath = path.join(extensionPath, popupFile);
            if (fs.existsSync(popupPath)) {
                extension.hasPopup = true;
                extension.popupPath = popupPath;
                extension.popupHTML = this.readAndFixPopupHTML(popupPath, extension);
            }
        } else {
            const possibleFiles = [
                'popup.html',
                'popup/popup.html',
                'src/popup.html',
                'html/popup.html',
                'ui/popup.html',
                'panel.html',
                'index.html'
            ];

            for (const file of possibleFiles) {
                const popupPath = path.join(extensionPath, file);
                if (fs.existsSync(popupPath)) {
                    extension.hasPopup = true;
                    extension.popupPath = popupPath;
                    extension.popupHTML = this.readAndFixPopupHTML(popupPath, extension);
                    break;
                }
            }
        }

        if (manifest.content_scripts) {
            this.loadContentScripts(extension);
        }

        if (manifest.background && extension.enabled) {
            this.loadBackgroundScripts(extension);
        }

        this.extensions.set(extensionId, extension);

        console.log(`✅ Extension registered: ${extension.name} (${extensionId}) - ${extension.enabled ? 'enabled' : 'disabled'}`);
        if (extension.hasPopup) {
            console.log(`   📍 Has popup: ${extension.popupPath}`);
        }

        return extensionId;
    }

    readAndFixPopupHTML(popupPath, extension) {
        try {
            console.log(`🔍 Reading popup from: ${popupPath}`);

            if (!fs.existsSync(popupPath)) {
                console.error(`❌ Popup file not found: ${popupPath}`);
                return null;
            }

            let html = fs.readFileSync(popupPath, 'utf8');

            if (!html || html.trim().length === 0) {
                console.error('❌ Popup HTML is empty');
                return '<!DOCTYPE html><html><body><h1>Popup is empty</h1></body></html>';
            }

            console.log(`📊 Original HTML length: ${html.length} chars`);

            // Базовый путь расширения
            const extPath = extension.path.replace(/\\/g, '/');
            const basePath = extPath.endsWith('/') ? extPath : extPath + '/';

            // Директория popup-файла
            const popupDir = path.dirname(popupPath).replace(/\\/g, '/');
            const extDir = extension.path.replace(/\\/g, '/');
            const relativeDir = path.relative(extDir, popupDir).replace(/\\/g, '/');

            console.log(`📍 Extension base path: ${basePath}`);
            console.log(`📍 Popup directory: ${popupDir}`);
            console.log(`📍 Relative directory: ${relativeDir}`);

            // Функция для создания абсолютных путей
            const makeAbsolutePath = (relativePath) => {
                if (!relativePath || relativePath.trim() === '') {
                    return '';
                }

                // Если уже абсолютный URL
                if (relativePath.startsWith('http://') ||
                    relativePath.startsWith('https://') ||
                    relativePath.startsWith('data:') ||
                    relativePath.startsWith('blob:') ||
                    relativePath.startsWith('file://')) {
                    return relativePath;
                    }

                    // Нормализуем относительный путь
                    let normalized = relativePath;

                // Убираем ведущие символы
                if (normalized.startsWith('./')) {
                    normalized = normalized.substring(2);
                } else if (normalized.startsWith('../')) {
                    // Относительный путь на уровень выше
                    normalized = normalized.substring(3);
                } else if (normalized.startsWith('/')) {
                    normalized = normalized.substring(1);
                }

                // Определяем базовую директорию
                let baseDir = popupDir;
                if (relativePath.startsWith('/')) {
                    baseDir = extDir;
                } else if (relativePath.startsWith('./')) {
                    baseDir = popupDir;
                } else if (relativePath.startsWith('../')) {
                    baseDir = popupDir;
                } else {
                    // Если нет префикса, считаем от корня расширения
                    baseDir = extDir;
                }

                // Собираем полный путь
                let resolvedPath = path.join(baseDir, normalized);
                resolvedPath = path.normalize(resolvedPath);

                // Проверяем существование файла
                if (!fs.existsSync(resolvedPath)) {
                    console.warn(`⚠️ Resource not found: ${resolvedPath} (original: ${relativePath})`);
                    // Пробуем найти относительно корня расширения
                    const fallbackPath = path.join(extDir, normalized);
                    if (fs.existsSync(fallbackPath)) {
                        resolvedPath = fallbackPath;
                    } else {
                        // Если всё равно не найдено, возвращаем путь относительно корня
                        console.error(`❌ Resource not found anywhere: ${relativePath}`);
                        return `file://${extDir}/${normalized}`;
                    }
                }

                // Преобразуем в file:// URL
                let fileUrl;
                if (process.platform === 'win32') {
                    // Windows: file:///C:/path/to/file
                    const normalizedPath = resolvedPath.replace(/\\/g, '/');
                    if (normalizedPath.match(/^[a-zA-Z]:/)) {
                        fileUrl = `file:///${normalizedPath}`;
                    } else {
                        fileUrl = `file://${normalizedPath}`;
                    }
                } else {
                    // Unix-like: file:///path/to/file
                    fileUrl = `file://${resolvedPath}`;
                }

                // Кодируем спецсимволы
                fileUrl = encodeURI(fileUrl);

                console.log(`🔗 Converted: ${relativePath} -> ${fileUrl}`);
                return fileUrl;
            };

            // 1. Заменяем локализации
            if (extension.locales && Object.keys(extension.locales).length > 0) {
                html = html.replace(/__MSG_(\w+)__/g, (match, key) => {
                    if (extension.locales[key] && extension.locales[key].message) {
                        return extension.locales[key].message;
                    }
                    return key === 'name' ? extension.name : key;
                });
            }

            // 2. Исправляем CSS ссылки
            html = html.replace(/<link([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi, (match, before, href, after) => {
                if (href.startsWith('http://') || href.startsWith('https://') ||
                    href.startsWith('data:') || href.startsWith('blob:') || href.startsWith('file://')) {
                    return match;
                    }

                    const fixedHref = makeAbsolutePath(href);
                return `<link${before}href="${fixedHref}"${after}>`;
            });

            // 3. Исправляем скрипты
            html = html.replace(/<script([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (match, before, src, after) => {
                if (src.startsWith('http://') || src.startsWith('https://') ||
                    src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('file://')) {
                    return match;
                    }

                    const fixedSrc = makeAbsolutePath(src);
                return `<script${before}src="${fixedSrc}"${after}>`;
            });

            // 4. Исправляем изображения
            html = html.replace(/<img([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (match, before, src, after) => {
                if (src.startsWith('http://') || src.startsWith('https://') ||
                    src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('file://')) {
                    return match;
                    }

                    const fixedSrc = makeAbsolutePath(src);
                return `<img${before}src="${fixedSrc}"${after}>`;
            });

            // 5. Исправляем CSS background
            html = html.replace(/background(?:-image)?:\s*url\(["']?([^"')]+)["']?\)/gi, (match, url) => {
                if (url.startsWith('http://') || url.startsWith('https://') ||
                    url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('file://')) {
                    return match;
                    }

                    const fixedUrl = makeAbsolutePath(url);
                return `background-image: url("${fixedUrl}")`;
            });

            // 6. Исправляем url() в CSS
            html = html.replace(/url\(["']?([^"')]+)["']?\)/gi, (match, url) => {
                const trimmedUrl = url.trim();
                if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://') ||
                    trimmedUrl.startsWith('data:') || trimmedUrl.startsWith('blob:') || trimmedUrl.startsWith('file://')) {
                    return match;
                    }

                    const fixedUrl = makeAbsolutePath(trimmedUrl);
                return `url("${fixedUrl}")`;
            });

            // 7. Добавляем базовый тег
            const baseTag = `<base href="file://${basePath}">`;

            // Добавляем в head
            if (html.includes('<head>')) {
                html = html.replace('<head>', `<head>${baseTag}`);
            } else if (html.includes('<html>')) {
                html = html.replace('<html>', `<html><head>${baseTag}</head>`);
            } else {
                html = `<!DOCTYPE html>
                <html>
                <head>
                ${baseTag}
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${extension.name || 'Popup'}</title>
                </head>
                <body>
                ${html}
                </body>
                </html>`;
            }

            // 8. Добавляем полифилл для file:// URL в старом Electron
            const fileProtocolFix = `
            <script>
            // Исправление для file:// протокола в Electron
            (function() {
                // Сохраняем оригинальные методы
                var originalCreateElement = document.createElement;
                var originalSetAttribute = Element.prototype.setAttribute;

                // Переопределяем createElement для обработки src/href
                document.createElement = function(tagName) {
                    var element = originalCreateElement.call(document, tagName);

                    if (tagName.toLowerCase() === 'script') {
                        // Для скриптов переопределяем setAttribute
                        element.setAttribute = function(name, value) {
                            if (name === 'src' && value && !value.match(/^(https?:|data:|blob:|file:)/)) {
                                // Преобразуем относительный путь
                                var base = document.querySelector('base');
                                if (base && base.href) {
                                    try {
                                        var absoluteUrl = new URL(value, base.href).href;
                                        return originalSetAttribute.call(this, name, absoluteUrl);
                                    } catch(e) {
                                        console.error('Error resolving script URL:', e);
                                    }
                                }
                            }
                            return originalSetAttribute.call(this, name, value);
                        };
                    }

                    return element;
                };

                // Исправляем существующие элементы
                function fixExistingElements() {
                    // Ссылки
                    var links = document.querySelectorAll('link[href]');
                    for (var i = 0; i < links.length; i++) {
                        var href = links[i].getAttribute('href');
                        if (href && !href.match(/^(https?:|data:|blob:|file:)/)) {
                            var base = document.querySelector('base');
                            if (base && base.href) {
                                try {
                                    var absoluteUrl = new URL(href, base.href).href;
                                    links[i].setAttribute('href', absoluteUrl);
                                } catch(e) {
                                    console.error('Error fixing link URL:', e);
                                }
                            }
                        }
                    }

                    // Изображения
                    var images = document.querySelectorAll('img[src]');
                    for (var i = 0; i < images.length; i++) {
                        var src = images[i].getAttribute('src');
                        if (src && !src.match(/^(https?:|data:|blob:|file:)/)) {
                            var base = document.querySelector('base');
                            if (base && base.href) {
                                try {
                                    var absoluteUrl = new URL(src, base.href).href;
                                    images[i].setAttribute('src', absoluteUrl);
                                } catch(e) {
                                    console.error('Error fixing image URL:', e);
                                }
                            }
                        }
                    }
                }

                // Запускаем после загрузки DOM
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', fixExistingElements);
                } else {
                    setTimeout(fixExistingElements, 100);
                }
            })();
            </script>
            `;

            // Вставляем фикс перед </head>
            if (html.includes('</head>')) {
                html = html.replace('</head>', `${fileProtocolFix}</head>`);
            } else if (html.includes('<body>')) {
                html = html.replace('<body>', `${fileProtocolFix}<body>`);
            }

            // [НОВЫЙ БЛОК] Добавляем скрипт авторазмера popup
            const autoResizeScript = `
            <script>
            // Авторазмер popup
            (function() {
                function sendSize() {
                    // Получаем размеры документа
                    const width = document.documentElement.scrollWidth;
                    const height = document.documentElement.scrollHeight;
                    // Отправляем родительскому окну
                    window.parent.postMessage({
                        type: 'popup-resize',
                        width: width,
                        height: height
                    }, '*');
                }

                // Отправляем размер после загрузки
                window.addEventListener('load', function() {
                    // Небольшая задержка для стабильности
                    setTimeout(sendSize, 100);
                });

                // Следим за изменениями размеров через ResizeObserver
                if (window.ResizeObserver) {
                    const observer = new ResizeObserver(function() {
                        sendSize();
                    });
                    observer.observe(document.documentElement);
                } else {
                    // Fallback: следим за изменением размера окна
                    window.addEventListener('resize', sendSize);
                }

                // Также отправляем размер при появлении новых элементов (например, после динамической загрузки)
                // Можно использовать MutationObserver
                if (window.MutationObserver) {
                    const mutationObserver = new MutationObserver(function() {
                        sendSize();
                    });
                    mutationObserver.observe(document.documentElement, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        characterData: true
                    });
                }

                // Принудительно отправляем размер через 500ms после загрузки, на всякий случай
                window.addEventListener('load', function() {
                    setTimeout(sendSize, 500);
                });
            })();
            </script>
            `;

            // Вставляем скрипт авторазмера перед </head>
            if (html.includes('</head>')) {
                html = html.replace('</head>', `${autoResizeScript}</head>`);
            } else if (html.includes('<body>')) {
                html = html.replace('<body>', `${autoResizeScript}<body>`);
            } else {
                // Если нет head, просто добавляем в начало body
                html = autoResizeScript + html;
            }

            console.log(`✅ Popup HTML processed successfully (with auto-resize script)`);

            return html;

        } catch (error) {
            console.error(`❌ Error in readAndFixPopupHTML:`, error);
            console.error('Stack:', error.stack);

            return `<!DOCTYPE html>
            <html>
            <head>
            <meta charset="UTF-8">
            <title>Popup Error</title>
            <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f8f9fa; }
            .error { background: #ffebee; padding: 15px; border-radius: 5px; border-left: 4px solid #f44336; }
            </style>
            </head>
            <body>
            <div class="error">
            <h3>Error Loading Popup</h3>
            <p>Extension: ${extension.name || 'Unknown'}</p>
            <p>Error: ${error.message}</p>
            <p>Path: ${popupPath}</p>
            <p>Please check the extension files.</p>
            </div>
            </body>
            </html>`;
        }
    }

    generateExtensionId(manifest, isSystem = false) {
        const name = manifest.name || 'extension';
        const version = manifest.version || '1.0';

        if (isSystem) {
            return `system_${nanoid(8)}`;
        }

        const hash = require('crypto')
        .createHash('md5')
        .update(name + version)
        .digest('hex')
        .substring(0, 12);

        return `ext_${hash}`;
    }

    getExtensionIcons(extensionPath, manifest) {
        const icons = {};

        if (manifest.icons) {
            Object.entries(manifest.icons).forEach(([size, iconPath]) => {
                const fullPath = path.join(extensionPath, iconPath);
                if (fs.existsSync(fullPath)) {
                    icons[size] = `file://${fullPath.replace(/\\/g, '/')}`;
                }
            });
        }

        if (manifest.browser_action?.default_icon) {
            const icon = manifest.browser_action.default_icon;
            if (typeof icon === 'string') {
                const fullPath = path.join(extensionPath, icon);
                if (fs.existsSync(fullPath)) {
                    icons['32'] = `file://${fullPath.replace(/\\/g, '/')}`;
                }
            } else if (typeof icon === 'object') {
                Object.entries(icon).forEach(([size, iconPath]) => {
                    const fullPath = path.join(extensionPath, iconPath);
                    if (fs.existsSync(fullPath)) {
                        icons[size] = `file://${fullPath.replace(/\\/g, '/')}`;
                    }
                });
            }
        }

        if (manifest.action?.default_icon) {
            const icon = manifest.action.default_icon;
            if (typeof icon === 'string') {
                const fullPath = path.join(extensionPath, icon);
                if (fs.existsSync(fullPath)) {
                    icons['32'] = `file://${fullPath.replace(/\\/g, '/')}`;
                }
            } else if (typeof icon === 'object') {
                Object.entries(icon).forEach(([size, iconPath]) => {
                    const fullPath = path.join(extensionPath, iconPath);
                    if (fs.existsSync(fullPath)) {
                        icons[size] = `file://${fullPath.replace(/\\/g, '/')}`;
                    }
                });
            }
        }

        if (Object.keys(icons).length === 0) {
            icons['32'] = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%230a84ff"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>';
        }

        return icons;
    }

    loadContentScripts(extension) {
        if (!extension.contentScripts || !Array.isArray(extension.contentScripts)) {
            return;
        }

        extension.contentScripts.forEach(script => {
            if (script.js && Array.isArray(script.js)) {
                script.js.forEach(jsFile => {
                    const scriptPath = path.join(extension.path, jsFile);
                    if (fs.existsSync(scriptPath)) {
                        try {
                            const content = fs.readFileSync(scriptPath, 'utf8');

                            const patterns = script.matches || ['<all_urls>'];
                            patterns.forEach(pattern => {
                                if (!this.contentScripts.has(pattern)) {
                                    this.contentScripts.set(pattern, []);
                                }
                                this.contentScripts.get(pattern).push({
                                    extensionId: extension.id,
                                    content: content,
                                    runAt: script.run_at || 'document_idle',
                                    allFrames: script.all_frames || false
                                });

                                console.log(`📄 Content script registered for pattern: ${pattern} (extension: ${extension.id})`);
                            });
                        } catch (e) {
                            console.error(`Error loading content script ${jsFile}:`, e);
                        }
                    } else {
                        console.warn(`⚠️ Content script file not found: ${scriptPath}`);
                    }
                });
            }
        });
    }

    loadBackgroundScripts(extension) {
        if (!extension.background || !extension.enabled) return;

        const scripts = extension.background.scripts || [];
        if (extension.background.service_worker) {
            scripts.push(extension.background.service_worker);
        }

        scripts.forEach(scriptFile => {
            const scriptPath = path.join(extension.path, scriptFile);
            if (fs.existsSync(scriptPath)) {
                try {
                    const content = fs.readFileSync(scriptPath, 'utf8');
                    this.executeBackgroundScript(extension.id, content, extension);
                } catch (e) {
                    console.error(`Error loading background script ${scriptFile}:`, e);
                }
            }
        });
    }

    executeBackgroundScript(extensionId, scriptContent, extension) {
        const bgWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false,
                webSecurity: false,
                preload: path.join(__dirname, 'extension-bg-preload.js')
            }
        });

        const injectedScript = `
        <script>
        // Полная эмуляция Chrome API для background scripts
        (function() {
            const extId = "${extensionId}";
            const manifest = ${JSON.stringify(extension.manifest || {})};

            // Функции для работы с хранилищем через IPC
            function getStorageData(keys, namespace = 'local') {
                return new Promise((resolve) => {
                    if (window.electronStorageAPI) {
                        const requestId = 'bg-get-' + Date.now() + '-' + Math.random();
                        window.electronStorageAPI.get({
                            extensionId: extId,
                            keys: keys,
                            namespace: namespace,
                            requestId: requestId
                        }).then(resolve);
                    } else {
                        resolve({});
                    }
                });
            }

            function setStorageData(items, namespace = 'local') {
                return new Promise((resolve) => {
                    if (window.electronStorageAPI) {
                        const requestId = 'bg-set-' + Date.now() + '-' + Math.random();
                        window.electronStorageAPI.set({
                            extensionId: extId,
                            items: items,
                            namespace: namespace,
                            requestId: requestId
                        }).then(resolve);
                    } else {
                        resolve();
                    }
                });
            }

            // Создаем полный Chrome API
            window.chrome = {
                runtime: {
                    id: extId,
                    getManifest: () => manifest,
         getURL: (path) => {
             if (!path) return "";
             return "file://" + "${extension.path.replace(/\\/g, '/')}" + "/" + path;
         },
         onMessage: {
             addListener: (callback) => {
                 console.log('[Background] chrome.runtime.onMessage.addListener');
                 window.addEventListener('message', (event) => {
                     if (event.data && event.data.type === 'extension-message') {
                         callback(event.data.message, { id: extId }, (response) => {
                             if (event.source) {
                                 event.source.postMessage({
                                     type: 'extension-response',
                                     response: response
                                 }, '*');
                             }
                         });
                     }
                 });
             },
             removeListener: () => {}
         },
         sendMessage: (message, callback) => {
             console.log('[Background] chrome.runtime.sendMessage:', message);
             if (window.electronAPI) {
                 window.electronAPI.send('extension-message', {
                     extensionId: extId,
                     message: message
                 });
             }
             if (callback) setTimeout(() => callback({ success: true }), 0);
         }
                },
                storage: {
                    local: {
                        get: (keys, callback) => {
                            console.log('[Background] chrome.storage.local.get:', keys);
                            getStorageData(keys, 'local').then(result => {
                                if (callback) callback(result);
                            });
                        },
                        set: (items, callback) => {
                            console.log('[Background] chrome.storage.local.set:', items);
                            setStorageData(items, 'local').then(() => {
                                if (callback) callback();
                            });
                        },
                        remove: (keys, callback) => {
                            console.log('[Background] chrome.storage.local.remove:', keys);
                            if (window.electronStorageAPI) {
                                window.electronStorageAPI.remove({
                                    extensionId: extId,
                                    keys: keys,
                                    namespace: 'local'
                                }).then(() => {
                                    if (callback) callback();
                                });
                            } else if (callback) {
                                callback();
                            }
                        },
                        clear: (callback) => {
                            console.log('[Background] chrome.storage.local.clear');
                            if (window.electronStorageAPI) {
                                window.electronStorageAPI.clear({
                                    extensionId: extId,
                                    namespace: 'local'
                                }).then(() => {
                                    if (callback) callback();
                                });
                            } else if (callback) {
                                callback();
                            }
                        }
                    },
                    sync: {
                        get: (keys, callback) => {
                            console.log('[Background] chrome.storage.sync.get:', keys);
                            getStorageData(keys, 'sync').then(result => {
                                if (callback) callback(result);
                            });
                        },
                        set: (items, callback) => {
                            console.log('[Background] chrome.storage.sync.set:', items);
                            setStorageData(items, 'sync').then(() => {
                                if (callback) callback();
                            });
                        },
                        remove: (keys, callback) => {
                            console.log('[Background] chrome.storage.sync.remove:', keys);
                            if (window.electronStorageAPI) {
                                window.electronStorageAPI.remove({
                                    extensionId: extId,
                                    keys: keys,
                                    namespace: 'sync'
                                }).then(() => {
                                    if (callback) callback();
                                });
                            } else if (callback) {
                                callback();
                            }
                        },
                        clear: (callback) => {
                            console.log('[Background] chrome.storage.sync.clear');
                            if (window.electronStorageAPI) {
                                window.electronStorageAPI.clear({
                                    extensionId: extId,
                                    namespace: 'sync'
                                }).then(() => {
                                    if (callback) callback();
                                });
                            } else if (callback) {
                                callback();
                            }
                        }
                    },
                    onChanged: {
                        addListener: (callback) => {
                            console.log('[Background] chrome.storage.onChanged.addListener');
                            window.addEventListener('storage-changed', (event) => {
                                if (event.detail && event.detail.extensionId === extId) {
                                    callback(event.detail.changes, event.detail.namespace);
                                }
                            });
                        },
                        removeListener: () => {}
                    }
                },
                tabs: {
                    query: (queryInfo, callback) => {
                        console.log('[Background] chrome.tabs.query:', queryInfo);
                        if (callback) setTimeout(() => callback([]), 0);
                    },
                    create: (createProperties, callback) => {
                        console.log('[Background] chrome.tabs.create:', createProperties);
                        if (createProperties && createProperties.url) {
                            if (window.electronAPI) {
                                window.electronAPI.send('open-tab', createProperties.url);
                            }
                        }
                        if (callback) setTimeout(() => callback({ id: Date.now() }), 0);
                    },
                    update: (tabId, updateProperties, callback) => {
                        console.log('[Background] chrome.tabs.update:', tabId, updateProperties);
                        if (callback) setTimeout(() => callback({}), 0);
                    }
                }
            };

            window.browser = window.chrome;

            console.log('[Background] Chrome API initialized for extension:', extId);
        })();
        </script>
        <script>
        ${scriptContent}
        </script>
        `;

        bgWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(injectedScript)}`);
        console.log(`📝 Background script executed for extension: ${extensionId}`);
    }

    async openExtensionPopup(extensionId, anchorRect = null) {
        console.log(`🎯 Opening popup for extension: ${extensionId}`);

        const extension = this.extensions.get(extensionId);
        if (!extension) {
            console.error('Extension not found:', extensionId);
            return {
                success: false,
                message: 'Extension not found',
                extension: null
            };
        }

        console.log(`📋 Extension found: ${extension.name} (${extensionId})`);
        console.log(`📍 Has popup: ${extension.hasPopup}`);
        console.log(`📍 Popup path: ${extension.popupPath}`);

        if (!extension.hasPopup) {
            return {
                success: false,
                message: 'Extension has no popup',
                extension: extension
            };
        }

        try {
            // Читаем файл напрямую
            const popupPath = extension.popupPath;
            console.log(`📄 Reading popup file: ${popupPath}`);

            if (!fs.existsSync(popupPath)) {
                console.error('Popup file does not exist:', popupPath);
                return {
                    success: false,
                    message: 'Popup file not found',
                    extension: extension
                };
            }

            let htmlContent = fs.readFileSync(popupPath, 'utf8');
            console.log(`📄 File read successfully, ${htmlContent.length} chars`);

            // Проверяем содержание
            if (htmlContent.length < 10) {
                console.error('Popup file is empty or too small');
            }

            // Выводим первые 500 символов для диагностики
            console.log('📄 First 500 chars:', htmlContent.substring(0, 500).replace(/\n/g, ' '));

            return {
                success: true,
                message: 'Popup HTML generated successfully',
                popupHTML: htmlContent,
                extension: {
                    id: extension.id,
                    name: extension.name,
                    version: extension.version,
                    enabled: extension.enabled,
                    hasPopup: extension.hasPopup,
                    path: extension.path,
                    icons: extension.icons,
                    manifest: extension.manifest,
                    locales: extension.locales
                }
            };

        } catch (error) {
            console.error('Error in openExtensionPopup:', error);
            return {
                success: false,
                message: `Error: ${error.message}`,
                extension: extension
            };
        }
    }

    async getPopupHTML(extension) {
        try {
            if (extension.popupHTML) {
                return this.injectExtensionData(extension.popupHTML, extension);
            }

            if (extension.popupPath && fs.existsSync(extension.popupPath)) {
                let html = fs.readFileSync(extension.popupPath, 'utf8');
                html = this.fixResourcePaths(html, extension.path);
                return this.injectExtensionData(html, extension);
            }

            return null;
        } catch (error) {
            console.error(`Error getting popup HTML for ${extension.id}:`, error);
            return null;
        }
    }

    injectExtensionData(htmlContent, extension) {
        const extensionId = extension.id;
        const extensionPath = extension.path.replace(/\\/g, '/');
        const manifestStr = JSON.stringify(extension.manifest || {});
        const localesStr = JSON.stringify(extension.locales || {});
        const browserStyle = extension.browserStyle || false;

        const injectionScript = `
        <script>
        // Полная эмуляция Chrome API для расширений
        (function() {
            const extId = "${extensionId}";
            const extPath = "${extensionPath}";
            const manifest = ${manifestStr};
            const extLocales = ${localesStr};
            const browserStyle = ${browserStyle};

            // Получаем доступ к API через electronExtensionAPI
            const storageAPI = window.extensionStorageAPI;

            // Создаем Chrome API
            const chromeAPI = {
                runtime: {
                    id: extId,
                    getManifest: () => manifest,
         getURL: (path) => {
             if (!path) return "";
             if (path.startsWith('http://') || path.startsWith('https://') ||
                 path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('file://')) {
                 return path;
                 }
                 let cleanPath = path;
             if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
             if (cleanPath.startsWith('./')) cleanPath = cleanPath.substring(2);
             return "file://" + extPath + "/" + cleanPath;
         },
         sendMessage: (message, callback) => {
             console.log('[Popup] chrome.runtime.sendMessage:', message);
             if (electronAPI && electronAPI.sendMessage) {
                 electronAPI.sendMessage(message);
             }
             if (callback) setTimeout(() => callback({ success: true }), 0);
         },
         onMessage: {
             addListener: (callback) => {
                 console.log('[Popup] chrome.runtime.onMessage.addListener');
                 window.addEventListener('message', (event) => {
                     if (event.data && event.data.type === 'extension-message') {
                         callback(event.data.message, { id: extId }, (response) => {
                             if (electronAPI && electronAPI.sendMessage) {
                                 electronAPI.sendMessage({
                                     type: 'response',
                                     response: response
                                 });
                             }
                         });
                     }
                 });
             },
             removeListener: () => {}
         }
                },

                i18n: {
                    getMessage: (messageName, substitutions) => {
                        console.log('[Popup] chrome.i18n.getMessage:', messageName, substitutions);

                        // Ищем сообщение в локализациях
                        if (extLocales[messageName] && extLocales[messageName].message) {
                            let message = extLocales[messageName].message;

                            // Заменяем подстановки если есть
                            if (substitutions) {
                                if (Array.isArray(substitutions)) {
                                    substitutions.forEach((sub, index) => {
                                        message = message.replace(new RegExp('\\\\$' + (index + 1), 'g'), sub);
                                    });
                                } else if (typeof substitutions === 'string') {
                                    message = message.replace(/\\$1/g, substitutions);
                                }
                            }

                            return message;
                        }

                        // Возвращаем имя сообщения если локализация не найдена
                        return messageName;
                    },

                    getUILanguage: () => {
                        return navigator.language || 'en';
                    },

                    detectLanguage: (text, callback) => {
                        console.log('[Popup] chrome.i18n.detectLanguage:', text);
                        if (callback) setTimeout(() => callback({
                            isReliable: true,
                            languages: [{ language: 'en', percentage: 100 }]
                        }), 0);
                    }
                },

                browserAction: {
                    setPopup: (details) => {
                        console.log('[Popup] chrome.browserAction.setPopup:', details);
                        // Реализуем логику установки popup
                        if (details.popup) {
                            try {
                                const popupBtn = document.querySelector('[data-extension-id="' + extId + '"]');
                                if (popupBtn) {
                                    popupBtn.dataset.popup = details.popup;
                                    console.log('[Popup] Popup установлен:', details.popup);
                                }
                            } catch (e) {
                                console.error('[Popup] Error setting popup:', e);
                            }
                        }
                    },

                    setIcon: (details, callback) => {
                        console.log('[Popup] chrome.browserAction.setIcon:', details);
                        if (callback) setTimeout(() => callback(), 0);
                    },

                    setTitle: (details, callback) => {
                        console.log('[Popup] chrome.browserAction.setTitle:', details);
                        if (callback) setTimeout(() => callback(), 0);
                    },

                    setBadgeText: (details, callback) => {
                        console.log('[Popup] chrome.browserAction.setBadgeText:', details);
                        if (callback) setTimeout(() => callback(), 0);
                    },

                    setBadgeBackgroundColor: (details, callback) => {
                        console.log('[Popup] chrome.browserAction.setBadgeBackgroundColor:', details);
                        if (callback) setTimeout(() => callback(), 0);
                    },

                    enable: (tabId, callback) => {
                        console.log('[Popup] chrome.browserAction.enable:', tabId);
                        if (callback) setTimeout(() => callback(), 0);
                    },

                    disable: (tabId, callback) => {
                        console.log('[Popup] chrome.browserAction.disable:', tabId);
                        if (callback) setTimeout(() => callback(), 0);
                    },

                    getPopup: (details, callback) => {
                        console.log('[Popup] chrome.browserAction.getPopup:', details);
                        if (callback) setTimeout(() => callback({}), 0);
                    },

                    getTitle: (details, callback) => {
                        console.log('[Popup] chrome.browserAction.getTitle:', details);
                        if (callback) setTimeout(() => callback({}), 0);
                    },

                    getBadgeText: (details, callback) => {
                        console.log('[Popup] chrome.browserAction.getBadgeText:', details);
                        if (callback) setTimeout(() => callback({}), 0);
                    },

                    getBadgeBackgroundColor: (details, callback) => {
                        console.log('[Popup] chrome.browserAction.getBadgeBackgroundColor:', details);
                        if (callback) setTimeout(() => callback({}), 0);
                    }
                },

                action: {
                    setPopup: (details) => {
                        console.log('[Popup] chrome.action.setPopup:', details);
                        return chromeAPI.browserAction.setPopup(details);
                    },

                    setIcon: (details, callback) => {
                        console.log('[Popup] chrome.action.setIcon:', details);
                        return chromeAPI.browserAction.setIcon(details, callback);
                    },

                    setTitle: (details, callback) => {
                        console.log('[Popup] chrome.action.setTitle:', details);
                        return chromeAPI.browserAction.setTitle(details, callback);
                    },

                    setBadgeText: (details, callback) => {
                        console.log('[Popup] chrome.action.setBadgeText:', details);
                        return chromeAPI.browserAction.setBadgeText(details, callback);
                    },

                    setBadgeBackgroundColor: (details, callback) => {
                        console.log('[Popup] chrome.action.setBadgeBackgroundColor:', details);
                        return chromeAPI.browserAction.setBadgeBackgroundColor(details, callback);
                    },

                    enable: (tabId, callback) => {
                        console.log('[Popup] chrome.action.enable:', tabId);
                        return chromeAPI.browserAction.enable(tabId, callback);
                    },

                    disable: (tabId, callback) => {
                        console.log('[Popup] chrome.action.disable:', tabId);
                        return chromeAPI.browserAction.disable(tabId, callback);
                    },

                    getPopup: (details, callback) => {
                        console.log('[Popup] chrome.action.getPopup:', details);
                        return chromeAPI.browserAction.getPopup(details, callback);
                    },

                    getTitle: (details, callback) => {
                        console.log('[Popup] chrome.action.getTitle:', details);
                        return chromeAPI.browserAction.getTitle(details, callback);
                    },

                    getBadgeText: (details, callback) => {
                        console.log('[Popup] chrome.action.getBadgeText:', details);
                        return chromeAPI.browserAction.getBadgeText(details, callback);
                    },

                    getBadgeBackgroundColor: (details, callback) => {
                        console.log('[Popup] chrome.action.getBadgeBackgroundColor:', details);
                        return chromeAPI.browserAction.getBadgeBackgroundColor(details, callback);
                    },

                    onClicked: {
                        addListener: (callback) => {
                            console.log('[Popup] chrome.action.onClicked.addListener');
                            // Эмулируем клик по иконке расширения
                            const icon = document.querySelector('[data-extension-id="' + extId + '"]');
                            if (icon) {
                                icon.addEventListener('click', (e) => {
                                    callback({ id: Date.now() });
                                });
                            }
                        },
                        removeListener: () => {}
                    }
                },

                storage: {
                    local: {
                        get: (keys, callback) => {
                            console.log('[Popup] chrome.storage.local.get:', keys);
                            if (electronAPI && electronAPI.storage && electronAPI.storage.get) {
                                electronAPI.storage.get(keys, 'local').then(function(result) {
                                    if (callback) callback(result);
                                }).catch(function(error) {
                                    console.error('[Popup] Storage get error:', error);
                                    if (callback) callback({});
                                });
                            } else {
                                if (callback) setTimeout(() => callback({}), 0);
                            }
                        },
                        set: (items, callback) => {
                            console.log('[Popup] chrome.storage.local.set:', items);
                            if (electronAPI && electronAPI.storage && electronAPI.storage.set) {
                                electronAPI.storage.set(items, 'local').then(function() {
                                    if (callback) callback();
                                }).catch(function(error) {
                                    console.error('[Popup] Storage set error:', error);
                                    if (callback) callback();
                                });
                            } else {
                                if (callback) setTimeout(() => callback(), 0);
                            }
                        },
                        remove: (keys, callback) => {
                            console.log('[Popup] chrome.storage.local.remove:', keys);
                            if (electronAPI && electronAPI.storage && electronAPI.storage.remove) {
                                electronAPI.storage.remove(keys, 'local').then(function() {
                                    if (callback) callback();
                                }).catch(function(error) {
                                    console.error('[Popup] Storage remove error:', error);
                                    if (callback) callback();
                                });
                            } else {
                                if (callback) setTimeout(() => callback(), 0);
                            }
                        },
                        clear: (callback) => {
                            console.log('[Popup] chrome.storage.local.clear');
                            if (electronAPI && electronAPI.storage && electronAPI.storage.clear) {
                                electronAPI.storage.clear('local').then(function() {
                                    if (callback) callback();
                                }).catch(function(error) {
                                    console.error('[Popup] Storage clear error:', error);
                                    if (callback) callback();
                                });
                            } else {
                                if (callback) setTimeout(() => callback(), 0);
                            }
                        }
                    },

                    sync: {
                        get: (keys, callback) => {
                            console.log('[Popup] chrome.storage.sync.get:', keys);
                            if (electronAPI && electronAPI.storage && electronAPI.storage.get) {
                                electronAPI.storage.get(keys, 'sync').then(function(result) {
                                    if (callback) callback(result);
                                }).catch(function(error) {
                                    console.error('[Popup] Storage get error:', error);
                                    if (callback) callback({});
                                });
                            } else {
                                if (callback) setTimeout(() => callback({}), 0);
                            }
                        },
                        set: (items, callback) => {
                            console.log('[Popup] chrome.storage.sync.set:', items);
                            if (electronAPI && electronAPI.storage && electronAPI.storage.set) {
                                electronAPI.storage.set(items, 'sync').then(function() {
                                    if (callback) callback();
                                }).catch(function(error) {
                                    console.error('[Popup] Storage set error:', error);
                                    if (callback) callback();
                                });
                            } else {
                                if (callback) setTimeout(() => callback(), 0);
                            }
                        },
                        remove: (keys, callback) => {
                            console.log('[Popup] chrome.storage.sync.remove:', keys);
                            if (electronAPI && electronAPI.storage && electronAPI.storage.remove) {
                                electronAPI.storage.remove(keys, 'sync').then(function() {
                                    if (callback) callback();
                                }).catch(function(error) {
                                    console.error('[Popup] Storage remove error:', error);
                                    if (callback) callback();
                                });
                            } else {
                                if (callback) setTimeout(() => callback(), 0);
                            }
                        },
                        clear: (callback) => {
                            console.log('[Popup] chrome.storage.sync.clear');
                            if (electronAPI && electronAPI.storage && electronAPI.storage.clear) {
                                electronAPI.storage.clear('sync').then(function() {
                                    if (callback) callback();
                                }).catch(function(error) {
                                    console.error('[Popup] Storage clear error:', error);
                                    if (callback) callback();
                                });
                            } else {
                                if (callback) setTimeout(() => callback(), 0);
                            }
                        }
                    },

                    onChanged: {
                        addListener: (callback) => {
                            console.log('[Popup] chrome.storage.onChanged.addListener');
                            window.addEventListener('storage-changed', (event) => {
                                if (event.detail && event.detail.extensionId === extId) {
                                    callback(event.detail.changes, event.detail.namespace);
                                }
                            });
                        },
                        removeListener: () => {}
                    }
                },

                tabs: {
                    create: (createProperties, callback) => {
                        console.log('[Popup] chrome.tabs.create:', createProperties);
                        if (createProperties && createProperties.url) {
                            if (electronAPI && electronAPI.createTab) {
                                electronAPI.createTab(createProperties.url);
                            }
                        }
                        if (callback) setTimeout(() => callback({ id: Date.now() }), 0);
                    },
                    query: (queryInfo, callback) => {
                        console.log('[Popup] chrome.tabs.query:', queryInfo);
                        if (callback) setTimeout(() => callback([]), 0);
                    },
                    update: (tabId, updateProperties, callback) => {
                        console.log('[Popup] chrome.tabs.update:', tabId, updateProperties);
                        if (callback) setTimeout(() => callback({}), 0);
                    },
                    onCreated: {
                        addListener: () => {},
         removeListener: () => {}
                    },
                    onUpdated: {
                        addListener: () => {},
         removeListener: () => {}
                    },
                    onRemoved: {
                        addListener: () => {},
         removeListener: () => {}
                    }
                },

                // Дополнительные API которые могут потребоваться расширениям
                windows: {
                    create: (createData, callback) => {
                        console.log('[Popup] chrome.windows.create:', createData);
                        if (callback) setTimeout(() => callback({ id: Date.now(), type: 'normal' }), 0);
                    },
                    getCurrent: (callback) => {
                        console.log('[Popup] chrome.windows.getCurrent');
                        if (callback) setTimeout(() => callback({ id: Date.now(), type: 'normal' }), 0);
                    },
                    update: (windowId, updateInfo, callback) => {
                        console.log('[Popup] chrome.windows.update:', windowId, updateInfo);
                        if (callback) setTimeout(() => callback({}), 0);
                    }
                },

                notifications: {
                    create: (notificationId, options, callback) => {
                        console.log('[Popup] chrome.notifications.create:', notificationId, options);
                        if (callback) setTimeout(() => callback(notificationId || 'notification_' + Date.now()), 0);
                    },
                    clear: (notificationId, callback) => {
                        console.log('[Popup] chrome.notifications.clear:', notificationId);
                        if (callback) setTimeout(() => callback(true), 0);
                    },
                    getAll: (callback) => {
                        console.log('[Popup] chrome.notifications.getAll');
                        if (callback) setTimeout(() => callback({}), 0);
                    }
                },

                commands: {
                    getAll: (callback) => {
                        console.log('[Popup] chrome.commands.getAll');
                        if (callback) setTimeout(() => callback([]), 0);
                    },
                    onCommand: {
                        addListener: () => {},
         removeListener: () => {}
                    }
                },

                extension: {
                    getURL: (path) => {
                        return chromeAPI.runtime.getURL(path);
                    },
                    getViews: (fetchProperties) => {
                        console.log('[Popup] chrome.extension.getViews:', fetchProperties);
                        return [];
                    },
                    getBackgroundPage: () => {
                        console.log('[Popup] chrome.extension.getBackgroundPage');
                        return null;
                    }
                }
            };

            // Устанавливаем глобально
            window.chrome = chromeAPI;
            window.browser = chromeAPI;

            console.log('[Popup] Полный Chrome API инициализирован для ' + extId);

            // Функция для исправления всех путей к ресурсам
            function fixAllResourcePaths() {
                // Исправляем ссылки
                document.querySelectorAll('link[href]').forEach(link => {
                    const href = link.getAttribute('href');
                    if (href && !href.match(/^(https?|data|blob|file):/)) {
                        link.setAttribute('href', chrome.runtime.getURL(href));
                    }
                });

                // Исправляем скрипты
                document.querySelectorAll('script[src]').forEach(script => {
                    const src = script.getAttribute('src');
                    if (src && !src.match(/^(https?|data|blob|file):/)) {
                        script.setAttribute('src', chrome.runtime.getURL(src));
                    }
                });

                // Исправляем изображения
                document.querySelectorAll('img[src]').forEach(img => {
                    const src = img.getAttribute('src');
                    if (src && !src.match(/^(https?|data|blob|file):/)) {
                        img.setAttribute('src', chrome.runtime.getURL(src));
                    }
                });

                // Исправляем CSS url() в стилях
                document.querySelectorAll('style').forEach(style => {
                    const css = style.textContent;
                    const fixedCSS = css.replace(/url\\(["']?([^"')]+)["']?\\)/gi, (match, url) => {
                        if (url.match(/^(https?|data|blob|file):/)) {
                            return match;
                        }
                        return 'url("' + chrome.runtime.getURL(url.trim()) + '")';
                    });
                style.textContent = fixedCSS;
                });

        // Исправляем inline стили
        document.querySelectorAll('[style]').forEach(element => {
            const style = element.getAttribute('style');
            const fixedStyle = style.replace(/url\\(["']?([^"')]+)["']?\\)/gi, (match, url) => {
                if (url.match(/^(https?|data|blob|file):/)) {
                    return match;
                }
                return 'url("' + chrome.runtime.getURL(url.trim()) + '")';
            });
        element.setAttribute('style', fixedStyle);
        });

        // Исправляем background в CSS
        const styleSheets = document.styleSheets;
        for (let i = 0; i < styleSheets.length; i++) {
            try {
                const rules = styleSheets[i].cssRules;
                for (let j = 0; j < rules.length; j++) {
                    if (rules[j].style && rules[j].style.backgroundImage) {
                        const bg = rules[j].style.backgroundImage;
                        const fixedBg = bg.replace(/url\\(["']?([^"')]+)["']?\\)/gi, (match, url) => {
                            if (url.match(/^(https?|data|blob|file):/)) {
                                return match;
                            }
                            return 'url("' + chrome.runtime.getURL(url.trim()) + '")';
                        });
                        rules[j].style.backgroundImage = fixedBg;
                    }
                }
            } catch (e) {
                // Игнорируем ошибки доступа к CSS правилам
            }
        }
            }

            // Функция для загрузки и выполнения внешних скриптов
            function loadExternalScripts() {
                document.querySelectorAll('script[src]').forEach(script => {
                    const src = script.getAttribute('src');
                    if (src && !src.match(/^(https?|data|blob|file):/)) {
                        const fixedSrc = chrome.runtime.getURL(src);
                        const newScript = document.createElement('script');
                        newScript.src = fixedSrc;
                        newScript.onload = () => {
                            console.log('[Popup] Script loaded:', fixedSrc);
                        };
                        newScript.onerror = (e) => {
                            console.error('[Popup] Error loading script:', fixedSrc, e);
                        };
                        script.parentNode.replaceChild(newScript, script);
                    }
                });
            }

            // Функция для загрузки внешних стилей
            function loadExternalStyles() {
                document.querySelectorAll('link[rel="stylesheet"][href]').forEach(link => {
                    const href = link.getAttribute('href');
                    if (href && !href.match(/^(https?|data|blob|file):/)) {
                        const fixedHref = chrome.runtime.getURL(href);
                        link.setAttribute('href', fixedHref);
                    }
                });
            }

            // Запускаем после загрузки DOM
            document.addEventListener('DOMContentLoaded', () => {
                console.log('[Popup] DOM loaded for ' + extId);

                // Исправляем пути
                setTimeout(() => {
                    fixAllResourcePaths();
                    loadExternalScripts();
                    loadExternalStyles();
                }, 100);

                // Загружаем состояние расширения из хранилища
                chrome.storage.local.get(['enabled', 'settings'], function(result) {
                    if (result.enabled !== undefined) {
                        console.log('[Popup] Extension enabled state loaded:', result.enabled);
                    }
                });

                // Заменяем __MSG_name__ и другие локализации
                const replaceLocalizations = () => {
                    document.querySelectorAll('*').forEach(element => {
                        if (element.textContent && element.textContent.includes('__MSG_')) {
                            element.textContent = element.textContent.replace(/__MSG_(\\w+)__/g, (match, key) => {
                                return chrome.i18n.getMessage(key) || match;
                            });
                        }
                        if (element.innerHTML && element.innerHTML.includes('__MSG_')) {
                            element.innerHTML = element.innerHTML.replace(/__MSG_(\\w+)__/g, (match, key) => {
                                return chrome.i18n.getMessage(key) || match;
                            });
                        }
                    });
                };

                setTimeout(replaceLocalizations, 200);
            });

            // Также исправляем после полной загрузки
            window.addEventListener('load', () => {
                setTimeout(() => {
                    fixAllResourcePaths();
                    loadExternalScripts();
                    loadExternalStyles();
                }, 500);
            });

            // Обработка ошибок загрузки ресурсов
            window.addEventListener('error', (e) => {
                if (e.target && (e.target.tagName === 'IMG' || e.target.tagName === 'LINK' || e.target.tagName === 'SCRIPT')) {
                    console.error('[Popup] Resource load error:', e.target.src || e.target.href, e.message);

                    // Пытаемся исправить путь если это относительный путь
                    const src = e.target.src || e.target.href;
                    if (src && !src.match(/^(https?|data|blob|file):/)) {
                        const fixedSrc = chrome.runtime.getURL(src);
                        console.log('[Popup] Trying to fix path:', src, '->', fixedSrc);

                        if (e.target.tagName === 'IMG') {
                            e.target.src = fixedSrc;
                        } else if (e.target.tagName === 'LINK') {
                            e.target.href = fixedSrc;
                        } else if (e.target.tagName === 'SCRIPT') {
                            const newScript = document.createElement('script');
                            newScript.src = fixedSrc;
                            e.target.parentNode.replaceChild(newScript, e.target);
                        }
                    }
                }
            }, true);
        })();
        </script>
        `;

        if (htmlContent.includes('</head>')) {
            return htmlContent.replace('</head>', `${injectionScript}</head>`);
        } else if (htmlContent.includes('<head>')) {
            return htmlContent.replace('<head>', `<head>${injectionScript}`);
        } else if (htmlContent.includes('<body>')) {
            return htmlContent.replace('<body>', `${injectionScript}<body>`);
        } else {
            return `${injectionScript}${htmlContent}`;
        }
    }

    fixResourcePaths(html, extensionPath) {
        if (!extensionPath) return html;

        const normalizedPath = extensionPath.replace(/\\/g, '/');

        const fixPath = (relativePath) => {
            if (!relativePath) return relativePath;

            if (relativePath.startsWith('http://') ||
                relativePath.startsWith('https://') ||
                relativePath.startsWith('data:') ||
                relativePath.startsWith('blob:') ||
                relativePath.startsWith('file://') ||
                relativePath.startsWith('chrome-extension://')) {
                return relativePath;
                }

                let cleanedPath = relativePath;

            if (cleanedPath.startsWith('./')) {
                cleanedPath = cleanedPath.substring(2);
            } else if (cleanedPath.startsWith('../')) {
                cleanedPath = cleanedPath.substring(3);
            }

            if (cleanedPath.startsWith('/')) {
                cleanedPath = cleanedPath.substring(1);
            }

            return `file://${normalizedPath}/${cleanedPath}`;
        };

        let fixedHTML = html;

        fixedHTML = fixedHTML.replace(/<link([^>]*?)href=["']([^"']+)["']([^>]*?)>/gi, (match, before, href, after) => {
            const fixedHref = fixPath(href);
            return `<link${before}href="${fixedHref}"${after}>`;
        });

        fixedHTML = fixedHTML.replace(/<script([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (match, before, src, after) => {
            const fixedSrc = fixPath(src);
            return `<script${before}src="${fixedSrc}"${after}>`;
        });

        fixedHTML = fixedHTML.replace(/<img([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (match, before, src, after) => {
            const fixedSrc = fixPath(src);
            return `<img${before}src="${fixedSrc}"${after}>`;
        });

        fixedHTML = fixedHTML.replace(/url\(["']?([^"')]+)["']?\)/gi, (match, url) => {
            const trimmedUrl = url.trim();
            const fixedUrl = fixPath(trimmedUrl);
            return `url("${fixedUrl}")`;
        });

        fixedHTML = fixedHTML.replace(/style=["']([^"']+)["']/gi, (match, style) => {
            const fixedStyle = style.replace(/url\(["']?([^"')]+)["']?\)/gi, (styleMatch, url) => {
                const trimmedUrl = url.trim();
                const fixedUrl = fixPath(trimmedUrl);
                return `url("${fixedUrl}")`;
            });
        return `style="${fixedStyle}"`;
        });

        return fixedHTML;
    }

    closeExtensionPopup(extensionId) {
        const extension = this.extensions.get(extensionId);
        if (extension) {
            console.log(`❌ Закрытие popup для расширения: ${extensionId}`);
            this.activePopups.delete(extensionId);
            return true;
        }
        return false;
    }

    getAllExtensions() {
        const extensions = [];
        this.extensions.forEach((extension, id) => {
            extensions.push({
                id,
                name: extension.name,
                version: extension.version,
                description: extension.description,
                enabled: extension.enabled,
                icons: extension.icons,
                browserAction: extension.browserAction,
                hasPopup: extension.hasPopup,
                manifest: extension.manifest,
                path: extension.path,
                locales: extension.locales,
                isSystem: extension.isSystem,
                permissions: extension.permissions,
                contentScripts: extension.contentScripts,
                author: extension.author,
                homepage: extension.homepage
            });
        });
        return extensions;
    }

    toggleExtension(extensionId, enabled) {
        const extension = this.extensions.get(extensionId);
        if (extension) {
            const oldState = extension.enabled;
            extension.enabled = enabled;

            // Сохраняем состояние в файл настроек
            const settingsPath = path.join(app.getPath('userData'), 'extensions_settings', `${extensionId}.json`);
            const settings = {
                enabled: enabled,
                lastModified: new Date().toISOString()
            };

            try {
                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
                console.log(`💾 Extension ${extensionId} state saved: ${enabled ? 'enabled' : 'disabled'}`);
            } catch (error) {
                console.error(`Error saving extension state for ${extensionId}:`, error);
            }

            if (!enabled) {
                this.closeExtensionPopup(extensionId);
            } else if (oldState !== enabled && extension.background) {
                // Если расширение было включено и есть background скрипты, перезапускаем их
                this.loadBackgroundScripts(extension);
            }

            console.log(`🔘 Extension ${extensionId} ${enabled ? 'enabled' : 'disabled'}`);
            return true;
        }
        return false;
    }

    removeExtension(extensionId) {
        const extension = this.extensions.get(extensionId);
        if (!extension) return false;

        if (extension.isSystem) {
            console.log(`⛔ Cannot remove system extension: ${extensionId}`);
            return false;
        }

        this.closeExtensionPopup(extensionId);

        this.extensions.delete(extensionId);

        try {
            // Удаляем файлы расширения
            fs.rmSync(extension.path, { recursive: true, force: true });
            console.log(`🗑️ Extension files removed: ${extension.path}`);

            // Удаляем настройки расширения
            const settingsPath = path.join(app.getPath('userData'), 'extensions_settings', `${extensionId}.json`);
            if (fs.existsSync(settingsPath)) {
                fs.unlinkSync(settingsPath);
                console.log(`🗑️ Extension settings removed: ${settingsPath}`);
            }

            // Удаляем хранилище расширения (electron-store)
            try {
                // Для electron-store 8.2 файлы хранятся в разных местах
                const userDataPath = app.getPath('userData');

                // Пути для electron-store файлов
                const storePaths = [
                    path.join(userDataPath, 'config', `${extensionId}_local.json`),
                    path.join(userDataPath, 'config', `${extensionId}_sync.json`),
                    path.join(userDataPath, `${extensionId}_local.json`),
                    path.join(userDataPath, `${extensionId}_sync.json`)
                ];

                storePaths.forEach(storePath => {
                    if (fs.existsSync(storePath)) {
                        fs.unlinkSync(storePath);
                        console.log(`🗑️ Extension store removed: ${storePath}`);
                    }
                });
            } catch (error) {
                console.error(`Error removing extension storage for ${extensionId}:`, error);
            }

            // Удаляем данные из универсального хранилища
            const filesDir = path.join(this.EXTENSIONS_DATA_PATH, extensionId);

            if (fs.existsSync(filesDir)) {
                fs.rmSync(filesDir, { recursive: true, force: true });
                console.log(`🗑️ Extension universal storage removed: ${filesDir}`);
            }

            // Удаляем все файлы данных расширения
            const dataFiles = fs.readdirSync(this.EXTENSIONS_DATA_PATH).filter(file =>
            file.startsWith(`${extensionId}_`)
            );

            dataFiles.forEach(file => {
                fs.unlinkSync(path.join(this.EXTENSIONS_DATA_PATH, file));
                console.log(`🗑️ Extension data file removed: ${file}`);
            });

            // Очищаем content scripts
            this.contentScripts.forEach((scripts, pattern) => {
                const filtered = scripts.filter(s => s.extensionId !== extensionId);
                if (filtered.length === 0) {
                    this.contentScripts.delete(pattern);
                } else {
                    this.contentScripts.set(pattern, filtered);
                }
            });

            return true;
        } catch (error) {
            console.error('Error removing extension files:', error);
            return false;
        }
    }

    async installExtension(xpiPath) {
        try {
            console.log(`📦 Installing extension from: ${xpiPath}`);

            const tempDir = path.join(app.getPath('userData'), 'temp_extensions', `temp_${Date.now()}`);
            fs.mkdirSync(tempDir, { recursive: true });

            const zip = new AdmZip(xpiPath);
            zip.extractAllTo(tempDir, true);
            console.log(`📂 Extracted to: ${tempDir}`);

            const findManifest = (dir) => {
                const items = fs.readdirSync(dir);
                for (const item of items) {
                    const fullPath = path.join(dir, item);
                    const stat = fs.statSync(fullPath);
                    if (stat.isDirectory()) {
                        const found = findManifest(fullPath);
                        if (found) return found;
                    } else if (item.toLowerCase() === 'manifest.json') {
                        return fullPath;
                    }
                }
                return null;
            };

            const manifestPath = findManifest(tempDir);
            if (!manifestPath) {
                throw new Error('manifest.json not found in extension archive');
            }

            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            const manifestDir = path.dirname(manifestPath);

            console.log(`📋 Manifest found: ${manifest.name} v${manifest.version}`);

            if (manifest.manifest_version === 3) {
                console.log('🔄 Converting Manifest V3 to V2 for compatibility...');
                manifest.manifest_version = 2;
                fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
                console.log('✅ Manifest converted to V2');
            }

            const extensionId = this.generateExtensionId(manifest, false);
            const finalPath = path.join(this.EXTENSIONS_PATH, extensionId);

            if (fs.existsSync(finalPath)) {
                console.log(`🗑️ Removing old version: ${finalPath}`);
                fs.rmSync(finalPath, { recursive: true, force: true });
            }

            console.log(`📂 Copying from ${manifestDir} to ${finalPath}`);
            this.copyRecursiveSync(manifestDir, finalPath);

            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }

            await this.registerExtension(finalPath, manifest, false);

            return {
                success: true,
                extensionId: extensionId,
                manifest: manifest,
                message: `Extension "${manifest.name}" v${manifest.version} installed successfully`
            };

        } catch (error) {
            console.error('Extension installation failed:', error);

            try {
                const tempDir = path.join(app.getPath('userData'), 'temp_extensions');
                if (fs.existsSync(tempDir)) {
                    const tempItems = fs.readdirSync(tempDir);
                    for (const item of tempItems) {
                        if (item.startsWith('temp_')) {
                            const itemPath = path.join(tempDir, item);
                            fs.rmSync(itemPath, { recursive: true, force: true });
                        }
                    }
                }
            } catch (cleanupError) {
                console.error('Failed to clean up temporary files:', cleanupError);
            }

            return {
                success: false,
                message: `Installation failed: ${error.message}`
            };
        }
    }

    copyRecursiveSync(src, dest) {
        const exists = fs.existsSync(src);
        const stats = exists && fs.statSync(src);
        const isDirectory = exists && stats.isDirectory();

        if (isDirectory) {
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
            }
            fs.readdirSync(src).forEach(childItemName => {
                this.copyRecursiveSync(
                    path.join(src, childItemName),
                                       path.join(dest, childItemName)
                );
            });
        } else {
            fs.copyFileSync(src, dest);
        }
    }

    injectContentScripts(webContents, url) {
        this.contentScripts.forEach((scripts, pattern) => {
            if (this.matchesPattern(url, pattern)) {
                console.log(`🔌 Injecting content scripts for pattern: ${pattern} into URL: ${url}`);
                scripts.forEach(script => {
                    if (script.extensionId && this.extensions.get(script.extensionId)?.enabled) {
                        const injectScript = () => {
                            webContents.executeJavaScript(script.content)
                            .then(() => {
                                console.log(`✅ Content script injected for ${script.extensionId} into ${url}`);
                            })
                            .catch(err => {
                                console.error('Error injecting content script:', err);
                            });
                        };

                        switch (script.runAt) {
                            case 'document_start':
                                injectScript();
                                break;
                            case 'document_end':
                                setTimeout(injectScript, 0);
                                break;
                            case 'document_idle':
                            default:
                                setTimeout(injectScript, 200);
                        }
                    }
                });
            }
        });
    }

    matchesPattern(url, pattern) {
        if (pattern === '<all_urls>') return true;

        try {
            const regexPattern = pattern
            .replace(/\*/g, '.*')
            .replace(/\./g, '\\.');
            const regex = new RegExp('^' + regexPattern + '$');
            return regex.test(url);
        } catch (e) {
            console.error(`Invalid pattern: ${pattern}`, e);
            return false;
        }
    }

    getExtension(extensionId) {
        return this.extensions.get(extensionId);
    }

    getBrowserActions() {
        const actions = [];
        this.extensions.forEach((extension, id) => {
            if (extension.enabled && extension.browserAction && Object.keys(extension.browserAction).length > 0) {
                // Убеждаемся, что есть title (берём из default_title или name)
                const title = extension.browserAction.default_title || extension.name;
                // Убеждаемся, что иконки есть (если пусто, используем дефолтную)
                let icons = extension.icons;
                if (!icons || Object.keys(icons).length === 0) {
                    icons = { '32': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%230a84ff"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>' };
                }

                actions.push({
                    id,
                    name: extension.name,
                    icons: icons,
                    hasPopup: extension.hasPopup,
                    title: title,
                    enabled: extension.enabled
                });
            }
        });
        return actions;
    }

    // =============== ФУНКЦИИ ДЛЯ РАБОТЫ С ХРАНИЛИЩЕМ РАСШИРЕНИЙ ===============

    getExtensionStorage(extensionId, namespace = 'local') {
        try {
            const store = new Store({
                name: `${extensionId}_${namespace}`,
                defaults: {},
                    clearInvalidConfig: true,
                    watch: false,
                    // Для electron-store 8.2 может потребоваться указать путь
                    cwd: app.getPath('userData')
            });

            // В electron-store 8.2 store это объект, а не функция
            const data = store.store || {};
            console.log(`📊 Got storage for ${extensionId}_${namespace}:`, Object.keys(data).length, 'keys');
            return data;
        } catch (error) {
            console.error(`Error getting storage for ${extensionId}:`, error);
            return {};
        }
    }

    saveExtensionStorage(extensionId, namespace = 'local', data) {
        try {
            const store = new Store({
                name: `${extensionId}_${namespace}`,
                defaults: {},
                    clearInvalidConfig: true,
                    watch: false,
                    cwd: app.getPath('userData')
            });

            // Сохраняем все данные
            store.store = data;

            // Явно сохраняем
            store.save();

            console.log(`💾 Saved storage for ${extensionId}_${namespace}:`, Object.keys(data).length, 'keys');
            return true;
        } catch (error) {
            console.error(`Error saving storage for ${extensionId}:`, error);
            return false;
        }
    }

    getStorageData(extensionId, keys, namespace = 'local') {
        try {
            const store = new Store({
                name: `${extensionId}_${namespace}`,
                defaults: {},
                    clearInvalidConfig: true,
                    watch: false,
                    cwd: app.getPath('userData')
            });

            const storage = store.store || {};
            let result = {};

            if (keys === null || keys === undefined) {
                // Возвращаем всё
                result = { ...storage };
            } else if (Array.isArray(keys)) {
                // Возвращаем указанные ключи
                keys.forEach(key => {
                    if (storage.hasOwnProperty(key)) {
                        result[key] = storage[key];
                    }
                });
            } else if (typeof keys === 'string') {
                // Возвращаем один ключ
                if (storage.hasOwnProperty(keys)) {
                    result[keys] = storage[keys];
                }
            } else if (typeof keys === 'object') {
                // Возвращаем с дефолтными значениями
                Object.keys(keys).forEach(key => {
                    if (storage.hasOwnProperty(key)) {
                        result[key] = storage[key];
                    } else {
                        result[key] = keys[key];
                    }
                });
            }

            console.log(`📊 Storage get for ${extensionId} (${namespace}):`, keys, '->', Object.keys(result).length, 'items');
            return result;
        } catch (error) {
            console.error(`Error in getStorageData for ${extensionId}:`, error);
            return {};
        }
    }

    setStorageData(extensionId, items, namespace = 'local') {
        try {
            const store = new Store({
                name: `${extensionId}_${namespace}`,
                defaults: {},
                    clearInvalidConfig: true,
                    watch: false,
                    cwd: app.getPath('userData')
            });

            const storage = store.store || {};
            const changes = {};

            Object.keys(items).forEach(key => {
                const oldValue = storage[key];
                const newValue = items[key];

                // Сравниваем значения
                const oldStr = JSON.stringify(oldValue);
                const newStr = JSON.stringify(newValue);

                if (oldStr !== newStr) {
                    changes[key] = {
                        oldValue: oldValue,
                        newValue: newValue
                    };
                    storage[key] = newValue;
                }
            });

            if (Object.keys(changes).length > 0) {
                // Сохраняем изменения
                store.store = storage;
                store.save();

                console.log(`💾 Storage set for ${extensionId} (${namespace}):`, Object.keys(items).length, 'items changed');

                // Уведомляем об изменениях
                this.notifyStorageChange(extensionId, namespace, changes);
            }

            return changes;
        } catch (error) {
            console.error(`Error in setStorageData for ${extensionId}:`, error);
            return {};
        }
    }

    removeStorageData(extensionId, keys, namespace = 'local') {
        try {
            const store = new Store({
                name: `${extensionId}_${namespace}`,
                defaults: {},
                    clearInvalidConfig: true,
                    watch: false,
                    cwd: app.getPath('userData')
            });

            const storage = store.store || {};
            const changes = {};
            const keyArray = Array.isArray(keys) ? keys : [keys];

            keyArray.forEach(key => {
                if (storage.hasOwnProperty(key)) {
                    changes[key] = { oldValue: storage[key], newValue: undefined };
                    delete storage[key];
                }
            });

            if (Object.keys(changes).length > 0) {
                store.store = storage;
                store.save();

                console.log(`🗑️ Storage remove for ${extensionId} (${namespace}):`, keyArray.length, 'keys');

                this.notifyStorageChange(extensionId, namespace, changes);
            }

            return changes;
        } catch (error) {
            console.error(`Error in removeStorageData for ${extensionId}:`, error);
            return {};
        }
    }

    clearStorageData(extensionId, namespace = 'local') {
        try {
            const store = new Store({
                name: `${extensionId}_${namespace}`,
                defaults: {},
                    clearInvalidConfig: true,
                    watch: false,
                    cwd: app.getPath('userData')
            });

            const storage = store.store || {};
            const changes = {};

            Object.keys(storage).forEach(key => {
                changes[key] = { oldValue: storage[key], newValue: undefined };
            });

            if (Object.keys(storage).length > 0) {
                // Очищаем хранилище
                store.clear();

                console.log(`🗑️ Storage clear for ${extensionId} (${namespace}):`, Object.keys(storage).length, 'keys cleared');

                this.notifyStorageChange(extensionId, namespace, changes);
            }

            return changes;
        } catch (error) {
            console.error(`Error in clearStorageData for ${extensionId}:`, error);
            return {};
        }
    }

    notifyStorageChange(extensionId, namespace, changes) {
        // Создаем событие для окон расширений
        const eventData = {
            extensionId,
            namespace,
            changes
        };

        // Отправляем событие в main окно
        const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
        if (mainWindow) {
            mainWindow.webContents.send('extension-storage-changed', eventData);
        }
    }

    /**
     * Отправляет событие обновления расширений в renderer
     */
    sendExtensionsUpdated() {
        const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
        if (mainWindow) {
            mainWindow.webContents.send('extensions-updated', {
                count: this.extensions.size,
                timestamp: Date.now()
            });
            console.log('📤 Sent extensions-updated event to renderer');
        }
    }

    /**
     * Отправляет событие изменения состояния расширения
     */
    sendExtensionStateChanged(extensionId, enabled) {
        const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
        if (mainWindow) {
            mainWindow.webContents.send('extension-state-changed', {
                extensionId,
                enabled,
                timestamp: Date.now()
            });
            console.log(`📤 Sent extension-state-changed event for ${extensionId}`);
        }
    }
}

module.exports = WebExtensionsAPI;
