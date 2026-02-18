const START_PAGE = 'MainPage/index.html';
const SETTINGS_PAGE = 'Settings.html';

let tabs = [];
let views = [];
let active = 0;

let tabsBar, tabsArea, addressBar, addTabBtn, downloadsBtn, downloadsIcon, extensionsBtn;

let currentSearchEngine = localStorage.getItem('searchEngineUrl') || 'https://startpozi.netlify.app/search.html?q=';

let downloads = JSON.parse(localStorage.getItem('browserDownloads') || '[]');
let sessionDownloads = [];
let ongoingDownloads = new Map();
let activeDownloads = 0;
let downloadUpdateInterval = null;
let hasNewDownloads = false;

let passwords = [];

let isIncognito = window.__isIncognito === true;

// ========== ПЕРЕМЕЩЁННЫЕ В НАЧАЛО ОБЪЯВЛЕНИЯ (ДЛЯ ИЗБЕЖАНИЯ ReferenceError) ==========

let pinnedTabs = new Set();
let tabGroups = new Map();
let closedTabsHistory = [];

// Функции управления вкладками
function createTab(url = START_PAGE) {
  try {
    if (!tabsBar || !addTabBtn) return;

    // --- Создание элемента вкладки ---
    const tab = document.createElement('div');
    tab.className = 'tab';

    // Добавляем favicon через утилиту из index.html (или собственную заглушку)
    let faviconElement;
    if (window.TabUtils && typeof window.TabUtils.createFaviconElement === 'function') {
      faviconElement = window.TabUtils.createFaviconElement(url);
    } else {
      // Запасной вариант, если TabUtils не доступен
      faviconElement = document.createElement('div');
      faviconElement.className = 'tab-favicon default-favicon';
      try {
        const domain = new URL(url.startsWith('http') ? url : 'https://' + url).hostname;
        faviconElement.textContent = domain.charAt(0).toUpperCase();
      } catch {
        faviconElement.textContent = 'S';
      }
    }
    tab.appendChild(faviconElement);

    // Заголовок вкладки
    const titleSpan = document.createElement('span');
    titleSpan.className = 'title';
    titleSpan.textContent = 'Загрузка...';
    tab.appendChild(titleSpan);

    // Кнопка закрытия
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close';
    closeBtn.innerHTML = '×';
    tab.appendChild(closeBtn);

    // --- Создание контейнера для содержимого (webview) ---
    const view = document.createElement('div');
    view.className = 'tab-content';

    const webview = document.createElement('webview');
    webview.src = url;
    webview.style = 'width:100%; height:100%';
    webview.setAttribute('allowpopups', 'true');
    webview.setAttribute('partition', 'persist:webview');
    webview.setAttribute('disablewebsecurity', 'true');

    view.appendChild(webview);
    tabsArea.appendChild(view);
    tabsBar.insertBefore(tab, addTabBtn);

    // Добавляем в массивы
    tabs.push(tab);
    views.push(view);
    const newIndex = tabs.length - 1;
    active = newIndex;

    // --- Обработчики событий webview ---
    webview.addEventListener('context-menu', (e) => {
      e.preventDefault();
      const params = e.params || {};
      let type = 'none';
      if (params.linkURL) type = 'link';
      else if (params.srcURL && params.mediaType === 'image') type = 'image';
      else if (params.selectionText) type = 'selection';
      else if (params.isEditable) type = 'editable';
      handleWebViewContextMenu(webview, {
        type: type,
        data: {
          url: params.linkURL,
          src: params.srcURL,
          text: params.selectionText
        },
        x: params.x,
        y: params.y
      });
    });

    // Обновление favicon и заголовка при загрузке страницы
    const updateTabInfo = () => {
      try {
        const currentUrl = webview.getURL();
        const title = webview.getTitle() || 'Новая вкладка';

        // Обновляем заголовок
        tab.querySelector('.title').textContent = title.substring(0, 30);

        // Обновляем favicon, если это не внутренняя страница
        if (currentUrl && !isInternalPage(currentUrl)) {
          const currentFavicon = tab.querySelector('.tab-favicon');
          if (currentFavicon) {
            const newFavicon = window.TabUtils?.createFaviconElement(currentUrl);
            if (newFavicon) {
              currentFavicon.replaceWith(newFavicon);
            }
          }
        }

        // Обновляем адресную строку, если вкладка активна
        if (active === newIndex) {
          addressBar.value = (currentUrl && !isInternalPage(currentUrl)) ? currentUrl : '';
          updateNavButtons();
        }

        // Сохраняем в историю
        if (currentUrl && !isInternalPage(currentUrl)) {
          updateHistory(currentUrl, title);
        }
      } catch (error) {}
    };

    webview.addEventListener('did-navigate', updateTabInfo);
    webview.addEventListener('did-navigate-in-page', updateTabInfo);
    webview.addEventListener('page-title-updated', updateTabInfo);
    webview.addEventListener('dom-ready', updateTabInfo);

    webview.addEventListener('new-window', e => {
      e.preventDefault();
      if (e.url && e.url !== 'about:blank') createTab(e.url);
    });

      // Обработка клика по вкладке
      tab.addEventListener('click', e => {
        if (!e.target.classList.contains('close')) activateTab(newIndex);
      });

        closeBtn.onclick = e => {
          e.stopPropagation();
          closeTab(newIndex);
        };

        // Применяем настройки безопасности к webview
        webview.addEventListener('dom-ready', () => {
          setTimeout(() => {
            applySecuritySettingsToWebView(webview);
          }, 200);
        });

        // Выгрузка неактивных вкладок и обработка крашей
        scheduleTabUnload(newIndex);
        setupCrashHandler(webview, newIndex);

        // Активируем новую вкладку
        activateTab(newIndex);
        saveTabsState();

  } catch (error) {
    console.error('Ошибка при создании вкладки:', error);
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
      if (addressBar) addressBar.value = u?.includes('MainPage') || u?.includes('Settings.html') ? '' : u;
      updateNavButtons();
    }
    if (wv) setTimeout(() => wv.focus(), 100);
  } catch (error) {}
}

function closeTab(i) {
  if (tabs.length <= 1) return;
  const webview = views[i].querySelector('webview');
  if (webview) {
    const url = webview.getURL();
    const title = tabs[i].querySelector('.title').textContent;
    closedTabsHistory.push({
      url: url,
      title: title || 'Без названия',
      favicon: webview.favicon || '',
      timestamp: Date.now()
    });
    if (closedTabsHistory.length > 20) closedTabsHistory.shift();
  }
  tabsBar.removeChild(tabs[i]);
  tabsArea.removeChild(views[i]);
  tabs.splice(i, 1);
  views.splice(i, 1);
  if (active >= tabs.length) active = tabs.length - 1;
  activateTab(active);
  saveTabsState();
}

function goBack() {
  if (views[active]?.querySelector('webview')) views[active].querySelector('webview').goBack();
}

function goForward() {
  if (views[active]?.querySelector('webview')) views[active].querySelector('webview').goForward();
}

function reload() {
  if (views[active]?.querySelector('webview')) views[active].querySelector('webview').reload();
}

function updateNavButtons() {
  const wv = views[active]?.querySelector('webview');
  if (wv) {
    const backBtn = document.getElementById('back');
    const forwardBtn = document.getElementById('forward');
    if (backBtn) backBtn.disabled = !wv.canGoBack();
    if (forwardBtn) forwardBtn.disabled = !wv.canGoForward();
  }
}

function saveTabsState() {
  try {
    const saveTabsEnabled = localStorage.getItem('saveTabs') === 'true';
    const saveInternalPages = localStorage.getItem('saveInternalPages') === 'true';
    if (!saveTabsEnabled) {
      localStorage.setItem('savedTabs', JSON.stringify([]));
      return;
    }
    const urlsToSave = [];
    for (let i = 0; i < views.length; i++) {
      const view = views[i];
      const webview = view?.querySelector('webview');
      if (!webview) continue;
      setTimeout(() => {
        try {
          const url = webview.getURL();
          if (!url || url === 'about:blank') return;
          const isInternalPage = url.includes('MainPage') || url.includes('Settings.html') || url.includes('internal-page') || url.startsWith('file://');
          if (!saveInternalPages && isInternalPage) return;
          urlsToSave.push(url);
          if (urlsToSave.length > 0) localStorage.setItem('savedTabs', JSON.stringify(urlsToSave));
        } catch (error) {}
      }, 100);
    }
    if (urlsToSave.length > 0) localStorage.setItem('savedTabs', JSON.stringify(urlsToSave));
  } catch (error) {}
}

function updateHistory(url, title = '') {
  if (!url || url.includes('MainPage') || url.includes('Settings.html')) return;
  try {
    const cleanUrl = url.split('#')[0].split('?')[0];
    const cleanTitle = title.trim() || new URL(url).hostname || 'Без названия';
    let h = JSON.parse(localStorage.getItem('browserHistory') || '[]');
    h = h.filter(x => x.url !== cleanUrl);
    h.push({ url: cleanUrl, title: cleanTitle, time: Date.now() });
    if (h.length > 500) h.shift();
    localStorage.setItem('browserHistory', JSON.stringify(h));
    views.forEach(view => {
      const wv = view.querySelector('webview');
      if (wv && wv.getURL().includes('Settings.html')) wv.send('history-updated');
    });
  } catch (error) {}
}

function openInternalPage(title, content) {
  createTab('about:blank');
  const wv = views[active].querySelector('webview');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>body{background:#0f0f17;color:#eee;font-family:system-ui;padding:20px;margin:0}h1{color:#00c8ff}</style></head><body><h1>${title}</h1>${content}</body></html>`;
  wv.loadURL('data:text/html,' + encodeURIComponent(html));
}

function showBookmarks() {
  // можно реализовать позже
}

function showDownloads() {
  createTab(SETTINGS_PAGE);
}

function showPasswordsManager() {
  createTab('Settings.html#passwords');
}

function showHistory() {
  createTab(SETTINGS_PAGE);
}

function showAbout() {
  openInternalPage('О браузере', '<h2>StartPOZI 2025</h2><p>Всё работает идеально!</p>');
}

function restartBrowser() {
  window.electronAPI.invoke('restart-browser').then(result => {
    if (result && result.success) showToast('Браузер перезапускается...', 3000);
  });
}

function loadTheme() {
  try {
    const t = localStorage.getItem('themeMode') || 'system';
    let className;
    if (t === 'system') className = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'theme-dark' : 'theme-light';
    else className = `theme-${t}`;
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(className);
  } catch (error) {}
}

async function loadExtensionsDropdown() {
  const list = document.getElementById('extensionsListDropdown');
  if (!list) return;
  try {
    if (!window.electronAPI) {
      list.innerHTML = '<div class="no-extensions">Browser API not available</div>';
      return;
    }
    list.innerHTML = '<div class="no-extensions">Loading extensions...</div>';
    const [plugins, savedStates] = await Promise.all([
      window.electronAPI.invoke('get-plugins').catch(() => []),
                                                     window.electronAPI.invoke('load-extension-states').catch(() => ({}))
    ]);
    if (!plugins || plugins.length === 0) {
      list.innerHTML = '<div class="no-extensions">No extensions installed</div>';
      const addBtn = document.createElement('div');
      addBtn.className = 'menu-item';
      addBtn.innerHTML = '<span style="color: #0a84ff; font-weight: 600;">+ Add Extension</span>';
      addBtn.onclick = async () => {
        try {
          const result = await window.electronAPI.invoke('add-plugin');
          if (result?.success) {
            showToast(result.message);
            loadExtensionsDropdown();
          } else showToast(result?.message || 'Failed to add extension', 'error');
        } catch (error) {
          showToast('Error adding extension', 'error');
        }
      };
      list.appendChild(addBtn);
      return;
    }
    const updatedPlugins = plugins.map(plugin => savedStates.hasOwnProperty(plugin.id) ? { ...plugin, enabled: savedStates[plugin.id] } : plugin);
    const enabledPlugins = updatedPlugins.filter(p => p.enabled);
    const disabledPlugins = updatedPlugins.filter(p => !p.enabled);
    list.innerHTML = '';
    if (enabledPlugins.length > 0) {
      const enabledHeader = document.createElement('div');
      enabledHeader.className = 'extensions-section-header';
      enabledHeader.textContent = `Enabled (${enabledPlugins.length})`;
      list.appendChild(enabledHeader);
      enabledPlugins.forEach(plugin => {
        list.appendChild(createExtensionElement(plugin));
      });
    }
    if (disabledPlugins.length > 0) {
      const disabledHeader = document.createElement('div');
      disabledHeader.className = 'extensions-section-header';
      disabledHeader.textContent = `Disabled (${disabledPlugins.length})`;
      list.appendChild(disabledHeader);
      disabledPlugins.forEach(plugin => {
        list.appendChild(createExtensionElement(plugin));
      });
    }
    setupExtensionEventHandlers();
  } catch (error) {
    list.innerHTML = '<div class="no-extensions">Error loading extensions</div>';
  }
}

function createExtensionElement(plugin) {
  const div = document.createElement('div');
  div.className = `extension-item-dropdown ${plugin.enabled ? 'enabled' : 'disabled'}`;
  div.setAttribute('data-id', plugin.id);
  div.innerHTML = `
  <div class="extension-header">
  <div class="extension-icon-small" style="background-image: url('${getExtensionIcon(plugin)}')"></div>
  <span class="extension-name">${plugin.name}</span>
  <span class="extension-version">v${plugin.version}</span>
  </div>
  <div class="extension-status">
  <span class="status-badge ${plugin.enabled ? 'enabled' : 'disabled'}">${plugin.enabled ? 'Включено' : 'Отключено'}</span>
  </div>
  <div class="extension-actions">
  <button class="extension-action-btn toggle-btn" data-id="${plugin.id}" data-enabled="${plugin.enabled}">${plugin.enabled ? 'Выключить' : 'Включить'}</button>
  ${!plugin.isSystem ? `<button class="extension-action-btn remove-btn" data-id="${plugin.id}">Удалить</button>` : ''}
  ${plugin.hasPopup ? `<button class="extension-action-btn popup-btn" data-id="${plugin.id}">Меню</button>` : ''}
  </div>
  `;
  return div;
}

function setupExtensionEventHandlers() {
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const pluginId = btn.dataset.id;
      const currentlyEnabled = btn.dataset.enabled === 'true';
      const newState = !currentlyEnabled;
      try {
        const result = await window.electronAPI.invoke('toggle-plugin', pluginId, newState);
        if (result.success) {
          const extensionItem = btn.closest('.extension-item-dropdown');
          if (extensionItem) {
            extensionItem.className = `extension-item-dropdown ${newState ? 'enabled' : 'disabled'}`;
            const statusBadge = extensionItem.querySelector('.status-badge');
            if (statusBadge) {
              statusBadge.className = `status-badge ${newState ? 'enabled' : 'disabled'}`;
              statusBadge.textContent = newState ? 'Включено' : 'Отключено';
            }
            btn.dataset.enabled = newState;
            btn.textContent = newState ? 'Выключить' : 'Включить';
            setTimeout(() => loadExtensionsDropdown(), 100);
          }
          showToast(result.message);
        } else showToast(result.message, 'error');
      } catch (error) {
        showToast('Ошибка при переключении расширения', 'error');
      }
    };
  });

  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const pluginId = btn.dataset.id;
      const pluginName = btn.closest('.extension-item-dropdown').querySelector('.extension-name').textContent;
      if (confirm(`Вы уверены, что хотите удалить расширение "${pluginName}"?`)) {
        try {
          const result = await window.electronAPI.invoke('remove-plugin', pluginId);
          if (result.success) {
            showToast(result.message);
            const extensionItem = btn.closest('.extension-item-dropdown');
            if (extensionItem) {
              extensionItem.style.opacity = '0.5';
              setTimeout(() => {
                extensionItem.remove();
                setTimeout(() => loadExtensionsDropdown(), 100);
              }, 300);
            }
          } else showToast(result.message, 'error');
        } catch (error) {
          showToast('Ошибка при удалении расширения', 'error');
        }
      }
    };
  });

  document.querySelectorAll('.popup-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const pluginId = btn.dataset.id;
      try {
        showToast('Открытие меню расширения...');
        const result = await window.electronAPI.invoke('open-plugin-popup', pluginId);
        if (result && result.success) {
          document.getElementById('extensionsDropdown').classList.remove('show');
          showExtensionPopup(result);
          showToast(`Меню "${result.extension.name}" открыто`);
        } else showToast(result?.message || 'Не удалось открыть меню', 'error');
      } catch (error) {
        showToast('Ошибка: ' + error.message, 'error');
      }
    };
  });
}

function getExtensionIcon(plugin) {
  if (plugin.manifest) {
    if (plugin.manifest.browser_action && plugin.manifest.browser_action.default_icon) {
      const icon = plugin.manifest.browser_action.default_icon;
      if (typeof icon === 'string') {
        const iconPath = icon;
        if (plugin.path) return `file://${plugin.path}/${iconPath}`.replace(/\\/g, '/');
      } else if (typeof icon === 'object') {
        const sizes = ['32', '48', '16', '128'];
        for (const size of sizes) {
          if (icon[size] && plugin.path) return `file://${plugin.path}/${icon[size]}`.replace(/\\/g, '/');
        }
      }
    }
    if (plugin.manifest.action && plugin.manifest.action.default_icon) {
      const icon = plugin.manifest.action.default_icon;
      if (typeof icon === 'string') {
        const iconPath = icon;
        if (plugin.path) return `file://${plugin.path}/${iconPath}`.replace(/\\/g, '/');
      } else if (typeof icon === 'object') {
        const sizes = ['32', '48', '16', '128'];
        for (const size of sizes) {
          if (icon[size] && plugin.path) return `file://${plugin.path}/${icon[size]}`.replace(/\\/g, '/');
        }
      }
    }
    if (plugin.manifest.icons) {
      const icons = plugin.manifest.icons;
      const sizes = ['32', '48', '16', '128', '64'];
      for (const size of sizes) {
        if (icons[size] && plugin.path) return `file://${plugin.path}/${icons[size]}`.replace(/\\/g, '/');
      }
    }
  }
  if (plugin.icons) {
    const sizes = ['32', '48', '16', '128'];
    for (const size of sizes) {
      if (plugin.icons[size]) return plugin.icons[size];
    }
  }
  return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="%230a84ff"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>';
}

// Новые функции из исходного кода (оптимизация памяти, PiP и т.д.)
let unloadTimers = new Map();
const UNLOAD_DELAY = 30 * 60 * 1000; // 30 минут

function scheduleTabUnload(tabIndex) {
  if (tabIndex === active) return;
  if (unloadTimers.has(tabIndex)) clearTimeout(unloadTimers.get(tabIndex));
  const timer = setTimeout(() => {
    const webview = views[tabIndex]?.querySelector('webview');
    if (webview && tabIndex !== active) {
      const url = webview.getURL();
      webview.dataset.unloadedUrl = url;
      webview.src = 'about:blank';
      webview.classList.add('unloaded');
      console.log(`⏳ Вкладка ${tabIndex} выгружена (неактивна >30 мин)`);
    }
    unloadTimers.delete(tabIndex);
  }, UNLOAD_DELAY);
  unloadTimers.set(tabIndex, timer);
}

function restoreTabIfUnloaded(tabIndex) {
  const webview = views[tabIndex]?.querySelector('webview');
  if (webview && webview.classList.contains('unloaded')) {
    const url = webview.dataset.unloadedUrl || START_PAGE;
    webview.src = url;
    webview.classList.remove('unloaded');
    console.log(`🔄 Вкладка ${tabIndex} восстановлена`);
  }
  if (unloadTimers.has(tabIndex)) {
    clearTimeout(unloadTimers.get(tabIndex));
    unloadTimers.delete(tabIndex);
  }
}

// Переопределяем createTab с учётом выгрузки и краша (будет позже в полном коде)

function setupCrashHandler(webview, tabIndex) {
  webview.addEventListener('crashed', (event) => {
    console.error(`💥 WebView упал (вкладка ${tabIndex})`, event);
    const sadPage = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>Страница упала</title>
    <style>body{background:#1e1e1e;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;}</style>
    </head>
    <body>
    <h1>😞 Что‑то пошло не так</h1>
    <p>Страница аварийно завершила работу.</p>
    <button onclick="location.reload()" style="padding:10px 20px;background:#0a84ff;border:none;border-radius:8px;color:#fff;cursor:pointer;">Перезагрузить</button>
    </body>
    </html>
    `;
    webview.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(sadPage)}`);
  });
}

function togglePinTab(index) {
  if (pinnedTabs.has(index)) {
    pinnedTabs.delete(index);
    tabs[index]?.classList.remove('pinned');
  } else {
    pinnedTabs.add(index);
    tabs[index]?.classList.add('pinned');
  }
  reorderTabsByPin();
  saveTabsState();
}

function reorderTabsByPin() {
  // пока просто заглушка
}

function createGroup(name, tabIndices) {
  tabGroups.set(name, tabIndices);
}

async function showTabManager() {
  const overlay = document.createElement('div');
  overlay.className = 'tab-manager-overlay';
  overlay.style.cssText = `
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgba(0,0,0,0.9); z-index: 1000000;
  display: flex; flex-wrap: wrap; gap: 20px; padding: 20px;
  overflow-y: auto;
  `;

  for (let i = 0; i < views.length; i++) {
    const webview = views[i]?.querySelector('webview');
    if (!webview) continue;
    const thumbnail = await webview.capturePage();
    const dataUrl = thumbnail.toDataURL();

    const card = document.createElement('div');
    card.className = 'tab-thumbnail';
    card.innerHTML = `
    <img src="${dataUrl}" style="width:200px;height:150px;object-fit:cover;border-radius:10px;">
    <div>${tabs[i]?.querySelector('.title')?.textContent || 'Вкладка'}</div>
    `;
    card.onclick = () => {
      activateTab(i);
      overlay.remove();
    };
    overlay.appendChild(card);
  }

  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}

async function detachVideo(webview) {
  const url = webview.getURL();
  if (url.includes('youtube.com/watch')) {
    const videoId = new URL(url).searchParams.get('v');
    if (videoId) {
      try {
        await webview.executeJavaScript(`
        const video = document.querySelector('video');
        if (video) video.pause();
        `);
      } catch (e) {}

      const result = await window.electronAPI.openPlayerWindow(videoId, webview.getTitle());
      if (result.success) {
        showToast('Видео открыто в отдельном плеере');
      } else {
        console.error('Ошибка плеера:', result.message);
        if (confirm('Не удалось открыть плеер. Открыть видео в браузере?')) {
          window.electronAPI.openExternalUrl(`https://www.youtube.com/watch?v=${videoId}`);
        } else {
          showToast('Ошибка: ' + result.message, 'error');
        }
      }
    } else {
      showToast('Не удалось определить ID видео', 'warning');
    }
  } else {
    showToast('Функция пока только для YouTube', 'warning');
  }
}

async function requestPiP(webview) {
  try {
    const result = await webview.executeJavaScript(`
    (async function() {
      function findVideoDeep(context) {
        let video = context.querySelector('video');
        if (video) return video;

        const iframes = context.querySelectorAll('iframe');
        for (const iframe of iframes) {
          try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (doc) {
              video = findVideoDeep(doc);
              if (video) return video;
            }
          } catch (e) {}
        }
        return null;
      }

      const video = findVideoDeep(document);
      if (!video) {
        return { success: false, reason: 'no_video' };
      }

      if (!document.pictureInPictureEnabled) {
        return { success: false, reason: 'pip_not_supported' };
      }

      try {
        await video.requestPictureInPicture();
        return { success: true };
      } catch (err) {
        return { success: false, reason: err.toString() };
      }
    })()
    `);

    console.log('Результат PiP:', result);
    if (result?.success) {
      showToast('Режим PiP активирован');
    } else {
      showToast('PiP не работает: ' + (result?.reason || 'неизвестная ошибка'), 'error');
    }
  } catch (error) {
    console.error('Ошибка executeJavaScript:', error);
    showToast('Ошибка при вызове PiP', 'error');
  }
}

// ========== КОНЕЦ ПЕРЕМЕЩЁННЫХ ОБЪЯВЛЕНИЙ ==========

// ========== ОСТАЛЬНОЙ КОД БЕЗ ИЗМЕНЕНИЙ ==========

async function refreshPasswordsFromSystem() {
  try {
    const data = await window.electronAPI.getPasswords();
    passwords = data || [];
    if (typeof updatePasswordsDropdown === 'function') {
      updatePasswordsDropdown();
    }
  } catch (e) {
    console.error('Ошибка синхронизации паролей:', e);
  }
}

refreshPasswordsFromSystem();

let sessionMasterPassword = null;

let securitySettings = {
  blockTrackers: true,
  blockAds: true,
  blockMiners: true,
  blockPhishing: true,
  blockMalware: true,
  blockFingerprinting: true,
  blockSocialMediaTrackers: true,
  blockCookieWalls: false,
  blockPopups: true,
  blockAutoplay: false,
  enhancedPrivacy: true
};

let securityStats = {
  blockedToday: 0,
  totalBlocked: 0,
  trackersBlocked: 0,
  adsBlocked: 0,
  minersBlocked: 0,
  phishingBlocked: 0,
  malwareBlocked: 0,
  fingerprintingBlocked: 0,
  lastResetDate: new Date().toDateString()
};

function applyCustomTheme(css) {
  let styleEl = document.getElementById('custom-theme');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'custom-theme';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = css;
}

function removeCustomTheme() {
  const styleEl = document.getElementById('custom-theme');
  if (styleEl) {
    styleEl.remove();
  }
}

function applySecuritySettingsToWebView(webview) {
  if (!webview || !securitySettings) return;
  try {
    webview.send('security-settings', securitySettings);
  } catch (error) {
    console.error('Ошибка отправки настроек безопасности в webview:', error);
  }
}

function updateAllWebViewsSecuritySettings() {
  views.forEach((view, index) => {
    const webview = view?.querySelector('webview');
    if (webview) {
      setTimeout(() => {
        applySecuritySettingsToWebView(webview);
      }, 100);
    }
  });
}

function loadSecuritySettings() {
  try {
    const savedSettings = localStorage.getItem('securitySettings');
    if (savedSettings) {
      securitySettings = { ...securitySettings, ...JSON.parse(savedSettings) };
    }

    const savedStats = localStorage.getItem('securityStats');
    if (savedStats) {
      securityStats = JSON.parse(savedStats);
      if (securityStats.lastResetDate !== new Date().toDateString()) {
        securityStats.blockedToday = 0;
        securityStats.lastResetDate = new Date().toDateString();
        saveSecurityStats();
      }
    }

    updateSecurityUI();
    setTimeout(() => {
      updateAllWebViewsSecuritySettings();
    }, 500);
  } catch (error) {
    console.error('Ошибка загрузки настроек безопасности:', error);
  }
}

function saveSecuritySettings() {
  try {
    localStorage.setItem('securitySettings', JSON.stringify(securitySettings));
    updateSecurityUI();
    updateAllWebViewsSecuritySettings();
  } catch (error) {
    console.error('Ошибка сохранения настроек безопасности:', error);
  }
}

function saveSecurityStats() {
  try {
    localStorage.setItem('securityStats', JSON.stringify(securityStats));
    updateSecurityStatsUI();
  } catch (error) {
    console.error('Ошибка сохранения статистики безопасности:', error);
  }
}

function incrementBlockedCounter(type = 'tracker') {
  securityStats.blockedToday++;
  securityStats.totalBlocked++;

  switch (type) {
    case 'tracker':
      securityStats.trackersBlocked++;
      break;
    case 'ad':
      securityStats.adsBlocked++;
      break;
    case 'miner':
      securityStats.minersBlocked++;
      break;
    case 'phishing':
      securityStats.phishingBlocked++;
      break;
    case 'malware':
      securityStats.malwareBlocked++;
      break;
    case 'fingerprinting':
      securityStats.fingerprintingBlocked++;
      break;
  }

  saveSecurityStats();
  updateSecurityBadge();
}

function updateSecurityBadge() {
  const securityBtn = document.getElementById('securityBtn');
  if (!securityBtn) return;

  let badge = securityBtn.querySelector('.security-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'security-badge';
    securityBtn.appendChild(badge);
  }

  if (securityStats.blockedToday > 0) {
    badge.textContent = securityStats.blockedToday > 99 ? '99+' : securityStats.blockedToday;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function updateSecurityUI() {
  Object.keys(securitySettings).forEach(key => {
    const checkbox = document.getElementById(key);
    if (checkbox) {
      checkbox.checked = securitySettings[key];
    }
  });
  updateSecurityStatsUI();
}

function updateSecurityStatsUI() {
  const blockedTodayEl = document.getElementById('blockedToday');
  const totalBlockedEl = document.getElementById('totalBlocked');

  if (blockedTodayEl) {
    blockedTodayEl.textContent = securityStats.blockedToday;
  }

  if (totalBlockedEl) {
    totalBlockedEl.textContent = securityStats.totalBlocked;
  }

  updateSecurityBadge();
}

function clearSecurityData() {
  if (confirm('Вы уверены, что хотите очистить всю статистику безопасности?')) {
    securityStats = {
      blockedToday: 0,
      totalBlocked: 0,
      trackersBlocked: 0,
      adsBlocked: 0,
      minersBlocked: 0,
      phishingBlocked: 0,
      malwareBlocked: 0,
      fingerprintingBlocked: 0,
      lastResetDate: new Date().toDateString()
    };
    saveSecurityStats();
    showToast('Данные безопасности очищены');
  }
}

function showSecurityReport() {
  const report = `
  <div style="padding: 20px; font-family: system-ui;">
  <h2 style="color: var(--menu-text); margin-bottom: 20px;">Отчет безопасности</h2>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
  <div style="background: var(--stats-bg); padding: 15px; border-radius: 10px;">
  <div style="font-size: 24px; font-weight: bold; color: var(--menu-text);">${securityStats.blockedToday}</div>
  <div style="font-size: 12px; color: var(--stats-text);">Блокировок сегодня</div>
  </div>
  <div style="background: var(--stats-bg); padding: 15px; border-radius: 10px;">
  <div style="font-size: 24px; font-weight: bold; color: var(--menu-text);">${securityStats.totalBlocked}</div>
  <div style="font-size: 12px; color: var(--stats-text);">Всего блокировок</div>
  </div>
  </div>
  <div style="background: var(--stats-bg); padding: 15px; border-radius: 10px; margin-bottom: 15px;">
  <div style="font-size: 14px; font-weight: 500; color: var(--menu-text); margin-bottom: 10px;">Детальная статистика:</div>
  <div style="font-size: 12px; color: var(--stats-text); line-height: 1.8;">
  <div>Трекеров заблокировано: ${securityStats.trackersBlocked}</div>
  <div>Рекламы заблокировано: ${securityStats.adsBlocked}</div>
  <div>Криптомайнеров заблокировано: ${securityStats.minersBlocked}</div>
  <div>Фишинговых сайтов заблокировано: ${securityStats.phishingBlocked}</div>
  <div>Вредоносных сайтов заблокировано: ${securityStats.malwareBlocked}</div>
  <div>Попыток сбора отпечатка: ${securityStats.fingerprintingBlocked}</div>
  </div>
  </div>
  <div style="background: var(--stats-bg); padding: 15px; border-radius: 10px;">
  <div style="font-size: 14px; font-weight: 500; color: var(--menu-text); margin-bottom: 10px;">Настройки защиты:</div>
  <div style="font-size: 12px; color: var(--stats-text); line-height: 1.8;">
  ${Object.entries(securitySettings).map(([key, value]) => `
    <div>${getSecuritySettingLabel(key)}: ${value ? '✅ Включено' : '❌ Выключено'}</div>
    `).join('')}
    </div>
    </div>
    </div>
    `;

    createTab('about:blank');
    setTimeout(() => {
      const webview = views[views.length - 1]?.querySelector('webview');
      if (webview) {
        webview.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
          <!DOCTYPE html>
          <html>
          <head>
          <meta charset="UTF-8">
          <title>Отчет безопасности - StartPOZI Browser</title>
          <style>
          body {
            margin: 0;
            padding: 0;
            background: var(--titlebar-bg);
            color: var(--text-color);
            font-family: system-ui;
          }
          </style>
          </head>
          <body>
          ${report}
          </body>
          </html>
          `)}`);
      }
    }, 100);
}

function getSecuritySettingLabel(key) {
  const labels = {
    blockTrackers: 'Блокировка трекеров',
    blockAds: 'Блокировка рекламы',
    blockMiners: 'Блокировка криптомайнеров',
    blockPhishing: 'Блокировка фишинга',
    blockMalware: 'Блокировка вредоносных сайтов',
    blockFingerprinting: 'Блокировка сбора отпечатков',
    blockSocialMediaTrackers: 'Блокировка трекеров соцсетей',
    blockCookieWalls: 'Блокировка cookie-стен',
    blockPopups: 'Блокировка всплывающих окон',
    blockAutoplay: 'Блокировка автовоспроизведения',
    enhancedPrivacy: 'Усиленная приватность'
  };
  return labels[key] || key;
}

function initSecurityManager() {
  const securityBtn = document.getElementById('securityBtn');
  const securityDropdown = document.getElementById('securityDropdown');

  if (securityBtn && securityDropdown) {
    securityBtn.onclick = (e) => {
      e.stopPropagation();
      updateSecurityUI();
      securityDropdown.classList.toggle('show');
      document.getElementById('dropdown').classList.remove('show');
      document.getElementById('downloadsDropdown').classList.remove('show');
      document.getElementById('extensionsDropdown').classList.remove('show');
      document.getElementById('passwordsDropdown').classList.remove('show');
      document.getElementById('passwordsBtn').classList.remove('active');
      securityBtn.classList.toggle('active', securityDropdown.classList.contains('show'));
    };

    document.addEventListener('click', e => {
      if (!securityBtn.contains(e.target) && !securityDropdown.contains(e.target)) {
        securityDropdown.classList.remove('show');
        securityBtn.classList.remove('active');
      }
    });

    Object.keys(securitySettings).forEach(key => {
      const checkbox = document.getElementById(key);
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          securitySettings[key] = e.target.checked;
          saveSecuritySettings();
          showToast(`${getSecuritySettingLabel(key)} ${e.target.checked ? 'включена' : 'выключена'}`);
        });
      }
    });

    const viewReportBtn = document.getElementById('viewSecurityReport');
    if (viewReportBtn) {
      viewReportBtn.onclick = () => {
        securityDropdown.classList.remove('show');
        securityBtn.classList.remove('active');
        showSecurityReport();
      };
    }

    const clearDataBtn = document.getElementById('clearSecurityData');
    if (clearDataBtn) {
      clearDataBtn.onclick = () => {
        securityDropdown.classList.remove('show');
        securityBtn.classList.remove('active');
        clearSecurityData();
      };
    }
  }
  loadSecuritySettings();
}

function log(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level}] ${message}`;
  console.log(logMessage);
}

function isMainPage(url) {
  return url && (url.includes('MainPage/index.html') || url.includes('MainPage/'));
}

function isInternalPage(url) {
  return url && (url.includes('MainPage') || url.includes('Settings.html') ||
  url.includes('about:') || url.includes('file://'));
}

function handleWebViewContextMenu(webview, data) {
  currentContextWebview = webview;
  currentContextData = data;

  const { type, x, y } = data;
  const menuItems = [];

  switch (type) {
    case 'link':
      menuItems.push(
        { label: 'Открыть в новой вкладке', action: () => openLinkInNewTab(data.data.url), icon: '🔗' },
                     { label: 'Копировать ссылку', action: () => copyToClipboard(data.data.url), icon: '📋' },
                     { label: 'Сохранить ссылку как...', action: () => saveLinkAs(data.data.url), icon: '💾' },
                     { separator: true },
                     { label: 'Исследовать элемент', action: () => inspectElement(webview, x, y), icon: '🔍' }
      );
      break;

    case 'image':
      menuItems.push(
        { label: 'Открыть изображение', action: () => openImage(data.data.src), icon: '🖼️' },
                     { label: 'Сохранить изображение как...', action: () => saveImageAs(data.data.src), icon: '💾' },
                     { label: 'Копировать ссылку на изображение', action: () => copyToClipboard(data.data.src), icon: '📋' },
                     { separator: true },
                     { label: 'Исследовать элемент', action: () => inspectElement(webview, x, y), icon: '🔍' }
      );
      break;

    case 'selection':
      menuItems.push(
        { label: 'Копировать', action: () => copyToClipboard(data.data.text), icon: '📋' },
                     { label: 'Поиск в Google', action: () => searchGoogle(data.data.text), icon: '🔍' },
                     { label: 'Перевести', action: () => translateText(data.data.text), icon: '🌐' },
                     { separator: true },
                     { label: 'Исследовать элемент', action: () => inspectElement(webview, x, y), icon: '🔍' }
      );
      break;

    case 'editable':
      menuItems.push(
        { label: 'Вырезать', action: () => webview.cut(), icon: '✂️' },
                     { label: 'Копировать', action: () => webview.copy(), icon: '📋' },
                     { label: 'Вставить', action: () => webview.paste(), icon: '📎' },
                     { label: 'Выделить всё', action: () => webview.selectAll(), icon: '☑️' },
                     { separator: true },
                     { label: 'Исследовать элемент', action: () => inspectElement(webview, x, y), icon: '🔍' }
      );
      break;

    default:
      menuItems.push(
        { label: 'Назад', action: () => webview.goBack(), icon: '↶' },
                     { label: 'Вперёд', action: () => webview.goForward(), icon: '↷' },
                     { label: 'Перезагрузить', action: () => webview.reload(), icon: '↻' },
                     { label: 'Перезагрузить без кэша', action: () => webview.reloadIgnoringCache(), icon: '🗑️' },
                     { separator: true },
                     { label: 'Сохранить страницу как...', action: () => savePageAs(webview), icon: '💾' },
                     { label: 'Просмотреть исходный код', action: () => viewPageSource(webview), icon: '</>' },
                     { separator: true },
                     { label: 'Исследовать элемент', action: () => inspectElement(webview, x, y), icon: '🔍' },
                     { label: 'Создать скриншот', action: () => takeScreenshot(webview), icon: '📸' },
                     { label: 'Печать...', action: () => webview.print(), icon: '🖨️' }
      );
  }

  if (menuItems.length > 0) {
    showContextMenuPopup(x, y, menuItems);
  }


  if (menuItems.length > 0) {
    showContextMenuPopup(x, y, menuItems);
  }
}

function viewPageSource(webview) {
  const url = webview.getURL();
  if (!url || url.startsWith('file://') || url.startsWith('about:')) {
    showToast('Нельзя открыть исходный код для этой страницы', 'error');
    return;
  }

  if (isInternalPage(url)) {
    showToast('Исходный код недоступен для внутренних страниц', 'error');
    return;
  }

  try {
    const viewSourceUrl = `view-source:${url}`;
    createTab(viewSourceUrl);
    showToast('Открытие исходного кода...');
  } catch (error) {
    try {
      fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.text();
      })
      .then(html => {
        const sourceHtml = `
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="UTF-8">
        <title>Исходный код: ${url}</title>
        <style>
        body { margin: 0; padding: 20px; background: #1e1e1e; color: #d4d4d4; font-family: 'Consolas', 'Monaco', monospace; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
        pre { margin: 0; padding: 0; }
        .header { background: #2d2d2d; padding: 10px 20px; margin: -20px -20px 20px -20px; border-bottom: 1px solid #444; font-weight: bold; color: #569cd6; }
        </style>
        </head>
        <body>
        <div class="header">Исходный код: ${url}</div>
        <pre>${escapeHtml(html)}</pre>
        </body>
        </html>
        `;
        createTab('about:blank');
        setTimeout(() => {
          const newWebview = views[views.length - 1]?.querySelector('webview');
          if (newWebview) {
            const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(sourceHtml)}`;
            newWebview.loadURL(dataUrl);
            showToast('Исходный код открыт');
          }
        }, 500);
      })
      .catch(fetchError => {
        showToast('Не удалось получить исходный код страницы', 'error');
      });
    } catch (fallbackError) {
      showToast('Ошибка открытия исходного кода', 'error');
    }
  }
}

function showUniversalContextMenu(x, y, target) {
  const currentWebView = views[active]?.querySelector('webview');
  const currentUrl = currentWebView?.getURL() || '';

  // Удаляем предыдущее меню, если оно есть
  const oldMenu = document.getElementById('universal-context-menu');
  if (oldMenu) oldMenu.remove();

  // Создаём контейнер меню
  const menu = document.createElement('div');
  menu.id = 'universal-context-menu';
  menu.className = 'universal-context-menu';
  menu.style.cssText = `
  position: fixed;
  left: ${x}px;
  top: ${y}px;
  background: #2d2d2d;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 6px 0;
  z-index: 1000000;
  color: #fff;
  min-width: 220px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  backdrop-filter: blur(10px);
  font-size: 13px;
  `;

  // Определяем тип цели
  const isTab = target.closest('.tab');
  const isUrlBar = target.closest('#searchInput');
  const isEmptySpace = !isTab && !isUrlBar;

  // Формируем пункты меню в зависимости от цели
  const menuItems = [];

  if (isTab) {
    const tabIndex = Array.from(tabs).indexOf(target.closest('.tab'));
    menuItems.push(
      { label: 'Перезагрузить вкладку', icon: '↻', action: reload, separator: false },
      { label: 'Дублировать вкладку', icon: '📑', action: () => {
        const wv = views[tabIndex]?.querySelector('webview');
        if (wv) createTab(wv.getURL());
      }, separator: true },
      { label: 'Закрыть вкладку', icon: '✕', action: () => closeTab(tabIndex), separator: false },
                   { label: 'Закрыть другие вкладки', icon: '🗑️', action: () => {
                     tabs.forEach((tab, i) => {
                       if (i !== tabIndex && i !== active) closeTab(i);
                     });
                   }, separator: false },
                   { label: 'Закрыть вкладки справа', icon: '→', action: () => {
                     for (let i = tabs.length - 1; i > tabIndex; i--) {
                       closeTab(i);
                     }
                   }, separator: true },
                   { label: 'Восстановить закрытую вкладку', icon: '↶', action: restoreClosedTab,
                     enabled: closedTabsHistory.length > 0, separator: false }
    );
  } else if (isEmptySpace) {
    menuItems.push(
      { label: 'Новая вкладка', icon: '➕', action: () => createTab(), separator: false },
                   { label: 'Восстановить закрытую вкладку', icon: '↶', action: restoreClosedTab,
                     enabled: closedTabsHistory.length > 0, separator: true },
                   { label: 'Сохранить все вкладки', icon: '💾', action: () => {
                     saveTabsState();
                     showToast('Вкладки сохранены');
                   }, separator: false },
                   { label: 'Открыть сохранённые вкладки', icon: '📂', action: () => {
                     const saved = JSON.parse(localStorage.getItem('savedTabs') || '[]');
                     if (saved.length > 0) {
                       saved.forEach(url => createTab(url));
                       showToast(`Открыто ${saved.length} вкладок`);
                     } else {
                       showToast('Нет сохранённых вкладок');
                     }
                   }, separator: true },
                   { label: 'Настройки', icon: '⚙️', action: () => createTab(SETTINGS_PAGE), separator: false },
                   { label: 'Загрузки', icon: '📥', action: showDownloads, separator: false },
                   { label: 'История', icon: '🕒', action: showHistory, separator: false },
                   { label: 'Закладки', icon: '⭐', action: showBookmarks, separator: false }
    );
  }

  // Заполняем меню пунктами
  menuItems.forEach((item, index) => {
    // Разделитель перед пунктом (кроме первого)
    if (item.separator && index > 0) {
      const separator = document.createElement('div');
      separator.className = 'context-menu-separator';
      separator.style.cssText = 'height: 1px; background: #444; margin: 6px 0;';
      menu.appendChild(separator);
    }

    if (item.label) {
      const menuItem = document.createElement('div');
      menuItem.className = 'context-menu-item';
      menuItem.style.cssText = `
      padding: 8px 16px;
      cursor: ${item.enabled !== false ? 'pointer' : 'default'};
      display: flex;
      align-items: center;
      gap: 10px;
      opacity: ${item.enabled !== false ? '1' : '0.5'};
      transition: background 0.2s;
      `;

      if (item.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.textContent = item.icon;
        iconSpan.style.cssText = 'font-size: 14px; width: 20px; text-align: center;';
        menuItem.appendChild(iconSpan);
      }

      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.label;
      menuItem.appendChild(labelSpan);

      if (item.enabled !== false) {
        menuItem.onmouseenter = () => { menuItem.style.background = '#3d3d3d'; };
        menuItem.onmouseleave = () => { menuItem.style.background = 'transparent'; };
        menuItem.onclick = (e) => {
          e.stopPropagation();
          item.action();
          menu.remove();
        };
      }

      menu.appendChild(menuItem); // ← ВАЖНО: добавляем пункт в меню
    }
  });

  // Если есть пункты, показываем меню
  if (menuItems.length > 0) {
    document.body.appendChild(menu);

    // Корректировка позиции, если меню выходит за границы экрана
    const rect = menu.getBoundingClientRect();
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    if (rect.right > windowWidth) {
      menu.style.left = `${windowWidth - rect.width - 10}px`;
    }
    if (rect.bottom > windowHeight) {
      menu.style.top = `${windowHeight - rect.height - 10}px`;
    }

    // Закрытие меню при клике вне его или по Escape
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
        document.removeEventListener('contextmenu', closeMenu);
        document.removeEventListener('keydown', handleEscape);
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        menu.remove();
        document.removeEventListener('click', closeMenu);
        document.removeEventListener('contextmenu', closeMenu);
        document.removeEventListener('keydown', handleEscape);
      }
    };

    setTimeout(() => {
      document.addEventListener('click', closeMenu);
      document.addEventListener('contextmenu', closeMenu);
      document.addEventListener('keydown', handleEscape);
    }, 10);
  }
}

function initContextMenu() {
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const target = e.target;
    if (!target.closest('webview') && !target.closest('.tab-content')) {
      showUniversalContextMenu(e.clientX, e.clientY, target);
    }
  });
}

function blockMainPageContextMenu() {
  views.forEach((view, index) => {
    const webview = view.querySelector('webview');
    if (webview) {
      webview.addEventListener('did-finish-load', () => {
        const url = webview.getURL();
        if (isMainPage(url)) {
          try {
            webview.executeJavaScript(`
            document.addEventListener('contextmenu', function(e) {
              e.preventDefault();
              e.stopPropagation();
              return false;
            }, true);
            document.oncontextmenu = function() { return false; };
            document.body.oncontextmenu = function() { return false; };
            `);
          } catch (error) {}
        }
      });
    }
  });
}

const UniversalExtensionStorage = {
  async saveExtensionData(extensionId, dataType, data) {
    try {
      const storageKey = `ext_${extensionId}_${dataType}`;
      const dataToSave = { data, timestamp: Date.now(), version: 1 };
      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
      if (window.electronAPI) {
        try {
          await window.electronAPI.invoke('save-extension-data', { extensionId, dataType, data: dataToSave });
        } catch (e) {}
      }
      return true;
    } catch (error) {
      console.error('Ошибка сохранения данных расширения:', error);
      return false;
    }
  },

  async loadExtensionData(extensionId, dataType, defaultValue = null) {
    try {
      const storageKey = `ext_${extensionId}_${dataType}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.data;
      }
      if (window.electronAPI) {
        try {
          const result = await window.electronAPI.invoke('load-extension-data', { extensionId, dataType });
          if (result && result.data) {
            localStorage.setItem(storageKey, JSON.stringify(result));
            return result.data;
          }
        } catch (e) {}
      }
      return defaultValue;
    } catch (error) {
      console.error('Ошибка загрузки данных расширения:', error);
      return defaultValue;
    }
  },

  async saveExtensionJSFile(extensionId, fileName, content) {
    try {
      const fileData = { content, fileName, extensionId, timestamp: Date.now(), type: 'js_file' };
      const storageKey = `ext_${extensionId}_js_${fileName.replace(/[^a-z0-9]/gi, '_')}`;
      localStorage.setItem(storageKey, JSON.stringify(fileData));
      if (window.electronAPI) {
        try {
          await window.electronAPI.invoke('save-extension-file', { extensionId, fileName, content, fileType: 'js' });
        } catch (e) {}
      }
      return true;
    } catch (error) {
      console.error('Ошибка сохранения JS файла:', error);
      return false;
    }
  },

  async loadExtensionJSFile(extensionId, fileName) {
    try {
      const storageKey = `ext_${extensionId}_js_${fileName.replace(/[^a-z0-9]/gi, '_')}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.content) return parsed.content;
      }
      if (window.electronAPI) {
        try {
          const result = await window.electronAPI.invoke('load-extension-file', { extensionId, fileName, fileType: 'js' });
          if (result && result.content) {
            localStorage.setItem(storageKey, JSON.stringify({ content: result.content, fileName, extensionId, timestamp: Date.now(), type: 'js_file' }));
            return result.content;
          }
        } catch (e) {}
      }
      return null;
    } catch (error) {
      console.error('Ошибка загрузки JS файла:', error);
      return null;
    }
  },

  getExtensionFiles(extensionId) {
    const files = [];
    const prefix = `ext_${extensionId}_`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(prefix)) {
        try {
          const data = JSON.parse(localStorage.getItem(key));
          if (data && (data.type === 'js_file' || key.includes('_js_'))) {
            files.push({ key, fileName: data.fileName || key.replace(prefix, '').replace('_js_', ''), type: 'js', timestamp: data.timestamp, size: data.content ? data.content.length : 0 });
          } else if (data && data.dataType) {
            files.push({ key, dataType: data.dataType, type: 'data', timestamp: data.timestamp, size: JSON.stringify(data.data).length });
          }
        } catch (e) {}
      }
    }
    return files;
  },

  async deleteExtensionData(extensionId, dataType = null) {
    try {
      const prefix = `ext_${extensionId}_`;
      const keysToDelete = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(prefix)) {
          if (dataType === null || key.includes(dataType)) {
            keysToDelete.push(key);
          }
        }
      }
      keysToDelete.forEach(key => { localStorage.removeItem(key); });
      if (window.electronAPI) {
        try {
          await window.electronAPI.invoke('delete-extension-data', { extensionId, dataType });
        } catch (e) {}
      }
      return keysToDelete.length;
    } catch (error) {
      console.error('Ошибка удаления данных расширения:', error);
      return 0;
    }
  },

  async backupExtensionsData() {
    try {
      const backup = { timestamp: Date.now(), data: {}, files: {} };
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('ext_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key));
            if (key.includes('_js_')) {
              const match = key.match(/ext_([^_]+)_js_(.+)/);
              if (match) {
                const [_, extId, fileName] = match;
                if (!backup.files[extId]) backup.files[extId] = {};
                backup.files[extId][fileName] = data;
              }
            } else {
              const match = key.match(/ext_([^_]+)_(.+)/);
              if (match) {
                const [_, extId, dataType] = match;
                if (!backup.data[extId]) backup.data[extId] = {};
                backup.data[extId][dataType] = data;
              }
            }
          } catch (e) {}
        }
      }
      const backupKey = `extensions_backup_${Date.now()}`;
      localStorage.setItem(backupKey, JSON.stringify(backup));
      if (window.electronAPI) {
        try {
          await window.electronAPI.invoke('save-extensions-backup', backup);
        } catch (e) {}
      }
      return backup;
    } catch (error) {
      console.error('Ошибка создания бэкапа:', error);
      return null;
    }
  }
};

window.UniversalExtensionStorage = UniversalExtensionStorage;

const EnhancedExtensionsMenu = {
  async showExtensionsMenu(anchorElement) {
    try {
      if (!window.electronAPI) return;
      const plugins = await window.electronAPI.invoke('get-plugins');
      const savedStates = await window.electronAPI.invoke('load-extension-states').catch(() => ({}));

      const menu = document.createElement('div');
      menu.className = 'enhanced-extensions-menu';
      menu.style.cssText = `position: fixed; background: var(--dropdown-bg); border: 1px solid var(--border-color); border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); width: 400px; max-height: 600px; overflow: hidden; z-index: 10001; animation: menuSlideIn 0.2s ease;`;

      const rect = anchorElement.getBoundingClientRect();
      menu.style.left = `${rect.left}px`;
      menu.style.top = `${rect.bottom + 5}px`;

      menu.innerHTML = `
      <div class="extensions-menu-header">
      <div class="extensions-menu-title">
      <span style="font-weight: 600; font-size: 14px;">Расширения</span>
      <span style="color: #888; font-size: 12px; margin-left: 8px;">${plugins?.length || 0} установлено</span>
      </div>
      <div class="extensions-menu-actions">
      <button class="extensions-action-btn" id="extensionsAddBtn" title="Добавить расширение"><span>+</span></button>
      <button class="extensions-action-btn" id="extensionsRefreshBtn" title="Обновить"><span>↻</span></button>
      <button class="extensions-action-btn" id="extensionsCloseBtn" title="Закрыть"><span>×</span></button>
      </div>
      </div>
      <div class="extensions-menu-search">
      <input type="text" placeholder="Поиск расширений..." id="extensionsSearchInput">
      </div>
      <div class="extensions-menu-tabs">
      <button class="extensions-tab active" data-tab="enabled">Включено</button>
      <button class="extensions-tab" data-tab="disabled">Отключено</button>
      <button class="extensions-tab" data-tab="system">Системные</button>
      </div>
      <div class="extensions-list-container" id="extensionsListContainer">
      <div class="loading-extensions">Загрузка расширений...</div>
      </div>
      <div class="extensions-menu-footer">
      <button class="footer-btn" id="manageExtensionsBtn">Управление расширениями</button>
      <button class="footer-btn" id="backupExtensionsBtn">Создать резервную копию</button>
      </div>`;

      document.body.appendChild(menu);

      if (!document.getElementById('enhanced-extensions-styles')) {
        const style = document.createElement('style');
        style.id = 'enhanced-extensions-styles';
        style.textContent = `@keyframes menuSlideIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        .enhanced-extensions-menu { --dropdown-bg: #2d2d2d; --border-color: #444; --text-color: #fff; --accent-color: #0a84ff; --hover-bg: #3d3d3d; --active-bg: #0a84ff20; }
        .extensions-menu-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border-color); background: rgba(0,0,0,0.2); }
        .extensions-menu-title { display: flex; align-items: center; }
        .extensions-menu-actions { display: flex; gap: 4px; }
        .extensions-action-btn { background: transparent; border: 1px solid var(--border-color); color: var(--text-color); width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px; transition: all 0.2s; }
        .extensions-action-btn:hover { background: var(--hover-bg); border-color: var(--accent-color); }
        .extensions-menu-search { padding: 12px 16px; border-bottom: 1px solid var(--border-color); }
        #extensionsSearchInput { width: 100%; padding: 8px 12px; background: rgba(255,255,255,0.1); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-color); font-size: 13px; outline: none; }
        #extensionsSearchInput:focus { border-color: var(--accent-color); }
        .extensions-menu-tabs { display: flex; padding: 0 16px; border-bottom: 1px solid var(--border-color); background: rgba(0,0,0,0.1); }
        .extensions-tab { padding: 10px 16px; background: transparent; border: none; color: #888; font-size: 13px; font-weight: 500; cursor: pointer; position: relative; transition: color 0.2s; }
        .extensions-tab:hover { color: var(--text-color); }
        .extensions-tab.active { color: var(--accent-color); }
        .extensions-tab.active::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 2px; background: var(--accent-color); }
        .extensions-list-container { max-height: 350px; overflow-y: auto; padding: 8px 0; }
        .extension-menu-item { display: flex; align-items: center; padding: 10px 16px; gap: 12px; cursor: pointer; transition: background 0.2s; }
        .extension-menu-item:hover { background: var(--hover-bg); }
        .extension-menu-icon { width: 32px; height: 32px; border-radius: 6px; background-size: contain; background-position: center; background-repeat: no-repeat; }
        .extension-menu-info { flex: 1; min-width: 0; }
        .extension-menu-name { font-weight: 500; font-size: 13px; color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .extension-menu-version { font-size: 11px; color: #888; margin-top: 2px; }
        .extension-menu-actions { display: flex; gap: 4px; }
        .extension-action-btn { background: transparent; border: 1px solid var(--border-color); color: var(--text-color); padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer; transition: all 0.2s; }
        .extension-action-btn:hover { background: var(--hover-bg); }
        .extension-action-btn.toggle { min-width: 60px; }
        .extension-action-btn.popup { background: var(--accent-color); border-color: var(--accent-color); }
        .extensions-menu-footer { display: flex; justify-content: space-between; padding: 12px 16px; border-top: 1px solid var(--border-color); background: rgba(0,0,0,0.2); }
        .footer-btn { background: transparent; border: 1px solid var(--border-color); color: var(--text-color); padding: 8px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: all 0.2s; }
        .footer-btn:hover { background: var(--hover-bg); border-color: var(--accent-color); }
        .no-extensions { padding: 40px 20px; text-align: center; color: #888; font-size: 14px; }
        .loading-extensions { padding: 40px 20px; text-align: center; color: #888; font-size: 14px; }
        .extensions-section { margin-bottom: 16px; }
        .extensions-section-header { padding: 8px 16px; font-size: 11px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; background: rgba(0,0,0,0.2); }`;
        document.head.appendChild(style);
      }

      await this.loadExtensionsList(menu, plugins, savedStates);
      this.setupMenuEventHandlers(menu, anchorElement);
    } catch (error) {
      console.error('Ошибка при создании меню расширений:', error);
    }
  },

  async loadExtensionsList(menu, plugins, savedStates) {
    const container = menu.querySelector('#extensionsListContainer');
    if (!container) return;
    try {
      if (!plugins || plugins.length === 0) {
        container.innerHTML = `<div class="no-extensions">
        <div style="margin-bottom: 12px;">📦</div><div>Нет установленных расширений</div>
        <button class="footer-btn" style="margin-top: 16px;" id="addFirstExtensionBtn">+ Добавить расширение</button></div>`;
        return;
      }

      const updatedPlugins = plugins.map(plugin => savedStates.hasOwnProperty(plugin.id) ? { ...plugin, enabled: savedStates[plugin.id] } : plugin);
      const enabledPlugins = updatedPlugins.filter(p => p.enabled && !p.isSystem);
      const disabledPlugins = updatedPlugins.filter(p => !p.enabled && !p.isSystem);
      const systemPlugins = updatedPlugins.filter(p => p.isSystem);

      let html = '';
      if (enabledPlugins.length > 0) {
        html += `<div class="extensions-section" id="enabled-section"><div class="extensions-section-header">Включено (${enabledPlugins.length})</div>`;
        enabledPlugins.forEach(plugin => { html += this.createExtensionMenuItem(plugin); });
        html += `</div>`;
      }
      if (disabledPlugins.length > 0) {
        html += `<div class="extensions-section" id="disabled-section" style="display: none;"><div class="extensions-section-header">Отключено (${disabledPlugins.length})</div>`;
        disabledPlugins.forEach(plugin => { html += this.createExtensionMenuItem(plugin); });
        html += `</div>`;
      }
      if (systemPlugins.length > 0) {
        html += `<div class="extensions-section" id="system-section" style="display: none;"><div class="extensions-section-header">Системные (${systemPlugins.length})</div>`;
        systemPlugins.forEach(plugin => { html += this.createExtensionMenuItem(plugin); });
        html += `</div>`;
      }
      container.innerHTML = html;
      this.setupExtensionItemHandlers(menu);
    } catch (error) {
      console.error('Ошибка загрузки списка расширений:', error);
      container.innerHTML = '<div class="no-extensions">Ошибка загрузки расширений</div>';
    }
  },

  createExtensionMenuItem(plugin) {
    const iconUrl = this.getExtensionIconUrl(plugin);
    const isEnabled = plugin.enabled;
    return `<div class="extension-menu-item" data-id="${plugin.id}">
    <div class="extension-menu-icon" style="background-image: url('${iconUrl}')"></div>
    <div class="extension-menu-info">
    <div class="extension-menu-name">${plugin.name || plugin.id}</div>
    <div class="extension-menu-version">v${plugin.version || '1.0'}</div>
    </div>
    <div class="extension-menu-actions">
    <button class="extension-action-btn toggle" data-enabled="${isEnabled}" data-id="${plugin.id}">${isEnabled ? 'Выключить' : 'Включить'}</button>
    ${plugin.hasPopup ? `<button class="extension-action-btn popup" data-id="${plugin.id}">Меню</button>` : ''}
    </div></div>`;
  },

  getExtensionIconUrl(plugin) {
    if (plugin.icons) {
      const sizes = ['32', '48', '16', '128', '64'];
      for (const size of sizes) if (plugin.icons[size]) return plugin.icons[size];
    }
    return 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%230a84ff"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>';
  },

  setupMenuEventHandlers(menu, anchorElement) {
    const closeBtn = menu.querySelector('#extensionsCloseBtn');
    if (closeBtn) closeBtn.onclick = () => { menu.remove(); if (anchorElement) anchorElement.classList.remove('active'); };

    const addBtn = menu.querySelector('#extensionsAddBtn');
    const addFirstBtn = menu.querySelector('#addFirstExtensionBtn');
    const addHandler = async () => {
      menu.remove();
      try {
        const result = await window.electronAPI.invoke('add-plugin');
        if (result?.success) showToast(result.message); else showToast(result?.message || 'Ошибка добавления расширения', 'error');
      } catch (error) {
        console.error('Error adding extension:', error);
        showToast('Ошибка добавления расширения', 'error');
      }
    };
    if (addBtn) addBtn.onclick = addHandler;
    if (addFirstBtn) addFirstBtn.onclick = addHandler;

    const refreshBtn = menu.querySelector('#extensionsRefreshBtn');
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        try {
          const plugins = await window.electronAPI.invoke('get-plugins');
          const savedStates = await window.electronAPI.invoke('load-extension-states').catch(() => ({}));
          await this.loadExtensionsList(menu, plugins, savedStates);
          showToast('Список расширений обновлен');
        } catch (error) {
          console.error('Ошибка обновления списка расширений:', error);
        }
      };
    }

    const searchInput = menu.querySelector('#extensionsSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const items = menu.querySelectorAll('.extension-menu-item');
        items.forEach(item => {
          const name = item.querySelector('.extension-menu-name').textContent.toLowerCase();
          if (name.includes(searchTerm)) item.style.display = 'flex'; else item.style.display = 'none';
        });
      });
    }

    const tabs = menu.querySelectorAll('.extensions-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        const sections = menu.querySelectorAll('.extensions-section');
        sections.forEach(section => {
          if (section.id === `${tabName}-section`) section.style.display = 'block'; else section.style.display = 'none';
        });
      });
    });

    const manageBtn = menu.querySelector('#manageExtensionsBtn');
    if (manageBtn) manageBtn.onclick = () => { menu.remove(); createTab('Settings.html#plugins'); };

    const backupBtn = menu.querySelector('#backupExtensionsBtn');
    if (backupBtn) {
      backupBtn.onclick = async () => {
        menu.remove();
        try {
          await UniversalExtensionStorage.backupExtensionsData();
          showToast('Резервная копия создана успешно');
        } catch (error) {
          showToast('Ошибка создания резервной копии', 'error');
        }
      };
    }

    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && !anchorElement?.contains(e.target)) {
        menu.remove();
        if (anchorElement) anchorElement.classList.remove('active');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.body.contains(menu)) {
        menu.remove();
        if (anchorElement) anchorElement.classList.remove('active');
      }
    });
  },

  setupExtensionItemHandlers(menu) {
    menu.querySelectorAll('.extension-action-btn.toggle').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const pluginId = btn.dataset.id;
        const currentlyEnabled = btn.dataset.enabled === 'true';
        const newState = !currentlyEnabled;
        try {
          const result = await window.electronAPI.invoke('toggle-plugin', pluginId, newState);
          if (result.success) {
            btn.dataset.enabled = newState;
            btn.textContent = newState ? 'Выключить' : 'Включить';
            await UniversalExtensionStorage.saveExtensionData(pluginId, 'state', newState);
            showToast(result.message);
            setTimeout(async () => {
              try {
                const plugins = await window.electronAPI.invoke('get-plugins');
                const savedStates = await window.electronAPI.invoke('load-extension-states').catch(() => ({}));
                await this.loadExtensionsList(menu, plugins, savedStates);
              } catch (error) {}
            }, 500);
          } else showToast(result.message, 'error');
        } catch (error) {
          console.error('Error toggling extension:', error);
          showToast('Ошибка при переключении расширения', 'error');
        }
      });
    });

    menu.querySelectorAll('.extension-action-btn.popup').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const pluginId = btn.dataset.id;
        try {
          const result = await window.electronAPI.invoke('open-plugin-popup', pluginId);
          if (result && result.success) {
            menu.remove();
            showExtensionPopup(result);
          } else showToast('Не удалось открыть меню расширения', 'error');
        } catch (error) {
          console.error('Error opening popup:', error);
          showToast('Ошибка открытия меню расширения', 'error');
        }
      });
    });

    menu.querySelectorAll('.extension-menu-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.extension-action-btn')) {
          const pluginId = item.dataset.id;
        }
      });
    });
  }
};

window.EnhancedExtensionsMenu = EnhancedExtensionsMenu;

const StorageUtils = {
  async cleanupOldData(daysToKeep = 30) {
    try {
      const cutoffDate = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
      let removedCount = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('ext_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key));
            if (data.timestamp && data.timestamp < cutoffDate) {
              localStorage.removeItem(key);
              removedCount++;
            }
          } catch (e) {}
        }
      }
      return removedCount;
    } catch (error) {
      console.error('Ошибка очистки данных:', error);
      return 0;
    }
  },

  exportAllExtensionsData() {
    try {
      const exportData = { timestamp: Date.now(), extensions: {}, files: {}, settings: {} };
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('ext_')) {
          try {
            const data = JSON.parse(localStorage.getItem(key));
            const match = key.match(/ext_([^_]+)_(.+)/);
            if (match) {
              const [_, extId, dataType] = match;
              if (!exportData.extensions[extId]) exportData.extensions[extId] = {};
              if (key.includes('_js_')) {
                if (!exportData.files[extId]) exportData.files[extId] = {};
                exportData.files[extId][dataType.replace('js_', '')] = data;
              } else if (key.includes('_settings')) {
                if (!exportData.settings[extId]) exportData.settings[extId] = {};
                exportData.settings[extId] = data;
              } else exportData.extensions[extId][dataType] = data;
            }
          } catch (e) {}
        }
      }
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      const exportFileDefaultName = `extensions_backup_${new Date().toISOString().split('T')[0]}.json`;
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      return exportData;
    } catch (error) {
      console.error('Ошибка экспорта данных:', error);
      return null;
    }
  },

  importExtensionsData(jsonData) {
    try {
      const importData = JSON.parse(jsonData);
      let importedCount = 0;
      Object.keys(importData.extensions).forEach(extId => {
        Object.keys(importData.extensions[extId]).forEach(dataType => {
          const key = `ext_${extId}_${dataType}`;
          localStorage.setItem(key, JSON.stringify(importData.extensions[extId][dataType]));
          importedCount++;
        });
      });
      Object.keys(importData.files).forEach(extId => {
        Object.keys(importData.files[extId]).forEach(fileName => {
          const key = `ext_${extId}_js_${fileName.replace(/[^a-z0-9]/gi, '_')}`;
          localStorage.setItem(key, JSON.stringify(importData.files[extId][fileName]));
          importedCount++;
        });
      });
      Object.keys(importData.settings).forEach(extId => {
        const key = `ext_${extId}_settings`;
        localStorage.setItem(key, JSON.stringify(importData.settings[extId]));
        importedCount++;
      });
      return importedCount;
    } catch (error) {
      console.error('Ошибка импорта данных:', error);
      return 0;
    }
  },

  checkDataIntegrity() {
    const results = { total: 0, valid: 0, invalid: 0, corrupted: [] };
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('ext_')) {
        results.total++;
        try {
          const data = JSON.parse(localStorage.getItem(key));
          if (data && typeof data === 'object') results.valid++; else { results.invalid++; results.corrupted.push(key); }
        } catch (e) { results.invalid++; results.corrupted.push(key); }
      }
    }
    return results;
  },

  async repairCorruptedData() {
    const integrity = this.checkDataIntegrity();
    if (integrity.corrupted.length === 0) return { success: true, repaired: 0 };
    let repaired = 0;
    for (const key of integrity.corrupted) {
      try {
        const match = key.match(/ext_([^_]+)_(.+)/);
        if (match) {
          const [_, extId, dataType] = match;
          if (dataType.includes('js_')) {
            const fileName = dataType.replace('js_', '');
            const content = await UniversalExtensionStorage.loadExtensionJSFile(extId, fileName);
            if (content) {
              localStorage.setItem(key, JSON.stringify({ content, fileName, extensionId: extId, timestamp: Date.now(), type: 'js_file' }));
              repaired++;
            }
          } else {
            const data = await UniversalExtensionStorage.loadExtensionData(extId, dataType);
            if (data) {
              localStorage.setItem(key, JSON.stringify({ data, dataType, extensionId: extId, timestamp: Date.now() }));
              repaired++;
            }
          }
        }
      } catch (e) {}
    }
    return { success: repaired > 0, repaired };
  }
};

window.StorageUtils = StorageUtils;

const ExtensionStorage = {
  getSettings(extensionId, defaultSettings = {}) {
    const storageKey = `ext_${extensionId}_settings`;
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : defaultSettings;
    } catch (error) {
      console.error(`Ошибка чтения настроек для ${extensionId}:`, error);
      return defaultSettings;
    }
  },

  saveSettings(extensionId, settings) {
    const storageKey = `ext_${extensionId}_settings`;
    try {
      localStorage.setItem(storageKey, JSON.stringify(settings));
      return true;
    } catch (error) {
      console.error(`Ошибка сохранения настроек для ${extensionId}:`, error);
      return false;
    }
  },

  updateSettings(extensionId, updates) {
    const current = this.getSettings(extensionId);
    const newSettings = { ...current, ...updates };
    return this.saveSettings(extensionId, newSettings);
  },

  clearSettings(extensionId) {
    const storageKey = `ext_${extensionId}_settings`;
    localStorage.removeItem(storageKey);
    return true;
  },

  async getStorageData(extensionId, keys, namespace = 'sync') {
    try {
      if (!window.electronAPI) return {};
      const result = await window.electronAPI.invoke('extension-storage-get', extensionId, keys, namespace);
      return result?.data || {};
    } catch (error) {
      console.error('Error getting storage data:', error);
      return {};
    }
  },

  async setStorageData(extensionId, items, namespace = 'sync') {
    try {
      if (!window.electronAPI) return false;
      const result = await window.electronAPI.invoke('extension-storage-set', extensionId, items, namespace);
      return result?.success || false;
    } catch (error) {
      console.error('Error setting storage data:', error);
      return false;
    }
  },

  async removeStorageData(extensionId, keys, namespace = 'sync') {
    try {
      if (!window.electronAPI) return false;
      const result = await window.electronAPI.invoke('extension-storage-remove', extensionId, keys, namespace);
      return result?.success || false;
    } catch (error) {
      console.error('Error removing storage data:', error);
      return false;
    }
  },

  async clearStorageData(extensionId, namespace = 'sync') {
    try {
      if (!window.electronAPI) return false;
      const result = await window.electronAPI.invoke('extension-storage-clear', extensionId, namespace);
      return result?.success || false;
    } catch (error) {
      console.error('Error clearing storage data:', error);
      return false;
    }
  }
};

const ExtensionPopupManager = (function() {
  class ExtensionPopupManager {
    constructor() {
      this.activePopups = new Map();
      this.extensionIcons = new Map();
    }

    setupEventListeners() {
      document.addEventListener('click', (e) => {
        this.activePopups.forEach((popupInfo, extensionId) => {
          const popupElement = document.querySelector(`.extension-popup[data-id="${extensionId}"]`);
          if (popupElement && !popupElement.contains(e.target)) this.closeExtensionPopup(extensionId);
        });
      });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.activePopups.forEach((popupInfo, extensionId) => this.closeExtensionPopup(extensionId)); });
    }

    async openExtensionPopup(extensionId, anchorElement) {
      if (!window.electronAPI) return;
      const rect = anchorElement.getBoundingClientRect();
      const anchorRect = { x: rect.left + window.scrollX, y: rect.top + window.scrollY, width: rect.width, height: rect.height };
      try {
        const result = await window.electronAPI.invoke('open-plugin-popup', extensionId);
        if (result && result.success) {
          this.activePopups.set(extensionId, { windowId: result.windowId, extension: result.extension, timestamp: Date.now() });
          showExtensionPopup(result, anchorRect);
          anchorElement.classList.add('active');
        }
      } catch (error) {}
    }

    closeExtensionPopup(extensionId) {
      if (this.activePopups.has(extensionId)) {
        if (window.electronAPI) window.electronAPI.invoke('close-plugin-popup', extensionId);
        this.activePopups.delete(extensionId);
        const icon = this.extensionIcons.get(extensionId);
        if (icon) icon.classList.remove('active');
        return true;
      }
      return false;
    }

    showNotification(message, type = 'info') {
      const toast = document.createElement('div');
      toast.className = `extension-toast extension-toast-${type}`;
      toast.textContent = message;
      toast.style.cssText = `position: fixed; bottom: 20px; right: 20px; background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4CAF50' : '#2196F3'}; color: white; padding: 12px 24px; border-radius: 8px; z-index: 10000; animation: extensionToastIn 0.3s ease; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); font-weight: 500;`;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.animation = 'extensionToastOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
      const style = document.createElement('style');
      style.textContent = `@keyframes extensionToastIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes extensionToastOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(20px); } }`;
      document.head.appendChild(style);
    }

    updateExtensionBadge(extensionId, badgeText) {
      const icon = this.extensionIcons.get(extensionId);
      if (icon) {
        let badge = icon.querySelector('.badge');
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'badge';
          badge.style.cssText = `position: absolute; top: -4px; right: -4px; background: #ff3b30; color: white; font-size: 10px; min-width: 16px; height: 16px; border-radius: 8px; display: flex; align-items: center; justify-content: center; padding: 0 4px; font-weight: bold;`;
          icon.appendChild(badge);
        }
        if (badgeText) { badge.textContent = badgeText; badge.style.display = 'flex'; } else badge.style.display = 'none';
      }
    }
  }
  return new ExtensionPopupManager();
})();

async function updateExtensionIcons() {
  const container = document.getElementById('extension-icons-container');
  if (!container) {
    console.warn('Контейнер для иконок расширений не найден');
    return;
  }

  try {
    const browserActions = await window.electronAPI.invoke('get-browser-actions');
    container.innerHTML = '';

    browserActions.forEach(action => {
      const button = document.createElement('button');
      button.className = 'extension-icon';
      button.setAttribute('data-id', action.id);
      button.title = action.title || action.name;

      let iconUrl = null;
      if (action.icons) {
        if (action.icons['32']) iconUrl = action.icons['32'];
        else if (action.icons['48']) iconUrl = action.icons['48'];
        else if (action.icons['16']) iconUrl = action.icons['16'];
        else if (action.icons['128']) iconUrl = action.icons['128'];
        else if (typeof action.icons === 'object') {
          const firstKey = Object.keys(action.icons)[0];
          if (firstKey) iconUrl = action.icons[firstKey];
        }
      }

      if (!iconUrl) {
        iconUrl = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="%230a84ff"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>';
      }

      button.style.backgroundImage = `url('${iconUrl}')`;

      button.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (action.hasPopup) {
          try {
            const result = await window.electronAPI.invoke('open-plugin-popup', action.id);
            if (result && result.success) {
              const rect = button.getBoundingClientRect();
              showExtensionPopup(result, rect);
            } else {
              showToast(result?.message || 'Не удалось открыть popup', 'error');
            }
          } catch (error) {
            console.error('Ошибка открытия popup:', error);
            showToast('Ошибка открытия popup', 'error');
          }
        } else {
          window.electronAPI.send('extension-action-clicked', action.id);
        }
      });

      container.appendChild(button);

      ExtensionPopupManager.extensionIcons.set(action.id, button);
    });

  } catch (error) {
    console.error('Ошибка при обновлении иконок расширений:', error);
  }
}

function showExtensionPopup(popupInfo, anchorRect = null) {
  if (!popupInfo || !popupInfo.success) {
    const errorMsg = popupInfo?.message || 'Неизвестная ошибка';
    showToast(`Ошибка: ${errorMsg}`);
    return;
  }
  if (!popupInfo.extension?.enabled) {
    showToast('Расширение отключено. Включите его в настройках.');
    return;
  }

  const extension = popupInfo.extension;
  const pluginName = extension.name || 'Расширение';
  const pluginId = extension.id || 'unknown';

  const savedSettings = ExtensionStorage.getSettings(pluginId);
  const oldPopup = document.getElementById('extension-popup-overlay');
  if (oldPopup) document.body.removeChild(oldPopup);

  const overlay = document.createElement('div');
  overlay.id = 'extension-popup-overlay';
  overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); z-index: 100000; display: flex; align-items: center; justify-content: center;`;

  const container = document.createElement('div');
  container.id = 'extension-popup-container';

  if (anchorRect) {
    const popupWidth = 400; const popupHeight = 500;
    let x = anchorRect.x + (anchorRect.width / 2) - (popupWidth / 2);
    let y = anchorRect.y + anchorRect.height + 5;
    const windowWidth = window.innerWidth; const windowHeight = window.innerHeight;
    if (x < 0) x = 0; if (x + popupWidth > windowWidth) x = windowWidth - popupWidth;
    if (y + popupHeight > windowHeight) y = anchorRect.y - popupHeight - 5; if (y < 0) y = 0;
    container.style.cssText = `width: ${popupWidth}px; height: ${popupHeight}px; background: white; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); display: flex; flex-direction: column; overflow: hidden; position: fixed; left: ${x}px; top: ${y}px; z-index: 100001;`;
  } else {
    container.style.cssText = `width: 400px; height: 500px; background: white; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); display: flex; flex-direction: column; overflow: hidden;`;
  }

  const header = document.createElement('div');
  header.style.cssText = `padding: 12px 16px; background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); border-bottom: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center; user-select: none;`;

  const title = document.createElement('span');
  title.textContent = pluginName;
  title.style.cssText = `color: white; font-weight: 600; font-size: 14px;`;

  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '×';
  closeBtn.style.cssText = `background: rgba(255,255,255,0.2); border: none; color: white; font-size: 20px; cursor: pointer; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: background 0.2s;`;
  closeBtn.onmouseover = () => closeBtn.style.background = 'rgba(255,255,255,0.3)';
  closeBtn.onmouseout = () => closeBtn.style.background = 'rgba(255,255,255,0.2)';
  closeBtn.onclick = () => { if (document.body.contains(overlay)) document.body.removeChild(overlay); };

  header.appendChild(title); header.appendChild(closeBtn);
  const iframe = document.createElement('iframe');
  iframe.id = 'extension-popup-iframe';
  iframe.style.cssText = `flex: 1; width: 100%; height: 100%; border: none; background: white;`;
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-modals');
  iframe.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media;');

  if (!popupInfo.popupHTML || popupInfo.popupHTML.length < 10) {
    iframe.srcdoc = `<html><head><style>body { padding: 20px; font-family: Arial; }</style></head><body><h3>${pluginName}</h3><p>Нет содержимого для отображения</p><p>HTML контент пустой или отсутствует</p></body></html>`;
  } else {
    const basePath = extension.path.replace(/\\/g, '/');
    const manifest = extension.manifest || {};
    const locales = extension.locales || {};
    const manifestStr = JSON.stringify(manifest).replace(/</g, '\\u003c').replace(/'/g, "\\'");
    const localesStr = JSON.stringify(locales).replace(/</g, '\\u003c').replace(/'/g, "\\'");
    const savedSettingsStr = JSON.stringify(savedSettings).replace(/</g, '\\u003c').replace(/'/g, "\\'");

    const universalHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><base href="file://${basePath}/">
    <style>* { margin: 0; padding: 0; box-sizing: border-box; } body { margin: 0; padding: 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: white; color: #333; min-height: 100vh; } img { max-width: 100%; }
    input[type="checkbox"], input[type="radio"] { margin-right: 8px; } label { display: flex; align-items: center; margin-bottom: 8px; cursor: pointer; }
    button { background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: 500; transition: opacity 0.2s; } button:hover { opacity: 0.9; }
    select, input[type="text"], input[type="number"] { padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; width: 100%; margin-bottom: 10px; }</style>
    <script>(function() {'use strict'; const extensionId = "${pluginId}"; const manifest = JSON.parse('${manifestStr}'); const locales = JSON.parse('${localesStr}'); const basePath = "file://${basePath}/";
    let storageCache = { local: JSON.parse('${savedSettingsStr}'), sync: JSON.parse('${savedSettingsStr}') }; const storageListeners = [];
    function getExtensionURL(path) { if (!path) return ""; if (path.match(/^(https?:|data:|blob:|file:|chrome-extension:)/)) return path; let cleanPath = path; if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1); if (cleanPath.startsWith('./')) cleanPath = cleanPath.substring(2); return basePath + cleanPath; }
    function sendToParent(type, data) { window.parent.postMessage({ type: type, extensionId: extensionId, data: data }, '*'); }
    function getStorageData(keys, namespace = 'sync') { return new Promise((resolve) => { const storage = storageCache[namespace] || {}; if (keys === null || keys === undefined) { resolve({ ...storage }); } else if (Array.isArray(keys)) { const result = {}; keys.forEach(key => { if (storage.hasOwnProperty(key)) result[key] = storage[key]; }); resolve(result); } else if (typeof keys === 'string') { const result = {}; if (storage.hasOwnProperty(keys)) result[keys] = storage[keys]; resolve(result); } else if (typeof keys === 'object') { const result = {}; Object.keys(keys).forEach(key => { if (storage.hasOwnProperty(key)) result[key] = storage[key]; else result[key] = keys[key]; }); resolve(result); } else resolve({}); }); }
    function setStorageData(items, namespace = 'sync') { return new Promise((resolve) => { const storage = storageCache[namespace] || {}; const changes = {}; let hasChanges = false; Object.keys(items).forEach(key => { const oldValue = storage[key]; const newValue = items[key]; if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) { changes[key] = { oldValue, newValue }; storage[key] = newValue; hasChanges = true; } }); storageCache[namespace] = storage; if (hasChanges) { sendToParent('extension-storage-save', { namespace: namespace, items: items, changes: changes }); storageListeners.forEach(listener => { if (listener.namespace === namespace || listener.namespace === 'sync') setTimeout(() => listener.callback(changes, namespace), 0); }); } resolve(); }); }
    function removeStorageData(keys, namespace = 'sync') { return new Promise((resolve) => { const storage = storageCache[namespace] || {}; const changes = {}; const keyArray = Array.isArray(keys) ? keys : [keys]; let hasChanges = false; keyArray.forEach(key => { if (storage.hasOwnProperty(key)) { changes[key] = { oldValue: storage[key], newValue: undefined }; delete storage[key]; hasChanges = true; } }); if (hasChanges) { sendToParent('extension-storage-remove', { namespace: namespace, keys: keyArray }); storageListeners.forEach(listener => { if (listener.namespace === namespace || listener.namespace === 'sync') setTimeout(() => listener.callback(changes, namespace), 0); }); } resolve(); }); }
    function clearStorageData(namespace = 'sync') { return new Promise((resolve) => { const storage = storageCache[namespace] || {}; const changes = {}; Object.keys(storage).forEach(key => changes[key] = { oldValue: storage[key], newValue: undefined }); if (Object.keys(storage).length > 0) { storageCache[namespace] = {}; sendToParent('extension-storage-clear', { namespace: namespace }); storageListeners.forEach(listener => { if (listener.namespace === namespace || listener.namespace === 'sync') setTimeout(() => listener.callback(changes, namespace), 0); }); } resolve(); }); }
    const localStorageArea = { get: (keys, callback) => { return getStorageData(keys, 'local').then(result => { if (callback) callback(result); return result; }); }, set: (items, callback) => { return setStorageData(items, 'local').then(() => { if (callback) callback(); }); }, remove: (keys, callback) => { return removeStorageData(keys, 'local').then(() => { if (callback) callback(); }); }, clear: (callback) => { return clearStorageData('local').then(() => { if (callback) callback(); }); } };
    const syncStorageArea = { get: (keys, callback) => { return getStorageData(keys, 'sync').then(result => { if (callback) callback(result); return result; }); }, set: (items, callback) => { return setStorageData(items, 'sync').then(() => { if (callback) callback(); }); }, remove: (keys, callback) => { return removeStorageData(keys, 'sync').then(() => { if (callback) callback(); }); }, clear: (callback) => { return clearStorageData('sync').then(() => { if (callback) callback(); }); } };
    function initControls() { chrome.storage.sync.get(null, (settings) => { if (!settings || typeof settings !== 'object') settings = {}; document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => { const settingName = checkbox.id || checkbox.name || checkbox.dataset.setting; if (settingName && settings.hasOwnProperty(settingName)) { checkbox.checked = settings[settingName]; checkbox.addEventListener('change', function() { const updates = {}; updates[settingName] = this.checked; chrome.storage.sync.set(updates); }); } });
    document.querySelectorAll('input[type="text"], input[type="number"], select').forEach(input => { const settingName = input.id || input.name || input.dataset.setting; if (settingName && settings.hasOwnProperty(settingName)) { input.value = settings[settingName]; input.addEventListener('change', function() { const updates = {}; updates[settingName] = this.value; chrome.storage.sync.set(updates); }); } });
    document.querySelectorAll('input[type="radio"]').forEach(radio => { const settingName = radio.name || radio.dataset.setting; if (settingName && settings.hasOwnProperty(settingName)) { radio.checked = (radio.value === settings[settingName].toString()); radio.addEventListener('change', function() { if (this.checked) { const updates = {}; updates[settingName] = this.value; chrome.storage.sync.set(updates); } }); } }); }); }
    function fixPaths() { document.querySelectorAll('[src], [href]').forEach(el => { if (el.src && !el.src.match(/^(https?:|data:|blob:|file:|chrome-extension:)/)) el.src = getExtensionURL(el.src); if (el.href && !el.href.match(/^(https?:|data:|blob:|file:|chrome-extension:)/)) el.href = getExtensionURL(el.href); }); }
    document.addEventListener('DOMContentLoaded', () => { setTimeout(() => { fixPaths(); initControls(); }, 100); });
    window.addEventListener('message', (event) => { if (event.data.type === 'extension-storage-updated' && event.data.extensionId === extensionId) {
      if (event.data.data.namespace === 'sync' || event.data.data.namespace === 'local') { const namespace = event.data.data.namespace; const changes = event.data.data.changes || {}; Object.keys(changes).forEach(key => { storageCache[namespace][key] = changes[key].newValue; if (changes[key].newValue === undefined) delete storageCache[namespace][key]; }); storageListeners.forEach(listener => { if (listener.namespace === namespace || listener.namespace === 'sync') setTimeout(() => listener.callback(changes, namespace), 0); }); } } });
    window.chrome = window.browser = { runtime: { id: extensionId, getManifest: () => manifest, getURL: getExtensionURL, sendMessage: (message, callback) => { sendToParent('extension-message', message); if (callback) setTimeout(() => callback({ success: true }), 0); }, onMessage: { addListener: (callback) => { window.addEventListener('message', (event) => { if (event.data && event.data.type === 'extension-message' && event.data.extensionId === extensionId) callback(event.data.message, { id: extensionId }); }); }, removeListener: () => {} }, lastError: null },
             i18n: { getMessage: (messageName, substitutions) => { if (locales[messageName] && locales[messageName].message) { let message = locales[messageName].message; if (substitutions) { if (Array.isArray(substitutions)) { substitutions.forEach((sub, index) => { const regex = new RegExp('\\\\$' + (index + 1), 'g'); message = message.replace(regex, sub); }); } else if (typeof substitutions === 'string') message = message.replace(/\\$1/g, substitutions); } return message; } return messageName; }, getUILanguage: () => navigator.language || 'en' },
             storage: { local: localStorageArea, sync: syncStorageArea, onChanged: { addListener: (callback, namespace = 'sync') => { storageListeners.push({ namespace, callback }); }, removeListener: (callback) => { const index = storageListeners.findIndex(l => l.callback === callback); if (index > -1) storageListeners.splice(index, 1); } } },
             tabs: { create: (createProperties, callback) => { if (createProperties && createProperties.url) sendToParent('open-url', createProperties.url); if (callback) setTimeout(() => callback({ id: Date.now() }), 0); }, query: (queryInfo, callback) => { if (callback) setTimeout(() => callback([]), 0); } } }; })();</script></head><body>${popupInfo.popupHTML}</body></html>`;

             try {
               const blob = new Blob([universalHtml], { type: 'text/html' });
               const blobUrl = URL.createObjectURL(blob);
               iframe.src = blobUrl;

               const messageHandler = (event) => {
                 if (event.data && event.data.extensionId === pluginId) {
                   switch (event.data.type) {
                     case 'extension-storage-save':
                       if (window.electronAPI) {
                         window.electronAPI.invoke('extension-storage-set', pluginId, event.data.data.items, event.data.data.namespace || 'sync').then(result => {
                           if (result && result.success) {
                             iframe.contentWindow.postMessage({ type: 'extension-storage-updated', extensionId: pluginId, data: { namespace: event.data.data.namespace || 'sync', changes: result.changes || {} } }, '*');
                           }
                         });
                       }
                       break;
                     case 'extension-storage-remove': ExtensionStorage.removeStorageData(pluginId, event.data.data.keys, event.data.data.namespace); break;
                     case 'extension-storage-clear': ExtensionStorage.clearStorageData(pluginId, event.data.data.namespace); break;
                     case 'open-url': if (window.electronAPI) window.electronAPI.send('OPEN_URL', `https://www.youtube.com/watch?v=${videoId}`); break;
                     case 'popup-resize':
                       if (event.data.width && event.data.height) {
                         let newWidth = Math.min(800, Math.max(200, event.data.width));
                         let newHeight = Math.min(800, Math.max(200, event.data.height));
                         container.style.width = newWidth + 'px';
                         container.style.height = newHeight + 'px';
                         if (anchorRect) {
                           let x = anchorRect.x + (anchorRect.width / 2) - (newWidth / 2);
                           let y = anchorRect.y + anchorRect.height + 5;
                           const windowWidth = window.innerWidth;
                           const windowHeight = window.innerHeight;
                           if (x < 0) x = 0;
                           if (x + newWidth > windowWidth) x = windowWidth - newWidth;
                           if (y + newHeight > windowHeight) y = anchorRect.y - newHeight - 5;
                           if (y < 0) y = 0;
                           container.style.left = x + 'px';
                           container.style.top = y + 'px';
                         }
                       }
                       break;
                   }
                 }
               };
               window.addEventListener('message', messageHandler);

               const cleanup = () => {
                 URL.revokeObjectURL(blobUrl);
                 window.removeEventListener('message', messageHandler);
               };

               overlay.addEventListener('click', function(e) { if (e.target === overlay) cleanup(); });
               const originalClose = closeBtn.onclick;
               closeBtn.onclick = () => { cleanup(); originalClose(); };
             } catch (error) {
               iframe.srcdoc = `<html><body style="padding:20px;font-family:Arial"><h3>Error</h3><p>Failed to load popup: ${error.message}</p></body></html>`;
             }
  }

  container.appendChild(header); container.appendChild(iframe); overlay.appendChild(container); document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay); });
  const handleEscape = (e) => { if (e.key === 'Escape' && document.body.contains(overlay)) { document.body.removeChild(overlay); document.removeEventListener('keydown', handleEscape); } };
  document.addEventListener('keydown', handleEscape);
}

function showToast(message, duration = 3000) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div'); toast.id = 'toast'; toast.className = 'toast';
    toast.style.cssText = `position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(0, 0, 0, 0.8); color: white; padding: 12px 24px; border-radius: 8px; z-index: 10000; opacity: 0; transition: opacity 0.3s; pointer-events: none; font-weight: 500; max-width: 80%; text-align: center; backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1);`;
    document.body.appendChild(toast);
  }
  toast.textContent = message; toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

function escapeHtml(text) { if (!text) return ''; const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function truncateText(text, maxLength) { if (!text) return ''; return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text; }
function formatTimeAgo(ms) {
  const seconds = Math.floor(ms / 1000); const minutes = Math.floor(seconds / 60); const hours = Math.floor(minutes / 60); const days = Math.floor(hours / 24);
  if (days > 0) return `${days} дн. назад`; if (hours > 0) return `${hours} ч. назад`; if (minutes > 0) return `${minutes} мин. назад`; return 'только что';
}

function restoreClosedTab() {
  if (closedTabsHistory.length === 0) { showToast('Нет закрытых вкладок для восстановления'); return; }
  const lastClosed = closedTabsHistory.pop();
  createTab(lastClosed.url || START_PAGE);
  showToast(`Восстановлена вкладка: ${lastClosed.title}`);
}

function savePageAs() {
  const webview = views[active]?.querySelector('webview');
  if (!webview) return;
  const url = webview.getURL();
  if (url && !url.includes('file://') && !url.includes('about:')) {
    try { window.electronAPI.send('save-page-as', { url: url, title: webview.getTitle() || 'page' }); } catch (error) { showToast('Ошибка сохранения', 'error'); }
  } else showToast('Нельзя сохранить эту страницу', 'error');
}

function inspectPage() { const webview = views[active]?.querySelector('webview'); if (webview) webview.openDevTools(); }
function hardReload() { const webview = views[active]?.querySelector('webview'); if (webview) { webview.reloadIgnoringCache(); showToast('Перезагрузка без кэша...'); } }
function takeScreenshot() {
  const webview = views[active]?.querySelector('webview');
  if (!webview) return;
  try {
    webview.capturePage().then(image => {
      const dataUrl = image.toDataURL();
      const link = document.createElement('a');
      link.download = `screenshot-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      showToast('Скриншот сохранен');
    }).catch(error => { showToast('Ошибка создания скриншота', 'error'); });
  } catch (error) { showToast('Не удалось создать скриншот', 'error'); }
}
function printPage() { const webview = views[active]?.querySelector('webview'); if (webview) webview.print(); }

let currentContextWebview = null;
let currentContextData = null;

function openLinkInNewTab(url) { if (url && url !== 'about:blank') createTab(url); }
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => { showToast('Скопировано в буфер обмена'); }).catch(err => { showToast('Ошибка копирования', 'error'); });
}
function saveLinkAs(url) { if (window.electronAPI) window.electronAPI.send('save-link-as', { url }); else createTab(url); }
function saveImageAs(src) { if (window.electronAPI) window.electronAPI.send('save-image-as', { src }); else createTab(src); }
function searchGoogle(text) { if (text) { const searchUrl = currentSearchEngine + encodeURIComponent(text); createTab(searchUrl); } }
function translateText(text) { if (text) { const translateUrl = `https://translate.google.com/?sl=auto&tl=ru&text=${encodeURIComponent(text)}&op=translate`; createTab(translateUrl); } }
function openImage(src) { if (src) createTab(src); }
function inspectElement(webview, x, y) { if (webview && webview.inspectElement) webview.inspectElement(x, y); else webview.openDevTools(); }

function showContextMenuPopup(x, y, items) {
  const oldMenu = document.getElementById('webview-context-menu');
  if (oldMenu) oldMenu.remove();
  const menu = document.createElement('div');
  menu.id = 'webview-context-menu';
  menu.className = 'webview-context-menu';
  menu.style.cssText = `position: fixed; left: ${x}px; top: ${y}px; background: #2d2d2d; border: 1px solid #444; border-radius: 8px; padding: 6px 0; z-index: 1000000; color: #fff; min-width: 220px; max-width: 300px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); backdrop-filter: blur(10px); font-size: 13px; user-select: none; animation: contextMenuFadeIn 0.15s ease;`;

  if (!document.getElementById('context-menu-styles')) {
    const style = document.createElement('style');
    style.id = 'context-menu-styles';
    style.textContent = `@keyframes contextMenuFadeIn { from { opacity: 0; transform: translateY(-10px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .webview-context-menu-item { padding: 8px 16px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: background 0.2s; }
    .webview-context-menu-item:hover { background: #3d3d3d; }
    .webview-context-menu-item.disabled { opacity: 0.5; cursor: default; }
    .webview-context-menu-item.disabled:hover { background: transparent; }
    .webview-context-menu-separator { height: 1px; background: #444; margin: 6px 0; }
    .webview-context-menu-icon { width: 16px; text-align: center; font-size: 14px; }`;
    document.head.appendChild(style);
  }

  items.forEach((item, index) => {
    if (item.separator) {
      const separator = document.createElement('div');
      separator.className = 'webview-context-menu-separator';
      menu.appendChild(separator);
    } else {
      const menuItem = document.createElement('div');
      menuItem.className = 'webview-context-menu-item';
      menuItem.title = item.label;
      if (item.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'webview-context-menu-icon';
        iconSpan.textContent = item.icon;
        menuItem.appendChild(iconSpan);
      }
      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.label;
      labelSpan.style.flex = '1';
      menuItem.appendChild(labelSpan);
      menuItem.onmouseenter = () => { menuItem.style.background = '#3d3d3d'; };
      menuItem.onmouseleave = () => { menuItem.style.background = 'transparent'; };
      menuItem.onclick = (e) => {
        e.stopPropagation();
        try { if (item.action) item.action(); } catch (error) { showToast('Ошибка выполнения действия', 'error'); }
        menu.remove();
      };
      menu.appendChild(menuItem);
    }
  });

  document.body.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  if (rect.right > windowWidth) menu.style.left = `${windowWidth - rect.width - 10}px`;
  if (rect.bottom > windowHeight) menu.style.top = `${windowHeight - rect.height - 10}px`;

  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('contextmenu', closeMenu);
      document.removeEventListener('keydown', handleEscape);
    }
  };
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      menu.remove();
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('contextmenu', closeMenu);
      document.removeEventListener('keydown', handleEscape);
    }
  };
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
    document.addEventListener('contextmenu', closeMenu);
    document.addEventListener('keydown', handleEscape);
  }, 10);
}

function initPasswordManager() {
  const passwordsBtn = document.getElementById('passwordsBtn');
  const passwordsDropdown = document.getElementById('passwordsDropdown');
  const showAllPasswords = document.getElementById('showAllPasswords');

  if (passwordsBtn && passwordsDropdown) {
    passwordsBtn.onclick = (e) => {
      e.stopPropagation();
      updatePasswordsDropdown();
      passwordsDropdown.classList.toggle('show');
      document.getElementById('dropdown').classList.remove('show');
      document.getElementById('downloadsDropdown').classList.remove('show');
      document.getElementById('extensionsDropdown').classList.remove('show');
      document.getElementById('securityDropdown').classList.remove('show');
      document.getElementById('securityBtn').classList.remove('active');
      passwordsBtn.classList.toggle('active', passwordsDropdown.classList.contains('show'));
      addSearchFieldToPasswordsDropdown();
      setTimeout(() => {
        const searchInput = document.getElementById('passwordsSearchInput');
        if (searchInput && passwordsDropdown.classList.contains('show')) searchInput.focus();
      }, 10);
    };
    document.addEventListener('click', e => {
      if (!passwordsBtn.contains(e.target) && !passwordsDropdown.contains(e.target)) {
        passwordsDropdown.classList.remove('show');
        passwordsBtn.classList.remove('active');
      }
    });
    if (showAllPasswords) showAllPasswords.onclick = () => { passwordsDropdown.classList.remove('show'); passwordsBtn.classList.remove('active'); createTab('Settings.html#passwords'); };
  }
  loadPasswords();
}

function addSearchFieldToPasswordsDropdown() {
  const passwordsDropdown = document.getElementById('passwordsDropdown');
  if (!passwordsDropdown) return;
  if (document.getElementById('passwordsSearchInput')) return;
  const searchContainer = document.createElement('div');
  searchContainer.style.cssText = `padding: 8px 12px; border-bottom: 1px solid #444;`;
  const searchInput = document.createElement('input');
  searchInput.id = 'passwordsSearchInput';
  searchInput.type = 'text';
  searchInput.placeholder = 'Поиск паролей...';
  searchInput.style.cssText = `width: 100%; padding: 6px 10px; background: #2d2d2d; border: 1px solid #444; border-radius: 6px; color: #fff; font-size: 13px; outline: none;`;
  searchInput.addEventListener('input', (e) => { updatePasswordsDropdown(e.target.value); });
  searchContainer.appendChild(searchInput);
  const list = document.getElementById('passwordsListDropdown');
  if (list && list.parentNode) list.parentNode.insertBefore(searchContainer, list);
}

function loadPasswords() {
  try {
    const saved = localStorage.getItem('browserPasswords');
    const localPasswords = saved ? JSON.parse(saved) : [];
    const validPasswords = localPasswords.filter(p => p && p.site && p.username && p.password);
    if (passwords.length === 0 && validPasswords.length > 0) passwords = validPasswords;
  } catch (error) { passwords = []; }
}

function updatePasswordsDropdown(searchTerm = '') {
  const list = document.getElementById('passwordsListDropdown');
  if (!list) return;
  if (!passwords || passwords.length === 0) {
    list.innerHTML = `<div style="padding: 30px 20px; text-align: center;"><div style="margin-bottom: 12px;">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="1.5"><path d="M12,2C8.1,2,5,5.1,5,9v4c0,1.1,0.9,2,2,2h10c1.1,0,2-0.9,2-2V9C19,5.1,15.9,2,12,2z M12,4c2.8,0,5,2.2,5,5v4H7V9 C7,6.2,9.2,4,12,4z M13,13h-2v2h2V13z"/></svg></div><div style="color: #999; font-size: 14px; margin-bottom: 16px;">Пароли не сохранены</div>
    <button id="addFirstPasswordBtn" style="background: #3d3d3d; border: 1px solid #444; color: #fff; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500;" onclick="createTab('Settings.html#passwords')">+ Добавить пароль</button></div>`;
    return;
  }

  let filteredPasswords = passwords;
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filteredPasswords = passwords.filter(p => (p.site && p.site.toLowerCase().includes(term)) || (p.username && p.username.toLowerCase().includes(term)));
  }

  const sortedPasswords = filteredPasswords.sort((a, b) => {
    if (a.favorite && !b.favorite) return -1; if (!a.favorite && b.favorite) return 1; return (b.created || 0) - (a.created || 0);
  });

    const displayPasswords = sortedPasswords.slice(0, 8);
    let html = '';
    displayPasswords.forEach((password) => {
      const domain = password.site.replace(/https?:\/\//, '').split('/')[0];
      const timeAgo = password.lastUsed ? formatTimeAgo(Date.now() - password.lastUsed) : 'никогда';
      html += `<div class="password-item-dropdown" data-id="${password.id}">
      <img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32" class="favicon" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"32\" height=\"32\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"%239B51E0\" stroke-width=\"2\"><path d=\"M12,2C8.1,2,5,5.1,5,9v4c0,1.1,0.9,2,2,2h10c1.1,0,2-0.9,2-2V9C19,5.1,15.9,2,12,2z M12,4c2.8,0,5,2.2,5,5v4H7V9 C7,6.2,9.2,4,12,4z M13,13h-2v2h2V13z\"/></svg>'">
      <div class="info"><span class="site" title="${escapeHtml(password.site)}">${escapeHtml(truncateText(password.site, 25))}</span><span class="username" title="${escapeHtml(password.username)}">${escapeHtml(truncateText(password.username, 20))}</span></div>
      <div class="password-actions-dropdown"><button class="password-action-btn-dropdown copy-user-btn" title="Копировать логин" data-id="${password.id}"><svg viewBox="0 0 24 24" width="14" height="14"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
      <button class="password-action-btn-dropdown copy-pass-btn" title="Копировать пароль" data-id="${password.id}"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg></button></div></div>`;
    });

    if (filteredPasswords.length > 8) {
      html += `<div class="password-item-dropdown" style="justify-content: center; padding: 12px; cursor: pointer;" onclick="createTab('Settings.html#passwords')">
      <span style="color: #ccc; font-size: 12px;">И еще ${filteredPasswords.length - 8} паролей...</span></div>`;
    }
    list.innerHTML = html;
    attachPasswordEventHandlers();
}

function attachPasswordEventHandlers() {
  document.querySelectorAll('.copy-user-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const passwordId = btn.dataset.id;
      const password = passwords.find(p => p.id === passwordId);
      if (password && password.username) {
        try {
          await navigator.clipboard.writeText(password.username);
          showToast('Логин скопирован');
          if (window.electronAPI) window.electronAPI.send('update-password-last-used-request', passwordId);
          setTimeout(() => {
            const passwordsDropdown = document.getElementById('passwordsDropdown');
            if (passwordsDropdown && passwordsDropdown.classList.contains('show')) updatePasswordsDropdown();
          }, 100);
        } catch (error) { showToast('Ошибка копирования', 'error'); }
      }
    });
  });

  document.querySelectorAll('.copy-pass-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const passwordId = btn.dataset.id;
      const password = passwords.find(p => p.id === passwordId);
      if (password && password.password) {
        try {
          await navigator.clipboard.writeText(password.password);
          showToast('Пароль скопирован');
          if (window.electronAPI) window.electronAPI.send('update-password-last-used-request', passwordId);
          setTimeout(() => {
            const passwordsDropdown = document.getElementById('passwordsDropdown');
            if (passwordsDropdown && passwordsDropdown.classList.contains('show')) updatePasswordsDropdown();
          }, 100);
        } catch (error) { showToast('Ошибка копирования', 'error'); }
      }
    });
  });

  document.querySelectorAll('.password-item-dropdown:not([onclick])').forEach(item => {
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.password-action-btn-dropdown')) {
        const passwordId = item.dataset.id;
        document.getElementById('passwordsDropdown').classList.remove('show');
        document.getElementById('passwordsBtn').classList.remove('active');
        createTab(`Settings.html#passwords&edit=${passwordId}`);
      }
    });
  });
}

function savePasswords() {
  try { localStorage.setItem('browserPasswords', JSON.stringify(passwords)); } catch (error) {}
}

async function addPassword(site, username, password) {
  const result = await window.electronAPI.addPassword({ site, username, password });
  if (result.success) { await refreshPasswordsFromSystem(); showToast('Пароль сохранен'); return result; } else { showToast('Ошибка: ' + result.message); return result; }
}

function editPassword(id, updates) {
  try {
    const index = passwords.findIndex(p => p.id === id);
    if (index === -1) return false;
    passwords[index] = { ...passwords[index], ...updates };
    savePasswords();
    updatePasswordsDropdown();
    views.forEach(view => {
      const wv = view.querySelector('webview');
      if (wv && wv.getURL().includes('Settings.html')) wv.send('passwords-updated');
    });
      return true;
  } catch (error) { return false; }
}

async function deletePassword(id) {
  const result = await window.electronAPI.deletePassword(id);
  if (result.success) { await refreshPasswordsFromSystem(); showToast('Пароль удален'); }
  return result;
}

function searchPasswords(query) {
  if (!query) return passwords;
  const q = query.toLowerCase();
  return passwords.filter(p => (p.site && p.site.toLowerCase().includes(q)) || (p.username && p.username.toLowerCase().includes(q)));
}

function getPasswordById(id) { return passwords.find(p => p.id === id); }

function exportPasswords() {
  try {
    const dataStr = JSON.stringify(passwords, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `startpozi-passwords-${new Date().toISOString().split('T')[0]}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    showToast('Пароли экспортированы');
    return true;
  } catch (error) { showToast('Ошибка экспорта', 'error'); return false; }
}

function importPasswords(jsonData) {
  try {
    const imported = JSON.parse(jsonData);
    if (!Array.isArray(imported)) { showToast('Неверный формат файла', 'error'); return false; }
    imported.forEach(pass => {
      const exists = passwords.some(p => p.site === pass.site && p.username === pass.username);
      if (!exists) passwords.push({ ...pass, id: pass.id || Date.now().toString() + Math.random().toString(36).substr(2, 9), created: pass.created || Date.now(), lastUsed: pass.lastUsed || null, favorite: pass.favorite || false });
    });
    savePasswords();
    updatePasswordsDropdown();
    showToast(`Импортировано ${imported.length} паролей`);
    views.forEach(view => {
      const wv = view.querySelector('webview');
      if (wv && wv.getURL().includes('Settings.html')) wv.send('passwords-updated');
    });
      return true;
  } catch (error) { showToast('Ошибка импорта', 'error'); return false; }
}

function clearAllPasswords() {
  passwords = [];
  savePasswords();
  updatePasswordsDropdown();
  views.forEach(view => {
    const wv = view.querySelector('webview');
    if (wv && wv.getURL().includes('Settings.html')) wv.send('passwords-updated');
  });
    showToast('Все пароли удалены');
}

document.addEventListener('DOMContentLoaded', () => { setTimeout(() => { initializeBrowser(); }, 100); });

function initializeBrowser() {
  try {
    tabsBar = document.getElementById('tabsContainerTabs');
    tabsArea = document.getElementById('tabsContainer');
    addressBar = document.getElementById('searchInput');
    addTabBtn = document.getElementById('addTab');
    downloadsBtn = document.getElementById('downloadsBtn');
    downloadsIcon = document.getElementById('downloadIcon');
    extensionsBtn = document.getElementById('extensionsBtn');

    if (!tabsBar || !tabsArea || !addressBar) { showToast('Ошибка загрузки интерфейса'); return; }

    document.getElementById('min-btn').onclick = () => {
      if (window.electronAPI) window.electronAPI.send('minimize');
    };
      document.getElementById('max-btn').onclick = () => {
        if (window.electronAPI) window.electronAPI.send('maximize');
      };
        document.getElementById('close-btn').onclick = () => {
          if (window.electronAPI) window.electronAPI.send('close');
        };
          document.getElementById('back').onclick = () => goBack();
          document.getElementById('forward').onclick = () => goForward();
          document.getElementById('refresh').onclick = () => reload();
          addTabBtn.onclick = () => createTab();

          const incognitoBtn = document.getElementById('incognito-btn');
          if (incognitoBtn) {
            incognitoBtn.onclick = () => {
              if (window.electronAPI) window.electronAPI.invoke('create-incognito-window');
            };
          }

          const tabManagerBtn = document.getElementById('tab-manager-btn');
          if (tabManagerBtn) {
            tabManagerBtn.onclick = () => {
              showTabManager();
            };
          }

          const menuBtn = document.getElementById('menuBtn');
          const dropdown = document.getElementById('dropdown');
          if (menuBtn && dropdown) {
            menuBtn.onclick = () => {
              dropdown.classList.toggle('show');
              document.getElementById('downloadsDropdown').classList.remove('show');
              document.getElementById('extensionsDropdown').classList.remove('show');
              document.getElementById('passwordsDropdown').classList.remove('show');
              document.getElementById('passwordsBtn').classList.remove('active');
              document.getElementById('securityDropdown').classList.remove('show');
              document.getElementById('securityBtn').classList.remove('active');
            };
            document.addEventListener('click', e => { if (!menuBtn.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.remove('show'); });
            dropdown.querySelectorAll('.menu-item').forEach(item => {
              item.onclick = () => {
                dropdown.classList.remove('show');
                const a = item.dataset.action;
                if (a === 'settings') createTab(SETTINGS_PAGE);
                if (a === 'bookmarks') showBookmarks();
                if (a === 'downloads') { resetDownloadIcon(); showDownloads(); }
                if (a === 'passwords') showPasswordsManager();
                if (a === 'history') showHistory();
                if (a === 'about') showAbout();
                if (a === 'security-test') document.getElementById('securityBtn').click();
              };
            });
          }

          const downloadsDropdown = document.getElementById('downloadsDropdown');
          const showAllDownloads = document.getElementById('showAllDownloads');
          if (downloadsBtn && downloadsDropdown) {
            downloadsBtn.onclick = (e) => {
              e.stopPropagation();
              resetDownloadIcon();
              updateDownloadsDropdown();
              downloadsDropdown.classList.toggle('show');
              dropdown.classList.remove('show');
              document.getElementById('extensionsDropdown').classList.remove('show');
              document.getElementById('passwordsDropdown').classList.remove('show');
              document.getElementById('passwordsBtn').classList.remove('active');
              document.getElementById('securityDropdown').classList.remove('show');
              document.getElementById('securityBtn').classList.remove('active');
            };
            document.addEventListener('click', e => { if (!downloadsBtn.contains(e.target) && !downloadsDropdown.contains(e.target)) downloadsDropdown.classList.remove('show'); });
            if (showAllDownloads) showAllDownloads.onclick = () => { downloadsDropdown.classList.remove('show'); resetDownloadIcon(); showDownloads(); };
          }

          const extensionsDropdown = document.getElementById('extensionsDropdown');
          const manageExtensionsBtn = document.getElementById('manageExtensionsBtn');
          const closeExtensionsPopup = document.getElementById('closeExtensionsPopup');
          const addExtensionBtn = document.getElementById('addExtensionBtn');
          if (extensionsBtn && extensionsDropdown) {
            extensionsBtn.onclick = (e) => {
              e.stopPropagation();
              loadExtensionsDropdown();
              extensionsDropdown.classList.toggle('show');
              dropdown.classList.remove('show');
              downloadsDropdown.classList.remove('show');
              document.getElementById('passwordsDropdown').classList.remove('show');
              document.getElementById('passwordsBtn').classList.remove('active');
              document.getElementById('securityDropdown').classList.remove('show');
              document.getElementById('securityBtn').classList.remove('active');
            };
            if (manageExtensionsBtn) manageExtensionsBtn.onclick = () => { extensionsDropdown.classList.remove('show'); createTab(SETTINGS_PAGE + '#plugins'); };
            if (addExtensionBtn) {
              addExtensionBtn.onclick = async () => {
                extensionsDropdown.classList.remove('show');
                try {
                  const result = await window.electronAPI.invoke('add-plugin');
                  if (result?.success) {
                    showToast(result.message);
                    setTimeout(() => { if (document.getElementById('extensionsDropdown')?.classList.contains('show')) loadExtensionsDropdown(); }, 1000);
                  } else showToast(result?.message || 'Failed to add extension', 'error');
                } catch (error) { showToast('Error adding extension', 'error'); }
              };
            }
            if (closeExtensionsPopup) closeExtensionsPopup.onclick = (e) => { e.stopPropagation(); extensionsDropdown.classList.remove('show'); };
            document.addEventListener('click', e => { if (!extensionsBtn.contains(e.target) && !extensionsDropdown.contains(e.target)) extensionsDropdown.classList.remove('show'); });
          }

          initPasswordManager();
          initSecurityManager();

          let extensionIconsContainer = document.getElementById('extension-icons-container');
          if (!extensionIconsContainer) {
            const toolbar = document.querySelector('.toolbar') || document.querySelector('.address-bar') || document.body;
            extensionIconsContainer = document.createElement('div');
            extensionIconsContainer.id = 'extension-icons-container';
            extensionIconsContainer.className = 'extension-icons';
            if (extensionsBtn && extensionsBtn.parentNode) {
              extensionsBtn.parentNode.insertBefore(extensionIconsContainer, extensionsBtn);
            } else {
              toolbar.appendChild(extensionIconsContainer);
            }
          }

          updateExtensionIcons();

          if (window.electronAPI) {
            window.electronAPI.on('extensions-loaded', updateExtensionIcons);
            window.electronAPI.on('extensions-updated', updateExtensionIcons);
            window.electronAPI.on('extension-state-changed', updateExtensionIcons);
          }

          if (localStorage.getItem('saveTabs') === null) localStorage.setItem('saveTabs', 'false');
          if (localStorage.getItem('saveInternalPages') === null) localStorage.setItem('saveInternalPages', 'false');

          const saveTabsEnabled = localStorage.getItem('saveTabs') === 'true';
    const savedTabs = JSON.parse(localStorage.getItem('savedTabs') || '[]');
    if (saveTabsEnabled && savedTabs.length > 0) {
      savedTabs.forEach((url, i) => { setTimeout(() => { createTab(url); activateTab(tabs.length - 1); }, i * 300); });
    } else createTab();
    loadTheme();

    if (window.electronAPI) {
      window.electronAPI.invoke('get-custom-theme').then(css => {
        if (css) applyCustomTheme(css);
      }).catch(err => console.error('Ошибка загрузки кастомной темы:', err));
    }

    if (addressBar) {
      addressBar.focus(); addressBar.select();
      addressBar.addEventListener('click', () => { addressBar.focus(); addressBar.select(); });
      const suggestions = document.getElementById('suggestions');
      addressBar.addEventListener('input', async () => {
        const val = addressBar.value.trim();
        if (!val) { if (suggestions) { suggestions.innerHTML = ''; suggestions.style.display = 'none'; } return; }
        try {
          const resp = await fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(val)}&type=list`);
          const data = await resp.json();
          const items = data[1] || [];
          if (suggestions) {
            if (items.length === 0) suggestions.innerHTML = '<div class="suggest-item">Нет предложений</div>'; else {
              suggestions.innerHTML = items.map(item => `<div class="suggest-item" data-url="${currentSearchEngine + encodeURIComponent(item)}"><span class="suggest-title">${item}</span></div>`).join('');
            }
            suggestions.style.display = 'block';
            suggestions.querySelectorAll('.suggest-item').forEach(item => {
              item.onclick = () => {
                const url = item.dataset.url;
                addressBar.value = item.querySelector('.suggest-title').textContent;
                if (views[active]?.querySelector('webview')) views[active].querySelector('webview').loadURL(url);
                suggestions.style.display = 'none';
              };
            });
          }
        } catch (e) { if (suggestions) { suggestions.innerHTML = '<div class="suggest-item">Ошибка</div>'; suggestions.style.display = 'block'; } }
      });
      addressBar.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          let val = addressBar.value.trim();
          if (!val) return;
          let targetUrl;
          if (!val.includes('.') && !val.includes('://')) targetUrl = currentSearchEngine + encodeURIComponent(val);
            else if (!val.startsWith('http://') && !val.startsWith('https://')) targetUrl = 'https://' + val; else targetUrl = val;
              addressBar.value = targetUrl;
          if (views[active]?.querySelector('webview')) views[active].querySelector('webview').loadURL(targetUrl);
          if (suggestions) suggestions.style.display = 'none';
        }
      });
      document.addEventListener('click', e => { if (suggestions && addressBar && !addressBar.contains(e.target) && !suggestions.contains(e.target)) suggestions.style.display = 'none'; });
    }

    updateDownloadIconState();
    if (!downloadUpdateInterval) downloadUpdateInterval = setInterval(() => { if (activeDownloads > 0) updateDownloadsProgress(); }, 1000);

    if (window.electronAPI) {
      setupIpcHandlers();
      setTimeout(() => {
        initContextMenu();
        setTimeout(() => { blockMainPageContextMenu(); }, 1000);
      }, 500);
      setTimeout(async () => { try { await window.electronAPI.invoke('get-plugins'); } catch (error) {} }, 1500);
    }
  } catch (error) {}
}

function setupIpcHandlers() {
  if (!window.electronAPI) return;
  window.electronAPI.on('save-tabs', () => { saveTabsState(); window.electronAPI.send('tabs-saved'); });
  window.electronAPI.on('OPEN_URL', (url) => { if (url && url !== 'about:blank') createTab(url); });
  window.electronAPI.on('restart-required', (data) => {
    showToast(data.message, 5000);
    if (!document.getElementById('restart-button')) {
      const restartBtn = document.createElement('button');
      restartBtn.id = 'restart-button';
      restartBtn.innerHTML = '🔄 Перезапустить браузер';
      restartBtn.style.cssText = `position: fixed; bottom: 20px; right: 20px; background: linear-gradient(90deg, #FF6B6B, #FF8E53); color: white; border: none; border-radius: 10px; padding: 10px 15px; font-size: 12px; font-weight: 600; cursor: pointer; z-index: 99999; box-shadow: 0 4px 12px rgba(255,107,107,0.3);`;
      restartBtn.onclick = restartBrowser;
      document.body.appendChild(restartBtn);
    }
  });
  window.electronAPI.on('extensions-loaded', (data) => { if (document.getElementById('extensionsDropdown')?.classList.contains('show')) setTimeout(() => loadExtensionsDropdown(), 300); });
  window.electronAPI.on('extensions-updated', () => { loadExtensionsDropdown(); });
  window.electronAPI.on('extension-state-changed', () => { loadExtensionsDropdown(); });
  window.electronAPI.on('extension-storage-changed', (data) => {
    document.querySelectorAll('iframe[id^="extension-popup-iframe"]').forEach(iframe => {
      try { iframe.contentWindow.postMessage({ type: 'extension-storage-updated', extensionId: data.extensionId, data: data }, '*'); } catch (error) {}
    });
  });
  window.electronAPI.on('extension-settings-save', (data) => { const { extensionId, settings } = data; ExtensionStorage.saveSettings(extensionId, settings); });

  window.electronAPI.on('apply-custom-theme', (css) => {
    applyCustomTheme(css);
  });

  window.electronAPI.on('clear-custom-theme', () => {
    removeCustomTheme();
  });

  if (window.electronAPI.onDownloadStarted) {
    window.electronAPI.onDownloadStarted((data) => {
      const { id, filename, totalBytes } = data;
      ongoingDownloads.set(id, { id, filename, progress: 0, totalBytes: totalBytes || 0, receivedBytes: 0, state: 'progressing', time: Date.now(), lastUpdate: Date.now(), speed: 0, eta: 0 });
      activeDownloads++;
      updateDownloadIconState();
      updateDownloadsDropdown();
    });
  }
  if (window.electronAPI.onDownloadProgress) {
    window.electronAPI.onDownloadProgress((data) => {
      const { id, receivedBytes, totalBytes } = data;
      const download = ongoingDownloads.get(id);
      if (download) {
        const now = Date.now(); const timeDiff = (now - download.lastUpdate) / 1000;
        if (timeDiff > 0 && receivedBytes > download.receivedBytes) {
          const bytesDiff = receivedBytes - download.receivedBytes;
          download.speed = bytesDiff / timeDiff;
          if (download.speed > 0 && totalBytes > 0) {
            const remainingBytes = totalBytes - receivedBytes;
            download.eta = remainingBytes / download.speed;
          }
        }
        download.receivedBytes = receivedBytes; download.totalBytes = totalBytes; download.progress = totalBytes > 0 ? (receivedBytes / totalBytes) * 100 : 0; download.lastUpdate = now; download.state = 'progressing';
      }
      updateDownloadsDropdown();
    });
  }
  if (window.electronAPI.onDownloadState) {
    window.electronAPI.onDownloadState((data) => {
      const { id, state } = data;
      const download = ongoingDownloads.get(id); if (download) download.state = state;
      if (state === 'completed' || state === 'cancelled' || state === 'interrupted') {
        activeDownloads = Math.max(0, activeDownloads - 1);
        if (state === 'completed') hasNewDownloads = true;
        updateDownloadIconState();
        if (state === 'completed') { setTimeout(() => { ongoingDownloads.delete(id); updateDownloadsDropdown(); }, 5000); } else ongoingDownloads.delete(id);
      }
      updateDownloadsDropdown();
    });
  }
  if (window.electronAPI.onDownloadCompleted) {
    window.electronAPI.onDownloadCompleted((data) => {
      const { id, filename, url, totalBytes, fullPath, time } = data;
      const download = ongoingDownloads.get(id); if (download) { download.state = 'completed'; download.progress = 100; }
      addDownload(filename, url, totalBytes, fullPath, time);
      updateDownloadsDropdown();
    });
  }
  if (window.electronAPI.onDownloadsUpdated) {
    window.electronAPI.onDownloadsUpdated(() => {
      downloads = JSON.parse(localStorage.getItem('browserDownloads') || '[]');
      sessionDownloads = []; ongoingDownloads.clear(); activeDownloads = 0; hasNewDownloads = false;
      updateDownloadIconState(); updateDownloadsDropdown();
      views.forEach(view => {
        const wv = view.querySelector('webview');
        if (wv && wv.getURL().includes('Settings.html')) wv.send('downloads-updated');
      });
    });
  }
  window.electronAPI.on('passwords-updated', () => { refreshPasswordsFromSystem(); updatePasswordsDropdown(); });
  window.electronAPI.on('page-saved', (data) => { if (data.success) showToast(`Страница сохранена: ${data.filename}`); else showToast(`Ошибка сохранения: ${data.error}`, 'error'); });
  window.electronAPI.on('security-blocked', (data) => { const type = data.type || 'tracker'; incrementBlockedCounter(type); if (type === 'malware' || type === 'phishing') showToast(`Заблокировано: ${type === 'malware' ? 'вредоносный сайт' : 'фишинг'}`, 'warning'); });
  window.electronAPI.on('extension-data-saved', (data) => {});
  window.electronAPI.on('extension-data-loaded', (data) => {});
  window.electronAPI.on('extension-storage-error', (error) => {});
}

function updateDownloadIconState() {
  if (!downloadsIcon) return;
  downloadsIcon.classList.remove('active-download', 'new-download');
  if (activeDownloads > 0) downloadsIcon.classList.add('active-download');
  else if (hasNewDownloads) downloadsIcon.classList.add('new-download');
}

function resetDownloadIcon() { hasNewDownloads = false; updateDownloadIconState(); }

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
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
      const now = Date.now(); const timeDiff = (now - download.lastUpdate) / 1000;
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
  const activeArray = Array.from(ongoingDownloads.entries()).filter(([_, d]) => d.state === 'progressing' || d.state === 'started').sort((a, b) => a[1].time - b[1].time);
  const recentArray = sessionDownloads.sort((a, b) => b.time - a.time).slice(0, 3);
  if (activeArray.length === 0 && recentArray.length === 0) {
    list.innerHTML = '<div class="no-downloads">Нет активных загрузок</div>';
    return;
  }
  activeArray.forEach(([id, item]) => {
    const div = document.createElement('div'); div.className = 'download-item-dropdown active';
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
    div.innerHTML = `<div class="download-header"><span class="filename">${item.filename}</span><span class="status">${getStateText(item.state)}</span></div>
    <div class="progress-container"><div class="progress-bar" style="width: ${progress}%"></div></div>
    <div class="download-details"><span class="progress-text">${statusText}</span><div class="download-actions"><button class="cancel-btn" data-id="${id}" title="Отменить">✕</button></div></div>`;
    list.appendChild(div);
  });
  if (activeArray.length > 0 && recentArray.length > 0) {
    const separator = document.createElement('div'); separator.className = 'download-separator'; list.appendChild(separator);
  }
  recentArray.forEach(item => {
    const div = document.createElement('div'); div.className = 'download-item-dropdown completed';
    const timeAgo = formatTimeAgo(Date.now() - item.time);
    div.innerHTML = `<div class="download-header"><span class="filename">${item.filename}</span><span class="status completed">✓</span></div>
    <div class="download-details"><span class="progress-text">${formatBytes(item.totalBytes)} • ${timeAgo}</span><div class="download-actions"><button class="open-btn" data-path="${item.fullPath}" title="Открыть папку">📂</button></div>`;
    list.appendChild(div);
  });
  list.querySelectorAll('.cancel-btn').forEach(btn => { btn.onclick = (e) => { e.stopPropagation(); const id = btn.dataset.id; window.electronAPI.send('cancel-download', id); }; });
  list.querySelectorAll('.open-btn').forEach(btn => { btn.onclick = (e) => { e.stopPropagation(); const filePath = btn.dataset.path; window.electronAPI.send('open-folder', filePath); }; });
}

function getStateText(state) {
  const states = { 'progressing': 'Загружается', 'started': 'Начало', 'paused': 'На паузе', 'completed': 'Завершено', 'cancelled': 'Отменено', 'interrupted': 'Ошибка' };
  return states[state] || state;
}

function addDownload(filename, url, totalBytes, fullPath, time) {
  const item = { filename, url, time, totalBytes, fullPath, state: 'completed' };
  sessionDownloads.push(item); downloads.push(item);
  if (downloads.length > 500) downloads.shift();
  localStorage.setItem('browserDownloads', JSON.stringify(downloads));
  views.forEach(view => { const wv = view.querySelector('webview'); if (wv && wv.getURL().includes('Settings.html')) wv.send('downloads-updated'); });
}

// Переопределяем createTab с учётом выгрузки и краша (но createTab уже определён выше, поэтому просто дополняем логику)
// Вместо переопределения добавим вызовы scheduleTabUnload и setupCrashHandler внутри createTab
// Для этого модифицируем createTab, добавив в конец:

const originalCreateTab = createTab;
createTab = function(url = START_PAGE) {
  originalCreateTab(url);
  const newIndex = tabs.length - 1;
  scheduleTabUnload(newIndex);
  const webview = views[newIndex]?.querySelector('webview');
  if (webview) {
    setupCrashHandler(webview, newIndex);
  }
};

const originalActivateTab = activateTab;
activateTab = function(i) {
  restoreTabIfUnloaded(i);
  originalActivateTab(i);
  tabs.forEach((_, idx) => {
    if (idx !== i) scheduleTabUnload(idx);
  });
};

const originalCloseTab = closeTab;
closeTab = function(i) {
  if (unloadTimers.has(i)) {
    clearTimeout(unloadTimers.get(i));
    unloadTimers.delete(i);
  }
  originalCloseTab(i);
};

// ========== Остальной код без изменений (продолжение) ==========

window.ExtensionPopupManager = ExtensionPopupManager;
window.ExtensionStorage = ExtensionStorage;

window.PasswordManager = {
  addPassword: async (site, username, password, notes = '') => {
    const result = await window.electronAPI.addPassword({ site, username, password, notes });
    if (result.success) { await refreshPasswordsFromSystem(); return result; } return result;
  },
  editPassword, deletePassword: async (id) => { const result = await window.electronAPI.deletePassword(id); if (result.success) await refreshPasswordsFromSystem(); return result; },
  searchPasswords, getPasswordById, exportPasswords, importPasswords, clearAllPasswords,
  generateStrongPassword: function(length = 16) {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?"; let password = "";
    for (let i = 0; i < length; i++) { const randomIndex = Math.floor(Math.random() * charset.length); password += charset[randomIndex]; }
    return password;
  },
  getPasswords: () => passwords, updateDropdown: updatePasswordsDropdown, refreshFromSystem: refreshPasswordsFromSystem
};

document.addEventListener('DOMContentLoaded', () => { setTimeout(() => { if (typeof initPasswordManager === 'function') initPasswordManager(); }, 1000); });

if (window.electronAPI && window.electronAPI.onPasswordsUpdated) {
  window.electronAPI.onPasswordsUpdated(() => { refreshPasswordsFromSystem(); });
}

window.addEventListener('beforeunload', async () => {
  try {
    const extensions = await window.electronAPI.invoke('get-plugins');
    if (extensions && extensions.length > 0) {
      for (const ext of extensions) {
        const settings = ExtensionStorage.getSettings(ext.id);
        if (Object.keys(settings).length > 0) await UniversalExtensionStorage.saveExtensionData(ext.id, 'settings', settings);
        await UniversalExtensionStorage.saveExtensionData(ext.id, 'state', ext.enabled || false);
      }
    }
    await UniversalExtensionStorage.backupExtensionsData();
  } catch (error) {}
});

setInterval(async () => {
  try {
    const extensions = await window.electronAPI.invoke('get-plugins');
    const now = Date.now(); const fiveMinutesAgo = now - 5 * 60 * 1000;
    for (const ext of extensions) {
      const files = UniversalExtensionStorage.getExtensionFiles(ext.id);
      for (const file of files) {
        if (file.timestamp > fiveMinutesAgo) {
          const data = await UniversalExtensionStorage.loadExtensionData(ext.id, file.dataType || file.fileName);
          if (data) await UniversalExtensionStorage.saveExtensionData(ext.id, file.dataType || file.fileName, data);
        }
      }
    }
  } catch (error) {}
}, 5 * 60 * 1000);

setTimeout(async () => {
  const integrity = StorageUtils.checkDataIntegrity();
  if (integrity.invalid > 0) {
    const repairResult = await StorageUtils.repairCorruptedData();
  }
  StorageUtils.cleanupOldData(30);
  if (window.electronAPI) {
    try {
      const plugins = await window.electronAPI.invoke('get-plugins');
      if (plugins && plugins.length > 0) {
        for (const plugin of plugins) {
          const savedData = await UniversalExtensionStorage.loadExtensionData(plugin.id, 'settings');
          const files = UniversalExtensionStorage.getExtensionFiles(plugin.id);
        }
      }
    } catch (error) {}
  }
}, 3000);

setInterval(() => updateNavButtons(), 500);
