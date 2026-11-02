import { createHash } from 'node:crypto';
import { copyFile, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { generateNotices } from './generate-notices.mjs';

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const name = `${prefix}${entry.name}`;
    return entry.isDirectory() ? listFiles(path.join(directory, entry.name), `${name}/`) : [name];
  }));
  return files.flat().sort();
}

export async function generatePwa(outDir, { templatePath = new URL('../public/sw.js', import.meta.url) } = {}) {
  const manifestPath = path.join(outDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.start_url = './';
  manifest.id = './';
  manifest.scope = './';
  manifest.icons = manifest.icons.map((icon) => ({ ...icon, src: icon.src.replace(/^\//, './') }));
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const files = (await listFiles(outDir)).filter((name) => name !== 'sw.js');
  const template = await readFile(templatePath, 'utf8');
  const hash = createHash('sha256');
  hash.update(template);
  for (const name of files) {
    hash.update(name);
    hash.update(await readFile(path.join(outDir, name)));
  }
  const source = template
    .replace('__EASYMD_VERSION__', hash.digest('hex').slice(0, 20))
    .replace('__EASYMD_PRECACHE__', JSON.stringify(files));
  await writeFile(path.join(outDir, 'sw.js'), source);
  return files;
}

/** Keep the original-code license in static/desktop releases and their offline cache. */
export async function copyProjectLicense(root, outDir) {
  // The local static server serves .txt files. An extensionless LICENSE would
  // fail its type check and make the all-or-nothing PWA precache fail as well.
  await copyFile(path.join(root, 'LICENSE'), path.join(outDir, 'LICENSE.txt'));
}

export function releaseArtifacts() {
  let config;
  return {
    name: 'easymd-release-artifacts',
    apply: 'build',
    configResolved(resolved) { config = resolved; },
    buildStart() { generateNotices(config.root); },
    async closeBundle() {
      const outDir = path.resolve(config.root, config.build.outDir);
      await copyProjectLicense(config.root, outDir);
      await generateNotices(config.root, outDir);
      await generatePwa(outDir);
    },
  };
}
