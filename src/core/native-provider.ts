import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Embeddings } from '@langchain/core/embeddings';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { MemoryProvider } from './provider.js';
import type {
  AddParams,
  SearchParams,
  UpdateParams,
  GetAllParams,
  FilterParams,
  BatchItem,
  BatchOptions,
  MemoryRecord,
} from '../types/memory.js';
import type { AddResult, SearchResult, MemoryListResult } from '../types/responses.js';
import type { RerankerFn } from '../types/options.js';
import { SQLiteStore } from '../storage/sqlite/sqlite.js';
import type { VectorStore, VectorStoreFilter, VectorStoreRecord, GraphStoreBase } from '../storage/base.js';
import { Embedder } from '../integrations/embeddings/embedder.js';
import { Inferrer } from './inferrer.js';
import { SnowflakeIDGenerator } from '../utils/snowflake.js';
import { IntelligenceManager, type IntelligenceConfig } from '../intelligence/manager.js';
import { StorageAdapter } from '../storage/adapter.js';
import { MemoryOptimizer } from '../intelligence/memory-optimizer.js';
import type { SubStorageRouter } from '../storage/sub-storage.js';
import { calculateStatsFromMemories } from '../utils/stats.js';
import { extractTextFromContent, hasVisionContent, hasAudioContent, parseVisionMessages, parseAudioMessages } from '../utils/messages.js';
import { createEmbeddingsFromEnv } from '../integrations/embeddings/factory.js';
import { createLLMFromEnv } from '../integrations/llm/factory.js';
import { getDefaultHomeDir } from '../utils/platform.js';

export interface NativeProviderOptions {
  embeddings?: Embeddings;
  llm?: BaseChatModel;
  dbPath?: string;
  store?: VectorStore;
  customFactExtractionPrompt?: string;
  customUpdateMemoryPrompt?: string;
  fallbackToSimpleAdd?: boolean;
  reranker?: RerankerFn;
  enableDecay?: boolean;
  decayWeight?: number;
  intelligenceConfig?: IntelligenceConfig;
  graphStore?: GraphStoreBase;
  subStorageRouter?: SubStorageRouter;
}

interface Config {
  fallbackToSimpleAdd: boolean;
  reranker?: RerankerFn;
  enableDecay: boolean;
  decayWeight: number;
}

function md5(content: string): string {
  return crypto.createHash('md5').update(content, 'utf-8').digest('hex');
}

function nowISO(): string {
  return new Date().toISOString();
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

export class NativeProvider implements MemoryProvider {
  private readonly store: VectorStore;
  private readonly embedder: Embedder;
  private readonly inferrer?: Inferrer;
  private readonly llmInstance?: BaseChatModel;
  private readonly idGen = new SnowflakeIDGenerator();
  private readonly config: Config;
  private readonly intelligenceManager?: IntelligenceManager;
  private readonly graphStore?: GraphStoreBase;
  private readonly subStorageRouter?: SubStorageRouter;

  private constructor(store: VectorStore, embedder: Embedder, inferrer?: Inferrer, config?: Partial<Config>, intelligenceManager?: IntelligenceManager, graphStore?: GraphStoreBase, subStorageRouter?: SubStorageRouter, llmInstance?: BaseChatModel) {
    this.store = store;
    this.embedder = embedder;
    this.inferrer = inferrer;
    this.intelligenceManager = intelligenceManager;
    this.graphStore = graphStore;
    this.subStorageRouter = subStorageRouter;
    this.llmInstance = llmInstance;
    this.config = {
      fallbackToSimpleAdd: config?.fallbackToSimpleAdd ?? false,
      reranker: config?.reranker,
      enableDecay: config?.enableDecay ?? false,
      decayWeight: config?.decayWeight ?? 0.3,
    };
  }

  static async create(options: NativeProviderOptions = {}): Promise<NativeProvider> {
    // Use injected store or create default SQLiteStore
    let store: VectorStore;
    if (options.store) {
      store = options.store;
    } else {
      const dbPath = options.dbPath ?? path.join(getDefaultHomeDir(), 'memories.db');
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      store = new SQLiteStore(dbPath);
    }

    const embeddingsInstance = options.embeddings ?? (await createEmbeddingsFromEnv());
    const embedder = new Embedder(embeddingsInstance);

    let inferrer: Inferrer | undefined;
    let resolvedLlm: BaseChatModel | undefined = options.llm;
    if (resolvedLlm) {
      inferrer = new Inferrer(resolvedLlm);
    } else {
      try {
        resolvedLlm = await createLLMFromEnv();
        inferrer = new Inferrer(resolvedLlm);
      } catch {
        // LLM not configured
      }
    }

    if (inferrer && (options.customFactExtractionPrompt || options.customUpdateMemoryPrompt)) {
      inferrer.setCustomPrompts(options.customFactExtractionPrompt, options.customUpdateMemoryPrompt);
    }

    // Intelligence manager for importance scoring + Ebbinghaus decay
    let intelligenceManager: IntelligenceManager | undefined;
    const iConfig = options.intelligenceConfig;
    if (iConfig?.enabled || options.enableDecay) {
      intelligenceManager = new IntelligenceManager({
        enabled: iConfig?.enabled ?? true,
        enableDecay: iConfig?.enableDecay ?? options.enableDecay ?? false,
        decayWeight: iConfig?.decayWeight ?? options.decayWeight ?? 0.3,
      });
    }

    return new NativeProvider(store, embedder, inferrer, {
      fallbackToSimpleAdd: options.fallbackToSimpleAdd,
      reranker: options.reranker,
      enableDecay: options.enableDecay,
      decayWeight: options.decayWeight,
    }, intelligenceManager, options.graphStore, options.subStorageRouter, resolvedLlm);
  }

  /** Resolve the VectorStore to use — routes via SubStorageRouter if present. */
  private resolveStore(params: { userId?: string; agentId?: string; scope?: string; metadata?: Record<string, unknown> } = {}): VectorStore {
    if (this.subStorageRouter) {
      return this.subStorageRouter.routeToStore(params);
    }
    return this.store;
  }

  // ─── Add ────────────────────────────────────────────────────────────────

  async add(params: AddParams): Promise<AddResult> {
    const shouldInfer = params.infer !== false && this.inferrer != null;
    if (shouldInfer) {
      return this.intelligentAdd(params);
    }
    return this.simpleAdd(params);
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
      id, memoryId: id, content,
      userId: params.userId, agentId: params.agentId, runId: params.runId,
      metadata: params.metadata, scope: params.scope, category: params.category,
      createdAt: payload.created_at as string,
      updatedAt: payload.updated_at as string,
      accessCount: 0,
    };
  }

  /** Extract text from content, processing vision/audio via LLM if available. */
  private async resolveTextContent(content: import('../types/memory.js').MemoryContent): Promise<string> {
    if (typeof content === 'string') return content;

    let text = extractTextFromContent(content);

    // Vision: describe images via LLM if available
    if (hasVisionContent(content) && this.llmInstance) {
      try {
        text = await parseVisionMessages(content, async (msgs) => {
          const { HumanMessage } = await import('@langchain/core/messages');
          const resp = await this.llmInstance!.invoke([new HumanMessage({ content: msgs[0].content as any })]);
          return typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content);
        });
      } catch { /* fall back to basic extraction */ }
    }

    // Audio: transcribe via external service if configured
    if (hasAudioContent(content)) {
      try {
        text = await parseAudioMessages(content, async (audioUrl) => {
          // Use Whisper-compatible API if configured
          const whisperUrl = process.env.WHISPER_API_URL ?? process.env.ASR_API_URL;
          if (!whisperUrl) return '[audio: no ASR configured]';
          const res = await fetch(whisperUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: audioUrl }),
          });
          const data = await res.json() as { text?: string };
          return data.text ?? '[audio: transcription failed]';
        });
      } catch { /* fall back to basic extraction */ }
    }

    return text;
  }

  private async simpleAdd(params: AddParams): Promise<AddResult> {
    const id = this.idGen.nextId();
    const textContent = await this.resolveTextContent(params.content);
    const embedding = await this.embedder.embed(textContent);
    // Enrich metadata with importance score via IntelligenceManager
    const enrichedMetadata = this.intelligenceManager
      ? this.intelligenceManager.processMetadata(textContent, params.metadata)
      : params.metadata;
    const enrichedParams = { ...params, metadata: enrichedMetadata };
    const payload = this.buildPayload(textContent, enrichedParams);
    const targetStore = this.resolveStore({ userId: params.userId, agentId: params.agentId, scope: params.scope, metadata: enrichedMetadata });
    await targetStore.insert(id, embedding, payload);
    // Graph store (optional, non-blocking)
    if (this.graphStore) {
      try {
        await this.graphStore.add(textContent, { userId: params.userId, agentId: params.agentId });
      } catch { /* graph store failures are non-fatal */ }
    }
    return {
      memories: [this.buildRecord(id, textContent, payload, enrichedParams)],
      message: 'Memory created successfully',
    };
  }

  private async intelligentAdd(params: AddParams): Promise<AddResult> {
    const textContent = await this.resolveTextContent(params.content);
    const facts = await this.inferrer!.extractFacts(textContent);
    if (facts.length === 0) {
      if (this.config.fallbackToSimpleAdd) return this.simpleAdd(params);
      return { memories: [], message: 'No memories were created (no facts extracted)' };
    }

    const filters: VectorStoreFilter = {
      userId: params.userId, agentId: params.agentId, runId: params.runId,
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

    // No existing memories — skip LLM decision, just ADD all facts
    if (existingMemories.length === 0) {
      const resultMemories: MemoryRecord[] = [];
      for (const fact of facts) {
        const id = this.idGen.nextId();
        const embedding = await this.embedder.embed(fact);
        const payload = this.buildPayload(fact, params);
        await this.store.insert(id, embedding, payload);
        resultMemories.push(this.buildRecord(id, fact, payload, params));
      }
      const count = resultMemories.length;
      return {
        memories: resultMemories,
        message: count === 1 ? 'Memory created successfully' : `Created ${count} memories successfully`,
      };
    }

    // Build temp ID mapping
    const tempToReal = new Map<string, string>();
    existingMemories.forEach((m, idx) => {
      tempToReal.set(String(idx), m.id);
    });
    const tempMemories = existingMemories.map((m, idx) => ({ id: String(idx), text: m.text }));

    const actions = await this.inferrer!.decideActions(facts, tempMemories, tempToReal);

    // Execute actions
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
        case 'NONE':
        default:
          break;
      }
    }

    const count = resultMemories.length;
    if (count === 0 && this.config.fallbackToSimpleAdd) {
      return this.simpleAdd(params);
    }

    const message = count === 0
      ? 'No memories were created (likely duplicates detected or no facts extracted)'
      : count === 1
        ? 'Memory created successfully'
        : `Created ${count} memories successfully`;

    return { memories: resultMemories, message };
  }

  // ─── Search ─────────────────────────────────────────────────────────────

  async search(params: SearchParams): Promise<SearchResult> {
    const queryEmbedding = await this.embedder.embed(params.query);
    const filters: VectorStoreFilter = {
      userId: params.userId, agentId: params.agentId, runId: params.runId,
    };
    const limit = params.limit ?? 30;

    const searchStore = this.resolveStore({ userId: params.userId, agentId: params.agentId });
    let matches = await searchStore.search(queryEmbedding, filters, limit);

    // Ebbinghaus decay via IntelligenceManager (or inline fallback)
    if (this.intelligenceManager) {
      matches = this.intelligenceManager.processSearchResults(matches);
    } else if (this.config.enableDecay) {
      const { computeDecayFactor, applyDecay } = await import('../intelligence/ebbinghaus.js');
      for (const match of matches) {
        const decay = computeDecayFactor({
          createdAt: match.createdAt ?? new Date().toISOString(),
          updatedAt: match.updatedAt ?? match.createdAt ?? new Date().toISOString(),
          accessCount: match.accessCount ?? 0,
        });
        match.score = applyDecay(match.score, decay, this.config.decayWeight);
      }
      matches.sort((a, b) => b.score - a.score);
    }

    // Threshold filter
    if (params.threshold !== undefined) {
      matches = matches.filter((m) => m.score >= params.threshold!);
    }

    // Increment access counts
    const matchIds = matches.map((m) => m.id);
    if (matchIds.length > 0) {
      await this.store.incrementAccessCountBatch(matchIds);
    }

    let results: import('../types/responses.js').SearchHit[] = matches.map((m) => ({
      memoryId: m.id,
      content: m.content,
      score: m.score,
      metadata: m.metadata,
    }));

    // Reranker
    if (this.config.reranker) {
      results = await this.config.reranker(params.query, results);
    }

    // Graph relations (optional)
    let relations: Array<Record<string, unknown>> | undefined;
    if (this.graphStore) {
      try {
        relations = await this.graphStore.search(params.query, { userId: params.userId, agentId: params.agentId }, params.limit);
      } catch { /* graph search failures are non-fatal */ }
    }

    return { results, total: results.length, query: params.query, ...(relations ? { relations } : {}) };
  }

  // ─── Get ────────────────────────────────────────────────────────────────

  async get(memoryId: string): Promise<MemoryRecord | null> {
    const rec = await this.store.getById(memoryId);
    if (!rec) return null;
    await this.store.incrementAccessCount(memoryId);
    return toMemoryRecord(rec);
  }

  // ─── Update ─────────────────────────────────────────────────────────────

  async update(memoryId: string, params: UpdateParams): Promise<MemoryRecord> {
    const existing = await this.store.getById(memoryId);
    if (!existing) throw new Error(`Memory not found: ${memoryId}`);

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
      id: memoryId, memoryId, content,
      userId: existing.userId, agentId: existing.agentId, runId: existing.runId,
      metadata, scope: existing.scope, category: existing.category,
      createdAt: existing.createdAt,
      updatedAt: payload.updated_at as string,
      accessCount: existing.accessCount,
    };
  }

  // ─── Delete ─────────────────────────────────────────────────────────────

  async delete(memoryId: string): Promise<boolean> {
    return this.store.remove(memoryId);
  }

  // ─── GetAll ─────────────────────────────────────────────────────────────

  async getAll(params: GetAllParams = {}): Promise<MemoryListResult> {
    const filters: VectorStoreFilter = { userId: params.userId, agentId: params.agentId, runId: params.runId };
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const { records, total } = await this.store.list(filters, limit, offset, {
      sortBy: params.sortBy,
      order: params.order,
    });
    return { memories: records.map(toMemoryRecord), total, limit, offset };
  }

  // ─── Count ──────────────────────────────────────────────────────────────

  async count(params: FilterParams = {}): Promise<number> {
    return this.store.count({ userId: params.userId, agentId: params.agentId, runId: params.runId });
  }

  // ─── Batch ──────────────────────────────────────────────────────────────

  async addBatch(memories: BatchItem[], options: BatchOptions = {}): Promise<AddResult> {
    const allMemories: MemoryRecord[] = [];
    for (const item of memories) {
      const result = await this.add({
        content: item.content,
        metadata: item.metadata,
        userId: options.userId,
        agentId: options.agentId,
        runId: options.runId,
        infer: options.infer,
        scope: item.scope ?? options.scope,
        category: item.category ?? options.category,
      });
      allMemories.push(...result.memories);
    }
    return { memories: allMemories, message: `Created ${allMemories.length} memories` };
  }

  async deleteAll(params: FilterParams = {}): Promise<boolean> {
    await this.store.removeAll({ userId: params.userId, agentId: params.agentId, runId: params.runId });
    return true;
  }

  async reset(): Promise<void> {
    await this.deleteAll();
  }

  async close(): Promise<void> {
    await this.store.close();
  }

  // ─── Extended API ──────────────────────────────────────────────────────

  async getStatistics(params: FilterParams = {}): Promise<Record<string, unknown>> {
    const adapter = new StorageAdapter(this.store);
    const filters: VectorStoreFilter = { userId: params.userId, agentId: params.agentId, runId: params.runId };
    const basic = await adapter.getStatistics(filters);
    // Enrich with full stats via util
    const all = await this.getAll({ userId: params.userId, agentId: params.agentId, runId: params.runId, limit: 10000 });
    const detailed = calculateStatsFromMemories(
      all.memories as unknown as Array<Record<string, unknown>>
    );
    return { ...basic, ...detailed };
  }

  async getUsers(limit = 1000): Promise<string[]> {
    const adapter = new StorageAdapter(this.store);
    return adapter.getUniqueUsers(limit);
  }

  async optimize(strategy: string = 'exact', userId?: string, threshold = 0.95): Promise<Record<string, unknown>> {
    const optimizer = new MemoryOptimizer(this.store);
    const result = await optimizer.deduplicate(strategy as 'exact' | 'semantic', userId, threshold);
    return result as unknown as Record<string, unknown>;
  }

  async exportMemories(params: GetAllParams = {}): Promise<MemoryRecord[]> {
    const result = await this.getAll(params);
    return result.memories;
  }

  async importMemories(
    memories: Array<{ content: string; metadata?: Record<string, unknown>; userId?: string; agentId?: string }>,
    options: { infer?: boolean } = {},
  ): Promise<{ imported: number; errors: number }> {
    let imported = 0;
    let errors = 0;
    for (const m of memories) {
      try {
        await this.add({
          content: m.content,
          metadata: m.metadata,
          userId: m.userId,
          agentId: m.agentId,
          infer: options.infer ?? false,
        });
        imported++;
      } catch {
        errors++;
      }
    }
    return { imported, errors };
  }
}
