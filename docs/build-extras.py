#!/usr/bin/env python3
"""Build the extended pack: 14 themes (.thmz) + 14 scripts (.skit).

Themes  -> docs/themes/*.thmz
Scripts -> docs/scripts/*.skit

Run: python3 docs/build-extras.py
"""
import zipfile, json, os, re

ROOT = os.path.dirname(os.path.abspath(__file__))
THEMES_DIR = os.path.join(ROOT, "themes")
SCRIPTS_DIR = os.path.join(ROOT, "scripts")

_BANNED_CSS = re.compile(r"javascript:|expression\(", re.I)

def hex_to_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

def make_theme(filename, name, description, ttype, colors):
    """colors: dict(primary, bg, bg2, hover, text, text2, border[, overlay])"""
    for v in ("primary", "bg", "bg2", "hover", "text", "text2", "border"):
        if v not in colors:
            raise ValueError("theme %s: missing %s" % (name, v))
    r, g, b = hex_to_rgb(colors["bg"])
    r2, g2, b2 = hex_to_rgb(colors["bg2"])
    overlay = colors.get("overlay") or "rgba(%d, %d, %d, 0.92)" % (r, g, b)

    def block():
        return (
            "  --primary-color: %s;\n"
            "  --bg-color: %s;\n"
            "  --bg-secondary: %s;\n"
            "  --bg-hover: %s;\n"
            "  --text-primary: %s;\n"
            "  --text-secondary: %s;\n"
            "  --border-color: %s;\n"
            "  --overlay-bg: %s;\n"
            "  --bg-color-alpha: rgba(%d, %d, %d, var(--win-opacity));\n"
            "  --bg-secondary-alpha: rgba(%d, %d, %d, var(--win-opacity));\n"
        ) % (
            colors["primary"], colors["bg"], colors["bg2"], colors["hover"],
            colors["text"], colors["text2"], colors["border"], overlay,
            r, g, b, r2, g2, b2,
        )

    cls = "body.theme-light" if ttype == "light" else "body.theme-dark"
    css = "/* %s theme */\n:root {\n%s}\n%s {\n%s}\n" % (name, block(), cls, block())
    if _BANNED_CSS.search(css):
        raise ValueError("theme %s: banned CSS" % name)

    meta = {
        "name": name,
        "author": "StartPOZI",
        "version": "1.0",
        "description": description,
        "type": ttype,
    }
    path = os.path.join(THEMES_DIR, filename)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("theme.json", json.dumps(meta, indent=2, ensure_ascii=False))
        z.writestr("theme.css", css)
    print("  theme  ok %s (%d bytes)" % (filename, os.path.getsize(path)))

def make_skit(filename, meta, code):
    if not meta.get("name") or not meta.get("description"):
        raise ValueError("skit %s: name/description required" % filename)
    path = os.path.join(SCRIPTS_DIR, filename)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("script.json", json.dumps(meta, indent=2, ensure_ascii=False))
        z.writestr("script.js", code)
    print("  skit   ok %s (%d bytes)" % (filename, os.path.getsize(path)))

def skit_meta(name, description, match="*://*/*", run_at="document-idle", frames=False):
    return {
        "name": name,
        "author": "StartPOZI",
        "version": "1.0",
        "description": description,
        "type": "js",
        "main": "script.js",
        "match": match,
        "runAt": run_at,
        "runInFrames": frames,
        "permissions": [],
    }

# ══════════════════════════════ 14 THEMES ══════════════════════════════

make_theme("nord.thmz", "Nord", "Холодная скандинавская палитра: фьорды и иней", "dark", dict(
    primary="#88c0d0", bg="#2e3440", bg2="#3b4252", hover="#434c5e",
    text="#eceff4", text2="#d8dee9", border="#434c5e"))

make_theme("dracula.thmz", "Dracula", "Классическая тёмная схема Dracula: фиолетовые акценты", "dark", dict(
    primary="#bd93f9", bg="#282a36", bg2="#343746", hover="#44475a",
    text="#f8f8f2", text2="#b6b8c8", border="#44475a"))

make_theme("tokyo-night.thmz", "Tokyo Night", "Ночной Токио: глубокий синий и неоновые огни", "dark", dict(
    primary="#7aa2f7", bg="#1a1b26", bg2="#24283b", hover="#2f334d",
    text="#c0caf5", text2="#9aa5ce", border="#2f334d"))

make_theme("catppuccin-mocha.thmz", "Catppuccin Mocha", "Мягкая пастельная тёмная тема Catppuccin (Mocha)", "dark", dict(
    primary="#cba6f7", bg="#1e1e2e", bg2="#181825", hover="#313244",
    text="#cdd6f4", text2="#a6adc8", border="#313244"))

make_theme("gruvbox-dark.thmz", "Gruvbox Dark", "Тёплая ретро-палитра Gruvbox: янтарь и охра", "dark", dict(
    primary="#fabd2f", bg="#282828", bg2="#3c3836", hover="#504945",
    text="#ebdbb2", text2="#bdae93", border="#504945"))

make_theme("cyberpunk-neon.thmz", "Cyberpunk Neon", "Неоновый киберпанк: розово-голубое свечение на чёрном", "dark", dict(
    primary="#05d9e8", bg="#0d0221", bg2="#190b28", hover="#260f3c",
    text="#d1f7ff", text2="#a0a5c0", border="#3a1053",
    overlay="rgba(13, 2, 33, 0.94)"))

make_theme("solarized-dark.thmz", "Solarized Dark", "Легендарная схема Solarized Dark — мягкий бирюзовый фон", "dark", dict(
    primary="#268bd2", bg="#002b36", bg2="#073642", hover="#0d4554",
    text="#eee8d5", text2="#93a1a1", border="#586e75"))

make_theme("rose-pine.thmz", "Rosé Pine", "Романтичная палитра Rosé Pine: розовая пыль и лаванда", "dark", dict(
    primary="#ebbcba", bg="#191724", bg2="#1f1d2e", hover="#26233a",
    text="#e0def4", text2="#908caa", border="#26233a"))

make_theme("everforest.thmz", "Everforest", "Спокойный хвойный лес: зелень и мох", "dark", dict(
    primary="#a7c080", bg="#2d353b", bg2="#343f44", hover="#3d484d",
    text="#d3c6aa", text2="#9da9a0", border="#414b50"))

make_theme("kanagawa.thmz", "Kanagawa", "Японская гравюра: чернила суми и волна Канагавы", "dark", dict(
    primary="#7e9cd8", bg="#1f1f28", bg2="#2a2a37", hover="#363646",
    text="#dcd7ba", text2="#9a9a90", border="#2a2a37"))

make_theme("onyx-graphite.thmz", "Onyx Graphite", "Строгий нейтральный графит для минималистов", "dark", dict(
    primary="#4f8cff", bg="#16181d", bg2="#1f2229", hover="#2a2e38",
    text="#e6e9ef", text2="#9aa1ad", border="#2a2e38"))

make_theme("paper-white.thmz", "Paper White", "Белая бумага: чистая светлая тема для дня", "light", dict(
    primary="#2563eb", bg="#f7f7f5", bg2="#ffffff", hover="#eceee9",
    text="#1c1e21", text2="#5f6368", border="#e0e2e0",
    overlay="rgba(255, 255, 255, 0.95)"))

make_theme("catppuccin-latte.thmz", "Catppuccin Latte", "Пастельная светлая тема Catppuccin (Latte)", "light", dict(
    primary="#8839ef", bg="#eff1f5", bg2="#e6e9ef", hover="#dce0e8",
    text="#4c4f69", text2="#6c6f85", border="#ccd0da",
    overlay="rgba(239, 241, 245, 0.95)"))

make_theme("nord-light.thmz", "Nord Light", "Светлая версия Nord: снежные вершин­ы", "light", dict(
    primary="#5e81ac", bg="#eceff4", bg2="#e5e9f0", hover="#d8dee9",
    text="#2e3440", text2="#4c566a", border="#d8dee9",
    overlay="rgba(236, 239, 244, 0.95)"))

# ══════════════════════════════ 14 SKITS ══════════════════════════════

# 1. Scroll Progress — полоса прогресса прокрутки
scroll_progress_js = r"""
(function(){
  if (window.__spzScrollProgress) return;
  window.__spzScrollProgress = true;
  var bar = document.createElement('div');
  bar.id = 'spz-scroll-progress';
  bar.style.cssText = 'position:fixed;top:0;left:0;height:3px;width:0;z-index:2147483647;background:linear-gradient(90deg,#667eea,#764ba2);pointer-events:none;transition:width .08s linear;';
  (document.body || document.documentElement).appendChild(bar);
  function upd() {
    try {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      var p = max > 0 ? (h.scrollTop / max) : 0;
      bar.style.width = (p * 100).toFixed(1) + '%';
    } catch(e) {}
  }
  window.addEventListener('scroll', upd, { passive: true });
  window.addEventListener('resize', upd);
  upd();
})();
"""
make_skit("scroll-progress.skit", skit_meta(
    "Scroll Progress", "Тонкая полоса сверху экрана показывает, сколько страницы уже прокручено (0–100%). Работает на всех сайтах."), scroll_progress_js)

# 2. Video Speed Controller — скорость любого видео
video_speed_js = r"""
(function(){
  if (window.__spzVideoSpeed) return;
  window.__spzVideoSpeed = true;
  var STEP = 0.25, MAX = 4, MIN = 0.25;
  function fmt(v) { return v.toFixed(2).replace(/0$/, '').replace(/\.$/, '') + 'x'; }
  function panelFor(video) {
    var p = video.__spzSpeedPanel;
    if (p && p.parentNode) return p;
    p = document.createElement('div');
    p.style.cssText = 'position:absolute;z-index:2147483647;display:flex;gap:4px;align-items:center;background:rgba(0,0,0,.75);border-radius:8px;padding:4px 8px;font:12px/1 sans-serif;color:#fff;opacity:0;transition:opacity .15s;pointer-events:auto;';
    var minus = document.createElement('b'), val = document.createElement('span'), plus = document.createElement('b'), reset = document.createElement('b');
    minus.textContent = '−'; plus.textContent = '+'; reset.textContent = '↺';
    minus.style.cssText = plus.style.cssText = reset.style.cssText = 'cursor:pointer;padding:0 4px;font-size:14px;';
    val.style.cssText = 'min-width:34px;text-align:center;font-variant-numeric:tabular-nums;';
    function set(v) {
      try { video.playbackRate = Math.max(MIN, Math.min(MAX, v)); } catch(e) {}
      val.textContent = fmt(video.playbackRate);
    }
    minus.addEventListener('click', function(e){ e.stopPropagation(); set(video.playbackRate - STEP); });
    plus.addEventListener('click', function(e){ e.stopPropagation(); set(video.playbackRate + STEP); });
    reset.addEventListener('click', function(e){ e.stopPropagation(); set(1); });
    p.appendChild(minus); p.appendChild(val); p.appendChild(plus); p.appendChild(reset);
    val.textContent = fmt(video.playbackRate || 1);
    video.addEventListener('loadedmetadata', function(){ val.textContent = fmt(video.playbackRate || 1); });
    video.__spzSpeedPanel = p;
    return p;
  }
  function attach(video) {
    if (video.__spzSpeedWired) return;
    video.__spzSpeedWired = true;
    video.addEventListener('mouseenter', function(){
      var host = video.closest('[style*="position"]') || video.parentElement;
      if (!host || getComputedStyle(host).position === 'static') {
        if (getComputedStyle(video).position === 'static') video.style.position = 'relative';
        host = video;
      }
      var p = panelFor(video);
      host.appendChild(p);
      var r = video.getBoundingClientRect();
      p.style.left = '8px'; p.style.top = '8px';
      p.style.opacity = '1';
    });
    video.addEventListener('mouseleave', function(){
      var p = video.__spzSpeedPanel;
      if (p) p.style.opacity = '0';
    });
  }
  function scan() {
    document.querySelectorAll('video').forEach(function(v){
      if (v.readyState !== 0 || v.duration > 0.3 || v.offsetWidth > 100) attach(v);
    });
  }
  scan();
  var mo = new MutationObserver(scan);
  if (document.body) mo.observe(document.body, { childList: true, subtree: true });
  else document.addEventListener('DOMContentLoaded', function(){ scan(); mo.observe(document.body, { childList: true, subtree: true }); });
})();
"""
make_skit("video-speed.skit", skit_meta(
    "Video Speed Controller", "Наведи на любое видео — появятся кнопки −/+ скорости и сброс (0.25x–4x). Работает на всех сайтах."), video_speed_js)

# 3. No Sticky Headers — открепляет прилипающие шапки
no_sticky_js = r"""
(function(){
  if (window.__spzNoSticky) return;
  window.__spzNoSticky = true;
  var ON = false;
  function unstick() {
    document.querySelectorAll('header, nav, [class*="header" i], [class*="navbar" i], [id*="header" i]').forEach(function(el) {
      try {
        var pos = getComputedStyle(el).position;
        if ((pos === 'fixed' || pos === 'sticky') && el.offsetHeight < 300) {
          if (!el.__spzPrevPos) el.__spzPrevPos = el.style.position;
          el.style.position = 'relative';
          el.dataset.spzUnstuck = '1';
        }
      } catch(e) {}
    });
  }
  function restick() {
    document.querySelectorAll('[data-spz-unstuck]').forEach(function(el) {
      el.style.position = el.__spzPrevPos || '';
      delete el.dataset.spzUnstuck;
    });
  }
  var btn = document.createElement('div');
  btn.id = 'spz-unstick-btn';
  btn.textContent = '📌';
  btn.title = 'Открепить прилипающие шапки';
  btn.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;width:44px;height:44px;border-radius:50%;background:rgba(30,30,40,.9);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);user-select:none;';
  btn.addEventListener('click', function() {
    ON = !ON;
    ON ? unstick() : restick();
    btn.style.background = ON ? 'linear-gradient(135deg,#667eea,#764ba2)' : 'rgba(30,30,40,.9)';
  });
  function boot() { document.body.appendChild(btn); }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
"""
make_skit("no-sticky.skit", skit_meta(
    "No Sticky Headers", "Кнопка 📌 открепляет «прилипающие» шапки и меню — они остаются только в начале страницы. Повторный клик возвращает как было."), no_sticky_js)

# 4. Reading Font — комфортная типографика статей
reading_font_js = r"""
(function(){
  if (window.__spzReadingFont) return;
  window.__spzReadingFont = true;
  var st = document.createElement('style');
  st.id = 'spz-reading-font';
  st.textContent = 'article p, article li, main p, main li, .post .content p, #content p, div[class*="article" i] p, div[class*="article" i] li {' +
    'font-family: Georgia, "Times New Roman", serif !important; font-size: 18px !important; line-height: 1.75 !important; letter-spacing: .2px !important; }' +
    'article p + p, main p + p { text-indent: 1.5em; }';
  var ON = false;
  var btn = document.createElement('div');
  btn.id = 'spz-reading-font-btn';
  btn.textContent = 'Aa';
  btn.title = 'Комфортный шрифт статей';
  btn.style.cssText = 'position:fixed;bottom:24px;right:76px;z-index:2147483647;width:44px;height:44px;border-radius:50%;background:rgba(30,30,40,.9);color:#fff;display:flex;align-items:center;justify-content:center;font:italic 20px Georgia,serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);user-select:none;';
  btn.addEventListener('click', function() {
    ON = !ON;
    if (ON) (document.head || document.documentElement).appendChild(st);
    else if (st.parentNode) st.remove();
    btn.style.background = ON ? 'linear-gradient(135deg,#667eea,#764ba2)' : 'rgba(30,30,40,.9)';
  });
  function boot() { document.body.appendChild(btn); }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
"""
make_skit("reading-font.skit", skit_meta(
    "Reading Font", "Кнопка Aa переключает статьи на комфортную типографику: книжный шрифт Georgia, размер 18px, межстрочный интервал 1.75, красная строка."), reading_font_js)

# 5. Select to Search — поиск выделенного текста
select_search_js = r"""
(function(){
  if (window.__spzSelectSearch) return;
  window.__spzSelectSearch = true;
  var bubble = document.createElement('div');
  bubble.textContent = '🔍 Искать';
  bubble.style.cssText = 'position:absolute;z-index:2147483647;display:none;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:7px 12px;border-radius:8px;font:13px sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);user-select:none;';
  function hide() { bubble.style.display = 'none'; }
  document.addEventListener('mouseup', function(e) {
    if (bubble.contains(e.target)) return;
    setTimeout(function() {
      var sel = window.getSelection ? String(window.getSelection()) : '';
      sel = sel.trim();
      if (!sel || sel.length > 300 || !sel.match(/\s/) && sel.length > 60) { hide(); return; }
      var x = e.pageX, y = e.pageY;
      bubble.style.left = Math.max(8, x - 30) + 'px';
      bubble.style.top = (y - 42) + 'px';
      bubble.style.display = 'block';
      bubble.__query = sel;
    }, 10);
  });
  bubble.addEventListener('mousedown', function(e) { e.preventDefault(); });
  bubble.addEventListener('click', function(e) {
    e.preventDefault();
    var q = bubble.__query || '';
    hide();
    if (q) window.open('https://startpozi.com/search.html?q=' + encodeURIComponent(q), '_blank');
  });
  document.addEventListener('scroll', hide, { passive: true });
  document.addEventListener('mousedown', function(e) { if (!bubble.contains(e.target)) hide(); });
  function boot() { document.body.appendChild(bubble); }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
"""
make_skit("select-to-search.skit", skit_meta(
    "Select to Search", "Выдели текст — появится кнопка «🔍 Искать». Клик открывает поиск StartPOZI с этим текстом в новой вкладке."), select_search_js)

# 6. Table of Contents — оглавление длинных статей
toc_js = r"""
(function(){
  if (window.__spzToc) return;
  window.__spzToc = true;
  var panel = document.createElement('div');
  panel.id = 'spz-toc';
  panel.style.cssText = 'position:fixed;top:80px;right:-320px;width:290px;max-height:70vh;overflow-y:auto;background:rgba(25,25,35,.97);color:#e8e8f0;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:14px 16px;z-index:2147483646;font:13px/1.6 sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.4);transition:right .25s;';
  panel.innerHTML = '<div style="font-weight:700;margin-bottom:8px;">📑 Оглавление</div><div id="spz-toc-list"></div>';
  var btn = document.createElement('div');
  btn.textContent = '📑';
  btn.title = 'Оглавление страницы';
  btn.style.cssText = 'position:fixed;top:80px;right:16px;z-index:2147483647;width:42px;height:42px;border-radius:50%;background:rgba(30,30,40,.92);display:flex;align-items:center;justify-content:center;font-size:19px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);user-select:none;';
  var open = false;
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function build() {
    var hs = document.querySelectorAll('h1, h2, h3');
    var list = panel.querySelector('#spz-toc-list');
    if (!hs.length) { list.innerHTML = '<i style="opacity:.6">Заголовков не найдено</i>'; return; }
    var html = '';
    hs.forEach(function(h, i) {
      if (!h.id) h.id = 'spz-toc-h' + i;
      var pad = h.tagName === 'H1' ? 0 : h.tagName === 'H2' ? 14 : 28;
      html += '<div data-target="' + h.id + '" style="padding:3px 0 3px ' + pad + 'px;cursor:pointer;border-radius:6px;">' +
        '<a href="#' + h.id + '" style="color:#a8b4ff;text-decoration:none;">' + esc(h.textContent.trim().slice(0, 60)) + '</a></div>';
    });
    list.innerHTML = html;
    list.querySelectorAll('a').forEach(function(a) {
      a.addEventListener('click', function(ev) {
        ev.preventDefault();
        var t = document.getElementById(a.getAttribute('href').slice(1));
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }
  btn.addEventListener('click', function() {
    if (!panel.__built) { build(); panel.__built = true; }
    open = !open;
    panel.style.right = open ? '16px' : '-320px';
  });
  function boot() { document.body.appendChild(panel); document.body.appendChild(btn); }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
"""
make_skit("toc-sidebar.skit", skit_meta(
    "Table of Contents", "Кнопка 📑 строит боковое оглавление из заголовков страницы — удобно для длинных статей и документаций. Плавный переход по клику."), toc_js)

# 7. YouTube Pure — чистый YouTube
youtube_pure_js = r"""
(function(){
  if (window.__spzYtPure) return;
  window.__spzYtPure = true;
  var st = document.createElement('style');
  st.textContent =
    'ytd-rich-shelf-renderer[is-shorts], ytd-reel-shelf-renderer, ytd-rich-section-renderer[is-shorts] { display:none !important; }' +
    'ytd-popup-container tp-yt-paper-dialog[dialog-renderer] { display:none !important; }' +
    '.ytp-ce-element, .ytp-ce-shadow { display:none !important; }' +
    'ytd-guided-section-renderer, ytd-horizontal-card-list-renderer:not(:first-of-type) { display:none !important; }' +
    '#masthead-container ytd-promoted-sparkles-web-renderer, ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer { display:none !important; }';
  (document.head || document.documentElement).appendChild(st);
  // Отключить автопереход к следующему видео
  function disableAutoplay() {
    try {
      var btn = document.querySelector('.ytp-autonav-toggle-button[aria-checked="true"]');
      if (btn) btn.click();
    } catch(e) {}
  }
  setTimeout(disableAutoplay, 2500);
  setTimeout(disableAutoplay, 6000);
  document.addEventListener('yt-navigate-finish', function() {
    panel.__built = false;
    setTimeout(disableAutoplay, 2500);
  });
  // Убрать надоедливое окно «Продолжить просмотр?»
  setInterval(function() {
    try {
      var dlg = document.querySelector('yt-confirm-dialog-renderer, tp-yt-paper-dialog[dialog-renderer]');
      if (dlg) {
        var btns = dlg.querySelectorAll('yt-button-shape button, paper-button');
        btns.forEach(function(b) { if (/да|yes/i.test(b.textContent || '')) b.click(); });
      }
    } catch(e) {}
  }, 4000);
  var panel = { __built: false };
  console.log('[YouTube Pure] active');
})();
"""
make_skit("youtube-pure.skit", skit_meta(
    "YouTube Pure", "Скрывает Shorts на главной, рекламные слоты, концовки-предложения и отключает автопереход к следующему видео. Только YouTube.",
    match="*://*.youtube.com/*,*://*.youtu.be/*", run_at="document-end"), youtube_pure_js)

# 8. X Clean — чистая лента X (Twitter)
x_clean_js = r"""
(function(){
  if (window.__spzXClean) return;
  window.__spzXClean = true;
  var st = document.createElement('style');
  st.textContent =
    '[data-testid="placementTracking"] { display:none !important; }' +
    'aside [data-testid="cellInnerDivider"] ~ div:has([data-testid="UserCell"]) { display:none !important; }' +
    'aside section[aria-labelledby] h2:not([id*="ontimeline" i]) { }' +
    '[data-testid="DASHEmptyTimeline"] { display:none !important; }' +
    'div[data-testid="toast"] { display:none !important; }';
  (document.head || document.documentElement).appendChild(st);
  // Скрывать блоки «Кого читать» / «Актуальные темы» целиком
  function cleanAside() {
    document.querySelectorAll('aside section h2').forEach(function(h2) {
      var t = (h2.getAttribute('aria-label') || h2.textContent || '').trim();
      if (/Кого читать|Who to follow|Актуальные темы|What.s happening|Темы для вас|Premium|Подписки/i.test(t)) {
        var sec = h2.closest('section');
        if (sec) sec.style.display = 'none';
      }
    });
  }
  cleanAside();
  setInterval(cleanAside, 5000);
  console.log('[X Clean] active');
})();
"""
make_skit("x-clean.skit", skit_meta(
    "X Clean", "Прячет рекламные (промо-туиты) посты, блоки «Кого читать» и «Актуальные темы» в ленте X/Twitter. Только twitter.com и x.com.",
    match="*://x.com/*,*://twitter.com/*", run_at="document-end"), x_clean_js)

# 9. VK Clean — чистый VK
vk_clean_js = r"""
(function(){
  if (window.__spzVkClean) return;
  window.__spzVkClean = true;
  var st = document.createElement('style');
  st.textContent =
    '.ad_row, .ad_help, .ad_frame, #left_ads, div[id^="ads"], [data-ad], .wall_module .wall_post_source:has(+ .wall_post_text ~ .wall_ads_tag), ' +
    '.feed .wall_text_name:has(~ div[class*="ads"]), .apps_feed_block, .market_feed_ads, ' +
    'div[class*="ad_"] + div[class*="ad_"], #ads_left, .ads_ads_news, .inline_ad, .show_app_subscription { display:none !important; }' +
    '.wall_marked_as_ads { opacity:.55; }';
  (document.head || document.documentElement).appendChild(st);
  function removeAds() {
    document.querySelectorAll('div[id^="post"]').forEach(function(post) {
      try {
        if (post.querySelector('.wall_marked_as_ads, [data-ad], .ads_ads_news')) {
          post.style.display = 'none';
        }
      } catch(e) {}
    });
  }
  removeAds();
  setInterval(removeAds, 4000);
  console.log('[VK Clean] active');
})();
"""
make_skit("vk-clean.skit", skit_meta(
    "VK Clean", "Скрывает рекламные записи в ленте, рекламные блоки в меню и промо-карточки ВКонтакте. Только vk.com.",
    match="*://vk.com/*,*://*.vk.com/*", run_at="document-end"), vk_clean_js)

# 10. GitHub Clean — чистый GitHub
github_clean_js = r"""
(function(){
  if (window.__spzGhClean) return;
  window.__spzGhClean = true;
  var st = document.createElement('style');
  st.textContent =
    '.js-notice, .js-footer-container footer, .footer, ' +
    'div[data-testid="dashboard-feed-placement"], ' +
    '.experiment-promo, .js-cookie-consent, ' +
    'repository-container-header + div .Layout-sidebar .BorderGrid-row:last-child, ' +
    'button[data-ga-click*="signup"], .btn-primary[href*="/signup"], ' +
    '.application-main .js-flash-container, ' +
    '#suggest-login-head, .auth-form-body, ' +
    '.pt-4:has(a[href="/features/actions"]), ' +
    'div[data-test-selector="projects-banner"], .gh-header-show .gh-header-meta a[data-hovercard-type="organization"] ~ span:last-child { }' +
    '.js-profile-editable-edit-button, button.btn:has(svg.octicon-gift) { }' +
    // Реальные скрывания
    '.js-notice, .footer, .js-cookie-consent, [data-testid="dashboard-feed-placement"], .experiment-promo { display:none !important; }' +
    '.repository-content .Box:has(.octicon-book) ~ .Box:has(a[href*="releases"]) { }';
  (document.head || document.documentElement).appendChild(st);
  console.log('[GitHub Clean] active');
})();
"""
make_skit("github-clean.skit", skit_meta(
    "GitHub Clean", "Убирает с GitHub промо-баннеры, футер, cookie-нотисы и рекламные плашки дашборда. Только github.com.",
    match="*://github.com/*", run_at="document-end"), github_clean_js)

# 11. Show Password — показать пароль
show_password_js = r"""
(function(){
  if (window.__spzShowPass) return;
  window.__spzShowPass = true;
  var eye = document.createElement('div');
  eye.textContent = '👁';
  eye.title = 'Показать/скрыть пароль';
  eye.style.cssText = 'position:absolute;z-index:2147483647;width:26px;height:26px;display:none;align-items:center;justify-content:center;font-size:15px;cursor:pointer;user-select:none;background:transparent;border-radius:6px;';
  var active = null;
  function place() {
    if (!active) return;
    var r = active.getBoundingClientRect();
    eye.style.left = (r.right - 30 + window.scrollX) + 'px';
    eye.style.top = (r.top + (r.height - 26) / 2 + window.scrollY) + 'px';
    eye.style.display = 'flex';
  }
  eye.addEventListener('mousedown', function(e) {
    e.preventDefault();
    if (active) active.type = active.type === 'password' ? 'text' : 'password';
  });
  function boot() { document.body.appendChild(eye); }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
  document.addEventListener('focusin', function(e) {
    var t = e.target;
    if (t && t.tagName === 'INPUT' && t.type === 'password') {
      active = t;
      place();
    } else if (active && e.target !== eye) {
      // уводим глазик только при уходе с поля
      if (e.target !== active) { active.__keep = false; }
    }
  });
  document.addEventListener('focusout', function() {
    setTimeout(function() {
      if (document.activeElement !== eye && document.activeElement !== active) {
        if (active && document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'BODY')) {
          eye.style.display = 'none';
          active = (document.activeElement.tagName === 'INPUT' && document.activeElement.type === 'password') ? document.activeElement : null;
          if (active) place(); else eye.style.display = 'none';
        }
      }
    }, 60);
  });
  window.addEventListener('scroll', function() { if (active) place(); }, { passive: true });
  window.addEventListener('resize', function() { if (active) place(); });
})();
"""
make_skit("show-password.skit", skit_meta(
    "Show Password Toggle", "При фокусе на поле пароля появляется 👁 — клик показывает/скрывает введённый пароль. Полезно против опечаток при входе."), show_password_js)

# 12. Copy Code Button — кнопка «Копировать» у блоков кода
copy_code_js = r"""
(function(){
  if (window.__spzCopyCode) return;
  window.__spzCopyCode = true;
  function addBtn(pre) {
    if (pre.__spzCopyBtn || pre.querySelector('.spz-copy-btn')) return;
    if (getComputedStyle(pre).position === 'static') pre.style.position = 'relative';
    var b = document.createElement('button');
    b.className = 'spz-copy-btn';
    b.textContent = 'Копировать';
    b.style.cssText = 'position:absolute;top:6px;right:6px;z-index:99;padding:4px 10px;border:none;border-radius:6px;background:rgba(102,126,234,.9);color:#fff;font:11px sans-serif;cursor:pointer;opacity:0;transition:opacity .15s;';
    pre.addEventListener('mouseenter', function(){ b.style.opacity = '1'; });
    pre.addEventListener('mouseleave', function(){ b.style.opacity = '0'; });
    b.addEventListener('click', function(e) {
      e.preventDefault();
      var text = pre.innerText;
      function done() { b.textContent = '✓ Скопировано'; setTimeout(function(){ b.textContent = 'Копировать'; }, 1500); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function(){ fallback(); });
      } else fallback();
      function fallback() {
        try {
          var ta = document.createElement('textarea');
          ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); ta.remove(); done();
        } catch(err) {}
      }
    });
    pre.appendChild(b);
    pre.__spzCopyBtn = b;
  }
  function scan() {
    document.querySelectorAll('pre').forEach(function(p) {
      if (p.innerText && p.innerText.length > 24) addBtn(p);
    });
  }
  scan();
  var mo = new MutationObserver(function(){ scan(); });
  if (document.body) mo.observe(document.body, { childList: true, subtree: true });
  else document.addEventListener('DOMContentLoaded', function(){ scan(); mo.observe(document.body, { childList: true, subtree: true }); });
})();
"""
make_skit("copy-code-button.skit", skit_meta(
    "Copy Code Button", "У каждого блока кода (<pre>) при наведении появляется кнопка «Копировать» — один клик и код в буфере обмена. Для документаций и Stack Overflow."), copy_code_js)

# 13. Selection Stats — счётчик слов и символов
text_stats_js = r"""
(function(){
  if (window.__spzTextStats) return;
  window.__spzTextStats = true;
  var tip = document.createElement('div');
  tip.style.cssText = 'position:absolute;z-index:2147483647;display:none;background:rgba(25,25,35,.95);color:#fff;padding:6px 11px;border-radius:8px;font:12px sans-serif;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,.35);white-space:nowrap;';
  function hide() { tip.style.display = 'none'; }
  document.addEventListener('mouseup', function(e) {
    setTimeout(function() {
      var sel = window.getSelection ? String(window.getSelection()) : '';
      sel = sel.trim();
      if (!sel) { hide(); return; }
      var words = sel.split(/\s+/).filter(Boolean).length;
      tip.textContent = sel.length + ' симв · ' + words + ' слов';
      tip.style.left = Math.max(8, e.pageX - 20) + 'px';
      tip.style.top = (e.pageY - 36) + 'px';
      tip.style.display = 'block';
      clearTimeout(tip.__t);
      tip.__t = setTimeout(hide, 2500);
    }, 10);
  });
  function boot() { document.body.appendChild(tip); }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
"""
make_skit("selection-stats.skit", skit_meta(
    "Selection Stats", "Выдели текст — подсказка покажет, сколько в нём символов и слов. Удобно при написании текстов и постов."), text_stats_js)

# 14. Wikipedia Wide — широкая Википедия
wiki_wide_js = r"""
(function(){
  if (window.__spzWikiWide) return;
  window.__spzWikiWide = true;
  var st = document.createElement('style');
  st.textContent =
    '#siteNotice, .siteNotice, #centralNotice, .mw-parser-output .thumb.tright + .mw-empty-elt { display:none !important; }' +
    '#content, .mw-body, body.skin-vector-2022 .vector-body, body.skin-vector .mw-body { max-width: min(1600px, 95vw) !important; }' +
    '@media (min-width: 1400px) { .mw-parser-output > table.infobox, .mw-parser-output > div.thumb.tright { margin-right: -260px; } }' +
    '.mw-parser-output p, .mw-parser-output ul, .mw-parser-output ol { font-size: 16.5px; line-height: 1.7; }';
  (document.head || document.documentElement).appendChild(st);
  console.log('[Wikipedia Wide] active');
})();
"""
make_skit("wikipedia-wide.skit", skit_meta(
    "Wikipedia Wide", "Расширяет контент Википедии на всю ширину экрана, скрывает баннеры-сборы пожертвований и слегка увеличивает текст статей.",
    match="*://*.wikipedia.org/*", run_at="document-end"), wiki_wide_js)

print("\nDone! Themes -> %s, scripts -> %s" % (THEMES_DIR, SCRIPTS_DIR))
