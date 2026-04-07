/**
 * ScopeController tests.
 */
import { describe, it, expect } from 'vitest';
import { ScopeController } from '../../../src/powermem/agent/components/scope-controller.js';
import { MemoryScope } from '../../../src/powermem/agent/types.js';

describe('ScopeController', () => {
  it('defaults to PRIVATE scope', async () => {
    const ctrl = new ScopeController();
    const scope = await ctrl.determineScope('agent1');
    expect(scope).toBe(MemoryScope.PRIVATE);
  });

  it('respects scope hint from metadata', async () => {
    const ctrl = new ScopeController();
    const scope = await ctrl.determineScope('agent1', undefined, { scope: MemoryScope.PUBLIC });
    expect(scope).toBe(MemoryScope.PUBLIC);
  });

  it('respects config default scope', async () => {
    const ctrl = new ScopeController({ defaultScope: MemoryScope.AGENT_GROUP });
    const scope = await ctrl.determineScope('agent1');
    expect(scope).toBe(MemoryScope.AGENT_GROUP);
  });

  it('updateMemoryScope moves memory between scopes', async () => {
    const ctrl = new ScopeController();
    const result = await ctrl.updateMemoryScope('mem1', MemoryScope.PUBLIC, 'agent1');
    expect(result.success).toBe(true);
    expect(result.newScope).toBe(MemoryScope.PUBLIC);
  });

  it('getScopeStatistics returns counts', async () => {
    const ctrl = new ScopeController();
    await ctrl.updateMemoryScope('mem1', MemoryScope.PRIVATE, 'agent1');
    await ctrl.updateMemoryScope('mem2', MemoryScope.PUBLIC, 'agent1');
    const stats = await ctrl.getScopeStatistics();
    expect(stats.totalMemories).toBe(2);
    expect((stats.scopeBreakdown as any)[MemoryScope.PRIVATE]).toBe(1);
    expect((stats.scopeBreakdown as any)[MemoryScope.PUBLIC]).toBe(1);
  });
});
