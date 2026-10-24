// Delegated listeners extracted from inline on* handlers (CSP: no 'unsafe-inline').
// Attached in <head> so the capture listener is registered before the logo <img> loads.
document.addEventListener('error', function (e) {
  var t = e.target;
  if (!t || t.tagName !== 'IMG') return;
  if (t.classList.contains('logo-img')) {
    t.style.display = 'none';
    var fb = document.getElementById('logo-fallback');
    if (fb) fb.style.display = 'block';
  }
}, true);
