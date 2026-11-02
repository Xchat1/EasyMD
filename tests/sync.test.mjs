import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createICloudFile, renameICloudEntry, verifyPermission, validateEntryName,
} from '../src/utils/icloudSync.ts';
import { isUsableFileHandle, saveDocumentHandles } from '../src/utils/documentStorage.ts';
import { FileSaveQueue, FileConflictError } from '../src/utils/fileSaveQueue.ts';

function fileHandle(initialContent = '', options = {}) {
  let disk = initialContent;
  let activeWriters = 0;
  const writes = [];
  const handle = {
    kind: 'file', name: options.name || 'note.md',
    queryPermission: async () => 'granted',
    getFile: async () => ({ text: async () => disk }),
    createWritable: async () => {
      activeWriters++;
      assert.equal(activeWriters, 1, 'one serial writer per document');
      let staged;
      return {
        write: async (content) => {
          if (options.beforeWrite) await options.beforeWrite(content);
          staged = content;
        },
        close: async () => {
          if (options.beforeClose) await options.beforeClose();
          disk = staged;
          writes.push(disk);
          activeWriters--;
        },
        abort: async () => { activeWriters--; },
      };
    },
  };
  return { handle, writes, read: () => disk, externalEdit: (content) => { disk = content; } };
}

function directory(initialFiles, { failCreate = false } = {}) {
  const files = new Map(Object.entries(initialFiles).map(([name, text]) => [name, fileHandle(text, { name })]));
  return {
    files,
    handle: {
      kind: 'directory',
      queryPermission: async () => 'granted',
      getFileHandle: async (name, options) => {
        if (!files.has(name)) {
          if (!options?.create) throw new DOMException('Missing file', 'NotFoundError');
          if (failCreate) throw new DOMException('Disk full', 'QuotaExceededError');
          files.set(name, fileHandle('', { name }));
        }
        return files.get(name).handle;
      },
      removeEntry: async (name) => { files.delete(name); },
    },
  };
}

function queue(options = {}) {
  const events = [];
  return { events, saves: new FileSaveQueue({ delayMs: 60_000, onStatus: (event) => events.push(event), ...options }) };
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test('invalid names are rejected before touching the directory', async () => {
  for (const name of ['', ' ', '.', '..', 'a/b', 'a\\b', 'a\0b']) assert.throws(() => validateEntryName(name));
  const dir = directory({ 'original.md': 'keep me' });
  assert.equal(await renameICloudEntry(dir.handle, 'original.md', 'bad/name.md', false), null);
  assert.equal(dir.files.get('original.md').read(), 'keep me');
});

test('new files and rename destinations cannot overwrite existing files', async () => {
  const dir = directory({ 'original.md': 'original', 'taken.md': 'destination' });
  assert.equal(await createICloudFile(dir.handle, 'taken.md', 'template'), null);
  assert.equal(await renameICloudEntry(dir.handle, 'original.md', 'taken.md', false), null);
  assert.equal(dir.files.get('original.md').read(), 'original');
  assert.equal(dir.files.get('taken.md').read(), 'destination');
});

test('a failed rename copy preserves the original', async () => {
  const dir = directory({ 'original.md': 'keep me' }, { failCreate: true });
  assert.equal(await renameICloudEntry(dir.handle, 'original.md', 'new.md', false), null);
  assert.equal(dir.files.get('original.md').read(), 'keep me');
});

test('successful fallback rename returns the replacement writable handle', async () => {
  const dir = directory({ 'original.md': 'original' });
  const result = await renameICloudEntry(dir.handle, 'original.md', 'new.md', false);
  assert.equal(result.name, 'new.md');
  assert.equal(result.handle, dir.files.get('new.md').handle);
  assert.equal(dir.files.get('new.md').read(), 'original');
  assert.equal(dir.files.has('original.md'), false);
});

test('denied or unavailable permission is never granted', async () => {
  assert.equal(await verifyPermission({ queryPermission: async () => 'denied', requestPermission: async () => 'denied' }), false);
  assert.equal(await verifyPermission({}), false);
});

test('JSON-restored objects cannot be bound as writable handles', () => {
  const { saves } = queue();
  assert.equal(isUsableFileHandle({}), false);
  assert.throws(() => saves.bind('id', JSON.parse(JSON.stringify(fileHandle().handle)), ''));
});

test('two documents retain independent pending saves when selection changes', async () => {
  const a = fileHandle('A0');
  const b = fileHandle('B0');
  const { saves } = queue();
  saves.bind('A', a.handle, 'A0');
  saves.bind('B', b.handle, 'B0');
  saves.schedule('A', 'A1');
  saves.schedule('B', 'B1');
  assert.equal(await saves.flush(), true);
  assert.equal(a.read(), 'A1');
  assert.equal(b.read(), 'B1');
  saves.cancel();
});

test('edits during an active write are serialized and saved events identify their snapshots', async () => {
  const started = deferred();
  const release = deferred();
  const file = fileHandle('zero', { beforeWrite: async (content) => { if (content === 'one') { started.resolve(); await release.promise; } } });
  const { saves, events } = queue();
  saves.bind('id', file.handle, 'zero');
  saves.schedule('id', 'one');
  const flushing = saves.flush();
  await started.promise;
  saves.schedule('id', 'two');
  release.resolve();
  assert.equal(await flushing, true);
  assert.deepEqual(file.writes, ['one', 'two']);
  assert.deepEqual(events.filter((event) => event.status === 'saved').map((event) => event.content), ['one', 'two']);
  saves.cancel();
});

test('external file changes cause a conflict without overwriting either draft or disk', async () => {
  const file = fileHandle('original');
  const { saves, events } = queue();
  saves.bind('id', file.handle, 'original');
  file.externalEdit('other device');
  saves.schedule('id', 'my draft');
  assert.equal(await saves.flush(), false);
  assert.equal(file.read(), 'other device');
  assert.deepEqual(file.writes, []);
  assert.equal(events.at(-1).content, 'my draft');
  assert.ok(events.at(-1).error instanceof FileConflictError);
  saves.cancel();
});

test('reverting to the last saved draft still detects an external disk change', async () => {
  const file = fileHandle('original');
  const { saves, events } = queue();
  saves.bind('id', file.handle, 'original');
  file.externalEdit('other device');
  saves.schedule('id', 'original');
  assert.equal(await saves.flush(), false);
  assert.equal(events.at(-1).status, 'error');
  assert.deepEqual(file.writes, []);
  saves.cancel();
});

test('write failures stay unsaved and can be retried explicitly', async () => {
  const file = fileHandle('original');
  let permitted = false;
  file.handle.queryPermission = async () => permitted ? 'granted' : 'denied';
  const { saves, events } = queue();
  saves.bind('id', file.handle, 'original');
  saves.schedule('id', 'draft');
  assert.equal(await saves.flush(), false);
  assert.equal(file.read(), 'original');
  assert.equal(events.at(-1).status, 'error');
  permitted = true;
  assert.equal(await saves.flush(), true);
  assert.equal(file.read(), 'draft');
  assert.equal(events.at(-1).status, 'saved');
  saves.cancel();
});

test('disconnect cancels pending writes and suppresses callbacks from detached bindings', async () => {
  const file = fileHandle('original');
  const { saves, events } = queue();
  saves.bind('id', file.handle, 'original');
  saves.schedule('id', 'draft');
  saves.cancel('id');
  assert.equal(await saves.flush(), true);
  assert.equal(file.read(), 'original');
  assert.equal(saves.isBound('id'), false);
  assert.deepEqual(events.map((event) => event.status), ['pending']);
});

test('unrelated rerenders do not retry the same failed content', async () => {
  const file = fileHandle('original');
  const { saves, events } = queue();
  saves.bind('id', file.handle, 'original');
  file.externalEdit('other device');
  saves.schedule('id', 'draft');
  assert.equal(await saves.flush(), false);
  const eventCount = events.length;
  saves.schedule('id', 'draft');
  saves.schedule('id', 'draft');
  assert.equal(events.length, eventCount);
  saves.cancel();
});

test('reverting a pending edit to the in-flight version does not write the superseded draft', async () => {
  const started = deferred();
  const release = deferred();
  const file = fileHandle('zero', { beforeWrite: async () => { started.resolve(); await release.promise; } });
  const { saves } = queue();
  saves.bind('id', file.handle, 'zero');
  saves.schedule('id', 'one');
  const flushing = saves.flush();
  await started.promise;
  saves.schedule('id', 'one');
  saves.schedule('id', 'two');
  saves.schedule('id', 'one');
  release.resolve();
  assert.equal(await flushing, true);
  assert.deepEqual(file.writes, ['one']);
  saves.cancel();
});

test('flush waits for a newer snapshot whose debounce elapsed during a failed write', async () => {
  const started = deferred();
  const release = deferred();
  const file = fileHandle('zero', { beforeWrite: async (content) => {
    if (content === 'one') { started.resolve(); await release.promise; throw new Error('transient write failure'); }
  } });
  const { saves } = queue({ delayMs: 0 });
  saves.bind('id', file.handle, 'zero');
  saves.schedule('id', 'one');
  const flushing = saves.flush();
  await started.promise;
  saves.schedule('id', 'two');
  // Let the second snapshot's scheduled callback run while the first write is still active.
  await new Promise((resolve) => setTimeout(resolve, 0));
  release.resolve();
  assert.equal(await flushing, true);
  assert.deepEqual(file.writes, ['two']);
  assert.equal(file.read(), 'two');
  saves.cancel();
});

test('disconnect during permission acquisition prevents creating a writable stream', async () => {
  const permission = deferred();
  const requested = deferred();
  const file = fileHandle('original');
  file.handle.queryPermission = async () => { requested.resolve(); return permission.promise; };
  const { saves, events } = queue();
  saves.bind('id', file.handle, 'original');
  saves.schedule('id', 'draft');
  const flushing = saves.flush();
  await requested.promise;
  saves.cancel();
  permission.resolve('granted');
  await flushing;
  assert.deepEqual(file.writes, []);
  assert.equal(file.read(), 'original');
  assert.equal(events.some((event) => event.status === 'saved'), false);
});

test('disconnect before close aborts staged content rather than committing it', async () => {
  const writing = deferred();
  const release = deferred();
  const file = fileHandle('original', { beforeWrite: async () => { writing.resolve(); await release.promise; } });
  const { saves } = queue();
  saves.bind('id', file.handle, 'original');
  saves.schedule('id', 'draft');
  const flushing = saves.flush();
  await writing.promise;
  saves.cancel();
  release.resolve();
  await flushing;
  assert.deepEqual(file.writes, []);
  assert.equal(file.read(), 'original');
});

test('rebind waits for an already-committing old write and detects its changed baseline', async () => {
  const closing = deferred();
  const release = deferred();
  const file = fileHandle('zero', { beforeClose: async () => { closing.resolve(); await release.promise; } });
  const { saves, events } = queue();
  saves.bind('id', file.handle, 'zero');
  saves.schedule('id', 'one');
  const oldFlush = saves.flush();
  await closing.promise;
  saves.bind('id', file.handle, 'zero');
  saves.schedule('id', 'two');
  const newFlush = saves.flush();
  release.resolve();
  await oldFlush;
  assert.equal(await newFlush, false);
  assert.deepEqual(file.writes, ['one']);
  assert.equal(events.at(-1).status, 'error');
  assert.ok(events.at(-1).error instanceof FileConflictError);
  saves.cancel();
});

test('server write errors retain their concrete message', async () => {
  const file = fileHandle('original', { beforeClose: async () => { throw new Error('文稿超过 2 MiB 限制'); } });
  const { saves, events } = queue();
  saves.bind('id', file.handle, 'original');
  saves.schedule('id', 'large draft');
  assert.equal(await saves.flush(), false);
  assert.equal(events.at(-1).error.message, '文稿超过 2 MiB 限制');
  saves.cancel();
});

test('duplicate persistence IDs are rejected before replacing any stored handles', async () => {
  await assert.rejects(saveDocumentHandles([
    { id: 'duplicate', handle: fileHandle().handle },
    { id: 'duplicate', handle: fileHandle().handle },
  ]), /重复/);
});

test('a failing status observer cannot prevent a document from being saved', async (context) => {
  context.mock.method(console, 'warn', () => {});
  const file = fileHandle('original');
  const saves = new FileSaveQueue({ delayMs: 60_000, onStatus: () => { throw new Error('UI failed'); } });
  saves.bind('id', file.handle, 'original');
  saves.schedule('id', 'draft');
  assert.equal(await saves.flush(), true);
  assert.equal(file.read(), 'draft');
  saves.cancel();
});

test('retry acknowledges a committed write whose response was lost without rewriting it', async () => {
  const file = fileHandle('original');
  let commits = 0;
  file.handle.createWritable = async () => {
    let staged;
    return { write: async (value) => { staged = value; }, abort: async () => {}, close: async () => {
      commits++;
      file.externalEdit(staged);
      throw new Error('response lost after commit');
    } };
  };
  const { saves, events } = queue();
  saves.bind('id', file.handle, 'original');
  saves.schedule('id', 'draft');
  assert.equal(await saves.flush(), false);
  assert.equal(file.read(), 'draft');
  assert.equal(await saves.flush(), true);
  assert.equal(commits, 1);
  assert.equal(events.at(-1).status, 'saved');
  saves.cancel();
});
