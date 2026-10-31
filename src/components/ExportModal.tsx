import React, { useState } from 'react';
import {
  X,
  Download,
  Copy,
  Printer,
  Check,
  FileText,
  FileCode,
  Code2,
  Sparkles,
  FileCheck2,
  FileDown,
} from 'lucide-react';
import { DocMode } from '../types';
import {
  downloadFile,
  copyRichTextToClipboard,
  generateStandaloneHtml,
} from '../utils/fileSystem';
import { renderMarkdown } from '../utils/markdown';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
  mode: DocMode;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  title,
  content,
  mode,
}) => {
  const [successAction, setSuccessAction] = useState<string | null>(null);

  if (!isOpen) return null;

  const baseName = title.replace(/\.[^/.]+$/, '') || 'EasyMD-文档';

  const showSuccessFeedback = (actionKey: string) => {
    setSuccessAction(actionKey);
    setTimeout(() => {
      setSuccessAction(null);
    }, 2000);
  };

  // 1. Export as Markdown (.md)
  const handleExportMd = () => {
    downloadFile(content, `${baseName}.md`, 'text/markdown;charset=utf-8');
    showSuccessFeedback('md');
  };

  // 2. Export as Standalone HTML (.html)
  const handleExportHtml = async () => {
    let body = content;
    if (mode === 'md') {
      body = await renderMarkdown(content);
    }
    const html = generateStandaloneHtml(title, body, mode === 'h5');
    downloadFile(html, `${baseName}.html`, 'text/html;charset=utf-8');
    showSuccessFeedback('html');
  };

  // 3. Export as PDF (.pdf)
  const handleExportPdf = () => {
    showSuccessFeedback('pdf');
    setTimeout(() => {
      window.print();
    }, 150);
  };

  // 4. Export as Plain Text (.txt)
  const handleExportTxt = () => {
    downloadFile(content, `${baseName}.txt`, 'text/plain;charset=utf-8');
    showSuccessFeedback('txt');
  };

  // 5. Copy Rich Text for WeChat / Lark / DingTalk / Mail
  const handleCopyRichText = async () => {
    let rendered = content;
    if (mode === 'md') {
      rendered = await renderMarkdown(content);
    }
    const success = await copyRichTextToClipboard(rendered, content);
    if (success) {
      showSuccessFeedback('copy-rich');
    }
  };

  // 6. Copy Raw Source
  const handleCopyRaw = async () => {
    await navigator.clipboard.writeText(content);
    showSuccessFeedback('copy-raw');
  };

  // Unified File Export Cards Configuration
  const fileExports = [
    {
      id: 'md',
      name: 'Markdown 文档',
      ext: '.md',
      desc: '标准 GFM 格式，保留数学公式与图表源码',
      icon: FileText,
      iconColor: 'text-blue-500',
      bgColor: 'hover:border-blue-400 dark:hover:border-blue-500',
      isCurrentMode: mode === 'md',
      onClick: handleExportMd,
      btnLabel: '导出 .md',
    },
    {
      id: 'html',
      name: 'HTML 独立网页',
      ext: '.html',
      desc: '单文件内嵌完整样式，脱机双击浏览器直接打开',
      icon: FileCode,
      iconColor: 'text-emerald-500',
      bgColor: 'hover:border-emerald-400 dark:hover:border-emerald-500',
      isCurrentMode: mode === 'h5',
      onClick: handleExportHtml,
      btnLabel: '导出 .html',
    },
    {
      id: 'pdf',
      name: 'PDF 便携文档',
      ext: '.pdf',
      desc: '调用 Mac 系统高保真打印，一键另存为 PDF',
      icon: Printer,
      iconColor: 'text-purple-500',
      bgColor: 'hover:border-purple-400 dark:hover:border-purple-500',
      isCurrentMode: false,
      onClick: handleExportPdf,
      btnLabel: '导出 .pdf',
    },
    {
      id: 'txt',
      name: '纯文本文档',
      ext: '.txt',
      desc: '纯字符文本，无格式修饰，跨平台通用',
      icon: Code2,
      iconColor: 'text-amber-500',
      bgColor: 'hover:border-amber-400 dark:hover:border-amber-500',
      isCurrentMode: mode === 'txt',
      onClick: handleExportTxt,
      btnLabel: '导出 .txt',
    },
  ];

  // Unified Clipboard Copy Cards Configuration
  const copyExports = [
    {
      id: 'copy-rich',
      name: '复制排版富文本',
      badge: '微信 / 飞书 / 邮件',
      desc: '保留标题、表格、代码高亮与公式样式，直接粘贴免排版',
      icon: Sparkles,
      iconColor: 'text-blue-500',
      onClick: handleCopyRichText,
      btnLabel: '复制富文本',
    },
    {
      id: 'copy-raw',
      name: '复制文档源码',
      badge: '纯文本代码',
      desc: '复制当前文档的原始文本源码，方便快速分发给技术或代码库',
      icon: Copy,
      iconColor: 'text-gray-500',
      onClick: handleCopyRaw,
      btnLabel: '复制代码',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl bg-white dark:bg-[#202022] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden select-none">
        {/* Header */}
        <div className="px-6 py-4 border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between bg-gray-50/50 dark:bg-[#242427]/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 dark:bg-blue-400/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <Download size={17} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span>导出与分享</span>
                <span className="text-[11px] font-normal text-gray-400">
                  快捷键: ⌘ + S
                </span>
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-md mt-0.5">
                当前文件: <span className="font-mono text-gray-700 dark:text-gray-300 font-medium">{title}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto mac-scrollbar">
          {/* Section 1: File Exports (Unified 2x2 Grid) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
                <FileDown size={14} className="text-blue-500" />
                <span>导出为本地文件</span>
              </div>
              <span className="text-[11px] text-gray-400">
                点击右侧统一按钮即可快速保存到本地
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fileExports.map((item) => {
                const IconComponent = item.icon;
                const isSuccess = successAction === item.id;

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-gray-50/40 dark:bg-[#262629]/50 flex items-center justify-between transition-all ${item.bgColor}`}
                  >
                    <div className="flex items-start space-x-3 mr-2 min-w-0">
                      <div className={`p-2 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] flex-shrink-0 mt-0.5 ${item.iconColor}`}>
                        <IconComponent size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {item.name}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/[0.05] dark:bg-white/[0.08] text-gray-500 font-medium">
                            {item.ext}
                          </span>
                          {item.isCurrentMode && (
                            <span className="text-[10px] px-1 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium scale-90 origin-left">
                              当前
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-snug line-clamp-1">
                          {item.desc}
                        </p>
                      </div>
                    </div>

                    {/* Unified Action Button */}
                    <button
                      onClick={item.onClick}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 flex-shrink-0 shadow-sm border ${
                        isSuccess
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white dark:bg-[#323236] border-black/10 dark:border-white/10 hover:border-blue-500 text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400'
                      }`}
                    >
                      {isSuccess ? (
                        <>
                          <Check size={13} className="text-white" />
                          <span>已导出</span>
                        </>
                      ) : (
                        <>
                          <Download size={13} />
                          <span>{item.btnLabel}</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Clipboard Quick Copy (Unified Row Grid) */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
                <Copy size={14} className="text-emerald-500" />
                <span>快速复制到剪贴板</span>
              </div>
              <span className="text-[11px] text-gray-400">
                支持直接粘贴至常用办公协同应用
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {copyExports.map((item) => {
                const IconComponent = item.icon;
                const isSuccess = successAction === item.id;

                return (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl border border-black/[0.08] dark:border-white/[0.08] bg-gray-50/40 dark:bg-[#262629]/50 flex items-center justify-between hover:border-blue-400 dark:hover:border-blue-500 transition-all"
                  >
                    <div className="flex items-start space-x-3 mr-2 min-w-0">
                      <div className={`p-2 rounded-lg bg-black/[0.04] dark:bg-white/[0.06] flex-shrink-0 mt-0.5 ${item.iconColor}`}>
                        <IconComponent size={18} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {item.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-black/[0.05] dark:bg-white/[0.08] text-gray-500">
                            {item.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-snug line-clamp-1">
                          {item.desc}
                        </p>
                      </div>
                    </div>

                    {/* Unified Action Button */}
                    <button
                      onClick={item.onClick}
                      className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95 flex-shrink-0 shadow-sm border ${
                        isSuccess
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white dark:bg-[#323236] border-black/10 dark:border-white/10 hover:border-blue-500 text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400'
                      }`}
                    >
                      {isSuccess ? (
                        <>
                          <Check size={13} className="text-white" />
                          <span>已复制!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} />
                          <span>{item.btnLabel}</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-gray-50/70 dark:bg-[#1a1a1c]/70 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center space-x-1.5">
            <FileCheck2 size={14} className="text-emerald-500" />
            <span>导出均采用 UTF-8 编码，兼容所有 macOS 及移动端系统</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1 rounded-md text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
