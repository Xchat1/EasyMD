import { createPreviewDocument, previewSandbox } from './previewPrivacy';

/** HTML supplied by a document is always hosted in an opaque-origin frame. */
export function openSandboxedPreview(content: string, allowNetwork = false, signal?: AbortSignal): Window {
  if (signal?.aborted) throw new DOMException('此文稿的联网授权已撤销，请重新打开预览。', 'AbortError');
  const owner = window;
  const win = owner.open('', '_blank');
  if (!win) throw new Error('浏览器阻止了新窗口，请允许弹出窗口后重试。');
  let releaseListeners = () => {};
  const closePreview = () => {
    releaseListeners();
    if (!win.closed) win.close();
  };
  try {
    win.opener = null;
    // Opening a new browsing context can cross a lifecycle boundary. Do not
    // install document content if its authorization was revoked meanwhile.
    if (signal?.aborted) throw new DOMException('此文稿的联网授权已撤销，请重新打开预览。', 'AbortError');
    if (allowNetwork) {
      let released = false;
      releaseListeners = () => {
        if (released) return;
        released = true;
        signal?.removeEventListener('abort', closePreview);
        owner.removeEventListener('pagehide', closePreview);
        // A manually navigated popup may already have left our origin.
        try { win.removeEventListener('pagehide', releaseListeners); } catch { /* its owned page has gone */ }
      };
      signal?.addEventListener('abort', closePreview, { once: true });
      owner.addEventListener('pagehide', closePreview, { once: true });
      win.addEventListener('pagehide', releaseListeners, { once: true });
    }
    win.document.title = 'EasyMD 预览';
    win.document.body.style.cssText = 'margin:0;height:100vh;overflow:hidden';
    const frame = win.document.createElement('iframe');
    frame.title = 'H5 Preview';
    frame.setAttribute('sandbox', previewSandbox(allowNetwork));
    frame.referrerPolicy = 'no-referrer';
    frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
    frame.srcdoc = createPreviewDocument(content, allowNetwork);
    win.document.body.replaceChildren(frame);
    return win;
  } catch (error) {
    closePreview();
    throw error;
  }
}
