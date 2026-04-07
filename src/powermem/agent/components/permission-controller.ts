/**
 * Permission controller — manages memory access permissions.
 * Port of Python powermem/agent/components/permission_controller.py.
 */
import type { PermissionStrategy } from '../abstract/permission.js';
import { AccessPermission } from '../types.js';

interface AccessLogEntry {
  agentId: string;
  memoryId: string;
  permission: AccessPermission;
  result: boolean;
  action?: string;
  performedBy?: string;
  timestamp: string;
}

export class PermissionController implements PermissionStrategy {
  private memoryPermissions = new Map<string, Map<string, Set<AccessPermission>>>();
  private accessLog: AccessLogEntry[] = [];
  private defaultPermissions: AccessPermission[];

  constructor(config: Record<string, unknown> = {}) {
    this.defaultPermissions = (config.defaultPermissions as AccessPermission[]) ?? [AccessPermission.READ];
  }

  async initialize(): Promise<void> {}

  async checkPermission(agentId: string, memoryId: string, permission: AccessPermission): Promise<boolean> {
    const memPerms = this.memoryPermissions.get(memoryId);
    if (memPerms) {
      const agentPerms = memPerms.get(agentId);
      if (agentPerms?.has(permission)) {
        this.logAccess(agentId, memoryId, permission, true);
        return true;
      }
    }

    // Check defaults
    const result = this.defaultPermissions.includes(permission);
    this.logAccess(agentId, memoryId, permission, result);
    return result;
  }

  async grantPermission(
    memoryId: string, agentId: string, permission: AccessPermission, grantedBy: string
  ): Promise<Record<string, unknown>> {
    if (!this.memoryPermissions.has(memoryId)) {
      this.memoryPermissions.set(memoryId, new Map());
    }
    const memPerms = this.memoryPermissions.get(memoryId)!;
    if (!memPerms.has(agentId)) {
      memPerms.set(agentId, new Set());
    }
    memPerms.get(agentId)!.add(permission);

    this.logPermissionChange(memoryId, agentId, permission, 'grant', grantedBy);
    return { success: true, memoryId, agentId, permission, grantedBy, grantedAt: new Date().toISOString() };
  }

  async revokePermission(
    memoryId: string, agentId: string, permission: AccessPermission, revokedBy: string
  ): Promise<Record<string, unknown>> {
    const memPerms = this.memoryPermissions.get(memoryId);
    if (memPerms) {
      const agentPerms = memPerms.get(agentId);
      agentPerms?.delete(permission);
    }

    this.logPermissionChange(memoryId, agentId, permission, 'revoke', revokedBy);
    return { success: true, memoryId, agentId, permission, revokedBy, revokedAt: new Date().toISOString() };
  }

  async getPermissions(memoryId: string, agentId: string): Promise<Record<string, unknown>> {
    const memPerms = this.memoryPermissions.get(memoryId);
    const agentPerms = memPerms?.get(agentId);
    const permissions = agentPerms ? Array.from(agentPerms) : [...this.defaultPermissions];
    return { memoryId, agentId, permissions, permissionCount: permissions.length };
  }

  async getPermissionHistory(memoryId: string, agentId?: string, limit = 50): Promise<Array<Record<string, unknown>>> {
    let filtered = this.accessLog.filter((e) => e.memoryId === memoryId);
    if (agentId) filtered = filtered.filter((e) => e.agentId === agentId);
    filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return filtered.slice(0, limit) as unknown as Array<Record<string, unknown>>;
  }

  private logAccess(agentId: string, memoryId: string, permission: AccessPermission, result: boolean): void {
    this.accessLog.push({ agentId, memoryId, permission, result, timestamp: new Date().toISOString() });
  }

  private logPermissionChange(
    memoryId: string, agentId: string, permission: AccessPermission, action: string, performedBy: string
  ): void {
    this.accessLog.push({
      agentId, memoryId, permission, result: true, action, performedBy, timestamp: new Date().toISOString(),
    });
  }
}
