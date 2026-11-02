/// <reference types="vite/client" />
import katexCss from 'katex/dist/katex.min.css?raw';
import highlightCss from 'highlight.js/styles/github.css?raw';
import katexLicense from '../../node_modules/katex/LICENSE?raw';
import highlightLicense from '../../node_modules/highlight.js/LICENSE?raw';
import katexFontLicense from '../../scripts/licenses/katex-fonts.OFL.txt?raw';

// Vite's inline asset query embeds each installed KaTeX WOFF2 font as a data
// URL. Exported documents therefore do not depend on a CDN or the app server.
const fonts = import.meta.glob<string>('../../node_modules/katex/dist/fonts/*.woff2', {
  eager: true,
  query: '?inline',
  import: 'default',
});
const byFileName = new Map(Object.entries(fonts).map(([path, data]) => [path.split('/').pop()!, data]));
const embeddedKatex = katexCss.replace(/src:url\(fonts\/([^)]+\.woff2)\)[^}]+/g, (_match, file: string) => {
  const data = byFileName.get(file);
  if (!data?.startsWith('data:')) throw new Error(`公式字体未内嵌: ${file}`);
  return `src:url("${data}") format("woff2")`;
});

// Keep the licenses with the CSS/font copies embedded in downloaded documents.
export const exportStyles = `/* KaTeX software\n${katexLicense}\n\nKaTeX fonts (SIL OFL 1.1)\n${katexFontLicense}\n\nhighlight.js\n${highlightLicense}\n*/\n${embeddedKatex}\n${highlightCss}`;
