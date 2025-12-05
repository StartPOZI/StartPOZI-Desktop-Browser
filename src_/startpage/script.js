document.addEventListener('DOMContentLoaded', function() {
    // Элементы DOM
    const timeElement = document.getElementById('time');
    const searchInput = document.getElementById('search-input');
    const autocompleteContainer = document.getElementById('autocomplete-container');
    const editButton = document.getElementById('edit-button');
    const settingsPanel = document.getElementById('settings-panel');
    const closeSettings = document.getElementById('close-settings');
    const backgroundUpload = document.getElementById('background-upload');
    const uploadButton = document.getElementById('upload-button');
    const galleryContent = document.querySelector('.gallery-content');
    
    // Создаем оверлей
    const overlay = document.createElement('div');
    overlay.classList.add('overlay');
    document.body.appendChild(overlay);
    
    // Предопределенные фоны для каждой категории
    const backgroundCategories = {
        gradients: [
            'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)'
        ],
        nature: [
            'url(backgrounds/nature/1.jpg)',
            'url(backgrounds/nature/2.jpg)',
            'url(backgrounds/nature/3.jpg)',
            'url(backgrounds/nature/4.jpg)',
            'url(backgrounds/nature/5.jpg)',
            'url(backgrounds/nature/6.jpg)'
        ],
        cities: [
            'url(backgrounds/cities/1.jpg)',
            'url(backgrounds/cities/2.jpg)',
            'url(backgrounds/cities/3.jpg)',
            'url(backgrounds/cities/4.jpg)',
            'url(backgrounds/cities/5.jpg)',
            'url(backgrounds/cities/6.jpg)'
        ],
        abstract: [
            'url(backgrounds/abstract/1.jpg)',
            'url(backgrounds/abstract/2.jpg)',
            'url(backgrounds/abstract/3.jpg)',
            'url(backgrounds/abstract/4.jpg)',
            'url(backgrounds/abstract/5.jpg)',
            'url(backgrounds/abstract/6.jpg)'
        ],
        animated: [
            'url(backgrounds/animated/1.gif)',
            'url(backgrounds/animated/2.gif)',
            'url(backgrounds/animated/3.gif)',
            'url(backgrounds/animated/4.gif)',
            'url(backgrounds/animated/5.gif)',
            'url(backgrounds/animated/6.gif)'
        ]
    };
    
    // Инициализация вкладок
    function initTabs() {
        const tabButtons = document.querySelectorAll('.tab-button');
        
        // Создаем контент для каждой вкладки
        for (const category in backgroundCategories) {
            const tabContent = document.createElement('div');
            tabContent.classList.add('tab-content');
            tabContent.id = `${category}-tab`;
            
            const backgroundGrid = document.createElement('div');
            backgroundGrid.classList.add('background-grid');
            tabContent.appendChild(backgroundGrid);
            
            galleryContent.appendChild(tabContent);
        }
        
        // Создаем вкладку "Мои" отдельно
        const myTab = document.createElement('div');
        myTab.classList.add('tab-content');
        myTab.id = 'my-tab';
        
        const myGrid = document.createElement('div');
        myGrid.classList.add('background-grid');
        myTab.appendChild(myGrid);
        
        galleryContent.appendChild(myTab);
        
        // Активируем первую вкладку
        document.querySelector('.tab-button.active').click();
        
        // Обработчики для переключения вкладок
        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                const tabName = this.getAttribute('data-tab');
                
                // Убираем активный класс у всех кнопок и контента
                tabButtons.forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                
                // Добавляем активный класс текущей кнопке и соответствующему контенту
                this.classList.add('active');
                document.getElementById(`${tabName}-tab`).classList.add('active');
                
                // Загружаем backgrounds для выбранной вкладки
                loadBackgrounds(tabName);
            });
        });
    }
    
    // Обновление времени
    function updateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        timeElement.textContent = timeString;
    }
    
    // Автозаполнение поиска
    let autocompleteTimeout;
    searchInput.addEventListener('input', function() {
        clearTimeout(autocompleteTimeout);
        const query = this.value.trim();
        
        if (query.length < 2) {
            autocompleteContainer.style.display = 'none';
            return;
        }
        
        autocompleteTimeout = setTimeout(() => {
            // Используем API DuckDuckGo для автозаполнения
            fetch(`https://duckduckgo.com/ac/?q=${encodeURIComponent(query)}&type=list`)
                .then(response => response.json())
                .then(data => {
                    showAutocompleteSuggestions(data);
                })
                .catch(error => {
                    console.error('Ошибка автозаполнения:', error);
                });
        }, 300);
    });
    
    function showAutocompleteSuggestions(suggestions) {
        autocompleteContainer.innerHTML = '';
        
        if (suggestions && suggestions.length > 0) {
            suggestions.forEach(suggestion => {
                const item = document.createElement('div');
                item.classList.add('autocomplete-item');
                item.textContent = suggestion;
                item.addEventListener('click', () => {
                    searchInput.value = suggestion;
                    autocompleteContainer.style.display = 'none';
                    document.getElementById('search-form').submit();
                });
                autocompleteContainer.appendChild(item);
            });
            autocompleteContainer.style.display = 'block';
        } else {
            autocompleteContainer.style.display = 'none';
        }
    }
    
    // Закрытие автозаполнения при клике вне его
    document.addEventListener('click', function(e) {
        if (!autocompleteContainer.contains(e.target) && e.target !== searchInput) {
            autocompleteContainer.style.display = 'none';
        }
    });
    
    // Панель настроек
    editButton.addEventListener('click', function() {
        settingsPanel.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
    
    closeSettings.addEventListener('click', function() {
        settingsPanel.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = 'auto';
    });
    
    overlay.addEventListener('click', function() {
        settingsPanel.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = 'auto';
    });
    
    // Загрузка фонов для галереи
    function loadBackgrounds(category) {
        const backgroundGrid = document.querySelector(`#${category}-tab .background-grid`);
        
        // Очищаем сетку
        backgroundGrid.innerHTML = '';
        
        if (category === 'my') {
            // Загрузка пользовательских фонов из localStorage
            const myBackgrounds = JSON.parse(localStorage.getItem('myBackgrounds') || '[]');
            
            if (myBackgrounds.length === 0) {
                backgroundGrid.innerHTML = '<p>У вас пока нет своих фонов</p>';
                return;
            }
            
            myBackgrounds.forEach((bg, index) => {
                const backgroundItem = document.createElement('div');
                backgroundItem.classList.add('background-item');
                
                if (bg.startsWith('linear-gradient')) {
                    backgroundItem.style.background = bg;
                } else {
                    backgroundItem.style.backgroundImage = bg;
                    backgroundItem.style.backgroundSize = 'cover';
                }
                
                backgroundItem.addEventListener('click', () => {
                    changeBackground(bg);
                });
                
                backgroundGrid.appendChild(backgroundItem);
            });
        } else {
            // Загрузка предопределенных фонов
            const backgrounds = backgroundCategories[category] || [];
            
            backgrounds.forEach((bg, index) => {
                const backgroundItem = document.createElement('div');
                backgroundItem.classList.add('background-item');
                
                if (bg.startsWith('linear-gradient')) {
                    backgroundItem.style.background = bg;
                } else {
                    backgroundItem.style.backgroundImage = bg;
                    backgroundItem.style.backgroundSize = 'cover';
                }
                
                backgroundItem.addEventListener('click', () => {
                    changeBackground(bg);
                });
                
                backgroundGrid.appendChild(backgroundItem);
            });
        }
    }
    
    // Смена фона
    function changeBackground(background) {
        if (background.startsWith('linear-gradient')) {
            document.body.style.background = background;
            document.body.style.backgroundImage = '';
        } else {
            document.body.style.backgroundImage = background;
            document.body.style.background = '';
        }
        
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        
        // Сохраняем выбор в localStorage
        localStorage.setItem('background', background);
    }
    
    // Загрузка пользовательского фона
    uploadButton.addEventListener('click', function() {
        if (backgroundUpload.files.length > 0) {
            const file = backgroundUpload.files[0];
            const reader = new FileReader();
            
            reader.onload = function(e) {
                // Сохраняем в категории "Мои"
                const imageUrl = e.target.result;
                
                // Сохраняем в localStorage для будущих использований
                const myBackgrounds = JSON.parse(localStorage.getItem('myBackgrounds') || '[]');
                myBackgrounds.push(imageUrl);
                localStorage.setItem('myBackgrounds', JSON.stringify(myBackgrounds));
                
                // Обновляем вкладку "Мои"
                loadBackgrounds('my');
                
                // Меняем фон на только что загруженный
                changeBackground(imageUrl);
            };
            
            reader.readAsDataURL(file);
        }
    });
    
    // Защита от скачивания и правого клика
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    });
    
    // Блокировка сочетаний клавиш для сохранения
    document.addEventListener('keydown', function(e) {
        // Ctrl+S, Ctrl+U, F12
        if ((e.ctrlKey && (e.key === 's' || e.key === 'u')) || e.key === 'F12') {
            e.preventDefault();
            return false;
        }
    });
    
    // Загрузка сохраненного фона
    const savedBackground = localStorage.getItem('background');
    if (savedBackground) {
        changeBackground(savedBackground);
    }
    
    // Инициализация
    updateTime();
    setInterval(updateTime, 1000);
    initTabs();
    
    // Предзагрузка вкладки "Мои" из localStorage
    const myBackgrounds = JSON.parse(localStorage.getItem('myBackgrounds') || '[]');
    if (myBackgrounds.length > 0) {
        loadBackgrounds('my');
    }
});