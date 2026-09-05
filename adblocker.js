const { ElectronBlocker } = require('@cliqz/adblocker-electron');
const { Request } = require('@cliqz/adblocker');
const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

// Preload of @cliqz/adblocker-electron: injects cosmetic filters at
// document-start into ALL frames, polls DOM mutations and applies extended
// CSS selectors (:has(), :has-text()). Without it only late, main-frame
// CSS injection is possible — too late for CMP cookie popups.
const ADBLOCKER_PRELOAD_PATH = require.resolve('@cliqz/adblocker-electron-preload');

function getCacheDir() {
  const { app: electronApp } = require('electron');
  return path.join(electronApp.getPath('userData'), 'adblocker-cache');
}

function getStoragePath() {
  const { app: electronApp } = require('electron');
  return path.join(electronApp.getPath('userData'), 'settings.json');
}

const LISTS_VERSION = 8;

// =====================================================================
// FilterHub — centralized blocklist repository
// https://github.com/StartPOZI/FilterHub
//
// Catalog mirrors the Sp/<n>/ folders of the repo (44 lists; #11 does not
// exist upstream — failed download, excluded even from the "full" preset).
// Protection levels follow the upstream LEVELS.md / QUICK_START.md:
//   light  — 7 lists, ~261K rules, fastest
//   medium — 17 lists, ~718K rules, recommended for most users (DEFAULT)
//   full   — all 44 lists, ~3.9M rules, for powerful PCs
// =====================================================================
const FILTERHUB_RAW = 'https://raw.githubusercontent.com/StartPOZI/FilterHub/main/Sp/';

const FILTERHUB_LISTS = [
  { num: 1,  file: 'google-ultra-strict.txt',      name: 'Google Ultra Strict',      cat: 'privacy',    rules: 316,     sizeKB: 9,     warn: 'google' },
  { num: 2,  file: 'combined-filters.txt',         name: 'LanikSJ uBO Filters',      cat: 'ads',        rules: 30,      sizeKB: 1 },
  { num: 3,  file: 'social-media.txt',             name: 'Curated Social Media',     cat: 'ads',        rules: 27,      sizeKB: 1 },
  { num: 4,  file: 'hant0508-filters.txt',         name: 'Hant0508 uBlock Filters',  cat: 'ads',        rules: 1460,    sizeKB: 57 },
  { num: 5,  file: 'phishing-army.txt',            name: 'Phishing Army',            cat: 'security',   rules: 155428,  sizeKB: 3200 },
  { num: 6,  file: 'adguard-mobile.txt',           name: 'AdGuard Mobile',           cat: 'regional',   rules: 9896,    sizeKB: 630 },
  { num: 7,  file: 'easylist-french.txt',          name: 'EasyList French',          cat: 'regional',   rules: 89,      sizeKB: 9 },
  { num: 8,  file: 'easylist-germany.txt',         name: 'EasyList Germany',         cat: 'regional',   rules: 5999,    sizeKB: 268 },
  { num: 9,  file: 'easylist-china.txt',           name: 'EasyList China',           cat: 'regional',   rules: 19461,   sizeKB: 540 },
  { num: 10, file: 'oisd-full.txt',                name: 'OISD Full',                cat: 'security',   rules: 716,     sizeKB: 16,    warn: 'slow' },
  { num: 12, file: 'ddg-malware.txt',              name: 'DuckDuckGo Malware',       cat: 'security',   rules: 25,      sizeKB: 1 },
  { num: 13, file: 'ddg-us-tracking.txt',          name: 'DuckDuckGo US Maximum',    cat: 'regional',   rules: 0,       sizeKB: 30964, warn: 'huge' },
  { num: 14, file: 'adguard-base.txt',             name: 'AdGuard Base',             cat: 'ads',        rules: 166793,  sizeKB: 7600 },
  { num: 15, file: 'ubo-annoyances.txt',           name: 'uBlock Annoyances',        cat: 'annoyances', rules: 9,       sizeKB: 1 },
  { num: 16, file: 'disconnect-tracking.txt',      name: 'Disconnect Tracking',      cat: 'privacy',    rules: 38,      sizeKB: 1 },
  { num: 17, file: 'nocoin.txt',                   name: 'NoCoin',                   cat: 'security',   rules: 357,     sizeKB: 15 },
  { num: 18, file: 'easylist.txt',                 name: 'EasyList',                 cat: 'ads',        rules: 86594,   sizeKB: 2200 },
  { num: 19, file: 'easyprivacy.txt',              name: 'EasyPrivacy',              cat: 'privacy',    rules: 56450,   sizeKB: 1450 },
  { num: 20, file: 'adguard-russian.txt',          name: 'AdGuard Russian',          cat: 'regional',   rules: 22141,   sizeKB: 1040 },
  { num: 21, file: 'adguard-spyware.txt',          name: 'AdGuard Spyware',          cat: 'security',   rules: 199049,  sizeKB: 6300 },
  { num: 22, file: 'adguard-social.txt',           name: 'AdGuard Social',           cat: 'annoyances', rules: 17188,   sizeKB: 915 },
  { num: 23, file: 'adguard-annoyances.txt',       name: 'AdGuard Annoyances',       cat: 'annoyances', rules: 68489,   sizeKB: 4300 },
  { num: 24, file: 'adguard-trackparam.txt',       name: 'AdGuard TrackParam',       cat: 'privacy',    rules: 3861,    sizeKB: 172 },
  { num: 25, file: 'adguard-cookies.txt',          name: 'AdGuard Cookies',          cat: 'annoyances', rules: 24824,   sizeKB: 1600 },
  { num: 26, file: 'adguard-popups.txt',           name: 'AdGuard Popups',           cat: 'annoyances', rules: 23563,   sizeKB: 1400 },
  { num: 27, file: 'adguard-other-annoyances.txt', name: 'AdGuard Other Annoyances', cat: 'annoyances', rules: 11520,   sizeKB: 795 },
  { num: 28, file: 'adguard-widgets.txt',          name: 'AdGuard Widgets',          cat: 'annoyances', rules: 2940,    sizeKB: 145 },
  { num: 29, file: 'ubo-filters.txt',              name: 'uBlock Filters',           cat: 'ads',        rules: 10914,   sizeKB: 460 },
  { num: 30, file: 'ubo-privacy.txt',              name: 'uBlock Privacy',           cat: 'privacy',    rules: 3230,    sizeKB: 172 },
  { num: 31, file: 'ubo-quick-fixes.txt',          name: 'uBlock Quick Fixes',       cat: 'fixes',      rules: 549,     sizeKB: 74 },
  { num: 32, file: 'ubo-unbreak.txt',              name: 'uBlock Unbreak',           cat: 'fixes',      rules: 6034,    sizeKB: 271 },
  { num: 33, file: 'ubo-badware.txt',              name: 'uBlock Badware',           cat: 'security',   rules: 6477,    sizeKB: 249 },
  { num: 34, file: 'ubo-annoyances-others.txt',    name: 'uBlock Annoyances Others', cat: 'annoyances', rules: 8189,    sizeKB: 403 },
  { num: 35, file: 'ubo-annoyances-cookies.txt',   name: 'uBlock Annoyances Cookies',cat: 'annoyances', rules: 5709,    sizeKB: 362 },
  { num: 36, file: 'urlhaus-filter.txt',           name: 'URLhaus Filter',           cat: 'security',   rules: 9688,    sizeKB: 837 },
  { num: 37, file: 'fanboy-annoyance.txt',         name: 'Fanboy Annoyance',         cat: 'annoyances', rules: 55745,   sizeKB: 2080 },
  { num: 38, file: 'fanboy-social.txt',            name: 'Fanboy Social',            cat: 'annoyances', rules: 14009,   sizeKB: 388 },
  { num: 39, file: 'hagezi-tif.txt',               name: 'HaGezi TIF',               cat: 'pro',        rules: 2175386, sizeKB: 43970, warn: 'huge' },
  { num: 40, file: 'hagezi-fake.txt',              name: 'HaGezi Fake',              cat: 'security',   rules: 16854,   sizeKB: 332 },
  { num: 41, file: 'spam404.txt',                  name: 'Spam404',                  cat: 'security',   rules: 7277,    sizeKB: 148 },
  { num: 42, file: 'dandelion-anti-malware.txt',   name: 'Dandelion Anti-Malware',   cat: 'security',   rules: 14841,   sizeKB: 438 },
  { num: 43, file: 'ubo-resource-abuse.txt',       name: 'uBlock Resource Abuse',    cat: 'security',   rules: 212,     sizeKB: 8 },
  { num: 44, file: 'peter-lowe.txt',               name: 'Peter Lowe',               cat: 'ads',        rules: 3537,    sizeKB: 68 },
  { num: 45, file: 'hagezi-pro-plus.txt',          name: 'HaGezi Pro Plus',          cat: 'pro',        rules: 241964,  sizeKB: 5250,  warn: 'strict' },
];

const FILTERHUB_LEVELS = {
  light: [1, 10, 14, 17, 18, 31, 32],
  medium: [1, 5, 10, 14, 16, 17, 18, 19, 23, 24, 25, 30, 31, 32, 33, 36, 37],
  full: FILTERHUB_LISTS.map(function(l) { return l.num; }),
};
const FILTERHUB_DEFAULT_LEVEL = 'medium';

let filterhubEnabled = FILTERHUB_LEVELS[FILTERHUB_DEFAULT_LEVEL].slice();

function _filterhubUrl(list) {
  return FILTERHUB_RAW + list.num + '/' + list.file;
}

function getEnabledLists() {
  return FILTERHUB_LISTS
    .filter(function(l) { return filterhubEnabled.indexOf(l.num) !== -1; })
    .map(_filterhubUrl);
}

function _filterhubSignature() {
  return filterhubEnabled.slice().sort(function(a, b) { return a - b; }).join(',');
}

function _extraListUrls() {
  try {
    var store = require('./storage').read();
    return Array.isArray(store.filterLists) ? store.filterLists.filter(function(u) { return typeof u === 'string'; }) : [];
  } catch(e) { return []; }
}


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
let logPersistent = false;

function _debouncedLogSave() {
  if (_logSaveTimer) return;
  _logSaveTimer = setTimeout(function() {
    _logSaveTimer = null;
    saveSettings();
  }, 30000);
}

function loadSettings() {
  try {
    const store = require('./storage').read();
    enabled = store.adblockerEnabled !== undefined ? store.adblockerEnabled : true;
    whitelist = store.adblockerWhitelist || [];
    logPersistent = !!store.blockerLogPersistent;
    blockedLog = logPersistent ? (store.blockedLog || []) : [];
    // Privacy: unless the user opted into a persistent log, wipe any legacy
    // blocked-request history (urls/domains/timestamps) still on disk.
    if (!logPersistent && Array.isArray(store.blockedLog) && store.blockedLog.length) {
      delete store.blockedLog;
      try { require('./storage').write(store); } catch(e) {}
    }
    // FilterHub selection: array of list numbers, default = medium preset.
    if (Array.isArray(store.filterhubEnabled)) {
      var validNums = {};
      FILTERHUB_LISTS.forEach(function(l) { validNums[l.num] = true; });
      filterhubEnabled = store.filterhubEnabled.filter(function(n) { return validNums[n]; });
    }
  } catch(e) {}
}

function saveSettings() {
  try {
    require('./storage').update(function(store) {
      store.adblockerEnabled = enabled;
      store.adblockerWhitelist = whitelist;
      store.blockerLogPersistent = logPersistent;
      store.filterhubEnabled = filterhubEnabled;
      if (logPersistent) {
        store.blockedLog = blockedLog.slice(-5000);
      } else {
        delete store.blockedLog;
      }
    });
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

function isLogPersistent() {
  return logPersistent;
}

function setLogPersistent(v) {
  logPersistent = !!v;
  if (!logPersistent) blockedLog = [];
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
  if (isWhitelistedUrl(url)) return { css: '', scripts: [] };
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
  var sigPath = path.join(cacheDir, 'filterhub-sig');
  var needReload = false;
  try {
    var savedVersion = fs.readFileSync(versionPath, 'utf-8').trim();
    if (String(savedVersion) !== String(LISTS_VERSION)) needReload = true;
  } catch(e) { needReload = true; }
  // The engine cache must match the CURRENT FilterHub selection: rebuild
  // whenever the enabled-set signature changed (preset switch, toggles).
  try {
    var savedSig = fs.readFileSync(sigPath, 'utf-8').trim();
    if (String(savedSig) !== _filterhubSignature()) needReload = true;
  } catch(e) { needReload = true; }
  if (needReload) {
    try { fs.unlinkSync(enginePath); } catch(e) {}
    try { fs.unlinkSync(path.join(cacheDir, 'custom-applied')); } catch(e) {}
    // Drop cached downloads of lists that are no longer part of the catalog
    // (pre-FilterHub URLs) so the cache dir does not keep growing forever.
    try {
      var keepNames = {};
      getEnabledLists().concat(_extraListUrls()).forEach(function(u) {
        keepNames[Buffer.from(u).toString('base64').replace(/\//g, '_').replace(/\+/g, '-') + '.txt'] = true;
      });
      fs.readdirSync(cacheDir).forEach(function(f) {
        if (f.endsWith('.txt') && !keepNames[f]) {
          try { fs.unlinkSync(path.join(cacheDir, f)); } catch(e0) {}
        }
      });
    } catch(e) {}
    console.log('[adblocker] Lists version or selection changed, forcing reload');
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
                                                getEnabledLists(),
                                                {
                                                  loadCosmeticFilters: true,
                                                  loadNetworkFilters: true,
                                                }
      );

      console.log('[adblocker] Loaded from filter lists');
      try {
        fs.writeFileSync(enginePath, blocker.serialize());
        fs.writeFileSync(versionPath, String(LISTS_VERSION), 'utf-8');
        fs.writeFileSync(sigPath, _filterhubSignature(), 'utf-8');
        console.log('[adblocker] Engine cached to disk');
      } catch(writeErr) {
        console.error('[adblocker] Failed to cache engine:', writeErr.message);
      }
    } catch(e) {
      console.error('[adblocker] fromLists failed:', e.message);
      try {
        blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
        console.log('[adblocker] Loaded from prebuilt fallback');
        // Persist the engine for this session, but NOT the FilterHub
        // signature: without a valid sig the next startup treats the cache
        // as stale and retries the full catalog build (e.g. after the first
        // launch happened offline).
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

  if (blocker) {
    // Attach network hook + cosmetic preload (reEnable also handles
    // enabled === false by keeping the session clean). applySecuritySettings()
    // called right after this re-applies with the security hook attached.
    reEnable(session, null);
  }

  return blocker;
}

// Cosmetic-filter IPC handlers of the library are session-agnostic (they
// reply via event.sender), so we register them once and delegate to the
// current engine. This survives reloadFromLists() replacing `blocker` and
// avoids duplicate ipcMain listeners that per-session
// enableBlockingInSession() would create for incognito partitions.
var _ipcWired = false;
function wireCosmeticsIpc() {
  if (_ipcWired) return;
  _ipcWired = true;
  ipcMain.on('get-cosmetic-filters-first', function(event, url) {
    if (!blocker || !enabled || isWhitelistedUrl(url)) {
      // sendSync handler must always set returnValue; null = "not active"
      event.returnValue = null;
      return;
    }
    blocker.onGetCosmeticFiltersFirst(event, url);
  });
  ipcMain.on('get-cosmetic-filters', function(event, url, msg) {
    if (!blocker || !enabled || isWhitelistedUrl(url)) return;
    blocker.onGetCosmeticFiltersUpdated(event, url, msg);
  });
  ipcMain.on('is-mutation-observer-enabled', function(event) {
    event.returnValue = !!(blocker && blocker.config && blocker.config.enableMutationObserver);
  });
}

function ensureSessionPreload(session) {
  try {
    var preloads = session.getPreloads();
    if (preloads.indexOf(ADBLOCKER_PRELOAD_PATH) === -1) {
      session.setPreloads(preloads.concat([ADBLOCKER_PRELOAD_PATH]));
    }
  } catch(e) {
    console.warn('[adblocker] setPreloads failed:', e.message);
  }
}

function removeSessionPreload(session) {
  try {
    var preloads = session.getPreloads();
    if (preloads.indexOf(ADBLOCKER_PRELOAD_PATH) !== -1) {
      session.setPreloads(preloads.filter(function(p) { return p !== ADBLOCKER_PRELOAD_PATH; }));
    }
  } catch(e) {}
}

// Sessions the blocker was attached to (default + incognito partitions) and
// the last security hook used for each, so toggling/reloads re-apply state
// everywhere.
var _managedSessions = new Map();

function matchAndCallback(details, callback) {
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
}

function reEnable(session, secBeforeRequest) {
  if (!blocker) return;
  wireCosmeticsIpc();
  _managedSessions.set(session, secBeforeRequest || null);

  // Clear any previously installed onBeforeRequest hook (ours or the
  // library's) so the composite handler below is the only one registered.
  try { session.webRequest.onBeforeRequest(null); } catch(e) {}

  if (!enabled) {
    removeSessionPreload(session);
    if (secBeforeRequest) {
      try {
        session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, secBeforeRequest);
      } catch(e) {}
    }
    return;
  }

  // Keep the library preload installed — it performs document-start cosmetic
  // injection into all frames (including CMP iframes), applies extended CSS
  // and reacts to DOM mutations. Previously disableBlockingInSession() was
  // called here, which uninstalled the preload at every startup and left
  // only a late dom-ready fallback that cookie banners beat to the punch.
  ensureSessionPreload(session);

  function shouldAllow(details) {
    // Белый список доменов аутентификации — пропускаем всегда,
    // даже если фильтр (EasyList/uBlock) совпал
    if (isAuthWhitelisted(details.url)) return true;
    // Контекстные домены (play.google.com и др.) — пропускаем только если
    // запрос идёт со страницы входа (referrer = accounts.google.com и т.д.)
    if (isAuthContextAllowed(details)) return true;
    return false;
  }

  try {
    session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, function(details, callback) {
      // Пользовательский белый список имеет наивысший приоритет
      if (isWhitelistedUrl(details.url)) { callback({}); return; }
      if (isHardblocked(details.url)) {
        updateStats(details, 'blocked');
        callback({ cancel: true });
        return;
      }
      if (shouldAllow(details)) { callback({}); return; }
      if (secBeforeRequest) {
        secBeforeRequest(details, function(secResult) {
          if (secResult.cancel || secResult.redirectURL) {
            callback(secResult);
            return;
          }
          matchAndCallback(details, callback);
        });
      } else {
        matchAndCallback(details, callback);
      }
    });
  } catch(e) {
    console.warn('[adblocker] onBeforeRequest registration failed:', e.message);
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
  // Re-apply state on every session we manage (default + incognito
  // partitions), so toggling affects already-open private tabs too.
  _managedSessions.forEach(function(sec, ses) {
    try { reEnable(ses, sec); } catch(e) {
      try { _managedSessions.delete(ses); } catch(_) {}
    }
  });
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
    var _storage = require('./storage');
    var oldCustom = _storage.read().customFilters || '';
    var oldLines = oldCustom.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l && !l.startsWith('!'); });
    var newLines = text.split('\n').map(function(l) { return l.trim(); }).filter(function(l) { return l && !l.startsWith('!'); });
    blocker.updateFromDiff({ added: newLines, removed: oldLines });
    var cacheDir = ensureCacheDir();
    var enginePath = path.join(cacheDir, 'engine.bin');
    fs.writeFileSync(enginePath, blocker.serialize());
    _storage.update(function(store) { store.customFilters = text; });
    console.log('[adblocker] Custom filters updated:', newLines.length);
  } catch(e) {
    console.warn('[adblocker] updateCustomFilters failed:', e.message);
  }
}

async function reloadFromLists() {
  if (!currentSession) return;
  try {
    var store = require('./storage').read();
    var extraLists = store.filterLists || [];
    var allLists = getEnabledLists().concat(extraLists);
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
    try { fs.writeFileSync(path.join(cacheDir, 'filterhub-sig'), _filterhubSignature(), 'utf-8'); } catch(e0) {}
    try { fs.unlinkSync(path.join(cacheDir, 'custom-applied')); } catch(e) {}
    // Re-attach hooks + preload to the session with the new engine.
    try { reEnable(currentSession, _managedSessions.get(currentSession) || null); } catch(e) {}
    console.log('[adblocker] Reloaded with', allLists.length, 'lists');
  } catch(e) {
    console.error('[adblocker] reloadFromLists failed:', e.message);
  }
}

function getFilterLists() {
  return getEnabledLists();
}

// "Update all lists": drop the 24h download cache for every list in the
// current selection (FilterHub + custom URLs), then rebuild the engine so
// fresh copies are fetched from upstream.
async function updateAllLists() {
  try {
    var cacheDir = ensureCacheDir();
    var urls = getEnabledLists().concat(_extraListUrls());
    urls.forEach(function(u) {
      var cacheFile = path.join(cacheDir, Buffer.from(u).toString('base64').replace(/\//g, '_').replace(/\+/g, '-') + '.txt');
      try { fs.unlinkSync(cacheFile); } catch(e) {}
    });
  } catch(e) {}
  return reloadFromLists();
}

// ============== FilterHub selection API ==============
function getFilterhubCatalog() {
  return {
    repo: 'https://github.com/StartPOZI/FilterHub',
    lists: FILTERHUB_LISTS,
    levels: {
      light: FILTERHUB_LEVELS.light.slice(),
      medium: FILTERHUB_LEVELS.medium.slice(),
      full: FILTERHUB_LEVELS.full.slice(),
    },
    defaultLevel: FILTERHUB_DEFAULT_LEVEL,
  };
}

function getFilterhubEnabled() {
  return filterhubEnabled.slice();
}

function setFilterhubEnabled(nums) {
  var validNums = {};
  FILTERHUB_LISTS.forEach(function(l) { validNums[l.num] = true; });
  filterhubEnabled = Array.isArray(nums) ? nums.filter(function(n) { return validNums[n]; }) : [];
  saveSettings();
  return reloadFromLists().then(function() {
    return { success: true, enabled: filterhubEnabled.slice() };
  });
}

function setFilterhubPreset(level) {
  var lvl = FILTERHUB_LEVELS[level];
  if (!lvl) return Promise.resolve({ success: false, message: 'Unknown level: ' + level });
  filterhubEnabled = lvl.slice();
  saveSettings();
  return reloadFromLists().then(function() {
    return { success: true, level: level, enabled: filterhubEnabled.slice() };
  });
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
  updateAllLists,
  getFilterLists,
  getFilterhubCatalog,
  getFilterhubEnabled,
  setFilterhubEnabled,
  setFilterhubPreset,
  getBlockedLog,
  clearBlockedLog,
  isLogPersistent,
  setLogPersistent,
};
