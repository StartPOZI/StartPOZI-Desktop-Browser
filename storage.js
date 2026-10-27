// Central settings storage: in-memory cache + atomic disk writes.
//
// Previously every IPC handler did fs.readFileSync + JSON.parse of the whole
// settings.json (220+ call sites) and wrote it back read-modify-write style.
// Now the file is parsed ONCE; reads are instant object lookups, writes stay
// atomic (tmp + rename) and mutations can go through update(fn), which is
// race-free (read → mutate → write in one synchronous block).
//
// main.js keeps its readStorage()/writeStorage() wrappers (zero call-site
// churn); adblocker.js also routes through this module so the cache can never
// go stale behind its back.
const fs = require('fs');
const path = require('path');

var _electronApp = null;
try { _electronApp = require('electron').app; } catch (e) {}

var _cache = null;
var _mtime = 0;

function _statMtime(p) {
  try { return fs.statSync(p).mtimeMs || 0; } catch (e) { return 0; }
}

function storagePath() {
  return path.join(_electronApp.getPath('userData'), 'settings.json');
}

function load() {
  if (_cache !== null) return _cache;
  try {
    var p = storagePath();
    if (fs.existsSync(p)) {
      _cache = JSON.parse(fs.readFileSync(p, 'utf-8'));
      _mtime = _statMtime(p);
    }
  } catch (e) {}
  if (!_cache || typeof _cache !== 'object') _cache = {};
  return _cache;
}

// Force re-read from disk on the next access (used after userData relocation
// at startup, before the cache has ever been touched).
function reload() {
  _cache = null;
  return load();
}

function read() {
  // External edits (backup restore, sync tool, hand edit): revalidate by
  // mtime so the cache does not clobber the file with stale data.
  try {
    var p = storagePath();
    var m = _statMtime(p);
    if (m && _mtime && m > _mtime) {
      _cache = null;
      _mtime = 0;
    }
  } catch (e) {}
  // Return a shallow clone: callers mutate the result and pass it to write()
  // (legacy read-modify-write pattern); cloning protects the live cache from
  // half-finished mutations if a handler throws before writing.
  var src = load();
  try {
    return JSON.parse(JSON.stringify(src));
  } catch (e) {
    return src;
  }
}

function _bloatGuard(data) {
  // settings.json must stay small: a multi-MB file makes the browser sluggish
  // (it is still serialized on every write). Hard-cap the worst offenders.
  try {
    // 1) blockedLog — limit to 2000 entries. (Was 200 while the adblocker
    // writes up to 5000: storage silently truncated the persisted log on
    // every write — the "keep block log" option lost all but 200 rows.)
    if (Array.isArray(data.blockedLog) && data.blockedLog.length > 2000) {
      data.blockedLog = data.blockedLog.slice(-2000);
    }
    // 2) Base64 background images can balloon to 250KB each and are often
    //    stored 2-3 times (customization + mainPage). De-duplicate identical
    //    strings.
    var cust = (data.customization && typeof data.customization === 'object') ? data.customization : null;
    var mp = (data.mainPage && typeof data.mainPage === 'object') ? data.mainPage : null;
    var cbi = cust ? cust.customBackgroundImage : '';
    if (cbi && typeof cbi === 'string' && cbi.length > 5000) {
      if (cust && cust.mainPageBackground === cbi) delete cust.mainPageBackground;
      if (mp && mp.startpozi_background === cbi) delete mp.startpozi_background;
    } else if (cust && mp && cust.mainPageBackground && cust.mainPageBackground === mp.startpozi_background) {
      delete mp.startpozi_background;
    }
    function capStr(parent, key) {
      if (parent && typeof parent === 'object' && typeof parent[key] === 'string' && parent[key].length > 100000) {
        parent[key] = parent[key].slice(0, 100000);
      }
    }
    capStr(cust, 'customBackgroundImage');
    capStr(cust, 'mainPageBackground');
    capStr(mp, 'startpozi_background');
    // 3) Last-resort sanity cap — see _serialize(): it used to live here but
    // cost a SECOND full JSON.stringify on EVERY write; now only genuinely
    // oversized documents pay for the re-serialization.
  } catch (_) {}
}

function _serialize(data) {
  var json = JSON.stringify(data, null, 2);
  // Last-resort sanity cap moved here from _bloatGuard: checking the length
  // of the already-serialized document is free; only the rare oversized file
  // re-serializes after trimming.
  try {
    if (json.length > 1500000) {
      data.blockedLog = (data.blockedLog || []).slice(-50);
      json = JSON.stringify(data, null, 2);
    }
  } catch (_) {}
  return json;
}

function write(data) {
  try {
    if (!data || typeof data !== 'object') return;
    _bloatGuard(data);
    // Serialize FIRST: if it throws (circular/BigInt smuggled via update()),
    // the cache must not end up holding an unsaved state while every later
    // write silently no-ops.
    var p = storagePath();
    var json = _serialize(data);
    _cache = data;
    _dirty = false;
    // Atomic write (tmp + rename): a crash or power loss mid-write can no
    // longer corrupt settings.json — the rename replaces the file in one
    // step, readers always see either the old or the new complete file.
    try {
      var tmpPath = p + '.tmp';
      fs.writeFileSync(tmpPath, json, 'utf-8');
      fs.renameSync(tmpPath, p);
      _mtime = _statMtime(p);
      return;
    } catch (eAtomic) {
      fs.writeFileSync(p, json, 'utf-8');
      _mtime = _statMtime(p);
    }
  } catch (e) {}
}

// ---- Coalesced writes -----------------------------------------------------
// Page navigations used to trigger 4+ IMMEDIATE full serializations + sync
// disk writes of settings.json (history, frequent sites, session tabs ×2).
// While the main process is busy serializing it cannot answer webRequest
// callbacks (ad blocker) or sendSync preloads — every page load stalled the
// whole browser. Hot-path callers now update the in-memory cache instantly
// and the disk write is coalesced into one per quiet window.
var WRITE_SOON_DELAY_MS = 400;
var _dirty = false;
var _writeTimer = null;

function _scheduleDiskWrite() {
  _dirty = true;
  if (_writeTimer) return;
  _writeTimer = setTimeout(function () {
    _writeTimer = null;
    if (!_dirty) return;
    _dirty = false;
    write(_cache);
  }, WRITE_SOON_DELAY_MS);
  // Must not keep a bare node process (unit tests) alive until the timer
  // fires; Electron's main loop still delivers it.
  if (typeof _writeTimer.unref === 'function') _writeTimer.unref();
}

// Cache updated immediately (subsequent read()s see the new data), disk
// write coalesced. Durability loss on a crash is bounded by the delay —
// acceptable for history/session counters that already tolerated multi-
// second debounce windows.
function writeSoon(data) {
  if (!data || typeof data !== 'object') return;
  _cache = data;
  _scheduleDiskWrite();
}

// Race-free debounced variant of update(): fn mutates the LIVE cache (no
// clone, no full-file serialization on the caller's thread of logic).
function updateSoon(fn) {
  try {
    var store = load();
    if (typeof fn === 'function') fn(store);
    _scheduleDiskWrite();
    return store;
  } catch (e) {
    return load();
  }
}

// Force any pending coalesced write to disk NOW (app quit, before a
// potentially fatal native operation, tests).
function flush() {
  if (_writeTimer) {
    clearTimeout(_writeTimer);
    _writeTimer = null;
  }
  if (_dirty) {
    _dirty = false;
    try { write(_cache); } catch (e) {}
  }
}

// The live cache WITHOUT cloning — for hot read-only handlers (per-load
// sendSync preloads). Callers MUST NOT mutate the returned object; use
// read()/update()/updateSoon() for anything that writes.
function peek() {
  return load();
}

// Race-free mutation: fn(store) mutates the live object; the result is
// written atomically. Because Node is single-threaded, no other handler can
// interleave between the read and the write.
function update(fn) {
  try {
    var store = load();
    if (typeof fn === 'function') fn(store);
    write(store);
    return store;
  } catch (e) {
    return load();
  }
}

module.exports = { load, reload, read, write, writeSoon, update, updateSoon, peek, flush, storagePath };
