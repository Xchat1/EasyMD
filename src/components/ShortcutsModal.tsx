import React from 'react';
import { X, Command } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: '⌘ + S', desc: '保存当前文件 / 调出导出面板' },
    { key: '⌘ + O', desc: '从 Mac Finder 打开本地文本文件' },
    { key: '⌘ + N', desc: '新建空白工作台文档' },
    { key: '⌘ + \\', desc: '展开 / 折叠左侧文档与大纲目录' },
    { key: '⌘ + B', desc: '粗体 (Markdown)' },
    { key: '⌘ + I', desc: '斜体 (Markdown)' },
    { key: '⌘ + K', desc: '快速插入超链接' },
    { key: '⌘ + P', desc: '打印 / 另存为 PDF' },
    { key: '⌘ + F', desc: '在编辑器中查找与替换' },
    { key: '⌘ + /', desc: '打开快捷键指南' },
    { key: 'Esc', desc: '关闭当前浮层弹窗' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-white dark:bg-[#222225] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden select-none">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Command size={16} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              macOS 办公快捷键指南
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="p-4 max-h-[420px] overflow-y-auto mac-scrollbar space-y-2">
          {shortcuts.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-black/[0.03] dark:hover:bg-white/[0.03]"
            >
              <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">
                {item.desc}
              </span>
              <kbd className="px-2 py-0.5 rounded bg-black/[0.06] dark:bg-white/[0.1] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono font-medium text-gray-800 dark:text-gray-200 shadow-sm">
                {item.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 bg-gray-50/70 dark:bg-[#1a1a1c]/70 border-t border-black/[0.06] dark:border-white/[0.08] text-[11px] text-gray-400 text-center">
          所有快捷键已针对 macOS 键盘习惯深度优化
        </div>
      </div>
    </div>
  );
};
