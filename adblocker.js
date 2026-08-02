const { ElectronBlocker } = require('@cliqz/adblocker-electron');
const { Request } = require('@cliqz/adblocker');
const fs = require('fs');
const path = require('path');

function getCacheDir() {
  const { app: electronApp } = require('electron');
  return path.join(electronApp.getPath('userData'), 'adblocker-cache');
}

function getStoragePath() {
  const { app: electronApp } = require('electron');
  return path.join(electronApp.getPath('userData'), 'settings.json');
}

const LISTS_VERSION = 7;

const LISTS = [
  'https://raw.githubusercontent.com/jnaklaas/blocklists/refs/heads/main/blocklists/google-ultra-strict.txt',    // Внимание: этот список очень строгий, может сломать reCAPTCHA и Google-шрифты
  'https://raw.githubusercontent.com/LanikSJ/ubo-filters/main/filters/combined-filters.txt',
  'https://raw.githubusercontent.com/hl2guide/curated-adblock-lists/refs/heads/main/lists/social-media.txt',
  'https://raw.githubusercontent.com/hant0508/uBlock-filters/master/filters.txt',
  'https://phishing.army/download/phishing_army_blocklist_extended.txt',
  'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_11_Mobile/filter.txt',
  'https://easylist-downloads.adblockplus.org/easylistfrench.txt',
  'https://easylist-downloads.adblockplus.org/easylistgermany.txt',
  'https://easylist-downloads.adblockplus.org/easylistchina.txt',
  'https://big.oisd.nl/',
  'https://raw.githubusercontent.com/mainzelM/ddg-tr-as-easylist/master/easylist/RU/maximum.txt',
  'https://raw.githubusercontent.com/mainzelM/ddg-tr-as-easylist/master/easylist/topsites/malware.txt',
  'https://raw.githubusercontent.com/mainzelM/ddg-tr-as-easylist/master/easylist/US/maximum.txt',
  'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_2_Base/filter.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances.txt',
  'https://s3.amazonaws.com/lists.disconnect.me/simple_tracking.txt',
  'https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/nocoin.txt',
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
  'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_1_Russian/filter.txt',
  'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_3_Spyware/filter.txt',
  'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_4_Social/filter.txt',
  'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_14_Annoyances/filter.txt',
  'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_17_TrackParam/filter.txt',
  'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_18_Annoyances_Cookies/filter.txt',
  'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_19_Annoyances_Popups/filter.txt',
  'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_21_Annoyances_Other/filter.txt',
  'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_22_Annoyances_Widgets/filter.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/privacy.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/quick-fixes.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/unbreak.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/badware.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances-others.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/annoyances-cookies.txt',
  'https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-online.txt',
  'https://secure.fanboy.co.nz/fanboy-annoyance_ubo.txt',
  'https://secure.fanboy.co.nz/fanboy-social.txt',
  'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/tif.txt',
  'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/fake.txt',
  'https://raw.githubusercontent.com/Spam404/lists/master/adblock-list.txt',
  "https://raw.githubusercontent.com/DandelionSprout/adfilt/master/Dandelion%20Sprout's%20Anti-Malware%20List.txt",
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/resource-abuse.txt',
  'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=adblockplus&showintro=1&mimetype=plaintext',
  'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/pro.plus.txt',
];


var CUSTOM_FILTERS = [
  '||doubleclick.net^',
'||googlesyndication.com^',
'||googleadservices.com^',
'||adservice.google.com^',
'||adservice.google.ca^',
'||adservice.google.co.uk^',
'||adservice.google.ru^',
'||ads.youtube.com^',
'||pagead2.googlesyndication.com^',
'||tpc.googlesyndication.com^',
'||ad.doubleclick.net^',
'||adnxs.com^',
'||adsrvr.org^',
'||adroll.com^',
'||moatads.com^',
'||scorecardresearch.com^',
'||adsafeprotected.com^',
'||rubiconproject.com^',
'||pubmatic.com^',
'||openx.net^',
'||casalemedia.com^',
'||criteo.com^',
'||criteo.net^',
'||taboola.com^',
'||outbrain.com^',
'||zergnet.com^',
'||sharethrough.com^',
'||indexexchange.com^',
'||bidswitch.com^',
'||amazon-adsystem.com^',
'||aax.amazon-adsystem.com^',
'||advertising.amazon.com^',
'||ads.js$script',
'||pagead.js$script',
'||ads.min.js$script',
'||ads.min.css$stylesheet',
'||prebid.js$script',
'||prebid.min.js$script',
'||gpt.js$script',
'||googletagmanager.com/gtag/js$script',
'/^https?:\/\/[a-z0-9-]+\.([a-z]{2,6})\/[a-z]{1,10}\/[a-z]{1,10}\.js\?v=[0-9]{1,10}$/$script,third-party',
'/adserver/$script',
'/ads.js$script',
'/pagead/js/$script',
'/pagead2/$script',
'||ads-twitter.com^',
'||analytics.twitter.com^',
'||t.co/i/adsct$xmlhttprequest',
'||facebook.net/signals/$script',
'||connect.facebook.net/en_US/fbevents.js$script',
'||graph.facebook.com/v*/$xmlhttprequest',
  '||ads.tiktok.com^',
  '||analytics.tiktok.com^',
  '||ads-api.tiktok.com^',
  '||ads-service.tiktok.com^',
  '||t.tiktok.com^',
  '||log.tiktokv.com^',
  '||mon.tiktokv.com^',
  '||api16-access-sg.tiktokv.com^',
  '||tiktokv.com/aweme/v1/event^',
  '/pagead/js/adsbygoogle^',
  '/pagead/managed/js/adsense^',
  '||adservice.google.com^$important',
  '||pagead2.googlesyndication.com^$important',
  '||doubleclick.net^$important',
  '||googlesyndication.com^$important',
  '||googleadservices.com^$important',
  '||google-analytics.com^',
  '||googletagmanager.com^',
  '||ssl.google-analytics.com^',
  '||www.google-analytics.com^',
  '/gtag/js^',
'||ads.vk.com^',
'||vk.com/js/al/ad_loader.js$script',
'||ad.mail.ru^',
'||ad.rambler.ru^',
'||ads.mail.ru^',
'||yandex.ru/analytics/$script',
'||mc.yandex.ru/metrika/$script',
'||an.yandex.ru^',
  '||adfox.yandex.ru^',
  '||ads.yandex.ru^',
  'youtube.com##.ytp-ad-module',
  'youtube.com##.ytp-ad-overlay-container',
  'youtube.com##.ytp-ad-text-overlay',
  'youtube.com##.ytp-ad-player-overlay',
  'youtube.com##.ytp-ad-preview-container',
  'youtube.com##.video-ads',
  'youtube.com##.ytp-ad-skip-button-slot',
  'youtube.com##.ytp-ad-message-container',
  'youtube.com##.ytp-ad-persistent-progress-bar-container',
  'youtube.com##.ytp-ad-progress-bar',
  'youtube.com##.ytp-ad-player-overlay-layout',
  'youtube.com##.ytp-ad-overlay-close-button',
  'youtube.com##.ytp-ad-slot',
  'youtube.com##.ytp-ad-action-interstitial',
  'youtube.com##ytd-ad-slot-renderer',
  'youtube.com##ytd-banner-promo-renderer',
  'youtube.com##ytd-statement-banner-renderer',
  'youtube.com##ytd-in-feed-ad-layout-renderer',
  'youtube.com##ytd-promoted-sparkles-web-renderer',
  'youtube.com##ytd-display-ad-renderer',
  'youtube.com##ytd-promoted-video-renderer',
  'youtube.com##ytd-action-companion-ad-renderer',
  'youtube.com##.ytd-mealbar-promo-renderer',
  'youtube.com##ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
  'youtube.com##ytd-video-masthead-ad-v3-renderer',
  'youtube.com##ytd-rich-item-renderer:has(.ytd-ad-slot-renderer)',
  'youtube.com##ytd-search-pyv-renderer',
 '||amazon-adsystem.com^',
 '||amazonads.com^',
 '||msn.com/ads^',
 '||bing.com/ads^',
];

var TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid',
  'mc_eid', 'mc_cid', '_ga', '_gl', '_hsenc', '_hsmi',
  'hsCtaTracking', 'vero_id', 'oly_anon_id', 'oly_enc_id',
  'otc', 'igshid', 'wickedid', 'twclid', 'ttclid',
  'li_fat_id', 'li_shid', 'spm', 'scm',
];

var HARDBLOCK_DOMAINS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'adservice.google.com', 'adservice.google.ca', 'adservice.google.co.uk',
  'adservice.google.ru', 'ads.youtube.com', 'pagead2.googlesyndication.com',
  'tpc.googlesyndication.com', 'ad.doubleclick.net',
  'ads.tiktok.com', 'analytics.tiktok.com', 'ads-api.tiktok.com',
  'ads-service.tiktok.com', 't.tiktok.com',
  'log.tiktokv.com', 'mon.tiktokv.com',
  'google-analytics.com', 'googletagmanager.com', 'ssl.google-analytics.com',
  'ads.twitter.com', 'analytics.twitter.com',
  'adnxs.com', 'adsrvr.org', 'adroll.com', 'moatads.com',
  'scorecardresearch.com', 'adsafeprotected.com',
  'rubiconproject.com', 'pubmatic.com', 'openx.net',
  'casalemedia.com', 'criteo.com', 'criteo.net',
  'taboola.com', 'outbrain.com', 'zergnet.com', 'sharethrough.com',
  'indexexchange.com', 'bidswitch.com',
  'amazon-adsystem.com', 'aax.amazon-adsystem.com',
  'advertising.amazon.com',
  'adfox.yandex.ru', 'ads.yandex.ru', 'an.yandex.ru',
  'ad.mail.ru', 'ad.rambler.ru', 'ads.mail.ru',
  'connect.facebook.net', 'graph.facebook.com',
  'ads.vk.com',
];

function isHardblocked(url) {
  try {
    var hostname = new URL(url).hostname;
    // Белый список: домены, критичные для входа в Google и других сервисов.
    // Никогда не блокируем их, даже если они попали в HARDBLOCK_DOMAINS
    // или совпали с фильтром. Без этого ломается OAuth/2FA/sign-in flow.
    for (var i = 0; i < AUTH_WHITELIST.length; i++) {
      var w = AUTH_WHITELIST[i];
      if (hostname === w || hostname.endsWith('.' + w)) return false;
    }
    for (var i = 0; i < HARDBLOCK_DOMAINS.length; i++) {
      var d = HARDBLOCK_DOMAINS[i];
      if (hostname === d || hostname.endsWith('.' + d)) return true;
    }
  } catch(e) {}
  return false;
}

// Домены, которые НЕ блокируются никогда — ТОЛЬКО для аутентификации.
// Не добавляем сюда www.google.com / play.google.com и т.п. — это слишком
// широкие домены, они разрешили бы рекламу и трекеры со всего Google.
var AUTH_WHITELIST = [
  'accounts.google.com',
  'myaccount.google.com',
  'signin.google.com',
  'accounts.youtube.com',
  'oauth2.googleapis.com',
  'securetoken.googleapis.com',
  'identitytoolkit.googleapis.com',
  'ssl.gstatic.com',
  'www.recaptcha.net',
  'recaptcha.net',
];
// Домены, которые НЕ блокируем ТОЛЬКО если запрос идёт со страницы входа
// (по referrer/origin). play.google.com/log — телеметрия BotGuard во время
// входа; глобально блокируется, но пропускается на OAuth-страницах, иначе
// ERR_UNSAFE_REDIRECT ломает anti-abuse challenge и вход отклоняется.
var AUTH_CONTEXT_DOMAINS = [
  'play.google.com',
  'www.google.com'
];
function isAuthContextAllowed(details) {
  try {
    var reqHost = new URL(details.url).hostname;
    var secondary = false;
    for (var i = 0; i < AUTH_CONTEXT_DOMAINS.length; i++) {
      var d = AUTH_CONTEXT_DOMAINS[i];
      if (reqHost === d || reqHost.endsWith('.' + d)) { secondary = true; break; }
    }
    if (!secondary) return false;
    // Запрос должен исходить со страницы входа (accounts.google.com и т.д.)
    var src = details.referrer || details.originUrl || '';
    if (!src) return false;
    var srcHost = '';
    try { srcHost = new URL(src).hostname; } catch(e) { return false; }
    for (var j = 0; j < AUTH_WHITELIST.length; j++) {
      var w = AUTH_WHITELIST[j];
      if (srcHost === w || srcHost.endsWith('.' + w)) return true;
    }
    return false;
  } catch(e) { return false; }
}
function isAuthWhitelisted(url) {
  try {
    var hostname = new URL(url).hostname;
    for (var i = 0; i < AUTH_WHITELIST.length; i++) {
      var w = AUTH_WHITELIST[i];
      if (hostname === w || hostname.endsWith('.' + w)) return true;
    }
  } catch(e) {}
  return false;
}

let blocker = null;
let enabled = true;
let sessionStats = { blocked: 0, trackers: 0, ads: 0 };
let pageStats = {};
let whitelist = [];
let currentSession = null;
let blockedLog = [];
let _logSaveTimer = null;

function _debouncedLogSave() {
  if (_logSaveTimer) return;
  _logSaveTimer = setTimeout(function() {
    _logSaveTimer = null;
    saveSettings();
  }, 30000);
}

function loadSettings() {
  try {
    const storagePath = getStoragePath();
    if (fs.existsSync(storagePath)) {
      const store = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
      enabled = store.adblockerEnabled !== undefined ? store.adblockerEnabled : true;
      whitelist = store.adblockerWhitelist || [];
      blockedLog = store.blockedLog || [];
    }
  } catch(e) {}
}

function saveSettings() {
  try {
    const storagePath = getStoragePath();
    const store = fs.existsSync(storagePath) ? JSON.parse(fs.readFileSync(storagePath, 'utf-8')) : {};
    store.adblockerEnabled = enabled;
    store.adblockerWhitelist = whitelist;
    store.blockedLog = blockedLog.slice(-5000);
    fs.writeFileSync(storagePath, JSON.stringify(store, null, 2), 'utf-8');
  } catch(e) {}
}

function addBlockedLogEntry(details, type) {
  try {
    var url = details.url || '';
    var domain = '';
    try { domain = new URL(url).hostname; } catch(e) {}
    blockedLog.push({
      url: url,
      domain: domain,
      type: details.resourceType || 'other',
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      timestamp: Date.now()
    });
    if (blockedLog.length > 5000) blockedLog = blockedLog.slice(-4000);
    _debouncedLogSave();
  } catch(e) {}
}

function getBlockedLog() {
  return blockedLog;
}

function clearBlockedLog() {
  blockedLog = [];
  saveSettings();
}

function ensureCacheDir() {
  var dir = getCacheDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function makeResponse(text) {
  return { text: function() { return Promise.resolve(text); } };
}

function cachedFetcher(fetch) {
  return function(url) {
    return new Promise(function(resolve) {
      var cacheDir = ensureCacheDir();
      var cacheFile = path.join(cacheDir, Buffer.from(url).toString('base64').replace(/\//g, '_').replace(/\+/g, '-') + '.txt');

      if (fs.existsSync(cacheFile)) {
        var stat = fs.statSync(cacheFile);
        if (Date.now() - stat.mtimeMs < 24 * 60 * 60 * 1000) {
          resolve(makeResponse(fs.readFileSync(cacheFile, 'utf-8')));
          return;
        }
      }

      var timeout = new Promise(function(res) { setTimeout(function() { res(null); }, 30000); });

      Promise.race([
        fetch(url).then(function(resp) { if (!resp.ok) return null; return resp.text(); }),
                   timeout
      ]).then(function(text) {
        if (text) {
          try { ensureCacheDir(); fs.writeFileSync(cacheFile, text, 'utf-8'); } catch(e) {}
          resolve(makeResponse(text));
        } else if (fs.existsSync(cacheFile)) {
          resolve(makeResponse(fs.readFileSync(cacheFile, 'utf-8')));
        } else {
          console.warn('[adblocker] Failed to fetch:', url);
          resolve(makeResponse(''));
        }
      }).catch(function() {
        if (fs.existsSync(cacheFile)) {
          resolve(makeResponse(fs.readFileSync(cacheFile, 'utf-8')));
        } else {
          console.warn('[adblocker] Failed to fetch:', url);
          resolve(makeResponse(''));
        }
      });
    });
  };
}

function isWhitelistedUrl(url) {
  try {
    var hostname = new URL(url).hostname;
    for (var i = 0; i < whitelist.length; i++) {
      if (hostname === whitelist[i] || hostname.endsWith('.' + whitelist[i])) {
        return true;
      }
    }
  } catch(e) {}
  return false;
}

function updateStats(details, type) {
  var tabId = details.webContentsId || 'unknown';
  if (!pageStats[tabId]) pageStats[tabId] = { blocked: 0, trackers: 0, ads: 0 };
  if (type === 'blocked') {
    sessionStats.blocked++;
    sessionStats.ads++;
    pageStats[tabId].blocked++;
    pageStats[tabId].ads++;
    addBlockedLogEntry(details, 'blocked');
  } else if (type === 'redirected') {
    sessionStats.trackers++;
    pageStats[tabId].trackers++;
    addBlockedLogEntry(details, 'tracker');
  }
}

function getCosmeticFilters(url) {
  if (!blocker || !enabled) return { css: '', scripts: [] };
  try {
    var tldts = require('tldts-experimental');
    var parsed = tldts.parse(url);
    var hostname = parsed.hostname || '';
    var domain = parsed.domain || '';
    var result = blocker.getCosmeticsFilters({
      domain: domain,
      hostname: hostname,
      url: url,
      getBaseRules: true,
      getInjectionRules: true,
      getExtendedRules: true,
      getRulesFromHostname: true,
      getRulesFromDOM: false,
    });
    if (result.active === false) return { css: '', scripts: [] };
    return {
      css: result.styles || '',
      scripts: result.scripts || [],
    };
  } catch(e) {
    return { css: '', scripts: [] };
  }
}

async function initBlocker(session) {
  loadSettings();
  var cacheDir = ensureCacheDir();
  var enginePath = path.join(cacheDir, 'engine.bin');
  var versionPath = path.join(cacheDir, 'lists-version');
  var needReload = false;
  try {
    var savedVersion = fs.readFileSync(versionPath, 'utf-8').trim();
    if (String(savedVersion) !== String(LISTS_VERSION)) needReload = true;
  } catch(e) { needReload = true; }
  if (needReload) {
    try { fs.unlinkSync(enginePath); } catch(e) {}
    try { fs.unlinkSync(path.join(cacheDir, 'custom-applied')); } catch(e) {}
    console.log('[adblocker] Lists version changed, forcing reload');
  }
  currentSession = session;

  try {
    var buffer = await fs.promises.readFile(enginePath);
    blocker = ElectronBlocker.deserialize(buffer);
    console.log('[adblocker] Loaded from cache');
  } catch(e) {}

  if (!blocker) {
    try {
      blocker = await ElectronBlocker.fromLists(
        cachedFetcher(fetch),
                                                LISTS,
                                                {
                                                  loadCosmeticFilters: true,
                                                  loadNetworkFilters: true,
                                                }
      );

      console.log('[adblocker] Loaded from filter lists');
      try {
        fs.writeFileSync(enginePath, blocker.serialize());
        fs.writeFileSync(versionPath, String(LISTS_VERSION), 'utf-8');
        console.log('[adblocker] Engine cached to disk');
      } catch(writeErr) {
        console.error('[adblocker] Failed to cache engine:', writeErr.message);
      }
    } catch(e) {
      console.error('[adblocker] fromLists failed:', e.message);
      try {
        blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
        console.log('[adblocker] Loaded from prebuilt fallback');
        try {
          fs.writeFileSync(enginePath, blocker.serialize());
          fs.writeFileSync(versionPath, String(LISTS_VERSION), 'utf-8');
        } catch(e3) {}
      } catch(e2) {
        console.error('[adblocker] Failed to init:', e2.message);
        return;
      }
    }
  }

  if (blocker) {
    try {
      var markerPath = path.join(cacheDir, 'custom-applied');
      if (!fs.existsSync(markerPath)) {
        blocker.updateFromDiff({ added: CUSTOM_FILTERS, removed: [] });
        fs.writeFileSync(enginePath, blocker.serialize());
        fs.writeFileSync(markerPath, Date.now().toString());
        console.log('[adblocker] Custom filters injected and cached:', CUSTOM_FILTERS.length);
      } else {
        console.log('[adblocker] Custom filters already in cache, skipping');
      }
    } catch(e) {
      console.warn('[adblocker] Custom filters failed:', e.message);
    }
  }

  if (blocker && enabled) {
    blocker.enableBlockingInSession(session);
  }

  return blocker;
}

 function reEnable(session, secBeforeRequest) {
  if (!blocker) return;
  try { session.webRequest.onBeforeRequest(null); } catch(e) {}
  if (!enabled) return;
  blocker.disableBlockingInSession(session);

  function shouldAllow(details) {
    // Белый список доменов аутентификации — пропускаем всегда,
    // даже если фильтр (EasyList/uBlock) совпал
    if (isAuthWhitelisted(details.url)) return true;
    // Контекстные домены (play.google.com и др.) — пропускаем только если
    // запрос идёт со страницы входа (referrer = accounts.google.com и т.д.)
    if (isAuthContextAllowed(details)) return true;
    return false;
  }

  if (secBeforeRequest) {
    session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, function(details, callback) {
      if (isHardblocked(details.url)) {
        updateStats(details, 'blocked');
        callback({ cancel: true });
        return;
      }
      if (shouldAllow(details)) { callback({}); return; }
      secBeforeRequest(details, function(secResult) {
        if (secResult.cancel || secResult.redirectURL) {
          callback(secResult);
          return;
        }
        var request = Request.fromRawDetails({
          requestId: String(details.id),
          sourceUrl: details.referrer,
          tabId: details.webContentsId,
          type: details.resourceType || 'other',
          url: details.url,
        });
        var result = blocker.match(request);
        if (result.redirect) {
          updateStats(details, 'redirected');
          callback({ redirectURL: result.redirect.dataUrl });
        } else if (result.match) {
          updateStats(details, 'blocked');
          callback({ cancel: true });
        } else {
          callback({});
        }
      });
    });
  } else {
    session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, function(details, callback) {
      if (isHardblocked(details.url)) {
        updateStats(details, 'blocked');
        callback({ cancel: true });
        return;
      }
      if (shouldAllow(details)) { callback({}); return; }
      var request = Request.fromRawDetails({
        requestId: String(details.id),
        sourceUrl: details.referrer,
        tabId: details.webContentsId,
        type: details.resourceType || 'other',
        url: details.url,
      });
      var result = blocker.match(request);
      if (result.redirect) {
        updateStats(details, 'redirected');
        callback({ redirectURL: result.redirect.dataUrl });
      } else if (result.match) {
        updateStats(details, 'blocked');
        callback({ cancel: true });
      } else {
        callback({});
      }
    });
  }
}

function cleanTrackingParams(url) {
  try {
    var urlObj = new URL(url);
    var params = urlObj.searchParams;
    var changed = false;
    TRACKING_PARAMS.forEach(function(param) {
      if (params.has(param)) {
        params.delete(param);
        changed = true;
      }
    });
    if (changed) {
      var cleaned = urlObj.origin + urlObj.pathname;
      if (params.toString()) cleaned += '?' + params.toString();
      if (urlObj.hash) cleaned += urlObj.hash;
      return cleaned;
    }
  } catch(e) {}
  return url;
}

function getStats() {
  return { session: sessionStats, pages: pageStats };
}

function getPageStats(tabId) {
  return pageStats[tabId] || { blocked: 0, trackers: 0, ads: 0 };
}

function resetPageStats(tabId) {
  pageStats[tabId] = { blocked: 0, trackers: 0, ads: 0 };
}

function deletePageStats(tabId) {
  delete pageStats[tabId];
}

function isEnabled() {
  return enabled;
}

function setEnabled(val) {
  enabled = !!val;
  saveSettings();
}

function isWhitelisted(domain) {
  return whitelist.indexOf(domain) >= 0;
}

function addToWhitelist(domain) {
  if (whitelist.indexOf(domain) < 0) {
    whitelist.push(domain);
    saveSettings();
  }
}

function removeFromWhitelist(domain) {
  whitelist = whitelist.filter(function(d) { return d !== domain; });
  saveSettings();
}

function getWhitelist() {
  return whitelist;
}

function updateCustomFilters(text) {
  if (!blocker) return;
  try {
    var storagePath = getStoragePath();
    var oldCustom = (fs.existsSync(storagePath)) ? (JSON.parse(fs.readFileSync(storagePath, 'utf-8')).customFilters || '') : '';
    var oldLines = oldCustom.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l && !l.startsWith('!'); });
    var newLines = text.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l && !l.startsWith('!'); });
    blocker.updateFromDiff({ added: newLines, removed: oldLines });
    var cacheDir = ensureCacheDir();
    var enginePath = path.join(cacheDir, 'engine.bin');
    fs.writeFileSync(enginePath, blocker.serialize());
    var store = fs.existsSync(storagePath) ? JSON.parse(fs.readFileSync(storagePath, 'utf-8')) : {};
    store.customFilters = text;
    fs.writeFileSync(storagePath, JSON.stringify(store, null, 2), 'utf-8');
    console.log('[adblocker] Custom filters updated:', newLines.length);
  } catch(e) {
    console.warn('[adblocker] updateCustomFilters failed:', e.message);
  }
}

async function reloadFromLists() {
  if (!currentSession) return;
  try {
    var storagePath = getStoragePath();
    var store = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
    var extraLists = store.filterLists || [];
    var allLists = LISTS.concat(extraLists);
    blocker = await ElectronBlocker.fromLists(
      cachedFetcher(fetch),
      allLists,
      { loadCosmeticFilters: true, loadNetworkFilters: true }
    );
    var customText = store.customFilters || '';
    if (customText) {
      var lines = customText.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l && !l.startsWith('!'); });
      if (lines.length > 0) blocker.updateFromDiff({ added: lines, removed: [] });
    }
    blocker.updateFromDiff({ added: CUSTOM_FILTERS, removed: [] });
    var cacheDir = ensureCacheDir();
    fs.writeFileSync(path.join(cacheDir, 'engine.bin'), blocker.serialize());
    try { fs.unlinkSync(path.join(cacheDir, 'custom-applied')); } catch(e) {}
    if (enabled) blocker.enableBlockingInSession(currentSession);
    console.log('[adblocker] Reloaded with', allLists.length, 'lists');
  } catch(e) {
    console.error('[adblocker] reloadFromLists failed:', e.message);
  }
}

function getFilterLists() {
  return LISTS;
}

module.exports = {
  initBlocker,
  reEnable,
  getStats,
  getPageStats,
  resetPageStats,
  deletePageStats,
  isEnabled,
  setEnabled,
  isWhitelisted,
  addToWhitelist,
  removeFromWhitelist,
  getWhitelist,
  cleanTrackingParams,
  getCacheDir,
  getCosmeticFilters,
  updateCustomFilters,
  reloadFromLists,
  getFilterLists,
  getBlockedLog,
  clearBlockedLog,
};
