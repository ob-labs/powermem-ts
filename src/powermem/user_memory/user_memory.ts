/**
 * UserMemory — user profile extraction and profile-aware search.
 * Port of Python powermem/user_memory/user_memory.py.
 */
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage } from '@langchain/core/messages';
import type { MemoryConfigInput } from '../configs.js';
import { createConfig } from '../config_loader.js';
import type { Memory } from '../core/memory.js';
import type { MemoryContent, MemoryRecord } from '../types/memory.js';
import type { MemoryOptions } from '../types/options.js';
import type { MemoryListResult } from '../types/responses.js';
import type { UserProfileStore, UserProfile } from './storage/base.js';
import { UserProfileStoreFactory } from './storage/factory.js';
import { QueryRewriter } from './query-rewrite/rewriter.js';
import {
  filterMessagesByRoles,
  parseConversationText,
} from '../utils/messages.js';
import {
  getUserProfileExtractionPrompt,
  getUserProfileTopicsExtractionPrompt,
} from '../prompts/user-profile.js';
import { setPayloadTimezoneFromConfig } from '../utils/payload-datetime.js';

export interface UserMemoryConfig {
  memory: Memory;
  profileStore: UserProfileStore;
  queryRewriter?: QueryRewriter;
  llm?: BaseChatModel;
}

export interface UserMemoryCreateOptions {
  config?: MemoryConfigInput;
  storageType?: string;
  llmProvider?: string;
  embeddingProvider?: string;
  memory?: Memory;
  memoryOptions?: MemoryOptions;
  profileStore?: UserProfileStore;
  profileStoreProvider?: string;
  profileStoreConfig?: Record<string, unknown>;
  queryRewriter?: QueryRewriter;
  profileDbPath?: string;
  llm?: BaseChatModel;
}

export type ProfileType = 'content' | 'topics';

export interface UserMemoryAddOptions {
  userId: string;
  agentId?: string;
  runId?: string;
  metadata?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  scope?: string;
  memoryType?: string;
  prompt?: string;
  infer?: boolean;
  extractProfile?: boolean;
  profileType?: ProfileType;
  profileContent?: string;
  topics?: Record<string, unknown>;
  customTopics?: string | Record<string, unknown>;
  strictMode?: boolean;
  includeRoles?: string[] | null;
  excludeRoles?: string[] | null;
  nativeLanguage?: string;
}

export interface UserMemoryProfileListOptions {
  userId?: string;
  fuzzy?: boolean;
  mainTopic?: string | string[];
  subTopic?: string | string[];
  topicValue?: string | string[];
  limit?: number;
  offset?: number;
}

function removeCodeBlocks(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9]*\n([\s\S]*?)\n```$/);
  return match ? match[1].trim() : trimmed;
}

function normalizeStringArray(value?: string | string[] | null): string[] | undefined {
  if (value == null) return undefined;
  const values = Array.isArray(value) ? value : [value];
  const normalized = values
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = removeCodeBlocks(text);
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through.
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function convertNumbersToStrings(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => convertNumbersToStrings(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, convertNumbersToStrings(nested)]),
    );
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return value;
}

function normalizeProfileStoreProvider(provider?: string): string {
  const normalized = provider?.trim().toLowerCase();
  if (!normalized) return 'sqlite';
  if (normalized === 'oceanbase') return 'seekdb';
  return normalized;
}

function buildMemoryOptions(options: UserMemoryCreateOptions): MemoryOptions {
  const memoryOptions: MemoryOptions = {
    ...(options.memoryOptions ?? {}),
  };

  if (!memoryOptions.config) {
    if (options.config) {
      memoryOptions.config = options.config;
    } else if (options.storageType || options.llmProvider || options.embeddingProvider) {
      memoryOptions.config = createConfig({
        databaseProvider: options.storageType,
        llmProvider: options.llmProvider,
        embeddingProvider: options.embeddingProvider,
      });
    }
  }

  return memoryOptions;
}

function buildDefaultProfileStoreConfig(
  provider: string,
  runtimeConfig: ReturnType<Memory['getRuntimeConfig']>,
  explicitDbPath?: string,
): Record<string, unknown> {
  const vectorConfig = (runtimeConfig.vectorStore?.config ?? {}) as Record<string, unknown>;
  const vectorProvider = runtimeConfig.vectorStore?.provider;

  if (provider === 'sqlite') {
    return {
      dbPath: explicitDbPath
        ?? (typeof vectorConfig.path === 'string' ? vectorConfig.path : ':memory:'),
    };
  }

  if (provider === 'seekdb') {
    const seekdbPath = vectorProvider === 'oceanbase'
      ? vectorConfig.obPath
      : vectorConfig.path;
    const seekdbDatabase = vectorProvider === 'oceanbase'
      ? vectorConfig.dbName
      : vectorConfig.database;
    return {
      path: explicitDbPath
        ?? (typeof seekdbPath === 'string' ? seekdbPath : './seekdb_data'),
      database: typeof seekdbDatabase === 'string' ? seekdbDatabase : 'test',
      tableName: 'user_profiles',
    };
  }

  return {
    provider,
    storageType: runtimeConfig.vectorStore.provider,
  };
}

export class UserMemory {
  private readonly memory: Memory;
  private readonly profileStore: UserProfileStore;
  private readonly queryRewriter?: QueryRewriter;
  private readonly llm?: BaseChatModel;

  constructor(config: UserMemoryConfig) {
    this.memory = config.memory;
    this.profileStore = config.profileStore;
    this.queryRewriter = config.queryRewriter;
    this.llm = config.llm;
  }

  static async create(options: UserMemoryCreateOptions = {}): Promise<UserMemory> {
    const memoryOptions = buildMemoryOptions(options);
    const memory = options.memory ?? await (await import('../core/memory.js')).Memory.create(memoryOptions);
    setPayloadTimezoneFromConfig(memory.getRuntimeConfig().timezone?.timezone);
    const runtimeConfig = memory.getRuntimeConfig();
    const resolvedProfileStoreProvider = normalizeProfileStoreProvider(
      options.profileStoreProvider ?? runtimeConfig.vectorStore.provider ?? memory.getStorageType(),
    );

    const profileStore = options.profileStore ?? UserProfileStoreFactory.create(
      resolvedProfileStoreProvider,
      {
        ...buildDefaultProfileStoreConfig(
          resolvedProfileStoreProvider,
          runtimeConfig,
          options.profileDbPath,
        ),
        ...(options.profileStoreConfig ?? {}),
      },
    );

    const llm = options.llm ?? memory.getLLMInstance();
    let queryRewriter = options.queryRewriter;
    if (!queryRewriter && llm && runtimeConfig.queryRewrite) {
      queryRewriter = new QueryRewriter(llm, runtimeConfig.queryRewrite);
    }

    return new UserMemory({ memory, profileStore, queryRewriter, llm });
  }

  private async callLLMForExtraction(prompt: string): Promise<string> {
    if (!this.llm) return '';
    const response = await this.llm.invoke([
      new HumanMessage(prompt),
    ]);
    const text = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);
    return removeCodeBlocks(text).trim();
  }

  private async getExistingProfileData(
    userId: string,
  ): Promise<{ profileContent?: string; topics?: Record<string, unknown> }> {
    const profile = await this.profileStore.getProfileByUserId(userId);
    return {
      profileContent: profile?.profileContent,
      topics: profile?.topics,
    };
  }

  private async extractProfileContent(
    content: MemoryContent,
    options: UserMemoryAddOptions,
  ): Promise<string> {
    const conversation = parseConversationText(content).trim();
    if (!conversation) return '';
    if (options.profileContent !== undefined) return options.profileContent;
    if (!this.llm) return '';

    const existing = await this.getExistingProfileData(options.userId);
    const prompt = getUserProfileExtractionPrompt(conversation, {
      existingProfile: existing.profileContent,
      nativeLanguage: options.nativeLanguage,
    });

    const extracted = await this.callLLMForExtraction(prompt);
    if (!extracted || ['""', 'none', 'no profile information', 'no relevant information'].includes(extracted.toLowerCase())) {
      return '';
    }
    return extracted;
  }

  private async extractTopics(
    content: MemoryContent,
    options: UserMemoryAddOptions,
  ): Promise<Record<string, unknown> | undefined> {
    const conversation = parseConversationText(content).trim();
    if (!conversation) return undefined;
    if (options.topics !== undefined) return convertNumbersToStrings(options.topics) as Record<string, unknown>;
    if (!this.llm) return undefined;

    const existing = await this.getExistingProfileData(options.userId);
    const prompt = getUserProfileTopicsExtractionPrompt(conversation, {
      existingTopics: existing.topics,
      customTopics: options.customTopics,
      strictMode: options.strictMode,
      nativeLanguage: options.nativeLanguage,
    });

    const extracted = await this.callLLMForExtraction(prompt);
    if (!extracted || ['none', 'no profile information', 'no relevant information', '{}'].includes(extracted.toLowerCase())) {
      return undefined;
    }

    const parsed = parseJsonObject(extracted);
    if (!parsed) {
      throw new Error(`Invalid JSON format in topics response: ${extracted}`);
    }

    return convertNumbersToStrings(parsed) as Record<string, unknown>;
  }

  private async extractProfileData(
    content: MemoryContent,
    options: UserMemoryAddOptions,
  ): Promise<{ profileContent?: string; topics?: Record<string, unknown> }> {
    if ((options.profileType ?? 'content') === 'topics') {
      const topics = await this.extractTopics(content, options);
      return topics ? { topics } : {};
    }

    const profileContent = await this.extractProfileContent(content, options);
    return profileContent ? { profileContent } : {};
  }

  /** Add memory + optionally extract user profile from content or messages. */
  async add(
    content: MemoryContent,
    options: UserMemoryAddOptions,
  ): Promise<Record<string, unknown>> {
    const memResult = await this.memory.add(content, {
      userId: options.userId,
      agentId: options.agentId,
      runId: options.runId,
      metadata: options.metadata,
      filters: options.filters,
      infer: options.infer,
      scope: options.scope,
      category: options.memoryType,
    });

    const result: Record<string, unknown> = { ...memResult, profileExtracted: false };

    const shouldExtractProfile = options.extractProfile ?? true;
    if (shouldExtractProfile) {
      const filteredContent = filterMessagesByRoles(content, options.includeRoles, options.excludeRoles);
      const extracted = await this.extractProfileData(filteredContent, options);
      if (extracted.profileContent || extracted.topics) {
        await this.profileStore.saveProfile(options.userId, extracted.profileContent, extracted.topics);
        result.profileExtracted = true;
      }
      if (extracted.profileContent) {
        result.profileContent = extracted.profileContent;
      }
      if (extracted.topics) {
        result.topics = extracted.topics;
      }
    }

    return result;
  }

  /** Search with optional profile-aware query rewriting. */
  async search(
    query: string,
    options: {
      userId?: string;
      agentId?: string;
      limit?: number;
      threshold?: number;
      addProfile?: boolean;
    } = {}
  ): Promise<Record<string, unknown>> {
    let effectiveQuery = query;

    // Query rewrite with user profile context
    if (this.queryRewriter && options.userId) {
      const profile = await this.profileStore.getProfileByUserId(options.userId);
      if (profile?.profileContent) {
        const rewriteResult = await this.queryRewriter.rewrite(query, profile.profileContent);
        if (rewriteResult.isRewritten) {
          effectiveQuery = rewriteResult.rewrittenQuery;
        }
      }
    }

    const searchResult = await this.memory.search(effectiveQuery, {
      userId: options.userId,
      agentId: options.agentId,
      limit: options.limit,
      threshold: options.threshold,
    });

    const result: Record<string, unknown> = { ...searchResult };

    if (options.addProfile && options.userId) {
      const profile = await this.profileStore.getProfileByUserId(options.userId);
      if (profile) {
        result.profileContent = profile.profileContent;
        result.topics = profile.topics;
      }
    }

    return result;
  }

  /** Get user profile. */
  async profile(userId: string): Promise<UserProfile | null> {
    return this.profileStore.getProfileByUserId(userId);
  }

  /** List user profiles, optionally filtered. */
  async profileList(options: UserMemoryProfileListOptions = {}): Promise<UserProfile[]> {
    return this.profileStore.getProfiles({
      userId: options.userId,
      fuzzy: options.fuzzy,
      mainTopic: normalizeStringArray(options.mainTopic),
      subTopic: normalizeStringArray(options.subTopic),
      topicValue: normalizeStringArray(options.topicValue),
      limit: options.limit,
      offset: options.offset,
    });
  }

  async countProfiles(userId?: string, fuzzy?: boolean): Promise<number> {
    return this.profileStore.countProfiles(userId, fuzzy);
  }

  /** Delete user profile. */
  async deleteProfile(userId: string): Promise<boolean> {
    const profile = await this.profileStore.getProfileByUserId(userId);
    if (!profile) return false;
    return this.profileStore.deleteProfile(profile.id);
  }

  async get(memoryId: string, _options: { userId?: string; agentId?: string } = {}): Promise<MemoryRecord | null> {
    return this.memory.get(memoryId);
  }

  async update(
    memoryId: string,
    content: string,
    options: { userId?: string; agentId?: string; metadata?: Record<string, unknown> } = {},
  ): Promise<MemoryRecord> {
    return this.memory.update(memoryId, content, { metadata: options.metadata });
  }

  async delete(
    memoryId: string,
    options: { userId?: string; agentId?: string; deleteProfile?: boolean } = {},
  ): Promise<boolean> {
    const deleted = await this.memory.delete(memoryId);
    if (deleted && options.deleteProfile && options.userId) {
      await this.deleteProfile(options.userId);
    }
    return deleted;
  }

  async getAll(options: {
    userId?: string;
    agentId?: string;
    runId?: string;
    limit?: number;
    offset?: number;
    filters?: Record<string, unknown>;
    sortBy?: string;
    order?: 'asc' | 'desc';
  } = {}): Promise<MemoryListResult> {
    return this.memory.getAll({
      userId: options.userId,
      agentId: options.agentId,
      runId: options.runId,
      limit: options.limit,
      offset: options.offset,
      sortBy: options.sortBy,
      order: options.order,
    });
  }

  getMemory(): Memory {
    return this.memory;
  }

  /** Delete all memories + profile for a user. */
  async deleteAll(userId: string, options: { deleteProfile?: boolean } = {}): Promise<boolean> {
    await this.memory.deleteAll({ userId });
    if (options.deleteProfile) {
      const profile = await this.profileStore.getProfileByUserId(userId);
      if (profile) await this.profileStore.deleteProfile(profile.id);
    }
    return true;
  }

  async reset(): Promise<void> {
    await this.memory.reset();
  }

  async close(): Promise<void> {
    await this.memory.close();
    await this.profileStore.close();
  }
}
