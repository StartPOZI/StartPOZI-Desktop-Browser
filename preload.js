const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Window controls
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  onMaximizeChange: (callback) => {
    ipcRenderer.on('maximize-change', (_, isMaximized) => callback(isMaximized));
  },

  // New tab from main process (for middle-click etc.)
  onOpenInNewTab: (callback) => {
    ipcRenderer.on('open-in-new-tab', (_, url) => callback(url));
  },
  onNavigateCurrentTab: (callback) => {
    ipcRenderer.on('navigate-current-tab', (_, url) => callback(url));
  },
  onNavigateCurrentBack: (callback) => {
    ipcRenderer.on('navigate-current-back', () => callback());
  },
  onToolbarButtonsChanged: (callback) => {
    ipcRenderer.on('toolbar-buttons-changed', (_, buttons) => callback(buttons));
  },
  onToggleCustomizeMode: (callback) => {
    ipcRenderer.on('toggle-customize-mode', () => callback());
  },

  // Theme
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  getWindowOpacity: () => ipcRenderer.invoke('get-window-opacity'),
  setWindowOpacity: (opacity) => ipcRenderer.invoke('set-window-opacity', opacity),
  getTranslucentMode: () => ipcRenderer.invoke('get-translucent-mode'),
  setTranslucentMode: (on) => ipcRenderer.invoke('set-translucent-mode', on),
  onTranslucentModeChanged: (cb) => {
    const listener = (_, on) => cb(on);
    ipcRenderer.on('translucent-mode-changed', listener);
    return () => ipcRenderer.removeListener('translucent-mode-changed', listener);
  },
  onWindowOpacityChanged: (callback) => {
    ipcRenderer.on('window-opacity-changed', (_, opacity) => callback(opacity));
  },
  onThemeUpdated: (callback) => {
    ipcRenderer.on('theme-updated', (_, theme) => callback(theme));
  },
  onCustomizationUpdated: (callback) => {
    ipcRenderer.on('customization-updated', (_, settings) => callback(settings));
  },

  // Language (i18n)
  getLanguage: () => ipcRenderer.invoke('get-language'),
  setLanguage: (l) => ipcRenderer.invoke('set-language', l),
  getLocale: (l) => ipcRenderer.invoke('get-locale', l),
  onLanguageChanged: (callback) => {
    ipcRenderer.on('language-changed', (_, lang) => callback(lang));
  },
  onMainPageReloadNeeded: (callback) => {
    ipcRenderer.on('mainpage-reload-needed', () => callback());
  },

  // Search Engine
  getSearchEngine: () => ipcRenderer.invoke('get-search-engine'),
  setSearchEngine: (url) => ipcRenderer.invoke('set-search-engine', url),

  searchSuggest: (query) => ipcRenderer.invoke('search-suggest', query),

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

  // History
  getHistory: () => ipcRenderer.invoke('get-history'),
  addHistory: (entry) => ipcRenderer.invoke('add-history', entry),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  getSitePermissions: () => ipcRenderer.invoke('get-site-permissions'),
  setSitePermission: (domain, permission, value) => ipcRenderer.invoke('set-site-permission', domain, permission, value),
  removeSitePermissions: (domain) => ipcRenderer.invoke('remove-site-permissions', domain),
  setGeoOverride: (domain, coords) => ipcRenderer.invoke('set-geo-override', domain, coords),
  setCertException: (domain, allow) => ipcRenderer.invoke('set-cert-exception', domain, allow),
  getCertExceptions: () => ipcRenderer.invoke('get-cert-exceptions'),
  setHttpConsent: (domain, allow) => ipcRenderer.invoke('set-http-consent', domain, allow),
  getHttpConsent: (domain) => ipcRenderer.invoke('get-http-consent', domain),
  getCookies: () => ipcRenderer.invoke('get-cookies'),
  getCookiesForDomain: (domain) => ipcRenderer.invoke('get-cookies-for-domain', domain),
  removeCookie: (url, name) => ipcRenderer.invoke('remove-cookie', url, name),
  clearCookies: () => ipcRenderer.invoke('clear-cookies'),
  breakLoupe: () => ipcRenderer.invoke('break-loupe'),
  onHistoryUpdated: (callback) => {
    ipcRenderer.on('history-updated', () => callback());
  },

  // Downloads
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  getSessionDownloads: () => ipcRenderer.invoke('get-session-downloads'),
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

  // User Scripts
  getScripts: () => ipcRenderer.invoke('get-scripts'),
  saveScript: (script) => ipcRenderer.invoke('save-script', script),
  deleteScript: (id) => ipcRenderer.invoke('delete-script', id),
  toggleScript: (id, enabled) => ipcRenderer.invoke('toggle-script', id, enabled),
  getScriptsForPage: (url) => ipcRenderer.invoke('get-scripts-for-page', url),

  // Customization
  getCustomizationSettings: () => ipcRenderer.invoke('get-customization-settings'),
  saveCustomizationSettings: (settings) => ipcRenderer.invoke('save-customization-settings', settings),

  // Toolbar
  getToolbarButtons: () => ipcRenderer.invoke('get-toolbar-buttons'),
  saveToolbarButtons: (buttons) => ipcRenderer.invoke('save-toolbar-buttons', buttons),
  openInCurrentTab: (url) => ipcRenderer.send('open-in-current-tab', url),
  goBack: () => ipcRenderer.send('go-back'),

  // Bookmarks
  loadBookmarks: () => ipcRenderer.invoke('load-bookmarks'),
  addBookmark: (bookmark) => ipcRenderer.invoke('add-bookmark', bookmark),
  removeBookmark: (id) => ipcRenderer.invoke('remove-bookmark', id),
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
  toggleWindowFullscreen: () => ipcRenderer.invoke('toggle-window-fullscreen'),
  savePageAs: (url) => ipcRenderer.invoke('save-page-as', url),
  saveScreenshot: (pngBase64) => ipcRenderer.invoke('save-screenshot', pngBase64),
  copyScreenshot: (pngBase64) => ipcRenderer.invoke('copy-screenshot', pngBase64),

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

  openUrlFromSettings: (url) => ipcRenderer.invoke('open-url-from-settings', url),
  saveCurrentTabs: (tabs) => ipcRenderer.invoke('save-current-tabs', tabs),
  getSavedTabs: () => ipcRenderer.invoke('get-saved-tabs'),
  onAutofillCredentials: (callback) => {
    ipcRenderer.on('autofill-credentials', (_, creds) => callback(creds));
  },

  // Path to webview preload script — used by renderer to give internal pages
  // (like Settings.html) access to electronAPI
  getWebviewPreloadPath: () => ipcRenderer.invoke('get-webview-preload-path'),

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

  // Browser startup lock (appLock) — same master password, unlocks the whole
  // browser for the session.
  checkAppLock: () => ipcRenderer.invoke('check-app-lock'),
  verifyAppLock: (pw) => ipcRenderer.invoke('verify-app-lock', pw),
  appBiometricAuth: () => ipcRenderer.invoke('app-biometric-auth'),

  // Window state (maximize/focus) — used by the macOS-style controls
  onWindowStateChanged: (cb) => {
    const listener = (_, s) => cb(s);
    ipcRenderer.on('window-state-changed', listener);
    return () => ipcRenderer.removeListener('window-state-changed', listener);
  },
  onWindowFocusChanged: (cb) => {
    const listener = (_, state) => cb(state);
    ipcRenderer.on('window-focus-changed', listener);
    return () => ipcRenderer.removeListener('window-focus-changed', listener);
  },
  onWindowMinimized: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('window-minimized', listener);
    return () => ipcRenderer.removeListener('window-minimized', listener);
  },
  onWindowRestored: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('window-restored', listener);
    return () => ipcRenderer.removeListener('window-restored', listener);
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
  onPageQRScanRequest: (callback) => {
    ipcRenderer.on('request-page-qr-scan', () => callback());
  },
  sendPageQRResult: (result) => ipcRenderer.send('page-qr-result', result),

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

  // Profiles
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  createProfile: (name, avatar) => ipcRenderer.invoke('create-profile', name, avatar),
  deleteProfile: (id) => ipcRenderer.invoke('delete-profile', id),
  switchProfile: (id) => ipcRenderer.invoke('switch-profile', id),
  getActiveProfile: () => ipcRenderer.invoke('get-active-profile'),
  renameProfile: (id, name) => ipcRenderer.invoke('rename-profile', id, name),

  // Incognito
  createIncognitoTab: (url) => ipcRenderer.invoke('create-incognito-tab', url),
  clearIncognitoPartition: (partition) => ipcRenderer.invoke('clear-incognito-partition', partition),
  onIncognitoTab: (callback) => {
    ipcRenderer.on('open-incognito-tab', (_, url) => callback(url));
  },

  showContextMenu: (params) => ipcRenderer.send('show-context-menu', params),
  onContextMenuAction: (callback) => ipcRenderer.on('context-menu-action', (_, action) => callback(action)),
  contextMenuCopy: (text) => ipcRenderer.send('context-menu-copy', text),
  contextMenuOpenTab: (url) => ipcRenderer.send('context-menu-open-tab', url),
  contextMenuCopyImage: (dataUrl) => ipcRenderer.send('context-menu-copy-image', dataUrl),
  readClipboard: () => ipcRenderer.invoke('read-clipboard'),

  onShortcutAction: (callback) => ipcRenderer.on('shortcut-action', (_, data) => callback(data)),

  onWebviewDialog: (callback) => {
    ipcRenderer.on('show-webview-dialog', (_, data) => callback(data));
  },
  respondWebviewDialog: (dialogId, result) => ipcRenderer.send('webview-dialog-response', { dialogId, result }),
  onPermissionRequest: (callback) => {
    ipcRenderer.on('permission-request', (_, data) => callback(data));
  },
  // decision ∈ 'allow' | 'block' | 'session' | 'once' | 'dismiss'
  // Legacy boolean form (allow=true|false) is still accepted by main.
  respondPermissionRequest: (dialogId, decision) => ipcRenderer.send('permission-response', { dialogId: dialogId, decision: decision }),
  onPermissionRequestTimeout: (callback) => {
    ipcRenderer.on('permission-request-timeout', (_, data) => callback(data));
  },

  // Proxy
  getProxySettings: () => ipcRenderer.invoke('get-proxy-settings'),
  setProxySettings: (settings) => ipcRenderer.invoke('set-proxy-settings', settings),
  torStart: (settings) => ipcRenderer.invoke('tor-start', settings),
  torStop: () => ipcRenderer.invoke('tor-stop'),
  torCheck: () => ipcRenderer.invoke('tor-check'),
  torStatus: () => ipcRenderer.invoke('tor-status'),
  torNewNym: () => ipcRenderer.invoke('tor-newnym'),
  onTorBootstrap: (callback) => {
    ipcRenderer.on('tor-bootstrap', (_, pct) => callback(pct));
  },

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

  // Optimization
  getOptimizationSetting: (key) => ipcRenderer.invoke('get-optimization-setting', key),
  setOptimizationSetting: (key, val) => ipcRenderer.invoke('set-optimization-setting', key, val),
  getAllOptimizationSettings: () => ipcRenderer.invoke('get-all-optimization-settings'),
  onOptimizationSettingsChanged: (callback) => {
    ipcRenderer.on('optimization-settings-changed', () => callback());
  },

  // Security (batch)
  getAllSecuritySettings: () => ipcRenderer.invoke('get-all-security-settings'),

  // Task Manager
  getTaskManagerData: () => ipcRenderer.invoke('get-task-manager-data'),
  taskManagerAction: (action, tabId) => ipcRenderer.send('task-manager-action', action, tabId),
  onTaskManagerAction: (callback) => {
    ipcRenderer.on('task-manager-action', (_, data) => callback(data));
  },
  sendTabInfos: (infos) => ipcRenderer.send('tm-tabs-update', infos),

  // Translate
  translateText: (text, from, to) => ipcRenderer.invoke('translate-text', text, from, to),

  // Keybindings (редактор горячих клавиш)
  getKeybindings: () => ipcRenderer.invoke('get-keybindings'),
  setKeybinding: (action, binding) => ipcRenderer.invoke('set-keybinding', action, binding),
  resetKeybindings: () => ipcRenderer.invoke('reset-keybindings'),
  setKeybindingRecording: (on) => ipcRenderer.send('keybinding-recording', on),

  // Session Guard — запрос на принудительную проверку дублей
  sessionGuardScanAll: () => ipcRenderer.invoke('session-guard-scan'),
  onSessionGuardScanRequest: (callback) => {
    ipcRenderer.on('session-guard-scan-request', () => callback());
  },

  // Element Zapper
  getElementHidingRules: () => ipcRenderer.invoke('get-element-hiding-rules'),
  addElementHidingRule: (domain, selector) => ipcRenderer.invoke('add-element-hiding-rule', domain, selector),
  removeElementHidingRule: (domain, selector) => ipcRenderer.invoke('remove-element-hiding-rule', domain, selector),
  clearElementHidingDomain: (domain) => ipcRenderer.invoke('clear-element-hiding-domain', domain),
  getElementZapperEnabled: () => ipcRenderer.invoke('get-element-zapper-enabled'),
  setElementZapperEnabled: (val) => ipcRenderer.invoke('set-element-zapper-enabled', val),
  onElementHidingUpdated: (callback) => {
    ipcRenderer.on('element-hiding-updated', (_, data) => callback(data));
  },

  // Export / Import ALL settings as JSON
  settingsExportJson: () => ipcRenderer.invoke('settings-export-json'),
  settingsImportJson: () => ipcRenderer.invoke('settings-import-json'),
  settingsApplyImported: (data) => ipcRenderer.invoke('settings-apply-imported', data),

  // Memory pressure (auto-sleep tabs)
  onMemoryPressure: (callback) => {
    ipcRenderer.on('memory-pressure', (_, data) => callback(data));
  },

  // ===== Homepage (своя главная страница) =====
  getHomepage: () => ipcRenderer.invoke('get-homepage'),
  setHomepage: (hp) => ipcRenderer.invoke('set-homepage', hp),
  chooseHomepageFile: () => ipcRenderer.invoke('choose-homepage-file'),

  // ===== First-launch welcome tour =====
  isFirstLaunch: () => ipcRenderer.invoke('is-first-launch'),
  markWelcomed: () => ipcRenderer.invoke('mark-welcomed'),

  // ===== Vim-like управление =====
  getVimSettings: () => ipcRenderer.invoke('get-vim-settings'),
  setVimSettings: (settings) => ipcRenderer.invoke('set-vim-settings', settings),
  resetVimSettings: () => ipcRenderer.invoke('reset-vim-settings'),
  onVimAction: (callback) => {
    ipcRenderer.on('vim-action', (_, action) => callback(action));
  },
  // main.js шлёт это когда клавиша может быть vim-командой (chrome focus)
  onForwardVimKey: (callback) => {
    ipcRenderer.on('forward-vim-key', (_, info) => callback(info));
  },

  // ===== Tor security level (legacy + new hardening) =====
  getTorSecurityLevel: () => ipcRenderer.invoke('get-tor-security-level'),
  setTorSecurityLevel: (lvl) => ipcRenderer.invoke('set-tor-security-level', lvl),
  getTorHardening: () => ipcRenderer.invoke('get-tor-hardening'),
  setTorHardening: (settings) => ipcRenderer.invoke('set-tor-hardening', settings),

  // ===== Tor auto-detection =====
  detectTor: () => ipcRenderer.invoke('detect-tor'),
  ensureTorForOnion: () => ipcRenderer.invoke('ensure-tor-for-onion'),
  getSnowflakePreset: () => ipcRenderer.invoke('get-snowflake-preset'),

  // ===== URL cleaner =====
  cleanUrl: (url) => ipcRenderer.invoke('clean-url', url),
  onSecuritySettingsChanged: (cb) => ipcRenderer.on('security-settings-changed', cb),
});
