// renderer.js — Финальная версия декабрь 2025 (Firefox-style подсветка)
const { ipcRenderer } = require('electron');
const path = require('path');

const START_PAGE = `file://${path.join(__dirname, 'MainPage', 'index.html')}`;
const SETTINGS_PAGE = `file://${path.join(__dirname, 'Settings.html')}`;

let tabs = [];
let views = [];
let active = 0;

// Глобальные переменные для элементов UI
let tabsBar, tabsArea, addressBar, addTabBtn, downloadsBtn, downloadsIcon;

let currentSearchEngine = localStorage.getItem('searchEngineUrl') || 'https://startpozi.netlify.app/search.html?q=';

let downloads = JSON.parse(localStorage.getItem('browserDownloads') || '[]');
let sessionDownloads = [];
let ongoingDownloads = new Map();

let activeDownloads = 0;
let downloadUpdateInterval = null;
let hasNewDownloads = false; // Флаг для отслеживания новых загрузок

document.addEventListener('DOMContentLoaded', () => {
  tabsBar    = document.getElementById('tabsContainerTabs');
  tabsArea   = document.getElementById('tabsContainer');
  addressBar = document.getElementById('searchInput');
  addTabBtn  = document.getElementById('addTab');

  downloadsBtn = document.getElementById('downloadsBtn');
  downloadsIcon = document.getElementById('downloadIcon');

  document.getElementById('min-btn').onclick   = () => ipcRenderer.send('minimize');
  document.getElementById('max-btn').onclick   = () => ipcRenderer.send('maximize');
  document.getElementById('close-btn').onclick = () => ipcRenderer.send('close');

  document.getElementById('back').onclick     = () => goBack();
  document.getElementById('forward').onclick  = () => goForward();
  document.getElementById('refresh').onclick  = () => reload();

  addTabBtn.onclick = () => createTab();

  const menuBtn = document.getElementById('menuBtn');
  const dropdown = document.getElementById('dropdown');

  menuBtn.onclick = () => {
    dropdown.classList.toggle('show');
    document.getElementById('downloadsDropdown').classList.remove('show');
  };

  document.addEventListener('click', e => {
    if (!menuBtn.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('show');
    }
  });

  dropdown.querySelectorAll('.menu-item').forEach(item => {
    item.onclick = () => {
      dropdown.classList.remove('show');
      const a = item.dataset.action;
      if (a === 'settings') createTab(SETTINGS_PAGE);
      if (a === 'bookmarks') showBookmarks();
      if (a === 'downloads') {
        resetDownloadIcon();
        showDownloads();
      }
      if (a === 'history')   showHistory();
      if (a === 'about')     showAbout();
    };
  });

  // Downloads dropdown
  const downloadsDropdown = document.getElementById('downloadsDropdown');
  const downloadsListDropdown = document.getElementById('downloadsListDropdown');
  const showAllDownloads = document.getElementById('showAllDownloads');

  downloadsBtn.onclick = (e) => {
    e.stopPropagation();
    resetDownloadIcon();
    updateDownloadsDropdown();
    downloadsDropdown.classList.toggle('show');
    dropdown.classList.remove('show');
  };

  document.addEventListener('click', e => {
    if (!downloadsBtn.contains(e.target) && !downloadsDropdown.contains(e.target)) {
      downloadsDropdown.classList.remove('show');
    }
  });

  showAllDownloads.onclick = () => {
    downloadsDropdown.classList.remove('show');
    resetDownloadIcon();
    showDownloads();
  };

  createTab();
  loadTheme();

  addressBar.focus();
  addressBar.select();

  addressBar.addEventListener('click', () => {
    addressBar.focus();
    addressBar.select();
  });

  addressBar.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      let val = addressBar.value.trim();
      if (!val) return;

      let targetUrl;
      if (!val.includes('.') && !val.includes('://')) {
        targetUrl = currentSearchEngine + encodeURIComponent(val);
      } else if (!val.startsWith('http://') && !val.startsWith('https://')) {
        targetUrl = 'https://' + val;
      } else {
        targetUrl = val;
      }

      const currentWebview = views[active]?.querySelector('webview');
      if (currentWebview) {
        currentWebview.loadURL(targetUrl);
        currentWebview.focus();
      }
    }
  });

  // Инициализация состояния иконки
  updateDownloadIconState();

  // Запускаем интервал для обновления прогресса
  if (!downloadUpdateInterval) {
    downloadUpdateInterval = setInterval(() => {
      if (activeDownloads > 0) {
        updateDownloadsProgress();
      }
    }, 1000);
  }
});

ipcRenderer.on('OPEN_URL', (e, url) => {
  if (url && url !== 'about:blank') createTab(url);
});

// Обработчик для начала загрузки
ipcRenderer.on('download-started', (e, { id, filename, totalBytes }) => {
  ongoingDownloads.set(id, {
    filename,
    progress: 0,
    totalBytes: totalBytes || 0,
    receivedBytes: 0,
    state: 'progressing',
    time: Date.now(),
                       lastUpdate: Date.now(),
                       speed: 0,
                       eta: 0
  });
  activeDownloads++;
  updateDownloadIconState();
  updateDownloadsDropdown();
});

// Обработчик прогресса
ipcRenderer.on('download-progress', (e, { id, receivedBytes, totalBytes }) => {
  const download = ongoingDownloads.get(id);
  if (download) {
    const now = Date.now();
    const timeDiff = (now - download.lastUpdate) / 1000;

    if (timeDiff > 0 && receivedBytes > download.receivedBytes) {
      const bytesDiff = receivedBytes - download.receivedBytes;
      download.speed = bytesDiff / timeDiff;

      if (download.speed > 0 && totalBytes > 0) {
        const remainingBytes = totalBytes - receivedBytes;
        download.eta = remainingBytes / download.speed;
      }
    }

    download.receivedBytes = receivedBytes;
    download.totalBytes = totalBytes;
    download.progress = totalBytes > 0 ? (receivedBytes / totalBytes) * 100 : 0;
    download.lastUpdate = now;
    download.state = 'progressing';
  }
});

// Обработчик состояния
ipcRenderer.on('download-state', (e, { id, state }) => {
  const download = ongoingDownloads.get(id);
  if (download) {
    download.state = state;
  }
  if (state === 'completed' || state === 'cancelled' || state === 'interrupted') {
    activeDownloads = Math.max(0, activeDownloads - 1);
    if (state === 'completed') {
      hasNewDownloads = true;
    }
    updateDownloadIconState();

    if (state === 'completed') {
      setTimeout(() => {
        ongoingDownloads.delete(id);
        updateDownloadsDropdown();
      }, 5000);
    } else {
      ongoingDownloads.delete(id);
    }
  }
  updateDownloadsDropdown();
});

// Обработчик завершения
ipcRenderer.on('download-completed', (event, { id, filename, url, totalBytes, fullPath, time }) => {
  const download = ongoingDownloads.get(id);
  if (download) {
    download.state = 'completed';
    download.progress = 100;
  }
  addDownload(filename, url, totalBytes, fullPath, time);
  updateDownloadsDropdown();
});

// Обработчик для обновления после очистки загрузок
ipcRenderer.on('downloads-updated', () => {
  downloads = JSON.parse(localStorage.getItem('browserDownloads') || '[]');
  sessionDownloads = [];
  ongoingDownloads.clear();
  activeDownloads = 0;
  hasNewDownloads = false;
  updateDownloadIconState();
  updateDownloadsDropdown();

  views.forEach(view => {
    const wv = view.querySelector('webview');
    if (wv && wv.getURL().includes('Settings.html')) {
      wv.send('downloads-updated');
    }
  });
});

// ФУНКЦИЯ ДЛЯ ОБНОВЛЕНИЯ СОСТОЯНИЯ ИКОНКИ (Firefox-style)
function updateDownloadIconState() {
  if (!downloadsIcon) return;

  downloadsIcon.classList.remove('active-download', 'new-download');

  if (activeDownloads > 0) {
    downloadsIcon.classList.add('active-download');
  } else if (hasNewDownloads) {
    downloadsIcon.classList.add('new-download');
  }
}

// Функция сброса состояния иконки
function resetDownloadIcon() {
  hasNewDownloads = false;
  updateDownloadIconState();
}

// Форматирование байтов
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

// Форматирование времени
function formatTime(seconds) {
  if (seconds < 60) return `${Math.round(seconds)} сек`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`;
  return `${Math.floor(seconds / 3600)} ч`;
}

// Обновление прогресса загрузок
function updateDownloadsProgress() {
  ongoingDownloads.forEach((download, id) => {
    if (download.state === 'progressing' && download.speed > 0) {
      const now = Date.now();
      const timeDiff = (now - download.lastUpdate) / 1000;

      if (timeDiff > 1) {
        download.speed = download.speed * 0.9;

        if (download.totalBytes > 0) {
          const remainingBytes = download.totalBytes - download.receivedBytes;
          if (download.speed > 0) {
            download.eta = remainingBytes / download.speed;
          }
        }
      }
    }
  });
  updateDownloadsDropdown();
}

// Обновление выпадающего меню загрузок
function updateDownloadsDropdown() {
  const list = document.getElementById('downloadsListDropdown');
  if (!list) return;

  list.innerHTML = '';

  const activeArray = Array.from(ongoingDownloads.values())
  .filter(d => d.state === 'progressing' || d.state === 'started')
  .sort((a, b) => a.time - b.time);

  const recentArray = sessionDownloads
  .sort((a, b) => b.time - a.time)
  .slice(0, 3);

  if (activeArray.length === 0 && recentArray.length === 0) {
    list.innerHTML = '<div class="no-downloads">Нет активных загрузок</div>';
    return;
  }

  // Активные загрузки
  activeArray.forEach(item => {
    const div = document.createElement('div');
    div.className = 'download-item-dropdown active';

    const progress = Math.min(100, item.progress).toFixed(1);
    let statusText = '';

    if (item.totalBytes > 0) {
      statusText = `${progress}% • ${formatBytes(item.receivedBytes)} / ${formatBytes(item.totalBytes)}`;

      if (item.speed > 0) {
        statusText += ` • ${formatBytes(item.speed)}/сек`;

        if (item.eta > 0 && item.eta < 3600) {
          statusText += ` • ~${formatTime(item.eta)}`;
        }
      }
    } else {
      statusText = `${progress}% • ${formatBytes(item.receivedBytes)}`;
      if (item.speed > 0) {
        statusText += ` • ${formatBytes(item.speed)}/сек`;
      }
    }

    div.innerHTML = `
    <div class="download-header">
    <span class="filename">${item.filename}</span>
    <span class="status">${getStateText(item.state)}</span>
    </div>
    <div class="progress-container">
    <div class="progress-bar" style="width: ${progress}%"></div>
    </div>
    <div class="download-details">
    <span class="progress-text">${statusText}</span>
    <div class="download-actions">
    <button class="cancel-btn" data-id="${item.id}" title="Отменить">✕</button>
    </div>
    </div>
    `;

    list.appendChild(div);
  });

  if (activeArray.length > 0 && recentArray.length > 0) {
    const separator = document.createElement('div');
    separator.className = 'download-separator';
    list.appendChild(separator);
  }

  // Завершенные загрузки
  recentArray.forEach(item => {
    const div = document.createElement('div');
    div.className = 'download-item-dropdown completed';

    const timeAgo = formatTimeAgo(Date.now() - item.time);

    div.innerHTML = `
    <div class="download-header">
    <span class="filename">${item.filename}</span>
    <span class="status completed">✓</span>
    </div>
    <div class="download-details">
    <span class="progress-text">${formatBytes(item.totalBytes)} • ${timeAgo}</span>
    <div class="download-actions">
    <button class="open-btn" data-path="${item.fullPath}" title="Открыть папку">📂</button>
    </div>
    </div>
    `;

    list.appendChild(div);
  });

  // Обработчики кнопок
  list.querySelectorAll('.cancel-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      ipcRenderer.send('cancel-download', id);
    };
  });

  list.querySelectorAll('.open-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const filePath = btn.dataset.path;
      ipcRenderer.send('open-folder', filePath);
    };
  });
}

// Вспомогательные функции
function getStateText(state) {
  const states = {
    'progressing': 'Загружается',
    'started': 'Начало',
    'paused': 'На паузе',
    'completed': 'Завершено',
    'cancelled': 'Отменено',
    'interrupted': 'Ошибка'
  };
  return states[state] || state;
}

function formatTimeAgo(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return 'только что';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин назад`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч назад`;
  return `${Math.floor(seconds / 86400)} дн назад`;
}

function addDownload(filename, url, totalBytes, fullPath, time) {
  const item = { filename, url, time, totalBytes, fullPath, state: 'completed' };
  sessionDownloads.push(item);
  downloads.push(item);
  if (downloads.length > 500) downloads.shift();
  localStorage.setItem('browserDownloads', JSON.stringify(downloads));

  views.forEach(view => {
    const wv = view.querySelector('webview');
    if (wv && wv.getURL().includes('Settings.html')) {
      wv.send('downloads-updated');
    }
  });
}

function createTab(url = START_PAGE) {
  if (!tabsBar || !addTabBtn) return;

  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.innerHTML = `<span class="title">Загрузка...</span><button class="close">×</button>`;

  const view = document.createElement('div');
  view.className = 'tab-content';

  const webview = document.createElement('webview');
  webview.src = url;
  webview.style = 'width:100%; height:100%';
  webview.setAttribute('allowpopups', 'true');
  webview.setAttribute('partition', 'persist:webview');
  webview.setAttribute('preload', `file://${path.join(__dirname, 'webview-preload.js')}`);

  view.appendChild(webview);
  tabsArea.appendChild(view);
  tabsBar.insertBefore(tab, addTabBtn);

  tabs.push(tab);
  views.push(view);
  active = tabs.length - 1;

  webview.addEventListener('page-title-updated', e => {
    tab.querySelector('.title').textContent = (e.title || 'Новая вкладка').substr(0, 30);
  });

  webview.addEventListener('new-window', e => {
    e.preventDefault();
    if (e.url && e.url !== 'about:blank') createTab(e.url);
  });

    const updateAddressAndHistory = () => {
      const u = webview.getURL();
      if (active === tabs.indexOf(tab)) {
        addressBar.value = u?.includes('MainPage') || u?.includes('Settings.html') ? '' : u;
      }
      if (u && !u.includes('MainPage') && !u.includes('Settings.html')) {
        updateHistory(u, webview.getTitle());
      }
      updateNavButtons();
    };

    webview.addEventListener('did-start-loading', updateAddressAndHistory);
    webview.addEventListener('did-navigate', updateAddressAndHistory);
    webview.addEventListener('did-navigate-in-page', updateAddressAndHistory);
    webview.addEventListener('dom-ready', updateAddressAndHistory);

    tab.addEventListener('click', e => {
      if (!e.target.classList.contains('close')) activateTab(tabs.indexOf(tab));
    });

      tab.querySelector('.close').onclick = e => {
        e.stopPropagation();
        closeTab(tabs.indexOf(tab));
      };

      webview.addEventListener('dom-ready', () => {
        if (tabs.indexOf(tab) === active) activateTab(active);
      });

        webview.addEventListener('ipc-message', event => {
          if (event.channel === 'get-search-engine') {
            const responseChannel = event.args[0];
            const url = localStorage.getItem('searchEngineUrl') || 'https://startpozi.netlify.app/search.html?q=';
            currentSearchEngine = url;
            webview.send(responseChannel, url);
          }

          if (event.channel === 'set-search-engine') {
            const url = event.args[0];
            localStorage.setItem('searchEngineUrl', url);
            currentSearchEngine = url;
          }

          if (event.channel === 'get-history') {
            const history = JSON.parse(localStorage.getItem('browserHistory') || '[]');
            webview.send('history-data', history);
          }

          if (event.channel === 'clear-history') {
            localStorage.removeItem('browserHistory');
            views.forEach(v => {
              const wv = v.querySelector('webview');
              if (wv && wv.getURL().includes('Settings.html')) wv.send('history-updated');
            });
          }

          if (event.channel === 'get-downloads') {
            const downloadsData = JSON.parse(localStorage.getItem('browserDownloads') || '[]');
            webview.send('downloads-data', downloadsData);
          }

          if (event.channel === 'clear-downloads') {
            localStorage.removeItem('browserDownloads');
            downloads = [];
            sessionDownloads = [];
            ongoingDownloads.clear();
            views.forEach(v => {
              const wv = v.querySelector('webview');
              if (wv && wv.getURL().includes('Settings.html')) {
                wv.send('downloads-updated');
              }
            });
          }

          if (event.channel === 'get-current-download-path') {
            ipcRenderer.invoke('get-current-download-path').then(path => {
              webview.send('current-download-path-data', path);
            }).catch(err => console.error("Ошибка при получении пути загрузки:", err));
          }

          if (event.channel === 'set-download-path') {
            ipcRenderer.invoke('set-download-path').then(newPath => {
              webview.send('download-path-updated', newPath);
            }).catch(err => console.error("Ошибка при смене пути загрузки:", err));
          }

          if (event.channel === 'open-url-from-settings') {
            const url = event.args[0];
            createTab(url);
          }
        });

        saveTabsState();
}

function activateTab(i) {
  tabs.forEach(t => t.classList.remove('active'));
  views.forEach(v => v.classList.remove('active'));
  tabs[i].classList.add('active');
  views[i].classList.add('active');
  active = i;
  const wv = views[i].querySelector('webview');
  if (wv) setTimeout(() => wv.focus(), 100);
}

function goBack()    { views[active]?.querySelector('webview')?.goBack(); }
function goForward() { views[active]?.querySelector('webview')?.goForward(); }
function reload()    { views[active]?.querySelector('webview')?.reload(); }

function updateNavButtons() {
  const wv = views[active]?.querySelector('webview');
  if (wv) {
    document.getElementById('back').disabled    = !wv.canGoBack();
    document.getElementById('forward').disabled = !wv.canGoForward();
  }
}

function closeTab(i) {
  if (tabs.length <= 1) return;
  tabsBar.removeChild(tabs[i]);
  tabsArea.removeChild(views[i]);
  tabs.splice(i, 1);
  views.splice(i, 1);
  if (active >= tabs.length) active = tabs.length - 1;
  activateTab(active);
  saveTabsState();
}

function saveTabsState() {
  if (localStorage.getItem('saveTabs') === 'true') {
    const urls = views.map(v => v.querySelector('webview')?.getURL() || '');
    localStorage.setItem('savedTabs', JSON.stringify(urls));
  }
}

function updateHistory(url, title = '') {
  if (!url || url.includes('MainPage') || url.includes('Settings.html')) return;
  const cleanUrl = url.split('#')[0].split('?')[0];
  const cleanTitle = title.trim() || new URL(url).hostname || 'Без названия';
  let h = JSON.parse(localStorage.getItem('browserHistory') || '[]');
  h = h.filter(x => x.url !== cleanUrl);
  h.push({url: cleanUrl, title: cleanTitle, time: Date.now()});
  if (h.length > 500) h.shift();
  localStorage.setItem('browserHistory', JSON.stringify(h));

  views.forEach(view => {
    const wv = view.querySelector('webview');
    if (wv && wv.getURL().includes('Settings.html')) {
      wv.send('history-updated');
    }
  });
}

function openInternalPage(title, content) {
  createTab('about:blank');
  const wv = views[active].querySelector('webview');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>
  body{background:#0f0f17;color:#eee;font-family:system-ui;padding:20px;margin:0}
  h1{color:#00c8ff}
  </style></head><body><h1>${title}</h1>${content}</body></html>`;
  wv.loadURL('data:text/html,' + encodeURIComponent(html));
}

function showBookmarks() { /* */ }
function showDownloads() { createTab(SETTINGS_PAGE); }
function showHistory()   { createTab(SETTINGS_PAGE); }
function showAbout()     { openInternalPage('О браузере', '<h2>StartPOZI 2025</h2><p>Всё работает идеально!</p>'); }

function loadTheme() {
  const t = localStorage.getItem('themeMode') || 'dark';
  document.body.className = t === 'system'
  ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'theme-dark' : 'theme-light')
  : `theme-${t}`;
}

setInterval(() => updateNavButtons(), 500);
