# Система тем (.thmz)

## Формат файла

`.thmz` — это ZIP-архив, содержащий ровно два файла:

```
my-theme.thmz  (ZIP)
├── theme.json   — метаданные
└── theme.css    — CSS-переопределения
```

### theme.json

```json
{
  "name": "Название темы",
  "author": "Автор",
  "version": "1.0",
  "description": "Описание темы",
  "type": "dark"
}
```

| Поле | Обязательно | Описание |
|------|-------------|----------|
| `name` | Да | Название темы (используется для генерации ID) |
| `author` | Нет | Имя автора |
| `version` | Нет | Версия темы |
| `description` | Нет | Краткое описание |
| `type` | Нет | `"dark"`, `"light"` или `"auto"` |

### theme.css

Обычный CSS, переопределяющий переменные `:root`. Тема накладывается поверх базовой (тёмной/светлой).

```css
:root {
  --primary-color: #0077be;
  --bg-color: #0a1929;
  --text-primary: #e0f4ff;
  /* ... */
}

body.theme-dark {
  --bg-color: #0a1929;
  /* те же переменные, scoped для тёмного режима */
}
```

**Безопасность:** CSS не может содержать `javascript:` или `expression(` — такие темы отклоняются при импорте.

## Создание темы

### Способ 1: Встроенный редактор

1. Откройте **Настройки → Персонализация → Темы (.thmz)**
2. Нажмите **«Create from CSS»**
3. Выберите цвета через color picker или введите CSS вручную
4. Нажмите **«Save & Apply»**

### Способ 2: Вручную

1. Создайте папку с двумя файлами (`theme.json` + `theme.css`)
2. Запакуйте в ZIP
3. Переименуйте расширение в `.thmz`
4. Импортируйте через **Settings → Themes → Import .thmz**

### Создание через Python

```python
import zipfile, json

theme_json = json.dumps({
    "name": "My Theme",
    "author": "Me",
    "version": "1.0",
    "description": "My custom theme",
    "type": "dark"
}, indent=2)

theme_css = """:root {
  --primary-color: #e94560;
  --bg-color: #1a1a2e;
  --bg-secondary: #16213e;
  --bg-hover: #0f3460;
  --text-primary: #ffffff;
  --text-secondary: #a0a0b0;
  --border-color: #0f3460;
  --bg-color-alpha: rgba(26, 26, 46, var(--win-opacity));
  --bg-secondary-alpha: rgba(22, 33, 62, var(--win-opacity));
}"""

with zipfile.ZipFile("my-theme.thmz", "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("theme.json", theme_json)
    z.writestr("theme.css", theme_css)
```

## CSS-переменные

### Основные (самые важные)

| Переменная | Описание | Тёмное значение по умолчанию |
|-----------|----------|------------------------------|
| `--bg-color` | Основной фон | `#202020` |
| `--bg-secondary` | Вторичный фон | `#2d2d2d` |
| `--bg-hover` | Фон при наведении | `#3d3d3d` |
| `--text-primary` | Основной текст | `#ffffff` |
| `--text-secondary` | Вторичный текст | `#aaaaaa` |
| `--primary-color` | Акцентный цвет | `#1da1f2` |
| `--border-color` | Цвет границ | `#3d3d3d` |

### Прозрачность (используются вместе)

| Переменная | Описание |
|-----------|----------|
| `--win-opacity` | Коэффициент прозрачности (0.1–1.0) |
| `--bg-color-alpha` | `rgba(R, G, B, var(--win-opacity))` |
| `--bg-secondary-alpha` | То же для вторичного фона |

### Полный список

<details>
<summary>Все переменные (расширенный список)</summary>

```
/* Цвета */
--primary-color
--bg-color
--bg-secondary
--bg-hover
--text-primary
--text-secondary
--text-color
--border-color
--border-color-alpha
--hover-bg
--overlay-bg
--shadow

/* Прозрачность */
--win-opacity
--bg-color-alpha
--bg-secondary-alpha

/* Страницы настроек */
--accent-color
--accent-secondary
--accent-gradient
--base-font-size
--sidebar-opacity
--sidebar-bg
--sidebar-border
--card-opacity
--card-bg
--card-border
--card-filter
--overlay-opacity
--overlay-filter
--body-bg-image
--btn-bg
--btn-border
--btn-color
--btn-hover-bg
--input-bg
--input-border
--input-color
--placeholder-color
--link-color
--link-hover-bg
--link-hover-color
--link-active-bg
--link-active-color
--h2-color
--secondary-text
--option-bg
--option-color
--svg-stroke

/* Списки */
--history-border
--history-hover-bg
--title-color
--url-color
--time-color
--empty-color

/* Плагины/переключатели */
--plugin-card-bg
--plugin-enabled-bg
--plugin-enabled-border
--plugin-disabled-bg
--plugin-disabled-border
--switch-on-bg
--switch-off-bg
--switch-thumb

/* Кнопки */
--settings-btn-bg
--settings-btn-hover
--popup-btn-bg
--popup-btn-hover
--restart-btn-bg
--restart-btn-hover
```
</details>

### Совет

Для максимального эффекта изменяйте эти переменные:
- `--primary-color` (акцент)
- `--bg-color` + `--bg-color-alpha` (фон)
- `--bg-secondary` + `--bg-secondary-alpha` (поверхности)
- `--text-primary` и `--text-secondary` (текст)
- `--border-color` (границы)
- `--bg-hover` (интерактивные элементы)

Всегда указывайте `--bg-color-alpha` и `--bg-secondary-alpha` в формате
`rgba(R, G, B, var(--win-opacity))`, иначе прозрачность окна будет работать некорректно.

## Примеры тем

В папке `docs/themes/` находятся примеры (плюс пак `docs/build-extras.py` пересобирает все):

**Тёмные:**

| Файл | Описание |
|------|----------|
| `sample-ocean-blue.thmz` | Океанский синий |
| `sample-forest-green.thmz` | Лесной зелёный |
| `sample-sunset-orange.thmz` | Закат оранжевый |
| `nord.thmz` | Nord — холодная скандинавская палитра |
| `dracula.thmz` | Dracula — фиолетовые акценты |
| `tokyo-night.thmz` | Tokyo Night — ночной Токио |
| `catppuccin-mocha.thmz` | Catppuccin Mocha — мягкая пастель |
| `gruvbox-dark.thmz` | Gruvbox Dark — янтарь и охра |
| `cyberpunk-neon.thmz` | Cyberpunk Neon — неон на чёрном |
| `solarized-dark.thmz` | Solarized Dark — бирюзовый фон |
| `rose-pine.thmz` | Rosé Pine — розовая пыль и лаванда |
| `everforest.thmz` | Everforest — хвойный лес |
| `kanagawa.thmz` | Kanagawa — чернила суми |
| `onyx-graphite.thmz` | Onyx Graphite — нейтральный графит |

**Светлые:**

| Файл | Описание |
|------|----------|
| `paper-white.thmz` | Paper White — белая бумага |
| `catppuccin-latte.thmz` | Catppuccin Latte — пастель |
| `nord-light.thmz` | Nord Light — снежные вершины |

## Хранение

Темы сохраняются в `<userData>/themes/<theme-id>/`:
```
themes/
└── forest-green/
    ├── theme.json
    └── theme.css
```

ID темы генерируется из названия: перевод в нижний регистр, все символы кроме `[a-z0-9-_]` заменяются на `-`.

## Иконки в темах (icons/)

Тема может заменять **иконки кнопок браузера**. Положите в архив папку `icons/` с SVG-файлами, имя файла = слот кнопки:

```
theme.thmz
├── theme.json
├── theme.css
└── icons/
    ├── back.svg
    ├── forward.svg
    ├── adblock.svg
    └── …
```

**Слоты:** `back` `forward` `reload` `home` `library` `downloads` `autofill` `adblock` `scripts` `darkMode` `media` `equalizer` `qrScan` `split` `newTab` `bookmarks` `history` `reader` `tts` `screenshot` `incognito` `translate` `findAll` `autoscroll` `breakLoupe` `settings` `workspace` `hamburger`.

Требования: только чистый SVG (без `<script>`, обработчиков `on*=` и `javascript:`), до 64 КБ и до 30 файлов. Иконки встраиваются в браузер как data-URL при применении темы.

## Визуальный редактор тем

Полноценный редактор: **Settings → Customization → Themes → «Theme editor»**, адрес `about:themeeditor` или Quick Commands → `:theme-editor`.

Возможности:
- подбор цветов для всех переменных + ручной ввод (hex/rgba)
- пресеты (Stock dark/light, Midnight, Forest, Candy) и загрузка любой установленной темы для правки
- слайдеры прозрачности окна и скруглений
- живой предпросмотр макета браузера (таб-бар, навбар, панели, карточки)
- редактор CSS-кода с ручным редактированием и обратной синхронизацией («sync from CSS»)
- загрузка SVG-иконок для любой кнопки (слоты выше)
- «Apply to browser» — мгновенное применение к реальному интерфейсу
- «Export .thmz» — сохранение установочного архива (тема сразу появляется в Settings → Themes)
