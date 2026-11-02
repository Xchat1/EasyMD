import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const mainPreload = readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
const previewPreload = readFileSync(new URL('../desktop/preview-preload.cjs', import.meta.url), 'utf8');

function harness(options = {}) {
  const { url = 'http://127.0.0.1:5173/', sendError, syncError, invokeError, baseURI = url } = options;
  const isMainFrame = Object.hasOwn(options, 'isMainFrame') ? options.isMainFrame : true;
  const reply = Object.hasOwn(options, 'reply') ? options.reply : true;
  const invokeReply = Object.hasOwn(options, 'invokeReply') ? options.invokeReply : null;
  const navigator = Object.hasOwn(options, 'navigator') ? options.navigator : { userActivation: { isActive: true } };
  const bridges = [], listeners = [], asyncCalls = [], syncCalls = [], invokeCalls = [], imports = [];
  const ipcListeners = new Map(), onCalls = [], removeListenerCalls = [];
  const transport = { sendError };
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
          send: (...args) => { asyncCalls.push(args); if (transport.sendError) throw transport.sendError; },
          invoke: async (...args) => { invokeCalls.push(args); if (invokeError) throw invokeError; return invokeReply; },
          on: (channel, listener) => {
            onCalls.push([channel, listener]);
            if (!ipcListeners.has(channel)) ipcListeners.set(channel, new Set());
            ipcListeners.get(channel).add(listener);
          },
          removeListener: (channel, listener) => {
            removeListenerCalls.push([channel, listener]);
            ipcListeners.get(channel)?.delete(listener);
          },
        },
      };
    },
  });
  new vm.Script(mainPreload, { filename: 'desktop/preload.cjs' }).runInContext(context);
  const emitIpc = (channel, ...args) => {
    for (const listener of [...(ipcListeners.get(channel) || [])]) listener(...args);
  };
  return { bridges, listeners, asyncCalls, syncCalls, invokeCalls, onCalls, removeListenerCalls,
    ipcListeners, emitIpc, imports, transport, window, process, document, navigator };
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

test('preload exposes only the frozen fixed desktop operations on main app entry pages', () => {
  for (const url of ['http://127.0.0.1:5173/', 'http://127.0.0.1:41821/index.html', 'http://127.0.0.1:5173/#section?part']) {
    const app = harness({ url });
    assert.deepEqual(app.imports, ['electron']);
    assert.equal(app.bridges.length, 1);
    assert.equal(app.bridges[0].name, 'easymdDesktop');
    assert.deepEqual(Object.keys(app.bridges[0].api), ['preparePreview', 'openFile', 'onOpenFile']);
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

test('openFile invokes only the fixed native chooser without forwarding paths, channels or options', async () => {
  const document = { fileName: '本地文稿.md', content: '# 本地文稿\n正文', workspacePath: '本地文稿.md' };
  const app = harness({ invokeReply: document });
  const result = await app.bridges[0].api.openFile('arbitrary-channel', '/private/secret.md', { write: true });
  assert.deepEqual({ ...result }, document);
  assert.deepEqual(app.invokeCalls, [['easymd:open-file']]);
  assert.deepEqual(app.asyncCalls, []);
  assert.deepEqual(app.syncCalls, []);
  assert.deepEqual(app.onCalls, []);
  const canceled = harness({ invokeReply: null });
  assert.equal(await canceled.bridges[0].api.openFile(), null);
  assert.deepEqual(canceled.invokeCalls, [['easymd:open-file']]);
});

test('openFile rejects missing native user activation before contacting IPC', async () => {
  const blocked = [
    undefined, null, {}, { userActivation: undefined }, { userActivation: null },
    { userActivation: {} }, { userActivation: { isActive: false } },
    { userActivation: { isActive: 1 } }, { userActivation: { isActive: 'true' } },
    { get userActivation() { throw new Error('unavailable activation'); } },
    { userActivation: { get isActive() { throw new Error('unavailable state'); } } },
  ];
  for (const navigator of blocked) {
    const app = harness({ navigator });
    await assert.rejects(async () => app.bridges[0].api.openFile(), error => ['Error', 'TypeError'].includes(error?.name));
    assert.deepEqual(app.invokeCalls, []);
    assert.deepEqual(app.asyncCalls, []);
  }
  const app = harness();
  app.navigator.userActivation.isActive = false;
  await assert.rejects(async () => app.bridges[0].api.openFile(), error => error?.name === 'Error');
  assert.deepEqual(app.invokeCalls, []);
});

test('openFile rechecks the current document and frame instead of trusting an earlier bridge reference', async () => {
  for (const url of ['https://example.test/', 'http://127.0.0.1:5173/preview.html', 'http://127.0.0.1:5173/?query=1', 'about:blank']) {
    const app = harness();
    app.window.location.href = url;
    await assert.rejects(async () => app.bridges[0].api.openFile(), error => error?.name === 'Error');
    assert.deepEqual(app.invokeCalls, [], url);
  }
  const app = harness();
  app.process.isMainFrame = false;
  await assert.rejects(async () => app.bridges[0].api.openFile(), error => error?.name === 'Error');
  assert.deepEqual(app.invokeCalls, []);
});

test('openFile reports native IPC failure without retrying or opening another operation', async () => {
  const failure = new Error('本地文件无法读取');
  const app = harness({ invokeError: failure });
  await assert.rejects(() => app.bridges[0].api.openFile(), /本地文件无法读取/);
  assert.deepEqual(app.invokeCalls, [['easymd:open-file']]);
  assert.deepEqual(app.asyncCalls, []);
  assert.deepEqual(app.syncCalls, []);
  assert.deepEqual(app.onCalls, []);
});

test('onOpenFile accepts OS-delivered documents without activation and exposes one bounded data argument', () => {
  const app = harness({ navigator: { userActivation: { isActive: false } } });
  const received = [];
  const cleanup = app.bridges[0].api.onOpenFile((...args) => received.push(args), 'arbitrary-channel');
  assert.equal(typeof cleanup, 'function');
  assert.deepEqual(app.onCalls.map(([channel]) => channel), ['easymd:opened-file']);
  assert.deepEqual(app.asyncCalls, [['easymd:open-files-ready']]);
  assert.deepEqual(app.invokeCalls, []);
  const event = { sender: { privileged: true }, secret: 'must not cross bridge' };
  const payload = { fileName: '会议.md', content: '# 会议', workspacePath: '会议.md', filePath: '/private/会议.md', channel: 'arbitrary-channel' };
  app.emitIpc('arbitrary-channel', event, payload);
  assert.equal(received.length, 0);
  app.emitIpc('easymd:opened-file', event, payload, 'extra IPC argument');
  assert.equal(received.length, 1);
  assert.equal(received[0].length, 1);
  assert.deepEqual({ ...received[0][0] }, { fileName: '会议.md', content: '# 会议', workspacePath: '会议.md' });
  assert.notEqual(received[0][0], event);
  app.emitIpc('easymd:opened-file', event, { fileName: '空白.md', content: '' });
  assert.equal(received.length, 2);
  assert.deepEqual({ ...received[1][0] }, { fileName: '空白.md', content: '' });
  cleanup();
});

test('onOpenFile unregisters its exact listener and notifies native code once when cleaned up', () => {
  const app = harness();
  let deliveries = 0;
  const cleanup = app.bridges[0].api.onOpenFile(() => deliveries++);
  const [channel, handler] = app.onCalls[0];
  app.emitIpc(channel, {}, { fileName: 'first.md', content: 'first' });
  assert.equal(deliveries, 1);
  cleanup();
  assert.deepEqual(app.removeListenerCalls, [[channel, handler]]);
  assert.deepEqual(app.asyncCalls, [['easymd:open-files-ready'], ['easymd:open-files-not-ready']]);
  app.emitIpc(channel, {}, { fileName: 'after-cleanup.md', content: 'ignored' });
  handler({}, { fileName: 'already-queued.md', content: 'ignored too' });
  assert.equal(deliveries, 1);
  cleanup();
  assert.equal(app.removeListenerCalls.length, 1);
  assert.equal(app.asyncCalls.length, 2);
});

test('onOpenFile rejects non-functions and bridge references used outside the trusted app entry', () => {
  for (const callback of [undefined, null, 'arbitrary-channel', {}, 1]) {
    const app = harness();
    assert.throws(() => app.bridges[0].api.onOpenFile(callback), error => error?.name === 'TypeError');
    assert.deepEqual(app.onCalls, []);
    assert.deepEqual(app.asyncCalls, []);
  }
  for (const url of ['https://example.test/', 'http://127.0.0.1:5173/preview.html', 'http://127.0.0.1:5173/?query=1']) {
    const app = harness();
    app.window.location.href = url;
    assert.throws(() => app.bridges[0].api.onOpenFile(() => {}), error => error?.name === 'TypeError');
    assert.deepEqual(app.onCalls, []);
    assert.deepEqual(app.asyncCalls, []);
  }
  const app = harness();
  app.process.isMainFrame = false;
  assert.throws(() => app.bridges[0].api.onOpenFile(() => {}), error => error?.name === 'TypeError');
  assert.deepEqual(app.onCalls, []);
  assert.deepEqual(app.asyncCalls, []);
});

test('onOpenFile stops delivering when the document or frame ceases to be trusted', () => {
  for (const mutate of [
    app => { app.window.location.href = 'https://example.test/'; },
    app => { app.window.location.href = 'http://127.0.0.1:5173/preview.html'; },
    app => { app.process.isMainFrame = false; },
  ]) {
    const app = harness();
    const received = [];
    const cleanup = app.bridges[0].api.onOpenFile(value => received.push(value));
    mutate(app);
    app.emitIpc('easymd:opened-file', {}, { fileName: 'private.md', content: 'private' });
    assert.equal(received.length, 0);
    cleanup();
    assert.equal(app.removeListenerCalls.length, 1);
  }
});

test('onOpenFile ignores malformed native messages and omits non-string workspace paths', () => {
  const app = harness();
  const received = [];
  const cleanup = app.bridges[0].api.onOpenFile(value => received.push(value));
  for (const payload of [undefined, null, 'arbitrary-channel', {}, { fileName: 'a.md' },
    { content: '# a' }, { fileName: 1, content: '# a' }, { fileName: 'a.md', content: 1 }]) {
    app.emitIpc('easymd:opened-file', { sender: 'private' }, payload);
  }
  assert.deepEqual(received, []);
  for (const workspacePath of [undefined, null, 1, {}, ['a.md']]) {
    app.emitIpc('easymd:opened-file', {}, { fileName: 'a.md', content: '# a', workspacePath });
  }
  assert.equal(received.length, 5);
  for (const payload of received) assert.deepEqual({ ...payload }, { fileName: 'a.md', content: '# a' });
  cleanup();
});

test('onOpenFile rolls back a listener if readiness IPC fails and ignores queued delivery', () => {
  const app = harness({ sendError: new Error('window is closing') });
  let deliveries = 0;
  assert.throws(() => app.bridges[0].api.onOpenFile(() => deliveries++), /window is closing/);
  assert.equal(app.onCalls.length, 1);
  const [channel, handler] = app.onCalls[0];
  assert.deepEqual(app.removeListenerCalls, [[channel, handler]]);
  assert.deepEqual(app.asyncCalls, [['easymd:open-files-ready']]);
  app.emitIpc(channel, {}, { fileName: 'closed.md', content: 'ignored' });
  handler({}, { fileName: 'already-queued.md', content: 'ignored' });
  assert.equal(deliveries, 0);
});

test('onOpenFile cleanup remains safe when the native process no longer accepts messages', () => {
  const app = harness();
  let deliveries = 0;
  const cleanup = app.bridges[0].api.onOpenFile(() => deliveries++);
  // Change only transport behavior after a successful subscription, as happens
  // when a React cleanup runs during native window shutdown.
  app.transport.sendError = new Error('window is closing');
  assert.doesNotThrow(cleanup);
  assert.equal(app.removeListenerCalls.length, 1);
  assert.deepEqual(app.asyncCalls, [['easymd:open-files-ready'], ['easymd:open-files-not-ready']]);
  app.onCalls[0][1]({}, { fileName: 'closed.md', content: 'ignored' });
  assert.equal(deliveries, 0);
  assert.doesNotThrow(cleanup);
  assert.equal(app.asyncCalls.length, 2);
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
