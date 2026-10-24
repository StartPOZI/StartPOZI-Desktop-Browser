(function() {
  var api = window.electronAPI || {};
  var qs = new URLSearchParams(location.search);
  var type = qs.get('type') || '';
  var src = qs.get('src') || '';

  document.getElementById('vPath').textContent = src;
  document.getElementById('vPath').title = src;
  var badge = document.getElementById('vBadge');
  badge.textContent = type.toUpperCase();

  function fail(msg) {
    document.getElementById('vMain').innerHTML = '<div id="vError">' + msg + '</div>';
  }
  function fmtSize(n) {
    if (n > 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n > 1024) return (n / 1024).toFixed(1) + ' KB';
    return n + ' B';
  }

  if (!api.viewerReadFile) { fail('Viewer API unavailable'); return; }

  // ---------- JSON ----------
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function jvNode(key, val, depth) {
    var k = key !== null ? '<span class="jv-key">' + esc(JSON.stringify(key)) + '</span>: ' : '';
    if (val === null) return '<div class="jv"><span class="jv-t"></span>' + k + '<span class="jv-null">null</span></div>';
    if (typeof val === 'string') return '<div class="jv"><span class="jv-t">' + esc(val) + '</span>' + k + '<span class="jv-str">' + esc(JSON.stringify(val)) + '</span></div>';
    if (typeof val === 'number') return '<div class="jv"><span class="jv-t">' + esc(String(val)) + '</span>' + k + '<span class="jv-num">' + val + '</span></div>';
    if (typeof val === 'boolean') return '<div class="jv"><span class="jv-t">' + esc(String(val)) + '</span>' + k + '<span class="jv-bool">' + val + '</span></div>';
    var isArr = Array.isArray(val);
    var count = isArr ? val.length : Object.keys(val).length;
    var inner = '';
    if (isArr) {
      for (var i = 0; i < val.length; i++) inner += jvNode(i, val[i], depth + 1);
    } else {
      var ks = Object.keys(val);
      for (var j = 0; j < ks.length; j++) inner += jvNode(ks[j], val[ks[j]], depth + 1);
    }
    return '<details open class="jv-o"' + (depth > 7 ? ' data-deep' : '') + '><summary>' + k +
      (isArr ? '[]' : '{}') + '<span class="jv-count">' + count + '</span></summary>' + inner + '</details>';
  }
  function renderJson(text, size) {
    var main = document.getElementById('vMain');
    var data;
    try { data = JSON.parse(text); }
    catch (e) {
      // Broken JSON → show as plain text with error note.
      main.innerHTML = '<pre style="padding:16px;font:12.5px/1.6 monospace;color:' +
        'var(--err);">' + esc(e.message) + '</pre><pre id="plainPre" style="padding:0 16px 24px;font:12.5px/1.6 monospace;white-space:pre-wrap;">' + esc(text.slice(0, 500000)) + '</pre>';
      return;
    }
    document.getElementById('vMeta').textContent = fmtSize(size) + ' · valid JSON';
    main.innerHTML = '<div class="json-tree" id="jsonTree">' + jvNode(null, data, 0) + '</div>';
    var search = document.getElementById('vSearch');
    search.style.display = '';
    search.addEventListener('input', function() {
      var q = search.value.trim().toLowerCase();
      var tree = document.getElementById('jsonTree');
      var nodes = tree.querySelectorAll('.jv');
      nodes.forEach(function(n) { n.classList.remove('jv-hidden'); });
      tree.querySelectorAll('.jv-o').forEach(function(d) { d.classList.remove('jv-hidden'); d.open = true; });
      if (!q) return;
      var any = false;
      nodes.forEach(function(n) {
        var t = n.getAttribute('data-match') || n.textContent;
        n.setAttribute('data-match', t);
        if (t.toLowerCase().indexOf(q) === -1) n.classList.add('jv-hidden'); else any = true;
      });
      tree.querySelectorAll('.jv-o').forEach(function(d) {
        var hasVis = d.querySelector(':scope > .jv:not(.jv-hidden), :scope > details:not(.jv-hidden)');
        if (!hasVis) d.classList.add('jv-hidden');
      });
    });
    var copyBtn = document.getElementById('vCopy');
    copyBtn.style.display = '';
    copyBtn.addEventListener('click', function() {
      navigator.clipboard.writeText(text).catch(function() {});
      copyBtn.textContent = 'Copied';
      setTimeout(function() { copyBtn.textContent = 'Copy'; }, 1200);
    });
  }

  // ---------- Markdown ----------
  function mdToHtml(md) {
    var out = [];
    var lines = md.replace(/\r\n?/g, '\n').split('\n');
    var inCode = false, codeBuf = [], listMode = null, paraBuf = [];
    function inline(s) {
      s = esc(s);
      s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
      s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, function(m, alt, url) {
        if (/^https?:\/\//i.test(url)) return '<img alt="' + alt + '" src="' + esc(url) + '">';
        return '<em>[image: ' + alt + ']</em>';
      });
      s = s.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, function(m, txt, url) {
        if (/^https?:\/\//i.test(url)) return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + txt + '</a>';
        return txt;
      });
      s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<b><i>$1</i></b>');
      s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
      s = s.replace(/\*([^*]+)\*/g, '<i>$1</i>');
      s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
      return s;
    }
    function flushPara() {
      if (paraBuf.length) { out.push('<p>' + paraBuf.map(inline).join('<br>') + '</p>'); paraBuf = []; }
    }
    function closeList() { if (listMode) { out.push(listMode === 'ul' ? '</ul>' : '</ol>'); listMode = null; } }
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i];
      if (/^```/.test(L)) {
        if (inCode) { out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>'); codeBuf = []; inCode = false; }
        else { flushPara(); closeList(); inCode = true; }
        continue;
      }
      if (inCode) { codeBuf.push(L); continue; }
      var h = L.match(/^(#{1,6})\s+(.*)$/);
      if (h) { flushPara(); closeList(); out.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>'); continue; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(L)) { flushPara(); closeList(); out.push('<hr>'); continue; }
      var q = L.match(/^>\s?(.*)$/);
      if (q) { flushPara(); closeList(); out.push('<blockquote>' + inline(q[1]) + '</blockquote>'); continue; }
      var ul = L.match(/^\s*[-*+]\s+(.*)$/);
      var ol = L.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        flushPara();
        var mode = ul ? 'ul' : 'ol';
        if (listMode !== mode) { closeList(); out.push('<' + mode + '>'); listMode = mode; }
        var item = (ul ? ul[1] : ol[1]);
        var task = item.match(/^\[([ xX])\]\s+(.*)$/);
        if (task) item = (task[1] === ' ' ? '☐ ' : '☑ ') + task[2];
        out.push('<li>' + inline(item) + '</li>');
        continue;
      }
      if (!L.trim()) { flushPara(); closeList(); continue; }
      paraBuf.push(L);
    }
    if (inCode && codeBuf.length) out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>');
    flushPara(); closeList();
    return out.join('\n');
  }
  function renderMd(text, size) {
    document.getElementById('vMeta').textContent = fmtSize(size);
    document.getElementById('vMain').innerHTML = '<div class="md-body">' + mdToHtml(text) + '</div>';
  }

  // ---------- Image ----------
  function renderImage(b64) {
    document.getElementById('vMeta').textContent = 'loading…';
    var main = document.getElementById('vMain');
    // Sniff the real format from the base64 magic bytes instead of always
    // declaring image/png (used to lie for jpg/gif/webp — Chromium sniffed
    // it anyway, but the markup was invalid and fragile).
    var mime = 'image/png';
    try {
      var head = atob(b64.slice(0, 24));
      if (head.charCodeAt(0) === 0xFF && head.charCodeAt(1) === 0xD8) mime = 'image/jpeg';
      else if (head.slice(0, 3) === 'GIF') mime = 'image/gif';
      else if (head.slice(0, 8) === '\x89PNG\r\n\x1a\n') mime = 'image/png';
      else if (head.slice(0, 4) === 'RIFF' && head.slice(8, 12) === 'WEBP') mime = 'image/webp';
      else if (head.slice(0, 2) === 'BM') mime = 'image/bmp';
      else if (head.slice(0, 4) === '<svg' || head.slice(0, 5) === '<?xml') mime = 'image/svg+xml';
    } catch (e) {}
    main.innerHTML = '<div class="img-stage" id="imgStage"><img id="imgEl" src="data:' + mime + ';base64,' + b64 + '"></div>';
    var img = document.getElementById('imgEl');
    var stage = document.getElementById('imgStage');
    var zoom = 1, rot = 0, fit = true;
    function apply() {
      if (fit) {
        var sw = stage.clientWidth - 40, sh = stage.clientHeight - 40;
        var iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
        zoom = Math.min(sw / iw, sh / ih, 1);
      }
      img.style.transform = 'scale(' + zoom + ') rotate(' + rot + 'deg)';
      document.getElementById('vMeta').textContent =
        (img.naturalWidth || '?') + '×' + (img.naturalHeight || '?') + ' · ' +
        Math.round(zoom * 100) + '%' + (rot ? ' · ' + rot + '°' : '');
    }
    img.addEventListener('load', apply);
    window.addEventListener('resize', apply);
    var ids = ['vFit', 'v100', 'vZoomIn', 'vZoomOut', 'vRotate', 'vCopy'];
    ids.forEach(function(id) { document.getElementById(id).style.display = ''; });
    document.getElementById('vFit').classList.add('active');
    document.getElementById('vFit').addEventListener('click', function() { fit = true; apply(); this.classList.add('active'); });
    document.getElementById('v100').addEventListener('click', function() { fit = false; zoom = 1; apply(); document.getElementById('vFit').classList.remove('active'); });
    document.getElementById('vZoomIn').addEventListener('click', function() { fit = false; zoom = Math.min(20, zoom * 1.25); apply(); document.getElementById('vFit').classList.remove('active'); });
    document.getElementById('vZoomOut').addEventListener('click', function() { fit = false; zoom = Math.max(0.02, zoom / 1.25); apply(); document.getElementById('vFit').classList.remove('active'); });
    document.getElementById('vRotate').addEventListener('click', function() { rot = (rot + 90) % 360; apply(); });
    document.getElementById('vCopy').addEventListener('click', function() {
      var c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      var b = c.toDataURL('image/png').replace(/^data:image\/png;base64,/, '');
      if (api.copyScreenshot) api.copyScreenshot(b);
      var btn = this; btn.textContent = 'Copied'; setTimeout(function() { btn.textContent = 'Copy'; }, 1200);
    });
  }

  // ---------- Font ----------
  function renderFont(b64, size) {
    var fname = (src.split('/').pop() || 'font').replace(/\.[a-z0-9]+$/i, '');
    var st = document.createElement('style');
    st.textContent = '@font-face { font-family: "PreviewFont"; src: url(data:font/woff2;base64,' + b64 + ') format("woff2"), url(data:font/ttf;base64,' + b64 + ') format("truetype"), url(data:font/otf;base64,' + b64 + ') format("opentype"); }';
    document.head.appendChild(st);
    document.getElementById('vMeta').textContent = fmtSize(size);
    var main = document.getElementById('vMain');
    var samples = [
      { s: 40, t: 'The quick brown fox jumps over the lazy dog' },
      { s: 28, t: 'Съешь же ещё этих мягких французских булок, да выпей чаю' },
      { s: 20, t: '0123456789 ±×÷ == != -> => #{ } () [] <> &@%$*^~|\\/" \'' },
      { s: 16, t: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' },
      { s: 14, t: 'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя' }
    ];
    var html = '<div class="font-body" style="font-family:\'PreviewFont\',sans-serif;">';
    samples.forEach(function(sm) { html += '<div class="font-sample-line" style="font-size:' + sm.s + 'px">' + esc(sm.t) + '</div>'; });
    html += '<div class="font-alpha">!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~</div>';
    html += '<div class="font-info">Family: PreviewFont (' + esc(fname) + ') · ' + fmtSize(size) + '</div>';
    html += '</div>';
    main.innerHTML = html;
  }

  // ---------- Load ----------
  if (!src) { fail('No file specified'); return; }
  api.viewerReadFile(src, type === 'image' || type === 'font' ? 'base64' : 'utf8').then(function(r) {
    if (!r || !r.ok) { fail('Cannot read file' + (r && r.error ? ': ' + esc(r.error) : '')); return; }
    if (type === 'json') renderJson(r.data, r.size);
    else if (type === 'md') renderMd(r.data, r.size);
    else if (type === 'image') renderImage(r.data);
    else if (type === 'font') renderFont(r.data, r.size);
    else fail('Unknown viewer type');
  }).catch(function(e) { fail('Read failed: ' + esc(String(e && e.message || e))); });
})();
