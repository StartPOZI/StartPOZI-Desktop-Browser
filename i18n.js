/*
 * StartPOZI Browser — i18n runtime (shared by shell and internal pages).
 * English is the source language in the markup/code. When the active language
 * is Russian, the DOM is translated live using locales/ru.json (EN->RU map),
 * and a RU->EN map is derived so toggling back to English also works live.
 *
 * Exposes window.i18n = { t, apply, setLanguage, getLanguage, ready }.
 * Relies on electronAPI (preload) — gracefully no-ops if unavailable.
 */
(function () {
  'use strict';

  if (window.i18n) return; // already loaded

  var lang = 'en';
  var byEn = null; // EN -> RU  (foreign map when lang === 'ru')
  var byRu = null; // RU -> EN  (revert map when lang === 'en')
  var ready = false;
  var applying = false;

  var hasAPI = !!(window.electronAPI && window.electronAPI.getLanguage && window.electronAPI.getLocale);
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

  function buildRuReverse() {
    byRu = {};
    if (!byEn) return;
    var keys = Object.keys(byEn);
    for (var i = 0; i < keys.length; i++) {
      var en = keys[i], ru = byEn[en];
      if (ru && !byRu[ru]) byRu[ru] = en;
    }
  }

  function lookup(trimmed) {
    if (lang === 'ru') return byEn ? byEn[trimmed] : undefined;
    if (lang === 'en') return byRu ? byRu[trimmed] : undefined;
    return undefined;
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
    if (lang === 'en' && (!byRu || !Object.keys(byRu).length)) {
      // nothing to revert — source is already English
      return;
    }
    if (lang === 'ru' && (!byEn || !Object.keys(byEn).length)) return;
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
      if (lang === 'en' && (!byRu || !Object.keys(byRu).length)) return;
      if (lang === 'ru' && (!byEn || !Object.keys(byEn).length)) return;
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

  function loadAndApply() {
    if (!hasAPI) { ready = true; return; }
    window.electronAPI.getLanguage().then(function (l) {
      lang = (l === 'ru') ? 'ru' : 'en';
      var need = lang === 'ru';
      if (need && byEn) { applyI18n(document.body); startObserver(); ready = true; return; }
      if (!need && byRu && Object.keys(byRu).length) { applyI18n(document.body); ready = true; return; }
      if (!need) { ready = true; return; }
      window.electronAPI.getLocale('ru').then(function (dict) {
        byEn = dict || {};
        buildRuReverse();
        applyI18n(document.body);
        startObserver();
        ready = true;
      }).catch(function () { ready = true; });
    }).catch(function () { ready = true; });
  }

  function setLanguage(l) {
    lang = (l === 'ru') ? 'ru' : 'en';
    if (lang === 'ru' && (!byEn || !Object.keys(byEn).length) && hasAPI) {
      window.electronAPI.getLocale('ru').then(function (dict) {
        byEn = dict || {};
        buildRuReverse();
        applyI18n(document.body);
        startObserver();
      }).catch(function(){});
    } else {
      applyI18n(document.body);
      startObserver();
    }
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
