#!/usr/bin/env node
// Default launcher: run the browser WITH the Widevine (DRM) runtime when it
// is installed (.drm/), otherwise fall back to stock Electron (no Widevine).
//
//   npm start          — this wrapper: DRM runtime when available
//   npm run start:drm  — force the DRM runtime (fails loudly when missing)
//   npm run start:stock — always stock Electron
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ECS_BIN = path.join(ROOT, '.drm', 'node_modules', 'electron', 'dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron');

function run(cmd, args) {
  const r = spawn(cmd, args, {
    stdio: 'inherit',
    cwd: ROOT,
    shell: process.platform === 'win32'
  });
  r.on('exit', function (code) { process.exit(code === null ? 1 : code); });
  r.on('error', function (e) {
    console.error('[start] failed to launch ' + cmd + ': ' + e.message);
    process.exit(1);
  });
}

if (fs.existsSync(ECS_BIN)) {
  console.log('[start] DRM runtime found — launching with Widevine (Netflix/Spotify OK)');
  console.log('[start] ' + ECS_BIN);
  run(ECS_BIN, ['.']);
} else {
  const stockBin = path.join(ROOT, 'node_modules', '.bin',
    process.platform === 'win32' ? 'electron.cmd' : 'electron');
  if (!fs.existsSync(stockBin)) {
    console.error('[start] Neither the DRM runtime (.drm/) nor stock Electron is installed.');
    console.error('[start] Fix:  npm install  &&  npm run drm:setup');
    process.exit(1);
  }
  console.log('[start] DRM runtime not found (.drm/) — launching stock Electron (no Widevine).');
  console.log('[start] To get DRM:  npm run drm:setup');
  run(path.join(ROOT, 'node_modules', '.bin', 'electron'), ['.']);
}
