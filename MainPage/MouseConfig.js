// MouseConfig.js - Source code viewing protection (right-click not blocked)
(function() {
    'use strict';

    const CONFIG = {
        disableDevTools: false,
        disableRightClick: false,
        disableCopy: false,
        disableSelect: true,
        disableShortcuts: false,
        showWarning: false,
        redirectOnDevTools: false,
        redirectUrl: 'about:blank',
        debugMode: true
    };

    function log(message) {
        if (CONFIG.debugMode) console.log('[Protection]', message);
    }

    class CodeProtection {
        constructor() {
            this.isDevToolsOpen = false;
            this.init();
        }

        init() {
            log('Initializing protection');
            if (CONFIG.disableDevTools) this.protectDevTools();
            if (CONFIG.disableRightClick) this.disableRightClick();
            if (CONFIG.disableCopy) this.disableCopy();
            if (CONFIG.disableSelect) this.disableSelection();
            if (CONFIG.disableShortcuts) this.disableShortcuts();
            this.obfuscateFunctions();
            this.protectInspection();
            log('Protection activated');
        }

        protectDevTools() {
            const devToolsCheck = () => {
                const threshold = 160;
                const widthThreshold = window.outerWidth - window.innerWidth > threshold;
                const heightThreshold = window.outerHeight - window.innerHeight > threshold;
                if (widthThreshold || heightThreshold) this.handleDevToolsDetected();
            };
                const debuggerCheck = () => {
                    const start = Date.now();
                    debugger;
                    if (Date.now() - start > 100) this.handleDevToolsDetected();
                };
                    window.addEventListener('resize', devToolsCheck);
                    setInterval(() => {
                        if (!this.isDevToolsOpen) try { debuggerCheck(); } catch(e) {}
                    }, 1000);
                    setTimeout(() => {
                        setInterval(() => { (function() { return false; }['constructor']('debugger')['call']()); }, 5000);
                    }, 2000);
        }

        disableRightClick() {}

        disableCopy() {
            document.addEventListener('copy', e => e.preventDefault());
            document.addEventListener('cut', e => e.preventDefault());
            document.addEventListener('paste', e => e.preventDefault());
        }

        disableSelection() {
            const style = document.createElement('style');
            style.textContent = `*{user-select:none !important;} input,textarea{user-select:text !important;}`;
            document.head.appendChild(style);
            document.addEventListener('selectstart', e => e.preventDefault());
            document.addEventListener('mousedown', e => { if (e.detail > 1) e.preventDefault(); });
        }

        disableShortcuts() {
            const blockedKeys = new Set(['F12','F11','F5','Ctrl+R','Cmd+R','Ctrl+Shift+I','Cmd+Opt+I','Ctrl+Shift+J','Cmd+Opt+J','Ctrl+Shift+C','Cmd+Shift+C','Ctrl+U','Cmd+Opt+U','Ctrl+S','Cmd+S','Ctrl+P','Cmd+P','Ctrl+Shift+P','Cmd+Shift+P']);
            document.addEventListener('keydown', (e) => {
                const key = e.key;
                const code = e.code;
                const ctrl = e.ctrlKey || e.metaKey;
                const shift = e.shiftKey;
                const alt = e.altKey;
                let combo = [];
                if (ctrl) combo.push('Ctrl');
                if (shift) combo.push('Shift');
                if (alt) combo.push('Alt');
                combo.push(key);
                const comboStr = combo.join('+');
                if (blockedKeys.has(key) || blockedKeys.has(comboStr) || blockedKeys.has(code)) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (CONFIG.showWarning) this.showWarning(`Keyboard shortcut ${comboStr} is blocked`);
                    if (key === 'F12' || code === 'F12') this.handleDevToolsDetected();
                    return false;
                }
                if (ctrl && shift && (key === 'I' || key === 'J' || key === 'C')) {
                    e.preventDefault();
                    this.handleDevToolsDetected();
                    return false;
                }
            }, true);
            document.addEventListener('keydown', (e) => { if (e.altKey) { e.preventDefault(); return false; } });
        }

        obfuscateFunctions() {
            const original = {};
            ['log','warn','error','info','debug'].forEach(m => original[m] = console[m]);
            console.log = function(...args) { if (CONFIG.debugMode) original.log.call(console, ...args); else original.log.call(console, '[Protected]'); };
            console.warn = function(...args) { original.warn.call(console, '[Protected]'); };
            console.error = function(...args) { original.error.call(console, '[Protected]'); };
            const origStringify = JSON.stringify;
            JSON.stringify = function(obj) { return typeof obj === 'function' ? '[Function]' : origStringify.call(this, obj); };
            Object.defineProperty(window, 'protection', { value: this, writable: false, configurable: false, enumerable: false });
        }

        protectInspection() {
            const observer = new MutationObserver(mutations => {
                mutations.forEach(m => {
                    if (m.type === 'attributes') {
                        const target = m.target;
                        if (target.hasAttribute('__devtools')) { target.remove(); this.showWarning('Element inspection is blocked'); }
                    }
                });
            });
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['__devtools', 'style', 'class'] });
            document.addEventListener('DOMNodeInserted', (e) => {
                if (e.target && e.target.nodeType === 1 && e.target.hasAttribute && e.target.hasAttribute('__devtools_injected')) e.target.remove();
            }, true);
        }

        handleDevToolsDetected() {
            if (this.isDevToolsOpen) return;
            this.isDevToolsOpen = true;
            log('Developer tools detected');
            if (CONFIG.showWarning) this.showWarning('Developer tools are blocked');
            if (CONFIG.redirectOnDevTools) setTimeout(() => window.location.href = CONFIG.redirectUrl, 1000);
            this.triggerEmergencyMeasures();
        }

        triggerEmergencyMeasures() {
            const sensitive = document.querySelectorAll('[data-sensitive], input[type="password"], .secret, [class*="token"], [class*="key"], [class*="secret"]');
            sensitive.forEach(el => {
                if (el.type === 'password') { el.type = 'text'; el.value = '********'; }
                else if (el.textContent) { el.setAttribute('data-original', el.textContent); el.textContent = '*** PROTECTED ***'; }
            });
            if (CONFIG.showWarning) {
                const overlay = document.createElement('div');
                overlay.style.cssText = `position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8); color:white; display:flex; align-items:center; justify-content:center; z-index:999999; font-size:24px; text-align:center; backdrop-filter:blur(10px);`;
                overlay.innerHTML = `<div><h1>⚠️ ACCESS BLOCKED</h1><p>Developer tools are disabled</p><small>An attempt to access the source code has been recorded</small></div>`;
                document.body.appendChild(overlay);
                setTimeout(() => { overlay.style.opacity = '0'; overlay.style.transition = 'opacity 1s'; setTimeout(() => overlay.remove(), 1000); }, 3000);
            }
        }

        showWarning(message) {
            if (!CONFIG.showWarning) return;
            const warning = document.createElement('div');
            warning.style.cssText = `position:fixed; top:20px; right:20px; background:#ff4444; color:white; padding:10px 20px; border-radius:5px; z-index:10000; font-family:Arial,sans-serif; font-size:14px; box-shadow:0 4px 6px rgba(0,0,0,0.1); animation:slideIn 0.3s ease;`;
            const style = document.createElement('style');
            style.textContent = `@keyframes slideIn{ from{ transform: translateX(100%); opacity: 0; } to{ transform: translateX(0); opacity: 1; } }`;
            document.head.appendChild(style);
            warning.textContent = `⚠️ ${message}`;
            document.body.appendChild(warning);
            setTimeout(() => { warning.style.opacity = '0'; warning.style.transition = 'opacity 0.5s'; setTimeout(() => warning.remove(), 500); }, 3000);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => new CodeProtection());
    else new CodeProtection();

    window.__PROTECTION_ACTIVE__ = true;
    window.CodeProtector = {
        disable: () => { CONFIG.disableRightClick = false; },
 enable: () => { CONFIG.disableRightClick = true; },
 config: CONFIG
    };
    Object.freeze(window.CodeProtector);
    Object.seal(CONFIG);
})();

if (window.top !== window.self) window.top.location = window.self.location;
document.documentElement.setAttribute('data-protected', 'true');
if (window.history && window.history.pushState) {
    window.history.pushState(null, null, window.location.href);
    window.addEventListener('popstate', () => window.history.pushState(null, null, window.location.href));
}
