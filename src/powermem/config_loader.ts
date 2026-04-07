/**
 * Configuration loader — load config from environment variables.
 * Port of Python powermem/config_loader.py.
 */
import { loadEnvFile } from './utils/env.js';
import { getDefaultEnvFile } from './settings.js';
import type { MemoryConfigInput } from './configs.js';

/** Load .env files (POWERMEM_ENV_FILE takes precedence). */
function loadDotenvIfAvailable(): void {
  const cliEnv = process.env.POWERMEM_ENV_FILE;
  if (cliEnv) loadEnvFile(cliEnv);

  const defaultEnv = getDefaultEnvFile();
  if (defaultEnv) loadEnvFile(defaultEnv);
}

/** Read a provider+config pair from env with a given prefix. */
function readProviderFromEnv(prefix: string): { provider: string; config: Record<string, unknown> } {
  const provider = (process.env[`${prefix}_PROVIDER`] ?? '').toLowerCase();
  const apiKey = process.env[`${prefix}_API_KEY`];
  const model = process.env[`${prefix}_MODEL`];
  const config: Record<string, unknown> = {};
  if (apiKey) config.apiKey = apiKey;
  if (model) config.model = model;

  // Numeric fields
  const dims = process.env[`${prefix}_DIMS`] ?? process.env.EMBEDDING_DIMS;
  if (dims && prefix === 'EMBEDDING') config.embeddingDims = parseInt(dims, 10);

  // LLM-specific
  if (prefix === 'LLM') {
    const temp = process.env.LLM_TEMPERATURE;
    if (temp) config.temperature = parseFloat(temp);
    const maxTokens = process.env.LLM_MAX_TOKENS;
    if (maxTokens) config.maxTokens = parseInt(maxTokens, 10);
    const topP = process.env.LLM_TOP_P;
    if (topP) config.topP = parseFloat(topP);
  }

  return { provider, config };
}

/** Load database/vector-store config from env. */
function readDatabaseFromEnv(): { provider: string; config: Record<string, unknown> } {
  const provider = (process.env.DATABASE_PROVIDER ?? 'sqlite').toLowerCase();
  const config: Record<string, unknown> = {};

  if (provider === 'sqlite') {
    const dbPath = process.env.SQLITE_PATH ?? process.env.OCEANBASE_PATH;
    if (dbPath) config.path = dbPath;
  } else if (provider === 'seekdb') {
    const seekdbPath = process.env.SEEKDB_PATH ?? process.env.OCEANBASE_PATH;
    if (seekdbPath) config.path = seekdbPath;
    const seekdbDb = process.env.SEEKDB_DATABASE;
    if (seekdbDb) config.database = seekdbDb;
  }

  return { provider, config };
}

/** Read intelligent memory settings from env. */
function readIntelligentMemoryFromEnv(): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const enabled = process.env.INTELLIGENT_MEMORY_ENABLED;
  if (enabled !== undefined) result.enabled = enabled !== 'false' && enabled !== '0';
  const fallback = process.env.INTELLIGENT_MEMORY_FALLBACK_TO_SIMPLE_ADD;
  if (fallback !== undefined) result.fallbackToSimpleAdd = fallback === 'true' || fallback === '1';
  const decay = process.env.INTELLIGENT_MEMORY_DECAY_RATE;
  if (decay) result.decayRate = parseFloat(decay);
  const reinforcement = process.env.INTELLIGENT_MEMORY_REINFORCEMENT_FACTOR;
  if (reinforcement) result.reinforcementFactor = parseFloat(reinforcement);
  return result;
}

/**
 * Load full configuration from environment variables.
 * Reads .env files, then builds a MemoryConfig-compatible dict.
 */
export function loadConfigFromEnv(): MemoryConfigInput {
  loadDotenvIfAvailable();

  const db = readDatabaseFromEnv();
  const llm = readProviderFromEnv('LLM');
  const embedder = readProviderFromEnv('EMBEDDING');
  const intelligentMemory = readIntelligentMemoryFromEnv();

  // Reranker (optional)
  const rerankerProvider = process.env.RERANKER_PROVIDER;
  const reranker = rerankerProvider
    ? { provider: rerankerProvider.toLowerCase(), config: {} as Record<string, unknown> }
    : undefined;

  // Custom prompts
  const customFactExtractionPrompt = process.env.CUSTOM_FACT_EXTRACTION_PROMPT;
  const customUpdateMemoryPrompt = process.env.CUSTOM_UPDATE_MEMORY_PROMPT;

  return {
    vectorStore: db,
    llm,
    embedder,
    reranker,
    intelligentMemory: Object.keys(intelligentMemory).length > 0 ? intelligentMemory : undefined,
    customFactExtractionPrompt,
    customUpdateMemoryPrompt,
  };
}

/**
 * Auto-detect and load configuration from environment.
 * Simplest entry point — loads .env and returns config.
 */
export function autoConfig(): MemoryConfigInput {
  return loadConfigFromEnv();
}

/**
 * Create a config dict programmatically.
 */
export function createConfig(options: {
  databaseProvider?: string;
  llmProvider?: string;
  embeddingProvider?: string;
  databaseConfig?: Record<string, unknown>;
  llmApiKey?: string;
  llmModel?: string;
  embeddingApiKey?: string;
  embeddingModel?: string;
  embeddingDims?: number;
} = {}): MemoryConfigInput {
  return {
    vectorStore: {
      provider: options.databaseProvider ?? 'sqlite',
      config: options.databaseConfig ?? {},
    },
    llm: {
      provider: options.llmProvider ?? 'qwen',
      config: {
        apiKey: options.llmApiKey,
        model: options.llmModel ?? 'qwen-plus',
      },
    },
    embedder: {
      provider: options.embeddingProvider ?? 'qwen',
      config: {
        apiKey: options.embeddingApiKey,
        model: options.embeddingModel ?? 'text-embedding-v4',
        embeddingDims: options.embeddingDims ?? 1536,
      },
    },
  };
}
