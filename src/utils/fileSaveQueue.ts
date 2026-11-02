import { readICloudFileContent, verifyPermission } from './icloudSync';
import { isUsableFileHandle } from './documentStorage';

export class FileConflictError extends Error {
  constructor() {
    super('磁盘文件已被其他应用或设备修改，已保留当前草稿。请重新打开文件并比较内容后再保存。');
    this.name = 'FileConflictError';
  }
}

export interface FileSaveEvent {
  id: string;
  content: string;
  status: 'pending' | 'saving' | 'saved' | 'error';
  error?: Error;
}

interface Snapshot { content: string }
interface Binding {
  id: string;
  handle: FileSystemFileHandle;
  baseline: string;
  pending?: Snapshot;
  failedSnapshot?: Snapshot;
  error?: Error;
  timer?: ReturnType<typeof setTimeout>;
  active?: Promise<void>;
  activeContent?: string;
}

export interface FileSaveQueueOptions {
  delayMs?: number;
  onStatus: (event: FileSaveEvent) => void;
}

/** One serial writer per document; changing the selected document never cancels saves. */
export class FileSaveQueue {
  private readonly bindings = new Map<string, Binding>();
  // Keep native writes serialized even when cancel/bind replaces the binding object.
  private readonly writers = new Map<string, Promise<void>>();
  private readonly delayMs: number;
  private readonly onStatus: FileSaveQueueOptions['onStatus'];

  constructor({ delayMs = 400, onStatus }: FileSaveQueueOptions) {
    this.delayMs = delayMs;
    this.onStatus = onStatus;
  }

  /** Call after reading a valid handle. Flush first before deliberately rebinding a dirty document. */
  bind(id: string, handle: FileSystemFileHandle, diskContent: string): void {
    if (!isUsableFileHandle(handle)) throw new Error('文稿句柄已失效，请重新打开文件');
    this.cancel(id);
    this.bindings.set(id, { id, handle, baseline: diskContent });
  }

  isBound(id: string): boolean { return this.bindings.has(id); }

  schedule(id: string, content: string): void {
    const binding = this.bindings.get(id);
    if (!binding) throw new Error('文稿尚未绑定有效文件句柄');
    if (binding.pending?.content === content) return;
    if (!binding.pending && !binding.active && binding.failedSnapshot?.content === content) return;
    if (binding.activeContent === content) {
      // A revert to the in-flight snapshot removes a superseded pending draft.
      if (binding.timer) clearTimeout(binding.timer);
      binding.timer = undefined;
      binding.pending = undefined;
      return;
    }
    if (binding.timer) clearTimeout(binding.timer);
    binding.pending = { content };
    binding.error = undefined;
    binding.failedSnapshot = undefined;
    this.emit(binding, content, 'pending');
    binding.timer = setTimeout(() => {
      binding.timer = undefined;
      void this.start(binding);
    }, this.delayMs);
  }

  /** Saves all work queued for this document (or all documents), including an explicit retry. */
  async flush(id?: string): Promise<boolean> {
    const targets = id ? [this.bindings.get(id)].filter((b): b is Binding => !!b) : [...this.bindings.values()];
    const results = await Promise.all(targets.map(async (binding) => {
      if (binding.timer) clearTimeout(binding.timer);
      binding.timer = undefined;
      // Retry an earlier failure once, but never spin on a failure from this flush.
      if (!binding.active && !binding.pending && binding.failedSnapshot) {
        binding.pending = binding.failedSnapshot;
        binding.error = undefined;
      }
      if (!binding.active && binding.pending) binding.error = undefined;
      while (true) {
        if (!this.isCurrent(binding)) return true;
        if (binding.active) {
          await binding.active;
          // Completion may have started a newer snapshot; always inspect it again.
          continue;
        }
        if (binding.error) return false;
        if (!binding.pending) return true;
        if (binding.timer) clearTimeout(binding.timer);
        binding.timer = undefined;
        await this.start(binding);
      }
    }));
    return results.every(Boolean);
  }

  /** Cancels pending work and detaches. An already-started native write cannot be undone. */
  cancel(id?: string): void {
    const targets = id ? [this.bindings.get(id)] : [...this.bindings.values()];
    for (const binding of targets) {
      if (!binding) continue;
      if (binding.timer) clearTimeout(binding.timer);
      this.bindings.delete(binding.id);
    }
  }

  private isCurrent(binding: Binding): boolean { return this.bindings.get(binding.id) === binding; }

  private emit(binding: Binding, content: string, status: FileSaveEvent['status'], error?: Error): void {
    if (!this.isCurrent(binding)) return;
    try { this.onStatus({ id: binding.id, content, status, error }); }
    catch (cause) { console.warn('Unable to display file save status:', cause); }
  }

  private start(binding: Binding): Promise<void> {
    if (binding.active) return binding.active;
    const snapshot = binding.pending;
    if (!snapshot || !this.isCurrent(binding)) return Promise.resolve();
    binding.pending = undefined;
    binding.error = undefined;
    binding.activeContent = snapshot.content;
    const priorWrite = this.writers.get(binding.id);
    const operation = Promise.resolve(priorWrite).then(async () => {
      if (this.isCurrent(binding)) await this.save(binding, snapshot);
    });
    this.writers.set(binding.id, operation);
    binding.active = operation.finally(() => {
      if (this.writers.get(binding.id) === operation) this.writers.delete(binding.id);
      binding.active = undefined;
      binding.activeContent = undefined;
      if (binding.pending && !binding.timer && this.isCurrent(binding)) void this.start(binding);
    });
    return binding.active;
  }

  private async save(binding: Binding, snapshot: Snapshot): Promise<void> {
    let writable: FileSystemWritableFileStream | undefined;
    try {
      this.emit(binding, snapshot.content, 'saving');
      const permitted = await verifyPermission(binding.handle, true);
      if (!this.isCurrent(binding)) return;
      if (!permitted) throw new Error('没有文件写入权限；草稿尚未同步');
      // Read after permission acquisition, which can involve a delayed user prompt.
      const diskContent = await readICloudFileContent(binding.handle);
      if (!this.isCurrent(binding)) return;
      if (diskContent !== binding.baseline && diskContent !== snapshot.content) throw new FileConflictError();
      // A server may commit a write before its response is lost. If the disk now
      // exactly matches this draft, acknowledge it without rewriting or conflicting.
      if (snapshot.content !== diskContent) {
        writable = await binding.handle.createWritable();
        if (!this.isCurrent(binding)) { await writable.abort(); return; }
        await writable.write(snapshot.content);
        if (!this.isCurrent(binding)) { await writable.abort(); return; }
        await writable.close();
        writable = undefined;
        if (!this.isCurrent(binding)) return;
      }
      binding.baseline = snapshot.content;
      binding.error = undefined;
      binding.failedSnapshot = undefined;
      // The consumer must compare this snapshot with the latest draft before clearing dirty state.
      this.emit(binding, snapshot.content, 'saved');
    } catch (cause) {
      try { await writable?.abort(); } catch { /* Keep the original error. */ }
      binding.error = cause instanceof Error ? cause : new Error(String(cause));
      binding.failedSnapshot = snapshot;
      this.emit(binding, snapshot.content, 'error', binding.error);
    }
  }
}
