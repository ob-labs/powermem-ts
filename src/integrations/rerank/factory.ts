/**
 * Rerank factory — create RerankProvider from config or env.
 * Follows the same pattern as embeddings/factory.ts and llm/factory.ts.
 */
import type { RerankProvider } from './base.js';
import type { BaseRerankConfig } from './config/base.js';
import type { SearchHit } from '../../types/responses.js';
import type { RerankerFn } from '../../types/options.js';
import { PowerMemInitError } from '../../errors/index.js';

const RERANK_BASE_URLS: Record<string, string> = {
  jina: 'https://api.jina.ai',
  cohere: 'https://api.cohere.com',
};

export async function createReranker(config: BaseRerankConfig): Promise<RerankProvider> {
  const provider = (config.provider ?? 'jina').toLowerCase();
  const apiKey = config.apiKey;

  if (!apiKey) {
    throw new PowerMemInitError('Rerank API key is required.');
  }

  if (['jina', 'cohere', 'openai_compat', 'siliconflow'].includes(provider)) {
    const { OpenAICompatReranker } = await import('./openai-compat.js');
    const baseUrl = config.apiBaseUrl ?? RERANK_BASE_URLS[provider];
    return new OpenAICompatReranker({
      apiKey,
      model: config.model,
      baseUrl,
    });
  }

  throw new PowerMemInitError(`Unsupported rerank provider: "${provider}".`);
}

/** Create RerankProvider from environment variables. */
export async function createRerankerFromEnv(): Promise<RerankProvider> {
  return createReranker({
    provider: process.env.RERANK_PROVIDER ?? 'jina',
    apiKey: process.env.RERANK_API_KEY,
    model: process.env.RERANK_MODEL,
    apiBaseUrl: process.env.RERANK_BASE_URL,
    topN: process.env.RERANK_TOP_N ? parseInt(process.env.RERANK_TOP_N, 10) : undefined,
  });
}

/**
 * Create a RerankerFn from config — wraps a RerankProvider as the callback
 * signature NativeProvider expects.
 */
export async function createRerankerFnFromConfig(config: BaseRerankConfig): Promise<RerankerFn | undefined> {
  if (!config.provider || !config.apiKey) return undefined;
  if (config.enabled === false) return undefined;

  const reranker = await createReranker(config);
  const topN = config.topN;

  return async (query: string, hits: SearchHit[]): Promise<SearchHit[]> => {
    if (hits.length === 0) return hits;
    const documents = hits.map((h) => h.content);
    const ranked = await reranker.rerank(query, documents, topN ?? hits.length);
    // Sort by score descending and map back to SearchHit
    ranked.sort((a, b) => b.score - a.score);
    return ranked.map((r) => ({
      ...hits[r.index],
      score: r.score,
    }));
  };
}
