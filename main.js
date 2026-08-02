const { app, BrowserWindow, ipcMain, dialog, shell, Menu, clipboard, nativeImage, session } = require('electron');
const { app: electronApp } = require('electron');
const crypto = require('crypto');
const https = require('https');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const adblocker = require('./adblocker');
let AdmZip;
try { AdmZip = require('adm-zip'); } catch(e) { AdmZip = null; }

process.on('unhandledRejection', function() {});
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

let mainWindow;

var _pendingDialogs = {};
var _pendingPermRequests = {};

// Disable KWallet and other password prompts
app.commandLine.appendSwitch('password-store', 'basic');
app.commandLine.appendSwitch('use-mock-keychain');
app.commandLine.appendSwitch('autoplay-policy', 'user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'PasswordPeak,PasswordImport,PasswordExport,MediaRouter,RawDraw');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,IntensiveWakeUpThrottling');
// Anti-detection: remove the webdriver flag, otherwise Google and others detect automation
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// === .onion / SOCKS5 DNS fix ===
// Chromium does NOT do SOCKS5h (DNS-through-proxy) by default.
// Without this flag, .onion domains fail with ERR_NAME_NOT_RESOLVED
// because Chromium resolves them locally (no DNS server knows .onion).
//
// The host-resolver-rules flag disables local DNS, forcing Chromium
// to send ALL hostnames to the SOCKS5 proxy for resolution.
// This flag can ONLY be set before app.whenReady().
//
// Strategy:
//  1. proxy.json enabled → set flag (user already configured proxy)
//  2. Tor detected on common ports → set flag + save proxy.json immediately
//  3. Otherwise → no flag (normal browsing); user must restart after enabling Tor
var _startupTorDetected = null; // { host, port } or null
(function applyDnsThroughProxyFlag() {
  try {
    var fs3 = require('fs');
    var needsProxyDns = false;

    // Check 1: proxy.json already configured
    var proxyFile = path.join(app.getPath('userData'), 'proxy.json');
    if (fs3.existsSync(proxyFile)) {
      try {
        var proxy = JSON.parse(fs3.readFileSync(proxyFile, 'utf8'));
        if (proxy && proxy.enabled && proxy.host) needsProxyDns = true;
      } catch(e) {}
    }

    // Check 2: Tor SOCKS5 port listening? (synchronous system call)
    if (!needsProxyDns) {
      var torPorts = [9050, 9150, 9060, 9070, 9080, 9100, 39050, 39060];
      try {
        var cmd;
        if (process.platform === 'win32') {
          cmd = 'netstat -an -p tcp | findstr LISTENING';
        } else {
          cmd = 'ss -tlnH 2>/dev/null || netstat -an -p tcp 2>/dev/null | grep -i LISTEN';
        }
        var out = execSync(cmd, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 2000
        });
        for (var i = 0; i < torPorts.length; i++) {
          var p = torPorts[i];
          var re = new RegExp('(?:127\\.0\\.0\\.1|localhost|\\[?::1\\]?):' + p + '\\b');
          if (re.test(out)) {
            needsProxyDns = true;
            _startupTorDetected = { host: '127.0.0.1', port: String(p) };
            // Save immediately so _proxySettings picks it up at init
            try {
              var autoProxy = { enabled: true, type: 'socks5', host: '127.0.0.1', port: String(p), bridges: '' };
              fs3.writeFileSync(proxyFile, JSON.stringify(autoProxy));
            } catch(e2) {}
            break;
          }
        }
      } catch(e) {}
    }

    if (needsProxyDns) {
      app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND , EXCLUDE 127.0.0.1,localhost,::1');
      app.commandLine.appendSwitch('proxy-bypass-list', '<-loopback>');
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    transparent: true,
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
  _mainWindow = mainWindow;

  // Disable KWallet password prompt by clearing storage
  mainWindow.webContents.session.clearStorageData({
    storages: ['serviceworkers', 'cachestorage']
  });

  mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
    const store = readStorage();
    const downloadDir = store.downloadPath || electronApp.getPath('downloads');
    if (!fs.existsSync(downloadDir)) {
      try { fs.mkdirSync(downloadDir, { recursive: true }); } catch(e) {}
    }
    const filename = item.getFilename();
    let savePath = path.join(downloadDir, filename);

    if (fs.existsSync(savePath)) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      let n = 1;
      while (fs.existsSync(path.join(downloadDir, base + ' (' + n + ')' + ext))) n++;
      savePath = path.join(downloadDir, base + ' (' + n + ')' + ext);
    }

    item.setSavePath(savePath);

    const dlId = 'dl-' + Date.now();
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

    if (!store.downloads) store.downloads = [];
    store.downloads.unshift(dlRecord);
    writeStorage(store);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('download-started', dlRecord);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('downloads-updated');

    item.on('updated', (event, state) => {
      if (state === 'progressing') {
        dlRecord.receivedBytes = item.getReceivedBytes();
        dlRecord.state = 'progressing';
        const store2 = readStorage();
        const idx = (store2.downloads || []).findIndex(d => d.id === dlId);
        if (idx >= 0) { store2.downloads[idx] = { ...dlRecord }; writeStorage(store2); }
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('download-progress', {
          id: dlId, receivedBytes: item.getReceivedBytes(), totalBytes: item.getTotalBytes(), state: 'progressing'
        });
      } else if (state === 'interrupted') {
        dlRecord.state = 'interrupted';
        const store2 = readStorage();
        const idx = (store2.downloads || []).findIndex(d => d.id === dlId);
        if (idx >= 0) { store2.downloads[idx] = { ...dlRecord }; writeStorage(store2); }
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('download-progress', {
          id: dlId, state: 'interrupted'
        });
      }
    });

    item.once('done', (event, state) => {
      dlRecord.state = state === 'completed' ? 'completed' : 'failed';
      if (state === 'completed') dlRecord.receivedBytes = dlRecord.totalBytes;
      const store2 = readStorage();
      const idx = (store2.downloads || []).findIndex(d => d.id === dlId);
      if (idx >= 0) { store2.downloads[idx] = { ...dlRecord }; writeStorage(store2); }
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('download-progress', {
        id: dlId, state: dlRecord.state
      });
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('downloads-updated');
    });
  });

  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    try {
      const url = webContents.getURL();
      const domain = new URL(url).hostname;
      const store = readStorage();
      const sitePerms = (store.sitePermissions && store.sitePermissions[domain]) || {};
      if (permission in sitePerms) {
        callback(sitePerms[permission]);
        return;
      }
    } catch(e) { callback(true); return; }

    var dialogId = 'perm-' + Date.now() + '-' + Math.random().toString(36).substr(2,5);
    _pendingPermRequests[dialogId] = { callback: callback, domain: undefined, permission: permission };

    try {
      var permUrl = webContents.getURL();
      var permDomain = new URL(permUrl).hostname;
      _pendingPermRequests[dialogId].domain = permDomain;
      mainWindow.webContents.send('permission-request', {
        dialogId: dialogId,
        domain: permDomain,
        permission: permission
      });
    } catch(e2) {}

    setTimeout(function() {
      var req = _pendingPermRequests[dialogId];
      if (req) {
        delete _pendingPermRequests[dialogId];
        req.callback(false);
      }
    }, 30000);
  });

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
    var store = readStorage();
    var opt = store.optimization || {};
    if (opt.clearOnMinimize) {
      var ses = _mainWindow.webContents.session;
      ses.clearCache().catch(function(){});
      if (global.gc) global.gc();
    }
  });
}

// Global interception: catch ALL new-window attempts from ALL webContents
// (including webviews). This ensures middle-click, ctrl+click, target=_blank,
// window.open etc. all open as a new tab instead of a new BrowserWindow.
app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler((details) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('open-in-new-tab', details.url);
    }
    return { action: 'deny' };
  });

  contents.on('dialog', (event, type, message, defaultText, callback) => {
    event.preventDefault();
    var dialogId = 'dlg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    _pendingDialogs[dialogId] = { type: type, callback: callback };
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('show-webview-dialog', {
        dialogId: dialogId,
        type: type,
        message: message,
        defaultText: defaultText || ''
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

  // Get the URL — if in Settings and recording a combination — skip
  var wcUrl = '';
  try { wcUrl = webContents && webContents.getURL ? webContents.getURL() : ''; } catch(e) {}
  var inSettings = wcUrl.indexOf('Settings.html') !== -1;
  if (inSettings && _kbRecording) return;

  // Esc — stop loading (even when focus is on the toolbar).
  // Important: only bare Escape, otherwise Shift+Esc (Task Manager) will not work.
  if (key === 'Escape' && !input.shift && !input.control && !input.meta && !input.alt) {
    try { mainWindow.webContents.send('shortcut-action', { action: 'stop' }); } catch(e) {}
    return;
  }
  // Ctrl+1..9 — tab by index
  var ctrlOnly = (input.control || input.meta) && !input.shift && !input.alt;
  if (ctrlOnly && key >= '1' && key <= '9') {
    event.preventDefault();
    try { mainWindow.webContents.send('shortcut-action', { action: 'tabByIndex', index: parseInt(key) }); } catch(e) {}
    return;
  }
  // F5 — reload
  if (!input.control && !input.meta && !input.shift && !input.alt && key === 'F5') {
    event.preventDefault();
    try { mainWindow.webContents.send('shortcut-action', { action: 'reload' }); } catch(e) {}
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
        // For the main window — open chrome devtools; for a webview — its own
        event.preventDefault();
        try {
          if (isChrome) mainWindow.webContents.toggleDevTools();
          else webContents.toggleDevTools();
        } catch(e) {}
        return;
      }
      event.preventDefault();
      try { mainWindow.webContents.send('shortcut-action', { action: a }); } catch(e) {}
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
          mainWindow.webContents.send('forward-vim-key', {
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

app.whenReady().then(async () => {
  createWindow();
  const initStore = readStorage();
  initStore._sessionStartTime = Date.now();
  writeStorage(initStore);
  if (initStore.windowOpacity !== undefined && initStore.windowOpacity < 1) {
    mainWindow.setOpacity(Math.max(0.1, Math.min(1, initStore.windowOpacity)));
  }
  await adblocker.initBlocker(mainWindow.webContents.session);
  applySecuritySettings();
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

    // Apply the sec-ch-ua substitution to the webview session — CRITICAL for incognito,
    // since each incognito tab creates its own partition-session, on which
    // our default-session listener does not work. Without this Google in incognito
    // sees "Electron" again and blocks login.
    try { _ensureChromeHeadersOnSession(webContents.session); } catch(e) {}
    // Apply the current proxy settings to the new webview session (Tor/proxy),
    // otherwise incognito and new tabs go directly bypassing the proxy.
    try { _ensureProxyOnSession(webContents.session); } catch(e) {}

    // DIAGNOSTICS: after loading the Google page — check whether
    // the page sees the substituted navigator.userAgentData or the original Electron.
    webContents.on('dom-ready', function() {
      try {
        var url = webContents.getURL() || '';
        if (url.indexOf('google') === -1) return;
        webContents.executeJavaScript(
          '(function(){try{' +
          'var u=navigator.userAgentData;' +
          'var brands=u&&u.brands?JSON.stringify(u.brands):"no-userAgentData";' +
          'var ua=navigator.userAgent;' +
          'var wd=navigator.webdriver;' +
          'var wc=typeof window.chrome;' +
          'var wcr=!!(window.chrome&&window.chrome.runtime);' +
          'var plugins=navigator.plugins?navigator.plugins.length:-1;' +
          'var ow=window.outerWidth,iw=window.innerWidth,oh=window.outerHeight,ih=window.innerHeight;' +
          'var dm=navigator.deviceMemory;' +
          'var nc=navigator.connection?navigator.connection.effectiveType:"none";' +
          'var perm=navigator.permissions?"ok":"none";' +
          'return JSON.stringify({brands:brands,ua:ua.substring(0,100),webdriver:wd,windowChrome:wc,chromeRuntime:wcr,plugins:plugins,' +
          'outerW:ow,innerW:iw,outerH:oh,innerH:ih,hDelta:oh-ih,devMem:dm,conn:nc,perm:perm});' +
          '}catch(e){return "ERR:"+e.message;}})()'
        ).then(function(result) {
          try {
            fs.appendFileSync(
              path.join(electronApp.getPath('userData'), 'google-headers-debug.log'),
              '[JS-CHECK] ' + new Date().toISOString() + ' ' + url.substring(0,60) + ' → ' + result + '\n'
            );
          } catch(e) {}
        }).catch(function() {});
      } catch(e) {}
    });

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  if (!mainWindow) return;
  try {
    const store = readStorage();
    store.saveTabs = saveTabsSetting;
    store.saveInternalPages = saveInternalPagesSetting;
    store.savedTabs = savedTabs;
    writeStorage(store);
  } catch(e) {}
  mainWindow.close();
});

// ============== IN-MEMORY STORAGE (simple stubs for API) ==============
// In a real browser this data should be persisted to files/DB
const Store = require('electron').app.getPath ? null : null;

// Simple JSON file-based storage
const storagePath = path.join(electronApp.getPath('userData'), 'settings.json');
function readStorage() {
  try {
    if (fs.existsSync(storagePath)) {
      return JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
    }
  } catch(e) {}
  return {};
}
function writeStorage(data) {
  try {
    fs.writeFileSync(storagePath, JSON.stringify(data, null, 2), 'utf-8');
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

  var needPermHandler = sec.autoplayBlock || sec.blockNotifications || sec.blockGeolocation;
  if (needPermHandler) {
    ses.setPermissionRequestHandler(function(webContents, permission, callback) {
      if (permission === 'media' && sec.autoplayBlock) {
        try {
          var url = webContents ? webContents.getURL() : '';
          if (url.indexOf('Settings.html') > -1 || url.indexOf('MainPage/index.html') > -1 || url.indexOf('ErrorPage/index.html') > -1) {
            callback(true);
            return;
          }
        } catch(e) {}
        callback(false);
      } else if (permission === 'notifications' && sec.blockNotifications) {
        callback(false);
      } else if (permission === 'geolocation' && sec.blockGeolocation) {
        callback(false);
      } else {
        callback(true);
      }
    });
  } else {
    ses.setPermissionRequestHandler(null);
  }

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
  var securityHandler = _secBeforeSendHeaders;
  _secBeforeSendHeaders = function(details, callback) {
    if (!securityHandler) {
      var h0 = details.requestHeaders || {};
      _applyChromeHeadersToObject(h0);
      _diagLog(details, h0);
      callback({ requestHeaders: h0 });
      return;
    }
    securityHandler(details, function(res) {
      var h1 = (res && res.requestHeaders) || details.requestHeaders || {};
      _applyChromeHeadersToObject(h1);
      _diagLog(details, h1);
      callback({ requestHeaders: h1 });
    });
  };

  ses.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, _secBeforeSendHeaders);
  _chromeHeaderSessions.add('default');

  // === TOR HARDENING — CSP injection via onHeadersReceived ===
  // store.security.torHardening = { js, webgl, fonts, plugins, iframes, base }
  // Each option is independent. Applied to http/https (we do not touch file://).
  // IMPORTANT: in Electron details.responseHeaders — is an OBJECT {name: value},
  // not an array (previously there was headers.push here → it crashed).
  try { ses.webRequest.onHeadersReceived(null); } catch(e) {}
  var th = sec.torHardening || {};
  var anyHardening = th.js || th.fonts || th.plugins || th.iframes || th.base;
  // webgl separately — via preload-webview (CSP does not block it correctly).
  if (anyHardening) {
    ses.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, function(details, callback) {
      try {
        // Build CSP from individual toggles
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
        if (parts.length === 0) { callback({}); return; }
        var csp = parts.join('; ');
        var headers = details.responseHeaders;
        if (!headers) { callback({}); return; }
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
}

// === Substitute sec-ch-ua / User-Agent to Chrome ===
// Applied to ALL sessions, including incognito-partitions, otherwise in incognito
// Google will see the "Electron" brand again and block login.
function _applyChromeHeadersToObject(headers) {
  if (!headers) return headers;
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
  if (!uaKey || headers[uaKey].indexOf('Electron') > -1) {
    if (uaKey) delete headers[uaKey];
    headers['User-Agent'] = _uaPlatformString;
  }
  return headers;
}
var _chromeHeaderSessions = new Set();
// Applies sec-ch-ua substitution to ANY session (default is skipped — it is configured by
// applySecuritySettings with the security+sec-ch-ua chain). Called from
// web-contents-created for each new webview, including incognito.
function _ensureChromeHeadersOnSession(ses) {
  if (!ses) return;
  var isDefault = false;
  try { isDefault = (ses === session.defaultSession); } catch(e) {}
  var key = null;
  try {
    if (isDefault) key = 'default';
    else { key = ses.partition || ('storage:' + ses.getStoragePath()); }
  } catch(e) { key = 'unknown-' + Date.now(); }
  if (!key || _chromeHeaderSessions.has(key)) return;
  _chromeHeaderSessions.add(key);
  if (isDefault) return; // default is configured in applySecuritySettings
  try {
    ses.webRequest.onBeforeSendHeaders({ urls: ['<all_urls>'] }, function(details, callback) {
      var h = details.requestHeaders || {};
      _applyChromeHeadersToObject(h);
      _diagLog(details, h);
      callback({ requestHeaders: h });
    });
    try { ses.setUserAgent(_uaPlatformString); } catch(e) {}
  } catch(e) {}
}

// DIAGNOSTICS: write request headers to Google to a file, to understand
// whether the substitution is really applied. File: userData/google-headers-debug.log
var _diagLogPath = null;
var _diagLastFlush = 0;
var _diagBuf = [];
function _diagLog(details, headers) {
  try {
    if (!details || !details.url) return;
    var host = '';
    try { host = new URL(details.url).hostname; } catch(e) { return; }
    if (host.indexOf('google') === -1 && host.indexOf('googleapis') === -1) return;
    if (!_diagLogPath) {
      _diagLogPath = path.join(electronApp.getPath('userData'), 'google-headers-debug.log');
    }
    var ua = '', secua = '', secplat = '', secmobile = '';
    Object.keys(headers).forEach(function(k) {
      var lk = k.toLowerCase();
      if (lk === 'user-agent') ua = headers[k];
      else if (lk === 'sec-ch-ua') secua = headers[k];
      else if (lk === 'sec-ch-ua-platform') secplat = headers[k];
      else if (lk === 'sec-ch-ua-mobile') secmobile = headers[k];
    });
    var hasElectron = (ua && ua.indexOf('Electron') > -1) || (secua && secua.indexOf('Electron') > -1);
    var line = new Date().toISOString() + ' | ' + host + details.path + ' | resourceType=' + (details.resourceType || '?') +
      ' | UA=' + (ua ? ua.substring(0, 80) : 'NONE') +
      ' | sec-ch-ua=' + (secua || 'NONE') +
      ' | sec-ch-ua-platform=' + (secplat || 'NONE') +
      ' | sec-ch-ua-mobile=' + (secmobile || 'NONE') +
      ' | ⚠ELECTRON_LEAK=' + (hasElectron ? 'YES' : 'no') + '\n';
    _diagBuf.push(line);
    var now = Date.now();
    if (now - _diagLastFlush > 2000 || _diagBuf.length > 30) {
      fs.appendFileSync(_diagLogPath, _diagBuf.join(''));
      _diagBuf = [];
      _diagLastFlush = now;
    }
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

ipcMain.on('permission-response', (event, data) => {
  var req = _pendingPermRequests[data.dialogId];
  if (!req) return;
  delete _pendingPermRequests[data.dialogId];
  var allowed = !!data.allow;
  req.callback(allowed);
  if (req.domain) {
    var store = readStorage();
    if (!store.sitePermissions) store.sitePermissions = {};
    if (!store.sitePermissions[req.domain]) store.sitePermissions[req.domain] = {};
    store.sitePermissions[req.domain][req.permission] = allowed;
    writeStorage(store);
  }
});

// IPC from preload override (alert/confirm/prompt in webview pages)
ipcMain.handle('dialog-request', (event, data) => {
  return new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) { resolve(null); return; }
    var dialogId = 'drq-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    _pendingDialogs[dialogId] = { type: data.type, resolve: resolve };
    mainWindow.webContents.send('show-webview-dialog', {
      dialogId: dialogId,
      type: data.type,
      message: data.message || '',
      defaultText: data.defaultText || ''
    });
  });
});

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
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('window-opacity-changed', Math.max(0.1, Math.min(1, opacity)));
  }
  return { success: true };
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

ipcMain.handle('search-suggest', (_, query) => {
  return new Promise((resolve) => {
    if (!query || query.length < 2) return resolve([]);
    const store = readStorage();
    const se = store.searchEngine || '';
    let suggestUrl;
    if (se.indexOf('google') !== -1) {
      suggestUrl = 'https://suggestqueries.google.com/complete/search?client=firefox&q=' + encodeURIComponent(query);
    } else if (se.indexOf('yandex') !== -1) {
      suggestUrl = 'https://suggest.yandex.com/suggest-ff.cgi?part=' + encodeURIComponent(query) + '&uil=ru&v=3&sn=5&lr=213';
    } else {
      suggestUrl = 'https://duckduckgo.com/ac/?q=' + encodeURIComponent(query);
    }
    const req = https.get(suggestUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36' }, timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
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
          resolve(suggestions.slice(0, 6));
        } catch(e) { resolve([]); }
    });
  });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
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
ipcMain.on('task-manager-action', (_, action, tabId) => {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    _mainWindow.webContents.send('task-manager-action', { action: action, tabId: tabId });
  }
});

// Bulk optimization operations from Settings.html (which has no access to tabs[])
ipcMain.on('optimization-sleep-all', () => {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    _mainWindow.webContents.send('task-manager-action', { action: 'sleepAll' });
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
  if (adblocker && adblocker.reloadFromLists) {
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
  const store = readStorage();
  return store.blockedLog || [];
});
ipcMain.handle('clear-blocked-log', () => {
  const store = readStorage();
  store.blockedLog = [];
  writeStorage(store);
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

ipcMain.handle('get-security-setting', (_, key) => {
  const store = readStorage();
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
  // Accent color
  if (settings.accent) {
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
    mainWindow.webContents.send('customization-updated', store.customization || {});
  } } catch(e) {}
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
ipcMain.handle('get-history', () => {
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
ipcMain.handle('get-site-permissions', () => {
  const store = readStorage();
  return store.sitePermissions || {};
});

ipcMain.handle('set-site-permission', (_, domain, permission, value) => {
  const store = readStorage();
  if (!store.sitePermissions) store.sitePermissions = {};
  if (!store.sitePermissions[domain]) store.sitePermissions[domain] = {};
  store.sitePermissions[domain][permission] = value;
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

ipcMain.handle('clear-cookies', async () => {
  try {
    const cookies = await mainWindow.webContents.session.cookies.get({});
    for (const c of cookies) {
      const proto = c.secure ? 'https' : 'http';
      const url = proto + '://' + c.domain.replace(/^\./, '') + c.path;
      await mainWindow.webContents.session.cookies.remove(url, c.name);
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
ipcMain.handle('get-downloads', () => {
  const store = readStorage();
  return store.downloads || [];
});

ipcMain.handle('get-session-downloads', () => {
  const store = readStorage();
  const sessionStart = store._sessionStartTime || Date.now();
  return (store.downloads || []).filter(d => d.startTime >= sessionStart);
});

ipcMain.handle('open-download-file', (_, filePath) => {
  try {
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

ipcMain.handle('get-scripts-for-page', (event, url) => {
  const store = readStorage();
  const scripts = (store.scripts || []).filter(s => s.enabled);
  if (!url) return scripts.map(s => ({ id: s.id, code: s.code, runAt: s.runAt || 'document-idle', runInFrames: !!s.runInFrames }));
  const matched = scripts.filter(s => {
    if (!s.match || s.match === '*://*/*') return true;
    try {
      var patterns = s.match.split(',').map(p => p.trim());
      return patterns.some(function(pat) {
        var re = new RegExp('^' + pat.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        return re.test(url);
      });
    } catch(e) { return true; }
  });
  return matched.map(s => ({ id: s.id, code: s.code, runAt: s.runAt || 'document-idle', runInFrames: !!s.runInFrames }));
});

// ============== CUSTOMIZATION ==============
ipcMain.handle('get-customization-settings', () => {
  const store = readStorage();
  return { success: true, settings: store.customization || {} };
});

ipcMain.handle('save-customization-settings', (_, settings) => {
  const store = readStorage();
  store.customization = { ...(store.customization || {}), ...settings };
  writeStorage(store);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('customization-updated', store.customization);
  return { success: true };
});

// Request from Settings for a forced Session Guard check in all tabs.
// Settings is a webview, it has no access to tabs[]; we ask the main window.
ipcMain.handle('session-guard-scan', function() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('session-guard-scan-request');
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('customization-updated', store.customization);
      }
    }
    writeStorage(store);
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
  if (mainWindow) {
    mainWindow.webContents.send('toolbar-buttons-changed', data);
  }
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

ipcMain.handle('add-bookmark-folder', async () => {
  try {
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'New bookmark folder',
      message: 'Enter folder name',
      buttons: ['OK', 'Cancel'],
      defaultId: 0
    });
    if (result.response !== 0) return { success: false, message: 'Cancelled' };
    return { success: false, message: 'Use the bookmarks context menu' };
  } catch(e) {
    return { success: false, message: 'Error: ' + e.message };
  }
});

ipcMain.handle('import-bookmarks', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import bookmarks',
      filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'HTML', extensions: ['html', 'htm'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, message: 'Cancelled' };
    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    const store = readStorage();
    if (!store.bookmarks) store.bookmarks = [];
    let imported = 0;
    if (filePath.endsWith('.json')) {
      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : (data.bookmarks || data.children || []);
      items.forEach(item => {
        const url = item.url || item.href || item.link || '';
        if (!url) return;
        store.bookmarks.push({
          id: 'bm-' + Date.now() + '-' + imported,
          name: item.name || item.title || new URL(url.startsWith('http') ? url : 'https://' + url).hostname,
          url: url.startsWith('http') ? url : 'https://' + url,
          folder: item.folder || '',
          createdAt: Date.now()
        });
        imported++;
      });
    } else {
      const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
      let match;
      while ((match = linkRegex.exec(content)) !== null) {
        var bkName = match[2].trim();
        var bkUrl = match[1];
        try { if (!bkName) bkName = new URL(bkUrl).hostname; } catch(e) { bkName = bkUrl; }
        store.bookmarks.push({
          id: 'bm-' + Date.now() + '-' + imported,
          name: bkName,
          url: bkUrl,
          createdAt: Date.now()
        });
        imported++;
      }
    }
    writeStorage(store);
    return { success: true, message: `Imported ${imported} bookmarks` };
  } catch(e) {
    return { success: false, message: 'Import error: ' + e.message };
  }
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
ipcMain.handle('create-incognito-tab', (_, url) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('open-incognito-tab', url || '');
  }
  return { success: true };
});

// ============== PASSWORDS ==============
ipcMain.handle('get-passwords', () => {
  const store = readStorage();
  return store.passwords || [];
});

ipcMain.handle('add-password', (_, pw) => {
  const store = readStorage();
  const passwords = store.passwords || [];
  pw.id = 'pw-' + Date.now();
  pw.createdAt = Date.now();
  passwords.push(pw);
  store.passwords = passwords;
  writeStorage(store);
  return { success: true };
});

ipcMain.handle('update-password', (_, id, pwData) => {
  const store = readStorage();
  const passwords = store.passwords || [];
  const idx = passwords.findIndex(p => p.id === id);
  if (idx !== -1) {
    passwords[idx] = { ...passwords[idx], ...pwData };
    store.passwords = passwords;
    writeStorage(store);
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('delete-password', (_, id) => {
  const store = readStorage();
  const passwords = store.passwords || [];
  store.passwords = passwords.filter(p => p.id !== id);
  writeStorage(store);
  return { success: true };
});

ipcMain.handle('clear-passwords', () => {
  const store = readStorage();
  store.passwords = [];
  writeStorage(store);
  return { success: true };
});

// Alias for clear-passwords (Settings.html calls clearAllPasswords)
ipcMain.handle('clear-all-passwords', () => {
  const store = readStorage();
  store.passwords = [];
  writeStorage(store);
  return { success: true };
});

ipcMain.handle('toggle-password-favorite', (_, id, favorite) => {
  const store = readStorage();
  const passwords = store.passwords || [];
  const idx = passwords.findIndex(p => p.id === id);
  if (idx !== -1) {
    passwords[idx].favorite = favorite;
    store.passwords = passwords;
    writeStorage(store);
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('update-password-last-used', (_, id) => {
  const store = readStorage();
  const passwords = store.passwords || [];
  const idx = passwords.findIndex(p => p.id === id);
  if (idx !== -1) {
    passwords[idx].lastUsed = Date.now();
    store.passwords = passwords;
    writeStorage(store);
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('export-passwords', async () => {
  try {
    const store = readStorage();
    const passwords = (store.passwords || []).map(p => ({
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
    if (!store.passwords) store.passwords = [];
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
          store.passwords.push({
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
        store.passwords.push({
          id: 'pw-' + Date.now() + '-' + imported,
          site: p.site || p.url || '', username: p.username || '',
          password: p.password || '', notes: p.notes || '',
          totpSecret: p.totpSecret || '', createdAt: Date.now()
        });
        imported++;
      });
    }
    writeStorage(store);
    return { success: true, message: `Imported ${imported} passwords` };
  } catch(e) {
    return { success: false, message: 'Import error: ' + e.message };
  }
});

ipcMain.handle('check-breached', async () => {
  try {
    const store = readStorage();
    const passwords = store.passwords || [];
    let breachedCount = 0;
    for (const p of passwords) {
      const sha1 = crypto.createHash('sha1').update(p.password).digest('hex').toUpperCase();
      const prefix = sha1.substring(0, 5);
      const suffix = sha1.substring(5);
      const count = await new Promise((resolve) => {
        https.get('https://api.pwnedpasswords.com/range/' + prefix, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            const lines = body.split('\n');
            for (const line of lines) {
              const [hashSuffix, count] = line.trim().split(':');
              if (hashSuffix === suffix) { resolve(parseInt(count) || 0); return; }
            }
            resolve(0);
          });
        }).on('error', () => resolve(0));
      });
      if (count > 0) breachedCount++;
    }
    return { success: true, message: breachedCount > 0 ? `Found ${breachedCount} breaches` : 'No breaches found' };
  } catch(e) {
    return { success: false, message: 'Check error: ' + e.message };
  }
});

ipcMain.handle('security-analysis', () => {
  const store = readStorage();
  const passwords = store.passwords || [];
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
    if (!store.passwords) store.passwords = [];
    let imported = 0;
    const data = JSON.parse(content);
    const items = Array.isArray(data) ? data : (data.accounts || data.entries || []);
    items.forEach(item => {
      const secret = item.secret || item.otpSecret || '';
      const name = item.name || item.issuer || item.label || '';
      if (!name && !secret) return;
      store.passwords.push({
        id: 'pw-' + Date.now() + '-' + imported,
        site: name, username: item.email || '', password: '',
        notes: 'Import from Google Authenticator', totpSecret: secret,
        totpAlgorithm: item.algorithm || 'sha1', totpDigits: item.digits || 6,
        createdAt: Date.now()
      });
      imported++;
    });
    writeStorage(store);
    return { success: true, imported, errors: [] };
  } catch(e) {
    return { success: false, imported: 0, errors: ['Parse error: ' + e.message] };
  }
});

ipcMain.handle('import-txt-passwords', (_, content) => {
  try {
    const store = readStorage();
    if (!store.passwords) store.passwords = [];
    let imported = 0;
    const errors = [];
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const sep = line.includes('\t') ? '\t' : (line.includes('|') ? '|' : ',');
      const parts = line.split(sep).map(s => s.trim());
      if (parts.length >= 3 && parts[0]) {
        store.passwords.push({
          id: 'pw-' + Date.now() + '-' + imported,
          site: parts[0], username: parts[1], password: parts[2],
          notes: parts.slice(3).join(' ') || '', createdAt: Date.now()
        });
        imported++;
      } else if (parts.length >= 2 && parts[0]) {
        store.passwords.push({
          id: 'pw-' + Date.now() + '-' + imported,
          site: parts[0], username: '', password: parts[1],
          notes: '', createdAt: Date.now()
        });
        imported++;
      } else if (line) {
        errors.push(`Line ${idx + 1}: invalid format`);
      }
    });
    writeStorage(store);
    return { success: true, imported, errors };
  } catch(e) {
    return { success: false, imported: 0, errors: ['Error: ' + e.message] };
  }
});

ipcMain.handle('test-autofill', () => {
  if (mainWindow) {
    mainWindow.webContents.send('open-in-new-tab', 'https://httpbin.org/forms/post');
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
let masterPassword = null;

ipcMain.handle('has-master-password', () => {
  return { success: true, has: !!masterPassword };
});

ipcMain.handle('verify-master-password', (_, pw) => {
  return { success: true, valid: masterPassword === pw };
});

ipcMain.handle('set-master-password', (_, pw) => {
  if (!pw || pw.length < 4) {
    return { success: false, message: 'Password must be at least 4 characters' };
  }
  masterPassword = pw;
  return { success: true, message: 'Master password set' };
});

ipcMain.handle('change-master-password', (_, oldPw, newPw) => {
  if (masterPassword && oldPw !== masterPassword) {
    return { success: false, message: 'Wrong old password' };
  }
  if (!newPw || newPw.length < 4) {
    return { success: false, message: 'New password must be at least 4 characters' };
  }
  masterPassword = newPw;
  return { success: true, message: 'Master password changed' };
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
  const themesDir = getThemesDir();
  const themeDir = path.join(themesDir, themeId);
  return readThemeCss(themeDir);
});

// Delete a theme
ipcMain.handle('theme-delete', (_, themeId) => {
  try {
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

// ============== SINGLE PASSWORD BREACH CHECK ==============
ipcMain.handle('check-password-breached', (_, password) => {
  // Stub — real implementation would use HIBP API (k-anonymity)
  return { breached: false, count: 0 };
});

// ============== CHECK ALL PASSWORDS BREACHED ==============
ipcMain.handle('check-all-passwords-breached', () => {
  const store = readStorage();
  const passwords = store.passwords || [];
  return {
    success: true,
    breachedCount: 0,
    totalCount: passwords.length,
    results: passwords.map(p => ({ id: p.id, count: 0 }))
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

    var cleanedSecret = secret.replace(/\s/g, '').toUpperCase();
    var base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    var keyBytes = [];
    for (var i = 0; i < cleanedSecret.length; i += 8) {
      var chunk = cleanedSecret.slice(i, i + 8);
      var val = 0;
      for (var j = 0; j < chunk.length; j++) {
        var idx = base32Chars.indexOf(chunk[j]);
        if (idx < 0) continue;
        val = (val << 5) | idx;
      }
      for (var k = 2; k < 8; k++) {
        if (chunk.length >= k) {
          keyBytes.push((val >> (5 * (chunk.length - k))) & 0xFF);
        }
      }
    }
    if (keyBytes.length === 0) return { success: false, error: 'Invalid secret' };

    var buf = Buffer.alloc(8);
    for (var b = 7; b >= 0; b--) {
      buf[b] = timeCounter & 0xFF;
      timeCounter = Math.floor(timeCounter / 256);
    }

    var hmac = crypto.createHmac(algorithm.toLowerCase().replace('sha', 'sha'), Buffer.from(keyBytes));
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
    const pw = (store.passwords || []).find(p => p.id === id);
    if (!pw) return { success: false, error: 'Password not found' };
    if (mainWindow) {
      mainWindow.webContents.send('autofill-credentials', { username: pw.username, password: pw.password, site: pw.site || '' });
    }
    return { success: true, username: pw.username, password: pw.password };
  } catch(e) {
    return { success: false, error: 'Error: ' + e.message };
  }
});

ipcMain.handle('get-matching-passwords', (_, url) => {
  try {
    const store = readStorage();
    if (!url) return { success: true, passwords: store.passwords || [] };
    let targetHost;
    try { targetHost = new URL(url).hostname.replace(/^www\./, ''); } catch { targetHost = url; }
    const matches = (store.passwords || []).filter(p => {
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
    if (!store.passwords) store.passwords = [];
    let imported = 0;
    const data = JSON.parse(content);
    const items = Array.isArray(data) ? data : (data.accounts || data.entries || []);
    items.forEach(item => {
      const secret = item.secret || item.otpSecret || '';
      const name = item.name || item.issuer || item.label || '';
      if (!name && !secret) return;
      store.passwords.push({
        id: 'pw-' + Date.now() + '-' + imported,
        site: name, username: item.email || '', password: '',
        notes: 'Import from Google Authenticator', totpSecret: secret,
        totpAlgorithm: item.algorithm || 'sha1', totpDigits: item.digits || 6,
        createdAt: Date.now()
      });
      imported++;
    });
    writeStorage(store);
    return { success: true, imported, errors: [] };
  } catch(e) {
    return { success: false, imported: 0, errors: ['Error: ' + e.message] };
  }
});

ipcMain.handle('import-txt-file', (_, content) => {
  try {
    const store = readStorage();
    if (!store.passwords) store.passwords = [];
    let imported = 0;
    const errors = [];
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const sep = line.includes('\t') ? '\t' : (line.includes('|') ? '|' : ',');
      const parts = line.split(sep).map(s => s.trim());
      if (parts.length >= 2 && parts[0]) {
        store.passwords.push({
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
    writeStorage(store);
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

ipcMain.handle('register-system', () => {
  try {
    const exePath = electronApp.getPath('exe');
    const iconPath = path.join(path.dirname(exePath), 'resources', 'icon.png');
    if (process.platform === 'linux') {
      const desktopEntry = `[Desktop Entry]
Type=Application
Name=StartPOZI Browser
Comment=StartPOZI Desktop Browser
Exec="${exePath}" %u
Icon=${fs.existsSync(iconPath) ? iconPath : 'internet-web-browser'}
Terminal=false
Categories=Network;WebBrowser;
MimeType=x-scheme-handler/http;x-scheme-handler/https;text/html;
StartupNotify=true
`;
      const desktopDir = path.join(process.env.HOME || '/tmp', '.local', 'share', 'applications');
      if (!fs.existsSync(desktopDir)) fs.mkdirSync(desktopDir, { recursive: true });
      const desktopFile = path.join(desktopDir, 'startpozi-browser.desktop');
      fs.writeFileSync(desktopFile, desktopEntry, 'utf-8');
      try { execSync(`chmod +x "${desktopFile}"`); } catch {}
      try { execSync(`update-desktop-database "${desktopDir}" 2>/dev/null || true`); } catch {}
      try { execSync(`xdg-settings set default-web-browser startpozi-browser.desktop 2>/dev/null || true`); } catch {}
      return { success: true, message: 'Browser registered in the system' };
    }
    if (process.platform === 'win32') {
      const regEntries = [
        `reg add "HKCU\\Software\\Classes\\StartPOZI" /ve /d "URL:StartPOZI Protocol" /f`,
        `reg add "HKCU\\Software\\Classes\\StartPOZI" /v "URL Protocol" /d "" /f`,
        `reg add "HKCU\\Software\\Classes\\StartPOZI\\shell\\open\\command" /ve /d "\\"${exePath}\\" \\"%1\\"" /f`,
        `reg add "HKCU\\Software\\Classes\\.html\\OpenWithList\\StartPOZI" /ve /d "" /f`,
        `reg add "HKCU\\Software\\Clients\\StartMenuInternet\\StartPOZI" /ve /d "StartPOZI Browser" /f`,
        `reg add "HKCU\\Software\\Clients\\StartMenuInternet\\StartPOZI\\shell\\open\\command" /ve /d "\\"${exePath}\\"" /f`
      ];
      regEntries.forEach(cmd => { try { execSync(cmd, { windowsHide: true }); } catch {} });
      return { success: true, message: 'Browser registered in the system' };
    }
    return { success: false, message: 'Platform not supported' };
  } catch(e) {
    return { success: false, message: 'Registration error: ' + e.message };
  }
});

ipcMain.handle('unregister-system', () => {
  try {
    if (process.platform === 'linux') {
      const desktopFile = path.join(process.env.HOME || '/tmp', '.local', 'share', 'applications', 'startpozi-browser.desktop');
      if (fs.existsSync(desktopFile)) {
        fs.unlinkSync(desktopFile);
        const desktopDir = path.dirname(desktopFile);
        try { execSync(`update-desktop-database "${desktopDir}" 2>/dev/null || true`); } catch {}
      }
      return { success: true, message: 'Registration removed' };
    }
    if (process.platform === 'win32') {
      const cmds = [
        `reg delete "HKCU\\Software\\Classes\\StartPOZI" /f`,
        `reg delete "HKCU\\Software\\Clients\\StartMenuInternet\\StartPOZI" /f`
      ];
      cmds.forEach(cmd => { try { execSync(cmd, { windowsHide: true }); } catch {} });
      return { success: true, message: 'Registration removed' };
    }
    return { success: false, message: 'Platform not supported' };
  } catch(e) {
    return { success: false, message: 'Removal error: ' + e.message };
  }
});

ipcMain.handle('check-registration', () => {
  try {
    if (process.platform === 'linux') {
      const desktopFile = path.join(process.env.HOME || '/tmp', '.local', 'share', 'applications', 'startpozi-browser.desktop');
      const registered = fs.existsSync(desktopFile);
      return { success: true, registered, message: registered ? 'Browser registered in the system' : 'Browser not registered in the system' };
    }
    if (process.platform === 'win32') {
      try {
        execSync('reg query "HKCU\\Software\\Classes\\StartPOZI"', { windowsHide: true });
        return { success: true, registered: true, message: 'Browser registered in the system' };
      } catch {
        return { success: true, registered: false, message: 'Browser not registered in the system' };
      }
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
    const client = url.startsWith('https') ? https : http;
    return new Promise((resolve) => {
      const fs = require('fs');
      const file = fs.createWriteStream(result.filePath);
      var redirectCount = 0;
      function doGet(u) {
        client.get(u, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
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

ipcMain.handle('open-url-from-settings', (_, url) => {
  if (mainWindow) {
    if (url === 'startpozi://customize-toolbar') {
      mainWindow.webContents.send('toggle-customize-mode');
    } else {
      mainWindow.webContents.send('open-in-new-tab', url);
    }
  }
  return { success: true };
});

ipcMain.on('open-in-current-tab', (_, url) => {
  if (mainWindow) {
    mainWindow.webContents.send('navigate-current-tab', url);
  }
});

ipcMain.on('go-back', () => {
  if (mainWindow) {
    mainWindow.webContents.send('navigate-current-back');
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
  if (params.type === 'tabbar') {
    var template = [];

    if (params.tabId) {
      template.push({ label: t('Close tab'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'closeTab', tabId: params.tabId }); } });
      template.push({ label: t('Close other tabs'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'closeOtherTabs', tabId: params.tabId }); } });
      template.push({ label: t('Close tabs to the right'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'closeTabsToRight', tabId: params.tabId }); } });
      if (params.tabUrl) {
        try {
          var tabDomain = new URL(params.tabUrl).hostname;
          template.push({ label: t('Close tabs from this domain'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'closeTabsFromDomain', domain: tabDomain }); } });
        } catch(e) {}
        template.push({ label: t('Copy address'), click: function() { clipboard.writeText(params.tabUrl); } });
        template.push({ label: t('Duplicate tab'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'duplicateTab' }); } });
        template.push({ label: t('Open in incognito'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'openIncognito', url: params.tabUrl }); } });
      }
      template.push({ label: params.tabPinned ? t('Unpin tab') : t('Pin tab'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'pinTab', tabId: params.tabId, pinned: !params.tabPinned }); } });
      template.push({ label: t('Put tab to sleep'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'sleepTab', tabId: params.tabId }); } });
      try {
        var _opt = readStorage().optimization || {};
        if (_opt.sleepOthersEnabled) {
          template.push({ label: t('Put all others to sleep'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'sleepOthers' }); } });
        }
      } catch(e) {}
      template.push({ label: t('Close after…'), submenu: [
        { label: t('5 min'),  click: function() { mainWindow.webContents.send('context-menu-action', { type: 'closeAfter', tabId: params.tabId, minutes: 5 }); } },
        { label: t('15 min'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'closeAfter', tabId: params.tabId, minutes: 15 }); } },
        { label: t('30 min'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'closeAfter', tabId: params.tabId, minutes: 30 }); } },
        { label: t('60 min'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'closeAfter', tabId: params.tabId, minutes: 60 }); } },
        { label: t('2 hours'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'closeAfter', tabId: params.tabId, minutes: 120 }); } },
        { type: 'separator' },
        { label: t('Cancel timer'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'closeAfterCancel', tabId: params.tabId }); } }
      ] });

      if (params.tabGroups && params.tabGroups.length > 0) {
        template.push({ type: 'separator' });
        template.push({ label: t('Add to group'), submenu: params.tabGroups.map(function(g) {
          return { label: g.name, click: function() { mainWindow.webContents.send('context-menu-action', { type: 'addToGroup', tabId: params.tabId, groupId: g.id }); } };
        }) });
        template.push({ label: t('New group...'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'createGroup', tabId: params.tabId }); } });
        if (params.tabGroupId) {
          template.push({ label: t('Remove from group'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'removeFromGroup', tabId: params.tabId, groupId: params.tabGroupId }); } });
          template.push({ label: t('Color group'), submenu: [
            { label: t('Blue'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'colorGroup', groupId: params.tabGroupId, color: '#4a90d9' }); } },
            { label: t('Red'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'colorGroup', groupId: params.tabGroupId, color: '#e74c3c' }); } },
            { label: t('Green'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'colorGroup', groupId: params.tabGroupId, color: '#2ecc71' }); } },
            { label: t('Orange'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'colorGroup', groupId: params.tabGroupId, color: '#f39c12' }); } },
            { label: t('Purple'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'colorGroup', groupId: params.tabGroupId, color: '#9b59b6' }); } },
            { label: t('Pink'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'colorGroup', groupId: params.tabGroupId, color: '#e91e90' }); } },
            { label: t('Teal'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'colorGroup', groupId: params.tabGroupId, color: '#1abc9c' }); } },
          ] });
          template.push({ label: t('Delete group'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'deleteGroup', groupId: params.tabGroupId }); } });
        }
      } else {
        template.push({ label: t('Create group'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'createGroup', tabId: params.tabId }); } });
      }

      template.push({ type: 'separator' });
    }

    template.push({ label: t('Reload all tabs'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'reloadAllTabs' }); } });
    template.push({ label: t('New tab'), click: function() { mainWindow.webContents.send('open-in-new-tab', ''); } });
    template.push({ type: 'separator' });

    if (params.closedTabs && params.closedTabs.length > 0) {
      params.closedTabs.forEach(function(item, idx) {
        template.push({ label: '\u21A9 ' + item.title, click: function() { mainWindow.webContents.send('context-menu-action', { type: 'reopenTab', url: item.url, index: idx }); } });
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
    template.push({ label: t('Paste'), accelerator: 'CmdOrCtrl+V', click: function() { mainWindow.webContents.paste(); } });
    template.push({ label: t('Paste and go'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'pasteAndGo' }); } });
    template.push({ label: t('Select all'), accelerator: 'CmdOrCtrl+A', click: function() { mainWindow.webContents.selectAll(); } });
    var menu = Menu.buildFromTemplate(template);
    menu.popup({ window: mainWindow });
    return;
  }

  var template = [];

  if (params.misspelledWord && params.dictionarySuggestions && params.dictionarySuggestions.length > 0) {
    params.dictionarySuggestions.forEach(function(s) {
      template.push({ label: s, click: function() { event.sender.send('context-menu-action', { type: 'replaceMisspelling', text: s }); } });
    });
    template.push({ type: 'separator' });
  }

  if (params.linkURL) {
    template.push({ label: t('Open link in new tab'), click: function() { mainWindow.webContents.send('open-in-new-tab', params.linkURL); } });
    template.push({ label: t('Open in system browser'), click: function() { shell.openExternal(params.linkURL); } });
    template.push({ type: 'separator' });
    template.push({ label: t('Copy link address'), click: function() { clipboard.writeText(params.linkURL); } });
    if (params.linkText) {
      template.push({ label: t('Copy link text'), click: function() { clipboard.writeText(params.linkText); } });
    }
    template.push({ type: 'separator' });
    template.push({ label: t('Open in incognito'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'openIncognito', url: params.linkURL }); } });
  }

  if (params.mediaType === 'image' && params.hasImageContents && params.srcURL) {
    template.push({ label: t('Open image'), click: function() { mainWindow.webContents.send('open-in-new-tab', params.srcURL); } });
    template.push({ label: t('Copy image'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'copyImage', url: params.srcURL }); } });
    template.push({ label: t('Copy image address'), click: function() { clipboard.writeText(params.srcURL); } });
    template.push({ label: t('Save image as...'), click: function() {
      var parsed = require('url').parse(params.srcURL);
      var filename = path.basename(parsed.pathname || 'image').split('?')[0] || 'image.png';
      dialog.showSaveDialog(mainWindow, { defaultPath: filename }).then(function(result) {
        if (!result.canceled && result.filePath) {
          var client = params.srcURL.startsWith('https') ? require('https') : require('http');
          client.get(params.srcURL, function(response) {
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
    template.push({ label: t('Play / Pause'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'mediaPlayPause' }); } });
    template.push({ label: t('Mute'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'mediaMute' }); } });
    template.push({ label: t('Copy address'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'copyMediaUrl', url: params.srcURL }); } });
    if (params.mediaType === 'video') {
      template.push({ label: t('Picture in picture'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'mediaPiP' }); } });
    }
    template.push({ type: 'separator' });
  }

  if (params.editFlags && params.editFlags.canCut) {
    template.push({ label: t('Cut'), accelerator: 'CmdOrCtrl+X', click: function() { mainWindow.webContents.send('context-menu-action', { type: 'cut' }); } });
  }
  if (params.editFlags && params.editFlags.canCopy) {
    template.push({ label: t('Copy'), accelerator: 'CmdOrCtrl+C', click: function() { mainWindow.webContents.send('context-menu-action', { type: 'copy' }); } });
  }
  if (params.editFlags && params.editFlags.canPaste) {
    template.push({ label: t('Paste'), accelerator: 'CmdOrCtrl+V', click: function() { mainWindow.webContents.send('context-menu-action', { type: 'paste' }); } });
  }
  if (params.editFlags && params.editFlags.canUndo) {
    template.push({ label: t('Undo'), accelerator: 'CmdOrCtrl+Z', click: function() { mainWindow.webContents.send('context-menu-action', { type: 'undo' }); } });
  }
  if (params.editFlags && params.editFlags.canRedo) {
    template.push({ label: t('Redo'), accelerator: 'CmdOrCtrl+Y', click: function() { mainWindow.webContents.send('context-menu-action', { type: 'redo' }); } });
  }
  if (params.isEditable) {
    template.push({ label: t('Select all'), accelerator: 'CmdOrCtrl+A', click: function() { mainWindow.webContents.send('context-menu-action', { type: 'selectAll' }); } });
  }

  if (params.selectionText) {
    var store = readStorage();
    var searchUrl = store.searchEngine || 'https://startpozi.netlify.app/search.html?q=';
    var searchName = getSearchEngineName(searchUrl);
    template.push({ label: t('Copy selection'), accelerator: 'CmdOrCtrl+C', click: function() { clipboard.writeText(params.selectionText); } });
    template.push({ label: t('Search in') + ' ' + searchName, click: function() {
      mainWindow.webContents.send('open-in-new-tab', searchUrl + encodeURIComponent(params.selectionText));
    }});
  }

  if (template.length > 0 && template[template.length - 1].type === 'separator') {
    template.pop();
  }

  template.push({ type: 'separator' });
  template.push({ label: t('Back'), accelerator: 'Alt+Left', click: function() { mainWindow.webContents.send('context-menu-action', { type: 'goBack' }); } });
  template.push({ label: t('Forward'), accelerator: 'Alt+Right', click: function() { mainWindow.webContents.send('context-menu-action', { type: 'goForward' }); } });
  template.push({ label: t('Reload'), accelerator: 'CmdOrCtrl+R', click: function() { mainWindow.webContents.send('context-menu-action', { type: 'reload' }); } });
  template.push({ label: t('Open page in incognito'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'openIncognitoPage' }); } });
  template.push({ type: 'separator' });

  template.push({ label: t('View page source'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'viewSource' }); } });
  template.push({ label: t('Element inspector'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'inspectElement', x: params.x, y: params.y }); } });
  template.push({ label: t('Developer tools'), accelerator: 'F12', click: function() { mainWindow.webContents.send('context-menu-action', { type: 'toggleDevTools' }); } });
  template.push({ type: 'separator' });

  template.push({ label: t('Screenshot tool (with annotations)'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'screenshotTool' }); } });
  template.push({ label: t('Print...'), accelerator: 'CmdOrCtrl+P', click: function() { mainWindow.webContents.send('context-menu-action', { type: 'print' }); } });

  var zoomSubmenu = [
    { label: t('Zoom in'), accelerator: 'CmdOrCtrl++', click: function() { mainWindow.webContents.send('context-menu-action', { type: 'zoomIn' }); } },
    { label: t('Zoom out'), accelerator: 'CmdOrCtrl+-', click: function() { mainWindow.webContents.send('context-menu-action', { type: 'zoomOut' }); } },
    { label: t('Reset'), accelerator: 'CmdOrCtrl+0', click: function() { mainWindow.webContents.send('context-menu-action', { type: 'zoomReset' }); } },
  ];
  template.push({ label: t('Zoom'), submenu: zoomSubmenu });

  template.push({ type: 'separator' });
  template.push({ label: t('Translate page'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'translate' }); } });
  template.push({ label: t('Page QR code'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'qrPage' }); } });
  template.push({ type: 'separator' });
  template.push({ label: t('Eyedropper (Color Picker)'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'colorPicker' }); } });
  template.push({ label: t('Reader mode'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'readerMode' }); } });
  {
    var _zstore = readStorage();
    var _zenabled = _zstore.elementZapperEnabled !== false;
    if (_zenabled) {
      template.push({ label: t('Hide element (Zapper)'), click: function() { mainWindow.webContents.send('context-menu-action', { type: 'elementZapper' }); } });
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

ipcMain.on('context-menu-open-tab', (_, url) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('open-in-new-tab', url);
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
const archiver = require('archiver');
const extractZip = require('extract-zip');

function _gatherBackupData() {
  const store = readStorage();
  var data = {};
  data.metadata = {
    version: electronApp.getVersion(),
    date: new Date().toISOString(),
    platform: process.platform
  };
  data.settings = store;
  if (store.history) data.history = store.history;
  if (store.scripts) data.scripts = store.scripts;
  if (store.bookmarks) data.bookmarks = store.bookmarks;
  if (store.passwords) data.passwords = store.passwords;
  if (store.security) data.security = store.security;
  if (store.siteThemes) data.siteThemes = store.siteThemes;
  if (store.blockedLog) data.blockedLog = store.blockedLog;
  if (store.sponsorBlockStats) data.sponsorblock = store.sponsorBlockStats;
  if (store.customization) data.customization = store.customization;
  if (store.profiles) data.profiles = store.profiles;
  return data;
}

function _encryptBuffer(buf, password) {
  var crypto2 = require('crypto');
  var key = crypto2.scryptSync(password, 'startpozi-backup-salt', 32);
  var iv = crypto2.randomBytes(16);
  var cipher = crypto2.createCipheriv('aes-256-cbc', key, iv);
  var encrypted = Buffer.concat([iv, cipher.update(buf), cipher.final()]);
  return encrypted;
}

function _decryptBuffer(buf, password) {
  var crypto2 = require('crypto');
  var key = crypto2.scryptSync(password, 'startpozi-backup-salt', 32);
  var iv = buf.slice(0, 16);
  var data = buf.slice(16);
  var decipher = crypto2.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

ipcMain.handle('backup-export', async (_, usePassword, password) => {
  try {
    var result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export backup',
      defaultPath: 'startpozi-backup-' + new Date().toISOString().slice(0,10) + '.spzi',
      filters: [{ name: 'StartPOZI Backup', extensions: ['spzi'] }]
    });
    if (result.canceled) return { success: false, message: 'Cancelled' };

    var data = _gatherBackupData();
    var jsonBuf = Buffer.from(JSON.stringify(data, null, 2), 'utf8');

    var tmpDir = path.join(electronApp.getPath('temp'), 'spzi-export-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    var manifest = { encrypted: !!usePassword, version: data.metadata.version, date: data.metadata.date };
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(manifest));

    var dataToWrite = usePassword ? _encryptBuffer(jsonBuf, password) : jsonBuf;
    fs.writeFileSync(path.join(tmpDir, 'data.bin'), dataToWrite);

    await new Promise(function(resolve, reject) {
      var output = fs.createWriteStream(result.filePath);
      var archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', function() { resolve(); });
      output.on('error', function(err) { reject(err); });
      archive.on('error', function(err) { reject(err); });
      archive.pipe(output);
      archive.directory(tmpDir, false);
      archive.finalize();
    });

    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}

    return { success: true, path: result.filePath, size: fs.statSync(result.filePath).size };
  } catch(e) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('backup-import', async (_, filePath, password, options) => {
  try {
    var tmpDir = path.join(electronApp.getPath('temp'), 'spzi-import-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    await extractZip(filePath, { dir: tmpDir });

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
    if (options.passwords && data.passwords) store.passwords = data.passwords;
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
    await extractZip(filePath, { dir: tmpDir });
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
    var data = _gatherBackupData();
    var jsonBuf = Buffer.from(JSON.stringify(data), 'utf8');
    var tmpDir = path.join(electronApp.getPath('temp'), 'spzi-auto-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });
    var manifest = { encrypted: false, version: data.metadata.version, date: data.metadata.date };
    fs.writeFileSync(path.join(tmpDir, 'manifest.json'), JSON.stringify(manifest));
    fs.writeFileSync(path.join(tmpDir, 'data.bin'), jsonBuf);
    await new Promise(function(resolve, reject) {
      var output = fs.createWriteStream(filePath);
      var archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', resolve);
      output.on('error', reject);
      archive.on('error', reject);
      archive.pipe(output);
      archive.directory(tmpDir, false);
      archive.finalize();
    });
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch(e) {}
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
var _proxySettings = { enabled: false, type: 'http', host: '', port: '', bridges: '' };
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

// Current proxy-URL (single source of truth for all sessions)
function _proxyUrl() {
  if (!_proxySettings.enabled) return null;
  // Host/port NOT hardcoded — Tor can listen anywhere:
  //   127.0.0.1:9050 (standard `tor`)
  //   127.0.0.1:9150 (Tor Browser Bundle)
  //   any custom port via SocksPort in torrc
  //   unix socket (SocksPort unix:/path)
  //   remote machine on the LAN
  // The user specifies host/port in settings.
  if (!_proxySettings.host) return null;
  var ptype = _proxySettings.type === 'tor' ? 'socks5' : _proxySettings.type;
  var url = ptype + '://' + _proxySettings.host;
  if (_proxySettings.port) url += ':' + _proxySettings.port;
  return url;
}

// Applies the proxy to ONE session
function _applyProxyToSessionObj(ses) {
  if (!ses) return Promise.resolve();
  var url = _proxyUrl();
  if (url) {
    return ses.setProxy({ proxyRules: url }).then(function() {
      try { ses.closeAllConnections(); } catch(e) {}
    }).catch(function() {});
  } else {
    return ses.setProxy({ mode: 'direct' }).then(function() {
      try { ses.closeAllConnections(); } catch(e) {}
    }).catch(function() {});
  }
}

// Applies the proxy to ALL sessions: default + main window + all webviews + incognito.
// Without this Tor/proxy only worked for the browser UI, but NOT for the loaded sites
// (webview tags use separate partition-sessions).
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
  if (!ses || !_proxyUrl()) return;
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
    if (_torProcess) { resolve({ running: true, bootstrap: _torBootstrap }); return; }
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

    _torProcess.stdout.on('data', function(data) {
      var msg = data.toString();
      // Parse bootstrap progress: "Bootstrapped 45% (done): Loading relay descriptors"
      var m = msg.match(/Bootstrapped (\d+)%/);
      if (m) _broadcastTorProgress(parseInt(m[1], 10));

      if (_torBootstrap >= 100 && !started) {
        started = true;
        resolve({ running: true, bootstrap: 100 });
      }
      // "Bootstrapped 100%" — ready
      if (!started && msg.indexOf('Bootstrapped 100%') >= 0) {
        started = true;
        _broadcastTorProgress(100);
        resolve({ running: true, bootstrap: 100 });
      }
    });
    _torProcess.stderr.on('data', function(data) {
      var msg = data.toString();
      // Common errors
      if (!started && msg.indexOf('Could not bind') >= 0) {
        started = true;
        reject(new Error('Port ' + _torPort + ' is busy. Tor may already be running elsewhere.'));
      }
      if (!started && msg.indexOf('Error') >= 0 && msg.indexOf('obfs4proxy') >= 0) {
        started = true;
        reject(new Error('obfs4proxy not found. Install: sudo apt install obfs4proxy (Linux) / brew install obfs4proxy (macOS).'));
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
    // Timeout: with bridges Tor connects slower (up to 1-2 minutes). We give 30s.
    setTimeout(function() {
      if (!started) {
        started = true;
        resolve({ running: !!_torProcess, bootstrap: _torBootstrap });
      }
    }, 30000);
  });
}

function stopTor() {
  if (_torProcess) {
    try { _torProcess.kill(); } catch(e) {}
    _torProcess = null;
    _torBootstrap = 0;
  }
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

// Synchronously search for the tor binary path via which/where.
// Returns path (string) or null.
function _findTorBinarySync() {
  if (process.platform === 'win32') {
    try { return execSync('where tor.exe', {encoding: 'utf8', stdio: ['ignore','pipe','ignore']}).split(/\r?\n/)[0].trim() || null; } catch(e) {}
    return null;
  }
  try {
    var p = execSync('which tor', {encoding: 'utf8', stdio: ['ignore','pipe','ignore']}).trim();
    return p || null;
  } catch(e) { return null; }
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
  });
}

// Full auto-detect: find binary + scan ports + read torrc for bridges.
// Returns { binary, host, port, bridges, transports } or null.
async function _detectTorAuto() {
  var binary = _findTorBinarySync();
  var host = '127.0.0.1';
  // 1) Standard Tor SOCKS ports in order of usage frequency
  var stdPorts = [9050, 9150, 9060, 9070, 9080, 9100, 9150, 39050, 39060];
  // 2) All listening local ports via ss/netstat
  var systemPorts = _getLocalListeningPortsSync();
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
  var torrcInfo = _readBridgesFromTorrc();
  var transports = _detectPluggableTransports();
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
function _getLocalListeningPortsSync() {
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
  // Linux: ss
  if (process.platform !== 'win32') {
    try { tryParse(execSync('ss -tlnH 2>/dev/null', {encoding: 'utf8', stdio: ['ignore','pipe','ignore'], timeout: 1500})); } catch(e) {}
    // macOS / fallback netstat
    if (out.length === 0) {
      try { tryParse(execSync('netstat -an -p tcp 2>/dev/null | grep -i LISTEN', {encoding: 'utf8', stdio: ['ignore','pipe','ignore'], timeout: 1500})); } catch(e) {}
    }
  } else {
    // Windows
    try { tryParse(execSync('netstat -an -p tcp | findstr LISTENING', {encoding: 'utf8', stdio: ['ignore','pipe','ignore'], timeout: 1500})); } catch(e) {}
  }
  return out;
}

// Reads the user's torrc and extracts already configured bridges.
// Returns { bridges: string[], useBridges: bool, pathsChecked: string[] }.
function _readBridgesFromTorrc() {
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
    var pgrepOut = execSync('pgrep -a tor 2>/dev/null || ps aux | grep -E "[t]or " 2>/dev/null', {encoding: 'utf8', stdio: ['ignore','pipe','ignore'], timeout: 1500});
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

  function tryRead(p) {
    pathsChecked.push(p);
    try {
      if (p.indexOf('*') !== -1) {
        // Glob path — expand manually via ls/sh (for TBB tor-browser_*)
        try {
          var ls = execSync('ls -1 ' + p.replace(/\s/g, '\\ ') + ' 2>/dev/null', {encoding: 'utf8', stdio: ['ignore','pipe','ignore'], timeout: 1500});
          ls.split(/\r?\n/).forEach(function(rp) {
            rp = rp.trim();
            if (!rp) return;
            try {
              if (fs.existsSync(rp)) parseText(fs.readFileSync(rp, 'utf8'));
            } catch(e) {}
          });
        } catch(e) {}
        return;
      }
      if (!fs.existsSync(p)) return;
      parseText(fs.readFileSync(p, 'utf8'));
    } catch(e) {}
  }

  paths.forEach(tryRead);
  statePaths.forEach(tryRead);

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
function _detectPluggableTransports() {
  var found = {};
  function tryWhich(name) {
    try {
      var cmd = process.platform === 'win32' ? ('where ' + name + '.exe') : ('which ' + name);
      var p = execSync(cmd, {encoding: 'utf8', stdio: ['ignore','pipe','ignore'], timeout: 1000}).trim();
      return p || null;
    } catch(e) { return null; }
  }
  found.obfs4 = tryWhich('obfs4proxy');
  found.snowflake = tryWhich('snowflake-client');
  return found;
}

// Apply auto-detected Tor: save to proxy.json + apply to sessions.
// Returns true if the proxy was applied.
async function _autoApplyTorIfNeeded() {
  // If the user already configured the proxy manually — do not interfere
  if (_proxySettings && _proxySettings.enabled && _proxySettings.host) return false;
  try {
    var info = await _detectTorAuto();
    if (!info) { _torDetectedInfo = null; return false; }
    _torDetectedInfo = info;
    if (!info.host || !info.port) {
      // Binary exists, but Tor is not running — do not apply, but remember
      return false;
    }
    // Save to proxy.json
    var newSettings = {
      enabled: true,
      type: 'socks5',
      host: info.host,
      port: String(info.port),
      bridges: ''
    };
    _proxySettings = newSettings;
    try { fs.writeFileSync(_proxyConfigPath, JSON.stringify(_proxySettings)); } catch(e) {}
    applyProxyToSession();
    return true;
  } catch(e) { return false; }
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

app.on('before-quit', function() {
  stopTor();
  try {
    var s = readStorage();
    if (s.autoBackup) {
      var data = _gatherBackupData();
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

ipcMain.handle('set-proxy-settings', function(_, settings) {
  _proxySettings = {
    enabled: !!settings.enabled,
    type: settings.type || 'http',
    host: (settings.host || '').trim(),
    port: (settings.port || '').trim(),
    bridges: settings.bridges || ''
  };
  try { fs.writeFileSync(_proxyConfigPath, JSON.stringify(_proxySettings)); } catch(e) {}
  applyProxyToSession();
  return { success: true };
});

ipcMain.handle('tor-start', function(_, settings) {
  _proxySettings.bridges = settings.bridges || '';
  // Persist bridges to proxy.json so they are not lost on restart
  try { fs.writeFileSync(_proxyConfigPath, JSON.stringify(_proxySettings)); } catch(e) {}
  return startTor(_proxySettings.bridges);
});

ipcMain.handle('tor-stop', function() {
  stopTor();
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

ipcMain.handle('translate-text', async function(_, text, from, to) {
  try {
    var sl = from || 'auto';
    var tl = to || 'en';
    var url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=' + sl + '&tl=' + tl + '&dt=t&q=' + encodeURIComponent(text);
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
  return { bindings: _keyBindings, defaults: _defaultKeybindings(), actions: _keybindingActions };
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
  if (!Array.isArray(store.elementHidingRules[domain])) store.elementHidingRules[domain] = [];
  if (store.elementHidingRules[domain].indexOf(data.selector) === -1) {
    store.elementHidingRules[domain].push(data.selector);
    writeStorage(store);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('element-hiding-updated', { domain: domain, selector: data.selector, added: true });
  }
});

// ============== EXPORT / IMPORT ALL SETTINGS (JSON) ==============
ipcMain.handle('settings-export-json', async function() {
  try {
    var store = readStorage();
    var payload = {
      _type: 'startpozi-settings-export',
      _version: 2,
      _exportedAt: new Date().toISOString(),
      store: store
    };
    var result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export all settings',
      defaultPath: 'startpozi-settings-' + new Date().toISOString().slice(0, 10) + '.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { success: true, path: result.filePath };
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
