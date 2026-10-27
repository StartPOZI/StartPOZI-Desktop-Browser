var ALL_BUTTONS = {
  left: {
    label: 'Navigation',
    buttons: {
      library: { name: 'Library', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' },
      home: { name: 'Home', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
      back: { name: 'Back', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>' },
      forward: { name: 'Forward', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>' },
      reload: { name: 'Reload', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>' }
    }
  },
  right: {
    label: 'Actions',
    buttons: {
      downloads: { name: 'Downloads', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' },
      autofill: { name: 'Passwords', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>' },
      adblock: { name: 'Ad blocker', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' },
      scripts: { name: 'Scripts', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/></svg>' },
      darkMode: { name: 'Dark mode', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' },
      media: { name: 'Media', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>' },
      tts: { name: 'Read aloud', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>' },
      equalizer: { name: 'Equalizer', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="20" cy="14" r="2"/></svg>' },
      qrScan: { name: 'QR scanner', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/></svg>' },
      split: { name: 'Split screen', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>' },
      settings: { name: 'Settings', svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' }
    }
  }
};

var DEFAULT_TOOLBAR = ['library','home','back','forward','reload','downloads','autofill','adblock','scripts'];
var currentButtons = [];

function getAllButtonIds() {
  var ids = [];
  Object.keys(ALL_BUTTONS).forEach(function(sec) {
    Object.keys(ALL_BUTTONS[sec].buttons).forEach(function(id) { ids.push(id); });
  });
  return ids;
}

function getBtnConfig(id) {
  var keys = Object.keys(ALL_BUTTONS);
  for (var i = 0; i < keys.length; i++) {
    if (ALL_BUTTONS[keys[i]].buttons[id]) return ALL_BUTTONS[keys[i]].buttons[id];
  }
  return null;
}

function showToast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + (type || 'success') + ' show';
  setTimeout(function() { t.classList.remove('show'); }, 2500);
}

function createBtnEl(id, zone) {
  var cfg = getBtnConfig(id);
  if (!cfg) return null;
  var el = document.createElement('div');
  el.className = 'tb-btn ' + (zone === 'toolbar' ? 'on-toolbar' : 'in-pool');
  el.dataset.buttonId = id;
  el.dataset.zone = zone;
  el.draggable = true;
  el.innerHTML = (cfg.svg || '') + '<span class="btn-label">' + cfg.name + '</span>';

  el.addEventListener('dragstart', function(e) {
    e.dataTransfer.setData('text/plain', JSON.stringify({id: id, zone: zone}));
    e.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', function() {
    el.classList.remove('dragging');
    document.querySelectorAll('.toolbar-zone,.pool-zone').forEach(function(z) { z.classList.remove('drag-over'); });
  });
  el.addEventListener('dblclick', function() {
    if (zone === 'toolbar') moveToPool(id);
    else moveToToolbar(id);
  });
  return el;
}

function render() {
  var tz = document.getElementById('toolbarZone');
  var pz = document.getElementById('poolZone');
  tz.innerHTML = '';
  pz.innerHTML = '';

  currentButtons.forEach(function(id) {
    var el = createBtnEl(id, 'toolbar');
    if (el) tz.appendChild(el);
  });

  getAllButtonIds().forEach(function(id) {
    if (currentButtons.indexOf(id) === -1) {
      var el = createBtnEl(id, 'pool');
      if (el) pz.appendChild(el);
    }
  });

  tz.classList.toggle('empty-hint', currentButtons.length === 0);
  pz.classList.toggle('empty-hint', getAllButtonIds().length === currentButtons.length);
}

function moveToToolbar(id) {
  if (currentButtons.indexOf(id) !== -1) return;
  currentButtons.push(id);
  render();
}

function moveToPool(id) {
  currentButtons = currentButtons.filter(function(b) { return b !== id; });
  render();
}

function insertAt(id, targetId) {
  currentButtons = currentButtons.filter(function(b) { return b !== id; });
  var idx = currentButtons.indexOf(targetId);
  if (idx === -1) currentButtons.push(id);
  else currentButtons.splice(idx, 0, id);
  render();
}

function setupDropZone(el, zoneName) {
  el.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    el.classList.add('drag-over');
  });
  el.addEventListener('dragleave', function(e) {
    if (!el.contains(e.relatedTarget)) el.classList.remove('drag-over');
  });
  el.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove('drag-over');
    try {
      var data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (zoneName === 'toolbar') {
        var target = e.target.closest('.tb-btn');
        if (target && target.dataset.zone === 'toolbar' && data.id !== target.dataset.buttonId) {
          insertAt(data.id, target.dataset.buttonId);
        } else if (data.zone !== 'toolbar') {
          moveToToolbar(data.id);
        }
      } else {
        if (data.zone === zoneName) return;
        moveToPool(data.id);
      }
    } catch(err) {}
  });
}

setupDropZone(document.getElementById('toolbarZone'), 'toolbar');
setupDropZone(document.getElementById('poolZone'), 'pool');

document.getElementById('saveBtn').addEventListener('click', function() {
  if (window.electronAPI && window.electronAPI.saveToolbarButtons) {
    window.electronAPI.saveToolbarButtons(currentButtons).then(function(result) {
      if (result && result.success) {
        showToast('Buttons saved!', 'success');
        setTimeout(function() {
          if (window.electronAPI && window.electronAPI.goBack) window.electronAPI.goBack();
        }, 800);
      } else {
        showToast('Save error', 'error');
      }
    }).catch(function() { showToast('Save error', 'error'); });
  } else {
    localStorage.setItem('startpozi-toolbar-buttons', JSON.stringify(currentButtons));
    showToast('Buttons saved!', 'success');
  }
});

document.getElementById('resetBtn').addEventListener('click', function() {
  currentButtons = DEFAULT_TOOLBAR.slice();
  render();
  showToast('Reset to defaults', 'success');
});

(function init() {
  var saved = localStorage.getItem('startpozi-toolbar-buttons');
  if (saved) {
    try { currentButtons = JSON.parse(saved); } catch(e) { currentButtons = DEFAULT_TOOLBAR.slice(); }
  } else {
    currentButtons = DEFAULT_TOOLBAR.slice();
  }
  if (window.electronAPI && window.electronAPI.getToolbarButtons) {
    window.electronAPI.getToolbarButtons().then(function(result) {
      if (result && result.success && result.buttons) currentButtons = result.buttons;
      render();
    }).catch(function() { render(); });
  } else {
    render();
  }
})();
