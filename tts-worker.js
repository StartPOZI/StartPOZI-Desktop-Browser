// tts-worker.js — offline TTS worker (Electron utilityProcess).
//
// Synthesizes WAV audio with the espeak-ng WASM package. Runs in a separate
// process because WASM synthesis blocks its thread for 100–400 ms per
// chunk — doing that in the main process would stutter the whole browser.
//
// Protocol (process.parentPort):
//   → {id, cmd:'synth', text, lang, rate}
//   ← {id, ok:true, wav: <base64>}  |  {id, ok:false, error}
//   → {cmd:'shutdown'}              (no reply; process exits)

'use strict';

// Page-language prefix → espeak-ng voice. Extended list; anything not in
// the map falls back to the raw prefix, then to 'default'.
var LANG_MAP = {
  ru: 'ru', en: 'en-us', de: 'de', fr: 'fr', es: 'es', it: 'it',
  pl: 'pl', uk: 'uk', pt: 'pt-br', tr: 'tr', cs: 'cs', sk: 'sk',
  nl: 'nl', sv: 'sv', fi: 'fi', da: 'da', no: 'no', el: 'el',
  ro: 'ro', hu: 'hu', bg: 'bg', hr: 'hr', sr: 'sr', sl: 'sl',
  lt: 'lt', lv: 'lv', et: 'et', ka: 'ka', hy: 'hy', az: 'az',
  kk: 'kk', uz: 'uz', be: 'be', zh: 'zh', ja: 'ja', ko: 'ko',
  hi: 'hi', ar: 'ar', fa: 'fa', he: 'he', id: 'id', ms: 'ms',
  vi: 'vi', th: 'th', sw: 'sw', af: 'af', ca: 'ca', is: 'is',
  ga: 'ga', cy: 'cy', eu: 'eu', la: 'la', mt: 'mt', sq: 'sq'
};

var _modPromise = null;
function getModule() {
  if (_modPromise) return _modPromise;
  _modPromise = import('espeak-ng').then(function (m) {
    if (!m || !m.default) throw new Error('espeak-ng module has no default export');
    return m.default;
  });
  return _modPromise;
}

function pickVoice(lang) {
  var prefix = String(lang || '').toLowerCase().split('-')[0].trim();
  if (prefix && LANG_MAP[prefix]) return LANG_MAP[prefix];
  return prefix || 'default';
}

function sanitizeText(text) {
  // espeak CLI takes the text as an argv element — strip NUL/control chars
  // and clamp the length (one chunk is ≤ ~400 chars by the renderer).
  return String(text || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .slice(0, 2000);
}

async function synthesize(text, lang, rate) {
  var ESpeakNg = await getModule();
  var wpm = Math.max(80, Math.min(400, Math.round(175 * (parseFloat(rate) || 1))));
  var voice = pickVoice(lang);
  var args = ['-w', 'spz-out.wav', '-v', voice, '-s', String(wpm), sanitizeText(text)];
  var espeak = await ESpeakNg({ arguments: args });
  var buf = espeak.FS.readFile('spz-out.wav');
  if (!buf || buf.length < 44) throw new Error('empty WAV');
  return Buffer.from(buf).toString('base64');
}

var port = null;
try { port = process.parentPort; } catch (e) { port = null; }
if (!port) {
  // Started outside utilityProcess (plain node) — nothing to talk to.
  process.exit(0);
}

port.on('message', function (msg) {
  var m = msg && msg.data ? msg.data : msg;
  if (!m || !m.cmd) return;
  if (m.cmd === 'shutdown') { process.exit(0); return; }
  if (m.cmd !== 'synth' || m.id === undefined) return;
  synthesize(m.text, m.lang, m.rate).then(function (b64) {
    port.postMessage({ id: m.id, ok: true, wav: b64 });
  }).catch(function (e) {
    // Retry once with the default voice — some prefixes have no espeak data.
    if (pickVoice(m.lang) !== 'default') {
      synthesize(m.text, '', m.rate).then(function (b64) {
        port.postMessage({ id: m.id, ok: true, wav: b64 });
      }).catch(function (e2) {
        port.postMessage({ id: m.id, ok: false, error: String(e2 && e2.message || e2) });
      });
    } else {
      port.postMessage({ id: m.id, ok: false, error: String(e && e.message || e) });
    }
  });
});
