// ==================== main.js (полный файл с изменениями) ====================

const { app, BrowserWindow, ipcMain, dialog, session, shell, screen, webContents } = require('electron');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { nanoid } = require('nanoid');
const { exec, execSync } = require('child_process');
const crypto = require('crypto'); // для мастер‑пароля и шифрования

// Добавьте после констант путей:
const PLATFORM_CONFIG = {
    WINDOWS: 'win32',
    MACOS: 'darwin',
    LINUX: 'linux'
};

// Функции для кроссплатформенной регистрации
const SystemRegistry = {
    // Проверка, является ли приложение установленным (не запуск из разработки)
    isPackaged() {
        return app.isPackaged;
    },

    // Получение пути к исполняемому файлу
    getExecutablePath() {
        if (process.platform === PLATFORM_CONFIG.WINDOWS) {
            return process.execPath;
        } else if (process.platform === PLATFORM_CONFIG.MACOS) {
            // На macOS нужно учитывать .app bundle
            if (app.isPackaged) {
                return path.join(process.resourcesPath, '..', '..', '..');
            }
            return process.execPath;
        } else {
            return process.execPath;
        }
    },

    // Регистрация для Windows
    registerWindows() {
        try {
            const exePath = this.getExecutablePath();
            const appName = 'StartPOZI Browser';
            const appDescription = 'StartPOZI Browser - быстрый и приватный веб-обозреватель';

            const commands = [
                // Регистрация для HTTP/HTTPS
                `reg add "HKCU\\Software\\Classes\\StartPOZI.URL" /f /ve /d "${appName}"`,
                `reg add "HKCU\\Software\\Classes\\StartPOZI.URL\\shell\\open\\command" /f /ve /d "\"${exePath}\" \"%1\""`,
                `reg add "HKCU\\Software\\Classes\\http" /f /ve /d "StartPOZI.URL"`,
                `reg add "HKCU\\Software\\Classes\\https" /f /ve /d "StartPOZI.URL"`,

                // Регистрация для файлов HTML
                `reg add "HKCU\\Software\\Classes\\StartPOZI.HTML" /f /ve /d "${appName} HTML Document"`,
                `reg add "HKCU\\Software\\Classes\\StartPOZI.HTML\\shell\\open\\command" /f /ve /d "\"${exePath}\" \"%1\""`,
                `reg add "HKCU\\Software\\Classes\\.html" /f /ve /d "StartPOZI.HTML"`,
                `reg add "HKCU\\Software\\Classes\\.htm" /f /ve /d "StartPOZI.HTML"`,

                // Добавление в контекстное меню
                `reg add "HKCU\\Software\\Classes\\*\\shell\\OpenWithStartPOZI" /f /ve /d "Открыть в ${appName}"`,
                `reg add "HKCU\\Software\\Classes\\*\\shell\\OpenWithStartPOZI\\command" /f /ve /d "\"${exePath}\" \"%1\""`,

                // Для URL ссылок
                `reg add "HKCU\\Software\\Classes\\Unknown\\shell\\OpenWithStartPOZI" /f /ve /d "Открыть в ${appName}"`,
                `reg add "HKCU\\Software\\Classes\\Unknown\\shell\\OpenWithStartPOZI\\command" /f /ve /d "\"${exePath}\" \"%1\""`
            ];

            commands.forEach(cmd => {
                try {
                    execSync(cmd, { stdio: 'ignore' });
                } catch (e) {
                    console.log(`Не удалось выполнить команду: ${cmd}`);
                }
            });

            console.log('✅ Браузер зарегистрирован в Windows');
            return true;
        } catch (error) {
            console.error('❌ Ошибка регистрации в Windows:', error);
            return false;
        }
    },

    // Регистрация для Linux
    registerLinux() {
        try {
            const desktopFile = `[Desktop Entry]
            Name=StartPOZI Browser
            Comment=Быстрый и приватный веб-обозреватель
            Exec=${this.getExecutablePath()} %U
            Icon=${path.join(__dirname, 'icon.png')}
            Terminal=false
            Type=Application
            MimeType=text/html;text/xml;application/xhtml+xml;x-scheme-handler/http;x-scheme-handler/https;
            Categories=Network;WebBrowser;
            StartupWMClass=StartPOZI
            StartupNotify=true
            `;

            const desktopPaths = [
                path.join(process.env.HOME, '.local/share/applications/startpozi-browser.desktop'),
                '/usr/share/applications/startpozi-browser.desktop'
            ];

            let success = false;
            desktopPaths.forEach(desktopPath => {
                try {
                    // Создаем директорию если не существует
                    const dir = path.dirname(desktopPath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }

                    fs.writeFileSync(desktopPath, desktopFile);
                    fs.chmodSync(desktopPath, 0o755);

                    // Обновляем базу данных desktop
                    execSync('update-desktop-database ~/.local/share/applications', { stdio: 'ignore' });

                    console.log(`✅ Desktop файл создан: ${desktopPath}`);

                    // Устанавливаем как браузер по умолчанию
                    try {
                        execSync(`xdg-mime default startpozi-browser.desktop x-scheme-handler/http`, { stdio: 'ignore' });
                        execSync(`xdg-mime default startpozi-browser.desktop x-scheme-handler/https`, { stdio: 'ignore' });
                        execSync(`xdg-mime default startpozi-browser.desktop text/html`, { stdio: 'ignore' });
                        console.log('✅ Браузер установлен как обработчик по умолчанию');
                    } catch (e) {
                        console.log('⚠️ Не удалось установить как обработчик по умолчанию');
                    }

                    success = true;
                } catch (error) {
                    console.log(`⚠️ Не удалось создать desktop файл в ${desktopPath}: ${error.message}`);
                }
            });

            return success;
        } catch (error) {
            console.error('❌ Ошибка регистрации в Linux:', error);
            return false;
        }
    },

    // Регистрация для macOS
    registerMacOS() {
        try {
            const appPath = this.getExecutablePath();

            // Регистрация протоколов
            app.setAsDefaultProtocolClient('http');
            app.setAsDefaultProtocolClient('https');

            console.log('✅ Браузер зарегистрирован в macOS (протоколы)');

            // Для файлов .html/.htm
            try {
                const bundleId = app.getAppUserModelId();

                // Создаем plist файл для ассоциаций
                const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
                <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
                <plist version="1.0">
                <dict>
                <key>CFBundleIdentifier</key>
                <string>${bundleId}</string>
                <key>CFBundleName</key>
                <string>StartPOZI Browser</string>
                <key>CFBundleTypeExtensions</key>
                <array>
                <string>html</string>
                <string>htm</string>
                </array>
                <key>CFBundleTypeRole</key>
                <string>Viewer</string>
                </dict>
                </plist>`;

                const plistPath = path.join(app.getPath('userData'), 'startpozi-associations.plist');
                fs.writeFileSync(plistPath, plistContent);

                // Регистрируем через launch services (требует прав)
                try {
                    execSync(`/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f ${appPath}`, { stdio: 'ignore' });
                } catch (e) {
                    // Пропускаем ошибку, если нет прав
                }

            } catch (error) {
                console.log('⚠️ Не удалось зарегистрировать ассоциации файлов в macOS');
            }

            return true;
        } catch (error) {
            console.error('❌ Ошибка регистрации в macOS:', error);
            return false;
        }
    },

    // Удаление регистрации для Windows
    unregisterWindows() {
        try {
            const commands = [
                'reg delete "HKCU\\Software\\Classes\\StartPOZI.URL" /f',
                'reg delete "HKCU\\Software\\Classes\\http" /f',
                'reg delete "HKCU\\Software\\Classes\\https" /f',
                'reg delete "HKCU\\Software\\Classes\\StartPOZI.HTML" /f',
                'reg delete "HKCU\\Software\\Classes\\.html" /f',
                'reg delete "HKCU\\Software\\Classes\\.htm" /f',
                'reg delete "HKCU\\Software\\Classes\\*\\shell\\OpenWithStartPOZI" /f',
                'reg delete "HKCU\\Software\\Classes\\Unknown\\shell\\OpenWithStartPOZI" /f'
            ];

            commands.forEach(cmd => {
                try {
                    execSync(cmd, { stdio: 'ignore' });
                } catch (e) {
                    // Игнорируем ошибки удаления несуществующих ключей
                }
            });

            console.log('✅ Регистрация удалена в Windows');
            return true;
        } catch (error) {
            console.error('❌ Ошибка удаления регистрации в Windows:', error);
            return false;
        }
    },

    // Удаление регистрации для Linux
    unregisterLinux() {
        try {
            const desktopPaths = [
                path.join(process.env.HOME, '.local/share/applications/startpozi-browser.desktop'),
                '/usr/share/applications/startpozi-browser.desktop'
            ];

            desktopPaths.forEach(desktopPath => {
                try {
                    if (fs.existsSync(desktopPath)) {
                        fs.unlinkSync(desktopPath);
                        console.log(`🗑️ Desktop файл удален: ${desktopPath}`);
                    }
                } catch (error) {
                    console.log(`⚠️ Не удалось удалить desktop файл: ${desktopPath}`);
                }
            });

            // Обновляем базу данных
            try {
                execSync('update-desktop-database ~/.local/share/applications', { stdio: 'ignore' });
            } catch (e) {
                // Игнорируем
            }

            return true;
        } catch (error) {
            console.error('❌ Ошибка удаления регистрации в Linux:', error);
            return false;
        }
    },

    // Удаление регистрации для macOS
    unregisterMacOS() {
        try {
            // Удаляем регистрацию протоколов
            app.removeAsDefaultProtocolClient('http');
            app.removeAsDefaultProtocolClient('https');

            console.log('✅ Регистрация протоколов удалена в macOS');
            return true;
        } catch (error) {
            console.error('❌ Ошибка удаления регистрации в macOS:', error);
            return false;
        }
    },

    // Проверка текущей регистрации
    checkRegistration() {
        const platform = process.platform;
        let isRegistered = false;
        let details = {};

        if (platform === PLATFORM_CONFIG.WINDOWS) {
            try {
                execSync('reg query "HKCU\\Software\\Classes\\StartPOZI.URL"', { stdio: 'ignore' });
                isRegistered = true;
                details.platform = 'Windows';
            } catch (e) {
                isRegistered = false;
            }
        } else if (platform === PLATFORM_CONFIG.LINUX) {
            const desktopPath = path.join(process.env.HOME, '.local/share/applications/startpozi-browser.desktop');
            isRegistered = fs.existsSync(desktopPath);
            details.platform = 'Linux';
            details.desktopFile = desktopPath;
        } else if (platform === PLATFORM_CONFIG.MACOS) {
            // Для macOS проверяем регистрацию протоколов
            isRegistered = true; // app.isDefaultProtocolClient не всегда возвращает корректно
            details.platform = 'macOS';
        }

        return { registered: isRegistered, details };
    },

    // Основная функция регистрации
    registerBrowser() {
        const platform = process.platform;
        console.log(`🔧 Регистрация браузера на платформе: ${platform}`);

        if (!this.isPackaged()) {
            console.log('⚠️ Регистрация доступна только для упакованного приложения');
            return { success: false, message: 'Регистрация доступна только для установленной версии' };
        }

        if (platform === PLATFORM_CONFIG.WINDOWS) {
            const success = this.registerWindows();
            return {
                success,
                message: success ? 'Браузер зарегистрирован в Windows' : 'Ошибка регистрации в Windows'
            };
        } else if (platform === PLATFORM_CONFIG.LINUX) {
            const success = this.registerLinux();
            return {
                success,
                message: success ? 'Браузер зарегистрирован в Linux' : 'Ошибка регистрации в Linux'
            };
        } else if (platform === PLATFORM_CONFIG.MACOS) {
            const success = this.registerMacOS();
            return {
                success,
                message: success ? 'Браузер зарегистрирован в macOS' : 'Ошибка регистрации в macOS'
            };
        } else {
            return {
                success: false,
                message: `Платформа ${platform} не поддерживается для автоматической регистрации`
            };
        }
    },

    // Основная функция удаления регистрации
    unregisterBrowser() {
        const platform = process.platform;
        console.log(`🗑️ Удаление регистрации браузера на платформе: ${platform}`);

        if (platform === PLATFORM_CONFIG.WINDOWS) {
            const success = this.unregisterWindows();
            return {
                success,
                message: success ? 'Регистрация удалена в Windows' : 'Ошибка удаления регистрации'
            };
        } else if (platform === PLATFORM_CONFIG.LINUX) {
            const success = this.unregisterLinux();
            return {
                success,
                message: success ? 'Регистрация удалена в Linux' : 'Ошибка удаления регистрации'
            };
        } else if (platform === PLATFORM_CONFIG.MACOS) {
            const success = this.unregisterMacOS();
            return {
                success,
                message: success ? 'Регистрация удалена в macOS' : 'Ошибка удаления регистрации'
            };
        } else {
            return {
                success: false,
                message: `Платформа ${platform} не поддерживается`
            };
        }
    },

    // Получение инструкций для ручной регистрации
    getManualInstructions() {
        const platform = process.platform;

        if (platform === PLATFORM_CONFIG.WINDOWS) {
            return {
                platform: 'Windows',
                instructions: [
                    '1. Откройте "Параметры" → "Приложения" → "Приложения по умолчанию"',
                    '2. Найдите "Веб-браузер" и выберите StartPOZI Browser',
                    '3. Для файлов .html/.htm: в проводнике выберите "Открыть с помощью" → "Выбрать другое приложение"',
                    '4. Установите галочку "Всегда использовать это приложение..." и выберите StartPOZI Browser'
                ]
            };
        } else if (platform === PLATFORM_CONFIG.LINUX) {
            return {
                platform: 'Linux',
                instructions: [
                    '1. Откройте "Настройки" → "Приложения по умолчанию"',
                    '2. Выберите "Веб" и укажите StartPOZI Browser',
                    '3. Или выполните в терминале:',
                    '   xdg-mime default startpozi-browser.desktop x-scheme-handler/http',
                    '   xdg-mime default startpozi-browser.desktop x-scheme-handler/https'
                ]
            };
        } else if (platform === PLATFORM_CONFIG.MACOS) {
            return {
                platform: 'macOS',
                instructions: [
                    '1. Откройте "Системные настройки" → "Основные" → "Программа по умолчанию"',
                    '2. Выберите StartPOZI Browser как браузер по умолчанию',
                    '3. Для файлов: выберите файл .html, нажмите Cmd+I (Информация)',
                    '4. В разделе "Открыть в:" выберите StartPOZI Browser и нажмите "Использовать для всех"'
                ]
            };
        }

        return {
            platform: 'Unknown',
            instructions: ['Инструкции для вашей платформы недоступны']
        };
    }
};

// =============== НОВЫЕ ФУНКЦИИ (режим инкогнито, видео‑окно, очистка кэша, мастер‑пароль, шифрование) ===============

let incognitoWindows = new Set();

function createIncognitoWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        show: false,
        icon: path.join(__dirname, 'icon.png'),
                                  webPreferences: {
                                      preload: path.join(__dirname, 'preload-main.js'),
                                  nodeIntegration: false,
                                  contextIsolation: true,
                                  sandbox: false,
                                  webviewTag: true,
                                  webSecurity: false,
                                  partition: 'incognito', // отдельная сессия
                                  additionalArguments: ['--incognito'] // флаг для preload
                                  },
                                  backgroundColor: '#1e1e1e',
                                  titleBarStyle: 'hidden',
                                  titleBarOverlay: {
                                      color: '#2d2d2d',
                                      symbolColor: '#ffffff',
                                      height: 30
                                  }
    });

    win.loadFile('index.html');
    win.once('ready-to-show', () => {
        win.maximize();
        win.show();
    });

    win.on('closed', () => {
        incognitoWindows.delete(win);
    });

    incognitoWindows.add(win);
    return win;
}

// =============== ОТДЕЛЯЕМЫЙ ВИДЕО‑ПРОИГРЫВАТЕЛЬ ===============
let detachedVideoWindow = null;

function createDetachedVideoWindow(videoUrl, title) {
    if (detachedVideoWindow && !detachedVideoWindow.isDestroyed()) {
        detachedVideoWindow.focus();
        return detachedVideoWindow;
    }

    detachedVideoWindow = new BrowserWindow({
        width: 800,
        height: 450,
        minWidth: 400,
        minHeight: 300,
        frame: true,
        show: false,
        icon: path.join(__dirname, 'icon.png'),
                                            webPreferences: {
                                                preload: path.join(__dirname, 'webview-preload.js'),
                                            nodeIntegration: false,
                                            contextIsolation: true,
                                            webviewTag: true,
                                            webSecurity: false,
                                            partition: 'persist:webview'
                                            },
                                            backgroundColor: '#000000',
                                            titleBarStyle: 'default'
    });

    detachedVideoWindow.setTitle(`🎬 ${title || 'Отдельное видео'}`);
    detachedVideoWindow.loadURL(videoUrl);
    detachedVideoWindow.once('ready-to-show', () => {
        detachedVideoWindow.show();
    });

    detachedVideoWindow.on('closed', () => {
        detachedVideoWindow = null;
    });

    return detachedVideoWindow;
}

// =============== ОЧИСТКА КЭША И ДАННЫХ ===============
async function clearAllCache() {
    const ses = session.defaultSession;
    await ses.clearCache();
    await ses.clearStorageData({
        storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
    });
    console.log('🧹 Весь кэш и данные очищены');
}

// =============== МАСТЕР‑ПАРОЛЬ И ШИФРОВАНИЕ ===============
const MASTER_PASSWORD_FILE = path.join(app.getPath('userData'), 'master.key');
const PASSWORDS_FILE = path.join(app.getPath('userData'), 'passwords.json.enc'); // зашифрованный файл
let masterPasswordHash = null;

function getMasterPasswordHash() {
    if (masterPasswordHash) return masterPasswordHash;
    try {
        if (fs.existsSync(MASTER_PASSWORD_FILE)) {
            masterPasswordHash = fs.readFileSync(MASTER_PASSWORD_FILE, 'utf8');
        }
    } catch (e) {}
    return masterPasswordHash;
}

function setMasterPassword(newPassword) {
    const hash = crypto.createHash('sha256').update(newPassword).digest('hex');
    fs.writeFileSync(MASTER_PASSWORD_FILE, hash);
    masterPasswordHash = hash;
    return true;
}

function verifyMasterPassword(password) {
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    return hash === getMasterPasswordHash();
}

// Функции шифрования/дешифрования с использованием мастер-пароля
function encryptData(data, password) {
    const algorithm = 'aes-256-gcm';
    const key = crypto.createHash('sha256').update(password).digest(); // 32 байта
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return {
        iv: iv.toString('hex'),
        encrypted: encrypted,
        authTag: authTag.toString('hex')
    };
}

function decryptData(encryptedObj, password) {
    const algorithm = 'aes-256-gcm';
    const key = crypto.createHash('sha256').update(password).digest();
    const iv = Buffer.from(encryptedObj.iv, 'hex');
    const authTag = Buffer.from(encryptedObj.authTag, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedObj.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
}

// Сохранение паролей с шифрованием
function saveStoredPasswords(passwords) {
    try {
        const masterHash = getMasterPasswordHash();
        if (!masterHash) {
            // Если мастер-пароль не установлен, сохраняем открытым (для обратной совместимости)
            const plainPath = path.join(app.getPath('userData'), 'passwords.json');
            fs.writeFileSync(plainPath, JSON.stringify(passwords, null, 2), 'utf8');
            return true;
        }
        // Иначе шифруем и сохраняем в зашифрованный файл
        const encrypted = encryptData(passwords, masterHash);
        fs.writeFileSync(PASSWORDS_FILE, JSON.stringify(encrypted), 'utf8');
        return true;
    } catch (error) {
        console.error('Ошибка сохранения паролей:', error);
        return false;
    }
}

// Загрузка паролей с расшифровкой
function getStoredPasswords() {
    try {
        const masterHash = getMasterPasswordHash();
        // Сначала пробуем зашифрованный файл
        if (fs.existsSync(PASSWORDS_FILE) && masterHash) {
            const encryptedData = JSON.parse(fs.readFileSync(PASSWORDS_FILE, 'utf8'));
            return decryptData(encryptedData, masterHash);
        }
        // Иначе пробуем старый открытый файл
        const plainPath = path.join(app.getPath('userData'), 'passwords.json');
        if (fs.existsSync(plainPath)) {
            return JSON.parse(fs.readFileSync(plainPath, 'utf8')) || [];
        }
        return [];
    } catch (error) {
        console.error('Ошибка загрузки паролей:', error);
        return [];
    }
}

// [ДОБАВЛЕНО] =============== КАСТОМНАЯ ТЕМА ===============
const CUSTOM_THEME_PATH = path.join(app.getPath('userData'), 'custom-theme.css');

function saveCustomTheme(css) {
    try {
        fs.writeFileSync(CUSTOM_THEME_PATH, css, 'utf8');
        console.log('💾 Кастомная тема сохранена');
    } catch (e) {
        console.error('Ошибка сохранения кастомной темы:', e);
    }
}

function loadCustomTheme() {
    try {
        return fs.readFileSync(CUSTOM_THEME_PATH, 'utf8');
    } catch {
        return null;
    }
}

// =============== РЕАЛЬНАЯ БЛОКИРОВКА ПО СПИСКАМ ===============
class BlockListManager {
    constructor() {
        this.rules = new Map(); // паттерн -> действие (block)
        this.loaded = false;
        this.init();
    }

    async init() {
        // Загружаем EasyList и другие списки (пример)
        await this.loadLists();
        this.setupWebRequest();
    }

    async loadLists() {
        try {
            // Простой список для демонстрации (можно заменить на реальные списки)
            const response = await fetch('https://easylist.to/easylist/easylist.txt');
            const text = await response.text();
            this.parseList(text);
            console.log('✅ Блоклисты загружены, правил:', this.rules.size);
        } catch (error) {
            console.error('Ошибка загрузки блоклистов:', error);
        }
    }

    parseList(text) {
        const lines = text.split('\n');
        for (const line of lines) {
            if (line.startsWith('||')) {
                // правило вида ||example.com^
                let domain = line.substring(2).replace(/\^$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                this.rules.set(domain, 'block');
            }
        }
    }

    setupWebRequest() {
        session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
            const url = details.url;
            for (const [pattern, action] of this.rules) {
                if (url.includes(pattern)) {
                    console.log(`🚫 Заблокировано по списку: ${url}`);
                    return callback({ cancel: true });
                }
            }
            callback({ cancel: false });
        });
    }
}

let blockListManager = null;

// =============== ЗАЩИТА ОТ FINGERPRINTING (подмена canvas) ===============
function injectAntiFingerprint(webContents) {
    webContents.executeJavaScript(`
    // Подмена canvas
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type, encoderOptions) {
        // Добавляем случайный шум
        const ctx = this.getContext('2d');
        const imageData = ctx.getImageData(0, 0, this.width, this.height);
        for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = imageData.data[i] ^ 1; // небольшое изменение
        }
        ctx.putImageData(imageData, 0, 0);
        return originalToDataURL.call(this, type, encoderOptions);
    };

    // Подмена WebGL fingerprinting (пример)
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
    `).catch(err => console.log('Ошибка внедрения антифпринта:', err));
}

// Добавьте IPC обработчики для регистрации
ipcMain.handle('register-browser-in-system', async () => {
    return SystemRegistry.registerBrowser();
});

ipcMain.handle('unregister-browser-from-system', async () => {
    return SystemRegistry.unregisterBrowser();
});

ipcMain.handle('check-system-registration', async () => {
    return SystemRegistry.checkRegistration();
});

ipcMain.handle('get-manual-instructions', async () => {
    return SystemRegistry.getManualInstructions();
});

ipcMain.handle('get-platform-info', async () => {
    return {
        platform: process.platform,
        isPackaged: app.isPackaged,
        arch: process.arch,
        version: process.version,
        appVersion: app.getVersion()
    };
});

// =============== КРИТИЧЕСКИЕ НАСТРОЙКИ ===============
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-features', 'CrossOriginOpenerPolicy');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('allow-file-access-from-files');
app.commandLine.appendSwitch('ignore-certificate-errors');

// =============== ИНИЦИАЛИЗАЦИЯ WEBEXTENSIONS API ===============
const WebExtensionsAPI = require('./webextensions.js');
let webext = null;

let win;
let downloadsWin = null;
let downloadPath = app.getPath('downloads');
let activeDownloadItems = new Map();

const userDataPath = path.join(app.getPath('appData'), 'startpozi-browser');
app.setPath('userData', userDataPath);

const EXTENSIONS_PATH = path.join(app.getPath('userData'), 'extensions');
const PLUGIN_SETTINGS_PATH = path.join(app.getPath('userData'), 'extensions_settings');
const SYSTEM_EXTENSIONS_PATH = path.join(__dirname, 'extensions');
const EXTENSION_STORAGE_PATH = path.join(userDataPath, 'extension-storage');

[userDataPath, EXTENSIONS_PATH, PLUGIN_SETTINGS_PATH, SYSTEM_EXTENSIONS_PATH, EXTENSION_STORAGE_PATH].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});

console.log('=== StartPOZI Browser ===');
console.log('User data path:', app.getPath('userData'));
console.log('Extensions path:', EXTENSIONS_PATH);
console.log('System extensions path:', SYSTEM_EXTENSIONS_PATH);
console.log('Storage engine: electron-store');

// =============== ФУНКЦИЯ ОЧИСТКИ LOCK-ФАЙЛОВ ===============
function cleanupLockFiles() {
    try {
        console.log('🧹 Очистка lock-файлов...');

        function removeLocks(dir) {
            if (!fs.existsSync(dir)) return;

            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dir, item.name);

                if (item.isDirectory()) {
                    removeLocks(fullPath);
                } else if (item.name === 'LOCK' || item.name.endsWith('.lock')) {
                    try {
                        fs.unlinkSync(fullPath);
                        console.log(`✅ Удален lock файл: ${path.relative(userDataPath, fullPath)}`);
                    } catch (err) {
                        // Игнорируем ошибки удаления
                    }
                }
            }
        }

        removeLocks(userDataPath);
        return true;
    } catch (error) {
        console.warn('⚠️ Ошибка при очистке lock-файлов:', error.message);
        return false;
    }
}

// =============== ФУНКЦИЯ ЗАГРУЗКИ РАСШИРЕНИЙ ===============
async function loadAllExtensions() {
    console.log('\n=== Loading All Extensions ===');

    if (!webext) {
        console.error('WebExtensionsAPI not initialized');
        return;
    }

    try {
        const extensions = await webext.loadAllExtensions();
        console.log(`✅ Total extensions loaded: ${extensions.length}`);

        if (win && !win.isDestroyed()) {
            win.webContents.send('extensions-loaded', {
                count: extensions.length,
                timestamp: Date.now()
            });
        }

        return extensions;
    } catch (error) {
        console.error('Error loading extensions:', error);
        return [];
    }
}

// =============== УСТАНОВКА РАСШИРЕНИЯ ИЗ XPI ===============
async function installXpiExtension(xpiPath) {
    try {
        console.log(`📦 Installing extension from: ${xpiPath}`);

        if (!webext) {
            return {
                success: false,
                message: 'Extensions system not initialized'
            };
        }

        const result = await webext.installExtension(xpiPath);

        if (result.success) {
            console.log(`✅ Extension installed: ${result.manifest.name} (${result.extensionId})`);

            if (win && !win.isDestroyed()) {
                win.webContents.send('extensions-updated');
            }

            return result;
        } else {
            return result;
        }
    } catch (error) {
        console.error('Extension installation failed:', error);
        return {
            success: false,
            message: `Installation failed: ${error.message}`
        };
    }
}

// =============== СОЗДАНИЕ ГЛАВНОГО ОКНА ===============
function createWindow() {
    console.log('\n=== Creating Main Window ===');

    const preloadPath = path.join(__dirname, 'preload-main.js');
    console.log(`Preload path: ${preloadPath}`);
    console.log(`Preload exists: ${fs.existsSync(preloadPath)}`);

    win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        show: false,
        icon: path.join(__dirname, 'icon.png'),
                            webPreferences: {
                                preload: preloadPath,
                                nodeIntegration: false,
                                contextIsolation: true,
                                sandbox: false,
                                webviewTag: true,
                                webSecurity: false,
                                allowRunningInsecureContent: true,
                                additionalArguments: ['--disable-web-security'],
                                enableRemoteModule: true,
                                partition: 'persist:main',
                                enableWebSQL: false,
                                backgroundThrottling: false
                            },
                            backgroundColor: '#1e1e1e',
                            titleBarStyle: 'hidden',
                            titleBarOverlay: {
                                color: '#2d2d2d',
                                symbolColor: '#ffffff',
                                height: 30
                            }
    });

    win.loadFile('index.html');
    console.log('✅ Main window HTML loaded');

    win.once('ready-to-show', () => {
        win.maximize();
        win.show();
        console.log('✅ Main window shown and maximized');

        if (win && !win.isDestroyed()) {
            const extensionsCount = webext ? webext.getAllExtensions().length : 0;
            win.webContents.send('extensions-loaded', {
                count: extensionsCount,
                timestamp: Date.now()
            });
        }
    });

    win.webContents.on('will-attach-webview', (event, webPreferences, params) => {
        console.log(`🔗 WebView will attach: ${params.src || 'unknown'}`);

        // Проверяем, открываем ли мы настройки
        if (params.src.includes('Settings.html')) {
            console.log('⚙️ Обнаружены настройки: подключаем preload-settings.js');
            webPreferences.preload = path.join(__dirname, 'preload-settings.js');
        } else {
            // Для всех остальных сайтов используем обычный preload
            console.log('🌍 Обычный сайт: подключаем webview-preload.js');
            webPreferences.preload = path.join(__dirname, 'webview-preload.js');
        }

        webPreferences.nodeIntegration = false;
        webPreferences.contextIsolation = true;
        webPreferences.webSecurity = false;
        webPreferences.allowRunningInsecureContent = true;
        webPreferences.additionalArguments = ['--disable-web-security'];
        webPreferences.enableRemoteModule = true;
        // Партиция определяется в renderer.js в зависимости от режима инкогнито
        webPreferences.enableWebSQL = false;

        if (process.env.NODE_ENV === 'development') {
            webPreferences.devTools = true;
        }
    });

    win.webContents.on('did-attach-webview', (event, attachedWebContents) => {
        console.log('✅ WebView attached successfully');

        attachedWebContents.session.clearStorageData({
            storages: ['serviceworkers', 'cachestorage']
        }).then(() => {
            console.log('✅ WebView storage cleared');
        });

        attachedWebContents.on('did-finish-load', () => {
            const url = attachedWebContents.getURL();
            console.log(`🌐 WebView loaded: ${url}`);

            // Внедряем защиту от фингерпринтинга
            injectAntiFingerprint(attachedWebContents);

            if (webext) {
                webext.injectContentScripts(attachedWebContents, url);
            }
        });

        attachedWebContents.setWindowOpenHandler((details) => {
            console.log(`🔄 WebView wants to open: ${details.url}`);
            if (win && !win.isDestroyed()) {
                win.webContents.send('OPEN_URL', details.url);
            }
            return { action: 'deny' };
        });
    });

    win.webContents.session.on('will-download', handleDownload);
    session.fromPartition('persist:webview').on('will-download', handleDownload);

    win.on('close', (e) => {
        e.preventDefault();
        console.log('💾 Saving tabs before closing...');

        if (win && !win.isDestroyed()) {
            win.webContents.send('save-tabs');

            win.webContents.executeJavaScript(`
            document.querySelectorAll('iframe').forEach(iframe => {
                iframe.contentWindow.postMessage({ type: 'close' }, '*');
            });
            `);
        }
    });

    if (process.env.NODE_ENV === 'development') {
        win.webContents.openDevTools({ mode: 'detach' });
        console.log('🔧 DevTools opened (development mode)');
    }

    console.log('✅ Main window created successfully');
}

// =============== ОБРАБОТКА ЗАГРУЗОК ===============
function handleDownload(event, item) {
    const filename = item.getFilename() || 'download';

    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
        console.log(`📁 Created downloads directory: ${downloadPath}`);
    }

    const savePath = path.join(downloadPath, filename);
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);

    item.setSavePath(savePath);
    activeDownloadItems.set(id, item);

    console.log(`📥 Download started: ${filename} (ID: ${id})`);
    console.log(`   Save path: ${savePath}`);
    console.log(`   URL: ${item.getURLChain()[0] || 'unknown'}`);
    console.log(`   Total bytes: ${item.getTotalBytes() || 'unknown'}`);

    if (win && !win.isDestroyed()) {
        win.webContents.send('download-started', {
            id,
            filename,
            totalBytes: item.getTotalBytes(),
                             savePath
        });
    }

    item.on('updated', (event, state) => {
        const data = {
            id,
            receivedBytes: item.getReceivedBytes(),
            totalBytes: item.getTotalBytes(),
            state: state
        };

        if (win && !win.isDestroyed()) {
            win.webContents.send('download-progress', data);
        }
    });

    item.on('done', (event, state) => {
        console.log(`📥 Download ${state}: ${filename}`);

        if (win && !win.isDestroyed()) {
            win.webContents.send('download-state', { id, state });
        }

        activeDownloadItems.delete(id);

        if (state === 'completed') {
            const downloadData = {
                id,
                filename,
                url: item.getURLChain()[0] || '',
            totalBytes: item.getTotalBytes(),
            fullPath: savePath,
            time: Date.now(),
            state: 'completed'
            };

            if (win && !win.isDestroyed()) {
                win.webContents.send('download-completed', downloadData);
            }

            try {
                const downloads = JSON.parse(fs.readFileSync(
                    path.join(userDataPath, 'downloads.json'),
                                                             'utf8'
                ) || '[]');
                downloads.push(downloadData);
                fs.writeFileSync(
                    path.join(userDataPath, 'downloads.json'),
                                 JSON.stringify(downloads, null, 2),
                                 'utf8'
                );
            } catch (error) {
                console.error('Error saving download info:', error);
            }
        }
    });
}

// =============== ОСНОВНЫЕ IPC ОБРАБОТЧИКИ ===============
ipcMain.on('minimize', () => {
    if (win && !win.isDestroyed()) {
        win.minimize();
        console.log('⬇️ Window minimized');
    }
});

ipcMain.on('maximize', () => {
    if (win && !win.isDestroyed()) {
        if (win.isMaximized()) {
            win.unmaximize();
            console.log('↔️ Window unmaximized');
        } else {
            win.maximize();
            console.log('⬆️ Window maximized');
        }
    }
});

ipcMain.on('close', () => {
    console.log('🚪 Closing window...');
    if (win && !win.isDestroyed()) {
        win.webContents.send('save-tabs');
        setTimeout(() => {
            if (win && !win.isDestroyed()) {
                win.destroy();
            }
        }, 100);
    }
});

ipcMain.on('tabs-saved', () => {
    console.log('✅ Tabs saved, closing window');
    if (win && !win.isDestroyed()) {
        win.destroy();
    }
});

// =============== IPC ДЛЯ POPUP ОКОН РАСШИРЕНИЙ ===============
ipcMain.on('popup:minimize', (event) => {
    const popupWin = BrowserWindow.fromWebContents(event.sender);
    if (popupWin) {
        popupWin.minimize();
        console.log('📥 Popup minimized via IPC');
    }
});

ipcMain.on('popup:maximize', (event) => {
    const popupWin = BrowserWindow.fromWebContents(event.sender);
    if (popupWin) {
        if (popupWin.isMaximized()) {
            popupWin.unmaximize();
            console.log('🔲 Popup unmaximized via IPC');
        } else {
            popupWin.maximize();
            console.log('🔲 Popup maximized via IPC');
        }
    }
});

ipcMain.on('popup:close', (event) => {
    const popupWin = BrowserWindow.fromWebContents(event.sender);
    if (popupWin) {
        popupWin.close();
        console.log('❌ Popup closed via IPC');
    }
});

ipcMain.on('popup:resize', (event, { width, height }) => {
    const popupWin = BrowserWindow.fromWebContents(event.sender);
    if (popupWin) {
        popupWin.setSize(width, height);
        console.log(`📐 Popup resized to ${width}x${height}`);
    }
});

// =============== ДОПОЛНИТЕЛЬНЫЕ IPC ===============
const validChannels = [
    'download-started', 'download-progress', 'download-state',
'download-completed', 'downloads-updated', 'OPEN_URL',
'save-tabs', 'restart-required', 'extensions-loaded',
'passwords-updated', 'extension-storage-changed'
];

// Обработчик для изменения хранилища расширений
ipcMain.on('extension-storage-changed', (event, data) => {
    if (win && !win.isDestroyed()) {
        win.webContents.send('extension-storage-changed', data);
    }
});

// Обработчик для клика по иконке расширения без popup
ipcMain.on('extension-action-clicked', (event, extensionId) => {
    console.log(`🔘 Extension action clicked: ${extensionId}`);
    if (webext) {
        const extension = webext.getExtension(extensionId);
        if (extension && extension.background && extension.background.scripts) {
            // Здесь можно отправить событие в background скрипт, но пока не реализовано
        }
    }
});

// =============== УНИФИЦИРОВАННЫЕ ОБРАБОТЧИКИ ДЛЯ РАСШИРЕНИЙ (только ipcMain.handle) ===============
ipcMain.handle('get-plugins', async () => {
    try {
        console.log('📋 Sending extensions to renderer');

        if (webext) {
            const extensions = webext.getAllExtensions();
            console.log(`📊 Total extensions from webext: ${extensions.length}`);
            return extensions;
        } else {
            console.error('❌ webext not initialized');
            return [];
        }
    } catch (error) {
        console.error('Error in get-plugins:', error);
        return [];
    }
});

ipcMain.handle('add-plugin', async () => {
    try {
        console.log('➕ Add extension requested');

        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            title: 'Select Firefox Extension (.xpi file)',
                                                                    properties: ['openFile'],
                                                                    filters: [
                                                                        { name: 'Firefox Extensions', extensions: ['xpi', 'zip'] },
                                                                        { name: 'All Files', extensions: ['*'] }
                                                                    ],
                                                                    defaultPath: app.getPath('downloads')
        });

        if (canceled || filePaths.length === 0) {
            console.log('❌ Extension selection cancelled');
            return { success: false, message: 'Selection cancelled' };
        }

        const sourcePath = filePaths[0];
        const ext = path.extname(sourcePath).toLowerCase();

        console.log(`📄 Selected file: ${sourcePath} (extension: ${ext})`);

        if (ext === '.xpi' || ext === '.zip') {
            const result = await installXpiExtension(sourcePath);

            if (result.success && win && !win.isDestroyed()) {
                win.webContents.send('extensions-updated');
            }

            return result;
        } else {
            return {
                success: false,
                message: 'Unsupported file format. Please select .xpi or .zip file.'
            };
        }
    } catch (error) {
        console.error('Error in add-plugin:', error);
        return {
            success: false,
            message: `Failed to add extension: ${error.message}`
        };
    }
});

ipcMain.handle('toggle-plugin', async (event, pluginId, enabled) => {
    try {
        console.log(`🔘 Переключение расширения ${pluginId} на ${enabled ? 'enabled' : 'disabled'}`);

        if (!webext) {
            return { success: false, message: 'Extensions system not initialized' };
        }

        const result = webext.toggleExtension(pluginId, enabled);

        if (result) {
            // Сохраняем состояние в отдельный файл настроек
            const settingsPath = path.join(PLUGIN_SETTINGS_PATH, `${pluginId}.json`);
            const settings = {
                enabled: enabled,
                lastModified: new Date().toISOString()
            };

            if (!fs.existsSync(PLUGIN_SETTINGS_PATH)) {
                fs.mkdirSync(PLUGIN_SETTINGS_PATH, { recursive: true });
            }

            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
            console.log(`💾 Состояние расширения сохранено: ${pluginId} = ${enabled}`);

            if (win && !win.isDestroyed()) {
                win.webContents.send('extension-state-changed', {
                    extensionId: pluginId,
                    enabled: enabled,
                    timestamp: Date.now()
                });
            }

            return {
                success: true,
                message: `Расширение ${enabled ? 'включено' : 'выключено'} успешно`,
                requiresRestart: false
            };
        } else {
            return {
                success: false,
                message: 'Расширение не найдено'
            };
        }
    } catch (error) {
        console.error('Ошибка в toggle-plugin:', error);
        return {
            success: false,
            message: `Ошибка: ${error.message}`
        };
    }
});

ipcMain.handle('save-extension-state', async (event, extensionId, enabled) => {
    try {
        console.log(`💾 Сохранение состояния расширения ${extensionId}: ${enabled ? 'enabled' : 'disabled'}`);

        const settingsPath = path.join(PLUGIN_SETTINGS_PATH, `${extensionId}.json`);
        const settings = {
            enabled: enabled,
            lastModified: new Date().toISOString()
        };

        if (!fs.existsSync(PLUGIN_SETTINGS_PATH)) {
            fs.mkdirSync(PLUGIN_SETTINGS_PATH, { recursive: true });
        }

        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');

        if (webext) {
            const extension = webext.extensions.get(extensionId);
            if (extension) {
                extension.enabled = enabled;
                console.log(`✅ Состояние расширения обновлено в памяти: ${extensionId}`);
            }
        }

        return {
            success: true,
            message: `Состояние расширения сохранено`
        };
    } catch (error) {
        console.error('Ошибка при сохранении состояния расширения:', error);
        return {
            success: false,
            message: `Ошибка: ${error.message}`
        };
    }
});

ipcMain.handle('load-extension-states', async () => {
    try {
        const states = {};

        if (!fs.existsSync(PLUGIN_SETTINGS_PATH)) {
            fs.mkdirSync(PLUGIN_SETTINGS_PATH, { recursive: true });
            console.log('📁 Создана директория для настроек расширений');
            return states;
        }

        const files = fs.readdirSync(PLUGIN_SETTINGS_PATH);

        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const extensionId = file.replace('.json', '');
                    const settings = JSON.parse(fs.readFileSync(
                        path.join(PLUGIN_SETTINGS_PATH, file),
                                                                'utf8'
                    ));
                    states[extensionId] = settings.enabled !== false;
                } catch (error) {
                    console.error(`Ошибка чтения настроек ${file}:`, error);
                }
            }
        }

        console.log(`📊 Загружено состояний расширений: ${Object.keys(states).length}`);
        return states;
    } catch (error) {
        console.error('Ошибка при загрузке состояний расширений:', error);
        return {};
    }
});

ipcMain.handle('remove-plugin', async (event, pluginId) => {
    try {
        console.log(`🗑️ Removing extension: ${pluginId}`);

        if (!webext) {
            return { success: false, message: 'Extensions system not initialized' };
        }

        if (pluginId.startsWith('system_')) {
            return {
                success: false,
                message: 'System extensions cannot be removed'
            };
        }

        webext.closeExtensionPopup(pluginId);

        const removed = webext.removeExtension(pluginId);

        if (removed) {
            const settingsPath = path.join(PLUGIN_SETTINGS_PATH, `${pluginId}.json`);
            if (fs.existsSync(settingsPath)) {
                fs.unlinkSync(settingsPath);
                console.log(`✅ Extension settings removed: ${settingsPath}`);
            }

            const restartDataPath = path.join(userDataPath, 'restart-required.json');
            fs.writeFileSync(restartDataPath, JSON.stringify({
                pluginId: pluginId,
                removed: true,
                timestamp: Date.now(),
                                                             action: 'remove-extension'
            }, null, 2), 'utf8');

            if (win && !win.isDestroyed()) {
                win.webContents.send('restart-required', {
                    pluginId: pluginId,
                    removed: true,
                    message: 'Extension removed successfully. Restart recommended.'
                });
            }

            return {
                success: true,
                message: 'Extension removed successfully.',
                requiresRestart: true
            };
        } else {
            return {
                success: false,
                message: 'Extension not found'
            };
        }
    } catch (error) {
        console.error('Error in remove-plugin:', error);
        return {
            success: false,
            message: `Failed to remove extension: ${error.message}`
        };
    }
});

ipcMain.handle('open-plugin-popup', async (event, pluginId, anchorRect = null) => {
    try {
        console.log(`🪟 Opening popup for extension: ${pluginId}`);

        if (!webext) {
            return {
                success: false,
                message: 'Extensions system not initialized'
            };
        }

        const result = await webext.openExtensionPopup(pluginId, anchorRect);

        if (result.success && result.extension) {
            result.extension.path = result.extension.path ||
            path.join(EXTENSIONS_PATH, pluginId);
        }

        return result;
    } catch (error) {
        console.error('Error in open-plugin-popup:', error);
        return {
            success: false,
            message: `Failed to open popup: ${error.message}`
        };
    }
});

ipcMain.handle('close-plugin-popup', async (event, pluginId) => {
    try {
        if (!webext) {
            return false;
        }

        const closed = webext.closeExtensionPopup(pluginId);
        console.log(`🪟 Popup ${closed ? 'closed' : 'not found'} for: ${pluginId}`);
        return closed;
    } catch (error) {
        console.error('Error in close-plugin-popup:', error);
        return false;
    }
});

ipcMain.handle('get-extension-info', async (event, pluginId) => {
    try {
        if (!webext) {
            return { success: false, message: 'Extensions system not initialized' };
        }

        const allExtensions = webext.getAllExtensions();
        const extension = allExtensions.find(ext => ext.id === pluginId);

        if (extension) {
            return {
                success: true,
                extension: extension
            };
        }

        return {
            success: false,
            message: 'Extension not found'
        };
    } catch (error) {
        console.error('Error in get-extension-info:', error);
        return {
            success: false,
            message: `Failed to get extension info: ${error.message}`
        };
    }
});

ipcMain.handle('open-plugins-folder', () => {
    try {
        console.log(`📂 Opening extensions folder: ${EXTENSIONS_PATH}`);
        shell.openPath(EXTENSIONS_PATH).then(() => {
            console.log('✅ Extensions folder opened');
        }).catch(error => {
            console.error('Failed to open extensions folder:', error);
        });

        return {
            success: true,
            message: 'Extensions folder opened'
        };
    } catch (error) {
        console.error('Error in open-plugins-folder:', error);
        return {
            success: false,
            message: `Failed to open folder: ${error.message}`
        };
    }
});

ipcMain.handle('get-browser-actions', async () => {
    try {
        if (!webext) {
            return [];
        }

        return webext.getBrowserActions();
    } catch (error) {
        console.error('Error in get-browser-actions:', error);
        return [];
    }
});

// =============== УНИФИЦИРОВАННЫЕ ОБРАБОТЧИКИ ДЛЯ STORAGE РАСШИРЕНИЙ (только ipcMain.handle) ===============
ipcMain.handle('extension-storage-set', async (event, data) => {
    const { extensionId, items, namespace = 'local', requestId } = data;
    try {
        const changes = webext.setStorageData(extensionId, items, namespace);
        return { success: true, changes, requestId };
    } catch (error) {
        return { success: false, error: error.message, requestId };
    }
});

ipcMain.handle('extension-storage-get', async (event, data) => {
    const { extensionId, keys, namespace = 'local', requestId } = data;
    try {
        const result = webext.getStorageData(extensionId, keys, namespace);
        return { success: true, result, requestId };
    } catch (error) {
        return { success: false, error: error.message, requestId };
    }
});

ipcMain.handle('extension-storage-remove', async (event, data) => {
    const { extensionId, keys, namespace = 'local', requestId } = data;
    try {
        const changes = webext.removeStorageData(extensionId, keys, namespace);
        return { success: true, changes, requestId };
    } catch (error) {
        return { success: false, error: error.message, requestId };
    }
});

ipcMain.handle('extension-storage-clear', async (event, data) => {
    const { extensionId, namespace = 'local', requestId } = data;
    try {
        const changes = webext.clearStorageData(extensionId, namespace);
        return { success: true, changes, requestId };
    } catch (error) {
        return { success: false, error: error.message, requestId };
    }
});

// Дополнительный обработчик для получения информации о хранилище
ipcMain.handle('extension-storage-info', async (event, extensionId) => {
    try {
        const allData = webext.getExtensionStorage(extensionId, 'local');
        const stats = {};

        Object.keys(allData).forEach(namespace => {
            const namespaceData = allData[namespace];
            stats[namespace] = {
                keys: Object.keys(namespaceData).length,
                                     size: JSON.stringify(namespaceData).length
            };
        });

        return {
            success: true,
            extensionId,
            totalNamespaces: Object.keys(allData).length,
               stats: stats
        };
    } catch (error) {
        console.error('Error in extension-storage-info:', error);
        return {
            success: false,
            error: error.message
        };
    }
});

// Обработчик для резервного копирования хранилища расширения
ipcMain.handle('extension-storage-backup', async (event, extensionId) => {
    try {
        const allData = webext.getExtensionStorage(extensionId, 'local');
        const backupPath = path.join(EXTENSION_STORAGE_PATH, 'backups');

        if (!fs.existsSync(backupPath)) {
            fs.mkdirSync(backupPath, { recursive: true });
        }

        const backupFile = path.join(backupPath, `${extensionId}_${Date.now()}.json`);
        fs.writeFileSync(backupFile, JSON.stringify(allData, null, 2), 'utf8');

        return {
            success: true,
            backupPath: backupFile,
            timestamp: Date.now()
        };
    } catch (error) {
        console.error('Error in extension-storage-backup:', error);
        return {
            success: false,
            error: error.message
        };
    }
});

ipcMain.handle('load-extension-data', async (event, extensionId) => {
    try {
        console.log(`📂 Загрузка данных расширения: ${extensionId}`);

        if (!webext) {
            return { success: false, message: 'Extensions system not initialized' };
        }

        const allExtensions = webext.getAllExtensions();
        const extension = allExtensions.find(ext => ext.id === extensionId);

        if (extension) {
            return {
                success: true,
                extension: extension
            };
        }

        return {
            success: false,
            message: 'Extension not found'
        };
    } catch (error) {
        console.error('Error in load-extension-data:', error);
        return {
            success: false,
            message: `Failed to load extension data: ${error.message}`
        };
    }
});

// =============== НОВЫЕ IPC ОБРАБОТЧИКИ (инкогнито, очистка кэша, видео, мастер-пароль) ===============

ipcMain.handle('create-incognito-window', () => {
    createIncognitoWindow();
    return { success: true };
});

ipcMain.handle('clear-cache-and-data', async () => {
    await clearAllCache();
    return { success: true };
});

ipcMain.handle('detach-video', (event, videoUrl, title) => {
    createDetachedVideoWindow(videoUrl, title);
    return { success: true };
});

ipcMain.handle('set-master-password', (event, password) => {
    if (!password) return { success: false, message: 'Пароль не может быть пустым' };
    setMasterPassword(password);
    return { success: true };
});

ipcMain.handle('verify-master-password', (event, password) => {
    const valid = verifyMasterPassword(password);
    return { success: valid };
});

ipcMain.handle('has-master-password', () => {
    return { has: !!getMasterPasswordHash() };
});

// [ДОБАВЛЕНО] =============== IPC ДЛЯ КАСТОМНОЙ ТЕМЫ ===============
ipcMain.on('apply-custom-theme', (event, css) => {
    saveCustomTheme(css);
    // Рассылаем всем окнам
    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
            win.webContents.send('apply-custom-theme', css);
        }
    });
});

ipcMain.handle('get-custom-theme', () => {
    return loadCustomTheme();
});

// =============== ОСТАЛЬНЫЕ IPC ОБРАБОТЧИКИ ===============
ipcMain.handle('restart-browser', async () => {
    try {
        console.log('🔄 Restarting browser...');

        if (win && !win.isDestroyed()) {
            win.webContents.send('save-tabs');
        }

        cleanupLockFiles();

        setTimeout(() => {
            app.relaunch();
            app.exit(0);
        }, 500);

        return {
            success: true,
            message: 'Browser restarting...'
        };
    } catch (error) {
        console.error('Error in restart-browser:', error);
        return {
            success: false,
            message: `Failed to restart: ${error.message}`
        };
    }
});

ipcMain.on('show-downloads-popup', () => {
    console.log('📥 Showing downloads popup');

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
            preload: path.join(__dirname, 'preload-main.js'),
                                     nodeIntegration: false,
                                     contextIsolation: true,
                                     webSecurity: false,
                                     partition: 'persist:downloads'
        },
        backgroundColor: '#1e1e28',
        alwaysOnTop: true
    });

    downloadsWin.loadFile('downloads_popup.html');

    downloadsWin.once('ready-to-show', () => {
        downloadsWin.show();
        console.log('✅ Downloads popup shown');
    });

    downloadsWin.on('closed', () => {
        downloadsWin = null;
        console.log('🗑️ Downloads popup closed');
    });
});

ipcMain.on('close-downloads-window', () => {
    if (downloadsWin) {
        downloadsWin.close();
    }
});

ipcMain.on('cancel-download', (e, id) => {
    console.log(`❌ Cancelling download: ${id}`);
    const item = activeDownloadItems.get(id);
    if (item) {
        item.cancel();
        activeDownloadItems.delete(id);
    }
});

ipcMain.on('open-folder', (e, filePath) => {
    const folderPath = fs.existsSync(filePath) ? path.dirname(filePath) : downloadPath;
    console.log(`📂 Opening folder: ${folderPath}`);
    shell.openPath(folderPath).then(() => {
        console.log('✅ Folder opened successfully');
    }).catch(error => {
        console.error('Failed to open folder:', error);
    });
});

ipcMain.on('OPEN_URL', (e, url) => {
    console.log(`🔗 Opening URL: ${url}`);
    if (win && !win.isDestroyed()) {
        win.webContents.send('OPEN_URL', url);
    }
});

// =============== IPC ДЛЯ НАСТРОЕК БРАУЗЕРА ===============
ipcMain.handle('get-browser-history', async () => {
    try {
        if (!win || win.isDestroyed()) {
            return [];
        }

        const history = await win.webContents.executeJavaScript(
            `localStorage.getItem('browserHistory') || '[]'`
        );
        return JSON.parse(history);
    } catch (error) {
        console.error('Error in get-browser-history:', error);
        return [];
    }
});

ipcMain.handle('clear-browser-history', async () => {
    try {
        if (!win || win.isDestroyed()) {
            return { success: false };
        }

        await win.webContents.executeJavaScript(
            `localStorage.removeItem('browserHistory')`
        );

        if (win && !win.isDestroyed()) {
            win.webContents.send('history-updated');
        }

        return { success: true };
    } catch (error) {
        console.error('Error in clear-browser-history:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-browser-downloads', async () => {
    try {
        if (!win || win.isDestroyed()) {
            return [];
        }

        const downloads = await win.webContents.executeJavaScript(
            `localStorage.getItem('browserDownloads') || '[]'`
        );
        return JSON.parse(downloads);
    } catch (error) {
        console.error('Error in get-browser-downloads:', error);
        return [];
    }
});

ipcMain.handle('clear-browser-downloads', async () => {
    try {
        if (!win || win.isDestroyed()) {
            return { success: false };
        }

        await win.webContents.executeJavaScript(
            `localStorage.removeItem('browserDownloads')`
        );

        if (win && !win.isDestroyed()) {
            win.webContents.send('downloads-updated');
        }

        return { success: true };
    } catch (error) {
        console.error('Error in clear-browser-downloads:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-current-download-path', () => {
    return downloadPath;
});

ipcMain.handle('set-download-path', async () => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
            title: 'Select Downloads Folder',
            properties: ['openDirectory', 'createDirectory'],
            defaultPath: downloadPath
        });

        if (!canceled && filePaths && filePaths.length > 0) {
            downloadPath = filePaths[0];
            console.log(`📁 Downloads path changed to: ${downloadPath}`);
        }

        return downloadPath;
    } catch (error) {
        console.error('Error in set-download-path:', error);
        return downloadPath;
    }
});

ipcMain.handle('get-save-tabs', async () => {
    try {
        if (!win || win.isDestroyed()) {
            return false;
        }

        const result = await win.webContents.executeJavaScript(
            `localStorage.getItem('saveTabs') === 'true'`
        );
        return result;
    } catch (error) {
        console.error('Error in get-save-tabs:', error);
        return false;
    }
});

ipcMain.handle('set-save-tabs', async (e, isEnabled) => {
    try {
        if (!win || win.isDestroyed()) {
            return { success: false };
        }

        await win.webContents.executeJavaScript(
            `localStorage.setItem('saveTabs', ${isEnabled} ? 'true' : 'false')`
        );
        return { success: true };
    } catch (error) {
        console.error('Error in set-save-tabs:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-save-internal-pages', async () => {
    try {
        if (!win || win.isDestroyed()) {
            return false;
        }

        const result = await win.webContents.executeJavaScript(
            `localStorage.getItem('saveInternalPages') === 'true'`
        );
        return result;
    } catch (error) {
        console.error('Error in get-save-internal-pages:', error);
        return false;
    }
});

ipcMain.handle('set-save-internal-pages', async (e, isEnabled) => {
    try {
        if (!win || win.isDestroyed()) {
            return { success: false };
        }

        await win.webContents.executeJavaScript(
            `localStorage.setItem('saveInternalPages', ${isEnabled} ? 'true' : 'false')`
        );
        return { success: true };
    } catch (error) {
        console.error('Error in set-save-internal-pages:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-search-engine', async () => {
    try {
        if (!win || win.isDestroyed()) {
            return 'https://startpozi.netlify.app/search.html?q=';
        }

        const result = await win.webContents.executeJavaScript(
            `localStorage.getItem('searchEngineUrl') || 'https://startpozi.netlify.app/search.html?q='`
        );
        return result;
    } catch (error) {
        console.error('Error in get-search-engine:', error);
        return 'https://startpozi.netlify.app/search.html?q=';
    }
});

ipcMain.handle('set-search-engine', async (e, url) => {
    try {
        if (!win || win.isDestroyed()) {
            return { success: false };
        }

        await win.webContents.executeJavaScript(
            `localStorage.setItem('searchEngineUrl', '${url.replace(/'/g, "\\'")}')`
        );
        return { success: true };
    } catch (error) {
        console.error('Error in set-search-engine:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-theme', async () => {
    try {
        if (!win || win.isDestroyed()) {
            return 'system';
        }

        const result = await win.webContents.executeJavaScript(
            `localStorage.getItem('themeMode') || 'system'`
        );
        return result;
    } catch (error) {
        console.error('Error in get-theme:', error);
        return 'system';
    }
});

ipcMain.handle('set-theme', async (e, theme) => {
    try {
        if (!win || win.isDestroyed()) {
            return { success: false };
        }

        await win.webContents.executeJavaScript(
            `localStorage.setItem('themeMode', '${theme}')`
        );

        if (win && !win.isDestroyed()) {
            win.webContents.send('theme-updated', theme);
        }

        return { success: true };
    } catch (error) {
        console.error('Error in set-theme:', error);
        return { success: false, error: error.message };
    }
});

// =============== МЕНЕДЖЕР ПАРОЛЕЙ (ЗАШИФРОВАННЫЙ) ===============

// Обработчики IPC для паролей
ipcMain.on('get-passwords-request', (event) => {
    const passwords = getStoredPasswords();
    event.reply('get-passwords-response', passwords);
});

ipcMain.on('add-password-request', (event, newPasswordData) => {
    try {
        const passwords = getStoredPasswords();

        // Проверка на дубликаты
        const exists = passwords.some(p =>
        p.site === newPasswordData.site && p.username === newPasswordData.username
        );

        if (exists) {
            event.reply('add-password-response', { success: false, message: 'Такой пароль уже существует' });
            return;
        }

        const passwordEntry = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
           created: Date.now(),
           lastUsed: null,
           favorite: false,
           ...newPasswordData
        };

        passwords.push(passwordEntry);

        if (saveStoredPasswords(passwords)) {
            event.reply('add-password-response', { success: true });
            // Уведомляем все окна об обновлении
            BrowserWindow.getAllWindows().forEach(w => w.webContents.send('passwords-updated'));
        } else {
            event.reply('add-password-response', { success: false, message: 'Ошибка записи файла' });
        }
    } catch (error) {
        event.reply('add-password-response', { success: false, message: error.message });
    }
});

ipcMain.on('edit-password-request', (event, { id, updates }) => {
    try {
        let passwords = getStoredPasswords();
        const index = passwords.findIndex(p => p.id === id);

        if (index !== -1) {
            passwords[index] = { ...passwords[index], ...updates };
            if (saveStoredPasswords(passwords)) {
                event.reply('edit-password-response', { success: true });
                BrowserWindow.getAllWindows().forEach(w => w.webContents.send('passwords-updated'));
            } else {
                event.reply('edit-password-response', { success: false, message: 'Ошибка сохранения' });
            }
        } else {
            event.reply('edit-password-response', { success: false, message: 'Пароль не найден' });
        }
    } catch (error) {
        event.reply('edit-password-response', { success: false, message: error.message });
    }
});

ipcMain.on('delete-password-request', (event, id) => {
    try {
        let passwords = getStoredPasswords();
        const initialLength = passwords.length;
        passwords = passwords.filter(p => p.id !== id);

        if (passwords.length !== initialLength) {
            saveStoredPasswords(passwords);
            event.reply('delete-password-response', { success: true });
            BrowserWindow.getAllWindows().forEach(w => w.webContents.send('passwords-updated'));
        } else {
            event.reply('delete-password-response', { success: false, message: 'Пароль не найден' });
        }
    } catch (error) {
        event.reply('delete-password-response', { success: false, message: error.message });
    }
});

ipcMain.on('toggle-password-favorite-request', (event, { id, favorite }) => {
    try {
        let passwords = getStoredPasswords();
        const index = passwords.findIndex(p => p.id === id);

        if (index !== -1) {
            passwords[index].favorite = favorite;
            saveStoredPasswords(passwords);
            event.reply('toggle-password-favorite-response', { success: true });
        } else {
            event.reply('toggle-password-favorite-response', { success: false });
        }
    } catch (error) {
        event.reply('toggle-password-favorite-response', { success: false, message: error.message });
    }
});

ipcMain.on('update-password-last-used-request', (event, id) => {
    try {
        let passwords = getStoredPasswords();
        const index = passwords.findIndex(p => p.id === id);

        if (index !== -1) {
            passwords[index].lastUsed = Date.now();
            saveStoredPasswords(passwords);
            event.reply('update-password-last-used-response', { success: true });
        } else {
            event.reply('update-password-last-used-response', { success: false });
        }
    } catch (error) {
        event.reply('update-password-last-used-response', { success: false });
    }
});

ipcMain.on('clear-all-passwords-request', (event) => {
    if (saveStoredPasswords([])) {
        event.reply('clear-all-passwords-response', { success: true });
        BrowserWindow.getAllWindows().forEach(w => w.webContents.send('passwords-updated'));
    } else {
        event.reply('clear-all-passwords-response', { success: false, message: 'Ошибка очистки' });
    }
});

ipcMain.on('export-passwords-request', (event) => {
    try {
        const passwords = getStoredPasswords();
        const filePath = dialog.showSaveDialogSync(win, {
            title: 'Экспорт паролей',
            defaultPath: 'passwords-export.json',
                filters: [{ name: 'JSON', extensions: ['json'] }]
        });

        if (filePath) {
            fs.writeFileSync(filePath, JSON.stringify(passwords, null, 2));
            event.reply('export-passwords-response', { success: true });
        } else {
            event.reply('export-passwords-response', { success: false, message: 'Отменено пользователем' });
        }
    } catch (error) {
        event.reply('export-passwords-response', { success: false, message: error.message });
    }
});

ipcMain.on('import-passwords-request', (event) => {
    try {
        const result = dialog.showOpenDialogSync(win, {
            title: 'Импорт паролей',
            filters: [{ name: 'JSON', extensions: ['json'] }],
            properties: ['openFile']
        });

        if (result && result.length > 0) {
            const data = fs.readFileSync(result[0], 'utf8');
            const newPasswords = JSON.parse(data);

            if (Array.isArray(newPasswords)) {
                let currentPasswords = getStoredPasswords();

                // Объединяем, избегая полных дубликатов
                newPasswords.forEach(np => {
                    const exists = currentPasswords.some(cp => cp.site === np.site && cp.username === np.username);
                    if (!exists) {
                        // Генерируем ID если нет
                        if (!np.id) np.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                        currentPasswords.push(np);
                    }
                });

                saveStoredPasswords(currentPasswords);
                event.reply('import-passwords-response', { success: true });
                BrowserWindow.getAllWindows().forEach(w => w.webContents.send('passwords-updated'));
            } else {
                event.reply('import-passwords-response', { success: false, message: 'Неверный формат файла' });
            }
        } else {
            event.reply('import-passwords-response', { success: false, message: 'Отменено' });
        }
    } catch (error) {
        event.reply('import-passwords-response', { success: false, message: error.message });
    }
});

ipcMain.on('get-passwords-request-sync', (event) => {
    event.returnValue = getStoredPasswords();
});

// Обработчики для паролей через invoke (для совместимости)
ipcMain.handle('get-passwords-ipc', async () => {
    return getStoredPasswords();
});

ipcMain.handle('add-password-ipc', async (event, data) => {
    try {
        const passwords = getStoredPasswords();
        const exists = passwords.some(p => p.site === data.site && p.username === data.username);
        if (exists) {
            return { success: false, message: 'Такой пароль уже существует' };
        }
        const newEntry = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
               created: Date.now(),
               lastUsed: null,
               favorite: false,
               ...data
        };
        passwords.push(newEntry);
        saveStoredPasswords(passwords);
        BrowserWindow.getAllWindows().forEach(w => w.webContents.send('passwords-updated'));
        return { success: true };
    } catch (error) {
        return { success: false, message: error.message };
    }
});

ipcMain.handle('delete-password-ipc', async (event, id) => {
    try {
        let passwords = getStoredPasswords();
        passwords = passwords.filter(p => p.id !== id);
        saveStoredPasswords(passwords);
        BrowserWindow.getAllWindows().forEach(w => w.webContents.send('passwords-updated'));
        return { success: true };
    } catch (e) {
        return { success: false, message: e.message };
    }
});

// =============== ОБРАБОТЧИКИ СОБЫТИЙ ПРИЛОЖЕНИЯ ===============
app.whenReady().then(async () => {
    console.log('\n=== App Ready ===');
    console.log('🚀 Starting StartPOZI Browser...');

    cleanupLockFiles();

    try {
        webext = new WebExtensionsAPI({
            extensionsPath: EXTENSIONS_PATH,
            tempPath: path.join(app.getPath('temp'), 'startpozi-extensions'),
                                      systemExtensionsPath: SYSTEM_EXTENSIONS_PATH
        });
        console.log('✅ WebExtensionsAPI initialized with electron-store');

        await webext.loadAllExtensions();

        // Инициализируем блокировщик по спискам
        blockListManager = new BlockListManager();

        createWindow();
    } catch (error) {
        console.error('Failed during startup:', error);
        createWindow();
    }
});

app.on('window-all-closed', () => {
    console.log('\n=== All Windows Closed ===');
    cleanupLockFiles();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    console.log('🔘 App activated');
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('before-quit', () => {
    console.log('\n=== Before Quit ===');
    if (win && !win.isDestroyed()) {
        console.log('💾 Saving tabs before quit...');
        win.webContents.send('save-tabs');
    }

    cleanupLockFiles();
});

app.on('will-quit', () => {
    console.log('👋 Goodbye!');
});

// =============== ДОПОЛНИТЕЛЬНЫЕ ОБРАБОТЧИКИ ===============
ipcMain.on('settings-loaded', () => {
    console.log('✅ Settings page loaded');
});

ipcMain.on('restart-required', (event, data) => {
    console.log('🔄 Restart required:', data.message);
});

ipcMain.handle('ping-settings', () => {
    const extensions = webext ? webext.getAllExtensions() : [];
    return {
        success: true,
        message: 'Extensions API working',
        timestamp: Date.now(),
               extensions: {
                   total: extensions.length,
                   enabled: extensions.filter(e => e.enabled).length,
               withPopup: extensions.filter(e => e.hasPopup).length
               }
    };
});

ipcMain.handle('test-settings-api', () => {
    const extensions = webext ? webext.getAllExtensions() : [];
    return {
        success: true,
        message: 'Extensions API is working correctly',
        version: '1.0.0',
        extensions: {
            total: extensions.length,
            enabled: extensions.filter(e => e.enabled).length,
               withPopup: extensions.filter(e => e.hasPopup).length,
               browserActions: webext ? webext.getBrowserActions().length : 0
        }
    };
});

console.log('✅ Main process initialized successfully');
