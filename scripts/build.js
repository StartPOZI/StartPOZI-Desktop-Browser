#!/usr/bin/env node
// DEFAULT build: packages the browser WITH the Widevine (DRM) runtime
// (castlabs "Electron for Content Security" from .drm/, installed by
// `npm run drm:setup`). Fails LOUDLY when the DRM runtime is missing — a
// silent stock build would ship a browser that cannot play Netflix/Spotify
// while everyone assumes the default build can.
//
//   npm run build        — this wrapper: DRM build (requires drm:setup once)
//   npm run build:stock  — plain electron-builder (no Widevine)
//
// Extra args pass through, e.g.:
//   npm run build -- --linux AppImage deb
//
// NOTE on cross-OS builds: the ECS dist is per-platform — build for
// Windows/macOS ON that OS (drm:setup there first).
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ECS_DIST = path.join(ROOT, '.drm', 'node_modules', 'electron', 'dist');

const hasDist = fs.existsSync(path.join(ECS_DIST, 'electron')) ||
                fs.existsSync(path.join(ECS_DIST, 'electron.exe'));

if (!hasDist) {
  console.error('[build] DRM runtime not found: ' + ECS_DIST);
  console.error('[build] The default build ships WITH Widevine. Run once:  npm run drm:setup');
  console.error('[build] For a stock (no-DRM) build instead:               npm run build:stock');
  process.exit(1);
}

const builder = path.join(ROOT, 'node_modules', '.bin', 'electron-builder');
const args = ['--config.electronDist=' + ECS_DIST].concat(process.argv.slice(2));
console.log('[build] DRM build (Widevine baked in): ' + ECS_DIST);
console.log('[build] electron-builder ' + args.join(' '));
const res = spawnSync(builder, args, {
  stdio: 'inherit',
  cwd: ROOT,
  shell: process.platform === 'win32'
});
process.exit(res.status === null ? 1 : res.status);
