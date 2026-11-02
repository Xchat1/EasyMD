'use strict';

const { constants } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');

const DOCUMENT_EXTENSIONS = Object.freeze(['md', 'markdown', 'html', 'htm', 'txt', 'log']);
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_PENDING_FILES = 20;

function fileError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function requireRegularFile(stat) {
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) {
    throw fileError('请选择普通文稿文件；暂不支持符号链接、硬链接、文件夹或特殊文件。', 'UNSAFE_FILE');
  }
  if (stat.size > MAX_DOCUMENT_BYTES) throw fileError('文稿超过 2 MiB，请缩小文件后再打开。', 'TOO_LARGE');
}

function sameVersion(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function safeWorkspacePath(root, filename) {
  const relative = path.relative(root, filename);
  if (!relative || path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)
    || Buffer.byteLength(relative) > 1024 || /[\\\x00-\x1f\x7f]/.test(relative)) return undefined;
  const parts = relative.split(path.sep);
  if (parts.length > 16 || parts.some(part => !part || part.startsWith('.') || Buffer.byteLength(part) > 255)) return undefined;
  return parts.join('/');
}

/** Paths come only from the native picker or macOS open-file, never renderer IPC. */
async function readSelectedDocument(filename, workspaceRoot) {
  let handle;
  try {
    if (typeof filename !== 'string' || !path.isAbsolute(filename) || filename.includes('\0')) {
      throw fileError('所选文稿路径无效，请重新选择文件。', 'INVALID_PATH');
    }
    if (!DOCUMENT_EXTENSIONS.includes(path.extname(filename).slice(1).toLowerCase())) {
      throw fileError('请选择 Markdown、HTML 或纯文本文稿（md、markdown、html、htm、txt、log）。', 'UNSUPPORTED_FORMAT');
    }
    const selected = await fs.lstat(filename);
    requireRegularFile(selected);
    const canonical = await fs.realpath(filename);
    handle = await fs.open(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
    const before = await handle.stat();
    requireRegularFile(before);
    if (!sameVersion(selected, before)) throw fileError('文稿在打开期间发生了变化，请重新打开。', 'FILE_CHANGED');

    // Bound allocation and reads even if the selected file grows after stat().
    const bytes = Buffer.alloc(MAX_DOCUMENT_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > MAX_DOCUMENT_BYTES) throw fileError('文稿超过 2 MiB，请缩小文件后再打开。', 'TOO_LARGE');
    const after = await handle.stat();
    const current = await fs.lstat(filename);
    requireRegularFile(after);
    requireRegularFile(current);
    if (!sameVersion(before, after) || !sameVersion(before, current)
      || length !== before.size || await fs.realpath(filename) !== canonical) {
      throw fileError('文稿在读取期间被修改或移动，请重新打开。', 'FILE_CHANGED');
    }
    const content = bytes.subarray(0, length).toString('utf8');
    if (Buffer.byteLength(content, 'utf8') > MAX_DOCUMENT_BYTES) {
      throw fileError('解码后的文稿超过 2 MiB，请缩小文件后再打开。', 'TOO_LARGE');
    }
    const document = { fileName: path.basename(filename), content };
    if (workspaceRoot) {
      const canonicalRoot = await fs.realpath(workspaceRoot);
      const relative = safeWorkspacePath(canonicalRoot, canonical);
      if (relative) document.workspacePath = relative;
    }
    return document;
  } catch (error) {
    if (['INVALID_PATH', 'UNSUPPORTED_FORMAT', 'UNSAFE_FILE', 'TOO_LARGE', 'FILE_CHANGED'].includes(error.code)) throw error;
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) throw fileError('文稿不存在或已经移动，请重新选择文件。', 'NOT_FOUND');
    if (['EACCES', 'EPERM'].includes(error.code)) throw fileError('无法读取文稿，请检查 macOS 文件访问权限。', 'PERMISSION_DENIED');
    if (error.code === 'ELOOP') throw fileError('暂不支持符号链接，请选择原始文稿文件。', 'UNSAFE_FILE');
    throw fileError('无法读取文稿，请检查文件、磁盘空间与访问权限后重试。', 'READ_FAILED');
  } finally {
    await handle?.close();
  }
}

/** Keep OS-selected paths until a checked main frame explicitly subscribes.
 * A reload during reading retains the document for the next ready frame. */
function createOpenDocumentQueue({ readDocument, deliver, onError = () => {}, limit = MAX_PENDING_FILES }) {
  const pending = [];
  let target = null, running = false, currentDrain = Promise.resolve();

  async function report(error, item) {
    try { await onError(error, item.document?.fileName || (typeof item.filename === 'string' ? path.basename(item.filename) : '')); }
    catch { /* A dismissed/closed native alert must not strand the remaining queue. */ }
  }

  function drain() {
    if (running) return currentDrain;
    running = true;
    currentDrain = (async () => {
      try {
        while (target && pending.length) {
          const recipient = target;
          const item = pending[0];
          if (!item.document) {
            try { item.document = await readDocument(item.filename); }
            catch (error) { pending.shift(); await report(error, item); continue; }
          }
          if (recipient !== target) continue;
          let sent = false;
          try { sent = deliver(recipient, item.document) !== false; } catch { /* The frame may have closed. */ }
          if (!sent) { target = null; break; }
          pending.shift();
        }
      } finally { running = false; }
    })();
    return currentDrain;
  }

  function enqueue(item) {
    if (pending.length >= limit) {
      void report(fileError(`最多同时打开 ${limit} 个文稿，请稍后再试。`, 'QUEUE_FULL'), item);
      return false;
    }
    pending.push(item);
    void drain();
    return true;
  }

  return Object.freeze({
    enqueuePath: filename => enqueue({ filename }),
    enqueueDocument: document => enqueue({ document }),
    setReady: recipient => { target = recipient; return drain(); },
    clearReady: () => { target = null; },
    whenIdle: () => currentDrain,
    get size() { return pending.length; },
  });
}

module.exports = { DOCUMENT_EXTENSIONS, MAX_DOCUMENT_BYTES, MAX_PENDING_FILES, readSelectedDocument, createOpenDocumentQueue };
