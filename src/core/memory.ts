import { HttpProvider } from './http-provider.js';
import { NativeProvider } from './native-provider.js';
import { loadEnvFile } from '../utils/env.js';
import { autoConfig } from '../config-loader.js';
import { parseMemoryConfig } from '../configs.js';
import { VectorStoreFactory } from '../storage/factory.js';
import { createEmbeddings } from '../integrations/embeddings/factory.js';
import { createLLM } from '../integrations/llm/factory.js';
import { createRerankerFnFromConfig } from '../integrations/rerank/factory.js';
import type { MemoryProvider } from './provider.js';
import type { VectorStore } from '../storage/base.js';
import type { MigrationResult } from '../storage/sub-storage.js';
import type { InitOptions, MemoryOptions } from '../types/options.js';
import type {
  AddParams,
  MemoryContent,
  SearchParams,
  UpdateParams,
  GetAllParams,
  FilterParams,
  BatchItem,
  BatchOptions,
  MemoryRecord,
} from '../types/memory.js';
import type { AddResult, SearchResult, MemoryListResult } from '../types/responses.js';
import type { SubStorageRouter } from '../storage/sub-storage.js';
import type { VectorStoreFilter } from '../storage/base.js';

export class Memory {
  private _subStorageRouter?: SubStorageRouter;

  private constructor(
    private readonly provider: MemoryProvider,
  ) {}

  /** No-op — retained for backward compatibility. */
  static async init(_options: InitOptions = {}): Promise<void> {}

  static async create(options: MemoryOptions = {}): Promise<Memory> {
    loadEnvFile(options.envFile ?? '.env');

    if (options.serverUrl) {
      const provider = new HttpProvider(options.serverUrl, options.apiKey);
      return new Memory(provider);
    }

    // Config-driven path: use explicit config, or fall back to autoConfig()
    const rawConfig = options.config ?? autoConfig();
    const config = parseMemoryConfig(rawConfig);

    // VectorStore: explicit seekdb > explicit dbPath > config-driven factory
    let store: VectorStore | undefined;
    if (options.seekdb) {
      const { SeekDBStore } = await import('../storage/seekdb/seekdb.js');
      store = await SeekDBStore.create(options.seekdb);
    } else if (!options.dbPath && config.vectorStore.provider !== 'sqlite') {
      // Use factory for non-sqlite providers (sqlite uses dbPath in NativeProvider)
      try {
        store = await VectorStoreFactory.create(config.vectorStore.provider, config.vectorStore.config);
      } catch { /* fall through to NativeProvider default */ }
    }

    // Embeddings: explicit > config-driven
    let embeddings = options.embeddings;
    if (!embeddings && config.embedder.provider) {
      try {
        embeddings = await createEmbeddings({
          provider: config.embedder.provider,
          ...(config.embedder.config as Record<string, unknown>),
        });
      } catch { /* fall through to NativeProvider env-based default */ }
    }

    // LLM: explicit > config-driven
    let llm = options.llm;
    if (!llm && config.llm.provider) {
      try {
        llm = await createLLM({
          provider: config.llm.provider,
          ...(config.llm.config as Record<string, unknown>),
        });
      } catch { /* LLM optional */ }
    }

    // Reranker: explicit > config-driven
    let reranker = options.reranker;
    if (!reranker && config.reranker) {
      try {
        reranker = await createRerankerFnFromConfig({
          provider: config.reranker.provider,
          ...(config.reranker.config as Record<string, unknown>),
        });
      } catch { /* reranker optional */ }
    }

    const provider = await NativeProvider.create({
      embeddings,
      llm,
      dbPath: options.dbPath,
      store,
      customFactExtractionPrompt: options.customFactExtractionPrompt ?? config.customFactExtractionPrompt ?? undefined,
      customUpdateMemoryPrompt: options.customUpdateMemoryPrompt ?? config.customUpdateMemoryPrompt ?? undefined,
      fallbackToSimpleAdd: options.fallbackToSimpleAdd ?? config.intelligentMemory?.fallbackToSimpleAdd,
      reranker,
      enableDecay: options.enableDecay ?? config.intelligentMemory?.enabled,
      decayWeight: options.decayWeight ?? config.intelligentMemory?.reinforcementFactor,
      graphStore: options.graphStore,
      subStorageRouter: options.subStorageRouter,
    });
    const mem = new Memory(provider);
    mem._subStorageRouter = options.subStorageRouter;
    return mem;
  }

  async add(content: MemoryContent, options: Omit<AddParams, 'content'> = {}): Promise<AddResult> {
    return this.provider.add({ content, ...options });
  }

  async search(query: string, options: Omit<SearchParams, 'query'> = {}): Promise<SearchResult> {
    return this.provider.search({ query, ...options });
  }

  async get(memoryId: string): Promise<MemoryRecord | null> {
    return this.provider.get(memoryId);
  }

  async update(memoryId: string, content: string, options: Omit<UpdateParams, 'content'> = {}): Promise<MemoryRecord> {
    return this.provider.update(memoryId, { content, ...options });
  }

  async delete(memoryId: string): Promise<boolean> {
    return this.provider.delete(memoryId);
  }

  async getAll(options: GetAllParams = {}): Promise<MemoryListResult> {
    return this.provider.getAll(options);
  }

  async count(options: FilterParams = {}): Promise<number> {
    return this.provider.count(options);
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

  async close(): Promise<void> {
    await this.provider.close();
  }

  // ─── Extended API ──────────────────────────────────────────────────

  async getStatistics(options: FilterParams = {}): Promise<Record<string, unknown>> {
    if (!this.provider.getStatistics) throw new Error('Method not supported by this provider');
    return this.provider.getStatistics(options);
  }

  async getUsers(limit?: number): Promise<string[]> {
    if (!this.provider.getUsers) throw new Error('Method not supported by this provider');
    return this.provider.getUsers(limit);
  }

  async optimize(strategy?: string, userId?: string, threshold?: number): Promise<Record<string, unknown>> {
    if (!this.provider.optimize) throw new Error('Method not supported by this provider');
    return this.provider.optimize(strategy, userId, threshold);
  }

  async exportMemories(options: GetAllParams = {}): Promise<MemoryRecord[]> {
    if (!this.provider.exportMemories) throw new Error('Method not supported by this provider');
    return this.provider.exportMemories(options);
  }

  async importMemories(
    memories: Array<{ content: string; metadata?: Record<string, unknown>; userId?: string; agentId?: string }>,
    options?: { infer?: boolean },
  ): Promise<{ imported: number; errors: number }> {
    if (!this.provider.importMemories) throw new Error('Method not supported by this provider');
    return this.provider.importMemories(memories, options);
  }

  /** Migrate matching records from main store to a named sub-store. */
  async migrateToSubStore(
    storeName: string,
    options?: { deleteSource?: boolean; batchSize?: number; filter?: VectorStoreFilter },
  ): Promise<MigrationResult> {
    if (!this._subStorageRouter) throw new Error('No SubStorageRouter configured');
    return this._subStorageRouter.migrateToSubStore(storeName, options);
  }
}
