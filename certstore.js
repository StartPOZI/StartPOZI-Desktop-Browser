// certstore.js — embedded Mozilla CA root bundle (cacert.pem).
//
// Chromium (Electron ≥ 15) verifies HTTPS against its own compiled-in Chrome
// Root Store; there is no API to APPEND roots to it. This module embeds the
// Mozilla bundle shipped next to the app and offers:
//   • verifyAgainstBundle(hostname, electronCertificate) — full independent
//     chain validation (hostname, validity window, signatures, CA flags,
//     anchor at a bundled root). Used as a fallback by the certificate
//     verify procs in main.js when Chromium reports ERR_CERT_AUTHORITY_INVALID,
//     so the browser trusts Chrome Root Store ∪ cacert.pem.
//   • pem() — the raw bundle, for Node-side https.request/get (`ca` option)
//     so downloads/save-image also verify against the embedded roots.
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const path = require('path');

var _bundlePem = null;   // raw file contents
var _roots = [];         // [{ cert: X509Certificate, fp: sha256-hex }]
var _rootFingerprints = new Set(); // sha256(DER) of every bundled root
var _loaded = false;
// User-managed trust (Settings → Security → SSL certificates):
var _extraRoots = [];    // user-added trust anchors [{ cert, fp }]
var _extraPems = [];     // their PEM blocks (for the Node-side `ca` list)
var _systemEnabled = true; // bundled Mozilla roots switch

// Push the current manager state into the store: user certs (PEM strings,
// only the ENABLED ones are trusted) and whether the bundled system roots
// stay trusted. Called after every manager mutation and at startup.
function setTrustConfig(userPems, systemEnabled) {
  _extraRoots = [];
  _extraPems = [];
  (Array.isArray(userPems) ? userPems : []).forEach(function (pem) {
    if (typeof pem !== 'string' || pem.indexOf('BEGIN CERTIFICATE') === -1) return;
    var re = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
    var m;
    while ((m = re.exec(pem)) !== null) {
      try {
        var cert = new crypto.X509Certificate(m[0]);
        _extraRoots.push({ cert: cert, fp: crypto.createHash('sha256').update(cert.raw).digest('hex') });
        _extraPems.push(m[0]);
      } catch (e) {}
    }
  });
  _systemEnabled = systemEnabled !== false;
}

function userTrustOnly() { return _systemEnabled !== true; }
function extraRootCount() { return _extraRoots.length; }

function _allRoots() {
  return _systemEnabled ? _roots.concat(_extraRoots) : _extraRoots.slice();
}
function _anyRootFingerprint(fp) {
  if (_systemEnabled && _rootFingerprints.has(fp)) return true;
  for (var i = 0; i < _extraRoots.length; i++) {
    if (_extraRoots[i].fp === fp) return true;
  }
  return false;
}

function _locateBundle() {
  var candidates = [];
  try { candidates.push(path.join(__dirname, 'cacert.pem')); } catch (e) {}
  try { candidates.push(path.join(require('electron').app.getAppPath(), 'cacert.pem')); } catch (e) {}
  try {
    if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, 'cacert.pem'));
  } catch (e) {}
  for (var i = 0; i < candidates.length; i++) {
    try { if (fs.existsSync(candidates[i])) return candidates[i]; } catch (e) {}
  }
  return null;
}

// Lazy one-time load; safe to call from every verify proc invocation.
function load() {
  if (_loaded) return _roots.length > 0;
  var file = _locateBundle();
  if (!file) return false;
  try { _bundlePem = fs.readFileSync(file, 'utf8'); } catch (e) { return false; }
  var re = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;
  var m;
  while ((m = re.exec(_bundlePem)) !== null) {
    try {
      var cert = new crypto.X509Certificate(m[0]);
      var fp = crypto.createHash('sha256').update(cert.raw).digest('hex');
      _roots.push({ cert: cert, fp: fp });
      _rootFingerprints.add(fp);
    } catch (e) {}
  }
  // Mark as loaded ONLY when the bundle actually parsed into at least one
  // root — a transient read failure used to latch "loaded" forever and left
  // the embedded bundle dead until a restart.
  if (_roots.length > 0) _loaded = true;
  return _roots.length > 0;
}

function rootCount() {
  load();
  return _roots.length;
}

// Raw PEM bundle for Node-side https.request/get (`ca` option): the Mozilla
// bundle plus the enabled user roots. When the system roots are DISABLED,
// only user roots are returned (an EMPTY ARRAY when there are none — Node
// then rejects every TLS peer, which is the intended fail-closed behavior).
// null only when the bundle file is missing/unreadable AND no user roots exist.
function pem() {
  load();
  var extra = _extraPems.join('\n');
  if (!_systemEnabled) {
    if (_extraPems.length) return extra;
    return (_bundlePem === null) ? null : [];
  }
  if (!_bundlePem) return extra || null;
  return extra ? _bundlePem + '\n' + extra : _bundlePem;
}

function _fingerprint(x509) {
  try {
    return crypto.createHash('sha256').update(x509.raw).digest('hex');
  } catch (e) {
    return null;
  }
}

// Walk the Electron Certificate chain (cert → cert.issuerCert → …).
// Electron links a self-signed root back to ITSELF, so the fingerprint set
// breaks the cycle. Returns an array of PEM strings, leaf first.
function _chainFromElectron(cert) {
  var out = [];
  var seen = new Set();
  var cur = cert;
  while (cur && cur.data && out.length < 12) {
    var marker = cur.fingerprint || cur.data.length + ':' + out.length;
    if (seen.has(marker)) break;
    seen.add(marker);
    out.push(cur.data);
    cur = cur.issuerCert || null;
  }
  return out;
}

// Full validation of a server chain against the embedded bundle and/or the
// user-added roots. Returns true ONLY when: hostname matches the leaf, every
// certificate is inside its validity window, every link is a properly issued
// CA→child signature, and the chain anchors at a trusted root.
function verifyAgainstBundle(hostname, electronCert) {
  try {
    if (!electronCert || !electronCert.data || !hostname) return false;
    load();

    var pemChain = _chainFromElectron(electronCert);
    if (!pemChain.length) return false;

    var chain = [];
    for (var i = 0; i < pemChain.length; i++) {
      try { chain.push(new crypto.X509Certificate(pemChain[i])); }
      catch (e) { return false; }
    }

    var leaf = chain[0];

    // 1. hostname must match the leaf. NOTE: tls.checkServerIdentity() cannot
    // be used — it expects tls.connect's internal cert format, not an
    // X509Certificate (on Node 20 it silently sees no SAN/CN and rejects
    // everything). X509Certificate.checkHost()/checkIP() implement the same
    // RFC 6125 matching in OpenSSL (SAN first, CN fallback, wildcards only
    // in the leftmost label).
    var hostOk = net.isIP(hostname)
      ? leaf.checkIP(hostname)
      : leaf.checkHost(hostname);
    if (!hostOk) return false;

    // 2. every certificate in the chain must be time-valid right now.
    // X509Certificate.validFrom/validTo are strings like
    // "Mar  6 00:00:00 2008 GMT" — V8's Date parser handles them, but guard
    // against NaN so a malformed cert can never slip through as "valid".
    var now = Date.now();
    for (var j = 0; j < chain.length; j++) {
      var nb = new Date(chain[j].validFrom).getTime();
      var na = new Date(chain[j].validTo).getTime();
      if (!isFinite(nb) || !isFinite(na)) return false;
      if (nb > now) return false; // not yet valid
      if (na < now) return false; // expired
    }

    // 3. verify every link; intermediates must be real CAs (basicConstraints)
    var roots = _allRoots();
    for (var k = 0; k < chain.length; k++) {
      var isTop = (k === chain.length - 1);
      if (isTop) {
        // Top of the server-sent chain: either it IS a trusted self-signed
        // root, or it is signed by one (servers usually omit the root).
        var top = chain[k];
        if (top.issuer === top.subject) {
          return _anyRootFingerprint(_fingerprint(top));
        }
        if (!top.ca && k > 0) return false; // non-CA intermediate — reject
        return _issuedByAnyRoot(top, roots);
      }
      if (!chain[k].verify(chain[k + 1].publicKey)) return false;
      if (!chain[k + 1].ca) return false; // issuer of a non-top cert must be a CA
    }
    return false;
  } catch (e) {
    return false;
  }
}

// The top (server-sent) certificate must be signed by one of the trusted
// roots. Several roots can share a subject, so try every candidate.
function _issuedByAnyRoot(cert, roots) {
  for (var i = 0; i < roots.length; i++) {
    try {
      var root = roots[i].cert;
      if (cert.checkIssued(root) && cert.verify(root.publicKey)) return true;
    } catch (e) {}
  }
  return false;
}

module.exports = {
  load: load,
  rootCount: rootCount,
  pem: pem,
  verifyAgainstBundle: verifyAgainstBundle,
  setTrustConfig: setTrustConfig,
  userTrustOnly: userTrustOnly,
  extraRootCount: extraRootCount
};
