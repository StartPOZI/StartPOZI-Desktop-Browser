const { ElectronBlocker } = require('@cliqz/adblocker-electron');
const { Request } = require('@cliqz/adblocker');
const { ipcMain, webContents } = require('electron');
const fs = require('fs');
const path = require('path');

// Preload of @cliqz/adblocker-electron: injects cosmetic filters at
// document-start into ALL frames, polls DOM mutations and applies extended
// CSS selectors (:has(), :has-text()). Without it only late, main-frame
// CSS injection is possible — too late for CMP cookie popups.
// Vendored async-safe preload (see vendor/adblocker-preload.js — the library
// one sendSync's at document-start, which kills in-flight navigations on
// Electron 42 and leaves pages committed-but-empty).
const ADBLOCKER_PRELOAD_PATH = path.join(__dirname, 'vendor', 'adblocker-preload.js');

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
//   light  — 6 lists, ~260K rules, fastest
//   medium — 16 lists, ~718K rules, recommended for most users (DEFAULT)
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
  // 2026-10: "Google Ultra Strict" (#1) dropped from light/medium — it is
  // too aggressive for the default protection levels (breaks Google
  // logins/services). The list stays in the catalog for manual opt-in and
  // in the "full" preset.
  light: [10, 14, 17, 18, 31, 32],
  medium: [5, 10, 14, 16, 17, 18, 19, 23, 24, 25, 30, 31, 32, 33, 36, 37],
  full: FILTERHUB_LISTS.map(function(l) { return l.num; }),
};
const FILTERHUB_DEFAULT_LEVEL = 'medium';

let filterhubEnabled = FILTERHUB_LEVELS[FILTERHUB_DEFAULT_LEVEL].slice();

function _filterhubUrl(list) {
  return FILTERHUB_RAW + list.num + '/' + list.file;
}

// Download timeout scales with the DECLARED list size (sizeKB from the
// catalog above): a flat 30 s cap aborts the big lists (31–44 MB, e.g.
// ddg-us-tracking / hagezi-tif) long before they can arrive — especially
// over Tor. ~sizeKB * 10 ms ≈ 100 KB/s, with a 30 s floor for small lists.
// Keyed by download URL because cachedFetcher() only receives the URL.
var _LIST_SIZE_KB_BY_URL = {};
FILTERHUB_LISTS.forEach(function(l) {
  _LIST_SIZE_KB_BY_URL[_filterhubUrl(l)] = l.sizeKB || 0;
});

function _downloadTimeoutMs(url) {
  var sizeKB = _LIST_SIZE_KB_BY_URL[url] || 0;
  return Math.max(30000, sizeKB * 10);
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

// Tracking-parameter cleaning lives in lib/url-cleaner.js (extracted
// module, unit-tested); re-exported here for IPC callers.
var _urlCleaner = require('./lib/url-cleaner');
var TRACKING_PARAMS = _urlCleaner.TRACKING_PARAMS;
var cleanTrackingParams = _urlCleaner.cleanTrackingParams;

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
    for (var j = 0; j < HARDBLOCK_DOMAINS.length; j++) {
      var d = HARDBLOCK_DOMAINS[j];
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
// ===== Blocked-request categories (for the stats UI) =====
// Every blocked/redirected request is classified by hostname so the panel
// can show Ads / Trackers / Social / CDN / Other separately. Previously ALL
// cancelled requests were counted as "ads" and only rare redirect-rules as
// "trackers" — which is why the Trackers counter was stuck near zero.
var CAT_ORDER = ['trackers', 'ads', 'social', 'cdn']; // priority
var CAT_PATTERNS = {
  trackers: [
    /(^|\.)google-analytics\.com$/, /(^|\.)googletagmanager\.com$/, /(^|\.)analytics\./,
    /(^|\.)mc\.yandex\.ru$/, /(^|\.)top-fwz1\.mail\.ru$/, /(^|\.)metrika/,
    /(^|\.)hotjar\.com$/, /(^|\.)hotjar\.io$/, /(^|\.)mixpanel\.com$/, /(^|\.)segment\.(io|com)$/,
    /(^|\.)amplitude\.com$/, /(^|\.)chartbeat\.(com|net)$/, /(^|\.)newrelic\.com$/, /(^|\.)nr-data\.net$/,
    /(^|\.)fullstory\.com$/, /(^|\.)mouseflow\.com$/, /(^|\.)clicky\.com$/, /(^|\.)statcounter\.com$/,
    /(^|\.)quantserve\.com$/, /(^|\.)scorecardresearch\.com$/, /(^|\.)comscore\.com$/, /(^|\.)gemius\.com$/,
    /(^|\.)liveinternet\.ru$/, /(^|\.)criteo\.(com|net)$/, /(^|\.)matomo/, /(^|\.)plausible/,
    /(^|\.)telemetry\./, /(^|\.)beacon\./, /(^|\.)px\.gravatar\.com$/, /(^|\.)(track|tracking)\./i
  ],
  ads: [
    /(^|\.)doubleclick\.net$/, /(^|\.)googlesyndication\.com$/, /(^|\.)googleadservices\.com$/,
    /(^|\.)adservice\.google\./, /(^|\.)amazon-adsystem\.com$/, /(^|\.)adnxs\.(com|net)$/,
    /(^|\.)taboola\.com$/, /(^|\.)outbrain\.com$/, /(^|\.)adfox\.ru$/, /(^|\.)an\.yandex\.(ru|com)$/,
    /(^|\.)pubmatic\.com$/, /(^|\.)rubiconproject\.com$/, /(^|\.)openx\.(net|net)$/, /(^|\.)smartadserver\.com$/,
    /(^|\.)mgid\.com$/, /(^|\.)propellerads\.com$/, /(^|\.)popads\.net$/, /(^|\.)moatads\.com$/,
    /(^|\.)adsrvr\.org$/, /(^|\.)adriver\.ru$/, /(^|\.)adform\.net$/, /(^|\.)betweendigital\.com$/,
    /adsystem|adserver|advertising|adservice|syndication|(^|\.)(ads?)\./i
  ],
  social: [
    /(^|\.)facebook\.com$/, /(^|\.)facebook\.net$/, /(^|\.)fbcdn\.net$/, /(^|\.)connect\.facebook\.net$/,
    /(^|\.)platform\.twitter\.com$/, /(^|\.)twimg\.com$/, /(^|\.)vk\.com$/, /(^|\.)userapi\.com$/,
    /(^|\.)ok\.ru$/, /(^|\.)instagram\.com$/, /(^|\.)pinterest\./, /(^|\.)linkedin\.(com|net)$/,
    /(^|\.)t\.me$/, /(^|\.)telegram\./, /(^|\.)discord(app)?\.com$/, /(^|\.)tiktok\.com$/
  ],
  cdn: [
    /(^|\.)cdnjs\.cloudflare\.com$/, /(^|\.)jsdelivr\.net$/, /(^|\.)unpkg\.com$/, /(^|\.)polyfill\.io$/,
    /(^|\.)ajax\.googleapis\.com$/, /(^|\.)fonts\.googleapis\.com$/, /(^|\.)storage\.googleapis\.com$/,
    /(^|\.)akamaihd\.net$/, /(^|\.)akamaized\.net$/, /(^|\.)cloudfront\.net$/, /(^|\.)fastly\.net$/,
    /(^|\.)kxcdn\.com$/, /(^|\.)statically\.io$/, /(^|\.)(cdn)[\.\-]/, /\.(cdn)\./
  ]
};
function categorizeUrl(url) {
  var h = '';
  try { h = new URL(url).hostname.toLowerCase(); } catch (e) { return 'other'; }
  if (!h) return 'other';
  for (var c = 0; c < CAT_ORDER.length; c++) {
    var cat = CAT_ORDER[c];
    var pats = CAT_PATTERNS[cat];
    for (var i = 0; i < pats.length; i++) {
      try { if (pats[i].test(h)) return cat; } catch (e) {}
    }
  }
  return 'other';
}

function _newStats() {
  return { blocked: 0, ads: 0, trackers: 0, social: 0, cdn: 0, other: 0 };
}

let sessionStats = _newStats();
let pageStats = {};

// Engine diagnostics for the UI panel: which lists built the engine and
// from where (catalog / disk cache / offline fallback).
let _engineInfo = { lists: 0, source: 'none' };
function getEngineInfo() {
  var info = { lists: _engineInfo.lists, source: _engineInfo.source, enabled: !!enabled };
  try { info.lists = _engineInfo.lists || (getEnabledLists().length + _extraListUrls().length); } catch(e) {}
  info.checksums = { verified: _checksumStats.verified, failed: _checksumStats.failed, unverified: _checksumStats.unverified };
  return info;
}
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
      // Migration (2026-10): "Google Ultra Strict" (#1) left the light/medium
      // presets. A stored selection that is EXACTLY one of the old presets is
      // migrated automatically; any manual selection is respected as-is.
      var _sig = function(a) { return a.slice().sort(function(x,y){ return x-y; }).join(','); };
      var _oldLight = [1, 10, 14, 17, 18, 31, 32];
      var _oldMedium = [1, 5, 10, 14, 16, 17, 18, 19, 23, 24, 25, 30, 31, 32, 33, 36, 37];
      if (_sig(filterhubEnabled) === _sig(_oldLight) || _sig(filterhubEnabled) === _sig(_oldMedium)) {
        filterhubEnabled = filterhubEnabled.filter(function(n) { return n !== 1; });
      }
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
        // Keep in sync with the bloat-guard cap in storage.js (_bloatGuard).
        store.blockedLog = blockedLog.slice(-2000);
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
    // Keep both caps in sync: the in-memory trim below and the slice(-2000)
    // persisted by saveSettings() (bloat-guard cap in storage.js).
    if (blockedLog.length > 2000) blockedLog = blockedLog.slice(-2000);
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

// ===== Adblock Plus checksum verification =====
// Logic lives in lib/filter-checksum.js (extracted module, unit-tested);
// stats below feed the engine-info panel so the user can see how many
// lists were verified / rejected / had no checksum.
var _checksumStats = { verified: 0, failed: 0, unverified: 0 };
var verifyListChecksum = require('./lib/filter-checksum').verifyListChecksum;

// Filter lists MUST be downloaded through electron.net.fetch: it uses the
// Chromium network stack and therefore the session proxy (Tor, HTTP/SOCKS).
// The global Node fetch (undici) ignores the session proxy and would leak
// direct requests to raw.githubusercontent.com past the user's Tor setup.
function _proxyAwareFetch() {
  try {
    var net = require('electron').net;
    if (net && typeof net.fetch === 'function') return net.fetch;
  } catch (e) {}
  return fetch;
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

      var settled = false;
      var timeoutMs = _downloadTimeoutMs(url);
      var timer = setTimeout(function() { timer = null; if (!settled) { settled = true; resolve(null); } }, timeoutMs);
      var finish = function(text) {
        if (settled) return;
        settled = true;
        if (timer) { clearTimeout(timer); timer = null; }
        if (text) {
          // Integrity gate: a fresh download with a Checksum header that
          // does not match is discarded; the stale-but-trusted disk cache
          // (verified when it was first downloaded) is used instead.
          var verdict = verifyListChecksum(text);
          if (verdict === false) {
            _checksumStats.failed++;
            console.warn('[adblocker] Checksum mismatch, rejecting download:', url);
            text = null;
          } else if (verdict === true) {
            _checksumStats.verified++;
          } else {
            _checksumStats.unverified++;
          }
        }
        if (text) {
          try { ensureCacheDir(); fs.writeFileSync(cacheFile, text, 'utf-8'); } catch(e) {}
          resolve(makeResponse(text));
        } else if (fs.existsSync(cacheFile)) {
          resolve(makeResponse(fs.readFileSync(cacheFile, 'utf-8')));
        } else {
          console.warn('[adblocker] Failed to fetch:', url);
          resolve(makeResponse(''));
        }
      };

      Promise.resolve()
        .then(function() { return fetch(url); })
        .then(function(resp) { if (!resp.ok) return null; return resp.text(); })
        .then(finish)
        .catch(function() { finish(null); });
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

// Per-site disable must behave like uBlock's: ALL requests INITIATED BY a
// whitelisted page are allowed. The old code checked only the request's own
// URL, so ads/trackers loaded BY the whitelisted site (from other domains)
// kept getting blocked — "I disabled it for this site but it still works".
function isFirstPartyWhitelisted(details) {
  if (!details || !details.webContentsId) return false;
  try {
    var wc = webContents.fromId(details.webContentsId);
    var top = (wc && wc.getURL) ? wc.getURL() : '';
    return top ? isWhitelistedUrl(top) : false;
  } catch(e) { return false; }
}

function updateStats(details, type) {
  var tabId = details.webContentsId || 'unknown';
  if (!pageStats[tabId]) pageStats[tabId] = _newStats();
  if (type === 'blocked' || type === 'redirected') {
    // Categorize by hostname: ads / trackers / social / cdn / other.
    // ("redirected" are tracker-redirect rules — they are blocked in the
    // sense that nothing reaches the tracker, so they count towards the
    // blocked total and their category, usually trackers.)
    var cat = categorizeUrl(details.url);
    sessionStats.blocked++;
    sessionStats[cat]++;
    pageStats[tabId].blocked++;
    pageStats[tabId][cat]++;
    addBlockedLogEntry(details, type === 'redirected' ? 'tracker' : 'blocked');
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
  // The engine cache must match the CURRENT FilterHub selection AND the
  // user's own list URLs: rebuild whenever either signature changed.
  try {
    var savedSig = fs.readFileSync(sigPath, 'utf-8').trim();
    if (String(savedSig) !== _filterhubSignature() + '|' + _extraListUrls().join(',')) needReload = true;
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
    _engineInfo = { lists: getEnabledLists().length + _extraListUrls().length, source: 'cache' };
    console.log('[adblocker] Loaded from cache');
  } catch(e) {}

  if (!blocker) {
    try {
      // FIX: the FIRST build used to include only the FilterHub lists — the
      // user's own list URLs joined the engine only after a later
      // reloadFromLists(), so after a fresh install/custom-list change "not
      // everything is blocked" until some unrelated reload happened.
      var allLists = getEnabledLists().concat(_extraListUrls());
      blocker = await ElectronBlocker.fromLists(
        cachedFetcher(_proxyAwareFetch()),
                                                allLists,
                                                {
                                                  loadCosmeticFilters: true,
                                                  loadNetworkFilters: true,
                                                }
      );
      _engineInfo = { lists: allLists.length, source: 'catalog' };

      console.log('[adblocker] Loaded from filter lists (' + allLists.length + ')');
      try {
        fs.writeFileSync(enginePath, blocker.serialize());
        fs.writeFileSync(versionPath, String(LISTS_VERSION), 'utf-8');
        fs.writeFileSync(sigPath, _filterhubSignature() + '|' + _extraListUrls().join(','), 'utf-8');
        console.log('[adblocker] Engine cached to disk');
      } catch(writeErr) {
        console.error('[adblocker] Failed to cache engine:', writeErr.message);
      }
    } catch(e) {
      console.error('[adblocker] fromLists failed:', e.message);
      try {
        blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(_proxyAwareFetch());
        _engineInfo = { lists: 1, source: 'fallback' };
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
  // ASYNC first-load cosmetics handler (invoked by vendor/adblocker-preload.js).
  // Reimplemented from ElectronBlocker.onGetCosmeticFiltersFirst: the vendored
  // preload calls this via ipcRenderer.invoke (never sendSync — a synchronous
  // round-trip from a document-start preload re-enters the message loop while
  // the webview is still committing its navigation and, on Electron 42, kills
  // the in-flight load: the page ends up committed-but-empty with no <head>,
  // <body> or title).
  ipcMain.handle('get-cosmetic-filters-first-async', function(event, url) {
    if (process.env.SPZ_ADB_DEBUG) console.log('[adbdbg] cosmetic-first-async CALLED for ' + String(url).slice(0, 60));
    try {
      if (!blocker || !enabled || isWhitelistedUrl(url)) return null;
      var tldts = require('tldts-experimental');
      var parsed = tldts.parse(url);
      var res = blocker.getCosmeticsFilters({
        domain: parsed.domain || '',
        hostname: parsed.hostname || '',
        url: url,
        getBaseRules: true,
        getInjectionRules: true,
        getExtendedRules: true,
        getRulesFromHostname: true,
        getRulesFromDOM: false,
      });
      if (!res || res.active === false) return null;
      // Safe here (async context, navigation already settled or settling):
      // insert the cosmetic stylesheet and notify the preload.
      try {
        if (res.styles && res.styles.length > 0) {
          event.sender.insertCSS(res.styles, { cssOrigin: 'user' });
        }
        event.sender.send('get-cosmetic-filters-response', {
          active: true,
          extended: res.extended || [],
          styles: '',
        });
      } catch(e1) {}
      return res.scripts || [];
    } catch(e2) {
      return null;
    }
  });
  ipcMain.handle('is-mutation-observer-enabled-async', function() {
    return !!(blocker && blocker.config && blocker.config.enableMutationObserver);
  });
  ipcMain.on('get-cosmetic-filters', function(event, url, msg) {
    if (!blocker || !enabled || isWhitelistedUrl(url)) {
      // Always answer, even when the blocker is off / the site is
      // whitelisted: the library's early `return` left sync senders with
      // an unset event.returnValue and async listeners of
      // 'get-cosmetic-filters-response' waiting forever. Reply with an
      // empty/inactive result so the caller can settle immediately.
      try { event.returnValue = []; } catch(e0) {}
      try {
        event.sender.send('get-cosmetic-filters-response', {
          active: false,
          extended: [],
          styles: '',
        });
      } catch(e1) {}
      return;
    }
    blocker.onGetCosmeticFiltersUpdated(event, url, msg);
  });
}

// Prefer the modern preload API (registerPreloadScript / unregisterPreloadScript);
// the old getPreloads/setPreloads pair is deprecated and logs a warning on
// every session touch. Fall back to the legacy pair when the modern one is
// unavailable so older Electron builds keep working.
function _sessionPreloadApi(session) {
  if (typeof session.registerPreloadScript === 'function' &&
      typeof session.getPreloadScripts === 'function' &&
      typeof session.unregisterPreloadScript === 'function') {
    return 'modern';
  }
  return 'legacy';
}
function ensureSessionPreload(session) {
  try {
    if (_sessionPreloadApi(session) === 'modern') {
      var already = session.getPreloadScripts().some(function(s) {
        return s && s.filePath === ADBLOCKER_PRELOAD_PATH;
      });
      if (!already) session.registerPreloadScript({ type: 'frame', filePath: ADBLOCKER_PRELOAD_PATH });
      return;
    }
    var preloads = session.getPreloads();
    if (preloads.indexOf(ADBLOCKER_PRELOAD_PATH) === -1) {
      session.setPreloads(preloads.concat([ADBLOCKER_PRELOAD_PATH]));
    }
  } catch(e) {
    console.warn('[adblocker] preload registration failed:', e.message);
  }
}

function removeSessionPreload(session) {
  try {
    if (_sessionPreloadApi(session) === 'modern') {
      session.getPreloadScripts().forEach(function(s) {
        if (s && s.filePath === ADBLOCKER_PRELOAD_PATH) {
          try { session.unregisterPreloadScript(s.id); } catch(e0) {}
        }
      });
      return;
    }
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
      // Пользовательский белый список имеет наивысший приоритет:
      // 1) сам запрос указывает на вайтлист-домен,
      // 2) запрос инициирован СТРАНИЦЕЙ вайтлист-домена (саб-реквесты).
      if (isWhitelistedUrl(details.url)) { callback({}); return; }
      if (whitelist.length && isFirstPartyWhitelisted(details)) { callback({}); return; }
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

function getStats() {
  return { session: sessionStats, pages: pageStats };
}

function getPageStats(tabId) {
  return pageStats[tabId] || _newStats();
}

function resetPageStats(tabId) {
  pageStats[tabId] = _newStats();
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

// Full engine rebuild from the CURRENT FilterHub selection + custom URLs.
// Throws on failure so callers can decide whether to persist whatever
// caused the rebuild (see setFilterhubEnabled / setFilterhubPreset).
async function _rebuildEngineFromLists() {
  var store = require('./storage').read();
  // _extraListUrls() filters non-strings: a single corrupted entry in
  // filterLists (hand-edit / partial import) would otherwise throw inside
  // every list download promise and kill the WHOLE rebuild ("Update
  // lists" button included).
  var extraLists = _extraListUrls();
  var allLists = getEnabledLists().concat(extraLists);
  blocker = await ElectronBlocker.fromLists(
    cachedFetcher(_proxyAwareFetch()),
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
  try { fs.writeFileSync(path.join(cacheDir, 'filterhub-sig'), _filterhubSignature() + '|' + extraLists.join(','), 'utf-8'); } catch(e0) {}
  // NOTE: do NOT delete the 'custom-applied' marker here. The serialized
  // engine above ALREADY contains the custom filters; removing the marker
  // made the next boot apply CUSTOM_FILTERS a second time (ReverseIndex
  // does not dedupe → duplicates grew on every update+restart cycle).
  _engineInfo = { lists: allLists.length, source: 'catalog' };
  // Re-attach hooks + preload to the session with the new engine.
  try { reEnable(currentSession, _managedSessions.get(currentSession) || null); } catch(e) {}
  console.log('[adblocker] Reloaded with', allLists.length, 'lists');
}

async function reloadFromLists() {
  if (!currentSession) return { success: false, message: 'no active session' };
  try {
    await _rebuildEngineFromLists();
    return { success: true };
  } catch(e) {
    console.error('[adblocker] reloadFromLists failed:', e.message);
    return { success: false, message: e.message };
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

// Apply a new FilterHub selection: rebuild FIRST, persist only on success.
// The old order (saveSettings → rebuild) persisted the new selection even
// when the rebuild failed (e.g. offline). The 'filterhub-sig' cache file was
// then left at the OLD selection, so the next boot's needReload check saw a
// settings/sig mismatch, deleted engine.bin and the offline rebuild degraded
// to the prebuilt fallback. On failure we roll the in-memory state back and
// report an honest error — settings.json never sees the failed choice.
function _applyFilterhubSelection(nextSel, label) {
  var prevSel = filterhubEnabled;
  var prevBlocker = blocker;
  filterhubEnabled = nextSel; // the rebuild reads the selection from here
  return _rebuildEngineFromLists().then(function() {
    // Rebuild (and the signature cache write) succeeded — safe to persist.
    saveSettings();
    return { success: true };
  }).catch(function(err) {
    filterhubEnabled = prevSel;
    blocker = prevBlocker;
    var msg = (err && err.message) ? err.message : String(err);
    console.error('[adblocker] FilterHub rebuild failed (' + label + '):', msg);
    return { success: false, message: msg };
  });
}

function setFilterhubEnabled(nums) {
  var validNums = {};
  FILTERHUB_LISTS.forEach(function(l) { validNums[l.num] = true; });
  var nextSel = Array.isArray(nums) ? nums.filter(function(n) { return validNums[n]; }) : [];
  return _applyFilterhubSelection(nextSel, 'selection').then(function(res) {
    if (!res.success) return res;
    return { success: true, enabled: filterhubEnabled.slice() };
  });
}

function setFilterhubPreset(level) {
  var lvl = FILTERHUB_LEVELS[level];
  if (!lvl) return Promise.resolve({ success: false, message: 'Unknown level: ' + level });
  return _applyFilterhubSelection(lvl.slice(), 'preset ' + level).then(function(res) {
    if (!res.success) return res;
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
  getEngineInfo,
  verifyListChecksum,
};
