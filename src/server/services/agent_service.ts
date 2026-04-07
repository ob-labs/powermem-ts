import type { Memory } from '../../powermem/core/memory.js';

export class AgentService {
  constructor(private readonly memory: Memory) {}

  listMemories(agentId: string, limit = 100, offset = 0) {
    return this.memory.getAll({ agentId, limit, offset });
  }

  addMemory(agentId: string, content: string, options: { userId?: string; infer?: boolean; metadata?: Record<string, unknown> } = {}) {
    return this.memory.add(content, {
      agentId,
      userId: options.userId,
      infer: options.infer ?? false,
      metadata: options.metadata,
    });
  }

  async listSharedMemories(agentId: string, limit = 100) {
    const result = await this.memory.getAll({ agentId, limit });
    const memories = result.memories.filter((memory) =>
      memory.metadata && (memory.metadata as Record<string, unknown>).scope === 'shared'
    );
    return { memories, total: memories.length };
  }

  async shareMemories(agentId: string, memoryIds: string[], targetAgentId: string) {
    let sharedCount = 0;
    for (const memoryId of memoryIds) {
      const existing = await this.memory.get(memoryId);
      if (!existing) continue;
      await this.memory.add(existing.content, {
        agentId: targetAgentId,
        metadata: { ...existing.metadata, scope: 'shared', sharedFrom: agentId },
        infer: false,
      });
      sharedCount++;
    }
    return { shared_count: sharedCount };
  }
}
