import { describe, it, expect } from 'vitest';
import { createReranker, createRerankerFnFromConfig } from '../../src/integrations/rerank/factory.js';
import { OpenAICompatReranker } from '../../src/integrations/rerank/openai-compat.js';

describe('createReranker', () => {
  it('creates Jina reranker instance', async () => {
    const r = await createReranker({ provider: 'jina', apiKey: 'test-key' });
    expect(r).toBeInstanceOf(OpenAICompatReranker);
    expect(typeof r.rerank).toBe('function');
  });

  it('creates Cohere reranker', async () => {
    const r = await createReranker({ provider: 'cohere', apiKey: 'test-key' });
    expect(typeof r.rerank).toBe('function');
  });

  it('creates SiliconFlow reranker', async () => {
    const r = await createReranker({ provider: 'siliconflow', apiKey: 'test-key' });
    expect(typeof r.rerank).toBe('function');
  });

  it('throws on missing API key', async () => {
    await expect(createReranker({ provider: 'jina' })).rejects.toThrow('API key');
  });

  it('throws on unsupported provider', async () => {
    await expect(createReranker({ provider: 'nonexistent', apiKey: 'k' })).rejects.toThrow('Unsupported');
  });
});

describe('createRerankerFnFromConfig', () => {
  it('returns undefined when disabled', async () => {
    const fn = await createRerankerFnFromConfig({ provider: 'jina', apiKey: 'k', enabled: false });
    expect(fn).toBeUndefined();
  });

  it('returns undefined when no provider', async () => {
    const fn = await createRerankerFnFromConfig({});
    expect(fn).toBeUndefined();
  });

  it('returns function when enabled', async () => {
    const fn = await createRerankerFnFromConfig({ provider: 'jina', apiKey: 'k', enabled: true });
    expect(typeof fn).toBe('function');
  });
});
