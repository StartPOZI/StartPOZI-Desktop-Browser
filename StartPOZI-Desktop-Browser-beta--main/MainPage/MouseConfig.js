// script.js - Защита от просмотра исходного кода
(function() {
    'use strict';

    // === КОНФИГУРАЦИЯ ===
    const CONFIG = {
        disableDevTools: true,       // Блокировать инструменты разработчика
        disableRightClick: true,     // Блокировать правую кнопку мыши
        disableCopy: false,           // Блокировать копирование
        disableSelect: true,         // Блокировать выделение текста
        disableShortcuts: true,      // Блокировать горячие клавиши
        showWarning: true,           // Показывать предупреждения
        redirectOnDevTools: false,   // Перенаправлять при открытии DevTools
        redirectUrl: 'about:blank',  // Куда перенаправлять
        debugMode: false             // Режим отладки (true для тестирования)
    };

    // === ЛОГИРОВАНИЕ ===
    function log(message) {
        if (CONFIG.debugMode) {
            console.log('[Protection]', message);
        }
    }

    // === ОСНОВНАЯ ЗАЩИТА ===
    class CodeProtection {
        constructor() {
            this.isDevToolsOpen = false;
            this.init();
        }

        init() {
            log('Инициализация защиты');

            // Защита от открытия DevTools
            if (CONFIG.disableDevTools) {
                this.protectDevTools();
            }

            // Защита от правого клика
            if (CONFIG.disableRightClick) {
                this.disableRightClick();
            }

            // Защита от копирования
            if (CONFIG.disableCopy) {
                this.disableCopy();
            }

            // Защита от выделения
            if (CONFIG.disableSelect) {
                this.disableSelection();
            }

            // Защита от горячих клавиш
            if (CONFIG.disableShortcuts) {
                this.disableShortcuts();
            }

            // Обфускация функций
            this.obfuscateFunctions();

            // Защита от инспектирования элементов
            this.protectInspection();

            log('Защита активирована');
        }

        // === МЕТОДЫ ЗАЩИТЫ ===

        // 1. Защита от открытия DevTools
        protectDevTools() {
            // Метод 1: Проверка размера окна
            const devToolsCheck = () => {
                const threshold = 160;
                const widthThreshold = window.outerWidth - window.innerWidth > threshold;
                const heightThreshold = window.outerHeight - window.innerHeight > threshold;

                if (widthThreshold || heightThreshold) {
                    this.handleDevToolsDetected();
                }
            };

            // Метод 2: Проверка времени выполнения
            const debuggerCheck = () => {
                const start = Date.now();
                debugger;
                const end = Date.now();

                if (end - start > 100) {
                    this.handleDevToolsDetected();
                }
            };

            // Метод 3: Проверка console методов
            const consoleCheck = () => {
                const element = new Image();
                Object.defineProperty(element, 'id', {
                    get: () => {
                        this.handleDevToolsDetected();
                        return '';
                    }
                });
                console.log(element);
            };

            // Запуск проверок
            window.addEventListener('resize', devToolsCheck);

            // Периодические проверки
            setInterval(() => {
                if (!this.isDevToolsOpen) {
                    try {
                        debuggerCheck();
                        // consoleCheck(); // Может вызывать ошибки в некоторых браузерах
                    } catch(e) {}
                }
            }, 1000);

            // Защита от отладки
            const antiDebug = () => {
                setInterval(() => {
                    (function() {
                        return false;
                    }['constructor']('debugger')['call']());
                }, 5000);
            };

            // Запускаем защиту от отладки
            setTimeout(antiDebug, 2000);
        }

        // 2. Блокировка правой кнопки мыши
        disableRightClick() {
            document.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                if (CONFIG.showWarning) {
                    this.showWarning('Правый клик отключен');
                }
                return false;
            });

            // Также блокируем выделение через правую кнопку
            document.addEventListener('mousedown', (e) => {
                if (e.button === 2) {
                    e.preventDefault();
                    return false;
                }
            });
        }

        // 3. Блокировка копирования
        disableCopy() {
            document.addEventListener('copy', (e) => {
                e.preventDefault();
                if (CONFIG.showWarning) {
                    this.showWarning('Копирование отключено');
                }
                return false;
            });

            document.addEventListener('cut', (e) => {
                e.preventDefault();
                if (CONFIG.showWarning) {
                    this.showWarning('Вырезание отключено');
                }
                return false;
            });

            document.addEventListener('paste', (e) => {
                e.preventDefault();
                if (CONFIG.showWarning) {
                    this.showWarning('Вставка отключена');
                }
                return false;
            });
        }

        // 4. Блокировка выделения текста
        disableSelection() {
            // CSS для отключения выделения
            const style = document.createElement('style');
            style.textContent = `
            * {
                -webkit-user-select: none !important;
                -moz-user-select: none !important;
                -ms-user-select: none !important;
                user-select: none !important;
            }

            input, textarea, [contenteditable="true"] {
                -webkit-user-select: text !important;
                -moz-user-select: text !important;
                -ms-user-select: text !important;
                user-select: text !important;
            }
            `;
            document.head.appendChild(style);

            // JavaScript fallback
            document.addEventListener('selectstart', (e) => {
                e.preventDefault();
                return false;
            });

            document.addEventListener('mousedown', (e) => {
                if (e.detail > 1) { // Двойной клик
                    e.preventDefault();
                }
            });
        }

        // 5. Блокировка горячих клавиш
        disableShortcuts() {
            const blockedKeys = new Set([
                'F12',                     // DevTools
                'F11',                     // Полный экран
                'F5', 'Ctrl+R', 'Cmd+R',   // Обновление
                'Ctrl+Shift+I', 'Cmd+Opt+I', // DevTools
                'Ctrl+Shift+J', 'Cmd+Opt+J', // Console
                'Ctrl+Shift+C', 'Cmd+Shift+C', // Инспектор
                'Ctrl+U', 'Cmd+Opt+U',     // Просмотр исходного кода
                'Ctrl+S', 'Cmd+S',         // Сохранение
                'Ctrl+P', 'Cmd+P',         // Печать
                'Ctrl+Shift+P', 'Cmd+Shift+P' // Командная панель
            ]);

            document.addEventListener('keydown', (e) => {
                const key = e.key;
                const code = e.code;
                const ctrl = e.ctrlKey || e.metaKey;
                const shift = e.shiftKey;
                const alt = e.altKey;

                // Собираем комбинацию клавиш
                let combo = [];
                if (ctrl) combo.push('Ctrl');
                if (shift) combo.push('Shift');
                if (alt) combo.push('Alt');
                combo.push(key);
                const comboStr = combo.join('+');

                // Проверяем заблокированные комбинации
                if (blockedKeys.has(key) ||
                    blockedKeys.has(comboStr) ||
                    blockedKeys.has(code)) {

                    e.preventDefault();
                e.stopPropagation();

                if (CONFIG.showWarning) {
                    this.showWarning(`Комбинация клавиш ${comboStr} заблокирована`);
                }

                // Специальная обработка для F12
                if (key === 'F12' || code === 'F12') {
                    this.handleDevToolsDetected();
                }

                return false;
                    }

                    // Блокировка открытия DevTools через меню браузера
                    if (ctrl && shift && (key === 'I' || key === 'J' || key === 'C')) {
                        e.preventDefault();
                        this.handleDevToolsDetected();
                        return false;
                    }
            }, true);

            // Блокировка меню браузера через Alt
            document.addEventListener('keydown', (e) => {
                if (e.altKey) {
                    e.preventDefault();
                    return false;
                }
            });
        }

        // 6. Обфускация функций
        obfuscateFunctions() {
            // Переименовываем функции
            const originalFunctions = {};

            // Сохраняем оригинальные функции
            ['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
                originalFunctions[method] = console[method];
            });

            // Подменяем console.log
            console.log = function(...args) {
                if (CONFIG.debugMode) {
                    originalFunctions.log.call(console, ...args);
                } else {
                    // Можно оставить пустым или выводить ложные данные
                    originalFunctions.log.call(console, '[Защищено]');
                }
            };

            // Подменяем другие методы console
            console.warn = function(...args) {
                originalFunctions.warn.call(console, '[Защищено]');
            };

            console.error = function(...args) {
                originalFunctions.error.call(console, '[Защищено]');
            };

            // Защита от JSON.stringify
            const originalStringify = JSON.stringify;
            JSON.stringify = function(obj) {
                if (typeof obj === 'function') {
                    return '[Function]';
                }
                return originalStringify.call(this, obj);
            };

            // Скрываем свойства объектов
            Object.defineProperty(window, 'protection', {
                value: this,
                writable: false,
                configurable: false,
                enumerable: false
            });
        }

        // 7. Защита от инспектирования элементов
        protectInspection() {
            // Скрываем элементы при попытке инспектирования
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes') {
                        // Если элемент пытаются изменить через DevTools
                        const target = mutation.target;
                        if (target.hasAttribute('__devtools')) {
                            target.remove();
                            this.showWarning('Инспектирование элементов заблокировано');
                        }
                    }
                });
            });

            observer.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['__devtools', 'style', 'class']
            });

            // Защита от изменения DOM через DevTools
            document.addEventListener('DOMNodeInserted', (e) => {
                if (e.target && e.target.nodeType === 1) {
                    const elem = e.target;
                    if (elem.hasAttribute && elem.hasAttribute('__devtools_injected')) {
                        elem.remove();
                    }
                }
            }, true);
        }

        // === ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ===

        handleDevToolsDetected() {
            if (this.isDevToolsOpen) return;

            this.isDevToolsOpen = true;
            log('Обнаружены инструменты разработчика');

            if (CONFIG.showWarning) {
                this.showWarning('Инструменты разработчика заблокированы');
            }

            if (CONFIG.redirectOnDevTools) {
                setTimeout(() => {
                    window.location.href = CONFIG.redirectUrl;
                }, 1000);
            }

            // Аварийные меры
            this.triggerEmergencyMeasures();
        }

        triggerEmergencyMeasures() {
            // Скрываем чувствительные данные
            const sensitiveElements = document.querySelectorAll('[data-sensitive], input[type="password"], .secret, [class*="token"], [class*="key"], [class*="secret"]');

            sensitiveElements.forEach(el => {
                if (el.type === 'password') {
                    el.type = 'text';
                    el.value = '********';
                } else if (el.textContent) {
                    const original = el.textContent;
                    el.setAttribute('data-original', original);
                    el.textContent = '*** ЗАЩИЩЕНО ***';
                }
            });

            // Добавляем защитный слой
            const overlay = document.createElement('div');
            overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.8);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            font-size: 24px;
            text-align: center;
            backdrop-filter: blur(10px);
            `;
            overlay.innerHTML = `
            <div>
            <h1>⚠️ ДОСТУП ЗАБЛОКИРОВАН</h1>
            <p>Инструменты разработчика отключены</p>
            <small>Попытка доступа к исходному коду зафиксирована</small>
            </div>
            `;

            // Добавляем слой только если установлена опция
            if (CONFIG.showWarning) {
                document.body.appendChild(overlay);

                // Убираем через 3 секунды
                setTimeout(() => {
                    if (overlay.parentNode) {
                        overlay.style.opacity = '0';
                        overlay.style.transition = 'opacity 1s';
                        setTimeout(() => {
                            if (overlay.parentNode) {
                                overlay.remove();
                            }
                        }, 1000);
                    }
                }, 3000);
            }
        }

        showWarning(message) {
            if (!CONFIG.showWarning) return;

            const warning = document.createElement('div');
            warning.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4444;
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 10000;
            font-family: Arial, sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            animation: slideIn 0.3s ease;
            `;

            // Добавляем CSS анимацию
            const style = document.createElement('style');
            style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            `;
            document.head.appendChild(style);

            warning.textContent = `⚠️ ${message}`;
            document.body.appendChild(warning);

            // Убираем предупреждение через 3 секунды
            setTimeout(() => {
                if (warning.parentNode) {
                    warning.style.opacity = '0';
                    warning.style.transition = 'opacity 0.5s';
                    setTimeout(() => {
                        if (warning.parentNode) {
                            warning.remove();
                        }
                    }, 500);
                }
            }, 3000);
        }
    }

    // === ЗАПУСК ЗАЩИТЫ ===

    // Ждем загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new CodeProtection();
        });
    } else {
        new CodeProtection();
    }

    // Защита от повторного включения
    window.__PROTECTION_ACTIVE__ = true;

    // Экспорт для ручного управления (опционально)
    window.CodeProtector = {
        disable: () => {
            CONFIG.disableDevTools = false;
            CONFIG.disableRightClick = false;
            CONFIG.disableCopy = false;
            CONFIG.disableSelect = false;
            CONFIG.disableShortcuts = false;
            CONFIG.showWarning = false;
            log('Защита отключена вручную');
        },

        enable: () => {
            CONFIG.disableDevTools = true;
            CONFIG.disableRightClick = true;
            CONFIG.disableCopy = true;
            CONFIG.disableSelect = true;
            CONFIG.disableShortcuts = true;
            CONFIG.showWarning = true;
            log('Защита включена вручную');
        },

        config: CONFIG
    };

    // Защита от удаления защиты
    Object.freeze(window.CodeProtector);
    Object.seal(CONFIG);

})();

// === ДОПОЛНИТЕЛЬНЫЕ МЕРЫ ЗАЩИТЫ ===

// Защита от iframe встраивания
if (window.top !== window.self) {
    window.top.location = window.self.location;
}

// Скрытие исходного кода в панели навигации
document.documentElement.setAttribute('data-protected', 'true');

// Защита от сохранения страницы
window.addEventListener('beforeunload', function(e) {
    // Можно добавить подтверждение при выходе
    // e.preventDefault();
    // e.returnValue = '';
});

// Защита от кэширования (опционально)
if (window.history && window.history.pushState) {
    window.history.pushState(null, null, window.location.href);
    window.addEventListener('popstate', function() {
        window.history.pushState(null, null, window.location.href);
    });
}

// Защита от обратного инжиниринга
const antiTamper = () => {
    const scripts = document.querySelectorAll('script');
    scripts.forEach(script => {
        if (script.src) {
            // Запрещаем загрузку внешних скриптов после защиты
            const observer = new MutationObserver(() => {
                if (script.parentNode) {
                    script.remove();
                }
            });
            observer.observe(script, { attributes: true });
        }
    });
};

// Запускаем защиту от изменений
setTimeout(antiTamper, 1000);
