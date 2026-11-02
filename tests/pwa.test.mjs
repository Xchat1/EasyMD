import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { generatePwa } from '../scripts/release-artifacts.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'easymd-pwa-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const files = {
    'index.html': '<script src="./assets/main-hash.js"></script>',
    'assets/main-hash.js': 'import("./diagram-hash.js")',
    'assets/diagram-hash.js': 'export default "diagram"',
    'assets/style-hash.css': '@font-face { src: url(./math-hash.woff2); }',
    'assets/math-hash.woff2': 'font',
    'manifest.json': JSON.stringify({ start_url: '/', id: '/', icons: [{ src: '/icon.png' }] }),
    'icon.png': 'icon',
    'THIRD_PARTY_NOTICES.md': 'licenses',
  };
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true });
    await writeFile(path.join(directory, name), content);
  }
  await generatePwa(directory);
  return { directory, files, source: await readFile(path.join(directory, 'sw.js'), 'utf8') };
}

function worker(source, scope = 'https://example.test/editor/', initialCaches = []) {
  const handlers = {};
  const stores = new Map(initialCaches.map((name) => [name, new Map()]));
  let claimed = false;
  let online = true;
  const fetches = [];
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async addAll(urls) {
          for (const url of urls) {
            // Vite preview sends Vary: Origin even when the install request has
            // no Origin header. Model both stored requests and response headers.
            store.set(url, {
              requestHeaders: new Headers(),
              response: { url, body: `cached:${url}`, headers: new Headers({ Vary: 'Origin' }) },
            });
          }
        },
        async match(request, options = {}) {
          const stored = store.get(typeof request === 'string' ? request : request.url);
          if (!stored) return undefined;
          if (!options.ignoreVary) {
            const headers = typeof request === 'string' ? new Headers() : request.headers;
            const variedHeaders = stored.response.headers.get('Vary')?.split(',').map((name) => name.trim()) || [];
            if (variedHeaders.some((name) => name === '*' || headers.get(name) !== stored.requestHeaders.get(name))) return undefined;
          }
          return stored.response;
        },
      };
    },
  };
  vm.runInNewContext(source, {
    URL, Set, caches,
    self: {
      registration: { scope },
      addEventListener(type, handler) { handlers[type] = handler; },
      clients: { async claim() { claimed = true; } },
    },
    async fetch(request) {
      fetches.push(request.url);
      if (!online) throw new Error('offline');
      return { url: request.url };
    },
  });
  return {
    stores, fetches,
    get claimed() { return claimed; },
    offline() { online = false; },
    async lifecycle(type) {
      let pending;
      handlers[type]({ waitUntil(promise) { pending = promise; } });
      await pending;
    },
    async request(url, mode = 'cors', headers = {}) {
      let response;
      handlers.fetch({ request: { url, method: 'GET', mode, headers: new Headers(headers) }, respondWith(promise) { response = promise; } });
      return response;
    },
    async matchWithDefaultVary(url, headers) {
      const currentCache = [...stores.keys()].find((name) => name.startsWith('easymd-'));
      return (await caches.open(currentCache)).match({ url, headers: new Headers(headers) });
    },
  };
}

test('first installation precaches the entire build and starts offline under a base path', async (t) => {
  const { source, files, directory } = await fixture(t);
  assert(!source.includes('__EASYMD_'));
  const sw = worker(source);
  await sw.lifecycle('install');
  await sw.lifecycle('activate');
  assert.equal(sw.claimed, true);
  sw.offline();
  const document = await sw.request('https://example.test/editor/', 'navigate');
  assert.equal(document.url, 'https://example.test/editor/index.html');
  for (const name of Object.keys(files)) {
    const response = await sw.request(`https://example.test/editor/${name}`);
    assert.equal(response?.url, `https://example.test/editor/${name}`, `${name} must be available offline`);
  }
  assert.equal(sw.fetches.length, 0);
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.icons[0].src, './icon.png');
});

test('activation removes only older caches belonging to the same application scope', async (t) => {
  const { source } = await fixture(t);
  const sw = worker(source, 'https://example.test/editor/', [
    'easymd-%2Feditor%2F-old', 'easymd-%2Fother%2F-old', 'another-app-cache', 'easymd-cache-v1',
  ]);
  await sw.lifecycle('install');
  await sw.lifecycle('activate');
  assert.equal(sw.stores.has('easymd-%2Feditor%2F-old'), false);
  assert.equal(sw.stores.has('easymd-%2Fother%2F-old'), true);
  assert.equal(sw.stores.has('another-app-cache'), true);
  assert.equal(sw.stores.has('easymd-cache-v1'), true);
});

test('external resources and other same-origin applications are left to the browser', async (t) => {
  const { source } = await fixture(t);
  const sw = worker(source);
  assert.equal(await sw.request('https://images.example/picture.png'), undefined);
  assert.equal(await sw.request('https://example.test/other/', 'navigate'), undefined);
  assert.equal(await sw.request('https://example.test/editor/user-content.html'), undefined);
});

test('navigation serves a known static license file and leaves unrelated pages alone', async (t) => {
  const { source } = await fixture(t);
  const sw = worker(source);
  await sw.lifecycle('install');
  await sw.lifecycle('activate');
  sw.offline();
  const licenseUrl = 'https://example.test/editor/THIRD_PARTY_NOTICES.md';
  assert.equal((await sw.request(licenseUrl, 'navigate'))?.url, licenseUrl);
  assert.equal(await sw.request('https://example.test/editor/help.html', 'navigate'), undefined);
  assert.equal((await sw.request('https://example.test/editor/?launch=pwa', 'navigate'))?.url,
    'https://example.test/editor/index.html');
});

test('a root-scoped worker does not replace another application with the editor', async (t) => {
  const { source } = await fixture(t);
  const sw = worker(source, 'https://example.test/');
  await sw.lifecycle('install');
  await sw.lifecycle('activate');
  assert.equal(await sw.request('https://example.test/another-app/', 'navigate'), undefined);
});

test('crossorigin script, stylesheet and font requests use static precache despite Vary: Origin', async (t) => {
  const { source } = await fixture(t);
  const sw = worker(source);
  await sw.lifecycle('install');
  await sw.lifecycle('activate');
  sw.offline();
  const headers = { Origin: 'https://example.test' };
  for (const name of ['main-hash.js', 'diagram-hash.js', 'style-hash.css', 'math-hash.woff2']) {
    const url = `https://example.test/editor/assets/${name}`;
    // Establish the differing Origin really is a cache miss under default
    // Cache.match semantics, then exercise the installed worker's fetch path.
    assert.equal(await sw.matchWithDefaultVary(url, headers), undefined);
    assert.equal((await sw.request(url, 'cors', headers))?.url, url);
  }
  assert.equal(sw.fetches.length, 0);
  assert.equal(await sw.request('https://example.test/editor/api/document', 'cors', headers), undefined);
  assert.equal(await sw.request('https://other.test/assets/main-hash.js', 'cors', headers), undefined);
});

test('content changes invalidate the worker even when asset filenames do not change', async (t) => {
  const { source, directory } = await fixture(t);
  await writeFile(path.join(directory, 'index.html'), '<main>new release</main>');
  await generatePwa(directory);
  const updated = await readFile(path.join(directory, 'sw.js'), 'utf8');
  assert.notEqual(source.match(/BUILD_VERSION = '([^']+)'/)[1], updated.match(/BUILD_VERSION = '([^']+)'/)[1]);
});

test('a worker-only fix receives a separate cache version with identical app assets', async (t) => {
  const { directory, files } = await fixture(t);
  const templateDirectory = await mkdtemp(path.join(tmpdir(), 'easymd-worker-template-'));
  t.after(() => rm(templateDirectory, { recursive: true, force: true }));
  const templatePath = path.join(templateDirectory, 'sw.js');
  const template = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  await writeFile(templatePath, template);
  await generatePwa(directory, { templatePath });
  const previous = await readFile(path.join(directory, 'sw.js'), 'utf8');
  await writeFile(templatePath, `${template}\n// Updated cache handling.\n`);
  const assets = await generatePwa(directory, { templatePath });
  const updated = await readFile(path.join(directory, 'sw.js'), 'utf8');
  assert.deepEqual(assets, Object.keys(files).sort());
  assert.notEqual(previous.match(/BUILD_VERSION = '([^']+)'/)[1], updated.match(/BUILD_VERSION = '([^']+)'/)[1]);
});
