#!/usr/bin/env node
// Setup the optional Widevine (DRM) runtime for StartPOZI.
//
// Stock Electron cannot ship Google's proprietary Widevine CDM. This script
// installs the castlabs "Electron for Content Security" build (same Electron
// 42 branch, tagged v42.11.0+wvcus) into the ISOLATED .drm/ folder, so the
// regular runtime is never touched:
//
//   npm run drm:setup     — install/refresh the DRM runtime (~130 MB)
//   npm run start:drm     — run the browser WITH Widevine
//   npm start             — run the browser as usual (no DRM)
//
// Why a separate folder: installing castlabs Electron next to the stock one
// would overwrite node_modules/electron and swap the runtime for everyone.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ECS_TAG = 'v42.11.0+wvcus';
const ECS_URL = 'https://github.com/castlabs/electron-releases/archive/refs/tags/' + encodeURIComponent(ECS_TAG) + '.tar.gz';
const ROOT = path.join(__dirname, '..');
const DRM_DIR = path.join(ROOT, '.drm');
const ECS_BIN = path.join(DRM_DIR, 'node_modules', 'electron', 'dist', 'electron');

function log(m) { console.log('[drm:setup] ' + m); }

try {
  fs.mkdirSync(DRM_DIR, { recursive: true });
  fs.writeFileSync(path.join(DRM_DIR, 'package.json'),
    JSON.stringify({ name: 'startpozi-drm', private: true, version: '1.0.0' }, null, 2));

  const tarball = path.join(DRM_DIR, 'ecs.tar.gz');
  log('downloading ' + ECS_TAG + ' …');
  execSync('curl -sL --fail -o "' + tarball + '" "' + ECS_URL + '"', { stdio: 'inherit' });

  log('installing package (scripts off, binary fetched manually)…');
  // --no-save: keep package.json free of the ephemeral tarball path — an
  // earlier run without it recorded "file:../../../../../../tmp/ecs.tar.gz"
  // as a dependency, breaking npm i in .drm on any other machine.
  execSync('npm i "' + tarball + '" --no-save --no-audit --no-fund --ignore-scripts', { cwd: DRM_DIR, stdio: 'inherit' });

  const pkgDir = path.join(DRM_DIR, 'node_modules', 'electron');
  if (fs.existsSync(path.join(pkgDir, 'dist', 'electron'))) {
    log('Widevine binary already present.');
  } else {
    log('downloading the Widevine-enabled Electron binary (~130 MB)…');
    execSync('node install.js', { cwd: pkgDir, stdio: 'inherit' });
  }

  if (!fs.existsSync(ECS_BIN)) {
    console.error('[drm:setup] FAILED: binary missing after install');
    process.exit(1);
  }
  log('done. Start the browser with DRM:  npm run start:drm');
} catch (e) {
  console.error('[drm:setup] ' + (e.message || e));
  process.exit(1);
}
