import React from 'react';
import { X, FolderOpen, CheckCircle2 } from 'lucide-react';

interface ICloudGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChooseDirectory: () => void;
  isConnected: boolean;
  dirName?: string;
}

export const ICloudGuideModal: React.FC<ICloudGuideModalProps> = ({
  isOpen, onClose, onChooseDirectory, isConnected, dirName,
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="workspace-title" className="w-full max-w-lg bg-white dark:bg-[#202022] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
        <header className="px-6 py-4 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
          <h3 id="workspace-title" className="flex items-center gap-2 font-semibold text-gray-900 dark:text-gray-100"><FolderOpen size={18} />文稿保存位置</h3>
          <button onClick={onClose} aria-label="关闭" className="p-1 text-gray-500"><X size={18} /></button>
        </header>
        <div className="p-6 space-y-4 text-sm text-gray-600 dark:text-gray-300">
          <p>所有文稿自动保存到固定的 EasyMD 文件夹，无需选择目录。</p>
          <p className="rounded-lg bg-gray-100 dark:bg-black/20 px-3 py-2 break-all font-mono text-xs">{dirName || '文稿/EasyMD'}</p>
          <p className="flex items-center gap-2"><CheckCircle2 size={15} />{isConnected ? '已连接，编辑后自动保存到磁盘。' : '目录服务未连接，编辑会保留为浏览器草稿。'}</p>
          <p className="text-xs leading-relaxed">已有同名文件不会被覆盖；磁盘文件被其他应用修改时，会保留草稿并提示冲突。删除的磁盘文件暂存在 EasyMD 文件夹内的 .trash 回收区。</p>
          <p className="text-xs leading-relaxed">当前安装使用本机文稿目录，不会自动启用 iCloud。若你以后配置云盘目录，或已开启系统的“桌面与文稿文件夹”同步，跨设备同步由 macOS 管理。重要文稿请另行备份。</p>
        </div>
        <footer className="px-6 py-3 border-t border-black/5 dark:border-white/10 flex justify-end gap-3">
          {!isConnected && <button onClick={onChooseDirectory} className="text-sm text-blue-600">重新连接</button>}
          <button onClick={onClose} className="px-4 py-1.5 text-sm rounded-lg bg-blue-600 text-white">知道了</button>
        </footer>
      </section>
    </div>
  );
};
