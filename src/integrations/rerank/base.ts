/**
 * Base rerank class — port of Python integrations/rerank/base.py.
 */
export interface RerankProvider {
  rerank(query: string, documents: string[], topN?: number): Promise<Array<{ index: number; score: number }>>;
}
