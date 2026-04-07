/**
 * UserMemory — user profile extraction and profile-aware search.
 * Port of Python powermem/user_memory/user_memory.py.
 */
import { extractTextFromContent } from '../utils/messages.js';
import type { Memory } from '../core/memory.js';
import type { MemoryContent } from '../types/memory.js';
import type { MemoryOptions } from '../types/options.js';
import type { UserProfileStore, UserProfile } from './storage/base.js';
import { UserProfileStoreFactory } from './storage/factory.js';
import type { QueryRewriter } from './query-rewrite/rewriter.js';

export interface UserMemoryConfig {
  memory: Memory;
  profileStore: UserProfileStore;
  queryRewriter?: QueryRewriter;
}

type ProfileType = 'content' | 'topics';

function toConversationText(content: MemoryContent): string {
  if (typeof content === 'string') return content;
  return extractTextFromContent(content);
}

function buildTopicsProfile(content: string): Record<string, unknown> {
  const sentences = content
    .split(/[.!?\n]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return {
    general: {
      summary: content.slice(0, 200),
      highlights: sentences.slice(0, 5),
    },
  };
}

export class UserMemory {
  private readonly memory: Memory;
  private readonly profileStore: UserProfileStore;
  private readonly queryRewriter?: QueryRewriter;

  constructor(config: UserMemoryConfig) {
    this.memory = config.memory;
    this.profileStore = config.profileStore;
    this.queryRewriter = config.queryRewriter;
  }

  static async create(options: {
    memory?: Memory;
    memoryOptions?: MemoryOptions;
    profileStore?: UserProfileStore;
    profileStoreProvider?: string;
    profileStoreConfig?: Record<string, unknown>;
    queryRewriter?: QueryRewriter;
    profileDbPath?: string;
  } = {}): Promise<UserMemory> {
    const memory = options.memory ?? await (await import('../core/memory.js')).Memory.create(options.memoryOptions ?? {});
    const profileStore = options.profileStore ?? UserProfileStoreFactory.create(
      options.profileStoreProvider ?? 'sqlite',
      {
        dbPath: options.profileDbPath ?? ':memory:',
        ...(options.profileStoreConfig ?? {}),
      },
    );
    return new UserMemory({ memory, profileStore, queryRewriter: options.queryRewriter });
  }

  private async extractProfileData(
    content: MemoryContent,
    options: {
      profileType?: ProfileType;
      profileContent?: string;
      topics?: Record<string, unknown>;
      nativeLanguage?: string;
    },
  ): Promise<{ profileContent?: string; topics?: Record<string, unknown> }> {
    const conversation = toConversationText(content);
    if (options.profileType === 'topics') {
      return {
        topics: options.topics ?? buildTopicsProfile(conversation),
      };
    }

    const profileContent = options.profileContent
      ?? (options.nativeLanguage ? `[${options.nativeLanguage}] ${conversation}` : conversation);
    return { profileContent };
  }

  /** Add memory + optionally extract user profile from content or messages. */
  async add(
    content: MemoryContent,
    options: {
      userId: string;
      agentId?: string;
      metadata?: Record<string, unknown>;
      infer?: boolean;
      extractProfile?: boolean;
      profileType?: ProfileType;
      profileContent?: string;
      topics?: Record<string, unknown>;
      nativeLanguage?: string;
    }
  ): Promise<Record<string, unknown>> {
    const memResult = await this.memory.add(content, {
      userId: options.userId,
      agentId: options.agentId,
      metadata: options.metadata,
      infer: options.infer,
    });

    const result: Record<string, unknown> = { ...memResult, profileExtracted: false };

    if (options.extractProfile) {
      const extracted = await this.extractProfileData(content, options);
      await this.profileStore.saveProfile(options.userId, extracted.profileContent, extracted.topics);
      result.profileExtracted = true;
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
  async profileList(options: { userId?: string; mainTopic?: string; subTopic?: string; limit?: number; offset?: number } = {}): Promise<UserProfile[]> {
    return this.profileStore.getProfiles(options);
  }

  /** Delete user profile. */
  async deleteProfile(userId: string): Promise<boolean> {
    const profile = await this.profileStore.getProfileByUserId(userId);
    if (!profile) return false;
    return this.profileStore.deleteProfile(profile.id);
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

  async close(): Promise<void> {
    await this.memory.close();
    await this.profileStore.close();
  }
}
