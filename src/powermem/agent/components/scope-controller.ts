/**
 * Scope controller — determines and manages memory scopes.
 * Port of Python powermem/agent/components/scope_controller.py.
 */
import type { ScopeStrategy } from '../abstract/scope.js';
import { MemoryScope } from '../types.js';

export class ScopeController implements ScopeStrategy {
  private scopeStorage = new Map<MemoryScope, Map<string, Record<string, unknown>>>();

  constructor(private readonly config: Record<string, unknown> = {}) {
    for (const scope of Object.values(MemoryScope)) {
      this.scopeStorage.set(scope, new Map());
    }
  }

  async initialize(): Promise<void> {}

  async determineScope(
    _agentId: string,
    _context?: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<MemoryScope> {
    const hint = metadata?.scope as string | undefined;
    if (hint && Object.values(MemoryScope).includes(hint as MemoryScope)) {
      return hint as MemoryScope;
    }
    return (this.config.defaultScope as MemoryScope) ?? MemoryScope.PRIVATE;
  }

  async getAccessibleMemories(agentId: string, scope: MemoryScope): Promise<string[]> {
    const scopeMap = this.scopeStorage.get(scope);
    if (!scopeMap) return [];
    const ids: string[] = [];
    for (const id of scopeMap.keys()) {
      if (await this.checkScopeAccess(agentId, id)) {
        ids.push(id);
      }
    }
    return ids;
  }

  async checkScopeAccess(agentId: string, memoryId: string): Promise<boolean> {
    for (const [scope, scopeMap] of this.scopeStorage) {
      const data = scopeMap.get(memoryId);
      if (data) {
        if (scope === MemoryScope.PUBLIC) return true;
        if (scope === MemoryScope.PRIVATE && data.ownerId === agentId) return true;
        if (scope === MemoryScope.AGENT_GROUP) {
          const members = (data.groupMembers as string[]) ?? [];
          if (members.includes(agentId)) return true;
        }
      }
    }
    return false;
  }

  async updateMemoryScope(
    memoryId: string,
    newScope: MemoryScope,
    agentId: string
  ): Promise<Record<string, unknown>> {
    let oldScope: MemoryScope | undefined;
    let data: Record<string, unknown> | undefined;

    for (const [scope, scopeMap] of this.scopeStorage) {
      if (scopeMap.has(memoryId)) {
        oldScope = scope;
        data = scopeMap.get(memoryId);
        scopeMap.delete(memoryId);
        break;
      }
    }

    if (!data) data = { ownerId: agentId };
    this.scopeStorage.get(newScope)!.set(memoryId, data);

    return { success: true, memoryId, oldScope, newScope, updatedBy: agentId };
  }

  async getScopeStatistics(): Promise<Record<string, unknown>> {
    const breakdown: Record<string, number> = {};
    let total = 0;
    for (const [scope, scopeMap] of this.scopeStorage) {
      breakdown[scope] = scopeMap.size;
      total += scopeMap.size;
    }
    return { totalMemories: total, scopeBreakdown: breakdown };
  }
}
