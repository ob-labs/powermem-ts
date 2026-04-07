/**
 * Agent component factory.
 * Port of Python powermem/agent/factories/agent_factory.py.
 */
import type { ScopeStrategy } from '../abstract/scope.js';
import type { PermissionStrategy } from '../abstract/permission.js';
import { ScopeController } from '../components/scope-controller.js';
import { PermissionController } from '../components/permission-controller.js';

export class AgentFactory {
  static createScopeManager(config: Record<string, unknown> = {}): ScopeStrategy {
    return new ScopeController(config);
  }

  static createPermissionManager(config: Record<string, unknown> = {}): PermissionStrategy {
    return new PermissionController(config);
  }
}
