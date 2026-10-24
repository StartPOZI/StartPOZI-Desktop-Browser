// Unit tests for storage.js (atomic settings storage) with a mocked
// electron.app — the module otherwise runs inside the Electron main process.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Inject a fake electron export BEFORE requiring storage.js so
// storagePath() resolves into a throwaway temp directory.
const electronResolved = require.resolve('electron');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spz-storage-test-'));
require.cache[electronResolved] = {
  id: electronResolved,
  filename: electronResolved,
  loaded: true,
  exports: { app: { getPath: () => tmpRoot } },
};
const storage = require('../storage');

test('write/read roundtrip persists to settings.json', () => {
  storage.write({ hello: 'world', nested: { a: 1 } });
  const disk = JSON.parse(fs.readFileSync(path.join(tmpRoot, 'settings.json'), 'utf-8'));
  assert.strictEqual(disk.hello, 'world');
  assert.deepStrictEqual(storage.read().nested, { a: 1 });
});

test('update() mutates the store race-free', () => {
  storage.update(function (s) { s.counter = (s.counter || 0) + 1; });
  storage.update(function (s) { s.counter = (s.counter || 0) + 1; });
  assert.strictEqual(storage.read().counter, 2);
});

test('reads return a clone — mutating the result cannot corrupt the cache', () => {
  storage.write({ safe: 'yes' });
  const snapshot = storage.read();
  snapshot.safe = 'corrupted';
  assert.strictEqual(storage.read().safe, 'yes');
});

test('bloat guard caps blockedLog to 2000 entries', () => {
  // 2000 = the cap shared with the adblocker's persisted block-log writes
  // (they used to disagree: storage cut to 200 what adblocker saved as 5000).
  const big = Array.from({ length: 5000 }, function (_, i) { return { i: i }; });
  storage.write({ blockedLog: big });
  assert.strictEqual(storage.read().blockedLog.length, 2000);
  // The 5000 newest? No: the LAST 2000 are kept.
  assert.strictEqual(storage.read().blockedLog[0].i, 3000);
});

test('atomic write leaves no .tmp file behind', () => {
  storage.write({ atomic: true });
  assert.ok(!fs.existsSync(path.join(tmpRoot, 'settings.json.tmp')));
  assert.ok(fs.existsSync(path.join(tmpRoot, 'settings.json')));
});

test('reload() re-reads external edits from disk', () => {
  storage.write({ v: 1 });
  const p = path.join(tmpRoot, 'settings.json');
  fs.writeFileSync(p, JSON.stringify({ v: 2 }), 'utf-8');
  assert.strictEqual(storage.reload().v, 2);
});
