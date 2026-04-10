/**
 * Config loader tests — port of Python unit/test_config_loader.py
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseMemoryConfig, validateConfig } from '../../src/powermem/configs.js';
import { loadConfigFromEnv, autoConfig, createConfig } from '../../src/powermem/config_loader.js';
import { getVersion } from '../../src/powermem/version.js';

const { getDefaultEnvFileMock } = vi.hoisted(() => ({
  getDefaultEnvFileMock: vi.fn<() => string | undefined>(() => undefined),
}));

vi.mock('../../src/powermem/settings.js', () => ({
  getDefaultEnvFile: getDefaultEnvFileMock,
}));

describe('version', () => {
  it('returns a semver string', () => {
    expect(getVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('MemoryConfig parsing', () => {
  it('parses minimal config with defaults', () => {
    const config = parseMemoryConfig({});
    expect(config.vectorStore.provider).toBe('seekdb');
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
    expect(config.agentMemory!.mode).toBe('auto');
    expect(config.agentMemory!.defaultScope).toBe('agent_group');
    expect(config.telemetry).toBeDefined();
    expect(config.telemetry!.enableTelemetry).toBe(false);
    expect(config.audit).toBeDefined();
    expect(config.audit!.enabled).toBe(true);
    expect(config.logging).toBeDefined();
    expect(config.queryRewrite).toBeDefined();
    expect(config.queryRewrite!.enabled).toBe(false);
    expect(config.performance).toBeDefined();
    expect(config.security).toBeDefined();
    expect(config.memoryDecay).toBeDefined();
    expect(config.timezone).toBeDefined();
  });

  it('overrides defaults with explicit values', () => {
    const config = parseMemoryConfig({
      vectorStore: { provider: 'oceanbase', config: { obPath: '/tmp/db' } },
      llm: { provider: 'openai', config: { apiKey: 'sk-test' } },
      intelligentMemory: { enabled: false, fallbackToSimpleAdd: true },
    });
    expect(config.vectorStore.provider).toBe('oceanbase');
    expect(config.vectorStore.config.obPath).toBe('/tmp/db');
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
  const clearPrefixes = [
    'LLM_',
    'EMBEDDING_',
    'DATABASE_',
    'SEEKDB_',
    'SQLITE_',
    'INTELLIGENT_MEMORY_',
    'RERANKER_',
    'GRAPH_STORE_',
    'AGENT_',
    'TELEMETRY_',
    'AUDIT_',
    'LOGGING_',
    'MEMORY_',
    'VECTOR_STORE_',
    'ACCESS_CONTROL_',
    'ENCRYPTION_',
    'POSTGRES_',
    'OCEANBASE_',
    'OPENAI_',
    'QWEN_',
    'DASHSCOPE_',
    'AZURE_OPENAI_',
    'DEEPSEEK_',
    'SILICONFLOW_',
    'GOOGLE_',
    'GEMINI_',
    'COHERE_',
    'MISTRAL_',
    'TOGETHER_',
    'GROQ_',
    'AWS_',
    'OLLAMA_',
    'SPARSE_EMBEDDER_',
    'QUERY_REWRITE_',
    'POWERMEM_SERVER_',
  ];
  const clearKeys = [
    'POWERMEM_ENV_FILE',
    'QWEN_API_KEY',
    'DASHSCOPE_API_KEY',
    'QWEN_LLM_BASE_URL',
    'QWEN_EMBEDDING_BASE_URL',
    'OPENAI_EMBEDDING_BASE_URL',
    'BATCH_SIZE',
    'FLUSH_INTERVAL',
    'TIMEZONE',
    'DIMS',
  ];

  beforeEach(() => {
    getDefaultEnvFileMock.mockReset();
    getDefaultEnvFileMock.mockReturnValue(undefined);
    process.env = { ...origEnv };
    for (const key of Object.keys(process.env)) {
      if (clearPrefixes.some((prefix) => key.startsWith(prefix)) || clearKeys.includes(key)) {
        delete process.env[key];
      }
    }
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('loads LLM config with Python-compatible aliases', () => {
    process.env.LLM_PROVIDER = 'qwen';
    process.env.QWEN_API_KEY = 'llm-key';
    process.env.QWEN_LLM_BASE_URL = 'https://qwen.example.com/v1';

    const config = loadConfigFromEnv();
    const llmConfig = config.llm!.config as Record<string, unknown>;
    expect(config.llm!.provider).toBe('qwen');
    expect(llmConfig.apiKey).toBe('llm-key');
    expect(llmConfig.model).toBe('qwen-plus');
    expect(llmConfig.baseUrl).toBe('https://qwen.example.com/v1');
  });

  it('loads embedding config with Python-compatible aliases', () => {
    process.env.EMBEDDING_PROVIDER = 'openai';
    process.env.EMBEDDING_API_KEY = 'embed-key';
    process.env.EMBEDDING_MODEL = 'text-embedding-3-small';
    process.env.DIMS = '1536';
    process.env.OPENAI_EMBEDDING_BASE_URL = 'https://emb.example.com/v1';

    const config = loadConfigFromEnv();
    const embedderConfig = config.embedder!.config as Record<string, unknown>;
    expect(config.embedder!.provider).toBe('openai');
    expect(embedderConfig.apiKey).toBe('embed-key');
    expect(embedderConfig.embeddingDims).toBe(1536);
    expect(embedderConfig.baseUrl).toBe('https://emb.example.com/v1');
  });

  it('loads database config from env', () => {
    process.env.DATABASE_PROVIDER = 'sqlite';
    process.env.SQLITE_PATH = '/tmp/test.db';

    const config = loadConfigFromEnv();
    const vectorStoreConfig = config.vectorStore!.config as Record<string, unknown>;
    expect(config.vectorStore!.provider).toBe('sqlite');
    expect(vectorStoreConfig.path).toBe('/tmp/test.db');
  });

  it('defaults to seekdb when no DATABASE_PROVIDER', () => {
    const config = loadConfigFromEnv();
    const vectorStoreConfig = config.vectorStore!.config as Record<string, unknown>;
    expect(config.vectorStore!.provider).toBe('seekdb');
    expect(vectorStoreConfig.path).toBe('./seekdb_data');
    expect(vectorStoreConfig.database).toBe('test');
  });

  it('normalizes postgres provider to pgvector', () => {
    process.env.DATABASE_PROVIDER = 'postgres';
    process.env.POSTGRES_HOST = '127.0.0.1';
    process.env.POSTGRES_PORT = '5432';
    process.env.POSTGRES_DATABASE = 'powermem';
    process.env.POSTGRES_COLLECTION = 'memories';

    const config = loadConfigFromEnv();
    const vectorStoreConfig = config.vectorStore!.config as Record<string, unknown>;
    expect(config.vectorStore!.provider).toBe('pgvector');
    expect(vectorStoreConfig.dbname).toBe('powermem');
    expect(vectorStoreConfig.tableName).toBe('memories');
  });

  it('loads seekdb provider with embedded defaults', () => {
    process.env.DATABASE_PROVIDER = 'seekdb';

    const config = loadConfigFromEnv();
    const vectorStoreConfig = config.vectorStore!.config as Record<string, unknown>;
    expect(config.vectorStore!.provider).toBe('seekdb');
    expect(vectorStoreConfig.path).toBe('./seekdb_data');
    expect(vectorStoreConfig.database).toBe('test');
    expect(vectorStoreConfig.collectionName).toBe('power_mem');
    expect(vectorStoreConfig.distance).toBe('l2');
  });

  it('keeps oceanbase provider for explicit oceanbase config', () => {
    process.env.DATABASE_PROVIDER = 'oceanbase';

    const config = loadConfigFromEnv();
    const vectorStoreConfig = config.vectorStore!.config as Record<string, unknown>;
    expect(config.vectorStore!.provider).toBe('oceanbase');
    expect(vectorStoreConfig.obPath).toBe('./seekdb_data');
    expect(vectorStoreConfig.dbName).toBe('test');
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

  it('loads graph store with OceanBase fallback', () => {
    process.env.GRAPH_STORE_ENABLED = 'true';
    process.env.OCEANBASE_HOST = '127.0.0.2';
    process.env.OCEANBASE_PORT = '2881';

    const config = loadConfigFromEnv();
    expect(config.graphStore).toBeDefined();
    expect(config.graphStore!.enabled).toBe(true);
    expect((config.graphStore!.config as Record<string, unknown>).host).toBe('127.0.0.2');
    expect((config.graphStore!.config as Record<string, unknown>).maxHops).toBe(3);
  });

  it('loads telemetry aliases and internal settings', () => {
    process.env.TELEMETRY_ENABLED = 'true';
    process.env.BATCH_SIZE = '42';
    process.env.FLUSH_INTERVAL = '15';
    process.env.MEMORY_BATCH_SIZE = '200';
    process.env.ENCRYPTION_ENABLED = 'true';
    process.env.MEMORY_DECAY_ENABLED = 'false';
    process.env.TIMEZONE = 'Asia/Shanghai';

    const config = loadConfigFromEnv();
    expect(config.telemetry!.enableTelemetry).toBe(true);
    expect(config.telemetry!.batchSize).toBe(42);
    expect(config.telemetry!.flushInterval).toBe(15);
    expect(config.performance!.memoryBatchSize).toBe(200);
    expect(config.security!.encryptionEnabled).toBe(true);
    expect(config.memoryDecay!.enabled).toBe(false);
    expect(config.timezone!.timezone).toBe('Asia/Shanghai');
  });

  it('loads reranker config from standard names', () => {
    process.env.RERANKER_ENABLED = 'true';
    process.env.RERANKER_PROVIDER = 'jina';
    process.env.RERANKER_API_KEY = 'rerank-key';
    process.env.RERANKER_MODEL = 'jina-reranker-v3';
    process.env.RERANKER_TOP_N = '5';

    const config = loadConfigFromEnv();
    const rerankerConfig = config.reranker!.config as Record<string, unknown>;
    expect(config.reranker).toBeDefined();
    expect(config.reranker!.enabled).toBe(true);
    expect(config.reranker!.provider).toBe('jina');
    expect(rerankerConfig.apiKey).toBe('rerank-key');
    expect(rerankerConfig.topN).toBe(5);
  });

  it('returns disabled reranker defaults when env is not set', () => {
    const config = loadConfigFromEnv();
    expect(config.reranker).toBeDefined();
    expect(config.reranker!.enabled).toBe(false);
    expect(config.reranker!.provider).toBe('qwen');
  });

  it('loads POWERMEM_ENV_FILE before default env discovery', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'powermem-config-'));
    const defaultEnvPath = path.join(tempDir, 'default.env');
    const envPath = path.join(tempDir, 'custom.env');
    fs.writeFileSync(defaultEnvPath, 'DASHSCOPE_API_KEY=from-default-env\n', 'utf8');
    fs.writeFileSync(envPath, 'DASHSCOPE_API_KEY=from-custom-env\n', 'utf8');
    process.env.POWERMEM_ENV_FILE = envPath;
    getDefaultEnvFileMock.mockReturnValue(defaultEnvPath);

    const config = loadConfigFromEnv();
    const llmConfig = config.llm!.config as Record<string, unknown>;
    expect(llmConfig.apiKey).toBe('from-custom-env');
    fs.rmSync(tempDir, { recursive: true, force: true });
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
    expect(config.vectorStore!.provider).toBe('seekdb');
    expect(config.llm!.provider).toBe('qwen');
    expect(config.embedder!.provider).toBe('qwen');
    expect(config.reranker!.enabled).toBe(false);
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
    const llmConfig = config.llm!.config as Record<string, unknown>;
    const embedderConfig = config.embedder!.config as Record<string, unknown>;
    const vectorStoreConfig = config.vectorStore!.config as Record<string, unknown>;
    expect(config.vectorStore!.provider).toBe('seekdb');
    expect(config.llm!.provider).toBe('openai');
    expect(llmConfig.apiKey).toBe('sk-test');
    expect(embedderConfig.embeddingDims).toBe(768);
    expect(vectorStoreConfig.embeddingModelDims).toBe(768);
  });
});
