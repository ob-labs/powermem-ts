/**
 * Agent memory manager abstract interface.
 */
export interface AgentMemoryManager {
  add(content: string, userId?: string, agentId?: string, metadata?: Record<string, unknown>): Promise<Record<string, unknown>>;
  search(query: string, userId?: string, agentId?: string, limit?: number): Promise<Array<Record<string, unknown>>>;
  getAll(userId?: string, agentId?: string, limit?: number): Promise<Array<Record<string, unknown>>>;
  update(memoryId: string, content: string, userId?: string, agentId?: string): Promise<Record<string, unknown>>;
  delete(memoryId: string, userId?: string, agentId?: string): Promise<boolean>;
  deleteAll(userId?: string, agentId?: string): Promise<boolean>;
  reset(): Promise<void>;
  getStatistics(): Promise<Record<string, unknown>>;
}
