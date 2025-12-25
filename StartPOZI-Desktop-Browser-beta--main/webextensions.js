// webextensions.js
const fs = require('fs');
const path = require('path');

class WebExtensionsAPI {
    constructor() {
        this.extensions = new Map();
        this.contentScripts = new Map();
        console.log('WebExtensionsAPI initialized');
    }

    // Зарегистрировать расширение
    registerExtension(extensionPath, manifest) {
        const extensionId = this.generateExtensionId(manifest.name);

        console.log(`Registering extension: ${manifest.name} from ${extensionPath}`);

        this.extensions.set(extensionId, {
            id: extensionId,
            path: extensionPath,
            manifest,
            enabled: true
        });

        // Загружаем content scripts
        this.loadContentScripts(extensionId, manifest);

        return extensionId;
    }

    generateExtensionId(name) {
        return (name || 'extension').toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .substring(0, 30) + '_' + Date.now().toString(36);
    }

    loadContentScripts(extensionId, manifest) {
        if (!manifest.content_scripts) {
            console.log(`No content scripts for ${extensionId}`);
            return;
        }

        const scripts = [];
        const extension = this.extensions.get(extensionId);

        console.log(`Loading content scripts for ${extensionId}: ${manifest.content_scripts.length} script(s)`);

        manifest.content_scripts.forEach(script => {
            script.js?.forEach(js => {
                const scriptPath = path.join(extension.path, js);
                if (fs.existsSync(scriptPath)) {
                    try {
                        const content = fs.readFileSync(scriptPath, 'utf8');
                        scripts.push({
                            matches: script.matches || ['<all_urls>'],
                            js: scriptPath,
                            runAt: script.run_at || 'document_idle',
                            content: content
                        });
                        console.log(`✓ Content script loaded: ${js}`);
                        console.log(`  Matches: ${script.matches ? script.matches.join(', ') : '<all_urls>'}`);
                        console.log(`  Run at: ${script.run_at || 'document_idle'}`);
                    } catch (e) {
                        console.error(`✗ Error reading script ${scriptPath}:`, e.message);
                    }
                } else {
                    console.log(`✗ Content script not found: ${scriptPath}`);
                }
            });
        });

        this.contentScripts.set(extensionId, scripts);
        console.log(`Total scripts for ${extensionId}: ${scripts.length}`);
    }

    // Внедрить content scripts
    injectContentScripts(webContents, url) {
        console.log(`\n=== Checking content scripts for URL: ${url} ===`);

        this.extensions.forEach((extension, extensionId) => {
            if (!extension.enabled) {
                console.log(`Extension ${extensionId} is disabled, skipping`);
                return;
            }

            const scripts = this.contentScripts.get(extensionId);
            if (!scripts || scripts.length === 0) {
                console.log(`No content scripts for ${extensionId}`);
                return;
            }

            console.log(`Checking ${scripts.length} scripts from ${extension.manifest.name}`);

            scripts.forEach(script => {
                // Проверяем matches
                let matches = false;

                if (!script.matches || script.matches.length === 0) {
                    matches = true; // Матчится со всеми URL если matches не указан
                } else {
                    matches = script.matches.some(pattern => {
                        try {
                            // Конвертируем паттерн в regex
                            let regexPattern = pattern;

                            // Заменяем специальные символы
                            regexPattern = regexPattern
                            .replace(/\*/g, '.*')      // * -> .*
                            .replace(/\./g, '\\.')     // . -> \.
                            .replace(/\?/g, '\\?')     // ? -> \?
                            .replace(/\//g, '\\/');    // / -> \/

                            // Убедимся что начинается с начала
                            if (!regexPattern.startsWith('^')) {
                                regexPattern = '^' + regexPattern;
                            }

                            // Убедимся что заканчивается концом
                            if (!regexPattern.endsWith('$')) {
                                regexPattern = regexPattern + '$';
                            }

                            const regex = new RegExp(regexPattern);
                            const result = regex.test(url);

                            if (result) {
                                console.log(`✓ Pattern "${pattern}" matches URL "${url}"`);
                            }

                            return result;
                        } catch (e) {
                            console.error(`Error matching pattern "${pattern}":`, e.message);
                            return false;
                        }
                    });
                }

                if (matches) {
                    console.log(`📝 Injecting script from ${path.basename(script.js)} into ${url}`);

                    // Внедряем скрипт с правильной задержкой
                    const injectScript = () => {
                        webContents.executeJavaScript(script.content)
                        .then(() => {
                            console.log(`✅ Script injected successfully: ${path.basename(script.js)}`);
                        })
                        .catch(err => {
                            console.error(`❌ Error injecting script ${path.basename(script.js)}:`, err.message);
                        });
                    };

                    if (script.runAt === 'document_start') {
                        injectScript();
                    } else if (script.runAt === 'document_end') {
                        // Внедряем сразу после загрузки DOM
                        injectScript();
                    } else if (script.runAt === 'document_idle') {
                        // Ждем 100ms для "idle" состояния
                        setTimeout(injectScript, 100);
                    } else {
                        // По умолчанию document_idle
                        setTimeout(injectScript, 100);
                    }
                } else {
                    console.log(`✗ Script ${path.basename(script.js)} doesn't match URL ${url}`);
                }
            });
        });

        console.log('=== Content script injection check completed ===\n');
    }
}

module.exports = WebExtensionsAPI;
