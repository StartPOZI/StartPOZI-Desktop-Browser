(function(){
  var T = function(s){ return window.i18n && window.i18n.t ? window.i18n.t(s) : s; };
  var p = new URLSearchParams(location.search);
  var url = p.get('url') || '';
  var reason = p.get('reason') || '';
  var code = p.get('code') || '';
  var desc = p.get('desc') || '';
  var backUrl = p.get('back') || '';

  // Map the reason code to a friendly explanation.
  var REASONS = {
    http:        { title: 'This site is not secure',
                   subtitle: 'This site uses an unencrypted HTTP connection. Anything you send — passwords, messages, card numbers — could be read by anyone on your network (Wi-Fi, ISP, employer).',
                   detail: 'HTTPS adds encryption so that what you send can only be read by the website. StartPOZI recommends HTTPS for every site that handles private data.' },
    expired:     { title: 'Your connection is not private',
                   subtitle: 'The security certificate for this site has expired. Attackers might be trying to impersonate the site to steal your information.',
                   detail: 'Certificates are issued for a limited time and must be renewed. An expired certificate may simply mean the site owner forgot to renew — or that someone is impersonating the site.' },
    notyet:      { title: 'Your connection is not private',
                   subtitle: 'This site\'s certificate is not yet valid. The site may be misconfigured or your computer\'s clock may be wrong.',
                   detail: 'Certificates have a "valid from" date. If your system clock is set in the past, even valid certificates can fail. Check your date and time settings.' },
    selfsigned:  { title: 'Your connection is not private',
                   subtitle: 'This site uses a self-signed certificate that StartPOZI does not trust. The connection may be secure, but you cannot be certain you are connected to the real site.',
                   detail: 'A self-signed certificate was not issued by a recognised authority. This is common on internal company sites and routers, but also on phishing pages.' },
    hostname:    { title: 'Your connection is not private',
                   subtitle: 'The certificate was issued for a different domain. The site you are seeing may be impersonating another site.',
                   detail: 'The certificate lists the hostnames it is valid for. The address you opened does not match any of them — a common sign of a phishing attack.' },
    revoked:     { title: 'Your connection is not private',
                   subtitle: 'This site\'s certificate has been revoked by its issuer. Continuing is dangerous.',
                   detail: 'Revocation means the issuer explicitly invalidated the certificate (often after a breach). Modern browsers will refuse to load the site.' },
    weak:        { title: 'Your connection is not private',
                   subtitle: 'This site uses an outdated encryption algorithm that is no longer considered secure.',
                   detail: 'Older ciphers and short keys can be broken by modern hardware. A properly configured server should use modern TLS.' },
    unknown:     { title: 'Your connection is not private',
                   subtitle: 'StartPOZI cannot verify the identity of this site. Anyone could be intercepting the connection.',
                   detail: 'The certificate could not be validated. This may be a server misconfiguration or a man-in-the-middle attack.' }
  };

  var info = REASONS[reason] || REASONS.unknown;
  document.getElementById('title').textContent = info.title;
  document.getElementById('subtitle').textContent = info.subtitle;
  document.getElementById('reason').innerHTML = '<strong>Reason:</strong> ' + info.detail;
  document.getElementById('urlBox').textContent = url ? decodeURIComponent(url) : '';

  var detailsText = document.getElementById('detailsText');
  function addDetail(label, value) {
    var row = document.createElement('div');
    if (detailsText.lastChild) row.style.marginTop = '6px';
    var s = document.createElement('strong'); s.textContent = T(label) + ': ';
    row.appendChild(s);
    row.appendChild(document.createTextNode(value));
    detailsText.appendChild(row);
  }
  detailsText.textContent = '';
  addDetail('URL', url ? decodeURIComponent(url) : '—');
  addDetail('Reason code', reason || 'unknown');
  if (code) addDetail('Chromium error', code);
  if (desc) addDetail('Description', desc);

  var detailsToggle = document.getElementById('detailsToggle');
  var detailsBody = document.getElementById('detailsBody');
  detailsToggle.addEventListener('click', function(){
    var open = detailsBody.classList.toggle('visible');
    detailsToggle.textContent = open ? 'Hide details' : 'Show details';
  });

  // Back to safety — go back in history, or fall back to a new-tab page.
  document.getElementById('backBtn').addEventListener('click', function(){
    if (window.electronAPI && window.electronAPI._retryUrl && backUrl) {
      window.electronAPI._retryUrl(backUrl);
    } else if (history.length > 1) {
      history.back();
    } else if (window.electronAPI && window.electronAPI.openInCurrentTab) {
      window.electronAPI.openInCurrentTab('MainPage/index.html');
    } else {
      location.href = '../../MainPage/index.html';
    }
  });

  // Proceed anyway — record a per-site exception so the certificate verifier
  // (main.js setCertificateVerifyProc) lets it through next time.
  // For HTTP we use a separate httpConsents map.
  var proceedBtn = document.getElementById('proceedBtn');
  proceedBtn.addEventListener('click', function(){
    if (!url) return;
    proceedBtn.classList.add('loading');
    var host = '';
    try { host = new URL(decodeURIComponent(url)).hostname; } catch(e) {}

    function goTo() {
      if (window.electronAPI && window.electronAPI._retryUrl) {
        window.electronAPI._retryUrl(url);
      } else {
        try { location.href = decodeURIComponent(url); } catch(e) {}
      }
    }

    if (!host) { goTo(); return; }
    // Pick the right exception store based on the failure reason.
    var saveFn = null;
    if (reason === 'http') {
      saveFn = window.electronAPI && window.electronAPI.setHttpConsent;
    } else {
      saveFn = window.electronAPI && window.electronAPI.setCertException;
    }
    if (saveFn) {
      saveFn(host, true).then(goTo).catch(function(){
        // Fallback — at least try to navigate directly.
        try { location.href = decodeURIComponent(url); } catch(e) {}
      });
    } else {
      goTo();
    }
  });
})();
