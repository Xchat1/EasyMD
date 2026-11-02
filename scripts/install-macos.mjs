import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveICloudWorkspace } from './workspace-location.mjs';

if (process.platform !== 'darwin') throw new Error('This installer requires macOS.');
const project = fileURLToPath(new URL('../', import.meta.url));
const label = 'com.easymd.documents';
const support = path.join(os.homedir(), 'Library/Application Support/EasyMD');
const agentFile = path.join(os.homedir(), 'Library/LaunchAgents', `${label}.plist`);
if (process.argv.slice(2).some((value) => value !== '--icloud')) throw new Error('Usage: node scripts/install-macos.mjs [--icloud]');
const root = process.argv.includes('--icloud') ? await resolveICloudWorkspace() : path.join(os.homedir(), 'Documents/EasyMD');
const uid = process.getuid();
const domain = `gui/${uid}`;
const target = `${domain}/${label}`;
const node = process.execPath;
const xml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const dist = path.join(project, 'dist');
await fs.access(path.join(dist, 'index.html'));
await fs.access(path.join(dist, 'sw.js'));
for (const directory of [support, path.dirname(agentFile)]) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error(`Refusing symbolic link: ${directory}`);
}
const staging = path.join(support, `release-${randomUUID()}`);
await fs.mkdir(staging, { mode: 0o700 });
await fs.cp(dist, path.join(staging, 'app'), { recursive: true, errorOnExist: true, force: false });
await fs.copyFile(path.join(project, 'scripts/desktop-server.mjs'), path.join(staging, 'desktop-server.mjs'));
await fs.copyFile(path.join(project, 'scripts/workspace-location.mjs'), path.join(staging, 'workspace-location.mjs'));
const releaseId = path.basename(staging);
await fs.writeFile(path.join(staging, 'app/desktop-release.json'), JSON.stringify({ releaseId }), { flag: 'wx', mode: 0o600 });
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(path.join(staging, 'desktop-server.mjs'))}</string><string>--root</string><string>${xml(root)}</string><string>--dist</string><string>${xml(path.join(staging, 'app'))}</string><string>--port</string><string>5173</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
<key>Umask</key><integer>63</integer>
<key>StandardOutPath</key><string>${xml(path.join(support, 'service.log'))}</string>
<key>StandardErrorPath</key><string>${xml(path.join(support, 'service-error.log'))}</string>
</dict></plist>
`;
let previous;
try { previous = await fs.readFile(agentFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
let wasLoaded = false;
try { execFileSync('/bin/launchctl', ['print', target], { stdio: 'ignore' }); wasLoaded = true; } catch { /* first installation */ }
if (previous) await fs.writeFile(`${agentFile}.backup-${Date.now()}`, previous, { flag: 'wx', mode: 0o600 });
if (wasLoaded) execFileSync('/bin/launchctl', ['bootout', target], { stdio: 'pipe' });
let started = false;
try {
  const temporary = `${agentFile}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, plist, { flag: 'wx', mode: 0o600 });
  execFileSync('/usr/bin/plutil', ['-lint', temporary], { stdio: 'pipe' });
  await fs.rename(temporary, agentFile);
  execFileSync('/bin/launchctl', ['bootstrap', domain, agentFile], { stdio: 'pipe' });
  started = true;
  let healthy = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const origin = 'http://127.0.0.1:5173';
      const headers = { 'X-EasyMD-Client': '1', 'Sec-Fetch-Site': 'same-origin' };
      const [releaseResponse, sessionResponse] = await Promise.all([
        fetch(`${origin}/desktop-release.json`, { signal: AbortSignal.timeout(1000) }),
        fetch(`${origin}/api/session`, { headers, signal: AbortSignal.timeout(1000) }),
      ]);
      if (releaseResponse.ok && sessionResponse.ok) {
        const [release, session] = await Promise.all([releaseResponse.json(), sessionResponse.json()]);
        if (release.releaseId === releaseId && session.directory === await fs.realpath(root)) { healthy = true; break; }
      }
    } catch { /* launchd may still be starting the new service */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!healthy) throw new Error(`本机文稿服务未通过启动检查，请检查 5173 端口、文稿目录权限和 ${path.join(support, 'service-error.log')}`);
} catch (error) {
  if (started) { try { execFileSync('/bin/launchctl', ['bootout', target], { stdio: 'pipe' }); } catch { /* job may already have exited */ } }
  if (previous) {
    await fs.writeFile(agentFile, previous, { mode: 0o600 });
    if (wasLoaded) { try { execFileSync('/bin/launchctl', ['bootstrap', domain, agentFile], { stdio: 'pipe' }); } catch { /* retained backup supports manual recovery */ } }
  } else await fs.unlink(agentFile).catch((failure) => { if (failure.code !== 'ENOENT') throw failure; });
  throw error;
}
console.log(JSON.stringify({ installed: true, directory: root, origin: 'http://127.0.0.1:5173', release: staging, launchAgent: agentFile }, null, 2));
