import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import katex from 'katex';
import DOMPurify from 'dompurify';
import { DocStats, TocItem } from '../types';

// Custom Marked instance with Highlight.js
const markedInstance = new Marked(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  })
);

// Add custom heading renderer to attach anchor IDs for TOC jump
markedInstance.use({
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const cleanText = text.replace(/<[^>]+>/g, '').trim();
      const id = cleanText
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '') || `heading-${depth}`;
      return `<h${depth} id="${id}">${text}</h${depth}>`;
    },
  },
});

// Configure marked options
markedInstance.setOptions({
  gfm: true,
  breaks: true,
});

/**
 * Pre-process LaTeX math expressions before passing to Marked
 * to prevent Markdown parser from mangling underscores, asterisks, etc.
 */
function processMath(text: string): { text: string; mathMap: Map<string, string> } {
  const mathMap = new Map<string, string>();
  let placeholderIndex = 0;

  // 1. Block math: $$ ... $$
  let processed = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
    const key = `%%MATH_BLOCK_${placeholderIndex++}%%`;
    try {
      const rendered = katex.renderToString(math.trim(), {
        displayMode: true,
        throwOnError: false,
      });
      mathMap.set(key, `<div class="katex-display-wrapper my-4 overflow-x-auto text-center py-2">${rendered}</div>`);
    } catch (e) {
      mathMap.set(key, `<pre class="text-red-500 bg-red-50 dark:bg-red-950/30 p-2 rounded">LaTeX Error: ${(e as Error).message}</pre>`);
    }
    return key;
  });

  // 2. Inline math: $ ... $ (ensuring not matched with currency or double dollar)
  processed = processed.replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_, math) => {
    const key = `%%MATH_INLINE_${placeholderIndex++}%%`;
    try {
      const rendered = katex.renderToString(math.trim(), {
        displayMode: false,
        throwOnError: false,
      });
      mathMap.set(key, `<span class="katex-inline-wrapper px-1">${rendered}</span>`);
    } catch {
      mathMap.set(key, `$${math}$`);
    }
    return key;
  });

  return { text: processed, mathMap };
}

/**
 * Render Markdown content to safe HTML with Code highlight, KaTeX, and Mermaid support
 */
export async function renderMarkdown(content: string): Promise<string> {
  if (!content) return '';

  // 1. Extract & protect math formulas
  const { text: textWithMathKeys, mathMap } = processMath(content);

  // 2. Process custom Mermaid blocks: ```mermaid ... ```
  const textWithMermaid = textWithMathKeys.replace(
    /```mermaid[\s\r\n]*([\s\S]*?)```/gi,
    (_, code) => {
      const cleanCode = code.trim().replace(/"/g, '&quot;');
      return `<div class="mermaid-container my-6 p-4 rounded-xl bg-gray-50/80 dark:bg-[#252528] border border-gray-200/80 dark:border-gray-700/80 flex flex-col items-center overflow-x-auto"><div class="mermaid" data-source="${cleanCode}">${code.trim()}</div></div>`;
    }
  );

  // 3. Compile markdown to HTML
  let rawHtml = await markedInstance.parse(textWithMermaid);

  // 4. Restore math formulas (clearing wrapping <p> if marked created one)
  mathMap.forEach((renderedHtml, key) => {
    rawHtml = rawHtml.replaceAll(`<p>${key}</p>`, renderedHtml).replaceAll(key, renderedHtml);
  });

  // 5. Sanitize HTML for security while preserving full MathML and Mermaid SVGs
  const cleanHtml = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    ADD_TAGS: [
      'math', 'annotation', 'semantics', 'mrow', 'mtext', 'mn', 'mo', 'mi',
      'mspace', 'mover', 'munder', 'msubsup', 'mfrac', 'mroot', 'msqrt',
      'mtable', 'mtr', 'mtd', 'mstyle', 'mpadded', 'munderover',
      'span', 'div', 'svg', 'path', 'g', 'rect', 'line', 'polygon', 'circle', 'text'
    ],
    ADD_ATTR: [
      'aria-hidden', 'viewBox', 'd', 'fill', 'stroke', 'stroke-width',
      'stroke-linecap', 'stroke-linejoin', 'class', 'style', 'data-source',
      'xmlns', 'id', 'target'
    ],
  });

  return cleanHtml;
}

/**
 * Extract Table of Contents (TOC) from Markdown headings
 */
export function extractToc(markdown: string): TocItem[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const toc: TocItem[] = [];
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const rawText = match[2].trim();
    // Remove links, bold, code wrappers for plain text title
    const cleanText = rawText
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`]/g, '');
    const id = cleanText
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '') || `heading-${toc.length}`;

    toc.push({
      id,
      text: cleanText,
      level,
    });
  }

  return toc;
}

/**
 * Calculate accurate document statistics
 */
export function calculateDocStats(text: string): DocStats {
  if (!text) {
    return {
      characters: 0,
      charactersNoSpaces: 0,
      words: 0,
      lines: 1,
      readTimeMinutes: 0,
    };
  }

  const characters = text.length;
  const charactersNoSpaces = text.replace(/\s+/g, '').length;
  
  // Count words: match CJK characters as individual words + Latin word groups
  const cjkChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latinWords = (text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[a-zA-Z0-9_\-]+/g) || []).length;
  const words = cjkChars + latinWords;

  const lines = text.split('\n').length;
  
  // Average reading speed: ~300 words/char per minute in office environments
  const readTimeMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 300));

  return {
    characters,
    charactersNoSpaces,
    words,
    lines,
    readTimeMinutes,
  };
}
