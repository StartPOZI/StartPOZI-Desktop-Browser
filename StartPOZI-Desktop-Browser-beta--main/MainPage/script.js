document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const redBtn = document.getElementById('changePositions');
    const importBtn = document.getElementById('importFromHistory');
    const deleteBtn = document.getElementById('deleteSites');
    const greenBtn = document.getElementById('changeBackground');
    const sitesGrid = document.getElementById('sitesGrid');
    const backgroundMenu = document.getElementById('backgroundMenu');
    const gradientMenu = document.getElementById('gradientMenu');
    const photoMenu = document.getElementById('photoMenu');

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.style.cssText = `
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(10px);
    z-index: 999;
    `;
    document.body.appendChild(overlay);

    // State variables
    let isEditMode = false;
    let isDeleteMode = false;
    let draggedItem = null;
    let isHistoryMenuOpen = false;

    // Кэш для фавиконов
    const faviconCache = new Map();

    // Default sites
    const defaultSites = [
        { name: 'Google', url: 'https://www.google.com', icon: 'Search', category: 'поиск' },
        { name: 'YouTube', url: 'https://www.youtube.com', icon: 'Play', category: 'медиа' },
        { name: 'GitHub', url: 'https://github.com', icon: 'Code', category: 'разработка' },
        { name: 'ChatGPT', url: 'https://chat.openai.com', icon: 'Robot', category: 'ии' },
        { name: 'Gmail', url: 'https://mail.google.com', icon: 'Envelope', category: 'почта' }
    ];

    // Check if running in Chrome extension context
    const isExtension = typeof chrome !== 'undefined' && chrome.history;

    // ==================== НОВЫЕ ФУНКЦИИ: ИМПОРТ ИЗ JSON + ЭКСПОРТ ====================

    // Импорт из JSON-файла
    function importSitesFromJSON() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';

        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = event => {
                try {
                    const raw = event.target.result;
                    let data = JSON.parse(raw);

                    let sites = [];
                    if (Array.isArray(data)) {
                        sites = data;
                    } else if (data.sites && Array.isArray(data.sites)) {
                        sites = data.sites;
                    } else if (data.startpozi_sites) {
                        sites = typeof data.startpozi_sites === 'string'
                        ? JSON.parse(data.startpozi_sites)
                        : data.startpozi_sites;
                    } else {
                        throw new Error('Неизвестный формат JSON');
                    }

                    const existingUrls = new Set(
                        Array.from(document.querySelectorAll('.site-card:not(.add-site)'))
                        .map(c => c.dataset.url)
                    );

                    let added = 0;
                    sites.forEach(item => {
                        let url = item.url || item.href || item.link;
                        if (!url) return;
                        if (!url.startsWith('http')) url = 'https://' + url;

                            try { new URL(url); } catch { return; }
                            if (existingUrls.has(url)) return;

                            const domain = new URL(url).hostname;
                        const site = {
                            name: (item.name || item.title || domain).trim(),
                                  url,
                                  icon: item.icon || getEmojiForDomain(domain),
                                  category: item.category || detectCategory(domain)
                        };

                        const card = createSiteCard(site);
                        const addBtn = document.getElementById('addSiteBtn');
                        addBtn.parentNode.insertBefore(card, addBtn);

                        existingUrls.add(url);
                        addToBrowserHistory(site);
                        added++;
                    });

                    saveSites();
                    if (isEditMode) enableDragAndDrop();
                    alert(`Импорт завершён! Добавлено сайтов: ${added}`);
                } catch (err) {
                    console.error(err);
                    alert('Ошибка импорта:\n' + err.message);
                }
            };
            reader.onerror = () => alert('Ошибка чтения файла');
            reader.readAsText(file);
        };
        input.click();
    }

    // Экспорт текущих сайтов в JSON
    function exportSitesToJSON() {
        const sites = [];
        document.querySelectorAll('.site-card:not(.add-site)').forEach(card => {
            const img = card.querySelector('.site-icon img');
            const emoji = card.querySelector('.emoji-fallback');
            sites.push({
                name: card.querySelector('.site-name').textContent.trim(),
                       url: card.dataset.url,
                       icon: img?.src || emoji?.textContent || 'Web',
                       category: card.dataset.category || 'другое'
            });
        });

        const data = JSON.stringify(sites, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `startpozi-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        alert('Закладки экспортированы в файл!');
    }

    // === ЗАМЕНА старого обработчика importBtn ===
    importBtn.addEventListener('click', () => {
        const choice = confirm(
            "Откуда импортировать сайты с JSON файла?\n\n" +
            "Отмена или закрытие окна — Переход в меню истории, которые вы портировали"
        );

        if (choice) {
            importSitesFromJSON();
        } else {
            showHistoryMenuIfNotOpen();
        }
    });

    // Двойной клик по кнопке = экспорт
    importBtn.addEventListener('dblclick', e => {
        e.preventDefault();
        e.stopPropagation();
        exportSitesToJSON();
    });

    importBtn.title = "Клик — импорт | Двойной клик — экспорт";

    // ==================== ОРИГИНАЛЬНЫЙ КОД (без изменений) ====================

    async function getFaviconUrl(domain) {
        if (faviconCache.has(domain)) {
            return faviconCache.get(domain);
        }
        try {
            const googleFaviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
            const testImage = new Image();
            return new Promise((resolve) => {
                testImage.onload = () => {
                    faviconCache.set(domain, googleFaviconUrl);
                    resolve(googleFaviconUrl);
                };
                testImage.onerror = () => {
                    const fallbackSources = [
                        `https://${domain}/favicon.ico`,
                        `http://${domain}/favicon.ico`,
                        `https://www.${domain}/favicon.ico`,
                        `https://favicon.yandex.net/favicon/${domain}`,
                        `https://icons.duckduckgo.com/ip3/${domain}.ico`
                    ];
                    const tryNextSource = (index) => {
                        if (index >= fallbackSources.length) {
                            const fallbackIcon = getEmojiForDomain(domain);
                            resolve(fallbackIcon);
                            return;
                        }
                        const img = new Image();
                        img.onload = () => {
                            faviconCache.set(domain, fallbackSources[index]);
                            resolve(fallbackSources[index]);
                        };
                        img.onerror = () => tryNextSource(index + 1);
                        img.src = fallbackSources[index];
                    };
                    tryNextSource(0);
                };
                testImage.src = googleFaviconUrl;
            });
        } catch (error) {
            console.error('Ошибка получения фавикона для', domain, error);
            return getEmojiForDomain(domain);
        }
    }

    function getEmojiForDomain(domain) {
        const domainLower = domain.toLowerCase();
        if (domainLower.includes('youtube')) return 'Play';
        if (domainLower.includes('google')) return 'Search';
        if (domainLower.includes('github')) return 'Code';
        if (domainLower.includes('chatgpt') || domainLower.includes('openai')) return 'Robot';
        if (domainLower.includes('gmail') || domainLower.includes('mail.')) return 'Envelope';
        if (domainLower.includes('netflix')) return 'Movie';
        if (domainLower.includes('twitter')) return 'Bird';
        if (domainLower.includes('instagram')) return 'Camera';
        if (domainLower.includes('discord')) return 'Chat';
        if (domainLower.includes('spotify')) return 'Music';
        if (domainLower.includes('reddit')) return 'People';
        if (domainLower.includes('stackoverflow')) return 'Lightbulb';
        if (domainLower.includes('twitch')) return 'TV';
        if (domainLower.includes('facebook')) return 'Book';
        if (domainLower.includes('vk')) return 'Blue Circle';
        if (domainLower.includes('telegram')) return 'Paper Plane';
        if (domainLower.includes('whatsapp')) return 'Phone';
        return 'Web';
    }

    function setBackgroundGradient(gradientType) {
        const gradients = {
            gradient1: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          gradient2: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                          gradient3: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                          gradient4: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                          gradient5: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                          gradient6: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
                          gradient7: 'linear-gradient(135deg, #fdcbf1 0%, #e6dee9 100%)',
                          gradient8: 'linear-gradient(135deg, #dfe9f3 0%, #ffffff 100%)'
        };
        const gradient = gradients[gradientType] || gradients.gradient1;
        document.body.style.background = gradient;
        resetBackgroundStyles();
        saveBackground();
    }

    function setBackgroundImage(url) {
        const img = new Image();
        img.src = url;
        img.onload = () => {
            console.log('Изображение загружено успешно');
            resetBackgroundStyles();
            document.body.style.background = `url('${url}') no-repeat center / cover fixed`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.body.style.backgroundRepeat = 'no-repeat';
            document.body.style.backgroundAttachment = 'fixed';
            saveBackground();
        };
        img.onerror = () => {
            console.error('Ошибка загрузки изображения:', url);
            alert('Не удалось загрузить изображение. Фон не изменился.');
        };
    }

    function resetBackgroundStyles() {
        document.body.style.backgroundSize = '';
        document.body.style.backgroundPosition = '';
        document.body.style.backgroundRepeat = '';
        document.body.style.backgroundAttachment = '';
    }

    function uploadCustomImage() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = e => {
            const file = e.target.files[0];
            if (file) {
                if (!file.type.startsWith('image/')) {
                    alert('Пожалуйста, выберите изображение (JPG, PNG и т.д.)');
                    return;
                }
                const reader = new FileReader();
                reader.onload = event => {
                    setBackgroundImage(event.target.result);
                };
                reader.onerror = () => {
                    alert('Ошибка чтения файла. Попробуйте другой.');
                };
                reader.readAsDataURL(file);
            }
        };
        input.click();
    }

    function saveBackground() {
        localStorage.setItem('startpozi_background', document.body.style.background || 'linear-gradient(135deg, #0c3a6d, #1a6fc4, #4cc9f0)');
        localStorage.setItem('startpozi_backgroundSize', document.body.style.backgroundSize || '');
        localStorage.setItem('startpozi_backgroundPosition', document.body.style.backgroundPosition || '');
        localStorage.setItem('startpozi_backgroundRepeat', document.body.style.backgroundRepeat || '');
        localStorage.setItem('startpozi_backgroundAttachment', document.body.style.backgroundAttachment || '');
    }

    function loadBackground() {
        const savedBackground = localStorage.getItem('startpozi_background');
        if (savedBackground) {
            document.body.style.background = savedBackground;
            document.body.style.backgroundSize = localStorage.getItem('startpozi_backgroundSize') || '';
            document.body.style.backgroundPosition = localStorage.getItem('startpozi_backgroundPosition') || '';
            document.body.style.backgroundRepeat = localStorage.getItem('startpozi_backgroundRepeat') || '';
            document.body.style.backgroundAttachment = localStorage.getItem('startpozi_backgroundAttachment') || '';
        }
    }

    function showMenu(menu) {
        menu.style.setProperty('display', 'block', 'important');
        menu.style.position = 'fixed';
        menu.style.top = '50%';
        menu.style.left = '50%';
        menu.style.transform = 'translate(-50%, -50%)';
        menu.style.zIndex = '1001';
        overlay.style.display = 'block';
    }

    function closeBackgroundMenus() {
        [backgroundMenu, gradientMenu, photoMenu].forEach(menu => menu.style.display = 'none');
        overlay.style.display = 'none';
        overlay.style.opacity = '0';
    }

    backgroundMenu.querySelectorAll('.bg-option').forEach(option => {
        option.addEventListener('click', () => {
            const type = option.dataset.type;
            if (type === 'gradient') {
                backgroundMenu.style.display = 'none';
                showMenu(gradientMenu);
            } else if (type === 'photo') {
                backgroundMenu.style.display = 'none';
                showMenu(photoMenu);
            } else if (type === 'image') {
                uploadCustomImage();
                closeBackgroundMenus();
            }
        });
    });

    gradientMenu.querySelector('.back-btn').addEventListener('click', () => {
        gradientMenu.style.display = 'none';
        showMenu(backgroundMenu);
    });

    photoMenu.querySelector('.back-btn').addEventListener('click', () => {
        photoMenu.style.display = 'none';
        showMenu(backgroundMenu);
    });

    gradientMenu.querySelectorAll('.gradient-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const gradientType = opt.dataset.gradient;
            setBackgroundGradient(gradientType);
            closeBackgroundMenus();
        });
    });

    photoMenu.querySelectorAll('.photo-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const photo = opt.dataset.photo;
            let url;
            if (photo === '1') {
                url = '20221019093936_Priroda_8361-M.jpg';
            } else {
                url = 'images.jpg';
            }
            setBackgroundImage(url);
            closeBackgroundMenus();
        });
    });

    overlay.addEventListener('click', closeBackgroundMenus);
    document.querySelectorAll('.close-btn, .close-menu').forEach(btn => {
        btn.addEventListener('click', closeBackgroundMenus);
    });

    greenBtn.addEventListener('click', () => showMenu(backgroundMenu));

    redBtn.addEventListener('click', toggleEditMode);
    deleteBtn.addEventListener('click', toggleDeleteMode);

    function toggleEditMode() {
        isEditMode = !isEditMode;
        isDeleteMode = false;

        if (isEditMode) {
            redBtn.style.boxShadow = '0 0 25px rgba(255, 107, 107, 0.8)';
            redBtn.style.backdropFilter = 'blur(10px)';
            deleteBtn.style.boxShadow = '';
            deleteBtn.style.backdropFilter = '';
            enableDragAndDrop();
        } else {
            redBtn.style.boxShadow = '';
            redBtn.style.backdropFilter = '';
            disableDragAndDrop();
            saveSites();
        }
    }

    function toggleDeleteMode() {
        isDeleteMode = !isDeleteMode;
        isEditMode = false;

        if (isDeleteMode) {
            deleteBtn.style.boxShadow = '0 0 25px rgba(67, 97, 238, 0.8)';
            deleteBtn.style.backdropFilter = 'blur(10px)';
            redBtn.style.boxShadow = '';
            redBtn.style.backdropFilter = '';

            document.querySelectorAll('.site-card:not(.add-site)').forEach(addDeleteIconToCard);
        } else {
            deleteBtn.style.boxShadow = '';
            deleteBtn.style.backdropFilter = '';

            document.querySelectorAll('.site-card:not(.add-site)').forEach(removeDeleteIconFromCard);
        }
    }

    function addDeleteIconToCard(card) {
        card.style.cursor = 'pointer';
        card.style.borderColor = '#ff6b6b';
        card.style.position = 'relative';

        if (!card.querySelector('.delete-icon')) {
            const deleteIcon = document.createElement('div');
            deleteIcon.className = 'delete-icon';
            deleteIcon.innerHTML = '×';
            deleteIcon.style.cssText = `
            position: absolute;
            top: 5px;
            right: 5px;
            width: 25px;
            height: 25px;
            background: #ff6b6b;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 20px;
            font-weight: bold;
            z-index: 10;
            `;

            deleteIcon.addEventListener('click', function(e) {
                e.stopPropagation();
                const siteName = card.querySelector('.site-name').textContent;
                const url = card.getAttribute('data-url');

                if (confirm(`Удалить сайт "${siteName}"?`)) {
                    card.remove();
                    removeFromBrowserHistory(url);
                    saveSites();
                }
            });

            card.appendChild(deleteIcon);
        }
    }

    function removeDeleteIconFromCard(card) {
        card.style.cursor = '';
        card.style.borderColor = '';
        const deleteIcon = card.querySelector('.delete-icon');
        if (deleteIcon) deleteIcon.remove();
    }

    function showHistoryMenuIfNotOpen() {
        if (isHistoryMenuOpen) return;
        isHistoryMenuOpen = true;
        showEnhancedHistoryMenu();
    }

    function initBrowserHistory() {
        if (isExtension) return;
        try {
            let savedHistory = localStorage.getItem('browser_history_real');
            let history = savedHistory ? JSON.parse(savedHistory) : [];
            defaultSites.forEach(site => {
                if (!history.some(h => h.url === site.url)) {
                    history.push({
                        ...site,
                        visits: Math.floor(Math.random() * 15) + 5,
                                 lastVisit: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
                                 category: site.category || 'другое'
                    });
                }
            });
            localStorage.setItem('browser_history_real', JSON.stringify(history));
            return history;
        } catch (e) {
            console.error('Ошибка инициализации истории:', e);
            return [];
        }
    }

    function getBrowserHistory(filter = 'all', search = '') {
        if (isExtension) {
            return new Promise((resolve) => {
                const query = {
                    text: search.trim(),
                               maxResults: 500,
                               startTime: Date.now() - 30 * 24 * 60 * 60 * 1000
                };
                chrome.history.search(query, (results) => {
                    let history = results.map(item => {
                        let urlObj;
                        try {
                            urlObj = new URL(item.url);
                        } catch (e) {
                            return null;
                        }
                        const domain = urlObj.hostname;
                        return {
                            name: item.title || domain,
                            url: item.url,
                            icon: getIconForDomain(domain),
                                              visits: item.visitCount || 0,
                                              lastVisit: item.lastVisitTime ? new Date(item.lastVisitTime).toISOString() : new Date().toISOString(),
                                              category: detectCategory(domain)
                        };
                    }).filter(item => item !== null);

                    if (filter !== 'all') {
                        history = history.filter(h => h.category === filter);
                    }

                    resolve(history);
                });
            });
        } else {
            try {
                const savedHistory = localStorage.getItem('browser_history_real');
                let history = savedHistory ? JSON.parse(savedHistory) : [];
                if (filter !== 'all') {
                    history = history.filter(h => h.category === filter);
                }
                if (search && search.trim() !== '') {
                    const searchLower = search.toLowerCase().trim();
                    history = history.filter(h =>
                    h.name.toLowerCase().includes(searchLower) ||
                    h.url.toLowerCase().includes(searchLower)
                    );
                }
                return Promise.resolve(history);
            } catch (e) {
                console.error('Ошибка получения истории:', e);
                return Promise.resolve([]);
            }
        }
    }

    function addToBrowserHistory(site) {
        if (isExtension) {
            chrome.history.addUrl({ url: site.url });
        } else {
            try {
                let history = getBrowserHistorySync();
                const domain = new URL(site.url).hostname;
                const category = detectCategory(domain);
                const existing = history.find(h => h.url === site.url);
                if (existing) {
                    existing.visits = (existing.visits || 0) + 1;
                    existing.lastVisit = new Date().toISOString();
                } else {
                    history.push({
                        ...site,
                        visits: 1,
                        lastVisit: new Date().toISOString(),
                                 category
                    });
                }
                localStorage.setItem('browser_history_real', JSON.stringify(history));
            } catch (e) {
                console.error('Ошибка добавления в историю:', e);
            }
        }
    }

    function removeFromBrowserHistory(url) {
        if (isExtension) {
            chrome.history.deleteUrl({ url });
        } else {
            try {
                let history = getBrowserHistorySync();
                history = history.filter(h => h.url !== url);
                localStorage.setItem('browser_history_real', JSON.stringify(history));
            } catch (e) {
                console.error('Ошибка удаления из истории:', e);
            }
        }
    }

    function getBrowserHistorySync() {
        const savedHistory = localStorage.getItem('browser_history_real');
        return savedHistory ? JSON.parse(savedHistory) : [];
    }

    function detectCategory(domain) {
        const domainLower = domain.toLowerCase();
        if (domainLower.includes('google.com') || domainLower.includes('bing.com') || domainLower.includes('yandex')) return 'поиск';
        if (domainLower.includes('youtube.com') || domainLower.includes('twitch.tv') || domainLower.includes('netflix')) return 'медиа';
        if (domainLower.includes('github.com') || domainLower.includes('stackoverflow')) return 'разработка';
        if (domainLower.includes('chatgpt') || domainLower.includes('openai') || domainLower.includes('bard')) return 'ии';
        if (domainLower.includes('gmail') || domainLower.includes('mail.') || domainLower.includes('yandex.ru/mail')) return 'почта';
        return 'другое';
    }

    function getIconForDomain(domain) {
        return getEmojiForDomain(domain);
    }

    async function showEnhancedHistoryMenu() {
        const historyMenu = document.createElement('div');
        historyMenu.id = 'historyMenu';
        historyMenu.className = 'background-menu';
        historyMenu.style.zIndex = '1002';
        historyMenu.style.position = 'fixed';
        historyMenu.style.top = '50%';
        historyMenu.style.left = '50%';
        historyMenu.style.transform = 'translate(-50%, -50%)';
        historyMenu.innerHTML = `
        <div class="menu-header">
        <h3>История браузера</h3>
        <button class="close-menu" id="closeHistory">×</button>
        </div>
        <div class="menu-content">
        <input type="text" id="historySearch" placeholder="Поиск по имени или URL..." style="width: 100%; padding: 10px; margin-bottom: 15px; border-radius: 10px; border: 1px solid #4cc9f0; background: rgba(255, 255, 255, 0.1); color: white;">
        <select id="categoryFilter" style="width: 100%; padding: 10px; margin-bottom: 15px; border-radius: 10px; border: 1px solid #4cc9f0; background: rgba(255, 255, 255, 0.1); color: white;">
        <option value="all">Все категории</option>
        <option value="поиск">Поиск</option>
        <option value="медиа">Медиа</option>
        <option value="разработка">Разработка</option>
        <option value="ии">ИИ</option>
        <option value="почта">Почта</option>
        <option value="другое">Другое</option>
        </select>
        <div id="historyList" style="max-height: 400px; overflow-y: auto;"></div>
        </div>
        `;
        document.body.appendChild(historyMenu);
        historyMenu.style.display = 'block';
        overlay.style.display = 'block';

        const closeHistory = document.getElementById('closeHistory');
        closeHistory.addEventListener('click', () => {
            historyMenu.remove();
            overlay.style.display = 'none';
            isHistoryMenuOpen = false;
        });

        overlay.addEventListener('click', () => {
            historyMenu.remove();
            overlay.style.display = 'none';
            isHistoryMenuOpen = false;
        }, { once: true });

        const historyList = document.getElementById('historyList');
        const searchInput = document.getElementById('historySearch');
        const categoryFilter = document.getElementById('categoryFilter');

        async function renderHistory() {
            historyList.innerHTML = '';
            const filter = categoryFilter.value;
            const search = searchInput.value;
            const history = await getBrowserHistory(filter, search);

            history.forEach(site => {
                const item = document.createElement('div');
                item.className = 'bg-option history-item';
                item.style.marginBottom = '10px';
                item.style.background = getCategoryColor(site.category);
                item.innerHTML = `
                <span class="option-icon">${site.icon}</span>
                <div class="option-text">
                <h4>${site.name}</h4>
                <p>${new URL(site.url).hostname} • Посещений: ${site.visits} • Последнее: ${getTimeAgo(new Date(site.lastVisit))}</p>
                </div>
                `;
                item.addEventListener('click', () => {
                    addSiteFromHistory(site);
                    historyMenu.remove();
                    overlay.style.display = 'none';
                    isHistoryMenuOpen = false;
                });
                historyList.appendChild(item);
            });
        }

        searchInput.addEventListener('input', renderHistory);
        categoryFilter.addEventListener('change', renderHistory);
        await renderHistory();
    }

    function addSiteFromHistory(site) {
        const existingCard = Array.from(document.querySelectorAll('.site-card:not(.add-site)')).find(card => card.getAttribute('data-url') === site.url);
        if (existingCard) {
            alert('Этот сайт уже добавлен!');
            return;
        }

        const newCard = createSiteCard(site);
        const addBtn = document.getElementById('addSiteBtn');
        addBtn.parentNode.insertBefore(newCard, addBtn);
        saveSites();
        if (isEditMode) enableDragAndDrop();
    }

    function getCategoryColor(category) {
        const backgrounds = {
            'поиск': 'rgba(255, 107, 107, 0.1)',
                          'медиa': 'rgba(67, 97, 238, 0.1)',
                          'разработка': 'rgba(157, 78, 221, 0.1)',
                          'ии': 'rgba(76, 201, 240, 0.1)',
                          'почта': 'rgba(67, 233, 123, 0.1)',
                          'другое': 'rgba(255, 193, 7, 0.1)'
        };
        return backgrounds[category] || 'rgba(157, 78, 221, 0.1)';
    }

    function getTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'только что';
        if (diffMins < 60) return `${diffMins} мин назад`;
        if (diffHours < 24) return `${diffHours} ч назад`;
        if (diffDays === 1) return 'вчера';
        if (diffDays < 7) return `${diffDays} дн назад`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} нед назад`;
        return `${Math.floor(diffDays / 30)} мес назад`;
    }

    function loadSavedData() {
        try {
            const savedSites = localStorage.getItem('startpozi_sites');
            const sites = savedSites ? JSON.parse(savedSites) : null;
            if (sites) {
                return sites.map(site => ({
                    ...site,
                    category: site.category || detectCategory(new URL(site.url).hostname)
                }));
            }
            return null;
        } catch (e) {
            console.error('Ошибка загрузки сохраненных данных:', e);
            return null;
        }
    }

    function saveSites() {
        try {
            const sites = [];
            document.querySelectorAll('.site-card:not(.add-site)').forEach(card => {
                const url = card.getAttribute('data-url');
                const name = card.querySelector('.site-name').textContent;
                const iconElement = card.querySelector('.site-icon img');
                const icon = iconElement ? iconElement.src : card.querySelector('.site-icon .emoji-fallback')?.textContent || 'Web';
                const category = detectCategory(new URL(url).hostname);

                sites.push({ name, url, icon, category });
                addToBrowserHistory({ name, url, icon, category });
            });
            localStorage.setItem('startpozi_sites', JSON.stringify(sites));
        } catch (e) {
            console.error('Ошибка сохранения сайтов:', e);
        }
    }

    function initSites() {
        sitesGrid.innerHTML = '';
        initBrowserHistory();
        const savedSites = loadSavedData();
        const sitesToLoad = savedSites || defaultSites;

        sitesToLoad.forEach(site => {
            const siteCard = createSiteCard(site);
            sitesGrid.appendChild(siteCard);
            addToBrowserHistory(site);
        });

        const addBtn = document.createElement('div');
        addBtn.className = 'site-card add-site';
        addBtn.id = 'addSiteBtn';
        addBtn.innerHTML = `
        <div class="site-icon">✚</div>
        <div class="site-name">Добавить сайт</div>
        <div class="site-url">нажмите</div>
        `;
        sitesGrid.appendChild(addBtn);
        addBtn.addEventListener('click', addNewSite);
        loadBackground();
    }

    function createSiteCard(site) {
        const card = document.createElement('div');
        card.className = 'site-card';
        card.dataset.url = site.url;
        card.dataset.category = site.category || 'другое';

        const iconContainer = document.createElement('div');
        iconContainer.className = 'site-icon';

        const emojiFallback = document.createElement('div');
        emojiFallback.className = 'emoji-fallback';
        emojiFallback.textContent = site.icon || 'Web';
        emojiFallback.style.display = 'none';

        const faviconImg = document.createElement('img');
        faviconImg.alt = site.name;
        faviconImg.style.width = '32px';
        faviconImg.style.height = '32px';
        faviconImg.style.objectFit = 'contain';
        faviconImg.style.borderRadius = '6px';

        iconContainer.appendChild(faviconImg);
        iconContainer.appendChild(emojiFallback);

        const nameElement = document.createElement('div');
        nameElement.className = 'site-name';
        nameElement.textContent = site.name;

        const urlElement = document.createElement('div');
        urlElement.className = 'site-url';
        const domain = new URL(site.url).hostname;
        urlElement.textContent = domain;

        const categoryElement = document.createElement('div');
        categoryElement.className = 'site-category';
        categoryElement.style.display = 'none';
        categoryElement.textContent = site.category || 'другое';

        card.appendChild(iconContainer);
        card.appendChild(nameElement);
        card.appendChild(urlElement);
        card.appendChild(categoryElement);

        getFaviconUrl(domain).then(iconUrl => {
            if (iconUrl.startsWith('http')) {
                faviconImg.src = iconUrl;
                faviconImg.onerror = () => {
                    faviconImg.style.display = 'none';
                    emojiFallback.style.display = 'block';
                };
                faviconImg.onload = () => {
                    emojiFallback.style.display = 'none';
                    faviconImg.style.display = 'block';
                };
            } else {
                faviconImg.style.display = 'none';
                emojiFallback.textContent = iconUrl;
                emojiFallback.style.display = 'block';
            }
        }).catch(() => {
            faviconImg.style.display = 'none';
            emojiFallback.textContent = site.icon || 'Web';
            emojiFallback.style.display = 'block';
        });

        card.addEventListener('click', function(e) {
            if (!isEditMode && !isDeleteMode) {
                addToBrowserHistory(site);
                window.open(site.url, '_blank');
            } else if (isDeleteMode) {
                if (confirm(`Удалить сайт "${site.name}"?`)) {
                    this.remove();
                    removeFromBrowserHistory(site.url);
                    saveSites();
                }
            }
        });

        return card;
    }

    function addNewSite() {
        const url = prompt('Введите URL сайта (например: https://example.com):');
        if (!url) return;

        let validUrl = url.startsWith('http') ? url : 'https://' + url;

        try {
            new URL(validUrl);
        } catch (e) {
            alert('Некорректный URL. Пример: https://example.com');
            return;
        }

        const name = prompt('Введите название сайта:') || 'Новый сайт';
        const domain = new URL(validUrl).hostname;
        const category = detectCategory(domain);

        const site = {
            name,
            url: validUrl,
            icon: getEmojiForDomain(domain),
                          category
        };

        const newCard = createSiteCard(site);
        const addBtn = document.getElementById('addSiteBtn');
        addBtn.parentNode.insertBefore(newCard, addBtn);
        addToBrowserHistory(site);
        saveSites();

        if (isEditMode) enableDragAndDrop();
    }

    function enableDragAndDrop() {
        const cards = document.querySelectorAll('.site-card:not(.add-site)');

        cards.forEach(card => {
            card.draggable = true;

            card.addEventListener('dragstart', e => {
                card.classList.add('dragging');
                draggedItem = card;
                e.dataTransfer.effectAllowed = 'move';
            });

            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                cards.forEach(c => c.classList.remove('drag-over'));
                draggedItem = null;
                saveSites();
            });

            card.addEventListener('dragover', e => {
                e.preventDefault();
                card.classList.add('drag-over');
            });

            card.addEventListener('dragleave', () => {
                card.classList.remove('drag-over');
            });

            card.addEventListener('drop', e => {
                e.preventDefault();
                card.classList.remove('drag-over');

                if (draggedItem && draggedItem !== card) {
                    const allCards = Array.from(sitesGrid.children);
                    const draggedIndex = allCards.indexOf(draggedItem);
                    const targetIndex = allCards.indexOf(card);

                    if (draggedIndex < targetIndex) {
                        card.after(draggedItem);
                    } else {
                        card.before(draggedItem);
                    }

                    saveSites();
                }
            });
        });
    }

    function disableDragAndDrop() {
        document.querySelectorAll('.site-card').forEach(card => {
            card.draggable = false;
            card.classList.remove('dragging', 'drag-over');
        });
    }

    window.addEventListener('beforeunload', () => {
        saveSites();
        saveBackground();
    });

    initSites();
    console.log('StartPOZI инициализирован. Импорт из JSON — OK, экспорт — двойной клик.');
});
