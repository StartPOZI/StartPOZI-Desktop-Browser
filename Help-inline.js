(function () {
  var ru = document.getElementById('langRu');
  var en = document.getElementById('langEn');
  function apply(lang) {
    var isRu = lang === 'ru';
    ru.classList.toggle('active', isRu);
    en.classList.toggle('active', !isRu);
    document.documentElement.lang = lang;
    var els = document.querySelectorAll('[data-ru]');
    for (var i = 0; i < els.length; i++) {
      var v = els[i].getAttribute(isRu ? 'data-ru' : 'data-en');
      if (v !== null && v !== undefined) els[i].innerHTML = v;
    }
    try { localStorage.setItem('spzHelpLang', lang); } catch (e) {}
  }
  ru.addEventListener('click', function () { apply('ru'); });
  en.addEventListener('click', function () { apply('en'); });
  var saved = null;
  try { saved = localStorage.getItem('spzHelpLang'); } catch (e) {}
  var nav = (navigator.language || 'en').toLowerCase();
  apply(saved || (nav.indexOf('ru') === 0 ? 'ru' : 'en'));
})();
