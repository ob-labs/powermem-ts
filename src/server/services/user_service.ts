import type { MemoryContent } from '../../powermem/types/memory.js';
import type { MemoryConfigInput } from '../../powermem/configs.js';
import { autoConfig } from '../../powermem/config_loader.js';
import { UserMemory, type UserMemoryCreateOptions } from '../../powermem/user_memory/user_memory.js';
import { APIError, ErrorCode } from '../models/errors.js';

export interface UserServiceCreateOptions extends UserMemoryCreateOptions {
  config?: MemoryConfigInput;
  userMemory?: UserMemory;
}

export class UserService {
  constructor(private readonly userMemory: UserMemory) {}

  static async create(options: UserServiceCreateOptions = {}): Promise<UserService> {
    const userMemory = options.userMemory ?? await UserMemory.create({
      ...options,
      config: options.config ?? options.memoryOptions?.config ?? autoConfig(),
    });
    return new UserService(userMemory);
  }

  getUserMemory(): UserMemory {
    return this.userMemory;
  }

  async listProfiles(options: {
    userId?: string;
    fuzzy?: boolean;
    mainTopic?: string | string[];
    subTopic?: string | string[];
    topicValue?: string | string[];
    limit?: number;
    offset?: number;
  } = {}) {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    const profiles = await this.userMemory.profileList({
      userId: options.userId,
      fuzzy: options.fuzzy,
      mainTopic: options.mainTopic,
      subTopic: options.subTopic,
      topicValue: options.topicValue,
      limit,
      offset,
    });
    const total = await this.userMemory.countProfiles(options.userId, options.fuzzy);
    return { profiles, total, limit, offset };
  }

  async getProfile(userId: string) {
    const profile = await this.userMemory.profile(userId);
    if (!profile) {
      throw new APIError(
        ErrorCode.USER_PROFILE_NOT_FOUND,
        `User profile for ${userId} not found`,
        { user_id: userId },
        404,
      );
    }
    return profile;
  }

  addProfile(
    userId: string,
    messages: MemoryContent,
    options: {
      agentId?: string;
      runId?: string;
      metadata?: Record<string, unknown>;
      filters?: Record<string, unknown>;
      scope?: string;
      memoryType?: string;
      prompt?: string;
      infer?: boolean;
      profileType?: 'content' | 'topics';
      customTopics?: string | Record<string, unknown>;
      strictMode?: boolean;
      includeRoles?: string[] | null;
      excludeRoles?: string[] | null;
      nativeLanguage?: string;
    } = {},
  ) {
    return this.userMemory.add(messages, {
      userId,
      agentId: options.agentId,
      runId: options.runId,
      metadata: options.metadata,
      filters: options.filters,
      scope: options.scope,
      memoryType: options.memoryType,
      prompt: options.prompt,
      infer: options.infer ?? true,
      profileType: options.profileType ?? 'content',
      customTopics: options.customTopics,
      strictMode: options.strictMode ?? false,
      includeRoles: options.includeRoles ?? ['user'],
      excludeRoles: options.excludeRoles ?? ['assistant'],
      nativeLanguage: options.nativeLanguage,
    });
  }

  async deleteProfile(userId: string) {
    const deleted = await this.userMemory.deleteProfile(userId);
    if (!deleted) {
      throw new APIError(
        ErrorCode.USER_PROFILE_NOT_FOUND,
        `User profile for ${userId} not found`,
        { user_id: userId },
        404,
      );
    }
    return { userId, deleted: true };
  }

  listMemories(userId: string, limit = 100, offset = 0) {
    return this.userMemory.getAll({ userId, limit, offset });
  }

  updateMemory(
    userId: string,
    memoryId: string,
    content: string,
    agentId?: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.userMemory.update(memoryId, content, { userId, agentId, metadata });
  }

  async deleteMemories(userId: string) {
    const before = await this.userMemory.getAll({ userId, limit: 10000, offset: 0 });
    const total = Array.isArray(before.memories) ? before.memories.length : 0;
    const success = await this.userMemory.deleteAll(userId);
    return {
      userId,
      deleted_count: success ? total : 0,
      failed_count: success ? 0 : total,
      total,
    };
  }

  async close(): Promise<void> {
    await this.userMemory.close();
  }
}
