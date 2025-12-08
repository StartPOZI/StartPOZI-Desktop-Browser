СТРАНИЦА УЖЕ ГОТОВА!

<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StartPOZI - Главная</title>
    <link rel="stylesheet" href="style.css">
</head>
<script>
// Отключаем наш preload-трюк только на стартовой странице
delete window.open;
</script>
<body>
    <div class="container">
        <div class="header">
            <div class="logo-container">
                <div class="logo">Start<span>POZI</span></div>
            </div>
            <div class="control-buttons">
                <button class="btn red-btn" id="changePositions">🎨</button>
                <button class="btn purple-btn" id="importFromHistory">📥</button>
                <button class="btn blue-btn" id="deleteSites">🗑️</button>
                <button class="btn green-btn" id="changeBackground">🌄</button>
            </div>
        </div>

        <div class="main-content">
            <div class="sites-grid" id="sitesGrid">
                <!-- Сайты будут добавляться через JavaScript -->
            </div>
        </div>
    </div>

    <script src="script.js"></script>
    <script src="MouseConfig.js"></script>
    <script src="debug.js"></script>


    <!-- Меню выбора фона (актуальное с твоими опциями) -->
    <div id="backgroundMenu" class="bg-menu" style="display: none;">
        <button id="closeMenu" class="close-btn">×</button>
        <h3>🌄 Выбор фона</h3>

        <div class="bg-option" data-type="gradient">
            <span>🌈</span>
            <div>
                <h4>Градиент</h4>
                <p>Выберите готовый градиент</p>
            </div>
        </div>

        <div class="bg-option" data-type="photo">
            <span>📸</span>
            <div>
                <h4>Фото</h4>
                <p>Выберите готовые обои</p>
            </div>
        </div>

        <div class="bg-option" data-type="image">
            <span>🖼️</span>
            <div>
                <h4>Загрузить свои</h4>
                <p>Загрузите свою картинку</p>
            </div>
        </div>
    </div>

    <div id="gradientMenu" class="gradient-menu" style="display: none;">
        <button class="back-btn">← Назад</button>
        <h3>🌈 Выбор градиента</h3>

        <div class="gradient-option" data-gradient="gradient1" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);"></div>
        <div class="gradient-option" data-gradient="gradient2" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);"></div>
        <div class="gradient-option" data-gradient="gradient3" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);"></div>
        <div class="gradient-option" data-gradient="gradient4" style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);"></div>
        <div class="gradient-option" data-gradient="gradient7" style="background: linear-gradient(135deg, #fdcbf1 0%, #e6dee9 100%);"></div>
    </div>

    <div id="photoMenu" class="gradient-menu" style="display: none;">
        <button class="back-btn">← Назад</button>
        <h3>🖼️ Выбор фото</h3>

        <div class="gradient-option photo-option" data-photo="1" style="background-image: url('20221019093936_Priroda_8361-M.jpg'); background-size: cover; background-position: center;"></div> <!-- Изменено: локальный файл для preview -->
        <div class="gradient-option photo-option" data-photo="2" style="background-image: url('images.jpg'); background-size: cover; background-position: center;"></div> <!-- Изменено: локальный файл для preview -->
    </div>
</body>
<script>
  // Отключаем перехват ссылок только на стартовой странице
  if (location.href.includes('MainPage')) {
    window.open = window.parent.open; // возвращаем нормальное поведение
  }
</script>
</html>
