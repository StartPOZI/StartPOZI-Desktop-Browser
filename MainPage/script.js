(function() {
    if (!window.electronAPI) { console.warn('[MP-SYNC] no window.electronAPI'); return; }
    try {
        var data = window.electronAPI.getMainPageDataSync();
        if (data && typeof data === 'object') {
            Object.keys(data).forEach(function(k) {
                try { localStorage.setItem(k, data[k]); } catch(e) {}
            });
        }
    } catch(e) {}
    function _syncOut() {
        try {
            var d = {};
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && k.indexOf('startpozi_') === 0) d[k] = localStorage.getItem(k);
            }
            window.electronAPI.setMainPageData(d);
        } catch(e) {}
    }
    document.addEventListener('DOMContentLoaded', function() { setTimeout(_syncOut, 1000); });
    setInterval(_syncOut, 3000);
    window.addEventListener('beforeunload', _syncOut);
})();

document.addEventListener('DOMContentLoaded', function() {
    // ========== DOM elements ==========
    const sitesGrid = document.getElementById('sitesGrid');
    const mainContent = document.getElementById('mainContent');
    const personalizeBtn = document.getElementById('personalizeBtn');
    const customizePanel = document.getElementById('customizePanel');
    const closePanelBtn = document.getElementById('closePanelBtn');
    const menuOverlay = document.getElementById('menuOverlay');
    const subWallpaperMenu = document.getElementById('subWallpaperMenu');
    const subBackBtn = document.getElementById('subBackBtn');
    const subCategoryTitle = document.getElementById('subCategoryTitle');
    const subOptionsGrid = document.getElementById('subOptionsGrid');
    const spiLiveToggle = document.getElementById('spiLiveToggle');
    const wallpapersToggle = document.getElementById('wallpapersToggle');
    const shortcutsToggle = document.getElementById('shortcutsToggle');
    const manageSettingsLink = document.getElementById('manageSettingsLink');
    const weatherToggle = document.getElementById('weatherToggle'); // new toggle
    const searchWidgetToggle = document.getElementById('searchWidgetToggle');
    const todoWidgetToggle = document.getElementById('todoWidgetToggle');
    const miniPlayerToggle = document.getElementById('miniPlayerToggle');
    const downloadsToggle = document.getElementById('downloadsToggle');
    const customWidgetsToggle = document.getElementById('customWidgetsToggle');
    const widgetsLayer = document.getElementById('widgetsLayer');

    // Modal window
    const modal = document.getElementById('editModal');
    const modalTitle = document.getElementById('modalTitle');
    const editTitle = document.getElementById('editTitle');
    const editUrl = document.getElementById('editUrl');
    const editIcon = document.getElementById('editIcon');
    const previewIcon = document.getElementById('previewIcon');
    const previewName = document.getElementById('previewName');
    const previewUrl = document.getElementById('previewUrl');
    const editForm = document.getElementById('editForm');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');

    // ========== Global variables ==========
    const faviconCache = new Map();
    let draggedItem = null;
    let currentEditCard = null;
    let bingInterval = null;
    let isBingMode = false;
    let weatherInterval = null;
    let timeInterval = null;
    let currentWeather = { temp: null, code: null, isDay: true };
    let userCoords = null;
    let weatherWidget = null;

    const defaultSites = [
        { name: 'Google', url: 'https://www.google.com' },
        { name: 'YouTube', url: 'https://www.youtube.com' },
        { name: 'GitHub', url: 'https://github.com' },
        { name: 'ChatGPT', url: 'https://chat.openai.com' },
        { name: 'Gmail', url: 'https://mail.google.com' }
    ];

    const fallbackSvg = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;

    const colorGradients = [
        { name: 'Dark', gradient: 'linear-gradient(135deg, #1f1f1f, #111111)' },
                          { name: 'Iris', gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
                          { name: 'Aurora', gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' },
                          { name: 'Powder', gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
                          { name: 'Sunset', gradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)' },
                          { name: 'Ocean', gradient: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)' }
    ];

    // ========== WEATHER AND TIME WIDGET (can be hidden) ==========
    function createWeatherWidget() {
        if (weatherWidget) return;
        const widget = document.createElement('div');
        widget.id = 'weatherWidget';
        widget.className = 'weather-widget';
        widget.innerHTML = `
        <div class="weather-icon">⛅</div>
        <div class="weather-temp">-- °C</div>
        <div class="weather-time">--:--</div>
        `;
        document.body.appendChild(widget);
        weatherWidget = widget;

        // Restore visibility state
        const weatherEnabled = localStorage.getItem('startpozi_weather_enabled') !== 'false';
        weatherToggle.checked = weatherEnabled;
        if (!weatherEnabled) {
            widget.classList.add('hidden');
            return;
        }

        // Start updates only if the widget is active
        updateTime();
        if (timeInterval) clearInterval(timeInterval);
        timeInterval = setInterval(updateTime, 60000);
        fetchLocationAndWeather();
        if (weatherInterval) clearInterval(weatherInterval);
        weatherInterval = setInterval(fetchLocationAndWeather, 3600000);
    }

    function updateTime() {
        if (!weatherWidget || weatherWidget.classList.contains('hidden')) return;
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const timeEl = weatherWidget.querySelector('.weather-time');
        if (timeEl) timeEl.textContent = timeStr;
    }

    async function fetchLocationAndWeather() {
        if (!weatherWidget || weatherWidget.classList.contains('hidden')) return;
        // Privacy-friendly by default: with manual mode we never contact an
        // IP geolocation service — only the weather API gets the coordinates.
        const geoMode = localStorage.getItem('startpozi_weather_geo_mode') || 'manual';
        if (geoMode !== 'auto') {
            const lat = parseFloat(localStorage.getItem('startpozi_weather_lat'));
            const lon = parseFloat(localStorage.getItem('startpozi_weather_lon'));
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
                await fetchWeather(lat, lon);
            } else {
                // Default location until the user sets their own coordinates.
                await fetchWeather(55.7558, 37.6173);
            }
            return;
        }
        try {
            // ip-api.com's free tier is HTTP-only, so the old URL failed
            // 100% of the time from an https-capable page ("Detect via IP"
            // was dead and silently fell back to Moscow). ipwho.is serves
            // free HTTPS.
            const geoResp = await fetch('https://ipwho.is/?fields=latitude,longitude');
            const geoData = await geoResp.json();
            const lat = geoData && (geoData.latitude || geoData.lat);
            const lon = geoData && (geoData.longitude || geoData.lon);
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
                userCoords = { lat: lat, lon: lon };
                await fetchWeather(userCoords.lat, userCoords.lon);
            } else {
                throw new Error('Could not determine coordinates');
            }
        } catch (error) {
            console.error('[Weather] Error getting coordinates:', error);
            await fetchWeather(55.7558, 37.6173);
        }
    }

    async function fetchWeather(lat, lon) {
        if (!weatherWidget || weatherWidget.classList.contains('hidden')) return;
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&timezone=auto`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.current_weather) {
                const temp = Math.round(data.current_weather.temperature);
                const weatherCode = data.current_weather.weathercode;
                const isDay = data.current_weather.is_day === 1;
                currentWeather = { temp, code: weatherCode, isDay };
                updateWeatherUI();
            } else {
                throw new Error('No weather data');
            }
        } catch (error) {
            console.error('[Weather] Error getting data:', error);
            const tempEl = weatherWidget?.querySelector('.weather-temp');
            if (tempEl) tempEl.textContent = '? °C';
        }
    }

    function updateWeatherUI() {
        if (!weatherWidget || weatherWidget.classList.contains('hidden')) return;
        const iconEl = weatherWidget.querySelector('.weather-icon');
        const tempEl = weatherWidget.querySelector('.weather-temp');
        if (!iconEl || !tempEl) return;
        tempEl.textContent = `${currentWeather.temp}°C`;
        const code = currentWeather.code;
        let icon = '🌡️';
        if (code === 0) icon = '☀️';
        else if (code === 1 || code === 2) icon = '⛅';
        else if (code === 3) icon = '☁️';
        else if (code >= 45 && code <= 48) icon = '🌫️';
        else if (code >= 51 && code <= 57) icon = '🌧️';
        else if (code >= 61 && code <= 67) icon = '🌧️';
        else if (code >= 71 && code <= 77) icon = '❄️';
        else if (code >= 80 && code <= 82) icon = '🌦️';
        else if (code >= 95 && code <= 99) icon = '⛈️';
        else icon = '🌡️';
        iconEl.textContent = icon;
    }

    function setWeatherWidgetVisible(visible) {
        if (!weatherWidget) return;
        if (visible) {
            weatherWidget.classList.remove('hidden');
            // Start updates if they were stopped
            if (timeInterval) clearInterval(timeInterval);
            timeInterval = setInterval(updateTime, 60000);
            if (weatherInterval) clearInterval(weatherInterval);
            weatherInterval = setInterval(fetchLocationAndWeather, 3600000);
            updateTime();
            fetchLocationAndWeather();
        } else {
            weatherWidget.classList.add('hidden');
            // Stop the intervals to save resources
            if (timeInterval) { clearInterval(timeInterval); timeInterval = null; }
            if (weatherInterval) { clearInterval(weatherInterval); weatherInterval = null; }
        }
    }

    // ========== GENERAL WIDGET SYSTEM ==========
    const SEARCH_ENGINES = [
        { name: 'StartPOZI',  url: 'https://startpozi.com/search.html?q=' },
        { name: 'Google',     url: 'https://www.google.com/search?q=' },
        { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
        { name: 'Yandex',     url: 'https://yandex.ru/search/?text=' },
        { name: 'Bing',       url: 'https://www.bing.com/search?q=' }
    ];

    let searchWidget = null;
    let todoWidget = null;
    let miniPlayerWidget = null;
    let downloadsWidget = null;
    let customWidgetsContainer = null;
    let mediaControlCb = null;

    // Browser shell integration hooks (via webview.executeJavaScript)
    window.StartPOZI = {
        addDownload(item) { if (downloadsWidget) addDownloadItem(item); },
        updateDownload(id, patch) { if (downloadsWidget) updateDownloadItem(id, patch); },
        setMedia(info) { if (miniPlayerWidget) setMediaInfo(info); },
        onControl(cb) { mediaControlCb = typeof cb === 'function' ? cb : null; }
    };

    // ========== LAYOUT CONFLICT RESOLUTION ==========
    // Shifts the logo/shortcuts so floating widgets do not overlap them
    function updateLayout() {
        const header = document.querySelector('.header');
        const container = document.querySelector('.container');
        if (!header || !container) return;
        refreshDock();
        const isOn = w => w && !w.classList.contains('hidden');
        // In compact mode widgets collapse into the dock; reserve space at the bottom,
        // so the bottom tiles/"add site" do not end up under the dock
        if (document.body.classList.contains('widgets-compact')) {
            header.style.marginTop = '';
            mainContent.style.paddingRight = '';
            container.style.paddingBottom = !mainContent.classList.contains('hidden') ? '96px' : '';
            return;
        }
        const shortcutsVisible = !mainContent.classList.contains('hidden');

        // The search bar (top center) overlaps the logo — shift the header down
        header.style.marginTop = isOn(searchWidget) ? '52px' : '';

        if (shortcutsVisible) {
            // To-do list on the right — leave space so shortcuts do not go under the panel
            mainContent.style.paddingRight = isOn(todoWidget) ? '300px' : '';
            // Bottom widgets — reserve space at the bottom
            const bottomOn = isOn(miniPlayerWidget) || isOn(downloadsWidget) || isOn(customWidgetsContainer);
            container.style.paddingBottom = bottomOn ? '120px' : '';
        } else {
            mainContent.style.paddingRight = '';
            container.style.paddingBottom = '';
        }
    }

    // ========== COMPACT MODE (widgets collapse into the dock on small windows) ==========
    const COMPACT_THRESHOLD = 1000;
    const DOCK_WIDGETS = [
        { key: 'search',     icon: '🔍', el: () => searchWidget },
        { key: 'todo',       icon: '📋', el: () => todoWidget },
        { key: 'mini',       icon: '🎵', el: () => miniPlayerWidget },
        { key: 'weather',    icon: '⛅', el: () => weatherWidget },
        { key: 'downloads',  icon: '⬇️', el: () => downloadsWidget, expand: (el, open) => { const p = el && el.querySelector('.dl-panel'); if (p) p.classList.toggle('open', open); } },
        { key: 'custom',     icon: '🧩', el: () => customWidgetsContainer }
    ];
    let widgetDock = null;

    function ensureDock() {
        if (widgetDock) return;
        widgetDock = document.createElement('div');
        widgetDock.id = 'widgetDock';
        document.body.appendChild(widgetDock);
    }

    function refreshDock() {
        ensureDock();
        const compact = document.body.classList.contains('widgets-compact');
        const expandedKey = compact
            ? (DOCK_WIDGETS.find(w => { const e = w.el(); return e && e.classList.contains('dock-expanded'); }) || {}).key
            : null;
        widgetDock.innerHTML = '';
        DOCK_WIDGETS.forEach(w => {
            const el = w.el();
            if (!el || el.classList.contains('hidden')) return; // only enabled widgets
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'dock-btn' + (w.key === expandedKey ? ' active' : '');
            btn.dataset.key = w.key;
            btn.textContent = w.icon;
            btn.title = w.key;
            btn.addEventListener('click', (e) => { e.stopPropagation(); toggleDockWidget(w.key); });
            widgetDock.appendChild(btn);
        });
        // Show the dock explicitly only in compact mode and only if there is at least one button
        widgetDock.style.display = (compact && widgetDock.children.length > 0) ? 'flex' : 'none';
    }

    function toggleDockWidget(key) {
        const meta = DOCK_WIDGETS.find(w => w.key === key);
        if (!meta) return;
        const el = meta.el();
        if (!el) return;
        const wasExpanded = el.classList.contains('dock-expanded');
        // close all
        DOCK_WIDGETS.forEach(w => {
            const e = w.el();
            if (!e) return;
            if (e.classList.contains('dock-expanded') && w.expand) w.expand(e, false);
            e.classList.remove('dock-expanded');
        });
        if (!wasExpanded) {
            el.classList.add('dock-expanded');
            if (meta.expand) meta.expand(el, true);
            const btn = widgetDock && widgetDock.querySelector(`.dock-btn[data-key="${key}"]`);
            if (btn) btn.classList.add('active');
        }
        refreshDock();
    }

    let _compactState = null;
    // Real viewport width (clientWidth is more reliable than innerWidth in a webview)
    function viewportWidth() {
        return (document.documentElement && document.documentElement.clientWidth) || window.innerWidth;
    }
    function updateCompactMode(src) {
        const compact = viewportWidth() < COMPACT_THRESHOLD;
        const changed = compact !== _compactState;
        if (src === 'interval' && !changed) return;
        _compactState = compact;
        if (changed) document.body.classList.toggle('widgets-compact', compact);
        if (!compact) {
            // when returning to a large window — collapse everything expanded in the dock
            DOCK_WIDGETS.forEach(w => {
                const e = w.el();
                if (!e) return;
                if (e.classList.contains('dock-expanded') && w.expand) w.expand(e, false);
                e.classList.remove('dock-expanded');
            });
        }
        refreshDock();
        updateLayout();
    }

    // ========== WIDGET: SEARCH BAR ==========
    // The default search engine is read from browser settings (electronAPI.getSearchEngine)
    async function resolveSearchEngineUrl() {
        const saved = localStorage.getItem('startpozi_search_engine');
        if (saved) return saved;
        try {
            if (window.electronAPI && typeof window.electronAPI.getSearchEngine === 'function') {
                const url = await window.electronAPI.getSearchEngine();
                if (url) return url;
            }
        } catch (e) {}
        return SEARCH_ENGINES[0].url;
    }

    function createSearchWidget() {
        if (searchWidget) return;
        const widget = document.createElement('div');
        widget.className = 'floating-widget search-widget';
        const options = SEARCH_ENGINES.map(e =>
            `<option value="${e.url}">${e.name}</option>`
        ).join('');
        widget.innerHTML = `
            <form class="search-widget-form" autocomplete="off">
                <div class="search-widget-select-wrap">
                    <select class="search-widget-engine" title="Search engine">${options}</select>
                </div>
                <input class="search-widget-input" type="text" placeholder="Search the web…" />
                <button class="search-widget-btn" type="submit" title="Search">
                    <svg viewBox="0 0 24 24" class="icon-svg"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                </button>
            </form>`;
        widgetsLayer.appendChild(widget);
        searchWidget = widget;

        const form = widget.querySelector('.search-widget-form');
        const input = widget.querySelector('.search-widget-input');
        const engineSel = widget.querySelector('.search-widget-engine');

        // Apply the search engine from settings (or the saved choice)
        resolveSearchEngineUrl().then(url => {
            let matched = SEARCH_ENGINES.some(e => e.url === url);
            if (!matched) {
                const opt = document.createElement('option');
                opt.value = url; opt.textContent = 'Custom (from settings)';
                engineSel.appendChild(opt);
            }
            engineSel.value = url;
        });

        engineSel.addEventListener('change', () => localStorage.setItem('startpozi_search_engine', engineSel.value));
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const q = input.value.trim();
            if (!q) return;
            const url = engineSel.value || SEARCH_ENGINES[0].url;
            window.location.href = url + encodeURIComponent(q);
        });
        setTimeout(() => input.focus(), 200);
    }

    function setSearchWidgetVisible(visible) {
        if (!searchWidget) return;
        searchWidget.classList.toggle('hidden', !visible);
        if (visible) { const i = searchWidget.querySelector('.search-widget-input'); if (i) setTimeout(() => i.focus(), 100); }
    }

    // ========== WIDGET: TO-DO LIST ==========
    function loadTodos() {
        try { return JSON.parse(localStorage.getItem('startpozi_todos')) || []; }
        catch (e) { return []; }
    }
    function saveTodos(arr) { localStorage.setItem('startpozi_todos', JSON.stringify(arr)); }

    function createTodoWidget() {
        if (todoWidget) return;
        const widget = document.createElement('div');
        widget.className = 'floating-widget todo-widget';
        widget.innerHTML = `
            <div class="widget-head">
                <span class="widget-title">📋 To-do list</span>
                <span class="todo-count"></span>
            </div>
            <form class="todo-form" autocomplete="off">
                <input class="todo-input" type="text" placeholder="New task…" maxlength="120" />
                <button class="todo-add" type="submit">+</button>
            </form>
            <ul class="todo-list"></ul>
            <div class="todo-footer"><button class="todo-clear" type="button">Clear completed</button></div>`;
        widgetsLayer.appendChild(widget);
        todoWidget = widget;

        const listEl = widget.querySelector('.todo-list');
        const form = widget.querySelector('.todo-form');
        const input = widget.querySelector('.todo-input');
        const countEl = widget.querySelector('.todo-count');
        const clearBtn = widget.querySelector('.todo-clear');

        function render() {
            const todos = loadTodos();
            listEl.innerHTML = '';
            if (todos.length === 0) {
                const empty = document.createElement('li');
                empty.className = 'todo-empty';
                empty.textContent = 'List is empty';
                listEl.appendChild(empty);
            } else {
                todos.forEach((t, i) => {
                    const li = document.createElement('li');
                    li.className = 'todo-item' + (t.done ? ' done' : '');
                    li.innerHTML = `
                        <label class="todo-check"><input type="checkbox" ${t.done ? 'checked' : ''}><span></span></label>
                        <span class="todo-text"></span>
                        <button class="todo-del" title="Delete">×</button>`;
                    li.querySelector('.todo-text').textContent = t.text;
                    li.querySelector('input[type=checkbox]').addEventListener('change', (e) => {
                        const arr = loadTodos(); arr[i].done = e.target.checked; saveTodos(arr); render();
                    });
                    li.querySelector('.todo-del').addEventListener('click', () => {
                        const arr = loadTodos(); arr.splice(i, 1); saveTodos(arr); render();
                    });
                    listEl.appendChild(li);
                });
            }
            const left = loadTodos().filter(t => !t.done).length;
            countEl.textContent = left ? `remaining: ${left}` : '';
        }

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = input.value.trim();
            if (!text) return;
            const arr = loadTodos();
            arr.push({ text, done: false });
            saveTodos(arr);
            input.value = '';
            render();
        });
        clearBtn.addEventListener('click', () => {
            saveTodos(loadTodos().filter(t => !t.done));
            render();
        });
        render();
    }
    function setTodoWidgetVisible(visible) {
        if (!todoWidget) return;
        todoWidget.classList.toggle('hidden', !visible);
    }

    // ========== WIDGET: MINI PLAYER ==========
    function createMiniPlayerWidget() {
        if (miniPlayerWidget) return;
        const widget = document.createElement('div');
        widget.className = 'floating-widget mini-player-widget';
        widget.innerHTML = `
            <div class="mp-artwork">🎵</div>
            <div class="mp-info">
                <div class="mp-title">Nothing is playing</div>
                <div class="mp-artist"></div>
            </div>
            <div class="mp-controls">
                <button class="mp-btn" data-act="prev" title="-10 сек">⏮</button>
                <button class="mp-btn mp-play" data-act="playpause" title="Играть/Пауза">▶</button>
                <button class="mp-btn" data-act="next" title="+30 сек">⏭</button>
            </div>`;
        widgetsLayer.appendChild(widget);
        miniPlayerWidget = widget;

        widget.addEventListener('click', (e) => {
            const btn = e.target.closest('.mp-btn');
            if (!btn) return;
            const act = btn.dataset.act;
            // Preferred: a control callback registered by the shell.
            // Fallback: the console IPC transport — main.js applies the
            // action to the tab that last started playing ('mediacontrol').
            // Without this the buttons did nothing at all.
            const send = (a) => {
                // Preferred: the DIRECT electronAPI IPC (internal pages get
                // the full bridge) — reliable in every case. Fallbacks:
                // shell-registered callback, then the console transport.
                try {
                    if (window.electronAPI && typeof window.electronAPI.mediaControl === 'function') {
                        window.electronAPI.mediaControl(a);
                        return;
                    }
                } catch (err0) {}
                if (mediaControlCb) mediaControlCb(a);
                else if (typeof window.__spzSend === 'function') {
                    try { window.__spzSend('mediacontrol', { act: a }); } catch (err) {}
                } else {
                    try { console.log('__SPZIPC__' + JSON.stringify({ kind: 'mediacontrol', payload: { act: a } })); } catch (err) {}
                }
            };
            if (act === 'playpause') {
                // Optimistic toggle; the bridge pushes the real state right after.
                const playing = widget.classList.toggle('playing');
                widget.querySelector('.mp-play').textContent = playing ? '⏸' : '▶';
                send('playpause');
            } else {
                send(act);
            }
        });

        // Reflect this page's MediaSession if the API is available
        if ('mediaSession' in navigator) {
            const refresh = () => {
                const m = navigator.mediaSession.metadata;
                if (m) setMediaInfo({ title: m.title, artist: m.artist, artwork: m.artwork && m.artwork[0] && m.artwork[0].src });
            };
            refresh();
            try {
                ['play', 'pause', 'previoustrack', 'nexttrack'].forEach(a => {
                    navigator.mediaSession.setActionHandler(a, refresh);
                });
            } catch (e) {}
        }
    }
    function setMediaInfo(info) {
        if (!miniPlayerWidget) return;
        const titleEl = miniPlayerWidget.querySelector('.mp-title');
        const artistEl = miniPlayerWidget.querySelector('.mp-artist');
        const artEl = miniPlayerWidget.querySelector('.mp-artwork');
        titleEl.textContent = (info && info.title) || 'Nothing is playing';
        artistEl.textContent = (info && info.artist) || '';
        if (info && info.artwork) {
            artEl.textContent = '';
            var img = document.createElement('img');
            img.src = info.artwork; img.alt = '';
            artEl.appendChild(img);
        } else {
            artEl.textContent = '🎵';
        }
        if (info && typeof info.playing === 'boolean') {
            miniPlayerWidget.classList.toggle('playing', info.playing);
            miniPlayerWidget.querySelector('.mp-play').textContent = info.playing ? '⏸' : '▶';
        } else if (!info) {
            // Cleared state (nothing playing anywhere) — reset the button.
            miniPlayerWidget.classList.remove('playing');
            miniPlayerWidget.querySelector('.mp-play').textContent = '▶';
        }
    }
    function setMiniPlayerVisible(visible) {
        if (!miniPlayerWidget) return;
        miniPlayerWidget.classList.toggle('hidden', !visible);
    }

    // ========== WIDGET: DOWNLOADS ==========
    function loadDownloads() {
        try { return JSON.parse(localStorage.getItem('startpozi_downloads')) || []; }
        catch (e) { return []; }
    }
    function saveDownloads(arr) {
        // Keep only the last 50 completed + all active
        const active = arr.filter(d => d.state === 'progressing');
        const done = arr.filter(d => d.state !== 'progressing').slice(-50);
        localStorage.setItem('startpozi_downloads', JSON.stringify(done.concat(active)));
    }

    function createDownloadsWidget() {
        if (downloadsWidget) return;
        const widget = document.createElement('div');
        widget.className = 'floating-widget downloads-widget';
        widget.innerHTML = `
            <button class="dl-fab" title="Downloads">
                <svg viewBox="0 0 24 24" class="icon-svg"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span class="dl-badge" style="display:none;"></span>
            </button>
            <div class="dl-panel">
                <div class="widget-head">
                    <span class="widget-title">⬇ Downloads</span>
                    <button class="dl-clear" type="button">Clear</button>
                </div>
                <ul class="dl-list"></ul>
                <div class="dl-empty">No downloads</div>
            </div>`;
        widgetsLayer.appendChild(widget);
        downloadsWidget = widget;

        const fab = widget.querySelector('.dl-fab');
        const panel = widget.querySelector('.dl-panel');
        fab.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('open');
        });
        document.addEventListener('click', (e) => {
            if (panel.classList.contains('open') && !widget.contains(e.target)) panel.classList.remove('open');
        });
        widget.querySelector('.dl-clear').addEventListener('click', () => {
            saveDownloads(loadDownloads().filter(d => d.state === 'progressing'));
            renderDownloads();
        });
        renderDownloads();
    }

    function addDownloadItem(item) {
        if (!item || !item.id) item = Object.assign({ id: 'dl_' + Date.now() + '_' + Math.random().toString(36).slice(2,7) }, item || {});
        const arr = loadDownloads();
        arr.push(Object.assign({ name: 'File', state: 'progressing', progress: 0, size: null, added: Date.now() }, item));
        saveDownloads(arr);
        renderDownloads();
        if (downloadsWidget) downloadsWidget.querySelector('.dl-panel').classList.add('open');
    }

    function updateDownloadItem(id, patch) {
        const arr = loadDownloads();
        const it = arr.find(d => d.id === id);
        if (!it) return;
        Object.assign(it, patch);
        if (patch.state === 'completed' || patch.progress >= 100) {
            it.state = 'completed'; it.progress = 100;
        }
        saveDownloads(arr);
        renderDownloads();
    }

    function formatBytes(b) {
        if (!b && b !== 0) return '';
        const u = ['B','KB','MB','GB'];
        let i = 0; let n = b;
        while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
        return n.toFixed(n < 10 && i > 0 ? 1 : 0) + ' ' + u[i];
    }

    function renderDownloads() {
        if (!downloadsWidget) return;
        const arr = loadDownloads();
        const list = downloadsWidget.querySelector('.dl-list');
        const empty = downloadsWidget.querySelector('.dl-empty');
        const badge = downloadsWidget.querySelector('.dl-badge');
        list.innerHTML = '';

        const active = arr.filter(d => d.state === 'progressing');
        if (active.length > 0) {
            badge.style.display = 'inline-block';
            badge.textContent = active.length;
        } else {
            badge.style.display = 'none';
        }

        if (arr.length === 0) { empty.style.display = 'block'; return; }
        empty.style.display = 'none';

        const ordered = arr.slice().reverse();
        ordered.forEach(d => {
            const li = document.createElement('li');
            li.className = 'dl-item' + (d.state === 'progressing' ? ' active' : ' done');
            const pct = Math.min(100, Math.max(0, Math.round(d.progress || 0)));
            const sizeStr = d.size ? formatBytes(d.size) : '';
            li.innerHTML = `
                <div class="dl-name"></div>
                <div class="dl-meta"></div>
                <div class="dl-bar"><span style="width:${pct}%"></span></div>`;
            li.querySelector('.dl-name').textContent = d.name;
            li.querySelector('.dl-meta').textContent = d.state === 'progressing'
                ? (pct + '%' + (sizeStr ? ' · ' + sizeStr : ''))
                : ((d.state === 'failed' || d.state === 'interrupted') ? 'Failed' : 'Completed') + (sizeStr ? ' · ' + sizeStr : '');
            list.appendChild(li);
        });
    }

    function setDownloadsWidgetVisible(visible) {
        if (!downloadsWidget) return;
        downloadsWidget.classList.toggle('hidden', !visible);
        if (!visible) downloadsWidget.querySelector('.dl-panel').classList.remove('open');
    }

    // Real download events from the browser's download manager (IPC), instead
    // of the old simulated progress. MainPage is a trusted internal file://
    // page, so preload-webview exposes the download events to it.
    function _wireRealDownloads(api) {
        if (!api) return;
        if (api.onDownloadStarted) {
            api.onDownloadStarted(function (info) {
                if (!info) return;
                addDownloadItem({
                    id: info.id,
                    name: info.filename || 'File',
                    size: info.totalBytes || 0,
                    state: 'progressing',
                    progress: 0
                });
            });
        }
        if (api.onDownloadProgress) {
            api.onDownloadProgress(function (info) {
                if (!info || !info.id) return;
                const patch = { state: info.state === 'interrupted' || info.state === 'paused' || info.state === 'failed' ? info.state : 'progressing' };
                if (info.totalBytes > 0 && typeof info.receivedBytes === 'number') {
                    patch.progress = Math.min(100, info.receivedBytes / info.totalBytes * 100);
                    patch.size = info.totalBytes;
                } else if (typeof info.receivedBytes === 'number') {
                    patch.size = null;
                    patch.received = info.receivedBytes;
                }
                if (info.state === 'completed') { patch.state = 'completed'; patch.progress = 100; }
                if (info.state === 'cancelled' || info.state === 'failed') patch.state = 'failed';
                updateDownloadItem(info.id, patch);
            });
        }
        // Full re-sync (e.g. after a download is removed from the shell panel).
        if (api.onDownloadsUpdated) {
            api.onDownloadsUpdated(function () {
                if (!api.getDownloads) return;
                api.getDownloads().then(function (items) {
                    if (!Array.isArray(items)) return;
                    saveDownloads(items.slice(0, 50).map(function (d) {
                        return {
                            id: d.id,
                            name: d.filename || 'File',
                            size: d.totalBytes || 0,
                            state: d.state === 'progressing' ? 'progressing' : (d.state === 'completed' ? 'completed' : 'failed'),
                            progress: d.state === 'completed' ? 100 : (d.totalBytes ? Math.min(100, (d.receivedBytes || 0) / d.totalBytes * 100) : 0),
                            added: d.startTime || Date.now()
                        };
                    }));
                    renderDownloads();
                }).catch(function () {});
            });
        }
    }

    // ========== IN-PAGE DIALOGS ==========
    // Native alert()/confirm() are patched inside webview pages: confirm()
    // always returns false (the real answer arrives asynchronously), so
    // MainPage uses its own promise-based dialogs instead.
    function pageDialog(opts) {
        return new Promise(resolve => {
            const ov = document.createElement('div');
            ov.className = 'modal';
            ov.style.zIndex = '3000';
            const isConfirm = !!opts.cancelText;
            ov.innerHTML = `
                <div class="modal-content pd-content">
                    <div class="pd-title"></div>
                    ${opts.message ? '<div class="pd-msg"></div>' : ''}
                    <div class="modal-buttons">
                        ${isConfirm ? '<button type="button" class="btn-secondary pd-cancel"></button>' : ''}
                        <button type="button" class="${opts.danger ? 'btn-danger' : 'btn-primary'} pd-ok"></button>
                    </div>
                </div>`;
            ov.querySelector('.pd-title').textContent = opts.title || '';
            const msg = ov.querySelector('.pd-msg');
            if (msg) msg.textContent = opts.message;
            const okBtn = ov.querySelector('.pd-ok');
            okBtn.textContent = opts.okText || 'OK';
            const cancelBtn = ov.querySelector('.pd-cancel');
            if (cancelBtn) cancelBtn.textContent = opts.cancelText;
            function close(result) {
                ov.remove();
                document.removeEventListener('keydown', onKey);
                resolve(result);
            }
            function onKey(e) { if (e.key === 'Escape') close(false); }
            document.addEventListener('keydown', onKey);
            ov.addEventListener('click', e => { if (e.target === ov) close(false); });
            okBtn.addEventListener('click', () => close(true));
            if (cancelBtn) cancelBtn.addEventListener('click', () => close(false));
            document.body.appendChild(ov);
            okBtn.focus();
        });
    }
    function pageConfirm(title, message) {
        return pageDialog({ title, message, okText: 'Delete', cancelText: 'Cancel', danger: true });
    }
    function pageAlert(title, message) {
        return pageDialog({ title, message, okText: 'OK' });
    }

    // ========== WIDGET: CUSTOM WIDGETS (KDE Plasma-style) ==========
    const WIDGET_FILES = [
        { id: 'analog_clock',     name: 'Analog clock',        size: [190, 190] },
        { id: 'digital_datetime', name: 'Digital clock / date', size: [210, 110] },
        { id: 'mini_calendar',    name: 'Mini calendar',       size: [230, 240] },
        { id: 'quote_widget',     name: 'Quote of the day',    size: [230, 160] },
        { id: 'weather_widget',   name: 'Weather widget',      size: [200, 160] },
        { id: 'media_upload',     name: 'Media upload',        size: [190, 200] }
    ];
    const DEFAULT_WIDGET_SIZE = [220, 150];
    // Old builds embedded the whole widget HTML into localStorage at add time.
    // Detect those copies (by their old markup) and convert to live file refs
    // so redesigned widgets from Widgets/ are picked up.
    const LEGACY_WIDGET_MARKERS = {
        analog_clock: 'id="clockCanvas"',
        quote_widget: 'id="newQuote"',
        digital_datetime: 'id="clockDisplay"',
        mini_calendar: 'id="calendarBody"',
        weather_widget: 'id="weatherIcon"',
        media_upload: 'id="uploadFile"'
    };

    function widgetLang() {
        try {
            if (window.i18n && window.i18n.getLanguage) return window.i18n.getLanguage();
        } catch (e) {}
        return (navigator.language || 'en').slice(0, 2).toLowerCase() === 'ru' ? 'ru' : 'en';
    }

    function migrateCustomWidgets(arr) {
        let changed = false;
        arr.forEach(w => {
            if (w && w.type === 'html' && w.html) {
                for (const fid of Object.keys(LEGACY_WIDGET_MARKERS)) {
                    if (w.html.indexOf(LEGACY_WIDGET_MARKERS[fid]) !== -1 || w.html.indexOf('spz-widget:' + fid) !== -1) {
                        const meta = WIDGET_FILES.find(f => f.id === fid);
                        w.type = 'file';
                        w.fileId = fid;
                        if (meta) {
                            w.size = meta.size;
                            if (!w.name || w.name === 'Widget') w.name = meta.name;
                        }
                        delete w.html;
                        changed = true;
                        break;
                    }
                }
            }
        });
        if (changed) saveCustomWidgets(arr);
        return arr;
    }

    function loadCustomWidgets() {
        try { return JSON.parse(localStorage.getItem('startpozi_custom_widgets')) || []; }
        catch (e) { return []; }
    }
    function saveCustomWidgets(arr) { localStorage.setItem('startpozi_custom_widgets', JSON.stringify(arr)); }

    function createCustomWidgetsContainer() {
        if (customWidgetsContainer) return;
        const cont = document.createElement('div');
        cont.className = 'floating-widget custom-widgets-container';
        cont.innerHTML = `
            <div class="cw-add" title="Add widget">+</div>`;
        widgetsLayer.appendChild(cont);
        customWidgetsContainer = cont;
        cont.querySelector('.cw-add').addEventListener('click', openCustomWidgetModal);
        renderCustomWidgets();
    }

    // Inject the app language so built-in widget bodies can localize themselves.
    function injectLangIntoDoc(html) {
        const boot = '<script>window.__SPZ_LANG=' + JSON.stringify(widgetLang()) + ';</script>';
        if (html.indexOf('<head>') !== -1) return html.replace('<head>', '<head>' + boot);
        return boot + html;
    }

    function renderCustomWidgets() {
        if (!customWidgetsContainer) return;
        customWidgetsContainer.querySelectorAll('.cw-item').forEach(n => n.remove());
        const items = migrateCustomWidgets(loadCustomWidgets());
        items.forEach(w => customWidgetsContainer.appendChild(buildCustomWidgetItem(w)));
        // Built-in widgets load fresh from Widgets/ on every render (no stale copies)
        items.filter(w => w.type === 'file' && w.fileId).forEach(w => {
            const frame = customWidgetsContainer.querySelector('.cw-item[data-id="' + w.id + '"] .cw-frame');
            if (!frame) return;
            fetch('Widgets/' + w.fileId + '/' + w.fileId + '.htm')
                .then(r => { if (!r.ok) throw new Error('not found'); return r.text(); })
                .then(html => { frame.srcdoc = injectLangIntoDoc(html); })
                .catch(() => {
                    frame.srcdoc = injectLangIntoDoc('<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:transparent;color:rgba(255,255,255,.5);font:11px -apple-system,Segoe UI,Roboto,sans-serif}body{display:flex;align-items:center;justify-content:center}</style></head><body>Could not load widget</body></html>');
                });
        });
    }

    function buildSrcDoc(w) {
        if (w.type === 'html') return injectLangIntoDoc(w.html || '<div style="color:#fff;font:14px sans-serif;padding:8px">Empty widget</div>');
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:transparent;color:#fff;font-family:-apple-system,Segoe UI,Roboto,sans-serif}</style></head><body>${w.html || ''}</body></html>`;
    }

    function buildCustomWidgetItem(w) {
        const item = document.createElement('div');
        item.className = 'cw-item';
        item.dataset.id = w.id;
        const meta = (w.type === 'file') ? WIDGET_FILES.find(f => f.id === w.fileId) : null;
        const size = w.size || (meta && meta.size) || DEFAULT_WIDGET_SIZE;
        const src = (w.type === 'url' || w.type === 'file') ? '' : buildSrcDoc(w);
        // URL widgets: only http(s) may enter the src attribute — anything
        // else (file:, a quote breaking out of the attribute, ...) is a
        // sandbox escape / attribute-injection vector from stored data.
        const widgetUrl = String(w.url || '');
        const safeUrl = /^https?:\/\//i.test(widgetUrl) ? widgetUrl.replace(/"/g, '%22') : 'about:blank';
        const frameHtml = (w.type === 'url')
            ? `<iframe class="cw-frame" sandbox="allow-scripts allow-same-origin allow-popups" src="${safeUrl}"></iframe>`
            : `<iframe class="cw-frame" sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals" srcdoc="${src.replace(/"/g, '&quot;')}"></iframe>`;
        item.innerHTML = `
            <div class="cw-head">
                <span class="cw-name"></span>
                <button class="cw-del" title="Delete">×</button>
            </div>
            ${frameHtml}`;
        const frame = item.querySelector('.cw-frame');
        frame.style.setProperty('--cw-w', size[0] + 'px');
        frame.style.setProperty('--cw-h', size[1] + 'px');
        item.querySelector('.cw-name').textContent = w.name;
        item.querySelector('.cw-del').addEventListener('click', () => {
            pageConfirm('Delete widget', w.name).then(ok => {
                if (!ok) return;
                saveCustomWidgets(loadCustomWidgets().filter(x => x.id !== w.id));
                renderCustomWidgets();
            });
        });
        return item;
    }

    function setCustomWidgetsVisible(visible) {
        if (!customWidgetsContainer) return;
        customWidgetsContainer.classList.toggle('hidden', !visible);
    }

    // --- Add modal ---
    const customWidgetModal = document.getElementById('customWidgetModal');
    const customWidgetForm = document.getElementById('customWidgetForm');
    const customWidgetName = document.getElementById('customWidgetName');
    const customWidgetSource = document.getElementById('customWidgetSource');
    const customWidgetFile = document.getElementById('customWidgetFile');
    const customWidgetUrl = document.getElementById('customWidgetUrl');
    const customWidgetHtml = document.getElementById('customWidgetHtml');
    const customWidgetCloseBtn = document.getElementById('customWidgetCloseBtn');
    const customWidgetCancelBtn = document.getElementById('customWidgetCancelBtn');

    // Populate the list of available files from Widgets/
    WIDGET_FILES.forEach(w => {
        const o = document.createElement('option');
        o.value = w.id; o.textContent = w.name;
        customWidgetFile.appendChild(o);
    });

    function toggleCustomWidgetSource() {
        const v = customWidgetSource.value;
        document.getElementById('customWidgetHtmlGroup').style.display = (v === 'html') ? '' : 'none';
        document.getElementById('customWidgetFileGroup').style.display = (v === 'file') ? '' : 'none';
        document.getElementById('customWidgetUrlGroup').style.display = (v === 'url') ? '' : 'none';
    }
    customWidgetSource.addEventListener('change', toggleCustomWidgetSource);
    toggleCustomWidgetSource();

    function openCustomWidgetModal() {
        customWidgetName.value = '';
        customWidgetHtml.value = '';
        customWidgetUrl.value = '';
        customWidgetSource.value = 'html';
        toggleCustomWidgetSource();
        customWidgetModal.style.display = 'flex';
    }
    function closeCustomWidgetModal() { customWidgetModal.style.display = 'none'; }
    customWidgetCloseBtn.addEventListener('click', closeCustomWidgetModal);
    customWidgetCancelBtn.addEventListener('click', closeCustomWidgetModal);
    customWidgetModal.addEventListener('click', (e) => { if (e.target === customWidgetModal) closeCustomWidgetModal(); });

    customWidgetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = customWidgetName.value.trim() || 'Widget';
        const src = customWidgetSource.value;
        const entry = { id: 'cw_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), name, type: src };
        if (src === 'html') {
            entry.type = 'html';
            entry.html = customWidgetHtml.value;
        } else if (src === 'url') {
            entry.type = 'url';
            entry.url = customWidgetUrl.value.trim();
            if (!entry.url) { await pageAlert('Enter a URL'); return; }
            // Reject non-web schemes right in the form: the renderer also
            // refuses them at draw time, but failing early is clearer.
            if (!/^https?:\/\//i.test(entry.url)) { await pageAlert('Only http(s) URLs are allowed'); return; }
        } else if (src === 'file') {
            // Live file reference: the widget body is fetched fresh on every
            // render, so redesigns of Widgets/*.htm apply without re-adding.
            const fid = customWidgetFile.value;
            const meta = WIDGET_FILES.find(f => f.id === fid);
            if (!meta) { await pageAlert('Could not load widget', 'Widgets/' + fid + '/' + fid + '.htm'); return; }
            entry.type = 'file';
            entry.fileId = fid;
            entry.size = meta.size;
            if (!customWidgetName.value.trim()) entry.name = meta.name;
        }
        const arr = loadCustomWidgets();
        arr.push(entry);
        saveCustomWidgets(arr);
        renderCustomWidgets();
        closeCustomWidgetModal();
    });

    // ========== Wallpaper management ==========
    function setBackgroundImage(url, isBing = false) {
        if (!wallpapersToggle.checked) wallpapersToggle.checked = true;
        document.body.classList.remove('wallpapers-disabled');
        document.body.classList.add('wallpapers-enabled');
        document.body.style.background = `url('${url}') no-repeat center center / cover fixed`;
        localStorage.setItem('startpozi_background', document.body.style.background);
        console.log(`[Wallpaper] Background set: ${url}${isBing ? ' (Bing)' : ''}`);
    }

    function setBackgroundGradient(gradient) {
        if (!wallpapersToggle.checked) wallpapersToggle.checked = true;
        document.body.classList.remove('wallpapers-disabled');
        document.body.classList.add('wallpapers-enabled');
        document.body.style.background = gradient;
        localStorage.setItem('startpozi_background', gradient);
        console.log('[Wallpaper] Gradient set');
    }

    function loadBackground() {
        const saved = localStorage.getItem('startpozi_background');
        if (saved && wallpapersToggle.checked) document.body.style.background = saved;
    }

    // ========== Bing API ==========
    async function fetchBingImageOfTheDay() {
        try {
            // Privacy: query bing.com DIRECTLY (official HPImageArchive
            // endpoint) instead of the third-party bing.biturl.top proxy,
            // which saw a request (and the user's market/locale) on every
            // wallpaper refresh. Opt-in feature: the request goes only to
            // Bing, which the user explicitly chose by enabling Bing mode.
            const response = await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=ru-RU');
            if (!response.ok) throw new Error('Bing loading error');
            const data = await response.json();
            const img = data && data.images && data.images[0] && data.images[0].url;
            if (img) return img.startsWith('http') ? img : ('https://www.bing.com' + img);
            throw new Error('Invalid API response');
        } catch (error) {
            console.error('[Bing] Error getting wallpaper:', error);
            return 'https://www.bing.com/th?id=OHR.MoscowClouds_1920x1080.jpg&rf=LaDigue_1920x1080.jpg&pid=hp';
        }
    }

    async function updateBingWallpaper() {
        console.log('[Bing] Updating wallpaper...');
        const imgUrl = await fetchBingImageOfTheDay();
        if (imgUrl) setBackgroundImage(imgUrl, true);
    }

    function startSpiLiveMode() {
        if (bingInterval) clearInterval(bingInterval);
        isBingMode = true;
        updateBingWallpaper();
        bingInterval = setInterval(updateBingWallpaper, 86400000);
        console.log('[Bing] Live wallpaper mode enabled');
    }

    function stopSpiLiveMode() {
        if (bingInterval) {
            clearInterval(bingInterval);
            bingInterval = null;
        }
        isBingMode = false;
        console.log('[Bing] Live wallpaper mode disabled');
        loadBackground();
    }

    // ========== Local image loading (AVIF) ==========
    function checkImageExists(url) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
        });
    }

    async function loadLocalImages(folderPath, maxCount = 20, extensions = ['jpg','jpeg','png','avif','gif','webp']) {
        const images = [];
        console.log(`[Wallpaper] Loading from folder: ${folderPath}`);
        for (let i = 1; i <= maxCount; i++) {
            let found = false;
            for (const ext of extensions) {
                const url = `${folderPath}/${i}.${ext}`;
                const exists = await checkImageExists(url);
                if (exists) {
                    images.push({ name: `${i}.${ext}`, url: url });
                    console.log(`[Wallpaper] Found: ${url}`);
                    found = true;
                    break;
                }
            }
            if (!found) break;
        }
        console.log(`[Wallpaper] Total loaded: ${images.length} images`);
        return images;
    }

    // ========== Favicons ==========
    function tryLoadImage(url) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(url);
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }
    async function getFaviconUrl(domain) {
        if (faviconCache.has(domain)) return faviconCache.get(domain);
        // Privacy-preserving fallback chain. Asking the site itself first
        // (no third party learns anything); many sites however keep their
        // icon at a non-root path, so:
        //   1. https://domain/favicon.ico       — the site itself
        //   2. https://www.domain/favicon.ico   — common www variant
        //   3. icons.duckduckgo.com/ip3/…       — DDG icon proxy (not Google),
        //                                          resolves the REAL icon path
        // Without the chain a missing /favicon.ico left shortcuts with the
        // generic placeholder after every restart.
        const candidates = [
            `https://${domain}/favicon.ico`,
            `https://www.${domain}/favicon.ico`,
            `https://icons.duckduckgo.com/ip3/${domain}.ico`
        ];
        for (const candidate of candidates) {
            const ok = await tryLoadImage(candidate);
            if (ok) { faviconCache.set(domain, candidate); return candidate; }
        }
        faviconCache.set(domain, null);
        return null;
    }

    // ========== Site cards ==========
    function createSiteCard(site) {
        const card = document.createElement('div');
        card.className = 'site-card';
        card.setAttribute('data-url', site.url);
        card.setAttribute('data-icon', site.icon || '');
        const iconContainer = document.createElement('div');
        iconContainer.className = 'site-icon';
        const faviconImg = document.createElement('img');
        faviconImg.style.width = '28px';
        faviconImg.style.height = '28px';
        faviconImg.style.display = 'none';
        const svgFallback = document.createElement('div');
        svgFallback.className = 'svg-fallback';
        svgFallback.innerHTML = fallbackSvg;
        svgFallback.style.display = 'none';
        iconContainer.appendChild(faviconImg);
        iconContainer.appendChild(svgFallback);
        const nameEl = document.createElement('div');
        nameEl.className = 'site-name';
        nameEl.textContent = site.name;
        const urlEl = document.createElement('div');
        urlEl.className = 'site-url';
        urlEl.textContent = new URL(site.url).hostname;
        card.appendChild(iconContainer);
        card.appendChild(nameEl);
        card.appendChild(urlEl);

        // Render an icon: saved custom/fetched icon first; if its URL died,
        // re-run the favicon chain instead of falling back to placeholder.
        const renderIcon = (iconUrl) => {
            if (iconUrl) {
                faviconImg.src = iconUrl;
                faviconImg.onload = () => { faviconImg.style.display = 'block'; svgFallback.style.display = 'none'; };
                faviconImg.onerror = () => {
                    getFaviconUrl(new URL(site.url).hostname).then(fresh => {
                        if (fresh) { faviconImg.src = fresh; faviconImg.style.display = 'block'; svgFallback.style.display = 'none'; }
                        else { faviconImg.style.display = 'none'; svgFallback.style.display = 'flex'; }
                    }).catch(() => { faviconImg.style.display = 'none'; svgFallback.style.display = 'flex'; });
                };
            } else {
                faviconImg.style.display = 'none';
                svgFallback.style.display = 'flex';
            }
        };
        if (site.icon && (site.icon.startsWith('http') || site.icon.startsWith('data:'))) {
            renderIcon(site.icon);
        } else {
            getFaviconUrl(new URL(site.url).hostname).then(renderIcon).catch(() => renderIcon(null));
        }

        card.addEventListener('click', (e) => {
            window.location.href = site.url;
        });
        return card;
    }

    function updateSiteCard(card, newName, newUrl, newIcon) {
        card.querySelector('.site-name').textContent = newName;
        card.querySelector('.site-url').textContent = new URL(newUrl).hostname;
        card.setAttribute('data-url', newUrl);
        card.setAttribute('data-icon', newIcon || '');
        const iconContainer = card.querySelector('.site-icon');
        const faviconImg = iconContainer.querySelector('img');
        const svgFallback = iconContainer.querySelector('.svg-fallback');

        const renderIcon = (iconUrl) => {
            if (iconUrl) {
                faviconImg.src = iconUrl;
                faviconImg.onload = () => { faviconImg.style.display = 'block'; svgFallback.style.display = 'none'; };
                faviconImg.onerror = () => {
                    getFaviconUrl(new URL(newUrl).hostname).then(fresh => {
                        if (fresh) { faviconImg.src = fresh; faviconImg.style.display = 'block'; svgFallback.style.display = 'none'; }
                        else { faviconImg.style.display = 'none'; svgFallback.style.display = 'flex'; }
                    }).catch(() => { faviconImg.style.display = 'none'; svgFallback.style.display = 'flex'; });
                };
            } else {
                faviconImg.style.display = 'none';
                svgFallback.style.display = 'flex';
            }
        };
        if (newIcon && (newIcon.startsWith('http') || newIcon.startsWith('data:'))) {
            renderIcon(newIcon);
        } else {
            getFaviconUrl(new URL(newUrl).hostname).then(renderIcon).catch(() => renderIcon(null));
        }
        saveSites();
    }

    function saveSites() {
        const sites = [];
        document.querySelectorAll('.site-card:not(.add-site)').forEach(card => {
            const url = card.getAttribute('data-url');
            const name = card.querySelector('.site-name').textContent;
            let icon = card.getAttribute('data-icon');
            if (!icon) {
                const img = card.querySelector('.site-icon img');
                if (img && img.style.display === 'block' && img.src) icon = img.src;
                else icon = '';
            }
            sites.push({ name, url, icon });
        });
        localStorage.setItem('startpozi_sites', JSON.stringify(sites));
    }

    // ========== Modal window ==========
    function showModal(card = null) {
        currentEditCard = card;
        if (card) {
            modalTitle.textContent = 'Edit shortcut';
            const name = card.querySelector('.site-name').textContent;
            const url = card.getAttribute('data-url');
            const icon = card.getAttribute('data-icon') || '';
            editTitle.value = name;
            editUrl.value = url;
            editIcon.value = icon;
        } else {
            modalTitle.textContent = 'Add shortcut';
            editTitle.value = '';
            editUrl.value = '';
            editIcon.value = '';
        }
        updatePreview();
        modal.style.display = 'flex';
    }

    function closeModal() {
        modal.style.display = 'none';
        currentEditCard = null;
    }

    function updatePreview() {
        const name = editTitle.value.trim() || 'Name';
        let url = editUrl.value.trim();
        let domain = '';
        if (url) {
            try {
                if (!url.startsWith('http')) url = 'https://' + url;
                    domain = new URL(url).hostname;
            } catch(e) { domain = 'domain.com'; }
        } else {
            domain = 'domain.com';
        }
        previewName.textContent = name;
        previewUrl.textContent = domain;

        const iconUrl = editIcon.value.trim();
        if (iconUrl && (iconUrl.startsWith('http') || iconUrl.startsWith('data:'))) {
            previewIcon.textContent = '';
            var pImg = document.createElement('img');
            pImg.src = iconUrl;
            pImg.style.cssText = 'width:100%;height:100%;object-fit:contain;';
            previewIcon.appendChild(pImg);
        } else if (url) {
            try {
                let testUrl = url;
                if (!testUrl.startsWith('http')) testUrl = 'https://' + testUrl;
                    const testDomain = new URL(testUrl).hostname;
                getFaviconUrl(testDomain).then(icon => {
                    if (icon) {
                        previewIcon.innerHTML = `<img src="${icon}" style="width:100%;height:100%;object-fit:contain;">`;
                    } else {
                        previewIcon.innerHTML = fallbackSvg;
                    }
                }).catch(() => {
                    previewIcon.innerHTML = fallbackSvg;
                });
            } catch(e) {
                previewIcon.innerHTML = fallbackSvg;
            }
        } else {
            previewIcon.innerHTML = fallbackSvg;
        }
    }

    editTitle.addEventListener('input', updatePreview);
    editUrl.addEventListener('input', updatePreview);
    editIcon.addEventListener('input', updatePreview);

    async function saveFromModal() {
        let title = editTitle.value.trim();
        let url = editUrl.value.trim();
        let icon = editIcon.value.trim();

        if (!title) { await pageAlert('Enter a title'); return; }
        if (!url) { await pageAlert('Enter a URL'); return; }
        if (!url.startsWith('http')) url = 'https://' + url;
            try { new URL(url); } catch(e) { await pageAlert('Invalid URL'); return; }

            if (currentEditCard) {
                updateSiteCard(currentEditCard, title, url, icon);
            } else {
                const site = { name: title, url, icon };
                const newCard = createSiteCard(site);
                const addBtn = document.getElementById('addSiteBtn');
                addBtn.parentNode.insertBefore(newCard, addBtn);
                saveSites();
            }
            closeModal();
    }

    editForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveFromModal();
    });
    modalCloseBtn.addEventListener('click', closeModal);
    modalCancelBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

        function addNewSite() { showModal(); }

        // ========== Context menu ==========
        function showContextMenu(card, x, y) {
            const old = document.querySelector('.custom-context-menu');
            if (old) old.remove();
            const menu = document.createElement('div');
            menu.className = 'custom-context-menu';
            menu.style.left = x + 'px';
            menu.style.top = y + 'px';

            const editBtn = document.createElement('div');
            editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;vertical-align:middle;"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Edit`;
            editBtn.style.display = 'flex';
            editBtn.style.alignItems = 'center';
            editBtn.onclick = () => {
                showModal(card);
                menu.remove();
            };

            const delBtn = document.createElement('div');
            delBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:8px;vertical-align:middle;"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg> Delete`;
            delBtn.style.display = 'flex';
            delBtn.style.alignItems = 'center';
            delBtn.onclick = () => {
                pageConfirm('Delete shortcut').then(ok => {
                    if (ok) { card.remove(); saveSites(); }
                });
                menu.remove();
            };

            menu.appendChild(editBtn);
            menu.appendChild(delBtn);
            document.body.appendChild(menu);
            const closeHandler = (e) => {
                if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeHandler); document.removeEventListener('contextmenu', closeHandler); }
            };
            setTimeout(() => { document.addEventListener('click', closeHandler); document.addEventListener('contextmenu', closeHandler); }, 10);
        }

        // ========== Wallpaper submenu ==========
        async function openSubWallpaperMenu(categoryKey) {
            console.log(`[Wallpaper] Opening category: ${categoryKey}`);
            subOptionsGrid.innerHTML = '';

            subWallpaperMenu.style.display = 'flex';
            subWallpaperMenu.classList.add('open');
            customizePanel.classList.add('open');
            menuOverlay.classList.add('visible');
            personalizeBtn.style.opacity = '0';
            personalizeBtn.style.pointerEvents = 'none';

            if (categoryKey === 'colors') {
                subCategoryTitle.textContent = 'Colors';
                colorGradients.forEach(grad => {
                    const opt = document.createElement('div');
                    opt.className = 'sub-opt-card';
                    opt.style.background = grad.gradient;
                    opt.title = grad.name;
                    opt.addEventListener('click', () => {
                        if (spiLiveToggle.checked) {
                            spiLiveToggle.checked = false;
                            stopSpiLiveMode();
                            localStorage.setItem('startpozi_spi_live', 'false');
                        }
                        setBackgroundGradient(grad.gradient);
                    });
                    subOptionsGrid.appendChild(opt);
                });
                return;
            }

            let folder = '', title = '';
            let maxCount = 20;
            switch(categoryKey) {
                case 'priroda': folder = 'Wallpaper/Nature'; title = 'Nature'; break;
                case 'abstract': folder = 'Wallpaper/Abstraction'; title = 'Abstract'; maxCount = 10; break;
                case 'space': folder = 'Wallpaper/Space'; title = 'Space'; maxCount = 10; break;
                case 'photos': folder = 'Wallpaper/Photo'; title = 'Photos'; maxCount = 10; break;
                default: return;
            }
            subCategoryTitle.textContent = title;

            const loader = document.createElement('div');
            loader.className = 'loading-placeholder';
            loader.textContent = 'Loading images...';
            subOptionsGrid.appendChild(loader);

            const images = await loadLocalImages(folder, maxCount, ['jpg','jpeg','png','avif','gif','webp']);
            subOptionsGrid.innerHTML = '';

            if (images.length === 0) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'loading-placeholder';
                errorDiv.innerHTML = `⚠️ No images in folder <strong>${folder}</strong>`;
                errorDiv.style.gridColumn = 'span 2';
                errorDiv.style.padding = '20px';
                subOptionsGrid.appendChild(errorDiv);
            } else {
                images.forEach(img => {
                    const opt = document.createElement('div');
                    opt.className = 'sub-opt-card';
                    opt.style.backgroundImage = `url('${img.url}')`;
                    opt.title = img.name;
                    opt.addEventListener('click', () => {
                        if (spiLiveToggle.checked) {
                            spiLiveToggle.checked = false;
                            stopSpiLiveMode();
                            localStorage.setItem('startpozi_spi_live', 'false');
                        }
                        setBackgroundImage(img.url);
                    });
                    subOptionsGrid.appendChild(opt);
                });
            }
        }

        // ========== Sites and settings initialization ==========
        async function initSites() {
            sitesGrid.innerHTML = '';
            const saved = localStorage.getItem('startpozi_sites');
            // One corrupted entry (bad save / old migration) used to throw
            // here and kill the whole start page: no tiles, no Add button,
            // no widget toggles restored.
            let sites;
            try {
                sites = saved ? JSON.parse(saved) : defaultSites;
                if (!Array.isArray(sites)) sites = defaultSites;
            } catch (e) { sites = defaultSites; }
            for (const site of sites) {
                try { sitesGrid.appendChild(createSiteCard(site)); } catch (e) { /* skip broken tile */ }
            }
            const addBtn = document.createElement('div');
            addBtn.className = 'site-card add-site';
            addBtn.id = 'addSiteBtn';
            addBtn.innerHTML = '<div class="site-icon">✚</div><div class="site-name">Add site</div><div class="site-url">click</div>';
            sitesGrid.appendChild(addBtn);
            addBtn.addEventListener('click', addNewSite);
            loadSettingsState();
        }

        function loadSettingsState() {
            const wallEnabled = localStorage.getItem('startpozi_wallpapers_enabled') !== 'false';
            wallpapersToggle.checked = wallEnabled;
            if (wallEnabled) {
                document.body.classList.add('wallpapers-enabled');
                document.body.classList.remove('wallpapers-disabled');
            } else {
                document.body.classList.add('wallpapers-disabled');
                document.body.classList.remove('wallpapers-enabled');
                document.body.style.background = '';
            }

            let spi = localStorage.getItem('startpozi_spi_live');
            if (spi === null) {
                spi = 'true';
                localStorage.setItem('startpozi_spi_live', 'true');
            }
            spiLiveToggle.checked = (spi === 'true');
            if (spiLiveToggle.checked && wallpapersToggle.checked) {
                startSpiLiveMode();
            } else if (!spiLiveToggle.checked && wallEnabled) {
                loadBackground();
            }

            const shortEnabled = localStorage.getItem('startpozi_shortcuts_enabled') !== 'false';
            shortcutsToggle.checked = shortEnabled;
            mainContent.classList.toggle('hidden', !shortEnabled);

            // Weather widget: enabled on first launch
            const weatherEnabled = localStorage.getItem('startpozi_weather_enabled') !== 'false';
            weatherToggle.checked = weatherEnabled;
            if (weatherWidget) {
                setWeatherWidgetVisible(weatherEnabled);
            }

            // Search bar — OFF by default (opt-in via the widget settings)
            const searchEnabled = localStorage.getItem('startpozi_search_enabled') === 'true';
            searchWidgetToggle.checked = searchEnabled;
            if (searchWidget) setSearchWidgetVisible(searchEnabled);

            const todoEnabled = localStorage.getItem('startpozi_todo_enabled') === 'true';
            todoWidgetToggle.checked = todoEnabled;
            if (todoWidget) setTodoWidgetVisible(todoEnabled);

            const mpEnabled = localStorage.getItem('startpozi_miniplayer_enabled') === 'true';
            miniPlayerToggle.checked = mpEnabled;
            if (miniPlayerWidget) setMiniPlayerVisible(mpEnabled);

            const dlEnabled = localStorage.getItem('startpozi_downloads_enabled') === 'true';
            downloadsToggle.checked = dlEnabled;
            if (downloadsWidget) setDownloadsWidgetVisible(dlEnabled);

            const cwEnabled = localStorage.getItem('startpozi_customwidgets_enabled') === 'true';
            customWidgetsToggle.checked = cwEnabled;
            if (customWidgetsContainer) setCustomWidgetsVisible(cwEnabled);

            updateLayout();
        }

        // ========== UI handlers ==========
        personalizeBtn.addEventListener('click', () => {
            customizePanel.classList.add('open');
            menuOverlay.classList.add('visible');
            personalizeBtn.style.opacity = '0';
            personalizeBtn.style.pointerEvents = 'none';
        });

        function closePanel() {
            customizePanel.classList.remove('open');
            subWallpaperMenu.classList.remove('open');
            subWallpaperMenu.style.display = '';
            menuOverlay.classList.remove('visible');
            personalizeBtn.style.opacity = '1';
            personalizeBtn.style.pointerEvents = 'all';
        }

        closePanelBtn.addEventListener('click', closePanel);
        menuOverlay.addEventListener('click', closePanel);

        wallpapersToggle.addEventListener('change', function() {
            if (this.checked) {
                document.body.classList.remove('wallpapers-disabled');
                document.body.classList.add('wallpapers-enabled');
                if (spiLiveToggle.checked) startSpiLiveMode();
                else loadBackground();
            } else {
                document.body.classList.add('wallpapers-disabled');
                document.body.classList.remove('wallpapers-enabled');
                document.body.style.background = '';
                if (bingInterval) stopSpiLiveMode();
            }
            localStorage.setItem('startpozi_wallpapers_enabled', this.checked);
        });

        shortcutsToggle.addEventListener('change', function() {
            mainContent.classList.toggle('hidden', !this.checked);
            localStorage.setItem('startpozi_shortcuts_enabled', this.checked);
            updateLayout();
        });

        spiLiveToggle.addEventListener('change', function() {
            localStorage.setItem('startpozi_spi_live', this.checked);
            if (this.checked) {
                if (wallpapersToggle.checked) startSpiLiveMode();
                else {
                    wallpapersToggle.checked = true;
                    wallpapersToggle.dispatchEvent(new Event('change'));
                }
            } else {
                stopSpiLiveMode();
                loadBackground();
            }
        });

        // Handler for the weather widget
        weatherToggle.addEventListener('change', function() {
            const isEnabled = this.checked;
            localStorage.setItem('startpozi_weather_enabled', isEnabled);
            setWeatherWidgetVisible(isEnabled);
        });

        // Weather location: manual coordinates (default) or IP detection.
        (function setupWeatherGeo() {
            const latInput = document.getElementById('weatherLatInput');
            const lonInput = document.getElementById('weatherLonInput');
            const saveBtn = document.getElementById('weatherGeoSave');
            if (!latInput || !lonInput || !saveBtn) return;

            function restore() {
                const mode = localStorage.getItem('startpozi_weather_geo_mode') || 'manual';
                document.querySelectorAll('input[name="weatherGeoMode"]').forEach(r => {
                    r.checked = (r.value === mode);
                });
                latInput.value = localStorage.getItem('startpozi_weather_lat') || '';
                lonInput.value = localStorage.getItem('startpozi_weather_lon') || '';
            }
            restore();

            document.querySelectorAll('input[name="weatherGeoMode"]').forEach(r => {
                r.addEventListener('change', function() {
                    if (!this.checked) return;
                    localStorage.setItem('startpozi_weather_geo_mode', this.value);
                    fetchLocationAndWeather();
                });
            });

            saveBtn.addEventListener('click', () => {
                const lat = parseFloat(String(latInput.value).trim().replace(',', '.'));
                const lon = parseFloat(String(lonInput.value).trim().replace(',', '.'));
                if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
                    !Number.isFinite(lon) || lon < -180 || lon > 180) {
                    saveBtn.textContent = 'Invalid';
                    setTimeout(() => { saveBtn.textContent = 'Save'; }, 1500);
                    return;
                }
                localStorage.setItem('startpozi_weather_lat', String(lat));
                localStorage.setItem('startpozi_weather_lon', String(lon));
                saveBtn.textContent = 'Saved';
                setTimeout(() => { saveBtn.textContent = 'Save'; }, 1500);
                fetchLocationAndWeather();
            });
        })();

        searchWidgetToggle.addEventListener('change', function() {
            localStorage.setItem('startpozi_search_enabled', this.checked);
            setSearchWidgetVisible(this.checked);
            updateLayout();
        });
        todoWidgetToggle.addEventListener('change', function() {
            localStorage.setItem('startpozi_todo_enabled', this.checked);
            setTodoWidgetVisible(this.checked);
            updateLayout();
        });
        miniPlayerToggle.addEventListener('change', function() {
            localStorage.setItem('startpozi_miniplayer_enabled', this.checked);
            setMiniPlayerVisible(this.checked);
            updateLayout();
        });
        downloadsToggle.addEventListener('change', function() {
            localStorage.setItem('startpozi_downloads_enabled', this.checked);
            setDownloadsWidgetVisible(this.checked);
            updateLayout();
        });
        customWidgetsToggle.addEventListener('change', function() {
            localStorage.setItem('startpozi_customwidgets_enabled', this.checked);
            setCustomWidgetsVisible(this.checked);
            updateLayout();
        });

        manageSettingsLink.addEventListener('click', () => {
            try { window.electronAPI.openUrlFromSettings('../Settings.html'); } catch(e) { window.location.href = '../Settings.html'; }
        });

        // Wallpaper categories
        const catCards = document.querySelectorAll('.wallpaper-cat-card[data-category]');
        catCards.forEach(card => {
            card.addEventListener('click', (e) => {
                e.stopPropagation();
                openSubWallpaperMenu(card.dataset.category);
            });
        });

        const customCat = document.getElementById('cat-custom');
        if (customCat) {
            customCat.addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = e => {
                    const file = e.target.files[0];
                    if (file && file.type.startsWith('image/')) {
                        if (spiLiveToggle.checked) {
                            spiLiveToggle.checked = false;
                            stopSpiLiveMode();
                            localStorage.setItem('startpozi_spi_live', 'false');
                        }
                        const reader = new FileReader();
                        reader.onload = ev => setBackgroundImage(ev.target.result);
                        reader.readAsDataURL(file);
                    } else if (file) pageAlert('Select an image');
                };
                    input.click();
            });
        }

        subBackBtn.addEventListener('click', () => {
            subWallpaperMenu.classList.remove('open');
            subWallpaperMenu.style.display = '';
        });

        // Drag & Drop
        sitesGrid.addEventListener('dragstart', (e) => {
            const card = e.target.closest('.site-card');
            if (!card || card.classList.contains('add-site')) { e.preventDefault(); return false; }
            draggedItem = card;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
        });
        sitesGrid.addEventListener('dragend', (e) => {
            if (draggedItem) draggedItem.classList.remove('dragging');
            draggedItem = null;
            document.querySelectorAll('.site-card').forEach(c => c.classList.remove('drag-over'));
            saveSites();
        });
        sitesGrid.addEventListener('dragover', (e) => {
            e.preventDefault();
            const card = e.target.closest('.site-card');
            if (card && !card.classList.contains('add-site') && draggedItem !== card) card.classList.add('drag-over');
        });
            sitesGrid.addEventListener('dragleave', (e) => {
                const card = e.target.closest('.site-card');
                if (card) card.classList.remove('drag-over');
            });
                sitesGrid.addEventListener('drop', (e) => {
                    e.preventDefault();
                    const target = e.target.closest('.site-card');
                    if (target && !target.classList.contains('add-site') && draggedItem && draggedItem !== target) {
                        const all = Array.from(sitesGrid.children);
                        const draggedIdx = all.indexOf(draggedItem);
                        const targetIdx = all.indexOf(target);
                        if (draggedIdx < targetIdx) target.after(draggedItem);
                        else target.before(draggedItem);
                    }
                    document.querySelectorAll('.site-card').forEach(c => c.classList.remove('drag-over'));
                    saveSites();
                });

                sitesGrid.addEventListener('contextmenu', (e) => {
                    const card = e.target.closest('.site-card');
                    if (!card || card.classList.contains('add-site')) return;
                    e.preventDefault();
                    showContextMenu(card, e.clientX, e.clientY);
                });

                // Launch
                createSearchWidget();
                createTodoWidget();
                createMiniPlayerWidget();
                createDownloadsWidget();
                _wireRealDownloads(window.electronAPI);
                createCustomWidgetsContainer();
                createWeatherWidget();
                initSites();
                window.addEventListener('resize', () => updateCompactMode('resize'));
                // matchMedia — the most reliable way to track the breakpoint (works in webview too)
                const _mql = window.matchMedia('(max-width: ' + COMPACT_THRESHOLD + 'px)');
                if (_mql.addEventListener) _mql.addEventListener('change', () => updateCompactMode('matchMedia'));
                else if (_mql.addListener) _mql.addListener(() => updateCompactMode('matchMedia-legacy'));
                // ResizeObserver — catches webview size changes even without a window resize
                if (typeof ResizeObserver !== 'undefined') {
                    new ResizeObserver(() => updateCompactMode('resizeObserver')).observe(document.documentElement);
                }
                // safeguard: if events do not arrive, check periodically (cheap due to early return)
                setInterval(() => updateCompactMode('interval'), 700);
                updateCompactMode('init');
});
