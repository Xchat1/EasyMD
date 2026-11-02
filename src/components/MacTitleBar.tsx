import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Code2,
  FileCode,
  Columns,
  Square,
  Eye,
  Sun,
  Moon,
  FolderOpen,
  Download,
  ChevronDown,
  HelpCircle,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  Sparkles,
  HardDrive,
  AppWindow,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { DocMode, ViewLayout, ThemeMode } from '../types';
import { useDialog } from '../context/DialogContext';

interface MacTitleBarProps {
  title: string;
  setTitle: (title: string) => void;
  isTitleReadOnly?: boolean;
  mode: DocMode;
  setMode: (mode: DocMode) => void;
  layout: ViewLayout;
  setLayout: (layout: ViewLayout) => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  isModified: boolean;
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  onOpenFile: () => void;
  onOpenExport: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
  onQuickExport?: (type: 'md' | 'html' | 'pdf' | 'txt' | 'rich') => void;
  isICloudConnected?: boolean;
  icloudDirName?: string;
  onOpenICloudGuide?: () => void;
}

export const MacTitleBar: React.FC<MacTitleBarProps> = ({
  title,
  setTitle,
  isTitleReadOnly = false,
  mode,
  setMode,
  layout,
  setLayout,
  theme,
  setTheme,
  isModified,
  isSidebarOpen,
  setIsSidebarOpen,
  isFullscreen,
  toggleFullscreen,
  onOpenFile,
  onOpenExport,
  onOpenShortcuts,
  onOpenSettings,
  onQuickExport,
  isICloudConnected,
  icloudDirName,
  onOpenICloudGuide,
}) => {
  const { confirm, toast } = useDialog();
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // PWA install state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(() => {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    );
  });

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      toast.success('EasyMD 已成功安装为 Mac 独立应用！可在启动台或程序坞中找到。');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        toast.success('正在安装 EasyMD 到您的 Mac...');
      }
      setDeferredPrompt(null);
    } else {
      await confirm({
        title: '安装 EasyMD',
        message:
          '安装后，EasyMD 将以极简的原生 macOS 独立窗口常驻在您的「程序坞 (Dock)」与「启动台」中：\n\n1. Chrome / Edge 浏览器：\n   点击地址栏最右侧的 ⊕ 图标（「安装 EasyMD」），或在右上角菜单中选择「将网页作为应用安装」；\n\n2. Safari 浏览器 (macOS 14 及以上)：\n   点击顶部菜单栏【文件】➔【添加到程序坞】；\n\n安装完成后无需保留浏览器标签页，直接从 Dock 双击打开即可！',
        confirmText: '我知道了',
        cancelText: '关闭',
        icon: 'folder',
      });
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsExportDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-12 border-b border-black/[0.08] dark:border-white/[0.1] bg-[#f6f6f7]/90 dark:bg-[#202022]/90 backdrop-blur-xl flex items-center justify-between px-3.5 select-none z-30 transition-colors relative">
      {/* Native window controls belong to macOS/Chrome, not the document toolbar. */}
      <div className="flex items-center space-x-2 w-32 flex-shrink-0">
        <button
          onClick={() => setIsSidebarOpen((prev) => !prev)}
          title="切换侧边栏目录 (⌘+\)"
          className="p-1 rounded-md text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          {isSidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
        </button>

        {/* Brand */}
        <span className="text-xs font-semibold tracking-wide text-gray-700 dark:text-gray-300 font-mono hidden sm:inline-block">
          EasyMD
        </span>
      </div>

      {/* Center: Title input & Mode Switcher */}
      <div className="flex items-center space-x-3 max-w-[460px] flex-1 justify-center">
        {/* Mode Segmented Control */}
        <div className="flex bg-black/[0.06] dark:bg-white/[0.08] p-0.5 rounded-lg border border-black/[0.04] dark:border-white/[0.05]">
          <button
            onClick={() => setMode('md')}
            className={`flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-xs font-medium transition-all ${
              mode === 'md'
                ? 'bg-white dark:bg-[#323236] text-black dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
            title="Markdown 模式 (支持 GFM, 数学公式, Mermaid 图表)"
          >
            <FileText size={13} />
            <span>MD</span>
          </button>
          <button
            onClick={() => setMode('h5')}
            className={`flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-xs font-medium transition-all ${
              mode === 'h5'
                ? 'bg-white dark:bg-[#323236] text-black dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
            title="H5 网页模式 (HTML/CSS/JS 实时沙箱与手机视口)"
          >
            <FileCode size={13} />
            <span>H5</span>
          </button>
          <button
            onClick={() => setMode('txt')}
            className={`flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-xs font-medium transition-all ${
              mode === 'txt'
                ? 'bg-white dark:bg-[#323236] text-black dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
            title="纯文本模式 (极简打字机)"
          >
            <Code2 size={13} />
            <span>TXT</span>
          </button>
        </div>

        {/* Editable Title */}
        <div className="relative flex items-center group max-w-[240px]">
          <input
            type="text"
            value={title}
            readOnly={isTitleReadOnly}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full text-xs font-medium text-center bg-transparent hover:bg-black/5 dark:hover:bg-white/5 focus:bg-white dark:focus:bg-[#2d2d30] border border-transparent focus:border-blue-500/50 rounded px-2 py-0.5 text-gray-800 dark:text-gray-200 focus:outline-none transition-colors truncate"
            title={isTitleReadOnly ? '标题当前只读；已连接文件请在目录中重命名' : '点击修改文档标题'}
          />
          {isModified && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-blue-500 absolute -right-2 top-2"
              title="有未保存修改"
            />
          )}
        </div>
      </div>

      {/* Right: Layout Switchers & Actions */}
      <div className="flex items-center space-x-1.5 justify-end flex-shrink-0">
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? '退出全屏' : '进入全屏'}
          aria-label={isFullscreen ? '退出全屏' : '进入全屏'}
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        {/* Install as Mac Standalone App */}
        {!isInstalled && (
          <button
            onClick={handleInstallClick}
            className="flex items-center space-x-1 px-2 py-1 rounded-lg text-xs font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 transition-colors mr-0.5"
            title="将 EasyMD 安装为 macOS 独立桌面 App (开机即用，常驻程序坞与启动台)"
          >
            <AppWindow size={13} />
            <span className="hidden md:inline">安装到 Mac</span>
          </button>
        )}
        {/* Layout Toggle (Only meaningful for MD and H5) */}
        {mode !== 'txt' && (
          <div className="flex bg-black/[0.06] dark:bg-white/[0.08] p-0.5 rounded-lg mr-1 border border-black/[0.04] dark:border-white/[0.05]">
            <button
              onClick={() => setLayout('editor')}
              className={`p-1 rounded-md transition-all ${
                layout === 'editor'
                  ? 'bg-white dark:bg-[#323236] text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
              }`}
              title="仅编辑模式"
            >
              <Square size={13} />
            </button>
            <button
              onClick={() => setLayout('split')}
              className={`p-1 rounded-md transition-all ${
                layout === 'split'
                  ? 'bg-white dark:bg-[#323236] text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
              }`}
              title="双栏分屏模式"
            >
              <Columns size={13} />
            </button>
            <button
              onClick={() => setLayout('preview')}
              className={`p-1 rounded-md transition-all ${
                layout === 'preview'
                  ? 'bg-white dark:bg-[#323236] text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
              }`}
              title="仅预览模式"
            >
              <Eye size={13} />
            </button>
          </div>
        )}

        {/* iCloud Sync Trigger */}
        <button
          onClick={onOpenICloudGuide}
          className={`p-1.5 rounded-md transition-colors ${
            isICloudConnected
              ? 'text-blue-600 dark:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20'
              : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10'
          }`}
          title={isICloudConnected ? `固定文稿目录: ${icloudDirName}` : '查看固定文稿目录'}
        >
          <HardDrive size={15} />
        </button>

        {/* Open local file */}
        <button
          onClick={onOpenFile}
          className="p-1.5 rounded-md text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title="打开 Mac 本地文件 (⌘+O)"
        >
          <FolderOpen size={15} />
        </button>

        {/* Unified Export Button & Quick Dropdown */}
        <div ref={dropdownRef} className="relative flex items-center">
          <div className="flex items-center rounded-lg bg-[#0071e3] hover:bg-[#0077ed] text-white shadow-sm overflow-hidden transition-all">
            <button
              onClick={onOpenExport}
              className="flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium active:opacity-90"
              title="打开完整导出与分享中心 (⌘+S)"
            >
              <Download size={13} />
              <span>导出</span>
            </button>
            <button
              onClick={() => setIsExportDropdownOpen((prev) => !prev)}
              className="px-1 py-1 hover:bg-black/15 border-l border-white/20 text-white/90 hover:text-white transition-colors"
              title="快捷导出菜单"
            >
              <ChevronDown size={12} />
            </button>
          </div>

          {/* Quick Export Dropdown Menu */}
          {isExportDropdownOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-white dark:bg-[#252528] rounded-xl shadow-xl border border-black/10 dark:border-white/10 p-1.5 z-50 text-xs animate-fadeIn">
              <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                快捷导出文件
              </div>
              <button
                onClick={() => {
                  setIsExportDropdownOpen(false);
                  if (onQuickExport) onQuickExport('md');
                  else onOpenExport();
                }}
                className="w-full flex items-center space-x-2 px-2 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-gray-800 dark:text-gray-200 text-left transition-colors"
              >
                <FileText size={13} className="text-blue-500" />
                <span>导出为 .md 文件</span>
              </button>
              <button
                onClick={() => {
                  setIsExportDropdownOpen(false);
                  if (onQuickExport) onQuickExport('html');
                  else onOpenExport();
                }}
                className="w-full flex items-center space-x-2 px-2 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-gray-800 dark:text-gray-200 text-left transition-colors"
              >
                <FileCode size={13} className="text-emerald-500" />
                <span>导出为 .html 网页</span>
              </button>
              <button
                onClick={() => {
                  setIsExportDropdownOpen(false);
                  if (onQuickExport) onQuickExport('pdf');
                  else onOpenExport();
                }}
                className="w-full flex items-center space-x-2 px-2 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-gray-800 dark:text-gray-200 text-left transition-colors"
              >
                <Printer size={13} className="text-purple-500" />
                <span>打印 / 另存为 PDF</span>
              </button>
              <button
                onClick={() => {
                  setIsExportDropdownOpen(false);
                  if (onQuickExport) onQuickExport('txt');
                  else onOpenExport();
                }}
                className="w-full flex items-center space-x-2 px-2 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-gray-800 dark:text-gray-200 text-left transition-colors"
              >
                <Code2 size={13} className="text-amber-500" />
                <span>导出为 .txt 纯文本</span>
              </button>

              <div className="h-[1px] bg-black/10 dark:bg-white/10 my-1" />

              <button
                onClick={() => {
                  setIsExportDropdownOpen(false);
                  if (onQuickExport) onQuickExport('rich');
                  else onOpenExport();
                }}
                className="w-full flex items-center space-x-2 px-2 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-gray-800 dark:text-gray-200 text-left transition-colors"
              >
                <Sparkles size={13} className="text-blue-500" />
                <span>一键复制排版富文本</span>
              </button>
            </div>
          )}
        </div>

        {/* Theme Toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-1.5 rounded-md text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title={theme === 'dark' ? '切换为浅色模式' : '切换为深色模式'}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Shortcuts */}
        <button
          onClick={onOpenShortcuts}
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title="Mac 快捷键指南 (⌘+/)"
        >
          <HelpCircle size={15} />
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title="编辑器偏好设置"
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  );
};
