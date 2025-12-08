const { ipcRenderer } = require('electron');
const path = require('path');
const START_PAGE = `file://${path.join(__dirname, 'MainPage', 'index.html')}`;

const tabsBar    = document.getElementById('tabsContainerTabs');
const tabsArea   = document.getElementById('tabsContainer');
const addressBar = document.getElementById('searchInput');
const addTabBtn  = document.getElementById('addTab');
const minBtn     = document.getElementById('min-btn');
const maxBtn     = document.getElementById('max-btn');
const closeBtn   = document.getElementById('close-btn');

let tabs  = [];
let views = [];
let active = 0;

ipcRenderer.on('OPEN_URL', (e, url) => {
  createTab(url || START_PAGE);
});

function createTab(url = START_PAGE) {
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.innerHTML = `<span class="title">Загрузка...</span><button class="close">×</button>`;

  const view = document.createElement('div');
  view.className = 'tab-content';

  const webview = document.createElement('webview');
  webview.src = url;
  webview.style = 'width:100%; height:100%';

  // ВСЕГДА подключаем preload.js
  webview.setAttribute('preload', `file://${path.join(__dirname, 'preload.js')}`);

  view.appendChild(webview);
  tabsArea.appendChild(view);
  tabsBar.insertBefore(tab, addTabBtn);

  tabs.push(tab);
  views.push(view);
  active = tabs.length - 1;

  webview.addEventListener('page-title-updated', e => {
    tab.querySelector('.title').textContent = (e.title || 'Новая вкладка').substring(0, 30);
  });

  const updateAddress = () => {
    if (active === tabs.indexOf(tab)) {
      const curr = webview.getURL();
      addressBar.value = curr.includes('MainPage') ? '' : curr;
    }
  };
  webview.addEventListener('did-navigate', updateAddress);
  webview.addEventListener('did-navigate-in-page', updateAddress);
  webview.addEventListener('dom-ready', updateAddress);

  tab.onclick = e => {
    if (!e.target.classList.contains('close')) {
      active = tabs.indexOf(tab);
      activateTab(active);
    }
  };

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

addTabBtn.onclick = () => ipcRenderer.send('OPEN_URL', START_PAGE);
minBtn.onclick    = () => ipcRenderer.send('minimize');
maxBtn.onclick    = () => ipcRenderer.send('maximize');
closeBtn.onclick  = () => ipcRenderer.send('close');

addressBar.onkeydown = e => {
  if (e.key === 'Enter') {
    let input = addressBar.value.trim();
    let url = input || START_PAGE;
    if (url && !url.includes('://') && !url.startsWith('file://')) {
      url = 'https://' + url;
    }
    const wv = views[active]?.querySelector('webview');
    if (wv) wv.src = url;
  }
};
