(function() {
  var api = window.electronAPI || {};
  var SORT = { key: 'memoryKB', dir: -1 };
  var lastData = null;

  function _t(s) {
    if (window.i18n && window.i18n.t) return window.i18n.t(s);
    return s;
  }

  // Theme
  if (api.getTheme) {
    api.getTheme().then(function(t) {
      document.body.className = 'theme-' + (t === 'light' ? 'light' : 'dark');
    });
  }
  if (api.onThemeUpdated) {
    api.onThemeUpdated(function(t) {
      document.body.className = 'theme-' + (t === 'light' ? 'light' : 'dark');
    });
  }

  // ===== Background from customization settings (as in Library.html) =====
  function applyWallpaper(cust) {
    if (!cust || !cust.mainPageBackground) return;
    document.documentElement.style.setProperty('--custom-bg', cust.mainPageBackground);
    if (cust.mainPageBackgroundSize) document.documentElement.style.setProperty('--custom-bg-size', cust.mainPageBackgroundSize);
    if (cust.mainPageBackgroundPosition) document.documentElement.style.setProperty('--custom-bg-pos', cust.mainPageBackgroundPosition);
    if (cust.mainPageBackgroundRepeat) document.documentElement.style.setProperty('--custom-bg-repeat', cust.mainPageBackgroundRepeat);
    if (cust.mainPageBackgroundAttachment) document.documentElement.style.setProperty('--custom-bg-attach', cust.mainPageBackgroundAttachment);
    document.body.classList.add('custom-bg');
  }
  if (api.getCustomizationSettings) {
    api.getCustomizationSettings().then(function(r) { if (r && r.settings) applyWallpaper(r.settings); });
  }
  if (api.onCustomizationUpdated) {
    api.onCustomizationUpdated(function(settings) {
      // reset the class so the default returns when there is no background
      document.body.classList.remove('custom-bg');
      applyWallpaper(settings);
    });
  }

  function fmtMem(kb) {
    if (kb == null || kb < 0 || isNaN(kb)) return '—';
    if (kb < 1024) return kb + ' KB';
    var mb = kb / 1024;
    if (mb < 1024) return (Math.round(mb * 10) / 10) + ' MB';
    return (Math.round((mb / 1024) * 100) / 100) + ' GB';
  }
  function fmtCpu(c) {
    if (c == null) return '—';
    return (Math.round(c * 10) / 10) + '%';
  }
  function hostnameOf(url) {
    if (!url) return '';
    try { return new URL(url).hostname; } catch(e) { return ''; }
  }
  function memClass(kb, maxKb) {
    if (!maxKb) maxKb = 200 * 1024;
    var pct = Math.min(1, kb / maxKb);
    if (pct > 0.6) return 'hot';
    if (pct > 0.3) return 'warm';
    return '';
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function buildRow(r, maxMem) {
    var tr = el('tr');
    tr.dataset.sort_title = (r.title || r.hostname || '').toLowerCase();
    tr.dataset.sort_hostname = (r.hostname || '').toLowerCase();
    tr.dataset.sort_memoryKB = r.memoryKB || 0;
    tr.dataset.sort_cpu = r.cpu || 0;

    // title cell
    var tdTitle = el('td');
    var tc = el('div', 'title-cell');
    var fav = el('div', 'favicon');
    if (r.kind === 'tab') {
      var favSrc = r.favicon || '';
      // favicon arrives as a URL (http/data/file/blob) or as a css url(...)
      if (favSrc.indexOf('url(') === 0) {
        fav.style.backgroundImage = favSrc;
      } else if (favSrc) {
        fav.style.backgroundImage = 'url("' + favSrc.replace(/"/g, '%22') + '")';
      } else {
        fav.className = 'favicon placeholder';
        var h = r.hostname || '';
        fav.textContent = h ? h.charAt(0).toUpperCase() : '•';
      }
    } else {
      fav.className = 'favicon placeholder';
      fav.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    }
    tc.appendChild(fav);
    var tt = el('div', 'title-text');
    var name = r.title || (r.kind === 'tab' ? _t('Untitled') : (r.title || r.type || _t('Process')));
    tt.appendChild(el('div', 't-name', escapeHtml(name)));
    var sub = '';
    if (r.kind === 'tab') sub = r.url || '';
    else sub = r.type ? ('PID ' + (r.pid || '?') + ' · ' + _t(r.type)) : ('PID ' + (r.pid || '?'));
    tt.appendChild(el('div', 't-url', escapeHtml(sub)));
    tc.appendChild(tt);
    tdTitle.appendChild(tc);
    tr.appendChild(tdTitle);

    // domain
    tr.appendChild(el('td', null, escapeHtml(r.hostname || (r.kind === 'process' ? r.type : '') || '')));

    // status badges
    var tdB = el('td');
    var bd = el('div', 'badges');
    if (r.kind === 'tab') {
      if (r.isActive) bd.appendChild(el('span', 'badge active', _t('active')));
      if (r.isSleeping) bd.appendChild(el('span', 'badge sleep', _t('sleep')));
      if (r.isFrozen) bd.appendChild(el('span', 'badge frozen', _t('frozen')));
      if (r.isWhitelisted) bd.appendChild(el('span', 'badge wl', _t('awake')));
      if (r.isPinned) bd.appendChild(el('span', 'badge pin', _t('pinned')));
    } else {
      bd.appendChild(el('span', 'badge sleep', escapeHtml(_t(r.type || 'process'))));
    }
    tdB.appendChild(bd);
    tr.appendChild(tdB);

    // memory
    var tdM = el('td', 'col-mem');
    var mb = el('div', 'mem-bar');
    var bar = el('div', 'bar ' + memClass(r.memoryKB || 0, maxMem));
    var pct = maxMem ? Math.min(100, Math.round((r.memoryKB / maxMem) * 100)) : 0;
    bar.appendChild(el('span', null)).style.width = pct + '%';
    mb.appendChild(bar);
    mb.appendChild(el('span', null, fmtMem(r.memoryKB)));
    tdM.appendChild(mb);
    tr.appendChild(tdM);

    // cpu
    tr.appendChild(el('td', 'col-cpu', fmtCpu(r.cpu)));

    // actions
    var tdA = el('td', 'col-actions');
    if (r.kind === 'tab') {
      // Labelled buttons (user-requested): Sleep / Hard reload / Close.
      // "Go" stays compact-iconic, the three main actions carry text so the
      // meaning is obvious.
      tdA.appendChild(actBtn(_t('Go'), 'M5 12h14M12 5l7 7-7 7', function(){ send('activate', r.tabId); }));
      if (!r.isSleeping && !r.isActive) {
        tdA.appendChild(actBtn(_t('Sleep'), 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z', function(){ send('sleep', r.tabId); }, false, _t('Усыпить')));
      }
      tdA.appendChild(actBtn(_t('Hard reload'), 'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15', function(){ send('hardreload', r.tabId); }, false, _t('Жёсткая перезагрузка')));
      tdA.appendChild(actBtn(_t('Close'), 'M18 6L6 18M6 6l12 12', function(){ send('close', r.tabId); }, true, _t('Закрыть')));
    } else {
      tdA.appendChild(el('span', 'hint', 'PID ' + (r.pid || '?')));
    }
    tr.appendChild(tdA);
    return tr;
  }

  function actBtn(title, path, onClick, danger, label) {
    var b = el('button', 'act-btn' + (danger ? ' danger' : '') + (label ? ' labeled' : ''));
    b.title = title;
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="' + path + '"/></svg>' + (label ? '<span>' + escapeHtml(label) + '</span>' : '');
    b.addEventListener('click', onClick);
    return b;
  }

  function send(action, tabId) {
    if (api.taskManagerAction) api.taskManagerAction(action, tabId);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  var _lastRenderSig = '';
  function render(data) {
    lastData = data;
    var tabs = data.tabs || [];
    var procs = data.processes || [];

    // Skip render if structure + values are unchanged
    var sig = tabs.length + ':' + procs.length + ':' +
      tabs.map(function(r){ return r.id + r.cpu + r.memoryKB + r.isSleeping + r.isFrozen; }).join('|') + ':' +
      procs.map(function(r){ return r.pid + r.cpu + r.memoryKB; }).join('|');
    if (sig === _lastRenderSig) {
      // Update only the totals
      var totals = data.totals || {};
      document.getElementById('totalMem').textContent = fmtMem(totals.memoryKB || 0);
      document.getElementById('totalCpu').textContent = fmtCpu(totals.cpu);
      return;
    }
    _lastRenderSig = sig;

    var body = document.getElementById('tmBody');
    var empty = document.getElementById('emptyState');
    body.innerHTML = '';

    var tabs = data.tabs || [];
    var procs = data.processes || [];
    if (!tabs.length && !procs.length) {
      empty.style.display = 'block';
      empty.textContent = 'No data';
    } else {
      empty.style.display = 'none';
    }

    // max memory for the scale
    var maxMem = 0;
    tabs.concat(procs).forEach(function(r) { if (r.memoryKB > maxMem) maxMem = r.memoryKB; });
    if (!maxMem) maxMem = 200 * 1024;

    var all = [];
    if (tabs.length) {
      all.push({ __section: _t('Tabs') + ' (' + tabs.length + ')' });
      tabs.forEach(function(r) { all.push(r); });
    }
    if (procs.length) {
      all.push({ __section: _t('Browser processes') + ' (' + procs.length + ')' });
      procs.forEach(function(r) { all.push(r); });
    }

    all.forEach(function(r) {
      if (r.__section) {
        var tr = el('tr');
        var td = el('td', 'section-head', r.__section);
        td.colSpan = 6;
        tr.appendChild(td);
        body.appendChild(tr);
        return;
      }
      body.appendChild(buildRow(r, maxMem));
    });

    // summary
    var totals = data.totals || {};
    document.getElementById('totalMem').textContent = fmtMem(totals.memoryKB || 0);
    document.getElementById('totalCpu').textContent = fmtCpu(totals.cpu);
    document.getElementById('tabCount').textContent = tabs.length;
  }

  function sortRows() {
    if (!lastData) return;
    var key = SORT.key;
    var dir = SORT.dir;
    lastData.tabs.sort(function(a, b) {
      return cmp(get(a, key), get(b, key)) * dir;
    });
    lastData.processes.sort(function(a, b) {
      return cmp(get(a, key), get(b, key)) * dir;
    });
    render(lastData);
  }
  function get(r, key) {
    if (key === 'title') return (r.title || r.hostname || '').toLowerCase();
    if (key === 'hostname') return (r.hostname || '').toLowerCase();
    return r[key] || 0;
  }
  function cmp(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  }

  // sort headers
  document.querySelectorAll('thead th[data-sort]').forEach(function(th) {
    th.addEventListener('click', function() {
      var key = th.dataset.sort;
      if (SORT.key === key) SORT.dir = -SORT.dir;
      else { SORT.key = key; SORT.dir = (key === 'memoryKB' || key === 'cpu') ? -1 : 1; }
      document.querySelectorAll('thead th').forEach(function(t) {
        t.classList.remove('sorted');
        var s = t.querySelector('.sort'); if (s) s.textContent = '';
      });
      th.classList.add('sorted');
      var s = th.querySelector('.sort'); if (s) s.textContent = SORT.dir < 0 ? '▼' : '▲';
      sortRows();
    });
  });

  // sleep-all
  var saBtn = document.getElementById('sleepAllBtn');
  if (saBtn) {
    saBtn.addEventListener('click', function() {
      if (!lastData) return;
      (lastData.tabs || []).forEach(function(r) {
        if (!r.isActive && !r.isSleeping && !r.isWhitelisted && r.tabId) {
          send('sleep', r.tabId);
        }
      });
    });
  }

  // poll
  var _refreshSeq = 0;
  function refresh() {
    if (!api.getTaskManagerData) return;
    _refreshSeq++;
    var mySeq = _refreshSeq;
    api.getTaskManagerData().then(function(data) {
      if (mySeq !== _refreshSeq) return;
      if (data) {
        // keep sorting on update
        var key = SORT.key, dir = SORT.dir;
        if (data.tabs) data.tabs.sort(function(a, b) { return cmp(get(a, key), get(b, key)) * dir; });
        if (data.processes) data.processes.sort(function(a, b) { return cmp(get(a, key), get(b, key)) * dir; });
        render(data);
      }
    });
  }
  refresh();
  setInterval(refresh, 3000);
})();
