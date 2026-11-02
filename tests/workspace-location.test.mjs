import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveICloudWorkspace } from '../scripts/workspace-location.mjs';
import { createDesktopServer } from '../scripts/desktop-server.mjs';

async function temporaryHome(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'easymd-icloud-location-'));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  return home;
}

test('an existing canonical iCloud directory resolves only its EasyMD child without creating it', async (t) => {
  const home = await temporaryHome(t);
  const cloud = path.join(home, 'Library/Mobile Documents/com~apple~CloudDocs');
  await fs.mkdir(cloud, { recursive: true });
  assert.equal(await resolveICloudWorkspace({ home }), path.join(cloud, 'EasyMD'));
  assert.deepEqual(await fs.readdir(cloud), []);
});

test('an exact live CloudStorage/iCloudDrive is supported but dated archives never are', async (t) => {
  const home = await temporaryHome(t);
  const storage = path.join(home, 'Library/CloudStorage');
  await fs.mkdir(path.join(storage, 'iCloudDrive (Archive) - 2026-11-01'), { recursive: true });
  await fs.mkdir(path.join(storage, 'iCloudDrive-2026-11-01'));
  await assert.rejects(resolveICloudWorkspace({ home }), { code: 'ICLOUD_NOT_ENABLED' });
  assert.equal(await fs.stat(path.join(home, 'Library/Mobile Documents')).catch(() => null), null);
  const live = path.join(storage, 'iCloudDrive');
  await fs.mkdir(live);
  assert.equal(await resolveICloudWorkspace({ home }), path.join(live, 'EasyMD'));
});

test('a symlink to an archive cannot impersonate an active iCloud provider', async (t) => {
  const home = await temporaryHome(t);
  const storage = path.join(home, 'Library/CloudStorage');
  await fs.mkdir(storage, { recursive: true });
  const archive = path.join(storage, 'iCloudDrive-2025-01-01');
  await fs.mkdir(archive);
  await fs.symlink(archive, path.join(storage, 'iCloudDrive'));
  await assert.rejects(resolveICloudWorkspace({ home }), { code: 'ICLOUD_NOT_ENABLED' });
  assert.deepEqual(await fs.readdir(archive), []);
});

test('missing iCloud errors clearly and neither resolver nor server fabricates missing parents', async (t) => {
  const home = await temporaryHome(t);
  await assert.rejects(resolveICloudWorkspace({ home }), (error) => error.code === 'ICLOUD_NOT_ENABLED' && error.message.includes('同步此 Mac'));
  assert.deepEqual(await fs.readdir(home), []);
  await assert.rejects(createDesktopServer({ root: path.join(home, 'missing-provider/EasyMD'), dist: home, port: 0 }), { code: 'ENOENT' });
  assert.deepEqual(await fs.readdir(home), []);
});
