/**
 * Base embedding class — port of Python integrations/embeddings/base.py.
 * In TS we use LangChain's Embeddings interface, so this is a thin contract.
 */
export interface EmbeddingProvider {
  embed(text: string, memoryAction?: 'add' | 'search' | 'update'): Promise<number[]>;
  embedBatch?(texts: string[]): Promise<number[][]>;
}
