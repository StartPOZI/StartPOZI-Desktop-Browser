# StartPOZI Browser

**Независимый приватный браузер на базе Chromium (Electron).** Без телеметрии, без скрытых трекеров, все настройки по умолчанию настроены на защиту от слежения. GPL-3.0.

```
npm install
npm start        # запуск
npm run build    # сборка (electron-builder)
```

## Приватность

- **Блокировщик рекламы** на каталоге [FilterHub](https://github.com/StartPOZI/FilterHub): 44 списка (EasyList/EasyPrivacy, uBlock Origin, AdGuard, HaGezi, Phishing Army…), включаются по отдельности, пресеты Light / Medium (по умолчанию) / Maximum
- **Автоотклонение cookie-баннеров** (~70 провайдеров, shadow DOM, кнопка «Принять» никогда не нажимается)
- **Tor с мостами** (obfs4 / snowflake / webtunnel) и прокси HTTP/SOCKS4/SOCKS5 с диагностикой exit-IP; watchdog автоматически переключает на прямое соединение при падении прокси и возвращает при восстановлении
- **Авто-удаление cookie при выходе** (опция), инкогнито не пишет историю/загрузки и не видит общие
- **Анти-фингерпринтинг**: шум в Canvas/AudioContext, letterboxing, spoof платформы под реальную ОС, блок WebRTC-утечек
- **Вход в Google работает**: на страницах логина браузер представляется Firefox (Google не запускает Chrome-аттестацию для Firefox-UA)
- **Управляемые внешние сервисы**: подсказки, переводчик, проверка утечек паролей, диагностика — каждый endpoint виден и отключается в настройках
- DNT + Sec-GPC, блокировка `<a ping>`, очистка URL от сотен трекинг-параметров, эфемерный журнал блокировок

## Пароли

- Шифрование на диске всегда: с мастер-паролем — AES-256-GCM + scrypt; без — OS-хранилище (DPAPI / Keychain / libsecret)
- TOTP-коды 2FA, проверка утечек (HIBP k-anonymity), биометрия, аудит надёжности, импорт из браузеров и Google Authenticator
- Бэкапы `.spzi` с шифрованием AES-256-GCM

## Возможности

Quick Commands (~60 команд) · Vim-режим · мульти-поиск · workspaces и контейнеры · гибернация вкладок и eco-freeze · split view · OCR (офлайн) · TTS (офлайн) · hover-перевод · элемент-заппер · скриншоты с аннотациями · диспетчер задач · темы `.thmz` и кастомный CSS · 27 кнопок тулбара (drag&drop) · виджеты на новой вкладке · проверка обновлений через GitHub Releases

## Безопасность архитектуры

`contextIsolation` + `nodeIntegration: false` везде · пер-страничные права API внутренних страниц (пароли — только Settings/Library) · `will-attach-webview` фиксирует безопасные атрибуты · атомарная запись хранилища (кэш в памяти + tmp/rename) · fail-closed разрешения

## Внутренние страницы

| Адрес | Страница |
|---|---|
| `about:settings` / `about:preferences` | Настройки |
| `about:library` | Библиотека (история, закладки, загрузки, пароли, cookie) |
| `about:newtab` / `about:home` | Новая вкладка |
| `about:taskmanager` | Диспетчер задач |
| `about:viewer` | Просмотрщик локальных файлов |
| `about:tor` / `about:proxy` | Прокси и Tor |
| `about:hotkeys` / `about:vim` | Хоткеи и Vim |
| `about:backup` | Бэкапы |

Полный список — в [docs/](docs/).

## Сборка

Требуется Node.js. Платформы: Windows, Linux, macOS.

```
npm run build
```

Готовые артефакты — в `dist/`.

## Лицензия

GPL-3.0. Отдельные списки блокировки сохраняют лицензии своих источников (см. [FilterHub](https://github.com/StartPOZI/FilterHub)).

© 2026 StartPOZI Project
