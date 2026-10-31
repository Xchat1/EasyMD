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
import { extractToc, calculateDocStats, renderMarkdown } from './utils/markdown';
import { openLocalFile, downloadFile, generateStandaloneHtml, copyRichTextToClipboard } from './utils/fileSystem';
import {
  chooseICloudDirectory,
  listDirectoryTree,
  flattenICloudTree,
  readICloudFileContent,
  writeICloudFileContent,
  createICloudFile,
  createICloudDirectory,
  renameICloudEntry,
  deleteICloudEntry,
  getStoredDirectoryHandle,
  clearStoredDirectoryHandle,
  ICloudNode,
} from './utils/icloudSync';
import { useDialog } from './context/DialogContext';

const STORAGE_KEY_DOCS = 'easymd_documents_v1';
const STORAGE_KEY_FOLDERS = 'easymd_folders_v1';
const STORAGE_KEY_CURRENT_ID = 'easymd_current_doc_id';
const STORAGE_KEY_SETTINGS = 'easymd_settings_v1';
const STORAGE_KEY_THEME = 'easymd_theme_v1';
const STORAGE_KEY_SIDEBAR_WIDTH = 'easymd_sidebar_width_v1';

export function App() {
  const { confirm, prompt, toast } = useDialog();

  // 1. Folders State
  const [folders, setFolders] = useState<FolderItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_FOLDERS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
    return localStorage.getItem(STORAGE_KEY_CURRENT_ID) || 'doc-md-welcome';
  });

  // Current document fallback
  const currentDoc = useMemo(() => {
    return documents.find((d) => d.id === currentDocId) || documents[0];
  }, [documents, currentDocId]);

  // Layout & Theme State
  const [layout, setLayout] = useState<ViewLayout>('split');
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem(STORAGE_KEY_THEME) as ThemeMode) || 'light';
  });
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
  const [isSaved, setIsSaved] = useState<boolean>(true);

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

  // Refs
  const editorRef = useRef<ReactCodeMirrorRef>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Restore stored iCloud directory on initial mount
  useEffect(() => {
    let isMounted = true;
    getStoredDirectoryHandle().then(async (handle) => {
      if (handle && isMounted) {
        try {
          const tree = await listDirectoryTree(handle);
          const files = flattenICloudTree(tree);
          if (isMounted) {
            setIcloudDir({
              handle,
              name: handle.name || 'iCloud 云盘',
              isSyncing: false,
              lastSyncedAt: Date.now(),
              filesCount: files.length,
            });
            setIcloudTree(tree);
          }
        } catch (err) {
          console.warn('Could not auto-list stored directory files:', err);
        }
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Theme synchronization with HTML element
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(STORAGE_KEY_THEME, theme);
  }, [theme]);

  // Settings & Folders persistence
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_FOLDERS, JSON.stringify(folders));
  }, [folders]);

  // Save documents to localStorage and sync to iCloud if active (debounced)
  useEffect(() => {
    setIsSaved(false);
    const timer = setTimeout(async () => {
      try {
        localStorage.setItem(STORAGE_KEY_DOCS, JSON.stringify(documents));
        localStorage.setItem(STORAGE_KEY_CURRENT_ID, currentDocId);

        // If current document is linked to iCloud file handle, sync directly to disk!
        if (currentDoc.isICloudFile && currentDoc.fileHandle) {
          setIcloudDir((s) => ({ ...s, isSyncing: true }));
          await writeICloudFileContent(currentDoc.fileHandle, currentDoc.content);
          setIcloudDir((s) => ({ ...s, isSyncing: false, lastSyncedAt: Date.now() }));
        }

        setIsSaved(true);
      } catch (e) {
        console.error('Failed to save to storage', e);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [documents, currentDocId, currentDoc.content, currentDoc.fileHandle, currentDoc.isICloudFile]);

  // Document Content Change handler
  const handleContentChange = useCallback(
    (newContent: string) => {
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
      setDocuments((prevDocs) =>
        prevDocs.map((doc) =>
          doc.id === currentDoc.id
            ? { ...doc, title: newTitle, updatedAt: Date.now(), isModified: true }
            : doc
        )
      );
    },
    [currentDoc.id]
  );

  // Document Mode Change handler
  const handleModeChange = useCallback(
    (newMode: DocMode) => {
      setDocuments((prevDocs) =>
        prevDocs.map((doc) => {
          if (doc.id === currentDoc.id) {
            let updatedTitle = doc.title;
            // update extension if default
            if (doc.title.endsWith('.md') && newMode === 'h5') {
              updatedTitle = doc.title.replace(/\.md$/, '.html');
            } else if (doc.title.endsWith('.html') && newMode === 'md') {
              updatedTitle = doc.title.replace(/\.html$/, '.md');
            } else if (newMode === 'txt' && !doc.title.endsWith('.txt')) {
              updatedTitle = doc.title.replace(/\.[^/.]+$/, '') + '.txt';
            }
            return { ...doc, mode: newMode, title: updatedTitle, updatedAt: Date.now() };
          }
          return doc;
        })
      );
    },
    [currentDoc.id]
  );

  // New Document handler (supports folder placement)
  const handleNewDoc = (targetMode: DocMode, folderId?: string | null) => {
    const template = TEMPLATES[targetMode];
    const newId = `doc-${Date.now()}`;
    const newDoc: DocumentItem = {
      id: newId,
      title: `未命名-${new Date().toLocaleTimeString('zh-CN', { hour12: false })}.${
        targetMode === 'md' ? 'md' : targetMode === 'h5' ? 'html' : 'txt'
      }`,
      content: template.content,
      mode: targetMode,
      folderId: folderId || null,
      updatedAt: Date.now(),
      isModified: false,
    };

    setDocuments((prev) => [newDoc, ...prev]);
    setCurrentDocId(newId);
  };

  // Rename Document handler
  const handleRenameDoc = (docId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    setDocuments((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, title: newTitle.trim(), updatedAt: Date.now() } : d))
    );
  };

  // Create Folder handler
  const handleNewFolder = async (parentId?: string | null) => {
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
      id: `folder-${Date.now()}`,
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
    if (!newName.trim()) return;
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, name: newName.trim() } : f))
    );
  };

  // Delete Folder handler
  const handleDeleteFolder = (folderId: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== folderId && f.parentId !== folderId));
    setDocuments((prev) =>
      prev.map((d) => (d.folderId === folderId ? { ...d, folderId: null } : d))
    );
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
  const handleDeleteDoc = (id: string) => {
    if (documents.length <= 1) {
      toast.warning('至少需要保留一个工作文档');
      return;
    }
    const filtered = documents.filter((d) => d.id !== id);
    setDocuments(filtered);
    if (currentDocId === id) {
      setCurrentDocId(filtered[0]?.id || '');
    }
  };

  // Open Local File
  const handleOpenFile = async () => {
    const result = await openLocalFile();
    if (!result) return;

    let detectedMode: DocMode = 'md';
    if (result.fileName.endsWith('.html') || result.fileName.endsWith('.htm')) {
      detectedMode = 'h5';
    } else if (result.fileName.endsWith('.txt') || result.fileName.endsWith('.log')) {
      detectedMode = 'txt';
    }

    const newId = `doc-${Date.now()}`;
    const newDoc: DocumentItem = {
      id: newId,
      title: result.fileName,
      content: result.content,
      mode: detectedMode,
      updatedAt: Date.now(),
      isModified: false,
    };

    setDocuments((prev) => [newDoc, ...prev]);
    setCurrentDocId(newId);
  };

  // Quick Export Direct Handler
  const handleQuickExport = async (type: 'md' | 'html' | 'pdf' | 'txt' | 'rich') => {
    const baseName = currentDoc.title.replace(/\.[^/.]+$/, '') || 'EasyMD-文档';
    switch (type) {
      case 'md':
        downloadFile(currentDoc.content, `${baseName}.md`, 'text/markdown;charset=utf-8');
        break;
      case 'html': {
        let body = currentDoc.content;
        if (currentDoc.mode === 'md') {
          body = await renderMarkdown(currentDoc.content);
        }
        const html = generateStandaloneHtml(currentDoc.title, body, currentDoc.mode === 'h5');
        downloadFile(html, `${baseName}.html`, 'text/html;charset=utf-8');
        break;
      }
      case 'pdf':
        window.print();
        break;
      case 'txt':
        downloadFile(currentDoc.content, `${baseName}.txt`, 'text/plain;charset=utf-8');
        break;
      case 'rich': {
        let rendered = currentDoc.content;
        if (currentDoc.mode === 'md') {
          rendered = await renderMarkdown(currentDoc.content);
        }
        await copyRichTextToClipboard(rendered, currentDoc.content);
        break;
      }
    }
  };

  // --- iCloud Directory Handlers (Tree & Management) ---

  // 1. Mount iCloud directory
  const handleMountICloud = async () => {
    try {
      setIcloudDir((s) => ({ ...s, isSyncing: true }));
      const handle = await chooseICloudDirectory();
      if (!handle) {
        setIcloudDir((s) => ({ ...s, isSyncing: false }));
        return;
      }
      const tree = await listDirectoryTree(handle);
      const files = flattenICloudTree(tree);
      setIcloudDir({
        handle,
        name: handle.name || 'iCloud 云盘',
        isSyncing: false,
        lastSyncedAt: Date.now(),
        filesCount: files.length,
      });
      setIcloudTree(tree);
    } catch (err) {
      setIcloudDir((s) => ({ ...s, isSyncing: false }));
      toast.error((err as Error).message || '选择 iCloud 目录失败');
    }
  };

  // 2. Unmount iCloud directory
  const handleUnmountICloud = async () => {
    const ok = await confirm({
      title: '断开 iCloud 同步',
      message: '确认断开与当前 iCloud 文稿目录的绑定吗？文件仍将完好保留在您的 Mac iCloud 云盘中。',
      confirmText: '断开绑定',
      isDestructive: true,
      icon: 'cloud',
    });
    if (ok) {
      await clearStoredDirectoryHandle();
      setIcloudDir({
        handle: null,
        name: '',
        isSyncing: false,
        lastSyncedAt: null,
        filesCount: 0,
      });
      setIcloudTree([]);
      toast.info('已断开与 iCloud 文稿目录的绑定');
    }
  };

  // 3. Refresh iCloud directory tree
  const handleRefreshICloud = async () => {
    if (!icloudDir.handle) return;
    setIcloudDir((s) => ({ ...s, isSyncing: true }));
    const tree = await listDirectoryTree(icloudDir.handle);
    const files = flattenICloudTree(tree);
    setIcloudTree(tree);
    setIcloudDir((s) => ({
      ...s,
      isSyncing: false,
      lastSyncedAt: Date.now(),
      filesCount: files.length,
    }));
  };

  // 4. Open iCloud file
  const handleOpenICloudFile = async (handle: FileSystemFileHandle, name: string, mode: DocMode) => {
    try {
      const content = await readICloudFileContent(handle);
      const docId = `icloud-${name}`;

      const existing = documents.find((d) => d.id === docId || d.title === name);
      if (existing) {
        setDocuments((prev) =>
          prev.map((d) =>
            d.id === existing.id
              ? { ...d, content, fileHandle: handle, isICloudFile: true, updatedAt: Date.now() }
              : d
          )
        );
        setCurrentDocId(existing.id);
      } else {
        const newDoc: DocumentItem = {
          id: docId,
          title: name,
          content,
          mode,
          updatedAt: Date.now(),
          isModified: false,
          fileHandle: handle,
          isICloudFile: true,
        };
        setDocuments((prev) => [newDoc, ...prev]);
        setCurrentDocId(docId);
      }
    } catch (err) {
      toast.error(`无法读取文件: ${(err as Error).message}`);
    }
  };

  // 5. Create new file inside specific directory in iCloud
  const handleCreateICloudFileInDir = async (parentDirHandle: FileSystemDirectoryHandle, targetMode: DocMode) => {
    const ext = targetMode === 'md' ? 'md' : targetMode === 'h5' ? 'html' : 'txt';
    const defaultName = `文稿-${new Date().toLocaleTimeString('zh-CN', { hour12: false }).replace(/:/g, '')}.${ext}`;
    const fileName = await prompt({
      title: '新建 iCloud 文稿',
      message: '请输入新文稿名称（建议包含扩展名）：',
      defaultValue: defaultName,
      placeholder: defaultName,
      confirmText: '创建',
      icon: 'doc',
    });
    if (!fileName || !fileName.trim()) return;

    const template = TEMPLATES[targetMode];
    const fileHandle = await createICloudFile(parentDirHandle, fileName.trim(), template.content);
    if (!fileHandle) {
      toast.error('在 iCloud 目录中创建文稿失败，请检查写入权限');
      return;
    }

    await handleRefreshICloud();
    const newDocId = `icloud-${fileName.trim()}`;
    const newDoc: DocumentItem = {
      id: newDocId,
      title: fileName.trim(),
      content: template.content,
      mode: targetMode,
      updatedAt: Date.now(),
      isModified: false,
      fileHandle,
      isICloudFile: true,
    };
    setDocuments((prev) => [newDoc, ...prev]);
    setCurrentDocId(newDocId);
    toast.success(`已在 iCloud 中创建 "${fileName.trim()}"`);
  };

  // 6. Create subdirectory in iCloud
  const handleCreateICloudSubDir = async (parentDirHandle: FileSystemDirectoryHandle) => {
    const folderName = await prompt({
      title: '新建 iCloud 文件夹',
      message: '请输入新建文件夹名称：',
      defaultValue: '新建文件夹',
      placeholder: '新建文件夹',
      confirmText: '创建',
      icon: 'folder',
    });
    if (!folderName || !folderName.trim()) return;

    const dirHandle = await createICloudDirectory(parentDirHandle, folderName.trim());
    if (dirHandle) {
      await handleRefreshICloud();
      toast.success(`已创建 iCloud 文件夹 "${folderName.trim()}"`);
    } else {
      toast.error('创建文件夹失败');
    }
  };

  // 7. Rename file or folder in iCloud
  const handleRenameICloudEntry = async (
    parentDirHandle: FileSystemDirectoryHandle,
    oldName: string,
    newName: string,
    isDirectory: boolean
  ) => {
    if (!newName.trim() || newName.trim() === oldName) return;
    const ok = await renameICloudEntry(parentDirHandle, oldName, newName.trim(), isDirectory);
    if (ok) {
      await handleRefreshICloud();
      if (!isDirectory) {
        setDocuments((prev) =>
          prev.map((d) => (d.title === oldName ? { ...d, title: newName.trim() } : d))
        );
      }
      toast.success(`已重命名为 "${newName.trim()}"`);
    } else {
      toast.error('重命名失败，请检查文件名称与权限');
    }
  };

  // 8. Delete file or folder from iCloud
  const handleDeleteICloudEntry = async (
    parentDirHandle: FileSystemDirectoryHandle,
    name: string,
    isDirectory: boolean
  ) => {
    const ok = await deleteICloudEntry(parentDirHandle, name, isDirectory);
    if (ok) {
      await handleRefreshICloud();
      if (!isDirectory) {
        setDocuments((prev) => prev.filter((d) => d.title !== name));
      }
      toast.success(`已从 iCloud 删除 "${name}"`);
    } else {
      toast.error('删除失败');
    }
  };

  // Insert text into CodeMirror at cursor
  const handleInsertText = (before: string, after: string = '', defaultText: string = '') => {
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
            window.print();
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
  }, [currentDoc.mode, currentDoc.content]);

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
    localStorage.setItem(STORAGE_KEY_SIDEBAR_WIDTH, String(sidebarWidth));
  }, [sidebarWidth]);

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
      {/* 1. macOS Titlebar */}
      <MacTitleBar
        title={currentDoc.title}
        setTitle={handleTitleChange}
        mode={currentDoc.mode}
        setMode={handleModeChange}
        layout={layout}
        setLayout={setLayout}
        theme={theme}
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
          icloudTree={icloudTree}
          onMountICloud={handleMountICloud}
          onUnmountICloud={handleUnmountICloud}
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
                  content={currentDoc.content}
                  onChange={handleContentChange}
                  mode={currentDoc.mode}
                  theme={theme}
                  settings={settings}
                  editorRef={editorRef}
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
                  content={currentDoc.content}
                  mode={currentDoc.mode}
                  theme={theme}
                  previewRef={previewRef}
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
        icloudStatus={{
          isConnected: !!icloudDir.handle,
          name: icloudDir.name,
          isSyncing: icloudDir.isSyncing,
        }}
      />

      {/* 4. Modals */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        title={currentDoc.title}
        content={currentDoc.content}
        mode={currentDoc.mode}
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
        dirName={icloudDir.name}
      />
    </div>
  );
}

export default App;
