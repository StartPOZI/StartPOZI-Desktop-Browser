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
