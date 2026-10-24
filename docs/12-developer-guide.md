# Руководство для разработчиков (RU)

Архитектура, расширение браузера и форматы пакетов. EN version: `docs/en/12-developer-guide.md`.

---

## Запуск и сборка

```bash
npm install
npm start        # запуск из исходников
npm test         # автотесты чистых модулей (node --test)
npm run build    # сборка (electron-builder) → dist/
npm run drm:setup # Widevine-рантайм (Netflix и т.п.) в .drm/ (опционально)
```

## Архитектура

```
main.js             — главный процесс (~12.5k строк): окна, IPC, безопасность,
                      Tor, пароли/бэкапы, блокировщик, CDP-трекинг
renderer.js         — UI (~16k строк): вкладки, омнибокс, панели, QC
preload.js          — IPC-мост главного окна (contextBridge)
preload-webview.js  — мост webview'ев с пер-страничными правами API
storage.js          — атомарное хранилище настроек (кэш + tmp/rename)
certstore.js        — TLS-верификация (Mozilla roots + user CA)
adblocker.js        — движок блокировки (FilterHub, ABP-чексуммы)
i18n.js, locales/   — переводы (ru.json, uk.json)
lib/                — чистые модули (skit-manifest, url-cleaner, …) + test/
Help.html           — встроенная справка (about:help), RU/EN
docs/               — документация (RU + docs/en/ EN)
```

> **Про очистку URL.** Основной чистильщик — `cleanTrackingUrl()` в **main.js**:
> полный рабочий список (сотни трекинг-параметров, префиксы, хосты-редиректы,
> домены-исключения). `lib/url-cleaner.js` — вспомогательный чистый модуль
> (короткий базовый список, ре-экспортируется в adblocker.js, покрыт
> автотестами); в рантайме навигация чистится функцией из main.js.

### Модель безопасности
- `contextIsolation: true`, `nodeIntegration: false` везде; `will-attach-webview` фиксирует атрибуты.
- Пер-страничные права API в `preload-webview.js` (capability-фильтр): секреты — только `settings.html`/`library.html`, прокси/Tor-контроль — только Settings.
- **Секретные IPC перепроверяются в main-процессе** (`_isSecretsSender`, main.js): 46 каналов — весь password CRUD, vault/мастер-пароль, TOTP, защита Library/Settings/Backup, экспорт/импорт, HIBP. Отправитель — только Settings/Library; шеллу `index.html` дополнительно разрешены autofill, appLock, визард первого запуска и установка мастер-пароля. Отказ логируется `[vault] secrets IPC denied`.
- Первый запуск: визард из 4 шагов (пресет → мастер-пароль → импорт → готово) в `renderer.js`/`index.html` (`#firstRunWizard`), каналы `get-first-run` / `finish-first-run` / `apply-privacy-preset`, флаг `firstRunDone` в settings.json.
- CSP на всех внутренних страницах; fail-closed разрешения.
- CDP (debugger) используется для UA-override и данных SSL/Site Info; на auth-страницах Google отцепляется (анти-детект BotGuard).

### Как добавить внутреннюю страницу
1. Создайте `MyPage.html` в корне (CSP-мета как у Settings.html).
2. `renderer.js → _isInternalPageUrl()` — добавьте имя файла.
3. `resolveLocalUrl()` → `aboutMap` — алиас `about:mypage` → `MyPage.html`.
4. `_internalUrlToAbout()` — обратный маппинг для показа в строке.
5. Пункт меню/кнопка — `bind('hmXxx', () => createNewTab('MyPage.html'))`.
6. Если странице нужны секретные API — добавить в `secretsPages` в `preload-webview.js` (осознанно!) и **обязательно** добавить страницу в allowlist `_isSecretsSender` в main.js — без этого main-процесс отклонит вызовы.

---

## Пользовательские скрипты .skit

Пакет = ZIP: `script.json` + `script.js` (см. `docs/09-scripts.md`).

```json
{
  "name": "Cleanup",
  "version": "1.0",
  "type": "js",
  "main": "script.js",
  "match": "*://*.example.com/*",
  "runAt": "document-idle",
  "runInFrames": false,
  "permissions": ["storage"]
}
```

- `match` — URL-шаблоны (через запятую); `runAt` — `document-start|end|idle`.
- `permissions` — только `storage`, `clipboard`, `notifications` (неизвестные имена — импорт падает).
- Скрипту доступен shim `SKit` с заявленными API; незаявленные — `null`.
- Импорт: Settings → Scripts → Import (проверка манифеста, path traversal в `main` отсекается).

## Темы .thmz

ZIP: `theme.json` (`name/author/version/description/type: dark|light|auto`) + `theme.css` (CSS-переменные `:root`, `body.theme-dark/light`). Импорт: Settings → Customization. Удалённые ресурсы в CSS запрещены — только цвета/локальные url.

## Виджеты новой вкладки

`MainPage/Widgets/<имя>/` — `metadata.json` (id, name, size, default-enabled) + html/js. Виджеты работают в sandbox; внешние запросы только через сервисы с тумблерами.

---

## Омнибокс: как устроены подсказки

`renderer.js → updateSuggestions(query)` собирает список в порядке:
1. Bang-превью (`g|d|b|y|w запрос`) — резолв через `resolveLocalUrl`.
2. Частые сайты 🔥 (origin ≥3 визитов за 48ч; кэш `_frequentSites`, запись — IPC `record-frequent-visit` из `did-navigate`, только не-инкогнито).
3. Закладки ★ (гейт `omniboxBookmarkSuggestions`).
4. История 🕘.
5. Quick Commands (если включён Unified Bar).
6. **Открытые вкладки** 🗂 — внизу после разделителя; элементы с URL `__tab__:<id>` → `setActiveTab`.
7. Асинхронные поисковые подсказки (гейт `suggestEnabled` в main).

Настройки-гейты читаются через `getSecuritySetting('omniboxFrequentSuggestions'|'omniboxBookmarkSuggestions')` — opt-out (отсутствие = включено).

## Данные Site Info

- Сертификат/metadata: main.js `_trackSecurityDetails` (CDP `Network.responseReceived` → `_secInfoByWc`), отдаётся по `get-page-security-info(wcId)`.
- Факты страницы: `tab.webview.executeJavaScript(...)` — title, compatMode, charset, referrer, lastModified, метa-теги.
- Очистка: `clear-site-data(wcId, url)` — cookies (ручной обход доменных) + `clearStorageData` по origin в сессии вкладки.

---

## Тесты и стиль

- `node --test` — тесты в `test/` (чистые модули). Запуск: `npm test`.
- Перед коммитом: `node --check` на изменённых JS + `npm test`.
- Стиль: ES5-совместимый код в renderer/preload (никаких стрелок/let в горячих путях preload), `'use strict'` в модулях lib/.
- Комментарии объясняют «почему», не «что» — сохраняйте традицию.
