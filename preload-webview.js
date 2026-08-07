const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Real Chromium version in this Electron build. CRITICAL for Google sign-in:
// the Chrome version in the spoofed navigator.userAgent / userAgentData must
// match the real engine, otherwise Google detects the mismatch and blocks sign-in.
var _chromeFullVer = (process.versions && process.versions.chrome) || '148.0.7778.96';
var _chromeMajorVer = _chromeFullVer.split('.')[0];

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Window controls
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  onMaximizeChange: (callback) => {
    ipcRenderer.on('maximize-change', (_, isMaximized) => callback(isMaximized));
  },

  // New tab from main process
  onOpenInNewTab: (callback) => {
    ipcRenderer.on('open-in-new-tab', (_, url) => callback(url));
  },

  // Theme
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  getWindowOpacity: () => ipcRenderer.invoke('get-window-opacity'),
  setWindowOpacity: (opacity) => ipcRenderer.invoke('set-window-opacity', opacity),
  getTranslucentMode: () => ipcRenderer.invoke('get-translucent-mode'),
  setTranslucentMode: (on) => ipcRenderer.invoke('set-translucent-mode', on),
  onThemeUpdated: (callback) => {
    ipcRenderer.on('theme-updated', (_, theme) => callback(theme));
  },

  // Language (i18n)
  getLanguage: () => ipcRenderer.invoke('get-language'),
  setLanguage: (l) => ipcRenderer.invoke('set-language', l),
  getLocale: (l) => ipcRenderer.invoke('get-locale', l),
  onLanguageChanged: (callback) => {
    ipcRenderer.on('language-changed', (_, lang) => callback(lang));
  },

  // Search Engine
  getSearchEngine: () => ipcRenderer.invoke('get-search-engine'),
  setSearchEngine: (url) => ipcRenderer.invoke('set-search-engine', url),

  // Startup
  getSaveTabs: () => ipcRenderer.invoke('get-save-tabs'),
  setSaveTabs: (val) => ipcRenderer.invoke('set-save-tabs', val),
  getSaveInternalPages: () => ipcRenderer.invoke('get-save-internal-pages'),
  setSaveInternalPages: (val) => ipcRenderer.invoke('set-save-internal-pages', val),

  // SponsorBlock
  getSponsorBlockEnabled: () => ipcRenderer.invoke('get-sponsorblock-enabled'),
  setSponsorBlockEnabled: (val) => ipcRenderer.invoke('set-sponsorblock-enabled', val),
  getSponsorBlockStats: () => ipcRenderer.invoke('get-sponsorblock-stats'),
  updateSponsorBlockStats: (data) => ipcRenderer.invoke('update-sponsorblock-stats', data),

  // Custom filters
  getCustomFilters: () => ipcRenderer.invoke('get-custom-filters'),
  saveCustomFilters: (text) => ipcRenderer.invoke('save-custom-filters', text),

  // Filter lists
  getFilterLists: () => ipcRenderer.invoke('get-filter-lists'),
  addFilterList: (url) => ipcRenderer.invoke('add-filter-list', url),
  removeFilterList: (url) => ipcRenderer.invoke('remove-filter-list', url),
  updateFilterLists: () => ipcRenderer.invoke('update-filter-lists'),

  // Custom hide styles
  getCustomHideStyles: () => ipcRenderer.invoke('get-custom-hide-styles'),
  saveCustomHideStyles: (text) => ipcRenderer.invoke('save-custom-hide-styles', text),

  // Blocked log
  getBlockedLog: () => ipcRenderer.invoke('get-blocked-log'),
  clearBlockedLog: () => ipcRenderer.invoke('clear-blocked-log'),

  // Security settings
  getSecuritySetting: (key) => ipcRenderer.invoke('get-security-setting', key),
  setSecuritySetting: (key, val) => ipcRenderer.invoke('set-security-setting', key, val),
  getAllSecuritySettings: () => ipcRenderer.invoke('get-all-security-settings'),
  cleanUrl: (url) => ipcRenderer.invoke('clean-url', url),

  // First-launch setup
  isFirstLaunch: () => ipcRenderer.invoke('is-first-launch'),
  markWelcomed: () => ipcRenderer.invoke('mark-welcomed'),
  completeSetup: (settings) => ipcRenderer.invoke('complete-setup', settings),

  // Optimization settings
  getOptimizationSetting: (key) => ipcRenderer.invoke('get-optimization-setting', key),
  setOptimizationSetting: (key, val) => ipcRenderer.invoke('set-optimization-setting', key, val),
  getAllOptimizationSettings: () => ipcRenderer.invoke('get-all-optimization-settings'),

  // Task Manager
  getTaskManagerData: () => ipcRenderer.invoke('get-task-manager-data'),
  taskManagerAction: (action, tabId) => ipcRenderer.send('task-manager-action', action, tabId),
  sleepAllTabs: () => ipcRenderer.send('optimization-sleep-all'),

  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  addHistory: (entry) => ipcRenderer.invoke('add-history', entry),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  onHistoryUpdated: (callback) => {
    ipcRenderer.on('history-updated', () => callback());
  },

  // Downloads
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  setDownloadPath: () => ipcRenderer.invoke('set-download-path'),
  getCurrentDownloadPath: () => ipcRenderer.invoke('get-current-download-path'),
  openDownloadFile: (filePath) => ipcRenderer.invoke('open-download-file', filePath),
  openDownloadFolder: (filePath) => ipcRenderer.invoke('open-download-folder', filePath),
  checkFilesExist: (paths) => ipcRenderer.invoke('check-files-exist', paths),
  clearDownloads: () => ipcRenderer.invoke('clear-downloads'),
  onDownloadsUpdated: (callback) => {
    ipcRenderer.on('downloads-updated', () => callback());
  },
  onDownloadStarted: (callback) => {
    ipcRenderer.on('download-started', (_, info) => callback(info));
  },
  onDownloadProgress: (callback) => {
    ipcRenderer.on('download-progress', (_, info) => callback(info));
  },

  getScreenshotPath: () => ipcRenderer.invoke('get-screenshot-path'),
  setScreenshotPath: () => ipcRenderer.invoke('set-screenshot-path'),
  clearScreenshotPath: () => ipcRenderer.invoke('clear-screenshot-path'),
  getDataPath: () => ipcRenderer.invoke('get-data-path'),
  chooseDataPath: () => ipcRenderer.invoke('choose-data-path'),
  migrateDataPath: (newPath) => ipcRenderer.invoke('migrate-data-path', newPath),

  backupExport: (usePassword, password) => ipcRenderer.invoke('backup-export', usePassword, password),
  backupImport: (filePath, password, options) => ipcRenderer.invoke('backup-import', filePath, password, options),
  backupChooseImport: () => ipcRenderer.invoke('backup-choose-import'),
  backupCheckFile: (filePath) => ipcRenderer.invoke('backup-check-file', filePath),
  getBackupSettings: () => ipcRenderer.invoke('get-backup-settings'),
  setBackupSettings: (settings) => ipcRenderer.invoke('set-backup-settings', settings),
  backupAuto: () => ipcRenderer.invoke('backup-auto'),

  // User Scripts
  getScripts: () => ipcRenderer.invoke('get-scripts'),
  saveScript: (script) => ipcRenderer.invoke('save-script', script),
  deleteScript: (id) => ipcRenderer.invoke('delete-script', id),
  toggleScript: (id, enabled) => ipcRenderer.invoke('toggle-script', id, enabled),

  // Customization
  getCustomizationSettings: () => ipcRenderer.invoke('get-customization-settings'),
  saveCustomizationSettings: (settings) => ipcRenderer.invoke('save-customization-settings', settings),
  onCustomizationUpdated: (callback) => {
    ipcRenderer.on('customization-updated', (_, settings) => callback(settings));
  },

  // Toolbar
  getToolbarButtons: () => ipcRenderer.invoke('get-toolbar-buttons'),
  saveToolbarButtons: (buttons) => ipcRenderer.invoke('save-toolbar-buttons', buttons),

  // Bookmarks
  loadBookmarks: () => ipcRenderer.invoke('load-bookmarks'),
  addBookmark: (bookmark) => ipcRenderer.invoke('add-bookmark', bookmark),
  removeBookmark: (id) => ipcRenderer.invoke('remove-bookmark', id),
  updateBookmark: (id, data) => ipcRenderer.invoke('update-bookmark', id, data),
  addBookmarkFolder: () => ipcRenderer.invoke('add-bookmark-folder'),
  importBookmarks: () => ipcRenderer.invoke('import-bookmarks'),
  exportBookmarks: () => ipcRenderer.invoke('export-bookmarks'),

  // Passwords
  getPasswords: () => ipcRenderer.invoke('get-passwords'),
  addPassword: (pw) => ipcRenderer.invoke('add-password', pw),
  updatePassword: (id, pw) => ipcRenderer.invoke('update-password', id, pw),
  deletePassword: (id) => ipcRenderer.invoke('delete-password', id),
  clearPasswords: () => ipcRenderer.invoke('clear-passwords'),
  clearAllPasswords: () => ipcRenderer.invoke('clear-all-passwords'),
  togglePasswordFavorite: (id, favorite) => ipcRenderer.invoke('toggle-password-favorite', id, favorite),
  updatePasswordLastUsed: (id) => ipcRenderer.invoke('update-password-last-used', id),
  exportPasswords: () => ipcRenderer.invoke('export-passwords'),
  importPasswords: () => ipcRenderer.invoke('import-passwords'),
  checkBreached: () => ipcRenderer.invoke('check-breached'),
  securityAnalysis: () => ipcRenderer.invoke('security-analysis'),
  importFromGA: () => ipcRenderer.invoke('import-from-ga'),
  importTxtPasswords: () => ipcRenderer.invoke('import-txt-passwords'),
  testAutofill: () => ipcRenderer.invoke('test-autofill'),
  generatePassword: (opts) => ipcRenderer.invoke('generate-password', opts),
  scanQR: () => ipcRenderer.invoke('scan-qr'),

  // Privacy
  promptSetMasterPassword: () => ipcRenderer.invoke('set-master-password'),
  changeMasterPassword: () => ipcRenderer.invoke('change-master-password'),
  clearSelectedData: (types, timeRange) => ipcRenderer.invoke('clear-selected-data', types, timeRange),

  // System Integration
  getPlatformInfo: () => ipcRenderer.invoke('get-platform-info'),
  registerSystem: () => ipcRenderer.invoke('register-system'),
  unregisterSystem: () => ipcRenderer.invoke('unregister-system'),
  checkRegistration: () => ipcRenderer.invoke('check-registration'),
  showInstructions: () => ipcRenderer.invoke('show-instructions'),

  // Misc
  restartBrowser: () => ipcRenderer.invoke('restart-browser'),
  openUrlFromSettings: (url) => ipcRenderer.invoke('open-url-from-settings', url),
  openInCurrentTab: (url) => ipcRenderer.send('open-in-current-tab', url),
  goBack: () => ipcRenderer.send('go-back'),
  saveCurrentTabs: (tabs) => ipcRenderer.invoke('save-current-tabs', tabs),
  getSavedTabs: () => ipcRenderer.invoke('get-saved-tabs'),

  // Master Password (Privacy section)
  hasMasterPassword: () => ipcRenderer.invoke('has-master-password'),
  verifyMasterPassword: (pw) => ipcRenderer.invoke('verify-master-password', pw),
  setMasterPassword: (pw) => ipcRenderer.invoke('set-master-password', pw),

  // Vault (encrypted password store)
  unlockVault: (pw) => ipcRenderer.invoke('unlock-vault', pw),
  lockVault: () => ipcRenderer.invoke('lock-vault'),
  isVaultUnlocked: () => ipcRenderer.invoke('is-vault-unlocked'),
  removeMasterPassword: (pw) => ipcRenderer.invoke('remove-master-password', pw),

  // Library protection (gates Library access behind master password)
  getLibraryProtection: () => ipcRenderer.invoke('get-library-protection'),
  setLibraryProtection: (settings, password) => ipcRenderer.invoke('set-library-protection', settings, password),
  checkLibraryProtection: () => ipcRenderer.invoke('check-library-protection'),
  verifyLibraryAccess: (pw) => ipcRenderer.invoke('verify-library-access', pw),
  libraryBiometricAuth: () => ipcRenderer.invoke('library-biometric-auth'),
  lockLibrary: () => ipcRenderer.invoke('lock-library'),

  // Settings protection + Backup re-auth + (biometric shared with library).
  checkSettingsProtection: () => ipcRenderer.invoke('check-settings-protection'),
  verifySettingsAccess: (pw) => ipcRenderer.invoke('verify-settings-access', pw),
  settingsBiometricAuth: () => ipcRenderer.invoke('settings-biometric-auth'),
  checkBackupProtection: () => ipcRenderer.invoke('check-backup-protection'),
  verifyBackupAccess: (pw) => ipcRenderer.invoke('verify-backup-access', pw),
  lockBackup: () => ipcRenderer.invoke('lock-backup'),
  // Protection section gate (the panel with the master-password toggles).
  checkProtectionAccess: () => ipcRenderer.invoke('check-protection-access'),
  verifyProtectionAccess: (pw) => ipcRenderer.invoke('verify-protection-access', pw),

  // Window state (maximize/focus) — used by the macOS-style controls
  onWindowStateChanged: (cb) => {
    const listener = (_, s) => cb(s);
    ipcRenderer.on('window-state-changed', listener);
    return () => ipcRenderer.removeListener('window-state-changed', listener);
  },
  onWindowFocusChanged: (cb) => {
    const listener = (_, s) => cb(s);
    ipcRenderer.on('window-focus-changed', listener);
    return () => ipcRenderer.removeListener('window-focus-changed', listener);
  },

  // Browsing data clearing (Privacy section)
  clearBrowsingData: (options, dataToRemove) => ipcRenderer.invoke('clear-browsing-data', options, dataToRemove),

  // Custom theme (.thmz system)
  applyCustomTheme: (css) => ipcRenderer.invoke('apply-custom-theme', css),
  clearCustomTheme: () => ipcRenderer.invoke('clear-custom-theme'),
  onApplyCustomTheme: (callback) => {
    ipcRenderer.on('apply-custom-theme-event', (_, css) => callback(css));
  },
  onClearCustomTheme: (callback) => {
    ipcRenderer.on('clear-custom-theme-event', () => callback());
  },
  // .thmz theme management
  themeImport: (filePath) => ipcRenderer.invoke('theme-import', filePath),
  themeList: () => ipcRenderer.invoke('theme-list'),
  themeApply: (themeId) => ipcRenderer.invoke('theme-apply', themeId),
  themeClear: () => ipcRenderer.invoke('theme-clear'),
  themeGetActive: () => ipcRenderer.invoke('theme-get-active'),
  themeGetCss: (themeId) => ipcRenderer.invoke('theme-get-css', themeId),
  themeDelete: (themeId) => ipcRenderer.invoke('theme-delete', themeId),
  themeExport: (themeId) => ipcRenderer.invoke('theme-export', themeId),
  themeCreate: (name, css, type) => ipcRenderer.invoke('theme-create', name, css, type),
  themePickFile: () => ipcRenderer.invoke('theme-pick-file'),

  // Passwords updated event
  onPasswordsUpdated: (callback) => {
    ipcRenderer.on('passwords-updated', () => callback());
  },

  // Edit password (settings form uses editPassword)
  editPassword: (id, data) => ipcRenderer.invoke('update-password', id, data),

  // Single password breach check
  checkPasswordBreached: (password) => ipcRenderer.invoke('check-password-breached', password),

  // TOTP
  generateTOTP: (secret, opts) => ipcRenderer.invoke('generate-totp', secret, opts),
  parseTOTPSecret: (secret) => ipcRenderer.invoke('parse-totp-secret', secret),
  scanQRCode: (imageData, width, height) => ipcRenderer.invoke('scan-qr-code', imageData, width, height),
  extractTOTPFromQR: (qrData) => ipcRenderer.invoke('extract-totp-from-qr', qrData),
  scanPageQR: () => ipcRenderer.invoke('scan-page-qr'),

  // Autofill
  autofillPassword: (id) => ipcRenderer.invoke('autofill-password', id),
  getMatchingPasswords: (url) => ipcRenderer.invoke('get-matching-passwords', url),

  // Check all passwords for breaches
  checkAllPasswordsBreached: () => ipcRenderer.invoke('check-all-passwords-breached'),

  // Import GA export
  importGAExport: (content) => ipcRenderer.invoke('import-ga-export', content),

  // Import TXT file
  importTxtFile: (content) => ipcRenderer.invoke('import-txt-file', content),

  // System Integration (aliases used by Settings.html)
  registerBrowserInSystem: () => ipcRenderer.invoke('register-system'),
  unregisterBrowserFromSystem: () => ipcRenderer.invoke('unregister-system'),
  checkSystemRegistration: () => ipcRenderer.invoke('check-registration'),
  getManualInstructions: () => ipcRenderer.invoke('show-instructions'),

  // Profiles
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  createProfile: (name, avatar) => ipcRenderer.invoke('create-profile', name, avatar),
  deleteProfile: (id) => ipcRenderer.invoke('delete-profile', id),
  switchProfile: (id) => ipcRenderer.invoke('switch-profile', id),
  getActiveProfile: () => ipcRenderer.invoke('get-active-profile'),
  renameProfile: (id, name) => ipcRenderer.invoke('rename-profile', id, name),

  // Adblocker
  adblockerGetStats: () => ipcRenderer.invoke('adblocker-get-stats'),
  adblockerGetPageStats: (tabId) => ipcRenderer.invoke('adblocker-get-page-stats', tabId),
  adblockerResetPageStats: (tabId) => ipcRenderer.invoke('adblocker-reset-page-stats', tabId),
  adblockerToggle: (val) => ipcRenderer.invoke('adblocker-toggle', val),
  adblockerIsEnabled: () => ipcRenderer.invoke('adblocker-is-enabled'),
  adblockerGetWhitelist: () => ipcRenderer.invoke('adblocker-get-whitelist'),
  adblockerAddWhitelist: (domain) => ipcRenderer.invoke('adblocker-add-whitelist', domain),
  adblockerRemoveWhitelist: (domain) => ipcRenderer.invoke('adblocker-remove-whitelist', domain),
  adblockerIsWhitelisted: (domain) => ipcRenderer.invoke('adblocker-is-whitelisted', domain),
  adblockerGetCosmeticCSS: (url) => ipcRenderer.invoke('adblocker-get-cosmetic-css', url),

  // Window opacity
  onWindowOpacityChanged: (callback) => {
    ipcRenderer.on('window-opacity-changed', (_, opacity) => callback(opacity));
  },

  _dialogRequest: (data) => ipcRenderer.invoke('dialog-request', data),

  // Site Permissions
  getSitePermissions: () => ipcRenderer.invoke('get-site-permissions'),
  setSitePermission: (domain, permission, value) => ipcRenderer.invoke('set-site-permission', domain, permission, value),
  removeSitePermissions: (domain) => ipcRenderer.invoke('remove-site-permissions', domain),
  setGeoOverride: (domain, coords) => ipcRenderer.invoke('set-geo-override', domain, coords),
  setCertException: (domain, allow) => ipcRenderer.invoke('set-cert-exception', domain, allow),
  getCertExceptions: () => ipcRenderer.invoke('get-cert-exceptions'),
  setHttpConsent: (domain, allow) => ipcRenderer.invoke('set-http-consent', domain, allow),
  getHttpConsent: (domain) => ipcRenderer.invoke('get-http-consent', domain),

  // Cookies
  getCookies: () => ipcRenderer.invoke('get-cookies'),
  getCookiesForDomain: (domain) => ipcRenderer.invoke('get-cookies-for-domain', domain),
  removeCookie: (url, name) => ipcRenderer.invoke('remove-cookie', url, name),
  clearCookies: () => ipcRenderer.invoke('clear-cookies'),

  // Workspaces
  getWorkspaces: () => ipcRenderer.invoke('get-workspaces'),
  saveWorkspaces: (workspaces) => ipcRenderer.invoke('save-workspaces', workspaces),
  getActiveWorkspace: () => ipcRenderer.invoke('get-active-workspace'),
  setActiveWorkspace: (id) => ipcRenderer.invoke('set-active-workspace', id),
  getWorkspaceTabs: (workspaceId) => ipcRenderer.invoke('get-workspace-tabs', workspaceId),
  setWorkspaceTabs: (workspaceId, tabsData) => ipcRenderer.invoke('set-workspace-tabs', workspaceId, tabsData),

  // Site Themes
  getSiteThemes: () => ipcRenderer.invoke('get-site-themes'),
  setSiteTheme: (domain, css) => ipcRenderer.invoke('set-site-theme', domain, css),

  // Multi-search
  getMultiSearchEngines: () => ipcRenderer.invoke('get-multi-search-engines'),
  setMultiSearchEngines: (engines) => ipcRenderer.invoke('set-multi-search-engines', engines),
  getMultiSearchCustomEngines: () => ipcRenderer.invoke('get-multi-search-custom-engines'),
  setMultiSearchCustomEngines: (engines) => ipcRenderer.invoke('set-multi-search-custom-engines', engines),
  addMultiSearchCustomEngine: (engine) => ipcRenderer.invoke('add-multi-search-custom-engine', engine),
  removeMultiSearchCustomEngine: (engineId) => ipcRenderer.invoke('remove-multi-search-custom-engine', engineId),

  // Privacy Stats
  getPrivacyStats: () => ipcRenderer.invoke('get-privacy-stats'),

  // Translate (used by hover-translate injection)
  translateText: (text, from, to) => ipcRenderer.invoke('translate-text', text, from, to),

  // Main page data sync (used by injected bridge in main world).
  // MUST be synchronous: MainPage/script.js consumes the return value inline
  // (var data = getMainPageDataSync(); Object.keys(data)...). ipcRenderer.invoke
  // returns a Promise, which broke the settings → MainPage restore (wallpapers,
  // toggles...). The matching handler in main.js uses event.returnValue, which
  // only works with sendSync.
  getMainPageDataSync: () => ipcRenderer.sendSync('get-mainpage-data-sync'),
  setMainPageData: (snapshot) => ipcRenderer.send('set-mainpage-data', snapshot),

  // Optimization settings changed event
  onOptimizationSettingsChanged: (callback) => {
    ipcRenderer.on('optimization-settings-changed', () => callback());
  },

  _retryUrl: (url) => {
    if (url) {
      try {
        var parsed = new URL(url);
        if (['http:', 'https:', 'ftp:', 'file:'].indexOf(parsed.protocol) !== -1) {
          window.location.href = url;
        }
      } catch(e) {}
    } else {
      window.history.back();
    }
  },

  // Element Zapper — launches the element picker inside the page
  startElementPicker: function() { _startElementPicker(); },

  // Keybindings (hotkey editor) — for Settings.html
  getKeybindings: () => ipcRenderer.invoke('get-keybindings'),
  setKeybinding: (action, binding) => ipcRenderer.invoke('set-keybinding', action, binding),
  resetKeybindings: () => ipcRenderer.invoke('reset-keybindings'),
  setKeybindingRecording: (on) => ipcRenderer.send('keybinding-recording', on),

  // Session Guard — request for forced duplicate check
  sessionGuardScanAll: () => ipcRenderer.invoke('session-guard-scan'),

  // Element Zapper rules — for the Zapper settings page in Settings.html
  getElementHidingRules: () => ipcRenderer.invoke('get-element-hiding-rules'),
  addElementHidingRule: (domain, selector) => ipcRenderer.invoke('add-element-hiding-rule', domain, selector),
  removeElementHidingRule: (domain, selector) => ipcRenderer.invoke('remove-element-hiding-rule', domain, selector),
  clearElementHidingDomain: (domain) => ipcRenderer.invoke('clear-element-hiding-domain', domain),
  getElementZapperEnabled: () => ipcRenderer.invoke('get-element-zapper-enabled'),
  setElementZapperEnabled: (val) => ipcRenderer.invoke('set-element-zapper-enabled', val),
  onElementHidingUpdated: (callback) => {
    ipcRenderer.on('element-hiding-updated', (_, data) => callback(data));
  },

  // Export / Import ALL settings as JSON — for Settings.html
  settingsExportJson: () => ipcRenderer.invoke('settings-export-json'),
  settingsImportJson: () => ipcRenderer.invoke('settings-import-json'),
  settingsApplyImported: (data) => ipcRenderer.invoke('settings-apply-imported', data),

  // Memory pressure (auto-sleep tabs) — for optimization settings
  onMemoryPressure: (callback) => {
    ipcRenderer.on('memory-pressure', (_, data) => callback(data));
  },

  // ===== Homepage (custom home page) — for Settings.html =====
  getHomepage: () => ipcRenderer.invoke('get-homepage'),
  setHomepage: (hp) => ipcRenderer.invoke('set-homepage', hp),
  chooseHomepageFile: () => ipcRenderer.invoke('choose-homepage-file'),

  // ===== Vim-like controls — for Settings.html =====
  getVimSettings: () => ipcRenderer.invoke('get-vim-settings'),
  setVimSettings: (settings) => ipcRenderer.invoke('set-vim-settings', settings),
  resetVimSettings: () => ipcRenderer.invoke('reset-vim-settings'),
  // Event: vim settings changed (need to live-update keymap/enabled)
  onVimSettingsChanged: (callback) => {
    ipcRenderer.on('vim-settings-changed', (_, vim) => callback(vim));
  },

  // ===== Tor security level (legacy + new hardening) — for Settings.html =====
  getTorSecurityLevel: () => ipcRenderer.invoke('get-tor-security-level'),
  setTorSecurityLevel: (lvl) => ipcRenderer.invoke('set-tor-security-level', lvl),
  getTorHardening: () => ipcRenderer.invoke('get-tor-hardening'),
  setTorHardening: (settings) => ipcRenderer.invoke('set-tor-hardening', settings),

  // ===== Tor auto-detection — for Settings.html =====
  detectTor: () => ipcRenderer.invoke('detect-tor'),
  ensureTorForOnion: () => ipcRenderer.invoke('ensure-tor-for-onion'),
  getSnowflakePreset: () => ipcRenderer.invoke('get-snowflake-preset'),

  // ===== Proxy & Tor control — for Settings.html =====
  getProxySettings: () => ipcRenderer.invoke('get-proxy-settings'),
  setProxySettings: (settings) => ipcRenderer.invoke('set-proxy-settings', settings),
  torStart: (settings) => ipcRenderer.invoke('tor-start', settings),
  torStop: () => ipcRenderer.invoke('tor-stop'),
  torCheck: () => ipcRenderer.invoke('tor-check'),
  torStatus: () => ipcRenderer.invoke('tor-status'),
  torNewNym: () => ipcRenderer.invoke('tor-newnym'),
  onTorBootstrap: (callback) => {
    var listener = (_, pct) => callback(pct);
    ipcRenderer.on('tor-bootstrap', listener);
    return () => { try { ipcRenderer.removeListener('tor-bootstrap', listener); } catch(e) {} };
  },
  // Tor auto-start on browser launch
  getTorAutoStart: () => ipcRenderer.invoke('get-tor-autostart'),
  setTorAutoStart: (val) => ipcRenderer.invoke('set-tor-autostart', val),
  // Connection diagnostics (exit IP, country, ISP, speed) — goes through proxy/Tor
  proxyConnectionTest: () => ipcRenderer.invoke('proxy-connection-test'),

  // ===== .skit script packages (like .thmz but for scripts) =====
  skitImport: (filePath) => ipcRenderer.invoke('skit-import', filePath),
  skitList: () => ipcRenderer.invoke('skit-list'),
  skitToggle: (skitId, enabled) => ipcRenderer.invoke('skit-toggle', skitId, enabled),
  skitDelete: (skitId) => ipcRenderer.invoke('skit-delete', skitId),
  skitExport: (skitId) => ipcRenderer.invoke('skit-export', skitId),
  skitPickFile: () => ipcRenderer.invoke('skit-pick-file')
});

var _optSettings = {};
var _vimSettings = { enabled: false, keys: {} };
try {
  var _all = ipcRenderer.sendSync('get-all-security-settings-sync');
  _optSettings = (_all && _all.optimization) || {};
  if (_all && _all.vim) _vimSettings = _all.vim;
} catch(e) {}

// Per-site geolocation override (lat/lng set via the Site Info panel).
// Returned to the page as fake coordinates instead of the real location.
var _geoOverride = null;
try {
  var _host = location.hostname;
  if (_host) {
    var _geoResp = ipcRenderer.sendSync('get-geo-override-sync', _host);
    if (_geoResp && typeof _geoResp === 'object' && typeof _geoResp.lat === 'number') {
      _geoOverride = _geoResp;
    }
  }
} catch(e) {}

// Page dialog bridge (alert/confirm/prompt).
// In some Electron builds the main process's contents.on('dialog') listener
// does not fire for <webview> tags, so we install a backup path: the page
// talks to us (isolated preload) via postMessage, we relay via ipcRenderer.
// This makes the banner show up regardless of which path delivered the event.
(function installPageDialogBridge() {
  try {
    // Isolated-world side: receive requests from the page, forward to main.
    window.addEventListener('message', function(e) {
      var d = e.data;
      if (!d || !d.__spzDialogReq || !d.id) return;
      try {
        ipcRenderer.invoke('dialog-request', {
          type: d.type,
          message: d.message || '',
          defaultText: d.defaultText || ''
        }).then(function(result) {
          try {
            window.postMessage({ __spzDialogResp: true, id: d.id, result: result }, '*');
          } catch(_) {}
        }).catch(function() {
          try {
            window.postMessage({ __spzDialogResp: true, id: d.id, result: null }, '*');
          } catch(_) {}
        });
      } catch(err) {
        try {
          window.postMessage({ __spzDialogResp: true, id: d.id, result: null }, '*');
        } catch(_) {}
      }
    });

    // Main-world side: override window.alert/confirm/prompt. The override is
    // async-friendly (alert returns void, confirm/prompt return default values),
    // because we cannot block JS execution. This matches how Chrome handles
    // the same APIs on cross-origin iframes.
    var overrideCode = '(function(){' +
      'if(window.__spzDialogPatched)return;window.__spzDialogPatched=true;' +
      'function _req(payload,cb){' +
        'var id="d"+Math.random().toString(36).slice(2,10);' +
        'function h(ev){if(ev.data&&ev.data.__spzDialogResp&&ev.data.id===id){window.removeEventListener("message",h);cb(ev.data.result);}}' +
        'window.addEventListener("message",h);' +
        'window.postMessage({__spzDialogReq:true,id:id,type:payload.type,message:payload.message||"",defaultText:payload.defaultText||""},"*");' +
      '}' +
      'try{window.alert=function(m){_req({type:"alert",message:String(m==null?"":m)},function(){});return undefined;};}catch(e){}' +
      'try{window.confirm=function(m){_req({type:"confirm",message:String(m==null?"":m)},function(){});return false;};}catch(e){}' +
      'try{window.prompt=function(m,d){_req({type:"prompt",message:String(m==null?"":m),defaultText:String(d==null?"":d)},function(){});return null;};}catch(e){}' +
    '})();';
    if (webFrame && webFrame.executeJavaScript) {
      webFrame.executeJavaScript(overrideCode).catch(function() {});
    }
  } catch(e) {}
})();

(function injectSecurityScripts() {
  try {
    var sec = (_all && _all.security) || {};
    var code = '';
    if (!sec.autoplayBlock) {
      code += '(function(){' +
        'var _origPlay=HTMLMediaElement.prototype.play;' +
        'HTMLMediaElement.prototype.play=function(){' +
        '  this._userActivated=true;' +
        '  return _origPlay.apply(this,arguments);' +
        '};' +
        'document.addEventListener("click",function(e){' +
        '  var el=e.target;while(el){if(el.tagName==="VIDEO"||el.tagName==="AUDIO"){el._userActivated=true;break;}el=el.parentElement;}' +
        '},{capture:true});' +
        'document.addEventListener("play",function(){},{capture:true});' +
        '})();';
    }
    if (sec.webrtcLeak) {
      code += '(function(){' +
        'var _f=Symbol.for("spz");if(Navigator.prototype[_f]&1)return;try{Object.defineProperty(Navigator.prototype,_f,{value:(Navigator.prototype[_f]||0)|1,enumerable:false,configurable:true});}catch(e){}' +
        'var _origRTC=window.RTCPeerConnection||function(){};' +
        'window.RTCPeerConnection=function(){' +
        '  throw new DOMException("WebRTC is disabled for privacy protection","NotAllowedError");' +
        '};' +
        'window.RTCPeerConnection.prototype=_origRTC.prototype;' +
        'if(window.webkitRTCPeerConnection)window.webkitRTCPeerConnection=window.RTCPeerConnection;' +
        '})();';
    }
    if (sec.fingerprint) {
      code += '(function(){' +
        'var _f=Symbol.for("spz");if(Navigator.prototype[_f]&2)return;try{Object.defineProperty(Navigator.prototype,_f,{value:(Navigator.prototype[_f]||0)|2,enumerable:false,configurable:true});}catch(e){}' +
        'var _origToDataURL=HTMLCanvasElement.prototype.toDataURL;' +
        'HTMLCanvasElement.prototype.toDataURL=function(){' +
        '  var r=_origToDataURL.apply(this,arguments);' +
        '  if(r && r.indexOf("data:")===0 && r.length>40){' +
        '    var chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";' +
        '    var pos=r.length-8-Math.floor(Math.random()*8);' +
        '    if(pos>22 && r[pos]!=="="){r=r.slice(0,pos)+chars[Math.floor(Math.random()*chars.length)]+r.slice(pos+1);}' +
        '  }' +
        '  return r;' +
        '};' +
        'var _origGetImageData=CanvasRenderingContext2D.prototype.getImageData;' +
        'CanvasRenderingContext2D.prototype.getImageData=function(){' +
        '  var d=_origGetImageData.apply(this,arguments);' +
        '  if(d.data.length>100){' +
        '    var step=Math.max(1000,Math.floor(d.data.length/4));' +
        '    for(var i=0;i<d.data.length;i+=step){d.data[i]=d.data[i]^1;}' +
        '  }' +
        '  return d;' +
        '};' +
        'var _np=Navigator.prototype;' +
        'try{Object.defineProperty(_np,"platform",{get:function(){return "Win32";}});}catch(e){}' +
        'try{Object.defineProperty(_np,"hardwareConcurrency",{get:function(){return 4;}});}catch(e){}' +
        'try{Object.defineProperty(_np,"deviceMemory",{get:function(){return 4;}});}catch(e){}' +
        'try{Object.defineProperty(_np,"userAgent",{get:function(){return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + _chromeFullVer + ' Safari/537.36";}});}catch(e){}' +
        'try{Object.defineProperty(_np,"appVersion",{get:function(){return "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + _chromeFullVer + ' Safari/537.36";}});}catch(e){}' +
        'try{Object.defineProperty(_np,"languages",{get:function(){return ["en-US","en"];}});}catch(e){}' +
        // sendBeacon — fire-and-forget tracking pings (analytics, ads). Noop silently.
        'try{Navigator.prototype.sendBeacon=function(){return true;};}catch(e){}' +
        // Battery Status API — strong fingerprint vector (level+charging+times).
        // Return a stable, generic profile so the value is identical across users.
        'try{Object.defineProperty(_np,"getBattery",{value:function(){return Promise.resolve({' +
          'charging:true,chargingTime:0,dischargingTime:Infinity,level:1,' +
          'addEventListener:function(){},removeEventListener:function(){}' +
          '});},configurable:true,writable:true});}catch(e){}' +
        // MediaDevices.enumerateDevices — returns camera/mic list with stable IDs.
        // Normalise to a single anonymous audioinput so the fingerprint is constant.
        'try{if(navigator.mediaDevices&&navigator.mediaDevices.enumerateDevices){' +
          'var _origEnum=navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);' +
          'navigator.mediaDevices.enumerateDevices=function(){' +
          '  return _origEnum().then(function(list){return list.map(function(d){' +
          '    return {kind:d.kind,deviceId:"",groupId:"",label:""};});}).catch(function(){return [];});' +
          '};' +
        '}}catch(e){}' +
        'try{if(navigator.mediaDevices&&navigator.mediaDevices.getSupportedConstraints){' +
          'navigator.mediaDevices.getSupportedConstraints=function(){return {"echoCancellation":true,"noiseSuppression":true,"autoGainControl":true};};' +
        '}}catch(e){}' +
        // AudioContext fingerprinting — sites render a silent oscillator and read
        // the float output, which varies per CPU/audio stack. Add tiny noise to
        // the least significant bits of getChannelData / copyFromChannel output.
        'try{var _ac=window.OfflineAudioContext||window.webkitOfflineAudioContext;' +
        'if(_ac){var _origGetChannel=AudioBuffer.prototype.getChannelData;' +
        'AudioBuffer.prototype.getChannelData=function(){' +
          'var d=_origGetChannel.apply(this,arguments);' +
          'if(d&&d.length>100){for(var i=0;i<d.length;i+=Math.max(1000,Math.floor(d.length/4))){d[i]=d[i]+(Math.random()-0.5)*1.0e-7;}}' +
          'return d;' +
        '};}' +
        '}catch(e){}' +
        '})();';
    }
    if (sec.blockWebGL) {
      code += '(function(){' +
        'var _f=Symbol.for("spz");if(Navigator.prototype[_f]&4)return;try{Object.defineProperty(Navigator.prototype,_f,{value:(Navigator.prototype[_f]||0)|4,enumerable:false,configurable:true});}catch(e){}' +
        'var _getParam=WebGLRenderingContext.prototype.getParameter;' +
        'WebGLRenderingContext.prototype.getParameter=function(p){' +
        '  if(p===37445)return "Intel Inc.";' +
        '  if(p===37446)return "Intel Iris OpenGL Engine";' +
        '  if(p===7937)return "Intel(R) HD Graphics 630";' +
        '  if(p===7936)return "Intel Inc.";' +
        '  if(p===37447)return "WebKit WebGL";' +
        '  return _getParam.apply(this,arguments);' +
        '};' +
        'if(typeof WebGL2RenderingContext!=="undefined"){' +
        '  var _getParam2=WebGL2RenderingContext.prototype.getParameter;' +
        '  WebGL2RenderingContext.prototype.getParameter=function(p){' +
        '    if(p===37445)return "Intel Inc.";' +
        '    if(p===37446)return "Intel Iris OpenGL Engine";' +
        '    if(p===7937)return "Intel(R) HD Graphics 630";' +
        '    if(p===7936)return "Intel Inc.";' +
        '    if(p===37447)return "WebKit WebGL";' +
        '    return _getParam2.apply(this,arguments);' +
        '  };' +
        '}' +
        'var _getExt=WebGLRenderingContext.prototype.getExtension;' +
        'WebGLRenderingContext.prototype.getExtension=function(name){' +
        '  if(name==="WEBGL_debug_renderer_info"){' +
        '    return {UNMASKED_VENDOR_WEBGL:37445,UNMASKED_RENDERER_WEBGL:37446};' +
        '  }' +
        '  return _getExt.apply(this,arguments);' +
        '};' +
        '})();';
    }
    if (sec.blockClipboard) {
      code += '(function(){' +
        'var _f=Symbol.for("spz");if(Navigator.prototype[_f]&8)return;try{Object.defineProperty(Navigator.prototype,_f,{value:(Navigator.prototype[_f]||0)|8,enumerable:false,configurable:true});}catch(e){}' +
        'if(navigator.clipboard){' +
        '  var _clip=Object.getOwnPropertyDescriptor(Navigator.prototype,"clipboard");' +
        '  if(_clip&&_clip.get){' +
        '    Object.defineProperty(Navigator.prototype,"clipboard",{get:function(){' +
        '      return {' +
        '        readText:function(){return Promise.reject(new DOMException("Clipboard access blocked","NotAllowedError"));},' +
        '        writeText:function(){return Promise.reject(new DOMException("Clipboard access blocked","NotAllowedError"));},' +
        '        read:function(){return Promise.reject(new DOMException("Clipboard access blocked","NotAllowedError"));},' +
        '        write:function(){return Promise.reject(new DOMException("Clipboard access blocked","NotAllowedError"));}' +
        '      };' +
        '    },configurable:true,enumerable:true});' +
        '  }' +
        '}' +
        'document.addEventListener("copy",function(e){e.preventDefault();},true);' +
        'document.addEventListener("cut",function(e){e.preventDefault();},true);' +
        'document.addEventListener("paste",function(e){e.preventDefault();},true);' +
        '})();';
    }
    // Geolocation handling — three modes:
    //   1. Per-site geo override set in Site Info panel → return fake coords
    //      via success callback (the page sees a plausible location).
    //   2. blockGeolocation on (no override) → deny via error callback.
    //   3. Otherwise → leave the browser's native geolocation alone.
    if (_geoOverride) {
      var _gLat = _geoOverride.lat, _gLng = _geoOverride.lng, _gAcc = _geoOverride.accuracy || 50;
      code += '(function(){' +
        'var _f=Symbol.for("spz");if(Navigator.prototype[_f]&16)return;try{Object.defineProperty(Navigator.prototype,_f,{value:(Navigator.prototype[_f]||0)|16,enumerable:false,configurable:true});}catch(e){}' +
        'var _lat=' + _gLat + ',_lng=' + _gLng + ',_acc=' + _gAcc + ';' +
        'function _mkPos(){' +
        '  var ts=Date.now();' +
        '  var coords={' +
        '    latitude:_lat+(Math.random()-0.5)*0.0002,' +
        '    longitude:_lng+(Math.random()-0.5)*0.0002,' +
        '    accuracy:_acc+Math.floor(Math.random()*10),' +
        '    altitude:null,altitudeAccuracy:null,heading:null,speed:null' +
        '  };' +
        '  return {coords:coords,timestamp:ts};' +
        '}' +
        'function _GeoError(code,msg){this.code=code;this.message=msg;this.PERMISSION_DENIED=1;this.POSITION_UNAVAILABLE=2;this.TIMEOUT=3;}' +
        'if(navigator.geolocation){' +
        '  Object.defineProperty(Navigator.prototype,"geolocation",{get:function(){' +
        '    return {' +
        '      getCurrentPosition:function(s,e,o){setTimeout(function(){if(s){s(_mkPos());}else if(e){e(new _GeoError(2,"Position unavailable"));}},Math.max(10,Math.min((o&&o.timeout)||5000)));},' +
        '      watchPosition:function(s,e,o){var id=Math.floor(Math.random()*1e6);setTimeout(function(){if(s){s(_mkPos());}},Math.max(10,Math.min((o&&o.timeout)||5000)));return id;},' +
        '      clearWatch:function(){}' +
        '    };' +
        '  },configurable:true,enumerable:true});' +
        '}' +
        '})();';
    } else if (sec.blockGeolocation) {
      code += '(function(){' +
        'var _f=Symbol.for("spz");if(Navigator.prototype[_f]&16)return;try{Object.defineProperty(Navigator.prototype,_f,{value:(Navigator.prototype[_f]||0)|16,enumerable:false,configurable:true});}catch(e){}' +
        'if(navigator.geolocation){' +
        '  Object.defineProperty(Navigator.prototype,"geolocation",{get:function(){' +
        '    return {' +
        '      getCurrentPosition:function(s,e,o){if(e){try{var err=new GeolocationPositionError();err.code=1;err.message="Geolocation blocked";e(err);}catch(x){e({code:1,message:"Geolocation blocked"});}}},' +
        '      watchPosition:function(s,e,o){if(e){try{var err=new GeolocationPositionError();err.code=1;err.message="Geolocation blocked";e(err);}catch(x){e({code:1,message:"Geolocation blocked"});}}return 0;},' +
        '      clearWatch:function(){}' +
        '    };' +
        '  },configurable:true,enumerable:true});' +
        '}' +
        '})();';
    }
    if (code) {
      // Only executeJavaScript — bypasses CSP/Trusted Types. Injection via
      // <script>.textContent throws "TrustedScript assignment" on protected
      // pages (Google sign-in etc.) and shows up in the console.
      try {
        if (webFrame && webFrame.executeJavaScript) {
          webFrame.executeJavaScript(code).catch(function(){});
        }
      } catch(e) {}
    }
  } catch(e) {}
})();

// ============== DATA SAVER (lazy-loading injection) ==============
// When enabled: sets loading="lazy" on all images/iframes, defers off-screen
// images via IntersectionObserver, and strips srcset to avoid downloading
// high-res variants. Media (video/audio) is NOT touched.
var _dataSaverInstalled = false;
var _dataSaverWanted = null;
function applyDataSaver(on) {
  try {
    var expr = 'if(window.__spzDataSaverSet){window.__spzDataSaverSet(' + (on ? 'true' : 'false') + ');}';
    if (webFrame && webFrame.executeJavaScript) {
      webFrame.executeJavaScript(expr).catch(function(){});
    }
  } catch(e) {}
}
(function installDataSaverEngine() {
  if (!webFrame || !webFrame.executeJavaScript) return;
  var engineCode = '(' + function __spzDataSaverEngine() {
    if (window.__spzDataSaverInstalled) return;
    window.__spzDataSaverInstalled = true;
    var ON = false;
    var observer = null;
    var mutationObserver = null;

    function processImage(img) {
      if (!img || img.dataset.__spzDs === '1') return;
      img.dataset.__spzDs = '1';
      if (img.tagName === 'IMG') {
        if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
        if (img.getAttribute('loading') !== 'lazy') img.setAttribute('loading', 'lazy');
        if (img.srcset) { img.dataset.__spzSrcset = img.srcset; img.removeAttribute('srcset'); }
      } else if (img.tagName === 'IFRAME') {
        if (!img.hasAttribute('loading')) img.setAttribute('loading', 'lazy');
      }
    }

    function processAll() {
      var imgs = document.querySelectorAll('img, iframe');
      for (var i = 0; i < imgs.length; i++) processImage(imgs[i]);
    }

    function start() {
      processAll();
      if (!observer) {
        observer = new IntersectionObserver(function(entries) {
          for (var i = 0; i < entries.length; i++) {
            if (entries[i].isIntersecting) {
              var el = entries[i].target;
              if (el.tagName === 'IMG' && el.dataset.__spzSrcset && !el.complete) {
                el.setAttribute('srcset', el.dataset.__spzSrcset);
              }
              observer.unobserve(el);
            }
          }
        }, { rootMargin: '200px' });
      }
      var imgs = document.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) observer.observe(imgs[i]);

      if (!mutationObserver) {
        mutationObserver = new MutationObserver(function(mutations) {
          for (var i = 0; i < mutations.length; i++) {
            var added = mutations[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
              var node = added[j];
              if (node.nodeType !== 1) continue;
              if (node.tagName === 'IMG' || node.tagName === 'IFRAME') processImage(node);
              else if (node.querySelectorAll) {
                var inner = node.querySelectorAll('img, iframe');
                for (var k = 0; k < inner.length; k++) processImage(inner[k]);
              }
            }
          }
        });
      }
      mutationObserver.observe(document.documentElement || document.body || document, { childList: true, subtree: true });
    }

    function stop() {
      if (observer) { observer.disconnect(); observer = null; }
      if (mutationObserver) { mutationObserver.disconnect(); mutationObserver = null; }
    }

    function setOn(on) {
      ON = !!on;
      if (ON) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', start);
        } else {
          start();
        }
      } else {
        stop();
      }
    }
    window.__spzDataSaverSet = setOn;
  }.toString() + ')();';
  try {
    webFrame.executeJavaScript(engineCode).then(function() {
      _dataSaverInstalled = true;
      if (_dataSaverWanted !== null) {
        var v = _dataSaverWanted;
        _dataSaverWanted = null;
        applyDataSaver(v);
      }
    }).catch(function(){});
  } catch(e) {}
})();
ipcRenderer.on('data-saver', function(_, data) {
  var on = !!(data && data.on);
  if (_dataSaverInstalled) applyDataSaver(on);
  else _dataSaverWanted = on;
});

// ============== ECO-FREEZE (freezing animations in background tabs) ==============
// renderer sends IPC 'eco-freeze' {on:true|false} when a tab goes to the background /
// becomes active again. The engine is installed in MAIN WORLD (like vim) and:
//   ON  → injects a <style> with animation-play-state:paused + transition:0s,
//         replaces requestAnimationFrame with a "piggy bank" (callbacks are not invoked
//         until unlock — full freeze of JS animations/canvas loops).
//   OFF → removes the <style>, flushes accumulated rAF in a single frame (instant
//         continuation), restores native rAF.
// Media (<video>/<audio>) is NOT touched — playback continues.
var _ecoInstalled = false;
var _ecoWanted = null; // desired state before the engine is installed (race on early IPC)
(function installEcoEngine() {
  if (!webFrame || !webFrame.executeJavaScript) return;
  var engineCode = '(' + function __spzEcoEngine() {
    if (window.__spzEcoInstalled) return;
    window.__spzEcoInstalled = true;
    var STYLE_ID = '__spz_eco_freeze';
    var ON = false;
    var _origRAF = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;
    var _origCancel = window.cancelAnimationFrame ? window.cancelAnimationFrame.bind(window) : null;
    var _queue = [];
    var _nextId = 1;
    var _MAX_QUEUE = 64;

    function getStyle() { return document.getElementById(STYLE_ID); }
    function addStyle() {
      if (getStyle()) return;
      var root = document.head || document.documentElement;
      if (!root) return;
      var s = document.createElement('style');
      s.id = STYLE_ID;
      s.textContent =
        '*,*::before,*::after{animation-play-state:paused!important;' +
        '-webkit-animation-play-state:paused!important;' +
        'transition-duration:0s!important;transition-delay:0s!important}';
      root.appendChild(s);
    }
    function removeStyle() {
      var s = getStyle();
      if (s && s.parentNode) s.parentNode.removeChild(s);
    }
    function fakeRAF(cb) {
      var id = _nextId++;
      _queue.push({ cb: cb, id: id });
      if (_queue.length > _MAX_QUEUE) _queue.shift(); // limit growth
      return id;
    }
    function fakeCancel(id) {
      for (var i = 0; i < _queue.length; i++) {
        if (_queue[i].id === id) { _queue.splice(i, 1); return; }
      }
    }
    function flush() {
      if (!_queue.length) return;
      var q = _queue.splice(0);
      var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      // Calling only the last frame of each "stream" is impossible — call them all,
      // but there are few (cap). This is a one-time burst on unlock.
      for (var i = 0; i < q.length; i++) {
        try { q[i].cb(now); } catch(e) {}
      }
    }
    function setOn(on) {
      ON = !!on;
      if (ON) {
        addStyle();
        if (_origRAF && window.requestAnimationFrame !== fakeRAF) {
          window.requestAnimationFrame = fakeRAF;
          window.cancelAnimationFrame = fakeCancel;
        }
        // re-add the style if the document was rebuilt (late <head>)
        // — a light watch via interval; removed on OFF.
        if (!window.__spzEcoWatch) {
          window.__spzEcoWatch = setInterval(function() {
            if (ON && !getStyle()) addStyle();
          }, 2000);
        }
      } else {
        if (_origRAF && window.requestAnimationFrame === fakeRAF) {
          window.requestAnimationFrame = _origRAF;
          window.cancelAnimationFrame = _origCancel;
        }
        removeStyle();
        if (window.__spzEcoWatch) { clearInterval(window.__spzEcoWatch); window.__spzEcoWatch = null; }
        flush();
      }
    }
    window.__spzEcoSet = setOn;
    window.__spzEcoIsOn = function() { return ON; };
  }.toString() + ')();';
  try {
    webFrame.executeJavaScript(engineCode).then(function() {
      _ecoInstalled = true;
      // apply the desired state if IPC arrived before installation
      if (_ecoWanted !== null) {
        var v = _ecoWanted;
        _ecoWanted = null;
        applyEco(v);
      }
    }).catch(function(){});
  } catch(e) {}
})();

function applyEco(on) {
  try {
    var expr = 'if(window.__spzEcoSet){window.__spzEcoSet(' + (on ? 'true' : 'false') + ');window.__spzEcoIsOn();}else{false}';
    if (webFrame && webFrame.executeJavaScript) {
      webFrame.executeJavaScript(expr).catch(function(){});
    }
  } catch(e) {}
}
ipcRenderer.on('eco-freeze', function(_, data) {
  var on = !!(data && data.on);
  if (_ecoInstalled) applyEco(on);
  else _ecoWanted = on; // engine not installed yet — remember it, will apply after installation
});

// ============== VIM-LIKE CONTROLS (with modes) ==============
// The engine is ALWAYS installed (even if vim is disabled) and checks the
// window.__spzVimEnabled flag on every event. This allows enabling/disabling
// vim and changing the layout LIVE, without reloading pages: when settings change
// main.js broadcasts 'vim-settings-changed' → preload calls
// window.__spzVimUpdate({enabled, keys}) in the main world.
//
// Modes: normal | insert | visual | visualline | command | search | hint
// Scroll and selection are done by the engine itself; browser commands (new tab etc.)
// go through window.postMessage({__spzVim:true, action, arg}) → preload
// forwards them to the main process via IPC 'vim-action'.

// === Engine source (executed in the page's MAIN WORLD) ===
function __spzVimEngine() {
  if (window.__spzVimInstalled) return;
  window.__spzVimInstalled = true;

  // ============ STATE ============
  var MAP = {};
  var ENABLED = false;
  var MODE = 'normal';   // normal | insert | visual | visualline | hint
  var buf = '';
  var bufTimer = null;
  var marks = {};
  var hintBox = null, hints = [], hintBuf = '', hintOpenNewTab = false;
  var statusBar = null;
  // Special prefixes: 'm' (mark set), "'" (mark jump) — wait for the next key
  var pendingPrefix = null;
  // Count prefix: vim lets you type a number before a motion (e.g. 3j = down 3x)
  var countStr = '';

  // ============ HELPERS ============
  function normalizeKey(s) {
    if (!s) return '';
    s = String(s).trim();
    // Special case: the key itself is '+' or '-' (e.g. for zoomIn/zoomOut).
    // Otherwise '+'.split('+') === ['',''] and everything breaks.
    if (s === '+' || s === '-') return s;
    var parts = s.split('+').map(function (x) { return x.trim(); });
    if (parts.length === 1) return parts[0];
    var key = parts[parts.length - 1].toLowerCase();
    var mods = parts.slice(0, -1).map(function (m) { return m.toLowerCase(); }).filter(function (m) { return m; });
    mods.sort();
    return mods.length ? (mods.join('+') + '+' + key) : key;
  }
  function buildMap(keys) {
    var m = {};
    Object.keys(keys || {}).forEach(function (action) {
      var k = normalizeKey(keys[action]);
      if (k) m[k] = action;
    });
    return m;
  }
  // Converts a physical key (e.code) into a US (QWERTY) layout character.
  // Needed so vim commands work with ANY layout (Russian, etc.):
  // e.key gives the current layout's character (a Cyrillic letter instead of 'j'), while e.code gives the position.
  // Returns null if the code does not correspond to a letter/digit/symbol (then
  // the calling code uses e.key).
  var _LAT_SHIFT = { Digit0:')',Digit1:'!',Digit2:'@',Digit3:'#',Digit4:'$',Digit5:'%',
    Digit6:'^',Digit7:'&',Digit8:'*',Digit9:'(','Minus':'_','Equal':'+','BracketLeft':'{',
    'BracketRight':'}','Semicolon':':','Quote':'"','Comma':'<','Period':'>','Slash':'?',
    'Backslash':'|','Backquote':'~' };
  var _LAT_BASE = { Digit0:'0',Digit1:'1',Digit2:'2',Digit3:'3',Digit4:'4',Digit5:'5',
    Digit6:'6',Digit7:'7',Digit8:'8',Digit9:'9','Minus':'-','Equal':'=','BracketLeft':'[',
    'BracketRight':']','Semicolon':';',"Quote":"'","Comma":',','Period':'.','Slash':'/',
    'Backslash':'\\','Backquote':'`' };
  function _spzLatinChar(code, shift) {
    if (!code) return null;
    var m = /^Key([A-Z])$/.exec(code);
    if (m) return shift ? m[1] : m[1].toLowerCase();
    if (shift) return _LAT_SHIFT[code] || null;
    return _LAT_BASE[code] || null;
  }
  function isEditable() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    return false;
  }
  function vh() { return window.innerHeight || document.documentElement.clientHeight || 800; }
  function vw() { return window.innerWidth || document.documentElement.clientWidth || 1024; }
  // ====== Custom smooth-scroll (Chromium in Electron often disables
  // native behavior:'smooth', so we animate via requestAnimationFrame).
  var _animId = 0;
  function _ease(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
  function _doScrollTo(x, y) {
    try { window.scrollTo(x, y); } catch (e) {}
    try { if (document.documentElement) { document.documentElement.scrollLeft = x; document.documentElement.scrollTop = y; } } catch (e) {}
    try { if (document.body && document.body !== document.documentElement) { document.body.scrollLeft = x; document.body.scrollTop = y; } } catch (e) {}
  }
  function _doScrollBy(dx, dy) {
    var before = window.pageYOffset || 0;
    try { window.scrollBy(dx, dy); } catch (e) {}
    if ((window.pageYOffset || 0) === before) {
      try { if (document.documentElement) { document.documentElement.scrollLeft += dx; document.documentElement.scrollTop += dy; } } catch (e) {}
      try { if (document.body && document.body !== document.documentElement) { document.body.scrollLeft += dx; document.body.scrollTop += dy; } } catch (e) {}
    }
  }
  function _animateScroll(targetX, targetY, duration) {
    var startX = window.pageXOffset || window.scrollX || 0;
    var startY = window.pageYOffset || window.scrollY || (document.documentElement ? document.documentElement.scrollTop : 0) || 0;
    var dx = targetX - startX, dy = targetY - startY;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
      _doScrollTo(targetX, targetY);
      return;
    }
    if (_animId) try { cancelAnimationFrame(_animId); } catch (e) {}
    var rAF = window.requestAnimationFrame;
    if (!rAF) { _doScrollTo(targetX, targetY); return; }
    var t0 = null;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / duration);
      var e = _ease(p);
      _doScrollTo(startX + dx * e, startY + dy * e);
      if (p < 1) {
        try { _animId = rAF(step); } catch (er) { _animId = 0; }
      } else { _animId = 0; }
    }
    try { _animId = rAF(step); } catch (er) { _doScrollTo(targetX, targetY); }
  }
  function smoothBy(dx, dy, duration) {
    duration = duration || 220;
    var rAF = window.requestAnimationFrame;
    if (!rAF) { try { window.scrollBy(dx, dy); } catch(e) {}; try { _doScrollBy(dx, dy); } catch(e2) {} return; }
    if (_animId) try { cancelAnimationFrame(_animId); } catch (e) {}
    var t0 = null;
    var totalX = 0, totalY = 0;
    function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / duration);
      var e = _ease(p);
      var wantX = Math.round(dx * e);
      var wantY = Math.round(dy * e);
      var stepX = wantX - totalX;
      var stepY = wantY - totalY;
      if (stepX || stepY) {
        var before = window.pageYOffset || 0;
        try { window.scrollBy(stepX, stepY); } catch (er) {}
        var after = window.pageYOffset || 0;
        if (after === before && stepY) { _doScrollBy(stepX, stepY); }
        totalX = wantX; totalY = wantY;
      }
      if (p < 1) { try { _animId = rAF(step); } catch (er) { _animId = 0; } }
      else { _animId = 0; }
    }
    try { _animId = rAF(step); } catch (er) { try { window.scrollBy(dx, dy); } catch(e) {} }
  }
  function smoothTo(targetX, targetY, duration) {
    _animateScroll(targetX, targetY, duration || 450);
  }
  function smooth(x, y) { smoothBy(x, y, 180); }
  function sendAction(action, arg) {
    try { window.postMessage({ __spzVim: true, action: action, arg: arg }, '*'); } catch (e) {}
  }
  function setBuf(s) {
    buf = s;
    if (bufTimer) clearTimeout(bufTimer);
    bufTimer = setTimeout(function () { buf = ''; bufTimer = null; updateStatusBar(); }, 900);
    updateStatusBar();
  }

  // ============ STATUS BAR ============
  function ensureStatusBar() {
    if (statusBar && statusBar.parentNode) return statusBar;
    // document.documentElement can be null on very early injection —
    // the engine is launched via webFrame.executeJavaScript, and if the page
    // is not parsed yet, appendChild will throw. Return null — showStatus
    // will survive this (just will not show the badge).
    if (!document.documentElement) return null;
    statusBar = document.createElement('div');
    statusBar.id = '__spz_vim_status';
    statusBar.style.cssText =
      'position:fixed;bottom:8px;right:12px;z-index:2147483646;' +
      'background:rgba(28,28,38,0.94);color:#ffe08a;font:bold 11px/1.4 ui-monospace,Consolas,Menlo,monospace;' +
      'padding:4px 10px;border-radius:7px;pointer-events:none;display:none;' +
      'box-shadow:0 3px 10px rgba(0,0,0,.45);text-transform:uppercase;letter-spacing:.6px;' +
      'border:1px solid rgba(255,224,138,.25);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);';
    document.documentElement.appendChild(statusBar);
    return statusBar;
  }
  function showStatus(text, color) {
    var sb = ensureStatusBar();
    if (!sb) return;  // documentElement not ready yet — skip
    sb.textContent = text;
    if (color) sb.style.color = color;
    sb.style.display = 'block';
  }
  function hideStatus() { if (statusBar) statusBar.style.display = 'none'; }
  function updateStatusBar() {
    if (!ENABLED) { hideStatus(); return; }
    var label, color;
    if (MODE === 'normal') {
      label = buf ? ('— ' + buf.toUpperCase() + ' —') : 'NORMAL';
      color = '#ffe08a';
    } else if (MODE === 'insert') { label = '— INSERT —'; color = '#9ddca6'; }
    else if (MODE === 'visual') { label = '— VISUAL —'; color = '#f5b840'; }
    else if (MODE === 'visualline') { label = '— VISUAL LINE —'; color = '#f5b840'; }
    else if (MODE === 'hint') { label = hintOpenNewTab ? 'HINT → NEW TAB' : 'HINT'; color = '#ffb86c'; }
    else { label = MODE.toUpperCase(); color = '#ffe08a'; }
    showStatus(label, color);
  }
  function setMode(m) {
    MODE = m;
    updateStatusBar();
    // Report the current mode to chrome (renderer) — needed to know
    // whether keys can be forwarded from chrome to the webview (not in INSERT).
    try { sendAction('modeChange', m); } catch (e) {}
  }

  // ============ SCROLL ============
  function doScroll(action) {
    var h = vh();
    switch (action) {
      case 'scrollDown':       smoothBy(0, 90); return true;
      case 'scrollUp':         smoothBy(0, -90); return true;
      case 'scrollLeft':       smoothBy(-160, 0); return true;
      case 'scrollRight':      smoothBy(160, 0); return true;
      case 'scrollPageDown':   smoothBy(0, h - 40); return true;
      case 'scrollPageUp':     smoothBy(0, -(h - 40)); return true;
      case 'scrollHalfDown':   smoothBy(0, Math.round(h / 2)); return true;
      case 'scrollHalfUp':     smoothBy(0, -Math.round(h / 2)); return true;
      case 'scrollTop':        smoothTo(0, 0); return true;
      case 'scrollBottom':     smoothTo(0, document.documentElement.scrollHeight || (document.body && document.body.scrollHeight) || 100000); return true;
      case 'scrollLeftmost':   smoothTo(0, window.scrollY || 0); return true;
      case 'scrollRightmost':  smoothTo(document.documentElement.scrollWidth || 100000, window.scrollY || 0); return true;
    }
    return false;
  }

  // ============ LINK HINTS ============
  function clearHints() {
    if (hintBox && hintBox.parentNode) hintBox.parentNode.removeChild(hintBox);
    hintBox = null; hints = []; hintBuf = ''; hintOpenNewTab = false;
  }
  function startHints(openInNewTab) {
    clearHints();
    var sel = 'a[href],button,[onclick],input[type=submit],input[type=button],input[type=radio],input[type=checkbox],[role=button],area[href]';
    var nodes = Array.prototype.slice.call(document.querySelectorAll(sel));
    nodes = nodes.filter(function (n) {
      var r = n.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      if (r.bottom < 0 || r.top > vh() || r.right < 0 || r.left > vw()) return false;
      var cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') return false;
      return true;
    });
    if (!nodes.length) { setMode('normal'); return; }
    hintOpenNewTab = !!openInNewTab;
    hintBox = document.createElement('div');
    hintBox.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';
    document.documentElement.appendChild(hintBox);
    var alphabet = 'asdfghjklqwertyuiop';
    hints = nodes.map(function (n) {
      var r = n.getBoundingClientRect();
      var sp = document.createElement('div');
      sp.style.cssText =
        'position:fixed;left:' + (r.left + 4) + 'px;top:' + (r.top + 4) + 'px;' +
        'background:rgba(20,22,30,.95);color:#ffe08a;font:bold 11px/1.4 ui-monospace,Consolas,monospace;' +
        'padding:2px 6px;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,.6);border:1px solid rgba(255,224,138,.4);';
      hintBox.appendChild(sp);
      return { node: n, label: '', span: sp };
    });
    var n = hints.length;
    var len = Math.max(1, Math.ceil(Math.log(n) / Math.log(alphabet.length)));
    hints.forEach(function (h, idx) {
      var s = '', x = idx;
      for (var i = 0; i < len; i++) { s = alphabet[x % alphabet.length] + s; x = Math.floor(x / alphabet.length); }
      h.label = s; h.span.textContent = s;
    });
    setMode('hint');
  }
  function hintMatch(ch) {
    hintBuf += ch;
    var remaining = hints.filter(function (h) { return h.label.indexOf(hintBuf) === 0; });
    if (remaining.length === 0) { clearHints(); setMode('normal'); return; }
    if (remaining.length === 1) {
      var node = remaining[0].node;
      var url = '';
      try { url = node.href || ''; } catch (e) {}
      clearHints();
      if (hintOpenNewTab && url) {
        sendAction('openUrl', url);
      } else {
        try { node.focus(); } catch (e) {}
        try { node.click(); } catch (e) {}
      }
      setMode('normal');
      return;
    }
    hints.forEach(function (h) { h.span.style.visibility = h.label.indexOf(hintBuf) === 0 ? 'visible' : 'hidden'; });
  }

  // ============ COMMAND / SEARCH → delegate to Quick Commands ============
  // There is NO separate command-bar / search-bar inside the page: everything goes through
  // the browser's Quick Commands. This allows using a unified palette UI,
  // autocomplete, history, etc. On ':' we open QC with the ':' prefix,
  // on '/' — we open the browser's regular find bar (existing 'find' action).
  function openQC() { sendAction('openQC', ':'); }
  function openFind() { sendAction('find'); }
  function findNext() { sendAction('findNext'); }
  function findPrev() { sendAction('findPrev'); }

  // ============ VISUAL MODE ============
  function enterVisual(line) {
    // Start the selection from the current caret position / screen center
    try {
      var sel = window.getSelection();
      if (!sel.rangeCount) {
        var r = document.createRange();
        r.setStart(document.body, 0);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      } else {
        sel.collapseToStart();
      }
      if (line) {
        try { sel.modify('extend', 'right', 'lineboundary'); } catch (e) {}
      }
    } catch (e) {}
    setMode(line ? 'visualline' : 'visual');
  }
  function visualExtend(dir, gran) {
    try { window.getSelection().modify('extend', dir, gran); } catch (e) {}
  }
  function yankSelection() {
    var text = '';
    try { text = window.getSelection().toString(); } catch (e) {}
    if (text) {
      // Try to write to the clipboard
      try { document.execCommand('copy'); } catch (e) {}
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try { navigator.clipboard.writeText(text).catch(function () {}); } catch (e) {}
      }
    }
    // Reset the selection and return to normal
    try { window.getSelection().removeAllRanges(); } catch (e) {}
    setMode('normal');
    showStatus('YANKED', '#9ddca6');
    setTimeout(updateStatusBar, 800);
  }

  // ============ MARKS (m + letter / ' + letter) ============
  function setMark(letter) {
    marks[letter] = window.scrollY;
    showStatus('MARK ' + letter.toUpperCase(), '#9ddca6');
    setTimeout(updateStatusBar, 700);
  }
  function jumpMark(letter) {
    if (letter in marks) {
      smoothTo(0, marks[letter] || 0);
    }
  }

  // ============ PREV/NEXT PAGE ([[, ]]) ============
  function findRelLink(rel) {
    var sels = [
      'a[rel="' + rel + '"]',
      'a[rel=' + rel + ']'
    ];
    var candidates = [];
    sels.forEach(function (s) {
      try { candidates = candidates.concat(Array.prototype.slice.call(document.querySelectorAll(s))); } catch (e) {}
    });
    // Also: link text
    var patterns = rel === 'prev' ? /^(<|‹|←|«|previous|prev|назад|предыдущ)/i
                                  : /^(>|›|→|»|next|далее|следующ)/i;
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var t = (links[i].textContent || '').trim();
      if (t && patterns.test(t)) candidates.push(links[i]);
    }
    // Visibility filter
    candidates = candidates.filter(function (n) {
      var r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top > -10 && r.top < vh();
    });
    return candidates[0];
  }
  function goRel(rel) {
    var link = findRelLink(rel);
    if (link) {
      try { link.click(); } catch (e) {}
    } else {
      showStatus(rel === 'prev' ? 'NO PREV' : 'NO NEXT', '#ff8a8a');
      setTimeout(updateStatusBar, 800);
    }
  }

  // ============ ACTION DISPATCH ============
  function handleAction(action) {
    // Visual-dependent actions in visual mode
    if (MODE === 'visual' || MODE === 'visualline') {
      if (action === 'scrollDown' || action === 'scrollUp' ||
          action === 'scrollLeft' || action === 'scrollRight') {
        var dirMap = { scrollDown: ['down', 'line'], scrollUp: ['up', 'line'],
                       scrollLeft: ['left', 'character'], scrollRight: ['right', 'character'] };
        var dm = dirMap[action];
        if (dm) { visualExtend(dm[0], dm[1]); return; }
      }
    }
    switch (action) {
      case 'hint':      startHints(false); return;
      case 'hintTab':   startHints(true); return;
      case 'enterInsert':
        setMode('insert');
        showStatus('— INSERT (Esc to exit) —', '#9ddca6');
        return;
      case 'enterVisual':     enterVisual(false); return;
      case 'enterVisualLine': enterVisual(true); return;
      case 'enterCommand':    openQC(); return;       // ':' → Quick Commands
      case 'searchForward':   openFind(); return;     // '/' → browser find bar
      case 'find':            sendAction('find'); return;
      case 'searchNext':      findNext(); return;
      case 'searchPrev':      findPrev(); return;
      case 'yankUrl':
        try { var _href = (window.location && window.location.href) || ''; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(_href).catch(function(){}); } catch (e) {}
        showStatus('URL YANKED', '#9ddca6'); setTimeout(updateStatusBar, 900);
        return;
      case 'pasteUrl':        sendAction('pasteUrl'); return;
      case 'prevPage':        goRel('prev'); return;
      case 'nextPage':        goRel('next'); return;
      case 'stopLoad':        sendAction('stopLoad'); return;
      case 'zoomIn':          sendAction('zoomIn'); return;
      case 'zoomOut':         sendAction('zoomOut'); return;
      case 'zoomReset':       sendAction('zoomReset'); return;
    }
    if (doScroll(action)) return;
    // Browser commands are simply sent
    sendAction(action);
  }

  // ============ KEY HANDLER ============
  // Registered on WINDOW (not document) so it fires FIRST in the capture phase,
  // before any page-level listeners that might call stopImmediatePropagation()
  // and block the engine from seeing the key.
  window.addEventListener('keydown', function (e) {
    if (!ENABLED) return;

    // ===== INSERT MODE: everything passes through, Esc — exit =====
    if (MODE === 'insert') {
      if (e.key === 'Escape') {
        // Esc only if not in a real field — otherwise let the field handle it
        if (!isEditable()) {
          e.preventDefault(); e.stopPropagation();
          setMode('normal');
        }
      }
      return;
    }

    // ===== HINT MODE: only letters / Esc =====
    if (MODE === 'hint') {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); clearHints(); setMode('normal'); return; }
      // Latinize via e.code — otherwise with a Russian layout the labels (a,s,d...)
      // become impossible to press (the physical "a" yields a Cyrillic letter).
      var _hlat = _spzLatinChar(e.code || '', e.shiftKey);
      var _hkey = (_hlat !== null) ? _hlat : (e.key || '');
      if (/^[a-z]$/i.test(_hkey)) { e.preventDefault(); e.stopPropagation(); hintMatch(_hkey.toLowerCase()); return; }
      e.preventDefault(); e.stopPropagation(); clearHints(); setMode('normal'); return;
    }

    // ===== VISUAL MODE: Esc — exit, y — yank, motions extend selection =====
    if (MODE === 'visual' || MODE === 'visualline') {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation();
        try { window.getSelection().removeAllRanges(); } catch (er) {}
        setMode('normal'); return;
      }
      // next is the normal MAP processing, but with visual interpretation of actions
    }

    // ===== NORMAL MODE =====
    if (isEditable()) return; // do not break editing
    // Latinize via e.code — the vim map stores Latin characters ('j','g'...),
    // and with a Russian layout e.key yields Cyrillic and nothing matches.
    var _nlat = _spzLatinChar(e.code || '', e.shiftKey);
    var keyName = (_nlat !== null) ? _nlat : (e.key || '');
    // Ignore bare modifiers and some special keys
    if (['Control', 'Shift', 'Alt', 'Meta'].indexOf(keyName) !== -1) return;
    if (['Tab', 'Enter', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(keyName) !== -1 && !(e.ctrlKey || e.metaKey || e.altKey)) return;
    if (keyName === 'Escape') {
      // Esc in normal — reset buffer and exit special modes
      if (buf || pendingPrefix || countStr) { e.preventDefault(); e.stopPropagation(); }
      buf = ''; pendingPrefix = null; countStr = ''; if (bufTimer) { clearTimeout(bufTimer); bufTimer = null; }
      updateStatusBar();
      return;
    }

    // MARK mode: wait for a letter after 'm' or '\''
    if (pendingPrefix === 'm' && /^[a-zA-Z]$/.test(keyName) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault(); e.stopPropagation();
      setMark(keyName.toLowerCase());
      pendingPrefix = null; buf = '';
      return;
    }
    if (pendingPrefix === "'" && /^[a-zA-Z]$/.test(keyName) && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault(); e.stopPropagation();
      jumpMark(keyName.toLowerCase());
      pendingPrefix = null; buf = '';
      return;
    }
    pendingPrefix = null;

    // Build the key string
    var hasMod = e.ctrlKey || e.metaKey || e.altKey;
    var ch;
    if (hasMod) {
      ch = '';
      var _mods = [];
      if (e.ctrlKey || e.metaKey) _mods.push('ctrl');
      if (e.altKey) _mods.push('alt');
      _mods.sort();
      ch = _mods.join('+') + '+' + (keyName.length === 1 ? keyName.toLowerCase() : keyName.toLowerCase());
    } else if (e.shiftKey && keyName.length === 1) {
      ch = keyName; // 'J','G','H','L' etc. — uppercase is preserved
    } else {
      ch = keyName.length === 1 ? keyName.toLowerCase() : keyName.toLowerCase();
    }

    var combined = buf + ch;

    // MARK prefixes: if ch === 'm' or "'" and not in MAP as a standalone action
    if (!hasMod && !e.shiftKey && (ch === 'm' || ch === "'") && !MAP[ch] && !anyStartsWith(combined)) {
      e.preventDefault(); e.stopPropagation();
      pendingPrefix = ch; buf = '';
      showStatus(ch === 'm' ? 'MARK…' : 'JUMP…', '#c8a8ff');
      return;
    }

    // COUNT prefix: digits 1-9 start a count, 0 extends it (like vim).
    // '0' alone (no count) is the scrollLeftmost action — handled by MAP below.
    if (!hasMod && !e.shiftKey && !pendingPrefix) {
      if (countStr === '' && ch >= '1' && ch <= '9') {
        e.preventDefault(); e.stopPropagation();
        countStr = ch;
        showStatus(countStr, '#ffe08a');
        return;
      }
      if (countStr !== '' && ch >= '0' && ch <= '9') {
        e.preventDefault(); e.stopPropagation();
        countStr += ch;
        showStatus(countStr, '#ffe08a');
        return;
      }
    }

    var repeatCount = countStr ? parseInt(countStr, 10) : 1;

    if (MAP[combined]) {
      e.preventDefault(); e.stopPropagation();
      var a = MAP[combined]; buf = ''; countStr = ''; if (bufTimer) { clearTimeout(bufTimer); bufTimer = null; }
      try { for (var _ci = 0; _ci < repeatCount; _ci++) handleAction(a); } catch(_e) { try { handleAction(a); } catch(_e2) {} }
      updateStatusBar();
      return;
    }
    if (MAP[ch]) {
      e.preventDefault(); e.stopPropagation();
      var a2 = MAP[ch]; buf = ''; countStr = ''; if (bufTimer) { clearTimeout(bufTimer); bufTimer = null; }
      try { for (var _cj = 0; _cj < repeatCount; _cj++) handleAction(a2); } catch(_e3) { try { handleAction(a2); } catch(_e4) {} }
      updateStatusBar();
      return;
    }
    if (anyStartsWith(combined)) {
      e.preventDefault(); e.stopPropagation();
      setBuf(combined); return;
    }
    buf = ''; countStr = ''; if (bufTimer) { clearTimeout(bufTimer); bufTimer = null; } updateStatusBar();
  }, true);

  function anyStartsWith(prefix) {
    var found = false;
    Object.keys(MAP).forEach(function (k) {
      if (k.length > prefix.length && k.indexOf(prefix) === 0) found = true;
    });
    return found;
  }


  // Mouse click in an input field → automatically enter INSERT
  document.addEventListener('mousedown', function (e) {
    if (!ENABLED) return;
    if (MODE === 'normal' || MODE === 'visual' || MODE === 'visualline') {
      var t = e.target;
      if (t && t.tagName) {
        var tag = t.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable) {
          setMode('insert');
        }
      }
    }
  }, true);
  // If focus left the field → returned to normal
  document.addEventListener('blur', function (e) {
    if (!ENABLED) return;
    if (MODE === 'insert') {
      var t = e.target;
      if (t && t.tagName) {
        var tag = t.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable) {
          // a short timeout — focus may have moved to another input
          setTimeout(function () { if (!isEditable()) setMode('normal'); }, 0);
        }
      }
    }
  }, true);

  // ============ UPDATE ENTRY POINT ============
  window.__spzVimUpdate = function (settings) {
    if (!settings) return;
    ENABLED = !!(settings && settings.enabled);
    MAP = buildMap((settings && settings.keys) || {});
    if (!ENABLED && MODE !== 'normal') {
      try { window.getSelection().removeAllRanges(); } catch (e) {}
      clearHints();
      MODE = 'normal'; buf = ''; pendingPrefix = null;
    }
    updateStatusBar();
  };

  // ============ EXTERNAL EXEC (for Quick Commands) ============
  // The renderer calls this via tab.webview.executeJavaScript,
  // to switch modes / set marks / launch hint, etc.
  // from the QC command palette (instead of a separate in-page command bar).
  window.__spzVimExec = function (action, arg) {
    if (action === 'isEnabled') return ENABLED;
    if (action === 'getMode') return MODE;
    if (action === 'getKeys') return JSON.parse(JSON.stringify(MAP));
    if (!ENABLED) return false;
    switch (action) {
      case 'normal':       setMode('normal'); return true;
      case 'insert':       setMode('insert'); showStatus('— INSERT (Esc to exit) —', '#9ddca6'); return true;
      case 'visual':       enterVisual(false); return true;
      case 'visualLine':   enterVisual(true); return true;
      case 'hint':         startHints(false); return true;
      case 'hintTab':      startHints(true); return true;
      case 'markSet':      if (typeof arg === 'string' && arg.length) setMark(arg[0].toLowerCase()); return true;
      case 'markJump':     if (typeof arg === 'string' && arg.length) jumpMark(arg[0].toLowerCase()); return true;
      case 'yankUrl':
        try { var _h = (window.location && window.location.href) || ''; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(_h).catch(function(){}); } catch (e) {}
        showStatus('URL YANKED', '#9ddca6'); setTimeout(updateStatusBar, 900); return true;
      case 'scrollTop':    doScroll('scrollTop'); return true;
      case 'scrollBottom': doScroll('scrollBottom'); return true;
      case 'goRelPrev':    goRel('prev'); return true;
      case 'goRelNext':    goRel('next'); return true;
      default:
        // Pass unknown ones as a regular action name from the map
        if (MAP && Object.keys(MAP).some(function(k){return MAP[k]===action;})) {
          handleAction(action); return true;
        }
        return false;
    }
  };

  // Initial setup — defer if the DOM is not ready yet, so we do not
  // crash on appendChild(statusBar) when documentElement === null.
  function _vimBootstrap() {
    try { window.__spzVimUpdate(window.__spzVimInit || { enabled: false, keys: {} }); }
    catch(e) { /* retry later */ setTimeout(_vimBootstrap, 200); }
  }
  if (document && document.documentElement) {
    _vimBootstrap();
  } else if (document) {
    document.addEventListener('DOMContentLoaded', _vimBootstrap);
    // Just in case — a timer fallback
    setTimeout(_vimBootstrap, 500);
  }

  // ============ KEY INJECTION (for chrome → webview forwarding) ============
  // The renderer calls this from the chrome keydown handler to "inject"
  // a key into the engine — as if it were pressed directly in the page. This works
  // even when focus is on the URL bar / toolbar (but not in an input field — the renderer
  // checks that itself before calling).
  // Returns true if the engine is enabled and accepted the key (regardless of
  // whether it matched the MAP — the engine in NORMAL/VISUAL "swallows" it).
  // Returns false if the engine is disabled, in INSERT mode, or the key was
  // ignored (then chrome handles it itself).
  window.__spzVimInjectKey = function (key, shiftKey, ctrlKey, altKey, metaKey) {
    if (!ENABLED) return false;
    if (MODE === 'insert') return false;
    if (arguments.length < 1) return false;
    // Do not inject "bare" modifiers and service keys — let
    // chrome handle them itself.
    var k = String(key || '');
    if (['Control', 'Shift', 'Alt', 'Meta', 'Tab', 'Enter', 'Backspace',
         'Delete', 'CapsLock', 'ContextMenu', 'PrintScreen', 'NumLock',
         'ScrollLock', 'Pause', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
         'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(k) !== -1) {
      return false;
    }
    // Do not inject in HINT mode either — it has its own logic
    if (MODE === 'hint') return false;
    // Synthesize a KeyboardEvent and dispatch it on document — the engine itself
    // will resolve it via MAP, prefixes, and mode.
    try {
      var ev = new KeyboardEvent('keydown', {
        key: k,
        shiftKey: !!shiftKey,
        ctrlKey: !!ctrlKey,
        altKey: !!altKey,
        metaKey: !!metaKey,
        bubbles: true,
        cancelable: true
      });
      // Use the same path as a real keypress
      var handled = false;
      // Temporary "sniffer": if the engine called preventDefault, it means
      // the key matched the MAP or entered the prefix buffer.
      var origPD = ev.preventDefault;
      ev.preventDefault = function () { handled = true; origPD.call(ev); };
      try {
        document.dispatchEvent(ev);
      } catch (inner) {
        // Error inside the engine's listener (e.g. on a page without rAF).
        // preventDefault may have already been called — this is the signal that
        // the key was "accepted".
      }
      return handled;
    } catch (e) {
      return false;
    }
  };
}

(function injectVim() {
  // postMessage → ipc 'vim-action' bridge
  try {
    window.addEventListener('message', function (ev) {
      try {
        var d = ev.data;
        if (d && d.__spzVim && d.action) {
          ipcRenderer.send('vim-action', String(d.action), d.arg);
        }
      } catch (e) {}
    });
  } catch (e) {}

  // Live settings update
  try {
    ipcRenderer.on('vim-settings-changed', function (_, vim) {
      try {
        webFrame.executeJavaScript(
          'window.__spzVimUpdate && window.__spzVimUpdate(' + JSON.stringify(vim) + ')'
        ).catch(function () {});
      } catch (e) {}
    });
  } catch (e) {}

  // Engine installation + initial settings sync
  function syncInit(vim) {
    var init = 'window.__spzVimInit = ' + JSON.stringify(vim || { enabled: false, keys: {} }) + ';';
    try {
      webFrame.executeJavaScript(init).catch(function () {});
    } catch (e) {}
  }

  try {
    if (webFrame && webFrame.executeJavaScript) {
      // First set the init data, then launch the engine
      syncInit(_vimSettings);
      webFrame.executeJavaScript('(' + __spzVimEngine.toString() + ')()').catch(function () {});
    }
  } catch (e) {}
})();

// ============== TOR SECURITY LEVEL: SAFER (WebGL block) ==============
// 'safest' disables JS entirely via CSP in main.js — nothing to do here.
// 'safer' additionally blocks WebGL (on top of the usual sec.blockWebGL),
// so the level works independently of the other security toggles.
(function injectTorSafer() {
  try {
    var sec = (_all && _all.security) || {};
    if (sec.torLevel !== 'safer') return;
    var code = '(function(){' +
      'var _g=Symbol.for("spzTor");if(Navigator.prototype[_g]&32)return;' +
      'try{Object.defineProperty(Navigator.prototype,_g,{value:(Navigator.prototype[_g]||0)|32,enumerable:false,configurable:true});}catch(e){}' +
      // Spoofing WebGL parameters (similar to sec.blockWebGL, but for the safer level)
      'if(typeof WebGLRenderingContext!=="undefined"){' +
      '  var _gp=WebGLRenderingContext.prototype.getParameter;' +
      '  WebGLRenderingContext.prototype.getParameter=function(p){' +
      '    if(p===37445||p===37446||p===7937||p===7936)return"Tor Browser";' +
      '    return _gp.apply(this,arguments);' +
      '  };' +
      '}' +
      'if(typeof WebGL2RenderingContext!=="undefined"){' +
      '  var _gp2=WebGL2RenderingContext.prototype.getParameter;' +
      '  WebGL2RenderingContext.prototype.getParameter=function(p){' +
      '    if(p===37445||p===37446||p===7937||p===7936)return"Tor Browser";' +
      '    return _gp2.apply(this,arguments);' +
      '  };' +
      '}' +
      '})();';
    try {
      if (webFrame && webFrame.executeJavaScript) {
        webFrame.executeJavaScript(code).catch(function(){});
      }
    } catch(e) {}
  } catch(e) {}
})();

// ALWAYS-ON: spoof navigator.userAgentData + window.chrome + plugins —
// CRITICAL for Google sign-in. By default Electron exposes the "Electron" brand
// in navigator.userAgentData.brands and in the sec-ch-ua HTTP header. Besides,
// in Electron window.chrome is reduced (no chrome.runtime etc.) and navigator.plugins
// can be empty. Google detects all this and blocks account sign-in.
// We spoof it as Google Chrome. This code always runs.
(function injectChromeBrands() {
  var platform = process.platform === 'win32' ? 'Windows'
    : process.platform === 'darwin' ? 'macOS' : 'Linux';
  var code = '(function(){' +
    // Guard via a private Symbol — NOT visible in Object.keys(window) / for-in.
    // Previously this was window.__uaDataPatched — BotGuard found it by
    // enumerating window properties and detected that the UA was spoofed.
    'var _g=Symbol();' +
    'if(Navigator.prototype[_g])return;' +
    'try{Object.defineProperty(Navigator.prototype,_g,{value:1,enumerable:false,configurable:false});}catch(e){return;}' +
    // === Function.prototype.toString trap === BotGuard checks the descriptors
    // of overridden properties: Object.getOwnPropertyDescriptor(Navigator.prototype,
    // "userAgentData").get.toString() must return "...[native code]".
    // Without this our getter returns its own source = instant spoof detection.
    'var _origFTS=Function.prototype.toString;' +
    'var _nat=new WeakSet();' +
    'var _fts=function toString(){' +
    '  if(_nat.has(this))return "function "+(this.name||"")+"() { [native code] }";' +
    '  return _origFTS.call(this);' +
    '};' +
    '_nat.add(_fts);' +
    'try{Object.defineProperty(Function.prototype,"toString",{value:_fts,configurable:true,writable:true});}catch(e){}' +
    'var _mn=function(fn){try{_nat.add(fn);}catch(e){}return fn;};' +
    '_nat.add(_mn);' +
    'try{' +
    'var _brands=[{brand:"Chromium",version:"' + _chromeMajorVer + '"},{brand:"Not:A-Brand",version:"24"},{brand:"Google Chrome",version:"' + _chromeMajorVer + '"}];' +
    // fullVersionList for getHighEntropyValues — FULL versions, not major ones.
    // Google cross-checks uaFullVersion against fullVersionList — mismatch = spoof marker.
    'var _brandsFull=[{brand:"Chromium",version:"' + _chromeFullVer + '"},{brand:"Not:A-Brand",version:"24.0.0.0"},{brand:"Google Chrome",version:"' + _chromeFullVer + '"}];' +
    // IMPORTANT: use Object.create(NavigatorUAData.prototype) if the prototype
    // exists — otherwise BotGuard detects it via instanceof / toString.
    'var _proto=(typeof NavigatorUAData!=="undefined")?NavigatorUAData.prototype:null;' +
    'var _uaData=Object.create(_proto||Object.prototype);' +
    'Object.defineProperties(_uaData,{' +
    '  brands:{value:_brands,enumerable:true,configurable:true},' +
    '  mobile:{value:false,enumerable:true,configurable:true},' +
    '  platform:{value:"' + platform + '",enumerable:true,configurable:true},' +
    '  getHighEntropyValues:{value:function(hints){' +
    '    return Promise.resolve({' +
    '      brands:_brands,' +
    '      mobile:false,' +
    '      platform:"' + platform + '",' +
    '      platformVersion:"10.0.0",' +
    '      architecture:"x86",' +
    '      bitness:"64",' +
    '      model:"",' +
      '      uaFullVersion:"' + _chromeFullVer + '",' +
      '      fullVersionList:_brandsFull' +
    '    });' +
    '  },enumerable:true,configurable:true},' +
    '  toJSON:{value:function(){return {brands:_brands,mobile:false,platform:"' + platform + '"};},enumerable:true,configurable:true}' +
    '});' +
    'try{Object.defineProperty(Navigator.prototype,"userAgentData",{get:_mn(function(){return _uaData;}),configurable:true,enumerable:true});}catch(e){}' +
    'try{Object.defineProperty(navigator,"userAgentData",{get:_mn(function(){return _uaData;}),configurable:true,enumerable:true});}catch(e){}' +
    // userAgent is spoofed too — in incognito webview.setUserAgent may
    // not take effect before the first check, and navigator.userAgent
    // would expose the default Electron UA containing "Electron".
    'try{Object.defineProperty(Navigator.prototype,"userAgent",{get:_mn(function(){return "Mozilla/5.0 (' +
      (platform === 'Windows' ? 'Windows NT 10.0; Win64; x64' : platform === 'macOS' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'X11; Linux x86_64') +
      ') AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + _chromeFullVer + ' Safari/537.36";}),configurable:true});}catch(e){}' +
    'try{Object.defineProperty(Navigator.prototype,"appVersion",{get:_mn(function(){return "5.0 (' +
      (platform === 'Windows' ? 'Windows NT 10.0; Win64; x64' : platform === 'macOS' ? 'Macintosh; Intel Mac OS X 10_15_7' : 'X11; Linux x86_64') +
      ') AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + _chromeFullVer + ' Safari/537.36";}),configurable:true});}catch(e){}' +
    // Just in case, hide the webdriver flag (if any left)
    'try{Object.defineProperty(Navigator.prototype,"webdriver",{get:_mn(function(){return false;}),configurable:true});}catch(e){}' +
    // === window.chrome === real Chrome has a window.chrome object with runtime,
    // loadTimes, csi and app. In Electron it is reduced or missing — this is also a marker.
    'if(!window.chrome||typeof window.chrome!=="object"){window.chrome={};}' +
    'if(!window.chrome.runtime){window.chrome.runtime={' +
    '  OnInstalledReason:{CHROME_UPDATE:"chrome_update",INSTALL:"install",SHARED_MODULE_UPDATE:"shared_module_update",UPDATE:"update"},' +
    '  OnRestartRequiredReason:{APP_UPDATE:"app_update",OS_UPDATE:"os_update",PERIODIC:"periodic"},' +
    '  PlatformArch:{ARM:"arm",ARM64:"arm64",MIPS:"mips",MIPS64:"mips64",X86_32:"x86-32",X86_64:"x86-64"},' +
    '  PlatformOs:{ANDROID:"android",CROS:"cros",LINUX:"linux",MAC:"mac",OPENBSD:"openbsd",WIN:"win"},' +
    '  RequestUpdateCheckStatus:{NO_UPDATE:"no_update",THROTTLED:"throttled",UPDATE_AVAILABLE:"update_available"},' +
    '  connect:function(){return {onDisconnect:{addListener:function(){}},onMessage:{addListener:function(){}}};},' +
    '  sendMessage:function(){},onConnect:{addListener:function(){}},' +
    '  onMessage:{addListener:function(){}},id:undefined' +
    '};}' +
    'if(!window.chrome.loadTimes){window.chrome.loadTimes=function(){' +
    '  return {requestTime:Date.now()/1000,startLoadTime:Date.now()/1000,commitLoadTime:Date.now()/1000,finishDocumentLoadTime:Date.now()/1000,finishLoadTime:Date.now()/1000,firstPaintTime:0,firstPaintAfterLoadTime:0,connectionInformation:"h2",npnNegotiatedProtocol:"h2",wasAlternateProtocolAvailable:false,wasFetchedViaSpdy:true,wasNpnNegotiated:true};' +
    '};}' +
    'if(!window.chrome.csi){window.chrome.csi=function(){return {startE:Date.now(),onloadT:Date.now(),pageT:Date.now()-performance.timing.navigationStart,tran:15};};}' +
    'if(!window.chrome.app){window.chrome.app={isInstalled:false,InstallState:{DISABLED:"disabled",INSTALLED:"installed",NOT_INSTALLED:"not_installed"},RunningState:{CANNOT_RUN:"cannot_run",READY_TO_RUN:"ready_to_run",RUNNING:"running"},getDetails:function(){return null;},getIsInstalled:function(){return false;}};}' +
    // === navigator.plugins / mimeTypes === real Chrome exposes 3 built-in plugins
    // (PDF Viewer, Chrome PDF Viewer, Chromium PDF Viewer). Electron may expose an empty
    // list — Google/antibot systems check for this.
    'try{' +
    'var _fakePdfPlugin=function(name,desc,fn){' +
    '  var p={name:name,description:desc,filename:fn,length:1};' +
    '  var mt={type:"application/pdf",suffixes:"pdf",description:"Portable Document Format"};' +
    '  try{Object.defineProperty(p,"0",{get:function(){return mt;}});}catch(e){}' +
    '  return p;' +
    '};' +
    'var _plugins=[_fakePdfPlugin("PDF Viewer","Portable Document Format","internal-pdf-viewer"),_fakePdfPlugin("Chrome PDF Viewer","Portable Document Format","internal-pdf-viewer"),_fakePdfPlugin("Chromium PDF Viewer","Portable Document Format","internal-pdf-viewer")];' +
    'var _makePluginArray=function(arr){' +
    '  var o={length:arr.length};' +
    '  for(var i=0;i<arr.length;i++){o[i]=arr[i];o.item=function(j){return arr[j]||null;};o.namedItem=function(n){return arr.find(function(p){return p.name===n;})||null;};}' +
    '  return o;' +
    '};' +
    'var _pa=_makePluginArray(_plugins);' +
    'var _ma=_makePluginArray([{type:"application/pdf",suffixes:"pdf",description:"Portable Document Format",enabledPlugin:_plugins[0]}]);' +
    'try{Object.defineProperty(Navigator.prototype,"plugins",{get:_mn(function(){return _pa;}),configurable:true});}catch(e){}' +
    'try{Object.defineProperty(Navigator.prototype,"mimeTypes",{get:_mn(function(){return _ma;}),configurable:true});}catch(e){}' +
    // === window.outerWidth / outerHeight ===
    // In Electron with frameless window outerHeight===innerHeight.
    // Real Chrome: outerHeight = innerHeight + (tab bar ~36 + address bar ~48 + bookmarks ~28).
    // BotGuard checks this — equal values = embedded browser marker.
    'try{' +
    'var _bChrome=' + (platform === 'macOS' ? '100' : platform === 'Windows' ? '88' : '92') + ';' +
    'Object.defineProperty(window,"outerWidth",{get:_mn(function(){return window.innerWidth;}),configurable:true});' +
    'Object.defineProperty(window,"outerHeight",{get:_mn(function(){return window.innerHeight+_bChrome;}),configurable:true});' +
    '}catch(e){}' +
    // === navigator.deviceMemory === real Chrome exposes this (4 or 8).
    // Electron may not — always set it to 8 for desktop.
    'try{if(navigator.deviceMemory===undefined){Object.defineProperty(Navigator.prototype,"deviceMemory",{get:_mn(function(){return 8;}),configurable:true});}}catch(e){}' +
    // === navigator.connection === Network Information API.
    // Electron exposes this but BotGuard checks effectiveType/downlink/rtt.
    'try{' +
    'if(!navigator.connection){' +
    'var _ni=Object.create((typeof NetworkInformation!=="undefined")?NetworkInformation.prototype:Object.prototype);' +
    'Object.defineProperties(_ni,{' +
    'effectiveType:{value:"4g",enumerable:true,configurable:true},' +
    'rtt:{value:50,enumerable:true,configurable:true},' +
    'downlink:{value:10,enumerable:true,configurable:true},' +
    'saveData:{value:false,enumerable:true,configurable:true}' +
    '});' +
    'Object.defineProperty(Navigator.prototype,"connection",{get:_mn(function(){return _ni;}),configurable:true,enumerable:true});' +
    '}' +
    '}catch(e){}' +
    // === Permissions API consistency === real Chrome returns specific results
    // for navigator.permissions.query. BotGuard checks for anomalies.
    'try{' +
    'var _origQuery=navigator.permissions&&navigator.permissions.query;' +
    'if(_origQuery){' +
    'navigator.permissions.query=(function(orig){return function(desc){' +
    'if(desc&&desc.name==="notifications"){return Promise.resolve({state:"prompt",onchange:null});}' +
    'return orig.call(navigator.permissions,desc);' +
    '};})(_origQuery);_nat.add(navigator.permissions.query);}' +
    '}catch(e){}' +
    // === navigator.languages consistency === ensure array format matches Chrome
    'try{' +
    'if(!navigator.languages||navigator.languages.length===0){' +
    'Object.defineProperty(Navigator.prototype,"languages",{get:_mn(function(){return ["en-US","en"];}),configurable:true});' +
    '}' +
    '}catch(e){}' +
    '}catch(e){}' +
    '}catch(e){}' +
    '})();';
  // IMPORTANT: use ONLY webFrame.executeJavaScript — it bypasses CSP and
  // Trusted Types. Previously there was also injection via <script>.textContent,
  // but on pages with Trusted Types CSP (Google sign-in, GitHub, etc.) it
  // threw "This document requires 'TrustedScript' assignment" — this
  // showed up in the console and was an automation marker for BotGuard.
  try {
    if (webFrame && webFrame.executeJavaScript) {
      webFrame.executeJavaScript(code).catch(function(){});
    }
  } catch(e) {}
})();

(function injectPrefetch() {
  try {
    if (!_optSettings.prefetch) return;
    if (location.protocol === 'file:') return;
    var _prefetchSet = new Set();
    var _prefetchTimer = null;
    var _prefetchQueue = [];
    document.addEventListener('mouseover', function(e) {
      var el = e.target;
      while (el && el.tagName !== 'A') el = el.parentElement;
      if (!el || !el.href) return;
      if (el.href.indexOf('javascript:') === 0) return;
      if (_prefetchSet.has(el.href)) return;
      _prefetchSet.add(el.href);
      _prefetchQueue.push(el.href);
      if (!_prefetchTimer) {
        _prefetchTimer = setTimeout(function() {
          _prefetchTimer = null;
          for (var i = 0; i < _prefetchQueue.length; i++) {
            var h = _prefetchQueue[i];
            if (!document.querySelector('link[rel="prefetch"][href="' + h.replace(/"/g, '%22') + '"]')) {
              var link = document.createElement('link');
              link.rel = 'prefetch';
              link.href = h;
              document.head.appendChild(link);
            }
          }
          _prefetchQueue = [];
        }, 200);
      }
    }, { passive: true });
  } catch(e) {}
})();

(function injectAdBlockerScript() {
  try {
    var host = location.hostname || '';
    var isYouTube = host.indexOf('youtube.com') !== -1 || host.indexOf('youtu.be') !== -1;
    var isGeneral = host && host.indexOf('file://') === -1;

    var code = '';

    if (isYouTube) {
      code = [
        '(function(){',
        '  var _jsonParse=JSON.parse;',
        '  JSON.parse=function(t){',
        '    try{',
        '      var r=_jsonParse(t);',
        '      if(r){',
        '        if(r.adPlacements)delete r.adPlacements;',
        '        if(r.playerAds)delete r.playerAds;',
        '        if(r.adSlots)delete r.adSlots;',
        '        if(r.adBreakHeartbeatParams)delete r.adBreakHeartbeatParams;',
        '        if(r.adPlacementsAdbc)delete r.adPlacementsAdbc;',
        '        if(r.playabilityStatus&&r.playabilityStatus.status==="UNPLAYABLE")r.playabilityStatus.status="OK";',
        '        if(r.playabilityStatus&&r.playabilityStatus.messages)delete r.playabilityStatus.messages;',
        '        if(r.streamingData&&r.streamingData.serverAbrStreaming)delete r.streamingData.serverAbrStreaming;',
        '        if(r.responseContext&&r.responseContext.adCpn)delete r.responseContext.adCpn;',
        '        if(r.adCibcInfo)delete r.adCibcInfo;',
        '        var ps=r.playerResponse;',
        '        if(ps&&typeof ps==="object"){',
        '          if(ps.adPlacements)delete ps.adPlacements;',
        '          if(ps.playerAds)delete ps.playerAds;',
        '          if(ps.adSlots)delete ps.adSlots;',
        '        }',
        '        var ypc=r.ytConfigData;',
        '        if(ypc){}',
        '      }',
        '      return r;',
        '    }catch(e){return _jsonParse(t);}',
        '  };',
        '  function cleanYtObj(obj){',
        '    if(!obj||typeof obj!=="object")return obj;',
        '    try{',
        '      if(obj.adPlacements)delete obj.adPlacements;',
        '      if(obj.playerAds)delete obj.playerAds;',
        '      if(obj.adSlots)delete obj.adSlots;',
        '      if(obj.adBreakHeartbeatParams)delete obj.adBreakHeartbeatParams;',
        '      if(obj.adPlacementsAdbc)delete obj.adPlacementsAdbc;',
        '      if(obj.playabilityStatus){',
        '        if(obj.playabilityStatus.status==="UNPLAYABLE")obj.playabilityStatus.status="OK";',
        '        if(obj.playabilityStatus.messages)delete obj.playabilityStatus.messages;',
        '      }',
        '      if(obj.playerResponse&&typeof obj.playerResponse==="object"){',
        '        if(obj.playerResponse.adPlacements)delete obj.playerResponse.adPlacements;',
        '        if(obj.playerResponse.playerAds)delete obj.playerResponse.playerAds;',
        '      }',
        '    }catch(e){}',
        '    return obj;',
        '  }',
        '  var _ytDef=false;',
        '  try{',
        '    Object.defineProperty(window,"ytInitialPlayerResponse",{',
        '      configurable:true,',
        '      set:function(v){_ytDef=true;if(v)cleanYtObj(v);this._ytpr=v;},',
        '      get:function(){return this._ytpr;}',
        '    });',
        '  }catch(e){}',
        '  try{',
        '    Object.defineProperty(window,"ytInitialData",{',
        '      configurable:true,',
        '      set:function(v){if(v&&v.responseContext)delete v.responseContext.adCpn;this._ytid=v;},',
        '      get:function(){return this._ytid;}',
        '    });',
        '  }catch(e){}',
        '  var _origDefineProperty=Object.defineProperty;',
        '  Object.defineProperty=function(obj,prop,desc){',
        '    if(prop==="ytInitialPlayerResponse"&&obj===window){',
        '      if(desc&&desc.value)cleanYtObj(desc.value);',
        '    }',
        '    return _origDefineProperty.call(this,obj,prop,desc);',
        '  };',
        '  var _origFetch=window.fetch;',
        '  window.fetch=function(url){',
        '    var u=typeof url==="string"?url:(url&&url.url||"");',
        '    if(u.indexOf("timedtext")!==-1||u.indexOf("caption")!==-1||u.indexOf("get_transcript")!==-1){return _origFetch.apply(this,arguments);}',
        '    if(u.indexOf("player_heartbeat")!==-1||u.indexOf("get_midroll_")!==-1||u.indexOf("doubleclick.net")!==-1||u.indexOf("googlesyndication")!==-1||u.indexOf("/pagead/")!==-1||u.indexOf("youtube.com/pagead/")!==-1||u.indexOf("youtube.com/ptracking")!==-1||u.indexOf("youtube.com/api/stats/ads")!==-1){',
        '      return Promise.resolve(new Response("{}",{status:200,headers:{"content-type":"application/json"}}));',
        '    }',
        '    return _origFetch.apply(this,arguments);',
        '  };',
        '  var _origOpen=XMLHttpRequest.prototype.open;',
        '  var _origSend=XMLHttpRequest.prototype.send;',
        '  XMLHttpRequest.prototype.open=function(m,url){',
        '    this._url=url;',
        '    if(typeof url==="string"&&(url.indexOf("player_heartbeat")!==-1||url.indexOf("get_midroll_")!==-1||url.indexOf("doubleclick.net")!==-1||url.indexOf("googlesyndication")!==-1||url.indexOf("/pagead/")!==-1||url.indexOf("youtube.com/ptracking")!==-1||url.indexOf("youtube.com/api/stats/ads")!==-1)){',
        '      this._blockAd=true;',
        '    }',
        '    return _origOpen.apply(this,arguments);',
        '  };',
        '  XMLHttpRequest.prototype.send=function(){',
        '    if(this._blockAd){',
        '      try{',
        '        Object.defineProperty(this,"readyState",{value:4,writable:false,configurable:true});',
        '        Object.defineProperty(this,"status",{value:200,writable:false,configurable:true});',
        '        Object.defineProperty(this,"responseText",{value:"{}",writable:false,configurable:true});',
        '        Object.defineProperty(this,"response",{value:"{}",writable:false,configurable:true});',
        '      }catch(e){}',
        '      var self=this;',
        '      setTimeout(function(){',
        '        try{self.dispatchEvent(new Event("readystatechange"));}catch(e){}',
        '        try{self.dispatchEvent(new Event("load"));}catch(e){}',
        '        try{self.dispatchEvent(new Event("loadend"));}catch(e){}',
        '      },0);',
        '      return;',
        '    }',
        '    return _origSend.apply(this,arguments);',
        '  };',
        '  function _ytCleanAds(){',
        '    try{',
        '      var btns=document.querySelectorAll(".ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button");',
        '      for(var i=0;i<btns.length;i++){btns[i].click();}',
        '      var rm=document.querySelectorAll(".ytp-ad-overlay-container,ytd-ad-slot-renderer,#masthead-ad,ytd-companion-slot-renderer,ytd-promoted-sparkles-web-renderer");',
        '      for(var k=0;k<rm.length;k++){rm[k].remove();}',
        '      var richItem=document.querySelectorAll("ytd-rich-item-renderer");',
        '      for(var j=0;j<richItem.length;j++){',
        '        if(richItem[j].querySelector("#ad-badge"))richItem[j].remove();',
        '      }',
        '      var playerAd=document.querySelector(".ytp-ad-player-overlay");',
        '      if(playerAd){',
        '        var video=document.querySelector("video");',
        '        if(video&&video.duration){video.currentTime=video.duration;}',
        '      }',
        '    }catch(e){}',
        '  }',
        '  _ytCleanAds();',
        '  setInterval(_ytCleanAds,3000);',
        '})();'
      ].join('\n');
    }

    if (code) {
      // executeJavaScript bypasses CSP/Trusted Types (YouTube also uses TT).
      try {
        if (webFrame && webFrame.executeJavaScript) {
          webFrame.executeJavaScript(code).catch(function(){});
        }
      } catch(e) {}
    }
  } catch(e) {}
})();

(function blockMouseNavButtons() {
  try {
    window.addEventListener('mouseup', function(e) {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.button === 3) {
          try { window.history.back(); } catch(err) {}
        } else {
          try { window.history.forward(); } catch(err) {}
        }
      }
    }, true);
    window.addEventListener('mousedown', function(e) {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
    }, true);
  } catch(e) {}
})();

// ============== ELEMENT PICKER (Zapper) ==============
// Launched by calling window.electronAPI.startElementPicker() from the renderer.
// Highlights elements under the cursor; on click builds a CSS selector and sends it to main.
(function() {
  // _startElementPicker is defined in the preload's isolated world → has ipcRenderer
})();

var _pickerActive = false;
function _startElementPicker() {
  if (_pickerActive) { _stopElementPicker(); return; }
  if (document.readyState !== 'complete' && document.readyState !== 'interactive') {
    setTimeout(_startElementPicker, 100);
    return;
  }
  _pickerActive = true;

  // Overlay styles
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
  hint.innerHTML = 'Click an element to <b>hide it forever</b>. <kbd>Esc</kbd> — cancel, <kbd>U</kbd> — undo last.';
  document.documentElement.appendChild(hint);

  var lastHover = null;

  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    // 1) id
    if (el.id) {
      var id = el.id.trim();
      if (/^[A-Za-z][\w\-.:]*$/.test(id)) return '#' + CSS.escape(id);
    }
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement) {
      var part = node.nodeName.toLowerCase();
      if (node.id && /^[A-Za-z][\w\-.:]*$/.test(node.id.trim())) {
        parts.unshift('#' + CSS.escape(node.id.trim()));
        break;
      }
      var parent = node.parentElement;
      if (parent) {
        var siblings = Array.prototype.filter.call(parent.children, function(c) { return c.nodeName === node.nodeName; });
        if (siblings.length > 1) {
          var idx = Array.prototype.indexOf.call(parent.children, node) + 1;
          part += ':nth-of-type(' + idx + ')';
        }
      }
      parts.unshift(part);
      node = parent;
    }
    // Limit the length
    var sel = parts.join(' > ');
    if (sel.length > 200) {
      // fallback to the element's own classes
      if (el.className && typeof el.className === 'string') {
        var cls = el.className.trim().split(/\s+/).slice(0, 2).map(function(c) { return '.' + CSS.escape(c); }).join('');
        if (cls) return part_from_tag(el) + cls;
      }
    }
    return sel;
  }
  function part_from_tag(el) { return el.nodeName.toLowerCase(); }

  function _hov(e) {
    var t = e.target;
    if (!t || t === overlay || t === hint || t === document.body || t === document.documentElement) return;
    if (lastHover && lastHover !== t) lastHover.classList.remove('__spz_hover');
    t.classList.add('__spz_hover');
    lastHover = t;
  }
  function _click(e) {
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    var t = e.target;
    if (t === overlay || t === hint) return;
    var sel = buildSelector(t);
    _stopElementPicker();
    if (sel) {
      var domain = '';
      try { domain = window.location.hostname; } catch(err) {}
      ipcRenderer.send('element-picker-result', { domain: domain, selector: sel });
    }
  }
  function _key(e) {
    if (e.key === 'Escape') { e.preventDefault(); _stopElementPicker(); }
    else if (e.key && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      ipcRenderer.send('element-picker-result', { domain: window.location.hostname, selector: '__undo_last__' });
    }
  }

  document.addEventListener('mouseover', _hov, true);
  document.addEventListener('click', _click, true);
  document.addEventListener('keydown', _key, true);

  _stopElementPicker._cleanup = function() {
    document.removeEventListener('mouseover', _hov, true);
    document.removeEventListener('click', _click, true);
    document.removeEventListener('keydown', _key, true);
    if (lastHover) lastHover.classList.remove('__spz_hover');
    if (style.parentNode) style.parentNode.removeChild(style);
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (hint.parentNode) hint.parentNode.removeChild(hint);
    _pickerActive = false;
  };
}
function _stopElementPicker() {
  if (typeof _stopElementPicker._cleanup === 'function') {
    try { _stopElementPicker._cleanup(); } catch(e) {}
    _stopElementPicker._cleanup = null;
  }
}