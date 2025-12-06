const { ipcRenderer } = require('electron');

const tabsContainerTabs = document.getElementById('tabsContainerTabs');
const tabsContainer = document.getElementById('tabsContainer');
const searchInput = document.getElementById('searchInput');
const backBtn = document.getElementById('back');
const forwardBtn = document.getElementById('forward');
const refreshBtn = document.getElementById('refresh');
const searchBtn = document.getElementById('searchBtn');
const addTabBtn = document.getElementById('addTab');
const menuBtn = document.getElementById('menuBtn');
const dropdown = document.getElementById('dropdown');
const exitBtn = document.getElementById('exit');
const minBtn = document.getElementById('min-btn');
const maxBtn = document.getElementById('max-btn');
const closeBtn = document.getElementById('close-btn');

let tabs = [];
let tabContents = [];
let activeTabIndex = -1;

function createNewTab(url = 'https://www.google.com') {  // Измени на URL StartPOZI, если есть
  const tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Элемент вкладки
  const tabElement = document.createElement('div');
  tabElement.className = 'tab';
  tabElement.setAttribute('data-tab-id', tabId);
  tabElement.innerHTML = `
    <img class="favicon" src="" style="display: none;">
    <span class="title">Новая вкладка</span>
    <button class="close">×</button>
  `;

  // Контейнер вкладки с webview
  const tabContent = document.createElement('div');
  tabContent.className = 'tab-content';
  tabContent.id = tabId;
  tabContent.setAttribute('data-tab-id', tabId);
  
  const webview = document.createElement('webview');
  webview.src = url;
  webview.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('webpreferences', 'contextIsolation=no,sandbox=no,nodeIntegration=no,enableRemoteModule=no');
  webview.setAttribute('partition', 'persist:main');
  tabContent.appendChild(webview);

  tabsContainer.appendChild(tabContent);
  tabsContainerTabs.insertBefore(tabElement, addTabBtn);
  tabs.push(tabElement);
  tabContents.push(tabContent);

  webview.addEventListener('page-title-updated', (event) => {
    tabElement.querySelector('.title').textContent = event.title || 'Новая вкладка';
  });

  webview.addEventListener('page-favicon-updated', (event) => {
    const faviconImg = tabElement.querySelector('.favicon');
    if (event.favicons && event.favicons.length > 0) {
      faviconImg.src = event.favicons[0];
      faviconImg.style.display = 'inline';
    }
  });

  webview.addEventListener('did-navigate-in-page', updateNavButtons);
  webview.addEventListener('did-finish-load', updateNavButtons);

  tabElement.addEventListener('click', () => activateTab(tabs.indexOf(tabElement)));
  tabElement.querySelector('.close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(tabs.indexOf(tabElement));
  });

  activeTabIndex = tabs.length - 1;
  activateTab(activeTabIndex);
}

function activateTab(index) {
  tabs.forEach((tab, i) => {
    tab.classList.toggle('active', i === index);
    tabContents[i].classList.toggle('active', i === index);
  });
  activeTabIndex = index;
  updateNavButtons();
}

function closeTab(index) {
  if (tabs.length <= 1) {
    createNewTab();
    return;
  }

  const tab = tabs[index];
  const tabContent = tabContents[index];

  tab.remove();
  tabContent.remove();

  tabs.splice(index, 1);
  tabContents.splice(index, 1);

  activeTabIndex = Math.max(0, activeTabIndex - 1);
  activateTab(activeTabIndex);
}

function getActiveWebview() {
  if (activeTabIndex === -1) return null;
  return tabContents[activeTabIndex].querySelector('webview');
}

function updateNavButtons() {
  const activeWebview = getActiveWebview();
  if (activeWebview) {
    backBtn.disabled = !activeWebview.canGoBack();
    forwardBtn.disabled = !activeWebview.canGoForward();
    refreshBtn.disabled = false;
  } else {
    backBtn.disabled = true;
    forwardBtn.disabled = true;
    refreshBtn.disabled = true;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  createNewTab('https://www.google.com');  // Здесь добавляется начальная вкладка с webview!
});

function search() {
  const query = searchInput.value.trim();
  if (query) {
    const activeWebview = getActiveWebview();
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;  // Измени на StartPOZI URL
    if (activeWebview) {
      activeWebview.src = searchUrl;
    } else {
      createNewTab(searchUrl);
    }
  }
}

backBtn.addEventListener('click', () => {
  const activeWebview = getActiveWebview();
  if (activeWebview) activeWebview.goBack();
});

forwardBtn.addEventListener('click', () => {
  const activeWebview = getActiveWebview();
  if (activeWebview) activeWebview.goForward();
});

refreshBtn.addEventListener('click', () => {
  const activeWebview = getActiveWebview();
  if (activeWebview) activeWebview.reload();
});

searchBtn.addEventListener('click', () => search());
searchInput.addEventListener('keypress', (event) => {
  if (event.key === 'Enter') search();
});

addTabBtn.addEventListener('click', () => createNewTab());

menuBtn.addEventListener('click', () => {
  dropdown.classList.toggle('show');
});

window.addEventListener('click', (event) => {
  if (!menuBtn.contains(event.target) && !dropdown.contains(event.target)) {
    dropdown.classList.remove('show');
  }
});

exitBtn.addEventListener('click', () => ipcRenderer.send('close-window'));
minBtn.addEventListener('click', () => ipcRenderer.send('minimize-window'));
maxBtn.addEventListener('click', () => ipcRenderer.send('maximize-window'));
closeBtn.addEventListener('click', () => ipcRenderer.send('close-window'));