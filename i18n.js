/*
 * StartPOZI Browser — i18n runtime (shared by shell and internal pages).
 * English is the source language in the markup/code. Any other language is a
 * locales/<code>.json file (an EN -> X string map) auto-detected by the main
 * process; partial dictionaries are fine — misses simply stay English.
 *
 * Switching languages works live in both directions: the reverse (X -> EN)
 * map is derived from the dictionary, so toggling back to English (or over
 * to a third language) reverts the DOM to the English source first.
 *
 * Exposes window.i18n = { t, apply, setLanguage, getLanguage, ready }.
 * Relies on electronAPI (preload) — gracefully no-ops if unavailable.
 */
(function () {
  'use strict';

  if (window.i18n) return; // already loaded

  var lang = 'en';
  var loadedLang = null;  // which language `byEn` translates to
  var byEn = null;        // EN -> X (active foreign map)
  var byX = null;         // X -> EN (revert map for loadedLang)
  var ready = false;
  var applying = false;

  var hasAPI = !!(window.electronAPI && window.electronAPI.getLanguage && window.electronAPI.getLocale);
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

  function buildReverse() {
    byX = {};
    if (!byEn) return;
    var keys = Object.keys(byEn);
    for (var i = 0; i < keys.length; i++) {
      var en = keys[i], x = byEn[en];
      // First mapping wins on collisions (a later X string must not
      // steal the revert entry of an earlier one). `=== undefined` also
      // keeps out falsy-but-defined values.
      if (x && byX[x] === undefined) byX[x] = en;
    }
  }

  function mapsEmpty() {
    return !byX || !Object.keys(byX).length;
  }

  function lookup(trimmed) {
    if (lang === 'en') return byX ? byX[trimmed] : undefined;
    return byEn ? byEn[trimmed] : undefined;
  }

  function translateText(node) {
    if (!node) return;
    var v = node.nodeValue;
    if (!v) return;
    var trimmed = v.trim();
    if (!trimmed || trimmed.length > 400) return;
    var rep = lookup(trimmed);
    if (rep && rep !== trimmed) {
      var lead = v.match(/^\s*/)[0];
      var trail = v.match(/\s*$/)[0];
      node.nodeValue = lead + rep + trail;
    }
  }

  function translateEl(el) {
    if (!el || el.nodeType !== 1) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (el.hasAttribute && el.hasAttribute(a)) {
        var val = el.getAttribute(a);
        if (val && val.length <= 400) {
          var rep = lookup(val);
          if (rep && rep !== val) el.setAttribute(a, rep);
        }
      }
    }
  }

  function walk(root) {
    if (!root) return;
    if (lang === 'en' && mapsEmpty()) {
      // nothing to revert — source is already English
      return;
    }
    if (lang !== 'en' && (!byEn || !Object.keys(byEn).length)) return;
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    while (tw.nextNode()) nodes.push(tw.currentNode);
    for (var i = 0; i < nodes.length; i++) translateText(nodes[i]);
    var withAttr = root.querySelectorAll
      ? root.querySelectorAll('[placeholder], [title], [aria-label], [alt]')
      : [];
    // (selectors target elements carrying translatable attributes)
    for (var j = 0; j < withAttr.length; j++) translateEl(withAttr[j]);
  }

  function applyI18n(root) {
    if (applying) return;
    applying = true;
    try { walk(root || document.body); } finally { applying = false; }
  }

  function t(s) {
    if (s == null) return s;
    if (lang === 'en') return s;
    var rep = byEn ? byEn[s] : undefined;
    return rep ? rep : s;
  }

  // ---- MutationObserver: translate dynamically inserted/changed content ----
  var observer = null;
  function startObserver() {
    if (observer || !('MutationObserver' in window) || !document.body) return;
    observer = new MutationObserver(function (muts) {
      if (lang === 'en' && mapsEmpty()) return;
      if (lang !== 'en' && (!byEn || !Object.keys(byEn).length)) return;
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === 'characterData' && m.target) { translateText(m.target); continue; }
        if (m.type === 'attributes' && m.target && m.target.nodeType === 1) { translateEl(m.target); continue; }
        if (m.addedNodes && m.addedNodes.length) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType === 1) { translateEl(n); walk(n); }
            else if (n.nodeType === 3) translateText(n);
          }
        }
      }
    });
    observer.observe(document.body, {
      childList: true, subtree: true,
      characterData: true,
      attributes: true, attributeFilter: ATTRS
    });
  }

  function stopObserver() { if (observer) { try { observer.disconnect(); } catch(e){} observer = null; } }

  // Monotonic request id: bumps on every setLanguage() so a dictionary
  // that finishes loading for an ALREADY-SUPERSEDED language is dropped.
  var langRequestId = 0;

  function loadAndApply() {
    if (!hasAPI) { ready = true; return; }
    window.electronAPI.getLanguage().then(function (l) {
      setLanguage(l || 'en');
      ready = true;
    }).catch(function () { ready = true; });
  }

  function setLanguage(l) {
    var next = (!l || l === 'en') ? 'en' : String(l);
    var prev = lang;
    var req = ++langRequestId; // invalidate any in-flight dictionary loads
    // Moving away from a translated state: revert the DOM to the English
    // source first (works for EN and for hopping to a third language).
    if (prev !== 'en' && prev !== next && !mapsEmpty()) {
      lang = 'en';
      applyI18n(document.body);
    }
    lang = next;
    if (lang === 'en') {
      if (!mapsEmpty()) applyI18n(document.body);
      // The observer may have been stopped by an aborted load below —
      // keep reverting dynamically added content to English.
      startObserver();
      return;
    }
    if (loadedLang === lang && byEn && Object.keys(byEn).length) {
      applyI18n(document.body);
      startObserver();
      return;
    }
    if (!hasAPI) return;
    // While the new dictionary is being fetched the observer would keep
    // translating DOM mutations with the PREVIOUS language's maps — stop
    // it and restart only after the fresh dictionary has been applied.
    stopObserver();
    window.electronAPI.getLocale(lang).then(function (dict) {
      // A newer setLanguage() superseded this load: drop the result.
      if (req !== langRequestId) return;
      byEn = dict || {};
      loadedLang = lang;
      buildReverse();
      applyI18n(document.body);
      startObserver();
    }).catch(function () {
      if (req !== langRequestId) return;
      // Load failed: the DOM was already reverted to the English source —
      // drop the stale maps so neither the observer nor apply() keeps
      // translating with the previous language, then resume observing.
      byEn = null;
      byX = null;
      loadedLang = null;
      startObserver();
    });
  }

  if (hasAPI && window.electronAPI.onLanguageChanged) {
    window.electronAPI.onLanguageChanged(function (l) { setLanguage(l); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAndApply);
  } else {
    loadAndApply();
  }

  window.i18n = {
    t: t,
    apply: applyI18n,
    setLanguage: setLanguage,
    getLanguage: function () { return lang; },
    isReady: function () { return ready; }
  };
})();
