import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { SECURE_WEB_PREFERENCES, createDesktopSecurityPolicy } = require('../desktop/security.cjs');
const origin = 'http://127.0.0.1:57843';
const policy = createDesktopSecurityPolicy(origin);
const action = { sourceUrl: `${origin}/`, isMainFrame: true, userGesture: true };

test('desktop web preferences isolate Node and keep browser security enabled', () => {
  assert.deepEqual(SECURE_WEB_PREFERENCES, {
    nodeIntegration: false, contextIsolation: true, sandbox: true,
    webSecurity: true, allowRunningInsecureContent: false, webviewTag: false,
  });
  assert.ok(Object.isFrozen(SECURE_WEB_PREFERENCES));
  assert.equal('preload' in SECURE_WEB_PREFERENCES, false);
});

test('desktop security policy accepts only a local HTTP(S) origin without credentials or paths', () => {
  for (const value of ['https://example.test', 'file:///app/index.html', 'about:blank', `${origin}/other`, `${origin}/?token=anything`, `${origin}/#hash`, 'http://user:password@127.0.0.1:57843', undefined, {}]) {
    assert.throws(() => createDesktopSecurityPolicy(value), TypeError);
  }
  assert.equal(createDesktopSecurityPolicy(`${origin}/`).origin, origin);
  assert.equal(createDesktopSecurityPolicy('http://[::1]:57843').origin, 'http://[::1]:57843');
  assert.ok(Object.isFrozen(policy));
});

test('only root and index document navigation on the exact main origin is accepted', () => {
  for (const url of [origin, `${origin}/`, `${origin}/index.html`, `${origin}/#section`, `${origin}/index.html#section`]) {
    assert.equal(policy.isAppNavigation({ url, isMainFrame: true }), true, url);
  }
  for (const url of ['http://127.0.0.1:57844/', 'http://localhost:57843/', 'https://127.0.0.1:57843/', 'https://example.test/', `${origin}/api/session`, `${origin}/page.html`, `${origin}/%69ndex.html`, `${origin}/?query=x`, 'file:///index.html', 'about:blank', 'javascript:alert(1)', 'data:text/html,hello']) {
    assert.equal(policy.isAppNavigation({ url, isMainFrame: true }), false, url);
  }
  for (const isMainFrame of [false, undefined, 'true', 1]) assert.equal(policy.isAppNavigation({ url: `${origin}/`, isMainFrame }), false);
  assert.equal(policy.isAppNavigation(), false);
});

test('system-browser links require a native-verified main-frame user action', () => {
  for (const [url, expected] of [
    ['https://example.test', 'https://example.test/'],
    ['http://example.test/path?q=x#section', 'http://example.test/path?q=x#section'],
    ['mailto:person@example.test?subject=Demo', 'mailto:person@example.test?subject=Demo'],
  ]) assert.equal(policy.externalUrlToOpen({ ...action, url }), expected);
  for (const changed of [{ isMainFrame: false }, { isMainFrame: undefined }, { userGesture: false }, { userGesture: undefined }, { sourceUrl: 'about:srcdoc' }, { sourceUrl: 'https://example.test/' }, { sourceUrl: `${origin}/untrusted.html` }]) {
    assert.equal(policy.externalUrlToOpen({ ...action, ...changed, url: 'https://example.test/' }), null);
  }
  assert.equal(policy.externalUrlToOpen({ url: 'https://example.test/' }), null);
});

test('external opening rejects dangerous schemes, credentials and local application routes', () => {
  for (const url of [
    'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hello', 'blob:https://example.test/demo',
    'vscode://file/etc/passwd', 'custom://run', 'tel:12345', '//example.test/',
    'http://user:password@example.test/', `${origin}/`, `${origin}/api/session`, '', null,
  ]) assert.equal(policy.externalUrlToOpen({ ...action, url }), null, String(url));
});

test('only trusted main-frame blank preview popups are created in the app', () => {
  for (const url of ['', 'about:blank']) {
    for (const frameName of ['_blank', '']) assert.deepEqual(policy.windowOpenDecision({ ...action, url, frameName }), { action: 'allow' });
  }
  for (const changed of [
    { isMainFrame: false }, { isMainFrame: undefined }, { userGesture: false }, { userGesture: undefined },
    { sourceUrl: 'about:srcdoc' }, { sourceUrl: 'about:blank' }, { sourceUrl: 'https://example.test/' },
    { frameName: '_top' }, { frameName: '_self' }, { frameName: 'named-preview' }, { frameName: undefined },
  ]) assert.deepEqual(policy.windowOpenDecision({ ...action, url: 'about:blank', frameName: '_blank', ...changed }), { action: 'deny' });
  for (const url of [`${origin}/`, `${origin}/index.html`, 'about:srcdoc', 'about:blank#extra', 'file:///tmp/a.html', 'data:text/html,hi', 'javascript:alert(1)']) {
    assert.deepEqual(policy.windowOpenDecision({ ...action, url, frameName: '_blank' }), { action: 'deny' });
  }
  assert.deepEqual(policy.windowOpenDecision(), { action: 'deny' });
});

test('a trusted external popup request is denied in-app and yields only a checked browser URL', () => {
  assert.deepEqual(policy.windowOpenDecision({ ...action, url: 'https://example.test', frameName: '_blank' }), { action: 'deny', externalUrl: 'https://example.test/' });
  assert.deepEqual(policy.windowOpenDecision({ ...action, isMainFrame: false, url: 'https://example.test/', frameName: '_blank' }), { action: 'deny' });
  assert.deepEqual(policy.windowOpenDecision({ ...action, url: 'https://example.test/', frameName: 'unknown-target' }), { action: 'deny' });
});

test('permission checks use requesting-frame facts and grant only sanitized clipboard writes', () => {
  const request = { permission: 'clipboard-sanitized-write', requestingUrl: `${origin}/`, isMainFrame: true };
  assert.equal(policy.allowPermission(request), true);
  assert.equal(policy.allowPermission({ ...request, requestingUrl: `${origin}/index.html#section` }), true);
  for (const changed of [
    { isMainFrame: false }, { isMainFrame: undefined }, { isMainFrame: 'true' }, { requestingUrl: undefined },
    { requestingUrl: 'null' }, { requestingUrl: 'about:blank' }, { requestingUrl: 'about:srcdoc' },
    { requestingUrl: 'https://example.test/' }, { requestingUrl: 'http://localhost:57843/' },
    { requestingUrl: `${origin}/untrusted.html` }, { requestingUrl: 'http://127.0.0.1:57844/' },
  ]) assert.equal(policy.allowPermission({ ...request, ...changed }), false);
  for (const permission of ['clipboard-read', 'clipboard-write', 'media', 'camera', 'microphone', 'geolocation', 'notifications', 'fileSystem', 'file-system', 'midi', 'fullscreen', undefined]) {
    assert.equal(policy.allowPermission({ ...request, permission }), false, String(permission));
  }
  assert.equal(policy.allowPermission(), false);
});

function desktopBuildDependencies() {
  // Resolve through the consumer, so pnpm's actual transitive graph is tested.
  const cliRequire = createRequire(require.resolve('electron-builder/package.json'));
  const builderRequire = createRequire(cliRequire.resolve('app-builder-lib/package.json'));
  const asarEntry = builderRequire.resolve('@electron/asar');
  return { builderRequire, asarEntry, asarRequire: createRequire(asarEntry) };
}

async function fixture(t, files) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'easymd-desktop-build-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  for (const [filename, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(directory, filename)), { recursive: true });
    await fs.writeFile(path.join(directory, filename), content);
  }
  return directory;
}

test('desktop builder can load official ESM asar and universal APIs', async () => {
  const { builderRequire, asarEntry } = desktopBuildDependencies();
  const asar = await import(pathToFileURL(asarEntry).href);
  const universal = await import(pathToFileURL(builderRequire.resolve('@electron/universal')).href);
  for (const method of ['createPackageWithOptions', 'createPackageFromStreams', 'listPackage', 'extractFile', 'statFile', 'getRawHeader']) {
    assert.equal(typeof asar[method], 'function', `asar.${method}`);
  }
  assert.equal(typeof universal.makeUniversalApp, 'function');
});

test('the macOS build graph excludes the legacy Windows Squirrel and glob cleanup chain', async () => {
  const { builderRequire, asarRequire } = desktopBuildDependencies();
  assert.throws(() => builderRequire.resolve('electron-builder-squirrel-windows'), { code: 'MODULE_NOT_FOUND' });
  const globPackage = JSON.parse(await fs.readFile(asarRequire.resolve('glob/package.json'), 'utf8'));
  assert.ok(Number(globPackage.version.split('.')[0]) >= 14, 'glob 13 relies on RegExp parts that minimatch 11 replaced with Matcher objects');
});

test('the installed asar and glob versions really traverse and package wildcard-selected files', async (t) => {
  const { asarEntry, asarRequire } = desktopBuildDependencies();
  const input = await fixture(t, {
    'desktop/main.cjs': 'module.exports = "desktop fixture";',
    'dist/index.html': '<h1>Build fixture</h1>',
    'dist/assets/runtime.js': 'console.log("fixture");',
    'LICENSE': 'Fixture license',
    'package.json': '{"name":"fixture"}',
  });
  const output = path.join(await fixture(t, {}), 'fixture.asar');
  const asar = await import(pathToFileURL(asarEntry).href);
  const glob = await import(pathToFileURL(asarRequire.resolve('glob')).href);
  const matched = await glob.glob('**/*.{cjs,html,js}', { cwd: input, nodir: true });
  assert.deepEqual(matched.sort(), ['desktop/main.cjs', 'dist/assets/runtime.js', 'dist/index.html']);
  await asar.createPackageWithOptions(input, output, {});
  const packed = asar.listPackage(output, { isPack: false });
  for (const filename of ['desktop/main.cjs', 'dist/index.html', 'dist/assets/runtime.js', 'LICENSE', 'package.json']) {
    assert.ok(packed.includes(`/${filename}`), `${filename} is missing from the archive`);
  }
  assert.equal(asar.extractFile(output, 'dist/index.html').toString(), '<h1>Build fixture</h1>');
});

test('the installed builder matcher enforces the actual desktop release file allowlist', async (t) => {
  const { builderRequire } = desktopBuildDependencies();
  const { FileMatcher } = builderRequire('./out/fileMatcher.js');
  const yaml = builderRequire('js-yaml');
  const config = yaml.load(await fs.readFile(fileURLToPath(new URL('../electron-builder.yml', import.meta.url)), 'utf8'));
  const expected = ['desktop/main.cjs', 'desktop/preload.cjs', 'desktop/security.cjs', 'scripts/desktop-server.mjs', 'dist/index.html', 'dist/assets/runtime.js', 'dist/THIRD_PARTY_NOTICES.md', 'LICENSE', 'package.json'];
  const excluded = ['.env', 'personal-notes.md', 'src/App.tsx', 'tests/private-fixture.md', 'release/previous.dmg', 'scripts/other.mjs', 'node_modules/secret/package.json', 'dist/node_modules/secret.js', 'dist/.DS_Store'];
  const input = await fixture(t, Object.fromEntries([...expected, ...excluded].map(filename => [filename, 'release fixture'])));
  const filter = new FileMatcher(input, path.join(input, 'destination'), value => value, config.files).createFilter();
  const included = [];
  for (const filename of [...expected, ...excluded]) {
    const absolute = path.join(input, filename);
    if (filter(absolute, await fs.stat(absolute))) included.push(filename);
  }
  assert.deepEqual(included.sort(), [...expected].sort());
});
