/**
 * Config loader tests — port of Python unit/test_config_loader.py
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { parseMemoryConfig, validateConfig, MemoryConfigSchema } from '../../src/powermem/configs.js';
import { loadConfigFromEnv, autoConfig, createConfig } from '../../src/powermem/config_loader.js';
import { getVersion } from '../../src/powermem/version.js';

describe('version', () => {
  it('returns a semver string', () => {
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('MemoryConfig parsing', () => {
  it('parses minimal config with defaults', () => {
    const config = parseMemoryConfig({});
    expect(config.vectorStore.provider).toBe('sqlite');
    expect(config.llm.provider).toBe('qwen');
    expect(config.embedder.provider).toBe('qwen');
    expect(config.version).toBe('v1.1');
  });

  it('applies sub-config defaults', () => {
    const config = parseMemoryConfig({});
    expect(config.intelligentMemory).toBeDefined();
    expect(config.intelligentMemory!.enabled).toBe(true);
    expect(config.intelligentMemory!.decayRate).toBe(0.1);
    expect(config.intelligentMemory!.fallbackToSimpleAdd).toBe(false);
    expect(config.agentMemory).toBeDefined();
    expect(config.agentMemory!.mode).toBe('multi_agent');
    expect(config.telemetry).toBeDefined();
    expect(config.telemetry!.enableTelemetry).toBe(false);
    expect(config.audit).toBeDefined();
    expect(config.audit!.enabled).toBe(true);
    expect(config.logging).toBeDefined();
    expect(config.queryRewrite).toBeDefined();
    expect(config.queryRewrite!.enabled).toBe(false);
  });

  it('overrides defaults with explicit values', () => {
    const config = parseMemoryConfig({
      vectorStore: { provider: 'seekdb', config: { path: '/tmp/db' } },
      llm: { provider: 'openai', config: { apiKey: 'sk-test' } },
      intelligentMemory: { enabled: false, fallbackToSimpleAdd: true },
    });
    expect(config.vectorStore.provider).toBe('seekdb');
    expect(config.vectorStore.config.path).toBe('/tmp/db');
    expect(config.llm.provider).toBe('openai');
    expect(config.intelligentMemory!.enabled).toBe(false);
    expect(config.intelligentMemory!.fallbackToSimpleAdd).toBe(true);
  });

  it('accepts custom prompts', () => {
    const config = parseMemoryConfig({
      customFactExtractionPrompt: 'My custom prompt',
      customUpdateMemoryPrompt: 'My update prompt',
    });
    expect(config.customFactExtractionPrompt).toBe('My custom prompt');
    expect(config.customUpdateMemoryPrompt).toBe('My update prompt');
  });
});

describe('validateConfig', () => {
  it('returns true for valid config', () => {
    expect(validateConfig({
      vectorStore: { provider: 'sqlite', config: {} },
      llm: { provider: 'qwen', config: {} },
      embedder: { provider: 'qwen', config: {} },
    })).toBe(true);
  });

  it('returns false when missing required sections', () => {
    expect(validateConfig({})).toBe(false);
    expect(validateConfig({ vectorStore: { provider: 'sqlite', config: {} } })).toBe(false);
  });

  it('returns false when provider is missing', () => {
    expect(validateConfig({
      vectorStore: { config: {} },
      llm: { provider: 'qwen', config: {} },
      embedder: { provider: 'qwen', config: {} },
    })).toBe(false);
  });
});

describe('loadConfigFromEnv', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('LLM_') || key.startsWith('EMBEDDING_') || key.startsWith('DATABASE_') ||
          key.startsWith('INTELLIGENT_MEMORY_') || key.startsWith('RERANKER_') ||
          key === 'POWERMEM_ENV_FILE') {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('loads LLM config from env', () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.LLM_API_KEY = 'sk-test';
    process.env.LLM_MODEL = 'gpt-4o';

    const config = loadConfigFromEnv();
    expect(config.llm!.provider).toBe('openai');
    expect(config.llm!.config.apiKey).toBe('sk-test');
    expect(config.llm!.config.model).toBe('gpt-4o');
  });

  it('loads embedding config from env', () => {
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.EMBEDDING_API_KEY = 'sk-embed';
    process.env.EMBEDDING_MODEL = 'text-embedding-3-small';
    process.env.EMBEDDING_DIMS = '1536';

    const config = loadConfigFromEnv();
    expect(config.embedder!.provider).toBe('openai');
    expect(config.embedder!.config.apiKey).toBe('sk-embed');
    expect(config.embedder!.config.embeddingDims).toBe(1536);
  });

  it('loads database config from env', () => {
    process.env.DATABASE_PROVIDER = 'sqlite';
    process.env.SQLITE_PATH = '/tmp/test.db';

    const config = loadConfigFromEnv();
    expect(config.vectorStore!.provider).toBe('sqlite');
    expect(config.vectorStore!.config.path).toBe('/tmp/test.db');
  });

  it('defaults to sqlite when no DATABASE_PROVIDER', () => {
    const config = loadConfigFromEnv();
    expect(config.vectorStore!.provider).toBe('sqlite');
  });

  it('loads intelligent memory settings from env', () => {
    process.env.INTELLIGENT_MEMORY_ENABLED = 'false';
    process.env.INTELLIGENT_MEMORY_FALLBACK_TO_SIMPLE_ADD = 'true';
    process.env.INTELLIGENT_MEMORY_DECAY_RATE = '0.2';

    const config = loadConfigFromEnv();
    expect(config.intelligentMemory).toBeDefined();
    expect(config.intelligentMemory!.enabled).toBe(false);
    expect(config.intelligentMemory!.fallbackToSimpleAdd).toBe(true);
    expect(config.intelligentMemory!.decayRate).toBe(0.2);
  });

  it('loads reranker when env is set', () => {
    process.env.RERANKER_PROVIDER = 'qwen';
    const config = loadConfigFromEnv();
    expect(config.reranker).toBeDefined();
    expect(config.reranker!.provider).toBe('qwen');
  });

  it('no reranker when env not set', () => {
    const config = loadConfigFromEnv();
    expect(config.reranker).toBeUndefined();
  });

  it('autoConfig is alias for loadConfigFromEnv', () => {
    process.env.LLM_PROVIDER = 'anthropic';
    const c1 = loadConfigFromEnv();
    const c2 = autoConfig();
    expect(c1.llm!.provider).toBe(c2.llm!.provider);
  });
});

describe('createConfig', () => {
  it('creates config with defaults', () => {
    const config = createConfig();
    expect(config.vectorStore!.provider).toBe('sqlite');
    expect(config.llm!.provider).toBe('qwen');
    expect(config.embedder!.provider).toBe('qwen');
  });

  it('creates config with overrides', () => {
    const config = createConfig({
      databaseProvider: 'seekdb',
      llmProvider: 'openai',
      llmApiKey: 'sk-test',
      llmModel: 'gpt-4o',
      embeddingProvider: 'openai',
      embeddingDims: 768,
    });
    expect(config.vectorStore!.provider).toBe('seekdb');
    expect(config.llm!.provider).toBe('openai');
    expect(config.llm!.config.apiKey).toBe('sk-test');
    expect(config.embedder!.config.embeddingDims).toBe(768);
  });
});
