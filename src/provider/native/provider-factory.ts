import type { Embeddings } from '@langchain/core/embeddings';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { PowerMemInitError } from '../../errors/index.js';

/** Base URL mapping for OpenAI-compatible providers. */
const OPENAI_COMPAT_BASE_URLS: Record<string, string | undefined> = {
  openai: undefined, // uses default
  qwen: process.env.QWEN_LLM_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  siliconflow: process.env.SILICONFLOW_LLM_BASE_URL ?? 'https://api.siliconflow.cn/v1',
  deepseek: process.env.DEEPSEEK_LLM_BASE_URL ?? 'https://api.deepseek.com',
};

const OPENAI_COMPAT_EMBEDDING_BASE_URLS: Record<string, string | undefined> = {
  openai: undefined,
  qwen: process.env.QWEN_LLM_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  siliconflow: process.env.SILICONFLOW_LLM_BASE_URL ?? 'https://api.siliconflow.cn/v1',
  deepseek: process.env.DEEPSEEK_LLM_BASE_URL ?? 'https://api.deepseek.com',
};

/** Create an Embeddings instance from environment variables. */
export async function createEmbeddingsFromEnv(): Promise<Embeddings> {
  const provider = (process.env.EMBEDDING_PROVIDER ?? 'openai').toLowerCase();
  const apiKey = process.env.EMBEDDING_API_KEY;
  const model = process.env.EMBEDDING_MODEL;
  const dims = process.env.EMBEDDING_DIMS ? parseInt(process.env.EMBEDDING_DIMS, 10) : undefined;

  if (!apiKey) {
    throw new PowerMemInitError(
      `EMBEDDING_API_KEY is required. Set it in your .env file or environment.`
    );
  }

  if (['openai', 'qwen', 'siliconflow', 'deepseek'].includes(provider)) {
    try {
      const { OpenAIEmbeddings } = await import('@langchain/openai');
      const baseURL = OPENAI_COMPAT_EMBEDDING_BASE_URLS[provider];
      return new OpenAIEmbeddings({
        openAIApiKey: apiKey,
        modelName: model,
        dimensions: dims,
        ...(baseURL ? { configuration: { baseURL } } : {}),
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' ||
          (err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
        throw new PowerMemInitError(
          `Provider "${provider}" requires @langchain/openai. Install it: npm install @langchain/openai`
        );
      }
      throw err;
    }
  }

  if (provider === 'anthropic') {
    throw new PowerMemInitError(
      'Anthropic does not provide an embeddings API. Use a different EMBEDDING_PROVIDER (e.g., openai, qwen).'
    );
  }

  if (provider === 'ollama') {
    try {
      const { OllamaEmbeddings } = await import('@langchain/ollama');
      return new OllamaEmbeddings({
        model: model ?? 'nomic-embed-text',
        baseUrl: process.env.OLLAMA_LLM_BASE_URL ?? 'http://localhost:11434',
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' ||
          (err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
        throw new PowerMemInitError(
          `Provider "ollama" requires @langchain/ollama. Install it: npm install @langchain/ollama`
        );
      }
      throw err;
    }
  }

  throw new PowerMemInitError(
    `Unsupported EMBEDDING_PROVIDER: "${provider}". Supported: openai, qwen, siliconflow, deepseek, ollama.`
  );
}

/** Create a BaseChatModel instance from environment variables. */
export async function createLLMFromEnv(): Promise<BaseChatModel> {
  const provider = (process.env.LLM_PROVIDER ?? 'openai').toLowerCase();
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;

  if (!apiKey) {
    throw new PowerMemInitError(
      `LLM_API_KEY is required for the "infer" feature. Set it in your .env file or environment, or pass infer: false when adding memories.`
    );
  }

  if (['openai', 'qwen', 'siliconflow', 'deepseek'].includes(provider)) {
    try {
      const { ChatOpenAI } = await import('@langchain/openai');
      const baseURL = OPENAI_COMPAT_BASE_URLS[provider];
      return new ChatOpenAI({
        openAIApiKey: apiKey,
        modelName: model ?? 'gpt-4o-mini',
        temperature: 0.1,
        maxTokens: 2000,
        topP: 0.1,
        ...(baseURL ? { configuration: { baseURL } } : {}),
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' ||
          (err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
        throw new PowerMemInitError(
          `Provider "${provider}" requires @langchain/openai. Install it: npm install @langchain/openai`
        );
      }
      throw err;
    }
  }

  if (provider === 'anthropic') {
    try {
      // @ts-expect-error — optional peer dependency
      const { ChatAnthropic } = await import('@langchain/anthropic');
      return new ChatAnthropic({
        anthropicApiKey: apiKey,
        modelName: model ?? 'claude-sonnet-4-20250514',
        temperature: 0.1,
        maxTokens: 2000,
        topP: 0.1,
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' ||
          (err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
        throw new PowerMemInitError(
          `Provider "anthropic" requires @langchain/anthropic. Install it: npm install @langchain/anthropic`
        );
      }
      throw err;
    }
  }

  if (provider === 'ollama') {
    try {
      const { ChatOllama } = await import('@langchain/ollama');
      return new ChatOllama({
        model: model ?? 'llama3',
        baseUrl: process.env.OLLAMA_LLM_BASE_URL ?? 'http://localhost:11434',
        temperature: 0.1,
        format: 'json', // Ollama requires JSON mode at construction, not via call options
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' ||
          (err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
        throw new PowerMemInitError(
          `Provider "ollama" requires @langchain/ollama. Install it: npm install @langchain/ollama`
        );
      }
      throw err;
    }
  }

  throw new PowerMemInitError(
    `Unsupported LLM_PROVIDER: "${provider}". Supported: openai, qwen, siliconflow, deepseek, anthropic, ollama.`
  );
}
