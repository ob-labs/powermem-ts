/**
 * Context strategy abstract interface.
 */
export interface ContextStrategy {
  initialize(): Promise<void>;
  getContext(agentId: string): Promise<Record<string, unknown>>;
  updateContext(agentId: string, context: Record<string, unknown>): Promise<void>;
}
