import type { Embeddings } from '@langchain/core/embeddings';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { SearchHit } from './responses.js';

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
}
