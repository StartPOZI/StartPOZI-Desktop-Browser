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

let tabs = [];
let views = [];
let activeTab = 0;

function createTab(url = START_PAGE) {
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.innerHTML = `<span class="title">Загрузка...</span><button class="close">×</button>`;

  const view = document.createElement('div');
  view.className = 'tab-content';

  const webview = document.createElement('webview');
  webview.src = url;
  webview.setAttribute('preload', `file://${path.join(__dirname, 'preload.js')}`);
  webview.style = 'width:100%;height:100%';
  view.appendChild(webview);
  tabsArea.appendChild(view);
  tabsBar.insertBefore(tab, addTabBtn);

  tabs.push(tab);
  views.push(view);
  activeTab = tabs.length - 1;
  activateTab(activeTab);

  // Надёжное обновление названия
  const updateTitle = () => {
    webview.executeJavaScript('document.title', title => {
      tab.querySelector('.title').textContent = (title || 'Новая вкладка').substring(0, 30);
    });
  };
  webview.addEventListener('dom-ready', updateTitle);
  webview.addEventListener('did-finish-load', updateTitle);
  setTimeout(updateTitle, 1000);

  tab.onclick = e => !e.target.classList.contains('close') && activateTab(tabs.indexOf(tab));
  tab.querySelector('.close').onclick = e => {
    e.stopPropagation();
    const i = tabs.indexOf(tab);
    tab.remove(); view.remove();
    tabs.splice(i, 1); views.splice(i, 1);
    if (activeTab >= i) activeTab--;
    if (tabs.length === 0) createTab();
    else activateTab(activeTab);
  };
}

function activateTab(i) {
  tabs.forEach((t, idx) => t.classList.toggle('active', idx === i));
  views.forEach((v, idx) => v.classList.toggle('active', idx === i));
  activeTab = i;
  const wv = views[i]?.querySelector('webview');
  if (wv) addressBar.value = wv.src.includes('MainPage') ? '' : wv.src;
}

// ЕДИНЫЙ КАНАЛ — ОТКРЫТИЕ НОВОЙ ВКЛАДКИ
ipcRenderer.on('OPEN_URL', (e, url) => createTab(url || START_PAGE));

document.addEventListener('DOMContentLoaded', () => {
  addTabBtn.onclick = () => ipcRenderer.send('OPEN_URL');
  minBtn.onclick = () => ipcRenderer.send('minimize');
  maxBtn.onclick = () => ipcRenderer.send('maximize');
  closeBtn.onclick = () => ipcRenderer.send('close');

  addressBar.onkeydown = e => {
    if (e.key === 'Enter') {
      let url = addressBar.value.trim();
      if (url && !url.includes('://')) url = 'https://' + url;
        views[activeTab]?.querySelector('webview').src = url || START_PAGE;
    }
  };
});
