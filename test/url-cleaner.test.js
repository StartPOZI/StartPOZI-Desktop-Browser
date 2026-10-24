// Unit tests for lib/url-cleaner.js (tracking-parameter stripper).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { cleanTrackingParams, TRACKING_PARAMS } = require('../lib/url-cleaner');

test('strips known tracking params, keeps the rest', () => {
  assert.strictEqual(
    cleanTrackingParams('https://example.com/page?a=1&utm_source=x&b=2&utm_campaign=y'),
    'https://example.com/page?a=1&b=2'
  );
});

test('keeps the hash fragment', () => {
  assert.strictEqual(
    cleanTrackingParams('https://example.com/p?fbclid=abc#section'),
    'https://example.com/p#section'
  );
});

test('URL without tracking params is returned unchanged', () => {
  const url = 'https://example.com/page?ok=1';
  assert.strictEqual(cleanTrackingParams(url), url);
});

test('unparsable input is returned unchanged (no throw)', () => {
  assert.strictEqual(cleanTrackingParams('not a url'), 'not a url');
  assert.strictEqual(cleanTrackingParams(''), '');
});

test('all documented params are stripped', () => {
  for (const p of ['utm_source', 'gclid', 'fbclid', 'msclkid', 'ttclid', 'igshid']) {
    assert.ok(TRACKING_PARAMS.includes(p), p + ' should be in TRACKING_PARAMS');
    assert.strictEqual(
      cleanTrackingParams('https://e.com/?' + p + '=1'),
      'https://e.com/',
      p + ' should be removed'
    );
  }
});

test('mixed case scheme URL still cleans', () => {
  assert.strictEqual(
    cleanTrackingParams('https://Example.COM/X?utm_term=q'),
    'https://example.com/X'
  );
});

test('file:// URL with tracking param stays unchanged (opaque origin)', () => {
  // URL parses, but origin === 'null' — must NOT be rebuilt as
  // "null/home/user/report.pdf".
  const url = 'file:///home/user/report.pdf?utm_source=mail';
  assert.strictEqual(cleanTrackingParams(url), url);
});

test('about:blank with tracking param stays unchanged (opaque origin)', () => {
  // Same opaque-origin case: "nullblank" must never be produced.
  const url = 'about:blank?utm_source=x';
  assert.strictEqual(cleanTrackingParams(url), url);
});
