/** File handles must use IndexedDB's structured clone, never JSON/localStorage. */
const DATABASE = 'easymd_document_handles_v1';
const STORE = 'document_handles';

export interface DocumentHandleEntry {
  id: string;
  handle: FileSystemFileHandle;
}

export function isUsableFileHandle(value: unknown): value is FileSystemFileHandle {
  return !!value && typeof value === 'object'
    && (value as FileSystemFileHandle).kind === 'file'
    && typeof (value as FileSystemFileHandle).getFile === 'function'
    && typeof (value as FileSystemFileHandle).createWritable === 'function';
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let abandoned = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => {
      if (abandoned) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      abandoned = true;
      reject(new Error('文稿句柄数据库被其他窗口阻塞，请关闭旧窗口后重试'));
    };
  });
}

// Preserve ordering when React effects save snapshots while a disconnect clears them.
let mutations: Promise<void> = Promise.resolve();

function mutate(change: (store: IDBObjectStore) => void): Promise<void> {
  const operation = mutations.catch(() => undefined).then(async () => {
    const db = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE, 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error('句柄保存事务被取消'));
        try {
          change(transaction.objectStore(STORE));
        } catch (error) {
          transaction.abort();
          reject(error);
        }
      });
    } finally {
      db.close();
    }
  });
  mutations = operation;
  return operation;
}

/** Replaces the full handle set. Document IDs are stable IDs, independent of names. */
export async function saveDocumentHandles(entries: DocumentHandleEntry[]): Promise<void> {
  const ids = new Set<string>();
  const snapshot = entries.map(({ id, handle }) => {
    if (typeof id !== 'string' || !id.trim() || ids.has(id) || !isUsableFileHandle(handle)) {
      throw new Error('无法保存无效或重复的文稿句柄');
    }
    ids.add(id);
    return { id, handle };
  });
  return mutate((store) => {
    store.clear();
    for (const { id, handle } of snapshot) store.put(handle, id);
  });
}

export async function loadDocumentHandles(): Promise<Map<string, FileSystemFileHandle>> {
  await mutations.catch(() => undefined);
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const handles = new Map<string, FileSystemFileHandle>();
      const transaction = db.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        // Old JSON-restored {} values are deliberately never treated as handles.
        if (typeof cursor.key === 'string' && isUsableFileHandle(cursor.value)) {
          handles.set(cursor.key, cursor.value);
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve(handles);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('句柄读取事务被取消'));
    });
  } finally {
    db.close();
  }
}

/** Clear all bindings on disconnect, or selected document IDs after deletion. */
export function clearDocumentHandles(ids?: string[]): Promise<void> {
  const snapshot = ids?.slice();
  return mutate((store) => {
    if (snapshot) snapshot.forEach((id) => store.delete(id));
    else store.clear();
  });
}
