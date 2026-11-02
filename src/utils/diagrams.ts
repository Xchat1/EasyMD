import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
import { assertOfflineDiagram, allowPreviewAttribute } from './previewPrivacy';

// Mermaid has global configuration and a temporary DOM. Serialize preview and
// export jobs so a theme switch cannot change another in-flight render.
let pending: Promise<unknown> = Promise.resolve();
let renderId = 0;
export function renderMermaidSvg(source: string, dark = false, allowNetwork = false, signal?: AbortSignal): Promise<string> {
  const job = pending.then(async () => {
    if (signal?.aborted) throw new DOMException('图表预览已取消', 'AbortError');
    if (!allowNetwork) assertOfflineDiagram(source);
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
      suppressErrorRendering: true,
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    });
    const result = await mermaid.render(`easymd-diagram-${++renderId}`, source);
    const purifier = DOMPurify(window);
    purifier.addHook('uponSanitizeAttribute', (node, data) => {
      if (!allowPreviewAttribute(node.tagName.toLowerCase(), data.attrName, data.attrValue, allowNetwork)) data.keepAttr = false;
    });
    return purifier.sanitize(result.svg, { USE_PROFILES: { html: true, svg: true, svgFilters: true }, ADD_TAGS: ['style', 'foreignObject'], HTML_INTEGRATION_POINTS: { foreignobject: true } });
  });
  pending = job.catch(() => undefined);
  return job;
}


/** Arrow syntax contains "-->"; DOMPurify's XML safety check intentionally
 * removes it from attribute values. Keep source URI-encoded, with text fallback
 * for imported/older markup, rather than weakening the sanitizer. */
export function readMermaidSource(node: HTMLElement): string {
  const source = node.getAttribute('data-source');
  if (source !== null) {
    if (node.getAttribute('data-source-encoding') === 'uri') {
      try { return decodeURIComponent(source); } catch { /* use visible source */ }
    } else {
      return source;
    }
  }
  return node.textContent || '';
}
