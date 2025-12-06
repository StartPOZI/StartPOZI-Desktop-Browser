document.addEventListener('DOMContentLoaded', function() {
    // Элементы
    const redBtn = document.getElementById('changePositions');
    const importBtn = document.getElementById('importFromHistory');
    const deleteBtn = document.getElementById('deleteSites');
    const greenBtn = document.getElementById('changeBackground');
    const sitesGrid = document.getElementById('sitesGrid');

    // Элементы меню фона
    const backgroundMenu = document.getElementById('backgroundMenu');
    const closeMenu = document.getElementById('closeMenu');
    const gradientMenu = document.getElementById('gradientMenu');
    const backBtn = gradientMenu.querySelector('.back-btn');

    // Создаем overlay
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

    let isEditMode = false;
    let isDeleteMode = false;
    let draggedItem = null;
    let isHistoryMenuOpen = false;

    // Стандартные сайты
    const defaultSites = [
        { name: 'Google', url: 'https://www.google.com', icon: '🔍', category: 'поиск' },
        { name: 'YouTube', url: 'https://www.youtube.com', icon: '▶️', category: 'медиа' },
        { name: 'GitHub', url: 'https://github.com', icon: '💻', category: 'разработка' },
        { name: 'ChatGPT', url: 'https://chat.openai.com', icon: '🤖', category: 'ии' },
        { name: 'Gmail', url: 'https://mail.google.com', icon: '📧', category: 'почта' }
    ];

    // ========== МЕНЮ ФОНА (ИСПРАВЛЕННОЕ) ==========

    // ЗЕЛЕНАЯ КНОПКА - меню выбора фона (РАБОТАЕТ!)
    greenBtn.addEventListener('click', function() {
        console.log('Зеленая кнопка нажата!');

        // Закрываем меню истории если открыто
        closeHistoryMenu();

        // Показываем overlay
        overlay.style.display = 'block';

        // Показываем главное меню фона
        backgroundMenu.style.display = 'block';
        backgroundMenu.style.position = 'fixed';
        backgroundMenu.style.top = '50%';
        backgroundMenu.style.left = '50%';
        backgroundMenu.style.transform = 'translate(-50%, -50%)';
        backgroundMenu.style.zIndex = '1000';

        // Скрываем меню градиентов
        gradientMenu.style.display = 'none';

        console.log('Меню фона открыто');
    });

    // Закрытие меню фона
    closeMenu.addEventListener('click', function() {
        backgroundMenu.style.display = 'none';
        gradientMenu.style.display = 'none';
        overlay.style.display = 'none';
    });

    // Кнопка "Назад" в меню градиентов
    backBtn.addEventListener('click', function() {
        gradientMenu.style.display = 'none';
        backgroundMenu.style.display = 'block';
    });

    // Обработчики для опций в главном меню
    document.querySelectorAll('.bg-option').forEach(option => {
        option.addEventListener('click', function() {
            const type = this.getAttribute('data-type');

            if (type === 'gradient') {
                // Показываем меню градиентов
                backgroundMenu.style.display = 'none';
                gradientMenu.style.display = 'block';
                gradientMenu.style.position = 'fixed';
                gradientMenu.style.top = '50%';
                gradientMenu.style.left = '50%';
                gradientMenu.style.transform = 'translate(-50%, -50%)';
                gradientMenu.style.zIndex = '1000';
            } else {
                alert(`Выбран тип фона: ${type} (функция в разработке)`);
            }
        });
    });

    // Обработчики для выбора градиента
    document.querySelectorAll('.gradient-option').forEach(option => {
        option.addEventListener('click', function() {
            const gradient = this.getAttribute('data-gradient');
            setBackgroundGradient(gradient);

            // Закрываем все меню
            backgroundMenu.style.display = 'none';
            gradientMenu.style.display = 'none';
            overlay.style.display = 'none';
        });
    });

    // Закрытие по клику на overlay
    overlay.addEventListener('click', function() {
        backgroundMenu.style.display = 'none';
        gradientMenu.style.display = 'none';
        this.style.display = 'none';
    });

    // ========== УСТАНОВКА ГРАДИЕНТА ==========

    function setBackgroundGradient(gradientType) {
        const gradients = {
            gradient1: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          gradient2: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                          gradient3: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                          gradient4: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
                          gradient5: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                          gradient6: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)'
        };

        const gradient = gradients[gradientType] || gradients.gradient1;
        document.body.style.background = gradient;
        saveBackground();
    }

    // ========== ОБРАБОТЧИКИ КНОПОК ==========

    // КРАСНАЯ КНОПКА - изменение позиций
    redBtn.addEventListener('click', function() {
        isEditMode = !isEditMode;
        isDeleteMode = false;

        if (isEditMode) {
            // Добавляем стили с блюром
            this.style.boxShadow = '0 0 25px rgba(255, 107, 107, 0.8)';
            this.style.backdropFilter = 'blur(10px)';
            deleteBtn.style.boxShadow = '';
            deleteBtn.style.backdropFilter = '';
            enableDragAndDrop();
        } else {
            this.style.boxShadow = '';
            this.style.backdropFilter = '';
            disableDragAndDrop();
            saveSites();
        }
    });

    // СИНЯЯ КНОПКА - удаление сайтов
    deleteBtn.addEventListener('click', function() {
        isDeleteMode = !isDeleteMode;
        isEditMode = false;

        if (isDeleteMode) {
            // Добавляем стили с блюром
            this.style.boxShadow = '0 0 25px rgba(67, 97, 238, 0.8)';
            this.style.backdropFilter = 'blur(10px)';
            redBtn.style.boxShadow = '';
            redBtn.style.backdropFilter = '';

            // Показываем крестики на сайтах
            document.querySelectorAll('.site-card:not(.add-site)').forEach(card => {
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
            });
        } else {
            this.style.boxShadow = '';
            this.style.backdropFilter = '';

            // Убираем крестики
            document.querySelectorAll('.site-card:not(.add-site)').forEach(card => {
                card.style.cursor = '';
                card.style.borderColor = '';
                const deleteIcon = card.querySelector('.delete-icon');
                if (deleteIcon) {
                    deleteIcon.remove();
                }
            });
        }
    });

    // ФИОЛЕТОВАЯ КНОПКА - импорт из истории
    importBtn.addEventListener('click', async function() {
        if (isHistoryMenuOpen) return;

        // Закрываем меню фона если открыто
        backgroundMenu.style.display = 'none';
        gradientMenu.style.display = 'none';

        isHistoryMenuOpen = true;
        await showEnhancedHistoryMenu();
    });

    // ========== ФУНКЦИИ ДЛЯ ИСТОРИИ ==========

    // Инициализация истории браузера
    function initBrowserHistory() {
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

    // Получение истории браузера с фильтрацией
    function getBrowserHistory(filter = 'all', search = '') {
        try {
            const savedHistory = localStorage.getItem('browser_history_real');
            let history = savedHistory ? JSON.parse(savedHistory) : [];

            // Фильтрация по категории
            if (filter !== 'all') {
                history = history.filter(h => h.category === filter);
            }

            // Поиск по названию или URL
            if (search && search.trim() !== '') {
                const searchLower = search.toLowerCase().trim();
                history = history.filter(h =>
                h.name.toLowerCase().includes(searchLower) ||
                h.url.toLowerCase().includes(searchLower)
                );
            }

            return history;
        } catch (e) {
            console.error('Ошибка получения истории:', e);
            return [];
        }
    }

    // Добавление сайта в историю
    function addToBrowserHistory(site) {
        try {
            let history = getBrowserHistory();
            const domain = new URL(site.url).hostname;
            const category = detectCategory(domain);

            const existingIndex = history.findIndex(h => h.url === site.url);

            if (existingIndex !== -1) {
                history[existingIndex].visits++;
                history[existingIndex].lastVisit = new Date().toISOString();
            } else {
                history.push({
                    name: site.name,
                    url: site.url,
                    icon: site.icon,
                    visits: 1,
                    lastVisit: new Date().toISOString(),
                             category: category
                });
            }

            history.sort((a, b) => b.visits - a.visits);
            localStorage.setItem('browser_history_real', JSON.stringify(history));
            return history;
        } catch (e) {
            console.error('Ошибка добавления в историю:', e);
            return getBrowserHistory();
        }
    }

    // Удаление сайта из истории
    function removeFromBrowserHistory(url) {
        try {
            let history = getBrowserHistory();
            history = history.filter(h => h.url !== url);
            localStorage.setItem('browser_history_real', JSON.stringify(history));
            return history;
        } catch (e) {
            console.error('Ошибка удаления из истории:', e);
            return getBrowserHistory();
        }
    }

    // Определение категории по домену
    function detectCategory(domain) {
        const domainLower = domain.toLowerCase();
        if (domainLower.includes('google.com') || domainLower.includes('bing.com') || domainLower.includes('yandex')) return 'поиск';
        if (domainLower.includes('youtube.com') || domainLower.includes('twitch.tv') || domainLower.includes('netflix')) return 'медиа';
        if (domainLower.includes('github.com') || domainLower.includes('stackoverflow') || domainLower.includes('gitlab')) return 'разработка';
        if (domainLower.includes('gmail.com') || domainLower.includes('outlook.com') || domainLower.includes('mail.')) return 'почта';
        if (domainLower.includes('chat.openai.com') || domainLower.includes('claude.ai') || domainLower.includes('gemini.google')) return 'ии';
        if (domainLower.includes('reddit.com') || domainLower.includes('twitter.com') || domainLower.includes('facebook.com')) return 'соцсети';
        return 'другое';
    }

    // Меню истории
    async function showEnhancedHistoryMenu() {
        const browserHistory = getBrowserHistory('all', '');

        // Создаем меню истории
        const historyMenu = document.createElement('div');
        historyMenu.className = 'history-menu';
        historyMenu.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(12, 58, 109, 0.98);
        backdrop-filter: blur(20px);
        border-radius: 25px;
        padding: 25px;
        width: 90%;
        max-width: 700px;
        max-height: 85vh;
        z-index: 1001;
        border: 2px solid rgba(157, 78, 221, 0.4);
        box-shadow: 0 30px 60px rgba(0, 0, 0, 0.5);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;

        // Внутренний HTML меню
        updateHistoryMenuContent(historyMenu, browserHistory);

        document.body.appendChild(historyMenu);
        overlay.style.display = 'block';

        // Закрытие меню истории
        function closeHistoryMenu() {
            if (historyMenu && historyMenu.parentNode) {
                historyMenu.remove();
            }
            overlay.style.display = 'none';
            isHistoryMenuOpen = false;
        }

        // Закрытие по кнопке
        document.getElementById('closeHistoryBtn').addEventListener('click', closeHistoryMenu);

        // Закрытие по overlay
        overlay.addEventListener('click', function(e) {
            if (e.target === this) {
                closeHistoryMenu();
            }
        });

        // Поиск в реальном времени
        let searchTimeout;
        document.getElementById('searchHistoryInput').addEventListener('input', function() {
            clearTimeout(searchTimeout);

            searchTimeout = setTimeout(() => {
                const searchTerm = this.value;
                const filter = document.getElementById('filterHistorySelect').value;
                const filteredHistory = getBrowserHistory(filter, searchTerm);

                updateHistoryMenuContent(historyMenu, filteredHistory);
            }, 300);
        });

        // Фильтрация
        document.getElementById('filterHistorySelect').addEventListener('change', function() {
            const filter = this.value;
            const searchTerm = document.getElementById('searchHistoryInput').value;
            const filteredHistory = getBrowserHistory(filter, searchTerm);

            updateHistoryMenuContent(historyMenu, filteredHistory);
        });

        // Обновление истории
        document.getElementById('refreshHistoryBtn').addEventListener('click', async function() {
            const searchTerm = document.getElementById('searchHistoryInput').value;
            const filter = document.getElementById('filterHistorySelect').value;
            const refreshedHistory = getBrowserHistory(filter, searchTerm);

            updateHistoryMenuContent(historyMenu, refreshedHistory);
        });
    }

    // Функция обновления содержимого меню истории
    function updateHistoryMenuContent(menuElement, history) {
        menuElement.innerHTML = `
        <div style="flex-shrink: 0; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
        <div>
        <h3 style="color: #c77dff; font-size: 26px; margin: 0; display: flex; align-items: center; gap: 10px;">
        <span>🌐 История браузера</span>
        <span style="background: rgba(157, 78, 221, 0.2); color: #c77dff; padding: 2px 10px; border-radius: 15px; font-size: 14px;">${history.length}</span>
        </h3>
        <p style="color: rgba(255, 255, 255, 0.7); font-size: 13px; margin: 5px 0 0 0;">
        Выберите сайты для добавления на стартовую страницу
        </p>
        </div>
        <button id="closeHistoryBtn" style="background: rgba(255, 255, 255, 0.1); border: none; color: white; font-size: 32px; cursor: pointer; width: 45px; height: 45px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(157, 78, 221, 0.3); transition: all 0.3s; flex-shrink: 0;">×</button>
        </div>

        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
        <div style="flex: 1; position: relative;">
        <input type="text" id="searchHistoryInput" placeholder="🔍 Поиск по истории..." style="width: 100%; padding: 12px 15px 12px 40px; background: rgba(255, 255, 255, 0.1); border: 2px solid rgba(157, 78, 221, 0.3); border-radius: 15px; color: white; font-size: 14px; outline: none; transition: all 0.3s;">
        </div>
        <select id="filterHistorySelect" style="padding: 12px 15px; background: rgba(255, 255, 255, 0.1); border: 2px solid rgba(157, 78, 221, 0.3); border-radius: 15px; color: white; font-size: 14px; outline: none; min-width: 150px;">
        <option value="all">Все категории</option>
        <option value="поиск">🔍 Поиск</option>
        <option value="медиа">🎬 Медиа</option>
        <option value="разработка">💻 Разработка</option>
        <option value="почта">📧 Почта</option>
        <option value="ии">🤖 ИИ</option>
        <option value="соцсети">👥 Соцсети</option>
        <option value="другое">🌐 Другое</option>
        </select>
        </div>
        </div>

        <div style="flex: 1; overflow-y: auto; padding-right: 5px;" id="historyItemsContainer">
        ${history.length > 0 ? history.map((site, index) => {
            try {
                const domain = new URL(site.url).hostname;
                const lastVisit = new Date(site.lastVisit).toLocaleDateString('ru-RU');
                const timeAgo = getTimeAgo(new Date(site.lastVisit));
                const visitsText = site.visits === 1 ? '1 раз' : `${site.visits} раз`;

                return `
                <div class="history-item" data-url="${site.url}" data-name="${site.name}" data-icon="${site.icon}" style="display: flex; align-items: center; padding: 18px; background: rgba(255, 255, 255, 0.08); border-radius: 20px; margin-bottom: 12px; border: 2px solid rgba(157, 78, 221, 0.2); transition: all 0.3s; cursor: pointer; position: relative;">
                <div style="font-size: 32px; margin-right: 20px; width: 60px; text-align: center; color: ${getIconColor(site.category)}; flex-shrink: 0; background: rgba(255, 255, 255, 0.05); padding: 10px; border-radius: 15px;">${site.icon}</div>
                <div style="flex: 1; min-width: 0;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                <h4 style="font-size: 17px; margin: 0; color: white; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500;">${site.name}</h4>
                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                <span style="font-size: 12px; color: ${getCategoryColor(site.category)}; background: ${getCategoryBackground(site.category)}; padding: 4px 10px; border-radius: 12px; font-weight: 500;">${site.category}</span>
                <span style="font-size: 14px; color: #c77dff; font-weight: bold;">#${index + 1}</span>
                </div>
                </div>
                <div style="font-size: 13px; color: rgba(255, 255, 255, 0.8); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 8px; font-family: 'Courier New', monospace;">
                ${domain}
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 12px; color: rgba(255, 255, 255, 0.6);">
                <span style="display: flex; align-items: center; gap: 5px;">👁️ ${visitsText}</span>
                <span style="display: flex; align-items: center; gap: 5px;">🕒 ${timeAgo}</span>
                <span style="display: flex; align-items: center; gap: 5px;">📅 ${lastVisit}</span>
                </div>
                </div>
                <button class="import-btn" style="background: linear-gradient(135deg, #9d4edd, #c77dff); color: white; border: none; padding: 10px 20px; border-radius: 12px; cursor: pointer; font-size: 15px; margin-left: 15px; transition: all 0.3s; flex-shrink: 0; font-weight: bold; box-shadow: 0 4px 15px rgba(157, 78, 221, 0.3);">Добавить</button>
                </div>
                `;
            } catch (e) {
                return '';
            }
        }).join('') : `
        <div style="text-align: center; padding: 40px; color: rgba(255, 255, 255, 0.5);">
        <div style="font-size: 48px; margin-bottom: 20px;">🔍</div>
        <h4 style="margin: 0; color: rgba(255, 255, 255, 0.7);">${history.length === 0 ? 'История пуста' : 'Ничего не найдено'}</h4>
        <p style="margin: 10px 0 0 0; font-size: 14px;">${history.length === 0 ? 'Посетите несколько сайтов для заполнения истории' : 'Попробуйте изменить поисковый запрос'}</p>
        </div>
        `}
        </div>

        <div style="flex-shrink: 0; margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
        <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="font-size: 13px; color: rgba(255, 255, 255, 0.6);">
        <span>📊 Всего: ${history.length} сайтов</span>
        </div>
        <div style="display: flex; gap: 10px;">
        <button id="refreshHistoryBtn" style="background: rgba(157, 78, 221, 0.2); color: #c77dff; border: 1px solid #9d4edd; padding: 8px 15px; border-radius: 10px; cursor: pointer; font-size: 13px; transition: all 0.3s; display: flex; align-items: center; gap: 5px;">
        <span>🔄</span> Обновить
        </button>
        </div>
        </div>
        </div>
        `;

        // Вешаем обработчики на элементы истории
        menuElement.querySelectorAll('.history-item').forEach(item => {
            const importBtn = item.querySelector('.import-btn');

            importBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                importSiteFromHistory(item, true);
            });

            item.addEventListener('click', function(e) {
                if (!e.target.classList.contains('import-btn')) {
                    importSiteFromHistory(item, true);
                }
            });
        });
    }

    function importSiteFromHistory(item, showAlert = true) {
        const url = item.getAttribute('data-url');
        const name = item.getAttribute('data-name');
        const icon = item.getAttribute('data-icon');

        if (isSiteAlreadyAdded(url)) {
            if (showAlert) {
                alert(`Сайт "${name}" уже добавлен на стартовую страницу!`);
            }
            return;
        }

        const domain = new URL(url).hostname;
        const category = detectCategory(domain);

        const newCard = document.createElement('div');
        newCard.className = 'site-card';
        newCard.setAttribute('data-url', url);
        newCard.setAttribute('data-category', category);

        newCard.innerHTML = `
        <div class="site-icon">${icon}</div>
        <div class="site-name">${name}</div>
        <div class="site-url">${domain}</div>
        <div class="site-category">${category}</div>
        `;

        newCard.addEventListener('click', function() {
            if (!isEditMode && !isDeleteMode) {
                addToBrowserHistory({ name, url, icon, category });
                window.open(url, '_blank');
            } else if (isDeleteMode) {
                if (confirm(`Удалить сайт "${name}"?`)) {
                    this.remove();
                    removeFromBrowserHistory(url);
                    saveSites();
                }
            }
        });

        const addBtn = document.getElementById('addSiteBtn');
        addBtn.parentNode.insertBefore(newCard, addBtn);
        saveSites();

        if (showAlert) {
            alert(`✅ Сайт "${name}" добавлен со страницы истории!`);
        }
    }

    function isSiteAlreadyAdded(url) {
        const existingSites = Array.from(document.querySelectorAll('.site-card:not(.add-site)'));
        return existingSites.some(card => card.getAttribute('data-url') === url);
    }

    function getIconColor(category) {
        const colors = {
            'поиск': '#4cc9f0',
            'медиа': '#ff6b6b',
            'разработка': '#43e97b',
            'почта': '#f093fb',
            'ии': '#9d4edd',
            'соцсети': '#fee140',
            'другое': '#667eea'
        };
        return colors[category] || '#c77dff';
    }

    function getCategoryColor(category) {
        const colors = {
            'поиск': '#4cc9f0',
            'медиа': '#ff6b6b',
            'разработка': '#43e97b',
            'почта': '#f093fb',
            'ии': '#9d4edd',
            'соцсети': '#fee140',
            'другое': '#667eea'
        };
        return colors[category] || '#c77dff';
    }

    function getCategoryBackground(category) {
        const backgrounds = {
            'поиск': 'rgba(76, 201, 240, 0.1)',
                          'медиа': 'rgba(255, 107, 107, 0.1)',
                          'разработка': 'rgba(67, 233, 123, 0.1)',
                          'почта': 'rgba(240, 147, 251, 0.1)',
                          'ии': 'rgba(157, 78, 221, 0.1)',
                          'соцсети': 'rgba(254, 225, 64, 0.1)',
                          'другое': 'rgba(102, 126, 234, 0.1)'
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

    // ========== ФУНКЦИИ ДЛЯ САЙТОВ ==========

    // Загрузка сохраненных данных
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

    // Сохранение сайтов
    function saveSites() {
        try {
            const sites = [];
            document.querySelectorAll('.site-card:not(.add-site)').forEach(card => {
                const url = card.getAttribute('data-url');
                const name = card.querySelector('.site-name').textContent;
                const icon = card.querySelector('.site-icon').textContent;
                const category = detectCategory(new URL(url).hostname);

                sites.push({ name, url, icon, category });
                addToBrowserHistory({ name, url, icon, category });
            });
            localStorage.setItem('startpozi_sites', JSON.stringify(sites));
        } catch (e) {
            console.error('Ошибка сохранения сайтов:', e);
        }
    }

    // Сохранение фона
    function saveBackground() {
        try {
            const background = document.body.style.background ||
            'linear-gradient(135deg, #0c3a6d, #1a6fc4, #4cc9f0)';
            localStorage.setItem('startpozi_background', background);
        } catch (e) {
            console.error('Ошибка сохранения фона:', e);
        }
    }

    // Загрузка фона
    function loadBackground() {
        try {
            const savedBackground = localStorage.getItem('startpozi_background');
            if (savedBackground) {
                document.body.style.background = savedBackground;
            }
        } catch (e) {
            console.error('Ошибка загрузки фона:', e);
        }
    }

    // Инициализация сайтов
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

        // Кнопка добавления
        const addBtn = document.createElement('div');
        addBtn.className = 'site-card add-site';
        addBtn.id = 'addSiteBtn';
        addBtn.innerHTML = `
        <div class="site-icon">➕</div>
        <div class="site-name">Добавить сайт</div>
        <div class="site-url">нажмите</div>
        `;
        sitesGrid.appendChild(addBtn);
        addBtn.addEventListener('click', addNewSite);
        loadBackground();
    }

    // Создание карточки сайта
    function createSiteCard(site) {
        const card = document.createElement('div');
        card.className = 'site-card';
        card.setAttribute('data-url', site.url);
        card.setAttribute('data-category', site.category || 'другое');

        card.innerHTML = `
        <div class="site-icon">${site.icon}</div>
        <div class="site-name">${site.name}</div>
        <div class="site-url">${new URL(site.url).hostname}</div>
        <div class="site-category" style="display: none;">${site.category || 'другое'}</div>
        `;

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

    // Добавление нового сайта
    function addNewSite() {
        const url = prompt('Введите URL сайта (например: https://example.com):');
        if (!url) return;

        let validUrl = url;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            validUrl = 'https://' + url;
        }

        try {
            new URL(validUrl);
        } catch (e) {
            alert('Некорректный URL. Пример: https://example.com');
            return;
        }

        const name = prompt('Введите название сайта:') || 'Новый сайт';
        const domain = new URL(validUrl).hostname;
        const category = detectCategory(domain);

        let icon = '🌐';
        const domainLower = domain.toLowerCase();
        if (domainLower.includes('youtube')) icon = '▶️';
        else if (domainLower.includes('google')) icon = '🔍';
        else if (domainLower.includes('github')) icon = '💻';
        else if (domainLower.includes('chatgpt') || domainLower.includes('openai')) icon = '🤖';
        else if (domainLower.includes('gmail') || domainLower.includes('mail.')) icon = '📧';
        else if (domainLower.includes('netflix')) icon = '🎬';
        else if (domainLower.includes('twitter')) icon = '🐦';
        else if (domainLower.includes('instagram')) icon = '📷';
        else if (domainLower.includes('discord')) icon = '💬';
        else if (domainLower.includes('spotify')) icon = '🎵';
        else if (domainLower.includes('reddit')) icon = '👥';
        else if (domainLower.includes('stackoverflow')) icon = '💡';

        const newCard = document.createElement('div');
        newCard.className = 'site-card';
        newCard.setAttribute('data-url', validUrl);
        newCard.setAttribute('data-category', category);

        newCard.innerHTML = `
        <div class="site-icon">${icon}</div>
        <div class="site-name">${name}</div>
        <div class="site-url">${domain}</div>
        <div class="site-category" style="display: none;">${category}</div>
        `;

        newCard.addEventListener('click', function(e) {
            if (!isEditMode && !isDeleteMode) {
                addToBrowserHistory({ name, url: validUrl, icon, category });
                window.open(validUrl, '_blank');
            } else if (isDeleteMode) {
                if (confirm(`Удалить сайт "${name}"?`)) {
                    this.remove();
                    removeFromBrowserHistory(validUrl);
                    saveSites();
                }
            }
        });

        const addBtn = document.getElementById('addSiteBtn');
        addBtn.parentNode.insertBefore(newCard, addBtn);
        addToBrowserHistory({ name, url: validUrl, icon, category });
        saveSites();

        if (isEditMode) {
            enableDragAndDrop();
        }
    }

    // ========== DRAG AND DROP ==========

    // Включение перетаскивания
    function enableDragAndDrop() {
        const cards = document.querySelectorAll('.site-card:not(.add-site)');

        cards.forEach(card => {
            card.draggable = true;

            card.addEventListener('dragstart', function(e) {
                this.classList.add('dragging');
                draggedItem = this;
                e.dataTransfer.effectAllowed = 'move';
            });

            card.addEventListener('dragend', function() {
                this.classList.remove('dragging');
                cards.forEach(c => c.classList.remove('drag-over'));
                draggedItem = null;
                saveSites();
            });

            card.addEventListener('dragover', function(e) {
                e.preventDefault();
                this.classList.add('drag-over');
            });

            card.addEventListener('dragleave', function() {
                this.classList.remove('drag-over');
            });

            card.addEventListener('drop', function(e) {
                e.preventDefault();
                this.classList.remove('drag-over');

                if (draggedItem && draggedItem !== this) {
                    const allCards = Array.from(sitesGrid.children);
                    const draggedIndex = allCards.indexOf(draggedItem);
                    const targetIndex = allCards.indexOf(this);

                    if (draggedIndex < targetIndex) {
                        this.after(draggedItem);
                    } else {
                        this.before(draggedItem);
                    }

                    saveSites();
                }
            });
        });
    }

    // Выключение перетаскивания
    function disableDragAndDrop() {
        const cards = document.querySelectorAll('.site-card');
        cards.forEach(card => {
            card.draggable = false;
            card.classList.remove('dragging', 'drag-over');
        });
    }

    // ========== АВТОСОХРАНЕНИЕ ==========

    // Автосохранение при закрытии страницы
    window.addEventListener('beforeunload', function() {
        saveSites();
        saveBackground();
    });

    // ========== ИНИЦИАЛИЗАЦИЯ ==========

    // Инициализация
    initSites();

    console.log('StartPOZI инициализирован');
    console.log('Зеленая кнопка готова к работе!');
});
