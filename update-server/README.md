# Update server package — up.api.startpozi.com

Здесь собирается всё, что заливается на сервер обновлений. Корень сервера = содержимое этой папки **БЕЗ каталога `keys/`**.

## Структура (то, что видит сервер)

```
/latest.json                 ← манифест stable (подписан ed25519)
/latest-beta.json            ← манифест beta (когда нужен)
/stable/1.0.1/               ← артефакты релиза
    StartPOZI-1.0.1.AppImage + .blockmap
    StartPOZI-Setup-1.0.1.exe + .blockmap
    startpozi-browser_1.0.1_amd64.deb
/health.json                 ← проверка доступности
```

> **Примечание.** `latest.json` (и `latest-beta.json`) **не хранится в репозитории** —
> манифест генерируется командой `npm run make-update` при выпуске обновления и
> попадает только на сервер. Структура выше — целевое состояние сервера, а не
> содержимое папки в git.
>
> **Состояние артефактов:** релиз 1.0.0 залит не полностью — в `stable/1.0.0/`
> находится только `StartPOZI Browser-1.0.0.AppImage` (без .exe/.deb/.blockmap).

## Как выпустить обновление

```bash
npm run build                                  # electron-builder → dist/
npm run make-update -- --notes "Что нового"    # манифест + подпись + копии сюда
npm run make-update -- --channel beta --notes "Beta"
```

Скрипт сам: версия из package.json, sha512/размеры, копия артефактов в
`stable/<версия>/`, подпись `latest.json` (self-check), команды заливки.

## Заливка на сервер

```bash
rsync -avz update-server/latest.json       user@SERVER:/var/www/updates/
rsync -avz update-server/stable/1.0.1/     user@SERVER:/var/www/updates/stable/1.0.1/
```

Держите текущую и одну прошлую версию; старше — удаляйте.

## Ключи (keys/) — на сервер НЕ заливать!

- `keys/update-private.pem` — подписывает манифесты. **Приватный ключ храните
  офлайн** (секреты/менеджер ключей, не в рабочей копии проекта) и **НИКОГДА не
  включайте его в релизные архивы, дистрибутивы, бэкапы репозитория или копии
  проекта** — компрометация ключа позволяет подсунуть пользователям подменённое
  обновление, которое браузер сочтёт доверенным. Утечка = смена пары ключей и
  новый релиз браузера для всех пользователей.
- `keys/update-public.pem` — зашит в браузер (UPDATE_PUBKEY_B64 в main.js).
  Смена пары = новый релиз браузера; старые манифесты становятся недоверенными.

## nginx (минимум)

```nginx
server {
    listen 443 ssl http2;
    server_name up.api.startpozi.com;
    root /var/www/updates;
    autoindex off;
    location ~ \.json$ { add_header Cache-Control "public, max-age=300"; gzip on; gzip_types application/json; }
    location ~ ^/(stable|beta)/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
    sendfile on; tcp_nopush on;
}
```

TLS: `certbot --nginx -d up.api.startpozi.com`. CORS не нужен (клиент — main-процесс).

## Проверка

```bash
curl -s https://up.api.startpozi.com/health.json
curl -s https://up.api.startpozi.com/latest.json | head -c 400
```

Проверка подписи манифеста ключом из браузера (UPDATE_PUBKEY_B64):

```bash
curl -s https://up.api.startpozi.com/latest.json -o /tmp/latest.json
node -e "const fs=require('fs'),c=require('crypto');function j(v){if(v===null||typeof v!=='object')return JSON.stringify(v);if(Array.isArray(v))return '['+v.map(j).join(',')+']';return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+j(v[k])).join(',')+'}';}const m=JSON.parse(fs.readFileSync('/tmp/latest.json','utf8'));const s=m.signature;delete m.signature;const p=c.createPublicKey({key:Buffer.from('MCowBQYDK2VwAyEAkNpiw4tix4kmOuYPLznbV2s4AkohfBnm9NRomEVhWyw=','base64'),format:'der',type:'spki'});console.log(c.verify(null,Buffer.from(j(m),'utf8'),p,Buffer.from(s,'base64'))?'PASSED':'FAILED');"
```
