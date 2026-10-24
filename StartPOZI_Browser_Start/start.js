document.addEventListener('DOMContentLoaded', function(){
  "use strict";
  var screens = ["screen-intro","screen-welcome","screen-language","screen-protection","screen-appearance","screen-levels","screen-setup","screen-default","screen-donate"];
  var current = 0;

  var pendingSettings = {
    theme: null,
    opacity: null,
    searchEngine: null,
    language: null,
    protectionLevel: null,
    blockTrackers: null, blockSocialWidgets: null, blockAds: null,
    restoreTabs: null
  };

  function goTo(id){
    var idx = screens.indexOf(id);
    if(idx<0) return;
    var prevEl = document.getElementById(screens[current]);
    var nextEl = document.getElementById(id);
    if(!prevEl||!nextEl) return;
    prevEl.classList.remove("active");
    if(idx>current){prevEl.classList.add("prev")}
    else{prevEl.classList.remove("prev")}
    void nextEl.offsetWidth;
    nextEl.classList.add("active");
    nextEl.classList.remove("prev");
    current = idx;
    window.scrollTo(0,0);
  }

  var gotoBtns = document.querySelectorAll("[data-goto]");
  for(var i=0;i<gotoBtns.length;i++){
    (function(b){
      b.addEventListener("click",function(){goTo(b.getAttribute("data-goto"))});
    })(gotoBtns[i]);
  }

  /* ИНТРО */
  (function(){
    var intro = document.getElementById("screen-intro");
    var bar = document.getElementById("intro-progress");
    if(!intro||!bar) { goTo("screen-welcome"); return; }
    setTimeout(function(){intro.classList.add("show-tag")},600);
    var DURATION = 5200, t0 = Date.now(), raf;
    function tick(){
      var p = Math.min(1,(Date.now()-t0)/DURATION);
      bar.style.width = (p*100)+"%";
      if(p<1){raf=requestAnimationFrame(tick)}
      else{goTo("screen-welcome")}
    }
    raf=requestAnimationFrame(tick);
    var skipBtn = document.getElementById("intro-skip");
    if(skipBtn) skipBtn.addEventListener("click",function(){
      cancelAnimationFrame(raf);goTo("screen-welcome");
    });
  })();

  /* ТЕМА */
  function applyTheme(t){
    document.body.classList.remove("theme-auto","theme-light","theme-dark");
    document.body.classList.add("theme-"+t);
    pendingSettings.theme = t;
    // Apply to the browser chrome immediately (live preview).
    var api0 = window.electronAPI;
    if(api0 && api0.setTheme) { try { api0.setTheme(t); } catch(e) {} }
  }
  var themeCards = document.querySelectorAll(".theme-card");
  for(var ti=0;ti<themeCards.length;ti++){
    (function(c){
      c.addEventListener("click",function(){
        for(var x=0;x<themeCards.length;x++) themeCards[x].classList.remove("sel");
        c.classList.add("sel");
        applyTheme(c.getAttribute("data-theme"));
      });
    })(themeCards[ti]);
  }

  /* ПРОЗРАЧНОСТЬ — только нативная (окно), не CSS на UI страницы */
  var opSlider = document.getElementById("opacity-slider");
  var opVal = document.getElementById("opacity-val");
  var opDebounce;
  if(opSlider) opSlider.addEventListener("input",function(){
    var v = opSlider.value;
    opVal.textContent = v+"%";
    pendingSettings.opacity = v/100;
    // Live preview: set the native browser window opacity (NOT the CSS on
    // this page — the setup UI stays fully readable while dragging).
    clearTimeout(opDebounce);
    opDebounce = setTimeout(function(){
      var api0 = window.electronAPI;
      if(api0 && api0.setWindowOpacity) {
        api0.setWindowOpacity(v/100).catch(function(){});
      }
    }, 60);
  });

  /* ПОИСКОВИК */
  var engineCards = document.querySelectorAll(".engine-card");
  for(var ei=0;ei<engineCards.length;ei++){
    (function(c){
      c.addEventListener("click",function(){
        for(var x=0;x<engineCards.length;x++) engineCards[x].classList.remove("sel");
        c.classList.add("sel");
        pendingSettings.searchEngine = c.getAttribute("data-engine");
        // Live: set the browser's search engine right away.
        var api0 = window.electronAPI;
        if(api0 && api0.setSearchEngine) { try { api0.setSearchEngine(pendingSettings.searchEngine); } catch(e) {} }
      });
    })(engineCards[ei]);
  }

  // Restore the saved search engine selection
  var apiRestore = window.electronAPI;
  if(apiRestore && apiRestore.getSearchEngine){
    apiRestore.getSearchEngine().then(function(url){
      if(!url) return;
      for(var x=0;x<engineCards.length;x++){
        if(engineCards[x].getAttribute("data-engine")===url){
          for(var y=0;y<engineCards.length;y++) engineCards[y].classList.remove("sel");
          engineCards[x].classList.add("sel");
          pendingSettings.searchEngine = url;
          break;
        }
      }
    }).catch(function(){});
  }

  /* ЯЗЫК */
  var langCards = document.querySelectorAll(".lang-card");
  for(var li=0;li<langCards.length;li++){
    (function(c){
      c.addEventListener("click",function(){
        for(var x=0;x<langCards.length;x++) langCards[x].classList.remove("sel");
        c.classList.add("sel");
        var lang = c.getAttribute("data-lang");
        pendingSettings.language = lang;
        // Live: switch the browser language right away (i18n translates
        // this page too, so the wizard flips languages instantly).
        var api0 = window.electronAPI;
        if(api0 && api0.setLanguage) { try { api0.setLanguage(lang); } catch(e) {} }
        if(window.i18n && window.i18n.setLanguage) { try { window.i18n.setLanguage(lang); } catch(e) {} }
      });
    })(langCards[li]);
  }
  // Preselect the current browser language.
  var apiLang = window.electronAPI;
  if(apiLang && apiLang.getLanguage){
    apiLang.getLanguage().then(function(l){
      if(!l) return;
      for(var x=0;x<langCards.length;x++){
        langCards[x].classList.toggle("sel", langCards[x].getAttribute("data-lang")===l);
      }
      pendingSettings.language = l;
    }).catch(function(){});
  } else if(window.i18n && window.i18n.getLanguage){
    var cl = window.i18n.getLanguage();
    if(cl){ pendingSettings.language = cl;
      for(var x2=0;x2<langCards.length;x2++){
        langCards[x2].classList.toggle("sel", langCards[x2].getAttribute("data-lang")===cl);
      }
    }
  }

  /* УРОВЕНЬ ЗАЩИТЫ (списки фильтров) */
  var levelCards = document.querySelectorAll(".level-card");
  for(var lv=0;lv<levelCards.length;lv++){
    (function(c){
      c.addEventListener("click",function(){
        for(var x=0;x<levelCards.length;x++) levelCards[x].classList.remove("sel");
        c.classList.add("sel");
        var level = c.getAttribute("data-level");
        pendingSettings.protectionLevel = level;
        // Live: apply the FilterHub preset immediately (light/medium/full —
        // the same three levels as Settings → Blocker).
        var api0 = window.electronAPI;
        if(api0 && api0.setFilterhubPreset) { try { api0.setFilterhubPreset(level); } catch(e) {} }
      });
    })(levelCards[lv]);
  }

  /* ЭКРАН ДЕЙСТВИЙ */
  var wantImportAfter = false;
  var importBtn = document.getElementById("act-import");
  if(importBtn) importBtn.addEventListener("click",function(){
    wantImportAfter = !wantImportAfter;
    importBtn.classList.toggle("queued", wantImportAfter);
    toast(wantImportAfter
      ? "Import will open right after setup."
      : "Import cancelled.");
  });

  /* БРАУЗЕР ПО УМОЛЧАНИЮ */
  (function(){
    var btn = document.getElementById("btn-set-default");
    var statusEl = document.getElementById("def-status");
    var apiDef = window.electronAPI;
    function refresh(){
      if(!apiDef || !apiDef.checkDefaultBrowser) return;
      apiDef.checkDefaultBrowser().then(function(r){
        if(!statusEl) return;
        if(r && r.isDefault){
          statusEl.textContent = "StartPOZI is already your default browser.";
          if(btn) btn.style.display = "none";
        } else {
          statusEl.textContent = "StartPOZI is not your default browser yet.";
        }
      }).catch(function(){});
    }
    if(btn){
      btn.addEventListener("click", function(){
        if(!apiDef || !apiDef.setDefaultBrowser) return;
        btn.disabled = true;
        if(statusEl) statusEl.textContent = "Applying…";
        apiDef.setDefaultBrowser().then(function(r){
          btn.disabled = false;
          if(statusEl) statusEl.textContent = (r && r.note) ? r.note : "Done.";
          if(r && r.isDefault && btn) btn.style.display = "none";
        }).catch(function(){
          btn.disabled = false;
          if(statusEl) statusEl.textContent = "Could not change the default browser.";
        });
      });
    }
    refresh();
  })();

  /* ЗАВЕРШЕНИЕ */
  setTimeout(function(){
    var sl=document.getElementById("skip-link");
    if(sl) sl.classList.add("show");
  },6000);

  function finishSetup(){
    var btn = document.getElementById("skip-link") || document.getElementById("donate-btn");
    if(btn) btn.disabled = true;

    var trackersEl = document.getElementById("opt-trackers");
    var widgetsEl = document.getElementById("opt-widgets");
    var adsEl = document.getElementById("opt-ads");
    var restoreEl = document.getElementById("opt-restore");

    var blockTrackers = trackersEl ? trackersEl.checked : true;
    var blockWidgets = widgetsEl ? widgetsEl.checked : true;
    var blockAds = adsEl ? adsEl.checked : true;
    pendingSettings.blockTrackers = blockTrackers;
    pendingSettings.blockSocialWidgets = blockWidgets;
    pendingSettings.blockAds = blockAds;
    pendingSettings.restoreTabs = restoreEl ? restoreEl.checked : true;

    var api = window.electronAPI;
    if(api && api.completeSetup){
      // Apply the FilterHub preset: the level chosen on the "Protection
      // level" screen wins; the legacy fallback (any toggle on → medium)
      // only applies when no level was picked.
      var anyProtection = blockTrackers || blockWidgets || blockAds;
      var level = pendingSettings.protectionLevel || (anyProtection ? 'medium' : 'light');
      var presetPromise;
      if (api.setFilterhubPreset) {
        presetPromise = api.setFilterhubPreset(level);
      } else {
        presetPromise = Promise.resolve({ success: true });
      }
      if (api.adblockerToggle) {
        api.adblockerToggle(anyProtection);
      }
      // Persist the chosen language (complete-setup saves it in settings).
      if (pendingSettings.language) {
        pendingSettings.lang = pendingSettings.language;
      }

      presetPromise.then(function(){
        return api.completeSetup(pendingSettings);
      }).then(function(){
        toast("Setup complete!");
        if (wantImportAfter && api.openUrlFromSettings) {
          try { api.openUrlFromSettings('Library.html#bookmarks'); } catch(e) {}
        }
        setTimeout(function(){
          window.location.href = '../MainPage/index.html';
        }, 800);
      }).catch(function(){ toast("Failed to save settings"); });
    } else {
      try{localStorage.setItem("sp-setup-done","1")}catch(e){}
      window.location.href = '../MainPage/index.html';
    }
  }

  var skipLink = document.getElementById("skip-link");
  if(skipLink) skipLink.addEventListener("click", finishSetup);
  var donateBtn = document.getElementById("donate-btn");
  if(donateBtn) donateBtn.addEventListener("click", function(e){
    e.preventDefault();
    finishSetup();
    setTimeout(function(){ window.open('https://startpozi.com/s/donate.html','_blank'); }, 1000);
  });

  /* ТОСТ */
  var toastTimer;
  function toast(msg){
    var t=document.getElementById("toast");
    if(!t) return;
    t.textContent=msg;t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer=setTimeout(function(){t.classList.remove("show")},3000);
  }

  /* ВОССТАНОВЛЕНИЕ */
  var api = window.electronAPI;
  if(api){
    if(api.getTheme){
      api.getTheme().then(function(t){
        if(t){
          pendingSettings.theme = t;
          var cards = document.querySelectorAll(".theme-card");
          for(var x=0;x<cards.length;x++) cards[x].classList.toggle("sel",cards[x].getAttribute("data-theme")===t);
          applyTheme(t);
        }
      }).catch(function(){});
    }
    if(api.getWindowOpacity){
      api.getWindowOpacity().then(function(op){
        if(op!==undefined && op!==null && op<1){
          if(opSlider) opSlider.value=Math.round(op*100);
          if(opVal) opVal.textContent=Math.round(op*100)+"%";
          pendingSettings.opacity = op;
        }
      }).catch(function(){});
    }
  }
});
