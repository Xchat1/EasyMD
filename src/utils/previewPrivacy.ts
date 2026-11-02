import DOMPurify from 'dompurify';
import { escapeHtml } from './html';

// Only embedded raster images are passive resources in the default preview.
// Blob URLs and SVG data URLs may contain document-controlled resources.
const EMBEDDED_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon);base64,[a-z\d+/=\s]+$/i;
const PASSIVE_ATTRIBUTES = new Set(['src', 'srcset', 'imagesrcset', 'poster', 'background', 'data', 'action', 'formaction']);
const CSS_ATTRIBUTES = new Set(['style', 'fill', 'stroke', 'filter', 'mask', 'clip-path', 'marker', 'marker-start', 'marker-mid', 'marker-end', 'cursor', 'color-profile']);

function hasExternalCssResource(value: string): boolean {
  // Reject CSS escapes rather than trying to decode a second CSS grammar. Keep
  // owned SVG references for diagram arrows and math glyphs, but no remote URL.
  if (value.includes('\\')) return true;
  const withoutComments = value.replace(/\/\*[\s\S]*?\*\//g, '');
  const withoutLocalReferences = withoutComments.replace(/url\(\s*(?:"#[\w:.-]+"|'#[\w:.-]+'|#[\w:.-]+)\s*\)/gi, '');
  if (/@import/i.test(withoutLocalReferences)) return true;
  // CSS image functions also load resources without url(), for example
  // image-set("https://..."). Only known color/geometry functions are allowed.
  const safeFunctions = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'lab', 'lch', 'oklab', 'oklch', 'calc', 'min', 'max', 'clamp', 'translate', 'translatex', 'translatey', 'translate3d', 'scale', 'scalex', 'scaley', 'rotate', 'matrix', 'matrix3d']);
  return [...withoutLocalReferences.matchAll(/([a-z-]+)\s*\(/gi)].some((match) => !safeFunctions.has(match[1].toLowerCase()));
}

export function isEmbeddedImage(value: string): boolean { return EMBEDDED_IMAGE.test(value); }

/** Runs in the sanitizer, before a fragment can initiate a resource request. */
export function allowPreviewAttribute(tag: string, name: string, value: string, allowNetwork: boolean, allowLinks = true): boolean {
  const attribute = name.toLowerCase();
  if (attribute === 'ping') return false;
  if (allowNetwork) return true;
  if (CSS_ATTRIBUTES.has(attribute) && hasExternalCssResource(value)) return false;
  if (PASSIVE_ATTRIBUTES.has(attribute)) return attribute === 'src' && tag === 'img' && isEmbeddedImage(value);
  if (attribute === 'href' || attribute === 'xlink:href') {
    return value.startsWith('#') || (allowLinks && tag === 'a' && /^(?:https?:|mailto:)/i.test(value));
  }
  return true;
}

const OFFLINE_TAGS = ['script', 'iframe', 'object', 'embed', 'meta', 'base', 'link', 'form', 'audio', 'video', 'source', 'track'];

/** Sanitize H5 while it is still inert; CSS is confined by the frame's CSP. */
function offlineHtml(content: string, keepStyles: boolean): string {
  const purifier = DOMPurify(window);
  purifier.addHook('uponSanitizeAttribute', (node, data) => {
    if (!allowPreviewAttribute(node.tagName.toLowerCase(), data.attrName, data.attrValue, false, false)
      || (!keepStyles && data.attrName === 'style')) data.keepAttr = false;
  });
  return purifier.sanitize(content, {
    WHOLE_DOCUMENT: keepStyles,
    ADD_TAGS: keepStyles ? ['style'] : [],
    FORBID_TAGS: keepStyles ? OFFLINE_TAGS : [...OFFLINE_TAGS, 'style'],
  });
}

export function previewSandbox(allowNetwork = false): string {
  return allowNetwork ? 'allow-scripts allow-modals allow-forms' : '';
}

/** Network permission is deliberately temporary and is never embedded in a draft. */
export function createPreviewDocument(content: string, allowNetwork = false, printNonce?: string): string {
  const scriptPolicy = printNonce ? `'nonce-${printNonce}'` : "'none'";
  const policy = allowNetwork
    ? "base-uri 'none'; object-src 'none'"
    : `default-src 'none'; script-src ${scriptPolicy}; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'`;
  // The owned CSP comes before all document markup. An authored CSP can only
  // further restrict it, never weaken it. No document script runs offline.
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${allowNetwork ? content : offlineHtml(content, true)}</body></html>`;
}

/** Clipboard targets need not honor CSP, so remove H5 CSS as well when offline. */
export function createClipboardHtml(content: string, allowNetwork = false): string {
  return allowNetwork ? content : offlineHtml(content, false);
}

/** Mermaid creates an Image before returning SVG. Reject resource-bearing
 * extensions and configuration before invoking it, rather than filtering late. */
export function assertOfflineDiagram(source: string): void {
  const firstStatement = source.split(/\r?\n/).map((line) => line.trim()).find((line) => line && !line.startsWith('%%')) || '';
  const supported = /^(?:flowchart|graph|sequenceDiagram|classDiagram|erDiagram)\b/.test(firstStatement);
  if (!supported || /@\s*\{|%%\s*\{|^\s*---(?:\r?\n)|(?:^|[;\r\n])\s*(?:style|classDef|linkStyle|properties|details)\b|<\s*\/?\s*[a-z][^>]*>|&(?:lt|gt|#(?:x[\da-f]+|\d+));|!\[|\\|\burl\s*\(/i.test(source)) {
    throw new Error('离线模式支持普通流程图、时序图、类图与 ER 图。此图表使用了扩展语法；仅在信任文稿并允许联网后预览。');
  }
}
