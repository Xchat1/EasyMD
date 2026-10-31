import React, { useState, useMemo } from 'react';
import {
  ListTree,
  FolderTree,
  Plus,
  Clock,
  ChevronRight,
  Cloud,
  FolderSync,
  RefreshCw,
  X,
  Info,
  FolderPlus,
  Search,
  ArrowUpDown,
} from 'lucide-react';
import { DocumentItem, FolderItem, TocItem, DocMode, ICloudDirState, SortOption } from '../types';
import { ICloudNode } from '../utils/icloudSync';
import { DirectoryTree } from './DirectoryTree';

interface OutlineSidebarProps {
  isOpen: boolean;
  width?: number;
  documents: DocumentItem[];
  folders: FolderItem[];
  currentDocId: string;
  onSelectDoc: (id: string) => void;
  onNewDoc: (mode: DocMode, folderId?: string | null) => void;
  onDeleteDoc: (id: string) => void;
  onRenameDoc: (id: string, newTitle: string) => void;
  onNewFolder: (parentId?: string | null) => void;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onToggleFolderExpand: (folderId: string) => void;
  toc: TocItem[];
  currentMode: DocMode;
  onHeadingClick?: (id: string, text: string) => void;

  // iCloud Sync props
  icloudDir: ICloudDirState;
  icloudTree: ICloudNode[];
  onMountICloud: () => void;
  onUnmountICloud: () => void;
  onRefreshICloud: () => void;
  onOpenICloudFile: (handle: FileSystemFileHandle, name: string, mode: DocMode) => void;
  onCreateICloudFileInDir: (parentDirHandle: FileSystemDirectoryHandle, mode: DocMode) => void;
  onCreateICloudSubDir: (parentDirHandle: FileSystemDirectoryHandle) => void;
  onRenameICloudEntry: (parentDirHandle: FileSystemDirectoryHandle, oldName: string, newName: string, isDirectory: boolean) => void;
  onDeleteICloudEntry: (parentDirHandle: FileSystemDirectoryHandle, name: string, isDirectory: boolean) => void;
  onOpenICloudGuide: () => void;
}

export const OutlineSidebar: React.FC<OutlineSidebarProps> = ({
  isOpen,
  width = 220,
  documents,
  folders,
  currentDocId,
  onSelectDoc,
  onNewDoc,
  onDeleteDoc,
  onRenameDoc,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
  onToggleFolderExpand,
  toc,
  currentMode,
  onHeadingClick,
  icloudDir,
  icloudTree,
  onMountICloud,
  onUnmountICloud,
  onRefreshICloud,
  onOpenICloudFile,
  onCreateICloudFileInDir,
  onCreateICloudSubDir,
  onRenameICloudEntry,
  onDeleteICloudEntry,
  onOpenICloudGuide,
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'toc'>('files');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState<boolean>(false);

  // Switch tab if mode leaves MD
  React.useEffect(() => {
    if (currentMode !== 'md' && activeTab === 'toc') {
      setActiveTab('files');
    }
  }, [currentMode, activeTab]);

  // Close sort dropdown when clicking outside
  React.useEffect(() => {
    if (!isSortDropdownOpen) return;
    const handleDocumentClick = () => setIsSortDropdownOpen(false);
    window.addEventListener('click', handleDocumentClick);
    return () => window.removeEventListener('click', handleDocumentClick);
  }, [isSortDropdownOpen]);

  if (!isOpen) return null;

  // Sorted documents
  const sortedDocs = useMemo(() => {
    const list = [...documents];
    if (sortBy === 'name') {
      list.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
    } else if (sortBy === 'date') {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
    } else if (sortBy === 'type') {
      list.sort((a, b) => a.mode.localeCompare(b.mode));
    }
    return list;
  }, [documents, sortBy]);

  const scrollToHeading = (id: string, text: string) => {
    if (onHeadingClick) {
      onHeadingClick(id, text);
    }

    setTimeout(() => {
      const element = document.getElementById(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      const previewContainer = document.querySelector('.easymd-preview');
      if (!previewContainer) return;

      const headings = previewContainer.querySelectorAll('h1, h2, h3, h4, h5, h6');
      for (const h of Array.from(headings)) {
        if (h.textContent?.includes(text)) {
          h.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
    }, 50);
  };

  return (
    <aside
      style={{ width: `${width}px` }}
      className="border-r border-black/[0.08] dark:border-white/[0.08] bg-[#f2f2f4]/95 dark:bg-[#1a1a1c]/95 flex flex-col h-full flex-shrink-0 select-none backdrop-blur-xl z-20 transition-[width] duration-75 overflow-hidden"
    >
      {/* 1. Header Tabs: Segmented Control with Strict Fixed Height (h-10) */}
      <div className="h-10 px-2.5 border-b border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between flex-shrink-0">
        <div className="flex bg-black/[0.05] dark:bg-white/[0.06] p-0.5 rounded-lg w-full h-7 items-center">
          <button
            onClick={() => setActiveTab('files')}
            className={`flex-1 h-6 min-w-0 flex items-center justify-center space-x-1 px-2 rounded text-xs font-medium transition-all select-none whitespace-nowrap ${
              activeTab === 'files'
                ? 'bg-white dark:bg-[#2c2c30] text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
            }`}
            title="文稿目录树"
          >
            <FolderTree size={12} className="flex-shrink-0" />
            <span className="truncate">文稿目录</span>
          </button>
          {currentMode === 'md' && (
            <button
              onClick={() => setActiveTab('toc')}
              className={`flex-1 h-6 min-w-0 flex items-center justify-center space-x-1 px-2 rounded text-xs font-medium transition-all select-none whitespace-nowrap ${
                activeTab === 'toc'
                  ? 'bg-white dark:bg-[#2c2c30] text-gray-900 dark:text-gray-100 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
              }`}
              title={`大纲目录 (${toc.length})`}
            >
              <ListTree size={12} className="flex-shrink-0" />
              <span className="truncate">大纲{toc.length > 0 ? ` (${toc.length})` : ''}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Sub-toolbar: Fixed Height (h-9), perfectly balanced for both tabs */}
      <div className="h-9 px-2.5 border-b border-black/[0.04] dark:border-white/[0.04] flex items-center justify-between flex-shrink-0 text-xs">
        {activeTab === 'files' ? (
          <>
            {/* Search Input */}
            <div className="flex-1 relative flex items-center min-w-0 mr-1.5">
              <Search size={12} className="absolute left-2 text-gray-400 pointer-events-none flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索文稿或目录..."
                className="w-full text-[11px] pl-6 pr-5 py-0.5 h-6 bg-black/[0.04] dark:bg-white/[0.06] rounded-md border border-transparent focus:border-blue-500/50 outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Actions: Sort, New Folder, New Doc */}
            <div className="flex items-center space-x-0.5 flex-shrink-0">
              {/* Sort Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsSortDropdownOpen((prev) => !prev)}
                  className="p-1 rounded-md text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
                  title="排序方式"
                >
                  <ArrowUpDown size={12} />
                </button>

                {isSortDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1 w-28 bg-white dark:bg-[#252528] rounded-lg shadow-lg border border-black/10 dark:border-white/10 p-1 z-30 text-xs animate-fadeIn">
                    <button
                      onClick={() => {
                        setSortBy('name');
                        setIsSortDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1 rounded ${
                        sortBy === 'name' ? 'bg-blue-500 text-white' : 'hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      按名称 A-Z
                    </button>
                    <button
                      onClick={() => {
                        setSortBy('date');
                        setIsSortDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1 rounded ${
                        sortBy === 'date' ? 'bg-blue-500 text-white' : 'hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      按最新修改
                    </button>
                    <button
                      onClick={() => {
                        setSortBy('type');
                        setIsSortDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1 rounded ${
                        sortBy === 'type' ? 'bg-blue-500 text-white' : 'hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      按文档类型
                    </button>
                  </div>
                )}
              </div>

              {/* New Folder */}
              <button
                onClick={() => onNewFolder(null)}
                className="p-1 rounded text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
                title="新建根目录文件夹"
              >
                <FolderPlus size={13} />
              </button>

              {/* New Document */}
              <button
                onClick={() => onNewDoc(currentMode, null)}
                className="p-1 rounded text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
                title="新建根目录文稿"
              >
                <Plus size={14} />
              </button>
            </div>
          </>
        ) : (
          /* Table of Contents sub-header - same fixed h-9 height */
          <div className="w-full flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
            <span className="font-medium">大纲层级导航</span>
            <span className="font-mono text-[10px] bg-black/[0.04] dark:bg-white/[0.06] px-1.5 py-0.5 rounded">
              {toc.length} 个层级标题
            </span>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto mac-scrollbar p-2 space-y-3">
        {activeTab === 'files' ? (
          <>
            {/* 1. iCloud Directory Section (Tree View) */}
            {icloudDir.handle ? (
              <div className="p-2 rounded-xl bg-gradient-to-b from-blue-50/70 to-indigo-50/70 dark:from-blue-950/25 dark:to-indigo-950/25 border border-blue-200/60 dark:border-blue-800/40 shadow-sm">
                {/* iCloud Header & Control Bar */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <Cloud size={14} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <span className="text-xs font-semibold text-blue-900 dark:text-blue-200 truncate">
                      iCloud: {icloudDir.name}
                    </span>
                  </div>

                  <div className="flex items-center space-x-0.5">
                    <button
                      onClick={() => onCreateICloudSubDir(icloudDir.handle!)}
                      className="p-1 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                      title="在 iCloud 根目录新建文件夹"
                    >
                      <FolderPlus size={12} />
                    </button>
                    <button
                      onClick={() => onCreateICloudFileInDir(icloudDir.handle!, currentMode)}
                      className="p-1 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                      title="在 iCloud 根目录新建文稿"
                    >
                      <Plus size={13} />
                    </button>
                    <button
                      onClick={onRefreshICloud}
                      className="p-1 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                      title="刷新 iCloud 目录树"
                    >
                      <RefreshCw size={12} className={icloudDir.isSyncing ? 'animate-spin' : ''} />
                    </button>
                    <button
                      onClick={onOpenICloudGuide}
                      className="p-1 rounded text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                      title="iCloud 同步说明"
                    >
                      <Info size={12} />
                    </button>
                    <button
                      onClick={onUnmountICloud}
                      className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/10"
                      title="断开挂载"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>

                {/* Recursive iCloud Directory Tree */}
                <div className="pt-1 border-t border-blue-200/40 dark:border-blue-800/30">
                  <DirectoryTree
                    treeMode="icloud"
                    icloudNodes={icloudTree}
                    currentDocId={currentDocId}
                    searchQuery={searchQuery}
                    onOpenICloudFile={onOpenICloudFile}
                    onCreateICloudFileInDir={onCreateICloudFileInDir}
                    onCreateICloudSubDir={onCreateICloudSubDir}
                    onRenameICloudEntry={onRenameICloudEntry}
                    onDeleteICloudEntry={onDeleteICloudEntry}
                  />
                </div>
              </div>
            ) : (
              /* Mount iCloud CTA */
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-950/20 dark:to-indigo-950/20 border border-blue-200/60 dark:border-blue-900/40">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-blue-900 dark:text-blue-200">
                    <Cloud size={15} className="text-blue-600 dark:text-blue-400" />
                    <span>iCloud 文稿目录同步</span>
                  </div>
                  <button
                    onClick={onOpenICloudGuide}
                    className="text-blue-500 hover:text-blue-700"
                    title="查看同步说明"
                  >
                    <Info size={13} />
                  </button>
                </div>
                <p className="text-[11px] text-blue-700/80 dark:text-blue-300/80 leading-relaxed mb-2.5">
                  连接 Mac 上的 iCloud 云盘（如 iCloud 云盘/EasyMD），支持树形目录组织与多设备全自动落盘。
                </p>
                <button
                  onClick={onMountICloud}
                  className="w-full py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium shadow-sm transition-all flex items-center justify-center space-x-1.5 active:scale-95"
                >
                  <FolderSync size={13} />
                  <span>选择 iCloud 文稿目录</span>
                </button>
              </div>
            )}

            {/* 2. Local Workspace Directory Tree */}
            <div className="space-y-1 pt-1">
              <div className="px-2 py-1 flex items-center justify-between text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                <span>本地文稿目录树</span>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => onNewFolder(null)}
                    className="px-1 text-gray-500 hover:text-blue-600 hover:underline"
                    title="新建文件夹"
                  >
                    +目录
                  </button>
                  <button
                    onClick={() => onNewDoc('md', null)}
                    className="px-1 text-blue-500 hover:underline"
                    title="新建 MD"
                  >
                    +MD
                  </button>
                  <button
                    onClick={() => onNewDoc('h5', null)}
                    className="px-1 text-emerald-500 hover:underline"
                    title="新建 H5"
                  >
                    +H5
                  </button>
                  <button
                    onClick={() => onNewDoc('txt', null)}
                    className="px-1 text-amber-500 hover:underline"
                    title="新建 TXT"
                  >
                    +TXT
                  </button>
                </div>
              </div>

              {/* Local Folder & Document Tree Component */}
              <DirectoryTree
                treeMode="local"
                folders={folders}
                documents={sortedDocs}
                currentDocId={currentDocId}
                searchQuery={searchQuery}
                onSelectDoc={onSelectDoc}
                onDeleteDoc={onDeleteDoc}
                onRenameDoc={onRenameDoc}
                onNewDocInFolder={(folderId, mode) => onNewDoc(mode, folderId)}
                onNewSubFolder={onNewFolder}
                onRenameFolder={onRenameFolder}
                onDeleteFolder={onDeleteFolder}
                onToggleFolderExpand={onToggleFolderExpand}
              />
            </div>
          </>
        ) : (
          /* Table of Contents */
          <div className="space-y-1">
            <div className="px-2 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Markdown 大纲导航
            </div>

            {toc.length === 0 ? (
              <div className="p-4 text-center text-xs text-gray-400">
                暂无标题，可在正文中使用 #, ## 添加层级标题
              </div>
            ) : (
              toc.map((item, index) => {
                const indentClass =
                  item.level === 1
                    ? 'pl-2 font-medium text-gray-800 dark:text-gray-200'
                    : item.level === 2
                    ? 'pl-4 text-gray-700 dark:text-gray-300'
                    : 'pl-6 text-gray-500 dark:text-gray-400';

                return (
                  <button
                    key={`${item.id}-${index}`}
                    onClick={() => scrollToHeading(item.id, item.text)}
                    className={`w-full text-left py-1.5 pr-2 rounded text-xs hover:bg-black/5 dark:hover:bg-white/5 transition-colors truncate flex items-center group ${indentClass}`}
                    title={item.text}
                  >
                    <ChevronRight
                      size={11}
                      className="opacity-0 group-hover:opacity-100 mr-1 text-blue-500 flex-shrink-0 transition-opacity"
                    />
                    <span className="truncate">{item.text}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-black/[0.06] dark:border-white/[0.06] text-[11px] text-gray-500 dark:text-gray-400 flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <Clock size={12} />
          <span>{icloudDir.handle ? 'iCloud 实时落盘' : '本地树形存储'}</span>
        </div>
        <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-mono">
          {icloudDir.handle ? 'iCloud Active' : 'Ready'}
        </span>
      </div>
    </aside>
  );
};
