(function () {
  'use strict';
  var api = window.electronAPI || {};
  var $ = function (s) { return document.querySelector(s); };

  // DOM handles used by regenerate() — must exist BEFORE the first control
  // is built (the color rows regenerate() on creation). Previously these
  // were declared further down and the whole editor crashed at startup,
  // leaving nothing but the raw CSS box.
  var cssCode = $('#cssCode');
  var previewStyle = document.createElement('style');
  document.head.appendChild(previewStyle);

  // ============ Variable registry ============
  var VARS = [
    ['--primary-color', '#1da1f2', 'Primary / accent'],
    ['--bg-color', '#202020', 'Background'],
    ['--bg-secondary', '#2d2d2d', 'Secondary background'],
    ['--bg-hover', '#3d3d3d', 'Hover background'],
    ['--toolbar-bg', '#262626', 'Toolbar background'],
    ['--text-primary', '#ffffff', 'Text'],
    ['--text-secondary', '#aaaaaa', 'Secondary text'],
    ['--border-color', '#3d3d3d', 'Borders'],
    ['--overlay-bg', 'rgba(28,28,38,0.92)', 'Panels / overlays'],
    ['--hover-bg', 'rgba(255,255,255,0.08)', 'Hover highlight']
  ];
  var state = { colors: {}, opacity: 1, radius: 11, font: '', icons: {} };
  VARS.forEach(function (v) { state.colors[v[0]] = v[1]; });

  var ICON_SLOTS = ['back','forward','reload','home','library','downloads','autofill','adblock','scripts',
    'darkMode','media','equalizer','qrScan','split','newTab','bookmarks','history','reader','tts','screenshot',
    'incognito','translate','findAll','autoscroll','breakLoupe','settings','workspace','hamburger'];

  // ============ Status ============
  var statusEl = $('#status'), statusTimer;
  function status(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = cls || '';
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { statusEl.textContent = ''; }, 4000);
  }

  // ============ Color rows ============
  var colorRows = $('#colorRows');
  VARS.forEach(function (v) {
    var row = document.createElement('div');
    row.className = 'crow';
    var lab = document.createElement('label'); lab.textContent = v[2]; lab.title = v[0];
    var col = document.createElement('input'); col.type = 'color';
    var txt = document.createElement('input'); txt.type = 'text';
    function setColor(val, skipTxt) {
      state.colors[v[0]] = val;
      if (/^#[0-9a-f]{6}$/i.test(val)) col.value = val;
      if (!skipTxt) txt.value = val;
      regenerate();
    }
    col.addEventListener('input', function () { setColor(col.value); });
    txt.addEventListener('change', function () { setColor(txt.value, true); });
    setColor(v[1]);
    row.appendChild(lab); row.appendChild(col); row.appendChild(txt);
    colorRows.appendChild(row);
  });

  // Sliders
  function bindRange(id, valId, fn, fmt) {
    var el = $(id), ve = $(valId);
    el.addEventListener('input', function () { fn(parseInt(el.value, 10)); ve.textContent = fmt(el.value); regenerate(); });
  }
  bindRange('#vOpacity', '#vOpacityVal', function (v) { state.opacity = v / 100; }, function (v) { return v + '%'; });
  bindRange('#vRadius', '#vRadiusVal', function (v) { state.radius = v; }, function (v) { return v; });
  var fontSel = $('#vFont');
  if (fontSel) fontSel.addEventListener('change', function () { state.font = fontSel.value; regenerate(); });

  // ============ Presets ============
  var PRESETS = {
    'dark-stock': { '--primary-color': '#1da1f2', '--bg-color': '#202020', '--bg-secondary': '#2d2d2d', '--bg-hover': '#3d3d3d', '--text-primary': '#ffffff', '--text-secondary': '#aaaaaa', '--border-color': '#3d3d3d' },
    'light-stock': { '--primary-color': '#0a84ff', '--bg-color': '#f5f5f7', '--bg-secondary': '#ffffff', '--bg-hover': '#e2e2e8', '--text-primary': '#1d1d1f', '--text-secondary': '#6e6e73', '--border-color': '#d1d1d6' },
    'midnight': { '--primary-color': '#5b8cff', '--bg-color': '#0d1220', '--bg-secondary': '#141b2e', '--bg-hover': '#1d2740', '--text-primary': '#e6ecff', '--text-secondary': '#8b97b8', '--border-color': '#223052' },
    'forest': { '--primary-color': '#3fbf6f', '--bg-color': '#101a13', '--bg-secondary': '#182619', '--bg-hover': '#223625', '--text-primary': '#e8f5ea', '--text-secondary': '#93b39a', '--border-color': '#26402a' },
    'candy': { '--primary-color': '#ff5f8f', '--bg-color': '#1c1017', '--bg-secondary': '#2a1822', '--bg-hover': '#3a2130', '--text-primary': '#ffeef5', '--text-secondary': '#c49aad', '--border-color': '#432838' }
  };
  document.querySelectorAll('[data-preset]').forEach(function (b) {
    b.addEventListener('click', function () {
      var p = PRESETS[b.getAttribute('data-preset')];
      Object.keys(p).forEach(function (k) { state.colors[k] = p[k]; });
      rebuildColorInputs();
      regenerate();
      status('Preset applied: ' + b.textContent);
    });
  });

  function rebuildColorInputs() {
    var rows = colorRows.querySelectorAll('.crow');
    VARS.forEach(function (v, i) {
      var row = rows[i]; if (!row) return;
      var val = state.colors[v[0]];
      row.querySelector('input[type=text]').value = val;
      if (/^#[0-9a-f]{6}$/i.test(val)) row.querySelector('input[type=color]').value = val;
    });
  }

  // ============ Icon slots ============
  var filePick = $('#filePick');
  var pendingSlot = null;
  function buildIconGrid() {
    var grid = $('#iconGrid');
    grid.innerHTML = '';
    ICON_SLOTS.forEach(function (slot) {
      var d = document.createElement('div');
      d.className = 'slot' + (state.icons[slot] ? ' has' : '');
      var ic = document.createElement('div'); ic.className = 'ic';
      if (state.icons[slot]) {
        var img = document.createElement('img');
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(state.icons[slot])));
        ic.appendChild(img);
      } else {
        ic.textContent = '＋'; ic.style.color = '#3a4150'; ic.style.fontSize = '15px';
      }
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = slot;
      d.appendChild(ic); d.appendChild(nm);
      if (state.icons[slot]) {
        var del = document.createElement('div'); del.className = 'del'; del.textContent = '✕';
        del.addEventListener('click', function (e) {
          e.stopPropagation();
          delete state.icons[slot];
          buildIconGrid(); regenerate();
        });
        d.appendChild(del);
      }
      d.addEventListener('click', function () {
        pendingSlot = slot;
        filePick.value = '';
        filePick.click();
      });
      grid.appendChild(d);
    });
    $('#iconCount').textContent = Object.keys(state.icons).length;
  }
  filePick.addEventListener('change', function () {
    var f = filePick.files && filePick.files[0];
    if (!f || !pendingSlot) return;
    if (f.size > 65536) { status('SVG too large (max 64 KB)', 'err'); return; }
    var r = new FileReader();
    r.onload = function () {
      var text = String(r.result || '');
      if (!/^(<\?xml|<svg)|^[\s\r\n]*<svg/i.test(text)) { status('Not an SVG file', 'err'); return; }
      if (/<script|javascript:|\son[a-z]+\s*=/i.test(text)) { status('SVG contains scripts — rejected', 'err'); return; }
      state.icons[pendingSlot] = text;
      buildIconGrid(); regenerate();
      status('Icon set: ' + pendingSlot);
    };
    r.readAsText(f);
  });

  // ============ CSS generation ============
  function hexToRgb(hex) {
    var m = hex.replace('#', '');
    if (m.length === 3) m = m[0] + m[0] + m[1] + m[1] + m[2] + m[2];
    var n = parseInt(m, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function regenerate() {
    var c = state.colors;
    var bg = hexToRgb(/^#/.test(c['--bg-color']) ? c['--bg-color'] : '#202020');
    var bg2 = hexToRgb(/^#/.test(c['--bg-secondary']) ? c['--bg-secondary'] : '#2d2d2d');
    var css =
      ':root {\n' +
      '  --primary-color: ' + c['--primary-color'] + ';\n' +
      '  --bg-color: ' + c['--bg-color'] + ';\n' +
      '  --bg-secondary: ' + c['--bg-secondary'] + ';\n' +
      '  --bg-hover: ' + c['--bg-hover'] + ';\n' +
      '  --text-primary: ' + c['--text-primary'] + ';\n' +
      '  --text-secondary: ' + c['--text-secondary'] + ';\n' +
      '  --border-color: ' + c['--border-color'] + ';\n' +
      '  --hover-bg: ' + c['--hover-bg'] + ';\n' +
      '  --overlay-bg: ' + c['--overlay-bg'] + ';\n' +
      '  --win-opacity: ' + state.opacity + ';\n' +
      '  --bg-color-alpha: rgba(' + bg.join(', ') + ', var(--win-opacity));\n' +
      '  --bg-secondary-alpha: rgba(' + bg2.join(', ') + ', var(--win-opacity));\n' +
      '  --text-color: var(--text-primary);\n' +
      '  --theme-radius: ' + state.radius + 'px;\n' +
      '}\n' +
      'body.theme-dark, body.theme-light {\n' +
      '  --primary-color: ' + c['--primary-color'] + ';\n' +
      '  --bg-color: ' + c['--bg-color'] + ';\n' +
      '  --bg-secondary: ' + c['--bg-secondary'] + ';\n' +
      '  --bg-hover: ' + c['--bg-hover'] + ';\n' +
      '  --text-primary: ' + c['--text-primary'] + ';\n' +
      '  --text-secondary: ' + c['--text-secondary'] + ';\n' +
      '  --border-color: ' + c['--border-color'] + ';\n' +
      '  --hover-bg: ' + c['--hover-bg'] + ';\n' +
      '  --overlay-bg: ' + c['--overlay-bg'] + ';\n' +
      '  --bg-color-alpha: rgba(' + bg.join(', ') + ', var(--win-opacity));\n' +
      '  --bg-secondary-alpha: rgba(' + bg2.join(', ') + ', var(--win-opacity));\n' +
      '}\n' +
      '/* corner radius hint */\n' +
      '.adblock-panel, .url-suggestions, .ctx-menu { border-radius: var(--theme-radius); }\n' +
      (state.font ? '/* interface font */\nbody, button, input, select { font-family: ' + state.font + '; }\n' : '');

    cssCode.value = css;
    applyPreview(css);
  }

  // Apply to the live preview mock (scoped <style> with the editor's vars).
  function applyPreview(css) {
    // Scope: keep only :root and body.theme-* var declarations for the mock.
    var varsOnly = css.replace(/\/\*[\s\S]*?\*\//g, '');
    previewStyle.textContent = varsOnly;
  }

  // Manual CSS editing — typing pauses regeneration (no clobbering).
  var codeDirty = false;
  cssCode.addEventListener('input', function () {
    codeDirty = true;
    applyPreview(cssCode.value);
    status('Manual edit mode — visual controls paused until «Sync from CSS»', '');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Tab' && document.activeElement === cssCode) {
      e.preventDefault();
      var s = cssCode.selectionStart;
      cssCode.value = cssCode.value.slice(0, s) + '  ' + cssCode.value.slice(cssCode.selectionEnd);
      cssCode.selectionStart = cssCode.selectionEnd = s + 2;
    }
  });

  // Sync visual controls back FROM the edited CSS.
  function syncFromCss() {
    var m, re = /--([a-z0-9-]+)\s*:\s*([^;}]+)/gi;
    var found = {};
    while ((m = re.exec(cssCode.value))) { found['--' + m[1]] = m[2].trim(); }
    VARS.forEach(function (v) {
      if (found[v[0]]) state.colors[v[0]] = found[v[0]];
    });
    if (found['--win-opacity']) state.opacity = parseFloat(found['--win-opacity']) || 1;
    $('#vOpacity').value = Math.round(state.opacity * 100);
    $('#vOpacityVal').textContent = Math.round(state.opacity * 100) + '%';
    rebuildColorInputs();
    codeDirty = false;
    status('Visual controls synced from CSS', 'ok');
  }

  // Tabs
  document.querySelectorAll('.ctab').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('.ctab').forEach(function (x) { x.classList.remove('on'); });
      t.classList.add('on');
      var icons = t.getAttribute('data-tab') === 'icons';
      $('#cssCode').style.display = icons ? 'none' : '';
      $('#iconPanel').style.display = icons ? 'block' : 'none';
    });
  });
  // Second (read-only) icon overview inside the code panel
  function buildIconPanel() {
    var g = $('#iconGrid2'); g.innerHTML = '';
    Object.keys(state.icons).forEach(function (slot) {
      var d = document.createElement('div');
      d.style.cssText = 'border:1px solid #2c313d;border-radius:10px;padding:10px;text-align:center;font-size:11px;color:#8a93a6';
      var img = document.createElement('img');
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(state.icons[slot])));
      img.style.cssText = 'width:22px;height:22px;display:block;margin:0 auto 6px';
      d.appendChild(img);
      d.appendChild(document.createTextNode(slot + '.svg'));
      g.appendChild(d);
    });
    if (!Object.keys(state.icons).length) g.innerHTML = '<div style="color:#8a93a6;font-size:12px">No icons uploaded yet — use the Icons group on the left.</div>';
  }

  // Wrap buildIconGrid to also refresh the panel
  var _bIG = buildIconGrid;
  buildIconGrid = function () { _bIG(); buildIconPanel(); };

  // ============ Actions ============
  $('#btnApplyLive').addEventListener('click', function () {
    var css = cssCode.value;
    if (!css.trim()) { status('CSS is empty', 'err'); return; }
    if (css.includes('javascript:') || css.includes('expression(')) { status('Dangerous CSS rejected', 'err'); return; }
    if (api.applyCustomTheme) {
      api.applyCustomTheme(css).then(function () { status('Applied to the browser — check the chrome!', 'ok'); })
        .catch(function () { status('Failed to apply', 'err'); });
    } else status('API unavailable', 'err');
  });

  $('#btnExport').addEventListener('click', function () {
    var btn = $('#btnExport'); btn.disabled = true;
    var payload = {
      name: $('#mName').value, author: $('#mAuthor').value,
      version: $('#mVersion').value, description: $('#mDesc').value,
      type: $('#mType').value, css: cssCode.value, icons: state.icons
    };
    if (!api.themeEditorExport) { status('Export API unavailable', 'err'); btn.disabled = false; return; }
    api.themeEditorExport(payload).then(function (r) {
      btn.disabled = false;
      if (r && r.success) status('Saved: ' + r.path + (r.themeId ? ' (added to Settings)' : ''), 'ok');
      else status((r && r.error) || 'Export failed', 'err');
    }).catch(function (e) { btn.disabled = false; status('Export failed: ' + e.message, 'err'); });
  });

  // Load an installed theme into the editor
  $('#btnLoad').addEventListener('click', function () {
    if (!api.themeList || !api.themeGetCss) { status('API unavailable', 'err'); return; }
    api.themeList().then(function (r) {
      var themes = (r && r.themes) || [];
      if (!themes.length) { status('No installed themes', 'err'); return; }
      // Simple picker
      var list = $('#presetList');
      list.innerHTML = '';
      list.style.display = 'flex';
      themes.forEach(function (t) {
        var b = document.createElement('button');
        b.className = 'tbtn'; b.style.textAlign = 'left';
        b.textContent = t.name + (t.author ? ' · ' + t.author : '');
        b.addEventListener('click', function () {
          list.style.display = 'none';
          api.themeGetCss(t.id).then(function (css) {
            cssCode.value = css || '';
            applyPreview(css || '');
            $('#mName').value = t.name; $('#mAuthor').value = t.author || '';
            $('#mVersion').value = t.version || '1.0'; $('#mDesc').value = t.description || '';
            if (t.type) $('#mType').value = t.type;
            syncFromCss();
            status('Loaded: ' + t.name, 'ok');
          });
        });
        list.appendChild(b);
      });
      status('Pick a theme below (Presets group)');
    });
  });

  // «Sync from CSS» mini-action in the Colors header
  var syncBtn = document.createElement('span');
  syncBtn.className = 'mini'; syncBtn.textContent = 'sync from CSS';
  syncBtn.addEventListener('click', syncFromCss);
  document.querySelector('.grp .ghead').appendChild(syncBtn);

  // Init
  buildIconGrid();
  regenerate();
})();
