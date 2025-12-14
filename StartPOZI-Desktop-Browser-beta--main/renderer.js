// renderer.js — Финальная версия декабрь 2025 (автосохранение без диалога через main)
const { ipcRenderer } = require('electron');
const path = require('path');

const START_PAGE = `file://${path.join(__dirname, 'MainPage', 'index.html')}`;
const SETTINGS_PAGE = `file://${path.join(__dirname, 'Settings.html')}`;

let tabs = [];
let views = [];
let active = 0;

let tabsBar, tabsArea, addressBar, addTabBtn;

let currentSearchEngine = localStorage.getItem('searchEngineUrl') || 'https://startpozi.netlify.app/search.html?q=';

let downloads = JSON.parse(localStorage.getItem('browserDownloads') || '[]');

document.addEventListener('DOMContentLoaded', () => {
  tabsBar    = document.getElementById('tabsContainerTabs');
  tabsArea   = document.getElementById('tabsContainer');
  addressBar = document.getElementById('searchInput');
  addTabBtn  = document.getElementById('addTab');

  document.getElementById('min-btn').onclick   = () => ipcRenderer.send('minimize');
  document.getElementById('max-btn').onclick   = () => ipcRenderer.send('maximize');
  document.getElementById('close-btn').onclick = () => ipcRenderer.send('close');

  document.getElementById('back').onclick     = () => goBack();
  document.getElementById('forward').onclick  = () => goForward();
  document.getElementById('refresh').onclick  = () => reload();

  addTabBtn.onclick = () => createTab();

  const menuBtn = document.getElementById('menuBtn');
  const dropdown = document.getElementById('dropdown');

  menuBtn.onclick = () => dropdown.classList.toggle('show');
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
      if (a === 'downloads') showDownloads();
      if (a === 'history')   showHistory();
      if (a === 'about')     showAbout();
    };
  });

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
});

ipcRenderer.on('OPEN_URL', (e, url) => {
  if (url && url !== 'about:blank') createTab(url);
});

// Приём завершённых загрузок из main.js
ipcRenderer.on('download-completed', (event, { filename, url }) => {
  addDownload(filename, url || '');
});

function addDownload(filename, url) {
  const item = { filename, url, time: Date.now() };
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
            webview.send('downloads-data', downloads);
          }

          if (event.channel === 'clear-downloads') {
            downloads = [];
            localStorage.removeItem('browserDownloads');
            views.forEach(v => {
              const wv = v.querySelector('webview');
              if (wv && wv.getURL().includes('Settings.html')) wv.send('downloads-updated');
            });
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
function showHistory()   { /* */ }
function showAbout()     { openInternalPage('О браузере', '<h2>StartPOZI 2025</h2><p>Всё работает идеально!</p>'); }

function loadTheme() {
  const t = localStorage.getItem('themeMode') || 'dark';
  document.body.className = t === 'system'
  ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'theme-dark' : 'theme-light')
  : `theme-${t}`;
}

setInterval(() => updateNavButtons(), 500);
