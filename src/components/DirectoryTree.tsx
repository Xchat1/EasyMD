import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  Code2,
  Plus,
  Trash2,
  Edit2,
  FolderPlus,
  Check,
  X,
  Cloud,
} from 'lucide-react';
import { DocMode } from '../types';
import { ICloudNode } from '../utils/icloudSync';
import { useDialog } from '../context/DialogContext';

export interface LocalFolderNode {
  id: string;
  name: string;
  parentId?: string | null;
  isExpanded?: boolean;
}

export interface LocalDocNode {
  id: string;
  title: string;
  mode: DocMode;
  folderId?: string | null;
  updatedAt: number;
  isICloudFile?: boolean;
}

interface DirectoryTreeProps {
  // Mode: 'icloud' or 'local'
  treeMode: 'icloud' | 'local';
  // iCloud data
  icloudNodes?: ICloudNode[];
  rootHandle?: FileSystemDirectoryHandle;
  activeICloudPath?: string;
  onOpenICloudFile?: (handle: FileSystemFileHandle, name: string, mode: DocMode) => void;
  onCreateICloudFileInDir?: (parentDirHandle: FileSystemDirectoryHandle, mode: DocMode) => void;
  onCreateICloudSubDir?: (parentDirHandle: FileSystemDirectoryHandle) => void;
  onRenameICloudEntry?: (parentDirHandle: FileSystemDirectoryHandle, oldName: string, newName: string, isDirectory: boolean) => void;
  onDeleteICloudEntry?: (parentDirHandle: FileSystemDirectoryHandle, name: string, isDirectory: boolean) => void;

  // Local data
  folders?: LocalFolderNode[];
  documents?: LocalDocNode[];
  currentDocId?: string;
  onSelectDoc?: (id: string) => void;
  onDeleteDoc?: (id: string) => void;
  onRenameDoc?: (id: string, newTitle: string) => void;
  onNewDocInFolder?: (folderId: string | null, mode: DocMode) => void;
  onNewSubFolder?: (parentId: string | null) => void;
  onRenameFolder?: (folderId: string, newName: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  onToggleFolderExpand?: (folderId: string) => void;

  // Search filter
  searchQuery?: string;
}

export const DirectoryTree: React.FC<DirectoryTreeProps> = ({
  treeMode,
  icloudNodes = [],
  rootHandle,
  activeICloudPath,
  onOpenICloudFile,
  onCreateICloudFileInDir,
  onCreateICloudSubDir,
  onRenameICloudEntry,
  onDeleteICloudEntry,

  folders = [],
  documents = [],
  currentDocId,
  onSelectDoc,
  onDeleteDoc,
  onRenameDoc,
  onNewDocInFolder,
  onNewSubFolder,
  onRenameFolder,
  onDeleteFolder,
  onToggleFolderExpand,

  searchQuery = '',
}) => {
  const { confirm } = useDialog();

  // Local state for inline renaming
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>('');

  // Expand state for iCloud nodes
  const [expandedICloudPaths, setExpandedICloudPaths] = useState<Record<string, boolean>>({});

  const toggleICloudExpand = (path: string) => {
    setExpandedICloudPaths((prev) => ({
      ...prev,
      [path]: prev[path] === undefined ? false : !prev[path],
    }));
  };

  const getModeIcon = (mode: DocMode) => {
    switch (mode) {
      case 'md':
        return <FileText size={13} className="text-blue-500 flex-shrink-0" />;
      case 'h5':
        return <FileCode size={13} className="text-emerald-500 flex-shrink-0" />;
      case 'txt':
        return <Code2 size={13} className="text-amber-500 flex-shrink-0" />;
    }
  };

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  // --- RENDER ICLOUD RECURSIVE TREE ---
  const renderICloudNode = (node: ICloudNode, level: number = 0, parentHandle?: FileSystemDirectoryHandle) => {
    const isExpanded = !!searchQuery.trim() || expandedICloudPaths[node.path] !== false;
    const isRenaming = renamingId === `icloud-${node.path}`;

    // Filter match
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesSelf = node.name.toLowerCase().includes(q);
      const matches = (entry: ICloudNode): boolean => entry.name.toLowerCase().includes(q) ||
        !!entry.children?.some(matches);
      const matchesChild = node.children?.some(matches);
      if (!matchesSelf && !matchesChild) return null;
    }

    if (node.kind === 'directory') {
      const currentDirHandle = node.handle as FileSystemDirectoryHandle;

      return (
        <div key={node.path} className="select-none">
          {/* Folder Row */}
          <div
            style={{ paddingLeft: `${level * 12 + 6}px` }}
            className="group flex items-center justify-between py-1 px-1.5 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.05] cursor-pointer text-xs transition-colors"
            onClick={() => toggleICloudExpand(node.path)}
          >
            <div className="flex items-center space-x-1.5 min-w-0">
              <span className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </span>
              <span className="text-amber-500 dark:text-amber-400">
                {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
              </span>

              {isRenaming ? (
                <div
                  className="flex items-center space-x-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (parentHandle && onRenameICloudEntry) {
                          onRenameICloudEntry(parentHandle, node.name, renameValue.trim(), true);
                        }
                        cancelRename();
                      } else if (e.key === 'Escape') {
                        cancelRename();
                      }
                    }}
                    autoFocus
                    className="w-24 px-1 py-0.5 text-xs bg-white dark:bg-[#323236] border border-blue-500 rounded outline-none"
                  />
                  <button
                    onClick={() => {
                      if (parentHandle && onRenameICloudEntry) {
                        onRenameICloudEntry(parentHandle, node.name, renameValue.trim(), true);
                      }
                      cancelRename();
                    }}
                    className="p-0.5 text-emerald-500 hover:bg-black/5"
                  >
                    <Check size={12} />
                  </button>
                  <button onClick={cancelRename} className="p-0.5 text-gray-400 hover:bg-black/5">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
                  {node.name}
                </span>
              )}
            </div>

            {/* Folder Actions */}
            {!isRenaming && (
              <div
                className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => onCreateICloudFileInDir && onCreateICloudFileInDir(currentDirHandle, 'md')}
                  className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-black/5 dark:hover:bg-white/10"
                  title="在此目录下新建文稿"
                >
                  <Plus size={11} />
                </button>
                <button
                  onClick={() => onCreateICloudSubDir && onCreateICloudSubDir(currentDirHandle)}
                  className="p-1 rounded text-gray-400 hover:text-amber-500 hover:bg-black/5 dark:hover:bg-white/10"
                  title="新建子文件夹"
                >
                  <FolderPlus size={11} />
                </button>
                {parentHandle && onRenameICloudEntry && (
                  <button
                    onClick={() => startRename(`icloud-${node.path}`, node.name)}
                    className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
                    title="重命名目录"
                  >
                    <Edit2 size={11} />
                  </button>
                )}
                {parentHandle && onDeleteICloudEntry && (
                  <button
                    onClick={async () => {
                      const ok = await confirm({
                        title: '删除文稿文件夹',
                        message: `确定删除文稿文件夹 "${node.name}" 及其全部子内容吗？文件会移至 EasyMD 目录内的 .trash 回收区。`,
                        confirmText: '删除文件夹',
                        isDestructive: true,
                        icon: 'trash',
                      });
                      if (ok) {
                        onDeleteICloudEntry(parentHandle, node.name, true);
                      }
                    }}
                    className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/10"
                    title="删除目录"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Children */}
          {isExpanded && node.children && node.children.length > 0 && (
            <div className="space-y-0.5">
              {node.children.map((child) => renderICloudNode(child, level + 1, currentDirHandle))}
            </div>
          )}
        </div>
      );
    } else {
      // File Row
      const isFileRenaming = renamingId === `icloud-${node.path}`;
      const isActive = activeICloudPath === node.path;

      return (
        <div
          key={node.path}
          style={{ paddingLeft: `${level * 12 + 18}px` }}
          onClick={() =>
            onOpenICloudFile &&
            onOpenICloudFile(
              node.handle as FileSystemFileHandle,
              node.name,
              node.mode || 'md'
            )
          }
          className={`group flex items-center justify-between py-1 px-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
            isActive
              ? 'bg-blue-600 text-white font-medium shadow-sm'
              : 'text-gray-800 dark:text-gray-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
          }`}
        >
          <div className="flex items-center space-x-1.5 min-w-0">
            {getModeIcon(node.mode || 'md')}
            {isFileRenaming ? (
              <div
                className="flex items-center space-x-1"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (parentHandle && onRenameICloudEntry) {
                        onRenameICloudEntry(parentHandle, node.name, renameValue.trim(), false);
                      }
                      cancelRename();
                    } else if (e.key === 'Escape') {
                      cancelRename();
                    }
                  }}
                  autoFocus
                  className="w-24 px-1 py-0.5 text-xs bg-white dark:bg-[#323236] border border-blue-500 rounded outline-none text-black dark:text-white"
                />
                <button
                  onClick={() => {
                    if (parentHandle && onRenameICloudEntry) {
                      onRenameICloudEntry(parentHandle, node.name, renameValue.trim(), false);
                    }
                    cancelRename();
                  }}
                  className="p-0.5 text-emerald-500 hover:bg-black/5"
                >
                  <Check size={12} />
                </button>
                <button onClick={cancelRename} className="p-0.5 text-gray-400 hover:bg-black/5">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <span className="truncate">{node.name}</span>
            )}
          </div>

          {!isFileRenaming && (
            <div
              className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              {parentHandle && onRenameICloudEntry && (
                <button
                  onClick={() => startRename(`icloud-${node.path}`, node.name)}
                  className={`p-1 rounded ${
                    isActive ? 'hover:bg-blue-700 text-blue-200' : 'hover:bg-black/5 text-gray-400'
                  }`}
                  title="重命名文稿"
                >
                  <Edit2 size={11} />
                </button>
              )}
              {parentHandle && onDeleteICloudEntry && (
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: '删除 iCloud 文稿',
                      message: `确认从 iCloud 删除文稿 "${node.name}" 吗？文件会移至 EasyMD 目录内的 .trash 回收区。`,
                      confirmText: '删除文稿',
                      isDestructive: true,
                      icon: 'trash',
                    });
                    if (ok) {
                      onDeleteICloudEntry(parentHandle, node.name, false);
                    }
                  }}
                  className={`p-1 rounded ${
                    isActive ? 'hover:bg-blue-700 text-blue-200' : 'hover:bg-black/5 text-gray-400'
                  }`}
                  title="删除文稿"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          )}
        </div>
      );
    }
  };

  // --- RENDER LOCAL FOLDERS & DOCUMENTS TREE ---
  const renderLocalFolder = (folder: LocalFolderNode, level: number = 0) => {
    const isExpanded = !!searchQuery.trim() || folder.isExpanded !== false;
    const isRenaming = renamingId === `folder-${folder.id}`;

    // Child documents
    const folderDocs = documents.filter((d) => d.folderId === folder.id);
    // Child subfolders
    const subFolders = folders.filter((f) => f.parentId === folder.id);

    return (
      <div key={folder.id} className="select-none">
        <div
          style={{ paddingLeft: `${level * 12 + 6}px` }}
          className="group flex items-center justify-between py-1 px-1.5 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.05] cursor-pointer text-xs transition-colors"
          onClick={() => onToggleFolderExpand && onToggleFolderExpand(folder.id)}
        >
          <div className="flex items-center space-x-1.5 min-w-0">
            <span className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            <span className="text-amber-500 dark:text-amber-400">
              {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
            </span>

            {isRenaming ? (
              <div
                className="flex items-center space-x-1"
                onClick={(e) => e.stopPropagation()}
              >
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (onRenameFolder) onRenameFolder(folder.id, renameValue.trim());
                      cancelRename();
                    } else if (e.key === 'Escape') {
                      cancelRename();
                    }
                  }}
                  autoFocus
                  className="w-24 px-1 py-0.5 text-xs bg-white dark:bg-[#323236] border border-blue-500 rounded outline-none"
                />
                <button
                  onClick={() => {
                    if (onRenameFolder) onRenameFolder(folder.id, renameValue.trim());
                    cancelRename();
                  }}
                  className="p-0.5 text-emerald-500 hover:bg-black/5"
                >
                  <Check size={12} />
                </button>
                <button onClick={cancelRename} className="p-0.5 text-gray-400 hover:bg-black/5">
                  <X size={12} />
                </button>
              </div>
            ) : (
              <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
                {folder.name}
              </span>
            )}
          </div>

          {!isRenaming && (
            <div
              className="flex items-center space-x-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => onNewDocInFolder && onNewDocInFolder(folder.id, 'md')}
                className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-black/5 dark:hover:bg-white/10"
                title="在此文件夹新建文稿"
              >
                <Plus size={11} />
              </button>
              <button
                onClick={() => onNewSubFolder && onNewSubFolder(folder.id)}
                className="p-1 rounded text-gray-400 hover:text-amber-500 hover:bg-black/5 dark:hover:bg-white/10"
                title="新建子文件夹"
              >
                <FolderPlus size={11} />
              </button>
              <button
                onClick={() => startRename(`folder-${folder.id}`, folder.name)}
                className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
                title="重命名文件夹"
              >
                <Edit2 size={11} />
              </button>
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: '删除本地文件夹',
                    message: `确定删除文件夹 "${folder.name}" 吗？\n文件夹内的文稿将移至根目录保留。`,
                    confirmText: '删除文件夹',
                    isDestructive: true,
                    icon: 'trash',
                  });
                  if (ok && onDeleteFolder) {
                    onDeleteFolder(folder.id);
                  }
                }}
                className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/10"
                title="删除文件夹"
              >
                <Trash2 size={11} />
              </button>
            </div>
          )}
        </div>

        {/* Sub-items */}
        {isExpanded && (
          <div className="space-y-0.5">
            {subFolders.map((sub) => renderLocalFolder(sub, level + 1))}
            {folderDocs.map((doc) => renderLocalDoc(doc, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderLocalDoc = (doc: LocalDocNode, level: number = 0) => {
    const isDocRenaming = renamingId === `doc-${doc.id}`;
    const isActive = doc.id === currentDocId;

    if (searchQuery.trim() && !doc.title.toLowerCase().includes(searchQuery.toLowerCase())) {
      return null;
    }

    return (
      <div
        key={doc.id}
        style={{ paddingLeft: `${level * 12 + 18}px` }}
        onClick={() => onSelectDoc && onSelectDoc(doc.id)}
        className={`group flex items-center justify-between py-1 px-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
          isActive
            ? 'bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 font-medium'
            : 'text-gray-800 dark:text-gray-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.05]'
        }`}
      >
        <div className="flex items-center space-x-1.5 min-w-0">
          {getModeIcon(doc.mode)}
          {isDocRenaming ? (
            <div
              className="flex items-center space-x-1"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (onRenameDoc) onRenameDoc(doc.id, renameValue.trim());
                    cancelRename();
                  } else if (e.key === 'Escape') {
                    cancelRename();
                  }
                }}
                autoFocus
                className="w-24 px-1 py-0.5 text-xs bg-white dark:bg-[#323236] border border-blue-500 rounded outline-none text-black dark:text-white"
              />
              <button
                onClick={() => {
                  if (onRenameDoc) onRenameDoc(doc.id, renameValue.trim());
                  cancelRename();
                }}
                className="p-0.5 text-emerald-500 hover:bg-black/5"
              >
                <Check size={12} />
              </button>
              <button onClick={cancelRename} className="p-0.5 text-gray-400 hover:bg-black/5">
                <X size={12} />
              </button>
            </div>
          ) : (
            <span className="truncate">{doc.title}</span>
          )}

          {doc.isICloudFile && (
            <span title="已同步至 iCloud" className="flex items-center flex-shrink-0">
              <Cloud size={11} className="text-blue-500" />
            </span>
          )}
        </div>

        {!isDocRenaming && (
          <div
            className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => startRename(`doc-${doc.id}`, doc.title)}
              className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
              title="重命名文稿"
            >
              <Edit2 size={11} />
            </button>
            {documents.length > 1 && (
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: '移除文稿',
                    message: `确认从工作区移除文稿 "${doc.title}" 吗？`,
                    confirmText: '移除文稿',
                    isDestructive: true,
                    icon: 'trash',
                  });
                  if (ok && onDeleteDoc) {
                    onDeleteDoc(doc.id);
                  }
                }}
                className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/10"
                title="删除文稿"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  if (treeMode === 'icloud') {
    return (
      <div className="space-y-0.5">
        {icloudNodes.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-400">
            暂无文稿或目录，可点击右上角新建
          </div>
        ) : (
          icloudNodes.map((node) => renderICloudNode(node, 0, rootHandle))
        )}
      </div>
    );
  }

  // Local tree: Top-level folders (parentId is null/undefined) + root documents (folderId is null/undefined)
  const folderIds = new Set(folders.map((folder) => folder.id));
  const rootFolders = folders.filter((f) => !f.parentId || !folderIds.has(f.parentId));
  const rootDocs = documents.filter((d) => !d.folderId || !folderIds.has(d.folderId));

  return (
    <div className="space-y-0.5">
      {rootFolders.map((f) => renderLocalFolder(f, 0))}
      {rootDocs.map((d) => renderLocalDoc(d, 0))}
    </div>
  );
};
