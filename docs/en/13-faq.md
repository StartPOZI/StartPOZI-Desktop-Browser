# FAQ (EN)

Russian version: `docs/13-faq.md`. Quick help is also built into the browser: `about:help`.

---

## Privacy

**Where does my data go?**
History, bookmarks, passwords, frequent-site counters — your device only. Only optional services touch the network (search suggestions, translator, HIBP breach check, connection diagnostics) — each can be disabled in Settings → Security → External services.

**Why does something hit the network as I type in the address bar?**
Those are search suggestions. Disable: Settings → Security → External services → Search suggestions. They are independent of frequent sites/bookmarks (Settings → Search → Address bar suggestions).

**What is the 🔥 in address-bar suggestions?**
“Frequent sites”: origins opened 3+ times in the last 48 hours. Toggle and clear them via Settings → Search → Address bar suggestions → Clear remembered frequent sites.

**Does Tor really hide all traffic?**
All browser traffic goes through the Tor SOCKS5 proxy (DNS included). Verify: about:tor → exit-IP diagnostics. If Tor dies, the watchdog fails over to a direct connection — watch the indicator.

**How do I wipe one site's data?**
Lock icon in the address bar → “Delete cookies and site data”. Removes cookies (incl. domain-wide), localStorage, IndexedDB, service workers, caches — for that domain only, in the current tab's session.

## Browser usage

**Google sign-in fails or demands verification?**
On login pages the browser identifies as Firefox so Google skips Chrome attestation. If it still fails: Site Info → delete site data → reload and retry.

**How do I reopen a closed tab?**
`Ctrl+Shift+T`, or Quick Commands (`Ctrl+Shift+P`) → `undo`.

**How do I find a tab among many?**
Start typing in the address bar — an “Open tabs” section appears at the bottom of the list. There is also Search tabs (`about:taskmanager` and a toolbar button).

**Quick search in a specific engine?**
Bangs: `g query` (Google), `d` (DuckDuckGo), `b` (Bing), `y` (YouTube), `w` (Wikipedia).

**A site is slow. Where do I look?**
`about:taskmanager` — per-tab CPU/memory. Tab sleeping and eco-freeze live in Settings → Optimization.

**DRM video (Netflix) does not play?**
Install the Widevine runtime: `npm run drm:setup` (from source) or enable DRM in the build. Stock Electron ships no CDM.

## Passwords & backups

**I forgot the vault master password.**
Decryption is impossible (AES-256-GCM + scrypt, no stored key). Restore from a password-protected `.spzi` backup if one exists.

**Is the breach check safe?**
Yes: HIBP k-anonymity — only the first 5 characters of the SHA-1 hash leave the device; the password itself never does.

**Full backup vs secrets-free?**
A full `.spzi` includes passwords and TOTP and is AES-256-GCM encrypted (password required). Secrets-free keeps history/settings/notes without passwords.

## Themes & scripts

**How do I install a theme?**
Settings → Customization → Themes → Import theme → a `.thmz` file. Or build your own: `about:themeeditor`.

**Can a theme/script steal data?**
Themes: no — remote resources in CSS are rejected. `.skit` scripts: grants are declared in the manifest (`storage`/`clipboard`/`notifications`), undeclared APIs are unavailable, unknown grants fail the import. Only install scripts from trusted sources.

**A script does not fire.**
Check: the `match` pattern covers the URL, the script is enabled in about:scripts, and see the error log there.

## Updating

**How do I update?**
Settings → About → check for updates (GitHub Releases). Installing over the old copy preserves your data.
