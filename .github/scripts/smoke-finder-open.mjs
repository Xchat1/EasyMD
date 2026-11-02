import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

assert.equal(process.platform, 'darwin', 'Finder cold-launch checks require macOS');
assert.equal(process.argv.length, 3, 'Usage: node .github/scripts/smoke-finder-open.mjs path/to/EasyMD.app');
const app = await realpath(path.resolve(process.argv[2]));
assert(app.endsWith('.app') && (await stat(app)).isDirectory(), 'An application bundle is required');
assert((await stat(path.join(app, 'Contents/MacOS/EasyMD'))).isFile(), 'The EasyMD application executable is missing');

const temporary = await mkdtemp('/private/tmp/easymd-finder-open-');
const fixture = path.join(temporary, 'Finder冷启动.md');
const stdoutPath = path.join(temporary, 'app.stdout.log');
const stderrPath = path.join(temporary, 'app.stderr.log');
const original = Buffer.from('# Finder 冷启动\n\n已有 Markdown 文稿，包含 UTF-8 中文内容。\n打开后应编辑导入副本，原文件保持不变。\n', 'utf8');
let stdout = '', stderr = '';

async function readLog(filename) {
  try { return await readFile(filename, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}

try {
  await writeFile(fixture, original, { flag: 'wx', mode: 0o600 });
  let launchError;
  try {
    await promisify(execFile)('/usr/bin/open', [
      '-W', '-n', '-g', '--stdout', stdoutPath, '--stderr', stderrPath,
      '-a', app, fixture, '--args', '--smoke-test', '--smoke-expect-open',
    ], { timeout: 150_000, maxBuffer: 1024 * 1024 });
  } catch (error) { launchError = error; }

  [stdout, stderr] = await Promise.all([readLog(stdoutPath), readLog(stderrPath)]);
  assert((await readFile(fixture)).equals(original), 'Opening a Finder document changed the external source file');
  if (launchError) throw new Error('Finder cold launch failed or exceeded the 150-second timeout', { cause: launchError });
  assert(/(?:^|\r?\n)EASYMD_SMOKE_TEST_PASSED(?:\r?\n|$)/.test(stdout), 'The Finder-launched application did not complete its native smoke checks');
  // Chromium may write platform diagnostics. Main-process exceptions and failed
  // assertions must still fail even if a success marker was printed earlier.
  assert(!/\b(?:AssertionError|UnhandledPromiseRejection(?:Warning)?|uncaughtException|unhandledRejection|A JavaScript error occurred in the main process)\b|(?:^|\n)(?:Error|TypeError|RangeError|ReferenceError|SyntaxError|AggregateError)(?: \[[^\]\r\n]+\])?:/i.test(stderr),
    'The Finder-launched application reported a main-process error');
  console.log('EASYMD_FINDER_OPEN_SMOKE_TEST_PASSED: cold launch, native smoke checks, and unchanged external UTF-8 document verified.');
} catch (error) {
  if (stdout) console.error(`Application stdout:\n${stdout.slice(-32_768)}`);
  if (stderr) console.error(`Application stderr:\n${stderr.slice(-32_768)}`);
  throw error;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
