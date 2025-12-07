// preload.js
// Этот скрипт выполняется в контексте webview перед загрузкой страницы

// Создаем API для связи между страницей и браузером
window.electronAPI = {
    openSite: (url) => {
        // Используем window.postMessage для безопасной коммуникации
        window.postMessage({ type: 'OPEN_SITE', url: url }, '*');
    },
    goHome: () => {
        window.postMessage({ type: 'GO_HOME' }, '*');
    },
    getAppInfo: () => {
        return {
            name: 'StartPOZI Browser',
            version: '1.0.0',
            platform: process.platform
        };
    }
};

// Слушаем сообщения от страницы
window.addEventListener('message', (event) => {
    // Можно добавить дополнительную обработку сообщений здесь
    if (event.data && event.data.type) {
        console.log('Message from page:', event.data);
    }
});
