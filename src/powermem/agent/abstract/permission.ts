/**
 * Permission strategy abstract interface.
 * Port of Python powermem/agent/abstract/permission.py.
 */
import type { AccessPermission } from '../types.js';

export interface PermissionStrategy {
  initialize(): Promise<void>;
  checkPermission(agentId: string, memoryId: string, permission: AccessPermission): Promise<boolean>;
  grantPermission(memoryId: string, agentId: string, permission: AccessPermission, grantedBy: string): Promise<Record<string, unknown>>;
  revokePermission(memoryId: string, agentId: string, permission: AccessPermission, revokedBy: string): Promise<Record<string, unknown>>;
  getPermissions(memoryId: string, agentId: string): Promise<Record<string, unknown>>;
  getPermissionHistory(memoryId: string, agentId?: string, limit?: number): Promise<Array<Record<string, unknown>>>;
}
