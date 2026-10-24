// Unit tests for lib/filter-checksum.js (Adblock Plus list checksums).
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { verifyListChecksum } = require('../lib/filter-checksum');

// Builds a list the way real ABP generators do: the checksum covers the
// WHOLE list minus the checksum LINE (its trailing newline included), with
// NO extra whitespace trimming, encoded as UNPADDED base64 (22 chars for
// md5 — no '=' padding). Mirrors flieger/abpvn and EasyList output.
function makeList(rules) {
  const placeholder = '! Checksum: PLACEHOLDER';
  const text = '! Title: test\n' + placeholder + '\n' + rules;
  const body = text.replace(/^[ \t]*![ \t]*Checksum:[ \t]*\S+[ \t]*\r?\n?/im, '');
  const sum = crypto.createHash('md5').update(body, 'utf-8').digest('base64').replace(/=+$/, '');
  return text.replace('PLACEHOLDER', sum);
}

const RULES = '[Adblock Plus 2.0]\n||example.com^\n##.ad-banner\n';

test('valid checksum verifies', () => {
  assert.strictEqual(verifyListChecksum(makeList(RULES)), true);
});

test('tampered list is rejected', () => {
  const list = makeList(RULES).replace('example', 'evil');
  assert.strictEqual(verifyListChecksum(list), false);
});

test('truncated list is rejected', () => {
  // Drop the last real rule line. Unlike the old (spec-violating) trim this
  // also means a removed trailing newline alone must flip the verdict.
  const lines = makeList(RULES).split('\n').filter((l) => l !== '');
  const truncated = lines.slice(0, -1).join('\n');
  assert.strictEqual(verifyListChecksum(truncated), false);
});

test('missing trailing newline is rejected (bytes are hashed verbatim)', () => {
  assert.strictEqual(verifyListChecksum(makeList(RULES).replace(/\n$/, '')), false);
});

test('padded checksum header is tolerated', () => {
  const list = makeList(RULES);
  const m = list.match(/^(! Checksum: )(\S+)/im);
  const padded = list.replace(m[0], m[1] + m[2] + '==');
  assert.strictEqual(verifyListChecksum(padded), true);
});

test('list without checksum header returns null (cannot verify)', () => {
  assert.strictEqual(verifyListChecksum('||x.com^\n! comment\n'), null);
  assert.strictEqual(verifyListChecksum(''), null);
  assert.strictEqual(verifyListChecksum(null), null);
});

test('checksum line may sit anywhere in the header', () => {
  const text = '[Adblock Plus 2.0]\n! Title: t\n';
  const body = ('! Checksum: X\n' + text).replace(/^[ \t]*![ \t]*Checksum:[ \t]*\S+[ \t]*\r?\n?/im, '');
  const sum = crypto.createHash('md5').update(body, 'utf-8').digest('base64').replace(/=+$/, '');
  const list = '! Checksum: ' + sum + '\n' + text;
  assert.strictEqual(verifyListChecksum(list), true);
});

test('CRLF list with CRLF-computed checksum verifies', () => {
  const crlf = makeList(RULES).replace(/\n/g, '\r\n');
  const body = crlf.replace(/^[ \t]*![ \t]*Checksum:[ \t]*\S+[ \t]*\r?\n?/im, '');
  const sum = crypto.createHash('md5').update(body, 'utf-8').digest('base64').replace(/=+$/, '');
  const list = crlf.replace(/(Checksum: )\S+/, '$1' + sum);
  assert.strictEqual(verifyListChecksum(list), true);
});
