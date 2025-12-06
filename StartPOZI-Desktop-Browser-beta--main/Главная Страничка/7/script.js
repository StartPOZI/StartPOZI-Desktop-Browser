document.addEventListener('DOMContentLoaded', function() {
    // Элементы (твои как были)
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

    // Создаем overlay (как было)
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

    // Добавленный элемент для credit
    const bingCredit = document.getElementById('bingCredit');

    let isEditMode = false;
    let isDeleteMode = false;
    let draggedItem = null;
    let isHistoryMenuOpen = false;

    // Стандартные сайты (как было)
    const defaultSites = [
        { name: 'Google', url: 'https://www.google.com', icon: '🔍', category: 'поиск' },
        { name: 'YouTube', url: 'https://www.youtube.com', icon: '▶️', category: 'медиа' },
        { name: 'GitHub', url: 'https://github.com', icon: '💻', category: 'разработка' },
        { name: 'ChatGPT', url: 'https://chat.openai.com', icon: '🤖', category: 'ии' },
        { name: 'Gmail', url: 'https://mail.google.com', icon: '📧', category: 'почта' }
    ];

    // ========== МЕНЮ ФОНА (с добавлением Bing) ==========

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
            } else if (type === 'image') {
                // Новое: Загружаем Bing wallpaper
                loadBingWallpaper();
                localStorage.setItem('startpozi_background_type', 'bing-image');
                // Закрываем меню
                backgroundMenu.style.display = 'none';
                overlay.style.display = 'none';
            } else {
                alert(`Выбран тип фона: ${type} (функция в разработке)`);
            }
        });
    });

    // Обработчики для выбора градиента (как было)
    document.querySelectorAll('.gradient-option').forEach(option => {
        option.addEventListener('click', function() {
            const gradient = this.getAttribute('data-gradient');
            setBackgroundGradient(gradient);
            localStorage.setItem('startpozi_background_type', 'gradient'); // Новое: сохраняем тип

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

    // ========== НОВАЯ ФУНКЦИЯ: ЗАГРУЗКА BING WALLPAPER ==========

    async function loadBingWallpaper() {
        try {
            // Проверяем кеш
            const cacheKey = 'bingWallpaperDate';
            const today = new Date().toDateString();
            const cachedDate = localStorage.getItem(cacheKey);
            const cachedUrl = localStorage.getItem('bingWallpaperUrl');

            if (cachedDate === today && cachedUrl) {
                setBackgroundImage(cachedUrl);
                return;
            }

            // Запрос к API Bing
            const response = await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=ru-RU');
            const data = await response.json();

            if (data && data.images && data.images[0]) {
                const urlBase = data.images[0].urlbase;
                const fullUrl = `https://www.bing.com${urlBase}_UHD.jpg`; // UHD для качества

                setBackgroundImage(fullUrl);

                // Кешируем
                localStorage.setItem('bingWallpaperUrl', fullUrl);
                localStorage.setItem(cacheKey, today);
                saveBackground(); // Сохраняем в твою функцию
            } else {
                throw new Error('No image data');
            }
        } catch (error) {
            console.error('Ошибка загрузки Bing обоев:', error);
            // Fallback на дефолтный градиент
            document.body.style.backgroundImage = '';
            document.body.style.background = 'linear-gradient(135deg, #0c3a6d, #1a6fc4, #4cc9f0)';
            bingCredit.style.display = 'none';
        }
    }

    // Установка фона как изображения
    function setBackgroundImage(url) {
        document.body.style.backgroundImage = `url('${url}')`;
        bingCredit.style.display = 'block'; // Показываем credit
    }

    // ========== УСТАНОВКА ГРАДИЕНТА (как было, но добавил очистку image) ==========

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
        document.body.style.backgroundImage = ''; // Очищаем image
        document.body.style.background = gradient;
        bingCredit.style.display = 'none'; // Скрываем credit
        saveBackground();
    }

    // ========== ЗАГРУЗКА ФОНА (добавил тип) ==========

    function loadBackground() {
        try {
            const savedBackground = localStorage.getItem('startpozi_background');
            const savedType = localStorage.getItem('startpozi_background_type') || 'gradient';

            if (savedType === 'bing-image') {
                loadBingWallpaper();
            } else if (savedBackground) {
                document.body.style.background = savedBackground;
                bingCredit.style.display = 'none';
            }
        } catch (e) {
            console.error('Ошибка загрузки фона:', e);
        }
    }

    // ========== ОСТАЛЬНОЙ ТВОЙ КОД (без изменений) ==========

    // Здесь весь твой остальной код: обработчики кнопок, функции истории, initSites и т.д.
    // Я не копирую его целиком, чтобы не удлинять, но в файле вставь его сюда.
    // Например, redBtn.addEventListener... и так далее до initSites();

    // ========== ИНИЦИАЛИЗАЦИЯ (добавил loadBackground) ==========

    // Инициализация
    initSites();
    loadBackground(); // Новое: загружаем фон с типом

    console.log('StartPOZI инициализирован');
    console.log('Зеленая кнопка готова к работе!');

async function loadBingWallpaper() {
    try {
        const cacheKey = 'bingWallpaperDate';
        const today = new Date().toDateString();
        const cachedDate = localStorage.getItem(cacheKey);
        const cachedUrl = localStorage.getItem('bingWallpaperUrl');

        if (cachedDate === today && cachedUrl) {
            setBackgroundImage(cachedUrl);
            return;
        }

        // Главное изменение — прокси
        const response = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=ru-RU'));
        
        if (!response.ok) throw new Error('Network error');

        const data = await response.json();

        if (data && data.images && data.images[0]) {
            const urlBase = data.images[0].urlbase;
            const fullUrl = `https://www.bing.com${urlBase}_UHD.jpg`;        // или _1920x1080.jpg

            setBackgroundImage(fullUrl);

            localStorage.setItem('bingWallpaperUrl', fullUrl);
            localStorage.setItem(cacheKey, today);
            saveBackground();
        }
    } catch (error) {
        console.error('Не удалось загрузить обои Bing:', error);
        document.body.style.backgroundImage = '';
        document.body.style.background = 'linear-gradient(135deg, #0c3a6d, #1a6fc4, #4cc9f0)';
        bingCredit.style.display = 'none';
    }
}

});