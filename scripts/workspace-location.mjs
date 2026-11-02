import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Resolve only recognized, existing iCloud Drive roots. Never scan archives. */
export async function resolveICloudWorkspace({ home = os.homedir() } = {}) {
  const candidates = [
    ['Library', 'Mobile Documents', 'com~apple~CloudDocs'],
    ['Library', 'CloudStorage', 'iCloudDrive'],
  ];
  for (const parts of candidates) {
    let directory = path.resolve(home);
    let available = true;
    for (const part of parts) {
      directory = path.join(directory, part);
      try {
        const stat = await fs.lstat(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) { available = false; break; }
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') { available = false; break; }
        if (error.code === 'EACCES' || error.code === 'EPERM') {
          const failure = new Error('无法访问 iCloud 云盘目录，请在系统设置中允许 EasyMD 本机服务访问该目录后重试。');
          failure.code = 'ICLOUD_PERMISSION_DENIED';
          throw failure;
        }
        throw error;
      }
    }
    if (available) return path.join(directory, 'EasyMD');
  }
  const error = new Error('未检测到已启用的 iCloud 云盘。请在“系统设置 → Apple 账户 → iCloud → iCloud 云盘”中开启“同步此 Mac”，等待 Finder 中的 iCloud 云盘可用后重试。EasyMD 不会使用带日期的归档目录，也不会创建 iCloud 父目录。');
  error.code = 'ICLOUD_NOT_ENABLED';
  throw error;
}
