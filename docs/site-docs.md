# StartPOZI Browser — Documentation / Документация

> Единый файл для сайта: 12 категорий, RU + EN. Обновляйте из `docs/*.md`.
> One combined file for the website: 12 categories, RU + EN.
>
> **Содержание / Contents**
>
> **RU:** [Обзор](#1-обзор) · [Возможности](#2-возможности) · [Настройки](#3-настройки) · [Приватность](#4-приватность-и-безопасность) · [Оптимизация](#5-оптимизация) · [Quick Commands](#6-quick-commands) · [Vim](#7-vim-управление) · [Горячие клавиши](#8-горячие-клавиши) · [Скрипты .skit](#9-скрипты-skit) · [Темы .thmz](#10-темы-thmz) · [FAQ](#11-faq) · [Разработчикам](#12-разработчикам)
>
> **EN:** [Overview](#13-overview) · [Features](#14-features) · [Settings](#15-settings) · [Privacy](#16-privacy--security) · [Optimization](#17-optimization) · [Quick Commands](#18-quick-commands) · [Vim](#19-vim-mode) · [Hotkeys](#20-hotkeys) · [Scripts .skit](#21-scripts-skit) · [Themes .thmz](#22-themes-thmz) · [FAQ](#23-faq) · [For developers](#24-for-developers)

---

# ЧАСТЬ I — РУССКИЙ / PART I — RUSSIAN

## 1. Обзор

**StartPOZI** — независимый десктопный браузер на базе Electron (Chromium), ориентированный на приватность, кастомизацию и удобство для опытных пользователей. Без телеметрии, без скрытых трекеров; история и настройки хранятся только на вашем устройстве. GPL-3.0.

### Архитектура

```
main.js              — главный процесс Electron (~12.5k строк)
renderer.js          — UI логика (~16k строк)
preload.js / preload-webview.js — IPC-мосты с пер-страничными правами
adblocker.js         — движок блокировки (FilterHub, 44 списка)
storage.js / certstore.js — атомарное хранилище / TLS-верификация
MainPage/            — стартовая страница с виджетами
locales/             — переводы (ru, uk)
docs/                — документация
```

### Технологии

| Компонент | Технология |
|---|---|
| Движок | Electron 42 + Chromium |
| Блокировщик | @cliqz/adblocker-electron |
| Tor | встроенный запуск + мосты obfs4/snowflake/webtunnel |
| Шифрование | AES-256-GCM + scrypt (мастер-пароль), OS-хранилище |
| TTS / OCR | espeak-ng / tesseract.js — офлайн |
| Обновления | подписанные ed25519 манифесты (up.api.startpozi.com + GitHub) |

### Системные требования

- Windows 10+, macOS 11+ или Linux (Ubuntu 20.04+)
- 4 ГБ ОЗУ минимум (рекомендуется 8 ГБ)
- 500 МБ диска

## 2. Возможности

### Вкладки и навигация

| Функция | Описание |
|---|---|
| Workspaces | Группировка вкладок в именованные пространства с иконками и цветами |
| Засыпание вкладок | Автозаморозка неактивных вкладок (5–60 мин) для экономии ОЗУ |
| Инкогнито и контейнеры | Приватные вкладки и контейнеры с раздельными сессиями |
| Разделённый экран | Две вкладки бок о бок (split view) |
| Поиск по всем вкладкам | Поиск текста внутри всех открытых вкладок |
| Восстановление сессии | Автовосстановление вкладок при запуске |
| Превью вкладок | Миниатюра страницы при наведении |
| Индикатор микрофона | 🎤 на вкладке мягко мигает, пока страница пишет звук; клик — выкл/вкл |

### Адресная строка

| Функция | Описание |
|---|---|
| Умный омнибокс | URL, поиск, команды `:` в одной строке |
| Частые сайты 🔥 | Домены с 3+ визитами за 48 ч предлагаются первыми |
| Поиск по вкладкам 🗂 | Внизу списка — совпадения среди открытых вкладок, Enter переключает |
| Bang-поиск | `g`/`d`/`b`/`y`/`w` + пробел + запрос → нужный движок |
| Мульти-поиск | Сразу в нескольких поисковиках (Alt+Enter) |
| Unified Command Bar | QC-команды прямо в выпадающем списке |

### Приватность и блокировка

| Функция | Описание |
|---|---|
| Блокировщик | 44 списка FilterHub, пресеты Light/Medium/Maximum, ABP-чексуммы |
| Cookie-баннеры | Автоотклонение ~70 провайдеров, кнопка «Принять» не нажимается |
| Element Zapper | Интерактивное скрытие элементов |
| Очистка URL | Удаление utm_*, fbclid, gclid и сотен параметров, разворот редиректов |
| SponsorBlock | Автопропуск спонсорских сегментов YouTube (opt-in) |

### Безопасность

| Функция | Описание |
|---|---|
| WebRTC / фингерпринтинг | Блок утечек IP, шум Canvas/Audio, подмена UA, letterboxing |
| HTTPS-only / mixed content | Автоапгрейд HTTP→HTTPS, блок HTTP-ресурсов на HTTPS |
| Tor hardening (CSP) | Переключатели: JS, WebGL, шрифты, плагины, iframe, base |
| Site Info | Сертификат соединения, удаление cookies и данных сайта, разрешения, метаданные страницы |
| Пресеты приватности | Стандарт / Приватный / Максимум — одна кнопка вместо десятков переключателей, применяются живьём |
| Мастер первого запуска | 4 шага: пресет → мастер-пароль → импорт данных → готово; показывается один раз |

### Tor и прокси

| Функция | Описание |
|---|---|
| Прокси | HTTP/HTTPS/SOCKS4/SOCKS5 + встроенный Tor (SOCKS5 9050) |
| Мосты | obfs4, snowflake, webtunnel |
| Диагностика | Проверка exit-IP, гео, скорости; watchdog автопереключения |
| Авто-Tor | Автовключение для .onion-адресов, onion-зеркала поиска |

### Менеджер паролей

- Шифрование всегда: с мастер-паролем — AES-256-GCM + scrypt; без — OS-хранилище (DPAPI/Keychain/libsecret)
- TOTP-коды 2FA, QR-сканер, биометрия
- Проверка утечек HIBP (k-anonymity — пароль не покидает устройство)
- Импорт из браузеров и Google Authenticator; бэкапы .spzi

### Оптимизация

- Засыпание вкладок, eco-freeze анимаций, авто-сон по ОЗУ/CPU
- Data Saver, Battery Saver, whitelist «не спать»
- Менеджер задач: память/CPU по вкладкам (Shift+Esc)

### Кастомизация и продуктивность

- Темы .thmz + встроенный редактор, Dark Reader, custom CSS, 27 кнопок тулбара (drag&drop)
- Quick Commands (~60 команд, цепочки, алиасы), Vim-режим, мульти-поиск
- Reader mode, hover-перевод, скриншоты с редактором, OCR и TTS офлайн
- Виджеты стартовой страницы: погода, часы, календарь, цитаты

## 3. Настройки

| Раздел | Что внутри |
|---|---|
| Search | Движок, тип поиска, onion-зеркала при Tor, мульти-поиск, подсказки адресной строки (частые сайты/закладки + очистка счётчиков) |
| Security | Блокировщик, cookie-баннеры, анти-фингерпринтинг, HTTPS-only, WebRTC/DNS/clipboard, внешние сервисы (каждый endpoint с тумблером), SSL-сертификаты, DNT/GPC |
| Proxy / Tor | HTTP/SOCKS-прокси, встроенный Tor, мосты, exit-IP диагностика, watchdog |
| Scripts | Пользовательские скрипты .skit: менеджер, импорт, журнал ошибок |
| Customization | Темы .thmz, Dark Reader, custom CSS, панель инструментов, виджеты |
| Hotkeys / Vim | Все сочетания клавиш + Vim-режим, ремаппинг |
| Backup | Бэкапы .spzi (AES-256-GCM) с паролем или без секретов, восстановление, автобэкап |
| Profiles | Профили с отдельными данными и паролем разблокировки |
| Optimization | Засыпание вкладок, eco-freeze, Data/Battery Saver, прозрачность окна |

### Site Info (замочек в адресной строке)

- «Вы подключены к сайту по защищённому соединению» / предупреждение
- SSL-сертификат: протокол/шифр, кому/кем выдан, срок действия — из реального соединения
- Удалить cookie и данные сайта (cookies, localStorage, IndexedDB, SW, кэши)
- Подробнее о странице: заголовок, адрес, тип, тип визуализации, кодировка, размер, referrer, последнее изменение, мета-теги
- Разрешения: JavaScript, cookies, камера/микрофон, геолокация (+ подмена), буфер

### Обновления

- Проверка раз в 24 ч: подписанный манифест `up.api.startpozi.com` (ed25519), фолбэк GitHub Releases
- Anti-rollback: на даунгрейд не «обновляемся»
- Скачивание с проверкой sha512 → в папку Загрузки, ничего не ставится молча
- Отключается: Settings → Security → External services → Update checks

## 4. Приватность и безопасность

### Очистка URL от трекеров

Автоматически удаляет `utm_*`, `fbclid`, `gclid` и сотни других параметров; разворачивает редирект-обёртки Google/Facebook. Предупреждает о punycode-доменах (фишинг) и учётных данных в URL.

### Анти-фингерпринтинг

- Шум в `canvas.toDataURL()`, `getImageData()`, AudioContext
- Подмена userAgent, platform, hardwareConcurrency, deviceMemory, languages, WebGL
- Letterboxing: вьюпорт кратен 200×100

### WebRTC / Tor

Блокировка WebRTC-утечек (работает во всех сессиях, включая инкогнито и контейнеры). Tor: SOCKS5 9050, мосты obfs4/snowflake/webtunnel, NEWNYM «новая личность», DNS через прокси.

### Блокировка контента

| Переключатель | Действие |
|---|---|
| Block autoplay | Медиа только по клику |
| Site isolation | Раздельные cookie/localStorage по доменам |
| HTTPS-only | Автоперенаправление HTTP → HTTPS |
| Block 3rd-party cookies / mixed content | Межсайтовые cookies и HTTP на HTTPS блокируются |
| Block notifications / geolocation / clipboard | Запрет запросов |

### Пресеты и первый запуск

Мастер первого запуска (только на чистом профиле — без settings.json на старте; существующие установки его никогда не увидят) применяет глобальный пресет одной кнопкой вместо десятков переключателей:

- **Стандарт** — чистка URL от трекеров, punycode-предупреждения, DNT + Sec-GPC, лёгкие списки блокировщика;
- **Приватный** (по умолчанию) — + анти-фингерпринт, блок WebRTC-утечек, HTTPS-only, блок cookie третьих сторон и mixed content, referrer-only, средний пресет блокировщика;
- **Максимум** — + блок автоплея, уведомлений, геолокации, буфера обмена, WebGL, изоляция сайтов, максимальный пресет блокировщика.

Затем мастер предлагает установить мастер-пароль (AES-256 для хранилища паролей) и открыть импорт закладок/паролей из текущего браузера. Каждый переключатель пресета потом доступен по отдельности в Settings → Security.

### Внешние сервисы

Каждый endpoint виден и отключается в Settings → Security → External services: поисковые подсказки, переводчик, проверка утечек (HIBP), диагностика соединения, проверка обновлений.

## 5. Оптимизация

| Функция | Описание |
|---|---|
| Засыпание вкладок | Заморозка неактивных вкладок через 5–60 мин (кроме вкладок с видео) |
| Ленивая загрузка | При запуске грузится только активная вкладка |
| Лимит вкладок | 10–100: старые неактивные засыпают автоматически |
| Авто-сон по ОЗУ | Порог 512 МБ–4 ГБ |
| Eco-freeze | Заморозка CSS-анимаций и rAF в фоновых вкладках |
| Data Saver | Блокировка крупных изображений + lazy-loading |
| Battery Saver | Авто eco-freeze при заряде < 20% |
| Очистка Service Workers | Unregister SW у спящих вкладок |
| Лимит дискового кэша | 100/250/500 МБ / безлимит |
| Менеджер задач | Память/CPU/статус по вкладкам и процессам (Shift+Esc) |

## 6. Quick Commands

Командная палитра — `Ctrl+Shift+P`.

| Ввод | Действие |
|---|---|
| `:command` | Выполнить команду |
| `:cmd1 \| cmd2` | Цепочка команд |
| `текст` | Поиск в интернете |
| `:alias add o open` | Создать алиас (`:o` → `:open`) |

### Основные команды

| Команда | Описание |
|---|---|
| `:open URL` · `:back` · `:reload` | Навигация |
| `:tab-close` · `:tab-clone` · `:tab-pin` · `:split` | Вкладки |
| `:bookmark-add` · `:history` | Закладки и история |
| `:zoom 75` · `:findall` · `:view-source` | Страница |
| `:calc 2+2` · `:emoji` · `:ru/:en текст` · `:undo` | Разное |
| `:help` | Полный список (~60 команд) |

Кастомные команды: `:custom add <имя> <url|js:код>` — тип URL или JavaScript. Unified Command Bar показывает QC-команды в выпадающем списке адресной строки.

## 7. Vim-управление

Полная эмуляция vim внутри страниц. Включение: Settings → Hotkeys → Vim controls или `:vim`. Работает с любой раскладкой клавиатуры.

### Режимы

| Режим | Индикатор | Вход |
|---|---|---|
| Normal | `NORMAL` | Esc |
| Insert | — INSERT — | `i` |
| Visual / Visual Line | — VISUAL — | `v` / `V` |
| Hint | `HINT` | `f` / `F` |

### Движение и действия

| Клавиши | Действие |
|---|---|
| `h j k l` · `w b` · `0 $` | Курсор: стрелки, слова, начало/конец строки |
| `gg G` · `Ctrl+d/u` | Начало/конец страницы, пол-экрана |
| `f`/`F` | Ссылки буквенными подсказками (текущая/новая вкладка) |
| `y` · `yy` | Копировать выделение / URL страницы |
| `m{буква}` · `'{буква}` | Метки: установить / перейти |
| `/ n N` | Поиск на странице |
| `zi zo zz` | Зум +/−/сброс |
| `r` | Обновить страницу |

## 8. Горячие клавиши

| Сочетание | Действие |
|---|---|
| `Ctrl+T` / `Ctrl+W` | Новая / закрыть вкладку |
| `Ctrl+Shift+T` | Восстановить закрытую вкладку |
| `Ctrl+Tab` · `Ctrl+1…9` | Переключение вкладок |
| `Ctrl+L` | Фокус в адресную строку |
| `Ctrl+R`/`F5` · `Ctrl+Shift+R` | Обновить / без кэша |
| `Ctrl+D` · `Ctrl+H` · `Ctrl+J` | Закладка / история / загрузки |
| `Ctrl+F` · `Ctrl+P` · `Ctrl+S` | Найти / печать / сохранить |
| `Ctrl+Shift+P` · `Alt+Enter` | Quick Commands / мульти-поиск |
| `Ctrl+Shift+N` · `Ctrl+N` | Инкогнито-вкладка / новое окно |
| `Alt+←` · `Alt+→` · `Alt+Home` | Назад / вперёд / домой |
| `F11` · `F12` · `Shift+Esc` | Полный экран / DevTools / менеджер задач |

## 9. Скрипты .skit

`.skit` — формат пакетов скриптов (ZIP-архив), работающих на страницах автоматически: тёмный режим, перевод, чистка интерфейса и т.п.

```
my-script.skit (ZIP)
├── script.json   — метаданные
└── script.js     — код
```

### script.json

```json
{
  "name": "My Script",
  "author": "Me",
  "version": "1.0",
  "type": "js",
  "main": "script.js",
  "match": "*://*.example.com/*",
  "runAt": "document-idle",
  "runInFrames": false,
  "permissions": ["storage", "clipboard", "notifications"]
}
```

| Поле | Описание |
|---|---|
| `match` | URL-шаблоны через запятую: `*://*.google.com/*`, `https://*/*` |
| `runAt` | `document-start` / `document-end` / `document-idle` |
| `permissions` | Только `storage`, `clipboard`, `notifications`; неизвестные — импорт падает; незаявленные API = `null` |
| `main` | Только `.js` (`.ts`/`.py` отклоняются) |

Управление: Settings → Scripts (`about:scripts`). Готовые пакеты — в `docs/scripts/`.

## 10. Темы .thmz

`.thmz` — ZIP-архив из двух файлов:

```
my-theme.thmz (ZIP)
├── theme.json   — метаданные
└── theme.css    — CSS-переопределения переменных
```

```json
{
  "name": "Название",
  "author": "Автор",
  "version": "1.0",
  "description": "Описание",
  "type": "dark"
}
```

`theme.css` переопределяет CSS-переменные `:root` и `body.theme-dark/light`. Удалённые ресурсы запрещены — только цвета и локальные url: тема не может отправить данные в сеть.

- Установка: Settings → Customization → Themes → Import theme (или перетащить файл в окно)
- Создание: визуальный редактор `about:themeeditor` → экспорт .thmz
- 17 готовых тем в `docs/themes/`

## 11. FAQ

**Куда отправляются мои данные?**
История, закладки, пароли, счётчики частых сайтов — только на ваше устройство. Сеть контактируют лишь опциональные сервисы (подсказки, перевод, HIBP, диагностика, обновления), каждый отключается в Settings → Security → External services.

**Вход в Google не работает?**
На страницах входа браузер представляется Firefox (Google не запускает Chrome-аттестацию). Если проблема осталась: Site Info → удалить данные сайта → перезагрузить и повторить.

**Как удалить данные одного сайта?**
Замочек в адресной строке → «Удалить cookie и данные сайта». Удаляются cookies, localStorage, IndexedDB, service workers и кэши только этого домена.

**Что значит 🔥 в подсказках?**
«Частые сайты»: домены, открытые 3+ раза за 48 часов. Отключение и очистка — Settings → Search → Address bar suggestions.

**Tor упал — что с трафиком?**
Watchdog после нескольких неудачных проб переключает на прямое соединение и возвращает при восстановлении. Следите за индикатором в about:tor (там же диагностика exit-IP).

**DRM-видео (Netflix) не играет?**
Установите Widevine-рантайм: `npm run drm:setup` (из исходников). Стоковый Electron не включает CDM.

**Забыл мастер-пароль хранилища**
Расшифровать невозможно (AES-256-GCM + scrypt, ключ не хранится). Восстановите из бэкапа .spzi, если он есть.

**Может ли тема/скрипт украсть данные?**
Темы: нет — удалённые ресурсы запрещены. Скрипты: права заявляются в манифесте, незаявленные API недоступны. Ставьте только из доверенных источников.

**Как обновить браузер?**
Подписанный манифест up.api.startpozi.com → фолбэк GitHub Releases (Settings → About). Скачивание с проверкой sha512; установка поверх сохраняет данные.

## 12. Разработчикам

```bash
npm install
npm start            # запуск из исходников
npm test             # автотесты (node --test)
npm run build        # сборка (electron-builder) → dist/
npm run make-update  # пакет обновления + подпись → update-server/
```

| Файл/каталог | Назначение |
|---|---|
| `main.js` | Главный процесс: окна, IPC, безопасность, Tor, пароли, CDP |
| `renderer.js` | UI: вкладки, омнибокс, панели, QC |
| `preload*.js` | IPC-мосты с пер-страничными правами API |
| `adblocker.js` | Движок блокировки (FilterHub, ABP-чексуммы) |
| `storage.js / certstore.js` | Атомарное хранилище / TLS-верификация |
| `update-server/ + scripts/make-update.js` | Сервер обновлений: подписанные ed25519 манифесты |
| `docs/` | Вся документация RU/EN |

### Модель безопасности

- `contextIsolation: true`, `nodeIntegration: false` везде; will-attach-webview фиксирует атрибуты
- Пер-страничные права API в preload-webview (секреты — только Settings/Library)
- Секретные IPC перепроверяются в main-процессе (`_isSecretsSender`): отправитель — только Settings/Library; шеллу index.html дополнительно разрешены autofill, appLock и визард первого запуска
- CSP на всех внутренних страницах, fail-closed разрешения
- Обновления подписываются ed25519; публичный ключ зашит в бинарник

Подробности: `docs/12-developer-guide.md` (+ EN в `docs/en/`).

---

# PART II — ENGLISH

## 13. Overview

**StartPOZI** is an independent desktop browser built on Electron (Chromium), focused on privacy, customization and power users. No telemetry, no hidden trackers; history and settings stay on your device. GPL-3.0.

### Architecture

```
main.js              — Electron main process (~12.5k lines)
renderer.js          — UI logic (~16k lines)
preload.js / preload-webview.js — IPC bridges with per-page capabilities
adblocker.js         — blocking engine (FilterHub, 44 lists)
storage.js / certstore.js — atomic storage / TLS verification
MainPage/            — start page with widgets
locales/             — translations (ru, uk)
docs/                — documentation
```

### Requirements

- Windows 10+, macOS 11+ or Linux (Ubuntu 20.04+)
- 4 GB RAM minimum (8 GB recommended)
- 500 MB disk

## 14. Features

### Tabs & navigation

| Feature | Description |
|---|---|
| Workspaces | Named tab groups with icons and colors |
| Tab sleeping | Auto-freeze inactive tabs (5–60 min) to save RAM |
| Incognito & containers | Private tabs and containers with separate sessions |
| Split view | Two tabs side by side |
| Search all tabs | Find text across every open tab |
| Session restore | Tabs survive restarts; per-tab history |
| Tab previews | Thumbnails on hover |
| Microphone indicator | 🎤 pulses gently while a page captures audio; click to mute/unmute |

### Address bar

| Feature | Description |
|---|---|
| Smart omnibox | URLs, search and `:` commands in one bar |
| Frequent sites 🔥 | Origins visited 3+ times in 48h suggested first |
| Open tabs 🗂 | Bottom of the dropdown lists matching open tabs; Enter switches |
| Bangs | `g/d/b/y/w` + space + query → target engine |
| Multi-search | Several engines at once (Alt+Enter) |

### Privacy & blocking

| Feature | Description |
|---|---|
| Ad blocker | 44 FilterHub lists, Light/Medium/Maximum presets, ABP checksums |
| Cookie banners | Auto-dismiss ~70 providers; never clicks “Accept” |
| Element Zapper | Interactive element hiding |
| URL cleaning | Strips utm_*, fbclid, gclid + hundreds more; unwraps redirects |
| SponsorBlock | YouTube sponsor segments (opt-in) |

### Security

| Feature | Description |
|---|---|
| WebRTC / fingerprinting | IP-leak blocking, Canvas/Audio noise, UA spoof, letterboxing |
| HTTPS-only / mixed content | Auto-upgrade HTTP→HTTPS; block HTTP on HTTPS pages |
| Tor hardening (CSP) | Toggles: JS, WebGL, fonts, plugins, iframes, base |
| Site Info | Real TLS certificate details, per-site data wipe, permissions, page metadata |
| Privacy presets | Standard / Private / Maximum — one button instead of dozens of toggles, applied live |
| First-run wizard | 4 steps: preset → master password → import → done; shown once |

### Tor & proxies

| Feature | Description |
|---|---|
| Proxies | HTTP/HTTPS/SOCKS4/SOCKS5 + built-in Tor (SOCKS5 9050) |
| Bridges | obfs4, snowflake, webtunnel |
| Diagnostics | Exit-IP, geo, speed tests; watchdog failover |
| Auto-Tor | Enables Tor for .onion; onion search mirrors |

### Password manager

- Always encrypted at rest: master password — AES-256-GCM + scrypt; without — OS store (DPAPI/Keychain/libsecret)
- TOTP 2FA codes, QR scanner, biometrics
- HIBP breach check (k-anonymity — the password never leaves the device)
- Import from browsers and Google Authenticator; .spzi backups

### Optimization & productivity

- Tab sleeping, animation eco-freeze, auto-sleep on RAM/CPU pressure; Data/Battery Saver; task manager (Shift+Esc)
- .thmz themes + editor, Dark Reader, custom CSS, 27 toolbar buttons (drag & drop)
- Quick Commands (~60 commands, chains, aliases), Vim mode, multi-search
- Reader mode, hover translate, annotated screenshots, offline OCR and TTS

## 15. Settings

| Section | Inside |
|---|---|
| Search | Engine, search type, onion mirrors under Tor, multi-search, address-bar suggestions (frequent sites/bookmarks + clear counters) |
| Security | Blocker, cookie banners, anti-fingerprinting, HTTPS-only, WebRTC/DNS/clipboard, external services (each endpoint toggleable), SSL certificates, DNT/GPC |
| Proxy / Tor | HTTP/SOCKS proxies, built-in Tor, bridges, exit-IP diagnostics, watchdog |
| Scripts | User scripts .skit: manager, import, error log |
| Customization | .thmz themes, Dark Reader, custom CSS, toolbar, widgets |
| Hotkeys / Vim | All shortcuts + Vim mode, remapping |
| Backup | .spzi backups (AES-256-GCM) with or without secrets, restore, auto-backup |
| Profiles | Profiles with separate data and unlock password |
| Optimization | Tab sleeping, eco-freeze, Data/Battery Saver, window transparency |

### Site Info (the lock icon)

- “You are connected over a secure connection” / warning
- TLS certificate: protocol/cipher, issued to/by, validity — from the real connection
- Delete cookies and site data (cookies, localStorage, IndexedDB, SW, caches)
- More page details: title, address, type, render mode, encoding, size, referrer, last modified, meta tags
- Permissions: JavaScript, cookies, camera/mic, geolocation (+ fake coords), clipboard

### Updates

- Checked every 24h: signed manifest at `up.api.startpozi.com` (ed25519), GitHub Releases fallback
- Anti-rollback: never “upgrade” to an older version
- Downloads verify sha512 → saved to the Downloads folder; nothing installs silently
- Disable via Settings → Security → External services → Update checks

## 16. Privacy & security

### URL tracker cleaning

Automatically strips `utm_*`, `fbclid`, `gclid` and hundreds of other parameters; unwraps Google/Facebook redirect wrappers. Warns about punycode domains (phishing) and credentials in URLs.

### Anti-fingerprinting

- Noise in `canvas.toDataURL()`, `getImageData()`, AudioContext
- Spoofs userAgent, platform, hardwareConcurrency, deviceMemory, languages, WebGL
- Letterboxing: viewport rounded to 200×100

### WebRTC / Tor

WebRTC leak blocking enforced on ALL sessions (incognito and containers included). Tor: SOCKS5 9050, obfs4/snowflake/webtunnel bridges, NEWNYM identity change, DNS through the proxy.

### Content blocking

| Toggle | Effect |
|---|---|
| Block autoplay | Media only after a click |
| Site isolation | Separate cookie/localStorage per domain |
| HTTPS-only | Auto-upgrade HTTP → HTTPS |
| Block 3rd-party cookies / mixed content | Cross-site cookies and HTTP-on-HTTPS blocked |
| Block notifications / geolocation / clipboard | Requests denied |

### Presets & first run

The first-run wizard (fresh profiles only — no settings.json at process start; existing installs never see it) applies a global preset with one button instead of dozens of toggles:

- **Standard** — tracker-URL cleaning, punycode warnings, DNT + Sec-GPC, light blocker lists;
- **Private** (default) — + anti-fingerprinting, WebRTC-leak block, HTTPS-only, 3rd-party cookie and mixed-content block, referrer-only, medium blocker preset;
- **Maximum** — + autoplay, notifications, geolocation, clipboard and WebGL blocks, site isolation, maximum blocker preset.

The wizard then offers to set a master password (AES-256 for the password store) and to import bookmarks/passwords from your current browser. Every preset toggle remains individually editable in Settings → Security.

### External services

Every endpoint is visible and toggleable in Settings → Security → External services: search suggestions, translator, breach check (HIBP), connection diagnostics, update checks.

## 17. Optimization

| Feature | Description |
|---|---|
| Tab sleeping | Freeze inactive tabs after 5–60 min (video tabs exempt) |
| Lazy loading | Only the active tab loads on startup |
| Tab limit | 10–100: oldest inactive tabs auto-sleep |
| RAM auto-sleep | Threshold 512 MB–4 GB |
| Eco-freeze | Freeze CSS animations & rAF in background tabs |
| Data Saver | Block heavy images + lazy-loading |
| Battery Saver | Auto eco-freeze below 20% charge |
| Service Worker cleanup | Unregister SWs of sleeping tabs |
| Disk cache limit | 100/250/500 MB / unlimited |
| Task manager | Per-tab memory/CPU/status (Shift+Esc) |

## 18. Quick Commands

Command palette — `Ctrl+Shift+P`.

| Input | Action |
|---|---|
| `:command` | Run a command |
| `:cmd1 \| cmd2` | Command chain |
| `text` | Web search |
| `:alias add o open` | Create an alias (`:o` → `:open`) |

| Command | Description |
|---|---|
| `:open URL` · `:back` · `:reload` | Navigation |
| `:tab-close` · `:tab-clone` · `:tab-pin` · `:split` | Tabs |
| `:bookmark-add` · `:history` | Bookmarks & history |
| `:zoom 75` · `:findall` · `:view-source` | Page |
| `:calc 2+2` · `:emoji` · `:ru/:en text` · `:undo` | Misc |
| `:help` | Full list (~60 commands) |

Custom commands: `:custom add <name> <url|js:code>` — URL or JavaScript type. Unified Command Bar shows QC commands in the address-bar dropdown.

## 19. Vim mode

Full vim emulation inside pages. Enable: Settings → Hotkeys → Vim controls or `:vim`. Works with any keyboard layout.

| Mode | Indicator | Enter |
|---|---|---|
| Normal | `NORMAL` | Esc |
| Insert | — INSERT — | `i` |
| Visual / Visual Line | — VISUAL — | `v` / `V` |
| Hint | `HINT` | `f` / `F` |

| Keys | Action |
|---|---|
| `h j k l` · `w b` · `0 $` | Cursor: arrows, words, line start/end |
| `gg G` · `Ctrl+d/u` | Page start/end, half screen |
| `f`/`F` | Follow links by letter hints (same/new tab) |
| `y` · `yy` | Yank selection / page URL |
| `m{letter}` · `'{letter}` | Marks: set / jump |
| `/ n N` | Find on page |
| `zi zo zz` | Zoom in/out/reset |
| `r` | Reload page |

## 20. Hotkeys

| Shortcut | Action |
|---|---|
| `Ctrl+T` / `Ctrl+W` | New / close tab |
| `Ctrl+Shift+T` | Reopen closed tab |
| `Ctrl+Tab` · `Ctrl+1…9` | Switch tabs |
| `Ctrl+L` | Focus the address bar |
| `Ctrl+R`/`F5` · `Ctrl+Shift+R` | Reload / hard reload |
| `Ctrl+D` · `Ctrl+H` · `Ctrl+J` | Bookmark / history / downloads |
| `Ctrl+F` · `Ctrl+P` · `Ctrl+S` | Find / print / save |
| `Ctrl+Shift+P` · `Alt+Enter` | Quick Commands / multi-search |
| `Ctrl+Shift+N` · `Ctrl+N` | Incognito tab / new window |
| `Alt+←` · `Alt+→` · `Alt+Home` | Back / forward / home |
| `F11` · `F12` · `Shift+Esc` | Fullscreen / DevTools / task manager |

## 21. Scripts .skit

`.skit` is the script package format (a ZIP archive) that runs on pages automatically: dark mode, translate, UI cleanup and more.

```
my-script.skit (ZIP)
├── script.json   — metadata
└── script.js     — code
```

```json
{
  "name": "My Script",
  "author": "Me",
  "version": "1.0",
  "type": "js",
  "main": "script.js",
  "match": "*://*.example.com/*",
  "runAt": "document-idle",
  "runInFrames": false,
  "permissions": ["storage", "clipboard", "notifications"]
}
```

| Field | Description |
|---|---|
| `match` | Comma-separated URL patterns: `*://*.google.com/*`, `https://*/*` |
| `runAt` | `document-start` / `document-end` / `document-idle` |
| `permissions` | Only `storage`, `clipboard`, `notifications`; unknown names fail the import; undeclared APIs are `null` |
| `main` | JavaScript only (`.ts`/`.py` rejected) |

Manage: Settings → Scripts (`about:scripts`). Ready-made packages live in `docs/scripts/`.

## 22. Themes .thmz

`.thmz` is a ZIP archive with exactly two files:

```
my-theme.thmz (ZIP)
├── theme.json   — metadata
└── theme.css    — CSS variable overrides
```

```json
{
  "name": "Theme name",
  "author": "Author",
  "version": "1.0",
  "description": "Description",
  "type": "dark"
}
```

`theme.css` overrides `:root` and `body.theme-dark/light` CSS variables. Remote resources are forbidden — colors and local urls only: a theme cannot exfiltrate data.

- Install: Settings → Customization → Themes → Import theme (or drop the file into the window)
- Create: visual editor at `about:themeeditor` → export .thmz
- 17 ready themes in `docs/themes/`

## 23. FAQ

**Where does my data go?**
History, bookmarks, passwords, frequent-site counters — your device only. Only optional services touch the network (suggestions, translate, HIBP, diagnostics, updates), each disableable in Settings → Security → External services.

**Google sign-in fails?**
On login pages the browser identifies as Firefox (Google skips Chrome attestation). If it still fails: Site Info → delete site data → reload and retry.

**How do I wipe one site's data?**
Lock icon → “Delete cookies and site data”. Removes cookies, localStorage, IndexedDB, service workers and caches for that domain only.

**What is the 🔥 in suggestions?**
“Frequent sites”: origins opened 3+ times in the last 48 hours. Toggle/clear via Settings → Search → Address bar suggestions.

**Tor died — what happens to traffic?**
The watchdog fails over to a direct connection after a few failed probes and returns when Tor is back. Watch the indicator in about:tor (exit-IP diagnostics there too).

**DRM video (Netflix) does not play?**
Install the Widevine runtime: `npm run drm:setup` (from source). Stock Electron ships no CDM.

**I forgot the vault master password**
Decryption is impossible (AES-256-GCM + scrypt, no stored key). Restore from a .spzi backup if you have one.

**Can a theme/script steal data?**
Themes: no — remote resources are rejected. Scripts: grants are declared in the manifest; undeclared APIs are unavailable. Only install from trusted sources.

**How do I update the browser?**
Signed manifest at up.api.startpozi.com → GitHub Releases fallback (Settings → About). Downloads verify sha512; installing over the old copy preserves data.

## 24. For developers

```bash
npm install
npm start            # run from source
npm test             # unit tests (node --test)
npm run build        # package (electron-builder) → dist/
npm run make-update  # update package + signing → update-server/
```

| File/folder | Purpose |
|---|---|
| `main.js` | Main process: windows, IPC, security, Tor, passwords, CDP |
| `renderer.js` | UI: tabs, omnibox, panels, QC |
| `preload*.js` | IPC bridges with per-page API capabilities |
| `adblocker.js` | Blocking engine (FilterHub, ABP checksums) |
| `storage.js / certstore.js` | Atomic storage / TLS verification |
| `update-server/ + scripts/make-update.js` | Update server: ed25519-signed manifests |
| `docs/` | All documentation RU/EN |

### Security model

- `contextIsolation: true`, `nodeIntegration: false` everywhere; will-attach-webview pins attributes
- Per-page API capabilities in preload-webview (secrets — Settings/Library only)
- Secrets IPC channels are re-validated in the main process (`_isSecretsSender`): senders — Settings/Library only; the index.html shell additionally gets autofill, appLock and the first-run wizard
- CSP on every internal page; fail-closed permissions
- Updates are ed25519-signed; the public key is embedded in the binary

Details: `docs/en/12-developer-guide.md`.

---

© 2026 StartPOZI Project · GPL-3.0
