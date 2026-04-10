import type { Memory } from '../../powermem/core/memory.js';
import type { MemoryConfigInput } from '../../powermem/configs.js';
import type { MemoryOptions } from '../../powermem/types/options.js';
import { autoConfig } from '../../powermem/config_loader.js';
import { Memory as MemoryClass } from '../../powermem/core/memory.js';
import { AgentMemory } from '../../powermem/agent/agent.js';

export interface AgentServiceCreateOptions {
  config?: MemoryConfigInput;
  memory?: Memory;
  memoryOptions?: MemoryOptions;
}

export class AgentService {
  constructor(
    private readonly memory: Memory,
    private readonly agentMemory: AgentMemory,
  ) {}

  static async create(options: AgentServiceCreateOptions = {}): Promise<AgentService> {
    const memory = options.memory ?? await MemoryClass.create({
      ...(options.memoryOptions ?? {}),
      config: options.memoryOptions?.config ?? options.config ?? autoConfig(),
    });
    const agentMemory = new AgentMemory(memory);
    return new AgentService(memory, agentMemory);
  }

  listMemories(agentId: string, limit = 100, offset = 0) {
    return this.memory.getAll({ agentId, limit, offset });
  }

  addMemory(agentId: string, content: string, options: { userId?: string; infer?: boolean; metadata?: Record<string, unknown> } = {}) {
    return this.agentMemory.add(content, {
      agentId,
      userId: options.userId,
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

  async close(): Promise<void> {
    await this.agentMemory.close();
  }
}
