/**
 * Configuration classes for the memory system.
 * Port of Python powermem/configs.py — Pydantic models → Zod schemas.
 */
import { z } from 'zod/v4';
import { OceanBaseGraphConfigSchema } from './storage/config/oceanbase.js';

// ─── Sub-configs ──────────────────────────────────────────────────────────

export const IntelligentMemoryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  plugin: z.string().default('ebbinghaus'),
  initialRetention: z.number().default(1.0),
  decayRate: z.number().default(0.1),
  reinforcementFactor: z.number().default(0.3),
  workingThreshold: z.number().default(0.3),
  shortTermThreshold: z.number().default(0.6),
  longTermThreshold: z.number().default(0.8),
  fallbackToSimpleAdd: z.boolean().default(false),
});
export type IntelligentMemoryConfig = z.infer<typeof IntelligentMemoryConfigSchema>;

export const TelemetryConfigSchema = z.object({
  enableTelemetry: z.boolean().default(false),
  telemetryEndpoint: z.string().default('https://telemetry.powermem.ai'),
  telemetryApiKey: z.string().nullish(),
  batchSize: z.number().int().default(100),
  flushInterval: z.number().int().default(30),
  retentionDays: z.number().int().default(30),
});
export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;

export const AuditConfigSchema = z.object({
  enabled: z.boolean().default(true),
  logFile: z.string().default('./logs/audit.log'),
  logLevel: z.string().default('INFO'),
  retentionDays: z.number().int().default(90),
  compressLogs: z.boolean().default(true),
  logRotationSize: z.string().nullish(),
});
export type AuditConfig = z.infer<typeof AuditConfigSchema>;

export const LoggingConfigSchema = z.object({
  level: z.string().default('DEBUG'),
  format: z.string().default('%(asctime)s - %(name)s - %(levelname)s - %(message)s'),
  file: z.string().default('./logs/powermem.log'),
  maxSize: z.string().default('100MB'),
  backupCount: z.number().int().default(5),
  compressBackups: z.boolean().default(true),
  consoleEnabled: z.boolean().default(true),
  consoleLevel: z.string().default('INFO'),
  consoleFormat: z.string().default('%(levelname)s - %(message)s'),
});
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

export const AgentMemoryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.enum(['multi_agent', 'multi_user', 'hybrid', 'auto']).default('auto'),
  defaultScope: z.string().default('agent_group'),
  defaultPrivacyLevel: z.string().default('private'),
  defaultCollaborationLevel: z.string().default('read_only'),
  defaultAccessPermission: z.string().default('owner_only'),
  enableCollaboration: z.boolean().default(true),
});
export type AgentMemoryConfig = z.infer<typeof AgentMemoryConfigSchema>;

export const QueryRewriteConfigSchema = z.object({
  enabled: z.boolean().default(false),
  prompt: z.string().nullish(),
  modelOverride: z.string().nullish(),
});
export type QueryRewriteConfig = z.infer<typeof QueryRewriteConfigSchema>;

export const PerformanceConfigSchema = z.object({
  memoryBatchSize: z.number().int().default(100),
  memoryCacheSize: z.number().int().default(1000),
  memoryCacheTtl: z.number().int().default(3600),
  memorySearchLimit: z.number().int().default(10),
  memorySearchThreshold: z.number().default(0.7),
  vectorStoreBatchSize: z.number().int().default(50),
  vectorStoreCacheSize: z.number().int().default(500),
  vectorStoreIndexRebuildInterval: z.number().int().default(86400),
});
export type PerformanceConfig = z.infer<typeof PerformanceConfigSchema>;

export const SecurityConfigSchema = z.object({
  encryptionEnabled: z.boolean().default(false),
  encryptionKey: z.string().default(''),
  encryptionAlgorithm: z.string().default('AES-256-GCM'),
  accessControlEnabled: z.boolean().default(true),
  accessControlDefaultPermission: z.string().default('READ_ONLY'),
  accessControlAdminUsers: z.string().default('admin,root'),
});
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

export const MemoryDecayConfigSchema = z.object({
  enabled: z.boolean().default(true),
  algorithm: z.string().default('ebbinghaus'),
  baseRetention: z.number().default(1.0),
  forgettingRate: z.number().default(0.1),
  reinforcementFactor: z.number().default(0.3),
});
export type MemoryDecayConfig = z.infer<typeof MemoryDecayConfigSchema>;

export const TimezoneConfigSchema = z.object({
  timezone: z.string().default('UTC'),
});
export type TimezoneConfig = z.infer<typeof TimezoneConfigSchema>;

// ─── Provider configs ─────────────────────────────────────────────────────

export const VectorStoreProviderConfigSchema = z.object({
  provider: z.string().default('sqlite'),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type VectorStoreProviderConfig = z.infer<typeof VectorStoreProviderConfigSchema>;

export const LLMProviderConfigSchema = z.object({
  provider: z.string().default('qwen'),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type LLMProviderConfig = z.infer<typeof LLMProviderConfigSchema>;

export const EmbedderProviderConfigSchema = z.object({
  provider: z.string().default('qwen'),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type EmbedderProviderConfig = z.infer<typeof EmbedderProviderConfigSchema>;

export const RerankProviderConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.string().default('qwen'),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type RerankProviderConfig = z.infer<typeof RerankProviderConfigSchema>;

export const GraphStoreProviderConfigSchema = z.object({
  enabled: z.boolean().default(true),
  provider: z.string().default('oceanbase'),
  config: z.union([
    OceanBaseGraphConfigSchema,
    z.record(z.string(), z.unknown()),
  ]).default({}),
  customPrompt: z.string().nullish(),
  customExtractRelationsPrompt: z.string().nullish(),
  customUpdateGraphPrompt: z.string().nullish(),
  customDeleteRelationsPrompt: z.string().nullish(),
});
export type GraphStoreProviderConfig = z.infer<typeof GraphStoreProviderConfigSchema>;

export const SparseEmbedderProviderConfigSchema = z.object({
  provider: z.string(),
  config: z.record(z.string(), z.unknown()).default({}),
});
export type SparseEmbedderProviderConfig = z.infer<typeof SparseEmbedderProviderConfigSchema>;

// ─── Main config ──────────────────────────────────────────────────────────

export const MemoryConfigSchema = z.object({
  vectorStore: VectorStoreProviderConfigSchema.default(() => ({ provider: 'sqlite', config: {} })),
  llm: LLMProviderConfigSchema.default(() => ({ provider: 'qwen', config: {} })),
  embedder: EmbedderProviderConfigSchema.default(() => ({ provider: 'qwen', config: {} })),
  graphStore: GraphStoreProviderConfigSchema.nullish(),
  reranker: RerankProviderConfigSchema.nullish(),
  sparseEmbedder: SparseEmbedderProviderConfigSchema.nullish(),
  version: z.string().default('v1.1'),
  customFactExtractionPrompt: z.string().nullish(),
  customUpdateMemoryPrompt: z.string().nullish(),
  customImportanceEvaluationPrompt: z.string().nullish(),
  agentMemory: AgentMemoryConfigSchema.nullish(),
  intelligentMemory: IntelligentMemoryConfigSchema.nullish(),
  telemetry: TelemetryConfigSchema.nullish(),
  audit: AuditConfigSchema.nullish(),
  logging: LoggingConfigSchema.nullish(),
  queryRewrite: QueryRewriteConfigSchema.nullish(),
  performance: PerformanceConfigSchema.nullish(),
  security: SecurityConfigSchema.nullish(),
  memoryDecay: MemoryDecayConfigSchema.nullish(),
  timezone: TimezoneConfigSchema.nullish(),
});
export type MemoryConfigInput = z.input<typeof MemoryConfigSchema>;
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

function syncEmbeddingDims(config: MemoryConfig): void {
  const dims = config.embedder.config.embeddingDims;
  if (typeof dims !== 'number') return;

  if (config.vectorStore.config.embeddingModelDims === undefined) {
    config.vectorStore.config.embeddingModelDims = dims;
  }
  if (config.graphStore && typeof config.graphStore.config === 'object' && config.graphStore.config) {
    const graphConfig = config.graphStore.config as Record<string, unknown>;
    if (graphConfig.embeddingModelDims === undefined) {
      graphConfig.embeddingModelDims = dims;
    }
  }
}

/** Parse and validate a MemoryConfig, applying defaults. */
export function parseMemoryConfig(input: MemoryConfigInput): MemoryConfig {
  const config = MemoryConfigSchema.parse(input);
  // Apply defaults for optional sub-configs (matching Python __init__)
  if (!config.agentMemory) config.agentMemory = AgentMemoryConfigSchema.parse({});
  if (!config.intelligentMemory) config.intelligentMemory = IntelligentMemoryConfigSchema.parse({});
  if (!config.telemetry) config.telemetry = TelemetryConfigSchema.parse({});
  if (!config.audit) config.audit = AuditConfigSchema.parse({});
  if (!config.logging) config.logging = LoggingConfigSchema.parse({});
  if (!config.queryRewrite) config.queryRewrite = QueryRewriteConfigSchema.parse({});
  if (!config.performance) config.performance = PerformanceConfigSchema.parse({});
  if (!config.security) config.security = SecurityConfigSchema.parse({});
  if (!config.memoryDecay) config.memoryDecay = MemoryDecayConfigSchema.parse({});
  if (!config.timezone) config.timezone = TimezoneConfigSchema.parse({});
  syncEmbeddingDims(config);
  return config;
}

/** Validate a config dict has required sections. */
export function validateConfig(config: Record<string, unknown>): boolean {
  const required = ['vectorStore', 'llm', 'embedder'];
  for (const section of required) {
    const s = config[section] as Record<string, unknown> | undefined;
    if (!s || typeof s.provider !== 'string') return false;
  }
  return true;
}
