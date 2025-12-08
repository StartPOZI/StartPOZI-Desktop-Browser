const { ipcRenderer } = require('electron');

// Ловим все клики по плиткам и ссылкам
window.addEventListener('message', e => {
    if (e.data?.type === 'OPEN_LINK') {
        ipcRenderer.send('OPEN_URL', e.data.url);
    }
});

// Перехватываем window.open и ссылки _blank для обычных сайтов
window.open = (url, name, features) => {
    if (url && !url.startsWith('javascript:')) {
        ipcRenderer.send('OPEN_URL', url);
        return null;
    }
    return null;
};
