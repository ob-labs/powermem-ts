import type { Embeddings } from '@langchain/core/embeddings';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { SearchHit } from './responses.js';
import type { MemoryConfigInput } from '../configs.js';
import type { GraphStoreBase } from '../storage/base.js';
import type { SubStorageRouter } from '../storage/sub-storage.js';

export interface InitOptions {
  homeDir?: string;
  pythonPath?: string;
  powermemVersion?: string;
  pipArgs?: string[];
  verbose?: boolean;
}

/** Reranker function: re-scores/reorders search hits after cosine similarity. */
export type RerankerFn = (
  query: string,
  hits: SearchHit[]
) => Promise<SearchHit[]>;

export interface MemoryOptions {
  // ─── Config-driven (Python parity) ──────────────────────────
  /** Full config object — auto-resolved via autoConfig() if omitted. */
  config?: MemoryConfigInput;

  // ─── HttpProvider (backward compat) ──────────────────────────
  serverUrl?: string;
  apiKey?: string;
  envFile?: string;
  port?: number;
  startupTimeout?: number;
  init?: InitOptions;

  // ─── NativeProvider ──────────────────────────────────────────
  embeddings?: Embeddings;
  llm?: BaseChatModel;
  dbPath?: string;

  // ─── Custom prompts ──────────────────────────────────────────
  customFactExtractionPrompt?: string;
  customUpdateMemoryPrompt?: string;

  // ─── Behavior ────────────────────────────────────────────────
  fallbackToSimpleAdd?: boolean;
  reranker?: RerankerFn;
  enableDecay?: boolean;
  decayWeight?: number;

  // ─── SeekDB backend ─────────────────────────────────────────────
  seekdb?: SeekDBOptions;

  // ─── Graph store (optional) ────────────────────────────────────
  graphStore?: GraphStoreBase;

  // ─── Sub-storage routing (optional) ───────────────────────────
  subStorageRouter?: SubStorageRouter;
}

export interface SeekDBOptions {
  /** Path to the local seekdb database directory */
  path: string;
  /** Database name (default: "powermem") */
  database?: string;
  /** Collection name (default: "memories") */
  collectionName?: string;
  /** Distance metric (default: "cosine") */
  distance?: 'cosine' | 'l2' | 'inner_product';
  /** Embedding dimension — required for HNSW index creation */
  dimension?: number;
}
