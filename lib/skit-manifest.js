// skit-manifest.js — .skit package manifest validation (pure module).
//
// The optional "permissions" array in script.json declares which gated
// capabilities the package needs. The renderer injects a per-script SKit
// shim whose API objects (storage / clipboard / notifications) exist ONLY
// for packages that declared the matching permission; undeclared ones get
// null. Import fails on unknown names so a package cannot silently widen
// its rights, and the list UI can show the package's demands up front.
//
// Extracted from main.js as part of the modularization effort.
'use strict';

var SKIT_PERMISSIONS = ['storage', 'clipboard', 'notifications'];

// Returns a deduplicated array of valid permission names, or null when the
// manifest value is invalid (not an array / unknown name / duplicates).
function validateSkitPermissions(perms) {
  if (perms === undefined || perms === null) return [];
  if (!Array.isArray(perms)) return null;
  var seen = {};
  for (var i = 0; i < perms.length; i++) {
    var p = perms[i];
    if (typeof p !== 'string' || SKIT_PERMISSIONS.indexOf(p) === -1 || seen[p]) return null;
    seen[p] = true;
  }
  return Object.keys(seen);
}

module.exports = { SKIT_PERMISSIONS, validateSkitPermissions };
