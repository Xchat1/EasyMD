import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const tag = process.env.RELEASE_TAG;
const repository = process.env.GITHUB_REPOSITORY;
assert(/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag || ''), 'A version tag such as v1.0.0 is required');
assert(/^[\w.-]+\/[\w.-]+$/.test(repository || ''), 'GITHUB_REPOSITORY is required');
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(tag, `v${manifest.version}`, 'The release tag must match package.json');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const tagged = execFileSync('git', ['rev-parse', `refs/tags/${tag}^{commit}`], { encoding: 'utf8' }).trim();
assert.equal(head, tagged, 'The draft must use the checked-out version tag');

const directory = 'artifacts';
const files = (await readdir(directory)).filter(name => /\.(?:dmg|zip)$|^build-info-(?:arm64|x64)\.json$|^SHA256SUMS$/.test(name));
assert.equal(files.filter(name => name.endsWith('.dmg')).length, 2, 'Both DMGs are required');
assert.equal(files.filter(name => name.endsWith('.zip')).length, 2, 'Both ZIPs are required');
assert(files.includes('SHA256SUMS'), 'The aggregate checksum file is required');
for (const arch of ['arm64', 'x64']) {
  const info = JSON.parse(await readFile(path.join(directory, `build-info-${arch}.json`), 'utf8'));
  assert.equal(info.arch, arch);
  assert.equal(info.version, manifest.version);
  assert.equal(info.commit, head);
  assert.equal(info.notarized, false);
}

const run = args => execFileSync('gh', args, { stdio: 'inherit' });
const existing = spawnSync('gh', ['release', 'view', tag, '-R', repository, '--json', 'isDraft'], { encoding: 'utf8' });
const options = ['--draft', '--prerelease', '--title', `EasyMD ${tag} — macOS preview (unnotarized)`, '--notes-file', '.github/RELEASE_NOTES_MACOS.md'];
if (existing.status === 0) {
  assert.equal(JSON.parse(existing.stdout).isDraft, true, 'Refusing to replace an already published release');
  run(['release', 'edit', tag, '-R', repository, ...options]);
} else {
  assert(/not found|HTTP 404/i.test(existing.stderr), `Cannot inspect the release: ${existing.stderr.trim()}`);
  run(['release', 'create', tag, '-R', repository, '--verify-tag', ...options]);
}
run(['release', 'upload', tag, '-R', repository, '--clobber', ...files.sort().map(name => path.join(directory, name))]);
