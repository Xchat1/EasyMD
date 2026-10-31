import React from 'react';
import { X, Sliders, Type, Hash, WrapText, Check } from 'lucide-react';
import { EditorSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: EditorSettings;
  setSettings: React.Dispatch<React.SetStateAction<EditorSettings>>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  setSettings,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-white dark:bg-[#222225] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden select-none">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sliders size={16} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              编辑器偏好设置
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>

        {/* Settings Form */}
        <div className="p-5 space-y-4">
          {/* Font Size */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-medium text-gray-700 dark:text-gray-300">
              <Type size={15} className="text-gray-400" />
              <span>字号大小 ({settings.fontSize}px)</span>
            </div>
            <input
              type="range"
              min="12"
              max="24"
              value={settings.fontSize}
              onChange={(e) =>
                setSettings((s) => ({ ...s, fontSize: Number(e.target.value) }))
              }
              className="w-32 accent-blue-600 cursor-pointer"
            />
          </div>

          {/* Line Numbers */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-medium text-gray-700 dark:text-gray-300">
              <Hash size={15} className="text-gray-400" />
              <span>显示代码行号</span>
            </div>
            <button
              onClick={() =>
                setSettings((s) => ({ ...s, lineNumbers: !s.lineNumbers }))
              }
              className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                settings.lineNumbers ? 'bg-blue-600 justify-end' : 'bg-gray-300 dark:bg-gray-600 justify-start'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
            </button>
          </div>

          {/* Word Wrap */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs font-medium text-gray-700 dark:text-gray-300">
              <WrapText size={15} className="text-gray-400" />
              <span>自动换行 (Word Wrap)</span>
            </div>
            <button
              onClick={() =>
                setSettings((s) => ({ ...s, wordWrap: !s.wordWrap }))
              }
              className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors ${
                settings.wordWrap ? 'bg-blue-600 justify-end' : 'bg-gray-300 dark:bg-gray-600 justify-start'
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-white shadow-sm" />
            </button>
          </div>

          {/* Tab Size */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              缩进空格数 (Tab Size)
            </span>
            <div className="flex bg-black/[0.05] dark:bg-white/[0.08] p-0.5 rounded-lg border border-black/[0.04]">
              {[2, 4].map((size) => (
                <button
                  key={size}
                  onClick={() => setSettings((s) => ({ ...s, tabSize: size }))}
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    settings.tabSize === size
                      ? 'bg-white dark:bg-[#323236] text-blue-600 font-semibold shadow-sm'
                      : 'text-gray-500'
                  }`}
                >
                  {size} 格
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-gray-50/70 dark:bg-[#1a1a1c]/70 border-t border-black/[0.06] dark:border-white/[0.08] flex justify-end">
          <button
            onClick={onClose}
            className="flex items-center space-x-1 px-4 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all"
          >
            <Check size={13} />
            <span>完成保存</span>
          </button>
        </div>
      </div>
    </div>
  );
};
