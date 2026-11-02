import type { DocumentItem, FolderItem } from '../types';

// Handles are structured-cloned separately in IndexedDB, never JSON encoded.
export function serializeDocuments(documents: DocumentItem[]): string {
  return JSON.stringify(documents.map(({ fileHandle: _handle, ...doc }) => doc));
}

export function parseDocuments(raw: string): DocumentItem[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((value): DocumentItem[] => {
    if (!isRecord(value) || typeof value.content !== 'string') return [];
    const originalId = validId(value.id);
    const duplicate = !!originalId && ids.has(originalId);
    const id = originalId && !duplicate ? originalId : crypto.randomUUID();
    ids.add(id);
    const title = typeof value.title === 'string' && value.title.trim() ? value.title : '恢复的文稿.md';
    const mode = value.mode === 'md' || value.mode === 'h5' || value.mode === 'txt' ? value.mode
      : /\.html?$/i.test(title) ? 'h5' : /\.(txt|log)$/i.test(title) ? 'txt' : 'md';
    const path = validPath(value.path);
    const desktop = value.storageBackend === 'desktop';
    const storageRoot = validId(value.storageRoot);
    // A repaired/duplicate ID must not inherit another document's disk binding.
    const canRestore = !!originalId && !duplicate && (!desktop || (!!path && !!storageRoot));
    const lastSyncedContent = typeof value.lastSyncedContent === 'string' ? value.lastSyncedContent : undefined;
    const document: DocumentItem = {
      id, title, mode, content: value.content,
      updatedAt: validTimestamp(value.updatedAt),
      folderId: validId(value.folderId) || null,
      fileHandle: null,
      isICloudFile: canRestore && value.isICloudFile === true,
      isModified: value.isModified === true,
      ...(canRestore ? { path, lastSyncedContent } : {}),
      ...(canRestore && desktop ? { storageBackend: 'desktop', storageRoot } : {}),
    };
    // The welcome document is identified by its fixed seed ID and exact Markdown
    // heading, not just its display title. Never rename a real external file here.
    if (originalId === 'doc-md-welcome' && !duplicate
      && !value.isICloudFile && !value.storageBackend && !value.path && !value.fileHandle
      && /^(?:未命名(?:文档)?(?:\.(?:md|markdown|txt|html|htm))?|欢迎使用\.md)$/i.test(title)
      && /^\uFEFF?# EasyMD 快速指南\r?(?:\n|$)/.test(value.content)) {
      document.title = 'EasyMD 快速指南.md';
    }
    return [document];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validId(value: unknown): string | undefined {
  return typeof value === 'string' && !!value.trim() && !/[\x00-\x1f\x7f]/.test(value) ? value : undefined;
}

function validTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function validPath(value: unknown): string | undefined {
  return typeof value === 'string' && !/[\\\x00-\x1f\x7f]/.test(value)
    && value.split('/').every((part) => !!part && !part.startsWith('.')) ? value : undefined;
}

/** Repairs folder graphs into a forest so corrupt metadata cannot hide whole subtrees. */
export function parseFolders(raw: string): FolderItem[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const folders = value.flatMap((value): FolderItem[] => {
    if (!isRecord(value) || typeof value.name !== 'string' || !value.name.trim()) return [];
    const candidate = validId(value.id);
    const id = candidate && !ids.has(candidate) ? candidate : crypto.randomUUID();
    ids.add(id);
    return [{ id, name: value.name, parentId: validId(value.parentId) || null,
      isExpanded: value.isExpanded !== false, createdAt: validTimestamp(value.createdAt) }];
  });
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  // Resolve parent chains iteratively: input may contain cycles or very deep trees.
  const resolved = new Set<string>();
  for (const folder of folders) {
    let current: FolderItem | undefined = folder;
    const chain = new Set<string>();
    while (current && !resolved.has(current.id)) {
      chain.add(current.id);
      if (!current.parentId) break;
      const parent = byId.get(current.parentId);
      if (!parent || chain.has(parent.id)) {
        current.parentId = null;
        break;
      }
      current = parent;
    }
    chain.forEach((id) => resolved.add(id));
  }
  const depths = new Map<string, number>();
  for (const folder of folders) {
    let current: FolderItem | undefined = folder;
    const chain: FolderItem[] = [];
    while (current && !depths.has(current.id)) {
      chain.push(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    for (const item of chain.reverse()) {
      const parentDepth = item.parentId ? depths.get(item.parentId) || 0 : 0;
      // Preserve every node and its documents; only flatten pathological nesting.
      if (parentDepth >= 64) item.parentId = null;
      depths.set(item.id, item.parentId ? parentDepth + 1 : 1);
    }
  }
  return folders;
}

export function removeFolderTree(folders: FolderItem[], documents: DocumentItem[], folderId: string) {
  const removed = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && removed.has(folder.parentId) && !removed.has(folder.id)) {
        removed.add(folder.id);
        changed = true;
      }
    }
  }
  return {
    folders: folders.filter((folder) => !removed.has(folder.id)),
    documents: documents.map((doc) => doc.folderId && removed.has(doc.folderId)
      ? { ...doc, folderId: null } : doc),
  };
}
