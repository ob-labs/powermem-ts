/**
 * Configuration loader — load config from environment variables.
 * Port of Python powermem/config_loader.py.
 */
import { loadEnvFile } from './utils/env.js';
import { getDefaultEnvFile } from './settings.js';
import type { MemoryConfigInput } from './configs.js';

const DEFAULT_SQLITE_PATH = './data/powermem_dev.db';
const DEFAULT_QWEN_LLM_MODEL = 'qwen-plus';
const DEFAULT_QWEN_EMBEDDING_MODEL = 'text-embedding-v4';

/** Load .env files (POWERMEM_ENV_FILE takes precedence). */
function loadDotenvIfAvailable(): void {
  const cliEnv = getEnvValue('POWERMEM_ENV_FILE');
  if (cliEnv) loadEnvFile(cliEnv);

  const defaultEnv = getDefaultEnvFile();
  if (defaultEnv) loadEnvFile(defaultEnv);
}

function getEnvValue(...aliases: string[]): string | undefined {
  const entries = Object.entries(process.env);
  for (const alias of aliases) {
    const match = entries.find(([key]) => key.toUpperCase() === alias.toUpperCase());
    if (match?.[1] !== undefined) return match[1];
  }
  return undefined;
}

function readBool(...aliases: string[]): boolean | undefined {
  const value = getEnvValue(...aliases);
  if (value === undefined) return undefined;
  return ['1', 'true', 't', 'yes', 'y', 'on', 'enabled'].includes(value.trim().toLowerCase());
}

function readInt(...aliases: string[]): number | undefined {
  const value = getEnvValue(...aliases);
  if (value === undefined) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readFloat(...aliases: string[]): number | undefined {
  const value = getEnvValue(...aliases);
  if (value === undefined) return undefined;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function setIfDefined(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined && value !== null) {
    target[key] = value;
  }
}

function normalizeDatabaseProvider(provider?: string): string {
  const normalized = (provider ?? 'sqlite').trim().toLowerCase();
  if (normalized === 'postgres') return 'pgvector';
  if (normalized === 'seekdb') return 'oceanbase';
  return normalized || 'sqlite';
}

function normalizeMode(value?: string, fallback = 'auto'): string {
  const normalized = value?.trim().toLowerCase();
  if (normalized && ['multi_agent', 'multi_user', 'hybrid', 'auto'].includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeScope(value?: string, fallback = 'agent_group'): string {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return fallback;

  const mapping: Record<string, string> = {
    PRIVATE: 'private',
    AGENT: 'agent_group',
    AGENT_GROUP: 'agent_group',
    USER_GROUP: 'user_group',
    PUBLIC: 'public',
    RESTRICTED: 'restricted',
  };
  return mapping[normalized] ?? normalized.toLowerCase();
}

function normalizeKeyword(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized ? normalized.toLowerCase() : fallback;
}

function llmApiKeyAliases(provider: string): string[] {
  switch (provider) {
    case 'qwen':
      return ['LLM_API_KEY', 'QWEN_API_KEY', 'DASHSCOPE_API_KEY'];
    case 'azure':
    case 'azure_openai':
      return ['LLM_API_KEY', 'AZURE_OPENAI_API_KEY'];
    case 'anthropic':
      return ['LLM_API_KEY', 'ANTHROPIC_API_KEY'];
    case 'deepseek':
      return ['LLM_API_KEY', 'DEEPSEEK_API_KEY'];
    case 'siliconflow':
      return ['LLM_API_KEY', 'SILICONFLOW_API_KEY'];
    case 'gemini':
    case 'google':
    case 'vertex':
      return ['LLM_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'];
    case 'cohere':
      return ['LLM_API_KEY', 'COHERE_API_KEY'];
    case 'mistral':
      return ['LLM_API_KEY', 'MISTRAL_API_KEY'];
    case 'together':
      return ['LLM_API_KEY', 'TOGETHER_API_KEY'];
    case 'groq':
      return ['LLM_API_KEY', 'GROQ_API_KEY'];
    default:
      return ['LLM_API_KEY'];
  }
}

function embeddingApiKeyAliases(provider: string): string[] {
  switch (provider) {
    case 'qwen':
      return ['EMBEDDING_API_KEY', 'QWEN_API_KEY', 'DASHSCOPE_API_KEY'];
    case 'azure':
    case 'azure_openai':
      return ['EMBEDDING_API_KEY', 'AZURE_OPENAI_API_KEY'];
    case 'openai':
      return ['EMBEDDING_API_KEY', 'OPENAI_API_KEY'];
    case 'deepseek':
      return ['EMBEDDING_API_KEY', 'DEEPSEEK_API_KEY'];
    case 'siliconflow':
      return ['EMBEDDING_API_KEY', 'SILICONFLOW_API_KEY'];
    case 'gemini':
    case 'google':
    case 'vertex':
      return ['EMBEDDING_API_KEY', 'GOOGLE_API_KEY', 'GEMINI_API_KEY'];
    case 'cohere':
      return ['EMBEDDING_API_KEY', 'COHERE_API_KEY'];
    case 'mistral':
      return ['EMBEDDING_API_KEY', 'MISTRAL_API_KEY'];
    default:
      return ['EMBEDDING_API_KEY'];
  }
}

function rerankerApiKeyAliases(provider: string): string[] {
  switch (provider) {
    case 'qwen':
      return ['RERANKER_API_KEY', 'QWEN_API_KEY', 'DASHSCOPE_API_KEY'];
    case 'jina':
      return ['RERANKER_API_KEY', 'JINA_API_KEY'];
    case 'zai':
      return ['RERANKER_API_KEY', 'ZAI_API_KEY'];
    default:
      return ['RERANKER_API_KEY'];
  }
}

function llmBaseUrlAliases(provider: string): string[] {
  switch (provider) {
    case 'qwen':
      return ['QWEN_LLM_BASE_URL'];
    case 'openai':
      return ['OPENAI_LLM_BASE_URL'];
    case 'siliconflow':
      return ['SILICONFLOW_LLM_BASE_URL'];
    case 'deepseek':
      return ['DEEPSEEK_LLM_BASE_URL'];
    case 'anthropic':
      return ['ANTHROPIC_LLM_BASE_URL'];
    case 'vllm':
      return ['VLLM_LLM_BASE_URL'];
    case 'ollama':
      return ['OLLAMA_LLM_BASE_URL'];
    default:
      return [];
  }
}

function embeddingBaseUrlAliases(provider: string): string[] {
  switch (provider) {
    case 'qwen':
      return ['QWEN_EMBEDDING_BASE_URL'];
    case 'openai':
      return ['OPENAI_EMBEDDING_BASE_URL'];
    case 'siliconflow':
      return ['SILICONFLOW_EMBEDDING_BASE_URL'];
    case 'huggingface':
      return ['HUGGINFACE_EMBEDDING_BASE_URL'];
    case 'lmstudio':
      return ['LMSTUDIO_EMBEDDING_BASE_URL'];
    case 'ollama':
      return ['OLLAMA_EMBEDDING_BASE_URL'];
    default:
      return [];
  }
}

function readLLMFromEnv(): { provider: string; config: Record<string, unknown> } {
  const provider = normalizeKeyword(getEnvValue('LLM_PROVIDER'), 'qwen');
  const config: Record<string, unknown> = {
    model: getEnvValue('LLM_MODEL') ?? (provider === 'qwen' ? DEFAULT_QWEN_LLM_MODEL : 'gpt-4o-mini'),
    temperature: readFloat('LLM_TEMPERATURE') ?? 0.7,
    maxTokens: readInt('LLM_MAX_TOKENS') ?? 1000,
    topP: readFloat('LLM_TOP_P') ?? 0.8,
    topK: readInt('LLM_TOP_K') ?? 50,
  };

  setIfDefined(config, 'apiKey', getEnvValue(...llmApiKeyAliases(provider)));
  setIfDefined(config, 'baseUrl', getEnvValue(...llmBaseUrlAliases(provider)));
  setIfDefined(config, 'enableSearch', readBool('LLM_ENABLE_SEARCH'));
  setIfDefined(config, 'azureOpenAIApiInstanceName', getEnvValue('AZURE_OPENAI_INSTANCE'));
  setIfDefined(config, 'azureOpenAIApiVersion', getEnvValue('AZURE_OPENAI_API_VERSION'));
  setIfDefined(config, 'region', getEnvValue('AWS_REGION'));

  return { provider, config };
}

function readEmbeddingFromEnv(): { provider: string; config: Record<string, unknown> } {
  const provider = normalizeKeyword(getEnvValue('EMBEDDING_PROVIDER'), 'qwen');
  const config: Record<string, unknown> = {
    model: getEnvValue('EMBEDDING_MODEL') ?? (provider === 'qwen' ? DEFAULT_QWEN_EMBEDDING_MODEL : undefined),
  };

  setIfDefined(config, 'apiKey', getEnvValue(...embeddingApiKeyAliases(provider)));
  setIfDefined(config, 'embeddingDims', readInt('EMBEDDING_DIMS', 'DIMS'));
  setIfDefined(config, 'baseUrl', getEnvValue(...embeddingBaseUrlAliases(provider)));
  setIfDefined(config, 'azureOpenAIApiInstanceName', getEnvValue('AZURE_OPENAI_INSTANCE'));
  setIfDefined(config, 'azureOpenAIApiVersion', getEnvValue('AZURE_OPENAI_API_VERSION'));
  setIfDefined(config, 'region', getEnvValue('AWS_REGION'));

  return { provider, config };
}

/** Load database/vector-store config from env. */
function readDatabaseFromEnv(): { provider: string; config: Record<string, unknown> } {
  const provider = normalizeDatabaseProvider(getEnvValue('DATABASE_PROVIDER'));
  const config: Record<string, unknown> = {};

  if (provider === 'sqlite') {
    config.path = getEnvValue('SQLITE_PATH') ?? DEFAULT_SQLITE_PATH;
    config.collectionName = getEnvValue('SQLITE_COLLECTION') ?? 'memories';
    config.enableWal = readBool('SQLITE_ENABLE_WAL') ?? true;
    config.timeout = readInt('SQLITE_TIMEOUT') ?? 30;
  } else if (provider === 'pgvector') {
    setIfDefined(config, 'connectionString', getEnvValue('VECTOR_STORE_CONNECTION_STRING', 'POSTGRES_CONNECTION_STRING'));
    config.dbname = getEnvValue('POSTGRES_DATABASE') ?? 'postgres';
    config.host = getEnvValue('POSTGRES_HOST');
    config.port = readInt('POSTGRES_PORT');
    config.user = getEnvValue('POSTGRES_USER');
    config.password = getEnvValue('POSTGRES_PASSWORD');
    config.tableName = getEnvValue('POSTGRES_COLLECTION') ?? 'power_mem';
    config.dimensions = readInt('POSTGRES_EMBEDDING_MODEL_DIMS');
    config.embeddingModelDims = readInt('POSTGRES_EMBEDDING_MODEL_DIMS');
    config.diskann = readBool('POSTGRES_DISKANN') ?? false;
    config.hnsw = readBool('POSTGRES_HNSW') ?? true;
    setIfDefined(config, 'sslmode', getEnvValue('DATABASE_SSLMODE'));
  } else if (provider === 'oceanbase') {
    config.host = getEnvValue('OCEANBASE_HOST') ?? '';
    config.obPath = getEnvValue('OCEANBASE_PATH') ?? './seekdb_data';
    config.port = getEnvValue('OCEANBASE_PORT') ?? '2881';
    config.user = getEnvValue('OCEANBASE_USER') ?? 'root@test';
    config.password = getEnvValue('OCEANBASE_PASSWORD') ?? '';
    config.dbName = getEnvValue('OCEANBASE_DATABASE') ?? 'test';
    config.collectionName = getEnvValue('OCEANBASE_COLLECTION') ?? 'power_mem';
    config.indexType = getEnvValue('OCEANBASE_INDEX_TYPE') ?? 'HNSW';
    config.vidxMetricType = getEnvValue('OCEANBASE_VECTOR_METRIC_TYPE') ?? 'l2';
    setIfDefined(config, 'embeddingModelDims', readInt('OCEANBASE_EMBEDDING_MODEL_DIMS'));
    config.primaryField = getEnvValue('OCEANBASE_PRIMARY_FIELD') ?? 'id';
    config.vectorField = getEnvValue('OCEANBASE_VECTOR_FIELD') ?? 'embedding';
    config.textField = getEnvValue('OCEANBASE_TEXT_FIELD') ?? 'document';
    config.metadataField = getEnvValue('OCEANBASE_METADATA_FIELD') ?? 'metadata';
    config.vidxName = getEnvValue('OCEANBASE_VIDX_NAME') ?? 'vidx';
    config.includeSparse = readBool('OCEANBASE_INCLUDE_SPARSE', 'SPARSE_VECTOR_ENABLE') ?? false;
    config.enableNativeHybrid = readBool('OCEANBASE_ENABLE_NATIVE_HYBRID') ?? false;
  }

  return { provider, config };
}

function readAgentMemoryFromEnv(): Record<string, unknown> {
  return {
    enabled: readBool('AGENT_ENABLED') ?? true,
    mode: normalizeMode(getEnvValue('AGENT_MEMORY_MODE'), 'auto'),
    defaultScope: normalizeScope(getEnvValue('AGENT_DEFAULT_SCOPE'), 'agent_group'),
    defaultPrivacyLevel: normalizeKeyword(getEnvValue('AGENT_DEFAULT_PRIVACY_LEVEL'), 'private'),
    defaultCollaborationLevel: normalizeKeyword(getEnvValue('AGENT_DEFAULT_COLLABORATION_LEVEL'), 'read_only'),
    defaultAccessPermission: normalizeKeyword(getEnvValue('AGENT_DEFAULT_ACCESS_PERMISSION'), 'owner_only'),
    enableCollaboration: true,
  };
}

/** Read intelligent memory settings from env. */
function readIntelligentMemoryFromEnv(): Record<string, unknown> {
  return {
    enabled: readBool('INTELLIGENT_MEMORY_ENABLED') ?? true,
    plugin: 'ebbinghaus',
    initialRetention: readFloat('INTELLIGENT_MEMORY_INITIAL_RETENTION') ?? 1.0,
    decayRate: readFloat('INTELLIGENT_MEMORY_DECAY_RATE') ?? 0.1,
    reinforcementFactor: readFloat('INTELLIGENT_MEMORY_REINFORCEMENT_FACTOR') ?? 0.3,
    workingThreshold: readFloat('INTELLIGENT_MEMORY_WORKING_THRESHOLD') ?? 0.3,
    shortTermThreshold: readFloat('INTELLIGENT_MEMORY_SHORT_TERM_THRESHOLD') ?? 0.6,
    longTermThreshold: readFloat('INTELLIGENT_MEMORY_LONG_TERM_THRESHOLD') ?? 0.8,
    fallbackToSimpleAdd: readBool('INTELLIGENT_MEMORY_FALLBACK_TO_SIMPLE_ADD') ?? false,
  };
}

function readMemoryDecayFromEnv(): Record<string, unknown> {
  return {
    enabled: readBool('MEMORY_DECAY_ENABLED') ?? true,
    algorithm: getEnvValue('MEMORY_DECAY_ALGORITHM') ?? 'ebbinghaus',
    baseRetention: readFloat('MEMORY_DECAY_BASE_RETENTION') ?? 1.0,
    forgettingRate: readFloat('MEMORY_DECAY_FORGETTING_RATE') ?? 0.1,
    reinforcementFactor: readFloat('MEMORY_DECAY_REINFORCEMENT_FACTOR') ?? 0.3,
  };
}

function readTelemetryFromEnv(): Record<string, unknown> {
  return {
    enableTelemetry: readBool('TELEMETRY_ENABLED') ?? false,
    telemetryEndpoint: getEnvValue('TELEMETRY_ENDPOINT') ?? 'https://telemetry.powermem.ai',
    telemetryApiKey: getEnvValue('TELEMETRY_API_KEY'),
    batchSize: readInt('BATCH_SIZE', 'TELEMETRY_BATCH_SIZE') ?? 100,
    flushInterval: readInt('FLUSH_INTERVAL', 'TELEMETRY_FLUSH_INTERVAL') ?? 30,
    retentionDays: readInt('TELEMETRY_RETENTION_DAYS') ?? 30,
  };
}

function readAuditFromEnv(): Record<string, unknown> {
  return {
    enabled: readBool('AUDIT_ENABLED') ?? true,
    logFile: getEnvValue('AUDIT_LOG_FILE') ?? './logs/audit.log',
    logLevel: getEnvValue('AUDIT_LOG_LEVEL') ?? 'INFO',
    retentionDays: readInt('AUDIT_RETENTION_DAYS') ?? 90,
    compressLogs: readBool('AUDIT_COMPRESS_LOGS') ?? true,
    logRotationSize: getEnvValue('AUDIT_LOG_ROTATION_SIZE'),
  };
}

function readLoggingFromEnv(): Record<string, unknown> {
  return {
    level: getEnvValue('LOGGING_LEVEL') ?? 'DEBUG',
    format: getEnvValue('LOGGING_FORMAT') ?? '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    file: getEnvValue('LOGGING_FILE') ?? './logs/powermem.log',
    maxSize: getEnvValue('LOGGING_MAX_SIZE') ?? '100MB',
    backupCount: readInt('LOGGING_BACKUP_COUNT') ?? 5,
    compressBackups: readBool('LOGGING_COMPRESS_BACKUPS') ?? true,
    consoleEnabled: readBool('LOGGING_CONSOLE_ENABLED') ?? true,
    consoleLevel: getEnvValue('LOGGING_CONSOLE_LEVEL') ?? 'INFO',
    consoleFormat: getEnvValue('LOGGING_CONSOLE_FORMAT') ?? '%(levelname)s - %(message)s',
  };
}

function readPerformanceFromEnv(): Record<string, unknown> {
  return {
    memoryBatchSize: readInt('MEMORY_BATCH_SIZE') ?? 100,
    memoryCacheSize: readInt('MEMORY_CACHE_SIZE') ?? 1000,
    memoryCacheTtl: readInt('MEMORY_CACHE_TTL') ?? 3600,
    memorySearchLimit: readInt('MEMORY_SEARCH_LIMIT') ?? 10,
    memorySearchThreshold: readFloat('MEMORY_SEARCH_THRESHOLD') ?? 0.7,
    vectorStoreBatchSize: readInt('VECTOR_STORE_BATCH_SIZE') ?? 50,
    vectorStoreCacheSize: readInt('VECTOR_STORE_CACHE_SIZE') ?? 500,
    vectorStoreIndexRebuildInterval: readInt('VECTOR_STORE_INDEX_REBUILD_INTERVAL') ?? 86400,
  };
}

function readSecurityFromEnv(): Record<string, unknown> {
  return {
    encryptionEnabled: readBool('ENCRYPTION_ENABLED') ?? false,
    encryptionKey: getEnvValue('ENCRYPTION_KEY') ?? '',
    encryptionAlgorithm: getEnvValue('ENCRYPTION_ALGORITHM') ?? 'AES-256-GCM',
    accessControlEnabled: readBool('ACCESS_CONTROL_ENABLED') ?? true,
    accessControlDefaultPermission: getEnvValue('ACCESS_CONTROL_DEFAULT_PERMISSION') ?? 'READ_ONLY',
    accessControlAdminUsers: getEnvValue('ACCESS_CONTROL_ADMIN_USERS') ?? 'admin,root',
  };
}

function readQueryRewriteFromEnv(): Record<string, unknown> {
  return {
    enabled: readBool('QUERY_REWRITE_ENABLED') ?? false,
    prompt: getEnvValue('QUERY_REWRITE_PROMPT'),
    modelOverride: getEnvValue('QUERY_REWRITE_MODEL_OVERRIDE'),
  };
}

function readTimezoneFromEnv(): Record<string, unknown> {
  return {
    timezone: getEnvValue('TIMEZONE') ?? 'UTC',
  };
}

function defaultRerankModel(provider: string): string | undefined {
  switch (provider) {
    case 'qwen':
      return 'qwen3-rerank';
    case 'jina':
      return 'jina-reranker-v3';
    case 'zai':
      return 'rerank';
    default:
      return undefined;
  }
}

function readRerankerFromEnv(): { enabled: boolean; provider: string; config: Record<string, unknown> } {
  const provider = normalizeKeyword(getEnvValue('RERANKER_PROVIDER'), 'qwen');
  const config: Record<string, unknown> = {};
  const baseUrlAliases = ['RERANKER_API_BASE_URL'];
  if (provider === 'qwen') baseUrlAliases.push('QWEN_RERANK_BASE_URL', 'DASHSCOPE_BASE_URL');
  if (provider === 'jina') baseUrlAliases.push('JINA_API_BASE_URL');
  if (provider === 'zai') baseUrlAliases.push('ZAI_API_BASE_URL');

  setIfDefined(config, 'model', getEnvValue('RERANKER_MODEL') ?? defaultRerankModel(provider));
  setIfDefined(config, 'apiKey', getEnvValue(...rerankerApiKeyAliases(provider)));
  setIfDefined(config, 'apiBaseUrl', getEnvValue(...baseUrlAliases));
  setIfDefined(config, 'topN', readInt('RERANKER_TOP_N'));

  return {
    enabled: readBool('RERANKER_ENABLED') ?? false,
    provider,
    config,
  };
}

function readGraphStoreFromEnv(): MemoryConfigInput['graphStore'] {
  const enabled = readBool('GRAPH_STORE_ENABLED') ?? false;
  if (!enabled) return undefined;

  return {
    enabled: true,
    provider: normalizeKeyword(getEnvValue('GRAPH_STORE_PROVIDER'), 'oceanbase'),
    config: {
      host: getEnvValue('GRAPH_STORE_HOST', 'OCEANBASE_HOST') ?? '',
      port: getEnvValue('GRAPH_STORE_PORT', 'OCEANBASE_PORT') ?? '2881',
      user: getEnvValue('GRAPH_STORE_USER', 'OCEANBASE_USER') ?? 'root@test',
      password: getEnvValue('GRAPH_STORE_PASSWORD', 'OCEANBASE_PASSWORD') ?? '',
      dbName: getEnvValue('GRAPH_STORE_DB_NAME', 'OCEANBASE_DATABASE') ?? 'test',
      obPath: getEnvValue('GRAPH_STORE_PATH', 'OCEANBASE_PATH') ?? './seekdb_data',
      collectionName: getEnvValue('GRAPH_STORE_COLLECTION_NAME', 'OCEANBASE_COLLECTION') ?? 'power_mem',
      embeddingModelDims: readInt('GRAPH_STORE_EMBEDDING_MODEL_DIMS', 'OCEANBASE_EMBEDDING_MODEL_DIMS'),
      indexType: getEnvValue('GRAPH_STORE_INDEX_TYPE', 'OCEANBASE_INDEX_TYPE') ?? 'HNSW',
      vidxMetricType: getEnvValue('GRAPH_STORE_VECTOR_METRIC_TYPE', 'OCEANBASE_VECTOR_METRIC_TYPE') ?? 'l2',
      vidxName: getEnvValue('OCEANBASE_VIDX_NAME') ?? 'vidx',
      maxHops: readInt('GRAPH_STORE_MAX_HOPS') ?? 3,
    },
    customPrompt: getEnvValue('GRAPH_STORE_CUSTOM_PROMPT'),
    customExtractRelationsPrompt: getEnvValue('GRAPH_STORE_CUSTOM_EXTRACT_RELATIONS_PROMPT'),
    customUpdateGraphPrompt: getEnvValue('GRAPH_STORE_CUSTOM_UPDATE_GRAPH_PROMPT'),
    customDeleteRelationsPrompt: getEnvValue('GRAPH_STORE_CUSTOM_DELETE_RELATIONS_PROMPT'),
  };
}

function readSparseEmbedderFromEnv(): MemoryConfigInput['sparseEmbedder'] {
  const provider = getEnvValue('SPARSE_EMBEDDER_PROVIDER');
  if (!provider) return undefined;

  const sparseConfig: { provider: string; config: Record<string, unknown> } = {
    provider: provider.toLowerCase(),
    config: {},
  };
  setIfDefined(sparseConfig.config, 'apiKey', getEnvValue('SPARSE_EMBEDDER_API_KEY'));
  setIfDefined(sparseConfig.config, 'model', getEnvValue('SPARSE_EMBEDDER_MODEL'));
  setIfDefined(sparseConfig.config, 'baseUrl', getEnvValue('SPARSE_EMBEDDING_BASE_URL'));
  setIfDefined(sparseConfig.config, 'embeddingDims', readInt('SPARSE_EMBEDDER_DIMS'));
  return sparseConfig;
}

function syncEmbeddingDims(config: MemoryConfigInput): MemoryConfigInput {
  const embedderDims = config.embedder?.config?.embeddingDims;
  if (typeof embedderDims !== 'number') return config;

  const vectorStoreConfig = (config.vectorStore?.config ?? {}) as Record<string, unknown>;
  if (vectorStoreConfig.embeddingModelDims === undefined) {
    vectorStoreConfig.embeddingModelDims = embedderDims;
  }

  if (config.graphStore) {
    const graphConfig = (config.graphStore.config ?? {}) as Record<string, unknown>;
    if (graphConfig.embeddingModelDims === undefined) {
      graphConfig.embeddingModelDims = embedderDims;
    }
  }

  return config;
}

/**
 * Load full configuration from environment variables.
 * Reads .env files, then builds a MemoryConfig-compatible dict.
 */
export function loadConfigFromEnv(): MemoryConfigInput {
  loadDotenvIfAvailable();

  return syncEmbeddingDims({
    vectorStore: readDatabaseFromEnv(),
    llm: readLLMFromEnv(),
    embedder: readEmbeddingFromEnv(),
    graphStore: readGraphStoreFromEnv(),
    reranker: readRerankerFromEnv(),
    sparseEmbedder: readSparseEmbedderFromEnv(),
    version: 'v1.1',
    customFactExtractionPrompt: getEnvValue('CUSTOM_FACT_EXTRACTION_PROMPT'),
    customUpdateMemoryPrompt: getEnvValue('CUSTOM_UPDATE_MEMORY_PROMPT'),
    customImportanceEvaluationPrompt: getEnvValue('CUSTOM_IMPORTANCE_EVALUATION_PROMPT'),
    agentMemory: readAgentMemoryFromEnv(),
    intelligentMemory: readIntelligentMemoryFromEnv(),
    telemetry: readTelemetryFromEnv(),
    audit: readAuditFromEnv(),
    logging: readLoggingFromEnv(),
    queryRewrite: readQueryRewriteFromEnv(),
    performance: readPerformanceFromEnv(),
    security: readSecurityFromEnv(),
    memoryDecay: readMemoryDecayFromEnv(),
    timezone: readTimezoneFromEnv(),
  });
}

export function loadStandardConfig(): MemoryConfigInput {
  return loadConfigFromEnv();
}

function syncCreateConfigEmbeddingDims(config: MemoryConfigInput): MemoryConfigInput {
  return syncEmbeddingDims(config);
}

function buildDefaultDatabaseConfig(provider: string, databaseConfig?: Record<string, unknown>): Record<string, unknown> {
  if (databaseConfig && Object.keys(databaseConfig).length > 0) return databaseConfig;
  if (provider === 'sqlite') {
    return {
      path: DEFAULT_SQLITE_PATH,
      collectionName: 'memories',
      enableWal: true,
      timeout: 30,
    };
  }
  if (provider === 'oceanbase') {
    return {
      host: '',
      obPath: './seekdb_data',
      port: '2881',
      user: 'root@test',
      password: '',
      dbName: 'test',
      collectionName: 'power_mem',
      indexType: 'HNSW',
      vidxMetricType: 'l2',
      includeSparse: false,
      enableNativeHybrid: false,
    };
  }
  return {};
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
  llmTemperature?: number;
  llmMaxTokens?: number;
  llmTopP?: number;
  llmTopK?: number;
  llmBaseUrl?: string;
  embeddingApiKey?: string;
  embeddingModel?: string;
  embeddingDims?: number;
  embeddingBaseUrl?: string;
} = {}): MemoryConfigInput {
  const databaseProvider = normalizeDatabaseProvider(options.databaseProvider);
  return syncCreateConfigEmbeddingDims({
    vectorStore: {
      provider: databaseProvider,
      config: buildDefaultDatabaseConfig(databaseProvider, options.databaseConfig),
    },
    llm: {
      provider: options.llmProvider ?? 'qwen',
      config: {
        apiKey: options.llmApiKey,
        model: options.llmModel ?? 'qwen-plus',
        temperature: options.llmTemperature ?? 0.7,
        maxTokens: options.llmMaxTokens ?? 1000,
        topP: options.llmTopP ?? 0.8,
        topK: options.llmTopK ?? 50,
        baseUrl: options.llmBaseUrl,
      },
    },
    embedder: {
      provider: options.embeddingProvider ?? 'qwen',
      config: {
        apiKey: options.embeddingApiKey,
        model: options.embeddingModel ?? 'text-embedding-v4',
        embeddingDims: options.embeddingDims ?? 1536,
        baseUrl: options.embeddingBaseUrl,
      },
    },
    reranker: {
      enabled: false,
      provider: 'qwen',
      config: {},
    },
  });
}
