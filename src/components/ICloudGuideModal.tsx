import React from 'react';
import {
  X,
  Cloud,
  FolderSync,
  CheckCircle2,
  HardDrive,
  Laptop,
  Smartphone,
} from 'lucide-react';

interface ICloudGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChooseDirectory: () => void;
  isConnected: boolean;
  dirName?: string;
}

export const ICloudGuideModal: React.FC<ICloudGuideModalProps> = ({
  isOpen,
  onClose,
  onChooseDirectory,
  isConnected,
  dirName,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-white dark:bg-[#202022] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden select-none">
        {/* Header */}
        <div className="px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between bg-gradient-to-r from-blue-50/60 to-indigo-50/60 dark:from-blue-950/20 dark:to-indigo-950/20">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 dark:bg-blue-400/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-sm">
              <Cloud size={20} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span>iCloud 云盘同步设置</span>
                {isConnected && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                    已挂载: {dirName}
                  </span>
                )}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                基于 macOS 本地 iCloud 云盘，实现 Mac / iPhone / iPad 全设备同步
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X size={17} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
          {/* Architecture diagram */}
          <div className="p-3.5 rounded-xl bg-gray-50/60 dark:bg-[#252528] border border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between">
            <div className="flex flex-col items-center space-y-1">
              <Laptop size={22} className="text-blue-500" />
              <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">EasyMD</span>
            </div>
            <div className="flex-1 flex flex-col items-center px-2">
              <div className="w-full h-[2px] bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400" />
              <span className="text-[10px] text-gray-400 mt-1 font-mono">本地读写 (0延迟)</span>
            </div>
            <div className="flex flex-col items-center space-y-1">
              <HardDrive size={22} className="text-indigo-500" />
              <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">iCloud 目录</span>
            </div>
            <div className="flex-1 flex flex-col items-center px-2">
              <div className="w-full h-[2px] bg-gradient-to-r from-indigo-400 to-purple-400" />
              <span className="text-[10px] text-gray-400 mt-1 font-mono">Apple 云端同步</span>
            </div>
            <div className="flex flex-col items-center space-y-1">
              <Smartphone size={22} className="text-purple-500" />
              <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">iPhone/iPad</span>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <div className="flex items-start space-x-2">
              <CheckCircle2 size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-gray-800 dark:text-gray-200">1. 原理与隐私安全：</strong>
                <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                  通过 macOS 原生 File System Access API 绑定您 Mac 上的 iCloud 云盘文稿目录。所有内容直接存放在您本地，不经过任何第三方服务器。
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <CheckCircle2 size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-gray-800 dark:text-gray-200">2. 如何在 Finder 中选取：</strong>
                <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                  点击下方按钮打开 Mac 文件选择窗口，在左侧边栏找到 <strong>「iCloud 云盘」</strong>，选择或新建一个名为 <code>EasyMD</code> 的文件夹并确认。
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2">
              <CheckCircle2 size={15} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="text-gray-800 dark:text-gray-200">3. 自动同步多端：</strong>
                <p className="text-gray-500 dark:text-gray-400 mt-0.5">
                  在 EasyMD 中保存文档后，macOS 系统会自动将更新同步至 Apple iCloud。您在 iPhone 或 iPad 的「文件」App 中即可随时查看或编辑。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-gray-50/70 dark:bg-[#1a1a1c]/70 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            支持 Chrome / Edge 等现代浏览器
          </span>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              稍后设置
            </button>
            <button
              onClick={() => {
                onChooseDirectory();
                onClose();
              }}
              className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all active:scale-95"
            >
              <FolderSync size={13} />
              <span>{isConnected ? '更换 iCloud 目录' : '立即选择 iCloud 目录'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
