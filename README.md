<p align="center"><img src="logo.png" width="128" alt="StartPOZI Browser"></p>

<h1 align="center">StartPOZI Browser</h1>

<p align="center"><strong>An independent private browser based on Chromium (Electron).</strong><br>No telemetry, no hidden trackers — every default setting is tuned for privacy protection.</p>

<p align="center">
  <a href="https://github.com/StartPOZI/StartPOZI-Desktop-Browser/releases"><img src="https://img.shields.io/badge/version-1.0.0-blue" alt="Version 1.0.0"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-green" alt="GPL-3.0"></a>
  <img src="https://img.shields.io/badge/engine-Electron%20%2F%20Chromium-9feaf9" alt="Electron / Chromium">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey" alt="Windows | Linux | macOS">
</p>

## About

| | |
|---|---|
| **Version** | 1.0.0 (release [“Version 1.0”](https://github.com/StartPOZI/StartPOZI-Desktop-Browser/releases)) |
| **License** | [GPL-3.0](LICENSE) |
| **Engine** | Electron / Chromium |
| **Platforms** | Windows · Linux · macOS |
| **Website** | [startpozi.com](https://startpozi.com) |
| **Support the developers** | [startpozi.com/donate](https://startpozi.com/donate) ❤️ |

## Download

Ready-made builds are available on the [**Releases**](https://github.com/StartPOZI/StartPOZI-Desktop-Browser/releases) page (latest release — “Version 1.0”).

```
npm install
npm start        # run
npm test         # unit tests for pure modules (node --test)
npm run build    # build (electron-builder)
```

## Why StartPOZI is safe and private

**No telemetry.** The browser never sends usage statistics, crash reports, or analytics. Everything — filtering, blocking, history — happens locally on your machine. Every external service it can contact (filter updates, suggestions, translator, password breach checks) is listed in settings and can be disabled individually.

**Protection from trackers.**
- Ad and tracker blocking with 44 filter lists (EasyList, EasyPrivacy, uBlock Origin, AdGuard, HaGezi, Phishing Army…), each toggleable, with one-click Light / Medium / Maximum presets
- Cookie banners are rejected automatically (~70 providers, shadow DOM) — the “Accept” button is never clicked
- URLs are cleaned of hundreds of tracking parameters (`utm_*`, `fbclid`, `gclid`…) and known redirect chains are unwrapped
- Third-party cookies, `<a ping>`, and mixed HTTP content on HTTPS pages are blocked; DNT and Sec-GPC signals are sent; the referrer is trimmed to the origin only

**Resistance to fingerprinting.** Canvas and AudioContext readings get noise injected, viewport size is rounded (letterboxing) so your real screen resolution stays unknown, the reported platform matches your real OS instead of standing out, GPU/WebGL info is masked, and WebRTC cannot leak your local IP — even under VPN or Tor. Punycode domains and credentials embedded in URLs trigger phishing warnings.

**Network privacy.** Built-in Tor with obfs4 / snowflake / webtunnel bridges and a one-click “new identity”, HTTP/SOCKS4/SOCKS5 proxy support with exit-IP diagnostics, an automatic watchdog that falls back to a direct connection if the proxy dies, HTTPS-only mode, and site isolation that gives every domain its own separate cookies and storage.

**Your data is encrypted at rest.** Passwords are always stored encrypted — AES-256-GCM with a scrypt-derived key when you set a master password, or the OS keystore (Windows DPAPI, macOS Keychain, Linux libsecret) when you don’t. TOTP secrets and `.spzi` backups are encrypted too. Profile writes are atomic (in-memory cache + temp-file rename), so a crash or power loss can’t corrupt your data.

**A hardened engine.** Electron is locked down: `contextIsolation` everywhere and `nodeIntegration: false`; internal pages can only call APIs they’ve been granted per-page (passwords are reachable from Settings/Library only); secret IPC channels (passwords, vault, TOTP) sit behind a double gate — a capability filter in the preload plus sender re-validation in the main process (`_isSecretsSender`); `will-attach-webview` enforces safe webview attributes; and anything not explicitly allowed is denied (fail-closed).

**One-click presets.** The first-run wizard offers Standard / Private (default) / Maximum privacy presets — or you can fine-tune every switch individually in Settings → Security.

## Privacy

- **Ad blocker** powered by the [FilterHub](https://github.com/StartPOZI/FilterHub) catalog: 44 lists (EasyList/EasyPrivacy, uBlock Origin, AdGuard, HaGezi, Phishing Army…), each toggleable, with Light / Medium (default) / Maximum presets; lists with the ABP `! Checksum:` header are verified on download — protection against corrupted or truncated downloads (MD5 checksum): a mismatched copy is discarded and the cached one is used; HTTPS transport protects against deliberate tampering (an attacker recomputing the checksum)
- **Automatic cookie-banner rejection** (~70 providers, shadow DOM, the “Accept” button is never clicked)
- **Tor with bridges** (obfs4 / snowflake / webtunnel) and HTTP/SOCKS4/SOCKS5 proxies with exit-IP diagnostics; a watchdog automatically falls back to a direct connection when the proxy goes down and switches back once it recovers
- **Automatic cookie deletion on exit** (optional); incognito mode writes no history/downloads and cannot see the shared ones
- **Anti-fingerprinting**: Canvas/AudioContext noise, letterboxing, platform spoofing matched to the real OS, WebRTC leak blocking
- **Google sign-in works**: on login pages the browser identifies itself as Firefox (Google skips Chrome attestation for a Firefox UA)
- **Managed external services**: suggestions, translator, password breach checks, diagnostics — every endpoint is visible and can be disabled in settings
- DNT + Sec-GPC, `<a ping>` blocking, URL cleaning of hundreds of tracking parameters, ephemeral block log

## Passwords

- Always encrypted on disk: with a master password — AES-256-GCM + scrypt; without one — OS storage (DPAPI / Keychain / libsecret)
- TOTP 2FA codes, breach checking (HIBP k-anonymity), biometrics, strength audit, import from browsers and Google Authenticator
- `.spzi` backups with AES-256-GCM encryption

## Features

First-run wizard with privacy presets (Standard / Private / Maximum) · Quick Commands (~60 commands) · Vim mode · multi-search · workspaces and containers · tab hibernation and eco-freeze · split view · offline OCR · offline TTS · hover translate · element zapper · annotated screenshots · task manager · `.thmz` themes and custom CSS · 27 toolbar buttons (drag & drop) · new-tab widgets · update checks via GitHub Releases

## Architecture security

`contextIsolation` + `nodeIntegration: false` everywhere · per-page API permissions for internal pages (passwords — Settings/Library only) · **double gate on secret IPC: capability filter in preload + sender re-validation in the main process (`_isSecretsSender`)** · `will-attach-webview` enforces safe attributes · atomic storage writes (in-memory cache + tmp/rename) · fail-closed permissions

## Internal pages

| Address | Page |
|---|---|
| `about:settings` / `about:preferences` | Settings |
| `about:library` | Library (history, bookmarks, downloads, passwords, cookies) |
| `about:newtab` / `about:home` | New tab |
| `about:taskmanager` | Task manager |
| `about:viewer` | Local file viewer |
| `about:tor` / `about:proxy` | Proxy and Tor |
| `about:hotkeys` / `about:vim` | Hotkeys and Vim |
| `about:backup` | Backups |
| `about:help` | Help (RU + EN) |

Full documentation — in [docs/](docs/) (RU + [EN](docs/en/)).

## Support the developers ❤️

StartPOZI Browser is a free and open-source browser (GPL-3.0). Development, blocklist updates, and infrastructure exist thanks to user support.

**Support the project:** → **[startpozi.com/donate](https://startpozi.com/donate)**

Every contribution goes toward new features, filter updates, and keeping the project’s services running.

## Build

Requires Node.js. Platforms: Windows, Linux, macOS.

```
npm run build
```

Build artifacts end up in `dist/`.

## License

[GPL-3.0](LICENSE) — the full license text is in the [LICENSE](LICENSE) file. Individual block lists retain the licenses of their sources (see [FilterHub](https://github.com/StartPOZI/FilterHub)).

© 2026 StartPOZI Project
