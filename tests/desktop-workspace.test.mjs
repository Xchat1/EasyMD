import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectDesktopWorkspace, restoreDesktopDocuments } from '../src/utils/desktopWorkspace.ts';

const workspaceId = 'fixed-workspace';
const store = new Map();
let files = new Map();
let counter = 0;
let remoteRoot = workspaceId;
const originalFetch = globalThis.fetch;
const originalStorage = globalThis.localStorage;
globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
function put(path, content) { files.set(path, { name: path.split('/').at(-1), path, kind: 'file', content, version: String(++counter), lastModified: counter, size: content.length }); }
function response(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }); }
globalThis.fetch = async (url, options) => {
  assert.equal(options.headers['X-EasyMD-Client'], '1');
  if (url === '/api/session') return response({ token: 'session-token', directory: '/fixed/EasyMD', workspaceId: remoteRoot });
  assert.equal(url, '/api/fs'); assert.equal(options.method, 'POST');
  assert.equal(options.headers['X-EasyMD-Token'], 'session-token');
  const body = JSON.parse(options.body);
  const existing = files.get(body.path);
  if (body.operation === 'create') {
    if (existing) return response({ error: { code: 'CONFLICT', message: '目标名称已经存在。' } }, 409);
    put(body.path, body.content); return response(files.get(body.path));
  }
  if (body.operation === 'read' || body.operation === 'stat') {
    return existing ? response(existing) : response({ error: { code: 'NOT_FOUND', message: '不存在' } }, 404);
  }
  if (body.operation === 'write') {
    if (body.expectedVersion !== existing?.version) return response({ error: { code: 'CONFLICT', message: '磁盘已经改变' } }, 409);
    put(body.path, body.content); return response(files.get(body.path));
  }
  throw new Error(`Unexpected ${body.operation}`);
};
const draft = (overrides = {}) => ({ id: 'draft-1', title: 'note.md', content: 'original', mode: 'md', updatedAt: 1, ...overrides });

test('fixed-directory migration preserves collisions and resumes without duplicate copies', async () => {
  files = new Map(); store.clear(); put('note.md', 'existing user file');
  const { root } = await connectDesktopWorkspace();
  const [first] = await restoreDesktopDocuments(root, workspaceId, [draft()], []);
  assert.equal(files.get('note.md').content, 'existing user file');
  assert.equal(first.title, 'note (draft-1).md');
  assert.equal(first.storageBackend, 'desktop');
  assert.equal(first.content, 'original');
  const [resumed] = await restoreDesktopDocuments(root, workspaceId, [draft()], []);
  assert.equal(resumed.path, first.path);
  assert.equal(files.size, 2);
});

test('migration resumes safely after partial failure without losing either draft', async () => {
  files = new Map(); store.clear();
  const { root } = await connectDesktopWorkspace();
  const second = draft({ id: 'draft-2', title: 'second.md', content: 'second' });
  let attempts = 0;
  const savedSetItem = localStorage.setItem;
  localStorage.setItem = (key, value) => { if (++attempts === 2) throw new Error('quota'); savedSetItem(key, value); };
  await assert.rejects(restoreDesktopDocuments(root, workspaceId, [draft(), second], []), /quota/);
  localStorage.setItem = savedSetItem;
  assert.equal(files.get('note.md').content, 'original');
  assert.equal(files.get('second.md').content, 'second');
  const restored = await restoreDesktopDocuments(root, workspaceId, [draft(), second], []);
  assert.deepEqual(restored.map((item) => item.content), ['original', 'second']);
  assert.equal(restored[0].path, 'note.md');
  assert.equal(restored[1].path, 'second (draft-2).md');
});

test('disk changes load for a clean document while unsaved drafts and missing files remain intact', async () => {
  files = new Map(); store.clear(); put('note.md', 'new disk');
  const { root } = await connectDesktopWorkspace();
  const bound = draft({ storageBackend: 'desktop', storageRoot: workspaceId, path: 'note.md', lastSyncedContent: 'original', isModified: false });
  const [clean] = await restoreDesktopDocuments(root, workspaceId, [bound], []);
  assert.equal(clean.content, 'new disk');
  const [dirty] = await restoreDesktopDocuments(root, workspaceId, [{ ...bound, content: 'my draft', isModified: true }], []);
  assert.equal(dirty.content, 'my draft'); assert.equal(dirty.lastSyncedContent, 'original');
  files.delete('note.md');
  const [missing] = await restoreDesktopDocuments(root, workspaceId, [bound], []);
  assert.equal(missing.content, 'original'); assert.equal(missing.fileHandle, null); assert.equal(files.size, 0);
});

test('a successful disk save with a lost response advances the recovered baseline', async () => {
  files = new Map(); store.clear(); put('note.md', 'saved draft');
  const { root } = await connectDesktopWorkspace();
  const bound = draft({ content: 'saved draft', storageBackend: 'desktop', storageRoot: workspaceId, path: 'note.md', lastSyncedContent: 'original', isModified: true });
  const [restored] = await restoreDesktopDocuments(root, workspaceId, [bound], []);
  assert.equal(restored.lastSyncedContent, 'saved draft'); assert.equal(restored.isModified, false);
  const [unknownBaseline] = await restoreDesktopDocuments(root, workspaceId, [{ ...bound, content: 'different draft', lastSyncedContent: undefined }], []);
  assert.equal(unknownBaseline.fileHandle, null); assert.equal(unknownBaseline.content, 'different draft');
});

test('file adapter passes its read version so a concurrent disk edit cannot be overwritten', async () => {
  files = new Map(); store.clear(); put('note.md', 'original');
  const { root } = await connectDesktopWorkspace();
  const handle = await root.getFileHandle('note.md');
  await handle.getFile();
  put('note.md', 'other application');
  const writer = await handle.createWritable(); await writer.write('my draft');
  await assert.rejects(writer.close(), /磁盘已经改变/);
  assert.equal(files.get('note.md').content, 'other application');
});

test('an unexpected root change cannot silently rebind old document handles', async () => {
  remoteRoot = 'different-root';
  await assert.rejects(connectDesktopWorkspace(), /目录已改变/);
  globalThis.fetch = originalFetch;
  if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage;
});
