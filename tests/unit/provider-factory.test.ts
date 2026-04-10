import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/powermem/settings.js', () => ({
  getDefaultEnvFile: () => undefined,
}));

import { createEmbeddingsFromEnv, createLLMFromEnv } from '../../src/powermem/integrations/factory.js';

describe('provider-factory', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };

    // Clear relevant env vars and provider aliases so tests stay hermetic.
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.EMBEDDING_API_KEY;
    delete process.env.EMBEDDING_MODEL;
    delete process.env.EMBEDDING_DIMS;
    delete process.env.OPENAI_API_KEY;
    delete process.env.QWEN_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.AZURE_OPENAI_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.SILICONFLOW_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.COHERE_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.OPENAI_EMBEDDING_BASE_URL;
    delete process.env.QWEN_EMBEDDING_BASE_URL;

    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
    delete process.env.OPENAI_LLM_BASE_URL;
    delete process.env.QWEN_LLM_BASE_URL;
    delete process.env.TOGETHER_API_KEY;
    delete process.env.GROQ_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('createEmbeddingsFromEnv', () => {
    it('throws when embedding API key is missing', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      await expect(createEmbeddingsFromEnv()).rejects.toThrow('Embedding API key is required.');
    });

    it('creates OpenAI embeddings for "openai" provider', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      process.env.EMBEDDING_API_KEY = 'test-key';
      process.env.EMBEDDING_MODEL = 'text-embedding-3-small';

      const embeddings = await createEmbeddingsFromEnv();
      expect(embeddings).toBeDefined();
    });

    it('creates OpenAI-compatible embeddings for "qwen" provider', async () => {
      process.env.EMBEDDING_PROVIDER = 'qwen';
      process.env.EMBEDDING_API_KEY = 'test-key';

      const embeddings = await createEmbeddingsFromEnv();
      expect(embeddings).toBeDefined();
    });

    it('throws for unsupported provider', async () => {
      process.env.EMBEDDING_PROVIDER = 'nonexistent';
      process.env.EMBEDDING_API_KEY = 'key';
      await expect(createEmbeddingsFromEnv()).rejects.toThrow('Unsupported');
    });

    it('throws helpful message for anthropic embeddings', async () => {
      process.env.EMBEDDING_PROVIDER = 'anthropic';
      process.env.EMBEDDING_API_KEY = 'key';
      await expect(createEmbeddingsFromEnv()).rejects.toThrow('does not provide an embeddings API');
    });
  });

  describe('createLLMFromEnv', () => {
    it('throws when LLM API key is missing', async () => {
      process.env.LLM_PROVIDER = 'openai';
      await expect(createLLMFromEnv()).rejects.toThrow('LLM API key is required.');
    });

    it('creates ChatOpenAI for "openai" provider', async () => {
      process.env.LLM_PROVIDER = 'openai';
      process.env.LLM_API_KEY = 'test-key';

      const llm = await createLLMFromEnv();
      expect(llm).toBeDefined();
    });

    it('creates ChatOpenAI for "deepseek" provider', async () => {
      process.env.LLM_PROVIDER = 'deepseek';
      process.env.LLM_API_KEY = 'test-key';

      const llm = await createLLMFromEnv();
      expect(llm).toBeDefined();
    });

    it('throws for unsupported provider', async () => {
      process.env.LLM_PROVIDER = 'nonexistent';
      process.env.LLM_API_KEY = 'key';
      await expect(createLLMFromEnv()).rejects.toThrow('Unsupported');
    });
  });
});
