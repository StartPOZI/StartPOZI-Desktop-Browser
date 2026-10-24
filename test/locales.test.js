// Locale dictionary invariants: every locales/*.json must parse, map
// strings to non-empty strings, and — for any language OTHER than the
// complete Russian one — only use keys that exist in ru.json (which was
// built from the real UI strings). A key missing from ru.json means the
// English source string is not used anywhere and the entry is dead weight.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const LOCALES_DIR = path.join(__dirname, '..', 'locales');
const files = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'));

test('at least ru.json and uk.json ship as locales', () => {
  assert.ok(files.includes('ru.json'), 'ru.json present');
  assert.ok(files.includes('uk.json'), 'uk.json present');
});

for (const file of files) {
  test(file + ': parses as an object of non-empty strings', () => {
    const dict = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), 'utf-8'));
    assert.strictEqual(typeof dict, 'object');
    assert.ok(!Array.isArray(dict));
    for (const [k, v] of Object.entries(dict)) {
      assert.strictEqual(typeof k, 'string', 'key type');
      assert.strictEqual(typeof v, 'string', 'value type for key: ' + k);
      assert.ok(v.length > 0, 'non-empty value for key: ' + k);
    }
  });
}

test('ru.json is the near-complete dictionary (>= 1500 entries)', () => {
  const ru = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'ru.json'), 'utf-8'));
  assert.ok(Object.keys(ru).length >= 1500, 'ru entries: ' + Object.keys(ru).length);
});

for (const file of files.filter((f) => f !== 'ru.json')) {
  test(file + ': keys are a subset of ru.json keys (real UI strings)', () => {
    const ru = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'ru.json'), 'utf-8'));
    const dict = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), 'utf-8'));
    const ruKeys = new Set(Object.keys(ru));
    const stray = Object.keys(dict).filter((k) => !ruKeys.has(k));
    assert.deepStrictEqual(stray, [], 'keys not present in ru.json');
  });
}
