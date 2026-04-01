import type { Embeddings } from '@langchain/core/embeddings';

export class Embedder {
  constructor(private readonly embeddings: Embeddings) {}

  /** Embed a single text, replacing newlines with spaces (matching Python behavior). */
  async embed(text: string): Promise<number[]> {
    const cleaned = text.replace(/\n/g, ' ');
    return this.embeddings.embedQuery(cleaned);
  }

  /** Embed multiple texts in batch. */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const cleaned = texts.map((t) => t.replace(/\n/g, ' '));
    return this.embeddings.embedDocuments(cleaned);
  }
}
