import { spawn, type ChildProcess } from 'node:child_process';
import { PowerMemStartupError } from '../errors/index.js';
import type { PythonEnvManager } from './python-env.js';
import type { MemoryOptions } from '../types/options.js';

const DEFAULT_PORT = 19527;
const POLL_INTERVAL_MS = 500;

export class ServerManager {
  private process?: ChildProcess;
  private isOwner = false;
  readonly port: number;
  readonly baseUrl: string;

  constructor(port: number = DEFAULT_PORT) {
    this.port = port;
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  /** 确保 server 在运行，返回 baseUrl */
  async ensureRunning(
    envManager: PythonEnvManager,
    options: MemoryOptions = {}
  ): Promise<string> {
    // server 已在运行则复用（不设 isOwner，close 时不 kill）
    if (await this.healthCheck()) return this.baseUrl;

    const serverBin = envManager.getExecutable('powermem-server');
    const envFile = options.envFile ?? '.env';

    this.process = spawn(
      serverBin,
      ['--host', '127.0.0.1', '--port', String(this.port)],
      {
        env: {
          ...process.env,
          POWERMEM_SERVER_AUTH_ENABLED: 'false',
          POWERMEM_ENV_FILE: envFile,
        },
        stdio: 'pipe',
        detached: false,
      }
    );

    this.isOwner = true;

    // 父进程退出时清理子进程
    const cleanup = (): void => this.killSync();
    process.on('exit', cleanup);
    process.on('SIGINT', () => { cleanup(); process.exit(); });
    process.on('SIGTERM', () => { cleanup(); process.exit(); });

    const timeout = options.startupTimeout ?? 30_000;
    await this.waitForReady(timeout);

    return this.baseUrl;
  }

  async shutdown(): Promise<void> {
    if (this.isOwner && this.process) {
      this.process.kill('SIGTERM');
      this.process = undefined;
      this.isOwner = false;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/system/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async waitForReady(timeout: number): Promise<void> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await this.healthCheck()) return;
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    this.killSync();
    throw new PowerMemStartupError(
      `powermem-server did not become ready within ${timeout}ms.`
    );
  }

  private killSync(): void {
    try {
      this.process?.kill('SIGKILL');
    } catch {
      // ignore
    }
  }
}
