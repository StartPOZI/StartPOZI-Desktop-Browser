const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard, nativeImage, session, webContents } = require('electron');
const { app: electronApp } = require('electron');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const adblocker = require('./adblocker');
// Embedded Mozilla CA root bundle (cacert.pem): trusted IN ADDITION to the
// Chromium root store by the certificate verify procs below, and used as the
// CA list for Node-side https requests (downloads, save-image).
const certstore = require('./certstore');
// Shared cookie-banner blocker payload — same function the renderer injects
// into the top document; here it is injected into EVERY frame (see the
// 'inject-cookie-blocker-frames' handler).
var _cookieBlockerPayload = null;
try { _cookieBlockerPayload = require('./cookie-blocker-payload'); } catch (e) {}
let AdmZip;
try { AdmZip = require('adm-zip'); } catch(e) { AdmZip = null; }

var _lastRejectionLogAt = 0;
process.on('unhandledRejection', function(reason) {
  // Rate-limited logging: silent swallowing hid real bugs (lost writes, broken
  // IPC), but unlimited logging would spam the console on cascading failures.
  var now = Date.now();
  if (now - _lastRejectionLogAt < 5000) return;
  _lastRejectionLogAt = now;
  try { console.error('[unhandledRejection]', reason); } catch(e) {}
});
require('events').EventEmitter.defaultMaxListeners = 50;

(function checkCustomDataPath() {
  var fs2 = require('fs');
  var settingsFile = path.join(app.getPath('userData'), 'settings.json');
  try {
    if (fs2.existsSync(settingsFile)) {
      var data = JSON.parse(fs2.readFileSync(settingsFile, 'utf8'));
      if (data.customDataPath) {
        app.setPath('userData', data.customDataPath);
      }
    }
  } catch(e) {}
  var cliArg = process.argv.find(function(a) { return a.startsWith('--user-data-path='); });
  if (cliArg) {
    var p = cliArg.split('=').slice(1).join('=');
    if (p) app.setPath('userData', p);
  }
})();

// Privacy: remove leftover diagnostics log that recorded requests to Google
// (headers + JS-probe of navigator properties). The diagnostic code has been
// removed; this wipes any pre-existing file from earlier versions.
(function _purgeStaleDiagnostics() {
  try {
    var staleLog = path.join(app.getPath('userData'), 'google-headers-debug.log');
    if (fs.existsSync(staleLog)) fs.unlinkSync(staleLog);
  } catch(e) {}
})();

let mainWindow;

var _pendingDialogs = {};
var _pendingPermRequests = {};
// Per-session (until browser restart) permission grants from the popup's
// "Allow while on this site" button. Cleared on app quit. Not persisted to disk.
// Shape: { [domain]: { [permissionCamel]: true } }
var _sessionPermissions = {};
// In-memory geo-override coordinates per domain (set via Site Info panel).
// Shape: { [domain]: { lat:Number, lng:Number, accuracy:Number } }
var _geoOverrides = {};

// Cached per-site permission overrides from settings.json (kept in memory —
// reading settings.json on every request would be far too slow). Used by the
// per-site JavaScript/Cookies toggles in the Site Info panel.
// Shape: { [domain]: { javascript: true|false, cookies: true|false, ... } }
var _sitePermCache = {};
function _refreshSitePermCache() {
  try { _sitePermCache = readStorage().sitePermissions || {}; }
  catch(e) { _sitePermCache = {}; }
}
// Look up a per-site permission, walking up subdomains
// (a.b.example.com → b.example.com → example.com).
function _sitePermFor(hostname, key) {
  if (!hostname) return undefined;
  try {
    var v = _sitePermCache[hostname];
    if (v && v[key] !== undefined) return v[key];
    var parts = hostname.split('.');
    for (var i = 1; i < parts.length - 1; i++) {
      v = _sitePermCache[parts.slice(i).join('.')];
      if (v && v[key] !== undefined) return v[key];
    }
  } catch(e) {}
  return undefined;
}
// Per-site cookie blocking (Site Info panel): drop the Cookie request
// header for hosts the user set to "block cookies".
function _stripSiteCookies(details, headers) {
  try {
    if (!headers) return;
    var host = '';
    try { host = new URL(details.url).hostname; } catch(e) { return; }
    if (_sitePermFor(host, 'cookies') === false) {
      delete headers['Cookie'];
    }
  } catch(e) {}
}

// ============== CRASH-SAFE SESSION DETECTION ==============
// A marker file is created on every launch and removed on a clean quit
// (before-quit / window-all-closed). If it is still present at the next
// launch, the previous session ended abnormally (crash, kill, power loss) —
// the renderer then restores the auto-saved tabs (autoSaveTabs runs every
// 30 s in the renderer).
var _sessionMarkerPath = path.join(app.getPath('userData'), 'session-active');
var _lastSessionCrashed = false;
(function detectCrashedSession() {
  try {
    if (fs.existsSync(_sessionMarkerPath)) _lastSessionCrashed = true;
    // The userData directory may not exist yet on a fresh profile (we run
    // before Electron creates it) — create it explicitly, otherwise
    // writeFileSync throws ENOENT and crash detection silently never arms.
    fs.mkdirSync(path.dirname(_sessionMarkerPath), { recursive: true });
    fs.writeFileSync(_sessionMarkerPath, String(Date.now()));
  } catch(e) {}
})();
function _clearSessionMarker() {
  try { if (fs.existsSync(_sessionMarkerPath)) fs.unlinkSync(_sessionMarkerPath); } catch(e) {}
}
ipcMain.handle('get-last-session-crashed', () => _lastSessionCrashed);

// Sandbox preloads have no __dirname — the webview preload asks the main
// process for the app directory to gate the electronAPI exposure to pages
// that ship with the browser (see preload-webview.js).
ipcMain.on('spz-get-app-dir', (event) => { event.returnValue = __dirname; });

// ============== OFFLINE TTS (espeak-ng WASM worker) ==============
// Speech synthesis without any system voices (fresh Linux, minimal Windows,
// headless setups). Runs in a utilityProcess — WASM synthesis blocks its
// thread for 100–400 ms per chunk and must never touch the main process.
// Jobs are serialized through a single queue; the renderer prefetches the
// next chunk while the current one plays.
var _ttsWorker = null;
var _ttsWorkerStarting = false;
var _ttsJobId = 1;
var _ttsPending = new Map(); // id → {resolve, reject, timer}

function _ttsEnsureWorker() {
  if (_ttsWorker) return Promise.resolve();
  if (_ttsWorkerStarting) return _ttsWorkerStarting;
  _ttsWorkerStarting = new Promise(function (resolve, reject) {
    try {
      const { utilityProcess } = require('electron');
      _ttsWorker = utilityProcess.fork(path.join(__dirname, 'tts-worker.js'), [], {
        serviceName: 'spz-tts',
        stdio: 'ignore'
      });
      var settled = false;
      _ttsWorker.once('spawn', function () { settled = true; resolve(); });
      _ttsWorker.once('exit', function (code) {
        _ttsWorker = null;
        // Fail all in-flight jobs — their promises would hang forever.
        _ttsPending.forEach(function (job) {
          clearTimeout(job.timer);
          job.reject(new Error('TTS worker exited (' + code + ')'));
        });
        _ttsPending.clear();
        if (!settled) { settled = true; reject(new Error('TTS worker failed to start')); }
      });
      _ttsWorker.on('message', function (msg) {
        var job = _ttsPending.get(msg && msg.id);
        if (!job) return;
        _ttsPending.delete(msg.id);
        clearTimeout(job.timer);
        if (msg.ok) job.resolve(msg.wav);
        else job.reject(new Error(msg.error || 'synthesis failed'));
      });
    } catch (e) { reject(e); }
  }).finally(function () { _ttsWorkerStarting = null; });
  return _ttsWorkerStarting;
}

// Serialize synth requests: one at a time keeps WASM memory bounded and
// preserves ordering for the renderer's prefetch logic.
var _ttsQueueTail = Promise.resolve();
function _ttsSynthesizeQueued(text, lang, rate) {
  var run = function () {
    return _ttsEnsureWorker().then(function () {
      return new Promise(function (resolve, reject) {
        var id = _ttsJobId++;
        var timer = setTimeout(function () {
          _ttsPending.delete(id);
          reject(new Error('TTS synthesis timeout'));
        }, 15000);
        _ttsPending.set(id, { resolve: resolve, reject: reject, timer: timer });
        try { _ttsWorker.postMessage({ id: id, cmd: 'synth', text: text, lang: lang, rate: rate }); }
        catch (e) { clearTimeout(timer); _ttsPending.delete(id); reject(e); }
      });
    });
  };
  _ttsQueueTail = _ttsQueueTail.then(run, run);
  return _ttsQueueTail;
}

ipcMain.handle('tts-synthesize', async (_, text, lang, rate) => {
  try {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'empty text' };
    var wav = await _ttsSynthesizeQueued(text, String(lang || ''), Number(rate) || 1);
    return { ok: true, wav: wav };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});
ipcMain.handle('tts-offline-available', () => {
  try { require.resolve('espeak-ng'); return { ok: true, available: true }; }
  catch (e) { return { ok: true, available: false }; }
});
app.on('before-quit', function () {
  if (_ttsWorker) { try { _ttsWorker.postMessage({ cmd: 'shutdown' }); } catch (e) {} }
});

// "Clear cookies on exit" (Settings → Security): wipe cookies of the default
// session and all container partitions when the browser closes. Incognito
// partitions are in-memory and are destroyed automatically.
app.on('will-quit', function (event) {
  try {
    var store = readStorage();
    if (!(store.security && store.security.clearCookiesOnExit)) return;
    event.preventDefault();
    var sessionsToClear = [session.defaultSession];
    try {
      (store.containers || []).forEach(function (c) {
        if (c && c.id) {
          try { sessionsToClear.push(session.fromPartition('persist:container-' + c.id)); } catch (e0) {}
        }
      });
    } catch (e1) {}
    Promise.all(sessionsToClear.map(function (ses) {
      try { return ses.clearStorageData({ storages: ['cookies'] }); } catch (e2) { return Promise.resolve(); }
    })).then(function () { app.exit(0); }, function () { app.exit(0); });
  } catch (e) {
    // Never trap the user in a quitting app because of a cleanup failure.
  }
});

// Disable KWallet and other password prompts
app.commandLine.appendSwitch('password-store', 'basic');
app.commandLine.appendSwitch('use-mock-keychain');
app.commandLine.appendSwitch('autoplay-policy', 'user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'PasswordPeak,PasswordImport,PasswordExport,MediaRouter,RawDraw');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,IntensiveWakeUpThrottling');
// Anti-detection: remove the webdriver flag, otherwise Google and others detect automation
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
// Privacy: disable hyperlink auditing (<a ping="..."> beacon tracking)
app.commandLine.appendSwitch('disable-hyperlink-auditing');

// === Tor DNS hardening (host-resolver-rules) ===
// EXPERIMENTALLY VERIFIED (mock SOCKS5 server, Electron 42): Chromium sends
// the DOMAIN NAME to SOCKS5 proxies (ATYP=0x03 — SOCKS5h behaviour) by
// default, so proxies and .onion work even with local DNS available.
// The flag's only remaining value is suppressing DNS-prefetch leaks in full
// Tor mode — worth it ONLY there, because while the flag is active the
// browser cannot resolve anything directly: turning the proxy/VPN off later
// black-holes every request until a restart (the dead-proxy watchdog offers
// one). Regular proxies (http/https/socks, e.g. VPN) never get the flag —
// disabling them switches to a working direct connection immediately.
// The flag can ONLY be set before app.whenReady().
//
// Strategy: proxy.json enabled AND type 'tor' → set the flag. Otherwise no.
var _startupTorDetected = null; // { host, port } or null
var _dnsThroughProxyActive = false; // host-resolver-rules ~NOTFOUND is active
(function applyDnsThroughProxyFlag() {
  try {
    var fs3 = require('fs');
    var needsTorHardening = false;

    // Only an explicit Tor configuration gets the DNS lockdown.
    var proxyFile = path.join(app.getPath('userData'), 'proxy.json');
    if (fs3.existsSync(proxyFile)) {
      try {
        var proxy = JSON.parse(fs3.readFileSync(proxyFile, 'utf-8'));
        if (proxy && proxy.enabled && proxy.host && proxy.type === 'tor') needsTorHardening = true;
      } catch(e) {}
    }

    if (needsTorHardening) {
      // NOTE: Chromium's host-resolver-rules parser treats each comma-
      // separated segment as a FULL rule, so 'EXCLUDE a,b,c' fails to parse
      // ('Failed parsing rule: b'). Each excluded host needs its own EXCLUDE
      // clause, otherwise localhost/::1 DNS breaks while Tor is active.
      app.commandLine.appendSwitch('host-resolver-rules',
        'MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE 127.0.0.1 , EXCLUDE ::1');
      app.commandLine.appendSwitch('proxy-bypass-list', '<-loopback>');
      // Command-line switches cannot be unset at runtime: while this flag is
      // active the browser CANNOT resolve DNS directly, so turning Tor off
      // later requires a restart (see _offerDirectRelaunch + watchdog).
      _dnsThroughProxyActive = true;
    }

    // === DNS-over-HTTPS (DoH) ===
    // Only when NO proxy/Tor is active: with SOCKS5 all DNS must go through
    // the proxy (see above); enabling DoH on top would leak queries to the
    // DoH provider outside the tunnel. Can only be set before app ready.
    if (!needsProxyDns) {
      try {
        var settingsFile = path.join(app.getPath('userData'), 'settings.json');
        if (fs3.existsSync(settingsFile)) {
          var _early = JSON.parse(fs3.readFileSync(settingsFile, 'utf8'));
          var doh = _early && _early.doh;
          if (doh && doh.enabled && doh.server && /^https:\/\//.test(doh.server)) {
            app.commandLine.appendSwitch('dns-over-https-mode', doh.mode === 'secure' ? 'secure' : 'automatic');
            app.commandLine.appendSwitch('dns-over-https-templates', doh.server);
          }
        }
      } catch(e2) {}
    }
  } catch(e) {}
})();

// Chrome-compatible User-Agent.
// IMPORTANT: the Chrome version in the UA must MATCH the real Chromium version
// in this Electron build, otherwise Google sees a mismatch between the UA and the real
// engine (feature detection, V8 fingerprint) and blocks login with the message
// "This browser or app may not be secure".
// So we take the version DYNAMICALLY from process.versions.chrome.
var _chromeFullVersion = (process.versions && process.versions.chrome) || '148.0.7778.96';
var _chromeMajorVersion = _chromeFullVersion.split('.')[0];
var _uaPlatform = process.platform === 'win32' ? 'Windows'
  : process.platform === 'darwin' ? 'macOS' : 'Linux';
var _uaPlatformString = process.platform === 'win32'
  ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + _chromeFullVersion + ' Safari/537.36'
  : process.platform === 'darwin'
  ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + _chromeFullVersion + ' Safari/537.36'
  : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + _chromeFullVersion + ' Safari/537.36';
try { app.userAgentFallback = _uaPlatformString; } catch(e) {}

// sec-ch-ua brands — we pretend to be Google Chrome, not Electron.
// This is CRITICAL for Google login: by default Electron sends the brand "Electron",
// and Google blocks login with the message "This browser or app may not be secure".
// IMPORTANT: the version must match the real Chromium (_chromeFullVersion),
// otherwise Google sees a mismatch with the engine.
var _secChUaBrands = '"Chromium";v="' + _chromeMajorVersion + '", "Not:A-Brand";v="24", "Google Chrome";v="' + _chromeMajorVersion + '"';
// Full brand versions for sec-ch-ua-full-version-list. Google sends Accept-CH
// and expects this header from real Chrome. Previously it was removed, which in itself
// is suspicious. Now the versions match the engine — we send it like Chrome.
var _secChUaFullVersionList = '"Chromium";v="' + _chromeFullVersion + '", "Not:A-Brand";v="24.0.0.0", "Google Chrome";v="' + _chromeFullVersion + '"';

// === Engine-level User-Agent override via CDP (Emulation.setUserAgentOverride) ===
// The JS-level spoof of navigator.userAgentData (in preload-webview.js) is applied
// via webFrame.executeJavaScript, which is ASYNC — Google's BotGuard, which loads
// very early, can read navigator.userAgentData BEFORE the patch lands and see the
// real "Electron" brand → "This browser or app may not be secure".
// CDP's Emulation.setUserAgentOverride sets navigator.userAgent AND
// navigator.userAgentData (via userAgentMetadata) AT THE ENGINE LEVEL, before any
// page script runs, so there is no race. This is the same mechanism Chrome's
// DevTools "Network conditions → custom UA" uses.
function _buildUAOverrideMetadata() {
  var platformVersion = _uaPlatform === 'Windows' ? '15.0.0'
    : _uaPlatform === 'macOS' ? '10.15.7' : '6.5.0';
  return {
    brands: [
      { brand: 'Chromium', version: _chromeMajorVersion },
      { brand: 'Not:A-Brand', version: '24' },
      { brand: 'Google Chrome', version: _chromeMajorVersion }
    ],
    fullVersionList: [
      { brand: 'Chromium', version: _chromeFullVersion },
      { brand: 'Not:A-Brand', version: '24.0.0.0' },
      { brand: 'Google Chrome', version: _chromeFullVersion }
    ],
    fullVersion: _chromeFullVersion,
    platform: _uaPlatform,
    platformVersion: platformVersion,
    architecture: 'x86',
    bitness: '64',
    model: '',
    mobile: false,
    wow64: false
  };
}
var _uaOverrideApplied = new WeakSet();
// Login pages where even an ATTACHED DEBUGGER is a detection signal for
// Google (BotGuard flags CDP-attached targets). There we use the
// debugger-free path: wc.setUserAgent (navigator.userAgent + request UA),
// the preload's userAgentData patch and per-request sec-ch-ua rewriting.
// Must stay in sync with _isSensitiveAuthPage() in preload-webview.js.
function _isAuthSensitiveUrl(url) {
  try {
    var h = new URL(url).hostname.toLowerCase();
    return /(^|\.)accounts\.google\.com$/.test(h) ||
           /(^|\.)myaccount\.google\.com$/.test(h) ||
           /(^|\.)passwords\.google\.com$/.test(h) ||
           /(^|\.)signin\.google\.com$/.test(h) ||
           /(^|\.)pay\.google\.com$/.test(h) ||
           /(^|\.)wallet\.google\.com$/.test(h) ||
           /(^|\.)accounts\.youtube\.com$/.test(h) ||
           /(^|\.)appleid\.apple\.com$/.test(h) ||
           /(^|\.)login\.live\.com$/.test(h) ||
           /(^|\.)login\.microsoftonline\.com$/.test(h);
  } catch (e) { return false; }
}
function _applyUAOverrideViaDebugger(webContents, destUrl) {
  try {
    if (!webContents || webContents.isDestroyed()) return;
    // Prefer the navigation DESTINATION: at did-start-loading getURL() still
    // returns the PREVIOUS page — wrong moment for the auth decision.
    var curUrl = (typeof destUrl === 'string' && destUrl) || (webContents.getURL ? webContents.getURL() : '');
    // Re-attach whenever detached (e.g. user opened DevTools on the tab):
    // a one-shot WeakSet gate left the override silently dead afterwards.
    try {
      if (!webContents.debugger.isAttached()) webContents.debugger.attach('1.3');
    } catch (e) { /* devtools or already attached */ }
    _uaOverrideApplied.add(webContents);
    webContents.once('destroyed', function () {
      try { _uaOverrideApplied.delete(webContents); } catch (e) {}
      try { _uaProfileByWc.delete(webContents.id); } catch (e) {}
    });
    var wcId = webContents.id;
    if (_isAuthSensitiveUrl(curUrl)) {
      // Firefox profile for login pages (see _firefoxUa). ALWAYS via CDP:
      // webContents.setUserAgent RESTARTS an in-flight navigation and
      // getUserAgent() does not reflect it in time — that combination caused
      // an infinite reload loop. The CDP override is instant and never
      // restarts a load. No userAgentMetadata (Firefox has no UA-CH); the
      // preload (installFirefoxProfile) removes userAgentData/window.chrome.
      _uaProfileByWc.set(wcId, 'ff');
      webContents.debugger.sendCommand('Emulation.setUserAgentOverride', {
        userAgent: _firefoxUa
      }).catch(function () {});
      return;
    }
    _uaProfileByWc.set(wcId, 'chrome');
    webContents.debugger.sendCommand('Emulation.setUserAgentOverride', {
      userAgent: _uaPlatformString,
      platform: _uaPlatform,
      userAgentMetadata: _buildUAOverrideMetadata()
    }).catch(function () {});
  } catch (e) {}
}

// ============================================================================
// PERMISSION REQUEST HANDLER (unified)
// ----------------------------------------------------------------------------
// Single source of truth for setPermissionRequestHandler. Used both from
// createWindow() and applySecuritySettings() so security toggles no longer
// overwrite the per-site popup logic.
//
// Resolution order (first match wins):
//   1. Internal StartPOZI pages (Settings/MainPage/ErrorPage) → always allow
//   2. Global security toggles (autoplayBlock, blockNotifications,
//      blockGeolocation) → deny
//   3. Persistent per-site decisions in settings.json (true/false)
//   4. Session grants ("Allow while on this site") — in-memory only
//   5. Otherwise → ask the user via 'permission-request' IPC → popup
// ============================================================================
// Normalise Chromium permission names to canonical camelCase keys that match
// what is stored in settings.json and shown in the Site Info panel.
function _normalisePermKey(permission) {
  var p = String(permission || '');
  // kebab → camelCase (clipboard-read → clipboardRead)
  if (p.indexOf('-') > -1) {
    return p.replace(/-([a-z])/g, function(_, c) { return c.toUpperCase(); });
  }
  return p;
}

function _isInternalPage(url) {
  try {
    if (!url) return false;
    if (url.indexOf('file://') !== 0) return false;
    // Internal pages must live inside the app directory — a downloaded file
    // merely NAMED "Settings.html" must not inherit internal-page powers.
    var _appDir = __dirname.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
    var _p = '';
    try { _p = decodeURIComponent(new URL(url).pathname); } catch (e) { _p = url; }
    _p = _p.replace(/\\/g, '/').toLowerCase().replace(/^\/(?=[a-z]:)/, '');
    // Resolve dot segments so /app-dir/../evil/x.html cannot pass the check.
    var _isDrivePath = /^[a-z]:/.test(_p);
    var _segs = _p.split('/');
    var _norm = [];
    for (var _si = 0; _si < _segs.length; _si++) {
      var _s = _segs[_si];
      if (_s === '.' || _s === '') continue;
      if (_s === '..') { if (_norm.length) _norm.pop(); continue; }
      _norm.push(_s);
    }
    _p = (_isDrivePath ? '' : '/') + _norm.join('/');
    if (!(_p === _appDir || _p.indexOf(_appDir + '/') === 0)) return false;
    return url.indexOf('Settings.html') > -1 ||
      url.indexOf('MainPage/index.html') > -1 ||
      url.indexOf('ErrorPage/index.html') > -1 ||
      url.indexOf('ErrorPage/security.html') > -1 ||
      url.indexOf('IncognitoPage.html') > -1 ||
      url.indexOf('MainPage/IncognitoPage.html') > -1 ||
      url.indexOf('TaskManager.html') > -1 ||
      url.indexOf('Library.html') > -1 ||
      url.indexOf('CustomizeToolbar.html') > -1;
  } catch(e) { return false; }
}

function _makePermissionHandler(sec) {
  sec = sec || {};
  return function(webContents, permission, callback) {
    try {
      var url = webContents ? webContents.getURL() : '';
      var domain = '';
      try { domain = url ? new URL(url).hostname : ''; } catch(e) {}

      // (1) Internal pages always get full access.
      if (_isInternalPage(url)) { callback(true); return; }

      var permKey = _normalisePermKey(permission);

      // (2) Global security toggles take priority over per-site decisions.
      // NOTE: autoplayBlock is intentionally NOT mapped to the 'media'
      // permission here. In Chromium 'media' = camera/microphone access, not
      // autoplay. Autoplay is already restricted via the
      // 'autoplay-policy=user-gesture-required' command-line switch + the
      // play()-wrapper injected by preload-webview.js. Mapping autoplayBlock
      // to permission 'media' silently denied every mic/cam request, which
      // is why onlinemictest.com showed "Permission denied" without a popup.
      if (permKey === 'notifications' && sec.blockNotifications) { callback(false); return; }
      if (permKey === 'geolocation' && sec.blockGeolocation && !sec.spoofGeolocation) {
        callback(false); return;
      }
      // When spoofGeolocation is on, we *grant* the permission so the page
      // receives fake coordinates injected by preload-webview.js.
      if (permKey === 'geolocation' && sec.spoofGeolocation) { callback(true); return; }
      if ((permKey === 'clipboardRead' || permKey === 'clipboardWrite') && sec.blockClipboard) {
        callback(false); return;
      }

      // (3) Persistent per-site decision (true = allow, false = block).
      if (domain) {
        var store = readStorage();
        var sitePerms = (store.sitePermissions && store.sitePermissions[domain]) || {};
        if (permKey in sitePerms) {
          var v = sitePerms[permKey];
          // Accept booleans and 'allow'/'block' strings for forwards-compat.
          if (v === true || v === 'allow') { callback(true); return; }
          if (v === false || v === 'block') { callback(false); return; }
        }

        // (4) Session-scoped grant ("Allow while on this site").
        var sess = (_sessionPermissions[domain] && _sessionPermissions[domain][permKey]);
        if (sess === true) { callback(true); return; }
      }

      // (5) Ask the user.
      var dialogId = 'perm-' + Date.now() + '-' + Math.random().toString(36).substr(2,5);
      _pendingPermRequests[dialogId] = {
        callback: callback,
        domain: domain,
        permission: permKey
      };
      var permShell = _shellWindowOf(webContents);
      try {
        if (permShell && !permShell.isDestroyed()) {
          permShell.webContents.send('permission-request', {
            dialogId: dialogId,
            domain: domain,
            permission: permKey,
            // Friendly icon hint for the renderer.
            icon: _permIcon(permKey)
          });
        }
      } catch(e2) {}

      // Auto-deny after 60s (raised from 30s — three-button choice takes longer).
      setTimeout(function() {
        var req = _pendingPermRequests[dialogId];
        if (req) {
          delete _pendingPermRequests[dialogId];
          try { if (permShell && !permShell.isDestroyed()) permShell.webContents.send('permission-request-timeout', { dialogId: dialogId }); } catch(e) {}
          req.callback(false);
        }
      }, 60000);
    } catch(e) {
      // Fail closed: an internal error must never silently grant a
      // permission (camera/mic/geo) that the user was never asked about.
      try { callback(false); } catch(_) {}
    }
  };
}

// Mirror of _makePermissionHandler for navigator.permissions.query(): keeps
// the JS-visible permission states in sync with our policy, so pages cannot
// probe granted/denied states that differ from what the popup flow decided.
function _makePermissionCheckHandler(sec) {
  sec = sec || {};
  return function(webContents, permission, requestingOrigin, requester) {
    try {
      var url = requestingOrigin || (webContents && webContents.getURL ? webContents.getURL() : '');
      if (_isInternalPage(url)) return true;

      var permKey = _normalisePermKey(permission);
      if (permKey === 'notifications' && sec.blockNotifications) return false;
      if (permKey === 'geolocation' && sec.blockGeolocation && !sec.spoofGeolocation) return false;
      if (permKey === 'geolocation' && sec.spoofGeolocation) return true;
      if ((permKey === 'clipboardRead' || permKey === 'clipboardWrite') && sec.blockClipboard) return false;

      var domain = '';
      try { domain = url ? new URL(url).hostname : ''; } catch(e) {}
      if (domain) {
        var store = readStorage();
        var sitePerms = (store.sitePermissions && store.sitePermissions[domain]) || {};
        if (permKey in sitePerms) {
          var v = sitePerms[permKey];
          if (v === true || v === 'allow') return true;
          if (v === false || v === 'block') return false;
        }
        var sess = (_sessionPermissions[domain] && _sessionPermissions[domain][permKey]);
        if (sess === true) return true;
      }
      return null; // unknown → Chromium reports 'prompt'
    } catch(e) {
      return false; // fail closed
    }
  };
}

// Friendly lucide-style icon name per permission type (rendered in popup).
function _permIcon(permKey) {
  switch (permKey) {
    case 'geolocation': return 'location';
    case 'notifications': return 'bell';
    case 'media':
    case 'audioCapture':
    case 'videoCapture': return 'mic';
    case 'clipboardRead':
    case 'clipboardWrite': return 'clipboard';
    case 'fullscreen': return 'maximize';
    case 'midi':
    case 'midiSysex': return 'music';
    case 'openExternal': return 'external';
    case 'pointerLock': return 'pointer';
    case 'persistentStorage': return 'database';
    case 'usb': return 'usb';
    default: return 'shield';
  }
}

// Sanitized download manager. Attached to the default session in createWindow
// AND to every session created later (incognito tabs and container tabs each
// get their own partition session — without this they bypassed the download
// manager entirely: no sanitized path, no records, no progress UI).
function _attachDownloadHandler(session) {
  if (!session || session.__spzDownloadsAttached) return;
  session.__spzDownloadsAttached = true;
  session.on('will-download', (event, item, webContents) => {
    const store = readStorage();
    const downloadDir = store.downloadPath || electronApp.getPath('downloads');
    if (!fs.existsSync(downloadDir)) {
      try { fs.mkdirSync(downloadDir, { recursive: true }); } catch(e) {}
    }
    const filename = item.getFilename() || 'download';
    // Sanitize: a malicious server can set Content-Disposition with a filename
    // like "../../../foo" to write outside the download directory. Strip path
    // separators, drive letters and leading dots.
    let safeName = String(filename).replace(/[/\\]+/g, '_').replace(/^\.+/, '').trim() || 'download';
    let savePath = path.join(downloadDir, safeName);
    // Final guard: resolved path must stay inside the download directory.
    const resolvedDir = path.resolve(downloadDir) + path.sep;
    if (path.resolve(savePath).indexOf(resolvedDir) !== 0) {
      safeName = '_' + safeName;
      savePath = path.join(downloadDir, safeName);
    }

    if (fs.existsSync(savePath)) {
      const ext = path.extname(safeName);
      const base = path.basename(safeName, ext);
      let n = 1;
      while (fs.existsSync(path.join(downloadDir, base + ' (' + n + ')' + ext))) n++;
      savePath = path.join(downloadDir, base + ' (' + n + ')' + ext);
    }

    item.setSavePath(savePath);

    const dlId = 'dl-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    // Active DownloadItems by id — pause/resume needs the live item handle.
    if (!_activeDownloadItems) _activeDownloadItems = new Map();
    _activeDownloadItems.set(dlId, item);
    item.once('destroyed', function () { try { _activeDownloadItems.delete(dlId); } catch (e) {} });
    const dlRecord = {
      id: dlId,
      filename: path.basename(savePath),
      path: savePath,
      url: item.getURL() || '',
      mimeType: item.getMimeType() || '',
      totalBytes: item.getTotalBytes(),
      receivedBytes: 0,
      state: 'progressing',
      startTime: Date.now()
    };

    // Privacy: downloads from incognito partitions are not persisted in the
    // shared on-disk list (the file itself still saves; progress UI works).
    var dlIsIncognito = _sessionIsIncognito(session);
    if (!dlIsIncognito) {
      if (!store.downloads) store.downloads = [];
      store.downloads.unshift(dlRecord);
      writeStorage(store);
    }
    _allShells().forEach(function (sh) {
      try { sh.webContents.send('download-started', dlRecord); } catch(e) {}
    });
    _allShells().forEach(function (sh) {
      try { sh.webContents.send('downloads-updated'); } catch(e) {}
    });

    item.on('updated', (event, state) => {
      if (state === 'progressing') {
        // Progress goes to the UI via IPC only — re-reading and re-writing
        // the whole settings.json on every chunk was heavy I/O churn.
        dlRecord.receivedBytes = item.getReceivedBytes();
        dlRecord.state = 'progressing';
        _allShells().forEach(function (sh) {
          try { sh.webContents.send('download-progress', {
            id: dlId, receivedBytes: item.getReceivedBytes(), totalBytes: item.getTotalBytes(), state: 'progressing'
          }); } catch(e) {}
        });
      } else if (state === 'interrupted') {
        dlRecord.state = 'interrupted';
        const store2 = readStorage();
        const idx = (store2.downloads || []).findIndex(d => d.id === dlId);
        if (idx >= 0) { store2.downloads[idx] = { ...dlRecord }; writeStorage(store2); }
        _allShells().forEach(function (sh) {
          try { sh.webContents.send('download-progress', {
            id: dlId, state: 'interrupted'
          }); } catch(e) {}
        });
      }
    });

    item.once('done', (event, state) => {
      try { _activeDownloadItems.delete(dlId); } catch (e) {}
      dlRecord.state = state === 'completed' ? 'completed' : 'failed';
      if (state === 'completed') dlRecord.receivedBytes = dlRecord.totalBytes;
      const store2 = readStorage();
      const idx = (store2.downloads || []).findIndex(d => d.id === dlId);
      if (idx >= 0) { store2.downloads[idx] = { ...dlRecord }; writeStorage(store2); }
      _allShells().forEach(function (sh) {
        try { sh.webContents.send('download-progress', {
          id: dlId, state: dlRecord.state
        }); } catch(e) {}
      });
      _allShells().forEach(function (sh) {
        try { sh.webContents.send('downloads-updated'); } catch(e) {}
      });
    });
  });
}
// Every incognito/container partition session gets the same treatment.
app.on('session-created', function (session) {
  try { _attachDownloadHandler(session); } catch(e) {}
  // Same embedded-CA-bundle fallback as the default session's verify proc
  // (see createWindow). Partitions previously ran pure Chromium verification;
  // -3 keeps that verdict for everything the bundle cannot fully validate.
  // NOTE: 'session-created' also fires for the default session — there this
  // proc is immediately overwritten by createWindow()'s full exceptions-aware
  // verifier, so ordering stays safe.
  try {
    session.setCertificateVerifyProc(function verifyCertPartition(request, callback) {
      try {
        var hostname = (request && request.hostname) || '';
        if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
          callback(0); return;
        }
        if (request.verificationResult === 'net::ERR_CERT_AUTHORITY_INVALID' &&
            certstore.verifyAgainstBundle(hostname, request.certificate)) {
          callback(0); return;
        }
        callback(-3);
      } catch(e) {
        try { callback(-3); } catch(_) {}
      }
    });
  } catch(e) {}
});

// ===== DOWNLOAD PAUSE / RESUME =====
// Works for resumable protocols (http/https with range support): pause()
// stops the transfer, resume() continues it. The UI is notified through the
// regular 'download-progress' channel with state 'paused'/'progressing'.
var _activeDownloadItems = new Map();
function _broadcastDlState(dlId, state, receivedBytes, totalBytes) {
  _allShells().forEach(function (sh) {
    try {
      sh.webContents.send('download-progress', {
        id: dlId, state: state,
        receivedBytes: receivedBytes || 0,
        totalBytes: totalBytes || 0
      });
    } catch(e) {}
  });
}

// Persist a live state change (paused/resumed) to the store so a restart or
// a panel refresh does not show a phantom "downloading…" entry.
function _persistDlState(dlId, state) {
  try {
    const store2 = readStorage();
    const idx = (store2.downloads || []).findIndex(d => d.id === dlId);
    if (idx >= 0) { store2.downloads[idx].state = state; writeStorage(store2); }
  } catch (e) {}
}

ipcMain.handle('download-pause', (_, dlId) => {
  try {
    var item = _activeDownloadItems.get(dlId);
    if (item && !item.isPaused()) {
      item.pause();
      _persistDlState(dlId, 'paused');
      _broadcastDlState(dlId, 'paused', item.getReceivedBytes(), item.getTotalBytes());
      return { success: true, state: 'paused' };
    }
  } catch(e) {}
  return { success: false };
});

ipcMain.handle('download-resume', (_, dlId) => {
  try {
    var item = _activeDownloadItems.get(dlId);
    if (item && item.isPaused() && item.canResume()) {
      item.resume();
      _persistDlState(dlId, 'progressing');
      _broadcastDlState(dlId, 'progressing', item.getReceivedBytes(), item.getTotalBytes());
      return { success: true, state: 'progressing' };
    }
  } catch(e) {}
  return { success: false };
});

// ===== MULTI-WINDOW ROUTING =====
// The browser can run several shell windows: the primary window, additional
// regular windows (Ctrl+N / "New window") and dedicated incognito windows.
// Anything that used to be hardcoded to mainWindow (shortcut actions, popups,
// dialogs, permission popups, window controls…) MUST be routed to the window
// the action came from — otherwise tabs "leak" into the neighboring window.
var _shellWindows = [];
function _registerShellWindow(win) {
  _shellWindows.push(win);
  win.on('closed', function() {
    var i = _shellWindows.indexOf(win);
    if (i > -1) _shellWindows.splice(i, 1);
  });
}
function _shellWindowOf(wc) {
  try {
    // For webview guests hostWebContents is the embedding shell renderer.
    var host = wc && (wc.hostWebContents || wc);
    var win = BrowserWindow.fromWebContents(host);
    if (win && !win.isDestroyed()) return win;
  } catch (e) {}
  return (mainWindow && !mainWindow.isDestroyed()) ? mainWindow : null;
}
function _focusedShell() {
  var shells = _allShells();
  for (var i = 0; i < shells.length; i++) {
    if (shells[i].isFocused()) return shells[i];
  }
  return shells.length ? shells[0] : null;
}
function _allShells() {
  return _shellWindows.filter(function (w) { return !w.isDestroyed(); });
}

// Creates an additional shell window (regular or incognito), optionally
// opening a specific tab in it (tab tear-out / "Move tab to new window").
// "Disable window transparency" (Settings → Optimization): transparent
// frameless windows cost extra compositing work on every frame (worst on
// Linux/Wayland). With the option on, windows are created opaque — the
// rounded corners and the frosted-glass effect disappear, but dragging and
// video playback get smoother on weak GPUs.
function _windowTransparencyEnabled() {
  try {
    var perf = require('./storage').read().optimization || {};
    return perf.disableTransparency !== true;
  } catch (e) { return true; }
}

// `opts`: { incognito: bool, tab: { url, title, partition } }
function createShellWindow(opts) {
  opts = opts || {};
  var win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    transparent: _windowTransparencyEnabled(),
    backgroundColor: '#16161e',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      webSecurity: true
    },
    title: ''
  });
  _registerShellWindow(win);
  // Cascade new windows so they don't stack exactly on top of each other.
  try {
    var offset = ((_shellWindows.length - 1) % 8) * 28;
    if (offset) win.setPosition(win.getPosition()[0] + offset, win.getPosition()[1] + offset);
  } catch (e) {}

  // Same chrome wiring as the main window, so keyboard shortcuts work when
  // focus is on the toolbar and the mac-style controls get their glyphs.
  win.webContents.on('before-input-event', (event, input) => {
    _handleBrowserShortcut(event, input, win.webContents, true);
  });
  win.on('maximize', function() {
    if (!win.isDestroyed()) win.webContents.send('window-state-changed', { maximized: true });
  });
  win.on('unmaximize', function() {
    if (!win.isDestroyed()) win.webContents.send('window-state-changed', { maximized: false });
  });
  win.on('focus', function() {
    if (!win.isDestroyed()) win.webContents.send('window-focus-changed', { focused: true });
  });
  win.on('blur', function() {
    if (!win.isDestroyed()) win.webContents.send('window-focus-changed', { focused: false });
  });
  win.on('minimize', function() {
    try { if (!win.isDestroyed()) win.webContents.send('window-minimized'); } catch(e) {}
  });
  win.on('restore', function() {
    try { if (!win.isDestroyed()) win.webContents.send('window-restored'); } catch(e) {}
  });

  var query = {};
  if (opts.incognito) query.incognito = '1';
  if (opts.tab && opts.tab.url) {
    query.tab = opts.tab.url;
    if (opts.tab.title) query.title = opts.tab.title;
    if (opts.tab.partition) query.partition = opts.tab.partition;
  } else if (!opts.incognito) {
    // Additional regular windows never restore the primary session —
    // that would duplicate tabs in every window.
    query.fresh = '1';
  }
  win.loadFile('index.html', { query: query });
  return win;
}

function createWindow() {
  // Restore last window position/size so the browser opens where the user
  // left it — not always at the default 1200x800 in the screen corner.
  // Persisted in window-state.json next to settings.json.
  var savedBounds = null;
  var startMaximized = false;
  try {
    var statePath = path.join(app.getPath('userData'), 'window-state.json');
    if (fs.existsSync(statePath)) {
      var parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        if (parsed.bounds && typeof parsed.bounds.width === 'number') savedBounds = parsed.bounds;
        if (parsed.maximized === true) startMaximized = true;
      }
    }
  } catch(e) {}

  var windowOpts = {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    transparent: _windowTransparencyEnabled(),
    backgroundColor: '#16161e',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      webSecurity: true
    },
    title: ''
  };
  // Apply saved bounds only when they fit inside a currently-attached display
  // (otherwise a disconnected second monitor would leave the window invisible).
  if (savedBounds) {
    try {
      var screen = require('electron').screen;
      var visible = savedBounds.width >= 400 && savedBounds.height >= 300 &&
        screen.getAllDisplays().some(function(d) {
          var r = d.bounds;
          // Some part of the saved rectangle must overlap a display.
          return savedBounds.x < r.x + r.width && savedBounds.x + savedBounds.width > r.x &&
                 savedBounds.y < r.y + r.height && savedBounds.y + savedBounds.height > r.y;
        });
      if (visible) {
        windowOpts.x = savedBounds.x;
        windowOpts.y = savedBounds.y;
        windowOpts.width = savedBounds.width;
        windowOpts.height = savedBounds.height;
      }
    } catch(e) {}
  }

  mainWindow = new BrowserWindow(windowOpts);
  _registerShellWindow(mainWindow);
  if (startMaximized) {
    try { mainWindow.maximize(); } catch(e) {}
  }
  _mainWindow = mainWindow;

  // Keep the renderer informed about window state so the macOS-style
  // window controls can switch their maximize/restore glyph and dim their
  // colors when the window loses focus.
  mainWindow.on('maximize', function() {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('window-state-changed', { maximized: true });
  });
  mainWindow.on('unmaximize', function() {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('window-state-changed', { maximized: false });
  });
  mainWindow.on('focus', function() {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('window-focus-changed', { focused: true });
  });
  mainWindow.on('blur', function() {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('window-focus-changed', { focused: false });
  });

  // Disable KWallet password prompt by clearing storage
  mainWindow.webContents.session.clearStorageData({
    storages: ['serviceworkers', 'cachestorage']
  });

  _attachDownloadHandler(mainWindow.webContents.session);

  // Unified permission handler — defined once, reused by applySecuritySettings
  // so toggling security options no longer overwrites the per-site popup flow.
  try {
    var initSec = (readStorage().security) || {};
    mainWindow.webContents.session.setPermissionRequestHandler(_makePermissionHandler(initSec));
    mainWindow.webContents.session.setPermissionCheckHandler(_makePermissionCheckHandler(initSec));
  } catch(e) {}

  // === Certificate verifier — per-site exceptions for self-signed/expired
  // certs. IMPORTANT: this runs for EVERY https request, so it must be fast.
  // We cache certExceptions in memory instead of reading settings.json each
  // time (which made every page take seconds to load).
  var _certExceptionsCache = null;
  function _loadCertExceptionsCache() {
    try {
      var s = readStorage();
      _certExceptionsCache = s.certExceptions || {};
    } catch(e) { _certExceptionsCache = {}; }
  }
  _loadCertExceptionsCache();
  try {
    mainWindow.webContents.session.setCertificateVerifyProc(function verifyCert(request, callback) {
      try {
        var hostname = (request && request.hostname) || '';
        // Loopback / internal pages — always trusted.
        if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
          callback(0); return;
        }
        // User-accepted per-site exception — trust regardless of cert state.
        if (_certExceptionsCache && _certExceptionsCache[hostname] === true) {
          callback(0); return;
        }
        // Embedded CA bundle fallback: Chromium's root store does not know
        // this chain — before failing, validate it against the bundled
        // Mozilla roots (cacert.pem). Full validation (hostname, dates,
        // signatures, CA flags) happens inside certstore; any other cert
        // problem still takes the normal error-page path below.
        if (request.verificationResult === 'net::ERR_CERT_AUTHORITY_INVALID' &&
            certstore.verifyAgainstBundle(hostname, request.certificate)) {
          callback(0); return;
        }
        // Otherwise — defer to Chromium. -3 = "use the default verification"
        // so any ERR_CERT_* error code is preserved on its way to
        // did-fail-load, where the renderer routes it to ErrorPage/security.html.
        // Returning -2 (distrust) here collapsed every cert problem into a
        // generic error and made some borderline-but-valid sites fail outright.
        callback(-3);
      } catch(e) {
        try { callback(-3); } catch(_) {}
      }
    });
  } catch(e) {}

  mainWindow.loadFile('index.html');
  applySecuritySettings();

  // Restore active .thmz theme on startup
  mainWindow.webContents.once('did-finish-load', () => {
    try {
      const store = readStorage();
      if (store.activeTheme) {
        const themesDir = getThemesDir();
        const themeDir = path.join(themesDir, store.activeTheme);
        if (fs.existsSync(themeDir)) {
          const css = readThemeCss(themeDir);
          if (css) {
            customThemeCSS = css;
            mainWindow.webContents.send('apply-custom-theme-event', css);
          }
        }
      }
    } catch(e) {}
  });

  // === Register hotkeys on the main window (browser chrome) ===
  // Without this Ctrl+T / Ctrl+W / F5 etc. only work when the focus is on the
  // web page. The line below fixes the "shortcuts do not work until you
  // click the page" situation — now they always work: at start, after
  // opening a tab, when focused on the URL bar/toolbar.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    _handleBrowserShortcut(event, input, mainWindow.webContents, true);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('minimize', () => {
    // Notify renderer so it can freeze ALL tabs (regular + incognito) —
    // no point burning CPU on background pages while the window is hidden.
    try { if (!mainWindow.isDestroyed()) mainWindow.webContents.send('window-minimized'); } catch(e) {}
    var store = readStorage();
    var opt = store.optimization || {};
    if (opt.clearOnMinimize) {
      var ses = _mainWindow.webContents.session;
      ses.clearCache().catch(function(){});
      if (global.gc) global.gc();
    }
  });

  mainWindow.on('restore', () => {
    // Unfreeze the active tab — background tabs stay frozen until clicked.
    try { if (!mainWindow.isDestroyed()) mainWindow.webContents.send('window-restored'); } catch(e) {}
  });
}

// Global interception: catch ALL new-window attempts from ALL webContents
// (including webviews). This ensures middle-click, ctrl+click, target=_blank,
// window.open etc. all open as a new tab instead of a new BrowserWindow.
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler((details) => {
    // Open the new tab in the window the click came from (main vs incognito).
    var win = _shellWindowOf(contents);
    if (win) win.webContents.send('open-in-new-tab', details.url);
    return { action: 'deny' };
  });

  contents.on('dialog', (event, type, message, defaultText, callback) => {
    event.preventDefault();
    var dialogId = 'dlg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    _pendingDialogs[dialogId] = { type: type, callback: callback };
    // Auto-dismiss after 120s — if the renderer never answers (window gone,
    // bug), the page dialog would otherwise block JS forever and the entry
    // would leak in _pendingDialogs.
    setTimeout(function() {
      var pending = _pendingDialogs[dialogId];
      if (!pending) return;
      delete _pendingDialogs[dialogId];
      try {
        pending.callback(type === 'confirm' || type === 'beforeunload' ? false : (type === 'prompt' ? '' : undefined));
      } catch(e) {}
    }, 120000);
    // Capture the page URL/domain so the renderer can show it Chrome-style
    // (the dialog belongs to a specific site, not the browser).
    var pageUrl = '';
    var pageDomain = '';
    try {
      pageUrl = contents && contents.getURL ? contents.getURL() : '';
      if (pageUrl) pageDomain = new URL(pageUrl).hostname;
    } catch(e) {}
    var shellWin = _shellWindowOf(contents);
    if (shellWin) {
      shellWin.webContents.send('show-webview-dialog', {
        dialogId: dialogId,
        type: type,
        message: message || '',
        defaultText: defaultText || '',
        url: pageUrl,
        domain: pageDomain
      });
    } else {
      callback(type === 'confirm' ? false : (type === 'prompt' ? '' : undefined));
    }
  });
});

// ============== HOTKEY HANDLER (used by both the webview and the main window) ==============
// Accepts before-input-event from ANY webContents — this fixes the problem where
// shortcuts did not work without clicking the page (focus on the toolbar/URL-bar).
// isChrome=true means the event came from the main window (browser chrome),
// not from a webview — in this case we do not try to open devtools or read the page URL
// (it is not there).
function _handleBrowserShortcut(event, input, webContents, isChrome) {
  if (!input || input.type !== 'keyDown') return;
  if (!_keyBindings) _loadKeybindings();
  var key = input.key;
  // Route shortcut actions to the window the keypress belongs to (main or
  // dedicated incognito) — NOT blindly to mainWindow.
  var shell = _shellWindowOf(webContents);

  // Get the URL — if in Settings and recording a combination — skip
  var wcUrl = '';
  try { wcUrl = webContents && webContents.getURL ? webContents.getURL() : ''; } catch(e) {}
  var inSettings = wcUrl.indexOf('Settings.html') !== -1;
  if (inSettings && _kbRecording) return;

  // Esc — stop loading (even when focus is on the toolbar).
  // Important: only bare Escape, otherwise Shift+Esc (Task Manager) will not work.
  if (key === 'Escape' && !input.shift && !input.control && !input.meta && !input.alt) {
    try { if (shell) shell.webContents.send('shortcut-action', { action: 'stop' }); } catch(e) {}
    return;
  }
  // Ctrl+1..9 — tab by index
  var ctrlOnly = (input.control || input.meta) && !input.shift && !input.alt;
  if (ctrlOnly && key >= '1' && key <= '9') {
    event.preventDefault();
    try { if (shell) shell.webContents.send('shortcut-action', { action: 'tabByIndex', index: parseInt(key) }); } catch(e) {}
    return;
  }
  // F5 — reload
  if (!input.control && !input.meta && !input.shift && !input.alt && key === 'F5') {
    event.preventDefault();
    try { if (shell) shell.webContents.send('shortcut-action', { action: 'reload' }); } catch(e) {}
    return;
  }
  // Ctrl+N — new window; Ctrl+Shift+N — new incognito window
  if ((input.control || input.meta) && !input.alt && (key === 'n' || key === 'N')) {
    event.preventDefault();
    try { createShellWindow({ incognito: !!input.shift }); } catch(e) {}
    return;
  }

  // Editable bindings
  var actions = ['newTab','closeTab','focusUrl','reload','find','print','savePage',
                 'addBookmark','goBack','goForward','reopenClosed','nextTab','prevTab',
                 'quickCommands','devTools','pip','taskManager'];
  for (var i = 0; i < actions.length; i++) {
    var a = actions[i];
    if (_matchBinding(input, _keyBindings[a])) {
      // Vim is enabled and this same key is a vim command? Give it to vim: exit the
      // loop WITHOUT preventDefault, so the event reaches the engine (when focused on a
      // webview) or falls into the VIM FORWARDING block below (when focused on chrome).
      // Fixes conflict: addBookmark=Ctrl+D vs scrollHalfDown=ctrl+d.
      if (_vimMainCache.enabled && _vimKeyMatchesMainCache(_vimInputToKey(input))) break;
      if (a === 'devTools') {
        // For a shell window — open chrome devtools; for a webview — its own
        event.preventDefault();
        try {
          if (isChrome) { if (shell) shell.webContents.toggleDevTools(); }
          else webContents.toggleDevTools();
        } catch(e) {}
        return;
      }
      event.preventDefault();
      try { if (shell) shell.webContents.send('shortcut-action', { action: a }); } catch(e) {}
      return;
    }
  }

  // === VIM FORWARDING ===
  // If the event is from the main window (chrome), Vim is enabled and the key may be a
  // vim command — send IPC to the renderer. It decides (is there an overlay /
  // focus in an input) and forwards to the active webview. Without preventDefault —
  // let chrome default also run (for non-inputs it is usually nothing).
  if (isChrome && _vimMainCache.enabled) {
    // Latinized character (by input.code) — we send exactly it, so that
    // the engine inside the page gets the latin key on any layout.
    var vKey = _vimInputToChar(input);
    // Do not forward "bare" modifiers and service keys
    if (['Control','Shift','Alt','Meta','Tab','Enter','Backspace','Delete',
         'CapsLock','ContextMenu','PrintScreen','NumLock','ScrollLock','Pause',
         'Insert','Home','End','PageUp','PageDown',
         'ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].indexOf(vKey) === -1) {
      var vCh = _vimInputToKey(input);
      if (_vimKeyMatchesMainCache(vCh)) {
        try {
          if (shell) shell.webContents.send('forward-vim-key', {
            key: vKey,
            shiftKey: !!input.shift,
            ctrlKey: !!input.control,
            altKey: !!input.alt,
            metaKey: !!input.meta
          });
        } catch (e) {}
      }
    }
  }
}

// ============== VIM KEYMAP CACHE (for chrome → webview forwarding) ==============
// Duplicate the vim settings cache in main.js, so that in before-input-event (on the main
// window) we can quickly tell whether the pressed key can be a vim command. If yes —
// we send IPC 'forward-vim-key' to the renderer, which then decides (edit-focus?
// overlay open?) and forwards to the active webview.
var _vimMainCache = { enabled: false, direct: {}, prefixes: {} };
function _vimNormalizeKeyMain(s) {
  if (!s) return '';
  s = String(s).trim();
  if (s === '+' || s === '-') return s;
  var parts = s.split('+').map(function (x) { return x.trim(); });
  if (parts.length === 1) return parts[0];
  var key = parts[parts.length - 1].toLowerCase();
  var mods = parts.slice(0, -1).map(function (m) { return m.toLowerCase(); }).filter(function (m) { return m; });
  mods.sort();
  return mods.length ? (mods.join('+') + '+' + key) : key;
}
function _vimRebuildMainCache(keys) {
  _vimMainCache.direct = {};
  _vimMainCache.prefixes = {};
  Object.keys(keys || {}).forEach(function (action) {
    var raw = keys[action];
    if (!raw) return;
    var norm = _vimNormalizeKeyMain(raw);
    if (norm) _vimMainCache.direct[norm] = action;
    if (raw.length > 1 && raw.indexOf('+') === -1) {
      _vimMainCache.prefixes[raw[0]] = true;
    }
  });
}
// Converts a physical key (input.code from before-input-event) into a
// US (QWERTY) layout symbol. Needed so vim interception works on ANY layout:
// on the Russian layout input.key gives Cyrillic and matching against the vim map breaks.
// Returns null if the code is not a letter/digit/symbol (caller takes input.key).
var _VIM_LAT_SHIFT = { Digit0:')',Digit1:'!',Digit2:'@',Digit3:'#',Digit4:'$',Digit5:'%',
  Digit6:'^',Digit7:'&',Digit8:'*',Digit9:'(','Minus':'_','Equal':'+','BracketLeft':'{',
  'BracketRight':'}','Semicolon':':','Quote':'"','Comma':'<','Period':'>','Slash':'?',
  'Backslash':'|','Backquote':'~' };
var _VIM_LAT_BASE = { Digit0:'0',Digit1:'1',Digit2:'2',Digit3:'3',Digit4:'4',Digit5:'5',
  Digit6:'6',Digit7:'7',Digit8:'8',Digit9:'9','Minus':'-','Equal':'=','BracketLeft':'[',
  'BracketRight':']','Semicolon':';',"Quote":"'","Comma":',','Period':'.','Slash':'/',
  'Backslash':'\\','Backquote':'`' };
function _vimLatinChar(code, shift) {
  if (!code) return null;
  var m = /^Key([A-Z])$/.exec(code);
  if (m) return shift ? m[1] : m[1].toLowerCase();
  if (shift) return _VIM_LAT_SHIFT[code] || null;
  return _VIM_LAT_BASE[code] || null;
}
function _vimLoadMainCache() {
  try {
    var store = readStorage();
    var v = store.vim || {};
    _vimMainCache.enabled = !!v.enabled;
    var defs = _defaultVimKeys();
    var keys = defs;
    if (v.keys && typeof v.keys === 'object') {
      keys = {};
      Object.keys(defs).forEach(function (k) {
        keys[k] = (typeof v.keys[k] === 'string' && v.keys[k].length) ? v.keys[k] : defs[k];
      });
    }
    _vimRebuildMainCache(keys);
  } catch (e) {}
}
_vimLoadMainCache();

// Build a key string from the before-input-event input-object
function _vimInputToKey(input) {
  // Latinize by input.code — otherwise on the Russian layout the match to the
  // vim map (and the forwarding decision) breaks.
  var _lat = _vimLatinChar(input.code || '', !!input.shift);
  var keyName = (_lat !== null) ? _lat : String(input.key || '');
  var hasMod = input.control || input.meta || input.alt;
  if (hasMod) {
    var ch = '';
    if (input.control || input.meta) ch += 'ctrl+';
    if (input.alt) ch += 'alt+';
    ch += keyName.length === 1 ? keyName.toLowerCase() : keyName.toLowerCase();
    return ch;
  }
  if (input.shift && keyName.length === 1) return keyName; // 'J','G',...
  return keyName.length === 1 ? keyName.toLowerCase() : keyName.toLowerCase();
}
// Latinized SINGLE key character (for forwarding to a webview).
// The engine inside the page will get exactly it as event.key.
function _vimInputToChar(input) {
  var _lat = _vimLatinChar(input.code || '', !!input.shift);
  return (_lat !== null) ? _lat : String(input.key || '');
}
function _vimKeyMatchesMainCache(ch) {
  if (_vimMainCache.direct[ch]) return true;
  if (ch.length === 1 && _vimMainCache.prefixes[ch]) return true;
  var found = false;
  Object.keys(_vimMainCache.direct).forEach(function (k) {
    if (k.length > ch.length && k.indexOf(ch) === 0) found = true;
  });
  return found;
}

// ===== Single instance + OS protocol links =====
// startpozi:// links (and http(s):// links when registered as the default
// browser) launched from the OS arrive here: as argv on Windows/Linux and
// via the 'open-url' event on macOS.
function _normalizeLaunchUrl(url) {
  if (typeof url !== 'string') return null;
  if (/^https?:\/\//i.test(url)) return url;
  var m = url.toLowerCase().match(/^startpozi:\/\/([^/?#]*)/);
  if (m) {
    if (m[1] === 'newtab' || m[1] === 'home') return 'MainPage/index.html';
    // customize-toolbar is signaled to the renderer as a mode toggle.
    if (m[1] === 'customize-toolbar') return '__customize_toolbar__';
    return null; // unknown internal protocol target — ignore
  }
  return null;
}
function _openLaunchUrl(url) {
  var normalized = _normalizeLaunchUrl(url);
  if (!normalized) return;
  var shell = _focusedShell();
  if (!shell) return;
  if (normalized === '__customize_toolbar__') {
    shell.webContents.send('toggle-customize-mode');
    return;
  }
  shell.webContents.send('open-in-new-tab', normalized);
}
function _extractLaunchUrl(argv) {
  if (!Array.isArray(argv)) return null;
  for (var i = 1; i < argv.length; i++) {
    var a = argv[i];
    if (/^startpozi:\/\//i.test(a) || /^https?:\/\//i.test(a)) return a;
  }
  return null;
}
var _pendingLaunchUrl = _extractLaunchUrl(process.argv);

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', function (event, argv) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    var url = _extractLaunchUrl(argv);
    if (url) _openLaunchUrl(url);
  });
}

// macOS: links clicked while the app is running.
app.on('open-url', function (event, url) {
  event.preventDefault();
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    _openLaunchUrl(url);
  } else {
    _pendingLaunchUrl = url;
  }
});

app.whenReady().then(async () => {
  // The userData dir may have been relocated by checkCustomDataPath() at
  // startup — (re)load the settings cache from the final location.
  storage.reload();
  createWindow();
  // Deliver a URL the app was launched with (OS "open with" / protocol link)
  // once the shell has actually finished loading.
  if (_pendingLaunchUrl) {
    var launchUrl = _pendingLaunchUrl;
    _pendingLaunchUrl = null;
    var deliver = function () { _openLaunchUrl(launchUrl); };
    try {
      mainWindow.webContents.once('did-finish-load', deliver);
      setTimeout(deliver, 3000); // fallback if load already finished
    } catch(e) {}
  }
  const initStore = readStorage();
  initStore._sessionStartTime = Date.now();
  writeStorage(initStore);
  // One-time secure defaults: if a master password already exists (set before
  // the Protection/Backup toggles were introduced), turn those two protections
  // ON. Runs once (_secureDefaultsApplied flag); later the user's explicit
  // choices — including turning them OFF with the password — are respected.
  _applySecureDefaultsIfNeeded();
  _migratePlaintextPasswords();
  // Downloads from a previous session can no longer be active (their
  // DownloadItems died with the process) — mark leftovers as interrupted so
  // the Library does not show phantom "downloading…" entries forever.
  try {
    storage.update(function (s) {
      if (Array.isArray(s.downloads)) {
        s.downloads.forEach(function (d) {
          if (d && (d.state === 'progressing' || d.state === 'paused')) d.state = 'interrupted';
        });
      }
    });
  } catch (e) {}
  setTimeout(_autoCheckForUpdates, 20000);
  _startProxyWatchdog();
  _startIdleLockPoller();
  _refreshAutohideCache();
  _refreshSitePermCache();
  if (initStore.windowOpacity !== undefined && initStore.windowOpacity < 1) {
    mainWindow.setOpacity(Math.max(0.1, Math.min(1, initStore.windowOpacity)));
  }
  await adblocker.initBlocker(mainWindow.webContents.session);
  applySecuritySettings();

  // CSP for internal (file://) pages + Tor hardening CSP are BOTH injected by
  // the single onHeadersReceived handler inside applySecuritySettings() —
  // Electron allows only one listener per session, so a second registration
  // here used to silently disable the hardening CSP.
  _startMemoryPoller();

  // Apply proxy if configured (from proxy.json or auto-detected at startup).
  // CRITICAL: if host-resolver-rules was set at startup (Tor port detected),
  // we MUST apply a proxy, otherwise ALL DNS is disabled and nothing loads.
  if (_proxySettings && _proxySettings.enabled && _proxySettings.host) {
    applyProxyToSession();
  } else {
    // Try auto-detection as fallback
    _autoApplyTorIfNeeded().catch(function() {});
  }

  app.on('web-contents-created', (_, webContents) => {
    if (webContents.getType() !== 'webview') return;

    // Lock down every <webview> at attach time: whatever attributes the
    // renderer (or a compromised renderer) sets, nodeIntegration stays off
    // and contextIsolation/webSecurity stay on.
    webContents.on('will-attach-webview', (event, webPreferences, params) => {
      try {
        delete webPreferences.preloadURL;
        webPreferences.nodeIntegration = false;
        webPreferences.nodeIntegrationInWorker = false;
        webPreferences.contextIsolation = true;
        webPreferences.webSecurity = true;
        webPreferences.allowRunningInsecureContent = false;
      } catch(e0) {}
    });

    // Page → main IPC transport: injected main-world code calls
    // window.__spzSend(kind, payload, cb) which logs a marked console line;
    // responses are delivered back via executeJavaScript. This replaces the
    // cross-world postMessage bridges that died in Electron 42 (dialog
    // banners, hover-translate, Super Drag).
    webContents.on('console-message', function(event, level, message) {
      try {
        var msg = (typeof message === 'string' && message) ? message : (event && event.message) || '';
        if (!msg || msg.indexOf('__SPZIPC__') !== 0) return;
        var req = JSON.parse(msg.slice(10));
        _handlePageIpc(webContents, req);
      } catch(e) {}
    });

    // Apply the sec-ch-ua substitution to the webview session — CRITICAL for incognito,
    // since each incognito tab creates its own partition-session, on which
    // our default-session listener does not work. Without this Google in incognito
    // sees "Electron" again and blocks login.
    try { _ensureChromeHeadersOnSession(webContents.session); } catch(e) {}
    // Apply the current proxy settings to the new webview session (Tor/proxy),
    // otherwise incognito and new tabs go directly bypassing the proxy.
    try { _ensureProxyOnSession(webContents.session); } catch(e) {}

    // Adblocker: attach to the webview's session. Incognito tabs each run in
    // their own partition session — without this they had no ad/cookie-popup
    // blocking at all. reEnable() is idempotent for the default session.
    try {
      if (adblocker && adblocker.isEnabled && adblocker.isEnabled()) {
        adblocker.reEnable(webContents.session, _secBeforeRequest);
      }
    } catch(e) {}

    // Engine-level UA/userAgentData override via CDP — eliminates the timing
    // race where BotGuard read navigator.userAgentData (with the "Electron"
    // brand) before the preload's async JS patch landed.
    try { _applyUAOverrideViaDebugger(webContents); } catch(e) {}
    webContents.on('did-start-navigation', function (_e, navUrl, _isInPlace, isMainFrame) {
      // MAIN FRAME ONLY: subframe navigations (gstatic iframes on the Google
      // login page, ad frames, etc.) fire this event too — acting on them
      // flipped the UA between Firefox/Chrome mid-load and setUserAgent
      // RESTARTED the whole page → infinite reload loop.
      if (!isMainFrame) return;
      // navUrl = the DESTINATION of this navigation — the only reliable
      // moment to decide whether the debugger must be attached or detached.
      try { _applyUAOverrideViaDebugger(webContents, navUrl); } catch(e) {}
    });
    // NOTE: no did-start-loading hook here — at that moment getURL() still
    // returns the PREVIOUS page, so the auth/non-auth decision is wrong and
    // the resulting setUserAgent ping-pong restarted the load endlessly.
    // did-start-navigation above fires for every navigation WITH the correct
    // destination URL.

    // Per-site JavaScript toggle (Site Info panel). Enforced at the engine
    // level via CDP so it works live, without recreating the webview.
    // Re-applied on every navigation because the flag resets per document.
    function _applySiteJsPolicy(navUrlArg) {
      try {
        if (!webContents || webContents.isDestroyed()) return;
        // Prefer the navigation DESTINATION — getURL() at navigation start
        // still returns the previous page (wrong host for the policy).
        var url = (typeof navUrlArg === 'string' && navUrlArg) || webContents.getURL();
        if (!url || (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0)) return;
        var host = '';
        try { host = new URL(url).hostname; } catch(e) { return; }
        var v = _sitePermFor(host, 'javascript');
        if (v === undefined) return;
        // Never (re-)attach the debugger on login pages — an attached CDP
        // session is a BotGuard signal there.
        if (_isAuthSensitiveUrl(url)) return;
        var dbg = webContents.debugger;
        try { if (!dbg.isAttached()) dbg.attach('1.3'); } catch(e) {}
        dbg.sendCommand('Emulation.setScriptExecutionDisabled', { value: v === false }).catch(function() {});
      } catch(e) {}
    }
    webContents.on('did-start-navigation', function (_e, navUrl) { _applySiteJsPolicy(navUrl); });
    webContents.on('dom-ready', function () { _applySiteJsPolicy(); });

    webContents.on('before-input-event', (event, input) => {
      _handleBrowserShortcut(event, input, webContents);
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Persist the window's position/size/maximized state so the next launch
// reopens the browser exactly where the user left it.
function _saveWindowState() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    var bounds = mainWindow.getNormalBounds ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    var maximized = mainWindow.isMaximized ? mainWindow.isMaximized() : false;
    fs.writeFileSync(
      path.join(app.getPath('userData'), 'window-state.json'),
      JSON.stringify({ bounds: bounds, maximized: maximized })
    );
  } catch(e) {}
}

app.on('window-all-closed', () => {
  _saveWindowState();
  _clearSessionMarker();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for window controls (act on the window that sent the request —
// the incognito shell window must not control the main window)
ipcMain.on('window-minimize', (event) => {
  var win = _shellWindowOf(event.sender);
  if (win) win.minimize();
});

ipcMain.on('window-maximize', (event) => {
  var win = _shellWindowOf(event.sender);
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.on('window-close', (event) => {
  var win = _shellWindowOf(event.sender);
  if (!win) return;
  if (win === mainWindow) {
    try {
      const store = readStorage();
      store.saveTabs = saveTabsSetting;
      store.saveInternalPages = saveInternalPagesSetting;
      store.savedTabs = savedTabs;
      writeStorage(store);
    } catch(e) {}
  }
  win.close();
});

// Central storage: cached reads + atomic writes (see storage.js). The
// wrappers keep the 200+ legacy call sites untouched; new code should prefer
// updateStorage(fn) for race-free read-modify-write.
const storage = require('./storage');
const storagePath = storage.storagePath();
function readStorage() {
  return storage.read();
}
function writeStorage(data) {
  storage.write(data);
}
function updateStorage(fn) {
  return storage.update(fn);
}

// ============== BACKGROUND IMAGE PERSISTENCE ==============
// User-uploaded wallpapers arrive as base64 data URLs. Storing them inline in
// settings.json bloats the file (read synchronously on every IPC call → the
// browser gets sluggish), and the legacy 100 KB cap in writeStorage() silently
// truncated them — corrupting the base64 so the wallpaper never came back
// after a reload.
//
// Fix: dump each data URL to <userData>/backgrounds/<sha1>.<ext> and keep only
// a short file:// URL in settings.json. The conversion is content-addressed
// (sha1 of the base64), so repeated saves of the same image are idempotent.
function _bgDir() {
  var dir = path.join(app.getPath('userData'), 'backgrounds');
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch(e) {}
  return dir;
}
function _dataUrlToBgFile(dataUrl) {
  try {
    var m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(String(dataUrl));
    if (!m) return dataUrl; // not a data URL → return unchanged
    var ext = m[1].split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    var hash = crypto.createHash('sha1').update(m[2]).digest('hex').slice(0, 24);
    var file = path.join(_bgDir(), hash + '.' + ext);
    if (!fs.existsSync(file)) fs.writeFileSync(file, Buffer.from(m[2], 'base64'));
    return 'file://' + file.replace(/\\/g, '/');
  } catch(e) { return dataUrl; }
}
// Replace every data: URL embedded in an arbitrary CSS shorthand string
// (e.g. MainPage's `url("data:...") no-repeat center center / cover fixed`)
// with a file:// URL. Non-data-URL strings pass through untouched.
function _replaceDataUrlsInCss(cssStr) {
  if (!cssStr || typeof cssStr !== 'string' || cssStr.indexOf('data:') === -1) return cssStr;
  return cssStr.replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, function(m) {
    return _dataUrlToBgFile(m);
  });
}
// Broadcast customization changes to EVERY webContents (main window + all
// <webview> tags: Settings, Library, TaskManager, MainPage). The previous code
// only sent to mainWindow.webContents, so webviews — which live in separate
// renderer processes — never received live wallpaper/gradient updates.
function _broadcastCustomization(customization) {
  try {
    var _wc = require('electron').webContents;
    var payload = customization || {};
    _wc.getAllWebContents().forEach(function(wc) {
      try { wc.send('customization-updated', payload); } catch(e) {}
    });
  } catch(e) {}
}

// ============== KEYBINDINGS ==============
function _defaultKeybindings() {
  // ctrl = Ctrl OR Cmd (meta). key — KeyboardEvent.key value (lowercase letters).
  return {
    newTab:      { ctrl: true,  shift: false, alt: false, key: 't' },
    closeTab:    { ctrl: true,  shift: false, alt: false, key: 'w' },
    focusUrl:    { ctrl: true,  shift: false, alt: false, key: 'l' },
    reload:      { ctrl: true,  shift: false, alt: false, key: 'r' },
    find:        { ctrl: true,  shift: false, alt: false, key: 'f' },
    print:       { ctrl: true,  shift: false, alt: false, key: 'p' },
    savePage:    { ctrl: true,  shift: false, alt: false, key: 's' },
    addBookmark: { ctrl: true,  shift: false, alt: false, key: 'd' },
    goBack:      { ctrl: false, shift: false, alt: true,  key: 'ArrowLeft' },
    goForward:   { ctrl: false, shift: false, alt: true,  key: 'ArrowRight' },
    reopenClosed:{ ctrl: true,  shift: true,  alt: false, key: 'n' },
    nextTab:     { ctrl: true,  shift: false, alt: false, key: 'Tab' },
    prevTab:     { ctrl: true,  shift: true,  alt: false, key: 'Tab' },
    quickCommands:{ ctrl: true, shift: true,  alt: false, key: 'p' },
    devTools:    { ctrl: true,  shift: true,  alt: false, key: 'i' },
    pip:         { ctrl: false, shift: false, alt: true,  key: 'p' },
    taskManager: { ctrl: false, shift: true,  alt: false, key: 'Escape' }
  };
}

// Action descriptions for the editor (main does not depend on this but gives it to the editor)
var _keybindingActions = [
  { id: 'newTab',       label: 'New tab' },
  { id: 'closeTab',     label: 'Close tab' },
  { id: 'focusUrl',     label: 'Focus address bar' },
  { id: 'reload',       label: 'Reload page' },
  { id: 'find',         label: 'Find on page' },
  { id: 'print',        label: 'Print' },
  { id: 'savePage',     label: 'Save page' },
  { id: 'addBookmark',  label: 'Add bookmark' },
  { id: 'goBack',       label: 'Back' },
  { id: 'goForward',    label: 'Forward' },
  { id: 'reopenClosed', label: 'Reopen closed tab' },
  { id: 'nextTab',      label: 'Next tab' },
  { id: 'prevTab',      label: 'Previous tab' },
  { id: 'quickCommands',label: 'Command palette' },
  { id: 'devTools',     label: 'Developer tools' },
  { id: 'pip',          label: 'Picture in picture' },
  { id: 'taskManager',  label: 'Task manager' }
];

var _keyBindings = null;
function _loadKeybindings() {
  try {
    var store = readStorage();
    var defs = _defaultKeybindings();
    var saved = store.keybindings || {};
    var merged = {};
    Object.keys(defs).forEach(function(k) {
      merged[k] = saved[k] ? Object.assign({}, defs[k], saved[k]) : defs[k];
    });
    _keyBindings = merged;
  } catch(e) {
    _keyBindings = _defaultKeybindings();
  }
}
function _matchBinding(input, b) {
  if (!b || !b.key) return false;
  var ctrl = !!(input.control || input.meta);
  if (!!b.ctrl !== ctrl) return false;
  if (!!b.shift !== !!input.shift) return false;
  if (!!b.alt !== !!input.alt) return false;
  return String(input.key).toLowerCase() === String(b.key).toLowerCase();
}
_loadKeybindings();

var _mainWindow = null;
var _secBeforeRequest = null;
var _secBeforeSendHeaders = null;

// === URL tracking-parameter cleaner (ClearURLs + DuckDuckGo analog) ===

// Domains where param cleaning should be SKIPPED (per DuckDuckGo exceptions)
var _CLEAN_EXCEPTIONS = [
  'axs.com','urldefense.com','centerwellpharmacy.com','go365.com','humana.com'
];

// Prefixes: any param whose lowercased name STARTS WITH these gets removed.
// Only include prefixes that are unambiguously tracking/marketing/analytics.
var _TRACKING_PREFIXES = [
  'utm_','hs_','_hs','mc_','pk_','mtm_','piwik_','ga_','tt_','tw_','stm_',
  'adjust_','hmb_','wt_mc','cvosrc','cvo_',
  'vero_','wicked','oly_','rb_','branch_','_branch',
  'krux_','_kx','dmp_','criteo_','tbl_','ob_','sumo_','sumome_',
  'kk_','sq_','_ke','convert_','inf_','wtm_',
  '_track','_ping','elq','mms_','ath_','jp_','ch_','em_',
  'se_','sl_','ba_','ep_','pwd_','tn_','pf_','fl_','qs_',
  '_ga','__g','_gl','igsh','ig_','snap_',
  'lin_','lipi','licu','liqid','pinterest_','pin_',
  'mail_','mkt_','market_','mktok','sent_','subscriber_','member_',
  'alg_','algo_','amplitude_','mixpanel_','mp_','seg_','segment_',
  'af_','appsflyer_','one_signal_','onesignal_',
  'pn_','push_','notif_','fcm_','fcmtoken','apn_',
  'salesforce_','sfdc_','pardot_','mkto_','eloqua_',
  'snapchat_','snap_','tiktok_','bytedance_','douyin_',
  'baidu_','bd_','weibo_','wb_','wechat_','wx_','qzone_',
  'naver_','nv_','rakuten_','rk_',
  'rtb_','rtbhouse','casa_','dspy_','dsp_','ssp_',
  'campaign','adgroup','keyword','creative','targetid',
  'loc_','matchtype','devicemodel','adpos',
  'fee','ffb','gdfm','s_kwcid','inv_','internal_',
  'cj_','commission_','affiliate_','aff_',
  'pixel','beacon','tracker','stat_','stats_',
  'log_','event_','evt_','fp_','fingerprint','browser_fp',
  'impression_id','tracker_id','pixel_id','beacon_id',
  'adgroupid','creativeid','keywordid','criteriaid',
  'zoneid','slotid','posid','sizeid','formatid',
  'bidfloor','bidder_id','auction_id','deal_id',
  'cmp_id','vast_id','imp_id','postback_id',
  'sc_customer','sc_eh','sc_anony','sc_uid','sc_ser','sc_expid'
];

// Exact-match tracking params (lowercased). Only params that are
// unambiguously tracking/advertising — no generic words that break sites.
var _TRACKING_PARAMS = [
  // --- Click IDs (advertising) ---
  'fbclid','gclid','gclsrc','dclid','gbraid','wbraid','msclkid','yclid',
  'twclid','ttclid','li_fat_id','ocid','oicd','dclid','gbraid','wbraid',
  'li_fat_id','rb_clickid','obCli','obOrigin','ob_click_id','obTopic',
  'obUrl','obOrig','click_id','clickid','tblci','tblci_id',
  '_branch_match_id','branch_match_id','adjust_tracker',
  'afftrack','affsub','affsub1','affsub2','aff_id','deep_link',
  // --- Google search / ads ---
  'ei','ved','gws_rd','sourceid','iflsig','as_sdt','lei','lei_redir',
  'esrc','qesig','oq','pq','gs_l','gs_m','gs_id','sca_up','uact',
  'pst','bsht','bvm','bvp','espv','nomo','nclient','aqs','biw','bih',
  'tbs','tbm','sa','u_slots','gjid','sei','sei_redir',
  '__gads','__gpi','__gt','_gl','_ga','gjid',
  's_kwcid','loc_physical','loc_interest','adposition','sitelink',
  'targetid','matchtype','network','device','fee','ffb',
  'gdfms','gdftr','gdffi','gdfrek','_loc','_kk','_cta',
  'pgrid','pcrid','pkw','pmt','pdv','pcrn','psrc','psn',
  'cmpid','ad_id','adgroup','adgroup_id','campaign_id','keyword','placement',
  'creative','campaign','mkt_tok','ito','gti','ic_id',
  // --- DuckDuckGo-sourced params ---
  'fb_action_ids','fb_action_types','fb_source','fb_ref',
  'ga_source','ga_medium','ga_term','ga_content','ga_campaign','ga_place',
  'action_object_map','action_type_map','action_ref_map',
  'hmb_campaign','hmb_source','hmb_medium',
  // --- HubSpot ---
  '_hsenc','_hsmi','hsCtaTracking','_hsfp','_hspart',
  // --- Mailchimp ---
  'mc_cid','mc_eid',
  // --- Email marketing platforms ---
  'nr_email_referer','nr_in_email_referer','oly_enc_id','oly_anon_id',
  'cvosrc','cvo_campaign','cvo_creative',
  'vero_id','vero_conv','wickedid','wickedsource','wickedclicks',
  'subscriber_id','send_id','msg_id','thread_id',
  'pp_acquisition','pp_sender','pp_activity','pp_recipient',
  'spmail','sp_report_id','ss_email','ss_session','ss_device',
  'ss_source','ss_campaign','ss_medium','ss_content','ss_term',
  'ea_id','ea_source','ea_medium','ea_campaign','ea_name','ea.creative',
  'elqTrackId','elqAccountId','elqFormName','elqCampaignId',
  'sf_campaign_id','sf_activity_id','sf_track_id','sf_mail_id','sf_list','sf_campaign','sf_activity',
  'keap_id','keap_name','keap_source','inf_contact_key','inf_field',
  'sumome_channel','sumome_campaign','sumome_client',
  'sq_form_id','sq_object_id','sqid',
  'convert_id','convert_rank','convert_class',
  'at_recipient','at_email','at_category','at_preview_token','at_preview_index','at_checked','at_mc',
  'cm_mmc','cm_mmca',
  // --- Social media tracking ---
  'igshid','igsh','ig_cache','ig_tracking',
  'si','snr','tw_adid','tw_campaign','tw_source',
  'lipi','licu','liqid','lj_sku','ttsrc','stx_id','stx_tid','__cld','stamp',
  'tfx_id','tfx_source','tfx_medium','tfx_campaign',
  'wtk_kitchen','lnkid','trendpipe','newsltr','visitid','lr_nxt','email_id',
  'cp_email','cp_push','cp_web',
  'tp_source','tp_medium','tp_campaign','tp_content','tp_term',
  'jp_sh','jp_source','jp_medium','jp_campaign','jp_content','jpulp',
  'ba_campaign','ba_source','ba_medium','ba_content','ba_term',
  'ch_source','ch_medium','ch_campaign','ch_content','ch_term',
  'em_source','em_medium','em_campaign','em_content','em_term',
  'pf_feed','pf_source','pf_medium','pf_campaign',
  'fl_aff','fl_source','fl_medium','fl_campaign',
  'pwd_rurl','pwd_source','pwd_medium',
  'ath_source','ath_medium','ath_campaign','ath_content',
  'ep_source','ep_medium','ep_campaign','ep_content',
  'se_source','se_medium','se_campaign','se_content',
  'sl_source','sl_medium','sl_campaign','sl_content',
  'mms_source','mms_medium','mms_campaign',
  'tn_u','tn_l','tn_source','tn_medium',
  'jl_s','jl_m','jl_c',
  'qs_barcode','qs_source','qs_medium','qs_campaign',
  'cn-reposition','cn-click','cn-source','cn-medium',
  'crc-campaign','crc-source','crc-medium',
  'customer.id','customer_acq_code','cjdata','s_cid',
  'inv_src','inv_id','inv_medium','inv_campaign','inv_term','inv_content',
  // --- Analytics platforms ---
  'spm','scm','trk','trkInfo','trackingId','tracking_source',
  'wt_zmc','wt_mc_id','wt_mc_s','wt_zkgp','wt_mc_seg',
  'pk_campaign','pk_kwd','pk_source','pk_medium',
  'piwik_campaign','piwik_kwd',
  'mtm_campaign','mtm_medium','mtm_source','mtm_kwd',
  'krux_segment','krux_user_id','kxSEGMENTS','kxPLACEMENTS',
  '_kx','kuid','cri','cpistatement',
  'phash','pingdom','prcache','prerender','_escaped_fragment_',
  'adjust_campaign','adjust_adgroup','adjust_creative',
  'amplitude_id','mixpanel_distinct_id','mp_id',
  'segment_anonymous_id','segment_write_key',
  'appsflyer_id','af_id','onesignal_id',
  'quantserve','p-footer','p-idx','p-limit','p-page',
  'stm_sn','stm_sfn','stm_src','stm_med','stm_camp','stm_exp',
  // --- Yandex / VK / Russian ---
  '_openstat','erid','ymclid','clid','ng_r',
  'tg_pid','tg_track_id','track_code','media_id','sub_id','subid',
  'lr_email','lr_source','lr_medium','lr_campaign','lr_content',
  'rlog','strIMessage','shenter',
  'openstat','openstat_service','openstat_campaign_source',
  // --- Chinese / Asian ---
  'clicktype','abtest','bucketid','sceneid',
  'ut_sk','utparam','wxshare_count','sdensity','smcontent',
  'ttmid','bd_vid','logid','pinf','uaa',
  'naiveau','naverblog','naver_mail','ar_state','ar_cam',
  // --- Misc tracking ---
  'querystamp','srcrelated','mkttoken',
  'fingerprint','browser_fp','cid_id','session_id_visitor',
  'pn_id','pn_ref','pn_cid','pn_msg','pn_type',
  'notif_id','push_id','push_token','push_type',
  'match_id','adposition_id','location_id',
  'fee_id','merid','spm_id','algo_id',
  'stat_id','metric_id','event_id','evt_id',
  'callback_id','postback_id','webhook_id',
  'unrecognized_code_url_base64_encoded',
  'crc-campaign','crc-source','crc-medium'
];

// Known redirect/tracking wrappers: { host: [param names that hold the real URL] }
var _REDIRECT_HOSTS = {
  // Google
  'www.google.com': ['url','q','continue','dest','destination','redirect'],
  'www.google.ru': ['url','q','continue','dest','destination','redirect'],
  'google.com': ['url','q','continue','dest','redirect'],
  'google.ru': ['url','q','continue','dest','redirect'],
  'news.google.com': ['url','continue','dest'],
  'click.googlemail.com': ['url'],
  'feedproxy.google.com': ['url','q','continue'],
  'news.url.google.com': ['url','q'],
  // Facebook
  'l.facebook.com': ['u','url'],
  'lm.facebook.com': ['u','url'],
  'm.facebook.com': ['u','url','redirect'],
  'www.facebook.com': ['u','url','redirect'],
  'facebook.com': ['u','url','redirect'],
  // LinkedIn
  'click.linkedin.com': ['url'],
  'www.linkedin.com': ['url','redirectUrl','redir'],
  'linkedin.com': ['url','redirectUrl'],
  'lnkd.in': ['url'],
  // Reddit
  'out.reddit.com': ['url','dest','destination'],
  'www.reddit.com': ['dest','url','destination'],
  'old.reddit.com': ['dest','url','destination'],
  // Twitter / X
  't.co': ['url'],
  'www.twitter.com': ['url','q','redirect'],
  'twitter.com': ['url','q','redirect'],
  'www.x.com': ['url','q','redirect'],
  'x.com': ['url','q','redirect'],
  // YouTube
  'youtube.com': ['q','continue','dest','redirect'],
  'www.youtube.com': ['q','continue','dest','redirect'],
  'm.youtube.com': ['q','continue','dest','redirect'],
  // TikTok
  'www.tiktok.com': ['u','redirect','url'],
  'tiktok.com': ['u','redirect','url'],
  't.tiktok.com': ['url'],
  // Instagram
  'www.instagram.com': ['u','url','redirect'],
  'instagram.com': ['u','url','redirect'],
  // Pinterest
  'www.pinterest.com': ['url','redirect'],
  'pinterest.com': ['url','redirect'],
  // Threads
  'www.threads.net': ['url','redirect'],
  // Tumblr
  't.umblr.com': ['z','url','redirect'],
  'www.tumblr.com': ['z','redirect','url'],
  // Bluesky
  'bsky.app': ['url','redirect','q'],
  // Twitch
  'www.twitch.tv': ['q','url','redirect'],
  'twitch.tv': ['q','url','redirect'],
  // Spotify
  'www.spotify.com': ['url','redirect','continue'],
  'open.spotify.com': ['url','redirect','continue','si','context','go'],
  'play.spotify.com': ['url','redirect','continue'],
  // Discord
  'discord.com': ['continue','next','redirect'],
  'discord.gg': ['continue','next','redirect'],
  // Slack
  'slack.com': ['redir','next','continue'],
  // Medium
  'medium.com': ['redirect','destination','url'],
  // Steam
  'steamcommunity.com': ['url'],
  'store.steampowered.com': ['url','snr'],
  // Microsoft
  'go.microsoft.com': ['url','redirect'],
  'www.microsoft.com': ['url','redirect'],
  'login.microsoftonline.com': ['redirect_uri','continue'],
  'login.live.com': ['redirect','continue'],
  // Amazon
  'amzn.to': ['url'],
  'www.amazon.com': ['tag','linkCode','camp','creative'],
  'www.amazon.ru': ['tag','linkCode','camp','creative'],
  'go.magik.ly': ['url'],
  // Affiliate networks
  'rstyle.me': ['url'],
  'shopstyle.it': ['url'],
  'go.skimresources.com': ['url'],
  'go.redirectingat.com': ['url'],
  'shop-links.co': ['url','d','url_dest'],
  'target.com': ['url'],
  // Russian services
  'vk.com': ['to','url','redirect','q','goto'],
  'm.vk.com': ['to','url','q'],
  'oauth.vk.com': ['redirect_uri'],
  'click.mail.ru': ['url','qs','goto'],
  'r.mail.ru': ['url','cls'],
  'forward.pfw.ru': ['url'],
  'yandex.ru': ['url','clid','from','redir'],
  'clck.yandex.ru': ['url','dst','redir'],
  'clck.ru': ['url','dst','redir'],
  '3ddd.ru': ['url'],
  't.me': ['url','start','startapp'],
  'telegram.me': ['url','start'],
  'habr.com': ['url','redirect'],
  'm.habr.com': ['url','redirect'],
  'click.affilite.ru': ['url'],
  // URL shorteners / redirect wrappers
  'bit.ly': ['url'],
  'ow.ly': ['url'],
  'buff.ly': ['url'],
  'is.gd': ['url'],
  'tinyurl.com': ['url'],
  't.ly': ['url'],
  'rebrand.ly': ['url'],
  'tiny.cc': ['url'],
  'shorturl.at': ['url'],
  'cutt.ly': ['url'],
  'po.st': ['url'],
  'ed.gr': ['url'],
  'zpr.io': ['url'],
  'lnk.to': ['url'],
  'lnk.in': ['url'],
  'dlvr.it': ['url'],
  'app.link': ['url','redirect'],
  'branch.io': ['link','click'],
  'branch.app': ['link','click'],
  // Misc redirect/tracking
  'tap.aminoproject.com': ['url'],
  'r.klar.na': ['url'],
  'associated-content.com': ['url'],
  'leechall.com': ['url'],
  'bin.bunnyfiles.com': ['url'],
  'svr.bukkit.org': ['url'],
  'click.wav.me': ['url'],
  'c1.wav.fm': ['url'],
  'w.linkmonster.co': ['url'],
  'tlook.io': ['url'],
  't.brdg.io': ['url'],
  'earinc.co': ['url'],
  'eua.io': ['url'],
  'plv.io': ['url'],
  'nvtrck.com': ['url'],
  // Email redirect wrappers
  't.email.alibaba.com': ['url'],
  'link.e.mail.ru': ['url'],
  'click.email.foo': ['url']
};

function _isExceptedHost(host) {
  for (var i = 0; i < _CLEAN_EXCEPTIONS.length; i++) {
    if (host === _CLEAN_EXCEPTIONS[i] || host.endsWith('.' + _CLEAN_EXCEPTIONS[i])) return true;
  }
  return false;
}

function _isTrackingParam(lk) {
  if (_TRACKING_PARAMS.indexOf(lk) >= 0) return true;
  for (var p = 0; p < _TRACKING_PREFIXES.length; p++) {
    if (lk.indexOf(_TRACKING_PREFIXES[p]) === 0) return true;
  }
  if (lk.indexOf('_tracking') >= 0 || lk.indexOf('tracker') >= 0) return true;
  if (lk.indexOf('pixel') >= 0 || lk.indexOf('beacon') >= 0) return true;
  return false;
}

function cleanTrackingUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  if (rawUrl.indexOf('http://') !== 0 && rawUrl.indexOf('https://') !== 0) return rawUrl;
  try {
    var url = new URL(rawUrl);
    var host = url.hostname.toLowerCase();

    // 0) Skip cleaning for excepted domains (per DuckDuckGo exceptions)
    if (_isExceptedHost(host)) return rawUrl;

    // 1) Extract real URL from known redirect wrappers
    var redirectParams = _REDIRECT_HOSTS[host];
    if (redirectParams) {
      for (var i = 0; i < redirectParams.length; i++) {
        var dest = url.searchParams.get(redirectParams[i]);
        if (dest && (dest.indexOf('http://') === 0 || dest.indexOf('https://') === 0)) {
          var cleaned = cleanTrackingUrl(dest);
          if (cleaned !== dest) return cleaned;
          return dest;
        }
      }
    }

    // 2) Remove tracking parameters
    var changed = false;
    var paramsToRemove = [];
    url.searchParams.forEach(function(value, key) {
      var lk = key.toLowerCase();
      if (lk === 'sid' || lk === 's_id' || lk === 'session_id') return;
      if (_isTrackingParam(lk)) paramsToRemove.push(key);
    });
    paramsToRemove.forEach(function(key) { url.searchParams.delete(key); changed = true; });

    // 3) Clean tracking params embedded in the hash fragment (e.g. #utm_source=...)
    if (url.hash && url.hash.length > 1) {
      var hashContent = url.hash.substring(1);
      if (hashContent.indexOf('=') >= 0 && hashContent.indexOf('utm_') >= 0) {
        var hashParams = new URLSearchParams(hashContent);
        var hashToRemove = [];
        hashParams.forEach(function(value, key) {
          if (_isTrackingParam(key.toLowerCase())) hashToRemove.push(key);
        });
        if (hashToRemove.length > 0) {
          hashToRemove.forEach(function(key) { hashParams.delete(key); });
          var remaining = hashParams.toString();
          url.hash = remaining ? '#' + remaining : '';
          changed = true;
        }
      }
      if (url.hash === '#_=_' || url.hash === '#') {
        url.hash = '';
        changed = true;
      }
    }

    if (!changed) return rawUrl;
    var result = url.toString();
    if (rawUrl.charAt(rawUrl.length - 1) !== '/' && result.charAt(result.length - 1) === '/' && !url.search) {
      result = result.replace(/\/$/, '');
    }
    return result;
  } catch(e) {
    return rawUrl;
  }
}

var _dntEnabled = true;
function applySecuritySettings() {
  if (!_mainWindow) return;
  var ses = _mainWindow.webContents.session;
  var store = readStorage();
  var sec = store.security || {};
  if (_secBeforeSendHeaders) { try { ses.webRequest.onBeforeSendHeaders(null); } catch(e) {} _secBeforeSendHeaders = null; }

  var needBeforeRequest = sec.httpsOnly || sec.blockMixedContent || sec.urlClean;
  if (needBeforeRequest) {
    _secBeforeRequest = function(details, callback) {
      var durl = details.url;
      if (!durl) { callback({}); return; }

      // URL cleaning: strip tracking params, extract redirects
      if (sec.urlClean && (durl.indexOf('http://') === 0 || durl.indexOf('https://') === 0)) {
        var cleaned = cleanTrackingUrl(durl);
        if (cleaned !== durl) {
          callback({ redirectURL: cleaned });
          return;
        }
      }

      if (durl.indexOf('http://') === 0) {
        if (details.resourceType === 'mainFrame' && sec.httpsOnly) {
          callback({ redirectURL: durl.replace('http://', 'https://') });
          return;
        }
        if (details.resourceType !== 'mainFrame' && sec.blockMixedContent) {
          callback({ cancel: true });
          return;
        }
      }
      callback({});
    };
  } else {
    _secBeforeRequest = null;
  }

  if (sec.webrtcLeak) {
    try { ses.setWebRTCIPHandlingPolicy('disable_non_proxied_udp'); } catch(e) {}
  } else {
    try { ses.setWebRTCIPHandlingPolicy('default'); } catch(e) {}
  }

  // Permission handler is now owned by _makePermissionHandler (single source
  // of truth). Security toggles are evaluated inside it, so we just refresh
  // the bound config — never overwrite with a stripped-down handler again.
  try {
    ses.setPermissionRequestHandler(_makePermissionHandler(sec));
    ses.setPermissionCheckHandler(_makePermissionCheckHandler(sec));
  } catch(e) {}

  if (sec.blockThirdPartyCookies) {
    _secBeforeSendHeaders = function(details, callback) {
      var headers = details.requestHeaders;
      var rt = details.resourceType;
      if (rt === 'image' || rt === 'stylesheet' || rt === 'font' || rt === 'media') {
        if (sec.referrerPolicy && headers['Referer']) {
          try { headers['Referer'] = new URL(headers['Referer']).origin + '/'; } catch(e) {}
        }
        callback({ requestHeaders: headers });
        return;
      }
      try {
        var reqUrl = new URL(details.url);
        var firstParty = reqUrl.hostname;
        if (headers['Referer']) {
          var refUrl = new URL(headers['Referer']);
          var refHost = refUrl.hostname;
          var isThirdParty = firstParty !== refHost &&
            !refHost.endsWith('.' + firstParty) &&
            !firstParty.endsWith('.' + refHost);
          if (isThirdParty) {
            delete headers['Cookie'];
          }
          if (sec.referrerPolicy) {
            headers['Referer'] = refUrl.origin + '/';
          }
        }
      } catch(e) {}
      callback({ requestHeaders: headers });
    };
  } else if (sec.referrerPolicy) {
    _secBeforeSendHeaders = function(details, callback) {
      var headers = details.requestHeaders;
      if (headers['Referer']) {
        try {
          var ref = headers['Referer'];
          var u = new URL(ref);
          headers['Referer'] = u.origin + '/';
        } catch(e) {}
      }
      callback({ requestHeaders: headers });
    };
  }

  try { _mainWindow.webContents.send('security-settings-changed', sec); } catch(e) {}

  if (adblocker && adblocker.isEnabled && adblocker.isEnabled()) {
    try { adblocker.reEnable(ses, _secBeforeRequest); } catch(e) {}
  }

  // Always wrap the listener so the security logic runs BEFORE
  // the sec-ch-ua substitution (substitution must be at the very end — it is critical for
  // Google login and must not be dropped by any privacy settings).
  _dntEnabled = sec.dnt !== false;
  var securityHandler = _secBeforeSendHeaders;
  _secBeforeSendHeaders = function(details, callback) {
    if (!securityHandler) {
      var h0 = details.requestHeaders || {};
      if (_dntEnabled) { h0['DNT'] = '1'; h0['Sec-GPC'] = '1'; }
      _stripSiteCookies(details, h0);
      _applyChromeHeadersToObject(h0, details.url, _wcProfile(details));
      callback({ requestHeaders: h0 });
      return;
    }
    securityHandler(details, function(res) {
      var h1 = (res && res.requestHeaders) || details.requestHeaders || {};
      if (_dntEnabled) { h1['DNT'] = '1'; h1['Sec-GPC'] = '1'; }
      _stripSiteCookies(details, h1);
      _applyChromeHeadersToObject(h1, details.url, _wcProfile(details));
      callback({ requestHeaders: h1 });
    });
  };

  ses.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, _secBeforeSendHeaders);
  _chromeHeaderSessions.add(ses);

  // === CSP injection via onHeadersReceived (SINGLE handler) ===
  // Electron allows only ONE onHeadersReceived listener per session, so the
  // internal-page CSP (file://) and the Tor-hardening CSP (http/https) MUST
  // share this handler. Previously applySecuritySettings() installed the
  // hardening handler and app.whenReady() then replaced it with the file://
  // CSP handler — silently disabling all hardening until the next toggle.
  // store.security.torHardening = { js, webgl, fonts, plugins, iframes, base }
  // Each option is independent. Applied to http/https (we do not touch file://
  // beyond the minimal internal-page CSP).
  // IMPORTANT: in Electron details.responseHeaders — is an OBJECT {name: value},
  // not an array (previously there was headers.push here → it crashed).
  try { ses.webRequest.onHeadersReceived(null); } catch(e) {}
  var th = sec.torHardening || {};
  var anyHardening = th.js || th.fonts || th.plugins || th.iframes || th.base;
  // webgl separately — via preload-webview (CSP does not block it correctly).
  ses.webRequest.onHeadersReceived({ urls: ['<all_urls>'] }, function(details, callback) {
    try {
      var durl = details.url || '';
      var csp = null;

      if (durl.indexOf('file://') === 0) {
        // Content-Security-Policy for internal (file://) pages only.
        // Deliberately minimal so it cannot break the app (inline
        // scripts/styles stay allowed), but it closes two real vectors:
        // <object>/<embed> plugin attacks and <base href> hijack.
        csp = "object-src 'none'; base-uri 'self'";
      } else if (anyHardening && (durl.indexOf('http://') === 0 || durl.indexOf('https://') === 0)) {
        // Tor hardening — build CSP from individual toggles.
        var parts = [];
        if (th.js) {
          parts.push("script-src 'none'");
        }
        if (th.fonts) {
          parts.push("font-src 'self' data:");
        }
        if (th.plugins) {
          parts.push("object-src 'none'");
        }
        if (th.iframes) {
          parts.push("frame-src 'self'");
        }
        if (th.base) {
          parts.push("base-uri 'self'");
        }
        if (parts.length > 0) csp = parts.join('; ');
      }

      if (!csp) {
        // Even without a CSP to inject, per-site cookie blocking must strip
        // Set-Cookie from the response.
        try {
          var _ckHost0 = '';
          try { _ckHost0 = new URL(durl).hostname; } catch(e) {}
          var _hdrs0 = details.responseHeaders;
          if (_ckHost0 && !Array.isArray(_hdrs0) && _hdrs0 &&
              _sitePermFor(_ckHost0, 'cookies') === false) {
            Object.keys(_hdrs0).forEach(function(k) {
              if (k && k.toLowerCase() === 'set-cookie') delete _hdrs0[k];
            });
            callback({ responseHeaders: _hdrs0 });
            return;
          }
        } catch(e2) {}
        callback({});
        return;
      }
      var headers = details.responseHeaders;
      if (!headers) { callback({}); return; }
      // Per-site cookie blocking — drop Set-Cookie from responses of sites
      // the user blocked cookies for (object header format).
      if (!Array.isArray(headers)) {
        try {
          var _ckHost = '';
          try { _ckHost = new URL(durl).hostname; } catch(e) {}
          if (_ckHost && _sitePermFor(_ckHost, 'cookies') === false) {
            Object.keys(headers).forEach(function(k) {
              if (k && k.toLowerCase() === 'set-cookie') delete headers[k];
            });
          }
        } catch(e2) {}
      }
      // Object format (Electron)
      if (!Array.isArray(headers)) {
        var existingKey = null;
        Object.keys(headers).forEach(function(k) {
          if (k && k.toLowerCase() === 'content-security-policy') existingKey = k;
        });
        if (existingKey) {
          var ev = headers[existingKey];
          var firstVal = Array.isArray(ev) ? (ev[0] || '') : (ev || '');
          var rest = Array.isArray(ev) ? ev.slice(1) : [];
          headers[existingKey] = [csp + '; ' + firstVal].concat(rest);
        } else {
          headers['Content-Security-Policy'] = csp;
        }
        callback({ responseHeaders: headers });
        return;
      }
      // Array format (just in case)
      var existingIdx = -1;
      for (var i = 0; i < headers.length; i++) {
        if (headers[i] && headers[i].name && headers[i].name.toLowerCase() === 'content-security-policy') {
          existingIdx = i; break;
        }
      }
      if (existingIdx >= 0) {
        headers[existingIdx].value = csp + '; ' + (headers[existingIdx].value || '');
      } else {
        headers.push({ name: 'Content-Security-Policy', value: csp });
      }
      callback({ responseHeaders: headers });
    } catch(e) {
      callback({});
    }
  });
}

// === Substitute sec-ch-ua / User-Agent to Chrome ===
// Applied to ALL sessions, including incognito-partitions, otherwise in incognito
// Google will see the "Electron" brand again and block login.
// Firefox UA for login pages: Google's Chromium-build fingerprinting blocks
// ANY Electron build regardless of the Chrome masquerade (verified by the
// community, incl. castlabs). Presenting as Firefox switches Google to a
// different code path without the Chrome attestation — Firefox sends NO
// client hints at all (no sec-ch-ua headers, no navigator.userAgentData,
// no window.chrome), which we mirror exactly.
var _firefoxUa = process.platform === 'win32'
  ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:148.0) Gecko/20100101 Firefox/148.0'
  : process.platform === 'darwin'
  ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:148.0) Gecko/20100101 Firefox/148.0'
  : 'Mozilla/5.0 (X11; Linux x86_64; rv:148.0) Gecko/20100101 Firefox/148.0';

// UA profile per webContents: 'ff' while the tab shows a login page (Firefox
// masquerade via CDP), 'chrome' otherwise. The header rewriter consults this
// instead of the request URL — subresources of an auth page must carry the
// SAME UA as the document (real Firefox never mixes sec-ch-ua into a page),
// and a normal page embedding an accounts.google.com iframe must not flip.
var _uaProfileByWc = new Map();
function _wcProfile(details) {
  try {
    var id = details && details.webContentsId;
    if (id && _uaProfileByWc.has(id)) return _uaProfileByWc.get(id);
  } catch (e) {}
  return 'chrome';
}

function _applyChromeHeadersToObject(headers, requestUrl, profileOverride) {
  if (!headers) return headers;
  if (profileOverride === 'ff') {
    // Firefox profile: strip EVERY client hint + set the Firefox UA.
    try {
      Object.keys(headers).forEach(function(k) {
        var lk = k.toLowerCase();
        if (lk === 'sec-ch-ua' || lk === 'sec-ch-ua-mobile' || lk === 'sec-ch-ua-platform' ||
            lk === 'sec-ch-ua-arch' || lk === 'sec-ch-ua-bitness' || lk === 'sec-ch-ua-full-version' ||
            lk === 'sec-ch-ua-full-version-list' || lk === 'sec-ch-ua-model' ||
            lk === 'sec-ch-ua-platform-version' || lk === 'sec-ch-ua-wow64' || lk === 'x-client-data') {
          delete headers[k];
        }
      });
      var uaKey = null;
      Object.keys(headers).forEach(function(k) { if (k.toLowerCase() === 'user-agent') uaKey = k; });
      if (uaKey) headers[uaKey] = _firefoxUa;
      else headers['User-Agent'] = _firefoxUa;
    } catch (e) {}
    return headers;
  }
  // Remove ALL variants of sec-ch-ua headers (different cases) before setting our own.
  Object.keys(headers).forEach(function(k) {
    var lk = k.toLowerCase();
    if (lk === 'sec-ch-ua' || lk === 'sec-ch-ua-mobile' || lk === 'sec-ch-ua-platform' ||
        lk === 'sec-ch-ua-arch' || lk === 'sec-ch-ua-bitness' || lk === 'sec-ch-ua-full-version' ||
        lk === 'sec-ch-ua-full-version-list' || lk === 'sec-ch-ua-model' ||
        lk === 'sec-ch-ua-platform-version' || lk === 'sec-ch-ua-wow64' || lk === 'x-client-data') {
      delete headers[k];
    }
  });
  headers['sec-ch-ua'] = _secChUaBrands;
  headers['sec-ch-ua-full-version'] = '"' + _chromeFullVersion + '"';
  headers['sec-ch-ua-full-version-list'] = _secChUaFullVersionList;
  headers['sec-ch-ua-mobile'] = _uaPlatform === 'Android' ? '?1' : '?0';
  if (_uaPlatform === 'Windows') {
    headers['sec-ch-ua-platform'] = '"Windows"';
    headers['sec-ch-ua-platform-version'] = '"15.0.0"';
  } else if (_uaPlatform === 'macOS') {
    headers['sec-ch-ua-platform'] = '"macOS"';
    headers['sec-ch-ua-platform-version'] = '"10.15.7"';
  } else {
    headers['sec-ch-ua-platform'] = '"Linux"';
    headers['sec-ch-ua-platform-version'] = '"6.5.0"';
  }
  // Google sends Accept-CH requesting these. Real Chrome sends them.
  // If we strip them, Google sees a Chrome that doesn't answer client hints = spoof marker.
  headers['sec-ch-ua-arch'] = '"x86"';
  headers['sec-ch-ua-bitness'] = '"64"';
  headers['sec-ch-ua-model'] = '""';
  headers['sec-ch-ua-wow64'] = '?0';
  // Accept-Language — ensure it's present (Electron sets it from app locale,
  // but some Linux configs send an unusual or missing value).
  var hasAcceptLang = false;
  Object.keys(headers).forEach(function(k) { if (k.toLowerCase() === 'accept-language') hasAcceptLang = true; });
  if (!hasAcceptLang) {
    headers['Accept-Language'] = 'en-US,en;q=0.9';
  }
  var uaKey = null;
  Object.keys(headers).forEach(function(k) { if (k.toLowerCase() === 'user-agent') uaKey = k; });
  // Always force the Chrome UA on non-auth requests: the webContents may
  // still carry the Firefox UA from a previous login-page visit.
  if (uaKey) headers[uaKey] = _uaPlatformString;
  else headers['User-Agent'] = _uaPlatformString;
  return headers;
}
var _chromeHeaderSessions = new WeakSet();
// Applies sec-ch-ua substitution to ANY session (default is skipped — it is configured by
// applySecuritySettings with the security+sec-ch-ua chain). Called from
// web-contents-created for each new webview, including incognito.
// Keyed by session OBJECT (WeakSet): the old string key via
// `ses.partition || storagePath` collapsed every in-memory incognito session
// into 'storage:null' — the 2nd+ incognito tab got NO masquerade at all.
function _ensureChromeHeadersOnSession(ses) {
  if (!ses) return;
  var isDefault = false;
  try { isDefault = (ses === session.defaultSession); } catch(e) {}
  if (_chromeHeaderSessions.has(ses)) return;
  _chromeHeaderSessions.add(ses);
  if (isDefault) return; // default is configured in applySecuritySettings
  try {
    ses.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, function(details, callback) {
      var h = details.requestHeaders || {};
      if (_dntEnabled) { h['DNT'] = '1'; h['Sec-GPC'] = '1'; }
      _stripSiteCookies(details, h);
      _applyChromeHeadersToObject(h, details.url, _wcProfile(details));
      callback({ requestHeaders: h });
    });
    try { ses.setUserAgent(_uaPlatformString); } catch(e) {}
  } catch(e) {}
}

// Load/save tabs (session restoration)
let savedTabs = [];
let saveTabsSetting = true;
let saveInternalPagesSetting = true;
// Try to load saved session
try {
  const store = readStorage();
  if (store.saveTabs !== undefined) saveTabsSetting = store.saveTabs;
  if (store.saveInternalPages !== undefined) saveInternalPagesSetting = store.saveInternalPages;
  if (store.savedTabs) savedTabs = store.savedTabs;
} catch(e) {}

// Save tabs when app quits
app.on('before-quit', () => {
  _saveWindowState();
  _clearSessionMarker();
  const store = readStorage();
  store.saveTabs = saveTabsSetting;
  store.saveInternalPages = saveInternalPagesSetting;
  store.savedTabs = savedTabs;
  writeStorage(store);
});

ipcMain.handle('save-current-tabs', (_, tabsData) => {
  savedTabs = tabsData;
  const store = readStorage();
  store.savedTabs = tabsData;
  writeStorage(store);
  return { success: true };
});

ipcMain.handle('get-saved-tabs', () => {
  const store = readStorage();
  return store.savedTabs || [];
});

// ============== WEBVIEW DIALOG RESPONSE ==============
ipcMain.on('webview-dialog-response', (_, data) => {
  var pending = _pendingDialogs[data.dialogId];
  if (!pending) return;
  delete _pendingDialogs[data.dialogId];
  if (pending.callback) {
    try {
      if (pending.type === 'alert') pending.callback();
      else if (pending.type === 'confirm' || pending.type === 'beforeunload') pending.callback(!!data.result);
      else if (pending.type === 'prompt') pending.callback(data.result !== null && data.result !== undefined ? String(data.result) : '');
      else pending.callback();
    } catch(e) {}
  } else if (pending.resolve) {
    pending.resolve(data.result);
  }
});

// Renderer → main: user picked a decision in the permission popup.
// data.decision ∈ 'allow' | 'block' | 'session' | 'once' | 'dismiss'
//   allow    → persist true  in settings.json (always allow for this site)
//   block    → persist false in settings.json (always block for this site)
//   session  → grant only for the current browser session (in-memory)
//   once     → grant this single request, do not remember
//   dismiss  → user closed the popup without choosing → deny once
// Backwards-compat: data.allow (boolean) is still honoured.
ipcMain.on('permission-response', (event, data) => {
  var req = _pendingPermRequests[data.dialogId];
  if (!req) return;
  delete _pendingPermRequests[data.dialogId];

  var decision = data.decision;
  if (!decision) {
    // Legacy boolean form.
    decision = data.allow ? 'allow' : 'block';
  }

  var allowed = (decision === 'allow' || decision === 'session' || decision === 'once');

  // Resolve the Chromium request first so the page doesn't stall.
  try { req.callback(allowed); } catch(e) {}

  // Persist / cache the decision.
  if (!req.domain) return;
  if (decision === 'allow' || decision === 'block') {
    try {
      var store = readStorage();
      if (!store.sitePermissions) store.sitePermissions = {};
      if (!store.sitePermissions[req.domain]) store.sitePermissions[req.domain] = {};
      store.sitePermissions[req.domain][req.permission] = (decision === 'allow');
      writeStorage(store);
    } catch(e) {}
  } else if (decision === 'session') {
    if (!_sessionPermissions[req.domain]) _sessionPermissions[req.domain] = {};
    _sessionPermissions[req.domain][req.permission] = true;
  }
  // 'once' and 'dismiss' are not remembered.
});

// IPC from preload override (alert/confirm/prompt in webview pages)
// Shared dialog logic: used by the 'dialog-request' IPC (preload-webview of
// internal pages) and by the console transport of external pages.
function _requestPageDialog(senderWc, data) {
  return new Promise((resolve) => {
    var dlgShell = _shellWindowOf(senderWc);
    if (!dlgShell || dlgShell.isDestroyed()) { resolve(null); return; }
    var dialogId = 'drq-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    var settled = false;
    _pendingDialogs[dialogId] = { type: data.type, resolve: function(v) { settled = true; resolve(v); } };
    // Safety timeout: never leave the page's dialog promise pending forever.
    setTimeout(function() {
      var pending = _pendingDialogs[dialogId];
      if (!pending || settled) return;
      delete _pendingDialogs[dialogId];
      try { pending.resolve(null); } catch(e) {}
    }, 120000);
    var pageUrl = '';
    var pageDomain = '';
    try {
      pageUrl = senderWc && senderWc.getURL ? senderWc.getURL() : '';
      if (pageUrl) pageDomain = new URL(pageUrl).hostname;
    } catch(e) {}
    dlgShell.webContents.send('show-webview-dialog', {
      dialogId: dialogId,
      type: data.type,
      message: data.message || '',
      defaultText: data.defaultText || '',
      url: pageUrl,
      domain: pageDomain
    });
  });
}

ipcMain.handle('dialog-request', (event, data) => {
  return _requestPageDialog(event.sender, data || {});
});

// Console-transport dispatcher (see the 'console-message' listener in
// web-contents-created). Kinds: dialog, translate, superdrag.
function _handlePageIpc(wc, req) {
  if (!req || !wc || wc.isDestroyed()) return;
  var kind = req.kind;
  var id = req.id;
  function respond(result) {
    try {
      if (!wc || wc.isDestroyed() || !id) return;
      wc.executeJavaScript(
        'window.__spzIpcResponse && window.__spzIpcResponse(' + JSON.stringify(id) + ', ' + JSON.stringify(result === undefined ? null : result) + ')',
        false
      ).catch(function() {});
    } catch(e) {}
  }
  try {
    if (kind === 'dialog') {
      var d = req.payload || {};
      _requestPageDialog(wc, { type: d.type, message: d.message || '', defaultText: d.defaultText || '' })
        .then(respond);
    } else if (kind === 'translate') {
      var tp = req.payload || {};
      _translateText(String(tp.text || ''), tp.from, tp.to).then(respond);
    } else if (kind === 'superdrag') {
      var sp = req.payload || {};
      _superDragAction(wc, String(sp.kind || ''), sp.payload || '');
      respond({ ok: true });
    }
  } catch(e) {
    try { respond(null); } catch(e2) {}
  }
}

// ============== THEME ==============
ipcMain.handle('get-theme', () => {
  const store = readStorage();
  return store.theme || 'dark';
});

ipcMain.handle('set-theme', (_, theme) => {
  const store = readStorage();
  store.theme = theme;
  writeStorage(store);
  if (mainWindow) mainWindow.webContents.send('theme-updated', theme);
  return { success: true };
});

// ============== SEARCH ENGINE ==============
ipcMain.handle('get-window-opacity', () => {
  const store = readStorage();
  return store.windowOpacity !== undefined ? store.windowOpacity : 1;
});

ipcMain.handle('set-window-opacity', (_, opacity) => {
  const store = readStorage();
  store.windowOpacity = opacity;
  writeStorage(store);
  var clamped = Math.max(0.1, Math.min(1, opacity));
  if (mainWindow) {
    try { mainWindow.setOpacity(clamped); } catch(e) {}
    // Notify the renderer so it applies the CSS-based opacity/blur layer.
    // The native setOpacity() has no visible effect on Linux when the window
    // is created with transparent:true, so the renderer's --win-opacity /
    // blur background is what actually produces the dimming. Without this
    // broadcast the slider moved but nothing changed on screen.
    try {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('window-opacity-changed', clamped);
    } catch(e) {}
  }
  return { success: true };
});

// Translucent chrome mode — frosted glass effect on titlebar/navbar/panels.
// Three-state: 'auto' (default, only for dark pages) / 'off' / 'always'.
ipcMain.handle('get-translucent-mode', () => {
  try {
    var v = readStorage().translucentMode;
    if (v === 'auto' || v === 'off' || v === 'always') return v;
    if (v === true) return 'always'; // back-compat with the old boolean
    return 'auto'; // default
  } catch(e) { return 'auto'; }
});
ipcMain.handle('set-translucent-mode', (_, val) => {
  try {
    var s = readStorage();
    // Normalise: only accept the three documented values.
    if (val === 'auto' || val === 'off' || val === 'always') s.translucentMode = val;
    else if (val === true) s.translucentMode = 'always';
    else if (val === false) s.translucentMode = 'off';
    else s.translucentMode = 'auto';
    writeStorage(s);
    // Notify the renderer so it can re-evaluate the current page.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('translucent-mode-changed', s.translucentMode);
    }
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

ipcMain.handle('get-search-engine', () => {
  const store = readStorage();
  return store.searchEngine || 'https://startpozi.netlify.app/search.html?q=';
});

ipcMain.handle('set-search-engine', (_, url) => {
  const store = readStorage();
  store.searchEngine = url;
  writeStorage(store);
  return { success: true };
});

// ============== EXTERNAL SERVICES ==============
// Every third-party endpoint the browser can talk to, in one place. Each
// network-touching feature can be disabled in Settings → Security →
// "External services" (keys of store.security): suggestEnabled,
// translateEnabled, hibpEnabled, diagnosticsEnabled.
const EXTERNAL_SERVICES = {
  suggest: {
    google: 'https://suggestqueries.google.com/complete/search?client=firefox&q=',
    yandex: 'https://suggest.yandex.com/suggest-ff.cgi?part=',
    duckduckgo: 'https://duckduckgo.com/ac/?q='
  },
  translate: 'https://translate.googleapis.com/translate_a/single',
  hibp: 'https://api.pwnedpasswords.com/range/',
  torCheck: 'https://check.torproject.org/api/ip',
  geo: 'https://ipapi.co/json/',
  geoFallback: 'https://ipinfo.io/json',
  speedTest: 'https://speed.cloudflare.com/__down?bytes='
};

function _svcEnabled(key) {
  // Every service is opt-out; absence of the setting means ENABLED.
  try {
    var sec = readStorage().security || {};
    return sec[key] !== false;
  } catch (e) { return true; }
}

ipcMain.handle('get-external-services', () => {
  return {
    success: true,
    services: [
      { key: 'suggestEnabled',      url: 'suggestqueries.google.com / suggest.yandex.com / duckduckgo.com' },
      { key: 'translateEnabled',    url: 'translate.googleapis.com' },
      { key: 'hibpEnabled',         url: 'api.pwnedpasswords.com' },
      { key: 'diagnosticsEnabled',  url: 'check.torproject.org / ipapi.co / ipinfo.io / speed.cloudflare.com' }
    ],
    enabled: {
      suggestEnabled: _svcEnabled('suggestEnabled'),
      translateEnabled: _svcEnabled('translateEnabled'),
      hibpEnabled: _svcEnabled('hibpEnabled'),
      diagnosticsEnabled: _svcEnabled('diagnosticsEnabled')
    }
  };
});


ipcMain.handle('search-suggest', async (_, query) => {
  if (!_svcEnabled('suggestEnabled')) return [];
  if (!query || query.length < 2) return [];
  const store = readStorage();
  const se = store.searchEngine || '';
  let suggestUrl;
  if (se.indexOf('google') !== -1) {
    suggestUrl = EXTERNAL_SERVICES.suggest.google + encodeURIComponent(query);
  } else if (se.indexOf('yandex') !== -1) {
    suggestUrl = EXTERNAL_SERVICES.suggest.yandex + encodeURIComponent(query) + '&uil=ru&v=3&sn=5&lr=213';
  } else {
    suggestUrl = EXTERNAL_SERVICES.suggest.duckduckgo + encodeURIComponent(query);
  }
  try {
    const resp = await require('electron').net.fetch(suggestUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(3000)
    });
    if (!resp.ok) return [];
    const json = await resp.json();
    let suggestions = [];
    if (Array.isArray(json)) {
      if (Array.isArray(json[1])) {
        suggestions = json[1].map(s => typeof s === 'string' ? s : (s.phrase || s.text || '')).filter(Boolean);
      } else {
        suggestions = json.map(s => typeof s === 'string' ? s : (s.phrase || s.text || '')).filter(Boolean);
      }
    } else if (json && Array.isArray(json.suggestions)) {
      suggestions = json.suggestions.map(s => typeof s === 'string' ? s : (s.value || s.text || '')).filter(Boolean);
    }
    return suggestions.slice(0, 6);
  } catch(e) { return []; }
});

// ============== STARTUP ==============
ipcMain.handle('get-save-tabs', () => saveTabsSetting);
ipcMain.handle('set-save-tabs', (_, val) => { saveTabsSetting = val; return { success: true }; });
ipcMain.handle('get-save-internal-pages', () => saveInternalPagesSetting);
ipcMain.handle('set-save-internal-pages', (_, val) => { saveInternalPagesSetting = val; return { success: true }; });

// ============== SPONSORBLOCK ==============
ipcMain.handle('get-sponsorblock-enabled', () => {
  const store = readStorage();
  return store.sponsorBlockEnabled !== undefined ? store.sponsorBlockEnabled : false;
});
ipcMain.handle('set-sponsorblock-enabled', (_, val) => {
  const store = readStorage();
  store.sponsorBlockEnabled = val;
  writeStorage(store);
  return { success: true };
});

// ============== SPONSORBLOCK STATS ==============
ipcMain.handle('get-sponsorblock-stats', () => {
  const store = readStorage();
  return store.sponsorBlockStats || { segments: 0, timeSaved: 0 };
});
ipcMain.handle('update-sponsorblock-stats', (_, data) => {
  const store = readStorage();
  if (!store.sponsorBlockStats) store.sponsorBlockStats = { segments: 0, timeSaved: 0 };
  store.sponsorBlockStats.segments += (data.segments || 0);
  store.sponsorBlockStats.timeSaved += (data.timeSaved || 0);
  writeStorage(store);
  return { success: true };
});

// ============== CUSTOM FILTERS ==============
ipcMain.handle('get-custom-filters', () => {
  const store = readStorage();
  return store.customFilters || '';
});
ipcMain.handle('save-custom-filters', (_, text) => {
  const store = readStorage();
  store.customFilters = text;
  writeStorage(store);
  if (adblocker && adblocker.updateCustomFilters) {
    adblocker.updateCustomFilters(text);
  }
  return { success: true };
});

// ============== OPTIMIZATION SETTINGS ==============
ipcMain.handle('get-optimization-setting', (_, key) => {
  const store = readStorage();
  if (!store.optimization) return undefined;
  return store.optimization[key];
});
ipcMain.handle('set-optimization-setting', (_, key, val) => {
  const store = readStorage();
  if (!store.optimization) store.optimization = {};
  store.optimization[key] = val;
  writeStorage(store);
  applyOptimizationRuntime();
  return { success: true };
});
ipcMain.handle('get-all-optimization-settings', () => {
  const store = readStorage();
  return store.optimization || {};
});
ipcMain.on('get-all-optimization-settings-sync', (event) => {
  const store = readStorage();
  event.returnValue = store.optimization || {};
});

function applyOptimizationStartup() {
  var store = readStorage();
  var opt = store.optimization || {};
  if (opt.diskCache && opt.diskCache > 0) {
    app.commandLine.appendSwitch('disk-cache-size', String(opt.diskCache));
  }
  if (opt.gpu === false) {
    app.commandLine.appendSwitch('disable-gpu');
    app.commandLine.appendSwitch('disable-gpu-compositing');
    app.commandLine.appendSwitch('disable-software-rasterizer');
    process.env.ELECTRON_DISABLE_GPU = '1';
  }
  if (opt.processLimit && opt.processLimit > 0) {
    app.commandLine.appendSwitch('renderer-process-limit', String(opt.processLimit));
  }
}
applyOptimizationStartup();

function applyOptimizationRuntime() {
  if (!_mainWindow) return;
  try { _mainWindow.webContents.send('optimization-settings-changed'); } catch(e) {}
}

// ============== TASK MANAGER ==============
// renderer.js periodically (every 2 sec) sends the list of tabs with their pids here.
// main stores the last snapshot and on request from TaskManager.html merges it with
// app.getAppMetrics() (there is live data on memory/CPU of each process).
var _tmTabInfos = [];
var _tmCache = null;
var _tmCacheTime = 0;
var _TM_CACHE_TTL = 1500; // ms — cache getAppMetrics result so we do not call it too often

ipcMain.on('tm-tabs-update', (_, infos) => {
  _tmTabInfos = Array.isArray(infos) ? infos : [];
});

ipcMain.handle('get-task-manager-data', () => {
  var now = Date.now();
  if (_tmCache && (now - _tmCacheTime) < _TM_CACHE_TTL) {
    return _tmCache;
  }
  var metrics = [];
  try { metrics = app.getAppMetrics() || []; } catch(e) {}
  // Index: pid -> {memoryKB, cpu}
  var byPid = {};
  metrics.forEach(function(m) {
    if (!m || !m.pid) return;
    byPid[m.pid] = {
      memoryKB: (m.memory && m.memory.workingSetSize) || 0,
      cpu: (m.cpu && m.cpu.percentCPUUsage) || 0
    };
  });
  // Match tabs with their processes
  var tabRows = (_tmTabInfos || []).map(function(t) {
    var pid = t.pid || null;
    var mm = pid ? byPid[pid] : null;
    return {
      kind: 'tab',
      tabId: t.id,
      pid: pid,
      title: t.title || '',
      url: t.url || '',
      hostname: t.hostname || '',
      favicon: t.favicon || '',
      isSleeping: !!t.isSleeping,
      isFrozen: !!t.isFrozen,
      isActive: !!t.isActive,
      isPinned: !!t.isPinned,
      isWhitelisted: !!t.isWhitelisted,
      memoryKB: mm ? mm.memoryKB : 0,
      cpu: mm ? mm.cpu : 0
    };
  });

  // Browser processes (not bound to tabs) — Browser, GPU, Utility, etc.
  var tabPids = {};
  (_tmTabInfos || []).forEach(function(t) { if (t.pid) tabPids[t.pid] = true; });
  var procRows = [];
  var totalMemKB = 0;
  var totalCpu = 0;
  metrics.forEach(function(m) {
    var mem = (m.memory && m.memory.workingSetSize) || 0;
    var cpu = (m.cpu && m.cpu.percentCPUUsage) || 0;
    totalMemKB += mem;
    totalCpu += cpu;
    if (tabPids[m.pid]) return; // already shown as a tab
    var typeLabel = m.type || 'process';
    procRows.push({
      kind: 'process',
      pid: m.pid,
      type: typeLabel,
      title: _tmProcessLabel(typeLabel),
      memoryKB: mem,
      cpu: cpu
    });
  });

  var result = {
    tabs: tabRows,
    processes: procRows,
    totals: { memoryKB: totalMemKB, cpu: Math.round(totalCpu * 10) / 10 }
  };
  _tmCache = result;
  _tmCacheTime = Date.now();
  return result;
});

function _tmProcessLabel(type) {
  var map = {
    Browser: t('Main process'),
    GPU: t('GPU (graphics)'),
    Utility: t('Utility process'),
    Zygote: t('Zygote'),
    'Sandbox helper': t('Sandbox'),
    Crashing: t('Crashing process'),
    Ppapi: t('Plugin (PPAPI)'),
    Tab: t('Tab process')
  };
  return map[type] || t(type) || t('Process');
}

// Actions from Task Manager → forward to the renderer for execution
ipcMain.on('task-manager-action', (event, action, tabId) => {
  var win = _shellWindowOf(event.sender);
  if (win && !win.isDestroyed()) {
    win.webContents.send('task-manager-action', { action: action, tabId: tabId });
  }
});

// Bulk optimization operations from Settings.html (which has no access to tabs[])
ipcMain.on('optimization-sleep-all', (event) => {
  var win = _shellWindowOf(event.sender);
  if (win && !win.isDestroyed()) {
    win.webContents.send('task-manager-action', { action: 'sleepAll' });
  }
});

// ============== FILTER LISTS ==============
ipcMain.handle('get-filter-lists', () => {
  const store = readStorage();
  var builtin = (adblocker && adblocker.getFilterLists) ? adblocker.getFilterLists() : [];
  var custom = store.filterLists || [];
  return { builtin: builtin, custom: custom };
});
ipcMain.handle('add-filter-list', (_, url) => {
  const store = readStorage();
  if (!store.filterLists) store.filterLists = [];
  if (!store.filterLists.includes(url)) store.filterLists.push(url);
  writeStorage(store);
  return { success: true };
});
ipcMain.handle('remove-filter-list', (_, url) => {
  const store = readStorage();
  if (store.filterLists) {
    store.filterLists = store.filterLists.filter(u => u !== url);
    writeStorage(store);
  }
  return { success: true };
});
ipcMain.handle('update-filter-lists', () => {
  if (adblocker && adblocker.updateAllLists) {
    adblocker.updateAllLists();
  } else if (adblocker && adblocker.reloadFromLists) {
    adblocker.reloadFromLists();
  }
  return { success: true };
});

// ============== CUSTOM HIDE STYLES ==============
ipcMain.handle('get-custom-hide-styles', () => {
  const store = readStorage();
  return store.customHideStyles || '';
});
ipcMain.handle('save-custom-hide-styles', (_, text) => {
  const store = readStorage();
  store.customHideStyles = text;
  writeStorage(store);
  return { success: true };
});

// ============== BLOCKED LOG ==============
ipcMain.handle('get-blocked-log', () => {
  return (adblocker && adblocker.getBlockedLog) ? adblocker.getBlockedLog() : [];
});
ipcMain.handle('clear-blocked-log', () => {
  if (adblocker && adblocker.clearBlockedLog) adblocker.clearBlockedLog();
  const store = readStorage();
  if (store.blockedLog) { store.blockedLog = []; writeStorage(store); }
  return { success: true };
});
ipcMain.handle('get-blocker-log-persistent', () => {
  return !!(adblocker && adblocker.isLogPersistent && adblocker.isLogPersistent());
});
ipcMain.handle('set-blocker-log-persistent', (_, val) => {
  if (adblocker && adblocker.setLogPersistent) adblocker.setLogPersistent(!!val);
  return { success: true };
});

// ============== SECURITY SETTINGS ==============
ipcMain.on('get-all-security-settings-sync', (event) => {
  const store = readStorage();
  var _vimMerged = (function() {
    var v = store.vim || {};
    var keys = _defaultVimKeys();
    if (v.keys && typeof v.keys === 'object') {
      Object.keys(keys).forEach(function(k) {
        if (typeof v.keys[k] === 'string' && v.keys[k].length) keys[k] = v.keys[k];
      });
    }
    return { enabled: !!v.enabled, keys: keys };
  })();
  event.returnValue = {
    security: store.security || {},
    optimization: store.optimization || {},
    vim: _vimMerged
  };
});

// Synchronous per-site geo override lookup — used by preload-webview at load
// time. Returns the {lat, lng, accuracy} saved via the Site Info panel, or null.
ipcMain.on('get-geo-override-sync', (event, domain) => {
  try {
    if (!domain) { event.returnValue = null; return; }
    const store = readStorage();
    var p = store.sitePermissions && store.sitePermissions[domain];
    if (p && p.geoOverride && typeof p.geoOverride.lat === 'number') {
      event.returnValue = p.geoOverride;
      return;
    }
  } catch(e) {}
  event.returnValue = null;
});

ipcMain.handle('get-security-setting', (_, key) => {
  const store = readStorage();
  // Opt-out settings: absent means ENABLED (DNT signal, external services).
  var optOutKeys = ['dnt', 'suggestEnabled', 'translateEnabled', 'hibpEnabled', 'diagnosticsEnabled'];
  if (optOutKeys.indexOf(key) !== -1) {
    if (!store.security || store.security[key] === undefined) return true;
    return !!store.security[key];
  }
  if (!store.security) return false;
  return !!store.security[key];
});
ipcMain.handle('set-security-setting', (_, key, val) => {
  const store = readStorage();
  if (!store.security) store.security = {};
  store.security[key] = val;
  writeStorage(store);
  applySecuritySettings();
  return { success: true };
});
ipcMain.handle('get-all-security-settings', () => {
  const store = readStorage();
  return store.security || {};
});

// ===== DoH (DNS-over-HTTPS) settings =====
// Applied via command-line switches at startup (see applyDnsThroughProxyFlag),
// so a change needs a browser restart — the setter reports that back.
ipcMain.handle('doh-get-settings', () => {
  const store = readStorage();
  return store.doh || { enabled: false, server: '', mode: 'automatic' };
});
ipcMain.handle('doh-set-settings', (_, cfg) => {
  const store = readStorage();
  var next = {
    enabled: !!(cfg && cfg.enabled),
    server: (cfg && typeof cfg.server === 'string') ? cfg.server.trim() : '',
    mode: (cfg && cfg.mode === 'secure') ? 'secure' : 'automatic'
  };
  if (next.enabled && !/^https:\/\/[^\s]+/.test(next.server)) next.enabled = false;
  var prev = store.doh || { enabled: false, server: '', mode: 'automatic' };
  var changed = !prev || prev.enabled !== next.enabled || prev.server !== next.server || prev.mode !== next.mode;
  store.doh = next;
  writeStorage(store);
  return { success: true, needRestart: changed };
});

// ===== "Open site as app" (minimal SSB) =====
// A chromeless window per origin: no tabs/url bar, just the site. Windows
// are keyed by origin — a second "open" focuses the existing one.
var _appWindows = {};
ipcMain.handle('open-site-as-app', (_, url) => {
  try {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false };
    var u = new URL(url);
    var key = u.origin;
    if (_appWindows[key]) {
      var ex = _appWindows[key];
      if (!ex.isDestroyed()) { ex.show(); ex.focus(); return { ok: true }; }
      delete _appWindows[key];
    }
    var w = new BrowserWindow({
      width: 1280,
      height: 860,
      title: u.hostname,
      backgroundColor: '#16161e',
      autoHideMenuBar: true,
      webPreferences: {
        session: session.defaultSession,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    _appWindows[key] = w;
    w.on('closed', function() { delete _appWindows[key]; });
    // Block window.open popups inside app windows (keep the app single-window).
    w.webContents.setWindowOpenHandler(function() { return { action: 'deny' }; });
    w.loadURL(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});

// ===== Torrent client — REMOVED =====
// The webtorrent-based client was dropped: its dependency tree pulls
// ip@2.0.1 (unfixable advisory GHSA-2p57-rm9w-gvfp — no patched release
// exists) which broke `npm audit fix` (it tried a webtorrent 0.7.3
// downgrade depending on an unpublished package). Any residual
// store.torrents key in settings.json is inert and ignored.

// ===== File viewer =====
// Viewer.html (JSON/Markdown/font/image) asks for local file content.
// Internal file:// pages are trusted the but the surface is still limited:
// only viewer-capable extensions are readable, and the browser's own data
// directory (settings.json with passwords, backups, Tor state) is off-limits
// so a compromised viewer page cannot exfiltrate profile secrets.
const VIEWER_ALLOWED_EXTS = new Set([
  'json', 'geojson', 'har',
  'md', 'markdown', 'mdown',
  'ttf', 'otf', 'woff', 'woff2',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'ico'
]);
function _pathInside(dir, p) {
  try {
    var rel = path.relative(dir, p);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  } catch (e) { return false; }
}
ipcMain.handle('viewer-read-file', (event, filePath, encoding) => {
  try {
    // Only the viewer page itself may read files: a compromised internal
    // page (e.g. via injected theme CSS) must not gain arbitrary file reads.
    var senderUrl = '';
    try { senderUrl = event.senderFrame && event.senderFrame.url || ''; } catch (e0) {}
    var senderPath = '';
    try { senderPath = decodeURIComponent(new URL(senderUrl).pathname); } catch (e1) {}
    if (process.platform === 'win32' && senderPath.startsWith('/')) senderPath = senderPath.slice(1);
    var appDir = electronApp.getAppPath();
    if (!senderPath || path.basename(senderPath) !== 'Viewer.html' || !_pathInside(appDir, path.dirname(senderPath))) {
      return { ok: false, error: 'viewer access denied' };
    }
    if (typeof filePath !== 'string' || !filePath) return { ok: false, error: 'bad path' };
    // Reject anything that is not a plain local path.
    if (filePath.indexOf('file://') === 0) {
      try { filePath = decodeURIComponent(new URL(filePath).pathname); } catch (e) {}
    }
    var extMatch = filePath.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (!extMatch || !VIEWER_ALLOWED_EXTS.has(extMatch[1])) {
      return { ok: false, error: 'file type not supported by viewer' };
    }
    var resolved = path.resolve(filePath);
    if (_pathInside(app.getPath('userData'), resolved)) {
      return { ok: false, error: 'browser data directory is not readable' };
    }
    if (!fs.existsSync(resolved)) return { ok: false, error: 'not found' };
    var st = fs.statSync(resolved);
    if (!st.isFile()) return { ok: false, error: 'not a file' };
    if (st.size > 64 * 1024 * 1024) return { ok: false, error: 'file too large (64 MB limit)' };
    if (encoding === 'base64') {
      return { ok: true, data: fs.readFileSync(resolved).toString('base64'), size: st.size };
    }
    var text = fs.readFileSync(resolved, 'utf8');
    return { ok: true, data: text.length > 2000000 ? text.slice(0, 2000000) + '\n… (truncated at 2 MB)' : text, size: st.size };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
});

// ===== OCR (tesseract.js) =====
// Takes a PNG (base64) captured by the OCR tool, recognizes text offline
// (language data is downloaded once into userData/tessdata and cached).
// Language: rus+eng when the UI language is Russian, eng otherwise.
var _ocrWorker = null;
var _ocrWorkerLang = '';
var _ocrBusy = false;
function _ocrLangs() {
  try {
    const store = readStorage();
    return store.language === 'ru' ? 'rus+eng' : 'eng';
  } catch (e) { return 'eng'; }
}
ipcMain.handle('ocr-recognize', async (_, pngBase64) => {
  try {
    if (_ocrBusy) return { ok: false, error: 'busy' };
    if (typeof pngBase64 !== 'string' || pngBase64.length < 64) return { ok: false, error: 'bad image' };
    var T = null;
    try { T = require('tesseract.js'); } catch (e) { return { ok: false, error: 'tesseract.js not installed' }; }
    _ocrBusy = true;
    var lang = _ocrLangs();
    try {
      if (!_ocrWorker || _ocrWorkerLang !== lang) {
        if (_ocrWorker) { try { await _ocrWorker.terminate(); } catch (e2) {} _ocrWorker = null; }
        _ocrWorker = await T.createWorker(lang, 1, {
          cachePath: path.join(electronApp.getPath('userData'), 'tessdata'),
          logger: function() {}
        });
        _ocrWorkerLang = lang;
      }
      var buf = Buffer.from(pngBase64, 'base64');
      var res = await _ocrWorker.recognize(buf);
      var text = (res && res.data && res.data.text) || '';
      return { ok: true, text: text.trim() };
    } finally {
      _ocrBusy = false;
    }
  } catch (e) {
    _ocrBusy = false;
    return { ok: false, error: String(e && e.message || e) };
  }
});

// ===== Per-page notes =====
// Stored in settings.json under `pageNotes`: { [normalizedUrl]: text }.
// Key = scheme://host/path?query (hash stripped) — the note follows the page,
// not the session. Gated by security.pageNotes toggle in the renderer.
function _pageNoteKey(url) {
  try {
    var u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    // Lowercase ONLY the origin: paths are case-sensitive on many servers
    // (/A/b and /a/b can be different pages).
    return (u.origin.toLowerCase() + u.pathname + u.search);
  } catch(e) { return null; }
}
ipcMain.handle('page-notes-get', (_, url) => {
  var k = _pageNoteKey(url);
  if (!k) return null;
  const store = readStorage();
  var notes = store.pageNotes || {};
  return notes[k] || '';
});
ipcMain.handle('page-notes-set', (_, url, text) => {
  var k = _pageNoteKey(url);
  if (!k) return { success: false };
  const store = readStorage();
  if (!store.pageNotes) store.pageNotes = {};
  if (typeof text === 'string' && text.trim()) {
    store.pageNotes[k] = text.slice(0, 20000);
  } else {
    delete store.pageNotes[k];
  }
  // Hard cap: keep at most 500 notes (oldest keys dropped).
  var keys = Object.keys(store.pageNotes);
  if (keys.length > 500) {
    keys.slice(0, keys.length - 500).forEach(function(kk) { delete store.pageNotes[kk]; });
  }
  writeStorage(store);
  return { success: true };
});

// Cookie-banner blocker: inject the shared payload into EVERY frame of the
// target webview. Cross-origin CMP iframes (spiegel.de → sourcepoint.spiegel.de,
// consentmanager, …) are unreachable from the top document, so the reject
// click must happen inside the frame itself. The payload is idempotent
// (guards on window.__spzCookieBlocker). CMP iframes tend to attach late, so
// the frame tree is re-walked a few times; Sourcepoint even swaps the iframe
// URL when opening the privacy manager, and the later walks catch that frame.
ipcMain.handle('inject-cookie-blocker-frames', async (_, wcId) => {
  try {
    if (typeof wcId !== 'number' || !_cookieBlockerPayload) return false;
    var wc = webContents.fromId(wcId);
    if (!wc || wc.isDestroyed()) return false;
    try { if (wc.getType() !== 'webview') return false; } catch (e) { return false; }
    var code = '(' + _cookieBlockerPayload.toString() + ')()';
    async function walk() {
      if (!wc || wc.isDestroyed()) return;
      try {
        var mainFrame = wc.mainFrame;
        if (!mainFrame) return;
        var frames = [mainFrame];
        try { if (Array.isArray(mainFrame.framesInSubtree) && mainFrame.framesInSubtree.length) frames = mainFrame.framesInSubtree; } catch (e) {}
        for (var i = 0; i < frames.length; i++) {
          var f = frames[i];
          if (!f || f === mainFrame) continue; // top document — renderer already injected there
          if (typeof f.executeJavaScript !== 'function') continue;
          try { if (typeof f.url === 'string' && f.url.indexOf('http') !== 0) continue; } catch (e) { continue; }
          try { await f.executeJavaScript(code); } catch (e) {} // frame may navigate away mid-injection
        }
      } catch (e) {}
    }
    await walk();
    setTimeout(function() { walk(); }, 700);
    setTimeout(function() { walk(); }, 2000);
    setTimeout(function() { walk(); }, 4500);
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('clean-url', (_, url) => {
  return cleanTrackingUrl(url);
});

// ============== HOMEPAGE (own home page) ==============
// store.homepage = { type: 'default' | 'url' | 'file', value: string }
//   type='default' → built-in MainPage/index.html
//   type='url'     → value is an https://... link
//   type='file'    → value is a file:///... absolute path to a local HTML
ipcMain.handle('get-homepage', () => {
  const store = readStorage();
  var hp = store.homepage || { type: 'default', value: '' };
  // Normalize in case of old/broken values
  if (!hp.type || hp.type === 'default') return { type: 'default', value: '' };
  if (!hp.value) return { type: 'default', value: '' };
  return { type: hp.type, value: String(hp.value) };
});

ipcMain.handle('set-homepage', (_, hp) => {
  const store = readStorage();
  var next = { type: 'default', value: '' };
  if (hp && (hp.type === 'url' || hp.type === 'file') && hp.value) {
    var v = String(hp.value).trim();
    // Protection against accidentally storing an arbitrary path without a scheme
    if (hp.type === 'url' && !/^[a-z]+:\/\//i.test(v)) v = 'https://' + v;
    if (hp.type === 'file' && v.indexOf('file://') !== 0) {
      // Convert a regular path to a file:// URL
      v = 'file://' + v.replace(/^file:\/\//, '');
    }
    next = { type: hp.type, value: v };
  }
  store.homepage = next;
  writeStorage(store);
  // Optional: open the page immediately to verify — we DO NOT do this,
  // the user will press the "Home" button themselves.
  return { success: true, homepage: next };
});

// Dialog for selecting a local HTML file for the home page
ipcMain.handle('choose-homepage-file', async () => {
  try {
    var { dialog } = require('electron');
    var res = await dialog.showOpenDialog(_mainWindow, {
      title: 'Select the home page HTML file',
      filters: [
        { name: 'HTML', extensions: ['html', 'htm'] },
        { name: 'All files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    if (res.canceled || !res.filePaths || !res.filePaths[0]) {
      return { canceled: true };
    }
    var fp = res.filePaths[0];
    return { canceled: false, path: fp, url: 'file://' + fp };
  } catch(e) {
    return { canceled: true, error: e && e.message };
  }
});

// ============== FIRST-LAUNCH / WELCOME ==============
ipcMain.handle('is-first-launch', () => {
  const store = readStorage();
  return !store.welcomed;
});
ipcMain.handle('mark-welcomed', () => {
  const store = readStorage();
  store.welcomed = true;
  writeStorage(store);
  return { success: true };
});

// Called from Start.htm setup wizard — saves all settings at once
ipcMain.handle('complete-setup', (_, settings) => {
  const store = readStorage();
  // Theme
  if (settings.theme) {
    store.theme = settings.theme;
  }
  // Window opacity
  if (settings.opacity !== undefined && settings.opacity !== null) {
    store.windowOpacity = settings.opacity;
    try { if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setOpacity(Math.max(0.1, Math.min(1, settings.opacity)));
      mainWindow.webContents.send('window-opacity-changed', Math.max(0.1, Math.min(1, settings.opacity)));
    } } catch(e) {}
  }
  // Accent color — store in customization (the renderer reads it from there)
  if (settings.accent) {
    if (!store.customization || typeof store.customization !== 'object') store.customization = {};
    store.customization.accentColor = settings.accent;
    store.accentColor = settings.accent;
    store.accentRgb = settings.accentRgb || '';
    store.accentLight = settings.accentLight || '';
  }
  // Security settings
  if (!store.security) store.security = {};
  if (settings.blockTrackers !== undefined) store.security.blockTrackers = settings.blockTrackers;
  if (settings.blockSocialWidgets !== undefined) store.security.blockSocialWidgets = settings.blockSocialWidgets;
  if (settings.blockAds !== undefined) store.security.blockAds = settings.blockAds;
  // Tab restore
  if (settings.restoreTabs !== undefined) {
    store.saveTabs = settings.restoreTabs;
    saveTabsSetting = settings.restoreTabs;
  }
  // Mark as done
  store.welcomed = true;
  writeStorage(store);
  // Apply security + theme
  try { applySecuritySettings(); } catch(e) {}
  // Enable/disable adblocker based on protection toggles
  if (adblocker && adblocker.setEnabled) {
    var enableAdblock = settings.blockTrackers || settings.blockSocialWidgets || settings.blockAds;
    if (enableAdblock !== undefined) {
      adblocker.setEnabled(enableAdblock !== false);
      if (mainWindow && !mainWindow.isDestroyed()) {
        var ses = mainWindow.webContents.session;
        try { adblocker.reEnable(ses, _secBeforeRequest); } catch(e) {}
      }
    }
  }
  try { if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme-updated', settings.theme || store.theme || 'dark');
  } } catch(e) {}
  _broadcastCustomization(store.customization || {});
  return { success: true };
});

// ============== I18N / LANGUAGE ==============
// English is the source language in code; Russian is provided via locales/ru.json.
// t(str) returns the localized string for the current language (used by main-process
// dialogs, menus, notifications).
let _i18nRu = null;
let _i18nLang = null;
function _loadLocaleRu() {
  if (_i18nRu !== null) return _i18nRu;
  try { _i18nRu = JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', 'ru.json'), 'utf8')); }
  catch(e) { _i18nRu = {}; }
  return _i18nRu;
}
function getCurrentLanguage() {
  if (_i18nLang) return _i18nLang;
  try { _i18nLang = (readStorage().language === 'ru') ? 'ru' : 'en'; } catch(e) { _i18nLang = 'en'; }
  return _i18nLang;
}
function t(str) {
  if (!str) return str;
  if (getCurrentLanguage() === 'en') return str;
  const d = _loadLocaleRu();
  return (d && Object.prototype.hasOwnProperty.call(d, str)) ? d[str] : str;
}
ipcMain.handle('get-language', () => getCurrentLanguage());
ipcMain.handle('set-language', (e, l) => {
  _i18nLang = (l === 'ru') ? 'ru' : 'en';
  const s = readStorage(); s.language = _i18nLang; writeStorage(s);
  try {
    const { webContents } = require('electron');
    webContents.getAllWebContents().forEach(function(wc) {
      try { wc.send('language-changed', _i18nLang); } catch(e2) {}
    });
  } catch(e3) {}
  return _i18nLang;
});
ipcMain.handle('get-locale', (e, l) => {
  _i18nRu = null;
  const lang = l || getCurrentLanguage();
  return lang === 'ru' ? _loadLocaleRu() : {};
});

// ============== VIM-LIKE CONTROL ==============
// store.vim = { enabled: bool, keys: { action: 'keystring', ... } }
// Actions (keystring is either a single character, or 'gg', 'Ctrl+t', etc.):
//   scrollDown, scrollUp, scrollLeft, scrollRight,
//   scrollPageDown, scrollPageUp, scrollHalfDown, scrollHalfUp,
//   scrollTop, scrollBottom, scrollLeftmost, scrollRightmost,
//   reload, reloadHard, newTab, closeTab, restoreTab, nextTab, prevTab,
//   focusUrl, focusUrlCurrent, find, searchForward, searchNext, searchPrev,
//   back, forward, hint, hintTab, yankUrl, pasteUrl,
//   enterInsert, enterVisual, enterVisualLine, enterCommand,
//   zoomIn, zoomOut, zoomReset, stopLoad,
//   prevPage, nextPage, markSet, markJump
function _defaultVimKeys() {
  return {
    scrollDown: 'j',
    scrollUp: 'k',
    scrollLeft: 'h',
    scrollRight: 'l',
    scrollPageDown: 'd',
    scrollPageUp: 'u',
    scrollHalfDown: 'ctrl+d',
    scrollHalfUp: 'ctrl+u',
    scrollTop: 'gg',
    scrollBottom: 'G',
    scrollLeftmost: '0',
    scrollRightmost: '$',
    reload: 'r',
    reloadHard: 'R',
    newTab: 't',
    closeTab: 'x',
    restoreTab: 'X',
    nextTab: 'J',
    prevTab: 'K',
    focusUrl: 'o',
    focusUrlCurrent: 'O',
    find: '/',
    searchForward: '/',
    searchNext: 'n',
    searchPrev: 'N',
    back: 'H',
    forward: 'L',
    hint: 'f',
    hintTab: 'F',
    yankUrl: 'yy',
    pasteUrl: 'p',
    enterInsert: 'i',
    enterVisual: 'v',
    enterVisualLine: 'V',
    enterCommand: ':',
    zoomIn: '+',
    zoomOut: '-',
    zoomReset: 'zz',
    stopLoad: 's',
    prevPage: '[[',
    nextPage: ']]'
  };
}

// Broadcast vim settings to ALL webContents (including webviews),
// so changes in Settings apply without reloading pages.
function _broadcastVimSettings(vim) {
  try {
    var { webContents } = require('electron');
    webContents.getAllWebContents().forEach(function(wc) {
      try { wc.send('vim-settings-changed', vim); } catch(e) {}
    });
  } catch(e) {}
}

ipcMain.handle('get-vim-settings', () => {
  const store = readStorage();
  var v = store.vim || {};
  var keys = _defaultVimKeys();
  if (v.keys && typeof v.keys === 'object') {
    Object.keys(keys).forEach(function(k) {
      if (typeof v.keys[k] === 'string' && v.keys[k].length) keys[k] = v.keys[k];
    });
  }
  return { enabled: !!v.enabled, keys: keys };
});

ipcMain.handle('set-vim-settings', (_, settings) => {
  const store = readStorage();
  var next = { enabled: !!(settings && settings.enabled), keys: _defaultVimKeys() };
  if (settings && settings.keys && typeof settings.keys === 'object') {
    Object.keys(next.keys).forEach(function(k) {
      if (typeof settings.keys[k] === 'string' && settings.keys[k].length) {
        next.keys[k] = settings.keys[k];
      }
    });
  }
  store.vim = next;
  writeStorage(store);
  // Update the main.js cache (for chrome → webview forwarding)
  _vimMainCache.enabled = next.enabled;
  _vimRebuildMainCache(next.keys);
  // Apply live to all open pages
  _broadcastVimSettings(next);
  return { success: true, vim: next };
});

ipcMain.handle('reset-vim-settings', () => {
  const store = readStorage();
  store.vim = { enabled: !!(store.vim && store.vim.enabled), keys: _defaultVimKeys() };
  writeStorage(store);
  _vimMainCache.enabled = store.vim.enabled;
  _vimRebuildMainCache(store.vim.keys);
  _broadcastVimSettings(store.vim);
  return { success: true, vim: store.vim };
});

// Relay vim-action from webview → renderer (browser commands:
// new tab, tab switching, etc.). Send to the main window
// via the 'vim-action' channel — renderer.js listens to it.
ipcMain.on('vim-action', (_, action, arg) => {
  try {
    var w = _mainWindow || mainWindow;
    if (w && !w.isDestroyed()) {
      w.webContents.send('vim-action', { action: action, arg: arg });
    }
  } catch(e) {}
});

// Relay Super Drag actions (webview → renderer). kind: 'text' (search),
// 'link' (background tab), 'image' (reverse image search).
ipcMain.on('super-drag-action', (event, kind, payload) => {
  _superDragAction(event.sender, kind, payload);
});

function _superDragAction(senderWc, kind, payload) {
  try {
    var w = (senderWc && _shellWindowOf(senderWc)) || _mainWindow || mainWindow;
    if (w && !w.isDestroyed()) {
      w.webContents.send('super-drag-action', { kind: kind, payload: payload });
    }
  } catch(e) {}
}

// ============== TOR HARDENING (individual toggles) ==============
// store.security.torHardening = {
//   js: bool       — CSP script-src 'none' (disables JavaScript)
//   webgl: bool    — disables WebGL (via preload-webview, not CSP)
//   fonts: bool    — CSP font-src 'self' data: (blocks remote fonts)
//   plugins: bool  — CSP object-src 'none' (Flash/PDF/etc)
//   iframes: bool  — CSP frame-src 'self' (blocks external iframes)
//   base: bool     — CSP base-uri 'self'
// }
// Each option is independent. Applied to all http/https pages.
ipcMain.handle('get-tor-hardening', () => {
  const store = readStorage();
  var th = (store.security && store.security.torHardening) || {};
  return {
    js: !!th.js,
    webgl: !!th.webgl,
    fonts: !!th.fonts,
    plugins: !!th.plugins,
    iframes: !!th.iframes,
    base: !!th.base
  };
});

ipcMain.handle('set-tor-hardening', (_, settings) => {
  const store = readStorage();
  if (!store.security) store.security = {};
  store.security.torHardening = {
    js: !!(settings && settings.js),
    webgl: !!(settings && settings.webgl),
    fonts: !!(settings && settings.fonts),
    plugins: !!(settings && settings.plugins),
    iframes: !!(settings && settings.iframes),
    base: !!(settings && settings.base)
  };
  writeStorage(store);
  applySecuritySettings();
  return { success: true, torHardening: store.security.torHardening };
});

// Compatibility with the old API (if something still uses torLevel) —
// return 'safer' if there is webgl/fonts, 'safest' if js, otherwise 'standard'.
ipcMain.handle('get-tor-security-level', () => {
  const store = readStorage();
  var th = (store.security && store.security.torHardening) || {};
  if (th.js) return 'safest';
  if (th.webgl || th.fonts || th.plugins) return 'safer';
  return 'standard';
});
ipcMain.handle('set-tor-security-level', (_, lvl) => {
  // Translate old levels to new toggles
  const store = readStorage();
  if (!store.security) store.security = {};
  if (lvl === 'safest') {
    store.security.torHardening = { js: true, webgl: true, fonts: true, plugins: true, iframes: true, base: true };
  } else if (lvl === 'safer') {
    store.security.torHardening = { js: false, webgl: true, fonts: true, plugins: true, iframes: false, base: true };
  } else {
    store.security.torHardening = { js: false, webgl: false, fonts: false, plugins: false, iframes: false, base: false };
  }
  writeStorage(store);
  applySecuritySettings();
  return { success: true, level: lvl };
});

// ============== HISTORY ==============
// An incognito context must not even SEE the shared history: Library opened
// in an incognito window shows an empty list (and incognito tabs never write
// to it — see the renderer addHistory guards).
// In-memory sessions (incognito tabs, torn-out tabs) have no storage path —
// `session.partition` does not exist in Electron, so the old partition-string
// checks were dead code.
function _sessionIsIncognito(ses) {
  try { return !!ses && !ses.getStoragePath(); } catch (e) { return false; }
}

function _senderIsIncognito(event) {
  try {
    var ses = event && event.sender && event.sender.session;
    return _sessionIsIncognito(ses);
  } catch (e) { return false; }
}

ipcMain.handle('get-history', (event) => {
  if (_senderIsIncognito(event)) return [];
  const store = readStorage();
  return store.history || [];
});

ipcMain.handle('add-history', (_, entry) => {
  const store = readStorage();
  if (!store.history) store.history = [];
  const existing = store.history.findIndex(h => h.url === entry.url);
  if (existing !== -1) {
    store.history[existing].time = Date.now();
    store.history[existing].title = entry.title || store.history[existing].title;
    store.history[existing].visitCount = (store.history[existing].visitCount || 0) + 1;
  } else {
    store.history.push({
      url: entry.url,
      title: entry.title || '',
      time: Date.now(),
      visitCount: 1
    });
  }
  writeStorage(store);
  return { success: true };
});

ipcMain.handle('clear-history', () => {
  const store = readStorage();
  store.history = [];
  writeStorage(store);
  if (mainWindow) mainWindow.webContents.send('history-updated');
  return { success: true };
});

// ============== SITE PERMISSIONS ==============
// All permission keys are normalised to camelCase on the way in (see
// _normalisePermKey), so reads/writes use one canonical form regardless of
// whether Chromium emitted 'clipboard-read' or 'clipboardRead'.
ipcMain.handle('get-site-permissions', () => {
  const store = readStorage();
  var raw = store.sitePermissions || {};
  var out = {};
  Object.keys(raw).forEach(function(domain) {
    var src = raw[domain] || {};
    var dst = {};
    Object.keys(src).forEach(function(k) {
      if (k === 'geoOverride') { dst.geoOverride = src[k]; return; }
      dst[_normalisePermKey(k)] = src[k];
    });
    out[domain] = dst;
  });
  return out;
});

ipcMain.handle('set-site-permission', (_, domain, permission, value) => {
  const store = readStorage();
  if (!store.sitePermissions) store.sitePermissions = {};
  if (!store.sitePermissions[domain]) store.sitePermissions[domain] = {};
  if (value === undefined || value === null) {
    delete store.sitePermissions[domain][_normalisePermKey(permission)];
  } else {
    store.sitePermissions[domain][_normalisePermKey(permission)] = value;
  }
  writeStorage(store);
  _refreshSitePermCache();
  return { success: true };
});

ipcMain.handle('set-geo-override', (_, domain, coords) => {
  const store = readStorage();
  if (!store.sitePermissions) store.sitePermissions = {};
  if (!store.sitePermissions[domain]) store.sitePermissions[domain] = {};
  if (coords && typeof coords === 'object') {
    store.sitePermissions[domain].geoOverride = {
      lat: Number(coords.lat), lng: Number(coords.lng),
      accuracy: Number(coords.accuracy) || 50
    };
  } else {
    delete store.sitePermissions[domain].geoOverride;
  }
  writeStorage(store);
  return { success: true };
});

ipcMain.handle('remove-site-permissions', (_, domain) => {
  const store = readStorage();
  if (store.sitePermissions && store.sitePermissions[domain]) {
    delete store.sitePermissions[domain];
    writeStorage(store);
  }
  return { success: true };
});

// Per-site certificate exception — set from ErrorPage/security.html when the
// user clicks "Proceed to site (unsafe)". Stored separately from
// sitePermissions to make it easy to audit/clear security exceptions.
ipcMain.handle('set-cert-exception', (_, domain, allow) => {
  const store = readStorage();
  if (!store.certExceptions) store.certExceptions = {};
  if (allow) store.certExceptions[domain] = true;
  else delete store.certExceptions[domain];
  writeStorage(store);
  // Refresh the in-memory cache so the verifier picks up the change without
  // re-reading settings.json on the next request.
  try { _certExceptionsCache = store.certExceptions; } catch(e) {}
  return { success: true };
});

ipcMain.handle('get-cert-exceptions', () => {
  const store = readStorage();
  return store.certExceptions || {};
});

// HTTP-consent — when the user opens an http:// site we route them through
// ErrorPage/security.html first. Once they click "Proceed" we remember the
// hostname so subsequent visits do not nag them.
ipcMain.handle('set-http-consent', (_, domain, allow) => {
  const store = readStorage();
  if (!store.httpConsents) store.httpConsents = {};
  if (allow) store.httpConsents[domain] = true;
  else delete store.httpConsents[domain];
  writeStorage(store);
  return { success: true };
});

ipcMain.handle('get-http-consent', (_, domain) => {
  const store = readStorage();
  return !!(store.httpConsents && store.httpConsents[domain]);
});

ipcMain.handle('get-all-http-consents', () => {
  const store = readStorage();
  return store.httpConsents || {};
});

// ============== COOKIES ==============
ipcMain.handle('get-cookies', async () => {
  try {
    if (!mainWindow) return [];
    const cookies = await mainWindow.webContents.session.cookies.get({});
    return cookies;
  } catch(e) {
    return [];
  }
});

ipcMain.handle('get-cookies-for-domain', async (_, domain) => {
  try {
    const cookies = await mainWindow.webContents.session.cookies.get({ domain: domain });
    return cookies;
  } catch(e) {
    return [];
  }
});

ipcMain.handle('remove-cookie', async (_, url, name) => {
  try {
    await mainWindow.webContents.session.cookies.remove(url, name);
    return { success: true };
  } catch(e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('clear-cookies', async (event) => {
  try {
    // Act on the window that requested it (incognito shell included).
    var shell = (event && _shellWindowOf(event.sender)) || mainWindow;
    var ses = shell && !shell.isDestroyed() ? shell.webContents.session : mainWindow.webContents.session;
    const cookies = await ses.cookies.get({});
    for (const c of cookies) {
      const proto = c.secure ? 'https' : 'http';
      const url = proto + '://' + c.domain.replace(/^\./, '') + c.path;
      await ses.cookies.remove(url, c.name);
    }
    return { success: true };
  } catch(e) {
    return { success: false, message: e.message };
  }
});

// "Break magnifier" (like the fire in DuckDuckGo): deletes all cookies
// of external sites, but keeps the cookies of the built-in browser pages
// (file:// — Settings, MainPage, ErrorPage; localhost/127.0.0.1).
ipcMain.handle('break-loupe', async () => {
  try {
    const ses = mainWindow.webContents.session;
    const allCookies = await ses.cookies.get({});
    let removed = 0;
    let kept = 0;
    for (const c of allCookies) {
      const domain = (c.domain || '').toLowerCase();
      // Built-in browser pages (file://, about:) have no domain.
      // Skip empty domains and localhost — these are "browser pages".
      if (!domain || domain === 'localhost' || domain === '127.0.0.1') {
        kept++;
        continue;
      }
      try {
        const proto = c.secure ? 'https://' : 'http://';
        const url = proto + domain.replace(/^\./, '') + c.path;
        await ses.cookies.remove(url, c.name);
        removed++;
      } catch(e) {}
    }
    return { success: true, removed: removed, kept: kept };
  } catch(e) {
    return { success: false, message: e.message };
  }
});

// ============== DOWNLOADS ==============
ipcMain.handle('get-downloads', (event) => {
  if (_senderIsIncognito(event)) return [];
  const store = readStorage();
  return store.downloads || [];
});

ipcMain.handle('get-session-downloads', () => {
  const store = readStorage();
  const sessionStart = store._sessionStartTime || Date.now();
  return (store.downloads || []).filter(d => d.startTime >= sessionStart);
});

// Restrict renderer-requested file operations to plausible download locations.
// Without this, a compromised renderer could call openDownloadFile() on an
// arbitrary path (e.g. a system executable) and have shell.openPath launch it.
function _pathWithinAllowedDownloadDir(filePath) {
  try {
    if (!filePath || typeof filePath !== 'string') return false;
    var resolved = path.resolve(filePath);
    var store = readStorage();
    var roots = [];
    if (store.downloadPath) roots.push(path.resolve(store.downloadPath));
    if (store.screenshotPath) roots.push(path.resolve(store.screenshotPath));
    try { roots.push(path.resolve(electronApp.getPath('downloads'))); } catch(e) {}
    try { roots.push(path.resolve(electronApp.getPath('userData'))); } catch(e) {}
    return roots.some(function (r) {
      return resolved === r || resolved.indexOf(r + path.sep) === 0;
    });
  } catch(e) { return false; }
}

ipcMain.handle('open-download-file', (_, filePath) => {
  try {
    if (!_pathWithinAllowedDownloadDir(filePath)) {
      return { success: false, message: 'Path is outside the allowed directories' };
    }
    if (fs.existsSync(filePath)) {
      shell.openPath(filePath);
      return { success: true };
    }
    return { success: false, message: 'File not found' };
  } catch(e) {
    return { success: false, message: 'Error: ' + e.message };
  }
});

ipcMain.handle('check-files-exist', (_, paths) => {
  const result = {};
  for (const p of paths) {
    try { result[p] = fs.existsSync(p); } catch(e) { result[p] = false; }
  }
  return result;
});

ipcMain.handle('open-download-folder', (_, filePath) => {
  try {
    if (!_pathWithinAllowedDownloadDir(filePath)) {
      return { success: false, message: 'Path is outside the allowed directories' };
    }
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
      return { success: true };
    }
    return { success: false, message: 'File not found' };
  } catch(e) {
    return { success: false, message: 'Error: ' + e.message };
  }
});

ipcMain.handle('clear-downloads', () => {
  try {
    const store = readStorage();
    store.downloads = [];
    writeStorage(store);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('downloads-updated');
    return { success: true };
  } catch(e) {
    return { success: false, message: 'Error: ' + e.message };
  }
});

ipcMain.handle('set-download-path', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select folder for downloads',
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const store = readStorage();
      store.downloadPath = result.filePaths[0];
      writeStorage(store);
      return { success: true, path: result.filePaths[0] };
    }
    return { success: false, message: 'Cancelled' };
  } catch(e) {
    return { success: false, message: 'Error: ' + e.message };
  }
});

ipcMain.handle('get-current-download-path', () => {
  const store = readStorage();
  return store.downloadPath || electronApp.getPath('downloads');
});

// ============== SCREENSHOT PATH ==============
ipcMain.handle('get-screenshot-path', () => {
  const store = readStorage();
  return store.screenshotPath || '';
});

ipcMain.handle('set-screenshot-path', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select folder for screenshots',
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      const store = readStorage();
      store.screenshotPath = result.filePaths[0];
      writeStorage(store);
      return { success: true, path: result.filePaths[0] };
    }
    return { success: false };
  } catch(e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('clear-screenshot-path', () => {
  const store = readStorage();
  delete store.screenshotPath;
  writeStorage(store);
  return { success: true };
});

// ============== DATA PATH ==============
ipcMain.handle('get-data-path', () => {
  return electronApp.getPath('userData');
});

ipcMain.handle('choose-data-path', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select new folder for browser data',
      properties: ['openDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return { success: true, path: result.filePaths[0] };
    }
    return { success: false };
  } catch(e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('migrate-data-path', async (_, newPath) => {
  try {
    if (!fs.existsSync(newPath)) {
      fs.mkdirSync(newPath, { recursive: true });
    }
    const oldPath = electronApp.getPath('userData');
    if (oldPath === newPath) return { success: false, message: 'Same folder' };

    const files = fs.readdirSync(oldPath);
    let copied = 0;
    let deleted = 0;
    for (const file of files) {
      const src = path.join(oldPath, file);
      const dst = path.join(newPath, file);
      try {
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
          fs.cpSync(src, dst, { recursive: true });
        } else {
          fs.copyFileSync(src, dst);
        }
        copied++;
        try {
          if (stat.isDirectory()) {
            fs.rmSync(src, { recursive: true, force: true });
          } else {
            fs.unlinkSync(src);
          }
          deleted++;
        } catch(e2) {}
      } catch(e) {}
    }
    const store = readStorage();
    store.customDataPath = newPath;
    writeStorage(store);
    return { success: true, copied: copied, deleted: deleted, newPath: newPath };
  } catch(e) {
    return { success: false, message: e.message };
  }
});

// ============== USER SCRIPTS ==============
ipcMain.handle('get-scripts', () => {
  const store = readStorage();
  if (!store.scripts || store.scripts.length === 0) {
    store.scripts = [{
      id: 'script-default-welcome',
      name: 'Welcome Script',
      description: 'Test script — shows a notification on page load',
      code: 'setTimeout(function(){var d=document.createElement("div");d.textContent="StartPOZI Script OK";d.style.cssText="position:fixed;bottom:20px;right:20px;background:#4CAF50;color:#fff;padding:10px 18px;border-radius:8px;z-index:2147483647;font-size:14px";(document.body||document.documentElement).appendChild(d);setTimeout(function(){if(d.parentNode)d.parentNode.removeChild(d)},3000)},1500);console.log("[UserScript] "+location.href);',
      match: '*://*/*',
      runAt: 'document-idle',
      runInFrames: false,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }];
    writeStorage(store);
  }
  return store.scripts;
});

ipcMain.handle('save-script', (_, script) => {
  const store = readStorage();
  if (!store.scripts) store.scripts = [];
  if (script.id) {
    const idx = store.scripts.findIndex(s => s.id === script.id);
    if (idx !== -1) {
      store.scripts[idx] = { ...store.scripts[idx], ...script, updatedAt: Date.now() };
    } else {
      store.scripts.push({ ...script, updatedAt: Date.now() });
    }
  } else {
    store.scripts.push({
      id: 'script-' + Date.now(),
      name: script.name || 'Untitled',
      description: script.description || '',
      code: script.code || '',
      match: script.match || '*://*/*',
      runAt: script.runAt || 'document-idle',
      runInFrames: !!script.runInFrames,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  }
  writeStorage(store);
  return { success: true, message: 'Script saved' };
});

ipcMain.handle('delete-script', (_, id) => {
  const store = readStorage();
  store.scripts = (store.scripts || []).filter(s => s.id !== id);
  writeStorage(store);
  return { success: true, message: 'Script deleted' };
});

ipcMain.handle('toggle-script', (_, id, enabled) => {
  const store = readStorage();
  const script = (store.scripts || []).find(s => s.id === id);
  if (script) {
    script.enabled = enabled;
    writeStorage(store);
    return { success: true, message: enabled ? 'Script enabled' : 'Script disabled' };
  }
  return { success: false, message: 'Script not found' };
});

// Convert a user glob pattern (*://*/*) into a RegExp. All regex special
// characters are escaped first — an unescaped ( or [ made new RegExp throw
// and the old catch() returned true, running the script on EVERY page.
function _globPatternToRegExp(pat) {
  var escaped = String(pat).replace(/[.+^${}()|[\]\\]/g, '\\$&');
  escaped = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + escaped + '$');
}
ipcMain.handle('get-scripts-for-page', (event, url) => {
  const store = readStorage();
  const scripts = (store.scripts || []).filter(s => s.enabled);
  if (!url) return scripts.map(s => ({ id: s.id, code: s.code, runAt: s.runAt || 'document-idle', runInFrames: !!s.runInFrames }));
  const matched = scripts.filter(s => {
    if (!s.match || s.match === '*://*/*') return true;
    try {
      var patterns = s.match.split(',').map(p => p.trim());
      return patterns.some(function(pat) {
        return _globPatternToRegExp(pat).test(url);
      });
    } catch(e) { return false; } // invalid pattern → never match (fail closed)
  });
  return matched.map(s => ({ id: s.id, code: s.code, runAt: s.runAt || 'document-idle', runInFrames: !!s.runInFrames }));
});

// ============== CUSTOMIZATION ==============
// Cached autohide flag — read at startup and refreshed whenever the user
// toggles the "Auto-hide top bar" setting. The cursor-edge poller below reads
// this in-memory (no settings.json read every 200 ms).
var _autohideTopbar = false;
var _autohideVertical = false;
var _autohideSidebarW = 180;
function _refreshAutohideCache() {
  try {
    const s = readStorage();
    const c = s.customization || {};
    _autohideTopbar = !!c.autohideTopbar;
    _autohideVertical = c.tabLayout === 'vertical';
    _autohideSidebarW = parseInt(c.verticalTabWidth, 10) || 180;
  } catch(e) {}
}
ipcMain.handle('get-customization-settings', () => {
  const store = readStorage();
  return { success: true, settings: store.customization || {} };
});

ipcMain.handle('save-customization-settings', (_, settings) => {
  const store = readStorage();
  // Persist uploaded background as a file BEFORE storing, so settings.json
  // never holds a huge base64 blob (which writeStorage would truncate → the
  // wallpaper disappears after reload).
  if (settings && typeof settings === 'object') {
    if (typeof settings.customBackgroundImage === 'string' &&
        settings.customBackgroundImage.indexOf('data:') === 0) {
      settings.customBackgroundImage = _dataUrlToBgFile(settings.customBackgroundImage);
    }
  }
  store.customization = { ...(store.customization || {}), ...settings };
  writeStorage(store);
  _broadcastCustomization(store.customization);
  if ('autohideTopbar' in (settings || {}) || 'tabLayout' in (settings || {}) || 'verticalTabWidth' in (settings || {})) {
    _refreshAutohideCache();
  }
  return { success: true };
});

// === Auto-hide top chrome — NOTE on the approach ===
// Originally this used screen.getCursorScreenPoint() polling. That does NOT
// work on Wayland / some sandboxed environments (always returns {0,0}), which
// made the poller think the cursor was permanently in the top-left corner and
// revealed the chrome unconditionally. The mechanism now lives ENTIRELY in the
// renderer: a thin transparent hotspot <div> sits over the top edge of the
// window (on top of the <webview>, which a renderer mousemove can't otherwise
// see), plus mouseenter/mouseleave on the chrome itself. No global cursor
// query, no IPC — works on every platform.

// Request from Settings for a forced Session Guard check in all tabs.
// Settings is a webview, it has no access to tabs[]; we ask the main window.
ipcMain.handle('session-guard-scan', function(event) {
  // Reply to the window that asked (incognito shell included).
  var shell = (event && _shellWindowOf(event.sender)) || mainWindow;
  if (shell && !shell.isDestroyed()) {
    shell.webContents.send('session-guard-scan-request');
    return { success: true };
  }
  return { success: false };
});

// ============== MAIN PAGE DATA (sync start page localStorage <-> settings.json) ==============
ipcMain.on('get-mainpage-data-sync', (event) => {
  try {
    const store = readStorage();
    event.returnValue = store.mainPage || {};
  } catch(e) { event.returnValue = {}; }
});

ipcMain.handle('get-mainpage-data-sync', () => {
  try {
    const store = readStorage();
    return store.mainPage || {};
  } catch(e) { return {}; }
});

ipcMain.on('set-mainpage-data', (_, snapshot) => {
  try {
    const store = readStorage();
    // Persist any embedded base64 data URLs as files FIRST. Without this, a
    // custom wallpaper uploaded on MainPage gets stored as a giant data URL,
    // writeStorage's 100 KB cap truncates it, and the wallpaper is lost on
    // reload (and never syncs to Settings/Library).
    if (snapshot && typeof snapshot === 'object') {
      Object.keys(snapshot).forEach(function(k) {
        if (typeof snapshot[k] === 'string' && snapshot[k].indexOf('data:') > -1) {
          snapshot[k] = _replaceDataUrlsInCss(snapshot[k]);
        }
      });
    }
    store.mainPage = snapshot || {};
    if (snapshot && snapshot.startpozi_background) {
      var bg = snapshot.startpozi_background;
      var mainPageUrl = 'file://' + path.join(__dirname, 'MainPage').replace(/\\/g, '/');
      bg = bg.replace(
        /url\(\s*['"]?((?!data:|https?:|file:|\/\/)[^'")]+)['"]?\s*\)/g,
        function(match, p1) { return 'url("' + mainPageUrl + '/' + p1 + '")'; }
      );
      store.customization = store.customization || {};
      store.customization.mainPageBackground = bg;
      store.customization.mainPageBackgroundSize = snapshot.startpozi_backgroundSize || '';
      store.customization.mainPageBackgroundRepeat = snapshot.startpozi_backgroundRepeat || '';
      store.customization.mainPageBackgroundPosition = snapshot.startpozi_backgroundPosition || '';
      store.customization.mainPageBackgroundAttachment = snapshot.startpozi_backgroundAttachment || '';
    }
    writeStorage(store);
    _broadcastCustomization(store.customization);
  } catch(e) {}
});

// ============== TOOLBAR ==============
ipcMain.handle('get-toolbar-buttons', () => {
  const store = readStorage();
  var buttons = store.toolbarButtons;
  if (!buttons) {
    buttons = ['library','home','back','forward','reload','downloads','autofill','adblock','scripts'];
  }
  return { success: true, buttons: buttons };
});

ipcMain.handle('save-toolbar-buttons', (_, data) => {
  const store = readStorage();
  store.toolbarButtons = data;
  writeStorage(store);
  _allShells().forEach(function (sh) {
    try { sh.webContents.send('toolbar-buttons-changed', data); } catch(e) {}
  });
  return { success: true };
});

// ============== BOOKMARKS ==============
ipcMain.handle('load-bookmarks', () => {
  const store = readStorage();
  return store.bookmarks || [];
});

ipcMain.handle('add-bookmark', (_, bookmark) => {
  const store = readStorage();
  if (!store.bookmarks) store.bookmarks = [];
  bookmark.id = 'bm-' + Date.now();
  bookmark.createdAt = Date.now();
  store.bookmarks.push(bookmark);
  writeStorage(store);
  return { success: true, bookmark };
});

ipcMain.handle('remove-bookmark', (_, id) => {
  const store = readStorage();
  const bookmarks = store.bookmarks || [];
  store.bookmarks = bookmarks.filter(b => b.id !== id);
  bookmarks.forEach(b => {
    if (b.folder === id) b.folder = '';
  });
  writeStorage(store);
  return { success: true };
});

ipcMain.handle('update-bookmark', (_, id, data) => {
  const store = readStorage();
  const bookmarks = store.bookmarks || [];
  const idx = bookmarks.findIndex(b => b.id === id);
  if (idx === -1) return { success: false };
  bookmarks[idx] = { ...bookmarks[idx], ...data };
  store.bookmarks = bookmarks;
  writeStorage(store);
  return { success: true };
});

// --- Bookmark import helpers (shared by file import and browser import) ---

// Parse a Netscape Bookmark File — the format Chrome/Firefox/Safari/Edge all
// export/import. Preserves folder nesting. Returns [{title, url, folder}].
// The old importer used a single regex that dropped every folder and stored the
// title under the wrong key (name instead of title), so imported bookmarks
// showed their URL as the name and lost all structure.
function _parseNetscapeBookmarks(html) {
  var results = [];
  var folderStack = [];
  var pendingFolder = null;
  var tokenRe = /(<\/DL>|<DL[^>]*>|<DT>\s*<H3[^>]*>([\s\S]*?)<\/H3>|<DT>\s*<A[^>]*\bHREF\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/A>)/gi;
  var m;
  while ((m = tokenRe.exec(html)) !== null) {
    var tok = m[0];
    if (/^<\/DL>/i.test(tok)) { if (folderStack.length) folderStack.pop(); continue; }
    if (/^<DL/i.test(tok)) {
      if (pendingFolder !== null) { folderStack.push(pendingFolder); pendingFolder = null; }
      continue;
    }
    if (/^<DT>\s*<H3/i.test(tok)) {
      pendingFolder = (m[2] || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
      continue;
    }
    var url = m[3];
    var title = (m[4] || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
    if (url) results.push({ title: title || url, url: url, folder: folderStack.filter(Boolean).join('/') });
  }
  return results;
}

// Walk a Chromium Bookmarks JSON node tree into a flat [{title,url,folder}] list.
function _flattenChromiumNodes(nodes, folderPath, out) {
  out = out || [];
  (nodes || []).forEach(function (n) {
    if (n.type === 'folder' || (!n.url && n.children)) {
      var fp = folderPath ? (folderPath + '/' + (n.name || '')) : (n.name || '');
      _flattenChromiumNodes(n.children || [], fp, out);
    } else if ((n.type === 'url' || n.url) && n.url) {
      out.push({ title: n.name || n.title || n.url, url: n.url, folder: folderPath });
    }
  });
  return out;
}

// Insert a batch of bookmarks into the store. The app models a folder as a
// bookmark entry with folder==='__folder__' and a unique id; normal bookmarks
// reference that id via their own `folder` field. We create folder entries for
// each unique folder path (de-duplicated by leaf name against existing folders).
function _addBookmarksBatch(store, items) {
  if (!store.bookmarks) store.bookmarks = [];
  var folderIds = {};                 // folderPath -> folderEntryId
  var existingFolderByTitle = {};
  store.bookmarks.forEach(function (b) {
    if (b.folder === '__folder__' && b.id) existingFolderByTitle[(b.title || '').toLowerCase()] = b.id;
  });
  var now = Date.now();
  var imported = 0;
  items.forEach(function (item, i) {
    var folderId = '';
    if (item.folder) {
      folderId = folderIds[item.folder];
      if (!folderId) {
        var leaf = (item.folder.split('/').pop() || 'Imported').trim();
        var fid = existingFolderByTitle[leaf.toLowerCase()];
        if (!fid) {
          fid = 'bmf-' + now + '-' + i;
          store.bookmarks.push({ id: fid, title: leaf, url: '', folder: '__folder__', createdAt: now });
          existingFolderByTitle[leaf.toLowerCase()] = fid;
        }
        folderIds[item.folder] = fid;
        folderId = fid;
      }
    }
    var url = item.url || '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url.replace(/^\/+/, '');
    if (!/^https?:\/\//i.test(url) && !/^(ftp|file):/i.test(url)) return; // skip javascript:/data: etc.
    store.bookmarks.push({
      id: 'bm-' + now + '-' + i,
      title: item.title || url,
      url: url,
      folder: folderId,
      createdAt: now + i
    });
    imported++;
  });
  return imported;
}

ipcMain.handle('import-bookmarks', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import bookmarks',
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }, { name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, message: 'Cancelled' };
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    const store = readStorage();
    var items = [];
    if (filePath.toLowerCase().endsWith('.json')) {
      var data = JSON.parse(content);
      var list = Array.isArray(data) ? data : (data.bookmarks || data.children || []);
      if (!Array.isArray(list) && data && data.roots) {
        // Chrome/Edge "Bookmarks" JSON file dropped directly.
        list = [];
        ['bookmark_bar', 'other', 'synced'].forEach(function (k) {
          if (data.roots[k] && data.roots[k].children) list = list.concat(_flattenChromiumNodes(data.roots[k].children, data.roots[k].name || ''));
        });
      }
      (Array.isArray(list) ? list : []).forEach(function (n) {
        if (n && (n.children || n.type === 'folder') && !n.url) return;
        if (n && n.url) items.push({ title: n.title || n.name || n.url, url: n.url, folder: n.folder || '' });
      });
    } else {
      items = _parseNetscapeBookmarks(content);
    }
    var imported = _addBookmarksBatch(store, items);
    writeStorage(store);
    return { success: true, message: 'Imported ' + imported + ' bookmarks' };
  } catch(e) {
    return { success: false, message: 'Import error: ' + e.message };
  }
});

// ============== IMPORT FROM INSTALLED BROWSERS (Chrome / Edge / Brave / Vivaldi / Firefox) ==============
// Detects installed browser profiles and imports bookmarks + history.
//   - Bookmarks (Chromium): read the plain JSON "Bookmarks" file (no deps).
//   - Bookmarks (Firefox):  read places.sqlite (moz_bookmarks).
//   - History (both):       read the SQLite DBs via sql.js (pure WASM, no
//                            native compilation — better-sqlite3 won't build).
// Chrome locks "History" on Windows; the user is told to close the browser.

// sql.js is optional: lazy-load once, cache the promise. If absent, history
// import degrades gracefully instead of crashing.
var _sqlJsPromise = null;
function _sqlJsAvailable() {
  try { require.resolve('sql.js/dist/sql-wasm.wasm'); return true; } catch(e) { return false; }
}
function _getSqlJs() {
  if (_sqlJsPromise) return _sqlJsPromise;
  _sqlJsPromise = new Promise(function (resolve) {
    try {
      var initSqlJs = require('sql.js');
      var wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
      var wasmBinary = fs.readFileSync(wasmPath);
      initSqlJs({ wasmBinary: wasmBinary }).then(resolve, function () { resolve(null); });
    } catch (e) { resolve(null); }
  });
  return _sqlJsPromise;
}

// Read a (possibly locked) SQLite file and return rows for a query.
function _querySqlite(filePath, sql) {
  return _getSqlJs().then(function (SQL) {
    if (!SQL) return { error: 'SQLite engine unavailable (sql.js not installed)' };
    var data = fs.readFileSync(filePath); // throws on exclusive lock (Chrome on Windows)
    var db = new SQL.Database(new Uint8Array(data));
    try {
      var stmt = db.prepare(sql);
      var rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return { rows: rows };
    } finally {
      try { db.close(); } catch (e) {}
    }
  });
}

// Chrome/WebKit timestamps: microseconds since 1601-01-01.
function _webkitToMs(t) { if (!t || t < 0) return Date.now(); return Math.floor(t / 1000) - 11644473600000; }
// Firefox timestamps: microseconds since 1970.
function _ffToMs(t) { if (!t || t < 0) return Date.now(); return Math.floor(t / 1000); }

function _candidateBrowserDefs() {
  var home = os.homedir();
  var defs = [];
  if (process.platform === 'win32') {
    var local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    var roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    defs.push({ id: 'chrome', name: 'Google Chrome', engine: 'chromium', root: path.join(local, 'Google', 'Chrome', 'User Data') });
    defs.push({ id: 'edge', name: 'Microsoft Edge', engine: 'chromium', root: path.join(local, 'Microsoft', 'Edge', 'User Data') });
    defs.push({ id: 'brave', name: 'Brave', engine: 'chromium', root: path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data') });
    defs.push({ id: 'vivaldi', name: 'Vivaldi', engine: 'chromium', root: path.join(local, 'Vivaldi', 'User Data') });
    defs.push({ id: 'chromium', name: 'Chromium', engine: 'chromium', root: path.join(local, 'Chromium', 'User Data') });
    defs.push({ id: 'firefox', name: 'Mozilla Firefox', engine: 'firefox', root: path.join(roaming, 'Mozilla', 'Firefox') });
  } else if (process.platform === 'darwin') {
    var as = path.join(home, 'Library', 'Application Support');
    defs.push({ id: 'chrome', name: 'Google Chrome', engine: 'chromium', root: path.join(as, 'Google', 'Chrome') });
    defs.push({ id: 'edge', name: 'Microsoft Edge', engine: 'chromium', root: path.join(as, 'Microsoft Edge') });
    defs.push({ id: 'brave', name: 'Brave', engine: 'chromium', root: path.join(as, 'BraveSoftware', 'Brave-Browser') });
    defs.push({ id: 'vivaldi', name: 'Vivaldi', engine: 'chromium', root: path.join(as, 'Vivaldi') });
    defs.push({ id: 'chromium', name: 'Chromium', engine: 'chromium', root: path.join(as, 'Chromium') });
    defs.push({ id: 'firefox', name: 'Mozilla Firefox', engine: 'firefox', root: path.join(as, 'Firefox') });
  } else {
    var cfg = path.join(home, '.config');
    defs.push({ id: 'chrome', name: 'Google Chrome', engine: 'chromium', root: path.join(cfg, 'google-chrome') });
    defs.push({ id: 'edge', name: 'Microsoft Edge', engine: 'chromium', root: path.join(cfg, 'microsoft-edge') });
    defs.push({ id: 'brave', name: 'Brave', engine: 'chromium', root: path.join(cfg, 'BraveSoftware', 'Brave-Browser') });
    defs.push({ id: 'vivaldi', name: 'Vivaldi', engine: 'chromium', root: path.join(cfg, 'vivaldi') });
    defs.push({ id: 'chromium', name: 'Chromium', engine: 'chromium', root: path.join(cfg, 'chromium') });
    defs.push({ id: 'opera', name: 'Opera', engine: 'chromium', root: path.join(cfg, 'opera') });
    defs.push({ id: 'firefox', name: 'Mozilla Firefox', engine: 'firefox', root: path.join(home, '.mozilla', 'firefox') });
  }
  return defs;
}

function _findChromiumProfiles(root) {
  var profiles = [];
  try {
    if (!fs.existsSync(root)) return profiles;
    ['Default', 'Profile 1', 'Profile 2', 'Profile 3', 'Profile 4', 'Profile 5'].forEach(function (p) {
      var d = path.join(root, p);
      if (fs.existsSync(path.join(d, 'Bookmarks')) || fs.existsSync(path.join(d, 'History'))) profiles.push(d);
    });
    if (profiles.length === 0 && (fs.existsSync(path.join(root, 'Bookmarks')) || fs.existsSync(path.join(root, 'History')))) profiles.push(root);
  } catch (e) {}
  return profiles;
}

function _findFirefoxProfiles(root) {
  var profiles = [];
  try {
    if (!fs.existsSync(root)) return profiles;
    fs.readdirSync(root).forEach(function (name) {
      var d = path.join(root, name);
      try { if (fs.statSync(d).isDirectory() && /default/i.test(name) && fs.existsSync(path.join(d, 'places.sqlite'))) profiles.push(d); } catch (e) {}
    });
  } catch (e) {}
  return profiles;
}

ipcMain.handle('import-detect-browsers', async () => {
  var found = [];
  _candidateBrowserDefs().forEach(function (def) {
    var profiles = def.engine === 'firefox' ? _findFirefoxProfiles(def.root) : _findChromiumProfiles(def.root);
    profiles.forEach(function (p) {
      var has = { bookmarks: false, history: false };
      if (def.engine === 'firefox') {
        var ps = fs.existsSync(path.join(p, 'places.sqlite'));
        has.bookmarks = ps; has.history = ps;
      } else {
        has.bookmarks = fs.existsSync(path.join(p, 'Bookmarks'));
        has.history = fs.existsSync(path.join(p, 'History'));
      }
      if (has.bookmarks || has.history) {
        found.push({ browserId: def.id, name: def.name, engine: def.engine, profilePath: p, profileName: path.basename(p), has: has });
      }
    });
  });
  return { success: true, browsers: found, sqliteAvailable: _sqlJsAvailable() };
});

function _importBookmarksFromChromium(profilePath, store) {
  var file = path.join(profilePath, 'Bookmarks');
  if (!fs.existsSync(file)) return 0;
  var data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  var roots = data.roots || {};
  var items = [];
  ['bookmark_bar', 'other', 'synced'].forEach(function (k) {
    if (roots[k] && roots[k].children) items = items.concat(_flattenChromiumNodes(roots[k].children, roots[k].name || ''));
  });
  return _addBookmarksBatch(store, items);
}

function _importBookmarksFromFirefox(profilePath, store) {
  var db = path.join(profilePath, 'places.sqlite');
  if (!fs.existsSync(db)) return Promise.resolve(0);
  // moz_bookmarks: type 1 = url (fk -> moz_places.id), type 2 = folder.
  return _querySqlite(db, 'SELECT b.id AS bid, b.type, b.title AS btitle, b.parent, p.url AS purl, p.title AS ptitle FROM moz_bookmarks b LEFT JOIN moz_places p ON b.fk = p.id').then(function (res) {
    if (!res || res.error || !res.rows) return 0;
    var byId = {};
    res.rows.forEach(function (r) { byId[r.bid] = r; });
    function folderPath(id) {
      var parts = []; var cur = byId[id]; var guard = 0;
      while (cur && cur.type === 2 && guard < 64) { if (cur.btitle) parts.unshift(cur.btitle); cur = byId[cur.parent]; guard++; }
      return parts.join('/');
    }
    var items = [];
    res.rows.forEach(function (r) {
      if (r.type === 1 && r.purl && /^https?:\/\//i.test(r.purl)) {
        items.push({ title: r.btitle || r.ptitle || r.purl, url: r.purl, folder: folderPath(r.parent) });
      }
    });
    return _addBookmarksBatch(store, items);
  });
}

function _importHistoryFromChromium(profilePath, store) {
  var historyDb = path.join(profilePath, 'History');
  if (!fs.existsSync(historyDb)) return Promise.resolve(0);
  return _querySqlite(historyDb, 'SELECT url, title, visit_count, last_visit_time FROM urls').then(function (res) {
    if (!res || res.error || !res.rows) return 0;
    if (!store.history) store.history = [];
    var existing = {}; store.history.forEach(function (h) { existing[h.url] = h; });
    var added = 0;
    res.rows.forEach(function (r) {
      if (!r.url || /^(chrome|about|edge|blob|data):/i.test(r.url)) return;
      if (existing[r.url]) {
        existing[r.url].visitCount = (existing[r.url].visitCount || 0) + (r.visit_count || 0);
      } else {
        store.history.push({ url: r.url, title: r.title || '', time: _webkitToMs(r.last_visit_time), visitCount: r.visit_count || 1 });
        added++;
      }
    });
    return added;
  });
}

function _importHistoryFromFirefox(profilePath, store) {
  var db = path.join(profilePath, 'places.sqlite');
  if (!fs.existsSync(db)) return Promise.resolve(0);
  return _querySqlite(db, "SELECT p.url AS url, p.title AS title, p.visit_count AS visit_count, MAX(v.visit_date) AS last FROM moz_places p LEFT JOIN moz_historyvisits v ON v.place_id = p.id WHERE p.url LIKE 'http%' GROUP BY p.id").then(function (res) {
    if (!res || res.error || !res.rows) return 0;
    if (!store.history) store.history = [];
    var existing = {}; store.history.forEach(function (h) { existing[h.url] = h; });
    var added = 0;
    res.rows.forEach(function (r) {
      if (!r.url) return;
      if (existing[r.url]) {
        existing[r.url].visitCount = (existing[r.url].visitCount || 0) + (r.visit_count || 0);
      } else {
        store.history.push({ url: r.url, title: r.title || '', time: _ffToMs(r.last), visitCount: r.visit_count || 1 });
        added++;
      }
    });
    return added;
  });
}

// opts: { profilePath, engine, bookmarks:true, history:true }
ipcMain.handle('import-from-browser', async (_, opts) => {
  opts = opts || {};
  var result = { success: true, bookmarks: 0, history: 0, warnings: [] };
  try {
    if (!opts.profilePath) return { success: false, warnings: ['No profile selected'] };
    var store = readStorage();
    if (opts.bookmarks) {
      try {
        result.bookmarks = opts.engine === 'firefox'
          ? (await _importBookmarksFromFirefox(opts.profilePath, store) || 0)
          : (_importBookmarksFromChromium(opts.profilePath, store) || 0);
      } catch (e) { result.warnings.push('Bookmarks: ' + e.message); }
    }
    if (opts.history) {
      try {
        result.history = opts.engine === 'firefox'
          ? (await _importHistoryFromFirefox(opts.profilePath, store) || 0)
          : (await _importHistoryFromChromium(opts.profilePath, store) || 0);
      } catch (e) {
        var msg = e.code === 'ENOENT' ? 'history file is locked — close the source browser first' : e.message;
        result.warnings.push('History: ' + msg);
      }
    }
    writeStorage(store);
    if (mainWindow && !mainWindow.isDestroyed()) {
      try { mainWindow.webContents.send('history-updated'); } catch (e) {}
    }
  } catch (e) {
    result.success = false;
    result.warnings.push(e.message);
  }
  return result;
});

ipcMain.handle('export-bookmarks', async () => {
  try {
    const store = readStorage();
    const bookmarks = store.bookmarks || [];
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export bookmarks',
      defaultPath: 'bookmarks.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled) return { success: false, message: 'Cancelled' };
    fs.writeFileSync(result.filePath, JSON.stringify(bookmarks, null, 2), 'utf-8');
    return { success: true, message: `Exported ${bookmarks.length} bookmarks` };
  } catch(e) {
    return { success: false, message: 'Export error: ' + e.message };
  }
});

// ============== PROFILES ==============
function getProfilesPath() {
  return path.join(electronApp.getPath('userData'), 'profiles.json');
}
function readProfiles() {
  try {
    const p = getProfilesPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch(e) {}
  return { profiles: [{ id: 'default', name: 'Default', avatar: '👤', createdAt: Date.now() }], activeProfile: 'default' };
}
function writeProfiles(data) {
  try { fs.writeFileSync(getProfilesPath(), JSON.stringify(data, null, 2), 'utf-8'); } catch(e) {}
}
function getProfileStoragePath(profileId) {
  return path.join(electronApp.getPath('userData'), 'profile-' + profileId + '.json');
}
function readProfileStorage(profileId) {
  try {
    const p = getProfileStoragePath(profileId);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch(e) {}
  return {};
}
function writeProfileStorage(profileId, data) {
  try { fs.writeFileSync(getProfileStoragePath(profileId), JSON.stringify(data, null, 2), 'utf-8'); } catch(e) {}
}

ipcMain.handle('get-profiles', () => {
  const data = readProfiles();
  return data;
});

ipcMain.handle('create-profile', (_, name, avatar) => {
  const data = readProfiles();
  var id = 'prof-' + Date.now();
  data.profiles.push({ id: id, name: name || 'Profile', avatar: avatar || '👤', createdAt: Date.now() });
  writeProfiles(data);
  return { success: true, profile: data.profiles[data.profiles.length - 1] };
});

ipcMain.handle('delete-profile', (_, profileId) => {
  if (profileId === 'default') return { success: false, message: 'Cannot delete the default profile' };
  const data = readProfiles();
  data.profiles = data.profiles.filter(p => p.id !== profileId);
  if (data.activeProfile === profileId) data.activeProfile = 'default';
  writeProfiles(data);
  try { fs.unlinkSync(getProfileStoragePath(profileId)); } catch(e) {}
  return { success: true };
});

ipcMain.handle('switch-profile', (_, profileId) => {
  const data = readProfiles();
  if (!data.profiles.find(p => p.id === profileId)) return { success: false };
  data.activeProfile = profileId;
  writeProfiles(data);
  return { success: true };
});

ipcMain.handle('get-active-profile', () => {
  const data = readProfiles();
  return data.profiles.find(p => p.id === data.activeProfile) || data.profiles[0];
});

ipcMain.handle('get-profile-storage', (_) => {
  const data = readProfiles();
  return readProfileStorage(data.activeProfile);
});

ipcMain.handle('write-profile-storage', (_, d) => {
  const data = readProfiles();
  writeProfileStorage(data.activeProfile, d);
  return { success: true };
});

ipcMain.handle('rename-profile', (_, profileId, newName) => {
  const data = readProfiles();
  var p = data.profiles.find(x => x.id === profileId);
  if (p) { p.name = newName; writeProfiles(data); }
  return { success: true };
});

// ============== INCOGNITO ==============
var _incognitoPartitions = {};
ipcMain.handle('create-incognito-tab', (event, url) => {
  var win = _shellWindowOf(event.sender);
  if (win && !win.isDestroyed()) {
    win.webContents.send('open-incognito-tab', url || '');
  }
  return { success: true };
});

// Wipe everything an incognito tab accumulated during its session.
// Called from renderer.js closeIncognitoTab() — automatically, no UI prompt.
// Mirrors what "Break loupe" does to the default session, but scoped to the
// tab's private partition so cookies/cache/localStorage are gone forever.
ipcMain.handle('clear-incognito-partition', async (_, partition) => {
  try {
    if (!partition || typeof partition !== 'string') return { success: false };
    var ses = session.fromPartition(partition);
    // 1. Cookies — also remove manually in case httpOnly ones are missed.
    try {
      var cookies = await ses.cookies.get({});
      for (var i = 0; i < cookies.length; i++) {
        try {
          await ses.cookies.remove(cookies[i].url || ('http://' + cookies[i].domain), cookies[i].name);
        } catch(e) {}
      }
    } catch(e) {}
    // 2. Cache + storage + auth cache + service workers + data for all hosts.
    try {
      await ses.clearCache();
      await ses.clearStorageData({
        storages: ['appcache', 'filesystem', 'indexdb', 'localstorage',
                   'shadercache', 'websql', 'serviceworkers', 'cookies']
      });
      await ses.clearAuthCache();
      await ses.clearHostResolverCache();
    } catch(e) {}
    // 3. Drop the in-memory tracking entry so the partition is forgotten.
    delete _incognitoPartitions[partition];
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// ============== CONTAINER TABS ==============
// Firefox-style cookie-isolated containers. Each container maps to a
// persistent Chromium partition ("persist:container-<id>"), so cookies,
// localStorage and cache are fully separated between containers and from
// the default session. Disabled by default; enabled in Settings → Containers.
function _defaultContainers() {
  return [
    { id: 'personal', name: 'Personal', color: '#4caf50', icon: '🟢' },
    { id: 'work',     name: 'Work',     color: '#1da1f2', icon: '💼' },
    { id: 'shopping', name: 'Shopping', color: '#ff9800', icon: '🛒' }
  ];
}
function _sanitizeContainers(raw) {
  var out = [];
  (Array.isArray(raw) ? raw : []).slice(0, 20).forEach(function(c) {
    if (!c || typeof c !== 'object') return;
    var id = String(c.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'c' + Date.now();
    out.push({
      id: id,
      name: String(c.name || 'Container').slice(0, 40),
      color: /^#[0-9a-f]{3,8}$/i.test(String(c.color)) ? String(c.color) : '#1da1f2',
      icon: String(c.icon || '🗂').slice(0, 4)
    });
  });
  return out;
}
ipcMain.handle('get-containers', () => {
  const store = readStorage();
  return {
    enabled: !!store.containersEnabled,
    containers: _sanitizeContainers(store.containers && store.containers.length ? store.containers : _defaultContainers())
  };
});
ipcMain.handle('set-containers-enabled', (_, val) => {
  const store = readStorage();
  store.containersEnabled = !!val;
  // Seed the default set the first time the feature is switched on, so the
  // user immediately has something to open tabs in.
  if (val && (!store.containers || !store.containers.length)) store.containers = _defaultContainers();
  writeStorage(store);
  return { success: true };
});
ipcMain.handle('save-containers', (_, list) => {
  const store = readStorage();
  store.containers = _sanitizeContainers(list);
  writeStorage(store);
  return { success: true };
});
ipcMain.handle('clear-container-data', async (_, containerId) => {
  try {
    var id = String(containerId || '').replace(/[^a-z0-9_-]/gi, '');
    if (!id) return { success: false };
    var ses = session.fromPartition('persist:container-' + id);
    try {
      var cookies = await ses.cookies.get({});
      for (var i = 0; i < cookies.length; i++) {
        try { await ses.cookies.remove(cookies[i].url || ('http://' + cookies[i].domain), cookies[i].name); } catch(e) {}
      }
    } catch(e) {}
    try {
      await ses.clearCache();
      await ses.clearStorageData({
        storages: ['appcache', 'filesystem', 'indexdb', 'localstorage',
                   'shadercache', 'websql', 'serviceworkers', 'cookies']
      });
      await ses.clearAuthCache();
      await ses.clearHostResolverCache();
    } catch(e) {}
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// ============== PASSWORDS ==============
// Notify every renderer (main window + open Library tabs) that the password
// list changed so UIs can refresh themselves.
function _notifyPasswordsUpdated() {
  const payload = { updatedAt: Date.now() };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('passwords-updated', payload);
  }
  try {
    for (const wc of webContents.getAllWebContents()) {
      try {
        const u = wc.getURL() || '';
        if (/Library\.html/.test(u) && wc !== mainWindow.webContents) {
          wc.send('passwords-updated', payload);
        }
      } catch(e) {}
    }
  } catch(e) {}
}

ipcMain.handle('get-passwords', () => {
  const store = readStorage();
  const passwords = _readPasswordsDecrypted(store);
  if (passwords === null) return { locked: true };
  return passwords;
});

ipcMain.handle('add-password', (_, pw) => {
  const store = readStorage();
  const passwords = _readPasswordsDecrypted(store);
  if (passwords === null) return { success: false, locked: true, message: 'Vault is locked' };
  pw.id = 'pw-' + Date.now();
  pw.createdAt = Date.now();
  passwords.push(pw);
  if (!_writePasswords(store, passwords)) return { success: false, locked: true, message: 'Vault is locked' };
  writeStorage(store);
  _notifyPasswordsUpdated();
  return { success: true };
});

ipcMain.handle('update-password', (_, id, pwData) => {
  const store = readStorage();
  const passwords = _readPasswordsDecrypted(store);
  if (passwords === null) return { success: false, locked: true, message: 'Vault is locked' };
  const idx = passwords.findIndex(p => p.id === id);
  if (idx !== -1) {
    passwords[idx] = { ...passwords[idx], ...pwData };
    if (!_writePasswords(store, passwords)) return { success: false, locked: true, message: 'Vault is locked' };
    writeStorage(store);
    _notifyPasswordsUpdated();
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('delete-password', (_, id) => {
  const store = readStorage();
  const passwords = _readPasswordsDecrypted(store);
  if (passwords === null) return { success: false, locked: true, message: 'Vault is locked' };
  const filtered = passwords.filter(p => p.id !== id);
  if (!_writePasswords(store, filtered)) return { success: false, locked: true, message: 'Vault is locked' };
  writeStorage(store);
  _notifyPasswordsUpdated();
  return { success: true };
});

ipcMain.handle('clear-passwords', () => {
  const store = readStorage();
  if (!_writePasswords(store, [])) return { success: false, locked: true, message: 'Vault is locked' };
  writeStorage(store);
  _notifyPasswordsUpdated();
  return { success: true };
});

// Alias for clear-passwords (Settings.html calls clearAllPasswords)
ipcMain.handle('clear-all-passwords', () => {
  const store = readStorage();
  if (!_writePasswords(store, [])) return { success: false, locked: true, message: 'Vault is locked' };
  writeStorage(store);
  _notifyPasswordsUpdated();
  return { success: true };
});

ipcMain.handle('toggle-password-favorite', (_, id, favorite) => {
  const store = readStorage();
  const passwords = _readPasswordsDecrypted(store);
  if (passwords === null) return { success: false, locked: true, message: 'Vault is locked' };
  const idx = passwords.findIndex(p => p.id === id);
  if (idx !== -1) {
    passwords[idx].favorite = favorite;
    if (!_writePasswords(store, passwords)) return { success: false, locked: true, message: 'Vault is locked' };
    writeStorage(store);
    _notifyPasswordsUpdated();
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('update-password-last-used', (_, id) => {
  const store = readStorage();
  const passwords = _readPasswordsDecrypted(store);
  if (passwords === null) return { success: false, locked: true, message: 'Vault is locked' };
  const idx = passwords.findIndex(p => p.id === id);
  if (idx !== -1) {
    passwords[idx].lastUsed = Date.now();
    if (!_writePasswords(store, passwords)) return { success: false, locked: true, message: 'Vault is locked' };
    writeStorage(store);
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('export-passwords', async () => {
  try {
    const store = readStorage();
    const decrypted = _readPasswordsDecrypted(store);
    if (decrypted === null) return { success: false, message: 'Vault is locked. Unlock it first.' };
    const passwords = decrypted.map(p => ({
      site: p.site, username: p.username, password: p.password, notes: p.notes || '', totpSecret: p.totpSecret || ''
    }));
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export passwords',
      defaultPath: 'passwords.json',
      filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'CSV', extensions: ['csv'] }]
    });
    if (result.canceled) return { success: false, message: 'Cancelled' };
    if (result.filePath.endsWith('.csv')) {
      const header = 'site,username,password,notes,totpSecret\n';
      const rows = passwords.map(p =>
        [p.site, p.username, p.password, p.notes, p.totpSecret].map(v => '"' + (v || '').replace(/"/g, '""') + '"').join(',')
      ).join('\n');
      fs.writeFileSync(result.filePath, header + rows, 'utf-8');
    } else {
      fs.writeFileSync(result.filePath, JSON.stringify(passwords, null, 2), 'utf-8');
    }
    return { success: true, message: `Exported ${passwords.length} passwords` };
  } catch(e) {
    return { success: false, message: 'Export error: ' + e.message };
  }
});

ipcMain.handle('import-passwords', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import passwords',
      filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'CSV', extensions: ['csv'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, message: 'Cancelled' };
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    const store = readStorage();
    const passwords = _readPasswordsDecrypted(store);
    if (passwords === null) return { success: false, message: 'Vault is locked. Unlock it first.' };
    let imported = 0;
    if (filePath.endsWith('.csv')) {
      const lines = content.split('\n').slice(1);
      lines.forEach(line => {
        if (!line.trim()) return;
        const parts = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          if (line[i] === '"') { inQuotes = !inQuotes; continue; }
          if (line[i] === ',' && !inQuotes) { parts.push(current); current = ''; continue; }
          current += line[i];
        }
        parts.push(current);
        if (parts.length >= 3 && parts[0]) {
          passwords.push({
            id: 'pw-' + Date.now() + '-' + imported,
            site: parts[0], username: parts[1], password: parts[2],
            notes: parts[3] || '', totpSecret: parts[4] || '', createdAt: Date.now()
          });
          imported++;
        }
      });
    } else {
      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : (data.passwords || []);
      items.forEach(p => {
        if (!p.site && !p.url) return;
        passwords.push({
          id: 'pw-' + Date.now() + '-' + imported,
          site: p.site || p.url || '', username: p.username || '',
          password: p.password || '', notes: p.notes || '',
          totpSecret: p.totpSecret || '', createdAt: Date.now()
        });
        imported++;
      });
    }
    if (!_writePasswords(store, passwords)) return { success: false, message: 'Vault is locked' };
    writeStorage(store);
    _notifyPasswordsUpdated();
    return { success: true, message: `Imported ${imported} passwords` };
  } catch(e) {
    return { success: false, message: 'Import error: ' + e.message };
  }
});

ipcMain.handle('check-breached', async () => {
  try {
    if (!_svcEnabled('hibpEnabled')) {
      return { success: false, message: 'Breach check is disabled in Settings' };
    }
    const store = readStorage();
    const passwords = _readPasswordsDecrypted(store);
    if (passwords === null) return { success: false, message: 'Vault is locked. Unlock it first.' };
    let breachedCount = 0;
    for (const p of passwords) {
      const count = await _hibpCountForPassword(p.password);
      if (count > 0) breachedCount++;
    }
    return { success: true, message: breachedCount > 0 ? `Found ${breachedCount} breaches` : 'No breaches found' };
  } catch(e) {
    return { success: false, message: 'Check error: ' + e.message };
  }
});

ipcMain.handle('security-analysis', () => {
  const store = readStorage();
  const passwords = _readPasswordsDecrypted(store);
  if (passwords === null) return { success: false, message: 'Vault is locked. Unlock it first.' };
  const weak = [];
  const duplicates = [];
  const old = [];
  const sixMonthsAgo = Date.now() - 180 * 24 * 60 * 60 * 1000;
  const seenPasswords = {};

  passwords.forEach(p => {
    let score = 0;
    const pw = p.password || '';
    if (pw.length >= 8) score += 20;
    if (pw.length >= 12) score += 20;
    if (/[a-z]/.test(pw)) score += 10;
    if (/[A-Z]/.test(pw)) score += 10;
    if (/[0-9]/.test(pw)) score += 10;
    if (/[^a-zA-Z0-9]/.test(pw)) score += 20;
    if (score < 50) weak.push({ id: p.id, site: p.site, username: p.username, score });

    if (p.createdAt && p.createdAt < sixMonthsAgo) {
      old.push({ id: p.id, site: p.site, username: p.username, monthsOld: Math.floor((Date.now() - p.createdAt) / (30 * 24 * 60 * 60 * 1000)) });
    }

    if (!seenPasswords[pw]) seenPasswords[pw] = [];
    seenPasswords[pw].push({ id: p.id, site: p.site });
  });

  Object.entries(seenPasswords).forEach(([pw, sites]) => {
    if (sites.length > 1) {
      duplicates.push({ password: pw, sites });
    }
  });

  let totalScore = 100;
  totalScore -= weak.length * 10;
  totalScore -= duplicates.length * 15;
  totalScore -= old.length * 5;
  totalScore = Math.max(0, Math.min(100, totalScore));

  return { success: true, score: totalScore, weak, duplicates, old };
});

ipcMain.handle('import-from-ga', (_, content) => {
  try {
    const store = readStorage();
    const passwords = _readPasswordsDecrypted(store);
    if (passwords === null) return { success: false, imported: 0, errors: ['Vault is locked. Unlock it first.'] };
    let imported = 0;
    const data = JSON.parse(content);
    const items = Array.isArray(data) ? data : (data.accounts || data.entries || []);
    items.forEach(item => {
      const secret = item.secret || item.otpSecret || '';
      const name = item.name || item.issuer || item.label || '';
      if (!name && !secret) return;
      passwords.push({
        id: 'pw-' + Date.now() + '-' + imported,
        site: name, username: item.email || '', password: '',
        notes: 'Import from Google Authenticator', totpSecret: secret,
        totpAlgorithm: item.algorithm || 'sha1', totpDigits: item.digits || 6,
        createdAt: Date.now()
      });
      imported++;
    });
    if (!_writePasswords(store, passwords)) return { success: false, imported: 0, errors: ['Vault is locked'] };
    writeStorage(store);
    _notifyPasswordsUpdated();
    return { success: true, imported, errors: [] };
  } catch(e) {
    return { success: false, imported: 0, errors: ['Parse error: ' + e.message] };
  }
});

ipcMain.handle('import-txt-passwords', (_, content) => {
  try {
    const store = readStorage();
    const passwords = _readPasswordsDecrypted(store);
    if (passwords === null) return { success: false, imported: 0, errors: ['Vault is locked. Unlock it first.'] };
    let imported = 0;
    const errors = [];
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const sep = line.includes('\t') ? '\t' : (line.includes('|') ? '|' : ',');
      const parts = line.split(sep).map(s => s.trim());
      if (parts.length >= 3 && parts[0]) {
        passwords.push({
          id: 'pw-' + Date.now() + '-' + imported,
          site: parts[0], username: parts[1], password: parts[2],
          notes: parts.slice(3).join(' ') || '', createdAt: Date.now()
        });
        imported++;
      } else if (parts.length >= 2 && parts[0]) {
        passwords.push({
          id: 'pw-' + Date.now() + '-' + imported,
          site: parts[0], username: '', password: parts[1],
          notes: '', createdAt: Date.now()
        });
        imported++;
      } else if (line) {
        errors.push(`Line ${idx + 1}: invalid format`);
      }
    });
    if (!_writePasswords(store, passwords)) return { success: false, imported: 0, errors: ['Vault is locked'] };
    writeStorage(store);
    _notifyPasswordsUpdated();
    return { success: true, imported, errors };
  } catch(e) {
    return { success: false, imported: 0, errors: ['Error: ' + e.message] };
  }
});

ipcMain.handle('test-autofill', (event) => {
  var win = _shellWindowOf(event.sender);
  if (win) {
    win.webContents.send('open-in-new-tab', 'https://httpbin.org/forms/post');
  }
  return { success: true };
});

ipcMain.handle('generate-password', (_, opts) => {
  const length = (opts && opts.length) || 16;
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  let pw = '';
  const buf = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    pw += chars[buf[i] % chars.length];
  }
  return { success: true, password: pw };
});

ipcMain.handle('scan-qr', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select an image with a QR code',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'webp'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, message: 'Cancelled' };
    const dataUrl = 'data:image/png;base64,' + fs.readFileSync(result.filePaths[0]).toString('base64');
    return { success: true, message: 'File uploaded. QR decoding is supported via the settings page.', imageData: dataUrl };
  } catch(e) {
    return { success: false, message: 'Error: ' + e.message };
  }
});

// ============== PRIVACY ==============
// ============== VAULT (encrypted password store) ==============
// Passwords are encrypted with AES-256-GCM. The key is derived from the
// user's master password via scrypt with a per-user random salt. The key
// is kept in memory only for the current session and never persisted.
const VAULT_KDF = { N: 16384, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const VAULT_KEYLEN = 32; // AES-256
let _vaultKey = null;    // cached derived key (in-memory only)

function _deriveKey(password, saltBuf) {
  return crypto.scryptSync(String(password), saltBuf, VAULT_KEYLEN, VAULT_KDF);
}

function _verifierOf(keyBuf) {
  return crypto.createHash('sha256').update(keyBuf).digest('base64');
}

function _constEqBase64(a, b) {
  // timing-safe comparison for base64 verifier strings
  try {
    const ba = Buffer.from(String(a), 'base64');
    const bb = Buffer.from(String(b), 'base64');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch(e) {
    return false;
  }
}

function _encryptVault(data, keyBuf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  const pt = Buffer.from(JSON.stringify(data), 'utf8');
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: 'aes-256-gcm',
    kdf: 'scrypt',
    iv: iv.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64')
  };
}

function _decryptVault(vault, keyBuf) {
  const iv = Buffer.from(vault.iv, 'base64');
  const ct = Buffer.from(vault.ct, 'base64');
  const tag = Buffer.from(vault.tag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}

// ============== No-master-password storage (OS-sealed) ==============
// When the user has NOT set a master password, passwords are still never
// written to disk in plaintext: the array is sealed with Electron
// safeStorage (DPAPI on Windows, Keychain on macOS, libsecret on Linux).
// If the OS backend is unavailable (rare headless Linux setups), a locally
// generated 0600 key file is used as a fallback — weaker than a keychain,
// but the password database is never stored in cleartext.
function _fallbackKeyPath() {
  return path.join(electronApp.getPath('userData'), 'passwords-fallback.key');
}
function _fallbackKey() {
  try {
    var p = _fallbackKeyPath();
    if (fs.existsSync(p)) return fs.readFileSync(p);
    var k = crypto.randomBytes(32);
    fs.writeFileSync(p, k, { mode: 0o600 });
    return k;
  } catch(e) { return null; }
}
function _sealNoVault(data) {
  try {
    var json = JSON.stringify(data);
    var ss = null;
    try { ss = require('electron').safeStorage; } catch(e0) { ss = null; }
    if (ss && ss.isEncryptionAvailable && ss.isEncryptionAvailable()) {
      return { v: 1, alg: 'safeStorage', ct: ss.encryptString(json).toString('base64') };
    }
  } catch(e) {}
  var key = _fallbackKey();
  if (!key) return null;
  var iv = crypto.randomBytes(12);
  var cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  var pt = Buffer.from(JSON.stringify(data), 'utf8');
  var ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  return { v: 1, alg: 'local-key', iv: iv.toString('base64'), ct: ct.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}
function _unsealNoVault(sealed) {
  if (!sealed || typeof sealed !== 'object') return null;
  try {
    if (sealed.alg === 'safeStorage') {
      var ss = null;
      try { ss = require('electron').safeStorage; } catch(e0) { ss = null; }
      if (!ss) return null;
      return JSON.parse(ss.decryptString(Buffer.from(sealed.ct, 'base64')));
    }
    if (sealed.alg === 'local-key') {
      var key = _fallbackKey();
      if (!key) return null;
      var decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
      var pt = Buffer.concat([decipher.update(Buffer.from(sealed.ct, 'base64')), decipher.final()]);
      return JSON.parse(pt.toString('utf8'));
    }
  } catch(e) { return null; }
  return null;
}
// One-time migration: convert legacy plaintext `passwords` to the sealed form.
function _migratePlaintextPasswords() {
  try {
    var store = readStorage();
    if (store.passwordVault && store.masterAuth) {
      if (store.passwords) { delete store.passwords; writeStorage(store); }
      return;
    }
    if (!Array.isArray(store.passwords) || store.passwords.length === 0) {
      if (store.passwords) { delete store.passwords; writeStorage(store); }
      return;
    }
    var sealed = _sealNoVault(store.passwords);
    if (!sealed) return;
    delete store.passwords;
    store.passwordsSealed = sealed;
    writeStorage(store);
  } catch(e) {}
}

// Read the decrypted passwords array. Returns null when the vault is locked.
function _readPasswordsDecrypted(store) {
  if (store.passwordVault && store.masterAuth) {
    if (!_vaultKey) return null;
    try { return _decryptVault(store.passwordVault, _vaultKey); }
    catch(e) { return null; }
  }
  if (store.passwordsSealed) {
    return _unsealNoVault(store.passwordsSealed) || [];
  }
  return store.passwords || [];
}

// Persist the passwords array — encrypts when a vault exists, seals with the
// OS backend otherwise. Returns true on success, false when the vault is locked.
function _writePasswords(store, passwords) {
  if (store.passwordVault && store.masterAuth) {
    if (!_vaultKey) return false;
    store.passwordVault = _encryptVault(passwords, _vaultKey);
    delete store.passwords;
    delete store.passwordsSealed;
  } else {
    var sealed = _sealNoVault(passwords);
    delete store.passwords;
    delete store.passwordsSealed;
    if (sealed) {
      store.passwordsSealed = sealed;
    } else {
      try { console.error('[vault] Failed to seal passwords: not persisted'); } catch(e0) {}
    }
  }
  return true;
}

ipcMain.handle('has-master-password', () => {
  const store = readStorage();
  return { success: true, has: !!(store.passwordVault && store.masterAuth) };
});

ipcMain.handle('is-vault-unlocked', () => {
  const store = readStorage();
  // No vault configured — there is nothing to lock, treat as accessible.
  if (!(store.passwordVault && store.masterAuth)) {
    return { success: true, unlocked: true, configured: false };
  }
  return { success: true, unlocked: !!_vaultKey, configured: true };
});

ipcMain.handle('unlock-vault', (_, pw) => {
  const store = readStorage();
  if (!store.masterAuth || !store.passwordVault) {
    return { success: false, message: 'No master password is set' };
  }
  try {
    const salt = Buffer.from(store.masterAuth.salt, 'base64');
    const key = _deriveKey(pw, salt);
    const verifier = _verifierOf(key);
    if (!_constEqBase64(verifier, store.masterAuth.verifier)) {
      return { success: false, message: 'Wrong master password' };
    }
    // Confirm the key actually decrypts the vault (defense in depth).
    _decryptVault(store.passwordVault, key);
    _vaultKey = key;
    return { success: true };
  } catch(e) {
    return { success: false, message: 'Wrong master password' };
  }
});

ipcMain.handle('lock-vault', () => {
  _vaultKey = null;
  _notifyPasswordsUpdated();
  return { success: true };
});

ipcMain.handle('verify-master-password', (_, pw) => {
  // Backwards-compatible verification. Also caches the key on success so
  // existing UIs that verify before operating keep working.
  const store = readStorage();
  if (!store.masterAuth) return { success: true, valid: false };
  try {
    const salt = Buffer.from(store.masterAuth.salt, 'base64');
    const key = _deriveKey(pw, salt);
    const verifier = _verifierOf(key);
    const valid = _constEqBase64(verifier, store.masterAuth.verifier);
    if (valid) _vaultKey = key;
    return { success: true, valid };
  } catch(e) {
    return { success: true, valid: false };
  }
});

// Sets up a brand-new master password and encrypts any existing plaintext
// passwords into a new vault. Shared by set-master-password and the
// not-yet-configured branch of change-master-password.
function _doSetMasterPassword(store, pw) {
  const salt = crypto.randomBytes(16);
  const key = _deriveKey(pw, salt);
  const verifier = _verifierOf(key);
  const existing = _readPasswordsDecrypted(store) || [];
  store.passwordVault = _encryptVault(existing, key);
  store.masterAuth = { v: 1, kdf: 'scrypt', salt: salt.toString('base64'), verifier: verifier };
  delete store.passwords;
  delete store.passwordsSealed;
  // All protection toggles stay OFF by default — even when a master password
  // is first created. The user must explicitly opt in to each protection.
  // (Previously this force-enabled protectSettings and protectBackup.)
  store.libraryProtection = Object.assign({}, _defaultLibraryProtection(), store.libraryProtection || {});
  writeStorage(store);
  _vaultKey = key;
  _notifyPasswordsUpdated();
  return { success: true, message: 'Master password set. ' + existing.length + ' passwords encrypted.' };
}

ipcMain.handle('set-master-password', (_, pw) => {
  if (!pw || pw.length < 8) {
    return { success: false, message: 'Password must be at least 8 characters' };
  }
  const store = readStorage();
  if (store.passwordVault && store.masterAuth) {
    return { success: false, message: 'Master password already set. Use change-master-password.' };
  }
  try {
    return _doSetMasterPassword(store, pw);
  } catch(e) {
    return { success: false, message: 'Failed to set master password: ' + e.message };
  }
});

ipcMain.handle('change-master-password', (_, oldPw, newPw) => {
  const store = readStorage();
  if (!store.masterAuth || !store.passwordVault) {
    // No vault configured yet — treat as an initial set.
    if (typeof newPw === 'undefined' || newPw === null) {
      return { success: false, message: 'No master password is set' };
    }
    if (!newPw || newPw.length < 8) {
      return { success: false, message: 'New password must be at least 8 characters' };
    }
    try { return _doSetMasterPassword(store, newPw); }
    catch(e) { return { success: false, message: 'Failed to set master password: ' + e.message }; }
  }
  if (!newPw || newPw.length < 8) {
    return { success: false, message: 'New password must be at least 8 characters' };
  }
  try {
    const oldSalt = Buffer.from(store.masterAuth.salt, 'base64');
    const oldKey = _deriveKey(oldPw, oldSalt);
    const oldVerifier = _verifierOf(oldKey);
    if (!_constEqBase64(oldVerifier, store.masterAuth.verifier)) {
      return { success: false, message: 'Wrong old password' };
    }
    const plaintext = _decryptVault(store.passwordVault, oldKey);
    const newSalt = crypto.randomBytes(16);
    const newKey = _deriveKey(newPw, newSalt);
    const newVerifier = _verifierOf(newKey);
    store.passwordVault = _encryptVault(plaintext, newKey);
    store.masterAuth = { v: 1, kdf: 'scrypt', salt: newSalt.toString('base64'), verifier: newVerifier };
    writeStorage(store);
    _vaultKey = newKey;
    _notifyPasswordsUpdated();
    return { success: true, message: 'Master password changed' };
  } catch(e) {
    return { success: false, message: 'Failed to change master password' };
  }
});

ipcMain.handle('remove-master-password', (_, pw) => {
  // Removes the master password and re-seals passwords with the OS backend.
  const store = readStorage();
  if (!store.masterAuth || !store.passwordVault) {
    return { success: false, message: 'No master password is set' };
  }
  try {
    const salt = Buffer.from(store.masterAuth.salt, 'base64');
    const key = _deriveKey(pw, salt);
    const verifier = _verifierOf(key);
    if (!_constEqBase64(verifier, store.masterAuth.verifier)) {
      return { success: false, message: 'Wrong master password' };
    }
    const plaintext = _decryptVault(store.passwordVault, key);
    delete store.passwordVault;
    delete store.masterAuth;
    _vaultKey = null;
    _writePasswords(store, plaintext);
    writeStorage(store);
    _notifyPasswordsUpdated();
    return { success: true, message: 'Master password removed' };
  } catch(e) {
    return { success: false, message: 'Wrong master password' };
  }
});

// ============== LIBRARY PROTECTION ==============
// Gates access to Library.html (history, bookmarks, downloads, cookies,
// passwords) behind the user's master password. Toggleable in Settings →
// Library protection.
//
// The same master password also powers (all optional, all in the same panel):
//   protectSettings — require auth to open Settings at all
//   protectBackup   — require re-auth every time the Backup section is opened
//   appLock         — lock the whole browser on startup (one unlock per launch)
// "Single password everywhere" means the SAME master password is used in every
// gate — NOT that unlocking one unlocks the others. Each protected zone keeps
// its own in-memory flag and asks for the password on first entry (resets on
// quit). This matches the Library's existing behaviour and is what the user
// expects: clicking the lock must never let you through without the password.
let _libraryUnlocked = false;   // Library entry
let _appUnlocked = false;       // browser startup lock
let _settingsUnlocked = false;  // Settings entry
let _backupUnlocked = false;    // Backup section (unused for gating — always asks)

function _defaultLibraryProtection() {
  return {
    passwordRequired: false,   // protect Library — OFF by default (no master pw at first launch)
    biometricRequired: false,
    enhancedProtection: false,
    protectSettings: false,    // require auth to open Settings
    protectBackup: false,      // re-auth on entering Backup section
    appLock: false,            // lock whole browser on startup
    idleLock: false,           // auto-lock the browser after N minutes of inactivity
    idleLockMinutes: 5         // default inactivity threshold (minutes)
  };
}

// Cross-platform biometric auth.
//   macOS  → systemPreferences.promptTouchID (Touch ID)
//   Linux  → fprintd-verify (needs an enrolled fingerprint + polkit)
//   Win/other → unavailable, caller falls back to the password prompt
async function _biometricAuth(reason) {
  try {
    const sp = require('electron').systemPreferences;
    if (sp && sp.canPromptTouchID && sp.canPromptTouchID()) {
      await sp.promptTouchID(reason || 'Unlock StartPOZI');
      return { success: true };
    }
  } catch(e) { return { success: false, message: 'Biometric canceled' }; }
  if (process.platform === 'linux') {
    try {
      const { execFile } = require('child_process');
      const code = await new Promise(function(resolve) {
        execFile('fprintd-verify', [], { timeout: 30000, stdio: ['ignore', 'ignore', 'ignore'] }, function(err) {
          // fprintd-verify exits 0 on a matching print, non-zero otherwise.
          resolve(err ? (typeof err.code === 'number' ? err.code : 1) : 0);
        });
      });
      if (code === 0) return { success: true };
      return { success: false, message: 'Fingerprint not recognized' };
    } catch(e) {
      return { success: false, message: 'fprintd is not available' };
    }
  }
  return { success: false, message: 'Biometric authentication is not available on this platform' };
}

// Is biometric available on this machine (for UI hints / toggle enabling)?
function _biometricAvailable() {
  try {
    const sp = require('electron').systemPreferences;
    if (sp && sp.canPromptTouchID && sp.canPromptTouchID()) return true;
  } catch(e) {}
  if (process.platform === 'linux') {
    // fprintd-verify exists → assume a reader is configured.
    try { return fs.existsSync('/usr/bin/fprintd-verify') || fs.existsSync('/usr/local/bin/fprintd-verify'); }
    catch(e) { return false; }
  }
  return false;
}

// One-time migration: when a master password exists, "Protection" (Settings)
// and "Backup" should be ON by default. Before these toggles existed, the
// stored value was false — that was the code's default, not an explicit user
// choice, so it's safe to flip. The _secureDefaultsApplied flag means this
// only runs once; after it, the user's explicit ON/OFF choices are respected.
function _applySecureDefaultsIfNeeded() {
  try {
    const store = readStorage();
    if (!store.masterAuth || !store.passwordVault) return;
    let lp = store.libraryProtection || (store.libraryProtection = {});
    if (lp._secureDefaultsApplied) return;
    let changed = false;
    if (!lp.protectSettings) { lp.protectSettings = true; changed = true; }
    if (!lp.protectBackup) { lp.protectBackup = true; changed = true; }
    lp._secureDefaultsApplied = true;
    if (changed) writeStorage(store);
  } catch(e) {}
}

function _verifyMasterPw(store, pw) {
  if (!store.masterAuth) return false;
  try {
    const salt = Buffer.from(store.masterAuth.salt, 'base64');
    const key = _deriveKey(pw, salt);
    const verifier = _verifierOf(key);
    return _constEqBase64(verifier, store.masterAuth.verifier);
  } catch(e) { return false; }
}

ipcMain.handle('get-library-protection', () => {
  const store = readStorage();
  const lp = store.libraryProtection || _defaultLibraryProtection();
  return Object.assign({}, _defaultLibraryProtection(), lp, {
    biometricAvailable: _biometricAvailable(),
    hasMasterPassword: !!(store.masterAuth && store.passwordVault)
  });
});

// ===== Library =====
ipcMain.handle('check-library-protection', () => {
  const store = readStorage();
  const lp = store.libraryProtection || _defaultLibraryProtection();
  const hasMaster = !!(store.masterAuth && store.passwordVault);
  return {
    needsAuth: (lp.passwordRequired || lp.biometricRequired) && hasMaster && !_libraryUnlocked,
    passwordRequired: lp.passwordRequired,
    biometricRequired: lp.biometricRequired,
    enhancedProtection: lp.enhancedProtection,
    hasMasterPassword: hasMaster,
    alreadyUnlocked: _libraryUnlocked
  };
});
ipcMain.handle('verify-library-access', (_, password) => {
  const store = readStorage();
  if (!store.masterAuth || !store.passwordVault) {
    return { success: false, message: 'No master password is set. Set one in the password manager first.' };
  }
  if (_verifyMasterPw(store, password)) { _libraryUnlocked = true; return { success: true }; }
  return { success: false, message: 'Wrong password' };
});
ipcMain.handle('library-biometric-auth', async () => {
  const res = await _biometricAuth('Unlock StartPOZI Library');
  if (res && res.success) _libraryUnlocked = true;
  return res;
});
ipcMain.handle('lock-library', () => { _libraryUnlocked = false; return { success: true }; });

// ===== Settings (require auth to open Settings) =====
ipcMain.handle('check-settings-protection', () => {
  const store = readStorage();
  const lp = store.libraryProtection || _defaultLibraryProtection();
  const hasMaster = !!(store.masterAuth && store.passwordVault);
  return {
    needsAuth: !!lp.protectSettings && hasMaster && !_settingsUnlocked,
    biometricRequired: !!lp.biometricRequired,
    biometricAvailable: _biometricAvailable(),
    hasMasterPassword: hasMaster,
    alreadyUnlocked: _settingsUnlocked
  };
});
ipcMain.handle('verify-settings-access', (_, password) => {
  const store = readStorage();
  if (!store.masterAuth) return { success: false, message: 'No master password is set' };
  if (_verifyMasterPw(store, password)) { _settingsUnlocked = true; return { success: true }; }
  return { success: false, message: 'Wrong password' };
});
ipcMain.handle('settings-biometric-auth', async () => {
  const res = await _biometricAuth('Unlock StartPOZI Settings');
  if (res && res.success) _settingsUnlocked = true;
  return res;
});

// ===== Backup section (re-auth every time it is opened) =====
ipcMain.handle('check-backup-protection', () => {
  const store = readStorage();
  const lp = store.libraryProtection || _defaultLibraryProtection();
  const hasMaster = !!(store.masterAuth && store.passwordVault);
  // Always ask when enabled — the user explicitly wants a re-entry each time.
  return {
    needsAuth: !!lp.protectBackup && hasMaster,
    biometricRequired: !!lp.biometricRequired,
    biometricAvailable: _biometricAvailable(),
    hasMasterPassword: hasMaster
  };
});
ipcMain.handle('verify-backup-access', (_, password) => {
  const store = readStorage();
  if (!store.masterAuth) return { success: false, message: 'No master password is set' };
  if (_verifyMasterPw(store, password)) { _backupUnlocked = true; return { success: true }; }
  return { success: false, message: 'Wrong password' };
});
ipcMain.handle('lock-backup', () => { _backupUnlocked = false; return { success: true }; });

// ===== Protection section gate (require master password to even SEE the
// panel where the protection toggles / master-password controls live —
// otherwise anyone who reaches Settings could just turn protection off) =====
ipcMain.handle('check-protection-access', () => {
  const store = readStorage();
  const hasMaster = !!(store.masterAuth && store.passwordVault);
  // Always ask when a master password exists (first-run setup stays open).
  return {
    needsAuth: hasMaster,
    biometricRequired: !!(store.libraryProtection && store.libraryProtection.biometricRequired),
    biometricAvailable: _biometricAvailable(),
    hasMasterPassword: hasMaster
  };
});
ipcMain.handle('verify-protection-access', (_, password) => {
  const store = readStorage();
  if (!store.masterAuth) return { success: false, message: 'No master password is set' };
  if (_verifyMasterPw(store, password)) return { success: true };
  return { success: false, message: 'Wrong password' };
});

// ===== Browser startup lock (appLock) =====
ipcMain.handle('check-app-lock', () => {
  const store = readStorage();
  const lp = store.libraryProtection || _defaultLibraryProtection();
  const hasMaster = !!(store.masterAuth && store.passwordVault);
  return {
    needsAuth: (!!lp.appLock || !!lp.idleLock) && hasMaster && !_appUnlocked,
    biometricRequired: !!lp.biometricRequired,
    biometricAvailable: _biometricAvailable(),
    hasMasterPassword: hasMaster,
    alreadyUnlocked: _appUnlocked
  };
});
ipcMain.handle('verify-app-lock', (_, password) => {
  const store = readStorage();
  if (!store.masterAuth) return { success: false, message: 'No master password is set' };
  if (_verifyMasterPw(store, password)) { _appUnlocked = true; return { success: true }; }
  return { success: false, message: 'Wrong password' };
});
ipcMain.handle('app-biometric-auth', async () => {
  const res = await _biometricAuth('Unlock StartPOZI Browser');
  if (res && res.success) _appUnlocked = true;
  return res;
});

// ===== Auto-lock on inactivity (idleLock) =====
// Polls powerMonitor.getSystemIdleTime() every 15s. When the user has been
// inactive for longer than the configured threshold AND a master password is
// set AND idleLock is enabled, we reset _appUnlocked and tell the renderer to
// cover the UI with #appLockScreen (same one used by the startup lock).
let _idleLockArmed = true; // false while the lock screen is already up
function _startIdleLockPoller() {
  try {
    const { powerMonitor } = require('electron');
    setInterval(function() {
      if (!_idleLockArmed) return;
      const store = readStorage();
      const lp = store.libraryProtection || _defaultLibraryProtection();
      if (!lp.idleLock) return;
      if (!store.masterAuth || !store.passwordVault) return;
      const threshold = Math.max(1, parseInt(lp.idleLockMinutes, 10) || 5) * 60;
      let idle = -1;
      try { idle = powerMonitor.getSystemIdleTime(); } catch(e) { return; }
      if (idle >= threshold) {
        _appUnlocked = false;
        _idleLockArmed = false;
        try {
          // Lock EVERY shell window (main + dedicated incognito).
          _allShells().forEach(function (sh) {
            try { sh.webContents.send('idle-lock-triggered'); } catch(e2) {}
          });
        } catch(e) {}
      }
    }, 15000);
    // Re-arm after unlock — the renderer fires 'idle-lock-rearm' once the
    // master password has been entered on the lock screen.
    ipcMain.on('idle-lock-rearm', () => { _idleLockArmed = true; });
  } catch(e) {}
}

ipcMain.handle('set-library-protection', (_, settings, password) => {
  const store = readStorage();
  const current = store.libraryProtection || _defaultLibraryProtection();
  settings = settings || {};
  const next = Object.assign({}, _defaultLibraryProtection(), current, {
    passwordRequired: !!settings.passwordRequired,
    biometricRequired: !!settings.biometricRequired,
    enhancedProtection: !!settings.enhancedProtection,
    protectSettings: !!settings.protectSettings,
    protectBackup: !!settings.protectBackup,
    appLock: !!settings.appLock,
    idleLock: !!settings.idleLock,
    idleLockMinutes: Math.max(1, parseInt(settings.idleLockMinutes, 10) || 5)
  });
  // Turning a protection OFF requires the master password to prevent
  // unauthorised tampering. Turning things ON never requires it.
  const disablingSecurity = (current.passwordRequired && !next.passwordRequired) ||
                            (current.enhancedProtection && !next.enhancedProtection) ||
                            (current.protectSettings && !next.protectSettings) ||
                            (current.protectBackup && !next.protectBackup) ||
                            (current.appLock && !next.appLock) ||
                            (current.idleLock && !next.idleLock);
  if (disablingSecurity) {
    if (!store.masterAuth) {
      return { success: false, message: 'No master password is set' };
    }
    if (!_verifyMasterPw(store, password || '')) {
      return { success: false, message: 'Wrong password' };
    }
  }
  store.libraryProtection = next;
  writeStorage(store);
  return { success: true };
});

ipcMain.handle('clear-selected-data', async (_, types, timeRange) => {
  try {
    if (!mainWindow) return { success: true, message: 'Data cleared' };
    const ses = mainWindow.webContents.session;
    const storages = [];
    if (types && types.cache) { storages.push('cache'); try { await ses.clearCache(); } catch(e) {} }
    if (types && types.cookies) storages.push('cookies');
    if (types && types.localStorage) storages.push('localstorage');
    if (types && types.indexedDB) storages.push('indexdb');
    if (types && types.serviceWorkers) storages.push('serviceworkers');
    if (types && types.cacheStorage) storages.push('cachestorage');
    if (storages.length > 0) {
      await ses.clearStorageData({ storages: storages, origin: null });
    }
    if (types && types.history) {
      const store = readStorage();
      store.history = [];
      writeStorage(store);
      if (mainWindow) mainWindow.webContents.send('history-updated');
    }
    return { success: true, message: 'Data cleared' };
  } catch(e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('clear-browsing-data', async (_, options, dataToRemove) => {
  try {
    const ses = mainWindow.webContents.session;

    // 1. Storage (cookies, localStorage, IndexedDB, SW, cacheStorage)
    const storages = [];
    if (dataToRemove.cache) storages.push('cache');
    if (dataToRemove.cookies) storages.push('cookies');
    if (dataToRemove.localStorage) storages.push('localstorage');
    if (dataToRemove.indexedDB) storages.push('indexdb');
    if (dataToRemove.serviceWorkers) storages.push('serviceworkers');
    if (dataToRemove.cacheStorage) storages.push('cachestorage');
    if (storages.length > 0) {
      await ses.clearStorageData({ storages: storages, origin: null });
    }

    // 2. HTTP cache (images, scripts, styles) — needs a separate call
    if (dataToRemove.cache) {
      try { await ses.clearCache(); } catch(e) {}
      try { await ses.clearAuthCache(); } catch(e) {}
      try { await ses.clearHostResolverCache(); } catch(e) {}
    }

    // 3. Remove ALL cookies manually (clearStorageData sometimes skips httpOnly)
    if (dataToRemove.cookies) {
      try {
        const allCookies = await ses.cookies.get({});
        for (const c of allCookies) {
          try {
            var url = (c.secure ? 'https://' : 'http://') + c.domain.replace(/^\./, '') + c.path;
            await ses.cookies.remove(url, c.name);
          } catch(e) {}
        }
      } catch(e) {}
    }

    if (dataToRemove.history) {
      const store = readStorage();
      store.history = [];
      writeStorage(store);
      if (mainWindow) mainWindow.webContents.send('history-updated');
    }

    return { success: true, message: 'Data cleared' };
  } catch(e) {
    return { success: false, message: 'Clear error: ' + e.message };
  }
});

// ============== .THMZ THEME SYSTEM ==============
function getThemesDir() {
  const dir = path.join(electronApp.getPath('userData'), 'themes');
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch(e) {}
  return dir;
}

function sanitizeThemeId(name) {
  return String(name || 'theme').toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '') || 'theme-' + Date.now();
}

function readThemeMeta(themeDir) {
  try {
    const jsonPath = path.join(themeDir, 'theme.json');
    if (!fs.existsSync(jsonPath)) return null;
    const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    return meta;
  } catch(e) { return null; }
}

function readThemeCss(themeDir) {
  try {
    const cssPath = path.join(themeDir, 'theme.css');
    if (!fs.existsSync(cssPath)) return '';
    return fs.readFileSync(cssPath, 'utf-8');
  } catch(e) { return ''; }
}

function getAllInstalledThemes() {
  const dir = getThemesDir();
  const result = [];
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const themeDir = path.join(dir, entry);
      try {
        if (!fs.statSync(themeDir).isDirectory()) continue;
        const meta = readThemeMeta(themeDir);
        if (!meta) continue;
        result.push({
          id: entry,
          name: meta.name || entry,
          author: meta.author || '',
          version: meta.version || '1.0',
          description: meta.description || '',
          type: meta.type || 'auto'
        });
      } catch(e) {}
    }
  } catch(e) {}
  return result;
}

let customThemeCSS = null;

function broadcastCustomTheme(css) {
  customThemeCSS = css || null;
  if (mainWindow) {
    if (css) mainWindow.webContents.send('apply-custom-theme-event', css);
    else mainWindow.webContents.send('clear-custom-theme-event');
  }
}

// Import a .thmz file (ZIP with theme.json + theme.css)
ipcMain.handle('theme-import', async (_, filePath) => {
  if (!AdmZip) return { success: false, error: 'adm-zip not available' };
  try {
    const zip = new AdmZip(filePath);
    const jsonEntry = zip.getEntry('theme.json');
    const cssEntry = zip.getEntry('theme.css');
    if (!jsonEntry) return { success: false, error: 'theme.json not found in archive' };
    if (!cssEntry) return { success: false, error: 'theme.css not found in archive' };

    const meta = JSON.parse(jsonEntry.getData().toString('utf-8'));
    const css = cssEntry.getData().toString('utf-8');

    if (css.includes('javascript:') || css.includes('expression(')) {
      return { success: false, error: 'Potentially dangerous CSS detected' };
    }

    const themeId = sanitizeThemeId(meta.name || meta.id || path.basename(filePath, '.thmz'));
    const themesDir = getThemesDir();
    const themeDir = path.join(themesDir, themeId);

    // Remove existing if overwrite
    try { if (fs.existsSync(themeDir)) fs.rmSync(themeDir, { recursive: true, force: true }); } catch(e) {}
    fs.mkdirSync(themeDir, { recursive: true });

    meta.id = themeId;
    fs.writeFileSync(path.join(themeDir, 'theme.json'), JSON.stringify(meta, null, 2), 'utf-8');
    fs.writeFileSync(path.join(themeDir, 'theme.css'), css, 'utf-8');

    return { success: true, theme: { id: themeId, name: meta.name || themeId, type: meta.type || 'auto', author: meta.author || '', version: meta.version || '1.0', description: meta.description || '' } };
  } catch(e) {
    return { success: false, error: String(e.message || e) };
  }
});

// List all installed themes
ipcMain.handle('theme-list', () => {
  return { success: true, themes: getAllInstalledThemes() };
});

// Apply a theme by id (persist + broadcast)
ipcMain.handle('theme-apply', (_, themeId) => {
  try {
    themeId = sanitizeThemeId(themeId);
    const themesDir = getThemesDir();
    const themeDir = path.join(themesDir, themeId);
    if (!fs.existsSync(themeDir)) return { success: false, error: 'Theme not found' };

    const css = readThemeCss(themeDir);
    const meta = readThemeMeta(themeDir);

    const store = readStorage();
    store.activeTheme = themeId;
    writeStorage(store);

    broadcastCustomTheme(css);
    return { success: true, name: meta ? meta.name : themeId };
  } catch(e) {
    return { success: false, error: String(e.message || e) };
  }
});

// Clear active custom theme
ipcMain.handle('theme-clear', () => {
  const store = readStorage();
  delete store.activeTheme;
  writeStorage(store);
  broadcastCustomTheme(null);
  return { success: true };
});

// Get the active theme id
ipcMain.handle('theme-get-active', () => {
  const store = readStorage();
  return store.activeTheme || null;
});

// Get CSS for a theme
ipcMain.handle('theme-get-css', (_, themeId) => {
  themeId = sanitizeThemeId(themeId);
  const themesDir = getThemesDir();
  const themeDir = path.join(themesDir, themeId);
  return readThemeCss(themeDir);
});

// Delete a theme
ipcMain.handle('theme-delete', (_, themeId) => {
  try {
    themeId = sanitizeThemeId(themeId);
    const themesDir = getThemesDir();
    const themeDir = path.join(themesDir, themeId);
    if (fs.existsSync(themeDir)) fs.rmSync(themeDir, { recursive: true, force: true });

    const store = readStorage();
    if (store.activeTheme === themeId) {
      delete store.activeTheme;
      writeStorage(store);
      broadcastCustomTheme(null);
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: String(e.message || e) };
  }
});

// Export a theme as .thmz
ipcMain.handle('theme-export', async (_, themeId) => {
  if (!AdmZip) return { success: false, error: 'adm-zip not available' };
  try {
    themeId = sanitizeThemeId(themeId);
    const themesDir = getThemesDir();
    const themeDir = path.join(themesDir, themeId);
    if (!fs.existsSync(themeDir)) return { success: false, error: 'Theme not found' };

    const result = await dialog.showSaveDialog({
      defaultPath: (themeId + '.thmz'),
      filters: [{ name: 'Theme Archive', extensions: ['thmz'] }]
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };

    const zip = new AdmZip();
    zip.addLocalFile(path.join(themeDir, 'theme.json'));
    zip.addLocalFile(path.join(themeDir, 'theme.css'));
    zip.writeZip(result.filePath);
    return { success: true, path: result.filePath };
  } catch(e) {
    return { success: false, error: String(e.message || e) };
  }
});

// Create a new theme from name + CSS (built-in editor)
ipcMain.handle('theme-create', (_, name, css, type) => {
  try {
    if (css.includes('javascript:') || css.includes('expression(')) {
      return { success: false, error: 'Potentially dangerous CSS detected' };
    }
    const themeId = sanitizeThemeId(name);
    const themesDir = getThemesDir();
    const themeDir = path.join(themesDir, themeId);

    try { if (fs.existsSync(themeDir)) fs.rmSync(themeDir, { recursive: true, force: true }); } catch(e) {}
    fs.mkdirSync(themeDir, { recursive: true });

    const meta = { id: themeId, name: name || themeId, author: 'User', version: '1.0', description: 'Custom theme', type: type || 'auto' };
    fs.writeFileSync(path.join(themeDir, 'theme.json'), JSON.stringify(meta, null, 2), 'utf-8');
    fs.writeFileSync(path.join(themeDir, 'theme.css'), css || '', 'utf-8');

    return { success: true, theme: { id: themeId, name: meta.name, type: meta.type } };
  } catch(e) {
    return { success: false, error: String(e.message || e) };
  }
});

// Show open dialog for .thmz file selection
ipcMain.handle('theme-pick-file', async () => {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'Theme Archive', extensions: ['thmz'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// Legacy compat: apply-custom-theme / clear-custom-theme
ipcMain.handle('apply-custom-theme', (_, css) => {
  broadcastCustomTheme(css);
  return { success: true };
});

ipcMain.handle('clear-custom-theme', () => {
  broadcastCustomTheme(null);
  return { success: true };
});

// ============== .SKIT SCRIPT PACKAGES ==============
// Format: ZIP archive (.skit) containing script.json + script.js (or .ts/.py).
// Installed packages live in <userData>/skits/<id>/ and register in store.scripts.
function getSkitsDir() { return path.join(electronApp.getPath('userData'), 'skits'); }
function sanitizeSkitId(name) {
  return String(name || 'untitled').toLowerCase()
    .replace(/[^a-z0-9_\-]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled';
}
function readSkitMeta(skitDir) {
  try { return JSON.parse(fs.readFileSync(path.join(skitDir, 'script.json'), 'utf-8')); }
  catch(e) { return null; }
}

// Import a .skit archive from a file path
ipcMain.handle('skit-import', async (_, filePath) => {
  if (!AdmZip) return { success: false, error: 'adm-zip not available' };
  try {
    var zip = new AdmZip(filePath);
    var jsonEntry = zip.getEntry('script.json');
    if (!jsonEntry) return { success: false, error: 'script.json not found in archive' };
    var meta = JSON.parse(jsonEntry.getData().toString('utf-8'));

    // Determine the main script file
    var mainFile = meta.main || 'script.js';
    var codeEntry = zip.getEntry(mainFile);
    if (!codeEntry) {
      // Try common names
      ['script.js', 'index.js', 'main.js'].forEach(function(f) {
        if (!codeEntry) codeEntry = zip.getEntry(f);
      });
    }
    if (!codeEntry) return { success: false, error: 'Main script file not found in archive' };
    var code = codeEntry.getData().toString('utf-8');

    var skitId = sanitizeSkitId(meta.name || meta.id || path.basename(filePath, '.skit'));
    var skitsDir = getSkitsDir();
    var skitDir = path.join(skitsDir, skitId);
    try { if (fs.existsSync(skitDir)) fs.rmSync(skitDir, { recursive: true, force: true }); } catch(e) {}
    fs.mkdirSync(skitDir, { recursive: true });

    meta.id = skitId;
    meta.installedAt = Date.now();
    fs.writeFileSync(path.join(skitDir, 'script.json'), JSON.stringify(meta, null, 2), 'utf-8');
    fs.writeFileSync(path.join(skitDir, mainFile), code, 'utf-8');
    // Extract any extra files
    zip.getEntries().forEach(function(entry) {
      var en = entry.entryName;
      if (en === 'script.json' || en === mainFile) return;
      if (/\.(js|ts|py|css|json|txt)$/i.test(en) && en.indexOf('..') === -1 &&
          en.charAt(0) !== '/' && en.charAt(0) !== '\\' && !/^[a-zA-Z]:/.test(en)) {
        try {
          var entryDir = path.dirname(path.join(skitDir, en));
          if (!fs.existsSync(entryDir)) fs.mkdirSync(entryDir, { recursive: true });
          fs.writeFileSync(path.join(skitDir, en), entry.getData().toString('utf-8'), 'utf-8');
        } catch(e) {}
      }
    });

    // Register in the existing scripts array so injection picks it up
    var store = readStorage();
    if (!store.scripts) store.scripts = [];
    var existingIdx = store.scripts.findIndex(function(s) { return s.skitId === skitId; });
    var scriptEntry = {
      id: 'skit-' + skitId,
      skitId: skitId,
      name: meta.name || skitId,
      description: meta.description || '',
      code: code,
      match: meta.match || '*://*/*',
      runAt: meta.runAt || 'document-idle',
      runInFrames: !!meta.runInFrames,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    if (existingIdx !== -1) {
      scriptEntry.enabled = store.scripts[existingIdx].enabled;
      scriptEntry.createdAt = store.scripts[existingIdx].createdAt;
      store.scripts[existingIdx] = scriptEntry;
    } else {
      store.scripts.push(scriptEntry);
    }
    writeStorage(store);

    return { success: true, skit: { id: skitId, name: meta.name || skitId, description: meta.description || '', version: meta.version || '1.0', author: meta.author || '', enabled: true } };
  } catch(e) {
    return { success: false, error: String(e.message || e) };
  }
});

// List all installed .skit packages
ipcMain.handle('skit-list', () => {
  var skitsDir = getSkitsDir();
  var list = [];
  try {
    if (fs.existsSync(skitsDir)) {
      fs.readdirSync(skitsDir).forEach(function(dir) {
        var meta = readSkitMeta(path.join(skitsDir, dir));
        if (meta) {
          var store = readStorage();
          var scriptEntry = (store.scripts || []).find(function(s) { return s.skitId === dir; });
          list.push({
            id: dir,
            name: meta.name || dir,
            description: meta.description || '',
            version: meta.version || '1.0',
            author: meta.author || '',
            type: meta.type || 'js',
            enabled: scriptEntry ? scriptEntry.enabled : false
          });
        }
      });
    }
  } catch(e) {}
  return { success: true, skits: list };
});

// Enable / disable a .skit package
ipcMain.handle('skit-toggle', (_, skitId, enabled) => {
  try {
    var store = readStorage();
    var scriptEntry = (store.scripts || []).find(function(s) { return s.skitId === skitId; });
    if (scriptEntry) {
      scriptEntry.enabled = !!enabled;
      writeStorage(store);
      return { success: true };
    }
    return { success: false, error: 'Script not registered' };
  } catch(e) { return { success: false, error: String(e.message || e) }; }
});

// Delete a .skit package
ipcMain.handle('skit-delete', (_, skitId) => {
  try {
    skitId = sanitizeSkitId(skitId);
    var skitsDir = getSkitsDir();
    var skitDir = path.join(skitsDir, skitId);
    if (fs.existsSync(skitDir)) fs.rmSync(skitDir, { recursive: true, force: true });
    var store = readStorage();
    store.scripts = (store.scripts || []).filter(function(s) { return s.skitId !== skitId; });
    writeStorage(store);
    return { success: true };
  } catch(e) { return { success: false, error: String(e.message || e) }; }
});

// Export a .skit package
ipcMain.handle('skit-export', async (_, skitId) => {
  if (!AdmZip) return { success: false, error: 'adm-zip not available' };
  try {
    skitId = sanitizeSkitId(skitId);
    var skitsDir = getSkitsDir();
    var skitDir = path.join(skitsDir, skitId);
    if (!fs.existsSync(skitDir)) return { success: false, error: 'Package not found' };
    var meta = readSkitMeta(skitDir) || {};
    var result = await dialog.showSaveDialog({
      defaultPath: (skitId + '.skit'),
      filters: [{ name: 'Script Archive', extensions: ['skit'] }]
    });
    if (result.canceled || !result.filePath) return { success: false, error: 'Cancelled' };
    var zip = new AdmZip();
    zip.addLocalFile(path.join(skitDir, 'script.json'));
    var mainFile = meta.main || 'script.js';
    if (fs.existsSync(path.join(skitDir, mainFile))) zip.addLocalFile(path.join(skitDir, mainFile));
    zip.writeZip(result.filePath);
    return { success: true, path: result.filePath };
  } catch(e) { return { success: false, error: String(e.message || e) }; }
});

// File picker for .skit
ipcMain.handle('skit-pick-file', async () => {
  var result = await dialog.showOpenDialog({
    filters: [{ name: 'Script Archive', extensions: ['skit'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// ============== HIBP k-anonymity helpers ==============
// Cache of range responses keyed by 5-char SHA-1 prefix, so checking many
// passwords that share a prefix (or repeated checks) cost no extra requests.
const _hibpRangeCache = new Map();
const _HIBP_CACHE_LIMIT = 200;

function _hibpLookupRange(prefix) {
  if (_hibpRangeCache.has(prefix)) return _hibpRangeCache.get(prefix);
  const promise = require('electron').net.fetch(EXTERNAL_SERVICES.hibp + prefix, {
    headers: { 'Add-Padding': 'true', 'User-Agent': 'StartPOZI-Browser' },
    signal: AbortSignal.timeout(8000)
  }).then(async (res) => {
    if (!res.ok) return null;
    const body = await res.text();
    const map = {};
    for (const line of body.split('\n')) {
      const sep = line.indexOf(':');
      if (sep <= 0) continue;
      map[line.slice(0, sep).trim()] = parseInt(line.slice(sep + 1).trim()) || 0;
    }
    return map;
  }).catch(() => null).finally(() => {
    // Replace the in-flight promise with its resolved value on completion.
    promise.then(map => {
      if (_hibpRangeCache.size >= _HIBP_CACHE_LIMIT) {
        const firstKey = _hibpRangeCache.keys().next().value;
        _hibpRangeCache.delete(firstKey);
      }
      _hibpRangeCache.set(prefix, Promise.resolve(map));
    });
  });
  _hibpRangeCache.set(prefix, promise);
  return promise;
}

async function _hibpCountForPassword(password) {
  const sha1 = crypto.createHash('sha1').update(String(password || '')).digest('hex').toUpperCase();
  const map = await _hibpLookupRange(sha1.substring(0, 5));
  if (!map) return -1; // network/API failure — unknown
  const c = map[sha1.substring(5)];
  return typeof c === 'number' ? c : 0;
}

// ============== SINGLE PASSWORD BREACH CHECK ==============
ipcMain.handle('check-password-breached', async (_, password) => {
  if (typeof password !== 'string' || !password) return { breached: false, count: 0, error: 'empty' };
  const count = await _hibpCountForPassword(password);
  if (count < 0) return { breached: false, count: 0, error: 'network' };
  return { breached: count > 0, count };
});

// ============== CHECK ALL PASSWORDS BREACHED ==============
ipcMain.handle('check-all-passwords-breached', async () => {
  const store = readStorage();
  const passwords = _readPasswordsDecrypted(store);
  if (passwords === null) return { success: false, message: 'Vault is locked. Unlock it first.' };
  const results = [];
  let breachedCount = 0;
  let networkFailed = false;
  for (const p of passwords) {
    const count = await _hibpCountForPassword(p.password);
    if (count < 0) { networkFailed = true; results.push({ id: p.id, count: 0, error: 'network' }); continue; }
    if (count > 0) breachedCount++;
    results.push({ id: p.id, count });
    // Be polite to the HIBP API when checking large vaults.
    await new Promise(r => setTimeout(r, 120));
  }
  return {
    success: true,
    breachedCount,
    totalCount: passwords.length,
    results,
    networkFailed
  };
});

// ============== TOTP ==============
ipcMain.handle('generate-totp', (_, secret, opts) => {
  try {
    var digits = (opts && opts.digits) || 6;
    var period = (opts && opts.period) || 30;
    var algorithm = (opts && opts.algorithm) || 'sha1';
    var epoch = Math.floor(Date.now() / 1000);
    var timeCounter = Math.floor(epoch / period);
    var timeRemaining = period - (epoch % period);

    var cleanedSecret = secret.replace(/[\s=-]/g, '').toUpperCase();
    var base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    // Standard streaming base32 decode (RFC 4648): every 5 chars yield
    // bits, each full 8 bits is one key byte. The previous chunked shifting
    // produced misaligned bytes and therefore wrong TOTP codes for every
    // secret.
    var keyBytes = [];
    var bitBuf = 0, bitLen = 0;
    for (var i = 0; i < cleanedSecret.length; i++) {
      var idx = base32Chars.indexOf(cleanedSecret[i]);
      if (idx < 0) continue;
      bitBuf = (bitBuf << 5) | idx;
      bitLen += 5;
      if (bitLen >= 8) {
        keyBytes.push((bitBuf >>> (bitLen - 8)) & 0xFF);
        bitLen -= 8;
      }
    }
    if (keyBytes.length === 0) return { success: false, error: 'Invalid secret' };

    var buf = Buffer.alloc(8);
    for (var b = 7; b >= 0; b--) {
      buf[b] = timeCounter & 0xFF;
      timeCounter = Math.floor(timeCounter / 256);
    }

    var hmac = crypto.createHmac(algorithm.toLowerCase(), Buffer.from(keyBytes));
    hmac.update(buf);
    var hash = hmac.digest();

    var offset = hash[hash.length - 1] & 0x0F;
    var code = ((hash[offset] & 0x7F) << 24) |
               ((hash[offset + 1] & 0xFF) << 16) |
               ((hash[offset + 2] & 0xFF) << 8) |
               (hash[offset + 3] & 0xFF);
    code = code % Math.pow(10, digits);
    var codeStr = String(code).padStart(digits, '0');

    return { success: true, code: codeStr, timeRemaining: timeRemaining };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('parse-totp-secret', (_, secret) => {
  if (!secret) return { success: false, error: 'Secret not specified' };
  // Detect algorithm from otpauth:// URL or accept raw base32
  let algorithm = 'sha1';
  let digits = 6;
  let rawSecret = secret;
  if (secret.startsWith('otpauth://')) {
    try {
      const url = new URL(secret);
      if (url.searchParams.get('algorithm')) algorithm = url.searchParams.get('algorithm');
      if (url.searchParams.get('digits')) digits = parseInt(url.searchParams.get('digits'));
      rawSecret = url.searchParams.get('secret') || rawSecret;
    } catch(e) {}
  }
  return { success: true, secret: rawSecret, algorithm, digits };
});

ipcMain.handle('scan-qr-code', (_, imageData) => {
  return { success: true, data: imageData || null };
});

ipcMain.handle('scan-page-qr', () => {
  return new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve({ success: false, message: 'No active window' });
      return;
    }
    const timeout = setTimeout(() => {
      resolve({ success: false, message: 'Scan timeout' });
    }, 10000);
    mainWindow.webContents.send('request-page-qr-scan');
    ipcMain.once('page-qr-result', (_, result) => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
});

ipcMain.handle('extract-totp-from-qr', (_, qrData) => {
  try {
    let uri = qrData;
    if (typeof uri !== 'string') return { success: false, secret: null };
    if (!uri.startsWith('otpauth://')) {
      const match = uri.match(/otpauth:\/\/[^\s"]+/);
      if (match) uri = match[0]; else return { success: false, secret: null };
    }
    const urlObj = new URL(uri);
    const secret = urlObj.searchParams.get('secret');
    if (!secret) return { success: false, secret: null };
    return {
      success: true,
      secret,
      issuer: urlObj.searchParams.get('issuer') || '',
      account: decodeURIComponent(urlObj.pathname.split(':')[1] || urlObj.pathname.substring(1) || ''),
      algorithm: urlObj.searchParams.get('algorithm') || 'sha1',
      digits: parseInt(urlObj.searchParams.get('digits')) || 6,
      period: parseInt(urlObj.searchParams.get('period')) || 30
    };
  } catch(e) {
    return { success: false, secret: null };
  }
});

// ============== AUTOFILL ==============
ipcMain.handle('autofill-password', (_, id) => {
  try {
    const store = readStorage();
    const passwords = _readPasswordsDecrypted(store);
    if (passwords === null) return { success: false, error: 'Vault is locked' };
    const pw = passwords.find(p => p.id === id);
    if (!pw) return { success: false, error: 'Password not found' };
    var afWin = _focusedShell();
    if (afWin) {
      afWin.webContents.send('autofill-credentials', { username: pw.username, password: pw.password, site: pw.site || '' });
    }
    return { success: true, username: pw.username, password: pw.password };
  } catch(e) {
    return { success: false, error: 'Error: ' + e.message };
  }
});

ipcMain.handle('get-matching-passwords', (_, url) => {
  try {
    const store = readStorage();
    const passwords = _readPasswordsDecrypted(store);
    if (passwords === null) return { success: false, locked: true, passwords: [] };
    if (!url) return { success: true, passwords: passwords };
    let targetHost;
    try { targetHost = new URL(url).hostname.replace(/^www\./, ''); } catch { targetHost = url; }
    const matches = passwords.filter(p => {
      if (!p.site) return false;
      try {
        const siteHost = new URL(p.site.startsWith('http') ? p.site : 'https://' + p.site).hostname.replace(/^www\./, '');
        return siteHost === targetHost || targetHost.endsWith('.' + siteHost) || siteHost.endsWith('.' + targetHost);
      } catch { return p.site.includes(targetHost); }
    });
    return { success: true, passwords: matches };
  } catch(e) {
    return { success: true, passwords: [] };
  }
});

// ============== IMPORT ==============
ipcMain.handle('import-ga-export', (_, content) => {
  try {
    const store = readStorage();
    const passwords = _readPasswordsDecrypted(store);
    if (passwords === null) return { success: false, imported: 0, errors: ['Vault is locked. Unlock it first.'] };
    let imported = 0;
    const data = JSON.parse(content);
    const items = Array.isArray(data) ? data : (data.accounts || data.entries || []);
    items.forEach(item => {
      const secret = item.secret || item.otpSecret || '';
      const name = item.name || item.issuer || item.label || '';
      if (!name && !secret) return;
      passwords.push({
        id: 'pw-' + Date.now() + '-' + imported,
        site: name, username: item.email || '', password: '',
        notes: 'Import from Google Authenticator', totpSecret: secret,
        totpAlgorithm: item.algorithm || 'sha1', totpDigits: item.digits || 6,
        createdAt: Date.now()
      });
      imported++;
    });
    if (!_writePasswords(store, passwords)) return { success: false, imported: 0, errors: ['Vault is locked'] };
    writeStorage(store);
    _notifyPasswordsUpdated();
    return { success: true, imported, errors: [] };
  } catch(e) {
    return { success: false, imported: 0, errors: ['Error: ' + e.message] };
  }
});

ipcMain.handle('import-txt-file', (_, content) => {
  try {
    const store = readStorage();
    const passwords = _readPasswordsDecrypted(store);
    if (passwords === null) return { success: false, imported: 0, errors: ['Vault is locked. Unlock it first.'] };
    let imported = 0;
    const errors = [];
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const sep = line.includes('\t') ? '\t' : (line.includes('|') ? '|' : ',');
      const parts = line.split(sep).map(s => s.trim());
      if (parts.length >= 2 && parts[0]) {
        passwords.push({
          id: 'pw-' + Date.now() + '-' + imported,
          site: parts[0], username: parts.length >= 3 ? parts[1] : '',
          password: parts.length >= 3 ? parts[2] : parts[1],
          notes: parts.slice(3).join(' ') || '', createdAt: Date.now()
        });
        imported++;
      } else if (line) {
        errors.push(`Line ${idx + 1}: invalid format`);
      }
    });
    if (!_writePasswords(store, passwords)) return { success: false, imported: 0, errors: ['Vault is locked'] };
    writeStorage(store);
    _notifyPasswordsUpdated();
    return { success: true, imported, errors };
  } catch(e) {
    return { success: false, imported: 0, errors: ['Error: ' + e.message] };
  }
});

// ============== SYSTEM INTEGRATION ==============
ipcMain.handle('get-platform-info', () => {
  return {
    success: true,
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    appPath: electronApp.getPath('exe'),
    userData: electronApp.getPath('userData')
  };
});

ipcMain.handle('register-system', async () => {
  try {
    const exePath = electronApp.getPath('exe');
    const iconPath = path.join(path.dirname(exePath), 'resources', 'icon.png');
    // Register the startpozi:// protocol handler through Electron as well —
    // the manual entries below only claim file associations.
    try { electronApp.setAsDefaultProtocolClient('startpozi'); } catch {}
    if (process.platform === 'linux') {
      const desktopEntry = `[Desktop Entry]
Type=Application
Name=StartPOZI Browser
Comment=StartPOZI Desktop Browser
Exec="${exePath}" %u
Icon=${fs.existsSync(iconPath) ? iconPath : 'internet-web-browser'}
Terminal=false
Categories=Network;WebBrowser;
MimeType=x-scheme-handler/http;x-scheme-handler/https;x-scheme-handler/startpozi;text/html;
StartupNotify=true
`;
      const desktopDir = path.join(process.env.HOME || '/tmp', '.local', 'share', 'applications');
      if (!fs.existsSync(desktopDir)) fs.mkdirSync(desktopDir, { recursive: true });
      const desktopFile = path.join(desktopDir, 'startpozi-browser.desktop');
      fs.writeFileSync(desktopFile, desktopEntry, 'utf-8');
      // Argv arrays (no shell) so a HOME or path value containing shell
      // metacharacters can never be interpreted.
      await _execFileOk('chmod', ['+x', desktopFile]);
      await _execFileOk('update-desktop-database', [desktopDir]);
      await _execFileOk('xdg-settings', ['set', 'default-web-browser', 'startpozi-browser.desktop']);
      return { success: true, message: 'Browser registered in the system' };
    }
    if (process.platform === 'win32') {
      // reg.exe invoked directly (no shell) with explicit argv.
      const regArgs = [
        ['add', 'HKCU\\Software\\Classes\\StartPOZI', '/ve', '/d', 'URL:StartPOZI Protocol', '/f'],
        ['add', 'HKCU\\Software\\Classes\\StartPOZI', '/v', 'URL Protocol', '/d', '', '/f'],
        ['add', 'HKCU\\Software\\Classes\\StartPOZI\\shell\\open\\command', '/ve', '/d', '"' + exePath + '" "%1"', '/f'],
        ['add', 'HKCU\\Software\\Classes\\.html\\OpenWithList\\StartPOZI', '/ve', '/d', '', '/f'],
        ['add', 'HKCU\\Software\\Clients\\StartMenuInternet\\StartPOZI', '/ve', '/d', 'StartPOZI Browser', '/f'],
        ['add', 'HKCU\\Software\\Clients\\StartMenuInternet\\StartPOZI\\shell\\open\\command', '/ve', '/d', '"' + exePath + '"', '/f']
      ];
      for (const a of regArgs) await _execFileOk('reg', a);
      return { success: true, message: 'Browser registered in the system' };
    }
    return { success: false, message: 'Platform not supported' };
  } catch(e) {
    return { success: false, message: 'Registration error: ' + e.message };
  }
});

ipcMain.handle('unregister-system', async () => {
  try {
    try { electronApp.removeAsDefaultProtocolClient('startpozi'); } catch {}
    if (process.platform === 'linux') {
      const desktopFile = path.join(process.env.HOME || '/tmp', '.local', 'share', 'applications', 'startpozi-browser.desktop');
      if (fs.existsSync(desktopFile)) {
        fs.unlinkSync(desktopFile);
        const desktopDir = path.dirname(desktopFile);
        await _execFileOk('update-desktop-database', [desktopDir]);
      }
      return { success: true, message: 'Registration removed' };
    }
    if (process.platform === 'win32') {
      const delArgs = [
        ['delete', 'HKCU\\Software\\Classes\\StartPOZI', '/f'],
        ['delete', 'HKCU\\Software\\Clients\\StartMenuInternet\\StartPOZI', '/f']
      ];
      for (const a of delArgs) await _execFileOk('reg', a);
      return { success: true, message: 'Registration removed' };
    }
    return { success: false, message: 'Platform not supported' };
  } catch(e) {
    return { success: false, message: 'Removal error: ' + e.message };
  }
});

ipcMain.handle('check-registration', async () => {
  try {
    if (process.platform === 'linux') {
      const desktopFile = path.join(process.env.HOME || '/tmp', '.local', 'share', 'applications', 'startpozi-browser.desktop');
      const registered = fs.existsSync(desktopFile);
      return { success: true, registered, message: registered ? 'Browser registered in the system' : 'Browser not registered in the system' };
    }
    if (process.platform === 'win32') {
      const registered = await _execFileOk('reg', ['query', 'HKCU\\Software\\Classes\\StartPOZI']);
      return { success: true, registered, message: registered ? 'Browser registered in the system' : 'Browser not registered in the system' };
    }
    return { success: true, registered: false, message: 'Check not supported on this platform' };
  } catch(e) {
    return { success: true, registered: false, message: 'Could not check' };
  }
});

ipcMain.handle('show-instructions', () => {
  return {
    success: true,
    instructions: 'To associate HTML files:\n1. Right-click the file → "Open with..."\n2. Select StartPOZI Browser\n3. Check "Always use"'
  };
});

// ============== WEBVIEW PRELOAD PATH ==============
ipcMain.handle('get-webview-preload-path', () => {
  return path.join(__dirname, 'preload-webview.js');
});

// ============== MISC ==============
ipcMain.handle('restart-browser', () => {
  try {
    const store = readStorage();
    const args = [];
    if (store.customDataPath) {
      args.push('--user-data-path=' + store.customDataPath);
    }
    electronApp.relaunch({ args: args.length > 0 ? [process.argv[0], ...args] : undefined });
    electronApp.exit(0);
    return { success: true };
  } catch(e) {
    return { success: false, message: 'Restart error: ' + e.message };
  }
});

ipcMain.handle('toggle-window-fullscreen', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});

ipcMain.handle('save-page-as', async (_, url) => {
  try {
    const { dialog } = require('electron');
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: url.split('/').pop().split('?')[0] || 'page.html',
      filters: [
        { name: 'HTML', extensions: ['html', 'htm'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (result.canceled) return { success: false };
    const https = require('https');
    const http = require('http');
    return new Promise((resolve) => {
      const fs = require('fs');
      const file = fs.createWriteStream(result.filePath);
      var redirectCount = 0;
      function doGet(u) {
        // Pick the client per-request: a cross-protocol redirect
        // (https → http or vice versa) must use the matching module,
        // otherwise the request fails with a protocol error.
        var client = String(u).indexOf('https') === 0 ? https : http;
        // Verify against the embedded CA bundle (certstore.pem() is null if
        // the bundle is missing — then Node's default roots apply).
        var caBundle = certstore.pem();
        var reqOpts = { headers: { 'User-Agent': 'Mozilla/5.0' } };
        if (caBundle) reqOpts.ca = caBundle;
        client.get(u, reqOpts, (response) => {
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirectCount < 5) {
            redirectCount++;
            var newUrl = response.headers.location;
            if (newUrl.indexOf('http') !== 0) {
              try { newUrl = new URL(newUrl, u).href; } catch(e) {}
            }
            response.resume();
            doGet(newUrl);
            return;
          }
          response.pipe(file);
          file.on('finish', () => { file.close(); resolve({ success: true }); });
        }).on('error', () => { resolve({ success: false }); });
      }
      doGet(url);
    });
  } catch(e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('save-screenshot', async (_, pngBase64) => {
  try {
    const store = readStorage();
    const screenshotDir = store.screenshotPath || store.downloadPath || electronApp.getPath('downloads');
    if (!fs.existsSync(screenshotDir)) {
      try { fs.mkdirSync(screenshotDir, { recursive: true }); } catch(e) {}
    }
    const filename = 'screenshot-' + Date.now() + '.png';
    const savePath = path.join(screenshotDir, filename);
    const buf = Buffer.from(pngBase64, 'base64');
    fs.writeFileSync(savePath, buf);
    return { success: true, path: savePath };
  } catch(e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('copy-screenshot', async (_, pngBase64) => {
  try {
    const { nativeImage, clipboard } = require('electron');
    const buf = Buffer.from(pngBase64, 'base64');
    const img = nativeImage.createFromBuffer(buf);
    clipboard.writeImage(img);
    return { success: true };
  } catch(e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('open-url-from-settings', (event, url) => {
  var win = _shellWindowOf(event.sender);
  if (win) {
    if (url === 'startpozi://customize-toolbar') {
      win.webContents.send('toggle-customize-mode');
    } else {
      win.webContents.send('open-in-new-tab', url);
    }
  }
  return { success: true };
});

// ============== ADDITIONAL SHELL WINDOWS ==============
// A dedicated incognito window is a frameless shell loaded as
// index.html?incognito=1: every tab opened there is an incognito tab and the
// regular profile is never touched. Like Chrome, each invocation opens a NEW
// incognito window. Regular additional windows (Ctrl+N / "New window") run
// as index.html?fresh=1 — they start with a blank start page and never
// restore or overwrite the primary session.
ipcMain.handle('open-incognito-window', function() {
  try {
    createShellWindow({ incognito: true });
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-new-window', function() {
  try {
    createShellWindow({});
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Tab tear-out: open `url` in a brand-new window. meta.incognito moves the
// tab into a new incognito window; meta.partition carries the source tab's
// in-memory incognito partition so cookies survive the move.
ipcMain.handle('open-window-with-tab', function(event, url, meta) {
  try {
    meta = meta || {};
    if (typeof url !== 'string' || !url) return { success: false, error: 'no url' };
    var win = createShellWindow({
      incognito: !!meta.incognito,
      tab: { url: url, title: meta.title || '', partition: meta.partition || '' }
    });
    // Appear under the cursor when tearing out by drag (point provided by
    // the drag poller), clamped into the nearest display's work area.
    if (typeof meta.x === 'number' && typeof meta.y === 'number') {
      try {
        var size = win.getSize();
        var wa = require('electron').screen.getDisplayNearestPoint({ x: meta.x, y: meta.y }).workArea;
        var nx = Math.min(Math.max(meta.x - Math.round(size[0] / 2), wa.x), wa.x + wa.width - size[0]);
        var ny = Math.min(Math.max(meta.y - 20, wa.y), wa.y + wa.height - size[1]);
        win.setPosition(nx, ny);
      } catch(e) {}
    }
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// Physical cursor position vs the calling window's bounds. HTML5 dragend
// coordinates are unreliable when the mouse is released outside the window
// (last in-window position, 0,0 or DPI-scaled values), so the renderer asks
// us where the cursor REALLY is before deciding the drag was a tear-off.
ipcMain.handle('is-cursor-outside-window', function(event) {
  try {
    var win = _shellWindowOf(event.sender);
    if (!win || win.isDestroyed()) return false;
    var screen = require('electron').screen;
    var pt = screen.getCursorScreenPoint();
    var b = win.getBounds();
    var m = 8;
    return pt.x < b.x - m || pt.x > b.x + b.width + m ||
           pt.y < b.y - m || pt.y > b.y + b.height + m;
  } catch(e) {
    return false;
  }
});

// ===== TAB DRAG TEAR-OFF POLLER =====
// On Linux the renderer's dragend event never fires when the mouse is
// released OUTSIDE the window, so "dropped outside" is undetectable from
// the DOM. Instead: while a tab drag is active the renderer notifies us,
// and we watch the physical cursor — once it moves beyond the source
// window's bounds by a margin, the tab is torn into a new window right
// away. Works identically on every platform; dragend is only used to STOP
// the poller when the drag ends normally inside the window.
var _tabDragPoller = null;
function _stopTabDragPoller() {
  if (_tabDragPoller) { clearInterval(_tabDragPoller); _tabDragPoller = null; }
}
ipcMain.on('tab-drag-start', function(event, tabId) {
  _stopTabDragPoller();
  var win = _shellWindowOf(event.sender);
  if (!win || typeof tabId !== 'string' || !tabId) return;
  var scr = require('electron').screen;
  var margin = 40; // px beyond the window edge that triggers the tear
  var startedAt = Date.now();
  // Wayland guard: getCursorScreenPoint() may return a frozen point there.
  // Only treat "outside" as a tear once the reported point has actually
  // MOVED since the drag started; a frozen point never tears.
  var origin = null;
  try { origin = scr.getCursorScreenPoint(); } catch(e) { return; }
  _tabDragPoller = setInterval(function() {
    if (!win || win.isDestroyed() || Date.now() - startedAt > 60000) {
      _stopTabDragPoller();
      return;
    }
    try {
      var pt = scr.getCursorScreenPoint();
      if (Math.abs(pt.x - origin.x) + Math.abs(pt.y - origin.y) < 10) return;
      var b = win.getBounds();
      if (pt.x < b.x - margin || pt.x > b.x + b.width + margin ||
          pt.y < b.y - margin || pt.y > b.y + b.height + margin) {
        // Cursor left the source window — but if it is inside ANOTHER shell
        // window, the user is moving the tab there, not tearing it out.
        var overOtherShell = _allShells().some(function (sh) {
          if (sh === win || sh.isDestroyed()) return false;
          try {
            var ob = sh.getBounds();
            return pt.x >= ob.x && pt.x <= ob.x + ob.width &&
                   pt.y >= ob.y && pt.y <= ob.y + ob.height;
          } catch(e2) { return false; }
        });
        if (overOtherShell) return;
        _stopTabDragPoller();
        try { win.webContents.send('tear-out-tab', { tabId: tabId, x: pt.x, y: pt.y }); } catch(e) {}
      }
    } catch(e) { _stopTabDragPoller(); }
  }, 80);
});
ipcMain.on('tab-drag-end', function() { _stopTabDragPoller(); });

// A tab was dropped onto another shell window: the accepting window already
// created its copy — tell every OTHER shell to remove the original silently
// (the source recognizes its own tabId; incognito partitions are NOT wiped,
// the session simply continues in the accepting window).
ipcMain.on('tab-move-to-window', function(event, payload) {
  try {
    if (!payload || typeof payload.tabId !== 'string' || !payload.tabId) return;
    _allShells().forEach(function (sh) {
      try {
        if (sh.webContents === event.sender) return;
        sh.webContents.send('close-foreign-dropped-tab', { tabId: payload.tabId });
      } catch(e) {}
    });
  } catch(e) {}
});

ipcMain.on('open-in-current-tab', (event, url) => {
  var win = _shellWindowOf(event.sender);
  if (win) {
    win.webContents.send('navigate-current-tab', url);
  }
});

ipcMain.on('go-back', (event) => {
  var win = _shellWindowOf(event.sender);
  if (win) {
    win.webContents.send('navigate-current-back');
  }
});

// ============== ADBLOCKER ==============
ipcMain.handle('adblocker-get-stats', () => {
  return { success: true, stats: adblocker.getStats(), enabled: adblocker.isEnabled() };
});

ipcMain.handle('adblocker-get-page-stats', (_, tabId) => {
  return { success: true, stats: adblocker.getPageStats(tabId), enabled: adblocker.isEnabled() };
});

ipcMain.handle('adblocker-reset-page-stats', (_, tabId) => {
  adblocker.resetPageStats(tabId);
  return { success: true };
});

ipcMain.handle('adblocker-toggle', (_, val) => {
  adblocker.setEnabled(val);
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    var ses = _mainWindow.webContents.session;
    try { adblocker.reEnable(ses, _secBeforeRequest); } catch(e) {}
  }
  return { success: true, enabled: adblocker.isEnabled() };
});

ipcMain.handle('adblocker-is-enabled', () => {
  return { success: true, enabled: adblocker.isEnabled() };
});

ipcMain.handle('adblocker-get-filterhub-catalog', () => {
  return (adblocker && adblocker.getFilterhubCatalog)
    ? adblocker.getFilterhubCatalog()
    : { lists: [], levels: {}, defaultLevel: 'medium' };
});

ipcMain.handle('adblocker-get-filterhub-enabled', () => {
  return (adblocker && adblocker.getFilterhubEnabled) ? adblocker.getFilterhubEnabled() : [];
});

ipcMain.handle('adblocker-set-filterhub-enabled', (_, nums) => {
  if (adblocker && adblocker.setFilterhubEnabled) return adblocker.setFilterhubEnabled(nums);
  return { success: false };
});

ipcMain.handle('adblocker-set-filterhub-preset', (_, level) => {
  if (adblocker && adblocker.setFilterhubPreset) return adblocker.setFilterhubPreset(level);
  return { success: false };
});

ipcMain.handle('adblocker-get-whitelist', () => {
  return { success: true, whitelist: adblocker.getWhitelist() };
});

ipcMain.handle('adblocker-add-whitelist', (_, domain) => {
  adblocker.addToWhitelist(domain);
  return { success: true };
});

ipcMain.handle('adblocker-remove-whitelist', (_, domain) => {
  adblocker.removeFromWhitelist(domain);
  return { success: true };
});

ipcMain.handle('adblocker-is-whitelisted', (_, domain) => {
  return { success: true, whitelisted: adblocker.isWhitelisted(domain) };
});

ipcMain.handle('adblocker-get-cosmetic-css', (_, url) => {
  var result = adblocker.getCosmeticFilters(url);
  return { success: true, css: result.css, scripts: result.scripts || [] };
});

function getSearchEngineName(url) {
  if (!url) return 'search engine';
  if (url.indexOf('google') !== -1) return 'Google';
  if (url.indexOf('yandex') !== -1) return 'Yandex';
  if (url.indexOf('bing') !== -1) return 'Bing';
  if (url.indexOf('duckduckgo') !== -1) return 'DuckDuckGo';
  if (url.indexOf('startpozi') !== -1) return 'StartPOZI';
  try { return new URL(url).hostname.replace('www.', ''); } catch(e) { return 'search engine'; }
}

// ============== CONTEXT MENU ==============
ipcMain.on('show-context-menu', (event, params) => {
  // Menu actions must go to the window that opened the menu (main or
  // dedicated incognito shell) — not blindly to mainWindow.
  var shell = _shellWindowOf(event.sender) || mainWindow;
  if (params.type === 'tabbar') {
    var template = [];

    if (params.tabId) {
      template.push({ label: t('Close tab'), click: function() { shell.webContents.send('context-menu-action', { type: 'closeTab', tabId: params.tabId }); } });
      template.push({ label: t('Close other tabs'), click: function() { shell.webContents.send('context-menu-action', { type: 'closeOtherTabs', tabId: params.tabId }); } });
      template.push({ label: t('Close tabs to the right'), click: function() { shell.webContents.send('context-menu-action', { type: 'closeTabsToRight', tabId: params.tabId }); } });
      if (params.tabUrl) {
        try {
          var tabDomain = new URL(params.tabUrl).hostname;
          template.push({ label: t('Close tabs from this domain'), click: function() { shell.webContents.send('context-menu-action', { type: 'closeTabsFromDomain', domain: tabDomain }); } });
        } catch(e) {}
        template.push({ label: t('Copy address'), click: function() { clipboard.writeText(params.tabUrl); } });
        template.push({ label: t('Duplicate tab'), click: function() { shell.webContents.send('context-menu-action', { type: 'duplicateTab' }); } });
        template.push({ label: t('Move tab to new window'), click: function() { shell.webContents.send('context-menu-action', { type: 'moveToNewWindow', tabId: params.tabId }); } });
        template.push({ label: t('Open in incognito'), click: function() { shell.webContents.send('context-menu-action', { type: 'openIncognito', url: params.tabUrl }); } });
      }
      template.push({ label: params.tabPinned ? t('Unpin tab') : t('Pin tab'), click: function() { shell.webContents.send('context-menu-action', { type: 'pinTab', tabId: params.tabId, pinned: !params.tabPinned }); } });
      template.push({ label: t('Put tab to sleep'), click: function() { shell.webContents.send('context-menu-action', { type: 'sleepTab', tabId: params.tabId }); } });
      try {
        var _opt = readStorage().optimization || {};
        if (_opt.sleepOthersEnabled) {
          template.push({ label: t('Put all others to sleep'), click: function() { shell.webContents.send('context-menu-action', { type: 'sleepOthers' }); } });
        }
      } catch(e) {}
      template.push({ label: t('Close after…'), submenu: [
        { label: t('5 min'),  click: function() { shell.webContents.send('context-menu-action', { type: 'closeAfter', tabId: params.tabId, minutes: 5 }); } },
        { label: t('15 min'), click: function() { shell.webContents.send('context-menu-action', { type: 'closeAfter', tabId: params.tabId, minutes: 15 }); } },
        { label: t('30 min'), click: function() { shell.webContents.send('context-menu-action', { type: 'closeAfter', tabId: params.tabId, minutes: 30 }); } },
        { label: t('60 min'), click: function() { shell.webContents.send('context-menu-action', { type: 'closeAfter', tabId: params.tabId, minutes: 60 }); } },
        { label: t('2 hours'), click: function() { shell.webContents.send('context-menu-action', { type: 'closeAfter', tabId: params.tabId, minutes: 120 }); } },
        { type: 'separator' },
        { label: t('Cancel timer'), click: function() { shell.webContents.send('context-menu-action', { type: 'closeAfterCancel', tabId: params.tabId }); } }
      ] });

      if (params.tabGroups && params.tabGroups.length > 0) {
        template.push({ type: 'separator' });
        template.push({ label: t('Add to group'), submenu: params.tabGroups.map(function(g) {
          return { label: g.name, click: function() { shell.webContents.send('context-menu-action', { type: 'addToGroup', tabId: params.tabId, groupId: g.id }); } };
        }) });
        template.push({ label: t('New group...'), click: function() { shell.webContents.send('context-menu-action', { type: 'createGroup', tabId: params.tabId }); } });
        if (params.tabGroupId) {
          template.push({ label: t('Remove from group'), click: function() { shell.webContents.send('context-menu-action', { type: 'removeFromGroup', tabId: params.tabId, groupId: params.tabGroupId }); } });
          template.push({ label: t('Color group'), submenu: [
            { label: t('Blue'), click: function() { shell.webContents.send('context-menu-action', { type: 'colorGroup', groupId: params.tabGroupId, color: '#4a90d9' }); } },
            { label: t('Red'), click: function() { shell.webContents.send('context-menu-action', { type: 'colorGroup', groupId: params.tabGroupId, color: '#e74c3c' }); } },
            { label: t('Green'), click: function() { shell.webContents.send('context-menu-action', { type: 'colorGroup', groupId: params.tabGroupId, color: '#2ecc71' }); } },
            { label: t('Orange'), click: function() { shell.webContents.send('context-menu-action', { type: 'colorGroup', groupId: params.tabGroupId, color: '#f39c12' }); } },
            { label: t('Purple'), click: function() { shell.webContents.send('context-menu-action', { type: 'colorGroup', groupId: params.tabGroupId, color: '#9b59b6' }); } },
            { label: t('Pink'), click: function() { shell.webContents.send('context-menu-action', { type: 'colorGroup', groupId: params.tabGroupId, color: '#e91e90' }); } },
            { label: t('Teal'), click: function() { shell.webContents.send('context-menu-action', { type: 'colorGroup', groupId: params.tabGroupId, color: '#1abc9c' }); } },
          ] });
          template.push({ label: t('Delete group'), click: function() { shell.webContents.send('context-menu-action', { type: 'deleteGroup', groupId: params.tabGroupId }); } });
        }
      } else {
        template.push({ label: t('Create group'), click: function() { shell.webContents.send('context-menu-action', { type: 'createGroup', tabId: params.tabId }); } });
      }

      template.push({ type: 'separator' });
    }

    template.push({ label: t('Reload all tabs'), click: function() { shell.webContents.send('context-menu-action', { type: 'reloadAllTabs' }); } });
    template.push({ label: t('New tab'), click: function() { shell.webContents.send('open-in-new-tab', ''); } });
    // Container tabs (Settings → Containers). Submenu lists the user's
    // containers; each opens a new tab in that container's partition.
    try {
      var _cStore = readStorage();
      if (_cStore.containersEnabled && Array.isArray(_cStore.containers) && _cStore.containers.length) {
        template.push({ label: t('New tab in container'), submenu: _cStore.containers.map(function(c) {
          return {
            label: (c.icon ? c.icon + ' ' : '') + (c.name || c.id),
            click: function() {
              shell.webContents.send('context-menu-action', { type: 'openContainerTab', containerId: c.id });
            }
          };
        }) });
      }
    } catch(e) {}
    template.push({ type: 'separator' });

    if (params.closedTabs && params.closedTabs.length > 0) {
      params.closedTabs.forEach(function(item, idx) {
        template.push({ label: '\u21A9 ' + item.title, click: function() { shell.webContents.send('context-menu-action', { type: 'reopenTab', url: item.url, index: idx }); } });
      });
    } else {
      template.push({ label: t('No closed tabs'), enabled: false });
    }

    var menu = Menu.buildFromTemplate(template);
    menu.popup({ window: mainWindow });
    return;
  }

  if (params.type === 'navbar') {
    var template = [];
    template.push({ label: t('Paste'), accelerator: 'CmdOrCtrl+V', click: function() { shell.webContents.paste(); } });
    template.push({ label: t('Paste and go'), click: function() { shell.webContents.send('context-menu-action', { type: 'pasteAndGo' }); } });
    template.push({ label: t('Select all'), accelerator: 'CmdOrCtrl+A', click: function() { shell.webContents.selectAll(); } });
    var menu = Menu.buildFromTemplate(template);
    menu.popup({ window: mainWindow });
    return;
  }

  var template = [];

  // Internal chrome pages (Settings, Library, MainPage, Viewer, about:*) get
  // a trimmed menu: no devtools / view-source / inspector / zapper / translate
  // — those either do nothing useful there or expose internals needlessly.
  var _menuPageUrl = String(params.pageURL || '');
  var _isInternalMenuPage = false;
  if (_menuPageUrl.indexOf('about:') === 0 || _menuPageUrl.indexOf('startpozi://') === 0) {
    _isInternalMenuPage = true;
  } else if (_menuPageUrl.indexOf('file://') === 0) {
    try {
      var _mp = decodeURIComponent(new URL(_menuPageUrl).pathname);
      if (process.platform === 'win32' && _mp.startsWith('/')) _mp = _mp.slice(1);
      _isInternalMenuPage = _pathInside(electronApp.getAppPath(), path.dirname(_mp));
    } catch(e) { _isInternalMenuPage = true; }
  }

  if (params.misspelledWord && params.dictionarySuggestions && params.dictionarySuggestions.length > 0) {
    params.dictionarySuggestions.forEach(function(s) {
      template.push({ label: s, click: function() { event.sender.send('context-menu-action', { type: 'replaceMisspelling', text: s }); } });
    });
    template.push({ type: 'separator' });
  }

  if (params.linkURL) {
    template.push({ label: t('Open link in new tab'), click: function() { shell.webContents.send('open-in-new-tab', params.linkURL); } });
    template.push({ label: t('Open in system browser'), click: function() { shell.openExternal(params.linkURL); } });
    template.push({ type: 'separator' });
    template.push({ label: t('Copy link address'), click: function() { clipboard.writeText(params.linkURL); } });
    if (params.linkText) {
      template.push({ label: t('Copy link text'), click: function() { clipboard.writeText(params.linkText); } });
    }
    template.push({ type: 'separator' });
    template.push({ label: t('Open in incognito'), click: function() { shell.webContents.send('context-menu-action', { type: 'openIncognito', url: params.linkURL }); } });
  }

  if (params.mediaType === 'image' && params.hasImageContents && params.srcURL) {
    template.push({ label: t('Open image'), click: function() { shell.webContents.send('open-in-new-tab', params.srcURL); } });
    template.push({ label: t('Copy image'), click: function() { shell.webContents.send('context-menu-action', { type: 'copyImage', url: params.srcURL }); } });
    template.push({ label: t('Copy image address'), click: function() { clipboard.writeText(params.srcURL); } });
    template.push({ label: t('Save image as...'), click: function() {
      var parsed = require('url').parse(params.srcURL);
      var filename = path.basename(parsed.pathname || 'image').split('?')[0] || 'image.png';
      dialog.showSaveDialog(mainWindow, { defaultPath: filename }).then(function(result) {
        if (!result.canceled && result.filePath) {
          var client = params.srcURL.startsWith('https') ? require('https') : require('http');
          var imgOpts = {};
          var imgCa = certstore.pem();
          if (imgCa) imgOpts.ca = imgCa;
          client.get(params.srcURL, imgOpts, function(response) {
            var stream = require('fs').createWriteStream(result.filePath);
            response.pipe(stream);
            stream.on('finish', function() { stream.close(); });
          });
        }
      });
    }});
    template.push({ type: 'separator' });
  }

  if (params.mediaType === 'video' || params.mediaType === 'audio') {
    template.push({ label: t('Play / Pause'), click: function() { shell.webContents.send('context-menu-action', { type: 'mediaPlayPause' }); } });
    template.push({ label: t('Mute'), click: function() { shell.webContents.send('context-menu-action', { type: 'mediaMute' }); } });
    template.push({ label: t('Copy address'), click: function() { shell.webContents.send('context-menu-action', { type: 'copyMediaUrl', url: params.srcURL }); } });
    if (params.mediaType === 'video') {
      template.push({ label: t('Picture in picture'), click: function() { shell.webContents.send('context-menu-action', { type: 'mediaPiP' }); } });
    }
    template.push({ type: 'separator' });
  }

  if (params.editFlags && params.editFlags.canCut) {
    template.push({ label: t('Cut'), accelerator: 'CmdOrCtrl+X', click: function() { shell.webContents.send('context-menu-action', { type: 'cut' }); } });
  }
  if (params.editFlags && params.editFlags.canCopy) {
    template.push({ label: t('Copy'), accelerator: 'CmdOrCtrl+C', click: function() { shell.webContents.send('context-menu-action', { type: 'copy' }); } });
  }
  if (params.editFlags && params.editFlags.canPaste) {
    template.push({ label: t('Paste'), accelerator: 'CmdOrCtrl+V', click: function() { shell.webContents.send('context-menu-action', { type: 'paste' }); } });
  }
  if (params.editFlags && params.editFlags.canUndo) {
    template.push({ label: t('Undo'), accelerator: 'CmdOrCtrl+Z', click: function() { shell.webContents.send('context-menu-action', { type: 'undo' }); } });
  }
  if (params.editFlags && params.editFlags.canRedo) {
    template.push({ label: t('Redo'), accelerator: 'CmdOrCtrl+Y', click: function() { shell.webContents.send('context-menu-action', { type: 'redo' }); } });
  }
  if (params.isEditable) {
    template.push({ label: t('Select all'), accelerator: 'CmdOrCtrl+A', click: function() { shell.webContents.send('context-menu-action', { type: 'selectAll' }); } });
  }

  if (params.selectionText) {
    var store = readStorage();
    var searchUrl = store.searchEngine || 'https://startpozi.netlify.app/search.html?q=';
    var searchName = getSearchEngineName(searchUrl);
    template.push({ label: t('Copy selection'), accelerator: 'CmdOrCtrl+C', click: function() { clipboard.writeText(params.selectionText); } });
    template.push({ label: t('Search in') + ' ' + searchName, click: function() {
      shell.webContents.send('open-in-new-tab', searchUrl + encodeURIComponent(params.selectionText));
    }});
  }

  if (template.length > 0 && template[template.length - 1].type === 'separator') {
    template.pop();
  }

  template.push({ type: 'separator' });
  template.push({ label: t('Back'), accelerator: 'Alt+Left', click: function() { shell.webContents.send('context-menu-action', { type: 'goBack' }); } });
  template.push({ label: t('Forward'), accelerator: 'Alt+Right', click: function() { shell.webContents.send('context-menu-action', { type: 'goForward' }); } });
  template.push({ label: t('Reload'), accelerator: 'CmdOrCtrl+R', click: function() { shell.webContents.send('context-menu-action', { type: 'reload' }); } });
  if (!_isInternalMenuPage) {
    template.push({ label: t('Open page in incognito'), click: function() { shell.webContents.send('context-menu-action', { type: 'openIncognitoPage' }); } });
  }
  template.push({ type: 'separator' });

  if (!_isInternalMenuPage) {
    template.push({ label: t('View page source'), click: function() { shell.webContents.send('context-menu-action', { type: 'viewSource' }); } });
    template.push({ label: t('Element inspector'), click: function() { shell.webContents.send('context-menu-action', { type: 'inspectElement', x: params.x, y: params.y }); } });
    template.push({ label: t('Developer tools'), accelerator: 'F12', click: function() { shell.webContents.send('context-menu-action', { type: 'toggleDevTools' }); } });
  }
  template.push({ type: 'separator' });

  template.push({ label: t('Screenshot tool (with annotations)'), click: function() { shell.webContents.send('context-menu-action', { type: 'screenshotTool' }); } });
  template.push({ label: t('OCR: grab text from screen'), click: function() { shell.webContents.send('context-menu-action', { type: 'ocrTool' }); } });
  if (!_isInternalMenuPage) {
    template.push({ label: t('Open site as application'), click: function() { shell.webContents.send('context-menu-action', { type: 'openAsApp' }); } });
  }
  template.push({ label: t('Print...'), accelerator: 'CmdOrCtrl+P', click: function() { shell.webContents.send('context-menu-action', { type: 'print' }); } });

  var zoomSubmenu = [
    { label: t('Zoom in'), accelerator: 'CmdOrCtrl++', click: function() { shell.webContents.send('context-menu-action', { type: 'zoomIn' }); } },
    { label: t('Zoom out'), accelerator: 'CmdOrCtrl+-', click: function() { shell.webContents.send('context-menu-action', { type: 'zoomOut' }); } },
    { label: t('Reset'), accelerator: 'CmdOrCtrl+0', click: function() { shell.webContents.send('context-menu-action', { type: 'zoomReset' }); } },
  ];
  template.push({ label: t('Zoom'), submenu: zoomSubmenu });

  template.push({ type: 'separator' });
  if (!_isInternalMenuPage) {
    template.push({ label: t('Translate page'), click: function() { shell.webContents.send('context-menu-action', { type: 'translate' }); } });
    template.push({ label: t('Page QR code'), click: function() { shell.webContents.send('context-menu-action', { type: 'qrPage' }); } });
  }
  template.push({ type: 'separator' });
  template.push({ label: t('Eyedropper (Color Picker)'), click: function() { shell.webContents.send('context-menu-action', { type: 'colorPicker' }); } });
  template.push({ label: t('Reader mode'), click: function() { shell.webContents.send('context-menu-action', { type: 'readerMode' }); } });
  {
    var _zstore = readStorage();
    var _zenabled = _zstore.elementZapperEnabled !== false;
    if (_zenabled && !_isInternalMenuPage) {
      template.push({ label: t('Hide element (Zapper)'), click: function() { shell.webContents.send('context-menu-action', { type: 'elementZapper' }); } });
    }
  }

  var menu = Menu.buildFromTemplate(template);
  menu.popup({ window: mainWindow });
});

ipcMain.on('context-menu-copy', (_, text) => {
  clipboard.writeText(text);
});

ipcMain.on('context-menu-copy-image', (_, dataUrl) => {
  try {
    var nativeImage = require('electron').nativeImage;
    var img = nativeImage.createFromDataURL(dataUrl);
    if (!img.isEmpty()) {
      clipboard.writeImage(img);
    }
  } catch(e) {}
});

ipcMain.on('context-menu-open-tab', (event, url) => {
  var win = _shellWindowOf(event.sender);
  if (win && !win.isDestroyed()) {
    win.webContents.send('open-in-new-tab', url);
  }
});

ipcMain.handle('read-clipboard', () => {
  return clipboard.readText();
});

// ============== WORKSPACES ==============
ipcMain.handle('get-workspaces', () => {
  const store = readStorage();
  if (!store.workspaces || !store.workspaces.length) {
    return [{ id: 'ws-default', name: 'Default', icon: '🌐', color: '#667eea', createdAt: Date.now() }];
  }
  return store.workspaces;
});

ipcMain.handle('save-workspaces', (_, workspaces) => {
  const store = readStorage();
  store.workspaces = workspaces;
  writeStorage(store);
  return { success: true };
});

ipcMain.handle('get-active-workspace', () => {
  const store = readStorage();
  return store.activeWorkspace || 'ws-default';
});

ipcMain.handle('set-active-workspace', (_, id) => {
  const store = readStorage();
  store.activeWorkspace = id;
  writeStorage(store);
  return { success: true };
});

ipcMain.handle('get-workspace-tabs', (_, workspaceId) => {
  const store = readStorage();
  if (!store.workspaceTabs) store.workspaceTabs = {};
  return store.workspaceTabs[workspaceId] || [];
});

ipcMain.handle('set-workspace-tabs', (_, workspaceId, tabsData) => {
  const store = readStorage();
  if (!store.workspaceTabs) store.workspaceTabs = {};
  store.workspaceTabs[workspaceId] = tabsData;
  writeStorage(store);
  return { success: true };
});

// ============== SITE THEMES ==============
ipcMain.handle('get-site-themes', () => {
  const store = readStorage();
  return store.siteThemes || {};
});

ipcMain.handle('set-site-theme', (_, domain, css) => {
  const store = readStorage();
  if (!store.siteThemes) store.siteThemes = {};
  if (css) {
    store.siteThemes[domain] = css;
  } else {
    delete store.siteThemes[domain];
  }
  writeStorage(store);
  return { success: true };
});

function normalizeMultiSearchEngines(raw) {
  var result = { google: true, duckduckgo: false, bing: false, startpozi: false };
  if (!raw || typeof raw !== 'object') return result;
  Object.keys(raw).forEach(function(key) {
    var val = raw[key];
    if (typeof val === 'boolean') {
      result[key] = val;
    } else if (val && typeof val === 'object' && 'enabled' in val) {
      result[key] = !!val.enabled;
    }
  });
  return result;
}

ipcMain.handle('get-multi-search-engines', () => {
  const store = readStorage();
  return normalizeMultiSearchEngines(store.multiSearchEngines);
});

ipcMain.handle('set-multi-search-engines', (_, engines) => {
  const store = readStorage();
  store.multiSearchEngines = normalizeMultiSearchEngines(engines);
  writeStorage(store);
  return { success: true };
});

ipcMain.handle('get-multi-search-custom-engines', () => {
  const store = readStorage();
  return Array.isArray(store.multiSearchCustomEngines) ? store.multiSearchCustomEngines : [];
});

ipcMain.handle('set-multi-search-custom-engines', (_, engines) => {
  const store = readStorage();
  store.multiSearchCustomEngines = Array.isArray(engines) ? engines : [];
  writeStorage(store);
  return { success: true };
});

ipcMain.handle('add-multi-search-custom-engine', (_, engine) => {
  const store = readStorage();
  if (!Array.isArray(store.multiSearchCustomEngines)) store.multiSearchCustomEngines = [];
  var id = 'custom_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  store.multiSearchCustomEngines.push({ id: id, name: engine.name || '', url: engine.url || '' });
  writeStorage(store);
  return { success: true, id: id };
});

ipcMain.handle('remove-multi-search-custom-engine', (_, engineId) => {
  const store = readStorage();
  if (!Array.isArray(store.multiSearchCustomEngines)) return { success: true };
  store.multiSearchCustomEngines = store.multiSearchCustomEngines.filter(function(e) { return e.id !== engineId; });
  if (store.multiSearchEngines && typeof store.multiSearchEngines === 'object') {
    delete store.multiSearchEngines[engineId];
  }
  writeStorage(store);
  return { success: true };
});

ipcMain.handle('get-privacy-stats', () => {
  const store = readStorage();
  const sec = store.security || {};
  var enabledFeatures = 0;
  var totalFeatures = 13;
  var featureKeys = ['urlClean','sanitizeUrl','webrtcLeak','fingerprint','autoplayBlock','siteIsolation','httpsOnly','referrerPolicy','blockThirdPartyCookies','blockMixedContent','blockNotifications','blockGeolocation','blockWebGL','blockClipboard'];
  featureKeys.forEach(function(k) { if (sec[k]) enabledFeatures++; });

  var cookiesCount = 0;
  try {
    var cookiesDb = path.join(app.getPath('userData'), 'Cookies');
    if (fs.existsSync(cookiesDb)) {
      var stat = fs.statSync(cookiesDb);
      cookiesCount = Math.round(stat.size / 1024);
    }
  } catch(e) {}

  return {
    blockedRequests: store.blockedLog ? store.blockedLog.length : 0,
    cookiesCount: cookiesCount,
    enabledFeatures: enabledFeatures,
    totalFeatures: totalFeatures,
    adblockerEnabled: !!(adblocker && adblocker.isEnabled && adblocker.isEnabled()),
    httpsOnly: !!sec.httpsOnly,
    thirdPartyCookiesBlocked: !!sec.blockThirdPartyCookies,
    fingerprintProtection: !!sec.fingerprint,
    webRTCProtection: !!sec.webrtcLeak,
    sponsorBlockStats: store.sponsorBlockStats || { segments: 0, timeSaved: 0 }
  };
});

// ============== BACKUP ==============
// Zip read/write for backups is built on AdmZip (already a dependency):
//  - safeExtractZip: import side. Replaces the abandoned extract-zip —
//    its latest release 2.0.1 (June 2020) carries GHSA-jmr9-qjv8-65gv
//    (unvalidated symlink path traversal) and no patched version exists.
//  - writeBackupZip: export side. Replaces archiver, which turned ESM-only
//    in v8 and stopped being callable from this CommonJS main process
//    ("archiver is not a function" — silently broke backup export).
function safeExtractZip(zipPath, destDir) {
  if (!AdmZip) throw new Error('adm-zip not available');
  var zip = new AdmZip(zipPath);
  var entries = zip.getEntries();
  var totalSize = 0;
  var MAX_TOTAL = 512 * 1024 * 1024;
  for (var i = 0; i < entries.length; i++) {
    var en = entries[i];
    var name = en.entryName;
    if (!name || name.indexOf('\0') !== -1) throw new Error('Invalid zip entry name');
    if (/^[a-zA-Z]:/.test(name) || name.charAt(0) === '/' || name.charAt(0) === '\\') {
      throw new Error('Absolute path in zip entry: ' + name);
    }
    var parts = name.split(/[\\/]/);
    for (var p = 0; p < parts.length; p++) {
      if (parts[p] === '..') throw new Error('Path traversal in zip entry: ' + name);
    }
    var mode = ((en.attr >>> 0) >>> 16) & 0xF000;
    if (mode === 0xA000) continue; // S_IFLNK — skip symlinks (advisory vector)
    if (en.isDirectory) {
      fs.mkdirSync(path.join.apply(path, [destDir].concat(parts)), { recursive: true });
      continue;
    }
    try { totalSize += (en.header && en.header.size) || 0; } catch(e2) {}
    if (totalSize > MAX_TOTAL) throw new Error('Zip contents too large');
    var target = path.join.apply(path, [destDir].concat(parts));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, en.getData());
  }
}

function writeBackupZip(outPath, manifest, dataBuf) {
  if (!AdmZip) throw new Error('adm-zip not available');
  var zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'));
  zip.addFile('data.bin', dataBuf);
  zip.writeZip(outPath);
}

function _gatherBackupData(includeSecrets) {
  // Always deep-clone: this function mutates the store copy (stripping and
  // surfacing secrets) and must never touch the live settings object.
  const store = JSON.parse(JSON.stringify(readStorage()));
  var data = {};
  data.metadata = {
    version: electronApp.getVersion(),
    date: new Date().toISOString(),
    platform: process.platform
  };
  // The OS-sealed copy is machine-bound (DPAPI/Keychain/libsecret) and is
  // never portable: secrets travel as plaintext `data.passwords` inside the
  // AES-GCM-encrypted archive instead.
  var sealedPlain = null;
  if (store.passwordsSealed) {
    if (includeSecrets) sealedPlain = _unsealNoVault(store.passwordsSealed);
    delete store.passwordsSealed;
  }
  if (!includeSecrets) {
    // Unencrypted destinations must never receive credential material:
    // strip plaintext passwords, the vault and the masterAuth verifier
    // (which would allow offline brute-force of the master password).
    data.metadata.secretsExcluded = true;
    delete store.passwords;
    delete store.passwordVault;
    delete store.masterAuth;
  }
  // Never leak the plaintext store's sensitive auth material into the top
  // level of the backup; the vault travels inside data.settings and is also
  // surfaced under data.passwordVault so the restore UI can pick it up.
  data.settings = store;
  if (store.history) data.history = store.history;
  if (store.scripts) data.scripts = store.scripts;
  if (store.bookmarks) data.bookmarks = store.bookmarks;
  if (includeSecrets) {
    if (sealedPlain) data.passwords = sealedPlain;
    if (store.passwords) data.passwords = store.passwords;
    if (store.passwordVault) data.passwordVault = store.passwordVault;
    if (store.masterAuth) data.masterAuth = store.masterAuth;
  }
  if (store.security) data.security = store.security;
  if (store.siteThemes) data.siteThemes = store.siteThemes;
  if (store.blockedLog) data.blockedLog = store.blockedLog;
  if (store.sponsorBlockStats) data.sponsorblock = store.sponsorBlockStats;
  if (store.customization) data.customization = store.customization;
  if (store.profiles) data.profiles = store.profiles;
  return data;
}

const BACKUP_LEGACY_SALT = 'startpozi-backup-salt';
const BACKUP_MAGIC_V2 = Buffer.from('SPZ2', 'ascii');

function _encryptBuffer(buf, password) {
  var crypto2 = require('crypto');
  // Format v2 (default): 'SPZ2' + salt(16) + iv(12) + tag(16) + ciphertext.
  // AES-256-GCM with a random salt and an integrity tag (CBC had neither
  // authentication nor tamper detection). Old backups stay readable via the
  // fallback paths in _decryptBuffer.
  var salt = crypto2.randomBytes(16);
  var key = crypto2.scryptSync(password, salt, 32);
  var iv = crypto2.randomBytes(12);
  var cipher = crypto2.createCipheriv('aes-256-gcm', key, iv);
  var encrypted = Buffer.concat([cipher.update(buf), cipher.final()]);
  var tag = cipher.getAuthTag();
  return Buffer.concat([BACKUP_MAGIC_V2, salt, iv, tag, encrypted]);
}

function _decryptBuffer(buf, password, manifestSalt) {
  var crypto2 = require('crypto');
  // v2 (GCM): 'SPZ2' + salt(16) + iv(12) + tag(16) + ciphertext.
  if (buf.length > 4 + 16 + 12 + 16 && buf.slice(0, 4).equals(BACKUP_MAGIC_V2)) {
    var salt2 = buf.slice(4, 20);
    var iv2 = buf.slice(20, 32);
    var tag2 = buf.slice(32, 48);
    var data2 = buf.slice(48);
    var key2 = crypto2.scryptSync(password, salt2, 32);
    var decipher2 = crypto2.createDecipheriv('aes-256-gcm', key2, iv2);
    decipher2.setAuthTag(tag2);
    return Buffer.concat([decipher2.update(data2), decipher2.final()]);
  }
  // v1 (CBC): salt(16) + iv(16) + ciphertext, or manifest-provided salt with
  // iv(16) + ciphertext. Old format: iv(16) + ciphertext with a static salt.
  if (manifestSalt) {
    var saltB = Buffer.isBuffer(manifestSalt) ? manifestSalt : Buffer.from(manifestSalt, 'base64');
    var ivB = buf.slice(0, 16);
    var dataB = buf.slice(16);
    var keyB = crypto2.scryptSync(password, saltB, 32);
    var decipherB = crypto2.createDecipheriv('aes-256-cbc', keyB, ivB);
    return Buffer.concat([decipherB.update(dataB), decipherB.final()]);
  }
  if (buf.length >= 32) {
    try {
      var salt = buf.slice(0, 16);
      var iv = buf.slice(16, 32);
      var data = buf.slice(32);
      var key = crypto2.scryptSync(password, salt, 32);
      var decipher = crypto2.createDecipheriv('aes-256-cbc', key, iv);
      return Buffer.concat([decipher.update(data), decipher.final()]);
    } catch(e) {
      // fall through to legacy attempt
    }
  }
  var lkey = crypto2.scryptSync(password, BACKUP_LEGACY_SALT, 32);
  var liv = buf.slice(0, 16);
  var ldata = buf.slice(16);
  var ldecipher = crypto2.createDecipheriv('aes-256-cbc', lkey, liv);
  return Buffer.concat([ldecipher.update(ldata), ldecipher.final()]);
}

ipcMain.handle('backup-export', async (_, usePassword, password) => {
  try {
    var result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export backup',
      defaultPath: 'startpozi-backup-' + new Date().toISOString().slice(0,10) + '.spzi',
      filters: [{ name: 'StartPOZI Backup', extensions: ['spzi'] }]
    });
    if (result.canceled) return { success: false, message: 'Cancelled' };

    var data = _gatherBackupData(!!usePassword);
    var jsonBuf = Buffer.from(JSON.stringify(data, null, 2), 'utf8');

    var tmpDir = path.join(electronApp.getPath('temp'), 'spzi-export-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    var manifest = { encrypted: !!usePassword, version: data.metadata.version, date: data.metadata.date };
    var dataToWrite = usePassword ? _encryptBuffer(jsonBuf, password) : jsonBuf;
    writeBackupZip(result.filePath, manifest, dataToWrite);

    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}

    return {
      success: true, path: result.filePath, size: fs.statSync(result.filePath).size,
      secretsExcluded: !usePassword
    };
  } catch(e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('backup-import', async (_, filePath, password, options) => {
  try {
    var tmpDir = path.join(electronApp.getPath('temp'), 'spzi-import-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    safeExtractZip(filePath, tmpDir);

    var manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'manifest.json'), 'utf8'));
    var dataBuf = fs.readFileSync(path.join(tmpDir, 'data.bin'));

    var jsonStr;
    if (manifest.encrypted) {
      if (!password) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
        return { success: false, needPassword: true };
      }
      try {
        jsonStr = _decryptBuffer(dataBuf, password).toString('utf8');
      } catch(e) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e2) {}
        return { success: false, message: 'Wrong password' };
      }
    } else {
      jsonStr = dataBuf.toString('utf8');
    }

    var data = JSON.parse(jsonStr);
    var store = readStorage();

    if (options.settings) {
      var imported = data.settings || {};
      if (data.security) imported.security = data.security;
      if (data.customization) imported.customization = data.customization;
      Object.assign(store, imported);
    }
    if (options.history && data.history) store.history = data.history;
    if (options.scripts && data.scripts) store.scripts = data.scripts;
    if (options.bookmarks && data.bookmarks) store.bookmarks = data.bookmarks;
    if (options.passwords) {
      // Prefer the encrypted vault when present; fall back to plaintext
      // (re-sealed with the OS backend so nothing lands on disk in clear).
      if (data.passwordVault) {
        store.passwordVault = data.passwordVault;
        if (data.masterAuth) store.masterAuth = data.masterAuth;
        delete store.passwords;
        delete store.passwordsSealed;
        // Imported vault is locked by default until the user unlocks it.
        _vaultKey = null;
      } else if (data.passwords) {
        delete store.passwordVault;
        delete store.masterAuth;
        _vaultKey = null;
        _writePasswords(store, data.passwords);
      }
    }
    if (options.siteThemes && data.siteThemes) store.siteThemes = data.siteThemes;
    if (options.blockedLog && data.blockedLog) store.blockedLog = data.blockedLog;
    if (options.sponsorblock && data.sponsorblock) store.sponsorBlockStats = data.sponsorblock;
    if (options.profiles && data.profiles) store.profiles = data.profiles;

    writeStorage(store);

    if (options.settings && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mainpage-reload-needed');
    }

    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}

    return { success: true, imported: Object.keys(options).filter(function(k) { return options[k]; }) };
  } catch(e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('backup-choose-import', async () => {
  try {
    var result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select backup file',
      filters: [{ name: 'StartPOZI Backup', extensions: ['spzi'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) return { success: false, message: 'Cancelled' };
    return { success: true, path: result.filePaths[0] };
  } catch(e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('backup-check-file', async (_, filePath) => {
  try {
    var tmpDir = path.join(electronApp.getPath('temp'), 'spzi-check-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    safeExtractZip(filePath, tmpDir);
    var manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'manifest.json'), 'utf8'));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
    return { success: true, encrypted: !!manifest.encrypted, version: manifest.version, date: manifest.date };
  } catch(e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('get-backup-settings', () => {
  var store = readStorage();
  return {
    autoBackup: !!store.autoBackup,
    autoBackupPath: store.autoBackupPath || ''
  };
});

ipcMain.handle('set-backup-settings', (_, settings) => {
  var store = readStorage();
  if (settings.autoBackup !== undefined) store.autoBackup = settings.autoBackup;
  if (settings.autoBackupPath !== undefined) store.autoBackupPath = settings.autoBackupPath;
  writeStorage(store);
  return { success: true };
});

ipcMain.handle('backup-auto', async () => {
  try {
    var store = readStorage();
    if (!store.autoBackup) return { success: false };
    var backupDir = store.autoBackupPath || path.join(electronApp.getPath('userData'), 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    var filename = 'auto-backup-' + new Date().toISOString().slice(0,19).replace(/:/g,'-') + '.spzi';
    var filePath = path.join(backupDir, filename);
    // Auto-backups are written unencrypted — never include credentials.
    var data = _gatherBackupData(false);
    var jsonBuf = Buffer.from(JSON.stringify(data), 'utf8');
    var manifest = { encrypted: false, version: data.metadata.version, date: data.metadata.date };
    writeBackupZip(filePath, manifest, jsonBuf);
    var backups = fs.readdirSync(backupDir).filter(function(f) { return f.startsWith('auto-backup-') && f.endsWith('.spzi'); }).sort();
    while (backups.length > 10) {
      try { fs.unlinkSync(path.join(backupDir, backups[0])); } catch(e) {}
      backups.shift();
    }
    return { success: true };
  } catch(e) {
    return { success: false, message: e.message };
  }
});

// ============== PROXY & TOR ==============
var _proxySettings = { enabled: false, type: 'http', host: '', port: '', bridges: '', bypassDomains: [], forceDomains: [] };
var _proxyConfigPath = path.join(app.getPath('userData'), 'proxy.json');

try {
  var _savedProxy = JSON.parse(fs.readFileSync(_proxyConfigPath, 'utf8'));
  if (_savedProxy) _proxySettings = Object.assign(_proxySettings, _savedProxy);
} catch(e) {}

var _torProcess = null;
var _torPort = 9050;
var _torControlPort = 9051;
var _torConfigDir = path.join(app.getPath('userData'), 'tor-data');
var _torCookiePath = path.join(_torConfigDir, 'control_auth_cookie');
var _torBootstrap = 0;        // 0..100, bootstrap progress
var _torLastNewnym = 0;       // timestamp of last NEWNYM (Tor throttle 10s)
var _torLastBridges = null;   // last bridge set startTor was called with — used to detect changes

// Current proxy-URL (single source of truth for all sessions)
function _proxyUrl() {
  if (!_proxySettings.enabled) return null;
  if (!_proxySettings.host) return null;
  var ptype = _proxySettings.type === 'tor' ? 'socks5' : _proxySettings.type;
  var url = ptype + '://' + _proxySettings.host;
  if (_proxySettings.port) url += ':' + _proxySettings.port;
  return url;
}

// Proxy URL regardless of the "enabled" flag (used for the force-list when proxy is off)
function _proxyUrlForced() {
  if (!_proxySettings.host) return null;
  var ptype = _proxySettings.type === 'tor' ? 'socks5' : _proxySettings.type;
  var url = ptype + '://' + _proxySettings.host;
  if (_proxySettings.port) url += ':' + _proxySettings.port;
  return url;
}

// Convert proxy settings to a PAC "PROXY/SOCKS" string
function _pacProxyStr(s) {
  if (!s || !s.host) return 'DIRECT';
  var addr = s.port ? (s.host + ':' + s.port) : s.host;
  var ptype = (s.type === 'tor') ? 'socks5' : s.type;
  if (ptype === 'socks5') return 'SOCKS5 ' + addr;
  if (ptype === 'socks4') return 'SOCKS4 ' + addr;
  return 'PROXY ' + addr; // http / https
}

// Build a PAC script. bypassDomains always win (DIRECT), forceDomains go through proxy.
function _buildPacScript(s, forceDomains, bypassDomains, defaultProxy) {
  var pacProxy = _pacProxyStr(s);
  var lines = ['function FindProxyForURL(url, host) {'];
  function addChecks(domains, action) {
    (domains || []).forEach(function (d) {
      var clean = String(d).trim().replace(/["'\\\n]/g, '');
      if (!clean) return;
      if (clean.indexOf('*') >= 0) {
        lines.push('  if (shExpMatch(host, "' + clean + '")) return "' + action + '";');
      } else {
        // exact domain + all subdomains
        lines.push('  if (host == "' + clean + '" || shExpMatch(host, "*.' + clean + '")) return "' + action + '";');
      }
    });
  }
  addChecks(bypassDomains, 'DIRECT');   // bypass wins
  addChecks(forceDomains, pacProxy);    // force uses proxy
  lines.push('  return "' + (defaultProxy ? pacProxy : 'DIRECT') + '";');
  lines.push('}');
  return lines.join('\n');
}

function _normalizeDomainList(v) {
  if (Array.isArray(v)) return v.map(function (d) { return String(d).trim(); }).filter(Boolean);
  if (typeof v === 'string') return v.split('\n').map(function (d) { return d.trim(); }).filter(Boolean);
  return [];
}

// Applies the proxy to ONE session — supports bypass + force lists
function _applyProxyToSessionObj(ses) {
  if (!ses) return Promise.resolve();
  var bypass = _normalizeDomainList(_proxySettings.bypassDomains);
  var force = _normalizeDomainList(_proxySettings.forceDomains);
  var enabled = _proxySettings.enabled && _proxySettings.host;
  var cfg;

  if (_proxyLiveFallback) {
    // Watchdog: the configured proxy is dead — keep the user online via a
    // direct connection until it responds again (recovery re-applies).
    cfg = { mode: 'direct' };
  } else if (enabled) {
    // Proxy ON → everything proxied, bypass list exempted
    var rules = { proxyRules: _proxyUrl() };
    if (bypass.length > 0) rules.proxyBypassRules = bypass.join(';');
    cfg = rules;
  } else if (force.length > 0 && _proxySettings.host) {
    // Proxy OFF but force-list exists → only these domains go through proxy
    cfg = { pacScript: _buildPacScript(_proxySettings, force, bypass, false) };
  } else {
    cfg = { mode: 'direct' };
  }

  return ses.setProxy(cfg).then(function () {
    try { ses.closeAllConnections(); } catch (e) {}
  }).catch(function () {});
}

// Applies the proxy to ALL sessions: default + main window + all webviews + incognito.
async function applyProxyToSession() {
  var promises = [];
  try { promises.push(_applyProxyToSessionObj(session.defaultSession)); } catch(e) {}
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { promises.push(_applyProxyToSessionObj(mainWindow.webContents.session)); } catch(e) {}
  }
  try {
    var { webContents: _wc } = require('electron');
    _wc.getAllWebContents().forEach(function(wc) {
      try { promises.push(_applyProxyToSessionObj(wc.session)); } catch(e) {}
    });
  } catch(e) {}
  await Promise.all(promises);
}

// Called from web-contents-created for EVERY new webview — applies
// the current proxy settings, so incognito/new tabs also go through Tor.
function _ensureProxyOnSession(ses) {
  if (!ses) return;
  // Apply whenever there's something to apply: enabled proxy OR a force-list
  var force = _normalizeDomainList(_proxySettings.forceDomains);
  if (!_proxyUrl() && !(force.length > 0 && _proxySettings.host)) return;
  _applyProxyToSessionObj(ses);
}

// Tor + pluggable transports installation hint
function _torNotFoundMessage() {
  if (process.platform === 'win32') {
    return 'Tor not found. Download the Expert Bundle from torproject.org/download/ and add tor.exe to PATH. For obfs4 bridges you need obfs4proxy.exe.';
  }
  if (process.platform === 'darwin') {
    return 'Tor not found. Install: brew install tor (for bridges: brew install obfs4proxy).';
  }
  return 'Tor not found. Install: sudo apt install tor obfs4proxy (Debian/Ubuntu). For snowflake: see torproject.org.';
}

function _makeTorrc(bridges) {
  var lines = [
    'SocksPort ' + _torPort,
    'ControlPort ' + _torControlPort,
    'CookieAuthentication 1',
    'CookieAuthFile ' + _torCookiePath,
    'CookieAuthFileGroupReadable 1',
    'DataDirectory ' + _torConfigDir,
    'AvoidDiskWrites 1',
    'Log notice stdout'
  ];
  if (bridges) {
    lines.push('UseBridges 1');
    var hasObfs4 = false;
    var hasSnowflake = false;
    var hasWebtunnel = false;
    bridges.split('\n').forEach(function(b) {
      var line = b.trim().replace(/^Bridge\s+/i, '');
      if (!line) return;
      lines.push('Bridge ' + line);
      if (line.indexOf('obfs4') === 0) hasObfs4 = true;
      if (line.indexOf('snowflake') === 0) hasSnowflake = true;
      if (line.indexOf('webtunnel') === 0) hasWebtunnel = true;
    });
    // Pluggable transports — binaries must be in PATH
    if (hasObfs4) lines.unshift('ClientTransportPlugin obfs4 exec obfs4proxy');
    if (hasSnowflake) lines.unshift('ClientTransportPlugin snowflake exec snowflake-client');
    if (hasWebtunnel) lines.unshift('ClientTransportPlugin webtunnel exec webtunnel-client');
  }
  return lines.join('\n') + '\n';
}

function _broadcastTorProgress(pct) {
  _torBootstrap = pct;
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send('tor-bootstrap', pct); } catch(e) {}
  }
}

function startTor(bridges) {
  return new Promise(function(resolve, reject) {
    // If Tor is already running with the SAME bridge set, return immediately.
    // If the bridge set CHANGED we must stop the old process first so the
    // new bridges are actually picked up — otherwise the user could never
    // switch bridges without quitting the browser.
    if (_torProcess) {
      if (_torLastBridges === bridges) {
        resolve({ running: true, bootstrap: _torBootstrap });
        return;
      }
      // Bridges differ — kill the old tor. Wait for the 'exit' event (or a
      // short timeout) BEFORE spawning the new one, otherwise the new tor
      // fails with "Could not bind" because the SOCKS port is still held by
      // the dying process.
      var oldProc = _torProcess;
      _torProcess = null;
      _torBootstrap = 0;
      try { oldProc.kill(); } catch(e) {}
      var respawnStart = Date.now();
      var onOldExit = function() {
        var elapsed = Date.now() - respawnStart;
        // Small grace period so the OS actually releases the port.
        var wait = elapsed < 400 ? (400 - elapsed) : 0;
        setTimeout(function() { _doStartTor(bridges, resolve, reject); }, wait);
      };
      if (oldProc.exitCode !== null || oldProc.signalCode !== null) {
        // Already exited.
        onOldExit();
      } else {
        oldProc.once('exit', onOldExit);
        // Fallback — if tor ignores SIGTERM, force after 1.5s.
        setTimeout(function() {
          try { oldProc.kill('SIGKILL'); } catch(e) {}
        }, 1500);
        // Last-resort — start anyway after 2s even if exit never fires.
        setTimeout(function() {
          if (!_torProcess) _doStartTor(bridges, resolve, reject);
        }, 2200);
      }
      return;
    }
    _doStartTor(bridges, resolve, reject);
  });
}

// Actual spawn — split out so the bridge-change path can re-enter after kill.
function _doStartTor(bridges, resolve, reject) {
  if (_torProcess) { resolve({ running: true, bootstrap: _torBootstrap }); return; }
  _torLastBridges = bridges;
  try { fs.mkdirSync(_torConfigDir, { recursive: true }); } catch(e) {}
  var torrc = _makeTorrc(bridges);
  var torrcPath = path.join(_torConfigDir, 'torrc');
  fs.writeFileSync(torrcPath, torrc);

  var torBin = process.platform === 'win32' ? 'tor.exe' : 'tor';
  var { spawn } = require('child_process');
  try {
    _torProcess = spawn(torBin, ['-f', torrcPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false
    });
  } catch(e) {
    reject(new Error('Failed to start Tor: ' + e.message));
    return;
  }

  var started = false;
  _torBootstrap = 0;
  var usesBridges = !!bridges;
  // Bridged connections can take 1-2 minutes; give them more room.
  var timeoutMs = usesBridges ? 120000 : 30000;

  _torProcess.stdout.on('data', function(data) {
    var msg = data.toString();
    var m = msg.match(/Bootstrapped (\d+)%/);
    if (m) _broadcastTorProgress(parseInt(m[1], 10));

    if (_torBootstrap >= 100 && !started) {
      started = true;
      resolve({ running: true, bootstrap: 100 });
    }
    if (!started && msg.indexOf('Bootstrapped 100%') >= 0) {
      started = true;
      _broadcastTorProgress(100);
      resolve({ running: true, bootstrap: 100 });
    }
  });
  _torProcess.stderr.on('data', function(data) {
    var msg = data.toString();
    if (!started && msg.indexOf('Could not bind') >= 0) {
      started = true;
      reject(new Error('Port ' + _torPort + ' is busy. Stop the current Tor first or wait a few seconds.'));
    }
    if (!started && msg.indexOf('Error') >= 0 && msg.indexOf('obfs4proxy') >= 0) {
      started = true;
      reject(new Error('obfs4proxy not found. Install: sudo apt install obfs4proxy (Linux) / brew install obfs4proxy (macOS).'));
    }
    // Surface bridge / transport / connection errors so the user has a clue.
    if (!started && /\[err\]|\[warn\]/i.test(msg) && /bridge|transport|connection refused|timed out|unable to connect/i.test(msg)) {
      console.log('[tor]', msg.trim());
    }
  });
  _torProcess.on('error', function() {
    _torProcess = null;
    if (!started) { started = true; reject(new Error(_torNotFoundMessage())); }
  });
  _torProcess.on('exit', function() {
    _torProcess = null;
    _torBootstrap = 0;
  });
  setTimeout(function() {
    if (!started) {
      started = true;
      resolve({ running: !!_torProcess, bootstrap: _torBootstrap, timeout: true });
    }
  }, timeoutMs);
}

function stopTor() {
  if (_torProcess) {
    try { _torProcess.kill(); } catch(e) {}
    _torProcess = null;
    _torBootstrap = 0;
  }
  // Forget the previous bridge set so the next Start actually respawns tor
  // instead of returning the cached "already running" state.
  _torLastBridges = null;
}

// Identity change (NEWNYM) via the control port — new Tor circuits, new IP.
function torNewIdentity() {
  return new Promise(function(resolve) {
    if (!_torProcess) { resolve({ success: false, message: 'Tor not running' }); return; }
    // Throttle: Tor accepts NEWNYM no more than once every 10 seconds
    var now = Date.now();
    if (now - _torLastNewnym < 10000) {
      var wait = Math.ceil((10000 - (now - _torLastNewnym)) / 1000);
      resolve({ success: false, message: 'Wait ' + wait + ' sec. before changing identity' });
      return;
    }
    var cookie = '';
    try { cookie = fs.readFileSync(_torCookiePath).toString('hex'); } catch(e) {
      resolve({ success: false, message: 'Tor cookie not found. Restart Tor.' });
      return;
    }
    var net = require('net');
    var sock = net.connect(_torControlPort, '127.0.0.1');
    var done = false;
    var step = 0;
    sock.on('data', function(data) {
      var text = data.toString();
      if (step === 0) {
        // Server greeting — send AUTHENTICATE
        sock.write('AUTHENTICATE ' + cookie + '\r\n');
        step = 1;
      } else if (step === 1) {
        if (text.indexOf('250') === 0) {
          sock.write('SIGNAL NEWNYM\r\n');
          step = 2;
        } else {
          if (!done) { done = true; resolve({ success: false, message: 'Auth failed: ' + text.trim() }); }
          try { sock.destroy(); } catch(e) {}
        }
      } else if (step === 2) {
        if (!done) {
          done = true;
          if (text.indexOf('250') === 0) {
            _torLastNewnym = now;
            resolve({ success: true, message: 'New identity received' });
          } else {
            resolve({ success: false, message: 'NEWNYM rejected: ' + text.trim() });
          }
        }
        try { sock.destroy(); } catch(e) {}
      }
    });
    sock.on('error', function() {
      if (!done) { done = true; resolve({ success: false, message: 'Control port unavailable (port ' + _torControlPort + ')' }); }
    });
    setTimeout(function() {
      if (!done) { done = true; resolve({ success: false, message: 'Control port timeout' }); try { sock.destroy(); } catch(e) {} }
    }, 5000);
  });
}

// =============================================================================
// TOR AUTO-DETECTION
// =============================================================================
// Idea: at start (if proxy is NOT manually configured) we look for Tor in the system via
// `which tor` / `where tor.exe` (Linux/macOS/Windows). If the binary exists —
// we scan typical SOCKS ports (9050 — system `tor`, 9150 — Tor Browser
// Bundle, + custom 9060-9080). If the port responds — we automatically
// configure the SOCKS5 proxy and apply it to all sessions.
var _torDetectedInfo = null;  // { binary, port, host } or null

// Run a command asynchronously (no shell) and return its stdout, or null on failure.
function _execFileText(cmd, args, timeoutMs) {
  var execFile = require('child_process').execFile;
  return new Promise(function(resolve) {
    try {
      execFile(cmd, args, { encoding: 'utf8', timeout: timeoutMs || 2000, windowsHide: true, stdio: ['ignore','pipe','ignore'] }, function(err, stdout) {
        resolve(err ? null : stdout);
      });
    } catch(e) { resolve(null); }
  });
}

// Run a command asynchronously (no shell), resolve to true on exit code 0.
function _execFileOk(cmd, args, timeoutMs) {
  var execFile = require('child_process').execFile;
  return new Promise(function(resolve) {
    try {
      execFile(cmd, args, { timeout: timeoutMs || 5000, windowsHide: true, stdio: 'ignore' }, function(err) {
        resolve(!err);
      });
    } catch(e) { resolve(false); }
  });
}

// Search for the tor binary path via which/where (async, non-blocking).
// Returns path (string) or null.
async function _findTorBinary() {
  if (process.platform === 'win32') {
    var w = await _execFileText('where', ['tor.exe'], 2000);
    return (w && w.split(/\r?\n/)[0].trim()) || null;
  }
  var p = await _execFileText('which', ['tor'], 2000);
  return (p && p.trim()) || null;
}

// Check if something is listening on 127.0.0.1:port. Timeout 250ms.
function _probePort(host, port) {
  return new Promise(function(resolve) {
    var net = require('net');
    var sock = net.connect({ host: host, port: port, timeout: 250 });
    var done = false;
    function finish(ok) {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch(e) {}
      resolve(ok);
    }
    sock.on('connect', function() { finish(true); });
    sock.on('error', function() { finish(false); });
    sock.on('timeout', function() { finish(false); });
    // A proxy that accepts TCP and then silently drops the connection must
    // also count as DEAD — without this handler the probe promise NEVER
    // resolves (accept+close is exactly how a dying VPN/firewall behaves).
    sock.on('close', function() { finish(false); });
  });
}

// Check that the port returns a SOCKS5 greeting (not just listening).
// Send SOCKS5 greeting: VER=5, NMETHODS=1, METHODS=[0x00=no-auth].
// Expect response VER=5, METHOD=0x00.
function _probeSocks5(host, port) {
  return new Promise(function(resolve) {
    var net = require('net');
    var sock = net.connect({ host: host, port: port, timeout: 600 });
    var done = false;
    function finish(ok) {
      if (done) return;
      done = true;
      try { sock.destroy(); } catch(e) {}
      resolve(ok);
    }
    sock.on('connect', function() {
      try { sock.write(Buffer.from([0x05, 0x01, 0x00])); } catch(e) { finish(false); }
    });
    sock.on('data', function(buf) {
      // SOCKS5 no-auth: 05 00
      if (buf && buf.length >= 2 && buf[0] === 0x05 && (buf[1] === 0x00 || buf[1] === 0x02)) {
        finish(true);
      } else {
        finish(false);
      }
    });
    sock.on('error', function() { finish(false); });
    sock.on('timeout', function() { finish(false); });
    sock.on('close', function() { finish(false); });
  });
}

// Full auto-detect: find binary + scan ports + read torrc for bridges.
// Returns { binary, host, port, bridges, transports } or null.
async function _detectTorAuto() {
  var binary = await _findTorBinary();
  var host = '127.0.0.1';
  // 1) Standard Tor SOCKS ports in order of usage frequency
  var stdPorts = [9050, 9150, 9060, 9070, 9080, 9100, 9150, 39050, 39060];
  // 2) All listening local ports via ss/netstat
  var systemPorts = await _getLocalListeningPorts();
  var allPorts = stdPorts.concat(systemPorts.filter(function(p) { return stdPorts.indexOf(p) === -1; }));
  var foundPort = null;
  for (var i = 0; i < allPorts.length; i++) {
    var port = allPorts[i];
    var alive = await _probePort(host, port);
    if (!alive) continue;
    var isSocks5 = await _probeSocks5(host, port);
    if (isSocks5) { foundPort = port; break; }
  }
  // Read torrc — even if SOCKS does not respond, bridges may be useful
  var torrcInfo = await _readBridgesFromTorrc();
  var transports = await _detectPluggableTransports();
  if (foundPort) {
    return {
      binary: binary,
      host: host,
      port: foundPort,
      bridges: torrcInfo.bridges,
      useBridges: torrcInfo.useBridges,
      transports: transports,
      torrcPathsChecked: torrcInfo.pathsChecked
    };
  }
  if (binary || torrcInfo.bridges.length > 0) {
    return {
      binary: binary,
      host: null,
      port: null,
      bridges: torrcInfo.bridges,
      useBridges: torrcInfo.useBridges,
      transports: transports,
      torrcPathsChecked: torrcInfo.pathsChecked
    };
  }
  return { torrcPathsChecked: torrcInfo.pathsChecked, transports: transports };
}

// List of ports listening on 127.0.0.1/localhost, via system utilities.
// Linux: ss. macOS/BSD: netstat. Windows: netstat. Returns array of numbers.
async function _getLocalListeningPorts() {
  var out = [];
  function tryParse(text) {
    if (!text) return;
    var re = /(?:127\.0\.0\.1|localhost|\[?::1\]?):(\d{2,5})/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      var p = parseInt(m[1], 10);
      if (p > 0 && p < 65536 && out.indexOf(p) === -1) out.push(p);
    }
  }
  function listenOnly(text) {
    if (!text) return '';
    return text.split('\n').filter(function(l) { return /LISTEN/i.test(l); }).join('\n');
  }
  // Linux: ss
  if (process.platform !== 'win32') {
    var ssOut = await _execFileText('ss', ['-tlnH'], 1500);
    if (ssOut) tryParse(ssOut);
    // macOS / fallback netstat
    if (out.length === 0) {
      var nsOut = await _execFileText('netstat', ['-an', '-p', 'tcp'], 1500);
      if (nsOut) tryParse(listenOnly(nsOut));
    }
  } else {
    // Windows
    var wOut = await _execFileText('netstat', ['-an', '-p', 'tcp'], 1500);
    if (wOut) tryParse(listenOnly(wOut));
  }
  return out;
}

// Reads the user's torrc and extracts already configured bridges.
// Returns { bridges: string[], useBridges: bool, pathsChecked: string[] }.
async function _readBridgesFromTorrc() {
  var home = process.env.HOME || process.env.USERPROFILE || '/root';
  var paths = [];
  if (process.platform === 'win32') {
    paths.push(path.join(process.env.APPDATA || '', 'Tor', 'torrc'));
    paths.push(path.join(process.env.LOCALAPPDATA || '', 'Tor', 'torrc'));
    paths.push(path.join(home, 'Desktop', 'Tor Browser', 'Browser', 'TorBrowser', 'Data', 'Tor', 'torrc'));
  } else if (process.platform === 'darwin') {
    paths.push('/usr/local/etc/tor/torrc');
    paths.push('/opt/homebrew/etc/tor/torrc');
    paths.push('/etc/tor/torrc');
    paths.push(path.join(home, '.torrc'));
    paths.push(path.join(home, 'Library', 'Application Support', 'Tor', 'torrc'));
    paths.push(path.join(home, 'Library', 'Application Support', 'TorBrowser-Data', 'Tor', 'torrc'));
    // TBB
    paths.push(path.join(home, 'Desktop', 'Tor Browser', 'Browser', 'TorBrowser', 'Data', 'Tor', 'torrc'));
    paths.push(path.join(home, 'TorBrowser', 'Browser', 'TorBrowser', 'Data', 'Tor', 'torrc'));
  } else {
    // Linux
    paths.push('/etc/tor/torrc');
    paths.push('/usr/local/etc/tor/torrc');
    paths.push(path.join(home, '.torrc'));
    paths.push(path.join(home, '.config', 'tor', 'torrc'));
    paths.push(path.join(home, '.local', 'share', 'tor', 'torrc'));
    paths.push(path.join(home, 'tor-browser_*/Browser/TorBrowser/Data/Tor/torrc'));
    paths.push(path.join(home, '.local/share/torbrowser/Tor/torrc'));
  }

  // Also add the torrc-path from the running tor process (tor -f /path)
  try {
    var pgrepOut = (await _execFileText('pgrep', ['-a', 'tor'], 1500)) || '';
    if (!pgrepOut) {
      var psOut = await _execFileText('ps', ['aux'], 1500);
      if (psOut) pgrepOut = psOut.split('\n').filter(function(l) { return /[t]or /.test(l); }).join('\n');
    }
    for (var mm = /-f\s+(\S+)/g, m2; (m2 = mm.exec(pgrepOut)) !== null;) {
      if (paths.indexOf(m2[1]) === -1) paths.push(m2[1]);
    }
  } catch(e) {}

  // And the state file in DataDirectory (also contains Bridge lines)
  var statePaths = [];
  if (process.platform === 'win32') {
    statePaths.push(path.join(process.env.APPDATA || '', 'Tor', 'state'));
  } else if (process.platform === 'darwin') {
    statePaths.push(path.join(home, 'Library', 'Application Support', 'Tor', 'state'));
    statePaths.push(path.join(home, 'Library', 'Application Support', 'TorBrowser-Data', 'Tor', 'state'));
  } else {
    statePaths.push('/var/lib/tor/state');
    statePaths.push(path.join(home, '.local/share/tor/state'));
    statePaths.push(path.join(home, '.tor/state'));
  }

  var bridges = [];
  var useBridges = false;
  var pathsChecked = [];

  function parseText(text) {
    if (!text) return;
    text.split(/\r?\n/).forEach(function(line) {
      var t = line.trim();
      if (/^UseBridges\s+1/i.test(t)) useBridges = true;
      // Bridge <transport> <addr:port> ...
      var m = t.match(/^Bridge\s+(.+)$/i);
      if (m) {
        var b = m[1].trim();
        // Remove quotes if any
        if (b.charAt(0) === '"' && b.charAt(b.length - 1) === '"') b = b.slice(1, -1);
        if (b && bridges.indexOf(b) === -1) bridges.push(b);
        return;
      }
      // Just "obfs4/snowflake/..." at the start of the line (without the Bridge prefix)
      if (/^(obfs4|snowflake|webtunnel|meek|vanilla)\s+\S+\.\S+/.test(t) && bridges.indexOf(t) === -1) {
        bridges.push(t);
      }
    });
  }

  async function tryRead(p) {
    pathsChecked.push(p);
    try {
      if (p.indexOf('*') !== -1) {
        // Glob path — expand manually via sh (for TBB tor-browser_*)
        var ls = await _execFileText('/bin/sh', ['-c', 'ls -1 ' + p.replace(/\s/g, '\\ ') + ' 2>/dev/null'], 1500);
        if (ls) {
          var lines = ls.split(/\r?\n/);
          for (var li = 0; li < lines.length; li++) {
            var rp = lines[li].trim();
            if (!rp) continue;
            try {
              if (fs.existsSync(rp)) parseText(fs.readFileSync(rp, 'utf8'));
            } catch(e) {}
          }
        }
        return;
      }
      if (!fs.existsSync(p)) return;
      parseText(fs.readFileSync(p, 'utf8'));
    } catch(e) {}
  }

  for (var pi = 0; pi < paths.length; pi++) await tryRead(paths[pi]);
  for (var si = 0; si < statePaths.length; si++) await tryRead(statePaths[si]);

  return { bridges: bridges, useBridges: useBridges, pathsChecked: pathsChecked };
}

// Built-in Snowflake bridges preset (static, do not require CAPTCHA).
// Tor Browser ships with the same ones — they work as long as the
// Tor Project infrastructure works. To work you need the snowflake-client binary
// in PATH (Linux/macOS) or in the same folder as tor (Tor Browser Bundle).
function _snowflakeBridgesPreset() {
  return [
    'snowflake 192.0.2.3:80 2B280B23E1107BB62ABFC40DDCC8824814F80A72 fingerprint=2B280B23E1107BB62ABFC40DDCC8824814F80A72 url=https://1098762253.rsc.cdn77.org/ fronts=www.cdn77.org,ajax.aspnetcdn.com ice=stun:stun.l.google.com:19302,stun:stun.antisip.com:3478,stun:stun.bluesip.net:3478,stun:stun.dus.net:3478,stun:stun.epygi.com:3478,stun:stun.sonetel.com:3478,stun:stun.theadventurers.eu:3478,stun:stun.voipgate.com:3478,stun:stun.voys.nl:3478 utls-imitate=hellorandomizedalpn',
    'snowflake 192.0.2.4:80 8838024498816A039FCBBAB14E6F40A0843051FA fingerprint=8838024498816A039FCBBAB14E6F40A0843051FA url=https://1098762253.rsc.cdn77.org/ fronts=www.cdn77.org,ajax.aspnetcdn.com ice=stun:stun.l.google.com:19302,stun:stun.antisip.com:3478,stun:stun.bluesip.net:3478,stun:stun.dus.net:3478,stun:stun.epygi.com:3478,stun:stun.sonetel.com:3478,stun:stun.theadventurers.eu:3478,stun:stun.voipgate.com:3478,stun:stun.voys.nl:3478 utls-imitate=hellorandomizedalpn'
  ];
}

// Check whether obfs4proxy / snowflake-client is installed
async function _detectPluggableTransports() {
  var found = {};
  async function tryWhich(name) {
    var cmd = process.platform === 'win32' ? 'where' : 'which';
    var args = process.platform === 'win32' ? [name + '.exe'] : [name];
    var p = await _execFileText(cmd, args, 1000);
    return (p && p.trim()) || null;
  }
  found.obfs4 = await tryWhich('obfs4proxy');
  found.snowflake = await tryWhich('snowflake-client');
  return found;
}

// Apply auto-detected Tor: save to proxy.json + apply to sessions.
// Returns true if the proxy was applied.
async function _autoApplyTorIfNeeded() {
  // DETECTION ONLY — never auto-hijack traffic. A system Tor that is running
  // but cannot build circuits (censored network, no bridges) used to get all
  // browser traffic routed into it automatically, black-holing every request
  // "while Tor works". The user enables the proxy explicitly; detection only
  // feeds the Settings UI (_torDetectedInfo / "Auto-detect" button).
  if (_proxySettings && _proxySettings.enabled && _proxySettings.host) return false;
  try {
    var info = await _detectTorAuto();
    if (!info) { _torDetectedInfo = null; return false; }
    _torDetectedInfo = info;
  } catch(e) {}
  return false;
}

// IPC for manual launch from Settings ("Auto-detect" button)
ipcMain.handle('detect-tor', async function() {
  try {
    var info = await _detectTorAuto();
    return { success: true, info: info };
  } catch(e) {
    return { success: false, error: e && e.message };
  }
});

// IPC: return Snowflake bridges preset (static, built-in).
ipcMain.handle('get-snowflake-preset', async function() {
  return { success: true, bridges: _snowflakeBridgesPreset() };
});

// IPC: call when the user opens a .onion site.
// Returns { applied: bool, info, needsRestart: bool, reason: string }.
// host-resolver-rules (MAP * ~NOTFOUND) can only be set at process start.
// If it wasn't set (Tor wasn't running at startup), .onion won't work without restart.
ipcMain.handle('ensure-tor-for-onion', async function() {
  try {
    var hasDnsFlag = app.commandLine.hasSwitch('host-resolver-rules');
    // Proxy already enabled and working?
    if (_proxySettings && _proxySettings.enabled && _proxySettings.host) {
      // If host-resolver-rules is set → .onion works. If not → need restart.
      return { applied: false, needsRestart: !hasDnsFlag, reason: 'Proxy already configured' };
    }
    // Did the user explicitly disable the proxy?
    if (_proxySettings && _proxySettings.enabled === false &&
        _proxySettings.host !== undefined) {
      return { applied: false, needsRestart: false, reason: 'Proxy disabled by user' };
    }
    // Proxy not configured — look for Tor
    var info = await _detectTorAuto();
    if (!info) {
      return { applied: false, needsRestart: false, reason: 'Tor not found (neither binary, nor SOCKS port). Install tor or start it.' };
    }
    _torDetectedInfo = info;
    if (!info.host || !info.port) {
      return {
        applied: false,
        needsRestart: false,
        reason: 'Tor binary found at ' + info.binary + ', but SOCKS does not respond. Start tor (service or manually).'
      };
    }
    // Save and apply
    var newSettings = {
      enabled: true,
      type: 'socks5',
      host: info.host,
      port: String(info.port),
      bridges: ''
    };
    _proxySettings = newSettings;
    try { fs.writeFileSync(_proxyConfigPath, JSON.stringify(_proxySettings)); } catch(e) {}
    await applyProxyToSession();
    // The *.onion host-resolver-rules was set at startup — no restart needed.
    return {
      applied: true,
      needsRestart: false,
      info: info,
      reason: 'Tor found at ' + info.host + ':' + info.port + '. Proxy applied.'
    };
  } catch(e) {
    return { applied: false, needsRestart: false, reason: 'Error: ' + (e && e.message || e) };
  }
});

// Check: does traffic really go through Tor (via the Tor check API)
function checkTor() {
  return new Promise(function(resolve) {
    var http = require('http');
    var opts = {
      host: '127.0.0.1',
      port: _torPort,
      method: 'CONNECT',
      path: 'check.torproject.org:443',
      timeout: 8000
    };
    var req = http.request(opts);
    req.on('connect', function() {
      resolve({ running: true, reachable: true, bootstrap: _torBootstrap });
      req.destroy();
    });
    req.on('error', function() {
      resolve({ running: !!_torProcess, reachable: false, bootstrap: _torBootstrap });
    });
    req.on('timeout', function() {
      resolve({ running: !!_torProcess, reachable: false, bootstrap: _torBootstrap });
      req.destroy();
    });
    req.end();
  });
}

if (_proxySettings.enabled) {
  app.whenReady().then(function() {
    setTimeout(applyProxyToSession, 1000);
  });
}

// Tor auto-start: if the user enabled "Use Tor by default with auto-start",
// launch the built-in Tor and apply the SOCKS5 proxy on boot.
(function () {
  var _wantTorAutostart = false;
  try { _wantTorAutostart = !!readStorage().torAutoStart; } catch(e) {}
  if (_wantTorAutostart) {
    app.whenReady().then(function () {
      setTimeout(function () {
        // Set the proxy type to Tor SOCKS5 and apply, then start the binary.
        _proxySettings.enabled = true;
        _proxySettings.type = 'tor';
        if (!_proxySettings.host) _proxySettings.host = '127.0.0.1';
        if (!_proxySettings.port) _proxySettings.port = '9050';
        try { fs.writeFileSync(_proxyConfigPath, JSON.stringify(_proxySettings)); } catch(e) {}
        applyProxyToSession();
        startTor(_proxySettings.bridges || '').then(function (r) {
          if (r && r.running) {
            try { mainWindow.webContents.send('tor-bootstrap', r.bootstrap || 0); } catch(e) {}
          }
        }).catch(function() {});
      }, 1500);
    });
  }
})();

app.on('before-quit', function() {
  stopTor();
  try {
    var s = readStorage();
    if (s.autoBackup) {
      // Unencrypted auto-backup on quit — credentials are never included.
      var data = _gatherBackupData(false);
      var backupDir = s.autoBackupPath || path.join(electronApp.getPath('userData'), 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      var fn = 'auto-backup-' + new Date().toISOString().slice(0,19).replace(/:/g,'-') + '.spzi';
      var fp = path.join(backupDir, fn);
      var jsonBuf = Buffer.from(JSON.stringify(data), 'utf8');
      var tmp = path.join(electronApp.getPath('temp'), 'spzi-autoquit-' + Date.now());
      fs.mkdirSync(tmp, { recursive: true });
      fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify({ encrypted: false, version: data.metadata.version, date: data.metadata.date }));
      fs.writeFileSync(path.join(tmp, 'data.bin'), jsonBuf);
      var AdmZip;
      try { AdmZip = require('adm-zip'); } catch(e) {}
      if (AdmZip) {
        var zip = new AdmZip();
        zip.addLocalFolder(tmp);
        zip.writeZip(fp);
      } else {
        fs.writeFileSync(fp, jsonBuf);
      }
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch(e) {}
      var backups = fs.readdirSync(backupDir).filter(function(f) { return f.startsWith('auto-backup-') && f.endsWith('.spzi'); }).sort();
      while (backups.length > 10) {
        try { fs.unlinkSync(path.join(backupDir, backups[0])); } catch(e) {}
        backups.shift();
      }
    }
  } catch(e) {}
});

ipcMain.handle('get-proxy-settings', function() {
  return _proxySettings;
});

function _sanitizeProxyHost(h) {
  // The host is embedded into proxyRules and into a generated PAC script —
  // strip everything that could break out of the PAC string literal.
  return String(h || '').trim().replace(/[^A-Za-z0-9.\[\]:_-]/g, '');
}
function _sanitizeProxyPort(p) {
  var s = String(p || '').trim().replace(/[^0-9]/g, '');
  return s.length > 0 ? String(parseInt(s, 10)) : '';
}

ipcMain.handle('set-proxy-settings', function(_, settings) {
  _proxySettings = {
    enabled: !!settings.enabled,
    type: ['http','https','socks4','socks5','tor'].indexOf(settings.type) !== -1 ? settings.type : 'http',
    host: _sanitizeProxyHost(settings.host),
    port: _sanitizeProxyPort(settings.port),
    bridges: settings.bridges || '',
    bypassDomains: _normalizeDomainList(settings.bypassDomains),
    forceDomains: _normalizeDomainList(settings.forceDomains)
  };
  // A manual enable clears the auto-disable marker from the watchdog.
  if (_proxySettings.enabled && _proxySettings.host) delete _proxySettings.proxyAutoDisabled;
  try { fs.writeFileSync(_proxyConfigPath, JSON.stringify(_proxySettings)); } catch(e) {}
  // The user just changed the proxy by hand: drop any stale live-fallback
  // so their explicit choice is applied immediately (not in 45s), and reset
  // the fail counter.
  _proxyLiveFallback = false;
  _proxyWatchdogFails = 0;
  applyProxyToSession();
  // The DNS-through-proxy startup flag cannot be unset at runtime: with it
  // active, a "direct" connection has NO DNS at all. Offer a restart instead
  // of silently black-holing every request.
  if (!_proxySettings.enabled && _dnsThroughProxyActive) {
    setTimeout(function() { _offerDirectRelaunch('Proxy disabled', 'DNS is still routed through the proxy until the browser restarts. Without a restart, no site will load. Restart now to restore the direct connection.'); }, 400);
  }
  return { success: true };
});

// Restart the browser with the proxy turned off (host/port are kept in
// proxy.json so the user can re-enable everything with one toggle).
function _relaunchWithoutProxy() {
  try {
    _proxySettings.enabled = false;
    // Marker: prevents the startup auto-detect from re-applying a dead proxy
    // right after the restart (cleared when the user enables a proxy again).
    _proxySettings.proxyAutoDisabled = true;
    fs.writeFileSync(_proxyConfigPath, JSON.stringify(_proxySettings));
  } catch(e) {}
  try { app.relaunch(); } catch(e) {}
  app.exit(0);
}

function _offerDirectRelaunch(title, detail) {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (_directRelaunchOffered) return;
    _directRelaunchOffered = true;
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: t(title),
      message: t(title),
      detail: t(detail),
      buttons: [t('Restart without proxy'), t('Keep proxy settings')],
      defaultId: 0,
      cancelId: 1
    }).then(function(r) {
      if (r.response === 0) _relaunchWithoutProxy();
      else _directRelaunchOffered = false; // allow the offer again later
    }).catch(function() { _directRelaunchOffered = false; });
  } catch(e) {}
}
var _directRelaunchOffered = false;

// Dead-proxy watchdog. Two modes:
//  • DNS-flag active (hardened Tor): direct mode is impossible without a
//    restart → offer one once.
//  • Regular proxy: LIVE fallback — switch all sessions to direct
//    immediately (works, because local DNS is available) and notify; when
//    the proxy comes back, traffic is re-routed automatically.
function _startProxyWatchdog() {
  setInterval(function() {
    try {
      if (!_proxySettings.enabled || !_proxySettings.host) return;
      var host = _proxySettings.host || '127.0.0.1';
      var port = parseInt(_proxySettings.port, 10) || 9050;
      var isSocks = _proxySettings.type === 'socks5' || _proxySettings.type === 'tor';
      var probe = isSocks ? _probeSocks5(host, port) : _probePort(host, port);
      probe.then(function(ok) {
        if (ok) {
          _proxyWatchdogFails = 0;
          // Recovery: the proxy came back while we fell back to direct.
          if (_proxyLiveFallback) {
            _proxyLiveFallback = false;
            console.error("[WD] RECOVERY: proxy back");
            try { applyProxyToSession(); } catch(e) {}
            _proxyNotify('Proxy restored', 'Traffic is routed through ' + host + ':' + port + ' again.');
          }
          return;
        }
        _proxyWatchdogFails++;
        if (_proxyWatchdogFails < 2) return;
        _proxyWatchdogFails = 0;
        if (_dnsThroughProxyActive) {
          // Hardened Tor mode: no DNS without the proxy — restart required.
          _offerDirectRelaunch('Proxy is unreachable',
            'The configured proxy (' + host + ':' + port + ') is not responding. Because DNS is routed through the proxy, nothing can load. Restart in direct mode?');
        } else if (!_proxyLiveFallback) {
          // Regular proxy: switch to direct right away, keep the settings.
          _proxyLiveFallback = true;
          console.error("[WD] FALLBACK -> direct");
          try { applyProxyToSession(); } catch(e) {}
          _proxyNotify('Proxy is unreachable',
            'Switched to a direct connection. The proxy settings were kept and will be used again once ' + host + ':' + port + ' responds.');
        }
      });
    } catch(e) {}
  }, 45000);
}
var _proxyWatchdogFails = 0;
var _proxyLiveFallback = false;

function _proxyNotify(title, body) {
  try {
    var n = new Notification({ title: t(title), body: t(body) });
    n.show();
  } catch(e) {}
}

ipcMain.handle('tor-start', async function(_, settings) {
  _proxySettings.bridges = settings.bridges || '';
  // Persist bridges to proxy.json so they are not lost on restart
  try { fs.writeFileSync(_proxyConfigPath, JSON.stringify(_proxySettings)); } catch(e) {}
  var res = await startTor(_proxySettings.bridges);
  // Only route browser traffic through Tor when bootstrap actually reached
  // 100%. If the bridge did not connect in time, applying the proxy would
  // black-hole every subsequent request.
  if (res && res.running && res.bootstrap >= 100) {
    _proxySettings.enabled = true;
    _proxySettings.type = 'socks5';
    _proxySettings.host = '127.0.0.1';
    _proxySettings.port = String(_torPort || 9050);
    try { fs.writeFileSync(_proxyConfigPath, JSON.stringify(_proxySettings)); } catch(e) {}
    try { applyProxyToSession(); } catch(e) {}
  } else if (res && res.timeout) {
    // Surface the timeout so the UI can tell the user the bridge did not
    // connect — instead of silently leaving them with a half-dead Tor.
    return Object.assign({}, res, {
      error: 'Tor did not finish bootstrapping with these bridges. Try another bridge or check your network.'
    });
  }
  return res;
});

ipcMain.handle('tor-stop', function() {
  stopTor();
  // CRITICAL: also drop the proxy from the session. The previous code only
  // killed the process, leaving session.proxyRules pointing at 127.0.0.1:9050
  // — which made every request fail because nothing was listening any more.
  _proxySettings.enabled = false;
  try { fs.writeFileSync(_proxyConfigPath, JSON.stringify(_proxySettings)); } catch(e) {}
  _proxyLiveFallback = false;
  _proxyWatchdogFails = 0;
  try { applyProxyToSession(); } catch(e) {}
  // With the DNS-through-proxy flag active, direct mode has no DNS —
  // offer a restart instead of a silent blackout.
  if (_dnsThroughProxyActive) {
    setTimeout(function() { _offerDirectRelaunch('Tor stopped', 'DNS is still routed through Tor until the browser restarts. Without a restart, no site will load. Restart now?'); }, 400);
  }
  return { stopped: true };
});

ipcMain.handle('tor-check', function() {
  return checkTor();
});

ipcMain.handle('tor-status', function() {
  return { running: !!_torProcess, bootstrap: _torBootstrap };
});

ipcMain.handle('tor-newnym', function() {
  return torNewIdentity();
});

// ===== Tor auto-start flag (stored in settings.json) =====
ipcMain.handle('get-tor-autostart', function() {
  try { return !!readStorage().torAutoStart; } catch(e) { return false; }
});
ipcMain.handle('set-tor-autostart', function(_, val) {
  try {
    var s = readStorage();
    s.torAutoStart = !!val;
    writeStorage(s);
    return { success: true };
  } catch(e) { return { success: false, error: e.message }; }
});

// ===== Connection test: detects exit IP, country, ISP, Tor status, speed =====
// Goes through the current proxy/Tor (uses net.fetch which respects session proxy).
ipcMain.handle('proxy-connection-test', async function() {
  if (!_svcEnabled('diagnosticsEnabled')) {
    return { success: false, error: 'Connection diagnostics are disabled in Settings' };
  }
  var netMod = require('electron').net;
  function fetchWithTimeout(url, ms) {
    return new Promise(function(resolve, reject) {
      var done = false;
      var t = setTimeout(function() {
        if (!done) { done = true; reject(new Error('timeout')); }
      }, ms || 12000);
      try {
        netMod.fetch(url, { cache: 'no-store', redirect: 'follow' }).then(function(r) {
          if (done) return;
          done = true; clearTimeout(t); resolve(r);
        }).catch(function(e) {
          if (done) return;
          done = true; clearTimeout(t); reject(e);
        });
      } catch(e) {
        if (!done) { done = true; clearTimeout(t); reject(e); }
      }
    });
  }

  var mode = 'direct';
  if (_proxySettings.enabled) {
    mode = (_proxySettings.type === 'tor') ? 'tor' : 'proxy';
  }
  var out = { success: false, mode: mode, isTor: false, ip: null, country: null,
              countryCode: null, city: null, isp: null, timezone: null,
              latencyMs: null, speedKbps: null, error: null };

  // 1) IP + Tor detection via check.torproject.org
  var t0 = Date.now();
  try {
    var r1 = await fetchWithTimeout(EXTERNAL_SERVICES.torCheck, 12000);
    if (r1.ok) {
      var j1 = await r1.json();
      out.ip = j1.IP || out.ip;
      out.isTor = !!j1.IsTor;
    }
    out.latencyMs = Date.now() - t0;
  } catch(e) {
    out.latencyMs = Date.now() - t0;
    // keep going — try geo lookup which also returns the IP
  }

  // 2) Geo / ISP via ipapi.co (fallback: ipinfo.io)
  try {
    var r2 = await fetchWithTimeout(EXTERNAL_SERVICES.geo, 12000);
    if (r2.ok) {
      var j2 = await r2.json();
      if (j2 && !j2.error) {
        if (!out.ip) out.ip = j2.ip;
        out.country = j2.country_name || out.country;
        out.countryCode = j2.country_code || out.countryCode;
        out.city = j2.city || out.city;
        out.isp = j2.org || j2.asn || out.isp;
        out.timezone = j2.timezone || out.timezone;
      }
    }
  } catch(e) {
    // fallback to ipinfo.io
    try {
      var r3 = await fetchWithTimeout(EXTERNAL_SERVICES.geoFallback, 10000);
      if (r3.ok) {
        var j3 = await r3.json();
        if (!out.ip) out.ip = j3.ip;
        var loc = j3.loc ? j3.loc.split(',') : null;
        out.country = out.country || (j3.country ? j3.country : null);
        out.countryCode = out.countryCode || j3.country;
        out.city = out.city || j3.city;
        out.isp = out.isp || j3.org;
        out.timezone = out.timezone || j3.timezone;
      }
    } catch(e2) {}
  }

  // 3) Speed test — download ~512KB from Cloudflare and measure throughput
  try {
    var bytes = 524288;
    var ts = Date.now();
    var r4 = await fetchWithTimeout(EXTERNAL_SERVICES.speedTest + bytes, 15000);
    if (r4.ok && r4.body) {
      var buf = await r4.arrayBuffer();
      var dt = (Date.now() - ts) / 1000;
      if (dt > 0 && buf && buf.byteLength > 0) {
        out.speedKbps = Math.round((buf.byteLength * 8) / 1000 / dt);
      }
    }
  } catch(e) {}

  if (!out.ip && !out.country) {
    out.error = 'No network response. The proxy/Tor may be down or blocking these requests.';
  } else {
    out.success = true;
  }
  return out;
});

// Shared translate logic: used by the 'translate-text' IPC and the console
// transport of the hover-translate bridge. Goes through net.fetch (respects
// Tor/proxy).
async function _translateText(text, from, to) {
  try {
    if (!_svcEnabled('translateEnabled')) {
      return { success: false, error: 'Translation is disabled in Settings' };
    }
    // from/to arrive from page code — only accept plain language codes,
    // otherwise they end up inside the request URL.
    function _sanitizeLang(v, dflt) {
      return (/^[a-zA-Z-]{2,10}$/.test(String(v || ''))) ? String(v).toLowerCase() : dflt;
    }
    var sl = _sanitizeLang(from, 'auto');
    var tl = _sanitizeLang(to, 'en');
    if (!text || typeof text !== 'string' || !text.trim()) {
      return { success: false, error: 'Empty text' };
    }
    var url = EXTERNAL_SERVICES.translate + '?client=gtx&sl=' + sl + '&tl=' + tl + '&dt=t&q=' + encodeURIComponent(text.slice(0, 5000));
    var resp = await require('electron').net.fetch(url);
    var data = await resp.json();
    if (data && data[0]) {
      var translated = data[0].map(function(seg) { return seg[0] || ''; }).join('');
      var detectedLang = data[2] || sl;
      return { success: true, translated: translated, from: detectedLang, to: tl };
    }
    return { success: false, error: 'Failed to translate' };
  } catch(e) {
    return { success: false, error: e.message || 'Network error' };
  }
}

ipcMain.handle('translate-text', async function(_, text, from, to) {
  return _translateText(text, from, to);
});

// ============== KEYBINDINGS (hotkey editor) ==============
// Recording mode flag: when true, before-input-event does not intercept
// editable bindings, so the Settings page gets all keys
// and can record a new combination (even if it matches an existing one).
var _kbRecording = false;
ipcMain.on('keybinding-recording', function(_, on) {
  _kbRecording = !!on;
});
ipcMain.handle('get-keybindings', function() {
  if (!_keyBindings) _loadKeybindings();
  var store = readStorage();
  return { bindings: _keyBindings, defaults: _defaultKeybindings(), actions: _keybindingActions, overlayEnabled: store.hotkeysOverlay !== false };
});
ipcMain.handle('set-hotkeys-overlay', function(_, on) {
  var store = readStorage();
  store.hotkeysOverlay = !!on;
  writeStorage(store);
  return { success: true, overlayEnabled: !!on };
});
ipcMain.handle('set-keybinding', function(_, action, binding) {
  if (!_keyBindings) _loadKeybindings();
  var defs = _defaultKeybindings();
  if (!defs[action]) return { success: false, error: 'Unknown action' };
  var store = readStorage();
  if (!store.keybindings) store.keybindings = {};

  // Remove this combination from all other actions (to avoid conflicts)
  if (binding && binding.key) {
    Object.keys(defs).forEach(function(act) {
      var b = _keyBindings[act];
      if (b && act !== action && _sameCombo(b, binding)) {
        // remove from that action — return it to... we do nothing, just clear
        store.keybindings[act] = { ctrl: false, shift: false, alt: false, key: '' };
        _keyBindings[act] = { ctrl: false, shift: false, alt: false, key: '' };
      }
    });
  }
  store.keybindings[action] = binding;
  writeStorage(store);
  _keyBindings[action] = Object.assign({}, defs[action], binding);
  return { success: true, bindings: _keyBindings };
});
function _sameCombo(a, b) {
  if (!a || !b) return false;
  return !!a.ctrl === !!b.ctrl && !!a.shift === !!b.shift && !!a.alt === !!b.alt &&
    String(a.key || '').toLowerCase() === String(b.key || '').toLowerCase();
}
ipcMain.handle('reset-keybindings', function() {
  var store = readStorage();
  delete store.keybindings;
  writeStorage(store);
  _keyBindings = _defaultKeybindings();
  return { success: true, bindings: _keyBindings };
});

// ============== ELEMENT ZAPPER (per-site hiding rules) ==============
ipcMain.handle('get-element-hiding-rules', function() {
  var store = readStorage();
  return store.elementHidingRules || {};
});
ipcMain.handle('add-element-hiding-rule', function(_, domain, selector) {
  if (!domain || !selector) return { success: false };
  var store = readStorage();
  if (!store.elementHidingRules) store.elementHidingRules = {};
  if (!Array.isArray(store.elementHidingRules[domain])) store.elementHidingRules[domain] = [];
  if (store.elementHidingRules[domain].indexOf(selector) === -1) {
    store.elementHidingRules[domain].push(selector);
    writeStorage(store);
  }
  return { success: true, rules: store.elementHidingRules };
});
ipcMain.handle('remove-element-hiding-rule', function(_, domain, selector) {
  var store = readStorage();
  if (!store.elementHidingRules || !store.elementHidingRules[domain]) return { success: true, rules: store.elementHidingRules || {} };
  store.elementHidingRules[domain] = store.elementHidingRules[domain].filter(function(s) { return s !== selector; });
  if (store.elementHidingRules[domain].length === 0) delete store.elementHidingRules[domain];
  writeStorage(store);
  return { success: true, rules: store.elementHidingRules };
});
ipcMain.handle('clear-element-hiding-domain', function(_, domain) {
  var store = readStorage();
  if (store.elementHidingRules) {
    delete store.elementHidingRules[domain];
    writeStorage(store);
  }
  return { success: true, rules: store.elementHidingRules || {} };
});
ipcMain.handle('get-element-zapper-enabled', function() {
  var store = readStorage();
  return store.elementZapperEnabled !== false;
});
ipcMain.handle('set-element-zapper-enabled', function(_, val) {
  var store = readStorage();
  store.elementZapperEnabled = !!val;
  writeStorage(store);
  return { success: true };
});

// Start the element picker in a specific webview. The picker ALWAYS runs in
// the page's MAIN world via executeJavaScript (privileged main-process call,
// ignores page CSP). The old isolated-world (preload) picker proved
// unreliable on heavy sites (YouTube: trusted mouseover reached the isolated
// context but the picker's own listeners never fired), and the original
// window.postMessage trigger is dead in Electron 42 (cross-world messaging
// no longer works at all). Main-world capture listeners on `window` fire
// before any document-level handlers of the page.
ipcMain.handle('start-element-picker', async (event, webContentsId) => {
  try {
    var wc = webContents.fromId(Number(webContentsId));
    if (!wc || wc.isDestroyed()) return { success: false };
    // Only webview contents can be targeted — never arbitrary windows.
    if (wc.getType() !== 'webview') return { success: false };

    // Re-invocation while active cancels the running picker (toggle-like UX).
    try {
      var wasActive = await wc.executeJavaScript('!!window.__spzMwPickerActive', false);
      if (wasActive) {
        await wc.executeJavaScript('if(window.__spzMwCancel){window.__spzMwCancel();}0', false);
        return { success: true, cancelled: true };
      }
    } catch (e0) {}

    var picked;
    try {
      picked = await wc.executeJavaScript(_MAIN_WORLD_PICKER_CODE, true);
    } catch (e1) {
      return { success: false };
    }
    if (!picked) return { success: true, cancelled: true };

    // Undo (U key): remove the most recent rule for this domain.
    if (picked.undo && picked.domain) {
      var ustore = readStorage();
      var ulist = ustore.elementHidingRules && ustore.elementHidingRules[picked.domain];
      if (Array.isArray(ulist) && ulist.length) {
        var removed = ulist.pop();
        if (!ulist.length) delete ustore.elementHidingRules[picked.domain];
        writeStorage(ustore);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('element-hiding-updated', { domain: picked.domain, selector: removed, added: false });
        }
      }
      return { success: true, undo: true };
    }

    if (picked.selector && picked.domain) {
      // Hide immediately in the page…
      try {
        var hideCss = picked.selector + ' { display: none !important; }';
        wc.executeJavaScript('(function(){try{var s=document.createElement("style");s.id="__spz_zap_hide";s.textContent=' + JSON.stringify(hideCss) + ';document.documentElement.appendChild(s);return 1}catch(e){return 0}})()', false).catch(function() {});
      } catch (e3) {}
      // …and persist so the renderer keeps applying it on future loads.
      _saveElementHidingRule(picked.domain, picked.selector, wc);
      return { success: true };
    }
    return { success: true, cancelled: true };
  } catch(e) {
    return { success: false };
  }
});

var _MAIN_WORLD_PICKER_CODE = `
(function(){
  if (window.__spzMwPickerActive) return null;
  try{Object.defineProperty(window,'__spzMwPickerActive',{value:true,enumerable:false,configurable:true,writable:true});}catch(e){window.__spzMwPickerActive=true;}
  return new Promise(function(resolve){
    function done(v){ try{Object.defineProperty(window,'__spzMwPickerActive',{value:false,enumerable:false,configurable:true,writable:true});}catch(e){window.__spzMwPickerActive=false;} window.__spzMwCancel = null; cleanup(); resolve(v); }
    try{Object.defineProperty(window,'__spzMwCancel',{value:function(){ done(null); },enumerable:false,configurable:true,writable:true});}catch(e){window.__spzMwCancel=function(){ done(null); };}
    var style = document.createElement('style');
    style.id = '__spz_picker_style';
    style.textContent =
      '.__spz_hover{outline:2px solid #e74c3c!important;outline-offset:-2px!important;background:rgba(231,76,60,0.12)!important;cursor:crosshair!important;}' +
      '.__spz_overlay{position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483646;pointer-events:none;background:rgba(0,0,0,0.35);}' +
      '.__spz_hint{position:fixed;top:14px;left:50%;transform:translateX(-50%);background:#222;color:#fff;font:13px/1.4 -apple-system,sans-serif;' +
        'padding:10px 16px;border-radius:10px;z-index:2147483647;box-shadow:0 6px 20px rgba(0,0,0,.4);max-width:90%;text-align:center;pointer-events:none;}' +
      '.__spz_hint b{color:#ff6b6b}.__spz_hint kbd{background:#444;border-radius:4px;padding:1px 6px;font-family:monospace;}';
    document.documentElement.appendChild(style);
    var overlay = document.createElement('div');
    overlay.className = '__spz_overlay';
    document.documentElement.appendChild(overlay);
    var hint = document.createElement('div');
    hint.className = '__spz_hint';
    // Build via DOM API + textContent only: YouTube (and other Trusted-Types
    // CSP sites) throws on innerHTML assignment, which used to kill the whole
    // picker right after the overlay was inserted ("dark screen, dead click").
    (function(){
      function kbd(txt){ var k = document.createElement('kbd'); k.textContent = txt; return k; }
      hint.appendChild(document.createTextNode('Click an element to '));
      var b = document.createElement('b'); b.textContent = 'hide it forever'; hint.appendChild(b);
      hint.appendChild(document.createTextNode('. ')); hint.appendChild(kbd('Esc'));
      hint.appendChild(document.createTextNode(' — cancel, ')); hint.appendChild(kbd('U'));
      hint.appendChild(document.createTextNode(' — undo last.'));
    })();
    document.documentElement.appendChild(hint);
    var lastHover = null;
    function esc(s){ return (window.CSS && CSS.escape) ? CSS.escape(s) : s; }
    function buildSelector(el){
      if (!el || el.nodeType !== 1) return '';
      if (el.id) {
        var id = el.id.trim();
        if (/^[A-Za-z][\\w\\-.:]*$/.test(id)) return '#' + esc(id);
      }
      var parts = [];
      var node = el;
      while (node && node.nodeType === 1 && node !== document.documentElement) {
        var part = node.nodeName.toLowerCase();
        if (node.id && /^[A-Za-z][\\w\\-.:]*$/.test(node.id.trim())) {
          parts.unshift('#' + esc(node.id.trim()));
          break;
        }
        var parent = node.parentElement;
        if (parent) {
          var sibs = Array.prototype.filter.call(parent.children, function(c){ return c.nodeName === node.nodeName; });
          if (sibs.length > 1) part += ':nth-of-type(' + (Array.prototype.indexOf.call(parent.children, node) + 1) + ')';
        }
        parts.unshift(part);
        node = parent;
      }
      var sel = parts.join(' > ');
      if (sel.length > 200 && el.className && typeof el.className === 'string') {
        var cls = el.className.trim().split(/\\s+/).slice(0, 2).map(function(c){ return '.' + esc(c); }).join('');
        if (cls) return el.nodeName.toLowerCase() + cls;
      }
      return sel;
    }
    function hov(e){
      if (!e.isTrusted) return; // ignore synthetic events fired by the page
      var t = e.target;
      if (!t || t.nodeType !== 1 || t === overlay || t === hint || t === document.body || t === document.documentElement) return;
      if (lastHover && lastHover !== t) { try { lastHover.classList.remove('__spz_hover'); } catch(err){} }
      try { t.classList.add('__spz_hover'); } catch(err){}
      lastHover = t;
    }
    function click(e){
      if (!e.isTrusted) return; // only real user clicks pick elements
      e.preventDefault(); e.stopPropagation();
      var t = e.target;
      if (!t || t === overlay || t === hint) return;
      var sel = buildSelector(t);
      if (sel) done({ domain: window.location.hostname, selector: sel });
      else done(null);
    }
    function key(e){
      if (!e.isTrusted) return;
      if (e.key === 'Escape') { e.preventDefault(); done(null); }
      else if (e.key && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        done({ undo: true, domain: window.location.hostname });
      }
    }
    // window capture: fires BEFORE any document-level handlers of the page
    window.addEventListener('mouseover', hov, true);
    window.addEventListener('click', click, true);
    window.addEventListener('keydown', key, true);
    function cleanup(){
      window.removeEventListener('mouseover', hov, true);
      window.removeEventListener('click', click, true);
      window.removeEventListener('keydown', key, true);
      if (lastHover) { try { lastHover.classList.remove('__spz_hover'); } catch(err){} }
      if (style.parentNode) style.parentNode.removeChild(style);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (hint.parentNode) hint.parentNode.removeChild(hint);
    }
    // Safety: never keep the promise (and the overlay) alive forever.
    setTimeout(function(){ if (window.__spzMwPickerActive) done(null); }, 120000);
  });
})()`;

// Shared persistence for picked elements (used by the preload path via
// 'element-picker-result' and by the main-world fallback above).
function _saveElementHidingRule(domain, selector, sourceWc) {
  if (!domain || !selector || selector === '__undo_last__') return;
  var store = readStorage();
  if (!store.elementHidingRules) store.elementHidingRules = {};
  if (!Array.isArray(store.elementHidingRules[domain])) store.elementHidingRules[domain] = [];
  if (store.elementHidingRules[domain].indexOf(selector) === -1) {
    store.elementHidingRules[domain].push(selector);
    writeStorage(store);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('element-hiding-updated', { domain: domain, selector: selector, added: true });
  }
}

// Element selected inside a webview (via preload-webview → main)
ipcMain.on('element-picker-result', function(event, data) {
  if (!data || !data.selector) return;
  var domain = data.domain || '';
  try {
    if (!domain && event.sender && event.sender.getURL) {
      domain = new URL(event.sender.getURL()).hostname;
    }
  } catch(e) {}
  if (!domain) return;
  var store = readStorage();
  if (!store.elementHidingRules) store.elementHidingRules = {};

  // Undo mode: remove the most recent hiding rule for this domain instead of
  // storing the sentinel selector as a (broken) CSS rule.
  if (data.selector === '__undo_last__') {
    var list = store.elementHidingRules[domain];
    if (Array.isArray(list) && list.length) {
      var removed = list.pop();
      if (!list.length) delete store.elementHidingRules[domain];
      writeStorage(store);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('element-hiding-updated', { domain: domain, selector: removed, added: false });
      }
    }
    return;
  }

  if (!Array.isArray(store.elementHidingRules[domain])) store.elementHidingRules[domain] = [];
  if (store.elementHidingRules[domain].indexOf(data.selector) === -1) {
    store.elementHidingRules[domain].push(data.selector);
    writeStorage(store);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('element-hiding-updated', { domain: domain, selector: data.selector, added: true });
  }
});

// ============== UPDATE CHECK ==============
// Checks the GitHub releases feed of the upstream repo. Goes through
// net.fetch (respects Tor/proxy), throttled to once per 24h, never installs
// anything silently — only opens the release page when the user agrees.
const UPDATE_FEED_URL = 'https://api.github.com/repos/StartPOZI/StartPOZI-Desktop-Browser-beta-/releases/latest';
const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;

function _cmpVersions(a, b) {
  var pa = String(a || '').replace(/^v/i, '').split('.');
  var pb = String(b || '').replace(/^v/i, '').split('.');
  for (var i = 0; i < Math.max(pa.length, pb.length); i++) {
    var na = parseInt(pa[i], 10) || 0;
    var nb = parseInt(pb[i], 10) || 0;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

async function _fetchUpdateInfo() {
  var cur = electronApp.getVersion();
  var resp = await require('electron').net.fetch(UPDATE_FEED_URL, {
    headers: { 'User-Agent': 'StartPOZI-Browser-Updater', 'Accept': 'application/vnd.github+json' },
    signal: AbortSignal.timeout(10000)
  });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  var rel = await resp.json();
  var latest = String(rel.tag_name || '').replace(/^v/i, '');
  if (!latest) throw new Error('no tag in release');
  return {
    current: cur,
    latest: latest,
    updateAvailable: _cmpVersions(cur, latest) < 0,
    releaseUrl: rel.html_url || 'https://github.com/StartPOZI/StartPOZI-Desktop-Browser-beta-/releases',
    releaseNotes: String(rel.body || '').slice(0, 1500)
  };
}

ipcMain.handle('check-for-updates', async () => {
  try {
    var info = await _fetchUpdateInfo();
    try {
      var store = readStorage();
      store.lastUpdateCheck = Date.now();
      writeStorage(store);
    } catch(e0) {}
    return { success: true, updateAvailable: info.updateAvailable, current: info.current, latest: info.latest, releaseUrl: info.releaseUrl, releaseNotes: info.releaseNotes };
  } catch(e) {
    return { success: false, message: 'Update check failed: ' + (e && e.message || e) };
  }
});

ipcMain.handle('skip-update-version', (_, ver) => {
  const store = readStorage();
  store.skippedUpdateVersion = String(ver || '');
  writeStorage(store);
  return { success: true };
});

function _autoCheckForUpdates() {
  (async function() {
    try {
      var store = readStorage();
      var last = store.lastUpdateCheck || 0;
      if (Date.now() - last < UPDATE_CHECK_INTERVAL) return;
      var info = await _fetchUpdateInfo();
      store = readStorage();
      store.lastUpdateCheck = Date.now();
      writeStorage(store);
      if (!info.updateAvailable) return;
      if (store.skippedUpdateVersion === info.latest) return;
      if (!mainWindow || mainWindow.isDestroyed()) return;
      var dlg = await dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: t('Update available'),
        message: 'StartPOZI Browser ' + info.latest + ' is available',
        detail: t('You are running') + ' ' + info.current + '.',
        buttons: [t('Download'), t('Skip this version'), t('Later')],
        defaultId: 0,
        cancelId: 2
      });
      if (dlg.response === 0 && info.releaseUrl) shell.openExternal(info.releaseUrl);
      else if (dlg.response === 1) {
        var s2 = readStorage();
        s2.skippedUpdateVersion = info.latest;
        writeStorage(s2);
      }
    } catch(e) {}
  })();
}

// ============== EXPORT / IMPORT ALL SETTINGS (JSON) ==============
ipcMain.handle('settings-export-json', async function() {
  try {
    var store = readStorage();
    // Plain-text export: strip credential material (plaintext passwords,
    // vault, masterAuth verifier) — use the password-protected backup
    // (.spzi) to carry passwords between machines.
    store = JSON.parse(JSON.stringify(store));
    delete store.passwords;
    delete store.passwordsSealed;
    delete store.passwordVault;
    delete store.masterAuth;
    var payload = {
      _type: 'startpozi-settings-export',
      _version: 2,
      _exportedAt: new Date().toISOString(),
      _secretsExcluded: true,
      store: store
    };
    var result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export all settings',
      defaultPath: 'startpozi-settings-' + new Date().toISOString().slice(0, 10) + '.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { success: true, path: result.filePath, secretsExcluded: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});
ipcMain.handle('settings-import-json', async function() {
  try {
    var result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import settings',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
    var raw = fs.readFileSync(result.filePaths[0], 'utf-8');
    var parsed = JSON.parse(raw);
    var data = parsed.store || parsed; // support for both formats
    return { success: true, data: data, path: result.filePaths[0] };
  } catch(e) {
    return { success: false, error: e.message };
  }
});
ipcMain.handle('settings-apply-imported', function(_, data) {
  try {
    if (!data || typeof data !== 'object') return { success: false, error: 'Invalid format' };
    // Merge imported over current (do not overwrite customDataPath and service keys)
    var current = readStorage();
    Object.keys(data).forEach(function(k) {
      if (k === 'customDataPath' || k === '_sessionStartTime') return;
      current[k] = data[k];
    });
    writeStorage(current);
    if (_keyBindings) _loadKeybindings();
    try { applySecuritySettings(); } catch(e) {}
    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
});

// ============== MEMORY PRESSURE → AUTO-SLEEP TABS ==============
var _memPollTimer = null;
var _memLastTrigger = 0;
function _startMemoryPoller() {
  if (_memPollTimer) clearInterval(_memPollTimer);
  _memPollTimer = setInterval(function() {
    try {
      var store = readStorage();
      var opt = store.optimization || {};
      var limitMB = parseInt(opt.memoryLimit);
      var enabled = limitMB > 0;
      if (!enabled) return;
      var metrics = app.getAppMetrics();
      var totalKB = 0;
      metrics.forEach(function(m) {
        if (m.memory && m.memory.workingSetSize) totalKB += m.memory.workingSetSize;
      });
      var totalMB = Math.round(totalKB / 1024);
      if (totalMB >= limitMB) {
        var now = Date.now();
        if (now - _memLastTrigger < 60000) return; // 60 sec cooldown
        _memLastTrigger = now;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('memory-pressure', { totalMB: totalMB, limitMB: limitMB });
        }
      }
    } catch(e) {}
  }, 30000);
}
