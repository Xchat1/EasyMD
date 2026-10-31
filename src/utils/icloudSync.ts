/**
 * iCloud / Local Document Directory Sync via File System Access API
 * Supported on macOS Chrome, Edge, and modern WebKit browsers.
 * Directly maps to ~/Library/Mobile Documents/com~apple~CloudDocs/ (iCloud Drive)
 */

export interface ICloudFileItem {
  name: string;
  path: string;
  handle: FileSystemFileHandle;
  size: number;
  lastModified: number;
  mode: 'md' | 'h5' | 'txt';
}

export interface ICloudNode {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  handle: FileSystemFileHandle | FileSystemDirectoryHandle;
  children?: ICloudNode[];
  size?: number;
  lastModified?: number;
  mode?: 'md' | 'h5' | 'txt';
  isExpanded?: boolean;
}

const DB_NAME = 'easymd_fs_db';
const DB_STORE = 'handles';
const DB_KEY = 'icloud_dir_handle';

// Check if File System Directory Access is supported
export function isDirectoryPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// Open IndexedDB database
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Persist Directory Handle to IndexedDB
export async function saveStoredDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(handle, DB_KEY);
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to save directory handle to IndexedDB:', err);
  }
}

// Retrieve Stored Directory Handle from IndexedDB
export async function getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(DB_KEY);
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// Clear Stored Directory Handle
export async function clearStoredDirectoryHandle(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(DB_KEY);
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore error
  }
}

// Verify or request read/write permission on handle
export async function verifyPermission(
  fileHandle: FileSystemHandle,
  readWrite: boolean = true
): Promise<boolean> {
  const options = {
    mode: readWrite ? 'readwrite' : 'read',
  };
  try {
    const handleWithPerm = fileHandle as unknown as {
      queryPermission: (opt: { mode: string }) => Promise<string>;
      requestPermission: (opt: { mode: string }) => Promise<string>;
    };

    if (typeof handleWithPerm.queryPermission === 'function') {
      if ((await handleWithPerm.queryPermission(options)) === 'granted') {
        return true;
      }
    }
    if (typeof handleWithPerm.requestPermission === 'function') {
      if ((await handleWithPerm.requestPermission(options)) === 'granted') {
        return true;
      }
    }
    return true;
  } catch (err) {
    console.warn('Permission query/request error:', err);
    return false;
  }
}

// Choose an iCloud or Local Directory via macOS native Finder dialog
export async function chooseICloudDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isDirectoryPickerSupported()) {
    throw new Error('当前浏览器暂不支持目录直接挂载，请使用 macOS Chrome / Edge / 支持 File System Access API 的浏览器');
  }

  try {
    const windowWithFS = window as unknown as {
      showDirectoryPicker: (opt: {
        id?: string;
        mode?: string;
        startIn?: string;
      }) => Promise<FileSystemDirectoryHandle>;
    };

    const dirHandle = await windowWithFS.showDirectoryPicker({
      id: 'easymd-icloud-dir',
      mode: 'readwrite',
      startIn: 'documents',
    });

    await saveStoredDirectoryHandle(dirHandle);
    return dirHandle;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return null;
    }
    throw err;
  }
}

// Determine file document mode by extension
export function detectFileMode(fileName: string): 'md' | 'h5' | 'txt' {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'h5';
  if (lower.endsWith('.txt') || lower.endsWith('.log')) return 'txt';
  return 'md';
}

// Recursive directory tree scanner (supports subdirectories)
export async function listDirectoryTree(
  dirHandle: FileSystemDirectoryHandle,
  currentPath: string = '',
  depth: number = 0
): Promise<ICloudNode[]> {
  if (depth > 6) return []; // safety limit
  const nodes: ICloudNode[] = [];

  try {
    const hasPermission = await verifyPermission(dirHandle, false);
    if (!hasPermission) return [];

    // @ts-expect-error - entries is standard in FileSystemDirectoryHandle
    for await (const [name, handle] of dirHandle.entries()) {
      if (name.startsWith('.')) continue; // skip hidden files

      const nodePath = currentPath ? `${currentPath}/${name}` : name;

      if (handle.kind === 'directory') {
        const subNodes = await listDirectoryTree(
          handle as FileSystemDirectoryHandle,
          nodePath,
          depth + 1
        );
        nodes.push({
          name,
          path: nodePath,
          kind: 'directory',
          handle: handle as FileSystemDirectoryHandle,
          children: subNodes,
          isExpanded: true,
        });
      } else if (handle.kind === 'file') {
        const lowerName = name.toLowerCase();
        if (
          lowerName.endsWith('.md') ||
          lowerName.endsWith('.markdown') ||
          lowerName.endsWith('.html') ||
          lowerName.endsWith('.htm') ||
          lowerName.endsWith('.txt') ||
          lowerName.endsWith('.log')
        ) {
          try {
            const file = await (handle as FileSystemFileHandle).getFile();
            nodes.push({
              name,
              path: nodePath,
              kind: 'file',
              handle: handle as FileSystemFileHandle,
              size: file.size,
              lastModified: file.lastModified,
              mode: detectFileMode(name),
            });
          } catch (err) {
            console.warn(`Failed to read file ${name}:`, err);
          }
        }
      }
    }

    // Sort: directories first (alphabetical), then files (alphabetical)
    nodes.sort((a, b) => {
      if (a.kind === b.kind) {
        return a.name.localeCompare(b.name, 'zh-CN');
      }
      return a.kind === 'directory' ? -1 : 1;
    });
  } catch (err) {
    console.error('Error scanning directory tree:', err);
  }

  return nodes;
}

// Flat list of all files in directory tree (for quick access and search)
export function flattenICloudTree(nodes: ICloudNode[]): ICloudFileItem[] {
  const result: ICloudFileItem[] = [];

  function traverse(list: ICloudNode[]) {
    for (const item of list) {
      if (item.kind === 'file') {
        result.push({
          name: item.name,
          path: item.path,
          handle: item.handle as FileSystemFileHandle,
          size: item.size || 0,
          lastModified: item.lastModified || 0,
          mode: item.mode || 'md',
        });
      } else if (item.children) {
        traverse(item.children);
      }
    }
  }

  traverse(nodes);
  return result;
}

// Read content from file handle
export async function readICloudFileContent(fileHandle: FileSystemFileHandle): Promise<string> {
  const file = await fileHandle.getFile();
  return await file.text();
}

// Write content to file handle (Directly syncs to iCloud Drive on macOS)
export async function writeICloudFileContent(
  fileHandle: FileSystemFileHandle,
  content: string
): Promise<boolean> {
  try {
    const hasPermission = await verifyPermission(fileHandle, true);
    if (!hasPermission) return false;

    const handleWithCreate = fileHandle as unknown as {
      createWritable: () => Promise<FileSystemWritableFileStream>;
    };
    const writable = await handleWithCreate.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch (err) {
    console.error('Error writing to iCloud file:', err);
    return false;
  }
}

// Create new file inside iCloud directory or subdirectory
export async function createICloudFile(
  targetDirHandle: FileSystemDirectoryHandle,
  fileName: string,
  initialContent: string
): Promise<FileSystemFileHandle | null> {
  try {
    const hasPermission = await verifyPermission(targetDirHandle, true);
    if (!hasPermission) return null;

    const fileHandle = await targetDirHandle.getFileHandle(fileName, { create: true });
    const handleWithCreate = fileHandle as unknown as {
      createWritable: () => Promise<FileSystemWritableFileStream>;
    };
    const writable = await handleWithCreate.createWritable();
    await writable.write(initialContent);
    await writable.close();
    return fileHandle;
  } catch (err) {
    console.error('Error creating file in iCloud directory:', err);
    return null;
  }
}

// Create new folder/subdirectory inside iCloud directory
export async function createICloudDirectory(
  parentDirHandle: FileSystemDirectoryHandle,
  folderName: string
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const hasPermission = await verifyPermission(parentDirHandle, true);
    if (!hasPermission) return null;

    return await parentDirHandle.getDirectoryHandle(folderName, { create: true });
  } catch (err) {
    console.error('Error creating directory in iCloud:', err);
    return null;
  }
}

// Rename file or folder in iCloud
export async function renameICloudEntry(
  parentDirHandle: FileSystemDirectoryHandle,
  oldName: string,
  newName: string,
  isDirectory: boolean
): Promise<boolean> {
  try {
    const hasPermission = await verifyPermission(parentDirHandle, true);
    if (!hasPermission) return false;

    // Check if browser supports handle.move()
    if (isDirectory) {
      const dirHandle = await parentDirHandle.getDirectoryHandle(oldName);
      const handleWithMove = dirHandle as unknown as {
        move?: (name: string) => Promise<void>;
      };
      if (typeof handleWithMove.move === 'function') {
        await handleWithMove.move(newName);
        return true;
      }
    } else {
      const fileHandle = await parentDirHandle.getFileHandle(oldName);
      const handleWithMove = fileHandle as unknown as {
        move?: (name: string) => Promise<void>;
      };
      if (typeof handleWithMove.move === 'function') {
        await handleWithMove.move(newName);
        return true;
      }

      // Fallback for file renaming: copy content to new file and delete old
      const content = await readICloudFileContent(fileHandle);
      await createICloudFile(parentDirHandle, newName, content);
      await parentDirHandle.removeEntry(oldName);
      return true;
    }

    return false;
  } catch (err) {
    console.error(`Error renaming ${oldName} to ${newName}:`, err);
    return false;
  }
}

// Delete file or folder from iCloud directory
export async function deleteICloudEntry(
  parentDirHandle: FileSystemDirectoryHandle,
  name: string,
  isDirectory: boolean = false
): Promise<boolean> {
  try {
    const hasPermission = await verifyPermission(parentDirHandle, true);
    if (!hasPermission) return false;

    await parentDirHandle.removeEntry(name, { recursive: isDirectory });
    return true;
  } catch (err) {
    console.error(`Error deleting entry ${name} from iCloud directory:`, err);
    return false;
  }
}
