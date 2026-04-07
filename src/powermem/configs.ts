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
});
export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;

export const AuditConfigSchema = z.object({
  enabled: z.boolean().default(true),
  logFile: z.string().default('./logs/audit.log'),
  logLevel: z.string().default('INFO'),
  retentionDays: z.number().int().default(90),
});
export type AuditConfig = z.infer<typeof AuditConfigSchema>;

export const LoggingConfigSchema = z.object({
  level: z.string().default('DEBUG'),
  format: z.string().default('%(asctime)s - %(name)s - %(levelname)s - %(message)s'),
  file: z.string().default('./logs/powermem.log'),
});
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;

export const AgentMemoryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.enum(['multi_agent', 'multi_user', 'hybrid', 'auto']).default('multi_agent'),
  defaultScope: z.string().default('private'),
  defaultPrivacyLevel: z.string().default('standard'),
  defaultCollaborationLevel: z.string().default('isolated'),
  defaultAccessPermission: z.string().default('read'),
  enableCollaboration: z.boolean().default(true),
});
export type AgentMemoryConfig = z.infer<typeof AgentMemoryConfigSchema>;

export const QueryRewriteConfigSchema = z.object({
  enabled: z.boolean().default(false),
  prompt: z.string().nullish(),
  modelOverride: z.string().nullish(),
});
export type QueryRewriteConfig = z.infer<typeof QueryRewriteConfigSchema>;

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
});
export type GraphStoreProviderConfig = z.infer<typeof GraphStoreProviderConfigSchema>;

// ─── Main config ──────────────────────────────────────────────────────────

export const MemoryConfigSchema = z.object({
  vectorStore: VectorStoreProviderConfigSchema.default(() => ({ provider: 'sqlite', config: {} })),
  llm: LLMProviderConfigSchema.default(() => ({ provider: 'qwen', config: {} })),
  embedder: EmbedderProviderConfigSchema.default(() => ({ provider: 'qwen', config: {} })),
  graphStore: GraphStoreProviderConfigSchema.nullish(),
  reranker: RerankProviderConfigSchema.nullish(),
  sparseEmbedder: z.record(z.string(), z.unknown()).nullish(),
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
});
export type MemoryConfigInput = z.input<typeof MemoryConfigSchema>;
export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

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
