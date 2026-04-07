import type { Memory } from '../../powermem/core/memory.js';

export class UserService {
  constructor(private readonly memory: Memory) {}

  async listProfiles(limit = 20) {
    const users = await this.memory.getUsers(limit);
    const profiles = await Promise.all(users.map(async (userId) => ({
      userId,
      memoryCount: await this.memory.count({ userId }),
    })));
    return { profiles, total: profiles.length };
  }

  async getProfile(userId: string) {
    const memoryCount = await this.memory.count({ userId });
    const stats = await this.memory.getStatistics({ userId });
    return { userId, memoryCount, ...stats };
  }

  addProfile(userId: string, content: string, metadata?: Record<string, unknown>, infer = true) {
    return this.memory.add(content, {
      userId,
      metadata: { ...metadata, profileExtraction: true },
      infer,
    });
  }

  deleteProfile(userId: string) {
    return this.memory.deleteAll({ userId });
  }

  listMemories(userId: string, limit = 100, offset = 0) {
    return this.memory.getAll({ userId, limit, offset });
  }

  updateMemory(memoryId: string, content: string, metadata?: Record<string, unknown>) {
    return this.memory.update(memoryId, content, { metadata });
  }

  deleteMemories(userId: string) {
    return this.memory.deleteAll({ userId });
  }
}
