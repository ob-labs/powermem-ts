import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEmbeddingsFromEnv, createLLMFromEnv } from '../../src/powermem/integrations/factory.js';

describe('provider-factory', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env.EMBEDDING_PROVIDER;
    delete process.env.EMBEDDING_API_KEY;
    delete process.env.EMBEDDING_MODEL;
    delete process.env.EMBEDDING_DIMS;
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('createEmbeddingsFromEnv', () => {
    it('throws when EMBEDDING_API_KEY is missing', async () => {
      process.env.EMBEDDING_PROVIDER = 'openai';
      await expect(createEmbeddingsFromEnv()).rejects.toThrow('Embedding API key is required');
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
    it('throws when LLM_API_KEY is missing', async () => {
      process.env.LLM_PROVIDER = 'openai';
      await expect(createLLMFromEnv()).rejects.toThrow('LLM API key is required');
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
