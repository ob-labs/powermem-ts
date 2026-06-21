import type { Embeddings } from '@langchain/core/embeddings';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { SearchHit } from './responses.js';
import type { MemoryConfigInput } from '../configs.js';
import type { GraphStoreBase, VectorStore } from '../storage/base.js';
import type { SubStorageRouter } from '../storage/sub-storage.js';

/**
 * Minimal placeholder interfaces for source/skill store injection.
 * Full definitions live in `storage/source_store/base.ts` and
 * `storage/skill_store/base.ts` (landed in PR-3). Using inline
 * placeholders here avoids a hard dependency on those files.
 */
export interface SourceStoreBase {
  createTable(): Promise<void>;
  close(): Promise<void>;
}

export interface SkillStoreBase {
  createTable(): Promise<void>;
  close(): Promise<void>;
}

/** Reranker function: re-scores/reorders search hits after cosine similarity. */
export type RerankerFn = (
  query: string,
  hits: SearchHit[]
) => Promise<SearchHit[]>;

export interface MemoryOptions {
  config?: MemoryConfigInput;
  envFile?: string;
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
  graphStore?: GraphStoreBase;
  subStorageRouter?: SubStorageRouter;
  /** Optional source store. When omitted, Memory's source-store methods return stub values (parity with Python disabled mode). */
  sourceStore?: SourceStoreBase;
  /** Optional skill store. When omitted, Memory's skill-store methods return stub values (parity with Python disabled mode). */
  skillStore?: SkillStoreBase;
}
