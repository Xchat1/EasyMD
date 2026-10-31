import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import {
  Smartphone,
  Tablet,
  Monitor,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import { DocMode, DevicePreview, ThemeMode } from '../types';
import { renderMarkdown } from '../utils/markdown';

interface PreviewAreaProps {
  content: string;
  mode: DocMode;
  theme: ThemeMode;
  previewRef: React.RefObject<HTMLDivElement | null>;
}

// Initialize Mermaid once
mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
});

export const PreviewArea: React.FC<PreviewAreaProps> = ({
  content,
  mode,
  theme,
  previewRef,
}) => {
  const [renderedHtml, setRenderedHtml] = useState<string>('');
  const [device, setDevice] = useState<DevicePreview>('responsive');
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null);
  const [iframeKey, setIframeKey] = useState<number>(0);
  const mdContainerRef = useRef<HTMLDivElement>(null);

  // Wrap partial HTML in responsive container for realistic mobile/tablet preview
  const safeIframeDoc = React.useMemo(() => {
    if (!content) return '';
    const trimmed = content.trim().toLowerCase();
    if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) {
      return content;
    }
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
    }
    * { box-sizing: border-box; }
  </style>
</head>
<body>
${content}
</body>
</html>`;
  }, [content]);

  // Markdown rendering
  useEffect(() => {
    if (mode === 'md') {
      let isCurrent = true;
      renderMarkdown(content).then((html) => {
        if (isCurrent) {
          setRenderedHtml(html);
        }
      });
      return () => {
        isCurrent = false;
      };
    }
  }, [content, mode]);

  // Mermaid re-run after DOM update
  useEffect(() => {
    if (mode === 'md' && mdContainerRef.current) {
      mermaid.initialize({
        startOnLoad: false,
        theme: theme === 'dark' ? 'dark' : 'default',
        securityLevel: 'loose',
      });

      const mermaidNodes = mdContainerRef.current.querySelectorAll('.mermaid');
      if (mermaidNodes.length > 0) {
        // Reset processed status
        mermaidNodes.forEach((node) => {
          node.removeAttribute('data-processed');
          const source = node.getAttribute('data-source');
          if (source) {
            node.textContent = source;
          }
        });

        mermaid.run({
          nodes: Array.from(mermaidNodes) as HTMLElement[],
        }).catch((err) => {
          console.warn('Mermaid rendering skipped or failed:', err);
        });
      }

      // Attach copy buttons to pre code blocks
      const preBlocks = mdContainerRef.current.querySelectorAll('pre');
      preBlocks.forEach((pre) => {
        if (pre.querySelector('.code-copy-btn')) return;
        pre.style.position = 'relative';

        const btn = document.createElement('button');
        btn.className =
          'code-copy-btn absolute top-2 right-2 px-2 py-1 text-[11px] font-sans font-medium rounded bg-black/10 hover:bg-black/20 dark:bg-white/10 dark:hover:bg-white/20 text-gray-700 dark:text-gray-300 transition-all opacity-0 group-hover:opacity-100 flex items-center gap-1';
        btn.innerHTML = '<span>复制</span>';
        pre.classList.add('group');

        btn.onclick = () => {
          const code = pre.querySelector('code')?.innerText || pre.innerText;
          navigator.clipboard.writeText(code).then(() => {
            btn.innerHTML = '<span class="text-emerald-500 font-bold">已复制!</span>';
            setTimeout(() => {
              btn.innerHTML = '<span>复制</span>';
            }, 2000);
          });
        };

        pre.appendChild(btn);
      });
    }
  }, [renderedHtml, mode, theme]);

  // H5 Device Viewport Sizing
  const getDeviceStyle = () => {
    switch (device) {
      case 'iphone':
        return {
          width: '393px',
          height: '840px',
          borderRadius: '44px',
          border: '12px solid #2d2d30',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4)',
        };
      case 'ipad':
        return {
          width: '768px',
          height: '920px',
          borderRadius: '28px',
          border: '12px solid #2d2d30',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.4)',
        };
      case 'mac':
      case 'responsive':
      default:
        return {
          width: '100%',
          height: '100%',
          borderRadius: '0px',
          border: 'none',
        };
    }
  };

  // Open H5 in new window
  const openInNewTab = () => {
    const win = window.open('', '_blank');
    if (win) {
      win.document.open();
      win.document.write(content);
      win.document.close();
    }
  };

  return (
    <div
      ref={previewRef}
      className="w-full h-full flex flex-col bg-[#fafafc] dark:bg-[#18181a] relative overflow-hidden text-gray-900 dark:text-gray-100"
    >
      {/* H5 Mode Device Switcher Bar */}
      {mode === 'h5' && (
        <div className="h-10 px-4 bg-white/70 dark:bg-[#202022]/70 backdrop-blur-md border-b border-black/[0.06] dark:border-white/[0.08] flex items-center justify-between z-10 select-none">
          <div className="flex items-center space-x-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium mr-1">设备视口:</span>
            <button
              onClick={() => setDevice('responsive')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs transition-colors ${
                device === 'responsive'
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10'
              }`}
              title="自适应全屏"
            >
              <Monitor size={13} />
              <span>自适应</span>
            </button>
            <button
              onClick={() => setDevice('iphone')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs transition-colors ${
                device === 'iphone'
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10'
              }`}
              title="iPhone 15 尺寸 (393 x 852)"
            >
              <Smartphone size={13} />
              <span>iPhone 手机</span>
            </button>
            <button
              onClick={() => setDevice('ipad')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs transition-colors ${
                device === 'ipad'
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-black/5 dark:hover:bg-white/10'
              }`}
              title="iPad 平板尺寸"
            >
              <Tablet size={13} />
              <span>iPad 平板</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIframeKey((k) => k + 1)}
              className="p-1 rounded text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10"
              title="强制刷新渲染沙箱"
            >
              <RefreshCw size={14} />
            </button>
            <button
              onClick={openInNewTab}
              className="flex items-center space-x-1 px-2 py-1 rounded text-xs bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 text-gray-700 dark:text-gray-300"
              title="在新浏览器标签中全屏打开"
            >
              <ExternalLink size={12} />
              <span>新标签</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto mac-scrollbar relative flex items-center justify-center p-0">
        {mode === 'md' && (
          <div
            ref={mdContainerRef}
            className="w-full h-full overflow-y-auto mac-scrollbar px-6 sm:px-12 py-8 max-w-4xl mx-auto"
          >
            <div
              className="easymd-preview"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          </div>
        )}

        {mode === 'h5' && (
          <div
            className={`w-full h-full flex items-center justify-center overflow-auto mac-scrollbar ${
              device !== 'responsive' ? 'p-8 bg-[#e9e9eb] dark:bg-[#121213]' : ''
            }`}
          >
            <div
              style={getDeviceStyle()}
              className="relative overflow-hidden transition-all duration-300 flex flex-col bg-white"
            >
              {/* iPhone Notch Decoration if mobile */}
              {device === 'iphone' && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-28 h-6 bg-black rounded-full z-20 pointer-events-none flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-[#1a1a1c] mr-3" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#0d2a45]" />
                </div>
              )}

              <iframe
                key={iframeKey}
                title="H5 Live Preview"
                srcDoc={safeIframeDoc}
                sandbox="allow-scripts allow-modals allow-forms"
                className="w-full h-full border-none"
              />

              {/* iPhone Home Indicator */}
              {device === 'iphone' && (
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-32 h-1 bg-black/40 rounded-full z-20 pointer-events-none" />
              )}
            </div>
          </div>
        )}

        {mode === 'txt' && (
          <div className="w-full h-full overflow-y-auto mac-scrollbar px-8 py-8 font-mono text-sm leading-relaxed max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-black/[0.08] dark:border-white/[0.1] text-xs text-gray-500">
              <span>纯文本预览 (只读视图)</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(content);
                  setCopiedCodeIndex(999);
                  setTimeout(() => setCopiedCodeIndex(null), 2000);
                }}
                className="flex items-center space-x-1 px-2.5 py-1 rounded bg-black/5 dark:bg-white/10 hover:bg-black/10 transition-colors"
              >
                {copiedCodeIndex === 999 ? (
                  <>
                    <Check size={12} className="text-emerald-500" />
                    <span>已复制</span>
                  </>
                ) : (
                  <>
                    <Copy size={12} />
                    <span>复制全部内容</span>
                  </>
                )}
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-gray-800 dark:text-gray-200 select-text">
              {content || '（暂无纯文本内容）'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
