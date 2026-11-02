'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

// This is only a first boundary. The main process also checks the exact local
// origin and senderFrame before accepting either fixed IPC operation.
function trustedAppEntry() {
  if (process.isMainFrame !== true) return null;
  try {
    const url = new URL(window.location.href);
    const beforeHash = url.href.split('#', 1)[0];
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1'
      || url.username || url.password || beforeHash.includes('?')
      || (url.pathname !== '/' && url.pathname !== '/index.html')) return null;
    return url;
  } catch {
    return null;
  }
}

if (trustedAppEntry()) {
  contextBridge.exposeInMainWorld('easymdDesktop', Object.freeze({
    preparePreview: () => {
      if (!trustedAppEntry()) return false;
      try {
        if (navigator.userActivation?.isActive !== true) return false;
        return ipcRenderer.sendSync('easymd:prepare-preview') === true;
      }
      catch { return false; }
    },
  }));

  // The isolated world sees the native event; synthetic page events cannot
  // turn an arbitrary document URL into an OS-level openExternal request.
  document.addEventListener('click', (event) => {
    const entry = trustedAppEntry();
    if (!entry || event.isTrusted !== true || event.button !== 0 || event.defaultPrevented) return;
    let anchor;
    try {
      anchor = event.composedPath().find((node) => node?.nodeType === 1
        && node.localName === 'a' && node.hasAttribute('href'));
    } catch { return; }
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (typeof href !== 'string' || !href.trim() || href.trim().startsWith('#')) return;
    let external;
    try { external = new URL(href, document.baseURI || entry.href); }
    catch { return; }
    if (!EXTERNAL_PROTOCOLS.has(external.protocol) || external.username || external.password
      || external.origin === entry.origin) return;
    event.preventDefault();
    try { ipcRenderer.send('easymd:open-external', external.href); }
    catch { /* The main process may already be shutting down. */ }
  }, true);
}
