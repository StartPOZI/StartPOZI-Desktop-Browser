# Скрипты (.skit)

## Что такое .skit

`.skit` — это формат пакетов скриптов для StartPOZI Browser, аналогичный темам `.thmz`, но для автоматизации. Каждый `.skit` — это ZIP-архив, содержащий JavaScript-код и метаданные.

Скрипты работают как в iOS Shortcuts — они автоматически выполняют действия на страницах: тёмный режим, перевод, блокировка трекеров, режим чтения и т.д.

## Формат файла

```
my-script.skit  (ZIP)
├── script.json   — метаданные
└── script.js     — код скрипта
```

### script.json

| Поле | Обязательно | Описание |
|------|-------------|----------|
| `name` | Да | Название скрипта (для галереи) |
| `author` | Нет | Имя автора |
| `version` | Нет | Версия |
| `description` | Нет | Описание (показывается в галерее) |
| `type` | Нет | `js` (единственный поддерживаемый тип) |
| `main` | Нет | Главный файл (по умолчанию `script.js`; `.ts`/`.py` отклоняются при импорте) |
| `match` | Нет | URL-шаблон (по умолчанию `*://*/*` — все сайты) |
| `runAt` | Нет | Когда запускать: `document-start`, `document-end`, `document-idle` |
| `runInFrames` | Нет | `true` — запускать в iframe |
| `permissions` | Нет | Массив возможностей: `storage`, `clipboard`, `notifications` (см. ниже) |

Пример:
```json
{
  "name": "My Script",
  "author": "Me",
  "version": "1.0",
  "description": "Does something cool",
  "type": "js",
  "main": "script.js",
  "match": "*://*.example.com/*",
  "runAt": "document-idle",
  "runInFrames": false,
  "permissions": ["storage", "clipboard"]
}
```

### URL-шаблоны (match)

| Шаблон | Действие |
|--------|----------|
| `*://*/*` | Все сайты (по умолчанию) |
| `*://*.google.com/*` | Только Google (все поддомены) |
| `*://example.com/*` | Только example.com |
| `https://*/*` | Только HTTPS-сайты |
| Несколько через запятую | `*://*.youtube.com/*, *://*.ytimg.com/*` |

### Когда запускать (runAt)

| Значение | Момент запуска |
|----------|----------------|
| `document-start` | До загрузки DOM (CSS/скрипты ещё не готовы) |
| `document-end` | DOM готов (DOMContentLoaded) |
| `document-idle` | После полной загрузки (по умолчанию) |

## Установка

1. Откройте **Настройки → Scripts → Script packages (.skit)**
2. Нажмите **Import .skit**
3. Выберите `.skit` файл
4. Скрипт появится в галерее — включите тумблер

Пакеты хранятся в `<userData>/skits/<id>/`.

## Создание .skit

### Способ 1: Через Python

```python
import zipfile, json

meta = {
    "name": "My Script",
    "author": "Me",
    "version": "1.0",
    "description": "My awesome script",
    "type": "js",
    "main": "script.js",
    "match": "*://*/*",
    "runAt": "document-idle",
    "runInFrames": False
}

code = """
(function(){
  console.log('Hello from my script on ' + location.href);
})();
"""

with zipfile.ZipFile("my-script.skit", "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("script.json", json.dumps(meta, indent=2))
    z.writestr("script.js", code)
```

### Способ 2: Вручную

1. Создайте папку с `script.json` и `script.js`
2. Запакуйте в ZIP
3. Переименуйте расширение в `.skit`
4. Импортируйте через **Settings → Scripts → Import .skit**

## API скриптов

Скрипты выполняются в контексте страницы через `webview.executeJavaScript()`. Доступно:

- Полный DOM API (`document`, `window`, `MutationObserver`, и т.д.)
- `navigator.getBattery()` — информация о батарее
- `fetch()` — сетевые запросы
- `localStorage`, `sessionStorage`
- CSS-инъекции через `<style>` элементы

Скрипты НЕ имеют доступа к Node.js / Electron API (изолированы в webview).

### Права (permissions) и объект SKit

Если в `script.json` объявлен массив `permissions`, перед кодом скрипта создаётся
объект `SKit` с гейтованными возможностями. Необъявленные права дают `null` —
так галерея и пользователь заранее видят, что запрашивает пакет. Импорт пакета
с неизвестным именем права или дубликатом отклоняется.

| Право | API | Описание |
|-------|-----|----------|
| `storage` | `SKit.storage.get/set/remove(key, …)` | Именованное хранилище пакета с префиксом `skit:` в `localStorage` (пакеты не видят ключи друг друга) |
| `clipboard` | `SKit.clipboard.writeText(text)` | Запись в буфер обмена через Clipboard API страницы |
| `notifications` | `SKit.notifications.request()`, `SKit.notifications.show(title, opts)` | Запрос разрешения и показ браузерных уведомлений |

Вспомогательные члены: `SKit.permissions` — массив объявленных прав, `SKit.has(name)` — проверка права.

```javascript
if (SKit.has('storage')) {
  var n = parseInt(SKit.storage.get('runs') || '0', 10) + 1;
  SKit.storage.set('runs', String(n));
  console.log('run #' + n);
}
```

### Защита от повторного запуска

Используйте флаг, чтобы скрипт не запускался дважды на одной странице:
```javascript
(function(){
  if (window.__myScript) return;
  window.__myScript = true;
  // ... ваш код
})();
```

## Готовые скрипты

В папке `docs/scripts/` находятся готовые пакеты (плюс `docs/build-extras.py` пересобирает расширенный пак):

| Файл | Описание |
|------|----------|
| `dark-reader.skit` | 🌙 Тёмный режим для всех сайтов |
| `battery-saver.skit` | 🔋 Экономия батареи на ноутбуках |
| `auto-translate.skit` | 🌐 Автоперевод иностранных страниц |
| `reading-mode.skit` | 📖 Режим чтения без отвлекающих элементов |
| `privacy-shield.skit` | 🛡️ Блокировка трекеров и fingerprinting |
| `scroll-progress.skit` | 📊 Полоса прогресса прокрутки страницы |
| `video-speed.skit` | ⏩ Скорость любого видео (0.25x–4x) кнопками −/+ |
| `no-sticky.skit` | 📌 Открепляет «прилипающие» шапки сайтов |
| `reading-font.skit` | 🅰 Комфортная книжная типографика статей |
| `select-to-search.skit` | 🔍 Поиск выделенного текста в StartPOZI |
| `toc-sidebar.skit` | 📑 Оглавление длинных статей по заголовкам |
| `youtube-pure.skit` | ▶️ YouTube без Shorts/рекламы/автоперехода |
| `x-clean.skit` | ✕ Чистая лента X/Twitter без промо |
| `vk-clean.skit` | 🇷🇺 VK без рекламы в ленте |
| `github-clean.skit` | 🐙 GitHub без промо-баннеров и футера |
| `show-password.skit` | 👁 Кнопка «показать пароль» в полях входа |
| `copy-code-button.skit` | 📋 Кнопка «Копировать» у блоков кода |
| `selection-stats.skit` | 🔢 Счётчик символов и слов в выделении |
| `wikipedia-wide.skit` | 📖 Широкая Википедия без баннеров |

Пересобрать базовые пакеты: `python3 docs/scripts/build-skits.py`
Пересобрать расширенный пак: `python3 docs/build-extras.py`

## Управление

- **Включить/выключить** — тумблер в карточке пакета
- **Экспорт** — кнопка Export (сохраняет обратно в `.skit`)
- **Удаление** — кнопка Delete в карточке
- Скрипты применяются мгновенно на новых загружаемых страницах

## Безопасность

- Скрипты выполняются в песочнице webview (без доступа к файловой системе)
- Код не может вызывать Node.js / Electron API
- `.skit` проверяется: архив без `script.json` отклоняется
- Манифест `permissions` валидируется по белому списку (`storage`, `clipboard`, `notifications`) — пакет с неизвестными правами не устанавливается
- Главный файл `.ts`/`.py` отклоняется при импорте с понятной ошибкой (раньше такой код молча исполнялся как JS и падал)
