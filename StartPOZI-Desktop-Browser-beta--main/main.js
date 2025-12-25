// main.js — ИСПРАВЛЕННЫЙ КОД для работы с popup.html и перезапуском
const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

// Импортируем WebExtensionsAPI
const WebExtensionsAPI = require('./webextensions.js');
const webext = new WebExtensionsAPI();

let win;
let downloadsWin = null;
let downloadPath = app.getPath('downloads');
let activeDownloadItems = new Map();

// УСТАНАВЛИВАЕМ ПУТЬ К ПОЛЬЗОВАТЕЛЬСКИМ ДАННЫМ
const userDataPath = path.join(app.getPath('appData'), 'startpozi-browser');
app.setPath('userData', userDataPath);

// Папка для плагинов (расширений Firefox) - теперь в userData
const PLUGINS_PATH = path.join(app.getPath('userData'), 'plugins');
const PLUGIN_SETTINGS_PATH = path.join(app.getPath('userData'), 'plugin_settings');

// Убедимся, что папки существуют
[userDataPath, PLUGINS_PATH, PLUGIN_SETTINGS_PATH].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

console.log('User data path:', app.getPath('userData'));
console.log('Plugins path:', PLUGINS_PATH);

// Отключаем некоторые функции безопасности для совместимости
app.commandLine.appendSwitch('disable-features', 'CrossOriginOpenerPolicy');
app.commandLine.appendSwitch('disable-site-isolation-trials');

// Функция для загрузки расширений Firefox
async function loadExtensions() {
    console.log('Начинаем загрузку расширений...');

    const extensionsPath = path.join(__dirname, 'extensions');
    const pluginsPath = PLUGINS_PATH;

    // Загружаем стандартные расширения
    if (fs.existsSync(extensionsPath)) {
        console.log(`Папка стандартных расширений: ${extensionsPath}`);
        const folders = fs.readdirSync(extensionsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .filter(f => !f.startsWith('.'));

        console.log(`Найдено стандартных расширений: ${folders.length}`);

        for (const folder of folders) {
            const extensionPath = path.join(extensionsPath, folder);
            try {
                const manifestPath = path.join(extensionPath, 'manifest.json');
                if (fs.existsSync(manifestPath)) {
                    console.log(`Пытаемся загрузить расширение: ${folder} из ${extensionPath}`);

                    // Регистрируем расширение в WebExtensionsAPI
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                    webext.registerExtension(extensionPath, manifest);
                    console.log(`✓ Расширение зарегистрировано в WebExtensionsAPI: ${manifest.name || folder}`);

                    // Загружаем расширение в Electron
                    try {
                        await session.defaultSession.loadExtension(extensionPath, {
                            allowFileAccess: true,
                            enableRemoteModule: false
                        });
                        console.log(`✓ Стандартное расширение загружено: ${folder}`);
                    } catch (loadError) {
                        console.error(`✗ Ошибка загрузки расширения ${folder} в Electron:`, loadError.message);
                    }
                } else {
                    console.log(`✗ В папке ${folder} нет manifest.json, пропускаем`);
                }
            } catch (e) {
                console.error(`✗ Ошибка загрузки расширения ${folder}:`, e.message);
            }
        }
    } else {
        console.log(`Папка стандартных расширений не существует: ${extensionsPath}`);
    }

    // Загружаем пользовательские плагины
    if (fs.existsSync(pluginsPath)) {
        console.log(`Папка пользовательских плагинов: ${pluginsPath}`);
        const plugins = fs.readdirSync(pluginsPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name)
        .filter(f => !f.startsWith('.') && !f.startsWith('temp_'));

        console.log(`Найдено пользовательских плагинов: ${plugins.length}`);

        for (const plugin of plugins) {
            const pluginPath = path.join(pluginsPath, plugin);
            const manifestPath = path.join(pluginPath, 'manifest.json');

            if (fs.existsSync(manifestPath)) {
                try {
                    // Проверяем, включен ли плагин
                    const settingsPath = path.join(PLUGIN_SETTINGS_PATH, `${plugin}.json`);
                    let enabled = true;

                    if (fs.existsSync(settingsPath)) {
                        try {
                            const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                            enabled = settings.enabled !== false;
                        } catch (e) {
                            console.error(`Ошибка чтения настроек для ${plugin}:`, e.message);
                        }
                    }

                    if (enabled) {
                        console.log(`Пытаемся загрузить плагин: ${plugin} из ${pluginPath}`);

                        // Регистрируем плагин в WebExtensionsAPI
                        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                        webext.registerExtension(pluginPath, manifest);
                        console.log(`✓ Плагин зарегистрирован в WebExtensionsAPI: ${manifest.name || plugin}`);

                        // Загружаем плагин
                        try {
                            await session.defaultSession.loadExtension(pluginPath, {
                                allowFileAccess: true,
                                enableRemoteModule: false
                            });
                            console.log(`✓ Плагин загружен: ${plugin}`);
                        } catch (loadError) {
                            console.error(`Ошибка загрузки плагина ${plugin}:`, loadError.message);
                        }
                    } else {
                        console.log(`✗ Плагин отключен: ${plugin}`);
                    }
                } catch (e) {
                    console.error(`✗ Ошибка загрузки плагина ${plugin}:`, e.message);
                }
            } else {
                console.log(`✗ В папке ${plugin} нет manifest.json, пропускаем`);
            }
        }
    } else {
        console.log(`Папка пользовательских плагинов не существует: ${pluginsPath}`);
    }

    console.log('Загрузка расширений завершена');
    console.log(`Всего зарегистрировано расширений: ${webext.extensions.size}`);
}

// Функция для получения информации о popup расширения с ВСТРОЕННЫМИ ресурсами и УДАЛЕНИЕМ ОРИГИНАЛЬНЫХ ТЕГОВ
async function getExtensionPopupInfo(pluginId) {
    console.log('🔍 === getExtensionPopupInfo START ===');
    console.log(`📌 Plugin ID: ${pluginId}`);

    try {
        // 1. Определяем пути
        let extensionPath;
        let extensionType;

        if (pluginId.startsWith('ext_')) {
            // Системное расширение
            const extId = pluginId.substring(4);
            extensionPath = path.join(__dirname, 'extensions', extId);
            extensionType = 'system';
        } else {
            // Пользовательский плагин
            extensionPath = path.join(PLUGINS_PATH, pluginId);
            extensionType = 'user';
        }

        console.log(`🔍 Extension path: ${extensionPath}`);
        console.log(`🔍 Extension type: ${extensionType}`);

        if (!fs.existsSync(extensionPath)) {
            console.log(`❌ Папка расширения не найдена: ${extensionPath}`);
            return { success: false, message: 'Папка расширения не найдена' };
        }

        const manifestPath = path.join(extensionPath, 'manifest.json');
        if (!fs.existsSync(manifestPath)) {
            console.log(`❌ Манифест не найден: ${manifestPath}`);
            return { success: false, message: 'Манифест не найден' };
        }

        // 2. Читаем манифест
        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
        let manifest;
        try {
            manifest = JSON.parse(manifestContent);
        } catch (parseError) {
            console.log(`❌ Ошибка парсинга манифеста: ${parseError.message}`);
            return { success: false, message: 'Неверный формат манифеста' };
        }

        console.log(`📋 Manifest name: ${manifest.name}`);
        console.log(`📋 Manifest version: ${manifest.version}`);

        // 3. Проверяем, включен ли плагин
        const settingsPath = path.join(PLUGIN_SETTINGS_PATH, `${pluginId}.json`);
        let enabled = true;
        if (fs.existsSync(settingsPath)) {
            try {
                const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                enabled = settings.enabled !== false;
            } catch (e) {
                console.error(`Ошибка чтения настроек для ${pluginId}:`, e.message);
            }
        }

        console.log(`📊 Plugin enabled: ${enabled}`);

        // 4. Ищем путь к popup-файлу
        console.log(`🔎 Ищем popup в манифесте...`);
        let popupFile = null;

        if (manifest.browser_action && manifest.browser_action.default_popup) {
            popupFile = manifest.browser_action.default_popup;
            console.log(`✅ Найден browser_action.default_popup: ${popupFile}`);
        } else if (manifest.action && manifest.action.default_popup) {
            popupFile = manifest.action.default_popup;
            console.log(`✅ Найден action.default_popup: ${popupFile}`);
        } else {
            console.log(`⚠️ В манифесте не указан popup, ищем стандартные файлы...`);
            const possiblePopupFiles = [
                'popup.html',
                'popup/popup.html',
                'src/popup.html',
                'html/popup.html',
                'ui/popup.html',
                'panel.html',
                'index.html'
            ];

            for (const possibleFile of possiblePopupFiles) {
                const testPath = path.join(extensionPath, possibleFile);
                if (fs.existsSync(testPath) && !fs.statSync(testPath).isDirectory()) {
                    popupFile = possibleFile;
                    console.log(`✅ Найден возможный popup: ${possibleFile}`);
                    break;
                }
            }
        }

        // 5. Проверяем, нашли ли мы файл
        if (!popupFile) {
            console.log(`❌ У расширения ${pluginId} нет меню (popup)`);
            return {
                success: false,
                message: 'Расширение не имеет popup-меню',
                hasPopup: false,
                enabled: enabled
            };
        }

        // 6. Формируем полный путь и проверяем физическое наличие файла
        const popupPath = path.join(extensionPath, popupFile);
        console.log(`📍 Полный путь к меню: ${popupPath}`);

        if (!fs.existsSync(popupPath) || fs.statSync(popupPath).isDirectory()) {
            console.error(`❌ Popup-файл не найден по пути: ${popupPath}`);
            return {
                success: false,
                message: 'Файл popup.html физически отсутствует',
                hasPopup: false,
                enabled: true
            };
        }

        // 7. ЧИТАЕМ СОДЕРЖИМОЕ POPUP И ВСТРАИВАЕМ РЕСУРСЫ
        console.log(`📖 Читаем содержимое popup и встраиваем ресурсы...`);
        let popupContent = fs.readFileSync(popupPath, 'utf8');
        const popupDir = path.dirname(popupPath);

        // 8. Ищем и встраиваем CSS файлы ВНУТРЬ HTML
        console.log(`🎨 Ищем CSS файлы...`);
        const cssFiles = [];
        const possibleCssFiles = [
            path.basename(popupPath, '.html') + '.css',
            'popup.css',
            'style.css',
            'styles.css',
            'css/popup.css',
            'css/style.css',
            'ui/popup.css',
            'ui/style.css'
        ];

        for (const cssFile of possibleCssFiles) {
            const cssPath = path.join(popupDir, cssFile);
            if (fs.existsSync(cssPath)) {
                try {
                    const cssContent = fs.readFileSync(cssPath, 'utf8');
                    // Встраиваем CSS прямо в HTML как inline стили
                    const styleTag = `<style type="text/css">\n${cssContent}\n</style>`;

                    // Ищем head и вставляем туда, если нет - вставляем перед </head> или в начало body
                    if (popupContent.includes('</head>')) {
                        popupContent = popupContent.replace('</head>', `${styleTag}\n</head>`);
                    } else if (popupContent.includes('<head>')) {
                        popupContent = popupContent.replace('<head>', `<head>\n${styleTag}`);
                    } else {
                        // Если нет head, вставляем в начало body
                        popupContent = popupContent.replace('<body', `${styleTag}\n<body`);
                    }

                    cssFiles.push(cssFile);
                    console.log(`✅ Встроен CSS файл: ${cssFile}`);
                } catch (cssError) {
                    console.error(`❌ Ошибка чтения CSS файла ${cssFile}:`, cssError.message);
                }
            }
        }

        // 9. Ищем и встраиваем JS файлы ВНУТРЬ HTML
        console.log(`⚡ Ищем JS файлы...`);
        const jsFiles = [];
        const possibleJsFiles = [
            path.basename(popupPath, '.html') + '.js',
            'popup.js',
            'script.js',
            'scripts.js',
            'js/popup.js',
            'js/script.js',
            'ui/popup.js',
            'ui/script.js'
        ];

        for (const jsFile of possibleJsFiles) {
            const jsPath = path.join(popupDir, jsFile);
            if (fs.existsSync(jsPath)) {
                try {
                    const jsContent = fs.readFileSync(jsPath, 'utf8');
                    // Встраиваем JS прямо в HTML как inline скрипт
                    const scriptTag = `<script type="text/javascript">\n${jsContent}\n</script>`;

                    // Вставляем перед закрывающим </body>
                    if (popupContent.includes('</body>')) {
                        popupContent = popupContent.replace('</body>', `${scriptTag}\n</body>`);
                    } else if (popupContent.includes('</html>')) {
                        popupContent = popupContent.replace('</html>', `${scriptTag}\n</html>`);
                    } else {
                        // Если нет body, добавляем в конец
                        popupContent = popupContent + scriptTag;
                    }

                    jsFiles.push(jsFile);
                    console.log(`✅ Встроен JS файл: ${jsFile}`);
                } catch (jsError) {
                    console.error(`❌ Ошибка чтения JS файла ${jsFile}:`, jsError.message);
                }
            }
        }

        // 10. УДАЛЯЕМ ОРИГИНАЛЬНЫЕ ТЕГИ, чтобы они не пытались загрузиться
        console.log('🧹 Удаляем оригинальные теги script и link...');

        // Удаляем все <script src="..."> (включая содержимое между тегами)
        const scriptSrcRegex = /<script\s+[^>]*src\s*=\s*["'][^"']*["'][^>]*>.*?<\/script>/gis;
        popupContent = popupContent.replace(scriptSrcRegex, '');

        // Удаляем все <link rel="stylesheet" href="...">
        const linkCssRegex = /<link\s+[^>]*rel\s*=\s*["']stylesheet["'][^>]*href\s*=\s*["'][^"']*["'][^>]*>/gi;
        popupContent = popupContent.replace(linkCssRegex, '');

        // Удаляем самозакрывающиеся <script src>
        const scriptSelfClosingRegex = /<script\s+[^>]*src\s*=\s*["'][^"']*["'][^>]*\/>/gi;
        popupContent = popupContent.replace(scriptSelfClosingRegex, '');

        console.log('✅ Оригинальные теги удалены');

        // 11. Также ищем и встраиваем изображения как data URLs
        console.log(`🖼️ Ищем изображения...`);
        // Находим все теги img с относительными путями
        const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/g;
        let match;
        const processedImages = new Set();

        while ((match = imgRegex.exec(popupContent)) !== null) {
            const imgSrc = match[1];
            // Если путь относительный и не начинается с http(s):// или data:
            if (!imgSrc.startsWith('http') && !imgSrc.startsWith('data:') && !imgSrc.startsWith('/')) {
                if (!processedImages.has(imgSrc)) {
                    processedImages.add(imgSrc);
                    const imgPath = path.join(popupDir, imgSrc);
                    if (fs.existsSync(imgPath)) {
                        try {
                            // Читаем изображение как base64
                            const imgBuffer = fs.readFileSync(imgPath);
                            const base64 = imgBuffer.toString('base64');
                            const extension = path.extname(imgPath).toLowerCase().substring(1);
                            const mimeType = extension === 'png' ? 'png' :
                            extension === 'jpg' || extension === 'jpeg' ? 'jpeg' :
                            extension === 'gif' ? 'gif' : 'png';

                            const dataUrl = `data:image/${mimeType};base64,${base64}`;
                            // Заменяем относительный путь на data URL
                            const imgRegexSpecific = new RegExp(`src="${imgSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
                            popupContent = popupContent.replace(imgRegexSpecific, `src="${dataUrl}"`);

                            console.log(`✅ Встроено изображение: ${imgSrc}`);
                        } catch (imgError) {
                            console.error(`❌ Ошибка чтения изображения ${imgSrc}:`, imgError.message);
                        }
                    }
                }
            }
        }

        console.log(`🎬 === getExtensionPopupInfo END ===`);

        return {
            success: true,
            message: 'Информация о popup получена',
            pluginId: pluginId,
            pluginName: manifest.name || 'Безымянное расширение',
            popupContent: popupContent, // Полный HTML с встроенными ресурсами
            popupPath: popupPath,
            popupFile: popupFile,
            popupDir: popupDir,
            extensionPath: extensionPath,
            cssFiles: cssFiles,
            jsFiles: jsFiles,
            manifest: manifest,
            hasPopup: true,
            enabled: enabled, // Добавляем статус плагина
            type: extensionType
        };

    } catch (error) {
        console.error(`💥 Критическая ошибка в getExtensionPopupInfo:`, error);
        return {
            success: false,
            message: `Внутренняя ошибка: ${error.message}`,
            hasPopup: false
        };
    }
}

// Функция для установки плагина из .xpi файла
async function installXpiPlugin(xpiPath) {
    let tempDir;
    try {
        // Создаем временную папку для извлечения
        tempDir = path.join(PLUGINS_PATH, `temp_${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });

        console.log(`Извлекаем XPI: ${xpiPath} в ${tempDir}`);

        // Извлекаем .xpi файл
        const zip = new AdmZip(xpiPath);
        zip.extractAllTo(tempDir, true);

        // Ищем manifest.json
        const findManifest = (dir) => {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    const found = findManifest(fullPath);
                    if (found) return found;
                } else if (item === 'manifest.json') {
                    return fullPath;
                }
            }
            return null;
        };

        const manifestPath = findManifest(tempDir);
        if (!manifestPath) {
            throw new Error('В архиве XPI не найден manifest.json');
        }

        // Читаем манифест
        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestContent);

        // Генерируем уникальное имя для папки плагина
        const pluginName = (manifest.name || 'plugin')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
        .substring(0, 30);

        const pluginId = `${pluginName}_${Date.now()}`;
        const finalPath = path.join(PLUGINS_PATH, pluginId);

        // Если папка уже существует, удаляем ее
        if (fs.existsSync(finalPath)) {
            fs.rmSync(finalPath, { recursive: true, force: true });
        }

        // Перемещаем из временной папки в финальную
        fs.renameSync(tempDir, finalPath);
        tempDir = null; // Помечаем как очищенную

        console.log(`XPI успешно извлечен в: ${finalPath}`);

        // Конвертируем манифест для Electron если нужно
        if (manifest.manifest_version === 3) {
            console.log('Конвертируем manifest v3 в v2 для совместимости...');

            if (manifest.background && manifest.background.service_worker) {
                manifest.background = {
                    scripts: [manifest.background.service_worker],
                    persistent: false
                };
            }

            if (manifest.host_permissions) {
                if (!manifest.permissions) {
                    manifest.permissions = [];
                }
                manifest.permissions = [...manifest.permissions, ...manifest.host_permissions];
                delete manifest.host_permissions;
            }

            manifest.manifest_version = 2;

            const updatedManifestPath = path.join(finalPath, 'manifest.json');
            fs.writeFileSync(updatedManifestPath, JSON.stringify(manifest, null, 2), 'utf8');
        }

        // Создаем настройки плагина
        const settingsPath = path.join(PLUGIN_SETTINGS_PATH, `${pluginId}.json`);
        fs.writeFileSync(settingsPath, JSON.stringify({
            enabled: true,
            installed: new Date().toISOString(),
                                                      source: 'xpi'
        }, null, 2), 'utf8');

        // Регистрируем плагин в WebExtensionsAPI
        webext.registerExtension(finalPath, manifest);
        console.log(`✓ Плагин зарегистрирован в WebExtensionsAPI: ${manifest.name}`);

        // Загружаем плагин
        console.log(`Загружаем плагин: ${finalPath}`);
        await session.defaultSession.loadExtension(finalPath, {
            allowFileAccess: true,
            enableRemoteModule: false
        });

        return {
            success: true,
            message: `Плагин "${manifest.name}" успешно установлен`,
            pluginId,
            manifest
        };
    } catch (error) {
        console.error('Ошибка установки XPI плагина:', error);

        // Удаляем временные файлы при ошибке
        if (tempDir && fs.existsSync(tempDir)) {
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch (e) {
                // Игнорируем ошибки удаления
            }
        }

        throw error;
    }
}

// В функции createWindow или перед ней:
app.whenReady().then(async () => {
    await loadExtensions(); // Загружаем плагины перед созданием окна
    createWindow();
});

async function createWindow() {
    // Отключаем web security для загрузки локальных файлов
    app.commandLine.appendSwitch('disable-web-security');
    app.commandLine.appendSwitch('allow-file-access-from-files');

    win = new BrowserWindow({
        width: 1400,
        height: 900,
        frame: false,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
                            nodeIntegration: true,
                            contextIsolation: false,
                            webviewTag: true,
                            webSecurity: false,
                            allowRunningInsecureContent: true
        },
        backgroundColor: '#1e1e1e'
    });

    win.loadFile('index.html');

    win.once('ready-to-show', () => {
        win.maximize();
        win.show();
    });

    win.webContents.on('will-attach-webview', (event, webPreferences) => {
        webPreferences.preload = path.join(__dirname, 'webview-preload.js');
        webPreferences.nodeIntegration = false;
        webPreferences.contextIsolation = true;
        webPreferences.webSecurity = false;
        webPreferences.allowRunningInsecureContent = true;
    });

    win.webContents.on('did-attach-webview', (event, attachedWebContents) => {
        // Внедряем content scripts при загрузке страницы
        attachedWebContents.on('did-finish-load', () => {
            const url = attachedWebContents.getURL();
            console.log(`WebView loaded: ${url}`);
            webext.injectContentScripts(attachedWebContents, url);
        });

        attachedWebContents.setWindowOpenHandler((details) => {
            win.webContents.send('OPEN_URL', details.url);
            return { action: 'deny' };
        });
    });

    win.webContents.session.on('will-download', handleDownload);
    session.fromPartition('persist:webview').on('will-download', handleDownload);

    win.on('close', (e) => {
        e.preventDefault();
        win.webContents.send('save-tabs');
    });
}

function createDownloadsWindow() {
    if (downloadsWin) {
        downloadsWin.focus();
        return;
    }

    downloadsWin = new BrowserWindow({
        width: 420,
        height: 520,
        frame: false,
        resizable: false,
        show: false,
        parent: win,
        modal: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
                                     nodeIntegration: true,
                                     contextIsolation: false,
                                     webSecurity: false
        },
        backgroundColor: '#1e1e28'
    });

    downloadsWin.loadFile('downloads_popup.html');

    downloadsWin.once('ready-to-show', () => downloadsWin.show());

    downloadsWin.on('closed', () => {
        downloadsWin = null;
    });
}

function handleDownload(event, item) {
    const filename = item.getFilename() || 'download';
    if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });
    const savePath = path.join(downloadPath, filename);
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);

    item.setSavePath(savePath);
    activeDownloadItems.set(id, item);

    win.webContents.send('download-started', { id, filename, totalBytes: item.getTotalBytes() });

    item.on('updated', () => {
        win.webContents.send('download-progress', {
            id,
            receivedBytes: item.getReceivedBytes(),
                             totalBytes: item.getTotalBytes()
        });
    });

    item.on('done', (e, state) => {
        win.webContents.send('download-state', { id, state });
        activeDownloadItems.delete(id);

        if (state === 'completed') {
            win.webContents.send('download-completed', {
                id,
                filename,
                url: item.getURLChain()[0] || '',
                                 totalBytes: item.getTotalBytes(),
                                 fullPath: savePath,
                                 time: Date.now()
            });
        }
    });
}

// =============== API для плагинов ===============

// Получить список плагинов
ipcMain.handle('get-plugins', async () => {
    try {
        console.log('=== get-plugins called ===');
        const plugins = [];

        // Читаем папку плагинов
        if (fs.existsSync(PLUGINS_PATH)) {
            const pluginFolders = fs.readdirSync(PLUGINS_PATH, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
            .filter(f => !f.startsWith('temp_'));

            console.log(`Читаем папку плагинов, найдено: ${pluginFolders.length}`);

            for (const folder of pluginFolders) {
                const pluginPath = path.join(PLUGINS_PATH, folder);
                const manifestPath = path.join(pluginPath, 'manifest.json');

                if (fs.existsSync(manifestPath)) {
                    try {
                        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
                        const manifest = JSON.parse(manifestContent);

                        // Получаем информацию о popup
                        const popupInfo = await getExtensionPopupInfo(folder);
                        const hasPopup = popupInfo.success && popupInfo.hasPopup;

                        // Загружаем настройки плагина
                        const settingsPath = path.join(PLUGIN_SETTINGS_PATH, `${folder}.json`);
                        let pluginSettings = { enabled: true };
                        if (fs.existsSync(settingsPath)) {
                            try {
                                pluginSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                            } catch (e) {
                                console.error(`Error reading settings for ${folder}:`, e);
                            }
                        }

                        plugins.push({
                            id: folder,
                            name: manifest.name || folder,
                            description: manifest.description || '',
                            version: manifest.version || '1.0',
                            author: manifest.author || 'Неизвестный автор',
                            enabled: pluginSettings.enabled !== false,
                            path: pluginPath,
                            manifest: manifest,
                            hasPopup: hasPopup,
                            type: 'user'
                        });

                        console.log(`Добавлен плагин: ${manifest.name || folder} (hasPopup: ${hasPopup}, enabled: ${pluginSettings.enabled !== false})`);
                    } catch (e) {
                        console.error(`Ошибка чтения manifest.json для ${folder}:`, e.message);
                    }
                }
            }
        }

        // Также получаем стандартные расширения
        const extensionsPath = path.join(__dirname, 'extensions');
        if (fs.existsSync(extensionsPath)) {
            const extensionFolders = fs.readdirSync(extensionsPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

            for (const folder of extensionFolders) {
                const extPath = path.join(extensionsPath, folder);
                const manifestPath = path.join(extPath, 'manifest.json');

                if (fs.existsSync(manifestPath)) {
                    try {
                        const manifestContent = fs.readFileSync(manifestPath, 'utf8');
                        const manifest = JSON.parse(manifestContent);

                        // Получаем информацию о popup
                        const popupInfo = await getExtensionPopupInfo(`ext_${folder}`);
                        const hasPopup = popupInfo.success && popupInfo.hasPopup;

                        plugins.push({
                            id: `ext_${folder}`,
                            name: manifest.name || folder,
                            description: manifest.description || 'Стандартное расширение',
                            version: manifest.version || '1.0',
                            author: 'StartPOZI Browser',
                            enabled: true,
                            path: extPath,
                            manifest: manifest,
                            hasPopup: hasPopup,
                            type: 'system'
                        });

                        console.log(`Добавлено стандартное расширение: ${manifest.name || folder} (hasPopup: ${hasPopup})`);
                    } catch (e) {
                        console.error(`Ошибка чтения manifest.json для расширения ${folder}:`, e);
                    }
                }
            }
        }

        console.log(`Всего плагинов: ${plugins.length}`);
        return plugins;
    } catch (error) {
        console.error('Ошибка получения списка плагинов:', error.message);
        return [];
    }
});

// Получить информацию о popup расширения
ipcMain.handle('open-plugin-popup', async (event, pluginId) => {
    console.log('🎯 === IPC open-plugin-popup CALLED ===');
    console.log('📌 Plugin ID:', pluginId);
    return await getExtensionPopupInfo(pluginId);
});

// Добавить новый плагин
ipcMain.handle('add-plugin', async () => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            title: 'Выберите плагин (.xpi файл, архив или папку с расширением)',
                                                                    properties: ['openFile'],
                                                                    filters: [
                                                                        { name: 'Firefox Extensions', extensions: ['xpi', 'zip'] },
                                                                        { name: 'All Files', extensions: ['*'] }
                                                                    ]
        });

        if (canceled || filePaths.length === 0) {
            return { success: false, message: 'Выбор отменен' };
        }

        const sourcePath = filePaths[0];
        const ext = path.extname(sourcePath).toLowerCase();

        console.log(`Adding plugin: ${sourcePath}, extension: ${ext}`);

        if (ext === '.xpi' || ext === '.zip') {
            const result = await installXpiPlugin(sourcePath);
            return result;
        } else {
            return { success: false, message: 'Неподдерживаемый формат файла' };
        }

    } catch (error) {
        console.error('Ошибка добавления плагина:', error);
        return {
            success: false,
            message: `Ошибка установки плагина: ${error.message}`
        };
    }
});

// Включить/выключить плагин
ipcMain.handle('toggle-plugin', async (event, pluginId, enabled) => {
    try {
        const settingsPath = path.join(PLUGIN_SETTINGS_PATH, `${pluginId}.json`);
        let settings = { enabled: true };

        if (fs.existsSync(settingsPath)) {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        }

        settings.enabled = enabled;
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

        // Сохраняем состояние для перезапуска
        const restartDataPath = path.join(userDataPath, 'restart-required.json');
        const restartData = {
            pluginId: pluginId,
            enabled: enabled,
            timestamp: Date.now(),
               action: 'toggle-plugin'
        };
        fs.writeFileSync(restartDataPath, JSON.stringify(restartData, null, 2), 'utf8');

        // Показываем сообщение о необходимости перезапуска
        if (win && !win.isDestroyed()) {
            win.webContents.send('restart-required', {
                pluginId: pluginId,
                enabled: enabled,
                message: `Плагин ${enabled ? 'включен' : 'выключен'}. Перезапустите браузер для применения изменений.`
            });
        }

        return {
            success: true,
            message: `Плагин ${enabled ? 'включен' : 'выключен'}. Перезапустите браузер для применения изменений.`,
            requiresRestart: true
        };
    } catch (error) {
        console.error('Ошибка переключения плагина:', error);
        return { success: false, message: error.message };
    }
});

// Удалить плагин
ipcMain.handle('remove-plugin', async (event, pluginId) => {
    try {
        if (pluginId.startsWith('ext_')) {
            return { success: false, message: 'Стандартные расширения нельзя удалять' };
        }

        const pluginPath = path.join(PLUGINS_PATH, pluginId);
        if (fs.existsSync(pluginPath)) {
            fs.rmSync(pluginPath, { recursive: true, force: true });

            const settingsPath = path.join(PLUGIN_SETTINGS_PATH, `${pluginId}.json`);
            if (fs.existsSync(settingsPath)) {
                fs.unlinkSync(settingsPath);
            }

            // Сохраняем состояние для перезапуска
            const restartDataPath = path.join(userDataPath, 'restart-required.json');
            const restartData = {
                pluginId: pluginId,
                enabled: false,
                timestamp: Date.now(),
               action: 'remove-plugin'
            };
            fs.writeFileSync(restartDataPath, JSON.stringify(restartData, null, 2), 'utf8');

            // Показываем сообщение о необходимости перезапуска
            if (win && !win.isDestroyed()) {
                win.webContents.send('restart-required', {
                    pluginId: pluginId,
                    enabled: false,
                    message: `Плагин удален. Перезапустите браузер для применения изменений.`
                });
            }

            return {
                success: true,
                message: 'Плагин успешно удален. Перезапустите браузер для применения изменений.',
                requiresRestart: true
            };
        } else {
            return { success: false, message: 'Плагин не найден' };
        }
    } catch (error) {
        console.error('Ошибка удаления плагина:', error);
        return { success: false, message: error.message };
    }
});

// Перезапустить браузер
ipcMain.handle('restart-browser', async () => {
    try {
        console.log('🔄 Перезапуск браузера...');

        // Сохраняем текущие вкладки перед перезапуском
        if (win && !win.isDestroyed()) {
            win.webContents.send('save-tabs');
        }

        // Даем время на сохранение вкладок
        setTimeout(() => {
            app.relaunch();
            app.exit(0);
        }, 500);

        return { success: true, message: 'Браузер перезапускается...' };
    } catch (error) {
        console.error('Ошибка перезапуска браузера:', error);
        return { success: false, message: error.message };
    }
});

// Открыть папку с плагинами
ipcMain.handle('open-plugins-folder', () => {
    try {
        shell.openPath(PLUGINS_PATH);
        return { success: true, message: 'Папка плагинов открыта' };
    } catch (error) {
        console.error('Ошибка открытия папки плагинов:', error);
        return { success: false, message: error.message };
    }
});

// =============== Существующие обработчики ===============

ipcMain.on('minimize', () => win?.minimize());
ipcMain.on('maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('close', () => {
    if (win && !win.isDestroyed()) {
        win.webContents.send('save-tabs');
    }
});

ipcMain.on('tabs-saved', () => {
    if (win && !win.isDestroyed()) {
        win.destroy();
    }
});

ipcMain.on('show-downloads-popup', () => createDownloadsWindow());
ipcMain.on('close-downloads-window', () => downloadsWin?.close());

ipcMain.on('OPEN_URL', (e, url) => win?.webContents.send('OPEN_URL', url));

ipcMain.on('cancel-download', (e, id) => {
    const item = activeDownloadItems.get(id);
    if (item) item.cancel();
});

ipcMain.on('open-folder', (e, filePath) => {
    shell.openPath(fs.existsSync(filePath) ? path.dirname(filePath) : downloadPath);
});

// Обработчик для сообщения о необходимости перезапуска
ipcMain.on('restart-required', (event, data) => {
    console.log('Перезапуск требуется:', data);
});

ipcMain.handle('get-browser-history', async () => JSON.parse(await win.webContents.executeJavaScript(`localStorage.getItem('browserHistory') || '[]'`)));
ipcMain.handle('clear-browser-history', async () => {
    await win.webContents.executeJavaScript(`localStorage.removeItem('browserHistory')`);
    win.webContents.send('history-updated');
});

ipcMain.handle('get-browser-downloads', async () => JSON.parse(await win.webContents.executeJavaScript(`localStorage.getItem('browserDownloads') || '[]'`)));
ipcMain.handle('clear-browser-downloads', async () => {
    await win.webContents.executeJavaScript(`localStorage.removeItem('browserDownloads')`);
    win.webContents.send('downloads-updated');
});

ipcMain.handle('get-current-download-path', () => downloadPath);
ipcMain.handle('set-download-path', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openDirectory'], defaultPath: downloadPath });
    if (!canceled && filePaths[0]) downloadPath = filePaths[0];
    return downloadPath;
});

ipcMain.handle('get-save-tabs', async () => await win.webContents.executeJavaScript(`localStorage.getItem('saveTabs') === 'true'`));
ipcMain.handle('set-save-tabs', async (e, isEnabled) => await win.webContents.executeJavaScript(`localStorage.setItem('saveTabs', ${isEnabled} ? 'true' : 'false')`));

ipcMain.handle('get-save-internal-pages', async () => await win.webContents.executeJavaScript(`localStorage.getItem('saveInternalPages') === 'true'`));
ipcMain.handle('set-save-internal-pages', async (e, isEnabled) => await win.webContents.executeJavaScript(`localStorage.setItem('saveInternalPages', ${isEnabled} ? 'true' : 'false')`));

ipcMain.handle('get-search-engine', async () => await win.webContents.executeJavaScript(`localStorage.getItem('searchEngineUrl') || 'https://startpozi.netlify.app/search.html?q='`));
ipcMain.handle('set-search-engine', async (e, url) => await win.webContents.executeJavaScript(`localStorage.setItem('searchEngineUrl', '${url}')`));

ipcMain.handle('get-theme', async () => await win.webContents.executeJavaScript(`localStorage.getItem('themeMode') || 'system'`));
ipcMain.handle('set-theme', async (e, theme) => await win.webContents.executeJavaScript(`localStorage.setItem('themeMode', '${theme}')`));

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
    if (win && !win.isDestroyed()) {
        win.webContents.send('save-tabs');
    }
});
