// Unit tests for lib/skit-manifest.js (.skit permissions validation).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { SKIT_PERMISSIONS, validateSkitPermissions } = require('../lib/skit-manifest');

test('missing/null permissions resolve to an empty list (optional field)', () => {
  assert.deepStrictEqual(validateSkitPermissions(undefined), []);
  assert.deepStrictEqual(validateSkitPermissions(null), []);
});

test('valid permissions pass through', () => {
  assert.deepStrictEqual(validateSkitPermissions(['storage']), ['storage']);
  assert.deepStrictEqual(
    validateSkitPermissions(['storage', 'clipboard', 'notifications']),
    ['storage', 'clipboard', 'notifications']
  );
});

test('empty array is valid', () => {
  assert.deepStrictEqual(validateSkitPermissions([]), []);
});

test('unknown permission name is rejected (null)', () => {
  assert.strictEqual(validateSkitPermissions(['node']), null);
  assert.strictEqual(validateSkitPermissions(['storage', 'gm-xmlhttprequest']), null);
});

test('duplicates are rejected', () => {
  assert.strictEqual(validateSkitPermissions(['storage', 'storage']), null);
});

test('non-array values are rejected', () => {
  assert.strictEqual(validateSkitPermissions('storage'), null);
  assert.strictEqual(validateSkitPermissions({ 0: 'storage' }), null);
});

test('whitelist is exactly the supported set', () => {
  assert.deepStrictEqual(SKIT_PERMISSIONS, ['storage', 'clipboard', 'notifications']);
});
