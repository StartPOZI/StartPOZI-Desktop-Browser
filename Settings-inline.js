const api = window.electronAPI;

// API availability check
console.log('🔍 Checking electronAPI:', api);
console.log('🔍 Method saveToolbarButtons exists?', typeof api?.saveToolbarButtons);
console.log('🔍 Method getToolbarButtons exists?', typeof api?.getToolbarButtons);
console.log('🔍 Method restartBrowser exists?', typeof api?.restartBrowser);

if (!api) {
    console.error('electronAPI is not available!');
    alert('Error: API not loaded. Restart the application.');
} else if (!api.saveToolbarButtons) {
    console.error('Method saveToolbarButtons does not exist!');
    alert('Error: Method saveToolbarButtons not found. Restart the application.');
} else {
    console.log('electronAPI and all methods are available');
}

// Function to show toast notifications
if (typeof showToast !== 'function') {
    window.showToast = function(message, type = 'info', duration = 3000) {
        const toast = document.getElementById('toast');
        if (!toast) {
            customAlert(message);
            return;
        }
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        setTimeout(() => toast.classList.remove('show'), duration);
    };
}

// Custom confirm dialog (replaces window.confirm which doesn't work in webview)
window.customConfirm = function(message, opts) {
    opts = opts || {};
    return new Promise(function(resolve) {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);animation:welcomeFade 0.2s ease;';

        var dialog = document.createElement('div');
        dialog.style.cssText = 'background:var(--overlay-bg,var(--card-bg));border:1px solid var(--card-border,var(--border-color));border-radius:14px;padding:28px 32px;max-width:440px;box-shadow:0 16px 48px rgba(0,0,0,0.4);text-align:center;';

        var msgEl = document.createElement('div');
        msgEl.style.cssText = 'color:var(--text-color,#fff);font-size:14px;line-height:1.5;margin-bottom:24px;white-space:pre-wrap;word-break:break-word;';
        msgEl.textContent = message;
        dialog.appendChild(msgEl);

        var btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;';

        var cancelBtn = document.createElement('button');
        cancelBtn.textContent = opts.cancelText || 'Cancel';
        cancelBtn.style.cssText = 'padding:8px 20px;border-radius:8px;border:var(--btn-border,1px solid rgba(255,255,255,0.18));background:var(--btn-bg,rgba(255,255,255,0.12));color:var(--btn-color,#fff);cursor:pointer;font-size:14px;font-weight:500;';

        var okBtn = document.createElement('button');
        okBtn.textContent = opts.okText || 'OK';
        okBtn.style.cssText = 'padding:8px 24px;border-radius:8px;border:none;background:var(--accent-gradient,linear-gradient(135deg,#667eea,#764ba2));color:#fff;cursor:pointer;font-size:14px;font-weight:600;';

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(okBtn);
        dialog.appendChild(btnRow);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        function close(val) {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.15s';
            setTimeout(function() { overlay.remove(); }, 150);
            resolve(val);
        }
        okBtn.addEventListener('click', function() { close(true); });
        cancelBtn.addEventListener('click', function() { close(false); });
        overlay.addEventListener('click', function(e) { if (e.target === overlay) close(false); });
        document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape') { document.removeEventListener('keydown', esc); close(false); } });
    });
};

// Custom alert (replaces window.alert)
window.customAlert = function(message) {
    return new Promise(function(resolve) {
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);';

        var dialog = document.createElement('div');
        dialog.style.cssText = 'background:var(--overlay-bg,var(--card-bg));border:1px solid var(--card-border,var(--border-color));border-radius:14px;padding:28px 32px;max-width:440px;box-shadow:0 16px 48px rgba(0,0,0,0.4);text-align:center;';

        var msgEl = document.createElement('div');
        msgEl.style.cssText = 'color:var(--text-color,#fff);font-size:14px;line-height:1.5;margin-bottom:24px;white-space:pre-wrap;word-break:break-word;';
        msgEl.textContent = message;
        dialog.appendChild(msgEl);

        var okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = 'padding:8px 24px;border-radius:8px;border:none;background:var(--accent-gradient,linear-gradient(135deg,#667eea,#764ba2));color:#fff;cursor:pointer;font-size:14px;font-weight:600;';
        dialog.appendChild(okBtn);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        okBtn.addEventListener('click', function() {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.15s';
            setTimeout(function() { overlay.remove(); }, 150);
            resolve();
        });
    });
};

// Function to restart the browser
async function restartBrowser() {
    try {
        const result = await api.restartBrowser();
        if (result.success) {
            showToast('Browser is restarting...');
        } else {
            showToast('Error: ' + result.message);
        }
    } catch (error) {
        console.error('Error restarting browser:', error);
        showToast('Error restarting browser');
    }
}

// Show restart button
function showRestartButton(message = null) {
    const restartBtn = document.getElementById('restart-button');
    if (restartBtn) {
        restartBtn.style.display = 'block';
        if (message) {
            showToast(message, 'info', 5000);
        }
    }
}

// Hide restart button
function hideRestartButton() {
    const restartBtn = document.getElementById('restart-button');
    if (restartBtn) {
        restartBtn.style.display = 'none';
    }
}

// Applying theme
function applyTheme(theme) {
    let className;
    if (theme === 'system') {
        className = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'theme-dark' : 'theme-light';
    } else if (theme === 'auto') {
        className = autoThemeResolve('auto') === 'light' ? 'theme-light' : 'theme-dark';
    } else {
        className = `theme-${theme}`;
    }
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(className);
}

// Load theme on startup
api.getTheme().then(applyTheme);

// Listen for theme changes
api.onThemeUpdated(applyTheme);

var loadSbStats = null;
// SponsorBlock
(function() {
    var sbToggle = document.getElementById('sbToggle');
    var sbStatus = document.getElementById('sbStatusText');
    var sbCats = document.getElementById('sb-categories');
    var sbStats = document.getElementById('sb-stats');
    var sbCatList = document.getElementById('sbCatList');

    var defaultCategories = [
        { id: 'sponsor', label: 'Sponsor segment', desc: 'Paid advertisement', color: '#00ff00', enabled: true },
        { id: 'intro', label: 'Intro', desc: 'Non-content interval at the start', color: '#00aaff', enabled: true },
        { id: 'outro', label: 'Outro', desc: 'Credits and ending', color: '#00aaff', enabled: true },
        { id: 'interaction', label: 'Interaction', desc: 'Reminders to like/subscribe', color: '#ff0000', enabled: true },
        { id: 'selfpromo', label: 'Self-promotion', desc: 'Promoting own products', color: '#ffff00', enabled: true },
        { id: 'preview', label: 'Preview / Recap', desc: 'Recap or preview of content', color: '#aa00ff', enabled: true },
        { id: 'music_offtopic', label: 'Non-music section', desc: 'Irrelevant parts of music videos', color: '#ffa500', enabled: true },
        { id: 'filler', label: 'Filler', desc: 'Tangential humor and pauses', color: '#aaaaaa', enabled: false }
    ];

    function loadCatSettings() {
        try {
            var saved = JSON.parse(localStorage.getItem('sb-cat-settings'));
            if (saved && Array.isArray(saved)) {
                var map = {};
                saved.forEach(function(c) { map[c.id] = c; });
                defaultCategories.forEach(function(c) {
                    if (map[c.id]) {
                        c.enabled = map[c.id].enabled !== undefined ? map[c.id].enabled : c.enabled;
                        c.color = map[c.id].color || c.color;
                    }
                });
            }
        } catch(e) {}
    }

    function saveCatSettings() {
        var data = defaultCategories.map(function(c) { return { id: c.id, enabled: c.enabled, color: c.color }; });
        try { localStorage.setItem('sb-cat-settings', JSON.stringify(data)); } catch(e) {}
    }

    function renderCategories() {
        sbCatList.innerHTML = '';
        defaultCategories.forEach(function(cat) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding:8px 10px;border:1px solid var(--border-color);border-radius:8px;';

            var info = document.createElement('div');
            info.style.cssText = 'display:flex;align-items:center;gap:10px;flex:1;min-width:0;';

            var colorWrap = document.createElement('div');
            colorWrap.style.cssText = 'position:relative;width:28px;height:28px;flex-shrink:0;';

            var colorCircle = document.createElement('div');
            colorCircle.style.cssText = 'width:28px;height:28px;border-radius:50%;cursor:pointer;border:2px solid rgba(255,255,255,0.2);background:' + cat.color + ';transition:transform 0.15s;';
            colorCircle.title = 'Choose color';

            var colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = cat.color;
            colorInput.style.cssText = 'position:absolute;top:0;left:0;width:28px;height:28px;opacity:0;cursor:pointer;';
            colorInput.addEventListener('input', function() {
                cat.color = colorInput.value;
                colorCircle.style.background = colorInput.value;
                saveCatSettings();
            });
            colorInput.addEventListener('mouseenter', function() { colorCircle.style.transform = 'scale(1.15)'; });
            colorInput.addEventListener('mouseleave', function() { colorCircle.style.transform = 'scale(1)'; });

            colorWrap.appendChild(colorCircle);
            colorWrap.appendChild(colorInput);

            var textWrap = document.createElement('div');
            textWrap.style.cssText = 'min-width:0;';
            var title = document.createElement('div');
            title.style.cssText = 'font-size:13px;color:var(--text-color);';
            title.textContent = cat.label;
            var desc = document.createElement('div');
            desc.style.cssText = 'font-size:11px;color:var(--secondary-text);margin-top:1px;';
            desc.textContent = cat.desc;
            textWrap.appendChild(title);
            textWrap.appendChild(desc);

            info.appendChild(colorWrap);
            info.appendChild(textWrap);

            var toggleLabel = document.createElement('label');
            toggleLabel.className = 'px-toggle-wrap';
            var toggleInput = document.createElement('input');
            toggleInput.type = 'checkbox';
            toggleInput.checked = cat.enabled;
            var toggleSpan = document.createElement('span');
            toggleSpan.className = 'px-toggle-track';
            toggleLabel.appendChild(toggleInput);
            toggleLabel.appendChild(toggleSpan);
            toggleInput.addEventListener('change', function() {
                cat.enabled = toggleInput.checked;
                saveCatSettings();
            });

            row.appendChild(info);
            row.appendChild(toggleLabel);
            sbCatList.appendChild(row);
        });
    }

    loadCatSettings();

    api.getSponsorBlockEnabled().then(function(val) {
        sbToggle.checked = !!val;
        sbStatus.textContent = val ? 'Enabled' : 'Disabled';
        sbCats.style.display = val ? 'block' : 'none';
        sbStats.style.display = val ? 'block' : 'none';
        if (val) renderCategories();
    });

    loadSbStats = function() {
        console.log('[SB] loadSbStats called, api exists:', !!api, 'getSponsorBlockStats exists:', !!(api && api.getSponsorBlockStats));
        if (!api || !api.getSponsorBlockStats) return;
        api.getSponsorBlockStats().then(function(st) {
            console.log('[SB] stats received:', JSON.stringify(st));
            document.getElementById('sbStatSegments').textContent = st.segments || 0;
            var secs = st.timeSaved || 0;
            console.log('[SB] segments:', st.segments, 'timeSaved:', secs);
            if (secs >= 3600) document.getElementById('sbStatTime').textContent = Math.round(secs / 3600) + 'h ' + Math.round((secs % 3600) / 60) + 'm';
            else if (secs > 60) document.getElementById('sbStatTime').textContent = Math.round(secs / 60) + 'm';
            else document.getElementById('sbStatTime').textContent = Math.round(secs) + 's';
        }).catch(function(err) { console.log('[SB] stats error:', err); });
    }

    loadSbStats();

    sbToggle.addEventListener('change', function() {
        api.setSponsorBlockEnabled(sbToggle.checked);
        sbStatus.textContent = sbToggle.checked ? 'Enabled' : 'Disabled';
        sbCats.style.display = sbToggle.checked ? 'block' : 'none';
        sbStats.style.display = sbToggle.checked ? 'block' : 'none';
        if (sbToggle.checked) { renderCategories(); loadSbStats(); }
    });
})();

// Ad blocker — settings
(function() {
    var abToggle = document.getElementById('abSettingsToggle');
    var abStatus = document.getElementById('abStatusText');
    var _t = function (s) { return (window.i18n && window.i18n.t(s)) || s; };

    if (api.adblockerIsEnabled) {
        api.adblockerIsEnabled().then(function(r) {
            abToggle.checked = r.enabled;
            abStatus.textContent = r.enabled ? 'Enabled' : 'Disabled';
        });
    }
    abToggle.addEventListener('change', function() {
        if (api.adblockerToggle) {
            api.adblockerToggle(abToggle.checked).then(function() {
                abStatus.textContent = abToggle.checked ? 'Enabled' : 'Disabled';
            });
        }
    });

    // Custom filters
    var filtersArea = document.getElementById('abCustomFilters');
    var saveFiltersBtn = document.getElementById('abSaveFilters');
    if (api.getCustomFilters) {
        api.getCustomFilters().then(function(text) { filtersArea.value = text || ''; });
    }
    saveFiltersBtn.addEventListener('click', function() {
        if (api.saveCustomFilters) api.saveCustomFilters(filtersArea.value);
    });

    // Filter lists
    var listsContainer = document.getElementById('abFilterLists');
    var newListInput = document.getElementById('abNewListUrl');
    var addListBtn = document.getElementById('abAddList');
    var updateListsBtn = document.getElementById('abUpdateLists');

    function renderLists(data) {
        listsContainer.innerHTML = '';
        if (data.builtin && data.builtin.length) {
            var h = document.createElement('div');
            h.style.cssText = 'font-size:12px;font-weight:500;color:var(--text-color);margin:8px 0 4px;';
            h.textContent = _t('Built-in lists') + ' (' + data.builtin.length + ')';
            listsContainer.appendChild(h);
            data.builtin.forEach(function(url) {
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:3px;padding:5px 8px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:6px;font-size:11px;opacity:0.7;';
                var urlSpan = document.createElement('span');
                urlSpan.style.cssText = 'flex:1;color:var(--secondary-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                urlSpan.textContent = url; urlSpan.title = url;
                var badge = document.createElement('span');
                badge.style.cssText = 'font-size:10px;color:var(--secondary-text);background:var(--border-color);padding:1px 6px;border-radius:4px;';
                badge.textContent = 'built-in';
                row.appendChild(urlSpan); row.appendChild(badge);
                listsContainer.appendChild(row);
            });
        }
        if (data.custom && data.custom.length) {
            var h2 = document.createElement('div');
            h2.style.cssText = 'font-size:12px;font-weight:500;color:var(--text-color);margin:12px 0 4px;';
            h2.textContent = _t('Custom lists') + ' (' + data.custom.length + ')';
            listsContainer.appendChild(h2);
            data.custom.forEach(function(url) {
                var row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:3px;padding:5px 8px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:6px;font-size:11px;';
                var urlSpan = document.createElement('span');
                urlSpan.style.cssText = 'flex:1;color:var(--text-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                urlSpan.textContent = url; urlSpan.title = url;
                var removeBtn = document.createElement('button');
                removeBtn.style.cssText = 'background:none;border:none;color:var(--danger-color,#e74c3c);cursor:pointer;font-size:14px;padding:0 4px;';
                removeBtn.textContent = '\u00d7';
                removeBtn.addEventListener('click', function() {
                    if (api.removeFilterList) api.removeFilterList(url).then(renderFilterLists);
                });
                row.appendChild(urlSpan); row.appendChild(removeBtn);
                listsContainer.appendChild(row);
            });
        }
    }

    function renderFilterLists() {
        if (api.getFilterLists) api.getFilterLists().then(renderLists);
    }
    renderFilterLists();

    // FilterHub catalog
    var fhCatalogEl = document.getElementById('fhCatalog');
    var fhStatusEl = document.getElementById('fhStatus');
    if (fhCatalogEl && fhStatusEl && api.getFilterhubCatalog) {
        var FH_CAT_ORDER = ['ads', 'privacy', 'security', 'annoyances', 'fixes', 'regional', 'pro'];
        var FH_CAT_LABELS = {
            ads: 'Ad blocking', privacy: 'Privacy', security: 'Security',
            annoyances: 'Annoyances', fixes: 'Fixes', regional: 'Regional', pro: 'Pro'
        };
        var FH_WARN_LABELS = {
            google: 'May break reCAPTCHA / Google services',
            slow: 'May slow down the browser',
            huge: 'Very large list',
            strict: 'Strict — may break sites'
        };
        var fhCatalog = null;
        var fhEnabledSet = {};
        var fhApplying = false;

        function fhFmtRules(n) {
            if (!n) return '—';
            if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
            if (n >= 1000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '') + 'K';
            return String(n);
        }
        function fhFmtSize(kb) {
            if (kb >= 1024) return (kb / 1024).toFixed(1) + ' MB';
            return kb + ' KB';
        }
        function fhUpdateStatus() {
            var n = Object.keys(fhEnabledSet).length;
            fhStatusEl.style.color = 'var(--secondary-text)';
            fhStatusEl.textContent = _t('Enabled lists:') + ' ' + n + ' / 44';
        }
        function fhRender() {
            fhCatalogEl.innerHTML = '';
            var lists = (fhCatalog && fhCatalog.lists) || [];
            FH_CAT_ORDER.forEach(function(cat) {
                var inCat = lists.filter(function(l) { return l.cat === cat; });
                if (!inCat.length) return;
                var head = document.createElement('div');
                head.style.cssText = 'font-size:12px;font-weight:500;color:var(--text-color);margin:12px 0 6px;';
                head.textContent = _t(FH_CAT_LABELS[cat]) + ' (' + inCat.length + ')';
                fhCatalogEl.appendChild(head);
                inCat.forEach(function(l) {
                    var row = document.createElement('label');
                    row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:4px;padding:7px 10px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;font-size:12px;cursor:pointer;';
                    var cb = document.createElement('input');
                    cb.type = 'checkbox';
                    cb.checked = !!fhEnabledSet[l.num];
                    cb.dataset.fhNum = String(l.num);
                    cb.style.cssText = 'accent-color:var(--accent-color);margin:0;';
                    var nameSpan = document.createElement('span');
                    nameSpan.style.cssText = 'color:var(--text-color);font-weight:500;';
                    nameSpan.textContent = l.name + ' #' + l.num;
                    var metaSpan = document.createElement('span');
                    metaSpan.style.cssText = 'color:var(--secondary-text);font-size:11px;margin-left:auto;white-space:nowrap;';
                    metaSpan.textContent = fhFmtRules(l.rules) + ' · ' + fhFmtSize(l.sizeKB);
                    row.appendChild(cb);
                    row.appendChild(nameSpan);
                    if (l.warn) {
                        var warn = document.createElement('span');
                        warn.style.cssText = 'font-size:10px;color:#ffb347;background:rgba(255,179,71,0.12);padding:1px 6px;border-radius:4px;white-space:nowrap;';
                        warn.textContent = '⚠ ' + _t(FH_WARN_LABELS[l.warn] || l.warn);
                        warn.title = _t(FH_WARN_LABELS[l.warn] || l.warn);
                        row.appendChild(warn);
                    }
                    row.appendChild(metaSpan);
                    cb.addEventListener('change', function() {
                        if (cb.checked) fhEnabledSet[l.num] = true;
                        else delete fhEnabledSet[l.num];
                        fhApply(Object.keys(fhEnabledSet).map(Number));
                    });
                    fhCatalogEl.appendChild(row);
                });
            });
            fhUpdateStatus();
        }
        function fhSyncCheckboxes() {
            var boxes = fhCatalogEl.querySelectorAll('input[data-fh-num]');
            boxes.forEach(function(cb) {
                cb.checked = !!fhEnabledSet[Number(cb.dataset.fhNum)];
            });
            fhUpdateStatus();
        }
        function fhApply(newEnabled) {
            if (fhApplying) return;
            fhApplying = true;
            fhStatusEl.style.color = '#ffb347';
            fhStatusEl.textContent = 'Rebuilding engine, please wait…';
            api.setFilterhubEnabled(newEnabled).then(function(r) {
                fhApplying = false;
                fhEnabledSet = {};
                ((r && r.enabled) || []).forEach(function(n) { fhEnabledSet[n] = true; });
                fhSyncCheckboxes();
                fhStatusEl.style.color = '#4CAF50';
                fhStatusEl.textContent = '✓ ' + _t('Enabled lists:') + ' ' + Object.keys(fhEnabledSet).length;
            }).catch(function() {
                fhApplying = false;
                fhStatusEl.style.color = 'var(--secondary-text)';
                fhStatusEl.textContent = _t('Failed to apply, please retry.');
            });
        }
        function fhPreset(level) {
            if (fhApplying) return;
            fhApplying = true;
            fhStatusEl.style.color = '#ffb347';
            fhStatusEl.textContent = _t('Applying preset…');
            api.setFilterhubPreset(level).then(function(r) {
                fhApplying = false;
                if (r && r.success) {
                    fhEnabledSet = {};
                    (r.enabled || []).forEach(function(n) { fhEnabledSet[n] = true; });
                    fhSyncCheckboxes();
                    fhStatusEl.style.color = '#4CAF50';
                    fhStatusEl.textContent = '✓ ' + _t('Preset applied') + ': ' + Object.keys(fhEnabledSet).length;
                } else {
                    fhStatusEl.style.color = 'var(--secondary-text)';
                    fhStatusEl.textContent = _t('Failed to apply preset.');
                }
            }).catch(function() {
                fhApplying = false;
                fhStatusEl.style.color = 'var(--secondary-text)';
                fhStatusEl.textContent = _t('Failed to apply preset.');
            });
        }
        ['light', 'medium', 'full'].forEach(function(level) {
            var btn = document.getElementById('fhPreset' + level.charAt(0).toUpperCase() + level.slice(1));
            if (btn) btn.addEventListener('click', function() { fhPreset(level); });
        });
        var repoLink = document.getElementById('fhRepoLink');
        if (repoLink) repoLink.addEventListener('click', function(e) {
            e.preventDefault();
            window.open('https://github.com/StartPOZI/FilterHub', '_blank');
        });
        var docLink = document.getElementById('fhDocLink');
        if (docLink) docLink.addEventListener('click', function() {
            window.open('https://github.com/StartPOZI/FilterHub/tree/main/Doc', '_blank');
        });
        Promise.all([
            api.getFilterhubCatalog(),
            api.getFilterhubEnabled ? api.getFilterhubEnabled() : Promise.resolve([])
        ]).then(function(res) {
            fhCatalog = res[0];
            fhEnabledSet = {};
            (res[1] || []).forEach(function(n) { fhEnabledSet[n] = true; });
            fhRender();
        });
    }

    addListBtn.addEventListener('click', function() {
        var url = newListInput.value.trim();
        if (url && api.addFilterList) {
            api.addFilterList(url).then(function() { newListInput.value = ''; renderFilterLists(); });
        }
    });
    updateListsBtn.addEventListener('click', function() {
        if (api.updateFilterLists) api.updateFilterLists();
    });

    // Labels composed in JS (counts, statuses) are not covered by the i18n
    // text-node walker — re-render them once the dictionary is ready and on
    // every live language switch.
    function rerenderI18nLabels() { renderFilterLists(); if (fhCatalog) fhRender(); }
    var i18nTries = 0;
    (function waitI18n() {
        i18nTries++;
        var ok = false;
        try { ok = !!(window.i18n && window.i18n.isReady && window.i18n.isReady()); } catch (e) {}
        if (ok) { rerenderI18nLabels(); return; }
        if (i18nTries < 40) setTimeout(waitI18n, 150);
    })();
    if (window.electronAPI && window.electronAPI.onLanguageChanged) {
        try { window.electronAPI.onLanguageChanged(function() { setTimeout(rerenderI18nLabels, 100); }); } catch (e) {}
    }

    // Custom styles
    var stylesArea = document.getElementById('abCustomStyles');
    var saveStylesBtn = document.getElementById('abSaveStyles');
    if (api.getCustomHideStyles) {
        api.getCustomHideStyles().then(function(text) { stylesArea.value = text || ''; });
    }
    saveStylesBtn.addEventListener('click', function() {
        if (api.saveCustomHideStyles) api.saveCustomHideStyles(stylesArea.value);
    });

    // Blocked log
    var logList = document.getElementById('abLogList');
    var logSearch = document.getElementById('abLogSearch');
    var logCount = document.getElementById('abLogCount');
    var clearLogBtn = document.getElementById('abClearLog');
    var allLogEntries = [];

    function renderLog(filter) {
        var f = (filter || '').toLowerCase();
        var filtered = f ? allLogEntries.filter(function(e) { return (e.url||'').toLowerCase().indexOf(f) !== -1 || (e.domain||'').toLowerCase().indexOf(f) !== -1; }) : allLogEntries;
        logList.innerHTML = '';
        var show = filtered.slice(-200);
        show.forEach(function(entry) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 8px;border-bottom:1px solid var(--border-color);font-size:11px;';
            var typeSpan = document.createElement('span');
            typeSpan.style.cssText = 'color:var(--accent-color);font-weight:500;min-width:60px;';
            typeSpan.textContent = entry.type;
            var domainSpan = document.createElement('span');
            domainSpan.style.cssText = 'color:var(--text-color);min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            domainSpan.textContent = entry.domain;
            domainSpan.title = entry.domain;
            var urlSpan = document.createElement('span');
            urlSpan.style.cssText = 'color:var(--secondary-text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
            urlSpan.textContent = entry.url;
            urlSpan.title = entry.url;
            var timeSpan = document.createElement('span');
            timeSpan.style.cssText = 'color:var(--secondary-text);font-size:10px;min-width:50px;text-align:right;';
            timeSpan.textContent = entry.time;
            row.appendChild(typeSpan);
            row.appendChild(domainSpan);
            row.appendChild(urlSpan);
            row.appendChild(timeSpan);
            logList.appendChild(row);
        });
        logCount.textContent = filtered.length + ' entries';
    }

    function loadLog() {
        if (api.getBlockedLog) {
            api.getBlockedLog().then(function(entries) { allLogEntries = entries || []; renderLog(logSearch.value); });
        }
    }
    loadLog();
    logSearch.addEventListener('input', function() { renderLog(logSearch.value); });
    clearLogBtn.addEventListener('click', function() {
        if (api.clearBlockedLog) api.clearBlockedLog().then(function() { allLogEntries = []; renderLog(''); });
    });
    var persistToggle = document.getElementById('abPersistLog');
    if (persistToggle) {
        if (api.getBlockerLogPersistent) {
            api.getBlockerLogPersistent().then(function(v) { persistToggle.checked = !!v; });
        }
        persistToggle.addEventListener('change', function() {
            if (api.setBlockerLogPersistent) api.setBlockerLogPersistent(persistToggle.checked);
        });
    }
})();

// Security
(function() {
    var secKeys = {
        'secUrlClean': 'urlClean',
        'secSanitizeUrl': 'sanitizeUrl',
        'secWebRTC': 'webrtcLeak',
        'secFingerprint': 'fingerprint',
        'secAudioFp': 'audioFp',
        'secFpShield': 'fpShield',
        'secSpectreShield': 'spectreShield',
        'secBlockDnsRebinding': 'blockDnsRebinding',
        'secAskLanAccess': 'askLanAccess',
        'secConfirmDownloads': 'confirmDownloads',
        'secCoopCoep': 'coopCoep',
        'secLsQuota': 'lsQuota',
        'secClearCacheOnExit': 'clearCacheOnExit',
        'secAutoplay': 'autoplayBlock',
        'secSiteIsolation': 'siteIsolation',
        'secHttpsOnly': 'httpsOnly',
        'secClearCookiesOnExit': 'clearCookiesOnExit',
        'secSuggestEnabled': 'suggestEnabled',
        'secOmniboxFrequent': 'omniboxFrequentSuggestions',
        'secOmniboxBookmarks': 'omniboxBookmarkSuggestions',
        'secTranslateEnabled': 'translateEnabled',
        'secHibpEnabled': 'hibpEnabled',
        'secDiagnosticsEnabled': 'diagnosticsEnabled',
        'secUpdateChecks': 'updateChecks',
        'secDrmEnabled': 'drmEnabled',
        'secDnt': 'dnt',
        'secGpc': 'gpc',
        'secReferrerPolicy': 'referrerPolicy',
        'secBlockThirdPartyCookies': 'blockThirdPartyCookies',
        'secBlockMixedContent': 'blockMixedContent',
        'secBlockNotifications': 'blockNotifications',
        'secBlockGeolocation': 'blockGeolocation',
        'secBlockWebGL': 'blockWebGL',
        'secBlockClipboard': 'blockClipboard',
        'secLetterboxing': 'letterboxing',
        'secAutoRejectCookies': 'autoRejectCookies',
        'secSuperDrag': 'superDrag',
        'secFakeMedia': 'fakeMedia',
        'secPageNotes': 'pageNotes'
    };
    Object.keys(secKeys).forEach(function(elId) {
        var el = document.getElementById(elId);
        if (!el) return;
        var key = secKeys[elId];
        if (api.getSecuritySetting) {
            api.getSecuritySetting(key).then(function(val) { el.checked = !!val; });
        }
        el.addEventListener('change', function() {
            if (api.setSecuritySetting) api.setSecuritySetting(key, el.checked);
        });
    });

    // Address bar: wipe the remembered "frequent sites" counters (Settings →
    // Search). Purely local data; clearing only forgets the counters.
    (function() {
        var btn = document.getElementById('clearFrequentBtn');
        var done = document.getElementById('clearFrequentDone');
        if (!btn) return;
        btn.addEventListener('click', function() {
            if (api.clearFrequentSites) {
                api.clearFrequentSites().then(function() {
                    if (done) { done.style.display = 'inline'; setTimeout(function() { done.style.display = 'none'; }, 2500); }
                }).catch(function() {});
            }
        });
    })();

    // DNS-over-HTTPS.
    (function() {
        var en = document.getElementById('dohEnabled');
        var provSel = document.getElementById('dohProvider');
        var customInp = document.getElementById('dohCustomUrl');
        var modeSel = document.getElementById('dohMode');
        var wrap = document.getElementById('dohProvidersWrap');
        var hint = document.getElementById('dohRestartHint');
        if (!en || !provSel) return;
        function currentServer() {
            if (provSel.value === 'custom') return customInp.value.trim();
            return provSel.value;
        }
        function save(showHint) {
            if (!api.dohSetSettings) return;
            api.dohSetSettings({ enabled: en.checked, server: currentServer(), mode: modeSel.value }).then(function(r) {
                if (r && r.needRestart && showHint !== false) hint.style.display = '';
            });
        }
        if (api.dohGetSettings) {
            api.dohGetSettings().then(function(cfg) {
                cfg = cfg || {};
                en.checked = !!cfg.enabled;
                var server = cfg.server || '';
                var known = Array.prototype.some.call(provSel.options, function(o) { return o.value === server; });
                if (server && !known) { provSel.value = 'custom'; customInp.value = server; customInp.style.display = ''; }
                else provSel.value = server || provSel.options[0].value;
                modeSel.value = cfg.mode === 'secure' ? 'secure' : 'automatic';
                wrap.style.display = en.checked ? 'flex' : 'none';
            });
        }
        en.addEventListener('change', function() {
            wrap.style.display = en.checked ? 'flex' : 'none';
            save();
        });
        provSel.addEventListener('change', function() {
            customInp.style.display = provSel.value === 'custom' ? '' : 'none';
            save();
        });
        customInp.addEventListener('change', function() { save(); });
        modeSel.addEventListener('change', function() { save(); });
    })();

    // SSL certificate manager.
    (function() {
        var openBtn = document.getElementById('openSslCertsBtn');
        if (!openBtn || !api.sslCertsGet) return;

        var overlay = document.createElement('div');
        overlay.id = 'sslCertsModal';
        overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);align-items:center;justify-content:center;';
        overlay.innerHTML =
            '<div style="width:min(680px,92vw);max-height:82vh;display:flex;flex-direction:column;background:var(--card-bg,#1e1e2a);border:1px solid var(--border-color,#333);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.5);">' +
              '<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid var(--border-color,#333);">' +
                '<div style="font-size:17px;font-weight:600;color:var(--text-color,#eee);">SSL certificates</div>' +
                '<button id="sslCertsClose" style="background:none;border:none;color:var(--secondary-text,#999);font-size:22px;cursor:pointer;line-height:1;">×</button>' +
              '</div>' +
              '<div style="padding:16px 22px;overflow-y:auto;">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--input-bg,#181822);border:1px solid var(--border-color,#333);border-radius:10px;margin-bottom:10px;">' +
                  '<div><div style="font-size:14px;font-weight:500;color:var(--text-color,#eee);">StartPOZI SSL Service</div>' +
                  '<div id="sslServiceCount" style="font-size:11px;color:var(--secondary-text,#999);margin-top:2px;"></div></div>' +
                  '<label class="px-toggle-wrap"><input type="checkbox" id="sslServiceToggle"><span class="px-toggle-track"></span></label>' +
                '</div>' +
                '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--input-bg,#181822);border:1px solid var(--border-color,#333);border-radius:10px;margin-bottom:16px;">' +
                  '<div><div style="font-size:14px;font-weight:500;color:var(--text-color,#eee);">System root certificates</div>' +
                  '<div id="sslSystemCount" style="font-size:11px;color:var(--secondary-text,#999);margin-top:2px;"></div></div>' +
                  '<label class="px-toggle-wrap"><input type="checkbox" id="sslSystemToggle"><span class="px-toggle-track"></span></label>' +
                '</div>' +
                '<div style="font-size:13px;font-weight:600;color:var(--text-color,#eee);margin-bottom:8px;">My certificates</div>' +
                '<div id="sslCertsList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;"></div>' +
                '<div style="display:flex;gap:10px;">' +
                  '<button id="sslCertsAddBtn" style="flex:1;padding:10px;border-radius:8px;border:1px solid var(--border-color,#333);background:var(--input-bg,#181822);color:var(--text-color,#eee);font-size:13px;cursor:pointer;">+ Add certificate (PEM / CRT / CER)</button>' +
                '</div>' +
                '<div id="sslCertsStatus" style="font-size:11px;color:var(--secondary-text,#999);margin-top:10px;"></div>' +
              '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        var listEl = overlay.querySelector('#sslCertsList');
        var sysToggle = overlay.querySelector('#sslSystemToggle');
        var sysCount = overlay.querySelector('#sslSystemCount');
        var svcToggle = overlay.querySelector('#sslServiceToggle');
        var svcCount = overlay.querySelector('#sslServiceCount');
        var statusEl = overlay.querySelector('#sslCertsStatus');

        function esc(s) {
            return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        }
        var _t = function (s) { return (window.i18n && window.i18n.t(s)) || s; };
        function render(data) {
            sysToggle.checked = !!data.systemEnabled;
            sysCount.textContent = data.systemRoots
                ? data.systemRoots + ' ' + _t('built-in Mozilla roots (cacert.pem)')
                : _t('built-in roots unavailable');
            if (svcToggle && data.sslService) {
                svcToggle.checked = !!data.sslService.enabled;
                svcCount.textContent = (data.sslService.count || 0) + ' ' + _t('StartPOZI SSL-Service roots (built-in)');
            }
            if (!data.userCerts.length) {
                listEl.innerHTML = '<div style="font-size:12px;color:var(--secondary-text,#999);padding:10px;border:1px dashed var(--border-color,#333);border-radius:10px;text-align:center;">No custom certificates. Add a root CA to trust sites signed by it.</div>';
                return;
            }
            listEl.innerHTML = data.userCerts.map(function (c) {
                return '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;background:var(--input-bg,#181822);border:1px solid var(--border-color,#333);border-radius:10px;">' +
                    '<div style="min-width:0;flex:1;">' +
                      '<div style="font-size:14px;font-weight:500;color:var(--text-color,#eee);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(c.name) + '</div>' +
                      '<div style="font-size:11px;color:var(--secondary-text,#999);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">Valid until ' + esc(c.validTo || '—') + '</div>' +
                    '</div>' +
                    '<label class="px-toggle-wrap"><input type="checkbox" data-ssltgl="' + esc(c.id) + '"' + (c.enabled ? ' checked' : '') + '><span class="px-toggle-track"></span></label>' +
                    '<button data.ssldel="' + esc(c.id) + '" style="background:none;border:none;color:#e57373;font-size:13px;cursor:pointer;white-space:nowrap;">Delete</button>' +
                  '</div>';
            }).join('');
        }
        function refresh() {
            api.sslCertsGet().then(render).catch(function () {});
        }
        function setStatus(msg, ms) {
            statusEl.textContent = msg || '';
            if (ms) setTimeout(function () { statusEl.textContent = ''; }, ms);
        }

        openBtn.addEventListener('click', function () {
            overlay.style.display = 'flex';
            refresh();
        });
        overlay.querySelector('#sslCertsClose').addEventListener('click', function () {
            overlay.style.display = 'none';
        });
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.style.display = 'none';
        });
        sysToggle.addEventListener('change', function () {
            api.sslCertsSetSystem(sysToggle.checked).then(function (r) {
                render(r);
                setStatus(sysToggle.checked ? '' : 'System roots are disabled — only your certificates are trusted.');
            }).catch(function () {});
        });
        if (svcToggle) svcToggle.addEventListener('change', function () {
            api.sslCertsSetService(svcToggle.checked).then(render).catch(function () {});
        });
        overlay.querySelector('#sslCertsAddBtn').addEventListener('click', function () {
            setStatus(_t('Importing…'));
            api.sslCertsAdd().then(function (r) {
                if (r && r.success) { render(r); setStatus(_t('Added certificates:') + ' ' + (r.added || 1), 4000); }
                else setStatus((r && r.message) || 'Failed to add certificate');
            }).catch(function (e) { setStatus('Failed: ' + e.message); });
        });
        listEl.addEventListener('change', function (e) {
            var id = e.target && e.target.getAttribute && e.target.getAttribute('data-ssltgl');
            if (!id) return;
            api.sslCertsToggle(id, e.target.checked).then(render).catch(function () {});
        });
        listEl.addEventListener('click', function (e) {
            var id = e.target && e.target.getAttribute && e.target.getAttribute('data-ssldel');
            if (!id) return;
            api.sslCertsRemove(id).then(render).catch(function () {});
        });
    })();
})();

// Optimization
(function() {
    var optToggles = {
        'optLazyTabs': 'lazyTabs',
        'optDisableTransparency': 'disableTransparency',
        'optClearOnMinimize': 'clearOnMinimize',
        'optGPU': 'gpu',
        'optPrefetch': 'prefetch',
        'optClearSleepingSW': 'clearSleepingSW',
        'optSleepOthers': 'sleepOthersEnabled',
        'optEcoFreeze': 'ecoFreeze',
        'optEcoCpuGuard': 'ecoCpuGuard',
        'optDataSaver': 'dataSaver',
        'optBatterySaver': 'batterySaver'
    };
    var optSelects = {
        'optTabSleepTime': 'tabSleepTime',
        'optDiskCache': 'diskCache',
        'optProcessLimit': 'processLimit',
        'optTabLimit': 'tabLimit',
        'optEcoCpuThreshold': 'ecoCpuThreshold'
    };
    Object.keys(optToggles).forEach(function(elId) {
        var el = document.getElementById(elId);
        if (!el) return;
        var key = optToggles[elId];
        if (api.getOptimizationSetting) {
            api.getOptimizationSetting(key).then(function(val) {
                if (key === 'gpu') el.checked = val !== false;
                else if (key === 'ecoFreeze') el.checked = val === undefined ? true : !!val;
                else el.checked = !!val;
            });
        }
        el.addEventListener('change', function() {
            if (api.setOptimizationSetting) api.setOptimizationSetting(key, el.checked);
        });
    });
    Object.keys(optSelects).forEach(function(elId) {
        var el = document.getElementById(elId);
        if (!el) return;
        var key = optSelects[elId];
        if (api.getOptimizationSetting) {
            api.getOptimizationSetting(key).then(function(val) {
                if (val !== undefined && val !== null) el.value = val;
            });
        }
        el.addEventListener('change', function() {
            if (api.setOptimizationSetting) api.setOptimizationSetting(key, parseInt(el.value) || 0);
        });
    });

    // --- Whitelist "never sleep" ---
    var nosleepInput = document.getElementById('nosleepInput');
    var nosleepList = document.getElementById('nosleepList');
    var nosleepAddBtn = document.getElementById('nosleepAddBtn');

    function normalizeDomain(s) {
        s = String(s || '').trim().toLowerCase();
        // remove scheme and path, keep only host
        s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split('/')[0].split('?')[0].split(':')[0];
        return s;
    }
    function renderNosleepList(arr) {
        if (!nosleepList) return;
        nosleepList.innerHTML = '';
        if (!arr.length) {
            nosleepList.innerHTML = '<div style="color:var(--secondary-text);font-size:12px;padding:6px 2px;">The list is empty. Add domains that should not go to sleep.</div>';
            return;
        }
        arr.forEach(function(d, i) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 12px;background:var(--input-bg);border:var(--input-border);border-radius:8px;';
            row.innerHTML = '<span style="font-size:13px;color:var(--text-color);">' + escapeHtml(d) + '<span style="color:var(--secondary-text);font-size:11px;"> · including subdomains</span></span>';
            var rm = document.createElement('button');
            rm.type = 'button';
            rm.textContent = 'Delete';
            rm.style.cssText = 'padding:5px 12px;border:1px solid var(--border-color);border-radius:7px;background:var(--btn-bg);color:var(--btn-color);font-size:12px;cursor:pointer;';
            rm.addEventListener('click', function() {
                var next = arr.slice();
                next.splice(i, 1);
                if (api.setOptimizationSetting) api.setOptimizationSetting('noSleepDomains', next);
                loadNosleep();
            });
            row.appendChild(rm);
            nosleepList.appendChild(row);
        });
    }
    function loadNosleep() {
        if (!api.getOptimizationSetting) return;
        api.getOptimizationSetting('noSleepDomains').then(function(arr) {
            renderNosleepList(Array.isArray(arr) ? arr : []);
        });
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }
    function addNosleep() {
        if (!nosleepInput || !api.getOptimizationSetting || !api.setOptimizationSetting) return;
        var d = normalizeDomain(nosleepInput.value);
        if (!d || d.indexOf('.') === -1) { nosleepInput.focus(); return; }
        api.getOptimizationSetting('noSleepDomains').then(function(arr) {
            arr = Array.isArray(arr) ? arr.slice() : [];
            if (arr.indexOf(d) !== -1) { nosleepInput.value = ''; return; }
            arr.push(d);
            api.setOptimizationSetting('noSleepDomains', arr).then(loadNosleep);
            nosleepInput.value = '';
        });
    }
    if (nosleepAddBtn) nosleepAddBtn.addEventListener('click', addNosleep);
    if (nosleepInput) {
        nosleepInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') addNosleep(); });
    }
    loadNosleep();

    // --- Quick actions ---
    var openTmBtn = document.getElementById('openTaskManagerBtn');
    if (openTmBtn) {
        openTmBtn.addEventListener('click', function() {
            if (api && api.openUrlFromSettings) api.openUrlFromSettings('TaskManager.html');
        });
    }
    var sleepAllBtn = document.getElementById('sleepAllNowBtn');
    if (sleepAllBtn) {
        sleepAllBtn.addEventListener('click', function() {
            if (api && api.sleepAllTabs) api.sleepAllTabs();
        });
    }
})();

// Navigation
// "Main" absorbed the small sections (#startup, #homepage, #language) — old
// deep links keep working through this alias map.
const SECTION_ALIASES = { '#startup': '#main', '#homepage': '#main', '#language': '#main' };
function resolveSectionHash(hash) {
    return SECTION_ALIASES[hash] || hash;
}
document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', e => {
        e.preventDefault();
        document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
        link.classList.add('active');
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        const target = document.querySelector(resolveSectionHash(link.getAttribute('href')));
        if (target) target.classList.add('active');

        // scroll sidebar to selected item (if out of view)
        try { link.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch(e) {}

        if (link.getAttribute('href') === '#scripts') loadScripts();
        if (link.getAttribute('href') === '#permissions') loadPermissions();
        if (link.getAttribute('href') === '#system-integration') initSystemIntegration();
        if (link.getAttribute('href') === '#customization') initCustomThemeUpload();
        if (link.getAttribute('href') === '#profiles') loadProfiles();
        if (link.getAttribute('href') === '#containers') loadContainersSection();
        if (link.getAttribute('href') === '#security') { if (typeof loadPrivacyDashboard === 'function') loadPrivacyDashboard(); }
        if (link.getAttribute('href') === '#blocker') loadBlockerPage();
        if (link.getAttribute('href') === '#paths') loadPathsPage();
        if (link.getAttribute('href') === '#hotkeys') loadHotkeysPage();
        if (link.getAttribute('href') === '#element-zapper') loadElementZapperPage();
        if (link.getAttribute('href') === '#library-protection') {
            // The protection panel itself is gated by the master password.
            gateProtectionSection(function() { loadLibraryProtectionPage(); });
        }
        if (link.getAttribute('href') === '#backup') {
            // Backup may require re-auth every time it's opened.
            gateBackupSection(function() { loadBackupPage(); });
        }
    });
});

// ============== SETTINGS SEARCH ==============
// Sidebar search over every settings card: jump to the section (reusing the
// nav click so lazy loaders fire), scroll to the card and flash it.
// Matches the DOM text as currently shown (RU after i18n, EN otherwise) plus
// a small RU→EN alias map so "куки" finds "cookie" even in English UI.
// Deep link: about:settings?q=cookie (also #q=cookie / #search=cookie).
(function initSettingsSearch() {
    var input = document.getElementById('settingsSearchInput');
    var box = document.getElementById('settingsSearchResults');
    if (!input || !box) return;

    var ALIASES = {
        'куки': 'cookie', 'парол': 'password', 'тем': 'theme', 'темы': 'theme',
        'прокси': 'proxy', 'обнов': 'update', 'язык': 'language', 'старт': 'startup',
        'вклад': 'tab', 'истори': 'history', 'заклад': 'bookmark', 'загруз': 'download',
        'приват': 'privacy', 'безоп': 'security', 'блокир': 'block', 'реклам': 'ad ',
        'отпечат': 'fingerprint', 'уведомл': 'notification', 'гео': 'geolocation',
        'буфер': 'clipboard', 'сохран': 'backup', 'архив': 'backup', 'мост': 'bridge',
        'фингер': 'fingerprint', 'защит': 'protect', 'внешн': 'external'
    };

    function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

    function navTitle(sectionId) {
        var a = document.querySelector('nav a[href="#' + sectionId + '"]');
        return a ? norm(a.textContent) : sectionId;
    }

    // Lazy index: built on first search, rebuilt when the query yields
    // nothing (sections load lazily, so text appears over time).
    var index = null;
    function buildIndex() {
        var out = [];
        document.querySelectorAll('.section').forEach(function (sec) {
            var sId = sec.id || '';
            var sTitle = navTitle(sId);
            sec.querySelectorAll(':scope > .card').forEach(function (card) {
                var h = card.querySelector('h2, h3');
                var title = norm(h ? h.textContent : '');
                var text = norm(card.innerText || '');
                if (text) out.push({ sec: sId, sTitle: sTitle, title: title, text: text, el: card });
            });
        });
        return out;
    }

    function expand(q) {
        var terms = [q];
        Object.keys(ALIASES).forEach(function (ru) {
            if (q.indexOf(ru) !== -1) terms.push(ALIASES[ru]);
        });
        return terms;
    }

    function search(q) {
        if (!index) index = buildIndex();
        var terms = expand(q);
        return index.filter(function (it) {
            return terms.some(function (t) { return it.text.indexOf(t) !== -1; });
        }).slice(0, 30);
    }

    function flash(card) {
        if (!card) return;
        try { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e0) {}
        card.style.transition = 'box-shadow .4s';
        card.style.boxShadow = '0 0 0 3px var(--accent-color,#1da1f2)';
        setTimeout(function () { card.style.boxShadow = ''; }, 1600);
    }

    function jump(item) {
        var a = document.querySelector('nav a[href="#' + item.sec + '"]');
        if (a) a.click();
        setTimeout(function () { flash(item.el); }, 120);
        hideResults();
    }

    function hideResults() { box.style.display = 'none'; box.innerHTML = ''; }

    function render(items, q) {
        box.innerHTML = '';
        if (!items.length) {
            var no = document.createElement('div');
            no.style.cssText = 'padding:10px 12px;font-size:12px;color:var(--secondary-text,#999);';
            no.textContent = '∅';
            box.appendChild(no);
        } else {
            items.forEach(function (it, i) {
                var row = document.createElement('div');
                row.style.cssText = 'padding:8px 12px;font-size:12px;cursor:pointer;border-bottom:1px solid var(--border-color,rgba(255,255,255,0.06));display:flex;flex-direction:column;gap:2px;';
                row.addEventListener('mouseenter', function () { row.style.background = 'rgba(29,161,242,0.08)'; });
                row.addEventListener('mouseleave', function () { row.style.background = ''; });
                var t1 = document.createElement('div');
                t1.style.cssText = 'color:var(--text-color,#eee);font-weight:600;';
                t1.textContent = (it.title || it.sTitle);
                var t2 = document.createElement('div');
                t2.style.cssText = 'color:var(--secondary-text,#999);font-size:11px;';
                t2.textContent = it.sTitle;
                row.appendChild(t1); row.appendChild(t2);
                row.addEventListener('click', function () { jump(it); });
                if (i === 0) row.setAttribute('data-first', '1');
                box.appendChild(row);
            });
        }
        box.style.display = 'block';
    }

    var debounce = null;
    function onInput() {
        clearTimeout(debounce);
        debounce = setTimeout(function () {
            var q = norm(input.value);
            if (q.length < 2) { hideResults(); return; }
            var items = search(q);
            if (!items.length && index && index.length < 400) {
                // A lazily loaded section may have appeared since indexing.
                index = buildIndex();
                items = search(q);
            }
            render(items, q);
        }, 120);
    }

    input.addEventListener('input', onInput);
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { input.value = ''; hideResults(); input.blur(); }
        if (e.key === 'Enter') {
            var first = box.querySelector('[data-first]');
            if (first) first.click();
        }
    });
    document.addEventListener('click', function (e) {
        if (!document.getElementById('settingsSearchBox').contains(e.target)) hideResults();
    });

    // Bilingual placeholder (i18n loads async).
    function applyPh() {
        var ru = false;
        try { ru = !!(window.i18n && window.i18n.getLanguage && window.i18n.getLanguage() === 'ru'); } catch (e0) {}
        input.placeholder = ru ? (input.getAttribute('data-ru-ph') || input.placeholder)
                               : (input.getAttribute('data-en-ph') || input.placeholder);
    }
    applyPh();
    // On a normal start `language-changed` never fires, so the initial
    // applyPh() can run before the async language load and pick English.
    // Re-apply once i18n reports readiness (bounded poll), and on switches.
    var phTries = 0;
    (function waitPhReady() {
        phTries++;
        var ok = false;
        try { ok = !!(window.i18n && window.i18n.isReady && window.i18n.isReady()); } catch (e2) {}
        if (ok) { applyPh(); return; }
        if (phTries < 40) setTimeout(waitPhReady, 150);
    })();
    if (window.electronAPI && window.electronAPI.onLanguageChanged) {
        try { window.electronAPI.onLanguageChanged(function () { setTimeout(applyPh, 80); }); } catch (e1) {}
    }

    // Deep link: ?q=… / #q=… / #search=…
    (function deepLink() {
        var q = '';
        try { q = new URLSearchParams(location.search).get('q') || ''; } catch (e0) {}
        if (!q) {
            var m = location.hash.match(/[#&](?:q|search)=([^&]+)/);
            if (m) q = decodeURIComponent(m[1]);
        }
        if (q) {
            input.value = q;
            setTimeout(onInput, 200);
        }
    })();
})();
// ============== SETTINGS LOCK (protectSettings) & BACKUP GATE (protectBackup) ==============
(function initSettingsLock() {
    var api = window.electronAPI;
    if (!api) return;
    var lockScreen = document.getElementById('settingsLockScreen');
    var inp = document.getElementById('settingsLockInput');
    var btn = document.getElementById('settingsLockBtn');
    var err = document.getElementById('settingsLockError');
    var bioBtn = document.getElementById('settingsLockBioBtn');

    function showLock(biometricAvailable) {
        if (!lockScreen) return;
        lockScreen.style.display = 'flex';
        if (inp) { inp.value = ''; setTimeout(function() { inp.focus(); }, 30); }
        if (err) err.textContent = '';
        if (bioBtn) bioBtn.style.display = biometricAvailable ? 'flex' : 'none';
    }
    function hideLock() { if (lockScreen) lockScreen.style.display = 'none'; }

    function attempt() {
        if (!inp || !api.verifySettingsAccess) return;
        var pw = inp.value;
        if (!pw) { if (err) err.textContent = 'Enter your master password'; return; }
        if (btn) { btn.disabled = true; btn.textContent = 'Unlocking…'; }
        if (err) err.textContent = '';
        api.verifySettingsAccess(pw).then(function(res) {
            if (btn) { btn.disabled = false; btn.textContent = 'Unlock'; }
            if (res && res.success) hideLock();
            else { if (err) err.textContent = (res && res.message) || 'Wrong password'; if (inp) { inp.value = ''; inp.focus(); } }
        }).catch(function() {
            if (btn) { btn.disabled = false; btn.textContent = 'Unlock'; }
            if (err) err.textContent = 'Unlock failed';
        });
    }

    // Check on Settings load.
    function check() {
        if (!api.checkSettingsProtection) return;
        api.checkSettingsProtection().then(function(st) {
            if (!st || !st.needsAuth) return;
            showLock(st.biometricAvailable && st.biometricRequired);
        }).catch(function() {});
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check);
    else check();

    // NOTE: we intentionally do NOT auto-hide this lock on focus/visibility.
    // The lock must only drop after a correct master password (verify-settings-access)
    // or a successful settings-biometric-auth — never because some other zone got
    // unlocked. Each protection zone is independent.

    if (btn) btn.addEventListener('click', attempt);
    if (inp) inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') attempt(); });
    if (bioBtn) bioBtn.addEventListener('click', function() {
        if (err) err.textContent = '';
        if (!api.settingsBiometricAuth) return;
        api.settingsBiometricAuth().then(function(res) {
            if (res && res.success) hideLock();
            else if (err) err.textContent = (res && res.message) || 'Biometric failed';
        }).catch(function() { if (err) err.textContent = 'Biometric failed'; });
    });

    // Expose the Backup gate so the nav handler above can call it.
    // Inline lock (no separate window, no Cancel) — same idea as the Library
    // password vault: the Backup card is covered in place until the master
    // password is entered. You unlock or click another sidebar item to leave.
    window.gateBackupSection = function(onAllowed) {
        if (!api.checkBackupProtection) { if (onAllowed) onAllowed(); return; }
        api.checkBackupProtection().then(function(st) {
            if (!st || !st.needsAuth) { hideBackupGate(); if (onAllowed) onAllowed(); return; }
            showBackupGate(st.biometricAvailable && st.biometricRequired, onAllowed);
        }).catch(function() { if (onAllowed) onAllowed(); });
    };

    var bLock = document.getElementById('backupLockInline');
    var bInp = document.getElementById('backupLockInput');
    var bBtn = document.getElementById('backupLockBtn');
    var bErr = document.getElementById('backupLockError');
    var bBio = document.getElementById('backupLockBioBtn');
    var bOnAllowed = null;

    function showBackupGate(biometricAvailable, onAllowed) {
        bOnAllowed = onAllowed;
        if (bLock) bLock.style.display = 'flex';
        if (bInp) { bInp.value = ''; setTimeout(function() { bInp.focus(); }, 30); }
        if (bErr) bErr.textContent = '';
        if (bBio) bBio.style.display = biometricAvailable ? 'inline-block' : 'none';
    }
    function hideBackupGate(unlock) {
        if (bLock) bLock.style.display = 'none';
        var cb = bOnAllowed; bOnAllowed = null;
        // Only call onAllowed (which loads the real Backup UI) on a real unlock;
        // navigating away just hides the lock.
        if (unlock && cb) cb();
    }
    function backupAttempt() {
        if (!bInp || !api.verifyBackupAccess) return;
        var pw = bInp.value;
        if (!pw) { if (bErr) bErr.textContent = 'Enter your master password'; return; }
        if (bBtn) { bBtn.disabled = true; bBtn.textContent = 'Unlocking…'; }
        if (bErr) bErr.textContent = '';
        api.verifyBackupAccess(pw).then(function(res) {
            if (bBtn) { bBtn.disabled = false; bBtn.textContent = 'Unlock'; }
            if (res && res.success) hideBackupGate(true);
            else { if (bErr) bErr.textContent = (res && res.message) || 'Wrong password'; if (bInp) { bInp.value = ''; bInp.focus(); } }
        }).catch(function() {
            if (bBtn) { bBtn.disabled = false; bBtn.textContent = 'Unlock'; }
            if (bErr) bErr.textContent = 'Unlock failed';
        });
    }
    if (bBtn) bBtn.addEventListener('click', backupAttempt);
    if (bInp) bInp.addEventListener('keydown', function(e) { if (e.key === 'Enter') backupAttempt(); });
    if (bBio) bBio.addEventListener('click', function() {
        if (bErr) bErr.textContent = '';
        if (!api.libraryBiometricAuth) return;
        api.libraryBiometricAuth().then(function(res) {
            if (res && res.success) hideBackupGate(true);
            else if (bErr) bErr.textContent = (res && res.message) || 'Biometric failed';
        }).catch(function() { if (bErr) bErr.textContent = 'Biometric failed'; });
    });
    // When the user leaves the Backup section, drop the inline lock so the
    // next visit asks again (matches the "re-ask every time" rule).
    document.querySelectorAll('nav a').forEach(function(a) {
        a.addEventListener('click', function() {
            if (bLock && bLock.style.display !== 'none' && a.getAttribute('href') !== '#backup') {
                hideBackupGate(false);
            }
        });
    });
})();

// ============== PROTECTION SECTION GATE ==============
// The panel with the protection toggles + master-password controls is itself
// locked behind the master password (so nobody can reach it to disable
// protection). Inline lock, no Cancel — same pattern as Backup. First-run
// (no master password yet) stays open so the password can be set.
(function initProtectionGate() {
    var api = window.electronAPI;
    if (!api) return;
    var pLock = document.getElementById('protectionLockInline');
    var pInp = document.getElementById('protectionLockInput');
    var pBtn = document.getElementById('protectionLockBtn');
    var pErr = document.getElementById('protectionLockError');
    var pBio = document.getElementById('protectionLockBioBtn');
    var pOnAllowed = null;

    window.gateProtectionSection = function(onAllowed) {
        if (!api.checkProtectionAccess) { if (onAllowed) onAllowed(); return; }
        api.checkProtectionAccess().then(function(st) {
            if (!st || !st.needsAuth) { hideProtectionGate(); if (onAllowed) onAllowed(); return; }
            showProtectionGate(st.biometricAvailable && st.biometricRequired, onAllowed);
        }).catch(function() { if (onAllowed) onAllowed(); });
    };

    function showProtectionGate(biometricAvailable, onAllowed) {
        pOnAllowed = onAllowed;
        if (pLock) pLock.style.display = 'flex';
        if (pInp) { pInp.value = ''; setTimeout(function() { pInp.focus(); }, 30); }
        if (pErr) pErr.textContent = '';
        if (pBio) pBio.style.display = biometricAvailable ? 'inline-block' : 'none';
    }
    function hideProtectionGate(unlock) {
        if (pLock) pLock.style.display = 'none';
        var cb = pOnAllowed; pOnAllowed = null;
        if (unlock && cb) cb();
    }
    function attempt() {
        if (!pInp || !api.verifyProtectionAccess) return;
        var pw = pInp.value;
        if (!pw) { if (pErr) pErr.textContent = 'Enter your master password'; return; }
        if (pBtn) { pBtn.disabled = true; pBtn.textContent = 'Unlocking…'; }
        if (pErr) pErr.textContent = '';
        api.verifyProtectionAccess(pw).then(function(res) {
            if (pBtn) { pBtn.disabled = false; pBtn.textContent = 'Unlock'; }
            if (res && res.success) hideProtectionGate(true);
            else { if (pErr) pErr.textContent = (res && res.message) || 'Wrong password'; if (pInp) { pInp.value = ''; pInp.focus(); } }
        }).catch(function() {
            if (pBtn) { pBtn.disabled = false; pBtn.textContent = 'Unlock'; }
            if (pErr) pErr.textContent = 'Unlock failed';
        });
    }
    if (pBtn) pBtn.addEventListener('click', attempt);
    if (pInp) pInp.addEventListener('keydown', function(e) { if (e.key === 'Enter') attempt(); });
    if (pBio) pBio.addEventListener('click', function() {
        if (pErr) pErr.textContent = '';
        if (!api.libraryBiometricAuth) return;
        api.libraryBiometricAuth().then(function(res) {
            if (res && res.success) hideProtectionGate(true);
            else if (pErr) pErr.textContent = (res && res.message) || 'Biometric failed';
        }).catch(function() { if (pErr) pErr.textContent = 'Biometric failed'; });
    });
    // Drop the lock when navigating away from the Protection section.
    document.querySelectorAll('nav a').forEach(function(a) {
        a.addEventListener('click', function() {
            if (pLock && pLock.style.display !== 'none' && a.getAttribute('href') !== '#library-protection') {
                hideProtectionGate(false);
            }
        });
    });
})();

// ===== About StartPOZI =====
(function () {
    var logo = document.getElementById('aboutLogo');
    if (logo) {
        logo.addEventListener('click', function () {
            if (logo.classList.contains('spinning')) return;
            logo.classList.add('spinning');
            logo.addEventListener('animationend', function handler() {
                logo.classList.remove('spinning');
                logo.removeEventListener('animationend', handler);
            });
        });
    }

    var helpBtn = document.getElementById('aboutHelpPage');
    if (helpBtn) helpBtn.addEventListener('click', function () {
        window.open('https://startpozi.com/spi-help-page.html', '_blank');
    });

    // Useful links (About → bottom): bilingual labels + open exactly like
    // the Help button (window.open → new browser tab / external handler).
    // i18n loads the language ASYNC (getLanguage → IPC), so the labels are
    // re-applied once i18n reports readiness and again on live switches.
    (function aboutLinksInit() {
        function applyLang() {
            var ru = false;
            try { ru = !!(window.i18n && window.i18n.getLanguage && window.i18n.getLanguage() === 'ru'); } catch (e0) {}
            var title = document.getElementById('aboutLinksTitle');
            if (title) title.textContent = ru ? title.getAttribute('data-ru') : title.getAttribute('data-en');
            var links = document.querySelectorAll('#aboutLinks a.about-link');
            Array.prototype.forEach.call(links, function (a) {
                a.textContent = ru ? a.getAttribute('data-ru') : a.getAttribute('data-en');
            });
        }
        applyLang();
        // Wait for the async language load (i18n.isReady), then apply.
        var tries = 0;
        (function waitReady() {
            tries++;
            var ok = false;
            try { ok = !!(window.i18n && window.i18n.isReady && window.i18n.isReady()); } catch (e1) {}
            if (ok) { applyLang(); return; }
            if (tries < 40) setTimeout(waitReady, 150);
        })();
        // Live language switch (Settings → language dropdown).
        if (window.electronAPI && window.electronAPI.onLanguageChanged) {
            try {
                window.electronAPI.onLanguageChanged(function () { setTimeout(applyLang, 80); });
            } catch (e2) {}
        }
        // Styling + open exactly like the Help button.
        var links = document.querySelectorAll('#aboutLinks a.about-link');
        Array.prototype.forEach.call(links, function (a) {
            a.style.textDecoration = 'none';
            a.addEventListener('mouseenter', function () { a.style.textDecoration = 'underline'; });
            a.addEventListener('mouseleave', function () { a.style.textDecoration = 'none'; });
            a.addEventListener('click', function (e) {
                e.preventDefault();
                window.open(a.getAttribute('href'), '_blank');
            });
        });
    })();

    // DRM (Widevine) status: probe EME availability in THIS runtime.
    // The "npm run …" hint is for DEVELOPERS running from source only —
    // an installed build must never tell a user to run npm commands.
    (function drmStatus() {
        var el = document.getElementById('aboutDrmStatus');
        if (!el) return;
        Promise.resolve().then(function () {
            var plats = (window.electronAPI && window.electronAPI.getPlatformInfo)
                ? window.electronAPI.getPlatformInfo().catch(function () { return null; })
                : Promise.resolve(null);
            var drms = (window.electronAPI && window.electronAPI.getSecuritySetting)
                ? window.electronAPI.getSecuritySetting('drmEnabled').catch(function () { return null; })
                : Promise.resolve(null);
            return Promise.all([plats, drms]);
        }).then(function (res) {
            var info = res[0], drmSetting = res[1];
            var devHint = !!(info && info.isPackaged === false);
            var done = function (ok) {
                if (drmSetting === false) {
                    el.textContent = 'DRM (Widevine): disabled in Settings → Security (new tabs only; restart to skip the CDM load)';
                    el.style.color = '#ffb347';
                } else if (ok) {
                    el.textContent = 'DRM (Widevine): available ✓';
                    el.style.color = '#4caf50';
                } else if (devHint) {
                    el.textContent = 'DRM (Widevine): not available — run "npm run drm:setup", then "npm run start:drm" (Netflix/Spotify need it)';
                    el.style.color = '#ffb347';
                } else {
                    el.textContent = 'DRM (Widevine): not available in this build (DRM streams like Netflix/Spotify need the DRM build)';
                    el.style.color = '#ffb347';
                }
            };
            try {
                if (!navigator.requestMediaKeySystemAccess) { done(false); return; }
                navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
                    initDataTypes: ['cenc', 'webm'],
                    videoCapabilities: [{ contentType: 'video/mp4;codecs="avc1.42E01E"' }],
                    audioCapabilities: [{ contentType: 'audio/mp4;codecs="mp4a.40.2"' }]
                }]).then(function () { done(true); }).catch(function () { done(false); });
            } catch (e) { done(false); }
        });
    })();

    var donateBtn = document.getElementById('aboutDonate');
    if (donateBtn) donateBtn.addEventListener('click', function () {
        window.open('https://startpozi.com/s/donate.html', '_blank');
    });

    var updBtn = document.getElementById('aboutCheckUpdate');
    var updStatus = document.getElementById('aboutUpdateStatus');
    if (updBtn && updStatus) {
        updBtn.addEventListener('click', function () {
            updStatus.style.color = 'var(--secondary-text)';
            updStatus.textContent = 'Checking for updates…';
            var done = function (latest, current, releaseUrl, downloadable) {
                if (latest === current) {
                    updStatus.style.color = '#4CAF50';
                    updStatus.textContent = '✓ You have the latest version (' + current + ').';
                } else if (latest) {
                    updStatus.style.color = '#ffb347';
                    latest = String(latest); current = String(current || '');
                    // escapeHtml: version strings come from the network
                    // (version.json / GitHub releases) — never trust them
                    // inside innerHTML.
                    if (releaseUrl) {
                        updStatus.innerHTML = '↻ New version available: <a href="#" id="aboutUpdLink" style="color:var(--accent-color);text-decoration:underline;">' + escapeHtml(latest) + '</a>. Current: ' + escapeHtml(current) + '.' +
                            (downloadable ? ' <button id="aboutUpdDl" style="padding:4px 10px;margin-left:8px;border-radius:6px;border:1px solid var(--accent-color);background:transparent;color:var(--accent-color);cursor:pointer;font-size:12px;">⬇ Download</button>' : '');
                        var link = document.getElementById('aboutUpdLink');
                        if (link) link.addEventListener('click', function (e) {
                            e.preventDefault();
                            window.open(String(releaseUrl), '_blank');
                        });
                        var dlBtn = document.getElementById('aboutUpdDl');
                        if (dlBtn) dlBtn.addEventListener('click', function () {
                            dlBtn.disabled = true;
                            dlBtn.textContent = 'Downloading…';
                            if (api.downloadUpdate) {
                                api.downloadUpdate().then(function (r) {
                                    dlBtn.disabled = false;
                                    if (r && r.success) { dlBtn.textContent = '✓ Saved to Downloads'; }
                                    else { dlBtn.textContent = '✗ ' + ((r && r.error) || 'failed'); }
                                }).catch(function () { dlBtn.disabled = false; dlBtn.textContent = '✗ failed'; });
                            }
                        });
                    } else {
                        updStatus.textContent = '↻ New version available: ' + latest + '. Current: ' + current + '.';
                    }
                } else {
                    updStatus.style.color = 'var(--secondary-text)';
                    updStatus.textContent = 'Could not check for updates. Check your connection.';
                }
            };
            if (typeof api !== 'undefined' && api.checkForUpdate) {
                Promise.resolve(api.checkForUpdate()).then(function (r) {
                    if (!r || r.success === false) { done(null, (r && r.current) || '1.0.0'); return; }
                    done(r.updateAvailable === false ? r.current : r.latest, r.current, r.releaseUrl, !!r.downloadUrl);
                }).catch(function () { done(null, '1.0.0'); });
            } else {
                try {
                    fetch('https://startpozi.com/version.json', { cache: 'no-store' })
                        .then(function (r) { return r.ok ? r.json() : null; })
                        .then(function (j) { done(j && j.version, '1.0.0'); })
                        .catch(function () { done(null, '1.0.0'); });
                } catch (e) { done(null, '1.0.0'); }
            }
        });
    }
})();

// Search engine logic
const searchSelect = document.getElementById('search-select');
const customContainer = document.getElementById('custom-container');
const customInput = document.getElementById('custom-input');

api.getSearchEngine().then(url => {
    const predefined = [
        'https://startpozi.com/search.html?q=',
        'https://www.google.com/search?q=',
        'https://duckduckgo.com/?q=',
        'https://www.bing.com/search?q='
    ];
    // Legacy normalize: the StartPOZI engine used to be stored under the
    // netlify.app deploy — show it as the (same) StartPOZI option.
    if (url === 'https://startpozi.netlify.app/search.html?q=') url = predefined[0];
    if (predefined.includes(url)) {
        searchSelect.value = url;
    } else {
        searchSelect.value = 'custom';
        customInput.value = url || '';
        customContainer.style.display = 'block';
    }
});

searchSelect.addEventListener('change', () => {
    if (searchSelect.value !== 'custom') {
        api.setSearchEngine(searchSelect.value);
        customContainer.style.display = 'none';
    } else {
        customContainer.style.display = 'block';
        customInput.focus();
    }
});

customInput.addEventListener('blur', () => {
    const val = customInput.value.trim();
    if (val && searchSelect.value === 'custom') api.setSearchEngine(val);
});

// Default search type (web / images / video / news / maps)
const searchTypeSelect = document.getElementById('search-type-select');
if (searchTypeSelect && api.getSearchType) {
    api.getSearchType().then(t => { searchTypeSelect.value = t || 'web'; }).catch(() => {});
    searchTypeSelect.addEventListener('change', () => {
        if (api.setSearchType) api.setSearchType(searchTypeSelect.value);
    });
}

// Onion search engines while Tor is active
const searchOnionMaps = document.getElementById('searchOnionMaps');
if (searchOnionMaps && api.getSearchOnionMaps) {
    api.getSearchOnionMaps().then(on => { searchOnionMaps.checked = on !== false; }).catch(() => {});
    searchOnionMaps.addEventListener('change', () => {
        if (api.setSearchOnionMaps) api.setSearchOnionMaps(searchOnionMaps.checked);
    });
}

// Startup logic
const startupSelect = document.getElementById('startup-select');

api.getSaveTabs().then(val => {
    startupSelect.value = val ? "true" : "false";
});

startupSelect.addEventListener('change', () => {
    api.setSaveTabs(startupSelect.value === "true");
});

const internalSelect = document.getElementById('internal-select');

api.getSaveInternalPages().then(val => {
    internalSelect.value = val ? "true" : "false";
});

internalSelect.addEventListener('change', () => {
    api.setSaveInternalPages(internalSelect.value === "true");
});

// Theme customization
const themeSelect = document.getElementById('theme-select');

// Theme + auto theme
function autoThemeResolve(theme) {
    if (theme !== 'auto') return theme;
    var dayInput = document.getElementById('auto-theme-day');
    var nightInput = document.getElementById('auto-theme-night');
    var dayStart = dayInput ? dayInput.value : '07:00';
    var nightStart = nightInput ? nightInput.value : '20:00';
    var now = new Date();
    var minutes = now.getHours() * 60 + now.getMinutes();
    function parseTime(t) { var p = t.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1] || 0); }
    var dayMin = parseTime(dayStart);
    var nightMin = parseTime(nightStart);
    return (minutes >= dayMin && minutes < nightMin) ? 'light' : 'dark';
}

var autoThemeTimes = document.getElementById('auto-theme-times');
api.getTheme().then(val => {
    themeSelect.value = val || 'system';
    if (autoThemeTimes) autoThemeTimes.style.display = (themeSelect.value === 'auto') ? '' : 'none';
    applyTheme(themeSelect.value);
});

themeSelect.addEventListener('change', () => {
    const newTheme = themeSelect.value;
    if (autoThemeTimes) autoThemeTimes.style.display = (newTheme === 'auto') ? '' : 'none';
    api.setTheme(newTheme);
    applyTheme(newTheme);
});

var autoDayInput = document.getElementById('auto-theme-day');
var autoNightInput = document.getElementById('auto-theme-night');
if (autoDayInput) autoDayInput.addEventListener('change', function() {
    if (themeSelect.value === 'auto') applyTheme('auto');
});
if (autoNightInput) autoNightInput.addEventListener('change', function() {
    if (themeSelect.value === 'auto') applyTheme('auto');
});

// Check auto theme every 5 minutes
setInterval(function() {
    if (themeSelect.value === 'auto') applyTheme('auto');
}, 300000);

// Language selector
(function() {
    var langSelect = document.getElementById('languageSelect');
    if (!langSelect) return;
    // Populate from the main process: every locales/<code>.json is a language.
    // New languages appear here automatically; the hardcoded EN/RU options
    // above stay as a fallback if the IPC is unavailable.
    if (window.electronAPI && window.electronAPI.getAvailableLanguages) {
        window.electronAPI.getAvailableLanguages().then(function(list) {
            if (!Array.isArray(list) || !list.length) return;
            langSelect.innerHTML = '';
            list.forEach(function(l) {
                var opt = document.createElement('option');
                opt.value = l.code;
                opt.textContent = l.name;
                langSelect.appendChild(opt);
            });
            if (window.electronAPI.getLanguage) {
                window.electronAPI.getLanguage().then(function(lang) {
                    langSelect.value = lang || 'en';
                });
            }
        }).catch(function() {});
    }
    if (window.electronAPI && window.electronAPI.getLanguage) {
        window.electronAPI.getLanguage().then(function(lang) {
            langSelect.value = lang || 'en';
        });
    }
    langSelect.addEventListener('change', function() {
        if (window.electronAPI && window.electronAPI.setLanguage) {
            window.electronAPI.setLanguage(langSelect.value);
        }
    });
    if (window.electronAPI && window.electronAPI.onLanguageChanged) {
        window.electronAPI.onLanguageChanged(function(lang) {
            if (lang) langSelect.value = lang;
        });
    }
})();

const opacitySlider = document.getElementById('opacity-slider');
const opacityValue = document.getElementById('opacity-value');

api.getWindowOpacity().then(val => {
    const pct = Math.round((val !== undefined ? val : 1) * 100);
    opacitySlider.value = pct;
    opacityValue.textContent = pct;
});

opacitySlider.addEventListener('input', () => {
    const pct = parseInt(opacitySlider.value);
    opacityValue.textContent = pct;
    api.setWindowOpacity(pct / 100);
});

// Frosted glass mode — Auto / Off / Always. Stored as a string so the
// "auto" detection (per-page brightness) can be distinguished from a hard
// on/off decision.
(function() {
    const sel = document.getElementById('translucentModeSelect');
    if (!sel) return;
    // Back-compat: previously a boolean translucentMode was stored. true → 'always'.
    if (api.getTranslucentMode) {
        api.getTranslucentMode().then(function(val) {
            if (val === 'auto' || val === 'off' || val === 'always') sel.value = val;
            else if (val === true) sel.value = 'always';
            else sel.value = 'auto'; // default
        });
    }
    sel.addEventListener('change', () => {
        if (api.setTranslucentMode) api.setTranslucentMode(sel.value);
    });
})();

// ==================== CUSTOMIZATION ====================

document.querySelectorAll('.cust-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.cust-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.getAttribute('data-cust-tab');
        document.querySelectorAll('.cust-tab-content').forEach(c => c.style.display = 'none');
        const target = document.getElementById('cust-tab-' + tab);
        if (target) target.style.display = '';
    });
});

// Background gradients
const gradients = {
    purple: { dark: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', light: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)' },
    blue: { dark: 'linear-gradient(135deg, #2196F3 0%, #1565C0 100%)', light: 'linear-gradient(135deg, #bbdefb 0%, #90caf9 100%)' },
    green: { dark: 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)', light: 'linear-gradient(135deg, #c8e6c9 0%, #a5d6a7 100%)' },
    orange: { dark: 'linear-gradient(135deg, #FF9800 0%, #F57C00 100%)', light: 'linear-gradient(135deg, #ffe0b2 0%, #ffcc80 100%)' },
    pink: { dark: 'linear-gradient(135deg, #E91E63 0%, #C2185B 100%)', light: 'linear-gradient(135deg, #f8bbd9 0%, #f48fb1 100%)' },
    red: { dark: 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)', light: 'linear-gradient(135deg, #ffcdd2 0%, #ef9a9a 100%)' },
    gray: { dark: 'linear-gradient(135deg, #424242 0%, #212121 100%)', light: 'linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)' }
};

// Accent colors
const accentColors = {
    purple: { primary: '#667eea', secondary: '#764ba2', gradient: 'linear-gradient(135deg, #667eea, #764ba2)' },
    blue: { primary: '#2196F3', secondary: '#1976D2', gradient: 'linear-gradient(135deg, #2196F3, #1976D2)' },
    green: { primary: '#4CAF50', secondary: '#45a049', gradient: 'linear-gradient(135deg, #4CAF50, #45a049)' },
    red: { primary: '#f44336', secondary: '#d32f2f', gradient: 'linear-gradient(135deg, #f44336, #d32f2f)' },
    orange: { primary: '#FF9800', secondary: '#F57C00', gradient: 'linear-gradient(135deg, #FF9800, #F57C00)' }
};

// Font sizes
const fontSizes = {
    12: '12px',
    14: '14px',
    16: '16px',
    18: '18px'
};

// Tab heights
const tabHeights = {
    compact: '32px',
    normal: '40px',
    large: '48px'
};

// Panel opacity
const opacitySettings = {
    opaque: { sidebar: 1, card: 1, overlay: 0 },
    low: { sidebar: 0.85, card: 0.85, overlay: 0.2 },
    medium: { sidebar: 0.65, card: 0.7, overlay: 0.48 },
    high: { sidebar: 0.45, card: 0.5, overlay: 0.7 }
};

// Load saved customization settings
async function loadCustomizationSettings() {
    console.log('🎨 [CUSTOMIZATION] Loading settings...');
    try {
        const result = await api.getCustomizationSettings();
        console.log('🎨 [CUSTOMIZATION] Settings received:', result);

        if (!result || !result.success) {
            console.warn('🎨 [CUSTOMIZATION] Failed to load settings');
            return;
        }

        const settings = result.settings || {};
        console.log('🎨 [CUSTOMIZATION] Settings:', settings);

        // Background gradient. Default = 'mainpage' (sync with home page wallpaper),
        // so the Settings page always mirrors the MainPage background unless the user
        // explicitly picks a fixed gradient or a custom image.
        const bgSelect = document.getElementById('background-gradient-select');
        if (bgSelect) {
            // Coalesce empty/null/undefined → 'mainpage'. Never persist this default
            // here (it is applied on the fly); it is only saved when the user picks
            // something in the dropdown.
            const gradient = settings.backgroundGradient || 'mainpage';
            console.log('🎨 [CUSTOMIZATION] Setting gradient:', gradient);
            bgSelect.value = gradient;
            applyBackgroundGradient(gradient);

            // Show custom background section if "custom" is selected
            if (gradient === 'custom') {
                showCustomBackgroundSection();
                if (settings.customBackgroundImage) {
                    applyCustomBackground(settings.customBackgroundImage);
                }
            }
        }

        // Accent color
        if (settings.accentColor) {
            console.log('🎨 [CUSTOMIZATION] Setting accent color:', settings.accentColor);
            applyAccentColor(settings.accentColor);
            updateAccentColorButtons(settings.accentColor);
        }

        // Font size
        const fontSizeSelect = document.getElementById('font-size-select');
        if (fontSizeSelect && settings.fontSize) {
            console.log('🎨 [CUSTOMIZATION] Setting font size:', settings.fontSize);
            fontSizeSelect.value = settings.fontSize;
            applyFontSize(settings.fontSize);
        }

        // Tab height
        const tabHeightSelect = document.getElementById('tab-height-select');
        if (tabHeightSelect && settings.tabHeight) {
            console.log('🎨 [CUSTOMIZATION] Setting tab height:', settings.tabHeight);
            tabHeightSelect.value = settings.tabHeight;
        }

        // Window button style
        const winControlsSelect = document.getElementById('window-controls-select');
        if (winControlsSelect && settings.windowControls) {
            winControlsSelect.value = settings.windowControls;
        }

        // Opacity
        const opacitySelect = document.getElementById('panel-opacity-select');
        if (opacitySelect && settings.panelOpacity) {
            console.log('🎨 [CUSTOMIZATION] Setting opacity:', settings.panelOpacity);
            opacitySelect.value = settings.panelOpacity;
            applyPanelOpacity(settings.panelOpacity);
        }

        console.log('[CUSTOMIZATION] Settings applied successfully');
    } catch (error) {
        console.error('[CUSTOMIZATION] Error loading settings:', error);
    }
}

// Applying background gradient
// Start-page wallpaper: same sync as Library.html — the wallpaper set on the
// start page is applied here too (slightly muted through the overlay, i.e.
// WITHOUT the no-overlay class), and updates live via onCustomizationUpdated.
function applyStartPageWallpaper(s) {
    s = s || {};
    if (!s.mainPageBackground) return false;
    document.documentElement.style.setProperty('--custom-bg', s.mainPageBackground);
    if (s.mainPageBackgroundSize) document.documentElement.style.setProperty('--custom-bg-size', s.mainPageBackgroundSize);
    if (s.mainPageBackgroundPosition) document.documentElement.style.setProperty('--custom-bg-pos', s.mainPageBackgroundPosition);
    if (s.mainPageBackgroundRepeat) document.documentElement.style.setProperty('--custom-bg-repeat', s.mainPageBackgroundRepeat);
    if (s.mainPageBackgroundAttachment) document.documentElement.style.setProperty('--custom-bg-attach', s.mainPageBackgroundAttachment);
    document.body.classList.add('custom-bg');
    document.body.classList.remove('no-overlay');
    return true;
}
(function initWallpaperSync() {
    if (!window.electronAPI || !window.electronAPI.getCustomizationSettings) return;
    window.electronAPI.getCustomizationSettings().then(function (r) {
        if (r && r.settings) applyStartPageWallpaper(r.settings);
    }).catch(function () {});
    if (window.electronAPI.onCustomizationUpdated) {
        window.electronAPI.onCustomizationUpdated(function (settings) {
            if (settings && settings.mainPageBackground) applyStartPageWallpaper(settings);
            else document.body.classList.remove('custom-bg');
        });
    }
})();

function applyBackgroundGradient(gradientName) {
    if (gradientName === 'custom') {
        console.log('🎨 [CUSTOMIZATION] Cannot apply custom via this function, use applyCustomBackground');
        return;
    }

    if (gradientName === 'mainpage') {
        api.getCustomizationSettings().then(function(result) {
            var s = (result && result.settings) || {};
            applyStartPageWallpaper(s);
        });
        return;
    }

    var isDark = document.body.classList.contains('theme-dark') ||
                   (!document.body.classList.contains('theme-light') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var gradient = gradients[gradientName] && gradients[gradientName][isDark ? 'dark' : 'light'] || gradients.purple[isDark ? 'dark' : 'light'];
    // The synced start-page wallpaper (custom-bg) always wins over fixed
    // gradients — Settings must look exactly like Library and the start page.
    if (document.body.classList.contains('custom-bg')) return;

    console.log('🎨 [CUSTOMIZATION] Applying gradient:', gradientName, isDark ? '(dark theme)' : '(light theme)');
    document.body.style.setProperty('--body-bg-image', gradient, 'important');
    document.body.classList.add('no-overlay');
    console.log('[CUSTOMIZATION] Gradient applied');
}

// Applying accent color
function applyAccentColor(colorName) {
    const color = accentColors[colorName] || accentColors.purple;
    console.log('🎨 [CUSTOMIZATION] Applying accent color:', colorName);
    document.body.style.setProperty('--accent-color', color.primary, 'important');
    document.body.style.setProperty('--accent-secondary', color.secondary, 'important');
    document.body.style.setProperty('--accent-gradient', color.gradient, 'important');
    console.log('[CUSTOMIZATION] Accent color applied');
}

// Updating accent color buttons
function updateAccentColorButtons(activeColor) {
    console.log('🎨 [CUSTOMIZATION] Updating accent color buttons, active:', activeColor);
    document.querySelectorAll('.accent-color-btn').forEach(btn => {
        const color = btn.dataset.color;
        if (color === activeColor) {
            btn.style.borderColor = '#fff';
            btn.style.boxShadow = '0 0 0 3px ' + accentColors[color].primary;
        } else {
            btn.style.borderColor = 'transparent';
            btn.style.boxShadow = 'none';
        }
    });
}

// Applying font size
function applyFontSize(size) {
    const fontSize = fontSizes[size] || fontSizes['14'];
    console.log('🎨 [CUSTOMIZATION] Applying font size:', size, '→', fontSize);
    document.documentElement.style.setProperty('--base-font-size', fontSize);
    document.body.style.fontSize = fontSize;
    console.log('[CUSTOMIZATION] Font size applied');
}

// Applying panel opacity
function applyPanelOpacity(opacityLevel) {
    const opacity = opacitySettings[opacityLevel] || opacitySettings.medium;
    console.log('🎨 [CUSTOMIZATION] Applying opacity:', opacityLevel, opacity);
    document.body.style.setProperty('--sidebar-opacity', opacity.sidebar, 'important');
    document.body.style.setProperty('--card-opacity', opacity.card, 'important');
    document.body.style.setProperty('--overlay-opacity', opacity.overlay, 'important');
    console.log('[CUSTOMIZATION] Opacity applied');
}

// Saving customization settings
async function saveCustomizationSettings(settings) {
    try {
        console.log('🎨 [CUSTOMIZATION] Saving settings:', settings);
        const result = await api.saveCustomizationSettings(settings);
        if (result && result.success) {
            console.log('[CUSTOMIZATION] Settings saved');
        } else {
            console.error('[CUSTOMIZATION] Error saving:', result);
        }
    } catch (error) {
        console.error('[CUSTOMIZATION] Error saving customization settings:', error);
    }
}

// Background gradient change handler
const bgGradientSelect = document.getElementById('background-gradient-select');
if (bgGradientSelect) {
    bgGradientSelect.addEventListener('change', async () => {
        const gradient = bgGradientSelect.value;
        console.log('🎨 [CUSTOMIZATION] Selected gradient:', gradient);

        if (gradient === 'custom') {
            console.log('🎨 [CUSTOMIZATION] Showing custom background section');
            showCustomBackgroundSection();
        } else {
            hideCustomBackgroundSection();
            applyBackgroundGradient(gradient);
            await saveCustomizationSettings({ backgroundGradient: gradient });
        }
    });
}

// Live sync: when the wallpaper changes on MainPage (or anywhere that fires
// customization-updated), re-apply the background — but ONLY if Settings is in
// "Sync with home page" mode. Fixed gradients and custom images are left alone
// (those are the "set separately" path).
if (api && typeof api.onCustomizationUpdated === 'function') {
    api.onCustomizationUpdated(function (s) {
        try {
            var sel = bgGradientSelect ? bgGradientSelect.value : '';
            // The effective mode is the saved value OR 'mainpage' when unset.
            var mode = (s && s.backgroundGradient) ? s.backgroundGradient : 'mainpage';
            if (mode === 'mainpage' && (sel === 'mainpage' || sel === '')) {
                applyBackgroundGradient('mainpage');
            }
        } catch (e) {}
    });
}

// ==================== CUSTOM IMAGES ====================

function showCustomBackgroundSection() {
    const section = document.getElementById('custom-background-section');
    if (section) {
        section.style.display = 'block';
        console.log('🎨 [CUSTOMIZATION] Custom background section shown');
    }
}

function hideCustomBackgroundSection() {
    const section = document.getElementById('custom-background-section');
    if (section) {
        section.style.display = 'none';
        console.log('🎨 [CUSTOMIZATION] Custom background section hidden');
    }
}

function applyCustomBackground(imageData) {
    try {
        console.log('🎨 [CUSTOMIZATION] Applying custom background');
        // Quote the URL — otherwise a space in the path (e.g. ".../StartPOZI Browser/...")
        // breaks CSS tokenisation and the background silently fails to apply.
        document.body.style.setProperty('--body-bg-image', `url("${imageData}")`, 'important');
        // Remove overlay so the image is bright
        document.body.classList.add('no-overlay');

        // Show preview
        const preview = document.getElementById('custom-background-preview');
        if (preview) {
            preview.style.backgroundImage = `url("${imageData}")`;
            preview.style.display = 'block';
        }

        console.log('[CUSTOMIZATION] Custom background applied');
    } catch (error) {
        console.error('[CUSTOMIZATION] Error applying custom background:', error);
    }
}

// File selection handler
const customBgInput = document.getElementById('custom-background-input');
if (customBgInput) {
    customBgInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            console.log('🎨 [CUSTOMIZATION] Selected file:', file.name, file.size, 'bytes');

            const reader = new FileReader();
            reader.onload = (event) => {
                const imageData = event.target.result;
                console.log('🎨 [CUSTOMIZATION] File read, size:', imageData.length, 'symbols');

                // Show preview
                const preview = document.getElementById('custom-background-preview');
                if (preview) {
                    preview.style.backgroundImage = `url("${imageData}")`;
                    preview.style.display = 'block';
                }

                // Save to temporary storage
                customBgInput.dataset.imageData = imageData;
            };
            reader.readAsDataURL(file);
        }
    });
}

// Custom background apply handler
const applyCustomBgBtn = document.getElementById('apply-custom-background');
if (applyCustomBgBtn) {
    applyCustomBgBtn.addEventListener('click', async () => {
        const imageData = customBgInput?.dataset.imageData;
        if (imageData) {
            console.log('🎨 [CUSTOMIZATION] Applying custom background...');
            applyCustomBackground(imageData);
            await saveCustomizationSettings({
                backgroundGradient: 'custom',
                customBackgroundImage: imageData
            });
            showToast('Custom background applied', 'success');
        } else {
            showToast('First select an image', 'warning');
        }
    });
}

// Custom background remove handler
const removeCustomBgBtn = document.getElementById('remove-custom-background');
if (removeCustomBgBtn) {
    removeCustomBgBtn.addEventListener('click', async () => {
        console.log('🎨 [CUSTOMIZATION] Removing custom background');
        const preview = document.getElementById('custom-background-preview');
        if (preview) preview.style.display = 'none';

        if (customBgInput) {
            customBgInput.value = '';
            delete customBgInput.dataset.imageData;
        }

        // Restore default gradient
        if (bgGradientSelect) bgGradientSelect.value = 'purple';
        applyBackgroundGradient('purple');

        await saveCustomizationSettings({
            backgroundGradient: 'purple',
            customBackgroundImage: null
        });

        hideCustomBackgroundSection();
        showToast('Custom background removed', 'success');
    });
}

// Accent color button handlers
document.querySelectorAll('.accent-color-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const color = btn.dataset.color;
        console.log('🎨 [CUSTOMIZATION] Accent color button clicked:', color);
        applyAccentColor(color);
        updateAccentColorButtons(color);
        await saveCustomizationSettings({ accentColor: color });
    });
});

// Font size change handler
const fontSizeSelect = document.getElementById('font-size-select');
if (fontSizeSelect) {
    fontSizeSelect.addEventListener('change', async () => {
        const size = fontSizeSelect.value;
        console.log('🎨 [CUSTOMIZATION] Font size changed:', size);
        applyFontSize(size);
        await saveCustomizationSettings({ fontSize: size });
    });
}

// Tab height change handler
const tabHeightSelect = document.getElementById('tab-height-select');
if (tabHeightSelect) {
    tabHeightSelect.addEventListener('change', async () => {
        const height = tabHeightSelect.value;
        console.log('🎨 [CUSTOMIZATION] Tab height changed:', height);
        await saveCustomizationSettings({ tabHeight: height });
    });
}

// Window button style change handler
const winControlsSelect = document.getElementById('window-controls-select');
if (winControlsSelect) {
    winControlsSelect.addEventListener('change', async () => {
        const style = winControlsSelect.value;
        await saveCustomizationSettings({ windowControls: style });
    });
}

// Tab layout change handler
(function() {
    var radios = document.querySelectorAll('input[name="tabLayout"]');
    var optH = document.getElementById('tabLayoutH');
    var optV = document.getElementById('tabLayoutV');

    function updateLayoutUI(val) {
        if (optH) optH.classList.toggle('active', val === 'horizontal');
        if (optV) optV.classList.toggle('active', val === 'vertical');
    }

    radios.forEach(function(r) {
        r.addEventListener('change', function() {
            var val = this.value;
            updateLayoutUI(val);
            saveCustomizationSettings({ tabLayout: val });
        });
    });

    if (window.electronAPI && window.electronAPI.getCustomizationSettings) {
        window.electronAPI.getCustomizationSettings().then(function(r) {
            if (r && r.settings && r.settings.tabLayout) {
                var val = r.settings.tabLayout;
                radios.forEach(function(r) { r.checked = (r.value === val); });
                updateLayoutUI(val);
            } else {
                updateLayoutUI('horizontal');
            }
        });
    } else {
        updateLayoutUI('horizontal');
    }
})();

// Vertical tab width change handler
(function() {
    var sel = document.getElementById('tab-vertical-width-select');
    if (!sel) return;
    var customW = null; // currently applied non-preset width, if any

    function customLabel(w) {
        var t = function(s) { return (window.i18n && window.i18n.t(s)) || s; };
        return t('Custom width') + ' (' + w + ' ' + t('px') + ')';
    }
    // Select the matching preset, or show a "Custom width (N px)" pseudo-entry
    // when the bar was resized manually and no preset fits (an empty select
    // would otherwise be displayed).
    function applyWidth(w) {
        if (!w) return;
        var known = Array.prototype.some.call(sel.options, function(o) {
            return o.value !== 'custom' && parseInt(o.value, 10) === w;
        });
        var opt = sel.querySelector('option[value="custom"]');
        if (known) {
            if (opt) opt.remove();
            customW = null;
            sel.value = String(w);
        } else {
            customW = w;
            if (!opt) { opt = document.createElement('option'); opt.value = 'custom'; sel.appendChild(opt); }
            opt.textContent = customLabel(w);
            sel.value = 'custom';
        }
    }
    sel.addEventListener('change', function() {
        if (sel.value === 'custom') return; // informational entry, not a preset
        saveCustomizationSettings({ verticalTabWidth: parseInt(sel.value, 10) });
    });
    if (window.electronAPI && window.electronAPI.getCustomizationSettings) {
        window.electronAPI.getCustomizationSettings().then(function(r) {
            if (r && r.settings && r.settings.verticalTabWidth) {
                applyWidth(parseInt(r.settings.verticalTabWidth, 10));
            }
        });
    }
    // The bar can also be resized by dragging it in the main window — keep
    // the select in sync live.
    if (window.electronAPI && window.electronAPI.onCustomizationUpdated) {
        window.electronAPI.onCustomizationUpdated(function(s) {
            if (s && s.verticalTabWidth) applyWidth(parseInt(s.verticalTabWidth, 10));
        });
    }
    // Re-label the pseudo-entry when the UI language changes.
    document.addEventListener('i18nlanguagechange', function() {
        if (customW !== null) {
            var opt = sel.querySelector('option[value="custom"]');
            if (opt) opt.textContent = customLabel(customW);
        }
    });
})();

// Auto-hide top bar toggle
(function() {
    var el = document.getElementById('optAutohideTopbar');
    if (!el) return;
    if (window.electronAPI && window.electronAPI.getCustomizationSettings) {
        window.electronAPI.getCustomizationSettings().then(function(r) {
            var s = (r && r.settings) || {};
            el.checked = !!s.autohideTopbar;
        });
    }
    el.addEventListener('change', async function() {
        try {
            await saveCustomizationSettings({ autohideTopbar: el.checked });
        } catch(e) {}
    });
})();

// Opacity change handler
const opacitySelect = document.getElementById('panel-opacity-select');
if (opacitySelect) {
    opacitySelect.addEventListener('change', async () => {
        const opacity = opacitySelect.value;
        console.log('🎨 [CUSTOMIZATION] Opacity changed:', opacity);
        applyPanelOpacity(opacity);
        await saveCustomizationSettings({ panelOpacity: opacity });
    });
}

// Unified Command Bar toggle
(function() {
    var el = document.getElementById('optUnifiedBar');
    if (!el) return;
    if (window.electronAPI && window.electronAPI.getCustomizationSettings) {
        window.electronAPI.getCustomizationSettings().then(function(r) {
            var s = (r && r.settings) || {};
            el.checked = !!s.unifiedBar;
        });
    }
    el.addEventListener('change', async function() {
        try {
            await saveCustomizationSettings({ unifiedBar: el.checked });
        } catch(e) {}
    });
})();

// "Show domain only" address bar toggle (default ON)
(function() {
    var el = document.getElementById('optUrlDomainOnly');
    if (!el) return;
    if (window.electronAPI && window.electronAPI.getCustomizationSettings) {
        window.electronAPI.getCustomizationSettings().then(function(r) {
            var s = (r && r.settings) || {};
            if (typeof s.urlDomainOnly !== 'undefined') el.checked = !!s.urlDomainOnly;
        });
    }
    el.addEventListener('change', async function() {
        try {
            await saveCustomizationSettings({ urlDomainOnly: el.checked });
        } catch(e) {}
    });
})();

// "Tab hover preview" toggle (default ON)
(function() {
    var el = document.getElementById('optTabPreviews');
    if (!el) return;
    if (window.electronAPI && window.electronAPI.getCustomizationSettings) {
        window.electronAPI.getCustomizationSettings().then(function(r) {
            var s = (r && r.settings) || {};
            if (typeof s.tabPreviews !== 'undefined') el.checked = !!s.tabPreviews;
        });
    }
    el.addEventListener('change', async function() {
        try {
            await saveCustomizationSettings({ tabPreviews: el.checked });
        } catch(e) {}
    });
})();

// Reset all settings handler
const resetBtn = document.getElementById('reset-customization');
if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
        if (await customConfirm('Reset all customization settings to default values?')) {
            // Reset all selects
            if (bgGradientSelect) bgGradientSelect.value = 'purple';
            if (fontSizeSelect) fontSizeSelect.value = '14';
            if (tabHeightSelect) tabHeightSelect.value = 'normal';
            if (winControlsSelect) winControlsSelect.value = 'macos';
            if (opacitySelect) opacitySelect.value = 'medium';

            // Apply default values
            applyBackgroundGradient('purple');
            applyAccentColor('purple');
            updateAccentColorButtons('purple');
            applyFontSize('14');
            applyPanelOpacity('medium');

            // Save empty settings (reset)
            await saveCustomizationSettings({});

            showToast('Settings reset', 'success');
        }
    });
}

// Load settings on startup
loadCustomizationSettings();

// ==================== TOOLBAR BUTTONS (Firefox-style) ====================

let currentToolbarButtons = [];
let availableButtonsConfig = {};

// Open customization modal
document.getElementById('open-toolbar-customization').addEventListener('click', async () => {
    if (window.electronAPI && window.electronAPI.openUrlFromSettings) {
        window.electronAPI.openUrlFromSettings('startpozi://customize-toolbar');
    }
});

// Open the in-shell hamburger menu customize mode (same flow as above)
document.getElementById('open-menu-customization').addEventListener('click', async () => {
    if (window.electronAPI && window.electronAPI.openUrlFromSettings) {
        window.electronAPI.openUrlFromSettings('startpozi://customize-menu');
    }
});

// Close modal
document.getElementById('close-toolbar-customization').addEventListener('click', () => {
    const modal = document.getElementById('toolbar-customization-modal');
    if (modal) {
        modal.style.display = 'none';
    }
});

// Render customization modal
function renderToolbarCustomization() {
    const toolbarPreview = document.getElementById('toolbar-preview');
    const availablePool = document.getElementById('available-buttons-pool');

    if (!toolbarPreview || !availablePool) return;

    // Clear containers
    toolbarPreview.innerHTML = '';
    availablePool.innerHTML = '';

    // Set up containers for drag & drop
    setupContainerDropZone(toolbarPreview, 'toolbar');
    setupContainerDropZone(availablePool, 'pool');

    // Display buttons on the toolbar
    currentToolbarButtons.forEach(buttonId => {
        const config = availableButtonsConfig[buttonId];
        if (!config) return;

        const buttonEl = createDraggableButton(buttonId, config, 'toolbar');
        toolbarPreview.appendChild(buttonEl);
    });

    // Display available buttons
    Object.keys(availableButtonsConfig).forEach(buttonId => {
        if (!currentToolbarButtons.includes(buttonId)) {
            const config = availableButtonsConfig[buttonId];
            const buttonEl = createDraggableButton(buttonId, config, 'pool');
            availablePool.appendChild(buttonEl);
        }
    });
}

// Set up container as drop zone
function setupContainerDropZone(container, location) {
    // Allow drop on container
    container.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        container.classList.add('drag-over');
    };

    container.ondragleave = (e) => {
        // Check that we left the container (not moved to a child element)
        if (!container.contains(e.relatedTarget)) {
            container.classList.remove('drag-over');
        }
    };

    container.ondrop = (e) => {
        e.preventDefault();
        container.classList.remove('drag-over');

        try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            console.log('📥 Drop on container:', data, '→', location);

            // If dragging to another container
            if (data.location !== location) {
                moveButtonBetweenContainers(data.buttonId, data.location, null, location);
            }
        } catch (error) {
            console.error('Error dropping on container:', error);
        }
    };
}

// Create draggable button
function createDraggableButton(buttonId, config, location) {
    const button = document.createElement('div');
    button.className = 'toolbar-draggable-btn';
    button.dataset.buttonId = buttonId;
    button.dataset.location = location;
    button.draggable = true;

    const isOnToolbar = location === 'toolbar';
    button.style.cssText = `
        padding: ${isOnToolbar ? '8px 12px' : '10px 14px'};
        background: ${isOnToolbar ? 'var(--accent-gradient, linear-gradient(135deg, #667eea, #764ba2))' : 'rgba(128,128,128,0.3)'};
        color: white;
        border-radius: 8px;
        cursor: grab;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 500;
        transition: all 0.2s;
        user-select: none;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    `;

    button.innerHTML = `${config.icon} ${config.name}`;

    // Drag and drop events
    button.ondragstart = (e) => {
        console.log('🎯 dragstart:', buttonId);
        e.dataTransfer.setData('text/plain', JSON.stringify({buttonId, location}));
        e.dataTransfer.effectAllowed = 'move';
        button.classList.add('dragging');
    };

    button.ondragend = (e) => {
        console.log('🏁 dragend:', buttonId);
        button.classList.remove('dragging');
        button.style.transform = '';
    };

    button.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    button.ondragleave = () => {
        // Do nothing - CSS classes control everything
    };

    button.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            console.log('📥 drop on button:', data.buttonId, '→', buttonId);
            if (data.buttonId === buttonId) return;

            // Move button
            moveButtonBetweenContainers(data.buttonId, data.location, buttonId, location);
        } catch (error) {
            console.error('Error dropping:', error);
        }
    };

    button.onmouseover = () => {
        button.style.filter = 'brightness(1.2)';
    };

    button.onmouseout = () => {
        button.style.filter = 'brightness(1)';
    };

    // Double-click to move
    button.ondblclick = () => {
        moveButtonBetweenContainers(buttonId, location, null, location === 'toolbar' ? 'pool' : 'toolbar');
    };

    return button;
}

// Move button between containers
function moveButtonBetweenContainers(buttonId, fromLocation, targetId, toLocation) {
    const toolbarPreview = document.getElementById('toolbar-preview');
    const availablePool = document.getElementById('available-buttons-pool');

    const button = toolbarPreview.querySelector(`[data-button-id="${buttonId}"]`) ||
                   availablePool.querySelector(`[data-button-id="${buttonId}"]`);

    if (!button) return;

    if (fromLocation === 'toolbar' && toLocation === 'pool') {
        // Remove from toolbar
        currentToolbarButtons = currentToolbarButtons.filter(id => id !== buttonId);
        button.dataset.location = 'pool';
        button.style.background = 'rgba(128,128,128,0.3)';
        availablePool.appendChild(button);
    } else if (fromLocation === 'pool' && toLocation === 'toolbar') {
        // Add to toolbar
        currentToolbarButtons.push(buttonId);
        button.dataset.location = 'toolbar';
        button.style.background = 'var(--accent-gradient, linear-gradient(135deg, #667eea, #764ba2))';
        button.style.padding = '8px 12px';
        toolbarPreview.appendChild(button);
    } else if (fromLocation === 'toolbar' && toLocation === 'toolbar' && targetId) {
        // Reorder on toolbar
        const targetButton = toolbarPreview.querySelector(`[data-button-id="${targetId}"]`);
        if (targetButton) {
            const fromIndex = currentToolbarButtons.indexOf(buttonId);
            const toIndex = currentToolbarButtons.indexOf(targetId);

            // Update array
            currentToolbarButtons.splice(fromIndex, 1);
            currentToolbarButtons.splice(toIndex, 0, buttonId);

            toolbarPreview.insertBefore(button, targetButton);
        }
    }
}

// Save changes
document.getElementById('save-toolbar-changes').addEventListener('click', async () => {
    console.log('💾 Trying to save buttons:', currentToolbarButtons);

    if (currentToolbarButtons.length === 0) {
        showToast('There must be at least one button on the toolbar', 'error');
        return;
    }

    try {
        console.log('📤 Sending to main process...');
        const result = await window.electronAPI.saveToolbarButtons(currentToolbarButtons);
        console.log('📥 Result from main process:', result);

        if (result.success) {
            showToast('Buttons saved! Browser will restart...', 'success');

            // Close modal
            document.getElementById('toolbar-customization-modal').style.display = 'none';

            // Restart browser (customization mode resets automatically)
            setTimeout(async () => {
                if (window.electronAPI) {
                    try {
                        console.log('🔄 Restarting browser...');
                        await window.electronAPI.restartBrowser();
                    } catch (error) {
                        console.error('Error restarting:', error);
                    }
                }
            }, 1500);
        } else {
            console.error('Error saving (result.success = false):', result.error);
            showToast('Error saving: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Exception while saving buttons:', error);
        showToast('Error saving: ' + error.message, 'error');
        showToast('Error saving buttons', 'error');
    }
});

// Reset to default buttons
document.getElementById('reset-toolbar-default').addEventListener('click', async () => {
    if (!await customConfirm('Reset buttons to default set?')) return;

    try {
        const defaultButtons = ['back', 'forward', 'refresh', 'home', 'bookmarks'];
        const result = await window.electronAPI.saveToolbarButtons(defaultButtons);
        if (result.success) {
            currentToolbarButtons = [...defaultButtons];
            renderToolbarCustomization();
            showToast('Buttons reset', 'success');
        }
    } catch (error) {
        console.error('Error resetting buttons:', error);
        showToast('Error resetting buttons', 'error');
    }
});

// Close on click outside modal
document.getElementById('toolbar-customization-modal').addEventListener('click', (e) => {
    if (e.target.id === 'toolbar-customization-modal') {
        e.target.style.display = 'none';
    }
});

// HTML escaping
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    // Escape quotes too: this helper is also used inside attribute contexts
    // (data-id="…"), where an unescaped " would break out of the attribute.
    return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// =============== FUNCTIONS FOR USER SCRIPTS ===============

async function loadScripts(searchTerm) {
    searchTerm = searchTerm || '';
    try {
        var scripts = await api.getScripts();
        var list = document.getElementById('scripts-list');

        if (!scripts || scripts.length === 0) {
            list.innerHTML = '<div class="plugin-message">No scripts. Click "New script" to create one.</div>';
            return;
        }

        var filtered = scripts.filter(function(s) {
            return (s.name || '').toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1 ||
                   (s.description || '').toLowerCase().indexOf(searchTerm.toLowerCase()) !== -1;
        });

        if (filtered.length === 0) {
            list.innerHTML = '<div class="plugin-message">No scripts found.</div>';
            return;
        }

        list.innerHTML = '';

        filtered.forEach(function(script) {
            var card = document.createElement('div');
            card.className = 'plugin-card ' + (script.enabled ? 'enabled' : 'disabled');
            card.innerHTML =
                '<div class="plugin-icon" style="cursor:default;">' +
                    '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6z"/><polyline points="14 2 14 8 20 8"/></svg>' +
                '</div>' +
                '<div class="plugin-info">' +
                    '<div class="plugin-name">' + escapeHtml(script.name || 'Untitled') + (!script.enabled ? ' <span class="restart-indicator">disabled</span>' : '') + '</div>' +
                    '<div class="plugin-description">' + escapeHtml(script.description || 'No description') + '</div>' +
                    '<div class="plugin-version">' + escapeHtml(script.match || '*://*/*') + ' &middot; ' + escapeHtml(script.runAt || 'document-idle') + (script.runInFrames ? ' +frames' : '') + '</div>' +
                '</div>' +
                '<div class="plugin-actions">' +
                    '<button class="script-edit-btn plugin-settings-btn" data-id="' + script.id + '" title="Edit">✎</button>' +
                    '<label class="plugin-switch">' +
                        '<input type="checkbox" ' + (script.enabled ? 'checked' : '') + ' data-id="' + script.id + '">' +
                        '<span class="slider"></span>' +
                    '</label>' +
                    '<button class="remove-plugin" data-id="' + script.id + '" title="Delete">Delete</button>' +
                '</div>';
            list.appendChild(card);
        });

        document.querySelectorAll('.plugin-switch input').forEach(function(toggle) {
            toggle.addEventListener('change', async function(e) {
                var id = e.target.dataset.id;
                var enabled = e.target.checked;
                try {
                    var result = await api.toggleScript(id, enabled);
                    if (result.success) { showToast(result.message); loadScripts(document.getElementById('scripts-search').value); }
                    else { showToast('Error: ' + result.message); e.target.checked = !enabled; }
                } catch(err) { e.target.checked = !enabled; }
            });
        });

        document.querySelectorAll('.remove-plugin').forEach(function(button) {
            button.addEventListener('click', async function(e) {
                var id = e.target.dataset.id;
                if (await customConfirm('Delete this script?')) {
                    try {
                        var result = await api.deleteScript(id);
                        if (result.success) { showToast(result.message); loadScripts(document.getElementById('scripts-search').value); }
                        else { showToast('Error: ' + result.message); }
                    } catch(err) { showToast('Error deleting'); }
                }
            });
        });

        document.querySelectorAll('.script-edit-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                var id = e.target.dataset.id || e.target.closest('button').dataset.id;
                var script = scripts.find(function(s) { return s.id === id; });
                if (script) openScriptEditor(script);
            });
        });

    } catch (error) {
        document.getElementById('scripts-list').innerHTML = '<div class="plugin-message">Error loading scripts.</div>';
    }
}

function openScriptEditor(script) {
    document.getElementById('script-edit-id').value = script ? script.id : '';
    document.getElementById('script-edit-name').value = script ? (script.name || '') : '';
    document.getElementById('script-edit-desc').value = script ? (script.description || '') : '';
    document.getElementById('script-edit-match').value = script ? (script.match || '') : '*://*/*';
    document.getElementById('script-edit-runat').value = script ? (script.runAt || 'document-idle') : 'document-idle';
    document.getElementById('script-edit-frames').checked = script ? !!script.runInFrames : false;
    document.getElementById('script-edit-code').value = script ? (script.code || '') : '';
    document.getElementById('script-editor-title').textContent = script ? 'Edit script' : 'New script';
    document.getElementById('script-editor-modal').style.display = 'flex';
}

function closeScriptEditor() {
    document.getElementById('script-editor-modal').style.display = 'none';
}

var scriptsSearch = document.getElementById('scripts-search');
if (scriptsSearch) {
    scriptsSearch.addEventListener('input', function(e) { loadScripts(e.target.value); });
}

document.getElementById('add-script').addEventListener('click', function() {
    openScriptEditor(null);
});

document.getElementById('script-editor-cancel').addEventListener('click', closeScriptEditor);

document.getElementById('script-editor-save').addEventListener('click', async function() {
    var id = document.getElementById('script-edit-id').value;
    var data = {
        name: document.getElementById('script-edit-name').value.trim() || 'Untitled',
        description: document.getElementById('script-edit-desc').value.trim(),
        match: document.getElementById('script-edit-match').value.trim() || '*://*/*',
        runAt: document.getElementById('script-edit-runat').value,
        runInFrames: document.getElementById('script-edit-frames').checked,
        code: document.getElementById('script-edit-code').value
    };
    if (id) data.id = id;
    try {
        var result = await api.saveScript(data);
        if (result.success) { showToast(result.message); closeScriptEditor(); loadScripts(); }
        else { showToast('Error: ' + result.message); }
    } catch(err) { showToast('Error saving'); }
});

document.getElementById('script-edit-code').addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
        e.preventDefault();
        var start = this.selectionStart;
        var end = this.selectionEnd;
        this.value = this.value.substring(0, start) + '  ' + this.value.substring(end);
        this.selectionStart = this.selectionEnd = start + 2;
    }
});

// ===== .skit packages gallery =====
(function () {
    var skitApi = window.electronAPI;
    if (!skitApi || !skitApi.skitList) return;
    var gallery = document.getElementById('skit-gallery');
    var emptyMsg = document.getElementById('skit-empty');
    var importBtn = document.getElementById('skit-import-btn');
    var fileInput = document.getElementById('skit-file-input');
    if (!gallery) return;

    var SKIT_ICONS = {
        'dark-reader': '🌙', 'battery-saver': '🔋', 'auto-translate': '🌐',
        'reading-mode': '📖', 'privacy-shield': '🛡️', 'ad-cleaner': '🧹'
    };
    function iconFor(name) {
        var key = String(name || '').toLowerCase().replace(/\s+/g, '-');
        return SKIT_ICONS[key] || '📦';
    }

    async function loadSkits() {
        try {
            var r = await skitApi.skitList();
            var skits = (r && r.skits) || [];
            gallery.innerHTML = '';
            if (!skits.length) {
                gallery.style.display = 'none';
                if (emptyMsg) emptyMsg.style.display = 'block';
                return;
            }
            gallery.style.display = '';
            if (emptyMsg) emptyMsg.style.display = 'none';
            skits.forEach(function (sk) {
                var card = document.createElement('div');
                card.style.cssText = 'background:var(--card-bg);border:1px solid var(--card-border);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:8px;';
                var icon = iconFor(sk.name);
                card.innerHTML =
                    '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">' +
                      '<div style="display:flex;align-items:center;gap:10px;">' +
                        '<span style="font-size:28px;line-height:1;">' + icon + '</span>' +
                        '<div>' +
                          '<div style="font-size:14px;font-weight:600;color:var(--text-color);">' + escapeHtml(sk.name) + '</div>' +
                          '<div style="font-size:11px;color:var(--secondary-text);">' + escapeHtml(sk.author || 'unknown') + ' · v' + escapeHtml(sk.version || '1.0') + ' · .' + escapeHtml(sk.type || 'js') + '</div>' +
                        '</div>' +
                      '</div>' +
                      '<label class="px-toggle-wrap" style="flex-shrink:0;"><input type="checkbox" class="skit-toggle"' + (sk.enabled ? ' checked' : '') + ' data-id="' + escapeHtml(sk.id) + '"><span class="px-toggle-track"></span></label>' +
                    '</div>' +
                    '<div style="font-size:12px;color:var(--secondary-text);line-height:1.5;min-height:32px;">' + escapeHtml(sk.description || '') + '</div>' +
                    '<div style="display:flex;gap:6px;margin-top:auto;">' +
                      '<button class="skit-export px-tor-btn-secondary" data-id="' + escapeHtml(sk.id) + '" style="padding:5px 12px;font-size:11px;">Export</button>' +
                      '<button class="skit-delete px-tor-btn-secondary" data-id="' + escapeHtml(sk.id) + '" style="padding:5px 12px;font-size:11px;color:#ef5350;">Delete</button>' +
                    '</div>';
                gallery.appendChild(card);

                // Wire the card controls HERE, inside the forEach — the old
                // code referenced `card` after the loop, where it is out of
                // scope (ReferenceError swallowed by catch → dead buttons).
                card.querySelectorAll('.skit-toggle').forEach(function (t) {
                    t.addEventListener('change', async function () {
                        await skitApi.skitToggle(t.getAttribute('data-id'), t.checked);
                        showToast(t.checked ? 'Package enabled' : 'Package disabled');
                    });
                });
                card.querySelectorAll('.skit-export').forEach(function (b) {
                    b.addEventListener('click', async function () {
                        var r = await skitApi.skitExport(b.getAttribute('data-id'));
                        if (r && r.success) showToast('Exported: ' + r.path);
                        else if (r && r.error !== 'Cancelled') showToast('Export error: ' + (r.error || ''));
                    });
                });
                card.querySelectorAll('.skit-delete').forEach(function (b) {
                    b.addEventListener('click', async function () {
                        if (await customConfirm('Delete this package?')) {
                            await skitApi.skitDelete(b.getAttribute('data-id'));
                            showToast('Package deleted');
                            loadSkits();
                        }
                    });
                });
            });
        } catch (e) { /* ignore */ }
    }

    if (window._loadSkits) {} // placeholder
    window._loadSkits = loadSkits;

    async function doImport(filePath) {
        try {
            var r = await skitApi.skitImport(filePath);
            if (r && r.success) { showToast('Installed: ' + (r.skit.name || '')); loadSkits(); }
            else { showToast('Import error: ' + ((r && r.error) || '')); }
        } catch(e) { showToast('Import failed'); }
    }

    if (importBtn) importBtn.addEventListener('click', async function () {
        // Use native file picker via IPC, fallback to <input type=file>
        if (skitApi.skitPickFile) {
            var fp = await skitApi.skitPickFile();
            if (fp) doImport(fp);
        } else if (fileInput) {
            fileInput.click();
        }
    });
    if (fileInput) fileInput.addEventListener('change', function () {
        if (this.files && this.files[0]) {
            var reader = new FileReader();
            reader.onload = function () {
                // Write to a temp file via IPC is complex; for webview we pass the path
                // The hidden <input> gives a File object — we cannot get a real path.
                // So we prefer the IPC picker. This is a fallback for environments without it.
                showToast('Use the file dialog (Import .skit) instead');
            };
            reader.readAsArrayBuffer(this.files[0]);
        }
    });

    // Load when scripts tab is opened
    loadSkits();
    // Re-load when navigating to #scripts
    document.querySelectorAll('nav a').forEach(function (a) {
        if (a.getAttribute('href') === '#scripts') {
            a.addEventListener('click', function () { setTimeout(loadSkits, 100); });
        }
    });
})();

// Handler for restart button
document.getElementById('restart-button').addEventListener('click', async () => {
    if (await customConfirm('To apply changes, the browser must be restarted. Restart now?')) {
        restartBrowser();
    }
});


// =============== .THMZ THEME SYSTEM ===============
function initCustomThemeUpload() {
    var api = window.electronAPI;
    if (!api) return;

    var gallery = document.getElementById('thmz-gallery');
    var importBtn = document.getElementById('thmz-import-btn');
    var editorBtn = document.getElementById('thmz-editor-btn');
    var createBtn = document.getElementById('thmz-create-btn');
    var clearBtn = document.getElementById('thmz-clear-btn');
    var createPanel = document.getElementById('thmz-create-panel');
    var createName = document.getElementById('thmz-create-name');
    var createType = document.getElementById('thmz-create-type');
    var createCss = document.getElementById('thmz-create-css');
    var createSave = document.getElementById('thmz-create-save');
    var createCancel = document.getElementById('thmz-create-cancel');

    // Open the full visual theme editor (colors, live preview, custom icons).
    if (editorBtn) {
        editorBtn.addEventListener('click', function () {
            if (api.openUrlFromSettings) api.openUrlFromSettings('about:themeeditor');
        });
    }

    var activeThemeId = null;
    var themeCssCache = {}; // cache CSS per theme id for preview

    // --- Extract CSS variable value ---
    function extractVar(css, varName) {
        if (!css) return null;
        var re = new RegExp('--' + varName + '\\s*:\\s*([^;]+)', 'i');
        var m = css.match(re);
        return m ? m[1].trim() : null;
    }

    // --- Build preview swatches from theme CSS ---
    // Values come from IMPORTED theme files (.thmz) — an attacker-crafted
    // value like  red"><img src=x onerror=...  must never reach a style
    // attribute. Whitelist: hex / rgb(a) / hsl(a) / plain CSS color names.
    function safeThemeColor(v, fallback) {
        if (!v) return fallback;
        if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
        if (/^rgba?\(\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*){2,3}\)$/.test(v)) return v;
        if (/^hsla?\(\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*){2,3}\)$/.test(v)) return v;
        if (/^[a-z]{3,20}$/i.test(v)) return v;
        return fallback;
    }
    function buildPreview(css) {
        var bg = safeThemeColor(extractVar(css, 'bg-color'), '#202020');
        var bg2 = safeThemeColor(extractVar(css, 'bg-secondary'), bg);
        var text = safeThemeColor(extractVar(css, 'text-primary'), '#fff');
        var primary = safeThemeColor(extractVar(css, 'primary-color'), '#1da1f2');
        var border = safeThemeColor(extractVar(css, 'border-color'), '#3d3d3d');
        bg = bg.replace(/var\([^)]+\)/g, '#202020');
        bg2 = bg2.replace(/var\([^)]+\)/g, '#2d2d2d');
        text = text.replace(/var\([^)]+\)/g, '#fff');
        primary = primary.replace(/var\([^)]+\)/g, '#1da1f2');

        var h = '';
        h += '<div style="display:flex;border-radius:8px;overflow:hidden;height:48px;margin-bottom:10px;border:1px solid ' + border + ';">';
        h += '<div style="flex:2;background:' + bg + ';display:flex;align-items:center;justify-content:center;overflow:hidden;">';
        h += '<div style="width:20px;height:20px;border-radius:50%;background:' + primary + ';flex-shrink:0;"></div>';
        h += '</div>';
        h += '<div style="flex:1;background:' + bg2 + ';"></div>';
        h += '<div style="width:6px;background:' + primary + ';"></div>';
        h += '</div>';
        h += '<div style="display:flex;gap:4px;margin-bottom:10px;">';
        h += '<div title="Background" style="flex:1;height:16px;border-radius:4px;background:' + bg + ';border:1px solid rgba(128,128,128,0.2);"></div>';
        h += '<div title="Secondary" style="flex:1;height:16px;border-radius:4px;background:' + bg2 + ';border:1px solid rgba(128,128,128,0.2);"></div>';
        h += '<div title="Primary" style="flex:1;height:16px;border-radius:4px;background:' + primary + ';"></div>';
        h += '<div title="Text" style="flex:1;height:16px;border-radius:4px;background:' + text + ';border:1px solid rgba(128,128,128,0.2);"></div>';
        h += '</div>';
        return h;
    }

    // --- Local CSS injection helper ---
    function applyLocal(css) {
        var el = document.getElementById('custom-theme-local');
        if (!el) { el = document.createElement('style'); el.id = 'custom-theme-local'; document.head.appendChild(el); }
        el.textContent = css;
    }
    function removeLocal() {
        var el = document.getElementById('custom-theme-local');
        if (el) el.remove();
    }

    // --- Gallery rendering ---
    function refreshGallery() {
        api.themeList().then(function(res) {
            if (!res || !res.success || !gallery) return;
            var themes = res.themes || [];
            gallery.innerHTML = '';

            // Preload CSS for previews
            var cssPromises = themes.map(function(t) {
                if (themeCssCache[t.id]) return Promise.resolve();
                return api.themeGetCss(t.id).then(function(css) { themeCssCache[t.id] = css; });
            });

            Promise.all(cssPromises).then(function() {
            return api.themeGetActive();
            }).then(function(aid) {
                activeThemeId = aid;
                clearBtn.style.display = aid ? '' : 'none';

                themes.forEach(function(t) {
                    var card = document.createElement('div');
                    card.style.cssText = 'background:var(--card-bg);border:var(--card-border);border-radius:12px;padding:14px;width:180px;cursor:default;position:relative;transition:transform 0.15s,border-color 0.15s;';
                    var isActive = (t.id === activeThemeId);
                    if (isActive) card.style.borderColor = 'var(--accent-color)';

                    var cssForPreview = themeCssCache[t.id] || '';
                    var previewHtml = cssForPreview ? buildPreview(cssForPreview) : '';

                    card.innerHTML =
                        previewHtml +
                        '<div style="font-weight:600;font-size:14px;color:var(--text-color);margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(t.name) + '</div>' +
                        '<div style="font-size:11px;color:var(--secondary-text);margin-bottom:8px;">' + escapeHtml(t.type || 'auto') + (t.author ? ' · ' + escapeHtml(t.author) : '') + '</div>' +
                        (t.description ? '<div style="font-size:11px;color:var(--secondary-text);margin-bottom:8px;max-height:32px;overflow:hidden;">' + escapeHtml(t.description) + '</div>' : '') +
                        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                        (isActive
                            ? '<button class="thmz-deactivate-btn" data-id="' + escapeHtml(t.id) + '" style="background:rgba(244,67,54,0.12);color:#f44336;border:1px solid rgba(244,67,54,0.3);border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;">Deactivate</button>'
                            : '<button class="thmz-apply-btn" data-id="' + escapeHtml(t.id) + '" style="background:var(--accent-gradient);color:#fff;border:none;border-radius:6px;padding:4px 12px;font-size:12px;cursor:pointer;">Apply</button>'
                        ) +
                        '<button class="thmz-export-btn" data-id="' + escapeHtml(t.id) + '" style="background:var(--btn-bg);color:var(--btn-color);border:var(--btn-border);border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;">Export</button>' +
                        '<button class="thmz-del-btn" data-id="' + escapeHtml(t.id) + '" style="background:rgba(244,67,54,0.15);color:#f44336;border:1px solid rgba(244,67,54,0.3);border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;">Delete</button>' +
                        '</div>';

                    gallery.appendChild(card);
                });

                // Wire apply buttons
                gallery.querySelectorAll('.thmz-apply-btn').forEach(function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var id = btn.getAttribute('data-id');
                        api.themeApply(id).then(function(res) {
                            if (res && res.success) { showToast('Theme applied: ' + (res.name || id)); refreshGallery(); }
                            else showToast('Error: ' + (res && res.error ? res.error : 'unknown'), 'error');
                        });
                    });
                });
                // Wire deactivate buttons
                gallery.querySelectorAll('.thmz-deactivate-btn').forEach(function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        api.themeClear().then(function() {
                            showToast('Theme deactivated');
                            removeLocal();
                            refreshGallery();
                        });
                    });
                });
                gallery.querySelectorAll('.thmz-export-btn').forEach(function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var id = btn.getAttribute('data-id');
                        api.themeExport(id).then(function(res) {
                            if (res && res.success) showToast('Exported to: ' + res.path);
                            else if (res && res.error !== 'Cancelled') showToast('Export error: ' + res.error, 'error');
                        });
                    });
                });
                gallery.querySelectorAll('.thmz-del-btn').forEach(function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        if (btn.dataset.confirming === '1') {
                            var id = btn.getAttribute('data-id');
                            api.themeDelete(id).then(function(res) {
                                if (res && res.success) { showToast('Theme deleted'); refreshGallery(); }
                                else showToast('Error: ' + (res && res.error ? res.error : 'unknown'), 'error');
                            });
                        } else {
                            btn.dataset.confirming = '1';
                            btn.textContent = 'Sure?';
                            btn.style.background = 'rgba(244,67,54,0.35)';
                            setTimeout(function() {
                                if (btn.dataset.confirming === '1') {
                                    btn.dataset.confirming = '0';
                                    btn.textContent = 'Delete';
                                    btn.style.background = '';
                                }
                            }, 3000);
                        }
                    });
                });
            });
        });
    }

    // --- Import ---
    if (importBtn) {
        importBtn.addEventListener('click', function() {
            api.themePickFile().then(function(filePath) {
                if (!filePath) return;
                api.themeImport(filePath).then(function(res) {
                    if (res && res.success) { showToast('Imported: ' + res.theme.name); refreshGallery(); }
                    else showToast('Import error: ' + (res && res.error ? res.error : 'unknown'), 'error');
                });
            });
        });
    }

    // --- Clear ---
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            api.themeClear().then(function() {
                showToast('Reset to default');
                removeLocal();
                refreshGallery();
            });
        });
    }

    // --- Create panel ---
    if (createBtn) {
        createBtn.addEventListener('click', function() {
            createPanel.style.display = createPanel.style.display === 'none' ? '' : 'none';
            if (createPanel.style.display !== 'none') { createName.focus(); updateLivePreview(); }
        });
    }
    if (createCancel) {
        createCancel.addEventListener('click', function() {
            createPanel.style.display = 'none';
        });
    }

    // --- Visual editor: build CSS from color pickers + advanced textarea ---
    function buildCssFromEditor() {
        var vars = {};
        var colorInputs = document.querySelectorAll('#thmz-color-grid input[type="color"]');
        colorInputs.forEach(function(inp) {
            vars[inp.getAttribute('data-var')] = inp.value;
        });
        var css = ':root {\n';
        for (var k in vars) css += '  --' + k + ': ' + vars[k] + ';\n';
        css += '}\n';
        var extra = createCss.value.trim();
        if (extra) css += '\n' + extra;
        return css;
    }

    function updateLivePreview() {
        var previewEl = document.getElementById('thmz-live-preview');
        if (!previewEl) return;
        var css = buildCssFromEditor();
        previewEl.innerHTML = buildPreview(css);
    }

    // Wire color picker changes
    var colorGrid = document.getElementById('thmz-color-grid');
    if (colorGrid) {
        colorGrid.querySelectorAll('input[type="color"]').forEach(function(inp) {
            inp.addEventListener('input', updateLivePreview);
        });
    }
    if (createCss) createCss.addEventListener('input', updateLivePreview);

    if (createSave) {
        createSave.addEventListener('click', function() {
            var name = createName.value.trim();
            if (!name) { showToast('Enter theme name', 'warning'); return; }
            var css = buildCssFromEditor();
            var type = createType.value;
            api.themeCreate(name, css, type).then(function(res) {
                if (res && res.success) {
                    showToast('Created & applied: ' + res.theme.name);
                    createPanel.style.display = 'none';
                    createName.value = ''; createCss.value = '';
                    api.themeApply(res.theme.id).then(function() { refreshGallery(); });
                } else {
                    showToast('Error: ' + (res && res.error ? res.error : 'unknown'), 'error');
                }
            });
        });
    }

    // --- Listen for apply/clear from main (broadcasts) ---
    if (api.onApplyCustomTheme) {
        api.onApplyCustomTheme(function(css) { applyLocal(css); });
    }
    if (api.onClearCustomTheme) {
        api.onClearCustomTheme(function() { removeLocal(); });
    }

    // --- Initial load ---
    refreshGallery();
}

function escapeHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// =============== SYSTEM INTEGRATION ===============

function initSystemIntegration() {
    loadPlatformInfo();

    const registerBtn = document.getElementById('registerSystemBtn');
    const unregisterBtn = document.getElementById('unregisterSystemBtn');
    const checkBtn = document.getElementById('checkRegistrationBtn');
    const instructionsBtn = document.getElementById('showInstructionsBtn');
    const statusBox = document.getElementById('registrationStatus');
    const instructionsBox = document.getElementById('instructionsBox');

    if (registerBtn) {
        registerBtn.addEventListener('click', async () => {
            if (!window.electronAPI) {
                showToast('API unavailable', 'error');
                return;
            }

            try {
                showStatus('Registering...', 'loading');
                const result = await api.registerBrowserInSystem();

                if (result.success) {
                    showStatus(result.message, 'success');
                } else {
                    showStatus(`Error: ${result.message}`, 'error');
                }
            } catch (error) {
                showStatus(`Error: ${error.message}`, 'error');
            }
        });
    }

    if (unregisterBtn) {
        unregisterBtn.addEventListener('click', async () => {
            if (!window.electronAPI) {
                showToast('API unavailable', 'error');
                return;
            }

            if (await customConfirm('Remove browser registration from the system?')) {
                try {
                    showStatus('Removing...', 'loading');
                    const result = await api.unregisterBrowserFromSystem();

                    if (result.success) {
                        showStatus(result.message, 'success');
                    } else {
                        showStatus(`Error: ${result.message}`, 'error');
                    }
                } catch (error) {
                    showStatus(`Error: ${error.message}`, 'error');
                }
            }
        });
    }

    if (checkBtn) {
        checkBtn.addEventListener('click', async () => {
            if (!window.electronAPI) {
                showToast('API unavailable', 'error');
                return;
            }

            try {
                showStatus('Checking...', 'loading');
                const result = await api.checkSystemRegistration();

                if (result.registered) {
                    showStatus(`Browser registered in the system (${result.details.platform})`, 'success');
                } else {
                    showStatus('Browser not registered in the system', 'warning');
                }
            } catch (error) {
                showStatus(`Error: ${error.message}`, 'error');
            }
        });
    }

    if (instructionsBtn) {
        instructionsBtn.addEventListener('click', async () => {
            if (!window.electronAPI) {
                customAlert('API unavailable');
                return;
            }

            try {
                const instructions = await api.getManualInstructions();
                showInstructions(instructions);
            } catch (error) {
                customAlert(`Error: ${error.message}`);
            }
        });
    }

    async function loadPlatformInfo() {
        const infoEl = document.getElementById('platformInfo');
        if (!infoEl || !window.electronAPI) return;

        try {
            const info = await api.getPlatformInfo();
            infoEl.innerHTML = `
                <div><strong>OS:</strong> ${info.platform} (${info.arch})</div>
                <div><strong>Version:</strong> ${info.appVersion}</div>
                <div><strong>Status:</strong> ${info.isPackaged ? 'Installed' : 'Development'}</div>
            `;
        } catch (error) {
            infoEl.innerHTML = 'Failed to load information';
        }
    }

    function showStatus(message, type = 'info') {
        if (!statusBox) return;

        statusBox.className = 'status-box';
        statusBox.classList.remove('hidden');

        const colors = {
            success: '#4CAF50',
            error: '#F44336',
            warning: '#FF9800',
            loading: '#2196F3',
            info: '#9C27B0'
        };

        statusBox.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 10px; height: 10px; border-radius: 50%; background: ${colors[type] || colors.info}"></div>
                <div>${message}</div>
            </div>
        `;

        setTimeout(() => {
            statusBox.classList.add('hidden');
        }, 10000);
    }

    function showInstructions(instructions) {
        if (!instructionsBox) return;

        instructionsBox.className = 'instructions-box';
        instructionsBox.classList.remove('hidden');

        instructionsBox.innerHTML = `
            <h4 style="margin-bottom: 12px; color: var(--text-color);">Instructions for ${instructions.platform}</h4>
            <pre style="color: var(--text-color);">${instructions.instructions.join('\n')}</pre>
            <button data-action="hide-parent" style="margin-top: 10px; padding: 8px 16px; background: var(--btn-bg); border: var(--btn-border); color: var(--btn-color); border-radius: 8px; cursor: pointer;">
                Close
            </button>
        `;
    }
}

// ============== PROXY ==============
(function() {
    var api = window.electronAPI;
    if (!api || !api.getProxySettings) return;

    function $(id) { return document.getElementById(id); }

    function setTorStatus(msg, type) {
        var el = $('pxTorStatus');
        if (!el) return;
        el.textContent = msg;
        el.style.color = type === 'ok' ? '#4caf50' : type === 'error' ? '#ef5350' : type === 'warn' ? '#ff9800' : 'var(--text-secondary)';
    }

    function updateTorButtons(running) {
        var start = $('pxTorStart');
        var stop = $('pxTorStop');
        if (start) start.style.display = running ? 'none' : '';
        if (stop) stop.style.display = running ? '' : 'none';
        setTorStatus(running ? 'Tor is running' : 'Tor is not running', running ? 'ok' : '');
    }

    function applyProxy() {
        var enabled = $('pxToggle').checked;
        var type = $('pxType').value;
        var host = ($('pxHost').value || '').trim();
        var port = ($('pxPort').value || '').trim();
        var bridges = $('pxBridges') ? $('pxBridges').value : '';
        if (enabled && !host) { customAlert('Specify a proxy host'); return; }
        api.setProxySettings({ enabled: enabled, type: type, host: host, port: port, bridges: bridges }).then(function() {
            var st = $('pxStatusText');
            if (st) st.textContent = enabled ? 'Proxy active' : 'Direct connection';
            updateSlider();
            // Tor was auto-detected at startup → .onion DNS already works.
            // Only suggest restart if Tor was NOT running at startup.
            if (enabled) {
                setTimeout(async function() {
                    if (await customConfirm('Proxy applied. For .onion DNS to work, restart the browser (Chromium needs a startup flag). Restart now?')) {
                        if (api && api.restartBrowser) api.restartBrowser();
                    }
                }, 200);
            }
        }).catch(function(e) { customAlert('Error: ' + (e.message || e)); });
    }

    function toggleTorSection() {
        var type = $('pxType').value;
        var torSection = $('pxTorSection');
        // Show Tor controls only for SOCKS5 and Tor types
        var showTor = (type === 'tor' || type === 'socks5');
        if (torSection) torSection.style.display = showTor ? '' : 'none';
        // Update placeholders for Tor type
        if (type === 'tor') {
            var h = $('pxHost'); if (h && !h.value) h.placeholder = '127.0.0.1 (auto-filled by Start Tor)';
            var p = $('pxPort'); if (p && !p.value) p.placeholder = '9050 (auto-filled by Start Tor)';
        } else {
            var h2 = $('pxHost'); if (h2) h2.placeholder = '127.0.0.1';
            var p2 = $('pxPort'); if (p2) p2.placeholder = '8080';
        }
    }

    api.getProxySettings().then(function(s) {
        if (!s) return;
        $('pxToggle').checked = s.enabled;
        $('pxType').value = s.type || 'http';
        $('pxHost').value = s.host || '';
        $('pxPort').value = s.port || '';
        if ($('pxBridges')) $('pxBridges').value = s.bridges || '';
        var st = $('pxStatusText');
        if (st) st.textContent = s.enabled ? 'Proxy active' : 'Direct connection';
        toggleTorSection();
        if (api.torStatus) api.torStatus().then(function(r) { updateTorButtons(r.running); });
    }).catch(function() {});

    $('pxApply').addEventListener('click', applyProxy);
    $('pxReset').addEventListener('click', function() {
        $('pxToggle').checked = false;
        $('pxType').value = 'http';
        $('pxHost').value = '';
        $('pxPort').value = '';
        if ($('pxBridges')) $('pxBridges').value = '';
        toggleTorSection();
        api.setProxySettings({ enabled: false, type: 'http', host: '', port: '', bridges: '' });
    });
    $('pxType').addEventListener('change', toggleTorSection);

    if ($('pxTorStart')) $('pxTorStart').addEventListener('click', function() {
        var bridges = $('pxBridges') ? $('pxBridges').value : '';
        setTorStatus('Starting Tor...', 'warn');
        api.torStart({ bridges: bridges }).then(function(r) {
            if (r.running) {
                setTorStatus(r.bootstrapped ? 'Tor is running and connected!' : 'Tor is starting...', r.bootstrapped ? 'ok' : 'warn');
                updateTorButtons(true);
                $('pxToggle').checked = true;
                $('pxHost').value = '127.0.0.1';
                $('pxPort').value = '9050';
                applyProxy();
            } else {
                setTorStatus('Tor failed to start', 'error');
            }
        }).catch(function(err) { setTorStatus(err.message || 'Error starting Tor', 'error'); });
    });

    if ($('pxTorStop')) $('pxTorStop').addEventListener('click', function() {
        api.torStop().then(function() { updateTorButtons(false); });
    });

    if ($('pxTorAuto')) $('pxTorAuto').addEventListener('click', function() {
        setTorStatus('Searching for Tor on the system (which + ports + torrc)...', 'warn');
        if (!api || !api.detectTor) { setTorStatus('Method unavailable', 'error'); return; }
        api.detectTor().then(function(r) {
            if (!r || !r.success) { setTorStatus('Error: ' + (r && r.error), 'error'); return; }
            var info = r.info;
            if (!info) { setTorStatus('Tor not found. Install tor (sudo apt install tor) or start Tor Browser.', 'error'); return; }
            // Bridges from torrc — fill the field if found
            if (info.bridges && info.bridges.length > 0 && $('pxBridges')) {
                $('pxBridges').value = info.bridges.join('\n');
            }
            // Info about pluggable transports
            var tr = info.transports || {};
            var trMsg = '';
            if (tr.obfs4 || tr.snowflake) {
                trMsg = ' Transport(s): ' + (tr.obfs4 ? 'obfs4 ✓' : 'obfs4 ✗') + ', ' + (tr.snowflake ? 'snowflake ✓' : 'snowflake ✗') + '.';
            } else {
                trMsg = ' obfs4proxy/snowflake-client not found (needed for bridges).';
            }
            if (info.host && info.port) {
                $('pxType').value = 'socks5';
                $('pxHost').value = info.host;
                $('pxPort').value = String(info.port);
                setTorStatus('Tor found at ' + info.host + ':' + info.port + (info.binary ? ' (binary: ' + info.binary + ')' : '') + (info.bridges && info.bridges.length ? ' Bridges in torrc: ' + info.bridges.length : '') + '. Fields filled — click "Apply".' + trMsg, 'ok');
                toggleTorSection();
            } else if (info.binary || (info.bridges && info.bridges.length)) {
                var msg = info.binary ? ('Binary: ' + info.binary + '.') : '';
                if (info.bridges && info.bridges.length) msg += ' Bridges found in torrc: ' + info.bridges.length + '.';
                msg += ' SOCKS port not responding — Tor is not running. Start it (service or "Start Tor" with bridges).';
                setTorStatus(msg + trMsg, 'warn');
            } else {
                setTorStatus('Could not find Tor' + trMsg, 'error');
            }
        }).catch(function(e) { setTorStatus('Error: ' + (e && e.message || e), 'error'); });
    });

    // "Snowflake" button — inserts built-in Snowflake bridge preset
    if ($('pxTorSnowflake')) $('pxTorSnowflake').addEventListener('click', function() {
        if (!api || !api.getSnowflakePreset) { setTorStatus('Method unavailable', 'error'); return; }
        api.getSnowflakePreset().then(function(r) {
            if (!r || !r.success || !r.bridges) { setTorStatus('Could not get preset', 'error'); return; }
            if ($('pxBridges')) {
                var existing = $('pxBridges').value.trim();
                $('pxBridges').value = (existing ? existing + '\n' : '') + r.bridges.join('\n');
            }
            setTorStatus('Snowflake bridges added (' + r.bridges.length + ' ). snowflake-client required in PATH. Click "Start Tor".', 'ok');
        }).catch(function(e) { setTorStatus('Error: ' + (e && e.message || e), 'error'); });
    });

    if ($('pxTorCheck')) $('pxTorCheck').addEventListener('click', function() {
        setTorStatus('Checking...', 'warn');
        api.torCheck().then(function(r) {
            var msg = r.reachable ? 'Tor is working! Traffic goes through Tor.' : (r.running ? 'Tor is running, but network is unavailable (bootstrap: ' + (r.bootstrap||0) + '%)' : 'Tor is not running');
            setTorStatus(msg, r.reachable ? 'ok' : 'error');
        }).catch(function() { setTorStatus('Could not check', 'error'); });
    });

    // "New identity" button (NEWNYM) — change exit-node / IP
    if ($('pxTorNewId')) $('pxTorNewId').addEventListener('click', function() {
        setTorStatus('Requesting new identity...', 'warn');
        if (api.torNewNym) {
            api.torNewNym().then(function(r) {
                setTorStatus(r.message || (r.success ? 'Done' : 'Error'), r.success ? 'ok' : 'warn');
            }).catch(function(e) { setTorStatus('Error: ' + (e.message||e), 'error'); });
        } else {
            setTorStatus('Feature unavailable (update the browser)', 'error');
        }
    });

    // Tor bootstrap progress in real time
    if (api.onTorBootstrap) {
        api.onTorBootstrap(function(pct) {
            var bar = $('pxBootstrapBar');
            var fill = $('pxBootstrapFill');
            if (bar && fill) {
                bar.classList.add('active');
                fill.style.width = pct + '%';
                if (pct >= 100) {
                    setTimeout(function() { bar.classList.remove('active'); fill.style.width = '0%'; }, 2000);
                    setTorStatus('Tor connected (100%)', 'ok');
                } else {
                    setTorStatus('Connecting to Tor network... ' + pct + '%', 'warn');
                }
            }
        });
    }

    // Show/hide "New identity" button depending on Tor state
    var origUpdateTorButtons = updateTorButtons;
    updateTorButtons = function(running) {
        origUpdateTorButtons(running);
        var newId = $('pxTorNewId');
        if (newId) newId.classList.toggle('active', !!running);
    };

    // Link to get bridges — opens in a new tab
    if ($('pxBridgesLink')) $('pxBridgesLink').addEventListener('click', function(e) {
        e.preventDefault();
        if (window.electronAPI && window.electronAPI.openInNewTab) {
            window.electronAPI.openInNewTab('https://bridges.torproject.org/options');
        } else {
            window.open('https://bridges.torproject.org/options', '_blank');
        }
    });

    var slider = $('pxSlider');
    var toggle = $('pxToggle');
    function updateSlider() {
        if (slider) {
            slider.style.background = toggle.checked ? 'var(--primary-color)' : '#444';
            slider.style.cssText = 'position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;border-radius:12px;transition:.2s;background:' + (toggle.checked ? 'var(--primary-color)' : '#444');
        }
    }
    toggle.addEventListener('change', updateSlider);
    updateSlider();

    // ===== Tor auto-start toggle =====
    var autoStartToggle = $('pxTorAutoStart');
    if (autoStartToggle && api.getTorAutoStart) {
        api.getTorAutoStart().then(function(on) {
            autoStartToggle.checked = !!on;
        }).catch(function() {});
        autoStartToggle.addEventListener('change', function() {
            if (api.setTorAutoStart) api.setTorAutoStart(autoStartToggle.checked).catch(function() {});
        });
    }

    // ===== Mode badge (Direct / Proxy / Tor) =====
    function updateModeBadge() {
        var badge = $('pxModeBadge');
        if (!badge) return;
        var enabled = $('pxToggle') && $('pxToggle').checked;
        var type = $('pxType') && $('pxType').value;
        var mode, cls, live;
        if (!enabled) { mode = 'Direct'; cls = 'direct'; live = false; }
        else if (type === 'tor') { mode = 'Tor'; cls = 'tor'; live = true; }
        else { mode = 'Proxy · ' + (type || 'http').toUpperCase(); cls = 'proxy'; live = true; }
        badge.className = 'px-mode-badge ' + cls;
        badge.innerHTML = '<span class="px-mode-dot' + (live ? ' live' : '') + '"></span>' + mode;
    }
    updateModeBadge();
    if ($('pxToggle')) $('pxToggle').addEventListener('change', updateModeBadge);
    if ($('pxType')) $('pxType').addEventListener('change', updateModeBadge);

    // ===== Connection diagnostics =====
    var COUNTRY_FLAGS = { AF:'🇦🇫',AL:'🇦🇱',DZ:'🇩🇿',AR:'🇦🇷',AU:'🇦🇺',AT:'🇦🇹',AZ:'🇦🇿',BY:'🇧🇾',BE:'🇧🇪',BR:'🇧🇷',BG:'🇧🇬',CA:'🇨🇦',CL:'🇨🇱',CN:'🇨🇳',HR:'🇭🇷',CZ:'🇨🇿',DK:'🇩🇰',EE:'🇪🇪',FI:'🇫🇮',FR:'🇫🇷',DE:'🇩🇪',GR:'🇬🇷',HK:'🇭🇰',HU:'🇭🇺',IS:'🇮🇸',IN:'🇮🇳',ID:'🇮🇩',IR:'🇮🇷',IE:'🇮🇪',IL:'🇮🇱',IT:'🇮🇹',JP:'🇯🇵',KZ:'🇰🇿',KR:'🇰🇷',LV:'🇱🇻',LT:'🇱🇹',LU:'🇱🇺',MY:'🇲🇾',MX:'🇲🇽',MD:'🇲🇩',NL:'🇳🇱',NZ:'🇳🇿','NO':'🇳🇴',PK:'🇵🇰',PH:'🇵🇭',PL:'🇵🇱',PT:'🇵🇹',RO:'🇷🇴',RU:'🇷🇺',SA:'🇸🇦',RS:'🇷🇸',SG:'🇸🇬',SK:'🇸🇰',SI:'🇸🇮',ZA:'🇿🇦',ES:'🇪🇸',SE:'🇸🇪',CH:'🇨🇭',TW:'🇹🇼',TH:'🇹🇭',TR:'🇹🇷',UA:'🇺🇦',AE:'🇦🇪',GB:'🇬🇧',US:'🇺🇸',UZ:'🇺🇿',VN:'🇻🇳' };
    function speedLabel(kbps) {
        if (kbps == null) return '';
        if (kbps >= 1000) return (kbps / 1000).toFixed(1) + ' Mbps';
        return kbps + ' Kbps';
    }
    function latencyLabel(ms) {
        if (ms == null) return '';
        var tag = ms < 150 ? 'ms · fast' : ms < 500 ? 'ms · medium' : 'ms · slow';
        return ms + ' ' + tag;
    }
    function setDiag(id, html, dim) {
        var el = $(id);
        if (!el) return;
        el.innerHTML = html;
        if (dim) el.querySelector('.px-diag-value') && el.querySelector('.px-diag-value').classList.add('dim');
    }

    function renderDiag(r) {
        updateModeBadge();
        var statusEl = $('pxDiagStatus');
        if (statusEl) {
            if (r.isTor) statusEl.innerHTML = '<span style="color:#4caf50;">● Tor is active</span>';
            else if (r.mode === 'proxy') statusEl.innerHTML = '<span style="color:#667eea;">● Proxy is working</span>';
            else if (r.mode === 'direct') statusEl.innerHTML = '<span style="color:var(--secondary-text);">● Direct connection</span>';
            else statusEl.innerHTML = '<span class="px-diag-value dim">—</span>';
        }
        setDiag('pxDiagIp', r.ip ? escapeHtmlSimple(r.ip) : '<span class="px-diag-value dim">—</span>');
        var flag = r.countryCode ? (COUNTRY_FLAGS[r.countryCode] || '') + ' ' : '';
        setDiag('pxDiagCountry', (r.country ? flag + escapeHtmlSimple(r.country) : '<span class="px-diag-value dim">—</span>'));
        setDiag('pxDiagCity', r.city ? escapeHtmlSimple(r.city) : '<span class="px-diag-value dim">—</span>');
        setDiag('pxDiagIsp', r.isp ? escapeHtmlSimple(r.isp) : '<span class="px-diag-value dim">—</span>');
        var speedEl = $('pxDiagSpeed');
        if (speedEl) {
            var parts = [];
            if (r.latencyMs != null) parts.push(latencyLabel(r.latencyMs));
            if (r.speedKbps != null) parts.push(speedLabel(r.speedKbps));
            speedEl.innerHTML = parts.length ? parts.join('<br>') : '<span class="px-diag-value dim">—</span>';
        }
        var errEl = $('pxDiagError');
        if (errEl) {
            if (r.error && !r.ip && !r.country) { errEl.style.display = 'block'; errEl.textContent = r.error; }
            else { errEl.style.display = 'none'; }
        }
    }

    function runConnTest() {
        if (!api || !api.proxyConnectionTest) {
            var errEl = $('pxDiagError');
            if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Method unavailable (update the browser).'; }
            return;
        }
        var btn = $('pxConnTest');
        var spin = $('pxConnSpin');
        var statusEl = $('pxDiagStatus');
        if (statusEl) statusEl.innerHTML = '<span style="color:var(--secondary-text);">⏳ Checking…</span>';
        if (btn) btn.disabled = true;
        if (spin) spin.style.animation = 'about-logo-spin 0.9s linear infinite';
        api.proxyConnectionTest().then(function(r) {
            renderDiag(r || {});
        }).catch(function(e) {
            renderDiag({ error: (e && e.message) || 'Check failed', mode: ($('pxToggle') && $('pxToggle').checked) ? 'proxy' : 'direct' });
        }).finally(function() {
            if (btn) btn.disabled = false;
            if (spin) spin.style.animation = '';
        });
    }

    if ($('pxConnTest')) $('pxConnTest').addEventListener('click', runConnTest);
    if ($('pxConnRepeat')) $('pxConnRepeat').addEventListener('click', runConnTest);

    // ===== Tor on/off toggle =====
    var torToggle = $('pxTorToggle');
    // Reflect current state: Tor running OR proxy type is 'tor' and enabled
    function syncTorToggle() {
        if (!torToggle) return;
        var enabled = ($('pxToggle') && $('pxToggle').checked && $('pxType') && $('pxType').value === 'tor');
        if (api.torStatus) api.torStatus().then(function (r) {
            if (torToggle) torToggle.checked = enabled || !!(r && r.running);
        }).catch(function() { if (torToggle) torToggle.checked = enabled; });
        else torToggle.checked = enabled;
    }
    syncTorToggle();

    if (torToggle) torToggle.addEventListener('change', function () {
        if (torToggle.checked) {
            // Turn ON: switch to Tor SOCKS5, start the binary, apply
            $('pxType').value = 'tor';
            if (!$('pxHost').value) $('pxHost').value = '127.0.0.1';
            if (!$('pxPort').value) $('pxPort').value = '9050';
            toggleTorSection();
            setTorStatus('Starting Tor…', 'warn');
            var bridges = $('pxBridges') ? $('pxBridges').value : '';
            if (!api.torStart) { setTorStatus('Method unavailable', 'error'); return; }
            api.torStart({ bridges: bridges }).then(function (r) {
                if (r && r.running) {
                    $('pxToggle').checked = true;
                    setTorStatus(r.bootstrapped ? 'Tor started and connected!' : 'Tor is starting…', r.bootstrapped ? 'ok' : 'warn');
                    updateTorButtons(true);
                    applyProxy();
                } else {
                    setTorStatus('Failed to start Tor', 'error');
                    torToggle.checked = false;
                }
            }).catch(function (e) {
                setTorStatus((e && e.message) || 'Tor start error', 'error');
                torToggle.checked = false;
            });
        } else {
            // Turn OFF: stop Tor, disable proxy if it was Tor
            if (api.torStop) api.torStop().then(function () {
                updateTorButtons(false);
                if ($('pxType').value === 'tor') {
                    $('pxToggle').checked = false;
                    applyProxy();
                }
                setTorStatus('Tor stopped', '');
            });
        }
    });

    // ===== Domain lists (bypass / force) =====
    function loadDomainLists(s) {
        var b = $('pxBypassDomains'), f = $('pxForceDomains');
        if (b) b.value = (Array.isArray(s.bypassDomains) ? s.bypassDomains : []).join('\n');
        if (f) f.value = (Array.isArray(s.forceDomains) ? s.forceDomains : []).join('\n');
    }
    // Loaded together with proxy settings — patch the existing loader
    var _origGetProxy = api.getProxySettings ? api.getProxySettings() : Promise.resolve({});
    _origGetProxy.then(function (s) {
        if (s) loadDomainLists(s);
    }).catch(function() {});

    function applyDomainLists() {
        var bypass = $('pxBypassDomains') ? $('pxBypassDomains').value.split('\n').map(function (d) { return d.trim(); }).filter(Boolean) : [];
        var force = $('pxForceDomains') ? $('pxForceDomains').value.split('\n').map(function (d) { return d.trim(); }).filter(Boolean) : [];
        api.setProxySettings({
            enabled: $('pxToggle') ? $('pxToggle').checked : false,
            type: $('pxType') ? $('pxType').value : 'http',
            host: ($('pxHost') ? $('pxHost').value : '').trim(),
            port: ($('pxPort') ? $('pxPort').value : '').trim(),
            bridges: $('pxBridges') ? $('pxBridges').value : '',
            bypassDomains: bypass,
            forceDomains: force
        }).then(function () {
            var st = $('pxStatusText');
            if (st) {
                var parts = [];
                if (bypass.length) parts.push('bypass: ' + bypass.length);
                if (force.length) parts.push('force: ' + force.length);
                st.textContent = ($('pxToggle') && $('pxToggle').checked ? 'Proxy active' : 'Direct connection') + (parts.length ? ' (' + parts.join(', ') + ')' : '');
            }
            updateModeBadge();
        }).catch(function(e) { customAlert('Error: ' + (e.message || e)); });
    }
    if ($('pxDomainsApply')) $('pxDomainsApply').addEventListener('click', applyDomainLists);
    if ($('pxDomainsAddOnion')) $('pxDomainsAddOnion').addEventListener('click', function () {
        var f = $('pxForceDomains');
        if (!f) return;
        var lines = f.value.split('\n').map(function(d) { return d.trim(); }).filter(Boolean);
        if (lines.indexOf('*.onion') === -1) {
            lines.unshift('*.onion');
            f.value = lines.join('\n');
        }
    });
})();

// ============== TOR HARDENING (individual toggles) ==============
(function() {
    var api = window.electronAPI;
    if (!api || !api.getTorHardening) return;
    var keys = ['js','webgl','fonts','plugins','iframes','base'];
    var els = {};
    keys.forEach(function(k) { els[k] = document.getElementById('th' + k.charAt(0).toUpperCase() + k.slice(1)); });

    function syncUI(settings) {
        keys.forEach(function(k) {
            if (els[k]) els[k].checked = !!(settings && settings[k]);
        });
    }

    api.getTorHardening().then(syncUI).catch(function() {});

    keys.forEach(function(k) {
        if (!els[k]) return;
        els[k].addEventListener('change', function() {
            // Collect current values from all toggles
            var next = {};
            keys.forEach(function(kk) { next[kk] = els[kk] ? !!els[kk].checked : false; });
            if (api.setTorHardening) api.setTorHardening(next).then(function(r) {
                if (r && r.torHardening) syncUI(r.torHardening);
            }).catch(function() {});
        });
    });
})();

// ============== PROFILES ==============
const _SVG = {
  '👤': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  '🧑': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  '👩': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  '👨': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  '👦': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><circle cx="12" cy="7" r="4"/></svg>',
  '👧': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><circle cx="12" cy="7" r="4"/></svg>',
  '🧒': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><circle cx="12" cy="7" r="4"/></svg>',
  '🦊': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
  '🐱': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
  '🐶': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M10 5.172C10 3.782 8.423 2.679 6.5 3c-2.823.47-4.113 6.006-4 7 .08.703 1.725 1.722 3.656 1 1.261-.472 1.96-1.45 2.344-2.5"/><path d="M14.267 5.172c0-1.39 1.577-2.493 3.5-2.172 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5"/><path d="M8 14v.5"/><path d="M16 14v.5"/><path d="M11.25 16.25h1.5L12 17l-.75-.75z"/><path d="M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444c0-1.061-.162-2.2-.493-3.309m-9.243-6.082A8.801 8.801 0 0 1 12 5c.78 0 1.5.108 2.161.306"/></svg>',
  '🐸': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M12 2a10 10 0 0 0-10 10 10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2z"/><circle cx="8" cy="10" r="2" fill="currentColor"/><circle cx="16" cy="10" r="2" fill="currentColor"/><path d="M8 16c1.5 1 3 1.5 4 1.5s2.5-.5 4-1.5"/></svg>',
  '🤖': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>',
  '👾': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h.01M10 12h.01M14 12h.01M18 12h.01"/><path d="M8 18v2M16 18v2"/></svg>',
  '🎨': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>',
  '🎵': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  '⚡': '<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>'
};
function _icon(emoji, w, h) {
  var svg = _SVG[emoji];
  if (!svg) return emoji;
  if (w || h) {
    svg = svg.replace('width="1em"', 'width="' + (w || h || 16) + '"');
    svg = svg.replace('height="1em"', 'height="' + (h || w || 16) + '"');
  }
  return svg;
}
const avatarOptions = ['👤','🧑','👩','👨','👦','👧','🧒','🦊','🐱','🐶','🐸','🤖','👾','🎨','🎵','⚡'];

// ===== Container tabs =====
var containersData = { enabled: false, containers: [] };
var containersDirty = false;

function loadContainersSection() {
    const wrap = document.getElementById('containersSettings');
    const unsupported = document.getElementById('containersUnsupported');
    if (!wrap) return;
    if (!api.getContainers || !api.setContainersEnabled || !api.saveContainers) {
        if (unsupported) unsupported.style.display = 'block';
        return;
    }
    wrap.style.display = 'block';
    api.getContainers().then(cfg => {
        containersData = cfg || { enabled: false, containers: [] };
        renderContainers();
    }).catch(() => {});
}

function renderContainers() {
    const toggle = document.getElementById('containersEnabled');
    const list = document.getElementById('containersList');
    if (!toggle || !list) return;
    toggle.checked = !!containersData.enabled;
    list.innerHTML = '';
    (containersData.containers || []).forEach((c, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;';
        const icon = document.createElement('input');
        icon.type = 'text'; icon.value = c.icon || '🗂';
        icon.title = 'Icon (emoji)';
        icon.style.cssText = 'width:44px;padding:6px;border:1px solid var(--border-color);border-radius:6px;background:var(--input-bg);color:var(--text-color);font-size:15px;text-align:center;';
        icon.addEventListener('change', () => { containersData.containers[i].icon = icon.value.slice(0, 4) || '🗂'; saveContainersNow(); });
        const name = document.createElement('input');
        name.type = 'text'; name.value = c.name || ''; name.placeholder = 'Name';
        name.style.cssText = 'flex:1;min-width:0;padding:6px 10px;border:1px solid var(--border-color);border-radius:6px;background:var(--input-bg);color:var(--text-color);font-size:13px;';
        name.addEventListener('change', () => { containersData.containers[i].name = name.value.slice(0, 40) || 'Container'; saveContainersNow(); });
        const color = document.createElement('input');
        color.type = 'color'; color.value = c.color || '#1da1f2';
        color.title = 'Color';
        color.style.cssText = 'width:36px;height:32px;padding:2px;border:1px solid var(--border-color);border-radius:6px;background:var(--input-bg);cursor:pointer;';
        color.addEventListener('change', () => { containersData.containers[i].color = color.value; saveContainersNow(); });
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear data';
        clearBtn.title = 'Wipe cookies and storage of this container';
        clearBtn.style.cssText = 'padding:6px 10px;border:1px solid var(--border-color);border-radius:6px;background:transparent;color:var(--text-color);font-size:12px;cursor:pointer;white-space:nowrap;';
        clearBtn.addEventListener('click', () => {
            clearBtn.disabled = true;
            api.clearContainerData(c.id).then(() => { clearBtn.disabled = false; })
              .catch(() => { clearBtn.disabled = false; });
        });
        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.title = 'Delete container';
        delBtn.style.cssText = 'padding:6px 10px;border:1px solid var(--border-color);border-radius:6px;background:transparent;color:#e74c3c;font-size:12px;cursor:pointer;';
        delBtn.addEventListener('click', () => {
            containersData.containers.splice(i, 1);
            saveContainersNow();
            renderContainers();
        });
        row.appendChild(icon); row.appendChild(name); row.appendChild(color);
        row.appendChild(clearBtn); row.appendChild(delBtn);
        list.appendChild(row);
    });
}

function saveContainersNow() {
    if (api.saveContainers) {
        api.saveContainers(containersData.containers || []);
    }
}

(function setupContainersSection() {
    const toggle = document.getElementById('containersEnabled');
    const addBtn = document.getElementById('addContainerBtn');
    if (toggle) {
        toggle.addEventListener('change', () => {
            containersData.enabled = toggle.checked;
            if (api.setContainersEnabled) api.setContainersEnabled(toggle.checked);
        });
    }
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const palette = ['#4caf50', '#1da1f2', '#ff9800', '#e74c3c', '#9b59b6', '#1abc9c'];
            containersData.containers.push({
                id: 'c' + Date.now(),
                name: 'Container ' + (containersData.containers.length + 1),
                color: palette[containersData.containers.length % palette.length],
                icon: '🗂'
            });
            saveContainersNow();
            renderContainers();
        });
    }
})();

function loadProfiles() {
    const listEl = document.getElementById('profiles-list');
    if (!listEl) return;

    Promise.all([api.getProfiles(), api.getActiveProfile()]).then(([data, active]) => {
        const profiles = data.profiles || [];
        const activeId = active ? active.id : 'default';
        const dateLocale = (window.i18n && window.i18n.getLanguage && window.i18n.getLanguage()) === 'ru' ? 'ru-RU' : 'en-US';

        if (profiles.length === 0) {
            listEl.innerHTML = '<div class="empty-message">No profiles</div>';
            return;
        }

        listEl.innerHTML = profiles.map(p => {
            const isActive = p.id === activeId;
            return `
                <div class="plugin-card ${isActive ? 'enabled' : 'disabled'}" style="margin-bottom: 12px;">
                    <div class="plugin-icon" style="font-size: 28px; background: ${isActive ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.05)'};">
                        ${_icon(p.avatar || '👤')}
                    </div>
                    <div class="plugin-info">
                        <div class="plugin-name">
                            <span id="profile-name-${escapeHtml(p.id)}">${escapeHtml(p.name || 'Profile')}</span>
                            ${isActive ? '<span style="font-size:11px;color:#4CAF50;font-weight:500;">● Active</span>' : ''}
                        </div>
                        <div class="plugin-version"><span>Created:</span> ${p.createdAt ? new Date(p.createdAt).toLocaleDateString(dateLocale) : '—'}</div>
                    </div>
                    <div class="plugin-actions" style="flex-direction: column; gap: 4px;">
                        ${!isActive ? `<button class="password-action-btn" data-action="switch-profile" data-id="${escapeHtml(p.id)}">Switch</button>` : ''}
                        <button class="password-action-btn" data-action="rename-profile" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name || '')}">Rename</button>
                        ${p.id !== 'default' ? `<button class="password-action-btn delete" data-action="delete-profile" data-id="${escapeHtml(p.id)}">Delete</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }).catch(err => {
        listEl.innerHTML = '<div class="empty-message">Error loading profiles</div>';
    });
}

document.getElementById('create-profile-btn').addEventListener('click', async () => {
    const name = await window.electronAPI._dialogRequest({type:'prompt', message:'Profile name:'});
    if (!name || !name.trim()) return;
    const avatar = (await window.electronAPI._dialogRequest({type:'prompt', message:'Choose an emoji (avatar):', defaultText:'👤'})) || '👤';
    api.createProfile(name.trim(), (avatar || '👤').trim()).then(() => {
        loadProfiles();
        showToast('Profile created');
    }).catch(err => showToast('Error: ' + err.message));
});

function switchProfile(id) {
    api.switchProfile(id).then(() => {
        loadProfiles();
        showToast('Profile switched. Restart the browser to apply.');
    }).catch(err => showToast('Error: ' + err.message));
}

async function renameProfile(id, currentName) {
    const newName = await window.electronAPI._dialogRequest({type:'prompt', message:'New profile name:', defaultText: currentName});
    if (!newName || !newName.trim()) return;
    api.renameProfile(id, newName.trim()).then(() => {
        loadProfiles();
        showToast('Profile renamed');
    }).catch(err => showToast('Error: ' + err.message));
}

async function deleteProfile(id) {
    if (!await customConfirm('Delete this profile? Bookmarks and data of this profile will be deleted.')) return;
    api.deleteProfile(id).then(() => {
        loadProfiles();
        showToast('Profile deleted');
    }).catch(err => showToast('Error: ' + err.message));
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    const hash = resolveSectionHash(window.location.hash || '#main');
    const activeLink = document.querySelector(`nav a[href="${hash}"]`);
    if (activeLink) {
        document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
        activeLink.classList.add('active');
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        const target = document.querySelector(hash);
        if (target) target.classList.add('active');
        try { activeLink.scrollIntoView({ block: 'nearest' }); } catch(e) {}
    }

    loadPathsPage();

    // Load data depending on active section
    setTimeout(() => {
        if (hash === '#scripts') loadScripts();
        if (hash === '#permissions') loadPermissions();
        if (hash === '#system-integration') initSystemIntegration();
        if (hash === '#customization') initCustomThemeUpload();
        if (hash === '#profiles') loadProfiles();
        if (hash === '#library-protection') {
            gateProtectionSection(function() { loadLibraryProtectionPage(); });
        }
    }, 100);

});

// ============== SITE PERMISSIONS ==============
const PERMISSION_TYPES = [
  { key: 'media', label: 'Media' },
  { key: 'geolocation', label: 'Geolocation' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'clipboard-read', label: 'Clipboard read' },
  { key: 'clipboard-write', label: 'Clipboard write' },
  { key: 'persistent-storage', label: 'Persistent storage' },
  { key: 'midi', label: 'MIDI' },
  { key: 'fullscreen', label: 'Fullscreen' },
  { key: 'openExternal', label: 'Open external links' }
];

async function loadPermissions(filter) {
  const list = document.getElementById('permissions-list');
  const empty = document.getElementById('permissions-empty');
  if (!list || !api || !api.getSitePermissions) return;
  try {
    const perms = await api.getSitePermissions();
    const domains = Object.keys(perms);
    const filtered = filter ? domains.filter(d => d.toLowerCase().includes(filter.toLowerCase())) : domains;
    if (filtered.length === 0) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    let html = '';
    filtered.sort().forEach(domain => {
      const sitePerms = perms[domain];
      html += '<div class="perm-site-card">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
      html += '<div class="perm-domain">' + escapeHtmlSimple(domain) + '</div>';
      html += '<button data-action="remove-perm-site" data-domain="' + escapeHtmlSimple(domain) + '" class="perm-delete-btn" title="Remove all permissions">Delete</button>';
      html += '</div>';
      html += '<div class="perm-grid">';
      PERMISSION_TYPES.forEach(pt => {
        const val = sitePerms[pt.key];
        const isSet = val !== undefined;
        const isAllowed = val === true;
        html += '<div class="perm-row">';
        html += '<span class="perm-label">' + pt.label + '</span>';
        html += '<select data-action="change-perm" data-domain="' + escapeHtmlSimple(domain) + '" data-perm="' + pt.key + '" class="perm-select' + (isSet ? (isAllowed ? ' perm-allowed' : ' perm-denied') : '') + '">';
        html += '<option value="default"' + (!isSet ? ' selected' : '') + '>Default</option>';
        html += '<option value="allow"' + (isSet && isAllowed ? ' selected' : '') + '>Allow</option>';
        html += '<option value="deny"' + (isSet && !isAllowed ? ' selected' : '') + '>Block</option>';
        html += '</select>';
        html += '</div>';
      });
      html += '</div></div>';
    });
    list.innerHTML = html;
  } catch(e) {
    list.innerHTML = '<div style="color:var(--danger-color,#e74c3c);text-align:center;padding:16px;">Error loading permissions</div>';
  }
}

window.changePerm = async function(domain, perm, value) {
  if (!api || !api.setSitePermission) return;
  if (value === 'default') {
    const perms = await api.getSitePermissions();
    if (perms[domain]) {
      delete perms[domain][perm];
      if (Object.keys(perms[domain]).length === 0) {
        await api.removeSitePermissions(domain);
      } else {
        await api.setSitePermission(domain, perm, undefined);
      }
    }
  } else {
    await api.setSitePermission(domain, perm, value === 'allow');
  }
  const search = document.getElementById('permissions-search');
  loadPermissions(search ? search.value : '');
};

window.removePermissionSite = async function(domain) {
  if (!api || !api.removeSitePermissions) return;
  await api.removeSitePermissions(domain);
  const search = document.getElementById('permissions-search');
  loadPermissions(search ? search.value : '');
};

const permSearchInput = document.getElementById('permissions-search');
if (permSearchInput) {
  permSearchInput.addEventListener('input', (e) => loadPermissions(e.target.value));
}

function escapeHtmlSimple(str) { var d=document.createElement('div'); d.textContent=str; return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

window.addEventListener('message', (event) => {
    if (event.origin !== location.origin && event.origin !== 'file://' && event.origin !== 'null') return;
    if (event.data && event.data.type === 'show-toast') {
        showToast(event.data.message, 'info', event.data.duration || 3000);
    }
});

function loadBlockerPage() {
    if (typeof loadSbStats === 'function') loadSbStats();
}

// ============== PRIVACY DASHBOARD ==============
function loadPrivacyDashboard() {
    if (!api || !api.getPrivacyStats) return;
    api.getPrivacyStats().then(function(stats) {
        if (!stats) return;
        var blockedEl = document.getElementById('privBlockedCount');
        var cookiesEl = document.getElementById('privCookiesCount');
        var scoreEl = document.getElementById('privSecurityScore');
        var recList = document.getElementById('privRecList');
        if (blockedEl) blockedEl.textContent = stats.blockedRequests || 0;
        if (cookiesEl) cookiesEl.textContent = stats.cookiesCount || 0;
        // Category breakdown of EVERYTHING the blocker stopped this session
        // (ads / trackers / social / CDN / other + total).
        var ab = stats.adblockSession || null;
        function _cat(id, v) { var el = document.getElementById(id); if (el) el.textContent = v || 0; }
        _cat('privCatAds', ab && ab.ads);
        _cat('privCatTrackers', ab && ab.trackers);
        _cat('privCatSocial', ab && ab.social);
        _cat('privCatCdn', ab && ab.cdn);
        _cat('privCatOther', ab && ab.other);
        _cat('privCatTotal', ab && ab.blocked);
        var breakdown = document.getElementById('privAdblockBreakdown');
        if (breakdown && !ab) breakdown.style.display = 'none';
        var enabled = stats.enabledFeatures || 0;
        var total = stats.totalFeatures || 1;
        var pct = Math.round((enabled / total) * 100);
        var level = pct >= 80 ? 'High' : pct >= 50 ? 'Medium' : 'Low';
        // Dedicated keys so the word agrees with "Protection level" (masc.)
        // instead of reusing unrelated one-word dictionary entries.
        var lvlKey = pct >= 80 ? 'High security' : pct >= 50 ? 'Medium security' : 'Low security';
        // t() echoes the key while no dictionary is loaded (lang === 'en') —
        // fall back to the plain word in that case.
        if (scoreEl) scoreEl.textContent = (window.i18n && window.i18n.getLanguage && window.i18n.getLanguage() !== 'en' && window.i18n.t(lvlKey)) || level;
        if (recList) {
            var _pt = function(s) { return (window.i18n && window.i18n.t(s)) || s; };
            var recs = [];
            if (!stats.adblockerEnabled) recs.push('Enable the ad blocker to protect against trackers');
            if (!stats.httpsOnly) recs.push('Enable "HTTPS only" for secure connections');
            if (!stats.thirdPartyCookiesBlocked) recs.push('Block 3rd-party cookies to protect against tracking');
            if (!stats.fingerprintProtection) recs.push('Enable fingerprinting protection');
            if (!stats.webRTCProtection) recs.push('Enable WebRTC IP leak protection');
            recList.innerHTML = recs.length > 0
                ? recs.map(function(r) { return '<div style="padding:4px 0;border-bottom:1px solid var(--border-color);">• ' + _pt(r) + '</div>'; }).join('')
                : '<div style="color:#4caf50;">' + _pt('All core protection measures are enabled!') + '</div>';
        }
    }).catch(function() {});
}
if (document.getElementById('privBlockedCount')) loadPrivacyDashboard();
// The dictionary loads asynchronously: re-render once the UI language has
// been applied so recommendations and the score word are translated.
document.addEventListener('i18nlanguagechange', function (ev) {
    if (ev.detail && ev.detail.language !== 'en' && document.getElementById('privBlockedCount')) loadPrivacyDashboard();
});

// ============== MULTI-SEARCH ENGINES ==============
(function() {
    var MULTI_ENGINES = [
        { id: 'google', name: 'Google', url: 'https://www.google.com/search?q=' },
        { id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
        { id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=' },
        { id: 'startpozi', name: 'StartPOZI', url: 'https://startpozi.com/search.html?q=' }
    ];
    var container = document.getElementById('multi-search-list');
    var customContainer = document.getElementById('multi-search-custom-list');
    var nameInput = document.getElementById('msCustomName');
    var urlInput = document.getElementById('msCustomUrl');
    var addBtn = document.getElementById('msCustomAddBtn');
    if (!container) return;

    var currentEnabled = {};
    var customEngines = [];

    function renderEngines(enabled) {
        currentEnabled = enabled || {};
        container.innerHTML = '';
        MULTI_ENGINES.forEach(function(eng) {
            var isOn = !!currentEnabled[eng.id];
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;';
            var label = document.createElement('div');
            label.innerHTML = '<div style="font-size:14px;font-weight:500;color:var(--text-color);">' + eng.name + '</div><div style="font-size:11px;color:var(--secondary-text);margin-top:2px;">' + eng.url + '</div>';
            var toggleLabel = document.createElement('label');
            toggleLabel.className = 'px-toggle-wrap';
            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = isOn;
            checkbox.addEventListener('change', function() {
                currentEnabled[eng.id] = checkbox.checked;
                saveEngines();
            });
            var track = document.createElement('span');
            track.className = 'px-toggle-track';
            toggleLabel.appendChild(checkbox);
            toggleLabel.appendChild(track);
            row.appendChild(label);
            row.appendChild(toggleLabel);
            container.appendChild(row);
        });
    }

    function renderCustomEngines() {
        if (!customContainer) return;
        customContainer.innerHTML = '';
        if (customEngines.length === 0) {
            customContainer.innerHTML = '<div style="color:var(--secondary-text);font-size:13px;text-align:center;padding:12px;">No added search engines</div>';
            return;
        }
        customEngines.forEach(function(eng) {
            var isOn = !!currentEnabled[eng.id];
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;gap:10px;';
            var info = document.createElement('div');
            info.style.flex = '1';
            info.style.minWidth = '0';
            info.innerHTML = '<div style="font-size:14px;font-weight:500;color:var(--text-color);">' + escapeHtmlSimple(eng.name) + '</div><div style="font-size:11px;color:var(--secondary-text);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtmlSimple(eng.url) + '</div>';
            var toggleLabel = document.createElement('label');
            toggleLabel.className = 'px-toggle-wrap';
            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = isOn;
            checkbox.addEventListener('change', function() {
                currentEnabled[eng.id] = checkbox.checked;
                saveEngines();
            });
            var track = document.createElement('span');
            track.className = 'px-toggle-track';
            toggleLabel.appendChild(checkbox);
            toggleLabel.appendChild(track);
            var del = document.createElement('button');
            del.style.cssText = 'background:none;border:none;color:var(--danger-color,#e74c3c);cursor:pointer;font-size:16px;padding:4px 8px;flex-shrink:0;';
            del.textContent = '\u00d7';
            del.title = 'Delete';
            del.addEventListener('click', function(e) {
                e.preventDefault();
                removeCustomEngine(eng.id);
            });
            row.appendChild(info);
            row.appendChild(toggleLabel);
            row.appendChild(del);
            customContainer.appendChild(row);
        });
    }

    function saveEngines() {
        if (api && api.setMultiSearchEngines) api.setMultiSearchEngines(currentEnabled);
    }

    function removeCustomEngine(engineId) {
        if (!api || !api.removeMultiSearchCustomEngine) return;
        api.removeMultiSearchCustomEngine(engineId).then(function() {
            delete currentEnabled[engineId];
            saveEngines();
            loadAll();
        });
    }

    function loadAll() {
        var p1 = (api && api.getMultiSearchEngines) ? api.getMultiSearchEngines() : Promise.resolve({});
        var p2 = (api && api.getMultiSearchCustomEngines) ? api.getMultiSearchCustomEngines() : Promise.resolve([]);
        Promise.all([p1, p2]).then(function(results) {
            renderEngines(results[0]);
            customEngines = Array.isArray(results[1]) ? results[1] : [];
            renderCustomEngines();
        });
    }

    if (addBtn) {
        addBtn.addEventListener('click', function() {
            var name = (nameInput && nameInput.value.trim()) || '';
            var url = (urlInput && urlInput.value.trim()) || '';
            if (!name || !url) {
                if (typeof showToast === 'function') showToast('Enter a name and URL', 'error');
                return;
            }
            if (!api || !api.addMultiSearchCustomEngine) return;
            api.addMultiSearchCustomEngine({ name: name, url: url }).then(function() {
                if (nameInput) nameInput.value = '';
                if (urlInput) urlInput.value = '';
                loadAll();
            });
        });
    }

    loadAll();
})();

// ============== SITE THEMES (CSS) ==============
(function() {
    var domainInput = document.getElementById('siteThemeDomain');
    var cssArea = document.getElementById('siteThemeCSS');
    var saveBtn = document.getElementById('siteThemeSave');
    var deleteBtn = document.getElementById('siteThemeDelete');
    var listEl = document.getElementById('siteThemesList');
    if (!domainInput || !cssArea || !saveBtn || !listEl) return;

    var themes = {};

    function loadThemes() {
        if (!api || !api.getSiteThemes) return;
        api.getSiteThemes().then(function(data) {
            themes = data || {};
            renderThemesList();
        });
    }

    function renderThemesList() {
        var domains = Object.keys(themes);
        if (domains.length === 0) {
            listEl.innerHTML = '<div style="color:var(--secondary-text);font-size:13px;text-align:center;padding:16px;">No saved themes. Enter any site domain and add CSS styles.</div>';
            return;
        }
        listEl.innerHTML = '';
        domains.sort().forEach(function(domain) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--input-bg);border:1px solid var(--border-color);border-radius:8px;cursor:pointer;transition:background 0.15s;';
            var info = document.createElement('div');
            info.style.flex = '1';
            info.style.minWidth = '0';
            info.innerHTML = '<div style="font-size:14px;font-weight:500;color:var(--text-color);">' + escapeHtmlSimple(domain) + '</div><div style="font-size:11px;color:var(--secondary-text);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtmlSimple((themes[domain] || '').substring(0, 100)) + '</div>';
            var del = document.createElement('button');
            del.style.cssText = 'background:none;border:none;color:var(--danger-color,#e74c3c);cursor:pointer;font-size:16px;padding:4px 8px;flex-shrink:0;';
            del.textContent = '\u00d7';
            del.title = 'Delete';
            del.addEventListener('click', function(e) {
                e.stopPropagation();
                delete themes[domain];
                if (api && api.setSiteTheme) api.setSiteTheme(domain, '');
                if (domainInput.value === domain) {
                    domainInput.value = '';
                    cssArea.value = '';
                    deleteBtn.style.display = 'none';
                }
                renderThemesList();
            });
            row.addEventListener('click', function() {
                domainInput.value = domain;
                cssArea.value = themes[domain] || '';
                deleteBtn.style.display = 'inline-block';
            });
            row.appendChild(info);
            row.appendChild(del);
            listEl.appendChild(row);
        });
    }

    saveBtn.addEventListener('click', function() {
        var domain = domainInput.value.trim();
        var css = cssArea.value.trim();
        if (!domain) return;
        themes[domain] = css;
        if (api && api.setSiteTheme) api.setSiteTheme(domain, css);
        deleteBtn.style.display = 'inline-block';
        renderThemesList();
    });

    deleteBtn.addEventListener('click', function() {
        var domain = domainInput.value.trim();
        if (!domain) return;
        delete themes[domain];
        if (api && api.setSiteTheme) api.setSiteTheme(domain, '');
        domainInput.value = '';
        cssArea.value = '';
        deleteBtn.style.display = 'none';
        renderThemesList();
    });

    loadThemes();
})();

// ============== PATHS SECTION ==============
function loadPathsPage() {
    var downloadVal = document.getElementById('pathsDownloadValue');
    var screenshotVal = document.getElementById('pathsScreenshotValue');
    var dataVal = document.getElementById('pathsDataValue');

    if (api && api.getCurrentDownloadPath) {
        api.getCurrentDownloadPath().then(function(p) {
            if (downloadVal) downloadVal.textContent = p;
        });
    }
    if (api && api.getScreenshotPath) {
        api.getScreenshotPath().then(function(p) {
            if (screenshotVal) {
                screenshotVal.textContent = p || 'Default (downloads folder)';
            }
        });
    }
    if (api && api.getDataPath) {
        api.getDataPath().then(function(p) {
            if (dataVal) dataVal.textContent = p;
        });
    }
}

(function setupPathsButtons() {
    var dlBtn = document.getElementById('pathsDownloadChange');
    var ssBtn = document.getElementById('pathsScreenshotChange');
    var dataBtn = document.getElementById('pathsDataChange');

    if (dlBtn) {
        dlBtn.addEventListener('click', function() {
            if (!api || !api.setDownloadPath) return;
            api.setDownloadPath().then(function(r) {
                if (r && r.success) {
                    var v = document.getElementById('pathsDownloadValue');
                    if (v) v.textContent = r.path;
                }
            });
        });
    }

    if (ssBtn) {
        ssBtn.addEventListener('click', function() {
            if (!api || !api.setScreenshotPath) return;
            api.setScreenshotPath().then(function(r) {
                if (r && r.success) {
                    var v = document.getElementById('pathsScreenshotValue');
                    if (v) v.textContent = r.path;
                }
            });
        });
    }

    if (dataBtn) {
        dataBtn.addEventListener('click', function() {
            if (!api || !api.chooseDataPath) return;
            api.chooseDataPath().then(function(chooseResult) {
                if (!chooseResult || !chooseResult.success) return;
                var newPath = chooseResult.path;
                if (!newPath) return;
                var migrateOverlay = document.createElement('div');
                migrateOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;backdrop-filter:blur(4px);';
                migrateOverlay.innerHTML = '<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:16px;padding:32px;text-align:center;min-width:340px;"><div style="font-size:20px;color:var(--text-color);margin-bottom:12px;">Migrating data...</div><div style="color:var(--secondary-text);font-size:14px;">Please wait</div></div>';
                document.body.appendChild(migrateOverlay);
                api.migrateDataPath(newPath).then(function(r) {
                    migrateOverlay.remove();
                    if (r && r.success) {
                        var doneOverlay = document.createElement('div');
                        doneOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001;backdrop-filter:blur(4px);';
                        doneOverlay.innerHTML = '<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:16px;padding:32px;text-align:center;min-width:400px;max-width:90vw;">' +
                            '<div style="font-size:20px;color:#4CAF50;margin-bottom:12px;">Migration complete!</div>' +
                            '<div style="color:var(--secondary-text);font-size:14px;margin-bottom:6px;">Files copied: ' + r.copied + '</div>' +
                            '<div style="color:var(--secondary-text);font-size:14px;margin-bottom:12px;">Deleted from old folder: ' + r.deleted + '</div>' +
                            '<div style="color:var(--secondary-text);font-size:12px;word-break:break-all;margin-bottom:16px;">New path: ' + r.newPath + '</div>' +
                            '<p style="color:#ff9800;font-size:12px;margin-bottom:20px;line-height:1.5;">Browser will restart in 3 seconds...</p>' +
                            '</div>';
                        document.body.appendChild(doneOverlay);
                        setTimeout(function() {
                            if (api && api.restartBrowser) api.restartBrowser();
                        }, 3000);
                    } else {
                        customAlert('Migration error: ' + (r && r.message || 'unknown'));
                    }
                });
            });
        });
    }
})();

// ============== BACKUP SECTION ==============
function loadBackupPage() {
    if (!api || !api.getBackupSettings) return;
    api.getBackupSettings().then(function(s) {
        var toggle = document.getElementById('backupAutoToggle');
        var pathSection = document.getElementById('backupAutoPath');
        var pathValue = document.getElementById('backupAutoPathValue');
        if (toggle) toggle.checked = !!s.autoBackup;
        if (pathSection) pathSection.style.display = s.autoBackup ? 'block' : 'none';
        if (pathValue) pathValue.textContent = s.autoBackupPath || 'Default (userData/backups)';
    });
}

function _backupShowOverlay(html) {
    var ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10001;backdrop-filter:blur(4px);';
    ov.innerHTML = html;
    document.body.appendChild(ov);
    return ov;
}

function _backupHideProgress() {
    var p = document.getElementById('backupProgress');
    if (p) p.style.display = 'none';
}

function _backupShowProgress(text, pct) {
    var p = document.getElementById('backupProgress');
    var t = document.getElementById('backupProgressText');
    var b = document.getElementById('backupProgressBar');
    if (p) p.style.display = 'block';
    if (t) t.textContent = text;
    if (b) b.style.width = pct + '%';
}

(function setupBackupButtons() {
    var exportBtn = document.getElementById('backupExportBtn');
    var importBtn = document.getElementById('backupImportBtn');
    var autoToggle = document.getElementById('backupAutoToggle');
    var autoPathChange = document.getElementById('backupAutoPathChange');

    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            var ov = _backupShowOverlay(
                '<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:16px;padding:28px;min-width:400px;max-width:90vw;">' +
                '<h3 style="color:var(--text-color);margin:0 0 20px;font-size:18px;">Export backup</h3>' +
                '<div style="margin-bottom:16px;padding:14px;background:var(--input-bg);border:1px solid var(--border-color);border-radius:10px;">' +
                    '<div style="font-size:13px;font-weight:500;color:var(--text-color);margin-bottom:10px;">Archive encryption</div>' +
                    '<div style="display:flex;gap:10px;">' +
                        '<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-color);cursor:pointer;"><input type="radio" name="bkEnc" value="no" checked> Without password</label>' +
                        '<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-color);cursor:pointer;"><input type="radio" name="bkEnc" value="yes"> With password / passphrase</label>' +
                    '</div>' +
                    '<div id="bkPwdRow" style="display:none;margin-top:10px;">' +
                        '<input id="bkPwdInput" type="password" placeholder="Password or passphrase (any length, spaces allowed)" style="width:100%;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--input-bg);color:var(--input-color);font-size:13px;box-sizing:border-box;">' +
                        '<input id="bkPwdConfirm" type="password" placeholder="Confirm" style="width:100%;padding:10px 12px;margin-top:8px;border:1px solid var(--border-color);border-radius:8px;background:var(--input-bg);color:var(--input-color);font-size:13px;box-sizing:border-box;">' +
                    '</div>' +
                '</div>' +
                '<div style="margin-bottom:16px;padding:14px;background:var(--input-bg);border:1px solid var(--border-color);border-radius:10px;">' +
                    '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-color);cursor:pointer;margin-bottom:6px;"><input type="checkbox" id="bkUseKeyfile"> Key file (use alone or together with the password)</label>' +
                    '<div style="font-size:11px;color:var(--secondary-text);line-height:1.5;">Any file acts as a key — its contents are mixed into the encryption key. Keep a copy in a safe place: without it the archive cannot be opened. Cookies are included only into encrypted archives.</div>' +
                    '<div id="bkKeyRow" style="display:none;margin-top:10px;align-items:center;gap:8px;">' +
                        '<button id="bkKeyPick" type="button" style="padding:8px 14px;border-radius:8px;border:1px solid var(--border-color);background:var(--btn-bg);color:var(--btn-color);cursor:pointer;font-size:12px;">Choose key file…</button>' +
                        '<span id="bkKeyName" style="font-size:12px;color:var(--secondary-text);word-break:break-all;"></span>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
                    '<button id="bkExpCancel" style="padding:10px 20px;border-radius:10px;background:var(--btn-bg);border:1px solid var(--border-color);color:var(--btn-color);cursor:pointer;font-size:14px;">Cancel</button>' +
                    '<button id="bkExpOk" style="padding:10px 20px;border-radius:10px;border:none;background:var(--accent-gradient);color:#fff;font-weight:600;cursor:pointer;font-size:14px;">Export</button>' +
                '</div></div>'
            );
            var radios = ov.querySelectorAll('input[name="bkEnc"]');
            var pwdRow = ov.querySelector('#bkPwdRow');
            var kfChk = ov.querySelector('#bkUseKeyfile');
            var kfRow = ov.querySelector('#bkKeyRow');
            var kfName = ov.querySelector('#bkKeyName');
            var kfPath = null;
            radios.forEach(function(r) {
                r.addEventListener('change', function() {
                    pwdRow.style.display = r.value === 'yes' && r.checked ? 'block' : 'none';
                });
            });
            if (kfChk) kfChk.addEventListener('change', function() {
                kfRow.style.display = kfChk.checked ? 'flex' : 'none';
                if (!kfChk.checked) { kfPath = null; kfName.textContent = ''; }
            });
            var kfPick = ov.querySelector('#bkKeyPick');
            if (kfPick) kfPick.onclick = function() {
                if (!api || !api.backupPickKeyfile) return;
                api.backupPickKeyfile().then(function(r) {
                    if (r && r.success) { kfPath = r.path; kfName.textContent = '🔑 ' + r.name; }
                }).catch(function() {});
            };
            ov.querySelector('#bkExpCancel').onclick = function() { ov.remove(); };
            ov.querySelector('#bkExpOk').onclick = function() {
                var encrypted = ov.querySelector('input[name="bkEnc"]:checked').value === 'yes';
                var pwd = ov.querySelector('#bkPwdInput').value;
                var pwd2 = ov.querySelector('#bkPwdConfirm').value;
                var useKey = !!(kfChk && kfChk.checked && kfPath);
                if (useKey && !kfPath) { customAlert('Choose a key file first'); return; }
                if (encrypted && pwd !== pwd2) { customAlert('Passwords do not match'); return; }
                if (encrypted && !useKey && pwd.length < 4) { customAlert('Password must be at least 4 characters'); return; }
                // With a key file the passphrase is optional (two-factor by
                // combination), so an empty password is legal there.
                ov.remove();
                _backupShowProgress('Creating archive...', 30);
                if (api && api.backupExport) {
                    api.backupExport(encrypted, encrypted ? pwd : '', useKey ? kfPath : null).then(function(r) {
                        _backupHideProgress();
                        if (r && r.success) {
                            var sizeMB = (r.size / 1024 / 1024).toFixed(2);
                            var info = document.getElementById('backupLastInfo');
                            if (info) {
                                info.style.display = 'block';
                                // Path comes from a save dialog — the user may
                                // type quotes/angle brackets (legal on
                                // Linux/macOS); escape before innerHTML.
                                info.innerHTML = 'Last export: ' + new Date().toLocaleString() + '<br>Size: ' + sizeMB + ' MB<br>File: ' + escapeHtml(r.path);
                            }
                            var doneOv = _backupShowOverlay(
                                '<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:16px;padding:28px;text-align:center;min-width:340px;">' +
                                '<div style="font-size:20px;color:#4CAF50;margin-bottom:12px;">Export complete!</div>' +
                                '<div style="color:var(--secondary-text);font-size:13px;margin-bottom:8px;">Size: ' + sizeMB + ' MB</div>' +
                                '<div style="color:var(--secondary-text);font-size:12px;word-break:break-all;margin-bottom:16px;">' + escapeHtml(r.path) + '</div>' +
                                '<button data-action="dismiss-overlay" style="padding:10px 24px;border-radius:10px;border:none;background:var(--accent-gradient);color:#fff;font-weight:600;cursor:pointer;">OK</button>' +
                                '</div>'
                            );
                        } else {
                            customAlert('Error: ' + (r && r.message || 'unknown'));
                        }
                    });
                }
            };
            ov.addEventListener('click', function(e) { if (e.target === ov) ov.remove(); });
        });
    }

    if (importBtn) {
        importBtn.addEventListener('click', function() {
            if (!api || !api.backupChooseImport) return;
            api.backupChooseImport().then(function(chooseResult) {
                if (!chooseResult || !chooseResult.success) return;
                var filePath = chooseResult.path;
                _backupShowProgress('Checking file...', 10);
                api.backupCheckFile(filePath).then(function(info) {
                    _backupHideProgress();
                    if (!info || !info.success) {
                        customAlert('Error: ' + (info && info.message || 'Could not read file'));
                        return;
                    }
                    var pwdHtml = '';
                    if (info.encrypted) {
                        pwdHtml = '<div style="margin-bottom:16px;">' +
                            '<div style="font-size:13px;font-weight:500;color:var(--text-color);margin-bottom:8px;">Archive is encrypted. Enter password / passphrase:</div>' +
                            '<input id="bkImpPwd" type="password" placeholder="Password or passphrase" style="width:100%;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--input-bg);color:var(--input-color);font-size:13px;box-sizing:border-box;">' +
                            '</div>';
                    }
                    var keyHtml = '';
                    if (info.keyFile) {
                        keyHtml = '<div style="margin-bottom:16px;padding:12px;background:var(--input-bg);border:1px solid var(--border-color);border-radius:10px;">' +
                            '<div style="font-size:13px;font-weight:500;color:var(--text-color);margin-bottom:6px;">🔑 This archive uses a key file</div>' +
                            '<div style="font-size:11px;color:var(--secondary-text);margin-bottom:8px;line-height:1.5;">Select the same key file that was used at export (the password may be empty if the archive was created with the key file alone).</div>' +
                            '<div style="display:flex;align-items:center;gap:8px;">' +
                                '<button id="bkImpKeyPick" type="button" style="padding:8px 14px;border-radius:8px;border:1px solid var(--border-color);background:var(--btn-bg);color:var(--btn-color);cursor:pointer;font-size:12px;">Choose key file…</button>' +
                                '<span id="bkImpKeyName" style="font-size:12px;color:var(--secondary-text);word-break:break-all;"></span>' +
                            '</div></div>';
                    }
                    var ov = _backupShowOverlay(
                        '<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:16px;padding:28px;min-width:420px;max-width:90vw;">' +
                        '<h3 style="color:var(--text-color);margin:0 0 12px;font-size:18px;">Import backup</h3>' +
                        '<div style="font-size:12px;color:var(--secondary-text);margin-bottom:4px;">Version: ' + (info.version || '?') + ' | Date: ' + (info.date || '?') + '</div>' +
                        (info.encrypted ? '<div style="font-size:12px;color:#ff9800;margin-bottom:12px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Archive is encrypted</div>' : '<div style="font-size:12px;color:#4CAF50;margin-bottom:12px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg> Without encryption</div>') +
                        pwdHtml +
                        keyHtml +
                        '<div style="font-size:13px;font-weight:500;color:var(--text-color);margin-bottom:10px;">What to import?</div>' +
                        '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:20px;">' +
                            '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-color);cursor:pointer;"><input type="checkbox" id="bkImpSettings" checked> Settings</label>' +
                            '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-color);cursor:pointer;"><input type="checkbox" id="bkImpHistory" checked> History</label>' +
                            '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-color);cursor:pointer;"><input type="checkbox" id="bkImpScripts" checked> Scripts</label>' +
                            '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-color);cursor:pointer;"><input type="checkbox" id="bkImpBookmarks" checked> Bookmarks</label>' +
                            '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-color);cursor:pointer;"><input type="checkbox" id="bkImpPasswords" checked> Passwords</label>' +
                            '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:' + (info.cookies ? 'var(--text-color)' : 'var(--secondary-text)') + ';cursor:' + (info.cookies ? 'pointer' : 'default') + ';"><input type="checkbox" id="bkImpCookies"' + (info.cookies ? ' checked' : ' disabled') + '> Cookies' + (info.cookies ? '' : ' (not in archive)') + '</label>' +
                            '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-color);cursor:pointer;"><input type="checkbox" id="bkImpThemes" checked> Site themes</label>' +
                            '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-color);cursor:pointer;"><input type="checkbox" id="bkImpBlocker" checked> Blocker rules</label>' +
                            '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-color);cursor:pointer;"><input type="checkbox" id="bkImpSponsorblock" checked> SponsorBlock</label>' +
                            '<label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-color);cursor:pointer;"><input type="checkbox" id="bkImpProfiles" checked> Profiles</label>' +
                        '</div>' +
                        '<div style="display:flex;gap:10px;justify-content:flex-end;">' +
                            '<button id="bkImpCancel" style="padding:10px 20px;border-radius:10px;background:var(--btn-bg);border:1px solid var(--border-color);color:var(--btn-color);cursor:pointer;font-size:14px;">Cancel</button>' +
                            '<button id="bkImpOk" style="padding:10px 20px;border-radius:10px;border:none;background:var(--accent-gradient);color:#fff;font-weight:600;cursor:pointer;font-size:14px;">Import</button>' +
                        '</div></div>'
                    );
                    ov.querySelector('#bkImpCancel').onclick = function() { ov.remove(); };
                    var impKeyPath = null;
                    var impKeyPick = ov.querySelector('#bkImpKeyPick');
                    if (impKeyPick) impKeyPick.onclick = function() {
                        if (!api || !api.backupPickKeyfile) return;
                        api.backupPickKeyfile().then(function(r) {
                            if (r && r.success) {
                                impKeyPath = r.path;
                                var kn = ov.querySelector('#bkImpKeyName');
                                if (kn) kn.textContent = '🔑 ' + r.name;
                            }
                        }).catch(function() {});
                    };
                    ov.querySelector('#bkImpOk').onclick = function() {
                        var pwd = info.encrypted ? (ov.querySelector('#bkImpPwd').value || '') : '';
                        if (info.encrypted && !pwd && !impKeyPath) { customAlert('Enter password or select the key file'); return; }
                        if (info.keyFile && !impKeyPath) { customAlert('This archive requires its key file'); return; }
                        var opts = {
                            settings: !!ov.querySelector('#bkImpSettings').checked,
                            history: !!ov.querySelector('#bkImpHistory').checked,
                            scripts: !!ov.querySelector('#bkImpScripts').checked,
                            bookmarks: !!ov.querySelector('#bkImpBookmarks').checked,
                            passwords: !!ov.querySelector('#bkImpPasswords').checked,
                            cookies: !!(ov.querySelector('#bkImpCookies') && ov.querySelector('#bkImpCookies').checked && !ov.querySelector('#bkImpCookies').disabled),
                            siteThemes: !!ov.querySelector('#bkImpThemes').checked,
                            blockedLog: !!ov.querySelector('#bkImpBlocker').checked,
                            sponsorblock: !!ov.querySelector('#bkImpSponsorblock').checked,
                            profiles: !!ov.querySelector('#bkImpProfiles').checked
                        };
                        ov.remove();
                        _backupShowProgress('Importing data...', 50);
                        api.backupImport(filePath, pwd, opts, impKeyPath).then(function(r) {
                            _backupHideProgress();
                            if (r && r.success) {
                                var doneOv = _backupShowOverlay(
                                    '<div style="background:var(--card-bg);border:1px solid var(--border-color);border-radius:16px;padding:28px;text-align:center;min-width:340px;">' +
                                    '<div style="font-size:20px;color:#4CAF50;margin-bottom:12px;">Import complete!</div>' +
                                    '<div style="color:var(--secondary-text);font-size:13px;margin-bottom:16px;">Sections imported: ' + r.imported.length + (r.cookiesRestored ? '<br>Cookies restored: ' + r.cookiesRestored : '') + '</div>' +
                                    '<p style="color:#ff9800;font-size:12px;margin-bottom:16px;line-height:1.5;">It is recommended to restart the browser to apply all changes.</p>' +
                                    '<button data-action="dismiss-overlay" style="padding:10px 24px;border-radius:10px;border:none;background:var(--accent-gradient);color:#fff;font-weight:600;cursor:pointer;">OK</button>' +
                                    '</div>'
                                );
                            } else if (r && r.needPassword) {
                                customAlert('Archive is encrypted — enter password');
                            } else {
                                customAlert('Error: ' + (r && r.message || 'unknown'));
                            }
                        });
                    };
                    ov.addEventListener('click', function(e) { if (e.target === ov) ov.remove(); });
                });
            });
        });
    }

    if (autoToggle) {
        autoToggle.addEventListener('change', function() {
            var pathSection = document.getElementById('backupAutoPath');
            if (pathSection) pathSection.style.display = autoToggle.checked ? 'block' : 'none';
            if (api && api.setBackupSettings) {
                api.setBackupSettings({ autoBackup: autoToggle.checked });
            }
        });
    }

    if (autoPathChange) {
        autoPathChange.addEventListener('click', function() {
            if (!api || !api.setDownloadPath) return;
            api.setDownloadPath().then(function(r) {
                if (r && r.success) {
                    var v = document.getElementById('backupAutoPathValue');
                    if (v) v.textContent = r.path;
                    if (api && api.setBackupSettings) {
                        api.setBackupSettings({ autoBackupPath: r.path });
                    }
                }
            });
        });
    }
})();

// ==================== FONTS (family + rendering) ====================
(function() {
    var fontStacks = {
        system: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
        roboto: "'Roboto', 'Segoe UI', Arial, sans-serif",
        inter: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        sfpro: "'SF Pro Display', -apple-system, sans-serif",
        verdana: "Verdana, Geneva, sans-serif",
        serif: "Georgia, 'Times New Roman', serif",
        mono: "'Fira Code', 'Consolas', 'Courier New', monospace"
    };
    function applyFontFamilyLocal(f) {
        var stack = fontStacks[f] || fontStacks.system;
        document.documentElement.style.setProperty('--base-font-family', stack);
        document.body.style.fontFamily = stack;
    }
    function applyFontRenderingLocal(m) {
        if (m === 'on') {
            document.documentElement.style.setProperty('-webkit-font-smoothing', 'antialiased');
            document.documentElement.style.setProperty('text-rendering', 'optimizeLegibility');
        } else if (m === 'off') {
            document.documentElement.style.setProperty('-webkit-font-smoothing', 'none');
            document.documentElement.style.removeProperty('text-rendering');
        } else {
            document.documentElement.style.removeProperty('-webkit-font-smoothing');
            document.documentElement.style.removeProperty('text-rendering');
        }
    }
    var famSel = document.getElementById('font-family-select');
    var renSel = document.getElementById('font-rendering-select');
    // Load
    if (api && api.getCustomizationSettings) {
        api.getCustomizationSettings().then(function(r) {
            var s = (r && r.settings) || {};
            if (s.fontFamily && famSel) { famSel.value = s.fontFamily; applyFontFamilyLocal(s.fontFamily); }
            if (s.fontRendering && renSel) { renSel.value = s.fontRendering; applyFontRenderingLocal(s.fontRendering); }
        }).catch(function() {});
    }
    if (famSel) famSel.addEventListener('change', function() {
        applyFontFamilyLocal(famSel.value);
        if (api && api.saveCustomizationSettings) api.saveCustomizationSettings({ fontFamily: famSel.value });
    });
    if (renSel) renSel.addEventListener('change', function() {
        applyFontRenderingLocal(renSel.value);
        if (api && api.saveCustomizationSettings) api.saveCustomizationSettings({ fontRendering: renSel.value });
    });
})();

// ==================== HOTKEYS EDITOR ====================
var _hkActions = null;
var _hkBindings = null;
var _hkDefaults = null;
var _hkRecording = null; // action currently being recorded
function _hkFormat(b) {
    if (!b || !b.key) return '— not assigned —';
    var parts = [];
    if (b.ctrl) parts.push('Ctrl');
    if (b.shift) parts.push('Shift');
    if (b.alt) parts.push('Alt');
    // human-readable key
    var k = b.key;
    var map = { ' ': 'Space', 'ArrowLeft': '←', 'ArrowRight': '→', 'ArrowUp': '↑', 'ArrowDown': '↓' };
    if (map[k]) k = map[k];
    else if (k.length === 1) k = k.toUpperCase();
    parts.push(k);
    return parts.join(' + ');
}
function loadHotkeysPage() {
    if (!api || !api.getKeybindings) return;
    var list = document.getElementById('hotkeysList');
    if (!list) return;
    list.innerHTML = '<div style="color:var(--secondary-text);padding:14px;">Loading…</div>';
    api.getKeybindings().then(function(res) {
        if (!res) return;
        _hkActions = res.actions || [];
        _hkBindings = res.bindings || {};
        _hkDefaults = res.defaults || {};
        renderHotkeysList();
        var ov = document.getElementById('hkOverlay');
        if (ov) {
            ov.checked = res.overlayEnabled !== false;
            ov.onchange = function() {
                if (api && api.setHotkeysOverlay) api.setHotkeysOverlay(ov.checked);
            };
        }
    }).catch(function() {
        list.innerHTML = '<div style="color:#e74c3c;padding:14px;">Error loading</div>';
    });
    var resetBtn = document.getElementById('hkResetBtn');
    if (resetBtn) resetBtn.onclick = async function() {
        if (!await customConfirm('Reset all hotkeys to defaults?')) return;
        if (!api || !api.resetKeybindings) return;
        api.resetKeybindings().then(function(r) {
            if (r && r.bindings) { _hkBindings = r.bindings; renderHotkeysList(); }
        });
    };
    // Also load the Vim block — it lives in this same section
    try { loadVimBlock(); } catch(e) {}
}

// ============== HOME PAGE ==============
(function() {
    if (!api || !api.getHomepage) return;
    var enabled = document.getElementById('hpEnabled');
    var config = document.getElementById('hpConfig');
    var typeSel = document.getElementById('hpType');
    var urlRow = document.getElementById('hpUrlRow');
    var fileRow = document.getElementById('hpFileRow');
    var urlInput = document.getElementById('hpUrl');
    var pathLabel = document.getElementById('hpFilePath');
    var applyBtn = document.getElementById('hpApplyUrl');
    var chooseBtn = document.getElementById('hpChooseFile');
    if (!enabled || !config) return;

    var state = { type: 'default', value: '' };

    function syncUI() {
        enabled.checked = state.type !== 'default';
        config.style.display = state.type !== 'default' ? 'block' : 'none';
        if (state.type === 'file') {
            typeSel.value = 'file';
            urlRow.style.display = 'none';
            fileRow.style.display = 'flex';
            pathLabel.textContent = state.value ? state.value.replace(/^file:\/\//, '') : 'No file selected';
        } else if (state.type === 'url') {
            typeSel.value = 'url';
            urlRow.style.display = 'flex';
            fileRow.style.display = 'none';
            urlInput.value = state.value;
        } else {
            // default — show URL mode as starting point for configuration
            typeSel.value = 'url';
            urlRow.style.display = 'flex';
            fileRow.style.display = 'none';
            urlInput.value = '';
        }
    }

    api.getHomepage().then(function(hp) {
        if (hp && hp.type) state = { type: hp.type, value: hp.value || '' };
        syncUI();
    }).catch(function() { syncUI(); });

    enabled.addEventListener('change', function() {
        if (enabled.checked) {
            // Activate with the current type selection
            state.type = typeSel.value === 'file' ? 'file' : 'url';
            // If there is a value — apply it; if not — just show the config,
            // wait for the user to enter URL/select a file
            if (state.value) {
                applyHomepage();
            } else {
                syncUI();
            }
        } else {
            state.type = 'default';
            state.value = '';
            applyHomepage();
        }
    });

    typeSel.addEventListener('change', function() {
        var t = typeSel.value === 'file' ? 'file' : 'url';
        state.type = t;
        if (enabled.checked) {
            // Do not apply immediately — let the user enter a value
        }
        syncUI();
    });

    applyBtn.addEventListener('click', function() {
        state.type = 'url';
        state.value = urlInput.value.trim();
        applyHomepage();
    });
    urlInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { state.type = 'url'; state.value = urlInput.value.trim(); applyHomepage(); }
    });

    chooseBtn.addEventListener('click', function() {
        if (!api || !api.chooseHomepageFile) return;
        chooseBtn.disabled = true;
        api.chooseHomepageFile().then(function(r) {
            chooseBtn.disabled = false;
            if (!r || r.canceled) return;
            state.type = 'file';
            state.value = r.url || ('file://' + r.path);
            enabled.checked = true;
            applyHomepage();
            syncUI();
        }).catch(function() { chooseBtn.disabled = false; });
    });

    function applyHomepage() {
        if (!api || !api.setHomepage) return;
        api.setHomepage({ type: state.type, value: state.value }).then(function(r) {
            if (r && r.homepage) { state = { type: r.homepage.type, value: r.homepage.value }; syncUI(); }
        }).catch(function() {});
    }
})();

// ============== VIM CONTROL (in the "Hotkeys" section) ==============
var _vimActions = [
    { id: 'scrollDown',  name: 'Scroll down',          group: 'Navigation' },
    { id: 'scrollUp',    name: 'Scroll up',         group: 'Navigation' },
    { id: 'scrollLeft',  name: 'Scroll left',         group: 'Navigation' },
    { id: 'scrollRight', name: 'Scroll right',        group: 'Navigation' },
    { id: 'scrollPageDown', name: 'Page down',  group: 'Navigation' },
    { id: 'scrollPageUp',   name: 'Page up', group: 'Navigation' },
    { id: 'scrollHalfDown', name: 'Half page down', group: 'Navigation' },
    { id: 'scrollHalfUp',   name: 'Half page up', group: 'Navigation' },
    { id: 'scrollTop',   name: 'Top of page',    group: 'Navigation' },
    { id: 'scrollBottom',name: 'Bottom of page',     group: 'Navigation' },
    { id: 'scrollLeftmost',  name: 'To left edge',    group: 'Navigation' },
    { id: 'scrollRightmost', name: 'To right edge',   group: 'Navigation' },
    { id: 'hint',        name: 'Click link (hint)', group: 'Navigation' },
    { id: 'hintTab',     name: 'Link in new tab', group: 'Navigation' },
    { id: 'find',        name: 'Search (find bar)',     group: 'Navigation' },
    { id: 'searchForward', name: 'Search on page (/)', group: 'Navigation' },
    { id: 'searchNext',  name: 'Next match', group: 'Navigation' },
    { id: 'searchPrev',  name: 'Previous match',group: 'Navigation' },
    { id: 'prevPage',    name: 'Previous page ([[])', group: 'Navigation' },
    { id: 'nextPage',    name: 'Next page (]])', group: 'Navigation' },
    { id: 'yankUrl',     name: 'Copy URL (yy)',  group: 'Clipboard' },
    { id: 'pasteUrl',    name: 'Open URL from clipboard (p)', group: 'Clipboard' },
    { id: 'enterInsert',   name: 'Enter INSERT mode', group: 'Modes' },
    { id: 'enterVisual',   name: 'Enter VISUAL mode', group: 'Modes' },
    { id: 'enterVisualLine', name: 'VISUAL LINE mode', group: 'Modes' },
    { id: 'enterCommand',  name: 'Command line (:)', group: 'Modes' },
    { id: 'reload',      name: 'Reload tab',     group: 'Browser' },
    { id: 'reloadHard',  name: 'Reload (clear cache)',group: 'Browser' },
    { id: 'stopLoad',    name: 'Stop loading',  group: 'Browser' },
    { id: 'newTab',      name: 'New tab',        group: 'Browser' },
    { id: 'closeTab',    name: 'Close tab',      group: 'Browser' },
    { id: 'restoreTab',  name: 'Restore tab', group: 'Browser' },
    { id: 'nextTab',     name: 'Next tab',    group: 'Browser' },
    { id: 'prevTab',     name: 'Previous tab',   group: 'Browser' },
    { id: 'focusUrl',    name: 'Focus address bar', group: 'Browser' },
    { id: 'focusUrlCurrent', name: 'Address bar with current URL', group: 'Browser' },
    { id: 'back',        name: 'Back',                group: 'Browser' },
    { id: 'forward',     name: 'Forward',               group: 'Browser' },
    { id: 'zoomIn',      name: 'Zoom in',    group: 'Browser' },
    { id: 'zoomOut',     name: 'Zoom out',    group: 'Browser' },
    { id: 'zoomReset',   name: 'Reset zoom',     group: 'Browser' }
];
var _vimState = { enabled: false, keys: {} };

var _VIM_LAT_SHIFT = { Digit0:')',Digit1:'!',Digit2:'@',Digit3:'#',Digit4:'$',Digit5:'%',
  Digit6:'^',Digit7:'&',Digit8:'*',Digit9:'(','Minus':'_','Equal':'+','BracketLeft':'{',
  'BracketRight':'}','Semicolon':':','Quote':'"','Comma':'<','Period':'>','Slash':'?',
  'Backslash':'|','Backquote':'~' };
var _VIM_LAT_BASE = { Digit0:'0',Digit1:'1',Digit2:'2',Digit3:'3',Digit4:'4',Digit5:'5',
  Digit6:'6',Digit7:'7',Digit8:'8',Digit9:'9','Minus':'-','Equal':'=','BracketLeft':'[',
  'BracketRight':']','Semicolon':';',"Quote":"'","Comma":',','Period':'.','Slash':'/',
  'Backslash':'\\','Backquote':'`' };
function _spzLatinChar(code, shift) {
  if (!code) return null;
  var m = /^Key([A-Z])$/.exec(code);
  if (m) return shift ? m[1] : m[1].toLowerCase();
  if (shift) return _VIM_LAT_SHIFT[code] || null;
  return _VIM_LAT_BASE[code] || null;
}

function _vimFormatKey(s) {
    if (!s) return '—';
    return s.split('+').map(function(p) {
        if (p === 'ctrl') return 'Ctrl';
        if (p === 'shift') return 'Shift';
        if (p === 'alt') return 'Alt';
        if (p === 'meta') return 'Cmd';
        if (p.length === 1) return p.toUpperCase();
        return p;
    }).join(' + ');
}

function loadVimBlock() {
    if (!api || !api.getVimSettings) return;
    var list = document.getElementById('vimKeysList');
    if (!list) return;
    api.getVimSettings().then(function(v) {
        _vimState.enabled = !!(v && v.enabled);
        _vimState.keys = (v && v.keys) || {};
        var en = document.getElementById('vimEnabled');
        if (en) en.checked = _vimState.enabled;
        renderVimKeys();
    }).catch(function() {});
    var en = document.getElementById('vimEnabled');
    if (en) en.onchange = function() {
        _vimState.enabled = en.checked;
        if (api && api.setVimSettings) {
            api.setVimSettings({ enabled: _vimState.enabled, keys: _vimState.keys });
        }
    };
    var reset = document.getElementById('vimResetBtn');
    if (reset) reset.onclick = async function() {
        if (!await customConfirm('Reset Vim keys to defaults?')) return;
        if (!api || !api.resetVimSettings) return;
        api.resetVimSettings().then(function(r) {
            if (r && r.vim) {
                _vimState.enabled = r.vim.enabled;
                _vimState.keys = r.vim.keys || {};
                if (en) en.checked = _vimState.enabled;
                renderVimKeys();
            }
        });
    };
}

function renderVimKeys() {
    var list = document.getElementById('vimKeysList');
    if (!list) return;
    list.innerHTML = '';
    var lastGroup = null;
    _vimActions.forEach(function(act) {
        if (act.group !== lastGroup) {
            lastGroup = act.group;
            var g = document.createElement('div');
            g.style.cssText = 'font-size:12px;color:var(--secondary-text);margin:14px 0 4px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;';
            g.textContent = act.group;
            list.appendChild(g);
        }
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;gap:12px;';
        var label = document.createElement('div');
        label.style.cssText = 'font-size:14px;color:var(--text-color);';
        label.textContent = act.name;
        var cap = document.createElement('button');
        cap.type = 'button';
        cap.style.cssText = 'min-width:90px;padding:6px 12px;border:1px solid var(--border-color);border-radius:6px;background:var(--input-bg);color:var(--text-color);font:600 12px/1.4 monospace;cursor:pointer;text-align:center;';
        cap.textContent = _vimFormatKey(_vimState.keys[act.id]);
        cap.title = 'Click, then press a new key (Enter — save, Esc — cancel)';
        cap.addEventListener('click', function() { _vimRecordKey(cap, act.id); });
        row.appendChild(label);
        row.appendChild(cap);
        list.appendChild(row);
    });
}

function _vimRecordKey(btn, actionId) {
    var original = _vimState.keys[actionId] || '';
    var firstKey = null;
    var pendingSecond = false;
    btn.dataset.recording = '1';
    btn.style.background = 'var(--accent,#4caf50)';
    btn.style.color = '#fff';
    btn.textContent = '… key?';

    function restore() {
        btn.removeAttribute('data-recording');
        btn.style.background = 'var(--input-bg)';
        btn.style.color = 'var(--text-color)';
        btn.textContent = _vimFormatKey(_vimState.keys[actionId]);
        document.removeEventListener('keydown', onKey, true);
    }

    function commit(val) {
        _vimState.keys[actionId] = val;
        if (api && api.setVimSettings) {
            api.setVimSettings({ enabled: _vimState.enabled, keys: _vimState.keys });
        }
        restore();
    }

    function onKey(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') { restore(); return; }
        if (e.key === 'Enter') { commit(firstKey || original); return; }
        if (e.key === 'Backspace' || e.key === 'Delete') { commit(''); return; }
        // Ignore "bare" modifiers
        if (['Control','Shift','Alt','Meta'].indexOf(e.key) !== -1) return;
        if (e.key === 'Tab') return;

        // Build the key string
        var k = '';
        if (e.ctrlKey || e.metaKey) k += 'Ctrl+';
        if (e.altKey) k += 'Alt+';
        // Latinize via e.code — so the recorded key matches what the engine expects
        // on ANY keyboard layout (the engine latinizes via e.code too).
        var _lat = _spzLatinChar(e.code || '', e.shiftKey);
        var keyName = (_lat !== null) ? _lat : (e.key || '');
        // Shift + single letter/symbol → the character itself (e.g. 'J', 'G', '+', '$')
        if (e.shiftKey && keyName.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            k = keyName; // 'J', 'G', 'H', 'L', '+', '$' etc.
        } else if (e.shiftKey && !(e.ctrlKey || e.metaKey || e.altKey)) {
            // Shift + special key (arrow etc.) — not very useful, skip
            k = '';
        } else {
            k += keyName.length === 1 ? keyName.toLowerCase() : keyName.toLowerCase();
        }
        if (!k) return;

        if (firstKey && !pendingSecond) {
            // Second key of the sequence
            commit(firstKey + k);
        } else if (firstKey) {
            commit(firstKey + k);
        } else {
            // First key — check if it is in defaults/current maps
            // two-key sequences. If yes — wait for the second.
            var hasMulti = Object.keys(_vimState.keys).some(function(actId) {
                var v = _vimState.keys[actId];
                return v && v.length > 1 && v[0] === k[0] && actId !== actionId;
            });
            // Also support 'gg' for the current action: offer to add a second
            firstKey = k;
            btn.textContent = k + ' + …  (Enter — save, Esc — cancel)';
            // Wait for the second key 1.2 sec, otherwise save single
            pendingSecond = true;
            setTimeout(function() {
                if (btn.dataset.recording === '1' && pendingSecond) {
                    commit(firstKey);
                }
            }, 1200);
        }
    }
    document.addEventListener('keydown', onKey, true);
}


function renderHotkeysList() {
    var list = document.getElementById('hotkeysList');
    if (!list || !_hkActions) return;
    list.innerHTML = '';
    _hkActions.forEach(function(act) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:10px;gap:12px;';
        var label = document.createElement('div');
        label.style.cssText = 'flex:1;min-width:0;';
        label.innerHTML = '<div style="font-size:14px;font-weight:500;color:var(--text-color);">' + act.label + '</div>' +
            '<div style="font-size:11px;color:var(--secondary-text);margin-top:2px;"><span>Default</span>: ' + _hkFormat(_hkDefaults[act.id]) + '</div>';
        var combo = document.createElement('div');
        combo.style.cssText = 'font-family:monospace;font-size:13px;font-weight:600;color:var(--text-color);background:var(--input-bg);padding:8px 14px;border-radius:8px;border:1px solid var(--border-color);min-width:160px;text-align:center;cursor:pointer;';
        combo.textContent = _hkFormat(_hkBindings[act.id]);
        combo.title = 'Click to reassign';
        combo.onclick = function() { _hkStartRecording(act.id, combo, label); };
        row.appendChild(label);
        row.appendChild(combo);
        list.appendChild(row);
    });
}
function _hkStartRecording(action, comboEl, labelEl) {
    _hkRecording = action;
    // Tell the main process that we are in recording mode — it should not
    // intercept key presses as shortcuts, otherwise recording an existing
    // combination would be impossible (it would trigger before recording).
    if (api && api.setKeybindingRecording) api.setKeybindingRecording(true);
    var hint = document.getElementById('hkRecorderHint');
    if (hint) {
        hint.style.display = 'block';
        hint.innerHTML = 'Press a new shortcut for "<b>' + (labelEl.querySelector('div').textContent) + '</b>". <b>Esc</b> — cancel.';
    }
    comboEl.textContent = '… press a key …';
    comboEl.style.background = 'linear-gradient(135deg,#667eea,#764ba2)';
    comboEl.style.color = '#fff';
    function handler(e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
            e.preventDefault();
            document.removeEventListener('keydown', handler, true);
            _hkRecording = null;
            if (api && api.setKeybindingRecording) api.setKeybindingRecording(false);
            comboEl.style.background = '';
            comboEl.style.color = '';
            if (hint) hint.style.display = 'none';
            comboEl.textContent = _hkFormat(_hkBindings[action]);
            return;
        }
        // ignore "bare" modifiers
        if (['Control','Alt','Shift','Meta'].indexOf(e.key) !== -1) return;
        e.preventDefault();
        e.stopPropagation();
        var isFKey = /^F\d{1,2}$/.test(e.key);
        var hasModifier = e.ctrlKey || e.metaKey || e.altKey;
        // disallow "bare" letters/numbers — only with modifier or F-key
        if (!hasModifier && !isFKey) {
            if (hint) {
                hint.style.display = 'block';
                hint.innerHTML = 'Need a combination with <b>Ctrl/Alt/Shift</b> or an F-key (F1–F12). Try again for "<b>' + labelEl.querySelector('div').textContent + '</b>».';
            }
            comboEl.style.background = 'rgba(231,76,60,0.3)';
            setTimeout(function(){ comboEl.style.background = ''; }, 600);
            return;
        }
        document.removeEventListener('keydown', handler, true);
        var binding = {
            ctrl: !!(e.ctrlKey || e.metaKey),
            shift: !!e.shiftKey,
            alt: !!e.altKey,
            key: e.key.length === 1 ? e.key.toLowerCase() : e.key
        };
        if (!api || !api.setKeybinding) {
            if (api && api.setKeybindingRecording) api.setKeybindingRecording(false);
            _hkRecording = null;
            return;
        }
        api.setKeybinding(action, binding).then(function(r) {
            if (r && r.success && r.bindings) {
                _hkBindings = r.bindings;
                comboEl.style.background = '';
                comboEl.style.color = '';
                comboEl.textContent = _hkFormat(_hkBindings[action]);
                if (hint) hint.style.display = 'none';
                _hkRecording = null;
                if (api && api.setKeybindingRecording) api.setKeybindingRecording(false);
            } else {
                customAlert((r && r.error) || 'Could not save');
                comboEl.style.background = '';
                comboEl.style.color = '';
                comboEl.textContent = _hkFormat(_hkBindings[action]);
                _hkRecording = null;
                if (api && api.setKeybindingRecording) api.setKeybindingRecording(false);
            }
        });
    }
    document.addEventListener('keydown', handler, true);
}
// Safety: if the user leaves the Settings page during recording —
// disable the mode so the main process starts processing shortcuts again.
window.addEventListener('beforeunload', function() {
    try {
        if (window.electronAPI && window.electronAPI.setKeybindingRecording) {
            window.electronAPI.setKeybindingRecording(false);
        }
    } catch(e) {}
});

// ==================== ELEMENT ZAPPER PAGE ====================
function loadElementZapperPage() {
    if (!api) return;
    var toggle = document.getElementById('zapperEnabledToggle');
    var list = document.getElementById('zapperRulesList');
    if (toggle && api.getElementZapperEnabled) {
        api.getElementZapperEnabled().then(function(v) {
            toggle.checked = v !== false;
        }).catch(function() {});
        toggle.onchange = function() {
            if (api.setElementZapperEnabled) api.setElementZapperEnabled(toggle.checked);
        };
    }
    if (list && api.getElementHidingRules) {
        api.getElementHidingRules().then(renderZapperRules).catch(function() {});
    }
}

// =============== LIBRARY PROTECTION ===============
function loadLibraryProtectionPage() {
    if (!api || !api.getLibraryProtection) return;
    var tPwd = document.getElementById('libProtPasswordToggle');
    var tBio = document.getElementById('libProtBiometricToggle');
    var tEnh = document.getElementById('libProtEnhancedToggle');
    var tSet = document.getElementById('libProtSettingsToggle');
    var tBak = document.getElementById('libProtBackupToggle');
    var tApp = document.getElementById('libProtAppLockToggle');
    var tIdle = document.getElementById('libProtIdleLockToggle');
    var tIdleMin = document.getElementById('libProtIdleMinutes');
    var tIdleWrap = document.getElementById('idleLockMinutesWrap');
    var noMaster = document.getElementById('libProtNoMaster');
    var hasMasterBox = document.getElementById('libProtHasMaster');
    var bioHint = document.getElementById('libProtBioHint');
    if (!tPwd) return;

    var _hasMaster = false;

    // Collect every protection toggle into one object so each handler saves
    // the FULL state (otherwise saving one toggle would wipe the others).
    function gather() {
        return {
            passwordRequired: tPwd.checked,
            biometricRequired: tBio.checked,
            enhancedProtection: tEnh.checked,
            protectSettings: tSet.checked,
            protectBackup: tBak.checked,
            appLock: tApp.checked,
            idleLock: tIdle ? tIdle.checked : false,
            idleLockMinutes: tIdleMin ? parseInt(tIdleMin.value, 10) : 5
        };
    }

    function refreshBanners(has) {
        _hasMaster = has;
        if (noMaster) noMaster.style.display = has ? 'none' : 'block';
        if (hasMasterBox) hasMasterBox.style.display = has ? 'block' : 'none';
    }

    api.getLibraryProtection().then(function(cfg) {
        refreshBanners(!!cfg.hasMasterPassword);
        if (bioHint) bioHint.textContent = cfg.biometricAvailable ? '(available)' : '(not available on this device)';
        tPwd.checked = cfg.passwordRequired !== false;
        tBio.checked = !!cfg.biometricRequired;
        tEnh.checked = !!cfg.enhancedProtection;
        if (tSet) tSet.checked = !!cfg.protectSettings;
        if (tBak) tBak.checked = !!cfg.protectBackup;
        if (tApp) tApp.checked = !!cfg.appLock;
        if (tIdle) tIdle.checked = !!cfg.idleLock;
        if (tIdleMin && cfg.idleLockMinutes) tIdleMin.value = String(cfg.idleLockMinutes);
        if (tIdleWrap) tIdleWrap.style.display = (tIdle && tIdle.checked) ? 'flex' : 'none';
        tBio.disabled = !cfg.biometricAvailable;
    }).catch(function() {});

    // ===== Set / change password modal =====
    var pwdOverlay = document.getElementById('libProtPwdOverlay');
    var pwdTitle = document.getElementById('libProtPwdTitle');
    var pwdOld = document.getElementById('libProtPwdOld');
    var pwdNew = document.getElementById('libProtPwdNew');
    var pwdConfirm = document.getElementById('libProtPwdConfirm');
    var pwdError = document.getElementById('libProtPwdError');
    var pwdCancel = document.getElementById('libProtPwdCancel');
    var pwdSave = document.getElementById('libProtPwdSave');
    var btnSetPwd = document.getElementById('libProtSetPwdBtn');
    var btnChangePwd = document.getElementById('libProtChangePwdBtn');

    function openPwdModal(isChange) {
        pwdTitle.textContent = isChange ? 'Change password' : 'Set password';
        pwdOld.value = ''; pwdNew.value = ''; pwdConfirm.value = '';
        pwdError.textContent = '';
        pwdOld.style.display = isChange ? 'block' : 'none';
        pwdOld.placeholder = 'Current password';
        pwdOverlay.style.display = 'flex';
        setTimeout(function() { (isChange ? pwdOld : pwdNew).focus(); }, 30);
    }
    function closePwdModal() { pwdOverlay.style.display = 'none'; }

    if (btnSetPwd) btnSetPwd.onclick = function() { openPwdModal(false); };
    if (btnChangePwd) btnChangePwd.onclick = function() { openPwdModal(true); };
    if (pwdCancel) pwdCancel.onclick = closePwdModal;

    if (pwdSave) pwdSave.onclick = function() {
        pwdError.textContent = '';
        var np = pwdNew.value, cp = pwdConfirm.value;
        var isChange = pwdOld.style.display !== 'none';
        if (!np || np.length < 8) { pwdError.textContent = 'Password must be at least 8 characters'; return; }
        if (np !== cp) { pwdError.textContent = 'Passwords do not match'; return; }
        pwdSave.disabled = true; pwdSave.textContent = 'Saving…';
        var promise;
        if (isChange && api.changeMasterPassword) {
            promise = api.changeMasterPassword(pwdOld.value, np);
        } else if (api.setMasterPassword) {
            promise = api.setMasterPassword(np);
        } else {
            pwdError.textContent = 'Not available'; pwdSave.disabled = false; pwdSave.textContent = 'Save'; return;
        }
        promise.then(function(r) {
            pwdSave.disabled = false; pwdSave.textContent = 'Save';
            if (r && r.success) {
                closePwdModal();
                showToast(r.message || 'Password saved');
                refreshBanners(true);
                api.getLibraryProtection().then(function(cfg) {
        tPwd.checked = !!cfg.passwordRequired;
                }).catch(function() {});
            } else {
                pwdError.textContent = (r && r.message) || 'Failed';
            }
        }).catch(function(e) {
            pwdSave.disabled = false; pwdSave.textContent = 'Save';
            pwdError.textContent = 'Failed: ' + (e && e.message ? e.message : 'error');
        });
    };
    [pwdOld, pwdNew, pwdConfirm].forEach(function(el) {
        if (el) el.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') pwdSave.click();
            if (e.key === 'Escape') closePwdModal();
        });
    });

    // Pending change that needs a password confirmation.
    var pendingChange = null;
    var overlay = document.getElementById('libProtConfirmOverlay');
    var inp = document.getElementById('libProtConfirmInput');
    var err = document.getElementById('libProtConfirmError');
    var btnCancel = document.getElementById('libProtConfirmCancel');
    var btnOk = document.getElementById('libProtConfirmOk');

    function showConfirm(nextSettings) {
        pendingChange = nextSettings;
        err.textContent = '';
        inp.value = '';
        overlay.style.display = 'flex';
        setTimeout(function() { inp.focus(); }, 30);
    }
    function hideConfirm() {
        pendingChange = null;
        overlay.style.display = 'none';
    }

    tPwd.onchange = function() {
        if (tPwd.checked && !_hasMaster) {
            // Turning ON but no password set yet — prompt to create one.
            tPwd.checked = false;
            openPwdModal(false);
            return;
        }
        var next = gather();
        if (!tPwd.checked) {
            // Disabling — need password confirmation.
            showConfirm(next);
        } else {
            api.setLibraryProtection(next).catch(function() {});
        }
    };
    tBio.onchange = function() {
        if (tBio.checked && !_hasMaster) {
            tBio.checked = false;
            openPwdModal(false);
            return;
        }
        var next = gather();
        api.setLibraryProtection(next).then(function(r) {
            if (!r || !r.success) { tBio.checked = !tBio.checked; if (r && r.message) showToast(r.message, 'error'); }
        }).catch(function() {});
    };
    tEnh.onchange = function() {
        if (tEnh.checked && !_hasMaster) {
            tEnh.checked = false;
            openPwdModal(false);
            return;
        }
        var next = gather();
        if (!tEnh.checked) {
            // Disabling enhanced protection also needs confirmation.
            showConfirm(next);
        } else {
            api.setLibraryProtection(next).then(function(r) {
                if (!r || !r.success) { tEnh.checked = !tEnh.checked; if (r && r.message) showToast(r.message, 'error'); }
            }).catch(function() {});
        }
    };

    // New protection toggles: turning ON needs a master password to exist;
    // turning OFF needs a password confirmation (it weakens security).
    function bindProtectToggle(t) {
        if (!t) return;
        t.onchange = function() {
            if (t.checked && !_hasMaster) { t.checked = false; openPwdModal(false); return; }
            var next = gather();
            if (!t.checked) {
                showConfirm(next);
            } else {
                api.setLibraryProtection(next).then(function(r) {
                    if (!r || !r.success) { t.checked = !t.checked; if (r && r.message) showToast(r.message, 'error'); }
                }).catch(function() {});
            }
        };
    }
    bindProtectToggle(tSet);
    bindProtectToggle(tBak);
    bindProtectToggle(tApp);
    bindProtectToggle(tIdle);
    if (tIdleMin) {
        tIdleMin.onchange = function() {
            api.setLibraryProtection(gather()).catch(function() {});
        };
    }
    if (tIdle) {
        tIdle.addEventListener('change', function() {
            if (tIdleWrap) tIdleWrap.style.display = tIdle.checked ? 'flex' : 'none';
        });
    }

    btnCancel.onclick = function() {
        // Revert the toggle that triggered the confirmation.
        if (pendingChange) {
            if (pendingChange.passwordRequired === false) tPwd.checked = true;
            if (pendingChange.enhancedProtection === false) tEnh.checked = true;
            if (pendingChange.protectSettings === false && tSet) tSet.checked = true;
            if (pendingChange.protectBackup === false && tBak) tBak.checked = true;
            if (pendingChange.appLock === false && tApp) tApp.checked = true;
        }
        hideConfirm();
    };
    btnOk.onclick = function() {
        if (!pendingChange) return;
        err.textContent = '';
        var pw = inp.value;
        if (!pw) { err.textContent = 'Enter your master password'; return; }
        api.setLibraryProtection(pendingChange, pw).then(function(r) {
            if (r && r.success) {
                hideConfirm();
                showToast('Library protection updated');
            } else {
                err.textContent = (r && r.message) || 'Wrong password';
            }
        }).catch(function() { err.textContent = 'Failed'; });
    };
    inp.onkeydown = function(e) {
        if (e.key === 'Enter') btnOk.click();
        if (e.key === 'Escape') btnCancel.click();
    };
}
function renderZapperRules(rules) {
    var list = document.getElementById('zapperRulesList');
    if (!list) return;
    rules = rules || {};
    var domains = Object.keys(rules);
    if (!domains.length) {
        list.innerHTML = '<div style="color:var(--secondary-text);padding:20px;text-align:center;font-size:13px;">Nothing hidden yet. Open a site → right-click → "Hide element (Zapper)".</div>';
        return;
    }
    list.innerHTML = '';
    domains.sort().forEach(function(domain) {
        var selectors = rules[domain] || [];
        var card = document.createElement('div');
        card.style.cssText = 'background:var(--card-bg);border:1px solid var(--border-color);border-radius:10px;padding:12px 14px;';
        var head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;';
        var title = document.createElement('div');
        title.style.cssText = 'font-size:14px;font-weight:600;color:var(--text-color);';
        title.textContent = domain + '  (' + selectors.length + ')';
        var clr = document.createElement('button');
        clr.textContent = 'Clear site';
        clr.style.cssText = 'background:rgba(244,67,54,0.15);border:1px solid rgba(244,67,54,0.3);color:#f44336;padding:5px 10px;border-radius:6px;font-size:12px;cursor:pointer;';
        clr.onclick = async function() {
            if (!await customConfirm('Delete all rules for ' + domain + '?')) return;
            if (api.clearElementHidingDomain) api.clearElementHidingDomain(domain).then(function(r) {
                renderZapperRules((r && r.rules) || {});
            });
        };
        head.appendChild(title); head.appendChild(clr);
        card.appendChild(head);
        selectors.forEach(function(sel) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--border-color);';
            var code = document.createElement('code');
            code.style.cssText = 'flex:1;min-width:0;font-size:12px;color:var(--text-color);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace;';
            code.textContent = sel;
            code.title = sel;
            var rm = document.createElement('button');
            rm.textContent = '✕';
            rm.style.cssText = 'background:none;border:none;color:var(--secondary-text);font-size:14px;cursor:pointer;padding:2px 8px;border-radius:4px;';
            rm.onmouseenter = function() { rm.style.color = '#f44336'; };
            rm.onmouseleave = function() { rm.style.color = ''; };
            (function(s) {
                rm.onclick = function() {
                    if (api.removeElementHidingRule) api.removeElementHidingRule(domain, s).then(function(r) {
                        renderZapperRules((r && r.rules) || {});
                    });
                };
            })(sel);
            row.appendChild(code); row.appendChild(rm);
            card.appendChild(row);
        });
        list.appendChild(card);
    });
}

// ==================== SESSION GUARD + MEMORY AUTO-SLEEP (in Optimization) ====================
(function() {
    if (!api) return;
    var sgEn = document.getElementById('sgEnabled');
    var sgSc = document.getElementById('sgScope');
    var sgAc = document.getElementById('sgAction');
    var _sgRules = [];
    function loadSG() {
        if (!api.getCustomizationSettings) return;
        api.getCustomizationSettings().then(function(r) {
            var s = ((r && r.settings) || {}).sessionGuard || {};
            if (sgEn) sgEn.checked = !!s.enabled;
            if (sgSc && s.scope) sgSc.value = s.scope;
            if (sgAc && s.action) sgAc.value = s.action;
            _sgRules = Array.isArray(s.customRules) ? s.customRules : [];
            renderSgRules();
        }).catch(function() {});
    }
    function saveSG() {
        if (!api.saveCustomizationSettings) return;
        api.saveCustomizationSettings({
            sessionGuard: {
                enabled: sgEn ? sgEn.checked : false,
                scope: sgSc ? sgSc.value : 'exact',
                action: sgAc ? sgAc.value : 'warn',
                customRules: _sgRules
            }
        });
    }
    function renderSgRules() {
        var list = document.getElementById('sgCustomRulesList');
        if (!list) return;
        list.innerHTML = '';
        if (!_sgRules.length) {
            list.innerHTML = '<div style="color:var(--secondary-text);padding:10px;font-size:12px;text-align:center;">No rules yet. Add one below — e.g. domain twitter.com with the text "Do not get distracted!".</div>';
            return;
        }
        _sgRules.forEach(function(rule, idx) {
            var card = document.createElement('div');
            card.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--card-bg);border:1px solid var(--border-color);border-radius:8px;';
            var sevColor = rule.severity === 'danger' ? '#f44336' : (rule.severity === 'warning' ? '#ff9800' : '#667eea');
            var info = document.createElement('div');
            info.style.cssText = 'flex:1;min-width:0;';
            info.innerHTML = '<div style="font-size:13px;font-weight:500;color:var(--text-color);">' + _sgEsc(rule.name || rule.pattern) +
                ' <span style="font-size:11px;color:' + sevColor + ';">[' + (rule.type || 'domain') + ']</span></div>' +
                '<div style="font-size:11px;color:var(--secondary-text);margin-top:2px;">' + _sgEsc(rule.pattern || '') + (rule.message ? ' — ' + _sgEsc(rule.message) : '') + '</div>';
            card.appendChild(info);
            var en = document.createElement('input');
            en.type = 'checkbox';
            en.checked = rule.enabled !== false;
            en.title = 'Enable/disable rule';
            en.style.cursor = 'pointer';
            en.onchange = function() { _sgRules[idx].enabled = en.checked; saveSG(); };
            card.appendChild(en);
            var del = document.createElement('button');
            del.textContent = '✕';
            del.style.cssText = 'background:none;border:none;color:var(--secondary-text);font-size:14px;cursor:pointer;padding:2px 6px;';
            del.onclick = function() { _sgRules.splice(idx, 1); saveSG(); renderSgRules(); };
            card.appendChild(del);
            list.appendChild(card);
        });
    }
    function _sgEsc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
            return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
        });
    }
    if (sgEn) sgEn.addEventListener('change', saveSG);
    if (sgSc) sgSc.addEventListener('change', saveSG);
    if (sgAc) sgAc.addEventListener('change', saveSG);

    var addBtn = document.getElementById('sgAddRuleBtn');
    if (addBtn) addBtn.addEventListener('click', function() {
        var nameEl = document.getElementById('sgRuleName');
        var typeEl = document.getElementById('sgRuleType');
        var patEl = document.getElementById('sgRulePattern');
        var msgEl = document.getElementById('sgRuleMessage');
        var sevEl = document.getElementById('sgRuleSeverity');
        var pat = patEl && patEl.value.trim();
        if (!pat) { customAlert('Specify a rule pattern'); return; }
        // Validate regex
        if (typeEl && typeEl.value === 'regex') {
            try { new RegExp(pat); } catch(e) { customAlert(((window.i18n && window.i18n.t('Invalid regex: ')) || 'Invalid regex: ') + e.message); return; }
        }
        _sgRules.push({
            id: 'r' + Date.now() + Math.random().toString(36).slice(2,6),
            name: (nameEl && nameEl.value.trim()) || '',
            type: typeEl ? typeEl.value : 'domain',
            pattern: pat,
            message: (msgEl && msgEl.value.trim()) || '',
            severity: sevEl ? sevEl.value : 'info',
            enabled: true
        });
        if (nameEl) nameEl.value = '';
        if (patEl) patEl.value = '';
        if (msgEl) msgEl.value = '';
        saveSG();
        renderSgRules();
    });

    var scanBtn = document.getElementById('sgScanNowBtn');
    if (scanBtn) scanBtn.addEventListener('click', function() {
        if (!api || !api.sessionGuardScanAll) {
            customAlert('This browser version does not support manual checking.');
            return;
        }
        api.sessionGuardScanAll().then(function(r) {
            if (r && r.success) {
                customAlert('Check started. Go to the main window — notifications about found duplicates/rules will appear at the bottom right.');
            } else {
                customAlert('Could not start the check — switch to the main window and try again.');
            }
        }).catch(function(e) {
            customAlert('Error: ' + (e && e.message ? e.message : 'unknown'));
        });
    });

    loadSG();

    // Memory auto-sleep — optimization (controlled only by limit: 0 = disabled)
    var memLimit = document.getElementById('optMemoryLimit');
    function loadMem() {
        if (!api.getOptimizationSetting) return;
        api.getOptimizationSetting('memoryLimit').then(function(v) { if (memLimit && v) memLimit.value = String(v); }).catch(function() {});
    }
    if (memLimit) memLimit.addEventListener('change', function() {
        if (api.setOptimizationSetting) api.setOptimizationSetting('memoryLimit', parseInt(memLimit.value) || 0);
    });
    loadMem();
})();

// ==================== EXPORT / IMPORT ALL SETTINGS (JSON) ====================
(function() {
    if (!api) return;
    var expBtn = document.getElementById('settingsExportJsonBtn');
    var impBtn = document.getElementById('settingsImportJsonBtn');
    var resEl = document.getElementById('settingsImportResult');
    if (expBtn && api.settingsExportJson) {
        expBtn.onclick = function() {
            expBtn.disabled = true;
            api.settingsExportJson().then(function(r) {
                expBtn.disabled = false;
                if (resEl) {
                    if (r && r.success) {
                        resEl.style.color = '#4CAF50';
                        resEl.textContent = '✓ Exported: ' + r.path;
                    } else if (r && r.canceled) {
                        resEl.style.color = 'var(--secondary-text)';
                        resEl.textContent = '';
                    } else {
                        resEl.style.color = '#f44336';
                        resEl.textContent = '✕ Error: ' + (r && r.error);
                    }
                }
            }).catch(function(e) {
                expBtn.disabled = false;
                if (resEl) { resEl.style.color = '#f44336'; resEl.textContent = '✕ Error: ' + e; }
            });
        };
    }
    if (impBtn && api.settingsImportJson) {
        impBtn.onclick = function() {
            impBtn.disabled = true;
            api.settingsImportJson().then(async function(r) {
                impBtn.disabled = false;
                if (!r) return;
                if (r.canceled) { if (resEl) resEl.textContent = ''; return; }
                if (!r.success) {
                    if (resEl) { resEl.style.color = '#f44336'; resEl.textContent = '✕ ' + (r.error || 'Error'); }
                    return;
                }
                var sizeKB = r.data ? Math.round(JSON.stringify(r.data).length / 1024) : 0;
                if (!await customConfirm('Apply imported settings (' + sizeKB + ' KB)?\nChanges will fully take effect after restarting the browser.')) {
                    if (resEl) { resEl.style.color = 'var(--secondary-text)'; resEl.textContent = 'Import canceled.'; }
                    return;
                }
                if (!api.settingsApplyImported) return;
                api.settingsApplyImported(r.data).then(function(applyRes) {
                    if (applyRes && applyRes.success) {
                        if (resEl) { resEl.style.color = '#4CAF50'; resEl.textContent = '✓ Settings applied. Restart the browser to take full effect.'; }
                        if (api.restartBrowser) {
                            setTimeout(async function() { if (await customConfirm('Restart the browser now?')) api.restartBrowser(); }, 100);
                        }
                    } else {
                        if (resEl) { resEl.style.color = '#f44336'; resEl.textContent = '✕ ' + (applyRes && applyRes.error); }
                    }
                });
            }).catch(function(e) {
                impBtn.disabled = false;
                if (resEl) { resEl.style.color = '#f44336'; resEl.textContent = '✕ Error: ' + e; }
            });
        };
    }
})();

// Update Zapper rules on change from the active tab
if (api && api.onElementHidingUpdated) {
    api.onElementHidingUpdated(function() {
        if (document.getElementById('element-zapper').classList.contains('active')) {
            if (api.getElementHidingRules) api.getElementHidingRules().then(renderZapperRules).catch(function() {});
        }
    });
}

// --- Delegated listeners (converted from inline on* handlers, CSP: no 'unsafe-inline') ---
// Dispatcher for elements converted from inline onclick/onchange to data-action attributes.
document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action="hide-parent"], [data-action="switch-profile"], [data-action="rename-profile"], [data-action="delete-profile"], [data-action="remove-perm-site"], [data-action="dismiss-overlay"]');
    if (!btn) return;
    var action = btn.dataset.action;
    if (action === 'hide-parent') {
        btn.parentElement.classList.add('hidden');
    } else if (action === 'switch-profile' && btn.dataset.id) {
        switchProfile(btn.dataset.id);
    } else if (action === 'rename-profile' && btn.dataset.id) {
        renameProfile(btn.dataset.id, btn.dataset.name);
    } else if (action === 'delete-profile' && btn.dataset.id) {
        deleteProfile(btn.dataset.id);
    } else if (action === 'remove-perm-site' && btn.dataset.domain) {
        if (window.removePermissionSite) window.removePermissionSite(btn.dataset.domain);
    } else if (action === 'dismiss-overlay') {
        var card = btn.closest('div[style]');
        if (card && card.parentElement) card.parentElement.remove();
    }
});
document.addEventListener('change', function (e) {
    var sel = e.target.closest('[data-action="change-perm"]');
    if (!sel) return;
    if (sel.dataset.domain && sel.dataset.perm && window.changePerm) {
        window.changePerm(sel.dataset.domain, sel.dataset.perm, sel.value);
    }
});
