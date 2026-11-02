import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DOCUMENT_EXTENSIONS, MAX_DOCUMENT_BYTES, MAX_PENDING_FILES, readSelectedDocument, createOpenDocumentQueue } = require('../desktop/open-documents.cjs');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'easymd-open-document-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'workspace');
  await fs.mkdir(root);
  return { directory, root };
}

const message = fileName => ({ fileName, content: `Content of ${fileName}` });

// Observe real descriptor reads; mutations still go through the actual file
// system. Tests using this process-wide prototype hook run serially and always
// restore it, including assertion/IO failures.
async function withFileReads(filename, hooks, operation) {
  const probe = await fs.open(filename, 'r');
  const prototype = Object.getPrototypeOf(probe);
  await probe.close();
  const originalRead = prototype.read;
  prototype.read = async function(...args) {
    await hooks.before?.(args);
    const result = await originalRead.apply(this, args);
    await hooks.after?.(result, args);
    return result;
  };
  try { return await operation(); }
  finally { prototype.read = originalRead; }
}

test('native selection reads supported text documents without writing or disclosing the external path', async t => {
  const { directory, root } = await fixture(t);
  for (const extension of DOCUMENT_EXTENSIONS) {
    const filename = path.join(directory, `文稿.${extension.toUpperCase()}`);
    const content = `# ${extension}\n\n中文与 UTF-8 ✨\n`;
    await fs.writeFile(filename, content);
    const before = await fs.stat(filename);
    const result = await readSelectedDocument(filename, root);
    assert.deepEqual(result, { fileName: path.basename(filename), content });
    assert.equal(await fs.readFile(filename, 'utf8'), content);
    assert.equal((await fs.stat(filename)).mtimeMs, before.mtimeMs);
    assert(!JSON.stringify(result).includes(directory));
  }
  const empty = path.join(directory, 'empty.md');
  await fs.writeFile(empty, '');
  assert.deepEqual(await readSelectedDocument(empty, root), { fileName: 'empty.md', content: '' });
});

test('workspace capability is only a visible, supported descendant path, never a prefix sibling or external location', async t => {
  const { directory, root } = await fixture(t);
  const folder = path.join(root, '笔记');
  await fs.mkdir(folder);
  const inside = path.join(folder, '已有文稿.md');
  await fs.writeFile(inside, 'existing');
  assert.deepEqual(await readSelectedDocument(inside, root), { fileName: '已有文稿.md', content: 'existing', workspacePath: '笔记/已有文稿.md' });
  const sibling = `${root}-sibling`;
  await fs.mkdir(sibling);
  const external = path.join(sibling, 'outside.md');
  await fs.writeFile(external, 'outside');
  assert.equal((await readSelectedDocument(external, root)).workspacePath, undefined);
  const hiddenFolder = path.join(root, '.private');
  await fs.mkdir(hiddenFolder);
  const hidden = path.join(hiddenFolder, 'note.md');
  await fs.writeFile(hidden, 'hidden');
  assert.equal((await readSelectedDocument(hidden, root)).workspacePath, undefined);
  const backslash = path.join(root, 'bad\\name.md');
  await fs.writeFile(backslash, 'literal filename');
  assert.equal((await readSelectedDocument(backslash, root)).workspacePath, undefined);
  const outsideRoot = path.join(directory, 'other.md');
  await fs.writeFile(outsideRoot, 'not bound');
  assert.equal((await readSelectedDocument(outsideRoot)).workspacePath, undefined);
});

test('unsafe selections reject relative paths, unsupported formats, folders, symbolic and hard links', async t => {
  const { directory, root } = await fixture(t);
  await assert.rejects(readSelectedDocument('../outside.md', root), { code: 'INVALID_PATH' });
  await assert.rejects(readSelectedDocument(path.join(directory, 'bad\0.md'), root), { code: 'INVALID_PATH' });
  const unsupported = path.join(directory, 'image.png');
  await fs.writeFile(unsupported, 'not a supported document');
  await assert.rejects(readSelectedDocument(unsupported, root), { code: 'UNSUPPORTED_FORMAT' });
  const folder = path.join(directory, 'folder.md');
  await fs.mkdir(folder);
  await assert.rejects(readSelectedDocument(folder, root), { code: 'UNSAFE_FILE' });
  const file = path.join(directory, 'original.md');
  await fs.writeFile(file, 'original');
  const symbolic = path.join(directory, 'symbolic.md');
  await fs.symlink(file, symbolic);
  await assert.rejects(readSelectedDocument(symbolic, root), { code: 'UNSAFE_FILE' });
  const hard = path.join(directory, 'hard.md');
  await fs.link(file, hard);
  await assert.rejects(readSelectedDocument(hard, root), { code: 'UNSAFE_FILE' });
  await assert.rejects(readSelectedDocument(path.join(directory, 'missing.md'), root), error => error.code === 'NOT_FOUND' && !error.message.includes(directory));
});

test('oversized files are rejected before reading and decoded UTF-8 content is bounded independently', { concurrency: false }, async t => {
  const { directory, root } = await fixture(t);
  const oversized = path.join(directory, 'large.md');
  await fs.writeFile(oversized, '');
  await fs.truncate(oversized, MAX_DOCUMENT_BYTES + 1);
  const probe = await fs.open(oversized, 'r');
  const prototype = Object.getPrototypeOf(probe);
  await probe.close();
  const originalRead = prototype.read;
  let calls = 0;
  prototype.read = function(...args) { calls++; return originalRead.apply(this, args); };
  try {
    await assert.rejects(readSelectedDocument(oversized, root), { code: 'TOO_LARGE' });
    assert.equal(calls, 0);
  } finally { prototype.read = originalRead; }
  const decoded = path.join(directory, 'decoded.md');
  await fs.writeFile(decoded, Buffer.alloc(Math.floor(MAX_DOCUMENT_BYTES / 3) + 1, 0xff));
  await assert.rejects(readSelectedDocument(decoded, root), { code: 'TOO_LARGE' });
});

test('a selected pathname replaced during reading cannot be mistaken for the originally opened file', { concurrency: false }, async t => {
  const { directory, root } = await fixture(t);
  const filename = path.join(directory, 'changing.md');
  await fs.writeFile(filename, 'original selected content');
  const probe = await fs.open(filename, 'r');
  const prototype = Object.getPrototypeOf(probe);
  await probe.close();
  const originalRead = prototype.read;
  let changed = false;
  prototype.read = async function(...args) {
    const result = await originalRead.apply(this, args);
    if (!changed && result.bytesRead) {
      changed = true;
      await fs.rename(filename, path.join(directory, 'moved.md'));
      await fs.writeFile(filename, 'a replacement at the original path');
    }
    return result;
  };
  try { await assert.rejects(readSelectedDocument(filename, root), { code: 'FILE_CHANGED' }); }
  finally { prototype.read = originalRead; }
  assert.equal(await fs.readFile(filename, 'utf8'), 'a replacement at the original path');
  assert.equal(await fs.readFile(path.join(directory, 'moved.md'), 'utf8'), 'original selected content');
});

test('permission-only metadata changes between selection and open do not reject unchanged content', { concurrency: false }, async t => {
  const { directory, root } = await fixture(t);
  const filename = path.join(directory, '访问权限变化.md');
  const content = '# 文稿内容没有变化\n';
  await fs.writeFile(filename, content, { mode: 0o600 });
  const originalLstat = fs.lstat;
  let selected, changed;
  fs.lstat = async function(candidate, ...args) {
    const result = await originalLstat.call(this, candidate, ...args);
    if (candidate === filename && !selected) {
      selected = result;
      await fs.chmod(filename, 0o640);
      changed = await originalLstat(filename);
    }
    return result;
  };
  try {
    assert.deepEqual(await readSelectedDocument(filename, root), { fileName: path.basename(filename), content });
  } finally { fs.lstat = originalLstat; }
  assert.equal(changed.dev, selected.dev);
  assert.equal(changed.ino, selected.ino);
  assert.notEqual(changed.mode, selected.mode, 'the test must really change metadata before the descriptor opens');
  assert.equal(await fs.readFile(filename, 'utf8'), content);
});

test('timestamp-only changes after reading do not reject unchanged bytes', { concurrency: false }, async t => {
  const { directory, root } = await fixture(t);
  const filename = path.join(directory, '元数据更新.md');
  const content = '# 中文内容与 UTF-8 ✨\n';
  const originalTime = new Date('2020-01-01T00:00:00.000Z');
  const updatedTime = new Date('2021-01-01T00:00:00.000Z');
  await fs.writeFile(filename, content);
  await fs.utimes(filename, originalTime, originalTime);
  let changed = false;
  await withFileReads(filename, { after: async result => {
    if (!changed && result.bytesRead > 0) {
      changed = true;
      await fs.utimes(filename, updatedTime, updatedTime);
    }
  } }, async () => {
    assert.deepEqual(await readSelectedDocument(filename, root), { fileName: path.basename(filename), content });
  });
  assert(changed);
  assert.equal((await fs.stat(filename)).mtimeMs, updatedTime.getTime());
  assert.equal(await fs.readFile(filename, 'utf8'), content);
});

test('same-size in-place content changes are rejected even when the modification time is restored', { concurrency: false }, async t => {
  const { directory, root } = await fixture(t);
  const filename = path.join(directory, 'same-size.md');
  const original = '# Before\n';
  const replacement = '# After!\n';
  assert.equal(Buffer.byteLength(original), Buffer.byteLength(replacement));
  const fixedTime = new Date('2020-01-01T00:00:00.000Z');
  await fs.writeFile(filename, original);
  await fs.utimes(filename, fixedTime, fixedTime);
  const before = await fs.stat(filename);
  let changed = false;
  await withFileReads(filename, { after: async result => {
    if (!changed && result.bytesRead === 0) {
      changed = true;
      const writer = await fs.open(filename, 'r+');
      try { await writer.write(replacement, 0, 'utf8'); }
      finally { await writer.close(); }
      await fs.utimes(filename, fixedTime, fixedTime);
    }
  } }, async () => {
    await assert.rejects(readSelectedDocument(filename, root), { code: 'FILE_CHANGED' });
  });
  assert(changed, 'the first bounded snapshot must have completed before the rewrite');
  const after = await fs.stat(filename);
  assert.equal(after.dev, before.dev);
  assert.equal(after.ino, before.ino, 'the write must change the original inode, not replace it');
  assert.equal(after.size, before.size);
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.equal(await fs.readFile(filename, 'utf8'), replacement);
});

test('a replacement inode is rejected even when its document bytes are identical', { concurrency: false }, async t => {
  const { directory, root } = await fixture(t);
  const filename = path.join(directory, 'same-content.md');
  const moved = path.join(directory, 'selected-original.md');
  const content = '# Identical content\n';
  await fs.writeFile(filename, content);
  const before = await fs.stat(filename);
  let changed = false;
  await withFileReads(filename, { after: async result => {
    if (!changed && result.bytesRead === 0) {
      changed = true;
      await fs.rename(filename, moved);
      await fs.writeFile(filename, content, { flag: 'wx' });
    }
  } }, async () => {
    await assert.rejects(readSelectedDocument(filename, root), { code: 'FILE_CHANGED' });
  });
  assert(changed);
  assert.notEqual((await fs.stat(filename)).ino, before.ino);
  assert.equal(await fs.readFile(filename, 'utf8'), content);
  assert.equal(await fs.readFile(moved, 'utf8'), content);
});

test('growth or truncation after the first snapshot cannot silently change the imported document', { concurrency: false }, async t => {
  const { directory, root } = await fixture(t);
  for (const operation of ['grow', 'truncate']) {
    const filename = path.join(directory, `${operation}.md`);
    const content = '# Original bounded snapshot\n';
    await fs.writeFile(filename, content);
    let changed = false;
    await withFileReads(filename, { after: async result => {
      if (!changed && result.bytesRead === 0) {
        changed = true;
        if (operation === 'grow') await fs.appendFile(filename, 'Additional content\n');
        else await fs.truncate(filename, 5);
      }
    } }, async () => {
      await assert.rejects(readSelectedDocument(filename, root), { code: 'FILE_CHANGED' }, operation);
    });
    assert(changed, operation);
    assert.notEqual((await fs.stat(filename)).size, Buffer.byteLength(content), operation);
  }
});

test('each bounded snapshot rejects a file that grows beyond the limit after its preceding stat', { concurrency: false }, async t => {
  const { directory, root } = await fixture(t);
  for (const snapshot of [1, 2]) {
    const filename = path.join(directory, `growing-snapshot-${snapshot}.md`);
    await fs.writeFile(filename, '# Small\n');
    let starts = 0, expanded = false;
    await withFileReads(filename, { before: async args => {
      if (args[3] === 0 && ++starts === snapshot) {
        expanded = true;
        await fs.truncate(filename, MAX_DOCUMENT_BYTES + 1);
      }
    } }, async () => {
      await assert.rejects(readSelectedDocument(filename, root), { code: 'TOO_LARGE' }, `snapshot ${snapshot}`);
    });
    assert(expanded, `snapshot ${snapshot} must attempt its own bounded read from offset zero`);
    assert.equal(starts, snapshot);
  }
});

test('stable empty, Unicode, and exactly two MiB documents survive independent full reads', { concurrency: false }, async t => {
  const { directory, root } = await fixture(t);
  const unicodePrefix = '# 中文文稿 ✨\n';
  const cases = [
    ['empty-twice.md', ''],
    ['中文文稿.md', `${unicodePrefix}内容可以正常读取。\n`],
    ['exact-limit.md', unicodePrefix + 'x'.repeat(MAX_DOCUMENT_BYTES - Buffer.byteLength(unicodePrefix))],
  ];
  for (const [name, content] of cases) {
    const filename = path.join(directory, name);
    await fs.writeFile(filename, content);
    let readsFromStart = 0;
    await withFileReads(filename, { before: args => { if (args[3] === 0) readsFromStart++; } }, async () => {
      const result = await readSelectedDocument(filename, root);
      assert.equal(result.fileName, name);
      assert.equal(result.content, content);
      assert.equal(Object.hasOwn(result, 'workspacePath'), false);
    });
    assert(readsFromStart >= 2, `${name} must be verified by independent reads from offset zero`);
    assert.equal(await fs.readFile(filename, 'utf8'), content);
  }
  assert.equal(Buffer.byteLength(cases[2][1]), MAX_DOCUMENT_BYTES);
});

test('native open events wait for a ready renderer and are read and delivered in order', async () => {
  const reads = [], sent = [];
  const queue = createOpenDocumentQueue({
    readDocument: async filename => { reads.push(filename); return message(path.basename(filename)); },
    deliver: (target, document) => { sent.push({ target, document }); },
  });
  queue.enqueuePath('/selected/first.md');
  queue.enqueuePath('/selected/second.md');
  await queue.whenIdle();
  assert.deepEqual(reads, []);
  assert.equal(queue.size, 2);
  await queue.setReady('main-frame');
  assert.deepEqual(reads, ['/selected/first.md', '/selected/second.md']);
  assert.deepEqual(sent, [{ target: 'main-frame', document: message('first.md') }, { target: 'main-frame', document: message('second.md') }]);
  assert.equal(queue.size, 0);
});

test('a reload during an asynchronous read retains the opened document for the next subscribed frame', async () => {
  let release;
  const reads = [], sent = [];
  const queue = createOpenDocumentQueue({
    readDocument: filename => { reads.push(filename); return new Promise(resolve => { release = resolve; }); },
    deliver: (target, document) => sent.push({ target, document }),
  });
  queue.enqueuePath('/selected/first.md');
  const oldDrain = queue.setReady('old-main-frame');
  queue.clearReady();
  release(message('first.md'));
  await oldDrain;
  assert.equal(sent.length, 0);
  assert.equal(queue.size, 1);
  await queue.setReady('new-main-frame');
  assert.deepEqual(reads, ['/selected/first.md']);
  assert.deepEqual(sent, [{ target: 'new-main-frame', document: message('first.md') }]);
});

test('closed target frames do not consume a document and selected menu payloads use the same queue', async () => {
  const sent = [];
  let reads = 0;
  const queue = createOpenDocumentQueue({
    readDocument: async () => { reads++; return message('os.md'); },
    deliver: (target, document) => {
      if (target === 'closed-frame') return false;
      sent.push(document); return true;
    },
  });
  queue.enqueuePath('/selected/os.md');
  queue.enqueueDocument(message('menu.md'));
  await queue.setReady('closed-frame');
  assert.equal(queue.size, 2);
  await queue.setReady('new-main-frame');
  assert.equal(reads, 1);
  assert.deepEqual(sent, [message('os.md'), message('menu.md')]);
  assert.equal(queue.size, 0);
});

test('native file failures report only the basename and do not block later selected files', async () => {
  const errors = [], sent = [];
  const queue = createOpenDocumentQueue({
    readDocument: async filename => {
      if (filename.endsWith('missing.md')) throw new Error('The selected file is missing');
      return message(path.basename(filename));
    },
    deliver: (_target, document) => sent.push(document),
    onError: (error, fileName) => { errors.push({ error: error.message, fileName }); throw new Error('native alert was closed'); },
  });
  queue.enqueuePath('/private/selection/missing.md');
  queue.enqueuePath('/private/selection/next.md');
  await queue.setReady('main-frame');
  assert.deepEqual(errors, [{ error: 'The selected file is missing', fileName: 'missing.md' }]);
  assert.deepEqual(sent, [message('next.md')]);
});

test('at most twenty OS selections remain pending, including the file currently being read', async () => {
  let release;
  const errors = [], sent = [];
  const queue = createOpenDocumentQueue({
    readDocument: filename => filename.endsWith('/0.md') ? new Promise(resolve => { release = resolve; }) : Promise.resolve(message(path.basename(filename))),
    deliver: (_target, document) => sent.push(document),
    onError: error => errors.push(error.code),
  });
  for (let index = 0; index < MAX_PENDING_FILES; index++) assert.equal(queue.enqueuePath(`/selected/${index}.md`), true);
  const active = queue.setReady('main-frame');
  assert.equal(queue.enqueuePath('/selected/overflow.md'), false);
  assert.equal(queue.size, MAX_PENDING_FILES);
  assert.deepEqual(errors, ['QUEUE_FULL']);
  release(message('0.md'));
  await active;
  assert.equal(sent.length, MAX_PENDING_FILES);
  assert.equal(queue.size, 0);
});
