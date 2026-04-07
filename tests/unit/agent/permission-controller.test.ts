/**
 * PermissionController tests.
 */
import { describe, it, expect } from 'vitest';
import { PermissionController } from '../../../src/powermem/agent/components/permission-controller.js';
import { AccessPermission } from '../../../src/powermem/agent/types.js';

describe('PermissionController', () => {
  it('default permissions allow READ', async () => {
    const ctrl = new PermissionController();
    expect(await ctrl.checkPermission('agent1', 'mem1', AccessPermission.READ)).toBe(true);
  });

  it('default permissions deny WRITE', async () => {
    const ctrl = new PermissionController();
    expect(await ctrl.checkPermission('agent1', 'mem1', AccessPermission.WRITE)).toBe(false);
  });

  it('grantPermission enables access', async () => {
    const ctrl = new PermissionController();
    await ctrl.grantPermission('mem1', 'agent1', AccessPermission.WRITE, 'admin');
    expect(await ctrl.checkPermission('agent1', 'mem1', AccessPermission.WRITE)).toBe(true);
  });

  it('revokePermission removes access', async () => {
    const ctrl = new PermissionController();
    await ctrl.grantPermission('mem1', 'agent1', AccessPermission.WRITE, 'admin');
    await ctrl.revokePermission('mem1', 'agent1', AccessPermission.WRITE, 'admin');
    expect(await ctrl.checkPermission('agent1', 'mem1', AccessPermission.WRITE)).toBe(false);
  });

  it('getPermissions returns current permissions', async () => {
    const ctrl = new PermissionController();
    await ctrl.grantPermission('mem1', 'agent1', AccessPermission.WRITE, 'admin');
    await ctrl.grantPermission('mem1', 'agent1', AccessPermission.DELETE, 'admin');
    const perms = await ctrl.getPermissions('mem1', 'agent1');
    expect(perms.permissionCount).toBe(2);
    expect((perms.permissions as string[]).sort()).toEqual([AccessPermission.DELETE, AccessPermission.WRITE].sort());
  });

  it('getPermissionHistory tracks access', async () => {
    const ctrl = new PermissionController();
    await ctrl.checkPermission('agent1', 'mem1', AccessPermission.READ);
    await ctrl.grantPermission('mem1', 'agent1', AccessPermission.WRITE, 'admin');
    const history = await ctrl.getPermissionHistory('mem1');
    expect(history.length).toBeGreaterThanOrEqual(2);
  });

  it('custom default permissions', async () => {
    const ctrl = new PermissionController({
      defaultPermissions: [AccessPermission.READ, AccessPermission.WRITE],
    });
    expect(await ctrl.checkPermission('any', 'any', AccessPermission.WRITE)).toBe(true);
    expect(await ctrl.checkPermission('any', 'any', AccessPermission.DELETE)).toBe(false);
  });
});
