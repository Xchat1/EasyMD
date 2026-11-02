import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { copyProjectLicense, generatePwa } from '../scripts/release-artifacts.mjs';

test('the original project declares MIT and carries the grant, notice requirement and disclaimer', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const license = await readFile(new URL('../LICENSE', import.meta.url), 'utf8');
  assert.equal(manifest.license, 'MIT');
  assert(license.startsWith('MIT License\n\nCopyright (c) 2026 Xchat1\n'));
  assert(license.includes('Permission is hereby granted, free of charge'));
  assert(license.includes('The above copyright notice and this permission notice shall be included'));
  assert(license.includes('THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND'));
});

test('a static/desktop release retains both licenses and caches the original license offline', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'easymd-license-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outDir = path.join(root, 'dist');
  await mkdir(outDir);
  const license = await readFile(new URL('../LICENSE', import.meta.url), 'utf8');
  await writeFile(path.join(root, 'LICENSE'), license);
  await writeFile(path.join(outDir, 'index.html'), '<main>EasyMD</main>');
  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify({ icons: [] }));
  const notices = 'Third-party notices remain under their own licenses.\nSIL OPEN FONT LICENSE Version 1.1\n';
  await writeFile(path.join(outDir, 'THIRD_PARTY_NOTICES.md'), notices);

  await copyProjectLicense(root, outDir);
  const assets = await generatePwa(outDir);
  assert.equal(await readFile(path.join(outDir, 'LICENSE.txt'), 'utf8'), license);
  assert.equal(await readFile(path.join(outDir, 'THIRD_PARTY_NOTICES.md'), 'utf8'), notices);
  assert(assets.includes('LICENSE.txt'));
  assert(assets.includes('THIRD_PARTY_NOTICES.md'));
  const worker = await readFile(path.join(outDir, 'sw.js'), 'utf8');
  assert(worker.includes('"LICENSE.txt"'));
  assert(worker.includes('"THIRD_PARTY_NOTICES.md"'));
});

test('release license packaging fails when the original license is missing', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'easymd-license-missing-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.rejects(copyProjectLicense(root, root), { code: 'ENOENT' });
});
