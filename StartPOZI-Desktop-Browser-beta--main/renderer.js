// renderer.js — Стабильная версия с исправлениями для меню плагинов и корректными путями



const { ipcRenderer } = require('electron');

const path = require('path');



// Константы для страниц

const START_PAGE = `file://${path.join(__dirname, 'MainPage', 'index.html')}`;

const SETTINGS_PAGE = `file://${path.join(__dirname, 'Settings.html')}`;



// Глобальные переменные для вкладок

let tabs = [];

let views = [];

let active = 0;



// Элементы DOM

let tabsBar, tabsArea, addressBar, addTabBtn, downloadsBtn, downloadsIcon;



// Настройки

let currentSearchEngine = localStorage.getItem('searchEngineUrl') || 'https://startpozi.netlify.app/search.html?q=';



// Загрузки

let downloads = JSON.parse(localStorage.getItem('browserDownloads') || '[]');

let sessionDownloads = [];

let ongoingDownloads = new Map();

let activeDownloads = 0;

let downloadUpdateInterval = null;

let hasNewDownloads = false;



// Логирование

const logDir = path.join(require('os').homedir(), '.config', 'startpozi-browser');

const logFile = path.join(logDir, 'renderer.log');



// Функция для логирования

function log(message, level = 'INFO') {

  const timestamp = new Date().toISOString();

  const logMessage = `[${timestamp}] [${level}] ${message}\n`;



  console.log(logMessage.trim());



  try {

    require('fs').appendFileSync(logFile, logMessage);

  } catch (error) {

    console.error('Не удалось записать в лог файл:', error);

  }

}



log('StartPOZI Browser renderer запущен');



// Функция для показа toast уведомлений

function showToast(message, duration = 3000) {

  let toast = document.getElementById('toast');

  if (!toast) {

    toast = document.createElement('div');

    toast.id = 'toast';

    toast.className = 'toast';

    document.body.appendChild(toast);

  }



  toast.textContent = message;

  toast.classList.add('show');



  setTimeout(() => {

    toast.classList.remove('show');

  }, duration);

}



// =============== ФУНКЦИЯ ДЛЯ ПОКАЗА POPUP РАСШИРЕНИЯ ===============

function showExtensionPopup(popupInfo) {

  log(`Показываем popup для расширения: ${popupInfo.pluginName}`);



  // ПРОВЕРЯЕМ, ВКЛЮЧЕН ЛИ ПЛАГИН

  if (!popupInfo.enabled) {

    showToast('Расширение отключено. Включите его, чтобы использовать меню.');

    return;

  }



  // Удаляем старый popup если есть

  const oldPopup = document.getElementById('extension-popup-overlay');

  if (oldPopup) {

    document.body.removeChild(oldPopup);

  }



  // Создаем overlay

  const overlay = document.createElement('div');

  overlay.id = 'extension-popup-overlay';

  overlay.style.cssText = `

  position: fixed;

  top: 0;

  left: 0;

  width: 100%;

  height: 100%;

  background: rgba(0,0,0,0.5);

  z-index: 100000;

  display: flex;

  align-items: center;

  justify-content: center;

  `;



  // Создаем контейнер для popup

  const container = document.createElement('div');

  container.id = 'extension-popup-container';

  container.style.cssText = `

  width: 400px;

  height: 500px;

  background: var(--dropdown-bg, #1e1e1e);

  border: 1px solid var(--dropdown-border, #444);

  border-radius: 14px;

  box-shadow: 0 20px 60px rgba(0,0,0,0.5);

  display: flex;

  flex-direction: column;

  overflow: hidden;

  backdrop-filter: var(--backdrop-filter, blur(20px));

  `;



  // Заголовок

  const header = document.createElement('div');

  header.style.cssText = `

  padding: 16px 20px;

  background: rgba(0,0,0,0.2);

  border-bottom: 1px solid var(--dropdown-border, #444);

  display: flex;

  justify-content: space-between;

  align-items: center;

  `;



  const title = document.createElement('span');

  title.textContent = popupInfo.pluginName;

  title.style.cssText = `

  color: var(--text-color, white);

  font-weight: 600;

  font-size: 14px;

  `;



  const closeBtn = document.createElement('button');

  closeBtn.innerHTML = '×';

  closeBtn.style.cssText = `

  background: none;

  border: none;

  color: var(--text-color, white);

  font-size: 24px;

  cursor: pointer;

  width: 30px;

  height: 30px;

  display: flex;

  align-items: center;

  justify-content: center;

  border-radius: 6px;

  opacity: 0.7;

  `;

  closeBtn.onmouseover = () => closeBtn.style.opacity = '1';

  closeBtn.onmouseout = () => closeBtn.style.opacity = '0.7';

  closeBtn.onclick = () => {

    document.body.removeChild(overlay);

  };



  header.appendChild(title);

  header.appendChild(closeBtn);



  // Webview для содержимого popup

  const webview = document.createElement('webview');

  webview.id = 'extension-popup-webview';

  webview.style.cssText = `

  flex: 1;

  width: 100%;

  border: none;

  `;



  // Создаем data URL из HTML содержимого (уже с встроенными ресурсами)

  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(popupInfo.popupContent)}`;



  // Загружаем data URL

  webview.setAttribute('src', dataUrl);

  webview.setAttribute('partition', 'persist:webview');

  webview.setAttribute('webpreferences', 'nodeIntegration=no, contextIsolation=yes, allowFileAccess=yes');

  webview.setAttribute('allowpopups', 'false');



  // Закрытие по клику вне popup

  overlay.addEventListener('click', (e) => {

    if (e.target === overlay) {

      document.body.removeChild(overlay);

    }

  });



  // Закрытие по Escape

  overlay.addEventListener('keydown', (e) => {

    if (e.key === 'Escape') {

      document.body.removeChild(overlay);

    }

  });



  // Собираем всё вместе

  container.appendChild(header);

  container.appendChild(webview);

  overlay.appendChild(container);

  document.body.appendChild(overlay);



  // Фокусируем overlay для обработки клавиш

  overlay.tabIndex = -1;

  overlay.focus();



  log(`Popup для ${popupInfo.pluginName} показан`);

}



// Функция для перезапуска браузера

function restartBrowser() {

  if (confirm('Для применения изменений необходимо перезапустить браузер. Перезапустить сейчас?')) {

    showToast('Браузер перезапускается...');



    // Сохраняем вкладки перед перезапуском

    saveTabsState();



    // Даем время на сохранение

    setTimeout(async () => {

      try {

        const result = await ipcRenderer.invoke('restart-browser');

        if (result.success) {

          showToast('Браузер перезапускается...');

        }

      } catch (error) {

        console.error('Ошибка перезапуска браузера:', error);

        showToast('Ошибка при перезапуске браузера');

      }

    }, 100);

  }

}



// Основная инициализация

document.addEventListener('DOMContentLoaded', () => {

  try {

    log('Инициализация DOM начата');



    // Получаем элементы DOM

    tabsBar = document.getElementById('tabsContainerTabs');

    tabsArea = document.getElementById('tabsContainer');

    addressBar = document.getElementById('searchInput');

    addTabBtn = document.getElementById('addTab');

    downloadsBtn = document.getElementById('downloadsBtn');

    downloadsIcon = document.getElementById('downloadIcon');



    // Кнопки управления окном

    document.getElementById('min-btn').onclick = () => ipcRenderer.send('minimize');

    document.getElementById('max-btn').onclick = () => ipcRenderer.send('maximize');

    document.getElementById('close-btn').onclick = () => ipcRenderer.send('close');



    // Кнопки навигации

    document.getElementById('back').onclick = () => goBack();

    document.getElementById('forward').onclick = () => goForward();

    document.getElementById('refresh').onclick = () => reload();



    // Кнопка добавления вкладки

    addTabBtn.onclick = () => createTab();



    // Меню (три точки)

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

        if (a === 'downloads') { resetDownloadIcon(); showDownloads(); }

        if (a === 'history') showHistory();

        if (a === 'about') showAbout();

      };

    });



    // Выпадающий список загрузок

    const downloadsDropdown = document.getElementById('downloadsDropdown');

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



    // Проверяем настройки сохранения вкладок

    if (localStorage.getItem('saveTabs') === null) localStorage.setItem('saveTabs', 'false');

    if (localStorage.getItem('saveInternalPages') === null) localStorage.setItem('saveInternalPages', 'false');



    const saveTabsEnabled = localStorage.getItem('saveTabs') === 'true';

    const savedTabs = JSON.parse(localStorage.getItem('savedTabs') || '[]');



    log(`Настройки: saveTabsEnabled=${saveTabsEnabled}, сохраненных вкладок=${savedTabs.length}`);



    // Загружаем сохраненные вкладки или создаем новую

    if (saveTabsEnabled && savedTabs.length > 0) {

      savedTabs.forEach((url, i) => {

        setTimeout(() => {

          createTab(url);

          activateTab(tabs.length - 1);

        }, i * 300);

      });

    } else {

      createTab();

    }



    // Загружаем тему

    loadTheme();



    // Настройка адресной строки

    if (addressBar) {

      addressBar.focus();

      addressBar.select();



      addressBar.addEventListener('click', () => {

        addressBar.focus();

        addressBar.select();

      });



      // Автодополнение (suggest)

      const suggestions = document.getElementById('suggestions');



      addressBar.addEventListener('input', async () => {

        const val = addressBar.value.trim();

        if (!val) {

          suggestions.innerHTML = '';

          suggestions.style.display = 'none';

          return;

        }



        try {

          const resp = await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(val)}&type=list`);

          const data = await resp.json();

          const items = data[1] || [];



          if (items.length === 0) {

            suggestions.innerHTML = '<div class="suggest-item">Нет предложений</div>';

          } else {

            suggestions.innerHTML = items.map(item =>

            `<div class="suggest-item" data-url="${currentSearchEngine + encodeURIComponent(item)}">

            <span class="suggest-title">${item}</span>

            </div>`

            ).join('');

          }



          suggestions.style.display = 'block';



          suggestions.querySelectorAll('.suggest-item').forEach(item => {

            item.onclick = () => {

              const url = item.dataset.url;

              addressBar.value = item.querySelector('.suggest-title').textContent;

              if (views[active]?.querySelector('webview')) {

                views[active].querySelector('webview').loadURL(url);

              }

              suggestions.style.display = 'none';

            };

          });

        } catch (e) {

          suggestions.innerHTML = '<div class="suggest-item">Ошибка</div>';

          suggestions.style.display = 'block';

        }

      });



      // Обработка Enter в адресной строке

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



          addressBar.value = targetUrl;

          if (views[active]?.querySelector('webview')) {

            views[active].querySelector('webview').loadURL(targetUrl);

          }

          if (suggestions) suggestions.style.display = 'none';

        }

      });



      document.addEventListener('click', e => {

        if (suggestions && addressBar && !addressBar.contains(e.target) && !suggestions.contains(e.target)) {

          suggestions.style.display = 'none';

        }

      });

    }



    // Инициализация иконки загрузок

    updateDownloadIconState();



    if (!downloadUpdateInterval) {

      downloadUpdateInterval = setInterval(() => {

        if (activeDownloads > 0) updateDownloadsProgress();

      }, 1000);

    }



    log('Инициализация DOM завершена успешно');

  } catch (error) {

    log(`Ошибка при инициализации DOM: ${error.message}`, 'ERROR');

  }

});



// IPC обработчики

ipcRenderer.on('save-tabs', () => {

  log('Запрос на сохранение вкладок');

  saveTabsState();

  ipcRenderer.send('tabs-saved');

});



ipcRenderer.on('OPEN_URL', (e, url) => {

  log(`Открытие URL: ${url}`);

  if (url && url !== 'about:blank') createTab(url);

});



// Обработчик для сообщения о необходимости перезапуска

ipcRenderer.on('restart-required', (e, data) => {

  log(`Требуется перезапуск: ${data.message}`);

  showToast(data.message, 5000);



  // Показываем кнопку перезапуска

  if (!document.getElementById('restart-button')) {

    const restartBtn = document.createElement('button');

    restartBtn.id = 'restart-button';

    restartBtn.innerHTML = '🔄 Перезапустить браузер';

    restartBtn.style.cssText = `

    position: fixed;

    bottom: 20px;

    right: 20px;

    background: linear-gradient(90deg, #FF6B6B, #FF8E53);

    color: white;

    border: none;

    border-radius: 10px;

    padding: 10px 15px;

    font-size: 12px;

    font-weight: 600;

    cursor: pointer;

    z-index: 99999;

    box-shadow: 0 4px 12px rgba(255,107,107,0.3);

    `;

    restartBtn.onclick = restartBrowser;

    document.body.appendChild(restartBtn);

  }

});



// Обработчики загрузок

ipcRenderer.on('download-started', (e, { id, filename, totalBytes }) => {

  ongoingDownloads.set(id, {

    id,

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

  updateDownloadsDropdown();

});



ipcRenderer.on('download-state', (e, { id, state }) => {

  const download = ongoingDownloads.get(id);

  if (download) download.state = state;



  if (state === 'completed' || state === 'cancelled' || state === 'interrupted') {

    activeDownloads = Math.max(0, activeDownloads - 1);

    if (state === 'completed') hasNewDownloads = true;

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



ipcRenderer.on('download-completed', (event, { id, filename, url, totalBytes, fullPath, time }) => {

  const download = ongoingDownloads.get(id);

  if (download) {

    download.state = 'completed';

    download.progress = 100;

  }

  addDownload(filename, url, totalBytes, fullPath, time);

  updateDownloadsDropdown();

});



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



// Функции для работы с загрузками

function updateDownloadIconState() {

  if (!downloadsIcon) return;

  downloadsIcon.classList.remove('active-download', 'new-download');

  if (activeDownloads > 0) downloadsIcon.classList.add('active-download');

  else if (hasNewDownloads) downloadsIcon.classList.add('new-download');

}



function resetDownloadIcon() {

  hasNewDownloads = false;

  updateDownloadIconState();

}



function formatBytes(bytes, decimals = 2) {

  if (bytes === 0) return '0 Bytes';

  const k = 1024;

  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];

}



function formatTime(seconds) {

  if (seconds < 60) return `${Math.round(seconds)} сек`;

  if (seconds < 3600) return `${Math.floor(seconds / 60)} мин`;

  return `${Math.floor(seconds / 3600)} ч`;

}



function updateDownloadsProgress() {

  ongoingDownloads.forEach((download, id) => {

    if (download.state === 'progressing' && download.speed > 0) {

      const now = Date.now();

      const timeDiff = (now - download.lastUpdate) / 1000;



      if (timeDiff > 1) {

        download.speed = download.speed * 0.9;



        if (download.totalBytes > 0) {

          const remainingBytes = download.totalBytes - download.receivedBytes;

          if (download.speed > 0) download.eta = remainingBytes / download.speed;

        }

      }

    }

  });

  updateDownloadsDropdown();

}



function updateDownloadsDropdown() {

  const list = document.getElementById('downloadsListDropdown');

  if (!list) return;



  list.innerHTML = '';



  const activeArray = Array.from(ongoingDownloads.entries())

  .filter(([_, d]) => d.state === 'progressing' || d.state === 'started')

  .sort((a, b) => a[1].time - b[1].time);



  const recentArray = sessionDownloads

  .sort((a, b) => b.time - a.time)

  .slice(0, 3);



  if (activeArray.length === 0 && recentArray.length === 0) {

    list.innerHTML = '<div class="no-downloads">Нет активных загрузок</div>';

    return;

  }



  activeArray.forEach(([id, item]) => {

    const div = document.createElement('div');

    div.className = 'download-item-dropdown active';



    const progress = Math.min(100, item.progress).toFixed(1);

    let statusText = '';



    if (item.totalBytes > 0) {

      statusText = `${progress}% • ${formatBytes(item.receivedBytes)} / ${formatBytes(item.totalBytes)}`;

      if (item.speed > 0) {

        statusText += ` • ${formatBytes(item.speed)}/сек`;

        if (item.eta > 0 && item.eta < 3600) statusText += ` • ~${formatTime(item.eta)}`;

      }

    } else {

      statusText = `${progress}% • ${formatBytes(item.receivedBytes)}`;

      if (item.speed > 0) statusText += ` • ${formatBytes(item.speed)}/сек`;

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

    <button class="cancel-btn" data-id="${id}" title="Отменить">✕</button>

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



// Функции для работы с вкладками

function createTab(url = START_PAGE) {

  try {

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

        try {

          const u = webview.getURL();

          if (active === tabs.indexOf(tab)) {

            addressBar.value = u?.includes('MainPage') || u?.includes('Settings.html') ? '' : u;

          }

          if (u && !u.includes('MainPage') && !u.includes('Settings.html')) {

            updateHistory(u, webview.getTitle());

          }

          updateNavButtons();

          saveTabsState();

        } catch (error) {

          log(`Ошибка в updateAddressAndHistory: ${error.message}`, 'WARN');

        }

      };



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



          // =============== ОБРАБОТЧИК ДЛЯ POPUP РАСШИРЕНИЙ ===============

          webview.addEventListener('ipc-message', event => {

            // Обработка popup расширений

            if (event.channel === 'show-extension-popup') {

              const popupInfo = event.args[0];

              if (popupInfo && popupInfo.success) {

                showExtensionPopup(popupInfo);

              }

            }



            // Обработка перезапуска

            if (event.channel === 'restart-browser') {

              restartBrowser();

            }



            // Остальные обработчики...

            if (event.channel === 'set-save-tabs') {

              const isEnabled = event.args[0];

              localStorage.setItem('saveTabs', isEnabled ? 'true' : 'false');

              if (!isEnabled) {

                localStorage.removeItem('savedTabs');

              } else {

                saveTabsState();

              }

            }



            if (event.channel === 'get-save-tabs') {

              const responseChannel = event.args[0];

              const isEnabled = localStorage.getItem('saveTabs') === 'true';

              webview.send(responseChannel, isEnabled);

            }



            if (event.channel === 'set-save-internal-pages') {

              const isEnabled = event.args[0];

              localStorage.setItem('saveInternalPages', isEnabled ? 'true' : 'false');

            }



            if (event.channel === 'get-save-internal-pages') {

              const responseChannel = event.args[0];

              const isEnabled = localStorage.getItem('saveInternalPages') === 'true';

              webview.send(responseChannel, isEnabled);

            }



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

              }).catch(err => log(`Ошибка при получении пути загрузки: ${err}`, 'ERROR'));

            }



            if (event.channel === 'set-download-path') {

              ipcRenderer.invoke('set-download-path').then(newPath => {

                webview.send('download-path-updated', newPath);

              }).catch(err => log(`Ошибка при смене пути загрузки: ${err}`, 'ERROR'));

            }



            if (event.channel === 'open-url-from-settings') {

              const url = event.args[0];

              createTab(url);

            }



            if (event.channel === 'get-theme') {

              const responseChannel = event.args[0];

              const theme = localStorage.getItem('themeMode') || 'system';

              webview.send(responseChannel, theme);

            }



            if (event.channel === 'set-theme') {

              const theme = event.args[0];

              localStorage.setItem('themeMode', theme);

              loadTheme();



              views.forEach(v => {

                const wv = v.querySelector('webview');

                if (wv) wv.send('theme-updated', theme);

              });

            }

          });



          saveTabsState();

          log(`Создана новая вкладка: ${url}`);

  } catch (error) {

    log(`Ошибка при создании вкладки: ${error.message}`, 'ERROR');

  }

}



function activateTab(i) {

  try {

    tabs.forEach(t => t.classList.remove('active'));

    views.forEach(v => v.classList.remove('active'));

    tabs[i].classList.add('active');

    views[i].classList.add('active');

    active = i;



    const wv = views[i].querySelector('webview');

    if (wv) {

      const u = wv.getURL();

      if (addressBar) {

        addressBar.value = u?.includes('MainPage') || u?.includes('Settings.html') ? '' : u;

      }

      updateNavButtons();

    }



    if (wv) setTimeout(() => wv.focus(), 100);

  } catch (error) {

    log(`Ошибка при активации вкладки: ${error.message}`, 'ERROR');

  }

}



function goBack() {

  if (views[active]?.querySelector('webview')) {

    views[active].querySelector('webview').goBack();

  }

}



function goForward() {

  if (views[active]?.querySelector('webview')) {

    views[active].querySelector('webview').goForward();

  }

}



function reload() {

  if (views[active]?.querySelector('webview')) {

    views[active].querySelector('webview').reload();

  }

}



function updateNavButtons() {

  const wv = views[active]?.querySelector('webview');

  if (wv) {

    document.getElementById('back').disabled = !wv.canGoBack();

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



// Сохранение вкладок

function saveTabsState() {

  try {

    const saveTabsEnabled = localStorage.getItem('saveTabs') === 'true';

    const saveInternalPages = localStorage.getItem('saveInternalPages') === 'true';



    log(`Сохранение вкладок: saveTabsEnabled=${saveTabsEnabled}, saveInternalPages=${saveInternalPages}`);



    if (!saveTabsEnabled) {

      localStorage.setItem('savedTabs', JSON.stringify([]));

      return;

    }



    const urlsToSave = [];



    // Сначала собираем все URL из webview

    for (let i = 0; i < views.length; i++) {

      const view = views[i];

      const webview = view?.querySelector('webview');



      if (!webview) continue;



      try {

        // Даем webview время на загрузку

        setTimeout(() => {

          try {

            const url = webview.getURL();

            log(`Вкладка #${i}: URL="${url}"`);



            if (!url || url === 'about:blank') {

              log(`Вкладка #${i}: пропущена (пустой URL)`);

              return;

            }



            const isInternalPage = url.includes('MainPage') ||

            url.includes('Settings.html') ||

            url.includes('internal-page') ||

            url.startsWith('file://');



            if (!saveInternalPages && isInternalPage) {

              log(`Вкладка #${i}: пропущена (внутренняя страница)`);

              return;

            }



            urlsToSave.push(url);

            log(`Вкладка #${i}: добавлена для сохранения`);



            // Сохраняем обновленный список

            if (urlsToSave.length > 0) {

              localStorage.setItem('savedTabs', JSON.stringify(urlsToSave));

            }

          } catch (error) {

            log(`Вкладка #${i}: ошибка получения URL - ${error.message}`, 'WARN');

          }

        }, 100);

      } catch (error) {

        log(`Вкладка #${i}: общая ошибка - ${error.message}`, 'WARN');

      }

    }



    // Если удалось собрать URL, сохраняем их

    if (urlsToSave.length > 0) {

      localStorage.setItem('savedTabs', JSON.stringify(urlsToSave));

      log(`Сохранено ${urlsToSave.length} вкладок`);

    } else {

      log('Нет вкладок для сохранения');

    }

  } catch (error) {

    log(`Критическая ошибка при сохранении вкладок: ${error.message}`, 'ERROR');

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



function showBookmarks() { }

function showDownloads() { createTab(SETTINGS_PAGE); }

function showHistory()   { createTab(SETTINGS_PAGE); }

function showAbout()     { openInternalPage('О браузере', '<h2>StartPOZI 2025</h2><p>Всё работает идеально!</p>'); }



// Тема

function loadTheme() {

  try {

    const t = localStorage.getItem('themeMode') || 'system';

    let className;

    if (t === 'system') {

      className = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'theme-dark' : 'theme-light';

    } else {

      className = `theme-${t}`;

    }

    document.body.classList.remove('theme-dark', 'theme-light');

    document.body.classList.add(className);

    log(`Тема применена: ${className}`);

  } catch (error) {

    log(`Ошибка при загрузке темы: ${error.message}`, 'ERROR');

  }

}



// Обработчики кликов для расширений

document.addEventListener('click', async (event) => {

  try {

    const target = event.target;



    // Ищем иконку плагина в интерфейсе браузера

    const extIcon = target.closest('.extension-icon');

    if (extIcon) {

      event.stopPropagation();

      event.preventDefault();



      const extId = extIcon.dataset.id;

      log(`Клик по иконке расширения в интерфейсе: ${extId}`);



      if (extId) {

        const result = await ipcRenderer.invoke('open-plugin-popup', extId);

        if (result.success) {

          showExtensionPopup(result);

          log('Меню расширения открыто');

        } else {

          log(`Ошибка открытия меню: ${result.message}`);

          showToast(result.message);

        }

        return;

      }

    }



    // Кнопка настроек плагинов

    const extBtn = target.closest('#extensionsBtn');

    if (extBtn) {

      event.stopPropagation();

      event.preventDefault();



      log('Открытие настроек плагинов');

      createTab(SETTINGS_PAGE + '#plugins');

      return;

    }



    // Меню (три точки)

    const menuBtn = target.closest('#menuBtn');

    if (menuBtn) {

      const menuDropdown = document.getElementById('menuDropdown');

      if (menuDropdown) menuDropdown.classList.toggle('show');

    }

  } catch (error) {

    log(`Ошибка при обработке клика: ${error.message}`, 'ERROR');

  }

});



// Автоматическое обновление кнопок навигации

setInterval(() => updateNavButtons(), 500);
