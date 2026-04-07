/**
 * LLM factory — create BaseChatModel from config or env.
 *
 * Uses a registry pattern to dynamically load any @langchain/* provider.
 * Users just `npm install @langchain/<package>` and set LLM_PROVIDER.
 *
 * Supported out of the box:
 *   openai, qwen, siliconflow, deepseek — via @langchain/openai (OpenAI-compat)
 *   azure, azure_openai — via @langchain/openai (AzureChatOpenAI)
 *   anthropic — via @langchain/anthropic
 *   ollama — via @langchain/ollama
 *
 * Auto-discovered (install the package and it works):
 *   gemini, google — via @langchain/google-genai
 *   bedrock, aws — via @langchain/aws
 *   mistral — via @langchain/mistralai
 *   cohere — via @langchain/cohere
 *   together, fireworks, groq — via OpenAI-compat
 */
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { PowerMemInitError } from '../../errors/index.js';

// ─── OpenAI-compatible base URLs ─────────────────────────────────────────────

const OPENAI_COMPAT_BASE_URLS: Record<string, string | undefined> = {
  openai: undefined,
  qwen: process.env.QWEN_LLM_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  siliconflow: process.env.SILICONFLOW_LLM_BASE_URL ?? 'https://api.siliconflow.cn/v1',
  deepseek: process.env.DEEPSEEK_LLM_BASE_URL ?? 'https://api.deepseek.com',
};

// ─── Provider registry ───────────────────────────────────────────────────────

interface LLMProviderEntry {
  package: string;
  className: string;
  buildArgs: (config: LLMConfig) => Record<string, unknown>;
  noApiKey?: boolean;
}

const PROVIDER_REGISTRY: Record<string, LLMProviderEntry> = {
  // ─── Azure OpenAI ────────────────────────────────────────────
  azure_openai: {
    package: '@langchain/openai',
    className: 'AzureChatOpenAI',
    buildArgs: (c) => ({
      azureOpenAIApiKey: c.apiKey,
      azureOpenAIApiDeploymentName: c.model,
      azureOpenAIApiInstanceName: c.baseUrl ?? process.env.AZURE_OPENAI_INSTANCE,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2024-02-01',
      temperature: c.temperature ?? 0.1,
      maxTokens: c.maxTokens ?? 2000,
    }),
  },
  azure: { package: '@langchain/openai', className: 'AzureChatOpenAI',
    buildArgs: (c) => PROVIDER_REGISTRY.azure_openai.buildArgs(c) },

  // ─── Google Gemini ───────────────────────────────────────────
  gemini: {
    package: '@langchain/google-genai',
    className: 'ChatGoogleGenerativeAI',
    buildArgs: (c) => ({
      apiKey: c.apiKey,
      modelName: c.model ?? 'gemini-pro',
      temperature: c.temperature ?? 0.1,
      maxOutputTokens: c.maxTokens ?? 2000,
    }),
  },
  google: { package: '@langchain/google-genai', className: 'ChatGoogleGenerativeAI',
    buildArgs: (c) => PROVIDER_REGISTRY.gemini.buildArgs(c) },
  vertex: { package: '@langchain/google-genai', className: 'ChatGoogleGenerativeAI',
    buildArgs: (c) => PROVIDER_REGISTRY.gemini.buildArgs(c) },

  // ─── AWS Bedrock ─────────────────────────────────────────────
  bedrock: {
    package: '@langchain/aws',
    className: 'ChatBedrockConverse',
    buildArgs: (c) => ({
      model: c.model ?? 'anthropic.claude-3-sonnet-20240229-v1:0',
      region: process.env.AWS_REGION ?? 'us-east-1',
      temperature: c.temperature ?? 0.1,
      maxTokens: c.maxTokens ?? 2000,
    }),
    noApiKey: true,
  },
  aws: { package: '@langchain/aws', className: 'ChatBedrockConverse',
    buildArgs: (c) => PROVIDER_REGISTRY.bedrock.buildArgs(c), noApiKey: true },

  // ─── Cohere ──────────────────────────────────────────────────
  cohere: {
    package: '@langchain/cohere',
    className: 'ChatCohere',
    buildArgs: (c) => ({
      apiKey: c.apiKey,
      model: c.model ?? 'command-r-plus',
      temperature: c.temperature ?? 0.1,
    }),
  },

  // ─── Mistral ─────────────────────────────────────────────────
  mistral: {
    package: '@langchain/mistralai',
    className: 'ChatMistralAI',
    buildArgs: (c) => ({
      apiKey: c.apiKey,
      modelName: c.model ?? 'mistral-large-latest',
      temperature: c.temperature ?? 0.1,
      maxTokens: c.maxTokens ?? 2000,
    }),
  },

  // ─── Together (OpenAI-compat) ────────────────────────────────
  together: {
    package: '@langchain/openai',
    className: 'ChatOpenAI',
    buildArgs: (c) => ({
      openAIApiKey: c.apiKey,
      modelName: c.model ?? 'meta-llama/Llama-3-70b-chat-hf',
      temperature: c.temperature ?? 0.1,
      maxTokens: c.maxTokens ?? 2000,
      configuration: { baseURL: c.baseUrl ?? 'https://api.together.xyz/v1' },
    }),
  },

  // ─── Fireworks (OpenAI-compat) ───────────────────────────────
  fireworks: {
    package: '@langchain/openai',
    className: 'ChatOpenAI',
    buildArgs: (c) => ({
      openAIApiKey: c.apiKey,
      modelName: c.model,
      temperature: c.temperature ?? 0.1,
      maxTokens: c.maxTokens ?? 2000,
      configuration: { baseURL: c.baseUrl ?? 'https://api.fireworks.ai/inference/v1' },
    }),
  },

  // ─── Groq (OpenAI-compat) ───────────────────────────────────
  groq: {
    package: '@langchain/openai',
    className: 'ChatOpenAI',
    buildArgs: (c) => ({
      openAIApiKey: c.apiKey,
      modelName: c.model ?? 'llama3-70b-8192',
      temperature: c.temperature ?? 0.1,
      maxTokens: c.maxTokens ?? 2000,
      configuration: { baseURL: c.baseUrl ?? 'https://api.groq.com/openai/v1' },
    }),
  },

  // ─── vLLM (OpenAI-compat, local) ────────────────────────────
  vllm: {
    package: '@langchain/openai',
    className: 'ChatOpenAI',
    buildArgs: (c) => ({
      openAIApiKey: c.apiKey ?? 'dummy',
      modelName: c.model,
      temperature: c.temperature ?? 0.1,
      maxTokens: c.maxTokens ?? 2000,
      configuration: { baseURL: c.baseUrl ?? 'http://localhost:8000/v1' },
    }),
    noApiKey: true,
  },

  // ─── LM Studio (OpenAI-compat, local) ───────────────────────
  lmstudio: {
    package: '@langchain/openai',
    className: 'ChatOpenAI',
    buildArgs: (c) => ({
      openAIApiKey: c.apiKey ?? 'dummy',
      modelName: c.model,
      temperature: c.temperature ?? 0.1,
      maxTokens: c.maxTokens ?? 2000,
      configuration: { baseURL: c.baseUrl ?? 'http://localhost:1234/v1' },
    }),
    noApiKey: true,
  },
};

// ─── Main factory ────────────────────────────────────────────────────────────

interface LLMConfig {
  provider: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  baseUrl?: string;
}

export async function createLLM(config: LLMConfig): Promise<BaseChatModel> {
  const provider = config.provider.toLowerCase();
  const apiKey = config.apiKey;
  const model = config.model;
  const temperature = config.temperature ?? 0.1;
  const maxTokens = config.maxTokens ?? 2000;
  const topP = config.topP ?? 0.1;

  // ─── OpenAI-compatible providers (built-in, most common) ─────
  if (['openai', 'qwen', 'siliconflow', 'deepseek'].includes(provider)) {
    if (!apiKey) throw new PowerMemInitError('LLM API key is required.');
    const { ChatOpenAI } = await import('@langchain/openai');
    const baseURL = config.baseUrl ?? OPENAI_COMPAT_BASE_URLS[provider];
    return new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: model ?? 'gpt-4o-mini',
      temperature, maxTokens, topP,
      ...(baseURL ? { configuration: { baseURL } } : {}),
    });
  }

  // ─── Anthropic (built-in peer dep) ───────────────────────────
  if (provider === 'anthropic') {
    if (!apiKey) throw new PowerMemInitError('LLM API key is required.');
    // @ts-expect-error — optional peer dependency
    const { ChatAnthropic } = await import('@langchain/anthropic');
    return new ChatAnthropic({
      anthropicApiKey: apiKey,
      modelName: model ?? 'claude-sonnet-4-20250514',
      temperature, maxTokens, topP,
    });
  }

  // ─── Ollama (built-in peer dep) ──────────────────────────────
  if (provider === 'ollama') {
    const { ChatOllama } = await import('@langchain/ollama');
    return new ChatOllama({
      model: model ?? 'llama3',
      baseUrl: config.baseUrl ?? process.env.OLLAMA_LLM_BASE_URL ?? 'http://localhost:11434',
      temperature,
      format: 'json',
    });
  }

  // ─── Registry-based dynamic loading ──────────────────────────
  const entry = PROVIDER_REGISTRY[provider];
  if (entry) {
    if (!entry.noApiKey && !apiKey) {
      throw new PowerMemInitError(`LLM API key is required for provider "${provider}".`);
    }
    try {
      const mod = await import(entry.package);
      const ChatClass = mod[entry.className];
      if (!ChatClass) {
        throw new PowerMemInitError(
          `Class "${entry.className}" not found in "${entry.package}". ` +
          `Make sure you have the correct version installed.`
        );
      }
      return new ChatClass(entry.buildArgs(config));
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
  const packageGuesses = [`@langchain/${provider}`];
  const classGuesses = [
    `Chat${provider.charAt(0).toUpperCase() + provider.slice(1)}`,
    `Chat${provider.toUpperCase()}`,
  ];

  for (const pkg of packageGuesses) {
    try {
      const mod = await import(pkg);
      for (const cls of classGuesses) {
        if (mod[cls]) {
          return new mod[cls]({ apiKey, model, temperature, maxTokens });
        }
      }
    } catch {
      // Package not installed — continue
    }
  }

  throw new PowerMemInitError(
    `Unsupported LLM provider: "${provider}". ` +
    `If this is a LangChain provider, install the package: npm install @langchain/${provider}`
  );
}

/** Create LLM from environment variables (backward compat). */
export async function createLLMFromEnv(): Promise<BaseChatModel> {
  return createLLM({
    provider: process.env.LLM_PROVIDER ?? 'openai',
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
    baseUrl: process.env.LLM_BASE_URL,
  });
}
