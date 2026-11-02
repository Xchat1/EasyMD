import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Preserve the established Md bitmap. Icon export only resizes this source;
// it never redraws, substitutes or downloads artwork.
if (process.platform !== 'darwin') throw new Error('Icon export requires macOS sips and iconutil.');
const project = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(project, 'assets/app-icon-source.png');
const sourceHash = createHash('sha256').update(await readFile(source)).digest('hex');
if (sourceHash !== '1dcb2c93b5d0879ac001bd9bc82edf47ba79fa4a0f728dab8056d1d3329f7518') throw new Error('The original Md icon source was replaced. Review branding before regenerating icons.');
const temporary = await mkdtemp(path.join(tmpdir(), 'easymd-icons-'));
try {
  const master = path.join(temporary, 'icon-1024.png');
  execFileSync('/usr/bin/sips', ['-z', '1024', '1024', source, '--out', master], { stdio: 'pipe' });

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
  console.log('Exported PNG icons and macOS ICNS from the original Md source.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
