# Settings Guide (EN)

Full reference for every **Settings → `about:settings`** section. Russian version: `docs/11-settings-guide.md`.

**Settings search**: the field at the top of the sidebar searches every card in the current language; Enter/click jumps to the card (the section lazy-loads, the card flashes). Russian queries match English terms («куки» → cookie). Deep link: `about:settings?q=cookie` (or `#q=`).

---

## Search

| Option | Description |
|---|---|
| Search engine | Default engine: StartPOZI, Google, DuckDuckGo, Bing or a custom URL with `?q=` |
| Search type | What the address bar and selection menu search by default: Web / Images / Videos / News / Maps |
| Onion search engines | While Tor is active, engines with `.onion` mirrors (StartPOZI, DuckDuckGo) are used inside the Tor network |
| Multi-search | Search several engines at once (`Alt+Enter`); built-in list + custom engines |
| Address bar suggestions | “Frequent sites” — origins opened 3+ times in 48h are suggested first (🔥); “Bookmarks” — bookmark matches in the bar. Both have toggles; **Clear remembered frequent sites** wipes the counters |

### Smart address bar
- **Bangs**: `g query` → Google, `d` → DuckDuckGo, `b` → Bing, `y` → YouTube, `w` → Wikipedia (browser language).
- **Open tabs**: the bottom of the suggestion list has an “Open tabs” section; Enter/click switches to the tab.
- **Commands**: typing `:` surfaces Quick Commands (~60 commands).

---

## Security (`about:security`)

### Privacy
| Toggle | Effect |
|---|---|
| URL cleaner | Strips tracking parameters (`utm_*`, `fbclid`, `gclid`, hundreds more) and unwraps redirect links |
| Sanitize URL | Warns about punycode domains (phishing) and credentials in URLs (`user:pass@site`) |
| WebRTC leak protection | Blocks real-IP leaks via WebRTC (important over VPN/Tor) |
| Fingerprint protection | Canvas/AudioContext noise, platform/languages/memory/WebGL spoofing |
| Letterboxing | Rounds the viewport to 200×100 so sites cannot read the real resolution |
| Block autoplay / notifications / geolocation | Media and prompts only after a click / denied |
| HTTPS-only | Auto-upgrades HTTP → HTTPS |
| Referrer policy | Only the origin is sent |
| Block 3rd-party cookies / mixed content | Cross-site cookies and HTTP content on HTTPS pages are blocked |
| Clear cookies on exit | All cookies (containers included) are wiped on close |

### Privacy presets & first run
The first-run wizard (fresh profiles only — no settings.json at process start; existing installs never see it) applies a global preset with one click: **Standard** (URL cleaning, DNT/GPC, light blocker lists), **Private** — default (+ anti-fingerprinting, WebRTC-leak block, HTTPS-only, 3rd-party cookie and mixed-content block, medium blocker preset) or **Maximum** (+ autoplay/notifications/geolocation/clipboard/WebGL blocks, site isolation, maximum blocker preset). It then offers to set a master password and open data import from your current browser. Every preset toggle remains individually editable in the table above.

### Tor Hardening (CSP switches)
Disable JavaScript, block WebGL, remote fonts, plugins (`object`/`embed`), external iframes, `<base>`.

### External services
Every endpoint is visible and toggleable: search suggestions (Google/Yandex/DDG/Bing), translator (translate.googleapis.com), password breach check (api.pwnedpasswords.com, k-anonymity — the password never leaves the device), connection diagnostics (check.torproject.org, ipapi.co, ipinfo.io, speed.cloudflare.com).

### SSL certificates
Trust management: your own root CAs, enabling/disabling the bundled Mozilla root store. Applies to Node-side TLS (downloads) and Chromium verification.

---

## Proxy / Tor (`about:proxy`)

- Types: HTTP, HTTPS, SOCKS4, SOCKS5, built-in Tor.
- Bridges: obfs4, snowflake, webtunnel; bootstrap progress, “New identity” (NEWNYM).
- Diagnostics: exit-IP, geo, speed — on demand (routed through the configured proxy).
- Watchdog: if the proxy dies it fails over to direct after a few probes and returns when it recovers — watch the indicator.

---

## Scripts (`about:scripts`)

User scripts `.skit`: manager, file import, enable/disable, error log. Package format and grants — see `docs/09-scripts.md` and `docs/12-developer-guide.md`.

---

## Customization (`about:themes`)

- Themes `.thmz` (ZIP: `theme.json` + `theme.css`), import/delete, instant preview.
- Theme editor: `about:themeeditor` — palettes, accents, export.
- Dark Reader — professional dark mode with per-site settings.
- Custom CSS for the browser UI.
- Toolbar: 27 buttons, drag & drop, configured via `about:customization`.
- New-tab widgets: clock, weather, calendar, quotes — each toggleable.

---

## Hotkeys / Vim (`about:hotkeys`)

All hotkeys plus Vim mode (hjkl navigation, `d`/`u` scroll, `/` find). Vim keys are remappable.

---

## Backup (`about:backup`)

- Export `.spzi`: full (with passwords; AES-256-GCM, password required) or secrets-free.
- Restore: pick a file, preview contents, apply.
- Auto-backup on exit (history/notes; passwords only in manual full backups).

---

## Profiles

Profiles with separate data (history, cookies, bookmarks) and an optional unlock password. Switch via the toolbar profile panel.

---

## Optimization

Tab sleeping (after N minutes), animation eco-freeze, Data Saver, Battery Saver, window transparency, process limits.

---

## Site Info (the lock in the address bar)

- Connection state: “You are connected over a secure connection” / warning.
- SSL certificate: protocol/cipher, issued to/by, validity — from the page's real connection.
- **Delete cookies and site data** — full origin reset (cookies, localStorage, IndexedDB, service workers, caches).
- **More page details**: title, address, type, render mode, encoding, size, referring URL, last modified, meta tags.
- Site permissions: JavaScript, cookies, camera/mic, notifications, geolocation (+ fake coordinates), clipboard and more.
