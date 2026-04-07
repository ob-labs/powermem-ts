/**
 * Collaboration strategy abstract interface.
 */
export interface CollaborationStrategy {
  initialize(): Promise<void>;
  shareMemory(memoryId: string, fromAgent: string, toAgents: string[], permissions?: Record<string, unknown>): Promise<Record<string, unknown>>;
  getSharedMemories(agentId: string): Promise<Array<Record<string, unknown>>>;
  createGroup(groupName: string, agentIds: string[], permissions?: Record<string, unknown>): Promise<Record<string, unknown>>;
}
