const { ipcRenderer } = require('electron');

// Перехватываем клики по ссылкам на стартовой странице
window.addEventListener('message', event => {
    if (event.data?.type === 'OPEN_LINK') {
        ipcRenderer.send('OPEN_URL', event.data.url);
    }
});

// Перехват window.open (на всякий случай)
window.open = function(url) {
    if (url && !url.startsWith('javascript:')) {
        ipcRenderer.send('OPEN_URL', url);
    }
    return null;
};
