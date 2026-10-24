// url-cleaner.js — tracking-parameter stripper (pure module).
//
// Removes known tracking parameters (utm_*, fbclid, gclid, …) from URLs.
// The hash fragment is preserved, non-matching and unparsable URLs are
// returned unchanged. Extracted from adblocker.js as part of the
// modularization effort; the adblocker keeps a re-export for compatibility.
'use strict';

var TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'gclsrc', 'dclid', 'msclkid',
  'mc_eid', 'mc_cid', '_ga', '_gl', '_hsenc', '_hsmi',
  'hsCtaTracking', 'vero_id', 'oly_anon_id', 'oly_enc_id',
  'otc', 'igshid', 'wickedid', 'twclid', 'ttclid',
  'li_fat_id', 'li_shid', 'spm', 'scm',
];

function cleanTrackingParams(url) {
  try {
    var urlObj = new URL(url);
    // Opaque origins (file:, about:, data:, …) report origin === 'null':
    // rebuilding from urlObj.origin would yield a literal "null" scheme
    // ("null/path?…"). Return such URLs unchanged instead.
    if (!urlObj.origin || urlObj.origin === 'null') return url;
    var params = urlObj.searchParams;
    var changed = false;
    TRACKING_PARAMS.forEach(function(param) {
      if (params.has(param)) {
        params.delete(param);
        changed = true;
      }
    });
    if (changed) {
      var cleaned = urlObj.origin + urlObj.pathname;
      if (params.toString()) cleaned += '?' + params.toString();
      if (urlObj.hash) cleaned += urlObj.hash;
      return cleaned;
    }
  } catch(e) {}
  return url;
}

module.exports = { TRACKING_PARAMS, cleanTrackingParams };
