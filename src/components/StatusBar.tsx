import React from 'react';
import { DocMode, DocStats } from '../types';
import { CheckCircle2, ShieldCheck, Cloud } from 'lucide-react';

interface StatusBarProps {
  mode: DocMode;
  stats: DocStats;
  cursorPos: { line: number; col: number };
  isSaved: boolean;
  icloudStatus?: {
    isConnected: boolean;
    name: string;
    isSyncing: boolean;
  };
}

export const StatusBar: React.FC<StatusBarProps> = ({
  mode,
  stats,
  cursorPos,
  isSaved,
  icloudStatus,
}) => {
  const getModeLabel = () => {
    switch (mode) {
      case 'md':
        return 'Markdown (GFM + KaTeX + Mermaid)';
      case 'h5':
        return 'HTML5 实时沙箱';
      case 'txt':
        return 'TXT 纯文本';
    }
  };

  return (
    <footer className="h-6 px-3 bg-[#f6f6f7]/95 dark:bg-[#1e1e20]/95 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 select-none z-10 transition-colors">
      {/* Left: Mode & Document Stats */}
      <div className="flex items-center space-x-3 truncate">
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {getModeLabel()}
        </span>

        <span className="hidden sm:inline-block text-gray-300 dark:text-gray-700">|</span>

        <div className="hidden sm:flex items-center space-x-2.5">
          <span>{stats.characters} 字符</span>
          <span>{stats.words} 词</span>
          <span>{stats.lines} 行</span>
          <span>约 {stats.readTimeMinutes} 分钟读完</span>
        </div>
      </div>

      {/* Right: Cursor Pos & Local Storage Status */}
      <div className="flex items-center space-x-3 flex-shrink-0">
        <span className="font-mono">
          第 {cursorPos.line} 行，第 {cursorPos.col} 列
        </span>

        {icloudStatus?.isConnected && (
          <>
            <span className="text-gray-300 dark:text-gray-700">|</span>
            <div
              className="flex items-center space-x-1 text-blue-600 dark:text-blue-400"
              title="当前文稿与 macOS iCloud 云盘目录保持实时自动同步"
            >
              <Cloud size={12} className={icloudStatus.isSyncing ? 'animate-bounce' : ''} />
              <span className="hidden sm:inline font-medium">iCloud: {icloudStatus.name}</span>
            </div>
          </>
        )}

        <span className="text-gray-300 dark:text-gray-700">|</span>

        <div className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400">
          {isSaved ? (
            <>
              <CheckCircle2 size={11} />
              <span className="hidden sm:inline">已自动保存</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="hidden sm:inline text-amber-500">正在同步...</span>
            </>
          )}
        </div>

        <div
          className="hidden md:flex items-center space-x-0.5 text-gray-400"
          title="纯本地离线处理，无任何数据上传，隐私安全"
        >
          <ShieldCheck size={12} className="text-blue-500" />
          <span>本地沙箱</span>
        </div>
      </div>
    </footer>
  );
};
