import { PythonEnvManager } from './server/python-env.js';
import { ServerManager } from './server/server-manager.js';
import { HttpProvider } from './provider/http-provider.js';
import { loadEnvFile } from './utils/env.js';
import type { MemoryProvider } from './provider/index.js';
import type { InitOptions, MemoryOptions } from './types/options.js';
import type {
  AddParams,
  SearchParams,
  UpdateParams,
  GetAllParams,
  FilterParams,
  BatchItem,
  BatchOptions,
  MemoryRecord,
} from './types/memory.js';
import type { AddResult, SearchResult, MemoryListResult } from './types/responses.js';

// 按端口缓存 ServerManager 单例（多个 Memory 实例共享同一个 server）
const serverManagers = new Map<number, ServerManager>();

export class Memory {
  private constructor(
    private readonly provider: MemoryProvider,
    private readonly serverManager?: ServerManager
  ) {}

  /**
   * 一次性初始化：检测/安装 Python 环境 + powermem 包。
   * 幂等操作，重复调用会跳过已完成的步骤。
   */
  static async init(options: InitOptions = {}): Promise<void> {
    const envMgr = new PythonEnvManager(options.homeDir);
    await envMgr.setup(options);
  }

  /**
   * 创建 Memory 实例，自动启动内部 powermem-server。
   * 如果未 init()，会自动先执行 init()。
   */
  static async create(options: MemoryOptions = {}): Promise<Memory> {
    loadEnvFile(options.envFile ?? '.env');

    // 直连模式：跳过一切自动启动逻辑
    if (options.serverUrl) {
      const provider = new HttpProvider(options.serverUrl, options.apiKey);
      return new Memory(provider);
    }

    const port = options.port ?? 19527;
    const envMgr = new PythonEnvManager(options.init?.homeDir);

    // 自动 init（幂等，已就绪则立即返回）
    if (!(await envMgr.isReady())) {
      await envMgr.setup(options.init ?? {});
    }

    // 按 port 复用 ServerManager 单例
    let serverMgr = serverManagers.get(port);
    if (!serverMgr) {
      serverMgr = new ServerManager(port);
      serverManagers.set(port, serverMgr);
    }

    const baseUrl = await serverMgr.ensureRunning(envMgr, options);
    const provider = new HttpProvider(baseUrl, options.apiKey);
    return new Memory(provider, serverMgr);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  async add(content: string, options: Omit<AddParams, 'content'> = {}): Promise<AddResult> {
    return this.provider.add({ content, ...options });
  }

  async search(
    query: string,
    options: Omit<SearchParams, 'query'> = {}
  ): Promise<SearchResult> {
    return this.provider.search({ query, ...options });
  }

  async get(memoryId: string): Promise<MemoryRecord | null> {
    return this.provider.get(memoryId);
  }

  async update(
    memoryId: string,
    content: string,
    options: Omit<UpdateParams, 'content'> = {}
  ): Promise<MemoryRecord> {
    return this.provider.update(memoryId, { content, ...options });
  }

  async delete(memoryId: string): Promise<boolean> {
    return this.provider.delete(memoryId);
  }

  async getAll(options: GetAllParams = {}): Promise<MemoryListResult> {
    return this.provider.getAll(options);
  }

  async addBatch(memories: BatchItem[], options: BatchOptions = {}): Promise<AddResult> {
    return this.provider.addBatch(memories, options);
  }

  async deleteAll(options: FilterParams = {}): Promise<boolean> {
    return this.provider.deleteAll(options);
  }

  async reset(): Promise<void> {
    return this.provider.reset();
  }

  /** 释放资源，如果 server 由本 SDK 启动则将其 kill */
  async close(): Promise<void> {
    await this.provider.close();
    await this.serverManager?.shutdown();
  }
}
