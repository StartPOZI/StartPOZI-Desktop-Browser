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
  _loaded = true;
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
  return _roots.length > 0;
}

function rootCount() {
  load();
  return _roots.length;
}

// Raw PEM bundle (null if missing/unreadable).
function pem() {
  load();
  return _bundlePem;
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

// The top (server-sent) certificate must be signed by one of the bundled
// roots. Several roots can share a subject, so try every candidate.
function _issuedByBundledRoot(cert) {
  for (var i = 0; i < _roots.length; i++) {
    try {
      var root = _roots[i].cert;
      if (cert.checkIssued(root) && cert.verify(root.publicKey)) return true;
    } catch (e) {}
  }
  return false;
}

// Full validation of a server chain against the embedded bundle.
// Returns true ONLY when: hostname matches the leaf, every certificate is
// inside its validity window, every link is a properly issued CA→child
// signature, and the chain anchors at a bundled root.
function verifyAgainstBundle(hostname, electronCert) {
  try {
    if (!load() || !electronCert || !electronCert.data || !hostname) return false;

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
    for (var k = 0; k < chain.length; k++) {
      var isTop = (k === chain.length - 1);
      if (isTop) {
        // Top of the server-sent chain: either it IS a bundled self-signed
        // root, or it is signed by one (servers usually omit the root).
        var top = chain[k];
        if (top.issuer === top.subject) {
          return _rootFingerprints.has(_fingerprint(top));
        }
        if (!top.ca && k > 0) return false; // non-CA intermediate — reject
        return _issuedByBundledRoot(top);
      }
      if (!chain[k].verify(chain[k + 1].publicKey)) return false;
      if (!chain[k + 1].ca) return false; // issuer of a non-top cert must be a CA
    }
    return false;
  } catch (e) {
    return false;
  }
}

module.exports = {
  load: load,
  rootCount: rootCount,
  pem: pem,
  verifyAgainstBundle: verifyAgainstBundle
};
