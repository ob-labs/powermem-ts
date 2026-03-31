import os from 'node:os';
import path from 'node:path';

export const isWindows = process.platform === 'win32';

/** 获取 venv 内可执行文件的完整路径（跨平台） */
export function getVenvExecutable(venvDir: string, name: string): string {
  if (isWindows) {
    return path.join(venvDir, 'Scripts', `${name}.exe`);
  }
  return path.join(venvDir, 'bin', name);
}

/** 默认 powermem 家目录 */
export function getDefaultHomeDir(): string {
  return path.join(os.homedir(), '.powermem');
}
