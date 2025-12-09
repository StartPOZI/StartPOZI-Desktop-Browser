const { ipcRenderer } = require('electron');
const path = require('path');

const START_PAGE = `file://${path.join(__dirname, 'MainPage', 'index.html')}`;

const tabsBar = document.getElementById('tabsContainerTabs');
const tabsArea = document.getElementById('tabsContainer');
const addressBar = document.getElementById('searchInput');
const addTabBtn = document.getElementById('addTab');

const minBtn = document.getElementById('min-btn');
const maxBtn = document.getElementById('max-btn');
const closeBtn = document.getElementById('close-btn');

// Кнопки навигации
const backBtn = document.getElementById('back');
const forwardBtn = document.getElementById('forward');
const refreshBtn = document.getElementById('refresh');

// Кнопка меню
const menuBtn = document.getElementById('menuBtn');
const dropdown = document.getElementById('dropdown');

let tabs = [];
let views = [];
let active = 0;

// Открытие URL из главного процесса
ipcRenderer.on('OPEN_URL', (e, url) => {
  createTab(url || START_PAGE);
});

// Создание новой вкладки
function createTab(url = START_PAGE) {
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.innerHTML = `<span class="title">Загрузка...</span><button class="close">×</button>`;

  const view = document.createElement('div');
  view.className = 'tab-content';

  const webview = document.createElement('webview');
  webview.src = url;
  webview.style = 'width:100%; height:100%';
  webview.setAttribute('preload', `file://${path.join(__dirname, 'preload.js')}`);

  view.appendChild(webview);
  tabsArea.appendChild(view);
  tabsBar.insertBefore(tab, addTabBtn);

  tabs.push(tab);
  views.push(view);
  active = tabs.length - 1;

  // Обновление заголовка вкладки
  webview.addEventListener('page-title-updated', e => {
    tab.querySelector('.title').textContent = (e.title || 'Новая вкладка').substring(0, 30);
  });

  // Обновление адресной строки
  const updateAddress = () => {
    if (active === tabs.indexOf(tab)) {
      const curr = webview.getURL();
      addressBar.value = curr.includes('MainPage') ? '' : curr;
    }
  };

  webview.addEventListener('did-navigate', updateAddress);
  webview.addEventListener('did-navigate-in-page', updateAddress);
  webview.addEventListener('dom-ready', updateAddress);

  // Переключение вкладки
  tab.onclick = e => {
    if (!e.target.classList.contains('close')) {
      active = tabs.indexOf(tab);
      activateTab(active);
    }
  };

  // Закрытие вкладки
  tab.querySelector('.close').onclick = e => {
    e.stopPropagation();
    const i = tabs.indexOf(tab);
    tab.remove();
    view.remove();
    tabs.splice(i, 1);
    views.splice(i, 1);
    if (active >= i) active--;
    if (tabs.length === 0) createTab();
    else activateTab(active);
  };

    activateTab(active);
}

// Активация вкладки
function activateTab(i) {
  tabs.forEach((t, idx) => t.classList.toggle('active', idx === i));
  views.forEach((v, idx) => v.classList.toggle('active', idx === i));
  active = i;

  const wv = views[i]?.querySelector('webview');
  if (wv) {
    const url = wv.getURL();
    addressBar.value = url.includes('MainPage') ? '' : url;
  }
}

// === КНОПКИ НАВИГАЦИИ ===

backBtn?.addEventListener('click', () => {
  const webview = views[active]?.querySelector('webview');
  if (webview && webview.canGoBack()) {
    webview.goBack();
  }
});

forwardBtn?.addEventListener('click', () => {
  const webview = views[active]?.querySelector('webview');
  if (webview && webview.canGoForward()) {
    webview.goForward();
  }
});

refreshBtn?.addEventListener('click', () => {
  const webview = views[active]?.querySelector('webview');
  if (webview) webview.reload();
});

// === АДРЕСНАЯ СТРОКА (Enter) ===
addressBar.onkeydown = e => {
  if (e.key === 'Enter') {
    let input = addressBar.value.trim();
    let url = input || START_PAGE;

    if (url && !url.includes('://') && !url.startsWith('file://')) {
      if (url.includes('.')) {
        url = 'https://' + url;
      } else {
        url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
      }
    }

    const wv = views[active]?.querySelector('webview');
    if (wv) wv.src = url;
  }
};

// === КНОПКИ ОКНА ===
addTabBtn.onclick = () => ipcRenderer.send('OPEN_URL', START_PAGE);
minBtn.onclick = () => ipcRenderer.send('minimize');
maxBtn.onclick = () => ipcRenderer.send('maximize');
closeBtn.onclick = () => ipcRenderer.send('close');

// === ВЫПАДАЮЩЕЕ МЕНЮ ===
if (menuBtn && dropdown) {
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
  });

  document.addEventListener('click', () => {
    dropdown.style.display = 'none';
  });

  dropdown.addEventListener('click', e => e.stopPropagation());
}


// ЭТО ОБЯЗАТЕЛЬНО ДОЛЖНО БЫТЬ В renderer.js
window.showDialog = ({title, message, defaultValue = '', showInput = false}) => {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;z-index:999999;font-family:system-ui;';

    overlay.innerHTML = `
    <div style="background:#1e1e1e;border-radius:16px;width:460px;max-width:92vw;box-shadow:0 20px 60px #000;border:1px solid #333">
    <div style="padding:24px 32px 16px">
    <h3 style="margin:0 0 8px;color:white;font-size:18px;font-weight:600">${title}</h3>
    <p style="margin:0 0 20px;color:#aaa;font-size:15px">${message}</p>
    <input id="inp" type="text" value="${defaultValue}" style="display:${showInput?'block':'none'};width:100%;padding:12px 16px;background:#2d2d2d;border:1px solid #444;border-radius:12px;color:white;font-size:15px">
    </div>
    <div style="display:flex;justify-content:flex-end;gap:12px;padding:0 32px 28px">
    <button id="c" style="display:${showInput||title!=='Сообщение'?'block':'none'};min-width:100px;padding:10px 20px;border:none;border-radius:12px;background:#404040;color:#ddd;font-size:14px">Отмена</button>
    <button id="o" style="min-width:100px;padding:10px 20px;border:none;border-radius:12px;background:#0a84ff;color:white;font-size:14px">ОК</button>
    </div>
    </div>
    `;

    document.body.appendChild(overlay);
    const input = overlay.querySelector('#inp');
    const cancel = overlay.querySelector('#c');
    const ok = overlay.querySelector('#o');

    const close = v => { overlay.remove(); resolve(v); };

    cancel.onclick = () => close(null);
    ok.onclick = () => close(showInput ? input.value.trim() || null : true);
    overlay.onclick = e => e.target === overlay && close(null);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter' && showInput) close(input.value.trim() || null);
    }, {once: true});

      (showInput ? input : ok).focus();
      if (showInput) input.select();
  });
};

