import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getEventListeners } from 'node:events';
import { compileMarkdown, extractToc } from '../src/utils/markdown.ts';
import { exportDocumentHtml, generateStandaloneHtml } from '../src/utils/fileSystem.ts';
import { openSandboxedPreview } from '../src/utils/previewWindow.ts';

const visibleText = (html) => html.replace(/<[^>]*>/g, '')
  .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');

test('shell variables and JS templates remain literal inside inline and fenced code', () => {
  for (const code of ['$HOME $PATH', 'const x = `${a} ${b}`;', '$$not math$$']) {
    for (const input of [`\`\`${code}\`\``, `\`\`\`javascript\n${code}\n\`\`\``]) {
      const html = compileMarkdown(input);
      assert.doesNotMatch(html, /class="katex/);
      assert.ok(visibleText(html).includes(code));
    }
  }
});

test('math renders in prose but leaves escapes, HTML attributes and raw code alone', () => {
  assert.match(compileMarkdown('Equation: $x^2$\n\n$$\nx+y\n$$'), /class="katex/);
  for (const input of ['\\$x\\$', '<a title="$x$">link</a>', '<pre>$x$</pre>', '[link](https://example.test/$x$)']) {
    assert.doesNotMatch(compileMarkdown(input), /class="katex/);
  }
  assert.doesNotMatch(compileMarkdown('Costs $5 and $10.'), /class="katex/);
});

test('Mermaid is parsed as a fence, with source escaped instead of injected', () => {
  const source = 'graph TD\nA["<img src=x onerror=alert(1)>"] --> B';
  const html = compileMarkdown(`\`\`\`mermaid\n${source}\n\`\`\``);
  assert.match(html, /class="mermaid"/);
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
  const nested = compileMarkdown('````text\n```mermaid\ngraph TD\nA-->B\n```\n````');
  assert.doesNotMatch(nested, /class="mermaid"/);
});

test('TOC excludes code and uses exactly the same unique IDs as headings', () => {
  const markdown = '# Intro\n\n```sh\n# comment\n```\n\n# Intro\n\n# Intro-1\n\nSetext &amp; title\n---\n\n# <b>Bold</b> and `code`\n\n# 😀';
  const toc = extractToc(markdown);
  const htmlIds = [...compileMarkdown(markdown).matchAll(/<h[1-6] id="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(toc.map((heading) => heading.id), htmlIds);
  assert.equal(new Set(htmlIds).size, htmlIds.length);
  assert.equal(toc.length, 6);
  assert.equal(toc[3].text, 'Setext & title');
  assert.equal(toc[4].text, 'Bold and code');
  assert.deepEqual(extractToc('# Intro'), [{ id: 'intro', text: 'Intro', level: 1 }]);
});

test('TXT HTML export preserves literal markup and line breaks', async () => {
  const html = await exportDocumentHtml('notes.txt', 'a <b>b</b>\n<script>alert(1)</script>', 'txt');
  assert.match(html, /<pre class="plain-text">a &lt;b&gt;b&lt;\/b&gt;\n&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /white-space: pre-wrap/);
});

test('standalone wrappers escape titles and never add CDN stylesheet dependencies', () => {
  const html = generateStandaloneHtml('</title><script>alert(1)</script>', '<p>safe</p>');
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<link[^>]+https:/);
  assert.match(html, /&lt;\/title&gt;/);
});

function fakePreviewWindow() {
  const frame = { style: {}, attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
  let child;
  const win = new EventTarget();
  win.opener = {};
  win.closed = false;
  win.closeCalls = 0;
  win.document = { body: { style: {}, replaceChildren(node) { child = node; } }, createElement(tag) { assert.equal(tag, 'iframe'); return frame; } };
  win.close = () => {
    win.closeCalls++;
    if (win.closed) return;
    win.closed = true;
    win.dispatchEvent(new Event('pagehide'));
  };
  win.userClose = () => { win.closed = true; win.dispatchEvent(new Event('pagehide')); };
  return { win, frame, get child() { return child; } };
}

function previewHost(t) {
  const previousWindow = globalThis.window;
  const host = new EventTarget();
  const opened = [];
  host.open = () => { const popup = fakePreviewWindow(); opened.push(popup); return popup.win; };
  globalThis.window = host;
  t.after(() => { opened.forEach(({ win }) => win.userClose()); globalThis.window = previousWindow; });
  return { host, opened };
}

test('H5 source is installed only in an opaque sandbox, never document.write', (t) => {
  const { opened } = previewHost(t);
  const source = '<script>document.body.textContent = "preview"</script>';
  const result = openSandboxedPreview(source, true);
  const { win, frame, child } = opened[0];
  assert.equal(result, win);
  assert.equal(child, frame);
  assert.ok(frame.srcdoc.includes(source));
  assert.match(frame.srcdoc, /Content-Security-Policy/);
  assert.match(frame.attributes.sandbox, /allow-scripts/);
  assert.doesNotMatch(frame.attributes.sandbox, /allow-same-origin|allow-top-navigation|allow-popups/);
  assert.equal(win.opener, null);
});

test('an already revoked authorization cannot open a preview window', (t) => {
  const { opened } = previewHost(t);
  const controller = new AbortController(); controller.abort();
  for (const allowNetwork of [false, true]) {
    assert.throws(() => openSandboxedPreview('<p>demo</p>', allowNetwork, controller.signal), { name: 'AbortError' });
  }
  assert.equal(opened.length, 0);
});

test('authorization revoked while the window opens closes it before installing content', (t) => {
  const { host, opened } = previewHost(t);
  const controller = new AbortController();
  const open = host.open;
  host.open = () => { const win = open(); controller.abort(); return win; };
  assert.throws(() => openSandboxedPreview('<script>run()</script>', true, controller.signal), { name: 'AbortError' });
  assert.equal(opened[0].win.closed, true);
  assert.equal(opened[0].child, undefined);
});

test('revoking one document closes all its online previews and releases listeners', (t) => {
  const { host, opened } = previewHost(t);
  const controller = new AbortController();
  const other = new AbortController();
  openSandboxedPreview('<p>one</p>', true, controller.signal);
  openSandboxedPreview('<p>two</p>', true, controller.signal);
  openSandboxedPreview('<p>other document</p>', true, other.signal);
  controller.abort();
  assert.deepEqual(opened.map(({ win }) => win.closed), [true, true, false]);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  assert.equal(getEventListeners(host, 'pagehide').length, 1);
  for (const popup of opened.slice(0, 2)) assert.equal(getEventListeners(popup.win, 'pagehide').length, 0);
});

test('leaving the editor closes online previews and unregisters their authorization callbacks', (t) => {
  const { host, opened } = previewHost(t);
  const controller = new AbortController();
  openSandboxedPreview('<p>demo</p>', true, controller.signal);
  host.dispatchEvent(new Event('pagehide'));
  assert.equal(opened[0].win.closed, true);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  assert.equal(getEventListeners(host, 'pagehide').length, 0);
  assert.equal(getEventListeners(opened[0].win, 'pagehide').length, 0);
  controller.abort();
  assert.equal(opened[0].win.closeCalls, 1);
});

test('manually closing a preview releases callbacks without closing it a second time', (t) => {
  const { host, opened } = previewHost(t);
  const controller = new AbortController();
  openSandboxedPreview('<p>demo</p>', true, controller.signal);
  const { win } = opened[0];
  assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
  win.userClose();
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  assert.equal(getEventListeners(host, 'pagehide').length, 0);
  assert.equal(getEventListeners(win, 'pagehide').length, 0);
  controller.abort(); host.dispatchEvent(new Event('pagehide'));
  assert.equal(win.closeCalls, 0);
});

test('a popup setup failure closes the empty window and releases authorization callbacks', (t) => {
  const { host, opened } = previewHost(t);
  const controller = new AbortController();
  const open = host.open;
  host.open = () => {
    const win = open();
    win.document.createElement = () => { throw new Error('setup failed'); };
    return win;
  };
  assert.throws(() => openSandboxedPreview('<p>demo</p>', true, controller.signal), /setup failed/);
  assert.equal(opened[0].win.closed, true);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  assert.equal(getEventListeners(host, 'pagehide').length, 0);
});
