import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { indentUnit } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { DocMode, EditorSettings, ThemeMode } from '../types';
import { escapeHtml } from '../utils/html';
import { MAX_DOCUMENT_BYTES, utf8ByteLength } from '../utils/documentLimits';

interface EditorAreaProps {
  content: string;
  onChange: (val: string) => void;
  mode: DocMode;
  theme: ThemeMode;
  settings: EditorSettings;
  editorRef: React.RefObject<ReactCodeMirrorRef | null>;
  onCursorChange?: (line: number, col: number) => void;
  readOnly?: boolean;
}

export const EditorArea: React.FC<EditorAreaProps> = ({
  content,
  onChange,
  mode,
  theme,
  settings,
  editorRef,
  onCursorChange,
  readOnly = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pendingReaders = useRef(new Set<FileReader>());
  const readOnlyRef = useRef(readOnly);
  const modeRef = useRef(mode);
  const [importNotice, setImportNotice] = useState('');
  readOnlyRef.current = readOnly;
  modeRef.current = mode;
  useEffect(() => () => {
    for (const reader of pendingReaders.current) reader.abort();
    pendingReaders.current.clear();
  }, []);

  // Compute language extension based on current document mode
  const extensions = useMemo(() => {
    const list = [];
    if (mode === 'md') {
      list.push(markdown());
    } else if (mode === 'h5') {
      list.push(html());
    }

    if (settings.wordWrap) {
      list.push(EditorView.lineWrapping);
    }

    list.push(indentUnit.of(' '.repeat(settings.tabSize || 2)));

    // Custom Mac editor font styling & padding
    list.push(
      EditorView.theme({
        '&': {
          fontSize: `${settings.fontSize}px`,
          height: '100%',
          fontFamily:
            mode === 'txt'
              ? '"SF Mono", Menlo, Monaco, Consolas, monospace'
              : '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Mono", Menlo, monospace',
        },
        '.cm-scroller': {
          overflow: 'auto',
          lineHeight: '1.65',
          padding: '16px 12px',
        },
        '.cm-gutters': {
          backgroundColor: 'transparent',
          borderRight: '1px solid rgba(128, 128, 128, 0.15)',
          color: 'rgba(128, 128, 128, 0.6)',
          paddingRight: '6px',
        },
        '.cm-content': {
          caretColor: '#0071e3',
        },
        '&.cm-focused .cm-cursor': {
          borderLeftColor: '#0071e3',
          borderLeftWidth: '2px',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
          backgroundColor: 'rgba(0, 113, 227, 0.2) !important',
        },
      })
    );

    return list;
  }, [mode, settings.wordWrap, settings.fontSize, settings.tabSize]);

  // Keep asynchronous reads attached to the editor that initiated them. A shared
  // ref may already point at another document when FileReader completes.
  const readIntoEditor = useCallback((file: File, placement: 'end' | 'cursor') => {
    const targetView = editorRef.current?.view;
    if (!targetView || readOnlyRef.current) return;
    if (!file.type.startsWith('image/')) {
      setImportNotice('请使用“打开文件”导入文稿，当前内容已保留。');
      return;
    }
    if (mode === 'txt') {
      setImportNotice('纯文本不支持插入图片，请切换到 Markdown 或 HTML 文稿。');
      return;
    }
    const imageMarkup = (url: string) => {
      const label = file.name.replace(/[\[\]\\]/g, '\\$&');
      return mode === 'h5'
        ? `<img src="${url}" alt="${escapeHtml(file.name)}" style="max-width:100%" />`
        : `![${label}](${url})`;
    };
    const prefixBytes = utf8ByteLength(imageMarkup(`data:${file.type};base64,`));
    const currentBytes = utf8ByteLength(targetView.state.doc.toString());
    const separatorBytes = placement === 'end' && targetView.state.doc.length ? 2 : 0;
    // Base64 expands binary images. Check before allocating the entire data URL.
    if (currentBytes + prefixBytes + 4 * Math.ceil(file.size / 3) + separatorBytes > MAX_DOCUMENT_BYTES) {
      setImportNotice('插入图片后文稿将超过 2 MiB，请压缩图片后重试。');
      return;
    }
    setImportNotice('');
    const reader = new FileReader();
    pendingReaders.current.add(reader);
    reader.onloadend = () => pendingReaders.current.delete(reader);
    reader.onerror = () => setImportNotice('图片读取失败，请重试。');
    reader.onload = () => {
      if (!pendingReaders.current.has(reader) || readOnlyRef.current || modeRef.current !== mode
        || editorRef.current?.view !== targetView || typeof reader.result !== 'string') return;
      const markup = imageMarkup(reader.result);
      const from = placement === 'end' ? targetView.state.doc.length : targetView.state.selection.main.head;
      const insert = placement === 'end' && from ? `\n\n${markup}` : markup;
      // Recheck the latest text: typing and other image reads may have finished.
      if (utf8ByteLength(targetView.state.doc.toString()) + utf8ByteLength(insert) > MAX_DOCUMENT_BYTES) {
        setImportNotice('插入图片后文稿将超过 2 MiB，当前内容已保留，请压缩图片后重试。');
        return;
      }
      targetView.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length } });
    };
    try { reader.readAsDataURL(file); }
    catch {
      pendingReaders.current.delete(reader);
      setImportNotice('图片读取失败，请重试。');
    }
  }, [editorRef, mode]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    const file = event.dataTransfer.files[0];
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    readIntoEditor(file, 'end');
  }, [readIntoEditor]);

  const handlePaste = useCallback((event: React.ClipboardEvent) => {
    if (readOnlyRef.current) return;
    for (const item of Array.from(event.clipboardData.items)) {
      if (!item.type.startsWith('image/')) continue;
      event.preventDefault();
      event.stopPropagation();
      const file = item.getAsFile();
      if (file) readIntoEditor(file, 'cursor');
      break;
    }
  }, [readIntoEditor]);

  return (
    <div
      ref={containerRef}
      onDropCapture={handleDrop}
      onDragOverCapture={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault();
      }}
      onPasteCapture={handlePaste}
      className="w-full h-full relative overflow-hidden bg-white dark:bg-[#1e1e20] text-gray-900 dark:text-gray-100"
    >
      <CodeMirror
        ref={editorRef}
        value={content}
        readOnly={readOnly}
        editable={!readOnly}
        height="100%"
        theme={theme === 'dark' ? oneDark : 'light'}
        extensions={extensions}
        basicSetup={{
          lineNumbers: settings.lineNumbers,
          foldGutter: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          tabSize: settings.tabSize,
          autocompletion: true,
          bracketMatching: true,
          closeBrackets: true,
          history: true,
          searchKeymap: true,
        }}
        onChange={onChange}
        onUpdate={(viewUpdate) => {
          if (onCursorChange && viewUpdate.selectionSet) {
            const pos = viewUpdate.state.selection.main.head;
            const line = viewUpdate.state.doc.lineAt(pos);
            onCursorChange(line.number, pos - line.from + 1);
          }
        }}
        className="h-full w-full font-mono text-sm"
      />
      {importNotice && (
        <div role="status" className="absolute bottom-3 left-3 right-3 z-10 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
          {importNotice}
        </div>
      )}
    </div>
  );
};
