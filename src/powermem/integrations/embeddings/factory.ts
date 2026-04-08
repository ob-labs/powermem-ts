/**
 * Embedding factory — create Embeddings from config or env.
 *
 * Uses a registry pattern to dynamically load any @langchain/* provider.
 * Users just `npm install @langchain/<package>` and set EMBEDDING_PROVIDER.
 *
 * Supported out of the box (via @langchain/core peer deps):
 *   openai, qwen, siliconflow, deepseek — via @langchain/openai (OpenAI-compat)
 *   azure, azure_openai — via @langchain/openai (AzureOpenAIEmbeddings)
 *   ollama — via @langchain/ollama
 *   anthropic — not supported (no embeddings API)
 *
 * Auto-discovered (install the package and it works):
 *   gemini, google — via @langchain/google-genai
 *   bedrock, aws — via @langchain/aws
 *   huggingface — via @langchain/community
 *   cohere — via @langchain/cohere
 *   mistral — via @langchain/mistralai
 *   together — via @langchain/community
 *   fireworks — via @langchain/community
 *   voyage — via @langchain/community
 */
import type { Embeddings } from '@langchain/core/embeddings';
import { PowerMemInitError } from '../../errors/index.js';
import { loadConfigFromEnv } from '../../config_loader.js';
import {
  BM25SparseEmbedder,
  CHINESE_STOPWORDS,
  ENGLISH_STOPWORDS,
  tokenizeCJK,
  type SparseEmbedder,
} from './sparse.js';

// ─── OpenAI-compatible base URLs ─────────────────────────────────────────────

const OPENAI_COMPAT_BASE_URLS: Record<string, string | undefined> = {
  openai: undefined,
  qwen: process.env.QWEN_EMBEDDING_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  siliconflow: process.env.SILICONFLOW_EMBEDDING_BASE_URL ?? 'https://api.siliconflow.cn/v1',
  deepseek: process.env.DEEPSEEK_EMBEDDING_BASE_URL ?? 'https://api.deepseek.com',
};

// ─── Provider registry ───────────────────────────────────────────────────────

interface EmbeddingProviderEntry {
  /** npm package to dynamic-import */
  package: string;
  /** Export name of the Embeddings class */
  className: string;
  /** Build constructor args from config */
  buildArgs: (config: EmbeddingConfig) => Record<string, unknown>;
  /** Set to true if API key is not required (e.g. Ollama) */
  noApiKey?: boolean;
}

const PROVIDER_REGISTRY: Record<string, EmbeddingProviderEntry> = {
  // ─── Azure OpenAI ────────────────────────────────────────────
  azure_openai: {
    package: '@langchain/openai',
    className: 'AzureOpenAIEmbeddings',
    buildArgs: (c) => ({
      azureOpenAIApiKey: c.apiKey,
      azureOpenAIApiDeploymentName: c.model,
      azureOpenAIApiInstanceName: c.azureOpenAIApiInstanceName ?? c.baseUrl,
      azureOpenAIApiVersion: c.azureOpenAIApiVersion ?? '2024-02-01',
      dimensions: c.embeddingDims,
    }),
  },
  azure: { package: '@langchain/openai', className: 'AzureOpenAIEmbeddings',
    buildArgs: (c) => PROVIDER_REGISTRY.azure_openai.buildArgs(c) },

  // ─── Google Gemini ───────────────────────────────────────────
  gemini: {
    package: '@langchain/google-genai',
    className: 'GoogleGenerativeAIEmbeddings',
    buildArgs: (c) => ({ apiKey: c.apiKey, modelName: c.model ?? 'text-embedding-004' }),
  },
  google: { package: '@langchain/google-genai', className: 'GoogleGenerativeAIEmbeddings',
    buildArgs: (c) => PROVIDER_REGISTRY.gemini.buildArgs(c) },
  vertex: { package: '@langchain/google-genai', className: 'GoogleGenerativeAIEmbeddings',
    buildArgs: (c) => PROVIDER_REGISTRY.gemini.buildArgs(c) },

  // ─── AWS Bedrock ─────────────────────────────────────────────
  bedrock: {
    package: '@langchain/aws',
    className: 'BedrockEmbeddings',
    buildArgs: (c) => ({
      model: c.model ?? 'amazon.titan-embed-text-v1',
      region: c.region ?? 'us-east-1',
    }),
    noApiKey: true,
  },
  aws: { package: '@langchain/aws', className: 'BedrockEmbeddings',
    buildArgs: (c) => PROVIDER_REGISTRY.bedrock.buildArgs(c), noApiKey: true },

  // ─── Cohere ──────────────────────────────────────────────────
  cohere: {
    package: '@langchain/cohere',
    className: 'CohereEmbeddings',
    buildArgs: (c) => ({ apiKey: c.apiKey, model: c.model ?? 'embed-english-v3.0' }),
  },

  // ─── Mistral ─────────────────────────────────────────────────
  mistral: {
    package: '@langchain/mistralai',
    className: 'MistralAIEmbeddings',
    buildArgs: (c) => ({ apiKey: c.apiKey, model: c.model ?? 'mistral-embed' }),
  },

  // ─── HuggingFace (via community) ─────────────────────────────
  huggingface: {
    package: '@langchain/community/embeddings/hf',
    className: 'HuggingFaceInferenceEmbeddings',
    buildArgs: (c) => ({ apiKey: c.apiKey, model: c.model }),
  },

  // ─── Together (via community, OpenAI compat) ─────────────────
  together: {
    package: '@langchain/openai',
    className: 'OpenAIEmbeddings',
    buildArgs: (c) => ({
      openAIApiKey: c.apiKey,
      modelName: c.model,
      dimensions: c.embeddingDims,
      configuration: { baseURL: c.baseUrl ?? 'https://api.together.xyz/v1' },
    }),
  },

  // ─── Fireworks (via OpenAI compat) ───────────────────────────
  fireworks: {
    package: '@langchain/openai',
    className: 'OpenAIEmbeddings',
    buildArgs: (c) => ({
      openAIApiKey: c.apiKey,
      modelName: c.model,
      dimensions: c.embeddingDims,
      configuration: { baseURL: c.baseUrl ?? 'https://api.fireworks.ai/inference/v1' },
    }),
  },

  // ─── Voyage ──────────────────────────────────────────────────
  voyage: {
    package: '@langchain/openai',
    className: 'OpenAIEmbeddings',
    buildArgs: (c) => ({
      openAIApiKey: c.apiKey,
      modelName: c.model ?? 'voyage-3',
      configuration: { baseURL: c.baseUrl ?? 'https://api.voyageai.com/v1' },
    }),
  },
};

// ─── Main factory ────────────────────────────────────────────────────────────

interface EmbeddingConfig {
  provider: string;
  apiKey?: string;
  model?: string;
  embeddingDims?: number;
  baseUrl?: string;
  azureOpenAIApiInstanceName?: string;
  azureOpenAIApiVersion?: string;
  region?: string;
}

interface SparseEmbeddingConfig {
  provider: string;
  vocabSize?: number;
  k1?: number;
  b?: number;
  tokenizer?: 'default' | 'cjk';
}

export async function createEmbeddings(config: EmbeddingConfig): Promise<Embeddings> {
  const provider = config.provider.toLowerCase();
  const apiKey = config.apiKey;
  const model = config.model;
  const dims = config.embeddingDims;

  // ─── OpenAI-compatible providers (built-in, most common) ─────
  if (['openai', 'qwen', 'siliconflow', 'deepseek'].includes(provider)) {
    if (!apiKey) throw new PowerMemInitError('Embedding API key is required.');
    const { OpenAIEmbeddings } = await import('@langchain/openai');
    const baseURL = config.baseUrl ?? OPENAI_COMPAT_BASE_URLS[provider];
    return new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      modelName: model,
      dimensions: dims,
      ...(baseURL ? { configuration: { baseURL } } : {}),
    });
  }

  // ─── Anthropic — no embeddings API ───────────────────────────
  if (provider === 'anthropic') {
    throw new PowerMemInitError('Anthropic does not provide an embeddings API.');
  }

  // ─── Ollama (built-in, no API key needed) ────────────────────
  if (provider === 'ollama') {
    const { OllamaEmbeddings } = await import('@langchain/ollama');
    return new OllamaEmbeddings({
      model: model ?? 'nomic-embed-text',
      baseUrl: config.baseUrl ?? process.env.OLLAMA_EMBEDDING_BASE_URL ?? 'http://localhost:11434',
    });
  }

  // ─── Registry-based dynamic loading ──────────────────────────
  const entry = PROVIDER_REGISTRY[provider];
  if (entry) {
    if (!entry.noApiKey && !apiKey) {
      throw new PowerMemInitError(`Embedding API key is required for provider "${provider}".`);
    }
    try {
      const mod = await import(entry.package);
      const EmbeddingClass = mod[entry.className];
      if (!EmbeddingClass) {
        throw new PowerMemInitError(
          `Class "${entry.className}" not found in "${entry.package}". ` +
          `Make sure you have the correct version installed.`
        );
      }
      return new EmbeddingClass(entry.buildArgs({ ...config, apiKey, model, embeddingDims: dims }));
    } catch (err) {
      if ((err as any)?.code === 'ERR_MODULE_NOT_FOUND' || (err as any)?.code === 'MODULE_NOT_FOUND') {
        throw new PowerMemInitError(
          `Provider "${provider}" requires package "${entry.package}". ` +
          `Install it: npm install ${entry.package}`
        );
      }
      throw err;
    }
  }

  // ─── Generic LangChain auto-discovery ────────────────────────
  // Try @langchain/<provider> with common class name patterns
  const packageGuesses = [`@langchain/${provider}`];
  const classGuesses = [
    `${provider.charAt(0).toUpperCase() + provider.slice(1)}Embeddings`,
    `${provider.toUpperCase()}Embeddings`,
  ];

  for (const pkg of packageGuesses) {
    try {
      const mod = await import(pkg);
      for (const cls of classGuesses) {
        if (mod[cls]) {
          return new mod[cls]({ apiKey, model, ...(dims ? { dimensions: dims } : {}) });
        }
      }
      // Try default export
      if (mod.default && typeof mod.default === 'function') {
        return new mod.default({ apiKey, model, ...(dims ? { dimensions: dims } : {}) });
      }
    } catch {
      // Package not installed — continue
    }
  }

  throw new PowerMemInitError(
    `Unsupported embedding provider: "${provider}". ` +
    `If this is a LangChain provider, install the package: npm install @langchain/${provider}`
  );
}

/** Create Embeddings from environment variables (backward compat). */
export async function createEmbeddingsFromEnv(): Promise<Embeddings> {
  const config = loadConfigFromEnv().embedder ?? { provider: 'qwen', config: {} };
  const configValues = (config.config ?? {}) as Record<string, unknown>;
  if (!('apiKey' in configValues) || !configValues.apiKey) {
    throw new PowerMemInitError(
      'EMBEDDING_API_KEY is required. Set it in your .env file or environment.'
    );
  }
  return createEmbeddings({
    provider: config.provider,
    ...configValues,
  } as EmbeddingConfig);
}

export async function createSparseEmbedder(config: SparseEmbeddingConfig): Promise<SparseEmbedder> {
  const provider = config.provider.toLowerCase();
  if (provider === 'bm25' || provider === 'default') {
    return new BM25SparseEmbedder({
      k1: config.k1,
      b: config.b,
      vocabSize: config.vocabSize,
    });
  }
  if (provider === 'bm25_cjk' || provider === 'cjk') {
    const stopwords = new Set([...ENGLISH_STOPWORDS, ...CHINESE_STOPWORDS]);
    return new BM25SparseEmbedder({
      k1: config.k1,
      b: config.b,
      vocabSize: config.vocabSize,
      stopwords,
      tokenizer: (text: string) => tokenizeCJK(text, stopwords),
    });
  }
  throw new PowerMemInitError(`Unsupported sparse embedder provider: "${provider}".`);
}
