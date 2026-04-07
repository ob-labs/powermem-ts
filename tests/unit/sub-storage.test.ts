import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SubStorageRouter, SubStoreMigrationManager } from '../../src/storage/sub-storage.js';
import { SQLiteStore } from '../../src/storage/sqlite/sqlite.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('SubStoreMigrationManager', () => {
  it('starts in pending state', () => {
    const mgr = new SubStoreMigrationManager();
    mgr.register('test');
    expect(mgr.getStatus('test')!.status).toBe('pending');
    expect(mgr.isReady('test')).toBe(true);
  });

  it('tracks migration lifecycle', () => {
    const mgr = new SubStoreMigrationManager();
    mgr.register('s1');
    mgr.markMigrating('s1', 100);
    expect(mgr.getStatus('s1')!.status).toBe('migrating');
    expect(mgr.isReady('s1')).toBe(false);

    mgr.updateProgress('s1', 50);
    expect(mgr.getStatus('s1')!.migratedCount).toBe(50);

    mgr.markCompleted('s1');
    expect(mgr.getStatus('s1')!.status).toBe('completed');
    expect(mgr.isReady('s1')).toBe(true);
  });

  it('handles failure state', () => {
    const mgr = new SubStoreMigrationManager();
    mgr.register('s1');
    mgr.markMigrating('s1', 10);
    mgr.markFailed('s1', 'connection lost');
    expect(mgr.getStatus('s1')!.status).toBe('failed');
    expect(mgr.getStatus('s1')!.errorMessage).toBe('connection lost');
    expect(mgr.isReady('s1')).toBe(false);
  });

  it('getAllStatuses returns all', () => {
    const mgr = new SubStoreMigrationManager();
    mgr.register('a');
    mgr.register('b');
    expect(mgr.getAllStatuses()).toHaveLength(2);
  });
});

describe('SubStorageRouter', () => {
  let tmpDir: string;
  let mainStore: SQLiteStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sub-test-'));
    mainStore = new SQLiteStore(path.join(tmpDir, 'main.db'));
  });

  afterEach(async () => {
    await mainStore.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('routes to main store by default', () => {
    const router = new SubStorageRouter(mainStore);
    expect(router.routeToStore()).toBe(mainStore);
  });

  it('routes via dict filter', () => {
    const subStore = new SQLiteStore(path.join(tmpDir, 'sub.db'));
    const router = new SubStorageRouter(mainStore);
    router.registerSubStore({ name: 'vip', store: subStore, routingFilter: { scope: 'vip' } });

    expect(router.routeToStore({ scope: 'vip' })).toBe(subStore);
    expect(router.routeToStore({ scope: 'general' })).toBe(mainStore);
    subStore.close();
  });

  it('routes via match function', () => {
    const subStore = new SQLiteStore(path.join(tmpDir, 'sub.db'));
    const router = new SubStorageRouter(mainStore);
    router.registerSubStore({
      name: 'archived',
      store: subStore,
      match: (p) => p.metadata?.archived === true,
    });

    expect(router.routeToStore({ metadata: { archived: true } })).toBe(subStore);
    expect(router.routeToStore({ metadata: { archived: false } })).toBe(mainStore);
    subStore.close();
  });

  it('listSubStores and getStoreByName', () => {
    const s1 = new SQLiteStore(path.join(tmpDir, 's1.db'));
    const s2 = new SQLiteStore(path.join(tmpDir, 's2.db'));
    const router = new SubStorageRouter(mainStore);
    router.registerSubStore({ name: 'a', store: s1 });
    router.registerSubStore({ name: 'b', store: s2 });

    expect(router.listSubStores()).toEqual(['a', 'b']);
    expect(router.getStoreByName('a')).toBe(s1);
    expect(router.getStoreByName('nonexistent')).toBeUndefined();
    expect(router.size).toBe(2);
    expect(router.getAllStores()).toHaveLength(3);
    s1.close();
    s2.close();
  });

  it('skips sub-stores that are not ready (migrating)', () => {
    const subStore = new SQLiteStore(path.join(tmpDir, 'sub.db'));
    const router = new SubStorageRouter(mainStore);
    router.registerSubStore({ name: 'vip', store: subStore, routingFilter: { scope: 'vip' } });

    // Mark as migrating — not ready
    router.migrationManager.markMigrating('vip', 100);
    expect(router.routeToStore({ scope: 'vip' })).toBe(mainStore); // falls back
    subStore.close();
  });

  it('migration moves records and tracks progress', async () => {
    const subStore = new SQLiteStore(path.join(tmpDir, 'sub.db'));
    const router = new SubStorageRouter(mainStore);
    router.registerSubStore({ name: 'vip', store: subStore, routingFilter: { scope: 'vip' } });

    // Seed main store
    const now = new Date().toISOString();
    await mainStore.insert('v1', [1, 2, 3], { data: 'vip1', scope: 'vip', created_at: now, updated_at: now, metadata: {} });
    await mainStore.insert('v2', [4, 5, 6], { data: 'vip2', scope: 'vip', created_at: now, updated_at: now, metadata: {} });
    await mainStore.insert('r1', [7, 8, 9], { data: 'regular', scope: 'general', created_at: now, updated_at: now, metadata: {} });

    const result = await router.migrateToSubStore('vip', { deleteSource: true });
    expect(result.migratedCount).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.status).toBe('completed');
    expect(await mainStore.count()).toBe(1); // only regular left
    expect(await subStore.count()).toBe(2);

    const status = router.getMigrationStatus('vip')!;
    expect(status.startedAt).toBeTruthy();
    expect(status.completedAt).toBeTruthy();

    subStore.close();
  });

  it('throws on unknown sub-store migration', async () => {
    const router = new SubStorageRouter(mainStore);
    await expect(router.migrateToSubStore('nonexistent')).rejects.toThrow('not registered');
  });
});
