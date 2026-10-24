(function(){
  var input = document.getElementById('searchInput');
  input.focus();

  // Respect the search engine configured in Settings (falls back to the
  // browser default instead of a hardcoded Google).
  var searchBase = null;
  if (window.electronAPI && window.electronAPI.getSearchEngine) {
    window.electronAPI.getSearchEngine().then(function(engine) {
      if (engine && typeof engine === 'string' && engine.indexOf('http') === 0) searchBase = engine;
    }).catch(function() {});
  }

  function navigate(raw) {
    raw = (raw || '').trim();
    if (!raw) return;
    var isUrl = /^https?:\/\//i.test(raw) ||
                (/^[\w-]+(\.[\w-]+)+/.test(raw) && raw.indexOf(' ') === -1);
    var url;
    if (isUrl) {
      url = raw.match(/^https?:\/\//i) ? raw : 'https://' + raw;
    } else if (searchBase) {
      url = searchBase + encodeURIComponent(raw);
    } else {
      url = 'https://startpozi.com/search.html?q=' + encodeURIComponent(raw);
    }
    if (window.electronAPI && window.electronAPI.openInCurrentTab) {
      window.electronAPI.openInCurrentTab(url);
    } else {
      location.href = url;
    }
  }

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      navigate(input.value);
    }
  });
})();
