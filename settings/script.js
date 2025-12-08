// Переключение между разделами настроек
document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
        // Убираем активный класс у всех кнопок
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Добавляем активный класс нажатой кнопке
        button.classList.add('active');
        
        // Получаем секцию для отображения
        const sectionId = button.getAttribute('data-section') + '-section';
        
        // Скрываем все секции
        document.querySelectorAll('.settings-section').forEach(section => {
            section.classList.remove('active');
        });
        
        // Показываем выбранную секцию с анимацией
        const targetSection = document.getElementById(sectionId);
        targetSection.classList.add('active');
        
        // Плавная прокрутка к началу секции
        setTimeout(() => {
            targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    });
});

// Анимация для чекбоксов
document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', function() {
        const item = this.closest('.security-item, .setting-item');
        if (item && this.checked) {
            item.style.transform = 'translateY(-2px)';
            item.style.boxShadow = '0 8px 25px rgba(0, 200, 255, 0.2)';
            setTimeout(() => {
                item.style.transform = '';
                item.style.boxShadow = '';
            }, 300);
        }
        
        // Анимация для кастомных чекбоксов
        if (this.type === 'checkbox' && this.parentElement.classList.contains('security-label')) {
            const checkmark = this.nextElementSibling;
            if (this.checked) {
                checkmark.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    checkmark.style.transform = '';
                }, 200);
            }
        }
    });
});

// Анимация для кнопок при наведении
document.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('mouseenter', function() {
        if (!this.classList.contains('nav-item')) {
            this.style.transform = 'translateY(-2px)';
        }
    });
    
    btn.addEventListener('mouseleave', function() {
        if (!this.classList.contains('nav-item')) {
            this.style.transform = '';
        }
    });
    
    // Эффект нажатия
    btn.addEventListener('mousedown', function() {
        this.style.transform = 'translateY(1px) scale(0.98)';
    });
    
    btn.addEventListener('mouseup', function() {
        this.style.transform = 'translateY(-2px)';
        setTimeout(() => {
            this.style.transform = '';
        }, 150);
    });
});

// Закрытие страницы настроек
document.getElementById('closeSettingsBtn').addEventListener('click', function() {
    const settingsPage = document.getElementById('settingsPageMain');
    settingsPage.style.opacity = '0';
    settingsPage.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
        settingsPage.style.display = 'none';
        // Для демонстрации - показываем сообщение
        alert('Настройки закрыты. Для демонстрации обновите страницу.');
    }, 400);
});

// Обработка кнопок очистки
document.getElementById('clearDownloadsBtn').addEventListener('click', function() {
    if (confirm('Очистить историю загрузок?')) {
        const downloadsList = document.getElementById('downloadsList');
        downloadsList.innerHTML = '<div class="download-item"><div class="download-info"><span class="download-title">История загрузок очищена</span></div></div>';
        
        // Анимация кнопки
        this.innerHTML = '<svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></polyline></svg> Готово';
        this.style.background = 'linear-gradient(135deg, #27c93f 0%, #1e9c31 100%)';
        this.style.borderColor = '#27c93f';
        
        setTimeout(() => {
            this.innerHTML = '<svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"></polyline><path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path></svg> Очистить историю загрузок';
            this.style.background = '';
            this.style.borderColor = '';
        }, 2000);
    }
});

document.getElementById('clearHistoryBtn').addEventListener('click', function() {
    if (confirm('Очистить историю посещений?')) {
        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '<div class="history-item"><div class="history-info"><span class="history-title">История посещений очищена</span></div></div>';
        
        // Анимация кнопки
        this.innerHTML = '<svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></polyline></svg> Готово';
        this.style.background = 'linear-gradient(135deg, #27c93f 0%, #1e9c31 100%)';
        this.style.borderColor = '#27c93f';
        
        setTimeout(() => {
            this.innerHTML = '<svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"></polyline><path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path></svg> Очистить историю';
            this.style.background = '';
            this.style.borderColor = '';
        }, 2000);
    }
});

document.getElementById('clearFavoritesBtn').addEventListener('click', function() {
    if (confirm('Очистить все избранные сайты?')) {
        const favoritesList = document.getElementById('favoritesList');
        favoritesList.innerHTML = '<div class="favorite-item"><div class="favorite-info"><span class="favorite-title">Избранное очищено</span></div></div>';
        
        // Анимация кнопки
        this.innerHTML = '<svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></polyline></svg> <span>Избранные очищены</span>';
        this.style.background = 'linear-gradient(135deg, rgba(39, 201, 63, 0.1) 0%, rgba(30, 156, 49, 0.05) 100%)';
        this.style.color = '#27c93f';
        
        setTimeout(() => {
            this.innerHTML = '<svg class="action-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3,6 5,6 21,6"></polyline><path d="M19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path></svg> <span>Очистить все избранные</span>';
            this.style.background = '';
            this.style.color = '#ff4444';
        }, 2000);
    }
});

// Очистка системного прокси Windows
document.getElementById('clearWindowsProxyBtn').addEventListener('click', function() {
    if (confirm('Очистить настройки системного прокси Windows?')) {
        // Анимация кнопки
        this.innerHTML = '<svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></polyline></svg> Прокси очищен';
        this.style.background = 'linear-gradient(135deg, #27c93f 0%, #1e9c31 100%)';
        this.style.color = 'white';
        this.style.borderColor = '#27c93f';
        
        setTimeout(() => {
            this.innerHTML = '<svg class="action-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Очистить системный прокси';
            this.style.background = '';
            this.style.color = '#ff6464';
            this.style.borderColor = '';
        }, 2000);
    }
});

// Подписка на ZhukPlus
document.getElementById('subscribeBtn').addEventListener('click', function() {
    if (confirm('Оформить подписку ZhukPlus за 299 ₽/месяц?')) {
        // Анимация кнопки
        this.innerHTML = '<svg class="subscribe-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></polyline></svg> Подписка оформлена!';
        this.style.background = 'linear-gradient(135deg, #27c93f 0%, #1e9c31 100%)';
        this.style.transform = 'scale(0.98)';
        
        // Обновление статуса профиля
        document.getElementById('profileStatus').textContent = 'Премиум аккаунт';
        document.getElementById('profileStatus').style.color = '#00c8ff';
        document.getElementById('profileStatus').style.fontWeight = '600';
        
        // Переключение кнопок
        setTimeout(() => {
            this.style.display = 'none';
            document.getElementById('unsubscribeBtn').style.display = 'flex';
            this.style.transform = '';
        }, 1500);
    }
});

// Отмена подписки
document.getElementById('unsubscribeBtn').addEventListener('click', function() {
    if (confirm('Отменить подписку на ZhukPlus? Премиум функции будут отключены.')) {
        // Восстановление кнопки подписки
        document.getElementById('subscribeBtn').style.display = 'flex';
        document.getElementById('subscribeBtn').innerHTML = '<svg class="subscribe-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Подписаться на ZhukPlus';
        document.getElementById('subscribeBtn').style.background = 'linear-gradient(135deg, #00c8ff 0%, #0088cc 100%)';
        
        // Скрытие кнопки отмены
        this.style.display = 'none';
        
        // Обновление статуса профиля
        document.getElementById('profileStatus').textContent = 'Бесплатный аккаунт';
        document.getElementById('profileStatus').style.color = 'rgba(255, 255, 255, 0.6)';
        document.getElementById('profileStatus').style.fontWeight = 'normal';
    }
});

// Изменение темы
document.querySelectorAll('input[name="themeMode"]').forEach(radio => {
    radio.addEventListener('change', function() {
        const body = document.body;
        const settingsPage = document.querySelector('.settings-page');
        
        if (this.value === 'light') {
            body.style.background = 'linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%)';
            body.style.color = '#333';
            settingsPage.style.background = 'linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%)';
            
            // Обновление цветов текста для светлой темы
            document.querySelectorAll('.settings-content, .settings-sidebar').forEach(el => {
                el.style.color = '#333';
            });
        } else if (this.value === 'dark') {
            body.style.background = 'linear-gradient(135deg, #0a0a0f 0%, #151520 100%)';
            body.style.color = '#fff';
            settingsPage.style.background = 'linear-gradient(135deg, #0a0a0f 0%, #151520 100%)';
            
            // Возвращение цветов для темной темы
            document.querySelectorAll('.settings-content, .settings-sidebar').forEach(el => {
                el.style.color = '#fff';
            });
        } else {
            // Системная тема - определяем предпочтения системы
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                body.style.background = 'linear-gradient(135deg, #0a0a0f 0%, #151520 100%)';
                body.style.color = '#fff';
                settingsPage.style.background = 'linear-gradient(135deg, #0a0a0f 0%, #151520 100%)';
            } else {
                body.style.background = 'linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%)';
                body.style.color = '#333';
                settingsPage.style.background = 'linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%)';
            }
        }
        
        // Анимация переключения темы
        const themeOption = this.closest('.theme-option');
        themeOption.style.transform = 'scale(1.05)';
        setTimeout(() => {
            themeOption.style.transform = '';
        }, 300);
    });
});

// Очистка поиска истории
document.getElementById('historySearchClearBtn').addEventListener('click', function() {
    const searchInput = document.getElementById('historySearchInput');
    searchInput.value = '';
    searchInput.focus();
    
    // Показываем все элементы истории
    document.querySelectorAll('.history-item').forEach(item => {
        item.style.display = 'flex';
    });
});

// Поиск по истории
document.getElementById('historySearchInput').addEventListener('input', function(e) {
    const searchTerm = e.target.value.toLowerCase();
    const historyItems = document.querySelectorAll('.history-item');
    let foundCount = 0;
    
    historyItems.forEach(item => {
        const title = item.querySelector('.history-title').textContent.toLowerCase();
        const desc = item.querySelector('.history-desc').textContent.toLowerCase();
        
        if (title.includes(searchTerm) || desc.includes(searchTerm)) {
            item.style.display = 'flex';
            foundCount++;
            
            // Анимация для найденных элементов
            item.style.animation = 'slideIn 0.3s ease-out';
        } else {
            item.style.display = 'none';
        }
    });
    
    // Если ничего не найдено
    if (foundCount === 0 && searchTerm.length > 0) {
        // Можно показать сообщение "Ничего не найдено"
    }
});

// Пульсация аватара при наведении
document.getElementById('profileAvatar').addEventListener('mouseenter', function() {
    this.style.animation = 'pulse 0.8s ease';
});

document.getElementById('profileAvatar').addEventListener('mouseleave', function() {
    this.style.animation = 'pulse 2s infinite';
});

// Кнопка изменения аватара
document.getElementById('changeAvatarBtn').addEventListener('click', function() {
    alert('Функция изменения аватара будет реализована в будущем обновлении');
    
    // Анимация кнопки
    this.style.transform = 'scale(0.95)';
    setTimeout(() => {
        this.style.transform = '';
    }, 200);
});

// Кнопка истории платежей
document.getElementById('paymentHistoryBtn').addEventListener('click', function() {
    alert('История платежей будет отображаться здесь. Функция в разработке.');
    
    // Анимация кнопки
    this.style.transform = 'scale(0.98)';
    this.style.background = 'rgba(0, 200, 255, 0.2)';
    setTimeout(() => {
        this.style.transform = '';
        this.style.background = '';
    }, 300);
});

// Кнопка магазина расширений
document.getElementById('extensionStoreBtn').addEventListener('click', function() {
    alert('Магазин расширений откроется в новом окне. Функция в разработке.');
    
    // Анимация кнопки
    this.style.transform = 'scale(0.95)';
    setTimeout(() => {
        this.style.transform = '';
    }, 200);
});

// Сохранение настроек при изменении
document.querySelectorAll('select, input[type="checkbox"], input[type="radio"]').forEach(element => {
    element.addEventListener('change', function() {
        if (this.type === 'checkbox') {
            localStorage.setItem(this.id, this.checked);
        } else if (this.type === 'radio') {
            if (this.checked) {
                localStorage.setItem(this.name, this.value);
            }
        } else {
            localStorage.setItem(this.id, this.value);
        }
        
        // Анимация подтверждения сохранения
        const parent = this.closest('.setting-item, .security-item, .theme-option, .titlebar-style-option');
        if (parent) {
            parent.style.borderColor = '#00c8ff';
            parent.style.boxShadow = '0 0 20px rgba(0, 200, 255, 0.3)';
            
            setTimeout(() => {
                parent.style.borderColor = '';
                parent.style.boxShadow = '';
            }, 1000);
        }
    });
});

// Загрузка сохраненных настроек при запуске
window.addEventListener('load', function() {
    // Чекбоксы
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        const saved = localStorage.getItem(checkbox.id);
        if (saved !== null) {
            checkbox.checked = saved === 'true';
        }
    });
    
    // Радио кнопки
    document.querySelectorAll('input[type="radio"]').forEach(radio => {
        const saved = localStorage.getItem(radio.name);
        if (saved !== null && radio.value === saved) {
            radio.checked = true;
            
            // Применяем тему если это настройка темы
            if (radio.name === 'themeMode') {
                radio.dispatchEvent(new Event('change'));
            }
        }
    });
    
    // Выпадающие списки
    document.querySelectorAll('select').forEach(select => {
        const saved = localStorage.getItem(select.id);
        if (saved !== null) {
            select.value = saved;
        }
    });
    
    // Имитация загрузки данных с небольшой задержкой для эффекта
    setTimeout(() => {
        document.querySelector('.settings-content').style.opacity = '1';
    }, 100);
});

// Дополнительные анимации для элементов при загрузке
document.addEventListener('DOMContentLoaded', function() {
    // Анимация появления элементов списка
    const listItems = document.querySelectorAll('.download-item, .history-item, .favorite-item');
    listItems.forEach((item, index) => {
        item.style.animationDelay = `${index * 0.1}s`;
    });
    
    // Плавное появление страницы
    setTimeout(() => {
        document.getElementById('settingsPageMain').style.opacity = '1';
    }, 50);
});