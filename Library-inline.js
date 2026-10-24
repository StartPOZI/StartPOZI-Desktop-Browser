        var api = window.electronAPI;

        // ===== Library protection (lock screen) =====
        var _libLockScreen = document.getElementById('libraryLockScreen');
        var _libLockInput = document.getElementById('libLockInput');
        var _libLockBtn = document.getElementById('libLockBtn');
        var _libLockBioBtn = document.getElementById('libLockBioBtn');
        var _libLockError = document.getElementById('libLockError');
        var _libEnhancedProtection = false;
        var _libAutoLockTimer = null;

        function showLibraryLock() {
            if (!_libLockScreen) return;
            _libLockScreen.style.display = 'flex';
            if (_libLockInput) { _libLockInput.value = ''; _libLockInput.focus(); }
            if (_libLockError) _libLockError.textContent = '';
        }
        function hideLibraryLock() {
            if (!_libLockScreen) return;
            _libLockScreen.style.display = 'none';
            startAutoLockIfNeeded();
        }

        function startAutoLockIfNeeded() {
            if (_libAutoLockTimer) { clearTimeout(_libAutoLockTimer); _libAutoLockTimer = null; }
            if (!_libEnhancedProtection) return;
            // Auto-lock after 5 minutes of inactivity.
            _libAutoLockTimer = setTimeout(function() {
                if (api && api.lockLibrary) api.lockLibrary();
                showLibraryLock();
            }, 5 * 60 * 1000);
        }
        // Reset the auto-lock timer on user activity.
        ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function(ev) {
            document.addEventListener(ev, function() { if (_libEnhancedProtection && _libLockScreen.style.display === 'none') startAutoLockIfNeeded(); }, { passive: true });
        });

        function attemptUnlock() {
            if (!_libLockInput) return;
            if (_libLockError) _libLockError.textContent = '';
            var pw = _libLockInput.value;
            if (!pw) { if (_libLockError) _libLockError.textContent = 'Enter your master password'; return; }
            if (_libLockBtn) { _libLockBtn.disabled = true; _libLockBtn.textContent = 'Unlocking…'; }
            api.verifyLibraryAccess(pw).then(function(res) {
                if (_libLockBtn) { _libLockBtn.disabled = false; _libLockBtn.textContent = 'Unlock'; }
                if (res && res.success) hideLibraryLock();
                else if (_libLockError) _libLockError.textContent = (res && res.message) || 'Wrong password';
            }).catch(function() {
                if (_libLockBtn) { _libLockBtn.disabled = false; _libLockBtn.textContent = 'Unlock'; }
                if (_libLockError) _libLockError.textContent = 'Unlock failed';
            });
        }

        if (_libLockBtn) _libLockBtn.addEventListener('click', attemptUnlock);
        if (_libLockInput) _libLockInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') attemptUnlock(); });
        if (_libLockBioBtn) _libLockBioBtn.addEventListener('click', function() {
            if (_libLockError) _libLockError.textContent = '';
            if (!api || !api.libraryBiometricAuth) return;
            api.libraryBiometricAuth().then(function(res) {
                if (res && res.success) hideLibraryLock();
                else if (_libLockError) _libLockError.textContent = (res && res.message) || 'Biometric authentication failed';
            }).catch(function() { if (_libLockError) _libLockError.textContent = 'Biometric authentication failed'; });
        });

        // Re-lock when the Library tab is hidden (enhanced protection only).
        document.addEventListener('visibilitychange', function() {
            if (document.hidden && _libEnhancedProtection && api && api.lockLibrary) {
                api.lockLibrary();
            }
            if (!document.hidden && _libEnhancedProtection) {
                // Coming back — check if we need to re-authenticate.
                if (api && api.checkLibraryProtection) {
                    api.checkLibraryProtection().then(function(st) {
                        if (st && st.needsAuth && !st.alreadyUnlocked) showLibraryLock();
                    }).catch(function() {});
                }
            }
        });

        // Check protection on load.
        (function checkLibraryProtectionOnLoad() {
            if (!api || !api.checkLibraryProtection) return;
            api.checkLibraryProtection().then(function(st) {
                if (!st) return;
                _libEnhancedProtection = !!st.enhancedProtection;
                if (st.biometricRequired && api.libraryBiometricAuth) {
                    _libLockBioBtn.style.display = 'block';
                }
                if (st.needsAuth && !st.alreadyUnlocked) {
                    showLibraryLock();
                } else {
                    startAutoLockIfNeeded();
                }
            }).catch(function() {});
        })();

        function applyTheme(theme) {
            var c;
            if (theme === 'system') c = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'theme-dark' : 'theme-light';
            else c = 'theme-' + theme;
            document.body.classList.remove('theme-dark', 'theme-light');
            document.body.classList.add(c);
        }
        if (api && api.getTheme) api.getTheme().then(applyTheme);

        function applyWallpaper(cust) {
            if (!cust || !cust.mainPageBackground) return;
            document.documentElement.style.setProperty('--custom-bg', cust.mainPageBackground);
            if (cust.mainPageBackgroundSize) document.documentElement.style.setProperty('--custom-bg-size', cust.mainPageBackgroundSize);
            if (cust.mainPageBackgroundPosition) document.documentElement.style.setProperty('--custom-bg-pos', cust.mainPageBackgroundPosition);
            if (cust.mainPageBackgroundRepeat) document.documentElement.style.setProperty('--custom-bg-repeat', cust.mainPageBackgroundRepeat);
            if (cust.mainPageBackgroundAttachment) document.documentElement.style.setProperty('--custom-bg-attach', cust.mainPageBackgroundAttachment);
            document.body.classList.add('custom-bg');
        }
        if (api && api.getCustomizationSettings) api.getCustomizationSettings().then(function(r) { if (r && r.settings) applyWallpaper(r.settings); });
        // Live update: re-apply when the wallpaper changes on MainPage or in
        // Settings. Without this, Library only picked up the background on
        // first load and went stale afterwards.
        if (api && api.onCustomizationUpdated) {
            api.onCustomizationUpdated(function(settings) { applyWallpaper(settings); });
        }

        document.getElementById('backBtn').addEventListener('click', function() {
            if (api && api.openUrlFromSettings) api.openUrlFromSettings('Settings.html');
            else window.history.back();
        });

        document.querySelectorAll('nav a').forEach(function(a) {
            a.addEventListener('click', function(e) {
                e.preventDefault();
                document.querySelectorAll('nav a').forEach(function(x) { x.classList.remove('active'); });
                a.classList.add('active');
                document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
                var sec = document.getElementById('sec-' + a.dataset.section);
                if (sec) sec.classList.add('active');
                if (a.dataset.section === 'history') loadHistory();
                if (a.dataset.section === 'downloads') loadDownloads();
                if (a.dataset.section === 'bookmarks') loadBookmarks();
                if (a.dataset.section === 'cookies') loadCookies();
                if (a.dataset.section === 'passwords') loadPasswords();
            });
        });

        function fmtDate(ts) {
            var d = new Date(ts);
            var now = new Date();
            var diff = now - d;
            if (diff < 60000) return 'Just now';
            if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
            if (diff < 86400000) return Math.floor(diff / 3600000) + ' h ago';
            if (diff < 172800000) return 'Yesterday ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        }
        function fmtDay(ts) {
            var d = new Date(ts); var now = new Date();
            var td = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            var dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            var diff = td - dd;
            if (diff === 0) return 'Today';
            if (diff <= 86400000) return 'Yesterday';
            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
        }
        function fmtSize(b) {
            if (!b) return '—';
            if (b < 1024) return b + ' B';
            if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
            if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
            return (b / 1073741824).toFixed(2) + ' GB';
        }
        function getFavicon(url) {
            // Privacy: ask the SITE ITSELF for /favicon.ico. The previous
            // google.com/s2/favicons proxy leaked the full list of visited
            // domains to Google from a "private" browser.
            try { var u = new URL(url); return u.origin + '/favicon.ico'; } catch(e) { return ''; }
        }
        function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
        function periodFilter(period) {
            var now = new Date();
            var td = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            switch (period) {
                case 'today': return function(t) { return t >= td.getTime(); };
                case 'yesterday': return function(t) { return t >= td.getTime() - 86400000 && t < td.getTime(); };
                case 'week': return function(t) { return t >= td.getTime() - 7 * 86400000; };
                case 'month': return function(t) { return t >= td.getTime() - 30 * 86400000; };
                default: return function() { return true; };
            }
        }

        // ---- HISTORY ----
        var histData = [];
        function loadHistory() {
            if (!api || !api.getHistory) return;
            api.getHistory().then(function(l) { histData = l || []; renderHistory(); });
        }
        function renderHistory() {
            var sort = document.getElementById('histSort').value;
            var period = document.getElementById('histPeriod').value;
            var search = document.getElementById('histSearch').value.toLowerCase();
            var pf = periodFilter(period);
            var items = histData.filter(function(h) {
                if (!pf(h.time)) return false;
                if (search && (h.title || '').toLowerCase().indexOf(search) === -1 && (h.url || '').toLowerCase().indexOf(search) === -1) return false;
                return true;
            });
            if (sort === 'newest') items.sort(function(a, b) { return (b.time || 0) - (a.time || 0); });
            else if (sort === 'oldest') items.sort(function(a, b) { return (a.time || 0) - (b.time || 0); });
            else if (sort === 'alpha') items.sort(function(a, b) { return (a.title || '').localeCompare(b.title || ''); });
            else if (sort === 'visits') items.sort(function(a, b) { return (b.visitCount || 0) - (a.visitCount || 0); });

            var el = document.getElementById('histList');
            if (items.length === 0) { el.innerHTML = '<div class="empty">No entries</div>'; return; }
            var html = '';
            var lastDay = '';
            for (var i = 0; i < items.length; i++) {
                var h = items[i];
                var day = fmtDay(h.time);
                if (day !== lastDay) { html += '<div class="date-sep">' + day + '</div>'; lastDay = day; }
                var fav = getFavicon(h.url);
                html += '<div class="item" data-url="' + esc(h.url) + '">' +
                    (fav ? '<img src="' + esc(fav) + '"">' : '<div class="icon-ph"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>') +
                    '<div class="info"><div class="title">' + esc(h.title || h.url || 'Untitled') + '</div>' +
                    '<div class="url">' + esc(h.url) + '</div></div>' +
                    '<div class="meta"><span>' + fmtDate(h.time) + '</span>' +
                    (h.visitCount > 1 ? '<span style="font-size:11px;opacity:0.7">' + h.visitCount + ' visits</span>' : '') + '</div>' +
                    '<button class="del-btn" data-action="del-hist" data-url="' + esc(h.url) + '" title="Delete">×</button></div>';
            }
            el.innerHTML = html;
        }
        document.getElementById('histSort').addEventListener('change', renderHistory);
        document.getElementById('histPeriod').addEventListener('change', renderHistory);
        document.getElementById('histSearch').addEventListener('input', renderHistory);
        document.getElementById('histClear').addEventListener('click', function() {
            if (api && api.clearHistory) api.clearHistory().then(function() { histData = []; renderHistory(); });
        });
        document.getElementById('histList').addEventListener('click', function(e) {
            var btn = e.target.closest('[data-action="del-hist"]');
            if (btn) {
                e.stopPropagation();
                var delUrl = btn.dataset.url;
                // Delete exactly ONE entry (was: clearHistory() wiped everything).
                if (api && api.removeHistoryEntry) {
                    api.removeHistoryEntry(delUrl).then(function() {
                        histData = histData.filter(function(h) { return h.url !== delUrl; });
                        renderHistory();
                    });
                } else if (api && api.clearHistory) {
                    api.clearHistory().then(function() { loadHistory(); });
                }
                return;
            }
            var item = e.target.closest('.item[data-url]');
            if (item && api && api.openUrlFromSettings) api.openUrlFromSettings(item.dataset.url);
        });

        document.getElementById('histViewList').addEventListener('click', function() {
            document.getElementById('histList').classList.remove('grid-view');
            this.classList.add('active');
            document.getElementById('histViewGrid').classList.remove('active');
        });
        document.getElementById('histViewGrid').addEventListener('click', function() {
            document.getElementById('histList').classList.add('grid-view');
            this.classList.add('active');
            document.getElementById('histViewList').classList.remove('active');
        });

        // ---- DOWNLOADS ----
         var dlData = [];
         var dlExistsMap = {};
         function loadDownloads() {
             if (!api || !api.getDownloads) return;
             api.getDownloads().then(function(l) { dlData = l || []; checkDlFiles(); });
         }
         function checkDlFiles() {
             var paths = dlData.filter(function(d) { return d.state === 'completed' && d.path; }).map(function(d) { return d.path; });
             paths = paths.filter(function(p, i, a) { return a.indexOf(p) === i; });
             if (paths.length > 0 && api && api.checkFilesExist) {
                 api.checkFilesExist(paths).then(function(m) { dlExistsMap = m || {}; renderDownloads(); });
             } else {
                 renderDownloads();
             }
         }
         function renderDownloads() {
             var sort = document.getElementById('dlSort').value;
             var period = document.getElementById('dlPeriod').value;
             var search = document.getElementById('dlSearch').value.toLowerCase();
             var pf = periodFilter(period);
             var items = dlData.filter(function(d) {
                 if (!pf(d.startTime)) return false;
                 if (search && (d.filename || '').toLowerCase().indexOf(search) === -1 && (d.url || '').toLowerCase().indexOf(search) === -1) return false;
                 return true;
             });
             if (sort === 'newest') items.sort(function(a, b) { return (b.startTime || 0) - (a.startTime || 0); });
             else if (sort === 'oldest') items.sort(function(a, b) { return (a.startTime || 0) - (b.startTime || 0); });
             else if (sort === 'name') items.sort(function(a, b) { return (a.filename || '').localeCompare(b.filename || ''); });
             else if (sort === 'size') items.sort(function(a, b) { return (b.totalBytes || 0) - (a.totalBytes || 0); });

             var el = document.getElementById('dlList');
             if (items.length === 0) { el.innerHTML = '<div class="empty">No downloads</div>'; return; }
             var totalDl = 0;
             for (var t = 0; t < items.length; t++) totalDl += (items[t].totalBytes || 0);
             var _t = function (s) { return (window.i18n && window.i18n.t(s)) || s; };
             var html = '<div class="date-sep" style="display:flex;justify-content:space-between;">' +
                 '<span>' + items.length + ' ' + _t('downloads') + '</span><span>' + fmtSize(totalDl) + ' ' + _t('total') + '</span></div>';
             var lastDay = '';
             for (var i = 0; i < items.length; i++) {
                 var d = items[i];
                 var day = fmtDay(d.startTime);
                 if (day !== lastDay) { html += '<div class="date-sep">' + day + '</div>'; lastDay = day; }
                 var fav = getFavicon(d.url);
                 var missing = d.path && dlExistsMap[d.path] === false;
                 html += '<div class="item' + (missing ? ' file-missing' : '') + '">' +
                     (fav ? '<img src="' + esc(fav) + '"">' : '<div class="icon-ph"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></div>') +
                     '<div class="info"><div class="title">' + esc(d.filename || 'File') + '</div>' +
                     '<div class="url">' + fmtSize(d.totalBytes) + (d.state === 'progressing' ? ' — downloading...' : d.state === 'interrupted' ? ' — interrupted' : '') + '</div>' +
                     (missing ? '<div class="url" style="color:#e5a00d;font-size:11px;">File was moved or deleted</div>' : '') +
                     '</div>' +
                     '<div class="meta"><span>' + fmtDate(d.startTime) + '</span></div>' +
                     '<button class="del-btn" data-action="open-dl" data-path="' + esc(d.path) + '" title="Open folder"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></button></div>';
             }
             el.innerHTML = html;
         }
        document.getElementById('dlSort').addEventListener('change', renderDownloads);
        document.getElementById('dlPeriod').addEventListener('change', renderDownloads);
        document.getElementById('dlSearch').addEventListener('input', renderDownloads);
        document.getElementById('dlClear').addEventListener('click', function() {
            if (api && api.clearDownloads) api.clearDownloads().then(function() { dlData = []; renderDownloads(); });
        });
        document.getElementById('dlList').addEventListener('click', function(e) {
            var btn = e.target.closest('[data-action="open-dl"]');
            if (btn && api && api.openDownloadFolder) api.openDownloadFolder(btn.dataset.path);
        });

         // ---- BOOKMARKS ----
         var bmData = [];
         var bmCollapsed = {};
         try { bmCollapsed = JSON.parse(localStorage.getItem('bmCollapsed') || '{}'); } catch (e0) { bmCollapsed = {}; }
         function bmSaveCollapsed() { try { localStorage.setItem('bmCollapsed', JSON.stringify(bmCollapsed)); } catch (e0) {} }
         function loadBookmarks() {
             if (!api || !api.loadBookmarks) return;
             api.loadBookmarks().then(function(l) { bmData = l || []; renderBookmarks(); });
         }
         function bmSortItems(items) {
             var sort = document.getElementById('bmSort').value;
             var copy = items.slice();
             copy.sort(function(a, b) {
                 // Pinned first everywhere.
                 if (a.pinned && !b.pinned) return -1;
                 if (!a.pinned && b.pinned) return 1;
                 if (sort === 'newest') return (b.createdAt || 0) - (a.createdAt || 0);
                 if (sort === 'oldest') return (a.createdAt || 0) - (b.createdAt || 0);
                 if (sort === 'alpha') return (a.title || '').localeCompare(b.title || '');
                 return 0;
             });
             return copy;
         }
         function renderBookmarks() {
             var search = document.getElementById('bmSearch').value.toLowerCase();
             var folders = bmData.filter(function(b) {
                 return b.folder === '__folder__' &&
                     (!search || (b.title || '').toLowerCase().indexOf(search) !== -1);
             });
             var loose = bmData.filter(function(b) {
                 if (b.folder === '__folder__') return false;
                 if (b.folder) return false; // belongs to a folder
                 if (search && (b.title || '').toLowerCase().indexOf(search) === -1 && (b.url || '').toLowerCase().indexOf(search) === -1) return false;
                 return true;
             });

             var el = document.getElementById('bmList');
             var html = '';
             if (!folders.length && !loose.length) { el.innerHTML = '<div class="empty">No bookmarks</div>'; return; }

             function bmRow(b) {
                 var fav = b.icon || getFavicon(b.url);
                 return '<div class="item" data-url="' + esc(b.url || '') + '">' +
                     (fav ? '<img src="' + esc(fav) + '"">' : '<div class="icon-ph">⭐</div>') +
                     '<div class="info"><div class="title">' + esc(b.title || b.url || 'Untitled') + '</div>' +
                     '<div class="url">' + esc(b.url || '') + '</div></div>' +
                     '<div class="meta"><span>' + fmtDate(b.createdAt) + '</span></div>' +
                     '<button class="del-btn" data-action="bm-pin" data-id="' + esc(b.id || '') + '" title="' + (b.pinned ? 'Unpin' : 'Pin') + '" style="font-size:14px;">' + (b.pinned ? '📌' : '📍') + '</button>' +
                     '<button class="del-btn" data-action="bm-move" data-id="' + esc(b.id || '') + '" title="Move to folder">📁</button>' +
                     '<button class="del-btn" data-action="del-bm" data-id="' + esc(b.id || '') + '" title="Delete">×</button></div>';
             }

             // Pinned section (bookmarks pinned across all folders)
             var pinned = bmData.filter(function(b) {
                 if (b.folder === '__folder__') return false;
                 if (!b.pinned) return false;
                 if (search && (b.title || '').toLowerCase().indexOf(search) === -1 && (b.url || '').toLowerCase().indexOf(search) === -1) return false;
                 return true;
             });
             if (pinned.length) {
                 html += '<div class="date-sep">📌 Pinned</div>' + bmSortItems(pinned).map(bmRow).join('');
             }

             // Folders
             folders = bmSortItems(folders);
             folders.forEach(function(f) {
                 var kids = bmData.filter(function(b) {
                     if (b.folder === '__folder__' || b.folder !== f.id) return false;
                     if (search && (b.title || '').toLowerCase().indexOf(search) === -1 && (b.url || '').toLowerCase().indexOf(search) === -1) return false;
                     return true;
                 });
                 var collapsed = bmCollapsed[f.id] === true;
                 html += '<div class="date-sep" style="display:flex;align-items:center;gap:8px;">' +
                     '<span data-action="bm-collapse" data-id="' + esc(f.id) + '" style="cursor:pointer;display:inline-block;transition:transform .15s;' + (collapsed ? 'transform:rotate(-90deg);' : '') + '">▾</span>' +
                     '<span data-action="bm-collapse" data-id="' + esc(f.id) + '" style="cursor:pointer;flex:1;">📂 ' + esc(f.title || 'Folder') + ' (' + kids.length + ')</span>' +
                     '<button class="del-btn" data-action="bm-folder-pin" data-id="' + esc(f.id) + '" title="' + (f.pinned ? 'Unpin folder' : 'Pin folder') + '" style="font-size:13px;">' + (f.pinned ? '📌' : '📍') + '</button>' +
                     '<button class="del-btn" data-action="bm-folder-del" data-id="' + esc(f.id) + '" title="Delete folder (bookmarks move to root)">×</button>' +
                     '</div>';
                 if (!collapsed) html += bmSortItems(kids).map(bmRow).join('');
             });

             // Loose bookmarks
             if (loose.length) {
                 html += '<div class="date-sep">Bookmarks</div>' + bmSortItems(loose).map(bmRow).join('');
             } else if (!folders.length && !pinned.length) {
                 html += '<div class="empty">No bookmarks</div>';
             }
             el.innerHTML = html;
         }
         function bmFolderPick(actionId, cb) {
             var folders = bmData.filter(function(b) { return b.folder === '__folder__'; });
             var overlay = document.createElement('div');
             overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
             var opts = '<option value="">— No folder —</option>' +
                 folders.map(function(f) { return '<option value="' + esc(f.id) + '">' + esc(f.title || 'Folder') + '</option>'; }).join('');
             overlay.innerHTML = '<div style="background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:22px;min-width:320px;">' +
                 '<h3 style="color:var(--h2-color);margin:0 0 14px;font-size:16px;">Choose folder</h3>' +
                 '<select id="bm-folder-sel" style="width:100%;padding:10px 14px;border-radius:10px;background:var(--input-bg);border:var(--input-border);color:var(--input-color);font-size:14px;">' + opts + '</select>' +
                 '<div style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end;">' +
                 '<button id="bm-folder-cancel" style="padding:8px 16px;border-radius:8px;background:var(--btn-bg);border:var(--btn-border);color:var(--btn-color);cursor:pointer;">Cancel</button>' +
                 '<button id="bm-folder-ok" style="padding:8px 16px;border-radius:8px;background:var(--accent-gradient);color:#fff;border:none;cursor:pointer;font-weight:600;">Move</button></div></div>';
             document.body.appendChild(overlay);
             overlay.querySelector('#bm-folder-cancel').onclick = function() { overlay.remove(); };
             overlay.querySelector('#bm-folder-ok').onclick = function() {
                 var v = overlay.querySelector('#bm-folder-sel').value;
                 overlay.remove();
                 cb(v || '');
             };
             overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
         }
         document.getElementById('bmSort').addEventListener('change', renderBookmarks);
         document.getElementById('bmSearch').addEventListener('input', renderBookmarks);
         document.getElementById('bmList').addEventListener('click', function(e) {
             var btn = e.target.closest('[data-action]');
             if (btn) {
                 var action = btn.dataset.action;
                 var id = btn.dataset.id;
                 e.stopPropagation();
                 if (action === 'del-bm' && id && api && api.removeBookmark) {
                     api.removeBookmark(id).then(function() { loadBookmarks(); });
                 } else if (action === 'bm-pin' && id && api && api.updateBookmark) {
                     var cur = bmData.find(function(b) { return b.id === id; });
                     api.updateBookmark(id, { pinned: !(cur && cur.pinned) }).then(function() { loadBookmarks(); });
                 } else if (action === 'bm-move' && id && api && api.updateBookmark) {
                     bmFolderPick(id, function(folderId) {
                         api.updateBookmark(id, { folder: folderId }).then(function() { loadBookmarks(); });
                     });
                 } else if (action === 'bm-folder-pin' && id && api && api.updateBookmark) {
                     var curF = bmData.find(function(b) { return b.id === id; });
                     api.updateBookmark(id, { pinned: !(curF && curF.pinned) }).then(function() { loadBookmarks(); });
                 } else if (action === 'bm-collapse' && id) {
                     bmCollapsed[id] = !bmCollapsed[id];
                     bmSaveCollapsed();
                     renderBookmarks();
                 } else if (action === 'bm-folder-del' && id && api && api.removeBookmark) {
                     if (window.customConfirm) {
                         window.customConfirm('Delete this folder? Bookmarks inside move to the root.').then(function(yes) {
                             if (yes) api.removeBookmark(id).then(function() { loadBookmarks(); });
                         });
                     } else {
                         api.removeBookmark(id).then(function() { loadBookmarks(); });
                     }
                 }
                 return;
             }
             var item = e.target.closest('.item[data-url]');
             if (item && item.dataset.url && api && api.openUrlFromSettings) api.openUrlFromSettings(item.dataset.url);
         });
        document.getElementById('bmAdd').addEventListener('click', function() {
            var overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;backdrop-filter:blur(4px);';
            overlay.innerHTML = '<div style="background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:24px;min-width:360px;max-width:90vw;">' +
                '<h3 style="color:var(--h2-color);margin:0 0 16px;font-size:18px;">Add bookmark</h3>' +
                '<div><label style="color:var(--text-color);font-size:14px;display:block;margin-bottom:6px;">URL</label>' +
                '<input id="bm-add-url" placeholder="https://example.com" style="width:100%;padding:10px 14px;border-radius:10px;background:var(--input-bg);border:var(--input-border);color:var(--input-color);font-size:14px;"></div>' +
                '<div style="margin-top:12px;"><label style="color:var(--text-color);font-size:14px;display:block;margin-bottom:6px;">Name</label>' +
                '<input id="bm-add-title" placeholder="My site" style="width:100%;padding:10px 14px;border-radius:10px;background:var(--input-bg);border:var(--input-border);color:var(--input-color);font-size:14px;"></div>' +
                '<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;">' +
                '<button id="bm-add-cancel" style="padding:8px 16px;border-radius:8px;background:var(--btn-bg);border:var(--btn-border);color:var(--btn-color);cursor:pointer;">Cancel</button>' +
                '<button id="bm-add-ok" style="padding:8px 16px;border-radius:8px;background:var(--accent-gradient);color:#fff;border:none;cursor:pointer;font-weight:600;">Add</button></div></div>';
            document.body.appendChild(overlay);
            var urlInput = overlay.querySelector('#bm-add-url');
            setTimeout(function() { urlInput.focus(); }, 50);
            overlay.querySelector('#bm-add-cancel').onclick = function() { overlay.remove(); };
            overlay.querySelector('#bm-add-ok').onclick = function() {
                var url = urlInput.value.trim();
                var title = overlay.querySelector('#bm-add-title').value.trim();
                if (!url) return;
                api.addBookmark({ url: url, title: title || url }).then(function() {
                    overlay.remove();
                    loadBookmarks();
                });
            };
            urlInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') overlay.querySelector('#bm-add-ok').click(); });
            overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
        });
         document.getElementById('bmNewFolder').addEventListener('click', function() {
             var overlay = document.createElement('div');
             overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
             overlay.innerHTML = '<div style="background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;padding:24px;min-width:340px;">' +
                 '<h3 style="color:var(--h2-color);margin:0 0 16px;font-size:18px;">New folder</h3>' +
                 '<input id="bm-folder-name" placeholder="Folder name" style="width:100%;padding:10px 14px;border-radius:10px;background:var(--input-bg);border:var(--input-border);color:var(--input-color);font-size:14px;">' +
                 '<div style="display:flex;gap:10px;margin-top:20px;justify-content:flex-end;">' +
                 '<button id="bm-nf-cancel" style="padding:8px 16px;border-radius:8px;background:var(--btn-bg);border:var(--btn-border);color:var(--btn-color);cursor:pointer;">Cancel</button>' +
                 '<button id="bm-nf-ok" style="padding:8px 16px;border-radius:8px;background:var(--accent-gradient);color:#fff;border:none;cursor:pointer;font-weight:600;">Create</button></div></div>';
             document.body.appendChild(overlay);
             var nameInput = overlay.querySelector('#bm-folder-name');
             setTimeout(function() { nameInput.focus(); }, 50);
             overlay.querySelector('#bm-nf-cancel').onclick = function() { overlay.remove(); };
             overlay.querySelector('#bm-nf-ok').onclick = function() {
                 var name = nameInput.value.trim();
                 if (!name) return;
                 api.addBookmark({ title: name, folder: '__folder__' }).then(function() {
                     overlay.remove();
                     loadBookmarks();
                 });
             };
             nameInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') overlay.querySelector('#bm-nf-ok').click(); });
             overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
         });
         document.getElementById('bmImport').addEventListener('click', function() {
            if (api && api.importBookmarks) api.importBookmarks().then(function(r) { if (r && r.success) loadBookmarks(); });
        });
        // ===== Import from an installed browser (Chrome/Edge/Brave/Vivaldi/Firefox) =====
        document.getElementById('bmImportBrowser').addEventListener('click', function() {
            if (!api || !api.importDetectBrowsers) return;
            api.importDetectBrowsers().then(function(d) {
                if (!d || !d.success) return;
                if (!d.browsers || !d.browsers.length) {
                    var no = document.createElement('div');
                    no.className = 'overlay';
                    no.innerHTML = '<div class="card" style="max-width:420px;margin:auto;padding:24px;text-align:center">' +
                        '<h3 style="margin-top:0">No browsers found</h3>' +
                        '<p style="color:var(--text-secondary,#999);font-size:13px">No supported browser profiles (Chrome, Edge, Brave, Vivaldi, Chromium, Opera, Firefox) were detected on this system.</p>' +
                        '<button class="btn-primary" id="bmibNoOk" style="margin-top:12px">OK</button></div>';
                    document.body.appendChild(no);
                    no.querySelector('#bmibNoOk').addEventListener('click', function() { no.remove(); });
                    no.addEventListener('click', function(e) { if (e.target === no) no.remove(); });
                    return;
                }
                var overlay = document.createElement('div');
                overlay.className = 'overlay';
                var card = document.createElement('div');
                card.className = 'card';
                card.style.maxWidth = '560px';
                card.style.margin = 'auto';
                card.style.padding = '24px';
                var html = '<h3 style="margin-top:0">Import from another browser</h3>';
                if (!d.sqliteAvailable) {
                    html += '<p style="color:#e67e22;font-size:12px;background:#fff3e0;padding:8px 10px;border-radius:6px;margin:0 0 12px">' +
                        'History import needs the <code>sql.js</code> module — not installed. Bookmarks will still import. Run: <code>npm install sql.js</code></p>';
                }
                html += '<div id="bmibList" style="display:flex;flex-direction:column;gap:8px;max-height:340px;overflow:auto"></div>';
                html += '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">' +
                    '<button id="bmibCancel">Cancel</button>' +
                    '<button class="btn-primary" id="bmibGo">Import selected</button></div>';
                card.innerHTML = html;
                overlay.appendChild(card);
                document.body.appendChild(overlay);
                var listEl = card.querySelector('#bmibList');
                d.browsers.forEach(function(b, i) {
                    var row = document.createElement('label');
                    row.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:10px;border:1px solid var(--input-border,#333);border-radius:8px;cursor:pointer';
                    var top = document.createElement('div');
                    top.style.cssText = 'display:flex;align-items:center;gap:8px';
                    var cb = document.createElement('input');
                    cb.type = 'checkbox'; cb.checked = true; cb.dataset.idx = i;
                    top.appendChild(cb);
                    var name = document.createElement('strong');
                    name.textContent = b.name + ' — ' + b.profileName;
                    name.style.fontSize = '14px';
                    top.appendChild(name);
                    row.appendChild(top);
                    var path = document.createElement('div');
                    path.style.cssText = 'font-size:11px;color:var(--text-secondary,#999);word-break:break-all';
                    path.textContent = b.profilePath;
                    row.appendChild(path);
                    var types = document.createElement('div');
                    types.style.cssText = 'display:flex;gap:14px;font-size:12px;color:var(--text-secondary,#bbb)';
                    function mk(type, label, available) {
                        var w = document.createElement('label');
                        w.style.cssText = 'display:flex;align-items:center;gap:4px;' + (available ? '' : 'opacity:.4');
                        var c = document.createElement('input');
                        c.type = 'checkbox'; c.checked = !!available;
                        c.dataset.type = type; c.dataset.idx = i;
                        if (!available) c.disabled = true;
                        w.appendChild(c);
                        var t = document.createElement('span');
                        t.textContent = label;
                        w.appendChild(t);
                        return w;
                    }
                    types.appendChild(mk('bookmarks', 'Bookmarks', b.has.bookmarks));
                    types.appendChild(mk('history', 'History', b.has.history && d.sqliteAvailable));
                    row.appendChild(types);
                    listEl.appendChild(row);
                });
                card.querySelector('#bmibCancel').addEventListener('click', function() { overlay.remove(); });
                overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
                card.querySelector('#bmibGo').addEventListener('click', function() {
                    var goBtn = card.querySelector('#bmibGo');
                    goBtn.disabled = true; goBtn.textContent = 'Importing...';
                    var byProfile = {};
                    listEl.querySelectorAll('input[type=checkbox][data-type]').forEach(function(c) {
                        if (!c.checked) return;
                        var idx = c.dataset.idx;
                        var b = d.browsers[idx];
                        var key = b.profilePath;
                        if (!byProfile[key]) byProfile[key] = { engine: b.engine, profilePath: b.profilePath, name: b.name, bookmarks: false, history: false };
                        byProfile[key][c.dataset.type] = true;
                    });
                    var keys = Object.keys(byProfile);
                    if (!keys.length) { overlay.remove(); return; }
                    var totalBm = 0, totalHist = 0, warnings = [];
                    var p = Promise.resolve();
                    keys.forEach(function(key) {
                        var opt = byProfile[key];
                        p = p.then(function() { return api.importFromBrowser(opt); }).then(function(r) {
                            if (!r) return;
                            if (r.bookmarks) totalBm += r.bookmarks;
                            if (r.history) totalHist += r.history;
                            if (r.warnings && r.warnings.length) warnings = warnings.concat(r.warnings);
                        }).catch(function(e) { warnings.push(e.message || String(e)); });
                    });
                    p.then(function() {
                        loadBookmarks();
                        if (typeof loadHistory === 'function') loadHistory();
                        var msg = 'Imported ' + totalBm + ' bookmarks' + (totalHist ? (', ' + totalHist + ' history items') : '') + '.';
                        if (warnings.length) msg += '\n\nNotes:\n• ' + warnings.join('\n• ');
                        card.innerHTML = '<h3 style="margin-top:0">Import complete</h3>' +
                            '<p style="font-size:14px;white-space:pre-line">' + msg.replace(/</g, '&lt;') + '</p>' +
                            '<div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn-primary" id="bmibDone">Done</button></div>';
                        card.querySelector('#bmibDone').addEventListener('click', function() { overlay.remove(); });
                    });
                });
            });
        });
        document.getElementById('bmExport').addEventListener('click', function() {
            if (api && api.exportBookmarks) api.exportBookmarks();
        });
        document.getElementById('bmClear').addEventListener('click', function() {
            if (!api || !api.removeBookmark || bmData.length === 0) return;
            var pending = bmData.slice();
            var chain = Promise.resolve();
            pending.forEach(function(b) {
                if (b.folder === '__folder__') return;
                chain = chain.then(function() { return api.removeBookmark(b.id); });
            });
            chain.then(function() { bmData = []; renderBookmarks(); }).catch(function() { loadBookmarks(); });
        });

        // ---- COOKIES ----
        var ckData = [];
        function loadCookies() {
            if (!api || !api.getCookies) return;
            api.getCookies().then(function(l) { ckData = l || []; renderCookies(); });
        }
        function renderCookies() {
            var search = document.getElementById('ckSearch').value.toLowerCase();
            var items = ckData.filter(function(c) {
                if (search && (c.domain || '').toLowerCase().indexOf(search) === -1 && (c.name || '').toLowerCase().indexOf(search) === -1) return false;
                return true;
            });
            var el = document.getElementById('ckList');
            if (items.length === 0) { el.innerHTML = '<div class="empty">No cookies</div>'; return; }
            var totalBytes = 0;
            for (var t = 0; t < items.length; t++) totalBytes += (items[t].size || 0);
            var _t = function (s) { return (window.i18n && window.i18n.t(s)) || s; };
            var html = '<div class="date-sep" style="display:flex;justify-content:space-between;">' +
                '<span>' + items.length + ' ' + _t('cookies') + '</span><span>' + fmtSize(totalBytes) + '</span></div>';
            for (var i = 0; i < items.length; i++) {
                var c = items[i];
                html += '<div class="ck-item"><div class="ck-name">' + esc(c.name) + '</div>' +
                    '<div class="ck-domain">' + esc(c.domain) + '</div>' +
                    '<div class="ck-val">' + esc((c.value || '').substring(0, 150)) + '</div>' +
                    '<div class="meta"><span>' + (c.size ? fmtSize(c.size) : '') + '</span></div>' +
                    '<button class="del-btn" data-action="del-ck" data-url="' + esc(c.url || '') + '" data-name="' + esc(c.name) + '">Delete</button></div>';
            }
            el.innerHTML = html;
        }
        document.getElementById('ckSearch').addEventListener('input', renderCookies);
        document.getElementById('ckClear').addEventListener('click', function() {
            if (api && api.clearCookies) api.clearCookies().then(function() { ckData = []; renderCookies(); });
        });
        document.getElementById('ckList').addEventListener('click', function(e) {
            var btn = e.target.closest('[data-action="del-ck"]');
            if (btn && api && api.removeCookie) api.removeCookie(btn.dataset.url, btn.dataset.name).then(function() { loadCookies(); });
        });


        // ===== Password manager (migrated from Settings) =====
        var escapeHtml = (typeof escapeHtml === "function") ? escapeHtml : esc;

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



// =============== PASSWORD MANAGER (unchanged) ===============

let passwordsList = [];
let editingPasswordId = null;

// =============== VAULT (encrypted password store) ===============
// Renders the inline unlock prompt that replaces the password list when the
// vault is locked. Uses the same custom dialog styling as the rest of the
// settings page.
function renderVaultLockedState(listEl) {
    listEl.dataset.locked = '1';
    listEl.innerHTML = `
        <div class="vault-locked">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="opacity:.7;margin-bottom:8px;">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            <div class="vault-locked-title">Password vault is locked</div>
            <div class="vault-locked-hint">Enter your master password to decrypt and view your saved passwords.</div>
            <div class="vault-unlock-row">
                <input type="password" id="vaultUnlockInput" class="vault-input" placeholder="Master password" autocomplete="current-password">
                <button id="vaultUnlockBtn" class="refresh-button btn-accent">Unlock</button>
            </div>
            <div id="vaultUnlockError" class="vault-error"></div>
        </div>
    `;
    const input = document.getElementById('vaultUnlockInput');
    const btn = document.getElementById('vaultUnlockBtn');
    const err = document.getElementById('vaultUnlockError');
    const submit = async () => {
        err.textContent = '';
        const pw = input.value;
        if (!pw) { err.textContent = 'Enter your master password'; return; }
        btn.disabled = true; btn.textContent = 'Unlocking…';
        try {
            const res = await api.unlockVault(pw);
            if (res && res.success) {
                await loadPasswords();
            } else {
                err.textContent = (res && res.message) || 'Wrong master password';
                btn.disabled = false; btn.textContent = 'Unlock';
            }
        } catch(e) {
            err.textContent = 'Unlock failed';
            btn.disabled = false; btn.textContent = 'Unlock';
        }
    };
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    setTimeout(() => input.focus(), 30);
}

// Renders the master-password management card above the password list.
async function refreshMasterPasswordCard() {
    const host = document.getElementById('masterPasswordCard');
    if (!host) return;
    let has = false, unlocked = true, configured = false;
    try {
        if (api.hasMasterPassword) has = (await api.hasMasterPassword()).has;
        if (has && api.isVaultUnlocked) {
            const st = await api.isVaultUnlocked();
            unlocked = !!st.unlocked; configured = !!st.configured;
        }
    } catch(e) {}

    if (!has) {
        host.innerHTML = `
            <div class="vault-card-row">
                <div class="vault-card-info">
                    <div class="vault-card-title">Master password</div>
                    <div class="vault-card-sub">Not set. Your passwords are stored unencrypted. Set a master password to encrypt them with AES-256.</div>
                </div>
                <button id="mpSetBtn" class="refresh-button btn-accent">Set master password</button>
            </div>`;
        const b = document.getElementById('mpSetBtn');
        if (b) b.addEventListener('click', () => masterPasswordPrompt('set'));
        return;
    }

    host.innerHTML = `
        <div class="vault-card-row">
            <div class="vault-card-info">
                <div class="vault-card-title">Master password <span class="vault-badge ${unlocked ? 'ok' : 'locked'}">${unlocked ? 'Unlocked' : 'Locked'}</span></div>
                <div class="vault-card-sub">Passwords are encrypted (AES-256-GCM, scrypt key derivation). The vault locks again on every browser restart.</div>
            </div>
            <div class="vault-card-actions">
                ${!unlocked ? '<button id="mpUnlockBtn" class="refresh-button btn-accent">Unlock</button>' : '<button id="mpLockBtn" class="refresh-button">Lock now</button>'}
                <button id="mpChangeBtn" class="refresh-button">Change</button>
                <button id="mpRemoveBtn" class="clear-button">Remove</button>
            </div>
        </div>`;
    const u = document.getElementById('mpUnlockBtn');
    const l = document.getElementById('mpLockBtn');
    const c = document.getElementById('mpChangeBtn');
    const r = document.getElementById('mpRemoveBtn');
    if (u) u.addEventListener('click', async () => {
        const pw = await masterPasswordPrompt('unlock');
        if (!pw) return;
        const res = await api.unlockVault(pw);
        if (res && res.success) { await refreshMasterPasswordCard(); await loadPasswords(); }
        else { showMasterToast((res && res.message) || 'Wrong password'); }
    });
    if (l) l.addEventListener('click', async () => {
        await api.lockVault();
        await refreshMasterPasswordCard();
        await loadPasswords();
    });
    if (c) c.addEventListener('click', () => masterPasswordPrompt('change'));
    if (r) r.addEventListener('click', () => masterPasswordPrompt('remove'));
}

// Returns the entered password as a string, or null if cancelled. operation
// is one of: 'set' | 'change' | 'remove' | 'unlock'.
function masterPasswordPrompt(operation) {
    return new Promise((resolve) => {
        const needOld = (operation === 'change' || operation === 'remove');
        const title = operation === 'set' ? 'Set master password'
                    : operation === 'change' ? 'Change master password'
                    : operation === 'remove' ? 'Remove master password'
                    : 'Unlock vault';
        const overlay = document.createElement('div');
        overlay.className = 'mp-modal-overlay';
        overlay.innerHTML = `
            <div class="mp-modal">
                <div class="mp-modal-title">${title}</div>
                ${needOld ? '<input type="password" class="vault-input" id="mpOld" placeholder="Current master password" autocomplete="current-password">' : ''}
                ${operation === 'set' || operation === 'change' ? '<input type="password" class="vault-input" id="mpNew" placeholder="New master password (min 4 chars)" autocomplete="new-password"><input type="password" class="vault-input" id="mpConfirm" placeholder="Confirm new password" autocomplete="new-password">' : ''}
                ${operation === 'unlock' ? '<input type="password" class="vault-input" id="mpOld" placeholder="Master password" autocomplete="current-password">' : ''}
                <div class="mp-error" id="mpError"></div>
                <div class="mp-actions">
                    <button class="refresh-button" id="mpCancel">Cancel</button>
                    <button class="refresh-button btn-accent" id="mpOk">${operation === 'set' ? 'Set' : operation === 'change' ? 'Change' : operation === 'remove' ? 'Remove' : 'Unlock'}</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        const err = overlay.querySelector('#mpError');
        const close = (val) => { overlay.remove(); resolve(val); };

        const submit = async () => {
            err.textContent = '';
            const oldInp = overlay.querySelector('#mpOld');
            const newInp = overlay.querySelector('#mpNew');
            const confInp = overlay.querySelector('#mpConfirm');
            const oldPw = oldInp ? oldInp.value : '';

            if (operation === 'unlock') {
                if (!oldPw) { err.textContent = 'Enter your master password'; return; }
                close(oldPw);
                return;
            }
            if (operation === 'remove') {
                if (!oldPw) { err.textContent = 'Enter your current master password'; return; }
                try {
                    const res = await api.removeMasterPassword(oldPw);
                    if (res && res.success) { showMasterToast(res.message || 'Removed'); await refreshMasterPasswordCard(); await loadPasswords(); }
                    else { err.textContent = (res && res.message) || 'Wrong password'; }
                } catch(e) { err.textContent = 'Failed'; }
                return;
            }
            // set / change
            const newPw = newInp ? newInp.value : '';
            const conf = confInp ? confInp.value : '';
            if (!newPw || newPw.length < 4) { err.textContent = 'New password must be at least 4 characters'; return; }
            if (newPw !== conf) { err.textContent = 'Passwords do not match'; return; }
            try {
                let res;
                if (operation === 'set') res = await api.setMasterPassword(newPw);
                else res = await api.changeMasterPassword(oldPw, newPw);
                if (res && res.success) { showMasterToast(res.message || 'Done'); await refreshMasterPasswordCard(); await loadPasswords(); overlay.remove(); resolve(null); }
                else { err.textContent = (res && res.message) || 'Failed'; }
            } catch(e) { err.textContent = 'Failed: ' + e.message; }
        };

        overlay.querySelector('#mpCancel').addEventListener('click', () => close(null));
        overlay.querySelector('#mpOk').addEventListener('click', submit);
        overlay.querySelectorAll('.vault-input').forEach(i => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') close(null); }));
        setTimeout(() => { const f = overlay.querySelector('.vault-input'); if (f) f.focus(); }, 30);
    });
}

let _masterToastTimer = null;
function showMasterToast(msg) {
    let t = document.getElementById('masterToast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'masterToast';
        t.className = 'master-toast';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(_masterToastTimer);
    _masterToastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// Load passwords
async function loadPasswords(searchTerm = '') {
    try {
        // Refresh the master-password status card in parallel.
        if (api && api.hasMasterPassword) refreshMasterPasswordCard();
        const list = document.getElementById('passwords-list');
        if (!list) {
            console.error('Element passwords-list not found');
            return;
        }

        const passwords = await api.getPasswords();

        // The password vault may be locked. When it is, the main process
        // returns { locked: true } instead of an array — show an unlock
        // prompt instead of an empty list.
        if (passwords && passwords.locked) {
            passwordsList = [];
            renderVaultLockedState(list);
            return;
        }

        passwordsList = passwords || [];
        if (list.dataset.locked) { delete list.dataset.locked; }

        // Folder filter dropdown: rebuilt from the folders actually in use.
        const folderSel = document.getElementById('pwFolderFilter');
        if (folderSel) {
            const foldersSet = new Set();
            passwordsList.forEach(p => { if (p.folder) foldersSet.add(p.folder); });
            const current = folderSel.value;
            folderSel.innerHTML = '<option value="">All folders</option>' +
                Array.from(foldersSet).sort().map(f =>
                    `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');
            if (current && foldersSet.has(current)) folderSel.value = current;
        }

        // Filter by search + folder
        const folderFilter = folderSel ? folderSel.value : '';
        const filtered = passwordsList.filter(p => {
            if (folderFilter && (p.folder || '') !== folderFilter) return false;
            if (!searchTerm) return true;
            const term = searchTerm.toLowerCase();
            return (p.site || '').toLowerCase().includes(term) ||
                   (p.username || '').toLowerCase().includes(term) ||
                   (p.notes || '').toLowerCase().includes(term);
        });

        if (filtered.length === 0) {
            list.innerHTML = '<div class="empty-passwords">No passwords found</div>';
            return;
        }

        // Sort: favorites first, then by creation date
        const sorted = filtered.sort((a, b) => {
            if (a.favorite && !b.favorite) return -1;
            if (!a.favorite && b.favorite) return 1;
            // Canonical field is createdAt (set by the add-password IPC);
            // `created` kept as a legacy fallback.
            return (b.createdAt || b.created || 0) - (a.createdAt || a.created || 0);
        });

        list.innerHTML = '';

        sorted.forEach(password => {
            const item = document.createElement('div');
            item.className = `password-item ${password.favorite ? 'favorite' : ''}`;
            item.dataset.id = password.id;

            const domain = (password.site || '').replace(/https?:\/\//, '').split('/')[0];
            const timeAgo = (password.createdAt || password.created) ? formatTimeAgo(Date.now() - (password.createdAt || password.created)) : 'long ago';
            // Privacy: favicon straight from the site, not the Google S2 proxy.
            let favUrl = '';
            try { favUrl = new URL(password.site).origin + '/favicon.ico'; } catch (e) {}

            item.innerHTML = `
                <div class="password-header">
                    <img src="${escapeHtml(favUrl)}"
                         class="password-favicon">
                    <div class="password-site" title="${escapeHtml(password.site || '')}">${escapeHtml(password.site || 'Untitled')}</div>
                    ${password.folder ? `<span class="pw-folder-badge" title="Folder">${escapeHtml(password.folder)}</span>` : ''}
                    <button class="password-favorite-btn pw-folder-btn" data-id="${password.id}" data-folder="${escapeHtml(password.folder || '')}"
                            title="Move to folder">
                        📁
                    </button>
                    <button class="password-favorite-btn ${password.favorite ? 'favorite' : ''}"
                            data-id="${password.id}"
                            title="${password.favorite ? 'Remove from favorites' : 'Add to favorites'}">
                        ${password.favorite ? '★' : '☆'}
                    </button>
                </div>
                <div class="password-username" title="${escapeHtml(password.username || '')}">
                    ${escapeHtml(password.username || 'No username')}
                </div>
                <div class="password-row">
                    <input type="password"
                           class="password-input"
                           value="${escapeHtml(password.password || '')}"
                           readonly
                           data-id="${password.id}">
                    <div class="password-actions">
                        <button class="password-action-btn copy" data-id="${password.id}" title="Copy password">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                        <button class="password-action-btn toggle" data-id="${password.id}" title="Show/Hide">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </button>
                        <button class="password-action-btn autofill" data-id="${password.id}" title="Autofill">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M23 4v6h-6"></path>
                                <path d="M1 20v-6h6"></path>
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                            </svg>
                        </button>
                        <button class="password-action-btn edit" data-id="${password.id}" title="Edit">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="password-action-btn delete" data-id="${password.id}" title="Delete">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                ${password.notes ? `
                    <div class="password-notes">
                        ${escapeHtml(password.notes)}
                    </div>
                ` : ''}
                ${password.breachedCount > 0 ? `
                    <div class="breached-indicator ${password.breachedCount > 0 ? 'danger' : 'warning'}">
                        <span class="breached-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                <line x1="12" y1="9" x2="12" y2="13"></line>
                                <line x1="12" y1="17" x2="12.01" y2="17"></line>
                            </svg>
                        </span>
                        <span class="breached-text">
                            Found in <span class="breached-count">${password.breachedCount}</span> leaks
                            ${password.lastBreachedCheck ? `(checked: ${formatTimeAgo(Date.now() - password.lastBreachedCheck)})` : ''}
                        </span>
                    </div>
                ` : ''}
                ${password.totpSecret ? `
                    <div class="totp-section" id="totp-section-${escapeHtml(String(password.id))}" data-secret="${escapeHtml(password.totpSecret)}" data-algorithm="${escapeHtml(password.totpAlgorithm || 'sha1')}" data-digits="${escapeHtml(String(password.totpDigits || 6))}">
                        <div class="totp-section-content">
                            <div class="totp-label">2FA code</div>
                            <div class="totp-code" id="totp-code-${password.id}">------</div>
                        </div>
                        <div class="totp-info">
                            <span class="totp-timer-text" id="totp-timer-${password.id}">30s</span>
                            <button class="copy-totp-btn" data-action="copy-totp" data-id="${password.id}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                ` : ''}
                <div class="password-meta">
                    <div class="password-time">
                        Added: ${timeAgo}
                        ${password.lastUsed ? `, used: ${formatTimeAgo(Date.now() - password.lastUsed)}` : ''}
                    </div>
                </div>
            `;

            list.appendChild(item);
        });

        // Add event handlers
        attachPasswordEventHandlers();

        // Initialize TOTP sections for passwords with 2FA.
        // Clear stale intervals from the previous render first.
        stopAllTOTP();
        sorted.forEach(password => {
            if (password.totpSecret) {
                initTOTPForPassword(password.id);
            }
        });

    } catch (error) {
        console.error('Error loading passwords:', error);
        const list = document.getElementById('passwords-list');
        if (list) {
            list.innerHTML = '<div class="empty-passwords">Error loading passwords</div>';
        }
    }
}

// Time formatting function (how long ago)
function formatTimeAgo(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} d ago`;
    if (hours > 0) return `${hours} h ago`;
    if (minutes > 0) return `${minutes} min ago`;
    return 'just now';
}

// Attach event handlers for passwords
function attachPasswordEventHandlers() {
    // Copy password button
    document.querySelectorAll('.password-action-btn.copy').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const passwordId = e.target.closest('button').dataset.id;
            const password = passwordsList.find(p => p.id === passwordId);

            if (password && password.password) {
                try {
                    await navigator.clipboard.writeText(password.password);
                    showToast('Password copied');

                    // Update last used time
                    try {
                        await api.updatePasswordLastUsed(passwordId);
                    } catch (error) {
                        console.error('Error updating usage time:', error);
                    }

                    // Reload list
                    loadPasswords(document.getElementById('passwords-search').value);
                } catch (error) {
                    console.error('Error copying password:', error);
                    showToast('Error copying', 'error');
                }
            }
        });
    });

    // Show/hide password button
    document.querySelectorAll('.password-action-btn.toggle').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const passwordId = e.target.closest('button').dataset.id;
            const input = document.querySelector(`.password-input[data-id="${passwordId}"]`);

            if (input) {
                if (input.type === 'password') {
                    input.type = 'text';
                    e.target.closest('button').title = 'Hide';
                    e.target.closest('button').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
                } else {
                    input.type = 'password';
                    e.target.closest('button').title = 'Show';
                    e.target.closest('button').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
                }
            }
        });
    });

    // Edit password button
    document.querySelectorAll('.password-action-btn.edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const passwordId = e.target.closest('button').dataset.id;
            const password = passwordsList.find(p => p.id === passwordId);

            if (password) {
                showPasswordModal(password);
            }
        });
    });

    // Autofill password button
    document.querySelectorAll('.password-action-btn.autofill').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const passwordId = e.target.closest('button').dataset.id;
            await autofillPassword(passwordId);
        });
    });

    // Delete password button
    document.querySelectorAll('.password-action-btn.delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const passwordId = e.target.closest('button').dataset.id;
            const password = passwordsList.find(p => p.id === passwordId);

            if (password && await customConfirm(`Delete password for ${password.site || password.username}?`)) {
                try {
                    const result = await api.deletePassword(passwordId);
                    if (result && result.success) {
                        showToast('Password deleted');
                        loadPasswords(document.getElementById('passwords-search').value);
                    } else {
                        showToast(result?.message || 'Error deleting password', 'error');
                    }
                } catch (error) {
                    console.error('Error deleting password:', error);
                    showToast('Error deleting password', 'error');
                }
            }
        });
    });

    // Favorite button (the folder button reuses part of the styling but has
    // its own handler below)
    document.querySelectorAll('.password-favorite-btn:not(.pw-folder-btn)').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const passwordId = e.target.closest('button').dataset.id;
            const password = passwordsList.find(p => p.id === passwordId);

            if (password) {
                try {
                    const result = await api.togglePasswordFavorite(passwordId, !password.favorite);
                    if (result && result.success) {
                        showToast(password.favorite ? 'Removed from favorites' : 'Added to favorites');
                        loadPasswords(document.getElementById('passwords-search').value);
                    } else {
                        showToast(result?.message || 'Error updating favorite', 'error');
                    }
                } catch (error) {
                    console.error('Error updating favorite:', error);
                    showToast('Error updating', 'error');
                }
            }
        });
    });

    // Folder button: move a password into a (new or existing) folder.
    document.querySelectorAll('.pw-folder-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = e.target.closest('button').dataset.id;
            const cur = e.target.closest('button').dataset.folder || '';
            const folders = Array.from(new Set(passwordsList.map(p => p.folder).filter(Boolean))).sort();
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:100000;';
            overlay.innerHTML = `<div style="background:var(--card-bg,var(--overlay-bg));border:1px solid var(--card-border,var(--border-color));border-radius:16px;padding:24px;min-width:340px;">
                <h3 style="color:var(--h2-color,#fff);margin:0 0 14px;font-size:17px;">Move to folder</h3>
                <input id="pw-folder-inp" list="pw-folder-list" value="${escapeHtml(cur)}" placeholder="Folder name (empty = no folder)"
                    style="width:100%;padding:10px 14px;border-radius:10px;background:var(--input-bg);border:var(--input-border);color:var(--input-color);font-size:14px;">
                <datalist id="pw-folder-list">${folders.map(f => `<option value="${escapeHtml(f)}">`).join('')}</datalist>
                <div style="display:flex;gap:10px;margin-top:18px;justify-content:flex-end;">
                    <button id="pw-folder-cancel" style="padding:8px 16px;border-radius:8px;background:var(--btn-bg);border:var(--btn-border);color:var(--btn-color);cursor:pointer;">Cancel</button>
                    <button id="pw-folder-ok" style="padding:8px 16px;border-radius:8px;background:var(--accent-gradient,#667eea);color:#fff;border:none;cursor:pointer;font-weight:600;">Move</button>
                </div></div>`;
            document.body.appendChild(overlay);
            const inp = overlay.querySelector('#pw-folder-inp');
            setTimeout(() => inp.focus(), 50);
            overlay.querySelector('#pw-folder-cancel').onclick = () => overlay.remove();
            overlay.querySelector('#pw-folder-ok').onclick = async () => {
                const folder = inp.value.trim();
                overlay.remove();
                try {
                    const r = await api.editPassword(id, { folder: folder });
                    const _tp = function (s) { return (window.i18n && window.i18n.t(s)) || s; };
                    if (r && r.success) { showToast(folder ? (_tp('Moved to') + ' «' + folder + '»') : _tp('Removed from folder')); loadPasswords(document.getElementById('passwords-search').value); }
                    else showToast(r?.message || 'Error moving password', 'error');
                } catch (err) { showToast('Error moving password', 'error'); }
            };
            inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') overlay.querySelector('#pw-folder-ok').click(); });
            overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
        });
    });

    // Folder filter
    const folderSelEl = document.getElementById('pwFolderFilter');
    if (folderSelEl && !folderSelEl.dataset.wired) {
        folderSelEl.dataset.wired = '1';
        folderSelEl.addEventListener('change', () => loadPasswords(document.getElementById('passwords-search').value));
    }
}

// Show modal for adding/editing password
function showPasswordModal(password = null) {
    editingPasswordId = password ? password.id : null;

    const modal = document.getElementById('password-modal');
    const title = document.getElementById('password-modal-title');

    if (password) {
        title.innerHTML = `Edit password <button class="close-btn" id="close-password-modal">×</button>`;
        document.getElementById('password-site').value = password.site || '';
        document.getElementById('password-username').value = password.username || '';
        document.getElementById('password-password').value = password.password || '';
        document.getElementById('password-notes').value = password.notes || '';
        document.getElementById('password-totp-secret').value = password.totpSecret || '';

        // Initialize TOTP preview if secret exists
        if (password.totpSecret) {
            setupTOTPSecret();
        }
    } else {
        title.innerHTML = `Add password <button class="close-btn" id="close-password-modal">×</button>`;
        document.getElementById('password-site').value = '';
        document.getElementById('password-username').value = '';
        document.getElementById('password-password').value = '';
        document.getElementById('password-notes').value = '';
        document.getElementById('password-totp-secret').value = '';

        // Hide TOTP preview when creating a new password
        document.getElementById('totp-preview').style.display = 'none';
        if (totpPreviewInterval) {
            clearInterval(totpPreviewInterval);
            totpPreviewInterval = null;
        }
    }

    // Update password strength
    updatePasswordStrength(password ? password.password : '');

    modal.style.display = 'flex';

    // Focus on first field
    document.getElementById('password-site').focus();
}

// Generate strong password
function generateStrongPassword(length = 16) {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";
    let password = "";
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        password += charset[randomIndex];
    }
    return password;
}

// Update password strength indicator
function updatePasswordStrength(password) {
    const strengthBar = document.getElementById('password-strength-bar');
    const strengthText = document.getElementById('password-strength-text');

    if (!password || password.length === 0) {
        strengthBar.style.width = '0%';
        strengthBar.style.background = 'var(--btn-bg)';
        strengthText.textContent = 'Weak';
        strengthText.style.color = 'var(--secondary-text)';
        return;
    }

    let score = 0;

    // Scoring criteria
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    // Determine strength
    let strength = 'Weak';
    let width = '25%';
    let color = '#f44336';

    if (score >= 5) {
        strength = 'Strong';
        width = '100%';
        color = '#4CAF50';
    } else if (score >= 3) {
        strength = 'Medium';
        width = '50%';
        color = '#FF9800';
    }

    strengthBar.style.width = width;
    strengthBar.style.background = color;
    strengthText.textContent = strength;
    strengthText.style.color = color;
}

// Initialize password manager
function initPasswordManager() {
    const searchInput = document.getElementById('passwords-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            loadPasswords(e.target.value);
        });
    }

    // Add password button
    const addBtn = document.getElementById('add-password-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            showPasswordModal();
        });
    }

    // Export button
    const exportBtn = document.getElementById('export-passwords-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            try {
                const result = await api.exportPasswords();
                if (result && result.success) {
                    showToast('Passwords exported');
                } else {
                    showToast(result?.message || 'Error exporting passwords', 'error');
                }
            } catch (error) {
                console.error('Error exporting passwords:', error);
                showToast('Error exporting passwords', 'error');
            }
        });
    }

    // Import button
    const importBtn = document.getElementById('import-passwords-btn');
    if (importBtn) {
        importBtn.addEventListener('click', async () => {
            try {
                const result = await api.importPasswords();
                if (result && result.success) {
                    showToast('Passwords imported');
                    loadPasswords();
                } else {
                    showToast(result?.message || 'Error importing passwords', 'error');
                }
            } catch (error) {
                console.error('Error importing passwords:', error);
                showToast('Error importing passwords', 'error');
            }
        });
    }

    // Clear button
    const clearBtn = document.getElementById('clear-passwords-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            if (await customConfirm('Are you sure you want to delete all passwords? This action cannot be undone.')) {
                try {
                    const result = await api.clearAllPasswords();
                    if (result && result.success) {
                        showToast('All passwords deleted');
                        loadPasswords();
                    } else {
                        showToast(result?.message || 'Error clearing passwords', 'error');
                    }
                } catch (error) {
                    console.error('Error clearing passwords:', error);
                    showToast('Error clearing passwords', 'error');
                }
            }
        });
    }

    // Check leaks button
    const checkBreachedBtn = document.getElementById('check-breached-btn');
    if (checkBreachedBtn) {
        checkBreachedBtn.addEventListener('click', async () => {
            await checkAllPasswordsBreached();
        });
    }

    // Security analysis button
    const securityAnalysisBtn = document.getElementById('security-analysis-btn');
    if (securityAnalysisBtn) {
        securityAnalysisBtn.addEventListener('click', async () => {
            await showSecurityAnalysis();
        });
    }

    // Close analysis modal button
    const closeAnalysisModal = document.getElementById('close-analysis-modal');
    if (closeAnalysisModal) {
        closeAnalysisModal.addEventListener('click', () => {
            document.getElementById('security-analysis-modal').style.display = 'none';
        });
    }

    // Import from Google Authenticator button
    const importGABtn = document.getElementById('import-ga-btn');
    if (importGABtn) {
        importGABtn.addEventListener('click', async () => {
            await importGAExport();
        });
    }

    // Import from txt file button
    const importTxtBtn = document.getElementById('import-txt-btn');
    if (importTxtBtn) {
        importTxtBtn.addEventListener('click', async () => {
            await importTxtExport();
        });
    }

    // Autofill test page button
    const testAutofillBtn = document.getElementById('test-autofill-btn');
    if (testAutofillBtn) {
        testAutofillBtn.addEventListener('click', () => {
            // This page is Library.html — the old code stripped '/Settings.html'
            // (a copy-paste from Settings), producing .../Library.html/test-login.html.
            const currentPath = decodeURIComponent(window.location.pathname).replace(/\/Library\.html$/i, '');
            const testPageUrl = `file://${currentPath}/test-login.html`;
            window.electronAPI.openUrlFromSettings(testPageUrl);
        });
    }

    // Modal handlers
    const modal = document.getElementById('password-modal');
    const closeBtn = document.getElementById('close-password-modal');
    const cancelBtn = document.getElementById('cancel-password');
    const form = document.getElementById('password-form');
    const passwordInput = document.getElementById('password-password');
    const toggleVisibilityBtn = document.getElementById('toggle-password-visibility');
    const generateBtn = document.getElementById('generate-password');

    // Close modal
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            editingPasswordId = null;
            // Clear TOTP preview interval
            if (totpPreviewInterval) {
                clearInterval(totpPreviewInterval);
                totpPreviewInterval = null;
            }
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            editingPasswordId = null;
            // Clear TOTP preview interval
            if (totpPreviewInterval) {
                clearInterval(totpPreviewInterval);
                totpPreviewInterval = null;
            }
        });
    }

    // Close on click outside
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                editingPasswordId = null;
                if (totpPreviewInterval) { clearInterval(totpPreviewInterval); totpPreviewInterval = null; }
            }
        });
    }

    // Show/hide password
    if (toggleVisibilityBtn && passwordInput) {
        toggleVisibilityBtn.addEventListener('click', () => {
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                toggleVisibilityBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
            } else {
                passwordInput.type = 'password';
                toggleVisibilityBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
            }
        });
    }

    // Generate password
    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            showPasswordGenerator();
        });
    }

    // TOTP Secret field
    const totpSecretInput = document.getElementById('password-totp-secret');
    if (totpSecretInput) {
        // Debounce for search
        let timeout;
        totpSecretInput.addEventListener('input', (e) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                setupTOTPSecret();
            }, 500);
        });
    }

    // Hidden input for QR code upload
    if (!document.getElementById('qr-code-file-input')) {
        const qrInput = document.createElement('input');
        qrInput.type = 'file';
        qrInput.id = 'qr-code-file-input';
        qrInput.accept = 'image/*';
        qrInput.style.display = 'none';
        document.body.appendChild(qrInput);
    }

    // QR code scan button
    const scanQRBtn = document.getElementById('scan-qr-btn');
    if (scanQRBtn) {
        scanQRBtn.addEventListener('click', () => {
            const qrInput = document.getElementById('qr-code-file-input');
            if (qrInput) {
                qrInput.click();
            }
        });
    }

    const scanPageQRBtn = document.getElementById('scan-page-qr-btn');
    if (scanPageQRBtn) {
        scanPageQRBtn.addEventListener('click', async () => {
            scanPageQRBtn.disabled = true;
            scanPageQRBtn.style.opacity = '0.5';
            try {
                const result = await window.electronAPI.scanPageQR();
                if (result.success && result.data) {
                    const extractResult = await window.electronAPI.extractTOTPFromQR(result.data);
                    if (extractResult.success) {
                        const secretInput = document.getElementById('password-totp-secret');
                        if (secretInput) {
                            secretInput.value = extractResult.secret;
                            setupTOTPSecret();
                        }
                        showToast('QR code found on the page!', 'success');
                    } else {
                        const secretInput = document.getElementById('password-totp-secret');
                        if (secretInput) {
                            secretInput.value = result.data;
                            setupTOTPSecret();
                        }
                        showToast('QR contains: ' + result.data.substring(0, 60), 'success');
                    }
                } else {
                    showToast(result.message || 'QR code not found', 'error');
                }
            } catch (error) {
                showToast('Error scanning page', 'error');
            }
            scanPageQRBtn.disabled = false;
            scanPageQRBtn.style.opacity = '1';
        });
    }

    // Handle QR code file selection
    const qrInput = document.getElementById('qr-code-file-input');
    if (qrInput) {
        qrInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    const img = new Image();
                    img.onload = async () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);

                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                        let qrData = null;
                        if (typeof jsQR === 'function') {
                            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
                            if (code && code.data) qrData = code.data;
                        }

                        if (qrData) {
                            const extractResult = await window.electronAPI.extractTOTPFromQR(qrData);

                            if (extractResult.success) {
                                const secretInput = document.getElementById('password-totp-secret');
                                if (secretInput) {
                                    secretInput.value = extractResult.secret;
                                    setupTOTPSecret();
                                }
                                showToast('QR code recognized!', 'success');
                            } else {
                                try { await navigator.clipboard.writeText(qrData); } catch {}
                                showToast('QR contains: ' + qrData.substring(0, 80) + (qrData.length > 80 ? '...' : ''), 'success');
                            }
                        } else {
                            showToast('QR code not found in the image', 'error');
                        }
                    };
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            } catch (error) {
                console.error('Error loading QR code:', error);
                showToast('Error loading file', 'error');
            }

            e.target.value = '';
        });
    }

    // Copy current TOTP button
    const copyTOTPBtn = document.getElementById('copy-current-totp');
    if (copyTOTPBtn) {
        copyTOTPBtn.addEventListener('click', async () => {
            const code = document.getElementById('current-totp-code').textContent;
            if (code && code !== '------') {
                try {
                    await navigator.clipboard.writeText(code);
                    showToast('TOTP code copied', 'success');
                } catch (error) {
                    showToast('Error copying', 'error');
                }
            }
        });
    }

    // Password change (update strength)
    if (passwordInput) {
        passwordInput.addEventListener('input', (e) => {
            updatePasswordStrength(e.target.value);
        });
    }

    // Save password
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const site = document.getElementById('password-site').value.trim();
            const username = document.getElementById('password-username').value.trim();
            const password = document.getElementById('password-password').value;
            const notes = document.getElementById('password-notes').value.trim();
            const totpSecret = document.getElementById('password-totp-secret').value.trim();

            if (!site || !username || !password) {
                showToast('Fill in the required fields', 'error');
                return;
            }

            try {
                let result;
                if (editingPasswordId) {
                    // Edit existing password
                    result = await api.editPassword(editingPasswordId, {
                        site,
                        username,
                        password,
                        notes,
                        totpSecret
                    });
                } else {
                    // Add new password
                    result = await api.addPassword({
                        site: site,
                        username: username,
                        password: password,
                        notes: notes,
                        totpSecret: totpSecret
                    });
                }

                if (result && result.success) {
                    showToast(editingPasswordId ? 'Password updated' : 'Password added');
                    modal.style.display = 'none';
                    editingPasswordId = null;

                    // Clear TOTP preview interval
                    if (totpPreviewInterval) {
                        clearInterval(totpPreviewInterval);
                        totpPreviewInterval = null;
                    }

                    loadPasswords(document.getElementById('passwords-search').value);
                } else {
                    showToast(result?.message || 'Error saving password', 'error');
                }

            } catch (error) {
                console.error('Error saving password:', error);
                showToast('Error saving password', 'error');
            }
        });
    }

    // Listen for password updates
    api.onPasswordsUpdated(() => {
        loadPasswords(document.getElementById('passwords-search').value);
    });

    // Initialize password generator
    initPasswordGenerator();
}

// =============== PASSWORD GENERATOR ===============
let generatorOptions = {
    length: 16,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
    excludeAmbiguous: false
};

function showPasswordGenerator() {
    const modal = document.getElementById('password-generator-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    generateNewPassword();
}

function closePasswordGenerator() {
    const modal = document.getElementById('password-generator-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function generateNewPassword() {
    try {
        const result = await window.electronAPI.generatePassword(generatorOptions);

        if (result && result.success) {
            document.getElementById('generated-password').textContent = result.password;
            updateGeneratorStrength(result.password, result.entropy, result.strength);
        } else {
            showToast('Error generating password', 'error');
        }
    } catch (error) {
        console.error('Error generating:', error);
        showToast('Error generating password', 'error');
    }
}

function updateGeneratorStrength(password, entropy, strength) {
    const fill = document.getElementById('gen-strength-bar');
    const text = document.getElementById('gen-strength-text');
    const entropyText = document.getElementById('gen-entropy');

    if (!strength) {
        fill.style.width = '0%';
        text.textContent = '---';
        text.style.color = 'var(--text-color)';
        entropyText.textContent = '0 bits';
        return;
    }

    fill.style.width = strength.percent + '%';
    fill.style.background = strength.color;
    text.textContent = strength.label;
    text.style.color = strength.color;
    entropyText.textContent = entropy.toFixed(1) + ' bits';
}

async function useGeneratedPassword() {
    const generatedPassword = document.getElementById('generated-password').textContent;

    if (!generatedPassword || generatedPassword === 'Click "Generate"') {
        showToast('First generate a password', 'warning');
        return;
    }

    // If add/edit password modal is open
    const passwordInput = document.getElementById('password-password');
    if (passwordInput) {
        passwordInput.value = generatedPassword;
        updatePasswordStrength(generatedPassword);
        closePasswordGenerator();
        showToast('Password inserted', 'success');
    } else {
        // Just copy to clipboard
        try {
            await navigator.clipboard.writeText(generatedPassword);
            showToast('Password copied to clipboard', 'success');
        } catch (error) {
            showToast('Error copying', 'error');
        }
    }
}

async function copyGeneratedPassword() {
    const generatedPassword = document.getElementById('generated-password').textContent;

    if (!generatedPassword || generatedPassword === 'Click "Generate"') {
        showToast('First generate a password', 'warning');
        return;
    }

    try {
        await navigator.clipboard.writeText(generatedPassword);
        showToast('Password copied to clipboard', 'success');
    } catch (error) {
        showToast('Error copying', 'error');
    }
}

function initPasswordGenerator() {
    // Length slider
    const lengthSlider = document.getElementById('gen-length');
    const lengthValue = document.getElementById('length-value');

    if (lengthSlider && lengthValue) {
        lengthSlider.addEventListener('input', (e) => {
            generatorOptions.length = parseInt(e.target.value);
            lengthValue.textContent = generatorOptions.length;
            generateNewPassword();
        });
    }

    // Checkboxes
    const checkboxes = ['uppercase', 'lowercase', 'numbers', 'symbols', 'ambiguous'];

    checkboxes.forEach(opt => {
        const checkbox = document.getElementById('gen-' + opt);
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                if (opt === 'ambiguous') {
                    generatorOptions.excludeAmbiguous = e.target.checked;
                } else {
                    generatorOptions[opt] = e.target.checked;

                    // Check that at least one option is selected
                    if (!generatorOptions.uppercase && !generatorOptions.lowercase &&
                        !generatorOptions.numbers && !generatorOptions.symbols) {
                        e.target.checked = true;
                        generatorOptions[opt] = true;
                        showToast('Select at least one character type', 'warning');
                        return;
                    }
                }

                generateNewPassword();
            });
        }
    });

    // Buttons
    const regenerateBtn = document.getElementById('regenerate-password');
    if (regenerateBtn) {
        regenerateBtn.addEventListener('click', generateNewPassword);
    }

    const copyBtn = document.getElementById('copy-generated');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyGeneratedPassword);
    }

    const useBtn = document.getElementById('use-generated-password');
    if (useBtn) {
        useBtn.addEventListener('click', useGeneratedPassword);
    }

    const closeBtn = document.getElementById('close-generator-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', closePasswordGenerator);
    }

    // Close on click outside
    const modal = document.getElementById('password-generator-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closePasswordGenerator();
            }
        });
    }
}

// =============== LEAK CHECK (HAVE I BEEN PWNED) ===============
async function checkAllPasswordsBreached() {
    if (passwordsList.length === 0) {
        showToast('No passwords to check', 'warning');
        return;
    }

    const checkBtn = document.getElementById('check-breached-btn');
    if (checkBtn) {
        checkBtn.disabled = true;
        checkBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px; animation: spin 1s linear infinite;"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg> Checking...';
    }

    showToast('Checking passwords for leaks... This may take a while.', 'info');

    try {
        const result = await window.electronAPI.checkAllPasswordsBreached();

        if (result && result.success) {
            const breached = result.breachedCount;
            const total = result.totalCount;

            if (result.networkFailed) {
                showToast('Could not reach the leak database (check your connection) — results may be incomplete', 'warning');
            }

            if (breached > 0) {
                showToast(`Found ${breached} passwords in leaks out of ${total}!`, 'error');
            } else {
                showToast(`All ${total} passwords are safe`, 'success');
            }

            // Update password data with check results
            passwordsList.forEach(password => {
                const resultItem = result.results?.find(r => r.id === password.id);
                if (resultItem) {
                    password.breachedCount = resultItem.count;
                    password.lastBreachedCheck = Date.now();
                }
            });

            // Reload password list
            const searchTerm = document.getElementById('passwords-search')?.value || '';
            loadPasswords(searchTerm);

        } else {
            showToast(result?.message || 'Error checking passwords', 'error');
        }
    } catch (error) {
        console.error('Error checking for leaks:', error);
        showToast('Error checking passwords for leaks', 'error');
    } finally {
        if (checkBtn) {
            checkBtn.disabled = false;
            checkBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Check leaks';
        }
    }
}

// ========== Security analysis functions ==========

// Calculate password strength
function calculateStrength(password) {
    let score = 0;

    // Length
    if (password.length >= 8) score += 20;
    if (password.length >= 12) score += 20;
    if (password.length >= 16) score += 10;

    // Complexity
    if (/[a-z]/.test(password)) score += 10;
    if (/[A-Z]/.test(password)) score += 10;
    if (/[0-9]/.test(password)) score += 10;
    if (/[^a-zA-Z0-9]/.test(password)) score += 20;

    let text = 'Weak';
    if (score >= 80) text = 'Strong';
    else if (score >= 60) text = 'Good';
    else if (score >= 40) text = 'Medium';

    return { score: Math.min(100, score), text };
}

// ========== Security analysis functions ==========

async function showSecurityAnalysis() {
    if (passwordsList.length === 0) {
        showToast('No passwords to analyze', 'warning');
        return;
    }

    const modal = document.getElementById('security-analysis-modal');
    if (!modal) return;

    // Show modal
    modal.style.display = 'flex';

    // Analyze passwords
    const analysis = analyzePasswords(passwordsList);

    // Display results
    displaySecurityAnalysis(analysis);
}

function analyzePasswords(passwords) {
    const weakPasswords = [];
    const duplicateGroups = [];
    const oldPasswords = [];
    const passwordMap = new Map();

    // Current date minus 6 months
    const sixMonthsAgo = Date.now() - (6 * 30 * 24 * 60 * 60 * 1000);

    passwords.forEach(password => {
        // Check password strength
        const strength = calculateStrength(password.password);
        if (strength.score < 50) {
            weakPasswords.push({
                ...password,
                strength: strength.score,
                strengthText: strength.text
            });
        }

        // Check password age
        if (password.createdAt && password.createdAt < sixMonthsAgo) {
            const monthsOld = Math.floor((Date.now() - password.createdAt) / (30 * 24 * 60 * 60 * 1000));
            oldPasswords.push({
                ...password,
                monthsOld
            });
        }

        // Collect duplicates
        if (!passwordMap.has(password.password)) {
            passwordMap.set(password.password, []);
        }
        passwordMap.get(password.password).push(password);
    });

    // Find duplicate groups (where >1 site uses the same password)
    passwordMap.forEach((sites, pwd) => {
        if (sites.length > 1) {
            duplicateGroups.push({
                password: pwd,
                sites: sites.map(s => ({ site: s.site, username: s.username, id: s.id }))
            });
        }
    });

    // Sort by importance
    weakPasswords.sort((a, b) => a.strength - b.strength);
    duplicateGroups.sort((a, b) => b.sites.length - a.sites.length);
    oldPasswords.sort((a, b) => a.monthsOld - b.monthsOld);

    // Calculate overall security score
    let score = 100;
    score -= weakPasswords.length * 10;  // -10 for each weak password
    score -= duplicateGroups.length * 15; // -15 for each duplicate group
    score -= oldPasswords.length * 5;    // -5 for each old password
    score = Math.max(0, Math.min(100, score));

    // Generate recommendations
    const recommendations = [];
    if (weakPasswords.length > 0) {
        recommendations.push(`Strengthen ${weakPasswords.length} weak ${declension(weakPasswords.length, 'password', 'passwords', 'passwords')}`);
    }
    if (duplicateGroups.length > 0) {
        recommendations.push(`Change ${duplicateGroups.length} ${declension(duplicateGroups.length, 'duplicate group', 'duplicate groups', 'duplicate groups')} - use unique passwords`);
    }
    if (oldPasswords.length > 0) {
        recommendations.push(`⏰ Update ${oldPasswords.length} ${declension(oldPasswords.length, 'old password', 'old passwords', 'old passwords')} (unchanged for more than 6 months)`);
    }
    if (recommendations.length === 0) {
        recommendations.push('✓ Excellent! Your passwords are secure');
    }

    return {
        score,
        weakPasswords,
        duplicateGroups,
        oldPasswords,
        recommendations
    };
}

function displaySecurityAnalysis(analysis) {
    // Update security score
    const scoreNumber = document.getElementById('security-score-number');
    const scoreRing = document.getElementById('security-score-ring');
    const scoreMessage = document.getElementById('security-score-message');

    if (scoreNumber) scoreNumber.textContent = analysis.score;

    // Animate ring
    if (scoreRing) {
        const circumference = 339.292;
        const offset = circumference - (analysis.score / 100) * circumference;
        setTimeout(() => {
            scoreRing.style.strokeDashoffset = offset;
        }, 100);

        // Change color based on score
        const gradient = scoreRing.querySelector('linearGradient');
        if (gradient) {
            const stops = gradient.querySelectorAll('stop');
            if (analysis.score >= 80) {
                stops[0].style.stopColor = '#4CAF50';
                stops[1].style.stopColor = '#8BC34A';
            } else if (analysis.score >= 50) {
                stops[0].style.stopColor = '#FF9800';
                stops[1].style.stopColor = '#FFC107';
            } else {
                stops[0].style.stopColor = '#f44336';
                stops[1].style.stopColor = '#FF5722';
            }
        }
    }

    // Score message
    if (scoreMessage) {
        if (analysis.score >= 80) {
            scoreMessage.textContent = '✓ Excellent! Your security level is high';
            scoreMessage.style.color = '#4CAF50';
        } else if (analysis.score >= 50) {
            scoreMessage.textContent = 'Medium level. Room for improvement';
            scoreMessage.style.color = '#FF9800';
        } else {
            scoreMessage.textContent = 'Critical! Security improvement needed';
            scoreMessage.style.color = '#f44336';
        }
    }

    // Display weak passwords
    const weakCount = document.getElementById('weak-count');
    const weakList = document.getElementById('weak-list');
    if (weakCount) weakCount.textContent = analysis.weakPasswords.length;
    if (weakList) {
        if (analysis.weakPasswords.length === 0) {
            weakList.innerHTML = '<div class="empty-category">✓ No weak passwords</div>';
        } else {
            weakList.innerHTML = analysis.weakPasswords.map(pwd => `
                <div class="category-item">
                    <div class="category-item-info">
                        <div class="category-item-site">${escapeHtml(getSiteName(pwd.site))}</div>
                        <div class="category-item-username">${escapeHtml(pwd.username)}</div>
                    </div>
                    <div class="category-item-actions">
                        <button class="category-item-btn fix" data-action="edit-password-analysis" data-id="${escapeHtml(pwd.id)}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;">
                                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                            </svg>
                            Strengthen
                        </button>
                    </div>
                </div>
            `).join('');
        }
    }

    // Display duplicates
    const duplicateCount = document.getElementById('duplicate-count');
    const duplicateList = document.getElementById('duplicate-list');
    if (duplicateCount) duplicateCount.textContent = analysis.duplicateGroups.length;
    if (duplicateList) {
        if (analysis.duplicateGroups.length === 0) {
            duplicateList.innerHTML = '<div class="empty-category">✓ No duplicates</div>';
        } else {
            duplicateList.innerHTML = analysis.duplicateGroups.map(group => `
                <div class="duplicate-group">
                    <div class="duplicate-password">•••••••• (${group.password.length} characters)</div>
                    <div class="duplicate-sites">
                        ${group.sites.map(site => `
                            <span class="duplicate-site">${escapeHtml(getSiteName(site.site))}</span>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        }
    }

    // Display old passwords
    const oldCount = document.getElementById('old-count');
    const oldList = document.getElementById('old-list');
    if (oldCount) oldCount.textContent = analysis.oldPasswords.length;
    if (oldList) {
        if (analysis.oldPasswords.length === 0) {
            oldList.innerHTML = '<div class="empty-category">✓ No old passwords</div>';
        } else {
            oldList.innerHTML = analysis.oldPasswords.map(pwd => `
                <div class="category-item">
                    <div class="category-item-info">
                        <div class="category-item-site">${escapeHtml(getSiteName(pwd.site))}</div>
                        <div class="category-item-username">${escapeHtml(pwd.username)} • ${pwd.monthsOld} mo.</div>
                    </div>
                    <div class="category-item-actions">
                        <button class="category-item-btn fix" data-action="edit-password-analysis" data-id="${escapeHtml(pwd.id)}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 4px;">
                                <path d="M23 4v6h-6"></path>
                                <path d="M1 20v-6h6"></path>
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                            </svg>
                            Update
                        </button>
                    </div>
                </div>
            `).join('');
        }
    }

    // Display recommendations
    const recommendationsList = document.getElementById('recommendations-list');
    if (recommendationsList) {
        recommendationsList.innerHTML = analysis.recommendations.map(rec => `<li>${rec}</li>`).join('');
    }
}

// Extract site name from URL
function getSiteName(url) {
    if (!url) return 'Unknown site';
    try {
        const urlObj = new URL(url);
        return urlObj.hostname;
    } catch {
        return url;
    }
}

// Helper function for word declension
function declension(number, one, two, five) {
    const n = Math.abs(number);
    const n10 = n % 10;
    const n100 = n % 100;

    if (n100 >= 11 && n100 <= 19) {
        return five;
    }
    if (n10 === 1) {
        return one;
    }
    if (n10 >= 2 && n10 <= 4) {
        return two;
    }
    return five;
}

// Function to edit password from analysis
window.editPasswordFromAnalysis = function(passwordId) {
    const password = passwordsList.find(p => p.id === passwordId);
    if (password) {
        // Close analysis modal
        document.getElementById('security-analysis-modal').style.display = 'none';

        // Open edit modal
        showPasswordModal(password);
    }
};

async function checkSinglePasswordBreached(password) {
    try {
        const result = await window.electronAPI.checkPasswordBreached(password);

        if (result && result.error === 'network') {
            showToast('Could not reach the leak database (check your connection)', 'warning');
            return { breached: false, count: 0, error: 'network' };
        }
        if (result && result.breached) {
            showToast(`Password found in ${result.count} leaks!`, 'error');
            return { breached: true, count: result.count };
        } else {
            showToast('Password not found in leaks', 'success');
            return { breached: false, count: 0 };
        }
    } catch (error) {
        console.error('Error checking password:', error);
        showToast('Error checking password', 'error');
        return { breached: false, count: 0 };
    }
}

// =============== TOTP (2FA) FUNCTIONS ===============
let totpUpdateIntervals = new Map();

// Initialize TOTP for password card
function initTOTPForPassword(passwordId) {
    const section = document.getElementById(`totp-section-${passwordId}`);
    if (!section) return;

    const secret = section.dataset.secret;
    const algorithm = section.dataset.algorithm || 'sha1';
    const digits = parseInt(section.dataset.digits) || 6;

    // Show section
    section.style.display = 'flex';

    // Update TOTP code every second
    const updateTOTP = async () => {
        try {
            const result = await window.electronAPI.generateTOTP(secret, { algorithm, digits });

            if (result.success) {
                const codeElement = document.getElementById(`totp-code-${passwordId}`);
                const timerElement = document.getElementById(`totp-timer-${passwordId}`);

                if (codeElement) codeElement.textContent = result.code;
                if (timerElement) timerElement.textContent = result.timeRemaining + 's';
            }
        } catch (error) {
            console.error('Error updating TOTP:', error);
        }
    };

    updateTOTP();

    // Clear previous interval if any
    if (totpUpdateIntervals.has(passwordId)) {
        clearInterval(totpUpdateIntervals.get(passwordId));
    }

    // Set new interval
    const interval = setInterval(updateTOTP, 1000);
    totpUpdateIntervals.set(passwordId, interval);
}

// Stop TOTP updates for password
function stopTOTPForPassword(passwordId) {
    if (totpUpdateIntervals.has(passwordId)) {
        clearInterval(totpUpdateIntervals.get(passwordId));
        totpUpdateIntervals.delete(passwordId);
    }
}

// Stop ALL TOTP intervals. MUST run before re-rendering the password list —
// otherwise every loadPasswords() call stacked another 1-second interval per
// 2FA entry (IPC spam + timers leak).
function stopAllTOTP() {
    totpUpdateIntervals.forEach(function (interval) { clearInterval(interval); });
    totpUpdateIntervals.clear();
}

// Copy TOTP code
async function copyTOTPCode(passwordId) {
    const codeElement = document.getElementById(`totp-code-${passwordId}`);
    if (!codeElement) return;

    const code = codeElement.textContent;
    if (code === '------') {
        showToast('TOTP code not ready', 'warning');
        return;
    }

    try {
        await navigator.clipboard.writeText(code);
        showToast('TOTP code copied', 'success');
    } catch (error) {
        showToast('Error copying', 'error');
    }
}

// Set up TOTP secret in modal
let totpPreviewInterval = null;
async function setupTOTPSecret() {
    const secretInput = document.getElementById('password-totp-secret');
    const secret = secretInput.value.trim();

    if (!secret) {
        // Hide preview if secret is empty
        document.getElementById('totp-preview').style.display = 'none';
        if (totpPreviewInterval) {
            clearInterval(totpPreviewInterval);
            totpPreviewInterval = null;
        }
        return;
    }

    try {
        const result = await window.electronAPI.parseTOTPSecret(secret);

        if (result.success) {
            // Show preview
            const preview = document.getElementById('totp-preview');
            preview.style.display = 'flex';

            // Update code every second
            const updatePreview = async () => {
                try {
                    const totpResult = await window.electronAPI.generateTOTP(result.secret, {
                        algorithm: result.algorithm,
                        digits: result.digits
                    });

                    if (totpResult.success) {
                        document.getElementById('current-totp-code').textContent = totpResult.code;
                        document.getElementById('totp-progress').style.clipPath =
                            `circle(${totpResult.timeRemaining / 30 * 100}% at 50% 50%)`;
                    }
                } catch (error) {
                    console.error('Error updating TOTP preview:', error);
                }
            };

            updatePreview();

            // Clear previous interval
            if (totpPreviewInterval) {
                clearInterval(totpPreviewInterval);
            }

            // Set new interval
            totpPreviewInterval = setInterval(updatePreview, 1000);
        } else {
            showToast(result.error || 'Invalid TOTP secret', 'error');
            document.getElementById('totp-preview').style.display = 'none';
        }
    } catch (error) {
        console.error('Error parsing TOTP secret:', error);
        showToast('Error checking TOTP secret', 'error');
    }
}

// Import from Google Authenticator
async function importGAExport() {
    // Create input for file selection
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const content = await file.text();
            const result = await window.electronAPI.importGAExport(content);

            if (result.success) {
                showToast(`Imported ${result.imported} entries`, 'success');

                // Add imported passwords
                result.passwords.forEach(newPassword => {
                    passwordsList.push(newPassword);
                });

                // Update display
                const searchTerm = document.getElementById('passwords-search').value;
                loadPasswords(searchTerm);
            } else {
                const errorMsg = result.errors?.join(', ') || 'Import error';
                showToast(`${errorMsg}`, 'error');
            }
        } catch (error) {
            console.error('Error importing from GA:', error);
            showToast('Error importing from GA', 'error');
        }
    };

    input.click();
}

// Import from txt file
async function importTxtExport() {
    // Create input for file selection
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const content = await file.text();
            const result = await window.electronAPI.importTxtFile(content);

            if (result.success) {
                // Save each imported password (add-password expects ONE
                // object argument — the old positional call passed site as
                // the whole object and the import never saved anything).
                for (const newPassword of result.passwords) {
                    const saveResult = await api.addPassword({
                        site: newPassword.site,
                        username: newPassword.username,
                        password: newPassword.password,
                        notes: newPassword.notes || '',
                        totpSecret: newPassword.totpSecret || ''
                    });

                    if (!saveResult.success) {
                        console.error('Error saving password:', newPassword.site, saveResult.message);
                    }
                }

                showToast(`Imported ${result.imported} entries`, 'success');

                // Update display
                const searchTerm = document.getElementById('passwords-search').value;
                await loadPasswords(searchTerm);

                // Show errors if any
                if (result.errors && result.errors.length > 0) {
                    showToast(`Some lines not recognized: ${result.errors.slice(0, 3).join(', ')}...`, 'warning');
                }
            } else {
                const errorMsg = result.errors?.join(', ') || 'Import error';
                showToast(`${errorMsg}`, 'error');
            }
        } catch (error) {
            console.error('Error importing from txt:', error);
            showToast('Error importing from txt', 'error');
        }
    };

    input.click();
}

// =============== PASSWORD AUTOFILL ================

/**
 * Autofill password on the active tab
 * @param {string} passwordId - Password ID
 */
async function autofillPassword(passwordId) {
    try {
        const password = passwordsList.find(p => p.id === passwordId);
        if (!password) {
            showToast('Password not found', 'error');
            return;
        }

        // Call IPC handler for autofill
        const result = await window.electronAPI.autofillPassword(passwordId);

        if (result.success) {
            const message = result.message || `✓ Fields filled: ${result.filled || 0}`;
            showToast(message, 'success');

            // Update last used time
            const searchTerm = document.getElementById('passwords-search').value;
            await loadPasswords(searchTerm);
        } else {
            showToast(`✗ ${result.error || 'Autofill error'}`, 'error');

            // If domain error, show hint
            if (result.error && result.error.includes('Domain')) {
                setTimeout(() => {
                    showToast('• Open the site in the active tab and try again', 'info');
                }, 1500);
            }
        }
    } catch (error) {
        console.error('Error autofilling:', error);
        showToast('Autofill error', 'error');
    }
}

/**
 * Show popup with matching passwords for current URL
 */
async function showAutofillPopup(matchingPasswords) {
    // Remove existing popup if any
    const existingPopup = document.getElementById('autofill-popup');
    if (existingPopup) {
        existingPopup.remove();
    }

    if (!matchingPasswords || matchingPasswords.length === 0) {
        showToast('No matching passwords for this site', 'warning');
        return;
    }

    // Create popup
    const popup = document.createElement('div');
    popup.id = 'autofill-popup';
    popup.className = 'autofill-popup';
    popup.innerHTML = `
        <div class="autofill-popup-content">
            <h3>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 8px;">
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
                </svg>
                Select a password to autofill
            </h3>
            <div class="autofill-password-list">
                ${matchingPasswords.map(p => `
                    <div class="autofill-password-item" data-id="${p.id}">
                        <div class="autofill-site">${escapeHtml(p.site)}</div>
                        <div class="autofill-username">${escapeHtml(p.username)}</div>
                        ${p.favorite ? '<span class="autofill-favorite">★</span>' : ''}
                    </div>
                `).join('')}
            </div>
            <button class="autofill-close-btn">Cancel</button>
        </div>
    `;

    document.body.appendChild(popup);

    // Handlers
    popup.querySelectorAll('.autofill-password-item').forEach(item => {
        item.addEventListener('click', async () => {
            const passwordId = item.dataset.id;
            popup.remove();
            await autofillPassword(passwordId);
        });
    });

    popup.querySelector('.autofill-close-btn').addEventListener('click', () => {
        popup.remove();
    });

    // Close on click outside popup
    popup.addEventListener('click', (e) => {
        if (e.target === popup) {
            popup.remove();
        }
    });
}

/**
 * Initialize keyboard shortcuts for autofill
 */
function initAutofillShortcuts() {
    document.addEventListener('keydown', async (e) => {
        // Ctrl/Cmd + Shift + F for autofill
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
            e.preventDefault();

            // Get matching passwords for current URL
            try {
                const result = await window.electronAPI.getMatchingPasswords(window.location.href);

                if (result.success && result.passwords && result.passwords.length > 0) {
                    // If one password, autofill right away
                    if (result.passwords.length === 1) {
                        await autofillPassword(result.passwords[0].id);
                    } else {
                        // Otherwise show popup
                        showAutofillPopup(result.passwords);
                    }
                } else {
                    showToast('No matching passwords for this site', 'warning');
                }
            } catch (error) {
                console.error('Error getting passwords:', error);
                showToast('Autofill error', 'error');
            }
        }
    });

    console.log('Keyboard shortcuts for autofill initialized (Ctrl/Cmd + Shift + F)');
}



        // Initialise password manager + autofill shortcuts on load.
        initPasswordManager();
        initAutofillShortcuts();

        // Open the passwords section directly when the page is launched
        // Deep-link: opening Library.html#bookmarks (or #history, #downloads,
        // #cookies, #passwords) auto-switches to that section. Used by the
        // hamburger menu and Quick Commands.
        (function() {
            var hash = (location.hash || "").replace("#", "");
            if (hash && ['history','downloads','bookmarks','cookies','passwords'].indexOf(hash) !== -1) {
                var link = document.querySelector('nav a[data-section="' + hash + '"]');
                if (link) link.click();
            }
        })();

        loadHistory();

// --- Delegated listeners (converted from inline on* handlers, CSP: no 'unsafe-inline') ---
// One capture-phase listener replaces every removed <img onerror="this.style.display='none'">.
document.addEventListener('error', function (e) {
    if (e.target && e.target.tagName === 'IMG') e.target.style.display = 'none';
}, true);

// Dispatcher for buttons converted from inline onclick to data-action attributes.
document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action="copy-totp"], [data-action="edit-password-analysis"]');
    if (!btn) return;
    var action = btn.dataset.action;
    var id = btn.dataset.id;
    if (action === 'copy-totp' && id) {
        copyTOTPCode(id);
    } else if (action === 'edit-password-analysis' && id) {
        if (window.editPasswordFromAnalysis) window.editPasswordFromAnalysis(id);
    }
});
