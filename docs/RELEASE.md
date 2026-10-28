# Runbook: релиз StartPOZI Browser

Полный чеклист выпуска новой версии. Текущая схема обновлений: подписанный
ed25519 манифест `latest.json` на **up.api.startpozi.com** + GitHub Releases
как фолбэк (см. `main.js → _fetchUpdateInfo`).

## 0. Ключи (один раз, уже сделано)

- Пара ed25519: приватный — `~/.startpozi-keys/update-private.pem`
  (НИКОГДА не в репозиторий и не на сервер), публичный —
  `update-server/keys/update-public.pem`.
- Base64 SPKI публичного ключа вшит в браузер: константа
  `UPDATE_PUBKEY_B64` в `main.js` и self-check в `scripts/make-update.js`
  (должны совпадать байт-в-байт; make-update сам откажется работать при
  рассинхроне).
- Смена ключа = новая пара + новые константы + пересборка браузера. Манифесты
  со старым ключом клиенты отвергнут — менять ключ до деплоя первого
  манифеста безопасно, после — только через выпуск новой версии.

## 1. Версия и тег

1. Поднять `"version"` в `package.json` (semver: патч — фиксы, минор — фичи).
2. Закоммитить, запушить в `main`.
3. Создать **новый** тег `v<version>` (например `v1.0.1`).
   **Никогда не двигать уже опубликованные теги** — клиенты и манифесты
   ссылаются на них по имени.

## 2. Сборка (на каждой целевой ОС)

DRM-рантайм (castlabs ECS) пер-платформенный, поэтому собираем на каждой ОС:

```bash
npm ci
npm run drm:setup        # один раз на машине (≈130 МБ)
npm run build            # = DRM-сборка (Widevine вшит)
```

- Linux: AppImage + deb + rpm (`npm run build -- --linux AppImage deb rpm`)
- Windows (на Windows): NSIS `npm run build -- --win nsis zip`
- macOS (на macOS): `npm run build -- --mac dmg zip`
  + codesign + notarization (нужен Apple Developer ID; без подписи —
  первый запуск через ПКМ → «Открыть»).
- `npm run build:stock` — исключение: сборка без DRM.

## 3. Манифест обновлений

```bash
npm run make-update -- --notes "Что нового" \
  --key ~/.startpozi-keys/update-private.pem
# канал бета: добавить --channel beta
```

Скрипт соберёт `update-server/latest.json` (подпись ed25519, sha512 каждого
артефакта, githubFallback-ссылки) и скопирует файлы в
`update-server/<channel>/<version>/`. Затем — rsync по подсказке скрипта:

```bash
rsync -avz update-server/latest.json  user@SERVER:/var/www/updates/
rsync -avz update-server/stable/<version>/ user@SERVER:/var/www/updates/stable/<version>/
```

Важно: `githubFallback` указывает на
`releases/download/v<version>/<asset>` — имена ассетов должны совпадать с
файлами из `dist/` байт-в-байт (GitHub сам заменяет пробелы точками).

## 4. GitHub Release

1. Release с тегом `v<version>`, все артефакты из `dist/`
   (AppImage, deb, rpm, Setup.exe, win.zip, mac.zip/dmg).
2. Notes: что нового + таблица файлов по платформам + Homebrew-строка.

## 5. Homebrew tap (после публикации релиза)

`StartPOZI/homebrew-tap`:

- `Casks/startpozi-browser.rb`: `version` + `sha256` от mac-артефакта;
- `Formula/startpozi-browser.rb`: `version`, `url`, `sha256` от AppImage.

```bash
shasum -a 256 "dist/StartPOZI Browser-<ver>-mac.zip"
shasum -a 256 "dist/StartPOZI Browser-<ver>.AppImage"
```

## 6. Проверка релиза

- [ ] `curl -s https://up.api.startpozi.com/latest.json` — валидный JSON,
      подпись (обновлённая предыдущая версия браузера должна предложить
      обновление и скачать файл);
- [ ] все ассеты релиза отвечают 200;
- [ ] `brew info --cask startpozi/tap/startpozi-browser` — новая версия;
- [ ] свежий профиль: первый запуск, новая вкладка, about:settings.
