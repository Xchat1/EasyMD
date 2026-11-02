import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { MacTitleBar } from './components/MacTitleBar';
import { EditorToolbar } from './components/EditorToolbar';
import { EditorArea } from './components/EditorArea';
import { PreviewArea } from './components/PreviewArea';
import { OutlineSidebar } from './components/OutlineSidebar';
import { ExportModal } from './components/ExportModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { SettingsModal } from './components/SettingsModal';
import { StatusBar } from './components/StatusBar';
import { ICloudGuideModal } from './components/ICloudGuideModal';
import {
  DocMode,
  ViewLayout,
  ThemeMode,
  DocumentItem,
  FolderItem,
  EditorSettings,
  ICloudDirState,
} from './types';
import { TEMPLATES } from './utils/templates';
import { extractToc, calculateDocStats } from './utils/markdown';
import { openLocalFile, downloadFile, exportDocumentHtml, printDocument, copyDocumentRichText } from './utils/fileSystem';
import { parseDocuments, parseFolders, serializeDocuments, removeFolderTree } from './utils/documents';
import { connectDesktopWorkspace, restoreDesktopDocuments, desktopBinding } from './utils/desktopWorkspace';
import { FileSaveQueue } from './utils/fileSaveQueue';
import { useWorkspaceLock } from './hooks/useWorkspaceLock';
import {
  listDirectoryTree,
  flattenICloudTree,
  readICloudFileContent,
  createICloudFile,
  createICloudDirectory,
  renameICloudEntry,
  deleteICloudEntry,
  detectFileMode,
  ICloudNode,
} from './utils/icloudSync';
import { useDialog } from './context/DialogContext';
import type { DesktopOpenedFile } from './types/desktop';

const STORAGE_KEY_DOCS = 'easymd_documents_v1';
const STORAGE_KEY_FOLDERS = 'easymd_folders_v1';
const STORAGE_KEY_CURRENT_ID = 'easymd_current_doc_id';
const STORAGE_KEY_SETTINGS = 'easymd_settings_v1';
const STORAGE_KEY_THEME = 'easymd_theme_v1';
const STORAGE_KEY_SIDEBAR_WIDTH = 'easymd_sidebar_width_v1';

function readStoredPreference(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function App() {
  const { confirm, prompt, toast } = useDialog();
  const workspace = useWorkspaceLock();
  // Fresh browser profiles must open an existing workspace instead of importing
  // the built-in examples over and over after an uninstall or data reset.
  const initialExamplesRef = useRef(readStoredPreference(STORAGE_KEY_DOCS) === null);
  const writableRef = useRef(workspace.isWritable);
  writableRef.current = workspace.isWritable;

  // 1. Folders State
  const [folders, setFolders] = useState<FolderItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FOLDERS);
      if (saved) {
        return parseFolders(saved);
      }
    } catch (e) {
      console.warn('Failed to parse saved folders from localStorage', e);
    }
    return [
      { id: 'folder-work', name: '工作笔记', isExpanded: true, createdAt: Date.now() },
      { id: 'folder-h5', name: 'H5 移动原型', isExpanded: true, createdAt: Date.now() },
    ];
  });

  // 2. Documents State
  const [documents, setDocuments] = useState<DocumentItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DOCS);
      if (saved) {
        const parsed = parseDocuments(saved);
        if (parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse saved documents from localStorage', e);
    }
    // Default initial documents
    return [
      {
        id: 'doc-md-welcome',
        title: TEMPLATES.md.title,
        content: TEMPLATES.md.content,
        mode: 'md',
        folderId: 'folder-work',
        updatedAt: Date.now(),
        isModified: false,
      },
      {
        id: 'doc-h5-card',
        title: TEMPLATES.h5.title,
        content: TEMPLATES.h5.content,
        mode: 'h5',
        folderId: 'folder-h5',
        updatedAt: Date.now(),
        isModified: false,
      },
      {
        id: 'doc-txt-notes',
        title: TEMPLATES.txt.title,
        content: TEMPLATES.txt.content,
        mode: 'txt',
        folderId: 'folder-work',
        updatedAt: Date.now(),
        isModified: false,
      },
    ];
  });

  const [currentDocId, setCurrentDocId] = useState<string>(() => {
    return readStoredPreference(STORAGE_KEY_CURRENT_ID) || 'doc-md-welcome';
  });

  // Current document fallback
  const currentDoc = useMemo(() => {
    return documents.find((d) => d.id === currentDocId) || documents[0];
  }, [documents, currentDocId]);

  // Sync concise window title
  useEffect(() => {
    if (currentDoc?.title) {
      document.title = `${currentDoc.title} · EasyMD`;
    } else {
      document.title = 'EasyMD';
    }
  }, [currentDoc?.title]);

  // Layout & Theme State
  const [layout, setLayout] = useState<ViewLayout>('split');
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = readStoredPreference(STORAGE_KEY_THEME);
    return saved === 'dark' || saved === 'system' ? saved : 'light';
  });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const effectiveTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SIDEBAR_WIDTH);
      if (saved) {
        const val = Number(saved);
        if (val >= 160 && val <= 500) return val;
      }
    } catch {
      // ignore
    }
    return 220; // Compact default width
  });
  const [isDraggingSidebar, setIsDraggingSidebar] = useState<boolean>(false);
  const [splitRatio, setSplitRatio] = useState<number>(50); // percentage for editor
  const [isDraggingSplit, setIsDraggingSplit] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({ line: 1, col: 1 });
  const [localSaveError, setLocalSaveError] = useState<string | null>(null);
  const [syncStates, setSyncStates] = useState<Record<string, { status: string; error?: Error }>>({});
  const [handlesRestored, setHandlesRestored] = useState(false);
  const readyRef = useRef(false);
  readyRef.current = handlesRestored;
  const [workspaceDirectory, setWorkspaceDirectory] = useState('文稿/EasyMD');
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const desktopRestoreRef = useRef<Promise<Awaited<ReturnType<typeof connectDesktopWorkspace>> & { documents: DocumentItem[] }> | null>(null);
  const [isFileOperation, setIsFileOperation] = useState(false);
  const fileOperationRef = useRef(false);
  const pendingOpenFiles = useRef<DesktopOpenedFile[]>([]);
  const importingFile = useRef(false);
  const choosingFile = useRef(false);
  const [openFilesVersion, setOpenFilesVersion] = useState(0);
  const documentsRef = useRef(documents);
  documentsRef.current = documents;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const saveQueueRef = useRef<FileSaveQueue | null>(null);
  if (!saveQueueRef.current) {
    saveQueueRef.current = new FileSaveQueue({
      onStatus: (event) => {
        setSyncStates((prev) => ({ ...prev, [event.id]: event }));
        if (event.status === 'saved') {
          setDocuments((prev) => prev.map((doc) => doc.id === event.id ? {
            ...doc, lastSyncedContent: event.content, isModified: doc.content !== event.content,
          } : doc));
        } else if (event.status === 'error') {
          toastRef.current.error(`磁盘保存失败，草稿已保留：${event.error?.message || '请检查目录权限'}`, 6000);
        }
      },
    });
  }
  const saveQueue = saveQueueRef.current;
  const saveError = localSaveError || syncStates[currentDoc.id]?.error?.message;
  const isSaved = !saveError && (!currentDoc.isICloudFile || !currentDoc.isModified);

  // Settings State
  const [settings, setSettings] = useState<EditorSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Failed to parse settings', e);
    }
    return {
      fontSize: 14,
      lineNumbers: true,
      wordWrap: true,
      syncScroll: true,
      tabSize: 2,
      fontFamily: 'SF Mono',
    };
  });

  // Modals
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [networkAllowedDocs, setNetworkAllowedDocs] = useState<Set<string>>(() => new Set());
  const networkControllers = useRef(new Map<string, AbortController>());
  const allowNetwork = networkAllowedDocs.has(currentDoc.id);
  const networkSignal = networkControllers.current.get(currentDoc.id)?.signal;
  useEffect(() => {
    const revokeAll = () => {
      for (const controller of networkControllers.current.values()) controller.abort();
      networkControllers.current.clear();
    };
    window.addEventListener('pagehide', revokeAll);
    return () => { window.removeEventListener('pagehide', revokeAll); revokeAll(); };
  }, []);
  useEffect(() => {
    const ids = new Set(documents.map((doc) => doc.id));
    for (const [id, controller] of networkControllers.current) {
      if (!ids.has(id)) { controller.abort(); networkControllers.current.delete(id); }
    }
  }, [documents]);
  const handleToggleNetwork = async () => {
    const id = currentDoc.id;
    if (networkAllowedDocs.has(id)) {
      networkControllers.current.get(id)?.abort();
      networkControllers.current.delete(id);
      setNetworkAllowedDocs((previous) => { const next = new Set(previous); next.delete(id); return next; });
      return;
    }
    if (!await confirm({ title: '允许此文稿联网？',
      message: `“${currentDoc.title}”中的外部资源会访问对应网站，暴露网络地址；HTML 脚本也会运行，并可发送此文稿的内容。请只允许可信文稿。授权仅在本次打开应用期间有效。`,
      confirmText: '信任并允许', icon: 'warning' })) return;
    if (!documentsRef.current.some((doc) => doc.id === id)) return;
    networkControllers.current.set(id, new AbortController());
    setNetworkAllowedDocs((previous) => new Set(previous).add(id));
  };
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isICloudGuideOpen, setIsICloudGuideOpen] = useState<boolean>(false);

  // iCloud Directory State
  const [icloudDir, setIcloudDir] = useState<ICloudDirState>({
    handle: null,
    name: '',
    isSyncing: false,
    lastSyncedAt: null,
    filesCount: 0,
  });
  const [icloudTree, setIcloudTree] = useState<ICloudNode[]>([]);
  const mountedRootRef = useRef<FileSystemDirectoryHandle | null>(null);

  // Refs
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const prepareDesktopWorkspace = async () => {
    const connection = await connectDesktopWorkspace();
    if (initialExamplesRef.current) {
      const existing = flattenICloudTree(await listDirectoryTree(connection.root))[0];
      if (existing) {
        const content = await readICloudFileContent(existing.handle);
        const doc: DocumentItem = {
          ...desktopBinding(existing.handle), id: crypto.randomUUID(), title: existing.name,
          content, mode: existing.mode, updatedAt: Date.now(), isModified: false,
          fileHandle: existing.handle, isICloudFile: true, path: existing.path,
          lastSyncedContent: content,
        };
        initialExamplesRef.current = false;
        return { ...connection, documents: [doc] };
      }
    }
    const restored = await restoreDesktopDocuments(connection.root, connection.workspaceId, documentsRef.current, folders);
    initialExamplesRef.current = false;
    return { ...connection, documents: restored };
  };

  const applyDesktopWorkspace = async (connection: Awaited<ReturnType<typeof prepareDesktopWorkspace>>) => {
    mountedRootRef.current = connection.root;
    setWorkspaceDirectory(connection.directory);
    saveQueue.cancel();
    for (const doc of connection.documents) {
      if (doc.fileHandle && doc.lastSyncedContent !== undefined) saveQueue.bind(doc.id, doc.fileHandle, doc.lastSyncedContent);
    }
    setDocuments(connection.documents);
    setHandlesRestored(true);
    const tree = await listDirectoryTree(connection.root);
    setIcloudDir({ handle: connection.root, name: 'EasyMD', isSyncing: false, lastSyncedAt: null, filesCount: flattenICloudTree(tree).length });
    setIcloudTree(tree);
    setWorkspaceError(null);
  };

  // The desktop service owns one fixed directory. StrictMode reuses the same migration.
  useEffect(() => {
    if (!workspace.isWritable) return;
    let active = true;
    desktopRestoreRef.current ||= prepareDesktopWorkspace();
    void desktopRestoreRef.current.then(async (connection) => {
      if (active) await applyDesktopWorkspace(connection);
    }).catch((error) => {
      if (!active) return;
      desktopRestoreRef.current = null;
      setHandlesRestored(true);
      setWorkspaceError((error as Error).message || '无法连接固定文稿目录');
    });
    return () => { active = false; };
  }, [workspace.isWritable]);

  // Theme synchronization with HTML element
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => {
      setSystemDark(media.matches);
      document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches));
    };
    updateTheme();
    media.addEventListener('change', updateTheme);
    if (workspace.isWritable) {
      try { localStorage.setItem(STORAGE_KEY_THEME, theme); } catch { /* draft errors are shown separately */ }
    }
    return () => media.removeEventListener('change', updateTheme);
  }, [theme, workspace.isWritable]);

  // Settings & Folders persistence
  useEffect(() => {
    if (!workspace.isWritable) return;
    try { localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings)); }
    catch { toastRef.current.error('偏好设置未能保存，本地存储可能已满'); }
  }, [settings, workspace.isWritable]);

  useEffect(() => {
    if (!workspace.isWritable) return;
    try { localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(folders)); }
    catch { toastRef.current.error('目录结构未能保存，请导出文稿备份'); }
  }, [folders, workspace.isWritable]);

  // Persist drafts immediately. Disk writes use independent queues for every document.
  useEffect(() => {
    if (!workspace.isWritable) return;
    try {
      localStorage.setItem(STORAGE_KEY_DOCS, serializeDocuments(documents));
      localStorage.setItem(STORAGE_KEY_CURRENT_ID, currentDocId);
      setLocalSaveError(null);
    } catch {
      setLocalSaveError('本地存储已满或不可用，请立即导出备份');
    }
    if (!handlesRestored) return;
    for (const doc of documents) {
      if (doc.isICloudFile && doc.fileHandle && doc.isModified && saveQueue.isBound(doc.id)) {
        saveQueue.schedule(doc.id, doc.content);
      }
    }
  }, [documents, currentDocId, handlesRestored, saveQueue, workspace.isWritable]);

  useEffect(() => {
    if (!workspace.isWritable) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (localSaveError || documentsRef.current.some((doc) => doc.isICloudFile && doc.isModified)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const flush = () => { if (document.visibilityState === 'hidden') void saveQueue.flush(); };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [localSaveError, saveQueue, workspace.isWritable]);

  // Document Content Change handler
  const handleContentChange = useCallback(
    (newContent: string) => {
      if (fileOperationRef.current || !writableRef.current || !readyRef.current) return;
      setDocuments((prevDocs) =>
        prevDocs.map((doc) =>
          doc.id === currentDoc.id
            ? { ...doc, content: newContent, updatedAt: Date.now(), isModified: true }
            : doc
        )
      );
    },
    [currentDoc.id]
  );

  // Document Title Change handler
  const handleTitleChange = useCallback(
    (newTitle: string) => {
      if (currentDoc.isICloudFile || fileOperationRef.current || !writableRef.current || !readyRef.current) return;
      setDocuments((prevDocs) =>
        prevDocs.map((doc) =>
          doc.id === currentDoc.id
            ? { ...doc, title: newTitle, updatedAt: Date.now(), isModified: true }
            : doc
        )
      );
    },
    [currentDoc.id, currentDoc.isICloudFile]
  );

  // Document Mode Change handler
  const handleModeChange = useCallback(
    (newMode: DocMode) => {
      if (fileOperationRef.current || !writableRef.current || !readyRef.current) return;
      setDocuments((prevDocs) =>
        prevDocs.map((doc) => {
          if (doc.id === currentDoc.id) {
            let updatedTitle = doc.title;
            // Switching modes updates known document extensions in both directions.
            const extension = newMode === 'h5' ? 'html' : newMode;
            const base = doc.title.replace(/\.(?:md|markdown|html?|txt|log)$/i, '');
            updatedTitle = `${base}.${extension}`;
            return { ...doc, mode: newMode, title: doc.isICloudFile ? doc.title : updatedTitle, updatedAt: Date.now() };
          }
          return doc;
        })
      );
    },
    [currentDoc.id]
  );

  // New Document handler (supports folder placement)
  const handleNewDoc = (targetMode: DocMode, folderId?: string | null) => {
    if (fileOperationRef.current || !writableRef.current || !handlesRestored) return;
    if (mountedRootRef.current) { void handleCreateICloudFileInDir(mountedRootRef.current, targetMode); return; }
    const newId = crypto.randomUUID();
    const newDoc: DocumentItem = {
      id: newId,
      title: `未命名-${new Date().toLocaleTimeString('zh-CN', { hour12: false })}.${
        targetMode === 'md' ? 'md' : targetMode === 'h5' ? 'html' : 'txt'
      }`,
      content: '',
      mode: targetMode,
      folderId: folderId || null,
      updatedAt: Date.now(),
      isModified: false,
    };

    setDocuments((prev) => [newDoc, ...prev]);
    setCurrentDocId(newId);
  };

  // Rename Document handler
  const handleRenameDoc = async (docId: string, newTitle: string) => {
    if (!writableRef.current || fileOperationRef.current || !readyRef.current) return;
    if (!newTitle.trim()) return;
    const doc = documentsRef.current.find((item) => item.id === docId);
    if (doc?.isICloudFile && doc.fileHandle && mountedRootRef.current) {
      try {
        const path = await mountedRootRef.current.resolve(doc.fileHandle);
        if (!path?.length) throw new Error('文件不在当前目录中');
        let parent = mountedRootRef.current;
        for (const part of path.slice(0, -1)) parent = await parent.getDirectoryHandle(part);
        await handleRenameICloudEntry(parent, path[path.length - 1], newTitle, false);
      } catch (error) { toast.error((error as Error).message); }
      return;
    }
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, title: newTitle.trim(), updatedAt: Date.now() } : d))
    );
  };

  // Create Folder handler
  const handleNewFolder = async (parentId?: string | null) => {
    if (!writableRef.current || fileOperationRef.current || !readyRef.current) return;
    if (mountedRootRef.current && !parentId) { await handleCreateICloudSubDir(mountedRootRef.current); return; }
    const name = await prompt({
      title: '新建文件夹',
      message: '请输入新文件夹名称：',
      defaultValue: '新建文件夹',
      placeholder: '如：工作周报、产品文档',
      confirmText: '创建',
      icon: 'folder',
    });
    if (!name || !name.trim()) return;
    const newFolder: FolderItem = {
      id: crypto.randomUUID(),
      name: name.trim(),
      parentId: parentId || null,
      isExpanded: true,
      createdAt: Date.now(),
    };
    setFolders((prev) => [...prev, newFolder]);
    toast.success(`文件夹 "${name.trim()}" 创建成功`);
  };

  // Rename Folder handler
  const handleRenameFolder = (folderId: string, newName: string) => {
    if (!writableRef.current || fileOperationRef.current || !readyRef.current) return;
    if (!newName.trim()) return;
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, name: newName.trim() } : f))
    );
  };

  // Delete Folder handler
  const handleDeleteFolder = (folderId: string) => {
    if (!writableRef.current || fileOperationRef.current || !readyRef.current) return;
    const remaining = removeFolderTree(folders, documentsRef.current, folderId);
    setFolders(remaining.folders);
    setDocuments(remaining.documents);
    toast.info('文件夹已删除，内部文稿已移至根目录');
  };

  // Toggle Folder Expand
  const handleToggleFolderExpand = (folderId: string) => {
    setFolders((prev) =>
      prev.map((f) =>
        f.id === folderId ? { ...f, isExpanded: f.isExpanded === false ? true : false } : f
      )
    );
  };

  // Delete Document handler
  const handleDeleteDoc = (id: string) => withFileOperation(async () => {
    if (documentsRef.current.length <= 1) {
      toast.warning('至少需要保留一个工作文档');
      return;
    }
    if (!await saveQueue.flush(id)) {
      toast.error('该文稿尚未成功同步，请先重试或导出备份');
      return;
    }
    saveQueue.cancel(id);
    const filtered = documentsRef.current.filter((d) => d.id !== id);
    if (!filtered.length) return;
    setDocuments(filtered);
    if (currentDocId === id) {
      setCurrentDocId(filtered[0]?.id || '');
    }
  });

  const enqueueOpenFile = (file: DesktopOpenedFile) => {
    pendingOpenFiles.current.push(file);
    setOpenFilesVersion((version) => version + 1);
  };

  // Picker results and Finder requests share the same serial import queue.
  const handleOpenFile = async () => {
    if (choosingFile.current) return;
    if (!handlesRestored) { toast.info('文稿目录正在准备，请稍后再打开。'); return; }
    if (!writableRef.current) { toast.error('请先恢复文稿目录的写入权限，再打开文件。'); return; }
    choosingFile.current = true;
    try {
      const result = await openLocalFile();
      if (result) enqueueOpenFile(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '无法读取此文件');
    } finally { choosingFile.current = false; }
  };

  const importOpenedFile = async (result: DesktopOpenedFile) => {
    const detectedMode = detectFileMode(result.fileName);
    const newId = crypto.randomUUID();
    const newDoc: DocumentItem = {
      id: newId,
      title: result.fileName,
      content: result.content,
      mode: detectedMode,
      updatedAt: Date.now(),
      isModified: false,
    };

    if (mountedRootRef.current) {
      const connection = await connectDesktopWorkspace();
      const [imported] = await restoreDesktopDocuments(connection.root, connection.workspaceId, [newDoc], []);
      if (imported.fileHandle) saveQueue.bind(imported.id, imported.fileHandle, imported.content);
      setDocuments((prev) => [imported, ...prev]);
      setCurrentDocId(imported.id);
      await refreshICloudTree();
      toast.success(`已导入 ${workspaceDirectory}，编辑将保存到文稿副本。`);
    } else {
      setDocuments((prev) => [newDoc, ...prev]);
      setCurrentDocId(newId);
    }
  };

  // Quick Export Direct Handler
  const handleQuickExport = async (type: 'md' | 'html' | 'pdf' | 'txt' | 'rich') => {
    const baseName = currentDoc.title.replace(/\.[^/.]+$/, '') || 'EasyMD-文档';
    try {
    switch (type) {
      case 'md':
        downloadFile(currentDoc.content, `${baseName}.md`, 'text/markdown;charset=utf-8');
        break;
      case 'html': {
        const html = await exportDocumentHtml(currentDoc.title, currentDoc.content, currentDoc.mode, allowNetwork);
        downloadFile(html, `${baseName}.html`, 'text/html;charset=utf-8');
        break;
      }
      case 'pdf':
        await printDocument(currentDoc.title, currentDoc.content, currentDoc.mode, allowNetwork, networkSignal);
        break;
      case 'txt':
        downloadFile(currentDoc.content, `${baseName}.txt`, 'text/plain;charset=utf-8');
        break;
      case 'rich': {
        if (!await copyDocumentRichText(currentDoc.content, currentDoc.mode, allowNetwork)) toast.error('复制失败，请检查剪贴板权限');
        break;
      }
    }
    } catch (error) {
      toast.error(`导出失败：${(error as Error).message}`);
    }
  };

  // File mutations pause editor input until handles and save queues are consistent again.
  const withFileOperation = async (operation: () => Promise<void>) => {
    if (!writableRef.current || !handlesRestored || fileOperationRef.current) return;
    fileOperationRef.current = true;
    setIsFileOperation(true);
    try {
      await operation();
    } catch (error) {
      toast.error((error as Error).message || '文件操作失败，草稿已保留');
    } finally {
      fileOperationRef.current = false;
      setIsFileOperation(false);
    }
  };

  const refreshICloudTree = async () => {
    const root = mountedRootRef.current;
    if (!root) return;
    const tree = await listDirectoryTree(root);
    setIcloudTree(tree);
    setIcloudDir((state) => ({ ...state, handle: root, name: root.name,
      isSyncing: false, filesCount: flattenICloudTree(tree).length }));
  };

  const handleMountICloud = () => withFileOperation(async () => {
    if (!await saveQueue.flush()) throw new Error('请先处理未保存的修改，再重新连接文稿目录');
    const connection = await prepareDesktopWorkspace();
    await applyDesktopWorkspace(connection);
  });

  const handleRefreshICloud = () => withFileOperation(refreshICloudTree);

  const openICloudFile = async (handle: FileSystemFileHandle, name: string, mode: DocMode) => {
      const root = mountedRootRef.current;
      if (!root) throw new Error('请先连接目录');
      const path = await root.resolve(handle);
      if (!path) throw new Error('文件不在当前连接的目录中');
      let existing: DocumentItem | undefined;
      for (const doc of documentsRef.current) {
        if (doc.fileHandle && await doc.fileHandle.isSameEntry(handle)) {
          existing = doc;
          break;
        }
      }
      if (existing?.isModified && !await saveQueue.flush(existing.id)) {
        setCurrentDocId(existing.id);
        const reload = await confirm({
          title: '保留草稿并读取磁盘文件',
          message: '当前编辑尚未同步。将先保留一份本地草稿副本，再读取磁盘版本，供你比较和合并。',
          confirmText: '保留副本并读取', icon: 'warning',
        });
        if (!reload) return;
        const copy = { ...existing, id: crypto.randomUUID(),
          title: `未同步副本-${existing.title}`, fileHandle: null, storageBackend: undefined, storageRoot: undefined,
          isICloudFile: false, path: undefined, lastSyncedContent: undefined };
        setDocuments((prev) => [copy, ...prev]);
      }
      const content = await readICloudFileContent(handle);
      const id = existing?.id || crypto.randomUUID();
      saveQueue.bind(id, handle, content);
      setSyncStates((prev) => ({ ...prev, [id]: { status: 'saved' } }));
      const opened: DocumentItem = { ...existing, ...desktopBinding(handle), id, title: name, content, mode,
        updatedAt: Date.now(), isModified: false, fileHandle: handle, isICloudFile: true,
        path: path.join('/'), lastSyncedContent: content };
      setDocuments((prev) => existing
        ? prev.map((doc) => doc.id === id ? opened : doc) : [opened, ...prev]);
      setCurrentDocId(id);
    };

  const handleOpenICloudFile = (handle: FileSystemFileHandle, name: string, mode: DocMode) =>
    withFileOperation(() => openICloudFile(handle, name, mode));

  useEffect(() => {
    if (!handlesRestored || !window.easymdDesktop) return;
    return window.easymdDesktop.onOpenFile(enqueueOpenFile);
  }, [handlesRestored]);

  useEffect(() => {
    if (!handlesRestored || !workspace.isWritable || isFileOperation || importingFile.current
      || fileOperationRef.current || !pendingOpenFiles.current.length) return;
    const file = pendingOpenFiles.current.shift()!;
    importingFile.current = true;
    void withFileOperation(async () => {
      const root = mountedRootRef.current;
      if (file.workspacePath && root) {
        // A file already in the managed directory opens its existing binding.
        const parts = file.workspacePath.split('/');
        if (parts.some((part) => !part || part === '.' || part === '..' || part.includes('\\'))) {
          throw new Error('文稿路径无效，请从目录中重新打开。');
        }
        let parent = root;
        for (const part of parts.slice(0, -1)) parent = await parent.getDirectoryHandle(part);
        const handle = await parent.getFileHandle(parts.at(-1)!);
        await openICloudFile(handle, handle.name, detectFileMode(handle.name));
      } else await importOpenedFile(file);
    }).finally(() => {
      importingFile.current = false;
      setOpenFilesVersion((version) => version + 1);
    });
  }, [handlesRestored, workspace.isWritable, isFileOperation, openFilesVersion]);

  const handleCreateICloudFileInDir = async (parent: FileSystemDirectoryHandle, mode: DocMode) => {
    const extension = mode === 'h5' ? 'html' : mode;
    const name = await prompt({ title: '新建文稿',
      message: '请输入文件名；已有同名文件不会被覆盖。', defaultValue: `新文稿.${extension}`,
      confirmText: '创建', icon: 'doc' });
    if (!name?.trim()) return;
    await withFileOperation(async () => {
      const handle = await createICloudFile(parent, name.trim(), '');
      if (!handle) throw new Error('创建失败：请检查名称、同名文件和目录写入权限');
      const id = crypto.randomUUID();
      const path = await mountedRootRef.current?.resolve(handle);
      saveQueue.bind(id, handle, '');
      setDocuments((prev) => [{ ...desktopBinding(handle), id, title: handle.name, content: '', mode,
        updatedAt: Date.now(), isModified: false, fileHandle: handle, isICloudFile: true,
        path: path?.join('/'), lastSyncedContent: '' }, ...prev]);
      setCurrentDocId(id);
      await refreshICloudTree();
      toast.success(`已创建“${name.trim()}”`);
    });
  };

  const handleCreateICloudSubDir = async (parent: FileSystemDirectoryHandle) => {
    const name = await prompt({ title: '新建文件夹', message: '请输入文件夹名称：',
      defaultValue: '新建文件夹', confirmText: '创建', icon: 'folder' });
    if (!name?.trim()) return;
    await withFileOperation(async () => {
      const handle = await createICloudDirectory(parent, name.trim());
      if (!handle) throw new Error('创建文件夹失败，请检查名称和权限');
      await refreshICloudTree();
      toast.success(`已创建“${name.trim()}”`);
    });
  };

  // Resolve by actual handles relative to the parent, never by display titles.
  const documentsInEntry = async (parent: FileSystemDirectoryHandle, name: string, isDirectory: boolean) => {
    const matches: { doc: DocumentItem; path: string[] }[] = [];
    for (const doc of documentsRef.current) {
      if (!doc.fileHandle) continue;
      const path = await parent.resolve(doc.fileHandle);
      if (path?.[0] === name && (isDirectory || path.length === 1)) matches.push({ doc, path });
    }
    return matches;
  };

  const handleRenameICloudEntry = (parent: FileSystemDirectoryHandle, oldName: string,
    newName: string, isDirectory: boolean) => withFileOperation(async () => {
    if (!newName.trim() || newName.trim() === oldName) return;
    const affected = await documentsInEntry(parent, oldName, isDirectory);
    for (const { doc } of affected) {
      saveQueue.schedule(doc.id, doc.content);
      if (!await saveQueue.flush(doc.id)) throw new Error('请先处理未同步的修改，再重命名');
    }
    const result = await renameICloudEntry(parent, oldName, newName.trim(), isDirectory);
    if (!result) throw new Error('重命名失败：请检查名称、同名条目和权限；源文件已保留');
    const rebound = new Map<string, DocumentItem>();
    for (const { doc, path } of affected) {
      let handle: FileSystemFileHandle;
      if (isDirectory) {
        let directory = result.handle as FileSystemDirectoryHandle;
        for (const part of path.slice(1, -1)) directory = await directory.getDirectoryHandle(part);
        handle = await directory.getFileHandle(path[path.length - 1]);
      } else handle = result.handle as FileSystemFileHandle;
      const diskContent = await readICloudFileContent(handle);
      saveQueue.bind(doc.id, handle, doc.content);
      const newPath = await mountedRootRef.current?.resolve(handle);
      rebound.set(doc.id, { ...doc, ...desktopBinding(handle), title: handle.name, fileHandle: handle,
        path: newPath?.join('/'), lastSyncedContent: doc.content, isModified: diskContent !== doc.content });
      if (diskContent !== doc.content) saveQueue.schedule(doc.id, doc.content);
    }
    setDocuments((prev) => prev.map((doc) => rebound.get(doc.id) || doc));
    await refreshICloudTree();
    toast.success(`已重命名为“${newName.trim()}”`);
  });

  const handleDeleteICloudEntry = (parent: FileSystemDirectoryHandle, name: string,
    isDirectory: boolean) => withFileOperation(async () => {
    const affected = await documentsInEntry(parent, name, isDirectory);
    for (const { doc } of affected) {
      if (!await saveQueue.flush(doc.id)) throw new Error('该文件还有未同步修改，请先保留副本或导出备份');
    }
    if (!await deleteICloudEntry(parent, name, isDirectory)) throw new Error('删除失败，文稿仍保留');
    const removed = new Set(affected.map(({ doc }) => doc.id));
    removed.forEach((id) => saveQueue.cancel(id));
    const remaining = documentsRef.current.filter((doc) => !removed.has(doc.id));
    if (!remaining.length) remaining.push({ id: crypto.randomUUID(), title: '未命名.md',
      content: '', mode: 'md', updatedAt: Date.now(), isModified: false });
    setDocuments(remaining);
    if (removed.has(currentDocId)) setCurrentDocId(remaining[0].id);
    await refreshICloudTree();
    toast.success(`已删除“${name}”`);
  });

  // Insert text into CodeMirror at cursor
  const handleInsertText = (before: string, after: string = '', defaultText: string = '') => {
    if (fileOperationRef.current || !writableRef.current || !readyRef.current) return;
    const view = editorRef.current?.view;
    if (!view) {
      handleContentChange(currentDoc.content + before + defaultText + after);
      return;
    }

    const selection = view.state.selection.main;
    const selectedText = view.state.sliceDoc(selection.from, selection.to) || defaultText;
    const insertString = `${before}${selectedText}${after}`;

    view.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: insertString,
      },
      selection: {
        anchor: selection.from + before.length,
        head: selection.from + before.length + selectedText.length,
      },
    });

    view.focus();
  };

  // Sync Fullscreen state with native browser events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Global Keyboard Shortcuts (Mac-oriented)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTargetInput = (e.target as HTMLElement)?.tagName === 'INPUT';
      const isMac =
        navigator.userAgent.includes('Mac') ||
        (navigator.platform && navigator.platform.toUpperCase().indexOf('MAC') >= 0);
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl) {
        switch (e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            setIsExportOpen(true);
            break;
          case 'o':
            e.preventDefault();
            handleOpenFile();
            break;
          case 'n':
            e.preventDefault();
            handleNewDoc(currentDoc.mode);
            break;
          case '\\':
            e.preventDefault();
            setIsSidebarOpen((s) => !s);
            break;
          case '/':
            e.preventDefault();
            setIsShortcutsOpen((s) => !s);
            break;
          case 'b':
            if (!isTargetInput && currentDoc.mode === 'md') {
              e.preventDefault();
              handleInsertText('**', '**', '加粗文本');
            }
            break;
          case 'i':
            if (!isTargetInput && currentDoc.mode === 'md') {
              e.preventDefault();
              handleInsertText('*', '*', '斜体文本');
            }
            break;
          case 'k':
            if (!isTargetInput && currentDoc.mode === 'md') {
              e.preventDefault();
              handleInsertText('[', '](https://)', '链接说明');
            }
            break;
          case 'p':
            e.preventDefault();
            void printDocument(currentDoc.title, currentDoc.content, currentDoc.mode, allowNetwork, networkSignal)
              .catch((error) => toastRef.current.error(`打印失败：${(error as Error).message}`));
            break;
        }
      } else if (e.key === 'Escape') {
        setIsExportOpen(false);
        setIsShortcutsOpen(false);
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentDoc, allowNetwork, networkSignal]);

  // Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Fullscreen error:', err);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch((err) => {
        console.warn('Exit fullscreen error:', err);
      });
      setIsFullscreen(false);
    }
  };

  // Persist sidebar width
  useEffect(() => {
    if (!workspace.isWritable) return;
    try { localStorage.setItem(STORAGE_KEY_SIDEBAR_WIDTH, String(sidebarWidth)); } catch { /* optional preference */ }
  }, [sidebarWidth, workspace.isWritable]);

  // Sidebar drag resizer listener
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSidebar) return;
      // Allow narrowing down to 160px, up to 480px
      const newWidth = Math.min(Math.max(e.clientX, 160), 480);
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDraggingSidebar(false);
    };

    if (isDraggingSidebar) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSidebar]);

  // Split view dragging
  const handleMouseDownSplit = () => {
    setIsDraggingSplit(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSplit) return;
      const container = document.getElementById('work-container');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newRatio = ((e.clientX - rect.left) / rect.width) * 100;
      if (newRatio >= 20 && newRatio <= 80) {
        setSplitRatio(newRatio);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingSplit(false);
    };

    if (isDraggingSplit) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSplit]);

  // Derived TOC and Statistics
  const toc = useMemo(() => {
    return currentDoc.mode === 'md' ? extractToc(currentDoc.content) : [];
  }, [currentDoc.content, currentDoc.mode]);

  const stats = useMemo(() => {
    return calculateDocStats(currentDoc.content);
  }, [currentDoc.content]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#ececed] dark:bg-[#121214] font-sans antialiased">
      {workspace.status === 'reader' && (
        <div role="status" className="px-4 py-2 bg-amber-100 text-amber-900 text-xs">
          另一窗口正在编辑此工作区。本窗口为只读快照；关闭编辑窗口后刷新此页即可编辑。
        </div>
      )}
      {/* 1. macOS Titlebar */}
      <MacTitleBar
        title={currentDoc.title}
        setTitle={handleTitleChange}
        isTitleReadOnly={!!currentDoc.isICloudFile || isFileOperation || !handlesRestored || !workspace.isWritable}
        mode={currentDoc.mode}
        setMode={handleModeChange}
        layout={layout}
        setLayout={setLayout}
        theme={effectiveTheme}
        setTheme={setTheme}
        isModified={!isSaved}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
        onOpenFile={handleOpenFile}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onQuickExport={handleQuickExport}
        isICloudConnected={!!icloudDir.handle}
        icloudDirName={icloudDir.name}
        onOpenICloudGuide={() => setIsICloudGuideOpen(true)}
      />

      {/* 2. Workspace Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar (Files & TOC & iCloud Directory Tree) */}
        <OutlineSidebar
          isOpen={isSidebarOpen}
          width={sidebarWidth}
          documents={documents}
          folders={folders}
          currentDocId={currentDoc.id}
          onSelectDoc={(id) => setCurrentDocId(id)}
          onNewDoc={handleNewDoc}
          onDeleteDoc={handleDeleteDoc}
          onRenameDoc={handleRenameDoc}
          onNewFolder={handleNewFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onToggleFolderExpand={handleToggleFolderExpand}
          toc={toc}
          currentMode={currentDoc.mode}
          onHeadingClick={() => {
            if (layout === 'editor') {
              setLayout('split');
            }
          }}
          icloudDir={icloudDir}
          workspaceDirectory={workspaceDirectory}
          workspaceError={workspaceError}
          icloudTree={icloudTree}
          onMountICloud={handleMountICloud}
          onRefreshICloud={handleRefreshICloud}
          onOpenICloudFile={handleOpenICloudFile}
          onCreateICloudFileInDir={handleCreateICloudFileInDir}
          onCreateICloudSubDir={handleCreateICloudSubDir}
          onRenameICloudEntry={handleRenameICloudEntry}
          onDeleteICloudEntry={handleDeleteICloudEntry}
          onOpenICloudGuide={() => setIsICloudGuideOpen(true)}
        />

        {/* Sidebar Drag Resizer Handle */}
        {isSidebarOpen && (
          <div
            onMouseDown={() => setIsDraggingSidebar(true)}
            onDoubleClick={() => setSidebarWidth(220)}
            className={`w-1.5 h-full cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-colors relative z-20 group flex items-center justify-center -ml-1 ${
              isDraggingSidebar ? 'bg-blue-500' : 'bg-transparent'
            }`}
            title="按住鼠标拖拽调整侧边栏宽度 (可变窄至 160px，双击恢复 220px)"
          >
            <div className="w-0.5 h-6 bg-black/15 dark:bg-white/20 rounded-full group-hover:bg-blue-400 transition-colors" />
          </div>
        )}

        {/* Center Main Work Area */}
        <main
          id="work-container"
          className={`flex-1 flex flex-col overflow-hidden bg-white dark:bg-[#1a1a1c] relative ${
            isDraggingSidebar ? 'pointer-events-none select-none' : ''
          }`}
        >
          {/* Quick Toolbar */}
          <EditorToolbar
            mode={currentDoc.mode}
            onInsertText={handleInsertText}
          />

          {/* Editors & Previews according to Mode and Layout */}
          <div className="flex-1 flex overflow-hidden relative">
            {/* Editor Pane */}
            {(layout === 'split' || layout === 'editor' || currentDoc.mode === 'txt') && (
              <div
                style={{
                  width:
                    layout === 'editor' || currentDoc.mode === 'txt'
                      ? '100%'
                      : `${splitRatio}%`,
                }}
                className="h-full overflow-hidden flex flex-col"
              >
                <EditorArea
                  key={currentDoc.id}
                  content={currentDoc.content}
                  onChange={handleContentChange}
                  mode={currentDoc.mode}
                  theme={effectiveTheme}
                  settings={settings}
                  editorRef={editorRef}
                  readOnly={isFileOperation || !handlesRestored || !workspace.isWritable}
                  onCursorChange={(line, col) => setCursorPos({ line, col })}
                />
              </div>
            )}

            {/* Draggable Split Divider */}
            {layout === 'split' && currentDoc.mode !== 'txt' && (
              <div
                onMouseDown={handleMouseDownSplit}
                className={`w-1.5 h-full cursor-col-resize hover:bg-blue-500/50 transition-colors flex items-center justify-center relative z-20 group ${
                  isDraggingSplit ? 'bg-blue-500' : 'bg-black/[0.06] dark:bg-white/[0.08]'
                }`}
              >
                <div className="w-0.5 h-8 bg-black/20 dark:bg-white/30 rounded-full group-hover:bg-white transition-colors" />
              </div>
            )}

            {/* Preview Pane */}
            {(layout === 'split' || layout === 'preview') && currentDoc.mode !== 'txt' && (
              <div
                style={{
                  width: layout === 'preview' ? '100%' : `${100 - splitRatio}%`,
                }}
                className={`h-full overflow-hidden flex flex-col ${
                  isDraggingSplit ? 'pointer-events-none select-none' : ''
                }`}
              >
                <PreviewArea
                  key={`${currentDoc.id}:${allowNetwork}`}
                  content={currentDoc.content}
                  mode={currentDoc.mode}
                  theme={effectiveTheme}
                  previewRef={previewRef}
                  allowNetwork={allowNetwork}
                  networkSignal={networkSignal}
                  onToggleNetwork={() => { void handleToggleNetwork(); }}
                />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* 3. macOS Bottom Status Bar */}
      <StatusBar
        mode={currentDoc.mode}
        stats={stats}
        cursorPos={cursorPos}
        isSaved={isSaved}
        saveError={saveError}
        onRetrySave={() => {
          if (!workspace.isWritable) return;
          try {
            localStorage.setItem(STORAGE_KEY_DOCS, serializeDocuments(documentsRef.current));
            setLocalSaveError(null);
          } catch { setLocalSaveError('本地存储已满或不可用，请立即导出备份'); }
          void saveQueue.flush(currentDoc.id);
        }}
        onReloadFile={currentDoc.fileHandle ? () => {
          void handleOpenICloudFile(currentDoc.fileHandle!, currentDoc.fileHandle!.name, currentDoc.mode);
        } : undefined}
        icloudStatus={{
          isConnected: !!icloudDir.handle && !!currentDoc.isICloudFile,
          name: icloudDir.name,
          isSyncing: syncStates[currentDoc.id]?.status === 'saving' || syncStates[currentDoc.id]?.status === 'pending',
        }}
      />

      {/* 4. Modals */}
      <ExportModal
        key={currentDoc.id}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title={currentDoc.title}
        content={currentDoc.content}
        mode={currentDoc.mode}
        allowNetwork={allowNetwork}
        networkSignal={networkSignal}
      />

      <ShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        setSettings={setSettings}
      />

      <ICloudGuideModal
        isOpen={isICloudGuideOpen}
        onClose={() => setIsICloudGuideOpen(false)}
        onChooseDirectory={handleMountICloud}
        isConnected={!!icloudDir.handle}
        dirName={workspaceDirectory}
      />
    </div>
  );
}

export default App;
