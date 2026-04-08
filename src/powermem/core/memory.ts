import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Embeddings } from '@langchain/core/embeddings';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { loadEnvFile } from '../utils/env.js';
import { autoConfig } from '../config_loader.js';
import { parseMemoryConfig } from '../configs.js';
import { GraphStoreFactory, VectorStoreFactory } from '../storage/factory.js';
import { createEmbeddings, createEmbeddingsFromEnv, createSparseEmbedder } from '../integrations/embeddings/factory.js';
import { createLLM, createLLMFromEnv } from '../integrations/llm/factory.js';
import { createRerankerFnFromConfig } from '../integrations/rerank/factory.js';
import type { VectorStore, VectorStoreFilter, VectorStoreRecord, GraphStoreBase } from '../storage/base.js';
import type { MigrationResult } from '../storage/sub-storage.js';
import type { MemoryOptions } from '../types/options.js';
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
import type { AddResult, SearchHit, SearchResult, MemoryListResult } from '../types/responses.js';
import type { SubStorageRouter } from '../storage/sub-storage.js';
import { SQLiteStore } from '../storage/sqlite/sqlite.js';
import { Embedder } from '../integrations/embeddings/embedder.js';
import { SnowflakeIDGenerator } from '../utils/snowflake.js';
import { IntelligenceManager, type IntelligenceConfig } from '../intelligence/manager.js';
import { createIntelligencePlugin, type IntelligencePlugin } from '../intelligence/plugin.js';
import { StorageAdapter } from '../storage/adapter.js';
import { MemoryOptimizer } from '../intelligence/memory-optimizer.js';
import { calculateStatsFromMemories } from '../utils/stats.js';
import { extractTextFromContent, hasVisionContent, hasAudioContent, parseVisionMessages, parseAudioMessages } from '../utils/messages.js';
import { ErrorCode, PowerMemError } from '../errors/index.js';
import { MemoryBase } from './base.js';
import { getFactRetrievalPrompt, buildUpdateMemoryPrompt } from '../prompts/intelligent-memory-prompts.js';
import { TelemetryManager } from './telemetry.js';
import { AuditLogger } from './audit.js';

interface Config {
  fallbackToSimpleAdd: boolean;
  reranker?: MemoryOptions['reranker'];
  enableDecay: boolean;
  decayWeight: number;
}

function md5(content: string): string {
  return crypto.createHash('md5').update(content, 'utf-8').digest('hex');
}

function nowISO(): string {
  return new Date().toISOString();
}

function removeCodeBlocks(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9]*\n([\s\S]*?)\n```$/);
  return match ? match[1].trim() : trimmed;
}

function ensureParentDir(dbPath: string): void {
  if (dbPath === ':memory:') return;
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

function toMemoryRecord(rec: VectorStoreRecord): MemoryRecord {
  return {
    id: rec.id,
    memoryId: rec.id,
    content: rec.content,
    userId: rec.userId,
    agentId: rec.agentId,
    runId: rec.runId,
    metadata: rec.metadata,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    scope: rec.scope,
    category: rec.category,
    accessCount: rec.accessCount,
  };
}

interface MemoryAction {
  id: string;
  text: string;
  event: 'ADD' | 'UPDATE' | 'DELETE' | 'NONE';
  oldMemory?: string;
}

export class Memory extends MemoryBase {
  private readonly store: VectorStore;
  private readonly embedder: Embedder;
  private readonly llmInstance?: BaseChatModel;
  private readonly idGen = new SnowflakeIDGenerator();
  private readonly config: Config;
  private readonly intelligenceManager?: IntelligenceManager;
  private readonly intelligencePlugin?: IntelligencePlugin;
  private readonly graphStore?: GraphStoreBase;
  private readonly subStorageRouter?: SubStorageRouter;
  private readonly telemetryManager: TelemetryManager;
  private readonly auditLogger: AuditLogger;
  private readonly customFactExtractionPrompt?: string;
  private readonly customUpdateMemoryPrompt?: string;

  private constructor(
    store: VectorStore,
    embedder: Embedder,
    config?: Partial<Config>,
    intelligenceManager?: IntelligenceManager,
    intelligencePlugin?: IntelligencePlugin,
    graphStore?: GraphStoreBase,
    subStorageRouter?: SubStorageRouter,
    llmInstance?: BaseChatModel,
    telemetryManager?: TelemetryManager,
    auditLogger?: AuditLogger,
    customFactExtractionPrompt?: string,
    customUpdateMemoryPrompt?: string,
  ) {
    super();
    this.store = store;
    this.embedder = embedder;
    this.intelligenceManager = intelligenceManager;
    this.intelligencePlugin = intelligencePlugin;
    this.graphStore = graphStore;
    this.subStorageRouter = subStorageRouter;
    this.llmInstance = llmInstance;
    this.telemetryManager = telemetryManager ?? new TelemetryManager();
    this.auditLogger = auditLogger ?? new AuditLogger();
    this.customFactExtractionPrompt = customFactExtractionPrompt;
    this.customUpdateMemoryPrompt = customUpdateMemoryPrompt;
    this.config = {
      fallbackToSimpleAdd: config?.fallbackToSimpleAdd ?? false,
      reranker: config?.reranker,
      enableDecay: config?.enableDecay ?? false,
      decayWeight: config?.decayWeight ?? 0.3,
    };
  }

  static async init(_options: Record<string, unknown> = {}): Promise<void> {}

  static async create(options: MemoryOptions = {}): Promise<Memory> {
    if (options.envFile) {
      loadEnvFile(options.envFile);
    }

    const rawConfig = options.config ?? autoConfig();
    const config = parseMemoryConfig(rawConfig);

    let sparseEmbedder: Awaited<ReturnType<typeof createSparseEmbedder>> | undefined;
    if (config.sparseEmbedder?.provider) {
      try {
        sparseEmbedder = await createSparseEmbedder({
          provider: config.sparseEmbedder.provider,
          ...(config.sparseEmbedder.config as Record<string, unknown>),
        } as Parameters<typeof createSparseEmbedder>[0]);
      } catch {
        // Sparse embedder stays optional.
      }
    }

    let store: VectorStore | undefined;
    if (options.store) {
      store = options.store;
    } else if (options.dbPath) {
      ensureParentDir(options.dbPath);
      store = new SQLiteStore(options.dbPath);
    } else if (config.vectorStore.provider === 'sqlite') {
      const configuredPath = config.vectorStore.config.path;
      const dbPath = typeof configuredPath === 'string' ? configuredPath : './data/powermem_dev.db';
      ensureParentDir(dbPath);
      store = new SQLiteStore(dbPath);
    } else {
      try {
        store = await VectorStoreFactory.create(config.vectorStore.provider, {
          ...(config.vectorStore.config as Record<string, unknown>),
          ...(sparseEmbedder ? { sparseEmbedder } : {}),
        });
      } catch {
        const dbPath = './data/powermem_dev.db';
        ensureParentDir(dbPath);
        store = new SQLiteStore(dbPath);
      }
    }

    let embeddings: Embeddings | undefined = options.embeddings;
    if (!embeddings && config.embedder.provider) {
      try {
        embeddings = await createEmbeddings({
          provider: config.embedder.provider,
          ...(config.embedder.config as Record<string, unknown>),
        });
      } catch {
        // Fall through to env-based creation.
      }
    }
    if (!embeddings) {
      embeddings = await createEmbeddingsFromEnv();
    }
    const embedder = new Embedder(embeddings);

    let llm: BaseChatModel | undefined = options.llm;
    if (!llm && config.llm.provider) {
      try {
        llm = await createLLM({
          provider: config.llm.provider,
          ...(config.llm.config as Record<string, unknown>),
        });
      } catch {
        // LLM stays optional.
      }
    }
    if (!llm) {
      try {
        llm = await createLLMFromEnv();
      } catch {
        // LLM stays optional.
      }
    }

    let reranker = options.reranker;
    if (!reranker && config.reranker) {
      try {
        reranker = await createRerankerFnFromConfig({
          enabled: config.reranker.enabled,
          provider: config.reranker.provider,
          ...(config.reranker.config as Record<string, unknown>),
        });
      } catch {
        // Reranker optional.
      }
    }

    let intelligenceManager: IntelligenceManager | undefined;
    let intelligencePlugin: IntelligencePlugin | undefined;
    const intelligentConfig = config.intelligentMemory;
    const intelligenceOptions: IntelligenceConfig = {
      enabled: intelligentConfig?.enabled ?? false,
      enableDecay: options.enableDecay ?? intelligentConfig?.enabled ?? false,
      decayWeight: options.decayWeight ?? intelligentConfig?.reinforcementFactor ?? 0.3,
    };
    if (intelligenceOptions.enabled || intelligenceOptions.enableDecay) {
      intelligenceManager = new IntelligenceManager(intelligenceOptions);
      intelligencePlugin = createIntelligencePlugin(intelligentConfig?.plugin, intelligenceOptions);
    }

    let graphStore = options.graphStore;
    if (!graphStore && config.graphStore && config.graphStore.enabled !== false) {
      try {
        graphStore = await GraphStoreFactory.create(
          config.graphStore.provider,
          config.graphStore.config ?? {},
        );
      } catch {
        // Graph store stays optional.
      }
    }

    const memory = new Memory(
      store,
      embedder,
      {
        fallbackToSimpleAdd: options.fallbackToSimpleAdd ?? intelligentConfig?.fallbackToSimpleAdd ?? false,
        reranker,
        enableDecay: intelligenceOptions.enableDecay ?? false,
        decayWeight: intelligenceOptions.decayWeight ?? 0.3,
      },
      intelligenceManager,
      intelligencePlugin,
      graphStore,
      options.subStorageRouter,
      llm,
      new TelemetryManager(config.telemetry ?? {}),
      new AuditLogger(config.audit ?? {}),
      options.customFactExtractionPrompt ?? config.customFactExtractionPrompt ?? undefined,
      options.customUpdateMemoryPrompt ?? config.customUpdateMemoryPrompt ?? undefined,
    );
    memory.telemetryManager.captureEvent('memory.init', {
      vectorStore: config.vectorStore.provider,
      llmProvider: config.llm.provider,
      graphProvider: config.graphStore?.provider,
    });
    return memory;
  }

  private resolveStore(params: { userId?: string; agentId?: string; scope?: string; metadata?: Record<string, unknown> } = {}): VectorStore {
    if (this.subStorageRouter) {
      return this.subStorageRouter.routeToStore(params);
    }
    return this.store;
  }

  private buildPayload(content: string, params: {
    userId?: string; agentId?: string; runId?: string;
    metadata?: Record<string, unknown>; scope?: string; category?: string;
  }, createdAt?: string): Record<string, unknown> {
    const now = nowISO();
    return {
      data: content,
      user_id: params.userId ?? null,
      agent_id: params.agentId ?? null,
      run_id: params.runId ?? null,
      hash: md5(content),
      created_at: createdAt ?? now,
      updated_at: now,
      scope: params.scope ?? null,
      category: params.category ?? null,
      access_count: 0,
      metadata: params.metadata ?? {},
    };
  }

  private buildRecord(id: string, content: string, payload: Record<string, unknown>, params: {
    userId?: string; agentId?: string; runId?: string;
    metadata?: Record<string, unknown>; scope?: string; category?: string;
  }): MemoryRecord {
    return {
      id,
      memoryId: id,
      content,
      userId: params.userId,
      agentId: params.agentId,
      runId: params.runId,
      metadata: params.metadata,
      scope: params.scope,
      category: params.category,
      createdAt: payload.created_at as string,
      updatedAt: payload.updated_at as string,
      accessCount: 0,
    };
  }

  private async resolveTextContent(content: MemoryContent): Promise<string> {
    if (typeof content === 'string') return content;

    let text = extractTextFromContent(content);

    if (hasVisionContent(content) && this.llmInstance) {
      try {
        text = await parseVisionMessages(content, async (msgs) => {
          const { HumanMessage } = await import('@langchain/core/messages');
          const response = await this.llmInstance!.invoke([new HumanMessage({ content: msgs[0].content as never })]);
          return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
        });
      } catch {
        // Fall back to extracted text.
      }
    }

    if (hasAudioContent(content)) {
      try {
        text = await parseAudioMessages(content, async (audioUrl) => {
          const whisperUrl = process.env.WHISPER_API_URL ?? process.env.ASR_API_URL;
          if (!whisperUrl) return '[audio: no ASR configured]';
          const response = await fetch(whisperUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: audioUrl }),
          });
          const data = await response.json() as { text?: string };
          return data.text ?? '[audio: transcription failed]';
        });
      } catch {
        // Fall back to extracted text.
      }
    }

    return text;
  }

  private captureTelemetryEvent(
    eventName: string,
    properties?: Record<string, unknown>,
    userId?: string,
    agentId?: string,
  ): void {
    this.telemetryManager.captureEvent(eventName, properties, userId, agentId);
  }

  private logAuditEvent(
    eventType: string,
    details: Record<string, unknown>,
    userId?: string,
    agentId?: string,
  ): void {
    this.auditLogger.logEvent(eventType, details, userId, agentId);
  }

  private async extractFacts(content: string): Promise<string[]> {
    if (!this.llmInstance) return [];
    const systemPrompt = getFactRetrievalPrompt(this.customFactExtractionPrompt);
    const response = await this.llmInstance.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(`Input:\n${content}`),
    ]);
    const text = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);
    const cleaned = removeCodeBlocks(text);
    try {
      const parsed = JSON.parse(cleaned) as { facts?: unknown };
      if (Array.isArray(parsed.facts)) {
        return parsed.facts.filter((fact): fact is string => typeof fact === 'string' && fact.trim().length > 0);
      }
      if (typeof parsed.facts === 'string' && parsed.facts.trim().length > 0) {
        return [parsed.facts.trim()];
      }
      return [];
    } catch {
      return [];
    }
  }

  private async decideMemoryActions(
    facts: string[],
    existingMemories: Array<{ id: string; text: string }>,
  ): Promise<MemoryAction[]> {
    if (!this.llmInstance) return [];
    const prompt = buildUpdateMemoryPrompt(
      existingMemories,
      facts,
      this.customUpdateMemoryPrompt,
    );
    const response = await this.llmInstance.invoke([new HumanMessage(prompt)]);
    const text = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);
    const cleaned = removeCodeBlocks(text);
    try {
      const parsed = JSON.parse(cleaned) as {
        memory?: Array<{ id: string; text: string; event: string; old_memory?: string }>;
      };
      return (parsed.memory ?? []).map((action) => ({
        id: action.id,
        text: action.text,
        event: action.event.toUpperCase() as MemoryAction['event'],
        oldMemory: action.old_memory,
      }));
    } catch {
      return [];
    }
  }

  private async addInternal(params: AddParams): Promise<AddResult> {
    const shouldInfer = params.infer !== false && this.llmInstance != null;
    return shouldInfer ? this.intelligentAdd(params) : this.simpleAdd(params);
  }

  private async simpleAdd(params: AddParams): Promise<AddResult> {
    const id = this.idGen.nextId();
    const textContent = await this.resolveTextContent(params.content);
    const embedding = await this.embedder.embed(textContent);
    const enrichedMetadata = this.intelligencePlugin?.processMetadata
      ? this.intelligencePlugin.processMetadata(textContent, params.metadata ?? {})
      : this.intelligenceManager
        ? this.intelligenceManager.processMetadata(textContent, params.metadata)
        : params.metadata;
    const enrichedParams = { ...params, metadata: enrichedMetadata };
    const payload = this.buildPayload(textContent, enrichedParams);
    const targetStore = this.resolveStore({ userId: params.userId, agentId: params.agentId, scope: params.scope, metadata: enrichedMetadata });
    await targetStore.insert(id, embedding, payload);
    if (this.graphStore) {
      try {
        await this.graphStore.add(textContent, { userId: params.userId, agentId: params.agentId });
      } catch {
        // Graph store failures are non-fatal.
      }
    }
    return {
      memories: [this.buildRecord(id, textContent, payload, enrichedParams)],
      message: 'Memory created successfully',
    };
  }

  private async intelligentAdd(params: AddParams): Promise<AddResult> {
    const textContent = await this.resolveTextContent(params.content);
    const facts = await this.extractFacts(textContent);
    if (facts.length === 0) {
      if (this.config.fallbackToSimpleAdd) return this.simpleAdd(params);
      return { memories: [], message: 'No memories were created (no facts extracted)' };
    }

    const filters: VectorStoreFilter = {
      userId: params.userId,
      agentId: params.agentId,
      runId: params.runId,
    };

    const existingMap = new Map<string, { id: string; text: string; score: number }>();
    for (const fact of facts) {
      const factEmbedding = await this.embedder.embed(fact);
      const matches = await this.store.search(factEmbedding, filters, 5);
      for (const match of matches) {
        const existing = existingMap.get(match.id);
        if (!existing || match.score > existing.score) {
          existingMap.set(match.id, { id: match.id, text: match.content, score: match.score });
        }
      }
    }

    const existingMemories = Array.from(existingMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    if (existingMemories.length === 0) {
      const memories: MemoryRecord[] = [];
      for (const fact of facts) {
        const id = this.idGen.nextId();
        const embedding = await this.embedder.embed(fact);
        const payload = this.buildPayload(fact, params);
        await this.store.insert(id, embedding, payload);
        memories.push(this.buildRecord(id, fact, payload, params));
      }
      return {
        memories,
        message: memories.length === 1 ? 'Memory created successfully' : `Created ${memories.length} memories successfully`,
      };
    }

    const tempToReal = new Map<string, string>();
    existingMemories.forEach((memory, index) => {
      tempToReal.set(String(index), memory.id);
    });
    const tempMemories = existingMemories.map((memory, index) => ({ id: String(index), text: memory.text }));

    const actions = await this.decideMemoryActions(facts, tempMemories);
    const resultMemories: MemoryRecord[] = [];
    for (const action of actions) {
      switch (action.event) {
        case 'ADD': {
          const id = this.idGen.nextId();
          const embedding = await this.embedder.embed(action.text);
          const payload = this.buildPayload(action.text, params);
          await this.store.insert(id, embedding, payload);
          resultMemories.push(this.buildRecord(id, action.text, payload, params));
          break;
        }
        case 'UPDATE': {
          const realId = tempToReal.get(action.id) ?? action.id;
          const existing = await this.store.getById(realId);
          const embedding = await this.embedder.embed(action.text);
          const payload = this.buildPayload(action.text, params, existing?.createdAt);
          await this.store.update(realId, embedding, payload);
          resultMemories.push(this.buildRecord(realId, action.text, payload, params));
          break;
        }
        case 'DELETE': {
          const realId = tempToReal.get(action.id) ?? action.id;
          await this.store.remove(realId);
          break;
        }
        default:
          break;
      }
    }

    if (resultMemories.length === 0 && this.config.fallbackToSimpleAdd) {
      return this.simpleAdd(params);
    }

    return {
      memories: resultMemories,
      message: resultMemories.length === 0
        ? 'No memories were created (likely duplicates detected or no facts extracted)'
        : resultMemories.length === 1
          ? 'Memory created successfully'
          : `Created ${resultMemories.length} memories successfully`,
    };
  }

  private async searchInternal(params: SearchParams): Promise<SearchResult> {
    const queryEmbedding = await this.embedder.embed(params.query);
    const filters: VectorStoreFilter = {
      ...(params.filters ?? {}),
      userId: params.userId,
      agentId: params.agentId,
      runId: params.runId,
    };
    const limit = params.limit ?? 30;

    const searchStore = this.resolveStore({
      userId: params.userId,
      agentId: params.agentId,
      metadata: params.filters,
    });
    const hybridSearch = (searchStore as VectorStore & {
      hybridSearch?: (
        queryVector: number[],
        queryText: string,
        hybridFilters?: VectorStoreFilter,
        hybridLimit?: number,
      ) => Promise<import('../storage/base.js').VectorStoreSearchMatch[]>;
    }).hybridSearch;
    let matches = typeof hybridSearch === 'function'
      ? await hybridSearch.call(searchStore, queryEmbedding, params.query, filters, limit)
      : await searchStore.search(queryEmbedding, filters, limit);

    if (this.intelligencePlugin?.processSearchResults) {
      matches = this.intelligencePlugin.processSearchResults(matches, params.query);
    } else if (this.intelligenceManager) {
      matches = this.intelligenceManager.processSearchResults(matches);
    }

    if (params.threshold !== undefined) {
      matches = matches.filter((match) => {
        const qualityScore = typeof match.metadata?._quality_score === 'number'
          ? match.metadata._quality_score
          : match.score;
        return qualityScore >= params.threshold!;
      });
    }

    const matchIds = matches.map((match) => match.id);
    if (matchIds.length > 0) {
      await searchStore.incrementAccessCountBatch(matchIds);
    }

    let results: SearchHit[] = matches.map((match) => ({
      memoryId: match.id,
      content: match.content,
      score: match.score,
      metadata: match.metadata,
    }));

    if (this.config.reranker) {
      results = await this.config.reranker(params.query, results);
    }

    let relations: Array<Record<string, unknown>> | undefined;
    if (this.graphStore) {
      try {
        relations = await this.graphStore.search(params.query, { userId: params.userId, agentId: params.agentId }, params.limit);
      } catch {
        // Graph search failures are non-fatal.
      }
    }

    return { results, total: results.length, query: params.query, ...(relations ? { relations } : {}) };
  }

  private async updateInternal(memoryId: string, params: UpdateParams): Promise<MemoryRecord> {
    const existing = await this.store.getById(memoryId);
    if (!existing) throw new PowerMemError(`Memory not found: ${memoryId}`, ErrorCode.NOT_FOUND);

    const content = params.content ?? existing.content;
    const metadata = params.metadata ?? existing.metadata;

    let embedding = existing.embedding ?? [];
    if (params.content && params.content !== existing.content) {
      embedding = await this.embedder.embed(content);
    }

    const payload: Record<string, unknown> = {
      data: content,
      user_id: existing.userId ?? null,
      agent_id: existing.agentId ?? null,
      run_id: existing.runId ?? null,
      hash: md5(content),
      created_at: existing.createdAt,
      updated_at: nowISO(),
      scope: existing.scope ?? null,
      category: existing.category ?? null,
      access_count: existing.accessCount ?? 0,
      metadata: metadata ?? {},
    };

    await this.store.update(memoryId, embedding, payload);

    return {
      id: memoryId,
      memoryId,
      content,
      userId: existing.userId,
      agentId: existing.agentId,
      runId: existing.runId,
      metadata,
      scope: existing.scope,
      category: existing.category,
      createdAt: existing.createdAt,
      updatedAt: payload.updated_at as string,
      accessCount: existing.accessCount,
    };
  }

  async add(content: MemoryContent, options?: Omit<AddParams, 'content'>): Promise<AddResult>;
  async add(params: AddParams): Promise<AddResult>;
  async add(
    contentOrParams: MemoryContent | AddParams,
    options: Omit<AddParams, 'content'> = {},
  ): Promise<AddResult> {
    const params = (
      typeof contentOrParams === 'string' || Array.isArray(contentOrParams)
        ? { content: contentOrParams, ...options }
        : contentOrParams
    );
    try {
      const result = await this.addInternal(params);
      this.logAuditEvent(
        params.infer !== false && this.llmInstance ? 'memory.intelligent_add' : 'memory.add',
        { createdCount: result.memories.length },
        params.userId,
        params.agentId,
      );
      this.captureTelemetryEvent(
        'memory.add',
        { createdCount: result.memories.length, infer: params.infer !== false },
        params.userId,
        params.agentId,
      );
      return result;
    } catch (error) {
      this.captureTelemetryEvent(
        'memory.add.error',
        { error: error instanceof Error ? error.message : String(error) },
        params.userId,
        params.agentId,
      );
      throw error;
    }
  }

  async search(query: string, options?: Omit<SearchParams, 'query'>): Promise<SearchResult>;
  async search(params: SearchParams): Promise<SearchResult>;
  async search(
    queryOrParams: string | SearchParams,
    options: Omit<SearchParams, 'query'> = {},
  ): Promise<SearchResult> {
    const params = typeof queryOrParams === 'string'
      ? { query: queryOrParams, ...options }
      : queryOrParams;
    try {
      const result = await this.searchInternal(params);
      this.logAuditEvent(
        'memory.search',
        { query: params.query, resultCount: result.results.length },
        params.userId,
        params.agentId,
      );
      this.captureTelemetryEvent(
        'memory.search',
        { resultCount: result.results.length, threshold: params.threshold, limit: params.limit },
        params.userId,
        params.agentId,
      );
      return result;
    } catch (error) {
      this.captureTelemetryEvent(
        'memory.search.error',
        { error: error instanceof Error ? error.message : String(error), query: params.query },
        params.userId,
        params.agentId,
      );
      throw error;
    }
  }

  async get(memoryId: string): Promise<MemoryRecord | null> {
    const record = await this.store.getById(memoryId);
    if (!record) return null;
    await this.store.incrementAccessCount(memoryId);
    return toMemoryRecord(record);
  }

  async update(memoryId: string, content: string, options?: Omit<UpdateParams, 'content'>): Promise<MemoryRecord>;
  async update(memoryId: string, params: UpdateParams): Promise<MemoryRecord>;
  async update(
    memoryId: string,
    contentOrParams: string | UpdateParams,
    options: Omit<UpdateParams, 'content'> = {},
  ): Promise<MemoryRecord> {
    const params = typeof contentOrParams === 'string'
      ? { content: contentOrParams, ...options }
      : contentOrParams;
    const result = await this.updateInternal(memoryId, params);
    this.logAuditEvent('memory.update', { memoryId }, result.userId, result.agentId);
    return result;
  }

  async delete(memoryId: string): Promise<boolean> {
    const deleted = await this.store.remove(memoryId);
    if (deleted) {
      this.logAuditEvent('memory.delete', { memoryId });
    }
    return deleted;
  }

  async getAll(options: GetAllParams = {}): Promise<MemoryListResult> {
    const filters: VectorStoreFilter = { userId: options.userId, agentId: options.agentId, runId: options.runId };
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;
    const { records, total } = await this.store.list(filters, limit, offset, {
      sortBy: options.sortBy,
      order: options.order,
    });
    this.logAuditEvent('memory.get_all', { total, limit, offset }, options.userId, options.agentId);
    return { memories: records.map(toMemoryRecord), total, limit, offset };
  }

  async count(options: FilterParams = {}): Promise<number> {
    const total = await this.store.count({ userId: options.userId, agentId: options.agentId, runId: options.runId });
    this.logAuditEvent('memory.count_all', { total }, options.userId, options.agentId);
    return total;
  }

  async addBatch(memories: BatchItem[], options: BatchOptions = {}): Promise<AddResult> {
    const created: MemoryRecord[] = [];
    for (const item of memories) {
      const result = await this.add(item.content, {
        metadata: item.metadata,
        userId: options.userId,
        agentId: options.agentId,
        runId: options.runId,
        infer: options.infer,
        scope: item.scope ?? options.scope,
        category: item.category ?? options.category,
      });
      created.push(...result.memories);
    }
    return { memories: created, message: `Created ${created.length} memories` };
  }

  async deleteAll(options: FilterParams = {}): Promise<boolean> {
    await this.store.removeAll({ userId: options.userId, agentId: options.agentId, runId: options.runId });
    this.logAuditEvent('memory.delete_all', {}, options.userId, options.agentId);
    this.captureTelemetryEvent('memory.delete_all', {}, options.userId, options.agentId);
    return true;
  }

  async reset(): Promise<void> {
    await this.deleteAll();
    this.captureTelemetryEvent('memory.reset', { syncType: 'sync' });
  }

  async close(): Promise<void> {
    await this.telemetryManager.flush();
    this.auditLogger.close();
    await this.store.close();
  }

  async getStatistics(options: FilterParams = {}): Promise<Record<string, unknown>> {
    const adapter = new StorageAdapter(this.store);
    const filters: VectorStoreFilter = { userId: options.userId, agentId: options.agentId, runId: options.runId };
    const basic = await adapter.getStatistics(filters);
    const all = await this.getAll({ userId: options.userId, agentId: options.agentId, runId: options.runId, limit: 10000 });
    const detailed = calculateStatsFromMemories(all.memories as unknown as Array<Record<string, unknown>>);
    return { ...basic, ...detailed };
  }

  async getUsers(limit = 1000): Promise<string[]> {
    const adapter = new StorageAdapter(this.store);
    return adapter.getUniqueUsers(limit);
  }

  async optimize(strategy: string = 'exact', userId?: string, threshold = 0.95): Promise<Record<string, unknown>> {
    const optimizer = new MemoryOptimizer(this.store);
    return await optimizer.deduplicate(strategy as 'exact' | 'semantic', userId, threshold) as unknown as Record<string, unknown>;
  }

  async exportMemories(options: GetAllParams = {}): Promise<MemoryRecord[]> {
    const result = await this.getAll(options);
    return result.memories;
  }

  async importMemories(
    memories: Array<{ content: string; metadata?: Record<string, unknown>; userId?: string; agentId?: string }>,
    options: { infer?: boolean } = {},
  ): Promise<{ imported: number; errors: number }> {
    let imported = 0;
    let errors = 0;
    for (const memory of memories) {
      try {
        await this.add(memory.content, {
          metadata: memory.metadata,
          userId: memory.userId,
          agentId: memory.agentId,
          infer: options.infer ?? false,
        });
        imported++;
      } catch {
        errors++;
      }
    }
    return { imported, errors };
  }

  async migrateToSubStore(
    storeName: string,
    options?: { deleteSource?: boolean; batchSize?: number; filter?: VectorStoreFilter },
  ): Promise<MigrationResult> {
    if (!this.subStorageRouter) throw new Error('No SubStorageRouter configured');
    return this.subStorageRouter.migrateToSubStore(storeName, options);
  }
}
