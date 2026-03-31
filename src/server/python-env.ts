import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getDefaultHomeDir, getVenvExecutable } from '../utils/platform.js';
import { PowerMemInitError } from '../errors/index.js';
import type { InitOptions } from '../types/options.js';

const execFileAsync = promisify(execFile);

export class PythonEnvManager {
  readonly homeDir: string;
  readonly venvDir: string;
  private readonly lockFile: string;

  constructor(homeDir?: string) {
    this.homeDir = homeDir ?? getDefaultHomeDir();
    this.venvDir = path.join(this.homeDir, 'venv');
    this.lockFile = path.join(this.homeDir, 'init.lock');
  }

  /** 获取 venv 内可执行文件路径 */
  getExecutable(name: string): string {
    return getVenvExecutable(this.venvDir, name);
  }

  /** 检查环境是否已就绪（venv 存在 + powermem 已安装） */
  async isReady(): Promise<boolean> {
    const pip = this.getExecutable('pip');
    if (!fs.existsSync(pip)) return false;
    try {
      const { stdout } = await execFileAsync(pip, ['show', 'powermem']);
      return stdout.includes('Name: powermem');
    } catch {
      return false;
    }
  }

  /** 执行完整初始化（幂等） */
  async setup(options: InitOptions = {}): Promise<void> {
    const { verbose = true, powermemVersion, pipArgs = [] } = options;
    const log = (msg: string): void => {
      if (verbose) console.log(`[powermem-ts] ${msg}`);
    };

    // 已就绪则跳过
    if (await this.isReady()) {
      log('Environment already ready, skipping init.');
      return;
    }

    // 并发保护：写 lock 文件
    fs.mkdirSync(this.homeDir, { recursive: true });
    fs.writeFileSync(this.lockFile, String(process.pid));

    try {
      const pythonPath = await this.findPython(options.pythonPath, log);

      // 若 venv 损坏则删除重建
      if (fs.existsSync(this.venvDir)) {
        log('Removing corrupted venv...');
        fs.rmSync(this.venvDir, { recursive: true, force: true });
      }

      log(`Creating venv at ${this.venvDir}...`);
      await execFileAsync(pythonPath, ['-m', 'venv', this.venvDir]);

      const pkg = powermemVersion ?? 'powermem';
      log(`Installing ${pkg}...`);
      const pip = this.getExecutable('pip');
      await execFileAsync(pip, ['install', pkg, ...pipArgs]);

      log('Verifying installation...');
      const serverBin = this.getExecutable('powermem-server');
      if (!fs.existsSync(serverBin)) {
        throw new PowerMemInitError('powermem-server not found after installation.');
      }

      log('Init complete.');
    } finally {
      if (fs.existsSync(this.lockFile)) fs.rmSync(this.lockFile);
    }
  }

  /** 依次查找可用 Python（>=3.11） */
  private async findPython(
    pythonPath: string | undefined,
    log: (msg: string) => void
  ): Promise<string> {
    const candidates = pythonPath ? [pythonPath] : ['python3', 'python'];

    for (const candidate of candidates) {
      try {
        // python --version prints to stderr on older versions, stdout on 3.x
        const { stdout, stderr } = await execFileAsync(candidate, ['--version']);
        const raw = (stdout || stderr).trim();
        const version = raw.replace('Python ', '');
        const [major, minor] = version.split('.').map(Number);
        if (major > 3 || (major === 3 && minor >= 11)) {
          log(`Using Python: ${candidate} (${version})`);
          return candidate;
        }
        log(`Skipping ${candidate} (${version}): need 3.11+`);
      } catch {
        // candidate not found, try next
      }
    }

    throw new PowerMemInitError(
      'Python 3.11+ not found. Please install Python 3.11 or higher.'
    );
  }
}
