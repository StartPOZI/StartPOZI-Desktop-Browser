// =============== MINIMAL PRELOAD SCRIPT FOR QR SCANNERS ===============
console.log('✅ Preload script начал выполнение');

const { ipcRenderer, contextBridge } = require('electron');

// 1. Сначала проверяем базовую функциональность
window.electronTest = {
    test: () => console.log('Electron API работает!'),
    ping: () => ipcRenderer.send('test-ping')
};

// 2. Минимальный QRAutoScanner (упрощенная версия)
class SimpleQRScanner {
    constructor() {
        this.isActive = false;
        console.log('SimpleQRScanner создан');
    }

    start() {
        this.isActive = true;
        console.log('SimpleQRScanner запущен');
        return { success: true };
    }

    getStats() {
        return { isActive: this.isActive, test: 'simple' };
    }
}

// 3. Экспортируем через contextBridge (современный способ)
try {
    contextBridge.exposeInMainWorld('qrScannerAPI', {
        createScanner: () => new SimpleQRScanner(),
                                    test: () => 'API доступен',
                                    // Для совместимости со старым кодом
                                    scanner: new SimpleQRScanner()
    });

    // Также экспортируем глобально для обратной совместимости
    window.SimpleQRScanner = SimpleQRScanner;
    window.simpleScanner = new SimpleQRScanner();

    console.log('✅ ContextBridge настроен');
} catch (error) {
    console.error('Ошибка ContextBridge:', error);
}

// 4. Загружаем jsQR если нет встроенного
if (typeof window.jsQR === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/jsqr@latest/dist/jsQR.min.js';
    script.onload = () => console.log('jsQR загружен');
    script.onerror = (e) => console.error('Ошибка загрузки jsQR:', e);
    document.head.appendChild(script);
}

console.log('✅ Preload script готов');
