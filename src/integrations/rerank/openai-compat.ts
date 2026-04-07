/**
 * OpenAI-compatible rerank provider.
 * Works with Jina, Cohere, vLLM, and other providers exposing /v1/rerank.
 */
import type { RerankProvider } from './base.js';

export interface OpenAICompatRerankConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export class OpenAICompatReranker implements RerankProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(config: OpenAICompatRerankConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'jina-reranker-v2-base-multilingual';
    this.baseUrl = (config.baseUrl ?? 'https://api.jina.ai').replace(/\/+$/, '');
  }

  async rerank(query: string, documents: string[], topN?: number): Promise<Array<{ index: number; score: number }>> {
    const response = await fetch(`${this.baseUrl}/v1/rerank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        query,
        documents,
        top_n: topN ?? documents.length,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Rerank API error (${response.status}): ${text}`);
    }

    const data = await response.json() as { results: Array<{ index: number; relevance_score: number }> };
    return data.results.map((r) => ({ index: r.index, score: r.relevance_score }));
  }
}
