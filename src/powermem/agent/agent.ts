/**
 * AgentMemory — unified agent memory interface.
 * Port of Python powermem/agent/agent.py.
 */
import type { Memory } from '../core/memory.js';
import type { ScopeStrategy } from './abstract/scope.js';
import type { PermissionStrategy } from './abstract/permission.js';
import { AgentFactory } from './factories/agent-factory.js';
import { MemoryScope, AccessPermission } from './types.js';

export interface AgentMemoryConfig {
  mode?: 'multi_agent' | 'multi_user' | 'hybrid' | 'auto';
  defaultScope?: MemoryScope;
  enableCollaboration?: boolean;
  [key: string]: unknown;
}

export class AgentMemory {
  private readonly memory: Memory;
  private readonly mode: string;
  private readonly scopeManager: ScopeStrategy;
  private readonly permissionManager: PermissionStrategy;

  constructor(memory: Memory, config: AgentMemoryConfig = {}) {
    this.memory = memory;
    this.mode = config.mode ?? 'multi_agent';
    this.scopeManager = AgentFactory.createScopeManager(config);
    this.permissionManager = AgentFactory.createPermissionManager(config);
  }

  getMode(): string {
    return this.mode;
  }

  async add(
    content: string,
    options: { userId?: string; agentId?: string; metadata?: Record<string, unknown>; scope?: MemoryScope } = {}
  ): Promise<Record<string, unknown>> {
    const scope = options.scope ?? await this.scopeManager.determineScope(
      options.agentId ?? '', undefined, options.metadata
    );

    const result = await this.memory.add(content, {
      userId: options.userId,
      agentId: options.agentId,
      metadata: { ...options.metadata, scope },
    });

    return { ...result, scope };
  }

  async search(
    query: string,
    options: { userId?: string; agentId?: string; limit?: number } = {}
  ): Promise<Array<Record<string, unknown>>> {
    const result = await this.memory.search(query, {
      userId: options.userId,
      agentId: options.agentId,
      limit: options.limit,
    });
    return result.results as unknown as Array<Record<string, unknown>>;
  }

  async getAll(
    options: { userId?: string; agentId?: string; limit?: number } = {}
  ): Promise<Array<Record<string, unknown>>> {
    const result = await this.memory.getAll({
      userId: options.userId,
      agentId: options.agentId,
      limit: options.limit,
    });
    return result.memories as unknown as Array<Record<string, unknown>>;
  }

  async update(
    memoryId: string,
    content: string,
    options: { userId?: string; agentId?: string } = {}
  ): Promise<Record<string, unknown>> {
    const hasPermission = await this.permissionManager.checkPermission(
      options.agentId ?? '', memoryId, AccessPermission.WRITE
    );
    if (!hasPermission) {
      throw new Error(`Agent ${options.agentId} does not have write permission for memory ${memoryId}`);
    }
    return this.memory.update(memoryId, content) as unknown as Record<string, unknown>;
  }

  async delete(
    memoryId: string,
    _options: { userId?: string; agentId?: string } = {}
  ): Promise<boolean> {
    return this.memory.delete(memoryId);
  }

  async deleteAll(options: { userId?: string; agentId?: string } = {}): Promise<boolean> {
    return this.memory.deleteAll({ userId: options.userId, agentId: options.agentId });
  }

  async reset(): Promise<void> {
    await this.memory.reset();
  }

  async getStatistics(): Promise<Record<string, unknown>> {
    const scopeStats = await this.scopeManager.getScopeStatistics();
    const count = await this.memory.count();
    return { mode: this.mode, totalMemories: count, ...scopeStats };
  }

  async grantPermission(
    memoryId: string,
    agentId: string,
    permission: AccessPermission,
    grantedBy: string
  ): Promise<Record<string, unknown>> {
    return this.permissionManager.grantPermission(memoryId, agentId, permission, grantedBy);
  }

  async checkPermission(
    agentId: string,
    memoryId: string,
    permission: AccessPermission
  ): Promise<boolean> {
    return this.permissionManager.checkPermission(agentId, memoryId, permission);
  }

  async close(): Promise<void> {
    await this.memory.close();
  }
}
