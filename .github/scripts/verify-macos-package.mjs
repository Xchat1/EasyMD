import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { access, lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getCurrentFuseWire, FuseV1Options, FuseState } from '@electron/fuses';

const arch = process.argv[2];
assert(['arm64', 'x64'].includes(arch), 'Usage: node .github/scripts/verify-macos-package.mjs arm64|x64');
const project = process.cwd();
const manifest = JSON.parse(await readFile('package.json', 'utf8'));
const app = path.join(project, 'release', arch === 'arm64' ? 'mac-arm64' : 'mac', 'EasyMD.app');
const resources = path.join(app, 'Contents/Resources');
const appFiles = path.join(resources, 'app');
const allowed = new Set(['desktop', 'scripts', 'dist', 'LICENSE', 'package.json']);
for (const entry of await readdir(appFiles)) assert(allowed.has(entry), `Unexpected packaged source: ${entry}`);
await assert.rejects(access(path.join(appFiles, 'node_modules')), { code: 'ENOENT' });
assert.deepEqual(await readdir(path.join(appFiles, 'scripts')), ['desktop-server.mjs']);
for (const file of ['desktop/main.cjs', 'desktop/preload.cjs', 'dist/index.html', 'dist/LICENSE.txt', 'dist/THIRD_PARTY_NOTICES.md', 'LICENSE']) {
  await access(path.join(appFiles, file));
}
for (const file of ['LICENSE.electron.txt', 'LICENSES.chromium.html', 'licenses/Electron-LICENSE.txt', 'licenses/LICENSES.chromium.html']) {
  const text = await readFile(path.join(resources, file), 'utf8');
  assert(text.length > 100, `Missing or empty Electron runtime notice: ${file}`);
}
assert.equal(await readFile(path.join(appFiles, 'LICENSE'), 'utf8'), await readFile('LICENSE', 'utf8'));
assert.equal(await readFile(path.join(appFiles, 'dist/LICENSE.txt'), 'utf8'), await readFile('LICENSE', 'utf8'));

const plist = (file, key = 'LSMinimumSystemVersion') => execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, file], { encoding: 'utf8' }).trim();
const declaredIcon = plist(path.join(app, 'Contents/Info.plist'), 'CFBundleIconFile');
assert(declaredIcon && path.basename(declaredIcon) === declaredIcon && !declaredIcon.includes('\\'), 'CFBundleIconFile must name an icon directly in Resources');
const iconFile = declaredIcon.endsWith('.icns') ? declaredIcon : `${declaredIcon}.icns`;
assert((await lstat(path.join(resources, iconFile))).isFile(), 'The application icon must be a real file in Resources, not a symlink');
const sourceIcon = await readFile(path.join(project, 'assets/app-icon.icns'));
assert((await readFile(path.join(resources, iconFile))).equals(sourceIcon), 'The published application icon must match assets/app-icon.icns byte for byte');
const minimumSystemVersion = plist(path.join(app, 'Contents/Info.plist'));
const electronMinimumSystemVersion = plist(path.join(project, 'node_modules/electron/dist/Electron.app/Contents/Info.plist'));
assert.equal(minimumSystemVersion, electronMinimumSystemVersion, 'The package must preserve the Electron runtime minimum macOS version');
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'pipe' });
const details = spawnSync('/usr/bin/codesign', ['-dv', '--verbose=4', app], { encoding: 'utf8' });
assert.equal(details.status, 0, 'Cannot inspect application signature');
assert(/Signature=adhoc/.test(details.stderr), 'The preview must be explicitly ad-hoc signed');
const machineArch = execFileSync('/usr/bin/lipo', ['-archs', path.join(app, 'Contents/MacOS/EasyMD')], { encoding: 'utf8' }).trim();
assert.equal(machineArch, arch === 'arm64' ? 'arm64' : 'x86_64');
const fuses = await getCurrentFuseWire(app);
for (const option of [FuseV1Options.RunAsNode, FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseV1Options.EnableNodeCliInspectArguments, FuseV1Options.GrantFileProtocolExtraPrivileges]) assert.equal(fuses[option], FuseState.DISABLE, `Unsafe Electron fuse: ${option}`);
const buildInfo = {
  version: manifest.version,
  arch,
  minimumSystemVersion,
  electronVersion: manifest.devDependencies.electron,
  electronBuilderVersion: manifest.devDependencies['electron-builder'],
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  signing: 'ad-hoc; no Developer ID signature',
  notarized: false,
  automaticUpdates: false,
  icon: { file: iconFile, sha256: createHash('sha256').update(sourceIcon).digest('hex') },
};
const infoName = `build-info-${arch}.json`;
await writeFile(path.join('release', infoName), `${JSON.stringify(buildInfo, null, 2)}\n`);
const names = [`EasyMD-${manifest.version}-mac-${arch}.dmg`, `EasyMD-${manifest.version}-mac-${arch}.zip`, infoName];
const sums = await Promise.all(names.map(async name => `${createHash('sha256').update(await readFile(path.join('release', name))).digest('hex')}  ${name}`));
await writeFile(path.join('release', `SHA256SUMS-${arch}.txt`), `${sums.join('\n')}\n`);
console.log(`Verified ${arch} preview package; minimum macOS ${minimumSystemVersion}; project/Electron/Chromium notices present; application icon matches the source ICNS.`);
