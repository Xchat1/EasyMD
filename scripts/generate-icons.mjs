import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Prerequisites: Node.js, macOS sips/iconutil, and Chrome or Chromium.
// Override the browser location with EASYMD_CHROME_BIN. No npm packages or
// network resources are used to render the authoritative SVG source.
if (process.platform !== 'darwin') throw new Error('Icon export requires macOS sips and iconutil.');
const project = fileURLToPath(new URL('../', import.meta.url));
const chrome = process.env.EASYMD_CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await access(chrome);
const source = await readFile(path.join(project, 'assets/app-icon.svg'), 'utf8');
if (/<(?:image|script|foreignObject)\b|(?:href|src)\s*=|@import|https?:\/\//i.test(source.replace('http://www.w3.org/2000/svg', ''))) {
  throw new Error('The icon source must remain a self-contained vector without scripts, images or external resources.');
}
const temporary = await mkdtemp(path.join(tmpdir(), 'easymd-icons-'));
try {
  const html = path.join(temporary, 'icon.html');
  const master = path.join(temporary, 'icon-1024.png');
  await writeFile(html, `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>html,body{margin:0;width:1024px;height:1024px;background:transparent;overflow:hidden}svg{display:block;width:1024px;height:1024px}</style></head><body>${source}</body></html>`);
  execFileSync(chrome, [
    '--headless', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--default-background-color=00000000', '--window-size=1024,1024',
    `--user-data-dir=${path.join(temporary, 'chrome-profile')}`,
    `--screenshot=${master}`, pathToFileURL(html).href,
  ], { stdio: 'pipe', timeout: 60000 });

  const outputs = {
    'assets/app-icon.png': 1024,
    'public/favicon.png': 64,
    'public/apple-touch-icon.png': 180,
    'public/icon-192.png': 192,
    'public/icon-512.png': 512,
    'public/icon-app-192.png': 192,
    'public/icon-app-512.png': 512,
    'public/icon-large-192.png': 192,
    'public/icon-large-512.png': 512,
  };
  for (const [filename, size] of Object.entries(outputs)) {
    const destination = path.join(project, filename);
    await mkdir(path.dirname(destination), { recursive: true });
    if (size === 1024) await copyFile(master, destination);
    else execFileSync('/usr/bin/sips', ['-z', String(size), String(size), master, '--out', destination], { stdio: 'pipe' });
  }

  const iconset = path.join(temporary, 'EasyMD.iconset');
  await mkdir(iconset);
  const scales = [[16, 1], [16, 2], [32, 1], [32, 2], [128, 1], [128, 2], [256, 1], [256, 2], [512, 1], [512, 2]];
  for (const [points, scale] of scales) {
    const size = points * scale;
    const destination = path.join(iconset, `icon_${points}x${points}${scale === 2 ? '@2x' : ''}.png`);
    execFileSync('/usr/bin/sips', ['-z', String(size), String(size), master, '--out', destination], { stdio: 'pipe' });
  }
  execFileSync('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', path.join(project, 'assets/app-icon.icns')], { stdio: 'pipe' });
  console.log('Exported EasyMD PNG icons and macOS ICNS from assets/app-icon.svg.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
