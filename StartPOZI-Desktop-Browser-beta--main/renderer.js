const { ipcRenderer } = require('electron');
const path = require('path');

// Получаем путь к директории проекта
const appPath = __dirname;
const mainPagePath = path.join(appPath, 'MainPage');

// Элементы интерфейса
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

// Путь к стартовой странице
const START_PAGE_URL = `file://${mainPagePath}/index.html`;

// Основная функция создания новой вкладки
function createNewTab(url = START_PAGE_URL) {
  const tabId = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Создание элемента вкладки
  const tabElement = document.createElement('div');
  tabElement.className = 'tab';
  tabElement.setAttribute('data-tab-id', tabId);
  tabElement.innerHTML = `
  <img class="favicon" src="" style="display: none;">
  <span class="title">Новая вкладка</span>
  <button class="close">×</button>
  `;

  // Создание контейнера вкладки с webview
  const tabContent = document.createElement('div');
  tabContent.className = 'tab-content';
  tabContent.id = tabId;
  tabContent.setAttribute('data-tab-id', tabId);

  const webview = document.createElement('webview');
  webview.src = url;
  webview.setAttribute('useragent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  webview.setAttribute('allowpopups', '');
  webview.setAttribute('webpreferences', 'contextIsolation=no,sandbox=no,nodeIntegration=yes,enableRemoteModule=no');
  webview.setAttribute('partition', 'persist:main');

  // Проверяем существование preload.js
  const preloadPath = path.join(appPath, 'preload.js');
  try {
    require('fs').accessSync(preloadPath);
    webview.setAttribute('preload', `file://${preloadPath}`);
  } catch (e) {
    console.log('Preload script not found, skipping...');
  }

  tabContent.appendChild(webview);

  // Добавление элементов в DOM
  tabsContainer.appendChild(tabContent);
  tabsContainerTabs.insertBefore(tabElement, addTabBtn);
  tabs.push(tabElement);
  tabContents.push(tabContent);

  // Настройка обработчиков событий для webview
  setupWebviewEvents(webview, tabElement, tabId);

  // Обработчики для вкладки
  tabElement.addEventListener('click', (e) => {
    if (!e.target.classList.contains('close')) {
      activateTab(tabs.indexOf(tabElement));
    }
  });

  tabElement.querySelector('.close').addEventListener('click', (e) => {
    e.stopPropagation();
    closeTab(tabs.indexOf(tabElement));
  });

  // Активация новой вкладки
  activeTabIndex = tabs.length - 1;
  activateTab(activeTabIndex);

  return { webview, tabElement, tabContent };
}

// Настройка обработчиков событий для webview
function setupWebviewEvents(webview, tabElement, tabId) {
  // Обновление заголовка
  webview.addEventListener('page-title-updated', (event) => {
    const title = event.title || 'Новая вкладка';
    tabElement.querySelector('.title').textContent = title;

    // Если это стартовая страница, показываем специальный заголовок
    if (webview.src.includes('MainPage/index.html')) {
      tabElement.querySelector('.title').textContent = 'StartPOZI - Стартовая страница';
    }
  });

  // Обновление фавиконки
  webview.addEventListener('page-favicon-updated', (event) => {
    const faviconImg = tabElement.querySelector('.favicon');
    if (event.favicons && event.favicons.length > 0) {
      faviconImg.src = event.favicons[0];
      faviconImg.style.display = 'inline';
    } else if (webview.src.includes('MainPage/index.html')) {
      // Специальная фавиконка для стартовой страницы
      faviconImg.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🏠</text></svg>';
      faviconImg.style.display = 'inline';
    }
  });

  // Навигационные события
  webview.addEventListener('did-navigate', updateNavButtons);
  webview.addEventListener('did-navigate-in-page', updateNavButtons);
  webview.addEventListener('did-finish-load', updateNavButtons);
  webview.addEventListener('did-fail-load', updateNavButtons);

  // Обработка новых окон
  webview.addEventListener('new-window', (e) => {
    e.preventDefault();
    createNewTab(e.url);
  });

  // Готовность DOM
  webview.addEventListener('dom-ready', () => {
    // Внедряем скрипт для стартовой страницы
    if (webview.src.includes('MainPage/index.html')) {
      webview.executeJavaScript(`
      // Внедряем API для связи с браузером
      window.browserAPI = {
        openSite: function(url) {
          // Отправляем сообщение в родительский процесс
          window.postMessage({
            type: 'OPEN_SITE',
            url: url
          }, '*');
        },
        goHome: function() {
          window.postMessage({
            type: 'GO_HOME'
          }, '*');
        }
      };

      // Обработчики для сайтов на стартовой странице
      function setupStartPageEvents() {
        // Добавляем обработчики для сайтов (если они есть)
        const sitesGrid = document.getElementById('sitesGrid');
        if (sitesGrid) {
          sitesGrid.addEventListener('click', function(e) {
            const siteItem = e.target.closest('.site-item');
            if (siteItem) {
              e.preventDefault();
              const url = siteItem.getAttribute('data-url') ||
              siteItem.getAttribute('href') ||
              siteItem.querySelector('a')?.href;
              if (url) {
                window.browserAPI.openSite(url);
              }
            }
          });
        }

        // Обработчики для кнопок стартовой страницы
        const changePositionsBtn = document.getElementById('changePositions');
        if (changePositionsBtn) {
          changePositionsBtn.addEventListener('click', () => {
            alert('Функция изменения позиций сайтов');
          });
        }

        const importFromHistoryBtn = document.getElementById('importFromHistory');
        if (importFromHistoryBtn) {
          importFromHistoryBtn.addEventListener('click', () => {
            alert('Импорт из истории');
          });
        }

        const deleteSitesBtn = document.getElementById('deleteSites');
        if (deleteSitesBtn) {
          deleteSitesBtn.addEventListener('click', () => {
            alert('Удаление сайтов');
          });
        }

        const changeBackgroundBtn = document.getElementById('changeBackground');
        if (changeBackgroundBtn) {
          changeBackgroundBtn.addEventListener('click', () => {
            const backgroundMenu = document.getElementById('backgroundMenu');
            if (backgroundMenu) {
              backgroundMenu.style.display = 'block';
            }
          });
        }

        // Обработчики для меню фона
        const closeMenuBtn = document.getElementById('closeMenu');
        if (closeMenuBtn) {
          closeMenuBtn.addEventListener('click', () => {
            const backgroundMenu = document.getElementById('backgroundMenu');
            if (backgroundMenu) {
              backgroundMenu.style.display = 'none';
            }
          });
        }

        // Обработчики для опций фона
        document.querySelectorAll('.bg-option').forEach(option => {
          option.addEventListener('click', function() {
            const type = this.getAttribute('data-type');
            const backgroundMenu = document.getElementById('backgroundMenu');
            const gradientMenu = document.getElementById('gradientMenu');
            const photoMenu = document.getElementById('photoMenu');

            if (backgroundMenu) backgroundMenu.style.display = 'none';

            if (type === 'gradient' && gradientMenu) {
              gradientMenu.style.display = 'block';
            } else if (type === 'photo' && photoMenu) {
              photoMenu.style.display = 'block';
            } else if (type === 'image') {
              alert('Выбрана загрузка своей картинки');
            }
          });
        });

        // Обработчики для кнопок "Назад" в меню
        document.querySelectorAll('.gradient-menu .back-btn, #photoMenu .back-btn').forEach(btn => {
          btn.addEventListener('click', function() {
            const menu = this.closest('.gradient-menu');
            if (menu) {
              menu.style.display = 'none';
            }
            const backgroundMenu = document.getElementById('backgroundMenu');
            if (backgroundMenu) {
              backgroundMenu.style.display = 'block';
            }
          });
        });

        // Обработчики для выбора градиентов и фото
        document.querySelectorAll('.gradient-option').forEach(option => {
          option.addEventListener('click', function() {
            const gradient = this.getAttribute('data-gradient');
            const photo = this.getAttribute('data-photo');

            if (gradient) {
              document.body.style.background = window.getComputedStyle(this).background;
              alert('Градиент применен: ' + gradient);
            } else if (photo) {
              const bgImage = window.getComputedStyle(this).backgroundImage;
              document.body.style.backgroundImage = bgImage;
              document.body.style.backgroundSize = 'cover';
              alert('Фото применено: ' + photo);
            }

            // Закрываем все меню
            document.querySelectorAll('.gradient-menu, #photoMenu, #backgroundMenu').forEach(menu => {
              if (menu) menu.style.display = 'none';
            });
          });
        });
      }

      // Запускаем настройку событий
      setupStartPageEvents();
      `);
    }

    updateNavButtons();
  });

  // Слушаем сообщения от страницы
  window.addEventListener('message', (event) => {
    if (event.source === webview.contentWindow) {
      const message = event.data;
      if (message.type === 'OPEN_SITE') {
        createNewTab(message.url);
      } else if (message.type === 'GO_HOME') {
        goToStartPage();
      }
    }
  }, false);
}

// Активация вкладки
function activateTab(index) {
  if (index < 0 || index >= tabs.length) return;

  tabs.forEach((tab, i) => {
    const isActive = i === index;
    tab.classList.toggle('active', isActive);
    tabContents[i].classList.toggle('active', isActive);
  });

  activeTabIndex = index;
  updateNavButtons();

  // Обновление URL в адресной строке
  const webview = getActiveWebview();
  if (webview) {
    const currentUrl = webview.src;
    if (currentUrl.includes('MainPage/index.html')) {
      searchInput.value = '';
      searchInput.placeholder = 'StartPOZI - Стартовая страница';
    } else {
      searchInput.value = currentUrl;
      searchInput.placeholder = 'Введите URL или поисковый запрос';
    }
  }
}

// Закрытие вкладки
function closeTab(index) {
  if (tabs.length <= 1) {
    // Если закрывается последняя вкладка, создаем новую со стартовой страницей
    createNewTab(START_PAGE_URL);
    return;
  }

  const tab = tabs[index];
  const tabContent = tabContents[index];

  // Удаление элементов
  tab.remove();
  tabContent.remove();

  // Удаление из массивов
  tabs.splice(index, 1);
  tabContents.splice(index, 1);

  // Актуализация активной вкладки
  if (activeTabIndex >= index) {
    activeTabIndex = Math.max(0, activeTabIndex - 1);
  }

  activateTab(activeTabIndex);
}

// Получение активного webview
function getActiveWebview() {
  if (activeTabIndex === -1 || activeTabIndex >= tabContents.length) return null;
  return tabContents[activeTabIndex].querySelector('webview');
}

// Обновление кнопок навигации
function updateNavButtons() {
  const activeWebview = getActiveWebview();
  if (activeWebview) {
    try {
      backBtn.disabled = !activeWebview.canGoBack();
      forwardBtn.disabled = !activeWebview.canGoForward();
      refreshBtn.disabled = false;
    } catch (e) {
      console.error('Error updating nav buttons:', e);
    }
  } else {
    backBtn.disabled = true;
    forwardBtn.disabled = true;
    refreshBtn.disabled = true;
  }
}

// Функция поиска/перехода по URL
function search() {
  const query = searchInput.value.trim();
  if (!query) return;

  const activeWebview = getActiveWebview();
  const currentUrl = activeWebview ? activeWebview.src : '';
  const isStartPage = currentUrl.includes('MainPage/index.html');

  let targetUrl = query;

  // Проверка, является ли запрос URL
  if (!query.includes('://') && !query.startsWith('file://') && !query.startsWith('about:')) {
    if (query.includes('.') && !query.includes(' ')) {
      // Похоже на домен
      targetUrl = 'http://' + query;
    } else {
      // Поисковый запрос
      targetUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }
  }

  if (activeWebview && !isStartPage) {
    // Если есть активная вкладка и это не стартовая страница, используем ее
    activeWebview.src = targetUrl;
  } else {
    // Иначе создаем новую вкладку
    createNewTab(targetUrl);
  }
}

// Переход на стартовую страницу
function goToStartPage() {
  const activeWebview = getActiveWebview();
  if (activeWebview) {
    activeWebview.src = START_PAGE_URL;
  } else {
    createNewTab(START_PAGE_URL);
  }
}

// Инициализация при загрузке DOM
document.addEventListener('DOMContentLoaded', () => {
  createNewTab(START_PAGE_URL);

  // Добавляем кнопку "Домой" в интерфейс
  if (!document.getElementById('home')) {
    const homeBtn = document.createElement('button');
    homeBtn.id = 'home';
    homeBtn.className = 'nav-btn';
    homeBtn.innerHTML = '🏠';
    homeBtn.title = 'Стартовая страница';

    // Вставляем кнопку домой перед кнопкой "Назад"
    const navContainer = document.querySelector('.nav-buttons') ||
    document.querySelector('.nav-controls') ||
    document.querySelector('.search-container');

    if (navContainer && backBtn) {
      navContainer.insertBefore(homeBtn, backBtn);
      homeBtn.addEventListener('click', goToStartPage);
    }
  }
});

// Обработчики событий для элементов управления

// Навигационные кнопки
backBtn.addEventListener('click', () => {
  const activeWebview = getActiveWebview();
  if (activeWebview && activeWebview.canGoBack()) {
    activeWebview.goBack();
  }
});

forwardBtn.addEventListener('click', () => {
  const activeWebview = getActiveWebview();
  if (activeWebview && activeWebview.canGoForward()) {
    activeWebview.goForward();
  }
});

refreshBtn.addEventListener('click', () => {
  const activeWebview = getActiveWebview();
  if (activeWebview) {
    activeWebview.reload();
  }
});

// Поиск и адресная строка
searchBtn.addEventListener('click', search);

searchInput.addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    search();
  }
});

// Добавление новой вкладки
addTabBtn.addEventListener('click', () => createNewTab());

// Меню и выпадающий список
menuBtn.addEventListener('click', () => {
  dropdown.classList.toggle('show');
});

window.addEventListener('click', (event) => {
  if (!menuBtn.contains(event.target) && !dropdown.contains(event.target)) {
    dropdown.classList.remove('show');
  }
});

// Обработчики IPC для управления окном
exitBtn.addEventListener('click', () => ipcRenderer.send('close-window'));
minBtn.addEventListener('click', () => ipcRenderer.send('minimize-window'));
maxBtn.addEventListener('click', () => ipcRenderer.send('maximize-window'));
closeBtn.addEventListener('click', () => ipcRenderer.send('close-window'));

// Добавляем стили для кнопки "Домой"
const style = document.createElement('style');
style.textContent = `
#home {
background: none;
border: none;
color: #fff;
font-size: 16px;
cursor: pointer;
padding: 5px 10px;
border-radius: 3px;
transition: background 0.2s;
}

#home:hover {
background: rgba(255, 255, 255, 0.1);
}

.tab-context-menu {
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.1);
  padding: 5px 0;
  min-width: 200px;
}

.menu-item {
  padding: 8px 15px;
  cursor: pointer;
  font-size: 14px;
}

.menu-item:hover {
  background: #f0f0f0;
}
`;
document.head.appendChild(style);

// Контекстное меню для вкладок
tabsContainerTabs.addEventListener('contextmenu', (e) => {
  const tabElement = e.target.closest('.tab');
  if (tabElement) {
    e.preventDefault();

    const existingMenu = document.querySelector('.tab-context-menu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'tab-context-menu';
    menu.innerHTML = `
    <div class="menu-item" data-action="close">Закрыть вкладку</div>
    <div class="menu-item" data-action="close-others">Закрыть другие вкладки</div>
    <div class="menu-item" data-action="close-right">Закрыть вкладки справа</div>
    <div class="menu-item" data-action="reload">Перезагрузить</div>
    <div class="menu-item" data-action="duplicate">Дублировать вкладку</div>
    `;

    menu.style.position = 'fixed';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.style.zIndex = '10000';

    document.body.appendChild(menu);

    // Обработчики для пунктов меню
    menu.querySelectorAll('.menu-item').forEach(item => {
      item.addEventListener('click', () => {
        const tabIndex = tabs.indexOf(tabElement);
        const action = item.getAttribute('data-action');

        switch (action) {
          case 'close':
            closeTab(tabIndex);
            break;
          case 'close-others':
            const tabsToClose = tabs.filter((tab, i) => i !== tabIndex);
            tabsToClose.forEach((tab, i) => {
              const idx = tabs.indexOf(tab);
              closeTab(idx);
            });
            break;
          case 'close-right':
            const tabsRight = tabs.slice(tabIndex + 1);
            tabsRight.forEach(tab => {
              const idx = tabs.indexOf(tab);
              closeTab(idx);
            });
            break;
          case 'reload':
            const webview = tabContents[tabIndex].querySelector('webview');
            if (webview) webview.reload();
            break;
          case 'duplicate':
            const originalWebview = tabContents[tabIndex].querySelector('webview');
            if (originalWebview) {
              createNewTab(originalWebview.src);
            }
            break;
        }

        menu.remove();
      });
    });

    // Закрытие меню при клике вне его
    const closeMenu = () => {
      if (menu && menu.parentNode) {
        menu.remove();
      }
      document.removeEventListener('click', closeMenu);
    };

    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 100);
  }
});

// Автоматическое обновление адресной строки при навигации
function setupAddressBarUpdates() {
  const observer = new MutationObserver(() => {
    const webview = getActiveWebview();
    if (webview) {
      webview.addEventListener('did-navigate', () => {
        const currentUrl = webview.src;
        if (currentUrl.includes('MainPage/index.html')) {
          searchInput.value = '';
          searchInput.placeholder = 'StartPOZI - Стартовая страница';
        } else {
          searchInput.value = currentUrl;
        }
      });
    }
  });

  observer.observe(tabsContainer, { childList: true, subtree: true });
}

// Запускаем отслеживание изменений вкладок
setupAddressBarUpdates();

console.log('Renderer loaded. Start page URL:', START_PAGE_URL);
