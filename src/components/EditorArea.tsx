import React, { useCallback, useMemo, useRef } from 'react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { indentUnit } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { DocMode, EditorSettings, ThemeMode } from '../types';

interface EditorAreaProps {
  content: string;
  onChange: (val: string) => void;
  mode: DocMode;
  theme: ThemeMode;
  settings: EditorSettings;
  editorRef: React.RefObject<ReactCodeMirrorRef | null>;
  onCursorChange?: (line: number, col: number) => void;
}

export const EditorArea: React.FC<EditorAreaProps> = ({
  content,
  onChange,
  mode,
  theme,
  settings,
  editorRef,
  onCursorChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

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
  }, [mode, settings.wordWrap, settings.fontSize]);

  // Handle Drag & Drop of files or images
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target?.result as string;
          const imgTag =
            mode === 'h5'
              ? `<img src="${base64}" alt="${file.name}" style="max-width: 100%; border-radius: 8px;" />`
              : `![${file.name}](${base64})`;

          // Append to content
          onChange(content ? `${content}\n\n${imgTag}` : imgTag);
        };
        reader.readAsDataURL(file);
      } else {
        // Read text file
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result as string;
          if (text) onChange(text);
        };
        reader.readAsText(file);
      }
    },
    [content, mode, onChange]
  );

  // Handle Paste event for images
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault();
          const file = items[i].getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            const imgTag =
              mode === 'h5'
                ? `<img src="${base64}" alt="pasted-image" style="max-width: 100%; border-radius: 8px;" />`
                : `![pasted-image](${base64})`;

            const view = editorRef.current?.view;
            if (view) {
              const cursorPos = view.state.selection.main.head;
              view.dispatch({
                changes: { from: cursorPos, insert: imgTag },
                selection: { anchor: cursorPos + imgTag.length },
              });
            } else {
              onChange(content ? `${content}\n${imgTag}` : imgTag);
            }
          };
          reader.readAsDataURL(file);
          break;
        }
      }
    },
    [content, editorRef, mode, onChange]
  );

  return (
    <div
      ref={containerRef}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onPaste={handlePaste}
      className="w-full h-full relative overflow-hidden bg-white dark:bg-[#1e1e20] text-gray-900 dark:text-gray-100"
    >
      <CodeMirror
        ref={editorRef}
        value={content}
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
    </div>
  );
};
