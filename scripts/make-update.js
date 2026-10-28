#!/usr/bin/env node
// make-update.js — prepares everything the update server (up.api.startpozi.com)
// needs from a fresh electron-builder output in dist/.
//
// Usage:
//   npm run build                      # produce dist/ artifacts first
//   npm run make-update -- --notes "What's new"
//   npm run make-update -- --channel beta --notes "Beta build"
//
// What it does:
//   1. Reads version from package.json.
//   2. Finds release artifacts in dist/ (AppImage/deb/exe/dmg + blockmaps).
//   3. Computes sha512 + size for each, builds the signed manifest
//      latest.json (or latest-beta.json) — ed25519 signature over the
//      canonical JSON without the "signature" field.
//   4. Copies artifacts to update-server/<channel>/<version>/.
//   5. Prints the exact rsync/scp commands to upload to the server.
//
// The signing key lives in update-server/keys/update-private.pem (generated
// once, see update-server/README.md). NEVER upload the keys directory to the
// server and never commit it — the matching PUBLIC key is embedded into the
// browser binary by the updater module.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'update-server');
const UPDATE_HOST = 'up.api.startpozi.com';
const GH_REPO = 'StartPOZI/StartPOZI-Desktop-Browser-beta-';
const DEFAULT_KEY_PATH = path.join(OUT, 'keys', 'update-private.pem');

// Reference ed25519 public key (raw base64 DER/SPKI) — must stay
// byte-identical to UPDATE_PUBKEY_B64 baked into the browser's updater
// (main.js). The self-check below refuses to run with any other key: a
// manifest signed by a mismatched key would be rejected by every
// installed client and brick their auto-update.
const UPDATE_PUBKEY_B64 = 'MCowBQYDK2VwAyEA53oLApHoSlqKdQaYlQoy0g/RmlrvQLxk93wiUT2kK/E=';

// Deterministic JSON serialization: recursive key sort — the browser verifies
// the signature over the exact same byte sequence.
function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  return '{' + Object.keys(obj).sort()
    .map(function (k) { return JSON.stringify(k) + ':' + canonicalize(obj[k]); })
    .join(',') + '}';
}

function argValue(name) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(name);
  return (i !== -1 && argv[i + 1] !== undefined) ? argv[i + 1] : null;
}

function sha512File(file) {
  const h = crypto.createHash('sha512');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const version = pkg.version;
  const channel = (argValue('--channel') === 'beta') ? 'beta' : 'stable';
  const notes = argValue('--notes') || '';

  if (!fs.existsSync(DIST)) {
    console.error('[make-update] dist/ not found — run "npm run build" first.');
    process.exit(1);
  }
  // Signing key: --key <path>, env UPDATE_PRIVATE_KEY_PATH, or the legacy
  // in-tree default (which prints a loud warning — the private key must
  // not live inside the project tree).
  const keyPath = argValue('--key') || process.env.UPDATE_PRIVATE_KEY_PATH || DEFAULT_KEY_PATH;
  if (!fs.existsSync(keyPath)) {
    console.error('[make-update] missing ' + keyPath + ' — see update-server/README.md');
    process.exit(1);
  }
  if (path.resolve(keyPath) === path.resolve(DEFAULT_KEY_PATH)) {
    console.warn('******************************************************************');
    console.warn('* WARNING: signing with the DEFAULT in-tree private key!          *');
    console.warn('* ' + DEFAULT_KEY_PATH + ' must NOT');
    console.warn('* live inside the project tree. Move it somewhere private (never   *');
    console.warn('* committed, never shipped) and pass it via --key <path> or the    *');
    console.warn('* UPDATE_PRIVATE_KEY_PATH environment variable instead.           *');
    console.warn('******************************************************************');
  }
  const privateKey = fs.readFileSync(keyPath, 'utf8');

  // Collect artifacts: { manifestKey: [fileExts] }
  const wanted = [
    { key: 'linux-appimage', re: /\.AppImage$/i },
    { key: 'linux-deb', re: /\.deb$/i },
    { key: 'win-setup', re: /Setup.*\.exe$|-Setup\.exe$/i },
    { key: 'mac-dmg', re: /\.dmg$/i }
  ];
  const allFiles = fs.readdirSync(DIST).filter(function (f) {
    return fs.statSync(path.join(DIST, f)).isFile();
  });

  // Artifact names may contain spaces ("StartPOZI Browser-…") and
  // characters that encodeURI leaves intact ('#', '?', '%') — a '#' would
  // truncate the URL to a fragment and '?' would start a bogus query.
  // Fully percent-encode the file segment instead.
  function artifactUrl(channel, version, name) {
    return 'https://' + UPDATE_HOST + '/' + channel + '/' + version + '/' + encodeURIComponent(name);
  }

  const files = {};
  const copyList = [];
  wanted.forEach(function (w) {
    const hit = allFiles.find(function (f) { return w.re.test(f); });
    if (!hit) return;
    const full = path.join(DIST, hit);
    const entry = {
      url: artifactUrl(channel, version, hit),
      size: fs.statSync(full).size,
      sha512: sha512File(full),
      // GitHub normalizes release asset names: every space becomes a dot
      // ("StartPOZI Browser-…" is stored as "StartPOZI.Browser-…"), and a
      // %20 URL is a 404 — the fallback must use the normalized name.
      githubFallback: 'https://github.com/' + GH_REPO + '/releases/download/v' + version + '/' + encodeURIComponent(hit.replace(/ /g, '.'))
    };
    files[w.key] = entry;
    copyList.push(hit);
    // Delta blockmap for the same artifact, when electron-builder made one.
    const bm = hit + '.blockmap';
    if (allFiles.indexOf(bm) !== -1) {
      entry.blockmapUrl = artifactUrl(channel, version, bm);
      copyList.push(bm);
    }
  });

  if (!Object.keys(files).length) {
    console.error('[make-update] no release artifacts found in dist/ (expected .AppImage/.deb/Setup.exe/.dmg)');
    process.exit(1);
  }

  // Build + sign the manifest.
  const manifest = {
    product: 'startpozi-browser',
    channel: channel,
    version: version,
    date: new Date().toISOString().slice(0, 10),
    notes: notes,
    // Oldest version allowed to auto-update silently from (anti-rollback is
    // also enforced client-side by comparing with the running version).
    minAuto: '1.0.0',
    files: files
  };
  const canonical = canonicalize(manifest);
  const signature = crypto.sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64');
  manifest.signature = signature;

  // Copy artifacts into update-server/<channel>/<version>/.
  const verDir = path.join(OUT, channel, version);
  fs.mkdirSync(verDir, { recursive: true });
  copyList.forEach(function (f) {
    fs.copyFileSync(path.join(DIST, f), path.join(verDir, f));
    console.log('[make-update] + ' + channel + '/' + version + '/' + f);
  });

  const manifestName = channel === 'beta' ? 'latest-beta.json' : 'latest.json';
  fs.writeFileSync(path.join(OUT, manifestName), JSON.stringify(manifest, null, 2) + '\n');
  console.log('[make-update] wrote ' + manifestName + ' (v' + version + ', ' +
    Object.keys(files).join(', ') + ', signature ok)');

  // Self-check: verify with the public key right away, and first make sure
  // it is THE key the shipped browser trusts (UPDATE_PUBKEY_B64 in main.js).
  const pub = fs.readFileSync(path.join(OUT, 'keys', 'update-public.pem'), 'utf8');
  const pubBody = pub.replace(/-----[^-]*-----/g, '').replace(/\s+/g, '');
  if (pubBody !== UPDATE_PUBKEY_B64) {
    console.error('[make-update] PUBLIC KEY MISMATCH: update-server/keys/update-public.pem');
    console.error('[make-update] does not match the UPDATE_PUBKEY_B64 constant embedded in the browser');
    console.error('[make-update] updater (main.js). Every installed client would reject this manifest.');
    process.exit(1);
  }
  const check = Object.assign({}, manifest);
  const sig = check.signature;
  delete check.signature;
  const okSig = crypto.verify(null, Buffer.from(canonicalize(check), 'utf8'), pub, Buffer.from(sig, 'base64'));
  console.log('[make-update] signature self-check: ' + (okSig ? 'PASSED' : 'FAILED'));
  if (!okSig) process.exit(1);

  console.log('\nUpload to the server:\n' +
    '  rsync -avz update-server/' + manifestName + ' user@SERVER:/var/www/updates/\n' +
    '  rsync -avz update-server/' + channel + '/' + version + '/ user@SERVER:/var/www/updates/' + channel + '/' + version + '/');
}

main();
