/**
 * LLM factory — create BaseChatModel from config or env.
 * Split from provider-factory.ts, delegates to LangChain providers.
 */
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { PowerMemInitError } from '../../errors/index.js';

const OPENAI_COMPAT_BASE_URLS: Record<string, string | undefined> = {
  openai: undefined,
  qwen: process.env.QWEN_LLM_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  siliconflow: process.env.SILICONFLOW_LLM_BASE_URL ?? 'https://api.siliconflow.cn/v1',
  deepseek: process.env.DEEPSEEK_LLM_BASE_URL ?? 'https://api.deepseek.com',
};

export async function createLLM(config: {
  provider: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}): Promise<BaseChatModel> {
  const provider = config.provider.toLowerCase();
  const apiKey = config.apiKey;
  const model = config.model;
  const temperature = config.temperature ?? 0.1;
  const maxTokens = config.maxTokens ?? 2000;
  const topP = config.topP ?? 0.1;

  if (!apiKey) {
    throw new PowerMemInitError('LLM API key is required.');
  }

  if (['openai', 'qwen', 'siliconflow', 'deepseek'].includes(provider)) {
    const { ChatOpenAI } = await import('@langchain/openai');
    const baseURL = OPENAI_COMPAT_BASE_URLS[provider];
    return new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: model ?? 'gpt-4o-mini',
      temperature, maxTokens, topP,
      ...(baseURL ? { configuration: { baseURL } } : {}),
    });
  }

  if (provider === 'anthropic') {
    // @ts-expect-error — optional peer dependency
    const { ChatAnthropic } = await import('@langchain/anthropic');
    return new ChatAnthropic({
      anthropicApiKey: apiKey,
      modelName: model ?? 'claude-sonnet-4-20250514',
      temperature, maxTokens, topP,
    });
  }

  if (provider === 'ollama') {
    const { ChatOllama } = await import('@langchain/ollama');
    return new ChatOllama({
      model: model ?? 'llama3',
      baseUrl: process.env.OLLAMA_LLM_BASE_URL ?? 'http://localhost:11434',
      temperature,
      format: 'json',
    });
  }

  throw new PowerMemInitError(`Unsupported LLM provider: "${provider}".`);
}

/** Create LLM from environment variables (backward compat). */
export async function createLLMFromEnv(): Promise<BaseChatModel> {
  return createLLM({
    provider: process.env.LLM_PROVIDER ?? 'openai',
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL,
  });
}
