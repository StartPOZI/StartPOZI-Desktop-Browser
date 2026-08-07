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
| `type` | Нет | `js` (по умолчанию). `ts` и `py` — планируется |
| `main` | Нет | Главный файл (по умолчанию `script.js`) |
| `match` | Нет | URL-шаблон (по умолчанию `*://*/*` — все сайты) |
| `runAt` | Нет | Когда запускать: `document-start`, `document-end`, `document-idle` |
| `runInFrames` | Нет | `true` — запускать в iframe |
| `permissions` | Нет | Зарезервировано на будущее |

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
  "runInFrames": false
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

В папке `docs/scripts/` находятся 5 готовых пакетов:

| Файл | Описание |
|------|----------|
| `dark-reader.skit` | 🌙 Тёмный режим для всех сайтов |
| `battery-saver.skit` | 🔋 Экономия батареи на ноутбуках |
| `auto-translate.skit` | 🌐 Автоперевод иностранных страниц |
| `reading-mode.skit` | 📖 Режим чтения без отвлекающих элементов |
| `privacy-shield.skit` | 🛡️ Блокировка трекеров и fingerprinting |

Пересобрать все пакеты: `python3 docs/scripts/build-skits.py`

## Управление

- **Включить/выключить** — тумблер в карточке пакета
- **Экспорт** — кнопка Export (сохраняет обратно в `.skit`)
- **Удаление** — кнопка Delete в карточке
- Скрипты применяются мгновенно на новых загружаемых страницах

## Безопасность

- Скрипты выполняются в песочнице webview (без доступа к файловой системе)
- Код не может вызывать Node.js / Electron API
- `.skit` проверяется: архив без `script.json` отклоняется
