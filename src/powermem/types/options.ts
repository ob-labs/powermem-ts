import type { Embeddings } from '@langchain/core/embeddings';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { SearchHit } from './responses.js';
import type { MemoryConfigInput } from '../configs.js';
import type { GraphStoreBase, VectorStore } from '../storage/base.js';
import type { SubStorageRouter } from '../storage/sub-storage.js';

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
}
