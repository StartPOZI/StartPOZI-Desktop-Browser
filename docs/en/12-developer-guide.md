# Developer Guide (EN)

Architecture, extending the browser, package formats. Russian version: `docs/12-developer-guide.md`.

---

## Running & building

```bash
npm install
npm start        # run from source
npm test         # unit tests for pure modules (node --test)
npm run build    # package with electron-builder → dist/
npm run drm:setup # Widevine runtime (Netflix etc.) into .drm/ (optional)
```

## Architecture

```
main.js             — main process (~11.5k lines): windows, IPC, security,
                      Tor, passwords/backups, blocker, CDP tracking
renderer.js         — UI (~15k lines): tabs, omnibox, panels, QC
preload.js          — IPC bridge of the main window (contextBridge)
preload-webview.js  — webview bridge with per-page API capabilities
storage.js          — atomic settings storage (cache + tmp/rename)
certstore.js        — TLS verification (Mozilla roots + user CAs)
adblocker.js        — blocking engine (FilterHub, ABP checksums)
i18n.js, locales/   — translations (ru.json, uk.json)
lib/                — pure modules (skit-manifest, url-cleaner, …) + test/
Help.html           — built-in help (about:help), RU/EN
docs/               — documentation (RU + docs/en/ EN)
```

### Security model
- `contextIsolation: true`, `nodeIntegration: false` everywhere; `will-attach-webview` pins attributes.
- Per-page API capabilities in `preload-webview.js`: secrets only for `settings.html`/`library.html`, proxy/Tor control only for Settings.
- **Secrets IPC channels are re-validated in the main process** (`_isSecretsSender`, main.js): 46 channels — all password CRUD, vault/master password, TOTP, Library/Settings/Backup protection, export/import, HIBP. Senders — Settings/Library only; the `index.html` shell additionally gets autofill, appLock, the first-run wizard and master-password setup. Denials are logged as `[vault] secrets IPC denied`.
- First run: a 4-step wizard (preset → master password → import → done) in `renderer.js`/`index.html` (`#firstRunWizard`); channels `get-first-run` / `finish-first-run` / `apply-privacy-preset`; `firstRunDone` flag in settings.json.
- CSP on every internal page; fail-closed permissions.
- CDP (debugger) powers the UA override and Site Info SSL data; it is detached on Google auth pages (BotGuard anti-detection).

### Adding an internal page
1. Create `MyPage.html` in the project root (CSP meta like Settings.html).
2. `renderer.js → _isInternalPageUrl()` — add the file name.
3. `resolveLocalUrl()` → `aboutMap` — alias `about:mypage` → `MyPage.html`.
4. `_internalUrlToAbout()` — reverse mapping for the address bar display.
5. Menu entry: `bind('hmXxx', () => createNewTab('MyPage.html'))`.
6. If the page needs secret APIs — add it to `secretsPages` in `preload-webview.js` (deliberately!) and **also** add the page to the `_isSecretsSender` allowlist in main.js — otherwise the main process rejects the calls.

---

## User scripts .skit

Package = ZIP: `script.json` + `script.js` (see `docs/09-scripts.md`).

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

- `match` — URL patterns (comma-separated); `runAt` — `document-start|end|idle`.
- `permissions` — only `storage`, `clipboard`, `notifications` (unknown names fail the import).
- Scripts get an `SKit` shim with the declared APIs; undeclared ones are `null`.
- Import: Settings → Scripts → Import (manifest validation, path traversal in `main` rejected).

## Themes .thmz

ZIP: `theme.json` (`name/author/version/description/type: dark|light|auto`) + `theme.css` (CSS variables for `:root`, `body.theme-dark/light`). Import: Settings → Customization. Remote resources in CSS are rejected — colors/local urls only.

## New-tab widgets

`MainPage/Widgets/<name>/` — `metadata.json` (id, name, size, default-enabled) + html/js. Widgets run sandboxed; external requests only through toggleable services.

---

## Omnibox: how suggestions work

`renderer.js → updateSuggestions(query)` assembles the list in this order:
1. Bang preview (`g|d|b|y|w query`) — resolved via `resolveLocalUrl`.
2. Frequent sites 🔥 (origin ≥3 visits in 48h; `_frequentSites` cache, recorded via IPC `record-frequent-visit` from `did-navigate`, non-incognito only).
3. Bookmarks ★ (gated by `omniboxBookmarkSuggestions`).
4. History 🕘.
5. Quick Commands (if Unified Bar is on).
6. **Open tabs** 🗂 — at the bottom after a divider; items use URL `__tab__:<id>` → `setActiveTab`.
7. Async search hints (gated by `suggestEnabled` in main).

Gate settings are read through `getSecuritySetting('omniboxFrequentSuggestions'|'omniboxBookmarkSuggestions')` — opt-out (absent = enabled).

## Site Info data

- Certificate/metadata: main.js `_trackSecurityDetails` (CDP `Network.responseReceived` → `_secInfoByWc`), served by `get-page-security-info(wcId)`.
- Page facts: `tab.webview.executeJavaScript(...)` — title, compatMode, charset, referrer, lastModified, meta tags.
- Wipe: `clear-site-data(wcId, url)` — cookies (manual domain-wide sweep) + `clearStorageData` per origin in the tab's session.

---

## Tests & style

- `node --test` — tests in `test/` (pure modules). Run: `npm test`.
- Before committing: `node --check` changed JS files + `npm test`.
- Style: ES5-compatible code in renderer/preload (no arrows/let in hot preload paths), `'use strict'` in lib/ modules.
- Comments explain “why”, not “what” — keep the tradition.
