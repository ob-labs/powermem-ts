/**
 * Embedding factory — create Embeddings from config or env.
 * Split from provider-factory.ts, delegates to LangChain providers.
 */
import type { Embeddings } from '@langchain/core/embeddings';
import { PowerMemInitError } from '../../errors/index.js';

const OPENAI_COMPAT_BASE_URLS: Record<string, string | undefined> = {
  openai: undefined,
  qwen: process.env.QWEN_LLM_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  siliconflow: process.env.SILICONFLOW_LLM_BASE_URL ?? 'https://api.siliconflow.cn/v1',
  deepseek: process.env.DEEPSEEK_LLM_BASE_URL ?? 'https://api.deepseek.com',
};

export async function createEmbeddings(config: {
  provider: string;
  apiKey?: string;
  model?: string;
  embeddingDims?: number;
}): Promise<Embeddings> {
  const provider = config.provider.toLowerCase();
  const apiKey = config.apiKey;
  const model = config.model;
  const dims = config.embeddingDims;

  if (!apiKey) {
    throw new PowerMemInitError('Embedding API key is required.');
  }

  if (['openai', 'qwen', 'siliconflow', 'deepseek'].includes(provider)) {
    const { OpenAIEmbeddings } = await import('@langchain/openai');
    const baseURL = OPENAI_COMPAT_BASE_URLS[provider];
    return new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      modelName: model,
      dimensions: dims,
      ...(baseURL ? { configuration: { baseURL } } : {}),
    });
  }

  if (provider === 'anthropic') {
    throw new PowerMemInitError('Anthropic does not provide an embeddings API.');
  }

  if (provider === 'ollama') {
    const { OllamaEmbeddings } = await import('@langchain/ollama');
    return new OllamaEmbeddings({
      model: model ?? 'nomic-embed-text',
      baseUrl: process.env.OLLAMA_LLM_BASE_URL ?? 'http://localhost:11434',
    });
  }

  throw new PowerMemInitError(`Unsupported embedding provider: "${provider}".`);
}

/** Create Embeddings from environment variables (backward compat). */
export async function createEmbeddingsFromEnv(): Promise<Embeddings> {
  return createEmbeddings({
    provider: process.env.EMBEDDING_PROVIDER ?? 'openai',
    apiKey: process.env.EMBEDDING_API_KEY,
    model: process.env.EMBEDDING_MODEL,
    embeddingDims: process.env.EMBEDDING_DIMS ? parseInt(process.env.EMBEDDING_DIMS, 10) : undefined,
  });
}
