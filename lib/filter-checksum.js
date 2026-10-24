// filter-checksum.js — Adblock Plus list checksum verification (pure module).
//
// Filter lists may ship an integrity header:  ! Checksum: <base64-md5>
// The digest is computed over the list content with the checksum LINE
// removed (including its trailing newline) — but WITHOUT trimming any other
// leading/trailing whitespace: generators hash the file as-is. The base64
// digest is unpadded in real lists (22 chars for md5, no '='), so both
// sides are normalized before comparison. (ABP spec:
// https://adblockplus.org/en/filters#checksum.) Downloads whose checksum
// does not match must be rejected (treated like a network failure: fall
// back to the last cached copy) so a truncated or tampered list can never
// enter the engine. Lists without the header cannot be verified — callers
// usually still accept them but count them as "unverified".
//
// Extracted from adblocker.js as part of the modularization effort; the
// adblocker keeps a re-export for compatibility.
'use strict';

const crypto = require('crypto');

// Returns: true (verified) / false (mismatch) / null (no checksum header).
function verifyListChecksum(text) {
  if (typeof text !== 'string' || !text) return null;
  var m = text.match(/^[ \t]*![ \t]*Checksum:[ \t]*(\S+)[ \t]*\r?$/im);
  if (!m) return null;
  // Remove ONLY the checksum line (with its newline) — no outer trim:
  // real generators hash the remaining bytes verbatim, including any
  // trailing newline at EOF.
  var body = text.replace(/^[ \t]*![ \t]*Checksum:[ \t]*\S+[ \t]*\r?\n?/im, '');
  var actual = crypto.createHash('md5').update(body, 'utf-8').digest('base64').replace(/=+$/, '');
  var expected = m[1].replace(/=+$/, ''); // tolerate padded headers too
  return expected === actual;
}

module.exports = { verifyListChecksum };
