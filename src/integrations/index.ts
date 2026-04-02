export { Embedder, createEmbeddings, createEmbeddingsFromEnv } from './embeddings/index.js';
export type { EmbeddingProvider, BaseEmbedderConfig } from './embeddings/index.js';
export { createLLM, createLLMFromEnv } from './llm/index.js';
export type { LLMProvider, BaseLLMConfig } from './llm/index.js';
export type { RerankProvider, BaseRerankConfig } from './rerank/index.js';

// Backward compat: re-export old factory.ts functions
export { createEmbeddingsFromEnv as _legacyCreateEmbeddingsFromEnv } from './embeddings/factory.js';
export { createLLMFromEnv as _legacyCreateLLMFromEnv } from './llm/factory.js';
