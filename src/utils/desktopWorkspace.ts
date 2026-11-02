import type { DocumentItem, FolderItem } from '../types';
import { validateEntryName } from './icloudSync';

interface Session { token: string; directory: string; workspaceId: string }
interface Entry { name: string; path: string; kind: 'file' | 'directory'; version: string; lastModified: number; size: number }
let session: Session | undefined;
let connectedWorkspaceId: string | undefined;

async function getSession(): Promise<Session> {
  if (session) return session;
  const response = await fetch('/api/session', {
    headers: { 'X-EasyMD-Client': '1' }, cache: 'no-store', signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('无法连接本机文稿服务；编辑仍保存在浏览器草稿中，请启动 EasyMD 文稿服务后重试。');
  const result = await response.json();
  if (typeof result.token !== 'string' || typeof result.workspaceId !== 'string' || typeof result.directory !== 'string') {
    throw new Error('本机文稿服务返回无效配置');
  }
  return session = result;
}

async function request<T>(operation: string, path: string, fields: Record<string, unknown> = {}, retry = true): Promise<T> {
  const current = await getSession();
  if (connectedWorkspaceId && current.workspaceId !== connectedWorkspaceId) throw new Error('文稿目录已改变，请重新打开应用');
  const response = await fetch('/api/fs', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-EasyMD-Client': '1', 'X-EasyMD-Token': current.token },
    body: JSON.stringify({ operation, path, ...fields }), cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  // A restarted service changes its session token. An unauthorized request has no side effects.
  if ((response.status === 401 || response.status === 403) && retry) {
    session = undefined;
    const renewed = await getSession();
    if (renewed.workspaceId !== current.workspaceId) throw new Error('文稿目录已改变，请重新打开应用以保留并迁移草稿');
    return request(operation, path, fields, false);
  }
  const result = await response.json();
  if (!response.ok) {
    const code = result.error?.code;
    const name = response.status === 404 || code === 'NOT_FOUND' ? 'NotFoundError'
      : code === 'TYPE_MISMATCH' ? 'TypeMismatchError' : 'OperationError';
    const error = new DOMException(result.error?.message || '文稿操作失败，草稿已保留', name);
    Object.defineProperty(error, 'status', { value: response.status });
    throw error;
  }
  return result;
}

function childPath(parent: string, name: string) {
  validateEntryName(name);
  return parent ? `${parent}/${name}` : name;
}

class DesktopHandle {
  constructor(public path: string, readonly kind: 'file' | 'directory', readonly workspaceId: string) {}
  get name() { return this.path.split('/').at(-1) || 'EasyMD'; }
  async queryPermission() { return 'granted' as const; }
  async requestPermission() { return 'granted' as const; }
  async isSameEntry(other: unknown) {
    return other instanceof DesktopHandle && other.workspaceId === this.workspaceId && other.path === this.path && other.kind === this.kind;
  }
  async move(name: string) {
    const entry = await request<Entry>('stat', this.path);
    const parent = this.path.split('/').slice(0, -1).join('/');
    const result = await request<Entry>('rename', this.path, { newPath: childPath(parent, name), expectedVersion: entry.version });
    this.path = result.path;
  }
}

class DesktopFile extends DesktopHandle {
  private version?: string;
  constructor(path: string, workspaceId: string, version?: string) { super(path, 'file', workspaceId); this.version = version; }
  async getFile() {
    const result = await request<{ content: string; version: string; lastModified: number }>('read', this.path);
    this.version = result.version;
    return new File([result.content], this.name, { type: 'text/plain', lastModified: result.lastModified });
  }
  async createWritable() {
    if (!this.version) this.version = (await request<Entry>('stat', this.path)).version;
    const expectedVersion = this.version;
    let content = '';
    let closed = false;
    return {
      write: async (value: string | Blob) => {
        if (closed) throw new Error('文件写入已结束');
        if (typeof value !== 'string' && !(value instanceof Blob)) throw new Error('仅支持文本内容');
        content = typeof value === 'string' ? value : await value.text();
      },
      close: async () => {
        if (closed) throw new Error('文件写入已结束');
        closed = true;
        const result = await request<Entry>('write', this.path, { content, expectedVersion });
        this.version = result.version;
      },
      abort: async () => { closed = true; },
    };
  }
}

class DesktopDirectory extends DesktopHandle {
  constructor(path: string, workspaceId: string) { super(path, 'directory', workspaceId); }
  async getFileHandle(name: string, options?: { create?: boolean }) {
    const path = childPath(this.path, name);
    let entry: Entry;
    try { entry = await request<Entry>('stat', path); }
    catch (error) {
      if (!options?.create || (error as Error).name !== 'NotFoundError') throw error;
      entry = await request<Entry>('create', path, { content: '' });
    }
    if (entry.kind !== 'file') throw new DOMException('该名称对应一个文件夹', 'TypeMismatchError');
    return new DesktopFile(path, this.workspaceId, entry.version) as unknown as FileSystemFileHandle;
  }
  async getDirectoryHandle(name: string, options?: { create?: boolean }) {
    const path = childPath(this.path, name);
    let entry: Entry;
    try { entry = await request<Entry>('stat', path); }
    catch (error) {
      if (!options?.create || (error as Error).name !== 'NotFoundError') throw error;
      entry = await request<Entry>('mkdir', path);
    }
    if (entry.kind !== 'directory') throw new DOMException('该名称对应一个文件', 'TypeMismatchError');
    return new DesktopDirectory(path, this.workspaceId) as unknown as FileSystemDirectoryHandle;
  }
  async *entries() {
    const result = await request<{ entries: Entry[] }>('list', this.path);
    for (const entry of result.entries) yield [entry.name, entry.kind === 'file'
      ? new DesktopFile(entry.path, this.workspaceId, entry.version) : new DesktopDirectory(entry.path, this.workspaceId)] as const;
  }
  async resolve(other: unknown) {
    if (!(other instanceof DesktopHandle) || other.workspaceId !== this.workspaceId) return null;
    if (other.path === this.path) return [];
    const prefix = this.path ? `${this.path}/` : '';
    return other.path.startsWith(prefix) ? other.path.slice(prefix.length).split('/') : null;
  }
  async removeEntry(name: string) {
    const path = childPath(this.path, name);
    const entry = await request<Entry>('stat', path);
    await request('trash', path, { expectedVersion: entry.version });
  }
}

export function isDesktopHandle(value: unknown): boolean { return value instanceof DesktopHandle; }
export function desktopBinding(handle: FileSystemFileHandle) {
  return handle instanceof DesktopFile ? { storageBackend: 'desktop' as const, storageRoot: handle.workspaceId, path: handle.path } : {};
}

export async function connectDesktopWorkspace() {
  session = undefined;
  const config = await getSession();
  if (connectedWorkspaceId && config.workspaceId !== connectedWorkspaceId) throw new Error('文稿目录已改变，请重新打开应用');
  connectedWorkspaceId = config.workspaceId;
  return { root: new DesktopDirectory('', config.workspaceId) as unknown as FileSystemDirectoryHandle, directory: config.directory, workspaceId: config.workspaceId };
}

function safeName(value: string, fallback: string) {
  let name = value.replace(/[\\/\x00-\x1f\x7f:]/g, '_').replace(/^\.+/, '').trim();
  while (new TextEncoder().encode(name).length > 180) name = Array.from(name).slice(0, -1).join('');
  return name || fallback;
}

const MIGRATIONS_KEY = 'easymd_desktop_migrations_v1';
interface Migration { workspaceId: string; id: string; path: string; hash: string }
function loadMigrations(): Migration[] {
  try {
    const records = JSON.parse(localStorage.getItem(MIGRATIONS_KEY) || '[]');
    return Array.isArray(records) ? records.filter((record) => record && ['workspaceId', 'id', 'path', 'hash'].every((key) => typeof record[key] === 'string')) : [];
  } catch { return []; }
}
async function contentHash(content: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Copies existing browser drafts into the fixed directory without overwriting existing files. */
export async function restoreDesktopDocuments(root: FileSystemDirectoryHandle, workspaceId: string, documents: DocumentItem[], folders: FolderItem[]) {
  const result: DocumentItem[] = [];
  const reserved = new Set<string>();
  const migrations = loadMigrations();
  for (const doc of documents) {
    if (doc.storageBackend === 'desktop' && doc.storageRoot === workspaceId && doc.path) {
      if (reserved.has(doc.path)) { result.push({ ...doc, fileHandle: null, isICloudFile: false }); continue; }
      try {
        const handle = new DesktopFile(doc.path, workspaceId) as unknown as FileSystemFileHandle;
        const content = await (await handle.getFile()).text();
        if (doc.lastSyncedContent === undefined && content !== doc.content) {
          result.push({ ...doc, fileHandle: null, isICloudFile: false });
          continue;
        }
        const dirty = doc.isModified || doc.content !== doc.lastSyncedContent;
        reserved.add(doc.path);
        result.push({ ...doc, fileHandle: handle, isICloudFile: true,
          content: dirty ? doc.content : content, lastSyncedContent: !dirty || content === doc.content ? content : doc.lastSyncedContent,
          isModified: dirty && doc.content !== content });
        continue;
      } catch (error) {
        // Missing or inaccessible disk files remain explicit drafts; never resurrect deleted files.
        result.push({ ...doc, fileHandle: null, isICloudFile: false });
        continue;
      }
    }
    // A previous startup may have closed after copying a file but before React
    // persisted its binding. The journal identifies only files this importer created.
    const migrated = migrations.find((item) => item.workspaceId === workspaceId && item.id === doc.id);
    if (migrated && !reserved.has(migrated.path)) {
      try {
        const handle = new DesktopFile(migrated.path, workspaceId) as unknown as FileSystemFileHandle;
        const disk = await (await handle.getFile()).text();
        const baselineMatches = await contentHash(disk) === migrated.hash;
        reserved.add(migrated.path);
        result.push({ ...doc, ...desktopBinding(handle), title: handle.name, fileHandle: handle, isICloudFile: true,
          lastSyncedContent: baselineMatches ? disk : doc.content, isModified: doc.content !== disk });
        continue;
      } catch {
        // Never re-create a previously imported file that has since been removed.
        result.push({ ...doc, storageBackend: 'desktop', storageRoot: workspaceId, path: migrated.path, fileHandle: null, isICloudFile: false });
        continue;
      }
    }
    let parent = root;
    const chain: FolderItem[] = [];
    const seen = new Set<string>();
    let folder = folders.find((item) => item.id === doc.folderId);
    while (folder && !seen.has(folder.id) && chain.length < 15) {
      seen.add(folder.id); chain.unshift(folder);
      folder = folders.find((item) => item.id === folder!.parentId);
    }
    if (folder) throw new Error('文稿目录超过 16 层，请整理目录后重试；浏览器草稿已保留');
    for (const item of chain) parent = await parent.getDirectoryHandle(safeName(item.name, '文稿'), { create: true });
    const extension = doc.mode === 'h5' ? 'html' : doc.mode;
    let name = safeName(doc.title, `文稿.${extension}`);
    if (!/\.(md|markdown|html?|txt|log)$/i.test(name)) name += `.${extension}`;
    const base = name.replace(/\.[^.]+$/, '');
    const suffix = name.slice(base.length);
    const parentPath = (await root.resolve(parent))!.join('/');
    let handle: FileSystemFileHandle | undefined;
    for (let attempt = 0; attempt < 100 && !handle; attempt++) {
      const candidate = attempt === 0 ? name : `${base} (${safeName(doc.id, '导入').slice(0, 32)}${attempt > 1 ? `-${attempt}` : ''})${suffix}`;
      const path = childPath(parentPath, candidate);
      if (reserved.has(path)) continue;
      try {
        const entry = await request<Entry>('create', path, { content: doc.content });
        handle = new DesktopFile(entry.path, workspaceId, entry.version) as unknown as FileSystemFileHandle;
        name = candidate; reserved.add(path);
        migrations.push({ workspaceId, id: doc.id, path, hash: await contentHash(doc.content) });
        // If storage is full, leave the copy and the original draft intact and
        // report the failure instead of pretending the migration was durable.
        localStorage.setItem(MIGRATIONS_KEY, JSON.stringify(migrations));
      } catch (error) {
        // Only a name collision may be retried; quota or permission errors must remain visible.
        if ((error as Error & { status?: number }).status !== 409) throw error;
      }
    }
    if (!handle) throw new Error(`无法为“${doc.title}”创建独立文稿，原草稿已保留`);
    result.push({ ...doc, ...desktopBinding(handle), title: name, fileHandle: handle,
      isICloudFile: true, lastSyncedContent: doc.content, isModified: false });
  }
  return result;
}
