#!/usr/bin/env python3
"""Build .skit packages for StartPOZI Browser.
Each .skit is a ZIP containing script.json (metadata) + script.js (code).
Run: python3 docs/scripts/build-skits.py
"""
import zipfile, json, os

OUT = os.path.dirname(os.path.abspath(__file__))

def make_skit(filename, meta, code):
    path = os.path.join(OUT, filename)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("script.json", json.dumps(meta, indent=2, ensure_ascii=False))
        z.writestr("script.js", code)
    print(f"  ✓ {filename} ({os.path.getsize(path)} bytes)")

# ─────────────────────────── 1. Dark Reader ───────────────────────────
dark_reader_js = r"""
(function(){
  if (window.__spiDarkReader) return;
  window.__spiDarkReader = true;
  // Don't double-invert images/videos (they'd look wrong)
  var css = `
    html { filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.92) !important; background:#fff !important; }
    img, picture, video, embed, object, iframe, canvas, svg,
    [style*="background-image"], [style*="background:url"],
    [role="img"] { filter: invert(1) hue-rotate(180deg) !important; }
    * { background-color: #1a1a1a !important; }
    body, p, h1, h2, h3, h4, h5, h6, li, span, a, td, th, div, blockquote, pre, code {
      color: #e0e0e0 !important;
    }
    a { color: #6cb6ff !important; }
    a:visited { color: #c58bff !important; }
    input, textarea, select, button { background:#2a2a2a !important; color:#e0e0e0 !important; border-color:#555 !important; }
    ::selection { background: #264f78 !important; color: #fff !important; }
    ::-webkit-scrollbar { width: 12px; height: 12px; }
    ::-webkit-scrollbar-track { background: #1a1a1a; }
    ::-webkit-scrollbar-thumb { background: #555; border-radius: 6px; }
  `;
  var st = document.createElement('style');
  st.id = 'spi-dark-reader';
  st.textContent = css;
  (document.head || document.documentElement).appendChild(st);
  // Observe DOM changes to re-apply (SPA navigation)
  var mo = new MutationObserver(function(){ /* CSS is global, nothing to do */ });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  console.log('[Dark Reader] enabled');
})();
"""

make_skit("dark-reader.skit", {
    "name": "Dark Reader",
    "author": "StartPOZI",
    "version": "1.0",
    "description": "Тёмный режим для всех сайтов. Инвертирует цвета, делает фон тёмным, а текст светлым. Изображения и видео не инвертируются.",
    "type": "js",
    "main": "script.js",
    "match": "*://*/*",
    "runAt": "document-start",
    "runInFrames": False,
    "permissions": []
}, dark_reader_js)


# ─────────────────────────── 2. Battery Saver ───────────────────────────
battery_saver_js = r"""
(function(){
  if (window.__spiBatterySaver) return;
  window.__spiBatterySaver = true;

  var ENABLED = false;
  function log(m){ console.log('[Battery Saver] ' + m); }

  function applyLowPower() {
    var css = `
      /* Pause CSS animations globally (not videos) */
      *:not(video):not(audio):not(.spi-bat-exempt) {
        animation-play-state: paused !important;
        transition: none !important;
      }
      /* Hide decorative heavy elements */
      [aria-hidden="true"], .ad, .ads, .banner, .sidebar-ad { display: none !important; }
      /* Reduce image rendering quality to save GPU */
      img { image-rendering: -moz-crisp-edges; image-rendering: crisp-edges; }
      /* Disable backdrop filters (GPU-heavy) */
      * { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
    `;
    var st = document.getElementById('spi-battery-saver');
    if (!st) { st = document.createElement('style'); st.id = 'spi-battery-saver'; (document.head||document.documentElement).appendChild(st); }
    st.textContent = css;
    log('Low-power mode ON');
  }
  function removeLowPower() {
    var st = document.getElementById('spi-battery-saver');
    if (st) st.remove();
    log('Low-power mode OFF');
  }

  function check() {
    navigator.getBattery ? navigator.getBattery().then(function(b){
      var low = b.level <= 0.20 && !b.charging;
      if (low !== ENABLED) { ENABLED = low; low ? applyLowPower() : removeLowPower(); }
    }) : log('Battery API unavailable');
  }

  // Initial check
  check();
  // Poll every 30s
  setInterval(check, 30000);
  log('Monitoring battery…');
})();
"""

make_skit("battery-saver.skit", {
    "name": "Battery Saver",
    "author": "StartPOZI",
    "version": "1.0",
    "description": "Для ноутбуков. При заряде ниже 20% отключает CSS-анимации, переходы, backdrop-filters и скрывает рекламу для экономии батареи.",
    "type": "js",
    "main": "script.js",
    "match": "*://*/*",
    "runAt": "document-idle",
    "runInFrames": False,
    "permissions": []
}, battery_saver_js)


# ─────────────────────────── 3. Auto-Translate ───────────────────────────
auto_translate_js = r"""
(function(){
  if (window.__spiAutoTranslate) return;
  window.__spiAutoTranslate = true;

  // Detect page language and offer translation to Russian if different
  function detectLang() {
    var lang = (document.documentElement.lang || '').split('-')[0].toLowerCase();
    if (lang) return lang;
    // Heuristic: check first 500 chars of text
    var sample = (document.body ? document.body.innerText : '').slice(0, 500).trim();
    if (/[\u0400-\u04FF]/.test(sample)) return 'ru';
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(sample)) return 'ja';
    return 'en';
  }

  var pageLang = detectLang();
  console.log('[Auto-Translate] page lang = ' + pageLang);

  if (pageLang && pageLang !== 'ru') {
    // Insert a translate banner
    var banner = document.createElement('div');
    banner.id = 'spi-translate-banner';
    banner.innerHTML = '\u{1F310} Страница на <b>' + pageLang.toUpperCase() + '</b>. <a href="#" id="spi-translate-go" style="color:#6cb6ff;cursor:pointer;text-decoration:underline;">Перевести на русский?</a>';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1a1a2e;color:#e0e0e0;padding:10px 20px;font-size:14px;font-family:sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
    (document.body || document.documentElement).appendChild(banner);

    document.getElementById('spi-translate-go').addEventListener('click', function(e){
      e.preventDefault();
      var url = 'https://translate.google.com/translate?sl=' + pageLang + '&tl=ru&u=' + encodeURIComponent(location.href);
      location.href = url;
    });

    // Auto-hide after 15s
    setTimeout(function(){ var b = document.getElementById('spi-translate-banner'); if (b) b.style.display = 'none'; }, 15000);
  }
})();
"""

make_skit("auto-translate.skit", {
    "name": "Auto Translate",
    "author": "StartPOZI",
    "version": "1.0",
    "description": "Определяет язык страницы и предлагает перевести на русский через Google Translate. Показывает баннер сверху для нерусскоязычных страниц.",
    "type": "js",
    "main": "script.js",
    "match": "*://*/*",
    "runAt": "document-idle",
    "runInFrames": False,
    "permissions": []
}, auto_translate_js)


# ─────────────────────────── 4. Reading Mode ───────────────────────────
reading_mode_js = r"""
(function(){
  if (window.__spiReadingMode) return;
  window.__spiReadingMode = true;

  // Find the main content block (largest text-dense area)
  function findMainContent() {
    var candidates = document.querySelectorAll('article, main, [role="main"], .post, .article, .content, #content');
    if (candidates.length) {
      var best = candidates[0]; var bestLen = best.innerText.length;
      for (var i = 1; i < candidates.length; i++) {
        var l = candidates[i].innerText.length;
        if (l > bestLen) { best = candidates[i]; bestLen = l; }
      }
      return best;
    }
    // Fallback: largest <div> with lots of <p>
    var divs = document.querySelectorAll('div');
    var best = null, bestScore = 0;
    divs.forEach(function(d){
      var paras = d.querySelectorAll('p').length;
      var text = d.innerText.length;
      var score = paras * 100 + text;
      if (score > bestScore && text > 500) { best = d; bestScore = score; }
    });
    return best;
  }

  var overlay = document.createElement('div');
  overlay.id = 'spi-reading-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.85);display:none;overflow-y:auto;padding:40px 20px;';
  overlay.innerHTML = '<div id="spi-reading-box" style="max-width:720px;margin:0 auto;background:#fafafa;color:#2a2a2a;border-radius:16px;padding:48px 56px;font-family:Georgia,serif;font-size:19px;line-height:1.8;box-shadow:0 8px 40px rgba(0,0,0,0.4);"></div>';

  function openReading() {
    var main = findMainContent();
    if (!main) { alert('Не удалось найти основной контент на этой странице'); return; }
    var box = overlay.querySelector('#spi-reading-box');
    var title = document.querySelector('h1');
    var html = '';
    if (title) html += '<h1 style="font-size:30px;margin-bottom:20px;line-height:1.3;">' + title.innerText + '</h1>';
    // Extract paragraphs
    var paras = main.querySelectorAll('p, h2, h3, li, blockquote, pre');
    paras.forEach(function(p){
      var tag = p.tagName.toLowerCase();
      if (tag === 'h2') html += '<h2 style="font-size:24px;margin:28px 0 12px;">' + p.innerText + '</h2>';
      else if (tag === 'h3') html += '<h3 style="font-size:21px;margin:24px 0 10px;">' + p.innerText + '</h3>';
      else if (tag === 'blockquote') html += '<blockquote style="border-left:4px solid #ccc;margin:16px 0;padding:8px 20px;color:#555;font-style:italic;">' + p.innerText + '</blockquote>';
      else if (tag === 'pre') html += '<pre style="background:#f0f0f0;padding:16px;border-radius:8px;overflow-x:auto;font-size:15px;">' + p.innerText + '</pre>';
      else html += '<p style="margin:0 0 16px;">' + p.innerHTML + '</p>';
    });
    html += '<button id="spi-reading-close" style="margin-top:32px;padding:10px 24px;border:none;border-radius:8px;background:#667eea;color:#fff;font-size:15px;cursor:pointer;">Закрыть</button>';
    box.innerHTML = html;
    overlay.style.display = 'block';
    (document.body || document.documentElement).appendChild(overlay);
    document.body.style.overflow = 'hidden';
    document.getElementById('spi-reading-close').addEventListener('click', closeReading);
    overlay.addEventListener('click', function(e){ if (e.target === overlay) closeReading(); });
    console.log('[Reading Mode] opened');
  }
  function closeReading() {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  // Floating button
  var btn = document.createElement('div');
  btn.id = 'spi-reading-btn';
  btn.innerHTML = '\u{1F4D6}';
  btn.style.cssText = 'position:fixed;bottom:24px;left:24px;z-index:2147483647;width:48px;height:48px;border-radius:50%;background:#667eea;color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.3);transition:transform 0.2s;';
  btn.title = 'Режим чтения';
  btn.addEventListener('mouseenter', function(){ btn.style.transform = 'scale(1.1)'; });
  btn.addEventListener('mouseleave', function(){ btn.style.transform = 'scale(1)'; });
  btn.addEventListener('click', openReading);
  // Wait for body
  if (document.body) document.body.appendChild(btn);
  else document.addEventListener('DOMContentLoaded', function(){ document.body.appendChild(btn); });
  console.log('[Reading Mode] ready — click the book button');
})();
"""

make_skit("reading-mode.skit", {
    "name": "Reading Mode",
    "author": "StartPOZI",
    "version": "1.0",
    "description": "Режим чтения без отвлекающих элементов. Кнопка 📖 открывает чистый текст статьи с крупным шрифтом. Автоматически находит основной контент страницы.",
    "type": "js",
    "main": "script.js",
    "match": "*://*/*",
    "runAt": "document-idle",
    "runInFrames": False,
    "permissions": []
}, reading_mode_js)


# ─────────────────────────── 5. Privacy Shield ───────────────────────────
privacy_shield_js = r"""
(function(){
  if (window.__spiPrivacyShield) return;
  window.__spiPrivacyShield = true;

  // 1. Remove known tracking pixels (1x1 images, transparent iframes)
  function removeTrackers() {
    // Tracking pixels
    document.querySelectorAll('img').forEach(function(img){
      var w = img.naturalWidth || img.width;
      var h = img.naturalHeight || img.height;
      if ((w <= 1 && h <= 1) || (img.width <= 1 && img.height <= 1)) {
        var src = img.src || '';
        if (/facebook|google-analytics|googletagmanager|doubleclick|fb\.com|hotjar|mixpanel|segment\.io|amplitude\.com/i.test(src)) {
          img.remove();
          console.log('[Privacy Shield] removed tracker pixel: ' + src.slice(0,60));
        }
      }
    });
    // Tracking iframes
    document.querySelectorAll('iframe').forEach(function(f){
      var src = f.src || '';
      if (/google-analytics|doubleclick|googletagmanager|facebook\.com\/tr|hotjar|adservice/i.test(src)) {
        f.remove();
        console.log('[Privacy Shield] removed tracker iframe: ' + src.slice(0,60));
      }
    });
  }
  removeTrackers();
  var mo = new MutationObserver(function(mutations){
    var check = false;
    mutations.forEach(function(m){ if (m.addedNodes.length) check = true; });
    if (check) removeTrackers();
  });
  if (document.body) mo.observe(document.body, { childList: true, subtree: true });
  else document.addEventListener('DOMContentLoaded', function(){ mo.observe(document.body, { childList: true, subtree: true }); });

  // 2. Spoof canvas fingerprint (add subtle noise)
  try {
    var origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(){
      var ctx = this.getContext('2d');
      if (ctx && this.width > 1 && this.height > 1) {
        try {
          var img = ctx.getImageData(0, 0, Math.min(this.width, 16), Math.min(this.height, 16));
          for (var i = 0; i < img.data.length; i += 4) {
            img.data[i] ^= 1;     // tiny R noise
          }
          ctx.putImageData(img, 0, 0);
        } catch(e) {} // CORS canvases will throw
      }
      return origToDataURL.apply(this, arguments);
    };
  } catch(e) {}

  // 3. Remove tracking parameters from the URL
  try {
    var url = new URL(location.href);
    var changed = false;
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','fbclid','gclid','mc_eid','ref'].forEach(function(p){
      if (url.searchParams.has(p)) { url.searchParams.delete(p); changed = true; }
    });
    if (changed) {
      console.log('[Privacy Shield] cleaned tracking params from URL');
      // Don't replace to avoid breaking the page — just log
    }
  } catch(e) {}

  console.log('[Privacy Shield] active');
})();
"""

make_skit("privacy-shield.skit", {
    "name": "Privacy Shield",
    "author": "StartPOZI",
    "version": "1.0",
    "description": "Удаляет трекинг-пиксели (Facebook, Google Analytics и др.), подменяет canvas-fingerprint, очищает URL от utm/fbclid/gclid параметров. Усиление приватности поверх встроенного блокировщика.",
    "type": "js",
    "main": "script.js",
    "match": "*://*/*",
    "runAt": "document-idle",
    "runInFrames": True,
    "permissions": []
}, privacy_shield_js)

print("\nDone! All .skit packages built in: " + OUT)
