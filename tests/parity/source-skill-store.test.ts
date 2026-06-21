/**
 * Parity tests: round 5 SQLiteSourceStore + SQLiteSkillStore real implementations.
 *
 * Validates that the abstract SourceStoreBase / SkillStoreBase contracts work
 * end-to-end against the SQLite backend without needing OceanBase. The same
 * tests will pass against any future OceanBase implementation that satisfies
 * the same contract.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { SQLiteSourceStore } from '../../src/powermem/storage/source_store/sqlite.js';
import { SQLiteSkillStore } from '../../src/powermem/storage/skill_store/sqlite.js';

describe('parity / SQLiteSourceStore (round 5 real impl)', () => {
  let store: SQLiteSourceStore | undefined;

  afterEach(async () => {
    if (store) await store.close();
    store = undefined;
  });

  it('createSource + getSource roundtrip', async () => {
    store = new SQLiteSourceStore();
    const created = await store.createSource({
      sourceType: 'conversation',
      content: 'user asked about deployment',
      userId: 'u1',
      agentId: 'a1',
      metadata: { turn: 3 },
    });
    expect(created.id).toBeTruthy();
    expect(created.sourceType).toBe('conversation');
    const fetched = await store.getSource(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.content).toBe('user asked about deployment');
    expect(fetched!.metadata?.turn).toBe(3);
  });

  it('getSource returns null for non-existent id', async () => {
    store = new SQLiteSourceStore();
    expect(await store.getSource('no-such-source')).toBeNull();
  });

  it('linkMemory + getMemoriesForSource + unlink', async () => {
    store = new SQLiteSourceStore();
    const src = await store.createSource({ sourceType: 'msg', content: 'hello' });
    expect(await store.linkMemory(src.id, 'mem-1')).toBe(true);
    // Idempotent — second call should report false.
    expect(await store.linkMemory(src.id, 'mem-1')).toBe(false);
    await store.linkMemory(src.id, 'mem-2');
    expect(await store.getMemoriesForSource(src.id)).toEqual(['mem-1', 'mem-2']);
    expect(await store.unlinkMemory(src.id, 'mem-1')).toBe(true);
    expect(await store.unlinkMemory(src.id, 'mem-1')).toBe(false);
    expect(await store.getMemoriesForSource(src.id)).toEqual(['mem-2']);
  });

  it('linkSkill + getSkillsForSource', async () => {
    store = new SQLiteSourceStore();
    const src = await store.createSource({ sourceType: 'doc', content: 'docs' });
    expect(await store.linkSkill(src.id, 'skill-1')).toBe(true);
    expect(await store.linkSkill(src.id, 'skill-2')).toBe(true);
    expect(await store.getSkillsForSource(src.id)).toEqual(['skill-1', 'skill-2']);
  });

  it('getSourcesForMemory / getSourcesForSkill return records', async () => {
    store = new SQLiteSourceStore();
    const src1 = await store.createSource({ sourceType: 'a', content: 'a' });
    const src2 = await store.createSource({ sourceType: 'b', content: 'b' });
    await store.linkMemory(src1.id, 'mem-x');
    await store.linkMemory(src2.id, 'mem-x');
    const sourcesForMem = await store.getSourcesForMemory('mem-x');
    expect(sourcesForMem).toHaveLength(2);
    expect(sourcesForMem.map((s) => s.id).sort()).toEqual([src1.id, src2.id].sort());
  });

  it('deleteSource cascades links', async () => {
    store = new SQLiteSourceStore();
    const src = await store.createSource({ sourceType: 'temp', content: 'tmp' });
    await store.linkMemory(src.id, 'mem-z');
    await store.linkSkill(src.id, 'skill-z');
    expect(await store.deleteSource(src.id)).toBe(true);
    expect(await store.getSource(src.id)).toBeNull();
    expect(await store.getMemoriesForSource(src.id)).toEqual([]);
    expect(await store.getSkillsForSource(src.id)).toEqual([]);
  });

  it('deleteSource on non-existent id returns false', async () => {
    store = new SQLiteSourceStore();
    expect(await store.deleteSource('no-such')).toBe(false);
  });

  it('scope columns are persisted', async () => {
    store = new SQLiteSourceStore();
    const src = await store.createSource({
      sourceType: 'm',
      content: 'c',
      userId: 'user-1',
      agentId: 'agent-1',
      runId: 'run-1',
      actorId: 'actor-1',
    });
    const fetched = await store.getSource(src.id);
    expect(fetched!.userId).toBe('user-1');
    expect(fetched!.agentId).toBe('agent-1');
    expect(fetched!.runId).toBe('run-1');
    expect(fetched!.actorId).toBe('actor-1');
  });
});

describe('parity / SQLiteSkillStore (round 5 real impl)', () => {
  let store: SQLiteSkillStore | undefined;

  afterEach(async () => {
    if (store) await store.close();
    store = undefined;
  });

  it('add + get roundtrip', async () => {
    store = new SQLiteSkillStore();
    const created = await store.add({
      title: 'Deploy app',
      description: 'Standard deploy flow',
      tags: ['deploy', 'ops'],
      procedureData: { steps: ['push', 'verify'] },
      titleEmbedding: [0.1, 0.2, 0.3],
      userId: 'u1',
    });
    expect(created.id).toBeTruthy();
    expect(created.status).toBe('active');
    const fetched = await store.get(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe('Deploy app');
    expect(fetched!.tags).toEqual(['deploy', 'ops']);
  });

  it('get returns null for non-existent id', async () => {
    store = new SQLiteSkillStore();
    expect(await store.get('no-such')).toBeNull();
  });

  it('update changes title/description/tags', async () => {
    store = new SQLiteSkillStore();
    const created = await store.add({ title: 'old', description: 'old desc' });
    const ok = await store.update({
      skillId: created.id,
      title: 'new title',
      description: 'new desc',
      tags: ['updated'],
    });
    expect(ok).toBe(true);
    const fetched = await store.get(created.id);
    expect(fetched!.title).toBe('new title');
    expect(fetched!.tags).toEqual(['updated']);
  });

  it('update returns false for non-existent skill', async () => {
    store = new SQLiteSkillStore();
    expect(await store.update({ skillId: 'no-such', title: 'x' })).toBe(false);
  });

  it('search ranks by vector similarity', async () => {
    store = new SQLiteSkillStore();
    await store.add({
      title: 'cook pasta',
      description: 'boil water add pasta',
      titleEmbedding: [1, 0, 0],
    });
    await store.add({
      title: 'ride bike',
      description: 'pedal forward',
      titleEmbedding: [0, 1, 0],
    });
    const hits = await store.search({ queryEmbedding: [1, 0, 0], limit: 2 });
    expect(hits).toHaveLength(2);
    expect(hits[0].title).toBe('cook pasta');
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it('search filters by userId', async () => {
    store = new SQLiteSkillStore();
    await store.add({ title: 'a', description: 'a', userId: 'u1' });
    await store.add({ title: 'b', description: 'b', userId: 'u2' });
    const hits = await store.search({ userId: 'u1' });
    expect(hits).toHaveLength(1);
    expect(hits[0].userId).toBe('u1');
  });

  it('updateStatus flips status', async () => {
    store = new SQLiteSkillStore();
    const created = await store.add({ title: 's', description: 's' });
    expect(await store.updateStatus(created.id, 'approved')).toBe(true);
    const fetched = await store.get(created.id);
    expect(fetched!.status).toBe('approved');
  });

  it('updateStatus filters via statusFilter', async () => {
    store = new SQLiteSkillStore();
    const a = await store.add({ title: 's1', description: 'd' });
    await store.add({ title: 's2', description: 'd' });
    await store.updateStatus(a.id, 'approved');
    const approvedHits = await store.search({ statusFilter: 'approved' });
    expect(approvedHits).toHaveLength(1);
    expect(approvedHits[0].id).toBe(a.id);
  });

  it('delete removes the skill', async () => {
    store = new SQLiteSkillStore();
    const created = await store.add({ title: 'tmp', description: 'tmp' });
    expect(await store.delete(created.id)).toBe(true);
    expect(await store.get(created.id)).toBeNull();
  });

  it('delete returns false for non-existent skill', async () => {
    store = new SQLiteSkillStore();
    expect(await store.delete('no-such')).toBe(false);
  });
});
