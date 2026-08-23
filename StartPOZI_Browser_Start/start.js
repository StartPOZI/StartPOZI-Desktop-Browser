document.addEventListener('DOMContentLoaded', function(){
  "use strict";
  var screens = ["screen-intro","screen-welcome","screen-protection","screen-appearance","screen-setup","screen-donate"];
  var current = 0;

  var pendingSettings = {
    theme: null,
    opacity: null,
    accent: null, accentRgb: null, accentLight: null,
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

  /* ПРОЗРАЧНОСТЬ */
  var opSlider = document.getElementById("opacity-slider");
  var opVal = document.getElementById("opacity-val");
  if(opSlider) opSlider.addEventListener("input",function(){
    var v = opSlider.value;
    document.documentElement.style.setProperty("--win-opacity", v/100);
    opVal.textContent = v+"%";
    pendingSettings.opacity = v/100;
  });

  /* АКЦЕНТ */
  var swatches = document.querySelectorAll(".swatch");
  for(var si=0;si<swatches.length;si++){
    (function(s){
      s.addEventListener("click",function(){
        for(var x=0;x<swatches.length;x++) swatches[x].classList.remove("sel");
        s.classList.add("sel");
        var c=s.getAttribute("data-color"), r=s.getAttribute("data-rgb"), l=s.getAttribute("data-light");
        document.documentElement.style.setProperty("--accent",c);
        document.documentElement.style.setProperty("--accent-rgb",r);
        document.documentElement.style.setProperty("--accent-light",l);
        pendingSettings.accent=c; pendingSettings.accentRgb=r; pendingSettings.accentLight=l;
      });
    })(swatches[si]);
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

    pendingSettings.blockTrackers = trackersEl ? trackersEl.checked : true;
    pendingSettings.blockSocialWidgets = widgetsEl ? widgetsEl.checked : true;
    pendingSettings.blockAds = adsEl ? adsEl.checked : true;
    pendingSettings.restoreTabs = restoreEl ? restoreEl.checked : true;

    var api = window.electronAPI;
    if(api && api.completeSetup){
      api.completeSetup(pendingSettings).then(function(){
        toast("Setup complete!");
        // Open the Library import section if the user queued an import on the
        // actions screen (bookmarks import lives in Library → Bookmarks).
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
          document.documentElement.style.setProperty("--win-opacity",op);
          pendingSettings.opacity = op;
        }
      }).catch(function(){});
    }
  }
});
