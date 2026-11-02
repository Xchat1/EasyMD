import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createDesktopServer, LIMITS } from '../scripts/desktop-server.mjs';

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'easymd-desktop-test-'));
  const root = path.join(directory, 'documents');
  const dist = path.join(directory, 'dist');
  let app;
  t.after(async () => { if (app) { app.server.closeAllConnections(); await app.close(); } await fs.rm(directory, { recursive: true, force: true }); });
  await fs.mkdir(dist); await fs.writeFile(path.join(dist, 'index.html'), '<h1>EasyMD</h1>');
  app = await createDesktopServer({ root, dist, port: 0 });
  function request(url, { method = 'GET', headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
      const data = typeof body === 'string' ? body : body === undefined ? undefined : JSON.stringify(body);
      const req = http.request(`${app.origin}${url}`, {
        method,
        headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }), ...headers },
      }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let value; try { value = JSON.parse(text); } catch { value = text; }
          resolve({ status: res.statusCode, body: value, headers: res.headers });
        });
      });
      req.on('error', reject); req.end(data);
    });
  }
  const headers = { 'X-EasyMD-Client': '1', 'Sec-Fetch-Site': 'same-origin', Origin: app.origin };
  const session = await request('/api/session', { headers });
  assert.equal(session.status, 200);
  const authenticated = { ...headers, 'X-EasyMD-Token': session.body.token };
  const call = (operation, value = {}, extraHeaders = {}) => request('/api/fs', { method: 'POST', headers: { ...authenticated, ...extraHeaders }, body: { operation, ...value } });
  return { app, root, dist, directory, request, session: session.body, headers, authenticated, call };
}

function ok(result, message) { assert.equal(result.status, 200, message || JSON.stringify(result.body)); return result.body; }
function error(result, status, code) { assert.equal(result.status, status, JSON.stringify(result.body)); assert.equal(result.body.error.code, code); }

test('desktop service persists documents, enforces versions and supports recoverable deletion', async (t) => {
  const c = await setup(t);
  ok(await c.call('mkdir', { path: '笔记' }));
  const created = ok(await c.call('create', { path: '笔记/会议.md', content: '# 会议\n第一版' }));
  assert.equal(created.kind, 'file'); assert(created.version);
  const read = ok(await c.call('read', { path: created.path }));
  assert.equal(read.content, '# 会议\n第一版'); assert.equal(read.version, created.version);
  error(await c.call('create', { path: created.path, content: '覆盖' }), 409, 'CONFLICT');
  error(await c.call('write', { path: created.path, content: '覆盖', expectedVersion: 'outdated' }), 409, 'CONFLICT');
  assert.equal(await fs.readFile(path.join(c.root, created.path), 'utf8'), read.content);
  const updated = ok(await c.call('write', { path: created.path, content: '# 更新', expectedVersion: created.version }));
  assert.notEqual(updated.version, created.version);
  await fs.writeFile(path.join(c.root, created.path), '# 外部程序修改');
  error(await c.call('write', { path: created.path, content: 'stale', expectedVersion: updated.version }), 409, 'CONFLICT');
  const current = ok(await c.call('read', { path: created.path }));
  const renamed = ok(await c.call('rename', { path: created.path, newPath: '笔记/已改名.md', expectedVersion: current.version }));
  error(await c.call('read', { path: created.path }), 404, 'NOT_FOUND');
  const trashed = ok(await c.call('trash', { path: renamed.path, expectedVersion: renamed.version }));
  error(await c.call('read', { path: renamed.path }), 404, 'NOT_FOUND');
  const trash = ok(await c.call('trashList'));
  assert.equal(trash.entries[0].trashId, trashed.trashId);
  const restored = ok(await c.call('restore', { trashId: trashed.trashId, path: '恢复.md' }));
  assert.equal(ok(await c.call('read', { path: restored.path })).content, current.content);
  assert.deepEqual((await fs.readdir(c.root)).filter((name) => name.startsWith('.easymd-')), []);
});

test('directory rename and trash never overwrite occupied destinations and restore a subtree', async (t) => {
  const c = await setup(t);
  ok(await c.call('mkdir', { path: 'notes' }));
  ok(await c.call('create', { path: 'notes/a.txt', content: 'safe' }));
  await fs.writeFile(path.join(c.root, 'notes/.DS_Store'), 'Finder metadata');
  ok(await c.call('mkdir', { path: 'occupied' }));
  const original = ok(await c.call('stat', { path: 'notes' }));
  error(await c.call('rename', { path: 'notes', newPath: 'occupied', expectedVersion: original.version }), 409, 'CONFLICT');
  error(await c.call('rename', { path: 'notes', newPath: 'notes/sub', expectedVersion: original.version }), 400, 'BAD_REQUEST');
  const renamed = ok(await c.call('rename', { path: 'notes', newPath: 'archive', expectedVersion: original.version }));
  const trashed = ok(await c.call('trash', { path: renamed.path, expectedVersion: renamed.version }));
  error(await c.call('restore', { trashId: trashed.trashId, path: 'occupied' }), 409, 'CONFLICT');
  ok(await c.call('restore', { trashId: trashed.trashId }));
  assert.equal(ok(await c.call('read', { path: 'archive/a.txt' })).content, 'safe');
  assert.equal(await fs.readFile(path.join(c.root, 'archive/.DS_Store'), 'utf8'), 'Finder metadata');
  error(await c.call('read', { path: 'archive/.DS_Store' }), 400, 'BAD_REQUEST');
});

test('all file APIs require the exact Host, same-origin metadata, client header, Origin and session token', async (t) => {
  const c = await setup(t);
  const body = { operation: 'list', path: '' };
  for (const replacement of [
    { Host: 'attacker.invalid' }, { Origin: 'https://attacker.invalid' },
    { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': '' }, { 'X-EasyMD-Client': '' }, { Origin: '' },
  ]) error(await c.request('/api/fs', { method: 'POST', headers: { ...c.authenticated, ...replacement }, body }), 403, 'FORBIDDEN');
  for (const token of ['', 'invalid-token']) error(await c.call('list', { path: '' }, { 'X-EasyMD-Token': token }), 401, 'UNAUTHORIZED');
  error(await c.request('/api/session'), 403, 'FORBIDDEN');
  error(await c.request('/api/session', { headers: { ...c.headers, Origin: 'null' } }), 403, 'FORBIDDEN');
  error(await c.request('/api/fs', { method: 'OPTIONS', headers: c.headers }), 403, 'FORBIDDEN');
  error(await c.request('/api/session?token=anything', { headers: c.headers }), 403, 'FORBIDDEN');
  assert.equal((await c.request('/api/session', { headers: c.headers })).headers['access-control-allow-origin'], undefined);
  const homepage = await c.request('/');
  assert.equal(homepage.body, '<h1>EasyMD</h1>');
  assert.equal(homepage.headers['x-frame-options'], 'DENY');
  assert.equal(homepage.headers['content-security-policy'], "frame-ancestors 'none'");
});

test('traversal, absolute paths, hidden paths, symlinks and hardlinks cannot expose outside documents', async (t) => {
  const c = await setup(t);
  const outside = path.join(c.directory, 'outside.md'); await fs.writeFile(outside, 'PRIVATE');
  for (const bad of ['../outside.md', outside, 'C:/outside.md', '.trash/item.md', '.hidden/a.md', 'a/../../outside.md', 'a\\outside.md', 'a//b.md', 'a/./b.md']) {
    error(await c.call('read', { path: bad }), 400, 'BAD_REQUEST');
  }
  await fs.symlink(outside, path.join(c.root, 'symlink.md'));
  await fs.symlink(c.directory, path.join(c.root, 'linked-directory'));
  await fs.link(outside, path.join(c.root, 'hardlink.md'));
  for (const bad of ['symlink.md', 'hardlink.md', 'linked-directory/outside.md']) {
    error(await c.call('read', { path: bad }), 403, 'FORBIDDEN');
    error(await c.call('write', { path: bad, content: 'bad', expectedVersion: 'anything' }), 403, 'FORBIDDEN');
  }
  error(await c.call('create', { path: 'linked-directory/created.md', content: 'bad' }), 403, 'FORBIDDEN');
  assert.equal(await fs.readFile(outside, 'utf8'), 'PRIVATE');
  error(await c.request('/%2e%2e%2foutside.md'), 400, 'BAD_REQUEST');
  error(await c.request('/.hidden.md'), 400, 'BAD_REQUEST');
  await fs.symlink(outside, path.join(c.dist, 'leak.txt'));
  error(await c.request('/leak.txt'), 403, 'FORBIDDEN');
});

test('concurrent creates and stale writes cannot overwrite another accepted operation', async (t) => {
  const c = await setup(t);
  const created = await Promise.all(['first', 'second'].map((content) => c.call('create', { path: 'same.md', content })));
  assert.deepEqual(created.map((result) => result.status).sort(), [200, 409]);
  const before = ok(await c.call('read', { path: 'same.md' }));
  const writes = await Promise.all(['A', 'B'].map((content) => c.call('write', { path: 'same.md', content, expectedVersion: before.version })));
  assert.deepEqual(writes.map((result) => result.status).sort(), [200, 409]);
  assert(['A', 'B'].includes(ok(await c.call('read', { path: 'same.md' })).content));
  const list = ok(await c.call('list', { path: '' }));
  assert.deepEqual(list.entries.map((item) => item.name), ['same.md']);
});

test('unsupported formats, oversized content and excessive nesting are rejected before writing', async (t) => {
  const c = await setup(t);
  error(await c.call('create', { path: 'execute.js', content: 'alert(1)' }), 400, 'BAD_REQUEST');
  error(await c.call('create', { path: 'huge.md', content: 'x'.repeat(LIMITS.maxFileBytes + 1) }), 413, 'TOO_LARGE');
  error(await c.call('mkdir', { path: Array.from({ length: LIMITS.maxDepth + 1 }, () => 'folder').join('/') }), 400, 'BAD_REQUEST');
  error(await c.call('create', { path: `${'汉'.repeat(100)}.md`, content: 'invalid filename' }), 400, 'BAD_REQUEST');
  error(await c.call('write', { path: '', content: 'root', expectedVersion: 'invalid' }), 400, 'BAD_REQUEST');
  assert.deepEqual(await fs.readdir(c.root), []);
  ok(await c.call('create', { path: 'page.htm', content: '<h1>preview</h1>' }));
  assert.equal(ok(await c.call('read', { path: 'page.htm' })).content, '<h1>preview</h1>');
});

test('the workspace identity stays stable across sessions and the root cannot be changed through the API', async (t) => {
  const c = await setup(t);
  const second = await createDesktopServer({ root: c.root, dist: c.dist, port: 0 });
  t.after(async () => { second.server.closeAllConnections(); await second.close(); });
  const session = await new Promise((resolve, reject) => {
    const req = http.get(`${second.origin}/api/session`, { headers: { 'X-EasyMD-Client': '1', 'Sec-Fetch-Site': 'same-origin' } }, (res) => {
      let body = ''; res.on('data', (chunk) => { body += chunk; }); res.on('end', () => resolve(JSON.parse(body)));
    }); req.on('error', reject);
  });
  assert.equal(session.workspaceId, c.session.workspaceId); assert.notEqual(session.token, c.session.token);
  ok(await c.call('create', { path: 'fixed.md', root: c.directory, content: 'bound to root' }));
  assert.equal(await fs.readFile(path.join(c.root, 'fixed.md'), 'utf8'), 'bound to root');
  await assert.rejects(fs.stat(path.join(c.directory, 'fixed.md')), { code: 'ENOENT' });
});

test('entry and subtree depth limits also apply to mutations, not only listing', async (t) => {
  const c = await setup(t);
  await fs.mkdir(path.join(c.root, 'full'));
  for (let start = 0; start < LIMITS.maxEntries; start += 100) {
    await Promise.all(Array.from({ length: Math.min(100, LIMITS.maxEntries - start) }, (_, index) => fs.mkdir(path.join(c.root, 'full', `folder-${start + index}`))));
  }
  error(await c.call('create', { path: 'full/new.md', content: 'blocked' }), 413, 'LIMIT_EXCEEDED');
  error(await c.call('mkdir', { path: 'full/new-directory' }), 413, 'LIMIT_EXCEEDED');
  ok(await c.call('mkdir', { path: 'source' }));
  ok(await c.call('create', { path: 'source/nested.md', content: 'preserve' }));
  const source = ok(await c.call('stat', { path: 'source' }));
  const nestedParent = Array.from({ length: LIMITS.maxDepth - 1 }, () => 'deep').join('/');
  await fs.mkdir(path.join(c.root, nestedParent), { recursive: true });
  error(await c.call('rename', { path: 'source', newPath: `${nestedParent}/source`, expectedVersion: source.version }), 413, 'LIMIT_EXCEEDED');
  assert.equal(await fs.readFile(path.join(c.root, 'source/nested.md'), 'utf8'), 'preserve');
});
