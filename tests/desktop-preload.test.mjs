import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const mainPreload = readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
const previewPreload = readFileSync(new URL('../desktop/preview-preload.cjs', import.meta.url), 'utf8');

function harness(options = {}) {
  const { url = 'http://127.0.0.1:5173/', sendError, syncError, baseURI = url } = options;
  const isMainFrame = Object.hasOwn(options, 'isMainFrame') ? options.isMainFrame : true;
  const reply = Object.hasOwn(options, 'reply') ? options.reply : true;
  const navigator = Object.hasOwn(options, 'navigator') ? options.navigator : { userActivation: { isActive: true } };
  const bridges = [], listeners = [], asyncCalls = [], syncCalls = [], imports = [];
  const window = { location: { href: url } };
  const process = { isMainFrame };
  const document = { baseURI, addEventListener: (...args) => listeners.push(args) };
  const context = vm.createContext({
    URL, window, process, document, navigator,
    require(name) {
      imports.push(name);
      assert.equal(name, 'electron');
      return {
        contextBridge: { exposeInMainWorld: (name, api) => bridges.push({ name, api }) },
        ipcRenderer: {
          sendSync: (...args) => { syncCalls.push(args); if (syncError) throw syncError; return reply; },
          send: (...args) => { asyncCalls.push(args); if (sendError) throw sendError; },
        },
      };
    },
  });
  new vm.Script(mainPreload, { filename: 'desktop/preload.cjs' }).runInContext(context);
  return { bridges, listeners, asyncCalls, syncCalls, imports, window, process, document, navigator };
}

function anchor(href, extra = {}) {
  return { nodeType: 1, localName: 'a', hasAttribute: name => name === 'href', getAttribute: name => name === 'href' ? href : null, ...extra };
}

function click(target, extra = {}) {
  let prevented = false;
  const event = {
    isTrusted: true, button: 0, defaultPrevented: false,
    composedPath: () => [target],
    preventDefault() { prevented = true; },
    ...extra,
  };
  return { event, wasPrevented: () => prevented };
}

test('preload exposes only the frozen fixed preparePreview operation on main app entry pages', () => {
  for (const url of ['http://127.0.0.1:5173/', 'http://127.0.0.1:41821/index.html', 'http://127.0.0.1:5173/#section?part']) {
    const app = harness({ url });
    assert.deepEqual(app.imports, ['electron']);
    assert.equal(app.bridges.length, 1);
    assert.equal(app.bridges[0].name, 'easymdDesktop');
    assert.deepEqual(Object.keys(app.bridges[0].api), ['preparePreview']);
    assert.equal(Object.isFrozen(app.bridges[0].api), true);
    assert.equal(app.bridges[0].api.preparePreview('untrusted-channel', { arbitrary: true }), true);
    assert.deepEqual(app.syncCalls, [['easymd:prepare-preview']]);
    assert.equal(app.listeners.length, 1);
    assert.equal(app.listeners[0][0], 'click');
    assert.equal(app.listeners[0][2], true);
  }
});

test('subframes, unsupported origins, paths, credentials and queries never receive the main bridge or click handler', () => {
  const blocked = [
    'about:blank', 'about:srcdoc', 'file:///index.html', 'data:text/html,preview',
    'https://127.0.0.1:5173/', 'http://localhost:5173/', 'http://[::1]:5173/',
    'http://127.0.0.1.example.test:5173/', 'https://example.test/',
    'http://user@127.0.0.1:5173/', 'http://user:password@127.0.0.1:5173/',
    'http://127.0.0.1:5173/preview.html', 'http://127.0.0.1:5173/nested/index.html',
    'http://127.0.0.1:5173/?query=1', 'http://127.0.0.1:5173/index.html?',
    'not a URL',
  ];
  for (const url of blocked) {
    const app = harness({ url });
    assert.equal(app.bridges.length, 0, url);
    assert.equal(app.listeners.length, 0, url);
  }
  for (const isMainFrame of [false, undefined, 1]) {
    const app = harness({ isMainFrame });
    assert.equal(app.bridges.length, 0);
    assert.equal(app.listeners.length, 0);
  }
});

test('preparePreview fails closed for IPC errors, non-boolean replies and a changed document', () => {
  for (const reply of [false, undefined, null, 1, 'true', {}]) {
    const app = harness({ reply });
    assert.equal(app.bridges[0].api.preparePreview(), false);
  }
  const failed = harness({ syncError: new Error('closed') });
  assert.equal(failed.bridges[0].api.preparePreview(), false);
  const changed = harness();
  changed.window.location.href = 'https://example.test/';
  assert.equal(changed.bridges[0].api.preparePreview(), false);
  assert.equal(changed.syncCalls.length, 0);
  const subframe = harness();
  subframe.process.isMainFrame = false;
  assert.equal(subframe.bridges[0].api.preparePreview(), false);
  assert.equal(subframe.syncCalls.length, 0);
});

test('preparePreview requires live native user activation and never contacts IPC for missing or invalid activation', () => {
  const blocked = [
    undefined, null, {}, { userActivation: undefined }, { userActivation: null },
    { userActivation: {} }, { userActivation: { isActive: false } },
    { userActivation: { isActive: 1 } }, { userActivation: { isActive: 'true' } },
    { get userActivation() { throw new Error('unavailable activation'); } },
    { userActivation: { get isActive() { throw new Error('unavailable state'); } } },
  ];
  for (const navigator of blocked) {
    const app = harness({ navigator });
    assert.equal(app.bridges[0].api.preparePreview(), false);
    assert.equal(app.syncCalls.length, 0);
  }
  const app = harness();
  assert.equal(app.bridges[0].api.preparePreview(), true);
  app.navigator.userActivation.isActive = false;
  assert.equal(app.bridges[0].api.preparePreview(), false);
  assert.deepEqual(app.syncCalls, [['easymd:prepare-preview']]);
});

test('only native left-button anchor clicks send normalized external HTTP(S) or mailto URLs', () => {
  for (const [href, normalized] of [
    ['https://example.test/article', 'https://example.test/article'],
    ['http://example.test', 'http://example.test/'],
    ['//example.test/news', 'http://example.test/news'],
    ['mailto:person@example.test?subject=Demo', 'mailto:person@example.test?subject=Demo'],
  ]) {
    const app = harness();
    const link = anchor(href);
    const action = click(link, { composedPath: () => [{ nodeType: 1, localName: 'span' }, link, app.document] });
    app.listeners[0][1](action.event);
    assert.equal(action.wasPrevented(), true, href);
    assert.deepEqual(app.asyncCalls, [['easymd:open-external', normalized]]);
    assert.equal(app.syncCalls.length, 0);
  }
});

test('synthetic clicks, other buttons, canceled events and non-anchors cannot open an external application', () => {
  const actions = [
    click(anchor('https://example.test/'), { isTrusted: false }),
    click(anchor('https://example.test/'), { isTrusted: 1 }),
    click(anchor('https://example.test/'), { button: 1 }),
    click(anchor('https://example.test/'), { button: 2 }),
    click(anchor('https://example.test/'), { defaultPrevented: true }),
    click({ nodeType: 1, localName: 'area', hasAttribute: () => true, getAttribute: () => 'https://example.test/' }),
    click(anchor('https://example.test/', { hasAttribute: () => false })),
    click(anchor('https://example.test/'), { composedPath: () => { throw new Error('invalid event'); } }),
  ];
  for (const action of actions) {
    const app = harness();
    assert.doesNotThrow(() => app.listeners[0][1](action.event));
    assert.equal(action.wasPrevented(), false);
    assert.equal(app.asyncCalls.length, 0);
  }
});

test('hashes, same-origin links, blob downloads, unsupported schemes and URLs with credentials are left alone', () => {
  for (const href of [
    '#heading', ' #heading ', '/index.html#heading', '/download.md', 'http://127.0.0.1:5173/',
    'blob:http://127.0.0.1:5173/fixture', 'javascript:alert(1)', 'data:text/html,demo',
    'file:///private/demo.md', 'easymd://open', 'ftp://example.test/file',
    'https://user@example.test/', 'https://user:password@example.test/', '', null,
  ]) {
    const app = harness();
    const action = click(anchor(href));
    app.listeners[0][1](action.event);
    assert.equal(action.wasPrevented(), false, String(href));
    assert.equal(app.asyncCalls.length, 0, String(href));
  }
});

test('external links follow the document base without trusting it as an IPC destination origin', () => {
  const app = harness({ baseURI: 'https://example.test/docs/' });
  const action = click(anchor('article'));
  app.listeners[0][1](action.event);
  assert.equal(action.wasPrevented(), true);
  assert.deepEqual(app.asyncCalls, [['easymd:open-external', 'https://example.test/docs/article']]);
  app.window.location.href = 'http://127.0.0.1:5173/preview.html';
  const changed = click(anchor('https://example.test/'));
  app.listeners[0][1](changed.event);
  assert.equal(changed.wasPrevented(), false);
  assert.equal(app.asyncCalls.length, 1);
});

test('shutdown errors cannot escape the click handler, and preview preload exposes no API at all', () => {
  const app = harness({ sendError: new Error('closed') });
  const action = click(anchor('https://example.test/'));
  assert.doesNotThrow(() => app.listeners[0][1](action.event));
  assert.equal(action.wasPrevented(), true);
  new vm.Script(previewPreload, { filename: 'desktop/preview-preload.cjs' }).runInNewContext({});
  assert.equal(previewPreload.trim(), "'use strict';");
});
