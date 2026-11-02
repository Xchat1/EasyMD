'use strict';

// Apply these settings to the editor and every independently created preview.
// A preload, if needed, is supplied separately by the main process.
const SECURE_WEB_PREFERENCES = Object.freeze({
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
});

const DENY_WINDOW = Object.freeze({ action: 'deny' });
const ALLOW_WINDOW = Object.freeze({ action: 'allow' });
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', 'localhost']);

function parseUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  try { return new URL(value); } catch { return null; }
}

/** The caller supplies frame and gesture facts from native events or a checked
 * main-frame IPC sender, never from the renderer's request body or tab URL. */
function createDesktopSecurityPolicy(expectedOrigin) {
  const base = parseUrl(expectedOrigin);
  if (!base || !['http:', 'https:'].includes(base.protocol) || !LOOPBACK_HOSTS.has(base.hostname)
    || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new TypeError('The desktop editor requires an exact HTTP(S) loopback origin.');
  }
  const origin = base.origin;

  function isAppDocument(value) {
    const url = parseUrl(value);
    return !!url && url.origin === origin && !url.username && !url.password && !url.search
      && (url.pathname === '/' || url.pathname === '/index.html');
  }

  function trustedUserAction({ sourceUrl, isMainFrame, userGesture } = {}) {
    return isMainFrame === true && userGesture === true && isAppDocument(sourceUrl);
  }

  function isAppNavigation({ url, isMainFrame } = {}) {
    return isMainFrame === true && isAppDocument(url);
  }

  function externalUrlToOpen(request = {}) {
    if (!trustedUserAction(request)) return null;
    const url = parseUrl(request.url);
    if (!url || !EXTERNAL_PROTOCOLS.has(url.protocol) || url.username || url.password) return null;
    // An unsupported local route must not escape the navigation policy by
    // being treated as an external link instead.
    if (url.origin === origin) return null;
    return url.href;
  }

  function windowOpenDecision(request = {}) {
    if (!trustedUserAction(request) || !['_blank', ''].includes(request.frameName)) return DENY_WINDOW;
    // Chromium can report the special _blank target as an empty frame name.
    // Named targets are never reused for trusted or untrusted documents.
    if (request.url === '' || request.url === 'about:blank') return ALLOW_WINDOW;
    const externalUrl = externalUrlToOpen(request);
    return externalUrl ? { action: 'deny', externalUrl } : DENY_WINDOW;
  }

  function allowPermission({ permission, requestingUrl, isMainFrame } = {}) {
    return permission === 'clipboard-sanitized-write' && isMainFrame === true && isAppDocument(requestingUrl);
  }

  return Object.freeze({ origin, isAppNavigation, externalUrlToOpen, windowOpenDecision, allowPermission });
}

module.exports = { SECURE_WEB_PREFERENCES, createDesktopSecurityPolicy };
