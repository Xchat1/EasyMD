import { Marked, type Token, type Tokens, type TokenizerAndRendererExtension } from 'marked';
import hljs from 'highlight.js';
import katex from 'katex';
import DOMPurify from 'dompurify';
import { DocStats, TocItem } from '../types';
import { escapeHtml } from './html';
import { allowPreviewAttribute } from './previewPrivacy';

// Extensions consume Markdown tokens, so fenced/inline code, HTML attributes,
// link destinations and escaped dollars are never rewritten as math.
const GENERATED_ATTRIBUTE = 'data-easymd-generated';

// Only compiler-owned markup may carry CSS classes/styles or application-wide
// IDs. A fresh unguessable marker distinguishes it from raw document HTML.
function markGenerated(html: string, token?: string): string {
  if (!token) return html;
  return html.replace(/<([a-z][a-z0-9:-]*)(?=[\s/>])/gi, `<$1 ${GENERATED_ATTRIBUTE}="${token}"`);
}

function mathExtensions(token?: string): TokenizerAndRendererExtension[] { return [
  {
    name: 'blockMath', level: 'block',
    start: (source) => source.match(/^ {0,3}\$\$/m)?.index,
    tokenizer(source) {
      const match = /^ {0,3}\$\$([^\n]*?)\$\$[ \t]*(?:\n|$)/.exec(source)
        || /^ {0,3}\$\$[ \t]*\n([\s\S]+?)\n {0,3}\$\$[ \t]*(?:\n|$)/.exec(source);
      if (match) return { type: 'blockMath', raw: match[0], text: match[1].trim() };
    },
    renderer(math) {
      return markGenerated(`<div class="katex-display-wrapper">${katex.renderToString(math.text, { displayMode: true, throwOnError: false })}</div>\n`, token);
    },
  },
  {
    name: 'inlineMath', level: 'inline',
    start: (source) => source.indexOf('$'),
    tokenizer(source) {
      if (this.lexer.state.inRawBlock || source[0] !== '$' || source[1] === '$' || /\s/.test(source[1] || ' ')) return;
      const match = /^\$((?:\\[^\n]|[^$\n\\])+?)\$(?![\d$])/.exec(source);
      if (match && !/\s$/.test(match[1])) return { type: 'inlineMath', raw: match[0], text: match[1] };
    },
    renderer(math) {
      return markGenerated(katex.renderToString(math.text, { displayMode: false, throwOnError: false }), token);
    },
  },
]; }

function decodeEntities(text: string): string {
  // This also works during server-side tests. In the browser, decode all HTML
  // named entities with an inert textarea (never insert heading markup).
  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text.replace(/</g, '&lt;');
    return textarea.value;
  }
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '\ufffd';
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[entity.toLowerCase()] || match;
  });
}

function headingText(tokens: Token[]): string {
  return tokens.map((token) => {
    if (token.type === 'html') return '';
    if ('tokens' in token && token.tokens) return headingText(token.tokens);
    return 'text' in token ? decodeEntities(String(token.text)) : token.raw;
  }).join('').trim();
}

function headingAllocator() {
  const used = new Set<string>();
  return (tokens: Token[], level: number): TocItem => {
    const text = headingText(tokens);
    const base = text.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'heading';
    let id = base;
    let suffix = 1;
    while (used.has(id)) id = `${base}-${suffix++}`;
    used.add(id);
    return { id, text, level };
  };
}

function createMarkdownParser(styleToken?: string): Marked {
  const allocateHeading = headingAllocator();
  return new Marked({
    gfm: true,
    breaks: true,
    extensions: mathExtensions(styleToken),
    renderer: {
      heading({ tokens, depth }) {
        const heading = allocateHeading(tokens, depth);
        return `${markGenerated(`<h${depth} id="${escapeHtml(heading.id)}">`, styleToken)}${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      checkbox({ checked }) {
        return markGenerated(`<input type="checkbox" disabled${checked ? ' checked' : ''}>`, styleToken);
      },
      code({ text, lang }) {
        const language = (lang || '').trim().split(/\s+/)[0].toLowerCase();
        if (language === 'mermaid') {
          return markGenerated(`<div class="mermaid-container"><div class="mermaid" data-source="${escapeHtml(encodeURIComponent(text))}" data-source-encoding="uri">${escapeHtml(text)}</div></div>\n`, styleToken);
        }
        const knownLanguage = hljs.getLanguage(language) ? language : 'plaintext';
        const highlighted = hljs.highlight(text, { language: knownLanguage }).value;
        return markGenerated(`<pre><code class="hljs language-${escapeHtml(knownLanguage)}">${highlighted}</code></pre>\n`, styleToken);
      },
    },
  });
}

/** Unsanitized compiler output. Call renderMarkdown before inserting into DOM. */
export function compileMarkdown(content: string): string {
  return createMarkdownParser().parse(content, { async: false });
}

export async function renderMarkdown(content: string, allowNetwork = false): Promise<string> {
  if (!content) return '';
  const styleToken = crypto.randomUUID();
  const purifier = DOMPurify(window);
  purifier.addHook('uponSanitizeElement', (node) => {
    if (node.nodeType === 1 && (node as Element).tagName.toLowerCase() === 'input'
      && (node as Element).getAttribute(GENERATED_ATTRIBUTE) !== styleToken) node.parentNode?.removeChild(node);
  });
  purifier.addHook('uponSanitizeAttribute', (node, data) => {
    if (!allowPreviewAttribute(node.tagName.toLowerCase(), data.attrName, data.attrValue, allowNetwork)) data.keepAttr = false;
    if (['style', 'class', 'id', 'name'].includes(data.attrName)
      && node.getAttribute(GENERATED_ATTRIBUTE) !== styleToken) data.keepAttr = false;
  });
  const fragment = purifier.sanitize(createMarkdownParser(styleToken).parse(content, { async: false }), {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    ADD_TAGS: ['annotation'],
    ADD_ATTR: ['aria-hidden', 'data-source', 'xmlns', 'target', GENERATED_ATTRIBUTE],
    FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select', 'option', 'fieldset', 'object', 'embed', 'iframe', 'link', 'meta', 'base', 'audio', 'video', 'source', 'track'],
    RETURN_DOM_FRAGMENT: true,
  });
  for (const node of fragment.querySelectorAll(`[${GENERATED_ATTRIBUTE}]`)) node.removeAttribute(GENERATED_ATTRIBUTE);
  for (const anchor of fragment.querySelectorAll('a')) {
    const href = anchor.getAttribute('href') || anchor.getAttribute('xlink:href') || '';
    if (href.startsWith('#')) anchor.removeAttribute('target');
    else anchor.setAttribute('target', '_blank');
    anchor.setAttribute('rel', 'noopener noreferrer');
    anchor.setAttribute('referrerpolicy', 'no-referrer');
  }
  for (const image of fragment.querySelectorAll('img')) image.setAttribute('referrerpolicy', 'no-referrer');
  const container = document.createElement('div');
  container.append(fragment);
  return container.innerHTML;
}

/** Use the same lexer, heading text and collision handling as the renderer. */
export function extractToc(markdown: string): TocItem[] {
  const parser = createMarkdownParser();
  const tokens = parser.lexer(markdown);
  const allocateHeading = headingAllocator();
  const toc: TocItem[] = [];
  parser.walkTokens(tokens, (token) => {
    if (token.type === 'heading') {
      const heading = token as Tokens.Heading;
      toc.push(allocateHeading(heading.tokens, heading.depth));
    }
  });
  return toc;
}

/** Count CJK characters and Latin word groups consistently with the status bar. */
export function calculateDocStats(text: string): DocStats {
  if (!text) return { characters: 0, charactersNoSpaces: 0, words: 0, lines: 1, readTimeMinutes: 0 };
  const words = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    + (text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[a-zA-Z0-9_\-]+/g) || []).length;
  return {
    characters: text.length,
    charactersNoSpaces: text.replace(/\s+/g, '').length,
    words,
    lines: text.split('\n').length,
    readTimeMinutes: words === 0 ? 0 : Math.max(1, Math.ceil(words / 300)),
  };
}
