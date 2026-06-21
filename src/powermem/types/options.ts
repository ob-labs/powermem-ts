import type { Embeddings } from '@langchain/core/embeddings';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { SearchHit } from './responses.js';
import type { MemoryConfigInput } from '../configs.js';
import type { GraphStoreBase, VectorStore } from '../storage/base.js';
import type { SubStorageRouter } from '../storage/sub-storage.js';
import type { SourceStoreBase } from '../storage/source_store/base.js';
import type { SkillStoreBase } from '../storage/skill_store/base.js';

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
  /** Round 5: optional source store. When omitted, Memory's source-store methods return stub values (parity with Python disabled mode). */
  sourceStore?: SourceStoreBase;
  /** Round 5: optional skill store. When omitted, Memory's skill-store methods return stub values (parity with Python disabled mode). */
  skillStore?: SkillStoreBase;
}
