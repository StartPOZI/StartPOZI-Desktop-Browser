// Self-contained, async-safe session preload for the cosmetic-filter engine.
//
// WHY THIS EXISTS:
//  1. ipcRenderer.sendSync(...) at document-start — WHILE the webview is
//     still committing its navigation — re-enters the message loop and kills
//     the in-flight load on Electron 42: the page commits EMPTY (no
//     <head>/<body>, no title, blank viewport; only the injected script node
//     remains). Reproduced 100% on YouTube with the blocker enabled. This
//     preload therefore speaks the SAME protocol but fully asynchronously
//     ('get-cosmetic-filters-first-async' / 'is-mutation-observer-enabled-async',
//     handled in adblocker.js).
//  2. `require('@cliqz/adblocker-content')` does not work here either: session
//     preloads run in Electron's sandboxed preload context whose limited
//     module loader cannot resolve arbitrary npm packages — the preload
//     silently failed to load. Hence: a fully self-contained bundle.
//
// Licensed under the Mozilla Public License 2.0 — see the notice below.
'use strict';

var electron = require('electron');

/*!
 * Copyright (c) 2017-present Ghostery GmbH. All rights reserved.
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
const SCRIPT_ID = 'cliqz-adblocker-script';
const IGNORED_TAGS = new Set(['br', 'head', 'link', 'meta', 'script', 'style', 's']);
function debounce(fn, { waitFor, maxWait, }) {
    let delayedTimer;
    let maxWaitTimer;
    const clear = () => {
        clearTimeout(delayedTimer);
        clearTimeout(maxWaitTimer);
        delayedTimer = undefined;
        maxWaitTimer = undefined;
    };
    const run = () => {
        clear();
        fn();
    };
    return [
        () => {
            if (maxWait > 0 && maxWaitTimer === undefined) {
                maxWaitTimer = setTimeout(run, maxWait);
            }
            clearTimeout(delayedTimer);
            delayedTimer = setTimeout(run, waitFor);
        },
        clear,
    ];
}
function isElement(node) {
    return node.nodeType === 1;
}
function getElementsFromMutations(mutations) {
    const elements = [];
    for (const mutation of mutations) {
        if (mutation.type === 'attributes') {
            if (isElement(mutation.target)) {
                elements.push(mutation.target);
            }
        }
        else if (mutation.type === 'childList') {
            for (const addedNode of mutation.addedNodes) {
                if (isElement(addedNode) && addedNode.id !== SCRIPT_ID) {
                    elements.push(addedNode);
                }
            }
        }
    }
    return elements;
}
function extractFeaturesFromDOM(roots) {
    const ignoredTags = new Set(['br', 'head', 'link', 'meta', 'script', 'style', 's']);
    const classes = new Set();
    const hrefs = new Set();
    const ids = new Set();
    const seenElements = new Set();
    for (const root of roots) {
        for (const element of [
            root,
            ...root.querySelectorAll('[id]:not(html):not(body),[class]:not(html):not(body),[href]:not(html):not(body)'),
        ]) {
            if (seenElements.has(element)) {
                continue;
            }
            seenElements.add(element);
            if (ignoredTags.has(element.nodeName.toLowerCase())) {
                continue;
            }
            const id = element.getAttribute('id');
            if (typeof id === 'string') {
                ids.add(id);
            }
            const classList = element.classList;
            for (const classEntry of classList) {
                classes.add(classEntry);
            }
            const href = element.getAttribute('href');
            if (typeof href === 'string') {
                hrefs.add(href);
            }
        }
    }
    return {
        classes: Array.from(classes),
        hrefs: Array.from(hrefs),
        ids: Array.from(ids),
    };
}
class DOMMonitor {
    constructor(cb) {
        this.cb = cb;
        this.knownIds = new Set();
        this.knownHrefs = new Set();
        this.knownClasses = new Set();
        this.observer = null;
    }
    queryAll(window) {
        this.cb({ type: 'elements', elements: [window.document.documentElement] });
        this.handleUpdatedNodes([window.document.documentElement]);
    }
    start(window) {
        if (this.observer === null && window.MutationObserver !== undefined) {
            const nodes = new Set();
            const handleUpdatedNodesCallback = () => {
                this.handleUpdatedNodes(Array.from(nodes));
                nodes.clear();
            };
            const [debouncedHandleUpdatedNodes, cancelHandleUpdatedNodes] = debounce(handleUpdatedNodesCallback, {
                waitFor: 25,
                maxWait: 1000,
            });
            this.observer = new window.MutationObserver((mutations) => {
                getElementsFromMutations(mutations).forEach(nodes.add, nodes);
                if (nodes.size > 512) {
                    cancelHandleUpdatedNodes();
                    handleUpdatedNodesCallback();
                }
                else {
                    debouncedHandleUpdatedNodes();
                }
            });
            this.observer.observe(window.document.documentElement, {
                attributes: true,
                attributeFilter: ['class', 'id', 'href'],
                childList: true,
                subtree: true,
            });
        }
    }
    stop() {
        if (this.observer !== null) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
    handleNewFeatures({ hrefs, ids, classes, }) {
        const newIds = [];
        const newClasses = [];
        const newHrefs = [];
        for (const id of ids) {
            if (this.knownIds.has(id) === false) {
                newIds.push(id);
                this.knownIds.add(id);
            }
        }
        for (const cls of classes) {
            if (this.knownClasses.has(cls) === false) {
                newClasses.push(cls);
                this.knownClasses.add(cls);
            }
        }
        for (const href of hrefs) {
            if (this.knownHrefs.has(href) === false) {
                newHrefs.push(href);
                this.knownHrefs.add(href);
            }
        }
        if (newIds.length !== 0 || newClasses.length !== 0 || newHrefs.length !== 0) {
            this.cb({
                type: 'features',
                classes: newClasses,
                hrefs: newHrefs,
                ids: newIds,
            });
            return true;
        }
        return false;
    }
    handleUpdatedNodes(elements) {
        if (elements.length !== 0) {
            this.cb({
                type: 'elements',
                elements: elements.filter((e) => IGNORED_TAGS.has(e.nodeName.toLowerCase()) === false),
            });
            return this.handleNewFeatures(extractFeaturesFromDOM(elements));
        }
        return false;
    }
}
function autoRemoveScript(script) {
    return `try{${script}}catch(c){}!function(){var c=document.currentScript,e=c&&c.parentNode;e&&e.removeChild(c)}();`;
}
function insertNode(node, document) {
    const parent = document.head || document.documentElement || document;
    if (parent !== null) {
        parent.appendChild(node);
    }
}
function injectScriptlet(s, doc) {
    const script = doc.createElement('script');
    script.type = 'text/javascript';
    script.id = SCRIPT_ID;
    script.async = false;
    script.appendChild(doc.createTextNode(autoRemoveScript(s)));
    insertNode(script, doc);
}
function injectScript(s, doc) {
    // (Firefox blob-URL path omitted — this browser identifies as Chrome.)
    injectScriptlet(s, doc);
}

// ============================================================================
// Main entry — same protocol as the library preload, but fully ASYNC
// (never sendSync from a document-start preload: see the header comment).
// ============================================================================
if (window === window.top && window.location.href.startsWith('devtools://') === false) {
    (async () => {
        let enableMutationObserver = false;
        try {
            enableMutationObserver = await electron.ipcRenderer.invoke('is-mutation-observer-enabled-async');
        }
        catch (e) { /* main not ready — stay dormant */ }
        let ACTIVE = true;
        let DOM_MONITOR = null;
        const unload = () => {
            if (DOM_MONITOR !== null) {
                DOM_MONITOR.stop();
                DOM_MONITOR = null;
            }
        };
        electron.ipcRenderer.on('get-cosmetic-filters-response', (_, msg) => {
            if (!msg) return;
            if (msg.active === false) {
                ACTIVE = false;
                unload();
                return;
            }
            ACTIVE = true;
        });
        let scripts = null;
        try {
            scripts = await electron.ipcRenderer.invoke('get-cosmetic-filters-first-async', window.location.href);
        }
        catch (e) { /* main not ready — dom-ready fallback still applies styles */ }
        if (scripts) {
            for (const script of scripts) {
                injectScript(script, document);
            }
        }
        window.addEventListener('DOMContentLoaded', () => {
            DOM_MONITOR = new DOMMonitor((update) => {
                if (update.type === 'features') {
                    try { electron.ipcRenderer.send('get-cosmetic-filters', window.location.href, update); } catch (e) {}
                }
            });
            DOM_MONITOR.queryAll(window);
            if (ACTIVE && enableMutationObserver) {
                DOM_MONITOR.start(window);
            }
        }, { once: true, passive: true });
        window.addEventListener('unload', unload, { once: true, passive: true });
    })();
}
