import http from 'node:http';
import { constants } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const LIMITS = Object.freeze({ maxFileBytes: 2 * 1024 * 1024, maxListingBytes: 32 * 1024 * 1024, maxDepth: 16, maxEntries: 2000, maxPathLength: 1024 });
const EXTENSIONS = new Set(['.md', '.markdown', '.html', '.htm', '.txt', '.log']);
const NOFOLLOW = constants.O_NOFOLLOW || 0;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const fail = (status, code, message) => { throw new ApiError(status, code, message); };
const digest = (value) => createHash('sha256').update(value).digest('hex');
const exists = async (filename) => { try { return await fs.lstat(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };

function documentPath(value, { allowRoot = false } = {}) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > LIMITS.maxPathLength || /[\\\x00-\x1f\x7f]/.test(value) || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    fail(400, 'BAD_REQUEST', '文稿路径无效。');
  }
  if (value === '' && allowRoot) return value;
  const segments = value.split('/');
  if (!value || segments.length > LIMITS.maxDepth || segments.some((part) => !part || part.startsWith('.') || Buffer.byteLength(part) > 255)) {
    fail(400, 'BAD_REQUEST', '路径包含隐藏目录、空名称或超过层级限制。');
  }
  return segments.join('/');
}
function requireDocumentName(relative) {
  if (!EXTENSIONS.has(path.extname(relative).toLowerCase())) fail(400, 'BAD_REQUEST', '仅支持 md、markdown、html、htm、txt、log 文稿。');
}
function contentBuffer(value) {
  if (typeof value !== 'string') fail(400, 'BAD_REQUEST', '文稿内容必须是文本。');
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length > LIMITS.maxFileBytes) fail(413, 'TOO_LARGE', '文稿超过 2 MiB 限制。');
  return bytes;
}
function safeStat(stat) {
  if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()) || (stat.isFile() && stat.nlink !== 1)) {
    fail(403, 'FORBIDDEN', '不能访问符号链接、硬链接或特殊文件。');
  }
}
async function validatePath(root, relative, { missingLeaf = false } = {}) {
  const parts = relative ? relative.split('/') : [];
  let filename = root;
  let stat = await fs.lstat(root);
  safeStat(stat);
  if (!stat.isDirectory()) fail(409, 'TYPE_MISMATCH', '工作目录无效。');
  for (let i = 0; i < parts.length; i++) {
    filename = path.join(filename, parts[i]);
    stat = await exists(filename);
    if (!stat) {
      if (missingLeaf && i === parts.length - 1) return { filename, stat: null };
      fail(404, 'NOT_FOUND', '文稿或文件夹不存在。');
    }
    safeStat(stat);
    if (i < parts.length - 1 && !stat.isDirectory()) fail(409, 'TYPE_MISMATCH', '父路径不是文件夹。');
  }
  return { filename, stat };
}
async function readRegular(filename, maxBytes = LIMITS.maxFileBytes) {
  let handle;
  try {
    handle = await fs.open(filename, constants.O_RDONLY | NOFOLLOW);
    const before = await handle.stat();
    safeStat(before);
    if (!before.isFile()) fail(409, 'TYPE_MISMATCH', '此路径不是文稿。');
    if (before.size > maxBytes) fail(413, 'TOO_LARGE', '文件超过大小限制。');
    const bytes = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > maxBytes) fail(413, 'TOO_LARGE', '文件超过大小限制。');
    const after = await handle.stat();
    safeStat(after);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) fail(409, 'CONFLICT', '文件读取期间已被修改，请重新读取。');
    return { bytes: bytes.subarray(0, length), stat: after };
  } finally { await handle?.close(); }
}
async function entry(root, relative, includeContent = false) {
  const { filename, stat } = await validatePath(root, relative);
  if (stat.isDirectory()) {
    if (includeContent) fail(409, 'TYPE_MISMATCH', '文件夹不能作为文稿读取。');
    return { name: path.basename(filename), path: relative, kind: 'directory', size: 0, lastModified: stat.mtimeMs, version: `dir:${digest(`${stat.ino}:${stat.mtimeMs}:${stat.ctimeMs}`)}` };
  }
  requireDocumentName(relative);
  const file = await readRegular(filename);
  return { name: path.basename(filename), path: relative, kind: 'file', size: file.bytes.length, lastModified: file.stat.mtimeMs, version: `sha256:${digest(file.bytes)}`, ...(includeContent ? { content: file.bytes.toString('utf8') } : {}) };
}
function requireVersion(current, expectedVersion) {
  if (typeof expectedVersion !== 'string' || current.version !== expectedVersion) fail(409, 'CONFLICT', '文稿已被其他程序修改，请重新读取后再保存。');
}
async function requireDirectoryRoom(filename) {
  if ((await fs.readdir(filename)).length >= LIMITS.maxEntries) fail(413, 'LIMIT_EXCEEDED', '目标文件夹条目已达到限制。');
}
async function validateTree(root, relative, destination = relative) {
  let count = 0;
  async function walk(current, target) {
    if (++count > LIMITS.maxEntries || target.split('/').length > LIMITS.maxDepth) fail(413, 'LIMIT_EXCEEDED', '文件夹超过条目或层级限制。');
    const { filename, stat } = await validatePath(root, current);
    if (stat.isFile()) { requireDocumentName(current); return; }
    for (const child of await fs.readdir(filename)) {
      // Finder creates this metadata automatically. Preserve it when moving a
      // folder, without exposing it through the document read/list APIs.
      if (child === '.DS_Store') {
        const metadata = await validatePath(root, `${current}/${child}`);
        if (!metadata.stat.isFile()) fail(403, 'FORBIDDEN', '访达元数据类型无效。');
        if (++count > LIMITS.maxEntries) fail(413, 'LIMIT_EXCEEDED', '文件夹条目超过限制。');
        continue;
      }
      // Destructive folder operations must not silently include unhandled data.
      if (child.startsWith('.')) fail(403, 'FORBIDDEN', '文件夹包含隐藏文件，请在访达中处理。');
      await walk(`${current}/${child}`, `${target}/${child}`);
    }
  }
  await walk(relative, destination);
}
async function atomicWrite(filename, bytes, beforeReplace) {
  const temporary = path.join(path.dirname(filename), `.easymd-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close(); handle = undefined;
    await beforeReplace();
    await fs.rename(temporary, filename);
  } finally {
    await handle?.close();
    await fs.unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}
async function createFile(filename, bytes) {
  const temporary = path.join(path.dirname(filename), `.easymd-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
    await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = undefined;
    // link() installs a completed file without ever replacing an existing name.
    await fs.link(temporary, filename);
  } finally {
    await handle?.close();
    await fs.unlink(temporary).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}
async function moveWithoutReplacing(source, destination, isDirectory) {
  if (!isDirectory) {
    const original = await fs.lstat(source);
    safeStat(original);
    await fs.link(source, destination);
    try {
      const current = await fs.lstat(source);
      if (current.ino !== original.ino || current.dev !== original.dev) fail(409, 'CONFLICT', '原文件已发生变化。');
      await fs.unlink(source);
    } catch (error) { await fs.unlink(destination); throw error; }
    return;
  }
  // Reserve a previously unused destination before renaming a directory.
  await fs.mkdir(destination, { mode: 0o700 });
  try { await fs.rename(source, destination); }
  catch (error) { await fs.rmdir(destination).catch(() => {}); throw error; }
}
async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] || '')) fail(400, 'BAD_REQUEST', '需要 application/json 请求。');
  if (Number(request.headers['content-length']) > LIMITS.maxFileBytes + 16 * 1024) fail(413, 'TOO_LARGE', '请求超过大小限制。');
  const chunks = []; let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > LIMITS.maxFileBytes + 16 * 1024) fail(413, 'TOO_LARGE', '请求超过大小限制。');
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'BAD_REQUEST', 'JSON 请求无效。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'BAD_REQUEST', '请求必须是对象。');
  return value;
}
function sendJson(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}
function publicError(error) {
  if (error instanceof ApiError) return error;
  if (error.code === 'ENOENT') return new ApiError(404, 'NOT_FOUND', '文稿或文件夹不存在。');
  if (['EEXIST', 'ENOTEMPTY'].includes(error.code)) return new ApiError(409, 'CONFLICT', '目标名称已经存在。');
  if (['ENOTDIR', 'EISDIR'].includes(error.code)) return new ApiError(409, 'TYPE_MISMATCH', '文件与文件夹类型不匹配。');
  if (['ELOOP', 'EACCES', 'EPERM'].includes(error.code)) return new ApiError(403, 'FORBIDDEN', '无法访问此路径。');
  return new ApiError(500, 'IO_ERROR', '本机文件操作失败，请检查磁盘空间及访问权限。');
}

export async function createDesktopServer({ root = path.join(os.homedir(), 'Documents/EasyMD'), dist = fileURLToPath(new URL('../dist/', import.meta.url)), port = 5173 } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port');
  const requestedRoot = path.resolve(root);
  // The parent must already exist. In particular, never fabricate an iCloud
  // hierarchy after Drive is disabled or its provider directory disappears.
  await fs.mkdir(requestedRoot, { mode: 0o700 }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  const initialRoot = await fs.lstat(requestedRoot);
  safeStat(initialRoot);
  if (!initialRoot.isDirectory()) throw new Error('Document root is not a directory');
  const directory = await fs.realpath(requestedRoot);
  const staticDirectory = await fs.realpath(path.resolve(dist));
  const token = randomBytes(32).toString('base64url');
  const workspaceId = digest(directory);
  let origin;
  let pending = Promise.resolve();

  async function trashDirectory() {
    const location = path.join(directory, '.trash');
    await fs.mkdir(location, { mode: 0o700 }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
    const stat = await fs.lstat(location); safeStat(stat);
    if (!stat.isDirectory()) fail(403, 'FORBIDDEN', '回收站路径无效。');
    return location;
  }
  async function trashItem(id) {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) fail(400, 'BAD_REQUEST', '回收站标识无效。');
    const trash = await trashDirectory();
    const item = await validatePath(trash, id);
    if (!item.stat.isDirectory()) fail(403, 'FORBIDDEN', '回收站条目无效。');
    const metadataFile = await readRegular(path.join(item.filename, 'metadata.json'), 8192);
    let metadata;
    try { metadata = JSON.parse(metadataFile.bytes.toString('utf8')); } catch { fail(400, 'BAD_REQUEST', '回收站记录损坏。'); }
    documentPath(metadata.path);
    return { item: item.filename, metadata };
  }
  async function operate(body) {
    const operation = body.operation;
    if (operation === 'restore') {
      const { item, metadata } = await trashItem(body.trashId);
      const relative = documentPath(body.path ?? metadata.path);
      const target = await validatePath(directory, relative, { missingLeaf: true });
      if (target.stat) fail(409, 'CONFLICT', '恢复目标已经存在。');
      await requireDirectoryRoom(path.dirname(target.filename));
      const original = await fs.lstat(path.join(item, 'entry'));
      safeStat(original);
      if (original.isFile()) { requireDocumentName(relative); await readRegular(path.join(item, 'entry')); }
      else await validateTree(item, 'entry', relative);
      await moveWithoutReplacing(path.join(item, 'entry'), target.filename, original.isDirectory());
      await fs.unlink(path.join(item, 'metadata.json')); await fs.rmdir(item);
      return entry(directory, relative);
    }
    if (operation === 'trashList') {
      const trash = await trashDirectory();
      const ids = await fs.readdir(trash);
      if (ids.length > LIMITS.maxEntries) fail(413, 'LIMIT_EXCEEDED', '回收站条目过多。');
      const entries = [];
      for (const id of ids) { const { metadata } = await trashItem(id); entries.push({ trashId: id, ...metadata }); }
      return { entries };
    }
    const relative = documentPath(body.path, { allowRoot: ['list', 'stat'].includes(operation) });
    if (operation === 'read' || operation === 'stat') return entry(directory, relative, operation === 'read');
    if (operation === 'list') {
      const target = await validatePath(directory, relative);
      if (!target.stat.isDirectory()) fail(409, 'TYPE_MISMATCH', '此路径不是文件夹。');
      const names = await fs.readdir(target.filename);
      if (names.length > LIMITS.maxEntries) fail(413, 'LIMIT_EXCEEDED', '文件夹条目超过限制。');
      const entries = [];
      let totalBytes = 0;
      for (const name of names.sort()) {
        if (name.startsWith('.')) continue;
        const child = documentPath(relative ? `${relative}/${name}` : name);
        const checked = await validatePath(directory, child);
        if (checked.stat.isDirectory() || EXTENSIONS.has(path.extname(name).toLowerCase())) {
          totalBytes += checked.stat.isFile() ? checked.stat.size : 0;
          if (totalBytes > LIMITS.maxListingBytes) fail(413, 'LIMIT_EXCEEDED', '文件夹文稿总大小超过列表读取限制。');
          entries.push(await entry(directory, child));
        }
      }
      return { path: relative, entries };
    }
    if (operation === 'create' || operation === 'mkdir') {
      const target = await validatePath(directory, relative, { missingLeaf: true });
      if (target.stat) fail(409, 'CONFLICT', '目标名称已经存在。');
      await requireDirectoryRoom(path.dirname(target.filename));
      if (operation === 'mkdir') await fs.mkdir(target.filename, { mode: 0o700 });
      else { requireDocumentName(relative); await createFile(target.filename, contentBuffer(body.content ?? '')); }
      return entry(directory, relative);
    }
    if (!['write', 'rename', 'trash'].includes(operation)) fail(400, 'BAD_REQUEST', '不支持的文件操作。');
    const original = await entry(directory, relative);
    requireVersion(original, body.expectedVersion);
    const source = await validatePath(directory, relative);
    if (operation === 'write') {
      if (original.kind !== 'file') fail(409, 'TYPE_MISMATCH', '不能向文件夹写入内容。');
      const bytes = contentBuffer(body.content);
      await atomicWrite(source.filename, bytes, async () => requireVersion(await entry(directory, relative), body.expectedVersion));
      return entry(directory, relative);
    }
    if (operation === 'rename') {
      const destination = documentPath(body.newPath);
      if (destination === relative) return original;
      if (destination.startsWith(`${relative}/`)) fail(400, 'BAD_REQUEST', '不能将文件夹移入其自身。');
      if (original.kind === 'file') requireDocumentName(destination);
      const target = await validatePath(directory, destination, { missingLeaf: true });
      if (target.stat) fail(409, 'CONFLICT', '目标名称已经存在。');
      await validateTree(directory, relative, destination);
      if (path.dirname(target.filename) !== path.dirname(source.filename)) await requireDirectoryRoom(path.dirname(target.filename));
      requireVersion(await entry(directory, relative), body.expectedVersion);
      await moveWithoutReplacing(source.filename, target.filename, original.kind === 'directory');
      return entry(directory, destination);
    }
    await validateTree(directory, relative);
    const trash = await trashDirectory();
    await requireDirectoryRoom(trash);
    const id = randomUUID(); const item = path.join(trash, id);
    await fs.mkdir(item, { mode: 0o700 });
    await fs.writeFile(path.join(item, 'metadata.json'), JSON.stringify({ path: relative, kind: original.kind, deletedAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
    try {
      requireVersion(await entry(directory, relative), body.expectedVersion);
      await fs.rename(source.filename, path.join(item, 'entry'));
    } catch (error) { await fs.unlink(path.join(item, 'metadata.json')); await fs.rmdir(item); throw error; }
    return { trashId: id, path: relative };
  }

  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    response.setHeader('X-Frame-Options', 'DENY');
    try {
      if (request.headers.host !== new URL(origin).host) fail(403, 'FORBIDDEN', 'Host 不匹配。');
      if (request.method === 'OPTIONS') fail(403, 'FORBIDDEN', '不允许跨域请求。');
      const url = new URL(request.url, origin);
      if (url.origin !== origin) fail(403, 'FORBIDDEN', '请求来源不匹配。');
      if (url.pathname.startsWith('/api/')) {
        if (url.search || request.headers['x-easymd-client'] !== '1' || request.headers['sec-fetch-site'] !== 'same-origin') fail(403, 'FORBIDDEN', '只允许 EasyMD 同源请求。');
        if (request.headers.origin && request.headers.origin !== origin) fail(403, 'FORBIDDEN', 'Origin 不匹配。');
        if (url.pathname === '/api/session' && request.method === 'GET') {
          sendJson(response, 200, { token, directory, workspaceId, limits: LIMITS }); return;
        }
        if (url.pathname !== '/api/fs' || request.method !== 'POST') fail(404, 'NOT_FOUND', '接口不存在。');
        if (request.headers.origin !== origin) fail(403, 'FORBIDDEN', '文件操作需要准确的 Origin。');
        const supplied = request.headers['x-easymd-token'];
        if (typeof supplied !== 'string' || Buffer.byteLength(supplied) !== Buffer.byteLength(token) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(token))) fail(401, 'UNAUTHORIZED', '会话已失效，请重新连接。');
        const body = await readJson(request);
        const result = pending.then(() => operate(body));
        pending = result.catch(() => {});
        sendJson(response, 200, await result); return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) fail(405, 'BAD_REQUEST', '不支持此请求方法。');
      if (request.headers.origin && request.headers.origin !== origin) fail(403, 'FORBIDDEN', '不允许跨域资源请求。');
      let relative;
      try { relative = decodeURIComponent(url.pathname).replace(/^\//, ''); } catch { fail(400, 'BAD_REQUEST', '资源路径无效。'); }
      if (!relative) relative = 'index.html';
      relative = documentPath(relative);
      const checked = await validatePath(staticDirectory, relative);
      if (!checked.stat.isFile() || !MIME[path.extname(relative)]) fail(404, 'NOT_FOUND', '资源不存在。');
      const file = await readRegular(checked.filename, 16 * 1024 * 1024);
      if (path.extname(relative) === '.html') response.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
      response.writeHead(200, { 'Content-Type': MIME[path.extname(relative)], 'Content-Length': file.bytes.length, 'Cache-Control': 'no-cache' });
      response.end(request.method === 'HEAD' ? undefined : file.bytes);
    } catch (error) {
      request.resume();
      const safe = publicError(error);
      if (!response.headersSent) sendJson(response, safe.status, { error: { code: safe.code, message: safe.message } });
      else response.destroy();
    }
  });
  server.maxHeadersCount = 32;
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { server, origin, root: directory, workspaceId, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i]; const value = process.argv[i + 1];
    if (!['--root', '--dist', '--port'].includes(key) || !value) throw new Error('Usage: node scripts/desktop-server.mjs [--root PATH] [--dist PATH] [--port PORT]');
    options[key.slice(2)] = key === '--port' ? Number(value) : value;
  }
  const app = await createDesktopServer(options);
  console.log(`EasyMD: ${app.origin}\nDocuments: ${app.root}`);
  const shutdown = () => app.close().then(() => process.exit(0));
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
}
