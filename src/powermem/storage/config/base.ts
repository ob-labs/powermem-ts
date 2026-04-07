/**
 * Base vector store configuration.
 * Port of Python powermem/storage/config/base.py.
 */
export interface BaseVectorStoreConfig {
  collectionName?: string;
  embeddingModelDims?: number;
}

export interface BaseGraphStoreConfig {
  provider?: string;
  embeddingModelDims?: number;
  llm?: {
    provider?: string;
    config?: Record<string, unknown>;
  };
}
