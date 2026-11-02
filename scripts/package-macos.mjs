import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

if (process.platform !== 'darwin') throw new Error('macOS application packaging requires macOS.');
const args = process.argv.slice(2);
if (args.some(argument => !['--arm64', '--x64', '--dir'].includes(argument))) throw new Error('Usage: node scripts/package-macos.mjs [--arm64|--x64] [--dir]');
const root = fileURLToPath(new URL('../', import.meta.url));
const architectures = args.filter(argument => argument !== '--dir');
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/electron-builder/cli.js'),
  '--config', 'electron-builder.yml', '--mac', ...(architectures.length ? architectures : ['--arm64', '--x64']),
  ...(args.includes('--dir') ? ['--dir'] : []), '--publish', 'never'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, DO_NOT_USE_HARD_LINKS: '1', CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
