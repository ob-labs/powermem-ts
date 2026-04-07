/**
 * Scope strategy abstract interface.
 * Port of Python powermem/agent/abstract/scope.py.
 */
import type { MemoryScope } from '../types.js';

export interface ScopeStrategy {
  initialize(): Promise<void>;
  determineScope(agentId: string, context?: Record<string, unknown>, metadata?: Record<string, unknown>): Promise<MemoryScope>;
  getAccessibleMemories(agentId: string, scope: MemoryScope): Promise<string[]>;
  checkScopeAccess(agentId: string, memoryId: string): Promise<boolean>;
  updateMemoryScope(memoryId: string, newScope: MemoryScope, agentId: string): Promise<Record<string, unknown>>;
  getScopeStatistics(): Promise<Record<string, unknown>>;
}
