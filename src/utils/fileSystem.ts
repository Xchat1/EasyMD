/**
 * File system & export utility functions for macOS productivity
 */

// Download file via Blob
export function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Open local file (supports Mac File System Access API or input fallback)
export async function openLocalFile(): Promise<{ fileName: string; content: string } | null> {
  // 1. Try File System Access API if supported
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await (window as unknown as {
        showOpenFilePicker: (options: unknown) => Promise<FileSystemFileHandle[]>;
      }).showOpenFilePicker({
        types: [
          {
            description: 'Markdown / HTML / 纯文本文档',
            accept: {
              'text/markdown': ['.md', '.markdown'],
              'text/html': ['.html', '.htm'],
              'text/plain': ['.txt', '.log', '.json', '.js', '.ts', '.css'],
            },
          },
        ],
        multiple: false,
      });

      const file = await handle.getFile();
      const content = await file.text();
      return { fileName: file.name, content };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return null;
      }
      console.warn('File System Access API failed, falling back to input:', err);
    }
  }

  // 2. Fallback to standard input element
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.html,.htm,.txt,.log,.json,.js,.ts,.css';

    input.onchange = async () => {
      if (input.files && input.files.length > 0) {
        const file = input.files[0];
        const content = await file.text();
        resolve({ fileName: file.name, content });
      } else {
        resolve(null);
      }
    };

    input.oncancel = () => resolve(null);
    input.click();
  });
}

// Save with picker or direct download
export async function saveFileWithPicker(
  content: string,
  suggestedName: string,
  mimeType: string = 'text/plain'
): Promise<boolean> {
  if ('showSaveFilePicker' in window) {
    try {
      const extension = suggestedName.includes('.') ? suggestedName.split('.').pop() : 'txt';
      const handle = await (window as unknown as {
        showSaveFilePicker: (options: unknown) => Promise<FileSystemFileHandle>;
      }).showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: '文档文件',
            accept: {
              [mimeType]: [`.${extension}`],
            },
          },
        ],
      });

      const writable = await (handle as unknown as {
        createWritable: () => Promise<FileSystemWritableFileStream>;
      }).createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return false;
      }
      console.warn('showSaveFilePicker failed, falling back to download:', err);
    }
  }

  // Fallback
  downloadFile(content, suggestedName, mimeType);
  return true;
}

// Copy rich formatted HTML to clipboard for office suites (Feishu, WeChat, Mail, Word)
export async function copyRichTextToClipboard(htmlContent: string, plainText: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([plainText], { type: 'text/plain' });
      const item = new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob,
      });
      await navigator.clipboard.write([item]);
      return true;
    } else {
      // Fallback to text copy
      await navigator.clipboard.writeText(plainText);
      return true;
    }
  } catch (err) {
    console.error('Copy rich text error:', err);
    try {
      await navigator.clipboard.writeText(plainText);
      return true;
    } catch {
      return false;
    }
  }
}

// Generate standalone HTML file with embedded styling
export function generateStandaloneHtml(title: string, bodyContent: string, isH5Mode: boolean = false): string {
  if (isH5Mode) {
    // If it's already a full HTML document, return it directly
    if (bodyContent.trim().toLowerCase().startsWith('<!doctype html') || bodyContent.trim().toLowerCase().startsWith('<html')) {
      return bodyContent;
    }
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'EasyMD 导出文档'}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.21/dist/katex.min.css">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css">
  <style>
    :root {
      --font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, sans-serif;
    }
    body {
      font-family: var(--font-family);
      line-height: 1.68;
      color: #1d1d1f;
      background: #ffffff;
      max-width: 860px;
      margin: 0 auto;
      padding: 40px 24px;
      word-wrap: break-word;
    }
    h1, h2, h3, h4, h5, h6 {
      color: #111827;
      margin-top: 1.5em;
      margin-bottom: 0.6em;
      font-weight: 700;
      line-height: 1.3;
    }
    h1 { font-size: 2.1em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
    h2 { font-size: 1.6em; border-bottom: 1px solid #f3f4f6; padding-bottom: 0.3em; }
    h3 { font-size: 1.3em; }
    p { margin: 0.9em 0; }
    a { color: #0071e3; text-decoration: none; }
    a:hover { text-decoration: underline; }
    blockquote {
      border-left: 4px solid #0071e3;
      padding: 8px 18px;
      margin: 1.2em 0;
      color: #4b5563;
      background: #f8fafc;
      border-radius: 0 8px 8px 0;
    }
    code:not([class*="language-"]) {
      background: #f3f4f6;
      color: #eb5757;
      padding: 0.2em 0.4em;
      border-radius: 4px;
      font-size: 88%;
      font-family: "SF Mono", Menlo, Monaco, Consolas, monospace;
    }
    pre {
      background: #f6f8fa;
      padding: 16px;
      border-radius: 10px;
      overflow-x: auto;
      border: 1px solid #e1e4e8;
      margin: 1.2em 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 1.2em 0;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 10px 14px;
      text-align: left;
    }
    th {
      background: #f9fafb;
      font-weight: 600;
    }
    img {
      max-width: 100%;
      border-radius: 8px;
    }
    ul, ol {
      padding-left: 28px;
      margin: 0.8em 0;
    }
    li {
      margin: 0.4em 0;
    }
    hr {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 2em 0;
    }
    .mermaid {
      text-align: center;
      margin: 1.5em 0;
    }
    @media print {
      body {
        padding: 0;
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}
