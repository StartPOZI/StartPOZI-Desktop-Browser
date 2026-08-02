# Безопасность

Все настройки безопасности находятся в **Settings → Security**.

## Защита приватности

### Очистка URL от трекеров
Автоматически удаляет параметры отслеживания из URL:
- `utm_source`, `utm_medium`, `utm_campaign` и др.
- `fbclid` (Facebook)
- `gclid` (Google Ads)
- Разворачивает редиректы (Google, Facebook и др.)

### Sanitize URL
- Предупреждает о punycode-доменах (потенциальный фишинг)
- Предупреждает о учётных данных в URL (`user:pass@site.com`)

### WebRTC IP Leak Protection
Блокирует WebRTC, предотвращая утечку локального IP-адреса даже через VPN/Tor.

### Fingerprinting Protection
- Добавляет шум в `canvas.toDataURL()` и `getImageData()`
- Подменяет `navigator.userAgent`, `platform`, `hardwareConcurrency`, `deviceMemory`, `languages`
- Подменяет информацию WebGL (vendor, renderer)

### Letterboxing
Округляет размеры области просмотра до кратных 200px (ширина) × 100px (высота), чтобы предотвратить определение реального разрешения экрана.

## Tor

### Настройка прокси
Поддерживаемые типы: HTTP, HTTPS, SOCKS4, SOCKS5, Tor.

### Встроенный Tor
- Запуск/остановка Tor-сервиса (SOCKS5, порт 9050)
- Поддержка мостов obfs4 и snowflake
- Прогресс-бар подключения (bootstrap)
- «Новая личность» (NewNym) — запрос нового контура

### Авто-определение
При запуске браузер проверяет наличие системного Tor и автоматически включает поддержку `.onion`-адресов.

### Tor Hardening (CSP)
Независимые переключатели для максимальной безопасности:
- Отключение JavaScript
- Блокировка WebGL
- Блокировка удалённых шрифтов
- Блокировка плагинов (`<object>`, `<embed>`)
- Блокировка внешних iframe
- Запрет `<base>`-тега

## Блокировка контента

| Переключатель | Действие |
|---------------|----------|
| Block autoplay | Медиа воспроизводится только после клика |
| Site isolation | Раздельные cookie/localStorage для каждого домена |
| HTTPS-only | Автоперенаправление HTTP → HTTPS |
| Referrer policy | Отправка только origin |
| Block 3rd-party cookies | Блокировка межсайтовых cookies |
| Block mixed content | Блокировка HTTP на HTTPS-страницах |
| Block notifications | Авто-отклонение уведомлений |
| Block geolocation | Запрет доступа к геолокации |
| Block WebGL fingerprint | Подмена GPU-информации |
| Block Clipboard API | Запрет чтения/записи буфера обмена |

## Тестирование

Откройте **Settings → Security → Test page** для интерактивной проверки всех функций безопасности на `SecurityTest.html`.
