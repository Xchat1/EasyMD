import type { DocMode } from '../types';
import type { DesktopOpenedFile } from '../types/desktop';
import { escapeHtml } from './html';
import { renderMarkdown } from './markdown';
import { renderMermaidSvg, readMermaidSource } from './diagrams';
import { createPreviewDocument, createClipboardHtml } from './previewPrivacy';
import { MAX_DOCUMENT_BYTES, utf8ByteLength } from './documentLimits';

async function readDocumentFile(file: File): Promise<string> {
  if (file.size > MAX_DOCUMENT_BYTES) throw new RangeError('文稿超过 2 MiB，请缩小文件后再导入。');
  const content = await file.text();
  if (utf8ByteLength(content) > MAX_DOCUMENT_BYTES) throw new RangeError('文稿超过 2 MiB，请缩小文件后再导入。');
  return content;
}

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
export async function openLocalFile(): Promise<DesktopOpenedFile | null> {
  // Electron's File System Access permission context cannot use the browser
  // permission policy safely. Its fixed native picker reads only the chosen file.
  if (window.easymdDesktop) return window.easymdDesktop.openFile();
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
      const content = await readDocumentFile(file);
      return { fileName: file.name, content };
    } catch (err) {
      if (err instanceof RangeError) throw err;
      if ((err as Error).name === 'AbortError') {
        return null;
      }
      console.warn('File System Access API failed, falling back to input:', err);
    }
  }

  // 2. Fallback to standard input element
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.html,.htm,.txt,.log,.json,.js,.ts,.css';

    input.onchange = async () => {
      try {
        if (input.files && input.files.length > 0) {
          const file = input.files[0];
          const content = await readDocumentFile(file);
          resolve({ fileName: file.name, content });
        } else resolve(null);
      } catch (error) { reject(error); }
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
    }
    return false;
  } catch (err) {
    console.error('Copy rich text error:', err);
    return false;
  }
}

// Generate standalone HTML file with embedded styling
export function generateStandaloneHtml(title: string, bodyContent: string, isH5Mode: boolean = false, extraStyles = ''): string {
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
  <title>${escapeHtml(title || 'EasyMD 导出文档')}</title>
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
    .plain-text { white-space: pre-wrap; overflow-wrap: anywhere; }
    .mermaid svg { max-width: 100%; height: auto; }
    ${extraStyles}
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`;
}


/** Render the actual export body, including static diagrams rather than source. */
async function renderDocumentBody(content: string, mode: DocMode, allowNetwork = false): Promise<string> {
  if (mode === 'txt') return `<pre class="plain-text">${escapeHtml(content)}</pre>`;
  if (mode === 'h5') return content;
  const container = document.createElement('div');
  container.innerHTML = await renderMarkdown(content, allowNetwork);
  for (const node of container.querySelectorAll<HTMLElement>('.mermaid')) {
    const source = readMermaidSource(node);
    node.innerHTML = await renderMermaidSvg(source, false, allowNetwork);
    node.removeAttribute('data-source');
    node.removeAttribute('data-source-encoding');
  }
  return container.innerHTML;
}

/** Shared by the export modal, titlebar and keyboard shortcuts. */
export async function exportDocumentHtml(title: string, content: string, mode: DocMode, allowNetwork = false): Promise<string> {
  const body = await renderDocumentBody(content, mode, allowNetwork);
  const styles = mode === 'md' ? (await import('./exportStyles')).exportStyles : '';
  return generateStandaloneHtml(title, body, mode === 'h5', styles);
}

export async function copyDocumentRichText(content: string, mode: DocMode, allowNetwork = false): Promise<boolean> {
  const rendered = await renderDocumentBody(content, mode, allowNetwork);
  const body = mode === 'h5' ? createClipboardHtml(rendered, allowNetwork) : rendered;
  const styles = mode === 'md' ? (await import('./exportStyles')).exportStyles : '';
  const html = generateStandaloneHtml('', body, mode === 'h5', styles);
  return copyRichTextToClipboard(html, content);
}

/** Print in an opaque frame. Offline documents only run the owned bootstrap. */
export async function printDocument(title: string, content: string, mode: DocMode, allowNetwork = false, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException('此文稿的联网授权已撤销', 'AbortError');
  const html = await exportDocumentHtml(title, content, mode, allowNetwork);
  if (signal?.aborted) throw new DOMException('此文稿的联网授权已撤销', 'AbortError');
  const token = crypto.randomUUID();
  const parsed = new DOMParser().parseFromString(createPreviewDocument(html, allowNetwork, token), 'text/html');
  const printScript = parsed.createElement('script');
  printScript.setAttribute('nonce', token);
  printScript.textContent = `
    (() => {
      const token = ${JSON.stringify(token)};
      addEventListener('afterprint', () => parent.postMessage({ type: 'easymd-print-done', token }, '*'));
      const onPrintRequest = async (event) => {
        if (event.source !== parent || event.data?.type !== 'easymd-print' || event.data.token !== token) return;
        removeEventListener('message', onPrintRequest);
        await Promise.race([
          Promise.all([document.fonts.ready, ...Array.from(document.images).map(img => img.complete ? Promise.resolve() : new Promise(resolve => { img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', resolve, { once: true }); }))]),
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
        focus();
        print();
      };
      addEventListener('message', onPrintRequest);
    })();`;
  parsed.body.appendChild(printScript);
  const frame = document.createElement('iframe');
  frame.title = '打印文档';
  frame.setAttribute('sandbox', 'allow-scripts allow-modals');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1000px;height:800px;border:0';
  const cleanup = () => {
    signal?.removeEventListener('abort', cleanup);
    window.removeEventListener('message', onMessage);
    window.clearTimeout(timeout);
    frame.remove();
  };
  const onMessage = (event: MessageEvent) => {
    if (event.source === frame.contentWindow && event.data?.type === 'easymd-print-done' && event.data.token === token) cleanup();
  };
  window.addEventListener('message', onMessage);
  // Also reclaim a frame if the browser blocks printing or no afterprint fires.
  const timeout = window.setTimeout(cleanup, 10 * 60 * 1000);
  signal?.addEventListener('abort', cleanup, { once: true });
  frame.onload = () => frame.contentWindow?.postMessage({ type: 'easymd-print', token }, '*');
  frame.srcdoc = '<!DOCTYPE html>\n' + parsed.documentElement.outerHTML;
  document.body.appendChild(frame);
}
