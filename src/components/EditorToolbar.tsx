import React from 'react';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code,
  SquareCode,
  Link2,
  Image,
  Table,
  CheckSquare,
  Sigma,
  GitGraph,
  Minus,
  Calendar,
  Sparkles,
} from 'lucide-react';
import { DocMode } from '../types';

interface EditorToolbarProps {
  mode: DocMode;
  onInsertText: (before: string, after?: string, defaultText?: string) => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({ mode, onInsertText }) => {
  return (
    <div className="h-9 px-3 bg-[#fdfdfd]/80 dark:bg-[#1c1c1e]/80 border-b border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between overflow-x-auto no-scrollbar select-none text-gray-700 dark:text-gray-300">
      <div className="flex items-center space-x-1">
        {mode === 'md' && (
          <>
            {/* Text Formats */}
            <button
              onClick={() => onInsertText('**', '**', '加粗文本')}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
              title="加粗 (⌘+B)"
            >
              <Bold size={14} />
            </button>
            <button
              onClick={() => onInsertText('*', '*', '斜体文本')}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
              title="斜体 (⌘+I)"
            >
              <Italic size={14} />
            </button>
            <button
              onClick={() => onInsertText('~~', '~~', '删除线文本')}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
              title="删除线"
            >
              <Strikethrough size={14} />
            </button>

            <div className="w-[1px] h-4 bg-black/10 dark:bg-white/15 mx-1" />

            {/* Headings */}
            <button
              onClick={() => onInsertText('# ', '', '一级标题')}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
              title="一级标题 (H1)"
            >
              <Heading1 size={14} />
            </button>
            <button
              onClick={() => onInsertText('## ', '', '二级标题')}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
              title="二级标题 (H2)"
            >
              <Heading2 size={14} />
            </button>
            <button
              onClick={() => onInsertText('### ', '', '三级标题')}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
              title="三级标题 (H3)"
            >
              <Heading3 size={14} />
            </button>

            <div className="w-[1px] h-4 bg-black/10 dark:bg-white/15 mx-1" />

            {/* Quotes, Codes */}
            <button
              onClick={() => onInsertText('> ', '', '引用内容')}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
              title="引用块"
            >
              <Quote size={14} />
            </button>
            <button
              onClick={() => onInsertText('`', '`', 'code')}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
              title="行内代码"
            >
              <Code size={14} />
            </button>
            <button
              onClick={() => onInsertText('```javascript\n', '\n```', 'console.log("Hello, EasyMD!");')}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
              title="代码块"
            >
              <SquareCode size={14} />
            </button>

            <div className="w-[1px] h-4 bg-black/10 dark:bg-white/15 mx-1" />

            {/* Links & Images */}
            <button
              onClick={() => onInsertText('[', '](https://)', '链接说明')}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
              title="超链接 (⌘+K)"
            >
              <Link2 size={14} />
            </button>
            <button
              onClick={() => onInsertText('![', '](https://images.unsplash.com/photo-1517842645767-c639042777db?w=600)', '图片描述')}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
              title="图片链接"
            >
              <Image size={14} />
            </button>
            <button
              onClick={() =>
                onInsertText(
                  '\n| 列标题 1 | 列标题 2 | 列标题 3 |\n| :--- | :---: | ---: |\n| 文本左对齐 | 居中数据 | 靠右数值 |\n| 条目 A | 88% | 1,280 |\n'
                )
              }
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
              title="插入表格"
            >
              <Table size={14} />
            </button>
            <button
              onClick={() => onInsertText('- [ ] ', '', '待办事项')}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
              title="任务待办列表"
            >
              <CheckSquare size={14} />
            </button>

            <div className="w-[1px] h-4 bg-black/10 dark:bg-white/15 mx-1" />

            {/* KaTeX & Mermaid */}
            <button
              onClick={() => onInsertText('$$\n', '\n$$', 'E = mc^2')}
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-xs hover:bg-black/5 dark:hover:bg-white/10 text-indigo-600 dark:text-indigo-400 font-medium"
              title="插入 LaTeX 数学公式"
            >
              <Sigma size={13} />
              <span>公式</span>
            </button>

            <button
              onClick={() =>
                onInsertText(
                  '```mermaid\nflowchart TD\n    A[开始] --> B{判断分支}\n    B -->|是| C[执行流程]\n    B -->|否| D[结束]\n',
                  '```\n'
                )
              }
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded text-xs hover:bg-black/5 dark:hover:bg-white/10 text-emerald-600 dark:text-emerald-400 font-medium"
              title="插入 Mermaid 流程图"
            >
              <GitGraph size={13} />
              <span>图表</span>
            </button>

            <button
              onClick={() => onInsertText('\n---\n')}
              className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300"
              title="分割线"
            >
              <Minus size={14} />
            </button>
          </>
        )}

        {mode === 'h5' && (
          <>
            <button
              onClick={() =>
                onInsertText(
                  '<div class="card" style="padding: 20px; background: #fff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); margin: 16px 0;">\n  <h3>卡片标题</h3>\n  <p>内容说明...</p>\n</div>\n'
                )
              }
              className="flex items-center space-x-1 px-2 py-0.5 rounded text-xs bg-black/5 dark:bg-white/10 hover:bg-black/10 text-gray-800 dark:text-gray-200"
            >
              <span>+ 样式卡片</span>
            </button>
            <button
              onClick={() =>
                onInsertText(
                  '<button style="background: #0071e3; color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">操作按钮</button>'
                )
              }
              className="flex items-center space-x-1 px-2 py-0.5 rounded text-xs bg-black/5 dark:bg-white/10 hover:bg-black/10 text-gray-800 dark:text-gray-200"
            >
              <span>+ 现代按钮</span>
            </button>
            <button
              onClick={() =>
                onInsertText(
                  '<style>\n  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }\n  .animated-box { animation: fadeIn 0.4s ease-out; }\n</style>\n'
                )
              }
              className="flex items-center space-x-1 px-2 py-0.5 rounded text-xs bg-black/5 dark:bg-white/10 hover:bg-black/10 text-gray-800 dark:text-gray-200"
            >
              <span>+ CSS 动画</span>
            </button>
          </>
        )}

        {mode === 'txt' && (
          <>
            <button
              onClick={() => {
                const now = new Date();
                const str = `[${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
                  now.getDate()
                ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
                  now.getMinutes()
                ).padStart(2, '0')}] `;
                onInsertText(str);
              }}
              className="flex items-center space-x-1 px-2 py-0.5 rounded text-xs bg-black/5 dark:bg-white/10 hover:bg-black/10 text-gray-800 dark:text-gray-200"
              title="插入当前时间戳"
            >
              <Calendar size={13} />
              <span>插入时间戳</span>
            </button>
            <button
              onClick={() => onInsertText('\n' + '='.repeat(60) + '\n')}
              className="flex items-center space-x-1 px-2 py-0.5 rounded text-xs bg-black/5 dark:bg-white/10 hover:bg-black/10 text-gray-800 dark:text-gray-200"
              title="插入长文本分隔线"
            >
              <Minus size={13} />
              <span>纯文本长分界线</span>
            </button>
          </>
        )}
      </div>

      <div className="flex items-center space-x-2 text-[11px] text-gray-400">
        <span className="hidden md:inline-flex items-center space-x-1">
          <Sparkles size={12} className="text-amber-500" />
          <span>支持直接拖拽 / 粘贴图片至编辑器</span>
        </span>
      </div>
    </div>
  );
};
