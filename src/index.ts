export { Memory, Memory as AsyncMemory } from './core/memory.js';
export { NativeProvider } from './core/native-provider.js';
export { SeekDBStore } from './storage/seekdb/seekdb.js';
export type { SeekDBStoreOptions } from './storage/seekdb/seekdb.js';

export type { MemoryProvider } from './core/provider.js';
export type {
  VectorStore,
  VectorStoreRecord,
  VectorStoreFilter,
  VectorStoreSearchMatch,
  VectorStoreListOptions,
} from './storage/base.js';

export type {
  MemoryRecord,
  MemoryContent,
  MessageInput,
  ContentPart,
  AddParams,
  SearchParams,
  UpdateParams,
  GetAllParams,
  FilterParams,
  BatchItem,
  BatchOptions,
} from './types/memory.js';

export { extractTextFromContent, hasVisionContent, hasAudioContent, extractImageUrls, parseVisionMessages, parseAudioMessages } from './utils/messages.js';

export type {
  AddResult,
  SearchHit,
  SearchResult,
  MemoryListResult,
} from './types/responses.js';

export type { InitOptions, MemoryOptions, RerankerFn, SeekDBOptions } from './types/options.js';

export {
  PowerMemError,
  PowerMemInitError,
  PowerMemStartupError,
  PowerMemConnectionError,
  PowerMemAPIError,
} from './errors/index.js';

// ─── Config ───────────────────────────────────────────────────────────────
export { parseMemoryConfig, validateConfig } from './configs.js';
export type { MemoryConfig, MemoryConfigInput, IntelligentMemoryConfig } from './configs.js';
export { autoConfig, loadConfigFromEnv, createConfig } from './config-loader.js';
export { getVersion, VERSION } from './version.js';

// ─── Storage ──────────────────────────────────────────────────────────────
export { SQLiteStore } from './storage/sqlite/sqlite.js';
export { PgVectorStore } from './storage/pgvector/pgvector.js';
export type { PgVectorStoreOptions } from './storage/pgvector/pgvector.js';
export { VectorStoreFactory } from './storage/factory.js';
export { StorageAdapter } from './storage/adapter.js';
export type { GraphStoreBase } from './storage/base.js';

// ─── Integrations ─────────────────────────────────────────────────────────
export { Embedder, createEmbeddings, createEmbeddingsFromEnv } from './integrations/index.js';
export { createLLM, createLLMFromEnv } from './integrations/index.js';
export { OpenAICompatReranker, createReranker, createRerankerFromEnv, createRerankerFnFromConfig } from './integrations/index.js';
export type { RerankProvider, BaseRerankConfig } from './integrations/index.js';
export type { SparseEmbedding, SparseEmbedder, BM25Config } from './integrations/embeddings/sparse.js';
export { BM25SparseEmbedder, tokenize, tokenizeCJK, sparseDotProduct, ENGLISH_STOPWORDS, CHINESE_STOPWORDS } from './integrations/embeddings/sparse.js';

// ─── Intelligence ─────────────────────────────────────────────────────────
export { MemoryOptimizer, ImportanceEvaluator, IntelligenceManager } from './intelligence/index.js';
export { computeDecayFactor, applyDecay } from './intelligence/index.js';

// ─── Agent ────────────────────────────────────────────────────────────────
export { AgentMemory } from './agent/index.js';
export type { AgentMemoryConfig } from './agent/index.js';
export { MemoryScope, AccessPermission, PrivacyLevel, MemoryType } from './agent/index.js';

// ─── User Memory ──────────────────────────────────────────────────────────
export { UserMemory } from './user-memory/index.js';
export { SQLiteUserProfileStore } from './user-memory/index.js';
export { QueryRewriter } from './user-memory/index.js';
export type { UserProfile, UserProfileStore } from './user-memory/index.js';

// ─── Observability ───────────────────────────────────────────────────────
export { TelemetryCollector, AuditLogger } from './observability/index.js';
export type { TelemetryEvent, AuditEntry } from './observability/index.js';

// ─── Sub-storage ─────────────────────────────────────────────────────────
export { SubStorageRouter, SubStoreMigrationManager } from './storage/sub-storage.js';
export type { SubStoreConfig, MigrationState, MigrationResult, MigrationStatus } from './storage/sub-storage.js';

// ─── Utils ────────────────────────────────────────────────────────────────
export { calculateStatsFromMemories } from './utils/stats.js';
export { parseAdvancedFilters } from './utils/filter-parser.js';
export { cosineSimilarity } from './utils/search.js';
